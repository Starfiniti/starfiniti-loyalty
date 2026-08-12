import { describe, expect, it } from "vitest";
import {
  calculateCumulativeRefundPlan,
  evidenceSha256,
  parseWooCommerceEffect,
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
});
