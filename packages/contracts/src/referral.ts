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

export const createMyReferralLinkResultV1 = z
  .object({
    advocateCode: z.uuid(),
    shareUrl: z.url().refine((value) => {
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
    }, "Use one HTTPS referral URL containing only stf_ref"),
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
