import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const canonicalCommerceEventTypes = [
  "commerce.order.upserted",
  "commerce.order.status_changed",
  "commerce.order.refunded",
  "commerce.customer.upserted",
  "commerce.customer.deleted",
  "commerce.product.upserted",
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
    lines: z.array(wooCommerceOrderLineV1),
    shippingTotal: wooCommerceDecimal,
    taxTotal: wooCommerceDecimal,
    feeTotal: wooCommerceDecimal,
    discountTotal: wooCommerceDecimal,
    refundedTotal: wooCommerceDecimal,
  })
  .strict()
  .superRefine((order, context) => {
    const orderAmounts = [
      "shippingTotal",
      "taxTotal",
      "feeTotal",
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
