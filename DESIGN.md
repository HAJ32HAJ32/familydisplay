---
version: alpha
name: Family Display
summary: Calm, glanceable household information for an always-on television.
colors:
  primary: "#0B1322"
  surface: "#182438"
  surfaceRaised: "#202E43"
  text: "#F8FAFC"
  muted: "#B4C0D2"
  accent: "#42C8F5"
  grape: "#B68FEC"
  blueberry: "#75A0F5"
  basil: "#68C463"
  graphite: "#465166"
  banana: "#EACB62"
  tangerine: "#EFA766"
typography:
  display:
    fontFamily: Inter
    fontSize: "clamp(5rem, 8vw, 9rem)"
    fontWeight: 300
    lineHeight: 0.9
    letterSpacing: "-0.05em"
  title:
    fontFamily: Inter
    fontSize: "clamp(1.625rem, 2.05vw, 2.35rem)"
    fontWeight: 650
    lineHeight: 1.15
  body:
    fontFamily: Inter
    fontSize: "clamp(1.3125rem, 1.465vw, 1.625rem)"
    fontWeight: 400
    lineHeight: 1.3
  small:
    fontFamily: Inter
    fontSize: "clamp(1.1rem, 1.2vw, 1.375rem)"
    fontWeight: 400
    lineHeight: 1.3
  label:
    fontFamily: Inter
    fontSize: "clamp(1rem, 1.05vw, 1.2rem)"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.06em"
icons:
  sm: 24px
  md: 32px
  lg: 72px
rounded:
  sm: 8px
  md: 12px
  lg: 20px
spacing:
  one: 4px
  two: 8px
  three: 12px
  four: 16px
  six: 24px
  eight: 32px
components:
  board:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.text}"
    padding: 24px
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: 16px
  event-grape:
    backgroundColor: "{colors.grape}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: 12px
  event-blueberry:
    backgroundColor: "{colors.blueberry}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: 12px
  event-basil:
    backgroundColor: "{colors.basil}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: 12px
  event-graphite:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: 12px
  event-banana:
    backgroundColor: "{colors.banana}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: 12px
  event-tangerine:
    backgroundColor: "{colors.tangerine}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: 12px
---

## Overview

Family Display is a dark, stable television dashboard designed for a five-second glance. The main desktop composition is a dominant Today card, a top-right rail containing the permanent calendar key above Previous day, and six equal upcoming-day cards across the lower row. Previous day is events-only. Today and the six upcoming dates own their weather, outfit, events and optional dinner. An optional morning quote sits inside Today rather than becoming another panel.

Commit `7d1e066` is the deployed pre-change baseline. This design records the hierarchy and compact-event corrections in this unreleased branch/candidate; the document itself is not evidence that those changes are deployed.

## Colors

The six event colours preserve the Google Calendar mapping while using tuned chroma and luminance for television viewing. Every foreground/background pair reaches at least 7:1 contrast. Filled pills use deep ink except Graphite, which uses light text. Time, location and title remain opaque, and an inverse text badge identifies the group without relying on hue alone. Cyan is reserved for weather and date emphasis.

## Typography and icon hierarchy

Use the exact five responsive type tokens in the frontmatter. They reduce the enlarged baseline by roughly 10–15% while preserving a distance-readable scale. Exceptional strings truncate predictably rather than forcing the general scale down.

Today weather is intentionally stronger than future weather: the Today weather copy uses body size, temperature uses `clamp(2.25rem, 3.2vw, 3.5rem)`, and its weather icon uses the 72px large token. Compact cards use label-sized weather/outfit copy, body-sized temperature, a 32px weather icon and a 24px outfit icon. Today outfit guidance uses body text at weight 700 with a 32px icon.

## Layout

All spacing comes from the four-point scale. Above 900px, the board is locked to the viewport and uses `minmax(0, 1.3fr) minmax(0, 0.9fr)`, giving the six-card lower row more room than the deployed baseline. The permanent calendar key occupies the top-right rail above Previous day. At 900px and below, sections enter document flow, stack progressively and may scroll for development access.

The intended desktop acceptance viewport is 1366×768. In candidate-browser verification with a crowded local fixture, board and scroll dimensions were exactly 1366×768, desktop rows were 416px and 288px, and all six future cards were fully inside the viewport with zero scroll excess. The compact all-day dash/body/group computed to grid row 1, and a long title remained visible and ellipsized. Computed Today/compact hierarchy values were weather text 21/16px, icon 72/32px, temperature 43.712/21px and outfit 21/16px. Screenshot capture timed out, so screenshot-based aesthetic assessment remains unverified; physical Pi/TV acceptance remains a separate outstanding gate.

## Components

- **Today:** full date, prominent Open-Meteo condition and temperature, prominent outfit guidance, up to three events, optional Sous dinner and optional morning quote.
- **Top-right rail:** permanent six-group Calendar key, freshness state and quiet Previous day content.
- **Upcoming days:** six compact cards with date, weather/outfit, dinner and one event.
- **Event overflow:** Today renders three events and compact contexts render one; additional events become deterministic `+N more` rows.
- **All-day event:** a visible em dash is `aria-hidden`; the event row’s accessible label says “All day”. A compact all-day event is one grid row (`auto minmax(0, 1fr) auto`) so its bounded, ellipsized title cannot drop below a still-visible dash. Timed compact events retain the two-row treatment.

## Do's and Don'ts

- Do preserve the Family/BAES source defaults and six colour mappings.
- Do keep weather, outfit and meal icons local and dependency-free.
- Do keep all information stable; there are no carousels or hover-only details.
- Do preserve stale data and show its timestamp rather than blanking the board.
- Don't infer dates, outfits or household groups in the browser.
- Don't expose private providers or port 3000 outside the approved Tailscale boundary.
- Don't treat candidate-browser geometry as physical-display acceptance; Raspberry Pi/TV overscan, clipping, cursor behaviour, viewing-distance readability, wake/reboot recovery, stale operation and midnight rollover remain outstanding.
