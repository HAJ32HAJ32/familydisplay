import { displayPayloadSchema, type DisplayPayload, type EventOccurrence, type Meal, type MorningQuote, type WeatherCondition } from "@family-display/contract";
import { RefreshCache } from "./cache.js";
import { createDateWindow, londonTimestamp, weekday } from "./date-window.js";
import { groupEventsByDate } from "./events.js";
import { chooseOutfit } from "./outfit.js";

export type RawWeather = { tempMaxC: number; precipitationChance: number; weatherCode: number };
export function weatherCondition(weatherCode: number): WeatherCondition {
  if (weatherCode === 0) return "clear";
  if (weatherCode === 1 || weatherCode === 2) return "partly-cloudy";
  if (weatherCode === 3) return "cloudy";
  if (weatherCode === 45 || weatherCode === 48) return "fog";
  if (weatherCode >= 51 && weatherCode <= 57) return "drizzle";
  if (weatherCode >= 61 && weatherCode <= 67) return "rain";
  if (weatherCode >= 71 && weatherCode <= 77 || weatherCode === 85 || weatherCode === 86) return "snow";
  if (weatherCode >= 80 && weatherCode <= 82) return "showers";
  if (weatherCode >= 95) return "thunderstorm";
  return "cloudy";
}
export interface CalendarSource { load(from: string, to: string): Promise<EventOccurrence[]> }
export interface WeatherSource { load(startDate: string, endDate: string): Promise<Map<string, RawWeather>> }
export interface MealSource { load(startDate: string, endDate: string): Promise<Map<string, Meal>> }
export interface MorningQuoteSource { load(date: string): Promise<MorningQuote> }
export class DisplayDataUnavailableError extends Error {
  override readonly name = "DisplayDataUnavailableError";

  constructor() {
    super("Display data unavailable");
  }
}
export class DisplayService {
  private readonly calendarCache: RefreshCache<EventOccurrence[]>; private readonly weatherCache: RefreshCache<Map<string, RawWeather>>; private readonly mealCache: RefreshCache<Map<string, Meal>>; private readonly quoteCache: RefreshCache<MorningQuote>; private lastPayload?: DisplayPayload; private lastMeals?: Map<string, Meal>;
  constructor(private readonly calendars: CalendarSource, private readonly weather: WeatherSource, private readonly options: { clock?: () => Date; calendarTtlMs?: number; weatherTtlMs?: number; meals?: MealSource; mealTtlMs?: number; morningQuote?: MorningQuoteSource; quoteTtlMs?: number } = {}) {
    this.calendarCache = new RefreshCache(options.calendarTtlMs ?? 300_000); this.weatherCache = new RefreshCache(options.weatherTtlMs ?? 1_800_000); this.mealCache = new RefreshCache(options.mealTtlMs ?? 300_000); this.quoteCache = new RefreshCache(options.quoteTtlMs ?? 21_600_000);
  }
  async getToday(): Promise<{ payload: DisplayPayload; stale: boolean }> {
    const now = (this.options.clock ?? (() => new Date()))(); const window = createDateWindow(now);
    let calendarResult;
    try { calendarResult = await this.calendarCache.get(() => this.calendars.load(window.from.toISO()!, window.to.toISO()!), `${window.from.toISO()}|${window.to.toISO()}`); }
    catch { if (this.lastPayload) return { payload: this.lastPayload, stale: true }; throw new DisplayDataUnavailableError(); }
    let weatherResult: { value: Map<string, RawWeather>; stale: boolean };
    try { weatherResult = await this.weatherCache.get(() => this.weather.load(window.dates[0], window.dates[6]), `${window.dates[0]}|${window.dates[6]}`); }
    catch { weatherResult = { value: new Map(), stale: true }; }
    let mealResult: { value: Map<string, Meal>; stale: boolean } = { value: new Map(), stale: false };
    if (this.options.meals) {
      try {
        mealResult = await this.mealCache.get(() => this.options.meals!.load(window.dates[0], window.dates[6]), `${window.dates[0]}|${window.dates[6]}`);
        this.lastMeals = mealResult.value;
      } catch {
        mealResult = { value: this.lastMeals ?? new Map(), stale: true };
      }
    }
    let quoteResult: { value: MorningQuote | null; stale: boolean } = { value: null, stale: false };
    if (this.options.morningQuote) {
      try { quoteResult = await this.quoteCache.get(() => this.options.morningQuote!.load(window.dates[0]), window.dates[0]); }
      catch { quoteResult = { value: null, stale: true }; }
    }
    const grouped = groupEventsByDate(calendarResult.value, [window.yesterday, ...window.dates]);
    const payload = displayPayloadSchema.parse({ generatedAt: londonTimestamp(now), timezone: "Europe/London", morningQuote: quoteResult.value,
      yesterday: { date: window.yesterday, weekday: weekday(window.yesterday), events: grouped.get(window.yesterday) ?? [] },
      days: window.dates.map((date, index) => { const raw = weatherResult.value.get(date); return { date, weekday: weekday(date), isToday: index === 0,
        weather: raw ? { tempMaxC: Math.round(raw.tempMaxC * 10) / 10, precipitationChance: Math.round(raw.precipitationChance), condition: weatherCondition(raw.weatherCode), outfit: chooseOutfit(raw.tempMaxC, raw.precipitationChance) } : null,
        events: grouped.get(date) ?? [], meal: mealResult.value.get(date) ?? null }; }) });
    this.lastPayload = payload;
    return { payload, stale: calendarResult.stale || weatherResult.stale || mealResult.stale || quoteResult.stale };
  }
}
