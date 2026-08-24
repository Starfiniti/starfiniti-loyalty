import { describe, expect, it } from "vitest";
import {
  klaviyoNotificationActionAuthorizationV1,
  klaviyoNotificationOperationClaimV1,
  klaviyoNotificationPreparationV1,
  notificationEventV1,
  notificationPreferenceV1,
  smtpNotificationDeliveryClaimV1,
  smtpNotificationDispatchAuthorizationV1,
  webhookDestinationUrlV1,
  webhookNotificationDeliveryClaimV1,
  webhookNotificationDispatchAuthorizationV1,
} from "./notification";

const base = {
  schemaVersion: "1",
  eventId: "00000000-0000-4000-8000-000000000001",
  organizationId: "00000000-0000-4000-8000-000000000002",
  programmeGroupId: "00000000-0000-4000-8000-000000000003",
  locale: "en",
  occurredAt: "2026-08-24T10:00:00+02:00",
  subject: {
    kind: "customer",
    customerId: "00000000-0000-4000-8000-000000000004",
  },
} as const;

describe("notificationEventV1", () => {
  it.each([
    [
      "loyalty.points.earned",
      "loyalty_transactional",
      { points: "5", pendingUntil: "2026-08-25T08:00:00Z" },
    ],
    [
      "loyalty.points.released",
      "loyalty_transactional",
      { points: "5", availableBalance: "15" },
    ],
    [
      "loyalty.points.expiring",
      "loyalty_transactional",
      { points: "5", expiresAt: "2026-09-01T08:00:00Z", daysRemaining: 7 },
    ],
    [
      "loyalty.reward.changed",
      "loyalty_transactional",
      {
        rewardReservationId: "00000000-0000-4000-8000-000000000005",
        rewardCode: "five-off",
        state: "issued",
      },
    ],
    [
      "loyalty.tier.changed",
      "loyalty_transactional",
      {
        fromTierCode: "rose",
        toTierCode: "bloom",
        effectiveAt: "2026-08-24T08:00:00Z",
      },
    ],
    [
      "loyalty.referral.changed",
      "loyalty_transactional",
      {
        referralId: "00000000-0000-4000-8000-000000000006",
        party: "advocate",
        state: "qualified",
      },
    ],
    [
      "loyalty.campaign.effect",
      "loyalty_marketing",
      {
        campaignVersionId: "00000000-0000-4000-8000-000000000007",
        outcome: "points_awarded",
        points: "10",
      },
    ],
  ] as const)(
    "accepts strict customer event %s",
    (eventType, purpose, payload) => {
      expect(
        notificationEventV1.safeParse({ ...base, eventType, purpose, payload })
          .success,
      ).toBe(true);
    },
  );

  it.each([
    [
      "loyalty.connector.health",
      {
        connectionId: "00000000-0000-4000-8000-000000000008",
        state: "degraded",
        errorCode: "connection_timeout",
      },
    ],
    ["loyalty.billing.changed", { state: "past_due" }],
  ] as const)("accepts strict merchant event %s", (eventType, payload) => {
    expect(
      notificationEventV1.safeParse({
        ...base,
        eventType,
        purpose: "merchant_operational",
        subject: { kind: "merchant" },
        payload,
      }).success,
    ).toBe(true);
  });

  it("rejects purpose laundering and arbitrary contact properties", () => {
    expect(
      notificationEventV1.safeParse({
        ...base,
        eventType: "loyalty.campaign.effect",
        purpose: "loyalty_transactional",
        payload: {
          campaignVersionId: "00000000-0000-4000-8000-000000000007",
          outcome: "points_awarded",
          points: "10",
          email: "secret@example.test",
        },
      }).success,
    ).toBe(false);
  });

  it("rejects coupon material and unsafe integers", () => {
    expect(
      notificationEventV1.safeParse({
        ...base,
        eventType: "loyalty.reward.changed",
        purpose: "loyalty_transactional",
        payload: {
          rewardReservationId: "00000000-0000-4000-8000-000000000005",
          rewardCode: "five-off",
          state: "issued",
          couponCode: "PLAINTEXT",
        },
      }).success,
    ).toBe(false);
    expect(
      notificationEventV1.safeParse({
        ...base,
        eventType: "loyalty.points.released",
        purpose: "loyalty_transactional",
        payload: {
          points: "9223372036854775808",
          availableBalance: "0",
        },
      }).success,
    ).toBe(false);
  });
});

describe("Klaviyo notification delivery contracts", () => {
  const event = notificationEventV1.parse({
    ...base,
    eventType: "loyalty.campaign.effect",
    purpose: "loyalty_marketing",
    payload: {
      campaignVersionId: "00000000-0000-4000-8000-000000000007",
      outcome: "points_awarded",
      points: "10",
    },
  });

  it("accepts a bounded contact-free operation claim", () => {
    expect(
      klaviyoNotificationOperationClaimV1.parse({
        schemaVersion: "1",
        operationId: "92000000-0000-4000-8000-000000000001",
        operationKind: "event_sync",
        leaseExpiresAt: "2026-08-24T10:01:00Z",
      }),
    ).toMatchObject({ operationKind: "event_sync" });
  });

  it("accepts minimized event and consent preparations", () => {
    const common = {
      schemaVersion: "1",
      operationId: "92000000-0000-4000-8000-000000000001",
      outcome: "authorized",
      attempt: 1,
      recipientEmail: "member@example.test",
      externalCustomerId: "92000000-0000-4000-8000-000000000002",
      providerProfileId: null,
      apiRevision: "2026-07-15",
      listId: "LoyaltyList",
    } as const;
    expect(
      klaviyoNotificationPreparationV1.parse({
        ...common,
        operationKind: "event_sync",
        event,
      }),
    ).toMatchObject({ operationKind: "event_sync" });
    expect(
      klaviyoNotificationPreparationV1.parse({
        ...common,
        operationKind: "consent_sync",
        preferenceEventId: "92000000-0000-4000-8000-000000000003",
        desiredState: "subscribed",
        effectiveAt: "2026-08-24T10:00:00Z",
      }),
    ).toMatchObject({ operationKind: "consent_sync" });
  });

  it.each(["held", "suppressed", "superseded", "contact_unavailable"] as const)(
    "accepts a contact-free %s preparation",
    (outcome) => {
      expect(
        klaviyoNotificationPreparationV1.parse({
          schemaVersion: "1",
          operationId: "92000000-0000-4000-8000-000000000001",
          outcome,
        }),
      ).toEqual({
        schemaVersion: "1",
        operationId: "92000000-0000-4000-8000-000000000001",
        outcome,
      });
    },
  );

  it("accepts only bounded provider action authorization", () => {
    expect(
      klaviyoNotificationActionAuthorizationV1.parse({
        schemaVersion: "1",
        operationId: "92000000-0000-4000-8000-000000000001",
        outcome: "authorized",
        action: "subscribe",
        providerProfileId: "01KlaviyoProfile_1",
      }),
    ).toMatchObject({ action: "subscribe" });
  });

  it("rejects contact smuggling, merchant events, and provider payloads", () => {
    expect(
      klaviyoNotificationOperationClaimV1.safeParse({
        schemaVersion: "1",
        operationId: "92000000-0000-4000-8000-000000000001",
        operationKind: "event_sync",
        leaseExpiresAt: "2026-08-24T10:01:00Z",
        recipientEmail: "member@example.test",
      }).success,
    ).toBe(false);
    expect(
      klaviyoNotificationPreparationV1.safeParse({
        schemaVersion: "1",
        operationId: "92000000-0000-4000-8000-000000000001",
        outcome: "authorized",
        attempt: 1,
        recipientEmail: "merchant@example.test",
        externalCustomerId: "92000000-0000-4000-8000-000000000002",
        providerProfileId: null,
        apiRevision: "2026-07-15",
        listId: null,
        operationKind: "event_sync",
        event: {
          ...event,
          eventType: "loyalty.connector.health",
          purpose: "merchant_operational",
          subject: { kind: "merchant" },
          payload: {
            connectionId: "92000000-0000-4000-8000-000000000004",
            state: "healthy",
            errorCode: null,
          },
        },
      }).success,
    ).toBe(false);
    expect(
      klaviyoNotificationActionAuthorizationV1.safeParse({
        schemaVersion: "1",
        operationId: "92000000-0000-4000-8000-000000000001",
        outcome: "authorized",
        action: "event",
        providerProfileId: "profile-1",
        rawProviderResponse: { email: "member@example.test" },
      }).success,
    ).toBe(false);
  });
});

describe("notificationPreferenceV1", () => {
  it("accepts a minimized purpose-separated preference", () => {
    expect(
      notificationPreferenceV1.parse({
        schemaVersion: "1",
        accountId: "00000000-0000-4000-8000-000000000009",
        channel: "email",
        purpose: "loyalty_marketing",
        state: "unsubscribed",
        policyVersion: "default-v1",
        effectiveAt: null,
      }),
    ).toMatchObject({ state: "unsubscribed" });
  });

  it("rejects unsupported channels, locales, and extra contact data", () => {
    expect(
      notificationPreferenceV1.safeParse({
        schemaVersion: "1",
        accountId: "00000000-0000-4000-8000-000000000009",
        channel: "sms",
        purpose: "loyalty_marketing",
        state: "subscribed",
        policyVersion: "default-v1",
        effectiveAt: null,
        email: "secret@example.test",
      }).success,
    ).toBe(false);
  });
});

describe("SMTP notification delivery contracts", () => {
  const event = notificationEventV1.parse({
    schemaVersion: "1",
    eventId: "91000000-0000-4000-8000-000000000101",
    organizationId: "91000000-0000-4000-8000-000000000102",
    programmeGroupId: "91000000-0000-4000-8000-000000000103",
    locale: "en",
    occurredAt: "2026-08-24T10:00:00Z",
    eventType: "loyalty.points.released",
    purpose: "loyalty_transactional",
    subject: {
      kind: "customer",
      customerId: "91000000-0000-4000-8000-000000000104",
    },
    payload: { points: "50", availableBalance: "250" },
  });

  it("accepts a bounded PII-free delivery claim", () => {
    expect(
      smtpNotificationDeliveryClaimV1.parse({
        schemaVersion: "1",
        deliveryId: "91000000-0000-4000-8000-000000000105",
        leaseExpiresAt: "2026-08-24T10:01:00Z",
      }),
    ).toEqual({
      schemaVersion: "1",
      deliveryId: "91000000-0000-4000-8000-000000000105",
      leaseExpiresAt: "2026-08-24T10:01:00Z",
    });
  });

  it("accepts contact only inside a last-moment dispatch authorization", () => {
    expect(
      smtpNotificationDispatchAuthorizationV1.parse({
        schemaVersion: "1",
        deliveryId: "91000000-0000-4000-8000-000000000105",
        outcome: "authorized",
        attempt: 1,
        recipientEmail: "member@example.test",
        templateCode: "points_released",
        templateVersion: 1,
        templateSha256: "ab".repeat(32),
        subjectTemplate: "{{points}} points are now available",
        textTemplate: "You now have {{availableBalance}} points.",
        htmlTemplate: "<p>You now have {{availableBalance}} points.</p>",
        event,
      }).outcome,
    ).toBe("authorized");
  });

  it.each(["held", "suppressed", "contact_unavailable"] as const)(
    "accepts the contact-free %s dispatch outcome",
    (outcome) => {
      expect(
        smtpNotificationDispatchAuthorizationV1.parse({
          schemaVersion: "1",
          deliveryId: "91000000-0000-4000-8000-000000000105",
          outcome,
        }),
      ).toEqual({
        schemaVersion: "1",
        deliveryId: "91000000-0000-4000-8000-000000000105",
        outcome,
      });
    },
  );

  it("rejects merchant and marketing events from the SMTP transactional slice", () => {
    expect(
      smtpNotificationDispatchAuthorizationV1.safeParse({
        schemaVersion: "1",
        deliveryId: "91000000-0000-4000-8000-000000000105",
        outcome: "authorized",
        attempt: 1,
        recipientEmail: "member@example.test",
        templateCode: "campaign_effect",
        templateVersion: 1,
        templateSha256: "ab".repeat(32),
        subjectTemplate: "Campaign update",
        textTemplate: "Campaign update",
        htmlTemplate: "<p>Campaign update</p>",
        event: {
          ...event,
          eventType: "loyalty.campaign.effect",
          purpose: "loyalty_marketing",
          payload: {
            campaignVersionId: "91000000-0000-4000-8000-000000000106",
            outcome: "points_awarded",
            points: "5",
          },
        },
      }).success,
    ).toBe(false);
  });

  it("rejects contact smuggling in claim and unavailable outcomes", () => {
    expect(
      smtpNotificationDeliveryClaimV1.safeParse({
        schemaVersion: "1",
        deliveryId: "91000000-0000-4000-8000-000000000105",
        leaseExpiresAt: "2026-08-24T10:01:00Z",
        recipientEmail: "member@example.test",
      }).success,
    ).toBe(false);
    expect(
      smtpNotificationDispatchAuthorizationV1.safeParse({
        schemaVersion: "1",
        deliveryId: "91000000-0000-4000-8000-000000000105",
        outcome: "suppressed",
        recipientEmail: "member@example.test",
      }).success,
    ).toBe(false);
  });
});

describe("generic webhook notification contracts", () => {
  const event = notificationEventV1.parse({
    schemaVersion: "1",
    eventId: "93000000-0000-4000-8000-000000000101",
    organizationId: "93000000-0000-4000-8000-000000000102",
    programmeGroupId: null,
    locale: "en",
    occurredAt: "2026-08-24T10:00:00Z",
    eventType: "loyalty.connector.health",
    purpose: "merchant_operational",
    subject: { kind: "merchant" },
    payload: {
      connectionId: "93000000-0000-4000-8000-000000000103",
      state: "degraded",
      errorCode: "delivery_lag",
    },
  });

  it("accepts exact HTTPS and explicit loopback-test destinations", () => {
    expect(
      webhookDestinationUrlV1.parse("https://hooks.example.test/loyalty"),
    ).toBe("https://hooks.example.test/loyalty");
    expect(webhookDestinationUrlV1.parse("http://127.0.0.1:8080/sink")).toBe(
      "http://127.0.0.1:8080/sink",
    );
  });

  it.each([
    "http://hooks.example.test/loyalty",
    "https://user:pass@hooks.example.test/loyalty",
    "https://hooks.example.test/loyalty?secret=value",
    "https://hooks.example.test:8443/loyalty",
    "https://192.0.2.10/loyalty",
    "https://[2001:db8::1]/loyalty",
    "https://hooks.example.test",
  ])("rejects unsafe destination %s", (destinationUrl) => {
    expect(webhookDestinationUrlV1.safeParse(destinationUrl).success).toBe(
      false,
    );
  });

  it("accepts a contact-free claim and exact event authorization", () => {
    expect(
      webhookNotificationDeliveryClaimV1.parse({
        schemaVersion: "1",
        deliveryId: "93000000-0000-4000-8000-000000000104",
        leaseExpiresAt: "2026-08-24T10:01:00Z",
      }),
    ).toMatchObject({ schemaVersion: "1" });
    expect(
      webhookNotificationDispatchAuthorizationV1.parse({
        schemaVersion: "1",
        deliveryId: "93000000-0000-4000-8000-000000000104",
        outcome: "authorized",
        attempt: 1,
        destinationUrl: "https://hooks.example.test/loyalty",
        event,
      }),
    ).toMatchObject({ outcome: "authorized", event });
  });

  it.each(["held", "suppressed"] as const)(
    "accepts a payload-free %s outcome",
    (outcome) => {
      expect(
        webhookNotificationDispatchAuthorizationV1.parse({
          schemaVersion: "1",
          deliveryId: "93000000-0000-4000-8000-000000000104",
          outcome,
        }),
      ).toMatchObject({ outcome });
    },
  );

  it("rejects contact, secret, signature, and raw provider smuggling", () => {
    for (const extra of [
      { recipientEmail: "member@example.test" },
      { signingSecret: "whsec_secret" },
      { signature: "v1,secret" },
      { rawProviderResponse: { body: "private" } },
    ]) {
      expect(
        webhookNotificationDispatchAuthorizationV1.safeParse({
          schemaVersion: "1",
          deliveryId: "93000000-0000-4000-8000-000000000104",
          outcome: "authorized",
          attempt: 1,
          destinationUrl: "https://hooks.example.test/loyalty",
          event,
          ...extra,
        }).success,
      ).toBe(false);
    }
  });
});
