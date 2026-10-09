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
  beetroot: "#A31352"
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
  lg: 48px
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
  event-beetroot:
    backgroundColor: "{colors.beetroot}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: 12px
  event-tangerine:
    backgroundColor: "{colors.tangerine}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: 12px
---

## Overview

Family Display is a dark, stable television dashboard designed for a five-second glance. The main desktop composition has three zones across the top row: a left day panel (now), the Today card (today's plan) and a right rail (context), with six equal upcoming-day cards across the lower row. The two rails always share one width so the board stays symmetrical. Previous day is events-only. Today and the six upcoming dates own their weather, outfit, events and optional dinner. Inter is bundled with the app (`@fontsource-variable/inter`) so the TV renders the intended type without a network connection.

This design records the implemented hierarchy and compact-event behaviour. Deployment identity is established from the live checkout and user service, not from this document.

## Colors

The six event colours preserve the Google Calendar mapping while using tuned chroma and luminance for television viewing. Every foreground/background pair reaches at least 7:1 contrast. Filled pills use deep ink except Graphite and Beetroot, which use light text. Time, location and title remain opaque, and an inverse text badge identifies the group without relying on hue alone. Cyan is reserved for weather and date emphasis.

## Typography and icon hierarchy

Use the exact five responsive type tokens in the frontmatter. They reduce the enlarged baseline by roughly 10–15% while preserving a distance-readable scale. Exceptional strings truncate predictably rather than forcing the general scale down.

The left day panel uses the same border, radius and tint as the right rail card. Every line is centred on one axis with fixed gaps, and the time and weather group is centred vertically in the space above the outfit pill: a bold `clamp(3rem, 4.4vw, 5.25rem)` clock, the weekday (accent) and date on one line, a hairline, the 48px weather icon beside the `clamp(2.25rem, 2.7vw, 3rem)` high and a muted "/ low", the condition line, then a label-sized line for rain timing and one for sunrise and sunset. The outfit pill always spans the panel's full width at its foot (body text at weight 700 with a 32px icon), so it never shifts with the length of its label. Inside the Today card, the schedule and aside use a `clamp(1.5rem, 2.4vw, 3rem)` gap and the aside cards a `clamp(0.75rem, 1vw, 1rem)` gap.

Wrapping: times, numbers and badges never wrap. Names (meals, team names, upcoming weather conditions) may take two lines before shortening with an ellipsis, and shorten after one line on screens 900px tall or less. Event titles always stay on one line so each list fits more events. Compact cards use label-sized weather/outfit copy, body-sized temperature, a 32px weather icon and a 24px outfit icon.

## Layout

All spacing comes from the four-point scale. Above 900px, the board is locked to the viewport and uses `minmax(0, 1.15fr) minmax(0, 1fr)` rows. The top row's columns are `var(--rail-width) minmax(0, 1fr) var(--rail-width)` with `--rail-width: minmax(17rem, 0.26fr)`. The permanent calendar key, freshness and countdowns share one card at the top of the right rail, above Previous day. Upcoming cards share a subgrid so their summaries align and multi-day bars can span several cards. The board shifts by up to two pixels every six minutes to reduce burn-in. At 900px and below, sections enter document flow, stack progressively and may scroll for development access.

The TV runs at 1920×1080; 1366×768 is the smallest supported desktop size. In Chromium verification with a busy Tuesday fixture (bin reminder, West Ham game, quote, countdowns and multi-day events), board and scroll dimensions matched each viewport exactly and the Today columns and rail fitted without overflow. Below 900px of height, the date column's spacing tightens and, when the bin reminder and West Ham game are both showing, the quote is hidden. Physical Pi/TV acceptance remains a separate outstanding gate.

## Components

- **Day panel (left rail):** live clock first, then weekday and date; Open-Meteo condition with high and low temperature, rain timing, sunrise and sunset; a full-width outfit pill at its foot.
- **Today:** the schedule with a “N done” count and Now/Next markers; the Tuesday bin reminder; optional Sous dinner, next West Ham game and morning quote.
- **Right rail:** one card holding the permanent six-group Calendar key, freshness state and up to three `#countdown` events, above quiet Previous day content.
- **Upcoming days:** six compact cards with date, weather/outfit (high and low), dinner and events, with multi-day bars spanning the cards between the summaries and event lists.
- **Event overflow:** each list renders every event that fits its measured space; the rest become a deterministic `+N more` row, or an “N events” summary when none fit.
- **All-day event:** Today shows the words “All day” (or “Until Sat” for a multi-day event). A compact all-day event shows no time marker; its title and group badge share one grid row and the accessible label says “All day”. Timed compact events retain the two-row treatment.
- **Stale warning:** a centred amber alert appears when the calendar is over an hour old or the board still shows a previous day.

## Do's and Don'ts

- Do preserve the Family/BAES source defaults and six colour mappings.
- Do keep weather, outfit, meal, bin and daylight icons local and dependency-free.
- Don't use em dashes in visible board text.
- Do keep all information stable; there are no carousels or hover-only details.
- Do preserve stale data and show its timestamp rather than blanking the board.
- Don't infer dates, outfits or household groups in the browser.
- Don't expose private providers or port 3000 outside the approved Tailscale boundary.
- Don't treat candidate-browser geometry as physical-display acceptance; Raspberry Pi/TV overscan, clipping, cursor behaviour, viewing-distance readability, wake/reboot recovery, stale operation and midnight rollover remain outstanding.
