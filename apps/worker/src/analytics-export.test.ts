import type { Sql } from "postgres";
import { describe, expect, it } from "vitest";
import {
  classifyGenerationError,
  runAnalyticsExportLifecycle,
} from "./analytics-export.ts";

const firstExportId = "9a000000-0000-4000-8000-000000000001";
const secondExportId = "9a000000-0000-4000-8000-000000000002";

describe("isolated analytics export worker", () => {
  it("materializes, expires, claims, and generates a bounded batch", async () => {
    const calls: unknown[][] = [];
    const result = await runAnalyticsExportLifecycle(
      lifecycleSql(calls, [firstExportId, secondExportId], new Map()),
      "reporting-worker-1",
      5,
    );

    expect(result).toEqual({
      materialized: 2,
      autoPaused: 1,
      expired: 3,
      authorizationsRemoved: 4,
      claimed: 2,
      generated: 2,
      retryable: 0,
      failed: 0,
    });
    expect(calls.flat()).toContain("reporting-worker-1");
    expect(calls.flat()).not.toContainEqual(expect.stringContaining("payload"));
  });

  it("records retryable and terminal generation failures without payload logging", async () => {
    const failures = new Map([
      [firstExportId, new Error("analytics export actor revoked")],
      [secondExportId, new Error("database connection reset")],
    ]);
    const calls: unknown[][] = [];
    const result = await runAnalyticsExportLifecycle(
      lifecycleSql(calls, [firstExportId, secondExportId], failures),
      "reporting-worker-2",
    );

    expect(result).toMatchObject({
      claimed: 2,
      generated: 0,
      retryable: 1,
      failed: 1,
    });
    expect(calls.flat()).toContain("actor_revoked");
    expect(calls.flat()).toContain("generation_failed");
    expect(JSON.stringify(calls)).not.toContain("database connection reset");
  });

  it.each([
    ["analytics export actor revoked", "actor_revoked"],
    ["analytics export scope unavailable", "scope_unavailable"],
    ["analytics capability disabled", "feature_disabled"],
    ["analytics export payload too large", "payload_too_large"],
    ["unexpected database failure", "generation_failed"],
  ])("maps %s to the stable failure code", (message, expected) => {
    expect(classifyGenerationError(new Error(message))).toBe(expected);
  });

  it("rejects untrusted claim shapes before generation", async () => {
    await expect(
      runAnalyticsExportLifecycle(
        lifecycleSql([], ["not-an-export-id"], new Map()),
        "reporting-worker-3",
      ),
    ).rejects.toThrow("analytics_export_claim_invalid");
  });
});

function lifecycleSql(
  calls: unknown[][],
  exportIds: string[],
  generationFailures: Map<string, Error>,
): Sql {
  let pendingFailureState: "retry" | "failed" = "retry";
  const tag = async (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<unknown[]> => {
    const query = strings.join("?");
    calls.push(values);
    if (query.includes("materialize_due_analytics_exports_v1")) {
      return [{ materialized: 2, auto_paused: 1 }];
    }
    if (query.includes("expire_analytics_exports_v1")) {
      return [{ expired: 3, authorizations_removed: 4 }];
    }
    if (query.includes("claim_analytics_export_jobs_v1")) {
      return exportIds.map((exportId) => ({
        schema_version: "1",
        export_public_id: exportId,
        lease_expires_at: "2026-08-25T20:00:00Z",
      }));
    }
    if (query.includes("generate_analytics_export_job_v1")) {
      const exportId = String(values[0]);
      const failure = generationFailures.get(exportId);
      if (failure) {
        pendingFailureState = failure.message.includes("actor revoked")
          ? "failed"
          : "retry";
        throw failure;
      }
      return [{ state: "ready" }];
    }
    if (query.includes("fail_analytics_export_job_v1")) {
      return [{ state: pendingFailureState }];
    }
    throw new Error("unexpected_analytics_export_sql");
  };
  return tag as unknown as Sql;
}
