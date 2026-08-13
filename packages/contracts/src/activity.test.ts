import { describe, expect, it } from "vitest";
import {
  merchantActivityDeliveryEnvelopeV1,
  merchantActivityPayloadV1,
  merchantActivitySourcePackageV1,
  signMerchantActivityDelivery,
  verifyMerchantActivityDelivery,
} from "./activity";

const body = new TextEncoder().encode('{"version":"1"}');
const secret = Buffer.alloc(32, 7);
const headers = {
  sourceId: "10000000-0000-4000-8000-000000000001",
  deliveryId: "delivery-1",
  timestamp: "1786636800",
  nonce: "nonce-1",
  keyVersion: "v1",
};

describe("Merchant Activity API v1", () => {
  it("accepts strict PII-free built-in and custom facts", () => {
    expect(
      merchantActivityPayloadV1.parse({
        kind: "activity",
        source: "birthday",
        customerId: "20000000-0000-4000-8000-000000000001",
        activityCode: "birthday",
        productId: null,
        categoryIds: [],
      }),
    ).toBeTruthy();
    expect(
      merchantActivityDeliveryEnvelopeV1.parse({
        version: "1",
        deliveryId: "delivery-1",
        sourceId: headers.sourceId,
        eventId: "crm:consultation:42",
        occurredAt: "2026-08-13T12:00:00Z",
        deliveredAt: "2026-08-13T12:00:01Z",
        payload: {
          kind: "activity",
          source: "custom_activity",
          customerId: "20000000-0000-4000-8000-000000000001",
          activityCode: "consultation",
          productId: null,
          categoryIds: [],
        },
      }),
    ).toBeTruthy();
  });

  it("rejects browser-like PII and invalid source-specific selectors", () => {
    expect(() =>
      merchantActivityPayloadV1.parse({
        kind: "activity",
        source: "birthday",
        customerId: "20000000-0000-4000-8000-000000000001",
        activityCode: "birthday",
        productId: null,
        categoryIds: [],
        email: "secret@example.test",
      }),
    ).toThrow();
    expect(() =>
      merchantActivityPayloadV1.parse({
        kind: "activity",
        source: "verified_product_review",
        customerId: "20000000-0000-4000-8000-000000000001",
        activityCode: "verified_product_review",
        productId: null,
        categoryIds: [],
      }),
    ).toThrow("product selector");
    expect(() =>
      merchantActivityPayloadV1.parse({
        kind: "activity",
        source: "account_created",
        customerId: "20000000-0000-4000-8000-000000000001",
        activityCode: "custom_code",
        productId: null,
        categoryIds: [],
      }),
    ).toThrow("canonical code");
  });

  it("purpose-binds the source, key version, request target, and raw bytes", () => {
    const signed = signMerchantActivityDelivery({
      requestTarget: "/api/v1/activities/events",
      ...headers,
      rawBody: body,
      secret,
    });
    expect(
      verifyMerchantActivityDelivery({
        requestTarget: "/api/v1/activities/events",
        headers: { ...headers, ...signed },
        rawBody: body,
        secret,
        nowMs: 1_786_636_800_000,
      }),
    ).toMatchObject({ ok: true });
    expect(
      verifyMerchantActivityDelivery({
        requestTarget: "/api/v1/activities/events",
        headers: { ...headers, keyVersion: "v2", ...signed },
        rawBody: body,
        secret,
        nowMs: 1_786_636_800_000,
      }),
    ).toEqual({ ok: false, reason: "invalid_signature" });
  });

  it("rejects stale, oversized, and changed deliveries", () => {
    const signed = signMerchantActivityDelivery({
      requestTarget: "/api/v1/activities/events",
      ...headers,
      rawBody: body,
      secret,
    });
    expect(
      verifyMerchantActivityDelivery({
        requestTarget: "/api/v1/activities/events",
        headers: { ...headers, ...signed },
        rawBody: body,
        secret,
        nowMs: 1_786_637_200_000,
      }),
    ).toEqual({ ok: false, reason: "stale_timestamp" });
    expect(
      verifyMerchantActivityDelivery({
        requestTarget: "/api/v1/activities/events",
        headers: { ...headers, ...signed },
        rawBody: new TextEncoder().encode("changed"),
        secret,
        nowMs: 1_786_636_800_000,
      }),
    ).toEqual({ ok: false, reason: "invalid_body_hash" });
    expect(
      verifyMerchantActivityDelivery({
        requestTarget: "/api/v1/activities/events",
        headers: { ...headers, ...signed },
        rawBody: body,
        secret,
        maxBodyBytes: 1,
      }),
    ).toEqual({ ok: false, reason: "body_too_large" });
  });

  it("requires a canonical HTTPS one-time package", () => {
    expect(
      merchantActivitySourcePackageV1.parse({
        version: "1",
        endpoint: "https://loyalty.starfiniti.com/api/v1/activities/events",
        sourceId: headers.sourceId,
        keyVersion: "v1",
        signingKey: secret.toString("base64"),
      }),
    ).toBeTruthy();
    expect(() =>
      merchantActivitySourcePackageV1.parse({
        version: "1",
        endpoint: "http://localhost/api/v1/activities/events",
        sourceId: headers.sourceId,
        keyVersion: "v1",
        signingKey: secret.toString("base64"),
      }),
    ).toThrow();
  });
});
