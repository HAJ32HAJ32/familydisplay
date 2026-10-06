# Family Display

Family Display is a shipped, read-only household kiosk. Its dominant Today panel shares the top row with a top-right rail containing the permanent calendar key, any countdowns and quiet Previous day context; six compact upcoming-day cards span the lower row. Previous day is events-only. Today and the six upcoming dates each combine calendar events, Open-Meteo conditions, a server-derived outfit suggestion and, when configured, Sous dinner data. Today also shows a live clock and, when relevant, the Tuesday bin reminder, the next West Ham game and an optional morning quote.

Deployment status must be established from the live user service and checkout, not inferred from repository documentation or a passing branch build. The dated operator evidence and release procedure live in [`docs/deployment.md`](docs/deployment.md).

## Current behaviour

- Exactly two read-only Google Calendars are configured: Family and BAES.
- Google event colours map to six visible household groups: grape (`3`) → H + Chantele, blueberry (`9`) → All, basil (`10`) → Rafe, graphite (`8`) → H, Beetroot calendar label (or the legacy banana colour `5`) → Chantele, and tangerine (`6`) → Home. Missing or unsupported colours use the source default: All for Family and H + Chantele for BAES.
- Today, Previous day and each future card render every event that fits their measured space. A `+N more` row appears only when remaining events would overflow the available height.
- Today shows a live 24-hour clock. Timed events that have finished collapse into a quiet “N done” count beside the schedule heading; the event happening now gets a ring and a “Now” tag, and the next one a “Next” tag.
- All-day events say “All day” on Today. Compact all-day events show no time marker and keep their title on one bounded row; their accessible label still says “All day”.
- Multi-day events (all-day runs of two or more days, or timed events lasting at least 24 hours) appear on Today with “Until Sat” and as bars spanning the upcoming cards. Up to two bars stack; any further overlapping event returns to each day’s list. Below 900px wide, multi-day events are listed inside each card instead.
- Open-Meteo supplies seven-day conditions, high and low temperatures, precipitation, sunrise and sunset, plus hourly readings. Outfit guidance is derived server-side using precipitation-first thresholds applied to waking hours (07:00 to 21:00): the rain chance is the waking-hours maximum and the temperature is the middle of the waking-hours range. Today also shows when rain becomes likely (50% or more) from the current hour, as “Rain from 15:00” or “Rain now”.
- Every Tuesday, Today shows which bins go out for Wednesday’s collection. Collections alternate weekly, anchored on recycling for Wednesday 7 October 2026; change `ANCHOR_COLLECTION` in `apps/api/src/bins.ts` if the schedule moves. Bank holiday changes are not handled.
- Add `#countdown` to any Google Calendar event title to count down to it. The rail shows the three nearest tagged events within 180 days (“Today”, “Tomorrow” or “N days”), and the tag is hidden wherever the event appears.
- If the calendar has not updated for over an hour, or the board is still showing a previous day, a prominent warning replaces the quiet “offline” note.
- On the TV layout, the whole board shifts by a pixel or two every six minutes to reduce screen burn-in.
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

- `/`: kiosk display
- `/api/today`: schema-validated display payload
- `/healthz`: shallow process health (`{"status":"ok"}`)

Production is operated by a systemd user service on the VPS and listens directly on the Tailscale address `100.72.212.14:3000`. See [`docs/deployment.md`](docs/deployment.md); that private address is an operating detail, not permission to expose port 3000 publicly. Read back the live checkout and service state for the current release identity.

## Development

Build the frontend once, then run the API watcher:

```sh
npm run build -w @family-display/web
npm run dev
```

For frontend-only work, `npm run dev:web` starts Vite, but `/api/today` must still be available on the same origin. The canonical fixture is `packages/contract/fixtures/today.json`.

## Resilience and privacy

The browser polls every five minutes, applies a ten-second request timeout and stores only the latest schema-valid snapshot under `family-display:last-good:v2`. A failed refresh keeps the last valid board visible and marks it offline.

Open-Meteo, Sous and morning-quote responses use a 65,536-byte bounded JSON reader and runtime response schemas. Each Google Calendar request has a ten-second timeout and requests at most 2,500 occurrences per page, but pagination follows `nextPageToken` without a maximum total page count. Google upstream responses are not byte-capped or runtime-schema-validated at that boundary. Data from every provider is normalized and the resulting aggregate payload must pass the shared display contract. The server uses coalescing TTL caches (calendar and Sous: five minutes; weather and countdowns: thirty minutes; morning quote: six hours), provider-specific stale data where available, and a last complete valid payload as its final fallback. A same-date quote refresh failure retains a cached quote as stale; without a cached quote, the quote is omitted and the board remains usable but stale. Without live or stale data for the required board content, the server returns a redacted error.

Secrets, raw calendar IDs, attendee data, descriptions, coordinates and upstream error bodies must never be committed, logged or sent to the browser.

## Known limitations

- Candidate browser geometry was checked in Chromium at 1920×1080 (the TV) and 1366×768 with a busy Tuesday fixture (bin reminder, West Ham game, quote, three countdowns, three multi-day events and six Today events): board and scroll dimensions match the viewport and the Today date column, Today aside and rail fit without overflow. At 1366×768 the quote is hidden when the bin reminder and West Ham game are both showing, and Previous day may only have room for an “N events” summary when countdowns are present. That check used a fallback font because Inter was not installed.
- Multi-day bars rely on CSS subgrid (Chromium 117 or newer).
- Physical Pi/TV overscan, clipping, cursor behaviour, viewing-distance readability, wake/reboot recovery, stale operation and midnight rollover remain outstanding.
- The stale warning appears on the display only; it does not send phone notifications.
- The application has no login of its own; privacy depends on the systemd/Tailscale network boundary.
