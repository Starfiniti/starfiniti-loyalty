import { z } from "zod";

const code = z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/u);
const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;
const positiveBigintString = z
  .string()
  .regex(/^[1-9][0-9]*$/u)
  .refine((value) => BigInt(value) <= POSTGRES_BIGINT_MAX, {
    message: "Value exceeds PostgreSQL bigint capacity",
  });

export const tierQualificationMetricV2 = z.enum([
  "eligible_spend",
  "earned_points",
  "order_count",
  "referral_count",
  "verified_action_count",
]);

export const tierQualificationThresholdV2 = z
  .object({
    metric: tierQualificationMetricV2,
    minimum: positiveBigintString,
    activityCodes: z.array(code).max(100).default([]),
  })
  .strict()
  .superRefine((threshold, context) => {
    if (
      threshold.metric !== "verified_action_count" &&
      threshold.activityCodes.length > 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["activityCodes"],
        message: "Only verified-action thresholds may select activity codes",
      });
    }
    if (
      new Set(threshold.activityCodes).size !== threshold.activityCodes.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["activityCodes"],
        message: "Activity codes must be unique",
      });
    }
  });

export const tierQualificationExpressionV2 = z
  .object({
    operator: z.enum(["all", "any"]),
    thresholds: z.array(tierQualificationThresholdV2).min(1).max(20),
  })
  .strict()
  .superRefine((expression, context) => {
    const identities = new Set<string>();
    expression.thresholds.forEach((threshold, index) => {
      const identity = `${threshold.metric}:${[...threshold.activityCodes]
        .sort()
        .join(",")}`;
      if (identities.has(identity)) {
        context.addIssue({
          code: "custom",
          path: ["thresholds", index],
          message: "Qualification thresholds must be unique",
        });
      }
      identities.add(identity);
    });
  });

export const tierQualificationPeriodV2 = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("lifetime") }).strict(),
  z
    .object({
      kind: z.literal("rolling_days"),
      days: z.number().int().min(1).max(3650),
    })
    .strict(),
  z
    .object({
      kind: z.literal("calendar_year"),
      timeZone: z
        .string()
        .trim()
        .min(1)
        .max(100)
        .regex(/^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+-]+)+$/u),
    })
    .strict(),
]);

export const tierBenefitsV2 = z
  .object({
    earningMultiplierBasisPoints: z
      .number()
      .int()
      .min(10_000)
      .max(100_000)
      .default(10_000),
    rewardCodes: z.array(code).max(100).default([]),
    earlyAccess: z.boolean().default(false),
  })
  .strict()
  .superRefine((benefits, context) => {
    if (new Set(benefits.rewardCodes).size !== benefits.rewardCodes.length) {
      context.addIssue({
        code: "custom",
        path: ["rewardCodes"],
        message: "Tier reward codes must be unique",
      });
    }
  });

export const tierPolicyLevelV2 = z
  .object({
    tierCode: code,
    entry: tierQualificationExpressionV2.nullable(),
    retention: tierQualificationExpressionV2.nullable(),
    reentry: tierQualificationExpressionV2.nullable(),
    benefits: tierBenefitsV2,
  })
  .strict();

export const tierPolicyV2 = z
  .object({
    version: z.literal("2"),
    qualificationPeriod: tierQualificationPeriodV2,
    downgradeGraceDays: z.number().int().min(0).max(365),
    levels: z.array(tierPolicyLevelV2).min(1).max(15),
  })
  .strict()
  .superRefine((policy, context) => {
    const tierCodes = new Set<string>();
    policy.levels.forEach((level, index) => {
      if (tierCodes.has(level.tierCode)) {
        context.addIssue({
          code: "custom",
          path: ["levels", index, "tierCode"],
          message: "Tier policy codes must be unique",
        });
      }
      tierCodes.add(level.tierCode);
      const expressions = [level.entry, level.retention, level.reentry];
      if (
        index === 0 &&
        expressions.some((expression) => expression !== null)
      ) {
        context.addIssue({
          code: "custom",
          path: ["levels", index],
          message: "The base tier cannot require qualification thresholds",
        });
      }
      if (index > 0 && expressions.some((expression) => expression === null)) {
        context.addIssue({
          code: "custom",
          path: ["levels", index],
          message:
            "Every non-base tier requires entry, retention, and re-entry thresholds",
        });
      }
    });
  });

export type TierQualificationMetricV2 = z.infer<
  typeof tierQualificationMetricV2
>;
export type TierQualificationThresholdV2 = z.infer<
  typeof tierQualificationThresholdV2
>;
export type TierQualificationExpressionV2 = z.infer<
  typeof tierQualificationExpressionV2
>;
export type TierQualificationPeriodV2 = z.infer<
  typeof tierQualificationPeriodV2
>;
export type TierBenefitsV2 = z.infer<typeof tierBenefitsV2>;
export type TierPolicyLevelV2 = z.infer<typeof tierPolicyLevelV2>;
export type TierPolicyV2 = z.infer<typeof tierPolicyV2>;
