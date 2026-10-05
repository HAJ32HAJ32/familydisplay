import { displayPayloadSchema, type Countdown, type DisplayPayload, type EventOccurrence, type FootballMatch, type Meal, type MorningQuote } from "@family-display/contract";
import { DateTime } from "luxon";
import { binReminder } from "./bins.js";
import { RefreshCache } from "./cache.js";
import { createDateWindow, londonTimestamp, TIMEZONE, weekday } from "./date-window.js";
import { eventDateSpan, groupEventsByDate, hasCountdownTag, isMultiDay, sortEvents, withoutCountdownTag } from "./events.js";
import { summariseWeather } from "./weather-summary.js";
export { weatherCondition } from "./weather-condition.js";

export type RawWeather = { tempMaxC: number; precipitationChance: number; weatherCode: number; tempMinC?: number | null; sunrise?: string | null; sunset?: string | null; hours?: Array<{ hour: number; tempC: number | null; precipitationChance: number | null }> };
export interface CalendarSource { load(from: string, to: string): Promise<EventOccurrence[]> }
export interface WeatherSource { load(startDate: string, endDate: string): Promise<Map<string, RawWeather>> }
export interface MealSource { load(startDate: string, endDate: string): Promise<Map<string, Meal>> }
export interface MorningQuoteSource { load(date: string): Promise<MorningQuote> }
export interface FootballSource { load(now: Date): Promise<FootballMatch | null> }
export class DisplayDataUnavailableError extends Error {
  override readonly name = "DisplayDataUnavailableError";

  constructor() {
    super("Display data unavailable");
  }
}
const COUNTDOWN_HORIZON_DAYS = 180;
const MAX_COUNTDOWNS = 4;
const MAX_MULTI_DAY_EVENTS = 20;
export function countdownsFrom(events: EventOccurrence[], today: string): Countdown[] {
  const start = DateTime.fromISO(today, { zone: TIMEZONE });
  return sortEvents(events.filter((event) => hasCountdownTag(event.title)))
    .map((event) => ({ event: withoutCountdownTag(event), date: eventDateSpan(event).firstDate }))
    .filter(({ date }) => date >= today)
    .map(({ event, date }) => ({ id: event.id, title: event.title, date, daysAway: Math.round(DateTime.fromISO(date, { zone: TIMEZONE }).diff(start, "days").days), group: event.group }))
    .filter((countdown) => countdown.daysAway <= COUNTDOWN_HORIZON_DAYS)
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
    .slice(0, MAX_COUNTDOWNS);
}
export class DisplayService {
  private readonly calendarCache: RefreshCache<EventOccurrence[]>; private readonly weatherCache: RefreshCache<Map<string, RawWeather>>; private readonly mealCache: RefreshCache<Map<string, Meal>>; private readonly quoteCache: RefreshCache<MorningQuote>; private readonly footballCache: RefreshCache<FootballMatch | null>; private readonly countdownCache: RefreshCache<EventOccurrence[]>; private lastCalendarEvents?: EventOccurrence[]; private lastCalendarSuccessAt?: Date; private lastMeals?: Map<string, Meal>; private lastCountdownEvents?: EventOccurrence[];
  constructor(private readonly calendars: CalendarSource, private readonly weather: WeatherSource, private readonly options: { clock?: () => Date; calendarTtlMs?: number; weatherTtlMs?: number; meals?: MealSource; mealTtlMs?: number; morningQuote?: MorningQuoteSource; quoteTtlMs?: number; football?: FootballSource; footballTtlMs?: number; countdownCalendar?: CalendarSource; countdownTtlMs?: number } = {}) {
    this.calendarCache = new RefreshCache(options.calendarTtlMs ?? 300_000); this.weatherCache = new RefreshCache(options.weatherTtlMs ?? 1_800_000); this.mealCache = new RefreshCache(options.mealTtlMs ?? 300_000); this.quoteCache = new RefreshCache(options.quoteTtlMs ?? 21_600_000); this.footballCache = new RefreshCache(options.footballTtlMs ?? 14_400_000); this.countdownCache = new RefreshCache(options.countdownTtlMs ?? 1_800_000);
  }
  async getToday(): Promise<{ payload: DisplayPayload; stale: boolean }> {
    const now = (this.options.clock ?? (() => new Date()))(); const window = createDateWindow(now);
    let calendarResult: { value: EventOccurrence[]; stale: boolean };
    try { calendarResult = await this.calendarCache.get(() => this.calendars.load(window.from.toISO()!, window.to.toISO()!), `${window.from.toISO()}|${window.to.toISO()}`); }
    catch { if (this.lastCalendarEvents) calendarResult = { value: this.lastCalendarEvents, stale: true }; else throw new DisplayDataUnavailableError(); }
    this.lastCalendarEvents = calendarResult.value;
    if (!calendarResult.stale || !this.lastCalendarSuccessAt) this.lastCalendarSuccessAt = now;
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
    let footballResult: { value: FootballMatch | null; stale: boolean } = { value: null, stale: false };
    if (this.options.football) {
      try { footballResult = await this.footballCache.get(() => this.options.football!.load(now), "west-ham-next"); }
      catch { footballResult = { value: null, stale: true }; }
      if (footballResult.value && Date.parse(footballResult.value.kickoff) <= now.getTime()) footballResult = { value: null, stale: footballResult.stale };
    }
    let countdownResult: { value: EventOccurrence[]; stale: boolean } = { value: [], stale: false };
    if (this.options.countdownCalendar) {
      const horizon = DateTime.fromISO(window.dates[0], { zone: TIMEZONE }).plus({ days: COUNTDOWN_HORIZON_DAYS + 1 });
      try {
        countdownResult = await this.countdownCache.get(() => this.options.countdownCalendar!.load(window.from.toISO()!, horizon.toISO()!), window.dates[0]);
        this.lastCountdownEvents = countdownResult.value;
      } catch {
        countdownResult = { value: this.lastCountdownEvents ?? [], stale: true };
      }
    }
    const events = calendarResult.value.map(withoutCountdownTag);
    const grouped = groupEventsByDate(events, [window.yesterday, ...window.dates]);
    const multiDay = sortEvents(events.filter(isMultiDay))
      .map((event) => ({ ...event, ...eventDateSpan(event) }))
      .filter(({ firstDate, lastDate }) => firstDate <= window.dates[6] && lastDate >= window.dates[0])
      .slice(0, MAX_MULTI_DAY_EVENTS);
    const multiDayIds = new Set(multiDay.map(({ id }) => id));
    const currentHour = DateTime.fromJSDate(now, { zone: TIMEZONE }).hour;
    const payload = displayPayloadSchema.parse({ generatedAt: londonTimestamp(now), calendarUpdatedAt: londonTimestamp(this.lastCalendarSuccessAt), timezone: "Europe/London", morningQuote: quoteResult.value, nextMatch: footballResult.value,
      binReminder: binReminder(window.dates[0]), countdowns: countdownsFrom(countdownResult.value, window.dates[0]), multiDay,
      yesterday: { date: window.yesterday, weekday: weekday(window.yesterday), events: grouped.get(window.yesterday) ?? [] },
      days: window.dates.map((date, index) => { const raw = weatherResult.value.get(date); return { date, weekday: weekday(date), isToday: index === 0,
        weather: raw ? summariseWeather(raw, index === 0 ? currentHour : 0) : null,
        events: (grouped.get(date) ?? []).filter((event) => index === 0 || !multiDayIds.has(event.id)), meal: mealResult.value.get(date) ?? null }; }) });
    return { payload, stale: calendarResult.stale || weatherResult.stale || mealResult.stale || quoteResult.stale || footballResult.stale || countdownResult.stale };
  }
}
