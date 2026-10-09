/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
const responsiveStyles = styles.slice(styles.indexOf("@media (max-width: 900px)"));

describe("top-right colour guide", () => {
  it("stacks the guide and countdowns above yesterday in a dedicated rail", () => {
    expect(styles).toMatch(/\.top-row__rail\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/s);
    expect(styles).toMatch(/\.top-row__rail > \.rail-card\s*\{[^}]*flex:\s*0\s+0\s+auto;/s);
    expect(styles).toMatch(/\.top-row__rail > \.yesterday-panel\s*\{[^}]*flex:\s*1\s+1\s+0;/s);
    expect(styles).toMatch(/\.colour-guide\s*\{[^}]*flex-direction:\s*column;/s);
  });

  it("keeps the guide in document flow rather than pinning it to the bottom on narrow screens", () => {
    expect(responsiveStyles).not.toMatch(/\.colour-guide\s*\{[^}]*position:\s*fixed;/s);
  });
});

function luminance(hex: string) {
  const channels = hex.slice(1).match(/../g)!.map((channel) => {
    const value = Number.parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrast(foreground: string, background: string) {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter! + 0.05) / (darker! + 0.05);
}

function mix(foreground: string, background: string, foregroundPercent: number) {
  const weight = foregroundPercent / 100;
  const channels = [1, 3, 5].map((offset) => {
    const foregroundChannel = Number.parseInt(foreground.slice(offset, offset + 2), 16);
    const backgroundChannel = Number.parseInt(background.slice(offset, offset + 2), 16);
    return Math.round(foregroundChannel * weight + backgroundChannel * (1 - weight));
  });
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function eventInkMix(variable: "time" | "meta") {
  const match = styles.match(new RegExp(`--event-${variable}-ink:\\s*color-mix\\(in srgb, var\\(--event-ink\\) (\\d+)%, var\\(--event-fill\\)\\)`));
  expect(match, `missing --event-${variable}-ink colour mix`).not.toBeNull();
  return Number(match![1]);
}

const eventColours = [
  ["h-and-chantele", "#b68fec", "#0b1322"],
  ["all", "#75a0f5", "#0b1322"],
  ["rafe", "#68c463", "#0b1322"],
  ["h", "#465166", "#f8fafc"],
  ["chantele", "#a31352", "#f8fafc"],
  ["household", "#efa766", "#0b1322"],
] as const;

describe("visual system", () => {
  it("uses Beetroot for Chantele's legend swatch", () => {
    expect(styles).toMatch(/\.colour-guide__swatch--beetroot\s*\{[^}]*background:\s*var\(--group-chantele\);/s);
    expect(styles).not.toContain("colour-guide__swatch--banana");
  });

  it("makes today's clock bold with steady digits", () => {
    expect(styles).toMatch(/\.day-panel__clock\s*\{[^}]*font-variant-numeric:\s*tabular-nums;[^}]*font-weight:\s*(?:7\d\d|8\d\d|9\d\d);/s);
  });

  it("only nudges the board for burn-in protection on the wide TV layout", () => {
    expect(styles).toMatch(/@keyframes burn-in-shift/);
    expect(styles).toMatch(/@media \(min-width: 901px\)\s*\{[^@]*\.display-board\s*\{\s*animation:\s*burn-in-shift 30m step-end infinite;/s);
  });

  it("lines multi-day bars up with the upcoming cards using a shared grid", () => {
    expect(styles).toMatch(/\.future-grid--spans \.future-day\s*\{[^}]*grid-row:\s*1\s*\/\s*-1;[^}]*grid-template-rows:\s*subgrid;/s);
    expect(styles).toMatch(/\.future-grid--spans \.future-day > :last-child\s*\{[^}]*grid-row:\s*-2\s*\/\s*-1;/s);
  });

  it("gives yesterday a greyer, lower-hierarchy surface and enough room for its visible event", () => {
    expect(styles).toMatch(/\.yesterday-panel\s*\{[^}]*display:\s*flex;[^}]*min-height:\s*0;[^}]*flex-direction:\s*column;[^}]*padding:\s*var\(--space-3\)\s+var\(--space-4\);[^}]*color:\s*var\(--subtle\);[^}]*background:\s*#151b24;/s);
    expect(styles).toMatch(/\.yesterday-panel \.event-list--adaptive\s*\{[^}]*height:\s*auto;[^}]*flex:\s*1\s+1\s+0;/s);
    expect(styles).toMatch(/\.yesterday-panel h2\s*\{[^}]*margin:\s*0\s+0\s+var\(--space-2\);[^}]*color:\s*var\(--muted\);[^}]*font-weight:\s*500;/s);
  });

  it("uses a shallow two-column future summary with stacked date and meal below", () => {
    expect(styles).toMatch(/\.future-day__summary\s*\{[^}]*grid-template-columns:\s*auto\s+minmax\(0,\s*1fr\);[^}]*padding:\s*var\(--space-2\);/s);
    expect(styles).toMatch(/\.future-day__summary h2\s*\{[^}]*flex-direction:\s*column;/s);
    expect(styles).toMatch(/\.future-day__summary > \.weather\s*\{[^}]*justify-self:\s*end;/s);
    expect(styles).toMatch(/\.future-day__summary \.meal\s*\{[^}]*grid-column:\s*1\s*\/\s*-1;/s);
  });

  it("allocates nearly half the desktop height to the six future cards", () => {
    expect(styles).toMatch(/\.display-board\s*\{[^}]*grid-template-rows:\s*minmax\(0,\s*1\.15fr\)\s+minmax\(0,\s*1fr\);/s);
  });

  it("uses the revised TV type scale", () => {
    expect(styles).toContain("--text-label: clamp(1rem, 1.05vw, 1.2rem)");
    expect(styles).toContain("--text-small: clamp(1.1rem, 1.2vw, 1.375rem)");
    expect(styles).toContain("--text-body: clamp(1.3125rem, 1.465vw, 1.625rem)");
    expect(styles).toContain("--text-title: clamp(1.625rem, 2.05vw, 2.35rem)");
    expect(styles).toContain("--text-display: clamp(5rem, 8vw, 9rem)");
  });

  it("lets today's meal fill the aside width while hugging its content height", () => {
    expect(styles).toMatch(/\.meal--today\s*\{[^}]*align-self:\s*stretch;[^}]*flex:\s*0\s+0\s+auto;/s);
    expect(styles).toMatch(/\.morning-quote\s*\{[^}]*flex:\s*0\s+0\s+auto;[^}]*overflow:\s*visible;/s);
  });

  it("keeps the West Ham fixture full-width, content-height and compact beside the meal and quote", () => {
    expect(styles).toMatch(/\.next-match\s*\{[^}]*align-self:\s*stretch;[^}]*flex:\s*0\s+0\s+auto;[^}]*padding:\s*var\(--space-3\);/s);
    expect(styles).toMatch(/\.next-match__fixture\s*\{[^}]*grid-template-columns:\s*minmax\(2\.5rem,\s*1fr\)\s+minmax\(6rem,\s*auto\)\s+minmax\(2\.5rem,\s*1fr\);/s);
    expect(styles).toMatch(/\.next-match__team img\s*\{[^}]*width:\s*2\.5rem;[^}]*height:\s*2\.5rem;[^}]*object-fit:\s*contain;/s);
  });

  it("compacts the quote only when the match card is present so the Today aside stays bounded", () => {
    expect(styles).toMatch(/\.today-card__aside:has\(\.next-match\)\s*\{[^}]*gap:\s*var\(--space-3\);/s);
    expect(styles).toMatch(/\.today-card__aside:has\(\.next-match\) \.morning-quote\s*\{[^}]*flex:\s*1\s+1\s+0;[^}]*padding:\s*var\(--space-3\);[^}]*overflow:\s*hidden;/s);
    expect(styles).toMatch(/\.today-card__aside:has\(\.next-match\) \.morning-quote p\s*\{[^}]*font-size:\s*var\(--text-small\);[^}]*line-height:\s*1\.25;[^}]*-webkit-line-clamp:\s*2;/s);
    expect(styles).toMatch(/\.today-card__aside:has\(\.next-match\) \.morning-quote cite\s*\{[^}]*font-size:\s*clamp\(0\.8rem,\s*0\.9vw,\s*1rem\);[^}]*-webkit-line-clamp:\s*1;/s);
  });

  it("keeps today's temperature inside the narrowed date column at TV size", () => {
    expect(styles).toMatch(/\.weather__reading strong\s*\{[^}]*font-size:\s*clamp\(2\.25rem,\s*2\.7vw,\s*3rem\);/s);
  });

  it("intentionally truncates long morning quote content to deterministic readable lines", () => {
    expect(styles).toMatch(/\.morning-quote p\s*\{[^}]*display:\s*-webkit-box;[^}]*overflow:\s*hidden;[^}]*overflow-wrap:\s*anywhere;[^}]*-webkit-box-orient:\s*vertical;[^}]*-webkit-line-clamp:\s*4;/s);
    expect(styles).toMatch(/\.morning-quote cite\s*\{[^}]*display:\s*-webkit-box;[^}]*overflow:\s*hidden;[^}]*overflow-wrap:\s*anywhere;[^}]*-webkit-box-orient:\s*vertical;[^}]*-webkit-line-clamp:\s*2;/s);
  });

  it("contains today's date and weather in one centred panel with a full-width outfit pill at its foot", () => {
    expect(styles).toMatch(/\.day-panel\s*\{[^}]*align-items:\s*center;[^}]*flex-direction:\s*column;[^}]*border:\s*1px solid var\(--line\);[^}]*border-radius:\s*var\(--radius-lg\);[^}]*text-align:\s*center;/s);
    expect(styles).toMatch(/\.weather--today\s*\{[^}]*align-items:\s*center;[^}]*width:\s*100%;[^}]*border-top:\s*1px solid var\(--line\);/s);
    expect(styles).toMatch(/\.outfit--today\s*\{[^}]*justify-content:\s*center;[^}]*width:\s*100%;/s);
    expect(styles).toMatch(/\.day-panel__when\s*\{\s*margin-top:\s*auto;\s*\}/s);
    expect(styles).toMatch(/\.day-panel \.weather--today\s*\{\s*margin-bottom:\s*auto;\s*\}/s);
    expect(styles).toMatch(/\.weather--compact \.outfit\s*\{[^}]*grid-column:\s*1\s*\/\s*-1;[^}]*justify-content:\s*flex-start;[^}]*width:\s*fit-content;/s);
  });

  it("mirrors the day panel and the right-hand rail at one shared width either side of Today", () => {
    expect(styles).toMatch(/\.top-row\s*\{[^}]*--rail-width:\s*minmax\(17rem,\s*0\.26fr\);[^}]*grid-template-columns:\s*var\(--rail-width\)\s+minmax\(0,\s*1fr\)\s+var\(--rail-width\);/s);
  });

  it("bundles the Inter display font ahead of system fallbacks", () => {
    expect(styles).toMatch(/font-family:\s*"Inter Variable",\s*Inter,/);
  });

  it("lets names wrap to two lines on the TV and shortens them after one line on shorter screens", () => {
    expect(styles).toMatch(/\.meal strong,\s*\.meal__value\s*\{[^}]*-webkit-line-clamp:\s*2;/s);
    expect(styles).toMatch(/\.next-match__team strong\s*\{[^}]*-webkit-line-clamp:\s*2;/s);
    expect(styles).toMatch(/\.weather--compact \.weather__condition\s*\{[^}]*-webkit-line-clamp:\s*2;/s);
    expect(styles).toMatch(/@media \(min-width: 901px\) and \(max-height: 900px\)\s*\{[^@]*\.meal strong,\s*\.meal__value,\s*\.next-match__team strong,\s*\.weather--compact \.weather__condition\s*\{\s*-webkit-line-clamp:\s*1;/s);
  });

  it("gives the Today columns and aside cards room to breathe", () => {
    expect(styles).toMatch(/\.today-card\s*\{[^}]*gap:\s*clamp\(var\(--space-6\),\s*2\.4vw,\s*var\(--space-12\)\);/s);
    expect(styles).toMatch(/\.today-card__aside\s*\{[^}]*gap:\s*clamp\(var\(--space-3\),\s*1vw,\s*var\(--space-4\)\);/s);
  });

  it("hides the quote on shorter screens only when the bins and West Ham game both need the aside", () => {
    expect(styles).toMatch(/@media \(min-width: 901px\) and \(max-height: 900px\)\s*\{[^@]*\.today-card__aside:has\(\.bin-reminder\):has\(\.next-match\) \.morning-quote\s*\{\s*display:\s*none;/s);
  });

  it("makes today's weather and outfit materially larger than compact forecasts", () => {
    expect(styles).toContain("--icon-sm: 1.5rem");
    expect(styles).toContain("--icon-md: 2rem");
    expect(styles).toContain("--icon-lg: 3rem");
    expect(styles).toMatch(/\.weather\s*\{[^}]*font-size:\s*var\(--text-body\);/s);
    expect(styles).toMatch(/\.weather--compact\s*\{[^}]*font-size:\s*var\(--text-label\);/s);
    expect(styles).toMatch(/\.weather__reading strong\s*\{[^}]*font-size:\s*clamp\(2\.25rem,\s*2\.7vw,\s*3rem\);/s);
    expect(styles).toMatch(/\.weather--compact \.weather__reading strong\s*\{[^}]*font-size:\s*var\(--text-body\);/s);
    expect(styles).toMatch(/\.icon--weather\s*\{[^}]*width:\s*var\(--icon-lg\);[^}]*height:\s*var\(--icon-lg\);/s);
    expect(styles).toMatch(/\.weather--compact \.icon--weather\s*\{[^}]*width:\s*var\(--icon-md\);[^}]*height:\s*var\(--icon-md\);/s);
    expect(styles).toMatch(/\.outfit--today \.icon--outfit\s*\{[^}]*width:\s*var\(--icon-md\);[^}]*height:\s*var\(--icon-md\);/s);
    expect(styles).toMatch(/\.outfit--today span\s*\{[^}]*font-size:\s*var\(--text-body\);[^}]*font-weight:\s*700;/s);
    expect(styles).toMatch(/\.weather--compact \.outfit\s*\{[^}]*font-size:\s*var\(--text-label\);/s);
  });

  it("lets today's adaptive schedule use only the space left beneath its heading", () => {
    expect(styles).toMatch(/\.today-card__schedule \.event-list--adaptive\s*\{[^}]*height:\s*auto;[^}]*flex:\s*1\s+1\s+0;/s);
  });

  it("keeps compact all-day events on one bounded row without changing timed compact rows", () => {
    expect(styles).toMatch(/\.event-list--adaptive\s*\{[^}]*height:\s*100%;/s);
    expect(styles).toMatch(/\.event-overflow--measure\s*\{[^}]*position:\s*absolute;[^}]*visibility:\s*hidden;/s);
    expect(styles).toMatch(/\.event-list--compact \.event--all-day \.event__body\s*\{[^}]*grid-column:\s*1;[^}]*grid-row:\s*1;[^}]*overflow:\s*hidden;/s);
    expect(styles).toMatch(/\.event-list--compact \.event--all-day \.event__group\s*\{[^}]*grid-column:\s*2;[^}]*grid-row:\s*1;/s);
    expect(styles).toMatch(/\.event-list--compact \.event__body\s*\{[^}]*grid-column:\s*1\s*\/\s*-1;[^}]*grid-row:\s*2;/s);
  });

  it.each(eventColours)("gives %s event text enhanced contrast", (_group, fill, ink) => {
    expect(contrast(ink, fill)).toBeGreaterThanOrEqual(7);
    expect(styles).toContain(fill);
  });

  it.each(eventColours)("keeps %s event time and metadata legible", (_group, fill, ink) => {
    expect(contrast(mix(ink, fill, eventInkMix("time")), fill)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(mix(ink, fill, eventInkMix("meta")), fill)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps event titles strongest, times secondary, and group/location metadata lightest across event fills", () => {
    expect(styles).toMatch(/\.event\s*\{[^}]*--event-title-ink:\s*var\(--event-ink\);[^}]*--event-time-ink:\s*color-mix\(in srgb, var\(--event-ink\) 82%, var\(--event-fill\)\);[^}]*--event-meta-ink:\s*color-mix\(in srgb, var\(--event-ink\) 74%, var\(--event-fill\)\);/s);
    expect(styles).toMatch(/\.event__title\s*\{[^}]*color:\s*var\(--event-title-ink\);[^}]*font-weight:\s*750;/s);
    expect(styles).toMatch(/\.event__time\s*\{[^}]*color:\s*var\(--event-time-ink\);[^}]*font-weight:\s*400;/s);
    expect(styles).toMatch(/\.event__location\s*\{[^}]*color:\s*var\(--event-meta-ink\);[^}]*font-weight:\s*400;/s);
    expect(styles).toMatch(/\.event__group\s*\{[^}]*border:\s*1px solid var\(--event-meta-ink\);[^}]*color:\s*var\(--event-meta-ink\);[^}]*background:\s*transparent;[^}]*font-weight:\s*400;/s);
  });

  it("gives event labels more horizontal room without increasing their fixed height", () => {
    expect(styles).toMatch(/\.event__group\s*\{[^}]*height:\s*var\(--space-6\);[^}]*padding:\s*0\s+var\(--space-2\);[^}]*font-size:\s*clamp\(0\.875rem,\s*0\.9vw,\s*1rem\);/s);
  });

  it("labels all-day events in words at a smaller size than a timed event", () => {
    expect(styles).toMatch(/\.event__time--all-day\s*\{[^}]*font-size:\s*0\.78em;[^}]*white-space:\s*nowrap;/s);
  });

  it("does not draw em dashes anywhere on the board", () => {
    expect(styles).not.toContain("—");
  });

  it.each([
    ["h-and-chantele", "var(--group-h-and-chantele)"],
    ["all", "var(--group-all)"],
    ["rafe", "var(--group-rafe)"],
    ["h", "var(--group-h)"],
    ["chantele", "var(--group-chantele)"],
    ["household", "var(--group-household)"]
  ])("fills %s event pills with its canonical colour token", (group, token) => {
    expect(styles).toMatch(new RegExp(`\\.event--${group}\\s*\\{[^}]*background:\\s*${token.replace(/[()]/g, "\\$&")};`, "s"));
  });
});
