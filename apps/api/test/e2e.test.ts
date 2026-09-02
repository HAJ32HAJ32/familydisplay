import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { displayPayloadSchema } from "@family-display/contract";
import { buildServer } from "../src/server.js";

describe("production same-origin integration", () => {
  it("serves the built kiosk and schema-valid API from one server", async () => {
    const fixturePath = resolve("packages/contract/fixtures/today.json");
    const payload = displayPayloadSchema.parse(JSON.parse(await readFile(fixturePath, "utf8")));
    const app = await buildServer({
      service: { getToday: async () => ({ payload, stale: false }) },
      webRoot: resolve("apps/web/dist"),
    });

    try {
      const page = await app.inject({ method: "GET", url: "/" });
      expect(page.statusCode).toBe(200);
      expect(page.body).toContain("<title>Family Display</title>");

      const scriptPath = page.body.match(/src="([^"]+\.js)"/)?.[1];
      expect(scriptPath).toBeTruthy();
      const script = await app.inject({ method: "GET", url: scriptPath! });
      expect(script.statusCode).toBe(200);
      expect(script.headers["content-type"]).toContain("javascript");

      const response = await app.inject({ method: "GET", url: "/api/today" });
      expect(response.statusCode).toBe(200);
      expect(response.headers["x-data-stale"]).toBe("false");
      expect(displayPayloadSchema.parse(response.json())).toEqual(payload);
    } finally {
      await app.close();
    }
  });
});
