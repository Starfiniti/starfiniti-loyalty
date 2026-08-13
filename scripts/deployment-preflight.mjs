import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isIP } from "node:net";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const requiredVariables = [
  "COMPOSE_PROJECT_NAME",
  "DASHBOARD_IMAGE",
  "WORKER_IMAGE",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_PUBLIC_HOST",
  "SUPABASE_INTERNAL_PROXY_IP",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "DASHBOARD_PUBLIC_ORIGIN",
  "DASHBOARD_BIND_ADDRESS",
  "DATABASE_URL",
  "LOYALTY_WORKER_DATABASE_URL",
  "WOOCOMMERCE_SIGNING_MATERIAL_PATH",
];

const referencePattern =
  /^pool:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:v1$/u;
const immutableImagePattern =
  /^(?:[a-z0-9.-]+(?::[0-9]+)?\/)?[a-z0-9._/-]+(?:@sha256:[0-9a-f]{64}|:[0-9a-f]{40})$/u;
const dashboardRuntimeUid = 1001;

function fail(message) {
  throw new Error(`Deployment preflight failed: ${message}`);
}

export function parseEnvironment(source) {
  const environment = {};
  for (const [index, rawLine] of source.split(/\r?\n/u).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const equals = line.indexOf("=");
    if (equals < 1) fail(`environment line ${index + 1} is invalid`);
    const name = line.slice(0, equals).trim();
    let value = line.slice(equals + 1).trim();
    if (!/^[A-Z][A-Z0-9_]*$/u.test(name)) {
      fail(`environment line ${index + 1} has an invalid variable name`);
    }
    if (Object.hasOwn(environment, name)) {
      fail(`${name} is declared more than once`);
    }
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    environment[name] = value;
  }
  return environment;
}

function validateHttpsOrigin(name, value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${name} must be a valid URL`);
  }
  if (
    parsed.protocol !== "https:" ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    parsed.origin !== value
  ) {
    fail(`${name} must be one exact canonical HTTPS origin with no path`);
  }
  return parsed;
}

function validateDatabaseUrl(name, value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${name} must be a valid PostgreSQL URL`);
  }
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !parsed.hostname ||
    !parsed.username ||
    !parsed.password ||
    parsed.pathname.length < 2
  ) {
    fail(`${name} must include PostgreSQL host, database, user, and password`);
  }
  if (
    ["postgres", "supabase_admin", "service_role", "anon"].includes(
      decodeURIComponent(parsed.username).toLowerCase(),
    )
  ) {
    fail(`${name} must use a dedicated least-privilege login`);
  }
  return parsed;
}

function isPrivateIpv4(value) {
  if (isIP(value) !== 4) return false;
  const [first, second] = value.split(".").map(Number);
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function validateSigningPool(path, enforcePermissions) {
  if (!isAbsolute(path))
    fail("WOOCOMMERCE_SIGNING_MATERIAL_PATH must be absolute");
  let raw;
  let fileStatus;
  try {
    raw = readFileSync(path, "utf8");
    fileStatus = statSync(path);
  } catch {
    fail("WooCommerce signing-key pool is unreadable");
  }
  if (!fileStatus.isFile()) fail("WooCommerce signing-key pool is not a file");
  if (enforcePermissions && (fileStatus.mode & 0o077) !== 0) {
    fail("WooCommerce signing-key pool must not grant group or other access");
  }
  if (enforcePermissions && fileStatus.uid !== dashboardRuntimeUid) {
    fail(
      `WooCommerce signing-key pool must be owned by dashboard runtime UID ${dashboardRuntimeUid}`,
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fail("WooCommerce signing-key pool is not valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail("WooCommerce signing-key pool must be a JSON object");
  }
  const entries = Object.entries(parsed);
  if (entries.length < 1 || entries.length > 1_000) {
    fail("WooCommerce signing-key pool must contain 1 to 1000 entries");
  }
  for (const [reference, encoded] of entries) {
    if (!referencePattern.test(reference) || typeof encoded !== "string") {
      fail("WooCommerce signing-key pool contains an invalid entry");
    }
    const decoded = Buffer.from(encoded, "base64");
    if (
      !/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded) ||
      decoded.byteLength < 32 ||
      decoded.toString("base64") !== encoded
    ) {
      fail("WooCommerce signing-key pool contains an invalid entry");
    }
  }
  return entries.length;
}

export function validateDeploymentConfiguration(
  environment,
  { enforcePermissions = process.platform !== "win32" } = {},
) {
  for (const name of requiredVariables) {
    if (!environment[name]) fail(`${name} is required`);
  }
  for (const [name, value] of Object.entries(environment)) {
    if (
      typeof value === "string" &&
      /(replace-with|change-?me|example\.com)/iu.test(value)
    ) {
      fail(`${name} still contains a placeholder value`);
    }
  }
  if (environment.COMPOSE_PROJECT_NAME !== "starfiniti-loyalty") {
    fail("COMPOSE_PROJECT_NAME must remain starfiniti-loyalty");
  }
  if (
    isIP(environment.DASHBOARD_BIND_ADDRESS) !== 4 ||
    environment.DASHBOARD_BIND_ADDRESS === "0.0.0.0"
  ) {
    fail(
      "DASHBOARD_BIND_ADDRESS must be one explicit non-wildcard IPv4 address",
    );
  }
  for (const name of ["DASHBOARD_IMAGE", "WORKER_IMAGE"]) {
    if (!immutableImagePattern.test(environment[name])) {
      fail(`${name} must use a commit-SHA tag or sha256 digest`);
    }
  }
  if (
    environment.DASHBOARD_IMAGE.replace(/(?:@sha256:|:)[0-9a-f]+$/u, "") ===
    environment.WORKER_IMAGE.replace(/(?:@sha256:|:)[0-9a-f]+$/u, "")
  ) {
    fail("dashboard and worker images must be distinct repositories");
  }
  const supabaseOrigin = validateHttpsOrigin(
    "NEXT_PUBLIC_SUPABASE_URL",
    environment.NEXT_PUBLIC_SUPABASE_URL,
  );
  validateHttpsOrigin(
    "DASHBOARD_PUBLIC_ORIGIN",
    environment.DASHBOARD_PUBLIC_ORIGIN,
  );
  if (
    environment.NEXT_PUBLIC_SUPABASE_URL === environment.DASHBOARD_PUBLIC_ORIGIN
  ) {
    fail("Supabase and dashboard public origins must be distinct");
  }
  if (environment.SUPABASE_PUBLIC_HOST !== supabaseOrigin.hostname) {
    fail("SUPABASE_PUBLIC_HOST must match NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!isPrivateIpv4(environment.SUPABASE_INTERNAL_PROXY_IP)) {
    fail("SUPABASE_INTERNAL_PROXY_IP must be one private RFC1918 IPv4 address");
  }
  if (
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.length < 20 ||
    /\s/u.test(environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  ) {
    fail("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is malformed");
  }
  const runtimeUrl = validateDatabaseUrl(
    "DATABASE_URL",
    environment.DATABASE_URL,
  );
  const workerUrl = validateDatabaseUrl(
    "LOYALTY_WORKER_DATABASE_URL",
    environment.LOYALTY_WORKER_DATABASE_URL,
  );
  if (
    environment.DATABASE_URL === environment.LOYALTY_WORKER_DATABASE_URL ||
    runtimeUrl.username === workerUrl.username
  ) {
    fail("runtime and worker database credentials must use distinct logins");
  }
  return validateSigningPool(
    environment.WOOCOMMERCE_SIGNING_MATERIAL_PATH,
    enforcePermissions,
  );
}

export function validateDeploymentAssets() {
  const compose = readFileSync(
    "infrastructure/environments/proxmox/compose.app.yml",
    "utf8",
  );
  const template = parseEnvironment(
    readFileSync("infrastructure/environments/proxmox/.env.example", "utf8"),
  );
  const composeVariables = new Set(
    [...compose.matchAll(/\$\{([A-Z][A-Z0-9_]*):\?[^}]+\}/gu)].map(
      (match) => match[1],
    ),
  );
  for (const name of requiredVariables) {
    if (!Object.hasOwn(template, name)) {
      fail(`Proxmox environment template does not declare ${name}`);
    }
    if (name !== "COMPOSE_PROJECT_NAME" && !composeVariables.has(name)) {
      fail(`Proxmox Compose does not require ${name}`);
    }
  }
  if (!compose.includes("http://127.0.0.1:3000/api/healthz")) {
    fail(
      "Proxmox dashboard healthcheck must use the runtime readiness endpoint",
    );
  }
}

function expectFailure(callback) {
  try {
    callback();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("Deployment preflight failed:")
    ) {
      return error.message;
    }
    throw error;
  }
  throw new Error("Deployment preflight self-test expected a failure.");
}

function runSelfTest() {
  validateDeploymentAssets();
  const directory = mkdtempSync(join(tmpdir(), "starfiniti-preflight-"));
  const poolPath = join(directory, "signing-material.json");
  const encodedKey = Buffer.alloc(32, 7).toString("base64");
  writeFileSync(
    poolPath,
    `${JSON.stringify({
      "pool:10000000-0000-4000-8000-000000000001:v1": encodedKey,
    })}\n`,
    { mode: 0o600 },
  );
  const valid = {
    COMPOSE_PROJECT_NAME: "starfiniti-loyalty",
    DASHBOARD_IMAGE: `ghcr.io/starfiniti/loyalty-dashboard:${"a".repeat(40)}`,
    WORKER_IMAGE: `ghcr.io/starfiniti/loyalty-worker:${"b".repeat(40)}`,
    NEXT_PUBLIC_SUPABASE_URL: "https://api.loyalty.invalid",
    SUPABASE_PUBLIC_HOST: "api.loyalty.invalid",
    SUPABASE_INTERNAL_PROXY_IP: "10.10.10.30",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: `sb_publishable_${"p".repeat(32)}`,
    DASHBOARD_PUBLIC_ORIGIN: "https://loyalty.invalid",
    DASHBOARD_BIND_ADDRESS: "127.0.0.1",
    DATABASE_URL:
      "postgresql://loyalty_app:runtime-password@10.0.0.2:5432/postgres",
    LOYALTY_WORKER_DATABASE_URL:
      "postgresql://loyalty_jobs:worker-password@10.0.0.2:5432/postgres",
    WOOCOMMERCE_SIGNING_MATERIAL_PATH: poolPath,
  };
  try {
    if (
      validateDeploymentConfiguration(valid, { enforcePermissions: false }) !==
      1
    ) {
      throw new Error(
        "Deployment preflight self-test returned the wrong count.",
      );
    }
    const messages = [
      expectFailure(() =>
        validateDeploymentConfiguration(
          { ...valid, DASHBOARD_IMAGE: "ghcr.io/starfiniti/dashboard:latest" },
          { enforcePermissions: false },
        ),
      ),
      expectFailure(() =>
        validateDeploymentConfiguration(
          {
            ...valid,
            LOYALTY_WORKER_DATABASE_URL: valid.DATABASE_URL,
          },
          { enforcePermissions: false },
        ),
      ),
      expectFailure(() =>
        validateDeploymentConfiguration(
          { ...valid, DASHBOARD_PUBLIC_ORIGIN: "http://loyalty.invalid" },
          { enforcePermissions: false },
        ),
      ),
      expectFailure(() =>
        validateDeploymentConfiguration(
          { ...valid, SUPABASE_PUBLIC_HOST: "other.loyalty.invalid" },
          { enforcePermissions: false },
        ),
      ),
      expectFailure(() =>
        validateDeploymentConfiguration(
          { ...valid, SUPABASE_INTERNAL_PROXY_IP: "8.8.8.8" },
          { enforcePermissions: false },
        ),
      ),
      expectFailure(() =>
        validateDeploymentConfiguration(
          {
            ...valid,
            NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "replace-with-key",
          },
          { enforcePermissions: false },
        ),
      ),
      expectFailure(() => parseEnvironment("DUPLICATE=one\nDUPLICATE=two\n")),
    ];
    writeFileSync(poolPath, '{"invalid":"material"}\n', { mode: 0o600 });
    messages.push(
      expectFailure(() =>
        validateDeploymentConfiguration(valid, { enforcePermissions: false }),
      ),
    );
    writeFileSync(
      poolPath,
      `${JSON.stringify({
        "pool:10000000-0000-4000-8000-000000000001:v1": encodedKey,
      })}\n`,
      { mode: 0o600 },
    );
    if (process.platform !== "win32") {
      chmodSync(poolPath, 0o644);
      messages.push(
        expectFailure(() => validateDeploymentConfiguration(valid)),
      );
      chmodSync(poolPath, 0o600);
    }
    for (const message of messages) {
      for (const secret of [
        "runtime-password",
        "worker-password",
        encodedKey,
        valid.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      ]) {
        if (message.includes(secret)) {
          throw new Error("Deployment preflight self-test exposed a secret.");
        }
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  console.log(
    "Validated deployment asset parity, immutable selectors, credential separation, HTTPS origins, explicit dashboard binding, internal Supabase proxy mapping, signing-pool structure/ownership, and redacted failures.",
  );
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  if (process.argv.includes("--self-test")) {
    runSelfTest();
  } else {
    const environmentPath = argument("--env");
    if (!environmentPath || !isAbsolute(environmentPath)) {
      fail(
        "usage is npm run deploy:preflight -- --env <absolute-secret-env-file>",
      );
    }
    validateDeploymentAssets();
    const environment = parseEnvironment(readFileSync(environmentPath, "utf8"));
    const poolSize = validateDeploymentConfiguration(environment);
    console.log(
      `Deployment preflight passed with ${poolSize} signing-key slot(s); no configuration values were printed.`,
    );
  }
}
