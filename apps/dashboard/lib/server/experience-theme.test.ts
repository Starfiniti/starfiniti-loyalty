import { beforeEach, describe, expect, it, vi } from "vitest";

const from = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    schema: () => ({ from }),
  }),
}));

import type { TenantContext } from "@/lib/tenant-context";
import { getMerchantExperienceTheme } from "./experience-theme";

const context = {
  organization: {
    id: "91000000-0000-4000-8000-000000000001",
    public_id: "91000000-0000-4000-8000-000000000002",
    name: "Starfiniti",
  },
  workspace: {
    id: "91000000-0000-4000-8000-000000000003",
    public_id: "91000000-0000-4000-8000-000000000004",
    name: "Rosy Beauty",
  },
  programmeGroup: {
    id: "91000000-0000-4000-8000-000000000005",
    public_id: "91000000-0000-4000-8000-000000000006",
    name: "Rosy Rewards",
  },
  membershipRole: "owner",
} as unknown as TenantContext;

function query(result: unknown) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.limit.mockReturnValue(builder);
  return builder;
}

function themeRow(
  sectionOrder: string[] = [
    "overview",
    "earning",
    "rewards",
    "vip",
    "referrals",
    "history",
    "account",
  ],
) {
  return {
    public_id: "91000000-0000-4000-8000-000000000007",
    revision: 4,
    brand_color: "#7c2d4f",
    display_font: "editorial-serif",
    card_radius_px: 14,
    hero_text: "Beauty that gives back",
    points_label: "Points",
    show_tier: true,
    show_rewards: true,
    widget_position: "right",
    density: "compact",
    hero_asset: "crown",
    show_referrals: false,
    section_order: sectionOrder,
    updated_at: "2026-08-25T10:00:00Z",
  };
}

const copyRow = {
  locale: "en",
  revision: 3,
  hero_text: "Members get more",
  points_label: "Stars",
  balance_label: "Your balance",
  rewards_label: "Member rewards",
  redeem_label: "Use points",
  join_label: "Join free",
  earn_message: "Earn stars on eligible purchases.",
};

describe("merchant controlled presentation read", () => {
  beforeEach(() => {
    from.mockReset();
    from.mockImplementation((table: string) => {
      if (table === "programme_group_workspaces") {
        return query({ data: { id: "scope" }, error: null });
      }
      if (table === "experience_themes") {
        return query({ data: themeRow(), error: null });
      }
      return query({ data: copyRow, error: null });
    });
  });

  it("returns one strict V2 theme and the English copy only", async () => {
    await expect(getMerchantExperienceTheme(context)).resolves.toMatchObject({
      scopeReady: true,
      revision: 4,
      definition: {
        version: "2",
        density: "compact",
        heroAsset: "crown",
        showReferrals: false,
      },
      copy: {
        revision: 3,
        definition: {
          version: "2",
          locale: "en",
          pointsLabel: "Stars",
        },
      },
    });
    const translationBuilder = from.mock.results.find(
      (result) =>
        result.value &&
        (result.value as { eq: ReturnType<typeof vi.fn> }).eq.mock.calls.some(
          (call: unknown[]) => call[0] === "locale",
        ),
    )?.value as { eq: ReturnType<typeof vi.fn> };
    expect(translationBuilder.eq).toHaveBeenCalledWith("locale", "en");
  });

  it("fails closed when the authored composition is malformed", async () => {
    from.mockImplementation((table: string) =>
      query({
        data:
          table === "programme_group_workspaces"
            ? { id: "scope" }
            : table === "experience_themes"
              ? themeRow([
                  "overview",
                  "overview",
                  "rewards",
                  "vip",
                  "referrals",
                  "history",
                  "account",
                ])
              : copyRow,
        error: null,
      }),
    );
    await expect(getMerchantExperienceTheme(context)).rejects.toThrow(
      "experience_theme_read_unavailable",
    );
  });

  it("returns bounded defaults before a workspace is linked", async () => {
    await expect(
      getMerchantExperienceTheme({
        ...context,
        workspace: null,
        programmeGroup: null,
      }),
    ).resolves.toMatchObject({
      scopeReady: false,
      revision: 0,
      definition: { version: "2" },
      copy: { revision: 0, definition: { locale: "en" } },
    });
    expect(from).not.toHaveBeenCalled();
  });
});
