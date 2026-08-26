import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ schema: () => ({ rpc }) }),
}));

import { getBillingSummary } from "./billing";

const organizationId = "a1000000-0000-4000-8000-000000000100";

function fixture() {
  return {
    schemaVersion: "1",
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
    expect(rpc).toHaveBeenCalledWith("get_my_billing_summary_v1", {
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
