import { describe, expect, it } from "vitest";
import {
  SUPABASE_SERVER_AUTH_OPTIONS,
  supabaseServerCookieOptions,
} from "./server-options";

describe("Supabase server auth options", () => {
  it("carries the PKCE flow id through OAuth redirects", () => {
    expect(
      SUPABASE_SERVER_AUTH_OPTIONS.experimental.appendPkceFlowIdToRedirects,
    ).toBe(true);
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
