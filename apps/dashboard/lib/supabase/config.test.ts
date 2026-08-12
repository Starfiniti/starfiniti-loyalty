import { describe, expect, it } from "vitest";
import { readSupabasePublicConfig } from "./config";

describe("Supabase public configuration", () => {
  it("accepts the browser-safe URL and publishable key", () => {
    expect(
      readSupabasePublicConfig({
        NEXT_PUBLIC_SUPABASE_URL: "https://api.loyalty.example.test/",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
      }),
    ).toEqual({
      url: "https://api.loyalty.example.test",
      publishableKey: "sb_publishable_example",
    });
  });

  it("rejects missing or non-http configuration", () => {
    expect(() => readSupabasePublicConfig({})).toThrow(
      "supabase_public_config_unavailable",
    );
    expect(() =>
      readSupabasePublicConfig({
        NEXT_PUBLIC_SUPABASE_URL: "file:///tmp/supabase",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
      }),
    ).toThrow("supabase_public_config_invalid");
  });

  it("rejects modern secret keys and legacy privileged JWTs", () => {
    const privilegedPayload = btoa(JSON.stringify({ role: "service_role" }));
    const privilegedJwt = `header.${privilegedPayload}.signature`;

    for (const publishableKey of ["sb_secret_example", privilegedJwt]) {
      expect(() =>
        readSupabasePublicConfig({
          NEXT_PUBLIC_SUPABASE_URL: "https://api.loyalty.example.test",
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
        }),
      ).toThrow("supabase_public_config_privileged_key");
    }
  });
});
