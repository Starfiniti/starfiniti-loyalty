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
