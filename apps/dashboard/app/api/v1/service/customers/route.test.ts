import { issueServiceCredentialToken } from "@starfiniti/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getDatabase: vi.fn() }));
vi.mock("@/lib/server/database", () => ({ getDatabase: mocks.getDatabase }));

import { POST } from "./route";

const credential = issueServiceCredentialToken(
  "10000000-0000-4000-8000-000000000001",
  Buffer.alloc(32, 7),
);
const command = {
  version: "1",
  externalCustomerId: "crm-customer-42",
  idempotencyKey: "customer:42",
  correlationId: "20000000-0000-4000-8000-000000000001",
};

function request(body: string, authorization = `Bearer ${credential.token}`) {
  return new Request("https://loyalty.example.test/api/v1/service/customers", {
    method: "POST",
    headers: { authorization },
    body,
  });
}

describe("service customer API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects malformed credentials and bounded bodies before database access", async () => {
    const unauthorized = await POST(
      request(JSON.stringify(command), "Bearer bad"),
    );
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get("www-authenticate")).toBe(
      'Bearer realm="starfiniti-service-api"',
    );
    expect(unauthorized.headers.get("cache-control")).toBe("no-store");
    expect(mocks.getDatabase).not.toHaveBeenCalled();

    const oversized = await POST(
      new Request("https://loyalty.example.test/api/v1/service/customers", {
        method: "POST",
        headers: {
          authorization: `Bearer ${credential.token}`,
          "content-length": "32769",
        },
        body: "{}",
      }),
    );
    expect(oversized.status).toBe(413);
    expect(mocks.getDatabase).not.toHaveBeenCalled();
  });

  it("returns one minimized customer result and current quota", async () => {
    const query = vi.fn(async () => [
      {
        customer_public_id: "30000000-0000-4000-8000-000000000001",
        outcome: "created",
        quota_limit: 120,
        quota_remaining: 119,
        quota_reset_at: new Date(Date.now() + 30_000).toISOString(),
      },
    ]);
    mocks.getDatabase.mockReturnValue(query);
    const response = await POST(request(JSON.stringify(command)));
    expect(response.status).toBe(201);
    expect(response.headers.get("ratelimit-policy")).toBe(
      '"service-api";q=120;w=60',
    );
    expect(response.headers.get("ratelimit")).toMatch(
      /^"service-api";r=119;t=\d+$/u,
    );
    expect(await response.json()).toEqual({
      version: "1",
      customerId: "30000000-0000-4000-8000-000000000001",
      outcome: "created",
      correlationId: command.correlationId,
    });
    expect(query).toHaveBeenCalledOnce();
  });

  it("maps safe credential, quota, and idempotency failures", async () => {
    for (const [error, status, code] of [
      [
        { code: "28000", message: "invalid service credential" },
        401,
        "invalid_credential",
      ],
      [
        { code: "P0001", message: "service account rate limit exceeded" },
        429,
        "rate_limited",
      ],
      [
        { code: "23514", message: "private detail" },
        409,
        "idempotency_conflict",
      ],
    ] as const) {
      mocks.getDatabase.mockReturnValue(
        vi.fn(async () => {
          throw error;
        }),
      );
      const response = await POST(request(JSON.stringify(command)));
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error: { code } });
    }
  });
});
