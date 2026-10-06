import { describe, expect, it, vi } from "vitest";
import { binReminder } from "../src/bins.js";
import { countdownsFrom, DisplayService } from "../src/display-service.js";
import { isMultiDay, withoutCountdownTag } from "../src/events.js";
import { OpenMeteoProvider } from "../src/open-meteo-provider.js";
import { summariseWeather } from "../src/weather-summary.js";

const event = (id: string, title: string, start: string, end: string, allDay = false) => ({ id, title, start, end, allDay, group: "all" as const, location: "" });

describe("bin reminder", () => {
  it.each([
    ["2026-10-06", "recycling", "2026-10-07"],
    ["2026-10-13", "general", "2026-10-14"],
    ["2026-10-20", "recycling", "2026-10-21"],
    ["2026-09-29", "general", "2026-09-30"],
    ["2027-03-30", "general", "2027-03-31"]
  ] as const)("reminds on Tuesday %s to put the %s bins out", (today, bin, collectionDate) => {
    expect(binReminder(today)).toEqual({ bin, collectionDate });
  });
  it.each(["2026-10-05", "2026-10-07", "2026-10-11"])("stays quiet on %s", (today) => expect(binReminder(today)).toBeNull());
});

describe("weather summary", () => {
  const hours = (temps: (hour: number) => number, rain: (hour: number) => number) => Array.from({ length: 24 }, (_, hour) => ({ hour, tempC: temps(hour), precipitationChance: rain(hour) }));

  it("bases the outfit and rain chance on waking hours rather than the night", () => {
    const summary = summariseWeather({ tempMaxC: 15, tempMinC: 2, precipitationChance: 90, weatherCode: 61, sunrise: "07:08", sunset: "18:29", hours: hours((hour) => hour < 7 ? 2 : 13, (hour) => hour < 7 ? 90 : 10) });
    expect(summary).toEqual({ tempMaxC: 15, tempMinC: 2, precipitationChance: 10, rainFrom: null, sunrise: "07:08", sunset: "18:29", condition: "rain", outfit: "hoodie" });
  });
  it("uses the middle of the day's range so a cold morning and warm afternoon balance out", () => {
    expect(summariseWeather({ tempMaxC: 26, precipitationChance: 0, weatherCode: 0, hours: hours((hour) => hour < 12 ? 16 : 26, () => 0) }).outfit).toBe("tshirt");
    expect(summariseWeather({ tempMaxC: 15, precipitationChance: 0, weatherCode: 0, hours: hours((hour) => hour < 12 ? 9 : 15, () => 0) }).outfit).toBe("hoodie");
  });
  it("reports when rain becomes likely, from the current hour onwards", () => {
    const raw = { tempMaxC: 15, precipitationChance: 80, weatherCode: 61, hours: hours(() => 12, (hour) => hour === 9 || hour >= 15 ? 80 : 5) };
    expect(summariseWeather(raw).rainFrom).toBe("09:00");
    expect(summariseWeather(raw, 11).rainFrom).toBe("15:00");
    expect(summariseWeather(raw, 21).rainFrom).toBeNull();
  });
  it("falls back to daily values when hourly data is missing", () => {
    expect(summariseWeather({ tempMaxC: 20.04, precipitationChance: 51, weatherCode: 61 })).toEqual({ tempMaxC: 20, tempMinC: null, precipitationChance: 51, rainFrom: null, sunrise: null, sunset: null, condition: "rain", outfit: "raincoat" });
  });
});

describe("Open-Meteo details", () => {
  it("requests and groups lows, daylight and hourly readings by date", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      daily: { time: ["2026-10-06"], temperature_2m_max: [15.2], temperature_2m_min: [6.1], precipitation_probability_max: [70], weather_code: [61], sunrise: ["2026-10-06T07:08"], sunset: ["2026-10-06T18:29"] },
      hourly: { time: ["2026-10-06T08:00", "2026-10-06T15:00"], temperature_2m: [9, 14], precipitation_probability: [10, 70] }
    }), { status: 200 }));
    const weather = await new OpenMeteoProvider(51, -0.1, fetcher).load("2026-10-06", "2026-10-12");
    expect(weather.get("2026-10-06")).toEqual({ tempMaxC: 15.2, tempMinC: 6.1, precipitationChance: 70, weatherCode: 61, sunrise: "07:08", sunset: "18:29", hours: [{ hour: 8, tempC: 9, precipitationChance: 10 }, { hour: 15, tempC: 14, precipitationChance: 70 }] });
    const url = String(fetcher.mock.calls[0]?.[0]);
    expect(url).toContain("temperature_2m_min");
    expect(url).toContain("hourly=temperature_2m%2Cprecipitation_probability");
  });
  it("rejects mismatched hourly arrays", async () => {
    const fetcher = async () => new Response(JSON.stringify({
      daily: { time: ["2026-10-06"], temperature_2m_max: [15], precipitation_probability_max: [70], weather_code: [61] },
      hourly: { time: ["2026-10-06T08:00"], temperature_2m: [], precipitation_probability: [10] }
    }), { status: 200 });
    await expect(new OpenMeteoProvider(51, -0.1, fetcher).load("2026-10-06", "2026-10-12")).rejects.toThrow("Weather data unavailable");
  });
});

describe("multi-day and countdown events", () => {
  it("treats only all-day runs and day-long events as multi-day", () => {
    expect(isMultiDay(event("a", "Trip", "2026-10-09T00:00:00+01:00", "2026-10-12T00:00:00+01:00", true))).toBe(true);
    expect(isMultiDay(event("b", "Day off", "2026-10-09T00:00:00+01:00", "2026-10-10T00:00:00+01:00", true))).toBe(false);
    expect(isMultiDay(event("c", "Late party", "2026-10-09T21:00:00+01:00", "2026-10-10T01:00:00+01:00"))).toBe(false);
    expect(isMultiDay(event("d", "Conference", "2026-10-09T09:00:00+01:00", "2026-10-11T17:00:00+01:00"))).toBe(true);
  });
  it("removes the countdown tag from titles", () => {
    expect(withoutCountdownTag(event("a", "Half term #Countdown", "2026-10-26T00:00:00Z", "2026-10-27T00:00:00Z", true)).title).toBe("Half term");
    expect(withoutCountdownTag(event("b", "#countdown", "2026-10-26T00:00:00Z", "2026-10-27T00:00:00Z", true)).title).toBe("Untitled event");
    expect(withoutCountdownTag(event("c", "Bake #countdowns", "2026-10-26T00:00:00Z", "2026-10-27T00:00:00Z", true)).title).toBe("Bake #countdowns");
  });
  it("lists the nearest tagged events from today onwards", () => {
    const countdowns = countdownsFrom([
      event("past", "Old trip #countdown", "2026-10-01T00:00:00+01:00", "2026-10-02T00:00:00+01:00", true),
      event("plain", "Untagged", "2026-10-10T00:00:00+01:00", "2026-10-11T00:00:00+01:00", true),
      event("xmas", "Christmas #countdown", "2026-12-25T00:00:00Z", "2026-12-26T00:00:00Z", true),
      event("today", "Party #countdown", "2026-10-06T18:00:00+01:00", "2026-10-06T21:00:00+01:00"),
      event("half", "Half term #countdown", "2026-10-26T00:00:00Z", "2026-10-31T00:00:00Z", true),
      event("far", "Next summer #countdown", "2027-07-01T00:00:00+01:00", "2027-07-02T00:00:00+01:00", true)
    ], "2026-10-06");
    expect(countdowns.map(({ title, daysAway }) => [title, daysAway])).toEqual([["Party", 0], ["Half term", 20], ["Christmas", 80]]);
  });
});

describe("display service upgrades", () => {
  const tuesday = () => new Date("2026-10-06T08:40:00Z");
  const trip = event("evt_trip", "Cornwall trip", "2026-10-05T00:00:00+01:00", "2026-10-09T00:00:00+01:00", true);
  const dentist = event("evt_dentist", "Dentist", "2026-10-07T11:00:00+01:00", "2026-10-07T11:30:00+01:00");

  it("moves multi-day events out of the upcoming day lists while keeping them on today", async () => {
    const result = await new DisplayService({ load: async () => [trip, dentist] }, { load: async () => new Map() }, { clock: tuesday }).getToday();
    expect(result.payload.multiDay).toEqual([{ ...trip, firstDate: "2026-10-05", lastDate: "2026-10-08" }]);
    expect(result.payload.days[0]?.events.map(({ id }) => id)).toEqual(["evt_trip"]);
    expect(result.payload.days[1]?.events.map(({ id }) => id)).toEqual(["evt_dentist"]);
    expect(result.payload.yesterday.events.map(({ id }) => id)).toEqual(["evt_trip"]);
  });
  it("adds the bin reminder and countdowns without making them calendar-critical", async () => {
    const countdownCalendar = { load: vi.fn(async () => [event("evt_half", "Half term #countdown", "2026-10-26T00:00:00Z", "2026-10-31T00:00:00Z", true)]) };
    const calendar = { load: async () => [event("evt_half_day", "Half term #countdown", "2026-10-06T09:00:00+01:00", "2026-10-06T10:00:00+01:00")] };
    const result = await new DisplayService(calendar, { load: async () => new Map() }, { clock: tuesday, countdownCalendar }).getToday();
    expect(result.payload.binReminder).toEqual({ bin: "recycling", collectionDate: "2026-10-07" });
    expect(result.payload.countdowns).toEqual([{ id: "evt_half", title: "Half term", date: "2026-10-26", daysAway: 20, group: "all" }]);
    expect(result.payload.days[0]?.events[0]?.title).toBe("Half term");
    expect(countdownCalendar.load).toHaveBeenCalledWith("2026-10-05T00:00:00.000+01:00", "2027-04-05T00:00:00.000+01:00");
    expect(result.stale).toBe(false);
  });
  it("keeps the board usable and stale when the countdown lookup fails", async () => {
    const countdownCalendar = { load: async (): Promise<never> => { throw new Error("private"); } };
    const result = await new DisplayService({ load: async () => [dentist] }, { load: async () => new Map() }, { clock: tuesday, countdownCalendar }).getToday();
    expect(result.payload.countdowns).toEqual([]);
    expect(result.stale).toBe(true);
  });
  it("keeps the last successful calendar time while serving stale events", async () => {
    let current = tuesday();
    let fail = false;
    const service = new DisplayService({ load: async () => { if (fail) throw new Error("private"); return [dentist]; } }, { load: async () => new Map() }, { clock: () => current, calendarTtlMs: 0 });
    await service.getToday();
    fail = true;
    current = new Date("2026-10-06T10:40:00Z");
    const result = await service.getToday();
    expect(result.stale).toBe(true);
    expect(result.payload.generatedAt).toBe("2026-10-06T11:40:00+01:00");
    expect(result.payload.calendarUpdatedAt).toBe("2026-10-06T09:40:00+01:00");
  });
  it("reports rain timing for today from the current hour", async () => {
    const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, tempC: 12, precipitationChance: hour === 8 || hour >= 15 ? 80 : 0 }));
    const weather = { load: async () => new Map([["2026-10-06", { tempMaxC: 14, precipitationChance: 80, weatherCode: 61, hours }], ["2026-10-07", { tempMaxC: 14, precipitationChance: 80, weatherCode: 61, hours }]]) };
    const result = await new DisplayService({ load: async () => [] }, weather, { clock: tuesday }).getToday();
    expect(result.payload.days[0]?.weather?.rainFrom).toBe("15:00");
    expect(result.payload.days[1]?.weather?.rainFrom).toBe("08:00");
  });
});
