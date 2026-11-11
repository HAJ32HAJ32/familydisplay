import { DateTime } from "luxon";
import { z } from "zod";
import type { TrainDeparture } from "@family-display/contract";
import { readBoundedJson } from "./bounded-json.js";

const API_ROOT = "https://api.railinfo.uk";
const BOARD_LIMIT = 18;
const DEPARTURE_LIMIT = 3;
const DEFAULT_TIMEOUT_MS = 8_000;

const clockSchema = z.string().regex(/^(?:[01]\d|2[0-3])[0-5]\d$/);
const displayedClockSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

const boardSchema = z.object({
  crs: z.string().length(3),
  name: z.string().trim().min(1).max(100),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source: z.literal("railinfo"),
  kind: z.literal("departures"),
  departures: z.array(z.object({
    public_dep: clockSchema,
    destination: z.string().trim().min(1).max(100),
    status: z.string().trim().min(1).max(40),
    etd: displayedClockSchema.nullable(),
    cancelled: z.boolean(),
    day: z.number().int().min(0).max(1),
  })).max(60),
});

const serviceSchema = z.object({
  cancelled: z.boolean(),
  source: z.literal("railinfo"),
  calls: z.array(z.object({
    name: z.string().trim().min(1).max(100),
    crs: z.string().max(3),
    here: z.boolean(),
    passed: z.boolean().nullable().optional(),
  })).min(1).max(100),
});

const londonCrs = new Set([
  "BFR", "CST", "CTK", "EUS", "FPK", "KGX", "LBG", "LST", "MYB", "PAD", "SPL", "VIC", "WAT", "ZFD",
]);

const londonNames = new Set([
  "city thameslink",
  "farringdon",
  "london blackfriars",
  "london bridge",
  "london charing cross",
  "london euston",
  "london finsbury park",
  "london kings cross",
  "london liverpool street",
  "london marylebone",
  "london paddington",
  "london st pancras international",
  "london victoria",
  "london waterloo",
  "st pancras low level",
]);

function normalizeDestination(value: string) {
  if (value === "Victoria (C) (Tps Indic. Only)") return "London Victoria";
  if (value === "Central") return "London Bridge";
  return value;
}

function normalizeCallingPoint(value: string) {
  if (value === "Victoria (C) (Tps Indic. Only)") return "London Victoria";
  if (value === "Central" || value === "Eastern") return "London Bridge";
  return value.replace(/\s+\(C\)$/u, "");
}

function isLondonCall(call: { name: string; crs: string }) {
  return londonCrs.has(call.crs) || londonNames.has(normalizeCallingPoint(call.name).toLowerCase());
}

function displayedTime(value: string) {
  return `${value.slice(0, 2)}:${value.slice(2)}`;
}

function departureDate(boardDate: string, day: number) {
  const date = DateTime.fromISO(boardDate, { zone: "Europe/London" }).plus({ days: day });
  if (!date.isValid) throw new Error("invalid board date");
  return date.toISODate()!;
}

function departureInstant(boardDate: string, candidate: z.infer<typeof boardSchema>["departures"][number]) {
  const date = departureDate(boardDate, candidate.day);
  const scheduled = DateTime.fromISO(`${date}T${displayedTime(candidate.public_dep)}`, { zone: "Europe/London" });
  if (!scheduled.isValid) throw new Error("invalid departure time");
  if (candidate.status !== "late" || candidate.etd === null) return scheduled;
  const expected = DateTime.fromISO(`${date}T${candidate.etd}`, { zone: "Europe/London" });
  if (!expected.isValid) throw new Error("invalid expected time");
  return expected < scheduled ? expected.plus({ days: 1 }) : expected;
}

function normalizeDeparture(candidate: z.infer<typeof boardSchema>["departures"][number]): TrainDeparture | null {
  const base = {
    destination: normalizeDestination(candidate.destination),
    scheduledTime: displayedTime(candidate.public_dep),
  };
  if (candidate.cancelled || candidate.status === "cancelled") {
    return { ...base, expectedTime: null, status: "cancelled" };
  }
  if (candidate.status === "late" && candidate.etd !== null) {
    return { ...base, expectedTime: candidate.etd, status: "delayed" };
  }
  if (candidate.status === "on_time" && candidate.etd === null) {
    return { ...base, expectedTime: null, status: "on-time" };
  }
  return null;
}

export class RailInfoTrainProvider {
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private async request(url: URL, deadlineAt: number) {
    const remainingMs = deadlineAt - Date.now();
    if (remainingMs <= 0) throw new Error("timeout");
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        controller.abort("timeout");
        reject(new Error("timeout"));
      }, remainingMs);
    });
    try {
      const response = await Promise.race([
        this.fetcher(url, { headers: { Accept: "application/json" }, redirect: "error", signal: controller.signal }),
        timedOut,
      ]);
      if (!response.ok) throw new Error("upstream status");
      return await readBoundedJson(response);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private async isLondonBound(crs: string, date: string, publicDeparture: string, deadlineAt: number) {
    const url = new URL("/services/lookup", API_ROOT);
    url.searchParams.set("crs", crs);
    url.searchParams.set("dep", publicDeparture);
    url.searchParams.set("date", date);
    const service = serviceSchema.parse(await this.request(url, deadlineAt));
    const currentIndex = service.calls.findIndex((call) => call.here || call.crs === crs);
    if (currentIndex < 0 || service.calls[currentIndex]!.passed !== false) return false;
    return service.calls.slice(currentIndex + 1).some(isLondonCall);
  }

  async load(crs: "UWL" | "CDS" | "WHY", expectedStation: "Upper Warlingham" | "Coulsdon South" | "Whyteleafe"): Promise<TrainDeparture[]> {
    const deadlineAt = Date.now() + this.timeoutMs;
    try {
      const url = new URL(`/boards/${crs}/departures`, API_ROOT);
      url.searchParams.set("limit", String(BOARD_LIMIT));
      const board = boardSchema.parse(await this.request(url, deadlineAt));
      if (board.crs !== crs || board.name !== expectedStation) throw new Error("wrong station");

      const candidates = board.departures
        .flatMap((candidate) => {
          const departure = normalizeDeparture(candidate);
          if (departure === null) return [];
          const instant = departureInstant(board.date, candidate);
          if (instant.plus({ minutes: 1 }).toMillis() <= this.clock().getTime()) return [];
          return [{ candidate, departure, instant }];
        })
        .sort((left, right) => left.instant.toMillis() - right.instant.toMillis());

      const departures: TrainDeparture[] = [];
      for (const { candidate, departure } of candidates) {
        if (departures.length === DEPARTURE_LIMIT) break;
        if (!(await this.isLondonBound(crs, departureDate(board.date, candidate.day), candidate.public_dep, deadlineAt))) continue;
        departures.push(departure);
      }
      return departures;
    } catch {
      throw new Error("Train data unavailable");
    }
  }
}
