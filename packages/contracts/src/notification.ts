import { z } from "zod";

const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;
const code = z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/u);
const nonNegativeBigint = z
  .string()
  .regex(/^(?:0|[1-9][0-9]*)$/u)
  .refine((value) => BigInt(value) <= POSTGRES_BIGINT_MAX, {
    message: "Value exceeds PostgreSQL bigint capacity",
  });
const positiveBigint = nonNegativeBigint.refine((value) => value !== "0", {
  message: "Value must be positive",
});
const instant = z.iso.datetime({ offset: true });

export const notificationCustomerPurposeV1 = z.enum([
  "loyalty_transactional",
  "loyalty_marketing",
]);
export const notificationPurposeV1 = z.enum([
  ...notificationCustomerPurposeV1.options,
  "merchant_operational",
]);
export const notificationPreferenceStateV1 = z.enum([
  "subscribed",
  "unsubscribed",
  "suppressed",
]);

const common = {
  schemaVersion: z.literal("1"),
  eventId: z.uuid(),
  organizationId: z.uuid(),
  programmeGroupId: z.uuid().nullable(),
  locale: z.literal("en"),
  occurredAt: instant,
};
const customerSubject = z
  .object({ kind: z.literal("customer"), customerId: z.uuid() })
  .strict();
const merchantSubject = z.object({ kind: z.literal("merchant") }).strict();

export const pointsEarnedNotificationEventV1 = z
  .object({
    ...common,
    eventType: z.literal("loyalty.points.earned"),
    purpose: z.literal("loyalty_transactional"),
    subject: customerSubject,
    payload: z
      .object({
        points: positiveBigint,
        pendingUntil: instant.nullable(),
      })
      .strict(),
  })
  .strict();

export const pointsReleasedNotificationEventV1 = z
  .object({
    ...common,
    eventType: z.literal("loyalty.points.released"),
    purpose: z.literal("loyalty_transactional"),
    subject: customerSubject,
    payload: z
      .object({ points: positiveBigint, availableBalance: nonNegativeBigint })
      .strict(),
  })
  .strict();

export const pointsExpiringNotificationEventV1 = z
  .object({
    ...common,
    eventType: z.literal("loyalty.points.expiring"),
    purpose: z.literal("loyalty_transactional"),
    subject: customerSubject,
    payload: z
      .object({
        points: positiveBigint,
        expiresAt: instant,
        daysRemaining: z.number().int().min(1).max(3650),
      })
      .strict(),
  })
  .strict();

export const rewardChangedNotificationEventV1 = z
  .object({
    ...common,
    eventType: z.literal("loyalty.reward.changed"),
    purpose: z.literal("loyalty_transactional"),
    subject: customerSubject,
    payload: z
      .object({
        rewardReservationId: z.uuid(),
        rewardCode: code,
        state: z.enum([
          "reserved",
          "issued",
          "redeemed",
          "expired",
          "cancelled",
          "failed",
          "manual_review",
        ]),
      })
      .strict(),
  })
  .strict();

export const tierChangedNotificationEventV1 = z
  .object({
    ...common,
    eventType: z.literal("loyalty.tier.changed"),
    purpose: z.literal("loyalty_transactional"),
    subject: customerSubject,
    payload: z
      .object({
        fromTierCode: code.nullable(),
        toTierCode: code,
        effectiveAt: instant,
      })
      .strict(),
  })
  .strict();

export const referralChangedNotificationEventV1 = z
  .object({
    ...common,
    eventType: z.literal("loyalty.referral.changed"),
    purpose: z.literal("loyalty_transactional"),
    subject: customerSubject,
    payload: z
      .object({
        referralId: z.uuid(),
        party: z.enum(["advocate", "friend"]),
        state: z.enum([
          "captured",
          "pending_review",
          "cooling",
          "qualified",
          "blocked",
          "rejected",
          "reversed",
        ]),
      })
      .strict(),
  })
  .strict();

export const campaignEffectNotificationEventV1 = z
  .object({
    ...common,
    eventType: z.literal("loyalty.campaign.effect"),
    purpose: z.literal("loyalty_marketing"),
    subject: customerSubject,
    payload: z
      .object({
        campaignVersionId: z.uuid(),
        outcome: z.enum([
          "points_awarded",
          "reward_reserved",
          "control",
          "capacity_exhausted",
          "suppressed",
        ]),
        points: nonNegativeBigint,
      })
      .strict(),
  })
  .strict();

export const connectorHealthNotificationEventV1 = z
  .object({
    ...common,
    eventType: z.literal("loyalty.connector.health"),
    purpose: z.literal("merchant_operational"),
    subject: merchantSubject,
    payload: z
      .object({
        connectionId: z.uuid(),
        state: z.enum(["healthy", "degraded", "offline", "action_required"]),
        errorCode: code.nullable(),
      })
      .strict(),
  })
  .strict();

export const billingChangedNotificationEventV1 = z
  .object({
    ...common,
    eventType: z.literal("loyalty.billing.changed"),
    purpose: z.literal("merchant_operational"),
    subject: merchantSubject,
    payload: z
      .object({
        state: z.enum([
          "trial",
          "active",
          "past_due",
          "grace",
          "suspended",
          "cancelled",
          "contract_managed",
        ]),
      })
      .strict(),
  })
  .strict();

export const notificationEventV1 = z.discriminatedUnion("eventType", [
  pointsEarnedNotificationEventV1,
  pointsReleasedNotificationEventV1,
  pointsExpiringNotificationEventV1,
  rewardChangedNotificationEventV1,
  tierChangedNotificationEventV1,
  referralChangedNotificationEventV1,
  campaignEffectNotificationEventV1,
  connectorHealthNotificationEventV1,
  billingChangedNotificationEventV1,
]);

export const smtpTransactionalNotificationEventV1 = z.discriminatedUnion(
  "eventType",
  [
    pointsEarnedNotificationEventV1,
    pointsReleasedNotificationEventV1,
    pointsExpiringNotificationEventV1,
    rewardChangedNotificationEventV1,
    tierChangedNotificationEventV1,
    referralChangedNotificationEventV1,
  ],
);

export const smtpNotificationDeliveryClaimV1 = z
  .object({
    schemaVersion: z.literal("1"),
    deliveryId: z.uuid(),
    leaseExpiresAt: instant,
  })
  .strict();

const smtpDispatchUnavailableV1 = z
  .object({
    schemaVersion: z.literal("1"),
    deliveryId: z.uuid(),
    outcome: z.enum(["held", "suppressed", "contact_unavailable"]),
  })
  .strict();

const smtpDispatchAuthorizedV1 = z
  .object({
    schemaVersion: z.literal("1"),
    deliveryId: z.uuid(),
    outcome: z.literal("authorized"),
    attempt: z.number().int().min(1).max(10),
    recipientEmail: z.email().max(320),
    templateCode: code,
    templateVersion: z.number().int().positive(),
    templateSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    subjectTemplate: z.string().min(1).max(200),
    textTemplate: z.string().min(1).max(4_000),
    htmlTemplate: z.string().min(1).max(8_000),
    event: smtpTransactionalNotificationEventV1,
  })
  .strict();

export const smtpNotificationDispatchAuthorizationV1 = z.discriminatedUnion(
  "outcome",
  [smtpDispatchUnavailableV1, smtpDispatchAuthorizedV1],
);

export const notificationPreferenceV1 = z
  .object({
    schemaVersion: z.literal("1"),
    accountId: z.uuid(),
    channel: z.literal("email"),
    purpose: notificationCustomerPurposeV1,
    state: notificationPreferenceStateV1,
    policyVersion: code,
    effectiveAt: instant.nullable(),
  })
  .strict();

export type NotificationEventV1 = z.infer<typeof notificationEventV1>;
export type NotificationPreferenceV1 = z.infer<typeof notificationPreferenceV1>;
export type SmtpTransactionalNotificationEventV1 = z.infer<
  typeof smtpTransactionalNotificationEventV1
>;
export type SmtpNotificationDeliveryClaimV1 = z.infer<
  typeof smtpNotificationDeliveryClaimV1
>;
export type SmtpNotificationDispatchAuthorizationV1 = z.infer<
  typeof smtpNotificationDispatchAuthorizationV1
>;
