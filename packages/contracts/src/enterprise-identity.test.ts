import { describe, expect, it } from "vitest";
import {
  enterpriseAccessCatalogueV1,
  enterpriseAccessProfileV1,
  organizationAccessWorkspaceV1,
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
});
