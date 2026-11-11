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
    status: z.enum(["on_time", "late", "cancelled"]),
    etd: displayedClockSchema.nullable(),
    cancelled: z.boolean(),
  })).max(60),
});

const serviceSchema = z.object({
  cancelled: z.boolean(),
  source: z.literal("railinfo"),
  calls: z.array(z.object({
    name: z.string().trim().min(1).max(100),
    crs: z.string().max(3),
    here: z.boolean(),
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

export class RailInfoTrainProvider {
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
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
    if (currentIndex < 0) return false;
    return service.calls.slice(currentIndex + 1).some(isLondonCall);
  }

  async load(crs: "UWL" | "CDS" | "WHY", expectedStation: "Upper Warlingham" | "Coulsdon South" | "Whyteleafe"): Promise<TrainDeparture[]> {
    const deadlineAt = Date.now() + this.timeoutMs;
    try {
      const url = new URL(`/boards/${crs}/departures`, API_ROOT);
      url.searchParams.set("limit", String(BOARD_LIMIT));
      const board = boardSchema.parse(await this.request(url, deadlineAt));
      if (board.crs !== crs || board.name !== expectedStation) throw new Error("wrong station");

      const departures: TrainDeparture[] = [];
      for (const candidate of board.departures) {
        if (departures.length === DEPARTURE_LIMIT) break;
        if (!(await this.isLondonBound(crs, board.date, candidate.public_dep, deadlineAt))) continue;

        const base = {
          destination: normalizeDestination(candidate.destination),
          scheduledTime: displayedTime(candidate.public_dep),
        };
        if (candidate.cancelled || candidate.status === "cancelled") {
          departures.push({ ...base, expectedTime: null, status: "cancelled" });
        } else if (candidate.status === "late" && candidate.etd !== null) {
          departures.push({ ...base, expectedTime: candidate.etd, status: "delayed" });
        } else if (candidate.status === "on_time" && candidate.etd === null) {
          departures.push({ ...base, expectedTime: null, status: "on-time" });
        }
      }
      return departures;
    } catch {
      throw new Error("Train data unavailable");
    }
  }
}
