import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ schema: () => ({ rpc }) }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createCustomerReferralLink } from "./referral-actions";

const idle = { kind: "idle" as const, message: "", shareUrl: null };

describe("customer referral link action", () => {
  beforeEach(() => rpc.mockReset());

  it("passes only the linked-account selector and request identity", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          advocate_code: "89000000-0000-4000-8000-000000000001",
          share_url:
            "https://shop.example.test/?stf_ref=89000000-0000-4000-8000-000000000001",
          outcome: "created",
        },
      ],
      error: null,
    });
    const form = new FormData();
    form.set("accountId", "89000000-0000-4000-8000-000000000002");
    form.set("operationId", "89000000-0000-4000-8000-000000000003");

    const state = await createCustomerReferralLink(idle, form);
    expect(state.kind).toBe("success");
    expect(state.shareUrl).toContain("stf_ref=");
    expect(rpc).toHaveBeenCalledWith("create_my_referral_link", {
      target_account_public_id: "89000000-0000-4000-8000-000000000002",
      target_request_id: "89000000-0000-4000-8000-000000000003",
    });
    expect(rpc).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ target_customer_id: expect.anything() }),
    );
  });

  it("rejects malformed selectors before reaching PostgreSQL", async () => {
    const form = new FormData();
    form.set("accountId", "not-an-account");
    form.set("operationId", "also-invalid");
    expect((await createCustomerReferralLink(idle, form)).kind).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("fails closed on a noncanonical URL", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          advocate_code: "89000000-0000-4000-8000-000000000001",
          share_url:
            "https://shop.example.test/?stf_ref=89000000-0000-4000-8000-000000000001&customer=email",
          outcome: "created",
        },
      ],
      error: null,
    });
    const form = new FormData();
    form.set("accountId", "89000000-0000-4000-8000-000000000002");
    form.set("operationId", "89000000-0000-4000-8000-000000000003");
    expect((await createCustomerReferralLink(idle, form)).kind).toBe("error");
  });
});
