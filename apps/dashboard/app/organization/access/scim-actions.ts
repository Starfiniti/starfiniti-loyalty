"use server";

import {
  createOrganizationScimEndpointCommandV1,
  organizationScimEndpointCommandV1,
  organizationScimRoleMappingCommandV1,
  scimEndpointCredentialV1,
} from "@starfiniti/contracts";
import { revalidatePath } from "next/cache";
import {
  createOrganizationScimEndpoint,
  hashOrganizationScimCredential,
  mapOrganizationScimGroupRole,
  updateOrganizationScimEndpoint,
} from "@/lib/server/scim-management";

export type ScimActionState = Readonly<{
  kind: "idle" | "success" | "error";
  message: string;
  credential: string | null;
  endpointUrl: string | null;
}>;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function createScimEndpointAction(
  _previous: ScimActionState,
  formData: FormData,
): Promise<ScimActionState> {
  const operation = operationId(formData);
  const rawCredential = credential(formData);
  const origin = publicOrigin();
  if (
    formData.get("confirmation") !== "create-scim-endpoint" ||
    !operation ||
    !rawCredential ||
    !origin
  ) {
    return failure("Review and confirm the directory endpoint trust boundary.");
  }
  const command = createOrganizationScimEndpointCommandV1.safeParse({
    version: "1",
    organizationId: formData.get("organizationId"),
    federationSourceId: formData.get("federationSourceId"),
    displayName: formData.get("displayName"),
    credentialSha256: hashOrganizationScimCredential(rawCredential),
    idempotencyKey: `scim:endpoint:create:${operation}`,
    correlationId: operation,
  });
  if (!command.success) {
    return failure(
      "Choose a validated identity provider and enter a directory name.",
    );
  }
  try {
    const result = await createOrganizationScimEndpoint(command.data);
    revalidatePath("/organization/access");
    return {
      kind: "success",
      message:
        "Directory endpoint created. Copy the credential now; only its digest is retained.",
      credential: rawCredential,
      endpointUrl: `${origin}/api/scim/${result.endpointId}/v2`,
    };
  } catch (error) {
    return failure(scimFailureMessage(error));
  }
}

export async function updateScimEndpointAction(
  _previous: ScimActionState,
  formData: FormData,
): Promise<ScimActionState> {
  const operation = operationId(formData);
  const action = String(formData.get("scimAction") ?? "");
  const revision = expectedRevision(formData);
  const rawCredential = action === "rotate" ? credential(formData) : null;
  const origin = publicOrigin();
  if (
    formData.get("confirmation") !== "scim-endpoint-lifecycle" ||
    !operation ||
    !revision ||
    !origin ||
    !["rotate", "revoke"].includes(action) ||
    (action === "rotate" && !rawCredential)
  ) {
    return failure("Review and confirm the endpoint lifecycle change.");
  }
  const command = organizationScimEndpointCommandV1.safeParse({
    version: "1",
    organizationId: formData.get("organizationId"),
    endpointId: formData.get("endpointId"),
    expectedRevision: revision,
    action,
    credentialSha256:
      rawCredential === null
        ? null
        : hashOrganizationScimCredential(rawCredential),
    reason: formData.get("reason"),
    idempotencyKey: `scim:endpoint:${action}:${revision}:${operation}`,
    correlationId: operation,
  });
  if (!command.success) {
    return failure("Enter an 8–500 character reason and confirm the action.");
  }
  try {
    const result = await updateOrganizationScimEndpoint(command.data);
    revalidatePath("/organization/access");
    return {
      kind: "success",
      message:
        action === "rotate"
          ? "Credential rotated. The previous credential is invalid immediately."
          : "Endpoint revoked. Provisioned memberships will fail closed.",
      credential: rawCredential,
      endpointUrl:
        action === "rotate"
          ? `${origin}/api/scim/${result.endpointId}/v2`
          : null,
    };
  } catch (error) {
    return failure(scimFailureMessage(error));
  }
}

export async function mapScimGroupRoleAction(
  _previous: ScimActionState,
  formData: FormData,
): Promise<ScimActionState> {
  const operation = operationId(formData);
  const revision = expectedRevision(formData);
  const role = String(formData.get("role") ?? "") || null;
  if (
    formData.get("confirmation") !== "map-scim-group" ||
    !operation ||
    !revision
  ) {
    return failure(
      "Review the group mapping and confirm its authorization effect.",
    );
  }
  const command = organizationScimRoleMappingCommandV1.safeParse({
    version: "1",
    organizationId: formData.get("organizationId"),
    endpointId: formData.get("endpointId"),
    groupId: formData.get("groupId"),
    expectedRevision: revision,
    role,
    reason: formData.get("reason"),
    idempotencyKey: `scim:group:map:${revision}:${operation}`,
    correlationId: operation,
  });
  if (!command.success) {
    return failure(
      "Choose a non-owner role or no access, and enter an audited reason.",
    );
  }
  try {
    const result = await mapOrganizationScimGroupRole(command.data);
    revalidatePath("/organization/access");
    return {
      kind: "success",
      message: result.mappedRole
        ? `Group mapped to ${result.mappedRole}. Matching provisioned memberships were reconciled.`
        : "Group access removed. Matching SCIM memberships were reconciled.",
      credential: null,
      endpointUrl: null,
    };
  } catch (error) {
    return failure(scimFailureMessage(error));
  }
}

function credential(formData: FormData): string | null {
  const parsed = scimEndpointCredentialV1.safeParse(formData.get("credential"));
  return parsed.success ? parsed.data : null;
}

function operationId(formData: FormData): string | null {
  const value = String(formData.get("operationId") ?? "");
  return UUID.test(value) ? value : null;
}

function expectedRevision(formData: FormData): number | null {
  const value = String(formData.get("expectedRevision") ?? "");
  if (!/^[1-9][0-9]{0,14}$/u.test(value)) return null;
  const revision = Number(value);
  return Number.isSafeInteger(revision) ? revision : null;
}

function publicOrigin(): string | null {
  const value = process.env.DASHBOARD_PUBLIC_ORIGIN?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.pathname !== "/") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function failure(message: string): ScimActionState {
  return { kind: "error", message, credential: null, endpointUrl: null };
}

function scimFailureMessage(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  if (code === "42501") {
    return "Your live organization role or enterprise entitlement no longer permits this change.";
  }
  if (code === "40001") {
    return "This directory resource changed. Refresh before applying the reviewed action.";
  }
  if (code === "23514") {
    return "The identity provider, endpoint, or idempotency state conflicts with this action.";
  }
  return "Directory provisioning management is unavailable. No authority was changed.";
}
