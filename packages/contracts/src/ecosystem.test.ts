import { describe, expect, it } from "vitest";
import {
  configureProgrammeGroupSharingCommandV1,
  configureProgrammeGroupSharingResultV1,
  programmeGroupSharingPolicyV1,
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
