import { afterEach, describe, expect, it, vi } from "vitest";
import { RailInfoTrainProvider } from "../src/railinfo-train-provider.js";

function json(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" }, ...init });
}

const board = {
  crs: "CDS",
  name: "Coulsdon South",
  date: "2026-11-11",
  source: "railinfo",
  kind: "departures",
  departures: [
    { public_dep: "0801", destination: "Horsham", status: "on_time", etd: null, cancelled: false },
    { public_dep: "0806", destination: "Peterborough", status: "on_time", etd: null, cancelled: false },
    { public_dep: "0811", destination: "Victoria (C) (Tps Indic. Only)", status: "late", etd: "08:19", cancelled: false },
    { public_dep: "0816", destination: "Bedford Midland", status: "cancelled", etd: null, cancelled: true },
    { public_dep: "0821", destination: "Reigate", status: "on_time", etd: null, cancelled: false },
    { public_dep: "0826", destination: "London Bridge", status: "late", etd: null, cancelled: false },
  ],
};

const service = (station: string, after: Array<{ name: string; crs: string }>) => ({
  cancelled: false,
  source: "railinfo",
  calls: [
    { name: station, crs: "CDS", scheduled: "08:00", expected: null, status: "on_time", passed: false, here: true },
    ...after.map((call) => ({ ...call, scheduled: "08:20", expected: null, status: "on_time", passed: false, here: false })),
  ],
});

describe("RailInfoTrainProvider", () => {
  afterEach(() => vi.useRealTimers());

  it("uses calling points after the station to select the next three London-bound services", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/boards/CDS/departures")) return json(board);
      if (url.includes("dep=0801")) return json(service("Coulsdon South", [{ name: "Redhill", crs: "RDH" }]));
      if (url.includes("dep=0806")) return json(service("Coulsdon South", [{ name: "London Blackfriars", crs: "BFR" }, { name: "Peterborough", crs: "PBO" }]));
      if (url.includes("dep=0811")) return json(service("Coulsdon South", [{ name: "London Victoria", crs: "VIC" }]));
      if (url.includes("dep=0816")) return json({ ...service("Coulsdon South", [{ name: "St Pancras Low Level", crs: "SPL" }]), cancelled: true });
      throw new Error(`unexpected request ${url}`);
    });

    const result = await new RailInfoTrainProvider(fetcher).load("CDS", "Coulsdon South");

    expect(result).toEqual([
      { destination: "Peterborough", scheduledTime: "08:06", expectedTime: null, status: "on-time" },
      { destination: "London Victoria", scheduledTime: "08:11", expectedTime: "08:19", status: "delayed" },
      { destination: "Bedford Midland", scheduledTime: "08:16", expectedTime: null, status: "cancelled" },
    ]);
    expect(fetcher).toHaveBeenCalledTimes(5);
    for (const [, init] of fetcher.mock.calls) {
      expect(init).toMatchObject({ redirect: "error", headers: { Accept: "application/json" } });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("normalizes rail timetable destination labels and fails closed on unusable live status", async () => {
    const upperBoard = {
      ...board,
      crs: "UWL",
      name: "Upper Warlingham",
      departures: [
        { public_dep: "0802", destination: "Victoria (C) (Tps Indic. Only)", status: "on_time", etd: null, cancelled: false },
        { public_dep: "0832", destination: "Central", status: "late", etd: "08:40", cancelled: false },
        { public_dep: "0902", destination: "London Victoria", status: "late", etd: null, cancelled: false },
      ],
    };
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/boards/UWL/departures")) return json(upperBoard);
      return json({
        cancelled: false,
        source: "railinfo",
        calls: [
          { name: "Upper Warlingham", crs: "UWL", scheduled: "08:02", expected: null, status: "on_time", passed: false, here: true },
          { name: "London Victoria", crs: "VIC", scheduled: "08:35", expected: null, status: "on_time", passed: false, here: false },
        ],
      });
    });

    await expect(new RailInfoTrainProvider(fetcher).load("UWL", "Upper Warlingham")).resolves.toEqual([
      { destination: "London Victoria", scheduledTime: "08:02", expectedTime: null, status: "on-time" },
      { destination: "London Bridge", scheduledTime: "08:32", expectedTime: "08:40", status: "delayed" },
    ]);
  });

  it("rejects wrong-station, malformed and oversized responses", async () => {
    const wrongStation = async () => json({ ...board, name: "Coulsdon Town" });
    await expect(new RailInfoTrainProvider(wrongStation).load("CDS", "Coulsdon South")).rejects.toThrow("Train data unavailable");

    const malformed = async () => json({ ...board, departures: [{ destination: "Peterborough" }] });
    await expect(new RailInfoTrainProvider(malformed).load("CDS", "Coulsdon South")).rejects.toThrow("Train data unavailable");

    const oversized = async () => new Response(" ".repeat(65_537), { status: 200 });
    await expect(new RailInfoTrainProvider(oversized).load("CDS", "Coulsdon South")).rejects.toThrow("Train data unavailable");
  });

  it("applies one deadline to the complete station lookup rather than to each upstream request", async () => {
    vi.useFakeTimers();
    const manyDepartures = {
      ...board,
      departures: Array.from({ length: 6 }, (_, index) => ({
        public_dep: `08${String(index).padStart(2, "0")}`,
        destination: "Horsham",
        status: "on_time",
        etd: null,
        cancelled: false,
      })),
    };
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes("/boards/")) return json(manyDepartures);
      return new Promise<Response>((resolve) => setTimeout(() => resolve(json(service("Coulsdon South", [{ name: "Redhill", crs: "RDH" }]))), 15));
    });

    const outcome = new RailInfoTrainProvider(fetcher, 20).load("CDS", "Coulsdon South");
    const rejection = expect(outcome).rejects.toThrow("Train data unavailable");
    await vi.advanceTimersByTimeAsync(21);

    await rejection;
    expect(fetcher.mock.calls.filter(([input]) => String(input).includes("/services/")).length).toBeLessThan(3);
  });

  it("times out a non-settling request", async () => {
    let signal: AbortSignal | undefined;
    const fetcher = vi.fn((_input: string | URL | Request, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    });
    const outcome = Promise.race([
      new RailInfoTrainProvider(fetcher, 20).load("WHY", "Whyteleafe"),
      new Promise<string>((resolve) => setTimeout(() => resolve("still pending"), 100)),
    ]);

    await expect(outcome).rejects.toThrow("Train data unavailable");
    expect(signal?.aborted).toBe(true);
  });
});
