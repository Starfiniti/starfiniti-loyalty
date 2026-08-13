import "server-only";
import {
  merchantOverviewReportV1,
  type MerchantOverviewReportV1,
} from "@starfiniti/contracts";
import type { OverviewRange } from "@/lib/overview";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TenantContext } from "@/lib/tenant-context";

type OverviewRow = Readonly<Record<string, unknown>>;

export async function getOverviewReport(
  context: TenantContext,
  rangeDays: OverviewRange,
): Promise<MerchantOverviewReportV1 | null> {
  if (!context.workspace || !context.programmeGroup) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("get_overview_report", {
      target_organization_public_id: context.organization.public_id,
      target_workspace_public_id: context.workspace.public_id,
      target_programme_group_public_id: context.programmeGroup.public_id,
      target_days: rangeDays,
    });
  if (error) throw new Error("overview_report_unavailable");
  const row = (Array.isArray(data) ? data[0] : data) as OverviewRow | null;
  if (!row) return null;
  const report = merchantOverviewReportV1.safeParse({
    reportVersion: row.report_version,
    asOf: row.report_as_of,
    rangeDays: row.range_days,
    currencyCode: row.currency_code,
    minorUnitsPerMajor: row.minor_units_per_major,
    membersTotal: row.members_total,
    membersNew: row.members_new,
    membersNewPrevious: row.members_new_previous,
    eligibleSpendMinor: row.eligible_spend_minor,
    eligibleSpendMinorPrevious: row.eligible_spend_minor_previous,
    repeatRateBasisPoints: row.repeat_rate_basis_points,
    repeatRateBasisPointsPrevious: row.repeat_rate_basis_points_previous,
    redemptionRateBasisPoints: row.redemption_rate_basis_points,
    redemptionRateBasisPointsPrevious:
      row.redemption_rate_basis_points_previous,
    outstandingPoints: row.outstanding_points,
    dailyNewMembers: row.daily_new_members,
  });
  if (!report.success) throw new Error("overview_report_invalid");
  return report.data;
}
