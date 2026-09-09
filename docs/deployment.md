# Deployment

Family Display contains private household calendar data. Keep the Node service off public and ordinary LAN interfaces.

## Current deployed baseline

The current shipped VPS release is exactly commit `7d1e066c405f1389c4d7b2647287fc8e8b126643` (the pre-change baseline for the hierarchy/overflow work). It runs as the active systemd user service `family-display.service` and listens directly on the VPS Tailscale address:

```text
http://100.72.212.14:3000
```

Live operator verification on 9 September 2026 confirmed that exact commit and listener, HTTP 200 responses from `/healthz`, `/` and `/api/today`, and a normalized API payload containing seven days plus Previous day, no quote and one meal day. This verifies the deployed baseline, not the hierarchy/overflow candidate.

This URL is private to the tailnet. Do not create a public firewall rule, public reverse-proxy route or ordinary LAN bind for it. Changes after `7d1e066`, including this unreleased branch/candidate, are not deployed merely because they are documented here; candidate documentation is not deployment evidence.

## Supported network boundary

Use one of these modes:

1. **Current direct Tailscale listener:** set `HOST=100.72.212.14`, retain tailnet ACL restrictions and verify that exact address is listening.
2. **Loopback behind an approved private reverse proxy:** set `HOST=127.0.0.1` and expose it only through the approved Tailscale/private-access route.

Application startup rejects wildcard, public, hostname and ordinary LAN bind values. If public internet access is ever required, an authenticated reverse-proxy gate and explicit security review are prerequisites.

## Build and release gates

From the exact release checkout:

```sh
npm ci
npm test
npm run lint
npm run typecheck
npm run build
git diff --check
```

Create a service-readable environment file outside the repository using `.env.example`. Replace all placeholders, restrict its permissions, and never put OAuth credentials, provider tokens or calendar IDs in the systemd unit or command line.

Configure exactly two calendars, Family and BAES, and retain only the Google Calendar read-only scope. Set `APP_TIMEZONE=Europe/London`.

## Optional shipped providers

### Sous meals

Set both `SOUS_MEALS_URL` and `SOUS_MEALS_TOKEN`. The endpoint is a read-only HTTPS feed for the requested seven-day date range. Family Display rejects partial configuration, redirects, credentials embedded in URLs, malformed responses, duplicate/out-of-range dates and responses over 64 KiB. Cached meals remain visible on provider failure when available; otherwise meal slots are empty while the rest of the board remains usable and is marked stale.

### Morning quote

Set both `MORNING_QUOTE_URL` and `MORNING_QUOTE_TOKEN`. The read-only HTTPS endpoint receives only `date=YYYY-MM-DD` and a dedicated bearer token and returns `{ "text": "…", "attribution": "…" }`. Family Display rejects redirects, embedded URL credentials, malformed/oversized responses and never sends it calendar, meal, location or household data. On a same-date refresh failure, an available cached quote is retained and marked stale. Without a cached quote, the quote is omitted and the board remains usable but stale.

Open-Meteo, Sous and morning-quote responses use the 65,536-byte bounded JSON reader and runtime response schemas. Each Google Calendar request has a ten-second timeout and requests at most 2,500 occurrences per page, but pagination follows `nextPageToken` without a maximum total page count. Google upstream responses are not byte-capped or runtime-schema-validated at that boundary. Data from all providers is normalized, and the aggregate must pass the shared display contract. The server coalesces concurrent cache refreshes and defaults to five-minute calendar/Sous caches, a thirty-minute weather cache and a six-hour quote cache. It retains provider-specific stale values and the last complete schema-valid display payload for fallback.

## systemd user-service operating model

The deployed baseline uses the user unit at `/home/harrison/.config/systemd/user/family-display.service`, with `WorkingDirectory=/home/harrison/familydisplay` and `EnvironmentFile=/home/harrison/.config/family-display/family-display.env`. Its `ExecStart` runs the locally built API with Node. Do not read or copy the environment file while verifying a release, and do not copy secrets into the unit or command line.

Operate it through the user service manager. After releasing, read back the running state rather than assuming restart succeeded:

```sh
systemctl --user daemon-reload
systemctl --user restart family-display.service
systemctl --user status family-display.service
curl --fail --silent --show-error --max-time 10 http://100.72.212.14:3000/healthz
curl --fail --silent --show-error --max-time 10 --output /dev/null http://100.72.212.14:3000/
curl --fail --silent --show-error --max-time 20 http://100.72.212.14:3000/api/today
ss -ltnp 'sport = :3000'
```

The listener must be exactly `100.72.212.14:3000` for the current direct mode (or `127.0.0.1:3000` for the private-proxy mode), never `0.0.0.0`, `[::]`, public or LAN.

## Browser resilience

Chromium polls every five minutes and times out each display request after ten seconds. It validates every payload before render and stores the latest good snapshot in local storage under `family-display:last-good:v2`. Network, status or schema failures retain the previous render and show “Last updated HH:mm · offline”; a successful poll clears the stale marker. A daily controlled reload is scheduled between 03:00 and 03:15 Europe/London.

## Release acceptance

Before moving the Pi to a new commit:

- record the exact release commit; do not describe an unreleased branch/candidate as deployed;
- verify `/healthz` and `/` with `curl --max-time 10`, and `/api/today` with `curl --max-time 20`, through `100.72.212.14:3000` from an authorised tailnet client;
- confirm the returned payload contains Today plus six future days, separate Previous day, optional provider fields and no private source details;
- interrupt upstream/network access and confirm the last valid board remains visible and marked stale;
- confirm a later valid poll clears the stale marker;
- verify the London date window across midnight;
- inspect the actual 1366×768 Pi/TV output for overscan, clipping, scrollbars, all-day title truncation, cursor visibility and five-second readability;
- reboot the Pi and VPS user-service path and confirm unattended recovery.

Candidate-browser verification with a crowded local fixture confirmed board and scroll dimensions of exactly 1366×768, desktop rows of 416px and 288px, all six future cards fully inside the viewport with zero scroll excess, the compact all-day dash/body/group computed to grid row 1, and a visible ellipsized long title. Computed Today/compact hierarchy values were weather text 21/16px, icon 72/32px, temperature 43.712/21px and outfit 21/16px. Screenshot capture timed out, so screenshot-based aesthetic assessment remains unverified. Physical Pi/TV overscan, clipping, cursor behaviour, viewing-distance readability, wake/reboot recovery, stale operation and midnight rollover remain outstanding for the hierarchy/overflow changes in this unreleased branch/candidate.
