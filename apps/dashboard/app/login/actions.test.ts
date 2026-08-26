import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signInWithOAuth = vi.hoisted(() => vi.fn());
const resolveLogin = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() =>
  vi.fn((target: string) => {
    throw new Error(`redirect:${target}`);
  }),
);

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/supabase/config", () => ({
  readSupabasePublicConfig: () => ({
    url: "https://api.loyalty.starfiniti.com",
    publishableKey: "publishable-test-key",
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { signInWithOAuth },
  }),
}));
vi.mock("@/lib/server/enterprise-identity", () => ({
  resolveOrganizationFederationLogin: resolveLogin,
}));

import { signInWithTenantSso } from "./actions";

const provider = "custom:loyalty-0123456789abcdefghij";

describe("tenant SSO login start", () => {
  const originalOrigin = process.env.DASHBOARD_PUBLIC_ORIGIN;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DASHBOARD_PUBLIC_ORIGIN = "https://loyalty.starfiniti.com";
    resolveLogin.mockResolvedValue({ schemaVersion: "1", provider });
    signInWithOAuth.mockResolvedValue({
      data: {
        url: `https://api.loyalty.starfiniti.com/auth/v1/authorize?provider=${encodeURIComponent(provider)}`,
      },
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

  it("uses only the server-resolved provider and OpenID subject scope", async () => {
    const form = new FormData();
    form.set("organizationSlug", "northstar-commerce");
    form.set("next", "/programme");

    await expect(signInWithTenantSso(form)).rejects.toThrow(
      "redirect:https://api.loyalty.starfiniti.com/auth/v1/authorize",
    );
    expect(resolveLogin).toHaveBeenCalledWith("northstar-commerce");
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider,
      options: {
        redirectTo:
          "https://loyalty.starfiniti.com/auth/callback?next=%2Fprogramme",
        scopes: "openid",
        skipBrowserRedirect: true,
      },
    });
  });

  it("rejects an authorization URL on another origin", async () => {
    signInWithOAuth.mockResolvedValue({
      data: {
        url: `https://evil.test/auth/v1/authorize?provider=${encodeURIComponent(provider)}`,
      },
      error: null,
    });
    const form = new FormData();
    form.set("organizationSlug", "northstar-commerce");

    await expect(signInWithTenantSso(form)).rejects.toThrow(
      "redirect:/login?error=tenant_sso_failed",
    );
  });

  it("does not query a provider for a malformed organization slug", async () => {
    const form = new FormData();
    form.set("organizationSlug", "Northstar.example.com");

    await expect(signInWithTenantSso(form)).rejects.toThrow(
      "redirect:/login?error=tenant_sso_failed",
    );
    expect(resolveLogin).not.toHaveBeenCalled();
    expect(signInWithOAuth).not.toHaveBeenCalled();
  });
});
