import type {
  ExperienceThemeDefinitionV1,
  ExperienceTranslationDefinitionV1,
} from "@starfiniti/contracts";

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

export const DEFAULT_EXPERIENCE_TRANSLATIONS: Readonly<
  Record<"en" | "sl-SI", ExperienceTranslationDefinitionV1>
> = {
  en: {
    version: "1",
    locale: "en",
    heroText: "Beauty that gives back",
    pointsLabel: "Points",
    balanceLabel: "Your balance",
    rewardsLabel: "Your rewards",
    redeemLabel: "Redeem",
    joinLabel: "Join free",
    earnMessage: "Earn points on every eligible order.",
  },
  "sl-SI": {
    version: "1",
    locale: "sl-SI",
    heroText: "Lepota, ki vrača",
    pointsLabel: "Točke",
    balanceLabel: "Vaše stanje",
    rewardsLabel: "Vaše nagrade",
    redeemLabel: "Unovči",
    joinLabel: "Pridruži se brezplačno",
    earnMessage: "Zbirajte točke pri vsakem upravičenem naročilu.",
  },
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
