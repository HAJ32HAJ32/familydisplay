import { act, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { scheduleDailyReload } from "./data/dailyReload";
import { payload } from "./test/fixture";

vi.mock("./data/dailyReload", () => ({ scheduleDailyReload: vi.fn(() => vi.fn()) }));

const response = (body: unknown, stale = false) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json", "X-Data-Stale": String(stale) },
  });

describe("Family Display", () => {
  beforeEach(() => {
    localStorage.clear();
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
    vi.useFakeTimers();
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
    vi.useFakeTimers();
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
    vi.useFakeTimers();
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
    vi.useFakeTimers();
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
    expect(allDay).toHaveTextContent("—");
    expect(allDay).not.toHaveTextContent("All day");
    expect(allDay.querySelector(".event__time--all-day")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByLabelText("Rafe: Nursery drop-off, 08:30, at Nursery")).toHaveTextContent("08:30");
    expect(screen.getByLabelText("H: Bins out, 07:00")).toBeVisible();
    expect(screen.getByLabelText("Chantele: Appointment, 11:00, at Clinic")).toBeVisible();
    const household = screen.getByLabelText("Household: Cleaner, 10:00");
    expect(household).toBeVisible();
    expect(household).toHaveTextContent("Household");
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

  it("renders a deterministic overflow summary instead of silently clipping valid events", async () => {
    const crowded = {
      ...payload,
      days: payload.days.map((day, dayIndex) => {
        const count = dayIndex === 0 ? 6 : dayIndex === 1 ? 4 : 0;
        if (count === 0) return day;
        return {
          ...day,
          events: Array.from({ length: count }, (_, index) => ({
            ...day.events[dayIndex === 0 ? 1 : 0]!,
            id: `evt_crowded_${dayIndex}_${index}`,
            title: `${dayIndex === 0 ? "Today" : "Future"} event ${index + 1}`,
            start: `2026-08-${dayIndex === 0 ? "27" : "28"}T${String(8 + index).padStart(2, "0")}:00:00+01:00`,
            end: `2026-08-${dayIndex === 0 ? "27" : "28"}T${String(9 + index).padStart(2, "0")}:00:00+01:00`,
            allDay: false,
          })),
        };
      }),
    };
    vi.mocked(fetch).mockResolvedValueOnce(response(crowded));

    render(<App />);

    expect(await screen.findByText("Today event 1")).toBeVisible();
    expect(screen.getByText("Today event 3")).toBeVisible();
    expect(screen.queryByText("Today event 4")).not.toBeInTheDocument();
    expect(screen.getByText("Future event 1")).toBeVisible();
    expect(screen.queryByText("Future event 2")).not.toBeInTheDocument();
    expect(screen.getAllByText("+3 more")).toHaveLength(2);
  });

  it("uses one compact event plus an overflow summary when a future day has exactly two events", async () => {
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
    expect(screen.queryByText("Second compact event")).not.toBeInTheDocument();
    expect(screen.getByText("+1 more")).toBeVisible();
  });

  it("keeps a long compact all-day event title in the same bounded row as its dash", async () => {
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
    expect(event.querySelector(".event__time--all-day")).toHaveTextContent("—");
    expect(event.querySelector(".event__time--all-day")).toHaveAttribute("aria-hidden", "true");
    expect(within(event).getByText(longTitle)).toBeVisible();
  });

  it("renders the morning quote inside today's primary panel", async () => {
    const withQuote = { ...payload, morningQuote: { text: "Do the work in front of you.", attribution: "Marcus Aurelius" } };
    vi.mocked(fetch).mockResolvedValueOnce(response(withQuote));

    render(<App />);

    const quote = await screen.findByRole("blockquote", { name: "Morning quote" });
    expect(quote).toHaveTextContent("Do the work in front of you.");
    expect(quote).toHaveTextContent("Marcus Aurelius");
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
    expect(screen.getByLabelText("Banana: Chantele")).toBeVisible();
    expect(screen.getByLabelText("Tangerine: Household")).toBeVisible();
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
