import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.hoisted(() => vi.fn());
const getUserIdentities = vi.hoisted(() => vi.fn());
const hasCookie = vi.hoisted(() => vi.fn());
const getWorkspace = vi.hoisted(() => vi.fn());
const resolveLogin = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  cookies: async () => ({ has: hasCookie }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { exchangeCodeForSession, getUserIdentities },
  }),
}));
vi.mock("@/lib/server/enterprise-identity", () => ({
  getOrganizationFederationWorkspace: getWorkspace,
  resolveOrganizationFederationLogin: resolveLogin,
}));

import { GET } from "./route";

const organizationId = "20000000-0000-4000-8000-000000000001";
const provider = "custom:loyalty-0123456789abcdefghij";
const flowId = "bc0f26282e6abeac61d7b21c49683e6a";

describe("tenant federation link callback", () => {
  const originalOrigin = process.env.DASHBOARD_PUBLIC_ORIGIN;

  beforeEach(() => {
    process.env.DASHBOARD_PUBLIC_ORIGIN = "https://loyalty.starfiniti.com";
    vi.clearAllMocks();
    hasCookie.mockReturnValue(true);
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getWorkspace.mockResolvedValue({
      organization: { slug: "acme" },
    });
    resolveLogin.mockResolvedValue({
      schemaVersion: "2",
      organizationId,
      provider,
    });
    getUserIdentities.mockResolvedValue({
      data: { identities: [{ provider }] },
      error: null,
    });
  });

  afterEach(() => {
    if (originalOrigin === undefined) {
      delete process.env.DASHBOARD_PUBLIC_ORIGIN;
    } else {
      process.env.DASHBOARD_PUBLIC_ORIGIN = originalOrigin;
    }
  });

  it("verifies the exact linked provider and retained live membership", async () => {
    const response = await GET(
      new Request(
        `https://0.0.0.0:3000/auth/link/callback?organization=${organizationId}&code=one-time-code&sb_flow_id=${flowId}`,
      ),
    );

    expect(exchangeCodeForSession).toHaveBeenCalledWith("one-time-code", {
      flowId,
    });
    expect(hasCookie).toHaveBeenCalledWith(
      "sb-api-auth-token-flow-bc0f26282e6abeac61d7b21c49683e6a-code-verifier",
    );
    expect(response.headers.get("location")).toBe(
      "https://loyalty.starfiniti.com/organization/access?federationLink=success",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("fails when the returned identity belongs to a different provider", async () => {
    getUserIdentities.mockResolvedValue({
      data: { identities: [{ provider: "email" }] },
      error: null,
    });
    const response = await GET(
      new Request(
        `https://0.0.0.0:3000/auth/link/callback?organization=${organizationId}&code=one-time-code&sb_flow_id=${flowId}`,
      ),
    );

    expect(response.headers.get("location")).toContain(
      "federationLink=failed&reason=link_not_verified",
    );
  });

  it("does not exchange without the exact PKCE verifier", async () => {
    hasCookie.mockReturnValue(false);
    const response = await GET(
      new Request(
        `https://0.0.0.0:3000/auth/link/callback?organization=${organizationId}&code=one-time-code&sb_flow_id=${flowId}`,
      ),
    );

    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(hasCookie).toHaveBeenCalledWith(
      "sb-api-auth-token-flow-bc0f26282e6abeac61d7b21c49683e6a-code-verifier",
    );
    expect(response.headers.get("location")).toContain(
      "reason=verifier_cookie_missing",
    );
  });

  it("fails closed when membership disappears during enrollment", async () => {
    getWorkspace.mockResolvedValue(null);
    const response = await GET(
      new Request(
        `https://0.0.0.0:3000/auth/link/callback?organization=${organizationId}&code=one-time-code&sb_flow_id=${flowId}`,
      ),
    );

    expect(response.headers.get("location")).toContain(
      "reason=link_not_verified",
    );
  });
});
