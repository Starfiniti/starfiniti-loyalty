import { describe, expect, it, vi } from "vitest";
import { readFederationManagementConfig } from "./federation-management-config";

vi.mock("server-only", () => ({}));

const ids = {
  sourceAuthenticationFlowId: "10000000-0000-4000-8000-000000000001",
  sourceEnrollmentFlowId: "10000000-0000-4000-8000-000000000002",
  providerAuthorizationFlowId: "10000000-0000-4000-8000-000000000003",
  providerInvalidationFlowId: "10000000-0000-4000-8000-000000000004",
  providerSigningKeyId: "10000000-0000-4000-8000-000000000005",
};

describe("federation management configuration", () => {
  it("loads fixed HTTPS origins, UUID selectors, and separate mounted secrets", () => {
    const files = new Map([
      [
        "/run/federation.json",
        JSON.stringify({
          authentikOrigin: "https://auth.starfiniti.com",
          supabaseUrl: "https://api.loyalty.starfiniti.com",
          ...ids,
          providerOpenidPropertyMappingId:
            "10000000-0000-4000-8000-000000000006",
          sourceUserPropertyMappingIds: [
            "10000000-0000-4000-8000-000000000007",
          ],
        }),
      ],
      ["/run/authentik-token", "a".repeat(48)],
      ["/run/supabase-key", "b".repeat(48)],
    ]);
    const config = readFederationManagementConfig(
      {
        LOYALTY_FEDERATION_CONFIG_FILE: "/run/federation.json",
        LOYALTY_AUTHENTIK_API_TOKEN_FILE: "/run/authentik-token",
        LOYALTY_SUPABASE_SERVICE_ROLE_KEY_FILE: "/run/supabase-key",
      },
      (path) => {
        const value = files.get(path);
        if (value === undefined) throw new Error(`unexpected path ${path}`);
        return value;
      },
    );

    expect(config).toMatchObject({
      authentikOrigin: "https://auth.starfiniti.com",
      supabaseUrl: "https://api.loyalty.starfiniti.com",
      supabaseCallbackUrl:
        "https://api.loyalty.starfiniti.com/auth/v1/callback",
    });
    expect(config.authentikToken).toBe("a".repeat(48));
    expect(config.supabaseServiceRoleKey).toBe("b".repeat(48));
  });

  it.each([
    [
      "a relative config path",
      { LOYALTY_FEDERATION_CONFIG_FILE: "config.json" },
    ],
    ["a missing secret path", { LOYALTY_AUTHENTIK_API_TOKEN_FILE: undefined }],
  ])("rejects %s", (_case, override) => {
    expect(() =>
      readFederationManagementConfig(
        {
          LOYALTY_FEDERATION_CONFIG_FILE: "/run/federation.json",
          LOYALTY_AUTHENTIK_API_TOKEN_FILE: "/run/authentik-token",
          LOYALTY_SUPABASE_SERVICE_ROLE_KEY_FILE: "/run/supabase-key",
          ...override,
        },
        () => "{}",
      ),
    ).toThrow();
  });

  it("rejects alternate origins, unknown config keys, and inline control characters", () => {
    const documents = [
      {
        authentikOrigin: "http://auth.example.com",
        supabaseUrl: "https://api.example.com",
      },
      {
        authentikOrigin: "https://auth.example.com/path",
        supabaseUrl: "https://api.example.com",
      },
      {
        authentikOrigin: "https://auth.example.com",
        supabaseUrl: "https://api.example.com",
        token: "inline",
      },
    ];
    for (const document of documents) {
      expect(() =>
        readFederationManagementConfig(
          {
            LOYALTY_FEDERATION_CONFIG_FILE: "/run/federation.json",
            LOYALTY_AUTHENTIK_API_TOKEN_FILE: "/run/authentik-token",
            LOYALTY_SUPABASE_SERVICE_ROLE_KEY_FILE: "/run/supabase-key",
          },
          (path) =>
            path.endsWith("federation.json")
              ? JSON.stringify({
                  ...document,
                  ...ids,
                  providerOpenidPropertyMappingId: ids.providerSigningKeyId,
                  sourceUserPropertyMappingIds: [ids.providerSigningKeyId],
                })
              : `secret-${"x".repeat(40)}`,
        ),
      ).toThrow("federation_management_config_invalid");
    }
  });
});
