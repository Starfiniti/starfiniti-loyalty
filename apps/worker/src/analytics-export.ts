import type { Sql } from "postgres";

type CountRow = {
  materialized?: number;
  auto_paused?: number;
  expired?: number;
  authorizations_removed?: number;
};

type ClaimRow = {
  schema_version: string;
  export_public_id: string;
  lease_expires_at: Date | string;
};

type GenerationRow = {
  state: string;
};

type FailureRow = {
  state: string;
};

export type AnalyticsExportLifecycleResult = {
  materialized: number;
  autoPaused: number;
  expired: number;
  authorizationsRemoved: number;
  claimed: number;
  generated: number;
  retryable: number;
  failed: number;
};

const EXPORT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/**
 * Materializes due schedules and generates bounded aggregate report payloads.
 * This lifecycle deliberately runs outside the value worker so reporting load
 * and retries cannot delay ledger, refund, expiry, or connector work.
 */
export async function runAnalyticsExportLifecycle(
  sql: Sql,
  workerId: string,
  batchSize = 5,
): Promise<AnalyticsExportLifecycleResult> {
  if (workerId.length < 1 || workerId.length > 200) {
    throw new Error("analytics_export_worker_id_invalid");
  }
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 20) {
    throw new Error("analytics_export_batch_size_invalid");
  }

  const materializationRows = await sql<CountRow[]>`
    select materialized, auto_paused
    from loyalty_private.materialize_due_analytics_exports_v1(now(), 20)
  `;
  const expiryRows = await sql<CountRow[]>`
    select expired, authorizations_removed
    from loyalty_private.expire_analytics_exports_v1(now(), 100)
  `;
  const claims = await sql<ClaimRow[]>`
    select schema_version, export_public_id::text, lease_expires_at
    from loyalty_private.claim_analytics_export_jobs_v1(
      ${workerId}, ${batchSize}, 120
    )
  `;
  if (claims.length > batchSize) {
    throw new Error("analytics_export_claim_batch_exceeded");
  }

  const totals: AnalyticsExportLifecycleResult = {
    materialized: exactCount(materializationRows[0]?.materialized),
    autoPaused: exactCount(materializationRows[0]?.auto_paused),
    expired: exactCount(expiryRows[0]?.expired),
    authorizationsRemoved: exactCount(expiryRows[0]?.authorizations_removed),
    claimed: claims.length,
    generated: 0,
    retryable: 0,
    failed: 0,
  };

  for (const claim of claims) {
    validateClaim(claim);
    try {
      const rows = await sql<GenerationRow[]>`
        select state
        from loyalty_private.generate_analytics_export_job_v1(
          ${claim.export_public_id}::uuid, ${workerId}
        )
      `;
      if (rows[0]?.state !== "ready") {
        throw new Error("analytics_export_generation_state_invalid");
      }
      totals.generated += 1;
    } catch (error) {
      const errorCode = classifyGenerationError(error);
      const rows = await sql<FailureRow[]>`
        select state
        from loyalty_private.fail_analytics_export_job_v1(
          ${claim.export_public_id}::uuid, ${workerId}, ${errorCode}
        )
      `;
      if (rows[0]?.state === "retry") totals.retryable += 1;
      else if (rows[0]?.state === "failed") totals.failed += 1;
      else throw new Error("analytics_export_failure_state_invalid");
    }
  }

  return totals;
}

export function classifyGenerationError(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("actor revoked")) return "actor_revoked";
  if (message.includes("scope unavailable")) return "scope_unavailable";
  if (message.includes("capability disabled")) return "feature_disabled";
  if (message.includes("payload too large")) return "payload_too_large";
  return "generation_failed";
}

function validateClaim(claim: ClaimRow): void {
  if (
    claim.schema_version !== "1" ||
    !EXPORT_ID.test(claim.export_public_id) ||
    !Number.isFinite(new Date(claim.lease_expires_at).getTime())
  ) {
    throw new Error("analytics_export_claim_invalid");
  }
}

function exactCount(value: number | undefined): number {
  if (!Number.isInteger(value) || (value ?? -1) < 0) {
    throw new Error("analytics_export_count_invalid");
  }
  return value as number;
}
