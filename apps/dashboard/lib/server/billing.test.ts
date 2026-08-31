import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ schema: () => ({ rpc }) }),
}));

import {
  getBillingSummary,
  getManagedBillingUsageSummary,
  utcMonthStart,
} from "./billing";

const organizationId = "a1000000-0000-4000-8000-000000000100";

function fixture() {
  return {
    schemaVersion: "2",
    organizationId,
    deploymentMode: "self_hosted",
    commercialState: "self_hosted",
    billingAvailable: false,
    providerLinked: false,
    subscriptionPresent: false,
    growthConfigurationAllowed: true,
    restriction: "none",
    trialEndsAt: null,
    currentPeriodEndsAt: null,
    graceEndsAt: null,
    evaluatedAt: "2026-08-26T20:00:00Z",
    stateUpdatedAt: null,
    stateSource: "self_hosted",
    restrictionReason: "none",
    contractEndsAt: null,
    protectedAccess: {
      balanceRead: true,
      refunds: true,
      reconciliation: true,
      checkoutIndependence: true,
      exports: true,
      promisedRewardRedemption: true,
    },
  } as const;
}

describe("billing summary server read", () => {
  beforeEach(() => rpc.mockReset());

  it("parses one minimized Auth-scoped database summary", async () => {
    rpc.mockResolvedValue({
      data: [{ billing_summary: fixture() }],
      error: null,
    });
    await expect(getBillingSummary(organizationId)).resolves.toEqual(fixture());
    expect(rpc).toHaveBeenCalledWith("get_my_billing_summary_v2", {
      target_organization_public_id: organizationId,
    });
  });

  it("fails closed on missing multiple malformed or expanded data", async () => {
    for (const data of [
      null,
      [],
      [{ billing_summary: fixture() }, { billing_summary: fixture() }],
      [
        {
          billing_summary: {
            ...fixture(),
            stripeCustomerId: "cus_private",
          },
        },
      ],
    ]) {
      rpc.mockResolvedValueOnce({ data, error: null });
      await expect(getBillingSummary(organizationId)).rejects.toThrow(
        "billing_summary_unavailable",
      );
    }
  });
});

describe("managed billing usage server read", () => {
  beforeEach(() => rpc.mockReset());

  const usage = {
    schemaVersion: "1",
    organizationId,
    periodStart: "2026-08-01T00:00:00Z",
    periodEnd: "2026-09-01T00:00:00Z",
    measuredAt: "2026-08-27T01:00:00Z",
    dispatchMode: "shadow",
    meters: [
      ["orders", "Orders ingested", "4"],
      ["active_members", "Active members", "3"],
      ["messages", "Messages delivered", "2"],
      ["api_requests", "Accepted API commands", "1"],
    ].map(([meterKey, label, quantity]) => ({
      meterKey,
      label,
      quantity,
      dispatchedQuantity: "0",
      factCount: quantity,
      pendingCount: quantity,
      attentionCount: "0",
    })),
  };

  it("reads one strict live-member usage summary for an exact UTC month", async () => {
    rpc.mockResolvedValue({ data: [{ usage_summary: usage }], error: null });
    await expect(
      getManagedBillingUsageSummary(organizationId, usage.periodStart),
    ).resolves.toEqual(usage);
    expect(rpc).toHaveBeenCalledWith(
      "get_my_managed_billing_usage_summary_v2",
      {
        target_organization_public_id: organizationId,
        target_period_start: usage.periodStart,
      },
    );
    expect(utcMonthStart(new Date("2026-08-27T23:30:00-07:00"))).toBe(
      "2026-08-01T00:00:00.000Z",
    );
  });

  it("fails closed on expanded or malformed usage evidence", async () => {
    for (const usageSummary of [
      { ...usage, providerCustomerId: "cus_private" },
      { ...usage, meters: usage.meters.slice(0, 3) },
      { ...usage, periodEnd: usage.periodStart },
    ]) {
      rpc.mockResolvedValueOnce({
        data: [{ usage_summary: usageSummary }],
        error: null,
      });
      await expect(
        getManagedBillingUsageSummary(organizationId, usage.periodStart),
      ).rejects.toThrow("billing_usage_summary_unavailable");
    }
  });
});
