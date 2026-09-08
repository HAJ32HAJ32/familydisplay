import { z } from "zod";
import type { RawWeather } from "./display-service.js";
const dailySchema = z.object({ daily: z.strictObject({ time: z.array(z.string()), temperature_2m_max: z.array(z.number().finite().nullable()), precipitation_probability_max: z.array(z.number().finite().nullable()) }) });
export type Fetcher = (input: string | URL, init?: RequestInit) => Promise<Response>;
export class OpenMeteoProvider {
  constructor(private readonly latitude: number, private readonly longitude: number, private readonly fetcher: Fetcher = fetch) {}
  async load(startDate: string, endDate: string): Promise<Map<string, RawWeather>> {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.search = new URLSearchParams({ latitude: String(this.latitude), longitude: String(this.longitude), daily: "temperature_2m_max,precipitation_probability_max", timezone: "Europe/London", start_date: startDate, end_date: endDate }).toString();
    try {
      const response = await this.fetcher(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error("request failed");
      const parsed = dailySchema.parse(await response.json()); const { time, temperature_2m_max: temperatures, precipitation_probability_max: rain } = parsed.daily;
      if (time.length !== temperatures.length || time.length !== rain.length) throw new Error("shape mismatch");
      const output = new Map<string, RawWeather>();
      time.forEach((date, index) => {
        const tempMaxC = temperatures[index]; const precipitationChance = rain[index];
        if (tempMaxC !== null && tempMaxC !== undefined && precipitationChance !== null && precipitationChance !== undefined) output.set(date, { tempMaxC, precipitationChance });
      });
      return output;
    } catch { throw new Error("Weather data unavailable"); }
  }
}
