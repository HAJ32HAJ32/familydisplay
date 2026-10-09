import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { scheduleDailyReload } from "./data/dailyReload";
import { payload } from "./test/fixture";

vi.mock("./data/dailyReload", () => ({ scheduleDailyReload: vi.fn(() => vi.fn()) }));

// 08:00 on the fixture's Thursday: nursery drop-off is next and nothing has finished.
const TEST_NOW = new Date("2026-08-27T08:00:00+01:00");

const response = (body: unknown, stale = false) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json", "X-Data-Stale": String(stale) },
  });

describe("Family Display", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ["Date"], now: TEST_NOW });
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("moves from its dark loading shell to the complete display", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(payload));

    const { container } = render(<App />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading family calendar");
    expect(container.firstElementChild).toHaveClass("app-shell");

    expect(await screen.findByRole("heading", { name: "Today · Thu 27 August" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Yesterday · Wed 26 August" })).toBeVisible();
    expect(screen.getAllByTestId("future-day")).toHaveLength(6);
    expect(screen.getByText("Updated 18:42")).toBeVisible();
  });

  it("stacks each future weekday above its date beside compact weather with the meal below", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(payload));
    render(<App />);

    const future = (await screen.findAllByTestId("future-day"))[0]!;
    const summary = future.querySelector(".future-day__summary")!;
    const date = summary.querySelector(".future-day__date");
    expect(date).not.toBeNull();
    expect(date).toHaveTextContent("Fri28");
    expect(date?.nextElementSibling).toHaveClass("weather--compact");
    expect(summary.lastElementChild).toHaveClass("meal");
  });

  it("migrates a pre-football v2 snapshot before an offline cold start", async () => {
    const previousPayload: Record<string, unknown> = { ...payload };
    delete previousPayload.nextMatch;
    localStorage.setItem("family-display:last-good:v2", JSON.stringify({ payload: previousPayload, receivedAt: "2026-08-27T18:42:00+01:00" }));
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("offline"));

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Today · Thu 27 August" })).toBeVisible();
    expect(screen.queryByLabelText(/Next West Ham match:/)).not.toBeInTheDocument();
    expect(screen.getByText("Last updated 18:42 · offline")).toBeVisible();
  });

  it("renders a valid browser snapshot as stale on an offline cold start", async () => {
    localStorage.setItem("family-display:last-good:v2", JSON.stringify({ payload, receivedAt: "2026-08-27T18:42:00+01:00" }));
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("offline"));

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Today · Thu 27 August" })).toBeVisible();
    expect(screen.getByText("Last updated 18:42 · offline")).toBeVisible();
  });

  it("ignores and removes a pre-change cache payload while current startup succeeds", async () => {
    const legacyPayload: Record<string, unknown> = { ...payload };
    delete legacyPayload.morningQuote;
    localStorage.setItem("family-display:last-good:v1", JSON.stringify({ payload: legacyPayload, receivedAt: "2026-08-27T18:42:00+01:00" }));
    vi.mocked(fetch).mockResolvedValueOnce(response(payload));

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Today · Thu 27 August" })).toBeVisible();
    expect(localStorage.getItem("family-display:last-good:v1")).toBeNull();
    expect(localStorage.getItem("family-display:last-good:v2")).not.toBeNull();
  });

  it("migrates a pre-change cache payload before an offline cold start", async () => {
    const legacyPayload: Record<string, unknown> = {
      ...payload,
      days: payload.days.map((day) => ({
        ...day,
        weather: day.weather
          ? { tempMaxC: day.weather.tempMaxC, precipitationChance: day.weather.precipitationChance, outfit: day.weather.outfit }
          : null,
      })),
    };
    delete legacyPayload.morningQuote;
    localStorage.setItem("family-display:last-good:v1", JSON.stringify({ payload: legacyPayload, receivedAt: "2026-08-27T18:42:00+01:00" }));
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("offline"));

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Today · Thu 27 August" })).toBeVisible();
    expect(screen.getByText("Last updated 18:42 · offline")).toBeVisible();
    expect(screen.getByLabelText("Everyone: Family day, All day, at Home")).toBeVisible();
    expect(screen.queryByLabelText(/Thursday weather:/)).not.toBeInTheDocument();
    expect(localStorage.getItem("family-display:last-good:v1")).toBeNull();
    const migrated = JSON.parse(localStorage.getItem("family-display:last-good:v2")!);
    expect(migrated.payload.morningQuote).toBeNull();
    expect(migrated.payload.days[0].events).toEqual(payload.days[0].events);
    expect(migrated.payload.days.every((day: { weather: unknown }) => day.weather === null)).toBe(true);
  });

  it("recovers from a valid v1 snapshot when the v2 snapshot is corrupt", async () => {
    const legacyPayload: Record<string, unknown> = {
      ...payload,
      days: payload.days.map((day) => ({
        ...day,
        weather: day.weather
          ? { tempMaxC: day.weather.tempMaxC, precipitationChance: day.weather.precipitationChance, outfit: day.weather.outfit }
          : null,
      })),
    };
    delete legacyPayload.morningQuote;
    localStorage.setItem("family-display:last-good:v2", "{\"payload\":\"invalid\"}");
    localStorage.setItem("family-display:last-good:v1", JSON.stringify({ payload: legacyPayload, receivedAt: "2026-08-27T18:42:00+01:00" }));
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("offline"));

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Today · Thu 27 August" })).toBeVisible();
    expect(screen.getByText("Last updated 18:42 · offline")).toBeVisible();
    const migrated = JSON.parse(localStorage.getItem("family-display:last-good:v2")!);
    expect(migrated.payload.morningQuote).toBeNull();
    expect(migrated.payload.days[0].events).toEqual(payload.days[0].events);
    expect(migrated.payload.days.every((day: { weather: unknown }) => day.weather === null)).toBe(true);
    expect(localStorage.getItem("family-display:last-good:v1")).toBeNull();
  });

  it("retains a malformed v1 snapshot when migration cannot validate it", async () => {
    const malformed = JSON.stringify({ payload: { generatedAt: "not-a-date" }, receivedAt: "2026-08-27T18:42:00+01:00" });
    localStorage.setItem("family-display:last-good:v1", malformed);
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("offline"));

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Calendar temporarily unavailable" })).toBeVisible();
    expect(localStorage.getItem("family-display:last-good:v1")).toBe(malformed);
    expect(localStorage.getItem("family-display:last-good:v2")).toBeNull();
  });

  it("atomically replaces the board when a background poll succeeds", async () => {
    vi.useFakeTimers({ now: TEST_NOW });
    const refreshed = {
      ...payload,
      generatedAt: "2026-08-27T18:47:00+01:00",
      days: payload.days.map((day, index) => index === 0
        ? { ...day, events: [{ ...day.events[0]!, id: "evt_changed", title: "Calendar refreshed" }] }
        : day),
    };
    vi.mocked(fetch)
      .mockResolvedValueOnce(response(payload))
      .mockResolvedValueOnce(response(refreshed));

    render(<App />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByLabelText("Everyone: Family day, All day, at Home")).toBeVisible();

    await act(async () => { await vi.advanceTimersByTimeAsync(300_000); });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(screen.queryByLabelText("Everyone: Family day, All day, at Home")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Everyone: Calendar refreshed, All day, at Home")).toBeVisible();
    expect(screen.getByText("Updated 18:47")).toBeVisible();
  });

  it("keeps the last render and marks it stale when a background poll fails", async () => {
    vi.useFakeTimers({ now: TEST_NOW });
    vi.mocked(fetch)
      .mockResolvedValueOnce(response(payload))
      .mockRejectedValueOnce(new TypeError("offline"));

    render(<App />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole("heading", { name: "Today · Thu 27 August" })).toBeVisible();

    await act(async () => { await vi.advanceTimersByTimeAsync(300_000); });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("heading", { name: "Today · Thu 27 August" })).toBeVisible();
    expect(screen.getByText("Last updated 18:42 · offline")).toBeVisible();
  });

  it("rejects an invalid poll payload without blanking the valid board", async () => {
    vi.useFakeTimers({ now: TEST_NOW });
    vi.mocked(fetch)
      .mockResolvedValueOnce(response(payload))
      .mockResolvedValueOnce(response({ ...payload, days: payload.days.slice(0, 6) }));

    render(<App />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole("heading", { name: "Today · Thu 27 August" })).toBeVisible();

    await act(async () => { await vi.advanceTimersByTimeAsync(300_000); });

    expect(screen.getByRole("heading", { name: "Today · Thu 27 August" })).toBeVisible();
    expect(screen.getByText("Last updated 18:42 · offline")).toBeVisible();
  });

  it("times out a stalled cold-start request into the safe retrying state", async () => {
    vi.useFakeTimers({ now: TEST_NOW });
    vi.mocked(fetch).mockImplementationOnce((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));

    render(<App />);
    expect(screen.getByText("Loading family calendar")).toBeVisible();

    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });

    expect(screen.getByRole("heading", { name: "Calendar temporarily unavailable" })).toBeVisible();
  });

  it("renders event semantics and all six groups without relying on colour", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(payload));
    render(<App />);

    expect(await screen.findByLabelText("H and Chantele: Date night, 19:00")).toBeVisible();
    const allDay = screen.getByLabelText("Everyone: Family day, All day, at Home");
    expect(allDay).toHaveTextContent("All day");
    expect(allDay).not.toHaveTextContent("—");
    expect(allDay.querySelector(".event__when")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByLabelText("Rafe: Nursery drop-off, 08:30, at Nursery, up next")).toHaveTextContent("08:30");
    expect(screen.getByLabelText("H: Bins out, 07:00")).toBeVisible();
    expect(screen.getByLabelText("Chantele: Appointment, 11:00, at Clinic")).toBeVisible();
    const household = screen.getByLabelText("Home: Cleaner, 10:00");
    expect(household).toBeVisible();
    expect(household).toHaveTextContent("Home");
    expect(household).toHaveClass("event--household");
    expect(screen.getAllByText("Nothing planned")).toHaveLength(3);
    expect(screen.getByLabelText(/Thursday weather: Rain, maximum 19 degrees Celsius/)).toBeVisible();
    expect(screen.getByLabelText(/Friday weather: Clear, maximum 21 degrees Celsius/)).toBeVisible();
    expect(screen.getByLabelText("Tonight's meal: Stir fry")).toBeVisible();
    expect(screen.getByLabelText("Meal: Takeaway")).toBeVisible();
    expect(screen.getByLabelText("Meal: Eating out")).toBeVisible();
    expect(screen.getByLabelText("Meal: Sunday roast")).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("groups an empty meal label and value vertically so the larger text can use the full card width", async () => {
    const withoutMeals = {
      ...payload,
      days: payload.days.map((day, index) => index === 0 ? { ...day, meal: null } : day),
    };
    vi.mocked(fetch).mockResolvedValueOnce(response(withoutMeals));

    render(<App />);

    const emptyMeal = await screen.findByLabelText("Tonight's meal not planned");
    const textGroup = emptyMeal.querySelector(":scope > div");
    expect(textGroup).not.toBeNull();
    expect(textGroup).toHaveTextContent("Tonight’s mealDinner not set");
  });

  it("renders every today event when the schedule has capacity", async () => {
    vi.spyOn(Element.prototype, "clientHeight", "get").mockImplementation(function (this: Element) {
      return this.closest(".today-card__schedule") && this.classList.contains("event-list--adaptive") ? 360 : 0;
    });
    vi.spyOn(Element.prototype, "scrollHeight", "get").mockImplementation(function (this: Element) {
      return this.classList.contains("event") ? 40 : 0;
    });
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const height = this.classList.contains("event-overflow") ? 32 : this.classList.contains("event") ? 40 : 0;
      return { x: 0, y: 0, width: 100, height, top: 0, right: 100, bottom: height, left: 0, toJSON: () => ({}) };
    });
    const crowded = {
      ...payload,
      days: payload.days.map((day, dayIndex) => dayIndex === 0
        ? {
            ...day,
            events: Array.from({ length: 6 }, (_, index) => ({
              ...day.events[1]!,
              id: `evt_today_${index}`,
              title: `Today event ${index + 1}`,
              start: `2026-08-27T${String(8 + index).padStart(2, "0")}:00:00+01:00`,
              end: `2026-08-27T${String(9 + index).padStart(2, "0")}:00:00+01:00`,
              allDay: false,
            })),
          }
        : day),
    };
    vi.mocked(fetch).mockResolvedValueOnce(response(crowded));

    render(<App />);

    expect(await screen.findByText("Today event 1")).toBeVisible();
    const todayList = screen.getByText("Today event 1").closest("ul")!;
    await waitFor(() => expect(todayList).toHaveAttribute("data-visible-events", "6"));
    expect(screen.getByText("Today event 6")).toBeVisible();
    expect(within(todayList).queryByText(/more$/)).not.toBeInTheDocument();
  });

  it("renders every future event when the card has capacity", async () => {
    const twoEvents = {
      ...payload,
      days: payload.days.map((day, dayIndex) => dayIndex === 2
        ? {
            ...day,
            events: [
              { ...payload.days[0]!.events[1]!, id: "evt_compact_one", title: "First compact event" },
              { ...payload.days[0]!.events[1]!, id: "evt_compact_two", title: "Second compact event" },
            ],
          }
        : day),
    };
    vi.mocked(fetch).mockResolvedValueOnce(response(twoEvents));

    render(<App />);

    expect(await screen.findByText("First compact event")).toBeVisible();
    expect(screen.getByText("Second compact event")).toBeVisible();
    expect(screen.queryByText("+1 more")).not.toBeInTheDocument();
  });

  it("bounds crowded Yesterday events to measured capacity with a +N summary", async () => {
    vi.spyOn(Element.prototype, "clientHeight", "get").mockImplementation(function (this: Element) {
      return this.closest(".yesterday-panel") && this.classList.contains("event-list--adaptive") ? 128 : 0;
    });
    vi.spyOn(Element.prototype, "scrollHeight", "get").mockImplementation(function (this: Element) {
      return this.classList.contains("event") ? 40 : 0;
    });
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const height = this.classList.contains("event-overflow") ? 32 : this.classList.contains("event") ? 40 : 0;
      return { x: 0, y: 0, width: 100, height, top: 0, right: 100, bottom: height, left: 0, toJSON: () => ({}) };
    });
    const crowdedYesterday = {
      ...payload,
      yesterday: {
        ...payload.yesterday,
        events: Array.from({ length: 4 }, (_, index) => ({
          ...payload.yesterday.events[0]!,
          id: `evt_yesterday_${index}`,
          title: `Yesterday event ${index + 1}`,
        })),
      },
    };
    vi.mocked(fetch).mockResolvedValueOnce(response(crowdedYesterday));

    render(<App />);

    expect(await screen.findByText("Yesterday event 1")).toBeVisible();
    const yesterdayList = screen.getByText("Yesterday event 1").closest("ul")!;
    await waitFor(() => expect(yesterdayList).toHaveAttribute("data-visible-events", "2"));
    expect(screen.getByText("Yesterday event 2")).toBeVisible();
    expect(screen.queryByText("Yesterday event 3")).not.toBeInTheDocument();
    expect(within(yesterdayList).getByText("+2 more")).toBeVisible();
  });

  it("shows +N more only when measured future-card height is exceeded and recalculates on resize", async () => {
    let availableHeight = 128;
    vi.spyOn(Element.prototype, "clientHeight", "get").mockImplementation(function (this: Element) {
      return this.classList.contains("event-list--adaptive") ? availableHeight : 0;
    });
    vi.spyOn(Element.prototype, "scrollHeight", "get").mockImplementation(function (this: Element) {
      return this.classList.contains("event") ? 40 : 0;
    });
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const height = this.classList.contains("event-overflow") ? 32 : this.classList.contains("event") ? 40 : 0;
      return { x: 0, y: 0, width: 100, height, top: 0, right: 100, bottom: height, left: 0, toJSON: () => ({}) };
    });
    const crowdedFuture = {
      ...payload,
      days: payload.days.map((day, dayIndex) => dayIndex === 1
        ? {
            ...day,
            events: Array.from({ length: 4 }, (_, index) => ({
              ...payload.days[0]!.events[1]!,
              id: `evt_measured_${index}`,
              title: `Measured event ${index + 1}`,
            })),
          }
        : day),
    };
    vi.mocked(fetch).mockResolvedValueOnce(response(crowdedFuture));

    render(<App />);

    expect(await screen.findByText("Measured event 1")).toBeVisible();
    const measuredList = screen.getByText("Measured event 1").closest("ul")!;
    await waitFor(() => expect(measuredList).toHaveAttribute("data-visible-events", "2"));
    expect(screen.getByText("Measured event 2")).toBeVisible();
    expect(screen.queryByText("Measured event 3")).not.toBeInTheDocument();
    expect(screen.getByText("+2 more")).toBeVisible();

    availableHeight = 300;
    fireEvent(window, new Event("resize"));
    await waitFor(() => expect(measuredList).toHaveAttribute("data-visible-events", "4"));
    expect(screen.getByText("Measured event 4")).toBeVisible();
    expect(screen.queryByText("+2 more")).not.toBeInTheDocument();
  });

  it("keeps a long compact all-day event title on one bounded row without a time marker", async () => {
    const longTitle = "A very long future all-day event title that must remain visible within its compact card";
    const withLongAllDayEvent = {
      ...payload,
      days: payload.days.map((day, dayIndex) => dayIndex === 1
        ? {
            ...day,
            events: [{
              id: "evt_long_all_day",
              title: longTitle,
              start: "2026-08-28T00:00:00+01:00",
              end: "2026-08-29T00:00:00+01:00",
              allDay: true,
              group: "all" as const,
              location: "",
            }],
          }
        : day),
    };
    vi.mocked(fetch).mockResolvedValueOnce(response(withLongAllDayEvent));

    render(<App />);

    const event = await screen.findByLabelText(`Everyone: ${longTitle}, All day`);
    expect(event).toHaveClass("event--all-day");
    expect(event).toHaveAccessibleName(/All day/);
    expect(event.querySelector(".event__when")).toBeNull();
    expect(event).not.toHaveTextContent("—");
    expect(within(event).getByText(longTitle)).toBeVisible();
  });

  it("renders the next West Ham fixture directly beneath dinner with home and away crests", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(payload));
    render(<App />);

    const match = await screen.findByLabelText("Next West Ham match: Millwall versus West Ham United, Saturday 19 September at 12:30");
    expect(match.previousElementSibling).toHaveClass("meal--today");
    expect(within(match).getByText("Next West Ham game")).toBeVisible();
    expect(within(match).getByRole("img", { name: "Millwall crest" })).toHaveAttribute("src", "/api/football/crest/133634");
    expect(within(match).getByRole("img", { name: "West Ham United crest" })).toHaveAttribute("src", "/api/football/crest/133636");
    expect(within(match).getByText("Millwall").closest(".next-match__team")).toHaveClass("next-match__team--home");
    expect(within(match).getByText("West Ham United").closest(".next-match__team")).toHaveClass("next-match__team--away");
    expect(within(match).getByText("12:30").closest("time")).toHaveAttribute("datetime", "2026-09-19T12:30:00+01:00");
  });

  it("renders the morning quote inside today's primary panel", async () => {
    const withQuote = { ...payload, morningQuote: { text: "Do the work in front of you.", attribution: "Marcus Aurelius" } };
    vi.mocked(fetch).mockResolvedValueOnce(response(withQuote));

    render(<App />);

    const quote = await screen.findByRole("blockquote", { name: "Morning quote" });
    expect(quote.previousElementSibling).toHaveClass("next-match");
    expect(quote.previousElementSibling?.previousElementSibling).toHaveClass("meal--today");
    expect(quote).toHaveTextContent("Do the work in front of you.");
    expect(quote).toHaveTextContent("Marcus Aurelius");
    expect(quote.querySelector("cite")).toHaveTextContent(/^Marcus Aurelius$/);
  });

  it("keeps maximum valid morning quote content available when its visible text is truncated", async () => {
    const text = "Q".repeat(500);
    const attribution = "A".repeat(120);
    vi.mocked(fetch).mockResolvedValueOnce(response({ ...payload, morningQuote: { text, attribution } }));

    render(<App />);

    const quote = await screen.findByRole("blockquote", { name: "Morning quote" });
    const quoteText = quote.querySelector("p");
    const quoteAttribution = quote.querySelector("cite");
    expect(quoteText).toHaveAttribute("aria-label", `Quote: ${text}`);
    expect(quoteText).toHaveAttribute("title", text);
    expect(quoteAttribution).toHaveAttribute("aria-label", `Attribution: ${attribution}`);
    expect(quoteAttribution).toHaveAttribute("title", attribution);
  });

  it("renders local weather, outfit and meal icons from the shared icon library", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(payload));
    render(<App />);

    expect(await screen.findByTestId("weather-icon-rain")).toBeVisible();
    expect(screen.getByTestId("weather-icon-clear")).toBeVisible();
    expect(screen.getAllByTestId("outfit-icon-raincoat").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("meal-icon-recipe").length).toBeGreaterThan(0);
    expect(screen.getByTestId("meal-icon-takeaway")).toBeVisible();
    expect(screen.getByTestId("meal-icon-out")).toBeVisible();
  });

  it("places the permanent Google colour key in the top-right rail", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(payload));
    render(<App />);

    const legend = await screen.findByLabelText("Google Calendar colour guide");
    expect(legend.closest(".top-row__rail")).not.toBeNull();
    expect(legend).toHaveTextContent("Calendar key");
    expect(screen.getByLabelText("Grape: H + Chantele")).toBeVisible();
    expect(screen.getByLabelText("Blueberry: All")).toBeVisible();
    expect(screen.getByLabelText("Basil: Rafe")).toBeVisible();
    expect(screen.getByLabelText("Graphite: H")).toBeVisible();
    expect(screen.getByLabelText("Beetroot: Chantele")).toBeVisible();
    expect(screen.queryByLabelText("Banana: Chantele")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Tangerine: Home")).toBeVisible();
    expect(within(legend).getByText("Home", { exact: true })).toBeVisible();
    expect(within(legend).getByText("H + C", { exact: true })).toBeVisible();
    expect(legend).not.toHaveTextContent("Grape");
    expect(legend).not.toHaveTextContent("Blueberry");
  });

  it("marks a successful server-declared stale response without hiding the board", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(payload, true));

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Today · Thu 27 August" })).toBeVisible();
    expect(screen.getByText("Last updated 18:42 · offline")).toBeVisible();
  });

  it("shows the safe retrying state when live and cached data are unusable", async () => {
    localStorage.setItem("family-display:last-good:v2", "{\"payload\":\"invalid\"}");
    vi.mocked(fetch).mockResolvedValueOnce(new Response("service detail", { status: 503 }));

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Calendar temporarily unavailable" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Trying again…");
    expect(screen.queryByText("service detail")).not.toBeInTheDocument();
    expect(localStorage.getItem("family-display:last-good:v2")).toBeNull();
  });

  it("keeps a valid live response visible when browser persistence is unavailable", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
      throw new DOMException("Storage blocked", "SecurityError");
    });
    vi.mocked(fetch).mockResolvedValueOnce(response(payload));

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Today · Thu 27 August" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Calendar temporarily unavailable" })).not.toBeInTheDocument();
  });

  it("logs a maintenance code without raw response details", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.mocked(fetch).mockResolvedValueOnce(new Response("private-household-detail", { status: 200 }));

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Calendar temporarily unavailable" })).toBeVisible();
    expect(warn).toHaveBeenCalledWith("Family Display data unavailable", "DISPLAY_RESPONSE_INVALID");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("private-household-detail");
  });

  it("shows a live clock that moves on with the minute", async () => {
    vi.useFakeTimers({ now: new Date("2026-08-27T08:00:30+01:00") });
    vi.mocked(fetch).mockResolvedValueOnce(response(payload));

    render(<App />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByLabelText("Time 08:00")).toHaveTextContent("08:00");

    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(screen.getByLabelText("Time 08:01")).toBeVisible();
  });

  it("collapses finished events and marks what is happening now and next", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-08-27T12:15:00+01:00") });
    const busy = {
      ...payload,
      days: payload.days.map((day, index) => index === 0
        ? {
            ...day,
            events: [
              day.events[0]!,
              { ...day.events[1]!, id: "evt_done", title: "Nursery drop-off" },
              { ...day.events[1]!, id: "evt_now", title: "Lunch", start: "2026-08-27T12:00:00+01:00", end: "2026-08-27T13:00:00+01:00", location: "" },
              { ...day.events[1]!, id: "evt_next", title: "Pick-up", start: "2026-08-27T15:00:00+01:00", end: "2026-08-27T15:30:00+01:00", location: "" },
              { ...day.events[1]!, id: "evt_later", title: "Bath time", start: "2026-08-27T18:30:00+01:00", end: "2026-08-27T19:00:00+01:00", location: "" },
            ],
          }
        : day),
    };
    vi.mocked(fetch).mockResolvedValueOnce(response(busy));

    render(<App />);

    expect(await screen.findByText("1 done")).toBeVisible();
    expect(screen.queryByText("Nursery drop-off")).not.toBeInTheDocument();
    const now = screen.getByLabelText("Rafe: Lunch, 12:00, happening now");
    expect(now).toHaveClass("event--now");
    expect(now).toHaveTextContent("Now");
    expect(screen.getByLabelText("Rafe: Pick-up, 15:00, up next")).toHaveTextContent("Next");
    expect(screen.getByLabelText("Rafe: Bath time, 18:30")).not.toHaveTextContent(/Now|Next/);
    expect(screen.getByLabelText("Everyone: Family day, All day, at Home")).not.toHaveClass("event--now");
  });

  it("says when every event today has finished", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-08-27T20:00:00+01:00") });
    const timedOnly = { ...payload, days: payload.days.map((day, index) => index === 0 ? { ...day, events: [day.events[1]!] } : day) };
    vi.mocked(fetch).mockResolvedValueOnce(response(timedOnly));

    render(<App />);

    expect(await screen.findByText("All done for today")).toBeVisible();
    expect(screen.getByText("1 done")).toBeVisible();
  });

  it("shows the day's low, rain timing and daylight hours beside today's weather", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(payload));
    render(<App />);

    const weather = await screen.findByLabelText("Thursday weather: Rain, maximum 19 degrees Celsius, minimum 12 degrees, 65% chance of rain, rain from 15:00, sunrise 06:12, sunset 19:54");
    expect(within(weather).getByText("12°")).toHaveClass("weather__low");
    expect(within(weather).getByText("Rain from 15:00")).toBeVisible();
    expect(within(weather).getByText("06:12")).toBeVisible();
    expect(within(weather).getByText("19:54")).toBeVisible();
    const outfit = weather.nextElementSibling;
    expect(outfit).toHaveClass("outfit--today");
    expect(outfit).toHaveTextContent("Raincoat");
    expect(outfit?.parentElement).toHaveClass("today-card__date");
    expect(screen.getByLabelText(/Friday weather: Clear, maximum 21 degrees Celsius, minimum 13 degrees/)).not.toHaveTextContent("Rain from");
  });

  it("switches to rain now once the expected rain has started", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-08-27T15:20:00+01:00") });
    vi.mocked(fetch).mockResolvedValueOnce(response(payload));
    render(<App />);

    expect(await screen.findByText("Rain now")).toBeVisible();
  });

  it("puts the clock first with the date on one line beneath it", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(payload));
    render(<App />);

    const heading = await screen.findByRole("heading", { name: "Today · Thu 27 August" });
    expect(heading).toHaveTextContent("Thursday 27 August");
    expect(heading.previousElementSibling).toHaveClass("today-card__clock");
    expect(heading.closest(".today-card__when")?.nextElementSibling).toHaveClass("weather--today");
  });

  it("keeps the West Ham game alongside the bin reminder", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ ...payload, binReminder: { bin: "recycling", collectionDate: "2026-08-28" } }));
    render(<App />);

    const match = await screen.findByLabelText(/Next West Ham match:/);
    expect(match.closest(".today-card__aside")?.firstElementChild).toHaveClass("bin-reminder");
  });

  it("reminds the household to put the bins out on Tuesday evening", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ ...payload, binReminder: { bin: "recycling", collectionDate: "2026-08-28" } }));
    render(<App />);

    const reminder = await screen.findByLabelText("Recycling bins out tonight for collection on Friday");
    expect(reminder).toHaveClass("bin-reminder--recycling");
    expect(reminder).toHaveTextContent("Recycling out tonight");
    expect(reminder.nextElementSibling).toHaveClass("meal--today");
  });

  it("names general waste weeks", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ ...payload, binReminder: { bin: "general", collectionDate: "2026-08-28" } }));
    render(<App />);

    expect(await screen.findByText("General waste out tonight")).toBeVisible();
  });

  it("lists up to three countdowns in the rail", async () => {
    const countdowns = [
      { id: "evt_1", title: "Party", date: "2026-08-27", daysAway: 0, group: "all" },
      { id: "evt_2", title: "Holiday", date: "2026-08-28", daysAway: 1, group: "all" },
      { id: "evt_3", title: "Rafe's birthday", date: "2026-09-08", daysAway: 12, group: "rafe" },
      { id: "evt_4", title: "Christmas", date: "2026-12-25", daysAway: 120, group: "all" },
    ];
    vi.mocked(fetch).mockResolvedValueOnce(response({ ...payload, countdowns }));
    render(<App />);

    const list = await screen.findByLabelText("Countdowns");
    expect(list.closest(".top-row__rail")).not.toBeNull();
    expect(within(list).getByLabelText("Party: today")).toHaveTextContent("Today");
    expect(within(list).getByLabelText("Holiday: tomorrow")).toHaveTextContent("Tomorrow");
    expect(within(list).getByLabelText("Rafe's birthday: 12 days")).toHaveTextContent("12 days");
    expect(within(list).queryByText("Christmas")).not.toBeInTheDocument();
  });

  it("leaves the countdown panel out when nothing is tagged", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(payload));
    render(<App />);

    await screen.findByLabelText("Google Calendar colour guide");
    expect(screen.queryByLabelText("Countdowns")).not.toBeInTheDocument();
  });

  const span = (id: string, title: string, firstDate: string, lastDate: string) => ({
    id, title, start: `${firstDate}T00:00:00+01:00`, end: "2026-09-10T00:00:00+01:00", allDay: true, group: "all" as const, location: "", firstDate, lastDate,
  });

  it("draws multi-day events as bars across the upcoming cards and says when they end today", async () => {
    const trip = span("evt_trip", "Grandparents visiting", "2026-08-26", "2026-08-29");
    const withTrip = {
      ...payload,
      multiDay: [trip, span("evt_camp", "Camping", "2026-08-31", "2026-09-05")],
      days: payload.days.map((day, index) => index === 0
        ? { ...day, events: [...day.events, { id: trip.id, title: trip.title, start: trip.start, end: trip.end, allDay: true, group: trip.group, location: "" }] }
        : day),
    };
    vi.mocked(fetch).mockResolvedValueOnce(response(withTrip));
    render(<App />);

    expect(await screen.findByLabelText("Everyone: Grandparents visiting, until Saturday")).toHaveTextContent("Until Sat");
    const bars = screen.getAllByTestId("span-bar");
    expect(bars).toHaveLength(2);
    expect(bars[0]).toHaveAccessibleName("Everyone: Grandparents visiting, continuing Friday to Saturday");
    expect(bars[0]).toHaveClass("span-bar--before");
    expect(bars[0]).toHaveStyle({ gridColumn: "1 / 3", gridRow: "2" });
    expect(bars[1]).toHaveAccessibleName("Everyone: Camping, from Monday to Wednesday and beyond");
    expect(bars[1]).toHaveClass("span-bar--after");
    expect(bars[1]).toHaveStyle({ gridColumn: "4 / 7", gridRow: "2" });
  });

  it("returns a third overlapping multi-day event to each day's list", async () => {
    const withSpans = {
      ...payload,
      multiDay: [
        span("evt_one", "Trip one", "2026-08-28", "2026-08-30"),
        span("evt_two", "Trip two", "2026-08-28", "2026-08-29"),
        span("evt_three", "Trip three", "2026-08-29", "2026-08-30"),
      ],
    };
    vi.mocked(fetch).mockResolvedValueOnce(response(withSpans));
    render(<App />);

    await screen.findByLabelText("Everyone: Trip one, from Friday to Sunday");
    expect(screen.getAllByTestId("span-bar")).toHaveLength(2);
    const [, saturday, sunday] = screen.getAllByTestId("future-day");
    expect(within(saturday!).getByLabelText("Everyone: Trip three, All day")).toBeVisible();
    expect(within(sunday!).getByLabelText("Everyone: Trip three, All day")).toBeVisible();
  });

  it("lists multi-day events inside each card on narrow screens", async () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    vi.mocked(fetch).mockResolvedValueOnce(response({ ...payload, multiDay: [span("evt_one", "Trip one", "2026-08-28", "2026-08-29")] }));
    render(<App />);

    const [friday, saturday] = await screen.findAllByTestId("future-day");
    expect(screen.queryByTestId("span-bar")).not.toBeInTheDocument();
    expect(within(friday!).getByLabelText("Everyone: Trip one, All day")).toBeVisible();
    expect(within(saturday!).getByLabelText("Everyone: Trip one, All day")).toBeVisible();
    vi.unstubAllGlobals();
  });

  it("raises a clear warning when the calendar has not updated for over an hour", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-08-27T19:43:00+01:00") });
    vi.mocked(fetch).mockResolvedValueOnce(response(payload, true));
    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Not updated since 18:42");
  });

  it("stays calm while the calendar is less than an hour old", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-08-27T19:41:00+01:00") });
    vi.mocked(fetch).mockResolvedValueOnce(response(payload, true));
    render(<App />);

    await screen.findByRole("heading", { name: "Today · Thu 27 August" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("warns when the board is still showing a previous day", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-08-28T00:20:00+01:00") });
    vi.mocked(fetch).mockResolvedValueOnce(response({ ...payload, calendarUpdatedAt: "2026-08-27T23:50:00+01:00" }));
    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Not updated since 23:50 on Thursday");
  });

  it("upgrades a saved snapshot from before the new board details", async () => {
    const older: Record<string, unknown> = {
      ...payload,
      days: payload.days.map((day) => ({
        ...day,
        weather: day.weather ? { tempMaxC: day.weather.tempMaxC, precipitationChance: day.weather.precipitationChance, condition: day.weather.condition, outfit: day.weather.outfit } : null,
      })),
    };
    for (const key of ["calendarUpdatedAt", "binReminder", "countdowns", "multiDay"]) delete older[key];
    localStorage.setItem("family-display:last-good:v2", JSON.stringify({ payload: older, receivedAt: "2026-08-27T18:42:00+01:00" }));
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("offline"));

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Today · Thu 27 August" })).toBeVisible();
    expect(screen.getByLabelText("Thursday weather: Rain, maximum 19 degrees Celsius, 65% chance of rain")).toBeVisible();
    expect(screen.queryByText("Rain from 15:00")).not.toBeInTheDocument();
  });

  it("starts and cleans up daily browser recovery scheduling", () => {
    vi.mocked(fetch).mockReturnValueOnce(new Promise(() => undefined));
    const cancel = vi.fn();
    vi.mocked(scheduleDailyReload).mockReturnValueOnce(cancel);

    const { unmount } = render(<App />);
    expect(scheduleDailyReload).toHaveBeenCalledOnce();

    unmount();
    expect(cancel).toHaveBeenCalledOnce();
  });
});
