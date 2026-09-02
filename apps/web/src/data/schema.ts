import { z } from "zod";

const groups = ["h-and-chantele", "all", "rafe", "h", "chantele"] as const;
const outfits = ["tshirt", "long-sleeve", "hoodie", "coat", "raincoat"] as const;
const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const offsetTimestampPattern = /(Z|[+-]\d{2}:\d{2})$/;

const isRealDate = (value: string) => {
  if (!datePattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day;
};

const localDateSchema = z.string().refine(isRealDate, "Invalid calendar date");
const timestampSchema = z.string().refine(
  (value) => offsetTimestampPattern.test(value) && Number.isFinite(Date.parse(value)),
  "Timestamp must include a valid offset",
);

export const eventSchema = z.strictObject({
  id: z.string().min(1).max(200),
  title: z.string().trim().min(1).max(200),
  start: timestampSchema,
  end: timestampSchema,
  allDay: z.boolean(),
  group: z.enum(groups),
  location: z.string().trim().max(300),
}).refine((event) => Date.parse(event.end) > Date.parse(event.start), {
  message: "Event end must be after its start",
  path: ["end"],
});

const weatherSchema = z.strictObject({
  tempMaxC: z.number().finite().min(-50).max(60),
  precipitationChance: z.number().int().min(0).max(100),
  outfit: z.enum(outfits),
});

const mealSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("recipe"), title: z.string().trim().min(1).max(200) }),
  z.strictObject({ type: z.literal("out") }),
  z.strictObject({ type: z.literal("takeaway") }),
]);

const daySchema = z.strictObject({
  date: localDateSchema,
  weekday: z.enum(weekdays),
  isToday: z.boolean(),
  weather: weatherSchema.nullable(),
  events: z.array(eventSchema),
  meal: mealSchema.nullable(),
});

const addUtcDay = (date: string, days: number) => {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year!, month! - 1, day! + days));
  return value.toISOString().slice(0, 10);
};

export const displayPayloadSchema = z.strictObject({
  generatedAt: timestampSchema,
  timezone: z.literal("Europe/London"),
  yesterday: z.strictObject({
    date: localDateSchema,
    weekday: z.enum(weekdays),
    events: z.array(eventSchema),
  }),
  days: z.array(daySchema).length(7),
}).superRefine((payload, context) => {
  payload.days.forEach((day, index) => {
    if (day.isToday !== (index === 0)) {
      context.addIssue({ code: "custom", message: "Only the first day may be today", path: ["days", index, "isToday"] });
    }
    if (index > 0 && day.date !== addUtcDay(payload.days[index - 1]!.date, 1)) {
      context.addIssue({ code: "custom", message: "Display dates must be consecutive", path: ["days", index, "date"] });
    }
  });
  if (payload.yesterday.date !== addUtcDay(payload.days[0]!.date, -1)) {
    context.addIssue({ code: "custom", message: "Yesterday must precede today", path: ["yesterday", "date"] });
  }
});

export type DisplayPayload = z.infer<typeof displayPayloadSchema>;
export type DisplayDay = z.infer<typeof daySchema>;
export type EventOccurrence = z.infer<typeof eventSchema>;
