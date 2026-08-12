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
