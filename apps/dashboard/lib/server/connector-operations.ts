import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TenantContext } from "@/lib/tenant-context";

export type ConnectorIssue = Readonly<{
  kind: string;
  id: string;
  state: string;
  errorCode: string | null;
  attemptCount: number;
  operationKind: string;
  observedAt: string;
  retryAllowed: boolean;
}>;

export type ConnectorOperationSummary = Readonly<{
  id: string;
  displayName: string;
  status: string;
  lastSeenAt: string | null;
  deliveriesReady: number;
  deliveriesFailed: number;
  effectsReady: number;
  effectsFailed: number;
  commandsReady: number;
  commandsFailed: number;
  issues: readonly ConnectorIssue[];
}>;

type SummaryRow = Readonly<{
  connection_public_id: string;
  display_name: string;
  connection_status: string;
  last_seen_at: string | null;
  deliveries_ready: number | string;
  deliveries_failed: number | string;
  effects_ready: number | string;
  effects_failed: number | string;
  commands_ready: number | string;
  commands_failed: number | string;
}>;
type IssueRow = Readonly<{
  item_kind: string;
  item_public_id: string;
  state: string;
  error_code: string | null;
  attempt_count: number;
  operation_kind: string;
  observed_at: string;
  retry_allowed: boolean;
}>;

export async function getConnectorOperations(
  context: TenantContext,
): Promise<readonly ConnectorOperationSummary[]> {
  const supabase = await createSupabaseServerClient();
  const summaryResult = await supabase
    .schema("loyalty")
    .rpc("get_connector_operation_summaries", {
      target_organization_public_id: context.organization.public_id,
    });
  if (summaryResult.error) throw new Error("connector_operations_unavailable");
  const summaries = (summaryResult.data ?? []) as SummaryRow[];
  const issues = await Promise.all(
    summaries.map((summary) =>
      supabase.schema("loyalty").rpc("get_connector_operation_issues", {
        target_connection_public_id: summary.connection_public_id,
        target_limit: 25,
      }),
    ),
  );
  if (issues.some((result) => result.error)) {
    throw new Error("connector_operations_unavailable");
  }

  return summaries.map((summary, index) => ({
    id: summary.connection_public_id,
    displayName: summary.display_name,
    status: summary.connection_status,
    lastSeenAt: summary.last_seen_at,
    deliveriesReady: Number(summary.deliveries_ready),
    deliveriesFailed: Number(summary.deliveries_failed),
    effectsReady: Number(summary.effects_ready),
    effectsFailed: Number(summary.effects_failed),
    commandsReady: Number(summary.commands_ready),
    commandsFailed: Number(summary.commands_failed),
    issues: ((issues[index]?.data ?? []) as IssueRow[]).map((issue) => ({
      kind: issue.item_kind,
      id: issue.item_public_id,
      state: issue.state,
      errorCode: issue.error_code,
      attemptCount: issue.attempt_count,
      operationKind: issue.operation_kind,
      observedAt: issue.observed_at,
      retryAllowed: issue.retry_allowed,
    })),
  }));
}
