import { describe, expect, it } from "vitest";
import {
  buildAudienceDefinition,
  buildCampaignDefinition,
  audienceDraftInputFromDefinition,
  campaignDraftInputFromDefinition,
  type AudienceDraftInput,
  type CampaignDraftInput,
} from "./campaign-builder-model";

const audience: AudienceDraftInput = {
  code: "bloom_winback",
  name: "Bloom win-back",
  description: "Inactive Bloom customers",
  match: "all",
  conditions: [
    {
      kind: "metric",
      metric: "days_since_last_paid_order",
      operator: "at_least",
      minimum: "30",
      maximum: "",
      windowKind: "lifetime",
      rollingDays: "30",
      activityCodes: "",
      tierOperator: "in",
      tierCodes: "",
    },
  ],
};

const campaign: CampaignDraftInput = {
  code: "autumn_bonus",
  name: "Autumn bonus",
  description: "Ten bonus points",
  audienceSnapshotId: "87000000-0000-4000-8000-000000000501",
  exclusionSnapshotIds: [],
  timezone: "Europe/Ljubljana",
  startsLocal: "2026-08-25T10:00",
  endsLocal: "2026-09-25T10:00",
  behaviorKind: "bonus_points",
  earningRuleCodes: "purchase-base",
  points: "10",
  multiplierBasisPoints: "20000",
  priority: "100",
  milestoneMetric: "order_count",
  milestoneThreshold: "5",
  activityCodes: "",
  minimumInactiveDays: "30",
  minimumEligibleSpendMinor: "5000",
  tierMovement: "entry",
  tierCodes: "bloom",
  referralParty: "advocate",
  rewardKind: "points",
  rewardId: "87000000-0000-4000-8000-000000000601",
  globalEffectLimit: "1000",
  perMemberEffectLimit: "1",
  maximumPoints: "10000",
  maximumLiabilityMinor: "500000",
  liabilityMinorPerEffect: "5000",
  liabilityCurrencyCode: "EUR",
  liabilityMinorUnitDigits: "2",
  controlBasisPoints: "1000",
};

describe("campaign builder model", () => {
  it("builds an allowlisted audience without caller SQL", () => {
    expect(buildAudienceDefinition(audience)).toMatchObject({
      code: "bloom_winback",
      conditions: [{ metric: "days_since_last_paid_order", window: null }],
    });
  });

  it("builds schedule evidence and bounded campaign value", () => {
    const definition = buildCampaignDefinition(campaign);
    expect(definition).toMatchObject({
      schedule: {
        startsAt: "2026-08-25T08:00:00.000Z",
        startsLocal: "2026-08-25T10:00:00",
      },
      capacity: { maximumPoints: "10000", maximumLiabilityMinor: null },
    });
    expect(
      definition
        ? buildCampaignDefinition(campaignDraftInputFromDefinition(definition))
        : null,
    ).toEqual(definition);
  });

  it("loads immutable audience definitions into a new editable version", () => {
    const definition = buildAudienceDefinition(audience);
    expect(
      definition
        ? buildAudienceDefinition(audienceDraftInputFromDefinition(definition))
        : null,
    ).toEqual(definition);
  });

  it("requires complete native liability and rejects DST ambiguity", () => {
    expect(
      buildCampaignDefinition({
        ...campaign,
        behaviorKind: "limited_quantity",
        rewardKind: "programme_reward",
        maximumLiabilityMinor: "",
      }),
    ).toBeNull();
    expect(
      buildCampaignDefinition({
        ...campaign,
        startsLocal: "2026-10-25T02:30",
      }),
    ).toBeNull();
  });
});
