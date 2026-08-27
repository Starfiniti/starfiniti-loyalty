import { describe, expect, it, vi } from "vitest";
import {
  SupabaseFederationAdmin,
  type SupabaseCustomProviderAdmin,
} from "./supabase-federation-admin";
import type { FederationManagementConfig } from "./federation-management-config";

vi.mock("server-only", () => ({}));

const identifier = "custom:loyalty-0123456789abcdefghij";
const applicationSlug = "loyalty-0123456789abcdefghij";
const providerId = "30000000-0000-4000-8000-000000000001";
const config = {
  authentikOrigin: "https://auth.starfiniti.com",
  supabaseUrl: "https://api.loyalty.starfiniti.com",
  supabaseCallbackUrl: "https://api.loyalty.starfiniti.com/auth/v1/callback",
  sourceAuthenticationFlowId: "10000000-0000-4000-8000-000000000001",
  sourceEnrollmentFlowId: "10000000-0000-4000-8000-000000000002",
  providerAuthorizationFlowId: "10000000-0000-4000-8000-000000000003",
  providerInvalidationFlowId: "10000000-0000-4000-8000-000000000004",
  providerSigningKeyId: "10000000-0000-4000-8000-000000000005",
  providerOpenidPropertyMappingId: "10000000-0000-4000-8000-000000000006",
  sourceUserPropertyMappingIds: ["10000000-0000-4000-8000-000000000007"],
  authentikToken: "authentik-token-abcdefghijklmnopqrstuvwxyz",
  supabaseServiceRoleKey: "service-role-abcdefghijklmnopqrstuvwxyz",
} satisfies FederationManagementConfig;

describe("Supabase tenant custom-provider reconciliation", () => {
  it("creates an email-optional subject-only provider disabled by default", async () => {
    const fake = new FakeCustomProviders();
    const admin = new SupabaseFederationAdmin(config, fake);

    expect(
      await admin.reconcileDisabled(
        identifier,
        applicationSlug,
        "broker-secret-abcdefghijklmnopqrstuvwxyz",
      ),
    ).toBe(providerId);
    expect(fake.provider).toMatchObject({
      provider_type: "oidc",
      identifier,
      client_id: applicationSlug,
      client_secret: "broker-secret-abcdefghijklmnopqrstuvwxyz",
      scopes: ["openid"],
      custom_claims_allowlist: [],
      pkce_enabled: true,
      enabled: false,
      email_optional: true,
      skip_nonce_check: false,
      issuer: `https://auth.starfiniti.com/application/o/${applicationSlug}/`,
    });
    expect(JSON.stringify(fake.provider)).not.toMatch(
      /profile|email scope|groups/u,
    );
  });

  it("rotates a write-only broker secret on an existing deterministic provider", async () => {
    const fake = new FakeCustomProviders();
    const admin = new SupabaseFederationAdmin(config, fake);
    await admin.reconcileDisabled(
      identifier,
      applicationSlug,
      "broker-secret-abcdefghijklmnopqrstuvwxyz",
    );
    await admin.reconcileDisabled(
      identifier,
      applicationSlug,
      "rotated-secret-abcdefghijklmnopqrstuvwxyz",
    );

    expect(fake.createCalls).toBe(1);
    expect(fake.updateCalls).toBe(1);
    expect(fake.provider?.client_secret).toBe(
      "rotated-secret-abcdefghijklmnopqrstuvwxyz",
    );
  });

  it("treats a mutation transport failure as ambiguous", async () => {
    const fake = new FakeCustomProviders();
    fake.throwOnCreate = true;
    const admin = new SupabaseFederationAdmin(config, fake);

    await expect(
      admin.reconcileDisabled(
        identifier,
        applicationSlug,
        "broker-secret-abcdefghijklmnopqrstuvwxyz",
      ),
    ).rejects.toMatchObject({
      code: "supabase_auth_ambiguous",
      outcome: "ambiguous",
    });
  });

  it("treats a mutation server response as ambiguous after a possible write", async () => {
    const fake = new FakeCustomProviders();
    fake.createErrorStatus = 503;
    const admin = new SupabaseFederationAdmin(config, fake);

    await expect(
      admin.reconcileDisabled(
        identifier,
        applicationSlug,
        "broker-secret-abcdefghijklmnopqrstuvwxyz",
      ),
    ).rejects.toMatchObject({
      code: "supabase_auth_ambiguous",
      outcome: "ambiguous",
    });
    expect(fake.provider).not.toBeNull();
  });
});

class FakeCustomProviders implements SupabaseCustomProviderAdmin {
  provider: Record<string, unknown> | null = null;
  createCalls = 0;
  updateCalls = 0;
  throwOnCreate = false;
  createErrorStatus: number | null = null;

  getProvider = async () =>
    this.provider
      ? { data: this.provider as never, error: null }
      : {
          data: null,
          error: { code: "custom_provider_not_found", status: 404 },
        };

  createProvider = async (params: Record<string, unknown>) => {
    if (this.throwOnCreate) throw new Error("connection reset");
    this.createCalls += 1;
    this.provider = provider(params);
    if (this.createErrorStatus !== null) {
      return {
        data: null,
        error: {
          code: "custom_provider_unavailable",
          status: this.createErrorStatus,
        },
      };
    }
    return { data: this.provider as never, error: null };
  };

  updateProvider = async (
    _identifier: string,
    params: Record<string, unknown>,
  ) => {
    this.updateCalls += 1;
    this.provider = provider({ ...this.provider, ...params });
    return { data: this.provider as never, error: null };
  };
}

function provider(params: Record<string, unknown>): Record<string, unknown> {
  return {
    id: providerId,
    provider_type: "oidc",
    identifier,
    name: "Starfiniti federation 0123456789abcdefghij",
    client_id: applicationSlug,
    acceptable_client_ids: [],
    scopes: ["openid"],
    custom_claims_allowlist: [],
    pkce_enabled: true,
    attribute_mapping: {},
    authorization_params: {},
    enabled: false,
    email_optional: true,
    issuer: `https://auth.starfiniti.com/application/o/${applicationSlug}/`,
    skip_nonce_check: false,
    created_at: "2026-08-26T13:00:00.000Z",
    updated_at: "2026-08-26T13:00:00.000Z",
    ...params,
  };
}
