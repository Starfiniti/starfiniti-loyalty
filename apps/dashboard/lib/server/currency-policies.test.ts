import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    schema: () => ({ rpc }),
  }),
}));

import { getProgrammeCurrencyPolicies } from "./currency-policies";

const programmeVersionId = "97000000-0000-4000-8000-000000000001";
const policy = {
  version: "1",
  policyVersionId: "97000000-0000-4000-8000-000000000002",
  revision: 2,
  programmeVersionId,
  state: "enabled",
  providerKey: "approved-feed",
  sourceCurrencyCode: "USD",
  sourceMinorUnitDigits: 2,
  baseCurrencyCode: "EUR",
  baseMinorUnitDigits: 2,
  maxRateAgeSeconds: 86_400,
  roundingMode: "half_away_from_zero",
  effectiveFrom: "2026-08-26T12:00:00.000Z",
};

describe("programme currency policy read model", () => {
  beforeEach(() => rpc.mockReset());

  it("strictly parses only current policies for the requested version", async () => {
    rpc.mockResolvedValue({ data: [{ policy }], error: null });
    await expect(
      getProgrammeCurrencyPolicies(programmeVersionId),
    ).resolves.toEqual({
      kind: "ready",
      value: { version: "1", programmeVersionId, policies: [policy] },
    });
    expect(rpc).toHaveBeenCalledWith("get_programme_currency_policies_v1", {
      target_programme_version_public_id: programmeVersionId,
    });
  });

  it("accepts an explicitly empty configuration", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await expect(
      getProgrammeCurrencyPolicies(programmeVersionId),
    ).resolves.toEqual({
      kind: "ready",
      value: { version: "1", programmeVersionId, policies: [] },
    });
  });

  it("fails closed on errors, unknown fields, duplicates, or version drift", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "57014" } });
    await expect(
      getProgrammeCurrencyPolicies(programmeVersionId),
    ).resolves.toEqual({ kind: "unavailable" });

    rpc.mockResolvedValueOnce({
      data: [{ policy: { ...policy, organizationId: programmeVersionId } }],
      error: null,
    });
    await expect(
      getProgrammeCurrencyPolicies(programmeVersionId),
    ).resolves.toEqual({ kind: "unavailable" });

    rpc.mockResolvedValueOnce({
      data: [
        { policy },
        {
          policy: {
            ...policy,
            policyVersionId: "97000000-0000-4000-8000-000000000003",
          },
        },
      ],
      error: null,
    });
    await expect(
      getProgrammeCurrencyPolicies(programmeVersionId),
    ).resolves.toEqual({ kind: "unavailable" });
  });
});
