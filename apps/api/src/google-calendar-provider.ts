import type { EventOccurrence } from "@family-display/contract";
import type { CalendarMapping } from "./config.js";
import { normalizeGoogleEvent, type RawGoogleEvent } from "./events.js";

export type ListArguments = { calendarId: string; timeMin: string; timeMax: string; singleEvents: true; timeZone: "Europe/London"; pageToken?: string; maxResults: number };
export interface CalendarApi { events: { list(args: ListArguments): Promise<{ data: { items?: RawGoogleEvent[] | null; nextPageToken?: string | null } }> } }
export class GoogleCalendarProvider {
  constructor(private readonly mappings: CalendarMapping[], private readonly salt: string, private readonly api: CalendarApi) {}
  async load(from: string, to: string): Promise<EventOccurrence[]> {
    const output: EventOccurrence[] = [];
    for (const mapping of this.mappings) {
      let pageToken: string | undefined;
      do {
        const response = await this.api.events.list({ calendarId: mapping.calendarId, timeMin: from, timeMax: to, singleEvents: true, timeZone: "Europe/London", maxResults: 2500, ...(pageToken ? { pageToken } : {}) });
        for (const raw of response.data.items ?? []) { const event = normalizeGoogleEvent(mapping, raw, this.salt); if (event) output.push(event); }
        pageToken = response.data.nextPageToken ?? undefined;
      } while (pageToken);
    }
    return output;
  }
}
