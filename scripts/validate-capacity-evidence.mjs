import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const evidencePath = join(root, "docs/plan/evidence/M15/capacity.yaml");
const workloadPath = join(
  root,
  "infrastructure/testing/capacity/workload.yaml",
);
const tasksPath = join(root, "docs/plan/TASKS.yaml");
const evidence = YAML.parse(readFileSync(evidencePath, "utf8"));
const workload = YAML.parse(readFileSync(workloadPath, "utf8"));
const tasks = YAML.parse(readFileSync(tasksPath, "utf8"));

const requiredChecks = new Set([
  "workload_contract",
  "fixed_arrival_runner",
  "domain_adapters",
  "approval_target_guard",
  "minimized_report",
  "independent_driver_crosscheck",
  "exact_head_ci",
  "approved_environment",
  "exact_environment_inventory",
  "production_like_data_shape",
  "monitoring_coverage",
  "driver_headroom",
  "sustained_phase",
  "burst_phase",
  "recovery_phase",
  "wallet_latency",
  "event_to_ledger_latency",
  "request_reconciliation",
  "ledger_reconciliation",
  "woocommerce_reconciliation",
  "repeatability",
  "supported_limit_documented",
]);
const allowedStatuses = new Set(["passed", "pending", "failed"]);
const uuidPattern =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/iu;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu;
const serviceTokenPattern = /\bsflt_v1_[0-9a-f]{32}_[A-Za-z0-9_-]{43}\b/u;
const secretKeyPattern =
  /(secret|token|cookie|password|authorization|signature|signingkey|rawbody|responsebody|customerid|connectionid)$/iu;
const pendingLanguagePattern =
  /\b(await|pending|remain|requires?|must|not yet|has not|will|future|todo)\b/iu;

function fail(message) {
  throw new Error(`Capacity evidence invalid: ${message}`);
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

function digestDocument(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalJson(value)))
    .digest("hex");
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

function readBoundEvidence(relativePath, expectedDigest, extension) {
  if (
    typeof relativePath !== "string" ||
    !new RegExp(
      `^docs/plan/evidence/M15/runs/[a-z0-9][a-z0-9-]{2,79}\\.${extension}$`,
      "u",
    ).test(relativePath)
  ) {
    fail(`capacity evidence path must be a safe M15 ${extension} file`);
  }
  if (
    typeof expectedDigest !== "string" ||
    !/^[0-9a-f]{64}$/u.test(expectedDigest) ||
    /^0{64}$/u.test(expectedDigest)
  ) {
    fail("capacity evidence digest must be exact and nonzero");
  }
  const evidenceRoot = resolve(root, "docs/plan/evidence/M15/runs");
  const absolute = resolve(root, relativePath);
  if (!absolute.startsWith(`${evidenceRoot}${sep}`)) {
    fail("capacity evidence path escapes its evidence root");
  }
  let raw;
  try {
    raw = readFileSync(absolute, "utf8");
  } catch {
    fail(`capacity evidence file ${relativePath} is unreadable`);
  }
  const actualDigest = createHash("sha256").update(raw).digest("hex");
  if (actualDigest !== expectedDigest) {
    fail(`capacity evidence digest drifted for ${relativePath}`);
  }
  let parsed;
  try {
    parsed = extension === "json" ? JSON.parse(raw) : YAML.parse(raw);
  } catch {
    fail(`capacity evidence file ${relativePath} is invalid ${extension}`);
  }
  scanSensitive(parsed, relativePath);
  return parsed;
}

function validateCapacityRun(
  report,
  candidateEvidence,
  label,
  candidateWorkload = workload,
) {
  if (
    report?.schema !== "starfiniti.capacity-run.v1" ||
    report.status !== "passed" ||
    report.candidateCommit !== candidateEvidence.candidate.commit ||
    report.workloadProfile !== candidateEvidence.workload.profile ||
    report.workloadSha256 !== candidateEvidence.workload.sha256 ||
    report.targetClass !== "disposable_staging"
  ) {
    fail(`${label} report identity or status is invalid`);
  }
  if (
    !/^[0-9a-f]{64}$/u.test(report.originSha256) ||
    !/^[0-9a-f]{64}$/u.test(report.approvalSha256)
  ) {
    fail(`${label} report target and approval digests are invalid`);
  }
  exactUtcTimestamp(report.startedAt, `${label} startedAt`);
  exactUtcTimestamp(report.finishedAt, `${label} finishedAt`);
  if (Date.parse(report.finishedAt) <= Date.parse(report.startedAt)) {
    fail(`${label} report interval is invalid`);
  }
  const expectedDriverDecisions = {
    cpu:
      typeof report.driver?.cpuPercent === "number" &&
      report.driver.cpuPercent <= candidateWorkload.driver.maximumCpuPercent,
    memory:
      typeof report.driver?.peakMemoryMiB === "number" &&
      report.driver.peakMemoryMiB <= candidateWorkload.driver.maximumMemoryMiB,
    eventLoop:
      typeof report.driver?.eventLoopP95Ms === "number" &&
      report.driver.eventLoopP95Ms <=
        candidateWorkload.driver.maximumEventLoopP95Ms,
  };
  if (
    Object.keys(report.driverDecisions ?? {}).length !== 3 ||
    Object.entries(expectedDriverDecisions).some(
      ([key, value]) => value !== true || report.driverDecisions[key] !== value,
    )
  ) {
    fail(`${label} driver headroom did not pass`);
  }
  if (
    !Array.isArray(report.phases) ||
    report.phases.length !== candidateWorkload.phases.length
  ) {
    fail(`${label} phases are absent or drifted`);
  }
  const workloadPhases = new Map(
    candidateWorkload.phases.map((phase) => [phase.id, phase]),
  );
  const workloadScenarios = new Map(
    candidateWorkload.scenarios.map((scenario) => [scenario.id, scenario]),
  );
  const seenPhases = new Set();
  const requiredPhases = new Set(["sustained", "burst", "recovery"]);
  for (const phase of report.phases) {
    const expectedPhase = workloadPhases.get(phase.id);
    if (
      !expectedPhase ||
      seenPhases.has(phase.id) ||
      phase.measured !== expectedPhase.measured ||
      phase.rateMultiplier !== expectedPhase.rateMultiplier ||
      !Array.isArray(phase.scenarios) ||
      phase.scenarios.length !== workloadScenarios.size
    ) {
      fail(`${label} phase ${phase.id} identity or scenario set drifted`);
    }
    seenPhases.add(phase.id);
    const seenScenarios = new Set();
    const scenarioPasses = [];
    for (const scenario of phase.scenarios) {
      const expectedScenario = workloadScenarios.get(scenario.scenarioId);
      if (
        !expectedScenario ||
        seenScenarios.has(scenario.scenarioId) ||
        scenario.adapter !== expectedScenario.adapter
      ) {
        fail(`${label} scenario ${phase.id}/${scenario.scenarioId} drifted`);
      }
      seenScenarios.add(scenario.scenarioId);
      const expectedRate =
        expectedScenario.ratePerSecond * expectedPhase.rateMultiplier;
      const expectedScheduled = Math.max(
        1,
        Math.floor(expectedRate * expectedPhase.durationSeconds),
      );
      const metrics = scenario.metrics;
      if (
        typeof scenario.ratePerSecond !== "number" ||
        Math.abs(scenario.ratePerSecond - expectedRate) > 0.001 ||
        metrics?.scheduled !== expectedScheduled ||
        !Number.isSafeInteger(metrics.completed) ||
        !Number.isSafeInteger(metrics.dropped) ||
        !Number.isSafeInteger(metrics.errorCount) ||
        metrics.completed < 0 ||
        metrics.dropped < 0 ||
        metrics.errorCount < 0 ||
        metrics.completed + metrics.dropped !== metrics.scheduled ||
        metrics.dropped !== 0 ||
        typeof metrics.errorRate !== "number" ||
        Math.abs(metrics.errorRate - metrics.errorCount / metrics.scheduled) >
          0.000001 ||
        Object.values(metrics.statusTotals ?? {}).some(
          (value) => !Number.isSafeInteger(value) || value < 0,
        ) ||
        Object.values(metrics.statusTotals ?? {}).reduce(
          (total, value) => total + value,
          0,
        ) !== metrics.completed ||
        Object.values(metrics.failureTotals ?? {}).some(
          (value) => !Number.isSafeInteger(value) || value < 0,
        ) ||
        Object.values(metrics.failureTotals ?? {}).reduce(
          (total, value) => total + value,
          0,
        ) !== metrics.errorCount
      ) {
        fail(
          `${label} scenario ${phase.id}/${scenario.scenarioId} counts drifted`,
        );
      }
      const failureKeys = new Set([
        "driver_saturation",
        "unexpected_status",
        "invalid_response",
        "request_failed",
        "response_too_large",
      ]);
      if (
        Object.keys(metrics.failureTotals).some(
          (key) => !failureKeys.has(key),
        ) ||
        Object.keys(metrics.statusTotals).some(
          (key) => key !== "network" && !/^\d{3}$/u.test(key),
        )
      ) {
        fail(
          `${label} scenario ${phase.id}/${scenario.scenarioId} has unknown status or failure evidence`,
        );
      }
      const unexpectedStatuses = Object.entries(metrics.statusTotals).reduce(
        (total, [status, count]) =>
          status !== "network" &&
          !expectedScenario.expectedStatuses.includes(Number(status))
            ? total + count
            : total,
        0,
      );
      const networkFailures =
        (metrics.failureTotals.request_failed ?? 0) +
        (metrics.failureTotals.response_too_large ?? 0);
      if (
        unexpectedStatuses !== (metrics.failureTotals.unexpected_status ?? 0) ||
        (metrics.statusTotals.network ?? 0) !== networkFailures ||
        (metrics.failureTotals.driver_saturation ?? 0) !== metrics.dropped
      ) {
        fail(
          `${label} scenario ${phase.id}/${scenario.scenarioId} status and failure evidence diverged`,
        );
      }
      const expectedDecisions = {
        noDrops: metrics.dropped === 0,
        errorRate:
          metrics.errorRate <= expectedScenario.thresholds.maximumErrorRate,
        p95:
          typeof metrics.latencyMs?.p95 === "number" &&
          metrics.latencyMs.p95 <= expectedScenario.thresholds.maximumP95Ms,
        p99:
          typeof metrics.latencyMs?.p99 === "number" &&
          metrics.latencyMs.p99 <= expectedScenario.thresholds.maximumP99Ms,
        scheduleLagP95:
          typeof metrics.scheduleLagMs?.p95 === "number" &&
          metrics.scheduleLagMs.p95 <=
            expectedScenario.thresholds.maximumScheduleLagP95Ms,
      };
      const passed =
        Object.keys(scenario.decisions ?? {}).length === 5 &&
        Object.entries(expectedDecisions).every(
          ([key, value]) => value === true && scenario.decisions[key] === value,
        ) &&
        scenario.passed === true;
      scenarioPasses.push(passed);
      if (phase.measured && !passed) {
        fail(
          `${label} scenario ${phase.id}/${scenario.scenarioId} did not pass`,
        );
      }
    }
    if (phase.measured) {
      requiredPhases.delete(phase.id);
      if (phase.passed !== true || !scenarioPasses.every((passed) => passed)) {
        fail(`${label} measured phase ${phase.id} did not pass`);
      }
    }
  }
  if (requiredPhases.size) {
    fail(
      `${label} report is missing measured phases ${[...requiredPhases].join(", ")}`,
    );
  }
}

function validateIndependentRun(
  report,
  candidateEvidence,
  primaryOriginSha256,
) {
  if (
    report?.schema !== "starfiniti.capacity-independent-run.v1" ||
    report.status !== "passed" ||
    report.candidateCommit !== candidateEvidence.candidate.commit ||
    report.workloadProfile !== candidateEvidence.workload.profile ||
    report.workloadSha256 !== candidateEvidence.workload.sha256 ||
    report.originSha256 !== primaryOriginSha256 ||
    typeof report.tool?.name !== "string" ||
    report.tool.name.length < 2 ||
    typeof report.tool?.version !== "string" ||
    report.tool.version.length < 1 ||
    report.tool.name === "node-fixed-arrival-v1" ||
    !Array.isArray(report.phases)
  ) {
    fail("independent capacity report identity tool or status is invalid");
  }
  const phases = new Map(report.phases.map((phase) => [phase.id, phase]));
  for (const id of ["sustained", "burst", "recovery"]) {
    if (phases.get(id)?.passed !== true) {
      fail(`independent capacity report did not pass ${id}`);
    }
  }
}

function validateEnvironmentEvidence(environment, candidateEvidence) {
  if (
    environment?.schema !== "starfiniti.capacity-environment.v1" ||
    environment.status !== "verified" ||
    environment.candidateCommit !== candidateEvidence.candidate.commit ||
    environment.workloadSha256 !== candidateEvidence.workload.sha256
  ) {
    fail("capacity environment identity or status is invalid");
  }
  exactUtcTimestamp(environment.capturedAt, "capacity environment capturedAt");
  if (
    !Array.isArray(environment.components) ||
    environment.components.length < 5 ||
    !Array.isArray(environment.dataset) ||
    environment.dataset.length < 8 ||
    typeof environment.storage?.class !== "string" ||
    environment.storage.class.length < 1 ||
    !Number.isSafeInteger(environment.storage?.capacityGiB) ||
    environment.storage.capacityGiB < 1 ||
    typeof environment.network?.class !== "string" ||
    environment.network.class.length < 1 ||
    !Number.isSafeInteger(environment.network?.bandwidthMbps) ||
    environment.network.bandwidthMbps < 1
  ) {
    fail("capacity environment inventory or data shape is incomplete");
  }
  const componentKinds = new Set();
  for (const component of environment.components) {
    if (
      typeof component.kind !== "string" ||
      componentKinds.has(component.kind) ||
      typeof component.version !== "string" ||
      component.version.length < 1 ||
      !Number.isSafeInteger(component.instances) ||
      component.instances < 1 ||
      !Number.isSafeInteger(component.vCpu) ||
      component.vCpu < 1 ||
      !Number.isSafeInteger(component.memoryMiB) ||
      component.memoryMiB < 128
    ) {
      fail("capacity environment component is invalid or duplicated");
    }
    componentKinds.add(component.kind);
  }
  for (const required of [
    "dashboard",
    "database",
    "proxy",
    "worker",
    "driver",
  ]) {
    if (!componentKinds.has(required)) {
      fail(`capacity environment is missing ${required}`);
    }
  }
  const datasetKinds = new Set();
  for (const item of environment.dataset) {
    if (
      typeof item.kind !== "string" ||
      datasetKinds.has(item.kind) ||
      !Number.isSafeInteger(item.count) ||
      item.count < 0
    ) {
      fail("capacity dataset item is invalid or duplicated");
    }
    datasetKinds.add(item.kind);
  }
  for (const required of [
    "tenants",
    "members",
    "orders",
    "canonical_events",
    "ledger_transactions",
    "ledger_entries",
    "lots",
    "rewards",
  ]) {
    if (!datasetKinds.has(required))
      fail(`capacity dataset is missing ${required}`);
  }
}

function validateReconciliationEvidence(reconciliation, candidateEvidence) {
  if (
    reconciliation?.schema !== "starfiniti.capacity-reconciliation.v1" ||
    reconciliation.status !== "passed" ||
    reconciliation.candidateCommit !== candidateEvidence.candidate.commit ||
    reconciliation.workloadSha256 !== candidateEvidence.workload.sha256 ||
    typeof reconciliation.walletReadP95Ms !== "number" ||
    reconciliation.walletReadP95Ms < 0 ||
    reconciliation.walletReadP95Ms >= 300 ||
    typeof reconciliation.eventToLedgerP95Ms !== "number" ||
    reconciliation.eventToLedgerP95Ms < 0 ||
    reconciliation.eventToLedgerP95Ms >= 10_000
  ) {
    fail("capacity reconciliation identity latency or status is invalid");
  }
  exactUtcTimestamp(
    reconciliation.reconciledAt,
    "capacity reconciliation reconciledAt",
  );
  const requiredDifferences = new Set([
    "scheduled_to_completed",
    "completed_to_accepted",
    "accepted_to_canonical",
    "canonical_to_effect",
    "ledger_balance",
    "woocommerce_order_event",
    "connector_coupon",
    "dead_letter",
    "cross_tenant",
    "unexplained",
  ]);
  if (!Array.isArray(reconciliation.differences)) {
    fail("capacity reconciliation differences are absent");
  }
  for (const difference of reconciliation.differences) {
    if (!requiredDifferences.delete(difference.id) || difference.value !== 0) {
      fail(
        "capacity reconciliation contains duplicate unknown or nonzero difference",
      );
    }
  }
  if (requiredDifferences.size) {
    fail(
      `capacity reconciliation is missing ${[...requiredDifferences].join(", ")}`,
    );
  }
}

function scanSensitive(value, path = "evidence") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanSensitive(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (secretKeyPattern.test(key))
        fail(`forbidden sensitive key ${path}.${key}`);
      scanSensitive(item, `${path}.${key}`);
    }
    return;
  }
  if (typeof value !== "string") return;
  if (serviceTokenPattern.test(value))
    fail(`forbidden service credential at ${path}`);
  if (uuidPattern.test(value))
    fail(`forbidden raw resource identifier at ${path}`);
  if (emailPattern.test(value)) fail(`forbidden email identity at ${path}`);
  if (/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/-]{12,}={0,2}\b/iu.test(value)) {
    fail(`forbidden authorization material at ${path}`);
  }
}

function validateWorkloadDocument(candidate) {
  if (
    candidate.schema !== "starfiniti.capacity-workload.v1" ||
    candidate.status !== "candidate"
  ) {
    fail("workload schema and status are invalid");
  }
  if (!Array.isArray(candidate.phases) || candidate.phases.length < 3) {
    fail("workload has insufficient phases");
  }
  const phaseIds = new Set();
  for (const phase of candidate.phases) {
    if (phaseIds.has(phase.id)) fail(`duplicate phase ${phase.id}`);
    phaseIds.add(phase.id);
    if (
      typeof phase.durationSeconds !== "number" ||
      phase.durationSeconds < 1 ||
      phase.durationSeconds > 3_600 ||
      typeof phase.rateMultiplier !== "number" ||
      phase.rateMultiplier <= 0 ||
      phase.rateMultiplier > 10 ||
      typeof phase.measured !== "boolean"
    ) {
      fail(`invalid phase ${phase.id}`);
    }
  }
  for (const required of ["warmup", "sustained", "burst", "recovery"]) {
    if (!phaseIds.has(required)) fail(`missing phase ${required}`);
  }
  if (!Array.isArray(candidate.scenarios) || candidate.scenarios.length < 4) {
    fail("workload has insufficient scenarios");
  }
  const scenarioIds = new Set();
  const adapters = new Set();
  for (const scenario of candidate.scenarios) {
    if (scenarioIds.has(scenario.id)) fail(`duplicate scenario ${scenario.id}`);
    scenarioIds.add(scenario.id);
    adapters.add(scenario.adapter);
    if (
      typeof scenario.ratePerSecond !== "number" ||
      scenario.ratePerSecond <= 0 ||
      !Number.isSafeInteger(scenario.concurrencyLimit) ||
      scenario.concurrencyLimit < 1 ||
      !Number.isSafeInteger(scenario.timeoutMs) ||
      scenario.timeoutMs < 100 ||
      !Number.isSafeInteger(scenario.maximumResponseBytes) ||
      scenario.maximumResponseBytes < 1 ||
      !Array.isArray(scenario.expectedStatuses) ||
      scenario.expectedStatuses.length < 1 ||
      typeof scenario.thresholds?.maximumErrorRate !== "number" ||
      typeof scenario.thresholds?.maximumP95Ms !== "number" ||
      typeof scenario.thresholds?.maximumP99Ms !== "number" ||
      typeof scenario.thresholds?.maximumScheduleLagP95Ms !== "number"
    ) {
      fail(`invalid scenario ${scenario.id}`);
    }
    if ((scenario.method === "POST") !== scenario.mutates) {
      fail(`scenario ${scenario.id} has inconsistent mutation classification`);
    }
  }
  for (const adapter of [
    "readiness",
    "authenticated_get",
    "service_customer_upsert",
    "woocommerce_order_upsert",
  ]) {
    if (!adapters.has(adapter)) fail(`missing adapter ${adapter}`);
  }
  let totalScheduled = 0;
  for (const phase of candidate.phases) {
    for (const scenario of candidate.scenarios) {
      const scheduled = Math.floor(
        phase.durationSeconds * phase.rateMultiplier * scenario.ratePerSecond,
      );
      totalScheduled += scheduled;
      if (phase.measured && scheduled < 500) {
        fail(`${phase.id}/${scenario.id} has fewer than 500 measured requests`);
      }
    }
  }
  if (totalScheduled > 2_000_000) {
    fail("workload exceeds the two-million-request safety bound");
  }
  if (candidate.driver?.implementation !== "node-fixed-arrival-v1") {
    fail("unexpected load-driver implementation");
  }
}

function validateDocument(
  candidateEvidence,
  candidateWorkload = workload,
  candidateTasks = tasks,
) {
  validateWorkloadDocument(candidateWorkload);
  if (candidateEvidence.schema !== "starfiniti.capacity-evidence.v1") {
    fail("unexpected schema");
  }
  if (!new Set(["in_progress", "complete"]).has(candidateEvidence.status)) {
    fail("status must be in_progress or complete");
  }
  if (
    typeof candidateEvidence.observedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(
      candidateEvidence.observedAt,
    ) ||
    Number.isNaN(Date.parse(candidateEvidence.observedAt))
  ) {
    fail("observedAt must be an exact UTC timestamp");
  }
  if (
    typeof candidateEvidence.currentProduction?.release !== "string" ||
    !/^v\d+\.\d+\.\d+$/u.test(candidateEvidence.currentProduction.release) ||
    !/^[0-9a-f]{40}$/u.test(
      candidateEvidence.currentProduction?.applicationCommit,
    )
  ) {
    fail("current production release and commit must be exact");
  }
  if (
    typeof candidateEvidence.candidate?.branch !== "string" ||
    !/^codex\/[a-z0-9][a-z0-9-]{2,99}$/u.test(
      candidateEvidence.candidate.branch,
    ) ||
    !/^[0-9a-f]{40}$/u.test(candidateEvidence.candidate.commit) ||
    /^0{40}$/u.test(candidateEvidence.candidate.commit)
  ) {
    fail("candidate branch and full nonzero commit must be exact");
  }
  for (const approval of ["approvedEnvironment", "capacityClaimApproved"]) {
    if (typeof candidateEvidence.candidate[approval] !== "boolean") {
      fail(`candidate ${approval} must be boolean`);
    }
  }
  if (
    candidateEvidence.workload?.path !==
      "infrastructure/testing/capacity/workload.yaml" ||
    candidateEvidence.workload?.profile !== candidateWorkload.profile ||
    candidateEvidence.workload?.sha256 !== digestDocument(candidateWorkload)
  ) {
    fail("workload path profile or digest drifted");
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
      check.evidence.length < 40 ||
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
    candidateEvidence.automaticFails.length < 14 ||
    new Set(candidateEvidence.automaticFails).size !==
      candidateEvidence.automaticFails.length ||
    candidateEvidence.automaticFails.some(
      (rule) => typeof rule !== "string" || rule.length < 45,
    )
  ) {
    fail(
      "automatic failures require at least fourteen unique substantive rules",
    );
  }
  scanSensitive(candidateEvidence);

  const m15 = candidateTasks.tasks?.find(
    (task) => task.id === "M15-GA-HARDENING",
  );
  const s01 = m15?.slices?.find(
    (slice) => slice.id === "M15-S01-CAPACITY-ENVELOPE",
  );
  if (!m15 || !s01) fail("M15-S01 task graph is missing");
  const checksById = new Map(
    candidateEvidence.checks.map((check) => [check.id, check]),
  );
  if (
    candidateEvidence.candidate.approvedEnvironment !==
    (checksById.get("approved_environment")?.status === "passed")
  ) {
    fail("approvedEnvironment must match approved_environment check");
  }
  if (
    candidateEvidence.candidate.capacityClaimApproved !==
    (checksById.get("supported_limit_documented")?.status === "passed")
  ) {
    fail("capacityClaimApproved must match supported_limit_documented check");
  }
  const incomplete = candidateEvidence.checks.filter(
    (check) => check.status !== "passed",
  );
  const claim = candidateEvidence.claim;
  const claimValues = [
    claim?.supportedSustainedRequestsPerSecond,
    claim?.supportedBurstRequestsPerSecond,
    claim?.supportedOrdersPerMinute,
  ];
  const claimDigests = [
    claim?.environmentEvidenceSha256,
    claim?.passingRunSha256,
    claim?.repeatRunSha256,
    claim?.independentRunSha256,
    claim?.reconciliationSha256,
  ];
  const claimPaths = [
    claim?.environmentEvidencePath,
    claim?.passingRunPath,
    claim?.repeatRunPath,
    claim?.independentRunPath,
    claim?.reconciliationPath,
  ];
  if (candidateEvidence.status === "complete") {
    if (
      !candidateEvidence.candidate.approvedEnvironment ||
      !candidateEvidence.candidate.capacityClaimApproved
    ) {
      fail(
        "complete evidence requires environment and capacity-claim approval",
      );
    }
    if (incomplete.length) {
      fail(
        `complete evidence has non-passing checks: ${incomplete.map((check) => check.id).join(", ")}`,
      );
    }
    if (
      claim?.enabled !== true ||
      claimValues.some(
        (value) =>
          typeof value !== "number" ||
          !Number.isSafeInteger(value) ||
          value < 1,
      ) ||
      claimDigests.some(
        (value) =>
          typeof value !== "string" ||
          !/^[0-9a-f]{64}$/u.test(value) ||
          /^0{64}$/u.test(value),
      )
    ) {
      fail(
        "complete evidence requires a bounded supported claim and five exact evidence digests",
      );
    }
    if (
      claimPaths.some((value) => typeof value !== "string" || value.length < 10)
    ) {
      fail("complete evidence requires five bounded evidence paths");
    }
    const environment = readBoundEvidence(
      claim.environmentEvidencePath,
      claim.environmentEvidenceSha256,
      "yaml",
    );
    const passingRun = readBoundEvidence(
      claim.passingRunPath,
      claim.passingRunSha256,
      "json",
    );
    const repeatRun = readBoundEvidence(
      claim.repeatRunPath,
      claim.repeatRunSha256,
      "json",
    );
    const independentRun = readBoundEvidence(
      claim.independentRunPath,
      claim.independentRunSha256,
      "json",
    );
    const reconciliation = readBoundEvidence(
      claim.reconciliationPath,
      claim.reconciliationSha256,
      "yaml",
    );
    validateEnvironmentEvidence(environment, candidateEvidence);
    validateCapacityRun(
      passingRun,
      candidateEvidence,
      "passing",
      candidateWorkload,
    );
    validateCapacityRun(
      repeatRun,
      candidateEvidence,
      "repeat",
      candidateWorkload,
    );
    if (passingRun.originSha256 !== repeatRun.originSha256) {
      fail("passing and repeat capacity reports target different environments");
    }
    validateIndependentRun(
      independentRun,
      candidateEvidence,
      passingRun.originSha256,
    );
    validateReconciliationEvidence(reconciliation, candidateEvidence);
    if (s01.status !== "complete" || m15.status !== "in_progress") {
      fail(
        "complete capacity evidence requires completed S01 under active M15",
      );
    }
  } else {
    if (
      claim?.enabled !== false ||
      claimValues.some((value) => value !== null) ||
      claimDigests.some((value) => value !== null) ||
      claimPaths.some((value) => value !== null)
    ) {
      fail("in-progress evidence must not publish a capacity claim");
    }
    if (s01.status !== "in_progress" || m15.status !== "in_progress") {
      fail("in-progress evidence must match active M15-S01 task state");
    }
  }
  return { incomplete };
}

const result = validateDocument(evidence);

if (process.argv.includes("--self-test")) {
  const expectRejected = (
    candidateEvidence,
    messagePart,
    label,
    candidateWorkload = workload,
    candidateTasks = tasks,
  ) => {
    try {
      validateDocument(candidateEvidence, candidateWorkload, candidateTasks);
    } catch (error) {
      if (error instanceof Error && error.message.includes(messagePart)) return;
      throw error;
    }
    fail(`self-test accepted ${label}`);
  };
  const unapprovedComplete = structuredClone(evidence);
  unapprovedComplete.status = "complete";
  expectRejected(
    unapprovedComplete,
    "requires environment and capacity-claim approval",
    "unapproved completion",
  );

  const missing = structuredClone(evidence);
  missing.checks.shift();
  expectRejected(missing, "missing check", "missing mandatory check");

  const duplicate = structuredClone(evidence);
  duplicate.checks.push(structuredClone(duplicate.checks[0]));
  expectRejected(duplicate, "duplicate check", "duplicate mandatory check");

  const sensitiveKey = structuredClone(evidence);
  sensitiveKey.serviceToken = "unsafe";
  expectRejected(
    sensitiveKey,
    "forbidden sensitive key",
    "sensitive evidence key",
  );

  const sensitiveIdentifier = structuredClone(evidence);
  sensitiveIdentifier.checks[0].evidence =
    "Unsafe raw selector 94000000-0000-4000-8000-000000000003 was copied into the capacity evidence record.";
  expectRejected(
    sensitiveIdentifier,
    "forbidden raw resource identifier",
    "raw resource selector",
  );

  const sensitiveEmail = structuredClone(evidence);
  sensitiveEmail.checks[0].evidence =
    "Unsafe customer identity person@example.test was copied into the capacity evidence record without minimization.";
  expectRejected(sensitiveEmail, "forbidden email identity", "email identity");

  const forwardPass = structuredClone(evidence);
  forwardPass.checks[0].evidence =
    "The fixed workload will be verified in a future approved run before this repository gate is accepted.";
  expectRejected(
    forwardPass,
    "contains forward-looking evidence",
    "forward-looking passed check",
  );

  const digestDrift = structuredClone(evidence);
  digestDrift.workload.sha256 = "f".repeat(64);
  expectRejected(
    digestDrift,
    "workload path profile or digest drifted",
    "workload digest drift",
  );

  const taskDrift = structuredClone(tasks);
  taskDrift.tasks
    .find((task) => task.id === "M15-GA-HARDENING")
    .slices.find((slice) => slice.id === "M15-S01-CAPACITY-ENVELOPE").status =
    "planned";
  expectRejected(
    evidence,
    "must match active M15-S01",
    "task-state drift",
    workload,
    taskDrift,
  );

  const falseClaim = structuredClone(evidence);
  falseClaim.claim.enabled = true;
  expectRejected(
    falseClaim,
    "must not publish a capacity claim",
    "in-progress capacity claim",
  );

  const weakFailures = structuredClone(evidence);
  weakFailures.automaticFails = weakFailures.automaticFails.slice(0, 5);
  expectRejected(
    weakFailures,
    "at least fourteen",
    "weak automatic-failure set",
  );

  const approvalDrift = structuredClone(evidence);
  approvalDrift.candidate.approvedEnvironment = true;
  expectRejected(
    approvalDrift,
    "must match approved_environment",
    "approval-check drift",
  );

  const missingAdapterWorkload = structuredClone(workload);
  missingAdapterWorkload.scenarios = missingAdapterWorkload.scenarios.filter(
    (scenario) => scenario.adapter !== "woocommerce_order_upsert",
  );
  expectRejected(
    evidence,
    "insufficient scenarios",
    "workload without WooCommerce",
    missingAdapterWorkload,
  );

  const syntheticRun = {
    schema: "starfiniti.capacity-run.v1",
    status: "passed",
    candidateCommit: evidence.candidate.commit,
    workloadProfile: evidence.workload.profile,
    workloadSha256: evidence.workload.sha256,
    originSha256: "a".repeat(64),
    approvalSha256: "b".repeat(64),
    targetClass: "disposable_staging",
    startedAt: "2026-08-27T06:00:00.000Z",
    finishedAt: "2026-08-27T06:30:00.000Z",
    driver: { cpuPercent: 20, peakMemoryMiB: 256, eventLoopP95Ms: 5 },
    driverDecisions: { cpu: true, memory: true, eventLoop: true },
    phases: workload.phases.map((phase) => ({
      id: phase.id,
      measured: phase.measured,
      rateMultiplier: phase.rateMultiplier,
      passed: true,
      scenarios: workload.scenarios.map((scenario) => {
        const scheduled = Math.floor(
          phase.durationSeconds * phase.rateMultiplier * scenario.ratePerSecond,
        );
        return {
          scenarioId: scenario.id,
          adapter: scenario.adapter,
          ratePerSecond: scenario.ratePerSecond * phase.rateMultiplier,
          passed: true,
          metrics: {
            scheduled,
            completed: scheduled,
            dropped: 0,
            errorCount: 0,
            errorRate: 0,
            statusTotals: {
              [String(scenario.expectedStatuses[0])]: scheduled,
            },
            failureTotals: {},
            latencyMs: { p95: 10, p99: 20 },
            scheduleLagMs: { p95: 1 },
          },
          decisions: {
            noDrops: true,
            errorRate: true,
            p95: true,
            p99: true,
            scheduleLagP95: true,
          },
        };
      }),
    })),
  };
  validateCapacityRun(syntheticRun, evidence, "synthetic");
  const droppedRun = structuredClone(syntheticRun);
  droppedRun.phases[0].scenarios[0].metrics.dropped = 1;
  try {
    validateCapacityRun(droppedRun, evidence, "synthetic");
    fail("self-test accepted a capacity report with dropped schedules");
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes("counts drifted")
    ) {
      throw error;
    }
  }
}

console.log(
  `Validated ${evidence.checks.length} M15 capacity checks and the ${workload.scenarios.length}-scenario fixed-arrival workload; ${evidence.checks.filter((check) => check.status === "passed").length} passed and ${result.incomplete.length} remain non-passing.`,
);
