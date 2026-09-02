import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { resolve } from "node:path";
import type { DisplayPayload } from "@family-display/contract";
import { DisplayDataUnavailableError } from "./display-service.js";

export interface DisplayReader { getToday(): Promise<{ payload: DisplayPayload; stale: boolean }> }
export async function buildServer(options: { service: DisplayReader; webRoot?: string }) {
  const app = Fastify({ logger: false });
  app.get("/healthz", async () => ({ status: "ok" }));
  app.get("/api/today", async (_request, reply) => {
    try { const result = await options.service.getToday(); return reply.header("Cache-Control", "no-store").header("X-Data-Stale", String(result.stale)).send(result.payload); }
    catch (error) {
      if (error instanceof DisplayDataUnavailableError) return reply.status(503).header("Cache-Control", "no-store").send({ error: { code: "DISPLAY_DATA_UNAVAILABLE", message: "Display data is temporarily unavailable" } });
      throw error;
    }
  });
  app.setNotFoundHandler((_request, reply) => reply.status(404).send({ error: { code: "NOT_FOUND", message: "Resource not found" } }));
  app.setErrorHandler((_error, _request, reply) => reply.status(500).send({ error: { code: "INTERNAL_ERROR", message: "Unexpected server error" } }));
  if (options.webRoot) await app.register(fastifyStatic, { root: resolve(options.webRoot) });
  return app;
}
