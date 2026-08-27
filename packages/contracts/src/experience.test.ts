import { describe, expect, it } from "vitest";
import {
  canonicalExperienceSectionOrderV2,
  contrastAgainstWhite,
  experienceCopyDefinitionV2,
  experienceTranslationDefinitionV1,
  experienceThemeDefinitionV1,
  experienceThemeDefinitionV2,
  merchantSaveExperienceTranslationCommandV1,
  merchantSaveExperienceCopyCommandV2,
  merchantSaveExperienceThemeCommandV1,
  merchantSaveExperienceThemeCommandV2,
  publicLoyaltyExperienceV1,
  publicLoyaltyExperienceV2,
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

const themeV2 = {
  ...theme,
  version: "2" as const,
  density: "comfortable" as const,
  heroAsset: "sparkles" as const,
  showReferrals: true,
  sectionOrder: [...canonicalExperienceSectionOrderV2],
};

const copyV2 = {
  version: "2" as const,
  locale: "en" as const,
  heroText: "Beauty that gives back",
  pointsLabel: "Points",
  balanceLabel: "Your balance",
  rewardsLabel: "Your rewards",
  redeemLabel: "Redeem",
  joinLabel: "Join free",
  earnMessage: "Earn points on every eligible order.",
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

  it("accepts a strict controlled V2 presentation without weakening V1", () => {
    expect(experienceThemeDefinitionV2.parse(themeV2)).toEqual(themeV2);
    expect(experienceCopyDefinitionV2.parse(copyV2)).toEqual(copyV2);
    expect(experienceThemeDefinitionV1.safeParse(themeV2).success).toBe(false);
    expect(
      merchantSaveExperienceThemeCommandV2.safeParse({
        version: "2",
        workspaceId: "a1000000-0000-4000-8000-000000000001",
        programmeGroupId: "a1000000-0000-4000-8000-000000000002",
        theme: themeV2,
        idempotencyKey: "experience:save:v2:one",
        correlationId: "a1000000-0000-4000-8000-000000000003",
      }).success,
    ).toBe(true);
  });

  it("requires every known section exactly once and controlled assets only", () => {
    expect(
      experienceThemeDefinitionV2.safeParse({
        ...themeV2,
        sectionOrder: [
          "overview",
          "earning",
          "rewards",
          "vip",
          "referrals",
          "history",
          "history",
        ],
      }).success,
    ).toBe(false);
    expect(
      experienceThemeDefinitionV2.safeParse({
        ...themeV2,
        sectionOrder: themeV2.sectionOrder.slice(0, -1),
      }).success,
    ).toBe(false);
    expect(
      experienceThemeDefinitionV2.safeParse({
        ...themeV2,
        heroAsset: "https://tracking.invalid/hero.svg",
      }).success,
    ).toBe(false);
    expect(
      experienceThemeDefinitionV2.safeParse({
        ...themeV2,
        density: "merchant-css",
      }).success,
    ).toBe(false);
    expect(
      experienceThemeDefinitionV2.safeParse({
        ...themeV2,
        heroText: "<script>not presentation copy</script>",
      }).success,
    ).toBe(false);
  });

  it("keeps V2 customer copy English-only", () => {
    expect(
      experienceCopyDefinitionV2.safeParse({ ...copyV2, locale: "sl-SI" })
        .success,
    ).toBe(false);
    expect(
      merchantSaveExperienceCopyCommandV2.safeParse({
        version: "2",
        workspaceId: "a1000000-0000-4000-8000-000000000001",
        programmeGroupId: "a1000000-0000-4000-8000-000000000002",
        copy: copyV2,
        idempotencyKey: "experience:copy:v2:one",
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

  it("accepts a bounded minimized public loyalty document", () => {
    expect(
      publicLoyaltyExperienceV1.safeParse({
        version: "1",
        workspaceId: "a1000000-0000-4000-8000-000000000001",
        programmeId: "a1000000-0000-4000-8000-000000000002",
        programmeGroupId: "a1000000-0000-4000-8000-000000000003",
        programmeName: "Rosy Rewards",
        requestedLocale: "sl-SI",
        resolvedLocale: "sl-SI",
        brandColor: "#7c2d4f",
        displayFont: "editorial-serif",
        cardRadiusPx: 14,
        showTier: true,
        showRewards: true,
        copy: {
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
        tiers: [
          {
            code: "rose",
            name: "Rose",
            minimumEligibleSpendMinor: "0",
            pointsPerMajorUnit: "5",
          },
        ],
        rewards: [
          {
            code: "five-off",
            name: "€5 discount",
            kind: "fixed_discount",
            costPoints: "500",
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("accepts a minimized English V2 public document with nested presentation", () => {
    const value = {
      version: "2" as const,
      workspaceId: "a1000000-0000-4000-8000-000000000001",
      programmeId: "a1000000-0000-4000-8000-000000000002",
      programmeGroupId: "a1000000-0000-4000-8000-000000000003",
      programmeName: "Rosy Rewards",
      requestedLocale: "en" as const,
      resolvedLocale: "en" as const,
      presentation: { version: "2" as const, theme: themeV2, copy: copyV2 },
      tiers: [
        {
          code: "rose",
          name: "Rose",
          minimumEligibleSpendMinor: "0",
          pointsPerMajorUnit: "5",
        },
      ],
      rewards: [
        {
          code: "five-off",
          name: "€5 discount",
          kind: "fixed_discount" as const,
          costPoints: "500",
        },
      ],
    };

    expect(publicLoyaltyExperienceV2.parse(value)).toEqual(value);
    expect(publicLoyaltyExperienceV1.safeParse(value).success).toBe(false);
    expect(
      publicLoyaltyExperienceV2.safeParse({
        ...value,
        brandColor: "#000000",
      }).success,
    ).toBe(false);
  });
});
