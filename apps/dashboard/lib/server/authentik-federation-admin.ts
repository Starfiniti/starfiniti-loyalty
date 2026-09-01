import "server-only";

import type {
  OrganizationFederationSourceConfigurationV1,
  OrganizationFederationValidationEvidenceV1,
} from "@starfiniti/contracts";
import type { FederationProvisioningMaterial } from "./federation-validation";
import type { FederationManagementConfig } from "./federation-management-config";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SOURCE_SLUG = /^loyalty-[a-z0-9]{20}$/u;
const MAX_RESPONSE_BYTES = 512 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;

export type AuthentikFederationResources = Readonly<{
  sourcePublicId: string;
  providerId: number;
  applicationSlug: string;
  flowPublicId: string;
  oauthCallbackUrl: string | null;
  samlMetadataUrl: string | null;
  samlAcsUrl: string | null;
}>;

export type AuthentikFederationReconcileInput = Readonly<{
  sourceSlug: string;
  configuration: OrganizationFederationSourceConfigurationV1;
  evidence: OrganizationFederationValidationEvidenceV1;
  provisioning: FederationProvisioningMaterial;
  upstreamClientSecret: string | null;
  brokerClientSecret: string;
}>;

export type AuthentikFederationAdminRuntime = Readonly<{
  fetch: typeof fetch;
}>;

export class AuthentikFederationAdminError extends Error {
  constructor(
    readonly code:
      | "authentik_ambiguous"
      | "authentik_conflict"
      | "authentik_invalid_response"
      | "authentik_rejected"
      | "authentik_unavailable",
    readonly outcome: "failed" | "ambiguous",
  ) {
    super(code);
  }
}

export class AuthentikFederationAdmin {
  private readonly runtime: AuthentikFederationAdminRuntime;

  constructor(
    private readonly config: FederationManagementConfig,
    runtime: AuthentikFederationAdminRuntime = { fetch },
  ) {
    this.runtime = runtime;
  }

  async reconcileDisabled(
    input: AuthentikFederationReconcileInput,
  ): Promise<AuthentikFederationResources> {
    assertInput(input);
    const suffix = input.sourceSlug.slice("loyalty-".length);
    const names = deterministicNames(input.sourceSlug, suffix);
    const verificationKeyId =
      input.provisioning.protocol === "saml"
        ? await this.ensureCertificate(
            names.certificate,
            input.provisioning.verificationCertificatePem,
          )
        : null;
    const sourcePublicId = await this.ensureSource(
      input,
      names.source,
      verificationKeyId,
    );
    const flowPublicId = await this.ensureAuthenticationFlow(
      names,
      sourcePublicId,
    );
    const providerId = await this.ensureProvider(
      names.provider,
      names.application,
      flowPublicId,
      input.brokerClientSecret,
    );
    await this.ensureApplication(names.application, providerId);

    const sourceBase = `${this.config.authentikOrigin}/source`;
    return {
      sourcePublicId,
      providerId,
      applicationSlug: names.application,
      flowPublicId,
      oauthCallbackUrl:
        input.configuration.protocol === "oidc"
          ? `${sourceBase}/oauth/callback/${input.sourceSlug}/`
          : null,
      samlMetadataUrl:
        input.configuration.protocol === "saml"
          ? `${sourceBase}/saml/${input.sourceSlug}/metadata/`
          : null,
      samlAcsUrl:
        input.configuration.protocol === "saml"
          ? `${sourceBase}/saml/${input.sourceSlug}/acs/`
          : null,
    };
  }

  async setEnabled(sourceSlug: string, enabled: boolean): Promise<void> {
    if (!SOURCE_SLUG.test(sourceSlug)) {
      throw new AuthentikFederationAdminError("authentik_conflict", "failed");
    }
    const oauthSource = await this.getOptional(
      `/api/v3/sources/oauth/${sourceSlug}/`,
    );
    const sourceType = oauthSource
      ? "oauth"
      : (await this.getOptional(`/api/v3/sources/saml/${sourceSlug}/`))
        ? "saml"
        : null;
    if (sourceType === null) {
      throw new AuthentikFederationAdminError("authentik_conflict", "failed");
    }
    await this.mutate(
      "PATCH",
      `/api/v3/sources/${sourceType}/${sourceSlug}/`,
      sourceType === "oauth" && oauthSource
        ? { ...oidcPartialUpdateContext(oauthSource), enabled }
        : { enabled },
    );
  }

  async rotateOidcSecret(
    sourceSlug: string,
    upstreamClientSecret: string,
  ): Promise<void> {
    if (
      !SOURCE_SLUG.test(sourceSlug) ||
      upstreamClientSecret.length < 8 ||
      upstreamClientSecret.length > 8_192 ||
      /[\u0000-\u001f\u007f]/u.test(upstreamClientSecret)
    ) {
      throw new AuthentikFederationAdminError("authentik_conflict", "failed");
    }
    const source = await this.getOptional(
      `/api/v3/sources/oauth/${sourceSlug}/`,
    );
    if (source === null) {
      throw new AuthentikFederationAdminError("authentik_conflict", "failed");
    }
    await this.mutate("PATCH", `/api/v3/sources/oauth/${sourceSlug}/`, {
      ...oidcPartialUpdateContext(source),
      enabled: false,
      consumer_secret: upstreamClientSecret,
    });
  }

  private async ensureSource(
    input: AuthentikFederationReconcileInput,
    name: string,
    verificationKeyId: string | null,
  ): Promise<string> {
    const configuration = input.configuration;
    const existing = await this.getOptional(
      `/api/v3/sources/${configuration.protocol === "oidc" ? "oauth" : "saml"}/${input.sourceSlug}/`,
    );
    const common = {
      name,
      slug: input.sourceSlug,
      enabled: false,
      promoted: false,
      authentication_flow: this.config.sourceAuthenticationFlowId,
      enrollment_flow: this.config.sourceEnrollmentFlowId,
      user_property_mappings: [...this.config.sourceUserPropertyMappingIds],
      group_property_mappings: [],
      policy_engine_mode: "all",
      user_matching_mode: "identifier",
      group_matching_mode: "identifier",
    };
    const body =
      configuration.protocol === "oidc" &&
      input.provisioning.protocol === "oidc" &&
      input.upstreamClientSecret !== null
        ? {
            ...common,
            provider_type: "openidconnect",
            authorization_url: input.evidence.authorizationEndpoint,
            access_token_url: input.evidence.tokenEndpoint,
            profile_url: input.provisioning.userinfoEndpoint,
            pkce: input.provisioning.pkce,
            consumer_key: configuration.clientId,
            consumer_secret: input.upstreamClientSecret,
            additional_scopes: "openid",
            oidc_well_known_url: "",
            oidc_jwks_url: "",
            oidc_jwks: input.provisioning.jwks,
            authorization_code_auth_method:
              input.provisioning.authorizationCodeAuthMethod,
          }
        : configuration.protocol === "saml" &&
            input.provisioning.protocol === "saml" &&
            verificationKeyId !== null
          ? {
              ...common,
              pre_authentication_flow: this.config.sourceAuthenticationFlowId,
              sso_url: input.evidence.ssoEndpoint,
              slo_url: null,
              allow_idp_initiated: false,
              force_authn: false,
              name_id_policy: input.provisioning.nameIdPolicy,
              binding_type: input.provisioning.bindingType,
              verification_kp: verificationKeyId,
              signing_kp: null,
              encryption_kp: null,
              digest_algorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
              signature_algorithm:
                "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
              temporary_user_delete_after: "days=1",
              signed_assertion: true,
              signed_response: true,
            }
          : null;
    if (body === null) {
      throw new AuthentikFederationAdminError("authentik_conflict", "failed");
    }
    const path = `/api/v3/sources/${configuration.protocol === "oidc" ? "oauth" : "saml"}/`;
    const result = existing
      ? await this.mutate("PATCH", `${path}${input.sourceSlug}/`, body)
      : await this.mutate("POST", path, body);
    return requiredUuid(result, "pk");
  }

  private async ensureCertificate(name: string, pem: string): Promise<string> {
    const existing = await this.findUnique(
      "/api/v3/crypto/certificatekeypairs/",
      "name",
      name,
    );
    const body = { name, certificate_data: pem, key_data: "" };
    const result = existing
      ? await this.mutate(
          "PATCH",
          `/api/v3/crypto/certificatekeypairs/${requiredUuid(existing, "pk")}/`,
          body,
        )
      : await this.mutate("POST", "/api/v3/crypto/certificatekeypairs/", body);
    return requiredUuid(result, "pk");
  }

  private async ensureAuthenticationFlow(
    names: ReturnType<typeof deterministicNames>,
    sourcePublicId: string,
  ): Promise<string> {
    const flowBody = {
      name: names.flow,
      slug: names.flowSlug,
      title: "Continue with your organization",
      designation: "authentication",
      policy_engine_mode: "all",
      compatibility_mode: false,
      layout: "stacked",
      denied_action: "message",
      authentication: "none",
    };
    const existingFlow = await this.getOptional(
      `/api/v3/flows/instances/${names.flowSlug}/`,
    );
    const flow = existingFlow
      ? await this.mutate(
          "PATCH",
          `/api/v3/flows/instances/${names.flowSlug}/`,
          flowBody,
        )
      : await this.mutate("POST", "/api/v3/flows/instances/", flowBody);
    const flowPublicId = requiredUuid(flow, "pk");

    const identification = await this.ensureNamedResource(
      "/api/v3/stages/identification/",
      names.identificationStage,
      {
        name: names.identificationStage,
        user_fields: [],
        password_stage: null,
        captcha_stage: null,
        case_insensitive_matching: false,
        show_matched_user: false,
        enrollment_flow: null,
        recovery_flow: null,
        passwordless_flow: null,
        sources: [sourcePublicId],
        show_source_labels: true,
        pretend_user_exists: false,
        enable_remember_me: false,
        webauthn_stage: null,
      },
    );
    const login = await this.ensureNamedResource(
      "/api/v3/stages/user_login/",
      names.loginStage,
      {
        name: names.loginStage,
        session_duration: "hours=8",
        terminate_other_sessions: false,
        remember_me_offset: "seconds=0",
        network_binding: "no_binding",
        geoip_binding: "no_binding",
        remember_device: "seconds=0",
      },
    );
    await this.ensureBinding(
      flowPublicId,
      requiredUuid(identification, "pk"),
      10,
    );
    await this.ensureBinding(flowPublicId, requiredUuid(login, "pk"), 20);
    return flowPublicId;
  }

  private async ensureBinding(
    flowPublicId: string,
    stagePublicId: string,
    order: number,
  ): Promise<void> {
    const listed = await this.request(
      "GET",
      `/api/v3/flows/bindings/?target=${encodeURIComponent(flowPublicId)}&page_size=100`,
    );
    const matches = results(listed).filter(
      (candidate) => candidate.stage === stagePublicId,
    );
    if (matches.length > 1) {
      throw new AuthentikFederationAdminError("authentik_conflict", "failed");
    }
    const body = {
      target: flowPublicId,
      stage: stagePublicId,
      evaluate_on_plan: true,
      re_evaluate_policies: true,
      order,
      policy_engine_mode: "all",
      invalid_response_action: "retry",
    };
    if (matches[0]) {
      await this.mutate(
        "PATCH",
        `/api/v3/flows/bindings/${requiredUuid(matches[0], "pk")}/`,
        body,
      );
    } else {
      await this.mutate("POST", "/api/v3/flows/bindings/", body);
    }
  }

  private async ensureProvider(
    name: string,
    applicationSlug: string,
    flowPublicId: string,
    brokerClientSecret: string,
  ): Promise<number> {
    const existing = await this.findUnique(
      "/api/v3/providers/oauth2/",
      "name",
      name,
    );
    const body = {
      name,
      authentication_flow: flowPublicId,
      authorization_flow: this.config.providerAuthorizationFlowId,
      invalidation_flow: this.config.providerInvalidationFlowId,
      property_mappings: [this.config.providerOpenidPropertyMappingId],
      client_type: "confidential",
      grant_types: ["authorization_code"],
      client_id: applicationSlug,
      client_secret: brokerClientSecret,
      access_code_validity: "minutes=5",
      access_token_validity: "minutes=5",
      refresh_token_validity: "hours=1",
      refresh_token_threshold: "minutes=5",
      include_claims_in_id_token: true,
      signing_key: this.config.providerSigningKeyId,
      encryption_key: null,
      redirect_uris: [
        {
          matching_mode: "strict",
          url: this.config.supabaseCallbackUrl,
          redirect_uri_type: "authorization",
        },
      ],
      logout_uri: "",
      logout_method: "frontchannel",
      sub_mode: "hashed_user_id",
      issuer_mode: "per_provider",
      jwt_federation_sources: [],
      jwt_federation_providers: [],
    };
    const result = existing
      ? await this.mutate(
          "PATCH",
          `/api/v3/providers/oauth2/${requiredPositiveInteger(existing, "pk")}/`,
          body,
        )
      : await this.mutate("POST", "/api/v3/providers/oauth2/", body);
    return requiredPositiveInteger(result, "pk");
  }

  private async ensureApplication(
    slug: string,
    providerId: number,
  ): Promise<void> {
    const existing = await this.getOptional(
      `/api/v3/core/applications/${slug}/`,
    );
    const body = {
      name: `Starfiniti Loyalty ${slug.slice("loyalty-".length)}`,
      slug,
      provider: providerId,
      backchannel_providers: [],
      open_in_new_tab: false,
      meta_launch_url: "",
      meta_icon: "",
      meta_description: "Organization federation for Starfiniti Loyalty",
      meta_publisher: "Starfiniti",
      policy_engine_mode: "all",
      group: "",
      meta_hide: true,
    };
    if (existing) {
      await this.mutate("PATCH", `/api/v3/core/applications/${slug}/`, body);
    } else {
      await this.mutate("POST", "/api/v3/core/applications/", body);
    }
  }

  private async ensureNamedResource(
    path: string,
    name: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const existing = await this.findUnique(path, "name", name);
    return existing
      ? this.mutate("PATCH", `${path}${requiredUuid(existing, "pk")}/`, body)
      : this.mutate("POST", path, body);
  }

  private async findUnique(
    path: string,
    field: string,
    value: string,
  ): Promise<Record<string, unknown> | null> {
    const response = await this.request(
      "GET",
      `${path}?${field}=${encodeURIComponent(value)}&page_size=2`,
    );
    const matches = results(response).filter(
      (candidate) => candidate[field] === value,
    );
    if (matches.length > 1) {
      throw new AuthentikFederationAdminError("authentik_conflict", "failed");
    }
    return matches[0] ?? null;
  }

  private async getOptional(
    path: string,
  ): Promise<Record<string, unknown> | null> {
    return this.request("GET", path, undefined, true);
  }

  private async mutate(
    method: "POST" | "PATCH",
    path: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const result = await this.request(method, path, body, false);
    if (result === null) {
      throw new AuthentikFederationAdminError(
        "authentik_invalid_response",
        "ambiguous",
      );
    }
    return result;
  }

  private async request(
    method: "GET" | "POST" | "PATCH",
    path: string,
    body?: Record<string, unknown>,
    allowNotFound = false,
  ): Promise<Record<string, unknown> | null> {
    if (!path.startsWith("/api/v3/") || path.includes("#")) {
      throw new AuthentikFederationAdminError("authentik_conflict", "failed");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    timeout.unref();
    let response: Response;
    try {
      response = await this.runtime.fetch(
        `${this.config.authentikOrigin}${path}`,
        {
          method,
          redirect: "error",
          signal: controller.signal,
          headers: {
            accept: "application/json",
            ...(body ? { "content-type": "application/json" } : {}),
            authorization: `Bearer ${this.config.authentikToken}`,
            "user-agent": "Starfiniti-Loyalty-Federation-Reconciler/1",
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
      );
    } catch {
      throw new AuthentikFederationAdminError(
        method === "GET" ? "authentik_unavailable" : "authentik_ambiguous",
        method === "GET" ? "failed" : "ambiguous",
      );
    } finally {
      clearTimeout(timeout);
    }
    if (allowNotFound && response.status === 404) return null;
    if (!response.ok) {
      const uncertainMutation =
        method !== "GET" &&
        (response.status === 408 ||
          response.status === 429 ||
          response.status >= 500);
      throw new AuthentikFederationAdminError(
        uncertainMutation
          ? "authentik_ambiguous"
          : response.status === 409
            ? "authentik_conflict"
            : "authentik_rejected",
        uncertainMutation ? "ambiguous" : "failed",
      );
    }
    const contentType = response.headers.get("content-type")?.split(";", 1)[0];
    const declaredLength = response.headers.get("content-length");
    if (
      contentType !== "application/json" ||
      (declaredLength !== null &&
        (!/^(?:0|[1-9][0-9]*)$/u.test(declaredLength) ||
          Number(declaredLength) > MAX_RESPONSE_BYTES))
    ) {
      throw new AuthentikFederationAdminError(
        "authentik_invalid_response",
        method === "GET" ? "failed" : "ambiguous",
      );
    }
    let payload: Buffer;
    try {
      payload = await readBoundedBody(response, MAX_RESPONSE_BYTES);
    } catch {
      throw new AuthentikFederationAdminError(
        "authentik_invalid_response",
        method === "GET" ? "failed" : "ambiguous",
      );
    }
    if (payload.length === 0) {
      throw new AuthentikFederationAdminError(
        "authentik_invalid_response",
        method === "GET" ? "failed" : "ambiguous",
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(payload),
      );
    } catch {
      throw new AuthentikFederationAdminError(
        "authentik_invalid_response",
        method === "GET" ? "failed" : "ambiguous",
      );
    }
    if (!isRecord(parsed)) {
      throw new AuthentikFederationAdminError(
        "authentik_invalid_response",
        method === "GET" ? "failed" : "ambiguous",
      );
    }
    return parsed;
  }
}

async function readBoundedBody(
  response: Response,
  maximumBytes: number,
): Promise<Buffer> {
  if (!response.body) throw new Error("response_body_missing");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new Error("response_body_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

function deterministicNames(sourceSlug: string, suffix: string) {
  return {
    source: `Starfiniti source ${suffix}`,
    certificate: `Starfiniti SAML ${suffix}`,
    flow: `Starfiniti federation ${suffix}`,
    flowSlug: `${sourceSlug}-federation`,
    identificationStage: `Starfiniti source selection ${suffix}`,
    loginStage: `Starfiniti source login ${suffix}`,
    provider: `Starfiniti provider ${suffix}`,
    application: sourceSlug,
  } as const;
}

function assertInput(input: AuthentikFederationReconcileInput): void {
  if (
    !SOURCE_SLUG.test(input.sourceSlug) ||
    input.configuration.protocol !== input.evidence.protocol ||
    input.provisioning.protocol !== input.evidence.protocol ||
    input.brokerClientSecret.length < 32 ||
    input.brokerClientSecret.length > 255 ||
    /[\u0000-\u001f\u007f]/u.test(input.brokerClientSecret) ||
    (input.configuration.protocol === "oidc") !==
      (input.upstreamClientSecret !== null) ||
    (input.upstreamClientSecret !== null &&
      (input.upstreamClientSecret.length < 8 ||
        input.upstreamClientSecret.length > 8_192 ||
        /[\u0000-\u001f\u007f]/u.test(input.upstreamClientSecret)))
  ) {
    throw new AuthentikFederationAdminError("authentik_conflict", "failed");
  }
}

function results(
  value: Record<string, unknown> | null,
): Record<string, unknown>[] {
  const candidates = value?.results;
  if (
    !Array.isArray(candidates) ||
    candidates.some((item) => !isRecord(item))
  ) {
    throw new AuthentikFederationAdminError(
      "authentik_invalid_response",
      "failed",
    );
  }
  return candidates as Record<string, unknown>[];
}

function requiredUuid(value: Record<string, unknown>, field: string): string {
  const candidate = value[field];
  if (typeof candidate !== "string" || !UUID.test(candidate)) {
    throw new AuthentikFederationAdminError(
      "authentik_invalid_response",
      "failed",
    );
  }
  return candidate.toLowerCase();
}

function requiredPositiveInteger(
  value: Record<string, unknown>,
  field: string,
): number {
  const candidate = value[field];
  if (!Number.isSafeInteger(candidate) || Number(candidate) < 1) {
    throw new AuthentikFederationAdminError(
      "authentik_invalid_response",
      "failed",
    );
  }
  return Number(candidate);
}

function oidcPartialUpdateContext(source: Record<string, unknown>): Readonly<{
  provider_type: "openidconnect";
  authorization_url: string;
  access_token_url: string;
  profile_url: string;
}> {
  if (source.provider_type !== "openidconnect") {
    throw new AuthentikFederationAdminError("authentik_conflict", "failed");
  }
  return {
    provider_type: "openidconnect",
    authorization_url: requiredHttpsUrl(source, "authorization_url"),
    access_token_url: requiredHttpsUrl(source, "access_token_url"),
    profile_url: requiredHttpsUrl(source, "profile_url"),
  };
}

function requiredHttpsUrl(
  value: Record<string, unknown>,
  field: string,
): string {
  const candidate = value[field];
  if (
    typeof candidate !== "string" ||
    candidate.length < 10 ||
    candidate.length > 2_048 ||
    /[\u0000-\u001f\u007f]/u.test(candidate)
  ) {
    throw new AuthentikFederationAdminError(
      "authentik_invalid_response",
      "failed",
    );
  }
  try {
    const parsed = new URL(candidate);
    if (
      parsed.protocol !== "https:" ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password
    ) {
      throw new Error("unsafe URL");
    }
  } catch {
    throw new AuthentikFederationAdminError(
      "authentik_invalid_response",
      "failed",
    );
  }
  return candidate;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
