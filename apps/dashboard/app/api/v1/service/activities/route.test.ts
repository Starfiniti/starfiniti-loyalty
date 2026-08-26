import { issueServiceCredentialToken } from "@starfiniti/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getDatabase: vi.fn() }));
vi.mock("@/lib/server/database", () => ({ getDatabase: mocks.getDatabase }));

import { POST } from "./route";

const credential = issueServiceCredentialToken(
  "10000000-0000-4000-8000-000000000001",
  Buffer.alloc(32, 8),
);
const command = {
  version: "1",
  externalCustomerId: "crm-customer-42",
  eventId: "consultation:42",
  occurredAt: "2026-08-26T08:00:00+02:00",
  source: "custom_activity",
  activityCode: "consultation",
  productId: null,
  categoryIds: [],
  idempotencyKey: "activity:consultation:42",
  correlationId: "20000000-0000-4000-8000-000000000001",
};

function request(body: string) {
  return new Request("https://loyalty.example.test/api/v1/service/activities", {
    method: "POST",
    headers: { authorization: `Bearer ${credential.token}` },
    body,
  });
}

describe("service activity API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects caller-selected authority and invalid activity content", async () => {
    const response = await POST(
      request(
        JSON.stringify({ ...command, organizationId: crypto.randomUUID() }),
      ),
    );
    expect(response.status).toBe(422);
    expect(mocks.getDatabase).not.toHaveBeenCalled();
  });

  it("accepts one minimized canonical activity result", async () => {
    const query = vi.fn(async () => [
      {
        receipt_id: "30000000-0000-4000-8000-000000000001",
        receipt_outcome: "accepted",
        canonical_event_id: "40000000-0000-4000-8000-000000000001",
        canonical_outcome: "created",
        quota_limit: 120,
        quota_remaining: 118,
        quota_reset_at: new Date(Date.now() + 25_000).toISOString(),
      },
    ]);
    mocks.getDatabase.mockReturnValue(query);
    const response = await POST(request(JSON.stringify(command)));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      version: "1",
      receiptId: "30000000-0000-4000-8000-000000000001",
      outcome: "accepted",
      canonicalEventId: "40000000-0000-4000-8000-000000000001",
      canonicalOutcome: "created",
      correlationId: command.correlationId,
    });
    expect(response.headers.get("ratelimit")).toContain("r=118");
  });

  it("fails closed when the scoped customer does not exist", async () => {
    mocks.getDatabase.mockReturnValue(
      vi.fn(async () => {
        throw Object.assign(new Error("service customer not found"), {
          code: "P0002",
        });
      }),
    );
    const response = await POST(request(JSON.stringify(command)));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "customer_not_found" },
    });
  });
});
