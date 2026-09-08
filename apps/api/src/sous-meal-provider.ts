import { mealSchema, type Meal } from "@family-display/contract";
import { z } from "zod";
import type { Fetcher } from "./open-meteo-provider.js";
import { readBoundedJson } from "./bounded-json.js";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year!, month! - 1, day!));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month! - 1 && parsed.getUTCDate() === day;
}, "Invalid meal date");
const feedSchema = z.strictObject({
  meals: z.array(z.discriminatedUnion("type", [
    z.strictObject({ date: dateSchema, type: z.literal("recipe"), title: z.string().trim().min(1).max(200) }),
    z.strictObject({ date: dateSchema, type: z.literal("out") }),
    z.strictObject({ date: dateSchema, type: z.literal("takeaway") })
  ])).max(7)
});

export class SousMealProvider {
  private readonly endpoint: URL;

  constructor(endpoint: string, private readonly token: string, private readonly fetcher: Fetcher = fetch) {
    this.endpoint = new URL(endpoint);
    if (this.endpoint.protocol !== "https:" || this.endpoint.username || this.endpoint.password) throw new Error("Invalid meal provider configuration");
  }

  async load(startDate: string, endDate: string): Promise<Map<string, Meal>> {
    const url = new URL(this.endpoint);
    url.searchParams.set("start_date", startDate);
    url.searchParams.set("end_date", endDate);
    try {
      const response = await this.fetcher(url, {
        headers: { Accept: "application/json", Authorization: `Bearer ${this.token}` },
        redirect: "error",
        signal: AbortSignal.timeout(10_000)
      });
      if (!response.ok) throw new Error("request failed");
      const parsed = feedSchema.parse(await readBoundedJson(response));
      const output = new Map<string, Meal>();
      for (const { date, ...meal } of parsed.meals) {
        if (date < startDate || date > endDate || output.has(date)) throw new Error("invalid meal date");
        output.set(date, mealSchema.parse(meal));
      }
      return output;
    } catch {
      throw new Error("Meal data unavailable");
    }
  }
}
