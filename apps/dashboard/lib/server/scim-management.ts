import "server-only";

import { createHash, randomBytes } from "node:crypto";
import {
  organizationScimEndpointMutationResultV1,
  organizationScimRoleMappingResultV1,
  organizationScimWorkspaceV1,
  scimEndpointCredentialV1,
  type OrganizationScimEndpointMutationResultV1,
  type OrganizationScimRoleMappingCommandV1,
  type OrganizationScimRoleMappingResultV1,
  type OrganizationScimWorkspaceV1,
  type CreateOrganizationScimEndpointCommandV1,
  type OrganizationScimEndpointCommandV1,
} from "@starfiniti/contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type EndpointMutationRow = Readonly<{
  endpoint_public_id?: unknown;
  outcome?: unknown;
  lifecycle_revision?: unknown;
  credential_revision?: unknown;
  status?: unknown;
}>;

type RoleMappingRow = Readonly<{
  group_public_id?: unknown;
  outcome?: unknown;
  lifecycle_revision?: unknown;
  mapped_role?: unknown;
}>;

export function issueOrganizationScimCredential(): Readonly<{
  credential: string;
  credentialSha256: string;
}> {
  const credential = `stf_scim_${randomBytes(32).toString("base64url")}`;
  return {
    credential: scimEndpointCredentialV1.parse(credential),
    credentialSha256: createHash("sha256")
      .update(credential, "utf8")
      .digest("hex"),
  };
}

export function hashOrganizationScimCredential(credential: string): string {
  return createHash("sha256")
    .update(scimEndpointCredentialV1.parse(credential), "utf8")
    .digest("hex");
}

export async function getOrganizationScimWorkspace(
  organizationId: string,
): Promise<OrganizationScimWorkspaceV1 | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("organization_scim_workspace_v1", {
      target_organization_public_id: organizationId,
    });
  if (error) throw new Error("organization_scim_workspace_unavailable");
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  const workspace =
    typeof row === "object" && row !== null && "workspace" in row
      ? (row as Record<string, unknown>).workspace
      : row;
  const parsed = organizationScimWorkspaceV1.safeParse(workspace);
  if (!parsed.success) throw new Error("organization_scim_workspace_invalid");
  return parsed.data;
}

export async function createOrganizationScimEndpoint(
  command: CreateOrganizationScimEndpointCommandV1,
): Promise<OrganizationScimEndpointMutationResultV1> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("create_organization_scim_endpoint_command_v1", {
      target_organization_public_id: command.organizationId,
      target_federation_source_public_id: command.federationSourceId,
      target_display_name: command.displayName,
      target_credential_sha256: bytea(command.credentialSha256),
      target_idempotency_key: command.idempotencyKey,
      target_correlation_id: command.correlationId,
    });
  if (error) throw error;
  return parseEndpointMutation(data, null);
}

export async function updateOrganizationScimEndpoint(
  command: OrganizationScimEndpointCommandV1,
): Promise<OrganizationScimEndpointMutationResultV1> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("update_organization_scim_endpoint_command_v1", {
      target_organization_public_id: command.organizationId,
      target_endpoint_public_id: command.endpointId,
      target_expected_revision: command.expectedRevision,
      target_action: command.action,
      target_credential_sha256:
        command.credentialSha256 === null
          ? null
          : bytea(command.credentialSha256),
      target_reason: command.reason,
      target_idempotency_key: command.idempotencyKey,
      target_correlation_id: command.correlationId,
    });
  if (error) throw error;
  return parseEndpointMutation(
    data,
    command.action === "revoke" ? "revoked" : "active",
  );
}

export async function mapOrganizationScimGroupRole(
  command: OrganizationScimRoleMappingCommandV1,
): Promise<OrganizationScimRoleMappingResultV1> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("map_organization_scim_group_role_command_v1", {
      target_organization_public_id: command.organizationId,
      target_endpoint_public_id: command.endpointId,
      target_group_public_id: command.groupId,
      target_expected_revision: command.expectedRevision,
      target_role: command.role,
      target_reason: command.reason,
      target_idempotency_key: command.idempotencyKey,
      target_correlation_id: command.correlationId,
    });
  if (error) throw error;
  const row = firstRow(data) as RoleMappingRow | null;
  return organizationScimRoleMappingResultV1.parse(
    row
      ? {
          groupId: row.group_public_id,
          outcome: row.outcome,
          revision: Number(row.lifecycle_revision),
          mappedRole: row.mapped_role ?? null,
        }
      : null,
  );
}

function parseEndpointMutation(
  data: unknown,
  defaultStatus: "active" | "revoked" | null,
): OrganizationScimEndpointMutationResultV1 {
  const row = firstRow(data) as EndpointMutationRow | null;
  return organizationScimEndpointMutationResultV1.parse(
    row
      ? {
          endpointId: row.endpoint_public_id,
          outcome: row.outcome,
          revision: Number(row.lifecycle_revision),
          credentialRevision: Number(row.credential_revision),
          status: row.status ?? defaultStatus,
        }
      : null,
  );
}

function firstRow(data: unknown): unknown {
  return Array.isArray(data) ? (data[0] ?? null) : data;
}

function bytea(sha256Hex: string): string {
  return `\\x${sha256Hex}`;
}
