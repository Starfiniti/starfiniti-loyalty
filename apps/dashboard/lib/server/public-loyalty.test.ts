import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const schema = vi.fn(() => ({ rpc }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/public", () => ({
  createPublicSupabaseClient: () => ({ schema }),
}));

import { getPublicLoyaltyExperience } from "./public-loyalty";

const workspaceId = "a1000000-0000-4000-8000-000000000001";
const programmeId = "a1000000-0000-4000-8000-000000000002";

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
    earnMessage: "Earn points on eligible orders.",
  },
} as const;

function v2Row(
  tiers: ReadonlyArray<{
    code: string;
    name: string;
    minimumEligibleSpendMinor: string;
    pointsPerMajorUnit: string;
  }> = [],
) {
  return {
    workspace_public_id: workspaceId,
    programme_public_id: programmeId,
    programme_group_public_id: "a1000000-0000-4000-8000-000000000003",
    programme_name: "Rosy Rewards",
    requested_locale: "en",
    resolved_locale: "en",
    presentation,
    tiers,
    rewards: [],
  };
}

function v3Row(
  tiers: ReadonlyArray<{
    code: string;
    name: string;
    minimumEligibleSpendMinor: string;
    pointsPerMajorUnit: string;
  }> = [],
) {
  return {
    ...v2Row(tiers),
    vip_catalogue: {
      version: "1",
      qualificationPeriod: { kind: "lifetime" },
      downgradeGraceDays: 0,
      levels: tiers.map((tier, index) => ({
        code: tier.code,
        name: tier.name,
        entry:
          index === 0
            ? null
            : {
                operator: "all",
                thresholds: [
                  {
                    metric: "eligible_spend",
                    minimum: tier.minimumEligibleSpendMinor,
                  },
                ],
              },
        pointsPerMajorUnit: tier.pointsPerMajorUnit,
        earlyAccess: false,
        exclusiveRewardAccess: false,
      })),
    },
  };
}

function v4Row(
  rewards: ReadonlyArray<{
    code: string;
    name: string;
    kind:
      | "fixed_discount"
      | "percentage_discount"
      | "free_shipping"
      | "free_product"
      | "store_credit";
    costPoints: string;
  }> = [],
) {
  return {
    ...v3Row(),
    rewards,
    earning_methods: [
      {
        code: "birthday-bonus",
        name: "Birthday bonus",
        source: "birthday",
        effect: { kind: "fixed_bonus", points: "250" },
        hasRestrictions: false,
        startsAt: null,
        endsAt: null,
        availableNow: true,
      },
    ],
  };
}

function v5Row() {
  const { rewards: _legacyRewards, ...base } = v4Row();
  void _legacyRewards;
  return {
    ...base,
    reward_catalogue: {
      version: "1",
      offers: [
        {
          code: "reward-1",
          name: "€5 discount",
          costPoints: "500",
          benefit: { kind: "fixed_discount", amountMinor: "500" },
          currency: { code: "EUR", minorUnitDigits: 2 },
          delivery: "woocommerce_coupon",
          validityDays: 30,
          deliveryEstimateDays: null,
          state: "available",
          startsAt: null,
          endsAt: null,
          conditions: {
            minimumSpendMinor: null,
            requiredTierNames: [],
            hasProductOrCategoryRestrictions: false,
            excludesSaleItems: false,
            hasMemberLimit: false,
            limitedAvailability: false,
            stacking: "exclusive",
          },
        },
      ],
    },
  };
}

function v6Row() {
  return {
    ...v5Row(),
    programme_currency: { code: "EUR", minorUnitDigits: 2 },
    referral_catalogue: {
      version: "1",
      state: "available",
      advocateRewardPoints: "500",
      friendRewardPoints: "250",
      minimumEligibleSpendMinor: "3000",
      currency: { code: "EUR", minorUnitDigits: 2 },
      attributionWindowDays: 30,
      coolingDays: 14,
      qualification: "first_eligible_purchase",
      newCustomersOnly: true,
      monthlyLimitApplies: true,
    },
  };
}

function v1Row(locale = "en") {
  return {
    workspace_public_id: workspaceId,
    programme_public_id: programmeId,
    programme_group_public_id: "a1000000-0000-4000-8000-000000000003",
    programme_name: "Rosy Rewards",
    requested_locale: "en",
    resolved_locale: locale,
    brand_color: "#7c2d4f",
    display_font: "editorial-serif",
    card_radius_px: 14,
    show_tier: true,
    show_rewards: true,
    hero_text: locale === "en" ? "Beauty that gives back" : "Lepota",
    points_label: locale === "en" ? "Points" : "Tocke",
    balance_label: "Your balance",
    rewards_label: "Rewards",
    redeem_label: "Redeem",
    join_label: "Join free",
    earn_message: "Earn points on eligible orders.",
    tiers: [],
    rewards: [],
  };
}

describe("public loyalty server read", () => {
  beforeEach(() => {
    rpc.mockReset();
    schema.mockClear();
    rpc.mockResolvedValue({ data: [v6Row()], error: null });
  });

  it("requests the selector-minimized English V6 public document", async () => {
    await expect(
      getPublicLoyaltyExperience(workspaceId, programmeId),
    ).resolves.toMatchObject({
      version: "6",
      requestedLocale: "en",
      resolvedLocale: "en",
      presentation,
      earningMethods: [
        {
          code: "birthday-bonus",
          effect: { kind: "fixed_bonus", points: "250" },
        },
      ],
      rewardCatalogue: {
        offers: [
          {
            code: "reward-1",
            benefit: { kind: "fixed_discount", amountMinor: "500" },
          },
        ],
      },
      programmeCurrency: { code: "EUR", minorUnitDigits: 2 },
      referralCatalogue: {
        state: "available",
        advocateRewardPoints: "500",
        friendRewardPoints: "250",
      },
    });
    expect(schema).toHaveBeenCalledWith("loyalty");
    expect(rpc).toHaveBeenCalledWith("get_public_loyalty_experience_v6", {
      target_workspace_public_id: workspaceId,
      target_programme_public_id: programmeId,
    });
  });

  it("falls directly from absent V6 to the released English V1 projection", async () => {
    const tiers = [
      {
        code: "starter",
        name: "Starter",
        minimumEligibleSpendMinor: "0",
        pointsPerMajorUnit: "4",
      },
    ];
    rpc
      .mockResolvedValueOnce({ data: null, error: { code: "PGRST202" } })
      .mockResolvedValueOnce({ data: [{ ...v1Row(), tiers }], error: null });
    await expect(
      getPublicLoyaltyExperience(workspaceId, programmeId),
    ).resolves.toMatchObject({
      version: "6",
      programmeCurrency: null,
      presentation: {
        theme: { brandColor: "#7c2d4f" },
        copy: { locale: "en" },
      },
      vipCatalogue: {
        qualificationPeriod: { kind: "lifetime" },
        levels: [{ code: "starter", entry: null, pointsPerMajorUnit: "4" }],
      },
      earningMethods: [
        {
          code: "eligible-purchases",
          effect: { kind: "base_rate", pointsPerMajorUnit: "4" },
        },
      ],
      referralCatalogue: { state: "confirm_in_account" },
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "get_public_loyalty_experience", {
      target_workspace_public_id: workspaceId,
      target_programme_public_id: programmeId,
      target_locale: "en",
    });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("fails closed on malformed V6 without selecting legacy data", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          ...v6Row(),
          presentation: { ...presentation, locale: "sl-SI" },
        },
      ],
      error: null,
    });
    await expect(
      getPublicLoyaltyExperience(workspaceId, programmeId),
    ).rejects.toThrow("public_loyalty_read_unavailable");
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("fails closed when V6 reward data expands authority or repeats an offer code", async () => {
    const privateRow = v6Row();
    privateRow.reward_catalogue.offers[0] = {
      ...privateRow.reward_catalogue.offers[0],
      internalRewardId: "42",
    } as (typeof privateRow.reward_catalogue.offers)[number];
    rpc.mockResolvedValueOnce({ data: [privateRow], error: null });
    await expect(
      getPublicLoyaltyExperience(workspaceId, programmeId),
    ).rejects.toThrow("public_loyalty_read_unavailable");
    expect(rpc).toHaveBeenCalledTimes(1);

    const duplicateRow = v6Row();
    duplicateRow.reward_catalogue.offers.push({
      ...duplicateRow.reward_catalogue.offers[0]!,
    });
    rpc.mockResolvedValueOnce({ data: [duplicateRow], error: null });
    await expect(
      getPublicLoyaltyExperience(workspaceId, programmeId),
    ).rejects.toThrow("public_loyalty_read_unavailable");
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("fails closed when V6 referral data expands authority or contradicts state", async () => {
    const privateRow = v6Row();
    privateRow.referral_catalogue = {
      ...privateRow.referral_catalogue,
      advocateCode: "a1000000-0000-4000-8000-000000000009",
    } as typeof privateRow.referral_catalogue;
    rpc.mockResolvedValueOnce({ data: [privateRow], error: null });
    await expect(
      getPublicLoyaltyExperience(workspaceId, programmeId),
    ).rejects.toThrow("public_loyalty_read_unavailable");
    expect(rpc).toHaveBeenCalledTimes(1);

    const paused = v6Row();
    paused.referral_catalogue = {
      version: "1",
      state: "paused",
      advocateRewardPoints: "500",
    } as typeof paused.referral_catalogue;
    rpc.mockResolvedValueOnce({ data: [paused], error: null });
    await expect(
      getPublicLoyaltyExperience(workspaceId, programmeId),
    ).rejects.toThrow("public_loyalty_read_unavailable");
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("fails closed on duplicate or non-array public containers", async () => {
    rpc.mockResolvedValueOnce({
      data: [v6Row(), v6Row()],
      error: null,
    });
    await expect(
      getPublicLoyaltyExperience(workspaceId, programmeId),
    ).rejects.toThrow("public_loyalty_read_unavailable");

    rpc.mockResolvedValueOnce({ data: { row: v6Row() }, error: null });
    await expect(
      getPublicLoyaltyExperience(workspaceId, programmeId),
    ).rejects.toThrow("public_loyalty_read_unavailable");
  });

  it("returns missing honestly and bounds provider errors", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(
      getPublicLoyaltyExperience(workspaceId, programmeId),
    ).resolves.toBeNull();

    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "57014", message: "unavailable" },
    });
    await expect(
      getPublicLoyaltyExperience(workspaceId, programmeId),
    ).rejects.toThrow("public_loyalty_read_unavailable");
  });

  it("rejects a non-English legacy projection during rolling deploy", async () => {
    rpc
      .mockResolvedValueOnce({ data: null, error: { code: "42883" } })
      .mockResolvedValueOnce({ data: [v1Row("sl-SI")], error: null });
    await expect(
      getPublicLoyaltyExperience(workspaceId, programmeId),
    ).rejects.toThrow("public_loyalty_read_unavailable");
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
