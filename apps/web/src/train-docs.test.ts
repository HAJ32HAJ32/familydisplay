import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const constraints = readFileSync(resolve(import.meta.dirname, "../../../CONSTRAINTS.md"), "utf8");
const deployment = readFileSync(resolve(import.meta.dirname, "../../../docs/deployment.md"), "utf8");

describe("train rotation operating contract", () => {
  it("documents the bounded carousel exception and reduced-motion behaviour", () => {
    expect(constraints).toContain("train station rotation");
    expect(constraints).toContain("15 seconds");
    expect(constraints).toContain("no transition or decorative animation");
    expect(constraints).toContain("prefers-reduced-motion");
  });

  it("documents train release verification without a credential requirement", () => {
    expect(deployment).toContain("RailInfo train departures");
    expect(deployment).toContain("requires no local API credentials");
    expect(deployment).toContain("/api/trains");
  });
});
