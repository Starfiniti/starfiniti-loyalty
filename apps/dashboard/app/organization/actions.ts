"use server";

import {
  acceptOrganizationInvitationCommandV1,
  createOrganizationCommandV1,
  createOrganizationInvitationCommandV1,
  organizationLifecycleCommandV1,
  organizationMemberCommandV1,
  revokeOrganizationInvitationCommandV1,
} from "@starfiniti/contracts";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  acceptOrganizationInvitation,
  createOrganization,
  createOrganizationInvitation,
  hashOrganizationInvitationTokenV1,
  revokeOrganizationInvitation,
  updateOrganizationLifecycle,
  updateOrganizationMember,
} from "@/lib/server/enterprise-identity";

export type IdentityActionState = Readonly<{
  kind: "idle" | "success" | "error";
  message: string;
}>;

export type InvitationActionState = IdentityActionState &
  Readonly<{
    token: string | null;
    completedOperationId: string | null;
  }>;

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const RAW_INVITATION = /^stfi_v1_[A-Za-z0-9_-]{43}$/u;

function operationId(formData: FormData): string | null {
  const value = String(formData.get("operationId") ?? "");
  return UUID_V4.test(value) ? value : null;
}

function expectedRevision(formData: FormData): number | null {
  const value = String(formData.get("expectedRevision") ?? "");
  if (!/^[1-9][0-9]{0,14}$/u.test(value)) return null;
  const revision = Number(value);
  return Number.isSafeInteger(revision) ? revision : null;
}

function databaseCode(error: unknown): string | null {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : null;
}

function failureMessage(error: unknown, fallback: string): string {
  const code = databaseCode(error);
  if (code === "42501")
    return "Your live organization access no longer permits this action.";
  if (code === "40001")
    return "This page is stale. Refresh before trying again.";
  if (code === "23514")
    return "The request conflicts with the current lifecycle state.";
  if (code === "23505")
    return "That organization or invitation already exists.";
  return fallback;
}

async function selectOrganization(organizationId: string) {
  const cookieStore = await cookies();
  cookieStore.set("starfiniti_organization", organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

export async function createOrganizationAction(
  _previous: IdentityActionState,
  formData: FormData,
): Promise<IdentityActionState> {
  const operation = operationId(formData);
  if (formData.get("confirmation") !== "create" || !operation) {
    return { kind: "error", message: "Review and confirm the organization." };
  }
  const command = createOrganizationCommandV1.safeParse({
    version: "1",
    slug: formData.get("slug"),
    name: formData.get("name"),
    idempotencyKey: `organization:create:${operation}`,
    correlationId: operation,
  });
  if (!command.success) {
    return {
      kind: "error",
      message: "Enter a canonical name and lowercase URL slug.",
    };
  }
  try {
    const result = await createOrganization(command.data);
    await selectOrganization(result.resourceId);
    revalidatePath("/");
    return {
      kind: "success",
      message: "Organization created. Open the dashboard to continue setup.",
    };
  } catch (error) {
    return {
      kind: "error",
      message: failureMessage(
        error,
        "The organization could not be created safely.",
      ),
    };
  }
}

export async function createOrganizationInvitationAction(
  _previous: InvitationActionState,
  formData: FormData,
): Promise<InvitationActionState> {
  const operation = operationId(formData);
  const rawToken = String(formData.get("invitationToken") ?? "");
  const expiresAt = String(formData.get("expiresAt") ?? "");
  const expiryTime = Date.parse(expiresAt);
  const now = Date.now();
  if (
    formData.get("confirmation") !== "invite" ||
    !operation ||
    !RAW_INVITATION.test(rawToken) ||
    !Number.isFinite(expiryTime) ||
    expiryTime < now + 3_600_000 ||
    expiryTime > now + 30 * 86_400_000
  ) {
    return {
      kind: "error",
      message: "Review the role, expiry, and invitation.",
      token: null,
      completedOperationId: null,
    };
  }
  const command = createOrganizationInvitationCommandV1.safeParse({
    version: "1",
    organizationId: formData.get("organizationId"),
    displayLabel: formData.get("displayLabel"),
    role: formData.get("role"),
    expiresAt,
    tokenSha256: hashOrganizationInvitationTokenV1(rawToken),
    idempotencyKey: `organization:invitation:create:${operation}`,
    correlationId: operation,
  });
  if (!command.success) {
    return {
      kind: "error",
      message: "Enter a label and choose a membership role.",
      token: null,
      completedOperationId: null,
    };
  }
  try {
    const result = await createOrganizationInvitation(command.data);
    revalidatePath("/organization/access");
    return result.outcome === "created"
      ? {
          kind: "success",
          message: "Invitation created. Copy this token now; it is not stored.",
          token: rawToken,
          completedOperationId: operation,
        }
      : {
          kind: "success",
          message:
            "This invitation was already created. Its token cannot be shown again.",
          token: null,
          completedOperationId: operation,
        };
  } catch (error) {
    return {
      kind: "error",
      message: failureMessage(
        error,
        "The invitation could not be created safely.",
      ),
      token: null,
      completedOperationId: null,
    };
  }
}

export async function acceptOrganizationInvitationAction(
  _previous: IdentityActionState,
  formData: FormData,
): Promise<IdentityActionState> {
  const operation = operationId(formData);
  const rawToken = String(formData.get("invitationToken") ?? "").trim();
  if (
    formData.get("confirmation") !== "accept" ||
    !operation ||
    !RAW_INVITATION.test(rawToken)
  ) {
    return {
      kind: "error",
      message: "Enter and confirm a valid Starfiniti invitation token.",
    };
  }
  const command = acceptOrganizationInvitationCommandV1.safeParse({
    version: "1",
    tokenSha256: hashOrganizationInvitationTokenV1(rawToken),
    idempotencyKey: `organization:invitation:accept:${operation}`,
    correlationId: operation,
  });
  if (!command.success)
    return { kind: "error", message: "The invitation token is invalid." };
  try {
    const result = await acceptOrganizationInvitation(command.data);
    await selectOrganization(result.resourceId);
    revalidatePath("/");
    return {
      kind: "success",
      message: "Invitation accepted. Your membership is active now.",
    };
  } catch (error) {
    return {
      kind: "error",
      message: failureMessage(
        error,
        "The invitation is expired, revoked, used, or unavailable.",
      ),
    };
  }
}

export async function revokeOrganizationInvitationAction(
  _previous: IdentityActionState,
  formData: FormData,
): Promise<IdentityActionState> {
  const operation = operationId(formData);
  if (formData.get("confirmation") !== "revoke" || !operation) {
    return {
      kind: "error",
      message: "Confirm immediate invitation revocation.",
    };
  }
  const command = revokeOrganizationInvitationCommandV1.safeParse({
    version: "1",
    organizationId: formData.get("organizationId"),
    invitationId: formData.get("invitationId"),
    reason: formData.get("reason"),
    idempotencyKey: `organization:invitation:revoke:${operation}`,
    correlationId: operation,
  });
  if (!command.success)
    return {
      kind: "error",
      message: "Enter an 8–500 character revocation reason.",
    };
  try {
    await revokeOrganizationInvitation(command.data);
    revalidatePath("/organization/access");
    return { kind: "success", message: "Invitation revoked immediately." };
  } catch (error) {
    return {
      kind: "error",
      message: failureMessage(
        error,
        "The invitation could not be revoked safely.",
      ),
    };
  }
}

export async function updateOrganizationMemberAction(
  _previous: IdentityActionState,
  formData: FormData,
): Promise<IdentityActionState> {
  const operation = operationId(formData);
  const action = formData.get("memberAction");
  const revision = expectedRevision(formData);
  if (
    formData.get("confirmation") !== "member" ||
    !operation ||
    !revision ||
    !["change_role", "revoke"].includes(String(action))
  ) {
    return {
      kind: "error",
      message: "Review the member change before submitting.",
    };
  }
  const command = organizationMemberCommandV1.safeParse({
    version: "1",
    organizationId: formData.get("organizationId"),
    membershipId: formData.get("membershipId"),
    expectedRevision: revision,
    action,
    role: action === "change_role" ? formData.get("role") : null,
    reason: formData.get("reason"),
    idempotencyKey: `organization:membership:${String(action)}:${revision}:${operation}`,
    correlationId: operation,
  });
  if (!command.success)
    return {
      kind: "error",
      message: "Choose an exact role and enter an 8–500 character reason.",
    };
  try {
    const result = await updateOrganizationMember(command.data);
    revalidatePath("/organization/access");
    return {
      kind: "success",
      message:
        result.status === "revoked"
          ? "Membership revoked immediately."
          : "Membership role updated.",
    };
  } catch (error) {
    return {
      kind: "error",
      message: failureMessage(
        error,
        "The membership could not be changed safely.",
      ),
    };
  }
}

export async function updateOrganizationLifecycleAction(
  _previous: IdentityActionState,
  formData: FormData,
): Promise<IdentityActionState> {
  const operation = operationId(formData);
  const action = String(formData.get("lifecycleAction") ?? "");
  const revision = expectedRevision(formData);
  if (
    formData.get("confirmation") !== "lifecycle" ||
    !operation ||
    !revision ||
    !["rename", "suspend", "restore", "close", "offboard"].includes(action)
  ) {
    return {
      kind: "error",
      message: "Review the organization lifecycle change.",
    };
  }
  const command = organizationLifecycleCommandV1.safeParse({
    version: "1",
    organizationId: formData.get("organizationId"),
    expectedRevision: revision,
    action,
    name: action === "rename" ? formData.get("name") : null,
    reason: formData.get("reason"),
    idempotencyKey: `organization:lifecycle:${action}:${revision}:${operation}`,
    correlationId: operation,
  });
  if (!command.success)
    return {
      kind: "error",
      message: "Enter the required name and an 8–500 character reason.",
    };
  try {
    const result = await updateOrganizationLifecycle(command.data);
    revalidatePath("/");
    revalidatePath("/organization/access");
    return {
      kind: "success",
      message: `Organization ${action} completed at revision ${result.revision}.`,
    };
  } catch (error) {
    return {
      kind: "error",
      message: failureMessage(
        error,
        "The lifecycle change could not be applied safely.",
      ),
    };
  }
}
