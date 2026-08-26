import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";

import {
  stripeBillingWebhookEventTypeV1,
  stripeBillingWebhookEventV1,
  type StripeBillingWebhookEventV1,
  type StripeSubscriptionStatusV1,
} from "@starfiniti/contracts/billing";

export const STRIPE_BILLING_WEBHOOK_MAX_BODY_BYTES = 262_144;
export const STRIPE_BILLING_WEBHOOK_TOLERANCE_SECONDS = 300;

const STRIPE_SECRET = /^whsec_[A-Za-z0-9]{16,249}$/u;
const STRIPE_SIGNATURE = /^[a-f0-9]{64}$/u;
const STRIPE_CUSTOMER = /^cus_[A-Za-z0-9]{8,120}$/u;
const STRIPE_SUBSCRIPTION = /^sub_[A-Za-z0-9]{8,120}$/u;
const STRIPE_INVOICE = /^in_[A-Za-z0-9]{8,120}$/u;

export type StripeWebhookVerification = Readonly<{
  signatureCreatedAt: string;
  bodySha256: string;
}>;

export type StripeWebhookVerificationFailure =
  | "invalid_signature_header"
  | "invalid_signature"
  | "signature_outside_tolerance"
  | "signing_secret_unavailable";

export class StripeBillingWebhookError extends Error {
  readonly code:
    | StripeWebhookVerificationFailure
    | "invalid_json"
    | "invalid_event"
    | "unsupported_event";

  constructor(code: StripeBillingWebhookError["code"]) {
    super(code);
    this.name = "StripeBillingWebhookError";
    this.code = code;
  }
}

export function verifyStripeBillingWebhook(input: {
  rawBody: Uint8Array;
  signatureHeader: string | null;
  secret: string;
  now?: Date;
  toleranceSeconds?: number;
}): StripeWebhookVerification {
  if (!STRIPE_SECRET.test(input.secret)) {
    throw new StripeBillingWebhookError("signing_secret_unavailable");
  }
  const tolerance =
    input.toleranceSeconds ?? STRIPE_BILLING_WEBHOOK_TOLERANCE_SECONDS;
  if (!Number.isSafeInteger(tolerance) || tolerance < 1 || tolerance > 900) {
    throw new StripeBillingWebhookError("invalid_signature_header");
  }
  const parsed = parseStripeSignatureHeader(input.signatureHeader);
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1_000);
  if (Math.abs(nowSeconds - parsed.timestamp) > tolerance) {
    throw new StripeBillingWebhookError("signature_outside_tolerance");
  }

  const expected = createHmac("sha256", input.secret)
    .update(`${parsed.timestamp}.`, "utf8")
    .update(input.rawBody)
    .digest();
  const valid = parsed.signatures.some((candidate) => {
    const supplied = Buffer.from(candidate, "hex");
    return (
      supplied.byteLength === expected.byteLength &&
      timingSafeEqual(supplied, expected)
    );
  });
  if (!valid) throw new StripeBillingWebhookError("invalid_signature");

  return {
    signatureCreatedAt: new Date(parsed.timestamp * 1_000).toISOString(),
    bodySha256: createHash("sha256").update(input.rawBody).digest("hex"),
  };
}

export function normalizeStripeBillingWebhook(
  rawBody: Uint8Array,
  verification: StripeWebhookVerification,
): StripeBillingWebhookEventV1 {
  let value: unknown;
  try {
    value = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(rawBody),
    );
  } catch {
    throw new StripeBillingWebhookError("invalid_json");
  }
  if (
    !isRecord(value) ||
    !isRecord(value.data) ||
    !isRecord(value.data.object)
  ) {
    throw new StripeBillingWebhookError("invalid_event");
  }
  const eventType = stripeBillingWebhookEventTypeV1.safeParse(value.type);
  if (!eventType.success) {
    throw new StripeBillingWebhookError("unsupported_event");
  }
  if (
    value.object !== "event" ||
    typeof value.id !== "string" ||
    typeof value.livemode !== "boolean"
  ) {
    throw new StripeBillingWebhookError("invalid_event");
  }
  const eventCreatedAt = unixInstant(value.created);
  const object = value.data.object;
  if (
    typeof object.id !== "string" ||
    typeof object.customer !== "string" ||
    !STRIPE_CUSTOMER.test(object.customer)
  ) {
    throw new StripeBillingWebhookError("invalid_event");
  }

  const isSubscription = eventType.data.startsWith("customer.subscription.");
  let subscriptionId: string | null;
  let subscriptionStatus: StripeSubscriptionStatusV1 | null;
  let currentPeriodEndsAt: string | null;
  let trialEndsAt: string | null;

  if (isSubscription) {
    if (
      object.object !== "subscription" ||
      !STRIPE_SUBSCRIPTION.test(object.id) ||
      typeof object.status !== "string"
    ) {
      throw new StripeBillingWebhookError("invalid_event");
    }
    subscriptionId = object.id;
    subscriptionStatus = parseSubscriptionStatus(object.status);
    currentPeriodEndsAt = futureInstantOrNull(
      subscriptionPeriodEnd(object),
      eventCreatedAt,
    );
    trialEndsAt = optionalUnixInstant(object.trial_end);
  } else {
    if (object.object !== "invoice" || !STRIPE_INVOICE.test(object.id)) {
      throw new StripeBillingWebhookError("invalid_event");
    }
    subscriptionId = invoiceSubscriptionId(object);
    subscriptionStatus = null;
    currentPeriodEndsAt = null;
    trialEndsAt = null;
  }

  const parsed = stripeBillingWebhookEventV1.safeParse({
    schemaVersion: "1",
    eventId: value.id,
    eventType: eventType.data,
    liveMode: value.livemode,
    objectId: object.id,
    customerId: object.customer,
    subscriptionId,
    subscriptionStatus,
    eventCreatedAt,
    currentPeriodEndsAt,
    trialEndsAt,
    signatureCreatedAt: verification.signatureCreatedAt,
    bodySha256: verification.bodySha256,
  });
  if (!parsed.success) throw new StripeBillingWebhookError("invalid_event");
  return parsed.data;
}

export function readStripeBillingWebhookSecret(
  path = process.env.LOYALTY_STRIPE_WEBHOOK_SECRET_FILE,
): string {
  if (!path || !isAbsolute(path)) {
    throw new StripeBillingWebhookError("signing_secret_unavailable");
  }
  let secret: string;
  try {
    const metadata = statSync(path);
    if (!metadata.isFile() || metadata.size < 22 || metadata.size > 256) {
      throw new Error("invalid secret file");
    }
    secret = readFileSync(path, "utf8").trim();
  } catch {
    throw new StripeBillingWebhookError("signing_secret_unavailable");
  }
  if (!STRIPE_SECRET.test(secret)) {
    throw new StripeBillingWebhookError("signing_secret_unavailable");
  }
  return secret;
}

function parseStripeSignatureHeader(value: string | null): {
  timestamp: number;
  signatures: readonly string[];
} {
  if (!value || value.length > 2_048 || /[\r\n]/u.test(value)) {
    throw new StripeBillingWebhookError("invalid_signature_header");
  }
  const timestamps: string[] = [];
  const signatures: string[] = [];
  for (const member of value.split(",")) {
    const separator = member.indexOf("=");
    if (separator <= 0) continue;
    const key = member.slice(0, separator).trim();
    const candidate = member.slice(separator + 1).trim();
    if (key === "t") timestamps.push(candidate);
    if (key === "v1" && STRIPE_SIGNATURE.test(candidate)) {
      signatures.push(candidate);
    }
  }
  if (
    timestamps.length !== 1 ||
    !/^\d{10}$/u.test(timestamps[0] ?? "") ||
    signatures.length < 1 ||
    signatures.length > 8
  ) {
    throw new StripeBillingWebhookError("invalid_signature_header");
  }
  const timestamp = Number(timestamps[0]);
  if (!Number.isSafeInteger(timestamp)) {
    throw new StripeBillingWebhookError("invalid_signature_header");
  }
  return { timestamp, signatures };
}

function parseSubscriptionStatus(value: string): StripeSubscriptionStatusV1 {
  if (
    value === "incomplete" ||
    value === "incomplete_expired" ||
    value === "trialing" ||
    value === "active" ||
    value === "past_due" ||
    value === "canceled" ||
    value === "unpaid" ||
    value === "paused"
  ) {
    return value;
  }
  throw new StripeBillingWebhookError("invalid_event");
}

function invoiceSubscriptionId(object: Record<string, unknown>): string | null {
  if (typeof object.subscription === "string") {
    if (!STRIPE_SUBSCRIPTION.test(object.subscription)) {
      throw new StripeBillingWebhookError("invalid_event");
    }
    return object.subscription;
  }
  if (object.subscription !== undefined && object.subscription !== null) {
    throw new StripeBillingWebhookError("invalid_event");
  }
  if (!isRecord(object.parent)) return null;
  const details = object.parent.subscription_details;
  if (!isRecord(details)) return null;
  const subscription = details.subscription;
  if (subscription === null || subscription === undefined) return null;
  if (
    typeof subscription !== "string" ||
    !STRIPE_SUBSCRIPTION.test(subscription)
  ) {
    throw new StripeBillingWebhookError("invalid_event");
  }
  return subscription;
}

function subscriptionPeriodEnd(object: Record<string, unknown>): string | null {
  if (object.current_period_end !== undefined) {
    return optionalUnixInstant(object.current_period_end);
  }
  if (!isRecord(object.items) || !Array.isArray(object.items.data)) return null;
  const instants = object.items.data.map((item) => {
    if (!isRecord(item)) throw new StripeBillingWebhookError("invalid_event");
    return unixSeconds(item.current_period_end);
  });
  return instants.length === 0
    ? null
    : new Date(Math.max(...instants) * 1_000).toISOString();
}

function optionalUnixInstant(value: unknown): string | null {
  return value === null || value === undefined ? null : unixInstant(value);
}

function futureInstantOrNull(
  candidate: string | null,
  reference: string,
): string | null {
  return candidate !== null && Date.parse(candidate) > Date.parse(reference)
    ? candidate
    : null;
}

function unixInstant(value: unknown): string {
  return new Date(unixSeconds(value) * 1_000).toISOString();
}

function unixSeconds(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1_262_304_000 ||
    value > 4_102_444_800
  ) {
    throw new StripeBillingWebhookError("invalid_event");
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
