import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { referralAttributionEvidenceV1 } from "./referral";

const merchantOperationKey = z.string().trim().min(1).max(255);
const merchantReason = z
  .string()
  .trim()
  .min(8)
  .max(500)
  .regex(/^[^\u0000-\u001f\u007f]+$/u);
const merchantDisplayName = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[^\u0000-\u001f\u007f]+$/u);
const wooCommerceStoreOrigin = z
  .string()
  .min(12)
  .max(255)
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return (
        parsed.protocol === "https:" &&
        parsed.username === "" &&
        parsed.password === "" &&
        parsed.origin === value &&
        value === value.toLowerCase()
      );
    } catch {
      return false;
    }
  }, "Use a canonical lowercase HTTPS store origin");
const wooCommerceEventEndpoint = z
  .string()
  .max(500)
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return (
        parsed.protocol === "https:" &&
        parsed.username === "" &&
        parsed.password === "" &&
        parsed.search === "" &&
        parsed.hash === "" &&
        parsed.pathname.endsWith("/api/v1/integrations/woocommerce/events")
      );
    } catch {
      return false;
    }
  }, "Use the HTTPS WooCommerce event endpoint");
const base64SigningKey = z.string().refine((value) => {
  if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(value)) return false;
  try {
    return Buffer.from(value, "base64").byteLength >= 32;
  } catch {
    return false;
  }
}, "Use a base64 signing key containing at least 32 bytes");

export const canonicalCommerceEventTypes = [
  "commerce.order.upserted",
  "commerce.order.status_changed",
  "commerce.order.refunded",
  "commerce.customer.upserted",
  "commerce.customer.created",
  "commerce.customer.deleted",
  "commerce.product.upserted",
  "commerce.review.verified",
  "commerce.connection.rotated",
  "commerce.connection.disabled",
  "commerce.coupon.issued",
  "commerce.coupon.captured",
  "commerce.coupon.cancelled",
] as const;

export const wooCommerceDeliveryEnvelopeV1 = z
  .object({
    version: z.literal("1"),
    deliveryId: z.string().min(1).max(255),
    connectionId: z.uuid(),
    sourceEventId: z.string().min(1).max(255),
    eventType: z.enum(canonicalCommerceEventTypes),
    sourceObjectId: z.string().min(1).max(255),
    sourceRevision: z.string().min(1).max(255).nullable().optional(),
    occurredAt: z.iso.datetime({ offset: true }),
    deliveredAt: z.iso.datetime({ offset: true }),
    correlationId: z.uuid().nullable().optional(),
    causationId: z.uuid().nullable().optional(),
    payload: z.unknown(),
  })
  .strict();

export type WooCommerceDeliveryEnvelopeV1 = z.infer<
  typeof wooCommerceDeliveryEnvelopeV1
>;

export const canonicalCommerceEventV1 = z
  .object({
    version: z.literal("1"),
    normalizationVersion: z.string().regex(/^v[1-9][0-9]*$/u),
    connectionId: z.uuid(),
    sourceEventId: z.string().min(1).max(255),
    eventType: z.enum(canonicalCommerceEventTypes),
    sourceObjectId: z.string().min(1).max(255),
    sourceRevision: z.string().min(1).max(255).nullable(),
    occurredAt: z.iso.datetime({ offset: true }),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/u)
      .optional(),
    amountMinor: z.int().safe().optional(),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();

export type CanonicalCommerceEventV1 = z.infer<typeof canonicalCommerceEventV1>;

export const merchantRetryConnectorEffectCommandV1 = z
  .object({
    version: z.literal("1"),
    eventId: z.uuid(),
    reason: merchantReason,
    idempotencyKey: merchantOperationKey,
    correlationId: z.uuid(),
  })
  .strict();

export const merchantRetryConnectorEffectResultV1 = z
  .object({
    resourceId: z.uuid(),
    outcome: z.enum(["created", "duplicate"]),
    effectState: z.literal("retryable"),
  })
  .strict();

export type MerchantRetryConnectorEffectCommandV1 = z.infer<
  typeof merchantRetryConnectorEffectCommandV1
>;

export const merchantProvisionWooCommerceConnectionCommandV1 = z
  .object({
    version: z.literal("1"),
    workspaceId: z.uuid(),
    programmeId: z.uuid(),
    externalStoreId: wooCommerceStoreOrigin,
    displayName: merchantDisplayName,
    idempotencyKey: merchantOperationKey,
    correlationId: z.uuid(),
  })
  .strict();

export const merchantProvisionWooCommerceConnectionResultV1 = z
  .object({
    resourceId: z.uuid(),
    keyVersion: z.string().regex(/^v[1-9][0-9]*$/u),
    outcome: z.enum(["created", "duplicate"]),
  })
  .strict();

export const wooCommerceConnectionPackageV1 = z
  .object({
    version: z.literal("1"),
    endpoint: wooCommerceEventEndpoint,
    connectionId: z.uuid(),
    keyVersion: z.string().regex(/^v[1-9][0-9]*$/u),
    signingKey: base64SigningKey,
  })
  .strict();

export type MerchantProvisionWooCommerceConnectionCommandV1 = z.infer<
  typeof merchantProvisionWooCommerceConnectionCommandV1
>;
export type MerchantProvisionWooCommerceConnectionResultV1 = z.infer<
  typeof merchantProvisionWooCommerceConnectionResultV1
>;
export type WooCommerceConnectionPackageV1 = z.infer<
  typeof wooCommerceConnectionPackageV1
>;

export const wooCommerceDecimal = z
  .string()
  .regex(/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u);

const wooCommerceOrderLineV1 = z
  .object({
    lineId: z.string().min(1).max(255),
    productId: z.string().min(1).max(255),
    variationId: z.string().min(1).max(255).nullable(),
    quantity: wooCommerceDecimal,
    categoryIds: z.array(z.string().min(1).max(255)),
    collectionIds: z.array(z.string().min(1).max(255)).default([]),
    subtotal: wooCommerceDecimal,
    total: wooCommerceDecimal,
    refundedTotal: wooCommerceDecimal,
  })
  .strict();

export const wooCommerceOrderFactV1 = z
  .object({
    kind: z.literal("order"),
    orderId: z.string().min(1).max(255),
    status: z.string().regex(/^[a-z0-9_-]{1,100}$/u),
    currency: z.string().regex(/^[A-Z]{3}$/u),
    currencyMinorUnitDigits: z.int().min(0).max(6),
    market: z.string().regex(/^[A-Z]{2}$/u),
    customer: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("registered"),
          externalCustomerId: z.string().min(1).max(255),
        })
        .strict(),
      z
        .object({
          kind: z.literal("guest"),
          guestOrderId: z.string().min(1).max(255),
        })
        .strict(),
    ]),
    paymentKind: z.enum(["money", "gift-card", "store-credit"]),
    referral: referralAttributionEvidenceV1.nullable().optional(),
    lines: z.array(wooCommerceOrderLineV1),
    shippingTotal: wooCommerceDecimal,
    shippingRefundedTotal: wooCommerceDecimal.default("0"),
    taxTotal: wooCommerceDecimal,
    taxRefundedTotal: wooCommerceDecimal.default("0"),
    feeTotal: wooCommerceDecimal,
    feeRefundedTotal: wooCommerceDecimal.default("0"),
    discountTotal: wooCommerceDecimal,
    refundedTotal: wooCommerceDecimal,
  })
  .strict()
  .superRefine((order, context) => {
    let lineRefundTotal = 0n;
    const orderAmounts = [
      "shippingTotal",
      "shippingRefundedTotal",
      "taxTotal",
      "taxRefundedTotal",
      "feeTotal",
      "feeRefundedTotal",
      "discountTotal",
      "refundedTotal",
    ] as const;
    for (const field of orderAmounts) {
      if (
        scaledBigIntOrNull(order[field], order.currencyMinorUnitDigits) === null
      ) {
        context.addIssue({
          code: "custom",
          message: "Amount exceeds the currency fractional precision",
          path: [field],
        });
      }
    }
    order.lines.forEach((line, index) => {
      const subtotal = scaledBigIntOrNull(
        line.subtotal,
        order.currencyMinorUnitDigits,
      );
      const total = scaledBigIntOrNull(
        line.total,
        order.currencyMinorUnitDigits,
      );
      const refunded = scaledBigIntOrNull(
        line.refundedTotal,
        order.currencyMinorUnitDigits,
      );
      if (subtotal === null || total === null || refunded === null) {
        context.addIssue({
          code: "custom",
          message: "Line amount exceeds the currency fractional precision",
          path: ["lines", index],
        });
        return;
      }
      lineRefundTotal += refunded;
      if (total > subtotal) {
        context.addIssue({
          code: "custom",
          message: "Line total cannot exceed its pre-discount subtotal",
          path: ["lines", index, "total"],
        });
      }
      if (refunded > total) {
        context.addIssue({
          code: "custom",
          message: "Line refunded total cannot exceed its paid total",
          path: ["lines", index, "refundedTotal"],
        });
      }
    });
    const orderRefundTotal = scaledBigIntOrNull(
      order.refundedTotal,
      order.currencyMinorUnitDigits,
    );
    const componentPairs = [
      ["shippingTotal", "shippingRefundedTotal"],
      ["taxTotal", "taxRefundedTotal"],
      ["feeTotal", "feeRefundedTotal"],
    ] as const;
    let componentRefundTotal = 0n;
    for (const [totalField, refundedField] of componentPairs) {
      const total = scaledBigIntOrNull(
        order[totalField],
        order.currencyMinorUnitDigits,
      );
      const refunded = scaledBigIntOrNull(
        order[refundedField],
        order.currencyMinorUnitDigits,
      );
      if (total !== null && refunded !== null) {
        componentRefundTotal += refunded;
        if (refunded > total) {
          context.addIssue({
            code: "custom",
            message: "Component refund cannot exceed its original amount",
            path: [refundedField],
          });
        }
      }
    }
    if (
      orderRefundTotal !== null &&
      lineRefundTotal + componentRefundTotal > orderRefundTotal
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Line and component refunds cannot exceed the cumulative order refund",
        path: ["refundedTotal"],
      });
    }
  });

export const wooCommerceOrderStatusChangedPayloadV1 = z
  .object({
    kind: z.literal("order_status_changed"),
    previousStatus: z.string().regex(/^[a-z0-9_-]{1,100}$/u),
    order: wooCommerceOrderFactV1,
  })
  .strict();

export const wooCommerceOrderRefundedPayloadV1 = z
  .object({
    kind: z.literal("order_refunded"),
    refundId: z.string().min(1).max(255),
    refundAmount: wooCommerceDecimal,
    order: wooCommerceOrderFactV1,
  })
  .strict()
  .superRefine((payload, context) => {
    const digits = payload.order.currencyMinorUnitDigits;
    const refundAmount = scaledBigIntOrNull(payload.refundAmount, digits);
    const cumulativeRefund = scaledBigIntOrNull(
      payload.order.refundedTotal,
      digits,
    );
    if (refundAmount === null) {
      context.addIssue({
        code: "custom",
        message: "Refund amount exceeds the currency fractional precision",
        path: ["refundAmount"],
      });
    } else if (cumulativeRefund !== null && refundAmount > cumulativeRefund) {
      context.addIssue({
        code: "custom",
        message: "Refund amount cannot exceed the cumulative order refund",
        path: ["refundAmount"],
      });
    }
  });

export const wooCommerceCouponCapturedPayloadV1 = z
  .object({
    kind: z.literal("coupon_captured"),
    reservationId: z.uuid(),
    orderId: z.string().min(1).max(255),
  })
  .strict();

const wooCommerceNumericId = z.string().regex(/^[1-9][0-9]{0,19}$/u);

export const wooCommerceCustomerCreatedPayloadV1 = z
  .object({
    kind: z.literal("customer_created"),
    externalCustomerId: wooCommerceNumericId,
  })
  .strict();

export const wooCommerceVerifiedProductReviewPayloadV1 = z
  .object({
    kind: z.literal("verified_product_review"),
    externalCustomerId: wooCommerceNumericId,
    reviewId: wooCommerceNumericId,
    productId: wooCommerceNumericId,
    categoryIds: z.array(wooCommerceNumericId).max(100),
  })
  .strict();

export const wooCommerceCustomerDeletedPayloadV1 = z
  .object({
    kind: z.literal("customer_deleted"),
    externalCustomerId: wooCommerceNumericId,
  })
  .strict();

function scaledBigIntOrNull(
  value: string,
  minorUnitDigits: number,
): bigint | null {
  if (!wooCommerceDecimal.safeParse(value).success) return null;
  const [, fraction = ""] = value.split(".");
  return fraction.length > minorUnitDigits
    ? null
    : decimalToScaledBigInt(value, minorUnitDigits);
}

function decimalToScaledBigInt(value: string, minorUnitDigits: number): bigint {
  const [major, fraction = ""] = value.split(".");
  if (fraction.length > minorUnitDigits) {
    throw new RangeError("WooCommerce amount has excess fractional precision");
  }
  return (
    BigInt(major!) * 10n ** BigInt(minorUnitDigits) +
    BigInt(fraction.padEnd(minorUnitDigits, "0") || "0")
  );
}

export function wooCommerceDecimalToMinor(
  value: string,
  minorUnitDigits: number,
): number {
  if (!wooCommerceDecimal.safeParse(value).success) {
    throw new TypeError(
      "WooCommerce amount must be a non-negative decimal string",
    );
  }
  if (
    !Number.isSafeInteger(minorUnitDigits) ||
    minorUnitDigits < 0 ||
    minorUnitDigits > 6
  ) {
    throw new RangeError(
      "Currency minor-unit digits must be between zero and six",
    );
  }
  const minor = decimalToScaledBigInt(value, minorUnitDigits);
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("WooCommerce amount exceeds safe integer range");
  }
  return Number(minor);
}

export type WooCommerceOrderFactV1 = z.infer<typeof wooCommerceOrderFactV1>;
export type WooCommerceOrderStatusChangedPayloadV1 = z.infer<
  typeof wooCommerceOrderStatusChangedPayloadV1
>;
export type WooCommerceOrderRefundedPayloadV1 = z.infer<
  typeof wooCommerceOrderRefundedPayloadV1
>;
export type WooCommerceCouponCapturedPayloadV1 = z.infer<
  typeof wooCommerceCouponCapturedPayloadV1
>;
export type WooCommerceCustomerCreatedPayloadV1 = z.infer<
  typeof wooCommerceCustomerCreatedPayloadV1
>;
export type WooCommerceVerifiedProductReviewPayloadV1 = z.infer<
  typeof wooCommerceVerifiedProductReviewPayloadV1
>;

const wooCommerceCouponIssuePayloadV1 = z
  .object({
    kind: z.literal("issue_coupon"),
    reservationId: z.uuid(),
    code: z.string().regex(/^SF[A-Z0-9]{20,48}$/u),
    externalCustomerId: wooCommerceNumericId,
    expiresAt: z.iso.datetime({ offset: true }),
    reward: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("fixed_discount"),
          amountMinor: z.string().regex(/^[1-9][0-9]*$/u),
          currencyMinorUnitDigits: z.int().min(0).max(6),
        })
        .strict(),
      z
        .object({
          kind: z.literal("percentage_discount"),
          percentageBasisPoints: z.int().min(1).max(10_000),
          maximumDiscountMinor: z.null(),
          currencyMinorUnitDigits: z.int().min(0).max(6),
        })
        .strict(),
      z.object({ kind: z.literal("free_shipping") }).strict(),
    ]),
  })
  .strict();

export const wooCommerceConnectorCapability = z.enum(["coupon.issue.v2"]);

const wooCommerceCouponRestrictionsCommandV2 = z
  .object({
    minimumSpendMinor: z
      .string()
      .regex(/^(?:0|[1-9][0-9]*)$/u)
      .nullable(),
    currencyMinorUnitDigits: z.int().min(0).max(6),
    productIds: z.array(wooCommerceNumericId).max(100),
    excludedProductIds: z.array(wooCommerceNumericId).max(100),
    categoryIds: z.array(wooCommerceNumericId).max(100),
    excludedCategoryIds: z.array(wooCommerceNumericId).max(100),
    excludeSaleItems: z.boolean(),
    stacking: z.enum(["exclusive", "combinable"]),
  })
  .strict()
  .superRefine((restrictions, context) => {
    for (const [includedField, excludedField] of [
      ["productIds", "excludedProductIds"],
      ["categoryIds", "excludedCategoryIds"],
    ] as const) {
      const excluded = new Set(restrictions[excludedField]);
      restrictions[includedField].forEach((value, index) => {
        if (excluded.has(value)) {
          context.addIssue({
            code: "custom",
            message: "A selector cannot be both included and excluded",
            path: [includedField, index],
          });
        }
      });
    }
  });

const wooCommerceCouponIssuePayloadV2 = z
  .object({
    kind: z.literal("issue_coupon"),
    reservationId: z.uuid(),
    code: z.string().regex(/^SF[A-Z0-9]{20,48}$/u),
    externalCustomerId: wooCommerceNumericId,
    expiresAt: z.iso.datetime({ offset: true }),
    reward: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("fixed_discount"),
          amountMinor: z.string().regex(/^[1-9][0-9]*$/u),
          currencyMinorUnitDigits: z.int().min(0).max(6),
          restrictions: wooCommerceCouponRestrictionsCommandV2,
        })
        .strict(),
      z
        .object({
          kind: z.literal("percentage_discount"),
          percentageBasisPoints: z.int().min(1).max(10_000),
          maximumDiscountMinor: z.null(),
          currencyMinorUnitDigits: z.int().min(0).max(6),
          restrictions: wooCommerceCouponRestrictionsCommandV2,
        })
        .strict(),
      z
        .object({
          kind: z.literal("free_shipping"),
          restrictions: wooCommerceCouponRestrictionsCommandV2,
        })
        .strict(),
      z
        .object({
          kind: z.literal("free_product"),
          productId: wooCommerceNumericId,
          quantity: z.int().min(1).max(10),
          restrictions: wooCommerceCouponRestrictionsCommandV2,
        })
        .strict(),
    ]),
  })
  .strict();

const wooCommerceCouponCancelPayloadV1 = z
  .object({
    kind: z.literal("cancel_coupon"),
    reservationId: z.uuid(),
    code: z.string().regex(/^SF[A-Z0-9]{20,48}$/u),
  })
  .strict();

export const wooCommerceReconcileOrderPayloadV1 = z
  .object({
    kind: z.literal("reconcile_order"),
    orderId: z.string().regex(/^[1-9][0-9]{0,18}$/u),
  })
  .strict();

export const wooCommerceConnectorCommandEnvelopeV1 = z
  .object({
    version: z.literal("1"),
    commandId: z.uuid(),
    connectionId: z.uuid(),
    topic: z.enum([
      "woocommerce.coupon.issue",
      "woocommerce.coupon.cancel",
      "woocommerce.order.reconcile",
    ]),
    payloadVersion: z.literal("v1"),
    deliveredAt: z.iso.datetime({ offset: true }),
    payload: z.discriminatedUnion("kind", [
      wooCommerceCouponIssuePayloadV1,
      wooCommerceCouponCancelPayloadV1,
      wooCommerceReconcileOrderPayloadV1,
    ]),
  })
  .strict()
  .superRefine((command, context) => {
    const expectedKind = {
      "woocommerce.coupon.issue": "issue_coupon",
      "woocommerce.coupon.cancel": "cancel_coupon",
      "woocommerce.order.reconcile": "reconcile_order",
    }[command.topic];
    if (command.payload.kind !== expectedKind) {
      context.addIssue({
        code: "custom",
        message: "Connector command topic and payload kind do not match",
        path: ["payload", "kind"],
      });
    }
  });

export const wooCommerceConnectorCommandEnvelopeV2 = z
  .object({
    version: z.literal("1"),
    commandId: z.uuid(),
    connectionId: z.uuid(),
    topic: z.literal("woocommerce.coupon.issue"),
    payloadVersion: z.literal("v2"),
    deliveredAt: z.iso.datetime({ offset: true }),
    payload: wooCommerceCouponIssuePayloadV2,
  })
  .strict();

export const wooCommerceConnectorCommandEnvelope = z.union([
  wooCommerceConnectorCommandEnvelopeV2,
  wooCommerceConnectorCommandEnvelopeV1,
]);

/** @deprecated Use the connector-wide command envelope. */
export const wooCommerceCouponCommandEnvelopeV1 =
  wooCommerceConnectorCommandEnvelopeV1;

export type WooCommerceCouponCommandEnvelopeV1 = z.infer<
  typeof wooCommerceCouponCommandEnvelopeV1
>;
export type WooCommerceConnectorCommandEnvelopeV1 = z.infer<
  typeof wooCommerceConnectorCommandEnvelopeV1
>;
export type WooCommerceConnectorCommandEnvelopeV2 = z.infer<
  typeof wooCommerceConnectorCommandEnvelopeV2
>;
export type WooCommerceConnectorCommandEnvelope = z.infer<
  typeof wooCommerceConnectorCommandEnvelope
>;

export const merchantRequestConnectorReconciliationCommandV1 = z
  .object({
    version: z.literal("1"),
    connectionId: z.uuid(),
    orderId: z.string().regex(/^[1-9][0-9]{0,18}$/u),
    reason: merchantReason,
    idempotencyKey: merchantOperationKey,
    correlationId: z.uuid(),
  })
  .strict();

export const merchantRequestConnectorReconciliationResultV1 = z
  .object({
    resourceId: z.uuid(),
    outcome: z.enum(["created", "duplicate"]),
    state: z.enum([
      "pending",
      "processing",
      "delivered",
      "retryable",
      "manual_review",
      "dead_letter",
      "cancelled",
    ]),
  })
  .strict();

export const wooCommerceCommandRequestV1 = z.discriminatedUnion("kind", [
  z
    .object({
      version: z.literal("1"),
      kind: z.literal("poll"),
      connectionId: z.uuid(),
      requestId: z.uuid(),
      batchSize: z.int().min(1).max(25).default(10),
      capabilities: z.array(wooCommerceConnectorCapability).max(16).default([]),
    })
    .strict(),
  z
    .object({
      version: z.literal("1"),
      kind: z.literal("acknowledge"),
      connectionId: z.uuid(),
      requestId: z.uuid(),
      commandId: z.uuid(),
      outcome: z.enum(["delivered", "retryable", "dead_letter", "cancelled"]),
      resultReference: z.string().min(1).max(500).nullable(),
      errorCode: z
        .string()
        .regex(/^[a-z0-9_.-]{1,100}$/u)
        .nullable(),
      retryDelaySeconds: z.int().min(0).max(86_400),
    })
    .strict(),
]);

export type WooCommerceCommandRequestV1 = z.infer<
  typeof wooCommerceCommandRequestV1
>;

export type WooCommerceSignatureHeaders = Readonly<{
  connectionId: string;
  deliveryId: string;
  timestamp: string;
  nonce: string;
  keyVersion: string;
  bodySha256: string;
  signature: string;
}>;

export type WooCommerceSignatureFailure =
  | "body_too_large"
  | "invalid_body_hash"
  | "invalid_header"
  | "invalid_signature"
  | "stale_timestamp";

export type WooCommerceSignatureResult =
  | { ok: true; bodySha256: string; timestamp: number }
  | { ok: false; reason: WooCommerceSignatureFailure };

export const wooCommerceCustomerClaimV1 = z
  .object({
    connectionId: z.uuid(),
    externalCustomerId: z.string().regex(/^[1-9][0-9]{0,19}$/u),
    issuedAt: z.string().regex(/^\d{10}$/u),
    nonce: z.uuid(),
    keyVersion: z.string().regex(/^v[1-9][0-9]*$/u),
    signature: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict();

export type WooCommerceCustomerClaimV1 = z.infer<
  typeof wooCommerceCustomerClaimV1
>;

export type WooCommerceCustomerClaimResult =
  | { ok: true; issuedAt: number }
  | {
      ok: false;
      reason: "invalid_claim" | "invalid_signature" | "stale_timestamp";
    };

const HEX_SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_TOKEN = /^[A-Za-z0-9._:-]{1,255}$/u;

export function buildWooCommerceSigningMessage(input: {
  requestTarget: string;
  connectionId: string;
  deliveryId: string;
  timestamp: string;
  nonce: string;
  bodySha256: string;
}): string {
  return [
    "starfiniti-woocommerce-v1",
    input.requestTarget,
    input.connectionId,
    input.deliveryId,
    input.timestamp,
    input.nonce,
    input.bodySha256,
  ].join("\n");
}

export function signWooCommerceDelivery(input: {
  requestTarget: string;
  connectionId: string;
  deliveryId: string;
  timestamp: string;
  nonce: string;
  rawBody: Uint8Array;
  secret: Uint8Array;
}): { bodySha256: string; signature: string } {
  const bodySha256 = createHash("sha256").update(input.rawBody).digest("hex");
  const message = buildWooCommerceSigningMessage({
    requestTarget: input.requestTarget,
    connectionId: input.connectionId,
    deliveryId: input.deliveryId,
    timestamp: input.timestamp,
    nonce: input.nonce,
    bodySha256,
  });
  const signature = createHmac("sha256", input.secret)
    .update(message)
    .digest("hex");
  return { bodySha256, signature };
}

export function buildWooCommerceCustomerClaimMessage(
  claim: Omit<WooCommerceCustomerClaimV1, "signature">,
): string {
  return [
    "starfiniti-woocommerce-customer-claim-v1",
    claim.connectionId,
    claim.externalCustomerId,
    claim.issuedAt,
    claim.nonce,
    claim.keyVersion,
  ].join("\n");
}

export function signWooCommerceCustomerClaim(input: {
  claim: Omit<WooCommerceCustomerClaimV1, "signature">;
  secret: Uint8Array;
}): string {
  return createHmac("sha256", input.secret)
    .update(buildWooCommerceCustomerClaimMessage(input.claim))
    .digest("hex");
}

export function verifyWooCommerceCustomerClaim(input: {
  claim: WooCommerceCustomerClaimV1;
  secret: Uint8Array;
  nowMs?: number;
  maxClockSkewSeconds?: number;
}): WooCommerceCustomerClaimResult {
  const parsed = wooCommerceCustomerClaimV1.safeParse(input.claim);
  if (!parsed.success) return { ok: false, reason: "invalid_claim" };

  const issuedAt = Number(parsed.data.issuedAt);
  const maxClockSkewSeconds = input.maxClockSkewSeconds ?? 300;
  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000);
  if (Math.abs(nowSeconds - issuedAt) > maxClockSkewSeconds) {
    return { ok: false, reason: "stale_timestamp" };
  }

  const { signature, ...claim } = parsed.data;
  const expectedSignature = signWooCommerceCustomerClaim({
    claim,
    secret: input.secret,
  });
  if (!safeHexEqual(signature, expectedSignature)) {
    return { ok: false, reason: "invalid_signature" };
  }

  return { ok: true, issuedAt };
}

export function verifyWooCommerceDelivery(input: {
  requestTarget: string;
  headers: WooCommerceSignatureHeaders;
  rawBody: Uint8Array;
  secret: Uint8Array;
  nowMs?: number;
  maxBodyBytes?: number;
  maxClockSkewSeconds?: number;
}): WooCommerceSignatureResult {
  const maxBodyBytes = input.maxBodyBytes ?? 1_048_576;
  if (input.rawBody.byteLength > maxBodyBytes) {
    return { ok: false, reason: "body_too_large" };
  }

  const {
    connectionId,
    deliveryId,
    timestamp,
    nonce,
    keyVersion,
    bodySha256,
    signature,
  } = input.headers;
  if (
    !z.uuid().safeParse(connectionId).success ||
    !SAFE_TOKEN.test(deliveryId) ||
    !/^\d{10}$/u.test(timestamp) ||
    !SAFE_TOKEN.test(nonce) ||
    !SAFE_TOKEN.test(keyVersion) ||
    !HEX_SHA256.test(bodySha256) ||
    !HEX_SHA256.test(signature) ||
    !input.requestTarget.startsWith("/") ||
    input.requestTarget.includes("\n")
  ) {
    return { ok: false, reason: "invalid_header" };
  }

  const timestampSeconds = Number(timestamp);
  const nowMs = input.nowMs ?? Date.now();
  const maxClockSkewSeconds = input.maxClockSkewSeconds ?? 300;
  if (
    Math.abs(Math.floor(nowMs / 1000) - timestampSeconds) > maxClockSkewSeconds
  ) {
    return { ok: false, reason: "stale_timestamp" };
  }

  const actualBodyHash = createHash("sha256")
    .update(input.rawBody)
    .digest("hex");
  if (!safeHexEqual(bodySha256, actualBodyHash)) {
    return { ok: false, reason: "invalid_body_hash" };
  }

  const message = buildWooCommerceSigningMessage({
    requestTarget: input.requestTarget,
    connectionId,
    deliveryId,
    timestamp,
    nonce,
    bodySha256,
  });
  const expectedSignature = createHmac("sha256", input.secret)
    .update(message)
    .digest("hex");
  if (!safeHexEqual(signature, expectedSignature)) {
    return { ok: false, reason: "invalid_signature" };
  }

  return { ok: true, bodySha256, timestamp: timestampSeconds };
}

function safeHexEqual(left: string, right: string): boolean {
  if (!HEX_SHA256.test(left) || !HEX_SHA256.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}
