import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  StarfinitiClient,
  verifyAndClaimWebhookV1,
  verifyWebhookV1,
} from "./index";

const credential =
  "sflt_v1_94000000000040008000000000000001_ERERERERERERERERERERERERERERERERERERERERERE";
const correlationId = "94000000-0000-4000-8000-000000000005";
const vector = JSON.parse(
  readFileSync(
    new URL("../../webhook-test-vectors/v1.json", import.meta.url),
    "utf8",
  ),
) as Readonly<{
  secretBase64: string;
  id: string;
  timestamp: string;
  rawBody: string;
  signature: string;
}>;

describe("StarfinitiClient", () => {
  it("sends the exact customer contract with a server credential", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          version: "1",
          customerId: "94000000-0000-4000-8000-000000000006",
          outcome: "created",
          correlationId,
        },
        { status: 201 },
      ),
    );
    const client = new StarfinitiClient({
      baseUrl: "https://loyalty.starfiniti.com/",
      credential,
      fetch: fetcher,
    });
    await expect(
      client.upsertCustomer({
        version: "1",
        externalCustomerId: "merchant-customer-42",
        idempotencyKey: "customer:42:v1",
        correlationId,
      }),
    ).resolves.toMatchObject({ outcome: "created" });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://loyalty.starfiniti.com/api/v1/service/customers",
    );
    expect(init).toMatchObject({ method: "POST", redirect: "error" });
    expect(new Headers(init?.headers).get("authorization")).toBe(
      `Bearer ${credential}`,
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      version: "1",
      externalCustomerId: "merchant-customer-42",
      idempotencyKey: "customer:42:v1",
      correlationId,
    });
  });

  it("maps bounded API problems without exposing response bodies", async () => {
    const client = new StarfinitiClient({
      baseUrl: "https://loyalty.starfiniti.com",
      credential,
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json(
            { error: { code: "rate_limited" } },
            { status: 429, headers: { "retry-after": "60" } },
          ),
        ),
    });
    await expect(
      client.upsertCustomer({
        version: "1",
        externalCustomerId: "merchant-customer-42",
        idempotencyKey: "customer:42:v1",
        correlationId,
      }),
    ).rejects.toMatchObject({
      status: 429,
      code: "rate_limited",
      retryAfterSeconds: 60,
    });
  });

  it("rejects malformed credentials and commands before network access", async () => {
    expect(
      () =>
        new StarfinitiClient({
          baseUrl: "https://loyalty.starfiniti.com",
          credential: "not-a-token",
        }),
    ).toThrow("credential");
    const fetcher = vi.fn<typeof fetch>();
    const client = new StarfinitiClient({
      baseUrl: "https://loyalty.starfiniti.com",
      credential,
      fetch: fetcher,
    });
    await expect(
      client.upsertCustomer({
        version: "1",
        externalCustomerId: " customer ",
        idempotencyKey: "invalid key",
        correlationId,
      }),
    ).rejects.toThrow("invalid ServiceCustomerUpsertV1");
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("Standard Webhooks receiver", () => {
  const input = {
    rawBody: vector.rawBody,
    secret: `whsec_${vector.secretBase64}`,
    headers: {
      "webhook-id": vector.id,
      "webhook-timestamp": vector.timestamp,
      "webhook-signature": vector.signature,
    },
    now: new Date(Number(vector.timestamp) * 1000),
  } as const;

  it("verifies the shared exact-byte HMAC vector", () => {
    expect(verifyWebhookV1(input)).toMatchObject({
      id: vector.id,
      timestamp: Number(vector.timestamp),
      event: { eventType: "loyalty.connector.health" },
    });
  });

  it.each([
    [
      "tampered body",
      { ...input, rawBody: `${vector.rawBody} ` },
      "invalid_signature",
    ],
    [
      "stale timestamp",
      { ...input, now: new Date((Number(vector.timestamp) + 301) * 1000) },
      "timestamp_outside_tolerance",
    ],
    [
      "wrong secret",
      {
        ...input,
        secret: `whsec_${Buffer.alloc(32, 0x22).toString("base64")}`,
      },
      "invalid_signature",
    ],
  ] as const)("rejects %s", (_name, candidate, code) => {
    expect(() => verifyWebhookV1(candidate)).toThrowError(
      expect.objectContaining({ code }),
    );
  });

  it("delegates atomic stable-ID replay ownership to the receiver store", async () => {
    const claim = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    await expect(
      verifyAndClaimWebhookV1({ ...input, replayStore: { claim } }),
    ).resolves.toMatchObject({ id: vector.id });
    await expect(
      verifyAndClaimWebhookV1({ ...input, replayStore: { claim } }),
    ).rejects.toMatchObject({ code: "duplicate_webhook" });
    expect(claim).toHaveBeenCalledWith(
      vector.id,
      new Date((Number(vector.timestamp) + 300) * 1000),
    );
  });
});
