import { describe, expect, it } from "vitest";
import {
  contrastAgainstWhite,
  experienceTranslationDefinitionV1,
  experienceThemeDefinitionV1,
  merchantSaveExperienceTranslationCommandV1,
  merchantSaveExperienceThemeCommandV1,
} from "./experience";

const theme = {
  version: "1" as const,
  brandColor: "#7c2d4f",
  displayFont: "editorial-serif" as const,
  cardRadiusPx: 14 as const,
  heroText: "Beauty that gives back",
  pointsLabel: "Petals",
  showTier: true,
  showRewards: true,
  widgetPosition: "right" as const,
};

describe("experience theme contracts", () => {
  it("accepts a bounded accessible token set", () => {
    expect(experienceThemeDefinitionV1.safeParse(theme).success).toBe(true);
    expect(contrastAgainstWhite(theme.brandColor)).toBeGreaterThanOrEqual(4.5);
  });

  it("rejects colors that cannot carry white text accessibly", () => {
    expect(
      experienceThemeDefinitionV1.safeParse({
        ...theme,
        brandColor: "#fce7f3",
      }).success,
    ).toBe(false);
  });

  it("rejects arbitrary CSS, font URLs, and unknown controls", () => {
    expect(
      experienceThemeDefinitionV1.safeParse({
        ...theme,
        customCss: "body{display:none}",
      }).success,
    ).toBe(false);
    expect(
      experienceThemeDefinitionV1.safeParse({
        ...theme,
        displayFont: "url(https://tracking.invalid/font.woff2)",
      }).success,
    ).toBe(false);
  });

  it("keeps tenant authority on public scope IDs", () => {
    expect(
      merchantSaveExperienceThemeCommandV1.safeParse({
        version: "1",
        workspaceId: "a1000000-0000-4000-8000-000000000001",
        programmeGroupId: "a1000000-0000-4000-8000-000000000002",
        theme,
        idempotencyKey: "experience:save:one",
        correlationId: "a1000000-0000-4000-8000-000000000003",
      }).success,
    ).toBe(true);
  });

  it("accepts bounded English and Slovenian customer copy", () => {
    for (const locale of ["en", "sl-SI"] as const) {
      expect(
        experienceTranslationDefinitionV1.safeParse({
          version: "1",
          locale,
          heroText:
            locale === "en" ? "Beauty that gives back" : "Lepota, ki vrača",
          pointsLabel: locale === "en" ? "Points" : "Točke",
          balanceLabel: locale === "en" ? "Your balance" : "Vaše stanje",
          rewardsLabel: locale === "en" ? "Your rewards" : "Vaše nagrade",
          redeemLabel: locale === "en" ? "Redeem" : "Unovči",
          joinLabel: locale === "en" ? "Join free" : "Pridruži se brezplačno",
          earnMessage:
            locale === "en"
              ? "Earn points on every eligible order."
              : "Zbirajte točke pri vsakem upravičenem naročilu.",
        }).success,
      ).toBe(true);
    }
  });

  it("rejects unsupported locales, control characters, and caller authority", () => {
    const translation = {
      version: "1" as const,
      locale: "en" as const,
      heroText: "Beauty that gives back",
      pointsLabel: "Points",
      balanceLabel: "Your balance",
      rewardsLabel: "Your rewards",
      redeemLabel: "Redeem",
      joinLabel: "Join free",
      earnMessage: "Earn points on every eligible order.",
    };
    expect(
      experienceTranslationDefinitionV1.safeParse({
        ...translation,
        locale: "../../tenant",
      }).success,
    ).toBe(false);
    expect(
      experienceTranslationDefinitionV1.safeParse({
        ...translation,
        heroText: "unsafe\ncopy",
      }).success,
    ).toBe(false);
    expect(
      experienceTranslationDefinitionV1.safeParse({
        ...translation,
        earnMessage: "<script>unsafe</script>",
      }).success,
    ).toBe(false);
    expect(
      merchantSaveExperienceTranslationCommandV1.safeParse({
        version: "1",
        workspaceId: "a1000000-0000-4000-8000-000000000001",
        programmeGroupId: "a1000000-0000-4000-8000-000000000002",
        translation,
        idempotencyKey: "experience:translation:one",
        correlationId: "a1000000-0000-4000-8000-000000000003",
        organizationId: "1",
        actorId: "forged-owner",
      }).success,
    ).toBe(false);
  });
});
