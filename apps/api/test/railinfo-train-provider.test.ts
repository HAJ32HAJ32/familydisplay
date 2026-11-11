import { afterEach, describe, expect, it, vi } from "vitest";
import { RailInfoTrainProvider } from "../src/railinfo-train-provider.js";

function json(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" }, ...init });
}

const fixtureClock = () => new Date("2026-11-11T07:00:00Z");

function provider(fetcher: typeof fetch, timeoutMs = 8_000, clock: () => Date = fixtureClock) {
  return new RailInfoTrainProvider(fetcher, timeoutMs, clock);
}

const board = {
  crs: "CDS",
  name: "Coulsdon South",
  date: "2026-11-11",
  source: "railinfo",
  kind: "departures",
  departures: [
    { public_dep: "0801", destination: "Horsham", status: "on_time", etd: null, cancelled: false, day: 0 },
    { public_dep: "0806", destination: "Peterborough", status: "on_time", etd: null, cancelled: false, day: 0 },
    { public_dep: "0811", destination: "Victoria (C) (Tps Indic. Only)", status: "late", etd: "08:19", cancelled: false, day: 0 },
    { public_dep: "0816", destination: "Bedford Midland", status: "cancelled", etd: null, cancelled: true, day: 0 },
    { public_dep: "0821", destination: "Reigate", status: "on_time", etd: null, cancelled: false, day: 0 },
    { public_dep: "0826", destination: "London Bridge", status: "late", etd: null, cancelled: false, day: 0 },
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

    const result = await provider(fetcher).load("CDS", "Coulsdon South");

    expect(result).toEqual([
      { destination: "Peterborough", scheduledTime: "08:06", expectedTime: null, status: "on-time" },
      { destination: "Bedford Midland", scheduledTime: "08:16", expectedTime: null, status: "cancelled" },
      { destination: "London Victoria", scheduledTime: "08:11", expectedTime: "08:19", status: "delayed" },
    ]);
    expect(fetcher).toHaveBeenCalledTimes(5);
    for (const [, init] of fetcher.mock.calls) {
      expect(init).toMatchObject({ redirect: "error", headers: { Accept: "application/json" } });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("keeps a mixed live board usable while omitting scheduled and unknown statuses", async () => {
    // Public UWL board shape captured 2026-11-11; operational identifiers omitted.
    const mixedBoard = {
      ...board,
      departures: [
        { public_dep: "0801", destination: "London Victoria", status: "scheduled", etd: null, cancelled: false, day: 0 },
        { public_dep: "0806", destination: "London Bridge", status: "awaiting_data", etd: null, cancelled: false, day: 0 },
        { public_dep: "0811", destination: "Peterborough", status: "on_time", etd: null, cancelled: false, day: 0 },
      ],
    };
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes("/boards/")) return json(mixedBoard);
      return json(service("Coulsdon South", [{ name: "London Blackfriars", crs: "BFR" }]));
    });

    await expect(provider(fetcher).load("CDS", "Coulsdon South")).resolves.toEqual([
      { destination: "Peterborough", scheduledTime: "08:11", expectedTime: null, status: "on-time" },
    ]);
  });

  it("omits a delayed service once the current-station call has passed", async () => {
    // Public CDS service shape captured 2026-11-11; train identifiers omitted.
    const delayedBoard = {
      ...board,
      departures: [
        { public_dep: "2009", destination: "London Victoria", status: "late", etd: "20:10", cancelled: false, day: 0 },
        { public_dep: "2019", destination: "London Bridge", status: "late", etd: "20:25", cancelled: false, day: 0 },
      ],
    };
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/boards/")) return json(delayedBoard);
      const currentPassed = url.includes("dep=2009");
      return json({
        cancelled: false,
        source: "railinfo",
        calls: [
          { name: "Coulsdon South", crs: "CDS", scheduled: "20:09", expected: "20:10", status: "late", passed: currentPassed, here: true },
          { name: "London Victoria", crs: "VIC", scheduled: "20:40", expected: "20:46", status: "late", passed: false, here: false },
        ],
      });
    });

    await expect(provider(fetcher).load("CDS", "Coulsdon South")).resolves.toEqual([
      { destination: "London Bridge", scheduledTime: "20:19", expectedTime: "20:25", status: "delayed" },
    ]);
  });

  it("fails closed for a service whose current-station passed state is missing", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes("/boards/")) return json({ ...board, departures: [board.departures[1]] });
      return json({
        cancelled: false,
        source: "railinfo",
        calls: [
          { name: "Coulsdon South", crs: "CDS", scheduled: "08:06", expected: null, status: "on_time", here: true },
          { name: "London Blackfriars", crs: "BFR", scheduled: "08:30", expected: null, status: "on_time", passed: false, here: false },
        ],
      });
    });

    await expect(provider(fetcher).load("CDS", "Coulsdon South")).resolves.toEqual([]);
  });

  it("fails closed for a service whose current-station passed state is null", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes("/boards/")) return json({ ...board, departures: [board.departures[1]] });
      return json({
        cancelled: false,
        source: "railinfo",
        calls: [
          { name: "Coulsdon South", crs: "CDS", scheduled: "08:06", expected: null, status: "on_time", passed: null, here: true },
          { name: "London Blackfriars", crs: "BFR", scheduled: "08:30", expected: null, status: "on_time", passed: false, here: false },
        ],
      });
    });

    await expect(provider(fetcher).load("CDS", "Coulsdon South")).resolves.toEqual([]);
  });

  it("uses the departure day offset for the service lookup date", async () => {
    const overnightBoard = {
      ...board,
      crs: "WHY",
      name: "Whyteleafe",
      departures: [
        { public_dep: "0050", destination: "London Bridge", status: "on_time", etd: null, cancelled: false, day: 1 },
      ],
    };
    const requestedDates: string[] = [];
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname.includes("/boards/")) return json(overnightBoard);
      requestedDates.push(url.searchParams.get("date") ?? "");
      return json({
        cancelled: false,
        source: "railinfo",
        calls: [
          { name: "Whyteleafe", crs: "WHY", scheduled: "00:50", expected: null, status: "on_time", passed: false, here: true },
          { name: "Central", crs: "", scheduled: "01:30", expected: null, status: "on_time", passed: false, here: false },
        ],
      });
    });

    await expect(provider(fetcher).load("WHY", "Whyteleafe")).resolves.toHaveLength(1);
    expect(requestedDates).toEqual(["2026-11-12"]);
  });

  it("filters past departures and sorts midnight services by actual expected or scheduled time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-11T23:55:00Z"));
    const midnightBoard = {
      ...board,
      crs: "UWL",
      name: "Upper Warlingham",
      departures: [
        { public_dep: "0050", destination: "London Victoria", status: "on_time", etd: null, cancelled: false, day: 1 },
        { public_dep: "0050", destination: "London Victoria", status: "on_time", etd: null, cancelled: false, day: 0 },
        { public_dep: "2350", destination: "London Victoria", status: "late", etd: "00:10", cancelled: false, day: 0 },
        { public_dep: "0015", destination: "London Bridge", status: "on_time", etd: null, cancelled: false, day: 1 },
        { public_dep: "0005", destination: "Bedford Midland", status: "cancelled", etd: null, cancelled: true, day: 1 },
      ],
    };
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes("/boards/")) return json(midnightBoard);
      return json({
        cancelled: false,
        source: "railinfo",
        calls: [
          { name: "Upper Warlingham", crs: "UWL", scheduled: "23:50", expected: null, status: "on_time", passed: false, here: true },
          { name: "London Victoria", crs: "VIC", scheduled: "00:30", expected: null, status: "on_time", passed: false, here: false },
        ],
      });
    });

    await expect(provider(fetcher, 8_000, () => new Date()).load("UWL", "Upper Warlingham")).resolves.toEqual([
      { destination: "Bedford Midland", scheduledTime: "00:05", expectedTime: null, status: "cancelled" },
      { destination: "London Victoria", scheduledTime: "23:50", expectedTime: "00:10", status: "delayed" },
      { destination: "London Bridge", scheduledTime: "00:15", expectedTime: null, status: "on-time" },
    ]);
  });

  it("normalizes rail timetable destination labels and fails closed on unusable live status", async () => {
    const upperBoard = {
      ...board,
      crs: "UWL",
      name: "Upper Warlingham",
      departures: [
        { public_dep: "0802", destination: "Victoria (C) (Tps Indic. Only)", status: "on_time", etd: null, cancelled: false, day: 0 },
        { public_dep: "0832", destination: "Central", status: "late", etd: "08:40", cancelled: false, day: 0 },
        { public_dep: "0902", destination: "London Victoria", status: "late", etd: null, cancelled: false, day: 0 },
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

    await expect(provider(fetcher).load("UWL", "Upper Warlingham")).resolves.toEqual([
      { destination: "London Victoria", scheduledTime: "08:02", expectedTime: null, status: "on-time" },
      { destination: "London Bridge", scheduledTime: "08:32", expectedTime: "08:40", status: "delayed" },
    ]);
  });

  it("rejects wrong-station, malformed and oversized responses", async () => {
    const wrongStation = async () => json({ ...board, name: "Coulsdon Town" });
    await expect(provider(wrongStation).load("CDS", "Coulsdon South")).rejects.toThrow("Train data unavailable");

    const malformed = async () => json({ ...board, departures: [{ destination: "Peterborough" }] });
    await expect(provider(malformed).load("CDS", "Coulsdon South")).rejects.toThrow("Train data unavailable");

    const unboundedDay = async () => json({ ...board, departures: [{ ...board.departures[1], day: 2 }] });
    await expect(provider(unboundedDay).load("CDS", "Coulsdon South")).rejects.toThrow("Train data unavailable");

    const oversized = async () => new Response(" ".repeat(65_537), { status: 200 });
    await expect(provider(oversized).load("CDS", "Coulsdon South")).rejects.toThrow("Train data unavailable");
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
        day: 0,
      })),
    };
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes("/boards/")) return json(manyDepartures);
      return new Promise<Response>((resolve) => setTimeout(() => resolve(json(service("Coulsdon South", [{ name: "Redhill", crs: "RDH" }]))), 15));
    });

    const outcome = provider(fetcher, 20).load("CDS", "Coulsdon South");
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
      provider(fetcher, 20).load("WHY", "Whyteleafe"),
      new Promise<string>((resolve) => setTimeout(() => resolve("still pending"), 100)),
    ]);

    await expect(outcome).rejects.toThrow("Train data unavailable");
    expect(signal?.aborted).toBe(true);
  });
});
