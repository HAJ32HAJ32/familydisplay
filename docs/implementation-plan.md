# Family Display implementation plan

## 1. Purpose and delivery boundary

Build a read-only, always-on household display hosted on the VPS and rendered by Chromium on the Raspberry Pi. The application shows yesterday, today, and the next six days, combining five shared Google Calendar groups with weather and a server-generated outfit suggestion.

This plan covers the first useful production release: the web application and fixture from Phase 1, live calendar integration from Phase 2, the TV-oriented view from Phase 3, weather from Phase 4, and browser/server resilience from Phase 5.

Explicitly deferred:

- Phase 6, meals from Sous. The API retains `meal: null` so this can be added without reshaping the day object.
- Phase 7, chores and rewards.
- Any calendar editing, event details modal, touchscreen interaction, user account system, settings screen, or admin UI.
- Pi hardware setup already completed in Phase 0. Deployment documentation may describe the existing kiosk command, but application code must not manage the Pi.

## 2. Repository findings and assumptions

The repository contains only a three-line placeholder `README.md`. There is no existing framework, package convention, reusable component, deployment manifest, or test setup to preserve.

The following choices therefore become the implementation contract for downstream work:

- Use a Node.js TypeScript monorepo managed with npm workspaces.
- Use React and Vite for the frontend.
- Use Fastify for the HTTP server and provider integrations.
- Use Zod schemas in a shared workspace package so fixture generation, backend output, and frontend parsing use the same runtime contract.
- Keep the deployment as one same-origin service: Fastify serves the built frontend and `/api/*`. This avoids CORS, keeps the Pi URL stable, and makes the VPS deployment small.
- Persist no calendar database. Keep bounded in-memory provider caches on the server and the last successful display payload in browser `localStorage`.
- Use `Europe/London` as the authoritative timezone. The browser clock never decides which day is today.
- Configure latitude and longitude on the server. Do not send a postcode to Open-Meteo or expose it to the browser.
- Protect the service at the VPS/private-network layer, preferably using the existing Tailscale/private-access pattern. The application itself has no user login because it is a single-household, read-only kiosk. If private networking is unavailable, deployment must add an authenticated reverse-proxy gate before exposing household calendar data; an unprotected public URL is not acceptable.
- The placeholder project name remains “Family Display” in code and copy until a final name is chosen.

Suggested initial structure:

```text
/
  apps/
    api/                 # Fastify server, providers, aggregation, static serving
    web/                 # React/Vite kiosk interface
  packages/
    contract/            # Zod schemas, TypeScript types, fixed group values
  fixtures/
    today.json           # deterministic Phase 1 fixture
  docs/
    implementation-plan.md
    deployment.md
  package.json
  tsconfig.base.json
```

## 3. Frontend/backend boundary

### Server owns

- Google OAuth credentials and refresh token.
- Google Calendar IDs and their mapping to the five public group values.
- Open-Meteo location and requests.
- Europe/London date boundaries, daylight-saving offsets, rolling-window calculation, weekday labels, `isToday`, sorting, filtering, and outfit rules.
- Expansion of recurring calendar events into occurrences.
- Normalisation and validation of the complete response.
- Short provider caches and stale fallback when upstream services fail.
- Serving the production frontend from the same origin.

### Frontend owns

- Fetching and runtime-validating the already-normalised payload.
- Rendering the hierarchy: quiet yesterday, dominant today, six normal future days.
- Group colour tokens and accessible non-colour markers.
- Polling, retaining the last successful payload, staleness presentation, and daily controlled reload.
- TV-safe layout, overscan padding, typography, responsive fallback, and hidden cursor.

### Frontend must not

- Hold OAuth credentials, raw calendar IDs, email addresses, postcode, latitude, or longitude.
- Calculate date ranges, weekdays, British Summer Time, group assignment, event order, or outfit suggestions.
- Mutate calendars or retry providers directly.
- Treat the Pi's local date as authoritative.

## 4. User flows

There is one primary user: a household member glancing at a non-interactive wall display.

### Flow A: first successful load

1. Chromium opens the application URL in kiosk mode.
2. The page shows a dark full-screen loading shell, not an empty white page.
3. The frontend requests `GET /api/today`.
4. The frontend validates the response against the shared schema.
5. The display renders yesterday, today, and six future days.
6. The valid payload and receipt time are stored as the last-known-good snapshot.
7. A quiet “Updated HH:mm” indicator is shown.

### Flow B: background refresh succeeds

1. While visible, the page polls `GET /api/today` every five minutes.
2. A valid response atomically replaces the rendered payload; no blank intermediate state is shown.
3. The browser cache and updated timestamp are replaced.
4. If the date window changed at midnight, the new server-provided yesterday/today arrangement is rendered without client date maths.

### Flow C: refresh fails after previous success

1. A request fails, times out, returns a non-2xx status, or returns a body that fails schema validation.
2. The last rendered valid payload remains on screen.
3. The timestamp changes to a quiet stale treatment: “Last updated HH:mm · offline”.
4. Polling continues on the normal interval. A later valid response clears the stale state.

### Flow D: cold start while offline

1. The live request fails.
2. If a valid `localStorage` snapshot exists, render it and mark it stale.
3. If no valid snapshot exists, render a full-screen unavailable state with plain household-safe copy and automatic retry; never expose stack traces, provider names, tokens, calendar IDs, or raw error bodies.

### Flow E: upstream partial failure

- If Google Calendar fails but a prior server calendar snapshot exists, the server returns the prior complete display payload with `X-Data-Stale: true`.
- If weather fails but calendar data is available, the server returns the current calendar window and uses cached weather where available; otherwise `weather` is `null` for affected days.
- The display remains usable and marks the response stale when the server declares it stale.

### Flow F: daily browser recovery

1. Between 03:00 and 03:15 Europe/London, the frontend schedules one full page reload.
2. Store the local date of the last daily reload so rerenders or a clock adjustment cannot create a reload loop.
3. Normal polling resumes after reload.

There are no navigation flows, forms, editable controls, hover-only interactions, or success toasts in this release.

## 5. Screens and visual states

### 5.1 Main display

One route, `/`, with:

- A reduced-weight yesterday strip/card for context.
- A dominant today card.
- Six future day cards in chronological order.
- Event rows showing time (or “All day”), title, optional location, and group identity.
- Today's maximum temperature, precipitation chance, and outfit label/icon when weather exists.
- A small updated/stale indicator.
- No visible browser-like navigation or interactive chrome.

The exact grid may adapt to the TV resolution, but information hierarchy is fixed. At the target TV resolution, all eight day sections must fit without vertical or horizontal scrolling.

### 5.2 Loading state

- Uses the same dark background and reserved layout regions as the main display.
- Shows a restrained loading label or skeleton.
- Does not flash a white document background.
- Is replaced only after a payload passes runtime validation.

### 5.3 Empty-data state

An empty day is normal, not an error. Render “Nothing planned” or an equally concise label inside that day. The full eight-day structure remains visible.

### 5.4 Unavailable state

Used only when both the live request and a valid browser snapshot are unavailable. Show:

- “Calendar temporarily unavailable”.
- A quiet “Trying again…” line.
- No manual action requirement, technical codes, stack trace, or blank screen.

### 5.5 Stale state

Keep the last good display fully visible. Reduce emphasis on the freshness line, not on the calendar itself. Example: “Last updated 18:42 · offline”. Do not replace the display with an error panel.

### 5.6 Responsive/dev view

Production targets a TV, but the page must remain inspectable on a laptop and phone:

- TV/desktop: yesterday plus a multi-column day grid with today visually dominant.
- Narrow viewport: stack day sections vertically and permit ordinary page scrolling for development only.
- No content may overlap or become inaccessible at 320 CSS pixels wide.

## 6. Domain entities

### DisplayPayload

A generated snapshot for one authoritative local date.

- `generatedAt`: offset-aware instant at which this payload was assembled.
- `timezone`: exactly `Europe/London` for this deployment.
- `yesterday`: one `PastDay`.
- `days`: exactly seven `DisplayDay` entries, today first.

### PastDay

- `date`: local calendar date.
- `weekday`: short English weekday label.
- `events`: sorted event occurrences.

It deliberately has no `isToday`, `weather`, or `meal`.

### DisplayDay

- `date`: local calendar date.
- `weekday`: short English weekday label.
- `isToday`: true only for index 0.
- `weather`: weather summary or `null`.
- `events`: sorted event occurrences.
- `meal`: `null` in this release, with the future meal union reserved in the contract.

### EventOccurrence

A single rendered occurrence, including an expanded instance of a recurring event.

- `id`: stable opaque ID; never a raw email or calendar ID.
- `title`: display-safe event title.
- `start`, `end`: offset-aware ISO 8601 timestamps in Europe/London.
- `allDay`: whether the source event is all-day.
- `group`: one fixed household group.
- `location`: a string, including an empty string when absent.

For all-day events, normalise `start` to local midnight and `end` to the exclusive local midnight after the event. The UI renders “All day” and does not show those timestamps.

### WeatherSummary

- `tempMaxC`: finite Celsius number rounded to one decimal place.
- `precipitationChance`: integer percentage from 0 through 100.
- `outfit`: one fixed outfit value.

### Meal

Reserved for Phase 6:

- `{ "type": "recipe", "title": string }`
- `{ "type": "out" }`
- `{ "type": "takeaway" }`

All `meal` fields are `null` in the current release.

## 7. Fixed values and business rules

### Household groups

The only accepted group values and their presentation tokens are:

- `h-and-chantele`: purple; H and Chantele.
- `all`: blue; H, Chantele, and Rafe.
- `rafe`: green; Rafe.
- `h`: grey; H.
- `chantele`: pink/red; Chantele.

The backend maps configured Google Calendar IDs to these values. Unknown or unmapped source calendars must fail configuration/startup rather than silently assigning a group. The response never exposes the human-readable member description, email address, or calendar ID.

Colour cannot be the only group cue. Each event row must also expose a short visible label or shape marker, and an accessible label containing the group name.

### Rolling window

- Calculate all boundaries in `Europe/London` using a timezone-aware library.
- `yesterday.date` is one local day before today.
- `days` contains exactly today through today plus six days, ascending and without gaps or duplicates.
- `days[0].isToday` is true; every other entry is false.
- `weekday` is derived server-side from `date` and uses `Mon` through `Sun`.
- Query event instances from yesterday at 00:00 inclusive through the day after `days[6]` at 00:00 exclusive.
- An event belongs to each day it overlaps. A multi-day event may therefore produce an occurrence in more than one day; clip only for grouping, not by rewriting its original start/end values.

### Calendar filtering and normalisation

- Use Google Calendar read-only scope only.
- Request expanded recurring instances (`singleEvents=true`) within the server-calculated range.
- Exclude events whose Google status is `cancelled`.
- Exclude an event when the authorised user's own attendee response is `declined`.
- Include tentative events; the first release has no tentative visual distinction.
- Treat missing or blank summaries as `Untitled event`.
- Trim title and location whitespace.
- Do not include descriptions, attendee lists, organiser details, conferencing links, attachments, or private extended properties.
- Preserve simultaneous events; do not merge them.
- Sort all-day events first, then timed events by start instant, then end instant, then title, then opaque ID for deterministic ties.

### Outfit rule

Evaluate precipitation before temperature, server-side, using the unrounded Open-Meteo values:

1. `precipitationChance > 50` → `raincoat`.
2. Otherwise `tempMaxC > 20` → `tshirt`.
3. Otherwise `tempMaxC >= 14` → `long-sleeve`.
4. Otherwise `tempMaxC >= 8` → `hoodie`.
5. Otherwise → `coat`.

The original brief calls the thresholds a starting point. These exact edge rules remove implementation ambiguity for the first release; tune them later through configuration after real-world observation.

### Caching and freshness

- Server calendar cache target TTL: five minutes.
- Server weather cache target TTL: thirty minutes.
- Coalesce concurrent refreshes so multiple browser requests trigger at most one provider request per cache key.
- Keep the last complete schema-valid display payload in memory for stale fallback.
- Browser poll interval: five minutes, beginning after the first request settles.
- Browser request timeout: ten seconds.
- Browser retains only the latest schema-valid payload in `localStorage` under a versioned key.
- A stale payload is preferable to a blank screen. Do not impose an automatic age cutoff that hides cached data; always show its timestamp.

## 8. HTTP API and shared data contract

### `GET /api/today`

No query parameters. No request body. Same-origin/private-network access only.

Success response:

- Status `200`.
- `Content-Type: application/json`.
- `Cache-Control: no-store` so browser/proxy caches do not compete with application freshness logic.
- `X-Data-Stale: false` for a newly assembled/provider-cache-valid payload.
- `X-Data-Stale: true` when the server returns a last-known-good payload because one or more required provider refreshes failed.
- Body conforms to `DisplayPayload`.

Canonical example fixture:

```json
{
  "generatedAt": "2026-08-27T18:42:00+01:00",
  "timezone": "Europe/London",
  "yesterday": {
    "date": "2026-08-26",
    "weekday": "Wed",
    "events": [
      {
        "id": "evt_9f01",
        "title": "Bins out",
        "start": "2026-08-26T07:00:00+01:00",
        "end": "2026-08-26T07:15:00+01:00",
        "allDay": false,
        "group": "h",
        "location": ""
      }
    ]
  },
  "days": [
    {
      "date": "2026-08-27",
      "weekday": "Thu",
      "isToday": true,
      "weather": {
        "tempMaxC": 19,
        "precipitationChance": 65,
        "outfit": "raincoat"
      },
      "events": [
        {
          "id": "evt_a1b2c3",
          "title": "Nursery drop-off",
          "start": "2026-08-27T08:30:00+01:00",
          "end": "2026-08-27T09:00:00+01:00",
          "allDay": false,
          "group": "rafe",
          "location": ""
        }
      ],
      "meal": null
    },
    {
      "date": "2026-08-28",
      "weekday": "Fri",
      "isToday": false,
      "weather": null,
      "events": [],
      "meal": null
    },
    {
      "date": "2026-08-29",
      "weekday": "Sat",
      "isToday": false,
      "weather": null,
      "events": [],
      "meal": null
    },
    {
      "date": "2026-08-30",
      "weekday": "Sun",
      "isToday": false,
      "weather": null,
      "events": [],
      "meal": null
    },
    {
      "date": "2026-08-31",
      "weekday": "Mon",
      "isToday": false,
      "weather": null,
      "events": [],
      "meal": null
    },
    {
      "date": "2026-09-01",
      "weekday": "Tue",
      "isToday": false,
      "weather": null,
      "events": [],
      "meal": null
    },
    {
      "date": "2026-09-02",
      "weekday": "Wed",
      "isToday": false,
      "weather": null,
      "events": [],
      "meal": null
    }
  ]
}
```

Schema constraints:

```ts
type Group =
  | "h-and-chantele"
  | "all"
  | "rafe"
  | "h"
  | "chantele";

type Outfit =
  | "tshirt"
  | "long-sleeve"
  | "hoodie"
  | "coat"
  | "raincoat";

type Meal =
  | { type: "recipe"; title: string }
  | { type: "out" }
  | { type: "takeaway" };

type EventOccurrence = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  group: Group;
  location: string;
};

type WeatherSummary = {
  tempMaxC: number;
  precipitationChance: number;
  outfit: Outfit;
};

type DisplayDay = {
  date: string;
  weekday: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
  isToday: boolean;
  weather: WeatherSummary | null;
  events: EventOccurrence[];
  meal: Meal | null;
};

type DisplayPayload = {
  generatedAt: string;
  timezone: "Europe/London";
  yesterday: {
    date: string;
    weekday: DisplayDay["weekday"];
    events: EventOccurrence[];
  };
  days: [DisplayDay, DisplayDay, DisplayDay, DisplayDay, DisplayDay, DisplayDay, DisplayDay];
};
```

Runtime validation must additionally enforce:

- Dates match `YYYY-MM-DD` and are real calendar dates.
- Timestamps are ISO 8601 with an explicit `Z` or numeric offset; backend output for this deployment uses the Europe/London offset applying on that instant.
- `end` is strictly after `start`.
- `id` is non-empty and at most 200 characters.
- `title` is 1–200 Unicode characters after trimming.
- `location` is 0–300 Unicode characters after trimming.
- Arrays are always present.
- `days` has exactly seven items with consecutive dates and exactly one `isToday: true` at index 0.
- `tempMaxC` is finite and within a defensive range of -50 through 60.
- `precipitationChance` is an integer from 0 through 100.
- Meal recipe title, when Phase 6 is enabled, is 1–200 characters.
- Unknown object keys are stripped or rejected consistently; prefer strict schemas in tests and at the backend output boundary.

### Error response

When no schema-valid live or stale payload exists:

```json
{
  "error": {
    "code": "DISPLAY_DATA_UNAVAILABLE",
    "message": "Display data is temporarily unavailable"
  }
}
```

- Status `503` for provider/configuration availability failures at request time.
- Status `500` only for an unexpected internal error.
- Never include upstream response bodies, stack traces, secrets, calendar IDs, coordinates, or OAuth details.
- The frontend treats every non-2xx response identically for household-facing copy, while logging a concise code to the browser console for maintenance.

### `GET /healthz`

A shallow process health endpoint for deployment checks.

```json
{ "status": "ok" }
```

Return `200` when the process can serve requests. Do not call Google or Open-Meteo from this endpoint and do not expose configuration values.

## 9. Provider contracts and configuration

### Google Calendar adapter

Input from application service:

- `from`: inclusive timezone-aware start of yesterday.
- `to`: exclusive timezone-aware start after the seventh display day.
- Five configured `{ calendarId, group }` mappings.

Output to application service:

- Normalised `EventOccurrence[]` carrying enough local-date overlap information for server grouping.

Required Google request behaviour:

- Scope: `https://www.googleapis.com/auth/calendar.readonly` only.
- `singleEvents=true`.
- `timeMin` and `timeMax` are RFC 3339 instants corresponding to the Europe/London boundaries.
- Follow pagination until `nextPageToken` is absent for every calendar.
- Make the OAuth consent app “In production” before relying on the refresh token; “Testing” refresh tokens may expire after seven days.

### Open-Meteo adapter

Use the configured latitude and longitude and request daily maximum temperature and maximum precipitation probability for all seven display dates, with `timezone=Europe/London`.

Output a map keyed by local `YYYY-MM-DD`. Missing provider days become `weather: null`; they do not remove calendar days.

### Environment/configuration

Expected server-only values:

- `PORT`.
- `APP_TIMEZONE=Europe/London`.
- `DISPLAY_LATITUDE` and `DISPLAY_LONGITUDE`.
- Google OAuth client ID, client secret, and refresh token.
- Five explicit Google Calendar ID values, each bound to one fixed group.
- Optional cache/poll tuning values with the defaults in this plan.

Configuration validation occurs at process startup. Missing credentials, duplicate group mappings, duplicate calendar IDs, an unsupported timezone, or invalid coordinates fail startup with a redacted operator error. Secrets must not be committed, rendered, logged, or returned by an endpoint. Provide `.env.example` containing names and safe placeholders only.

## 10. Frontend component plan

Suggested component boundary:

- `App`: selects loading, unavailable, or display state.
- `DisplayBoard`: lays out the complete snapshot and freshness line.
- `YesterdayPanel`: reduced-weight past context.
- `TodayPanel`: prominent date, weather/outfit, and events.
- `FutureDaysGrid`: six chronological day cards.
- `DayCard`: shared date/empty/event rendering primitive with visual variant.
- `EventList` and `EventRow`: deterministic event presentation.
- `WeatherSummary`: display-only rendering of server decisions.
- `FreshnessIndicator`: updated/stale wording.
- `useDisplayData`: initial fetch, validation, polling, timeout, local cache, and atomic replacement.
- `scheduleDailyReload`: isolated, testable reload scheduling.

Presentation requirements:

- Set `html`, `body`, and root background dark before React mounts.
- Apply `* { cursor: none; }` in kiosk mode; allow a development override by environment or query flag.
- Start TV body text at roughly 24–32 CSS pixels, with larger date and time hierarchy.
- Reserve generous safe-area/overscan padding on all edges.
- Use tabular numerals for times.
- Truncate exceptionally long event text predictably rather than letting cards overlap; preserve full text in an accessible label.
- Use semantic headings and lists even though the kiosk is not interactive.
- Meet WCAG AA contrast for text and non-colour group markers.
- Respect `prefers-reduced-motion`; avoid decorative animation and bright static blocks.
- No auto-scrolling carousel. Information must remain stable during a glance.

## 11. Backend module plan

Suggested modules:

- `config`: environment parsing and redacted startup validation.
- `clock`: injectable current instant for deterministic midnight/DST tests.
- `date-window`: Europe/London rolling dates and query boundaries.
- `google-calendar-provider`: OAuth read-only API and pagination.
- `open-meteo-provider`: forecast fetch and normalisation.
- `event-normaliser`: privacy filtering, fallback titles, opaque IDs, and sorting.
- `outfit`: pure threshold function.
- `display-service`: combines providers into the contract and validates output.
- `cache`: TTL, request coalescing, and last-known-good snapshot.
- `routes/today`: HTTP response and stale header.
- `routes/healthz`: shallow liveness.
- `server`: static web assets, routes, redacted error handler, graceful shutdown.

Opaque event IDs should be stable for a source occurrence without revealing raw calendar identity. A deterministic server-side hash of calendar ID, provider event ID, and occurrence start is suitable; return a short `evt_`-prefixed representation. The hashing salt, if used, remains server-side.

## 12. Implementation sequence

### Step 1: scaffold and shared contract

- Add npm workspace structure, TypeScript base config, lint/format scripts, and test runners.
- Implement strict shared schemas and types.
- Create `fixtures/today.json` with yesterday plus seven days, invented events across at least three household groups, all-day and timed items, empty days, weather examples, and `meal: null`.
- Add a contract test that validates the fixture.

### Step 2: fixture-driven frontend

- Build the single-route display against an injected data source returning the fixture.
- Implement all visual states, TV layout, group treatments, and responsive fallback.
- Verify at the target TV resolution and at 320-pixel width.
- Deploy the fixture build and point the Pi kiosk at it for the planned two-day real-TV observation before polishing layout.

### Step 3: calendar backend

- Add startup configuration validation and the injectable clock/date window.
- Add Google OAuth/calendar adapter with pagination and recurrence expansion.
- Add normalisation, privacy filtering, day overlap grouping, sorting, caching, and `/api/today`.
- Keep `weather: null` and `meal: null` until their integrations are active.
- Swap the frontend data source from fixture to same-origin API without changing render components.

### Step 4: weather

- Add Open-Meteo adapter and weather cache.
- Add pure outfit rule and populate weather for all seven days.
- Render detailed weather/outfit on today only. Future-day weather remains available in data but hidden pending the open visual-noise decision.

### Step 5: unattended resilience

- Add client polling, timeout, local last-known-good validation, stale state, and cold-start unavailable state.
- Add backend last-known-good fallback and `X-Data-Stale`.
- Add one daily controlled reload and midnight rollover tests.
- Add shallow health check, production build/static serving, deployment notes, log redaction, and graceful restart procedure.

### Step 6: wall verification and release

- Test the production build through the actual Pi/TV kiosk URL.
- Observe viewing distance, overscan, clipping, wake/reboot behaviour, stale behaviour, and midnight rollover.
- Only after the calendar has remained reliable should a separate Phase 6 plan verify Sous date storage and define the meal read path.

## 13. Test plan

### Shared contract tests

- Canonical fixture passes.
- Invalid group/outfit values fail.
- Six or eight `days` fail.
- Missing arrays and missing `meal` fail.
- Missing timestamp offset, impossible dates, reversed event times, and out-of-range weather fail.
- Non-consecutive dates or `isToday` outside index 0 fail.

### Backend unit tests

- Rolling window across ordinary midnight.
- Europe/London transitions into and out of British Summer Time.
- Week/month/year boundaries and leap day.
- Strict outfit boundaries: rain at 51; temperature at 8, 14, 20, and just above 20.
- All-day-first and deterministic timed-event ordering.
- Cancelled and self-declined filtering.
- Missing title/location normalisation.
- Calendar ID-to-group mapping and startup rejection of incomplete/duplicate config.
- Recurring and multi-day event grouping.
- Weather-null behaviour on missing forecast days.
- Cache TTL, concurrent request coalescing, stale fallback, and no-cache-with-no-snapshot error.

### Backend route/integration tests

- `GET /api/today` returns schema-valid JSON, exactly seven days, and the correct freshness header.
- Provider adapters are mocked; tests make no live Google/Open-Meteo calls.
- `503` response is redacted when no payload exists.
- Unknown route returns a safe response.
- Non-GET methods do not mutate anything and return `404` or `405` consistently.
- `/healthz` is provider-independent and redacted.
- Static frontend and API work from one origin in a production build.

### Frontend tests

- Initial loading to success.
- Yesterday/today/future hierarchy and exact day count.
- Empty day copy.
- All five group markers and non-colour labels.
- All-day versus timed event rendering.
- Today weather/outfit rendering and `weather: null` omission.
- Poll success atomically replaces data.
- Poll/network/schema failure keeps the prior render and marks it stale.
- Cold start uses a valid cached payload.
- Invalid cached payload is discarded and unavailable state is shown.
- `X-Data-Stale: true` marks an otherwise successful response stale.
- Daily reload schedules once and cannot loop.
- No interactive navigation or accidental calendar write controls exist.

### Manual TV checks

- Readable in a five-second glance from 6–10 feet.
- No cropped content with expected TV overscan.
- No scrollbars at target resolution.
- Cursor is hidden and no Chromium prompts obscure the page.
- Dark initial paint; no white flash.
- Long titles, simultaneous events, busy days, and empty days do not overlap.
- Reboot returns automatically to the display.
- Network interruption retains data and recovery clears the stale marker.

## 14. Acceptance criteria

### Contract and privacy

- One shared runtime schema validates the fixture, server output, and frontend input.
- The payload always contains separate `yesterday` and exactly seven ordered `days` beginning with server-defined today.
- The browser receives only the five fixed group values, never raw Google calendar IDs, emails, OAuth material, coordinates, attendee data, or descriptions.
- All timestamps include offsets and all day/date decisions use Europe/London server-side.
- Every current day includes `weather` and `meal`; either may be `null`, and `meal` is always `null` in this release.

### Calendar behaviour

- All five configured calendars are read with `calendar.readonly` and recurring instances are expanded.
- Cancelled and self-declined events do not render.
- Events are assigned to every overlapping display date and sorted all-day first, then chronologically with deterministic ties.
- Empty days render normally rather than failing or disappearing.
- Same-day calendar changes appear after the provider/server cache and next five-minute client poll, without manual reload.

### Weather behaviour

- Open-Meteo is called server-side with configured coordinates and Europe/London timezone.
- Weather is available in the contract for all forecasted display days.
- The server applies the exact precipitation-first outfit thresholds in this plan.
- The initial UI renders weather/outfit on today only; missing weather does not hide calendar data.

### Kiosk UX

- The main display presents yesterday quietly, today dominantly, and six future days at normal weight.
- The target TV view has no page scrolling, browser controls, pointer, clipped cards, or text below the agreed legibility baseline.
- Group identity is distinguishable without relying solely on colour.
- Loading, empty, stale, and unavailable states are implemented and tested.
- There are no forms, navigation, editing controls, or touchscreen dependencies.

### Resilience and operations

- Five-minute polling never blanks a previously valid display.
- A valid browser snapshot survives a reload while offline and is visibly marked stale.
- The server serves its last complete valid payload as stale when providers fail; with no snapshot it returns a redacted `503`.
- The page performs one controlled full reload daily in the small hours and correctly rolls over at midnight.
- Production serves frontend and API from one origin over the approved private/authenticated route.
- Secrets are server-only, ignored by Git, absent from logs/responses, and represented only by safe names in `.env.example`.
- `npm` install, lint, typecheck, unit/integration tests, and production build all pass in CI and on the deployment host.
- The final application is exercised on the actual Raspberry Pi/TV, not accepted from laptop screenshots alone.

## 15. Open decisions and conservative defaults

- Final product name: keep “Family Display” until renamed; naming must not block implementation.
- Future-day weather visuals: data is populated, UI hides it initially to minimise visual noise.
- Outfit tuning: use the exact edge rules above for release one, then alter configuration only after a week of observation.
- Sous integration: do not start until Sous is confirmed to track the real date and expose meals by explicit date.
- Deployment gate: prefer private Tailscale access. If operations chooses public internet reachability, authenticated reverse-proxy design and credential provisioning require an explicit security decision before release.

These open decisions do not alter the shared Phase 1–5 API body and therefore do not need to block the frontend or backend implementation tasks.
