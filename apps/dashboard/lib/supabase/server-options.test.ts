import { createServerClient } from "@supabase/ssr";
import { describe, expect, it } from "vitest";
import {
  SUPABASE_AUTH_STORAGE_KEY,
  SUPABASE_SERVER_AUTH_OPTIONS,
  supabasePkceVerifierCookieName,
  supabaseServerCookieOptions,
} from "./server-options";

describe("Supabase server auth options", () => {
  it("carries the PKCE flow id through OAuth redirects", () => {
    expect(SUPABASE_SERVER_AUTH_OPTIONS.storageKey).toBe(
      SUPABASE_AUTH_STORAGE_KEY,
    );
    expect(
      SUPABASE_SERVER_AUTH_OPTIONS.experimental.appendPkceFlowIdToRedirects,
    ).toBe(true);
  });

  it("keeps PKCE verifier cookies stable across Supabase hostnames", async () => {
    const writtenCookies: Array<{ name: string }> = [];
    const supabase = createServerClient(
      "https://identity.loyalty.example.test",
      "sb_publishable_example",
      {
        auth: SUPABASE_SERVER_AUTH_OPTIONS,
        cookieOptions: supabaseServerCookieOptions({ NODE_ENV: "development" }),
        cookies: {
          getAll() {
            return [];
          },
          setAll(cookiesToSet) {
            writtenCookies.push(...cookiesToSet);
          },
        },
      },
    );

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: "https://loyalty.example.test/auth/callback",
        skipBrowserRedirect: true,
      },
    });

    expect(error).toBeNull();
    expect(writtenCookies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: expect.stringMatching(
            /^sb-api-auth-token-flow-[A-Za-z0-9_-]{8,64}-code-verifier$/u,
          ),
        }),
      ]),
    );
    expect(
      supabasePkceVerifierCookieName("bc0f26282e6abeac61d7b21c49683e6a"),
    ).toBe(
      "sb-api-auth-token-flow-bc0f26282e6abeac61d7b21c49683e6a-code-verifier",
    );
  });

  it("uses HTTP-only secure cookies in production", () => {
    expect(supabaseServerCookieOptions({ NODE_ENV: "production" })).toEqual({
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: true,
    });
    expect(
      supabaseServerCookieOptions({ NODE_ENV: "development" }).secure,
    ).toBe(false);
  });
});
