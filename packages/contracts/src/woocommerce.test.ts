import { describe, expect, it } from "vitest";
import {
  canonicalCommerceEventV1,
  merchantProvisionWooCommerceConnectionCommandV1,
  merchantRetryConnectorEffectCommandV1,
  merchantRequestConnectorReconciliationCommandV1,
  merchantRequestConnectorReconciliationResultV1,
  signWooCommerceCustomerClaim,
  signWooCommerceDelivery,
  verifyWooCommerceCustomerClaim,
  verifyWooCommerceDelivery,
  wooCommerceCustomerClaimV1,
  wooCommerceCustomerCreatedPayloadV1,
  wooCommerceCustomerDeletedPayloadV1,
  wooCommerceCouponCapturedPayloadV1,
  wooCommerceCouponCommandEnvelopeV1,
  wooCommerceConnectorCommandEnvelopeV1,
  wooCommerceDecimalToMinor,
  wooCommerceDeliveryEnvelopeV1,
  wooCommerceOrderRefundedPayloadV1,
  wooCommerceOrderStatusChangedPayloadV1,
  wooCommerceVerifiedProductReviewPayloadV1,
  wooCommerceConnectionPackageV1,
} from "./woocommerce";

const encoder = new TextEncoder();
const secret = encoder.encode("local-fixture-key-material");
const rawBody = encoder.encode('{"version":"1","deliveryId":"delivery-42"}');
const requestTarget = "/api/v1/integrations/woocommerce/events";
const connectionId = "5abf9309-a530-489f-a63f-51130c4fc01d";
const deliveryId = "delivery-42";
const timestamp = "1786471200";
const nonce = "delivery-42-attempt-1";

describe("WooCommerce connector provisioning contracts", () => {
  const command = {
    version: "1",
    workspaceId: "5abf9309-a530-489f-a63f-51130c4fc021",
    programmeId: "5abf9309-a530-489f-a63f-51130c4fc022",
    externalStoreId: "https://shop.example.test",
    displayName: "Example Store",
    idempotencyKey: "connector:provision:fixture",
    correlationId: "5abf9309-a530-489f-a63f-51130c4fc023",
  } as const;

  it("accepts canonical server-scoped provisioning inputs", () => {
    expect(
      merchantProvisionWooCommerceConnectionCommandV1.safeParse(command)
        .success,
    ).toBe(true);
  });

  it("rejects unsafe store scope and caller-supplied secret authority", () => {
    for (const externalStoreId of [
      "http://shop.example.test",
      "https://USER:PASS@shop.example.test",
      "https://shop.example.test/path",
      "https://SHOP.example.test",
    ]) {
      expect(
        merchantProvisionWooCommerceConnectionCommandV1.safeParse({
          ...command,
          externalStoreId,
        }).success,
      ).toBe(false);
    }
    expect(
      merchantProvisionWooCommerceConnectionCommandV1.safeParse({
        ...command,
        signingKey: Buffer.alloc(32).toString("base64"),
      }).success,
    ).toBe(false);
  });

  it("accepts only an exact HTTPS one-time connection package", () => {
    const connectionPackage = {
      version: "1",
      endpoint:
        "https://loyalty.example.test/api/v1/integrations/woocommerce/events",
      connectionId: "5abf9309-a530-489f-a63f-51130c4fc024",
      keyVersion: "v1",
      signingKey: Buffer.alloc(32, 7).toString("base64"),
    } as const;
    expect(
      wooCommerceConnectionPackageV1.safeParse(connectionPackage).success,
    ).toBe(true);
    expect(
      wooCommerceConnectionPackageV1.safeParse({
        ...connectionPackage,
        signingKey: Buffer.alloc(16).toString("base64"),
      }).success,
    ).toBe(false);
  });
});

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

describe("merchant connector operation contracts", () => {
  it("accepts an attributable dead-letter effect retry", () => {
    expect(
      merchantRetryConnectorEffectCommandV1.safeParse({
        version: "1",
        eventId: connectionId,
        reason: "Reviewed the worker failure before replay",
        idempotencyKey: "connector:effect:retry:fixture",
        correlationId: "5abf9309-a530-489f-a63f-51130c4fc02d",
      }).success,
    ).toBe(true);
  });

  it("rejects short, multiline, or caller-expanded retry requests", () => {
    for (const request of [
      { reason: "retry" },
      { reason: "reviewed\nthen retried" },
      { reason: "Reviewed safely", organizationId: "1" },
    ]) {
      expect(
        merchantRetryConnectorEffectCommandV1.safeParse({
          version: "1",
          eventId: connectionId,
          idempotencyKey: "connector:effect:retry:fixture",
          correlationId: "5abf9309-a530-489f-a63f-51130c4fc02d",
          ...request,
        }).success,
      ).toBe(false);
    }
  });

  it("accepts a bounded source-order reconciliation request", () => {
    expect(
      merchantRequestConnectorReconciliationCommandV1.safeParse({
        version: "1",
        connectionId,
        orderId: "42",
        reason: "Order is missing its completed loyalty effect",
        idempotencyKey: "connector:reconcile:fixture",
        correlationId: "5abf9309-a530-489f-a63f-51130c4fc02d",
      }).success,
    ).toBe(true);
    expect(
      merchantRequestConnectorReconciliationCommandV1.safeParse({
        version: "1",
        connectionId,
        orderId: "-1",
        reason: "Invalid source order identifier",
        idempotencyKey: "connector:reconcile:fixture",
        correlationId: "5abf9309-a530-489f-a63f-51130c4fc02d",
      }).success,
    ).toBe(false);
  });

  it("represents exhausted reconciliation commands as manual review", () => {
    expect(
      merchantRequestConnectorReconciliationResultV1.safeParse({
        resourceId: "5abf9309-a530-489f-a63f-51130c4fc03d",
        outcome: "duplicate",
        state: "manual_review",
      }).success,
    ).toBe(true);
  });

  it("validates the signed reconciliation command envelope", () => {
    expect(
      wooCommerceConnectorCommandEnvelopeV1.safeParse({
        version: "1",
        commandId: "5abf9309-a530-489f-a63f-51130c4fc03d",
        connectionId,
        topic: "woocommerce.order.reconcile",
        payloadVersion: "v1",
        deliveredAt: "2026-08-12T08:00:00Z",
        payload: { kind: "reconcile_order", orderId: "42" },
      }).success,
    ).toBe(true);
    expect(
      wooCommerceConnectorCommandEnvelopeV1.safeParse({
        version: "1",
        commandId: "5abf9309-a530-489f-a63f-51130c4fc03d",
        connectionId,
        topic: "woocommerce.order.reconcile",
        payloadVersion: "v1",
        deliveredAt: "2026-08-12T08:00:00Z",
        payload: { kind: "cancel_coupon", orderId: "42" },
      }).success,
    ).toBe(false);
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
    expect(
      wooCommerceOrderRefundedPayloadV1.safeParse({
        kind: "order_refunded",
        refundId: "9",
        refundAmount: "6.00",
        order: {
          ...order,
          shippingRefundedTotal: "5.00",
          refundedTotal: "7.50",
        },
      }).success,
    ).toBe(false);
  });

  it("accepts a PII-free coupon capture fact and rejects extra fields", () => {
    const fact = {
      kind: "coupon_captured",
      reservationId: "63000000-0000-4000-8000-000000000001",
      orderId: "42",
    };
    expect(wooCommerceCouponCapturedPayloadV1.safeParse(fact).success).toBe(
      true,
    );
    expect(
      wooCommerceCouponCapturedPayloadV1.safeParse({
        ...fact,
        email: "customer@example.test",
      }).success,
    ).toBe(false);
  });

  it("accepts only a numeric PII-free customer deletion subject", () => {
    expect(
      wooCommerceCustomerDeletedPayloadV1.safeParse({
        kind: "customer_deleted",
        externalCustomerId: "7",
      }).success,
    ).toBe(true);
    expect(
      wooCommerceCustomerDeletedPayloadV1.safeParse({
        kind: "customer_deleted",
        externalCustomerId: "7",
        email: "customer@example.test",
      }).success,
    ).toBe(false);
    expect(
      wooCommerceCustomerDeletedPayloadV1.safeParse({
        kind: "customer_deleted",
        externalCustomerId: "guest@example.test",
      }).success,
    ).toBe(false);
  });

  it("accepts PII-free authoritative account and verified-review facts", () => {
    expect(
      wooCommerceCustomerCreatedPayloadV1.safeParse({
        kind: "customer_created",
        externalCustomerId: "7",
      }).success,
    ).toBe(true);
    expect(
      wooCommerceVerifiedProductReviewPayloadV1.safeParse({
        kind: "verified_product_review",
        externalCustomerId: "7",
        reviewId: "91",
        productId: "10",
        categoryIds: ["3"],
      }).success,
    ).toBe(true);
    expect(
      wooCommerceVerifiedProductReviewPayloadV1.safeParse({
        kind: "verified_product_review",
        externalCustomerId: "7",
        reviewId: "91",
        productId: "10",
        categoryIds: ["3"],
        email: "customer@example.test",
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

describe("WooCommerce customer claims", () => {
  const claim = {
    connectionId,
    externalCustomerId: "42",
    issuedAt: timestamp,
    nonce: "1cedd847-79f1-4393-a141-92d20efb7a0c",
    keyVersion: "v1",
  } as const;

  function signedClaim() {
    return {
      ...claim,
      signature: signWooCommerceCustomerClaim({ claim, secret }),
    };
  }

  it("accepts only a bounded registered-customer capability", () => {
    expect(wooCommerceCustomerClaimV1.safeParse(signedClaim()).success).toBe(
      true,
    );
    expect(
      wooCommerceCustomerClaimV1.safeParse({
        ...signedClaim(),
        externalCustomerId: "customer@example.test",
      }).success,
    ).toBe(false);
    expect(
      wooCommerceCustomerClaimV1.safeParse({
        ...signedClaim(),
        email: "customer@example.test",
      }).success,
    ).toBe(false);
  });

  it("verifies the exact current claim", () => {
    expect(
      verifyWooCommerceCustomerClaim({
        claim: signedClaim(),
        secret,
        nowMs: Number(timestamp) * 1000,
      }),
    ).toEqual({ ok: true, issuedAt: Number(timestamp) });
  });

  it("binds the signature to customer, connection, nonce, and key version", () => {
    for (const changed of [
      { externalCustomerId: "43" },
      { connectionId: "5abf9309-a530-489f-a63f-51130c4fc02d" },
      { nonce: "7b812fe2-fe36-4d28-bb69-a4106759843e" },
      { keyVersion: "v2" },
    ]) {
      expect(
        verifyWooCommerceCustomerClaim({
          claim: { ...signedClaim(), ...changed },
          secret,
          nowMs: Number(timestamp) * 1000,
        }),
      ).toEqual({ ok: false, reason: "invalid_signature" });
    }
  });

  it("expires after five minutes in either clock direction", () => {
    expect(
      verifyWooCommerceCustomerClaim({
        claim: signedClaim(),
        secret,
        nowMs: (Number(timestamp) + 301) * 1000,
      }),
    ).toEqual({ ok: false, reason: "stale_timestamp" });
    expect(
      verifyWooCommerceCustomerClaim({
        claim: signedClaim(),
        secret,
        nowMs: (Number(timestamp) - 301) * 1000,
      }),
    ).toEqual({ ok: false, reason: "stale_timestamp" });
  });
});

describe("WooCommerce coupon commands", () => {
  it("accepts a customer-scoped one-use native coupon command", () => {
    expect(
      wooCommerceCouponCommandEnvelopeV1.safeParse({
        version: "1",
        commandId: "61000000-0000-4000-8000-000000000001",
        connectionId: "62000000-0000-4000-8000-000000000001",
        topic: "woocommerce.coupon.issue",
        payloadVersion: "v1",
        deliveredAt: "2026-08-12T10:00:00Z",
        payload: {
          kind: "issue_coupon",
          reservationId: "63000000-0000-4000-8000-000000000001",
          code: "SF0123456789ABCDEFGHIJ",
          externalCustomerId: "7",
          expiresAt: "2026-08-13T10:00:00Z",
          reward: {
            kind: "fixed_discount",
            amountMinor: "1000",
            currencyMinorUnitDigits: 2,
          },
        },
      }).success,
    ).toBe(true);
  });

  it("rejects mismatched topics and weak coupon codes", () => {
    expect(
      wooCommerceCouponCommandEnvelopeV1.safeParse({
        version: "1",
        commandId: "61000000-0000-4000-8000-000000000001",
        connectionId: "62000000-0000-4000-8000-000000000001",
        topic: "woocommerce.coupon.cancel",
        payloadVersion: "v1",
        deliveredAt: "2026-08-12T10:00:00Z",
        payload: {
          kind: "issue_coupon",
          reservationId: "63000000-0000-4000-8000-000000000001",
          code: "SHORT",
          externalCustomerId: "7",
          expiresAt: "2026-08-13T10:00:00Z",
          reward: { kind: "free_shipping" },
        },
      }).success,
    ).toBe(false);
  });

  it("rejects percentage caps that the native connector cannot enforce", () => {
    expect(
      wooCommerceCouponCommandEnvelopeV1.safeParse({
        version: "1",
        commandId: "61000000-0000-4000-8000-000000000001",
        connectionId: "62000000-0000-4000-8000-000000000001",
        topic: "woocommerce.coupon.issue",
        payloadVersion: "v1",
        deliveredAt: "2026-08-12T10:00:00Z",
        payload: {
          kind: "issue_coupon",
          reservationId: "63000000-0000-4000-8000-000000000001",
          code: "SF0123456789ABCDEFGHIJ",
          externalCustomerId: "7",
          expiresAt: "2026-08-13T10:00:00Z",
          reward: {
            kind: "percentage_discount",
            percentageBasisPoints: 1500,
            maximumDiscountMinor: "2500",
            currencyMinorUnitDigits: 2,
          },
        },
      }).success,
    ).toBe(false);
  });
});
