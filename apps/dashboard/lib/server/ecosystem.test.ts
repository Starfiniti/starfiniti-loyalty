import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    schema: () => ({ rpc }),
  }),
}));

import { getProgrammeGroupSharingPolicy } from "./ecosystem";

const programmeGroupId = "93000000-0000-4000-8000-000000000001";

function policy() {
  return {
    version: "1",
    programmeGroupId,
    programmeGroupName: "Starfiniti Loyalty",
    mode: "explicit-workspace-allowlist",
    revision: 3,
    configurationEnabled: true,
    workspaces: [
      {
        id: "93000000-0000-4000-8000-000000000002",
        name: "Primary store",
        slug: "primary-store",
        linked: true,
        removalProtected: true,
      },
      {
        id: "93000000-0000-4000-8000-000000000003",
        name: "Outlet",
        slug: "outlet",
        linked: true,
        removalProtected: false,
      },
    ],
  };
}

describe("programme group sharing read model", () => {
  beforeEach(() => rpc.mockReset());

  it("returns one strictly parsed minimized policy", async () => {
    rpc.mockResolvedValue({ data: [{ policy: policy() }], error: null });
    await expect(
      getProgrammeGroupSharingPolicy(programmeGroupId),
    ).resolves.toEqual({ kind: "ready", policy: policy() });
    expect(rpc).toHaveBeenCalledWith("get_programme_group_sharing_policy_v1", {
      target_programme_group_public_id: programmeGroupId,
    });
  });

  it("distinguishes an unconfigured group from an unavailable projection", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(
      getProgrammeGroupSharingPolicy(programmeGroupId),
    ).resolves.toEqual({ kind: "not_configured" });

    rpc.mockResolvedValueOnce({ data: null, error: { code: "57014" } });
    await expect(
      getProgrammeGroupSharingPolicy(programmeGroupId),
    ).resolves.toEqual({ kind: "unavailable" });
  });

  it("fails closed on unknown fields, duplicates, or malformed containers", async () => {
    rpc.mockResolvedValueOnce({
      data: [{ policy: { ...policy(), organizationId: programmeGroupId } }],
      error: null,
    });
    await expect(
      getProgrammeGroupSharingPolicy(programmeGroupId),
    ).resolves.toEqual({ kind: "unavailable" });

    rpc.mockResolvedValueOnce({
      data: [{ policy: policy() }, { policy: policy() }],
      error: null,
    });
    await expect(
      getProgrammeGroupSharingPolicy(programmeGroupId),
    ).resolves.toEqual({ kind: "unavailable" });
  });
});
