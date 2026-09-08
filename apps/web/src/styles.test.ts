/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
const responsiveStyles = styles.slice(styles.indexOf("@media (max-width: 900px)"));

describe("top-right colour guide", () => {
  it("stacks the guide above yesterday in a dedicated rail", () => {
    expect(styles).toMatch(/\.top-row__rail\s*\{[^}]*grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\);/s);
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

describe("visual system", () => {
  it("raises the complete TV type scale by roughly fifty percent on a clean modular scale", () => {
    expect(styles).toContain("--text-label: clamp(1.125rem, 1.2vw, 1.375rem)");
    expect(styles).toContain("--text-small: clamp(1.25rem, 1.375vw, 1.5625rem)");
    expect(styles).toContain("--text-body: clamp(1.5rem, 1.675vw, 1.875rem)");
    expect(styles).toContain("--text-title: clamp(1.875rem, 2.35vw, 2.6875rem)");
    expect(styles).toContain("--text-display: clamp(5.5rem, 9vw, 10rem)");
  });

  it("raises standalone weather text and all local icons with the same visual scale", () => {
    expect(styles).toContain("font-size: clamp(2.125rem, 3vw, 3.375rem)");
    expect(styles).toContain("--icon-sm: 1.75rem");
    expect(styles).toContain("--icon-md: 2.625rem");
    expect(styles).toContain("--icon-lg: 3.5rem");
    expect(styles).toMatch(/\.icon\s*\{[^}]*width:\s*var\(--icon-md\);[^}]*height:\s*var\(--icon-md\);/s);
    expect(styles).toMatch(/\.icon--weather\s*\{[^}]*width:\s*var\(--icon-lg\);[^}]*height:\s*var\(--icon-lg\);/s);
  });

  it.each([
    ["h-and-chantele", "#b68fec", "#0b1322"],
    ["all", "#75a0f5", "#0b1322"],
    ["rafe", "#68c463", "#0b1322"],
    ["h", "#465166", "#f8fafc"],
    ["chantele", "#eacb62", "#0b1322"],
    ["household", "#efa766", "#0b1322"],
  ])("gives %s event text enhanced contrast", (_group, fill, ink) => {
    expect(contrast(ink, fill)).toBeGreaterThanOrEqual(7);
    expect(styles).toContain(fill);
  });

  it("keeps time, location and group labels fully opaque and gives the group badge an inverse treatment", () => {
    const eventText = styles.slice(styles.indexOf(".event__time"), styles.indexOf(".empty-day"));
    expect(eventText).not.toContain("opacity:");
    const groupLabel = eventText.slice(eventText.indexOf(".event__group"));
    expect(groupLabel).toMatch(/background:\s*var\(--event-ink\);/);
    expect(groupLabel).toMatch(/color:\s*var\(--event-fill\);/);
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
