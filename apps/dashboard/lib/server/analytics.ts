import "server-only";
import type { AnalyticsValueTruthReportV1 } from "@starfiniti/contracts";
import {
  parseAnalyticsValueTruthRow,
  type AnalyticsRange,
  type AnalyticsRow,
} from "@/lib/analytics";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TenantContext } from "@/lib/tenant-context";

export async function getAnalyticsValueTruthReport(
  context: TenantContext,
  rangeDays: AnalyticsRange,
): Promise<AnalyticsValueTruthReportV1 | null> {
  if (!context.workspace || !context.programmeGroup) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("get_analytics_value_truth_v1", {
      target_organization_public_id: context.organization.public_id,
      target_workspace_public_id: context.workspace.public_id,
      target_programme_group_public_id: context.programmeGroup.public_id,
      target_days: rangeDays,
    });
  if (error) throw new Error("analytics_value_truth_unavailable");
  const row = (Array.isArray(data) ? data[0] : data) as AnalyticsRow | null;
  if (!row) return null;
  try {
    return parseAnalyticsValueTruthRow(row);
  } catch {
    throw new Error("analytics_value_truth_invalid");
  }
}
