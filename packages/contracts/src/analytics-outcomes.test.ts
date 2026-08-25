import { describe, expect, it } from "vitest";
import {
  analyticsMetricDictionaryV3,
  analyticsMetricDictionaryV3Schema,
  analyticsProgrammeOutcomeReportV1,
} from "./analytics-outcomes";

const validReport = () => ({
  reportVersion: "1" as const,
  dictionaryVersion: "3" as const,
  asOf: "2026-08-26T00:00:00Z",
  period: {
    from: "2026-08-19T00:00:00Z",
    to: "2026-08-26T00:00:00Z",
    rangeDays: 7 as const,
    timeZone: "UTC" as const,
  },
  rewards: {
    requests: "10",
    captures: "8",
    capturedPoints: "800",
    unresolvedAtAsOf: "2",
    maturity: {
      windowHours: 24 as const,
      cohortFrom: "2026-08-18T00:00:00Z",
      cohortTo: "2026-08-25T00:00:00Z",
      requests: "8",
      captures: "6",
      unresolved: "1",
      captureRateBasisPoints: "7500",
    },
  },
  tiers: {
    decisions: "10",
    movedMembers: "6",
    entry: "1",
    reentry: "1",
    upgrade: "2",
    grace: "1",
    downgrade: "1",
    manual: "1",
    none: "3",
  },
  referrals: {
    activeAdvocates: "4",
    attributions: "10",
    pending: "2",
    qualified: "5",
    rejected: "2",
    reversed: "1",
    qualificationRateBasisPoints: "5000",
    issuances: "6",
    compensations: "1",
    advocatePointsIssued: "600",
    friendPointsIssued: "300",
    advocatePointsReversed: "100",
    friendPointsReversed: "50",
    advocatePointsNet: "500",
    friendPointsNet: "250",
  },
  campaigns: {
    currency: {
      status: "available" as const,
      code: "EUR",
      minorUnitDigits: 2,
      reason: null,
    },
    treatmentOutcomes: "7",
    controlOutcomes: "3",
    capacityExhausted: "1",
    suppressed: "1",
    influencedOrders: "4",
    influencedMembers: "3",
    influencedEligibleSpendMinor: "22000",
    pointsAwardedGross: "1000",
    pointsReversed: "200",
    pointsNet: "800",
    rewardsReserved: "2",
    manualReviewJobs: "1",
    incrementality: {
      status: "unavailable" as const,
      reason: "estimator_not_configured" as const,
      incrementalRevenueMinor: null,
    },
  },
});

describe("analytics outcome contracts", () => {
  it("publishes one complete additive V3 dictionary", () => {
    const dictionary = analyticsMetricDictionaryV3Schema.parse(
      analyticsMetricDictionaryV3,
    );
    expect(dictionary.definitions).toHaveLength(89);
    expect(dictionary.definitions.at(0)?.key).toBe("points.snapshot.pending");
    expect(dictionary.definitions.at(-1)?.key).toBe(
      "campaigns.incrementality_state",
    );
  });

  it("accepts exactly reconciled programme outcomes", () => {
    expect(analyticsProgrammeOutcomeReportV1.parse(validReport())).toEqual(
      validReport(),
    );
  });

  it("rejects an immature reward window or invented realization rate", () => {
    const immature = validReport();
    immature.rewards.maturity.cohortTo = "2026-08-26T00:00:00Z";
    expect(() => analyticsProgrammeOutcomeReportV1.parse(immature)).toThrow();

    const inventedRate = validReport();
    inventedRate.rewards.maturity.captureRateBasisPoints = "7600";
    expect(() =>
      analyticsProgrammeOutcomeReportV1.parse(inventedRate),
    ).toThrow();
  });

  it("rejects unreconciled tier or referral funnels", () => {
    const tierMismatch = validReport();
    tierMismatch.tiers.upgrade = "3";
    expect(() =>
      analyticsProgrammeOutcomeReportV1.parse(tierMismatch),
    ).toThrow();

    const referralMismatch = validReport();
    referralMismatch.referrals.pending = "3";
    expect(() =>
      analyticsProgrammeOutcomeReportV1.parse(referralMismatch),
    ).toThrow();
  });

  it("rejects compensation or point totals beyond issued value", () => {
    const excessiveCompensation = validReport();
    excessiveCompensation.referrals.compensations = "7";
    expect(() =>
      analyticsProgrammeOutcomeReportV1.parse(excessiveCompensation),
    ).toThrow();

    const campaignMismatch = validReport();
    campaignMismatch.campaigns.pointsNet = "801";
    expect(() =>
      analyticsProgrammeOutcomeReportV1.parse(campaignMismatch),
    ).toThrow();
  });

  it("rejects money without one exact currency scope", () => {
    const mixedCurrency = validReport();
    mixedCurrency.campaigns.currency = {
      status: "unavailable",
      code: null,
      minorUnitDigits: null,
      reason: "mixed_currency_scope",
    } as never;
    expect(() =>
      analyticsProgrammeOutcomeReportV1.parse(mixedCurrency),
    ).toThrow();
  });

  it("cannot relabel direct campaign attribution as measured incrementality", () => {
    const causalClaim = validReport();
    causalClaim.campaigns.incrementality = {
      status: "measured",
      reason: "control_group_present",
      incrementalRevenueMinor: "1000",
    } as never;
    expect(() =>
      analyticsProgrammeOutcomeReportV1.parse(causalClaim),
    ).toThrow();
  });
});
