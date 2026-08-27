import { beforeEach, describe, expect, it, vi } from "vitest";

const getClaims = vi.fn();
const rpc = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getClaims },
    schema: () => ({ rpc }),
  }),
}));

import { getCustomerLoyaltyAccounts } from "./customer-account";

const accountId = "88000000-0000-4000-8000-000000000001";

describe("customer account referral composition", () => {
  beforeEach(() => {
    getClaims.mockReset();
    rpc.mockReset();
    getClaims.mockResolvedValue({
      data: { claims: { sub: "88000000-0000-4000-8000-000000000002" } },
      error: null,
    });
  });

  it("joins a strictly parsed no-selector referral experience by account", async () => {
    rpc.mockImplementation((name: string) => {
      if (name === "get_my_loyalty_accounts") {
        return Promise.resolve({
          data: [
            {
              account_id: accountId,
              customer_id: "88000000-0000-4000-8000-000000000003",
              workspace_id: "88000000-0000-4000-8000-000000000004",
              programme_id: "88000000-0000-4000-8000-000000000005",
              store_name: "Example store",
              programme_name: "Example loyalty",
              account_status: "ready",
              pending_points: "0",
              available_points: "100",
              reserved_points: "0",
              tier_code: "rose",
              tier_name: "Rose",
              next_expiry_points: null,
              next_expiry_at: null,
              rewards: [],
              reservations: [],
              activity: [],
            },
          ],
          error: null,
        });
      }
      if (name === "get_my_tier_progress_v1") {
        return Promise.resolve({ data: [], error: null });
      }
      return Promise.resolve({
        data: [
          {
            account_id: accountId,
            sharing_state: "active",
            share_url:
              "https://shop.example.test/?stf_ref=88000000-0000-4000-8000-000000000006",
            advocate_reward_points: "500",
            friend_reward_points: "250",
            minimum_eligible_spend_minor: "3000",
            currency_code: "EUR",
            currency_minor_unit_digits: 2,
            qualification_status: "completed",
            cooling_days: 14,
            total_count: "1",
            pending_count: "0",
            qualified_count: "1",
            rejected_count: "0",
            reversed_count: "0",
            history: [
              {
                referralId: "88000000-0000-4000-8000-000000000007",
                state: "qualified",
                rewardPoints: "500",
                capturedAt: "2026-08-01T08:00:00Z",
                updatedAt: "2026-08-16T08:00:00Z",
                availableAt: "2026-08-16T08:00:00Z",
              },
            ],
          },
        ],
        error: null,
      });
    });

    const state = await getCustomerLoyaltyAccounts();
    expect(state.kind).toBe("ready");
    if (state.kind !== "ready") throw new Error("expected ready state");
    expect(state.accounts[0]?.referral?.counts.qualified).toBe("1");
    expect(rpc).toHaveBeenCalledWith("get_my_referral_experiences_v1");
  });

  it("fails the optional referral panel closed without hiding loyalty value", async () => {
    rpc.mockImplementation((name: string) => {
      if (name === "get_my_loyalty_accounts") {
        return Promise.resolve({ data: [], error: null });
      }
      if (name === "get_my_tier_progress_v1") {
        return Promise.resolve({ data: [], error: null });
      }
      return Promise.resolve({
        data: [
          {
            account_id: accountId,
            sharing_state: "paused",
            share_url:
              "https://shop.example.test/?stf_ref=88000000-0000-4000-8000-000000000006",
            advocate_reward_points: "500",
            friend_reward_points: "250",
            minimum_eligible_spend_minor: "3000",
            currency_code: "EUR",
            currency_minor_unit_digits: 2,
            qualification_status: "completed",
            cooling_days: 14,
            total_count: "1",
            pending_count: "0",
            qualified_count: "0",
            rejected_count: "0",
            reversed_count: "0",
            history: [],
          },
        ],
        error: null,
      });
    });

    await expect(getCustomerLoyaltyAccounts()).resolves.toEqual({
      kind: "ready",
      accounts: [],
    });
  });

  it("keeps the customer account available during a referral projection outage", async () => {
    rpc.mockImplementation((name: string) => {
      if (name === "get_my_loyalty_accounts") {
        return Promise.resolve({ data: [], error: null });
      }
      if (name === "get_my_tier_progress_v1") {
        return Promise.resolve({ data: [], error: null });
      }
      return Promise.resolve({
        data: null,
        error: { message: "referral projection unavailable" },
      });
    });

    await expect(getCustomerLoyaltyAccounts()).resolves.toEqual({
      kind: "ready",
      accounts: [],
    });
  });

  it("does not call a projection without an Auth subject", async () => {
    getClaims.mockResolvedValue({ data: null, error: { message: "missing" } });
    await expect(getCustomerLoyaltyAccounts()).resolves.toEqual({
      kind: "unauthenticated",
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});
