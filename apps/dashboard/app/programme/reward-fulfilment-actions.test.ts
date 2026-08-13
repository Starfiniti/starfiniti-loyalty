import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ schema: () => ({ rpc }) }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  resolveRewardFulfilment,
  startRewardFulfilment,
} from "./reward-fulfilment-actions";

const idle = { kind: "idle" as const, message: "" };

describe("reward fulfilment server actions", () => {
  beforeEach(() => rpc.mockReset());

  it("starts a valid case through the role-checked RPC", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          case_id: "84000000-0000-4000-8000-000000000001",
          state: "in_progress",
          outcome: "created",
        },
      ],
      error: null,
    });
    const form = new FormData();
    form.set("caseId", "84000000-0000-4000-8000-000000000001");
    form.set("operationId", "84000000-0000-4000-8000-000000000004");
    expect((await startRewardFulfilment(idle, form)).kind).toBe("success");
  });

  it("rejects fulfilment without delivery evidence before the RPC", async () => {
    const form = new FormData();
    form.set("caseId", "84000000-0000-4000-8000-000000000001");
    form.set("operationId", "84000000-0000-4000-8000-000000000004");
    form.set("resolution", "fulfilled");
    expect((await resolveRewardFulfilment(idle, form)).kind).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
  });
});
