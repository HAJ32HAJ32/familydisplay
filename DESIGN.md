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
    fontSize: 9vw
    fontWeight: 300
    lineHeight: 0.9
    letterSpacing: "-0.05em"
  title:
    fontFamily: Inter
    fontSize: 2.35vw
    fontWeight: 650
    lineHeight: 1.15
  body:
    fontFamily: Inter
    fontSize: 1.675vw
    fontWeight: 400
    lineHeight: 1.3
  label:
    fontFamily: Inter
    fontSize: 1.2vw
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.06em"
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

A dark, stable television dashboard designed for a five-second glance across a room. Each date owns its weather, outfit, events and dinner; today is dominant, future days are consistent, and yesterday is quiet context. An optional morning quote sits within today’s primary panel so it reads as calm context rather than a separate feature.

## Colors

The six event colours preserve the established Google Calendar mapping while using tuned chroma and luminance for television viewing. Every foreground/background pair reaches at least 7:1 contrast: filled pills use deep ink text except Graphite, which uses light text. Time, location and title text remain fully opaque; the inverse group badge gives the identity label a distinct colour hierarchy without relying on hue alone. Cyan is reserved for weather and date emphasis rather than household identity.

## Typography

Use weight, size and restrained uppercase labels to establish hierarchy. The shared label, small, body, title and display steps are approximately 50% larger than the previous television release and aligned to a clean modular scale. Never reduce primary TV text merely to fit more content; truncate exceptional content predictably instead.

## Layout

All spacing is drawn from a four-point scale. The 1366×768 and television layouts must fit without scrolling. The permanent calendar key lives in the top-right rail above the previous-day panel; narrow development views keep it in normal document flow and may stack and scroll normally.

## Shapes

Panels use 20px radii, event pills use 12px radii, and compact controls or badges use 8px radii. Local icons use a 28px, 42px and 56px scale, 75% larger than the first television release.

## Components

The today panel combines date, forecast, outfit, schedule, dinner and the optional morning quote. The quote uses a restrained inset treatment beside dinner and remains absent when its private provider is not configured or unavailable. Every future-day column contains the same date-specific data categories in compressed form. Event pills are filled with their household-group colour, retain a visible group badge plus an accessible label that includes the displayed time, and replace overflow with a deterministic `+N more` summary rather than clipping events silently. All-day events show a visually separate em dash while their accessible event label continues to say “All day”.

## Do's and Don'ts

- Do preserve the household colour mapping and WCAG AA text contrast.
- Do keep weather, outfit and meal icons local and dependency-free.
- Do keep all information stable; there are no carousels or hover-only details.
- Don't infer dates, outfits or household groups in the browser.
- Don't split dinner into a disconnected half-screen feature.
