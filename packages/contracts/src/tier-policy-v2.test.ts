import { describe, expect, it } from "vitest";
import {
  merchantSetTierOverrideCommandV1,
  programmeDefinitionV2,
  programmeRewardDefinitionV2,
  tierPolicyV2,
  type ProgrammeDefinitionV2,
  type TierPolicyV2,
} from "./index";

const spendThreshold = (minimum: string) => ({
  operator: "all" as const,
  thresholds: [
    {
      metric: "eligible_spend" as const,
      minimum,
      activityCodes: [],
    },
  ],
});

const policy: TierPolicyV2 = {
  version: "2",
  qualificationPeriod: {
    kind: "calendar_year",
    timeZone: "Europe/Ljubljana",
  },
  downgradeGraceDays: 30,
  levels: [
    {
      tierCode: "rose",
      entry: null,
      retention: null,
      reentry: null,
      benefits: {
        earningMultiplierBasisPoints: 10_000,
        rewardCodes: [],
        earlyAccess: false,
      },
    },
    {
      tierCode: "bloom",
      entry: spendThreshold("15000"),
      retention: {
        operator: "any",
        thresholds: [
          {
            metric: "eligible_spend",
            minimum: "12500",
            activityCodes: [],
          },
          {
            metric: "order_count",
            minimum: "3",
            activityCodes: [],
          },
        ],
      },
      reentry: spendThreshold("10000"),
      benefits: {
        earningMultiplierBasisPoints: 12_000,
        rewardCodes: ["vip-shipping"],
        earlyAccess: true,
      },
    },
  ],
};

const definition: ProgrammeDefinitionV2 = {
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
    {
      code: "bloom",
      name: "Bloom",
      minimumEligibleSpendMinor: "15000",
      pointsPerMajorUnit: "6",
    },
  ],
  tierPolicy: policy,
  rewards: [
    {
      code: "vip-shipping",
      name: "VIP shipping",
      kind: "free_shipping",
      costPoints: "1",
      configuration: {
        version: "2",
        fulfilmentMode: "woocommerce_coupon",
        validityDays: 30,
        availability: {
          startsAt: null,
          endsAt: null,
          tierCodes: ["bloom"],
          segmentCodes: [],
          perCustomerLimit: 1,
          globalQuantity: null,
          pointsBudget: null,
        },
        restrictions: {
          minimumSpendMinor: null,
          productIds: [],
          excludedProductIds: [],
          categoryIds: [],
          excludedCategoryIds: [],
          excludeSaleItems: false,
          stacking: "exclusive",
        },
      },
    },
  ],
  earningRules: [
    {
      code: "purchase-base",
      name: "Base purchase points",
      source: "purchase",
      enabled: true,
      priority: 0,
      stackable: false,
      effect: { kind: "base_rate", pointsPerMajorUnit: "5" },
      conditions: {
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
      },
      purchaseExclusions: {
        productIds: [],
        categoryIds: [],
        shipping: true,
        tax: true,
        fees: true,
        giftCardPayments: true,
        storeCreditPayments: true,
        discounts: true,
      },
      cap: {
        perEventPoints: null,
        perMemberPoints: null,
        memberPeriod: null,
        rollingDays: null,
      },
    },
  ],
};

describe("TierPolicyV2", () => {
  it("accepts only bounded attributed manual tier override commands", () => {
    const command = {
      version: "1",
      customerId: "85000000-0000-4000-8000-000000000112",
      programmeGroupId: "85000000-0000-4000-8000-000000000113",
      programmeVersionId: "85000000-0000-4000-8000-000000000114",
      tierCode: "bloom",
      expiresAt: "2026-09-14T10:00:00Z",
      reason: "Approved service recovery",
      idempotencyKey: "tier:override:85000000-0000-4000-8000-000000000115",
      correlationId: "85000000-0000-4000-8000-000000000116",
    } as const;
    expect(merchantSetTierOverrideCommandV1.parse(command)).toEqual(command);
    expect(() =>
      merchantSetTierOverrideCommandV1.parse({ ...command, reason: "short" }),
    ).toThrow();
  });

  it("accepts calendar qualification with independent threshold expressions", () => {
    expect(tierPolicyV2.parse(policy)).toEqual(policy);
    expect(programmeDefinitionV2.parse(definition).tierPolicy).toEqual(policy);
  });

  it("supports lifetime and bounded rolling periods", () => {
    expect(
      tierPolicyV2.parse({
        ...policy,
        qualificationPeriod: { kind: "lifetime" },
      }).qualificationPeriod,
    ).toEqual({ kind: "lifetime" });
    expect(
      tierPolicyV2.parse({
        ...policy,
        qualificationPeriod: { kind: "rolling_days", days: 365 },
      }).qualificationPeriod,
    ).toEqual({ kind: "rolling_days", days: 365 });
  });

  it("rejects threshold selectors that do not match their metric", () => {
    expect(() =>
      tierPolicyV2.parse({
        ...policy,
        levels: [
          policy.levels[0],
          {
            ...policy.levels[1],
            entry: {
              operator: "all",
              thresholds: [
                {
                  metric: "order_count",
                  minimum: "2",
                  activityCodes: ["verified-review"],
                },
              ],
            },
          },
        ],
      }),
    ).toThrow("Only verified-action thresholds may select activity codes");
  });

  it("requires base and non-base levels to have honest threshold shapes", () => {
    expect(() =>
      tierPolicyV2.parse({
        ...policy,
        levels: [{ ...policy.levels[0], entry: spendThreshold("0") }],
      }),
    ).toThrow("base tier");
    expect(() =>
      tierPolicyV2.parse({
        ...policy,
        levels: [policy.levels[0], { ...policy.levels[1], retention: null }],
      }),
    ).toThrow("requires entry, retention, and re-entry");
  });

  it("requires policy levels and reward benefits to resolve exactly", () => {
    expect(() =>
      programmeDefinitionV2.parse({
        ...definition,
        tierPolicy: {
          ...policy,
          levels: [policy.levels[0]],
        },
      }),
    ).toThrow("must match the ordered programme tiers");
    expect(() =>
      programmeDefinitionV2.parse({
        ...definition,
        tierPolicy: {
          ...policy,
          levels: [
            policy.levels[0],
            {
              ...policy.levels[1],
              benefits: {
                ...policy.levels[1]!.benefits,
                rewardCodes: ["missing-reward"],
              },
            },
          ],
        },
      }),
    ).toThrow("Unknown tier benefit reward code");
    const reward = programmeRewardDefinitionV2.parse(definition.rewards[0]);
    expect(() =>
      programmeDefinitionV2.parse({
        ...definition,
        rewards: [
          {
            ...reward,
            configuration: {
              ...reward.configuration,
              availability: {
                ...reward.configuration.availability,
                tierCodes: ["rose"],
              },
            },
          },
        ],
      }),
    ).toThrow(
      "Tier benefit rewards must use V2 fulfilment and include the tier in availability",
    );
  });

  it("requires displayed tier rates to equal the executable base multiplier", () => {
    expect(programmeDefinitionV2.parse(definition).tiers[1]).toMatchObject({
      pointsPerMajorUnit: "6",
    });
    expect(() =>
      programmeDefinitionV2.parse({
        ...definition,
        tierPolicy: {
          ...policy,
          levels: [
            policy.levels[0],
            {
              ...policy.levels[1],
              benefits: {
                ...policy.levels[1]!.benefits,
                earningMultiplierBasisPoints: 10_000,
              },
            },
          ],
        },
      }),
    ).toThrow("must exactly match the displayed points rate");
  });
});
