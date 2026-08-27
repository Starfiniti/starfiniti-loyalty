import { describe, expect, it, vi } from "vitest";
import {
  AuthentikFederationAdmin,
  type AuthentikFederationReconcileInput,
} from "./authentik-federation-admin";
import type { FederationManagementConfig } from "./federation-management-config";

vi.mock("server-only", () => ({}));

const sourceSlug = "loyalty-0123456789abcdefghij";
const ids = {
  source: "20000000-0000-4000-8000-000000000001",
  flow: "20000000-0000-4000-8000-000000000002",
  identification: "20000000-0000-4000-8000-000000000003",
  login: "20000000-0000-4000-8000-000000000004",
  binding1: "20000000-0000-4000-8000-000000000005",
  binding2: "20000000-0000-4000-8000-000000000006",
};

const config: FederationManagementConfig = {
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
  authentikToken: "admin-token-abcdefghijklmnopqrstuvwxyz",
  supabaseServiceRoleKey: "service-role-abcdefghijklmnopqrstuvwxyz",
};

const oidcInput = {
  sourceSlug,
  configuration: {
    protocol: "oidc",
    discoveryUrl:
      "https://idp.vendor.com/tenant/.well-known/openid-configuration",
    clientId: "tenant-client",
  },
  evidence: {
    schemaVersion: "1",
    protocol: "oidc",
    configurationSha256: "a".repeat(64),
    documentSha256: "b".repeat(64),
    issuer: "https://idp.vendor.com/tenant",
    authorizationEndpoint: "https://idp.vendor.com/authorize",
    tokenEndpoint: "https://idp.vendor.com/token",
    jwksUri: "https://idp.vendor.com/jwks",
    ssoEndpoint: null,
    signingFingerprints: ["c".repeat(64)],
    validatedAt: "2026-08-26T13:00:00.000Z",
  },
  provisioning: {
    protocol: "oidc",
    userinfoEndpoint: "https://idp.vendor.com/userinfo",
    authorizationCodeAuthMethod: "basic_auth",
    pkce: "S256",
    jwks: {
      keys: [{ kty: "RSA", n: "abc", e: "AQAB", use: "sig" }],
    },
  },
  upstreamClientSecret: "upstream-secret-value",
  brokerClientSecret: "broker-secret-value-abcdefghijklmnopqrstuvwxyz",
} satisfies AuthentikFederationReconcileInput;

describe("Authentik tenant federation reconciliation", () => {
  it("creates a disabled source-only flow and a strict hidden OIDC application", async () => {
    const fake = new FakeAuthentik();
    const admin = new AuthentikFederationAdmin(config, { fetch: fake.fetch });

    const resources = await admin.reconcileDisabled(oidcInput);

    expect(resources).toEqual({
      sourcePublicId: ids.source,
      providerId: 701,
      applicationSlug: sourceSlug,
      flowPublicId: ids.flow,
      oauthCallbackUrl: `https://auth.starfiniti.com/source/oauth/callback/${sourceSlug}/`,
      samlMetadataUrl: null,
      samlAcsUrl: null,
    });
    expect(fake.source).toMatchObject({
      enabled: false,
      provider_type: "openidconnect",
      consumer_key: "tenant-client",
      consumer_secret: "upstream-secret-value",
      additional_scopes: "openid",
      oidc_well_known_url: "",
      oidc_jwks: oidcInput.provisioning.jwks,
    });
    expect(fake.identification).toMatchObject({
      user_fields: [],
      sources: [ids.source],
      password_stage: null,
      recovery_flow: null,
    });
    expect(fake.bindings.map(({ order }) => order)).toEqual([10, 20]);
    expect(fake.provider).toMatchObject({
      client_type: "confidential",
      client_secret: oidcInput.brokerClientSecret,
      grant_types: ["authorization_code"],
      issuer_mode: "per_provider",
      sub_mode: "user_uuid",
      redirect_uris: [
        {
          matching_mode: "strict",
          url: config.supabaseCallbackUrl,
          redirect_uri_type: "authorization",
        },
      ],
    });
    expect(fake.application).toMatchObject({
      slug: sourceSlug,
      provider: 701,
      meta_hide: true,
    });
    expect(fake.authorizationHeaders).not.toHaveLength(0);
    expect(
      fake.authorizationHeaders.every(
        (header) => header === `Bearer ${config.authentikToken}`,
      ),
    ).toBe(true);
  });

  it("reconciles existing deterministic objects without duplication", async () => {
    const fake = new FakeAuthentik();
    const admin = new AuthentikFederationAdmin(config, { fetch: fake.fetch });
    await admin.reconcileDisabled(oidcInput);
    await admin.reconcileDisabled({
      ...oidcInput,
      upstreamClientSecret: "rotated-upstream-secret",
      brokerClientSecret: "rotated-broker-secret-abcdefghijklmnopqrstuvwxyz",
    });

    expect(fake.bindings).toHaveLength(2);
    expect(fake.source?.consumer_secret).toBe("rotated-upstream-secret");
    expect(fake.provider?.client_secret).toBe(
      "rotated-broker-secret-abcdefghijklmnopqrstuvwxyz",
    );
    expect(fake.createCounts).toEqual({
      source: 1,
      flow: 1,
      identification: 1,
      login: 1,
      binding: 2,
      provider: 1,
      application: 1,
    });
  });

  it("classifies a mutation transport failure as ambiguous", async () => {
    const fake = new FakeAuthentik({ failSourceCreate: true });
    const admin = new AuthentikFederationAdmin(config, { fetch: fake.fetch });

    await expect(admin.reconcileDisabled(oidcInput)).rejects.toMatchObject({
      code: "authentik_ambiguous",
      outcome: "ambiguous",
    });
  });

  it("classifies a mutation server response as ambiguous after a possible write", async () => {
    const fake = new FakeAuthentik({ sourceCreateStatus: 503 });
    const admin = new AuthentikFederationAdmin(config, { fetch: fake.fetch });

    await expect(admin.reconcileDisabled(oidcInput)).rejects.toMatchObject({
      code: "authentik_ambiguous",
      outcome: "ambiguous",
    });
    expect(fake.source).not.toBeNull();
  });

  it("stops reading an oversized chunked administration response", async () => {
    const chunks = Array.from({ length: 100 }, () => new Uint8Array(64 * 1024));
    let cancelled = false;
    const admin = new AuthentikFederationAdmin(config, {
      fetch: vi.fn(
        async () =>
          new Response(
            new ReadableStream({
              pull(controller) {
                const chunk = chunks.shift();
                if (chunk) controller.enqueue(chunk);
                else controller.close();
              },
              cancel() {
                cancelled = true;
              },
            }),
            { headers: { "content-type": "application/json" } },
          ),
      ),
    });

    await expect(admin.reconcileDisabled(oidcInput)).rejects.toMatchObject({
      code: "authentik_invalid_response",
      outcome: "failed",
    });
    expect(cancelled).toBe(true);
  });
});

class FakeAuthentik {
  source: Record<string, unknown> | null = null;
  flow: Record<string, unknown> | null = null;
  identification: Record<string, unknown> | null = null;
  login: Record<string, unknown> | null = null;
  provider: Record<string, unknown> | null = null;
  application: Record<string, unknown> | null = null;
  bindings: Record<string, unknown>[] = [];
  authorizationHeaders: string[] = [];
  createCounts = {
    source: 0,
    flow: 0,
    identification: 0,
    login: 0,
    binding: 0,
    provider: 0,
    application: 0,
  };

  constructor(
    private readonly options: Readonly<{
      failSourceCreate?: boolean;
      sourceCreateStatus?: number;
    }> = {},
  ) {}

  fetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const authorization = new Headers(init?.headers).get("authorization");
    if (authorization) this.authorizationHeaders.push(authorization);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    const path = url.pathname;

    if (path === `/api/v3/sources/oauth/${sourceSlug}/`) {
      if (method === "GET")
        return response(this.source, this.source ? 200 : 404);
      this.source = { ...this.source, ...body, pk: ids.source };
      return response(this.source);
    }
    if (path === "/api/v3/sources/oauth/" && method === "POST") {
      if (this.options.failSourceCreate) throw new Error("connection reset");
      this.createCounts.source += 1;
      this.source = { ...body, pk: ids.source };
      return response(this.source, this.options.sourceCreateStatus ?? 201);
    }
    if (path === `/api/v3/flows/instances/${sourceSlug}-federation/`) {
      if (method === "GET") return response(this.flow, this.flow ? 200 : 404);
      this.flow = { ...this.flow, ...body, pk: ids.flow };
      return response(this.flow);
    }
    if (path === "/api/v3/flows/instances/" && method === "POST") {
      this.createCounts.flow += 1;
      this.flow = { ...body, pk: ids.flow };
      return response(this.flow, 201);
    }
    if (path === "/api/v3/stages/identification/") {
      if (method === "GET") {
        return response({
          results: this.identification ? [this.identification] : [],
        });
      }
      this.createCounts.identification += 1;
      this.identification = { ...body, pk: ids.identification };
      return response(this.identification, 201);
    }
    if (path === `/api/v3/stages/identification/${ids.identification}/`) {
      this.identification = {
        ...this.identification,
        ...body,
        pk: ids.identification,
      };
      return response(this.identification);
    }
    if (path === "/api/v3/stages/user_login/") {
      if (method === "GET")
        return response({ results: this.login ? [this.login] : [] });
      this.createCounts.login += 1;
      this.login = { ...body, pk: ids.login };
      return response(this.login, 201);
    }
    if (path === `/api/v3/stages/user_login/${ids.login}/`) {
      this.login = { ...this.login, ...body, pk: ids.login };
      return response(this.login);
    }
    if (path === "/api/v3/flows/bindings/") {
      if (method === "GET") return response({ results: this.bindings });
      const pk = this.bindings.length === 0 ? ids.binding1 : ids.binding2;
      this.createCounts.binding += 1;
      this.bindings.push({ ...body, pk });
      return response({ ...body, pk }, 201);
    }
    const binding = this.bindings.find(({ pk }) => path.endsWith(`/${pk}/`));
    if (binding && path.startsWith("/api/v3/flows/bindings/")) {
      Object.assign(binding, body);
      return response(binding);
    }
    if (path === "/api/v3/providers/oauth2/") {
      if (method === "GET")
        return response({ results: this.provider ? [this.provider] : [] });
      this.createCounts.provider += 1;
      this.provider = { ...body, pk: 701 };
      return response(this.provider, 201);
    }
    if (path === "/api/v3/providers/oauth2/701/") {
      this.provider = { ...this.provider, ...body, pk: 701 };
      return response(this.provider);
    }
    if (path === `/api/v3/core/applications/${sourceSlug}/`) {
      if (method === "GET") {
        return response(this.application, this.application ? 200 : 404);
      }
      this.application = { ...this.application, ...body, slug: sourceSlug };
      return response(this.application);
    }
    if (path === "/api/v3/core/applications/" && method === "POST") {
      this.createCounts.application += 1;
      this.application = { ...body, slug: sourceSlug };
      return response(this.application, 201);
    }
    return response({ detail: "not found" }, 404);
  };
}

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value ?? { detail: "not found" }), {
    status,
    headers: { "content-type": "application/json" },
  });
}
