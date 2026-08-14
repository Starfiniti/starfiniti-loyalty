import { z } from "zod";

const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;
const nonNegativeBigintString = z
  .string()
  .regex(/^(?:0|[1-9][0-9]*)$/u)
  .refine((value) => BigInt(value) <= POSTGRES_BIGINT_MAX, {
    message: "Value exceeds PostgreSQL bigint capacity",
  });
const positiveBigintString = nonNegativeBigintString.refine(
  (value) => BigInt(value) > 0n,
  { message: "Value must be positive" },
);
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/u);
const operationKey = z.string().trim().min(1).max(255);
const reviewReason = z
  .string()
  .trim()
  .min(8)
  .max(1000)
  .refine(
    (value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value),
    {
      message: "Reason contains unsupported control characters",
    },
  );

export const referralRiskCodeV1 = z.enum([
  "self_referral",
  "advocate_monthly_limit",
  "source_network_velocity",
  "device_velocity",
  "reused_payment_evidence",
  "reused_shipping_evidence",
]);

export const referralAttributionStateV1 = z.enum([
  "captured",
  "pending_review",
  "blocked",
  "cooling",
  "qualified",
  "rejected",
  "reversed",
]);

export const referralQualificationDecisionV1 = z.enum([
  "eligible",
  "ineligible_minimum_spend",
  "ineligible_existing_customer",
  "review_held",
]);

export const referralRewardJobStateV1 = z.enum([
  "pending",
  "processing",
  "retryable",
  "completed",
  "cancelled",
  "manual_review",
]);

export const referralPointsRewardV1 = z
  .object({
    kind: z.literal("points"),
    points: positiveBigintString,
  })
  .strict();

export const referralRiskPolicyV1 = z
  .object({
    manualReviewEnabled: z.boolean(),
    rollingWindowHours: z.number().int().min(1).max(720),
    sourceNetworkReferralLimit: z.number().int().min(2).max(100),
    deviceReferralLimit: z.number().int().min(2).max(100),
  })
  .strict();

export const referralPolicyV1 = z
  .object({
    version: z.literal("1"),
    attributionWindowDays: z.number().int().min(1).max(90),
    qualificationStatus: z.enum(["processing", "completed"]),
    coolingDays: z.number().int().min(0).max(90),
    minimumEligibleSpendMinor: nonNegativeBigintString,
    requireNewCustomer: z.literal(true),
    monthlyAdvocateReferralLimit: z.number().int().min(1).max(1_000),
    advocateReward: referralPointsRewardV1,
    friendReward: referralPointsRewardV1,
    risk: referralRiskPolicyV1,
  })
  .strict();

export const referralAttributionEvidenceV1 = z
  .object({
    version: z.literal("1"),
    advocateCode: z.uuid(),
    capturedAt: z.iso.datetime({ offset: true }),
    sourceNetworkFingerprint: fingerprint.nullable(),
    deviceFingerprint: fingerprint.nullable(),
    paymentFingerprint: fingerprint.nullable(),
    shippingFingerprint: fingerprint.nullable(),
  })
  .strict();

export const createMyReferralLinkCommandV1 = z
  .object({
    version: z.literal("1"),
    accountId: z.uuid(),
    requestId: z.uuid(),
  })
  .strict();

const referralShareUrlV1 = z.url().refine((value) => {
  const parsed = new URL(value);
  return (
    parsed.protocol === "https:" &&
    parsed.username === "" &&
    parsed.password === "" &&
    parsed.hash === "" &&
    parsed.searchParams.size === 1 &&
    parsed.searchParams.has("stf_ref") &&
    z.uuid().safeParse(parsed.searchParams.get("stf_ref")).success
  );
}, "Use one HTTPS referral URL containing only stf_ref");

export const createMyReferralLinkResultV1 = z
  .object({
    advocateCode: z.uuid(),
    shareUrl: referralShareUrlV1,
    outcome: z.enum(["created", "duplicate"]),
  })
  .strict();

export const customerReferralHistoryItemV1 = z
  .object({
    referralId: z.uuid(),
    state: referralAttributionStateV1,
    rewardPoints: positiveBigintString,
    capturedAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
    availableAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict()
  .refine((item) => Date.parse(item.updatedAt) >= Date.parse(item.capturedAt), {
    message: "Referral update cannot precede capture",
    path: ["updatedAt"],
  });

export const customerReferralExperienceV1 = z
  .object({
    accountId: z.uuid(),
    sharingState: z.enum(["available", "active", "paused", "disabled"]),
    shareUrl: referralShareUrlV1.nullable(),
    advocateRewardPoints: positiveBigintString,
    friendRewardPoints: positiveBigintString,
    minimumEligibleSpendMinor: nonNegativeBigintString,
    currencyCode: z.string().regex(/^[A-Z]{3}$/u),
    currencyMinorUnitDigits: z.number().int().min(0).max(3),
    qualificationStatus: z.enum(["processing", "completed"]),
    coolingDays: z.number().int().min(0).max(90),
    counts: z
      .object({
        total: nonNegativeBigintString,
        pending: nonNegativeBigintString,
        qualified: nonNegativeBigintString,
        rejected: nonNegativeBigintString,
        reversed: nonNegativeBigintString,
      })
      .strict(),
    history: z.array(customerReferralHistoryItemV1).max(20),
  })
  .strict()
  .superRefine((experience, context) => {
    if (
      (experience.sharingState === "active") !==
      (experience.shareUrl !== null)
    ) {
      context.addIssue({
        code: "custom",
        message: "Only an active referral experience exposes a share URL",
        path: ["shareUrl"],
      });
    }
    const counted =
      BigInt(experience.counts.pending) +
      BigInt(experience.counts.qualified) +
      BigInt(experience.counts.rejected) +
      BigInt(experience.counts.reversed);
    if (counted !== BigInt(experience.counts.total)) {
      context.addIssue({
        code: "custom",
        message: "Referral status counts must reconcile",
        path: ["counts", "total"],
      });
    }
  });

const merchantReferralTopAdvocateV1 = z
  .object({
    customerId: z.uuid(),
    reference: z.string().trim().min(1).max(200),
    attributions: nonNegativeBigintString,
    qualified: nonNegativeBigintString,
    pointsIssued: nonNegativeBigintString,
  })
  .strict()
  .refine((item) => BigInt(item.qualified) <= BigInt(item.attributions), {
    message: "Qualified referrals cannot exceed attributions",
  });

const merchantReferralRecentItemV1 = z
  .object({
    referralId: z.uuid(),
    advocateReference: z.string().trim().min(1).max(200),
    friendReference: z.string().trim().min(1).max(200),
    sourceOrderReference: z.string().trim().min(1).max(255),
    state: referralAttributionStateV1,
    riskCodes: z.array(referralRiskCodeV1).max(6),
    capturedAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const merchantReferralDashboardV1 = z
  .object({
    programmeId: z.uuid(),
    lookbackDays: z.number().int().min(1).max(365),
    generatedAt: z.iso.datetime({ offset: true }),
    totals: z
      .object({
        advocates: nonNegativeBigintString,
        attributions: nonNegativeBigintString,
        pending: nonNegativeBigintString,
        qualified: nonNegativeBigintString,
        rejected: nonNegativeBigintString,
        reversed: nonNegativeBigintString,
        advocatePointsIssued: nonNegativeBigintString,
        friendPointsIssued: nonNegativeBigintString,
      })
      .strict(),
    topAdvocates: z.array(merchantReferralTopAdvocateV1).max(10),
    recent: z.array(merchantReferralRecentItemV1).max(20),
  })
  .strict()
  .superRefine((dashboard, context) => {
    const counted =
      BigInt(dashboard.totals.pending) +
      BigInt(dashboard.totals.qualified) +
      BigInt(dashboard.totals.rejected) +
      BigInt(dashboard.totals.reversed);
    if (counted !== BigInt(dashboard.totals.attributions)) {
      context.addIssue({
        code: "custom",
        message: "Referral funnel counts must reconcile",
        path: ["totals", "attributions"],
      });
    }
  });

const referralReviewCaseBaseV1 = z.object({
  reviewId: z.uuid(),
  attributionId: z.uuid(),
  advocateReference: z.string().trim().min(1).max(200),
  friendReference: z.string().trim().min(1).max(200),
  sourceOrderReference: z.string().trim().min(1).max(255),
  riskCodes: z.array(referralRiskCodeV1).max(6),
  qualificationDecision: referralQualificationDecisionV1.nullable(),
  coolingEndsAt: z.iso.datetime({ offset: true }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});

export const referralReviewCaseV1 = z.discriminatedUnion("kind", [
  referralReviewCaseBaseV1
    .extend({
      kind: z.literal("risk"),
      state: z.literal("pending_review"),
      attemptCount: z.null(),
      reviewCycle: z.null(),
      errorCode: z.null(),
    })
    .strict(),
  referralReviewCaseBaseV1
    .extend({
      kind: z.literal("reward"),
      state: z.literal("manual_review"),
      attemptCount: z.number().int().min(10).max(50),
      reviewCycle: z.number().int().min(0).max(4),
      errorCode: z.string().regex(/^[a-z][a-z0-9_.-]{0,99}$/u),
    })
    .strict(),
]);

export const merchantResolveReferralReviewCommandV1 = z
  .object({
    version: z.literal("1"),
    attributionId: z.uuid(),
    resolution: z.enum(["approved", "rejected"]),
    reason: reviewReason,
    idempotencyKey: operationKey,
    correlationId: z.uuid(),
  })
  .strict();

export const merchantResolveReferralReviewResultV1 = z
  .object({
    attributionId: z.uuid(),
    state: referralAttributionStateV1,
    outcome: z.enum(["created", "duplicate"]),
  })
  .strict();

export const merchantRetryReferralRewardCommandV1 = z
  .object({
    version: z.literal("1"),
    jobId: z.uuid(),
    reason: reviewReason,
    idempotencyKey: operationKey,
    correlationId: z.uuid(),
  })
  .strict();

export const merchantRetryReferralRewardResultV1 = z
  .object({
    jobId: z.uuid(),
    state: referralRewardJobStateV1,
    reviewCycle: z.number().int().min(0).max(4),
    outcome: z.enum(["created", "duplicate"]),
  })
  .strict();

export type ReferralPointsRewardV1 = z.infer<typeof referralPointsRewardV1>;
export type ReferralRiskPolicyV1 = z.infer<typeof referralRiskPolicyV1>;
export type ReferralPolicyV1 = z.infer<typeof referralPolicyV1>;
export type ReferralAttributionEvidenceV1 = z.infer<
  typeof referralAttributionEvidenceV1
>;
export type CreateMyReferralLinkCommandV1 = z.infer<
  typeof createMyReferralLinkCommandV1
>;
export type CreateMyReferralLinkResultV1 = z.infer<
  typeof createMyReferralLinkResultV1
>;
export type CustomerReferralHistoryItemV1 = z.infer<
  typeof customerReferralHistoryItemV1
>;
export type CustomerReferralExperienceV1 = z.infer<
  typeof customerReferralExperienceV1
>;
export type MerchantReferralDashboardV1 = z.infer<
  typeof merchantReferralDashboardV1
>;
export type ReferralRiskCodeV1 = z.infer<typeof referralRiskCodeV1>;
export type ReferralReviewCaseV1 = z.infer<typeof referralReviewCaseV1>;
export type MerchantResolveReferralReviewCommandV1 = z.infer<
  typeof merchantResolveReferralReviewCommandV1
>;
export type MerchantResolveReferralReviewResultV1 = z.infer<
  typeof merchantResolveReferralReviewResultV1
>;
export type MerchantRetryReferralRewardCommandV1 = z.infer<
  typeof merchantRetryReferralRewardCommandV1
>;
export type MerchantRetryReferralRewardResultV1 = z.infer<
  typeof merchantRetryReferralRewardResultV1
>;
