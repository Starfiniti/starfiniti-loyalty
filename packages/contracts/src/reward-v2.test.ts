import { describe, expect, it } from "vitest";
import { programmeRewardDefinitionV2, rewardAvailabilityV2 } from "./reward-v2";

const availability = {
  startsAt: null,
  endsAt: null,
  tierCodes: [],
  segmentCodes: [],
  perCustomerLimit: 2,
  globalQuantity: "100",
  pointsBudget: "50000",
};

const restrictions = {
  minimumSpendMinor: "2500",
  productIds: ["42"],
  excludedProductIds: [],
  categoryIds: [],
  excludedCategoryIds: ["9"],
  excludeSaleItems: true,
  stacking: "combinable" as const,
};

describe("ProgrammeRewardDefinitionV2", () => {
  it("accepts a bounded WooCommerce-native reward", () => {
    const result = programmeRewardDefinitionV2.parse({
      code: "ten-off",
      name: "Ten euro off",
      kind: "fixed_discount",
      costPoints: "1000",
      configuration: {
        version: "2",
        fulfilmentMode: "woocommerce_coupon",
        validityDays: 30,
        amountMinor: "1000",
        currencyMinorUnitDigits: 2,
        availability,
        restrictions,
      },
    });

    expect(result).toMatchObject({
      configuration: {
        availability: { globalQuantity: "100" },
        restrictions: { stacking: "combinable" },
      },
    });
  });

  it("models a product-specific free product without ambiguous selectors", () => {
    const result = programmeRewardDefinitionV2.parse({
      code: "free-mug",
      name: "Free mug",
      kind: "free_product",
      costPoints: "800",
      configuration: {
        version: "2",
        fulfilmentMode: "woocommerce_coupon",
        validityDays: 14,
        productId: "42",
        quantity: 1,
        availability,
        restrictions: {
          ...restrictions,
          productIds: [],
          excludedCategoryIds: [],
        },
      },
    });

    expect(result).toMatchObject({ configuration: { productId: "42" } });
  });

  it("accepts an audited manual custom perk contract", () => {
    expect(
      programmeRewardDefinitionV2.safeParse({
        code: "studio-tour",
        name: "Private studio tour",
        kind: "custom",
        costPoints: "5000",
        configuration: {
          version: "2",
          fulfilmentMode: "manual",
          availability,
          fulfilmentInstructions: "Contact the member and arrange one visit.",
          fulfilmentSlaDays: 5,
        },
      }).success,
    ).toBe(true);
  });

  it("rejects overlapping selectors and impossible budgets", () => {
    const result = programmeRewardDefinitionV2.safeParse({
      code: "bad",
      name: "Bad reward",
      kind: "fixed_discount",
      costPoints: "1000",
      configuration: {
        version: "2",
        fulfilmentMode: "woocommerce_coupon",
        validityDays: 30,
        amountMinor: "500",
        currencyMinorUnitDigits: 2,
        availability: { ...availability, pointsBudget: "999" },
        restrictions: {
          ...restrictions,
          excludedProductIds: ["42"],
        },
      },
    });

    expect(result.success).toBe(false);
  });

  it("keeps maximum-capped percentage discounts impossible", () => {
    const result = programmeRewardDefinitionV2.safeParse({
      code: "capped",
      name: "Capped percentage",
      kind: "percentage_discount",
      costPoints: "1000",
      configuration: {
        version: "2",
        fulfilmentMode: "woocommerce_coupon",
        validityDays: 30,
        percentageBasisPoints: 1000,
        maximumDiscountMinor: "2500",
        currencyMinorUnitDigits: 2,
        availability,
        restrictions,
      },
    });

    expect(result.success).toBe(false);
  });

  it("keeps segment availability fail-closed until audiences are authoritative", () => {
    const result = programmeRewardDefinitionV2.safeParse({
      code: "vip-preview",
      name: "Audience-only preview",
      kind: "custom",
      costPoints: "1000",
      configuration: {
        version: "2",
        fulfilmentMode: "manual",
        availability: { ...availability, segmentCodes: ["high-value"] },
        fulfilmentInstructions: "Review eligibility before delivery.",
        fulfilmentSlaDays: 5,
      },
    });

    expect(result.success).toBe(false);
  });
});

describe("RewardAvailabilityV2 time ordering", () => {
  it("compares offset timestamps by instant", () => {
    expect(
      rewardAvailabilityV2.safeParse({
        ...availability,
        startsAt: "2026-01-01T10:00:00+02:00",
        endsAt: "2026-01-01T09:30:00Z",
      }).success,
    ).toBe(true);
  });

  it("rejects a lexically later end that is chronologically earlier", () => {
    const result = rewardAvailabilityV2.safeParse({
      ...availability,
      startsAt: "2026-01-01T09:00:00Z",
      endsAt: "2026-01-01T10:00:00+02:00",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({ path: ["endsAt"] }),
      );
    }
  });
});
