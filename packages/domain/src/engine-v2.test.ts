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
  taxMinor: "100",
  feeMinor: "75",
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
          capApplied: "none",
        },
        {
          ruleCode: "vip-double",
          effectKind: "multiplier",
          uncappedPoints: "45",
          awardedPoints: "45",
          capApplied: "none",
        },
        {
          ruleCode: "order-bonus",
          effectKind: "fixed_bonus",
          uncappedPoints: "25",
          awardedPoints: "25",
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
      ],
    });
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
