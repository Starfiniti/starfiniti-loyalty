import { describe, expect, it } from "vitest";
import {
  evaluateOrderAward,
  evaluateTierQualification,
  minorUnit,
  points,
  quoteReward,
  simulateOrderAward,
  tierCode,
  validateAwardRules,
  type AwardRule,
  type OrderAwardFact,
} from "./index";
import { rosyRewardsV1 } from "./rosy-rewards";

const rules: readonly AwardRule[] = [
  {
    id: "exclude-clearance",
    priority: 100,
    kind: "exclude",
    condition: { categoryIds: ["clearance"] },
    reason: "Clearance products do not earn points",
  },
  {
    id: "double-skincare-slovenia",
    priority: 50,
    kind: "rate",
    condition: {
      categoryIds: ["skincare"],
      currencyCodes: ["EUR"],
      markets: ["SI"],
      channels: ["woocommerce"],
      customerSegments: ["vip"],
      startsAt: "2026-08-01T00:00:00Z",
      endsAt: "2026-09-01T00:00:00Z",
    },
    pointsPerMajorUnit: points(10),
    reason: "August VIP skincare accelerator",
  },
  {
    id: "triple-summer-collection",
    priority: 40,
    kind: "rate",
    condition: { collectionIds: ["summer"] },
    pointsPerMajorUnit: points(15),
    reason: "Summer collection accelerator",
  },
];

const order: OrderAwardFact = {
  orderId: "wc:42",
  currencyCode: "EUR",
  market: "SI",
  channel: "woocommerce",
  customerSegments: ["vip"],
  occurredAt: "2026-08-12T10:00:00Z",
  tierCodeSnapshot: tierCode("rose"),
  lines: [
    {
      lineId: "1",
      productId: "serum",
      categoryIds: ["skincare"],
      grossMinor: minorUnit(10_00),
      discountMinor: minorUnit(1_00),
      refundedMinor: minorUnit(0),
      paymentKind: "money",
    },
    {
      lineId: "2",
      productId: "old-stock",
      categoryIds: ["clearance"],
      grossMinor: minorUnit(20_00),
      discountMinor: minorUnit(0),
      refundedMinor: minorUnit(0),
      paymentKind: "money",
    },
    {
      lineId: "3",
      productId: "cleanser",
      categoryIds: ["skincare"],
      grossMinor: minorUnit(5_00),
      discountMinor: minorUnit(0),
      refundedMinor: minorUnit(1_00),
      paymentKind: "gift-card",
    },
    {
      lineId: "4",
      productId: "bag",
      categoryIds: ["accessories"],
      collectionIds: ["summer"],
      grossMinor: minorUnit(12_34),
      discountMinor: minorUnit(0),
      refundedMinor: minorUnit(0),
      paymentKind: "money",
    },
    {
      lineId: "5",
      lineKind: "shipping",
      productId: "shipping",
      categoryIds: [],
      grossMinor: minorUnit(4_99),
      discountMinor: minorUnit(0),
      refundedMinor: minorUnit(0),
      paymentKind: "money",
    },
  ],
};

describe("programme order engine", () => {
  it("applies exclusions and conditional rates with one final rounding step", () => {
    const result = evaluateOrderAward(rosyRewardsV1, rules, order);
    expect(result).toMatchObject({
      programmeVersionId: "rosy-rewards:v1",
      orderId: "wc:42",
      tierCodeSnapshot: "rose",
      eligibleSpendMinor: 2134,
      awardedPoints: 275,
      pendingAt: "2026-08-12T10:00:00.000Z",
      availableAt: "2026-09-11T10:00:00.000Z",
      expiresAt: "2027-09-11T10:00:00.000Z",
    });
    expect(result.explanation).toEqual([
      expect.objectContaining({
        lineId: "1",
        appliedRuleId: "double-skincare-slovenia",
        eligibleSpendMinor: 900,
      }),
      expect.objectContaining({
        lineId: "2",
        appliedRuleId: "exclude-clearance",
        outcome: "excluded",
      }),
      expect.objectContaining({
        lineId: "3",
        appliedRuleId: "payment:gift-card",
        outcome: "excluded",
      }),
      expect.objectContaining({
        lineId: "4",
        appliedRuleId: "triple-summer-collection",
        eligibleSpendMinor: 1234,
      }),
      expect.objectContaining({
        lineId: "5",
        appliedRuleId: "component:shipping",
        outcome: "excluded",
      }),
    ]);
  });

  it("produces byte-for-byte equivalent live and simulation results", () => {
    expect(simulateOrderAward(rosyRewardsV1, rules, order)).toEqual(
      evaluateOrderAward(rosyRewardsV1, rules, order),
    );
  });

  it("uses half-open rule windows and falls back to the tier snapshot", () => {
    const atEnd = evaluateOrderAward(rosyRewardsV1, rules, {
      ...order,
      occurredAt: "2026-09-01T00:00:00Z",
      lines: [order.lines[0]!],
    });
    expect(atEnd.awardedPoints).toBe(45);
    expect(atEnd.explanation[0]?.appliedRuleId).toBe("tier:rose");
  });

  it("rejects currency drift, duplicated lines, and impossible net values", () => {
    expect(() =>
      evaluateOrderAward(rosyRewardsV1, rules, {
        ...order,
        currencyCode: "USD",
      }),
    ).toThrow("currency must be EUR");
    expect(() =>
      evaluateOrderAward(rosyRewardsV1, rules, {
        ...order,
        lines: [order.lines[0]!, order.lines[0]!],
      }),
    ).toThrow("Duplicate order line ID");
    expect(() =>
      evaluateOrderAward(rosyRewardsV1, rules, {
        ...order,
        lines: [{ ...order.lines[0]!, discountMinor: minorUnit(2_000) }],
      }),
    ).toThrow("exceed gross value");
  });

  it("validates deterministic rule identity, ordering, and windows", () => {
    expect(() => validateAwardRules([rules[0]!, rules[0]!])).toThrow(
      "Duplicate rule ID",
    );
    expect(() =>
      validateAwardRules([
        {
          ...rules[1]!,
          condition: {
            startsAt: "2026-09-01T00:00:00Z",
            endsAt: "2026-08-01T00:00:00Z",
          },
        },
      ]),
    ).toThrow("end must follow rule start");
  });
});

describe("reward definitions", () => {
  it("quotes all connector-neutral reward families", () => {
    expect(
      quoteReward({
        id: "ten-euro",
        kind: "fixed_discount",
        costPoints: points(1_000),
        amountMinor: minorUnit(1_000),
      }),
    ).toMatchObject({
      kind: "fixed_discount",
      configuration: { amountMinor: 1_000 },
    });
    expect(
      quoteReward({
        id: "twenty-percent",
        kind: "percentage_discount",
        costPoints: points(1_500),
        percentageBasisPoints: 2_000,
        maximumDiscountMinor: minorUnit(2_500),
      }),
    ).toMatchObject({ kind: "percentage_discount" });
    expect(
      quoteReward({
        id: "gift",
        kind: "free_product",
        costPoints: points(800),
        productId: "rose-oil",
      }),
    ).toMatchObject({
      kind: "free_product",
      configuration: { productId: "rose-oil" },
    });
    for (const kind of [
      "free_shipping",
      "store_credit",
      "exclusive_access",
      "custom",
    ] as const) {
      expect(
        quoteReward({
          id: kind,
          kind,
          costPoints: points(500),
          configuration: { channel: "woocommerce" },
        }),
      ).toMatchObject({ kind });
    }
  });

  it("rejects invalid reward costs and percentages", () => {
    expect(() =>
      quoteReward({
        id: "bad",
        kind: "fixed_discount",
        costPoints: points(0),
        amountMinor: minorUnit(100),
      }),
    ).toThrow("positive");
    expect(() =>
      quoteReward({
        id: "bad-rate",
        kind: "percentage_discount",
        costPoints: points(100),
        percentageBasisPoints: 10_001,
        maximumDiscountMinor: null,
      }),
    ).toThrow("basis points");
  });
});

describe("tier qualification evidence", () => {
  const facts = [
    {
      occurredAt: "2026-06-30T23:59:59Z",
      eligibleSpendMinor: minorUnit(10_000),
      earnedPoints: points(500),
      orderCount: 1,
    },
    {
      occurredAt: "2026-08-01T00:00:00Z",
      eligibleSpendMinor: minorUnit(15_000),
      earnedPoints: points(900),
      orderCount: 2,
    },
    {
      occurredAt: "2026-08-12T00:00:00Z",
      eligibleSpendMinor: minorUnit(5_000),
      earnedPoints: points(300),
      orderCount: 1,
    },
  ];

  it("evaluates rolling, calendar, and lifetime periods for every metric", () => {
    expect(
      evaluateTierQualification(
        facts,
        { period: "rolling", metric: "spend", days: 30 },
        "2026-08-12T00:00:00Z",
      ).value,
    ).toBe(20_000);
    expect(
      evaluateTierQualification(
        facts,
        { period: "calendar", metric: "orders", unit: "month" },
        "2026-08-12T00:00:00Z",
      ).value,
    ).toBe(3);
    expect(
      evaluateTierQualification(
        facts,
        { period: "lifetime", metric: "points" },
        "2026-08-12T00:00:00Z",
      ).value,
    ).toBe(1_700);
  });
});
