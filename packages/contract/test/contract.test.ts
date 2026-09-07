import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { displayPayloadSchema } from "../src/index.js";

const fixture = JSON.parse(readFileSync(new URL("../fixtures/today.json", import.meta.url), "utf8")) as unknown;

const event = { id: "evt_123", title: "Breakfast", start: "2026-08-27T08:00:00+01:00", end: "2026-08-27T08:30:00+01:00", allDay: false, group: "all", location: "" };
const day = (date: string, weekday: string, isToday = false) => ({ date, weekday, isToday, weather: null, events: [], meal: null });
const valid = {
  generatedAt: "2026-08-27T07:00:00+01:00", timezone: "Europe/London",
  yesterday: { date: "2026-08-26", weekday: "Wed", events: [event] },
  days: [day("2026-08-27", "Thu", true), day("2026-08-28", "Fri"), day("2026-08-29", "Sat"), day("2026-08-30", "Sun"), day("2026-08-31", "Mon"), day("2026-09-01", "Tue"), day("2026-09-02", "Wed")]
};

describe("displayPayloadSchema", () => {
  it("accepts the checked-in canonical fixture", () => expect(displayPayloadSchema.parse(fixture)).toEqual(fixture));
  it("accepts the canonical shape", () => expect(displayPayloadSchema.parse(valid)).toEqual(valid));
  it.each([
    ["invalid group", { ...valid, yesterday: { ...valid.yesterday, events: [{ ...event, group: "family" }] } }],
    ["timestamp without offset", { ...valid, yesterday: { ...valid.yesterday, events: [{ ...event, start: "2026-08-27T08:00:00" }] } }],
    ["reversed event", { ...valid, yesterday: { ...valid.yesterday, events: [{ ...event, end: event.start }] } }],
    ["six days", { ...valid, days: valid.days.slice(0, 6) }],
    ["non-consecutive dates", { ...valid, days: valid.days.map((d, i) => i === 4 ? { ...d, date: "2026-09-10" } : d) }],
    ["today marker outside index zero", { ...valid, days: valid.days.map((d, i) => ({ ...d, isToday: i === 1 })) }],
    ["impossible date", { ...valid, days: valid.days.map((d, i) => i === 2 ? { ...d, date: "2026-02-30" } : d) }],
    ["unknown key", { ...valid, secret: "nope" }]
  ])("rejects %s", (_name, value) => expect(() => displayPayloadSchema.parse(value)).toThrow());
});
