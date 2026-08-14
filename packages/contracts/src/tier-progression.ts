import { z } from "zod";
import {
  tierMetricSnapshotV2,
  tierQualificationWindowV2,
} from "./tier-policy-v2";

const code = z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/u);
const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;
const exactCount = z
  .string()
  .regex(/^(?:0|[1-9][0-9]*)$/u)
  .refine((value) => BigInt(value) <= POSTGRES_BIGINT_MAX, {
    message: "Value exceeds PostgreSQL bigint capacity",
  });
const instant = z.iso.datetime({ offset: true });

export const tierDescriptorV1 = z
  .object({
    code,
    name: z.string().trim().min(1).max(200),
  })
  .strict();

export const tierProgressThresholdV1 = z
  .object({
    metric: z.enum([
      "eligible_spend",
      "earned_points",
      "order_count",
      "referral_count",
      "verified_action_count",
    ]),
    activityCodes: z.array(code).max(100),
    actual: exactCount,
    minimum: exactCount.refine((value) => value !== "0"),
    remaining: exactCount,
    matched: z.boolean(),
  })
  .strict()
  .superRefine((threshold, context) => {
    const actual = BigInt(threshold.actual);
    const minimum = BigInt(threshold.minimum);
    const expectedRemaining = minimum > actual ? minimum - actual : 0n;
    if (
      threshold.matched !== actual >= minimum ||
      BigInt(threshold.remaining) !== expectedRemaining
    ) {
      context.addIssue({
        code: "custom",
        message: "Tier threshold progress is inconsistent",
      });
    }
  });

export const tierMilestoneProgressV1 = z
  .object({
    tier: tierDescriptorV1,
    thresholdKind: z.enum(["entry", "retention", "reentry"]),
    operator: z.enum(["all", "any"]),
    matched: z.boolean(),
    thresholds: z.array(tierProgressThresholdV1).min(1).max(20),
  })
  .strict()
  .superRefine((milestone, context) => {
    const expectedMatched =
      milestone.operator === "all"
        ? milestone.thresholds.every((threshold) => threshold.matched)
        : milestone.thresholds.some((threshold) => threshold.matched);
    if (milestone.matched !== expectedMatched) {
      context.addIssue({
        code: "custom",
        message: "Tier milestone match does not agree with its thresholds",
      });
    }
  });

export const tierMembershipHistoryItemV1 = z
  .object({
    membershipId: z.uuid(),
    tier: tierDescriptorV1,
    transition: z.enum([
      "entry",
      "none",
      "upgrade",
      "reentry",
      "grace",
      "downgrade",
      "manual",
    ]),
    qualifiedTierCode: code,
    effectiveFrom: instant,
    effectiveUntil: instant.nullable(),
  })
  .strict();

export const customerTierProgressV1 = z
  .object({
    version: z.literal("1"),
    programmeVersionId: z.uuid(),
    currentTier: tierDescriptorV1.nullable(),
    automaticTier: tierDescriptorV1.nullable(),
    qualifiedTier: tierDescriptorV1.nullable(),
    transition: z
      .enum([
        "entry",
        "none",
        "upgrade",
        "reentry",
        "grace",
        "downgrade",
        "manual",
      ])
      .nullable(),
    effectiveFrom: instant.nullable(),
    window: tierQualificationWindowV2,
    metrics: tierMetricSnapshotV2,
    nextMilestone: tierMilestoneProgressV1.nullable(),
    retention: tierMilestoneProgressV1.nullable(),
    graceUntil: instant.nullable(),
    activeOverrideUntil: instant.nullable(),
    history: z.array(tierMembershipHistoryItemV1).max(20),
  })
  .strict();

export const tierPerformanceV1 = z
  .object({
    version: z.literal("1"),
    asOf: instant,
    programmeVersionId: z.uuid().nullable(),
    totalMembers: exactCount,
    membersWithTier: exactCount,
    inGrace: exactCount,
    activeManualOverrides: exactCount,
    transitions30Days: z
      .object({
        entries: exactCount,
        upgrades: exactCount,
        reentries: exactCount,
        downgrades: exactCount,
      })
      .strict(),
    tiers: z.array(
      z
        .object({
          tier: tierDescriptorV1,
          ordinal: z.number().int().min(1).max(15),
          memberCount: exactCount,
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((performance, context) => {
    const totalMembers = BigInt(performance.totalMembers);
    const membersWithTier = BigInt(performance.membersWithTier);
    if (
      membersWithTier > totalMembers ||
      BigInt(performance.inGrace) > membersWithTier ||
      BigInt(performance.activeManualOverrides) > membersWithTier
    ) {
      context.addIssue({
        code: "custom",
        message: "Tier performance counts exceed their population",
      });
    }
    const tierCodes = performance.tiers.map((item) => item.tier.code);
    const ordinals = performance.tiers.map((item) => item.ordinal);
    if (
      new Set(tierCodes).size !== tierCodes.length ||
      new Set(ordinals).size !== ordinals.length ||
      ordinals.some(
        (ordinal, index) => index > 0 && ordinal <= ordinals[index - 1]!,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Tier performance distribution must be uniquely ordered",
        path: ["tiers"],
      });
    }
  });

export type TierProgressThresholdV1 = z.infer<typeof tierProgressThresholdV1>;
export type TierMilestoneProgressV1 = z.infer<typeof tierMilestoneProgressV1>;
export type CustomerTierProgressV1 = z.infer<typeof customerTierProgressV1>;
export type TierPerformanceV1 = z.infer<typeof tierPerformanceV1>;
