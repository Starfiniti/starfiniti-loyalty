import { describe, expect, it } from "vitest";

import {
  billingSummaryV1,
  billingSummaryV2,
  managedBillingUsageDispatchAuthorityV1,
  managedBillingUsageDispatchClaimV1,
  managedBillingUsageDispatchClaimV2,
  managedBillingUsageDispatchResultV1,
  managedBillingUsageProviderAttemptV1,
  managedBillingUsageSummaryV1,
  managedBillingPlanOptionV1,
  managedBillingSessionRequestV1,
  managedBillingWebhookProcessingResultV1,
  stripeBillingWebhookEventV1,
} from "./billing";

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

describe("billing summary v2", () => {
  function v2Fixture() {
    return {
      ...managedFixture(),
      schemaVersion: "2",
      stateSource: "provider",
      restrictionReason: "none",
      contractEndsAt: null,
    } as const;
  }

  it("adds a deterministic source and reason without expanding private evidence", () => {
    expect(billingSummaryV2.parse(v2Fixture())).toMatchObject({
      commercialState: "active",
      stateSource: "provider",
      restrictionReason: "none",
    });
    expect(() =>
      billingSummaryV2.parse({
        ...v2Fixture(),
        approverReference: "operator:private",
      }),
    ).toThrow();
  });

  it("accepts a current manual contract with an optional future term", () => {
    expect(
      billingSummaryV2.parse({
        ...v2Fixture(),
        commercialState: "contract_managed",
        stateSource: "manual_contract",
        providerLinked: false,
        subscriptionPresent: false,
        currentPeriodEndsAt: null,
        stateUpdatedAt: "2026-08-26T19:30:00Z",
        contractEndsAt: "2027-08-26T20:00:00Z",
      }).stateSource,
    ).toBe("manual_contract");
  });

  it("rejects mismatched state sources reasons and expired contract terms", () => {
    expect(() =>
      billingSummaryV2.parse({
        ...v2Fixture(),
        stateSource: "manual_contract",
      }),
    ).toThrow(/contract-managed state/u);
    expect(() =>
      billingSummaryV2.parse({
        ...v2Fixture(),
        commercialState: "past_due",
        growthConfigurationAllowed: false,
        restriction: "new_growth_only",
      }),
    ).toThrow(/restriction reason/u);
    expect(() =>
      billingSummaryV2.parse({
        ...v2Fixture(),
        commercialState: "contract_managed",
        stateSource: "manual_contract",
        providerLinked: false,
        subscriptionPresent: false,
        currentPeriodEndsAt: null,
        stateUpdatedAt: "2026-08-26T19:30:00Z",
        contractEndsAt: "2026-08-26T20:00:00Z",
      }),
    ).toThrow(/currently effective/u);
  });

  it("distinguishes provider suspension from an expired local grace period", () => {
    for (const restrictionReason of [
      "provider_suspended",
      "grace_expired",
    ] as const) {
      expect(
        billingSummaryV2.parse({
          ...v2Fixture(),
          commercialState: "suspended",
          growthConfigurationAllowed: false,
          restriction: "new_growth_only",
          restrictionReason,
        }).restrictionReason,
      ).toBe(restrictionReason);
    }
  });
});

describe("Stripe billing webhook v1", () => {
  const subscriptionEvent = {
    schemaVersion: "1",
    eventId: "evt_BillingContract0001",
    eventType: "customer.subscription.updated",
    liveMode: false,
    objectId: "sub_BillingContract0001",
    customerId: "cus_BillingContract0001",
    subscriptionId: "sub_BillingContract0001",
    subscriptionStatus: "trialing",
    eventCreatedAt: "2026-08-26T20:00:00Z",
    currentPeriodEndsAt: "2026-09-26T20:00:00Z",
    trialEndsAt: "2026-09-02T20:00:00Z",
    signatureCreatedAt: "2026-08-26T20:00:01Z",
    bodySha256: "a".repeat(64),
  } as const;

  it("accepts minimized subscription and invoice observations", () => {
    expect(
      stripeBillingWebhookEventV1.parse(subscriptionEvent).subscriptionStatus,
    ).toBe("trialing");
    expect(
      stripeBillingWebhookEventV1.parse({
        ...subscriptionEvent,
        eventId: "evt_BillingContract0002",
        eventType: "invoice.payment_failed",
        objectId: "in_BillingContract0002",
        subscriptionStatus: null,
        currentPeriodEndsAt: null,
        trialEndsAt: null,
      }).eventType,
    ).toBe("invoice.payment_failed");
  });

  it("rejects invoice state assertions and mismatched subscription identity", () => {
    expect(() =>
      stripeBillingWebhookEventV1.parse({
        ...subscriptionEvent,
        eventType: "invoice.paid",
        objectId: "in_BillingContract0003",
      }),
    ).toThrow(/invoice observations/u);
    expect(() =>
      stripeBillingWebhookEventV1.parse({
        ...subscriptionEvent,
        subscriptionId: "sub_BillingContractChanged",
      }),
    ).toThrow(/identity/u);
  });

  it("rejects incomplete trial evidence, stale periods, and expanded fields", () => {
    expect(() =>
      stripeBillingWebhookEventV1.parse({
        ...subscriptionEvent,
        trialEndsAt: null,
      }),
    ).toThrow(/trial deadline/u);
    expect(() =>
      stripeBillingWebhookEventV1.parse({
        ...subscriptionEvent,
        currentPeriodEndsAt: subscriptionEvent.eventCreatedAt,
      }),
    ).toThrow(/current period/u);
    expect(() =>
      stripeBillingWebhookEventV1.parse({
        ...subscriptionEvent,
        customerEmail: "forbidden@example.test",
      }),
    ).toThrow();
  });

  it("binds state revision identity only to state effects", () => {
    expect(
      managedBillingWebhookProcessingResultV1.parse({
        outcome: "state_recorded",
        stateRevisionId: organizationId,
      }).outcome,
    ).toBe("state_recorded");
    expect(() =>
      managedBillingWebhookProcessingResultV1.parse({
        outcome: "invoice_observed",
        stateRevisionId: organizationId,
      }),
    ).toThrow(/only state-recorded/u);
  });
});

describe("managed billing session contracts v1", () => {
  const plan = {
    schemaVersion: "1",
    planId: "a2000000-0000-4000-8000-000000000100",
    key: "growth_monthly",
    name: "Growth",
    description: "Recurring managed loyalty platform access.",
    currency: "EUR",
    unitAmountMinor: 9900,
    interval: "month",
    intervalCount: 1,
    trialDays: 14,
  } as const;

  it("accepts a minimized externally configured plan without provider IDs", () => {
    expect(managedBillingPlanOptionV1.parse(plan).unitAmountMinor).toBe(9900);
    for (const forbidden of [
      { providerPriceId: "price_private" },
      { providerProductId: "prod_private" },
      { paymentMethod: "pm_private" },
    ]) {
      expect(() =>
        managedBillingPlanOptionV1.parse({ ...plan, ...forbidden }),
      ).toThrow();
    }
  });

  it("binds checkout to one public plan selector and portal to none", () => {
    expect(
      managedBillingSessionRequestV1.parse({
        schemaVersion: "1",
        organizationId,
        action: "checkout",
        planId: plan.planId,
        operationId: "a3000000-0000-4000-8000-000000000100",
      }).action,
    ).toBe("checkout");
    expect(
      managedBillingSessionRequestV1.parse({
        schemaVersion: "1",
        organizationId,
        action: "portal",
        planId: null,
        operationId: "a3000000-0000-4000-8000-000000000101",
      }).action,
    ).toBe("portal");
  });

  it("rejects browser provider authority and invalid action-plan combinations", () => {
    expect(() =>
      managedBillingSessionRequestV1.parse({
        schemaVersion: "1",
        organizationId,
        action: "checkout",
        planId: null,
        operationId: "a3000000-0000-4000-8000-000000000102",
      }),
    ).toThrow(/requires one plan/u);
    expect(() =>
      managedBillingSessionRequestV1.parse({
        schemaVersion: "1",
        organizationId,
        action: "portal",
        planId: plan.planId,
        operationId: "a3000000-0000-4000-8000-000000000103",
      }),
    ).toThrow(/forbids plan/u);
    expect(() =>
      managedBillingSessionRequestV1.parse({
        schemaVersion: "1",
        organizationId,
        action: "checkout",
        planId: plan.planId,
        operationId: "a3000000-0000-4000-8000-000000000104",
        customerId: "cus_forbidden",
        priceId: "price_forbidden",
        returnUrl: "https://attacker.example.test",
      }),
    ).toThrow();
  });
});

describe("managed billing usage summary v1", () => {
  const usage = {
    schemaVersion: "1",
    organizationId,
    periodStart: "2026-08-01T00:00:00Z",
    periodEnd: "2026-09-01T00:00:00Z",
    measuredAt: "2026-08-27T01:00:00Z",
    dispatchMode: "shadow",
    meters: [
      {
        meterKey: "orders",
        label: "Orders ingested",
        quantity: "9223372036854775807",
        dispatchedQuantity: "0",
        factCount: "1",
        pendingCount: "1",
        attentionCount: "0",
      },
      {
        meterKey: "active_members",
        label: "Active members",
        quantity: "24",
        dispatchedQuantity: "24",
        factCount: "24",
        pendingCount: "0",
        attentionCount: "0",
      },
      {
        meterKey: "messages",
        label: "Messages delivered",
        quantity: "120",
        dispatchedQuantity: "118",
        factCount: "120",
        pendingCount: "2",
        attentionCount: "0",
      },
      {
        meterKey: "api_requests",
        label: "Accepted API commands",
        quantity: "300",
        dispatchedQuantity: "300",
        factCount: "300",
        pendingCount: "0",
        attentionCount: "0",
      },
    ],
  } as const;

  it("keeps bigint quantities as exact decimal strings", () => {
    const parsed = managedBillingUsageSummaryV1.parse(usage);
    expect(parsed.meters[0]?.quantity).toBe("9223372036854775807");
  });

  it("requires all four unique reviewed meters and a forward period", () => {
    expect(() =>
      managedBillingUsageSummaryV1.parse({
        ...usage,
        meters: [
          usage.meters[0],
          usage.meters[0],
          usage.meters[2],
          usage.meters[3],
        ],
      }),
    ).toThrow(/each meter exactly once/u);
    expect(() =>
      managedBillingUsageSummaryV1.parse({
        ...usage,
        periodEnd: usage.periodStart,
      }),
    ).toThrow(/exactly one UTC month/u);
    expect(() =>
      managedBillingUsageSummaryV1.parse({
        ...usage,
        periodStart: "2026-08-01T01:00:00Z",
      }),
    ).toThrow(/UTC month boundary/u);
  });

  it("rejects provider identity, unsafe numbers, and unreviewed meters", () => {
    expect(() =>
      managedBillingUsageSummaryV1.parse({
        ...usage,
        providerCustomerId: "cus_forbidden",
      }),
    ).toThrow();
    expect(() =>
      managedBillingUsageSummaryV1.parse({
        ...usage,
        meters: usage.meters.map((meter, index) =>
          index === 0 ? { ...meter, pendingCount: "-1" } : meter,
        ),
      }),
    ).toThrow();
    expect(() =>
      managedBillingUsageSummaryV1.parse({
        ...usage,
        meters: usage.meters.map((meter, index) =>
          index === 0 ? { ...meter, quantity: 9_007_199_254_740_993 } : meter,
        ),
      }),
    ).toThrow();
    expect(() =>
      managedBillingUsageSummaryV1.parse({
        ...usage,
        meters: usage.meters.map((meter, index) =>
          index === 0 ? { ...meter, meterKey: "storage" } : meter,
        ),
      }),
    ).toThrow();
  });

  it("validates minimized worker claims, authority, and classified results", () => {
    expect(
      managedBillingUsageDispatchClaimV1.parse({
        dispatchId: "a4000000-0000-4000-8000-000000000100",
        leaseToken: "a4000000-0000-4000-8000-000000000101",
        attemptNumber: 1,
      }).attemptNumber,
    ).toBe(1);
    expect(
      managedBillingUsageDispatchClaimV2.parse({
        dispatchId: "a4000000-0000-4000-8000-000000000100",
        leaseToken: "a4000000-0000-4000-8000-000000000101",
        claimSequence: "1000000",
      }).claimSequence,
    ).toBe("1000000");
    expect(
      managedBillingUsageProviderAttemptV1.parse({ attemptNumber: 10 })
        .attemptNumber,
    ).toBe(10);
    expect(
      managedBillingUsageDispatchAuthorityV1.parse({
        eventName: "starfiniti_orders",
        customerId: "cus_BillingFixture001",
        identifier: "m14u_a4000000000040008000000000000100",
        quantity: "-1",
        occurredAt: "2026-08-27T01:00:00Z",
        liveMode: false,
      }).quantity,
    ).toBe("-1");
    expect(
      managedBillingUsageDispatchResultV1.parse({
        outcome: "accepted",
        responseClass: "duplicate",
        responseCode: 400,
        errorCode: null,
      }).responseClass,
    ).toBe("duplicate");
    expect(() =>
      managedBillingUsageDispatchAuthorityV1.parse({
        eventName: "starfiniti_orders",
        customerId: "cus_BillingFixture001",
        identifier: "m14u_a4000000000040008000000000000100",
        quantity: "1",
        occurredAt: "2026-08-27T01:00:00Z",
        liveMode: false,
        sourceCustomerEmail: "forbidden@example.test",
      }),
    ).toThrow();
  });
});
