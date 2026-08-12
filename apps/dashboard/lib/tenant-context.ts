export type MembershipRole =
  "owner" | "admin" | "operator" | "analyst" | "auditor";

export type MembershipRow = Readonly<{
  organization_id: number;
  role: MembershipRole;
}>;

export type OrganizationRow = Readonly<{
  id: number;
  public_id: string;
  name: string;
  slug: string;
  status: string;
}>;

export type WorkspaceRow = Readonly<{
  id: number;
  public_id: string;
  organization_id: number;
  name: string;
  slug: string;
  status: string;
}>;

export type ProgrammeGroupRow = Readonly<{
  id: number;
  public_id: string;
  organization_id: number;
  name: string;
  slug: string;
  status: string;
}>;

export type ProgrammeGroupWorkspaceRow = Readonly<{
  organization_id: number;
  programme_group_id: number;
  workspace_id: number;
}>;

export type TenantSnapshot = Readonly<{
  memberships: readonly MembershipRow[];
  organizations: readonly OrganizationRow[];
  workspaces: readonly WorkspaceRow[];
  programmeGroups: readonly ProgrammeGroupRow[];
  programmeGroupWorkspaces: readonly ProgrammeGroupWorkspaceRow[];
}>;

export type TenantContext = Readonly<{
  organization: OrganizationRow;
  membershipRole: MembershipRole;
  workspace: WorkspaceRow | null;
  programmeGroup: ProgrammeGroupRow | null;
  availableOrganizations: readonly OrganizationRow[];
}>;

function byNameThenId<T extends { name: string; id: number }>(a: T, b: T) {
  return a.name.localeCompare(b.name) || a.id - b.id;
}

export function resolveTenantContext(
  snapshot: TenantSnapshot,
  preferredOrganizationPublicId?: string,
): TenantContext | null {
  const membershipByOrganization = new Map(
    snapshot.memberships.map((membership) => [
      membership.organization_id,
      membership,
    ]),
  );
  const organizations = [...snapshot.organizations]
    .filter(
      (organization) =>
        organization.status === "active" &&
        membershipByOrganization.has(organization.id),
    )
    .sort(byNameThenId);
  if (organizations.length === 0) return null;

  const organization =
    organizations.find(
      (candidate) => candidate.public_id === preferredOrganizationPublicId,
    ) ?? organizations[0];
  if (!organization) return null;

  const membership = membershipByOrganization.get(organization.id);
  if (!membership) return null;

  const workspace =
    [...snapshot.workspaces]
      .filter(
        (candidate) =>
          candidate.organization_id === organization.id &&
          candidate.status === "active",
      )
      .sort(byNameThenId)[0] ?? null;

  const linkedProgrammeGroupIds = new Set(
    workspace
      ? snapshot.programmeGroupWorkspaces
          .filter(
            (link) =>
              link.organization_id === organization.id &&
              link.workspace_id === workspace.id,
          )
          .map((link) => link.programme_group_id)
      : [],
  );
  const organizationProgrammeGroups = [...snapshot.programmeGroups]
    .filter(
      (candidate) =>
        candidate.organization_id === organization.id &&
        candidate.status === "active",
    )
    .sort(byNameThenId);
  const programmeGroup =
    organizationProgrammeGroups.find((candidate) =>
      linkedProgrammeGroupIds.has(candidate.id),
    ) ??
    organizationProgrammeGroups[0] ??
    null;

  return {
    organization,
    membershipRole: membership.role,
    workspace,
    programmeGroup,
    availableOrganizations: organizations,
  };
}
