import type { BillingSummaryV1 } from "@starfiniti/contracts";
import { describe, expect, it } from "vitest";

import { billingStatePresentation, formatUsageCount } from "./billing-overview";

const protectedAccess = {
  balanceRead: true,
  refunds: true,
  reconciliation: true,
  checkoutIndependence: true,
  exports: true,
  promisedRewardRedemption: true,
} as const;

function managedSummary(
  overrides: Partial<BillingSummaryV1> = {},
): BillingSummaryV1 {
  return {
    schemaVersion: "1",
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
        graceEndsAt: "2030-12-15T00:00:00.000Z",
      }),
    );

    expect(presentation).toMatchObject({
      badge: "Grace period",
      title: "Managed billing is in a grace period",
      tone: "warning",
    });
  });
});

describe("managed usage presentation", () => {
  it("formats bigint usage without lossy number conversion", () => {
    expect(formatUsageCount("9223372036854775807")).toBe(
      "9,223,372,036,854,775,807",
    );
    expect(formatUsageCount("-1")).toBe("-1");
  });
});
