import { z } from "zod";

const accessibleBrandColor = z
  .string()
  .regex(/^#[0-9a-f]{6}$/u)
  .refine((color) => contrastAgainstWhite(color) >= 4.5, {
    message: "Brand color must meet 4.5:1 contrast with white text",
  });

const controlledPresentationText = z
  .string()
  .trim()
  .regex(/^[^\u0000-\u001f\u007f<>]*$/u);

export const experienceDisplayFontV1 = z.enum([
  "system-sans",
  "editorial-serif",
  "modern-serif",
]);

export const experienceThemeDefinitionV1 = z
  .object({
    version: z.literal("1"),
    brandColor: accessibleBrandColor,
    displayFont: experienceDisplayFontV1,
    cardRadiusPx: z.union([z.literal(8), z.literal(14), z.literal(22)]),
    heroText: z.string().trim().min(1).max(120),
    pointsLabel: z.string().trim().min(1).max(30),
    showTier: z.boolean(),
    showRewards: z.boolean(),
    widgetPosition: z.enum(["left", "right"]),
  })
  .strict();

export const experienceSectionV2 = z.enum([
  "overview",
  "earning",
  "rewards",
  "vip",
  "referrals",
  "history",
  "account",
]);

export const canonicalExperienceSectionOrderV2 = [
  "overview",
  "earning",
  "rewards",
  "vip",
  "referrals",
  "history",
  "account",
] as const;

export const experienceSectionOrderV2 = z
  .array(experienceSectionV2)
  .length(canonicalExperienceSectionOrderV2.length)
  .superRefine((sections, context) => {
    if (new Set(sections).size !== canonicalExperienceSectionOrderV2.length) {
      context.addIssue({
        code: "custom",
        message: "Every customer section must appear exactly once",
      });
    }
  });

export const experienceHeroAssetV2 = z.enum([
  "none",
  "sparkles",
  "gift",
  "crown",
]);

export const experienceDensityV2 = z.enum(["comfortable", "compact"]);

export const experienceThemeDefinitionV2 = experienceThemeDefinitionV1
  .extend({
    version: z.literal("2"),
    heroText: controlledPresentationText.min(1).max(120),
    pointsLabel: controlledPresentationText.min(1).max(30),
    density: experienceDensityV2,
    heroAsset: experienceHeroAssetV2,
    showReferrals: z.boolean(),
    sectionOrder: experienceSectionOrderV2,
  })
  .strict();

export const merchantSaveExperienceThemeCommandV1 = z
  .object({
    version: z.literal("1"),
    workspaceId: z.uuid(),
    programmeGroupId: z.uuid(),
    theme: experienceThemeDefinitionV1,
    idempotencyKey: z.string().min(1).max(255),
    correlationId: z.uuid(),
  })
  .strict();

export const merchantSaveExperienceThemeCommandV2 = z
  .object({
    version: z.literal("2"),
    workspaceId: z.uuid(),
    programmeGroupId: z.uuid(),
    theme: experienceThemeDefinitionV2,
    idempotencyKey: z.string().min(1).max(255),
    correlationId: z.uuid(),
  })
  .strict();

export const merchantExperienceThemeResultV1 = z.object({
  resourceId: z.uuid(),
  outcome: z.enum(["created", "updated", "duplicate"]),
  revision: z.number().int().positive(),
});

export const experienceLocaleV1 = z.enum(["en", "sl-SI"]);

const translatedCopy = z
  .string()
  .trim()
  .regex(/^[^\u0000-\u001f\u007f<>]*$/u);

export const experienceTranslationDefinitionV1 = z
  .object({
    version: z.literal("1"),
    locale: experienceLocaleV1,
    heroText: translatedCopy.min(1).max(120),
    pointsLabel: translatedCopy.min(1).max(30),
    balanceLabel: translatedCopy.min(1).max(40),
    rewardsLabel: translatedCopy.min(1).max(40),
    redeemLabel: translatedCopy.min(1).max(30),
    joinLabel: translatedCopy.min(1).max(30),
    earnMessage: translatedCopy.min(1).max(120),
  })
  .strict();

export const experienceCopyDefinitionV2 = experienceTranslationDefinitionV1
  .extend({
    version: z.literal("2"),
    locale: z.literal("en"),
  })
  .strict();

export const experiencePresentationV2 = z
  .object({
    version: z.literal("2"),
    theme: experienceThemeDefinitionV2,
    copy: experienceCopyDefinitionV2,
  })
  .strict();

export const merchantSaveExperienceCopyCommandV2 = z
  .object({
    version: z.literal("2"),
    workspaceId: z.uuid(),
    programmeGroupId: z.uuid(),
    copy: experienceCopyDefinitionV2,
    idempotencyKey: z.string().min(1).max(255),
    correlationId: z.uuid(),
  })
  .strict();

export const merchantSaveExperienceTranslationCommandV1 = z
  .object({
    version: z.literal("1"),
    workspaceId: z.uuid(),
    programmeGroupId: z.uuid(),
    translation: experienceTranslationDefinitionV1,
    idempotencyKey: z.string().min(1).max(255),
    correlationId: z.uuid(),
  })
  .strict();

export const merchantExperienceTranslationResultV1 = z
  .object({
    resourceId: z.uuid(),
    outcome: z.enum(["created", "updated", "duplicate"]),
    revision: z.number().int().positive(),
    locale: experienceLocaleV1,
  })
  .strict();

const publicTierV1 = z
  .object({
    code: z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/u),
    name: translatedCopy.min(1).max(200),
    minimumEligibleSpendMinor: z.string().regex(/^(?:0|[1-9][0-9]*)$/u),
    pointsPerMajorUnit: z.string().regex(/^[1-9][0-9]*$/u),
  })
  .strict();

const publicRewardV1 = z
  .object({
    code: z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/u),
    name: translatedCopy.min(1).max(200),
    kind: z.enum([
      "fixed_discount",
      "percentage_discount",
      "free_product",
      "free_shipping",
      "store_credit",
      "exclusive_access",
      "custom",
    ]),
    costPoints: z.string().regex(/^[1-9][0-9]*$/u),
  })
  .strict();

export const publicLoyaltyExperienceV1 = z
  .object({
    version: z.literal("1"),
    workspaceId: z.uuid(),
    programmeId: z.uuid(),
    programmeGroupId: z.uuid(),
    programmeName: translatedCopy.min(1).max(200),
    requestedLocale: experienceLocaleV1,
    resolvedLocale: experienceLocaleV1,
    brandColor: accessibleBrandColor,
    displayFont: z.enum(["system-sans", "editorial-serif", "modern-serif"]),
    cardRadiusPx: z.union([z.literal(8), z.literal(14), z.literal(22)]),
    showTier: z.boolean(),
    showRewards: z.boolean(),
    copy: experienceTranslationDefinitionV1,
    tiers: z.array(publicTierV1).max(12),
    rewards: z.array(publicRewardV1).max(20),
  })
  .strict();

export const publicLoyaltyExperienceV2 = publicLoyaltyExperienceV1
  .omit({
    version: true,
    requestedLocale: true,
    resolvedLocale: true,
    brandColor: true,
    displayFont: true,
    cardRadiusPx: true,
    showTier: true,
    showRewards: true,
    copy: true,
  })
  .extend({
    version: z.literal("2"),
    requestedLocale: z.literal("en"),
    resolvedLocale: z.literal("en"),
    presentation: experiencePresentationV2,
  })
  .strict();

function srgbChannel(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

export function contrastAgainstWhite(color: string): number {
  if (!/^#[0-9a-fA-F]{6}$/u.test(color)) return 0;
  const red = srgbChannel(Number.parseInt(color.slice(1, 3), 16));
  const green = srgbChannel(Number.parseInt(color.slice(3, 5), 16));
  const blue = srgbChannel(Number.parseInt(color.slice(5, 7), 16));
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return 1.05 / (luminance + 0.05);
}

export type ExperienceThemeDefinitionV1 = z.infer<
  typeof experienceThemeDefinitionV1
>;
export type ExperienceSectionV2 = z.infer<typeof experienceSectionV2>;
export type ExperienceHeroAssetV2 = z.infer<typeof experienceHeroAssetV2>;
export type ExperienceDensityV2 = z.infer<typeof experienceDensityV2>;
export type ExperienceThemeDefinitionV2 = z.infer<
  typeof experienceThemeDefinitionV2
>;
export type ExperienceLocaleV1 = z.infer<typeof experienceLocaleV1>;
export type ExperienceTranslationDefinitionV1 = z.infer<
  typeof experienceTranslationDefinitionV1
>;
export type ExperienceCopyDefinitionV2 = z.infer<
  typeof experienceCopyDefinitionV2
>;
export type ExperiencePresentationV2 = z.infer<typeof experiencePresentationV2>;
export type MerchantSaveExperienceCopyCommandV2 = z.infer<
  typeof merchantSaveExperienceCopyCommandV2
>;
export type PublicLoyaltyExperienceV1 = z.infer<
  typeof publicLoyaltyExperienceV1
>;
export type PublicLoyaltyExperienceV2 = z.infer<
  typeof publicLoyaltyExperienceV2
>;
