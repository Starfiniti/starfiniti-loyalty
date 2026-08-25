import { describe, expect, it } from "vitest";
import {
  analyticsCohortRetentionReportV1,
  analyticsMetricDictionaryV4,
  analyticsMetricDictionaryV4Schema,
} from "./analytics-cohorts";

const emptyRows = (firstEligible: string, firstOutcome: string) =>
  Array.from({ length: 7 }, (_, index) => ({
    localDate: `2026-06-${String(index + 19).padStart(2, "0")}`,
    eligibleMembers: index === 0 ? firstEligible : "0",
    outcomeMembers: index === 0 ? firstOutcome : "0",
    rateBasisPoints:
      index === 0 && firstEligible !== "0"
        ? ((BigInt(firstOutcome) * 10_000n) / BigInt(firstEligible)).toString()
        : "0",
  }));

const validReport = () => ({
  reportVersion: "1" as const,
  dictionaryVersion: "4" as const,
  asOf: "2026-08-25T00:00:00Z",
  reportPeriod: {
    from: "2026-08-18T00:00:00Z",
    to: "2026-08-25T00:00:00Z",
    rangeDays: 7 as const,
    timeZone: "UTC" as const,
  },
  cohortPeriod: {
    from: "2026-06-19T00:00:00Z",
    to: "2026-06-26T00:00:00Z",
    fromLocalDate: "2026-06-19",
    toLocalDateExclusive: "2026-06-26",
    rangeDays: 7 as const,
    timeZone: "Europe/Ljubljana",
    maturityLagDays: 60 as const,
    grain: "day" as const,
  },
  membershipActivation: {
    observationWindowDays: 30 as const,
    joinedMembers: "10",
    activatedMembers: "4",
    activationRateBasisPoints: "4000",
    cohorts: emptyRows("10", "4"),
  },
  earningRetention: {
    qualification: "first_released_earning" as const,
    observationWindow: {
      startsAfterDays: 30 as const,
      endsAtDays: 60 as const,
    },
    qualifiedMembers: "8",
    retainedMembers: "3",
    retentionRateBasisPoints: "3750",
    cohorts: emptyRows("8", "3"),
  },
  campaignExperiments: {
    estimator: "difference_in_means_itt_v1" as const,
    population: "all_immutable_assignments" as const,
    outcome: "refund_compensated_eligible_spend_minor" as const,
    minimumMembersPerArm: 30 as const,
    eligibleCampaigns: "2",
    availableCampaigns: "1",
    unavailableCampaigns: "1",
    campaigns: [
      {
        campaignPublicId: "0198e90b-b5a4-7f22-8cca-8d57f74cfc31",
        campaignVersionPublicId: "0198e90b-c862-72d0-b9d0-e1a101a56208",
        code: "summer_test",
        versionNumber: 1,
        startsAt: "2026-08-18T00:00:00Z",
        endsAt: "2026-08-24T00:00:00Z",
        treatmentMembers: "30",
        controlMembers: "30",
        incrementality: {
          status: "available" as const,
          reason: "evidence_complete" as const,
          estimator: "difference_in_means_itt_v1" as const,
          minimumMembersPerArm: 30 as const,
          currencyCode: "EUR",
          minorUnitDigits: 2,
          treatmentEligibleSpendMinor: "30000",
          controlEligibleSpendMinor: "18000",
          exactNumerator: "360000",
          exactDenominator: "30",
          estimatedIncrementalEligibleSpendMinor: "12000",
          pointEstimateOnly: true as const,
        },
      },
      {
        campaignPublicId: "0198e90c-029c-78a2-b477-c54649d53016",
        campaignVersionPublicId: "0198e90c-0c46-720e-b725-3a5db7af3de4",
        code: "new_test",
        versionNumber: 1,
        startsAt: "2026-08-24T00:00:00Z",
        endsAt: "2026-08-31T00:00:00Z",
        treatmentMembers: "40",
        controlMembers: "40",
        incrementality: {
          status: "unavailable" as const,
          reason: "incomplete_window" as const,
          estimator: "difference_in_means_itt_v1" as const,
          minimumMembersPerArm: 30 as const,
          currencyCode: null,
          minorUnitDigits: null,
          treatmentEligibleSpendMinor: null,
          controlEligibleSpendMinor: null,
          exactNumerator: null,
          exactDenominator: null,
          estimatedIncrementalEligibleSpendMinor: null,
          pointEstimateOnly: true as const,
        },
      },
    ],
  },
});

describe("analytics cohort and experiment contracts", () => {
  it("publishes one complete additive V4 dictionary", () => {
    const dictionary = analyticsMetricDictionaryV4Schema.parse(
      analyticsMetricDictionaryV4,
    );
    expect(dictionary.definitions).toHaveLength(103);
    expect(dictionary.definitions.at(0)?.key).toBe("points.snapshot.pending");
    expect(dictionary.definitions.at(-1)?.key).toBe(
      "experiments.campaigns.incremental_eligible_spend",
    );
  });

  it("accepts mature cohorts and an exactly reconciled ITT estimate", () => {
    expect(analyticsCohortRetentionReportV1.parse(validReport())).toEqual(
      validReport(),
    );
  });

  it("rejects incomplete cohort rows or invented rates", () => {
    const missingDay = validReport();
    missingDay.membershipActivation.cohorts.pop();
    expect(() => analyticsCohortRetentionReportV1.parse(missingDay)).toThrow();

    const inventedRate = validReport();
    inventedRate.earningRetention.retentionRateBasisPoints = "3800";
    expect(() =>
      analyticsCohortRetentionReportV1.parse(inventedRate),
    ).toThrow();
  });

  it("rejects a causal point estimate that does not reconcile", () => {
    const inventedEstimate = validReport();
    inventedEstimate.campaignExperiments.campaigns[0]!.incrementality.estimatedIncrementalEligibleSpendMinor =
      "12001";
    expect(() =>
      analyticsCohortRetentionReportV1.parse(inventedEstimate),
    ).toThrow();
  });

  it("requires unavailable campaigns to suppress every monetary value", () => {
    const leakedEstimate = validReport();
    leakedEstimate.campaignExperiments.campaigns[1]!.incrementality.treatmentEligibleSpendMinor =
      "0";
    expect(() =>
      analyticsCohortRetentionReportV1.parse(leakedEstimate),
    ).toThrow();
  });

  it("rejects customer-level identifiers in the minimized report", () => {
    const leakedIdentity = validReport() as ReturnType<typeof validReport> & {
      customerId?: string;
    };
    leakedIdentity.customerId = "0198e90c-32d9-70d6-b33c-2482d52575e1";
    expect(() =>
      analyticsCohortRetentionReportV1.parse(leakedIdentity),
    ).toThrow();
  });
});
