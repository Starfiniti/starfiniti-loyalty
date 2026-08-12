import { describe, expect, it } from "vitest";
import {
  parseMerchantLocalDateTime,
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

  it("converts unambiguous Ljubljana wall time and rejects DST traps", () => {
    expect(parseMerchantLocalDateTime("2026-08-13T10:30")?.toISOString()).toBe(
      "2026-08-13T08:30:00.000Z",
    );
    expect(parseMerchantLocalDateTime("2026-01-13T10:30")?.toISOString()).toBe(
      "2026-01-13T09:30:00.000Z",
    );
    expect(parseMerchantLocalDateTime("2026-03-29T02:30")).toBeNull();
    expect(parseMerchantLocalDateTime("2026-10-25T02:30")).toBeNull();
    expect(parseMerchantLocalDateTime("2026-02-31T10:30")).toBeNull();
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
