import type { EventOccurrence } from "@family-display/contract";
import type { CalendarMapping } from "./config.js";
import { normalizeGoogleEvent, type RawGoogleEvent } from "./events.js";

export type ListArguments = { calendarId: string; timeMin: string; timeMax: string; singleEvents: true; timeZone: "Europe/London"; pageToken?: string; maxResults: number };
export type ListResponse = { data: { items?: RawGoogleEvent[] | null; nextPageToken?: string | null } };
export type CalendarResponse = { data: { labelProperties?: { eventLabels?: Array<{ id?: string | null; backgroundColor?: string | null }> | null } | null } };
export interface CalendarApi {
  calendars?: { get(args: { calendarId: string }, options?: { signal?: AbortSignal }): Promise<CalendarResponse> };
  events: { list(args: ListArguments, options?: { signal?: AbortSignal }): Promise<ListResponse> };
}

const groupByGoogleLabelBackground = {
  "#8e24aa": "h-and-chantele",
  "#3f51b5": "all",
  "#0b8043": "rafe",
  "#616161": "h",
  "#ad1457": "chantele",
  "#f4511e": "household",
} as const satisfies Record<string, EventOccurrence["group"]>;

export class GoogleCalendarProvider {
  constructor(private readonly mappings: CalendarMapping[], private readonly salt: string, private readonly api: CalendarApi, private readonly requestTimeoutMs = 10_000) {}
  private async request<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    const aborted = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener("abort", () => reject(new Error("Calendar data unavailable")), { once: true });
    });
    try {
      return await Promise.race([operation(controller.signal), aborted]);
    } catch {
      throw new Error("Calendar data unavailable");
    } finally {
      clearTimeout(timer);
    }
  }
  private list(args: ListArguments): Promise<ListResponse> {
    return this.request((signal) => this.api.events.list(args, { signal }));
  }
  private async eventLabelGroups(calendarId: string): Promise<Record<string, EventOccurrence["group"]>> {
    if (!this.api.calendars) return {};
    const response = await this.request((signal) => this.api.calendars!.get({ calendarId }, { signal }));
    const output: Record<string, EventOccurrence["group"]> = {};
    for (const label of response.data.labelProperties?.eventLabels ?? []) {
      const background = label.backgroundColor?.toLowerCase();
      const group = background ? groupByGoogleLabelBackground[background as keyof typeof groupByGoogleLabelBackground] : undefined;
      if (label.id && group) output[label.id] = group;
    }
    return output;
  }
  async load(from: string, to: string): Promise<EventOccurrence[]> {
    const output: EventOccurrence[] = [];
    for (const mapping of this.mappings) {
      const groupByEventLabelId = await this.eventLabelGroups(mapping.calendarId);
      let pageToken: string | undefined;
      do {
        const response = await this.list({ calendarId: mapping.calendarId, timeMin: from, timeMax: to, singleEvents: true, timeZone: "Europe/London", maxResults: 2500, ...(pageToken ? { pageToken } : {}) });
        for (const raw of response.data.items ?? []) { const event = normalizeGoogleEvent(mapping, raw, this.salt, groupByEventLabelId); if (event) output.push(event); }
        pageToken = response.data.nextPageToken ?? undefined;
      } while (pageToken);
    }
    return output;
  }
}
