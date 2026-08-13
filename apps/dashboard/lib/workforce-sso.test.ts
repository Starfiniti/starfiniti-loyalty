import { describe, expect, it } from "vitest";
import {
  isExpectedWorkforceAuthorizeUrl,
  workforceSsoCallbackUrl,
} from "./workforce-sso";

describe("Starfiniti workforce SSO navigation", () => {
  it("builds the canonical PKCE callback and keeps a safe local destination", () => {
    expect(
      workforceSsoCallbackUrl(
        "https://loyalty.starfiniti.com",
        "/programme?tab=rewards",
      ),
    ).toBe(
      "https://loyalty.starfiniti.com/auth/callback?next=%2Fprogramme%3Ftab%3Drewards",
    );
  });

  it("rejects non-canonical public origins and unsafe destinations", () => {
    expect(() =>
      workforceSsoCallbackUrl("http://loyalty.starfiniti.com", "/"),
    ).toThrow("dashboard_public_origin_invalid");
    expect(
      workforceSsoCallbackUrl("http://localhost:3000", "//evil.test"),
    ).toBe("http://localhost:3000/auth/callback?next=%2F");
  });

  it("accepts only the configured Supabase custom-provider authorize URL", () => {
    const api = "https://api.loyalty.starfiniti.com";
    expect(
      isExpectedWorkforceAuthorizeUrl(
        `${api}/auth/v1/authorize?provider=custom%3Astarfiniti-sso&redirect_to=https%3A%2F%2Floyalty.starfiniti.com%2Fauth%2Fcallback`,
        api,
      ),
    ).toBe(true);
    expect(
      isExpectedWorkforceAuthorizeUrl(
        "https://evil.test/auth/v1/authorize?provider=custom%3Astarfiniti-sso",
        api,
      ),
    ).toBe(false);
    expect(
      isExpectedWorkforceAuthorizeUrl(
        `${api}/auth/v1/authorize?provider=google`,
        api,
      ),
    ).toBe(false);
  });
});
