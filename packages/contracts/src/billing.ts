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

export type ManagedBillingCommercialState = z.infer<
  typeof managedBillingCommercialState
>;
export type ManagedBillingRestriction = z.infer<
  typeof managedBillingRestriction
>;
export type BillingProtectedAccessV1 = z.infer<typeof billingProtectedAccessV1>;
export type BillingSummaryV1 = z.infer<typeof billingSummaryV1>;
