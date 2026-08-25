import { describe, expect, it } from "vitest";
import {
  analyticsMetricDictionaryV1,
  analyticsMetricDictionaryV1Schema,
  analyticsMetricKeyV1,
  analyticsValueTruthReportV1,
  merchantOverviewReportV1,
} from "./reporting";

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

function valueTruthFixture() {
  return {
    reportVersion: "1",
    dictionaryVersion: "1",
    asOf: "2026-08-25T12:00:00Z",
    period: {
      from: "2026-08-18T12:00:00Z",
      to: "2026-08-25T12:00:00Z",
      rangeDays: 7,
      timeZone: "UTC",
    },
    projection: {
      status: "reconciled",
      walletCount: "12",
      walletAccountCount: "72",
      ledgerEntryCount: "99",
      lotCount: "18",
    },
    snapshot: {
      pendingPoints: "500",
      availablePoints: "-25",
      reservedPoints: "75",
      spentPoints: "9007199254740993",
      expiredPoints: "50",
      reversedPoints: "20",
      outstandingPoints: "550",
    },
    flows: {
      awardedPoints: "1000",
      releasedPoints: "800",
      reservedPoints: "200",
      capturedPoints: "125",
      cancelledPoints: "75",
      expiredPoints: "50",
      refundReversedPoints: "20",
      manualCreditPoints: "10",
      manualDebitPoints: "35",
      manualNetPoints: "-25",
    },
    expiry: {
      lotBackedPoints: "600",
      overdueAvailablePoints: "25",
      reservedPastExpiryPoints: "10",
      expiringNext30Days: "100",
      expiringDays31To90: "200",
      expiringBeyond90Days: "265",
      affectedMembers: "8",
      nextExpiryAt: "2026-08-29T00:00:00Z",
    },
    monetaryLiability: {
      status: "unavailable",
      reason: "valuation_policy_not_configured",
    },
  } as const;
}

describe("analytics metric dictionary V1", () => {
  it("covers every allowlisted metric exactly once with complete evidence fields", () => {
    expect(
      analyticsMetricDictionaryV1Schema.safeParse(analyticsMetricDictionaryV1)
        .success,
    ).toBe(true);

    const dictionaryKeys = analyticsMetricDictionaryV1.definitions.map(
      (definition) => definition.key,
    );
    expect(new Set(dictionaryKeys).size).toBe(dictionaryKeys.length);
    expect(new Set(dictionaryKeys)).toEqual(
      new Set(analyticsMetricKeyV1.options),
    );
  });

  it("makes monetary liability explicitly unavailable without a valuation policy", () => {
    const monetary = analyticsMetricDictionaryV1.definitions.find(
      (definition) => definition.key === "liability.monetary",
    );
    expect(monetary).toMatchObject({
      availability: "unavailable",
      currencyPolicy: "unavailable_without_valuation_policy",
      causalClass: "unavailable",
      displayFormat: "currency_unavailable",
    });
    expect(JSON.stringify(monetary)).not.toContain("100 points");
  });
});

describe("analytics value truth report V1", () => {
  it("preserves signed and larger-than-JavaScript integers as exact text", () => {
    expect(
      analyticsValueTruthReportV1.safeParse(valueTruthFixture()).success,
    ).toBe(true);
  });

  it("rejects mismatched periods and bucket arithmetic", () => {
    for (const candidate of [
      {
        ...valueTruthFixture(),
        period: { ...valueTruthFixture().period, from: "2026-08-19T12:00:00Z" },
      },
      {
        ...valueTruthFixture(),
        snapshot: { ...valueTruthFixture().snapshot, outstandingPoints: "551" },
      },
      {
        ...valueTruthFixture(),
        flows: { ...valueTruthFixture().flows, manualNetPoints: "25" },
      },
      {
        ...valueTruthFixture(),
        expiry: { ...valueTruthFixture().expiry, lotBackedPoints: "601" },
      },
    ]) {
      expect(analyticsValueTruthReportV1.safeParse(candidate).success).toBe(
        false,
      );
    }
  });

  it("rejects numeric coercion and invented monetary liability", () => {
    expect(
      analyticsValueTruthReportV1.safeParse({
        ...valueTruthFixture(),
        snapshot: {
          ...valueTruthFixture().snapshot,
          spentPoints: 9_007_199_254_740_993,
        },
      }).success,
    ).toBe(false);
    expect(
      analyticsValueTruthReportV1.safeParse({
        ...valueTruthFixture(),
        monetaryLiability: { status: "available", amountMinor: "550" },
      }).success,
    ).toBe(false);
  });
});
