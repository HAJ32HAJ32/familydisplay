import { displayPayloadSchema, type DisplayPayload, type EventOccurrence } from "@family-display/contract";
import { RefreshCache } from "./cache.js";
import { createDateWindow, londonTimestamp, weekday } from "./date-window.js";
import { groupEventsByDate } from "./events.js";
import { chooseOutfit } from "./outfit.js";

export type RawWeather = { tempMaxC: number; precipitationChance: number };
export interface CalendarSource { load(from: string, to: string): Promise<EventOccurrence[]> }
export interface WeatherSource { load(startDate: string, endDate: string): Promise<Map<string, RawWeather>> }
export class DisplayDataUnavailableError extends Error {
  override readonly name = "DisplayDataUnavailableError";

  constructor() {
    super("Display data unavailable");
  }
}
export class DisplayService {
  private readonly calendarCache: RefreshCache<EventOccurrence[]>; private readonly weatherCache: RefreshCache<Map<string, RawWeather>>; private lastPayload?: DisplayPayload;
  constructor(private readonly calendars: CalendarSource, private readonly weather: WeatherSource, private readonly options: { clock?: () => Date; calendarTtlMs?: number; weatherTtlMs?: number } = {}) {
    this.calendarCache = new RefreshCache(options.calendarTtlMs ?? 300_000); this.weatherCache = new RefreshCache(options.weatherTtlMs ?? 1_800_000);
  }
  async getToday(): Promise<{ payload: DisplayPayload; stale: boolean }> {
    const now = (this.options.clock ?? (() => new Date()))(); const window = createDateWindow(now);
    let calendarResult;
    try { calendarResult = await this.calendarCache.get(() => this.calendars.load(window.from.toISO()!, window.to.toISO()!)); }
    catch { if (this.lastPayload) return { payload: this.lastPayload, stale: true }; throw new DisplayDataUnavailableError(); }
    let weatherResult: { value: Map<string, RawWeather>; stale: boolean };
    try { weatherResult = await this.weatherCache.get(() => this.weather.load(window.dates[0], window.dates[6])); }
    catch { weatherResult = { value: new Map(), stale: true }; }
    const grouped = groupEventsByDate(calendarResult.value, [window.yesterday, ...window.dates]);
    const payload = displayPayloadSchema.parse({ generatedAt: londonTimestamp(now), timezone: "Europe/London",
      yesterday: { date: window.yesterday, weekday: weekday(window.yesterday), events: grouped.get(window.yesterday) ?? [] },
      days: window.dates.map((date, index) => { const raw = weatherResult.value.get(date); return { date, weekday: weekday(date), isToday: index === 0,
        weather: raw ? { tempMaxC: Math.round(raw.tempMaxC * 10) / 10, precipitationChance: Math.round(raw.precipitationChance), outfit: chooseOutfit(raw.tempMaxC, raw.precipitationChance) } : null,
        events: grouped.get(date) ?? [], meal: null }; }) });
    this.lastPayload = payload;
    return { payload, stale: calendarResult.stale || weatherResult.stale };
  }
}
