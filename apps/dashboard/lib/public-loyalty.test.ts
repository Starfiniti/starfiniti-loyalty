import { describe, expect, it } from "vitest";
import {
  formatEurMinor,
  formatPublicPoints,
  formatPublicEarningEffect,
  formatPublicEarningSource,
  formatPublicEarningWindow,
  formatPublicMoneyMinor,
  formatPublicRewardBenefit,
  formatPublicRewardDelivery,
  formatPublicRewardWindow,
  formatPublicVipPeriod,
  formatPublicVipThreshold,
  isPublicId,
  PUBLIC_LOYALTY_ACCOUNT_PATH,
  publicRewardConditionLabels,
  resolvePublicLocale,
} from "./public-loyalty";

const publicReward = {
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
  endsAt: null,
  conditions: {
    minimumSpendMinor: "2000",
    requiredTierNames: ["Bloom"],
    hasProductOrCategoryRestrictions: true,
    excludesSaleItems: true,
    hasMemberLimit: true,
    limitedAvailability: true,
    stacking: "exclusive" as const,
  },
};

describe("public loyalty presentation", () => {
  it("uses English for every locale selector", () => {
    expect(resolvePublicLocale("sl-SI")).toBe("en");
    expect(resolvePublicLocale("en")).toBe("en");
    expect(resolvePublicLocale(["sl-SI"])).toBe("en");
    expect(resolvePublicLocale("../../private")).toBe("en");
  });

  it("rejects malformed route identifiers before entering PostgreSQL", () => {
    expect(isPublicId("a1000000-0000-4000-8000-000000000001")).toBe(true);
    expect(isPublicId("../../private")).toBe(false);
    expect(isPublicId("00000000-0000-0000-0000-000000000000")).toBe(false);
  });

  it("formats exact bigint point and EUR values without number coercion", () => {
    expect(formatPublicPoints("9007199254740993", "en")).toBe(
      "9,007,199,254,740,993",
    );
    expect(formatEurMinor("15000", "en")).toBe("€150");
    expect(formatEurMinor("15025", "en")).toBe("€150.25");
  });

  it("routes guests to the canonical same-origin loyalty sign-in", () => {
    expect(PUBLIC_LOYALTY_ACCOUNT_PATH).toBe(
      "/login?next=%2Faccount%2Floyalty",
    );
    expect(PUBLIC_LOYALTY_ACCOUNT_PATH).not.toMatch(/^https?:/u);
    expect(PUBLIC_LOYALTY_ACCOUNT_PATH).not.toContain("lang=");
  });

  it("formats every public VIP qualification without number coercion", () => {
    expect(
      formatPublicVipThreshold(
        { metric: "eligible_spend", minimum: "15025" },
        "en",
      ),
    ).toBe("Spend €150.25");
    expect(
      formatPublicVipThreshold(
        { metric: "earned_points", minimum: "9007199254740993" },
        "en",
      ),
    ).toBe("Earn 9,007,199,254,740,993 points");
    expect(
      formatPublicVipThreshold({ metric: "order_count", minimum: "1" }, "en"),
    ).toBe("Place 1 order");
    expect(
      formatPublicVipThreshold(
        { metric: "referral_count", minimum: "2" },
        "en",
      ),
    ).toBe("Refer 2 friends");
    expect(
      formatPublicVipThreshold(
        { metric: "verified_action_count", minimum: "3" },
        "en",
      ),
    ).toBe("Complete 3 qualifying activities");
  });

  it("explains each bounded VIP qualification window", () => {
    expect(formatPublicVipPeriod({ kind: "lifetime" })).toBe(
      "Lifetime activity",
    );
    expect(formatPublicVipPeriod({ kind: "rolling_days", days: 1 })).toBe(
      "Your latest 1 day",
    );
    expect(
      formatPublicVipPeriod({
        kind: "calendar_year",
        timeZone: "Europe/Ljubljana",
      }),
    ).toBe("Calendar year · Europe/Ljubljana");
  });

  it("formats public earning sources and exact integer effects", () => {
    expect(formatPublicEarningSource("purchase")).toBe("Shopping");
    expect(formatPublicEarningSource("account_created")).toBe("Membership");
    expect(formatPublicEarningSource("birthday")).toBe("Birthday");
    expect(formatPublicEarningSource("verified_product_review")).toBe(
      "Verified review",
    );
    expect(formatPublicEarningSource("referral")).toBe("Referral");
    expect(
      formatPublicEarningEffect(
        { kind: "base_rate", pointsPerMajorUnit: "5" },
        "en",
      ),
    ).toBe("5 points / €1");
    expect(
      formatPublicEarningEffect(
        { kind: "multiplier", multiplierBasisPoints: 15_625 },
        "en",
      ),
    ).toBe("1.5625× points");
    expect(
      formatPublicEarningEffect(
        { kind: "fixed_bonus", points: "9007199254740993" },
        "en",
      ),
    ).toBe("9,007,199,254,740,993 bonus points");
  });

  it("explains current and scheduled earning windows in UTC", () => {
    const base = {
      code: "birthday",
      name: "Birthday bonus",
      source: "birthday" as const,
      effect: { kind: "fixed_bonus" as const, points: "250" },
      hasRestrictions: false,
      startsAt: null,
      endsAt: null,
      availableNow: true,
    };
    expect(formatPublicEarningWindow(base, "en")).toBe("Available now");
    expect(
      formatPublicEarningWindow(
        {
          ...base,
          availableNow: false,
          startsAt: "2027-02-03T10:00:00.000Z",
        },
        "en",
      ),
    ).toBe("Available from Feb 3, 2027");
    expect(
      formatPublicEarningWindow(
        { ...base, endsAt: "2027-02-03T10:00:00.000Z" },
        "en",
      ),
    ).toBe("Available until Feb 3, 2027");
  });

  it("formats exact reward money and percentages without number coercion", () => {
    expect(
      formatPublicMoneyMinor(
        "900719925474099312345",
        { code: "EUR", minorUnitDigits: 2 },
        "en",
      ),
    ).toBe("€9,007,199,254,740,993,123.45");
    expect(formatPublicRewardBenefit(publicReward, "en")).toBe("€5 off");
    expect(
      formatPublicRewardBenefit(
        {
          ...publicReward,
          benefit: {
            kind: "percentage_discount",
            percentageBasisPoints: 1_250,
          },
        },
        "en",
      ),
    ).toBe("12.5% off");
    expect(
      formatPublicRewardBenefit(
        {
          ...publicReward,
          benefit: { kind: "free_product", quantity: 2 },
        },
        "en",
      ),
    ).toBe("2 free products");
  });

  it("explains exact reward windows and summarized public conditions", () => {
    expect(formatPublicRewardWindow(publicReward, "en")).toBe("Available now");
    expect(
      formatPublicRewardWindow(
        {
          ...publicReward,
          state: "scheduled",
          startsAt: "2027-02-03T10:00:00.000Z",
        },
        "en",
      ),
    ).toBe("Available from Feb 3, 2027");
    expect(
      formatPublicRewardWindow(
        { ...publicReward, state: "confirm_in_account" },
        "en",
      ),
    ).toBe("Confirm terms in your account");
    expect(publicRewardConditionLabels(publicReward, "en")).toEqual([
      "€20 minimum spend",
      "Bloom tier",
      "Selected products",
      "Excludes sale items",
      "Member limit",
      "Limited availability",
      "Used on its own",
    ]);
    expect(formatPublicRewardDelivery(publicReward)).toBe(
      "WooCommerce reward · 30 days after claim",
    );
    expect(
      formatPublicRewardDelivery({
        ...publicReward,
        benefit: { kind: "custom" },
        delivery: "manual",
        validityDays: null,
        deliveryEstimateDays: 1,
      }),
    ).toBe("Delivered by the store within 1 day");
  });
});
