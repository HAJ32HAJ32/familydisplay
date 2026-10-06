import { z } from "zod";
import type { RawWeather } from "./display-service.js";
import { readBoundedJson } from "./bounded-json.js";
const supportedWeatherCodes = new Set([0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99]);
const weatherCodeSchema = z.number().int().refine((value) => supportedWeatherCodes.has(value), "Unsupported WMO weather code").nullable();
const localDateTimeSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/);
const nullableNumbers = z.array(z.number().finite().nullable());
const dailySchema = z.object({
  daily: z.strictObject({ time: z.array(z.string()), temperature_2m_max: nullableNumbers, temperature_2m_min: nullableNumbers.optional(), precipitation_probability_max: nullableNumbers, weather_code: z.array(weatherCodeSchema), sunrise: z.array(localDateTimeSchema.nullable()).optional(), sunset: z.array(localDateTimeSchema.nullable()).optional() }),
  hourly: z.strictObject({ time: z.array(localDateTimeSchema), temperature_2m: nullableNumbers, precipitation_probability: nullableNumbers }).optional()
});
export type Fetcher = (input: string | URL, init?: RequestInit) => Promise<Response>;
const clockTime = (value: string | null | undefined) => value ? value.slice(11, 16) : null;
export class OpenMeteoProvider {
  constructor(private readonly latitude: number, private readonly longitude: number, private readonly fetcher: Fetcher = fetch) {}
  async load(startDate: string, endDate: string): Promise<Map<string, RawWeather>> {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.search = new URLSearchParams({ latitude: String(this.latitude), longitude: String(this.longitude), daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,sunrise,sunset", hourly: "temperature_2m,precipitation_probability", timezone: "Europe/London", start_date: startDate, end_date: endDate }).toString();
    try {
      const response = await this.fetcher(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error("request failed");
      const parsed = dailySchema.parse(await readBoundedJson(response)); const { time, temperature_2m_max: temperatures, temperature_2m_min: lows, precipitation_probability_max: rain, weather_code: weatherCodes, sunrise, sunset } = parsed.daily;
      if (time.length !== temperatures.length || time.length !== rain.length || time.length !== weatherCodes.length) throw new Error("shape mismatch");
      if ([lows, sunrise, sunset].some((values) => values && values.length !== time.length)) throw new Error("shape mismatch");
      const hourly = parsed.hourly;
      if (hourly && (hourly.time.length !== hourly.temperature_2m.length || hourly.time.length !== hourly.precipitation_probability.length)) throw new Error("shape mismatch");
      const hoursByDate = new Map<string, NonNullable<RawWeather["hours"]>>();
      hourly?.time.forEach((stamp, index) => {
        const date = stamp.slice(0, 10);
        const hours = hoursByDate.get(date) ?? [];
        hours.push({ hour: Number(stamp.slice(11, 13)), tempC: hourly.temperature_2m[index] ?? null, precipitationChance: hourly.precipitation_probability[index] ?? null });
        hoursByDate.set(date, hours);
      });
      const output = new Map<string, RawWeather>();
      time.forEach((date, index) => {
        const tempMaxC = temperatures[index]; const precipitationChance = rain[index]; const weatherCode = weatherCodes[index];
        if (tempMaxC === null || tempMaxC === undefined || precipitationChance === null || precipitationChance === undefined || weatherCode === null || weatherCode === undefined) return;
        const day: RawWeather = { tempMaxC, precipitationChance, weatherCode };
        if (lows) day.tempMinC = lows[index] ?? null;
        if (sunrise) day.sunrise = clockTime(sunrise[index]);
        if (sunset) day.sunset = clockTime(sunset[index]);
        if (hourly) day.hours = hoursByDate.get(date) ?? [];
        output.set(date, day);
      });
      return output;
    } catch { throw new Error("Weather data unavailable"); }
  }
}
