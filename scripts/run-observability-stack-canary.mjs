import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  realpathSync,
  rmSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const composeFile = join(root, "infrastructure/observability/compose.yml");
const alertmanagerConfig = join(
  root,
  "infrastructure/observability/alertmanager/safe-default.yml",
);
const postgresConfig = join(
  root,
  "infrastructure/observability/postgres-exporter/safe-default.yml",
);
const plan = YAML.parse(
  await import("node:fs").then(({ readFileSync }) =>
    readFileSync(
      join(root, "infrastructure/observability/deployment/plan.yaml"),
      "utf8",
    ),
  ),
);
const safeOutputPattern =
  /^dist\/observability-deployment\/[a-z0-9][a-z0-9._-]{1,79}\.json$/u;
const expectedComponentVersions = {
  prometheus: "3.14.0",
  alertmanager: "0.34.0",
  grafana: "13.2.0",
  blackboxExporter: "0.28.0",
  postgresExporter: "0.20.1",
};
const expectedImageIndexes = Object.fromEntries(
  plan.components.map((component) => [component.id, component.imageIndex]),
);

function fail(message) {
  throw new Error(`Observability deployment canary failed: ${message}`);
}

function parseArguments(argv) {
  if (argv.length === 1 && argv[0] === "--self-test") {
    return { selfTest: true };
  }
  const parsed = { selfTest: false };
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option !== "--out") fail(`unknown option ${option}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) fail("--out requires a value");
    if (parsed.out) fail("--out was provided twice");
    parsed.out = value;
    index += 1;
  }
  if (!parsed.out) fail("--out is required");
  return parsed;
}

function safeOutputPath(value) {
  const normalized = value.replaceAll("\\", "/");
  if (isAbsolute(value) || !safeOutputPattern.test(normalized)) {
    fail(
      "output must be a bounded JSON path under dist/observability-deployment",
    );
  }
  return resolve(root, normalized);
}

function ensureOutputParent(outputPath) {
  const base = join(root, "dist");
  const parent = dirname(outputPath);
  mkdirSync(base, { recursive: true });
  const baseStatus = lstatSync(base);
  if (
    !baseStatus.isDirectory() ||
    resolve(realpathSync(base)) !== resolve(base)
  ) {
    fail("output base must be a canonical directory without symbolic links");
  }
  try {
    mkdirSync(parent, { mode: 0o700 });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  const status = lstatSync(parent);
  if (
    !status.isDirectory() ||
    resolve(realpathSync(parent)) !== resolve(parent)
  ) {
    fail("output parent must be a canonical directory without symbolic links");
  }
  return { path: parent, dev: status.dev, ino: status.ino };
}

function writeReport(outputPath, parentIdentity, report) {
  const bytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`, "utf8");
  let descriptor;
  let identity;
  let complete = false;
  try {
    const parentStatus = lstatSync(parentIdentity.path);
    if (
      !parentStatus.isDirectory() ||
      parentStatus.dev !== parentIdentity.dev ||
      parentStatus.ino !== parentIdentity.ino
    ) {
      fail("output parent identity changed");
    }
    descriptor = openSync(
      outputPath,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    const opened = fstatSync(descriptor);
    if (!opened.isFile()) fail("output is not a regular file");
    identity = { dev: opened.dev, ino: opened.ino };
    let offset = 0;
    while (offset < bytes.length) {
      const count = writeSync(
        descriptor,
        bytes,
        offset,
        bytes.length - offset,
        offset,
      );
      if (count === 0) fail("output write stopped early");
      offset += count;
    }
    fsyncSync(descriptor);
    const written = fstatSync(descriptor);
    if (
      written.size !== bytes.length ||
      !written.isFile() ||
      (process.platform !== "win32" && (written.mode & 0o777) !== 0o600)
    ) {
      fail("output permissions or length differ");
    }
    closeSync(descriptor);
    descriptor = undefined;
    const finalFile = lstatSync(outputPath);
    const finalParent = lstatSync(parentIdentity.path);
    if (
      !finalFile.isFile() ||
      finalFile.dev !== written.dev ||
      finalFile.ino !== written.ino ||
      finalParent.dev !== parentIdentity.dev ||
      finalParent.ino !== parentIdentity.ino
    ) {
      fail("output identity differs after publication");
    }
    complete = true;
  } catch (error) {
    if (error?.code === "EEXIST") fail("output already exists");
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (!complete && identity && existsSync(outputPath)) {
      const status = lstatSync(outputPath);
      if (
        status.isFile() &&
        status.dev === identity.dev &&
        status.ino === identity.ino
      ) {
        unlinkSync(outputPath);
      }
    }
  }
}

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      cwd: root,
      env: options.env ?? process.env,
      encoding: "utf8",
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
      timeout: options.timeout ?? 180_000,
      windowsHide: true,
    })?.trim();
  } catch (error) {
    const detail =
      typeof error?.stderr === "string"
        ? error.stderr.replaceAll(/[\r\n]+/gu, " ").slice(0, 500)
        : `${command} failed`;
    fail(detail);
  }
}

function compose(project, environment, args, options = {}) {
  return run(
    "docker",
    ["compose", "--project-name", project, "--file", composeFile, ...args],
    { ...options, env: environment },
  );
}

async function waitForJson(url, validator, label, diagnostics) {
  let lastResult = "no HTTP response";
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "error",
        signal: AbortSignal.timeout(2_000),
      });
      lastResult = `HTTP ${response.status}`;
      if (response.ok) {
        const body = await response.json();
        const value = validator(body);
        if (value) return value;
        lastResult = `HTTP ${response.status} returned JSON outside the exact-version contract`;
      }
    } catch (error) {
      const code = error?.cause?.code;
      lastResult =
        typeof code === "string" && /^[A-Z0-9_]{2,40}$/u.test(code)
          ? code
          : "request failed";
      // Startup is bounded by the loop below.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_000));
  }
  const detail = diagnostics()
    .replaceAll(/[\r\n]+/gu, " ")
    .slice(0, 3_000);
  fail(
    `${label} did not become healthy with the exact version (${lastResult}; ${detail})`,
  );
}

function serviceDiagnostics(project, environment, service) {
  const status = compose(
    project,
    environment,
    ["ps", "--all", "--format", "json", service],
    { capture: true },
  );
  const logs = compose(
    project,
    environment,
    ["logs", "--no-color", "--tail", "40", service],
    { capture: true },
  );
  return `container=${status || "missing"}; logs=${logs || "empty"}`;
}

function containerInspection(project, environment, service) {
  const id = compose(project, environment, ["ps", "--quiet", service], {
    capture: true,
  });
  if (!/^[0-9a-f]{64}$/u.test(id)) fail(`${service} container id is invalid`);
  const inspected = JSON.parse(
    run("docker", ["inspect", id], { capture: true }),
  )[0];
  return {
    configImage: inspected.Config.Image,
    portBindings: inspected.HostConfig.PortBindings ?? {},
    networks: Object.keys(inspected.NetworkSettings.Networks ?? {}).sort(),
    privileged: inspected.HostConfig.Privileged,
    readonlyRootfs: inspected.HostConfig.ReadonlyRootfs,
    capDrop: inspected.HostConfig.CapDrop,
    securityOpt: inspected.HostConfig.SecurityOpt,
  };
}

function verifyInspection(project, inspection, component) {
  const expected = plan.components.find((item) => item.id === component);
  if (
    inspection.configImage !==
      `${expected.repository}@${expected.imageIndex}` ||
    inspection.privileged !== false ||
    inspection.readonlyRootfs !== true ||
    inspection.capDrop?.length !== 1 ||
    inspection.capDrop[0] !== "ALL" ||
    !inspection.securityOpt?.includes("no-new-privileges:true")
  ) {
    fail(`${component} runtime identity or hardening differs`);
  }
  const expectedNetworks =
    component === "grafana"
      ? [`${project}_monitoring-control`]
      : [
          `${project}_monitoring-control`,
          `${project}_monitoring-egress`,
        ].sort();
  if (
    inspection.networks.length !== expectedNetworks.length ||
    inspection.networks.some(
      (network, index) => network !== expectedNetworks[index],
    )
  ) {
    fail(`${component} runtime network set differs`);
  }
}

function assertLoopbackPort(inspection, containerPort, label) {
  const bindings = inspection.portBindings[`${containerPort}/tcp`];
  if (
    !Array.isArray(bindings) ||
    bindings.length !== 1 ||
    bindings[0].HostIp !== "127.0.0.1" ||
    !/^\d{4,5}$/u.test(bindings[0].HostPort)
  ) {
    fail(`${label} is not published exactly on loopback`);
  }
}

function assertNoPublishedPort(inspection, label) {
  if (
    Object.values(inspection.portBindings).some(
      (bindings) => Array.isArray(bindings) && bindings.length > 0,
    )
  ) {
    fail(`${label} published a host port`);
  }
}

function exactKeys(value, expected, label) {
  const actual = Object.keys(value ?? {}).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    fail(`${label} keys differ`);
  }
}

function validateReport(report, candidateCommit) {
  exactKeys(
    report,
    [
      "schema",
      "status",
      "candidateCommit",
      "platform",
      "componentVersions",
      "imageIndexes",
      "configChecks",
      "administrationLoopbackOnly",
      "exporterPortsUnpublished",
      "readOnlyRoots",
      "capabilitiesDropped",
      "noNewPrivileges",
      "separateControlAndEgressNetworks",
      "productionRoute",
      "realCredential",
      "rawTargetRetained",
      "teardown",
    ],
    "report",
  );
  exactKeys(report.platform, ["os", "architecture"], "report platform");
  exactKeys(
    report.componentVersions,
    Object.keys(expectedComponentVersions),
    "report component versions",
  );
  exactKeys(
    report.imageIndexes,
    Object.keys(expectedImageIndexes),
    "report image indexes",
  );
  exactKeys(
    report.configChecks,
    ["compose", "prometheus", "alertmanager"],
    "report configuration checks",
  );
  if (
    report.schema !== "starfiniti.observability-deployment-canary.v1" ||
    report.status !== "passed" ||
    report.candidateCommit !== candidateCommit ||
    report.platform.os !== "linux" ||
    report.platform.architecture !== "amd64" ||
    JSON.stringify(report.componentVersions) !==
      JSON.stringify(expectedComponentVersions) ||
    JSON.stringify(report.imageIndexes) !==
      JSON.stringify(expectedImageIndexes) ||
    Object.values(report.configChecks).some((value) => value !== true) ||
    report.administrationLoopbackOnly !== true ||
    report.exporterPortsUnpublished !== true ||
    report.readOnlyRoots !== true ||
    report.capabilitiesDropped !== true ||
    report.noNewPrivileges !== true ||
    report.separateControlAndEgressNetworks !== true ||
    report.productionRoute !== false ||
    report.realCredential !== false ||
    report.rawTargetRetained !== false ||
    report.teardown !== true
  ) {
    fail("report content or false-authority boundary differs");
  }
}

function zeroResidue(project) {
  const selectors = [
    [
      "ps",
      "--all",
      "--quiet",
      "--filter",
      `label=com.docker.compose.project=${project}`,
    ],
    [
      "network",
      "ls",
      "--quiet",
      "--filter",
      `label=com.docker.compose.project=${project}`,
    ],
    [
      "volume",
      "ls",
      "--quiet",
      "--filter",
      `label=com.docker.compose.project=${project}`,
    ],
  ];
  return selectors.every(
    (args) => run("docker", args, { capture: true }).trim() === "",
  );
}

const parsed = parseArguments(process.argv.slice(2));
if (parsed.selfTest) {
  assert.throws(() => parseArguments([]), /--out is required/u);
  assert.throws(() => safeOutputPath("../outside.json"), /bounded JSON path/u);
  assert.throws(
    () => safeOutputPath("dist/observability-deployment/report.txt"),
    /bounded JSON path/u,
  );
  const candidate = "a".repeat(40);
  const validReport = {
    schema: "starfiniti.observability-deployment-canary.v1",
    status: "passed",
    candidateCommit: candidate,
    platform: { os: "linux", architecture: "amd64" },
    componentVersions: expectedComponentVersions,
    imageIndexes: expectedImageIndexes,
    configChecks: { compose: true, prometheus: true, alertmanager: true },
    administrationLoopbackOnly: true,
    exporterPortsUnpublished: true,
    readOnlyRoots: true,
    capabilitiesDropped: true,
    noNewPrivileges: true,
    separateControlAndEgressNetworks: true,
    productionRoute: false,
    realCredential: false,
    rawTargetRetained: false,
    teardown: true,
  };
  validateReport(validReport, candidate);
  assert.throws(
    () => validateReport({ ...validReport, productionRoute: true }, candidate),
    /false-authority/u,
  );
  assert.throws(
    () => validateReport({ ...validReport, target: "private" }, candidate),
    /report keys/u,
  );
  console.log(
    "Validated observability canary arguments, minimized report, false-authority, and output boundaries.",
  );
  process.exit(0);
}

if (process.platform !== "linux" || process.arch !== "x64") {
  fail("runtime canary requires Linux amd64");
}
if (run("git", ["status", "--porcelain"], { capture: true }) !== "") {
  fail("runtime canary requires a clean exact commit");
}
const candidateCommit = run("git", ["rev-parse", "HEAD"], { capture: true });
if (!/^[0-9a-f]{40}$/u.test(candidateCommit))
  fail("candidate commit is invalid");

const outputPath = safeOutputPath(parsed.out);
const parentIdentity = ensureOutputParent(outputPath);
const temporary = mkdtempSync(join(tmpdir(), "starfiniti-observability-"));
chmodSync(temporary, 0o700);
const targets = join(temporary, "targets");
mkdirSync(targets, { mode: 0o700 });
const adminPassword = join(temporary, "grafana-admin-password");
writeFileSync(adminPassword, `${randomBytes(32).toString("base64url")}\n`, {
  mode: 0o600,
  flag: "wx",
});
const project = `starfiniti-observability-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const ports = {
  prometheus: "19090",
  alertmanager: "19093",
};
const environment = {
  ...process.env,
  STARFINITI_MONITORING_BIND_ADDRESS: "127.0.0.1",
  STARFINITI_PROMETHEUS_PORT: ports.prometheus,
  STARFINITI_ALERTMANAGER_PORT: ports.alertmanager,
  STARFINITI_GRAFANA_ROOT_URL: "https://grafana.example.invalid",
  STARFINITI_PROMETHEUS_TARGETS_DIR: targets,
  STARFINITI_ALERTMANAGER_CONFIG: alertmanagerConfig,
  STARFINITI_GRAFANA_ADMIN_PASSWORD_FILE: adminPassword,
  STARFINITI_POSTGRES_EXPORTER_CONFIG: postgresConfig,
};

let composeTouched = false;
let teardownPassed = false;
let report;
try {
  run("node", ["scripts/validate-observability-deployment.mjs"], {
    env: environment,
  });
  compose(project, environment, ["config", "--quiet"]);
  compose(project, environment, ["pull"], { timeout: 600_000 });
  composeTouched = true;
  compose(project, environment, [
    "run",
    "--rm",
    "--no-deps",
    "--entrypoint",
    "/bin/promtool",
    "prometheus",
    "check",
    "config",
    "/etc/prometheus/prometheus.yml",
  ]);
  compose(project, environment, [
    "run",
    "--rm",
    "--no-deps",
    "--entrypoint",
    "/bin/amtool",
    "alertmanager",
    "check-config",
    "/etc/alertmanager/alertmanager.yml",
  ]);
  compose(project, environment, ["up", "--detach"], { timeout: 300_000 });

  const versions = {
    prometheus: await waitForJson(
      `http://127.0.0.1:${ports.prometheus}/api/v1/status/buildinfo`,
      (body) => body?.data?.version === "3.14.0" && body.data.version,
      "Prometheus",
      () => serviceDiagnostics(project, environment, "prometheus"),
    ),
    alertmanager: await waitForJson(
      `http://127.0.0.1:${ports.alertmanager}/api/v2/status`,
      (body) =>
        body?.versionInfo?.version === "0.34.0" && body.versionInfo.version,
      "Alertmanager",
      () => serviceDiagnostics(project, environment, "alertmanager"),
    ),
    grafana: await waitForJson(
      `http://127.0.0.1:${ports.prometheus}/api/v1/query?query=grafana_build_info`,
      (body) =>
        body?.data?.result?.length === 1 &&
        body.data.result[0]?.metric?.version === "13.2.0" &&
        body.data.result[0].metric.version,
      "Grafana",
      () => serviceDiagnostics(project, environment, "grafana"),
    ),
    blackboxExporter: await waitForJson(
      `http://127.0.0.1:${ports.prometheus}/api/v1/query?query=blackbox_exporter_build_info`,
      (body) =>
        body?.data?.result?.length === 1 &&
        body.data.result[0]?.metric?.version === "0.28.0" &&
        body.data.result[0].metric.version,
      "blackbox exporter",
      () => serviceDiagnostics(project, environment, "blackbox-exporter"),
    ),
    postgresExporter: await waitForJson(
      `http://127.0.0.1:${ports.prometheus}/api/v1/query?query=postgres_exporter_build_info`,
      (body) =>
        body?.data?.result?.length === 1 &&
        body.data.result[0]?.metric?.version === "0.20.1" &&
        body.data.result[0].metric.version,
      "PostgreSQL exporter",
      () => serviceDiagnostics(project, environment, "postgres-exporter"),
    ),
  };

  const inspections = Object.fromEntries(
    plan.components.map((component) => [
      component.id,
      containerInspection(project, environment, component.id),
    ]),
  );
  for (const component of plan.components) {
    verifyInspection(project, inspections[component.id], component.id);
  }
  assertLoopbackPort(inspections.prometheus, 9090, "Prometheus");
  assertLoopbackPort(inspections.alertmanager, 9093, "Alertmanager");
  assertNoPublishedPort(inspections.grafana, "Grafana");
  assertNoPublishedPort(inspections["blackbox-exporter"], "blackbox exporter");
  assertNoPublishedPort(
    inspections["postgres-exporter"],
    "PostgreSQL exporter",
  );

  for (const component of ["blackbox-exporter", "postgres-exporter"]) {
    const state = JSON.parse(
      run(
        "docker",
        [
          "inspect",
          "--format",
          "{{json .State}}",
          compose(project, environment, ["ps", "--quiet", component], {
            capture: true,
          }),
        ],
        { capture: true },
      ),
    );
    if (state.Running !== true || state.ExitCode !== 0) {
      fail(`${component} did not remain running`);
    }
  }

  report = {
    schema: "starfiniti.observability-deployment-canary.v1",
    status: "passed",
    candidateCommit,
    platform: { os: "linux", architecture: "amd64" },
    componentVersions: versions,
    imageIndexes: expectedImageIndexes,
    configChecks: { compose: true, prometheus: true, alertmanager: true },
    administrationLoopbackOnly: true,
    exporterPortsUnpublished: true,
    readOnlyRoots: true,
    capabilitiesDropped: true,
    noNewPrivileges: true,
    separateControlAndEgressNetworks: true,
    productionRoute: false,
    realCredential: false,
    rawTargetRetained: false,
    teardown: false,
  };
} finally {
  if (composeTouched) {
    try {
      compose(project, environment, ["down", "--volumes", "--remove-orphans"], {
        timeout: 180_000,
      });
    } catch {
      // The zero-residue assertion below remains authoritative.
    }
  }
  rmSync(temporary, { recursive: true, force: true });
  teardownPassed = zeroResidue(project);
}

if (!teardownPassed || !report)
  fail("exact teardown or report creation failed");
report.teardown = true;
validateReport(report, candidateCommit);
writeReport(outputPath, parentIdentity, report);
console.log(
  `Observability deployment canary passed for ${plan.components.length} exact services with loopback-only administration, unpublished exporters, and zero residue.`,
);
