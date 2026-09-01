import { z } from "zod";
import {
  earningRuleCapV2,
  earningRuleEffectV2,
  earningSourceV2,
} from "./programme-v2";
import { customerReferralExperienceV1 } from "./referral";
import { experiencePresentationV2 } from "./experience";
import { customerTierProgressV1, tierDescriptorV1 } from "./tier-progression";

const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;
const POSTGRES_BIGINT_MIN = -9_223_372_036_854_775_808n;
const exactPoints = z
  .string()
  .regex(/^(?:0|-?[1-9][0-9]*)$/u)
  .refine(
    (value) => {
      const parsed = BigInt(value);
      return parsed >= POSTGRES_BIGINT_MIN && parsed <= POSTGRES_BIGINT_MAX;
    },
    {
      message: "Value exceeds PostgreSQL bigint capacity",
    },
  );
const positivePoints = exactPoints.refine((value) => BigInt(value) > 0n, {
  message: "Value must be positive",
});
const instant = z.iso.datetime({ offset: true });
const code = z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/u);
const customerText = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((value) => !/[<>\u0000-\u001f\u007f]/u.test(value), {
    message: "Customer text contains unsupported markup or control characters",
  });
const customerCampaignDescription = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine((value) => !/[<>\u0000-\u001f\u007f]/u.test(value), {
    message:
      "Campaign description contains unsupported markup or control characters",
  });

export const customerAccountStatusV1 = z.enum([
  "programme_unavailable",
  "ready_without_activity",
  "ready",
  "wallet_blocked",
  "wallet_closed",
]);

export const customerEarningMethodV1 = z
  .object({
    code,
    name: customerText,
    source: earningSourceV2,
    effect: earningRuleEffectV2,
    cap: earningRuleCapV2,
    hasRestrictions: z.boolean(),
    startsAt: instant.nullable(),
    endsAt: instant.nullable(),
    availableNow: z.boolean(),
  })
  .strict()
  .refine(
    (method) =>
      method.startsAt === null ||
      method.endsAt === null ||
      Date.parse(method.startsAt) < Date.parse(method.endsAt),
    { message: "Earning method end must follow start", path: ["endsAt"] },
  );

export const customerRewardV1 = z
  .object({
    code,
    name: customerText,
    kind: z.enum([
      "fixed_discount",
      "percentage_discount",
      "free_product",
      "free_shipping",
      "store_credit",
      "exclusive_access",
      "custom",
    ]),
    costPoints: positivePoints,
    affordable: z.boolean(),
  })
  .strict();

export const customerReservationV1 = z
  .object({
    id: z.uuid(),
    rewardName: customerText,
    state: z.enum(["requested", "reserved", "issued"]),
    costPoints: positivePoints,
    expiresAt: instant,
  })
  .strict();

export const customerActivityV1 = z
  .object({
    id: z.uuid(),
    kind: z.enum([
      "award",
      "release",
      "reserve",
      "capture",
      "cancel",
      "expire",
      "refund_reversal",
      "manual_adjustment",
      "opening_balance",
    ]),
    points: positivePoints,
    effectiveAt: instant,
  })
  .strict();

export const customerPurchaseCampaignEffectV1 = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("bonus_points"),
      points: positivePoints,
      combination: z.literal("additive_bonus"),
    })
    .strict(),
  z
    .object({
      kind: z.literal("purchase_multiplier"),
      multiplierBasisPoints: z.number().int().min(10_001).max(100_000),
      combination: z.literal("highest_eligible_multiplier"),
    })
    .strict(),
]);

export const customerPurchaseCampaignOpportunityV1 = z
  .object({
    code,
    name: customerText,
    description: customerCampaignDescription.nullable(),
    state: z.enum(["scheduled", "active"]),
    startsAt: instant,
    endsAt: instant,
    hasPurchaseRestrictions: z.boolean(),
    effect: customerPurchaseCampaignEffectV1,
  })
  .strict()
  .refine(
    (opportunity) =>
      Date.parse(opportunity.startsAt) < Date.parse(opportunity.endsAt),
    {
      message: "Campaign opportunity end must follow start",
      path: ["endsAt"],
    },
  );

const customerLoyaltyExperienceBase = z
  .object({
    asOf: instant,
    accountId: z.uuid(),
    workspaceId: z.uuid(),
    programmeId: z.uuid().nullable(),
    storeName: customerText,
    programmeName: customerText.nullable(),
    accountStatus: customerAccountStatusV1,
    enhancementsEnabled: z.boolean(),
    balances: z
      .object({
        pending: exactPoints,
        available: exactPoints,
        reserved: exactPoints,
      })
      .strict(),
    currentTier: tierDescriptorV1.nullable(),
    nextExpiry: z
      .object({
        points: positivePoints,
        expiresAt: instant,
      })
      .strict()
      .nullable(),
    earningMethods: z.array(customerEarningMethodV1).max(24),
    rewards: z.array(customerRewardV1).max(20),
    reservations: z.array(customerReservationV1).max(10),
    activity: z.array(customerActivityV1).max(10),
    tierProgress: customerTierProgressV1.nullable(),
    referral: customerReferralExperienceV1.nullable(),
  })
  .strict();

function validateCustomerLoyaltyExperience(
  experience: z.infer<typeof customerLoyaltyExperienceBase>,
  context: z.RefinementCtx,
): void {
  const available = BigInt(experience.balances.available);
  for (const [index, reward] of experience.rewards.entries()) {
    if (reward.affordable !== BigInt(reward.costPoints) <= available) {
      context.addIssue({
        code: "custom",
        message: "Reward affordability does not match the exact balance",
        path: ["rewards", index, "affordable"],
      });
    }
  }
  for (const [index, method] of experience.earningMethods.entries()) {
    const at = Date.parse(experience.asOf);
    const availableNow =
      (method.startsAt === null || Date.parse(method.startsAt) <= at) &&
      (method.endsAt === null || Date.parse(method.endsAt) > at);
    if (method.availableNow !== availableNow) {
      context.addIssue({
        code: "custom",
        message: "Earning availability does not match the projection instant",
        path: ["earningMethods", index, "availableNow"],
      });
    }
  }
  if (
    experience.referral !== null &&
    experience.referral.accountId !== experience.accountId
  ) {
    context.addIssue({
      code: "custom",
      message: "Referral experience belongs to a different account",
      path: ["referral", "accountId"],
    });
  }
  const uniqueFields: ReadonlyArray<readonly [string, ReadonlyArray<string>]> =
    [
      [
        "earningMethods",
        experience.earningMethods.map((method) => method.code),
      ],
      ["rewards", experience.rewards.map((reward) => reward.code)],
      [
        "reservations",
        experience.reservations.map((reservation) => reservation.id),
      ],
      ["activity", experience.activity.map((activity) => activity.id)],
    ];
  for (const [field, values] of uniqueFields) {
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: "custom",
        message: `${field} identifiers must be unique`,
        path: [field],
      });
    }
  }
}

export const customerLoyaltyExperienceV1 = customerLoyaltyExperienceBase
  .extend({ version: z.literal("1") })
  .strict()
  .superRefine(validateCustomerLoyaltyExperience);

export const customerLoyaltyExperienceV2 = customerLoyaltyExperienceBase
  .extend({
    version: z.literal("2"),
    presentation: experiencePresentationV2,
  })
  .strict()
  .superRefine(validateCustomerLoyaltyExperience);

export const customerLoyaltyExperienceV3 = customerLoyaltyExperienceBase
  .extend({
    version: z.literal("3"),
    presentation: experiencePresentationV2,
    campaignOpportunities: z
      .array(customerPurchaseCampaignOpportunityV1)
      .max(8),
  })
  .strict()
  .superRefine((experience, context) => {
    validateCustomerLoyaltyExperience(experience, context);
    const projectionInstant = Date.parse(experience.asOf);
    for (const [
      index,
      opportunity,
    ] of experience.campaignOpportunities.entries()) {
      const startsAt = Date.parse(opportunity.startsAt);
      const endsAt = Date.parse(opportunity.endsAt);
      const stateMatchesProjection =
        opportunity.state === "active"
          ? startsAt <= projectionInstant && endsAt > projectionInstant
          : startsAt > projectionInstant;
      if (!stateMatchesProjection) {
        context.addIssue({
          code: "custom",
          message: "Campaign state does not match the projection instant",
          path: ["campaignOpportunities", index, "state"],
        });
      }
    }
    const codes = experience.campaignOpportunities.map(
      (opportunity) => opportunity.code,
    );
    if (new Set(codes).size !== codes.length) {
      context.addIssue({
        code: "custom",
        message: "Campaign opportunity identifiers must be unique",
        path: ["campaignOpportunities"],
      });
    }
  });

export type CustomerEarningMethodV1 = z.infer<typeof customerEarningMethodV1>;
export type CustomerRewardV1 = z.infer<typeof customerRewardV1>;
export type CustomerReservationV1 = z.infer<typeof customerReservationV1>;
export type CustomerActivityV1 = z.infer<typeof customerActivityV1>;
export type CustomerPurchaseCampaignOpportunityV1 = z.infer<
  typeof customerPurchaseCampaignOpportunityV1
>;
export type CustomerLoyaltyExperienceV1 = z.infer<
  typeof customerLoyaltyExperienceV1
>;
export type CustomerLoyaltyExperienceV2 = z.infer<
  typeof customerLoyaltyExperienceV2
>;
export type CustomerLoyaltyExperienceV3 = z.infer<
  typeof customerLoyaltyExperienceV3
>;
