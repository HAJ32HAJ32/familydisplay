import { createHash } from "node:crypto";
import { DateTime, Interval } from "luxon";
import type { EventOccurrence } from "@family-display/contract";
import type { CalendarMapping } from "./config.js";
import { TIMEZONE } from "./date-window.js";

export type RawGoogleEvent = { id?: string | null; recurringEventId?: string | null; originalStartTime?: { date?: string | null; dateTime?: string | null }; colorId?: string | null; summary?: string | null; location?: string | null; status?: string | null; start?: { date?: string | null; dateTime?: string | null }; end?: { date?: string | null; dateTime?: string | null }; attendees?: Array<{ self?: boolean | null; responseStatus?: string | null; email?: string | null }> | null; description?: string | null };
const groupByGoogleColorId = {
  "3": "h-and-chantele",
  "5": "chantele",
  "6": "household",
  "8": "h",
  "9": "all",
  "10": "rafe"
} as const satisfies Record<string, EventOccurrence["group"]>;
const localMidnight = (date: string) => DateTime.fromISO(date, { zone: TIMEZONE }).startOf("day").toISO({ suppressMilliseconds: true })!;
export function normalizeGoogleEvent(mapping: CalendarMapping, raw: RawGoogleEvent, salt: string): EventOccurrence | null {
  if (raw.status === "cancelled" || raw.attendees?.some((attendee) => attendee.self && attendee.responseStatus === "declined")) return null;
  const allDay = Boolean(raw.start?.date);
  const start = allDay ? (raw.start?.date ? localMidnight(raw.start.date) : undefined) : raw.start?.dateTime ? DateTime.fromISO(raw.start.dateTime, { setZone: true }).setZone(TIMEZONE).toISO({ suppressMilliseconds: true }) : undefined;
  const end = allDay ? (raw.end?.date ? localMidnight(raw.end.date) : undefined) : raw.end?.dateTime ? DateTime.fromISO(raw.end.dateTime, { setZone: true }).setZone(TIMEZONE).toISO({ suppressMilliseconds: true }) : undefined;
  if (!raw.id || !start || !end || Date.parse(end) <= Date.parse(start)) return null;
  const sourceOccurrence = raw.originalStartTime?.dateTime ?? raw.originalStartTime?.date ?? start;
  const id = `evt_${createHash("sha256").update(`${salt}\0${mapping.calendarId}\0${raw.id}\0${sourceOccurrence}`).digest("hex").slice(0, 20)}`;
  const group = groupByGoogleColorId[raw.colorId as keyof typeof groupByGoogleColorId] ?? mapping.defaultGroup;
  return { id, title: raw.summary?.trim().slice(0, 200) || "Untitled event", start, end, allDay, group, location: raw.location?.trim().slice(0, 300) ?? "" };
}
export function sortEvents(events: EventOccurrence[]) {
  return [...events].sort((a, b) => Number(b.allDay) - Number(a.allDay) || Date.parse(a.start) - Date.parse(b.start) || Date.parse(a.end) - Date.parse(b.end) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
}
export function groupEventsByDate(events: EventOccurrence[], dates: string[]) {
  return new Map(dates.map((date) => {
    const day = Interval.fromDateTimes(DateTime.fromISO(date, { zone: TIMEZONE }).startOf("day"), DateTime.fromISO(date, { zone: TIMEZONE }).plus({ days: 1 }).startOf("day"));
    return [date, sortEvents(events.filter((event) => {
      const interval = Interval.fromDateTimes(DateTime.fromISO(event.start, { setZone: true }), DateTime.fromISO(event.end, { setZone: true }));
      return day.overlaps(interval);
    }))] as const;
  }));
}
