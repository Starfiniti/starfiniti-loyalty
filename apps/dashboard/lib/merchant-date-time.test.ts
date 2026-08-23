import { describe, expect, it } from "vitest";
import {
  parseLocalDateTimeInTimeZone,
  parseMerchantLocalDateTime,
} from "./merchant-date-time";

describe("merchant date time", () => {
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

  it("supports explicit IANA zones while rejecting unknown and ambiguous inputs", () => {
    expect(
      parseLocalDateTimeInTimeZone(
        "2026-08-13T10:30",
        "America/New_York",
      )?.toISOString(),
    ).toBe("2026-08-13T14:30:00.000Z");
    expect(
      parseLocalDateTimeInTimeZone("2026-11-01T01:30", "America/New_York"),
    ).toBeNull();
    expect(
      parseLocalDateTimeInTimeZone("2026-08-13T10:30", "Mars/Olympus"),
    ).toBeNull();
  });
});
