import { describe, expect, it } from "vitest";
import {
  balanceAfterReversal,
  calculateOrderAward,
  calculateRefundReversal,
  minorUnit,
  orderLotsForRedemption,
  points,
  reviewTier,
  tierCode,
  tierForEligibleSpend,
  validateProgrammeVersion,
  type ProgrammeVersion,
} from "./index";
import { rosyRewardsV1 } from "./rosy-rewards";

describe("programme awards", () => {
  it("uses an explicit tier snapshot and floors once per order", () => {
    const quote = calculateOrderAward(rosyRewardsV1, {
      eligibleSpendMinor: minorUnit(12_345),
      tierCodeSnapshot: tierCode("rose"),
      pendingAt: "2026-08-11T10:15:00.000Z",
    });

    expect(quote).toMatchObject({
      programmeVersionId: "rosy-rewards:v1",
      tierCode: "rose",
      eligibleSpendMinor: 12_345,
      points: 617,
      state: "pending",
      pendingAt: "2026-08-11T10:15:00.000Z",
      availableAt: "2026-09-10T10:15:00.000Z",
      expiresAt: "2027-09-10T10:15:00.000Z",
    });
  });

  it("clamps rolling expiry at the end of shorter calendar months", () => {
    const quote = calculateOrderAward(rosyRewardsV1, {
      eligibleSpendMinor: minorUnit(10_000),
      tierCodeSnapshot: tierCode("icon"),
      pendingAt: "2024-01-30T12:00:00.000Z",
    });

    expect(quote.availableAt).toBe("2024-02-29T12:00:00.000Z");
    expect(quote.expiresAt).toBe("2025-02-28T12:00:00.000Z");
    expect(quote.points).toBe(700);
  });

  it("rejects implicit or invalid award inputs", () => {
    expect(() =>
      calculateOrderAward(rosyRewardsV1, {
        eligibleSpendMinor: minorUnit(100),
        tierCodeSnapshot: tierCode("not-a-tier"),
        pendingAt: "2026-08-11T10:15:00.000Z",
      }),
    ).toThrow("Unknown tier");
    expect(() =>
      calculateOrderAward(rosyRewardsV1, {
        eligibleSpendMinor: minorUnit(-1),
        tierCodeSnapshot: tierCode("rose"),
        pendingAt: "2026-08-11T10:15:00.000Z",
      }),
    ).toThrow("non-negative");
    expect(() =>
      calculateOrderAward(rosyRewardsV1, {
        eligibleSpendMinor: minorUnit(100),
        tierCodeSnapshot: tierCode("rose"),
        pendingAt: "not-a-date",
      }),
    ).toThrow("invalid");
  });
});

describe("tier qualification", () => {
  it("selects tiers exactly at the approved spend boundaries", () => {
    expect(tierForEligibleSpend(rosyRewardsV1, minorUnit(14_999)).code).toBe(
      "rose",
    );
    expect(tierForEligibleSpend(rosyRewardsV1, minorUnit(15_000)).code).toBe(
      "bloom",
    );
    expect(tierForEligibleSpend(rosyRewardsV1, minorUnit(49_999)).code).toBe(
      "bloom",
    );
    expect(tierForEligibleSpend(rosyRewardsV1, minorUnit(50_000)).code).toBe(
      "icon",
    );
  });

  it("upgrades immediately and applies the 30-day downgrade grace", () => {
    expect(
      reviewTier(rosyRewardsV1, {
        currentTierCode: tierCode("rose"),
        rollingEligibleSpendMinor: minorUnit(50_000),
        evaluatedAt: "2026-07-01T00:00:00.000Z",
        belowThresholdSince: null,
      }),
    ).toMatchObject({
      qualifiedTierCode: "icon",
      effectiveTierCode: "icon",
      transition: "upgrade",
      belowThresholdSince: null,
      graceUntil: null,
    });

    const graceStarted = reviewTier(rosyRewardsV1, {
      currentTierCode: tierCode("icon"),
      rollingEligibleSpendMinor: minorUnit(14_999),
      evaluatedAt: "2026-07-01T00:00:00.000Z",
      belowThresholdSince: null,
    });
    expect(graceStarted).toMatchObject({
      transition: "grace",
      belowThresholdSince: "2026-07-01T00:00:00.000Z",
      graceUntil: "2026-07-31T00:00:00.000Z",
    });

    expect(
      reviewTier(rosyRewardsV1, {
        currentTierCode: tierCode("icon"),
        rollingEligibleSpendMinor: minorUnit(14_999),
        evaluatedAt: "2026-07-15T00:00:00.000Z",
        belowThresholdSince: graceStarted.belowThresholdSince,
      }),
    ).toMatchObject({
      qualifiedTierCode: "rose",
      effectiveTierCode: "icon",
      transition: "grace",
      belowThresholdSince: "2026-07-01T00:00:00.000Z",
      graceUntil: "2026-07-31T00:00:00.000Z",
    });

    expect(
      reviewTier(rosyRewardsV1, {
        currentTierCode: tierCode("icon"),
        rollingEligibleSpendMinor: minorUnit(14_999),
        evaluatedAt: "2026-07-31T00:00:00.000Z",
        belowThresholdSince: "2026-07-01T00:00:00.000Z",
      }),
    ).toMatchObject({
      qualifiedTierCode: "rose",
      effectiveTierCode: "rose",
      transition: "downgrade",
    });

    expect(
      reviewTier(rosyRewardsV1, {
        currentTierCode: tierCode("rose"),
        rollingEligibleSpendMinor: minorUnit(0),
        evaluatedAt: "2026-07-31T00:00:00.000Z",
        belowThresholdSince: null,
        manualTierCode: tierCode("icon"),
      }),
    ).toMatchObject({
      qualifiedTierCode: "rose",
      effectiveTierCode: "icon",
      transition: "manual",
    });
  });

  it("rejects a future below-threshold instant", () => {
    expect(() =>
      reviewTier(rosyRewardsV1, {
        currentTierCode: tierCode("icon"),
        rollingEligibleSpendMinor: minorUnit(0),
        evaluatedAt: "2026-07-01T00:00:00.000Z",
        belowThresholdSince: "2026-07-02T00:00:00.000Z",
      }),
    ).toThrow("cannot be in the future");
  });
});

describe("refund attribution and expiry lots", () => {
  it("makes multiple partial refunds converge exactly on the original award", () => {
    const first = calculateRefundReversal({
      originalEligibleSpendMinor: minorUnit(12_345),
      originalAwardedPoints: points(617),
      cumulativeRefundedEligibleSpendMinor: minorUnit(5_000),
      alreadyReversedPoints: points(0),
    });
    const second = calculateRefundReversal({
      originalEligibleSpendMinor: minorUnit(12_345),
      originalAwardedPoints: points(617),
      cumulativeRefundedEligibleSpendMinor: minorUnit(10_000),
      alreadyReversedPoints: first,
    });
    const final = calculateRefundReversal({
      originalEligibleSpendMinor: minorUnit(12_345),
      originalAwardedPoints: points(617),
      cumulativeRefundedEligibleSpendMinor: minorUnit(12_345),
      alreadyReversedPoints: points(first + second),
    });

    expect([first, second, final]).toEqual([249, 250, 118]);
    expect(first + second + final).toBe(617);
  });

  it("rejects over-refunds and allows an attributable negative balance", () => {
    expect(() =>
      calculateRefundReversal({
        originalEligibleSpendMinor: minorUnit(10_000),
        originalAwardedPoints: points(500),
        cumulativeRefundedEligibleSpendMinor: minorUnit(10_001),
        alreadyReversedPoints: points(0),
      }),
    ).toThrow("exceeds original eligible spend");
    expect(balanceAfterReversal(points(100), points(150))).toBe(-50);
  });

  it("orders redemption lots by earliest expiry without mutating input", () => {
    const lots = [
      {
        id: "later",
        availableAt: "2026-02-01T00:00:00.000Z",
        expiresAt: "2027-02-01T00:00:00.000Z",
        remainingPoints: points(200),
      },
      {
        id: "first",
        availableAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2027-01-01T00:00:00.000Z",
        remainingPoints: points(100),
      },
    ] as const;

    expect(orderLotsForRedemption(lots).map((lot) => lot.id)).toEqual([
      "first",
      "later",
    ]);
    expect(lots.map((lot) => lot.id)).toEqual(["later", "first"]);
  });

  it("rejects an expiry lot that expires before it becomes available", () => {
    expect(() =>
      orderLotsForRedemption([
        {
          id: "invalid",
          availableAt: "2026-02-01T00:00:00.000Z",
          expiresAt: "2026-01-31T00:00:00.000Z",
          remainingPoints: points(100),
        },
      ]),
    ).toThrow("expiry must be after availability");
  });

  it("orders equivalent timestamp formats chronologically and rejects duplicate IDs", () => {
    const ordered = orderLotsForRedemption([
      {
        id: "offset-earlier",
        availableAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2027-01-01T01:00:00+02:00",
        remainingPoints: points(100),
      },
      {
        id: "z-later",
        availableAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2026-12-31T23:30:00.000Z",
        remainingPoints: points(100),
      },
    ]);
    expect(ordered.map((lot) => lot.id)).toEqual(["offset-earlier", "z-later"]);

    expect(() =>
      orderLotsForRedemption([
        {
          id: "same",
          availableAt: "2026-01-01T00:00:00.000Z",
          expiresAt: "2027-01-01T00:00:00.000Z",
          remainingPoints: points(100),
        },
        {
          id: "same",
          availableAt: "2026-02-01T00:00:00.000Z",
          expiresAt: "2027-02-01T00:00:00.000Z",
          remainingPoints: points(100),
        },
      ]),
    ).toThrow("Duplicate expiry lot ID");
  });
});

describe("programme validation", () => {
  it("rejects missing entry tiers and duplicate thresholds", () => {
    expect(() =>
      validateProgrammeVersion({
        ...rosyRewardsV1,
        tiers: [rosyRewardsV1.tiers[1]!],
      } as ProgrammeVersion),
    ).toThrow("entry tier must start at zero");

    expect(() =>
      validateProgrammeVersion({
        ...rosyRewardsV1,
        tiers: [
          rosyRewardsV1.tiers[0]!,
          {
            ...rosyRewardsV1.tiers[1]!,
            minimumEligibleSpendMinor: minorUnit(0),
          },
        ],
      } as ProgrammeVersion),
    ).toThrow("strictly increasing");
  });
});
