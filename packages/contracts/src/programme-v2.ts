import { z } from "zod";
import {
  programmeDefinitionV1,
  programmeRewardDefinitionV1,
  programmeTierDefinitionV1,
} from "./programme";
import { programmeRewardDefinitionV2 } from "./reward-v2";
import { pointExpiryPolicyV2 } from "./point-expiry-v2";
import { tierPolicyV2 } from "./tier-policy-v2";

const code = z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/u);
const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;
const positiveBigintString = z
  .string()
  .regex(/^[1-9][0-9]*$/u)
  .refine((value) => BigInt(value) <= POSTGRES_BIGINT_MAX, {
    message: "Value exceeds PostgreSQL bigint capacity",
  });
const timestamp = z.iso.datetime({ offset: true });
const selector = z.string().trim().min(1).max(255);
const selectorList = z.array(selector).max(100).default([]);
const operationKey = z.string().min(1).max(255);
const legacyProgrammeRewardKinds = new Set<string>([
  "fixed_discount",
  "percentage_discount",
  "free_shipping",
]);
const legacyProgrammeRewardDefinitionForV2 =
  programmeRewardDefinitionV1.superRefine((reward, context) => {
    if (!legacyProgrammeRewardKinds.has(reward.kind)) {
      context.addIssue({
        code: "custom",
        message: "Unsupported legacy reward kind in ProgrammeDefinitionV2",
        path: ["kind"],
      });
    }
    if (Object.prototype.hasOwnProperty.call(reward.configuration, "version")) {
      context.addIssue({
        code: "custom",
        message:
          "Versioned reward configuration must satisfy RewardDefinitionV2",
        path: ["configuration", "version"],
      });
    }
  });

export const earningSourceV2 = z.enum([
  "purchase",
  "account_created",
  "birthday",
  "verified_product_review",
  "referral",
  "custom_activity",
]);

export const earningRuleConditionsV2 = z
  .object({
    productIds: selectorList,
    categoryIds: selectorList,
    currencyCodes: z
      .array(z.string().regex(/^[A-Z]{3}$/u))
      .max(20)
      .default([]),
    markets: z
      .array(z.string().regex(/^[A-Z]{2}$/u))
      .max(100)
      .default([]),
    channels: selectorList,
    activityCodes: z.array(code).max(100).default([]),
    segmentCodes: z.array(code).max(100).default([]),
    tierCodes: z.array(code).max(100).default([]),
    startsAt: timestamp.nullable().default(null),
    endsAt: timestamp.nullable().default(null),
  })
  .strict();

export const purchaseExclusionsV2 = z
  .object({
    productIds: selectorList,
    categoryIds: selectorList,
    shipping: z.boolean().default(true),
    tax: z.boolean().default(true),
    fees: z.boolean().default(true),
    giftCardPayments: z.boolean().default(true),
    storeCreditPayments: z.literal(true).default(true),
    discounts: z.boolean().default(true),
  })
  .strict();

export const earningRuleCapV2 = z
  .object({
    perEventPoints: positiveBigintString.nullable().default(null),
    perMemberPoints: positiveBigintString.nullable().default(null),
    memberPeriod: z
      .enum([
        "lifetime",
        "calendar_day",
        "calendar_month",
        "calendar_year",
        "rolling",
      ])
      .nullable()
      .default(null),
    rollingDays: z.number().int().min(1).max(3650).nullable().default(null),
  })
  .strict()
  .superRefine((cap, context) => {
    if ((cap.perMemberPoints === null) !== (cap.memberPeriod === null)) {
      context.addIssue({
        code: "custom",
        message: "Member points and member period must be configured together",
        path: ["memberPeriod"],
      });
    }
    if ((cap.memberPeriod === "rolling") !== (cap.rollingDays !== null)) {
      context.addIssue({
        code: "custom",
        message:
          "Rolling member caps require rollingDays, and other periods prohibit it",
        path: ["rollingDays"],
      });
    }
  });

export const earningRuleEffectV2 = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("base_rate"),
      pointsPerMajorUnit: positiveBigintString,
    })
    .strict(),
  z
    .object({
      kind: z.literal("multiplier"),
      multiplierBasisPoints: z.number().int().min(10_001).max(100_000),
    })
    .strict(),
  z
    .object({
      kind: z.literal("fixed_bonus"),
      points: positiveBigintString,
    })
    .strict(),
]);

export const earningRuleV2 = z
  .object({
    code,
    name: z.string().trim().min(1).max(200),
    source: earningSourceV2,
    enabled: z.boolean().default(true),
    priority: z.number().int().min(-10_000).max(10_000),
    stackable: z.boolean(),
    effect: earningRuleEffectV2,
    conditions: earningRuleConditionsV2,
    purchaseExclusions: purchaseExclusionsV2.nullable().default(null),
    cap: earningRuleCapV2,
  })
  .strict()
  .superRefine((rule, context) => {
    const { startsAt, endsAt } = rule.conditions;
    if (
      startsAt !== null &&
      endsAt !== null &&
      Date.parse(startsAt) >= Date.parse(endsAt)
    ) {
      context.addIssue({
        code: "custom",
        message: "Rule end must follow rule start",
        path: ["conditions", "endsAt"],
      });
    }
    if (rule.effect.kind === "base_rate") {
      if (rule.source !== "purchase") {
        context.addIssue({
          code: "custom",
          message: "A base rate must use the purchase source",
          path: ["source"],
        });
      }
      if (rule.stackable) {
        context.addIssue({
          code: "custom",
          message: "A base rate cannot be stackable",
          path: ["stackable"],
        });
      }
    }
    if (rule.effect.kind === "multiplier") {
      if (rule.source !== "purchase") {
        context.addIssue({
          code: "custom",
          message: "Multipliers must use the purchase source",
          path: ["source"],
        });
      }
      if (rule.stackable) {
        context.addIssue({
          code: "custom",
          message: "Multipliers are mutually exclusive and cannot be stackable",
          path: ["stackable"],
        });
      }
    }
    if (rule.effect.kind === "fixed_bonus" && !rule.stackable) {
      context.addIssue({
        code: "custom",
        message: "Fixed bonuses must explicitly opt in to stacking",
        path: ["stackable"],
      });
    }
    if (rule.source === "purchase" && rule.purchaseExclusions === null) {
      context.addIssue({
        code: "custom",
        message: "Purchase rules require an explicit exclusion policy",
        path: ["purchaseExclusions"],
      });
    }
    if (rule.source !== "purchase") {
      if (rule.purchaseExclusions !== null) {
        context.addIssue({
          code: "custom",
          message: "Only purchase rules may configure purchase exclusions",
          path: ["purchaseExclusions"],
        });
      }
      if (
        (rule.source !== "verified_product_review" &&
          (rule.conditions.productIds.length > 0 ||
            rule.conditions.categoryIds.length > 0)) ||
        rule.conditions.currencyCodes.length > 0 ||
        rule.conditions.markets.length > 0
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Non-purchase rules cannot depend on commerce-line conditions",
          path: ["conditions"],
        });
      }
    }
    if (
      rule.source !== "custom_activity" &&
      rule.conditions.activityCodes.length > 0
    ) {
      context.addIssue({
        code: "custom",
        message: "Only custom activity rules may select activity codes",
        path: ["conditions", "activityCodes"],
      });
    }
  });

export const programmeDefinitionV2 = z
  .object({
    version: z.literal("2"),
    currencyCode: z.string().regex(/^[A-Z]{3}$/u),
    currencyMinorUnitDigits: z.number().int().min(0).max(6),
    pendingDays: z.number().int().min(0).max(365),
    pointsExpireAfterDays: z.number().int().min(1).max(3650),
    pointsExpiryPolicy: pointExpiryPolicyV2.optional(),
    tiers: z.array(programmeTierDefinitionV1).min(1),
    tierPolicy: tierPolicyV2.optional(),
    rewards: z
      .array(
        z.union([
          programmeRewardDefinitionV2,
          legacyProgrammeRewardDefinitionForV2,
        ]),
      )
      .default([]),
    earningRules: z.array(earningRuleV2).min(1).max(200),
  })
  .strict()
  .superRefine((definition, context) => {
    if (
      definition.pointsExpiryPolicy &&
      definition.pointsExpiryPolicy.expireAfterDays !==
        definition.pointsExpireAfterDays
    ) {
      context.addIssue({
        code: "custom",
        message: "The versioned expiry policy must match pointsExpireAfterDays",
        path: ["pointsExpiryPolicy", "expireAfterDays"],
      });
    }
    const codes = new Set<string>();
    let enabledBaseRules = 0;
    definition.earningRules.forEach((rule, index) => {
      if (codes.has(rule.code)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate earning rule code: ${rule.code}`,
          path: ["earningRules", index, "code"],
        });
      }
      codes.add(rule.code);
      if (rule.enabled && rule.effect.kind === "base_rate") {
        enabledBaseRules += 1;
      }
    });
    if (enabledBaseRules !== 1) {
      context.addIssue({
        code: "custom",
        message: "Exactly one enabled purchase base-rate rule is required",
        path: ["earningRules"],
      });
    }

    const rewardCodes = new Set<string>();
    definition.rewards.forEach((reward, index) => {
      const legacyConfiguration = reward.configuration as Record<
        string,
        unknown
      >;
      if (rewardCodes.has(reward.code)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate reward code: ${reward.code}`,
          path: ["rewards", index, "code"],
        });
      }
      rewardCodes.add(reward.code);
      if (
        reward.configuration.version !== "2" &&
        ["fixed_discount", "percentage_discount"].includes(reward.kind) &&
        legacyConfiguration.currencyMinorUnitDigits !==
          definition.currencyMinorUnitDigits
      ) {
        context.addIssue({
          code: "custom",
          message: "Legacy reward precision must match programme precision",
          path: ["rewards", index, "configuration", "currencyMinorUnitDigits"],
        });
      }
    });

    if (definition.tierPolicy) {
      const baseRule = definition.earningRules.find(
        (rule) => rule.enabled && rule.effect.kind === "base_rate",
      );
      const policyCodes = definition.tierPolicy.levels.map(
        (level) => level.tierCode,
      );
      const tierCodes = definition.tiers.map((tier) => tier.code);
      if (
        policyCodes.length !== tierCodes.length ||
        policyCodes.some((policyCode, index) => policyCode !== tierCodes[index])
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Advanced tier policy levels must match the ordered programme tiers",
          path: ["tierPolicy", "levels"],
        });
      }
      definition.tierPolicy.levels.forEach((level, levelIndex) => {
        const tier = definition.tiers[levelIndex];
        if (
          tier &&
          baseRule?.effect.kind === "base_rate" &&
          BigInt(tier.pointsPerMajorUnit) * 10_000n !==
            BigInt(baseRule.effect.pointsPerMajorUnit) *
              BigInt(level.benefits.earningMultiplierBasisPoints)
        ) {
          context.addIssue({
            code: "custom",
            message:
              "Tier earning multiplier must exactly match the displayed points rate",
            path: [
              "tierPolicy",
              "levels",
              levelIndex,
              "benefits",
              "earningMultiplierBasisPoints",
            ],
          });
        }
        level.benefits.rewardCodes.forEach((rewardCode, rewardIndex) => {
          const reward = definition.rewards.find(
            (candidate) => candidate.code === rewardCode,
          );
          if (!reward) {
            context.addIssue({
              code: "custom",
              message: `Unknown tier benefit reward code: ${rewardCode}`,
              path: [
                "tierPolicy",
                "levels",
                levelIndex,
                "benefits",
                "rewardCodes",
                rewardIndex,
              ],
            });
          } else {
            const executableReward =
              programmeRewardDefinitionV2.safeParse(reward);
            if (
              executableReward.success &&
              executableReward.data.configuration.availability.tierCodes.includes(
                level.tierCode,
              )
            ) {
              return;
            }
            context.addIssue({
              code: "custom",
              message:
                "Tier benefit rewards must use V2 fulfilment and include the tier in availability",
              path: [
                "tierPolicy",
                "levels",
                levelIndex,
                "benefits",
                "rewardCodes",
                rewardIndex,
              ],
            });
          }
        });
      });
    }

    const legacyTierSurface = programmeDefinitionV1.safeParse({
      version: "1",
      tiers: definition.tiers,
      rewards: definition.rewards.filter(
        (reward) => reward.configuration.version !== "2",
      ),
    });
    if (!legacyTierSurface.success) {
      for (const issue of legacyTierSurface.error.issues) {
        context.addIssue({
          code: "custom",
          message: issue.message,
          path: issue.path,
        });
      }
    }
  });

export const merchantCreateProgrammeDraftCommandV2 = z
  .object({
    version: z.literal("2"),
    programmeId: z.uuid(),
    configuration: programmeDefinitionV2,
    idempotencyKey: operationKey,
    correlationId: z.uuid(),
  })
  .strict();

export type EarningSourceV2 = z.infer<typeof earningSourceV2>;
export type EarningRuleConditionsV2 = z.infer<typeof earningRuleConditionsV2>;
export type PurchaseExclusionsV2 = z.infer<typeof purchaseExclusionsV2>;
export type EarningRuleCapV2 = z.infer<typeof earningRuleCapV2>;
export type EarningRuleEffectV2 = z.infer<typeof earningRuleEffectV2>;
export type EarningRuleV2 = z.infer<typeof earningRuleV2>;
export type ProgrammeDefinitionV2 = z.infer<typeof programmeDefinitionV2>;
export type MerchantCreateProgrammeDraftCommandV2 = z.infer<
  typeof merchantCreateProgrammeDraftCommandV2
>;
