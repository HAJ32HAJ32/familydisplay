import { morningQuoteSchema, type MorningQuote } from "@family-display/contract";
import type { Fetcher } from "./open-meteo-provider.js";
import { readBoundedJson } from "./bounded-json.js";

export class MorningQuoteProvider {
  private readonly endpoint: URL;

  constructor(endpoint: string, private readonly token: string, private readonly fetcher: Fetcher = fetch) {
    this.endpoint = new URL(endpoint);
    if (this.endpoint.protocol !== "https:" || this.endpoint.username || this.endpoint.password) throw new Error("Invalid morning quote provider configuration");
  }

  async load(date: string): Promise<MorningQuote> {
    const url = new URL(this.endpoint);
    url.searchParams.set("date", date);
    try {
      const response = await this.fetcher(url, {
        headers: { Accept: "application/json", Authorization: `Bearer ${this.token}` },
        redirect: "error",
        signal: AbortSignal.timeout(10_000)
      });
      if (!response.ok) throw new Error("request failed");
      return morningQuoteSchema.parse(await readBoundedJson(response));
    } catch {
      throw new Error("Morning quote unavailable");
    }
  }
}
