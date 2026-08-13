import "server-only";
import type { EntitlementSnapshotV1 } from "@starfiniti/contracts";
import {
  parseEntitlementSnapshot,
  type EntitlementRow,
} from "@/lib/entitlements";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TenantContext } from "@/lib/tenant-context";

export async function getEntitlementSnapshot(
  context: TenantContext,
): Promise<EntitlementSnapshotV1> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("get_my_entitlements_v1", {
      target_organization_public_id: context.organization.public_id,
    });
  if (error) throw new Error("entitlements_unavailable");
  return parseEntitlementSnapshot(
    (Array.isArray(data) ? data : []) as EntitlementRow[],
    context.organization.public_id,
  );
}
