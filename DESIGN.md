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
  grape: "#A47AE2"
  blueberry: "#5484ED"
  basil: "#51B749"
  graphite: "#616161"
  banana: "#FBD75B"
  tangerine: "#FFB878"
typography:
  display:
    fontFamily: Inter
    fontSize: 5.4vw
    fontWeight: 300
    lineHeight: 0.9
    letterSpacing: "-0.05em"
  title:
    fontFamily: Inter
    fontSize: 1.4vw
    fontWeight: 650
    lineHeight: 1.15
  body:
    fontFamily: Inter
    fontSize: 1vw
    fontWeight: 400
    lineHeight: 1.3
  label:
    fontFamily: Inter
    fontSize: 0.72vw
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

The six event colours preserve the established Google Calendar mapping. Filled pills use deep ink text except Graphite, which uses light text. Cyan is reserved for weather and date emphasis rather than household identity.

## Typography

Use weight, size and restrained uppercase labels to establish hierarchy. Never reduce primary TV text merely to fit more content; truncate exceptional content predictably instead.

## Layout

All spacing is drawn from a four-point scale. The 1366×768 and television layouts must fit without scrolling. Narrow development views may stack and scroll normally.

## Shapes

Panels use 20px radii, event pills use 12px radii, and compact controls or badges use 8px radii. Icons use consistent 16px, 24px or 32px boxes.

## Components

The today panel combines date, forecast, outfit, schedule, dinner and the optional morning quote. The quote uses a restrained inset treatment beside dinner and remains absent when its private provider is not configured or unavailable. Every future-day column contains the same date-specific data categories in compressed form. Event pills are filled with their household-group colour, retain a visible group badge plus an accessible label that includes the displayed time, and replace overflow with a deterministic `+N more` summary rather than clipping events silently.

## Do's and Don'ts

- Do preserve the household colour mapping and WCAG AA text contrast.
- Do keep weather, outfit and meal icons local and dependency-free.
- Do keep all information stable; there are no carousels or hover-only details.
- Don't infer dates, outfits or household groups in the browser.
- Don't split dinner into a disconnected half-screen feature.
