import { describe, expect, it } from "vitest";
import { resolveTenantContext, type TenantSnapshot } from "./tenant-context";

const snapshot: TenantSnapshot = {
  memberships: [
    { organization_id: 10, role: "owner" },
    { organization_id: 20, role: "analyst" },
  ],
  organizations: [
    {
      id: 20,
      public_id: "20000000-0000-4000-8000-000000000000",
      name: "Beta",
      slug: "beta",
      status: "active",
    },
    {
      id: 10,
      public_id: "10000000-0000-4000-8000-000000000000",
      name: "Alpha",
      slug: "alpha",
      status: "active",
    },
    {
      id: 99,
      public_id: "99000000-0000-4000-8000-000000000000",
      name: "Injected tenant",
      slug: "injected",
      status: "active",
    },
  ],
  workspaces: [
    {
      id: 11,
      public_id: "11000000-0000-4000-8000-000000000000",
      organization_id: 10,
      name: "Alpha store",
      slug: "alpha-store",
      status: "active",
    },
    {
      id: 91,
      public_id: "91000000-0000-4000-8000-000000000000",
      organization_id: 99,
      name: "Injected store",
      slug: "injected-store",
      status: "active",
    },
  ],
  programmeGroups: [
    {
      id: 12,
      public_id: "12000000-0000-4000-8000-000000000000",
      organization_id: 10,
      name: "Alpha rewards",
      slug: "alpha-rewards",
      status: "active",
    },
    {
      id: 92,
      public_id: "92000000-0000-4000-8000-000000000000",
      organization_id: 99,
      name: "Injected rewards",
      slug: "injected-rewards",
      status: "active",
    },
  ],
  programmeGroupWorkspaces: [
    { organization_id: 10, programme_group_id: 12, workspace_id: 11 },
    { organization_id: 99, programme_group_id: 92, workspace_id: 91 },
  ],
};

describe("tenant context resolution", () => {
  it("uses an authenticated membership and ignores injected cross-tenant rows", () => {
    const context = resolveTenantContext(snapshot);

    expect(context?.organization.slug).toBe("alpha");
    expect(context?.workspace?.slug).toBe("alpha-store");
    expect(context?.programmeGroup?.slug).toBe("alpha-rewards");
    expect(context?.availableOrganizations.map(({ slug }) => slug)).toEqual([
      "alpha",
      "beta",
    ]);
  });

  it("honors only a preferred organization that is present in membership", () => {
    expect(
      resolveTenantContext(snapshot, "20000000-0000-4000-8000-000000000000")
        ?.organization.slug,
    ).toBe("beta");
    expect(
      resolveTenantContext(snapshot, "99000000-0000-4000-8000-000000000000")
        ?.organization.slug,
    ).toBe("alpha");
  });

  it("returns no context without an active membership", () => {
    expect(resolveTenantContext({ ...snapshot, memberships: [] })).toBeNull();
  });
});
