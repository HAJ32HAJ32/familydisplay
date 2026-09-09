# Family Display

Family Display is a shipped, read-only household kiosk. Its dominant Today panel shares the top row with a top-right rail containing the permanent calendar key and quiet Previous day context; six compact upcoming-day cards span the lower row. Previous day is events-only. Today and the six upcoming dates each combine calendar events, Open-Meteo conditions, a server-derived outfit suggestion and, when configured, Sous dinner data. Today can also include an optional morning quote.

Commit `7d1e066` is the deployed pre-change baseline. Changes after that commit, including the hierarchy and compact all-day layout work in this unreleased branch/candidate, are not deployed until the normal release process is completed; this documentation is not deployment evidence.

## Current behaviour

- Exactly two read-only Google Calendars are configured: Family and BAES.
- Google event colours map to six visible household groups: grape (`3`) → H + Chantele, blueberry (`9`) → All, basil (`10`) → Rafe, graphite (`8`) → H, banana (`5`) → Chantele, and tangerine (`6`) → Household. Missing or unsupported colours use the source default: All for Family and H + Chantele for BAES.
- Today shows at most three events; Previous day and each future card show at most one. Additional valid events become a deterministic `+N more` row.
- All-day events show an em dash visually. Their event row retains an accessible label containing “All day”; compact all-day titles remain on the same bounded row and ellipsize instead of wrapping below the visible card.
- Open-Meteo supplies seven-day conditions, temperature and precipitation data. Outfit guidance is derived server-side using precipitation-first thresholds.
- The optional shipped Sous integration supplies dated recipe, takeaway or eating-out meals. The optional shipped morning-quote integration adds a quote to Today. Either feature remains absent when it is not configured.

The display is intentionally non-interactive: it has no calendar editing, forms, account UI or navigation.

## Requirements

- Node.js 20 or newer
- npm
- Google OAuth credentials with only `https://www.googleapis.com/auth/calendar.readonly`
- A private deployment route; never expose household calendar data through an unauthenticated public URL

## Configure

Copy `.env.example` to a protected server-only environment file and replace every placeholder. Do not commit it. Configure `GOOGLE_CALENDAR_FAMILY` and `GOOGLE_CALENDAR_BAES` with distinct IDs, keep `APP_TIMEZONE=Europe/London`, and keep OAuth material, calendar IDs, coordinates and `EVENT_ID_SALT` server-side.

`HOST` accepts only `127.0.0.1` or a Tailscale IPv4 address in `100.64.0.0/10`. Wildcard, hostname, public and ordinary LAN binds fail startup. Sous and morning quote each require both their URL and dedicated bearer token; partial configuration fails startup.

## Install, verify and build

```sh
npm ci
npm test
npm run lint
npm run typecheck
npm run build
```

The repository has no separate formatting command. ESLint and TypeScript are the static-quality gates.

## Run

```sh
npm run start -w @family-display/api
```

The Fastify service serves the production React build and API from one origin:

- `/` — kiosk display
- `/api/today` — schema-validated display payload
- `/healthz` — shallow process health (`{"status":"ok"}`)

The deployed `7d1e066` baseline is operated by an active systemd user service on the VPS and listens directly on the Tailscale address `100.72.212.14:3000`. See [`docs/deployment.md`](docs/deployment.md); that private address is an operating detail, not permission to expose port 3000 publicly. This unreleased branch and its documentation are not evidence that the candidate has been deployed.

## Development

Build the frontend once, then run the API watcher:

```sh
npm run build -w @family-display/web
npm run dev
```

For frontend-only work, `npm run dev:web` starts Vite, but `/api/today` must still be available on the same origin. The canonical fixture is `packages/contract/fixtures/today.json`.

## Resilience and privacy

The browser polls every five minutes, applies a ten-second request timeout and stores only the latest schema-valid snapshot under `family-display:last-good:v2`. A failed refresh keeps the last valid board visible and marks it offline.

Open-Meteo, Sous and morning-quote responses use a 65,536-byte bounded JSON reader and runtime response schemas. Each Google Calendar request has a ten-second timeout and requests at most 2,500 occurrences per page, but pagination follows `nextPageToken` without a maximum total page count. Google upstream responses are not byte-capped or runtime-schema-validated at that boundary. Data from every provider is normalized and the resulting aggregate payload must pass the shared display contract. The server uses coalescing TTL caches (calendar and Sous: five minutes; weather: thirty minutes; morning quote: six hours), provider-specific stale data where available, and a last complete valid payload as its final fallback. A same-date quote refresh failure retains a cached quote as stale; without a cached quote, the quote is omitted and the board remains usable but stale. Without live or stale data for the required board content, the server returns a redacted error.

Secrets, raw calendar IDs, attendee data, descriptions, coordinates and upstream error bodies must never be committed, logged or sent to the browser.

## Known limitations

- Candidate browser geometry is verified at exactly 1366×768 with a crowded local fixture: board and scroll dimensions are 1366×768, desktop rows are 416px and 288px, all six future cards are fully inside the viewport with zero scroll excess, the compact all-day dash/body/group compute to grid row 1, and a long title remains visible and ellipsized. The computed Today/compact hierarchy is weather text 21/16px, icon 72/32px, temperature 43.712/21px and outfit 21/16px.
- Screenshot capture timed out, so screenshot-based aesthetic assessment remains unverified. Physical Pi/TV overscan, clipping, cursor behaviour, viewing-distance readability, wake/reboot recovery, stale operation and midnight rollover also remain outstanding.
- The application has no login of its own; privacy depends on the systemd/Tailscale network boundary.
