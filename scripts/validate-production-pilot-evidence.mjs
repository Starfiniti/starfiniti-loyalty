import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const evidencePath = join(root, "docs/plan/evidence/M01/pilot.yaml");
const tasksPath = join(root, "docs/plan/TASKS.yaml");

const evidence = YAML.parse(readFileSync(evidencePath, "utf8"));
const tasks = YAML.parse(readFileSync(tasksPath, "utf8"));

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
const fail = (message) => {
  throw new Error(`Production pilot evidence invalid: ${message}`);
};

if (evidence.schema !== "starfiniti.production-pilot.v1") {
  fail("unexpected schema");
}
if (!new Set(["in_progress", "complete"]).has(evidence.status)) {
  fail("status must be in_progress or complete");
}
if (
  typeof evidence.observedAt !== "string" ||
  Number.isNaN(Date.parse(evidence.observedAt))
) {
  fail("observedAt must be an ISO timestamp");
}
if (!Array.isArray(evidence.checks)) {
  fail("checks must be an array");
}

const checkIds = new Set();
for (const check of evidence.checks) {
  if (!requiredChecks.has(check.id)) {
    fail(`unknown check ${check.id}`);
  }
  if (checkIds.has(check.id)) {
    fail(`duplicate check ${check.id}`);
  }
  if (!allowedStatuses.has(check.status)) {
    fail(`invalid status for ${check.id}`);
  }
  if (typeof check.evidence !== "string" || check.evidence.length < 3) {
    fail(`missing minimized evidence for ${check.id}`);
  }
  checkIds.add(check.id);
}
for (const id of requiredChecks) {
  if (!checkIds.has(id)) {
    fail(`missing check ${id}`);
  }
}

for (const [name, value] of Object.entries(
  evidence.productionBaseline.aggregates,
)) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(`aggregate ${name} must be a non-negative safe integer`);
  }
}

const forbiddenKey =
  /(password|passphrase|secret|private.?key|access.?token|refresh.?token|coupon.?code|email|source.?order.?id)/i;
const inspectKeys = (value, path = "evidence") => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectKeys(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (forbiddenKey.test(key)) {
        fail(`forbidden sensitive key ${path}.${key}`);
      }
      inspectKeys(nested, `${path}.${key}`);
    }
  }
};
inspectKeys(evidence);

const m01 = tasks.tasks.find((task) => task.id === "M01-PRODUCTION-PILOT");
if (!m01) {
  fail("M01 task is missing");
}
if (evidence.status === "complete") {
  const incomplete = evidence.checks.filter(
    (check) => check.status !== "passed",
  );
  if (!evidence.store.approved || !evidence.store.origin) {
    fail("complete evidence requires an approved store origin");
  }
  if (incomplete.length > 0) {
    fail(
      `complete evidence has non-passing checks: ${incomplete.map((check) => check.id).join(", ")}`,
    );
  }
  if (m01.status !== "complete" || m01.module_score < 90) {
    fail("complete evidence requires a completed M01 task scoring at least 90");
  }
} else if (m01.status !== "in_progress") {
  fail("in-progress evidence must match an in-progress M01 task");
}

console.log(
  `Validated ${evidence.checks.length} production-pilot checks; ${evidence.checks.filter((check) => check.status === "passed").length} passed and ${evidence.checks.filter((check) => check.status === "pending").length} pending.`,
);
