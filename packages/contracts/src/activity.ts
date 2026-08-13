import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const safeToken = /^[A-Za-z0-9._:-]{1,255}$/u;
const hexSha256 = /^[a-f0-9]{64}$/u;
const activityCode = z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/u);
const resourceSelector = z.string().trim().min(1).max(255);
const base64SigningKey = z.string().refine((value) => {
  if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(value)) return false;
  try {
    return Buffer.from(value, "base64").byteLength >= 32;
  } catch {
    return false;
  }
}, "Use a base64 signing key containing at least 32 bytes");

export const merchantActivitySourceV1 = z.enum([
  "account_created",
  "birthday",
  "verified_product_review",
  "referral",
  "custom_activity",
]);

export const merchantActivityPayloadV1 = z
  .object({
    kind: z.literal("activity"),
    source: merchantActivitySourceV1,
    customerId: z.uuid(),
    activityCode,
    productId: resourceSelector.nullable(),
    categoryIds: z.array(resourceSelector).max(100),
  })
  .strict()
  .superRefine((payload, context) => {
    const canonicalCode =
      payload.source === "custom_activity" ? null : payload.source;
    if (canonicalCode !== null && payload.activityCode !== canonicalCode) {
      context.addIssue({
        code: "custom",
        message: "Built-in activity sources require their canonical code",
        path: ["activityCode"],
      });
    }
    if (
      payload.source === "verified_product_review" &&
      payload.productId === null
    ) {
      context.addIssue({
        code: "custom",
        message: "Verified product reviews require a product selector",
        path: ["productId"],
      });
    }
    if (
      payload.source !== "verified_product_review" &&
      (payload.productId !== null || payload.categoryIds.length > 0)
    ) {
      context.addIssue({
        code: "custom",
        message: "Only verified product reviews may include product selectors",
        path: ["productId"],
      });
    }
  });

export const merchantActivityDeliveryEnvelopeV1 = z
  .object({
    version: z.literal("1"),
    deliveryId: z.string().regex(safeToken),
    sourceId: z.uuid(),
    eventId: z.string().regex(safeToken),
    occurredAt: z.iso.datetime({ offset: true }),
    deliveredAt: z.iso.datetime({ offset: true }),
    correlationId: z.uuid().nullable().optional(),
    payload: merchantActivityPayloadV1,
  })
  .strict();

export const merchantProvisionActivitySourceCommandV1 = z
  .object({
    version: z.literal("1"),
    workspaceId: z.uuid(),
    programmeId: z.uuid(),
    displayName: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(/^[^\u0000-\u001f\u007f]+$/u),
    idempotencyKey: z.string().trim().min(1).max(255),
    correlationId: z.uuid(),
  })
  .strict();

export const merchantProvisionActivitySourceResultV1 = z
  .object({
    resourceId: z.uuid(),
    keyVersion: z.string().regex(/^v[1-9][0-9]*$/u),
    outcome: z.enum(["created", "duplicate"]),
  })
  .strict();

export const merchantActivitySourcePackageV1 = z
  .object({
    version: z.literal("1"),
    endpoint: z
      .url({ protocol: /^https$/u, hostname: z.regexes.hostname })
      .refine((value) => {
        const parsed = new URL(value);
        return (
          parsed.username === "" &&
          parsed.password === "" &&
          parsed.search === "" &&
          parsed.hash === "" &&
          parsed.pathname.endsWith("/api/v1/activities/events")
        );
      }, "Use the HTTPS Merchant Activity endpoint"),
    sourceId: z.uuid(),
    keyVersion: z.string().regex(/^v[1-9][0-9]*$/u),
    signingKey: base64SigningKey,
  })
  .strict();

export type MerchantActivityPayloadV1 = z.infer<
  typeof merchantActivityPayloadV1
>;
export type MerchantActivityDeliveryEnvelopeV1 = z.infer<
  typeof merchantActivityDeliveryEnvelopeV1
>;
export type MerchantProvisionActivitySourceCommandV1 = z.infer<
  typeof merchantProvisionActivitySourceCommandV1
>;
export type MerchantActivitySourcePackageV1 = z.infer<
  typeof merchantActivitySourcePackageV1
>;

export type MerchantActivitySignatureHeaders = Readonly<{
  sourceId: string;
  deliveryId: string;
  timestamp: string;
  nonce: string;
  keyVersion: string;
  bodySha256: string;
  signature: string;
}>;

export type MerchantActivitySignatureResult =
  | Readonly<{ ok: true; bodySha256: string; timestamp: number }>
  | Readonly<{
      ok: false;
      reason:
        | "body_too_large"
        | "invalid_header"
        | "stale_timestamp"
        | "invalid_body_hash"
        | "invalid_signature";
    }>;

export function buildMerchantActivitySigningMessage(input: {
  requestTarget: string;
  sourceId: string;
  deliveryId: string;
  timestamp: string;
  nonce: string;
  keyVersion: string;
  bodySha256: string;
}): string {
  return [
    "starfiniti-merchant-activity-delivery-v1",
    input.requestTarget,
    input.sourceId,
    input.deliveryId,
    input.timestamp,
    input.nonce,
    input.keyVersion,
    input.bodySha256,
  ].join("\n");
}

export function signMerchantActivityDelivery(input: {
  requestTarget: string;
  sourceId: string;
  deliveryId: string;
  timestamp: string;
  nonce: string;
  keyVersion: string;
  rawBody: Uint8Array;
  secret: Uint8Array;
}): Readonly<{ bodySha256: string; signature: string }> {
  const bodySha256 = createHash("sha256").update(input.rawBody).digest("hex");
  const message = buildMerchantActivitySigningMessage({
    ...input,
    bodySha256,
  });
  return {
    bodySha256,
    signature: createHmac("sha256", input.secret).update(message).digest("hex"),
  };
}

export function verifyMerchantActivityDelivery(input: {
  requestTarget: string;
  headers: MerchantActivitySignatureHeaders;
  rawBody: Uint8Array;
  secret: Uint8Array;
  nowMs?: number;
  maxBodyBytes?: number;
  maxClockSkewSeconds?: number;
}): MerchantActivitySignatureResult {
  const maxBodyBytes = input.maxBodyBytes ?? 65_536;
  if (input.rawBody.byteLength > maxBodyBytes) {
    return { ok: false, reason: "body_too_large" };
  }
  const { sourceId, deliveryId, timestamp, nonce, keyVersion, bodySha256 } =
    input.headers;
  if (
    !z.uuid().safeParse(sourceId).success ||
    !safeToken.test(deliveryId) ||
    !/^\d{10}$/u.test(timestamp) ||
    !safeToken.test(nonce) ||
    !/^v[1-9][0-9]*$/u.test(keyVersion) ||
    !hexSha256.test(bodySha256) ||
    !hexSha256.test(input.headers.signature) ||
    !input.requestTarget.startsWith("/") ||
    input.requestTarget.includes("\n")
  ) {
    return { ok: false, reason: "invalid_header" };
  }
  const timestampSeconds = Number(timestamp);
  const nowMs = input.nowMs ?? Date.now();
  if (
    Math.abs(Math.floor(nowMs / 1000) - timestampSeconds) >
    (input.maxClockSkewSeconds ?? 300)
  ) {
    return { ok: false, reason: "stale_timestamp" };
  }
  const actualHash = createHash("sha256").update(input.rawBody).digest("hex");
  if (!safeHexEqual(bodySha256, actualHash)) {
    return { ok: false, reason: "invalid_body_hash" };
  }
  const expected = createHmac("sha256", input.secret)
    .update(
      buildMerchantActivitySigningMessage({
        requestTarget: input.requestTarget,
        sourceId,
        deliveryId,
        timestamp,
        nonce,
        keyVersion,
        bodySha256,
      }),
    )
    .digest("hex");
  if (!safeHexEqual(input.headers.signature, expected)) {
    return { ok: false, reason: "invalid_signature" };
  }
  return { ok: true, bodySha256, timestamp: timestampSeconds };
}

function safeHexEqual(left: string, right: string): boolean {
  if (!hexSha256.test(left) || !hexSha256.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}
