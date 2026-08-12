import type { ExperienceThemeDefinitionV1 } from "@starfiniti/contracts";

export const DEFAULT_EXPERIENCE_THEME: ExperienceThemeDefinitionV1 = {
  version: "1",
  brandColor: "#7c2d4f",
  displayFont: "editorial-serif",
  cardRadiusPx: 14,
  heroText: "Beauty that gives back",
  pointsLabel: "Points",
  showTier: true,
  showRewards: true,
  widgetPosition: "right",
};

export function experienceFontStack(
  font: ExperienceThemeDefinitionV1["displayFont"],
): string {
  return {
    "system-sans": 'Geist, "Segoe UI", sans-serif',
    "editorial-serif": 'Georgia, "Times New Roman", serif',
    "modern-serif": 'Iowan Old Style, "Palatino Linotype", serif',
  }[font];
}
