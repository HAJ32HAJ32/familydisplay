# Constraints and quality contract

These are the rules every change to Family Display must keep, plus the gate it must pass. README.md, DESIGN.md and docs/deployment.md hold the detail; this file is the short list. Where they disagree, fix the docs rather than guessing.

## Product rules

- The board is read-only and non-interactive: no editing, forms, accounts, navigation or hover-only details. The one bounded carousel exception is the secondary train station rotation: it swaps Coulsdon South and Whyteleafe every 15 seconds with no transition or decorative animation. It remains an instantaneous content swap under `prefers-reduced-motion: reduce` because the station choice must still stay current.
- It is built for a five-second glance from across the room. Today dominates the later days. Change the type scale in modest steps (about 10 to 15%), never so far that text clips.
- Keep the six household colour mappings, the Family/BAES source defaults and the bundled Inter font. Event text keeps at least 7:1 contrast on its fill, and secondary metadata at least 4.5:1.
- Event lists show every event that fits, then a `+N more` row. The board never scrolls on the TV layout and never clips text silently. Truncated text exposes its full value through an accessible label or title.
- The only motion is the burn-in shift on layouts wider than 900px. `prefers-reduced-motion: reduce` turns it off. Do not add decorative motion or an animation library.
- The day's data, outfits and household groups are decided by the server. The browser formats dates and the clock, detects staleness and schedules its London daily reload.
- The stale warning and last-good snapshot stay. A failed refresh keeps the previous board visible and marks it as stale.

## Privacy and operations

- Never read, print or commit the protected environment file, OAuth material, calendar IDs, coordinates or provider tokens.
- The service binds only to `127.0.0.1` or the Tailscale address. Never expose port 3000 publicly or on an ordinary LAN.
- Never build inside the live checkout (`/home/harrison/familydisplay`) while developing or evaluating a candidate: it serves `apps/web/dist`, so a web build there goes live straight away. Use a separate worktree and preserve every existing worktree and untracked path. Builds in the live checkout are only for an authorised, reviewed release under `docs/deployment.md`.
- Browser checks run on loopback only. Household payloads and screenshots stay on the VPS.
- Passing gates and browser geometry do not prove the TV is right. Physical Pi/TV checks (overscan, readability at distance, cursor, wake/reboot, midnight rollover) are a separate acceptance step.

## Gate

The VPS has about 4 GB of RAM, so run these one at a time with these heap limits:

```sh
NODE_OPTIONS=--max-old-space-size=768  npm run build -w @family-display/contract
NODE_OPTIONS=--max-old-space-size=768  npm run build -w @family-display/web
NODE_OPTIONS=--max-old-space-size=2304 npm run build -w @family-display/api
NODE_OPTIONS=--max-old-space-size=768  ./node_modules/.bin/vitest run packages/contract/test apps/api/test --exclude '.worktrees/**'
NODE_OPTIONS=--max-old-space-size=768  npm run test -w @family-display/web
NODE_OPTIONS=--max-old-space-size=2304 npm run lint
NODE_OPTIONS=--max-old-space-size=2304 npm run typecheck
git diff --check
```

Every command must exit 0. Test counts may only go up unless a removal is explained. `npm test` covers the same suites but without the heap limits or the `.worktrees` exclusion. Exclude nested `.worktrees/` from discovery and still require the canonical suites to pass. For the authorised release procedure, including dependency installation and the full release build, follow `docs/deployment.md`.

Tests come first for behaviour and CSS-contract changes. CSS-string tests do not prove layout or that Chromium accepts an animation value: check computed styles and `getAnimations()` with and without reduced motion. For a visual change, also serve the built bundle on loopback with the repo fixture, a crowded version and a local-only live-payload snapshot, at 1920×1080 and 1366×768. Read back the viewport, then check that the document, board, every panel and every event list have no scroll overflow. Include long weekday/month names in date checks. Never commit the harness or household snapshot.

## Measured baseline

Measured at `6f49f73` on 4 November 2026 (Node 22.22.3, npm 10.9.8), from a clean worktree. These are observations, not targets.

| Gate | Result |
|---|---|
| Builds (contract, web, API) | pass; web CSS 23.29 kB (5.05 kB gzip), JS 305.54 kB (92.68 kB gzip) |
| Contract + API tests | 5 files, 127 tests pass |
| Web tests | 4 files, 100 tests pass |
| Lint, typecheck, `git diff --check` | pass |
| Loopback smoke, repo fixture only, 1920×1080 and 1366×768 | document equals viewport; no panel or list overflows |

The baseline fixture smoke found that the burn-in shift never ran. `30m` is not a valid CSS time, so Chromium dropped the whole `animation` declaration. The candidate changes it to `1800s`; stepped browser checks establish six-minute movement and reduced-motion disabling. Crowded smoke was run on the candidate, not the baseline. A later live-payload check also exposed a baseline 1920×1080 date-panel overflow with a long weekday/month: the candidate bounds the wrapper and lets the full date wrap instead of using the panel's padding.
