# Family Display

A read-only household kiosk showing yesterday, today, and the next six days from five Google Calendars, with Open-Meteo weather and a server-generated outfit suggestion. The Fastify API serves the production React build and `/api/*` from one origin.

## Requirements

- Node.js 20 or newer
- npm
- Google OAuth credentials with the read-only Calendar scope
- A private deployment route, preferably Tailscale; do not expose household calendar data on an unauthenticated public URL

## Configure

Copy `.env.example` to a server-only environment file and replace every placeholder. Do not commit it.

The five `GOOGLE_CALENDAR_*` values map calendar IDs to the fixed household display groups. `APP_TIMEZONE` must remain `Europe/London`. Latitude, longitude, OAuth material, calendar IDs, and `EVENT_ID_SALT` stay on the server and are never returned to the browser.

The Google OAuth grant must use only:

```text
https://www.googleapis.com/auth/calendar.readonly
```

## Install, verify, and build

```sh
npm ci
npm test
npm run lint
npm run typecheck
npm run build
```

The repository does not currently define a separate formatting command. ESLint and TypeScript checks are the formatting/static-quality gate.

## Run the production service

Export the configured environment values, then start the built API:

```sh
npm run start -w @family-display/api
```

By default the service listens on port `3000` and serves:

- `/` — the kiosk display
- `/api/today` — the validated display payload
- `/healthz` — shallow process health (`{"status":"ok"}`)

Point Chromium kiosk mode at the private service URL. The application is intentionally non-interactive: no calendar editing, forms, account UI, or navigation.

## Development

Run the API watcher after building the frontend once:

```sh
npm run build -w @family-display/web
npm run dev
```

For frontend-only styling work, `npm run dev:web` starts Vite, but `/api/today` must still be provided on the same origin (for example through a local reverse proxy). The canonical fixture is `packages/contract/fixtures/today.json`.

## Resilience and privacy

The browser polls every five minutes, times requests out after ten seconds, and retains the latest schema-valid response in local storage. Failed refreshes keep the last valid display visible and mark it offline. The server uses bounded provider caches and returns only redacted errors when no valid live or stale payload exists.

Secrets, raw calendar IDs, attendee data, descriptions, coordinates, and upstream error bodies must never be committed, logged, or sent to the browser. See `docs/implementation-plan.md` for the complete contract, behaviour, and release acceptance criteria.
