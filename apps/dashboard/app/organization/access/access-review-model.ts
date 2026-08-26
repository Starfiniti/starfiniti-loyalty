import type {
  EnterpriseAccessProfileV1,
  OrganizationAccessWorkspaceV1,
} from "@starfiniti/contracts";

const permissionLabels = {
  "organization.view": "View organization",
  "organization.lifecycle.manage": "Manage lifecycle",
  "members.view": "Review member access",
  "members.manage": "Manage membership",
  "identity.configure": "Configure SSO and SCIM",
  "support.approve": "Approve support access",
  "agency.manage": "Manage agency access",
  "audit.view": "Review audit evidence",
} as const;

export function permissionLabel(
  permission: keyof typeof permissionLabels,
): string {
  return permissionLabels[permission];
}

export function activeMembershipTotal(
  workspace: OrganizationAccessWorkspaceV1,
): number {
  return workspace.activeMembershipCounts.reduce(
    (total, item) => total + item.count,
    0,
  );
}

export function profileAssignmentSummary(
  profile: EnterpriseAccessProfileV1,
  workspace: OrganizationAccessWorkspaceV1,
): string {
  if (profile.assignmentKind === "support_grant") return "On-demand only";
  const count =
    workspace.activeMembershipCounts.find(({ role }) => role === profile.role)
      ?.count ?? 0;
  return `${count} active ${count === 1 ? "member" : "members"}`;
}
