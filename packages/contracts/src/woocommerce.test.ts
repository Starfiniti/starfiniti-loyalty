import { describe, expect, it } from "vitest";
import {
  canonicalCommerceEventV1,
  signWooCommerceDelivery,
  verifyWooCommerceDelivery,
  wooCommerceDecimalToMinor,
  wooCommerceDeliveryEnvelopeV1,
  wooCommerceOrderRefundedPayloadV1,
  wooCommerceOrderStatusChangedPayloadV1,
} from "./woocommerce";

const encoder = new TextEncoder();
const secret = encoder.encode("local-fixture-key-material");
const rawBody = encoder.encode('{"version":"1","deliveryId":"delivery-42"}');
const requestTarget = "/api/v1/integrations/woocommerce/events";
const connectionId = "5abf9309-a530-489f-a63f-51130c4fc01d";
const deliveryId = "delivery-42";
const timestamp = "1786471200";
const nonce = "delivery-42-attempt-1";

function signedHeaders() {
  const signed = signWooCommerceDelivery({
    requestTarget,
    connectionId,
    deliveryId,
    timestamp,
    nonce,
    rawBody,
    secret,
  });
  return {
    connectionId,
    deliveryId,
    timestamp,
    nonce,
    keyVersion: "v1",
    ...signed,
  };
}

describe("WooCommerce delivery contracts", () => {
  it("accepts the strict versioned delivery envelope", () => {
    const result = wooCommerceDeliveryEnvelopeV1.safeParse({
      version: "1",
      deliveryId: "delivery-42",
      connectionId,
      sourceEventId: "order-42-revision-3",
      eventType: "commerce.order.status_changed",
      sourceObjectId: "42",
      sourceRevision: "3",
      occurredAt: "2026-08-11T20:00:00+02:00",
      deliveredAt: "2026-08-11T20:00:01+02:00",
      payload: { status: "completed" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown event types and envelope fields", () => {
    const result = wooCommerceDeliveryEnvelopeV1.safeParse({
      version: "1",
      eventType: "shopify.order.updated",
      unexpected: true,
    });
    expect(result.success).toBe(false);
  });

  it("accepts integer minor-unit canonical amounts", () => {
    const result = canonicalCommerceEventV1.safeParse({
      version: "1",
      normalizationVersion: "v1",
      connectionId,
      sourceEventId: "refund-9",
      eventType: "commerce.order.refunded",
      sourceObjectId: "42",
      sourceRevision: "4",
      occurredAt: "2026-08-11T20:00:00+02:00",
      currency: "EUR",
      amountMinor: -1299,
      payload: { refundId: "9" },
    });
    expect(result.success).toBe(true);
  });
});

const order = {
  kind: "order" as const,
  orderId: "42",
  status: "completed",
  currency: "EUR",
  currencyMinorUnitDigits: 2,
  market: "SI",
  customer: { kind: "registered" as const, externalCustomerId: "7" },
  paymentKind: "money" as const,
  lines: [
    {
      lineId: "1",
      productId: "10",
      variationId: null,
      quantity: "2",
      categoryIds: ["3"],
      collectionIds: [],
      subtotal: "12.34",
      total: "10.00",
      refundedTotal: "2.50",
    },
  ],
  shippingTotal: "4.99",
  taxTotal: "2.10",
  feeTotal: "0.00",
  discountTotal: "2.34",
  refundedTotal: "2.50",
};

describe("WooCommerce commerce facts", () => {
  it("accepts full order and cumulative refund snapshots without PII", () => {
    expect(
      wooCommerceOrderStatusChangedPayloadV1.safeParse({
        kind: "order_status_changed",
        previousStatus: "processing",
        order,
      }).success,
    ).toBe(true);
    expect(
      wooCommerceOrderRefundedPayloadV1.safeParse({
        kind: "order_refunded",
        refundId: "9",
        refundAmount: "2.50",
        order,
      }).success,
    ).toBe(true);
  });

  it("converts decimal strings to integer minor units without floating point", () => {
    expect(wooCommerceDecimalToMinor("12.34", 2)).toBe(1234);
    expect(wooCommerceDecimalToMinor("12", 2)).toBe(1200);
    expect(wooCommerceDecimalToMinor("12.3", 2)).toBe(1230);
    expect(() => wooCommerceDecimalToMinor("12.345", 2)).toThrow(
      "excess fractional precision",
    );
    expect(() => wooCommerceDecimalToMinor("1e3", 2)).toThrow("decimal string");
  });

  it("rejects customer PII and malformed money facts at the strict boundary", () => {
    expect(
      wooCommerceOrderStatusChangedPayloadV1.safeParse({
        kind: "order_status_changed",
        previousStatus: "processing",
        order: {
          ...order,
          customer: {
            kind: "registered",
            externalCustomerId: "7",
            email: "customer@example.test",
          },
        },
      }).success,
    ).toBe(false);
    expect(
      wooCommerceOrderStatusChangedPayloadV1.safeParse({
        kind: "order_status_changed",
        previousStatus: "processing",
        order: { ...order, shippingTotal: "4,99" },
      }).success,
    ).toBe(false);
  });

  it("rejects internally inconsistent line and refund totals", () => {
    expect(
      wooCommerceOrderStatusChangedPayloadV1.safeParse({
        kind: "order_status_changed",
        previousStatus: "processing",
        order: {
          ...order,
          lines: [{ ...order.lines[0], refundedTotal: "10.01" }],
        },
      }).success,
    ).toBe(false);
    expect(
      wooCommerceOrderRefundedPayloadV1.safeParse({
        kind: "order_refunded",
        refundId: "9",
        refundAmount: "2.51",
        order,
      }).success,
    ).toBe(false);
  });
});

describe("WooCommerce raw-body signatures", () => {
  it("verifies a current exact-body signature", () => {
    expect(
      verifyWooCommerceDelivery({
        requestTarget,
        headers: signedHeaders(),
        rawBody,
        secret,
        nowMs: Number(timestamp) * 1000,
      }),
    ).toEqual({
      ok: true,
      bodySha256: signedHeaders().bodySha256,
      timestamp: Number(timestamp),
    });
  });

  it("rejects body tampering before payload parsing", () => {
    expect(
      verifyWooCommerceDelivery({
        requestTarget,
        headers: signedHeaders(),
        rawBody: encoder.encode('{"version":"1","deliveryId":"changed"}'),
        secret,
        nowMs: Number(timestamp) * 1000,
      }),
    ).toEqual({ ok: false, reason: "invalid_body_hash" });
  });

  it("rejects a valid signature outside the replay window", () => {
    expect(
      verifyWooCommerceDelivery({
        requestTarget,
        headers: signedHeaders(),
        rawBody,
        secret,
        nowMs: (Number(timestamp) + 301) * 1000,
      }),
    ).toEqual({ ok: false, reason: "stale_timestamp" });
  });

  it("rejects an unknown secret without leaking comparison detail", () => {
    expect(
      verifyWooCommerceDelivery({
        requestTarget,
        headers: signedHeaders(),
        rawBody,
        secret: encoder.encode("different-local-fixture"),
        nowMs: Number(timestamp) * 1000,
      }),
    ).toEqual({ ok: false, reason: "invalid_signature" });
  });

  it("bounds raw body bytes before hashing", () => {
    expect(
      verifyWooCommerceDelivery({
        requestTarget,
        headers: signedHeaders(),
        rawBody,
        secret,
        nowMs: Number(timestamp) * 1000,
        maxBodyBytes: 8,
      }),
    ).toEqual({ ok: false, reason: "body_too_large" });
  });
});
