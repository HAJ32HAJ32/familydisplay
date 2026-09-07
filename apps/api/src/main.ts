import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { google } from "googleapis";
import { parseConfig } from "./config.js";
import { DisplayService } from "./display-service.js";
import { GoogleCalendarProvider, type CalendarApi } from "./google-calendar-provider.js";
import { OpenMeteoProvider } from "./open-meteo-provider.js";
import { buildServer } from "./server.js";

async function main() {
  const config = parseConfig(process.env);
  const auth = new google.auth.OAuth2(config.google.clientId, config.google.clientSecret);
  auth.setCredentials({ refresh_token: config.google.refreshToken });
  const calendarApi = google.calendar({ version: "v3", auth }) as unknown as CalendarApi;
  const service = new DisplayService(new GoogleCalendarProvider(config.calendars, config.eventIdSalt, calendarApi), new OpenMeteoProvider(config.latitude, config.longitude), { calendarTtlMs: config.calendarTtlMs, weatherTtlMs: config.weatherTtlMs });
  const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../web/dist");
  const app = await buildServer({ service, webRoot });
  const shutdown = async () => { await app.close(); process.exit(0); };
  process.once("SIGINT", shutdown); process.once("SIGTERM", shutdown);
  await app.listen({ host: config.host, port: config.port });
}
main().catch(() => { process.stderr.write("Family Display failed to start: invalid configuration or server error\n"); process.exit(1); });
