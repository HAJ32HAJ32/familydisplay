import { DateTime } from "luxon";
export const TIMEZONE = "Europe/London";
export type DateWindow = { yesterday: string; dates: [string, string, string, string, string, string, string]; from: DateTime; to: DateTime };
export function createDateWindow(now: Date): DateWindow {
  const today = DateTime.fromJSDate(now, { zone: TIMEZONE }).startOf("day");
  const dates = Array.from({ length: 7 }, (_, index) => today.plus({ days: index }).toISODate()!);
  return { yesterday: today.minus({ days: 1 }).toISODate()!, dates: dates as DateWindow["dates"], from: today.minus({ days: 1 }), to: today.plus({ days: 7 }) };
}
export function weekday(date: string) { return DateTime.fromISO(date, { zone: TIMEZONE }).toFormat("ccc") as "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun"; }
export function londonTimestamp(date: Date) { return DateTime.fromJSDate(date, { zone: TIMEZONE }).toISO({ suppressMilliseconds: true })!; }
