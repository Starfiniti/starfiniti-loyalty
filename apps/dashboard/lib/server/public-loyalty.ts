import "server-only";
import {
  canonicalExperienceSectionOrderV2,
  publicLoyaltyExperienceV1,
  publicLoyaltyExperienceV2,
  publicLoyaltyExperienceV3,
  publicLoyaltyExperienceV4,
  type PublicLoyaltyExperienceV1,
  type PublicLoyaltyExperienceV2,
  type PublicLoyaltyExperienceV3,
  type PublicLoyaltyExperienceV4,
} from "@starfiniti/contracts";
import { createPublicSupabaseClient } from "@/lib/supabase/public";

type ProjectionError = Readonly<{ code?: string | null }>;

export async function getPublicLoyaltyExperience(
  workspaceId: string,
  programmeId: string,
): Promise<PublicLoyaltyExperienceV4 | null> {
  const loyalty = createPublicSupabaseClient().schema("loyalty");
  const v4 = await loyalty.rpc("get_public_loyalty_experience_v4", {
    target_workspace_public_id: workspaceId,
    target_programme_public_id: programmeId,
  });
  if (!v4.error) return parseV4(v4.data);
  if (!isMissingProjection(v4.error)) {
    throw new Error("public_loyalty_read_unavailable");
  }

  const v3 = await loyalty.rpc("get_public_loyalty_experience_v3", {
    target_workspace_public_id: workspaceId,
    target_programme_public_id: programmeId,
  });
  if (!v3.error) {
    const parsed = parseV3(v3.data);
    return parsed ? normalizeV3(parsed) : null;
  }
  if (!isMissingProjection(v3.error)) {
    throw new Error("public_loyalty_read_unavailable");
  }

  const v2 = await loyalty.rpc("get_public_loyalty_experience_v2", {
    target_workspace_public_id: workspaceId,
    target_programme_public_id: programmeId,
  });
  if (!v2.error) {
    const parsed = parseV2(v2.data);
    return parsed ? normalizeV3(normalizeV2(parsed)) : null;
  }
  if (!isMissingProjection(v2.error)) {
    throw new Error("public_loyalty_read_unavailable");
  }

  // The English V1 projection remains valid only as a rolling-deploy bridge.
  const v1 = await loyalty.rpc("get_public_loyalty_experience", {
    target_workspace_public_id: workspaceId,
    target_programme_public_id: programmeId,
    target_locale: "en",
  });
  if (v1.error) throw new Error("public_loyalty_read_unavailable");
  const parsed = parseV1(v1.data);
  return parsed ? normalizeV3(normalizeV2(normalizeV1(parsed))) : null;
}

function parseV4(data: unknown): PublicLoyaltyExperienceV4 | null {
  if (!Array.isArray(data)) throw new Error("public_loyalty_read_unavailable");
  if (data.length === 0) return null;
  if (data.length !== 1) throw new Error("public_loyalty_read_unavailable");
  const row = data[0];
  const parsed = publicLoyaltyExperienceV4.safeParse({
    version: "4",
    workspaceId: row.workspace_public_id,
    programmeId: row.programme_public_id,
    programmeGroupId: row.programme_group_public_id,
    programmeName: row.programme_name,
    requestedLocale: row.requested_locale,
    resolvedLocale: row.resolved_locale,
    presentation: row.presentation,
    tiers: row.tiers,
    rewards: row.rewards,
    vipCatalogue: row.vip_catalogue,
    earningMethods: row.earning_methods,
  });
  if (!parsed.success) throw new Error("public_loyalty_read_unavailable");
  return parsed.data;
}

function parseV3(data: unknown): PublicLoyaltyExperienceV3 | null {
  if (!Array.isArray(data)) throw new Error("public_loyalty_read_unavailable");
  if (data.length === 0) return null;
  if (data.length !== 1) throw new Error("public_loyalty_read_unavailable");
  const row = data[0];
  const parsed = publicLoyaltyExperienceV3.safeParse({
    version: "3",
    workspaceId: row.workspace_public_id,
    programmeId: row.programme_public_id,
    programmeGroupId: row.programme_group_public_id,
    programmeName: row.programme_name,
    requestedLocale: row.requested_locale,
    resolvedLocale: row.resolved_locale,
    presentation: row.presentation,
    tiers: row.tiers,
    rewards: row.rewards,
    vipCatalogue: row.vip_catalogue,
  });
  if (!parsed.success) throw new Error("public_loyalty_read_unavailable");
  return parsed.data;
}

function parseV2(data: unknown): PublicLoyaltyExperienceV2 | null {
  if (!Array.isArray(data)) throw new Error("public_loyalty_read_unavailable");
  if (data.length === 0) return null;
  if (data.length !== 1) throw new Error("public_loyalty_read_unavailable");
  const row = data[0];
  const parsed = publicLoyaltyExperienceV2.safeParse({
    version: "2",
    workspaceId: row.workspace_public_id,
    programmeId: row.programme_public_id,
    programmeGroupId: row.programme_group_public_id,
    programmeName: row.programme_name,
    requestedLocale: row.requested_locale,
    resolvedLocale: row.resolved_locale,
    presentation: row.presentation,
    tiers: row.tiers,
    rewards: row.rewards,
  });
  if (!parsed.success) throw new Error("public_loyalty_read_unavailable");
  return parsed.data;
}

function parseV1(data: unknown): PublicLoyaltyExperienceV1 | null {
  if (!Array.isArray(data)) throw new Error("public_loyalty_read_unavailable");
  if (data.length === 0) return null;
  if (data.length !== 1) throw new Error("public_loyalty_read_unavailable");
  const row = data[0];
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

function normalizeV1(
  experience: PublicLoyaltyExperienceV1,
): PublicLoyaltyExperienceV2 {
  return publicLoyaltyExperienceV2.parse({
    version: "2",
    workspaceId: experience.workspaceId,
    programmeId: experience.programmeId,
    programmeGroupId: experience.programmeGroupId,
    programmeName: experience.programmeName,
    requestedLocale: "en",
    resolvedLocale: "en",
    presentation: {
      version: "2",
      theme: {
        version: "2",
        brandColor: experience.brandColor,
        displayFont: experience.displayFont,
        cardRadiusPx: experience.cardRadiusPx,
        heroText: experience.copy.heroText,
        pointsLabel: experience.copy.pointsLabel,
        showTier: experience.showTier,
        showRewards: experience.showRewards,
        widgetPosition: "right",
        density: "comfortable",
        heroAsset: "sparkles",
        showReferrals: true,
        sectionOrder: [...canonicalExperienceSectionOrderV2],
      },
      copy: { ...experience.copy, version: "2", locale: "en" },
    },
    tiers: experience.tiers,
    rewards: experience.rewards,
  });
}

function normalizeV2(
  experience: PublicLoyaltyExperienceV2,
): PublicLoyaltyExperienceV3 {
  return publicLoyaltyExperienceV3.parse({
    ...experience,
    version: "3",
    vipCatalogue: {
      version: "1",
      qualificationPeriod: { kind: "lifetime" },
      downgradeGraceDays: 0,
      levels: experience.tiers.map((tier, index) => ({
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
  });
}

function normalizeV3(
  experience: PublicLoyaltyExperienceV3,
): PublicLoyaltyExperienceV4 {
  const firstTier = experience.tiers[0];
  return publicLoyaltyExperienceV4.parse({
    ...experience,
    version: "4",
    earningMethods: firstTier
      ? [
          {
            code: "eligible-purchases",
            name: "Eligible purchases",
            source: "purchase",
            effect: {
              kind: "base_rate",
              pointsPerMajorUnit: firstTier.pointsPerMajorUnit,
            },
            hasRestrictions: true,
            startsAt: null,
            endsAt: null,
            availableNow: true,
          },
        ]
      : [],
  });
}

function isMissingProjection(error: ProjectionError): boolean {
  return error.code === "PGRST202" || error.code === "42883";
}
