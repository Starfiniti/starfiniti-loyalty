import { describe, expect, it } from "vitest";
import {
  configureProgrammeGroupSharingCommandV1,
  configureProgrammeGroupSharingResultV1,
  crossWorkspaceCustomerLinksV1,
  programmeGroupSharingPolicyV1,
  unlinkCrossWorkspaceCustomerAccountCommandV1,
} from "./ecosystem";

const groupId = "91000000-0000-4000-8000-000000000001";
const workspaceOne = "91000000-0000-4000-8000-000000000002";
const workspaceTwo = "91000000-0000-4000-8000-000000000003";

describe("programme group sharing contracts", () => {
  it("accepts one explicit isolated workspace", () => {
    expect(
      configureProgrammeGroupSharingCommandV1.parse({
        version: "1",
        programmeGroupId: groupId,
        mode: "isolated",
        workspaceIds: [workspaceOne],
        expectedRevision: 1,
        idempotencyKey: "sharing:configure:one",
        correlationId: "91000000-0000-4000-8000-000000000004",
      }),
    ).toMatchObject({ mode: "isolated", workspaceIds: [workspaceOne] });
  });

  it("requires an explicit multi-workspace allowlist for shared scope", () => {
    const base = {
      version: "1" as const,
      programmeGroupId: groupId,
      expectedRevision: 1,
      idempotencyKey: "sharing:configure:shared",
      correlationId: "91000000-0000-4000-8000-000000000004",
    };
    expect(
      configureProgrammeGroupSharingCommandV1.safeParse({
        ...base,
        mode: "isolated",
        workspaceIds: [workspaceOne, workspaceTwo],
      }).success,
    ).toBe(false);
    expect(
      configureProgrammeGroupSharingCommandV1.safeParse({
        ...base,
        mode: "explicit-workspace-allowlist",
        workspaceIds: [workspaceOne],
      }).success,
    ).toBe(false);
    expect(
      configureProgrammeGroupSharingCommandV1.safeParse({
        ...base,
        mode: "explicit-workspace-allowlist",
        workspaceIds: [workspaceOne, workspaceOne],
      }).success,
    ).toBe(false);
  });

  it("rejects policy projections that imply isolated sharing", () => {
    expect(
      programmeGroupSharingPolicyV1.safeParse({
        version: "1",
        programmeGroupId: groupId,
        programmeGroupName: "Rewards",
        mode: "isolated",
        revision: 2,
        configurationEnabled: true,
        workspaces: [
          {
            id: workspaceOne,
            name: "Store one",
            slug: "store-one",
            linked: true,
            removalProtected: false,
          },
          {
            id: workspaceTwo,
            name: "Store two",
            slug: "store-two",
            linked: true,
            removalProtected: false,
          },
        ],
      }).success,
    ).toBe(false);

    expect(
      programmeGroupSharingPolicyV1.safeParse({
        version: "1",
        programmeGroupId: groupId,
        programmeGroupName: "Rewards",
        mode: "explicit-workspace-allowlist",
        revision: 2,
        configurationEnabled: true,
        workspaces: [
          {
            id: workspaceOne,
            name: "Store one",
            slug: "store-one",
            linked: true,
            removalProtected: false,
          },
          {
            id: workspaceTwo,
            name: "Store two",
            slug: "store-two",
            linked: false,
            removalProtected: false,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("keeps result workspace selectors exact and unique", () => {
    expect(
      configureProgrammeGroupSharingResultV1.parse({
        resourceId: "91000000-0000-4000-8000-000000000005",
        outcome: "created",
        revision: 2,
        mode: "explicit-workspace-allowlist",
        workspaceIds: [workspaceOne, workspaceTwo],
      }).workspaceIds,
    ).toEqual([workspaceOne, workspaceTwo]);
    expect(
      configureProgrammeGroupSharingResultV1.safeParse({
        resourceId: "91000000-0000-4000-8000-000000000005",
        outcome: "created",
        revision: 2,
        mode: "explicit-workspace-allowlist",
        workspaceIds: [workspaceOne, workspaceOne],
      }).success,
    ).toBe(false);
    expect(
      configureProgrammeGroupSharingResultV1.safeParse({
        resourceId: "91000000-0000-4000-8000-000000000005",
        outcome: "created",
        revision: 2,
        mode: "explicit-workspace-allowlist",
        workspaceIds: [workspaceOne],
      }).success,
    ).toBe(false);
  });
});

describe("cross-workspace customer link contracts", () => {
  const canonicalMember = {
    accountId: "92000000-0000-4000-8000-000000000001",
    workspaceId: workspaceOne,
    workspaceName: "Store one",
    storeName: "Store one",
    canonical: true,
    canUnlink: false,
    linkedAt: "2026-08-26T08:00:00.000Z",
  } as const;
  const secondaryMember = {
    accountId: "92000000-0000-4000-8000-000000000002",
    workspaceId: workspaceTwo,
    workspaceName: "Store two",
    storeName: "Store two",
    canonical: false,
    canUnlink: true,
    linkedAt: "2026-08-26T08:01:00.000Z",
  } as const;

  it("accepts one minimized active link with exactly one canonical account", () => {
    expect(
      crossWorkspaceCustomerLinksV1.parse({
        version: "1",
        links: [
          {
            version: "1",
            linkSetId: "92000000-0000-4000-8000-000000000003",
            programmeGroupId: groupId,
            programmeGroupName: "Shared rewards",
            revision: 1,
            state: "active",
            members: [canonicalMember, secondaryMember],
          },
        ],
      }).links[0]?.members,
    ).toHaveLength(2);
  });

  it("rejects duplicate workspaces, multiple canonical accounts, and active singletons", () => {
    const base = {
      version: "1" as const,
      linkSetId: "92000000-0000-4000-8000-000000000003",
      programmeGroupId: groupId,
      programmeGroupName: "Shared rewards",
      revision: 1,
    };
    expect(
      crossWorkspaceCustomerLinksV1.safeParse({
        version: "1",
        links: [
          {
            ...base,
            state: "active",
            members: [{ ...canonicalMember, canUnlink: true }],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      crossWorkspaceCustomerLinksV1.safeParse({
        version: "1",
        links: [
          {
            ...base,
            state: "active",
            members: [
              canonicalMember,
              {
                ...secondaryMember,
                workspaceId: workspaceOne,
                canonical: true,
                canUnlink: false,
              },
            ],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("accepts only bounded public selectors for customer unlink", () => {
    expect(
      unlinkCrossWorkspaceCustomerAccountCommandV1.parse({
        version: "1",
        accountId: secondaryMember.accountId,
        idempotencyKey: "customer-link:unlink:one",
        correlationId: "92000000-0000-4000-8000-000000000004",
      }),
    ).toMatchObject({ accountId: secondaryMember.accountId });
    expect(
      unlinkCrossWorkspaceCustomerAccountCommandV1.safeParse({
        version: "1",
        accountId: secondaryMember.accountId,
        organizationId: groupId,
        idempotencyKey: "customer-link:unlink:one",
        correlationId: "92000000-0000-4000-8000-000000000004",
      }).success,
    ).toBe(false);
  });
});
