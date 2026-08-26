import { describe, expect, it } from "vitest";
import {
  createOrganizationScimEndpointCommandV1,
  organizationScimEndpointCommandV1,
  organizationScimWorkspaceV1,
  organizationScimRoleMappingCommandV1,
  SCIM_CORE_GROUP_SCHEMA,
  SCIM_CORE_USER_SCHEMA,
  SCIM_PATCH_SCHEMA,
  scimEndpointCredentialV1,
  scimGroupWriteV1,
  scimPatchRequestV1,
  scimUserWriteV1,
} from "./scim";

const organizationId = "bf2247d8-893e-49ae-8363-8423928e9cc1";
const sourceId = "bf2247d8-893e-49ae-8363-8423928e9cc2";
const endpointId = "bf2247d8-893e-49ae-8363-8423928e9cc3";
const groupId = "bf2247d8-893e-49ae-8363-8423928e9cc4";

describe("SCIM V1 contracts", () => {
  it("accepts a minimized Authentik user and requires an opaque external ID", () => {
    const user = {
      schemas: [SCIM_CORE_USER_SCHEMA],
      externalId: "e436a7cfe1e945f893db44d361338126",
      userName: "provisioned-user-17",
      displayName: "Provisioned user",
      active: true,
    };
    expect(scimUserWriteV1.safeParse(user).success).toBe(true);
    expect(
      scimUserWriteV1.safeParse({ ...user, externalId: undefined }).success,
    ).toBe(false);
    expect(
      scimUserWriteV1.safeParse({ ...user, tenantRole: "owner" }).success,
    ).toBe(false);
  });

  it("rejects duplicate group members and unbounded member authority", () => {
    const member = { value: "bf2247d8-893e-49ae-8363-8423928e9cc5" };
    const group = {
      schemas: [SCIM_CORE_GROUP_SCHEMA],
      externalId: "group-operators",
      displayName: "Loyalty operators",
      members: [member],
    };
    expect(scimGroupWriteV1.safeParse(group).success).toBe(true);
    expect(
      scimGroupWriteV1.safeParse({ ...group, members: [member, member] })
        .success,
    ).toBe(false);
  });

  it("normalizes supported patch operations and rejects missing values", () => {
    const patch = {
      schemas: [SCIM_PATCH_SCHEMA],
      Operations: [
        { op: "Replace", path: "active", value: false },
        { op: "remove", path: `members[value eq "${groupId}"]` },
      ],
    };
    const parsed = scimPatchRequestV1.safeParse(patch);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.Operations[0]?.op).toBe("replace");
    expect(
      scimPatchRequestV1.safeParse({
        schemas: [SCIM_PATCH_SCHEMA],
        Operations: [{ op: "replace", path: "active" }],
      }).success,
    ).toBe(false);
  });

  it("keeps endpoint tokens one-time and commands digest-only", () => {
    const token = `stf_scim_${"A".repeat(43)}`;
    expect(scimEndpointCredentialV1.safeParse(token).success).toBe(true);
    const create = {
      version: "1",
      organizationId,
      federationSourceId: sourceId,
      displayName: "Corporate directory",
      credentialSha256: "a".repeat(64),
      idempotencyKey: "scim:endpoint:create:1",
      correlationId: "bf2247d8-893e-49ae-8363-8423928e9cc6",
    };
    expect(
      createOrganizationScimEndpointCommandV1.safeParse(create).success,
    ).toBe(true);
    expect(
      createOrganizationScimEndpointCommandV1.safeParse({
        ...create,
        credential: token,
      }).success,
    ).toBe(false);

    const rotation = {
      version: "1",
      organizationId,
      endpointId,
      expectedRevision: 1,
      action: "rotate",
      credentialSha256: "b".repeat(64),
      reason: "Rotate the directory credential safely.",
      idempotencyKey: "scim:endpoint:rotate:1",
      correlationId: "bf2247d8-893e-49ae-8363-8423928e9cc7",
    };
    expect(organizationScimEndpointCommandV1.safeParse(rotation).success).toBe(
      true,
    );
    expect(
      organizationScimEndpointCommandV1.safeParse({
        ...rotation,
        action: "revoke",
      }).success,
    ).toBe(false);
  });

  it("prevents SCIM from mapping a group to owner", () => {
    const command = {
      version: "1",
      organizationId,
      endpointId,
      groupId,
      expectedRevision: 1,
      role: "operator",
      reason: "Allow this reviewed group to operate connectors.",
      idempotencyKey: "scim:map:1",
      correlationId: "bf2247d8-893e-49ae-8363-8423928e9cc8",
    };
    expect(
      organizationScimRoleMappingCommandV1.safeParse(command).success,
    ).toBe(true);
    expect(
      organizationScimRoleMappingCommandV1.safeParse({
        ...command,
        role: "owner",
      }).success,
    ).toBe(false);
  });

  it("parses only internally consistent minimized merchant workspaces", () => {
    const workspace = {
      schemaVersion: "1",
      organization: {
        id: organizationId,
        name: "Starfiniti",
        slug: "starfiniti",
        status: "active",
      },
      currentRole: "owner",
      mayConfigure: true,
      entitlementEnabled: true,
      endpoints: [
        {
          id: endpointId,
          federationSourceId: sourceId,
          displayName: "Corporate directory",
          status: "active",
          revision: 1,
          credentialRevision: 1,
          userCount: 4,
          activeUserCount: 3,
          boundUserCount: 2,
          groupCount: 1,
          createdAt: "2026-08-26T16:00:00Z",
          updatedAt: "2026-08-26T16:00:00Z",
          revokedAt: null,
        },
      ],
      groups: [
        {
          id: groupId,
          endpointId,
          displayName: "Loyalty operators",
          mappedRole: "operator",
          revision: 2,
          memberCount: 3,
          createdAt: "2026-08-26T16:00:00Z",
          updatedAt: "2026-08-26T16:01:00Z",
        },
      ],
      events: [
        {
          id: "bf2247d8-893e-49ae-8363-8423928e9cc9",
          endpointId,
          action: "User.PATCH",
          resourceType: "user",
          resourceId: "bf2247d8-893e-49ae-8363-8423928e9cca",
          resourceRevision: 2,
          outcome: "updated",
          createdAt: "2026-08-26T16:02:00Z",
        },
      ],
    };

    expect(organizationScimWorkspaceV1.safeParse(workspace).success).toBe(true);
    expect(
      organizationScimWorkspaceV1.safeParse({
        ...workspace,
        endpoints: [{ ...workspace.endpoints[0], boundUserCount: 5 }],
      }).success,
    ).toBe(false);
    expect(
      organizationScimWorkspaceV1.safeParse({
        ...workspace,
        groups: [{ ...workspace.groups[0], mappedRole: "owner" }],
      }).success,
    ).toBe(false);
  });
});
