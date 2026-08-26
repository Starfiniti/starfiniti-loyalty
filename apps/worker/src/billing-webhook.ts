import {
  managedBillingWebhookClaimV1,
  managedBillingWebhookProcessingResultV1,
} from "@starfiniti/contracts/billing";
import type { Sql } from "postgres";

type ClaimRow = {
  receipt_public_id: string;
  lease_token: string;
  event_type: string;
  attempt_number: number;
};

type ProcessingRow = {
  outcome: string;
  state_revision_public_id: string | null;
};

export type BillingWebhookLifecycleResult = {
  claimed: number;
  stateRecorded: number;
  invoicesObserved: number;
  held: number;
  deferred: number;
};

/**
 * Normalizes already verified private inbox receipts. This worker has no
 * provider credential or network client, so billing retries cannot affect
 * checkout, loyalty value processing, or Stripe intake verification.
 */
export async function runBillingWebhookLifecycle(
  sql: Sql,
  workerId: string,
  batchSize = 10,
): Promise<BillingWebhookLifecycleResult> {
  if (workerId.trim().length < 3 || workerId.trim().length > 120) {
    throw new Error("billing_webhook_worker_id_invalid");
  }
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 25) {
    throw new Error("billing_webhook_batch_size_invalid");
  }

  const rows = await sql<ClaimRow[]>`
    select receipt_public_id::text, lease_token::text, event_type,
      attempt_number
    from loyalty_private.claim_managed_billing_webhooks_v1(
      ${workerId.trim()}, ${batchSize}, 60
    )
  `;
  if (rows.length > batchSize) {
    throw new Error("billing_webhook_claim_batch_exceeded");
  }

  const result: BillingWebhookLifecycleResult = {
    claimed: rows.length,
    stateRecorded: 0,
    invoicesObserved: 0,
    held: 0,
    deferred: 0,
  };

  for (const row of rows) {
    const claim = managedBillingWebhookClaimV1.parse({
      receiptId: row.receipt_public_id,
      leaseToken: row.lease_token,
      eventType: row.event_type,
      attemptNumber: row.attempt_number,
    });
    try {
      const processed = await sql<ProcessingRow[]>`
        select outcome, state_revision_public_id::text
        from loyalty_private.process_managed_billing_webhook_v1(
          ${claim.receiptId}::uuid,
          ${claim.leaseToken}::uuid,
          ${workerId.trim()}
        )
      `;
      const outcome = managedBillingWebhookProcessingResultV1.parse({
        outcome: processed[0]?.outcome,
        stateRevisionId: processed[0]?.state_revision_public_id ?? null,
      });
      if (outcome.outcome === "state_recorded") result.stateRecorded += 1;
      else if (outcome.outcome === "invoice_observed") {
        result.invoicesObserved += 1;
      } else result.held += 1;
    } catch {
      // The database lease is the retry authority. No provider/body/PII detail
      // is retained or logged here; expiry records the bounded next attempt.
      result.deferred += 1;
    }
  }

  return result;
}
