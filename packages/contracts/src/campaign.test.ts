import { describe, expect, it } from "vitest";
import {
  campaignDefinitionV1,
  campaignPreviewV1,
  campaignScheduleV1,
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
});
