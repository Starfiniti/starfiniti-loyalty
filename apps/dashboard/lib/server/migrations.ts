import "server-only";

import {
  migrationWorkspaceV1,
  type MigrationWorkspaceV1,
} from "@starfiniti/contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TenantContext } from "@/lib/tenant-context";

export type MigrationCommerceConnection = Readonly<{
  id: string;
  name: string;
}>;

export async function getMigrationWorkspace(
  context: TenantContext,
): Promise<MigrationWorkspaceV1 | null> {
  if (!context.programmeGroup) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("get_migration_workspace_v1", {
      target_programme_group_public_id: context.programmeGroup.public_id,
      target_limit: 20,
    });
  const row = Array.isArray(data) ? data[0] : data;
  const parsed = migrationWorkspaceV1.safeParse(
    row && typeof row === "object"
      ? (row as Record<string, unknown>).workspace
      : null,
  );
  if (error || !parsed.success) {
    throw new Error("migration_workspace_unavailable");
  }
  return parsed.data;
}

export async function listMigrationCommerceConnections(
  context: TenantContext,
): Promise<readonly MigrationCommerceConnection[]> {
  if (!context.workspace) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .from("commerce_connections")
    .select("public_id,display_name")
    .eq("organization_id", context.organization.id)
    .eq("workspace_id", context.workspace.id)
    .eq("platform", "woocommerce")
    .in("status", ["active", "rotating"])
    .order("display_name", { ascending: true });
  if (error) throw new Error("migration_connections_unavailable");
  return (data ?? []).map((row) => ({
    id: String(row.public_id),
    name: String(row.display_name),
  }));
}
