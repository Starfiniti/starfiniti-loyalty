import "server-only";

import { createHash } from "node:crypto";

import {
  enterpriseIdentityMutationResultV1,
  organizationAccessWorkspaceV1,
  organizationFederationLoginV2,
  organizationFederationWorkspaceV1,
  organizationTeamWorkspaceV1,
  type AcceptOrganizationInvitationCommandV1,
  type CreateOrganizationCommandV1,
  type CreateOrganizationInvitationCommandV1,
  type EnterpriseIdentityMutationResultV1,
  type OrganizationLifecycleCommandV1,
  type OrganizationMemberCommandV1,
  type OrganizationAccessWorkspaceV1,
  type OrganizationFederationWorkspaceV1,
  type OrganizationFederationLoginV2,
  type OrganizationTeamWorkspaceV1,
  type RevokeOrganizationInvitationCommandV1,
} from "@starfiniti/contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const INVITATION_TOKEN = /^stfi_v1_[A-Za-z0-9_-]{43}$/u;

type MutationRow = Readonly<{
  resource_public_id: string;
  outcome: string;
  revision: number | string;
  status: string;
}>;

function parseMutation(data: unknown): EnterpriseIdentityMutationResultV1 {
  const row = (Array.isArray(data) ? data[0] : data) as MutationRow | undefined;
  return enterpriseIdentityMutationResultV1.parse(
    row
      ? {
          resourceId: row.resource_public_id,
          outcome: row.outcome,
          revision: Number(row.revision),
          status: row.status,
        }
      : null,
  );
}

export function hashOrganizationInvitationTokenV1(token: string): string {
  if (!INVITATION_TOKEN.test(token)) {
    throw new Error("organization_invitation_token_invalid");
  }
  return createHash("sha256").update(token, "utf8").digest("hex");
}

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

export async function getOrganizationTeamWorkspace(
  organizationId: string,
): Promise<OrganizationTeamWorkspaceV1 | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("get_organization_team_workspace_v1", {
      target_organization_public_id: organizationId,
    });
  if (error) throw new Error("organization_team_workspace_unavailable");
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  const parsed = organizationTeamWorkspaceV1.safeParse(
    typeof row === "object" && row !== null
      ? (row as Record<string, unknown>).workspace
      : null,
  );
  if (!parsed.success) throw new Error("organization_team_workspace_invalid");
  return parsed.data;
}

export async function getOrganizationFederationWorkspace(
  organizationId: string,
): Promise<OrganizationFederationWorkspaceV1 | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("organization_federation_workspace_v1", {
      target_organization_public_id: organizationId,
    });
  if (error) throw new Error("organization_federation_workspace_unavailable");
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  const workspace =
    typeof row === "object" && row !== null && "workspace" in row
      ? (row as Record<string, unknown>).workspace
      : row;
  const parsed = organizationFederationWorkspaceV1.safeParse(workspace);
  if (!parsed.success) {
    throw new Error("organization_federation_workspace_invalid");
  }
  return parsed.data;
}

export async function resolveOrganizationFederationLogin(
  organizationSlug: string,
): Promise<OrganizationFederationLoginV2 | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("resolve_organization_federation_login_v2", {
      target_organization_slug: organizationSlug,
    });
  if (error) throw new Error("organization_federation_login_unavailable");
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  const parsed = organizationFederationLoginV2.safeParse({
    schemaVersion: "2",
    organizationId:
      typeof row === "object" && row !== null && "organization_id" in row
        ? (row as Record<string, unknown>).organization_id
        : null,
    provider:
      typeof row === "object" && row !== null && "provider" in row
        ? (row as Record<string, unknown>).provider
        : null,
  });
  if (!parsed.success) {
    throw new Error("organization_federation_login_invalid");
  }
  return parsed.data;
}

export async function claimOrganizationScimMembership(
  organizationId: string,
  correlationId: string,
): Promise<
  Readonly<{ outcome: string; role: string | null; revision: number | null }>
> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("claim_organization_scim_membership_v1", {
      target_organization_public_id: organizationId,
      target_correlation_id: correlationId,
    });
  if (error) throw new Error("organization_scim_claim_unavailable");
  const row = (Array.isArray(data) ? data[0] : data) as Readonly<{
    outcome?: unknown;
    role?: unknown;
    membership_revision?: unknown;
  }> | null;
  if (!row || typeof row.outcome !== "string") {
    throw new Error("organization_scim_claim_invalid");
  }
  const revision =
    row.membership_revision === null || row.membership_revision === undefined
      ? null
      : Number(row.membership_revision);
  if (revision !== null && (!Number.isInteger(revision) || revision < 1)) {
    throw new Error("organization_scim_claim_invalid");
  }
  return {
    outcome: row.outcome,
    role: typeof row.role === "string" ? row.role : null,
    revision,
  };
}

export async function createOrganization(command: CreateOrganizationCommandV1) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("create_organization_command_v1", {
      target_slug: command.slug,
      target_name: command.name,
      target_idempotency_key: command.idempotencyKey,
      target_correlation_id: command.correlationId,
    });
  if (error) throw error;
  return parseMutation(data);
}

export async function updateOrganizationLifecycle(
  command: OrganizationLifecycleCommandV1,
) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("update_organization_lifecycle_command_v1", {
      target_organization_public_id: command.organizationId,
      target_expected_revision: command.expectedRevision,
      target_action: command.action,
      target_name: command.name,
      target_reason: command.reason,
      target_idempotency_key: command.idempotencyKey,
      target_correlation_id: command.correlationId,
    });
  if (error) throw error;
  return parseMutation(data);
}

export async function createOrganizationInvitation(
  command: CreateOrganizationInvitationCommandV1,
) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("create_organization_invitation_command_v1", {
      target_organization_public_id: command.organizationId,
      target_display_label: command.displayLabel,
      target_role: command.role,
      target_expires_at: command.expiresAt,
      target_token_sha256: command.tokenSha256,
      target_idempotency_key: command.idempotencyKey,
      target_correlation_id: command.correlationId,
    });
  if (error) throw error;
  return parseMutation(data);
}

export async function acceptOrganizationInvitation(
  command: AcceptOrganizationInvitationCommandV1,
) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("accept_organization_invitation_command_v1", {
      target_token_sha256: command.tokenSha256,
      target_idempotency_key: command.idempotencyKey,
      target_correlation_id: command.correlationId,
    });
  if (error) throw error;
  return parseMutation(data);
}

export async function revokeOrganizationInvitation(
  command: RevokeOrganizationInvitationCommandV1,
) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("revoke_organization_invitation_command_v1", {
      target_organization_public_id: command.organizationId,
      target_invitation_public_id: command.invitationId,
      target_reason: command.reason,
      target_idempotency_key: command.idempotencyKey,
      target_correlation_id: command.correlationId,
    });
  if (error) throw error;
  return parseMutation(data);
}

export async function updateOrganizationMember(
  command: OrganizationMemberCommandV1,
) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("update_organization_member_command_v1", {
      target_organization_public_id: command.organizationId,
      target_membership_public_id: command.membershipId,
      target_expected_revision: command.expectedRevision,
      target_action: command.action,
      target_role: command.role,
      target_reason: command.reason,
      target_idempotency_key: command.idempotencyKey,
      target_correlation_id: command.correlationId,
    });
  if (error) throw error;
  return parseMutation(data);
}
