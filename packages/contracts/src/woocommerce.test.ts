import { describe, expect, it } from "vitest";
import {
  canonicalCommerceEventV1,
  signWooCommerceDelivery,
  verifyWooCommerceDelivery,
  wooCommerceDeliveryEnvelopeV1,
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
