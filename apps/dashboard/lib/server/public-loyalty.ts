import "server-only";
import {
  publicLoyaltyExperienceV1,
  type PublicLoyaltyExperienceV1,
} from "@starfiniti/contracts";
import { createPublicSupabaseClient } from "@/lib/supabase/public";

export async function getPublicLoyaltyExperience(
  workspaceId: string,
  programmeId: string,
  locale: "en",
): Promise<PublicLoyaltyExperienceV1 | null> {
  const supabase = createPublicSupabaseClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("get_public_loyalty_experience", {
      target_workspace_public_id: workspaceId,
      target_programme_public_id: programmeId,
      target_locale: locale,
    });
  if (error) throw new Error("public_loyalty_read_unavailable");
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return null;
  const parsed = publicLoyaltyExperienceV1.safeParse({
    version: "1",
    workspaceId: row.workspace_public_id,
    programmeId: row.programme_public_id,
    programmeGroupId: row.programme_group_public_id,
    programmeName: row.programme_name,
    requestedLocale: row.requested_locale,
    resolvedLocale: row.resolved_locale,
    brandColor: row.brand_color,
    displayFont: row.display_font,
    cardRadiusPx: row.card_radius_px,
    showTier: row.show_tier,
    showRewards: row.show_rewards,
    copy: {
      version: "1",
      locale: row.resolved_locale,
      heroText: row.hero_text,
      pointsLabel: row.points_label,
      balanceLabel: row.balance_label,
      rewardsLabel: row.rewards_label,
      redeemLabel: row.redeem_label,
      joinLabel: row.join_label,
      earnMessage: row.earn_message,
    },
    tiers: row.tiers,
    rewards: row.rewards,
  });
  if (
    !parsed.success ||
    parsed.data.requestedLocale !== "en" ||
    parsed.data.resolvedLocale !== "en" ||
    parsed.data.copy.locale !== "en"
  ) {
    throw new Error("public_loyalty_read_unavailable");
  }
  return parsed.data;
}
