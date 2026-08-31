import assert from "node:assert/strict";
import { X509Certificate } from "node:crypto";

import { AuthentikFederationAdmin } from "../apps/dashboard/lib/server/authentik-federation-admin.ts";

const authentikOrigin = requiredEnvironment("AUTHENTIK_RUNTIME_ORIGIN");
const authentikBearer = requiredEnvironment("AUTHENTIK_RUNTIME_BEARER");
const scimBaseUrl = requiredEnvironment("SCIM_RUNTIME_BASE_URL");
const scimBearer = requiredEnvironment("SCIM_RUNTIME_BEARER");
const inspectionBearer = requiredEnvironment("SCIM_RUNTIME_INSPECTION_BEARER");
const callbackUrl = "https://supabase.runtime.invalid/auth/v1/callback";
const oidcSlug = "loyalty-00000000000000000001";
const samlSlug = "loyalty-00000000000000000002";
const certificateBase64 =
  "MIIDFTCCAf2gAwIBAgIUP5qSDebfmF0sYq65t5TVN0fUcDAwDQYJKoZIhvcNAQELBQAwGjEYMBYGA1UEAwwPZmVkZXJhdGlvbi50ZXN0MB4XDTI2MDgyNjEyNDkwNloXDTM2MDgyMzEyNDkwNlowGjEYMBYGA1UEAwwPZmVkZXJhdGlvbi50ZXN0MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAyVw4kukjD2/8MH5lte0mTKOhzOHG5hYZRC7Lk9o1zyWmcMaHr+5g5F6XvpYJeXBqONoYpDpcqqElImb/JFj1T+wKx2HYtG9B1CZVdDjgb1pCeagu9sgFu9eVWondYOtmrOPYFORJ4ypYUwPZIHSEoS3zNEV/KpEZ0tX9BGEUpaU78szhf2XYXiJEapXz+omQuWU23FxpaQCS4HZw+Z49kZWLjgkWhRIt+3XNe0Lpl+xeOW6pspsga0agmNzs7gb0lHNten3yKyPoj45s8Q1MZovqGOAzxEmnJVSefX6oiOhNkB5ow3f/58JRVPIxEnEHgFI+ycnkWj9GoAsLC3DNYQIDAQABo1MwUTAdBgNVHQ4EFgQUsTCzgdVCYHS8sTsPhnWGDZ6n7i4wHwYDVR0jBBgwFoAUsTCzgdVCYHS8sTsPhnWGDZ6n7i4wDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAb6yEVHIVt2gZDqwZPWopVeUBFePW+vyyauBkpTbPMJC+9KmWTRN3z6RQ7DwvsrRGV87Y/yWbWJeXMP6zynxW4bwaSy5CFBamhy3XrHzHG6qHRlDOq5dxKRIW8zgjzGk8tLlM3Vgen9opMbX8yWhfbjwArq45woVToXdzwvBoK1QHQgI9DRseyY2gdPkD8zcfmHSSRfVQbpV8eEnoqifXl0QC4sUREDcTHaNvF0K+84WhUIC6VpeCznIQ5odlDcLKD5Isl65mTq8imnkyLtdduSp3wwkeLhzzglGyi2IVHMXCOcjS/d3JB6CvMNUyHlOKetA24eiPpurNdrSOLW0qxA==";
const verificationCertificatePem = `-----BEGIN CERTIFICATE-----\n${certificateBase64.match(/.{1,64}/gu).join("\n")}\n-----END CERTIFICATE-----\n`;
const oidcSigningJwk = new X509Certificate(
  Buffer.from(certificateBase64, "base64"),
).publicKey.export({ format: "jwk" });

function requiredEnvironment(key) {
  const value = process.env[key];
  if (!value || value.length > 2_048) throw new Error(`${key} is unavailable`);
  return value;
}

function uuid(value, label) {
  assert.match(
    value,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
    `${label} must be a UUID`,
  );
  return value.toLowerCase();
}

function positiveInteger(value, label) {
  assert.ok(
    Number.isSafeInteger(value) && value > 0,
    `${label} must be positive`,
  );
  return value;
}

function results(value, label) {
  assert.ok(Array.isArray(value?.results), `${label} must return results`);
  return value.results;
}

async function requestJson(
  origin,
  path,
  {
    method = "GET",
    body,
    bearer = authentikBearer,
    expected = [200, 201],
  } = {},
) {
  assert.ok(path.startsWith("/") && !path.includes("#"), "path is invalid");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  timeout.unref();
  try {
    const response = await fetch(`${origin}${path}`, {
      method,
      redirect: "error",
      signal: controller.signal,
      headers: {
        accept: "application/json, application/scim+json",
        ...(body ? { "content-type": "application/json" } : {}),
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    assert.ok(
      expected.includes(response.status),
      `${method} ${path} returned ${response.status}`,
    );
    if (response.status === 204) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.ok(
      bytes.length > 0 && bytes.length <= 512 * 1024,
      "response size invalid",
    );
    const parsed = JSON.parse(bytes.toString("utf8"));
    assert.ok(
      typeof parsed === "object" && parsed !== null,
      "response invalid",
    );
    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}

const authentik = (path, options) =>
  requestJson(authentikOrigin, path, options);

async function createSourceMapping(protocol) {
  const endpoint = `/api/v3/propertymappings/source/${protocol}/`;
  const existing = results(
    await authentik(
      `${endpoint}?name=Starfiniti%20runtime%20${protocol}&page_size=2`,
    ),
    `${protocol} mappings`,
  ).filter((item) => item.name === `Starfiniti runtime ${protocol}`);
  assert.ok(existing.length <= 1, `${protocol} mapping is ambiguous`);
  const resource =
    existing[0] ??
    (await authentik(endpoint, {
      method: "POST",
      body: {
        name: `Starfiniti runtime ${protocol}`,
        expression: "return {'username': 'runtime-subject'}",
      },
    }));
  return uuid(resource.pk, `${protocol} mapping`);
}

async function discoverFlow(slug) {
  const resource = await authentik(`/api/v3/flows/instances/${slug}/`);
  assert.equal(resource.slug, slug, `flow ${slug} differs`);
  return uuid(resource.pk, `flow ${slug}`);
}

async function generateSigningKey() {
  const resource = await authentik(
    "/api/v3/crypto/certificatekeypairs/generate/",
    {
      method: "POST",
      body: {
        common_name: "runtime.invalid",
        subject_alt_name: "DNS:runtime.invalid",
        validity_days: 2,
        alg: "rsa",
      },
    },
  );
  return uuid(resource.pk, "signing key");
}

async function discoverOpenidMapping() {
  const mappings = results(
    await authentik(
      "/api/v3/propertymappings/provider/scope/?scope_name=openid&page_size=10",
    ),
    "OpenID mappings",
  ).filter(
    (item) =>
      item.scope_name === "openid" &&
      item.managed === "goauthentik.io/providers/oauth2/scope-openid",
  );
  assert.equal(mappings.length, 1, "exact built-in OpenID mapping is required");
  return uuid(mappings[0].pk, "OpenID mapping");
}

async function discoverScimMappings() {
  const mappings = results(
    await authentik("/api/v3/propertymappings/provider/scim/?page_size=100"),
    "SCIM mappings",
  );
  const pick = (managed) => {
    const matches = mappings.filter((item) => item.managed === managed);
    assert.equal(matches.length, 1, `SCIM mapping ${managed} differs`);
    return uuid(matches[0].pk, managed);
  };
  return {
    user: pick("goauthentik.io/providers/scim/user"),
    group: pick("goauthentik.io/providers/scim/group"),
  };
}

function federationConfig(shared, sourceMapping) {
  return {
    authentikOrigin,
    supabaseUrl: "https://supabase.runtime.invalid",
    supabaseCallbackUrl: callbackUrl,
    sourceAuthenticationFlowId: shared.sourceAuthenticationFlowId,
    sourceEnrollmentFlowId: shared.sourceEnrollmentFlowId,
    providerAuthorizationFlowId: shared.providerAuthorizationFlowId,
    providerInvalidationFlowId: shared.providerInvalidationFlowId,
    providerSigningKeyId: shared.providerSigningKeyId,
    providerOpenidPropertyMappingId: shared.providerOpenidPropertyMappingId,
    sourceUserPropertyMappingIds: [sourceMapping],
    authentikToken: authentikBearer,
    supabaseServiceRoleKey: "synthetic-service-role-key-00000000000000000000",
    credentialFingerprintKey: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=",
  };
}

function oidcInput(upstream, broker) {
  return {
    sourceSlug: oidcSlug,
    configuration: {
      protocol: "oidc",
      discoveryUrl:
        "https://upstream.runtime.invalid/.well-known/openid-configuration",
      clientId: "runtime-client",
    },
    evidence: {
      protocol: "oidc",
      authorizationEndpoint: "https://upstream.runtime.invalid/authorize",
      tokenEndpoint: "https://upstream.runtime.invalid/token",
    },
    provisioning: {
      protocol: "oidc",
      userinfoEndpoint: "https://upstream.runtime.invalid/userinfo",
      authorizationCodeAuthMethod: "basic_auth",
      pkce: "S256",
      jwks: { keys: [{ ...oidcSigningJwk, use: "sig", alg: "RS256" }] },
    },
    upstreamClientSecret: upstream,
    brokerClientSecret: broker,
  };
}

function samlInput() {
  return {
    sourceSlug: samlSlug,
    configuration: {
      protocol: "saml",
      metadataUrl: "https://upstream.runtime.invalid/metadata",
      expectedEntityId: "urn:starfiniti:runtime:idp",
    },
    evidence: {
      protocol: "saml",
      ssoEndpoint: "https://upstream.runtime.invalid/saml/sso",
    },
    provisioning: {
      protocol: "saml",
      bindingType: "POST",
      nameIdPolicy: "urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified",
      verificationCertificatePem,
    },
    upstreamClientSecret: null,
    brokerClientSecret: "synthetic-saml-broker-000000000000000000000000",
  };
}

async function inspectFederation(resources, slug, protocol) {
  const source = await authentik(`/api/v3/sources/${protocol}/${slug}/`);
  assert.equal(
    source.enabled,
    false,
    `${protocol} source must remain disabled`,
  );
  const provider = await authentik(
    `/api/v3/providers/oauth2/${resources.providerId}/`,
  );
  assert.deepEqual(provider.grant_types, ["authorization_code"]);
  assert.equal(provider.sub_mode, "hashed_user_id");
  assert.equal(provider.issuer_mode, "per_provider");
  assert.deepEqual(provider.redirect_uris, [
    {
      matching_mode: "strict",
      url: callbackUrl,
      redirect_uri_type: "authorization",
    },
  ]);
  const application = await authentik(`/api/v3/core/applications/${slug}/`);
  assert.equal(application.meta_hide, true);
  assert.equal(application.provider, resources.providerId);
  const bindings = results(
    await authentik(
      `/api/v3/flows/bindings/?target=${encodeURIComponent(resources.flowPublicId)}&page_size=100`,
    ),
    `${protocol} flow bindings`,
  );
  assert.equal(bindings.length, 2, `${protocol} flow must have two bindings`);
  assert.deepEqual(
    bindings.map((item) => item.order).sort((a, b) => a - b),
    [10, 20],
  );
  return 2;
}

async function waitForAuthentikApi() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(
        `${authentikOrigin}/api/v3/flows/instances/?page_size=1`,
        {
          redirect: "error",
          headers: { authorization: `Bearer ${authentikBearer}` },
        },
      );
      if (response.status === 200) return;
    } catch {
      // The worker may still be applying first-start blueprints.
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error("Authentik API bootstrap did not converge");
}

async function setup() {
  for (const path of ["/-/health/live/", "/-/health/ready/"]) {
    const response = await fetch(`${authentikOrigin}${path}`, {
      redirect: "error",
    });
    assert.equal(response.status, 200, `${path} must be healthy`);
  }
  await waitForAuthentikApi();
  const shared = {
    sourceAuthenticationFlowId: await discoverFlow(
      "default-source-authentication",
    ),
    sourceEnrollmentFlowId: await discoverFlow("default-source-enrollment"),
    providerAuthorizationFlowId: await discoverFlow(
      "default-provider-authorization-implicit-consent",
    ),
    providerInvalidationFlowId: await discoverFlow(
      "default-provider-invalidation-flow",
    ),
    providerSigningKeyId: await generateSigningKey(),
    providerOpenidPropertyMappingId: await discoverOpenidMapping(),
  };
  const [oauthMapping, samlMapping] = await Promise.all([
    createSourceMapping("oauth"),
    createSourceMapping("saml"),
  ]);
  const oidcAdmin = new AuthentikFederationAdmin(
    federationConfig(shared, oauthMapping),
  );
  const firstOidc = await oidcAdmin.reconcileDisabled(
    oidcInput(
      "synthetic-upstream-credential-000000000000000001",
      "synthetic-broker-credential-000000000000000000001",
    ),
  );
  const secondOidc = await oidcAdmin.reconcileDisabled(
    oidcInput(
      "synthetic-upstream-credential-000000000000000002",
      "synthetic-broker-credential-000000000000000000002",
    ),
  );
  assert.deepEqual(secondOidc, firstOidc, "OIDC resource identity changed");
  await oidcAdmin.rotateOidcSecret(
    oidcSlug,
    "synthetic-upstream-credential-000000000000000003",
  );
  const samlAdmin = new AuthentikFederationAdmin(
    federationConfig(shared, samlMapping),
  );
  const saml = await samlAdmin.reconcileDisabled(samlInput());
  const flowBindings =
    (await inspectFederation(firstOidc, oidcSlug, "oauth")) +
    (await inspectFederation(saml, samlSlug, "saml"));

  const discovery = await requestJson(
    authentikOrigin,
    `/application/o/${oidcSlug}/.well-known/openid-configuration`,
    { bearer: null },
  );
  assert.ok(
    typeof discovery.issuer === "string" &&
      discovery.issuer.includes(`/application/o/${oidcSlug}/`),
    "discovery issuer differs",
  );
  assert.ok(
    Array.isArray(discovery.grant_types_supported) &&
      discovery.grant_types_supported.includes("authorization_code"),
    "authorization code discovery is absent",
  );

  const unauthorized = await fetch(`${scimBaseUrl}/Users`, {
    headers: { authorization: "Bearer deliberately-wrong-runtime-bearer" },
    redirect: "error",
  });
  assert.equal(
    unauthorized.status,
    401,
    "SCIM sink accepted an incorrect bearer",
  );

  const user = await authentik("/api/v3/core/users/", {
    method: "POST",
    body: {
      username: "runtime-subject",
      name: "Runtime Subject",
      is_active: true,
      path: "users",
      type: "internal",
    },
  });
  const group = await authentik("/api/v3/core/groups/", {
    method: "POST",
    body: { name: "Runtime SCIM Cohort", is_superuser: false },
  });
  await authentik(`/api/v3/core/groups/${uuid(group.pk, "group")}/add_user/`, {
    method: "POST",
    body: { pk: positiveInteger(user.pk, "user") },
    expected: [204],
  });
  const mappings = await discoverScimMappings();
  const scimProvider = await authentik("/api/v3/providers/scim/", {
    method: "POST",
    body: {
      name: "Starfiniti runtime SCIM",
      property_mappings: [mappings.user],
      property_mappings_group: [mappings.group],
      url: scimBaseUrl,
      verify_certificates: false,
      token: scimBearer,
      auth_mode: "token",
      auth_oauth: null,
      auth_oauth_params: {},
      compatibility_mode: "default",
      service_provider_config_cache_timeout: "minutes=0",
      exclude_users_service_account: true,
      sync_page_size: 1,
      sync_page_timeout: "minutes=1",
      discovery_enabled: true,
      group_filters: [group.pk],
      dry_run: false,
    },
  });
  const scimProviderId = positiveInteger(scimProvider.pk, "SCIM provider");
  await authentik(`/api/v3/core/applications/${oidcSlug}/`, {
    method: "PATCH",
    body: { backchannel_providers: [scimProviderId] },
  });

  return {
    schema: "starfiniti.authentik-2026-8-runtime-setup.v1",
    scimProviderId,
    userId: positiveInteger(user.pk, "user"),
    userUid: uuid(user.uid, "user UID"),
    groupPk: uuid(group.pk, "group"),
    oidcProviderId: positiveInteger(firstOidc.providerId, "OIDC provider"),
    samlProviderId: positiveInteger(saml.providerId, "SAML provider"),
    flowBindings,
  };
}

async function inspection() {
  return requestJson("http://scim-runtime-sink:8080", "/_state", {
    bearer: inspectionBearer,
  });
}

async function waitFor(predicate, label) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const state = await inspection();
    if (predicate(state)) return state;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`${label} did not converge`);
}

function runtimeTarget(state, setupInput) {
  const user = state.users?.find(
    (item) => item.externalId === setupInput.userUid,
  );
  const group = state.groups?.find(
    (item) => item.externalId === setupInput.groupPk,
  );
  return { user, group };
}

async function mutate(setupInput) {
  const provisioned = await waitFor((state) => {
    const { user, group } = runtimeTarget(state, setupInput);
    return Boolean(user && group && group.members.includes(user.id));
  }, "SCIM provisioning");
  const initial = runtimeTarget(provisioned, setupInput);
  assert.equal(initial.user.active, true);
  assert.ok(
    provisioned.paginationRequests >= 2,
    "candidate did not paginate discovery",
  );
  assert.ok(
    provisioned.serviceProviderConfigReads >= 1,
    "candidate did not discover SCIM capabilities",
  );

  await authentik(`/api/v3/core/groups/${setupInput.groupPk}/remove_user/`, {
    method: "POST",
    body: { pk: setupInput.userId },
    expected: [204],
  });
  await authentik(
    `/api/v3/providers/scim/${setupInput.scimProviderId}/sync/object/`,
    {
      method: "POST",
      body: {
        sync_object_model: "authentik.core.models.Group",
        sync_object_id: setupInput.groupPk,
        override_dry_run: false,
      },
    },
  );
  await authentik(`/api/v3/core/users/${setupInput.userId}/`, {
    method: "PATCH",
    body: { is_active: false },
  });
  await authentik(
    `/api/v3/providers/scim/${setupInput.scimProviderId}/sync/object/`,
    {
      method: "POST",
      body: {
        sync_object_model: "authentik.core.models.User",
        sync_object_id: String(setupInput.userId),
        override_dry_run: false,
      },
    },
  );

  const finalState = await waitFor((state) => {
    const { user, group } = runtimeTarget(state, setupInput);
    return Boolean(
      user &&
      group &&
      user.active === false &&
      !group.members.includes(user.id) &&
      state.memberRemovalPaths >= 1,
    );
  }, "SCIM deprovisioning");
  assert.ok(finalState.authorizationRejects >= 1);
  assert.ok(finalState.operations >= 12);
  return {
    schema: "starfiniti.authentik-2026-8-runtime-result.v1",
    federationResources: 2,
    flowBindings: setupInput.flowBindings,
    scimOperations: finalState.operations,
    scimAuthorizationRejects: finalState.authorizationRejects,
    scimCapabilityReads: finalState.serviceProviderConfigReads,
    scimPaginationRequests: finalState.paginationRequests,
    scimMemberRemovalPaths: finalState.memberRemovalPaths,
    checks: 32,
  };
}

function parseArguments(argv) {
  if (argv.length === 1 && argv[0] === "setup") return { phase: "setup" };
  if (argv[0] !== "mutate" || argv.length !== 11) {
    throw new Error("operator expects setup or exact mutate arguments");
  }
  const expected = ["--provider", "--user", "--uid", "--group", "--bindings"];
  const values = {};
  for (let index = 1; index < argv.length; index += 2) {
    assert.equal(
      argv[index],
      expected[(index - 1) / 2],
      "argument order differs",
    );
    values[argv[index].slice(2)] = argv[index + 1];
  }
  return {
    phase: "mutate",
    setup: {
      scimProviderId: positiveInteger(Number(values.provider), "SCIM provider"),
      userId: positiveInteger(Number(values.user), "user"),
      userUid: uuid(values.uid, "user UID"),
      groupPk: uuid(values.group, "group"),
      flowBindings: positiveInteger(Number(values.bindings), "flow bindings"),
    },
  };
}

const parsed = parseArguments(process.argv.slice(2));
const output =
  parsed.phase === "setup" ? await setup() : await mutate(parsed.setup);
process.stdout.write(`${JSON.stringify(output)}\n`);
