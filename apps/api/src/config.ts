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
  GOOGLE_CALENDAR_H_AND_CHANTELE: requiredText, GOOGLE_CALENDAR_ALL: requiredText, GOOGLE_CALENDAR_RAFE: requiredText, GOOGLE_CALENDAR_H: requiredText, GOOGLE_CALENDAR_CHANTELE: requiredText,
  EVENT_ID_SALT: requiredText,
  CALENDAR_CACHE_TTL_MS: z.coerce.number().int().nonnegative().default(300_000),
  WEATHER_CACHE_TTL_MS: z.coerce.number().int().nonnegative().default(1_800_000)
});
export type CalendarMapping = { calendarId: string; group: Group };
export type ServerConfig = ReturnType<typeof parseConfig>;
export function parseConfig(env: Record<string, string | undefined>) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) throw new Error("Invalid server configuration");
  const data = parsed.data;
  const calendars: CalendarMapping[] = [
    { calendarId: data.GOOGLE_CALENDAR_H_AND_CHANTELE, group: "h-and-chantele" }, { calendarId: data.GOOGLE_CALENDAR_ALL, group: "all" },
    { calendarId: data.GOOGLE_CALENDAR_RAFE, group: "rafe" }, { calendarId: data.GOOGLE_CALENDAR_H, group: "h" }, { calendarId: data.GOOGLE_CALENDAR_CHANTELE, group: "chantele" }
  ];
  if (new Set(calendars.map(({ calendarId }) => calendarId)).size !== calendars.length) throw new Error("Invalid server configuration");
  return { host: data.HOST, port: data.PORT, timezone: data.APP_TIMEZONE, latitude: data.DISPLAY_LATITUDE, longitude: data.DISPLAY_LONGITUDE,
    google: { clientId: data.GOOGLE_CLIENT_ID, clientSecret: data.GOOGLE_CLIENT_SECRET, refreshToken: data.GOOGLE_REFRESH_TOKEN }, calendars,
    eventIdSalt: data.EVENT_ID_SALT, calendarTtlMs: data.CALENDAR_CACHE_TTL_MS, weatherTtlMs: data.WEATHER_CACHE_TTL_MS };
}
