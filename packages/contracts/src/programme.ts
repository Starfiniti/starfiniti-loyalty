import { z } from "zod";

const bigintString = z.string().regex(/^(?:0|[1-9][0-9]*)$/u);
const positiveBigintString = z.string().regex(/^[1-9][0-9]*$/u);
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/u);
const timestamp = z.iso.datetime({ offset: true });
const operationKey = z.string().min(1).max(255);
const code = z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/u);
const programmeSlug = z
  .string()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);

export const programmeTierDefinitionV1 = z.object({
  code,
  name: z.string().trim().min(1).max(200),
  minimumEligibleSpendMinor: bigintString,
  pointsPerMajorUnit: positiveBigintString,
});

export const programmeRewardKind = z.enum([
  "fixed_discount",
  "percentage_discount",
  "free_product",
  "free_shipping",
  "store_credit",
  "exclusive_access",
  "custom",
]);

export const programmeRewardDefinitionV1 = z.object({
  code,
  name: z.string().trim().min(1).max(200),
  kind: programmeRewardKind,
  costPoints: positiveBigintString,
  configuration: z.record(z.string(), z.unknown()).default({}),
});

export const programmeDefinitionV1 = z
  .object({
    version: z.literal("1"),
    tiers: z.array(programmeTierDefinitionV1).min(1),
    rewards: z.array(programmeRewardDefinitionV1).default([]),
  })
  .superRefine((definition, context) => {
    const tierCodes = new Set<string>();
    let previousMinimum = -1n;
    definition.tiers.forEach((tier, index) => {
      if (tierCodes.has(tier.code)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate tier code: ${tier.code}`,
          path: ["tiers", index, "code"],
        });
      }
      tierCodes.add(tier.code);
      const minimum = BigInt(tier.minimumEligibleSpendMinor);
      if ((index === 0 && minimum !== 0n) || minimum <= previousMinimum) {
        context.addIssue({
          code: "custom",
          message: "Tier thresholds must start at zero and increase",
          path: ["tiers", index, "minimumEligibleSpendMinor"],
        });
      }
      previousMinimum = minimum;
    });
    const rewardCodes = new Set<string>();
    definition.rewards.forEach((reward, index) => {
      if (rewardCodes.has(reward.code)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate reward code: ${reward.code}`,
          path: ["rewards", index, "code"],
        });
      }
      rewardCodes.add(reward.code);
    });
  });

export const createProgrammeDraftCommandV1 = z.object({
  version: z.literal("1"),
  organizationId: positiveBigintString,
  programmeId: positiveBigintString,
  configurationSha256: sha256Hex,
  configuration: programmeDefinitionV1,
  createdByUserId: z.uuid(),
});

export const publishProgrammeVersionCommandV1 = z.object({
  version: z.literal("1"),
  programmeVersionId: z.uuid(),
  expectedConfigurationSha256: sha256Hex,
  approvedByUserId: z.uuid(),
  publishAt: timestamp,
});

export const scheduleProgrammeVersionCommandV1 =
  publishProgrammeVersionCommandV1.omit({ publishAt: true }).extend({
    scheduledFor: timestamp,
  });

const merchantCommandIdentityV1 = z.object({
  version: z.literal("1"),
  idempotencyKey: operationKey,
  correlationId: z.uuid(),
});

export const merchantCreateProgrammeCommandV1 = merchantCommandIdentityV1
  .extend({
    programmeGroupId: z.uuid(),
    slug: programmeSlug,
    name: z.string().trim().min(1).max(200),
  })
  .strict();

export const merchantCreateProgrammeDraftCommandV1 = merchantCommandIdentityV1
  .extend({
    programmeId: z.uuid(),
    configuration: programmeDefinitionV1,
  })
  .strict();

export const merchantPublishProgrammeVersionCommandV1 =
  merchantCommandIdentityV1
    .extend({
      programmeVersionId: z.uuid(),
      expectedConfigurationSha256: sha256Hex,
    })
    .strict();

export const merchantScheduleProgrammeVersionCommandV1 =
  merchantPublishProgrammeVersionCommandV1
    .extend({
      scheduledFor: timestamp,
    })
    .strict();

export const merchantProgrammeDraftResultV1 = z.object({
  resourceId: z.uuid(),
  outcome: z.enum(["created", "duplicate"]),
  configurationSha256: sha256Hex,
  versionNumber: z.number().int().positive(),
});

export const merchantProgrammeCreateResultV1 = z.object({
  resourceId: z.uuid(),
  outcome: z.enum(["created", "duplicate"]),
});

export const merchantProgrammePublishResultV1 = z.object({
  resourceId: z.uuid(),
  outcome: z.enum(["created", "duplicate"]),
  effectiveAt: timestamp,
});

export const programmeEvaluationEvidenceV1 = z.object({
  version: z.literal("1"),
  organizationId: positiveBigintString,
  programmeGroupId: positiveBigintString,
  programmeVersionId: positiveBigintString,
  canonicalEventId: positiveBigintString.nullable(),
  kind: z.enum(["live_award", "live_refund", "simulation", "tier_review"]),
  subjectReference: z.string().min(1).max(500),
  idempotencyKey: operationKey,
  inputSha256: sha256Hex,
  resultSha256: sha256Hex,
  evaluatedAt: timestamp,
  result: z.record(z.string(), z.unknown()),
  explanation: z.record(z.string(), z.unknown()),
});

export const rewardReservationCommandV1 = z.object({
  version: z.literal("1"),
  organizationId: positiveBigintString,
  programmeGroupId: positiveBigintString,
  programmeVersionId: positiveBigintString,
  walletId: positiveBigintString,
  rewardId: positiveBigintString,
  costPoints: positiveBigintString,
  expiresAt: timestamp,
  idempotencyKey: operationKey,
  requestSha256: sha256Hex,
});

export const rewardReservationState = z.enum([
  "requested",
  "reserved",
  "issued",
  "captured",
  "cancelled",
  "expired",
  "failed",
  "released",
]);

export const rewardTransitionCommandV1 = z.object({
  version: z.literal("1"),
  reservationId: z.uuid(),
  toState: rewardReservationState,
  idempotencyKey: operationKey,
  requestSha256: sha256Hex,
  actorId: z.string().min(1).max(255),
  reason: z.string().trim().min(8).max(1000).nullable(),
  ledgerTransactionId: z.uuid().nullable(),
  connectorExecutionReference: z.string().min(1).max(500).nullable(),
});

export const programmeCommandResultV1 = z.object({
  version: z.literal("1"),
  resourceId: z.uuid(),
  outcome: z.enum(["created", "duplicate"]),
});

export type ProgrammeDefinitionV1 = z.infer<typeof programmeDefinitionV1>;
export type MerchantCreateProgrammeDraftCommandV1 = z.infer<
  typeof merchantCreateProgrammeDraftCommandV1
>;
export type MerchantCreateProgrammeCommandV1 = z.infer<
  typeof merchantCreateProgrammeCommandV1
>;
export type MerchantPublishProgrammeVersionCommandV1 = z.infer<
  typeof merchantPublishProgrammeVersionCommandV1
>;
export type MerchantScheduleProgrammeVersionCommandV1 = z.infer<
  typeof merchantScheduleProgrammeVersionCommandV1
>;
export type ProgrammeEvaluationEvidenceV1 = z.infer<
  typeof programmeEvaluationEvidenceV1
>;
export type RewardTransitionCommandV1 = z.infer<
  typeof rewardTransitionCommandV1
>;
