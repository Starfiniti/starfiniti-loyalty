import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { CustomOAuthProvider } from "@supabase/auth-js";
import type { FederationManagementConfig } from "./federation-management-config";

const PROVIDER_IDENTIFIER = /^custom:loyalty-[a-z0-9]{20}$/u;
const APPLICATION_SLUG = /^loyalty-[a-z0-9]{20}$/u;

type ProviderResult = Promise<
  | { data: CustomOAuthProvider; error: null }
  | { data: null; error: { code: unknown; status: number | undefined } }
>;

export type SupabaseCustomProviderAdmin = Readonly<{
  getProvider: (identifier: string) => ProviderResult;
  createProvider: (params: Record<string, unknown>) => ProviderResult;
  updateProvider: (
    identifier: string,
    params: Record<string, unknown>,
  ) => ProviderResult;
}>;

export class SupabaseFederationAdminError extends Error {
  constructor(
    readonly code:
      | "supabase_auth_ambiguous"
      | "supabase_auth_conflict"
      | "supabase_auth_invalid_response"
      | "supabase_auth_rejected"
      | "supabase_auth_unavailable",
    readonly outcome: "failed" | "ambiguous",
  ) {
    super(code);
  }
}

export class SupabaseFederationAdmin {
  private readonly admin: SupabaseCustomProviderAdmin;

  constructor(
    private readonly config: FederationManagementConfig,
    admin?: SupabaseCustomProviderAdmin,
  ) {
    if (admin) {
      this.admin = admin;
      return;
    }
    const client = createClient(
      config.supabaseUrl,
      config.supabaseServiceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
      },
    );
    const customProviders = client.auth.admin.customProviders;
    this.admin = {
      getProvider: (identifier) => customProviders.getProvider(identifier),
      createProvider: (params) =>
        customProviders.createProvider(params as never),
      updateProvider: (identifier, params) =>
        customProviders.updateProvider(identifier, params as never),
    };
  }

  async reconcileDisabled(
    identifier: string,
    applicationSlug: string,
    brokerClientSecret: string,
  ): Promise<string> {
    assertInput(identifier, applicationSlug, brokerClientSecret);
    const existing = await this.getOptional(identifier);
    const suffix = applicationSlug.slice("loyalty-".length);
    const issuer = `${this.config.authentikOrigin}/application/o/${applicationSlug}/`;
    const desired = {
      name: `Starfiniti federation ${suffix}`,
      client_id: applicationSlug,
      client_secret: brokerClientSecret,
      acceptable_client_ids: [],
      scopes: ["openid"],
      custom_claims_allowlist: [],
      pkce_enabled: true,
      attribute_mapping: {},
      authorization_params: {},
      enabled: false,
      email_optional: true,
      issuer,
      skip_nonce_check: false,
    };
    const result = await this.mutate(() =>
      existing
        ? this.admin.updateProvider(identifier, desired)
        : this.admin.createProvider({
            provider_type: "oidc",
            identifier,
            ...desired,
          }),
    );
    assertExactProvider(result, {
      identifier,
      applicationSlug,
      issuer,
      enabled: false,
    });
    return result.id;
  }

  async setEnabled(identifier: string, enabled: boolean): Promise<void> {
    if (!PROVIDER_IDENTIFIER.test(identifier)) {
      throw new SupabaseFederationAdminError(
        "supabase_auth_conflict",
        "failed",
      );
    }
    const result = await this.mutate(() =>
      this.admin.updateProvider(identifier, { enabled }),
    );
    if (result.identifier !== identifier || result.enabled !== enabled) {
      throw new SupabaseFederationAdminError(
        "supabase_auth_invalid_response",
        "ambiguous",
      );
    }
  }

  private async getOptional(
    identifier: string,
  ): Promise<CustomOAuthProvider | null> {
    let response: Awaited<ProviderResult>;
    try {
      response = await this.admin.getProvider(identifier);
    } catch {
      throw new SupabaseFederationAdminError(
        "supabase_auth_unavailable",
        "failed",
      );
    }
    if (response.error) {
      if (
        response.error.status === 404 ||
        response.error.code === "custom_provider_not_found"
      ) {
        return null;
      }
      throw new SupabaseFederationAdminError(
        response.error.code === "conflict"
          ? "supabase_auth_conflict"
          : "supabase_auth_rejected",
        "failed",
      );
    }
    return response.data;
  }

  private async mutate(
    operation: () => ProviderResult,
  ): Promise<CustomOAuthProvider> {
    let response: Awaited<ProviderResult>;
    try {
      response = await operation();
    } catch {
      throw new SupabaseFederationAdminError(
        "supabase_auth_ambiguous",
        "ambiguous",
      );
    }
    if (response.error) {
      const uncertainMutation =
        response.error.status === undefined ||
        response.error.status === 408 ||
        response.error.status === 429 ||
        response.error.status >= 500;
      throw new SupabaseFederationAdminError(
        uncertainMutation
          ? "supabase_auth_ambiguous"
          : response.error.code === "conflict"
            ? "supabase_auth_conflict"
            : "supabase_auth_rejected",
        uncertainMutation ? "ambiguous" : "failed",
      );
    }
    return response.data;
  }
}

function assertInput(
  identifier: string,
  applicationSlug: string,
  brokerClientSecret: string,
): void {
  if (
    !PROVIDER_IDENTIFIER.test(identifier) ||
    !APPLICATION_SLUG.test(applicationSlug) ||
    identifier !== `custom:${applicationSlug}` ||
    brokerClientSecret.length < 32 ||
    brokerClientSecret.length > 255 ||
    /[\u0000-\u001f\u007f]/u.test(brokerClientSecret)
  ) {
    throw new SupabaseFederationAdminError("supabase_auth_conflict", "failed");
  }
}

function assertExactProvider(
  provider: CustomOAuthProvider,
  expected: Readonly<{
    identifier: string;
    applicationSlug: string;
    issuer: string;
    enabled: boolean;
  }>,
): void {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      provider.id,
    ) ||
    provider.provider_type !== "oidc" ||
    provider.identifier !== expected.identifier ||
    provider.client_id !== expected.applicationSlug ||
    provider.issuer !== expected.issuer ||
    provider.enabled !== expected.enabled ||
    provider.pkce_enabled !== true ||
    provider.email_optional !== true ||
    provider.skip_nonce_check !== false ||
    provider.scopes?.join(" ") !== "openid" ||
    (provider.custom_claims_allowlist?.length ?? 0) !== 0
  ) {
    throw new SupabaseFederationAdminError(
      "supabase_auth_invalid_response",
      "ambiguous",
    );
  }
}
