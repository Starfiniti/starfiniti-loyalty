import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import https from "node:https";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const paths = Object.freeze({
  review: "infrastructure/governance/authentik-2026-8-compatibility.yaml",
  admin: "apps/dashboard/lib/server/authentik-federation-admin.ts",
  config: "apps/dashboard/lib/server/federation-management-config.ts",
  scimHttp: "apps/dashboard/lib/server/scim-http.ts",
  scimContract: "packages/contracts/src/scim.ts",
  scimTest: "packages/contracts/src/scim.test.ts",
  scimMigration:
    "supabase/migrations/20260826161825_organization_scim_provisioning.sql",
  federationRunbook: "docs/operations/TENANT_FEDERATION.md",
  scimRunbook: "docs/operations/TENANT_SCIM.md",
  tasks: "docs/plan/TASKS.yaml",
  package: "package.json",
  adr: "docs/architecture/ADR/0109-authentik-2026-8-source-compatibility-contract.md",
});

const expectedOperations = Object.freeze([
  ["GET", "/api/v3/sources/oauth/{slug}/", "sources_oauth_retrieve"],
  ["GET", "/api/v3/sources/saml/{slug}/", "sources_saml_retrieve"],
  ["PATCH", "/api/v3/sources/oauth/{slug}/", "sources_oauth_partial_update"],
  ["PATCH", "/api/v3/sources/saml/{slug}/", "sources_saml_partial_update"],
  ["POST", "/api/v3/sources/oauth/", "sources_oauth_create"],
  ["POST", "/api/v3/sources/saml/", "sources_saml_create"],
  [
    "GET",
    "/api/v3/crypto/certificatekeypairs/",
    "crypto_certificatekeypairs_list",
  ],
  [
    "PATCH",
    "/api/v3/crypto/certificatekeypairs/{kp_uuid}/",
    "crypto_certificatekeypairs_partial_update",
  ],
  [
    "POST",
    "/api/v3/crypto/certificatekeypairs/",
    "crypto_certificatekeypairs_create",
  ],
  ["GET", "/api/v3/flows/instances/{slug}/", "flows_instances_retrieve"],
  [
    "PATCH",
    "/api/v3/flows/instances/{slug}/",
    "flows_instances_partial_update",
  ],
  ["POST", "/api/v3/flows/instances/", "flows_instances_create"],
  ["GET", "/api/v3/stages/identification/", "stages_identification_list"],
  [
    "PATCH",
    "/api/v3/stages/identification/{stage_uuid}/",
    "stages_identification_partial_update",
  ],
  ["POST", "/api/v3/stages/identification/", "stages_identification_create"],
  ["GET", "/api/v3/stages/user_login/", "stages_user_login_list"],
  [
    "PATCH",
    "/api/v3/stages/user_login/{stage_uuid}/",
    "stages_user_login_partial_update",
  ],
  ["POST", "/api/v3/stages/user_login/", "stages_user_login_create"],
  ["GET", "/api/v3/flows/bindings/", "flows_bindings_list"],
  [
    "PATCH",
    "/api/v3/flows/bindings/{fsb_uuid}/",
    "flows_bindings_partial_update",
  ],
  ["POST", "/api/v3/flows/bindings/", "flows_bindings_create"],
  ["GET", "/api/v3/providers/oauth2/", "providers_oauth2_list"],
  [
    "PATCH",
    "/api/v3/providers/oauth2/{id}/",
    "providers_oauth2_partial_update",
  ],
  ["POST", "/api/v3/providers/oauth2/", "providers_oauth2_create"],
  ["GET", "/api/v3/core/applications/{slug}/", "core_applications_retrieve"],
  [
    "PATCH",
    "/api/v3/core/applications/{slug}/",
    "core_applications_partial_update",
  ],
  ["POST", "/api/v3/core/applications/", "core_applications_create"],
]);

const expectedArtifacts = Object.freeze([
  [
    "authentik/providers/scim/clients/users.py",
    5_933,
    "10204cd456c3c5f29dbb31d4b3f34424e088544eda08832658493ef4aae96d17",
  ],
  [
    "authentik/providers/scim/clients/groups.py",
    17_419,
    "3fc85fb83c42c1b56c4ed9a154b2c972d6641582fa2515887635741c12d58ee0",
  ],
  [
    "authentik/providers/scim/clients/base.py",
    6_326,
    "ee95c004a62fe9e781725a6f24b85e26d5c7ee1ae28696c34952c88e0f79af5e",
  ],
  [
    "authentik/providers/scim/clients/schema.py",
    8_521,
    "abcedc4478800406887a86b738f16e51d2e204e70f7adce0f8d76a137df998fa",
  ],
  [
    "authentik/sources/oauth/api/source.py",
    9_033,
    "91353515a6402dda100aeafdb4f9bc3ea8cb5a44b02c11dc35d1a3978c8088bf",
  ],
  [
    "authentik/sources/saml/api/source.py",
    3_934,
    "d044e864aa6e96989f9781e07f0eb82b0d8202acb9f08b268a09798ba03ce671",
  ],
  [
    "authentik/providers/oauth2/api/providers.py",
    8_673,
    "3fb7e1f4fc5f088719b54ee0fb92f5b7cd1ddf4523427aae8ebc78ce4684bd15",
  ],
  [
    "authentik/providers/oauth2/id_token.py",
    7_887,
    "a9a3fbd58cd11e853f5ab14742b1d154606cae73121e6187f683493315ec0f0e",
  ],
]);

const expectedRequestShapes = Object.freeze([
  [
    "oauth-source",
    ["OAuthSourceRequest", "PatchedOAuthSourceRequest"],
    [
      "name",
      "slug",
      "enabled",
      "promoted",
      "authentication_flow",
      "enrollment_flow",
      "user_property_mappings",
      "group_property_mappings",
      "policy_engine_mode",
      "user_matching_mode",
      "group_matching_mode",
      "provider_type",
      "authorization_url",
      "access_token_url",
      "profile_url",
      "pkce",
      "consumer_key",
      "consumer_secret",
      "additional_scopes",
      "oidc_well_known_url",
      "oidc_jwks_url",
      "oidc_jwks",
      "authorization_code_auth_method",
    ],
  ],
  [
    "saml-source",
    ["SAMLSourceRequest", "PatchedSAMLSourceRequest"],
    [
      "name",
      "slug",
      "enabled",
      "promoted",
      "authentication_flow",
      "enrollment_flow",
      "user_property_mappings",
      "group_property_mappings",
      "policy_engine_mode",
      "user_matching_mode",
      "group_matching_mode",
      "pre_authentication_flow",
      "sso_url",
      "slo_url",
      "allow_idp_initiated",
      "force_authn",
      "name_id_policy",
      "binding_type",
      "verification_kp",
      "signing_kp",
      "encryption_kp",
      "digest_algorithm",
      "signature_algorithm",
      "temporary_user_delete_after",
      "signed_assertion",
      "signed_response",
    ],
  ],
  [
    "certificate-key-pair",
    ["CertificateKeyPairRequest", "PatchedCertificateKeyPairRequest"],
    ["name", "certificate_data", "key_data"],
  ],
  [
    "authentication-flow",
    ["FlowRequest", "PatchedFlowRequest"],
    [
      "name",
      "slug",
      "title",
      "designation",
      "policy_engine_mode",
      "compatibility_mode",
      "layout",
      "denied_action",
      "authentication",
    ],
  ],
  [
    "identification-stage",
    ["IdentificationStageRequest", "PatchedIdentificationStageRequest"],
    [
      "name",
      "user_fields",
      "password_stage",
      "captcha_stage",
      "case_insensitive_matching",
      "show_matched_user",
      "enrollment_flow",
      "recovery_flow",
      "passwordless_flow",
      "sources",
      "show_source_labels",
      "pretend_user_exists",
      "enable_remember_me",
      "webauthn_stage",
    ],
  ],
  [
    "user-login-stage",
    ["UserLoginStageRequest", "PatchedUserLoginStageRequest"],
    [
      "name",
      "session_duration",
      "terminate_other_sessions",
      "remember_me_offset",
      "network_binding",
      "geoip_binding",
      "remember_device",
    ],
  ],
  [
    "flow-stage-binding",
    ["FlowStageBindingRequest", "PatchedFlowStageBindingRequest"],
    [
      "target",
      "stage",
      "evaluate_on_plan",
      "re_evaluate_policies",
      "order",
      "policy_engine_mode",
      "invalid_response_action",
    ],
  ],
  [
    "oauth2-provider",
    ["OAuth2ProviderRequest", "PatchedOAuth2ProviderRequest"],
    [
      "name",
      "authentication_flow",
      "authorization_flow",
      "invalidation_flow",
      "property_mappings",
      "client_type",
      "grant_types",
      "client_id",
      "client_secret",
      "access_code_validity",
      "access_token_validity",
      "refresh_token_validity",
      "refresh_token_threshold",
      "include_claims_in_id_token",
      "signing_key",
      "encryption_key",
      "redirect_uris",
      "logout_uri",
      "logout_method",
      "sub_mode",
      "issuer_mode",
      "jwt_federation_sources",
      "jwt_federation_providers",
    ],
  ],
  [
    "application",
    ["ApplicationRequest", "PatchedApplicationRequest"],
    [
      "name",
      "slug",
      "provider",
      "backchannel_providers",
      "open_in_new_tab",
      "meta_launch_url",
      "meta_icon",
      "meta_description",
      "meta_publisher",
      "policy_engine_mode",
      "group",
      "meta_hide",
    ],
  ],
]);

const remainingGates = Object.freeze([
  "private-configuration-and-signing-recovery-export",
  "base-url-and-deprecated-postgresql-option-inventory",
  "exact-container-image-and-same-version-outpost-inventory",
  "disposable-exact-2026-8-runtime-rehearsal",
  "oidc-and-saml-admin-reconciliation-fixtures",
  "scim-discovery-user-group-membership-and-deprovisioning-fixtures",
  "stale-session-live-membership-and-rls-canary",
  "clean-room-recovery-and-rollback",
  "independent-review",
  "owner-approval",
]);

function fail(message) {
  throw new Error(`Authentik 2026.8 compatibility review invalid: ${message}`);
}

function exactKeys(value, expected, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join("\n") !== [...expected].sort().join("\n")
  ) {
    fail(`${label} keys differ`);
  }
}

function exactArray(value, expected, label) {
  if (JSON.stringify(value) !== JSON.stringify(expected)) {
    fail(`${label} differs`);
  }
}

function includes(text, phrases, label) {
  for (const phrase of phrases) {
    if (!text.includes(phrase)) fail(`${label} is missing ${phrase}`);
  }
}

function occurrences(text, phrase) {
  return text.split(phrase).length - 1;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function allFalse(value, expected, label) {
  exactKeys(value, expected, label);
  if (Object.values(value).some((item) => item !== false)) {
    fail(`${label} must remain entirely false`);
  }
}

function validateReview(bundle) {
  const review = bundle.review;
  exactKeys(
    review,
    [
      "schema",
      "reviewedAt",
      "reviewCutoff",
      "scope",
      "provenance",
      "officialSources",
      "approach",
      "adminSurface",
      "releaseImpact",
      "protocolContracts",
      "verdict",
      "remainingGates",
      "rollback",
      "limitations",
      "authority",
    ],
    "review",
  );
  if (
    review.schema !== "starfiniti.authentik-source-compatibility.v1" ||
    review.reviewedAt !== "2026-08-31" ||
    review.reviewCutoff !== "2026-08-31T12:00:00Z"
  ) {
    fail("review identity differs");
  }

  exactKeys(
    review.scope,
    [
      "provider",
      "baseline",
      "candidate",
      "evidenceClass",
      "productionRuntimeChanged",
      "privateConfigurationRead",
    ],
    "scope",
  );
  if (
    review.scope.provider !== "authentik" ||
    review.scope.baseline !== "2026.5.6" ||
    review.scope.candidate !== "2026.8.0" ||
    review.scope.evidenceClass !== "immutable-source-and-openapi-contract" ||
    review.scope.productionRuntimeChanged !== false ||
    review.scope.privateConfigurationRead !== false
  ) {
    fail("scope differs");
  }

  exactKeys(
    review.provenance,
    ["baseline", "candidate", "sourceArtifacts"],
    "provenance",
  );
  const baseline = review.provenance.baseline;
  exactKeys(
    baseline,
    ["release", "tagObject", "commit", "schema", "runtimeEvidence"],
    "baseline provenance",
  );
  if (
    baseline.release !==
      "https://github.com/goauthentik/authentik/releases/tag/version/2026.5.6" ||
    baseline.tagObject !== "80babf5b9e88d2bfa21a3c0c80e9db143f8b94a" ||
    baseline.commit !== "0c67ea476be6319f1b2a41cb0f5ed128af37b99b" ||
    baseline.runtimeEvidence !==
      "docs/plan/evidence/M16/runs/authentik-runtime-88c8046-2026-08-31T055501Z.json"
  ) {
    fail("baseline provenance differs");
  }
  exactKeys(
    baseline.schema,
    ["path", "gitBlob", "bytes", "sha256"],
    "baseline schema",
  );
  if (
    baseline.schema.path !== "schema.yml" ||
    baseline.schema.gitBlob !== "8ded89a4d1f97112190f953bffbc37c21c0e3516" ||
    baseline.schema.bytes !== 1_712_010 ||
    baseline.schema.sha256 !==
      "d4460a399f8ad27309518ef52dcc2c15cbddfe316239b47fc3365cb75ddad3b7"
  ) {
    fail("baseline schema provenance differs");
  }

  const candidate = review.provenance.candidate;
  exactKeys(
    candidate,
    [
      "release",
      "releaseNotes",
      "publishedAt",
      "tagObject",
      "commit",
      "tagVerification",
      "schema",
      "releaseNotesSource",
      "releaseAsset",
      "registry",
    ],
    "candidate provenance",
  );
  if (
    candidate.release !==
      "https://github.com/goauthentik/authentik/releases/tag/version/2026.8.0" ||
    candidate.releaseNotes !== "https://docs.goauthentik.io/releases/2026.8/" ||
    candidate.publishedAt !== "2026-08-18T22:04:25Z" ||
    candidate.tagObject !== "428801ce2f5a6db4ef167f09023a95dde4c592d3" ||
    candidate.commit !== "f3753ec20ce13ef672401a131379d1a5a2d3439b"
  ) {
    fail("candidate release provenance differs");
  }
  exactKeys(
    candidate.tagVerification,
    ["verified", "reason"],
    "tag verification",
  );
  if (
    candidate.tagVerification.verified !== false ||
    candidate.tagVerification.reason !== "unsigned"
  ) {
    fail("unsigned tag state must remain explicit");
  }
  exactKeys(
    candidate.schema,
    ["path", "gitBlob", "bytes", "sha256"],
    "candidate schema",
  );
  if (
    candidate.schema.path !== "schema.yml" ||
    candidate.schema.gitBlob !== "71519604a9659037993c269553d79a9bac649108" ||
    candidate.schema.bytes !== 1_803_002 ||
    candidate.schema.sha256 !==
      "7eb0cc4fac5a22e1f856ed7933a7fddb231d1e1bb5710e60dfc41e3e2e046750"
  ) {
    fail("candidate schema provenance differs");
  }
  exactKeys(
    candidate.releaseNotesSource,
    ["path", "gitBlob", "bytes", "sha256"],
    "release notes source",
  );
  if (
    candidate.releaseNotesSource.path !==
      "website/docs/releases/2026/v2026.8.md" ||
    candidate.releaseNotesSource.gitBlob !==
      "b2830b30c8626e25e8ded7535a208d6b02273241" ||
    candidate.releaseNotesSource.bytes !== 19_344 ||
    candidate.releaseNotesSource.sha256 !==
      "41995dd4cf748401e8e9ecd9a8cbecbfda10c160ca9e509c9bbe8d8c6e645c6d"
  ) {
    fail("release notes source provenance differs");
  }
  exactKeys(
    candidate.releaseAsset,
    ["name", "bytes", "sha256"],
    "release asset",
  );
  if (
    candidate.releaseAsset.name !== "server.oci.tar" ||
    candidate.releaseAsset.bytes !== 746_491_392 ||
    candidate.releaseAsset.sha256 !==
      "83786edd88e64fc69c4bef801211df7cd2670357afb67b826bbcba6b660f7a4a"
  ) {
    fail("release asset provenance differs");
  }
  exactKeys(
    candidate.registry,
    [
      "image",
      "indexDigest",
      "linuxAmd64IndexDigest",
      "linuxAmd64ManifestDigest",
      "linuxAmd64AttestationDigest",
    ],
    "registry",
  );
  if (
    candidate.registry.image !== "ghcr.io/goauthentik/server:2026.8.0" ||
    candidate.registry.indexDigest !==
      "sha256:7421753cfea67e89a6d295a1f0173ccea3866b33768c88dad90453b151cdcfd5" ||
    candidate.registry.linuxAmd64IndexDigest !==
      "sha256:5217eed4e86a3c6666ecf81c3430753ef958f97f93ac614070d458c10e0b2b33" ||
    candidate.registry.linuxAmd64ManifestDigest !==
      "sha256:21000cebe8e51eca0620034096586d675cedec8925ac750f7f8966d86eeb0da0" ||
    candidate.registry.linuxAmd64AttestationDigest !==
      "sha256:8470929d918149da17b07410875999112043762ed4e242f5010906da4f5e60b4"
  ) {
    fail("registry provenance differs");
  }
  exactArray(
    review.provenance.sourceArtifacts.map((item) => [
      item.path,
      item.bytes,
      item.sha256,
    ]),
    expectedArtifacts,
    "candidate source artifacts",
  );
  for (const artifact of review.provenance.sourceArtifacts) {
    exactKeys(artifact, ["path", "bytes", "sha256"], "source artifact");
  }

  exactKeys(
    review.officialSources,
    [
      "securityPolicy",
      "releaseNotes",
      "scimProvider",
      "oauthSources",
      "samlSources",
      "sourceTree",
    ],
    "official sources",
  );
  exactArray(
    Object.values(review.officialSources),
    [
      "https://docs.goauthentik.io/security/policy/",
      "https://docs.goauthentik.io/releases/2026.8/",
      "https://docs.goauthentik.io/add-secure-apps/providers/scim/",
      "https://docs.goauthentik.io/users-sources/sources/protocols/oauth/",
      "https://docs.goauthentik.io/users-sources/sources/protocols/saml/",
      "https://github.com/goauthentik/authentik/tree/version/2026.8.0",
    ],
    "official source URLs",
  );

  exactKeys(review.approach, ["compared", "chosen", "rationale"], "approach");
  exactArray(
    review.approach.compared.map((item) => item.id),
    [
      "exact-disposable-runtime-rehearsal",
      "immutable-source-and-openapi-contract",
    ],
    "compared approaches",
  );
  for (const item of review.approach.compared) {
    exactKeys(item, ["id", "strength", "limitation"], "compared approach");
    if (!item.strength || !item.limitation) fail("approach analysis is empty");
  }
  if (
    review.approach.chosen !== "immutable-source-and-openapi-contract" ||
    !review.approach.rationale.includes("mandatory candidate gate")
  ) {
    fail("approach decision differs");
  }

  const surface = review.adminSurface;
  exactKeys(
    surface,
    [
      "implementation",
      "operationCount",
      "requestSchemaCount",
      "requestShapeCount",
      "sentFieldOccurrenceCount",
      "exactSentFieldOccurrenceCount",
      "compatibleChangedSentFieldOccurrenceCount",
      "oauthSourceFieldOccurrenceCount",
      "otherRequestShapeFieldOccurrenceCount",
      "missingOperations",
      "removedSentFields",
      "newRequiredRequestFields",
      "requestShapes",
      "operations",
      "compatibleChanges",
    ],
    "admin surface",
  );
  if (
    surface.implementation !== paths.admin ||
    surface.operationCount !== 27 ||
    surface.requestSchemaCount !== 18 ||
    surface.requestShapeCount !== 9 ||
    surface.sentFieldOccurrenceCount !== 248 ||
    surface.exactSentFieldOccurrenceCount !== 240 ||
    surface.compatibleChangedSentFieldOccurrenceCount !== 8 ||
    surface.oauthSourceFieldOccurrenceCount !== 46 ||
    surface.otherRequestShapeFieldOccurrenceCount !== 202 ||
    surface.missingOperations !== 0 ||
    surface.removedSentFields !== 0 ||
    surface.newRequiredRequestFields !== 0
  ) {
    fail("admin surface metrics differ");
  }
  exactArray(
    surface.requestShapes.map((shape) => [
      shape.id,
      shape.schemas,
      shape.fields,
    ]),
    expectedRequestShapes,
    "request shape census",
  );
  for (const shape of surface.requestShapes) {
    exactKeys(
      shape,
      [
        "id",
        "fieldsPerSchema",
        "schemaOccurrences",
        "fieldOccurrences",
        "schemas",
        "fields",
      ],
      `request shape ${shape.id}`,
    );
    if (
      shape.fieldsPerSchema !== shape.fields.length ||
      shape.schemaOccurrences !== shape.schemas.length ||
      shape.fieldOccurrences !== shape.fieldsPerSchema * shape.schemaOccurrences
    ) {
      fail(`request shape ${shape.id} arithmetic differs`);
    }
  }
  if (
    surface.requestShapes.reduce(
      (total, shape) => total + shape.fieldOccurrences,
      0,
    ) !== surface.sentFieldOccurrenceCount ||
    surface.exactSentFieldOccurrenceCount +
      surface.compatibleChangedSentFieldOccurrenceCount !==
      surface.sentFieldOccurrenceCount ||
    surface.requestShapes.find((shape) => shape.id === "oauth-source")
      ?.fieldOccurrences !== surface.oauthSourceFieldOccurrenceCount ||
    surface.requestShapes
      .filter((shape) => shape.id !== "oauth-source")
      .reduce((total, shape) => total + shape.fieldOccurrences, 0) !==
      surface.otherRequestShapeFieldOccurrenceCount ||
    surface.oauthSourceFieldOccurrenceCount +
      surface.otherRequestShapeFieldOccurrenceCount !==
      surface.sentFieldOccurrenceCount
  ) {
    fail("request field census arithmetic differs");
  }
  exactArray(
    surface.operations,
    expectedOperations,
    "OpenAPI operation contract",
  );
  exactArray(
    surface.compatibleChanges.map((item) => [
      item.field,
      item.change,
      item.disposition,
    ]),
    [
      [
        "OAuthSourceRequest.authorization_url",
        "maxLength-255-removed",
        "compatible-widening",
      ],
      [
        "OAuthSourceRequest.access_token_url",
        "maxLength-255-removed",
        "compatible-widening",
      ],
      [
        "OAuthSourceRequest.profile_url",
        "maxLength-255-removed",
        "compatible-widening",
      ],
      [
        "OAuth2ProviderRequest.grant_types",
        "enum-reference-renamed-and-token-exchange-added",
        "authorization-code-value-preserved",
      ],
      [
        "SAMLSourceRequest.issuer",
        "replaced-by-optional-issuer_override-and-required-response-url_issuer-added",
        "compatible-because-starfiniti-writes-neither-and-parses-only-pk",
      ],
    ],
    "compatible change inventory",
  );
  for (const item of surface.compatibleChanges) {
    exactKeys(item, ["field", "change", "disposition"], "compatible change");
  }

  exactKeys(
    review.releaseImpact,
    [
      "breakingChanges",
      "ownedSurfaceIntersection",
      "deprecations",
      "migrationChecks",
    ],
    "release impact",
  );
  exactArray(
    review.releaseImpact.breakingChanges,
    [
      "hash-password-cli-input-only",
      "webauthn-prevent-duplicate-device-option-removed",
    ],
    "breaking changes",
  );
  if (review.releaseImpact.ownedSurfaceIntersection !== "none") {
    fail("owned release intersection differs");
  }
  exactArray(
    review.releaseImpact.deprecations,
    [
      "AUTHENTIK_POSTGRESQL__CONN_OPTIONS",
      "AUTHENTIK_POSTGRESQL__REPLICA__CONN_OPTIONS",
    ],
    "deprecations",
  );
  exactArray(
    review.releaseImpact.migrationChecks,
    [
      "configure-and-assert-base-url-before-2026-11",
      "inventory-and-upgrade-all-outposts-to-exact-server-version",
      "verify-rust-entrypoint-health-and-proxy-outpost-behavior",
      "inventory-deprecated-postgresql-connection-options",
    ],
    "release migration checks",
  );

  exactKeys(
    review.protocolContracts,
    ["oidc", "saml", "scim", "deprovisioning"],
    "protocol contracts",
  );
  for (const protocol of Object.values(review.protocolContracts)) {
    exactKeys(
      protocol,
      ["expected", "sourceDisposition", "runtimeProof"],
      "protocol contract",
    );
    if (protocol.runtimeProof !== false)
      fail("protocol runtime proof is overstated");
  }
  exactKeys(
    review.protocolContracts.oidc.expected,
    [
      "scopes",
      "upstreamType",
      "downstreamGrantTypes",
      "downstreamSubjectMode",
      "redirectMatching",
      "supabaseCallback",
    ],
    "OIDC expected contract",
  );
  exactArray(
    review.protocolContracts.oidc.expected.scopes,
    ["openid"],
    "OIDC scopes",
  );
  exactArray(
    review.protocolContracts.oidc.expected.downstreamGrantTypes,
    ["authorization_code"],
    "OIDC grants",
  );
  if (
    review.protocolContracts.oidc.expected.downstreamSubjectMode !==
      "hashed_user_id" ||
    review.protocolContracts.oidc.expected.redirectMatching !== "strict" ||
    review.protocolContracts.oidc.expected.supabaseCallback !==
      "https://api.loyalty.starfiniti.com/auth/v1/callback"
  ) {
    fail("OIDC contract differs");
  }
  if (
    review.protocolContracts.oidc.expected.upstreamType !== "openidconnect" ||
    review.protocolContracts.oidc.sourceDisposition !==
      "preserved-with-additive-token-exchange-and-dcr-capabilities-unused"
  ) {
    fail("OIDC source disposition differs");
  }
  const saml = review.protocolContracts.saml.expected;
  exactKeys(
    saml,
    [
      "idpInitiated",
      "forceAuthn",
      "signedAssertion",
      "signedResponse",
      "digest",
      "signature",
    ],
    "SAML expected contract",
  );
  if (
    saml.idpInitiated !== false ||
    saml.forceAuthn !== false ||
    saml.signedAssertion !== true ||
    saml.signedResponse !== true ||
    saml.digest !== "http://www.w3.org/2001/04/xmlenc#sha256" ||
    saml.signature !== "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"
  ) {
    fail("SAML contract differs");
  }
  if (
    review.protocolContracts.saml.sourceDisposition !==
    "request-fields-preserved-issuer-response-change-requires-candidate-metadata-fixture"
  ) {
    fail("SAML source disposition differs");
  }
  const scim = review.protocolContracts.scim.expected;
  exactKeys(
    scim,
    [
      "userExternalId",
      "groupExternalId",
      "discoveryPagination",
      "maximumCount",
      "memberRemovalPath",
      "authorizationAuthority",
    ],
    "SCIM expected contract",
  );
  exactArray(
    scim.discoveryPagination,
    ["startIndex", "count"],
    "SCIM pagination",
  );
  if (
    scim.maximumCount !== 200 ||
    scim.memberRemovalPath !== 'members[value eq "<uuid>"]' ||
    scim.authorizationAuthority !== "live-postgresql-membership-and-rls"
  ) {
    fail("SCIM contract differs");
  }
  if (
    scim.userExternalId !==
      "authentik-user-uid-correlated-with-hashed-oidc-subject" ||
    scim.groupExternalId !== "authentik-group-primary-key" ||
    review.protocolContracts.scim.sourceDisposition !==
      "candidate-pagination-and-member-removal-forms-are-supported-by-starfiniti-contracts"
  ) {
    fail("SCIM correlation or source disposition differs");
  }
  const deprovisioning = review.protocolContracts.deprovisioning.expected;
  exactKeys(
    deprovisioning,
    [
      "idpDeactivationMayDeleteAuthentikSessions",
      "staleApplicationSessionRechecksLiveMembership",
      "idpClaimsGrantTenantAuthority",
      "invitationOrScimProvisioningRequired",
    ],
    "deprovisioning expected contract",
  );
  if (
    deprovisioning.idpDeactivationMayDeleteAuthentikSessions !== true ||
    deprovisioning.staleApplicationSessionRechecksLiveMembership !== true ||
    deprovisioning.idpClaimsGrantTenantAuthority !== false ||
    deprovisioning.invitationOrScimProvisioningRequired !== true
  ) {
    fail("deprovisioning contract differs");
  }
  if (
    review.protocolContracts.deprovisioning.sourceDisposition !==
    "candidate-session-deletion-is-defense-in-depth-and-does-not-replace-database-authorization"
  ) {
    fail("deprovisioning source disposition differs");
  }

  exactKeys(
    review.verdict,
    [
      "sourceContractCompatible",
      "candidateRuntimeExecuted",
      "identityCompatibilityProven",
      "recoveryProven",
      "rollbackProven",
      "upgradeAccepted",
      "deployedVersionRetained",
    ],
    "verdict",
  );
  if (
    review.verdict.sourceContractCompatible !== true ||
    review.verdict.candidateRuntimeExecuted !== false ||
    review.verdict.identityCompatibilityProven !== false ||
    review.verdict.recoveryProven !== false ||
    review.verdict.rollbackProven !== false ||
    review.verdict.upgradeAccepted !== false ||
    review.verdict.deployedVersionRetained !== "2026.5.6"
  ) {
    fail("verdict overstates evidence");
  }
  exactArray(review.remainingGates, remainingGates, "remaining gates");
  exactKeys(
    review.rollback,
    ["currentRuntime", "candidateFailure", "preserve", "forbidden"],
    "rollback",
  );
  if (
    review.rollback.currentRuntime !== "retain-authentik-2026-5-6" ||
    review.rollback.candidateFailure !==
      "reject-before-production-and-preserve-current-runtime" ||
    !review.rollback.forbidden.includes(
      "production-upgrade-from-source-contract-alone",
    ) ||
    !review.rollback.preserve.includes("local-break-glass-owner")
  ) {
    fail("rollback boundary differs");
  }
  exactArray(
    review.rollback.preserve,
    [
      "database-and-private-configuration-export",
      "signing-and-encryption-material",
      "local-break-glass-owner",
      "supabase-callback-and-provider-identifiers",
      "exact-current-image-and-outpost-inventory",
    ],
    "rollback preservation",
  );
  exactArray(
    review.rollback.forbidden,
    [
      "production-upgrade-from-source-contract-alone",
      "deleting-membership-federation-or-audit-history",
      "email-domain-group-or-jwt-claim-authorization",
    ],
    "rollback prohibitions",
  );
  exactKeys(
    review.limitations,
    [
      "exactCandidateSourcePinned",
      "exactCandidateRuntimeObserved",
      "privateConfigurationObserved",
      "imageAndOutpostInventoryObserved",
      "protocolTrafficExecuted",
      "productionMutation",
    ],
    "limitations",
  );
  if (
    review.limitations.exactCandidateSourcePinned !== true ||
    Object.entries(review.limitations)
      .filter(([key]) => key !== "exactCandidateSourcePinned")
      .some(([, value]) => value !== false)
  ) {
    fail("limitations overstate proof");
  }
  allFalse(
    review.authority,
    [
      "productionAccess",
      "mergeApproved",
      "releaseApproved",
      "providerUpgradeApproved",
      "deploymentApproved",
      "productionMutation",
      "productionReconciled",
    ],
    "authority",
  );

  includes(
    bundle.admin,
    [
      "/api/v3/sources/oauth/${sourceSlug}/",
      "/api/v3/sources/saml/${sourceSlug}/",
      "/api/v3/crypto/certificatekeypairs/",
      "/api/v3/flows/instances/${names.flowSlug}/",
      "/api/v3/stages/identification/",
      "/api/v3/stages/user_login/",
      "/api/v3/flows/bindings/?target=",
      "/api/v3/providers/oauth2/",
      "/api/v3/core/applications/${slug}/",
      'additional_scopes: "openid"',
      'grant_types: ["authorization_code"]',
      'sub_mode: "hashed_user_id"',
      'matching_mode: "strict"',
      "allow_idp_initiated: false",
      "force_authn: false",
      "signed_assertion: true",
      "signed_response: true",
      "backchannel_providers: []",
    ],
    "Authentik admin implementation",
  );
  for (const field of new Set(
    expectedRequestShapes.flatMap(([, , fields]) => fields),
  )) {
    if (
      !new RegExp(`(?:^|[,{])\\s*${field}(?:\\s*:|\\s*[,}])`, "m").test(
        bundle.admin,
      )
    ) {
      fail(`Authentik admin implementation is missing request field ${field}`);
    }
  }
  includes(
    bundle.config,
    ["supabaseCallbackUrl: `${supabaseUrl}/auth/v1/callback`"],
    "federation management configuration",
  );
  includes(
    bundle.scimHttp,
    [
      'requestUrl.searchParams.get("startIndex")',
      'requestUrl.searchParams.get("count")',
      "count > 200",
    ],
    "SCIM HTTP implementation",
  );
  includes(
    bundle.scimContract,
    [
      'z.enum(["add", "remove", "replace"])',
      "path: z.string().trim().min(1).max(512).optional()",
    ],
    "SCIM contract",
  );
  includes(
    bundle.scimTest,
    ['members[value eq "${groupId}"]'],
    "SCIM member-removal fixture",
  );
  includes(
    bundle.scimMigration,
    [
      "offset target_start_index - 1 limit target_count",
      "'^members\\[value eq \"([0-9a-fA-F-]{36})\"\\]$'",
      "unsupported SCIM Group patch path",
    ],
    "SCIM database implementation",
  );
  if (
    occurrences(
      bundle.scimMigration,
      "offset target_start_index - 1 limit target_count",
    ) !== 2
  ) {
    fail("SCIM user and group pagination bindings differ");
  }
  includes(
    bundle.federationRunbook,
    [
      "PostgreSQL membership remains the authorization authority",
      "Existing sessions continue to pass through live organization membership and RLS checks",
    ],
    "tenant federation runbook",
  );
  includes(
    bundle.scimRunbook,
    [
      "Existing sessions fail on their next live tenant-context check",
      "Database RLS is authoritative",
      "never searches by email",
    ],
    "tenant SCIM runbook",
  );

  const command = "continuous-improvement:authentik-2026-8:validate";
  const upstreamCommand =
    "continuous-improvement:authentik-2026-8:upstream:verify";
  if (
    bundle.package.scripts?.[command] !==
      "node scripts/validate-authentik-2026-8-compatibility.mjs --self-test" ||
    bundle.package.scripts?.[upstreamCommand] !==
      "node scripts/validate-authentik-2026-8-compatibility.mjs --upstream-verify" ||
    !bundle.package.scripts?.check?.includes(`npm run ${command}`)
  ) {
    fail("root verification binding differs");
  }
  const task = bundle.tasks.tasks?.find(
    (item) => item.id === "M16-CONTINUOUS-IMPROVEMENT",
  );
  if (
    !task ||
    !task.verification?.includes(`npm run ${command}`) ||
    !task.verification?.includes(`npm run ${upstreamCommand}`) ||
    !task.docs?.includes(paths.adr) ||
    !task.evidence?.includes(paths.review)
  ) {
    fail("M16 task binding differs");
  }
  includes(
    bundle.adr,
    [
      "Accepted as a source-contract gate; production upgrade not accepted",
      "27 owned API operations",
      "248 sent request-field occurrences",
      "retain identical schema descriptors and eight have compatible descriptor",
      "broker remains on 2026.5.6",
      "does not prove runtime compatibility",
      paths.review,
      `npm run ${upstreamCommand}`,
    ],
    "ADR-0109",
  );
}

function loadBundle() {
  const read = (path) => readFileSync(join(root, path), "utf8");
  return {
    review: YAML.parse(read(paths.review)),
    admin: read(paths.admin),
    config: read(paths.config),
    scimHttp: read(paths.scimHttp),
    scimContract: read(paths.scimContract),
    scimTest: read(paths.scimTest),
    scimMigration: read(paths.scimMigration),
    federationRunbook: read(paths.federationRunbook),
    scimRunbook: read(paths.scimRunbook),
    tasks: YAML.parse(read(paths.tasks)),
    package: JSON.parse(read(paths.package)),
    adr: read(paths.adr),
  };
}

function fetchImmutableSource(commit, path, maximumBytes) {
  const url = new URL(
    `https://raw.githubusercontent.com/goauthentik/authentik/${commit}/${path}`,
  );
  if (url.hostname !== "raw.githubusercontent.com") {
    fail("upstream host differs");
  }
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          Accept: "text/plain, application/yaml;q=0.9",
          "Accept-Encoding": "identity",
          "User-Agent": "Starfiniti-Authentik-Compatibility-Review/1",
        },
      },
      (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`upstream ${path} returned ${response.statusCode}`));
          return;
        }
        if (
          response.headers.location !== undefined ||
          ![undefined, "identity"].includes(
            response.headers["content-encoding"],
          )
        ) {
          response.resume();
          reject(new Error(`upstream ${path} changed transport`));
          return;
        }
        const chunks = [];
        let received = 0;
        response.on("data", (chunk) => {
          received += chunk.length;
          if (received > maximumBytes) {
            request.destroy(new Error(`upstream ${path} exceeded byte bound`));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => resolve(Buffer.concat(chunks)));
      },
    );
    request.setTimeout(15_000, () =>
      request.destroy(new Error(`upstream ${path} timed out`)),
    );
    request.on("error", reject);
  });
}

function verifyBytes(bytes, expected, label) {
  if (bytes.length !== expected.bytes || sha256(bytes) !== expected.sha256) {
    fail(`${label} bytes differ from pinned provenance`);
  }
}

async function verifyUpstream(bundle) {
  validateReview(bundle);
  const { baseline, candidate, sourceArtifacts } = bundle.review.provenance;
  const [
    baselineSchemaBytes,
    candidateSchemaBytes,
    releaseNotesBytes,
    ...sources
  ] = await Promise.all([
    fetchImmutableSource(
      baseline.commit,
      baseline.schema.path,
      baseline.schema.bytes,
    ),
    fetchImmutableSource(
      candidate.commit,
      candidate.schema.path,
      candidate.schema.bytes,
    ),
    fetchImmutableSource(
      candidate.commit,
      candidate.releaseNotesSource.path,
      candidate.releaseNotesSource.bytes,
    ),
    ...sourceArtifacts.map((artifact) =>
      fetchImmutableSource(candidate.commit, artifact.path, artifact.bytes),
    ),
  ]);
  verifyBytes(baselineSchemaBytes, baseline.schema, "baseline schema");
  verifyBytes(candidateSchemaBytes, candidate.schema, "candidate schema");
  verifyBytes(
    releaseNotesBytes,
    candidate.releaseNotesSource,
    "candidate release notes",
  );
  for (const [index, bytes] of sources.entries()) {
    verifyBytes(
      bytes,
      sourceArtifacts[index],
      `candidate source ${sourceArtifacts[index].path}`,
    );
  }
  const sourceText = new Map(
    sourceArtifacts.map((artifact, index) => [
      artifact.path,
      sources[index].toString("utf8"),
    ]),
  );
  const requireSource = (path, phrases) => {
    const text = sourceText.get(path);
    if (!text) fail(`candidate source ${path} was not fetched`);
    includes(text, phrases, `candidate source ${path}`);
  };
  requireSource("authentik/providers/scim/clients/users.py", [
    "scim_user.externalId = str(obj.uid)",
  ]);
  requireSource("authentik/providers/scim/clients/groups.py", [
    "scim_group.externalId = str(obj.pk)",
    `path=f'members[value eq "{user_id}"]'`,
  ]);
  requireSource("authentik/providers/scim/clients/base.py", [
    'params={"count": self.provider.sync_page_size, "startIndex": start_index}',
  ]);
  requireSource("authentik/providers/oauth2/id_token.py", [
    "if provider.sub_mode == SubModes.HASHED_USER_ID:",
    "return user.uid",
  ]);

  const baselineSchema = YAML.parse(baselineSchemaBytes.toString("utf8"));
  const candidateSchema = YAML.parse(candidateSchemaBytes.toString("utf8"));
  const reviewedSchemas = new Set(
    expectedRequestShapes.flatMap(([, schemas]) => schemas),
  );
  for (const [method, publicPath, operationId] of expectedOperations) {
    const schemaPath = publicPath.replace("/api/v3", "");
    const baselineOperation =
      baselineSchema.paths?.[schemaPath]?.[method.toLowerCase()];
    const candidateOperation =
      candidateSchema.paths?.[schemaPath]?.[method.toLowerCase()];
    if (
      baselineOperation?.operationId !== operationId ||
      candidateOperation?.operationId !== operationId
    ) {
      fail(`upstream operation ${method} ${publicPath} differs`);
    }
    const requestRef = (operation) =>
      operation.requestBody?.content?.["application/json"]?.schema?.$ref ??
      null;
    const responseRef = (operation) =>
      operation.responses?.["200"]?.content?.["application/json"]?.schema
        ?.$ref ??
      operation.responses?.["201"]?.content?.["application/json"]?.schema
        ?.$ref ??
      null;
    const beforeRequest = requestRef(baselineOperation);
    const afterRequest = requestRef(candidateOperation);
    if (
      beforeRequest !== afterRequest ||
      (afterRequest !== null &&
        !reviewedSchemas.has(afterRequest.split("/").at(-1))) ||
      responseRef(baselineOperation) !== responseRef(candidateOperation)
    ) {
      fail(`upstream operation schema ${method} ${publicPath} differs`);
    }
  }

  let exactOccurrences = 0;
  let compatibleOccurrences = 0;
  let newRequiredFields = 0;
  const changed = [];
  for (const [, schemas, fields] of expectedRequestShapes) {
    for (const schemaName of schemas) {
      const baselineRequest = baselineSchema.components?.schemas?.[schemaName];
      const candidateRequest =
        candidateSchema.components?.schemas?.[schemaName];
      if (!baselineRequest || !candidateRequest) {
        fail(`upstream request schema ${schemaName} is missing`);
      }
      for (const field of fields) {
        const before = baselineRequest.properties?.[field];
        const after = candidateRequest.properties?.[field];
        if (!before || !after) {
          fail(`upstream sent field ${schemaName}.${field} is missing`);
        }
        if (JSON.stringify(before) === JSON.stringify(after)) {
          exactOccurrences += 1;
        } else {
          compatibleOccurrences += 1;
          changed.push(`${schemaName}.${field}`);
        }
      }
      const baselineRequired = new Set(baselineRequest.required ?? []);
      newRequiredFields += (candidateRequest.required ?? []).filter(
        (field) => !baselineRequired.has(field),
      ).length;
    }
  }
  exactArray(
    changed,
    [
      "OAuthSourceRequest.authorization_url",
      "OAuthSourceRequest.access_token_url",
      "OAuthSourceRequest.profile_url",
      "PatchedOAuthSourceRequest.authorization_url",
      "PatchedOAuthSourceRequest.access_token_url",
      "PatchedOAuthSourceRequest.profile_url",
      "OAuth2ProviderRequest.grant_types",
      "PatchedOAuth2ProviderRequest.grant_types",
    ],
    "upstream compatible sent-field changes",
  );
  if (
    exactOccurrences !==
      bundle.review.adminSurface.exactSentFieldOccurrenceCount ||
    compatibleOccurrences !==
      bundle.review.adminSurface.compatibleChangedSentFieldOccurrenceCount ||
    exactOccurrences + compatibleOccurrences !==
      bundle.review.adminSurface.sentFieldOccurrenceCount ||
    newRequiredFields !== 0
  ) {
    fail("upstream request-field census differs");
  }

  for (const schemaName of [
    "OAuthSourceRequest",
    "PatchedOAuthSourceRequest",
  ]) {
    for (const field of [
      "authorization_url",
      "access_token_url",
      "profile_url",
    ]) {
      if (
        baselineSchema.components.schemas[schemaName].properties[field]
          .maxLength !== 255 ||
        Object.hasOwn(
          candidateSchema.components.schemas[schemaName].properties[field],
          "maxLength",
        )
      ) {
        fail(`upstream OAuth widening ${schemaName}.${field} differs`);
      }
    }
  }
  for (const schemaName of [
    "OAuth2ProviderRequest",
    "PatchedOAuth2ProviderRequest",
  ]) {
    if (
      baselineSchema.components.schemas[schemaName].properties.grant_types.items
        .$ref !== "#/components/schemas/GrantTypesEnum" ||
      candidateSchema.components.schemas[schemaName].properties.grant_types
        .items.$ref !== "#/components/schemas/GrantTypeEnum"
    ) {
      fail(`upstream grant enum ${schemaName} differs`);
    }
  }
  if (
    !baselineSchema.components.schemas.GrantTypesEnum.enum.includes(
      "authorization_code",
    ) ||
    !candidateSchema.components.schemas.GrantTypeEnum.enum.includes(
      "authorization_code",
    )
  ) {
    fail("authorization_code is not preserved upstream");
  }
  for (const schemaName of ["SAMLSourceRequest", "PatchedSAMLSourceRequest"]) {
    const before = baselineSchema.components.schemas[schemaName].properties;
    const after = candidateSchema.components.schemas[schemaName].properties;
    if (!before.issuer || after.issuer || !after.issuer_override) {
      fail(`upstream SAML issuer change ${schemaName} differs`);
    }
  }
  const candidateSamlResponse = candidateSchema.components.schemas.SAMLSource;
  if (
    !candidateSamlResponse.properties.url_issuer ||
    !candidateSamlResponse.required.includes("url_issuer")
  ) {
    fail("upstream SAML response issuer differs");
  }

  console.log(
    "Verified pinned Authentik 2026.5.6/2026.8.0 upstream bytes, 27 operations, and 248 sent request-field occurrences (240 exact, 8 compatible).",
  );
}

function selfTest(bundle) {
  validateReview(bundle);
  const cases = [
    (x) => (x.review.schema = "wrong"),
    (x) => (x.review.reviewCutoff = "2026-09-01T00:00:00Z"),
    (x) => (x.review.scope.candidate = "2026.8.1"),
    (x) => (x.review.scope.productionRuntimeChanged = true),
    (x) => (x.review.provenance.baseline.commit = "0".repeat(40)),
    (x) => (x.review.provenance.baseline.schema.sha256 = "0".repeat(64)),
    (x) => (x.review.provenance.candidate.commit = "0".repeat(40)),
    (x) => (x.review.provenance.candidate.tagVerification.verified = true),
    (x) => (x.review.provenance.candidate.schema.gitBlob = "0".repeat(40)),
    (x) => (x.review.provenance.candidate.releaseAsset.bytes = 1),
    (x) =>
      (x.review.provenance.candidate.registry.indexDigest = "sha256:wrong"),
    (x) => (x.review.provenance.sourceArtifacts[0].sha256 = "0".repeat(64)),
    (x) => (x.review.provenance.sourceArtifacts[0].unexpected = true),
    (x) =>
      (x.review.officialSources.securityPolicy = "https://example.invalid"),
    (x) => (x.review.approach.chosen = "exact-disposable-runtime-rehearsal"),
    (x) => (x.review.approach.compared[0].unexpected = true),
    (x) => (x.review.adminSurface.operationCount = 26),
    (x) => (x.review.adminSurface.requestSchemaCount = 17),
    (x) => (x.review.adminSurface.sentFieldOccurrenceCount = 247),
    (x) => (x.review.adminSurface.exactSentFieldOccurrenceCount = 239),
    (x) => (x.review.adminSurface.oauthSourceFieldOccurrenceCount = 45),
    (x) => (x.review.adminSurface.otherRequestShapeFieldOccurrenceCount = 201),
    (x) => x.review.adminSurface.requestShapes[0].fields.pop(),
    (x) => (x.review.adminSurface.missingOperations = 1),
    (x) => x.review.adminSurface.operations.pop(),
    (x) => (x.review.adminSurface.operations[0][2] = "wrong"),
    (x) => x.review.adminSurface.compatibleChanges.pop(),
    (x) =>
      (x.review.adminSurface.compatibleChanges[0].disposition =
        "compatible-without-evidence"),
    (x) => (x.review.releaseImpact.ownedSurfaceIntersection = "unknown"),
    (x) => x.review.releaseImpact.deprecations.pop(),
    (x) => x.review.releaseImpact.migrationChecks.shift(),
    (x) => x.review.releaseImpact.migrationChecks.push("upgrade-production"),
    (x) => (x.review.protocolContracts.oidc.runtimeProof = true),
    (x) =>
      (x.review.protocolContracts.oidc.sourceDisposition = "runtime-proven"),
    (x) =>
      (x.review.protocolContracts.oidc.expected.scopes = ["openid", "email"]),
    (x) =>
      (x.review.protocolContracts.oidc.expected.downstreamSubjectMode = "uuid"),
    (x) => (x.review.protocolContracts.saml.expected.idpInitiated = true),
    (x) => (x.review.protocolContracts.saml.expected.unexpected = true),
    (x) => (x.review.protocolContracts.scim.expected.maximumCount = 500),
    (x) =>
      (x.review.protocolContracts.scim.sourceDisposition = "runtime-proven"),
    (x) =>
      (x.review.protocolContracts.deprovisioning.expected.idpClaimsGrantTenantAuthority = true),
    (x) => (x.review.verdict.candidateRuntimeExecuted = true),
    (x) => (x.review.verdict.upgradeAccepted = true),
    (x) => x.review.remainingGates.pop(),
    (x) => (x.review.rollback.currentRuntime = "upgrade"),
    (x) => x.review.rollback.preserve.pop(),
    (x) => x.review.rollback.forbidden.push("ignore-canary-failure"),
    (x) => (x.review.limitations.protocolTrafficExecuted = true),
    (x) => (x.review.authority.providerUpgradeApproved = true),
    (x) =>
      (x.admin = x.admin.replace(
        'sub_mode: "hashed_user_id"',
        'sub_mode: "uuid"',
      )),
    (x) =>
      (x.admin = x.admin.replace("force_authn: false", "force_authn: true")),
    (x) =>
      (x.admin = x.admin.replace('group_matching_mode: "identifier",', "")),
    (x) => (x.config = x.config.replace("/auth/v1/callback", "/callback")),
    (x) =>
      (x.scimHttp = x.scimHttp.replace(
        'requestUrl.searchParams.get("count")',
        'requestUrl.searchParams.get("limit")',
      )),
    (x) =>
      (x.scimMigration = x.scimMigration.replace(
        "offset target_start_index - 1 limit target_count",
        "limit target_count",
      )),
    (x) =>
      (x.scimRunbook = x.scimRunbook.replace(
        "Database RLS is authoritative",
        "Identity claims are authoritative",
      )),
    (x) =>
      delete x.package.scripts[
        "continuous-improvement:authentik-2026-8:validate"
      ],
    (x) =>
      (x.package.scripts.check = x.package.scripts.check.replace(
        "npm run continuous-improvement:authentik-2026-8:validate",
        "",
      )),
    (x) =>
      (x.tasks.tasks.find(
        (item) => item.id === "M16-CONTINUOUS-IMPROVEMENT",
      ).evidence = []),
    (x) =>
      (x.adr = x.adr.replace(
        "does not prove runtime compatibility",
        "proves runtime compatibility",
      )),
  ];
  for (const [index, mutate] of cases.entries()) {
    const candidate = structuredClone(bundle);
    mutate(candidate);
    let rejected = false;
    try {
      validateReview(candidate);
    } catch {
      rejected = true;
    }
    if (!rejected) fail(`self-test corruption ${index + 1} was accepted`);
  }
  console.log(
    `Validated 27 Authentik operations and 248 sent request-field occurrences (240 exact, 8 compatible); rejected ${cases.length} corruptions.`,
  );
}

const bundle = loadBundle();
if (process.argv.includes("--upstream-verify")) {
  await verifyUpstream(bundle);
} else if (process.argv.includes("--self-test")) selfTest(bundle);
else {
  validateReview(bundle);
  console.log("Validated Authentik 2026.8 source compatibility contract.");
}
