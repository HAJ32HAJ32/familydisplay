import type { BinReminder } from "@family-display/contract";
import { DateTime } from "luxon";
import { TIMEZONE } from "./date-window.js";

// Bins are collected every Wednesday and alternate weekly. Wednesday
// 7 October 2026 is a recycling week, so the week after is general waste.
// To change the schedule, move the anchor to any known collection date.
const ANCHOR_COLLECTION = { date: "2026-10-07", bin: "recycling" } as const;
const REMINDER_WEEKDAY = 2; // Tuesday, the evening before collection

export function binReminder(today: string): BinReminder | null {
  const date = DateTime.fromISO(today, { zone: TIMEZONE });
  if (date.weekday !== REMINDER_WEEKDAY) return null;
  const collection = date.plus({ days: 1 });
  const weeks = Math.round(collection.diff(DateTime.fromISO(ANCHOR_COLLECTION.date, { zone: TIMEZONE }), "weeks").weeks);
  const sameAsAnchor = Math.abs(weeks) % 2 === 0;
  return {
    bin: sameAsAnchor ? ANCHOR_COLLECTION.bin : ANCHOR_COLLECTION.bin === "recycling" ? "general" : "recycling",
    collectionDate: collection.toISODate()!
  };
}
