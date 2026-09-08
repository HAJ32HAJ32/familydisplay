import { isIP } from "node:net";
import { z } from "zod";
import type { Group } from "@family-display/contract";

const requiredText = z.string().refine((value) => value.trim().length > 0);
const isPrivateBindHost = (value: string) => {
  if (isIP(value) !== 4) return false;
  if (value === "127.0.0.1") return true;
  const numbers = value.split(".").map(Number);
  return numbers[0] === 100 && numbers[1]! >= 64 && numbers[1]! <= 127;
};
const requiredNumber = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.coerce.number()
);

const schema = z.object({
  HOST: z.string().default("127.0.0.1").refine(isPrivateBindHost),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  APP_TIMEZONE: z.literal("Europe/London"),
  DISPLAY_LATITUDE: requiredNumber.pipe(z.number().min(-90).max(90)),
  DISPLAY_LONGITUDE: requiredNumber.pipe(z.number().min(-180).max(180)),
  GOOGLE_CLIENT_ID: requiredText, GOOGLE_CLIENT_SECRET: requiredText, GOOGLE_REFRESH_TOKEN: requiredText,
  GOOGLE_CALENDAR_FAMILY: requiredText, GOOGLE_CALENDAR_BAES: requiredText,
  EVENT_ID_SALT: requiredText,
  CALENDAR_CACHE_TTL_MS: z.coerce.number().int().nonnegative().default(300_000),
  WEATHER_CACHE_TTL_MS: z.coerce.number().int().nonnegative().default(1_800_000),
  MEAL_CACHE_TTL_MS: z.coerce.number().int().nonnegative().default(300_000),
  SOUS_MEALS_URL: z.string().url().refine((value) => new URL(value).protocol === "https:").optional(),
  SOUS_MEALS_TOKEN: requiredText.optional(),
  MORNING_QUOTE_URL: z.string().url().refine((value) => new URL(value).protocol === "https:").optional(),
  MORNING_QUOTE_TOKEN: requiredText.optional()
}).superRefine((data, context) => {
  if (Boolean(data.SOUS_MEALS_URL) !== Boolean(data.SOUS_MEALS_TOKEN)) context.addIssue({ code: "custom", message: "Sous URL and token must be configured together" });
  if (Boolean(data.MORNING_QUOTE_URL) !== Boolean(data.MORNING_QUOTE_TOKEN)) context.addIssue({ code: "custom", message: "Morning quote URL and token must be configured together" });
});
export type CalendarMapping = { calendarId: string; defaultGroup: Group };
export type ServerConfig = ReturnType<typeof parseConfig>;
export function parseConfig(env: Record<string, string | undefined>) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) throw new Error("Invalid server configuration");
  const data = parsed.data;
  const calendars: CalendarMapping[] = [
    { calendarId: data.GOOGLE_CALENDAR_FAMILY, defaultGroup: "all" },
    { calendarId: data.GOOGLE_CALENDAR_BAES, defaultGroup: "h-and-chantele" }
  ];
  if (new Set(calendars.map(({ calendarId }) => calendarId)).size !== calendars.length) throw new Error("Invalid server configuration");
  return { host: data.HOST, port: data.PORT, timezone: data.APP_TIMEZONE, latitude: data.DISPLAY_LATITUDE, longitude: data.DISPLAY_LONGITUDE,
    google: { clientId: data.GOOGLE_CLIENT_ID, clientSecret: data.GOOGLE_CLIENT_SECRET, refreshToken: data.GOOGLE_REFRESH_TOKEN }, calendars,
    sous: data.SOUS_MEALS_URL && data.SOUS_MEALS_TOKEN ? { url: data.SOUS_MEALS_URL, token: data.SOUS_MEALS_TOKEN } : undefined,
    morningQuote: data.MORNING_QUOTE_URL && data.MORNING_QUOTE_TOKEN ? { url: data.MORNING_QUOTE_URL, token: data.MORNING_QUOTE_TOKEN } : undefined,
    eventIdSalt: data.EVENT_ID_SALT, calendarTtlMs: data.CALENDAR_CACHE_TTL_MS, weatherTtlMs: data.WEATHER_CACHE_TTL_MS, mealTtlMs: data.MEAL_CACHE_TTL_MS };
}
