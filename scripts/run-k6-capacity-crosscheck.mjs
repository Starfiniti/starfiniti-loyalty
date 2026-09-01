import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import YAML from "yaml";

import {
  documentDigest,
  loadCredentials,
  readApproval,
  readOrigin,
  readRegularFile,
  repositoryState,
  validateWorkload,
} from "./run-capacity-envelope.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const planPath = join(root, "infrastructure/testing/capacity/k6-plan.yaml");
const workloadPath = join(
  root,
  "infrastructure/testing/capacity/workload.yaml",
);
const scriptPath = join(
  root,
  "infrastructure/testing/capacity/k6-crosscheck.js",
);
const exactTool = Object.freeze({
  name: "grafana-k6",
  version: "2.2.0",
  releaseUrl: "https://github.com/grafana/k6/releases/tag/v2.2.0",
  imageIndexSha256:
    "9bd01d6941fca969cb61bb57d2da5ee9b385fe2aa8881df3798c196564d6ace6",
  linuxAmd64ManifestSha256:
    "a070982921f37e1b891f8ed9fb2b507520c83228614c14640f7e28f635f4281b",
  linuxArm64ManifestSha256:
    "ea746c18a0af5530f5501dbe50d2cda34a37376639c524ca3172da61394869ef",
});

function fail(message) {
  throw new Error(`k6 capacity cross-check failed: ${message}`);
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    fail(`${label} has an unexpected shape`);
  }
}

function exactUtcTimestamp(value, label) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    fail(`${label} must be an exact UTC timestamp`);
  }
}

function parseArguments(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--self-test") {
      result.selfTest = true;
      continue;
    }
    if (argument === "--container-self-test") {
      result.containerSelfTest = true;
      continue;
    }
    if (!argument.startsWith("--")) fail("unexpected command argument");
    const key = argument.slice(2);
    if (
      ![
        "config",
        "origin-file",
        "credential-dir",
        "approval-file",
        "out",
      ].includes(key)
    ) {
      fail(`unknown option --${key}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) fail(`--${key} requires a value`);
    if (Object.hasOwn(result, key)) fail(`--${key} was provided twice`);
    result[key] = value;
    index += 1;
  }
  return result;
}

export function loadPlan(candidateWorkload) {
  const plan = YAML.parse(readFileSync(planPath, "utf8"));
  exactKeys(
    plan,
    [
      "schema",
      "status",
      "reviewedAt",
      "tool",
      "image",
      "workload",
      "script",
      "execution",
      "authority",
      "documentation",
    ],
    "k6 plan",
  );
  if (
    plan.schema !== "starfiniti.capacity-k6-crosscheck-plan.v1" ||
    plan.status !== "ready"
  ) {
    fail("k6 plan schema or status is invalid");
  }
  exactUtcTimestamp(plan.reviewedAt, "k6 plan reviewedAt");
  exactKeys(
    plan.tool,
    [
      "name",
      "version",
      "license",
      "sourceRepository",
      "releaseUrl",
      "releasePublishedAt",
    ],
    "k6 tool",
  );
  if (
    plan.tool.name !== exactTool.name ||
    plan.tool.version !== exactTool.version ||
    plan.tool.license !== "AGPL-3.0-only" ||
    plan.tool.sourceRepository !== "https://github.com/grafana/k6" ||
    plan.tool.releaseUrl !== exactTool.releaseUrl ||
    plan.tool.releasePublishedAt !== "2026-08-10T14:01:35Z"
  ) {
    fail("k6 tool release identity drifted");
  }
  exactKeys(
    plan.image,
    [
      "reference",
      "indexSha256",
      "linuxAmd64ManifestSha256",
      "linuxArm64ManifestSha256",
    ],
    "k6 image",
  );
  if (
    plan.image.reference !==
      `grafana/k6:2.2.0@sha256:${exactTool.imageIndexSha256}` ||
    plan.image.indexSha256 !== exactTool.imageIndexSha256 ||
    plan.image.linuxAmd64ManifestSha256 !==
      exactTool.linuxAmd64ManifestSha256 ||
    plan.image.linuxArm64ManifestSha256 !== exactTool.linuxArm64ManifestSha256
  ) {
    fail("k6 image provenance drifted");
  }
  exactKeys(plan.workload, ["path", "sha256"], "k6 workload binding");
  if (
    plan.workload.path !== "infrastructure/testing/capacity/workload.yaml" ||
    plan.workload.sha256 !== documentDigest(candidateWorkload)
  ) {
    fail("k6 workload binding drifted");
  }
  exactKeys(plan.script, ["path", "sha256"], "k6 script binding");
  const script = readFileSync(scriptPath);
  if (
    plan.script.path !== "infrastructure/testing/capacity/k6-crosscheck.js" ||
    plan.script.sha256 !== digest(script)
  ) {
    fail("k6 script binding drifted");
  }
  exactKeys(
    plan.execution,
    [
      "executor",
      "targetClass",
      "cloudOutputEnabled",
      "usageReportEnabled",
      "rawHttpOutputRetained",
      "responseBodiesRetained",
      "hostUserIdentity",
      "systemTags",
    ],
    "k6 execution",
  );
  const expectedSystemTags = [
    "method",
    "status",
    "error_code",
    "expected_response",
    "scenario",
  ];
  if (
    plan.execution.executor !== "constant-arrival-rate" ||
    plan.execution.targetClass !== "disposable_staging" ||
    plan.execution.cloudOutputEnabled !== false ||
    plan.execution.usageReportEnabled !== false ||
    plan.execution.rawHttpOutputRetained !== false ||
    plan.execution.responseBodiesRetained !== false ||
    plan.execution.hostUserIdentity !== true ||
    JSON.stringify(plan.execution.systemTags) !==
      JSON.stringify(expectedSystemTags)
  ) {
    fail("k6 local minimized execution boundary drifted");
  }
  exactKeys(
    plan.authority,
    [
      "approvedEnvironment",
      "runApproved",
      "capacityClaimApproved",
      "productionAccess",
      "productionMutated",
    ],
    "k6 false authority",
  );
  if (Object.values(plan.authority).some((value) => value !== false)) {
    fail("repository k6 plan claims live or production authority");
  }
  exactKeys(
    plan.documentation,
    ["fixedArrivalRate", "thresholds", "tags", "customSummary", "vuAllocation"],
    "k6 documentation",
  );
  if (
    Object.values(plan.documentation).some(
      (value) =>
        typeof value !== "string" ||
        !value.startsWith("https://grafana.com/docs/k6/latest/"),
    )
  ) {
    fail("k6 documentation must use official current references");
  }
  return { plan, planSha256: documentDigest(plan), script };
}

function rationalRate(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    fail("k6 scenario rate is invalid");
  }
  const decimal = value.toFixed(6).replace(/0+$/u, "").replace(/\.$/u, "");
  const places = decimal.includes(".") ? decimal.split(".")[1].length : 0;
  let numerator = Math.round(value * 10 ** places);
  let denominator = 10 ** places;
  const greatestCommonDivisor = (left, right) => {
    while (right !== 0) [left, right] = [right, left % right];
    return left;
  };
  const divisor = greatestCommonDivisor(numerator, denominator);
  numerator /= divisor;
  denominator /= divisor;
  if (
    !Number.isSafeInteger(numerator) ||
    !Number.isSafeInteger(denominator) ||
    numerator < 1 ||
    denominator < 1 ||
    denominator > 1_000
  ) {
    fail("k6 scenario rate cannot be represented exactly");
  }
  return { arrivalRate: numerator, timeUnitSeconds: denominator };
}

function phaseRuntime(workload, phase, runSeed) {
  return {
    schema: "starfiniti.k6-phase-runtime.v1",
    runSeed,
    phase: {
      id: phase.id,
      durationSeconds: phase.durationSeconds,
      rateMultiplier: phase.rateMultiplier,
      measured: phase.measured,
    },
    scenarios: workload.scenarios.map((scenario) => {
      const ratePerSecond = scenario.ratePerSecond * phase.rateMultiplier;
      const rational = rationalRate(ratePerSecond);
      return {
        id: scenario.id,
        adapter: scenario.adapter,
        method: scenario.method,
        path: scenario.path,
        credentialFile: scenario.credentialFile,
        ratePerSecond,
        ...rational,
        expectedScheduled: Math.floor(ratePerSecond * phase.durationSeconds),
        concurrencyLimit: scenario.concurrencyLimit,
        timeoutMs: scenario.timeoutMs,
        maximumResponseBytes: scenario.maximumResponseBytes,
        expectedStatuses: scenario.expectedStatuses,
        thresholds: scenario.thresholds,
      };
    }),
  };
}

function finiteNonnegative(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function normalizePhaseSummary(summary, runtime) {
  exactKeys(
    summary,
    ["schema", "phaseId", "durationMs", "vusMax", "scenarios"],
    "k6 phase summary",
  );
  if (
    summary.schema !== "starfiniti.k6-phase-summary.v1" ||
    summary.phaseId !== runtime.phase.id ||
    !finiteNonnegative(summary.durationMs) ||
    summary.durationMs < runtime.phase.durationSeconds * 950 ||
    summary.durationMs >
      runtime.phase.durationSeconds * 1_000 +
        (Math.max(...runtime.scenarios.map((scenario) => scenario.timeoutMs)) +
          120_000) *
          1.1 ||
    !Number.isSafeInteger(summary.vusMax) ||
    summary.vusMax < 1 ||
    !Array.isArray(summary.scenarios) ||
    summary.scenarios.length !== runtime.scenarios.length
  ) {
    fail("k6 phase summary identity or aggregate shape drifted");
  }
  const expectedScenarios = new Map(
    runtime.scenarios.map((scenario) => [scenario.id, scenario]),
  );
  const seen = new Set();
  const scenarios = summary.scenarios.map((observed) => {
    exactKeys(
      observed,
      [
        "scenarioId",
        "iterations",
        "droppedIterations",
        "completed",
        "errorCount",
        "errorRate",
        "expectedStatusCount",
        "unexpectedStatusCount",
        "networkErrorCount",
        "invalidResponseCount",
        "responseTooLargeCount",
        "responseBytes",
        "latencyMs",
      ],
      "k6 scenario summary",
    );
    const expected = expectedScenarios.get(observed.scenarioId);
    if (!expected || seen.has(observed.scenarioId)) {
      fail("k6 phase contains an unknown or duplicate scenario");
    }
    seen.add(observed.scenarioId);
    exactKeys(observed.latencyMs, ["p95", "p99", "maximum"], "k6 latency");
    for (const field of [
      "iterations",
      "droppedIterations",
      "completed",
      "errorCount",
      "expectedStatusCount",
      "unexpectedStatusCount",
      "networkErrorCount",
      "invalidResponseCount",
      "responseTooLargeCount",
      "responseBytes",
    ]) {
      if (!Number.isSafeInteger(observed[field]) || observed[field] < 0) {
        fail(`k6 ${expected.id} ${field} is invalid`);
      }
    }
    if (
      !finiteNonnegative(observed.errorRate) ||
      !finiteNonnegative(observed.latencyMs.p95) ||
      !finiteNonnegative(observed.latencyMs.p99) ||
      !finiteNonnegative(observed.latencyMs.maximum) ||
      observed.latencyMs.p95 > observed.latencyMs.p99 ||
      observed.latencyMs.p99 > observed.latencyMs.maximum
    ) {
      fail(`k6 ${expected.id} rate or latency is invalid`);
    }
    const classifiedErrors =
      observed.unexpectedStatusCount +
      observed.networkErrorCount +
      observed.invalidResponseCount +
      observed.responseTooLargeCount;
    const decisions = {
      exactSchedule:
        observed.iterations + observed.droppedIterations ===
        expected.expectedScheduled,
      noDrops: observed.droppedIterations === 0,
      completed:
        observed.completed === observed.iterations &&
        observed.expectedStatusCount +
          observed.unexpectedStatusCount +
          observed.networkErrorCount ===
          observed.completed,
      classifiedErrors:
        classifiedErrors === observed.errorCount &&
        Math.abs(
          observed.errorRate - observed.errorCount / expected.expectedScheduled,
        ) <= 0.000001,
      errorRate: observed.errorRate <= expected.thresholds.maximumErrorRate,
      p95: observed.latencyMs.p95 <= expected.thresholds.maximumP95Ms,
      p99: observed.latencyMs.p99 <= expected.thresholds.maximumP99Ms,
    };
    return {
      scenarioId: expected.id,
      adapter: expected.adapter,
      ratePerSecond: expected.ratePerSecond,
      arrivalRate: expected.arrivalRate,
      timeUnitSeconds: expected.timeUnitSeconds,
      expectedScheduled: expected.expectedScheduled,
      metrics: {
        scheduled: expected.expectedScheduled,
        completed: observed.completed,
        dropped: observed.droppedIterations,
        errorCount: observed.errorCount,
        errorRate: observed.errorRate,
        expectedStatusCount: observed.expectedStatusCount,
        unexpectedStatusCount: observed.unexpectedStatusCount,
        networkErrorCount: observed.networkErrorCount,
        invalidResponseCount: observed.invalidResponseCount,
        responseTooLargeCount: observed.responseTooLargeCount,
        responseBytes: observed.responseBytes,
        latencyMs: observed.latencyMs,
      },
      decisions,
      passed: Object.values(decisions).every(Boolean),
    };
  });
  const maximumVUs = runtime.scenarios.reduce(
    (total, scenario) => total + scenario.concurrencyLimit,
    0,
  );
  if (summary.vusMax > maximumVUs) {
    fail("k6 phase exceeded its closed VU allocation");
  }
  return {
    id: runtime.phase.id,
    measured: runtime.phase.measured,
    rateMultiplier: runtime.phase.rateMultiplier,
    durationSeconds: runtime.phase.durationSeconds,
    observedDurationMs: summary.durationMs,
    vusMax: summary.vusMax,
    scenarios,
    passed: scenarios.every((scenario) => scenario.passed),
  };
}

function safeDocker(args, options = {}) {
  const result = spawnSync("docker", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    timeout: options.timeout ?? 120_000,
    stdio: options.capture ? ["ignore", "pipe", "ignore"] : "ignore",
  });
  if (result.error) fail("Docker execution is unavailable");
  return result;
}

function dockerUserArguments() {
  if (
    process.platform === "win32" ||
    typeof process.getuid !== "function" ||
    typeof process.getgid !== "function"
  ) {
    fail("pinned k6 container verification requires a Linux caller identity");
  }
  return ["--user", `${process.getuid()}:${process.getgid()}`];
}

function inspectTool(plan) {
  const version = safeDocker(
    [
      "run",
      "--rm",
      "--network",
      "none",
      "--pull",
      "always",
      plan.image.reference,
      "version",
    ],
    { capture: true, timeout: 300_000 },
  );
  if (
    version.status !== 0 ||
    !new RegExp(
      `\\bk6 v${exactTool.version.replaceAll(".", "\\.")}\\b`,
      "u",
    ).test(version.stdout)
  ) {
    fail("pinned k6 container did not report the exact tool version");
  }
  const inspection = safeDocker(["image", "inspect", plan.image.reference], {
    capture: true,
  });
  if (inspection.status !== 0) fail("pinned k6 image cannot be inspected");
  let image;
  try {
    [image] = JSON.parse(inspection.stdout);
  } catch {
    fail("pinned k6 image inspection is malformed");
  }
  const expectedDigest = `grafana/k6@sha256:${plan.image.indexSha256}`;
  if (
    !Array.isArray(image.RepoDigests) ||
    !image.RepoDigests.includes(expectedDigest) ||
    typeof image.Id !== "string" ||
    !/^sha256:[0-9a-f]{64}$/u.test(image.Id) ||
    !["amd64", "arm64"].includes(image.Architecture)
  ) {
    fail("local k6 image provenance is incomplete or drifted");
  }
  if (
    image.Architecture === "amd64" &&
    plan.image.linuxAmd64ManifestSha256 !== exactTool.linuxAmd64ManifestSha256
  ) {
    fail("linux/amd64 k6 platform provenance drifted");
  }
  if (
    image.Architecture === "arm64" &&
    plan.image.linuxArm64ManifestSha256 !== exactTool.linuxArm64ManifestSha256
  ) {
    fail("linux/arm64 k6 platform provenance drifted");
  }
  return {
    name: plan.tool.name,
    version: plan.tool.version,
    license: plan.tool.license,
    sourceRepository: plan.tool.sourceRepository,
    releaseUrl: plan.tool.releaseUrl,
    imageReference: plan.image.reference,
    imageIndexSha256: plan.image.indexSha256,
    platformManifestSha256:
      image.Architecture === "amd64"
        ? plan.image.linuxAmd64ManifestSha256
        : plan.image.linuxArm64ManifestSha256,
    imageIdSha256: image.Id.slice("sha256:".length),
    architecture: image.Architecture,
  };
}

function writeExclusiveReport(path, report, forbidden) {
  if (!isAbsolute(path)) fail("report path must be absolute");
  const parent = dirname(path);
  const parentStatus = lstatSync(parent);
  if (
    !parentStatus.isDirectory() ||
    realpathSync(parent) !== resolve(parent) ||
    (process.platform !== "win32" && (parentStatus.mode & 0o022) !== 0) ||
    basename(path).length > 120
  ) {
    fail("report parent or file name is invalid");
  }
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  for (const value of forbidden) {
    if (value && serialized.includes(value)) {
      fail("minimized report contains request authority");
    }
  }
  const withoutReviewedToolUrls = serialized
    .replaceAll(exactTool.releaseUrl, "")
    .replaceAll("https://github.com/grafana/k6", "");
  if (/https?:\/\//iu.test(withoutReviewedToolUrls)) {
    fail("minimized report contains an unapproved raw URL");
  }
  writeFileSync(path, serialized, { flag: "wx", mode: 0o600 });
  const finalParentStatus = lstatSync(parent);
  if (
    !finalParentStatus.isDirectory() ||
    finalParentStatus.dev !== parentStatus.dev ||
    finalParentStatus.ino !== parentStatus.ino ||
    realpathSync(parent) !== resolve(parent)
  ) {
    fail("report parent changed during publication");
  }
}

function requestAuthorityMarkers(origin, loadedCredentials) {
  const forbidden = [origin.origin];
  for (const credential of loadedCredentials.values()) {
    if (typeof credential === "string") forbidden.push(credential);
    else {
      forbidden.push(
        credential.connectionId,
        credential.signingKey.toString("base64"),
      );
    }
  }
  return forbidden;
}

async function execute(options) {
  for (const name of [
    "config",
    "origin-file",
    "credential-dir",
    "approval-file",
    "out",
  ]) {
    if (typeof options[name] !== "string") fail(`--${name} is required`);
  }
  const resolvedConfig = resolve(root, options.config);
  if (resolvedConfig !== workloadPath) {
    fail("independent cross-check requires the canonical workload file");
  }
  const workload = YAML.parse(readFileSync(workloadPath, "utf8"));
  const bounds = validateWorkload(workload);
  const { plan, planSha256, script } = loadPlan(workload);
  const repository = repositoryState();
  const origin = readOrigin(options["origin-file"]);
  if (
    new Set([
      "loyalty.starfiniti.com",
      "hub.starfiniti.com",
      "auth.starfiniti.com",
    ]).has(origin.hostname)
  ) {
    fail("k6 cross-check cannot target a known production origin");
  }
  const originSha256 = digest(origin.origin);
  const workloadSha256 = documentDigest(workload);
  const approval = readApproval(options["approval-file"], {
    workloadSha256,
    candidateCommit: repository.commit,
    originSha256,
    publicTarget: true,
    mutates: true,
    ...bounds,
  });
  if (approval.approval.targetClass !== "disposable_staging") {
    fail("independent k6 cross-check requires disposable staging approval");
  }
  const loadedCredentials = loadCredentials(
    workload,
    options["credential-dir"],
  );
  const containerUser = dockerUserArguments();
  const tool = inspectTool(plan);
  const temporary = mkdtempSync(join(tmpdir(), "starfiniti-k6-"));
  const startedAt = new Date();
  const runSeed = digest(
    `${startedAt.toISOString()}:${randomBytes(32).toString("hex")}`,
  );
  const phases = [];
  let executionFailed = false;
  try {
    mkdirSync(join(temporary, "runtime"), { mode: 0o700 });
    mkdirSync(join(temporary, "output"), { mode: 0o700 });
    mkdirSync(join(temporary, "authority"), { mode: 0o700 });
    mkdirSync(join(temporary, "authority", "credentials"), { mode: 0o700 });
    const sealedScriptFile = join(temporary, "runtime", "k6-crosscheck.js");
    writeFileSync(sealedScriptFile, script, { flag: "wx", mode: 0o600 });
    const sealedOriginFile = join(temporary, "authority", "origin.txt");
    writeFileSync(sealedOriginFile, origin.origin, {
      flag: "wx",
      mode: 0o600,
    });
    for (const [fileName, credential] of loadedCredentials.entries()) {
      const value =
        typeof credential === "string"
          ? credential
          : JSON.stringify({
              connectionId: credential.connectionId,
              keyVersion: credential.keyVersion,
              signingKey: credential.signingKey.toString("base64"),
            });
      writeFileSync(
        join(temporary, "authority", "credentials", fileName),
        value,
        { flag: "wx", mode: 0o600 },
      );
    }
    for (const phase of workload.phases) {
      const runtime = phaseRuntime(workload, phase, runSeed);
      const runtimeFile = join(temporary, "runtime", "runtime.json");
      const summaryFile = join(temporary, "output", "summary.json");
      writeFileSync(runtimeFile, JSON.stringify(runtime), {
        flag: "wx",
        mode: 0o600,
      });
      const containerName = `starfiniti-k6-${randomBytes(8).toString("hex")}`;
      let result;
      try {
        result = safeDocker(
          [
            "run",
            "--name",
            containerName,
            "--rm",
            "--read-only",
            ...containerUser,
            "--cap-drop",
            "ALL",
            "--security-opt",
            "no-new-privileges",
            "--pids-limit",
            "256",
            "--memory",
            "1536m",
            "--cpus",
            "2",
            "--env",
            "K6_NO_USAGE_REPORT=true",
            "--mount",
            `type=bind,src=${runtimeFile},dst=/run/starfiniti/runtime.json,readonly`,
            "--mount",
            `type=bind,src=${sealedOriginFile},dst=/run/starfiniti/origin.txt,readonly`,
            "--mount",
            `type=bind,src=${join(temporary, "authority", "credentials")},dst=/run/starfiniti/credentials,readonly`,
            "--mount",
            `type=bind,src=${sealedScriptFile},dst=/run/starfiniti/k6-crosscheck.js,readonly`,
            "--mount",
            `type=bind,src=${join(temporary, "output")},dst=/out`,
            plan.image.reference,
            "run",
            "--quiet",
            "--no-color",
            "/run/starfiniti/k6-crosscheck.js",
          ],
          {
            timeout:
              (phase.durationSeconds +
                Math.max(
                  ...workload.scenarios.map((scenario) =>
                    Math.ceil(scenario.timeoutMs / 1_000),
                  ),
                ) +
                120) *
              1_000,
          },
        );
      } finally {
        safeDocker(["rm", "--force", containerName], { timeout: 30_000 });
      }
      let raw;
      try {
        raw = readRegularFile(summaryFile, "k6 phase summary", 1024 * 1024);
      } catch {
        executionFailed = true;
        break;
      }
      let summary;
      try {
        summary = JSON.parse(raw);
      } catch {
        fail("k6 phase summary is invalid JSON");
      }
      const normalized = normalizePhaseSummary(summary, runtime);
      phases.push(normalized);
      rmSync(summaryFile, { force: true });
      rmSync(runtimeFile, { force: true });
      if (result.status !== 0 || !normalized.passed) {
        executionFailed = true;
        break;
      }
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
  const requiredMeasured = new Set(["sustained", "burst", "recovery"]);
  for (const phase of phases) {
    if (phase.measured && phase.passed) requiredMeasured.delete(phase.id);
  }
  const passed =
    !executionFailed &&
    phases.length === workload.phases.length &&
    requiredMeasured.size === 0 &&
    phases.every((phase) => !phase.measured || phase.passed);
  const finalRepository = repositoryState();
  if (finalRepository.commit !== repository.commit) {
    fail("repository commit drifted during the k6 cross-check");
  }
  const report = {
    schema: "starfiniti.capacity-independent-run.v1",
    status: passed ? "passed" : "failed",
    candidateCommit: repository.commit,
    workloadProfile: workload.profile,
    workloadSha256,
    originSha256,
    approvalSha256: approval.approvalSha256,
    targetClass: approval.approval.targetClass,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    tool,
    planSha256,
    scriptSha256: plan.script.sha256,
    execution: {
      executor: plan.execution.executor,
      cloudOutputEnabled: false,
      usageReportEnabled: false,
      rawHttpOutputRetained: false,
      hostUserIdentity: true,
      productionAccess: false,
      productionMutated: false,
    },
    phases,
  };
  writeExclusiveReport(
    options.out,
    report,
    requestAuthorityMarkers(origin, loadedCredentials),
  );
  return report;
}

function syntheticSummary(runtime) {
  return {
    schema: "starfiniti.k6-phase-summary.v1",
    phaseId: runtime.phase.id,
    durationMs: runtime.phase.durationSeconds * 1_000,
    vusMax: Math.max(1, runtime.scenarios.length),
    scenarios: runtime.scenarios.map((scenario) => ({
      scenarioId: scenario.id,
      iterations: scenario.expectedScheduled,
      droppedIterations: 0,
      completed: scenario.expectedScheduled,
      errorCount: 0,
      errorRate: 0,
      expectedStatusCount: scenario.expectedScheduled,
      unexpectedStatusCount: 0,
      networkErrorCount: 0,
      invalidResponseCount: 0,
      responseTooLargeCount: 0,
      responseBytes: scenario.expectedScheduled * 2,
      latencyMs: { p95: 10, p99: 20, maximum: 30 },
    })),
  };
}

function selfTest() {
  const workload = YAML.parse(readFileSync(workloadPath, "utf8"));
  validateWorkload(workload);
  const { plan } = loadPlan(workload);
  const runtime = phaseRuntime(workload, workload.phases[1], "a".repeat(64));
  const passing = syntheticSummary(runtime);
  const normalized = normalizePhaseSummary(passing, runtime);
  if (!normalized.passed) fail("synthetic k6 normalization did not pass");
  const dropped = structuredClone(passing);
  dropped.scenarios[0].droppedIterations = 1;
  dropped.scenarios[0].iterations -= 1;
  if (normalizePhaseSummary(dropped, runtime).passed) {
    fail("self-test accepted dropped iterations");
  }
  const badRate = structuredClone(passing);
  badRate.scenarios[0].errorCount = 1;
  badRate.scenarios[0].errorRate = 1 / runtime.scenarios[0].expectedScheduled;
  badRate.scenarios[0].invalidResponseCount = 1;
  badRate.scenarios[0].expectedStatusCount -= 1;
  if (normalizePhaseSummary(badRate, runtime).passed) {
    fail("self-test accepted an error-rate breach");
  }
  const impossibleDuration = structuredClone(passing);
  impossibleDuration.durationMs = 0;
  try {
    normalizePhaseSummary(impossibleDuration, runtime);
    fail("self-test accepted an impossible phase duration");
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes("aggregate shape drifted")
    ) {
      throw error;
    }
  }
  const impossibleLatency = structuredClone(passing);
  impossibleLatency.scenarios[0].latencyMs.p95 = 30;
  impossibleLatency.scenarios[0].latencyMs.p99 = 20;
  try {
    normalizePhaseSummary(impossibleLatency, runtime);
    fail("self-test accepted non-monotonic latency aggregates");
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes("rate or latency is invalid")
    ) {
      throw error;
    }
  }
  const missing = structuredClone(passing);
  missing.scenarios.pop();
  try {
    normalizePhaseSummary(missing, runtime);
    fail("self-test accepted a missing scenario");
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes("aggregate shape drifted")
    ) {
      throw error;
    }
  }
  const extra = structuredClone(passing);
  extra.origin = "https://forbidden.example";
  try {
    normalizePhaseSummary(extra, runtime);
    fail("self-test accepted raw target evidence");
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes("unexpected shape")
    ) {
      throw error;
    }
  }
  if (
    plan.authority.productionAccess !== false ||
    plan.authority.capacityClaimApproved !== false
  ) {
    fail("self-test plan acquired false production authority");
  }
  const markerConnectionId = "00000000-0000-4000-a000-000000000001";
  const markerSigningKey = Buffer.alloc(32, 0x61);
  const markers = requestAuthorityMarkers(
    new URL("https://capacity.invalid"),
    new Map([
      [
        "woocommerce.json",
        {
          connectionId: markerConnectionId,
          keyVersion: "v1",
          signingKey: markerSigningKey,
        },
      ],
    ]),
  );
  if (
    markers.includes("v1") ||
    !markers.includes(markerConnectionId) ||
    !markers.includes(markerSigningKey.toString("base64"))
  ) {
    fail("request-authority markers mishandle public key-version selectors");
  }
  const reportDirectory = mkdtempSync(
    join(tmpdir(), "starfiniti-k6-report-self-test-"),
  );
  try {
    const reportFile = join(reportDirectory, "report.json");
    writeExclusiveReport(
      reportFile,
      {
        schema: "starfiniti.capacity-independent-run.v1",
        status: "failed",
      },
      markers,
    );
    if (!readFileSync(reportFile, "utf8").includes("independent-run.v1")) {
      fail("exclusive minimized report publication is incomplete");
    }
  } finally {
    rmSync(reportDirectory, { recursive: true, force: true });
  }
  const warmupRuntime = phaseRuntime(
    workload,
    workload.phases[0],
    "b".repeat(64),
  );
  const readiness = warmupRuntime.scenarios.find(
    (scenario) => scenario.id === "dashboard_readiness",
  );
  if (
    readiness.arrivalRate !== 5 ||
    readiness.timeUnitSeconds !== 2 ||
    readiness.expectedScheduled !== 300
  ) {
    fail("fractional fixed-arrival rate was not represented exactly");
  }
}

function containerSelfTest() {
  const workload = YAML.parse(readFileSync(workloadPath, "utf8"));
  validateWorkload(workload);
  const { plan } = loadPlan(workload);
  const containerUser = dockerUserArguments();
  inspectTool(plan);
  const temporary = mkdtempSync(join(tmpdir(), "starfiniti-k6-inspect-"));
  const credentials = join(temporary, "credentials");
  mkdirSync(credentials, { mode: 0o700 });
  try {
    const runtimeFile = join(temporary, "runtime.json");
    const originFile = join(temporary, "origin.txt");
    writeFileSync(
      runtimeFile,
      JSON.stringify(
        phaseRuntime(workload, workload.phases[0], "a".repeat(64)),
      ),
      { flag: "wx", mode: 0o600 },
    );
    writeFileSync(originFile, "https://capacity.invalid", {
      flag: "wx",
      mode: 0o600,
    });
    writeFileSync(join(credentials, "customer-cookie.txt"), "session=fixture", {
      flag: "wx",
      mode: 0o600,
    });
    writeFileSync(join(credentials, "service-api.token"), "fixture-token", {
      flag: "wx",
      mode: 0o600,
    });
    writeFileSync(
      join(credentials, "woocommerce.json"),
      JSON.stringify({
        connectionId: "00000000-0000-4000-a000-000000000001",
        keyVersion: "v1",
        signingKey: "YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE=",
      }),
      { flag: "wx", mode: 0o600 },
    );
    const result = safeDocker(
      [
        "run",
        "--rm",
        "--network",
        "none",
        "--read-only",
        ...containerUser,
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--mount",
        `type=bind,src=${runtimeFile},dst=/run/starfiniti/runtime.json,readonly`,
        "--mount",
        `type=bind,src=${originFile},dst=/run/starfiniti/origin.txt,readonly`,
        "--mount",
        `type=bind,src=${credentials},dst=/run/starfiniti/credentials,readonly`,
        "--mount",
        `type=bind,src=${scriptPath},dst=/run/starfiniti/k6-crosscheck.js,readonly`,
        plan.image.reference,
        "inspect",
        "/run/starfiniti/k6-crosscheck.js",
      ],
      { timeout: 120_000 },
    );
    if (result.status !== 0) {
      fail("pinned k6 could not inspect the cross-check script");
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const options = parseArguments(process.argv.slice(2));
  if (options.containerSelfTest) {
    containerSelfTest();
    console.log(
      "Validated the exact pinned k6 image identity and inspected the cross-check script without network access or target requests.",
    );
  } else if (options.selfTest) {
    selfTest();
    console.log(
      "Validated the pinned k6 plan, exact workload translation, minimized phase schema, and false-pass cases without contacting a target.",
    );
  } else {
    const report = await execute(options);
    console.log(
      `Independent k6 capacity cross-check ${report.status}; only minimized aggregate evidence was retained.`,
    );
    if (report.status !== "passed") process.exitCode = 1;
  }
}
