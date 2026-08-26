import { describe, expect, it } from "vitest";
import type { OrganizationAccessWorkspaceV1 } from "@starfiniti/contracts";
import {
  activeMembershipTotal,
  permissionLabel,
  profileAssignmentSummary,
} from "./access-review-model";

const workspace = {
  schemaVersion: "1",
  organization: {
    id: "bf2247d8-893e-49ae-8363-8423928e9cc1",
    name: "Starfiniti",
    slug: "starfiniti",
    status: "active",
  },
  currentAccess: {
    role: "owner",
    assignmentKind: "membership",
    effective: true,
    permissions: ["organization.view", "members.view"],
  },
  catalogue: {
    schemaVersion: "1",
    profiles: [
      {
        role: "owner",
        label: "Owner",
        description: "Controls tenant recovery.",
        assignmentKind: "membership",
        permissions: ["organization.view", "members.view"],
      },
      {
        role: "support",
        label: "Support",
        description: "Uses a separately approved grant.",
        assignmentKind: "support_grant",
        permissions: ["organization.view"],
      },
    ],
  },
  activeMembershipCounts: [
    { role: "owner", count: 1 },
    { role: "admin", count: 2 },
    { role: "marketer", count: 3 },
    { role: "operator", count: 4 },
    { role: "analyst", count: 5 },
    { role: "auditor", count: 6 },
  ],
} as unknown as OrganizationAccessWorkspaceV1;

describe("enterprise access review model", () => {
  it("reconciles the visible membership total", () => {
    expect(activeMembershipTotal(workspace)).toBe(21);
  });

  it("keeps support visibly separate from permanent membership", () => {
    expect(
      profileAssignmentSummary(workspace.catalogue.profiles[1]!, workspace),
    ).toBe("On-demand only");
    expect(
      profileAssignmentSummary(workspace.catalogue.profiles[0]!, workspace),
    ).toBe("1 active member");
  });

  it("uses explicit human labels for every permission token", () => {
    expect(permissionLabel("identity.configure")).toBe(
      "Configure SSO and SCIM",
    );
    expect(permissionLabel("support.approve")).toBe("Approve support access");
  });
});
