import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ schema: () => ({ rpc }) }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { resolveReferralReview, retryReferralReward } from "./actions";

const idle = { kind: "idle" as const, message: "" };

describe("referral review server actions", () => {
  beforeEach(() => rpc.mockReset());

  it("resolves a valid risk case through the Auth-derived RPC", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          attribution_id: "85000000-0000-4000-8000-000000000001",
          state: "cooling",
          outcome: "created",
        },
      ],
      error: null,
    });
    const form = new FormData();
    form.set("attributionId", "85000000-0000-4000-8000-000000000001");
    form.set("operationId", "85000000-0000-4000-8000-000000000002");
    form.set("resolution", "approved");
    form.set("reason", "Verified shared household evidence");

    expect((await resolveReferralReview(idle, form)).kind).toBe("success");
    expect(rpc).toHaveBeenCalledWith(
      "resolve_referral_review_command",
      expect.not.objectContaining({
        target_organization_id: expect.anything(),
      }),
    );
  });

  it("rejects an unbounded or missing reason before the RPC", async () => {
    const form = new FormData();
    form.set("attributionId", "85000000-0000-4000-8000-000000000001");
    form.set("operationId", "85000000-0000-4000-8000-000000000002");
    form.set("resolution", "rejected");
    form.set("reason", "short");

    expect((await resolveReferralReview(idle, form)).kind).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("requeues a reviewed internal job without browser value authority", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          job_id: "85000000-0000-4000-8000-000000000003",
          state: "retryable",
          review_cycle: 1,
          outcome: "created",
        },
      ],
      error: null,
    });
    const form = new FormData();
    form.set("jobId", "85000000-0000-4000-8000-000000000003");
    form.set("operationId", "85000000-0000-4000-8000-000000000004");
    form.set("reason", "Transient database fault was remediated");

    expect((await retryReferralReward(idle, form)).kind).toBe("success");
    expect(rpc).toHaveBeenCalledWith(
      "retry_referral_reward_job_command",
      expect.not.objectContaining({ target_points: expect.anything() }),
    );
  });
});
