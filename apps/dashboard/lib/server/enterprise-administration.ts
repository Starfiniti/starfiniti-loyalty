import "server-only";

import { createHash } from "node:crypto";

import {
  agencyPortfolioWorkspaceV1,
  enterpriseIdentityMutationResultV1,
  organizationAdministrationExportV1,
  organizationRecoveryWorkspaceV1,
  supportAdministrationWorkspaceV1,
  supportWorkspaceV1,
  type AcceptAgencyInvitationCommandV1,
  type AgencyPortfolioWorkspaceV1,
  type CreateAgencyInvitationCommandV1,
  type CreateSupportAccessRequestCommandV1,
  type EnterpriseIdentityMutationResultV1,
  type OrganizationAdministrationExportV1,
  type OrganizationDeletionCommandV1,
  type OrganizationRecoveryWorkspaceV1,
  type ResolveSupportAccessRequestCommandV1,
  type RevokeAgencyRelationshipCommandV1,
  type RevokeSupportAccessGrantCommandV1,
  type StartOrganizationBreakGlassCommandV1,
  type SupportAdministrationWorkspaceV1,
  type SupportWorkspaceV1,
} from "@starfiniti/contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const AGENCY_INVITATION_TOKEN = /^stfa_v1_[A-Za-z0-9_-]{43}$/u;

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

function projection(data: unknown, key: "workspace" | "document"): unknown {
  const row = Array.isArray(data) ? data[0] : data;
  return typeof row === "object" && row !== null && key in row
    ? (row as Record<string, unknown>)[key]
    : null;
}

export function hashAgencyInvitationTokenV1(token: string): string {
  if (!AGENCY_INVITATION_TOKEN.test(token)) {
    throw new Error("agency_invitation_token_invalid");
  }
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function getAgencyPortfolioWorkspace(
  organizationId: string,
): Promise<AgencyPortfolioWorkspaceV1 | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("get_organization_agency_portfolio_v1", {
      target_organization_public_id: organizationId,
    });
  if (error) throw new Error("agency_portfolio_unavailable");
  const workspace = projection(data, "workspace");
  if (!workspace) return null;
  const parsed = agencyPortfolioWorkspaceV1.safeParse(workspace);
  if (!parsed.success) throw new Error("agency_portfolio_invalid");
  return parsed.data;
}

export async function getSupportAdministrationWorkspace(
  organizationId: string,
): Promise<SupportAdministrationWorkspaceV1 | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("get_support_administration_workspace_v1", {
      target_organization_public_id: organizationId,
    });
  if (error) throw new Error("support_administration_unavailable");
  const workspace = projection(data, "workspace");
  if (!workspace) return null;
  const parsed = supportAdministrationWorkspaceV1.safeParse(workspace);
  if (!parsed.success) throw new Error("support_administration_invalid");
  return parsed.data;
}

export async function getOrganizationRecoveryWorkspace(
  organizationId: string,
): Promise<OrganizationRecoveryWorkspaceV1 | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("get_organization_recovery_workspace_v1", {
      target_organization_public_id: organizationId,
    });
  if (error) throw new Error("organization_recovery_unavailable");
  const workspace = projection(data, "workspace");
  if (!workspace) return null;
  const parsed = organizationRecoveryWorkspaceV1.safeParse(workspace);
  if (!parsed.success) throw new Error("organization_recovery_invalid");
  return parsed.data;
}

export async function createAgencyInvitation(
  command: CreateAgencyInvitationCommandV1,
) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("create_organization_agency_invitation_command_v1", {
      target_client_organization_public_id: command.clientOrganizationId,
      target_agency_label: command.agencyLabel,
      target_expires_at: command.expiresAt,
      target_token_sha256: command.tokenSha256,
      target_idempotency_key: command.idempotencyKey,
      target_correlation_id: command.correlationId,
    });
  if (error) throw error;
  return parseMutation(data);
}

export async function acceptAgencyInvitation(
  command: AcceptAgencyInvitationCommandV1,
) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("accept_organization_agency_invitation_command_v1", {
      target_agency_organization_public_id: command.agencyOrganizationId,
      target_token_sha256: command.tokenSha256,
      target_idempotency_key: command.idempotencyKey,
      target_correlation_id: command.correlationId,
    });
  if (error) throw error;
  return parseMutation(data);
}

export async function revokeAgencyRelationship(
  command: RevokeAgencyRelationshipCommandV1,
) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("revoke_organization_agency_relationship_command_v1", {
      target_organization_public_id: command.organizationId,
      target_relationship_public_id: command.relationshipId,
      target_expected_revision: command.expectedRevision,
      target_reason: command.reason,
      target_idempotency_key: command.idempotencyKey,
      target_correlation_id: command.correlationId,
    });
  if (error) throw error;
  return parseMutation(data);
}

export async function createSupportAccessRequest(
  command: CreateSupportAccessRequestCommandV1,
) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("create_support_access_request_command_v1", {
      target_agency_organization_public_id: command.agencyOrganizationId,
      target_client_organization_public_id: command.clientOrganizationId,
      target_scopes: [...command.scopes],
      target_reason: command.reason,
      target_requested_expires_at: command.requestedExpiresAt,
      target_idempotency_key: command.idempotencyKey,
      target_correlation_id: command.correlationId,
    });
  if (error) throw error;
  return parseMutation(data);
}

export async function resolveSupportAccessRequest(
  command: ResolveSupportAccessRequestCommandV1,
) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("resolve_support_access_request_command_v1", {
      target_client_organization_public_id: command.clientOrganizationId,
      target_request_public_id: command.requestId,
      target_expected_revision: command.expectedRevision,
      target_action: command.action,
      target_approved_scopes: command.approvedScopes
        ? [...command.approvedScopes]
        : null,
      target_expires_at: command.expiresAt,
      target_reason: command.reason,
      target_idempotency_key: command.idempotencyKey,
      target_correlation_id: command.correlationId,
    });
  if (error) throw error;
  return parseMutation(data);
}

export async function revokeSupportAccessGrant(
  command: RevokeSupportAccessGrantCommandV1,
) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("revoke_support_access_grant_command_v1", {
      target_client_organization_public_id: command.clientOrganizationId,
      target_grant_public_id: command.grantId,
      target_expected_revision: command.expectedRevision,
      target_reason: command.reason,
      target_idempotency_key: command.idempotencyKey,
      target_correlation_id: command.correlationId,
    });
  if (error) throw error;
  return parseMutation(data);
}

export async function getSupportWorkspace(
  grantId: string,
): Promise<SupportWorkspaceV1 | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("get_support_workspace_v1", { target_grant_public_id: grantId });
  if (error) throw error;
  const workspace = projection(data, "workspace");
  if (!workspace) return null;
  const parsed = supportWorkspaceV1.safeParse(workspace);
  if (!parsed.success) throw new Error("support_workspace_invalid");
  return parsed.data;
}

export async function startOrganizationBreakGlass(
  command: StartOrganizationBreakGlassCommandV1,
) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("start_organization_break_glass_command_v1", {
      target_organization_public_id: command.organizationId,
      target_reason: command.reason,
      target_idempotency_key: command.idempotencyKey,
      target_correlation_id: command.correlationId,
    });
  if (error) throw error;
  return parseMutation(data);
}

export async function getOrganizationAdministrationExport(
  organizationId: string,
  breakGlassSessionId: string,
): Promise<OrganizationAdministrationExportV1> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("get_organization_administration_export_v1", {
      target_organization_public_id: organizationId,
      target_break_glass_session_public_id: breakGlassSessionId,
    });
  if (error) throw error;
  return organizationAdministrationExportV1.parse(projection(data, "document"));
}

export async function updateOrganizationDeletion(
  command: OrganizationDeletionCommandV1,
) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("organization_deletion_command_v1", {
      target_organization_public_id: command.organizationId,
      target_break_glass_session_public_id: command.breakGlassSessionId,
      target_case_public_id: command.caseId,
      target_expected_revision: command.expectedRevision,
      target_action: command.action,
      target_reason: command.reason,
      target_idempotency_key: command.idempotencyKey,
      target_correlation_id: command.correlationId,
    });
  if (error) throw error;
  return parseMutation(data);
}
