import "server-only";

import {
  billingSummaryV2,
  managedBillingUsageSummaryV1,
  type BillingSummaryV2,
  type ManagedBillingUsageSummaryV1,
} from "@starfiniti/contracts";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type UnknownRow = Readonly<Record<string, unknown>>;

export async function getBillingSummary(
  organizationId: string,
): Promise<BillingSummaryV2> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("get_my_billing_summary_v2", {
      target_organization_public_id: organizationId,
    });
  if (error || !Array.isArray(data) || data.length !== 1) {
    throw new Error("billing_summary_unavailable");
  }

  const row = data[0] as UnknownRow | undefined;
  const parsed = billingSummaryV2.safeParse(row?.billing_summary);
  if (!parsed.success) throw new Error("billing_summary_unavailable");
  return parsed.data;
}

export async function getManagedBillingUsageSummary(
  organizationId: string,
  periodStart = utcMonthStart(new Date()),
): Promise<ManagedBillingUsageSummaryV1> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("get_my_managed_billing_usage_summary_v1", {
      target_organization_public_id: organizationId,
      target_period_start: periodStart,
    });
  if (error || !Array.isArray(data) || data.length !== 1) {
    throw new Error("billing_usage_summary_unavailable");
  }
  const row = data[0] as UnknownRow | undefined;
  const parsed = managedBillingUsageSummaryV1.safeParse(row?.usage_summary);
  if (!parsed.success) throw new Error("billing_usage_summary_unavailable");
  return parsed.data;
}

export function utcMonthStart(value: Date): string {
  if (!Number.isFinite(value.getTime())) {
    throw new Error("billing_usage_period_invalid");
  }
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1),
  ).toISOString();
}
