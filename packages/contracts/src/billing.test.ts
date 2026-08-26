import { describe, expect, it } from "vitest";

import { billingSummaryV1 } from "./billing";

const organizationId = "a1000000-0000-4000-8000-000000000100";
const protectedAccess = {
  balanceRead: true,
  refunds: true,
  reconciliation: true,
  checkoutIndependence: true,
  exports: true,
  promisedRewardRedemption: true,
} as const;

function managedFixture() {
  return {
    schemaVersion: "1",
    organizationId,
    deploymentMode: "managed",
    commercialState: "active",
    billingAvailable: true,
    providerLinked: true,
    subscriptionPresent: true,
    growthConfigurationAllowed: true,
    restriction: "none",
    trialEndsAt: null,
    currentPeriodEndsAt: "2026-09-26T00:00:00Z",
    graceEndsAt: null,
    evaluatedAt: "2026-08-26T20:00:00Z",
    stateUpdatedAt: "2026-08-26T19:00:00Z",
    protectedAccess,
  } as const;
}

describe("billing summary v1", () => {
  it("accepts managed active and time-derived grace states", () => {
    expect(billingSummaryV1.parse(managedFixture()).commercialState).toBe(
      "active",
    );
    expect(
      billingSummaryV1.parse({
        ...managedFixture(),
        commercialState: "grace",
        graceEndsAt: "2026-08-30T20:00:00Z",
      }).commercialState,
    ).toBe("grace");
  });

  it("accepts self-hosted operation only without provider lifecycle state", () => {
    const parsed = billingSummaryV1.parse({
      ...managedFixture(),
      deploymentMode: "self_hosted",
      commercialState: "self_hosted",
      billingAvailable: false,
      providerLinked: false,
      subscriptionPresent: false,
      currentPeriodEndsAt: null,
      stateUpdatedAt: null,
    });
    expect(parsed.growthConfigurationAllowed).toBe(true);
    expect(parsed.protectedAccess.checkoutIndependence).toBe(true);
  });

  it("rejects provider lifecycle data in self-hosted mode", () => {
    expect(() =>
      billingSummaryV1.parse({
        ...managedFixture(),
        deploymentMode: "self_hosted",
        commercialState: "self_hosted",
        billingAvailable: false,
      }),
    ).toThrow(/self-hosted state/u);
  });

  it("rejects restriction and growth states that disagree", () => {
    expect(() =>
      billingSummaryV1.parse({
        ...managedFixture(),
        commercialState: "suspended",
      }),
    ).toThrow(/growth configuration/u);
    expect(() =>
      billingSummaryV1.parse({
        ...managedFixture(),
        commercialState: "suspended",
        growthConfigurationAllowed: false,
      }),
    ).toThrow(/restriction/u);
  });

  it("rejects hollow provider and grace evidence", () => {
    expect(() =>
      billingSummaryV1.parse({
        ...managedFixture(),
        providerLinked: false,
      }),
    ).toThrow(/provider lifecycle/u);
    expect(() =>
      billingSummaryV1.parse({
        ...managedFixture(),
        commercialState: "grace",
        graceEndsAt: "2026-08-26T19:59:59Z",
      }),
    ).toThrow(/future grace deadline/u);
  });

  it("rejects payment or provider identifiers outside the minimized contract", () => {
    for (const expanded of [
      { stripeCustomerId: "cus_private" },
      { subscriptionId: "sub_private" },
      { paymentMethod: "pm_private" },
      { customerEmail: "private@example.test" },
    ]) {
      expect(() =>
        billingSummaryV1.parse({ ...managedFixture(), ...expanded }),
      ).toThrow();
    }
  });

  it("requires every protected loyalty path to remain available", () => {
    for (const key of Object.keys(protectedAccess)) {
      expect(() =>
        billingSummaryV1.parse({
          ...managedFixture(),
          protectedAccess: { ...protectedAccess, [key]: false },
        }),
      ).toThrow();
    }
  });
});
