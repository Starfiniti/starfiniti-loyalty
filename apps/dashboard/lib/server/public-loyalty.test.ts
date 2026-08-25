import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const schema = vi.fn(() => ({ rpc }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/public", () => ({
  createPublicSupabaseClient: () => ({ schema }),
}));

import { getPublicLoyaltyExperience } from "./public-loyalty";

function row(locale = "en") {
  return {
    workspace_public_id: "a1000000-0000-4000-8000-000000000001",
    programme_public_id: "a1000000-0000-4000-8000-000000000002",
    programme_group_public_id: "a1000000-0000-4000-8000-000000000003",
    programme_name: "Rosy Rewards",
    requested_locale: "en",
    resolved_locale: locale,
    brand_color: "#7c2d4f",
    display_font: "editorial-serif",
    card_radius_px: 14,
    show_tier: true,
    show_rewards: true,
    hero_text: locale === "en" ? "Beauty that gives back" : "Lepota, ki vrača",
    points_label: locale === "en" ? "Points" : "Točke",
    balance_label: locale === "en" ? "Your balance" : "Vaše stanje",
    rewards_label: locale === "en" ? "Rewards" : "Nagrade",
    redeem_label: locale === "en" ? "Redeem" : "Unovči",
    join_label: locale === "en" ? "Join free" : "Pridruži se",
    earn_message:
      locale === "en"
        ? "Earn points on eligible orders."
        : "Zbirajte točke pri naročilih.",
    tiers: [
      {
        code: "rose",
        name: "Rose",
        minimumEligibleSpendMinor: "0",
        pointsPerMajorUnit: "5",
      },
    ],
    rewards: [
      {
        code: "five-off",
        name: "€5 discount",
        kind: "fixed_discount",
        costPoints: "500",
      },
    ],
  };
}

const workspaceId = "a1000000-0000-4000-8000-000000000001";
const programmeId = "a1000000-0000-4000-8000-000000000002";

describe("public loyalty server read", () => {
  beforeEach(() => {
    rpc.mockReset();
    schema.mockClear();
    rpc.mockResolvedValue({ data: [row()], error: null });
  });

  it("requests and returns only the active English public document", async () => {
    await expect(
      getPublicLoyaltyExperience(workspaceId, programmeId, "en"),
    ).resolves.toMatchObject({
      requestedLocale: "en",
      resolvedLocale: "en",
      copy: { locale: "en" },
    });
    expect(schema).toHaveBeenCalledWith("loyalty");
    expect(rpc).toHaveBeenCalledWith("get_public_loyalty_experience", {
      target_workspace_public_id: workspaceId,
      target_programme_public_id: programmeId,
      target_locale: "en",
    });
  });

  it("fails closed if a legacy non-English fallback is returned", async () => {
    rpc.mockResolvedValue({ data: [row("sl-SI")], error: null });
    await expect(
      getPublicLoyaltyExperience(workspaceId, programmeId, "en"),
    ).rejects.toThrow("public_loyalty_read_unavailable");
  });

  it("returns an honest missing programme and rejects database errors", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(
      getPublicLoyaltyExperience(workspaceId, programmeId, "en"),
    ).resolves.toBeNull();

    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "unavailable" },
    });
    await expect(
      getPublicLoyaltyExperience(workspaceId, programmeId, "en"),
    ).rejects.toThrow("public_loyalty_read_unavailable");
  });
});
