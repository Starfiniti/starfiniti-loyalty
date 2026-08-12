import "server-only";
import { experienceThemeDefinitionV1 } from "@starfiniti/contracts";
import {
  DEFAULT_EXPERIENCE_THEME,
  experienceFontStack,
} from "@/lib/experience-theme";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TenantContext } from "@/lib/tenant-context";

export type MerchantExperienceTheme = Readonly<{
  scopeReady: boolean;
  id: string | null;
  revision: number;
  updatedAt: string | null;
  definition: typeof DEFAULT_EXPERIENCE_THEME;
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
  updated_at: string;
}>;

export async function getMerchantExperienceTheme(
  context: TenantContext,
): Promise<MerchantExperienceTheme> {
  if (!context.workspace || !context.programmeGroup) {
    return {
      scopeReady: false,
      id: null,
      revision: 0,
      updatedAt: null,
      definition: DEFAULT_EXPERIENCE_THEME,
    };
  }

  const supabase = await createSupabaseServerClient();
  const [scopeResult, result] = await Promise.all([
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
        "public_id,revision,brand_color,display_font,card_radius_px,hero_text,points_label,show_tier,show_rewards,widget_position,updated_at",
      )
      .eq("organization_id", context.organization.id)
      .eq("workspace_id", context.workspace.id)
      .eq("programme_group_id", context.programmeGroup.id)
      .limit(1)
      .maybeSingle(),
  ]);
  if (scopeResult.error || result.error) {
    throw new Error("experience_theme_read_unavailable");
  }
  if (!scopeResult.data) {
    return {
      scopeReady: false,
      id: null,
      revision: 0,
      updatedAt: null,
      definition: DEFAULT_EXPERIENCE_THEME,
    };
  }
  const row = result.data as ThemeRow | null;
  if (!row) {
    return {
      scopeReady: true,
      id: null,
      revision: 0,
      updatedAt: null,
      definition: DEFAULT_EXPERIENCE_THEME,
    };
  }

  const definition = experienceThemeDefinitionV1.safeParse({
    version: "1",
    brandColor: row.brand_color,
    displayFont: row.display_font,
    cardRadiusPx: row.card_radius_px,
    heroText: row.hero_text,
    pointsLabel: row.points_label,
    showTier: row.show_tier,
    showRewards: row.show_rewards,
    widgetPosition: row.widget_position,
  });
  if (!definition.success) throw new Error("experience_theme_read_unavailable");
  return {
    scopeReady: true,
    id: row.public_id,
    revision: row.revision,
    updatedAt: row.updated_at,
    definition: definition.data,
  };
}
