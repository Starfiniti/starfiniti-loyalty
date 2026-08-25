import "server-only";

import { createHash } from "node:crypto";
import {
  analyticsExportWorkspaceV1,
  analyticsMetricDictionaryV4,
  analyticsReportExportV1,
  type AnalyticsExportWorkspaceV1,
  type AnalyticsReportExportV1,
} from "@starfiniti/contracts";
import {
  parseAnalyticsCohortRetentionRow,
  parseAnalyticsCommercePerformanceRow,
  parseAnalyticsProgrammeOutcomeRow,
  parseAnalyticsValueTruthRow,
  type AnalyticsRow,
} from "@/lib/analytics";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TenantContext } from "@/lib/tenant-context";
import { getDatabase } from "./database";

type AuthorizationRow = {
  authorization_token: string;
  expires_at: Date | string;
};

type SourceRow = {
  export_id: string;
  generated_at: Date | string;
  expires_at: Date | string;
  source_sha256: string;
  source_payload: unknown;
};

export type PreparedAnalyticsExport = Readonly<{
  document: AnalyticsReportExportV1;
  body: string;
}>;

export async function getAnalyticsExportWorkspace(
  context: TenantContext,
): Promise<AnalyticsExportWorkspaceV1 | null> {
  if (!context.workspace || !context.programmeGroup) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("get_analytics_export_workspace_v1", {
      target_organization_public_id: context.organization.public_id,
      target_workspace_public_id: context.workspace.public_id,
      target_programme_group_public_id: context.programmeGroup.public_id,
      target_limit: 20,
    });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row || typeof row !== "object") {
    throw new Error("analytics_export_workspace_unavailable");
  }
  const parsed = analyticsExportWorkspaceV1.safeParse(
    (row as Record<string, unknown>).workspace,
  );
  if (!parsed.success) {
    throw new Error("analytics_export_workspace_unavailable");
  }
  return parsed.data;
}

export async function issueAnalyticsExportAuthorization(
  exportId: string,
  authUserId: string,
  sessionId: string,
): Promise<{ authorizationToken: string; expiresAt: string }> {
  const sql = getDatabase();
  const rows = await sql<AuthorizationRow[]>`
    select authorization_token, expires_at
    from loyalty_private.issue_analytics_export_authorization_v1(
      ${exportId}::uuid, ${authUserId}::uuid, ${sessionId}::uuid
    )
  `;
  const row = rows[0];
  if (!row) throw new Error("analytics_export_authorization_unavailable");
  return {
    authorizationToken: row.authorization_token,
    expiresAt: instant(row.expires_at),
  };
}

export async function consumeAnalyticsExport(
  exportId: string,
  authorizationToken: string,
  authUserId: string,
  sessionId: string,
): Promise<PreparedAnalyticsExport> {
  const sql = getDatabase();
  return sql.begin(async (transaction) => {
    const rows = await transaction<SourceRow[]>`
      select export_id::text, generated_at, expires_at, source_sha256, source_payload
      from loyalty_private.consume_analytics_export_v1(
        ${exportId}::uuid, ${authorizationToken},
        ${authUserId}::uuid, ${sessionId}::uuid
      )
    `;
    const source = rows[0];
    if (!source) throw new Error("analytics_export_unavailable");
    const payload = object(source.source_payload);
    const reports = object(payload.reports);
    const document = analyticsReportExportV1.parse({
      schemaVersion: "starfiniti.analytics-report-export.v1",
      exportId: source.export_id,
      generatedAt: instant(source.generated_at),
      expiresAt: instant(source.expires_at),
      requestedAsOf: text(payload.requestedAsOf),
      rangeDays: payload.rangeDays,
      requestedTimeZone: text(payload.requestedTimeZone),
      sourceSha256: source.source_sha256,
      dictionary: analyticsMetricDictionaryV4,
      reports: {
        valueTruth: parseAnalyticsValueTruthRow(
          object(reports.valueTruthRow) as AnalyticsRow,
        ),
        commercePerformance: parseAnalyticsCommercePerformanceRow(
          object(reports.commercePerformanceRow) as AnalyticsRow,
        ),
        programmeOutcomes: parseAnalyticsProgrammeOutcomeRow(
          object(reports.programmeOutcomeRow) as AnalyticsRow,
        ),
        cohortRetention: parseAnalyticsCohortRetentionRow(
          object(reports.cohortRetention) as AnalyticsRow,
        ),
      },
    });
    const body = `${JSON.stringify(document, null, 2)}\n`;
    const responseBytes = Buffer.byteLength(body, "utf8");
    if (responseBytes > 10 * 1024 * 1024) {
      throw new Error("analytics_export_response_too_large");
    }
    const responseSha256 = createHash("sha256")
      .update(body, "utf8")
      .digest("hex");
    await transaction`
      select loyalty_private.record_analytics_export_download_v1(
        ${exportId}::uuid, ${authUserId}::uuid, ${sessionId}::uuid,
        ${responseSha256}, ${responseBytes}
      )
    `;
    return { document, body };
  });
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("analytics_export_source_invalid");
  }
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("analytics_export_source_invalid");
  }
  return value;
}

function instant(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("analytics_export_source_invalid");
  }
  return date.toISOString();
}
