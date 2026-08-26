"use server";

import {
  acceptAgencyInvitationCommandV1,
  createAgencyInvitationCommandV1,
  createSupportAccessRequestCommandV1,
  organizationAdministrationExportV1,
  organizationDeletionCommandV1,
  organizationSupportScopeV1,
  resolveSupportAccessRequestCommandV1,
  revokeAgencyRelationshipCommandV1,
  revokeSupportAccessGrantCommandV1,
  startOrganizationBreakGlassCommandV1,
  type OrganizationAdministrationExportV1,
  type OrganizationSupportScopeV1,
  type SupportWorkspaceV1,
} from "@starfiniti/contracts";
import { revalidatePath } from "next/cache";
import {
  acceptAgencyInvitation,
  createAgencyInvitation,
  createSupportAccessRequest,
  getOrganizationAdministrationExport,
  getSupportWorkspace,
  hashAgencyInvitationTokenV1,
  resolveSupportAccessRequest,
  revokeAgencyRelationship,
  revokeSupportAccessGrant,
  startOrganizationBreakGlass,
  updateOrganizationDeletion,
} from "@/lib/server/enterprise-administration";

export type AdministrationActionState = Readonly<{
  kind: "idle" | "success" | "error";
  message: string;
  token: string | null;
  completedOperationId: string | null;
  supportWorkspace: SupportWorkspaceV1 | null;
  exportDocument: OrganizationAdministrationExportV1 | null;
}>;

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const RAW_AGENCY_INVITATION = /^stfa_v1_[A-Za-z0-9_-]{43}$/u;
const canonicalScopes: readonly OrganizationSupportScopeV1[] = [
  "audit.summary.read",
  "identity.health.read",
  "members.summary.read",
  "organization.summary.read",
];

export const administrationIdle: AdministrationActionState = {
  kind: "idle",
  message: "",
  token: null,
  completedOperationId: null,
  supportWorkspace: null,
  exportDocument: null,
};

export async function createAgencyInvitationAction(
  _previous: AdministrationActionState,
  formData: FormData,
): Promise<AdministrationActionState> {
  const operation = operationId(formData);
  const token = String(formData.get("invitationToken") ?? "");
  const expiresAt = boundedTimestamp(formData, 15 * 60_000, 30 * 86_400_000);
  if (
    formData.get("confirmation") !== "create-agency-invitation" ||
    !operation ||
    !RAW_AGENCY_INVITATION.test(token) ||
    !expiresAt
  ) {
    return failure("Review and confirm the agency invitation boundary.");
  }
  const command = createAgencyInvitationCommandV1.safeParse({
    version: "1",
    clientOrganizationId: formData.get("organizationId"),
    agencyLabel: formData.get("agencyLabel"),
    expiresAt,
    tokenSha256: hashAgencyInvitationTokenV1(token),
    idempotencyKey: `agency:invitation:create:${operation}`,
    correlationId: operation,
  });
  if (!command.success) {
    return failure("Enter an agency label and a valid 1–30 day expiry.");
  }
  try {
    const result = await createAgencyInvitation(command.data);
    revalidateAdministration();
    return success(
      result.outcome === "created"
        ? "Agency invitation created. Copy the one-time token now."
        : "This exact invitation already exists; its token cannot be shown again.",
      {
        token: result.outcome === "created" ? token : null,
        completedOperationId: operation,
      },
    );
  } catch (error) {
    return failure(administrationFailureMessage(error));
  }
}

export async function acceptAgencyInvitationAction(
  _previous: AdministrationActionState,
  formData: FormData,
): Promise<AdministrationActionState> {
  const operation = operationId(formData);
  const token = String(formData.get("invitationToken") ?? "").trim();
  if (
    formData.get("confirmation") !== "accept-agency-invitation" ||
    !operation ||
    !RAW_AGENCY_INVITATION.test(token)
  ) {
    return failure("Enter and confirm a valid agency invitation token.");
  }
  const command = acceptAgencyInvitationCommandV1.safeParse({
    version: "1",
    agencyOrganizationId: formData.get("organizationId"),
    tokenSha256: hashAgencyInvitationTokenV1(token),
    idempotencyKey: `agency:invitation:accept:${operation}`,
    correlationId: operation,
  });
  if (!command.success) return failure("The agency invitation is invalid.");
  try {
    await acceptAgencyInvitation(command.data);
    revalidateAdministration();
    return success(
      "Agency relationship accepted. It grants no tenant membership or data access.",
      { completedOperationId: operation },
    );
  } catch (error) {
    return failure(administrationFailureMessage(error));
  }
}

export async function revokeAgencyRelationshipAction(
  _previous: AdministrationActionState,
  formData: FormData,
): Promise<AdministrationActionState> {
  const operation = operationId(formData);
  const revision = expectedRevision(formData);
  if (
    formData.get("confirmation") !== "revoke-agency-relationship" ||
    !operation ||
    !revision
  ) {
    return failure("Review and confirm immediate agency revocation.");
  }
  const command = revokeAgencyRelationshipCommandV1.safeParse({
    version: "1",
    organizationId: formData.get("organizationId"),
    relationshipId: formData.get("relationshipId"),
    expectedRevision: revision,
    reason: formData.get("reason"),
    idempotencyKey: `agency:relationship:revoke:${revision}:${operation}`,
    correlationId: operation,
  });
  if (!command.success) {
    return failure("Enter an 8–500 character agency revocation reason.");
  }
  try {
    await revokeAgencyRelationship(command.data);
    revalidateAdministration();
    return success(
      "Agency relationship and every dependent support grant were revoked.",
      { completedOperationId: operation },
    );
  } catch (error) {
    return failure(administrationFailureMessage(error));
  }
}

export async function createSupportRequestAction(
  _previous: AdministrationActionState,
  formData: FormData,
): Promise<AdministrationActionState> {
  const operation = operationId(formData);
  const expiresAt = boundedTimestamp(formData, 5 * 60_000, 4 * 3_600_000);
  const requestedScopes = scopes(formData, "scope");
  if (
    formData.get("confirmation") !== "request-support" ||
    !operation ||
    !expiresAt ||
    !requestedScopes
  ) {
    return failure(
      "Choose exact scopes, expiry, and confirm the support request.",
    );
  }
  const command = createSupportAccessRequestCommandV1.safeParse({
    version: "1",
    agencyOrganizationId: formData.get("organizationId"),
    clientOrganizationId: formData.get("clientOrganizationId"),
    scopes: requestedScopes,
    reason: formData.get("reason"),
    requestedExpiresAt: expiresAt,
    idempotencyKey: `support:request:create:${operation}`,
    correlationId: operation,
  });
  if (!command.success) {
    return failure(
      "Enter an audited reason and choose exact read-only scopes.",
    );
  }
  try {
    await createSupportAccessRequest(command.data);
    revalidateAdministration();
    return success(
      "Support requested. A separate client owner must approve the exact scope and expiry.",
      { completedOperationId: operation },
    );
  } catch (error) {
    return failure(administrationFailureMessage(error));
  }
}

export async function resolveSupportRequestAction(
  _previous: AdministrationActionState,
  formData: FormData,
): Promise<AdministrationActionState> {
  const operation = operationId(formData);
  const revision = expectedRevision(formData);
  const action = String(formData.get("supportAction") ?? "");
  const approvedScopes =
    action === "approve" ? scopes(formData, "scope") : null;
  const expiresAt =
    action === "approve"
      ? boundedTimestamp(formData, 5 * 60_000, 4 * 3_600_000)
      : null;
  if (
    formData.get("confirmation") !== "resolve-support" ||
    !operation ||
    !revision ||
    !["approve", "reject"].includes(action) ||
    (action === "approve" && (!approvedScopes || !expiresAt))
  ) {
    return failure("Review the support decision, exact scope, and expiry.");
  }
  const command = resolveSupportAccessRequestCommandV1.safeParse({
    version: "1",
    clientOrganizationId: formData.get("organizationId"),
    requestId: formData.get("requestId"),
    expectedRevision: revision,
    action,
    approvedScopes,
    expiresAt,
    reason: formData.get("reason"),
    idempotencyKey: `support:request:${action}:${revision}:${operation}`,
    correlationId: operation,
  });
  if (!command.success) {
    return failure(
      "Approve a subset of requested scopes or reject with a reason.",
    );
  }
  try {
    await resolveSupportAccessRequest(command.data);
    revalidateAdministration();
    return success(
      action === "approve"
        ? "Support grant approved for the exact scope and expiry."
        : "Support request rejected with an immutable decision record.",
      { completedOperationId: operation },
    );
  } catch (error) {
    return failure(administrationFailureMessage(error));
  }
}

export async function revokeSupportGrantAction(
  _previous: AdministrationActionState,
  formData: FormData,
): Promise<AdministrationActionState> {
  const operation = operationId(formData);
  const revision = expectedRevision(formData);
  if (
    formData.get("confirmation") !== "revoke-support" ||
    !operation ||
    !revision
  ) {
    return failure("Review and confirm immediate support revocation.");
  }
  const command = revokeSupportAccessGrantCommandV1.safeParse({
    version: "1",
    clientOrganizationId: formData.get("organizationId"),
    grantId: formData.get("grantId"),
    expectedRevision: revision,
    reason: formData.get("reason"),
    idempotencyKey: `support:grant:revoke:${revision}:${operation}`,
    correlationId: operation,
  });
  if (!command.success) {
    return failure("Enter an 8–500 character support revocation reason.");
  }
  try {
    await revokeSupportAccessGrant(command.data);
    revalidateAdministration();
    return success("Support grant revoked immediately.", {
      completedOperationId: operation,
    });
  } catch (error) {
    return failure(administrationFailureMessage(error));
  }
}

export async function openSupportWorkspaceAction(
  _previous: AdministrationActionState,
  formData: FormData,
): Promise<AdministrationActionState> {
  const operation = operationId(formData);
  if (
    formData.get("confirmation") !== "open-support" ||
    !operation ||
    !UUID.test(String(formData.get("grantId") ?? ""))
  ) {
    return failure("Confirm the audited support workspace use.");
  }
  try {
    const workspace = await getSupportWorkspace(
      String(formData.get("grantId")),
    );
    if (!workspace) {
      return failure("This support grant is no longer active or authorized.");
    }
    return success("Support workspace opened and its use was recorded.", {
      supportWorkspace: workspace,
      completedOperationId: operation,
    });
  } catch (error) {
    return failure(administrationFailureMessage(error));
  }
}

export async function startBreakGlassAction(
  _previous: AdministrationActionState,
  formData: FormData,
): Promise<AdministrationActionState> {
  const operation = operationId(formData);
  if (formData.get("confirmation") !== "start-break-glass" || !operation) {
    return failure("Confirm the AAL2 recovery session and its reason.");
  }
  const command = startOrganizationBreakGlassCommandV1.safeParse({
    version: "1",
    organizationId: formData.get("organizationId"),
    reason: formData.get("reason"),
    idempotencyKey: `organization:break-glass:start:${operation}`,
    correlationId: operation,
  });
  if (!command.success) {
    return failure("Enter an 8–500 character recovery reason.");
  }
  try {
    await startOrganizationBreakGlass(command.data);
    revalidateAdministration();
    return success("Thirty-minute AAL2 recovery session started.", {
      completedOperationId: operation,
    });
  } catch (error) {
    return failure(administrationFailureMessage(error));
  }
}

export async function exportOrganizationAdministrationAction(
  _previous: AdministrationActionState,
  formData: FormData,
): Promise<AdministrationActionState> {
  const operation = operationId(formData);
  const organizationId = String(formData.get("organizationId") ?? "");
  const sessionId = String(formData.get("breakGlassSessionId") ?? "");
  if (
    formData.get("confirmation") !== "export-administration" ||
    !operation ||
    !UUID.test(organizationId) ||
    !UUID.test(sessionId)
  ) {
    return failure("Select an active recovery session and confirm the export.");
  }
  try {
    const document = organizationAdministrationExportV1.parse(
      await getOrganizationAdministrationExport(organizationId, sessionId),
    );
    return success("Administration export prepared and use recorded.", {
      exportDocument: document,
      completedOperationId: operation,
    });
  } catch (error) {
    return failure(administrationFailureMessage(error));
  }
}

export async function updateOrganizationDeletionAction(
  _previous: AdministrationActionState,
  formData: FormData,
): Promise<AdministrationActionState> {
  const operation = operationId(formData);
  const revision = expectedRevision(formData);
  const action = String(formData.get("deletionAction") ?? "");
  const caseId = action === "request" ? null : formData.get("caseId");
  if (
    formData.get("confirmation") !== `deletion-${action}` ||
    !operation ||
    !revision ||
    !["request", "cancel", "complete"].includes(action)
  ) {
    return failure("Review the deletion action and active recovery session.");
  }
  const command = organizationDeletionCommandV1.safeParse({
    version: "1",
    organizationId: formData.get("organizationId"),
    breakGlassSessionId: formData.get("breakGlassSessionId"),
    caseId,
    expectedRevision: revision,
    action,
    reason: formData.get("reason"),
    idempotencyKey: `organization:deletion:${action}:${revision}:${operation}`,
    correlationId: operation,
  });
  if (!command.success) {
    return failure(
      "Enter an audited reason and select the exact deletion state.",
    );
  }
  try {
    const result = await updateOrganizationDeletion(command.data);
    revalidateAdministration();
    return success(
      action === "request"
        ? "Seven-day deletion cooling period started."
        : action === "cancel"
          ? "Organization deletion cancelled."
          : `Organization deletion completed at revision ${result.revision}; immutable value evidence remains.`,
      { completedOperationId: operation },
    );
  } catch (error) {
    return failure(administrationFailureMessage(error));
  }
}

function scopes(
  formData: FormData,
  key: string,
): OrganizationSupportScopeV1[] | null {
  const selected = new Set(formData.getAll(key).map((value) => String(value)));
  const values = canonicalScopes.filter((scope) => selected.has(scope));
  if (values.length !== selected.size) return null;
  const parsed = values.map((value) =>
    organizationSupportScopeV1.safeParse(value),
  );
  return parsed.every((item) => item.success) ? values : null;
}

function boundedTimestamp(
  formData: FormData,
  minimumOffset: number,
  maximumOffset: number,
): string | null {
  const value = String(formData.get("expiresAt") ?? "");
  const parsed = Date.parse(value);
  const now = Date.now();
  return Number.isFinite(parsed) &&
    parsed > now + minimumOffset &&
    parsed <= now + maximumOffset
    ? new Date(parsed).toISOString()
    : null;
}

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

function revalidateAdministration() {
  revalidatePath("/");
  revalidatePath("/organization/access");
}

function success(
  message: string,
  extra: Partial<AdministrationActionState> = {},
): AdministrationActionState {
  return { ...administrationIdle, kind: "success", message, ...extra };
}

function failure(message: string): AdministrationActionState {
  return { ...administrationIdle, kind: "error", message };
}

function administrationFailureMessage(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  if (code === "42501") {
    return "Live membership, relationship, grant, session, or assurance no longer authorizes this action.";
  }
  if (code === "40001") {
    return "This administration resource changed. Refresh before trying again.";
  }
  if (code === "23514") {
    return "The requested scope, expiry, or idempotency state conflicts with live authority.";
  }
  if (code === "23505") {
    return "This exact administration resource already exists.";
  }
  if (code === "55000") {
    return "The deletion cooling period or immutable evidence boundary blocks this action.";
  }
  return "Enterprise administration is unavailable. No authority or value was changed.";
}
