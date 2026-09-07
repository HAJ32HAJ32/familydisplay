import { describe, expect, it } from "vitest";
import { displayPayloadSchema } from "./schema";
import { payload } from "../test/fixture";

describe("frontend contract boundary", () => {
  it("rejects event identifiers that are only whitespace", () => {
    const input = {
      ...payload,
      days: payload.days.map((day, index) => index === 0
        ? { ...day, events: day.events.map((event, eventIndex) => eventIndex === 0 ? { ...event, id: "   " } : event) }
        : day),
    };

    expect(displayPayloadSchema.safeParse(input).success).toBe(false);
  });
});
