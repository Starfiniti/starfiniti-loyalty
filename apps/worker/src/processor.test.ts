import { describe, expect, it } from "vitest";
import type { Sql } from "postgres";
import {
  calculateCumulativeRefundPlan,
  calculateCumulativeRefundPlanV2,
  evidenceSha256,
  expireDueTierOverrides,
  runPointExpiryLifecycle,
  parseWooCommerceEffect,
  processWooCommerceEffect,
  toOrderAwardFact,
  toPurchaseEarningFactV2,
  type ClaimedEffect,
} from "./processor";

const event: ClaimedEffect = {
  canonical_event_id: "1",
  canonical_event_public_id: "00000000-0000-4000-8000-000000000001",
  organization_id: "1",
  connection_id: "1",
  programme_id: "1",
  event_type: "commerce.order.status_changed",
  source_event_id: "order:42:completed",
  source_object_id: "42",
  occurred_at: "2026-08-12T10:00:00Z",
  attempt_count: 1,
  payload: {
    kind: "order_status_changed",
    previousStatus: "processing",
    order: {
      kind: "order",
      orderId: "42",
      status: "completed",
      currency: "EUR",
      currencyMinorUnitDigits: 2,
      market: "SI",
      customer: { kind: "registered", externalCustomerId: "7" },
      paymentKind: "money",
      lines: [],
      shippingTotal: "0.00",
      taxTotal: "0.00",
      feeTotal: "0.00",
      discountTotal: "0.00",
      refundedTotal: "0.00",
    },
  },
};

describe("WooCommerce effect worker", () => {
  it("runs the bounded point expiry lifecycle and validates aggregate output", async () => {
    const validSql = (async () => [
      {
        expiry_batches: "2",
        expired_lots: "3",
        expired_points: "9223372036854775807",
        notifications_enqueued: "4",
      },
    ]) as unknown as Sql;
    await expect(runPointExpiryLifecycle(validSql)).resolves.toEqual({
      expiryBatches: 2,
      expiredLots: 3,
      expiredPoints: "9223372036854775807",
      notificationsEnqueued: 4,
    });

    const invalidSql = (async () => [
      {
        expiry_batches: "101",
        expired_lots: "3",
        expired_points: "-1",
        notifications_enqueued: "0",
      },
    ]) as unknown as Sql;
    await expect(runPointExpiryLifecycle(invalidSql)).rejects.toThrow(
      "invalid_point_expiry_lifecycle_result",
    );
  });

  it("runs the bounded tier override expiry sweep and rejects malformed counts", async () => {
    const validSql = (async () => [{ expired_count: "2" }]) as unknown as Sql;
    expect(await expireDueTierOverrides(validSql)).toBe(2);

    const invalidSql = (async () => [
      { expired_count: "51" },
    ]) as unknown as Sql;
    await expect(expireDueTierOverrides(invalidSql)).rejects.toThrow(
      "invalid_tier_override_expiry_count",
    );
  });

  it("classifies completed orders as awards and earlier states as skips", () => {
    expect(parseWooCommerceEffect(event).kind).toBe("award");
    expect(
      parseWooCommerceEffect({
        ...event,
        payload: {
          ...(event.payload as Record<string, unknown>),
          order: {
            ...(event.payload as { order: Record<string, unknown> }).order,
            status: "processing",
          },
        },
      }),
    ).toEqual({ kind: "skip", reason: "order_status_not_eligible" });
  });

  it("quarantines malformed facts without exposing payload values", () => {
    expect(
      parseWooCommerceEffect({
        ...event,
        payload: { email: "secret@example.test" },
      }),
    ).toEqual({
      kind: "quarantine",
      reason: "invalid_order_status_payload",
    });
  });

  it("preserves the stable refund id for cumulative reversal idempotency", () => {
    const order = (event.payload as { order: Record<string, unknown> }).order;
    expect(
      parseWooCommerceEffect({
        ...event,
        event_type: "commerce.order.refunded",
        payload: {
          kind: "order_refunded",
          refundId: "refund-9",
          refundAmount: "0.00",
          order,
        },
      }),
    ).toMatchObject({ kind: "refund", refundId: "refund-9" });
  });

  it("classifies strict PII-free coupon use facts for ledger capture", () => {
    expect(
      parseWooCommerceEffect({
        ...event,
        event_type: "commerce.coupon.captured",
        payload: {
          kind: "coupon_captured",
          reservationId: "63000000-0000-4000-8000-000000000001",
          orderId: "42",
        },
      }),
    ).toEqual({
      kind: "coupon_capture",
      reservationId: "63000000-0000-4000-8000-000000000001",
      orderId: "42",
    });
  });

  it("classifies strict customer erasure facts without accepting contact data", () => {
    expect(
      parseWooCommerceEffect({
        ...event,
        event_type: "commerce.customer.deleted",
        source_object_id: "customer-erasure",
        payload: { kind: "customer_deleted", externalCustomerId: "7" },
      }),
    ).toEqual({ kind: "customer_delete", externalCustomerId: "7" });
    expect(
      parseWooCommerceEffect({
        ...event,
        event_type: "commerce.customer.deleted",
        source_object_id: "customer-erasure",
        payload: {
          kind: "customer_deleted",
          externalCustomerId: "7",
          email: "secret@example.test",
        },
      }),
    ).toEqual({
      kind: "quarantine",
      reason: "invalid_customer_deleted_payload",
    });
  });

  it("classifies PII-free account creation and verified review activities", () => {
    expect(
      parseWooCommerceEffect({
        ...event,
        event_type: "commerce.customer.created",
        payload: { kind: "customer_created", externalCustomerId: "7" },
      }),
    ).toEqual({
      kind: "activity",
      source: "account_created",
      customerSelector: { kind: "commerce", externalCustomerId: "7" },
      channel: "woocommerce",
      activityReference: "woocommerce:customer:7",
      activityCode: "account_created",
      productId: null,
      categoryIds: [],
    });
    expect(
      parseWooCommerceEffect({
        ...event,
        event_type: "commerce.review.verified",
        payload: {
          kind: "verified_product_review",
          externalCustomerId: "7",
          reviewId: "101",
          productId: "42",
          categoryIds: ["8", "9"],
        },
      }),
    ).toEqual({
      kind: "activity",
      source: "verified_product_review",
      customerSelector: { kind: "commerce", externalCustomerId: "7" },
      channel: "woocommerce",
      activityReference: "woocommerce:review:101",
      activityCode: "verified_product_review",
      productId: "42",
      categoryIds: ["8", "9"],
    });
    expect(
      parseWooCommerceEffect({
        ...event,
        event_type: "commerce.review.verified",
        payload: {
          kind: "verified_product_review",
          externalCustomerId: "7",
          reviewId: "101",
          productId: "42",
          categoryIds: [],
          content: "PII must never cross the boundary",
        },
      }),
    ).toEqual({
      kind: "quarantine",
      reason: "invalid_verified_review_payload",
    });
  });

  it("classifies signed Merchant Activity facts with public customer authority", () => {
    expect(
      parseWooCommerceEffect({
        ...event,
        event_type: "commerce.activity.recorded",
        source_event_id: "crm:consultation:42",
        payload: {
          kind: "activity",
          source: "custom_activity",
          customerId: "20000000-0000-4000-8000-000000000001",
          activityCode: "consultation",
          productId: null,
          categoryIds: [],
        },
      }),
    ).toEqual({
      kind: "activity",
      source: "custom_activity",
      customerSelector: {
        kind: "public",
        customerId: "20000000-0000-4000-8000-000000000001",
      },
      channel: "merchant-api",
      activityReference: "merchant-activity:crm:consultation:42",
      activityCode: "consultation",
      productId: null,
      categoryIds: [],
    });

    expect(
      parseWooCommerceEffect({
        ...event,
        event_type: "commerce.activity.recorded",
        source_event_id: "referral:qualification:42",
        payload: {
          kind: "activity",
          source: "referral",
          customerId: "20000000-0000-4000-8000-000000000001",
          activityCode: "referral",
          productId: null,
          categoryIds: [],
        },
      }),
    ).toMatchObject({
      kind: "activity",
      source: "referral",
      activityCode: "referral",
    });
  });

  it("hashes equivalent object keys deterministically", () => {
    expect(evidenceSha256({ a: 1, b: { c: 2 } })).toBe(
      evidenceSha256({ b: { c: 2 }, a: 1 }),
    );
  });

  it("rounds partial refunds cumulatively and caps a full refund", () => {
    expect(
      calculateCumulativeRefundPlan({
        originalEligibleSpend: 1_000,
        originalAwardedPoints: 333,
        currentEligibleSpend: 667,
        alreadyReversedPoints: 0,
      }),
    ).toEqual({
      cumulativeRefundedEligibleSpend: 333,
      reversalPoints: 110,
    });
    expect(
      calculateCumulativeRefundPlan({
        originalEligibleSpend: 1_000,
        originalAwardedPoints: 333,
        currentEligibleSpend: 0,
        alreadyReversedPoints: 110,
      }).reversalPoints,
    ).toBe(223);
  });

  it("rejects a cumulative refund snapshot that moves backwards", () => {
    expect(() =>
      calculateCumulativeRefundPlan({
        originalEligibleSpend: 1_000,
        originalAwardedPoints: 333,
        currentEligibleSpend: 1_001,
        alreadyReversedPoints: 0,
      }),
    ).toThrow("cumulative_refund_moved_backwards");
  });

  it("keeps original award spend separate from cumulative refund evidence", () => {
    const parsed = parseWooCommerceEffect(event);
    if (parsed.kind !== "award") throw new Error("expected award fixture");
    const order = {
      ...parsed.order,
      lines: [
        {
          lineId: "1",
          productId: "10",
          variationId: null,
          quantity: "1",
          categoryIds: [],
          collectionIds: [],
          subtotal: "10.00",
          total: "10.00",
          refundedTotal: "4.00",
        },
      ],
      refundedTotal: "4.00",
    };
    const award = toOrderAwardFact(order, event.occurred_at, "rose", false);
    const refund = toOrderAwardFact(order, event.occurred_at, "rose", true);
    expect(award.lines[0]?.refundedMinor).toBe(0);
    expect(refund.lines[0]?.refundedMinor).toBe(400);
  });

  it("converts WooCommerce V2 facts exactly and includes component refunds only during reversal", () => {
    const parsed = parseWooCommerceEffect(event);
    if (parsed.kind !== "award") throw new Error("expected award fixture");
    const order = {
      ...parsed.order,
      shippingTotal: "4.99",
      shippingRefundedTotal: "1.25",
      taxTotal: "2.00",
      taxRefundedTotal: "0.50",
      feeTotal: "1.00",
      feeRefundedTotal: "0.25",
      refundedTotal: "2.00",
    };
    const award = toPurchaseEarningFactV2(
      order,
      event,
      "rose",
      { "purchase-base": "100" },
      false,
    );
    const refund = toPurchaseEarningFactV2(
      order,
      event,
      "rose",
      { "purchase-base": "100" },
      true,
    );

    expect(award).toMatchObject({
      eventId: "woocommerce:1:order:42:completed",
      shippingMinor: "499",
      shippingRefundedMinor: "0",
      taxRefundedMinor: "0",
      feeRefundedMinor: "0",
      memberRuleUsage: { "purchase-base": "100" },
    });
    expect(refund).toMatchObject({
      shippingRefundedMinor: "125",
      taxRefundedMinor: "50",
      feeRefundedMinor: "25",
    });
  });

  it("calculates cumulative V2 reversals beyond JavaScript safe integers", () => {
    expect(
      calculateCumulativeRefundPlanV2({
        originalEligibleSpend: "9007199254740993",
        originalAwardedPoints: "9007199254740991",
        currentEligibleSpend: "4503599627370496",
        alreadyReversedPoints: "0",
      }),
    ).toEqual({
      cumulativeRefundedEligibleSpend: "4503599627370497",
      reversalPoints: "4503599627370495",
    });
    expect(
      calculateCumulativeRefundPlanV2({
        originalEligibleSpend: "9007199254740993",
        originalAwardedPoints: "9007199254740991",
        currentEligibleSpend: "0",
        alreadyReversedPoints: "4503599627370495",
      }).reversalPoints,
    ).toBe("4503599627370496");
  });

  it("routes live V2 purchase and activity awards through the atomic database command", async () => {
    const calls: string[] = [];
    const query = async (parts: TemplateStringsArray): Promise<unknown[]> => {
      const text = parts.join("?");
      calls.push(text);
      if (text.includes("resolve_commerce_customer")) {
        return [{ customer_id: "7" }];
      }
      if (text.includes("from loyalty.customers")) {
        return [{ customer_id: "7" }];
      }
      if (text.includes("from loyalty.programmes as programme")) {
        return [
          {
            programme_group_id: "10",
            programme_version_id: "11",
            programme_version_public_id: "00000000-0000-4000-8000-000000000011",
            version_number: 2,
            tier_code: "rose",
            tier_name: "Rose",
            minimum_eligible_spend_minor: "0",
            points_per_major_unit: "5",
            ordinal: 1,
            configuration: {
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
                      earningMultiplierBasisPoints: 10000,
                      rewardCodes: [],
                      earlyAccess: false,
                    },
                  },
                ],
              },
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
                    perMemberPoints: "1000",
                    memberPeriod: "calendar_year",
                    rollingDays: null,
                  },
                },
                {
                  code: "account-created",
                  name: "Account created",
                  source: "account_created",
                  enabled: true,
                  priority: 10,
                  stackable: true,
                  effect: { kind: "fixed_bonus", points: "100" },
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
                  purchaseExclusions: null,
                  cap: {
                    perEventPoints: "100",
                    perMemberPoints: "100",
                    memberPeriod: "lifetime",
                    rollingDays: null,
                  },
                },
              ],
            },
          },
        ];
      }
      if (text.includes("from loyalty.wallets as wallet")) return [];
      if (text.includes("get_member_earning_rule_usage")) {
        return [{ rule_code: "purchase-base", consumed_points: "25" }];
      }
      if (text.includes("commit_programme_v2_award")) {
        return [
          {
            evaluation_public_id: "00000000-0000-4000-8000-000000000021",
            transaction_public_id: null,
            outcome: "created",
          },
        ];
      }
      if (text.includes("get_tier_qualification_context_v2")) {
        return [
          {
            metrics: {
              eligibleSpendMinor: "0",
              earnedPoints: "0",
              orderCount: "0",
              referralCount: "0",
              verifiedActionCount: "0",
              verifiedActionCounts: {},
            },
            current_tier_code: null,
            previously_held_tier_codes: [],
            below_threshold_since: null,
          },
        ];
      }
      if (text.includes("record_tier_qualification_decision_v2")) {
        return [
          {
            tier_decision_public_id: "00000000-0000-4000-8000-000000000031",
          },
        ];
      }
      if (text.includes("finish_commerce_effect")) return [];
      throw new Error(`Unexpected query: ${text}`);
    };
    const fakeSql = query as unknown as Sql;
    Object.assign(fakeSql, {
      begin: async (callback: (transaction: Sql) => Promise<unknown>) =>
        callback(fakeSql),
    });

    await processWooCommerceEffect(fakeSql, "worker-test", event);
    await processWooCommerceEffect(fakeSql, "worker-test", {
      ...event,
      canonical_event_id: "2",
      canonical_event_public_id: "00000000-0000-4000-8000-000000000002",
      event_type: "commerce.customer.created",
      source_event_id: "customer:7:created",
      source_object_id: "7",
      payload: { kind: "customer_created", externalCustomerId: "7" },
    });
    await processWooCommerceEffect(fakeSql, "worker-test", {
      ...event,
      canonical_event_id: "3",
      canonical_event_public_id: "00000000-0000-4000-8000-000000000003",
      event_type: "commerce.activity.recorded",
      source_event_id: "crm:consultation:42",
      source_object_id: "20000000-0000-4000-8000-000000000001",
      payload: {
        kind: "activity",
        source: "custom_activity",
        customerId: "20000000-0000-4000-8000-000000000001",
        activityCode: "consultation",
        productId: null,
        categoryIds: [],
      },
    });

    expect(
      calls.some((call) => call.includes("get_member_earning_rule_usage")),
    ).toBe(true);
    expect(
      calls.filter((call) => call.includes("commit_programme_v2_award")),
    ).toHaveLength(3);
    expect(
      calls.filter((call) =>
        call.includes("get_tier_qualification_context_v2"),
      ),
    ).toHaveLength(3);
    expect(
      calls.filter((call) =>
        call.includes("record_tier_qualification_decision_v2"),
      ),
    ).toHaveLength(3);
    expect(calls.some((call) => call.includes("finish_commerce_effect"))).toBe(
      true,
    );
    expect(
      calls.some((call) => call.includes("record_programme_evaluation")),
    ).toBe(false);
  });
});
