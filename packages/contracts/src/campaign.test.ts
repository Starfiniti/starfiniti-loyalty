import { describe, expect, it } from "vitest";
import {
  campaignDefinitionV1,
  campaignPurchaseCandidateV1,
  campaignPurchaseEvaluationV1,
  campaignResultV1,
  campaignPreviewV1,
  campaignScheduleV1,
  campaignTriggerExecutionV1,
  campaignTriggerJobV1,
  merchantPauseCampaignVersionCommandV1,
  CAMPAIGN_METRIC_DICTIONARY_V1,
} from "./campaign";

const schedule = {
  timezone: "Europe/Ljubljana",
  startsAt: "2026-10-25T02:30:00+02:00",
  startsLocal: "2026-10-25T02:30:00",
  endsAt: "2026-10-25T03:30:00+01:00",
  endsLocal: "2026-10-25T03:30:00",
};

const definition = {
  schemaVersion: "1" as const,
  code: "autumn_bonus",
  name: "Autumn bonus",
  description: "Explicitly disambiguated DST campaign.",
  audienceSnapshotId: "87000000-0000-4000-8000-000000000501",
  exclusionSnapshotIds: ["87000000-0000-4000-8000-000000000502"],
  schedule,
  behavior: {
    kind: "bonus_points" as const,
    earningRuleCodes: ["purchase"],
    reward: { kind: "points" as const, points: "100" },
  },
  capacity: {
    globalEffectLimit: "1000",
    perMemberEffectLimit: 2,
    maximumPoints: "100000",
    maximumLiabilityMinor: null,
    liabilityMinorPerEffect: null,
    liabilityCurrencyCode: null,
    liabilityMinorUnitDigits: null,
  },
  controlBasisPoints: 1000,
};

describe("campaignScheduleV1", () => {
  it("accepts an explicitly offset fall-back instant", () => {
    expect(campaignScheduleV1.parse(schedule)).toEqual(schedule);
  });

  it("rejects spring-gap local evidence and reversed instants", () => {
    expect(
      campaignScheduleV1.safeParse({
        ...schedule,
        startsAt: "2026-03-29T02:30:00+01:00",
        startsLocal: "2026-03-29T02:30:00",
        endsAt: "2026-03-29T04:00:00+02:00",
        endsLocal: "2026-03-29T04:00:00",
      }).success,
    ).toBe(false);
    expect(
      campaignScheduleV1.safeParse({
        ...schedule,
        endsAt: "2026-10-25T01:30:00+02:00",
        endsLocal: "2026-10-25T01:30:00",
      }).success,
    ).toBe(false);
  });

  it("rejects unknown zones and mismatched local evidence", () => {
    expect(
      campaignScheduleV1.safeParse({ ...schedule, timezone: "Mars/Olympus" })
        .success,
    ).toBe(false);
    expect(
      campaignScheduleV1.safeParse({
        ...schedule,
        startsLocal: "2026-10-25T01:30:00",
      }).success,
    ).toBe(false);
  });
});

describe("campaignDefinitionV1", () => {
  it("accepts a bounded bonus-points campaign", () => {
    expect(campaignDefinitionV1.parse(definition)).toEqual(definition);
  });

  it.each([
    {
      kind: "purchase_multiplier",
      earningRuleCodes: ["purchase"],
      multiplierBasisPoints: 20_000,
      priority: 100,
    },
    {
      kind: "milestone",
      metric: "order_count",
      threshold: "5",
      activityCodes: [],
      reward: { kind: "points", points: "250" },
    },
    {
      kind: "win_back",
      minimumInactiveDays: 30,
      minimumEligibleSpendMinor: "5000",
      reward: { kind: "points", points: "300" },
    },
    {
      kind: "tier",
      movement: "entry",
      tierCodes: ["bloom"],
      reward: { kind: "points", points: "500" },
    },
    {
      kind: "referral",
      rewardedParty: "advocate",
      reward: { kind: "points", points: "200" },
    },
    {
      kind: "limited_quantity",
      reward: {
        kind: "programme_reward",
        rewardId: "87000000-0000-4000-8000-000000000601",
      },
    },
  ])("accepts strict $kind behavior", (behavior) => {
    const usesProgrammeReward = behavior.kind === "limited_quantity";
    expect(
      campaignDefinitionV1.safeParse({
        ...definition,
        behavior,
        capacity: {
          ...definition.capacity,
          perMemberEffectLimit: usesProgrammeReward ? 1 : 2,
          maximumPoints: usesProgrammeReward ? null : "100000",
          maximumLiabilityMinor: usesProgrammeReward ? "500000" : null,
          liabilityMinorPerEffect: usesProgrammeReward ? "5000" : null,
          liabilityCurrencyCode: usesProgrammeReward ? "EUR" : null,
          liabilityMinorUnitDigits: usesProgrammeReward ? 2 : null,
        },
      }).success,
    ).toBe(true);
  });

  it("rejects missing budgets, invalid reward liability, and duplicate snapshots", () => {
    expect(
      campaignDefinitionV1.safeParse({
        ...definition,
        capacity: { ...definition.capacity, maximumPoints: null },
      }).success,
    ).toBe(false);
    expect(
      campaignDefinitionV1.safeParse({
        ...definition,
        behavior: {
          kind: "limited_quantity",
          reward: {
            kind: "programme_reward",
            rewardId: "87000000-0000-4000-8000-000000000601",
          },
        },
        capacity: {
          ...definition.capacity,
          perMemberEffectLimit: 1,
          maximumPoints: null,
          maximumLiabilityMinor: "5000",
          liabilityMinorPerEffect: "5001",
          liabilityCurrencyCode: "EUR",
          liabilityMinorUnitDigits: 2,
        },
      }).success,
    ).toBe(false);
    expect(
      campaignDefinitionV1.safeParse({
        ...definition,
        behavior: {
          kind: "limited_quantity",
          reward: {
            kind: "programme_reward",
            rewardId: "87000000-0000-4000-8000-000000000601",
          },
        },
        capacity: {
          ...definition.capacity,
          perMemberEffectLimit: 1,
          maximumPoints: null,
        },
      }).success,
    ).toBe(false);
    expect(
      campaignDefinitionV1.safeParse({
        ...definition,
        exclusionSnapshotIds: [definition.audienceSnapshotId],
      }).success,
    ).toBe(false);
  });
});

describe("campaignPreviewV1", () => {
  it("requires treatment and control totals to reconcile", () => {
    const preview = {
      schemaVersion: "1" as const,
      campaignVersionId: "87000000-0000-4000-8000-000000000701",
      definitionSha256: "a".repeat(64),
      inclusionMembers: "100",
      excludedMembers: "10",
      eligibleMembers: "90",
      expectedControlMembers: "9",
      expectedTreatmentMembers: "81",
      maximumEffects: "180",
      maximumPoints: "100000",
      maximumLiabilityMinor: null,
    };
    expect(campaignPreviewV1.parse(preview)).toEqual(preview);
    expect(
      campaignPreviewV1.safeParse({
        ...preview,
        expectedTreatmentMembers: "80",
      }).success,
    ).toBe(false);
  });

  it("accepts an empty preview but rejects inconsistent audience arithmetic", () => {
    const emptyPreview = {
      schemaVersion: "1" as const,
      campaignVersionId: "87000000-0000-4000-8000-000000000701",
      definitionSha256: "a".repeat(64),
      inclusionMembers: "0",
      excludedMembers: "0",
      eligibleMembers: "0",
      expectedControlMembers: "0",
      expectedTreatmentMembers: "0",
      maximumEffects: "0",
      maximumPoints: "100000",
      maximumLiabilityMinor: null,
    };
    expect(campaignPreviewV1.safeParse(emptyPreview).success).toBe(true);
    expect(
      campaignPreviewV1.safeParse({
        ...emptyPreview,
        inclusionMembers: "2",
        excludedMembers: "1",
      }).success,
    ).toBe(false);
  });
});

describe("campaignResultV1", () => {
  const result = {
    schemaVersion: "1" as const,
    programmeId: "87000000-0000-4000-8000-000000000700",
    campaignId: "87000000-0000-4000-8000-000000000701",
    campaignVersionId: "87000000-0000-4000-8000-000000000702",
    campaignCode: "autumn_bonus",
    campaignName: "Autumn bonus",
    versionNumber: 1,
    status: "active" as const,
    startsAt: "2026-08-20T10:00:00Z",
    endsAt: "2026-09-20T10:00:00Z",
    generatedAt: "2026-08-23T10:00:00Z",
    assignments: { eligible: "100", treatment: "90", control: "10" },
    capacity: {
      globalEffectLimit: "1000",
      maximumPoints: "100000",
      maximumLiabilityMinor: null,
      reservedEffects: "2",
      committedEffects: "20",
      reservedPoints: "200",
      committedPoints: "2000",
      reservedLiabilityMinor: "0",
      committedLiabilityMinor: "0",
    },
    purchaseOutcomes: {
      awarded: "18",
      control: "2",
      capacityExhausted: "0",
      suppressed: "1",
      reversedAwards: "1",
    },
    triggerJobs: {
      pending: "1",
      processing: "0",
      retryable: "0",
      completed: "2",
      cancelled: "0",
      manualReview: "0",
    },
    triggerOutcomes: {
      pointsAwarded: "2",
      rewardReserved: "0",
      control: "0",
      capacityExhausted: "0",
      pointsReversed: "0",
      rewardCancellationRequested: "0",
      rewardAlreadyResolved: "0",
      rewardNonreversible: "0",
      noValueToReverse: "0",
    },
    measurement: {
      classification: "influenced" as const,
      incrementalityState: "not_measured" as const,
      explanation:
        "These are directly attributed campaign outcomes, not experimentally measured incremental lift." as const,
    },
  };

  it("accepts exact tenant-safe aggregate outcomes", () => {
    expect(campaignResultV1.parse(result)).toEqual(result);
    expect(CAMPAIGN_METRIC_DICTIONARY_V1).toHaveLength(5);
  });

  it("rejects unreconciled assignments, over-capacity effects, and incrementality claims", () => {
    expect(
      campaignResultV1.safeParse({
        ...result,
        assignments: { ...result.assignments, treatment: "89" },
      }).success,
    ).toBe(false);
    expect(
      campaignResultV1.safeParse({
        ...result,
        capacity: {
          ...result.capacity,
          reservedEffects: "981",
        },
      }).success,
    ).toBe(false);
    expect(
      campaignResultV1.safeParse({
        ...result,
        measurement: {
          ...result.measurement,
          incrementalityState: "measured",
        },
      }).success,
    ).toBe(false);
  });
});

describe("merchantPauseCampaignVersionCommandV1", () => {
  it("rejects multiline operational reasons at the public boundary", () => {
    expect(
      merchantPauseCampaignVersionCommandV1.safeParse({
        schemaVersion: "1",
        campaignVersionId: "87000000-0000-4000-8000-000000000701",
        reason: "Operational\nsafety pause",
        idempotencyKey: "campaign:pause:1",
        correlationId: "87000000-0000-4000-8000-000000000702",
      }).success,
    ).toBe(false);
  });
});

describe("campaign purchase execution evidence", () => {
  const candidate = {
    schemaVersion: "1" as const,
    campaignVersionId: "87000000-0000-4000-8000-000000000801",
    campaignCode: "autumn_bonus",
    assignment: "treatment" as const,
    behavior: {
      kind: "bonus_points" as const,
      earningRuleCodes: ["purchase"],
      reward: { kind: "points" as const, points: "100" },
    },
    remainingGlobalEffects: "10",
    remainingMemberEffects: "1",
    remainingPoints: "1000",
  };

  it("accepts exact bigint candidate capacity without numeric coercion", () => {
    expect(campaignPurchaseCandidateV1.parse(candidate)).toEqual(candidate);
  });

  it("reconciles awarded decisions and the selected multiplier", () => {
    const evaluation = {
      schemaVersion: "1" as const,
      selectedCampaignMultiplierVersionId:
        "87000000-0000-4000-8000-000000000802",
      suppressedProgrammeMultiplierRuleCode: "double_points",
      totalCampaignPoints: "150",
      decisions: [
        {
          campaignVersionId: candidate.campaignVersionId,
          campaignCode: candidate.campaignCode,
          assignment: "treatment" as const,
          effectKind: "bonus_points" as const,
          matchedRuleCodes: ["purchase"],
          priority: null,
          points: "100",
          outcome: "awarded" as const,
        },
        {
          campaignVersionId: "87000000-0000-4000-8000-000000000802",
          campaignCode: "priority_multiplier",
          assignment: "treatment" as const,
          effectKind: "purchase_multiplier" as const,
          matchedRuleCodes: ["purchase"],
          priority: 200,
          points: "50",
          outcome: "awarded" as const,
        },
      ],
    };
    expect(campaignPurchaseEvaluationV1.parse(evaluation)).toEqual(evaluation);
    expect(
      campaignPurchaseEvaluationV1.safeParse({
        ...evaluation,
        totalCampaignPoints: "149",
      }).success,
    ).toBe(false);
    expect(
      campaignPurchaseEvaluationV1.safeParse({
        ...evaluation,
        selectedCampaignMultiplierVersionId: null,
      }).success,
    ).toBe(false);
  });

  it("prohibits value on control or suppressed decisions", () => {
    expect(
      campaignPurchaseEvaluationV1.safeParse({
        schemaVersion: "1",
        selectedCampaignMultiplierVersionId: null,
        suppressedProgrammeMultiplierRuleCode: null,
        totalCampaignPoints: "0",
        decisions: [
          {
            campaignVersionId: candidate.campaignVersionId,
            campaignCode: candidate.campaignCode,
            assignment: "control",
            effectKind: "bonus_points",
            matchedRuleCodes: ["purchase"],
            priority: null,
            points: "100",
            outcome: "control",
          },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("campaign non-purchase trigger evidence", () => {
  const job = {
    schemaVersion: "1" as const,
    jobId: "87000000-0000-4000-8000-000000000901",
    campaignVersionId: "87000000-0000-4000-8000-000000000902",
    triggerKind: "milestone" as const,
    action: "issue" as const,
    sourceReference: "tier-fact:87000000-0000-4000-8000-000000000903",
    occurredAt: "2026-08-23T18:30:00+02:00",
    attemptCount: 1,
  };

  it("accepts one bounded leased canonical trigger", () => {
    expect(campaignTriggerJobV1.parse(job)).toEqual(job);
    expect(
      campaignTriggerJobV1.safeParse({ ...job, attemptCount: 11 }).success,
    ).toBe(false);
    expect(
      campaignTriggerJobV1.safeParse({
        ...job,
        sourceReference: `fact:${"x".repeat(501)}`,
      }).success,
    ).toBe(false);
  });

  it.each([
    {
      outcome: "points_awarded",
      allocationId: "87000000-0000-4000-8000-000000000904",
      transactionId: "87000000-0000-4000-8000-000000000905",
      rewardReservationId: null,
    },
    {
      outcome: "reward_reserved",
      allocationId: "87000000-0000-4000-8000-000000000904",
      transactionId: null,
      rewardReservationId: "87000000-0000-4000-8000-000000000906",
    },
    {
      outcome: "control",
      allocationId: null,
      transactionId: null,
      rewardReservationId: null,
    },
    {
      outcome: "points_reversed",
      allocationId: null,
      transactionId: "87000000-0000-4000-8000-000000000907",
      rewardReservationId: null,
    },
    {
      outcome: "reward_cancellation_requested",
      allocationId: null,
      transactionId: null,
      rewardReservationId: "87000000-0000-4000-8000-000000000906",
    },
  ] as const)("accepts reconciled $outcome evidence", (evidence) => {
    expect(
      campaignTriggerExecutionV1.safeParse({
        schemaVersion: "1",
        jobId: job.jobId,
        campaignVersionId: job.campaignVersionId,
        action: evidence.outcome.includes("revers")
          ? "reverse"
          : evidence.outcome.startsWith("reward_cancellation")
            ? "reverse"
            : "issue",
        ...evidence,
      }).success,
    ).toBe(true);
  });

  it("rejects value outcomes without their exact evidence", () => {
    expect(
      campaignTriggerExecutionV1.safeParse({
        schemaVersion: "1",
        jobId: job.jobId,
        campaignVersionId: job.campaignVersionId,
        action: "issue",
        outcome: "points_awarded",
        allocationId: null,
        transactionId: "87000000-0000-4000-8000-000000000905",
        rewardReservationId: null,
      }).success,
    ).toBe(false);
  });
});
