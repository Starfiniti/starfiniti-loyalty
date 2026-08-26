import { createHmac } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  normalizeStripeBillingWebhook,
  readStripeBillingWebhookSecret,
  StripeBillingWebhookError,
  verifyStripeBillingWebhook,
} from "./stripe-billing-webhook";

const secret = "whsec_0123456789abcdef0123456789abcdef";
const now = new Date("2026-08-26T20:00:00.000Z");
const timestamp = Math.floor(now.getTime() / 1_000);
const encoder = new TextEncoder();
const temporaryDirectories: string[] = [];

function subscriptionEvent(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "evt_StripeWebhook0001",
    object: "event",
    created: timestamp - 1,
    livemode: false,
    type: "customer.subscription.updated",
    data: {
      object: {
        id: "sub_StripeWebhook0001",
        object: "subscription",
        customer: "cus_StripeWebhook0001",
        status: "trialing",
        current_period_end: timestamp + 86_400,
        trial_end: timestamp + 43_200,
        customer_email: "discard@example.test",
        metadata: { private: "discard" },
      },
    },
    ...overrides,
  };
}

function encode(value: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(value));
}

function signature(rawBody: Uint8Array, signedAt = timestamp): string {
  const digest = createHmac("sha256", secret)
    .update(`${signedAt}.`, "utf8")
    .update(rawBody)
    .digest("hex");
  return `t=${signedAt},v1=${digest}`;
}

function verify(rawBody: Uint8Array, header = signature(rawBody)) {
  return verifyStripeBillingWebhook({
    rawBody,
    signatureHeader: header,
    secret,
    now,
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Stripe billing webhook verification", () => {
  it("verifies exact raw bytes and returns only timestamp and digest evidence", () => {
    const rawBody = encode(subscriptionEvent());
    expect(verify(rawBody)).toEqual({
      signatureCreatedAt: now.toISOString(),
      bodySha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
  });

  it("accepts one matching v1 value during signing-secret rotation", () => {
    const rawBody = encode(subscriptionEvent());
    const valid = signature(rawBody).split("v1=")[1];
    expect(
      verify(rawBody, `t=${timestamp},v1=${"a".repeat(64)},v1=${valid}`),
    ).toBeDefined();
  });

  it("fails closed for changed bytes, wrong secrets, and malformed headers", () => {
    const rawBody = encode(subscriptionEvent());
    expect(() =>
      verify(
        encoder.encode(`${new TextDecoder().decode(rawBody)} `),
        signature(rawBody),
      ),
    ).toThrowError("invalid_signature");
    expect(() =>
      verifyStripeBillingWebhook({
        rawBody,
        signatureHeader: signature(rawBody),
        secret: "whsec_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        now,
      }),
    ).toThrowError("invalid_signature");
    for (const header of [
      null,
      `t=${timestamp},t=${timestamp},v1=${"a".repeat(64)}`,
      `t=${timestamp},v1=not-hex`,
      `t=${timestamp}\r\nv1=${"a".repeat(64)}`,
      `t=${timestamp},${Array.from({ length: 9 }, () => `v1=${"a".repeat(64)}`).join(",")}`,
    ]) {
      expect(() =>
        verifyStripeBillingWebhook({
          rawBody,
          signatureHeader: header,
          secret,
          now,
        }),
      ).toThrowError("invalid_signature_header");
    }
  });

  it("rejects timestamps beyond the five-minute replay window", () => {
    const rawBody = encode(subscriptionEvent());
    for (const signedAt of [timestamp - 301, timestamp + 301]) {
      expect(() => verify(rawBody, signature(rawBody, signedAt))).toThrowError(
        "signature_outside_tolerance",
      );
    }
    expect(() =>
      verify(rawBody, signature(rawBody, timestamp - 300)),
    ).not.toThrow();
  });
});

describe("Stripe billing webhook minimization", () => {
  it("normalizes subscription evidence and discards metadata and contact data", () => {
    const rawBody = encode(subscriptionEvent());
    const normalized = normalizeStripeBillingWebhook(rawBody, verify(rawBody));
    expect(normalized).toEqual({
      schemaVersion: "1",
      eventId: "evt_StripeWebhook0001",
      eventType: "customer.subscription.updated",
      liveMode: false,
      objectId: "sub_StripeWebhook0001",
      customerId: "cus_StripeWebhook0001",
      subscriptionId: "sub_StripeWebhook0001",
      subscriptionStatus: "trialing",
      eventCreatedAt: new Date((timestamp - 1) * 1_000).toISOString(),
      currentPeriodEndsAt: new Date((timestamp + 86_400) * 1_000).toISOString(),
      trialEndsAt: new Date((timestamp + 43_200) * 1_000).toISOString(),
      signatureCreatedAt: now.toISOString(),
      bodySha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
    expect(JSON.stringify(normalized)).not.toMatch(/email|metadata|private/u);
  });

  it("derives the latest period end from current Stripe subscription items", () => {
    const event = subscriptionEvent();
    const object = (event.data as { object: Record<string, unknown> }).object;
    delete object.current_period_end;
    object.status = "active";
    object.trial_end = null;
    object.items = {
      data: [
        { current_period_end: timestamp + 7_200 },
        { current_period_end: timestamp + 10_800 },
      ],
    };
    const rawBody = encode(event);
    expect(
      normalizeStripeBillingWebhook(rawBody, verify(rawBody))
        .currentPeriodEndsAt,
    ).toBe(new Date((timestamp + 10_800) * 1_000).toISOString());
  });

  it("discards a terminal subscription period that is no longer future evidence", () => {
    const event = subscriptionEvent({
      type: "customer.subscription.deleted",
    });
    const object = (event.data as { object: Record<string, unknown> }).object;
    object.status = "canceled";
    object.current_period_end = timestamp - 1;
    object.trial_end = null;
    const rawBody = encode(event);
    expect(
      normalizeStripeBillingWebhook(rawBody, verify(rawBody)),
    ).toMatchObject({
      eventType: "customer.subscription.deleted",
      subscriptionStatus: "canceled",
      currentPeriodEndsAt: null,
    });
  });

  it("accepts current and legacy invoice subscription references as observations", () => {
    for (const invoice of [
      { subscription: "sub_StripeWebhook0001" },
      {
        parent: {
          subscription_details: { subscription: "sub_StripeWebhook0001" },
        },
      },
    ]) {
      const rawBody = encode(
        subscriptionEvent({
          id: "evt_StripeWebhook0002",
          type: "invoice.payment_failed",
          data: {
            object: {
              id: "in_StripeWebhook0001",
              object: "invoice",
              customer: "cus_StripeWebhook0001",
              amount_due: 123_456,
              customer_email: "discard@example.test",
              ...invoice,
            },
          },
        }),
      );
      expect(
        normalizeStripeBillingWebhook(rawBody, verify(rawBody)),
      ).toMatchObject({
        objectId: "in_StripeWebhook0001",
        subscriptionId: "sub_StripeWebhook0001",
        subscriptionStatus: null,
        currentPeriodEndsAt: null,
        trialEndsAt: null,
      });
    }
  });

  it("rejects unsupported, expanded-authority, and invalid lifecycle objects", () => {
    const expandedCustomer = subscriptionEvent();
    (
      expandedCustomer.data as { object: Record<string, unknown> }
    ).object.customer = {
      id: "cus_StripeWebhook0001",
    };
    const invalidTrial = subscriptionEvent();
    (
      invalidTrial.data as { object: Record<string, unknown> }
    ).object.trial_end = null;

    for (const [event, code] of [
      [subscriptionEvent({ type: "customer.created" }), "unsupported_event"],
      [expandedCustomer, "invalid_event"],
      [invalidTrial, "invalid_event"],
      [{ nope: true }, "invalid_event"],
    ] as const) {
      const rawBody = encode(event);
      expect(() =>
        normalizeStripeBillingWebhook(rawBody, verify(rawBody)),
      ).toThrowError(code);
    }
  });
});

describe("Stripe billing webhook signing secret", () => {
  it("reads one bounded absolute regular file", () => {
    const directory = mkdtempSync(join(tmpdir(), "starfiniti-stripe-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "webhook-secret");
    writeFileSync(path, `${secret}\n`, { encoding: "utf8", mode: 0o600 });
    expect(readStripeBillingWebhookSecret(path)).toBe(secret);
  });

  it("rejects missing, relative, directory, malformed, and oversized material", () => {
    const directory = mkdtempSync(join(tmpdir(), "starfiniti-stripe-"));
    temporaryDirectories.push(directory);
    const nested = join(directory, "nested");
    mkdirSync(nested);
    const malformed = join(directory, "malformed");
    writeFileSync(malformed, "not-a-stripe-secret");
    const oversized = join(directory, "oversized");
    writeFileSync(oversized, `whsec_${"a".repeat(300)}`);

    for (const path of [
      undefined,
      "relative-secret",
      nested,
      malformed,
      oversized,
      join(directory, "missing"),
    ]) {
      expect(() => readStripeBillingWebhookSecret(path)).toThrowError(
        StripeBillingWebhookError,
      );
    }
  });
});
