import { z } from "zod";
import {
  programmeDefinitionV1,
  programmeRewardDefinitionV1,
  programmeTierDefinitionV1,
} from "./programme";

const code = z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/u);
const positiveBigintString = z.string().regex(/^[1-9][0-9]*$/u);
const timestamp = z.iso.datetime({ offset: true });
const selector = z.string().trim().min(1).max(255);
const selectorList = z.array(selector).max(100).default([]);

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
    if (startsAt !== null && endsAt !== null && startsAt >= endsAt) {
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
        rule.conditions.productIds.length > 0 ||
        rule.conditions.categoryIds.length > 0 ||
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
  });

export const programmeDefinitionV2 = z
  .object({
    version: z.literal("2"),
    currencyCode: z.string().regex(/^[A-Z]{3}$/u),
    currencyMinorUnitDigits: z.number().int().min(0).max(6),
    pendingDays: z.number().int().min(0).max(365),
    pointsExpireAfterDays: z.number().int().min(1).max(3650),
    tiers: z.array(programmeTierDefinitionV1).min(1),
    rewards: z.array(programmeRewardDefinitionV1).default([]),
    earningRules: z.array(earningRuleV2).min(1).max(200),
  })
  .strict()
  .superRefine((definition, context) => {
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

    const legacySurface = programmeDefinitionV1.safeParse({
      version: "1",
      tiers: definition.tiers,
      rewards: definition.rewards,
    });
    if (!legacySurface.success) {
      for (const issue of legacySurface.error.issues) {
        context.addIssue({
          code: "custom",
          message: issue.message,
          path: issue.path,
        });
      }
    }
  });

export type EarningSourceV2 = z.infer<typeof earningSourceV2>;
export type EarningRuleConditionsV2 = z.infer<typeof earningRuleConditionsV2>;
export type PurchaseExclusionsV2 = z.infer<typeof purchaseExclusionsV2>;
export type EarningRuleCapV2 = z.infer<typeof earningRuleCapV2>;
export type EarningRuleEffectV2 = z.infer<typeof earningRuleEffectV2>;
export type EarningRuleV2 = z.infer<typeof earningRuleV2>;
export type ProgrammeDefinitionV2 = z.infer<typeof programmeDefinitionV2>;
