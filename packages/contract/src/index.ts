import { z } from "zod";

export const groups = ["h-and-chantele", "all", "rafe", "h", "chantele"] as const;
export const outfits = ["tshirt", "long-sleeve", "hoodie", "coat", "raincoat"] as const;
export const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const offsetTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const isRealDate = (value: string) => {
  if (!datePattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year!, month! - 1, day!));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month! - 1 && parsed.getUTCDate() === day;
};
const localDateSchema = z.string().refine(isRealDate, "Invalid local date");
const timestampSchema = z.string().regex(offsetTimestampPattern, "Timestamp requires an explicit offset").refine((value) => Number.isFinite(Date.parse(value)), "Invalid timestamp");

export const groupSchema = z.enum(groups);
export const outfitSchema = z.enum(outfits);
export const weekdaySchema = z.enum(weekdays);
export const eventOccurrenceSchema = z.strictObject({
  id: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(200),
  start: timestampSchema,
  end: timestampSchema,
  allDay: z.boolean(),
  group: groupSchema,
  location: z.string().trim().max(300)
}).superRefine((event, context) => {
  if (Date.parse(event.end) <= Date.parse(event.start)) context.addIssue({ code: "custom", message: "Event end must be after start", path: ["end"] });
});

export const weatherSummarySchema = z.strictObject({
  tempMaxC: z.number().finite().min(-50).max(60),
  precipitationChance: z.number().int().min(0).max(100),
  outfit: outfitSchema
});
export const mealSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("recipe"), title: z.string().trim().min(1).max(200) }),
  z.strictObject({ type: z.literal("out") }),
  z.strictObject({ type: z.literal("takeaway") })
]);
export const displayDaySchema = z.strictObject({
  date: localDateSchema,
  weekday: weekdaySchema,
  isToday: z.boolean(),
  weather: weatherSummarySchema.nullable(),
  events: z.array(eventOccurrenceSchema),
  meal: mealSchema.nullable()
});
const sevenDaysSchema = z.tuple([displayDaySchema, displayDaySchema, displayDaySchema, displayDaySchema, displayDaySchema, displayDaySchema, displayDaySchema]);

export const displayPayloadSchema = z.strictObject({
  generatedAt: timestampSchema,
  timezone: z.literal("Europe/London"),
  yesterday: z.strictObject({ date: localDateSchema, weekday: weekdaySchema, events: z.array(eventOccurrenceSchema) }),
  days: sevenDaysSchema
}).superRefine((payload, context) => {
  const dates = [payload.yesterday.date, ...payload.days.map((day) => day.date)];
  for (let index = 1; index < dates.length; index += 1) {
    const previous = new Date(`${dates[index - 1]}T00:00:00Z`);
    previous.setUTCDate(previous.getUTCDate() + 1);
    if (previous.toISOString().slice(0, 10) !== dates[index]) context.addIssue({ code: "custom", message: "Display dates must be consecutive", path: ["days", Math.max(0, index - 1), "date"] });
  }
  payload.days.forEach((day, index) => {
    if (day.isToday !== (index === 0)) context.addIssue({ code: "custom", message: "Only the first day is today", path: ["days", index, "isToday"] });
  });
});

export type Group = z.infer<typeof groupSchema>;
export type Outfit = z.infer<typeof outfitSchema>;
export type EventOccurrence = z.infer<typeof eventOccurrenceSchema>;
export type WeatherSummary = z.infer<typeof weatherSummarySchema>;
export type DisplayDay = z.infer<typeof displayDaySchema>;
export type DisplayPayload = z.infer<typeof displayPayloadSchema>;
