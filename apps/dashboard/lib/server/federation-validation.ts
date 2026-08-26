import {
  createHash,
  createPublicKey,
  type JsonWebKey as CryptoJsonWebKey,
  X509Certificate,
} from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";
import {
  organizationFederationSourceConfigurationV1,
  organizationFederationValidationEvidenceV1,
  type OrganizationFederationSourceConfigurationV1,
  type OrganizationFederationValidationEvidenceV1,
} from "@starfiniti/contracts";
import { XMLParser } from "fast-xml-parser";
import { SyntaxValidator } from "fast-xml-validator";

const MAX_DOCUMENT_BYTES = 256 * 1024;
const MAX_JSON_KEYS = 100;
const MAX_SIGNING_KEYS = 20;
const MAX_SAML_ENDPOINTS = 20;
const REQUEST_TIMEOUT_MS = 8_000;
const federationAddressBlockList = new BlockList();

for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  federationAddressBlockList.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  federationAddressBlockList.addSubnet(network, prefix, "ipv6");
}

const forbiddenHostnameSuffixes = [
  ".example",
  ".home.arpa",
  ".internal",
  ".invalid",
  ".local",
  ".localhost",
  ".test",
] as const;

export type FederationValidationErrorCode =
  | "federation_certificate_expired"
  | "federation_content_type_invalid"
  | "federation_dns_unavailable"
  | "federation_document_invalid"
  | "federation_document_redirect"
  | "federation_document_too_large"
  | "federation_document_unavailable"
  | "federation_oidc_issuer_mismatch"
  | "federation_oidc_unsupported"
  | "federation_saml_entity_mismatch"
  | "federation_signing_key_invalid"
  | "federation_url_forbidden";

export class FederationValidationError extends Error {
  constructor(readonly code: FederationValidationErrorCode) {
    super(code);
  }
}

type Address = Readonly<{ address: string; family: number }>;

type TransportResponse = Readonly<{
  status: number;
  contentType: string | null;
  contentEncoding: string | null;
  declaredLength: string | null;
  body: Buffer;
}>;

type TransportRequest = Readonly<{
  url: URL;
  pinnedAddress: Address;
  timeoutMs: number;
  maxBytes: number;
}>;

export type FederationValidationRuntime = Readonly<{
  lookup: (hostname: string) => Promise<Address[]>;
  request: (request: TransportRequest) => Promise<TransportResponse>;
  now: () => Date;
}>;

const defaultRuntime: FederationValidationRuntime = {
  lookup: async (hostname) =>
    dnsLookup(hostname, { all: true, verbatim: true }),
  request: sendPinnedHttpsRequest,
  now: () => new Date(),
};

export async function validateOrganizationFederationConfiguration(
  configurationInput: OrganizationFederationSourceConfigurationV1,
  configurationSha256: string,
  runtime: FederationValidationRuntime = defaultRuntime,
): Promise<OrganizationFederationValidationEvidenceV1> {
  const configuration =
    organizationFederationSourceConfigurationV1.parse(configurationInput);
  if (!/^[a-f0-9]{64}$/u.test(configurationSha256)) {
    throw new FederationValidationError("federation_document_invalid");
  }
  const dnsCache = new Map<string, Address[]>();
  const validatedAt = runtime.now().toISOString();
  if (configuration.protocol === "oidc") {
    return validateOidc(
      configuration,
      configurationSha256,
      validatedAt,
      runtime,
      dnsCache,
    );
  }
  return validateSaml(
    configuration,
    configurationSha256,
    validatedAt,
    runtime,
    dnsCache,
  );
}

async function validateOidc(
  configuration: Extract<
    OrganizationFederationSourceConfigurationV1,
    { protocol: "oidc" }
  >,
  configurationSha256: string,
  validatedAt: string,
  runtime: FederationValidationRuntime,
  dnsCache: Map<string, Address[]>,
): Promise<OrganizationFederationValidationEvidenceV1> {
  const discovery = await fetchFederationDocument(
    configuration.discoveryUrl,
    ["application/json"],
    runtime,
    dnsCache,
  );
  const metadata = parseJsonObject(discovery.body);
  const issuer = requiredString(metadata, "issuer");
  parseFederationUrl(issuer, false);
  const expectedDiscoveryUrl = `${issuer.replace(/\/$/u, "")}/.well-known/openid-configuration`;
  if (configuration.discoveryUrl !== expectedDiscoveryUrl) {
    throw new FederationValidationError("federation_oidc_issuer_mismatch");
  }

  const authorizationEndpoint = requiredString(
    metadata,
    "authorization_endpoint",
  );
  const tokenEndpoint = requiredString(metadata, "token_endpoint");
  const jwksUri = requiredString(metadata, "jwks_uri");
  await Promise.all(
    [issuer, authorizationEndpoint, tokenEndpoint].map((value) =>
      assertPublicFederationUrl(value, runtime, dnsCache, true),
    ),
  );
  const responseTypes = requiredStringArray(
    metadata,
    "response_types_supported",
  );
  const grantTypes = optionalStringArray(metadata, "grant_types_supported");
  const signingAlgorithms = requiredStringArray(
    metadata,
    "id_token_signing_alg_values_supported",
  );
  const subjectTypes = requiredStringArray(metadata, "subject_types_supported");
  const tokenAuthenticationMethods = optionalStringArray(
    metadata,
    "token_endpoint_auth_methods_supported",
  );
  const scopes = optionalStringArray(metadata, "scopes_supported");
  const supportedSigningAlgorithms = new Set([
    "EdDSA",
    "ES256",
    "ES384",
    "ES512",
    "PS256",
    "PS384",
    "PS512",
    "RS256",
    "RS384",
    "RS512",
  ]);
  if (
    !responseTypes.includes("code") ||
    (grantTypes !== null && !grantTypes.includes("authorization_code")) ||
    !signingAlgorithms.some((algorithm) =>
      supportedSigningAlgorithms.has(algorithm),
    ) ||
    !subjectTypes.some((subjectType) =>
      ["public", "pairwise"].includes(subjectType),
    ) ||
    (tokenAuthenticationMethods !== null &&
      !tokenAuthenticationMethods.some((method) =>
        ["client_secret_basic", "client_secret_post"].includes(method),
      )) ||
    (scopes !== null && !scopes.includes("openid"))
  ) {
    throw new FederationValidationError("federation_oidc_unsupported");
  }

  const jwks = await fetchFederationDocument(
    jwksUri,
    ["application/json", "application/jwk-set+json"],
    runtime,
    dnsCache,
  );
  const signingFingerprints = parseJwksFingerprints(jwks.body);
  return organizationFederationValidationEvidenceV1.parse({
    schemaVersion: "1",
    protocol: "oidc",
    configurationSha256,
    documentSha256: sha256(discovery.body),
    issuer,
    authorizationEndpoint,
    tokenEndpoint,
    jwksUri,
    ssoEndpoint: null,
    signingFingerprints,
    validatedAt,
  });
}

async function validateSaml(
  configuration: Extract<
    OrganizationFederationSourceConfigurationV1,
    { protocol: "saml" }
  >,
  configurationSha256: string,
  validatedAt: string,
  runtime: FederationValidationRuntime,
  dnsCache: Map<string, Address[]>,
): Promise<OrganizationFederationValidationEvidenceV1> {
  const metadataDocument = await fetchFederationDocument(
    configuration.metadataUrl,
    ["application/samlmetadata+xml", "application/xml", "text/xml"],
    runtime,
    dnsCache,
  );
  const xml = decodeUtf8(metadataDocument.body);
  if (/<!/iu.test(xml)) {
    throw new FederationValidationError("federation_document_invalid");
  }
  try {
    SyntaxValidator.validate(xml, {
      allowBooleanAttributes: false,
      docType: { maxEntityCount: 0, maxEntitySize: 0 },
      invalidCharSequence: { attrLt: true, comment: true, tagValue: true },
      multipleRoots: false,
    });
  } catch {
    throw new FederationValidationError("federation_document_invalid");
  }
  let parsed: unknown;
  try {
    parsed = new XMLParser({
      ignoreAttributes: false,
      removeNSPrefix: true,
      parseAttributeValue: false,
      parseTagValue: false,
      processEntities: {
        enabled: true,
        maxEntityCount: 0,
        maxEntitySize: 0,
        maxExpansionDepth: 1,
        maxTotalExpansions: 1_000,
        maxExpandedLength: MAX_DOCUMENT_BYTES,
      },
      maxNestedTags: 64,
      ignoreDeclaration: true,
      ignorePiTags: true,
      onDangerousProperty: () => {
        throw new FederationValidationError("federation_document_invalid");
      },
      isArray: (tagName) =>
        [
          "EntityDescriptor",
          "IDPSSODescriptor",
          "KeyDescriptor",
          "SingleSignOnService",
          "X509Certificate",
        ].includes(tagName),
    }).parse(xml);
  } catch (error) {
    if (error instanceof FederationValidationError) throw error;
    throw new FederationValidationError("federation_document_invalid");
  }

  const entities = collectNamedRecords(parsed, "EntityDescriptor", 100);
  const selected = configuration.expectedEntityId
    ? entities.filter(
        (entity) => entity["@_entityID"] === configuration.expectedEntityId,
      )
    : entities;
  if (
    selected.length !== 1 ||
    (configuration.expectedEntityId === null && entities.length !== 1)
  ) {
    throw new FederationValidationError("federation_saml_entity_mismatch");
  }
  const entity = selected[0];
  if (!entity) {
    throw new FederationValidationError("federation_saml_entity_mismatch");
  }
  const entityId = safeXmlString(entity["@_entityID"]);
  if (entityId === null || entityId.length > 2_048) {
    throw new FederationValidationError("federation_saml_entity_mismatch");
  }
  const idpDescriptors = asRecords(entity.IDPSSODescriptor).filter(
    (descriptor) =>
      safeXmlString(descriptor["@_protocolSupportEnumeration"])
        ?.split(/\s+/u)
        .includes("urn:oasis:names:tc:SAML:2.0:protocol") === true,
  );
  if (idpDescriptors.length !== 1) {
    throw new FederationValidationError("federation_document_invalid");
  }
  const descriptor = idpDescriptors[0];
  if (!descriptor) {
    throw new FederationValidationError("federation_document_invalid");
  }

  const endpoints = asRecords(descriptor.SingleSignOnService)
    .map((endpoint) => ({
      binding: safeXmlString(endpoint["@_Binding"]),
      location: safeXmlString(endpoint["@_Location"]),
    }))
    .filter(
      (endpoint): endpoint is { binding: string; location: string } =>
        endpoint.binding !== null &&
        endpoint.location !== null &&
        [
          "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
          "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
        ].includes(endpoint.binding),
    );
  if (endpoints.length === 0 || endpoints.length > MAX_SAML_ENDPOINTS) {
    throw new FederationValidationError("federation_document_invalid");
  }
  await Promise.all(
    endpoints.map((endpoint) =>
      assertPublicFederationUrl(endpoint.location, runtime, dnsCache, true),
    ),
  );
  endpoints.sort((left, right) => {
    const leftRank = left.binding.endsWith("HTTP-POST") ? 0 : 1;
    const rightRank = right.binding.endsWith("HTTP-POST") ? 0 : 1;
    return leftRank - rightRank || left.location.localeCompare(right.location);
  });
  const ssoEndpoint = endpoints[0]?.location;
  if (!ssoEndpoint) {
    throw new FederationValidationError("federation_document_invalid");
  }
  const signingFingerprints = samlCertificateFingerprints(
    descriptor,
    runtime.now(),
  );

  return organizationFederationValidationEvidenceV1.parse({
    schemaVersion: "1",
    protocol: "saml",
    configurationSha256,
    documentSha256: sha256(metadataDocument.body),
    issuer: entityId,
    authorizationEndpoint: null,
    tokenEndpoint: null,
    jwksUri: null,
    ssoEndpoint,
    signingFingerprints,
    validatedAt,
  });
}

async function fetchFederationDocument(
  urlValue: string,
  acceptedContentTypes: readonly string[],
  runtime: FederationValidationRuntime,
  dnsCache: Map<string, Address[]>,
): Promise<TransportResponse> {
  const url = parseFederationUrl(urlValue, true);
  const addresses = await resolvePublicAddresses(url, runtime, dnsCache);
  const pinnedAddress = [...addresses].sort((left, right) =>
    left.address.localeCompare(right.address),
  )[0];
  if (!pinnedAddress) {
    throw new FederationValidationError("federation_dns_unavailable");
  }
  let response: TransportResponse;
  try {
    response = await runtime.request({
      url,
      pinnedAddress,
      timeoutMs: REQUEST_TIMEOUT_MS,
      maxBytes: MAX_DOCUMENT_BYTES,
    });
  } catch (error) {
    if (error instanceof FederationValidationError) throw error;
    throw new FederationValidationError("federation_document_unavailable");
  }
  if (response.status >= 300 && response.status <= 399) {
    throw new FederationValidationError("federation_document_redirect");
  }
  if (response.status !== 200) {
    throw new FederationValidationError("federation_document_unavailable");
  }
  if (
    response.contentEncoding !== null &&
    response.contentEncoding.toLowerCase() !== "identity"
  ) {
    throw new FederationValidationError("federation_content_type_invalid");
  }
  const declaredLength = parseDeclaredLength(response.declaredLength);
  if (
    declaredLength !== null &&
    (declaredLength > MAX_DOCUMENT_BYTES ||
      declaredLength !== response.body.length)
  ) {
    throw new FederationValidationError("federation_document_too_large");
  }
  if (response.body.length === 0 || response.body.length > MAX_DOCUMENT_BYTES) {
    throw new FederationValidationError("federation_document_too_large");
  }
  const contentType = response.contentType
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (!contentType || !acceptedContentTypes.includes(contentType)) {
    throw new FederationValidationError("federation_content_type_invalid");
  }
  return response;
}

async function assertPublicFederationUrl(
  value: string,
  runtime: FederationValidationRuntime,
  dnsCache: Map<string, Address[]>,
  allowQuery: boolean,
): Promise<void> {
  const url = parseFederationUrl(value, allowQuery);
  await resolvePublicAddresses(url, runtime, dnsCache);
}

function parseFederationUrl(value: string, allowQuery: boolean): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new FederationValidationError("federation_url_forbidden");
  }
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    (url.port !== "" && url.port !== "443") ||
    url.username !== "" ||
    url.password !== "" ||
    url.hash !== "" ||
    (!allowQuery && url.search !== "") ||
    value.length > 2_048 ||
    isIP(hostname) !== 0 ||
    hostname.length === 0 ||
    !hostname.includes(".") ||
    hostname.endsWith(".") ||
    hostname === "localhost" ||
    forbiddenHostnameSuffixes.some(
      (suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix),
    )
  ) {
    throw new FederationValidationError("federation_url_forbidden");
  }
  return url;
}

async function resolvePublicAddresses(
  url: URL,
  runtime: FederationValidationRuntime,
  dnsCache: Map<string, Address[]>,
): Promise<Address[]> {
  const cached = dnsCache.get(url.hostname);
  if (cached) return cached;
  let addresses: Address[];
  try {
    addresses = await runtime.lookup(url.hostname);
  } catch {
    throw new FederationValidationError("federation_dns_unavailable");
  }
  if (
    !Array.isArray(addresses) ||
    addresses.length === 0 ||
    addresses.some(
      (answer) =>
        (answer.family !== 4 && answer.family !== 6) ||
        !isPublicFederationAddress(answer.address),
    )
  ) {
    throw new FederationValidationError("federation_url_forbidden");
  }
  dnsCache.set(url.hostname, addresses);
  return addresses;
}

export function isPublicFederationAddress(address: string): boolean {
  const family = isIP(address);
  return (
    (family === 4 && !federationAddressBlockList.check(address, "ipv4")) ||
    (family === 6 && !federationAddressBlockList.check(address, "ipv6"))
  );
}

function sendPinnedHttpsRequest(
  input: TransportRequest,
): Promise<TransportResponse> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finishReject = (error: Error): void => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const request = httpsRequest(
      {
        protocol: "https:",
        hostname: input.url.hostname,
        servername: input.url.hostname,
        port: 443,
        path: `${input.url.pathname}${input.url.search}`,
        method: "GET",
        agent: false,
        minVersion: "TLSv1.2",
        maxHeaderSize: 16 * 1024,
        headers: {
          accept:
            "application/json, application/jwk-set+json, application/samlmetadata+xml, application/xml, text/xml",
          "accept-encoding": "identity",
          connection: "close",
          "user-agent": "Starfiniti-Loyalty-Federation-Validator/1",
        },
        lookup: (_hostname, options, callback) => {
          if (options.all) {
            callback(null, [input.pinnedAddress]);
            return;
          }
          callback(
            null,
            input.pinnedAddress.address,
            input.pinnedAddress.family,
          );
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let responseBytes = 0;
        response.on("data", (chunk: Buffer | string) => {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          responseBytes += bytes.length;
          if (responseBytes > input.maxBytes) {
            response.destroy();
            finishReject(
              new FederationValidationError("federation_document_too_large"),
            );
            return;
          }
          chunks.push(bytes);
        });
        response.on("aborted", () =>
          finishReject(
            new FederationValidationError("federation_document_unavailable"),
          ),
        );
        response.on("error", () =>
          finishReject(
            new FederationValidationError("federation_document_unavailable"),
          ),
        );
        response.on("end", () => {
          if (settled) return;
          settled = true;
          resolve({
            status: response.statusCode ?? 0,
            contentType: firstHeader(response.headers["content-type"]),
            contentEncoding: firstHeader(response.headers["content-encoding"]),
            declaredLength: firstHeader(response.headers["content-length"]),
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    const timeout = setTimeout(() => {
      request.destroy();
      finishReject(
        new FederationValidationError("federation_document_unavailable"),
      );
    }, input.timeoutMs);
    timeout.unref();
    request.on("close", () => clearTimeout(timeout));
    request.on("error", () =>
      finishReject(
        new FederationValidationError("federation_document_unavailable"),
      ),
    );
    request.end();
  });
}

function firstHeader(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function parseDeclaredLength(value: string | null): number | null {
  if (value === null) return null;
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) {
    throw new FederationValidationError("federation_document_invalid");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new FederationValidationError("federation_document_too_large");
  }
  return parsed;
}

function parseJsonObject(body: Buffer): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeUtf8(body));
  } catch {
    throw new FederationValidationError("federation_document_invalid");
  }
  if (!isRecord(parsed) || Object.keys(parsed).length > MAX_JSON_KEYS) {
    throw new FederationValidationError("federation_document_invalid");
  }
  return parsed;
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 2_048 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new FederationValidationError("federation_document_invalid");
  }
  return value;
}

function requiredStringArray(
  record: Record<string, unknown>,
  key: string,
): string[] {
  const value = optionalStringArray(record, key);
  if (value === null) {
    throw new FederationValidationError("federation_document_invalid");
  }
  return value;
}

function optionalStringArray(
  record: Record<string, unknown>,
  key: string,
): string[] | null {
  const value = record[key];
  if (value === undefined) return null;
  if (
    !Array.isArray(value) ||
    value.length > 100 ||
    value.some(
      (item) =>
        typeof item !== "string" ||
        item.length === 0 ||
        item.length > 256 ||
        /[\u0000-\u001f\u007f]/u.test(item),
    )
  ) {
    throw new FederationValidationError("federation_document_invalid");
  }
  return [...new Set(value as string[])];
}

function parseJwksFingerprints(body: Buffer): string[] {
  const document = parseJsonObject(body);
  const keys = document.keys;
  if (
    !Array.isArray(keys) ||
    keys.length === 0 ||
    keys.length > MAX_JSON_KEYS
  ) {
    throw new FederationValidationError("federation_signing_key_invalid");
  }
  const fingerprints: string[] = [];
  for (const candidate of keys) {
    if (!isRecord(candidate)) {
      throw new FederationValidationError("federation_signing_key_invalid");
    }
    if (
      ["d", "p", "q", "dp", "dq", "qi", "oth", "k"].some((name) =>
        Object.hasOwn(candidate, name),
      )
    ) {
      throw new FederationValidationError("federation_signing_key_invalid");
    }
    if (candidate.use !== undefined && candidate.use !== "sig") continue;
    if (
      candidate.key_ops !== undefined &&
      (!Array.isArray(candidate.key_ops) ||
        !candidate.key_ops.every(
          (operation) => typeof operation === "string",
        ) ||
        !candidate.key_ops.includes("verify"))
    ) {
      continue;
    }
    if (candidate.alg === "none") continue;
    const canonical = canonicalJwk(candidate);
    if (canonical !== null) {
      assertStrongSigningPublicKey(canonical);
      fingerprints.push(sha256(Buffer.from(canonical)));
    }
  }
  const unique = [...new Set(fingerprints)].sort();
  if (unique.length === 0 || unique.length > MAX_SIGNING_KEYS) {
    throw new FederationValidationError("federation_signing_key_invalid");
  }
  return unique;
}

function canonicalJwk(key: Record<string, unknown>): string | null {
  const kty = key.kty;
  if (kty === "RSA") {
    const e = base64UrlMember(key, "e");
    const n = base64UrlMember(key, "n");
    return JSON.stringify({ e, kty, n });
  }
  if (kty === "EC") {
    const crv = safeJwkMember(key, "crv");
    const x = base64UrlMember(key, "x");
    const y = base64UrlMember(key, "y");
    return JSON.stringify({ crv, kty, x, y });
  }
  if (kty === "OKP") {
    const crv = safeJwkMember(key, "crv");
    const x = base64UrlMember(key, "x");
    return JSON.stringify({ crv, kty, x });
  }
  return null;
}

function assertStrongSigningPublicKey(canonicalJwkValue: string): void {
  try {
    const publicKey = createPublicKey({
      key: JSON.parse(canonicalJwkValue) as CryptoJsonWebKey,
      format: "jwk",
    });
    const details = publicKey.asymmetricKeyDetails;
    if (
      (publicKey.asymmetricKeyType === "rsa" &&
        (details?.modulusLength ?? 0) >= 2_048) ||
      (publicKey.asymmetricKeyType === "ec" &&
        ["prime256v1", "secp384r1", "secp521r1"].includes(
          details?.namedCurve ?? "",
        )) ||
      publicKey.asymmetricKeyType === "ed25519" ||
      publicKey.asymmetricKeyType === "ed448"
    ) {
      return;
    }
  } catch {
    // The stable error code below deliberately omits parser or key material.
  }
  throw new FederationValidationError("federation_signing_key_invalid");
}

function safeJwkMember(key: Record<string, unknown>, name: string): string {
  const value = key[name];
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 512 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new FederationValidationError("federation_signing_key_invalid");
  }
  return value;
}

function base64UrlMember(key: Record<string, unknown>, name: string): string {
  const value = safeJwkMember(key, name);
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new FederationValidationError("federation_signing_key_invalid");
  }
  return value;
}

function samlCertificateFingerprints(
  descriptor: Record<string, unknown>,
  now: Date,
): string[] {
  const fingerprints: string[] = [];
  let parsedCertificates = 0;
  for (const keyDescriptor of asRecords(descriptor.KeyDescriptor)) {
    const use = safeXmlString(keyDescriptor["@_use"]);
    if (use !== null && use !== "signing") continue;
    for (const certificateValue of collectNamedValues(
      keyDescriptor,
      "X509Certificate",
      MAX_SIGNING_KEYS,
    )) {
      const encoded = safeXmlString(certificateValue)?.replace(/\s+/gu, "");
      if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded)) {
        throw new FederationValidationError("federation_signing_key_invalid");
      }
      let certificate: X509Certificate;
      try {
        const der = Buffer.from(encoded, "base64");
        if (
          der.length < 256 ||
          der.length > 16 * 1024 ||
          der.toString("base64").replace(/=+$/u, "") !==
            encoded.replace(/=+$/u, "")
        ) {
          throw new Error("invalid certificate encoding");
        }
        certificate = new X509Certificate(der);
        assertStrongCertificatePublicKey(certificate);
      } catch {
        throw new FederationValidationError("federation_signing_key_invalid");
      }
      const validFrom = Date.parse(certificate.validFrom);
      const validTo = Date.parse(certificate.validTo);
      parsedCertificates += 1;
      if (!Number.isFinite(validFrom) || !Number.isFinite(validTo)) {
        throw new FederationValidationError("federation_signing_key_invalid");
      }
      if (now.getTime() < validFrom || now.getTime() > validTo) continue;
      fingerprints.push(sha256(certificate.raw));
    }
  }
  const unique = [...new Set(fingerprints)].sort();
  if (unique.length === 0 && parsedCertificates > 0) {
    throw new FederationValidationError("federation_certificate_expired");
  }
  if (unique.length === 0 || unique.length > MAX_SIGNING_KEYS) {
    throw new FederationValidationError("federation_signing_key_invalid");
  }
  return unique;
}

function assertStrongCertificatePublicKey(certificate: X509Certificate): void {
  const publicKey = certificate.publicKey;
  const details = publicKey.asymmetricKeyDetails;
  if (
    (publicKey.asymmetricKeyType === "rsa" &&
      (details?.modulusLength ?? 0) >= 2_048) ||
    (publicKey.asymmetricKeyType === "ec" &&
      ["prime256v1", "secp384r1", "secp521r1"].includes(
        details?.namedCurve ?? "",
      )) ||
    publicKey.asymmetricKeyType === "ed25519" ||
    publicKey.asymmetricKeyType === "ed448"
  ) {
    return;
  }
  throw new FederationValidationError("federation_signing_key_invalid");
}

function collectNamedRecords(
  value: unknown,
  name: string,
  limit: number,
): Record<string, unknown>[] {
  return collectNamedValues(value, name, limit).filter(isRecord);
}

function collectNamedValues(
  value: unknown,
  name: string,
  limit: number,
): unknown[] {
  const found: unknown[] = [];
  const stack: unknown[] = [value];
  let visited = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    visited += 1;
    if (visited > 5_000) {
      throw new FederationValidationError("federation_document_invalid");
    }
    if (Array.isArray(current)) {
      stack.push(...current);
      continue;
    }
    if (!isRecord(current)) continue;
    for (const [key, child] of Object.entries(current)) {
      if (key === name) {
        const values = Array.isArray(child) ? child : [child];
        found.push(...values);
        if (found.length > limit) {
          throw new FederationValidationError("federation_document_invalid");
        }
      }
      if (!key.startsWith("@_") && key !== "#text") stack.push(child);
    }
  }
  return found;
}

function asRecords(value: unknown): Record<string, unknown>[] {
  return (Array.isArray(value) ? value : [value]).filter(isRecord);
}

function safeXmlString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > 16 * 1024 ||
    /[\u0000-\u001f\u007f]/u.test(trimmed)
  ) {
    return null;
  }
  return trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function decodeUtf8(value: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(value);
  } catch {
    throw new FederationValidationError("federation_document_invalid");
  }
}
