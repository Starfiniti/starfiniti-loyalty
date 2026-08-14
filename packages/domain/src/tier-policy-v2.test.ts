import { describe, expect, it } from "vitest";
import {
  tierPolicyV2,
  type TierQualificationThresholdV2,
} from "@starfiniti/contracts/tier-policy-v2";
import {
  evaluateTierQualificationSnapshotV2,
  evaluateTierQualificationV2,
  migrateLegacySpendTiersToPolicyV2,
  type TierQualificationFactV2,
} from "./tier-policy-v2";

const zeroDeltas = {
  eligibleSpendMinorDelta: "0",
  earnedPointsDelta: "0",
  orderCountDelta: "0",
  referralCountDelta: "0",
  verifiedActionCountDelta: "0",
  activityCode: null,
};

function fact(
  reference: string,
  effectiveAt: string,
  patch: Partial<TierQualificationFactV2>,
): TierQualificationFactV2 {
  return {
    reference,
    kind: "purchase",
    effectiveAt,
    recordedAt: effectiveAt,
    ...zeroDeltas,
    ...patch,
  };
}

function expression(
  operator: "all" | "any",
  thresholds: TierQualificationThresholdV2[],
) {
  return { operator, thresholds };
}

const benefits = {
  earningMultiplierBasisPoints: 10_000,
  rewardCodes: [],
  earlyAccess: false,
};

const policy = tierPolicyV2.parse({
  version: "2",
  qualificationPeriod: { kind: "lifetime" },
  downgradeGraceDays: 30,
  levels: [
    {
      tierCode: "rose",
      entry: null,
      retention: null,
      reentry: null,
      benefits,
    },
    {
      tierCode: "bloom",
      entry: expression("all", [
        {
          metric: "eligible_spend",
          minimum: "15000",
          activityCodes: [],
        },
        { metric: "order_count", minimum: "2", activityCodes: [] },
      ]),
      retention: expression("any", [
        {
          metric: "eligible_spend",
          minimum: "12500",
          activityCodes: [],
        },
        { metric: "order_count", minimum: "3", activityCodes: [] },
      ]),
      reentry: expression("all", [
        {
          metric: "eligible_spend",
          minimum: "10000",
          activityCodes: [],
        },
      ]),
      benefits,
    },
    {
      tierCode: "icon",
      entry: expression("any", [
        {
          metric: "earned_points",
          minimum: "5000",
          activityCodes: [],
        },
        {
          metric: "verified_action_count",
          minimum: "3",
          activityCodes: ["verified-review"],
        },
      ]),
      retention: expression("all", [
        {
          metric: "earned_points",
          minimum: "4500",
          activityCodes: [],
        },
      ]),
      reentry: expression("all", [
        {
          metric: "earned_points",
          minimum: "4000",
          activityCodes: [],
        },
      ]),
      benefits,
    },
  ],
});

describe("advanced tier qualification", () => {
  it("uses the same pure decision path for authoritative metric snapshots", () => {
    const result = evaluateTierQualificationSnapshotV2({
      policy,
      metrics: {
        eligibleSpendMinor: "15000",
        earnedPoints: "750",
        orderCount: "2",
        referralCount: "0",
        verifiedActionCount: "0",
        verifiedActionCounts: {},
      },
      evaluatedAt: "2026-02-01T10:00:00Z",
      currentTierCode: "rose",
      previouslyHeldTierCodes: ["rose"],
      belowThresholdSince: null,
    });
    expect(result).toMatchObject({
      qualifiedTierCode: "bloom",
      effectiveTierCode: "bloom",
      transition: "upgrade",
    });
  });

  it("evaluates AND/OR entry thresholds and exact next progress", () => {
    const result = evaluateTierQualificationV2({
      policy,
      facts: [
        fact("order-1", "2026-01-01T10:00:00Z", {
          eligibleSpendMinorDelta: "15000",
          earnedPointsDelta: "750",
          orderCountDelta: "1",
        }),
      ],
      evaluatedAt: "2026-02-01T10:00:00Z",
      currentTierCode: "rose",
      previouslyHeldTierCodes: ["rose"],
      belowThresholdSince: null,
    });
    expect(result.qualifiedTierCode).toBe("rose");
    expect(result.nextMilestone).toMatchObject({
      tierCode: "bloom",
      operator: "all",
      matched: false,
      thresholds: [
        { metric: "eligible_spend", remaining: "0", matched: true },
        { metric: "order_count", remaining: "1", matched: false },
      ],
    });

    const upgraded = evaluateTierQualificationV2({
      policy,
      facts: [
        fact("order-1", "2026-01-01T10:00:00Z", {
          eligibleSpendMinorDelta: "15000",
          earnedPointsDelta: "5000",
          orderCountDelta: "2",
        }),
      ],
      evaluatedAt: "2026-02-01T10:00:00Z",
      currentTierCode: "rose",
      previouslyHeldTierCodes: ["rose"],
      belowThresholdSince: null,
    });
    expect(upgraded).toMatchObject({
      qualifiedTierCode: "icon",
      effectiveTierCode: "icon",
      transition: "upgrade",
    });
  });

  it("uses retention and re-entry expressions according to immutable history", () => {
    const retained = evaluateTierQualificationV2({
      policy,
      facts: [
        fact("orders", "2026-01-01T00:00:00Z", {
          eligibleSpendMinorDelta: "12500",
          orderCountDelta: "1",
        }),
      ],
      evaluatedAt: "2026-06-01T00:00:00Z",
      currentTierCode: "bloom",
      previouslyHeldTierCodes: ["rose", "bloom"],
      belowThresholdSince: null,
    });
    expect(retained).toMatchObject({
      qualifiedTierCode: "bloom",
      effectiveTierCode: "bloom",
      transition: "none",
    });
    expect(retained.levels[1]?.thresholdKind).toBe("retention");

    const reentered = evaluateTierQualificationV2({
      policy,
      facts: [
        fact("order", "2026-01-01T00:00:00Z", {
          eligibleSpendMinorDelta: "10000",
          orderCountDelta: "1",
        }),
      ],
      evaluatedAt: "2026-06-01T00:00:00Z",
      currentTierCode: "rose",
      previouslyHeldTierCodes: ["rose", "bloom"],
      belowThresholdSince: null,
    });
    expect(reentered).toMatchObject({
      qualifiedTierCode: "bloom",
      effectiveTierCode: "bloom",
      transition: "reentry",
    });
    expect(reentered.levels[1]?.thresholdKind).toBe("reentry");
  });

  it("retains a tier through grace and downgrades at the exact boundary", () => {
    const input = {
      policy,
      facts: [],
      currentTierCode: "bloom",
      previouslyHeldTierCodes: ["rose", "bloom"],
      belowThresholdSince: "2026-05-01T00:00:00Z",
    } as const;
    expect(
      evaluateTierQualificationV2({
        ...input,
        evaluatedAt: "2026-05-30T23:59:59Z",
      }),
    ).toMatchObject({
      qualifiedTierCode: "rose",
      effectiveTierCode: "bloom",
      transition: "grace",
      graceUntil: "2026-05-31T00:00:00.000Z",
    });
    expect(
      evaluateTierQualificationV2({
        ...input,
        evaluatedAt: "2026-05-31T00:00:00Z",
      }),
    ).toMatchObject({
      qualifiedTierCode: "rose",
      effectiveTierCode: "rose",
      transition: "downgrade",
    });
  });

  it("uses half-open rolling windows and original-event attribution for refunds", () => {
    const rollingPolicy = {
      ...migrateLegacySpendTiersToPolicyV2([
        { code: "rose", minimumEligibleSpendMinor: "0" },
        { code: "bloom", minimumEligibleSpendMinor: "15000" },
      ]),
      qualificationPeriod: { kind: "rolling_days" as const, days: 30 },
    };
    const evaluatedAt = "2026-02-01T00:00:00Z";
    const result = evaluateTierQualificationV2({
      policy: rollingPolicy,
      facts: [
        fact("excluded-before-boundary", "2026-01-01T23:59:59.999Z", {
          eligibleSpendMinorDelta: "10000",
        }),
        fact("included", "2026-01-02T00:00:00.001Z", {
          eligibleSpendMinorDelta: "20000",
        }),
        fact("refund:included", "2026-01-02T00:00:00.001Z", {
          kind: "refund",
          recordedAt: "2026-01-31T00:00:00Z",
          eligibleSpendMinorDelta: "-5000",
        }),
      ],
      evaluatedAt,
      currentTierCode: "rose",
      previouslyHeldTierCodes: ["rose"],
      belowThresholdSince: null,
    });
    expect(result.metrics.eligibleSpendMinor).toBe("15000");
    expect(result.qualifiedTierCode).toBe("bloom");
  });

  it("builds calendar-year windows from the configured IANA zone across DST", () => {
    const calendarPolicy = {
      ...migrateLegacySpendTiersToPolicyV2([
        { code: "rose", minimumEligibleSpendMinor: "0" },
        { code: "bloom", minimumEligibleSpendMinor: "15000" },
      ]),
      qualificationPeriod: {
        kind: "calendar_year" as const,
        timeZone: "Europe/Ljubljana",
      },
    };
    const result = evaluateTierQualificationV2({
      policy: calendarPolicy,
      facts: [
        fact("prior-year", "2025-12-31T22:59:59Z", {
          eligibleSpendMinorDelta: "99999",
        }),
        fact("new-year", "2025-12-31T23:00:00Z", {
          eligibleSpendMinorDelta: "15000",
        }),
      ],
      evaluatedAt: "2026-08-14T12:00:00+02:00",
      currentTierCode: "rose",
      previouslyHeldTierCodes: ["rose"],
      belowThresholdSince: null,
    });
    expect(result.window).toEqual({
      kind: "calendar_year",
      startsAt: "2025-12-31T23:00:00.000Z",
      endsAt: "2026-12-31T23:00:00.000Z",
    });
    expect(result.metrics.eligibleSpendMinor).toBe("15000");
    expect(result.qualifiedTierCode).toBe("bloom");
  });

  it("preserves Rose Bloom Icon boundaries with the legacy migration", () => {
    const rosyPolicy = migrateLegacySpendTiersToPolicyV2([
      {
        code: "rose",
        minimumEligibleSpendMinor: "0",
        pointsPerMajorUnit: "5",
      },
      {
        code: "bloom",
        minimumEligibleSpendMinor: "15000",
        pointsPerMajorUnit: "6",
      },
      {
        code: "icon",
        minimumEligibleSpendMinor: "50000",
        pointsPerMajorUnit: "7",
      },
    ]);
    expect(
      rosyPolicy.levels.map(
        (level) => level.benefits.earningMultiplierBasisPoints,
      ),
    ).toEqual([10_000, 12_000, 14_000]);
    for (const [spend, expected] of [
      ["0", "rose"],
      ["14999", "rose"],
      ["15000", "bloom"],
      ["49999", "bloom"],
      ["50000", "icon"],
    ] as const) {
      const result = evaluateTierQualificationV2({
        policy: rosyPolicy,
        facts:
          spend === "0"
            ? []
            : [
                fact(`spend:${spend}`, "2026-08-01T00:00:00Z", {
                  eligibleSpendMinorDelta: spend,
                }),
              ],
        evaluatedAt: "2026-08-14T00:00:00Z",
        currentTierCode: null,
        previouslyHeldTierCodes: [],
        belowThresholdSince: null,
      });
      expect(result.qualifiedTierCode).toBe(expected);
    }
  });

  it("rejects duplicate and negative aggregate facts instead of masking drift", () => {
    const duplicate = fact("same", "2026-01-01T00:00:00Z", {});
    expect(() =>
      evaluateTierQualificationV2({
        policy,
        facts: [duplicate, duplicate],
        evaluatedAt: "2026-02-01T00:00:00Z",
        currentTierCode: null,
        previouslyHeldTierCodes: [],
        belowThresholdSince: null,
      }),
    ).toThrow("Duplicate qualification fact");
    expect(() =>
      evaluateTierQualificationV2({
        policy,
        facts: [
          fact("refund", "2026-01-01T00:00:00Z", {
            kind: "refund",
            eligibleSpendMinorDelta: "-1",
          }),
        ],
        evaluatedAt: "2026-02-01T00:00:00Z",
        currentTierCode: null,
        previouslyHeldTierCodes: [],
        belowThresholdSince: null,
      }),
    ).toThrow("Eligible spend cannot be negative");
  });
});
