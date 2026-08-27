import { describe, expect, it } from "vitest";
import { customerTierProgressV1, tierPerformanceV1 } from "./tier-progression";

const tier = { code: "bloom", name: "Bloom" };
const threshold = {
  metric: "eligible_spend" as const,
  activityCodes: [],
  actual: "12500",
  minimum: "15000",
  remaining: "2500",
  matched: false,
};

describe("tier progression read contracts", () => {
  it("keeps qualification progress exact and separate from wallet balances", () => {
    const parsed = customerTierProgressV1.parse({
      version: "1",
      programmeVersionId: "85000000-0000-4000-8000-000000000201",
      currentTier: { code: "rose", name: "Rose" },
      automaticTier: { code: "rose", name: "Rose" },
      qualifiedTier: { code: "rose", name: "Rose" },
      transition: "none",
      effectiveFrom: "2026-08-01T00:00:00Z",
      window: {
        kind: "rolling_days",
        startsAt: "2025-08-14T00:00:00Z",
        endsAt: "2026-08-14T00:00:00Z",
      },
      metrics: {
        eligibleSpendMinor: "12500",
        earnedPoints: "9007199254740993",
        orderCount: "4",
        referralCount: "1",
        verifiedActionCount: "0",
        verifiedActionCounts: {},
      },
      nextMilestone: {
        tier,
        thresholdKind: "entry",
        operator: "all",
        matched: false,
        thresholds: [threshold],
      },
      retention: null,
      graceUntil: null,
      activeOverrideUntil: null,
      history: [],
    });
    expect(parsed.metrics.earnedPoints).toBe("9007199254740993");
    expect(parsed.nextMilestone?.thresholds[0]?.remaining).toBe("2500");
    expect("availablePoints" in parsed).toBe(false);
  });

  it("rejects inconsistent or lossy performance values", () => {
    expect(() =>
      tierPerformanceV1.parse({
        version: "1",
        asOf: "2026-08-14T00:00:00Z",
        programmeVersionId: null,
        totalMembers: 12,
        membersWithTier: "10",
        inGrace: "1",
        activeManualOverrides: "0",
        transitions30Days: {
          entries: "2",
          upgrades: "1",
          reentries: "0",
          downgrades: "0",
        },
        tiers: [{ tier, ordinal: 2, memberCount: "4" }],
      }),
    ).toThrow();
  });

  it("rejects fabricated threshold remaining and milestone state", () => {
    expect(() =>
      customerTierProgressV1.parse({
        version: "1",
        programmeVersionId: "85000000-0000-4000-8000-000000000201",
        currentTier: { code: "rose", name: "Rose" },
        automaticTier: { code: "rose", name: "Rose" },
        qualifiedTier: { code: "rose", name: "Rose" },
        transition: "none",
        effectiveFrom: "2026-08-01T00:00:00Z",
        window: { kind: "lifetime", startsAt: null, endsAt: null },
        metrics: {
          eligibleSpendMinor: "12500",
          earnedPoints: "0",
          orderCount: "0",
          referralCount: "0",
          verifiedActionCount: "0",
          verifiedActionCounts: {},
        },
        nextMilestone: {
          tier,
          thresholdKind: "entry",
          operator: "all",
          matched: true,
          thresholds: [{ ...threshold, remaining: "1" }],
        },
        retention: null,
        graceUntil: null,
        activeOverrideUntil: null,
        history: [],
      }),
    ).toThrow();
  });
});
