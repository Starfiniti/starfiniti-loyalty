import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const evidencePath = join(root, "docs/plan/evidence/M01/pilot.yaml");
const tasksPath = join(root, "docs/plan/TASKS.yaml");

const requiredChecks = new Set([
  "store_owner_approval",
  "store_preflight",
  "connection_provisioning",
  "programme_publication",
  "test_customer_link",
  "completed_order_award",
  "pending_release",
  "points_release",
  "reward_redemption",
  "coupon_issue_and_capture",
  "partial_refund",
  "full_refund",
  "points_expiry",
  "source_reconciliation",
  "credential_rotation",
  "hub_outage_checkout",
  "worker_outage_checkout",
  "plugin_recovery",
  "database_wal_restore",
  "application_auth_secret_restore",
  "alert_coverage",
  "final_reconciliation",
]);

const allowedStatuses = new Set(["passed", "pending", "failed"]);
const rootKeys = [
  "schema",
  "status",
  "observedAt",
  "release",
  "applicationCommit",
  "store",
  "productionBaseline",
  "checks",
];
const aggregateKeys = [
  "organizations",
  "memberships",
  "workspaces",
  "programmes",
  "programmeVersions",
  "commerceConnections",
  "customers",
  "wallets",
  "ledgerTransactions",
  "rewardReservations",
  "deliveryInbox",
  "canonicalEvents",
  "businessEffects",
  "transactionalOutbox",
  "authUsers",
  "authIdentities",
  "migrations",
];
const recoveryKeys = [
  "walArchive",
  "archiveTimeout",
  "baseBackup",
  "postgresOffHostBorg",
  "isolatedDatabaseWalRestore",
  "wholeVmBorg",
  "applicationAuthSigningEscrowRestore",
];
const obviousSensitiveValue =
  /(?:\bBearer\s+|\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9_-]{12,}|\bwhsec_[A-Za-z0-9_-]{12,}|\bsb_secret_[A-Za-z0-9_-]{12,}|\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{8,}\.|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/iu;

const fail = (message) => {
  throw new Error(`Production pilot evidence invalid: ${message}`);
};

export function validateProductionPilotEvidence(
  evidence,
  tasks,
  { now = new Date() } = {},
) {
  exactKeys(evidence, rootKeys, "root");
  if (evidence.schema !== "starfiniti.production-pilot.v1") {
    fail("unexpected schema");
  }
  if (!new Set(["in_progress", "complete"]).has(evidence.status)) {
    fail("status must be in_progress or complete");
  }
  const observedAt = timestamp(evidence.observedAt, "observedAt");
  if (observedAt.getTime() > now.getTime() + 5 * 60 * 1_000) {
    fail("observedAt must not be in the future");
  }
  if (!/^v\d+\.\d+\.\d+$/u.test(evidence.release)) {
    fail("release must be an exact semantic version tag");
  }
  if (!/^[0-9a-f]{40}$/u.test(evidence.applicationCommit)) {
    fail("applicationCommit must be one exact lowercase commit SHA");
  }

  validateStore(evidence.store);
  validateBaseline(evidence.productionBaseline);
  const checks = validateChecks(evidence.checks);
  inspectStrings(evidence);

  if (!Array.isArray(tasks?.tasks)) fail("task graph is invalid");
  const m01 = tasks.tasks.find((task) => task.id === "M01-PRODUCTION-PILOT");
  if (!m01) fail("M01 task is missing");
  if (evidence.store.approved !== (checks.store_owner_approval === "passed")) {
    fail("store approval and store_owner_approval must agree");
  }
  if (!evidence.store.approved) {
    for (const [id, status] of Object.entries(checks)) {
      if (id !== "database_wal_restore" && status === "passed") {
        fail(`unapproved-store check ${id} must not pass`);
      }
    }
  }
  const databaseRestored =
    recoveryStatus(
      evidence.productionBaseline.recovery.isolatedDatabaseWalRestore,
      "isolatedDatabaseWalRestore",
    ) === "passed";
  if (databaseRestored !== (checks.database_wal_restore === "passed")) {
    fail("database restore baseline and check must agree");
  }
  const applicationRestored =
    recoveryStatus(
      evidence.productionBaseline.recovery.applicationAuthSigningEscrowRestore,
      "applicationAuthSigningEscrowRestore",
    ) === "passed";
  if (
    applicationRestored !==
    (checks.application_auth_secret_restore === "passed")
  ) {
    fail("application/Auth/signing restore baseline and check must agree");
  }

  const passed = Object.values(checks).filter(
    (status) => status === "passed",
  ).length;
  const pending = Object.values(checks).filter(
    (status) => status === "pending",
  ).length;
  const failed = Object.values(checks).filter(
    (status) => status === "failed",
  ).length;
  if (evidence.status === "complete") {
    if (!evidence.store.approved || !evidence.store.origin) {
      fail("complete evidence requires an approved store origin");
    }
    if (pending > 0 || failed > 0) {
      fail("complete evidence requires every check to pass");
    }
    validateCompleteBaseline(evidence.productionBaseline);
    if (
      m01.status !== "complete" ||
      !Number.isSafeInteger(m01.module_score) ||
      m01.module_score < 90
    ) {
      fail(
        "complete evidence requires a completed M01 task scoring at least 90",
      );
    }
  } else if (m01.status !== "in_progress") {
    fail("in-progress evidence must match an in-progress M01 task");
  }
  return { passed, pending, failed };
}

function validateStore(store) {
  exactKeys(store, ["approved", "origin", "selectionRule"], "store");
  if (typeof store.approved !== "boolean")
    fail("store.approved must be boolean");
  if (store.approved) {
    exactHttpsOrigin(store.origin, "store.origin");
  } else if (store.origin !== null) {
    fail("unapproved store must not retain an origin");
  }
  boundedText(store.selectionRule, "store.selectionRule", 20, 500);
}

function validateBaseline(baseline) {
  exactKeys(
    baseline,
    ["applicationVm", "supabaseVm", "publicSmokes", "aggregates", "recovery"],
    "productionBaseline",
  );
  exactKeys(
    baseline.applicationVm,
    [
      "vmId",
      "status",
      "containersRunning",
      "containersHealthy",
      "containersWithoutHealthcheck",
    ],
    "productionBaseline.applicationVm",
  );
  if (baseline.applicationVm.vmId !== 970) fail("application VM must be 970");
  runtimeStatus(baseline.applicationVm.status, "applicationVm.status");
  for (const key of [
    "containersRunning",
    "containersHealthy",
    "containersWithoutHealthcheck",
  ]) {
    count(baseline.applicationVm[key], `applicationVm.${key}`);
  }
  if (
    baseline.applicationVm.containersHealthy +
      baseline.applicationVm.containersWithoutHealthcheck !==
    baseline.applicationVm.containersRunning
  ) {
    fail("application container health accounting must reconcile");
  }

  exactKeys(
    baseline.supabaseVm,
    ["vmId", "status", "containersHealthy"],
    "productionBaseline.supabaseVm",
  );
  if (baseline.supabaseVm.vmId !== 971) fail("Supabase VM must be 971");
  runtimeStatus(baseline.supabaseVm.status, "supabaseVm.status");
  count(baseline.supabaseVm.containersHealthy, "supabaseVm.containersHealthy");

  exactKeys(
    baseline.publicSmokes,
    [
      "dashboardHealth",
      "login",
      "unsignedWooEvents",
      "authentikReady",
      "workforceSsoRedirect",
      "tlsVerified",
    ],
    "productionBaseline.publicSmokes",
  );
  for (const key of [
    "dashboardHealth",
    "login",
    "unsignedWooEvents",
    "authentikReady",
    "workforceSsoRedirect",
  ]) {
    httpStatus(baseline.publicSmokes[key], `publicSmokes.${key}`);
  }
  if (typeof baseline.publicSmokes.tlsVerified !== "boolean") {
    fail("publicSmokes.tlsVerified must be boolean");
  }

  exactKeys(
    baseline.aggregates,
    aggregateKeys,
    "productionBaseline.aggregates",
  );
  for (const [name, value] of Object.entries(baseline.aggregates)) {
    count(value, `aggregate ${name}`);
  }

  exactKeys(baseline.recovery, recoveryKeys, "productionBaseline.recovery");
  boundedText(
    baseline.recovery.archiveTimeout,
    "recovery.archiveTimeout",
    3,
    100,
  );
  for (const key of recoveryKeys.filter((key) => key !== "archiveTimeout")) {
    recoveryStatus(baseline.recovery[key], `recovery.${key}`);
  }
}

function validateCompleteBaseline(baseline) {
  if (
    baseline.applicationVm.status !== "running" ||
    baseline.applicationVm.containersRunning < 2 ||
    baseline.applicationVm.containersHealthy < 1 ||
    baseline.supabaseVm.status !== "running" ||
    baseline.supabaseVm.containersHealthy < 11 ||
    baseline.publicSmokes.dashboardHealth !== 200 ||
    baseline.publicSmokes.login !== 200 ||
    baseline.publicSmokes.unsignedWooEvents !== 401 ||
    baseline.publicSmokes.authentikReady !== 200 ||
    baseline.publicSmokes.workforceSsoRedirect !== 302 ||
    baseline.publicSmokes.tlsVerified !== true
  ) {
    fail("complete evidence requires the exact healthy public and VM baseline");
  }
  for (const key of recoveryKeys.filter((key) => key !== "archiveTimeout")) {
    if (
      recoveryStatus(baseline.recovery[key], `recovery.${key}`) !== "passed"
    ) {
      fail(`complete evidence requires passed recovery ${key}`);
    }
  }
}

function validateChecks(checkList) {
  if (!Array.isArray(checkList)) fail("checks must be an array");
  const checks = {};
  for (const check of checkList) {
    exactKeys(check, ["id", "status", "evidence"], "check");
    if (!requiredChecks.has(check.id)) fail(`unknown check ${check.id}`);
    if (Object.hasOwn(checks, check.id)) fail(`duplicate check ${check.id}`);
    if (!allowedStatuses.has(check.status)) {
      fail(`invalid status for ${check.id}`);
    }
    boundedText(check.evidence, `evidence for ${check.id}`, 3, 1_500);
    checks[check.id] = check.status;
  }
  for (const id of requiredChecks) {
    if (!Object.hasOwn(checks, id)) fail(`missing check ${id}`);
  }
  return checks;
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
    fail(`${label} has an invalid shape`);
  }
}

function boundedText(value, label, minimum, maximum) {
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    value.length < minimum ||
    value.length > maximum ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
  ) {
    fail(`${label} is invalid`);
  }
}

function count(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(`${label} must be a non-negative safe integer`);
  }
}

function httpStatus(value, label) {
  if (!Number.isInteger(value) || value < 100 || value > 599) {
    fail(`${label} must be an HTTP status`);
  }
}

function runtimeStatus(value, label) {
  if (!new Set(["running", "stopped", "degraded"]).has(value)) {
    fail(`${label} is invalid`);
  }
}

function recoveryStatus(value, label) {
  boundedText(value, label, 3, 500);
  const status = value.split(/\s+/u, 1)[0];
  if (!allowedStatuses.has(status)) fail(`${label} has an invalid status`);
  return status;
}

function timestamp(value, label) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value)
  ) {
    fail(`${label} must be a canonical UTC timestamp`);
  }
  const parsed = new Date(value);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().replace(".000Z", "Z") !== value
  ) {
    fail(`${label} must be a real canonical UTC timestamp`);
  }
  return parsed;
}

function exactHttpsOrigin(value, label) {
  if (typeof value !== "string" || value.length > 2_048) {
    fail(`${label} must be an HTTPS origin`);
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${label} must be an HTTPS origin`);
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
    fail(`${label} must be one canonical HTTPS origin`);
  }
}

function inspectStrings(value, path = "evidence", seen = new WeakSet()) {
  if (typeof value === "string") {
    if (obviousSensitiveValue.test(value)) {
      fail(`${path} contains an obvious sensitive or identity value`);
    }
    return;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) fail(`${path} contains a cyclic value`);
    seen.add(value);
    value.forEach((item, index) =>
      inspectStrings(item, `${path}[${index}]`, seen),
    );
    return;
  }
  if (value && typeof value === "object") {
    if (seen.has(value)) fail(`${path} contains a cyclic value`);
    seen.add(value);
    for (const [key, nested] of Object.entries(value)) {
      inspectStrings(nested, `${path}.${key}`, seen);
    }
  }
}

function clone(value) {
  return structuredClone(value);
}

function expectFailure(callback) {
  try {
    callback();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("Production pilot evidence invalid:")
    ) {
      return;
    }
    throw error;
  }
  throw new Error("Production pilot evidence self-test expected a failure.");
}

function runSelfTest(evidence, tasks) {
  const honestFailure = clone(evidence);
  honestFailure.checks.find((check) => check.id === "alert_coverage").status =
    "failed";
  const honestFailureSummary = validateProductionPilotEvidence(
    honestFailure,
    tasks,
    { now: new Date("2026-08-28T00:00:00Z") },
  );
  if (honestFailureSummary.failed !== 1) {
    throw new Error("Production pilot evidence self-test hid a failed check.");
  }
  const mutations = [
    (candidate) => {
      candidate.extra = true;
    },
    (candidate) => {
      candidate.release = "latest";
    },
    (candidate) => {
      candidate.observedAt = "2999-01-01T00:00:00Z";
    },
    (candidate) => {
      candidate.store.origin = "https://store.invalid";
    },
    (candidate) => {
      candidate.productionBaseline.applicationVm.containersHealthy = 2;
    },
    (candidate) => {
      candidate.productionBaseline.aggregates.customers = -1;
    },
    (candidate) => {
      candidate.checks[0].status = "passed";
    },
    (candidate) => {
      candidate.checks[0].evidence = "Bearer secret-secret-secret";
    },
    (candidate) => {
      candidate.checks.push(clone(candidate.checks[0]));
    },
    (candidate) => {
      candidate.productionBaseline.recovery.applicationAuthSigningEscrowRestore =
        "passed";
    },
    (candidate) => {
      candidate.status = "complete";
    },
  ];
  for (const mutate of mutations) {
    const candidate = clone(evidence);
    mutate(candidate);
    expectFailure(() =>
      validateProductionPilotEvidence(candidate, tasks, {
        now: new Date("2026-08-28T00:00:00Z"),
      }),
    );
  }
}

const evidenceSource = readFileSync(evidencePath, "utf8");
if (Buffer.byteLength(evidenceSource, "utf8") > 128 * 1_024) {
  fail("pilot.yaml exceeds the 128 KiB evidence limit");
}
const evidence = YAML.parse(evidenceSource);
const tasks = YAML.parse(readFileSync(tasksPath, "utf8"));
const summary = validateProductionPilotEvidence(evidence, tasks);
runSelfTest(evidence, tasks);

console.log(
  `Validated ${requiredChecks.size} production-pilot checks with exact baseline and adversarial fixtures; ${summary.passed} passed, ${summary.pending} pending, and ${summary.failed} failed.`,
);
