import "server-only";

import {
  organizationAccessWorkspaceV1,
  type OrganizationAccessWorkspaceV1,
} from "@starfiniti/contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getOrganizationAccessWorkspace(
  organizationId: string,
): Promise<OrganizationAccessWorkspaceV1 | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("get_organization_access_workspace_v1", {
      target_organization_public_id: organizationId,
    });
  if (error) throw new Error("organization_access_workspace_unavailable");
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  const parsed = organizationAccessWorkspaceV1.safeParse(
    typeof row === "object" && row !== null
      ? (row as Record<string, unknown>).workspace
      : null,
  );
  if (!parsed.success) {
    throw new Error("organization_access_workspace_invalid");
  }
  return parsed.data;
}
