import "server-only";

import { billingSummaryV1, type BillingSummaryV1 } from "@starfiniti/contracts";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type UnknownRow = Readonly<Record<string, unknown>>;

export async function getBillingSummary(
  organizationId: string,
): Promise<BillingSummaryV1> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("get_my_billing_summary_v1", {
      target_organization_public_id: organizationId,
    });
  if (error || !Array.isArray(data) || data.length !== 1) {
    throw new Error("billing_summary_unavailable");
  }

  const row = data[0] as UnknownRow | undefined;
  const parsed = billingSummaryV1.safeParse(row?.billing_summary);
  if (!parsed.success) throw new Error("billing_summary_unavailable");
  return parsed.data;
}
