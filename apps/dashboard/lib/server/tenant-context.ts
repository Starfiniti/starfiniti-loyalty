import "server-only";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  resolveTenantContext,
  type MembershipRow,
  type OrganizationRow,
  type ProgrammeGroupRow,
  type ProgrammeGroupWorkspaceRow,
  type TenantContext,
  type WorkspaceRow,
} from "@/lib/tenant-context";

export type AuthenticatedTenantState =
  | Readonly<{ kind: "unauthenticated" }>
  | Readonly<{ kind: "unassigned" }>
  | Readonly<{ kind: "ready"; context: TenantContext }>;

export async function getAuthenticatedTenantState(): Promise<AuthenticatedTenantState> {
  const supabase = await createSupabaseServerClient();
  const { data: claimData, error: claimError } =
    await supabase.auth.getClaims();
  const userId = claimData?.claims?.sub;
  if (claimError || typeof userId !== "string") {
    return { kind: "unauthenticated" };
  }

  const membershipResult = await supabase
    .schema("loyalty")
    .from("organization_memberships")
    .select("organization_id,role")
    .eq("user_id", userId)
    .is("revoked_at", null);
  if (membershipResult.error) throw new Error("tenant_context_unavailable");
  const memberships = (membershipResult.data ?? []) as MembershipRow[];
  if (memberships.length === 0) return { kind: "unassigned" };

  const organizationIds = memberships.map(
    ({ organization_id }) => organization_id,
  );
  const [organizationResult, workspaceResult, groupResult, linkResult] =
    await Promise.all([
      supabase
        .schema("loyalty")
        .from("organizations")
        .select("id,public_id,name,slug,status")
        .in("id", organizationIds),
      supabase
        .schema("loyalty")
        .from("workspaces")
        .select("id,public_id,organization_id,name,slug,status")
        .in("organization_id", organizationIds),
      supabase
        .schema("loyalty")
        .from("programme_groups")
        .select("id,public_id,organization_id,name,slug,status")
        .in("organization_id", organizationIds),
      supabase
        .schema("loyalty")
        .from("programme_group_workspaces")
        .select("organization_id,programme_group_id,workspace_id")
        .in("organization_id", organizationIds),
    ]);
  if (
    organizationResult.error ||
    workspaceResult.error ||
    groupResult.error ||
    linkResult.error
  ) {
    throw new Error("tenant_context_unavailable");
  }

  const cookieStore = await cookies();
  const preference = cookieStore
    .getAll()
    .find(({ name }) => name === "starfiniti_organization")?.value;
  const context = resolveTenantContext(
    {
      memberships,
      organizations: (organizationResult.data ?? []) as OrganizationRow[],
      workspaces: (workspaceResult.data ?? []) as WorkspaceRow[],
      programmeGroups: (groupResult.data ?? []) as ProgrammeGroupRow[],
      programmeGroupWorkspaces: (linkResult.data ??
        []) as ProgrammeGroupWorkspaceRow[],
    },
    preference,
  );

  return context ? { kind: "ready", context } : { kind: "unassigned" };
}
