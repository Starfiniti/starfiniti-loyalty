import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.hoisted(() => vi.fn());
const hasCookie = vi.hoisted(() => vi.fn());
const claimMembership = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  cookies: async () => ({ has: hasCookie }),
}));

vi.mock("@/lib/safe-navigation", () => ({
  safeAppPath: (value: unknown) =>
    typeof value === "string" && value.startsWith("/") ? value : "/",
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { exchangeCodeForSession },
  }),
}));
vi.mock("@/lib/server/enterprise-identity", () => ({
  claimOrganizationScimMembership: claimMembership,
}));

vi.mock("@/lib/workforce-sso", () => ({
  dashboardPublicUrl: (origin: string, path: string) => new URL(path, origin),
  workforceSsoFlowId: (value: unknown) =>
    typeof value === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(value)
      ? value
      : null,
}));

import { GET } from "./route";

describe("workforce SSO callback", () => {
  const originalOrigin = process.env.DASHBOARD_PUBLIC_ORIGIN;

  beforeEach(() => {
    process.env.DASHBOARD_PUBLIC_ORIGIN = "https://loyalty.starfiniti.com";
    exchangeCodeForSession.mockReset();
    hasCookie.mockReset();
    claimMembership.mockReset();
    hasCookie.mockReturnValue(true);
    claimMembership.mockResolvedValue({
      outcome: "created",
      role: "operator",
      revision: 1,
    });
  });

  afterEach(() => {
    if (originalOrigin === undefined) {
      delete process.env.DASHBOARD_PUBLIC_ORIGIN;
    } else {
      process.env.DASHBOARD_PUBLIC_ORIGIN = originalOrigin;
    }
  });

  it("exchanges against the exact PKCE flow and redirects publicly", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const response = await GET(
      new Request(
        "https://0.0.0.0:3000/auth/callback?code=one-time-code&sb_flow_id=bc0f26282e6abeac61d7b21c49683e6a&next=%2Fprogramme",
      ),
    );

    expect(exchangeCodeForSession).toHaveBeenCalledWith("one-time-code", {
      flowId: "bc0f26282e6abeac61d7b21c49683e6a",
    });
    expect(hasCookie).toHaveBeenCalledWith(
      "sb-api-auth-token-flow-bc0f26282e6abeac61d7b21c49683e6a-code-verifier",
    );
    expect(response.headers.get("location")).toBe(
      "https://loyalty.starfiniti.com/programme",
    );
  });

  it("rejects a missing flow ID before exchange", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const response = await GET(
      new Request("https://0.0.0.0:3000/auth/callback?code=used-code"),
    );

    expect(response.headers.get("location")).toBe(
      "https://loyalty.starfiniti.com/login?error=authentication_failed&reason=flow_id_missing",
    );
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("rejects a malformed flow ID before exchange", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const response = await GET(
      new Request(
        "https://0.0.0.0:3000/auth/callback?code=used-code&sb_flow_id=not%20valid",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "https://loyalty.starfiniti.com/login?error=authentication_failed&reason=flow_id_missing",
    );
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("claims a tenant membership only after the brokered exchange", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const organizationId = "20000000-0000-4000-8000-000000000001";
    const response = await GET(
      new Request(
        `https://0.0.0.0:3000/auth/callback?organization=${organizationId}&code=one-time-code&sb_flow_id=bc0f26282e6abeac61d7b21c49683e6a&next=%2Fprogramme`,
      ),
    );
    expect(claimMembership).toHaveBeenCalledWith(
      organizationId,
      expect.stringMatching(/^[0-9a-f-]{36}$/u),
    );
    expect(response.headers.get("location")).toBe(
      "https://loyalty.starfiniti.com/programme",
    );
  });

  it("accepts an existing live invitation membership without changing its provenance", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    claimMembership.mockResolvedValue({
      outcome: "manual_membership",
      role: "analyst",
      revision: 2,
    });
    const response = await GET(
      new Request(
        "https://0.0.0.0:3000/auth/callback?organization=20000000-0000-4000-8000-000000000001&code=one-time-code&sb_flow_id=bc0f26282e6abeac61d7b21c49683e6a&next=%2Fanalytics",
      ),
    );
    expect(response.headers.get("location")).toBe(
      "https://loyalty.starfiniti.com/analytics",
    );
  });

  it("fails closed when provisioning is missing or role mapping conflicts", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    claimMembership.mockResolvedValue({
      outcome: "role_conflict",
      role: null,
      revision: null,
    });
    const response = await GET(
      new Request(
        "https://0.0.0.0:3000/auth/callback?organization=20000000-0000-4000-8000-000000000001&code=one-time-code&sb_flow_id=bc0f26282e6abeac61d7b21c49683e6a",
      ),
    );
    expect(response.headers.get("location")).toContain(
      "reason=federation_membership_unavailable",
    );
  });

  it("reports a missing verifier without exposing its value", async () => {
    hasCookie.mockReturnValue(false);
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const response = await GET(
      new Request(
        "https://0.0.0.0:3000/auth/callback?code=used-code&sb_flow_id=bc0f26282e6abeac61d7b21c49683e6a",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "https://loyalty.starfiniti.com/login?error=authentication_failed&reason=verifier_cookie_missing",
    );
    expect(hasCookie).toHaveBeenCalledWith(
      "sb-api-auth-token-flow-bc0f26282e6abeac61d7b21c49683e6a-code-verifier",
    );
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("fails closed when the public origin is unavailable", async () => {
    delete process.env.DASHBOARD_PUBLIC_ORIGIN;
    const response = await GET(
      new Request("https://0.0.0.0:3000/auth/callback?code=one-time-code"),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });
});
