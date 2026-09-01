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

export const smtpTemplateEventTypeV1 = z.enum([
  "loyalty.points.earned",
  "loyalty.points.released",
  "loyalty.points.expiring",
  "loyalty.reward.changed",
  "loyalty.tier.changed",
  "loyalty.referral.changed",
]);

export const smtpTemplateTokensV1 = {
  "loyalty.points.earned": ["points", "pendingUntil"],
  "loyalty.points.released": ["points", "availableBalance"],
  "loyalty.points.expiring": ["points", "expiresAt", "daysRemaining"],
  "loyalty.reward.changed": ["rewardReservationId", "rewardCode", "state"],
  "loyalty.tier.changed": ["fromTierCode", "toTierCode", "effectiveAt"],
  "loyalty.referral.changed": ["referralId", "party", "state"],
} as const satisfies Record<
  z.infer<typeof smtpTemplateEventTypeV1>,
  readonly string[]
>;

const templateSubject = z
  .string()
  .min(1)
  .max(200)
  .refine((value) => !/[\u0000-\u001F\u007F]/u.test(value), {
    message: "Template subject contains a control character",
  });
const templateText = z
  .string()
  .min(1)
  .max(4_000)
  .refine(
    (value) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value),
    { message: "Template body contains a control character" },
  )
  .refine((value) => !/[<>]/u.test(value), {
    message: "Template body cannot contain markup",
  })
  .refine((value) => !/(?:[a-z][a-z0-9+.-]*:\/\/|\bwww\.)/iu.test(value), {
    message: "Template body cannot contain a URL",
  });
const templateToken = z.string().regex(/^[a-z][A-Za-z0-9]{0,79}$/u);

function templateTokensAreAllowed(
  eventType: z.infer<typeof smtpTemplateEventTypeV1>,
  ...templates: readonly string[]
): boolean {
  const allowed = new Set<string>(smtpTemplateTokensV1[eventType]);
  return templates.every((template) => {
    let remainder = template;
    for (const match of template.matchAll(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/gu)) {
      if (!allowed.has(match[1] ?? "")) return false;
      remainder = remainder.replace(match[0], "");
    }
    return !remainder.includes("{{") && !remainder.includes("}}");
  });
}

export const notificationEmailTemplateContentV1 = z
  .object({
    eventType: smtpTemplateEventTypeV1,
    subjectTemplate: templateSubject,
    textTemplate: templateText,
  })
  .strict()
  .refine(
    (template) =>
      templateTokensAreAllowed(
        template.eventType,
        template.subjectTemplate,
        template.textTemplate,
      ),
    { message: "Template contains an unsupported or malformed token" },
  );

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
export const notificationEventTypeV1 = z.enum([
  "loyalty.points.earned",
  "loyalty.points.released",
  "loyalty.points.expiring",
  "loyalty.reward.changed",
  "loyalty.tier.changed",
  "loyalty.referral.changed",
  "loyalty.campaign.effect",
  "loyalty.connector.health",
  "loyalty.billing.changed",
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

export const klaviyoApiRevisionV1 = z.literal("2026-07-15");
const providerIdentifier = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_-]+$/u);

export const klaviyoCustomerNotificationEventV1 = z.discriminatedUnion(
  "eventType",
  [
    pointsEarnedNotificationEventV1,
    pointsReleasedNotificationEventV1,
    pointsExpiringNotificationEventV1,
    rewardChangedNotificationEventV1,
    tierChangedNotificationEventV1,
    referralChangedNotificationEventV1,
    campaignEffectNotificationEventV1,
  ],
);

export const klaviyoNotificationOperationClaimV1 = z
  .object({
    schemaVersion: z.literal("1"),
    operationId: z.uuid(),
    operationKind: z.enum(["event_sync", "consent_sync"]),
    leaseExpiresAt: instant,
  })
  .strict();

const klaviyoPreparationUnavailableV1 = z
  .object({
    schemaVersion: z.literal("1"),
    operationId: z.uuid(),
    outcome: z.enum([
      "held",
      "suppressed",
      "superseded",
      "contact_unavailable",
    ]),
  })
  .strict();

const klaviyoPreparationCommon = {
  schemaVersion: z.literal("1"),
  operationId: z.uuid(),
  outcome: z.literal("authorized"),
  attempt: z.number().int().min(1).max(10),
  recipientEmail: z.email().max(320),
  externalCustomerId: z.uuid(),
  providerProfileId: providerIdentifier.nullable(),
  apiRevision: klaviyoApiRevisionV1,
  listId: providerIdentifier.nullable(),
};

const klaviyoEventPreparationAuthorizedV1 = z
  .object({
    ...klaviyoPreparationCommon,
    operationKind: z.literal("event_sync"),
    event: klaviyoCustomerNotificationEventV1,
  })
  .strict();

const klaviyoConsentPreparationAuthorizedV1 = z
  .object({
    ...klaviyoPreparationCommon,
    operationKind: z.literal("consent_sync"),
    preferenceEventId: z.uuid(),
    desiredState: z.enum(["subscribed", "unsubscribed"]),
    effectiveAt: instant,
  })
  .strict();

export const klaviyoNotificationPreparationV1 = z.union([
  klaviyoPreparationUnavailableV1,
  klaviyoEventPreparationAuthorizedV1,
  klaviyoConsentPreparationAuthorizedV1,
]);

const klaviyoActionUnavailableV1 = z
  .object({
    schemaVersion: z.literal("1"),
    operationId: z.uuid(),
    outcome: z.enum(["held", "suppressed", "superseded"]),
  })
  .strict();

const klaviyoActionAuthorizedV1 = z
  .object({
    schemaVersion: z.literal("1"),
    operationId: z.uuid(),
    outcome: z.literal("authorized"),
    action: z.enum(["event", "subscribe", "unsubscribe"]),
    providerProfileId: providerIdentifier,
  })
  .strict();

export const klaviyoNotificationActionAuthorizationV1 = z.discriminatedUnion(
  "outcome",
  [klaviyoActionUnavailableV1, klaviyoActionAuthorizedV1],
);

export const webhookDestinationUrlV1 = z
  .url()
  .max(2_048)
  .refine((value) => {
    const destination = new URL(value);
    if (
      destination.username !== "" ||
      destination.password !== "" ||
      destination.search !== "" ||
      destination.hash !== ""
    ) {
      return false;
    }
    if (destination.protocol === "https:") {
      return (
        (destination.port === "" || destination.port === "443") &&
        /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u.test(
          destination.hostname,
        ) &&
        value.startsWith(`${destination.origin}/`)
      );
    }
    return (
      destination.protocol === "http:" &&
      (destination.hostname === "127.0.0.1" ||
        destination.hostname === "localhost" ||
        destination.hostname === "[::1]")
    );
  }, "Webhook destination must be HTTPS without credentials, query, or fragment");

export const webhookNotificationDeliveryClaimV1 = z
  .object({
    schemaVersion: z.literal("1"),
    deliveryId: z.uuid(),
    leaseExpiresAt: instant,
  })
  .strict();

const webhookDispatchUnavailableV1 = z
  .object({
    schemaVersion: z.literal("1"),
    deliveryId: z.uuid(),
    outcome: z.enum(["held", "suppressed", "dead_letter"]),
  })
  .strict();

const webhookDispatchAuthorizedV1 = z
  .object({
    schemaVersion: z.literal("1"),
    deliveryId: z.uuid(),
    outcome: z.literal("authorized"),
    attempt: z.number().int().min(1).max(10),
    destinationUrl: webhookDestinationUrlV1,
    event: notificationEventV1,
  })
  .strict();

export const webhookNotificationDispatchAuthorizationV1 = z.discriminatedUnion(
  "outcome",
  [webhookDispatchUnavailableV1, webhookDispatchAuthorizedV1],
);

const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/u);
const commandKey = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9:_-]+$/u);

export const merchantNotificationEmailTemplateV1 = z
  .object({
    schemaVersion: z.literal("1"),
    templateId: z.uuid(),
    templateCode: code,
    eventType: smtpTemplateEventTypeV1,
    locale: z.literal("en"),
    source: z.enum(["system", "organization"]),
    templateVersion: z.number().int().positive(),
    templateSha256: sha256Hex,
    subjectTemplate: templateSubject,
    textTemplate: templateText,
    htmlTemplate: z.string().min(1).max(8_000),
    allowedTokens: z.array(templateToken).min(2).max(3),
    publishedAt: instant,
  })
  .strict()
  .superRefine((template, context) => {
    const expected = smtpTemplateTokensV1[template.eventType];
    if (
      template.allowedTokens.length !== expected.length ||
      template.allowedTokens.some((token, index) => token !== expected[index])
    ) {
      context.addIssue({
        code: "custom",
        path: ["allowedTokens"],
        message: "Template tokens do not match the event type",
      });
    }
    if (
      !templateTokensAreAllowed(
        template.eventType,
        template.subjectTemplate,
        template.textTemplate,
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["textTemplate"],
        message: "Template contains an unsupported or malformed token",
      });
    }
  });

const notificationHealthCountsV1 = z
  .object({
    subscribed: nonNegativeBigint,
    unsubscribed: nonNegativeBigint,
    suppressed: nonNegativeBigint,
  })
  .strict();

export const merchantNotificationProviderHealthV1 = z
  .object({
    provider: z.enum(["smtp", "klaviyo", "webhook"]),
    enabled: z.boolean(),
    pending: nonNegativeBigint,
    processing: nonNegativeBigint,
    retryable: nonNegativeBigint,
    held: nonNegativeBigint,
    completed: nonNegativeBigint,
    suppressed: nonNegativeBigint,
    contactUnavailable: nonNegativeBigint,
    deadLetter: nonNegativeBigint,
    manualReview: nonNegativeBigint,
    oldestOutstandingAt: instant.nullable(),
  })
  .strict();

export const merchantNotificationIssueV1 = z
  .object({
    provider: z.enum(["smtp", "klaviyo", "webhook"]),
    kind: z.enum(["delivery", "operation", "test"]),
    referenceId: z.uuid(),
    eventType: notificationEventTypeV1.nullable(),
    state: z.enum(["contact_unavailable", "dead_letter", "manual_review"]),
    attemptCount: z.number().int().min(0).max(10),
    errorCode: code.nullable(),
    updatedAt: instant,
  })
  .strict();

export const merchantNotificationWorkspaceV1 = z
  .object({
    schemaVersion: z.literal("1"),
    generatedAt: instant,
    deploymentMode: z.enum(["self_hosted", "managed"]),
    entitlementEnabled: z.boolean(),
    templates: z.array(merchantNotificationEmailTemplateV1).length(6),
    consent: z
      .object({
        activeCustomers: nonNegativeBigint,
        loyaltyTransactional: notificationHealthCountsV1,
        loyaltyMarketing: notificationHealthCountsV1,
      })
      .strict(),
    providers: z.array(merchantNotificationProviderHealthV1).length(3),
    issues: z.array(merchantNotificationIssueV1).max(100),
  })
  .strict()
  .superRefine((workspace, context) => {
    const providers = new Set(workspace.providers.map((item) => item.provider));
    if (
      providers.size !== 3 ||
      !providers.has("smtp") ||
      !providers.has("klaviyo") ||
      !providers.has("webhook")
    ) {
      context.addIssue({
        code: "custom",
        path: ["providers"],
        message: "Provider health must contain each provider exactly once",
      });
    }
    const eventTypes = new Set(
      workspace.templates.map((template) => template.eventType),
    );
    if (eventTypes.size !== smtpTemplateEventTypeV1.options.length) {
      context.addIssue({
        code: "custom",
        path: ["templates"],
        message: "Template catalogue must contain each event type exactly once",
      });
    }
  });

export const merchantPublishNotificationTemplateCommandV1 = z
  .object({
    version: z.literal("1"),
    workspaceId: z.uuid(),
    eventType: smtpTemplateEventTypeV1,
    subjectTemplate: templateSubject,
    textTemplate: templateText,
    idempotencyKey: commandKey,
    correlationId: z.uuid(),
  })
  .strict()
  .refine(
    (command) =>
      templateTokensAreAllowed(
        command.eventType,
        command.subjectTemplate,
        command.textTemplate,
      ),
    { message: "Template contains an unsupported or malformed token" },
  );

export const merchantPublishNotificationTemplateResultV1 = z
  .object({
    templateId: z.uuid(),
    templateVersion: z.number().int().positive(),
    outcome: z.enum(["created", "duplicate"]),
  })
  .strict();

export const merchantSendNotificationTestCommandV1 = z
  .object({
    version: z.literal("1"),
    workspaceId: z.uuid(),
    eventType: smtpTemplateEventTypeV1,
    idempotencyKey: commandKey,
    correlationId: z.uuid(),
  })
  .strict();

export const merchantSendNotificationTestResultV1 = z
  .object({
    testDeliveryId: z.uuid(),
    state: z.enum([
      "pending",
      "processing",
      "retryable",
      "held",
      "delivered",
      "contact_unavailable",
      "dead_letter",
      "manual_review",
    ]),
    outcome: z.enum(["created", "duplicate"]),
  })
  .strict();

const webhookEndpointLabelV1 = z
  .string()
  .min(1)
  .max(120)
  .refine(
    (value) => value === value.trim() && !/[\u0000-\u001F\u007F]/u.test(value),
    { message: "Webhook endpoint label must be a trimmed single line" },
  );
const webhookLifecycleReasonV1 = z
  .string()
  .min(1)
  .max(200)
  .refine(
    (value) => value === value.trim() && !/[\u0000-\u001F\u007F]/u.test(value),
    { message: "Webhook lifecycle reason must be a trimmed single line" },
  );
const productionWebhookDestinationV1 = webhookDestinationUrlV1.refine(
  (value) => new URL(value).protocol === "https:",
  "Merchant webhook destinations must use HTTPS",
);
const webhookEventSubscriptionsV1 = z
  .array(notificationEventTypeV1)
  .min(1)
  .max(9)
  .refine(
    (items) =>
      items.every((item, index) => index === 0 || items[index - 1]! < item),
    "Webhook event subscriptions must be unique and sorted",
  );

export const createNotificationWebhookEndpointCommandV1 = z
  .object({
    version: z.literal("1"),
    workspaceId: z.uuid(),
    label: webhookEndpointLabelV1,
    destinationUrl: productionWebhookDestinationV1,
    eventTypes: webhookEventSubscriptionsV1,
    rateLimitPerMinute: z.number().int().min(1).max(600),
    idempotencyKey: commandKey,
    correlationId: z.uuid(),
  })
  .strict();

export const rotateNotificationWebhookEndpointCommandV1 = z
  .object({
    version: z.literal("1"),
    endpointId: z.uuid(),
    overlapSeconds: z.number().int().min(0).max(86_400),
    idempotencyKey: commandKey,
    correlationId: z.uuid(),
  })
  .strict();

export const changeNotificationWebhookEndpointStateCommandV1 = z
  .object({
    version: z.literal("1"),
    endpointId: z.uuid(),
    action: z.enum(["disable", "retire"]),
    reason: webhookLifecycleReasonV1,
    idempotencyKey: commandKey,
    correlationId: z.uuid(),
  })
  .strict();

export const notificationWebhookEndpointMutationResultV1 = z
  .object({
    endpointId: z.uuid(),
    state: z.enum(["disabled", "active", "retired"]),
    outcome: z.enum([
      "created",
      "rotated",
      "disabled",
      "retired",
      "already_disabled",
      "already_retired",
      "duplicate",
    ]),
    priorSecretExpiresAt: instant.nullable(),
  })
  .strict();

const notificationWebhookEndpointCountsV1 = z
  .object({
    pending: nonNegativeBigint,
    processing: nonNegativeBigint,
    retryable: nonNegativeBigint,
    held: nonNegativeBigint,
    completed: nonNegativeBigint,
    suppressed: nonNegativeBigint,
    deadLetter: nonNegativeBigint,
    manualReview: nonNegativeBigint,
  })
  .strict();

export const notificationWebhookEndpointReadV1 = z
  .object({
    schemaVersion: z.literal("1"),
    endpointId: z.uuid(),
    label: webhookEndpointLabelV1,
    state: z.enum(["disabled", "active", "retired"]),
    destinationUrl: productionWebhookDestinationV1.nullable(),
    eventTypes: webhookEventSubscriptionsV1,
    rateLimitPerMinute: z.number().int().min(1).max(600),
    currentSecretHint: z
      .string()
      .regex(/^[A-Za-z0-9_-]{6}$/u)
      .nullable(),
    previousSecretHint: z
      .string()
      .regex(/^[A-Za-z0-9_-]{6}$/u)
      .nullable(),
    previousSecretExpiresAt: instant.nullable(),
    counts: notificationWebhookEndpointCountsV1,
    lastAttemptAt: instant.nullable(),
    lastErrorCode: code.nullable(),
    createdAt: instant,
    updatedAt: instant,
    retiredAt: instant.nullable(),
  })
  .strict();

export const notificationWebhookEndpointsDocumentV1 = z
  .object({
    schemaVersion: z.literal("1"),
    generatedAt: instant,
    canManage: z.boolean(),
    endpoints: z.array(notificationWebhookEndpointReadV1).max(50),
  })
  .strict();

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
export type KlaviyoCustomerNotificationEventV1 = z.infer<
  typeof klaviyoCustomerNotificationEventV1
>;
export type KlaviyoNotificationOperationClaimV1 = z.infer<
  typeof klaviyoNotificationOperationClaimV1
>;
export type KlaviyoNotificationPreparationV1 = z.infer<
  typeof klaviyoNotificationPreparationV1
>;
export type KlaviyoNotificationActionAuthorizationV1 = z.infer<
  typeof klaviyoNotificationActionAuthorizationV1
>;
export type WebhookNotificationDeliveryClaimV1 = z.infer<
  typeof webhookNotificationDeliveryClaimV1
>;
export type WebhookNotificationDispatchAuthorizationV1 = z.infer<
  typeof webhookNotificationDispatchAuthorizationV1
>;
export type MerchantNotificationEmailTemplateV1 = z.infer<
  typeof merchantNotificationEmailTemplateV1
>;
export type MerchantNotificationProviderHealthV1 = z.infer<
  typeof merchantNotificationProviderHealthV1
>;
export type MerchantNotificationIssueV1 = z.infer<
  typeof merchantNotificationIssueV1
>;
export type MerchantNotificationWorkspaceV1 = z.infer<
  typeof merchantNotificationWorkspaceV1
>;
export type MerchantPublishNotificationTemplateCommandV1 = z.infer<
  typeof merchantPublishNotificationTemplateCommandV1
>;
export type MerchantPublishNotificationTemplateResultV1 = z.infer<
  typeof merchantPublishNotificationTemplateResultV1
>;
export type MerchantSendNotificationTestCommandV1 = z.infer<
  typeof merchantSendNotificationTestCommandV1
>;
export type MerchantSendNotificationTestResultV1 = z.infer<
  typeof merchantSendNotificationTestResultV1
>;
export type CreateNotificationWebhookEndpointCommandV1 = z.infer<
  typeof createNotificationWebhookEndpointCommandV1
>;
export type RotateNotificationWebhookEndpointCommandV1 = z.infer<
  typeof rotateNotificationWebhookEndpointCommandV1
>;
export type ChangeNotificationWebhookEndpointStateCommandV1 = z.infer<
  typeof changeNotificationWebhookEndpointStateCommandV1
>;
export type NotificationWebhookEndpointMutationResultV1 = z.infer<
  typeof notificationWebhookEndpointMutationResultV1
>;
export type NotificationWebhookEndpointReadV1 = z.infer<
  typeof notificationWebhookEndpointReadV1
>;
export type NotificationWebhookEndpointsDocumentV1 = z.infer<
  typeof notificationWebhookEndpointsDocumentV1
>;
