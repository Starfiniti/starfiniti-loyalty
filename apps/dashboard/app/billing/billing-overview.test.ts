import type { BillingSummaryV2 } from "@starfiniti/contracts";
import { describe, expect, it } from "vitest";

import {
  billingProviderControlsPresentation,
  billingRecoveryGuidance,
  billingStatePresentation,
  formatBillingInstant,
  formatUsageCount,
} from "./billing-overview";

const protectedAccess = {
  balanceRead: true,
  refunds: true,
  reconciliation: true,
  checkoutIndependence: true,
  exports: true,
  promisedRewardRedemption: true,
} as const;

function managedSummary(
  overrides: Partial<BillingSummaryV2> = {},
): BillingSummaryV2 {
  return {
    schemaVersion: "2",
    organizationId: "55f34937-fc41-4f2d-b41a-f9494b51df04",
    deploymentMode: "managed",
    commercialState: "active",
    billingAvailable: true,
    providerLinked: true,
    subscriptionPresent: true,
    growthConfigurationAllowed: true,
    restriction: "none",
    trialEndsAt: null,
    currentPeriodEndsAt: "2031-01-01T00:00:00.000Z",
    graceEndsAt: null,
    evaluatedAt: "2030-12-01T00:00:00.000Z",
    stateUpdatedAt: "2030-11-01T00:00:00.000Z",
    stateSource: "provider",
    restrictionReason: "none",
    contractEndsAt: null,
    protectedAccess,
    ...overrides,
  };
}

describe("billingStatePresentation", () => {
  it("makes self-hosted independence explicit", () => {
    const presentation = billingStatePresentation(
      managedSummary({
        deploymentMode: "self_hosted",
        commercialState: "self_hosted",
        stateSource: "self_hosted",
        billingAvailable: false,
        providerLinked: false,
        subscriptionPresent: false,
        currentPeriodEndsAt: null,
        stateUpdatedAt: null,
      }),
    );

    expect(presentation).toMatchObject({
      badge: "Self-hosted",
      provider: "Not required",
      tone: "positive",
    });
    expect(presentation.description).toContain(
      "neither required nor contacted",
    );
  });

  it("describes only new growth as restricted during delinquency", () => {
    const presentation = billingStatePresentation(
      managedSummary({
        commercialState: "suspended",
        restrictionReason: "provider_suspended",
        growthConfigurationAllowed: false,
        restriction: "new_growth_only",
      }),
    );

    expect(presentation.tone).toBe("restricted");
    expect(presentation.title).toBe("New managed growth is restricted");
    expect(presentation.description).toContain(
      "promised rewards remain available",
    );
  });

  it("distinguishes a manual enterprise contract", () => {
    const presentation = billingStatePresentation(
      managedSummary({
        commercialState: "contract_managed",
        stateSource: "manual_contract",
        providerLinked: false,
        subscriptionPresent: false,
        currentPeriodEndsAt: null,
      }),
    );

    expect(presentation).toMatchObject({
      badge: "Contract managed",
      provider: "Contract managed",
      title: "Enterprise contract is active",
    });
  });

  it("does not describe grace as good standing", () => {
    const presentation = billingStatePresentation(
      managedSummary({
        commercialState: "grace",
        restrictionReason: "payment_past_due",
        graceEndsAt: "2030-12-15T00:00:00.000Z",
      }),
    );

    expect(presentation).toMatchObject({
      badge: "Grace period",
      title: "Managed billing is in a grace period",
      tone: "warning",
    });
  });

  it("explains expired local grace separately from provider suspension", () => {
    const presentation = billingStatePresentation(
      managedSummary({
        commercialState: "suspended",
        growthConfigurationAllowed: false,
        restriction: "new_growth_only",
        restrictionReason: "grace_expired",
        graceEndsAt: "2030-11-30T00:00:00.000Z",
      }),
    );

    expect(presentation.description).toContain("grace period has ended");
    expect(presentation.description).toContain("promised rewards remain");
  });

  it("gives an owner a provider-safe recovery path without treating redirects as authority", () => {
    const guidance = billingRecoveryGuidance(
      managedSummary({
        commercialState: "suspended",
        growthConfigurationAllowed: false,
        restriction: "new_growth_only",
        restrictionReason: "provider_suspended",
      }),
      true,
    );

    expect(guidance?.title).toBe("Restore new configuration");
    expect(guidance?.description).toContain("verified lifecycle evidence");
    expect(guidance?.steps.join(" ")).toContain("programme history");
  });

  it("keeps recovery guidance useful for a non-owner during grace", () => {
    const guidance = billingRecoveryGuidance(
      managedSummary({
        commercialState: "grace",
        restrictionReason: "payment_past_due",
        graceEndsAt: "2030-12-15T00:00:00.000Z",
      }),
      false,
    );

    expect(guidance?.title).toContain("grace window");
    expect(guidance?.steps.join(" ")).toContain("organization owner");
    expect(guidance?.steps.join(" ")).toContain("promised rewards");
  });

  it("does not show recovery guidance for healthy or self-hosted states", () => {
    expect(billingRecoveryGuidance(managedSummary(), true)).toBeNull();
    expect(
      billingRecoveryGuidance(
        managedSummary({
          deploymentMode: "self_hosted",
          commercialState: "self_hosted",
          stateSource: "self_hosted",
          billingAvailable: false,
          providerLinked: false,
          subscriptionPresent: false,
          currentPeriodEndsAt: null,
          stateUpdatedAt: null,
        }),
        true,
      ),
    ).toBeNull();
  });

  it("describes live owner controls instead of claiming they are unavailable", () => {
    expect(
      billingProviderControlsPresentation(managedSummary(), true, 0),
    ).toMatchObject({ title: "Secure billing portal available" });
    expect(
      billingProviderControlsPresentation(
        managedSummary({
          commercialState: "unconfigured",
          stateSource: "unconfigured",
          restrictionReason: "billing_unconfigured",
          providerLinked: false,
          subscriptionPresent: false,
          growthConfigurationAllowed: false,
          restriction: "new_growth_only",
          currentPeriodEndsAt: null,
          stateUpdatedAt: null,
        }),
        true,
        2,
      ),
    ).toMatchObject({ title: "Secure plan checkout available" });
  });

  it("does not promise an unpublished plan or self-serve contract management", () => {
    const unconfigured = managedSummary({
      commercialState: "unconfigured",
      stateSource: "unconfigured",
      restrictionReason: "billing_unconfigured",
      providerLinked: false,
      subscriptionPresent: false,
      growthConfigurationAllowed: false,
      restriction: "new_growth_only",
      currentPeriodEndsAt: null,
      stateUpdatedAt: null,
    });
    expect(billingRecoveryGuidance(unconfigured, true, 0)).toMatchObject({
      title: "Managed plan setup is unavailable",
    });
    expect(
      billingRecoveryGuidance(unconfigured, true, 0)?.steps.join(" "),
    ).not.toContain("Choose an available managed plan");

    const contract = managedSummary({
      commercialState: "contract_managed",
      stateSource: "manual_contract",
      providerLinked: false,
      subscriptionPresent: false,
      currentPeriodEndsAt: null,
      contractEndsAt: "2031-12-01T00:00:00.000Z",
    });
    expect(
      billingProviderControlsPresentation(contract, true, 2),
    ).toMatchObject({ title: "Approved enterprise contract" });
  });
});

describe("managed usage presentation", () => {
  it("formats bigint usage without lossy number conversion", () => {
    expect(formatUsageCount("9223372036854775807")).toBe(
      "9,223,372,036,854,775,807",
    );
    expect(formatUsageCount("-1")).toBe("-1");
  });

  it("formats commercial deadlines in explicit UTC", () => {
    expect(formatBillingInstant("2030-12-15T15:30:00.000Z")).toContain("UTC");
  });
});
