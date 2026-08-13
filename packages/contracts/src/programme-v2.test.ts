import { describe, expect, it } from "vitest";
import { programmeDefinitionV2, type ProgrammeDefinitionV2 } from "./index";

const explicitPurchaseExclusions = {
  productIds: [],
  categoryIds: [],
  shipping: true,
  tax: true,
  fees: true,
  giftCardPayments: true,
  storeCreditPayments: true as const,
  discounts: true,
};

const noConditions = {
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

const noMemberCap = {
  perEventPoints: null,
  perMemberPoints: null,
  memberPeriod: null,
  rollingDays: null,
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
      conditions: noConditions,
      purchaseExclusions: explicitPurchaseExclusions,
      cap: { ...noMemberCap, perEventPoints: "10000" },
    },
    {
      code: "vip-weekend",
      name: "VIP weekend multiplier",
      source: "purchase",
      enabled: true,
      priority: 50,
      stackable: false,
      effect: { kind: "multiplier", multiplierBasisPoints: 20_000 },
      conditions: {
        ...noConditions,
        channels: ["woocommerce"],
        tierCodes: ["bloom"],
        startsAt: "2026-08-14T00:00:00Z",
        endsAt: "2026-08-17T00:00:00Z",
      },
      purchaseExclusions: explicitPurchaseExclusions,
      cap: noMemberCap,
    },
    {
      code: "birthday-2026",
      name: "Birthday points",
      source: "birthday",
      enabled: true,
      priority: 10,
      stackable: true,
      effect: { kind: "fixed_bonus", points: "500" },
      conditions: noConditions,
      purchaseExclusions: null,
      cap: {
        perEventPoints: "500",
        perMemberPoints: "500",
        memberPeriod: "calendar_year",
        rollingDays: null,
      },
    },
  ],
};

describe("ProgrammeDefinitionV2", () => {
  it("accepts explicit purchase precedence and non-purchase member caps", () => {
    expect(programmeDefinitionV2.parse(definition)).toEqual(definition);
  });

  it("requires exactly one enabled purchase base rate", () => {
    expect(() =>
      programmeDefinitionV2.parse({
        ...definition,
        earningRules: definition.earningRules.filter(
          (rule) => rule.effect.kind !== "base_rate",
        ),
      }),
    ).toThrow("Exactly one enabled purchase base-rate rule");
    expect(() =>
      programmeDefinitionV2.parse({
        ...definition,
        earningRules: [
          ...definition.earningRules,
          { ...definition.earningRules[0]!, code: "another-base" },
        ],
      }),
    ).toThrow("Exactly one enabled purchase base-rate rule");
  });

  it("rejects ambiguous stacking and invalid source/effect combinations", () => {
    expect(() =>
      programmeDefinitionV2.parse({
        ...definition,
        earningRules: [
          {
            ...definition.earningRules[0]!,
            stackable: true,
          },
        ],
      }),
    ).toThrow("base rate cannot be stackable");
    expect(() =>
      programmeDefinitionV2.parse({
        ...definition,
        earningRules: [
          definition.earningRules[0]!,
          {
            ...definition.earningRules[1]!,
            source: "birthday",
            purchaseExclusions: null,
          },
        ],
      }),
    ).toThrow("Multipliers must use the purchase source");
    expect(() =>
      programmeDefinitionV2.parse({
        ...definition,
        earningRules: [
          definition.earningRules[0]!,
          {
            ...definition.earningRules[2]!,
            stackable: false,
          },
        ],
      }),
    ).toThrow("explicitly opt in to stacking");
  });

  it("requires explicit purchase exclusions and prohibits them elsewhere", () => {
    expect(() =>
      programmeDefinitionV2.parse({
        ...definition,
        earningRules: [
          { ...definition.earningRules[0]!, purchaseExclusions: null },
        ],
      }),
    ).toThrow("explicit exclusion policy");
    expect(() =>
      programmeDefinitionV2.parse({
        ...definition,
        earningRules: [
          definition.earningRules[0]!,
          {
            ...definition.earningRules[2]!,
            purchaseExclusions: explicitPurchaseExclusions,
          },
        ],
      }),
    ).toThrow("Only purchase rules");
  });

  it("rejects malformed member windows, commerce conditions on activities, and invalid dates", () => {
    expect(() =>
      programmeDefinitionV2.parse({
        ...definition,
        earningRules: [
          definition.earningRules[0]!,
          {
            ...definition.earningRules[2]!,
            cap: { ...noMemberCap, perMemberPoints: "500" },
          },
        ],
      }),
    ).toThrow("configured together");
    expect(() =>
      programmeDefinitionV2.parse({
        ...definition,
        earningRules: [
          definition.earningRules[0]!,
          {
            ...definition.earningRules[2]!,
            conditions: { ...noConditions, productIds: ["42"] },
          },
        ],
      }),
    ).toThrow("commerce-line conditions");
    expect(() =>
      programmeDefinitionV2.parse({
        ...definition,
        earningRules: [
          {
            ...definition.earningRules[0]!,
            conditions: {
              ...noConditions,
              startsAt: "2026-09-01T00:00:00Z",
              endsAt: "2026-08-01T00:00:00Z",
            },
          },
        ],
      }),
    ).toThrow("Rule end must follow rule start");
  });

  it("allows review product selectors and reserves activity codes for custom facts", () => {
    expect(() =>
      programmeDefinitionV2.parse({
        ...definition,
        earningRules: [
          ...definition.earningRules,
          {
            ...definition.earningRules[2]!,
            code: "verified-serum-review",
            source: "verified_product_review",
            conditions: {
              ...noConditions,
              productIds: ["serum"],
              categoryIds: ["skincare"],
            },
          },
        ],
      }),
    ).not.toThrow();
    expect(() =>
      programmeDefinitionV2.parse({
        ...definition,
        earningRules: [
          ...definition.earningRules,
          {
            ...definition.earningRules[2]!,
            conditions: { ...noConditions, activityCodes: ["birthday"] },
          },
        ],
      }),
    ).toThrow("Only custom activity rules may select activity codes");
    expect(() =>
      programmeDefinitionV2.parse({
        ...definition,
        earningRules: [
          ...definition.earningRules,
          {
            ...definition.earningRules[2]!,
            code: "signed-consultation",
            source: "custom_activity",
            conditions: { ...noConditions, activityCodes: ["consultation"] },
          },
        ],
      }),
    ).not.toThrow();
  });

  it("retains V1 tier and reward validation on the compatible surface", () => {
    expect(() =>
      programmeDefinitionV2.parse({
        ...definition,
        tiers: [
          definition.tiers[0]!,
          { ...definition.tiers[0]!, name: "Duplicate" },
        ],
      }),
    ).toThrow("Duplicate tier code");
    expect(() =>
      programmeDefinitionV2.parse({
        ...definition,
        rewards: [
          {
            code: "ten-off",
            name: "Ten off",
            kind: "fixed_discount",
            costPoints: "1000",
            configuration: { amountMinor: "1000" },
          },
        ],
      }),
    ).toThrow("Currency precision");
  });

  it("rejects earning amounts that cannot be represented by PostgreSQL", () => {
    expect(() =>
      programmeDefinitionV2.parse({
        ...definition,
        earningRules: definition.earningRules.map((rule) =>
          rule.code === "purchase-base"
            ? {
                ...rule,
                effect: {
                  kind: "base_rate" as const,
                  pointsPerMajorUnit: "9223372036854775808",
                },
              }
            : rule,
        ),
      }),
    ).toThrow("PostgreSQL bigint capacity");
  });
});
