import { signMerchantActivityDelivery } from "@starfiniti/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDatabase: vi.fn(),
  getSigningKey: vi.fn(),
}));

vi.mock("@/lib/server/database", () => ({
  getDatabase: mocks.getDatabase,
}));
vi.mock("@/lib/server/signing-material", () => ({
  getSigningKey: mocks.getSigningKey,
}));

import { POST } from "./route";

const sourceId = "10000000-0000-4000-8000-000000000001";
const secret = Buffer.alloc(32, 7);

describe("Merchant Activity event route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects oversized declared and streamed bodies before database access", async () => {
    const declared = await POST(
      new Request("https://loyalty.example.test/api/v1/activities/events", {
        method: "POST",
        headers: {
          "content-length": "65537",
          "x-starfiniti-activity-source-id": sourceId,
          "x-starfiniti-delivery-id": "delivery-1",
          "x-starfiniti-timestamp": "1786636800",
          "x-starfiniti-nonce": "nonce-1",
          "x-starfiniti-key-version": "v1",
          "x-starfiniti-body-sha256": "a".repeat(64),
          "x-starfiniti-signature": "b".repeat(64),
        },
        body: "{}",
      }),
    );
    expect(declared.status).toBe(413);
    expect(mocks.getDatabase).not.toHaveBeenCalled();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(40_000));
        controller.enqueue(new Uint8Array(30_000));
        controller.close();
      },
    });
    const streamed = await POST(
      new Request("https://loyalty.example.test/api/v1/activities/events", {
        method: "POST",
        headers: {
          "x-starfiniti-activity-source-id": sourceId,
          "x-starfiniti-delivery-id": "delivery-2",
          "x-starfiniti-timestamp": "1786636800",
          "x-starfiniti-nonce": "nonce-2",
          "x-starfiniti-key-version": "v1",
          "x-starfiniti-body-sha256": "a".repeat(64),
          "x-starfiniti-signature": "b".repeat(64),
        },
        body: stream,
        duplex: "half",
      } as RequestInit & { duplex: "half" }),
    );
    expect(streamed.status).toBe(413);
    expect(mocks.getDatabase).not.toHaveBeenCalled();
  });

  it("accepts and normalizes a valid signed activity exactly once", async () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const envelope = {
      version: "1",
      deliveryId: "delivery-1",
      sourceId,
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
    };
    const raw = new TextEncoder().encode(JSON.stringify(envelope));
    const signed = signMerchantActivityDelivery({
      requestTarget: "/api/v1/activities/events",
      sourceId,
      deliveryId: envelope.deliveryId,
      timestamp,
      nonce: "nonce-1",
      keyVersion: "v1",
      rawBody: raw,
      secret,
    });
    const query = vi.fn(async (parts: TemplateStringsArray) => {
      const text = parts.join("?");
      if (text.includes("from loyalty.commerce_connections")) {
        return [
          {
            id: "10",
            organization_id: "20",
            public_id: sourceId,
            current_key_version: "v1",
            signing_material_ref: "pool:test:v1",
          },
        ];
      }
      if (text.includes("accept_commerce_delivery")) {
        return [{ receipt_id: sourceId, outcome: "accepted" }];
      }
      if (text.includes("normalize_commerce_delivery")) {
        return [{ canonical_event_id: sourceId, outcome: "created" }];
      }
      throw new Error(`Unexpected query: ${text}`);
    });
    mocks.getDatabase.mockReturnValue(query);
    mocks.getSigningKey.mockReturnValue(secret);

    const response = await POST(
      new Request("https://loyalty.example.test/api/v1/activities/events", {
        method: "POST",
        headers: {
          "x-starfiniti-activity-source-id": sourceId,
          "x-starfiniti-delivery-id": envelope.deliveryId,
          "x-starfiniti-timestamp": timestamp,
          "x-starfiniti-nonce": "nonce-1",
          "x-starfiniti-key-version": "v1",
          "x-starfiniti-body-sha256": signed.bodySha256,
          "x-starfiniti-signature": signed.signature,
        },
        body: raw,
      }),
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      outcome: "accepted",
      normalization: { outcome: "created" },
    });
    expect(query).toHaveBeenCalledTimes(3);
  });
});
