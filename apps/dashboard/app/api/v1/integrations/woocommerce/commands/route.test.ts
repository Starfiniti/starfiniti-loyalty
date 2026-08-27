import { signWooCommerceDelivery } from "@starfiniti/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDatabase: vi.fn(),
  getWooCommerceSigningKey: vi.fn(),
}));

vi.mock("@/lib/server/database", () => ({
  getDatabase: mocks.getDatabase,
}));
vi.mock("@/lib/server/signing-material", () => ({
  getWooCommerceSigningKey: mocks.getWooCommerceSigningKey,
}));

import { POST } from "./route";

const connectionId = "62000000-0000-4000-8000-000000000001";
const requestId = "61000000-0000-4000-8000-000000000011";
const commandId = "61000000-0000-4000-8000-000000000010";
const secret = Buffer.alloc(32, 11);

describe("WooCommerce connector command route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queues requested local snapshots before claiming a strict command", async () => {
    const poll = {
      version: "1",
      kind: "poll",
      connectionId,
      requestId,
      batchSize: 10,
      capabilities: ["coupon.issue.v2", "customer_experience.snapshot.v1"],
      snapshotCustomerIds: ["7"],
    };
    const raw = new TextEncoder().encode(JSON.stringify(poll));
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signed = signWooCommerceDelivery({
      requestTarget: "/api/v1/integrations/woocommerce/commands",
      connectionId,
      deliveryId: requestId,
      timestamp,
      nonce: "snapshot-poll-1",
      rawBody: raw,
      secret,
    });
    const query = Object.assign(
      vi.fn(async (parts: TemplateStringsArray) => {
        const text = parts.join("?");
        if (text.includes("from loyalty.commerce_connections")) {
          return [
            {
              public_id: connectionId,
              current_key_version: "v1",
              signing_material_ref: "pool:test:v1",
            },
          ];
        }
        if (text.includes("queue_woocommerce_customer_snapshots_v1")) {
          return [
            {
              command_id: commandId,
              external_customer_id: "7",
              revision: "1",
              outcome: "created",
            },
          ];
        }
        if (text.includes("claim_woocommerce_commands")) {
          return [
            {
              command_id: commandId,
              connection_id: connectionId,
              topic: "woocommerce.customer_experience.put",
              payload_version: "v1",
              payload: {
                kind: "put_customer_experience_snapshot",
                snapshot: {
                  version: "1",
                  revision: "1",
                  externalCustomerId: "7",
                  generatedAt: "2026-08-25T10:00:00Z",
                  refreshAfter: "2026-08-25T10:15:00Z",
                  staleAfter: "2026-08-26T10:00:00Z",
                  accountStatus: "ready",
                  enhancementsEnabled: true,
                  programmeName: "Starfiniti Loyalty",
                  balances: {
                    pending: "30",
                    available: "150",
                    reserved: "20",
                  },
                  currentTier: { name: "Bloom" },
                  nextExpiry: null,
                  earningMethods: [
                    { name: "Eligible purchases", availableNow: true },
                  ],
                  rewards: [
                    {
                      name: "Free shipping",
                      kind: "free_shipping",
                      costPoints: "100",
                      affordable: true,
                    },
                  ],
                },
              },
            },
          ];
        }
        throw new Error(`Unexpected query: ${text}`);
      }),
      { array: vi.fn((values: readonly string[]) => values) },
    );
    mocks.getDatabase.mockReturnValue(query);
    mocks.getWooCommerceSigningKey.mockReturnValue(secret);

    const response = await POST(
      new Request(
        "https://loyalty.example.test/api/v1/integrations/woocommerce/commands",
        {
          method: "POST",
          headers: {
            "x-starfiniti-connection-id": connectionId,
            "x-starfiniti-delivery-id": requestId,
            "x-starfiniti-timestamp": timestamp,
            "x-starfiniti-nonce": "snapshot-poll-1",
            "x-starfiniti-key-version": "v1",
            "x-starfiniti-body-sha256": signed.bodySha256,
            "x-starfiniti-signature": signed.signature,
          },
          body: raw,
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      commands: [
        {
          commandId,
          topic: "woocommerce.customer_experience.put",
          payload: {
            snapshot: { externalCustomerId: "7", revision: "1" },
          },
        },
      ],
    });
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.array).toHaveBeenCalledWith(["7"]);
  });

  it("rejects snapshot selectors without the negotiated capability", async () => {
    const raw = new TextEncoder().encode(
      JSON.stringify({
        version: "1",
        kind: "poll",
        connectionId,
        requestId,
        batchSize: 10,
        capabilities: [],
        snapshotCustomerIds: ["7"],
      }),
    );
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signed = signWooCommerceDelivery({
      requestTarget: "/api/v1/integrations/woocommerce/commands",
      connectionId,
      deliveryId: requestId,
      timestamp,
      nonce: "snapshot-poll-2",
      rawBody: raw,
      secret,
    });
    const query = vi.fn(async (parts: TemplateStringsArray) => {
      const text = parts.join("?");
      if (text.includes("from loyalty.commerce_connections")) {
        return [
          {
            public_id: connectionId,
            current_key_version: "v1",
            signing_material_ref: "pool:test:v1",
          },
        ];
      }
      throw new Error(`Unexpected query: ${text}`);
    });
    mocks.getDatabase.mockReturnValue(query);
    mocks.getWooCommerceSigningKey.mockReturnValue(secret);

    const response = await POST(
      new Request(
        "https://loyalty.example.test/api/v1/integrations/woocommerce/commands",
        {
          method: "POST",
          headers: {
            "x-starfiniti-connection-id": connectionId,
            "x-starfiniti-delivery-id": requestId,
            "x-starfiniti-timestamp": timestamp,
            "x-starfiniti-nonce": "snapshot-poll-2",
            "x-starfiniti-key-version": "v1",
            "x-starfiniti-body-sha256": signed.bodySha256,
            "x-starfiniti-signature": signed.signature,
          },
          body: raw,
        },
      ),
    );

    expect(response.status).toBe(422);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
