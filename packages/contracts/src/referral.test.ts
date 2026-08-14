import { describe, expect, it } from "vitest";
import {
  createMyReferralLinkResultV1,
  merchantResolveReferralReviewCommandV1,
  merchantRetryReferralRewardCommandV1,
  referralAttributionEvidenceV1,
  referralPolicyV1,
  referralReviewCaseV1,
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

describe("referral review contracts", () => {
  const baseCase = {
    reviewId: "55000000-0000-4000-8000-000000000010",
    attributionId: "55000000-0000-4000-8000-000000000011",
    advocateReference: "Advocate 104",
    friendReference: "Friend 205",
    sourceOrderReference: "1842",
    riskCodes: ["source_network_velocity"],
    qualificationDecision: "review_held",
    coolingEndsAt: "2026-08-28T00:00:00Z",
    createdAt: "2026-08-14T00:00:00Z",
  } as const;

  it("accepts minimized risk and exhausted-job rows", () => {
    expect(
      referralReviewCaseV1.parse({
        ...baseCase,
        kind: "risk",
        state: "pending_review",
        attemptCount: null,
        reviewCycle: null,
        errorCode: null,
      }).kind,
    ).toBe("risk");
    expect(
      referralReviewCaseV1.parse({
        ...baseCase,
        kind: "reward",
        state: "manual_review",
        attemptCount: 10,
        reviewCycle: 0,
        errorCode: "worker_error",
      }).kind,
    ).toBe("reward");
  });

  it("rejects raw fingerprint fields and inconsistent queue states", () => {
    expect(
      referralReviewCaseV1.safeParse({
        ...baseCase,
        kind: "risk",
        state: "pending_review",
        attemptCount: null,
        reviewCycle: null,
        errorCode: null,
        paymentFingerprint: "a".repeat(64),
      }).success,
    ).toBe(false);
    expect(
      referralReviewCaseV1.safeParse({
        ...baseCase,
        kind: "reward",
        state: "retryable",
        attemptCount: 10,
        reviewCycle: 0,
        errorCode: "worker_error",
      }).success,
    ).toBe(false);
  });

  it("requires bounded reason-bound merchant commands", () => {
    const common = {
      version: "1",
      reason: "Verified shared household evidence",
      idempotencyKey: "referral:review:one",
      correlationId: "55000000-0000-4000-8000-000000000012",
    } as const;
    expect(
      merchantResolveReferralReviewCommandV1.safeParse({
        ...common,
        attributionId: "55000000-0000-4000-8000-000000000011",
        resolution: "approved",
      }).success,
    ).toBe(true);
    expect(
      merchantRetryReferralRewardCommandV1.safeParse({
        ...common,
        jobId: "55000000-0000-4000-8000-000000000010",
      }).success,
    ).toBe(true);
    expect(
      merchantResolveReferralReviewCommandV1.safeParse({
        ...common,
        reason: "short",
        attributionId: "55000000-0000-4000-8000-000000000011",
        resolution: "rejected",
      }).success,
    ).toBe(false);
  });
});
