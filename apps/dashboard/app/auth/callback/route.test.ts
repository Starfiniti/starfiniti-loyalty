import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/safe-navigation", () => ({
  safeAppPath: (value: unknown) =>
    typeof value === "string" && value.startsWith("/") ? value : "/",
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { exchangeCodeForSession },
  }),
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
    expect(response.headers.get("location")).toBe(
      "https://loyalty.starfiniti.com/programme",
    );
  });

  it("never exposes the internal bind address after an exchange failure", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: new Error("failed") });
    const response = await GET(
      new Request("https://0.0.0.0:3000/auth/callback?code=used-code"),
    );

    expect(response.headers.get("location")).toBe(
      "https://loyalty.starfiniti.com/login?error=authentication_failed",
    );
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
