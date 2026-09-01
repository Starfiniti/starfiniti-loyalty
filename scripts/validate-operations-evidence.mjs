import assert from "node:assert/strict";
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

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const paths = {
  evidence: "docs/plan/evidence/M15/operations.yaml",
  containment:
    "docs/plan/evidence/M15/backup-traffic-containment-2026-09-01.yaml",
  trafficFollowUp:
    "docs/plan/evidence/M15/backup-traffic-read-only-follow-up-2026-09-01.yaml",
  catalogue: "infrastructure/observability/catalog.yaml",
  rules: "infrastructure/observability/prometheus/rules.yaml",
  routing: "infrastructure/observability/routing-policy.yaml",
  dashboard:
    "infrastructure/observability/grafana/provisioning/starfiniti-dashboards/starfiniti-operations.json",
  dashboardProvisioning:
    "infrastructure/observability/grafana/provisioning/dashboards/starfiniti.yaml",
  datasourceProvisioning:
    "infrastructure/observability/grafana/provisioning/datasources/prometheus.yaml",
  tasks: "docs/plan/TASKS.yaml",
  runbooks: "docs/operations/RUNBOOKS.md",
  incidents: "docs/operations/INCIDENT_MANAGEMENT.md",
  postmortem: "docs/operations/POSTMORTEM_TEMPLATE.md",
};

const readText = (relativePath) =>
  readFileSync(join(root, relativePath), "utf8");
const evidence = YAML.parse(readText(paths.evidence));
const containment = YAML.parse(readText(paths.containment));
const trafficFollowUp = YAML.parse(readText(paths.trafficFollowUp));
const catalogue = YAML.parse(readText(paths.catalogue));
const rules = YAML.parse(readText(paths.rules));
const routing = YAML.parse(readText(paths.routing));
const dashboard = JSON.parse(readText(paths.dashboard));
const dashboardProvisioning = YAML.parse(readText(paths.dashboardProvisioning));
const datasourceProvisioning = YAML.parse(
  readText(paths.datasourceProvisioning),
);
const tasks = YAML.parse(readText(paths.tasks));
const runbooks = readText(paths.runbooks);
const incidents = readText(paths.incidents);
const postmortem = readText(paths.postmortem);

const requiredChecks = new Set([
  "production_reality",
  "catalog_contract",
  "prometheus_rule_parity",
  "grafana_dashboard_contract",
  "routing_policy_contract",
  "bounded_label_guard",
  "protected_value_pages",
  "backup_amplification_guard",
  "offsite_recovery_guard",
  "runbook_coverage",
  "incident_state_machine",
  "postmortem_contract",
  "validator_selftest",
  "exact_head_ci",
  "approved_monitoring_environment",
  "source_inventory",
  "source_freshness",
  "prometheus_targets",
  "alert_rules_loaded",
  "grafana_provisioned",
  "owner_roster",
  "receiver_binding",
  "primary_secondary_delivery",
  "acknowledgement_escalation",
  "inhibition_guard",
  "backup_amplification_exercise",
  "fault_signal_coverage",
  "checkout_independence",
  "ledger_queue_reconciliation",
  "tenant_privacy_reconciliation",
  "primary_incident_exercise",
  "repeat_incident_exercise",
  "postmortem_actions",
  "independent_reconciliation",
  "owner_approval",
]);
const requiredSources = new Set([
  "edge-prober",
  "application-runtime",
  "worker-runtime",
  "postgres-exporter",
  "backup-controller",
  "host-exporter",
  "security-evidence",
  "exercise-controller",
  "monitoring-plane",
]);
const requiredOwners = new Set([
  "platform-on-call",
  "value-integrity-on-call",
  "security-on-call",
  "recovery-on-call",
]);
const requiredRoutes = new Set([
  "protected-value-page",
  "platform-page",
  "security-page",
  "operations-ticket",
]);
const requiredAlerts = new Set([
  "StarfinitiCentralApiUnavailable",
  "StarfinitiWebhookAcknowledgementSlow",
  "StarfinitiEventToLedgerSlow",
  "StarfinitiWalletReadSlow",
  "StarfinitiQueueBacklog",
  "StarfinitiDeadLettersPresent",
  "StarfinitiWorkerUnavailable",
  "StarfinitiAmbiguousProviderOutcome",
  "StarfinitiDatabasePoolSaturated",
  "StarfinitiDatabaseDiskLow",
  "StarfinitiWalRpoBreached",
  "StarfinitiBaseBackupStale",
  "StarfinitiBackupTransferAmplification",
  "StarfinitiBackupInternalStreamSuspected",
  "StarfinitiBackupNetworkCountersMissing",
  "StarfinitiOffsiteArchiveRpoBreached",
  "StarfinitiPostgresBorgRepositoryIsolationLost",
  "StarfinitiPostgresBorgRetentionGap",
  "StarfinitiPostgresBorgMaintenanceStale",
  "StarfinitiLedgerDifference",
  "StarfinitiTenantBoundaryViolation",
  "StarfinitiCheckoutHubDependency",
  "StarfinitiPrivacyReplayFailure",
  "StarfinitiIdentityBrokerUnavailable",
  "StarfinitiCertificateExpiresSoon",
  "StarfinitiSecurityHighFinding",
  "StarfinitiRecoveryExerciseStale",
  "StarfinitiIncidentRouteExerciseStale",
  "StarfinitiRequiredTelemetryMissing",
]);
const immediateAlerts = new Set([
  "StarfinitiAmbiguousProviderOutcome",
  "StarfinitiWalRpoBreached",
  "StarfinitiOffsiteArchiveRpoBreached",
  "StarfinitiPostgresBorgRepositoryIsolationLost",
  "StarfinitiPostgresBorgRetentionGap",
  "StarfinitiLedgerDifference",
  "StarfinitiTenantBoundaryViolation",
  "StarfinitiCheckoutHubDependency",
  "StarfinitiPrivacyReplayFailure",
  "StarfinitiSecurityHighFinding",
]);
const allowedStatuses = new Set(["passed", "pending", "failed"]);
const durationPattern = /^(?:0s|[1-9][0-9]*(?:s|m|h|d))$/u;
const digestPattern = /^[0-9a-f]{64}$/u;
const commitPattern = /^[0-9a-f]{40}$/u;
const pendingLanguagePattern =
  /\b(await|pending|remain|requires?|must|not yet|has not|will|future|todo)\b/iu;
const credentialPattern =
  /\b(?:sflt_v1_[0-9a-f]{32}_[A-Za-z0-9_-]{43}|sk_(?:live|test)_[A-Za-z0-9]{16,}|whsec_[A-Za-z0-9]{16,}|eyJ[A-Za-z0-9_-]{20,})\b/u;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu;
const uuidPattern =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/iu;
const forbiddenArtifactKeyPattern =
  /(?:tenant|organization|workspace|customer|member|order|email|coupon|credential|token|password|secret|privatekey|authorization|payload|rawbody|requestbody|responsebody|correlationid)$/iu;

function fail(message) {
  throw new Error(`Operations evidence invalid: ${message}`);
}

function uniqueIds(items, label) {
  if (!Array.isArray(items) || items.length === 0) fail(`${label} is empty`);
  const ids = new Set();
  for (const item of items) {
    if (!item || typeof item.id !== "string" || ids.has(item.id)) {
      fail(`${label} contains a missing or duplicate id`);
    }
    ids.add(item.id);
  }
  return ids;
}

function exactSet(actual, expected, label) {
  if (
    actual.size !== expected.size ||
    [...expected].some((value) => !actual.has(value))
  ) {
    fail(`${label} differs from the required closed set`);
  }
}

function exactUtc(value, label) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    fail(`${label} must be an exact UTC timestamp`);
  }
  return Date.parse(value);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  const actual = Object.keys(value);
  if (
    actual.length !== expected.length ||
    expected.some((key) => !Object.hasOwn(value, key))
  ) {
    fail(`${label} keys differ`);
  }
}

function validateBackupTrafficContainment(candidate) {
  exactKeys(
    candidate,
    [
      "schema",
      "status",
      "observedAt",
      "production",
      "traffic",
      "rootCause",
      "containment",
      "verification",
      "remainingGates",
      "productionMutation",
    ],
    "backup-traffic containment",
  );
  exactKeys(
    candidate.production,
    ["release", "applicationCommit", "vmId", "vmName", "vmUptimeSeconds"],
    "backup-traffic containment production",
  );
  exactKeys(
    candidate.traffic,
    [
      "vmNetoutBytes",
      "vmNetinBytes",
      "vmbr10RxBytes",
      "vmbr10TxBytes",
      "eno1RxBytes",
      "eno1TxBytes",
      "historicalPeak",
      "historicalHostWindow",
      "latestDay",
      "interpretation",
    ],
    "backup-traffic containment traffic",
  );
  exactKeys(
    candidate.traffic.historicalPeak,
    ["observedBucket", "netoutBytesPerSecond", "diskReadBytesPerSecond"],
    "backup-traffic containment historical peak",
  );
  exactKeys(
    candidate.traffic.historicalHostWindow,
    ["start", "end", "maximumNetoutBytesPerSecond", "approximateNetoutBytes"],
    "backup-traffic containment historical host window",
  );
  exactKeys(
    candidate.traffic.latestDay,
    ["maximumNetoutBytesPerSecond", "approximateNetoutBytes"],
    "backup-traffic containment latest day",
  );
  exactKeys(
    candidate.rootCause,
    [
      "historicalAmplification",
      "currentArchivePath",
      "recurringRecoveryConflict",
    ],
    "backup-traffic containment root cause",
  );
  exactKeys(
    candidate.containment,
    [
      "wholeVmBackupTimerEnabled",
      "wholeVmBackupTimerActive",
      "postgresBackupTimerEnabled",
      "postgresBackupTimerActive",
      "legacyFullStreamExecutable",
      "existingArchivesRetained",
      "databaseServiceChanged",
      "vmChanged",
      "applicationChanged",
      "loyaltyValueChanged",
    ],
    "backup-traffic containment action",
  );
  exactKeys(
    candidate.verification,
    [
      "postContainmentArchive",
      "transferredFileBytes",
      "receivedWireBytes",
      "archiveCompletedAt",
      "dashboardHealthStatus",
      "dashboardLoginStatus",
      "authRootStatus",
      "currentTapRxDeltaBytesOverFiveSeconds",
    ],
    "backup-traffic containment verification",
  );
  exactKeys(
    candidate.productionMutation,
    ["performed", "scope", "reversible", "reenableGate"],
    "backup-traffic containment mutation",
  );
  if (
    candidate?.schema !== "starfiniti.backup-traffic-containment.v1" ||
    candidate.status !== "contained_unresolved" ||
    candidate.production?.release !== "v0.1.11" ||
    !commitPattern.test(candidate.production?.applicationCommit) ||
    candidate.production?.vmId !== 971 ||
    candidate.production?.vmName !== "loyalty-prod-supabase" ||
    candidate.traffic?.historicalPeak?.observedBucket !==
      "2026-08-14T03:00:00Z" ||
    candidate.containment?.wholeVmBackupTimerEnabled !== false ||
    candidate.containment?.wholeVmBackupTimerActive !== false ||
    candidate.containment?.postgresBackupTimerEnabled !== true ||
    candidate.containment?.postgresBackupTimerActive !== true ||
    candidate.containment?.legacyFullStreamExecutable !== false ||
    candidate.containment?.existingArchivesRetained !== true ||
    candidate.containment?.databaseServiceChanged !== false ||
    candidate.containment?.vmChanged !== false ||
    candidate.containment?.applicationChanged !== false ||
    candidate.containment?.loyaltyValueChanged !== false ||
    candidate.verification?.postContainmentArchive !==
      "loyalty-postgres-20260901T092222Z" ||
    candidate.verification?.dashboardHealthStatus !== 200 ||
    candidate.verification?.dashboardLoginStatus !== 200 ||
    candidate.verification?.authRootStatus !== 401 ||
    candidate.productionMutation?.performed !== true ||
    candidate.productionMutation?.reversible !== true
  ) {
    fail("backup-traffic containment identity or safety boundary is invalid");
  }
  exactUtc(candidate.observedAt, "backup-traffic containment observedAt");
  if (candidate.observedAt !== "2026-09-01T09:25:02Z") {
    fail("backup-traffic containment observation identity differs");
  }
  exactUtc(
    candidate.traffic.historicalHostWindow?.start,
    "backup-traffic containment historical host-window start",
  );
  exactUtc(
    candidate.traffic.historicalHostWindow?.end,
    "backup-traffic containment historical host-window end",
  );
  exactUtc(
    candidate.verification.archiveCompletedAt,
    "backup-traffic containment archiveCompletedAt",
  );
  if (candidate.verification.archiveCompletedAt !== "2026-09-01T09:22:58Z") {
    fail("backup-traffic containment archive chronology differs");
  }
  for (const value of [
    candidate.production.vmUptimeSeconds,
    candidate.traffic.vmNetoutBytes,
    candidate.traffic.vmNetinBytes,
    candidate.traffic.vmbr10RxBytes,
    candidate.traffic.vmbr10TxBytes,
    candidate.traffic.eno1RxBytes,
    candidate.traffic.eno1TxBytes,
    candidate.traffic.historicalPeak.netoutBytesPerSecond,
    candidate.traffic.historicalPeak.diskReadBytesPerSecond,
    candidate.traffic.historicalHostWindow.maximumNetoutBytesPerSecond,
    candidate.traffic.historicalHostWindow.approximateNetoutBytes,
    candidate.traffic.latestDay.maximumNetoutBytesPerSecond,
    candidate.traffic.latestDay.approximateNetoutBytes,
    candidate.verification.transferredFileBytes,
    candidate.verification.receivedWireBytes,
    candidate.verification.currentTapRxDeltaBytesOverFiveSeconds,
  ]) {
    if (!Number.isSafeInteger(value) || value < 0) {
      fail("backup-traffic containment contains an invalid numeric fact");
    }
  }
  if (
    candidate.traffic.latestDay.maximumNetoutBytesPerSecond >=
      candidate.traffic.historicalPeak.netoutBytesPerSecond ||
    candidate.traffic.historicalHostWindow.maximumNetoutBytesPerSecond >=
      candidate.traffic.historicalPeak.netoutBytesPerSecond ||
    Date.parse(candidate.traffic.historicalHostWindow.start) >=
      Date.parse(candidate.traffic.historicalHostWindow.end) ||
    candidate.verification.receivedWireBytes <=
      candidate.verification.transferredFileBytes ||
    !Array.isArray(candidate.remainingGates) ||
    candidate.remainingGates.length !== 7 ||
    new Set(candidate.remainingGates).size !== 7
  ) {
    fail(
      "backup-traffic containment chronology or remaining gates are invalid",
    );
  }
}

function archiveTimestamp(name) {
  const match =
    /^loyalty-postgres-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/u.exec(
      name,
    );
  if (!match) fail("backup-traffic follow-up archive name is invalid");
  const [, year, month, day, hour, minute, second] = match;
  return Date.parse(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
}

function validateBackupTrafficFollowUp(candidate, prior) {
  exactKeys(
    candidate,
    [
      "schema",
      "status",
      "observed",
      "priorEvidence",
      "production",
      "traffic",
      "backup",
      "health",
      "remainingGates",
      "authority",
    ],
    "backup-traffic follow-up",
  );
  exactKeys(
    candidate.observed,
    ["startedAt", "finishedAt", "captureMethod", "productionMutation"],
    "backup-traffic follow-up observation",
  );
  exactKeys(
    candidate.priorEvidence,
    ["path", "sha256"],
    "backup-traffic follow-up prior evidence",
  );
  exactKeys(
    candidate.production,
    ["release", "applicationCommit", "vmId", "vmName", "vmRunning"],
    "backup-traffic follow-up production",
  );
  exactKeys(
    candidate.traffic,
    [
      "tapSample",
      "latestDay",
      "historicalMonthPeak",
      "activeFullStreamObserved",
    ],
    "backup-traffic follow-up traffic",
  );
  exactKeys(
    candidate.traffic.tapSample,
    [
      "rxBeforeBytes",
      "rxAfterBytes",
      "durationSeconds",
      "deltaBytes",
      "cumulativeCounterIsRate",
    ],
    "backup-traffic follow-up tap sample",
  );
  exactKeys(
    candidate.traffic.latestDay,
    [
      "sampleCount",
      "sampleIntervalSeconds",
      "estimatedBytes",
      "meanBytesPerSecond",
      "maximumBytesPerSecond",
      "latestBucket",
    ],
    "backup-traffic follow-up latest day",
  );
  exactKeys(
    candidate.traffic.historicalMonthPeak,
    ["maximumBytesPerSecond", "observedBucket"],
    "backup-traffic follow-up historical peak",
  );
  exactKeys(
    candidate.backup,
    ["wholeVm", "postgres"],
    "backup-traffic follow-up backup state",
  );
  exactKeys(
    candidate.backup.wholeVm,
    ["timerEnabled", "timerActive", "serviceState", "serviceLastExitAt"],
    "backup-traffic follow-up whole-VM state",
  );
  exactKeys(
    candidate.backup.postgres,
    [
      "timerEnabled",
      "timerActive",
      "latestServiceResult",
      "objectiveSeconds",
      "maximumObservedIntervalSeconds",
      "archives",
    ],
    "backup-traffic follow-up PostgreSQL state",
  );
  exactKeys(
    candidate.health,
    ["readinessStatus", "loginStatus"],
    "backup-traffic follow-up health",
  );
  exactKeys(
    candidate.authority,
    [
      "r004Closed",
      "monitoringActivated",
      "timerReenableAuthorized",
      "releaseAuthorized",
      "deploymentAuthorized",
      "loyaltyValueChanged",
    ],
    "backup-traffic follow-up authority",
  );

  const expectedPriorDigest = rawDigest(readText(paths.containment));
  if (
    candidate.schema !== "starfiniti.backup-traffic-follow-up.v1" ||
    candidate.status !== "contained_unresolved" ||
    candidate.observed.captureMethod !== "approved-read-only-ssh" ||
    candidate.observed.productionMutation !== false ||
    candidate.priorEvidence.path !== paths.containment ||
    candidate.priorEvidence.sha256 !== expectedPriorDigest ||
    candidate.production.release !== prior.production.release ||
    candidate.production.applicationCommit !==
      prior.production.applicationCommit ||
    candidate.production.vmId !== prior.production.vmId ||
    candidate.production.vmName !== prior.production.vmName ||
    candidate.production.vmRunning !== true ||
    candidate.traffic.tapSample.cumulativeCounterIsRate !== false ||
    candidate.traffic.activeFullStreamObserved !== false ||
    candidate.backup.wholeVm.timerEnabled !== false ||
    candidate.backup.wholeVm.timerActive !== false ||
    candidate.backup.wholeVm.serviceState !== "retained_failed_containment" ||
    candidate.backup.postgres.timerEnabled !== true ||
    candidate.backup.postgres.timerActive !== true ||
    candidate.backup.postgres.latestServiceResult !== "success" ||
    candidate.health.readinessStatus !== 200 ||
    candidate.health.loginStatus !== 200 ||
    Object.values(candidate.authority).some((value) => value !== false)
  ) {
    fail("backup-traffic follow-up identity or safety boundary is invalid");
  }

  const startedAt = exactUtc(
    candidate.observed.startedAt,
    "backup-traffic follow-up startedAt",
  );
  const finishedAt = exactUtc(
    candidate.observed.finishedAt,
    "backup-traffic follow-up finishedAt",
  );
  const wholeVmLastExitAt = exactUtc(
    candidate.backup.wholeVm.serviceLastExitAt,
    "backup-traffic follow-up whole-VM last exit",
  );
  const latestBucket = exactUtc(
    candidate.traffic.latestDay.latestBucket,
    "backup-traffic follow-up latest bucket",
  );
  const historicalBucket = exactUtc(
    candidate.traffic.historicalMonthPeak.observedBucket,
    "backup-traffic follow-up historical bucket",
  );
  if (
    candidate.observed.startedAt !== "2026-09-01T12:32:47Z" ||
    candidate.observed.finishedAt !== "2026-09-01T12:34:23Z" ||
    candidate.traffic.latestDay.latestBucket !== "2026-09-01T12:33:00Z" ||
    candidate.traffic.historicalMonthPeak.observedBucket !==
      "2026-08-14T03:00:00Z" ||
    candidate.backup.wholeVm.serviceLastExitAt !== "2026-08-31T23:33:07Z" ||
    finishedAt <= startedAt ||
    finishedAt - startedAt > 5 * 60 * 1000 ||
    latestBucket < startedAt ||
    latestBucket > finishedAt ||
    historicalBucket >= startedAt ||
    wholeVmLastExitAt >= startedAt
  ) {
    fail("backup-traffic follow-up chronology is invalid");
  }

  if (
    !Array.isArray(candidate.backup.postgres.archives) ||
    candidate.backup.postgres.archives.length !== 5
  ) {
    fail("backup-traffic follow-up archive set is invalid");
  }

  const numericFacts = [
    candidate.traffic.tapSample.rxBeforeBytes,
    candidate.traffic.tapSample.rxAfterBytes,
    candidate.traffic.tapSample.durationSeconds,
    candidate.traffic.tapSample.deltaBytes,
    candidate.traffic.latestDay.sampleCount,
    candidate.traffic.latestDay.sampleIntervalSeconds,
    candidate.traffic.latestDay.estimatedBytes,
    candidate.traffic.latestDay.meanBytesPerSecond,
    candidate.traffic.latestDay.maximumBytesPerSecond,
    candidate.traffic.historicalMonthPeak.maximumBytesPerSecond,
    candidate.backup.postgres.objectiveSeconds,
    candidate.backup.postgres.maximumObservedIntervalSeconds,
    ...candidate.backup.postgres.archives.flatMap((archive) => [
      archive.transferredFileBytes,
      archive.receivedWireBytes,
    ]),
  ];
  if (
    numericFacts.some((value) => !Number.isSafeInteger(value) || value < 0) ||
    candidate.traffic.tapSample.rxAfterBytes -
      candidate.traffic.tapSample.rxBeforeBytes !==
      candidate.traffic.tapSample.deltaBytes ||
    candidate.traffic.tapSample.durationSeconds !== 10 ||
    candidate.traffic.tapSample.deltaBytes !== 1013 ||
    candidate.traffic.latestDay.sampleCount !== 1440 ||
    candidate.traffic.latestDay.sampleIntervalSeconds !== 60 ||
    candidate.traffic.latestDay.sampleCount *
      candidate.traffic.latestDay.sampleIntervalSeconds !==
      86400 ||
    Math.floor(candidate.traffic.latestDay.estimatedBytes / 86400) !==
      candidate.traffic.latestDay.meanBytesPerSecond ||
    candidate.traffic.latestDay.estimatedBytes !== 287384753 ||
    candidate.traffic.latestDay.maximumBytesPerSecond !== 107013 ||
    candidate.traffic.historicalMonthPeak.maximumBytesPerSecond !== 249641465 ||
    candidate.traffic.latestDay.maximumBytesPerSecond >=
      candidate.traffic.historicalMonthPeak.maximumBytesPerSecond
  ) {
    fail("backup-traffic follow-up traffic arithmetic is invalid");
  }

  const expectedArchives = [
    ["loyalty-postgres-20260901T122028Z", 67868, 581300],
    ["loyalty-postgres-20260901T122348Z", 50878, 580608],
    ["loyalty-postgres-20260901T122658Z", 50826, 580622],
    ["loyalty-postgres-20260901T123028Z", 67887, 581605],
    ["loyalty-postgres-20260901T123358Z", 50923, 580947],
  ];
  const archiveTimes = candidate.backup.postgres.archives.map(
    (archive, index) => {
      exactKeys(
        archive,
        ["name", "transferredFileBytes", "receivedWireBytes", "result"],
        `backup-traffic follow-up archive ${index}`,
      );
      const expected = expectedArchives[index];
      if (
        archive.name !== expected[0] ||
        archive.transferredFileBytes !== expected[1] ||
        archive.receivedWireBytes !== expected[2] ||
        archive.result !== "success" ||
        archive.receivedWireBytes <= archive.transferredFileBytes ||
        archive.receivedWireBytes >= 1024 * 1024
      ) {
        fail("backup-traffic follow-up archive evidence drifted");
      }
      return archiveTimestamp(archive.name);
    },
  );
  const intervals = archiveTimes
    .slice(1)
    .map((value, index) => (value - archiveTimes[index]) / 1000);
  const maximumInterval = Math.max(...intervals);
  if (
    intervals.some((value) => !Number.isInteger(value) || value <= 0) ||
    candidate.backup.postgres.objectiveSeconds !== 300 ||
    maximumInterval !==
      candidate.backup.postgres.maximumObservedIntervalSeconds ||
    maximumInterval !== 210 ||
    maximumInterval > candidate.backup.postgres.objectiveSeconds
  ) {
    fail("backup-traffic follow-up archive chronology is invalid");
  }

  if (
    !Array.isArray(candidate.remainingGates) ||
    JSON.stringify(candidate.remainingGates) !==
      JSON.stringify(prior.remainingGates)
  ) {
    fail("backup-traffic follow-up remaining gates drifted");
  }
  scanArtifact(candidate, "backup-traffic follow-up");
}

function rawDigest(raw) {
  return createHash("sha256").update(raw).digest("hex");
}

function normalizeExpression(value) {
  return String(value).replace(/\s+/gu, " ").trim();
}

function scanArtifact(value, location = "artifact") {
  if (Array.isArray(value)) {
    value.forEach((child, index) =>
      scanArtifact(child, `${location}[${index}]`),
    );
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenArtifactKeyPattern.test(key.replaceAll("_", ""))) {
        fail(`forbidden sensitive key ${location}.${key}`);
      }
      scanArtifact(child, `${location}.${key}`);
    }
    return;
  }
  if (typeof value === "string") {
    if (credentialPattern.test(value))
      fail(`credential material at ${location}`);
    if (emailPattern.test(value)) fail(`email identity at ${location}`);
    if (uuidPattern.test(value)) fail(`raw resource identifier at ${location}`);
  }
}

function safeArtifactPath(relativePath) {
  if (
    typeof relativePath !== "string" ||
    !/^docs\/plan\/evidence\/M15\/runs\/operations-[a-z0-9][a-z0-9-]{2,79}\.json$/u.test(
      relativePath,
    )
  ) {
    fail("operations artifact path is unsafe");
  }
  const absolute = resolve(root, relativePath);
  const artifactRoot = `${resolve(root, "docs/plan/evidence/M15/runs")}${sep}`;
  if (!absolute.startsWith(artifactRoot))
    fail("operations artifact escapes its root");
  return absolute;
}

function readBoundArtifact(relativePath, expectedDigest) {
  if (!digestPattern.test(expectedDigest) || /^0{64}$/u.test(expectedDigest)) {
    fail("operations artifact digest must be exact and nonzero");
  }
  const absolute = safeArtifactPath(relativePath);
  let descriptor;
  let raw;
  try {
    descriptor = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
    const status = fstatSync(descriptor);
    const linkStatus = lstatSync(absolute);
    if (
      !status.isFile() ||
      !linkStatus.isFile() ||
      status.dev !== linkStatus.dev ||
      status.ino !== linkStatus.ino ||
      status.size < 2 ||
      status.size > 512 * 1024
    ) {
      fail("operations artifact is not a bounded stable file");
    }
    raw = Buffer.alloc(status.size);
    let offset = 0;
    while (offset < raw.length) {
      const amount = readSync(
        descriptor,
        raw,
        offset,
        raw.length - offset,
        offset,
      );
      if (amount === 0) fail("operations artifact changed while reading");
      offset += amount;
    }
  } catch {
    fail(`operations artifact ${relativePath} is unreadable`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  if (rawDigest(raw) !== expectedDigest) {
    fail(`operations artifact digest drifted for ${relativePath}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw.toString("utf8"));
  } catch {
    fail(`operations artifact ${relativePath} is invalid JSON`);
  }
  scanArtifact(parsed, relativePath);
  return { parsed, rawSha256: expectedDigest };
}

function validateAssets(candidateEvidence) {
  const expected = {
    catalog: paths.catalogue,
    prometheusRules: paths.rules,
    routingPolicy: paths.routing,
    dashboard: paths.dashboard,
  };
  for (const [key, relativePath] of Object.entries(expected)) {
    const asset = candidateEvidence.assets?.[key];
    if (
      asset?.path !== relativePath ||
      !digestPattern.test(asset.sha256) ||
      rawDigest(readText(relativePath)) !== asset.sha256
    ) {
      fail(`${key} asset path or digest drifted`);
    }
  }
}

function validateCatalogue(
  candidateCatalogue,
  candidateRules,
  candidateRouting,
) {
  if (
    candidateCatalogue?.schema !== "starfiniti.observability-catalog.v1" ||
    candidateCatalogue.version !== 1 ||
    candidateCatalogue.status !== "accepted" ||
    candidateRouting?.schema !== "starfiniti.alert-routing-policy.v1" ||
    candidateRouting.status !== "requires-environment-binding"
  ) {
    fail("catalogue or routing schema/status drifted");
  }
  const allowedLabels = new Set(candidateCatalogue.labels?.allowed);
  const forbiddenLabels = new Set(candidateCatalogue.labels?.forbidden);
  if (
    allowedLabels.size !== candidateCatalogue.labels?.allowed?.length ||
    forbiddenLabels.size !== candidateCatalogue.labels?.forbidden?.length ||
    [...forbiddenLabels].some((label) => allowedLabels.has(label)) ||
    candidateCatalogue.labels?.maximumSeriesPerSignal !== 500
  ) {
    fail("bounded label policy is invalid");
  }
  for (const label of [
    "environment",
    "service",
    "component",
    "operation",
    "provider",
    "severity",
    "deployment_mode",
    "queue",
    "surface",
    "outcome",
    "target_class",
  ]) {
    if (!allowedLabels.has(label))
      fail(`required bounded label ${label} is absent`);
  }
  const ownerIds = uniqueIds(candidateCatalogue.owners, "owners");
  const routeIds = uniqueIds(candidateCatalogue.routes, "routes");
  const sourceIds = uniqueIds(candidateCatalogue.sources, "sources");
  exactSet(ownerIds, requiredOwners, "owner catalogue");
  exactSet(routeIds, requiredRoutes, "route catalogue");
  exactSet(sourceIds, requiredSources, "source catalogue");
  for (const route of candidateCatalogue.routes) {
    if (
      route.billingIndependent !== true ||
      !Number.isInteger(route.acknowledgementMinutes) ||
      !Number.isInteger(route.escalationMinutes) ||
      !Number.isInteger(route.repeatMinutes) ||
      route.acknowledgementMinutes < 1 ||
      route.escalationMinutes < route.acknowledgementMinutes
    ) {
      fail(`route ${route.id} is not bounded and billing-independent`);
    }
  }
  const signalIds = uniqueIds(candidateCatalogue.signals, "signals");
  const metricBySignal = new Map();
  for (const signal of candidateCatalogue.signals) {
    if (
      !/^[a-z][a-z0-9_]{2,127}$/u.test(signal.metric) ||
      !sourceIds.has(signal.source) ||
      !["gauge", "counter", "histogram"].includes(signal.type) ||
      !Array.isArray(signal.requiredLabels) ||
      new Set(signal.requiredLabels).size !== signal.requiredLabels.length ||
      signal.requiredLabels.some((label) => !allowedLabels.has(label))
    ) {
      fail(
        `signal ${signal.id} has an invalid source metric type or label set`,
      );
    }
    metricBySignal.set(signal.id, signal.metric);
  }
  const alertIds = uniqueIds(candidateCatalogue.alerts, "alerts");
  exactSet(alertIds, requiredAlerts, "alert catalogue");
  const alertById = new Map(
    candidateCatalogue.alerts.map((alert) => [alert.id, alert]),
  );
  for (const alert of candidateCatalogue.alerts) {
    if (
      !Array.isArray(alert.signalIds) ||
      alert.signalIds.length === 0 ||
      alert.signalIds.some((id) => !signalIds.has(id)) ||
      !["critical", "high", "warning"].includes(alert.severity) ||
      !ownerIds.has(alert.owner) ||
      !routeIds.has(alert.route) ||
      !/^OPS-[0-9]{3}$/u.test(alert.runbook) ||
      alert.dashboard !== "starfiniti-operations" ||
      !durationPattern.test(alert.for) ||
      !durationPattern.test(alert.keepFiringFor) ||
      typeof alert.expression !== "string" ||
      alert.expression.length < 10 ||
      typeof alert.summary !== "string" ||
      alert.summary.length < 20
    ) {
      fail(`alert ${alert.id} has an invalid contract`);
    }
    if (alert.severity === "critical" && alert.route === "operations-ticket") {
      fail(`critical alert ${alert.id} cannot use a ticket-only route`);
    }
    if (immediateAlerts.has(alert.id) && alert.for !== "0s") {
      fail(`protected alert ${alert.id} must page immediately`);
    }
    for (const signalId of alert.signalIds) {
      if (!alert.expression.includes(metricBySignal.get(signalId))) {
        fail(`alert ${alert.id} does not use signal ${signalId}`);
      }
    }
    for (const matcher of alert.expression.matchAll(/\{([^}]*)\}/gu)) {
      for (const labelMatch of matcher[1].matchAll(
        /([a-z_][a-z0-9_]*)\s*(?:=|!=|=~|!~)/gu,
      )) {
        if (labelMatch[1] !== "job" && !allowedLabels.has(labelMatch[1])) {
          fail(
            `alert ${alert.id} uses unbounded matcher label ${labelMatch[1]}`,
          );
        }
      }
    }
    for (const grouping of alert.expression.matchAll(/\bby\s*\(([^)]*)\)/gu)) {
      for (const label of grouping[1].split(",").map((value) => value.trim())) {
        if (label !== "le" && !allowedLabels.has(label)) {
          fail(`alert ${alert.id} uses unbounded grouping label ${label}`);
        }
      }
    }
  }
  const backupAlert = alertById.get("StarfinitiBackupTransferAmplification");
  if (
    !backupAlert.expression.includes(
      "starfiniti_backup_cycle_transfer_amplification_ratio > 4",
    ) ||
    !backupAlert.expression.includes(
      "starfiniti_backup_cycle_transferred_bytes > 1073741824",
    )
  ) {
    fail("backup amplification guard lost its ratio or absolute threshold");
  }
  const internalStreamAlert = alertById.get(
    "StarfinitiBackupInternalStreamSuspected",
  );
  if (
    normalizeExpression(internalStreamAlert.expression) !==
      normalizeExpression(
        "max by (environment, service) (rate(starfiniti_backup_guest_egress_bytes_total[2m])) > 104857600 and on (environment, service) max by (environment, service) (rate(starfiniti_backup_guest_egress_bytes_total[2m])) > 4 * max by (environment, service) (rate(starfiniti_backup_physical_uplink_egress_bytes_total[2m]))",
      ) ||
    internalStreamAlert.for !== "1m"
  ) {
    fail("semantic internal-stream guard lost its rate ratio or duration");
  }
  const networkCountersAlert = alertById.get(
    "StarfinitiBackupNetworkCountersMissing",
  );
  if (
    normalizeExpression(networkCountersAlert.expression) !==
      normalizeExpression(
        'absent(starfiniti_backup_guest_egress_bytes_total{environment="production"}) or absent(starfiniti_backup_physical_uplink_egress_bytes_total{environment="production"}) or absent(starfiniti_backup_network_counter_capture_unixtime_seconds{environment="production"}) or time() - max by (environment, service) (starfiniti_backup_network_counter_capture_unixtime_seconds{environment="production"}) > 90',
      ) ||
    networkCountersAlert.for !== "0s"
  ) {
    fail("semantic network-counter freshness guard is incomplete");
  }
  const offsiteArchiveAlert = alertById.get(
    "StarfinitiOffsiteArchiveRpoBreached",
  );
  if (
    !offsiteArchiveAlert.expression.includes(
      "absent(starfiniti_postgres_offsite_archive_unixtime_seconds",
    ) ||
    !offsiteArchiveAlert.expression.includes(
      "starfiniti_postgres_offsite_archive_last_attempt_success",
    ) ||
    !offsiteArchiveAlert.expression.includes("> 300")
  ) {
    fail("off-site archive guard lost absence attempt or RPO detection");
  }
  const repositoryIsolationAlert = alertById.get(
    "StarfinitiPostgresBorgRepositoryIsolationLost",
  );
  if (
    !repositoryIsolationAlert.expression.includes(
      "absent(starfiniti_postgres_borg_repository_isolated",
    ) ||
    !repositoryIsolationAlert.expression.includes("< 1")
  ) {
    fail("dedicated Borg repository isolation guard is incomplete");
  }
  const retentionGapAlert = alertById.get("StarfinitiPostgresBorgRetentionGap");
  if (
    !retentionGapAlert.expression.includes(
      "absent(starfiniti_postgres_borg_recent_archive_max_interval_seconds",
    ) ||
    !retentionGapAlert.expression.includes(
      "starfiniti_postgres_borg_maintenance_last_attempt_success",
    ) ||
    !retentionGapAlert.expression.includes("> 300")
  ) {
    fail("retained recovery-interval guard is incomplete");
  }

  const prometheusRules = candidateRules?.groups?.flatMap(
    (group) => group.rules ?? [],
  );
  if (!Array.isArray(prometheusRules))
    fail("Prometheus rule groups are absent");
  const prometheusIds = new Set(prometheusRules.map((rule) => rule.alert));
  exactSet(prometheusIds, requiredAlerts, "Prometheus alert projection");
  if (prometheusRules.length !== prometheusIds.size) {
    fail("Prometheus projection contains duplicate alerts");
  }
  for (const rule of prometheusRules) {
    const alert = alertById.get(rule.alert);
    if (
      normalizeExpression(rule.expr) !==
        normalizeExpression(alert.expression) ||
      rule.for !== alert.for ||
      rule.keep_firing_for !== alert.keepFiringFor ||
      rule.labels?.severity !== alert.severity ||
      rule.labels?.owner !== alert.owner ||
      rule.labels?.route !== alert.route ||
      rule.labels?.service !== "starfiniti-loyalty" ||
      rule.annotations?.runbook !== alert.runbook ||
      rule.annotations?.dashboard !== alert.dashboard ||
      rule.annotations?.summary !== alert.summary
    ) {
      fail(`Prometheus rule ${rule.alert} drifted from the catalogue`);
    }
  }

  const routingIds = uniqueIds(
    candidateRouting.routes,
    "routing policy routes",
  );
  exactSet(routingIds, requiredRoutes, "routing policy");
  if (
    !Array.isArray(candidateRouting.requirements) ||
    !candidateRouting.requirements.some((item) =>
      String(item).includes("Billing subscription and entitlement labels"),
    ) ||
    !candidateRouting.requirements.some((item) =>
      String(item).includes(
        "never suppress ledger tenant privacy checkout WAL-RPO or off-site-recovery",
      ),
    ) ||
    !candidateRouting.requirements.some((item) =>
      String(item).includes("independently hosted dead-man switch"),
    )
  ) {
    fail("routing policy lost billing or protected-alert safeguards");
  }
}

function validateDashboard(
  candidateDashboard,
  dashboardProvider,
  datasourceProvider,
) {
  if (
    candidateDashboard?.uid !== "starfiniti-operations" ||
    candidateDashboard.editable !== false ||
    candidateDashboard.refresh !== "30s" ||
    candidateDashboard.timezone !== "utc" ||
    !Array.isArray(candidateDashboard.panels) ||
    candidateDashboard.panels.length < 10 ||
    (candidateDashboard.templating?.list?.length ?? 0) !== 0
  ) {
    fail("Grafana operations dashboard contract drifted");
  }
  const panelIds = new Set(candidateDashboard.panels.map((panel) => panel.id));
  if (panelIds.size !== candidateDashboard.panels.length) {
    fail("Grafana dashboard contains duplicate panel ids");
  }
  const dashboardText = JSON.stringify(candidateDashboard);
  for (const requiredMetric of [
    "starfiniti_event_to_ledger_seconds_bucket",
    "starfiniti_ledger_unexplained_difference_count",
    "starfiniti_tenant_boundary_violation_total",
    "starfiniti_checkout_hub_dependency_failure_total",
    "starfiniti_postgres_wal_archive_lag_seconds",
    "starfiniti_queue_oldest_seconds",
    "starfiniti_dead_letter_count",
    "starfiniti_worker_up",
    "starfiniti_database_pool_used_ratio",
    "starfiniti_database_disk_available_ratio",
    "starfiniti_backup_cycle_transfer_amplification_ratio",
    "starfiniti_backup_cycle_transferred_bytes",
    "starfiniti_backup_guest_egress_bytes_total",
    "starfiniti_backup_physical_uplink_egress_bytes_total",
    "starfiniti_backup_network_counter_capture_unixtime_seconds",
    "starfiniti_postgres_offsite_archive_unixtime_seconds",
    "starfiniti_postgres_offsite_archive_last_attempt_success",
    "starfiniti_postgres_borg_repository_isolated",
    "starfiniti_postgres_borg_maintenance_unixtime_seconds",
    "starfiniti_postgres_borg_maintenance_last_attempt_success",
    "starfiniti_postgres_borg_recent_archive_max_interval_seconds",
    "starfiniti_postgres_borg_recent_archive_count",
    "starfiniti_recovery_exercise_age_seconds",
    "starfiniti_incident_route_exercise_age_seconds",
    "starfiniti_observability_required_series_present_ratio",
  ]) {
    if (!dashboardText.includes(requiredMetric)) {
      fail(`Grafana dashboard omits ${requiredMetric}`);
    }
  }
  const semanticNetworkPanel = candidateDashboard.panels.find(
    (panel) => panel.id === 14,
  );
  const freshnessOverride = semanticNetworkPanel?.fieldConfig?.overrides?.find(
    (override) =>
      override.matcher?.id === "byFrameRefID" &&
      override.matcher?.options === "C",
  );
  const freshnessProperties = new Map(
    freshnessOverride?.properties?.map((property) => [
      property.id,
      property.value,
    ]) ?? [],
  );
  if (
    semanticNetworkPanel?.title !==
      "Semantic backup network rates and freshness" ||
    semanticNetworkPanel.fieldConfig?.defaults?.unit !== "Bps" ||
    freshnessProperties.get("unit") !== "s" ||
    freshnessProperties.get("thresholds")?.steps?.[1]?.value !== 90
  ) {
    fail("Grafana semantic network rate or freshness units drifted");
  }
  if (
    /tenant|customer|member|order|email|coupon/iu.test(
      JSON.stringify(candidateDashboard.templating),
    )
  ) {
    fail("Grafana dashboard exposes an identifying variable");
  }
  const provider = dashboardProvider?.providers?.[0];
  const datasource = datasourceProvider?.datasources?.[0];
  if (
    provider?.disableDeletion !== true ||
    provider?.allowUiUpdates !== false ||
    provider?.type !== "file" ||
    provider?.options?.path !==
      "/etc/grafana/provisioning/starfiniti-dashboards" ||
    datasource?.uid !== "starfiniti-prometheus" ||
    datasource?.type !== "prometheus" ||
    datasource?.access !== "proxy" ||
    datasource?.url !== "${STARFINITI_PROMETHEUS_URL}" ||
    datasource?.editable !== false
  ) {
    fail(
      "Grafana provisioning is mutable or has an invalid data-source boundary",
    );
  }
}

function validateDocuments(candidateCatalogue) {
  for (const alert of candidateCatalogue.alerts) {
    if (!runbooks.includes(`## ${alert.runbook} —`)) {
      fail(`runbook ${alert.runbook} is missing`);
    }
  }
  for (const marker of [
    "SEV0",
    "SEV1",
    "SEV2",
    "detected → declared → contained → mitigated → recovered → monitoring → closed",
    "Billing state",
    "Two independently reviewed exercises",
    "POSTMORTEM_TEMPLATE.md",
  ]) {
    if (!incidents.includes(marker))
      fail(`incident policy is missing ${marker}`);
  }
  for (const marker of [
    "Exact release, image, migration, configuration, catalogue, rule, dashboard, and routing-policy fingerprints",
    "Exact unexplained difference: must be zero",
    "Durable actions",
    "Owner role",
  ]) {
    if (!postmortem.includes(marker))
      fail(`postmortem template is missing ${marker}`);
  }
}

function validateSourceInventory(inventory, candidateEvidence) {
  if (
    inventory?.schema !== "starfiniti.operations-source-inventory.v1" ||
    inventory.status !== "verified" ||
    inventory.candidateCommit !== candidateEvidence.candidate.commit ||
    inventory.catalogSha256 !== candidateEvidence.assets.catalog.sha256 ||
    inventory.rulesSha256 !== candidateEvidence.assets.prometheusRules.sha256 ||
    inventory.routingSha256 !== candidateEvidence.assets.routingPolicy.sha256 ||
    inventory.dashboardSha256 !== candidateEvidence.assets.dashboard.sha256 ||
    inventory.missingSeriesAlertEnabled !== true ||
    inventory.externalDeadManSwitchEnabled !== true ||
    inventory.clockSynchronized !== true
  ) {
    fail("operations source inventory identity or safety flags are invalid");
  }
  exactUtc(inventory.observedAt, "source inventory observedAt");
  const sources = uniqueIds(inventory.sources, "source inventory sources");
  exactSet(sources, requiredSources, "source inventory sources");
  if (
    inventory.sources.some(
      (source) =>
        source.active !== true ||
        source.fresh !== true ||
        source.seriesPresent !== true,
    )
  ) {
    fail("a required monitoring source is inactive stale or absent");
  }
  const routes = uniqueIds(inventory.routes, "source inventory routes");
  exactSet(routes, requiredRoutes, "source inventory routes");
  if (
    inventory.routes.some(
      (route) =>
        route.bound !== true ||
        route.billingIndependent !== true ||
        (route.id.endsWith("page") && route.destinationCount < 2),
    )
  ) {
    fail("a live route is unbound single-destination or billing-dependent");
  }
  const owners = new Set(inventory.ownerRoles);
  exactSet(owners, requiredOwners, "source inventory owner roles");
}

function validateRouteTest(report, candidateEvidence) {
  if (
    report?.schema !== "starfiniti.operations-route-test.v1" ||
    report.status !== "passed" ||
    report.candidateCommit !== candidateEvidence.candidate.commit ||
    report.catalogSha256 !== candidateEvidence.assets.catalog.sha256 ||
    report.rulesSha256 !== candidateEvidence.assets.prometheusRules.sha256 ||
    report.routingSha256 !== candidateEvidence.assets.routingPolicy.sha256 ||
    report.protectedAlertInhibitionCount !== 0 ||
    report.billingConditionCount !== 0 ||
    report.deadManSwitchTriggered !== true ||
    report.failedReloadPreservedKnownGood !== true
  ) {
    fail("route-test identity or safety evidence is invalid");
  }
  exactUtc(report.startedAt, "route test startedAt");
  exactUtc(report.finishedAt, "route test finishedAt");
  const routeIds = uniqueIds(report.routes, "route-test routes");
  exactSet(routeIds, requiredRoutes, "route-test routes");
  if (
    report.routes.some(
      (route) =>
        route.delivered !== true ||
        route.acknowledged !== true ||
        route.escalated !== true ||
        route.repeated !== true ||
        route.handoffVerified !== true ||
        (route.id.endsWith("page") && route.independentDestinationCount < 2),
    )
  ) {
    fail("route delivery acknowledgement escalation repeat or handoff failed");
  }
}

function validateExercise(report, candidateEvidence, label) {
  if (
    report?.schema !== "starfiniti.incident-exercise.v1" ||
    report.status !== "passed" ||
    report.candidateCommit !== candidateEvidence.candidate.commit ||
    report.catalogSha256 !== candidateEvidence.assets.catalog.sha256 ||
    report.rulesSha256 !== candidateEvidence.assets.prometheusRules.sha256 ||
    report.routingSha256 !== candidateEvidence.assets.routingPolicy.sha256 ||
    report.dashboardSha256 !== candidateEvidence.assets.dashboard.sha256 ||
    !/^exercise-[a-z0-9][a-z0-9-]{5,63}$/u.test(report.exerciseId) ||
    !digestPattern.test(report.restrictedEvidenceSha256) ||
    !digestPattern.test(report.independentReviewSha256) ||
    !digestPattern.test(report.postmortemSha256) ||
    !Array.isArray(report.regressionControlSha256s) ||
    report.regressionControlSha256s.length < 1 ||
    report.regressionControlSha256s.some((value) => !digestPattern.test(value))
  ) {
    fail(`${label} exercise identity or evidence binding is invalid`);
  }
  const started = exactUtc(report.startedAt, `${label} startedAt`);
  const closed = exactUtc(report.closedAt, `${label} closedAt`);
  if (closed <= started) fail(`${label} exercise interval is invalid`);
  const exactStates = [
    "detected",
    "declared",
    "contained",
    "mitigated",
    "recovered",
    "monitoring",
    "closed",
  ];
  if (
    !Array.isArray(report.states) ||
    report.states.length !== exactStates.length ||
    report.states.some((state, index) => state !== exactStates[index]) ||
    report.alertsDelivered !== true ||
    report.communicationsOnCadence !== true ||
    report.handoffVerified !== true ||
    report.checkoutIndependent !== true ||
    report.tenantIsolationVerified !== true ||
    report.privacyReplayVerified !== true ||
    report.independentReviewerApproved !== true
  ) {
    fail(`${label} exercise did not traverse and verify the required controls`);
  }
  const differences = [
    "ledger",
    "queues",
    "woocommerce",
    "tenantIsolation",
    "privacy",
    "checkout",
    "recovery",
  ];
  if (
    Object.keys(report.differences ?? {}).length !== differences.length ||
    differences.some((key) => report.differences[key] !== 0)
  ) {
    fail(`${label} exercise has an unexplained integrity difference`);
  }
  return report;
}

function validateExercisePair(primary, repeat) {
  if (
    primary.exerciseId === repeat.exerciseId ||
    primary.restrictedEvidenceSha256 === repeat.restrictedEvidenceSha256 ||
    primary.independentReviewSha256 === repeat.independentReviewSha256 ||
    primary.postmortemSha256 === repeat.postmortemSha256
  ) {
    fail(
      "two operations exercises must use distinct incidents evidence reviews and postmortems",
    );
  }
  if (
    primary.backupAmplificationSynthetic !== true &&
    repeat.backupAmplificationSynthetic !== true
  ) {
    fail("one exercise must safely cover backup transfer amplification");
  }
}

function validateReconciliation(
  report,
  candidateEvidence,
  sourceDigest,
  routeDigest,
  primaryDigest,
  repeatDigest,
) {
  if (
    report?.schema !== "starfiniti.operations-reconciliation.v1" ||
    report.status !== "passed" ||
    report.candidateCommit !== candidateEvidence.candidate.commit ||
    report.sourceInventorySha256 !== sourceDigest ||
    report.routeTestSha256 !== routeDigest ||
    report.primaryExerciseSha256 !== primaryDigest ||
    report.repeatExerciseSha256 !== repeatDigest ||
    report.independentReconciliation !== true
  ) {
    fail("operations reconciliation identity or artifact binding is invalid");
  }
  exactUtc(report.reviewedAt, "operations reconciliation reviewedAt");
  const approvals = ["product", "operations", "security", "valueIntegrity"];
  if (
    Object.keys(report.approvals ?? {}).length !== approvals.length ||
    approvals.some((key) => report.approvals[key] !== true)
  ) {
    fail("operations reconciliation is missing owner approval");
  }
  const differences = [
    "alerts",
    "sources",
    "routing",
    "ledger",
    "queues",
    "woocommerce",
    "tenantIsolation",
    "privacy",
    "checkout",
    "recovery",
  ];
  if (
    Object.keys(report.differences ?? {}).length !== differences.length ||
    differences.some((key) => report.differences[key] !== 0)
  ) {
    fail("operations reconciliation contains an unexplained difference");
  }
}

function validateDocument(
  candidateEvidence,
  candidateCatalogue,
  candidateRules,
  candidateRouting,
  candidateDashboard,
  candidateTasks,
  artifactReader = readBoundArtifact,
) {
  if (
    candidateEvidence?.schema !== "starfiniti.operations-evidence.v1" ||
    !["in_progress", "complete"].includes(candidateEvidence.status) ||
    !commitPattern.test(
      candidateEvidence.currentProduction?.applicationCommit,
    ) ||
    typeof candidateEvidence.currentProduction?.monitoringServicesActive !==
      "boolean" ||
    !Number.isSafeInteger(
      candidateEvidence.currentProduction?.historicalVm971TransmitBytes,
    ) ||
    !Number.isSafeInteger(
      candidateEvidence.currentProduction
        ?.recentVm971MaximumNetoutBytesPerSecond,
    ) ||
    candidateEvidence.currentProduction?.wholeVmBackupTimerEnabled !== false ||
    candidateEvidence.currentProduction?.postgresBackupTimerEnabled !== true ||
    !commitPattern.test(candidateEvidence.candidate?.commit) ||
    candidateEvidence.candidate?.branch !== "codex/m15-operations-incidents"
  ) {
    fail("evidence identity production baseline or candidate is invalid");
  }
  exactUtc(candidateEvidence.observedAt, "operations evidence observedAt");
  validateAssets(candidateEvidence);
  validateCatalogue(candidateCatalogue, candidateRules, candidateRouting);
  validateDashboard(
    candidateDashboard,
    dashboardProvisioning,
    datasourceProvisioning,
  );
  validateDocuments(candidateCatalogue);

  const checks = uniqueIds(candidateEvidence.checks, "operations checks");
  exactSet(checks, requiredChecks, "operations checks");
  const incomplete = [];
  for (const check of candidateEvidence.checks) {
    if (
      !allowedStatuses.has(check.status) ||
      typeof check.evidence !== "string"
    ) {
      fail(`check ${check.id} status or evidence is invalid`);
    }
    if (
      check.status === "passed" &&
      pendingLanguagePattern.test(check.evidence)
    ) {
      fail(`passed check ${check.id} contains pending language`);
    }
    if (check.status !== "passed") {
      incomplete.push(check.id);
      if (!pendingLanguagePattern.test(check.evidence)) {
        fail(
          `non-passing check ${check.id} lacks explicit pending/failure language`,
        );
      }
    }
  }
  if (
    !Array.isArray(candidateEvidence.automaticFails) ||
    candidateEvidence.automaticFails.length < 14
  ) {
    fail("automatic-failure catalogue is incomplete");
  }

  const m15 = candidateTasks.tasks?.find(
    (task) => task.id === "M15-GA-HARDENING",
  );
  const slice = m15?.slices?.find(
    (item) => item.id === "M15-S05-OPERATIONS-AND-INCIDENTS",
  );
  if (
    !slice ||
    !["in_progress", "complete"].includes(slice.status) ||
    !slice.verification?.includes("npm run operations:validate") ||
    !slice.evidence?.includes(paths.evidence) ||
    !slice.evidence?.includes(paths.containment) ||
    !slice.evidence?.includes(paths.catalogue) ||
    !slice.evidence?.includes(paths.rules) ||
    !slice.evidence?.includes(paths.routing) ||
    !slice.evidence?.includes(paths.dashboard)
  ) {
    fail("M15-S05 task graph or verification/evidence links are incomplete");
  }

  const claimKeys = [
    "sourceInventoryPath",
    "sourceInventorySha256",
    "routeTestPath",
    "routeTestSha256",
    "primaryExercisePath",
    "primaryExerciseSha256",
    "repeatExercisePath",
    "repeatExerciseSha256",
    "reconciliationPath",
    "reconciliationSha256",
  ];
  if (candidateEvidence.claim?.enabled !== true) {
    if (
      candidateEvidence.status !== "in_progress" ||
      slice.status !== "in_progress" ||
      candidateEvidence.candidate.approvedEnvironment !== false ||
      candidateEvidence.candidate.operationsClaimApproved !== false ||
      candidateEvidence.claim?.monitoringActivated !== false ||
      candidateEvidence.claim?.alertRoutingActivated !== false ||
      candidateEvidence.claim?.incidentExercisesApproved !== false ||
      claimKeys.some((key) => candidateEvidence.claim?.[key] !== null) ||
      incomplete.length === 0
    ) {
      fail(
        "disabled operations claim must remain explicitly incomplete and artifact-free",
      );
    }
    return { incomplete };
  }

  if (
    candidateEvidence.status !== "complete" ||
    slice.status !== "complete" ||
    incomplete.length !== 0 ||
    candidateEvidence.candidate.approvedEnvironment !== true ||
    candidateEvidence.candidate.operationsClaimApproved !== true ||
    candidateEvidence.claim.monitoringActivated !== true ||
    candidateEvidence.claim.alertRoutingActivated !== true ||
    candidateEvidence.claim.incidentExercisesApproved !== true
  ) {
    fail(
      "enabled operations claim lacks complete checks activation or approvals",
    );
  }
  const artifactPaths = claimKeys.filter((key) => key.endsWith("Path"));
  if (
    new Set(artifactPaths.map((key) => candidateEvidence.claim[key])).size !== 5
  ) {
    fail("operations completion must use five distinct artifacts");
  }
  const source = artifactReader(
    candidateEvidence.claim.sourceInventoryPath,
    candidateEvidence.claim.sourceInventorySha256,
  );
  const route = artifactReader(
    candidateEvidence.claim.routeTestPath,
    candidateEvidence.claim.routeTestSha256,
  );
  const primary = artifactReader(
    candidateEvidence.claim.primaryExercisePath,
    candidateEvidence.claim.primaryExerciseSha256,
  );
  const repeat = artifactReader(
    candidateEvidence.claim.repeatExercisePath,
    candidateEvidence.claim.repeatExerciseSha256,
  );
  const reconciliation = artifactReader(
    candidateEvidence.claim.reconciliationPath,
    candidateEvidence.claim.reconciliationSha256,
  );
  validateSourceInventory(source.parsed, candidateEvidence);
  validateRouteTest(route.parsed, candidateEvidence);
  validateExercise(primary.parsed, candidateEvidence, "primary");
  validateExercise(repeat.parsed, candidateEvidence, "repeat");
  validateExercisePair(primary.parsed, repeat.parsed);
  validateReconciliation(
    reconciliation.parsed,
    candidateEvidence,
    source.rawSha256,
    route.rawSha256,
    primary.rawSha256,
    repeat.rawSha256,
  );
  return { incomplete };
}

validateBackupTrafficContainment(containment);
validateBackupTrafficFollowUp(trafficFollowUp, containment);

const result = validateDocument(
  evidence,
  catalogue,
  rules,
  routing,
  dashboard,
  tasks,
);

if (process.argv.includes("--self-test")) {
  const unknownContainmentField = structuredClone(containment);
  unknownContainmentField.extra = true;
  assert.throws(
    () => validateBackupTrafficContainment(unknownContainmentField),
    /backup-traffic containment keys differ/u,
  );

  const driftedContainmentObservation = structuredClone(containment);
  driftedContainmentObservation.observedAt = "2026-09-02T09:25:02Z";
  assert.throws(
    () => validateBackupTrafficContainment(driftedContainmentObservation),
    /observation identity differs/u,
  );

  const falseContainment = structuredClone(containment);
  falseContainment.containment.wholeVmBackupTimerEnabled = true;
  assert.throws(
    () => validateBackupTrafficContainment(falseContainment),
    /containment identity or safety boundary is invalid/u,
  );

  const unknownFollowUpField = structuredClone(trafficFollowUp);
  unknownFollowUpField.extra = true;
  assert.throws(
    () => validateBackupTrafficFollowUp(unknownFollowUpField, containment),
    /backup-traffic follow-up keys differ/u,
  );

  const driftedPriorDigest = structuredClone(trafficFollowUp);
  driftedPriorDigest.priorEvidence.sha256 = "0".repeat(64);
  assert.throws(
    () => validateBackupTrafficFollowUp(driftedPriorDigest, containment),
    /identity or safety boundary is invalid/u,
  );

  const cumulativeAsRate = structuredClone(trafficFollowUp);
  cumulativeAsRate.traffic.tapSample.cumulativeCounterIsRate = true;
  assert.throws(
    () => validateBackupTrafficFollowUp(cumulativeAsRate, containment),
    /identity or safety boundary is invalid/u,
  );

  const driftedTapDelta = structuredClone(trafficFollowUp);
  driftedTapDelta.traffic.tapSample.deltaBytes += 1;
  assert.throws(
    () => validateBackupTrafficFollowUp(driftedTapDelta, containment),
    /traffic arithmetic is invalid/u,
  );

  const incompleteDay = structuredClone(trafficFollowUp);
  incompleteDay.traffic.latestDay.sampleCount = 1439;
  assert.throws(
    () => validateBackupTrafficFollowUp(incompleteDay, containment),
    /traffic arithmetic is invalid/u,
  );

  const falseActiveStream = structuredClone(trafficFollowUp);
  falseActiveStream.traffic.activeFullStreamObserved = true;
  assert.throws(
    () => validateBackupTrafficFollowUp(falseActiveStream, containment),
    /identity or safety boundary is invalid/u,
  );

  const unsafeTimer = structuredClone(trafficFollowUp);
  unsafeTimer.backup.wholeVm.timerEnabled = true;
  assert.throws(
    () => validateBackupTrafficFollowUp(unsafeTimer, containment),
    /identity or safety boundary is invalid/u,
  );

  const stoppedPostgresTimer = structuredClone(trafficFollowUp);
  stoppedPostgresTimer.backup.postgres.timerActive = false;
  assert.throws(
    () => validateBackupTrafficFollowUp(stoppedPostgresTimer, containment),
    /identity or safety boundary is invalid/u,
  );

  const erasedArchive = structuredClone(trafficFollowUp);
  erasedArchive.backup.postgres.archives.pop();
  assert.throws(
    () => validateBackupTrafficFollowUp(erasedArchive, containment),
    /archive set is invalid/u,
  );

  const failedArchive = structuredClone(trafficFollowUp);
  failedArchive.backup.postgres.archives[4].result = "failed";
  assert.throws(
    () => validateBackupTrafficFollowUp(failedArchive, containment),
    /archive evidence drifted/u,
  );

  const falseRecoveryClose = structuredClone(trafficFollowUp);
  falseRecoveryClose.authority.r004Closed = true;
  assert.throws(
    () => validateBackupTrafficFollowUp(falseRecoveryClose, containment),
    /identity or safety boundary is invalid/u,
  );

  const falseProductionMutation = structuredClone(trafficFollowUp);
  falseProductionMutation.observed.productionMutation = true;
  assert.throws(
    () => validateBackupTrafficFollowUp(falseProductionMutation, containment),
    /identity or safety boundary is invalid/u,
  );

  const falseMonitoringActivation = structuredClone(trafficFollowUp);
  falseMonitoringActivation.authority.monitoringActivated = true;
  assert.throws(
    () => validateBackupTrafficFollowUp(falseMonitoringActivation, containment),
    /identity or safety boundary is invalid/u,
  );

  const forbiddenLabel = structuredClone(catalogue);
  forbiddenLabel.signals[0].requiredLabels.push("customer_id");
  assert.throws(
    () => validateCatalogue(forbiddenLabel, rules, routing),
    /invalid source metric type or label set/u,
  );

  const driftedRule = structuredClone(rules);
  driftedRule.groups[0].rules[0].expr = "vector(1)";
  assert.throws(
    () => validateCatalogue(catalogue, driftedRule, routing),
    /drifted from the catalogue/u,
  );

  const weakenedInternalStream = structuredClone(catalogue);
  weakenedInternalStream.alerts.find(
    (alert) => alert.id === "StarfinitiBackupInternalStreamSuspected",
  ).expression = weakenedInternalStream.alerts
    .find((alert) => alert.id === "StarfinitiBackupInternalStreamSuspected")
    .expression.replace("> 104857600", "> 1000");
  assert.throws(
    () => validateCatalogue(weakenedInternalStream, rules, routing),
    /internal-stream guard lost/u,
  );

  const staleCounterAccepted = structuredClone(catalogue);
  staleCounterAccepted.alerts.find(
    (alert) => alert.id === "StarfinitiBackupNetworkCountersMissing",
  ).expression = staleCounterAccepted.alerts
    .find((alert) => alert.id === "StarfinitiBackupNetworkCountersMissing")
    .expression.replace("> 90", "> 91");
  assert.throws(
    () => validateCatalogue(staleCounterAccepted, rules, routing),
    /freshness guard is incomplete/u,
  );

  const delayedProtectedPage = structuredClone(catalogue);
  delayedProtectedPage.alerts.find(
    (alert) => alert.id === "StarfinitiLedgerDifference",
  ).for = "1m";
  assert.throws(
    () => validateCatalogue(delayedProtectedPage, rules, routing),
    /must page immediately/u,
  );

  const mutableDashboard = structuredClone(dashboard);
  mutableDashboard.editable = true;
  assert.throws(
    () =>
      validateDashboard(
        mutableDashboard,
        dashboardProvisioning,
        datasourceProvisioning,
      ),
    /dashboard contract drifted/u,
  );

  const ambiguousFreshnessUnit = structuredClone(dashboard);
  ambiguousFreshnessUnit.panels.find(
    (panel) => panel.id === 14,
  ).fieldConfig.overrides = [];
  assert.throws(
    () =>
      validateDashboard(
        ambiguousFreshnessUnit,
        dashboardProvisioning,
        datasourceProvisioning,
      ),
    /network rate or freshness units drifted/u,
  );

  const falseCompletion = structuredClone(evidence);
  falseCompletion.claim.enabled = true;
  assert.throws(
    () =>
      validateDocument(
        falseCompletion,
        catalogue,
        rules,
        routing,
        dashboard,
        tasks,
      ),
    /lacks complete checks activation or approvals/u,
  );

  const unsafeWholeVmSchedule = structuredClone(evidence);
  unsafeWholeVmSchedule.currentProduction.wholeVmBackupTimerEnabled = true;
  assert.throws(
    () =>
      validateDocument(
        unsafeWholeVmSchedule,
        catalogue,
        rules,
        routing,
        dashboard,
        tasks,
      ),
    /production baseline or candidate is invalid/u,
  );

  assert.throws(
    () =>
      safeArtifactPath("docs/plan/evidence/M15/runs/../operations-run.json"),
    /path is unsafe/u,
  );

  const sourceInventory = {
    schema: "starfiniti.operations-source-inventory.v1",
    status: "verified",
    candidateCommit: evidence.candidate.commit,
    catalogSha256: evidence.assets.catalog.sha256,
    rulesSha256: evidence.assets.prometheusRules.sha256,
    routingSha256: evidence.assets.routingPolicy.sha256,
    dashboardSha256: evidence.assets.dashboard.sha256,
    observedAt: "2026-08-27T12:00:00Z",
    missingSeriesAlertEnabled: true,
    externalDeadManSwitchEnabled: true,
    clockSynchronized: true,
    sources: catalogue.sources.map((source) => ({
      id: source.id,
      active: true,
      fresh: true,
      seriesPresent: true,
    })),
    routes: catalogue.routes.map((route) => ({
      id: route.id,
      bound: true,
      billingIndependent: true,
      destinationCount: route.id.endsWith("page") ? 2 : 1,
    })),
    ownerRoles: [...requiredOwners],
  };
  const routeTest = {
    schema: "starfiniti.operations-route-test.v1",
    status: "passed",
    candidateCommit: evidence.candidate.commit,
    catalogSha256: evidence.assets.catalog.sha256,
    rulesSha256: evidence.assets.prometheusRules.sha256,
    routingSha256: evidence.assets.routingPolicy.sha256,
    startedAt: "2026-08-27T12:05:00Z",
    finishedAt: "2026-08-27T12:10:00Z",
    protectedAlertInhibitionCount: 0,
    billingConditionCount: 0,
    deadManSwitchTriggered: true,
    failedReloadPreservedKnownGood: true,
    routes: catalogue.routes.map((route) => ({
      id: route.id,
      delivered: true,
      acknowledged: true,
      escalated: true,
      repeated: true,
      handoffVerified: true,
      independentDestinationCount: route.id.endsWith("page") ? 2 : 1,
    })),
  };
  const makeExercise = ({
    suffix,
    startedAt,
    backupAmplificationSynthetic,
    evidenceCharacter,
    reviewCharacter,
    postmortemCharacter,
    controlCharacter,
  }) => ({
    schema: "starfiniti.incident-exercise.v1",
    status: "passed",
    candidateCommit: evidence.candidate.commit,
    catalogSha256: evidence.assets.catalog.sha256,
    rulesSha256: evidence.assets.prometheusRules.sha256,
    routingSha256: evidence.assets.routingPolicy.sha256,
    dashboardSha256: evidence.assets.dashboard.sha256,
    exerciseId: `exercise-${suffix}-safe`,
    startedAt,
    closedAt: new Date(Date.parse(startedAt) + 600_000).toISOString(),
    states: [
      "detected",
      "declared",
      "contained",
      "mitigated",
      "recovered",
      "monitoring",
      "closed",
    ],
    alertsDelivered: true,
    communicationsOnCadence: true,
    handoffVerified: true,
    checkoutIndependent: true,
    tenantIsolationVerified: true,
    privacyReplayVerified: true,
    independentReviewerApproved: true,
    backupAmplificationSynthetic,
    restrictedEvidenceSha256: evidenceCharacter.repeat(64),
    independentReviewSha256: reviewCharacter.repeat(64),
    postmortemSha256: postmortemCharacter.repeat(64),
    regressionControlSha256s: [controlCharacter.repeat(64)],
    differences: {
      ledger: 0,
      queues: 0,
      woocommerce: 0,
      tenantIsolation: 0,
      privacy: 0,
      checkout: 0,
      recovery: 0,
    },
  });
  const primaryExercise = makeExercise({
    suffix: "primary",
    startedAt: "2026-08-27T13:00:00Z",
    backupAmplificationSynthetic: true,
    evidenceCharacter: "a",
    reviewCharacter: "b",
    postmortemCharacter: "c",
    controlCharacter: "d",
  });
  const repeatExercise = makeExercise({
    suffix: "repeat",
    startedAt: "2026-08-27T14:00:00Z",
    backupAmplificationSynthetic: false,
    evidenceCharacter: "e",
    reviewCharacter: "f",
    postmortemCharacter: "1",
    controlCharacter: "2",
  });
  const rawArtifacts = {
    source: `${JSON.stringify(sourceInventory)}\n`,
    route: `${JSON.stringify(routeTest)}\n`,
    primary: `${JSON.stringify(primaryExercise)}\n`,
    repeat: `${JSON.stringify(repeatExercise)}\n`,
  };
  const validReconciliation = {
    schema: "starfiniti.operations-reconciliation.v1",
    status: "passed",
    candidateCommit: evidence.candidate.commit,
    sourceInventorySha256: rawDigest(rawArtifacts.source),
    routeTestSha256: rawDigest(rawArtifacts.route),
    primaryExerciseSha256: rawDigest(rawArtifacts.primary),
    repeatExerciseSha256: rawDigest(rawArtifacts.repeat),
    independentReconciliation: true,
    reviewedAt: "2026-08-27T15:00:00Z",
    approvals: {
      product: true,
      operations: true,
      security: true,
      valueIntegrity: true,
    },
    differences: {
      alerts: 0,
      sources: 0,
      routing: 0,
      ledger: 0,
      queues: 0,
      woocommerce: 0,
      tenantIsolation: 0,
      privacy: 0,
      checkout: 0,
      recovery: 0,
    },
  };
  rawArtifacts.reconciliation = `${JSON.stringify(validReconciliation)}\n`;
  const artifactPaths = {
    source: "docs/plan/evidence/M15/runs/operations-source.json",
    route: "docs/plan/evidence/M15/runs/operations-routes.json",
    primary: "docs/plan/evidence/M15/runs/operations-primary.json",
    repeat: "docs/plan/evidence/M15/runs/operations-repeat.json",
    reconciliation:
      "docs/plan/evidence/M15/runs/operations-reconciliation.json",
  };
  const parsedArtifacts = {
    source: sourceInventory,
    route: routeTest,
    primary: primaryExercise,
    repeat: repeatExercise,
    reconciliation: validReconciliation,
  };
  const memoryArtifacts = new Map(
    Object.keys(rawArtifacts).map((key) => [
      artifactPaths[key],
      {
        parsed: parsedArtifacts[key],
        rawSha256: rawDigest(rawArtifacts[key]),
      },
    ]),
  );
  const memoryReader = (path, expectedDigest) => {
    safeArtifactPath(path);
    const artifact = memoryArtifacts.get(path);
    if (!artifact || artifact.rawSha256 !== expectedDigest) {
      fail("self-test operations artifact binding differs");
    }
    scanArtifact(artifact.parsed, path);
    return structuredClone(artifact);
  };
  const complete = structuredClone(evidence);
  complete.status = "complete";
  complete.candidate.approvedEnvironment = true;
  complete.candidate.operationsClaimApproved = true;
  complete.claim = {
    enabled: true,
    monitoringActivated: true,
    alertRoutingActivated: true,
    incidentExercisesApproved: true,
    sourceInventoryPath: artifactPaths.source,
    sourceInventorySha256: rawDigest(rawArtifacts.source),
    routeTestPath: artifactPaths.route,
    routeTestSha256: rawDigest(rawArtifacts.route),
    primaryExercisePath: artifactPaths.primary,
    primaryExerciseSha256: rawDigest(rawArtifacts.primary),
    repeatExercisePath: artifactPaths.repeat,
    repeatExerciseSha256: rawDigest(rawArtifacts.repeat),
    reconciliationPath: artifactPaths.reconciliation,
    reconciliationSha256: rawDigest(rawArtifacts.reconciliation),
  };
  complete.checks.forEach((check) => {
    check.status = "passed";
    check.evidence =
      "Exact independently reviewed operational evidence reconciles to zero difference and satisfies the declared bounded controls.";
  });
  const completeTasks = structuredClone(tasks);
  completeTasks.tasks
    .find((task) => task.id === "M15-GA-HARDENING")
    .slices.find(
      (slice) => slice.id === "M15-S05-OPERATIONS-AND-INCIDENTS",
    ).status = "complete";
  assert.equal(
    validateDocument(
      complete,
      catalogue,
      rules,
      routing,
      dashboard,
      completeTasks,
      memoryReader,
    ).incomplete.length,
    0,
  );

  const exerciseBase = {
    exerciseId: "exercise-primary-safe",
    restrictedEvidenceSha256: "a".repeat(64),
    independentReviewSha256: "b".repeat(64),
    postmortemSha256: "c".repeat(64),
    backupAmplificationSynthetic: true,
  };
  assert.throws(
    () => validateExercisePair(exerciseBase, structuredClone(exerciseBase)),
    /must use distinct incidents evidence reviews and postmortems/u,
  );

  const reconciliation = {
    schema: "starfiniti.operations-reconciliation.v1",
    status: "passed",
    candidateCommit: evidence.candidate.commit,
    sourceInventorySha256: "a".repeat(64),
    routeTestSha256: "b".repeat(64),
    primaryExerciseSha256: "c".repeat(64),
    repeatExerciseSha256: "d".repeat(64),
    independentReconciliation: true,
    reviewedAt: "2026-08-27T12:00:00Z",
    approvals: {
      product: true,
      operations: true,
      security: false,
      valueIntegrity: true,
    },
    differences: {
      alerts: 0,
      sources: 0,
      routing: 0,
      ledger: 0,
      queues: 0,
      woocommerce: 0,
      tenantIsolation: 0,
      privacy: 0,
      checkout: 0,
      recovery: 0,
    },
  };
  assert.throws(
    () =>
      validateReconciliation(
        reconciliation,
        evidence,
        "a".repeat(64),
        "b".repeat(64),
        "c".repeat(64),
        "d".repeat(64),
      ),
    /missing owner approval/u,
  );
}

console.log(
  `Validated the immutable containment record and read-only traffic follow-up, ${requiredChecks.size} M15 operations checks, ${catalogue.signals.length} bounded signals, and ${catalogue.alerts.length} exact alerts; ${requiredChecks.size - result.incomplete.length} passed and ${result.incomplete.length} remain non-passing.`,
);
