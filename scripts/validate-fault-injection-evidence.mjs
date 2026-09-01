import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
} from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

import { documentDigest, validateFaultPlan } from "./run-fault-injection.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const evidencePath = join(root, "docs/plan/evidence/M15/fault-injection.yaml");
const planPath = join(root, "infrastructure/testing/fault-injection/plan.yaml");
const tasksPath = join(root, "docs/plan/TASKS.yaml");
const evidence = YAML.parse(readFileSync(evidencePath, "utf8"));
const plan = YAML.parse(readFileSync(planPath, "utf8"));
const tasks = YAML.parse(readFileSync(tasksPath, "utf8"));

const requiredChecks = new Set([
  "plan_contract",
  "controller_selftest",
  "disposable_target_guard",
  "deterministic_restore",
  "minimized_report",
  "exact_head_ci",
  "approved_environment",
  "exact_environment_inventory",
  "proxy_routing_verified",
  "monitoring_coverage",
  "baseline_reconciliation",
  "worker_death_before_effect",
  "worker_death_after_effect",
  "network_delay",
  "duplicate_delivery",
  "database_crash_recovery",
  "wal_integrity",
  "provider_outage",
  "retry_storm_bounded",
  "queue_recovery",
  "checkout_independence",
  "idempotency_and_ledger",
  "coupon_reconciliation",
  "no_data_loss",
  "repeatability",
  "operator_observation",
  "final_reconciliation",
]);
const scenarioAdapters = new Map([
  ["worker_sigkill", "docker_service_sigkill"],
  ["database_crash_restart", "docker_service_sigkill"],
  ["network_latency", "toxiproxy_latency"],
  ["duplicate_delivery", "duplicate_http_replay"],
  ["provider_outage", "toxiproxy_disable"],
  ["retry_storm", "toxiproxy_disable_with_replay"],
]);
const allowedStatuses = new Set(["passed", "pending", "failed"]);
const pendingLanguagePattern =
  /\b(await|pending|remain|requires?|must|not yet|has not|will|future|todo)\b/iu;
const uuidPattern =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/iu;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu;
const secretValuePattern =
  /\b(?:sk_(?:live|test)|whsec_|sflt_v1_|eyJ[A-Za-z0-9_-]{20,})[A-Za-z0-9_=-]*\b/u;
const secretKeyPattern =
  /(secret|token|cookie|password|authorization|signature|signingkey|rawbody|requestbody|responsebody|customerid|connectionid|orderid|providerpayload)$/iu;

function fail(message) {
  throw new Error(`Fault evidence invalid: ${message}`);
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

function scanSensitive(value, path = "evidence") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanSensitive(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (secretKeyPattern.test(key)) {
        fail(`forbidden sensitive key ${path}.${key}`);
      }
      scanSensitive(child, `${path}.${key}`);
    }
    return;
  }
  if (typeof value === "string") {
    if (uuidPattern.test(value))
      fail(`forbidden raw resource identifier at ${path}`);
    if (emailPattern.test(value)) fail(`forbidden email identity at ${path}`);
    if (secretValuePattern.test(value))
      fail(`forbidden credential material at ${path}`);
  }
}

function readBoundArtifact(relativePath, expectedDigest, extension) {
  if (
    typeof relativePath !== "string" ||
    !new RegExp(
      `^docs/plan/evidence/M15/runs/[a-z0-9][a-z0-9-]{2,79}\\.${extension}$`,
      "u",
    ).test(relativePath)
  ) {
    fail(`artifact path must be a safe M15 ${extension} file`);
  }
  if (
    typeof expectedDigest !== "string" ||
    !/^[0-9a-f]{64}$/u.test(expectedDigest) ||
    /^0{64}$/u.test(expectedDigest)
  ) {
    fail("artifact digest must be exact and nonzero");
  }
  const artifactRoot = resolve(root, "docs/plan/evidence/M15/runs");
  const absolute = resolve(root, relativePath);
  if (!absolute.startsWith(`${artifactRoot}${sep}`)) {
    fail("artifact path escapes the M15 evidence root");
  }
  const maximumBytes = extension === "json" ? 1024 * 1024 : 256 * 1024;
  let descriptor;
  let raw;
  try {
    descriptor = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
    const status = fstatSync(descriptor);
    const linkStatus = lstatSync(absolute);
    if (
      !linkStatus.isFile() ||
      !status.isFile() ||
      status.dev !== linkStatus.dev ||
      status.ino !== linkStatus.ino ||
      status.size < 1 ||
      status.size > maximumBytes
    ) {
      fail("fault artifact is not a bounded stable file");
    }
    raw = Buffer.alloc(status.size);
    let offset = 0;
    while (offset < raw.length) {
      const bytesRead = readSync(
        descriptor,
        raw,
        offset,
        raw.length - offset,
        offset,
      );
      if (bytesRead === 0) fail("fault artifact changed while reading");
      offset += bytesRead;
    }
  } catch {
    fail(`artifact ${relativePath} is unreadable`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  const actualDigest = createHash("sha256").update(raw).digest("hex");
  if (actualDigest !== expectedDigest) {
    fail(`artifact digest drifted for ${relativePath}`);
  }
  let parsed;
  try {
    const text = raw.toString("utf8");
    parsed = extension === "json" ? JSON.parse(text) : YAML.parse(text);
  } catch {
    fail(`artifact ${relativePath} is invalid ${extension}`);
  }
  scanSensitive(parsed, relativePath);
  return parsed;
}

function validateProbeSummary(summary, label, recovery = false) {
  if (
    !summary ||
    !Number.isSafeInteger(summary.attempted) ||
    !Number.isSafeInteger(summary.passed) ||
    summary.attempted !== 2 ||
    summary.passed !== 2 ||
    summary.healthy !== true ||
    typeof summary.maximumLatencyMs !== "number" ||
    summary.maximumLatencyMs < 0 ||
    Object.values(summary.statusTotals ?? {}).some(
      (count) => !Number.isSafeInteger(count) || count < 0,
    ) ||
    Object.values(summary.statusTotals ?? {}).reduce(
      (total, count) => total + count,
      0,
    ) !== summary.attempted ||
    Object.keys(summary.failureTotals ?? {}).length !== 0
  ) {
    fail(`${label} public probes did not pass exactly`);
  }
  if (
    recovery &&
    (!Number.isSafeInteger(summary.attempts) ||
      summary.attempts < 1 ||
      typeof summary.recoveredInMs !== "number" ||
      summary.recoveredInMs < 0)
  ) {
    fail(`${label} recovery timing is invalid`);
  }
}

function validateDuringProbeSummary(summary, label) {
  const statusCount = Object.values(summary?.statusTotals ?? {}).reduce(
    (total, count) => total + count,
    0,
  );
  const failureCount = Object.values(summary?.failureTotals ?? {}).reduce(
    (total, count) => total + count,
    0,
  );
  if (
    !summary ||
    summary.attempted !== 2 ||
    !Number.isSafeInteger(summary.passed) ||
    summary.passed < 0 ||
    summary.passed > 2 ||
    typeof summary.maximumLatencyMs !== "number" ||
    summary.maximumLatencyMs < 0 ||
    Object.values(summary.statusTotals ?? {}).some(
      (count) => !Number.isSafeInteger(count) || count < 0,
    ) ||
    Object.values(summary.failureTotals ?? {}).some(
      (count) => !Number.isSafeInteger(count) || count < 0,
    ) ||
    statusCount !== 2 ||
    failureCount !== 2 - summary.passed ||
    summary.healthy !== (summary.passed === 2)
  ) {
    fail(`${label} during-fault probes are internally inconsistent`);
  }
}

function validateFaultRun(report, candidateEvidence, label) {
  if (
    report?.schema !== "starfiniti.fault-run.v1" ||
    report.status !== "passed" ||
    report.candidateCommit !== candidateEvidence.candidate.commit ||
    report.planProfile !== candidateEvidence.plan.profile ||
    report.planSha256 !== candidateEvidence.plan.sha256 ||
    report.targetClass !== "disposable_staging"
  ) {
    fail(`${label} run identity or status is invalid`);
  }
  for (const digest of [
    report.controlSha256,
    report.approvalSha256,
    report.markerSha256,
    report.composeSha256,
    report.fixtureSetSha256,
  ]) {
    if (!/^[0-9a-f]{64}$/u.test(digest) || /^0{64}$/u.test(digest)) {
      fail(`${label} run contains an invalid bound digest`);
    }
  }
  exactUtc(report.startedAt, `${label} startedAt`);
  exactUtc(report.finishedAt, `${label} finishedAt`);
  if (Date.parse(report.finishedAt) <= Date.parse(report.startedAt)) {
    fail(`${label} run interval is invalid`);
  }
  if (!Array.isArray(report.scenarios) || report.scenarios.length !== 6) {
    fail(`${label} run scenario coverage is incomplete`);
  }
  const expectedScenarios = new Map(
    plan.scenarios.map((item) => [item.id, item]),
  );
  const seen = new Set();
  for (const scenario of report.scenarios) {
    const expected = expectedScenarios.get(scenario.id);
    if (
      !expected ||
      seen.has(scenario.id) ||
      scenario.adapter !== scenarioAdapters.get(scenario.id) ||
      scenario.adapter !== expected.adapter ||
      scenario.applied !== true ||
      scenario.restored !== true ||
      scenario.failure !== null ||
      scenario.passed !== true
    ) {
      fail(
        `${label} scenario ${scenario.id ?? "unknown"} did not apply and restore exactly`,
      );
    }
    seen.add(scenario.id);
    exactUtc(scenario.startedAt, `${label} ${scenario.id} startedAt`);
    exactUtc(scenario.finishedAt, `${label} ${scenario.id} finishedAt`);
    if (Date.parse(scenario.finishedAt) < Date.parse(scenario.startedAt)) {
      fail(`${label} scenario ${scenario.id} interval is invalid`);
    }
    validateProbeSummary(scenario.baseline, `${label} ${scenario.id} baseline`);
    validateDuringProbeSummary(
      scenario.during,
      `${label} scenario ${scenario.id}`,
    );
    validateProbeSummary(
      scenario.recovery,
      `${label} ${scenario.id} recovery`,
      true,
    );
    const expectsReplay = Object.hasOwn(expected, "requestCount");
    if (expectsReplay) {
      if (
        scenario.replay?.scheduled !== expected.requestCount ||
        scenario.replay?.completed !== expected.requestCount ||
        scenario.replay?.dropped !== 0 ||
        scenario.replay?.failed !== 0 ||
        !Number.isSafeInteger(scenario.replay?.failed) ||
        !Number.isSafeInteger(scenario.replay?.dropped)
      ) {
        fail(`${label} scenario ${scenario.id} replay counts drifted`);
      }
    } else if (scenario.replay !== null) {
      fail(`${label} scenario ${scenario.id} contains an unexpected replay`);
    }
  }
  if (seen.size !== scenarioAdapters.size) {
    fail(`${label} run is missing a canonical fault scenario`);
  }
}

function validateEnvironment(environment, candidateEvidence) {
  const requiredComponents = [
    "dashboard",
    "worker",
    "database",
    "proxy",
    "storefront",
    "woocommerce",
  ];
  if (
    environment?.schema !== "starfiniti.fault-environment.v1" ||
    environment.candidateCommit !== candidateEvidence.candidate.commit ||
    environment.planSha256 !== candidateEvidence.plan.sha256 ||
    environment.targetClass !== "disposable_staging" ||
    !/^[0-9a-f]{64}$/u.test(environment.markerSha256) ||
    !/^[0-9a-f]{64}$/u.test(environment.composeSha256) ||
    environment.proxyRoutesVerified !== true ||
    !Array.isArray(environment.components) ||
    environment.components.length !== requiredComponents.length ||
    !Array.isArray(environment.monitoring) ||
    environment.monitoring.length < 8
  ) {
    fail(
      "fault environment identity routing or monitoring evidence is invalid",
    );
  }
  const components = new Set();
  for (const component of environment.components) {
    if (
      !requiredComponents.includes(component?.id) ||
      components.has(component.id) ||
      typeof component.version !== "string" ||
      component.version.length < 3 ||
      component.version.length > 160 ||
      typeof component.digest !== "string" ||
      !/^[0-9a-f]{64}$/u.test(component.digest)
    ) {
      fail("fault environment component inventory is invalid");
    }
    components.add(component.id);
  }
  if (components.size !== requiredComponents.length) {
    fail("fault environment component inventory is incomplete");
  }
  const requiredMonitoring = new Set([
    "application",
    "database_pool",
    "queue",
    "wal",
    "storage",
    "proxy",
    "checkout",
    "driver",
  ]);
  if (
    new Set(environment.monitoring).size !== environment.monitoring.length ||
    [...requiredMonitoring].some((id) => !environment.monitoring.includes(id))
  ) {
    fail("fault environment monitoring coverage is incomplete");
  }
}

function validateReconciliation(
  reconciliation,
  candidateEvidence,
  primaryRawDigest,
  repeatRawDigest,
) {
  const requiredDifferences = [
    "acceptedVsCanonical",
    "canonicalVsEffect",
    "effectVsLedger",
    "walletVsLedger",
    "wooVsCoupon",
    "duplicateBusinessEffects",
    "lostCommittedEffects",
    "unrecoveredQueueItems",
    "checkoutFailures",
    "walErrors",
  ];
  if (
    reconciliation?.schema !== "starfiniti.fault-reconciliation.v1" ||
    reconciliation.candidateCommit !== candidateEvidence.candidate.commit ||
    reconciliation.planSha256 !== candidateEvidence.plan.sha256 ||
    reconciliation.primaryRunSha256 !== primaryRawDigest ||
    reconciliation.repeatRunSha256 !== repeatRawDigest ||
    reconciliation.observationComplete !== true ||
    !reconciliation.differences ||
    Object.keys(reconciliation.differences).length !==
      requiredDifferences.length
  ) {
    fail("fault reconciliation identity or observation evidence is invalid");
  }
  for (const id of requiredDifferences) {
    if (reconciliation.differences[id] !== 0) {
      fail(`fault reconciliation difference ${id} is not zero`);
    }
  }
}

export function validateDocument(
  candidateEvidence,
  candidatePlan = plan,
  candidateTasks = tasks,
) {
  validateFaultPlan(candidatePlan);
  if (
    candidateEvidence?.schema !== "starfiniti.fault-evidence.v1" ||
    !["in_progress", "complete"].includes(candidateEvidence.status)
  ) {
    fail("manifest identity or status is invalid");
  }
  exactUtc(candidateEvidence.observedAt, "observedAt");
  if (
    !/^v\d+\.\d+\.\d+$/u.test(candidateEvidence.currentProduction?.release) ||
    !/^[0-9a-f]{40}$/u.test(
      candidateEvidence.currentProduction?.applicationCommit,
    )
  ) {
    fail("current production identity is invalid");
  }
  if (
    !/^codex\/[a-z0-9][a-z0-9-]{2,99}$/u.test(
      candidateEvidence.candidate?.branch,
    ) ||
    !/^[0-9a-f]{40}$/u.test(candidateEvidence.candidate?.commit) ||
    /^0{40}$/u.test(candidateEvidence.candidate.commit) ||
    typeof candidateEvidence.candidate.approvedEnvironment !== "boolean" ||
    typeof candidateEvidence.candidate.reconciliationApproved !== "boolean"
  ) {
    fail("candidate identity or approvals are invalid");
  }
  if (
    candidateEvidence.plan?.path !==
      "infrastructure/testing/fault-injection/plan.yaml" ||
    candidateEvidence.plan.profile !== candidatePlan.profile ||
    candidateEvidence.plan.sha256 !== documentDigest(candidatePlan)
  ) {
    fail("fault plan path profile or digest drifted");
  }
  if (!Array.isArray(candidateEvidence.checks)) fail("checks must be an array");
  const checkIds = new Set();
  for (const check of candidateEvidence.checks) {
    if (!requiredChecks.has(check.id)) fail(`unknown check ${check.id}`);
    if (checkIds.has(check.id)) fail(`duplicate check ${check.id}`);
    checkIds.add(check.id);
    if (!allowedStatuses.has(check.status))
      fail(`invalid status for ${check.id}`);
    if (
      typeof check.evidence !== "string" ||
      check.evidence.length < 45 ||
      check.evidence.length > 700
    ) {
      fail(`evidence for ${check.id} must be bounded and substantive`);
    }
    if (
      check.status === "passed" &&
      pendingLanguagePattern.test(check.evidence)
    ) {
      fail(`passed check ${check.id} contains forward-looking evidence`);
    }
  }
  const missing = [...requiredChecks].filter((id) => !checkIds.has(id));
  if (missing.length) fail(`missing check ${missing.join(", ")}`);
  if (
    !Array.isArray(candidateEvidence.automaticFails) ||
    candidateEvidence.automaticFails.length < 16 ||
    new Set(candidateEvidence.automaticFails).size !==
      candidateEvidence.automaticFails.length ||
    candidateEvidence.automaticFails.some(
      (rule) => typeof rule !== "string" || rule.length < 50,
    )
  ) {
    fail("automatic failures require sixteen unique substantive rules");
  }
  scanSensitive(candidateEvidence);
  const checks = new Map(
    candidateEvidence.checks.map((check) => [check.id, check]),
  );
  if (
    candidateEvidence.candidate.approvedEnvironment !==
    (checks.get("approved_environment")?.status === "passed")
  ) {
    fail("approvedEnvironment must match approved_environment check");
  }
  if (
    candidateEvidence.candidate.reconciliationApproved !==
    (checks.get("final_reconciliation")?.status === "passed")
  ) {
    fail("reconciliationApproved must match final_reconciliation check");
  }
  const m15 = candidateTasks.tasks?.find(
    (task) => task.id === "M15-GA-HARDENING",
  );
  const s02 = m15?.slices?.find(
    (slice) => slice.id === "M15-S02-FAULT-INJECTION",
  );
  if (!m15 || !s02) fail("M15-S02 task graph is missing");
  const incomplete = candidateEvidence.checks.filter(
    (check) => check.status !== "passed",
  );
  const artifactEntries = Object.entries(candidateEvidence.artifacts ?? {});
  if (artifactEntries.length !== 8) fail("artifact binding shape is invalid");
  if (candidateEvidence.status === "complete") {
    if (
      !candidateEvidence.candidate.approvedEnvironment ||
      !candidateEvidence.candidate.reconciliationApproved ||
      incomplete.length ||
      artifactEntries.some(([, value]) => value === null) ||
      s02.status !== "complete" ||
      m15.status !== "in_progress"
    ) {
      fail(
        "complete fault evidence requires approvals checks artifacts and completed S02",
      );
    }
    const environment = readBoundArtifact(
      candidateEvidence.artifacts.environmentPath,
      candidateEvidence.artifacts.environmentSha256,
      "yaml",
    );
    const primary = readBoundArtifact(
      candidateEvidence.artifacts.primaryRunPath,
      candidateEvidence.artifacts.primaryRunSha256,
      "json",
    );
    const repeat = readBoundArtifact(
      candidateEvidence.artifacts.repeatRunPath,
      candidateEvidence.artifacts.repeatRunSha256,
      "json",
    );
    const reconciliation = readBoundArtifact(
      candidateEvidence.artifacts.reconciliationPath,
      candidateEvidence.artifacts.reconciliationSha256,
      "yaml",
    );
    validateEnvironment(environment, candidateEvidence);
    validateFaultRun(primary, candidateEvidence, "primary");
    validateFaultRun(repeat, candidateEvidence, "repeat");
    if (
      primary.markerSha256 !== repeat.markerSha256 ||
      primary.composeSha256 !== repeat.composeSha256 ||
      environment.markerSha256 !== primary.markerSha256 ||
      environment.composeSha256 !== primary.composeSha256
    ) {
      fail("primary and repeat runs target different evidence");
    }
    validateReconciliation(
      reconciliation,
      candidateEvidence,
      candidateEvidence.artifacts.primaryRunSha256,
      candidateEvidence.artifacts.repeatRunSha256,
    );
  } else {
    if (
      artifactEntries.some(([, value]) => value !== null) ||
      s02.status !== "in_progress" ||
      m15.status !== "in_progress"
    ) {
      fail(
        "in-progress fault evidence must keep artifacts null and S02 active",
      );
    }
  }
  return { incomplete };
}

const result = validateDocument(evidence);

if (process.argv.includes("--self-test")) {
  const expectRejected = (
    candidate,
    message,
    label,
    candidatePlan = plan,
    candidateTasks = tasks,
  ) => {
    try {
      validateDocument(candidate, candidatePlan, candidateTasks);
    } catch (error) {
      if (error instanceof Error && error.message.includes(message)) return;
      throw error;
    }
    fail(`self-test accepted ${label}`);
  };
  const falseComplete = structuredClone(evidence);
  falseComplete.status = "complete";
  expectRejected(
    falseComplete,
    "requires approvals checks artifacts",
    "false completion",
  );
  const missing = structuredClone(evidence);
  missing.checks.pop();
  expectRejected(missing, "missing check", "missing check");
  const duplicate = structuredClone(evidence);
  duplicate.checks.push(structuredClone(duplicate.checks[0]));
  expectRejected(duplicate, "duplicate check", "duplicate check");
  const forwardPass = structuredClone(evidence);
  forwardPass.checks[0].evidence =
    "The canonical plan will be tested in a future window before this repository control is accepted.";
  expectRejected(forwardPass, "forward-looking", "forward-looking pass");
  const sensitiveKey = structuredClone(evidence);
  sensitiveKey.requestBody = "unsafe";
  expectRejected(sensitiveKey, "forbidden sensitive key", "sensitive key");
  const rawId = structuredClone(evidence);
  rawId.checks[0].evidence =
    "Unsafe raw selector 94000000-0000-4000-8000-000000000003 entered the evidence record.";
  expectRejected(rawId, "raw resource identifier", "raw identifier");
  const digestDrift = structuredClone(evidence);
  digestDrift.plan.sha256 = "f".repeat(64);
  expectRejected(digestDrift, "plan path profile or digest", "plan drift");
  const weakFails = structuredClone(evidence);
  weakFails.automaticFails = weakFails.automaticFails.slice(0, 5);
  expectRejected(weakFails, "sixteen unique", "weak automatic failures");
  const taskDrift = structuredClone(tasks);
  taskDrift.tasks
    .find((task) => task.id === "M15-GA-HARDENING")
    .slices.find((slice) => slice.id === "M15-S02-FAULT-INJECTION").status =
    "planned";
  expectRejected(evidence, "S02 active", "task drift", plan, taskDrift);
  const missingScenario = structuredClone(plan);
  missingScenario.scenarios.pop();
  try {
    validateFaultPlan(missingScenario);
    fail("self-test accepted a missing fault scenario");
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("six canonical")) {
      throw error;
    }
  }
  const healthyProbe = {
    attempted: 2,
    passed: 2,
    maximumLatencyMs: 10,
    statusTotals: { 200: 2 },
    failureTotals: {},
    healthy: true,
  };
  const syntheticRun = {
    schema: "starfiniti.fault-run.v1",
    status: "passed",
    candidateCommit: evidence.candidate.commit,
    planProfile: evidence.plan.profile,
    planSha256: evidence.plan.sha256,
    controlSha256: "a".repeat(64),
    approvalSha256: "b".repeat(64),
    markerSha256: "c".repeat(64),
    composeSha256: "d".repeat(64),
    fixtureSetSha256: "e".repeat(64),
    targetClass: "disposable_staging",
    startedAt: "2026-08-27T06:00:00.000Z",
    finishedAt: "2026-08-27T06:20:00.000Z",
    scenarios: plan.scenarios.map((scenario) => ({
      id: scenario.id,
      adapter: scenario.adapter,
      startedAt: "2026-08-27T06:00:00.000Z",
      finishedAt: "2026-08-27T06:03:00.000Z",
      applied: true,
      restored: true,
      baseline: structuredClone(healthyProbe),
      during: structuredClone(healthyProbe),
      recovery: {
        ...structuredClone(healthyProbe),
        attempts: 1,
        recoveredInMs: 100,
      },
      replay: Object.hasOwn(scenario, "requestCount")
        ? {
            scheduled: scenario.requestCount,
            completed: scenario.requestCount,
            dropped: 0,
            failed: 0,
          }
        : null,
      failure: null,
      passed: true,
    })),
  };
  validateFaultRun(syntheticRun, evidence, "synthetic");
  const droppedReplay = structuredClone(syntheticRun);
  const replayScenario = droppedReplay.scenarios.find(
    (scenario) => scenario.id === "retry_storm",
  );
  replayScenario.replay.dropped = 1;
  replayScenario.replay.completed -= 1;
  try {
    validateFaultRun(droppedReplay, evidence, "synthetic");
    fail("self-test accepted a dropped replay schedule");
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("replay counts")) {
      throw error;
    }
  }
  const inconsistentProbe = structuredClone(syntheticRun);
  inconsistentProbe.scenarios[0].during.failureTotals = {
    request_failed: 1,
  };
  try {
    validateFaultRun(inconsistentProbe, evidence, "synthetic");
    fail("self-test accepted inconsistent during-fault probes");
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes("internally inconsistent")
    ) {
      throw error;
    }
  }
}

console.log(
  `Validated ${evidence.checks.length} M15 fault checks and ${plan.scenarios.length} bounded scenarios; ${evidence.checks.filter((check) => check.status === "passed").length} passed and ${result.incomplete.length} remain non-passing.`,
);
