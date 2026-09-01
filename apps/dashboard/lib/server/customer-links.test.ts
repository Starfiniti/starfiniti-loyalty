import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));

import { getCustomerLinksState } from "./customer-links";

const document = {
  version: "1",
  links: [
    {
      version: "1",
      linkSetId: "93000000-0000-4000-8000-000000000001",
      programmeGroupId: "93000000-0000-4000-8000-000000000002",
      programmeGroupName: "Shared rewards",
      revision: 1,
      state: "active",
      members: [
        {
          accountId: "93000000-0000-4000-8000-000000000003",
          workspaceId: "93000000-0000-4000-8000-000000000004",
          workspaceName: "Alpha store",
          storeName: "Alpha WooCommerce",
          canonical: true,
          canUnlink: false,
          linkedAt: "2026-08-26T08:00:00.000Z",
        },
        {
          accountId: "93000000-0000-4000-8000-000000000005",
          workspaceId: "93000000-0000-4000-8000-000000000006",
          workspaceName: "Beta store",
          storeName: "Beta WooCommerce",
          canonical: false,
          canUnlink: true,
          linkedAt: "2026-08-26T08:01:00.000Z",
        },
      ],
    },
  ],
};

function client(input?: {
  claimsError?: boolean;
  data?: unknown;
  rpcError?: unknown;
}) {
  const rpc = vi.fn().mockResolvedValue({
    data: input?.data ?? [{ document }],
    error: input?.rpcError ?? null,
  });
  createSupabaseServerClient.mockResolvedValue({
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: input?.claimsError ? null : { claims: { sub: "subject" } },
        error: input?.claimsError ? new Error("no session") : null,
      }),
    },
    schema: vi.fn().mockReturnValue({ rpc }),
  });
  return rpc;
}

describe("customer cross-workspace link state", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns one strict minimized Auth-derived document", async () => {
    const rpc = client();
    await expect(getCustomerLinksState()).resolves.toEqual({
      kind: "ready",
      value: document,
    });
    expect(rpc).toHaveBeenCalledWith(
      "get_my_cross_workspace_customer_links_v1",
    );
  });

  it("does not call the database without a live Auth subject", async () => {
    const rpc = client({ claimsError: true });
    await expect(getCustomerLinksState()).resolves.toEqual({
      kind: "unauthenticated",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("fails closed for malformed or unavailable projections", async () => {
    client({ data: [{ document: { ...document, email: "no" } }] });
    await expect(getCustomerLinksState()).resolves.toEqual({
      kind: "unavailable",
    });
    client({ rpcError: new Error("offline") });
    await expect(getCustomerLinksState()).resolves.toEqual({
      kind: "unavailable",
    });
  });
});
