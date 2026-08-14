import { z } from "zod";

const code = z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/u);
const exactNonNegativeBigint = z
  .string()
  .regex(/^(?:0|[1-9][0-9]*)$/u)
  .refine((value) => BigInt(value) <= 9_223_372_036_854_775_807n, {
    message: "Value exceeds PostgreSQL bigint capacity",
  });
const exactSignedBigint = z
  .string()
  .regex(/^(?:0|-?[1-9][0-9]*)$/u)
  .refine(
    (value) =>
      BigInt(value) >= -9_223_372_036_854_775_808n &&
      BigInt(value) <= 9_223_372_036_854_775_807n,
    { message: "Value exceeds PostgreSQL bigint capacity" },
  );
const operationKey = z.string().trim().min(1).max(255);
const timestamp = z.iso.datetime({ offset: true });

export const audienceMetricV1 = z.enum([
  "available_points",
  "pending_points",
  "eligible_spend",
  "earned_points",
  "order_count",
  "referral_count",
  "verified_action_count",
  "customer_age_days",
  "days_since_last_paid_order",
]);

const windowedAudienceMetrics = new Set([
  "eligible_spend",
  "earned_points",
  "order_count",
  "referral_count",
  "verified_action_count",
]);

export const audienceMetricWindowV1 = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("lifetime") }).strict(),
  z
    .object({
      kind: z.literal("rolling_days"),
      days: z.number().int().min(1).max(3650),
    })
    .strict(),
]);

export const audienceNumericConditionV1 = z
  .object({
    kind: z.literal("metric"),
    metric: audienceMetricV1,
    operator: z.enum(["at_least", "at_most", "between"]),
    minimum: exactNonNegativeBigint,
    maximum: exactNonNegativeBigint.nullable().default(null),
    window: audienceMetricWindowV1.nullable().default(null),
    activityCodes: z.array(code).max(100).default([]),
  })
  .strict()
  .superRefine((condition, context) => {
    if ((condition.operator === "between") !== (condition.maximum !== null)) {
      context.addIssue({
        code: "custom",
        path: ["maximum"],
        message: "Only between conditions require a maximum",
      });
    }
    if (
      condition.maximum !== null &&
      BigInt(condition.maximum) < BigInt(condition.minimum)
    ) {
      context.addIssue({
        code: "custom",
        path: ["maximum"],
        message: "Maximum must not be less than minimum",
      });
    }
    if (
      windowedAudienceMetrics.has(condition.metric) !==
      (condition.window !== null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["window"],
        message:
          "Fact metrics require a lifetime or rolling window; current metrics prohibit one",
      });
    }
    if (
      condition.metric !== "verified_action_count" &&
      condition.activityCodes.length > 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["activityCodes"],
        message: "Only verified-action conditions may select activity codes",
      });
    }
    if (
      new Set(condition.activityCodes).size !== condition.activityCodes.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["activityCodes"],
        message: "Activity codes must be unique",
      });
    }
  });

export const audienceTierConditionV1 = z
  .object({
    kind: z.literal("tier"),
    operator: z.enum(["in", "not_in"]),
    tierCodes: z.array(code).min(1).max(15),
  })
  .strict()
  .superRefine((condition, context) => {
    if (new Set(condition.tierCodes).size !== condition.tierCodes.length) {
      context.addIssue({
        code: "custom",
        path: ["tierCodes"],
        message: "Tier codes must be unique",
      });
    }
  });

export const audienceConditionV1 = z.union([
  audienceNumericConditionV1,
  audienceTierConditionV1,
]);

export const audienceDefinitionV1 = z
  .object({
    schemaVersion: z.literal("1"),
    code,
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).default(""),
    match: z.enum(["all", "any"]),
    conditions: z.array(audienceConditionV1).min(1).max(20),
  })
  .strict();

export const audienceMetricEvidenceV1 = z
  .object({
    metric: audienceMetricV1,
    window: audienceMetricWindowV1.nullable(),
    activityCodes: z.array(code).max(100),
    value: exactSignedBigint.nullable(),
  })
  .strict()
  .superRefine((evidence, context) => {
    if (
      windowedAudienceMetrics.has(evidence.metric) !==
      (evidence.window !== null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["window"],
        message:
          "Fact evidence requires a lifetime or rolling window; current evidence prohibits one",
      });
    }
    if (
      evidence.metric !== "verified_action_count" &&
      evidence.activityCodes.length > 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["activityCodes"],
        message: "Only verified-action evidence may select activity codes",
      });
    }
    if (
      new Set(evidence.activityCodes).size !== evidence.activityCodes.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["activityCodes"],
        message: "Evidence activity codes must be unique",
      });
    }
    if (
      evidence.value === null &&
      evidence.metric !== "days_since_last_paid_order"
    ) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "Only paid-order recency may be unknown",
      });
    }
    if (
      evidence.value !== null &&
      !["available_points", "pending_points"].includes(evidence.metric) &&
      BigInt(evidence.value) < 0n
    ) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "Canonical activity and age evidence cannot be negative",
      });
    }
  });

export const audienceEvaluationFactV1 = z
  .object({
    schemaVersion: z.literal("1"),
    subjectReference: z.string().trim().min(1).max(255),
    evaluatedAt: timestamp,
    tierCode: code.nullable(),
    metrics: z.array(audienceMetricEvidenceV1).max(100),
  })
  .strict();

export const audienceConditionResultV1 = z
  .object({
    conditionIndex: z.number().int().min(0).max(19),
    matched: z.boolean(),
    observedValue: exactSignedBigint.nullable(),
  })
  .strict();

export const audienceEvaluationV1 = z
  .object({
    schemaVersion: z.literal("1"),
    audienceCode: code,
    subjectReference: z.string().trim().min(1).max(255),
    evaluatedAt: timestamp,
    included: z.boolean(),
    results: z.array(audienceConditionResultV1).min(1).max(20),
  })
  .strict();

export const merchantCreateAudienceDraftCommandV1 = z
  .object({
    schemaVersion: z.literal("1"),
    programmeId: z.uuid(),
    definition: audienceDefinitionV1,
    idempotencyKey: operationKey,
    correlationId: z.uuid(),
  })
  .strict();

export const merchantPublishAudienceVersionCommandV1 = z
  .object({
    schemaVersion: z.literal("1"),
    audienceVersionId: z.uuid(),
    expectedDefinitionSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    idempotencyKey: operationKey,
    correlationId: z.uuid(),
  })
  .strict();

export const merchantCreateAudienceSnapshotCommandV1 = z
  .object({
    schemaVersion: z.literal("1"),
    audienceVersionId: z.uuid(),
    idempotencyKey: operationKey,
    correlationId: z.uuid(),
  })
  .strict();

export const audienceSnapshotReadV1 = z
  .object({
    schemaVersion: z.literal("1"),
    snapshotId: z.uuid(),
    audienceVersionId: z.uuid(),
    audienceCode: code,
    definitionVersion: z.number().int().positive(),
    definitionSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    snapshotAt: timestamp,
    memberCount: exactNonNegativeBigint,
  })
  .strict();

export type AudienceMetricV1 = z.infer<typeof audienceMetricV1>;
export type AudienceMetricWindowV1 = z.infer<typeof audienceMetricWindowV1>;
export type AudienceNumericConditionV1 = z.infer<
  typeof audienceNumericConditionV1
>;
export type AudienceConditionV1 = z.infer<typeof audienceConditionV1>;
export type AudienceDefinitionV1 = z.infer<typeof audienceDefinitionV1>;
export type AudienceMetricEvidenceV1 = z.infer<typeof audienceMetricEvidenceV1>;
export type AudienceEvaluationFactV1 = z.infer<typeof audienceEvaluationFactV1>;
export type AudienceEvaluationV1 = z.infer<typeof audienceEvaluationV1>;
export type AudienceSnapshotReadV1 = z.infer<typeof audienceSnapshotReadV1>;
