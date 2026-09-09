# Family Display implementation record

## 1. Product status

Family Display is a shipped read-only household kiosk, not a prospective scaffold. The hierarchy and compact all-day behaviour described here are implemented and browser-verified. Deployment identity must be read from the live checkout and systemd user service; this document is not deployment evidence.

Work shipped by the baseline includes:

- npm-workspace TypeScript application with a shared Zod contract;
- same-origin Fastify API and React/Vite production UI;
- two read-only Google Calendar sources (Family and BAES), recurring-instance expansion and event-colour group mapping;
- Open-Meteo conditions and server-side outfit guidance for Today and six future dates;
- optional Sous meals and optional morning quote providers;
- browser polling/cache recovery and server provider/payload fallback;
- the dominant Today, top-right rail and six-card desktop composition;
- permanent calendar key, filled high-contrast event pills and deterministic visible overflow.

Still deferred are chores/rewards, calendar editing, event modals, touchscreen interaction, user accounts, settings and admin UI. Physical Raspberry Pi/TV acceptance for the visual changes is outstanding.

## 2. Architecture and privacy boundary

The repository contains three npm workspaces:

```text
apps/api/          Fastify server, providers, aggregation and static serving
apps/web/          React/Vite kiosk UI
packages/contract/ shared Zod schemas, types and canonical fixture
```

The server owns OAuth, raw Family/BAES IDs, Google colour mapping, Open-Meteo coordinates, Europe/London date boundaries, recurrence expansion, sorting, outfit rules, optional provider credentials and response validation. The browser receives only the normalized display contract.

The browser owns loading/unavailable/rendered states, responsive presentation, five-minute polling, ten-second request timeout, schema validation, freshness display, the last-good snapshot and daily recovery reload. It must not calculate authoritative dates/groups/outfits or contact providers directly.

The application has no login. Deployment privacy is enforced by the systemd user service plus the private Tailscale listener currently at `100.72.212.14:3000`. Wildcard, public, hostname and ordinary LAN binds are rejected. Household data must not be exposed on an unauthenticated public URL.

## 3. Current data contract

`GET /api/today` returns a strict `DisplayPayload`:

- offset-aware `generatedAt`;
- `timezone: "Europe/London"`;
- `morningQuote`, either a validated quote or `null`;
- a separate `yesterday` date with sorted events;
- exactly seven ordered `days`, Today first, each with weather or `null`, events and a meal or `null`.

An event contains an opaque ID, bounded title/location, offset-aware start/end, `allDay` and one group. A weather summary contains temperature, precipitation chance, Open-Meteo condition and outfit. A meal is a dated recipe title, takeaway or eating-out value. The morning quote has bounded text and attribution.

The API uses `Cache-Control: no-store` and `X-Data-Stale` to distinguish fresh from fallback payloads. `/healthz` is shallow and provider-independent. Errors are redacted; raw provider bodies, tokens, calendar IDs, coordinates, attendee data and descriptions are never returned.

## 4. Calendar behaviour

Exactly two calendars are configured:

- Family defaults to `all`;
- BAES defaults to `h-and-chantele`.

Recognized event `colorId` values override the source default:

| Google colour | ID | Display group |
| --- | --- | --- |
| Grape | `3` | H + Chantele |
| Blueberry | `9` | All |
| Basil | `10` | Rafe |
| Graphite | `8` | H |
| Banana | `5` | Chantele |
| Tangerine | `6` | Household |

The adapter uses `calendar.readonly`, expanded recurring events and pagination. Cancelled and self-declined events are removed; blank titles become `Untitled event`. Events are assigned to every local day they overlap and sorted all-day first, then by start, end, title and opaque ID.

## 5. Weather, outfit, meals and quote

Open-Meteo is called server-side with configured coordinates and `timezone=Europe/London`. It provides daily maximum temperature, precipitation probability and condition for the seven display dates. Missing forecast dates become `weather: null` without removing calendar content.

Outfit selection is precipitation-first:

1. precipitation chance over 50% → raincoat;
2. otherwise temperature over 20°C → T-shirt;
3. otherwise at least 14°C → long sleeve;
4. otherwise at least 8°C → hoodie;
5. otherwise → coat.

Sous meals are shipped but optional. When both URL and token are configured, the server requests the explicit seven-day range and accepts recipe, takeaway and eating-out values. The morning quote is also shipped but optional and receives only Today’s date. Missing configuration leaves those fields empty. On a same-date quote refresh failure, an available cached quote is retained and marked stale; without a cached quote, the quote is omitted and the board remains usable but stale. Other provider failures use cached data where possible and mark the aggregate stale.

Open-Meteo, Sous and morning-quote responses use the 65,536-byte bounded JSON reader and runtime response schemas. Each Google Calendar request has a ten-second timeout and requests at most 2,500 occurrences per page, but pagination follows `nextPageToken` without a maximum total page count. Google upstream responses are not byte-capped or runtime-schema-validated at that boundary. Every provider is normalized into an aggregate payload that must pass the shared display contract. Concurrent refreshes are coalesced; default TTLs are calendar five minutes, weather thirty minutes, Sous five minutes and quote six hours.

## 6. Current user interface

### Desktop/TV composition

The viewport-locked desktop board contains:

1. a top row with the dominant Today card on the left;
2. a top-right rail with Calendar key/freshness above Previous day;
3. a lower row of six equal upcoming-day cards.

The revised desktop row allocation is `minmax(0, 1.3fr) minmax(0, 0.9fr)`. At 900px and below the sections enter normal document flow and may scroll for development access.

Today contains the long date, prominent weather/temperature/outfit, schedule, optional dinner and optional quote. Future cards contain compact date-specific weather/outfit, dinner and event content. Today’s weather body text, 72px icon, `clamp(2.25rem, 3.2vw, 3.5rem)` temperature and body/700 outfit guidance are materially larger than compact label text, 32px weather icon, body temperature and 24px outfit icon.

The shared responsive type tokens are:

```css
--text-label: clamp(1rem, 1.05vw, 1.2rem);
--text-small: clamp(1.1rem, 1.2vw, 1.375rem);
--text-body: clamp(1.3125rem, 1.465vw, 1.625rem);
--text-title: clamp(1.625rem, 2.05vw, 2.35rem);
--text-display: clamp(5rem, 8vw, 9rem);
```

### Event capacity and semantics

Today renders at most three event rows. Previous day and each upcoming card render at most one. Hidden valid events are represented deterministically as `+N more`; they are not silently CSS-clipped.

Timed compact events retain the existing two-row treatment. An all-day event renders a visible em dash with `aria-hidden="true"`, while the event row’s accessible label contains “All day”. Compact all-day events carry `event--all-day` and use one grid row with `auto minmax(0, 1fr) auto` columns for dash, bounded title/body and group badge. The title remains in the DOM and ellipsizes within the card.

## 7. Resilience model

The browser:

- polls `/api/today` every five minutes;
- aborts a request after ten seconds;
- atomically replaces the board only after schema validation;
- stores the latest valid snapshot as `family-display:last-good:v2`;
- migrates eligible v1 data, removing unsupported old weather/quote fields safely;
- keeps the previous board visible and shows `Last updated HH:mm · offline` after a failed refresh;
- reloads once daily between 03:00 and 03:15 Europe/London.

The server:

- caches providers independently and coalesces concurrent refreshes;
- uses stale provider values where possible;
- retains the last complete schema-valid payload as final fallback;
- returns a redacted `503` when neither live nor stale data exists.

A stale payload is preferable to a blank screen and has no automatic browser age cutoff.

## 8. Verification model

Automated coverage includes shared-contract constraints, London date/DST windows, outfit thresholds, calendar filtering/sorting/mapping/pagination, bounded optional providers, cache/coalescing/fallback, API/static serving, frontend fetch/cache/recovery states, all groups, event limits, accessible all-day semantics and source-level layout tokens.

Canonical repository gates are:

```sh
npm test
npm run lint
npm run typecheck
npm run build
git diff --check
```

Desktop hierarchy rules are source-tested. Candidate-browser verification with a crowded local fixture confirmed board and scroll dimensions of exactly 1366×768, desktop rows of 416px and 288px, all six future cards fully inside the viewport with zero scroll excess, the compact all-day dash/body/group computed to grid row 1, and a visible ellipsized long title. Computed Today/compact hierarchy values were weather text 21/16px, icon 72/32px, temperature 43.712/21px and outfit 21/16px. Screenshot capture timed out, so screenshot-based aesthetic assessment remains unverified. Final acceptance still requires physical Raspberry Pi/TV checks for overscan, clipping, cursor behaviour, five-second viewing-distance readability, wake/reboot recovery, stale operation and midnight rollover.

## 9. Release boundary

The deployment host builds and runs the same-origin service as the systemd user service `family-display.service` on the private Tailscale address `100.72.212.14:3000`. Release verification must read back the user-service state, listener address, `/healthz`, `/`, `/api/today`, stale recovery and the exact commit before the Pi is repointed or restarted. Use `curl --max-time 10` for `/healthz` and `/`, and `curl --max-time 20` for `/api/today`.

Do not infer deployment from a passing branch build or from this record. Read back the exact live checkout, user-service state and listener after every release.
