import { describe, expect, it } from "vitest";
import {
  createMyReferralLinkResultV1,
  referralAttributionEvidenceV1,
  referralPolicyV1,
} from "./referral";

const policy = {
  version: "1",
  attributionWindowDays: 30,
  qualificationStatus: "completed",
  coolingDays: 30,
  minimumEligibleSpendMinor: "3000",
  requireNewCustomer: true,
  monthlyAdvocateReferralLimit: 10,
  advocateReward: { kind: "points", points: "400" },
  friendReward: { kind: "points", points: "100" },
  risk: {
    manualReviewEnabled: true,
    rollingWindowHours: 168,
    sourceNetworkReferralLimit: 10,
    deviceReferralLimit: 5,
  },
} as const;

describe("referralPolicyV1", () => {
  it("accepts the bounded default give-and-get policy", () => {
    expect(referralPolicyV1.parse(policy)).toEqual(policy);
  });

  it.each([
    [{ ...policy, attributionWindowDays: 0 }, "attributionWindowDays"],
    [{ ...policy, attributionWindowDays: 91 }, "attributionWindowDays"],
    [{ ...policy, requireNewCustomer: false }, "requireNewCustomer"],
    [
      { ...policy, advocateReward: { kind: "points", points: "0" } },
      "advocateReward.points",
    ],
    [
      {
        ...policy,
        risk: { ...policy.risk, sourceNetworkReferralLimit: 1 },
      },
      "risk.sourceNetworkReferralLimit",
    ],
  ])("rejects unsafe policy input at %s", (candidate, path) => {
    const parsed = referralPolicyV1.safeParse(candidate);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(
        parsed.error.issues.map((issue) => issue.path.join(".")),
      ).toContain(path);
    }
  });
});

describe("referralAttributionEvidenceV1", () => {
  it("accepts only opaque code and keyed fingerprints", () => {
    expect(
      referralAttributionEvidenceV1.safeParse({
        version: "1",
        advocateCode: "55000000-0000-4000-8000-000000000001",
        capturedAt: "2026-08-14T00:00:00Z",
        sourceNetworkFingerprint: "a".repeat(64),
        deviceFingerprint: null,
        paymentFingerprint: "b".repeat(64),
        shippingFingerprint: null,
      }).success,
    ).toBe(true);
    expect(
      referralAttributionEvidenceV1.safeParse({
        version: "1",
        advocateCode: "55000000-0000-4000-8000-000000000001",
        capturedAt: "2026-08-14T00:00:00Z",
        sourceNetworkFingerprint: "192.0.2.1",
        deviceFingerprint: null,
        paymentFingerprint: null,
        shippingFingerprint: null,
      }).success,
    ).toBe(false);
  });
});

describe("createMyReferralLinkResultV1", () => {
  it("accepts one canonical opaque referral parameter", () => {
    expect(
      createMyReferralLinkResultV1.safeParse({
        advocateCode: "55000000-0000-4000-8000-000000000001",
        shareUrl:
          "https://shop.example/?stf_ref=55000000-0000-4000-8000-000000000001",
        outcome: "created",
      }).success,
    ).toBe(true);
    expect(
      createMyReferralLinkResultV1.safeParse({
        advocateCode: "55000000-0000-4000-8000-000000000001",
        shareUrl:
          "https://shop.example/?stf_ref=55000000-0000-4000-8000-000000000001&utm_source=customer",
        outcome: "created",
      }).success,
    ).toBe(false);
  });
});
