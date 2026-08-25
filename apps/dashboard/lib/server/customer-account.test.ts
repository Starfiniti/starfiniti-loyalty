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

function experience() {
  return {
    version: "1",
    asOf: "2026-08-25T10:00:00Z",
    accountId,
    workspaceId: "88000000-0000-4000-8000-000000000004",
    programmeId: "88000000-0000-4000-8000-000000000005",
    storeName: "Example store",
    programmeName: "Example loyalty",
    accountStatus: "ready",
    enhancementsEnabled: true,
    balances: { pending: "0", available: "100", reserved: "0" },
    currentTier: { code: "rose", name: "Rose" },
    nextExpiry: null,
    earningMethods: [],
    rewards: [],
    reservations: [],
    activity: [],
    tierProgress: null,
    referral: null,
  };
}

describe("customer account aggregate", () => {
  beforeEach(() => {
    getClaims.mockReset();
    rpc.mockReset();
    getClaims.mockResolvedValue({
      data: { claims: { sub: "88000000-0000-4000-8000-000000000002" } },
      error: null,
    });
    rpc.mockResolvedValue({
      data: [{ account_id: accountId, experience: experience() }],
      error: null,
    });
  });

  it("strictly parses and maps the one-statement no-selector aggregate", async () => {
    await expect(getCustomerLoyaltyAccounts()).resolves.toEqual({
      kind: "ready",
      accounts: [
        expect.objectContaining({
          account_id: accountId,
          available_points: "100",
          tier_name: "Rose",
          enhancements_enabled: true,
          earning_methods: [],
        }),
      ],
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("get_my_loyalty_experiences_v1");
  });

  it("fails closed on malformed, mismatched, or duplicate containers", async () => {
    rpc.mockResolvedValueOnce({
      data: [
        {
          account_id: accountId,
          experience: {
            ...experience(),
            customerEmail: "private@example.test",
          },
        },
      ],
      error: null,
    });
    await expect(getCustomerLoyaltyAccounts()).rejects.toThrow(
      "customer_account_unavailable",
    );

    rpc.mockResolvedValueOnce({
      data: [
        {
          account_id: "88000000-0000-4000-8000-000000000099",
          experience: experience(),
        },
      ],
      error: null,
    });
    await expect(getCustomerLoyaltyAccounts()).rejects.toThrow(
      "customer_account_unavailable",
    );

    rpc.mockResolvedValueOnce({
      data: [
        { account_id: accountId, experience: experience() },
        { account_id: accountId, experience: experience() },
      ],
      error: null,
    });
    await expect(getCustomerLoyaltyAccounts()).rejects.toThrow(
      "customer_account_unavailable",
    );
  });

  it("fails closed when the canonical projection is unavailable", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "projection unavailable" },
    });
    await expect(getCustomerLoyaltyAccounts()).rejects.toThrow(
      "customer_account_unavailable",
    );
  });

  it("returns an honest empty state", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
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
