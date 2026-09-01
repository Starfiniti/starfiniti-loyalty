import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, revalidatePath } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("next/cache", () => ({ revalidatePath }));

import { unlinkCustomerStoreAccount } from "./customer-link-actions";

const accountId = "93000000-0000-4000-8000-000000000001";

function form(confirm = true) {
  const value = new FormData();
  value.set("accountId", accountId);
  if (confirm) value.set("confirmation", "unlink");
  return value;
}

function client(input?: { error?: { code: string }; data?: unknown }) {
  const rpc = vi.fn().mockResolvedValue({
    data: input?.data ?? [
      {
        link_set_public_id: "93000000-0000-4000-8000-000000000002",
        account_public_id: accountId,
        outcome: "unlinked",
        revision: 2,
        state: "unlinked",
      },
    ],
    error: input?.error ?? null,
  });
  createSupabaseServerClient.mockResolvedValue({
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: { claims: { sub: "subject" } },
        error: null,
      }),
    },
    schema: vi.fn().mockReturnValue({ rpc }),
  });
  return rpc;
}

describe("customer store unlink action", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires an explicit confirmation before any call", async () => {
    await expect(
      unlinkCustomerStoreAccount({ kind: "idle", message: "" }, form(false)),
    ).resolves.toMatchObject({ kind: "error" });
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("sends only the public account selector and operation evidence", async () => {
    const rpc = client();
    await expect(
      unlinkCustomerStoreAccount({ kind: "idle", message: "" }, form()),
    ).resolves.toMatchObject({ kind: "success" });
    expect(rpc).toHaveBeenCalledWith(
      "unlink_my_cross_workspace_customer_account_v1",
      expect.objectContaining({
        target_account_public_id: accountId,
        target_idempotency_key: `customer-link:unlink:${accountId}`,
      }),
    );
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty("organization_id");
    expect(revalidatePath).toHaveBeenCalledWith("/account/loyalty");
  });

  it("fails closed for authorization, state, and response drift", async () => {
    client({ error: { code: "42501" } });
    await expect(
      unlinkCustomerStoreAccount({ kind: "idle", message: "" }, form()),
    ).resolves.toMatchObject({
      kind: "error",
      message: "This store account is not linked to your signed-in profile.",
    });
    client({ data: [{ account_public_id: accountId }] });
    await expect(
      unlinkCustomerStoreAccount({ kind: "idle", message: "" }, form()),
    ).resolves.toMatchObject({ kind: "error" });
  });
});
