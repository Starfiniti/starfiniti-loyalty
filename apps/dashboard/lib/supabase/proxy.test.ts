import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import {
  authenticatedHomeTarget,
  isCustomerExportReauthentication,
  localeRequestHeaders,
  unauthenticatedLoginTarget,
  updateSupabaseSession,
} from "./proxy";

describe("public loyalty routing", () => {
  it("serves hosted loyalty without Auth refresh and with bounded shared caching", async () => {
    const response = await updateSupabaseSession(
      new NextRequest(
        "https://loyalty.example.test/loyalty/a1000000-0000-4000-8000-000000000001/a1000000-0000-4000-8000-000000000002?lang=sl-SI",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, s-maxage=60, stale-while-revalidate=300",
    );
    expect(response.headers.get("location")).toBeNull();
  });
});

describe("workforce authentication callback routing", () => {
  it("preserves pending PKCE cookies for the callback route", async () => {
    const request = new NextRequest(
      "https://loyalty.example.test/auth/callback?code=one-time-code&sb_flow_id=bc0f26282e6abeac61d7b21c49683e6a",
      {
        headers: {
          cookie:
            "sb-api-auth-token-flow-bc0f26282e6abeac61d7b21c49683e6a-code-verifier=base64-verifier",
        },
      },
    );
    const response = await updateSupabaseSession(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.cookies.getAll()).toEqual([]);
  });
});

describe("customer export reauthentication routing", () => {
  it("permits only the exact password reauthentication purpose on login", () => {
    expect(isCustomerExportReauthentication("/login", "customer-export")).toBe(
      true,
    );
    expect(isCustomerExportReauthentication("/login", "export")).toBe(false);
    expect(
      isCustomerExportReauthentication("/account/loyalty", "customer-export"),
    ).toBe(false);
  });
});

describe("merchant locale routing", () => {
  it("provides English to server-rendered layouts", () => {
    const slRequest = new NextRequest(
      "https://loyalty.example.test/programme?lang=sl-SI",
    );
    const invalidRequest = new NextRequest(
      "https://loyalty.example.test/programme?lang=de-DE",
    );

    expect(localeRequestHeaders(slRequest).get("x-starfiniti-locale")).toBe(
      "en",
    );
    expect(
      localeRequestHeaders(invalidRequest).get("x-starfiniti-locale"),
    ).toBe("en");
  });

  it("drops locale selectors after an authenticated login redirect", () => {
    expect(
      authenticatedHomeTarget(
        new URL("https://loyalty.example.test/login?lang=sl-SI"),
      ).toString(),
    ).toBe("https://loyalty.example.test/");
    expect(
      authenticatedHomeTarget(
        new URL("https://loyalty.example.test/login?lang=de-DE"),
      ).toString(),
    ).toBe("https://loyalty.example.test/");
  });

  it("drops locale selectors while sending a guest to login", () => {
    expect(
      unauthenticatedLoginTarget(
        new URL("https://loyalty.example.test/programme?lang=sl-SI"),
      ).toString(),
    ).toBe("https://loyalty.example.test/login?next=%2Fprogramme");
  });
});
