import { describe, expect, it } from "vitest";
import {
  programmeDraftResultText,
  programmeScheduleResultText,
} from "./programme-action-copy";

describe("programme action copy", () => {
  it("localizes immutable draft outcomes", () => {
    expect(programmeDraftResultText("en", 3, false)).toContain("Draft v3");
    expect(programmeDraftResultText("sl-SI", 3, false)).toContain("Osnutek v3");
    expect(programmeDraftResultText("sl-SI", 3, true)).toBe(
      "Osnutek v3 je bil že shranjen.",
    );
  });

  it("formats scheduled publication in the selected locale and timezone", () => {
    const effectiveAt = "2026-08-13T08:30:00.000Z";
    expect(programmeScheduleResultText("en", effectiveAt, false)).toContain(
      "10:30",
    );
    expect(programmeScheduleResultText("sl-SI", effectiveAt, false)).toContain(
      "10:30",
    );
    expect(programmeScheduleResultText("sl-SI", effectiveAt, true)).toBe(
      "Ta točen urnik je bil že zabeležen.",
    );
  });
});
