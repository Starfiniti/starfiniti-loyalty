import { describe, expect, it } from "vitest";
import {
  acceptOrganizationInvitationCommandV1,
  createOrganizationCommandV1,
  createOrganizationInvitationCommandV1,
  enterpriseAccessCatalogueV1,
  enterpriseAccessProfileV1,
  organizationLifecycleCommandV1,
  organizationMemberCommandV1,
  organizationAccessWorkspaceV1,
  organizationTeamWorkspaceV1,
} from "./enterprise-identity";

const profiles = [
  {
    role: "owner",
    label: "Owner",
    description: "Controls tenant identity and recovery.",
    assignmentKind: "membership",
    permissions: [
      "organization.view",
      "organization.lifecycle.manage",
      "members.view",
      "members.manage",
      "identity.configure",
      "support.approve",
      "agency.manage",
      "audit.view",
    ],
  },
  {
    role: "admin",
    label: "Admin",
    description: "Administers members and enterprise identity.",
    assignmentKind: "membership",
    permissions: [
      "organization.view",
      "members.view",
      "members.manage",
      "identity.configure",
      "audit.view",
    ],
  },
  {
    role: "marketer",
    label: "Marketer",
    description: "Operates marketing configuration outside M13.",
    assignmentKind: "membership",
    permissions: ["organization.view"],
  },
  {
    role: "operator",
    label: "Operator",
    description: "Operates connectors and fulfilment outside M13.",
    assignmentKind: "membership",
    permissions: ["organization.view"],
  },
  {
    role: "support",
    label: "Support",
    description: "Uses an approved scoped and expiring support grant.",
    assignmentKind: "support_grant",
    permissions: ["organization.view"],
  },
  {
    role: "analyst",
    label: "Analyst",
    description: "Reads tenant reporting outside M13.",
    assignmentKind: "membership",
    permissions: ["organization.view"],
  },
  {
    role: "auditor",
    label: "Auditor",
    description: "Reviews membership and audit evidence.",
    assignmentKind: "membership",
    permissions: ["organization.view", "members.view", "audit.view"],
  },
] as const;

const workspace = {
  schemaVersion: "1",
  organization: {
    id: "bf2247d8-893e-49ae-8363-8423928e9cc1",
    name: "Starfiniti",
    slug: "starfiniti",
    status: "active",
  },
  currentAccess: {
    role: "admin",
    assignmentKind: "membership",
    effective: true,
    permissions: profiles[1].permissions,
  },
  catalogue: { schemaVersion: "1", profiles },
  activeMembershipCounts: [
    { role: "owner", count: 1 },
    { role: "admin", count: 2 },
    { role: "marketer", count: 0 },
    { role: "operator", count: 3 },
    { role: "analyst", count: 1 },
    { role: "auditor", count: 1 },
  ],
} as const;

describe("enterprise identity contracts", () => {
  it("requires all seven exact access profiles", () => {
    expect(
      enterpriseAccessCatalogueV1.safeParse({
        schemaVersion: "1",
        profiles,
      }).success,
    ).toBe(true);
    expect(
      enterpriseAccessCatalogueV1.safeParse({
        schemaVersion: "1",
        profiles: profiles.slice(0, 6),
      }).success,
    ).toBe(false);
  });

  it("keeps support grant-only and rejects support membership semantics", () => {
    expect(enterpriseAccessProfileV1.safeParse(profiles[4]).success).toBe(true);
    expect(
      enterpriseAccessProfileV1.safeParse({
        ...profiles[4],
        assignmentKind: "membership",
      }).success,
    ).toBe(false);
    expect(
      organizationAccessWorkspaceV1.safeParse({
        ...workspace,
        activeMembershipCounts: [
          ...workspace.activeMembershipCounts.slice(0, 5),
          { role: "support", count: 1 },
        ],
      }).success,
    ).toBe(false);
  });

  it("requires current access to match the database catalogue exactly", () => {
    expect(organizationAccessWorkspaceV1.safeParse(workspace).success).toBe(
      true,
    );
    expect(
      organizationAccessWorkspaceV1.safeParse({
        ...workspace,
        currentAccess: {
          ...workspace.currentAccess,
          permissions: ["organization.view"],
        },
      }).success,
    ).toBe(false);
  });

  it("carries explicit inactive access state for suspended organizations", () => {
    expect(
      organizationAccessWorkspaceV1.safeParse({
        ...workspace,
        organization: { ...workspace.organization, status: "suspended" },
        currentAccess: { ...workspace.currentAccess, effective: false },
      }).success,
    ).toBe(true);
    expect(
      organizationAccessWorkspaceV1.safeParse({
        ...workspace,
        organization: { ...workspace.organization, status: "suspended" },
      }).success,
    ).toBe(false);
  });

  it("rejects identity, claim, and tenant authority fields", () => {
    expect(
      organizationAccessWorkspaceV1.safeParse({
        ...workspace,
        actorUserId: "bf2247d8-893e-49ae-8363-8423928e9cc9",
      }).success,
    ).toBe(false);
    expect(
      organizationAccessWorkspaceV1.safeParse({
        ...workspace,
        currentAccess: {
          ...workspace.currentAccess,
          email: "owner@example.test",
          groups: ["tenant-admin"],
        },
      }).success,
    ).toBe(false);
  });

  it("requires canonical organization creation and lifecycle commands", () => {
    const common = {
      version: "1",
      idempotencyKey: "organization:create:case-1",
      correlationId: "bf2247d8-893e-49ae-8363-8423928e9cc2",
    } as const;
    expect(
      createOrganizationCommandV1.safeParse({
        ...common,
        slug: "new-company",
        name: "New Company",
      }).success,
    ).toBe(true);
    expect(
      createOrganizationCommandV1.safeParse({
        ...common,
        slug: "New Company",
        name: "New Company",
      }).success,
    ).toBe(false);
    expect(
      organizationLifecycleCommandV1.safeParse({
        ...common,
        organizationId: workspace.organization.id,
        expectedRevision: 2,
        action: "rename",
        name: "Renamed Company",
        reason: "Legal company name changed.",
      }).success,
    ).toBe(true);
    expect(
      organizationLifecycleCommandV1.safeParse({
        ...common,
        organizationId: workspace.organization.id,
        expectedRevision: 2,
        action: "suspend",
        name: "Unexpected name",
        reason: "Investigating account access.",
      }).success,
    ).toBe(false);
  });

  it("binds invitations to a secret digest and exact immutable role", () => {
    const invitation = {
      version: "1",
      organizationId: workspace.organization.id,
      displayLabel: "Jane — Marketing",
      role: "marketer",
      expiresAt: "2026-08-28T10:00:00.000Z",
      tokenSha256: "a".repeat(64),
      idempotencyKey: "organization:invite:case-1",
      correlationId: "bf2247d8-893e-49ae-8363-8423928e9cc3",
    } as const;
    expect(
      createOrganizationInvitationCommandV1.safeParse(invitation).success,
    ).toBe(true);
    expect(
      createOrganizationInvitationCommandV1.safeParse({
        ...invitation,
        role: "support",
      }).success,
    ).toBe(false);
    expect(
      acceptOrganizationInvitationCommandV1.safeParse({
        version: "1",
        tokenSha256: "b".repeat(64),
        idempotencyKey: "organization:invite:accept:case-1",
        correlationId: "bf2247d8-893e-49ae-8363-8423928e9cc4",
      }).success,
    ).toBe(true);
  });

  it("requires role-change and revocation payloads to be unambiguous", () => {
    const common = {
      version: "1",
      organizationId: workspace.organization.id,
      membershipId: "bf2247d8-893e-49ae-8363-8423928e9cc5",
      expectedRevision: 1,
      reason: "Approved responsibility change.",
      idempotencyKey: "organization:member:case-1",
      correlationId: "bf2247d8-893e-49ae-8363-8423928e9cc6",
    } as const;
    expect(
      organizationMemberCommandV1.safeParse({
        ...common,
        action: "change_role",
        role: "analyst",
      }).success,
    ).toBe(true);
    expect(
      organizationMemberCommandV1.safeParse({
        ...common,
        action: "revoke",
        role: "analyst",
      }).success,
    ).toBe(false);
  });

  it("validates a minimized team workspace with owner quorum", () => {
    const document = {
      schemaVersion: "1",
      organization: {
        ...workspace.organization,
        lifecycleRevision: 1,
        createdAt: "2026-08-26T10:00:00.000Z",
        updatedAt: "2026-08-26T10:00:00.000Z",
        closedAt: null,
        offboardedAt: null,
      },
      currentRole: "owner",
      mayManageLifecycle: true,
      mayManageMembers: true,
      mayExport: true,
      members: [
        {
          id: "bf2247d8-893e-49ae-8363-8423928e9cc7",
          displayLabel: "Current owner",
          role: "owner",
          status: "active",
          isCurrent: true,
          revision: 1,
          createdAt: "2026-08-26T10:00:00.000Z",
          revokedAt: null,
        },
      ],
      invitations: [],
      recentEvents: [],
    } as const;
    expect(organizationTeamWorkspaceV1.safeParse(document).success).toBe(true);
    expect(
      organizationTeamWorkspaceV1.safeParse({
        ...document,
        members: [{ ...document.members[0], role: "admin" }],
      }).success,
    ).toBe(false);
    expect(
      organizationTeamWorkspaceV1.safeParse({
        ...document,
        actorUserId: "bf2247d8-893e-49ae-8363-8423928e9cc8",
      }).success,
    ).toBe(false);
  });
});
