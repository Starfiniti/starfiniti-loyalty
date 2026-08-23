import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ schema: () => ({ rpc }) }),
}));

import { getCampaignResults } from "./campaigns";

const baseResult = {
  schemaVersion: "1",
  programmeId: "87000000-0000-4000-8000-000000000001",
  campaignId: "87000000-0000-4000-8000-000000000002",
  campaignVersionId: "87000000-0000-4000-8000-000000000003",
  campaignCode: "autumn_bonus",
  campaignName: "Autumn bonus",
  versionNumber: 1,
  status: "active",
  startsAt: "2026-08-20T10:00:00Z",
  endsAt: "2026-09-20T10:00:00Z",
  generatedAt: "2026-08-24T00:00:00Z",
  assignments: { eligible: "10", treatment: "9", control: "1" },
  capacity: {
    globalEffectLimit: "100",
    maximumPoints: "10000",
    maximumLiabilityMinor: null,
    reservedEffects: "0",
    committedEffects: "2",
    reservedPoints: "0",
    committedPoints: "20",
    reservedLiabilityMinor: "0",
    committedLiabilityMinor: "0",
  },
  purchaseOutcomes: {
    awarded: "2",
    control: "0",
    capacityExhausted: "0",
    suppressed: "0",
    reversedAwards: "0",
  },
  triggerJobs: {
    pending: "0",
    processing: "0",
    retryable: "0",
    completed: "0",
    cancelled: "0",
    manualReview: "0",
  },
  triggerOutcomes: {
    pointsAwarded: "0",
    rewardReserved: "0",
    control: "0",
    capacityExhausted: "0",
    pointsReversed: "0",
    rewardCancellationRequested: "0",
    rewardAlreadyResolved: "0",
    rewardNonreversible: "0",
    noValueToReverse: "0",
  },
  measurement: {
    classification: "influenced",
    incrementalityState: "not_measured",
    explanation:
      "These are directly attributed campaign outcomes, not experimentally measured incremental lift.",
  },
};

describe("campaign merchant results read", () => {
  beforeEach(() => rpc.mockReset());

  it("parses exact minimized aggregate rows", async () => {
    rpc.mockResolvedValue({
      data: [{ campaign_result: baseResult }],
      error: null,
    });
    const results = await getCampaignResults(baseResult.programmeId);
    expect(results[0]?.capacity.committedPoints).toBe("20");
    expect(rpc).toHaveBeenCalledWith("get_campaign_results_v1", {
      target_programme_public_id: baseResult.programmeId,
      target_limit: 100,
    });
  });

  it("fails closed on causal claims or unreconciled assignments", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          campaign_result: {
            ...baseResult,
            measurement: {
              ...baseResult.measurement,
              incrementalityState: "measured",
            },
          },
        },
      ],
      error: null,
    });
    await expect(getCampaignResults(baseResult.programmeId)).rejects.toThrow();
  });
});
