import { z } from "zod";

const accessibleBrandColor = z
  .string()
  .regex(/^#[0-9a-f]{6}$/u)
  .refine((color) => contrastAgainstWhite(color) >= 4.5, {
    message: "Brand color must meet 4.5:1 contrast with white text",
  });

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
    brandColor: z.string().regex(/^#[0-9a-f]{6}$/u),
    displayFont: z.enum(["system-sans", "editorial-serif", "modern-serif"]),
    cardRadiusPx: z.union([z.literal(8), z.literal(14), z.literal(22)]),
    showTier: z.boolean(),
    showRewards: z.boolean(),
    copy: experienceTranslationDefinitionV1,
    tiers: z.array(publicTierV1).max(12),
    rewards: z.array(publicRewardV1).max(20),
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
export type ExperienceLocaleV1 = z.infer<typeof experienceLocaleV1>;
export type ExperienceTranslationDefinitionV1 = z.infer<
  typeof experienceTranslationDefinitionV1
>;
export type PublicLoyaltyExperienceV1 = z.infer<
  typeof publicLoyaltyExperienceV1
>;
