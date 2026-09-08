import { z } from "zod";
import type { RawWeather } from "./display-service.js";
import { readBoundedJson } from "./bounded-json.js";
const supportedWeatherCodes = new Set([0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99]);
const weatherCodeSchema = z.number().int().refine((value) => supportedWeatherCodes.has(value), "Unsupported WMO weather code").nullable();
const dailySchema = z.object({ daily: z.strictObject({ time: z.array(z.string()), temperature_2m_max: z.array(z.number().finite().nullable()), precipitation_probability_max: z.array(z.number().finite().nullable()), weather_code: z.array(weatherCodeSchema) }) });
export type Fetcher = (input: string | URL, init?: RequestInit) => Promise<Response>;
export class OpenMeteoProvider {
  constructor(private readonly latitude: number, private readonly longitude: number, private readonly fetcher: Fetcher = fetch) {}
  async load(startDate: string, endDate: string): Promise<Map<string, RawWeather>> {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.search = new URLSearchParams({ latitude: String(this.latitude), longitude: String(this.longitude), daily: "temperature_2m_max,precipitation_probability_max,weather_code", timezone: "Europe/London", start_date: startDate, end_date: endDate }).toString();
    try {
      const response = await this.fetcher(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error("request failed");
      const parsed = dailySchema.parse(await readBoundedJson(response)); const { time, temperature_2m_max: temperatures, precipitation_probability_max: rain, weather_code: weatherCodes } = parsed.daily;
      if (time.length !== temperatures.length || time.length !== rain.length || time.length !== weatherCodes.length) throw new Error("shape mismatch");
      const output = new Map<string, RawWeather>();
      time.forEach((date, index) => {
        const tempMaxC = temperatures[index]; const precipitationChance = rain[index]; const weatherCode = weatherCodes[index];
        if (tempMaxC !== null && tempMaxC !== undefined && precipitationChance !== null && precipitationChance !== undefined && weatherCode !== null && weatherCode !== undefined) output.set(date, { tempMaxC, precipitationChance, weatherCode });
      });
      return output;
    } catch { throw new Error("Weather data unavailable"); }
  }
}
