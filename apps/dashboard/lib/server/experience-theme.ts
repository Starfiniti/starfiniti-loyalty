import "server-only";
import {
  experienceCopyDefinitionV2,
  experienceThemeDefinitionV2,
  type ExperienceCopyDefinitionV2,
} from "@starfiniti/contracts";
import {
  DEFAULT_EXPERIENCE_COPY_V2,
  DEFAULT_EXPERIENCE_THEME_V2,
  experienceFontStack,
} from "@/lib/experience-theme";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TenantContext } from "@/lib/tenant-context";

export type MerchantExperienceTheme = Readonly<{
  scopeReady: boolean;
  id: string | null;
  revision: number;
  updatedAt: string | null;
  definition: typeof DEFAULT_EXPERIENCE_THEME_V2;
  copy: Readonly<{
    definition: ExperienceCopyDefinitionV2;
    revision: number;
  }>;
}>;

type ThemeRow = Readonly<{
  public_id: string;
  revision: number;
  brand_color: string;
  display_font: Parameters<typeof experienceFontStack>[0];
  card_radius_px: number;
  hero_text: string;
  points_label: string;
  show_tier: boolean;
  show_rewards: boolean;
  widget_position: "left" | "right";
  density: "comfortable" | "compact";
  hero_asset: "none" | "sparkles" | "gift" | "crown";
  show_referrals: boolean;
  section_order: string[];
  updated_at: string;
}>;

type TranslationRow = Readonly<{
  locale: string;
  revision: number;
  hero_text: string;
  points_label: string;
  balance_label: string;
  rewards_label: string;
  redeem_label: string;
  join_label: string;
  earn_message: string;
}>;

const defaultCopy = () => ({
  definition: DEFAULT_EXPERIENCE_COPY_V2,
  revision: 0,
});

export async function getMerchantExperienceTheme(
  context: TenantContext,
): Promise<MerchantExperienceTheme> {
  if (!context.workspace || !context.programmeGroup) {
    return {
      scopeReady: false,
      id: null,
      revision: 0,
      updatedAt: null,
      definition: DEFAULT_EXPERIENCE_THEME_V2,
      copy: defaultCopy(),
    };
  }

  const supabase = await createSupabaseServerClient();
  const [scopeResult, result, translationResult] = await Promise.all([
    supabase
      .schema("loyalty")
      .from("programme_group_workspaces")
      .select("id")
      .eq("organization_id", context.organization.id)
      .eq("workspace_id", context.workspace.id)
      .eq("programme_group_id", context.programmeGroup.id)
      .limit(1)
      .maybeSingle(),
    supabase
      .schema("loyalty")
      .from("experience_themes")
      .select(
        "public_id,revision,brand_color,display_font,card_radius_px,hero_text,points_label,show_tier,show_rewards,widget_position,density,hero_asset,show_referrals,section_order,updated_at",
      )
      .eq("organization_id", context.organization.id)
      .eq("workspace_id", context.workspace.id)
      .eq("programme_group_id", context.programmeGroup.id)
      .limit(1)
      .maybeSingle(),
    supabase
      .schema("loyalty")
      .from("experience_translations")
      .select(
        "locale,revision,hero_text,points_label,balance_label,rewards_label,redeem_label,join_label,earn_message",
      )
      .eq("organization_id", context.organization.id)
      .eq("workspace_id", context.workspace.id)
      .eq("programme_group_id", context.programmeGroup.id)
      .eq("locale", "en")
      .limit(1)
      .maybeSingle(),
  ]);
  if (scopeResult.error || result.error || translationResult.error) {
    throw new Error("experience_theme_read_unavailable");
  }
  if (!scopeResult.data) {
    return {
      scopeReady: false,
      id: null,
      revision: 0,
      updatedAt: null,
      definition: DEFAULT_EXPERIENCE_THEME_V2,
      copy: defaultCopy(),
    };
  }
  const row = result.data as ThemeRow | null;
  const translationRow = translationResult.data as TranslationRow | null;
  const savedCopy = translationRow
    ? experienceCopyDefinitionV2.safeParse({
        version: "2",
        locale: "en",
        heroText: translationRow.hero_text,
        pointsLabel: translationRow.points_label,
        balanceLabel: translationRow.balance_label,
        rewardsLabel: translationRow.rewards_label,
        redeemLabel: translationRow.redeem_label,
        joinLabel: translationRow.join_label,
        earnMessage: translationRow.earn_message,
      })
    : null;
  if (savedCopy && !savedCopy.success)
    throw new Error("experience_theme_read_unavailable");
  if (!row) {
    return {
      scopeReady: true,
      id: null,
      revision: 0,
      updatedAt: null,
      definition: DEFAULT_EXPERIENCE_THEME_V2,
      copy: savedCopy?.success
        ? { definition: savedCopy.data, revision: translationRow!.revision }
        : defaultCopy(),
    };
  }

  const definition = experienceThemeDefinitionV2.safeParse({
    version: "2",
    brandColor: row.brand_color,
    displayFont: row.display_font,
    cardRadiusPx: row.card_radius_px,
    heroText: row.hero_text,
    pointsLabel: row.points_label,
    showTier: row.show_tier,
    showRewards: row.show_rewards,
    widgetPosition: row.widget_position,
    density: row.density,
    heroAsset: row.hero_asset,
    showReferrals: row.show_referrals,
    sectionOrder: row.section_order,
  });
  if (!definition.success) throw new Error("experience_theme_read_unavailable");
  const copy = savedCopy?.success
    ? { definition: savedCopy.data, revision: translationRow!.revision }
    : {
        revision: 0,
        definition: {
          ...DEFAULT_EXPERIENCE_COPY_V2,
          heroText: definition.data.heroText,
          pointsLabel: definition.data.pointsLabel,
        },
      };
  return {
    scopeReady: true,
    id: row.public_id,
    revision: row.revision,
    updatedAt: row.updated_at,
    definition: definition.data,
    copy,
  };
}
