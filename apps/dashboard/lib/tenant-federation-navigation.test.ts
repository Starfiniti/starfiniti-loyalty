import { describe, expect, it } from "vitest";
import {
  isExpectedTenantFederationAuthorizeUrl,
  tenantFederationLinkCallbackUrl,
  tenantFederationLoginCallbackUrl,
} from "./tenant-federation-navigation";

const provider = "custom:loyalty-0123456789abcdefghij";

describe("tenant federation navigation", () => {
  it("builds bounded public link and login callbacks", () => {
    expect(
      tenantFederationLinkCallbackUrl(
        "https://loyalty.starfiniti.com",
        "20000000-0000-4000-8000-000000000001",
      ),
    ).toBe(
      "https://loyalty.starfiniti.com/auth/link/callback?organization=20000000-0000-4000-8000-000000000001",
    );
    expect(
      tenantFederationLoginCallbackUrl(
        "https://loyalty.starfiniti.com",
        "//evil.test",
      ),
    ).toBe("https://loyalty.starfiniti.com/auth/callback?next=%2F");
  });

  it("accepts only the exact Supabase endpoint, mode, and provider", () => {
    const api = "https://api.loyalty.starfiniti.com";
    expect(
      isExpectedTenantFederationAuthorizeUrl(
        `${api}/auth/v1/user/identities/authorize?provider=${encodeURIComponent(provider)}`,
        api,
        provider,
        "link",
      ),
    ).toBe(true);
    expect(
      isExpectedTenantFederationAuthorizeUrl(
        `${api}/auth/v1/authorize?provider=${encodeURIComponent(provider)}`,
        api,
        provider,
        "link",
      ),
    ).toBe(false);
    expect(
      isExpectedTenantFederationAuthorizeUrl(
        "https://evil.test/auth/v1/user/identities/authorize?provider=custom%3Aloyalty-0123456789abcdefghij",
        api,
        provider,
        "link",
      ),
    ).toBe(false);
  });
});
