import { describe, expect, it } from "vitest";
import { trainPayloadSchema } from "../src/index.js";

const departure = {
  destination: "London Victoria",
  scheduledTime: "08:02",
  expectedTime: null,
  status: "on-time" as const,
};

const board = {
  crs: "UWL" as const,
  station: "Upper Warlingham" as const,
  state: "available" as const,
  checkedAt: "2026-11-11T08:00:00Z",
  departures: [departure],
};

describe("train payload contract", () => {
  it("accepts the fixed three London-bound station boards", () => {
    const payload = trainPayloadSchema.parse({
      generatedAt: "2026-11-11T08:00:01Z",
      source: { name: "railinfo", attribution: "railinfo.uk · Network Rail & National Rail" },
      main: board,
      rotating: [
        { ...board, crs: "CDS", station: "Coulsdon South" },
        { ...board, crs: "WHY", station: "Whyteleafe" },
      ],
    });

    expect(payload.main.station).toBe("Upper Warlingham");
    expect(payload.rotating.map(({ station }) => station)).toEqual(["Coulsdon South", "Whyteleafe"]);
  });

  it("requires honest empty and unavailable boards to carry no departures", () => {
    for (const state of ["empty", "unavailable"] as const) {
      expect(() => trainPayloadSchema.parse({
        generatedAt: "2026-11-11T08:00:01Z",
        source: { name: "railinfo", attribution: "railinfo.uk · Network Rail & National Rail" },
        main: { ...board, state, departures: [departure] },
        rotating: [
          { ...board, crs: "CDS", station: "Coulsdon South" },
          { ...board, crs: "WHY", station: "Whyteleafe" },
        ],
      })).toThrow();
    }
  });

  it("retains cancelled and delayed status without inventing an expected time", () => {
    expect(trainPayloadSchema.parse({
      generatedAt: "2026-11-11T08:00:01Z",
      source: { name: "railinfo", attribution: "railinfo.uk · Network Rail & National Rail" },
      main: {
        ...board,
        departures: [
          { ...departure, status: "delayed", expectedTime: "08:14" },
          { ...departure, status: "cancelled", expectedTime: null },
        ],
      },
      rotating: [
        { ...board, crs: "CDS", station: "Coulsdon South" },
        { ...board, crs: "WHY", station: "Whyteleafe" },
      ],
    }).main.departures).toHaveLength(2);

    expect(() => trainPayloadSchema.parse({
      generatedAt: "2026-11-11T08:00:01Z",
      source: { name: "railinfo", attribution: "railinfo.uk · Network Rail & National Rail" },
      main: { ...board, departures: [{ ...departure, status: "on-time", expectedTime: "08:14" }] },
      rotating: [
        { ...board, crs: "CDS", station: "Coulsdon South" },
        { ...board, crs: "WHY", station: "Whyteleafe" },
      ],
    })).toThrow();
  });
});
