import { describe, expect, it, vi } from "vitest";
import { trainPayloadSchema, type TrainDeparture } from "@family-display/contract";
import { TrainService } from "../src/train-service.js";

const onTime: TrainDeparture = {
  destination: "London Victoria",
  scheduledTime: "08:02",
  expectedTime: null,
  status: "on-time",
};

const clock = () => new Date("2026-11-11T08:00:00Z");

describe("TrainService", () => {
  it("assembles independent fixed station boards with explicit empty state", async () => {
    const load = vi.fn(async (crs: string) => crs === "WHY" ? [] : [onTime]);
    const result = await new TrainService({ load }, { clock }).getDepartures();

    expect(trainPayloadSchema.parse(result)).toEqual(result);
    expect(result.main).toMatchObject({ crs: "UWL", station: "Upper Warlingham", state: "available", departures: [onTime] });
    expect(result.rotating[0]).toMatchObject({ crs: "CDS", station: "Coulsdon South", state: "available" });
    expect(result.rotating[1]).toEqual({ crs: "WHY", station: "Whyteleafe", state: "empty", checkedAt: "2026-11-11T08:00:00.000Z", departures: [] });
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("isolates station failures and never serves an old departure board as current", async () => {
    let fail = false;
    const load = vi.fn(async (crs: string) => {
      if (fail && crs === "UWL") throw new Error("private upstream detail");
      return [onTime];
    });
    const service = new TrainService({ load }, { clock, ttlMs: 0 });

    expect((await service.getDepartures()).main.state).toBe("available");
    fail = true;
    const refreshed = await service.getDepartures();

    expect(refreshed.main).toEqual({ crs: "UWL", station: "Upper Warlingham", state: "unavailable", checkedAt: "2026-11-11T08:00:00.000Z", departures: [] });
    expect(refreshed.rotating.every((board) => board.state === "available")).toBe(true);
  });

  it("coalesces concurrent refreshes and caches for less than a browser poll interval", async () => {
    let now = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const load = vi.fn(async () => {
      await gate;
      return [onTime];
    });
    const service = new TrainService({ load }, { clock, ttlMs: 45_000, now: () => now });

    const first = service.getDepartures();
    const second = service.getDepartures();
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(3));
    release();
    const [one, two] = await Promise.all([first, second]);
    expect(one).toEqual(two);

    await service.getDepartures();
    expect(load).toHaveBeenCalledTimes(3);
    now = 45_001;
    const refresh = service.getDepartures();
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(6));
    release();
    await refresh;
  });
});
