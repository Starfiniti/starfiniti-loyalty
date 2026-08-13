import { z } from "zod";

const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;
const code = z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/u);
const wooCommerceObjectId = z.string().regex(/^[1-9][0-9]{0,19}$/u);
const selector = wooCommerceObjectId;
const selectorList = z.array(selector).max(100).default([]);
const codeList = z.array(code).max(100).default([]);
const timestamp = z.iso.datetime({ offset: true });
const nonNegativeBigintString = z
  .string()
  .regex(/^(?:0|[1-9][0-9]*)$/u)
  .refine((value) => BigInt(value) <= POSTGRES_BIGINT_MAX, {
    message: "Value exceeds PostgreSQL bigint capacity",
  });
const positiveBigintString = z
  .string()
  .regex(/^[1-9][0-9]*$/u)
  .refine((value) => BigInt(value) <= POSTGRES_BIGINT_MAX, {
    message: "Value exceeds PostgreSQL bigint capacity",
  });

export const rewardAvailabilityV2 = z
  .object({
    startsAt: timestamp.nullable().default(null),
    endsAt: timestamp.nullable().default(null),
    tierCodes: codeList,
    segmentCodes: z.array(code).length(0).default([]),
    perCustomerLimit: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .nullable()
      .default(null),
    globalQuantity: positiveBigintString.nullable().default(null),
    pointsBudget: positiveBigintString.nullable().default(null),
  })
  .strict()
  .superRefine((availability, context) => {
    if (
      availability.startsAt !== null &&
      availability.endsAt !== null &&
      availability.startsAt >= availability.endsAt
    ) {
      context.addIssue({
        code: "custom",
        message: "Reward availability end must follow its start",
        path: ["endsAt"],
      });
    }
  });

export const wooCommerceCouponRestrictionsV2 = z
  .object({
    minimumSpendMinor: nonNegativeBigintString.nullable().default(null),
    productIds: selectorList,
    excludedProductIds: selectorList,
    categoryIds: selectorList,
    excludedCategoryIds: selectorList,
    excludeSaleItems: z.boolean().default(false),
    stacking: z.enum(["exclusive", "combinable"]).default("exclusive"),
  })
  .strict()
  .superRefine((restrictions, context) => {
    for (const [includedField, excludedField] of [
      ["productIds", "excludedProductIds"],
      ["categoryIds", "excludedCategoryIds"],
    ] as const) {
      const excluded = new Set(restrictions[excludedField]);
      restrictions[includedField].forEach((value, index) => {
        if (excluded.has(value)) {
          context.addIssue({
            code: "custom",
            message: "A selector cannot be both included and excluded",
            path: [includedField, index],
          });
        }
      });
    }
  });

const rewardShape = {
  code,
  name: z.string().trim().min(1).max(200),
  costPoints: positiveBigintString,
};

const nativeConfigurationShape = {
  version: z.literal("2"),
  fulfilmentMode: z.literal("woocommerce_coupon"),
  validityDays: z.number().int().min(1).max(365),
  availability: rewardAvailabilityV2,
  restrictions: wooCommerceCouponRestrictionsV2,
};

const fixedDiscountRewardV2 = z
  .object({
    ...rewardShape,
    kind: z.literal("fixed_discount"),
    configuration: z
      .object({
        ...nativeConfigurationShape,
        amountMinor: positiveBigintString,
        currencyMinorUnitDigits: z.number().int().min(0).max(6),
      })
      .strict(),
  })
  .strict();

const percentageDiscountRewardV2 = z
  .object({
    ...rewardShape,
    kind: z.literal("percentage_discount"),
    configuration: z
      .object({
        ...nativeConfigurationShape,
        percentageBasisPoints: z.number().int().min(1).max(10_000),
        maximumDiscountMinor: z.null(),
        currencyMinorUnitDigits: z.number().int().min(0).max(6),
      })
      .strict(),
  })
  .strict();

const freeShippingRewardV2 = z
  .object({
    ...rewardShape,
    kind: z.literal("free_shipping"),
    configuration: z.object(nativeConfigurationShape).strict(),
  })
  .strict();

const freeProductRewardV2 = z
  .object({
    ...rewardShape,
    kind: z.literal("free_product"),
    configuration: z
      .object({
        ...nativeConfigurationShape,
        productId: selector,
        quantity: z.number().int().min(1).max(10),
      })
      .strict(),
  })
  .strict()
  .superRefine((reward, context) => {
    const restrictions = reward.configuration.restrictions;
    if (
      restrictions.productIds.length > 0 ||
      restrictions.excludedProductIds.length > 0 ||
      restrictions.categoryIds.length > 0 ||
      restrictions.excludedCategoryIds.length > 0
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Free-product selection is defined only by productId; additional product/category selectors are unsupported",
        path: ["configuration", "restrictions"],
      });
    }
  });

const manualConfiguration = z
  .object({
    version: z.literal("2"),
    fulfilmentMode: z.literal("manual"),
    availability: rewardAvailabilityV2,
    fulfilmentInstructions: z.string().trim().min(1).max(2000),
    fulfilmentSlaDays: z.number().int().min(1).max(90),
  })
  .strict();

const exclusiveAccessRewardV2 = z
  .object({
    ...rewardShape,
    kind: z.literal("exclusive_access"),
    configuration: manualConfiguration,
  })
  .strict();

const customPerkRewardV2 = z
  .object({
    ...rewardShape,
    kind: z.literal("custom"),
    configuration: manualConfiguration,
  })
  .strict();

export const programmeRewardDefinitionV2 = z
  .discriminatedUnion("kind", [
    fixedDiscountRewardV2,
    percentageDiscountRewardV2,
    freeShippingRewardV2,
    freeProductRewardV2,
    exclusiveAccessRewardV2,
    customPerkRewardV2,
  ])
  .superRefine((reward, context) => {
    const budget = reward.configuration.availability.pointsBudget;
    if (budget !== null && BigInt(budget) < BigInt(reward.costPoints)) {
      context.addIssue({
        code: "custom",
        message: "Reward points budget cannot be lower than one redemption",
        path: ["configuration", "availability", "pointsBudget"],
      });
    }
  });

export type RewardAvailabilityV2 = z.infer<typeof rewardAvailabilityV2>;
export type WooCommerceCouponRestrictionsV2 = z.infer<
  typeof wooCommerceCouponRestrictionsV2
>;
export type ProgrammeRewardDefinitionV2 = z.infer<
  typeof programmeRewardDefinitionV2
>;
