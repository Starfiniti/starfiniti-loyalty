import { describe, expect, it } from "vitest";
import type { MerchantOverviewReportV1 } from "@starfiniti/contracts";
import {
  formatBasisPoints,
  formatExactInteger,
  formatExactMinorAmount,
  overviewChartData,
  overviewMetrics,
  parseOverviewRange,
} from "./overview";

const report: MerchantOverviewReportV1 = {
  reportVersion: "1",
  asOf: "2026-08-12T10:00:00Z",
  rangeDays: 7,
  currencyCode: "EUR",
  minorUnitsPerMajor: 100,
  membersTotal: "9007199254740993",
  membersNew: "12",
  membersNewPrevious: "10",
  eligibleSpendMinor: "123456",
  eligibleSpendMinorPrevious: "100000",
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
};

describe("Overview presentation", () => {
  it("accepts only the supported URL ranges", () => {
    expect(parseOverviewRange("7")).toBe(7);
    expect(parseOverviewRange("90")).toBe(90);
    expect(parseOverviewRange("365")).toBe(30);
    expect(parseOverviewRange(undefined)).toBe(30);
  });

  it("formats exact integers without JavaScript precision loss", () => {
    expect(formatExactInteger("9007199254740993")).toBe(
      "9,007,199,254,740,993",
    );
    expect(formatExactMinorAmount("123456", "EUR", 100)).toBe("EUR 1,234.56");
    expect(formatBasisPoints("1480")).toBe("14.80%");
    expect(formatExactInteger("9007199254740993", "sl-SI")).toBe(
      "9.007.199.254.740.993",
    );
    expect(formatExactMinorAmount("123456", "EUR", 100, "sl-SI")).toBe(
      "EUR 1234,56",
    );
    expect(formatBasisPoints("1480", "sl-SI")).toBe("14,80%");
  });

  it("builds honest metric labels and period comparisons", () => {
    const metrics = overviewMetrics(report);
    expect(metrics.map(({ label }) => label)).toEqual([
      "Loyalty members",
      "Eligible loyalty spend",
      "Repeat-member rate",
      "Points redemption rate",
      "Points liability",
    ]);
    expect(metrics[0]).toMatchObject({ delta: "+2", tone: "positive" });
    expect(metrics[3]).toMatchObject({ delta: "−0.40 pts", tone: "negative" });
    expect(overviewMetrics(report, "sl-SI")[3]).toMatchObject({
      delta: "−0,40 odst. t.",
      tone: "negative",
    });
  });

  it("maps the bounded daily series without exposing source evidence", () => {
    expect(overviewChartData(report)[0]).toEqual({
      day: "08-06",
      members: 1,
      previous: 0,
    });
  });
});
