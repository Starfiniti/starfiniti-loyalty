import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contractPath = join(
  root,
  "infrastructure/environments/proxmox/supabase-compatibility.json",
);
const historicalEvidencePath = join(
  root,
  "docs/plan/evidence/M01/supabase-compatibility-2026-08-28.json",
);
const evidencePath = join(
  root,
  "docs/plan/evidence/M01/supabase-compatibility-2026-09-01.json",
);
const historicalEvidenceSha256 =
  "aa860ff696ea0ebfd6b1bb36b879e282cba706110498d5990d2f6c67fab4d052";
const migrationsPath = join(root, "supabase/migrations");
const sha256Pattern = /^[0-9a-f]{64}$/u;
const commitPattern = /^[0-9a-f]{40}$/u;
const requiredServiceNames = [
  "studio",
  "envoy",
  "auth",
  "rest",
  "realtime",
  "storage",
  "imgproxy",
  "meta",
  "functions",
  "db",
  "supavisor",
];
const forbiddenDefaultServiceNames = ["kong", "analytics", "vector"];
const requiredComposeMappingContract = {
  "auth.API_EXTERNAL_URL": "${API_EXTERNAL_URL}",
  "auth.GOTRUE_JWT_ISSUER": "${API_EXTERNAL_URL}",
  "rest.PGRST_DB_SCHEMAS": "${PGRST_DB_SCHEMAS}",
  "meta.PG_META_DB_USER": "postgres",
};
const asymmetricJwksMappingContract = {
  "auth.GOTRUE_JWT_KEYS": "${JWT_KEYS:-[]}",
  "rest.API_JWT_JWKS": '${JWT_JWKS:-{"keys":[]}}',
  "realtime.JWT_JWKS": '${JWT_JWKS:-{"keys":[]}}',
  "storage.SUPABASE_JWKS": '${JWT_JWKS:-{"keys":[]}}',
};
const historicalExpectedEvidenceChecks = new Map([
  ["release_provenance", "passed"],
  ["compose_official_source", "passed"],
  ["compose_variant", "passed"],
  ["image_inventory", "passed"],
  ["envoy_gateway", "passed"],
  ["auth_external_path", "passed"],
  ["postgrest_schema", "passed"],
  ["postgres_major", "passed"],
  ["postgres_meta_owner", "passed"],
  ["optional_services", "passed"],
  ["studio_runtime_schema_parity", "pending"],
  ["upgrade_rehearsal", "pending"],
  ["clean_room_restore", "pending"],
]);
const currentExpectedEvidenceChecks = new Map([
  ...historicalExpectedEvidenceChecks,
  ["studio_runtime_schema_parity", "passed"],
]);

function fail(message) {
  throw new Error(`Supabase compatibility failed: ${message}`);
}

function sha256(source) {
  return createHash("sha256").update(source).digest("hex");
}

function parseJson(source, label) {
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch {
    fail(`${label} is not valid JSON`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail(`${label} must be a JSON object`);
  }
  return parsed;
}

function assertExactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, i) => key !== wanted[i])
  ) {
    fail(`${label} has unreviewed fields`);
  }
}

function assertExactStringMap(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  assertExactKeys(value, Object.keys(expected), label);
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (value[key] !== expectedValue) fail(`${label} has incompatible values`);
  }
}

function validateContract(contract) {
  assertExactKeys(
    contract,
    [
      "schemaVersion",
      "reviewedAt",
      "upstream",
      "approvedComposeVariants",
      "requiredServices",
      "forbiddenDefaultServices",
      "serviceImages",
      "platformImageDigests",
      "database",
      "environment",
      "requiredComposeMappings",
      "asymmetricJwksMappings",
      "criticalAssets",
      "sealedAssetDirectories",
      "mutableBindDirectories",
    ],
    "compatibility contract",
  );
  if (contract.schemaVersion !== "starfiniti.supabase-compatibility.v1") {
    fail("compatibility contract schema is unsupported");
  }
  assertExactKeys(
    contract.upstream,
    [
      "repository",
      "releaseRef",
      "tagObjectSha",
      "commitSha",
      "officialComposeSha256",
    ],
    "upstream contract",
  );
  if (
    contract.upstream.repository !== "supabase/supabase" ||
    !/^self-hosted\/v[0-9]+\.[0-9]+\.[0-9]+$/u.test(
      contract.upstream.releaseRef,
    ) ||
    !commitPattern.test(contract.upstream.tagObjectSha) ||
    !commitPattern.test(contract.upstream.commitSha) ||
    !sha256Pattern.test(contract.upstream.officialComposeSha256)
  ) {
    fail("upstream provenance is invalid");
  }
  if (
    !Array.isArray(contract.approvedComposeVariants) ||
    contract.approvedComposeVariants.length < 1
  ) {
    fail("at least one approved Compose variant is required");
  }
  const variantIds = new Set();
  const variantHashes = new Set();
  for (const variant of contract.approvedComposeVariants) {
    assertExactKeys(
      variant,
      ["id", "sha256", "asymmetricJwksRequired"],
      "Compose variant",
    );
    if (
      !/^[a-z][a-z0-9-]{1,63}$/u.test(variant.id) ||
      !sha256Pattern.test(variant.sha256) ||
      typeof variant.asymmetricJwksRequired !== "boolean" ||
      variantIds.has(variant.id) ||
      variantHashes.has(variant.sha256)
    ) {
      fail("Compose variants must have unique reviewed IDs and hashes");
    }
    variantIds.add(variant.id);
    variantHashes.add(variant.sha256);
  }
  if (!variantHashes.has(contract.upstream.officialComposeSha256)) {
    fail("official Compose digest must be an approved variant");
  }
  if (
    !Array.isArray(contract.requiredServices) ||
    contract.requiredServices.length < 1 ||
    new Set(contract.requiredServices).size !==
      contract.requiredServices.length ||
    !Array.isArray(contract.forbiddenDefaultServices) ||
    new Set(contract.forbiddenDefaultServices).size !==
      contract.forbiddenDefaultServices.length
  ) {
    fail("service allowlists must be non-empty and unique");
  }
  if (
    JSON.stringify(contract.requiredServices) !==
      JSON.stringify(requiredServiceNames) ||
    JSON.stringify(contract.forbiddenDefaultServices) !==
      JSON.stringify(forbiddenDefaultServiceNames)
  ) {
    fail("service allowlists have drifted from the V1 contract");
  }
  for (const name of [
    ...contract.requiredServices,
    ...contract.forbiddenDefaultServices,
  ]) {
    if (!/^[a-z][a-z0-9-]{1,63}$/u.test(name)) {
      fail("service allowlists contain an invalid name");
    }
  }
  if (
    contract.requiredServices.some((name) =>
      contract.forbiddenDefaultServices.includes(name),
    )
  ) {
    fail("required and forbidden services overlap");
  }
  assertExactKeys(
    contract.serviceImages,
    contract.requiredServices,
    "service image contract",
  );
  for (const image of Object.values(contract.serviceImages)) {
    if (
      typeof image !== "string" ||
      !/^[a-z0-9.-]+(?:\/[a-z0-9._-]+)+:[A-Za-z0-9._-]+$/u.test(image) ||
      image.endsWith(":latest")
    ) {
      fail("service images must use reviewed non-latest tags");
    }
  }
  if (
    !contract.platformImageDigests ||
    typeof contract.platformImageDigests !== "object" ||
    Array.isArray(contract.platformImageDigests) ||
    Object.keys(contract.platformImageDigests).length < 1
  ) {
    fail("platform image digest contract is empty");
  }
  for (const [platform, images] of Object.entries(
    contract.platformImageDigests,
  )) {
    if (!/^linux\/(?:amd64|arm64)$/u.test(platform)) {
      fail("platform image digest contract has an unsupported platform");
    }
    assertExactKeys(
      images,
      contract.requiredServices,
      `platform image digest contract ${platform}`,
    );
    for (const digest of Object.values(images)) {
      if (!/^sha256:[0-9a-f]{64}$/u.test(digest)) {
        fail("platform image digest is invalid");
      }
    }
  }
  assertExactKeys(
    contract.database,
    ["postgresMajor", "postgresMetaUser"],
    "database contract",
  );
  if (
    !Number.isSafeInteger(contract.database.postgresMajor) ||
    contract.database.postgresMajor < 1 ||
    contract.database.postgresMetaUser !== "postgres"
  ) {
    fail("database compatibility contract is invalid");
  }
  assertExactKeys(
    contract.environment,
    ["apiExternalPath", "postgrestSchemas"],
    "environment contract",
  );
  if (
    contract.environment.apiExternalPath !== "/auth/v1" ||
    contract.environment.postgrestSchemas !== "public,graphql_public,loyalty"
  ) {
    fail("environment compatibility contract is invalid");
  }
  assertExactStringMap(
    contract.requiredComposeMappings,
    requiredComposeMappingContract,
    "required Compose mapping contract",
  );
  assertExactStringMap(
    contract.asymmetricJwksMappings,
    asymmetricJwksMappingContract,
    "asymmetric JWKS mapping contract",
  );
  if (
    !contract.criticalAssets ||
    typeof contract.criticalAssets !== "object" ||
    Array.isArray(contract.criticalAssets) ||
    Object.keys(contract.criticalAssets).length !== 15
  ) {
    fail("critical asset contract must contain the exact V1 asset count");
  }
  for (const [path, digest] of Object.entries(contract.criticalAssets)) {
    validateRelativeAssetPath(path, "critical asset");
    if (!sha256Pattern.test(digest)) {
      fail("critical asset digest is invalid");
    }
  }
  for (const [label, directories] of [
    ["sealed asset directories", contract.sealedAssetDirectories],
    ["mutable bind directories", contract.mutableBindDirectories],
  ]) {
    if (
      !Array.isArray(directories) ||
      directories.length < 1 ||
      new Set(directories).size !== directories.length
    ) {
      fail(`${label} must be non-empty and unique`);
    }
    for (const directory of directories) {
      validateRelativeAssetPath(directory, label);
    }
  }
  if (
    JSON.stringify(contract.sealedAssetDirectories) !==
      JSON.stringify(["volumes/functions", "volumes/snippets"]) ||
    JSON.stringify(contract.mutableBindDirectories) !==
      JSON.stringify(["volumes/storage", "volumes/db/data"])
  ) {
    fail("sealed or mutable directory contracts have drifted");
  }
  if (
    contract.sealedAssetDirectories.some((directory) =>
      contract.mutableBindDirectories.includes(directory),
    )
  ) {
    fail("sealed and mutable bind directories overlap");
  }
  for (const directory of contract.sealedAssetDirectories) {
    if (
      !Object.keys(contract.criticalAssets).some((path) =>
        path.startsWith(`${directory}/`),
      )
    ) {
      fail(`sealed asset directory ${directory} has no locked files`);
    }
  }
  return contract;
}

function validateRelativeAssetPath(path, label) {
  if (
    typeof path !== "string" ||
    path.length < 1 ||
    path.includes("\\") ||
    isAbsolute(path) ||
    path.startsWith("./") ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    fail(`${label} contains an unsafe path`);
  }
}

function assetManifestSha256(criticalAssets) {
  return sha256(
    Object.entries(criticalAssets)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, digest]) => `${path}\0${digest}\n`)
      .join(""),
  );
}

function validateAssetSources(assetSources, contract) {
  if (
    !assetSources ||
    typeof assetSources !== "object" ||
    Array.isArray(assetSources)
  ) {
    fail("critical asset sources are missing");
  }
  assertExactKeys(
    assetSources,
    Object.keys(contract.criticalAssets),
    "critical asset source set",
  );
  for (const [path, expected] of Object.entries(contract.criticalAssets)) {
    if (sha256(assetSources[path]) !== expected) {
      fail(`critical asset ${path} has drifted`);
    }
  }
  return assetManifestSha256(contract.criticalAssets);
}

function enumerateRegularFiles(directory, rootDirectory, output) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    fail("sealed asset directory is unreadable");
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink())
      fail("sealed asset directory contains a symlink");
    if (entry.isDirectory()) {
      enumerateRegularFiles(path, rootDirectory, output);
      continue;
    }
    if (!entry.isFile()) fail("sealed asset directory contains a special file");
    output.add(relative(rootDirectory, path).split(sep).join("/"));
  }
}

function readBoundFile(
  path,
  label,
  { ownerOnly = false, maxBytes = 1024 * 1024, encoding } = {},
) {
  const noFollow =
    process.platform !== "win32" && constants.O_NOFOLLOW
      ? constants.O_NOFOLLOW
      : 0;
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | noFollow);
  } catch {
    fail(`${label} is unreadable`);
  }
  try {
    const before = fstatSync(descriptor);
    if (!before.isFile()) fail(`${label} must be a regular file`);
    if (before.size > maxBytes)
      fail(`${label} exceeds the reviewed size boundary`);
    if (process.platform !== "win32") {
      if (realpathSync(path) !== resolve(path)) {
        fail(`${label} must not traverse a symlink`);
      }
      if ((before.mode & 0o002) !== 0) {
        fail(`${label} must not be writable by other users`);
      }
      if (ownerOnly && (before.mode & 0o077) !== 0) {
        fail(`${label} must be owner-only`);
      }
      if (ownerOnly && before.uid !== process.getuid()) {
        fail(`${label} must be owned by the invoking operator`);
      }
    }
    const source = encoding
      ? readFileSync(descriptor, encoding)
      : readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs
    ) {
      fail(`${label} changed while it was being read`);
    }
    return source;
  } finally {
    closeSync(descriptor);
  }
}

function loadCriticalAssetSources(bundleRoot, contract) {
  let rootStatus;
  try {
    rootStatus = lstatSync(bundleRoot);
  } catch {
    fail("bundle root is unreadable");
  }
  if (!rootStatus.isDirectory() || rootStatus.isSymbolicLink()) {
    fail("bundle root must be a non-symlink directory");
  }
  if (
    process.platform !== "win32" &&
    realpathSync(bundleRoot) !== resolve(bundleRoot)
  ) {
    fail("bundle root must not traverse a symlink");
  }
  if (process.platform !== "win32" && (rootStatus.mode & 0o002) !== 0) {
    fail("bundle root must not be writable by other users");
  }
  const sealedFiles = new Set();
  for (const directory of contract.sealedAssetDirectories) {
    enumerateRegularFiles(join(bundleRoot, directory), bundleRoot, sealedFiles);
  }
  const expectedSealedFiles = new Set(
    Object.keys(contract.criticalAssets).filter((path) =>
      contract.sealedAssetDirectories.some((directory) =>
        path.startsWith(`${directory}/`),
      ),
    ),
  );
  if (
    sealedFiles.size !== expectedSealedFiles.size ||
    [...sealedFiles].some((path) => !expectedSealedFiles.has(path))
  ) {
    fail("sealed asset directory contents have drifted");
  }
  const sources = {};
  for (const path of Object.keys(contract.criticalAssets)) {
    const absolutePath = join(bundleRoot, path);
    sources[path] = readBoundFile(absolutePath, `critical asset ${path}`, {
      maxBytes: 4 * 1024 * 1024,
    });
  }
  return sources;
}

function readDeploymentFile(
  path,
  label,
  { ownerOnly = false, maxBytes = 1024 * 1024 } = {},
) {
  return readBoundFile(path, label, { ownerOnly, maxBytes, encoding: "utf8" });
}

function validateLocalImages(platform, contract) {
  const expected = contract.platformImageDigests[platform];
  if (!expected) fail(`platform ${platform} has no reviewed image digest set`);
  for (const service of contract.requiredServices) {
    const inspection = spawnSync(
      "docker",
      [
        "image",
        "inspect",
        contract.serviceImages[service],
        "--format",
        "{{.Id}}",
      ],
      {
        encoding: "utf8",
        windowsHide: true,
        timeout: 15_000,
        maxBuffer: 1024 * 1024,
      },
    );
    const actual = inspection.stdout?.trim();
    if (inspection.status !== 0 || !/^sha256:[0-9a-f]{64}$/u.test(actual)) {
      fail(`reviewed local image for ${service} is unavailable`);
    }
    if (actual !== expected[service]) {
      fail(`local image digest for ${service} has drifted`);
    }
  }
  return contract.requiredServices.length;
}

function parseEnvironment(source) {
  const values = {};
  for (const [index, rawLine] of source.split(/\r?\n/u).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) fail(`environment line ${index + 1} is invalid`);
    const name = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (!/^[A-Z][A-Z0-9_]*$/u.test(name)) {
      fail(`environment line ${index + 1} has an invalid name`);
    }
    if (Object.hasOwn(values, name)) {
      fail(`${name} is declared more than once`);
    }
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values[name] = value;
  }
  return values;
}

function requireCanonicalHttpsOrigin(environment, name) {
  const value = environment[name];
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${name} must be a canonical HTTPS origin`);
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    parsed.origin !== value
  ) {
    fail(`${name} must be a canonical HTTPS origin`);
  }
}

function requireCanonicalAuthUrl(environment, expectedPath) {
  const value = environment.API_EXTERNAL_URL;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail("API_EXTERNAL_URL must be canonical HTTPS with /auth/v1");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== expectedPath ||
    parsed.search ||
    parsed.hash ||
    `${parsed.origin}${parsed.pathname}` !== value
  ) {
    fail("API_EXTERNAL_URL must be canonical HTTPS with /auth/v1");
  }
}

function parseNonEmptyJson(value, label, shape) {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    fail(`${label} must be valid non-empty JSON`);
  }
  const items = shape === "array" ? parsed : parsed?.keys;
  if (!Array.isArray(items) || items.length < 1) {
    fail(`${label} must be valid non-empty JSON`);
  }
  if (
    items.some(
      (item) =>
        !item ||
        typeof item !== "object" ||
        Array.isArray(item) ||
        typeof item.kid !== "string" ||
        item.kid.length < 1 ||
        item.kid.length > 256,
    )
  ) {
    fail(`${label} must contain identified key objects`);
  }
  const keyIds = items.map((item) => item.kid);
  if (new Set(keyIds).size !== keyIds.length) {
    fail(`${label} key identifiers must be unique`);
  }
}

function serviceEnvironment(service) {
  const source = service?.environment;
  if (!source) return {};
  if (!Array.isArray(source)) return source;
  const result = {};
  for (const entry of source) {
    if (typeof entry !== "string") fail("Compose environment entry is invalid");
    const separator = entry.indexOf("=");
    if (separator < 1) fail("Compose environment entry is invalid");
    result[entry.slice(0, separator)] = entry.slice(separator + 1);
  }
  return result;
}

function readComposeMapping(services, selector) {
  const [serviceName, variable] = selector.split(".");
  return serviceEnvironment(services[serviceName])?.[variable];
}

function validateLocalBindCoverage(services, contract) {
  const approvedSources = new Set([
    ...Object.keys(contract.criticalAssets),
    ...contract.sealedAssetDirectories,
    ...contract.mutableBindDirectories,
  ]);
  let localBindCount = 0;
  for (const service of Object.values(services)) {
    for (const volume of service?.volumes ?? []) {
      const source =
        typeof volume === "string"
          ? volume.split(":", 1)[0]
          : volume && typeof volume === "object"
            ? volume.source
            : undefined;
      if (typeof source !== "string" || !source.startsWith("./")) continue;
      const relativeSource = source.slice(2).replaceAll("\\", "/");
      validateRelativeAssetPath(relativeSource, "Compose local bind");
      if (!approvedSources.has(relativeSource)) {
        fail(`Compose local bind ${relativeSource} is not reviewed`);
      }
      localBindCount += 1;
    }
  }
  if (localBindCount < 1) fail("Compose has no reviewed local bind mounts");
}

function validateVersionSources(versionSource, provenanceSource, contract) {
  const versionLines = versionSource
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  if (
    versionLines.length !== 1 ||
    versionLines[0] !== `ref=${contract.upstream.releaseRef}`
  ) {
    fail("upstream version file does not select the approved release");
  }
  const provenanceTokens = provenanceSource.trim().split(/\s+/u);
  if (
    provenanceTokens.length !== 2 ||
    provenanceTokens[0] !== contract.upstream.releaseRef ||
    provenanceTokens[1] !== contract.upstream.tagObjectSha
  ) {
    fail("provenance file does not bind the approved release and tag object");
  }
}

export function validateDeploymentSources({
  composeSource,
  environmentSource,
  versionSource,
  provenanceSource,
  assetSources,
  contract,
}) {
  validateContract(contract);
  validateVersionSources(versionSource, provenanceSource, contract);
  const criticalAssetManifestSha256 = validateAssetSources(
    assetSources,
    contract,
  );
  const composeDigest = sha256(composeSource);
  const variant = contract.approvedComposeVariants.find(
    (candidate) => candidate.sha256 === composeDigest,
  );
  if (!variant) fail("Compose bytes are not an approved exact variant");

  let compose;
  try {
    compose = YAML.parse(composeSource);
  } catch {
    fail("Compose file is not valid YAML");
  }
  if (!compose?.services || typeof compose.services !== "object") {
    fail("Compose file has no service map");
  }
  const services = compose.services;
  validateLocalBindCoverage(services, contract);
  for (const name of contract.requiredServices) {
    if (!services[name]) fail(`required Compose service ${name} is missing`);
    if (services[name].image !== contract.serviceImages[name]) {
      fail(`Compose service ${name} does not use the reviewed image`);
    }
  }
  for (const name of contract.forbiddenDefaultServices) {
    if (services[name])
      fail(`forbidden default Compose service ${name} is present`);
  }
  for (const [selector, expected] of Object.entries(
    contract.requiredComposeMappings,
  )) {
    if (readComposeMapping(services, selector) !== expected) {
      fail(`Compose mapping ${selector} is incompatible`);
    }
  }
  const dbVersion = contract.serviceImages.db.match(
    /supabase\/postgres:([0-9]+)\./u,
  );
  if (Number(dbVersion?.[1]) !== contract.database.postgresMajor) {
    fail("reviewed database image and PostgreSQL major disagree");
  }
  if (services.db.network_mode === "host") {
    fail("database service must not use host networking");
  }
  if (variant.asymmetricJwksRequired) {
    for (const [selector, expected] of Object.entries(
      contract.asymmetricJwksMappings,
    )) {
      if (readComposeMapping(services, selector) !== expected) {
        fail(`asymmetric JWKS mapping ${selector} is missing`);
      }
    }
  }

  const environment = parseEnvironment(environmentSource);
  requireCanonicalAuthUrl(environment, contract.environment.apiExternalPath);
  requireCanonicalHttpsOrigin(environment, "SUPABASE_PUBLIC_URL");
  requireCanonicalHttpsOrigin(environment, "SITE_URL");
  if (environment.PGRST_DB_SCHEMAS !== contract.environment.postgrestSchemas) {
    fail("PGRST_DB_SCHEMAS is not the reviewed exact schema allowlist");
  }
  if (variant.asymmetricJwksRequired) {
    parseNonEmptyJson(environment.JWT_KEYS, "JWT_KEYS", "array");
    parseNonEmptyJson(environment.JWT_JWKS, "JWT_JWKS", "jwks");
  }
  return {
    variantId: variant.id,
    composeSha256: composeDigest,
    serviceCount: contract.requiredServices.length,
    postgresMajor: contract.database.postgresMajor,
    criticalAssetManifestSha256,
  };
}

function stripSqlComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//gu, " ").replace(/--[^\n]*/gu, " ");
}

function validateMigrationSource(source, migrationFiles) {
  const cleanSource = stripSqlComments(source);
  const forbidden = [
    {
      pattern: /\bcreate\s+extension\b[^;]*\bversion\b/iu,
      message: "extension version pins are unsupported",
    },
    {
      pattern: /\balter\s+extension\b[^;]*\bupdate\s+to\b/iu,
      message: "extension update version pins are unsupported",
    },
    {
      pattern: /\blogs\s*\.\s*all\b/iu,
      message: "removed Management API logs.all is referenced",
    },
    {
      pattern:
        /\b(?:create|alter|drop)\s+(?:table|schema|function|view|materialized\s+view|type|policy|trigger|index)\s+(?:if\s+(?:not\s+)?exists\s+)?(?:only\s+)?realtime(?:\.|\b)/iu,
      message: "Supabase-owned realtime schema is mutated",
    },
    {
      pattern: /\b(?:grant|revoke)\b[^;]*\bon\b[^;]*\brealtime(?:\.|\b)/iu,
      message: "Supabase-owned realtime schema privileges are mutated",
    },
    {
      pattern: /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?public\./iu,
      message: "Starfiniti tables must not be created in public",
    },
  ];
  for (const rule of forbidden) {
    if (rule.pattern.test(cleanSource)) fail(rule.message);
  }

  const tenantTables = new Set(
    [
      ...cleanSource.matchAll(
        /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?((?:loyalty|loyalty_private)\.[a-z0-9_]+)/giu,
      ),
    ].map((match) => match[1].toLowerCase()),
  );
  for (const table of tenantTables) {
    const escaped = table.replaceAll(".", "\\.");
    const rlsPattern = new RegExp(
      `\\balter\\s+table\\s+(?:only\\s+)?${escaped}\\s+enable\\s+row\\s+level\\s+security\\b`,
      "iu",
    );
    if (!rlsPattern.test(cleanSource)) {
      fail(`tenant table ${table} does not enable RLS`);
    }
  }
  return { migrationFiles, tenantTables: tenantTables.size };
}

export function validateMigrationCompatibility(directory) {
  const files = readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  if (files.length < 1) fail("no SQL migrations were found");
  return validateMigrationSource(
    files.map((name) => readFileSync(join(directory, name), "utf8")).join("\n"),
    files.length,
  );
}

function exactEvidenceTimestamp(value, label, minimum) {
  const instant = Date.parse(value);
  if (
    typeof value !== "string" ||
    !value.endsWith("Z") ||
    !Number.isFinite(instant) ||
    instant > Date.now() + 5 * 60_000 ||
    instant < Date.parse(minimum)
  ) {
    fail(`${label} timestamp is invalid`);
  }
  return instant;
}

function validateProductionEvidence(
  evidence,
  contract,
  contractDigest,
  { historical = false, previousEvidenceDigest = null } = {},
) {
  const expectedTopLevelKeys = [
    "schemaVersion",
    "observedAt",
    "environment",
    "vmId",
    "compatibilityStatus",
    "compatibilityContractSha256",
    "upstream",
    "compose",
    "runtime",
    "imageInventory",
    "checks",
    "limitations",
  ];
  if (historical) {
    expectedTopLevelKeys.push("productionChanged");
  } else {
    expectedTopLevelKeys.push(
      "previousEvidence",
      "studioRecreation",
      "protectedState",
      "productionChange",
    );
  }
  assertExactKeys(
    evidence,
    expectedTopLevelKeys,
    "Supabase production evidence",
  );
  const correctIdentity = historical
    ? evidence.schemaVersion === "starfiniti.supabase-production-baseline.v1" &&
      evidence.compatibilityStatus ===
        "repository_and_files_compatible_runtime_follow_up_required" &&
      evidence.productionChanged === false
    : evidence.schemaVersion === "starfiniti.supabase-production-baseline.v2" &&
      evidence.compatibilityStatus ===
        "repository_files_and_runtime_compatible_upgrade_and_restore_pending";
  if (
    !correctIdentity ||
    evidence.environment !== "production" ||
    evidence.vmId !== 971 ||
    evidence.compatibilityContractSha256 !== contractDigest
  ) {
    fail("Supabase production evidence authority or status is invalid");
  }
  const observedAt = exactEvidenceTimestamp(
    evidence.observedAt,
    "Supabase production evidence",
    historical ? "2026-08-28T00:00:00Z" : "2026-09-01T00:00:00Z",
  );
  assert.deepEqual(
    evidence.upstream,
    {
      releaseRef: contract.upstream.releaseRef,
      tagObjectSha: contract.upstream.tagObjectSha,
      commitSha: contract.upstream.commitSha,
    },
    "production evidence must bind exact upstream provenance",
  );
  const variant = contract.approvedComposeVariants.find(
    (candidate) => candidate.id === evidence.compose.variantId,
  );
  assertExactKeys(
    evidence.compose,
    [
      "variantId",
      "sha256",
      "officialSha256",
      "criticalAssetManifestSha256",
      "reviewedDifference",
    ],
    "production Compose evidence",
  );
  if (!variant || evidence.compose.sha256 !== variant.sha256) {
    fail("production Compose evidence is not an approved reviewed variant");
  }
  if (
    evidence.compose.officialSha256 !== contract.upstream.officialComposeSha256
  ) {
    fail("production evidence does not bind the official Compose digest");
  }
  if (
    evidence.compose.criticalAssetManifestSha256 !==
    assetManifestSha256(contract.criticalAssets)
  ) {
    fail("production evidence does not bind the critical asset manifest");
  }
  if (
    evidence.compose.reviewedDifference !==
    "four asymmetric-JWKS mappings enabled"
  ) {
    fail("production Compose difference is not the reviewed JWKS variant");
  }
  assert.deepEqual(
    evidence.runtime,
    {
      platform: "linux/amd64",
      gateway: "envoy",
      postgresMajor: contract.database.postgresMajor,
      postgresMetaUser: contract.database.postgresMetaUser,
      apiExternalPath: contract.environment.apiExternalPath,
      postgrestSchemas: contract.environment.postgrestSchemas,
      kongPresent: false,
      analyticsPresent: false,
      vectorPresent: false,
      asymmetricJwtPrivateKeyCount: 2,
      asymmetricJwksPublicKeyCount: 2,
      studioPostgrestSchemaParity: !historical,
    },
    "production runtime evidence has drifted",
  );
  if (
    !Array.isArray(evidence.imageInventory) ||
    evidence.imageInventory.length !== contract.requiredServices.length
  ) {
    fail("production image inventory is incomplete");
  }
  const inventoryByService = new Map();
  for (const entry of evidence.imageInventory) {
    assertExactKeys(
      entry,
      historical
        ? ["service", "configuredImage", "resolvedDigest", "healthy"]
        : [
            "service",
            "configuredImage",
            "resolvedDigest",
            "healthy",
            "restartCount",
            "startedAt",
          ],
      "runtime image entry",
    );
    if (
      inventoryByService.has(entry.service) ||
      entry.configuredImage !== contract.serviceImages[entry.service] ||
      entry.resolvedDigest !==
        contract.platformImageDigests[evidence.runtime.platform]?.[
          entry.service
        ] ||
      entry.healthy !== true
    ) {
      fail("production image inventory contains invalid or duplicate evidence");
    }
    if (!historical) {
      if (entry.restartCount !== 0) {
        fail("a production service restarted after the bounded correction");
      }
      exactEvidenceTimestamp(
        entry.startedAt,
        `${entry.service} runtime start`,
        "2026-08-01T00:00:00Z",
      );
    }
    inventoryByService.set(entry.service, entry);
  }
  for (const service of contract.requiredServices) {
    if (!inventoryByService.has(service)) {
      fail(`production image inventory is missing ${service}`);
    }
  }
  if (!historical) {
    assert.deepEqual(
      evidence.previousEvidence,
      {
        path: "docs/plan/evidence/M01/supabase-compatibility-2026-08-28.json",
        sha256: previousEvidenceDigest,
      },
      "current evidence must preserve the exact historical baseline",
    );
    assertExactKeys(
      evidence.studioRecreation,
      [
        "approvedBy",
        "scope",
        "startedAt",
        "verifiedAt",
        "dryRunVerified",
        "noDependencies",
        "noBuild",
        "pullPolicy",
        "previousComposeConfigHash",
        "currentComposeConfigHash",
        "imageId",
        "health",
        "internalProfileStatus",
        "publicProfileStatus",
        "restartCount",
        "previousSchemas",
        "currentSchemas",
        "rollbackEnvironmentSha256",
        "rollbackEnvironmentMode",
        "rollbackDiffersOnlyBySchema",
        "postChangeBackupCompletedAt",
        "postChangeBackupResult",
        "postChangeBackupExitStatus",
        "publicHealthStatus",
        "publicLoginStatus",
        "authAnonymousStatus",
        "dataApiAnonymousStatus",
        "requiredServiceCount",
        "healthyServiceCount",
        "unchangedServiceCount",
      ],
      "Studio recreation evidence",
    );
    const recreation = evidence.studioRecreation;
    const startedAt = exactEvidenceTimestamp(
      recreation.startedAt,
      "Studio recreation start",
      "2026-09-01T00:00:00Z",
    );
    const verifiedAt = exactEvidenceTimestamp(
      recreation.verifiedAt,
      "Studio recreation verification",
      "2026-09-01T00:00:00Z",
    );
    const backupAt = exactEvidenceTimestamp(
      recreation.postChangeBackupCompletedAt,
      "post-change backup",
      "2026-09-01T00:00:00Z",
    );
    if (
      recreation.approvedBy !== "product-owner-thread" ||
      recreation.scope !== "studio-only" ||
      recreation.dryRunVerified !== true ||
      recreation.noDependencies !== true ||
      recreation.noBuild !== true ||
      recreation.pullPolicy !== "never" ||
      !sha256Pattern.test(recreation.previousComposeConfigHash) ||
      !sha256Pattern.test(recreation.currentComposeConfigHash) ||
      recreation.previousComposeConfigHash ===
        recreation.currentComposeConfigHash ||
      recreation.imageId !==
        contract.platformImageDigests["linux/amd64"].studio ||
      recreation.health !== "healthy" ||
      recreation.internalProfileStatus !== 200 ||
      recreation.publicProfileStatus !== 404 ||
      recreation.restartCount !== 0 ||
      recreation.previousSchemas !== "public,graphql_public" ||
      recreation.currentSchemas !== contract.environment.postgrestSchemas ||
      !sha256Pattern.test(recreation.rollbackEnvironmentSha256) ||
      recreation.rollbackEnvironmentMode !== "0600" ||
      recreation.rollbackDiffersOnlyBySchema !== true ||
      recreation.postChangeBackupResult !== "success" ||
      recreation.postChangeBackupExitStatus !== 0 ||
      recreation.publicHealthStatus !== 200 ||
      recreation.publicLoginStatus !== 200 ||
      recreation.authAnonymousStatus !== 401 ||
      recreation.dataApiAnonymousStatus !== 401 ||
      recreation.requiredServiceCount !== contract.requiredServices.length ||
      recreation.healthyServiceCount !== contract.requiredServices.length ||
      recreation.unchangedServiceCount !==
        contract.requiredServices.length - 1 ||
      inventoryByService.get("studio").startedAt !== recreation.startedAt ||
      [...inventoryByService.values()].some(
        (entry) =>
          entry.service !== "studio" &&
          Date.parse(entry.startedAt) >= startedAt,
      ) ||
      startedAt > backupAt ||
      backupAt > verifiedAt ||
      verifiedAt > observedAt
    ) {
      fail(
        "Studio recreation scope, rollback, health, or chronology is invalid",
      );
    }
    assertExactKeys(
      evidence.protectedState,
      [
        "commerceConnections",
        "customers",
        "wallets",
        "ledgerTransactions",
        "rewardReservations",
      ],
      "protected production state",
    );
    if (
      Object.values(evidence.protectedState).some(
        (value) => !Number.isSafeInteger(value) || value !== 0,
      )
    ) {
      fail("Studio recreation changed or obscured protected production state");
    }
    assert.deepEqual(
      evidence.productionChange,
      {
        performed: true,
        reversible: true,
        databaseChanged: false,
        applicationChanged: false,
        authChanged: false,
        dataApiChanged: false,
        backupConfigurationChanged: false,
        checkoutChanged: false,
        loyaltyValueChanged: false,
      },
      "production change boundary drifted",
    );
  }
  if (!Array.isArray(evidence.checks) || evidence.checks.length !== 13) {
    fail("production compatibility baseline must contain exactly 13 checks");
  }
  const checkIds = new Set();
  for (const check of evidence.checks) {
    assertExactKeys(check, ["id", "status", "evidence"], "baseline check");
    if (
      !/^[a-z][a-z0-9_]{2,63}$/u.test(check.id) ||
      checkIds.has(check.id) ||
      !["passed", "pending"].includes(check.status) ||
      typeof check.evidence !== "string" ||
      check.evidence.length < 10 ||
      check.evidence.length > 1_000
    ) {
      fail("production compatibility baseline contains an invalid check");
    }
    checkIds.add(check.id);
    const expectedChecks = historical
      ? historicalExpectedEvidenceChecks
      : currentExpectedEvidenceChecks;
    if (expectedChecks.get(check.id) !== check.status) {
      fail("production compatibility baseline check set has drifted");
    }
  }
  const expectedChecks = historical
    ? historicalExpectedEvidenceChecks
    : currentExpectedEvidenceChecks;
  if (checkIds.size !== expectedChecks.size) {
    fail("production compatibility baseline check set has drifted");
  }
  const pending = evidence.checks.filter((check) => check.status === "pending");
  const expectedPending = historical
    ? [
        "studio_runtime_schema_parity",
        "upgrade_rehearsal",
        "clean_room_restore",
      ]
    : ["upgrade_rehearsal", "clean_room_restore"];
  if (
    pending.length !== expectedPending.length ||
    expectedPending.some((id) => !pending.some((check) => check.id === id))
  ) {
    fail("production evidence does not preserve the exact runtime follow-ups");
  }
  if (
    !Array.isArray(evidence.limitations) ||
    evidence.limitations.length !== 3 ||
    evidence.limitations.some(
      (value) =>
        typeof value !== "string" || value.length < 20 || value.length > 500,
    )
  ) {
    fail("production limitations are incomplete");
  }
}

function buildFixture(contract, { jwks = true } = {}) {
  const fixtureContract = structuredClone(contract);
  const assetSources = {};
  for (const path of Object.keys(fixtureContract.criticalAssets)) {
    assetSources[path] = Buffer.from(`fixture:${path}`, "utf8");
    fixtureContract.criticalAssets[path] = sha256(assetSources[path]);
  }
  const services = {};
  for (const service of fixtureContract.requiredServices) {
    services[service] = { image: fixtureContract.serviceImages[service] };
  }
  services.auth.environment = {
    API_EXTERNAL_URL: "${API_EXTERNAL_URL}",
    GOTRUE_JWT_ISSUER: "${API_EXTERNAL_URL}",
  };
  services.rest.environment = {
    PGRST_DB_SCHEMAS: "${PGRST_DB_SCHEMAS}",
  };
  services.meta.environment = { PG_META_DB_USER: "postgres" };
  if (jwks) {
    for (const [selector, value] of Object.entries(
      fixtureContract.asymmetricJwksMappings,
    )) {
      const [service, variable] = selector.split(".");
      services[service].environment ??= {};
      services[service].environment[variable] = value;
    }
  }
  const individuallyMountedAssets = Object.keys(
    fixtureContract.criticalAssets,
  ).filter(
    (path) =>
      !fixtureContract.sealedAssetDirectories.some((directory) =>
        path.startsWith(`${directory}/`),
      ),
  );
  services.studio.volumes = [
    ...individuallyMountedAssets,
    ...fixtureContract.sealedAssetDirectories,
    ...fixtureContract.mutableBindDirectories,
  ].map((path, index) => `./${path}:/fixture/${index}:ro`);
  const composeSource = YAML.stringify({ services });
  fixtureContract.upstream.officialComposeSha256 = sha256(composeSource);
  fixtureContract.approvedComposeVariants = [
    {
      id: jwks ? "fixture-jwks" : "fixture-official",
      sha256: sha256(composeSource),
      asymmetricJwksRequired: jwks,
    },
  ];
  const environmentSource = [
    "API_EXTERNAL_URL=https://api.example.test/auth/v1",
    "SUPABASE_PUBLIC_URL=https://api.example.test",
    "SITE_URL=https://loyalty.example.test",
    "PGRST_DB_SCHEMAS=public,graphql_public,loyalty",
    'JWT_KEYS=[{"kid":"private-one"}]',
    'JWT_JWKS={"keys":[{"kid":"public-one"}]}',
    "",
  ].join("\n");
  return {
    composeSource,
    environmentSource,
    versionSource: `ref=${fixtureContract.upstream.releaseRef}\n`,
    provenanceSource: `${fixtureContract.upstream.releaseRef} ${fixtureContract.upstream.tagObjectSha}\n`,
    assetSources,
    contract: fixtureContract,
  };
}

function expectFailure(label, action, pattern) {
  assert.throws(action, pattern, label);
}

function runSelfTest(contract, productionEvidence, contractDigest) {
  const fixture = buildFixture(contract);
  const result = validateDeploymentSources(fixture);
  assert.equal(result.variantId, "fixture-jwks");
  assert.equal(result.serviceCount, contract.requiredServices.length);

  const corruptions = [
    [
      "release drift",
      { ...fixture, versionSource: "ref=self-hosted/v9.9.9\n" },
      /approved release/u,
    ],
    [
      "provenance drift",
      {
        ...fixture,
        provenanceSource: `${contract.upstream.releaseRef} ${"0".repeat(40)}\n`,
      },
      /tag object/u,
    ],
    [
      "service contract weakening",
      {
        ...fixture,
        contract: {
          ...fixture.contract,
          requiredServices: fixture.contract.requiredServices.slice(1),
        },
      },
      /service allowlists have drifted/u,
    ],
    [
      "mapping contract expansion",
      {
        ...fixture,
        contract: {
          ...fixture.contract,
          requiredComposeMappings: {
            ...fixture.contract.requiredComposeMappings,
            "studio.UNREVIEWED": "${UNREVIEWED}",
          },
        },
      },
      /required Compose mapping contract has unreviewed fields/u,
    ],
    [
      "Compose byte drift",
      { ...fixture, composeSource: `${fixture.composeSource}\n` },
      /approved exact variant/u,
    ],
    [
      "critical asset drift",
      {
        ...fixture,
        assetSources: {
          ...fixture.assetSources,
          "volumes/db/roles.sql": Buffer.from("drift", "utf8"),
        },
      },
      /critical asset volumes\/db\/roles.sql has drifted/u,
    ],
    [
      "extra sealed asset",
      {
        ...fixture,
        assetSources: {
          ...fixture.assetSources,
          "volumes/functions/unreviewed.ts": Buffer.from("drift", "utf8"),
        },
      },
      /critical asset source set has unreviewed fields/u,
    ],
    [
      "missing Envoy",
      null,
      /service envoy is missing/u,
      (value) => delete value.services.envoy,
    ],
    [
      "Kong default",
      null,
      /service kong is present/u,
      (value) => {
        value.services.kong = { image: "kong:3" };
      },
    ],
    [
      "PostgreSQL image drift",
      null,
      /db does not use the reviewed image/u,
      (value) => {
        value.services.db.image = "supabase/postgres:15.8.1";
      },
    ],
    [
      "postgres-meta owner drift",
      null,
      /meta.PG_META_DB_USER is incompatible/u,
      (value) => {
        value.services.meta.environment.PG_META_DB_USER = "supabase_admin";
      },
    ],
    [
      "Auth mapping drift",
      null,
      /auth.API_EXTERNAL_URL is incompatible/u,
      (value) => delete value.services.auth.environment.API_EXTERNAL_URL,
    ],
    [
      "missing JWKS mapping",
      null,
      /JWKS mapping storage.SUPABASE_JWKS is missing/u,
      (value) => delete value.services.storage.environment.SUPABASE_JWKS,
    ],
    [
      "host networking",
      null,
      /must not use host networking/u,
      (value) => {
        value.services.db.network_mode = "host";
      },
    ],
    [
      "unreviewed local bind",
      null,
      /local bind volumes\/unreviewed is not reviewed/u,
      (value) => {
        value.services.studio.volumes.push(
          "./volumes/unreviewed:/fixture/unreviewed:ro",
        );
      },
    ],
    [
      "legacy Auth path",
      {
        ...fixture,
        environmentSource: fixture.environmentSource.replace("/auth/v1", ""),
      },
      /canonical HTTPS with \/auth\/v1/u,
    ],
    [
      "missing loyalty schema",
      {
        ...fixture,
        environmentSource: fixture.environmentSource.replace(
          "public,graphql_public,loyalty",
          "public,graphql_public",
        ),
      },
      /schema allowlist/u,
    ],
    [
      "duplicate environment authority",
      {
        ...fixture,
        environmentSource: `${fixture.environmentSource}SITE_URL=https://other.example.test\n`,
      },
      /declared more than once/u,
    ],
    [
      "empty private key set",
      {
        ...fixture,
        environmentSource: fixture.environmentSource.replace(
          'JWT_KEYS=[{"kid":"private-one"}]',
          "JWT_KEYS=[]",
        ),
      },
      /JWT_KEYS must be valid non-empty JSON/u,
    ],
    [
      "unidentified private key",
      {
        ...fixture,
        environmentSource: fixture.environmentSource.replace(
          'JWT_KEYS=[{"kid":"private-one"}]',
          "JWT_KEYS=[{}]",
        ),
      },
      /JWT_KEYS must contain identified key objects/u,
    ],
    [
      "empty public key set",
      {
        ...fixture,
        environmentSource: fixture.environmentSource.replace(
          'JWT_JWKS={"keys":[{"kid":"public-one"}]}',
          'JWT_JWKS={"keys":[]}',
        ),
      },
      /JWT_JWKS must be valid non-empty JSON/u,
    ],
  ];
  for (const [label, direct, pattern, mutate] of corruptions) {
    let candidate = direct;
    if (mutate) {
      const parsed = YAML.parse(fixture.composeSource);
      mutate(parsed);
      const composeSource = YAML.stringify(parsed);
      const changedContract = structuredClone(fixture.contract);
      changedContract.upstream.officialComposeSha256 = sha256(composeSource);
      changedContract.approvedComposeVariants[0].sha256 = sha256(composeSource);
      candidate = { ...fixture, composeSource, contract: changedContract };
    }
    expectFailure(label, () => validateDeploymentSources(candidate), pattern);
  }

  const migrationBase = [
    "create table loyalty.fixture (id bigint primary key);",
    "alter table loyalty.fixture enable row level security;",
  ].join("\n");
  const migrationCorruptions = [
    [
      "extension pin",
      `${migrationBase}\ncreate extension hstore version '1.8';`,
      /version pins/u,
    ],
    [
      "extension update pin",
      `${migrationBase}\nalter extension hstore update to '1.8';`,
      /version pins/u,
    ],
    ["removed logs API", `${migrationBase}\nselect logs.all();`, /logs.all/u],
    [
      "Realtime mutation",
      `${migrationBase}\nalter table realtime.messages add column bad text;`,
      /realtime schema/u,
    ],
    [
      "Realtime grant",
      `${migrationBase}\ngrant select on realtime.messages to authenticated;`,
      /realtime schema privileges/u,
    ],
    [
      "public table",
      `${migrationBase}\ncreate table public.bad (id int);`,
      /must not be created in public/u,
    ],
    [
      "missing RLS",
      "create table loyalty_private.bad (organization_id bigint);",
      /does not enable RLS/u,
    ],
  ];
  assert.deepEqual(validateMigrationSource(migrationBase, 1), {
    migrationFiles: 1,
    tenantTables: 1,
  });
  for (const [label, source, pattern] of migrationCorruptions) {
    expectFailure(label, () => validateMigrationSource(source, 1), pattern);
  }
  const fixtureRoot = mkdtempSync(
    join(tmpdir(), "starfiniti-supabase-compatibility-"),
  );
  try {
    for (const [path, source] of Object.entries(fixture.assetSources)) {
      const target = join(fixtureRoot, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, source, { flag: "wx" });
    }
    const loaded = loadCriticalAssetSources(fixtureRoot, fixture.contract);
    assert.equal(
      validateAssetSources(loaded, fixture.contract),
      assetManifestSha256(fixture.contract.criticalAssets),
    );
    const extra = join(fixtureRoot, "volumes/functions/unreviewed.ts");
    writeFileSync(extra, "unreviewed", { flag: "wx" });
    expectFailure(
      "extra sealed filesystem asset",
      () => loadCriticalAssetSources(fixtureRoot, fixture.contract),
      /sealed asset directory contents have drifted/u,
    );
    const oversized = join(fixtureRoot, "oversized-deployment-file");
    writeFileSync(oversized, Buffer.alloc(1025), { flag: "wx" });
    expectFailure(
      "oversized deployment file",
      () =>
        readDeploymentFile(oversized, "fixture deployment file", {
          maxBytes: 1024,
        }),
      /exceeds the reviewed size boundary/u,
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }

  const evidenceCorruptions = [
    [
      "completion overclaim",
      (candidate) => {
        candidate.compatibilityStatus = "compatible";
      },
      /authority or status is invalid/u,
    ],
    [
      "unbound contract",
      (candidate) => {
        candidate.compatibilityContractSha256 = "0".repeat(64);
      },
      /authority or status is invalid/u,
    ],
    [
      "database mutation overclaim",
      (candidate) => {
        candidate.productionChange.databaseChanged = true;
      },
      /production change boundary drifted/u,
    ],
    [
      "image digest drift",
      (candidate) => {
        candidate.imageInventory[0].resolvedDigest = `sha256:${"0".repeat(64)}`;
      },
      /invalid or duplicate evidence/u,
    ],
    [
      "hidden pending upgrade check",
      (candidate) => {
        candidate.checks.find(
          (check) => check.id === "upgrade_rehearsal",
        ).status = "passed";
      },
      /check set has drifted/u,
    ],
    [
      "unreviewed nested evidence",
      (candidate) => {
        candidate.compose.unreviewed = "field";
      },
      /unreviewed fields/u,
    ],
    [
      "missing limitation",
      (candidate) => {
        candidate.limitations.pop();
      },
      /limitations are incomplete/u,
    ],
    [
      "missing check",
      (candidate) => {
        candidate.checks.pop();
      },
      /exactly 13 checks/u,
    ],
    [
      "renamed passed check",
      (candidate) => {
        candidate.checks.find((check) => check.id === "release_provenance").id =
          "invented_check";
      },
      /check set has drifted/u,
    ],
    [
      "future observation",
      (candidate) => {
        candidate.observedAt = "2099-01-01T00:00:00Z";
      },
      /timestamp is invalid/u,
    ],
    [
      "historical evidence digest drift",
      (candidate) => {
        candidate.previousEvidence.sha256 = "0".repeat(64);
      },
      /preserve the exact historical baseline/u,
    ],
    [
      "unbounded recreation scope",
      (candidate) => {
        candidate.studioRecreation.scope = "complete-stack";
      },
      /scope, rollback, health, or chronology/u,
    ],
    [
      "dependency recreation",
      (candidate) => {
        candidate.studioRecreation.noDependencies = false;
      },
      /scope, rollback, health, or chronology/u,
    ],
    [
      "image pull permitted",
      (candidate) => {
        candidate.studioRecreation.pullPolicy = "missing";
      },
      /scope, rollback, health, or chronology/u,
    ],
    [
      "schema parity rollback",
      (candidate) => {
        candidate.studioRecreation.currentSchemas = "public,graphql_public";
      },
      /scope, rollback, health, or chronology/u,
    ],
    [
      "post-change backup failure",
      (candidate) => {
        candidate.studioRecreation.postChangeBackupResult = "failed";
      },
      /scope, rollback, health, or chronology/u,
    ],
    [
      "unproven rollback equivalence",
      (candidate) => {
        candidate.studioRecreation.rollbackDiffersOnlyBySchema = false;
      },
      /scope, rollback, health, or chronology/u,
    ],
    [
      "anonymous Auth access",
      (candidate) => {
        candidate.studioRecreation.authAnonymousStatus = 200;
      },
      /scope, rollback, health, or chronology/u,
    ],
    [
      "Studio application smoke failure",
      (candidate) => {
        candidate.studioRecreation.internalProfileStatus = 503;
      },
      /scope, rollback, health, or chronology/u,
    ],
    [
      "public Studio exposure",
      (candidate) => {
        candidate.studioRecreation.publicProfileStatus = 200;
      },
      /scope, rollback, health, or chronology/u,
    ],
    [
      "protected value drift",
      (candidate) => {
        candidate.protectedState.ledgerTransactions = 1;
      },
      /changed or obscured protected production state/u,
    ],
    [
      "collateral service restart hidden",
      (candidate) => {
        candidate.studioRecreation.unchangedServiceCount = 9;
      },
      /scope, rollback, health, or chronology/u,
    ],
    [
      "collateral service runtime replaced",
      (candidate) => {
        candidate.imageInventory[1].startedAt =
          candidate.studioRecreation.verifiedAt;
      },
      /scope, rollback, health, or chronology/u,
    ],
  ];
  for (const [label, mutate, pattern] of evidenceCorruptions) {
    const candidate = structuredClone(productionEvidence);
    mutate(candidate);
    expectFailure(
      label,
      () =>
        validateProductionEvidence(candidate, contract, contractDigest, {
          previousEvidenceDigest: historicalEvidenceSha256,
        }),
      pattern,
    );
  }
  return (
    corruptions.length +
    migrationCorruptions.length +
    evidenceCorruptions.length +
    1
  );
}

function parseArguments(argv) {
  const options = { selfTest: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--self-test") {
      options.selfTest = true;
      continue;
    }
    const mapping = {
      "--compose": "compose",
      "--env": "environment",
      "--version-file": "version",
      "--provenance-file": "provenance",
      "--bundle-root": "bundleRoot",
      "--platform": "platform",
    };
    const key = mapping[argument];
    if (!key || !argv[index + 1]) fail("unsupported or incomplete arguments");
    if (Object.hasOwn(options, key))
      fail(`${argument} is declared more than once`);
    const value = argv[++index];
    options[key] = key === "platform" ? value : resolve(value);
  }
  return options;
}

const contractSource = readFileSync(contractPath, "utf8");
const contract = validateContract(
  parseJson(contractSource, "compatibility contract"),
);
const migrationResult = validateMigrationCompatibility(migrationsPath);
const historicalEvidenceSource = readFileSync(historicalEvidencePath, "utf8");
if (sha256(historicalEvidenceSource) !== historicalEvidenceSha256) {
  fail("historical Supabase production evidence bytes drifted");
}
const historicalEvidence = parseJson(
  historicalEvidenceSource,
  "historical Supabase production evidence",
);
validateProductionEvidence(
  historicalEvidence,
  contract,
  sha256(contractSource),
  {
    historical: true,
  },
);
const evidence = parseJson(
  readFileSync(evidencePath, "utf8"),
  "Supabase production evidence",
);
validateProductionEvidence(evidence, contract, sha256(contractSource), {
  previousEvidenceDigest: historicalEvidenceSha256,
});

const options = parseArguments(process.argv.slice(2));
let corruptionCount = 0;
if (options.selfTest) {
  corruptionCount = runSelfTest(contract, evidence, sha256(contractSource));
}

if (
  options.compose ||
  options.environment ||
  options.version ||
  options.provenance ||
  options.bundleRoot ||
  options.platform
) {
  if (
    !options.compose ||
    !options.environment ||
    !options.version ||
    !options.provenance ||
    !options.bundleRoot ||
    !options.platform
  ) {
    fail(
      "deployment mode requires --compose, --env, --version-file, --provenance-file, --bundle-root, and --platform",
    );
  }
  const result = validateDeploymentSources({
    composeSource: readDeploymentFile(options.compose, "Compose file", {
      maxBytes: 1024 * 1024,
    }),
    environmentSource: readDeploymentFile(
      options.environment,
      "environment file",
      {
        ownerOnly: true,
        maxBytes: 1024 * 1024,
      },
    ),
    versionSource: readDeploymentFile(options.version, "version file", {
      maxBytes: 16 * 1024,
    }),
    provenanceSource: readDeploymentFile(
      options.provenance,
      "provenance file",
      { maxBytes: 16 * 1024 },
    ),
    assetSources: loadCriticalAssetSources(options.bundleRoot, contract),
    contract,
  });
  const localImageCount = validateLocalImages(options.platform, contract);
  console.log(
    `Supabase deployment is compatible: variant ${result.variantId}, ${result.serviceCount} services, ${Object.keys(contract.criticalAssets).length} critical assets, ${localImageCount} exact ${options.platform} images, PostgreSQL ${result.postgresMajor}.`,
  );
} else {
  console.log(
    `Validated Supabase compatibility contract, ${migrationResult.migrationFiles} migrations, ${migrationResult.tenantTables} tenant tables, immutable historical and current production evidence, and ${corruptionCount} adversarial corruptions.`,
  );
}
