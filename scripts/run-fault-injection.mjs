import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { performance } from "node:perf_hooks";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import YAML from "yaml";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sha256Pattern = /^[0-9a-f]{64}$/u;
const commitPattern = /^[0-9a-f]{40}$/u;
const safeTokenPattern = /^[a-z][a-zA-Z0-9_-]{1,63}$/u;
const exactScenarioAdapters = new Map([
  ["worker_sigkill", "docker_service_sigkill"],
  ["database_crash_restart", "docker_service_sigkill"],
  ["network_latency", "toxiproxy_latency"],
  ["duplicate_delivery", "duplicate_http_replay"],
  ["provider_outage", "toxiproxy_disable"],
  ["retry_storm", "toxiproxy_disable_with_replay"],
]);

function fail(message) {
  throw new Error(`Fault runner failed: ${message}`);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalJson(value[key])]),
    );
  }
  return value;
}

export function documentDigest(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalJson(value)))
    .digest("hex");
}

function rawDigest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(`${label} has an unexpected shape`);
  }
}

function boundedNumber(value, label, minimum, maximum, integer = false) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum ||
    (integer && !Number.isSafeInteger(value))
  ) {
    fail(`${label} is outside its safety bound`);
  }
  return value;
}

function exactUtc(value, label) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    fail(`${label} must be an exact UTC timestamp`);
  }
}

function isWithin(parent, child) {
  const resolvedParent = resolve(parent);
  const resolvedChild = resolve(child);
  return (
    resolvedChild !== resolvedParent &&
    resolvedChild.startsWith(`${resolvedParent}${sep}`)
  );
}

function readRegularFile(path, label, maximumBytes, ownerOnly = false) {
  if (!isAbsolute(path)) fail(`${label} path must be absolute`);
  let descriptor;
  let initial;
  let raw;
  try {
    descriptor = openSync(
      path,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    initial = fstatSync(descriptor);
    const link = lstatSync(path);
    if (
      !initial.isFile() ||
      !link.isFile() ||
      initial.dev !== link.dev ||
      initial.ino !== link.ino ||
      initial.size < 1 ||
      initial.size > maximumBytes
    ) {
      fail(`${label} must be a bounded stable file`);
    }
    const buffer = Buffer.alloc(initial.size);
    let offset = 0;
    while (offset < buffer.length) {
      const count = readSync(
        descriptor,
        buffer,
        offset,
        buffer.length - offset,
        offset,
      );
      if (count === 0) fail(`${label} changed while reading`);
      offset += count;
    }
    const final = fstatSync(descriptor);
    const finalLink = lstatSync(path);
    if (
      final.dev !== initial.dev ||
      final.ino !== initial.ino ||
      final.size !== initial.size ||
      final.mtimeMs !== initial.mtimeMs ||
      final.ctimeMs !== initial.ctimeMs ||
      finalLink.dev !== initial.dev ||
      finalLink.ino !== initial.ino
    ) {
      fail(`${label} changed while reading`);
    }
    raw = buffer.toString("utf8");
  } catch {
    fail(`${label} is unreadable`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  if (Buffer.byteLength(raw, "utf8") !== initial.size) {
    fail(`${label} must contain valid UTF-8 text`);
  }
  if (
    ownerOnly &&
    process.platform !== "win32" &&
    (initial.mode & 0o077) !== 0
  ) {
    fail(`${label} must not grant group or other access`);
  }
  return raw;
}

function repositoryState({ allowDirty = false } = {}) {
  try {
    const commit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const dirty =
      execFileSync(
        "git",
        ["status", "--porcelain", "--untracked-files=normal"],
        {
          cwd: root,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        },
      ).trim().length > 0;
    if (!commitPattern.test(commit)) fail("repository commit is not exact");
    if (dirty && !allowDirty)
      fail("fault runs require a clean repository worktree");
    return { commit, dirty };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Fault runner")) {
      throw error;
    }
    fail("repository commit and worktree state are unavailable");
  }
}

export function validateFaultPlan(plan) {
  exactKeys(
    plan,
    ["schema", "status", "profile", "bounds", "probes", "scenarios"],
    "plan",
  );
  if (
    plan.schema !== "starfiniti.fault-plan.v1" ||
    plan.status !== "candidate" ||
    !/^[a-z][a-z0-9-]{2,79}$/u.test(plan.profile)
  ) {
    fail("plan identity is invalid");
  }
  exactKeys(
    plan.bounds,
    [
      "maximumScenarioSeconds",
      "maximumRecoverySeconds",
      "maximumReplayRequests",
      "maximumReplayRatePerSecond",
      "maximumConcurrency",
      "maximumResponseBytes",
    ],
    "plan bounds",
  );
  boundedNumber(
    plan.bounds.maximumScenarioSeconds,
    "maximum scenario seconds",
    1,
    300,
    true,
  );
  boundedNumber(
    plan.bounds.maximumRecoverySeconds,
    "maximum recovery seconds",
    1,
    600,
    true,
  );
  boundedNumber(
    plan.bounds.maximumReplayRequests,
    "maximum replay requests",
    2,
    2_000,
    true,
  );
  boundedNumber(
    plan.bounds.maximumReplayRatePerSecond,
    "maximum replay rate",
    1,
    50,
  );
  boundedNumber(
    plan.bounds.maximumConcurrency,
    "maximum replay concurrency",
    1,
    16,
    true,
  );
  boundedNumber(
    plan.bounds.maximumResponseBytes,
    "maximum response bytes",
    1_024,
    65_536,
    true,
  );
  if (!Array.isArray(plan.probes) || plan.probes.length !== 2) {
    fail("plan must contain the two canonical public probes");
  }
  const probeIds = new Set();
  for (const probe of plan.probes) {
    exactKeys(
      probe,
      [
        "id",
        "originAlias",
        "path",
        "timeoutMs",
        "expectedStatuses",
        "responseContract",
      ],
      "probe",
    );
    if (
      !safeTokenPattern.test(probe.id) ||
      probeIds.has(probe.id) ||
      !["dashboard", "storefront"].includes(probe.originAlias) ||
      typeof probe.path !== "string" ||
      !probe.path.startsWith("/") ||
      probe.path.includes("?") ||
      probe.path.length > 120 ||
      !["readiness_v1", "html_or_redirect_v1"].includes(probe.responseContract)
    ) {
      fail("probe identity or contract is invalid");
    }
    boundedNumber(probe.timeoutMs, "probe timeout", 100, 30_000, true);
    if (
      !Array.isArray(probe.expectedStatuses) ||
      probe.expectedStatuses.length < 1 ||
      probe.expectedStatuses.length > 3 ||
      probe.expectedStatuses.some(
        (status) =>
          !Number.isSafeInteger(status) || status < 200 || status > 399,
      )
    ) {
      fail("probe expected statuses are invalid");
    }
    probeIds.add(probe.id);
  }
  if (
    !probeIds.has("dashboard_readiness") ||
    !probeIds.has("woocommerce_checkout")
  ) {
    fail("canonical readiness and checkout probes are required");
  }
  if (
    !Array.isArray(plan.scenarios) ||
    plan.scenarios.length !== exactScenarioAdapters.size
  ) {
    fail("plan must contain all six canonical fault scenarios");
  }
  const scenarioIds = new Set();
  let totalFaultSeconds = 0;
  let totalRecoverySeconds = 0;
  let totalReplayRequests = 0;
  for (const scenario of plan.scenarios) {
    const baseKeys = [
      "id",
      "adapter",
      "targetAlias",
      "faultSeconds",
      "recoveryTimeoutSeconds",
      "probeIds",
    ];
    const replayKeys = ["requestCount", "ratePerSecond", "concurrency"];
    const expectedKeys = [...baseKeys];
    if (scenario.adapter === "toxiproxy_latency") {
      expectedKeys.push("latencyMs", "jitterMs");
    }
    if (scenario.adapter === "duplicate_http_replay") {
      expectedKeys.push(...replayKeys);
    }
    if (scenario.adapter === "toxiproxy_disable_with_replay") {
      expectedKeys.push("fixtureAlias", ...replayKeys);
    }
    exactKeys(scenario, expectedKeys, `scenario ${scenario.id ?? "unknown"}`);
    if (
      !exactScenarioAdapters.has(scenario.id) ||
      scenarioIds.has(scenario.id) ||
      exactScenarioAdapters.get(scenario.id) !== scenario.adapter
    ) {
      fail("scenario ID or adapter drifted");
    }
    scenarioIds.add(scenario.id);
    boundedNumber(
      scenario.faultSeconds,
      `${scenario.id} fault duration`,
      0.1,
      plan.bounds.maximumScenarioSeconds,
    );
    boundedNumber(
      scenario.recoveryTimeoutSeconds,
      `${scenario.id} recovery duration`,
      1,
      plan.bounds.maximumRecoverySeconds,
    );
    if (
      !Array.isArray(scenario.probeIds) ||
      scenario.probeIds.length !== probeIds.size ||
      scenario.probeIds.some((id) => !probeIds.has(id)) ||
      new Set(scenario.probeIds).size !== scenario.probeIds.length
    ) {
      fail(`${scenario.id} must run every canonical public probe`);
    }
    if (scenario.adapter === "docker_service_sigkill") {
      const expectedTarget =
        scenario.id === "worker_sigkill" ? "worker" : "database";
      if (scenario.targetAlias !== expectedTarget) {
        fail(`${scenario.id} targets the wrong service alias`);
      }
    } else if (scenario.adapter === "toxiproxy_latency") {
      if (scenario.targetAlias !== "database")
        fail("network latency must target the database proxy");
      boundedNumber(scenario.latencyMs, "network latency", 1, 5_000, true);
      boundedNumber(scenario.jitterMs, "network jitter", 0, 1_000, true);
    } else if (scenario.adapter === "duplicate_http_replay") {
      if (scenario.targetAlias !== "duplicateDelivery")
        fail("duplicate delivery must use its dedicated fixture");
    } else if (
      scenario.targetAlias !== "provider" ||
      (scenario.fixtureAlias !== undefined &&
        scenario.fixtureAlias !== "retryTrigger")
    ) {
      fail(`${scenario.id} targets the wrong provider control`);
    }
    if (replayKeys.some((key) => Object.hasOwn(scenario, key))) {
      boundedNumber(
        scenario.requestCount,
        `${scenario.id} replay count`,
        2,
        plan.bounds.maximumReplayRequests,
        true,
      );
      boundedNumber(
        scenario.ratePerSecond,
        `${scenario.id} replay rate`,
        0.1,
        plan.bounds.maximumReplayRatePerSecond,
      );
      boundedNumber(
        scenario.concurrency,
        `${scenario.id} replay concurrency`,
        1,
        plan.bounds.maximumConcurrency,
        true,
      );
      totalReplayRequests += scenario.requestCount;
    }
    totalFaultSeconds += scenario.faultSeconds;
    totalRecoverySeconds += scenario.recoveryTimeoutSeconds;
  }
  if (scenarioIds.size !== exactScenarioAdapters.size) {
    fail("canonical scenario coverage is incomplete");
  }
  return { totalFaultSeconds, totalRecoverySeconds, totalReplayRequests };
}

function loopbackOrigin(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`${label} is not a valid origin`);
  }
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "[::1]", "localhost"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    fail(`${label} must be a credential-free loopback HTTP origin`);
  }
  return url.origin;
}

function loadFixture(path, sandboxRoot, expectedDigest, maximumBytes) {
  if (!isWithin(sandboxRoot, path)) fail("fixture escapes disposable sandbox");
  const raw = readRegularFile(path, "fixture", 131_072, true);
  if (rawDigest(raw) !== expectedDigest) fail("fixture digest drifted");
  let fixture;
  try {
    fixture = JSON.parse(raw);
  } catch {
    fail("fixture is not valid JSON");
  }
  exactKeys(
    fixture,
    [
      "schema",
      "originAlias",
      "method",
      "path",
      "headers",
      "bodyBase64",
      "expectedStatuses",
    ],
    "HTTP fixture",
  );
  if (
    fixture.schema !== "starfiniti.fault-http-fixture.v1" ||
    !["dashboard", "storefront"].includes(fixture.originAlias) ||
    !["POST", "PUT"].includes(fixture.method) ||
    typeof fixture.path !== "string" ||
    !fixture.path.startsWith("/") ||
    fixture.path.length > 200 ||
    fixture.path.includes("?") ||
    !fixture.headers ||
    typeof fixture.headers !== "object" ||
    Array.isArray(fixture.headers) ||
    Object.keys(fixture.headers).length > 24 ||
    Object.entries(fixture.headers).some(
      ([name, value]) =>
        !/^[a-z0-9-]{1,64}$/u.test(name) ||
        ["host", "content-length", "connection"].includes(name) ||
        typeof value !== "string" ||
        value.length > 2_048,
    ) ||
    typeof fixture.bodyBase64 !== "string" ||
    !/^[A-Za-z0-9+/]*={0,2}$/u.test(fixture.bodyBase64) ||
    !Array.isArray(fixture.expectedStatuses) ||
    fixture.expectedStatuses.length < 1 ||
    fixture.expectedStatuses.length > 3 ||
    fixture.expectedStatuses.some(
      (status) => !Number.isSafeInteger(status) || status < 200 || status > 299,
    )
  ) {
    fail("HTTP fixture shape or authority is invalid");
  }
  const body = Buffer.from(fixture.bodyBase64, "base64");
  if (
    fixture.bodyBase64.length % 4 !== 0 ||
    body.toString("base64") !== fixture.bodyBase64 ||
    body.length < 1 ||
    body.length > maximumBytes
  ) {
    fail("fixture body is outside the response/request safety bound");
  }
  return { ...fixture, body };
}

export function validateControl(control, plan, { loadFiles = true } = {}) {
  exactKeys(
    control,
    [
      "schema",
      "targetClass",
      "sandboxRoot",
      "marker",
      "compose",
      "origins",
      "toxiproxy",
      "fixtures",
    ],
    "control",
  );
  if (
    control.schema !== "starfiniti.fault-control.v1" ||
    control.targetClass !== "disposable_staging" ||
    !isAbsolute(control.sandboxRoot) ||
    dirname(resolve(control.sandboxRoot)) === resolve(control.sandboxRoot) ||
    resolve(control.sandboxRoot) === resolve(root)
  ) {
    fail("control must identify a separate disposable staging sandbox");
  }
  exactKeys(control.marker, ["path", "sha256"], "sandbox marker");
  exactKeys(
    control.compose,
    ["file", "sha256", "project", "services"],
    "Compose control",
  );
  exactKeys(control.compose.services, ["worker", "database"], "services");
  exactKeys(control.origins, ["dashboard", "storefront"], "origins");
  exactKeys(control.toxiproxy, ["origin", "proxies"], "Toxiproxy control");
  exactKeys(control.toxiproxy.proxies, ["database", "provider"], "proxies");
  exactKeys(
    control.fixtures,
    ["duplicateDelivery", "retryTrigger"],
    "fixtures",
  );
  for (const [alias, fixture] of Object.entries(control.fixtures)) {
    exactKeys(fixture, ["file", "sha256"], `fixture ${alias}`);
  }
  if (
    !control.compose.project.startsWith("starfiniti-chaos-") ||
    !/^[a-z0-9][a-z0-9-]{10,62}$/u.test(control.compose.project) ||
    Object.values(control.compose.services).some(
      (service) => !/^[a-z][a-z0-9_-]{1,63}$/u.test(service),
    ) ||
    new Set(Object.values(control.compose.services)).size !== 2 ||
    Object.values(control.toxiproxy.proxies).some(
      (proxy) =>
        !proxy.startsWith("starfiniti-chaos-") ||
        !/^[a-z0-9][a-z0-9_-]{10,79}$/u.test(proxy),
    ) ||
    new Set(Object.values(control.toxiproxy.proxies)).size !== 2
  ) {
    fail("Compose project service or proxy names are unsafe");
  }
  const origins = Object.fromEntries(
    Object.entries(control.origins).map(([alias, value]) => [
      alias,
      loopbackOrigin(value, `${alias} origin`),
    ]),
  );
  const toxiproxyOrigin = loopbackOrigin(
    control.toxiproxy.origin,
    "Toxiproxy origin",
  );
  if (
    !isWithin(control.sandboxRoot, control.marker.path) ||
    basename(control.marker.path) !== ".starfiniti-disposable-chaos.yaml" ||
    !isWithin(control.sandboxRoot, control.compose.file) ||
    Object.values(control.fixtures).some(
      (fixture) => !isWithin(control.sandboxRoot, fixture.file),
    ) ||
    resolve(control.compose.file) ===
      resolve(root, "infrastructure/environments/proxmox/compose.app.yml")
  ) {
    fail("control files must remain inside the disposable sandbox");
  }
  for (const digest of [
    control.marker.sha256,
    control.compose.sha256,
    ...Object.values(control.fixtures).map((fixture) => fixture.sha256),
  ]) {
    if (!sha256Pattern.test(digest) || /^0{64}$/u.test(digest)) {
      fail("control contains an invalid evidence digest");
    }
  }
  if (!loadFiles) {
    return {
      origins,
      toxiproxyOrigin,
      fixtureSetSha256: documentDigest(
        Object.fromEntries(
          Object.entries(control.fixtures).map(([alias, fixture]) => [
            alias,
            fixture.sha256,
          ]),
        ),
      ),
      fixtures: {},
    };
  }
  const markerRaw = readRegularFile(
    control.marker.path,
    "sandbox marker",
    4_096,
    true,
  );
  if (rawDigest(markerRaw) !== control.marker.sha256) {
    fail("sandbox marker digest drifted");
  }
  let marker;
  try {
    marker = YAML.parse(markerRaw);
  } catch {
    fail("sandbox marker is invalid YAML");
  }
  exactKeys(marker, ["schema", "project", "disposable"], "sandbox marker");
  if (
    marker.schema !== "starfiniti.disposable-chaos-sandbox.v1" ||
    marker.project !== control.compose.project ||
    marker.disposable !== true
  ) {
    fail("sandbox marker does not authorize the Compose project");
  }
  const composeRaw = readRegularFile(
    control.compose.file,
    "disposable Compose file",
    262_144,
    false,
  );
  if (rawDigest(composeRaw) !== control.compose.sha256) {
    fail("Compose file digest drifted");
  }
  let compose;
  try {
    compose = YAML.parse(composeRaw);
  } catch {
    fail("disposable Compose file is invalid YAML");
  }
  if (!compose?.services || typeof compose.services !== "object") {
    fail("disposable Compose file has no services");
  }
  for (const [serviceName, service] of Object.entries(compose.services)) {
    const labels = Array.isArray(service?.labels)
      ? Object.fromEntries(
          service.labels.map((label) => {
            const splitAt = label.indexOf("=");
            return splitAt > 0
              ? [label.slice(0, splitAt), label.slice(splitAt + 1)]
              : [label, ""];
          }),
        )
      : (service?.labels ?? {});
    const environmentLabel = String(
      labels["starfiniti.environment"] ?? "",
    ).toLowerCase();
    if (
      labels["starfiniti.disposable"] !== "true" ||
      ["production", "prod"].includes(environmentLabel) ||
      service?.privileged === true ||
      service?.network_mode === "host" ||
      service?.pid === "host" ||
      service?.ipc === "host" ||
      service?.container_name !== undefined ||
      service?.extends !== undefined ||
      service?.devices !== undefined ||
      service?.cap_add !== undefined
    ) {
      fail(`disposable Compose service ${serviceName} has unsafe authority`);
    }
    for (const volume of service?.volumes ?? []) {
      const source =
        typeof volume === "string"
          ? volume.split(":")[0]
          : volume?.type === "bind"
            ? volume.source
            : null;
      if (
        typeof source === "string" &&
        (source.toLowerCase().includes("docker.sock") ||
          (isAbsolute(source) && !isWithin(control.sandboxRoot, source)) ||
          source.split(/[\\/]/u).includes(".."))
      ) {
        fail(`disposable Compose service ${serviceName} has an unsafe mount`);
      }
    }
  }
  for (const serviceName of Object.values(control.compose.services)) {
    if (!Object.hasOwn(compose.services, serviceName)) {
      fail("controlled service is absent from disposable Compose file");
    }
  }
  for (const resource of [
    ...Object.values(compose.networks ?? {}),
    ...Object.values(compose.volumes ?? {}),
  ]) {
    if (resource?.external === true || resource?.name !== undefined) {
      fail("disposable Compose file references an external named resource");
    }
  }
  const fixtures = Object.fromEntries(
    Object.entries(control.fixtures).map(([alias, fixture]) => [
      alias,
      loadFixture(
        fixture.file,
        control.sandboxRoot,
        fixture.sha256,
        plan.bounds.maximumResponseBytes,
      ),
    ]),
  );
  return {
    origins,
    toxiproxyOrigin,
    fixtures,
    fixtureSetSha256: documentDigest(
      Object.fromEntries(
        Object.entries(control.fixtures).map(([alias, fixture]) => [
          alias,
          fixture.sha256,
        ]),
      ),
    ),
  };
}

function validateApproval(path, expected) {
  const raw = readRegularFile(path, "fault approval", 16_384, true);
  let approval;
  try {
    approval = YAML.parse(raw);
  } catch {
    fail("fault approval is invalid YAML");
  }
  exactKeys(
    approval,
    [
      "schema",
      "approvalReference",
      "targetClass",
      "candidateCommit",
      "planSha256",
      "controlSha256",
      "markerSha256",
      "composeSha256",
      "fixtureSetSha256",
      "composeProject",
      "approvedAt",
      "expiresAt",
      "maximumFaultSeconds",
      "maximumReplayRequests",
    ],
    "fault approval",
  );
  if (
    approval.schema !== "starfiniti.fault-run-approval.v1" ||
    typeof approval.approvalReference !== "string" ||
    !/^[a-z0-9][a-z0-9:_-]{5,99}$/u.test(approval.approvalReference) ||
    approval.targetClass !== "disposable_staging" ||
    approval.candidateCommit !== expected.candidateCommit ||
    approval.planSha256 !== expected.planSha256 ||
    approval.controlSha256 !== expected.controlSha256 ||
    approval.markerSha256 !== expected.markerSha256 ||
    approval.composeSha256 !== expected.composeSha256 ||
    approval.fixtureSetSha256 !== expected.fixtureSetSha256 ||
    approval.composeProject !== expected.composeProject
  ) {
    fail("fault approval identity or digest binding drifted");
  }
  exactUtc(approval.approvedAt, "approval approvedAt");
  exactUtc(approval.expiresAt, "approval expiresAt");
  const approvedAt = Date.parse(approval.approvedAt);
  const expiresAt = Date.parse(approval.expiresAt);
  const now = Date.now();
  if (
    approvedAt > now + 60_000 ||
    expiresAt <= now ||
    expiresAt - approvedAt > 24 * 60 * 60 * 1_000 ||
    expiresAt - now <
      (expected.totalFaultSeconds + expected.totalRecoverySeconds + 300) * 1_000
  ) {
    fail("fault approval is not current or exceeds 24 hours");
  }
  if (
    !Number.isSafeInteger(approval.maximumFaultSeconds) ||
    approval.maximumFaultSeconds < expected.totalFaultSeconds ||
    approval.maximumFaultSeconds > 1_800 ||
    !Number.isSafeInteger(approval.maximumReplayRequests) ||
    approval.maximumReplayRequests < expected.totalReplayRequests ||
    approval.maximumReplayRequests > 2_000
  ) {
    fail("fault approval does not cover the bounded plan");
  }
  return { approval, approvalSha256: rawDigest(raw) };
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--self-test") {
      options.selfTest = true;
      continue;
    }
    if (!argument?.startsWith("--")) fail("unexpected command argument");
    const key = argument.slice(2);
    if (!["plan", "control-file", "approval-file", "out"].includes(key)) {
      fail(`unknown option --${key}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) fail(`--${key} requires a value`);
    if (Object.hasOwn(options, key)) fail(`--${key} was provided twice`);
    options[key] = value;
    index += 1;
  }
  return options;
}

function sleep(milliseconds) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

async function readBoundedResponse(response, maximumBytes) {
  if (!response.body) return { body: Buffer.alloc(0), bytes: 0 };
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > maximumBytes) {
      await response.body.cancel().catch(() => {});
      throw new Error("response_too_large");
    }
    chunks.push(chunk);
  }
  return { body: Buffer.concat(chunks), bytes };
}

async function fetchProbe(probe, origins, maximumBytes) {
  const started = performance.now();
  try {
    const response = await fetch(
      new URL(probe.path, origins[probe.originAlias]),
      {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(probe.timeoutMs),
      },
    );
    const bounded = await readBoundedResponse(response, maximumBytes);
    const statusPass = probe.expectedStatuses.includes(response.status);
    const contentType = response.headers.get("content-type") ?? "";
    const contractPass =
      probe.responseContract === "readiness_v1"
        ? response.status === 200 && bounded.body.toString("utf8") === "ok\n"
        : response.status >= 300 && response.status < 400
          ? true
          : contentType.toLowerCase().includes("text/html");
    return {
      probeId: probe.id,
      status: response.status,
      latencyMs: Math.round((performance.now() - started) * 1_000) / 1_000,
      passed: statusPass && contractPass,
      failure: statusPass
        ? contractPass
          ? null
          : "invalid_contract"
        : "unexpected_status",
    };
  } catch (error) {
    return {
      probeId: probe.id,
      status: null,
      latencyMs: Math.round((performance.now() - started) * 1_000) / 1_000,
      passed: false,
      failure:
        error instanceof Error && error.message === "response_too_large"
          ? "response_too_large"
          : "request_failed",
    };
  }
}

async function probeSummary(scenario, plan, driver) {
  const probesById = new Map(plan.probes.map((probe) => [probe.id, probe]));
  const results = await Promise.all(
    scenario.probeIds.map((id) => driver.probe(probesById.get(id))),
  );
  const statuses = {};
  const failures = {};
  for (const result of results) {
    const status = result.status === null ? "network" : String(result.status);
    statuses[status] = (statuses[status] ?? 0) + 1;
    if (!result.passed && result.failure) {
      failures[result.failure] = (failures[result.failure] ?? 0) + 1;
    }
  }
  return {
    attempted: results.length,
    passed: results.filter((result) => result.passed).length,
    maximumLatencyMs: Math.max(...results.map((result) => result.latencyMs), 0),
    statusTotals: statuses,
    failureTotals: failures,
    healthy: results.every((result) => result.passed),
  };
}

async function waitForRecovery(scenario, plan, driver) {
  const started = performance.now();
  let attempts = 0;
  let summary;
  do {
    attempts += 1;
    summary = await probeSummary(scenario, plan, driver);
    const targetHealthy = await driver.targetHealthy(scenario);
    if (summary.healthy && targetHealthy) {
      return {
        ...summary,
        attempts,
        recoveredInMs:
          Math.round((performance.now() - started) * 1_000) / 1_000,
      };
    }
    await sleep(Math.min(1_000, scenario.recoveryTimeoutSeconds * 100));
  } while (
    performance.now() - started <
    scenario.recoveryTimeoutSeconds * 1_000
  );
  return {
    ...summary,
    attempts,
    recoveredInMs: null,
    healthy: false,
  };
}

function sanitizedFailure(error) {
  if (!(error instanceof Error)) return "controller_failed";
  for (const code of [
    "baseline_unhealthy",
    "container_not_running",
    "container_label_mismatch",
    "production_label_detected",
    "proxy_not_ready",
    "proxy_toxic_conflict",
    "fixture_replay_failed",
    "restore_failed",
  ]) {
    if (error.message.includes(code)) return code;
  }
  return "controller_failed";
}

async function runFixedReplay(scenario, fixtureAlias, driver) {
  const intervalMs = 1_000 / scenario.ratePerSecond;
  const inFlight = new Set();
  const counts = {
    scheduled: scenario.requestCount,
    completed: 0,
    dropped: 0,
    failed: 0,
  };
  const started = performance.now();
  for (let index = 0; index < scenario.requestCount; index += 1) {
    const scheduledAt = started + index * intervalMs;
    const delay = scheduledAt - performance.now();
    if (delay > 0) await sleep(delay);
    if (inFlight.size >= scenario.concurrency) {
      counts.dropped += 1;
      continue;
    }
    const request = driver
      .replay(fixtureAlias)
      .then((ok) => {
        counts.completed += 1;
        if (!ok) counts.failed += 1;
      })
      .catch(() => {
        counts.completed += 1;
        counts.failed += 1;
      })
      .finally(() => inFlight.delete(request));
    inFlight.add(request);
  }
  await Promise.all(inFlight);
  return counts;
}

async function runScenario(scenario, plan, driver) {
  const startedAt = new Date();
  let restored = false;
  let applied = false;
  let failure = null;
  let baseline;
  let during;
  let recovery;
  let replay = null;
  let faultStartedAt = null;
  const markApplied = () => {
    applied = true;
    faultStartedAt = performance.now();
  };
  const waitRemainingFaultWindow = async () => {
    const elapsed = performance.now() - faultStartedAt;
    const remaining = scenario.faultSeconds * 1_000 - elapsed;
    if (remaining > 0) await sleep(remaining);
  };
  try {
    baseline = await probeSummary(scenario, plan, driver);
    if (!baseline.healthy) throw new Error("baseline_unhealthy");
    if (scenario.adapter === "docker_service_sigkill") {
      markApplied();
      await driver.killService(scenario.targetAlias);
      during = await probeSummary(scenario, plan, driver);
      await waitRemainingFaultWindow();
    } else if (scenario.adapter === "toxiproxy_latency") {
      markApplied();
      await driver.addLatency(
        scenario.targetAlias,
        scenario.latencyMs,
        scenario.jitterMs,
      );
      during = await probeSummary(scenario, plan, driver);
      await waitRemainingFaultWindow();
    } else if (scenario.adapter === "duplicate_http_replay") {
      markApplied();
      replay = await runFixedReplay(scenario, scenario.targetAlias, driver);
      if (replay.failed > 0 || replay.dropped > 0) {
        throw new Error("fixture_replay_failed");
      }
      during = await probeSummary(scenario, plan, driver);
      await waitRemainingFaultWindow();
    } else if (scenario.adapter === "toxiproxy_disable") {
      markApplied();
      await driver.disableProxy(scenario.targetAlias);
      during = await probeSummary(scenario, plan, driver);
      await waitRemainingFaultWindow();
    } else if (scenario.adapter === "toxiproxy_disable_with_replay") {
      markApplied();
      await driver.disableProxy(scenario.targetAlias);
      replay = await runFixedReplay(scenario, scenario.fixtureAlias, driver);
      if (replay.failed > 0 || replay.dropped > 0) {
        throw new Error("fixture_replay_failed");
      }
      during = await probeSummary(scenario, plan, driver);
      await waitRemainingFaultWindow();
    }
  } catch (error) {
    failure = sanitizedFailure(error);
  } finally {
    if (applied) {
      try {
        await driver.restore(scenario);
        restored = true;
      } catch {
        restored = false;
        failure = "restore_failed";
      }
    }
  }
  if (baseline?.healthy && restored && failure === null) {
    recovery = await waitForRecovery(scenario, plan, driver);
    if (!recovery.healthy) failure = "recovery_timeout";
  }
  const passed =
    baseline?.healthy === true &&
    applied &&
    restored &&
    recovery?.healthy === true &&
    failure === null;
  return {
    id: scenario.id,
    adapter: scenario.adapter,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    applied,
    restored,
    baseline: baseline ?? null,
    during: during ?? null,
    recovery: recovery ?? null,
    replay,
    failure,
    passed,
  };
}

export async function runFaultPlan(input) {
  const startedAt = new Date();
  const scenarios = [];
  for (const scenario of input.plan.scenarios) {
    const result = await runScenario(scenario, input.plan, input.driver);
    scenarios.push(result);
    if (!result.passed) break;
  }
  const passed =
    scenarios.length === input.plan.scenarios.length &&
    scenarios.every((scenario) => scenario.passed);
  return {
    schema: "starfiniti.fault-run.v1",
    status: passed ? "passed" : "failed",
    candidateCommit: input.candidateCommit,
    planProfile: input.plan.profile,
    planSha256: input.planSha256,
    controlSha256: input.controlSha256,
    approvalSha256: input.approvalSha256,
    markerSha256: input.markerSha256,
    composeSha256: input.composeSha256,
    fixtureSetSha256: input.fixtureSetSha256,
    targetClass: "disposable_staging",
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    scenarios,
  };
}

function createRealDriver(plan, control, loaded) {
  const activeServices = new Map();
  const activeProxies = new Map();
  const activeToxics = new Map();
  const composeArgs = [
    "compose",
    "-f",
    control.compose.file,
    "-p",
    control.compose.project,
  ];

  function docker(args, options = {}) {
    try {
      return execFileSync("docker", args, {
        encoding: "utf8",
        timeout: options.timeout ?? 30_000,
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      throw new Error(options.code ?? "controller_failed");
    }
  }

  function resolveContainer(alias) {
    const service = control.compose.services[alias];
    if (!service) throw new Error("container_label_mismatch");
    const output = docker([...composeArgs, "ps", "-q", service], {
      code: "container_not_running",
    });
    const ids = output.split(/\r?\n/u).filter(Boolean);
    if (ids.length !== 1) throw new Error("container_not_running");
    const inspected = docker(
      [
        "container",
        "inspect",
        "--format",
        "{{json .Config.Labels}}|{{.State.Running}}",
        ids[0],
      ],
      { code: "container_label_mismatch" },
    );
    const splitAt = inspected.lastIndexOf("|");
    let labels;
    try {
      labels = JSON.parse(inspected.slice(0, splitAt));
    } catch {
      throw new Error("container_label_mismatch");
    }
    const running = inspected.slice(splitAt + 1) === "true";
    if (
      labels?.["com.docker.compose.project"] !== control.compose.project ||
      labels?.["com.docker.compose.service"] !== service ||
      labels?.["starfiniti.disposable"] !== "true"
    ) {
      throw new Error("container_label_mismatch");
    }
    if (
      ["production", "prod"].includes(
        String(labels?.["starfiniti.environment"] ?? "").toLowerCase(),
      )
    ) {
      throw new Error("production_label_detected");
    }
    return { id: ids[0], running };
  }

  async function toxi(path, options = {}) {
    try {
      const response = await fetch(new URL(path, loaded.toxiproxyOrigin), {
        method: options.method ?? "GET",
        headers: options.body ? { "content-type": "application/json" } : {},
        body: options.body ? JSON.stringify(options.body) : undefined,
        redirect: "manual",
        signal: AbortSignal.timeout(5_000),
      });
      const bounded = await readBoundedResponse(
        response,
        plan.bounds.maximumResponseBytes,
      );
      if (!options.expected.includes(response.status)) {
        throw new Error("proxy_not_ready");
      }
      return bounded.body.length
        ? JSON.parse(bounded.body.toString("utf8"))
        : null;
    } catch (error) {
      if (
        error instanceof Error &&
        ["proxy_not_ready", "proxy_toxic_conflict"].includes(error.message)
      ) {
        throw error;
      }
      throw new Error("proxy_not_ready");
    }
  }

  async function proxyState(alias) {
    const name = control.toxiproxy.proxies[alias];
    if (!name) throw new Error("proxy_not_ready");
    const proxy = await toxi(`/proxies/${encodeURIComponent(name)}`, {
      expected: [200],
    });
    if (
      proxy?.name !== name ||
      typeof proxy.upstream !== "string" ||
      !/^[a-z][a-z0-9_-]{1,63}:\d{2,5}$/u.test(proxy.upstream)
    ) {
      throw new Error("proxy_not_ready");
    }
    return proxy;
  }

  return {
    async probe(probe) {
      return fetchProbe(
        probe,
        loaded.origins,
        plan.bounds.maximumResponseBytes,
      );
    },
    async targetHealthy(scenario) {
      if (scenario.adapter === "docker_service_sigkill") {
        return resolveContainer(scenario.targetAlias).running;
      }
      if (scenario.adapter.startsWith("toxiproxy_")) {
        const proxy = await proxyState(scenario.targetAlias);
        return proxy?.enabled === true;
      }
      return true;
    },
    async killService(alias) {
      const container = resolveContainer(alias);
      if (!container.running) throw new Error("container_not_running");
      activeServices.set(alias, container.id);
      docker(["container", "kill", "--signal", "SIGKILL", container.id], {
        code: "controller_failed",
      });
    },
    async addLatency(alias, latencyMs, jitterMs) {
      const proxy = await proxyState(alias);
      if (proxy?.enabled !== true) throw new Error("proxy_not_ready");
      const name = control.toxiproxy.proxies[alias];
      const toxicName = `starfiniti-${alias}-latency`;
      const existing = await toxi(
        `/proxies/${encodeURIComponent(name)}/toxics`,
        { expected: [200] },
      );
      if (
        Array.isArray(existing) &&
        existing.some((toxic) => toxic.name === toxicName)
      ) {
        throw new Error("proxy_toxic_conflict");
      }
      activeToxics.set(alias, toxicName);
      await toxi(`/proxies/${encodeURIComponent(name)}/toxics`, {
        method: "POST",
        expected: [200, 201],
        body: {
          name: toxicName,
          type: "latency",
          stream: "downstream",
          toxicity: 1,
          attributes: { latency: latencyMs, jitter: jitterMs },
        },
      });
    },
    async disableProxy(alias) {
      const proxy = await proxyState(alias);
      if (proxy?.enabled !== true) throw new Error("proxy_not_ready");
      const name = control.toxiproxy.proxies[alias];
      activeProxies.set(alias, true);
      await toxi(`/proxies/${encodeURIComponent(name)}`, {
        method: "POST",
        expected: [200],
        body: { enabled: false },
      });
    },
    async replay(alias) {
      const fixture = loaded.fixtures[alias];
      if (!fixture) throw new Error("fixture_replay_failed");
      try {
        const response = await fetch(
          new URL(fixture.path, loaded.origins[fixture.originAlias]),
          {
            method: fixture.method,
            headers: fixture.headers,
            body: fixture.body,
            redirect: "manual",
            signal: AbortSignal.timeout(10_000),
          },
        );
        await readBoundedResponse(response, plan.bounds.maximumResponseBytes);
        return fixture.expectedStatuses.includes(response.status);
      } catch {
        return false;
      }
    },
    async restore(scenario) {
      if (scenario.adapter === "docker_service_sigkill") {
        const id = activeServices.get(scenario.targetAlias);
        if (!id) throw new Error("restore_failed");
        docker(["container", "start", id], { code: "restore_failed" });
        activeServices.delete(scenario.targetAlias);
        return;
      }
      if (scenario.adapter === "toxiproxy_latency") {
        const toxicName = activeToxics.get(scenario.targetAlias);
        const proxyName = control.toxiproxy.proxies[scenario.targetAlias];
        if (!toxicName) throw new Error("restore_failed");
        await toxi(
          `/proxies/${encodeURIComponent(proxyName)}/toxics/${encodeURIComponent(toxicName)}`,
          { method: "DELETE", expected: [204, 404] },
        );
        activeToxics.delete(scenario.targetAlias);
        return;
      }
      if (scenario.adapter.startsWith("toxiproxy_disable")) {
        const proxyName = control.toxiproxy.proxies[scenario.targetAlias];
        if (!activeProxies.has(scenario.targetAlias)) {
          throw new Error("restore_failed");
        }
        await toxi(`/proxies/${encodeURIComponent(proxyName)}`, {
          method: "POST",
          expected: [200],
          body: { enabled: true },
        });
        activeProxies.delete(scenario.targetAlias);
      }
    },
    async restoreAll() {
      let failed = false;
      for (const [alias, id] of [...activeServices]) {
        try {
          docker(["container", "start", id], { code: "restore_failed" });
          activeServices.delete(alias);
        } catch {
          failed = true;
        }
      }
      for (const [alias, toxicName] of [...activeToxics]) {
        try {
          const proxyName = control.toxiproxy.proxies[alias];
          await toxi(
            `/proxies/${encodeURIComponent(proxyName)}/toxics/${encodeURIComponent(toxicName)}`,
            { method: "DELETE", expected: [204, 404] },
          );
          activeToxics.delete(alias);
        } catch {
          failed = true;
        }
      }
      for (const alias of [...activeProxies.keys()]) {
        try {
          const proxyName = control.toxiproxy.proxies[alias];
          await toxi(`/proxies/${encodeURIComponent(proxyName)}`, {
            method: "POST",
            expected: [200],
            body: { enabled: true },
          });
          activeProxies.delete(alias);
        } catch {
          failed = true;
        }
      }
      if (failed) throw new Error("restore_failed");
    },
  };
}

async function execute(options) {
  for (const key of ["plan", "control-file", "approval-file", "out"]) {
    if (typeof options[key] !== "string") fail(`--${key} is required`);
  }
  const planPath = resolve(root, options.plan);
  const allowedPlanRoot = resolve(
    root,
    "infrastructure/testing/fault-injection",
  );
  if (
    !isWithin(allowedPlanRoot, planPath) &&
    planPath !== join(allowedPlanRoot, "plan.yaml")
  ) {
    fail("fault plan must remain in the repository fault-injection directory");
  }
  let plan;
  let planRaw;
  try {
    planRaw = readFileSync(planPath, "utf8");
    plan = YAML.parse(planRaw);
  } catch {
    fail("fault plan is unreadable or invalid YAML");
  }
  const bounds = validateFaultPlan(plan);
  const repository = repositoryState({
    allowDirty: options.allowDirtyRepository === true,
  });
  const controlRaw = readRegularFile(
    options["control-file"],
    "fault control",
    32_768,
    true,
  );
  let control;
  try {
    control = YAML.parse(controlRaw);
  } catch {
    fail("fault control is invalid YAML");
  }
  const loaded = validateControl(control, plan);
  const planSha256 = documentDigest(plan);
  const controlSha256 = rawDigest(controlRaw);
  const approved = validateApproval(options["approval-file"], {
    candidateCommit: repository.commit,
    planSha256,
    controlSha256,
    markerSha256: control.marker.sha256,
    composeSha256: control.compose.sha256,
    fixtureSetSha256: loaded.fixtureSetSha256,
    composeProject: control.compose.project,
    ...bounds,
  });
  if (!isAbsolute(options.out)) fail("fault report path must be absolute");
  const driver = createRealDriver(plan, control, loaded);
  let interrupted = false;
  const restoreOnSignal = () => {
    if (interrupted) return;
    interrupted = true;
    void driver.restoreAll().finally(() => process.exit(130));
  };
  process.once("SIGINT", restoreOnSignal);
  process.once("SIGTERM", restoreOnSignal);
  let report;
  try {
    report = await runFaultPlan({
      plan,
      driver,
      candidateCommit: repository.commit,
      planSha256,
      controlSha256,
      approvalSha256: approved.approvalSha256,
      markerSha256: control.marker.sha256,
      composeSha256: control.compose.sha256,
      fixtureSetSha256: loaded.fixtureSetSha256,
    });
  } finally {
    process.removeListener("SIGINT", restoreOnSignal);
    process.removeListener("SIGTERM", restoreOnSignal);
    await driver.restoreAll();
  }
  writeFileSync(options.out, `${JSON.stringify(report, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  return report;
}

function createFakeDriver(serverOrigin) {
  const services = new Map([
    ["worker", true],
    ["database", true],
  ]);
  const proxies = new Map([
    ["database", true],
    ["provider", true],
  ]);
  const toxics = new Set();
  let replayCount = 0;
  return {
    state: {
      services,
      proxies,
      toxics,
      get replayCount() {
        return replayCount;
      },
    },
    async probe(probe) {
      return fetchProbe(
        probe,
        { dashboard: serverOrigin, storefront: serverOrigin },
        16_384,
      );
    },
    async targetHealthy(scenario) {
      if (scenario.adapter === "docker_service_sigkill") {
        return services.get(scenario.targetAlias) === true;
      }
      if (scenario.adapter.startsWith("toxiproxy_")) {
        return proxies.get(scenario.targetAlias) === true;
      }
      return true;
    },
    async killService(alias) {
      if (services.get(alias) !== true)
        throw new Error("container_not_running");
      services.set(alias, false);
    },
    async addLatency(alias) {
      if (toxics.has(alias)) throw new Error("proxy_toxic_conflict");
      toxics.add(alias);
    },
    async disableProxy(alias) {
      if (proxies.get(alias) !== true) throw new Error("proxy_not_ready");
      proxies.set(alias, false);
    },
    async replay() {
      replayCount += 1;
      return true;
    },
    async restore(scenario) {
      if (scenario.adapter === "docker_service_sigkill") {
        services.set(scenario.targetAlias, true);
      } else if (scenario.adapter === "toxiproxy_latency") {
        toxics.delete(scenario.targetAlias);
      } else if (scenario.adapter.startsWith("toxiproxy_disable")) {
        proxies.set(scenario.targetAlias, true);
      }
    },
  };
}

async function selfTest() {
  const plan = YAML.parse(
    readFileSync(
      join(root, "infrastructure/testing/fault-injection/plan.yaml"),
      "utf8",
    ),
  );
  validateFaultPlan(plan);
  const fastPlan = structuredClone(plan);
  for (const scenario of fastPlan.scenarios) {
    scenario.faultSeconds = 0.1;
    scenario.recoveryTimeoutSeconds = 1;
    if (Object.hasOwn(scenario, "requestCount")) {
      scenario.requestCount = 2;
      scenario.ratePerSecond = 20;
      scenario.concurrency = 1;
    }
  }
  validateFaultPlan(fastPlan);
  const server = createServer((request, response) => {
    if (request.url === "/api/healthz") {
      response.writeHead(200, { "content-type": "text/plain" }).end("ok\n");
      return;
    }
    if (request.url === "/checkout/") {
      response
        .writeHead(200, { "content-type": "text/html" })
        .end("<main>Checkout</main>");
      return;
    }
    response.writeHead(202).end();
  });
  await new Promise((resolveListen) =>
    server.listen(0, "127.0.0.1", resolveListen),
  );
  try {
    const address = server.address();
    if (!address || typeof address === "string")
      fail("self-test server unavailable");
    const origin = `http://127.0.0.1:${address.port}`;
    const driver = createFakeDriver(origin);
    const report = await runFaultPlan({
      plan: fastPlan,
      driver,
      candidateCommit: "a".repeat(40),
      planSha256: documentDigest(plan),
      controlSha256: "b".repeat(64),
      approvalSha256: "c".repeat(64),
      markerSha256: "d".repeat(64),
      composeSha256: "e".repeat(64),
      fixtureSetSha256: "f".repeat(64),
    });
    if (
      report.status !== "passed" ||
      report.scenarios.length !== 6 ||
      report.scenarios.some((scenario) => !scenario.restored) ||
      driver.state.services.get("worker") !== true ||
      driver.state.services.get("database") !== true ||
      driver.state.proxies.get("provider") !== true ||
      driver.state.toxics.size !== 0 ||
      driver.state.replayCount !== 4
    ) {
      fail("self-test did not apply restore and recover every scenario");
    }
    const serialized = JSON.stringify(report);
    for (const forbidden of [origin, "/checkout/", "starfiniti-chaos-"]) {
      if (serialized.includes(forbidden)) {
        fail("self-test report leaked target or request material");
      }
    }
    const unsafeControl = {
      schema: "starfiniti.fault-control.v1",
      targetClass: "disposable_staging",
      sandboxRoot: resolve(tmpdir(), "starfiniti-chaos-test"),
      marker: {
        path: resolve(
          tmpdir(),
          "starfiniti-chaos-test/.starfiniti-disposable-chaos.yaml",
        ),
        sha256: "a".repeat(64),
      },
      compose: {
        file: resolve(tmpdir(), "starfiniti-chaos-test/compose.yml"),
        sha256: "b".repeat(64),
        project: "starfiniti-chaos-selftest",
        services: { worker: "worker", database: "database" },
      },
      origins: {
        dashboard: "https://loyalty.starfiniti.com",
        storefront: "http://127.0.0.1:8080",
      },
      toxiproxy: {
        origin: "http://127.0.0.1:8474",
        proxies: {
          database: "starfiniti-chaos-database",
          provider: "starfiniti-chaos-provider",
        },
      },
      fixtures: {
        duplicateDelivery: {
          file: resolve(tmpdir(), "starfiniti-chaos-test/duplicate.json"),
          sha256: "c".repeat(64),
        },
        retryTrigger: {
          file: resolve(tmpdir(), "starfiniti-chaos-test/retry.json"),
          sha256: "d".repeat(64),
        },
      },
    };
    try {
      validateControl(unsafeControl, plan, { loadFiles: false });
      fail("self-test accepted a non-loopback production origin");
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("loopback"))
        throw error;
    }
    const sandbox = mkdtempSync(join(tmpdir(), "starfiniti-chaos-sandbox-"));
    try {
      const project = "starfiniti-chaos-selftest";
      const markerPath = join(sandbox, ".starfiniti-disposable-chaos.yaml");
      const composePath = join(sandbox, "compose.yml");
      const duplicatePath = join(sandbox, "duplicate.json");
      const retryPath = join(sandbox, "retry.json");
      const markerRaw = YAML.stringify({
        schema: "starfiniti.disposable-chaos-sandbox.v1",
        project,
        disposable: true,
      });
      const fixtureRaw = `${JSON.stringify({
        schema: "starfiniti.fault-http-fixture.v1",
        originAlias: "dashboard",
        method: "POST",
        path: "/api/test",
        headers: { "content-type": "application/json" },
        bodyBase64: Buffer.from('{"test":true}').toString("base64"),
        expectedStatuses: [202],
      })}\n`;
      const composeDocument = {
        services: {
          worker: {
            image: "example.invalid/worker@sha256:fixture",
            labels: {
              "starfiniti.disposable": "true",
              "starfiniti.environment": "test",
            },
          },
          database: {
            image: "example.invalid/database@sha256:fixture",
            labels: {
              "starfiniti.disposable": "true",
              "starfiniti.environment": "test",
            },
          },
        },
      };
      const composeRaw = YAML.stringify(composeDocument);
      writeFileSync(markerPath, markerRaw, { mode: 0o600 });
      writeFileSync(composePath, composeRaw, { mode: 0o600 });
      writeFileSync(duplicatePath, fixtureRaw, { mode: 0o600 });
      writeFileSync(retryPath, fixtureRaw, { mode: 0o600 });
      const safeControl = {
        ...unsafeControl,
        sandboxRoot: sandbox,
        marker: { path: markerPath, sha256: rawDigest(markerRaw) },
        compose: {
          file: composePath,
          sha256: rawDigest(composeRaw),
          project,
          services: { worker: "worker", database: "database" },
        },
        origins: {
          dashboard: origin,
          storefront: origin,
        },
        fixtures: {
          duplicateDelivery: {
            file: duplicatePath,
            sha256: rawDigest(fixtureRaw),
          },
          retryTrigger: {
            file: retryPath,
            sha256: rawDigest(fixtureRaw),
          },
        },
      };
      const loaded = validateControl(safeControl, plan);
      if (Object.keys(loaded.fixtures).length !== 2) {
        fail("self-test did not load the isolated fixture set");
      }
      const unsafeCompose = structuredClone(composeDocument);
      unsafeCompose.services.worker.privileged = true;
      const unsafeComposeRaw = YAML.stringify(unsafeCompose);
      writeFileSync(composePath, unsafeComposeRaw, { mode: 0o600 });
      const privilegedControl = {
        ...safeControl,
        compose: {
          ...safeControl.compose,
          sha256: rawDigest(unsafeComposeRaw),
        },
      };
      try {
        validateControl(privilegedControl, plan);
        fail("self-test accepted a privileged disposable service");
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !error.message.includes("unsafe authority")
        ) {
          throw error;
        }
      }
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
    const missingScenario = structuredClone(plan);
    missingScenario.scenarios.pop();
    try {
      validateFaultPlan(missingScenario);
      fail("self-test accepted missing fault coverage");
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("six canonical"))
        throw error;
    }
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }

  const temporary = mkdtempSync(join(tmpdir(), "starfiniti-fault-cleanup-"));
  try {
    const cleanupPlan = structuredClone(fastPlan);
    cleanupPlan.scenarios = [
      cleanupPlan.scenarios.find(
        (scenario) => scenario.id === "provider_outage",
      ),
    ];
    const state = { enabled: true };
    const cleanupDriver = {
      async probe(probe) {
        return {
          probeId: probe.id,
          status: 200,
          latencyMs: 1,
          passed: true,
          failure: null,
        };
      },
      async targetHealthy() {
        return state.enabled;
      },
      async disableProxy() {
        state.enabled = false;
        throw new Error("ambiguous injected outcome");
      },
      async restore() {
        state.enabled = true;
      },
    };
    const result = await runFaultPlan({
      plan: cleanupPlan,
      driver: cleanupDriver,
      candidateCommit: "a".repeat(40),
      planSha256: "b".repeat(64),
      controlSha256: "c".repeat(64),
      approvalSha256: "d".repeat(64),
      markerSha256: "e".repeat(64),
      composeSha256: "f".repeat(64),
      fixtureSetSha256: "1".repeat(64),
    });
    if (
      result.status !== "failed" ||
      result.scenarios[0]?.restored !== true ||
      state.enabled !== true
    ) {
      fail("self-test did not restore an ambiguous proxy outcome");
    }
    writeFileSync(join(temporary, "complete"), "ok", { mode: 0o600 });
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

const invokedDirectly =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  const options = parseArguments(process.argv.slice(2));
  if (options.selfTest) {
    await selfTest();
    console.log(
      "Validated six bounded fault adapters, loopback/disposable guards, deterministic restoration, recovery probes, and minimized reports.",
    );
  } else {
    const report = await execute(options);
    console.log(
      `Fault run ${report.status}; minimized aggregate evidence was written without target or fixture material.`,
    );
    if (report.status !== "passed") process.exitCode = 1;
  }
}
