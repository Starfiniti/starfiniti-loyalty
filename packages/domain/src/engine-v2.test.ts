import type {
  EarningRuleV2,
  ProgrammeDefinitionV2,
} from "@starfiniti/contracts/programme-v2";
import { describe, expect, it } from "vitest";
import {
  evaluateEarningV2,
  inspectEarningRuleConflictsV2,
  simulateEarningV2,
  type ActivityEarningFactV2,
  type PurchaseEarningFactV2,
} from "./index";

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
  categoryIds: ["clearance"],
  shipping: true,
  tax: false,
  fees: true,
  giftCardPayments: true,
  storeCreditPayments: true as const,
  discounts: true,
};

const uncapped = {
  perEventPoints: null,
  perMemberPoints: null,
  memberPeriod: null,
  rollingDays: null,
};

const baseRule: EarningRuleV2 = {
  code: "purchase-base",
  name: "Base purchase points",
  source: "purchase",
  enabled: true,
  priority: 0,
  stackable: false,
  effect: { kind: "base_rate", pointsPerMajorUnit: "5" },
  conditions,
  purchaseExclusions: exclusions,
  cap: uncapped,
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
    baseRule,
    {
      code: "vip-double",
      name: "VIP double points",
      source: "purchase",
      enabled: true,
      priority: 50,
      stackable: false,
      effect: { kind: "multiplier", multiplierBasisPoints: 20_000 },
      conditions: {
        ...conditions,
        categoryIds: ["skincare"],
        tierCodes: ["rose"],
      },
      purchaseExclusions: exclusions,
      cap: uncapped,
    },
    {
      code: "august-triple",
      name: "August triple points",
      source: "purchase",
      enabled: true,
      priority: 40,
      stackable: false,
      effect: { kind: "multiplier", multiplierBasisPoints: 30_000 },
      conditions: { ...conditions, categoryIds: ["skincare"] },
      purchaseExclusions: exclusions,
      cap: uncapped,
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
      cap: uncapped,
    },
    {
      code: "birthday",
      name: "Birthday points",
      source: "birthday",
      enabled: true,
      priority: 10,
      stackable: true,
      effect: { kind: "fixed_bonus", points: "500" },
      conditions,
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

const purchase: PurchaseEarningFactV2 = {
  source: "purchase",
  eventId: "wc:order:42:completed",
  occurredAt: "2026-08-13T10:00:00Z",
  channel: "woocommerce",
  segmentCodes: ["member"],
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
      discountMinor: "100",
      refundedMinor: "0",
      paymentKind: "money",
    },
    {
      lineId: "2",
      productId: "old-stock",
      categoryIds: ["clearance"],
      grossMinor: "2000",
      discountMinor: "0",
      refundedMinor: "0",
      paymentKind: "money",
    },
    {
      lineId: "3",
      productId: "cleanser",
      categoryIds: ["skincare"],
      grossMinor: "500",
      discountMinor: "0",
      refundedMinor: "0",
      paymentKind: "gift-card",
    },
  ],
  shippingMinor: "499",
  shippingRefundedMinor: "0",
  taxMinor: "100",
  taxRefundedMinor: "0",
  feeMinor: "75",
  feeRefundedMinor: "0",
};

describe("ProgrammeDefinitionV2 earning engine", () => {
  it("applies exclusions, one highest-priority multiplier, bonuses, and one final rounding", () => {
    const result = evaluateEarningV2(programme, purchase);
    expect(result).toEqual({
      version: "2",
      eventId: "wc:order:42:completed",
      source: "purchase",
      eligibleSpendMinor: "1000",
      awardedPoints: "120",
      tierCodeSnapshot: "rose",
      pendingAt: "2026-08-13T10:00:00.000Z",
      availableAt: "2026-09-12T10:00:00.000Z",
      expiresAt: "2027-09-12T10:00:00.000Z",
      selectedMultiplierRuleCode: "vip-double",
      contributions: [
        {
          ruleCode: "purchase-base",
          effectKind: "base_rate",
          uncappedPoints: "50",
          awardedPoints: "50",
          uncappedNumerator: "50000000",
          awardedNumerator: "50000000",
          denominator: "1000000",
          capApplied: "none",
        },
        {
          ruleCode: "vip-double",
          effectKind: "multiplier",
          uncappedPoints: "45",
          awardedPoints: "45",
          uncappedNumerator: "45000000",
          awardedNumerator: "45000000",
          denominator: "1000000",
          capApplied: "none",
        },
        {
          ruleCode: "order-bonus",
          effectKind: "fixed_bonus",
          uncappedPoints: "25",
          awardedPoints: "25",
          uncappedNumerator: "25000000",
          awardedNumerator: "25000000",
          denominator: "1000000",
          capApplied: "none",
        },
      ],
      lines: [
        {
          lineId: "1",
          eligibleSpendMinor: "900",
          outcome: "included",
          reason: "base_rule_eligible",
        },
        {
          lineId: "2",
          eligibleSpendMinor: "0",
          outcome: "excluded",
          reason: "category_excluded",
        },
        {
          lineId: "3",
          eligibleSpendMinor: "0",
          outcome: "excluded",
          reason: "gift_card_payment_excluded",
        },
        {
          lineId: "component:shipping",
          eligibleSpendMinor: "0",
          outcome: "excluded",
          reason: "shipping_excluded",
        },
        {
          lineId: "component:tax",
          eligibleSpendMinor: "100",
          outcome: "included",
          reason: "component_eligible",
        },
        {
          lineId: "component:fee",
          eligibleSpendMinor: "0",
          outcome: "excluded",
          reason: "fees_excluded",
        },
      ],
    });
  });

  it("applies the effective tier multiplier to purchase value before one campaign multiplier", () => {
    const tierProgramme: ProgrammeDefinitionV2 = {
      ...programme,
      tierPolicy: {
        version: "2",
        qualificationPeriod: { kind: "lifetime" },
        downgradeGraceDays: 30,
        levels: [
          {
            tierCode: "rose",
            entry: null,
            retention: null,
            reentry: null,
            benefits: {
              earningMultiplierBasisPoints: 15_000,
              rewardCodes: [],
              earlyAccess: false,
            },
          },
        ],
      },
    };
    const result = evaluateEarningV2(tierProgramme, purchase);
    expect(result).toMatchObject({
      awardedPoints: "167",
      selectedMultiplierRuleCode: "vip-double",
    });
    expect(result.contributions).toMatchObject([
      { ruleCode: "purchase-base", awardedPoints: "75" },
      { ruleCode: "vip-double", awardedPoints: "67" },
      { ruleCode: "order-bonus", awardedPoints: "25" },
    ]);
  });

  it("produces identical live and simulation evidence independent of rule and line order", () => {
    const expected = evaluateEarningV2(programme, purchase);
    expect(simulateEarningV2(programme, purchase)).toEqual(expected);
    expect(
      evaluateEarningV2(
        { ...programme, earningRules: [...programme.earningRules].reverse() },
        { ...purchase, lines: [...purchase.lines].reverse() },
      ),
    ).toEqual(expected);
  });

  it("allocates a shared fractional point deterministically without losing value", () => {
    const fractionalProgramme = {
      ...programme,
      earningRules: [
        {
          ...baseRule,
          effect: { kind: "base_rate" as const, pointsPerMajorUnit: "1" },
        },
        programme.earningRules.find((rule) => rule.code === "vip-double")!,
      ],
    } satisfies ProgrammeDefinitionV2;
    const fractionalPurchase = {
      ...purchase,
      lines: [
        {
          lineId: "fractional-line",
          productId: "serum",
          categoryIds: ["skincare"],
          grossMinor: "50",
          discountMinor: "0",
          refundedMinor: "0",
          paymentKind: "money" as const,
        },
      ],
      shippingMinor: "0",
      shippingRefundedMinor: "0",
      taxMinor: "0",
      taxRefundedMinor: "0",
      feeMinor: "0",
      feeRefundedMinor: "0",
    };

    const result = evaluateEarningV2(fractionalProgramme, fractionalPurchase);

    expect(result.awardedPoints).toBe("1");
    expect(
      result.contributions.map(({ ruleCode, awardedPoints }) => ({
        ruleCode,
        awardedPoints,
      })),
    ).toEqual([
      { ruleCode: "purchase-base", awardedPoints: "1" },
      { ruleCode: "vip-double", awardedPoints: "0" },
    ]);
    expect(
      result.contributions.reduce(
        (total, contribution) => total + BigInt(contribution.awardedPoints),
        0n,
      ),
    ).toBe(BigInt(result.awardedPoints));
  });

  it("subtracts cumulative shipping, tax, and fee refunds when those components earn", () => {
    const componentProgramme = {
      ...programme,
      earningRules: [
        {
          ...baseRule,
          purchaseExclusions: {
            ...exclusions,
            productIds: [],
            categoryIds: [],
            shipping: false,
            tax: false,
            fees: false,
          },
        },
      ],
    } satisfies ProgrammeDefinitionV2;
    const componentFact = {
      ...purchase,
      lines: [],
      shippingMinor: "499",
      shippingRefundedMinor: "99",
      taxMinor: "100",
      taxRefundedMinor: "25",
      feeMinor: "75",
      feeRefundedMinor: "75",
    };

    const result = evaluateEarningV2(componentProgramme, componentFact);

    expect(result.eligibleSpendMinor).toBe("475");
    expect(result.awardedPoints).toBe("23");
    expect(result.lines).toEqual([
      {
        lineId: "component:shipping",
        eligibleSpendMinor: "400",
        outcome: "included",
        reason: "component_eligible",
      },
      {
        lineId: "component:tax",
        eligibleSpendMinor: "75",
        outcome: "included",
        reason: "component_eligible",
      },
      {
        lineId: "component:fee",
        eligibleSpendMinor: "0",
        outcome: "included",
        reason: "component_eligible",
      },
    ]);
  });

  it("applies per-event and remaining per-member caps without negative awards", () => {
    const cappedProgramme = {
      ...programme,
      earningRules: programme.earningRules.map((rule) =>
        rule.code === "purchase-base"
          ? { ...rule, cap: { ...uncapped, perEventPoints: "40" } }
          : rule,
      ),
    } satisfies ProgrammeDefinitionV2;
    const purchaseResult = evaluateEarningV2(cappedProgramme, purchase);
    expect(purchaseResult.awardedPoints).toBe("110");
    expect(purchaseResult.contributions[0]).toMatchObject({
      ruleCode: "purchase-base",
      awardedPoints: "40",
      capApplied: "per_event",
    });

    const birthday: ActivityEarningFactV2 = {
      source: "birthday",
      eventId: "birthday:customer:7:2026",
      occurredAt: "2026-08-13T10:00:00Z",
      channel: "system",
      segmentCodes: ["member"],
      tierCode: "rose",
      memberRuleUsage: { birthday: "450" },
      verified: true,
      activityReference: "customer:7:2026",
      activityCode: "birthday",
      productId: null,
      categoryIds: [],
    };
    expect(evaluateEarningV2(programme, birthday)).toMatchObject({
      awardedPoints: "50",
      contributions: [
        expect.objectContaining({
          ruleCode: "birthday",
          awardedPoints: "50",
          capApplied: "per_member",
        }),
      ],
    });
    expect(
      evaluateEarningV2(programme, {
        ...birthday,
        memberRuleUsage: { birthday: "999" },
      }).awardedPoints,
    ).toBe("0");
  });

  it("rejects unverified activity facts and malformed or duplicated commerce facts", () => {
    expect(() =>
      evaluateEarningV2(programme, {
        source: "custom_activity",
        eventId: "custom:1",
        occurredAt: "2026-08-13T10:00:00Z",
        channel: "merchant-api",
        segmentCodes: [],
        tierCode: "rose",
        memberRuleUsage: {},
        verified: false,
        activityReference: "event:1",
        activityCode: "review_shared",
        productId: null,
        categoryIds: [],
      }),
    ).toThrow("authoritative source");
    expect(() =>
      evaluateEarningV2(programme, {
        ...purchase,
        lines: [purchase.lines[0]!, purchase.lines[0]!],
      }),
    ).toThrow("Duplicate line ID");
    expect(() =>
      evaluateEarningV2(programme, {
        ...purchase,
        lines: [{ ...purchase.lines[0]!, refundedMinor: "1001" }],
      }),
    ).toThrow("exceed gross value");
  });

  it("matches verified reviews by product and custom activities by signed code", () => {
    const activityProgramme = {
      ...programme,
      earningRules: [
        ...programme.earningRules,
        {
          code: "verified-serum-review",
          name: "Verified serum review",
          source: "verified_product_review",
          enabled: true,
          priority: 20,
          stackable: true,
          effect: { kind: "fixed_bonus", points: "75" },
          conditions: {
            ...conditions,
            productIds: ["serum"],
            categoryIds: ["skincare"],
          },
          purchaseExclusions: null,
          cap: uncapped,
        },
        {
          code: "in-store-consultation",
          name: "In-store consultation",
          source: "custom_activity",
          enabled: true,
          priority: 20,
          stackable: true,
          effect: { kind: "fixed_bonus", points: "25" },
          conditions: { ...conditions, activityCodes: ["consultation"] },
          purchaseExclusions: null,
          cap: uncapped,
        },
      ],
    } satisfies ProgrammeDefinitionV2;
    const review: ActivityEarningFactV2 = {
      source: "verified_product_review",
      eventId: "review:101",
      occurredAt: "2026-08-13T10:00:00Z",
      channel: "woocommerce",
      segmentCodes: [],
      tierCode: "rose",
      memberRuleUsage: {},
      verified: true,
      activityReference: "review:101",
      activityCode: "verified_product_review",
      productId: "serum",
      categoryIds: ["skincare"],
    };
    expect(evaluateEarningV2(activityProgramme, review).awardedPoints).toBe(
      "75",
    );
    expect(
      evaluateEarningV2(activityProgramme, {
        ...review,
        productId: "cleanser",
      }).awardedPoints,
    ).toBe("0");

    const consultation: ActivityEarningFactV2 = {
      ...review,
      source: "custom_activity",
      eventId: "activity:202",
      channel: "merchant-api",
      activityReference: "activity:202",
      activityCode: "consultation",
      productId: null,
      categoryIds: [],
    };
    expect(
      evaluateEarningV2(activityProgramme, consultation).awardedPoints,
    ).toBe("25");
    expect(
      evaluateEarningV2(activityProgramme, {
        ...consultation,
        activityCode: "newsletter_signup",
      }).awardedPoints,
    ).toBe("0");
  });

  it("uses exact bigint arithmetic beyond the JavaScript safe-integer range", () => {
    const huge = evaluateEarningV2(
      { ...programme, earningRules: [baseRule] },
      {
        ...purchase,
        lines: [
          {
            ...purchase.lines[0]!,
            grossMinor: "900719925474099300",
            discountMinor: "0",
          },
        ],
        taxMinor: "0",
      },
    );
    expect(huge.eligibleSpendMinor).toBe("900719925474099300");
    expect(huge.awardedPoints).toBe("45035996273704965");
  });

  it("warns when equal-priority multipliers overlap and resolves other ties by rule code", () => {
    const overlapping = {
      ...programme.earningRules[1]!,
      code: "another-vip-double",
    };
    expect(
      inspectEarningRuleConflictsV2([
        ...programme.earningRules,
        overlapping,
        baseRule,
      ]),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "duplicate_rule_code" }),
        expect.objectContaining({
          code: "equal_priority_multiplier_overlap",
          ruleCodes: ["another-vip-double", "vip-double"],
        }),
      ]),
    );
  });
});
