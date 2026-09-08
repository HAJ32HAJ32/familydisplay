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

describe("visual system", () => {
  it("defines a four-point spacing scale and explicit type hierarchy", () => {
    expect(styles).toContain("--space-1: 0.25rem");
    expect(styles).toContain("--space-2: 0.5rem");
    expect(styles).toContain("--space-4: 1rem");
    expect(styles).toContain("--text-display:");
    expect(styles).toContain("--text-label:");
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
