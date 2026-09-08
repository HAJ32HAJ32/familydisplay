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
