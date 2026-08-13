import { describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    schema: () => ({ rpc }),
  }),
}));

import { getRewardFulfilmentState } from "./reward-fulfilment";

describe("reward fulfilment server read", () => {
  it("parses minimized cases and exact summary", async () => {
    rpc
      .mockResolvedValueOnce({
        data: [
          {
            case_id: "84000000-0000-4000-8000-000000000001",
            reservation_id: "84000000-0000-4000-8000-000000000002",
            customer_id: "84000000-0000-4000-8000-000000000003",
            customer_reference: "Member 84000000",
            reward_code: "studio-tour",
            reward_name: "Studio tour",
            cost_points: "5000",
            state: "pending",
            instructions: "Arrange the visit with the member.",
            due_at: "2026-08-20T12:00:00.000Z",
            result_reference: null,
            created_at: "2026-08-13T12:00:00.000Z",
            updated_at: "2026-08-13T12:00:00.000Z",
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          pending: 1,
          inProgress: 0,
          overdue: 0,
          fulfilled30d: 0,
          rejected30d: 0,
        },
        error: null,
      });

    const state = await getRewardFulfilmentState(
      "84000000-0000-4000-8000-000000000004",
    );
    expect(state.cases[0]?.rewardCode).toBe("studio-tour");
    expect(state.summary.pending).toBe(1);
  });

  it("fails closed on malformed database output", async () => {
    rpc
      .mockResolvedValueOnce({ data: [{ case_id: "unsafe" }], error: null })
      .mockResolvedValueOnce({
        data: {
          pending: 1,
          inProgress: 0,
          overdue: 0,
          fulfilled30d: 0,
          rejected30d: 0,
        },
        error: null,
      });
    await expect(
      getRewardFulfilmentState("84000000-0000-4000-8000-000000000004"),
    ).rejects.toThrow();
  });
});
