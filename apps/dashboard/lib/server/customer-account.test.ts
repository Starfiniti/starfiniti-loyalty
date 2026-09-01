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

const presentation = {
  version: "2",
  theme: {
    version: "2",
    brandColor: "#7c2d4f",
    displayFont: "editorial-serif",
    cardRadiusPx: 14,
    heroText: "Beauty that gives back",
    pointsLabel: "Points",
    showTier: true,
    showRewards: true,
    widgetPosition: "right",
    density: "comfortable",
    heroAsset: "sparkles",
    showReferrals: true,
    sectionOrder: [
      "overview",
      "earning",
      "rewards",
      "vip",
      "referrals",
      "history",
      "account",
    ],
  },
  copy: {
    version: "2",
    locale: "en",
    heroText: "Beauty that gives back",
    pointsLabel: "Points",
    balanceLabel: "Your balance",
    rewardsLabel: "Rewards",
    redeemLabel: "Redeem",
    joinLabel: "Join free",
    earnMessage: "Earn on eligible purchases.",
  },
} as const;

function experience(version: "1" | "2" | "3" = "3") {
  return {
    version,
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
    ...(version === "2" || version === "3" ? { presentation } : {}),
    ...(version === "3"
      ? {
          campaignOpportunities: [
            {
              code: "offer-a7f39c2d",
              name: "Summer points boost",
              description: "Earn more on eligible purchases this week.",
              state: "active",
              startsAt: "2026-08-24T00:00:00Z",
              endsAt: "2026-09-01T00:00:00Z",
              hasPurchaseRestrictions: true,
              effect: {
                kind: "purchase_multiplier",
                multiplierBasisPoints: 20_000,
                combination: "highest_eligible_multiplier",
              },
            },
          ],
        }
      : {}),
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

  it("strictly parses V3 and maps its controlled campaign opportunities", async () => {
    await expect(getCustomerLoyaltyAccounts()).resolves.toEqual({
      kind: "ready",
      accounts: [
        expect.objectContaining({
          account_id: accountId,
          available_points: "100",
          tier_name: "Rose",
          enhancements_enabled: true,
          campaign_opportunities: [
            expect.objectContaining({
              code: "offer-a7f39c2d",
              state: "active",
            }),
          ],
          presentation,
        }),
      ],
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("get_my_loyalty_experiences_v3");
  });

  it("normalizes V2 only while an additive database deploy lacks V3", async () => {
    rpc
      .mockResolvedValueOnce({ data: null, error: { code: "PGRST202" } })
      .mockResolvedValueOnce({
        data: [{ account_id: accountId, experience: experience("2") }],
        error: null,
      });
    const result = await getCustomerLoyaltyAccounts();
    expect(result).toMatchObject({
      kind: "ready",
      accounts: [
        { presentation: { version: "2" }, campaign_opportunities: [] },
      ],
    });
    expect(rpc).toHaveBeenNthCalledWith(1, "get_my_loyalty_experiences_v3");
    expect(rpc).toHaveBeenNthCalledWith(2, "get_my_loyalty_experiences_v2");
  });

  it("normalizes V1 only when V3 and V2 are both absent", async () => {
    rpc
      .mockResolvedValueOnce({ data: null, error: { code: "42883" } })
      .mockResolvedValueOnce({ data: null, error: { code: "PGRST202" } })
      .mockResolvedValueOnce({
        data: [{ account_id: accountId, experience: experience("1") }],
        error: null,
      });
    const result = await getCustomerLoyaltyAccounts();
    expect(result).toMatchObject({
      kind: "ready",
      accounts: [
        { presentation: { version: "2" }, campaign_opportunities: [] },
      ],
    });
    expect(rpc).toHaveBeenNthCalledWith(1, "get_my_loyalty_experiences_v3");
    expect(rpc).toHaveBeenNthCalledWith(2, "get_my_loyalty_experiences_v2");
    expect(rpc).toHaveBeenNthCalledWith(3, "get_my_loyalty_experiences_v1");
  });

  it("returns a bounded unavailable state for malformed containers", async () => {
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
    await expect(getCustomerLoyaltyAccounts()).resolves.toEqual({
      kind: "unavailable",
    });

    rpc.mockResolvedValueOnce({
      data: [
        {
          account_id: "88000000-0000-4000-8000-000000000099",
          experience: experience(),
        },
      ],
      error: null,
    });
    await expect(getCustomerLoyaltyAccounts()).resolves.toEqual({
      kind: "unavailable",
    });

    rpc.mockResolvedValueOnce({
      data: [
        { account_id: accountId, experience: experience() },
        { account_id: accountId, experience: experience() },
      ],
      error: null,
    });
    await expect(getCustomerLoyaltyAccounts()).resolves.toEqual({
      kind: "unavailable",
    });
  });

  it("does not hide provider or malformed V3 failures behind legacy data", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "57014", message: "projection unavailable" },
    });
    await expect(getCustomerLoyaltyAccounts()).resolves.toEqual({
      kind: "unavailable",
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("returns honest empty and unauthenticated states", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await expect(getCustomerLoyaltyAccounts()).resolves.toEqual({
      kind: "ready",
      accounts: [],
    });

    getClaims.mockResolvedValue({ data: null, error: { message: "missing" } });
    await expect(getCustomerLoyaltyAccounts()).resolves.toEqual({
      kind: "unauthenticated",
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
