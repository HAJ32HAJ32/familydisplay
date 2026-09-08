import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { chooseOutfit } from "../src/outfit.js";
import { createDateWindow } from "../src/date-window.js";
import { parseConfig } from "../src/config.js";
import { groupEventsByDate, normalizeGoogleEvent, sortEvents } from "../src/events.js";
import { RefreshCache } from "../src/cache.js";
import { DisplayDataUnavailableError, DisplayService, weatherCondition } from "../src/display-service.js";
import { buildServer } from "../src/server.js";
import { GoogleCalendarProvider } from "../src/google-calendar-provider.js";
import { OpenMeteoProvider } from "../src/open-meteo-provider.js";
import { SousMealProvider } from "../src/sous-meal-provider.js";
import { MorningQuoteProvider } from "../src/morning-quote-provider.js";

const validEnv = {
  APP_TIMEZONE: "Europe/London", DISPLAY_LATITUDE: "51", DISPLAY_LONGITUDE: "-0.1",
  GOOGLE_CLIENT_ID: "client", GOOGLE_CLIENT_SECRET: "secret", GOOGLE_REFRESH_TOKEN: "refresh",
  GOOGLE_CALENDAR_FAMILY: "family-calendar", GOOGLE_CALENDAR_BAES: "baes-calendar", EVENT_ID_SALT: "salt"
};
const mapping = { calendarId: "private-calendar", defaultGroup: "rafe" as const };
const occurrence = { id: "evt_1", title: "Lunch", start: "2026-08-27T12:00:00+01:00", end: "2026-08-27T13:00:00+01:00", allDay: false, group: "all" as const, location: "" };
const clock = () => new Date("2026-08-27T12:00:00Z");

describe("outfit rules", () => {
  it.each([[21, 51, "raincoat"], [21, 50, "tshirt"], [20.1, 0, "tshirt"], [20, 0, "long-sleeve"], [14, 0, "long-sleeve"], [13.9, 0, "hoodie"], [8, 0, "hoodie"], [7.9, 0, "coat"]])("maps boundary values", (temp, rain, expected) => expect(chooseOutfit(temp as number, rain as number)).toBe(expected));
});

describe("date window", () => {
  it("creates yesterday and seven London dates", () => expect(createDateWindow(clock()).dates).toEqual(["2026-08-27", "2026-08-28", "2026-08-29", "2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02"]));
  it("handles DST boundaries", () => {
    expect(createDateWindow(new Date("2026-03-29T12:00:00Z")).from.toISO()).toBe("2026-03-28T00:00:00.000+00:00");
    expect(createDateWindow(new Date("2026-10-25T12:00:00Z")).to.toISO()).toBe("2026-11-01T00:00:00.000+00:00");
  });
});

describe("configuration", () => {
  it("creates the two source-calendar mappings with their default groups", () => {
    const config = parseConfig(validEnv);
    expect(config.calendars).toEqual([
      { calendarId: "family-calendar", defaultGroup: "all" },
      { calendarId: "baes-calendar", defaultGroup: "h-and-chantele" }
    ]);
    expect(config.host).toBe("127.0.0.1");
  });
  it.each(["100.64.0.1", "100.127.255.254"])("accepts a Tailscale IPv4 bind address", (host) => {
    expect(parseConfig({ ...validEnv, HOST: host }).host).toBe(host);
  });
  it("enables Sous only when its URL and token are both configured", () => {
    expect(parseConfig({ ...validEnv, SOUS_MEALS_URL: "https://example.test/display-meals", SOUS_MEALS_TOKEN: "feed-token" }).sous).toEqual({ url: "https://example.test/display-meals", token: "feed-token" });
    expect(() => parseConfig({ ...validEnv, SOUS_MEALS_URL: "https://example.test/display-meals" })).toThrow("Invalid server configuration");
  });
  it("enables the morning quote only with a complete HTTPS endpoint configuration", () => {
    expect(parseConfig({ ...validEnv, MORNING_QUOTE_URL: "https://example.test/morning-quote", MORNING_QUOTE_TOKEN: "quote-token" }).morningQuote).toEqual({ url: "https://example.test/morning-quote", token: "quote-token" });
    expect(() => parseConfig({ ...validEnv, MORNING_QUOTE_URL: "https://example.test/morning-quote" })).toThrow("Invalid server configuration");
    expect(() => parseConfig({ ...validEnv, MORNING_QUOTE_URL: "http://example.test/morning-quote", MORNING_QUOTE_TOKEN: "quote-token" })).toThrow("Invalid server configuration");
  });
  it.each(["0.0.0.0", "192.168.1.5", "8.8.8.8", "localhost", "100.63.255.255", "100.128.0.0", "100.064.0.1", "100.64.0.1:3000", "100.64.0.1.example"])("rejects unsafe bind host %s", (host) => {
    expect(() => parseConfig({ ...validEnv, HOST: host })).toThrow("Invalid server configuration");
  });
  it.each([
    { ...validEnv, GOOGLE_CLIENT_SECRET: "" },
    { ...validEnv, GOOGLE_CLIENT_SECRET: "   " },
    { ...validEnv, DISPLAY_LATITUDE: "" },
    { ...validEnv, GOOGLE_CALENDAR_FAMILY: undefined },
    { ...validEnv, GOOGLE_CALENDAR_BAES: "   " },
    { ...validEnv, GOOGLE_CALENDAR_BAES: "family-calendar" },
    { ...validEnv, APP_TIMEZONE: "UTC" },
    { ...validEnv, DISPLAY_LATITUDE: "91" }
  ])("rejects invalid or duplicate values without exposing them", (env) => expect(() => parseConfig(env)).toThrow("Invalid server configuration"));
});

describe("event processing", () => {
  const timedRawEvent = { id: "provider-id", summary: "Event", start: { dateTime: "2026-08-27T08:30:00+01:00" }, end: { dateTime: "2026-08-27T09:00:00+01:00" } };

  it.each([
    ["Grape", "3", "h-and-chantele"],
    ["Blueberry", "9", "all"],
    ["Basil", "10", "rafe"],
    ["Graphite", "8", "h"],
    ["Banana", "5", "chantele"],
    ["Tangerine", "6", "household"]
  ] as const)("maps Google %s colour %s to %s", (_colorName, colorId, expected) => {
    expect(normalizeGoogleEvent(mapping, { ...timedRawEvent, colorId }, "salt")?.group).toBe(expected);
  });

  it.each([
    ["Family", { calendarId: "family-calendar", defaultGroup: "all" as const }, "all"],
    ["BAES", { calendarId: "baes-calendar", defaultGroup: "h-and-chantele" as const }, "h-and-chantele"]
  ] as const)("uses the %s source default for every other or missing colour", (_sourceName, source, expected) => {
    for (const colorId of [undefined, null, "1", "2", "4", "7", "11", "999"] as const) {
      expect(normalizeGoogleEvent(source, { ...timedRawEvent, colorId }, "salt")?.group).toBe(expected);
    }
  });

  it("normalizes safely and creates an opaque ID", () => {
    const result = normalizeGoogleEvent(mapping, { id: "provider-id", colorId: "6", summary: "  Nursery  ", location: " Hall ", status: "confirmed", start: { dateTime: "2026-08-27T08:30:00+01:00" }, end: { dateTime: "2026-08-27T09:00:00+01:00" }, description: "private", attendees: [{ email: "secret@example.com", responseStatus: "accepted", self: true }] }, "salt");
    expect(result).toMatchObject({ title: "Nursery", location: "Hall", group: "household", allDay: false });
    expect(result?.id).toMatch(/^evt_[a-f0-9]{20}$/);
    expect(JSON.stringify(result)).not.toContain("private-calendar");
    expect(Object.keys(result!)).toEqual(["id", "title", "start", "end", "allDay", "group", "location"]);
  });
  it("drops cancelled and self-declined events", () => {
    expect(normalizeGoogleEvent(mapping, { id: "1", status: "cancelled" }, "salt")).toBeNull();
    expect(normalizeGoogleEvent(mapping, { id: "2", attendees: [{ self: true, responseStatus: "declined" }] }, "salt")).toBeNull();
  });
  it("normalizes all-day events and groups multi-day overlaps", () => {
    const allDay = normalizeGoogleEvent(mapping, { id: "1", summary: " ", start: { date: "2026-08-27" }, end: { date: "2026-08-29" } }, "salt")!;
    expect(allDay).toMatchObject({ title: "Untitled event", start: "2026-08-27T00:00:00+01:00", end: "2026-08-29T00:00:00+01:00", allDay: true });
    expect([...groupEventsByDate([allDay], ["2026-08-27", "2026-08-28", "2026-08-29"]).values()].map((events) => events.length)).toEqual([1, 1, 0]);
  });
  it("sorts all-day first with deterministic ties", () => {
    const base = { ...occurrence, id: "evt_c", title: "Beta" };
    const allDay = { ...base, id: "evt_z", start: "2026-08-27T00:00:00+01:00", end: "2026-08-28T00:00:00+01:00", allDay: true };
    expect(sortEvents([base, allDay, { ...base, id: "evt_a", title: "Alpha" }]).map((x) => x.id)).toEqual(["evt_z", "evt_a", "evt_c"]);
  });
});

describe("refresh cache", () => {
  it("coalesces concurrent loads and returns stale data after failure", async () => {
    let now = 0; let resolve!: (value: number) => void;
    const loader = vi.fn(() => new Promise<number>((done) => { resolve = done; }));
    const cache = new RefreshCache<number>(10, () => now);
    const one = cache.get(loader); const two = cache.get(loader); resolve(7);
    expect(await one).toEqual({ value: 7, stale: false }); expect(await two).toEqual({ value: 7, stale: false }); expect(loader).toHaveBeenCalledTimes(1);
    now = 20; expect(await cache.get(async () => { throw new Error("private upstream body"); })).toEqual({ value: 7, stale: true });
  });
  it("throws when no snapshot exists", async () => await expect(new RefreshCache<number>(10).get(async () => { throw new Error("down"); })).rejects.toThrow("down"));
});

describe("display service", () => {
  it.each([[85, "snow"], [86, "snow"]] as const)("normalizes WMO %s to %s", (code, expected) => {
    expect(weatherCondition(code)).toBe(expected);
  });

  it("assembles a valid payload with weather and meals reserved", async () => {
    const service = new DisplayService({ load: async () => [occurrence] }, { load: async () => new Map([["2026-08-27", { tempMaxC: 20.04, precipitationChance: 51, weatherCode: 61 }]]) }, { clock });
    const result = await service.getToday();
    expect(result.stale).toBe(false); expect(result.payload.days).toHaveLength(7);
    expect(result.payload.days[0]).toMatchObject({ isToday: true, weather: { tempMaxC: 20, precipitationChance: 51, condition: "rain", outfit: "raincoat" } });
    expect(result.payload.days.every((day) => day.meal === null)).toBe(true);
  });
  it("keeps calendars and marks stale when weather fails", async () => {
    const result = await new DisplayService({ load: async () => [occurrence] }, { load: async () => { throw new Error("weather"); } }, { clock }).getToday();
    expect(result.stale).toBe(true); expect(result.payload.days[0]?.events).toHaveLength(1); expect(result.payload.days[0]?.weather).toBeNull();
  });
  it("adds meals by explicit date without making them a calendar concern", async () => {
    const meals = { load: async () => new Map([["2026-08-27", { type: "recipe" as const, title: "Stir fry" }], ["2026-08-28", { type: "takeaway" as const }]]) };
    const result = await new DisplayService({ load: async () => [] }, { load: async () => new Map() }, { clock, meals }).getToday();
    expect(result.payload.days[0]?.meal).toEqual({ type: "recipe", title: "Stir fry" });
    expect(result.payload.days[1]?.meal).toEqual({ type: "takeaway" });
  });
  it("adds the optional morning quote for today's London date", async () => {
    const quote = { load: vi.fn(async () => ({ text: "Do the work in front of you.", attribution: "Marcus Aurelius" })) };
    const result = await new DisplayService({ load: async () => [] }, { load: async () => new Map() }, { clock, morningQuote: quote }).getToday();

    expect(quote.load).toHaveBeenCalledWith("2026-08-27");
    expect(result.payload.morningQuote).toEqual({ text: "Do the work in front of you.", attribution: "Marcus Aurelius" });
  });
  it("keeps calendar data visible when the optional quote endpoint is unavailable", async () => {
    const morningQuote = { load: async (): Promise<never> => { throw new Error("private quote detail"); } };
    const result = await new DisplayService({ load: async () => [occurrence] }, { load: async () => new Map() }, { clock, morningQuote }).getToday();

    expect(result.payload.days[0]?.events).toHaveLength(1);
    expect(result.payload.morningQuote).toBeNull();
    expect(result.stale).toBe(true);
  });
  it("keeps the board usable and marks it stale when Sous is unavailable", async () => {
    const meals = { load: async (): Promise<never> => { throw new Error("private Sous detail"); } };
    const result = await new DisplayService({ load: async () => [occurrence] }, { load: async () => new Map() }, { clock, meals }).getToday();
    expect(result.stale).toBe(true);
    expect(result.payload.days[0]?.events).toHaveLength(1);
    expect(result.payload.days.every((day) => day.meal === null)).toBe(true);
  });
  it("keeps cached meals visible and marks them stale when a refresh fails", async () => {
    let mealCalls = 0;
    const meals = { load: async () => {
      mealCalls += 1;
      if (mealCalls > 1) throw new Error("private Sous detail");
      return new Map([["2026-08-27", { type: "recipe" as const, title: "Stir fry" }]]);
    } };
    const service = new DisplayService({ load: async () => [] }, { load: async () => new Map() }, { clock, meals, mealTtlMs: 0 });

    await service.getToday();
    const result = await service.getToday();

    expect(mealCalls).toBe(2);
    expect(result.payload.days[0]?.meal).toEqual({ type: "recipe", title: "Stir fry" });
    expect(result.stale).toBe(true);
  });
  it("preserves overlapping cached meals when the date window rolls over and Sous fails", async () => {
    let current = new Date("2026-08-27T22:59:00Z");
    let mealCalls = 0;
    const meals = { load: async () => {
      mealCalls += 1;
      if (mealCalls > 1) throw new Error("private Sous detail");
      return new Map([
        ["2026-08-27", { type: "recipe" as const, title: "Thursday meal" }],
        ["2026-08-28", { type: "recipe" as const, title: "Friday meal" }],
        ["2026-08-29", { type: "recipe" as const, title: "Saturday meal" }],
        ["2026-08-30", { type: "recipe" as const, title: "Sunday meal" }],
        ["2026-08-31", { type: "recipe" as const, title: "Monday meal" }],
        ["2026-09-01", { type: "recipe" as const, title: "Tuesday meal" }],
        ["2026-09-02", { type: "recipe" as const, title: "Wednesday meal" }],
      ]);
    } };
    const service = new DisplayService(
      { load: async () => [] },
      { load: async () => new Map() },
      { clock: () => current, meals, mealTtlMs: 300_000 }
    );

    await service.getToday();
    current = new Date("2026-08-27T23:01:00Z");
    const result = await service.getToday();

    expect(mealCalls).toBe(2);
    expect(result.payload.days.map((day) => [day.date, day.meal && "title" in day.meal ? day.meal.title : null])).toEqual([
      ["2026-08-28", "Friday meal"],
      ["2026-08-29", "Saturday meal"],
      ["2026-08-30", "Sunday meal"],
      ["2026-08-31", "Monday meal"],
      ["2026-09-01", "Tuesday meal"],
      ["2026-09-02", "Wednesday meal"],
      ["2026-09-03", null],
    ]);
    expect(result.stale).toBe(true);
  });
  it("returns last complete payload when calendar refresh fails", async () => {
    let fail = false;
    const service = new DisplayService({ load: async () => { if (fail) throw new Error("private"); return [occurrence]; } }, { load: async () => new Map() }, { clock, calendarTtlMs: 0 });
    const first = await service.getToday(); fail = true; expect(await service.getToday()).toEqual({ payload: first.payload, stale: true });
  });
  it("refreshes both provider caches when the London date changes", async () => {
    let current = new Date("2026-08-27T22:59:00Z");
    let calendarCalls = 0;
    let weatherCalls = 0;
    const horizonEvent = { ...occurrence, id: "evt_horizon", start: "2026-09-03T12:00:00+01:00", end: "2026-09-03T13:00:00+01:00" };
    const service = new DisplayService(
      { load: async () => { calendarCalls += 1; return calendarCalls === 1 ? [] : [horizonEvent]; } },
      { load: async () => { weatherCalls += 1; return new Map(); } },
      { clock: () => current, calendarTtlMs: 300_000, weatherTtlMs: 1_800_000 }
    );

    await service.getToday();
    current = new Date("2026-08-27T23:01:00Z");
    const nextDay = await service.getToday();

    expect(calendarCalls).toBe(2);
    expect(weatherCalls).toBe(2);
    expect(nextDay.payload.days[6]).toMatchObject({ date: "2026-09-03", events: [horizonEvent] });
    expect(nextDay.stale).toBe(false);
  });
});

describe("provider adapters", () => {
  it("paginates Google occurrences with read-only query boundaries", async () => {
    const list = vi.fn(async ({ pageToken }: { pageToken?: string }) => ({ data: pageToken ? { items: [{ id: "two", summary: "Second", start: { date: "2026-08-28" }, end: { date: "2026-08-29" } }] } : { items: [{ id: "one", summary: "First", start: { dateTime: "2026-08-27T09:00:00+01:00" }, end: { dateTime: "2026-08-27T10:00:00+01:00" } }], nextPageToken: "next" } }));
    const provider = new GoogleCalendarProvider([mapping], "salt", { events: { list } });
    const events = await provider.load("2026-08-26T00:00:00+01:00", "2026-09-03T00:00:00+01:00");
    expect(events).toHaveLength(2); expect(list).toHaveBeenCalledTimes(2);
    expect(list.mock.calls[0]?.[0]).toMatchObject({ calendarId: "private-calendar", singleEvents: true, timeZone: "Europe/London", timeMin: "2026-08-26T00:00:00+01:00", timeMax: "2026-09-03T00:00:00+01:00" });
  });
  it("times out a non-settling Google request and aborts it", async () => {
    let signal: AbortSignal | undefined;
    const list = vi.fn((_args: unknown, options?: { signal?: AbortSignal }) => {
      signal = options?.signal;
      return new Promise<never>(() => undefined);
    });
    const provider = new GoogleCalendarProvider([mapping], "salt", { events: { list } }, 20);
    const outcome = Promise.race([
      provider.load("2026-08-26T00:00:00+01:00", "2026-09-03T00:00:00+01:00"),
      new Promise<string>((resolve) => setTimeout(() => resolve("still pending"), 100))
    ]);

    await expect(outcome).rejects.toThrow("Calendar data unavailable");
    expect(signal?.aborted).toBe(true);
  });
  it("normalizes Open-Meteo daily arrays by date", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ daily: { time: ["2026-08-27"], temperature_2m_max: [19.24], precipitation_probability_max: [44], weather_code: [2] } }), { status: 200 }));
    const weather = await new OpenMeteoProvider(51, -0.1, fetcher).load("2026-08-27", "2026-09-02");
    expect(weather.get("2026-08-27")).toEqual({ tempMaxC: 19.24, precipitationChance: 44, weatherCode: 2 });
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("weather_code");
    expect(String(fetcher.mock.calls[0]?.[0])).not.toContain("postcode");
  });
  it("accepts documented Open-Meteo response metadata", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      latitude: 51.3,
      longitude: -0.1,
      generationtime_ms: 0.04,
      utc_offset_seconds: 3600,
      timezone: "Europe/London",
      timezone_abbreviation: "BST",
      elevation: 159,
      daily_units: { time: "iso8601", temperature_2m_max: "°C", precipitation_probability_max: "%" },
      daily: { time: ["2026-08-27"], temperature_2m_max: [19.24], precipitation_probability_max: [44], weather_code: [2] }
    }), { status: 200 }));
    const weather = await new OpenMeteoProvider(51, -0.1, fetcher).load("2026-08-27", "2026-09-02");
    expect(weather.get("2026-08-27")).toEqual({ tempMaxC: 19.24, precipitationChance: 44, weatherCode: 2 });
  });
  it("rejects malformed weather responses", async () => {
    const fetcher = async () => new Response(JSON.stringify({ daily: { time: ["2026-08-27"], temperature_2m_max: [] } }), { status: 200 });
    await expect(new OpenMeteoProvider(51, -0.1, fetcher).load("2026-08-27", "2026-09-02")).rejects.toThrow("Weather data unavailable");
  });
  it("rejects an oversized Open-Meteo response before accepting its valid JSON", async () => {
    const body = `${" ".repeat(65_536)}${JSON.stringify({ daily: { time: ["2026-08-27"], temperature_2m_max: [19], precipitation_probability_max: [44], weather_code: [2] } })}`;
    const fetcher = async () => new Response(body, { status: 200 });

    await expect(new OpenMeteoProvider(51, -0.1, fetcher).load("2026-08-27", "2026-09-02")).rejects.toThrow("Weather data unavailable");
  });
  it("rejects an Open-Meteo response whose declared length exceeds the byte limit", async () => {
    const fetcher = async () => new Response(JSON.stringify({ daily: { time: [], temperature_2m_max: [], precipitation_probability_max: [], weather_code: [] } }), {
      status: 200,
      headers: { "Content-Length": "65537" },
    });

    await expect(new OpenMeteoProvider(51, -0.1, fetcher).load("2026-08-27", "2026-09-02")).rejects.toThrow("Weather data unavailable");
  });
  it.each([50, 97, 98])("rejects unsupported WMO code %s at the provider boundary", async (weatherCode) => {
    const fetcher = async () => new Response(JSON.stringify({ daily: { time: ["2026-08-27"], temperature_2m_max: [19], precipitation_probability_max: [44], weather_code: [weatherCode] } }), { status: 200 });

    await expect(new OpenMeteoProvider(51, -0.1, fetcher).load("2026-08-27", "2026-09-02")).rejects.toThrow("Weather data unavailable");
  });
  it("loads a redacted morning quote using only the requested date", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ text: "Do the work in front of you.", attribution: "Marcus Aurelius" }), { status: 200 }));
    const quote = await new MorningQuoteProvider("https://example.test/morning-quote", "quote-token", fetcher).load("2026-08-27");

    expect(quote).toEqual({ text: "Do the work in front of you.", attribution: "Marcus Aurelius" });
    const [input, init] = fetcher.mock.calls[0]!;
    expect(String(input)).toBe("https://example.test/morning-quote?date=2026-08-27");
    expect(init?.headers).toEqual({ Accept: "application/json", Authorization: "Bearer quote-token" });
    expect(init?.redirect).toBe("error");
  });
  it("rejects an oversized morning quote response before accepting its valid JSON", async () => {
    const padded = `${" ".repeat(65_536)}{\"text\":\"Do the work.\",\"attribution\":\"Marcus Aurelius\"}`;
    const fetcher = async () => new Response(padded, { status: 200 });

    await expect(new MorningQuoteProvider("https://example.test/morning-quote", "quote-token", fetcher).load("2026-08-27")).rejects.toThrow("Morning quote unavailable");
  });
  it("loads a redacted Sous meal feed by explicit date range", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ meals: [
      { date: "2026-08-27", type: "recipe", title: "Stir fry" },
      { date: "2026-08-28", type: "out" },
      { date: "2026-08-29", type: "takeaway" }
    ] }), { status: 200 }));
    const meals = await new SousMealProvider("https://example.test/display-meals", "feed-token", fetcher).load("2026-08-27", "2026-09-02");
    expect(meals.get("2026-08-27")).toEqual({ type: "recipe", title: "Stir fry" });
    expect(meals.get("2026-08-28")).toEqual({ type: "out" });
    const [input, init] = fetcher.mock.calls[0]!;
    expect(String(input)).toBe("https://example.test/display-meals?start_date=2026-08-27&end_date=2026-09-02");
    expect(init?.headers).toEqual({ Accept: "application/json", Authorization: "Bearer feed-token" });
  });
  it("rejects malformed, duplicate or oversized Sous meal feeds", async () => {
    const duplicate = async () => new Response(JSON.stringify({ meals: [{ date: "2026-08-27", type: "out" }, { date: "2026-08-27", type: "takeaway" }] }), { status: 200 });
    await expect(new SousMealProvider("https://example.test/display-meals", "token", duplicate).load("2026-08-27", "2026-09-02")).rejects.toThrow("Meal data unavailable");
    const oversized = async () => new Response(JSON.stringify({ meals: Array.from({ length: 8 }, (_, index) => ({ date: `2026-08-${String(20 + index).padStart(2, "0")}`, type: "out" })) }), { status: 200 });
    await expect(new SousMealProvider("https://example.test/display-meals", "token", oversized).load("2026-08-20", "2026-08-27")).rejects.toThrow("Meal data unavailable");
  });
  it("rejects a Sous response larger than the byte limit even when its JSON is valid", async () => {
    const padded = `${" ".repeat(65_536)}{\"meals\":[]}`;
    const fetcher = async () => new Response(padded, { status: 200 });

    await expect(new SousMealProvider("https://example.test/display-meals", "token", fetcher).load("2026-08-27", "2026-09-02")).rejects.toThrow("Meal data unavailable");
  });
});

 describe("HTTP routes", () => {
  const payload = { generatedAt: "2026-08-27T13:00:00+01:00", timezone: "Europe/London" as const, morningQuote: null, yesterday: { date: "2026-08-26", weekday: "Wed" as const, events: [] }, days: ["2026-08-27", "2026-08-28", "2026-08-29", "2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02"].map((date, i) => ({ date, weekday: ["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"][i]!, isToday: i === 0, weather: null, events: [], meal: null })) };
  it("serves provider-independent health", async () => { const app = await buildServer({ service: { getToday: async () => { throw new Error("must not run"); } } }); const response = await app.inject({ method: "GET", url: "/healthz" }); expect(response.json()).toEqual({ status: "ok" }); await app.close(); });
  it("serves today with freshness and no-store headers", async () => { const app = await buildServer({ service: { getToday: async () => ({ payload, stale: false }) } }); const response = await app.inject({ method: "GET", url: "/api/today" }); expect(response.statusCode).toBe(200); expect(response.headers["x-data-stale"]).toBe("false"); expect(response.headers["cache-control"]).toBe("no-store"); await app.close(); });
  it("returns a redacted 503 for provider availability failures", async () => { const app = await buildServer({ service: { getToday: async () => { throw new DisplayDataUnavailableError(); } } }); const response = await app.inject({ method: "GET", url: "/api/today" }); expect(response.statusCode).toBe(503); expect(response.body).not.toContain("google"); expect(response.json()).toEqual({ error: { code: "DISPLAY_DATA_UNAVAILABLE", message: "Display data is temporarily unavailable" } }); await app.close(); });
  it("returns a redacted 500 for unexpected failures", async () => { const app = await buildServer({ service: { getToday: async () => { throw new Error("google secret"); } } }); const response = await app.inject({ method: "GET", url: "/api/today" }); expect(response.statusCode).toBe(500); expect(response.body).not.toContain("google"); expect(response.json()).toEqual({ error: { code: "INTERNAL_ERROR", message: "Unexpected server error" } }); await app.close(); });
  it("rejects mutation routes", async () => { const app = await buildServer({ service: { getToday: async () => ({ payload, stale: false }) } }); expect((await app.inject({ method: "POST", url: "/api/today" })).statusCode).toBe(404); await app.close(); });
  it("serves the built frontend from the same origin", async () => {
    const webRoot = await mkdtemp(join(tmpdir(), "family-display-web-"));
    await writeFile(join(webRoot, "index.html"), "<!doctype html><title>Family Display</title>");
    const app = await buildServer({ service: { getToday: async () => ({ payload, stale: false }) }, webRoot });
    const response = await app.inject({ method: "GET", url: "/" });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("Family Display");
    await app.close();
    await rm(webRoot, { recursive: true });
  });
});
