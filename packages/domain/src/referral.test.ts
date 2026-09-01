import { describe, expect, it } from "vitest";
import { evaluateReferralAttributionV1 } from "./referral";

const base = {
  advocateCustomerId: "advocate",
  friendCustomerId: "friend",
  advocateCode: "55000000-0000-4000-8000-000000000001",
  capturedAt: "2026-08-01T00:00:00Z",
  orderOccurredAt: "2026-08-30T23:59:59Z",
  attributionWindowDays: 30,
  existingAttribution: null,
  sourceNetworkReferralCount: 0,
  deviceReferralCount: 0,
  advocateMonthlyReferralCount: 0,
  monthlyAdvocateReferralLimit: 10,
  paymentEvidenceReused: false,
  shippingEvidenceReused: false,
  riskPolicy: {
    manualReviewEnabled: true,
    rollingWindowHours: 168,
    sourceNetworkReferralLimit: 10,
    deviceReferralLimit: 5,
  },
} as const;

describe("evaluateReferralAttributionV1", () => {
  it("accepts the first eligible advocate inside the inclusive window", () => {
    expect(evaluateReferralAttributionV1(base)).toEqual({
      outcome: "accepted",
      riskCodes: [],
      expiresAt: "2026-08-31T00:00:00.000Z",
    });
  });

  it("fails before capture and after the attribution boundary", () => {
    expect(
      evaluateReferralAttributionV1({
        ...base,
        orderOccurredAt: "2026-07-31T23:59:59Z",
      }).outcome,
    ).toBe("outside_window");
    expect(
      evaluateReferralAttributionV1({
        ...base,
        orderOccurredAt: "2026-08-31T00:00:00.001Z",
      }).outcome,
    ).toBe("outside_window");
  });

  it("makes exact replay stable and keeps the first different advocate", () => {
    expect(
      evaluateReferralAttributionV1({
        ...base,
        existingAttribution: {
          advocateCustomerId: "advocate",
          advocateCode: base.advocateCode,
        },
      }).outcome,
    ).toBe("duplicate");
    expect(
      evaluateReferralAttributionV1({
        ...base,
        existingAttribution: {
          advocateCustomerId: "first-advocate",
          advocateCode: "55000000-0000-4000-8000-000000000002",
        },
      }).outcome,
    ).toBe("existing_attribution");
  });

  it("blocks deterministic self-referral", () => {
    expect(
      evaluateReferralAttributionV1({
        ...base,
        friendCustomerId: "advocate",
      }),
    ).toMatchObject({ outcome: "blocked", riskCodes: ["self_referral"] });
  });

  it("routes minimized velocity and reuse signals to review", () => {
    expect(
      evaluateReferralAttributionV1({
        ...base,
        sourceNetworkReferralCount: 10,
        deviceReferralCount: 5,
        advocateMonthlyReferralCount: 10,
        paymentEvidenceReused: true,
        shippingEvidenceReused: true,
      }),
    ).toMatchObject({
      outcome: "review",
      riskCodes: [
        "advocate_monthly_limit",
        "source_network_velocity",
        "device_velocity",
        "reused_payment_evidence",
        "reused_shipping_evidence",
      ],
    });
  });

  it("retains diagnostics but accepts when manual review is disabled", () => {
    expect(
      evaluateReferralAttributionV1({
        ...base,
        sourceNetworkReferralCount: 10,
        riskPolicy: { ...base.riskPolicy, manualReviewEnabled: false },
      }),
    ).toMatchObject({
      outcome: "accepted",
      riskCodes: ["source_network_velocity"],
    });
  });
});
