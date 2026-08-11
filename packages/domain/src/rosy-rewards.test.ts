import { describe, expect, it } from "vitest";
import { rosyRewardsV1 } from "./rosy-rewards";

describe("Rosy Rewards v1", () => {
  it("encodes the approved value and lifecycle policies", () => {
    expect(rosyRewardsV1).toMatchObject({
      version: 1,
      status: "published",
      currencyCode: "EUR",
      minorUnitsPerMajor: 100,
      pointUnitName: "Petals",
      redemption: {
        pointsPerMajorUnit: 100,
        cashRedemption: false,
      },
      award: {
        initialState: "pending",
        releaseDelayDays: 30,
        rounding: "floor-once-per-order",
        tierSnapshotRequired: true,
      },
      refund: {
        attribution: "original-order-lines",
        cumulativeRounding: "floor-with-full-refund-cap",
        insufficientBalance: "allow-negative-and-offset-future-earnings",
        blocksCheckout: false,
      },
      expiry: {
        kind: "rolling-lot",
        monthsFromAvailableAt: 12,
        redemptionOrder: "earliest-expiry-first",
      },
      tierQualification: {
        spendBasis: "eligible-spend",
        rollingMonths: 12,
        downgradeGraceDays: 30,
      },
      identity: {
        guestClaim: "verified-channel-link",
        mergeByEmailAlone: false,
      },
      walletSharing: {
        default: "disabled",
        enablement: "explicit-programme-group-allowlist",
      },
    });
  });

  it("publishes only the approved Rose, Bloom, and Icon tiers", () => {
    expect(rosyRewardsV1.tiers).toEqual([
      {
        code: "rose",
        name: "Rose",
        minimumEligibleSpendMinor: 0,
        pointsPerMajorUnit: 5,
      },
      {
        code: "bloom",
        name: "Bloom",
        minimumEligibleSpendMinor: 15_000,
        pointsPerMajorUnit: 6,
      },
      {
        code: "icon",
        name: "Icon",
        minimumEligibleSpendMinor: 50_000,
        pointsPerMajorUnit: 7,
      },
    ]);
  });
});
