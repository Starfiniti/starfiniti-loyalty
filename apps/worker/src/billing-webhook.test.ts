import type { Sql } from "postgres";
import { describe, expect, it } from "vitest";

import { runBillingWebhookLifecycle } from "./billing-webhook.ts";

const firstReceipt = "10000000-0000-4000-8000-000000000001";
const secondReceipt = "10000000-0000-4000-8000-000000000002";
const thirdReceipt = "10000000-0000-4000-8000-000000000003";

describe("isolated billing webhook worker", () => {
  it("normalizes subscription and invoice receipts in one bounded batch", async () => {
    const calls: unknown[][] = [];
    const result = await runBillingWebhookLifecycle(
      lifecycleSql(calls, [
        claim(firstReceipt, "customer.subscription.updated"),
        claim(secondReceipt, "invoice.payment_failed"),
        claim(thirdReceipt, "customer.subscription.deleted"),
      ]),
      "billing-worker-1",
    );

    expect(result).toEqual({
      claimed: 3,
      stateRecorded: 1,
      invoicesObserved: 1,
      held: 1,
      deferred: 0,
    });
    expect(calls.flat()).toContain("billing-worker-1");
    expect(JSON.stringify(calls)).not.toMatch(/customer|subscription|invoice/u);
  });

  it("defers a private database failure to lease expiry without stopping peers", async () => {
    const calls: unknown[][] = [];
    const result = await runBillingWebhookLifecycle(
      lifecycleSql(
        calls,
        [
          claim(firstReceipt, "customer.subscription.updated"),
          claim(secondReceipt, "invoice.paid"),
        ],
        new Set([firstReceipt]),
      ),
      "billing-worker-2",
    );

    expect(result).toMatchObject({
      claimed: 2,
      invoicesObserved: 1,
      deferred: 1,
    });
    expect(JSON.stringify(calls)).not.toContain("private database failure");
  });

  it("fails closed for invalid claims, worker IDs, batches, and excess rows", async () => {
    await expect(
      runBillingWebhookLifecycle(
        lifecycleSql([], [claim("not-a-uuid", "invoice.paid")]),
        "billing-worker-3",
      ),
    ).rejects.toThrow();
    await expect(
      runBillingWebhookLifecycle(lifecycleSql([], []), "x"),
    ).rejects.toThrow("billing_webhook_worker_id_invalid");
    await expect(
      runBillingWebhookLifecycle(lifecycleSql([], []), "billing-worker-3", 0),
    ).rejects.toThrow("billing_webhook_batch_size_invalid");
    await expect(
      runBillingWebhookLifecycle(
        lifecycleSql(
          [],
          [
            claim(firstReceipt, "invoice.paid"),
            claim(secondReceipt, "invoice.paid"),
          ],
        ),
        "billing-worker-3",
        1,
      ),
    ).rejects.toThrow("billing_webhook_claim_batch_exceeded");
  });
});

function claim(receiptId: string, eventType: string): ClaimRow {
  return {
    receipt_public_id: receiptId,
    lease_token: receiptId.replace(/.$/u, "a"),
    event_type: eventType,
    attempt_number: 1,
  };
}

type ClaimRow = {
  receipt_public_id: string;
  lease_token: string;
  event_type: string;
  attempt_number: number;
};

function lifecycleSql(
  calls: unknown[][],
  claims: ClaimRow[],
  failures = new Set<string>(),
): Sql {
  const tag = async (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<unknown[]> => {
    const query = strings.join("?");
    calls.push(values);
    if (query.includes("claim_managed_billing_webhooks_v1")) return claims;
    if (query.includes("process_managed_billing_webhook_v1")) {
      const receiptId = String(values[0]);
      if (failures.has(receiptId)) throw new Error("private database failure");
      if (receiptId === firstReceipt) {
        return [
          {
            outcome: "state_recorded",
            state_revision_public_id: firstReceipt,
          },
        ];
      }
      if (receiptId === secondReceipt) {
        return [
          { outcome: "invoice_observed", state_revision_public_id: null },
        ];
      }
      return [{ outcome: "held", state_revision_public_id: null }];
    }
    throw new Error("unexpected_billing_webhook_sql");
  };
  return tag as unknown as Sql;
}
