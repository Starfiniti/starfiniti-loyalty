import { describe, expect, it } from "vitest";
import { merchantOverviewReportV1 } from "./reporting";

function fixture() {
  return {
    reportVersion: "1",
    asOf: "2026-08-12T10:00:00Z",
    rangeDays: 7,
    currencyCode: "EUR",
    minorUnitsPerMajor: 100,
    membersTotal: "12842",
    membersNew: "321",
    membersNewPrevious: "280",
    eligibleSpendMinor: "18432000",
    eligibleSpendMinorPrevious: "17000000",
    repeatRateBasisPoints: "3860",
    repeatRateBasisPointsPrevious: "3650",
    redemptionRateBasisPoints: "1480",
    redemptionRateBasisPointsPrevious: "1520",
    outstandingPoints: "846270",
    dailyNewMembers: Array.from({ length: 7 }, (_, index) => ({
      date: `2026-08-${String(index + 6).padStart(2, "0")}`,
      current: String(index + 1),
      previous: String(index),
    })),
  } as const;
}

describe("merchant Overview report contract", () => {
  it("preserves exact aggregate integers and bounded daily series", () => {
    expect(merchantOverviewReportV1.safeParse(fixture()).success).toBe(true);
  });

  it("rejects partial currency metadata and mismatched trend lengths", () => {
    expect(
      merchantOverviewReportV1.safeParse({
        ...fixture(),
        minorUnitsPerMajor: null,
      }).success,
    ).toBe(false);
    expect(
      merchantOverviewReportV1.safeParse({
        ...fixture(),
        dailyNewMembers: fixture().dailyNewMembers.slice(1),
      }).success,
    ).toBe(false);
  });

  it("rejects floating, negative count, and unsupported range values", () => {
    for (const patch of [
      { membersTotal: "1.5" },
      { eligibleSpendMinor: "-1" },
      { rangeDays: 365 },
    ]) {
      expect(
        merchantOverviewReportV1.safeParse({ ...fixture(), ...patch }).success,
      ).toBe(false);
    }
  });
});
