import { DateTime } from "luxon";
import { z } from "zod";
import type { FootballMatch } from "@family-display/contract";
import { readBoundedJson } from "./bounded-json.js";

const WEST_HAM_TEAM_ID = "133636";
const EVENTS_URL = new URL(`https://www.thesportsdb.com/api/v1/json/123/eventsnext.php?id=${WEST_HAM_TEAM_ID}`);
const crestUrlPattern = /^https:\/\/r2\.thesportsdb\.com\/images\/media\/team\/badge\/[A-Za-z0-9._/-]+$/;
const eventSchema = z.object({
  idEvent: z.string().trim().min(1).max(100),
  strSport: z.literal("Soccer"),
  strLeague: z.string().trim().min(1).max(120),
  strTimestamp: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/),
  strHomeTeam: z.string().trim().min(1).max(100),
  idHomeTeam: z.string().regex(/^\d+$/).max(20),
  strHomeTeamBadge: z.string().regex(crestUrlPattern),
  strAwayTeam: z.string().trim().min(1).max(100),
  idAwayTeam: z.string().regex(/^\d+$/).max(20),
  strAwayTeamBadge: z.string().regex(crestUrlPattern),
  strStatus: z.string().optional(),
  strPostponed: z.string().optional(),
});
const responseSchema = z.object({ events: z.array(eventSchema).nullable() });
export type Fetcher = (input: string | URL, init?: RequestInit) => Promise<Response>;
export type CrestAsset = { body: Buffer; contentType: string; etag?: string };

async function readBoundedBytes(response: Response, maxBytes = 262_144) {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maxBytes)) throw new Error("response too large");
  if (!response.body) throw new Error("missing response body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new Error("response too large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), received);
}

export class TheSportsDbFootballProvider {
  private readonly crestSources = new Map<string, URL>();
  private readonly crestCache = new Map<string, CrestAsset>();

  constructor(private readonly fetcher: Fetcher = fetch) {}

  async load(now: Date): Promise<FootballMatch | null> {
    try {
      const response = await this.fetcher(EVENTS_URL, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error("request failed");
      const parsed = responseSchema.parse(await readBoundedJson(response));
      const candidate = (parsed.events ?? [])
        .map((event) => ({ event, kickoff: DateTime.fromISO(event.strTimestamp, { zone: "utc" }) }))
        .filter(({ event, kickoff }) => kickoff.isValid
          && kickoff.toMillis() > now.getTime()
          && (event.idHomeTeam === WEST_HAM_TEAM_ID || event.idAwayTeam === WEST_HAM_TEAM_ID)
          && event.strStatus !== "Postponed"
          && event.strPostponed !== "yes")
        .sort((left, right) => left.kickoff.toMillis() - right.kickoff.toMillis())[0];
      if (!candidate) return null;
      const { event, kickoff } = candidate;
      this.crestSources.set(event.idHomeTeam, new URL(`${event.strHomeTeamBadge.replace(/\/$/, "")}/small`));
      this.crestSources.set(event.idAwayTeam, new URL(`${event.strAwayTeamBadge.replace(/\/$/, "")}/small`));
      return {
        id: event.idEvent,
        competition: event.strLeague,
        kickoff: kickoff.setZone("Europe/London").toISO({ suppressMilliseconds: true })!,
        homeTeam: { id: event.idHomeTeam, name: event.strHomeTeam, crestUrl: `/api/football/crest/${event.idHomeTeam}` },
        awayTeam: { id: event.idAwayTeam, name: event.strAwayTeam, crestUrl: `/api/football/crest/${event.idAwayTeam}` },
      };
    } catch {
      throw new Error("Football data unavailable");
    }
  }

  async loadCrest(teamId: string): Promise<CrestAsset | null> {
    if (!/^\d+$/.test(teamId)) return null;
    const cached = this.crestCache.get(teamId);
    if (cached) return cached;
    const source = this.crestSources.get(teamId);
    if (!source) return null;
    try {
      const response = await this.fetcher(source, {
        headers: { Accept: "image/png,image/jpeg,image/webp" },
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
      });
      const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim();
      if (!response.ok || !contentType || !["image/png", "image/jpeg", "image/webp"].includes(contentType)) return null;
      const body = await readBoundedBytes(response);
      const etag = response.headers.get("etag") ?? undefined;
      const asset: CrestAsset = { body, contentType, ...(etag ? { etag } : {}) };
      this.crestCache.set(teamId, asset);
      return asset;
    } catch {
      return null;
    }
  }
}
