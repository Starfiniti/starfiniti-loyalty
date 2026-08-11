import {
  defineProgrammeVersion,
  programmeVersionId,
  tierCode,
} from "./programme";
import { minorUnit, points } from "./values";

export const rosyRewardsV1 = defineProgrammeVersion({
  id: programmeVersionId("rosy-rewards:v1"),
  version: 1,
  status: "published",
  currencyCode: "EUR",
  minorUnitsPerMajor: 100,
  pointUnitName: "Petals",
  redemption: {
    pointsPerMajorUnit: points(100),
    cashRedemption: false,
  },
  award: {
    initialState: "pending",
    releaseDelayDays: 30,
    rounding: "floor-once-per-order",
    tierSnapshotRequired: true,
  },
  eligibleSpend: {
    afterDiscounts: true,
    excludes: [
      "shipping",
      "tax",
      "fees",
      "gift-card-and-store-credit-payments",
      "refunded-amounts",
    ],
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
  tiers: [
    {
      code: tierCode("rose"),
      name: "Rose",
      minimumEligibleSpendMinor: minorUnit(0),
      pointsPerMajorUnit: points(5),
    },
    {
      code: tierCode("bloom"),
      name: "Bloom",
      minimumEligibleSpendMinor: minorUnit(15_000),
      pointsPerMajorUnit: points(6),
    },
    {
      code: tierCode("icon"),
      name: "Icon",
      minimumEligibleSpendMinor: minorUnit(50_000),
      pointsPerMajorUnit: points(7),
    },
  ],
});
