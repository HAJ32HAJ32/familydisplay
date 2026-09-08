# Deployment

Family Display contains private household calendar data. Keep the Node service off public and ordinary LAN interfaces.

## Network boundary

Use one of these supported modes:

1. **Loopback behind the existing private reverse proxy:** keep `HOST=127.0.0.1` and proxy the service only through the approved Tailscale/private-access route.
2. **Direct Tailscale listener:** set `HOST` to the VPS's stable Tailscale IPv4 address in `100.64.0.0/10` and restrict access with tailnet ACLs.

The application rejects wildcard, public, hostname, and ordinary LAN bind values at startup. Do not publish port 3000 through a public firewall or container mapping. If public internet access is ever required, add an authenticated reverse-proxy gate before starting the service.

## Build and configuration

```sh
npm ci
npm test
npm run lint
npm run typecheck
npm run build
```

Create a root-readable or service-user-readable environment file outside the repository using the names in `.env.example`. Replace all placeholders, restrict its permissions, and never place OAuth credentials or calendar IDs in a systemd unit or command line.

Sous integration is optional. To enable it, deploy Sous's `displayMeals` function, then set both `SOUS_MEALS_URL` and `SOUS_MEALS_TOKEN` in the protected environment file. The token must be a separate random value used only for this feed. Family Display rejects partial configuration, cross-origin redirects, malformed responses, duplicate dates, meals outside its requested seven-day range, and responses larger than 64 KiB. If Sous is unavailable, cached meals remain visible where available; otherwise calendar and weather data remain visible and the board is marked stale.

Morning Quote integration is also optional. Set both `MORNING_QUOTE_URL` and `MORNING_QUOTE_TOKEN` in the protected environment file. The endpoint must use HTTPS and accept a read-only `GET` with only a `date=YYYY-MM-DD` query parameter and a dedicated bearer token. It must return `{ "text": "…", "attribution": "…" }`; Family Display rejects redirects, credentials embedded in URLs, malformed or oversized responses, and never sends calendar, meal, location, or household data to the quote service. Quote failure leaves the rest of the board visible and marks the data stale.

## Example systemd user service

Adjust the working directory and environment-file path for the release location:

```ini
[Unit]
Description=Family Display
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/family-display/current
EnvironmentFile=/opt/family-display/shared/family-display.env
ExecStart=/usr/bin/npm run start -w @family-display/api
Restart=on-failure
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=default.target
```

Enable user lingering if this is a user service that must survive logout. After installation, verify the effective listener rather than assuming the environment was applied:

```sh
systemctl --user daemon-reload
systemctl --user enable --now family-display.service
systemctl --user status family-display.service
curl --fail --silent http://127.0.0.1:3000/healthz
ss -ltnp 'sport = :3000'
```

The listener must show either `127.0.0.1:3000` or the intended Tailscale address—never `0.0.0.0`, `[::]`, a public address, or a LAN address.

## Release checks

Before pointing the Pi at a new release:

- verify `/healthz`, `/`, and `/api/today` through the approved private URL;
- interrupt upstream/network access and confirm the last valid display remains visible and is marked stale;
- confirm the next successful poll clears the stale marker;
- verify the date window after London midnight;
- inspect the actual Pi/TV for overscan, clipping, scrollbars, cursor visibility, reboot recovery, and five-second readability.
