import { beforeEach, describe, expect, it, vi } from "vitest";

const { revalidatePath, rpc } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    schema: () => ({ rpc }),
  }),
}));

import { configureProgrammeGroupSharing } from "./sharing-actions";

const groupId = "94000000-0000-4000-8000-000000000001";
const workspaceOne = "94000000-0000-4000-8000-000000000002";
const workspaceTwo = "94000000-0000-4000-8000-000000000003";
const operationId = "94000000-0000-4000-8000-000000000004";
const resourceId = "94000000-0000-4000-8000-000000000005";
const idle = { kind: "idle", message: "" } as const;

function commandForm(): FormData {
  const form = new FormData();
  form.set("confirmation", "configure");
  form.set("operationId", operationId);
  form.set("programmeGroupId", groupId);
  form.set("mode", "explicit-workspace-allowlist");
  form.set("expectedRevision", "2");
  form.append("workspaceIds", workspaceOne);
  form.append("workspaceIds", workspaceTwo);
  return form;
}

describe("programme group sharing action", () => {
  beforeEach(() => {
    rpc.mockReset();
    revalidatePath.mockReset();
  });

  it("sends only public selectors and the reviewed optimistic revision", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          resource_public_id: resourceId,
          outcome: "created",
          revision: 3,
          sharing_mode: "explicit-workspace-allowlist",
          workspace_public_ids: [workspaceOne, workspaceTwo],
        },
      ],
      error: null,
    });
    await expect(
      configureProgrammeGroupSharing(idle, commandForm()),
    ).resolves.toEqual({
      kind: "success",
      message: "Wallet scope revision 3 saved with immutable audit evidence.",
    });
    expect(rpc).toHaveBeenCalledWith(
      "configure_programme_group_sharing_v1",
      expect.objectContaining({
        target_programme_group_public_id: groupId,
        target_workspace_public_ids: [workspaceOne, workspaceTwo],
        target_expected_revision: 2,
        target_idempotency_key: `programme-group:sharing:${operationId}`,
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/operations");
  });

  it("rejects implicit or unreviewed sharing before database access", async () => {
    const oneWorkspace = commandForm();
    oneWorkspace.delete("workspaceIds");
    oneWorkspace.append("workspaceIds", workspaceOne);
    await expect(
      configureProgrammeGroupSharing(idle, oneWorkspace),
    ).resolves.toMatchObject({ kind: "error" });

    const unreviewed = commandForm();
    unreviewed.delete("confirmation");
    await expect(
      configureProgrammeGroupSharing(idle, unreviewed),
    ).resolves.toMatchObject({ kind: "error" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps authorization and stale/protected-policy failures without claiming success", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    await expect(
      configureProgrammeGroupSharing(idle, commandForm()),
    ).resolves.toMatchObject({
      kind: "error",
      message: expect.stringContaining("owner/admin"),
    });

    rpc.mockResolvedValueOnce({ data: null, error: { code: "23514" } });
    await expect(
      configureProgrammeGroupSharing(idle, commandForm()),
    ).resolves.toMatchObject({
      kind: "error",
      message: expect.stringContaining("protected"),
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("fails closed when the database result changes shape", async () => {
    rpc.mockResolvedValue({ data: [{ revision: 3 }], error: null });
    await expect(
      configureProgrammeGroupSharing(idle, commandForm()),
    ).resolves.toEqual({
      kind: "error",
      message: "The saved policy response could not be verified.",
    });
  });
});
