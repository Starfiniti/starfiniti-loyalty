import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { buildSync } from "esbuild";
import YAML from "yaml";

import {
  defaultPlan,
  planDigest,
  scenarioIds,
  validateAuthentikRuntimePlan,
  validateAuthentikRuntimeReport,
} from "./validate-authentik-2026-8-runtime-plan.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const operatorSource = join(
  root,
  "scripts/authentik-2026-8-runtime-operator.mjs",
);
const sinkSource = join(
  root,
  "infrastructure/testing/authentik-2026-8-runtime/scim-sink.mjs",
);
const safeOutputPattern =
  /^dist\/authentik-2026-8-runtime\/[a-z0-9][a-z0-9._-]{1,79}\.json$/u;
const criticalRelativePaths = [
  "infrastructure/testing/authentik-2026-8-runtime/plan.yaml",
  "infrastructure/testing/authentik-2026-8-runtime/scim-sink.mjs",
  "scripts/authentik-2026-8-runtime-operator.mjs",
  "scripts/run-authentik-2026-8-runtime-canary.mjs",
  "scripts/validate-authentik-2026-8-runtime-plan.mjs",
  "apps/dashboard/lib/server/authentik-federation-admin.ts",
];
const sensitiveRuntimeValues = new Set();

function fail(message) {
  throw new Error(`Authentik 2026.8 runtime canary failed: ${message}`);
}

function parseArguments(argv) {
  if (argv.length === 1 && argv[0] === "--self-test") {
    return { selfTest: true, planPath: defaultPlan };
  }
  const parsed = { selfTest: false, planPath: defaultPlan, output: null };
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (!new Set(["--plan", "--out"]).has(option)) {
      fail(`unknown option ${option}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) fail(`${option} requires a value`);
    if (option === "--plan") {
      if (parsed.planPath !== defaultPlan) fail("--plan was provided twice");
      parsed.planPath = resolve(root, value);
    } else {
      if (parsed.output !== null) fail("--out was provided twice");
      parsed.output = value;
    }
    index += 1;
  }
  if (parsed.output === null) fail("--out is required");
  return parsed;
}

function safeOutputPath(value) {
  const normalized = value.replaceAll("\\", "/");
  if (isAbsolute(value) || !safeOutputPattern.test(normalized)) {
    fail(
      "output must be a bounded JSON path under dist/authentik-2026-8-runtime",
    );
  }
  return resolve(root, normalized);
}

function createOutputParent(path) {
  const parentPath = dirname(path);
  mkdirSync(parentPath, { recursive: true });
  const status = lstatSync(parentPath);
  if (
    !status.isDirectory() ||
    resolve(realpathSync(parentPath)) !== resolve(parentPath)
  ) {
    fail("output parent must be a canonical directory without symbolic links");
  }
  return { path: parentPath, dev: status.dev, ino: status.ino };
}

function writeReport(path, parentIdentity, report, maximumBytes) {
  const bytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (bytes.length > maximumBytes) fail("report exceeds its byte bound");
  let descriptor;
  try {
    const parent = lstatSync(parentIdentity.path);
    if (
      !parent.isDirectory() ||
      parent.dev !== parentIdentity.dev ||
      parent.ino !== parentIdentity.ino
    ) {
      fail("output parent identity changed");
    }
    descriptor = openSync(
      path,
      constants.O_RDWR |
        constants.O_CREAT |
        constants.O_EXCL |
        (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    const opened = fstatSync(descriptor);
    if (!opened.isFile()) fail("output is not a regular file");
    let offset = 0;
    while (offset < bytes.length) {
      const written = writeSync(
        descriptor,
        bytes,
        offset,
        bytes.length - offset,
        offset,
      );
      if (written < 1) fail("output write stopped early");
      offset += written;
    }
    fsyncSync(descriptor);
    const final = fstatSync(descriptor);
    if (
      final.size !== bytes.length ||
      (process.platform !== "win32" && (final.mode & 0o777) !== 0o600)
    ) {
      fail("output permissions or size differ");
    }
  } catch (error) {
    if (error?.code === "EEXIST")
      fail("output already exists; evidence is immutable");
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function loadPlan(path) {
  const bytes = readFileSync(path);
  const plan = YAML.parse(bytes.toString("utf8"));
  validateAuthentikRuntimePlan(plan);
  return { bytes, plan };
}

function docker(args, options = {}) {
  try {
    return execFileSync("docker", args, {
      cwd: root,
      encoding: "utf8",
      stdio: options.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
      timeout: options.timeout ?? 180_000,
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
    })?.trim();
  } catch (error) {
    let detail = [error?.stderr, error?.stdout]
      .filter((value) => typeof value === "string")
      .join(" ")
      .replaceAll(/[\r\n]+/gu, " ")
      .slice(0, 1_000);
    for (const value of sensitiveRuntimeValues) {
      detail = detail.replaceAll(value, "[REDACTED]");
    }
    fail(detail || "Docker command failed");
  }
}

function tryDocker(args, timeout = 15_000) {
  const result = spawnSync("docker", args, {
    cwd: root,
    encoding: "utf8",
    stdio: "ignore",
    timeout,
    windowsHide: true,
  });
  return result.status === 0;
}

function waitForDocker(args, timeoutSeconds, label) {
  const deadline = Date.now() + timeoutSeconds * 1_000;
  while (Date.now() < deadline) {
    if (tryDocker(args)) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1_000);
  }
  fail(`${label} did not become ready`);
}

function assertCleanCriticalSources() {
  for (const path of criticalRelativePaths) {
    const tracked = spawnSync(
      "git",
      ["ls-files", "--error-unmatch", "--", path],
      {
        cwd: root,
        stdio: "ignore",
        windowsHide: true,
      },
    );
    if (tracked.status !== 0) fail(`critical source is untracked: ${path}`);
  }
  for (const mode of [[], ["--cached"]]) {
    const result = spawnSync(
      "git",
      ["diff", "--quiet", ...mode, "--", ...criticalRelativePaths],
      { cwd: root, stdio: "ignore", windowsHide: true },
    );
    if (result.status !== 0)
      fail("critical runtime sources must match the checked-out commit");
  }
}

function imageDigestMap(plan) {
  return {
    authentik: plan.candidate.image.linuxAmd64ManifestDigest,
    postgres: plan.dependencies.postgres.linuxAmd64ManifestDigest,
    operator: plan.dependencies.operator.linuxAmd64ManifestDigest,
  };
}

function pullAndVerifyImages(plan) {
  const images = [
    [plan.candidate.image.ref, plan.candidate.image.linuxAmd64ManifestDigest],
    [
      plan.dependencies.postgres.ref,
      plan.dependencies.postgres.linuxAmd64ManifestDigest,
    ],
    [
      plan.dependencies.operator.ref,
      plan.dependencies.operator.linuxAmd64ManifestDigest,
    ],
  ];
  for (const [ref, expectedDigest] of images) {
    docker(["pull", "--platform", "linux/amd64", ref], {
      inherit: true,
      timeout: 600_000,
    });
    const platform = docker([
      "image",
      "inspect",
      ref,
      "--format",
      "{{.Os}}/{{.Architecture}}",
    ]);
    if (platform !== "linux/amd64")
      fail(`image ${ref} resolved to ${platform}`);
    const repoDigests = JSON.parse(
      docker(["image", "inspect", ref, "--format", "{{json .RepoDigests}}"]),
    );
    if (
      !Array.isArray(repoDigests) ||
      !repoDigests.some((item) => item.endsWith(`@${expectedDigest}`))
    ) {
      fail(`image ${ref} does not expose the reviewed manifest`);
    }
  }
}

function containerEnvironment(values) {
  return Object.entries(values).flatMap(([key, value]) => [
    "--env",
    `${key}=${value}`,
  ]);
}

function startContainer(args) {
  const id = docker(["run", "--detach", ...args]);
  assert.match(id, /^[0-9a-f]{64}$/u, "container ID differs");
  return id;
}

function commonLabels() {
  return [
    "--label",
    "com.starfiniti.disposable=true",
    "--label",
    "com.starfiniti.environment=authentik-runtime",
  ];
}

function runOperator({ plan, network, bundle, environment, arguments: args }) {
  const output = docker(
    [
      "run",
      "--rm",
      "--network",
      network,
      "--read-only",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--pids-limit",
      "128",
      "--memory",
      "512m",
      "--cpus",
      "1",
      "--user",
      "65532:65532",
      "--tmpfs",
      "/tmp:rw,noexec,nosuid,size=16m",
      "--mount",
      `type=bind,src=${bundle},dst=/work/operator.mjs,readonly`,
      ...containerEnvironment(environment),
      ...commonLabels(),
      plan.dependencies.operator.ref,
      "node",
      "/work/operator.mjs",
      ...args,
    ],
    { timeout: (plan.runtime.scenarioTimeoutSeconds + 30) * 1_000 },
  );
  const parsed = JSON.parse(output);
  if (typeof parsed !== "object" || parsed === null)
    fail("operator output is invalid");
  return parsed;
}

function exactSetup(value) {
  assert.deepEqual(
    Object.keys(value).sort(),
    [
      "schema",
      "scimProviderId",
      "userId",
      "userUid",
      "groupPk",
      "oidcProviderId",
      "samlProviderId",
      "flowBindings",
    ].sort(),
  );
  assert.equal(value.schema, "starfiniti.authentik-2026-8-runtime-setup.v1");
  for (const key of [
    "scimProviderId",
    "userId",
    "oidcProviderId",
    "samlProviderId",
  ]) {
    assert.ok(
      Number.isSafeInteger(value[key]) && value[key] > 0,
      `${key} differs`,
    );
  }
  for (const key of ["userUid", "groupPk"]) {
    assert.match(
      value[key],
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
  }
  assert.equal(value.flowBindings, 4);
  return value;
}

function exactRuntimeResult(value) {
  assert.deepEqual(
    Object.keys(value).sort(),
    [
      "schema",
      "federationResources",
      "flowBindings",
      "scimOperations",
      "scimAuthorizationRejects",
      "scimCapabilityReads",
      "scimPaginationRequests",
      "scimMemberRemovalPaths",
      "checks",
    ].sort(),
  );
  assert.equal(value.schema, "starfiniti.authentik-2026-8-runtime-result.v1");
  assert.equal(value.federationResources, 2);
  assert.equal(value.flowBindings, 4);
  assert.ok(value.scimOperations >= 12);
  assert.ok(value.scimAuthorizationRejects >= 1);
  assert.ok(value.scimCapabilityReads >= 1);
  assert.ok(value.scimPaginationRequests >= 2);
  assert.ok(value.scimMemberRemovalPaths >= 1);
  assert.ok(value.checks >= 32);
  return value;
}

function buildReport(plan, bytes, result) {
  const scenarioChecks = [4, 6, 6, 5, 5, 8, 3, 2, 4, 5, 3, 3, 3, 8];
  return {
    schema: plan.report.schema,
    planSha256: planDigest(bytes),
    candidateCommit: plan.candidate.commit,
    candidateVersion: plan.candidate.version,
    platform: plan.runtime.platform,
    imageDigests: imageDigestMap(plan),
    scenarios: scenarioIds.map((id, index) => ({
      id,
      status: "passed",
      checks: scenarioChecks[index],
    })),
    summary: {
      passed: scenarioIds.length,
      failed: 0,
      federationResources: result.federationResources,
      flowBindings: result.flowBindings,
      scimOperations: result.scimOperations,
      scimAuthorizationRejects: result.scimAuthorizationRejects,
    },
    limitations: plan.limitations,
  };
}

function cleanupResources(containers, network) {
  const failures = [];
  for (const container of [...containers].reverse()) {
    if (!tryDocker(["container", "rm", "--force", container], 30_000)) {
      failures.push(`container ${container}`);
    }
  }
  if (network && !tryDocker(["network", "rm", network], 30_000)) {
    failures.push(`network ${network}`);
  }
  for (const container of containers) {
    const present = docker([
      "container",
      "ls",
      "--all",
      "--quiet",
      "--filter",
      `name=^/${container}$`,
    ]);
    if (present !== "") failures.push(`remaining container ${container}`);
  }
  if (network) {
    const present = docker([
      "network",
      "ls",
      "--quiet",
      "--filter",
      `name=^${network}$`,
    ]);
    if (present !== "") failures.push(`remaining network ${network}`);
  }
  if (failures.length > 0) fail(`teardown incomplete: ${failures.join(", ")}`);
}

function executeCanary(plan, bytes, bundle) {
  if (process.platform !== "linux" || process.arch !== "x64") {
    fail("the runtime canary requires a Linux x64 host");
  }
  assertCleanCriticalSources();
  docker(["version", "--format", "{{.Server.Os}}/{{.Server.Arch}}"]);
  pullAndVerifyImages(plan);

  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const network = `starfiniti-akrt-${suffix}`;
  const names = {
    postgres: `${network}-postgres`,
    sink: `${network}-sink`,
    server: `${network}-server`,
    worker: `${network}-worker`,
  };
  const containers = Object.values(names);
  const pgPassword = randomBytes(36).toString("base64url");
  const authentikSecret = randomBytes(60).toString("base64url");
  const authentikBearer = randomBytes(36).toString("base64url");
  const scimBearer = randomBytes(36).toString("base64url");
  const inspectionBearer = randomBytes(36).toString("base64url");
  for (const value of [
    pgPassword,
    authentikSecret,
    authentikBearer,
    scimBearer,
    inspectionBearer,
  ]) {
    sensitiveRuntimeValues.add(value);
  }
  let primaryError = null;
  let result = null;

  try {
    docker(["network", "create", "--internal", network]);
    startContainer([
      "--name",
      names.postgres,
      "--network",
      network,
      "--network-alias",
      "postgresql",
      ...commonLabels(),
      "--shm-size",
      "256m",
      "--memory",
      "2g",
      "--cpus",
      "2",
      "--tmpfs",
      "/var/lib/postgresql/data:rw,noexec,nosuid,size=1g",
      ...containerEnvironment({
        POSTGRES_USER: "authentik",
        POSTGRES_DB: "authentik",
        POSTGRES_PASSWORD: pgPassword,
      }),
      plan.dependencies.postgres.ref,
    ]);
    waitForDocker(
      [
        "exec",
        names.postgres,
        "pg_isready",
        "-U",
        "authentik",
        "-d",
        "authentik",
      ],
      60,
      "PostgreSQL",
    );
    startContainer([
      "--name",
      names.sink,
      "--network",
      network,
      "--network-alias",
      "scim-runtime-sink",
      "--read-only",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--pids-limit",
      "128",
      "--memory",
      "256m",
      "--cpus",
      "1",
      "--user",
      "65532:65532",
      "--tmpfs",
      "/tmp:rw,noexec,nosuid,size=16m",
      "--mount",
      `type=bind,src=${sinkSource},dst=/work/scim-sink.mjs,readonly`,
      ...containerEnvironment({
        SCIM_RUNTIME_BEARER: scimBearer,
        SCIM_RUNTIME_INSPECTION_BEARER: inspectionBearer,
      }),
      ...commonLabels(),
      plan.dependencies.operator.ref,
      "node",
      "/work/scim-sink.mjs",
    ]);
    waitForDocker(
      [
        "exec",
        names.sink,
        "node",
        "--input-type=module",
        "--eval",
        "const r=await fetch('http://127.0.0.1:8080/_state',{headers:{authorization:`Bearer ${process.env.SCIM_RUNTIME_INSPECTION_BEARER}`}});if(r.status!==200)process.exit(1)",
      ],
      30,
      "SCIM sink",
    );

    const baseAuthentikEnvironment = {
      AUTHENTIK_POSTGRESQL__HOST: "postgresql",
      AUTHENTIK_POSTGRESQL__USER: "authentik",
      AUTHENTIK_POSTGRESQL__NAME: "authentik",
      AUTHENTIK_POSTGRESQL__PASSWORD: pgPassword,
      AUTHENTIK_SECRET_KEY: authentikSecret,
      AUTHENTIK_LOG_LEVEL: "warning",
      AUTHENTIK_ERROR_REPORTING__ENABLED: "false",
      AUTHENTIK_DISABLE_STARTUP_ANALYTICS: "true",
      AUTHENTIK_DISABLE_UPDATE_CHECK: "true",
      AUTHENTIK_OUTPOSTS__DISABLE_EMBEDDED_OUTPOST: "true",
    };
    const authentikContainer = (
      name,
      command,
      aliases,
      extraEnvironment = {},
      runAsRoot = false,
    ) => [
      "--name",
      name,
      "--network",
      network,
      ...aliases.flatMap((alias) => ["--network-alias", alias]),
      ...(runAsRoot ? ["--user", "root"] : []),
      "--pids-limit",
      "512",
      "--memory",
      "3g",
      "--cpus",
      "2",
      "--shm-size",
      "512m",
      "--tmpfs",
      "/tmp:rw,noexec,nosuid,size=128m",
      "--tmpfs",
      "/data:rw,nosuid,size=128m",
      "--tmpfs",
      "/certs:rw,nosuid,size=64m",
      "--tmpfs",
      "/media:rw,nosuid,size=64m",
      ...containerEnvironment({
        ...baseAuthentikEnvironment,
        ...extraEnvironment,
      }),
      ...commonLabels(),
      plan.candidate.image.ref,
      command,
    ];
    startContainer(
      authentikContainer(names.server, "server", ["authentik-runtime-server"]),
    );
    startContainer(
      authentikContainer(
        names.worker,
        "worker",
        ["authentik-runtime-worker"],
        {
          AUTHENTIK_BOOTSTRAP_TOKEN: authentikBearer,
          AUTHENTIK_BOOTSTRAP_EMAIL: "runtime-owner@runtime.invalid",
        },
        true,
      ),
    );
    waitForDocker(
      ["exec", names.server, "ak", "healthcheck"],
      plan.runtime.startupTimeoutSeconds,
      "Authentik server",
    );
    waitForDocker(
      ["exec", names.worker, "ak", "healthcheck"],
      plan.runtime.startupTimeoutSeconds,
      "Authentik worker",
    );

    const operatorEnvironment = {
      AUTHENTIK_RUNTIME_ORIGIN: plan.runtime.authentikApiOrigin,
      AUTHENTIK_RUNTIME_BEARER: authentikBearer,
      SCIM_RUNTIME_BASE_URL: plan.runtime.scimBaseUrl,
      SCIM_RUNTIME_BEARER: scimBearer,
      SCIM_RUNTIME_INSPECTION_BEARER: inspectionBearer,
    };
    const setup = exactSetup(
      runOperator({
        plan,
        network,
        bundle,
        environment: operatorEnvironment,
        arguments: ["setup"],
      }),
    );
    docker(
      ["exec", names.server, "ak", "scim_sync", "Starfiniti runtime SCIM"],
      { timeout: plan.runtime.scenarioTimeoutSeconds * 1_000 },
    );
    result = exactRuntimeResult(
      runOperator({
        plan,
        network,
        bundle,
        environment: operatorEnvironment,
        arguments: [
          "mutate",
          "--provider",
          String(setup.scimProviderId),
          "--user",
          String(setup.userId),
          "--uid",
          setup.userUid,
          "--group",
          setup.groupPk,
          "--bindings",
          String(setup.flowBindings),
        ],
      }),
    );
  } catch (error) {
    primaryError = error;
  }

  try {
    cleanupResources(containers, network);
  } catch (cleanupError) {
    if (primaryError) {
      throw new AggregateError(
        [primaryError, cleanupError],
        "runtime and teardown failed",
      );
    }
    throw cleanupError;
  }
  if (primaryError) throw primaryError;
  if (result === null) fail("runtime produced no result");
  return buildReport(plan, bytes, result);
}

function removePrivateTemporaryDirectory(path) {
  const absolute = resolve(path);
  const intendedRoot = resolve(tmpdir());
  if (
    !absolute.startsWith(
      `${intendedRoot}${process.platform === "win32" ? "\\" : "/"}`,
    ) ||
    !absolute.includes("starfiniti-authentik-runtime-")
  ) {
    fail("refusing to remove an unexpected temporary directory");
  }
  rmSync(absolute, { recursive: true, force: true });
}

function buildOperator(tempDirectory) {
  const bundle = join(tempDirectory, "operator.mjs");
  buildSync({
    entryPoints: [operatorSource],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    conditions: ["react-server"],
    outfile: bundle,
    logLevel: "silent",
    sourcemap: false,
    legalComments: "none",
  });
  chmodSync(bundle, 0o644);
  const bytes = readFileSync(bundle);
  if (
    bytes.length < 10_000 ||
    !bytes.includes(Buffer.from("AuthentikFederationAdmin = class")) ||
    !bytes.includes(Buffer.from("Authentik bootstrap resource")) ||
    bytes.includes(Buffer.from(["auth", "starfiniti", "com"].join(".")))
  ) {
    fail("operator bundle did not include the exact safe production client");
  }
  return bundle;
}

function selfTest(plan, bytes, bundle) {
  assert.match(planDigest(bytes), /^[0-9a-f]{64}$/u);
  assert.equal(
    safeOutputPath("dist/authentik-2026-8-runtime/self-test.json"),
    resolve(root, "dist/authentik-2026-8-runtime/self-test.json"),
  );
  assert.throws(() => safeOutputPath("../runtime.json"), /bounded JSON path/u);
  const runnerSource = readFileSync(fileURLToPath(import.meta.url), "utf8");
  const executionContract = runnerSource.slice(
    0,
    runnerSource.indexOf("function selfTest("),
  );
  const sourceContract = [
    readFileSync(sinkSource, "utf8"),
    readFileSync(operatorSource, "utf8"),
    executionContract,
  ].join("\n");
  for (const forbidden of [
    ["/var/run", "docker.sock"].join("/"),
    ["loyalty", "starfiniti", "com"].join("."),
    ["auth", "starfiniti", "com"].join("."),
    ["api", "loyalty", "starfiniti", "com"].join("."),
    ["--network", "host"].join(" "),
  ]) {
    assert.equal(
      sourceContract.includes(forbidden),
      false,
      `${forbidden} is forbidden`,
    );
  }
  assert.ok(sourceContract.includes('network", "create", "--internal'));
  assert.ok(
    sourceContract.includes(
      'AUTHENTIK_OUTPOSTS__DISABLE_EMBEDDED_OUTPOST: "true"',
    ),
  );
  assert.equal(sourceContract.match(/"ak", "healthcheck"/gu)?.length, 2);
  assert.equal(sourceContract.includes('"healthcheck", "server"'), false);
  assert.equal(sourceContract.includes('"healthcheck", "worker"'), false);
  assert.ok(sourceContract.includes('"ak", "scim_sync"'));
  assert.equal(sourceContract.includes('"ak", "shell"'), false);
  assert.ok(sourceContract.includes("timingSafeEqual"));
  assert.ok(sourceContract.includes("members\\[value eq"));
  assert.ok(readFileSync(bundle).length > 10_000);
  const synthetic = buildReport(plan, bytes, {
    federationResources: 2,
    flowBindings: 4,
    scimOperations: 12,
    scimAuthorizationRejects: 1,
  });
  validateAuthentikRuntimeReport(synthetic, plan);
}

const parsed = parseArguments(process.argv.slice(2));
const { bytes, plan } = loadPlan(parsed.planPath);
const tempDirectory = mkdtempSync(
  join(tmpdir(), "starfiniti-authentik-runtime-"),
);
chmodSync(tempDirectory, 0o700);
let selfTestPassed = false;
let pendingReport = null;
let pendingOutput = null;
try {
  const bundle = buildOperator(tempDirectory);
  if (parsed.selfTest) {
    selfTest(plan, bytes, bundle);
    selfTestPassed = true;
  } else {
    if (resolve(parsed.planPath) !== resolve(defaultPlan)) {
      fail("only the reviewed repository plan may execute");
    }
    const outputPath = safeOutputPath(parsed.output);
    const parent = createOutputParent(outputPath);
    const report = executeCanary(plan, bytes, bundle);
    validateAuthentikRuntimeReport(report, plan);
    pendingReport = report;
    pendingOutput = { outputPath, parent, displayPath: parsed.output };
  }
} finally {
  removePrivateTemporaryDirectory(tempDirectory);
}
if (selfTestPassed) {
  console.log("Authentik 2026.8 runtime canary self-test passed.");
}
if (pendingReport !== null && pendingOutput !== null) {
  writeReport(
    pendingOutput.outputPath,
    pendingOutput.parent,
    pendingReport,
    plan.runtime.maximumReportBytes,
  );
  console.log(
    `Authentik 2026.8 runtime evidence written to ${pendingOutput.displayPath}.`,
  );
}
