import assert from "node:assert/strict";
import {
  chmodSync,
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { isIP } from "node:net";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, parse, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const requiredVariables = new Set([
  "STARFINITI_MONITORING_BIND_ADDRESS",
  "STARFINITI_PROMETHEUS_PORT",
  "STARFINITI_ALERTMANAGER_PORT",
  "STARFINITI_GRAFANA_PORT",
  "STARFINITI_GRAFANA_ROOT_URL",
  "STARFINITI_PROMETHEUS_TARGETS_DIR",
  "STARFINITI_ALERTMANAGER_CONFIG",
  "STARFINITI_GRAFANA_ADMIN_PASSWORD_FILE",
  "STARFINITI_POSTGRES_EXPORTER_CONFIG",
]);
const pathVariables = [
  "STARFINITI_PROMETHEUS_TARGETS_DIR",
  "STARFINITI_ALERTMANAGER_CONFIG",
  "STARFINITI_GRAFANA_ADMIN_PASSWORD_FILE",
  "STARFINITI_POSTGRES_EXPORTER_CONFIG",
];

function fail(message) {
  throw new Error(`Observability environment invalid: ${message}`);
}

function exactSet(actualValues, expected, label) {
  const actual = new Set(actualValues);
  if (
    actual.size !== expected.size ||
    [...expected].some((value) => !actual.has(value))
  ) {
    fail(`${label} differs from the required closed set`);
  }
}

function parseArguments(argv) {
  if (argv.length === 1 && argv[0] === "--self-test") {
    return { selfTest: true };
  }
  if (argv.length === 2 && argv[0] === "--env" && argv[1]) {
    return { selfTest: false, envPath: argv[1] };
  }
  fail("usage: --self-test | --env <absolute-owner-file>");
}

function parseEnvironment(raw) {
  if (Buffer.byteLength(raw, "utf8") > 16_384 || raw.includes("\0")) {
    fail("environment file exceeds the bounded text format");
  }
  const entries = [];
  for (const source of raw.split(/\r?\n/u)) {
    const line = source.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) fail("environment file has an invalid entry");
    const name = line.slice(0, separator);
    const value = line.slice(separator + 1);
    if (!/^[A-Z][A-Z0-9_]+$/u.test(name) || !value || /[\r\n]/u.test(value)) {
      fail("environment file has an invalid name or empty value");
    }
    entries.push([name, value]);
  }
  const values = new Map(entries);
  if (values.size !== entries.length)
    fail("environment file repeats a variable");
  exactSet(values.keys(), requiredVariables, "environment variables");
  return values;
}

function validateScalarValues(values) {
  if (values.get("STARFINITI_MONITORING_BIND_ADDRESS") !== "127.0.0.1") {
    fail("monitoring administration must bind exactly to loopback");
  }
  const ports = [
    "STARFINITI_PROMETHEUS_PORT",
    "STARFINITI_ALERTMANAGER_PORT",
    "STARFINITI_GRAFANA_PORT",
  ].map((name) => {
    const raw = values.get(name);
    if (!/^[1-9][0-9]{0,4}$/u.test(raw)) fail(`${name} is not a valid port`);
    const port = Number(raw);
    if (port > 65_535) fail(`${name} is not a valid port`);
    return port;
  });
  if (new Set(ports).size !== ports.length) {
    fail("monitoring administration ports must be distinct");
  }
  let rootUrl;
  try {
    rootUrl = new URL(values.get("STARFINITI_GRAFANA_ROOT_URL"));
  } catch {
    fail("Grafana root URL is invalid");
  }
  if (
    rootUrl.protocol !== "https:" ||
    rootUrl.username ||
    rootUrl.password ||
    rootUrl.search ||
    rootUrl.hash ||
    !rootUrl.hostname.includes(".") ||
    isIP(rootUrl.hostname) !== 0 ||
    rootUrl.hostname === "localhost" ||
    rootUrl.hostname.endsWith(".invalid")
  ) {
    fail("Grafana root URL must be an approved query-free HTTPS hostname");
  }
}

function canonicalStatus(path, expectedType, label) {
  if (
    !isAbsolute(path) ||
    resolve(path) !== path ||
    parse(path).root === path
  ) {
    fail(`${label} must be a canonical non-root absolute path`);
  }
  let real;
  let status;
  try {
    real = realpathSync(path);
    status = lstatSync(path);
  } catch {
    fail(`${label} does not exist`);
  }
  if (resolve(real) !== path || status.isSymbolicLink()) {
    fail(`${label} must not traverse a symbolic link`);
  }
  if (
    (expectedType === "directory" && !status.isDirectory()) ||
    (expectedType === "file" && !status.isFile())
  ) {
    fail(`${label} has the wrong file type`);
  }
  const repositoryRelative = relative(root, path);
  if (
    repositoryRelative === "" ||
    (!repositoryRelative.startsWith("..") && !isAbsolute(repositoryRelative))
  ) {
    fail(`${label} must remain outside the repository`);
  }
  if (process.platform !== "win32") {
    const effectiveUser = process.geteuid?.();
    if (status.uid !== effectiveUser || (status.mode & 0o077) !== 0) {
      fail(`${label} must be caller-owned without group or other access`);
    }
    const parent = dirname(path);
    const parentStatus = lstatSync(parent);
    if (
      resolve(realpathSync(parent)) !== resolve(parent) ||
      !parentStatus.isDirectory() ||
      (parentStatus.mode & 0o022) !== 0 ||
      ![0, effectiveUser].includes(parentStatus.uid)
    ) {
      fail(`${label} parent is not a protected canonical directory`);
    }
  }
  return status;
}

function validatePathValues(values, envPath) {
  const resolved = new Map(
    pathVariables.map((name) => [name, values.get(name)]),
  );
  if (
    [...resolved.values()].some(
      (path) =>
        !isAbsolute(path) || resolve(path) !== path || parse(path).root === path,
    )
  ) {
    fail("operator paths must be canonical non-root absolute paths");
  }
  if (
    process.platform !== "win32" &&
    [...resolved.values()].some((path) => !/^\/[A-Za-z0-9_./-]+$/u.test(path))
  ) {
    fail("operator paths contain unsupported environment-file syntax");
  }
  if (new Set(resolved.values()).size !== pathVariables.length) {
    fail("operator paths must be distinct");
  }
  const targets = resolved.get("STARFINITI_PROMETHEUS_TARGETS_DIR");
  canonicalStatus(targets, "directory", "Prometheus target directory");
  for (const [name, path] of resolved) {
    if (name === "STARFINITI_PROMETHEUS_TARGETS_DIR") continue;
    const status = canonicalStatus(path, "file", name);
    const insideTargets = relative(targets, path);
    if (!insideTargets.startsWith("..") && !isAbsolute(insideTargets)) {
      fail(`${name} must not be exposed through the target directory`);
    }
    const maximum =
      name === "STARFINITI_GRAFANA_ADMIN_PASSWORD_FILE" ? 4_096 : 1_048_576;
    const minimum = name === "STARFINITI_GRAFANA_ADMIN_PASSWORD_FILE" ? 16 : 1;
    if (status.size < minimum || status.size > maximum) {
      fail(`${name} has an invalid bounded size`);
    }
  }
  if (new Set(resolved.values()).has(envPath) || envPath === targets) {
    fail("environment authority must remain separate from mounted paths");
  }
}

function readEnvironmentFile(path) {
  if (!isAbsolute(path) || resolve(path) !== path) {
    fail("environment path must be canonical and absolute");
  }
  const initial = canonicalStatus(path, "file", "environment file");
  if (initial.size < 1 || initial.size > 16_384) {
    fail("environment file has an invalid bounded size");
  }
  let descriptor;
  try {
    descriptor = openSync(
      path,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    const opened = fstatSync(descriptor);
    if (
      !opened.isFile() ||
      opened.dev !== initial.dev ||
      opened.ino !== initial.ino ||
      opened.size !== initial.size
    ) {
      fail("environment file identity changed before reading");
    }
    const raw = readFileSync(descriptor, "utf8");
    const after = fstatSync(descriptor);
    const final = lstatSync(path);
    if (
      Buffer.byteLength(raw, "utf8") !== after.size ||
      after.dev !== opened.dev ||
      after.ino !== opened.ino ||
      after.size !== opened.size ||
      after.mtimeMs !== opened.mtimeMs ||
      final.dev !== opened.dev ||
      final.ino !== opened.ino
    ) {
      fail("environment file changed while reading");
    }
    return raw;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

const parsed = parseArguments(process.argv.slice(2));
if (parsed.selfTest) {
  const valid = [
    "STARFINITI_MONITORING_BIND_ADDRESS=127.0.0.1",
    "STARFINITI_PROMETHEUS_PORT=9090",
    "STARFINITI_ALERTMANAGER_PORT=9093",
    "STARFINITI_GRAFANA_PORT=3000",
    "STARFINITI_GRAFANA_ROOT_URL=https://monitoring.starfiniti.example",
    "STARFINITI_PROMETHEUS_TARGETS_DIR=/operator/targets",
    "STARFINITI_ALERTMANAGER_CONFIG=/operator/alertmanager.yml",
    "STARFINITI_GRAFANA_ADMIN_PASSWORD_FILE=/operator/grafana-password",
    "STARFINITI_POSTGRES_EXPORTER_CONFIG=/operator/postgres-exporter.yml",
  ].join("\n");
  validateScalarValues(parseEnvironment(valid));
  assert.throws(() => parseArguments([]), /usage/u);
  assert.throws(
    () => parseEnvironment(`${valid}\nUNEXPECTED=value`),
    /closed set/u,
  );
  assert.throws(
    () => parseEnvironment(`${valid}\nSTARFINITI_PROMETHEUS_PORT=9091`),
    /repeats/u,
  );
  const mutate = (from, to, pattern) => {
    assert.throws(
      () => validateScalarValues(parseEnvironment(valid.replace(from, to))),
      pattern,
    );
  };
  mutate("127.0.0.1", "0.0.0.0", /loopback/u);
  mutate(
    "STARFINITI_GRAFANA_PORT=3000",
    "STARFINITI_GRAFANA_PORT=9090",
    /distinct/u,
  );
  mutate(
    "https://monitoring.starfiniti.example",
    "http://monitoring.starfiniti.example",
    /HTTPS/u,
  );
  mutate(
    "https://monitoring.starfiniti.example",
    "https://monitoring.example.invalid",
    /HTTPS/u,
  );
  const temporary = mkdtempSync(
    join(tmpdir(), "starfiniti-observability-env-"),
  );
  try {
    chmodSync(temporary, 0o700);
    const targets = join(temporary, "targets");
    mkdirSync(targets, { mode: 0o700 });
    const files = {
      STARFINITI_ALERTMANAGER_CONFIG: join(temporary, "alertmanager.yml"),
      STARFINITI_GRAFANA_ADMIN_PASSWORD_FILE: join(
        temporary,
        "grafana-password",
      ),
      STARFINITI_POSTGRES_EXPORTER_CONFIG: join(
        temporary,
        "postgres-exporter.yml",
      ),
    };
    writeFileSync(files.STARFINITI_ALERTMANAGER_CONFIG, "route: {}\n", {
      mode: 0o600,
    });
    writeFileSync(
      files.STARFINITI_GRAFANA_ADMIN_PASSWORD_FILE,
      "synthetic-password-only\n",
      { mode: 0o600 },
    );
    writeFileSync(
      files.STARFINITI_POSTGRES_EXPORTER_CONFIG,
      "auth_modules: {}\n",
      {
        mode: 0o600,
      },
    );
    const paths = parseEnvironment(valid);
    paths.set("STARFINITI_PROMETHEUS_TARGETS_DIR", targets);
    for (const [name, path] of Object.entries(files)) paths.set(name, path);
    const syntheticEnv = join(temporary, "observability.env");
    validatePathValues(paths, syntheticEnv);

    const repeated = new Map(paths);
    repeated.set(
      "STARFINITI_ALERTMANAGER_CONFIG",
      files.STARFINITI_POSTGRES_EXPORTER_CONFIG,
    );
    assert.throws(
      () => validatePathValues(repeated, syntheticEnv),
      /distinct/u,
    );

    const exposedPath = join(targets, "grafana-password");
    writeFileSync(exposedPath, "synthetic-password-only\n", { mode: 0o600 });
    const exposed = new Map(paths);
    exposed.set("STARFINITI_GRAFANA_ADMIN_PASSWORD_FILE", exposedPath);
    assert.throws(
      () => validatePathValues(exposed, syntheticEnv),
      /target directory/u,
    );

    const relativePath = new Map(paths);
    relativePath.set("STARFINITI_ALERTMANAGER_CONFIG", "alertmanager.yml");
    assert.throws(
      () => validatePathValues(relativePath, syntheticEnv),
      /canonical non-root absolute/u,
    );

    const rootTarget = new Map(paths);
    rootTarget.set("STARFINITI_PROMETHEUS_TARGETS_DIR", parse(targets).root);
    assert.throws(
      () => validatePathValues(rootTarget, syntheticEnv),
      /canonical non-root absolute/u,
    );

    if (process.platform !== "win32") {
      chmodSync(files.STARFINITI_POSTGRES_EXPORTER_CONFIG, 0o644);
      assert.throws(
        () => validatePathValues(paths, syntheticEnv),
        /without group or other access/u,
      );
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
  console.log(
    "Validated observability environment parsing, path separation, loopback, port, HTTPS, and closed-variable boundaries with eleven portable adversarial cases plus the POSIX mode boundary when available.",
  );
  process.exit(0);
}

const envPath = resolve(parsed.envPath);
if (process.platform !== "linux" || process.arch !== "x64") {
  fail("production environment preflight requires Linux amd64");
}
if (envPath !== parsed.envPath) {
  fail("environment path must be canonical and absolute");
}
const values = parseEnvironment(readEnvironmentFile(envPath));
validateScalarValues(values);
validatePathValues(values, envPath);
console.log(
  "Validated one owner-controlled observability environment without printing targets, topology, receiver data, or credentials.",
);
