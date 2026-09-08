/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
const responsiveStyles = styles.slice(styles.indexOf("@media (max-width: 900px)"));

describe("responsive colour guide", () => {
  it("pins the guide to the viewport bottom outside the desktop grid", () => {
    expect(responsiveStyles).toMatch(/\.colour-guide\s*\{[^}]*position:\s*fixed;[^}]*bottom:\s*0;/s);
  });

  it("allows all guide items to wrap instead of overflowing narrow screens", () => {
    expect(responsiveStyles).toMatch(/\.colour-guide__items\s*\{[^}]*flex-wrap:\s*wrap;/s);
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
  it("raises the complete TV type scale by roughly twelve percent", () => {
    expect(styles).toContain("--text-label: clamp(0.76rem, 0.81vw, 0.92rem)");
    expect(styles).toContain("--text-small: clamp(0.85rem, 0.92vw, 1.05rem)");
    expect(styles).toContain("--text-body: clamp(0.99rem, 1.12vw, 1.25rem)");
    expect(styles).toContain("--text-title: clamp(1.23rem, 1.57vw, 1.79rem)");
    expect(styles).toContain("--text-display: clamp(3.64rem, 6.05vw, 6.72rem)");
  });

  it("raises standalone weather and narrow-screen labels with the shared stack", () => {
    expect(styles).toContain("font-size: clamp(1.4rem, 2.02vw, 2.24rem)");
    expect(styles).not.toContain("font-size: 0.64rem");
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
