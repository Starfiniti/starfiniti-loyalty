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
  publicLoyaltyExperienceV3,
  publicLoyaltyExperienceV4,
  publicLoyaltyExperienceV5,
  publicLoyaltyExperienceV6,
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

function publicV5Value() {
  return {
    version: "5" as const,
    workspaceId: "a1000000-0000-4000-8000-000000000001",
    programmeId: "a1000000-0000-4000-8000-000000000002",
    programmeGroupId: "a1000000-0000-4000-8000-000000000003",
    programmeName: "Rosy Rewards",
    requestedLocale: "en" as const,
    resolvedLocale: "en" as const,
    presentation: { version: "2" as const, theme: themeV2, copy: copyV2 },
    tiers: [],
    vipCatalogue: {
      version: "1" as const,
      qualificationPeriod: { kind: "lifetime" as const },
      downgradeGraceDays: 0,
      levels: [],
    },
    earningMethods: [],
    rewardCatalogue: {
      version: "1" as const,
      offers: [
        {
          code: "reward-1",
          name: "Five euro reward",
          costPoints: "500",
          benefit: { kind: "fixed_discount" as const, amountMinor: "500" },
          currency: { code: "EUR", minorUnitDigits: 2 },
          delivery: "woocommerce_coupon" as const,
          validityDays: 30,
          deliveryEstimateDays: null,
          state: "available" as const,
          startsAt: null,
          endsAt: "2027-12-31T23:59:59.000Z",
          conditions: {
            minimumSpendMinor: "2000",
            requiredTierNames: ["Bloom"],
            hasProductOrCategoryRestrictions: true,
            excludesSaleItems: true,
            hasMemberLimit: true,
            limitedAvailability: true,
            stacking: "exclusive" as const,
          },
        },
      ],
    },
  };
}

function publicV6Value() {
  return {
    ...publicV5Value(),
    version: "6" as const,
    programmeCurrency: { code: "EUR", minorUnitDigits: 2 },
    referralCatalogue: {
      version: "1" as const,
      state: "available" as const,
      advocateRewardPoints: "500",
      friendRewardPoints: "250",
      minimumEligibleSpendMinor: "3000",
      currency: { code: "EUR", minorUnitDigits: 2 },
      attributionWindowDays: 30,
      coolingDays: 14,
      qualification: "first_eligible_purchase" as const,
      newCustomersOnly: true as const,
      monthlyLimitApplies: true as const,
    },
  };
}

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

  it("accepts an exact guest-safe V3 VIP catalogue", () => {
    const tiers = [
      {
        code: "rose",
        name: "Rose",
        minimumEligibleSpendMinor: "0",
        pointsPerMajorUnit: "5",
      },
      {
        code: "bloom",
        name: "Bloom",
        minimumEligibleSpendMinor: "15000",
        pointsPerMajorUnit: "6",
      },
    ];
    const value = {
      version: "3" as const,
      workspaceId: "a1000000-0000-4000-8000-000000000001",
      programmeId: "a1000000-0000-4000-8000-000000000002",
      programmeGroupId: "a1000000-0000-4000-8000-000000000003",
      programmeName: "Rosy Rewards",
      requestedLocale: "en" as const,
      resolvedLocale: "en" as const,
      presentation: { version: "2" as const, theme: themeV2, copy: copyV2 },
      tiers,
      rewards: [],
      vipCatalogue: {
        version: "1" as const,
        qualificationPeriod: { kind: "rolling_days" as const, days: 365 },
        downgradeGraceDays: 30,
        levels: [
          {
            code: "rose",
            name: "Rose",
            entry: null,
            pointsPerMajorUnit: "5",
            earlyAccess: false,
            exclusiveRewardAccess: false,
          },
          {
            code: "bloom",
            name: "Bloom",
            entry: {
              operator: "any" as const,
              thresholds: [
                { metric: "eligible_spend" as const, minimum: "15000" },
                { metric: "order_count" as const, minimum: "5" },
              ],
            },
            pointsPerMajorUnit: "6",
            earlyAccess: true,
            exclusiveRewardAccess: true,
          },
        ],
      },
    };

    expect(publicLoyaltyExperienceV3.parse(value)).toEqual(value);
    expect(publicLoyaltyExperienceV2.safeParse(value).success).toBe(false);
  });

  it("rejects misleading or expanded-authority public VIP catalogues", () => {
    const tier = {
      code: "rose",
      name: "Rose",
      minimumEligibleSpendMinor: "0",
      pointsPerMajorUnit: "5",
    };
    const base = {
      version: "3" as const,
      workspaceId: "a1000000-0000-4000-8000-000000000001",
      programmeId: "a1000000-0000-4000-8000-000000000002",
      programmeGroupId: "a1000000-0000-4000-8000-000000000003",
      programmeName: "Rosy Rewards",
      requestedLocale: "en" as const,
      resolvedLocale: "en" as const,
      presentation: { version: "2" as const, theme: themeV2, copy: copyV2 },
      tiers: [tier],
      rewards: [],
      vipCatalogue: {
        version: "1" as const,
        qualificationPeriod: { kind: "lifetime" as const },
        downgradeGraceDays: 0,
        levels: [
          {
            code: "rose",
            name: "Rose",
            entry: null,
            pointsPerMajorUnit: "5",
            earlyAccess: false,
            exclusiveRewardAccess: false,
          },
        ],
      },
    };

    expect(
      publicLoyaltyExperienceV3.safeParse({
        ...base,
        vipCatalogue: {
          ...base.vipCatalogue,
          levels: [
            {
              ...base.vipCatalogue.levels[0],
              code: "forged",
              internalProgrammeVersionId: "42",
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      publicLoyaltyExperienceV3.safeParse({
        ...base,
        tiers: [
          {
            ...tier,
            minimumEligibleSpendMinor: "9223372036854775808",
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      publicLoyaltyExperienceV3.safeParse({
        ...base,
        rewards: [
          {
            code: "oversized",
            name: "Oversized",
            kind: "fixed_discount",
            costPoints: "9".repeat(100_000),
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      publicLoyaltyExperienceV3.safeParse({
        ...base,
        vipCatalogue: {
          ...base.vipCatalogue,
          levels: [
            {
              ...base.vipCatalogue.levels[0],
              entry: {
                operator: "all",
                thresholds: [{ metric: "eligible_spend", minimum: "0" }],
              },
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      publicLoyaltyExperienceV3.safeParse({
        ...base,
        tiers: [tier, { ...tier, code: "bloom", name: "Bloom" }],
        vipCatalogue: {
          ...base.vipCatalogue,
          levels: [
            base.vipCatalogue.levels[0],
            {
              ...base.vipCatalogue.levels[0],
              code: "bloom",
              name: "Bloom",
              entry: {
                operator: "all",
                thresholds: [
                  {
                    metric: "earned_points",
                    minimum: "9223372036854775808",
                  },
                ],
              },
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("accepts an exact guest-safe V4 earning catalogue", () => {
    const tier = {
      code: "rose",
      name: "Rose",
      minimumEligibleSpendMinor: "0",
      pointsPerMajorUnit: "5",
    };
    const value = {
      version: "4" as const,
      workspaceId: "a1000000-0000-4000-8000-000000000001",
      programmeId: "a1000000-0000-4000-8000-000000000002",
      programmeGroupId: "a1000000-0000-4000-8000-000000000003",
      programmeName: "Rosy Rewards",
      requestedLocale: "en" as const,
      resolvedLocale: "en" as const,
      presentation: { version: "2" as const, theme: themeV2, copy: copyV2 },
      tiers: [tier],
      rewards: [],
      vipCatalogue: {
        version: "1" as const,
        qualificationPeriod: { kind: "lifetime" as const },
        downgradeGraceDays: 0,
        levels: [
          {
            code: "rose",
            name: "Rose",
            entry: null,
            pointsPerMajorUnit: "5",
            earlyAccess: false,
            exclusiveRewardAccess: false,
          },
        ],
      },
      earningMethods: [
        {
          code: "purchase-base",
          name: "Eligible purchases",
          source: "purchase" as const,
          effect: {
            kind: "base_rate" as const,
            pointsPerMajorUnit: "5",
          },
          hasRestrictions: true,
          startsAt: null,
          endsAt: null,
          availableNow: true,
        },
        {
          code: "birthday-bonus",
          name: "Birthday bonus",
          source: "birthday" as const,
          effect: { kind: "fixed_bonus" as const, points: "250" },
          hasRestrictions: false,
          startsAt: "2026-01-01T00:00:00.000Z",
          endsAt: "2027-01-01T00:00:00.000Z",
          availableNow: true,
        },
        {
          code: "purchase-multiplier",
          name: "Purchase multiplier",
          source: "purchase" as const,
          effect: {
            kind: "multiplier" as const,
            multiplierBasisPoints: 15_000,
          },
          hasRestrictions: true,
          startsAt: null,
          endsAt: null,
          availableNow: true,
        },
      ],
    };

    expect(publicLoyaltyExperienceV4.parse(value)).toEqual(value);
    expect(publicLoyaltyExperienceV3.safeParse(value).success).toBe(false);
  });

  it("rejects private, contradictory, duplicate, and oversized V4 earning data", () => {
    const base = publicLoyaltyExperienceV4.parse({
      version: "4",
      workspaceId: "a1000000-0000-4000-8000-000000000001",
      programmeId: "a1000000-0000-4000-8000-000000000002",
      programmeGroupId: "a1000000-0000-4000-8000-000000000003",
      programmeName: "Rosy Rewards",
      requestedLocale: "en",
      resolvedLocale: "en",
      presentation: { version: "2", theme: themeV2, copy: copyV2 },
      tiers: [],
      rewards: [],
      vipCatalogue: {
        version: "1",
        qualificationPeriod: { kind: "lifetime" },
        downgradeGraceDays: 0,
        levels: [],
      },
      earningMethods: [],
    });
    const method = {
      code: "birthday",
      name: "Birthday bonus",
      source: "birthday" as const,
      effect: { kind: "fixed_bonus" as const, points: "250" },
      hasRestrictions: false,
      startsAt: null,
      endsAt: null,
      availableNow: true,
    };

    expect(
      publicLoyaltyExperienceV4.safeParse({
        ...base,
        earningMethods: [{ ...method, source: "custom_activity" }],
      }).success,
    ).toBe(false);
    expect(
      publicLoyaltyExperienceV4.safeParse({
        ...base,
        earningMethods: [{ ...method, name: "Internal high-value segment" }],
      }).success,
    ).toBe(false);
    expect(
      publicLoyaltyExperienceV4.safeParse({
        ...base,
        earningMethods: [
          { ...method, effect: { kind: "base_rate", pointsPerMajorUnit: "5" } },
        ],
      }).success,
    ).toBe(false);
    expect(
      publicLoyaltyExperienceV4.safeParse({
        ...base,
        earningMethods: [method, method],
      }).success,
    ).toBe(false);
    expect(
      publicLoyaltyExperienceV4.safeParse({
        ...base,
        earningMethods: [
          {
            ...method,
            effect: { kind: "fixed_bonus", points: "9".repeat(100_000) },
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      publicLoyaltyExperienceV4.safeParse({
        ...base,
        earningMethods: [
          {
            ...method,
            startsAt: "2027-01-01T00:00:00.000Z",
            endsAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("accepts an exact guest-safe V5 reward catalogue without legacy reward rows", () => {
    const value = publicV5Value();

    expect(publicLoyaltyExperienceV5.parse(value)).toEqual(value);
    expect(publicLoyaltyExperienceV4.safeParse(value).success).toBe(false);
    expect("rewards" in value).toBe(false);
  });

  it("rejects private, contradictory, duplicate, and oversized V5 reward data", () => {
    const base = publicV5Value();
    const offer = base.rewardCatalogue.offers[0];

    expect(
      publicLoyaltyExperienceV5.safeParse({
        ...base,
        rewardCatalogue: {
          ...base.rewardCatalogue,
          offers: [{ ...offer, internalRewardId: "42" }],
        },
      }).success,
    ).toBe(false);
    expect(
      publicLoyaltyExperienceV5.safeParse({
        ...base,
        rewardCatalogue: {
          ...base.rewardCatalogue,
          offers: [{ ...offer, delivery: "unknown" }],
        },
      }).success,
    ).toBe(false);
    expect(
      publicLoyaltyExperienceV5.safeParse({
        ...base,
        rewardCatalogue: {
          ...base.rewardCatalogue,
          offers: [offer, offer],
        },
      }).success,
    ).toBe(false);
    expect(
      publicLoyaltyExperienceV5.safeParse({
        ...base,
        rewardCatalogue: {
          ...base.rewardCatalogue,
          offers: [{ ...offer, delivery: "manual" }],
        },
      }).success,
    ).toBe(false);
    expect(
      publicLoyaltyExperienceV5.safeParse({
        ...base,
        rewardCatalogue: {
          ...base.rewardCatalogue,
          offers: [{ ...offer, currency: null }],
        },
      }).success,
    ).toBe(false);
    expect(
      publicLoyaltyExperienceV5.safeParse({
        ...base,
        rewardCatalogue: {
          ...base.rewardCatalogue,
          offers: [
            {
              ...offer,
              state: "confirm_in_account",
              startsAt: "2027-01-01T00:00:00.000Z",
              endsAt: null,
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      publicLoyaltyExperienceV5.safeParse({
        ...base,
        rewardCatalogue: {
          ...base.rewardCatalogue,
          offers: [
            {
              ...offer,
              costPoints: "9223372036854775808",
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      publicLoyaltyExperienceV5.safeParse({
        ...base,
        rewardCatalogue: {
          ...base.rewardCatalogue,
          offers: [
            {
              ...offer,
              benefit: { kind: "store_credit", amountMinor: "500" },
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("accepts an exact guest-safe V6 referral catalogue", () => {
    const value = publicV6Value();

    expect(publicLoyaltyExperienceV6.parse(value)).toEqual(value);
    expect(publicLoyaltyExperienceV5.safeParse(value).success).toBe(false);
  });

  it("requires a strict programme currency or an explicit legacy fallback", () => {
    const value = publicV6Value();

    expect(
      publicLoyaltyExperienceV6.safeParse({
        ...value,
        programmeCurrency: { code: "JPY", minorUnitDigits: 0 },
      }).success,
    ).toBe(true);
    expect(
      publicLoyaltyExperienceV6.safeParse({
        ...value,
        programmeCurrency: null,
      }).success,
    ).toBe(true);
    expect(
      publicLoyaltyExperienceV6.safeParse({
        ...value,
        programmeCurrency: { code: "usd", minorUnitDigits: 2 },
      }).success,
    ).toBe(false);
    expect(
      publicLoyaltyExperienceV6.safeParse({
        ...value,
        programmeCurrency: { code: "USD", minorUnitDigits: 7 },
      }).success,
    ).toBe(false);
  });

  it("accepts honest non-active V6 referral states without policy details", () => {
    for (const state of [
      "unavailable",
      "paused",
      "confirm_in_account",
    ] as const) {
      expect(
        publicLoyaltyExperienceV6.safeParse({
          ...publicV6Value(),
          referralCatalogue: { version: "1", state },
        }).success,
      ).toBe(true);
    }
  });

  it("rejects private, contradictory, and oversized V6 referral data", () => {
    const base = publicV6Value();
    const referral = base.referralCatalogue;

    expect(
      publicLoyaltyExperienceV6.safeParse({
        ...base,
        referralCatalogue: { ...referral, advocateCode: "private" },
      }).success,
    ).toBe(false);
    expect(
      publicLoyaltyExperienceV6.safeParse({
        ...base,
        referralCatalogue: {
          version: "1",
          state: "paused",
          advocateRewardPoints: "500",
        },
      }).success,
    ).toBe(false);
    expect(
      publicLoyaltyExperienceV6.safeParse({
        ...base,
        referralCatalogue: {
          ...referral,
          advocateRewardPoints: "9223372036854775808",
        },
      }).success,
    ).toBe(false);
    expect(
      publicLoyaltyExperienceV6.safeParse({
        ...base,
        referralCatalogue: {
          ...referral,
          minimumEligibleSpendMinor: "-1",
        },
      }).success,
    ).toBe(false);
    expect(
      publicLoyaltyExperienceV6.safeParse({
        ...base,
        referralCatalogue: {
          ...referral,
          attributionWindowDays: 91,
        },
      }).success,
    ).toBe(false);
    expect(
      publicLoyaltyExperienceV6.safeParse({
        ...base,
        referralCatalogue: {
          ...referral,
          newCustomersOnly: false,
        },
      }).success,
    ).toBe(false);
  });
});
