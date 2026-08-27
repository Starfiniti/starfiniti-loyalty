import { z } from "zod";

import { deploymentMode } from "./entitlements";

export const managedBillingCommercialState = z.enum([
  "self_hosted",
  "unconfigured",
  "trialing",
  "active",
  "past_due",
  "grace",
  "suspended",
  "cancelled",
  "contract_managed",
]);

export const managedBillingRestriction = z.enum(["none", "new_growth_only"]);

export const stripeBillingWebhookEventTypeV1 = z.enum([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.payment_action_required",
]);

export const stripeSubscriptionStatusV1 = z.enum([
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
]);

export const managedBillingSessionActionV1 = z.enum(["checkout", "portal"]);

export const managedBillingUsageMeterKeyV1 = z.enum([
  "orders",
  "active_members",
  "messages",
  "api_requests",
]);

const bigintDecimal = z.string().regex(/^-?(?:0|[1-9][0-9]*)$/u);
const nonNegativeBigintDecimal = z.string().regex(/^(?:0|[1-9][0-9]*)$/u);

export const managedBillingUsageMeterSummaryV1 = z
  .object({
    meterKey: managedBillingUsageMeterKeyV1,
    label: z.string().trim().min(2).max(80),
    quantity: nonNegativeBigintDecimal,
    dispatchedQuantity: bigintDecimal,
    factCount: nonNegativeBigintDecimal,
    pendingCount: nonNegativeBigintDecimal,
    attentionCount: nonNegativeBigintDecimal,
  })
  .strict();

export const managedBillingUsageSummaryV1 = z
  .object({
    schemaVersion: z.literal("1"),
    organizationId: z.uuid(),
    periodStart: z.iso.datetime({ offset: true }),
    periodEnd: z.iso.datetime({ offset: true }),
    measuredAt: z.iso.datetime({ offset: true }),
    dispatchMode: z.enum(["shadow", "configured"]),
    meters: z.array(managedBillingUsageMeterSummaryV1).length(4),
  })
  .strict()
  .superRefine((value, context) => {
    const periodStart = new Date(value.periodStart);
    const expectedStart = Date.UTC(
      periodStart.getUTCFullYear(),
      periodStart.getUTCMonth(),
      1,
    );
    const expectedEnd = Date.UTC(
      periodStart.getUTCFullYear(),
      periodStart.getUTCMonth() + 1,
      1,
    );
    if (periodStart.getTime() !== expectedStart) {
      context.addIssue({
        code: "custom",
        path: ["periodStart"],
        message: "usage period must start at a UTC month boundary",
      });
    }
    if (Date.parse(value.periodEnd) !== expectedEnd) {
      context.addIssue({
        code: "custom",
        path: ["periodEnd"],
        message: "usage period must cover exactly one UTC month",
      });
    }
    if (Date.parse(value.measuredAt) < expectedStart) {
      context.addIssue({
        code: "custom",
        path: ["measuredAt"],
        message: "usage measurement cannot precede its period",
      });
    }
    const keys = value.meters.map((meter) => meter.meterKey);
    if (new Set(keys).size !== 4) {
      context.addIssue({
        code: "custom",
        path: ["meters"],
        message: "usage summary requires each meter exactly once",
      });
    }
  });

export const managedBillingUsageDispatchClaimV1 = z
  .object({
    dispatchId: z.uuid(),
    leaseToken: z.uuid(),
    attemptNumber: z.number().int().min(1).max(10),
  })
  .strict();

export const managedBillingUsageDispatchAuthorityV1 = z
  .object({
    eventName: z.string().regex(/^[a-z][a-z0-9_]{1,99}$/u),
    customerId: z.string().regex(/^cus_[A-Za-z0-9]{8,120}$/u),
    identifier: z.string().regex(/^m14u_[a-f0-9]{32}$/u),
    quantity: z.string().regex(/^-?[1-9][0-9]*$/u),
    occurredAt: z.iso.datetime({ offset: true }),
    liveMode: z.boolean(),
  })
  .strict();

export const managedBillingUsageDispatchResultV1 = z
  .object({
    outcome: z.enum(["accepted", "retryable", "ambiguous", "rejected", "held"]),
    responseClass: z.enum([
      "success",
      "duplicate",
      "temporary_failure",
      "permanent_failure",
      "ambiguous",
      "policy",
    ]),
    responseCode: z.number().int().min(200).max(599).nullable(),
    errorCode: z
      .string()
      .regex(/^[a-z][a-z0-9_]{2,79}$/u)
      .nullable(),
  })
  .strict();

export const managedBillingPlanOptionV1 = z
  .object({
    schemaVersion: z.literal("1"),
    planId: z.uuid(),
    key: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/u),
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().min(8).max(240),
    currency: z.string().regex(/^[A-Z]{3}$/u),
    unitAmountMinor: z.number().int().positive().max(1_000_000_000),
    interval: z.enum(["month", "year"]),
    intervalCount: z.number().int().min(1).max(12),
    trialDays: z.number().int().min(0).max(90),
  })
  .strict();

export const managedBillingSessionRequestV1 = z
  .object({
    schemaVersion: z.literal("1"),
    organizationId: z.uuid(),
    action: managedBillingSessionActionV1,
    planId: z.uuid().nullable(),
    operationId: z.uuid(),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.action === "checkout") !== (value.planId !== null)) {
      context.addIssue({
        code: "custom",
        path: ["planId"],
        message: "checkout requires one plan and portal forbids plan input",
      });
    }
  });

export const billingProtectedAccessV1 = z
  .object({
    balanceRead: z.literal(true),
    refunds: z.literal(true),
    reconciliation: z.literal(true),
    checkoutIndependence: z.literal(true),
    exports: z.literal(true),
    promisedRewardRedemption: z.literal(true),
  })
  .strict();

const optionalInstant = z.iso.datetime({ offset: true }).nullable();

export const billingSummaryV1 = z
  .object({
    schemaVersion: z.literal("1"),
    organizationId: z.uuid(),
    deploymentMode,
    commercialState: managedBillingCommercialState,
    billingAvailable: z.boolean(),
    providerLinked: z.boolean(),
    subscriptionPresent: z.boolean(),
    growthConfigurationAllowed: z.boolean(),
    restriction: managedBillingRestriction,
    trialEndsAt: optionalInstant,
    currentPeriodEndsAt: optionalInstant,
    graceEndsAt: optionalInstant,
    evaluatedAt: z.iso.datetime({ offset: true }),
    stateUpdatedAt: optionalInstant,
    protectedAccess: billingProtectedAccessV1,
  })
  .strict()
  .superRefine((value, context) => {
    const addIssue = (path: string, message: string) =>
      context.addIssue({ code: "custom", path: [path], message });
    const growthStates = new Set([
      "self_hosted",
      "trialing",
      "active",
      "grace",
      "contract_managed",
    ]);
    const providerSubscriptionStates = new Set([
      "trialing",
      "active",
      "past_due",
      "grace",
      "suspended",
      "cancelled",
    ]);
    const expectedGrowth = growthStates.has(value.commercialState);

    if (value.growthConfigurationAllowed !== expectedGrowth) {
      addIssue(
        "growthConfigurationAllowed",
        "growth configuration does not match commercial state",
      );
    }
    if (value.restriction !== (expectedGrowth ? "none" : "new_growth_only")) {
      addIssue("restriction", "restriction does not match commercial state");
    }
    if (value.billingAvailable !== (value.deploymentMode === "managed")) {
      addIssue(
        "billingAvailable",
        "billing availability must follow deployment mode",
      );
    }
    if (
      (value.deploymentMode === "self_hosted") !==
      (value.commercialState === "self_hosted")
    ) {
      addIssue(
        "commercialState",
        "self-hosted state and deployment mode must agree",
      );
    }
    if (
      value.commercialState === "self_hosted" &&
      (value.providerLinked ||
        value.subscriptionPresent ||
        value.trialEndsAt !== null ||
        value.currentPeriodEndsAt !== null ||
        value.graceEndsAt !== null ||
        value.stateUpdatedAt !== null)
    ) {
      addIssue(
        "providerLinked",
        "self-hosted state cannot contain provider lifecycle evidence",
      );
    }
    if (value.commercialState === "unconfigured" && value.subscriptionPresent) {
      addIssue(
        "subscriptionPresent",
        "unconfigured managed state cannot contain a subscription",
      );
    }
    if (
      providerSubscriptionStates.has(value.commercialState) &&
      (!value.providerLinked || !value.subscriptionPresent)
    ) {
      addIssue(
        "subscriptionPresent",
        "provider lifecycle state requires private account and subscription evidence",
      );
    }
    if (!value.providerLinked && value.subscriptionPresent) {
      addIssue(
        "subscriptionPresent",
        "subscription evidence requires provider linkage",
      );
    }
    if (value.commercialState === "trialing" && value.trialEndsAt === null) {
      addIssue("trialEndsAt", "trialing state requires a trial deadline");
    }
    if (value.commercialState === "grace") {
      if (
        value.graceEndsAt === null ||
        Date.parse(value.graceEndsAt) <= Date.parse(value.evaluatedAt)
      ) {
        addIssue("graceEndsAt", "grace state requires a future grace deadline");
      }
    }
  });

const stripeEventId = z.string().regex(/^evt_[A-Za-z0-9]{8,120}$/u);
const stripeCustomerId = z.string().regex(/^cus_[A-Za-z0-9]{8,120}$/u);
const stripeSubscriptionId = z.string().regex(/^sub_[A-Za-z0-9]{8,120}$/u);
const stripeInvoiceId = z.string().regex(/^in_[A-Za-z0-9]{8,120}$/u);

export const stripeBillingWebhookEventV1 = z
  .object({
    schemaVersion: z.literal("1"),
    eventId: stripeEventId,
    eventType: stripeBillingWebhookEventTypeV1,
    liveMode: z.boolean(),
    objectId: z.union([stripeSubscriptionId, stripeInvoiceId]),
    customerId: stripeCustomerId,
    subscriptionId: stripeSubscriptionId.nullable(),
    subscriptionStatus: stripeSubscriptionStatusV1.nullable(),
    eventCreatedAt: z.iso.datetime({ offset: true }),
    currentPeriodEndsAt: z.iso.datetime({ offset: true }).nullable(),
    trialEndsAt: z.iso.datetime({ offset: true }).nullable(),
    signatureCreatedAt: z.iso.datetime({ offset: true }),
    bodySha256: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict()
  .superRefine((value, context) => {
    const subscriptionEvent = value.eventType.startsWith(
      "customer.subscription.",
    );
    const addIssue = (path: string, message: string) =>
      context.addIssue({ code: "custom", path: [path], message });

    if (subscriptionEvent) {
      if (!value.objectId.startsWith("sub_")) {
        addIssue("objectId", "subscription event requires subscription object");
      }
      if (value.subscriptionId !== value.objectId) {
        addIssue(
          "subscriptionId",
          "subscription event identity must match its object",
        );
      }
      if (value.subscriptionStatus === null) {
        addIssue("subscriptionStatus", "subscription event requires a status");
      }
    } else {
      if (!value.objectId.startsWith("in_")) {
        addIssue("objectId", "invoice event requires invoice object");
      }
      if (
        value.subscriptionStatus !== null ||
        value.currentPeriodEndsAt !== null ||
        value.trialEndsAt !== null
      ) {
        addIssue(
          "subscriptionStatus",
          "invoice observations cannot assert subscription state",
        );
      }
    }

    if (
      value.currentPeriodEndsAt !== null &&
      Date.parse(value.currentPeriodEndsAt) <= Date.parse(value.eventCreatedAt)
    ) {
      addIssue(
        "currentPeriodEndsAt",
        "current period end must follow the provider event",
      );
    }
    if (value.subscriptionStatus === "trialing") {
      if (
        value.trialEndsAt === null ||
        Date.parse(value.trialEndsAt) <= Date.parse(value.eventCreatedAt)
      ) {
        addIssue(
          "trialEndsAt",
          "trialing subscription requires a future trial deadline",
        );
      }
    } else if (value.trialEndsAt !== null) {
      addIssue(
        "trialEndsAt",
        "non-trialing event cannot assert a trial deadline",
      );
    }
  });

export const managedBillingWebhookReceiptV1 = z
  .object({
    receiptId: z.uuid(),
    outcome: z.enum(["accepted", "duplicate"]),
  })
  .strict();

export const managedBillingWebhookClaimV1 = z
  .object({
    receiptId: z.uuid(),
    leaseToken: z.uuid(),
    eventType: stripeBillingWebhookEventTypeV1,
    attemptNumber: z.number().int().min(1).max(10),
  })
  .strict();

export const managedBillingWebhookProcessingResultV1 = z
  .object({
    outcome: z.enum(["state_recorded", "invoice_observed", "held"]),
    stateRevisionId: z.uuid().nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      (value.outcome === "state_recorded") !==
      (value.stateRevisionId !== null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["stateRevisionId"],
        message: "only state-recorded outcomes contain a state revision",
      });
    }
  });

export type ManagedBillingCommercialState = z.infer<
  typeof managedBillingCommercialState
>;
export type ManagedBillingRestriction = z.infer<
  typeof managedBillingRestriction
>;
export type BillingProtectedAccessV1 = z.infer<typeof billingProtectedAccessV1>;
export type BillingSummaryV1 = z.infer<typeof billingSummaryV1>;
export type StripeBillingWebhookEventTypeV1 = z.infer<
  typeof stripeBillingWebhookEventTypeV1
>;
export type StripeSubscriptionStatusV1 = z.infer<
  typeof stripeSubscriptionStatusV1
>;
export type ManagedBillingSessionActionV1 = z.infer<
  typeof managedBillingSessionActionV1
>;
export type ManagedBillingPlanOptionV1 = z.infer<
  typeof managedBillingPlanOptionV1
>;
export type ManagedBillingSessionRequestV1 = z.infer<
  typeof managedBillingSessionRequestV1
>;
export type ManagedBillingUsageMeterKeyV1 = z.infer<
  typeof managedBillingUsageMeterKeyV1
>;
export type ManagedBillingUsageMeterSummaryV1 = z.infer<
  typeof managedBillingUsageMeterSummaryV1
>;
export type ManagedBillingUsageSummaryV1 = z.infer<
  typeof managedBillingUsageSummaryV1
>;
export type ManagedBillingUsageDispatchClaimV1 = z.infer<
  typeof managedBillingUsageDispatchClaimV1
>;
export type ManagedBillingUsageDispatchAuthorityV1 = z.infer<
  typeof managedBillingUsageDispatchAuthorityV1
>;
export type ManagedBillingUsageDispatchResultV1 = z.infer<
  typeof managedBillingUsageDispatchResultV1
>;
export type StripeBillingWebhookEventV1 = z.infer<
  typeof stripeBillingWebhookEventV1
>;
export type ManagedBillingWebhookReceiptV1 = z.infer<
  typeof managedBillingWebhookReceiptV1
>;
export type ManagedBillingWebhookClaimV1 = z.infer<
  typeof managedBillingWebhookClaimV1
>;
export type ManagedBillingWebhookProcessingResultV1 = z.infer<
  typeof managedBillingWebhookProcessingResultV1
>;
