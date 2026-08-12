import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TenantContext } from "@/lib/tenant-context";

export type MerchantProgrammeVersion = Readonly<{
  id: string;
  versionNumber: number;
  status: string;
  configuration: unknown;
  configurationSha256: string;
  scheduledFor: string | null;
  publishedAt: string | null;
  createdAt: string;
}>;

export type MerchantProgrammeAudit = Readonly<{
  id: string;
  action: string;
  actorUserId: string;
  resourceId: string;
  correlationId: string;
  createdAt: string;
}>;

export type MerchantProgrammeState = Readonly<{
  programme: Readonly<{
    id: string;
    name: string;
    status: string;
  }> | null;
  versions: readonly MerchantProgrammeVersion[];
  audit: readonly MerchantProgrammeAudit[];
}>;

type ProgrammeRow = Readonly<{
  id: number;
  public_id: string;
  name: string;
  status: string;
}>;

type VersionRow = Readonly<{
  public_id: string;
  version_number: number;
  status: string;
  configuration: unknown;
  configuration_sha256: string;
  scheduled_for: string | null;
  published_at: string | null;
  created_at: string;
}>;

type AuditRow = Readonly<{
  public_id: string;
  action: string;
  actor_user_id: string;
  resource_public_id: string;
  correlation_id: string;
  created_at: string;
}>;

function byteaHex(value: string): string {
  return value.startsWith("\\x") ? value.slice(2) : value;
}

export async function getMerchantProgrammeState(
  context: TenantContext,
): Promise<MerchantProgrammeState> {
  if (!context.programmeGroup) {
    return { programme: null, versions: [], audit: [] };
  }

  const supabase = await createSupabaseServerClient();
  const programmeResult = await supabase
    .schema("loyalty")
    .from("programmes")
    .select("id,public_id,name,status")
    .eq("organization_id", context.organization.id)
    .eq("programme_group_id", context.programmeGroup.id)
    .in("status", ["active", "draft"])
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (programmeResult.error) throw new Error("programme_read_unavailable");
  const programme = programmeResult.data as ProgrammeRow | null;
  if (!programme) return { programme: null, versions: [], audit: [] };

  const [versionResult, auditResult] = await Promise.all([
    supabase
      .schema("loyalty")
      .from("programme_versions")
      .select(
        "public_id,version_number,status,configuration,configuration_sha256,scheduled_for,published_at,created_at",
      )
      .eq("organization_id", context.organization.id)
      .eq("programme_id", programme.id)
      .order("version_number", { ascending: false })
      .limit(20),
    supabase
      .schema("loyalty")
      .from("admin_audit_events")
      .select(
        "public_id,action,actor_user_id,resource_public_id,correlation_id,created_at",
      )
      .eq("organization_id", context.organization.id)
      .eq("resource_type", "programme_version")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  if (versionResult.error || auditResult.error) {
    throw new Error("programme_read_unavailable");
  }

  return {
    programme: {
      id: programme.public_id,
      name: programme.name,
      status: programme.status,
    },
    versions: ((versionResult.data ?? []) as VersionRow[]).map((version) => ({
      id: version.public_id,
      versionNumber: version.version_number,
      status: version.status,
      configuration: version.configuration,
      configurationSha256: byteaHex(version.configuration_sha256),
      scheduledFor: version.scheduled_for,
      publishedAt: version.published_at,
      createdAt: version.created_at,
    })),
    audit: ((auditResult.data ?? []) as AuditRow[]).map((audit) => ({
      id: audit.public_id,
      action: audit.action,
      actorUserId: audit.actor_user_id,
      resourceId: audit.resource_public_id,
      correlationId: audit.correlation_id,
      createdAt: audit.created_at,
    })),
  };
}
