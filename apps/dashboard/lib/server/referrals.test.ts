import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ schema: () => ({ rpc }) }),
}));

import {
  getReferralDashboard,
  getReferralReviewCases,
  getReferralWorkspace,
} from "./referrals";

const baseRow = {
  review_id: "85000000-0000-4000-8000-000000000001",
  attribution_id: "85000000-0000-4000-8000-000000000002",
  advocate_reference: "Advocate 104",
  friend_reference: "Friend 205",
  source_order_reference: "1842",
  risk_codes: ["source_network_velocity"],
  qualification_decision: "review_held",
  cooling_ends_at: "2026-08-28T00:00:00Z",
  created_at: "2026-08-14T00:00:00Z",
};

describe("referral review server read", () => {
  beforeEach(() => rpc.mockReset());

  it("parses minimized risk and internal recovery rows", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          ...baseRow,
          review_kind: "risk",
          state: "pending_review",
          attempt_count: null,
          review_cycle: null,
          error_code: null,
        },
        {
          ...baseRow,
          review_id: "85000000-0000-4000-8000-000000000003",
          review_kind: "reward",
          state: "manual_review",
          attempt_count: 10,
          review_cycle: 0,
          error_code: "worker_error",
        },
      ],
      error: null,
    });

    const cases = await getReferralReviewCases(
      "85000000-0000-4000-8000-000000000004",
    );
    expect(cases.map((item) => item.kind)).toEqual(["risk", "reward"]);
    expect(rpc).toHaveBeenCalledWith("list_referral_review_cases", {
      target_programme_public_id: "85000000-0000-4000-8000-000000000004",
      target_kind: null,
      target_limit: 100,
    });
  });

  it("fails closed on malformed database diagnostics", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          ...baseRow,
          review_kind: "reward",
          state: "manual_review",
          attempt_count: 10,
          review_cycle: 0,
          error_code: "raw database message with spaces",
        },
      ],
      error: null,
    });
    await expect(
      getReferralReviewCases("85000000-0000-4000-8000-000000000004"),
    ).rejects.toThrow();
  });

  it("marks review cases unavailable on a malformed result container", async () => {
    rpc.mockImplementation((name: string) => {
      if (name === "list_referral_review_cases") {
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({
        data: [
          {
            programme_id: "85000000-0000-4000-8000-000000000004",
            lookback_days: 30,
            generated_at: "2026-08-14T08:00:00Z",
            totals: {
              advocates: "0",
              attributions: "0",
              pending: "0",
              qualified: "0",
              rejected: "0",
              reversed: "0",
              advocatePointsIssued: "0",
              friendPointsIssued: "0",
            },
            top_advocates: [],
            recent: [],
          },
        ],
        error: null,
      });
    });

    await expect(
      getReferralReviewCases("85000000-0000-4000-8000-000000000004"),
    ).rejects.toThrow("referral_review_read_unavailable");
    await expect(
      getReferralWorkspace("85000000-0000-4000-8000-000000000004"),
    ).resolves.toMatchObject({
      cases: [],
      casesAvailable: false,
      dashboardAvailable: true,
    });
  });

  it("parses a reconciled fact-sourced merchant dashboard", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          programme_id: "85000000-0000-4000-8000-000000000004",
          lookback_days: 30,
          generated_at: "2026-08-14T08:00:00Z",
          totals: {
            advocates: "2",
            attributions: "2",
            pending: "1",
            qualified: "1",
            rejected: "0",
            reversed: "0",
            advocatePointsIssued: "500",
            friendPointsIssued: "250",
          },
          top_advocates: [
            {
              customerId: "85000000-0000-4000-8000-000000000005",
              reference: "Advocate Example",
              attributions: "2",
              qualified: "1",
              pointsIssued: "500",
            },
          ],
          recent: [],
        },
      ],
      error: null,
    });

    const dashboard = await getReferralDashboard(
      "85000000-0000-4000-8000-000000000004",
    );
    expect(dashboard.totals.attributions).toBe("2");
    expect(rpc).toHaveBeenCalledWith("get_referral_dashboard_v1", {
      target_programme_public_id: "85000000-0000-4000-8000-000000000004",
      target_lookback_days: 30,
    });
  });

  it("fails closed when merchant funnel totals do not reconcile", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          programme_id: "85000000-0000-4000-8000-000000000004",
          lookback_days: 30,
          generated_at: "2026-08-14T08:00:00Z",
          totals: {
            advocates: "2",
            attributions: "2",
            pending: "1",
            qualified: "0",
            rejected: "0",
            reversed: "0",
            advocatePointsIssued: "0",
            friendPointsIssued: "0",
          },
          top_advocates: [],
          recent: [],
        },
      ],
      error: null,
    });
    await expect(
      getReferralDashboard("85000000-0000-4000-8000-000000000004"),
    ).rejects.toThrow("referral_dashboard_unavailable");
  });

  it("keeps performance visible when the review projection is unavailable", async () => {
    rpc.mockImplementation((name: string) => {
      if (name === "list_referral_review_cases") {
        return Promise.resolve({
          data: null,
          error: { message: "review projection unavailable" },
        });
      }
      return Promise.resolve({
        data: [
          {
            programme_id: "85000000-0000-4000-8000-000000000004",
            lookback_days: 30,
            generated_at: "2026-08-14T08:00:00Z",
            totals: {
              advocates: "0",
              attributions: "0",
              pending: "0",
              qualified: "0",
              rejected: "0",
              reversed: "0",
              advocatePointsIssued: "0",
              friendPointsIssued: "0",
            },
            top_advocates: [],
            recent: [],
          },
        ],
        error: null,
      });
    });

    await expect(
      getReferralWorkspace("85000000-0000-4000-8000-000000000004"),
    ).resolves.toMatchObject({
      cases: [],
      casesAvailable: false,
      dashboardAvailable: true,
    });
  });

  it("keeps accepted review cases visible when performance is unavailable", async () => {
    rpc.mockImplementation((name: string) => {
      if (name === "get_referral_dashboard_v1") {
        return Promise.resolve({
          data: null,
          error: { message: "dashboard projection unavailable" },
        });
      }
      return Promise.resolve({
        data: [
          {
            ...baseRow,
            review_kind: "risk",
            state: "pending_review",
            attempt_count: null,
            review_cycle: null,
            error_code: null,
          },
        ],
        error: null,
      });
    });

    const workspace = await getReferralWorkspace(
      "85000000-0000-4000-8000-000000000004",
    );
    expect(workspace.dashboard).toBeNull();
    expect(workspace.dashboardAvailable).toBe(false);
    expect(workspace.casesAvailable).toBe(true);
    expect(workspace.cases).toHaveLength(1);
  });
});
