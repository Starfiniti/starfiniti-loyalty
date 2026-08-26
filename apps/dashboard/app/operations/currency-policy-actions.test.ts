import { beforeEach, describe, expect, it, vi } from "vitest";

const { revalidatePath, rpc } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    schema: () => ({ rpc }),
  }),
}));

import { configureProgrammeCurrencyPolicy } from "./currency-policy-actions";

const programmeVersionId = "98000000-0000-4000-8000-000000000001";
const operationId = "98000000-0000-4000-8000-000000000002";
const resourceId = "98000000-0000-4000-8000-000000000003";
const idle = { kind: "idle", message: "" } as const;

function commandForm(): FormData {
  const form = new FormData();
  form.set("confirmation", "configure");
  form.set("operationId", operationId);
  form.set("programmeVersionId", programmeVersionId);
  form.set("sourceCurrencyCode", "USD");
  form.set("sourceMinorUnitDigits", "2");
  form.set("providerKey", "approved-feed");
  form.set("maxRateAgeSeconds", "86400");
  form.set("state", "enabled");
  form.set("expectedRevision", "2");
  return form;
}

describe("programme currency policy action", () => {
  beforeEach(() => {
    rpc.mockReset();
    revalidatePath.mockReset();
  });

  it("sends only public policy selectors and its optimistic revision", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          policy_version_public_id: resourceId,
          outcome: "created",
          revision: 3,
          state: "enabled",
        },
      ],
      error: null,
    });
    await expect(
      configureProgrammeCurrencyPolicy(idle, commandForm()),
    ).resolves.toEqual({
      kind: "success",
      message:
        "Currency policy revision 3 saved with immutable audit evidence.",
    });
    expect(rpc).toHaveBeenCalledWith(
      "configure_programme_currency_policy_v1",
      expect.objectContaining({
        target_programme_version_public_id: programmeVersionId,
        target_source_currency_code: "USD",
        target_source_minor_unit_digits: 2,
        target_provider_key: "approved-feed",
        target_expected_revision: 2,
        target_idempotency_key: `currency-policy:configure:${operationId}`,
      }),
    );
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty("organization_id");
    expect(revalidatePath).toHaveBeenCalledWith("/operations");
  });

  it("rejects malformed or unreviewed input before database access", async () => {
    const unreviewed = commandForm();
    unreviewed.delete("confirmation");
    await expect(
      configureProgrammeCurrencyPolicy(idle, unreviewed),
    ).resolves.toMatchObject({ kind: "error" });

    const invalidCurrency = commandForm();
    invalidCurrency.set("sourceCurrencyCode", "usd");
    await expect(
      configureProgrammeCurrencyPolicy(idle, invalidCurrency),
    ).resolves.toMatchObject({ kind: "error" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps authorization and revision conflicts without claiming success", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    await expect(
      configureProgrammeCurrencyPolicy(idle, commandForm()),
    ).resolves.toMatchObject({
      kind: "error",
      message: expect.stringContaining("owner/admin"),
    });

    rpc.mockResolvedValueOnce({ data: null, error: { code: "23514" } });
    await expect(
      configureProgrammeCurrencyPolicy(idle, commandForm()),
    ).resolves.toMatchObject({
      kind: "error",
      message: expect.stringContaining("concurrently"),
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("fails closed when the database result changes shape", async () => {
    rpc.mockResolvedValue({ data: [{ revision: 3 }], error: null });
    await expect(
      configureProgrammeCurrencyPolicy(idle, commandForm()),
    ).resolves.toEqual({
      kind: "error",
      message: "The saved currency policy response could not be verified.",
    });
  });
});
