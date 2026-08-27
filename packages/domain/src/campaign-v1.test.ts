import type { CampaignPurchaseCandidateV1 } from "@starfiniti/contracts/campaign";
import type { ProgrammeDefinitionV2 } from "@starfiniti/contracts/programme-v2";
import { describe, expect, it } from "vitest";
import type { PurchaseEarningFactV2 } from "./engine-v2";
import { evaluatePurchaseCampaignsV1 } from "./campaign-v1";

const conditions = {
  productIds: [],
  categoryIds: [],
  currencyCodes: [],
  markets: [],
  channels: [],
  activityCodes: [],
  segmentCodes: [],
  tierCodes: [],
  startsAt: null,
  endsAt: null,
};
const exclusions = {
  productIds: [],
  categoryIds: [],
  shipping: true,
  tax: true,
  fees: true,
  giftCardPayments: true,
  storeCreditPayments: true as const,
  discounts: true,
};
const cap = {
  perEventPoints: null,
  perMemberPoints: null,
  memberPeriod: null,
  rollingDays: null,
};
const programme: ProgrammeDefinitionV2 = {
  version: "2",
  currencyCode: "EUR",
  currencyMinorUnitDigits: 2,
  pendingDays: 30,
  pointsExpireAfterDays: 365,
  tiers: [
    {
      code: "rose",
      name: "Rose",
      minimumEligibleSpendMinor: "0",
      pointsPerMajorUnit: "5",
    },
  ],
  rewards: [],
  earningRules: [
    {
      code: "purchase-base",
      name: "Base purchase points",
      source: "purchase",
      enabled: true,
      priority: 0,
      stackable: false,
      effect: { kind: "base_rate", pointsPerMajorUnit: "5" },
      conditions,
      purchaseExclusions: exclusions,
      cap,
    },
    {
      code: "programme-double",
      name: "Programme double points",
      source: "purchase",
      enabled: true,
      priority: 50,
      stackable: false,
      effect: { kind: "multiplier", multiplierBasisPoints: 20_000 },
      conditions,
      purchaseExclusions: exclusions,
      cap,
    },
    {
      code: "order-bonus",
      name: "Order bonus",
      source: "purchase",
      enabled: true,
      priority: 10,
      stackable: true,
      effect: { kind: "fixed_bonus", points: "25" },
      conditions,
      purchaseExclusions: exclusions,
      cap,
    },
  ],
};
const fact: PurchaseEarningFactV2 = {
  source: "purchase",
  eventId: "woocommerce:order:42",
  occurredAt: "2026-08-14T10:00:00Z",
  channel: "woocommerce",
  segmentCodes: [],
  tierCode: "rose",
  memberRuleUsage: {},
  currencyCode: "EUR",
  market: "SI",
  lines: [
    {
      lineId: "1",
      productId: "serum",
      categoryIds: ["skincare"],
      grossMinor: "1000",
      discountMinor: "0",
      refundedMinor: "0",
      paymentKind: "money",
    },
  ],
  shippingMinor: "0",
  shippingRefundedMinor: "0",
  taxMinor: "0",
  taxRefundedMinor: "0",
  feeMinor: "0",
  feeRefundedMinor: "0",
};

function candidate(
  overrides: Partial<CampaignPurchaseCandidateV1> &
    Pick<CampaignPurchaseCandidateV1, "campaignVersionId" | "campaignCode">,
): CampaignPurchaseCandidateV1 {
  return {
    schemaVersion: "1",
    assignment: "treatment",
    behavior: {
      kind: "bonus_points",
      earningRuleCodes: ["purchase-base"],
      reward: { kind: "points", points: "10" },
    },
    remainingGlobalEffects: "10",
    remainingMemberEffects: "2",
    remainingPoints: "1000",
    ...overrides,
  };
}

describe("evaluatePurchaseCampaignsV1", () => {
  it("stacks fixed bonuses and replaces a lower-priority programme multiplier", () => {
    const result = evaluatePurchaseCampaignsV1(programme, fact, [
      candidate({
        campaignVersionId: "8b000000-0000-4000-8000-000000000001",
        campaignCode: "priority_multiplier",
        behavior: {
          kind: "purchase_multiplier",
          earningRuleCodes: ["purchase-base"],
          multiplierBasisPoints: 30_000,
          priority: 100,
        },
      }),
      candidate({
        campaignVersionId: "8b000000-0000-4000-8000-000000000002",
        campaignCode: "stacked_bonus",
      }),
    ]);

    expect(result.baselineProgrammeEvaluation.awardedPoints).toBe("125");
    expect(result.programmeEvaluation.awardedPoints).toBe("75");
    expect(result.programmeEvaluation.selectedMultiplierRuleCode).toBeNull();
    expect(result.campaignEvaluation).toMatchObject({
      selectedCampaignMultiplierVersionId:
        "8b000000-0000-4000-8000-000000000001",
      suppressedProgrammeMultiplierRuleCode: "programme-double",
      totalCampaignPoints: "110",
    });
    expect(
      result.campaignEvaluation.decisions.map((decision) => ({
        code: decision.campaignCode,
        outcome: decision.outcome,
        points: decision.points,
      })),
    ).toEqual([
      { code: "priority_multiplier", outcome: "awarded", points: "100" },
      { code: "stacked_bonus", outcome: "awarded", points: "10" },
    ]);
  });

  it("records control and exhausted decisions without moving value", () => {
    const result = evaluatePurchaseCampaignsV1(programme, fact, [
      candidate({
        campaignVersionId: "8b000000-0000-4000-8000-000000000003",
        campaignCode: "control_bonus",
        assignment: "control",
      }),
      candidate({
        campaignVersionId: "8b000000-0000-4000-8000-000000000004",
        campaignCode: "empty_bonus",
        remainingPoints: "9",
      }),
    ]);
    expect(result.programmeEvaluation).toEqual(
      result.baselineProgrammeEvaluation,
    );
    expect(result.campaignEvaluation.totalCampaignPoints).toBe("0");
    expect(
      result.campaignEvaluation.decisions.map((decision) => decision.outcome),
    ).toEqual(["control", "capacity_exhausted"]);
  });

  it("uses priority then stable namespace identity for one multiplier", () => {
    const campaign = candidate({
      campaignVersionId: "8b000000-0000-4000-8000-000000000005",
      campaignCode: "equal_priority",
      behavior: {
        kind: "purchase_multiplier",
        earningRuleCodes: ["purchase-base"],
        multiplierBasisPoints: 15_000,
        priority: 50,
      },
    });
    const tied = evaluatePurchaseCampaignsV1(programme, fact, [campaign]);
    expect(tied.campaignEvaluation.decisions[0]?.outcome).toBe("awarded");
    expect(tied.campaignEvaluation.totalCampaignPoints).toBe("25");

    if (campaign.behavior.kind !== "purchase_multiplier") {
      throw new TypeError("Test campaign must be a multiplier");
    }
    const lower = evaluatePurchaseCampaignsV1(programme, fact, [
      {
        ...campaign,
        behavior: { ...campaign.behavior, priority: 49 },
      },
    ]);
    expect(lower.campaignEvaluation.decisions[0]?.outcome).toBe("suppressed");
    expect(lower.campaignEvaluation.totalCampaignPoints).toBe("0");
    expect(lower.programmeEvaluation.selectedMultiplierRuleCode).toBe(
      "programme-double",
    );
  });

  it("rejects duplicate campaign identities before evaluation", () => {
    const duplicate = candidate({
      campaignVersionId: "8b000000-0000-4000-8000-000000000006",
      campaignCode: "duplicate",
    });
    expect(() =>
      evaluatePurchaseCampaignsV1(programme, fact, [duplicate, duplicate]),
    ).toThrow("unique version identities");
  });
});
