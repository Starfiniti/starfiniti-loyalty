import { z } from "zod";

const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;
const code = z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/u);
const operationKey = z.string().trim().min(1).max(255);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
const positiveBigint = z
  .string()
  .regex(/^[1-9][0-9]*$/u)
  .refine((value) => BigInt(value) <= POSTGRES_BIGINT_MAX, {
    message: "Value exceeds PostgreSQL bigint capacity",
  });
const nonNegativeBigint = z
  .string()
  .regex(/^(?:0|[1-9][0-9]*)$/u)
  .refine((value) => BigInt(value) <= POSTGRES_BIGINT_MAX, {
    message: "Value exceeds PostgreSQL bigint capacity",
  });
const localDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/u);
const offsetDateTime = z.iso.datetime({ offset: true });
const reviewReason = z
  .string()
  .trim()
  .min(8)
  .max(1000)
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value), {
    message: "Reason contains unsupported control characters",
  });

const formatLocalDateTime = (instant: string, timezone: string) => {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(instant));
    const values = Object.fromEntries(
      parts
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value]),
    );
    return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}`;
  } catch {
    return null;
  }
};

export const campaignScheduleV1 = z
  .object({
    timezone: z.string().trim().min(1).max(64),
    startsAt: offsetDateTime,
    startsLocal: localDateTime,
    endsAt: offsetDateTime,
    endsLocal: localDateTime,
  })
  .strict()
  .superRefine((schedule, context) => {
    const start = Date.parse(schedule.startsAt);
    const end = Date.parse(schedule.endsAt);
    if (start >= end) {
      context.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "Campaign end must follow its start instant",
      });
    }
    if (end - start > 366 * 24 * 60 * 60 * 1000) {
      context.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "Campaign duration cannot exceed 366 days",
      });
    }
    const derivedStart = formatLocalDateTime(
      schedule.startsAt,
      schedule.timezone,
    );
    const derivedEnd = formatLocalDateTime(schedule.endsAt, schedule.timezone);
    if (derivedStart === null || derivedEnd === null) {
      context.addIssue({
        code: "custom",
        path: ["timezone"],
        message: "Use a supported IANA timezone",
      });
      return;
    }
    if (derivedStart !== schedule.startsLocal) {
      context.addIssue({
        code: "custom",
        path: ["startsLocal"],
        message: "Start instant does not match the local timezone evidence",
      });
    }
    if (derivedEnd !== schedule.endsLocal) {
      context.addIssue({
        code: "custom",
        path: ["endsLocal"],
        message: "End instant does not match the local timezone evidence",
      });
    }
  });

export const campaignPointsRewardV1 = z
  .object({ kind: z.literal("points"), points: positiveBigint })
  .strict();

export const campaignProgrammeRewardV1 = z
  .object({ kind: z.literal("programme_reward"), rewardId: z.uuid() })
  .strict();

export const campaignRewardV1 = z.discriminatedUnion("kind", [
  campaignPointsRewardV1,
  campaignProgrammeRewardV1,
]);

const uniqueCodes = z
  .array(code)
  .min(1)
  .max(50)
  .refine(
    (values) => new Set(values).size === values.length,
    "Codes must be unique",
  );

export const bonusPointsCampaignBehaviorV1 = z
  .object({
    kind: z.literal("bonus_points"),
    earningRuleCodes: uniqueCodes,
    reward: campaignPointsRewardV1,
  })
  .strict();

export const purchaseMultiplierCampaignBehaviorV1 = z
  .object({
    kind: z.literal("purchase_multiplier"),
    earningRuleCodes: uniqueCodes,
    multiplierBasisPoints: z.number().int().min(10_001).max(100_000),
    priority: z.number().int().min(0).max(10_000),
  })
  .strict();

export const campaignPurchaseBehaviorV1 = z.discriminatedUnion("kind", [
  bonusPointsCampaignBehaviorV1,
  purchaseMultiplierCampaignBehaviorV1,
]);

export const campaignBehaviorV1 = z.discriminatedUnion("kind", [
  bonusPointsCampaignBehaviorV1,
  purchaseMultiplierCampaignBehaviorV1,
  z
    .object({
      kind: z.literal("milestone"),
      metric: z.enum([
        "eligible_spend",
        "earned_points",
        "order_count",
        "referral_count",
        "verified_action_count",
      ]),
      threshold: positiveBigint,
      activityCodes: z.array(code).max(50),
      reward: campaignRewardV1,
    })
    .strict()
    .superRefine((behavior, context) => {
      if (
        behavior.metric !== "verified_action_count" &&
        behavior.activityCodes.length > 0
      ) {
        context.addIssue({
          code: "custom",
          path: ["activityCodes"],
          message: "Only verified-action milestones select activity codes",
        });
      }
      if (
        new Set(behavior.activityCodes).size !== behavior.activityCodes.length
      ) {
        context.addIssue({
          code: "custom",
          path: ["activityCodes"],
          message: "Activity codes must be unique",
        });
      }
    }),
  z
    .object({
      kind: z.literal("win_back"),
      minimumInactiveDays: z.number().int().min(1).max(3_650),
      minimumEligibleSpendMinor: nonNegativeBigint,
      reward: campaignRewardV1,
    })
    .strict(),
  z
    .object({
      kind: z.literal("tier"),
      movement: z.enum(["entry", "retention", "re_entry"]),
      tierCodes: uniqueCodes,
      reward: campaignRewardV1,
    })
    .strict(),
  z
    .object({
      kind: z.literal("referral"),
      rewardedParty: z.enum(["advocate", "friend"]),
      reward: campaignRewardV1,
    })
    .strict(),
  z
    .object({
      kind: z.literal("limited_quantity"),
      reward: campaignProgrammeRewardV1,
    })
    .strict(),
]);

export const campaignCapacityV1 = z
  .object({
    globalEffectLimit: positiveBigint,
    perMemberEffectLimit: z.number().int().min(1).max(100),
    maximumPoints: positiveBigint.nullable(),
    maximumLiabilityMinor: positiveBigint.nullable(),
    liabilityMinorPerEffect: positiveBigint.nullable(),
    liabilityCurrencyCode: z
      .string()
      .regex(/^[A-Z]{3}$/u)
      .nullable(),
    liabilityMinorUnitDigits: z.number().int().min(0).max(3).nullable(),
  })
  .strict()
  .superRefine((capacity, context) => {
    if (BigInt(capacity.globalEffectLimit) < capacity.perMemberEffectLimit) {
      context.addIssue({
        code: "custom",
        path: ["globalEffectLimit"],
        message: "Global effect limit cannot be below the per-member limit",
      });
    }
    const hasLiability = capacity.maximumLiabilityMinor !== null;
    if (
      hasLiability !== (capacity.liabilityMinorPerEffect !== null) ||
      hasLiability !== (capacity.liabilityCurrencyCode !== null) ||
      hasLiability !== (capacity.liabilityMinorUnitDigits !== null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["maximumLiabilityMinor"],
        message:
          "Liability ceiling, per-effect amount, currency, and precision must be set together",
      });
    }
    if (
      capacity.maximumLiabilityMinor !== null &&
      capacity.liabilityMinorPerEffect !== null &&
      BigInt(capacity.liabilityMinorPerEffect) >
        BigInt(capacity.maximumLiabilityMinor)
    ) {
      context.addIssue({
        code: "custom",
        path: ["liabilityMinorPerEffect"],
        message: "Per-effect liability cannot exceed the campaign ceiling",
      });
    }
  });

export const campaignDefinitionV1 = z
  .object({
    schemaVersion: z.literal("1"),
    code,
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).default(""),
    audienceSnapshotId: z.uuid(),
    exclusionSnapshotIds: z.array(z.uuid()).max(10),
    schedule: campaignScheduleV1,
    behavior: campaignBehaviorV1,
    capacity: campaignCapacityV1,
    controlBasisPoints: z.number().int().min(0).max(9_000),
  })
  .strict()
  .superRefine((definition, context) => {
    if (
      new Set(definition.exclusionSnapshotIds).size !==
      definition.exclusionSnapshotIds.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["exclusionSnapshotIds"],
        message: "Exclusion snapshots must be unique",
      });
    }
    if (
      definition.exclusionSnapshotIds.includes(definition.audienceSnapshotId)
    ) {
      context.addIssue({
        code: "custom",
        path: ["exclusionSnapshotIds"],
        message: "The inclusion snapshot cannot also be excluded",
      });
    }
    const reward =
      "reward" in definition.behavior ? definition.behavior.reward : null;
    const issuesPoints =
      definition.behavior.kind === "purchase_multiplier" ||
      reward?.kind === "points";
    if (issuesPoints && definition.capacity.maximumPoints === null) {
      context.addIssue({
        code: "custom",
        path: ["capacity", "maximumPoints"],
        message: "Point-value campaigns require a maximum-points budget",
      });
    }
    if (
      reward?.kind === "points" &&
      definition.capacity.maximumPoints !== null &&
      BigInt(definition.capacity.maximumPoints) < BigInt(reward.points)
    ) {
      context.addIssue({
        code: "custom",
        path: ["capacity", "maximumPoints"],
        message: "The points budget must cover at least one reward",
      });
    }
    if (
      reward?.kind === "programme_reward" &&
      definition.capacity.maximumLiabilityMinor === null
    ) {
      context.addIssue({
        code: "custom",
        path: ["capacity", "maximumLiabilityMinor"],
        message: "Programme-reward campaigns require a liability ceiling",
      });
    }
    if (
      definition.behavior.kind === "limited_quantity" &&
      definition.capacity.perMemberEffectLimit !== 1
    ) {
      context.addIssue({
        code: "custom",
        path: ["capacity", "perMemberEffectLimit"],
        message: "Limited rewards allow one effect per member",
      });
    }
  });

const campaignVersionCommand = z
  .object({
    schemaVersion: z.literal("1"),
    campaignVersionId: z.uuid(),
    expectedDefinitionSha256: sha256,
    idempotencyKey: operationKey,
    correlationId: z.uuid(),
  })
  .strict();

export const merchantCreateCampaignDraftCommandV1 = z
  .object({
    schemaVersion: z.literal("1"),
    programmeId: z.uuid(),
    definition: campaignDefinitionV1,
    idempotencyKey: operationKey,
    correlationId: z.uuid(),
  })
  .strict();

export const merchantPreviewCampaignVersionCommandV1 = campaignVersionCommand;
export const merchantApproveCampaignVersionCommandV1 = campaignVersionCommand;

export const merchantPauseCampaignVersionCommandV1 = z
  .object({
    schemaVersion: z.literal("1"),
    campaignVersionId: z.uuid(),
    reason: reviewReason,
    idempotencyKey: operationKey,
    correlationId: z.uuid(),
  })
  .strict();

export const merchantCancelCampaignVersionCommandV1 =
  merchantPauseCampaignVersionCommandV1;

export const campaignPreviewV1 = z
  .object({
    schemaVersion: z.literal("1"),
    campaignVersionId: z.uuid(),
    definitionSha256: sha256,
    inclusionMembers: nonNegativeBigint,
    excludedMembers: nonNegativeBigint,
    eligibleMembers: nonNegativeBigint,
    expectedControlMembers: nonNegativeBigint,
    expectedTreatmentMembers: nonNegativeBigint,
    maximumEffects: nonNegativeBigint,
    maximumPoints: positiveBigint.nullable(),
    maximumLiabilityMinor: positiveBigint.nullable(),
  })
  .strict()
  .superRefine((preview, context) => {
    if (
      BigInt(preview.inclusionMembers) - BigInt(preview.excludedMembers) !==
      BigInt(preview.eligibleMembers)
    ) {
      context.addIssue({
        code: "custom",
        path: ["eligibleMembers"],
        message: "Eligible members must reconcile inclusion and exclusions",
      });
    }
    if (
      BigInt(preview.eligibleMembers) !==
      BigInt(preview.expectedControlMembers) +
        BigInt(preview.expectedTreatmentMembers)
    ) {
      context.addIssue({
        code: "custom",
        path: ["eligibleMembers"],
        message: "Treatment and control counts must reconcile",
      });
    }
  });

export const campaignPurchaseCandidateV1 = z
  .object({
    schemaVersion: z.literal("1"),
    campaignVersionId: z.uuid(),
    campaignCode: code,
    assignment: z.enum(["treatment", "control"]),
    behavior: campaignPurchaseBehaviorV1,
    remainingGlobalEffects: nonNegativeBigint,
    remainingMemberEffects: nonNegativeBigint,
    remainingPoints: nonNegativeBigint,
  })
  .strict();

export const campaignPurchaseDecisionV1 = z
  .object({
    campaignVersionId: z.uuid(),
    campaignCode: code,
    assignment: z.enum(["treatment", "control"]),
    effectKind: z.enum(["bonus_points", "purchase_multiplier"]),
    matchedRuleCodes: z.array(code).min(1).max(50),
    priority: z.number().int().min(0).max(10_000).nullable(),
    points: nonNegativeBigint,
    outcome: z.enum(["awarded", "control", "capacity_exhausted", "suppressed"]),
  })
  .strict()
  .superRefine((decision, context) => {
    if ((decision.outcome === "awarded") !== BigInt(decision.points) > 0n) {
      context.addIssue({
        code: "custom",
        path: ["points"],
        message: "Only awarded campaign decisions may carry positive points",
      });
    }
    if (
      (decision.effectKind === "purchase_multiplier") !==
      (decision.priority !== null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["priority"],
        message: "Only multiplier decisions carry a priority",
      });
    }
  });

export const campaignPurchaseEvaluationV1 = z
  .object({
    schemaVersion: z.literal("1"),
    selectedCampaignMultiplierVersionId: z.uuid().nullable(),
    suppressedProgrammeMultiplierRuleCode: code.nullable(),
    totalCampaignPoints: nonNegativeBigint,
    decisions: z.array(campaignPurchaseDecisionV1).max(100),
  })
  .strict()
  .superRefine((evaluation, context) => {
    const awarded = evaluation.decisions.filter(
      (decision) => decision.outcome === "awarded",
    );
    const total = awarded.reduce(
      (sum, decision) => sum + BigInt(decision.points),
      0n,
    );
    if (total !== BigInt(evaluation.totalCampaignPoints)) {
      context.addIssue({
        code: "custom",
        path: ["totalCampaignPoints"],
        message: "Campaign decision points must reconcile to the total",
      });
    }
    const selected = awarded.filter(
      (decision) => decision.effectKind === "purchase_multiplier",
    );
    if (
      selected.length > 1 ||
      (selected[0]?.campaignVersionId ?? null) !==
        evaluation.selectedCampaignMultiplierVersionId
    ) {
      context.addIssue({
        code: "custom",
        path: ["selectedCampaignMultiplierVersionId"],
        message:
          "The selected multiplier must match exactly one awarded decision",
      });
    }
    const identities = evaluation.decisions.map(
      (decision) => decision.campaignVersionId,
    );
    if (new Set(identities).size !== identities.length) {
      context.addIssue({
        code: "custom",
        path: ["decisions"],
        message: "A campaign version may appear only once per evaluation",
      });
    }
  });

export type CampaignScheduleV1 = z.infer<typeof campaignScheduleV1>;
export type CampaignRewardV1 = z.infer<typeof campaignRewardV1>;
export type CampaignBehaviorV1 = z.infer<typeof campaignBehaviorV1>;
export type CampaignPurchaseBehaviorV1 = z.infer<
  typeof campaignPurchaseBehaviorV1
>;
export type CampaignCapacityV1 = z.infer<typeof campaignCapacityV1>;
export type CampaignDefinitionV1 = z.infer<typeof campaignDefinitionV1>;
export type CampaignPreviewV1 = z.infer<typeof campaignPreviewV1>;
export type CampaignPurchaseCandidateV1 = z.infer<
  typeof campaignPurchaseCandidateV1
>;
export type CampaignPurchaseDecisionV1 = z.infer<
  typeof campaignPurchaseDecisionV1
>;
export type CampaignPurchaseEvaluationV1 = z.infer<
  typeof campaignPurchaseEvaluationV1
>;
