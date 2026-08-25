import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const evidencePath = join(root, "docs/plan/evidence/M10/canary.yaml");
const tasksPath = join(root, "docs/plan/TASKS.yaml");

const evidence = YAML.parse(readFileSync(evidencePath, "utf8"));
const tasks = YAML.parse(readFileSync(tasksPath, "utf8"));

const requiredChecks = new Set([
  "exact_head_ci",
  "migration_replay",
  "contract_and_parser_matrix",
  "database_authority_matrix",
  "concurrency_matrix",
  "woocommerce_runtime_matrix",
  "browser_accessibility",
  "shared_snapshot_boundary",
  "legacy_overview_shadow",
  "public_production_baseline",
  "approved_release",
  "operator_access",
  "pre_change_recovery_point",
  "production_source_baseline",
  "disabled_deployment",
  "migration_registration",
  "analytics_entitlement_canary",
  "value_truth_reconciliation",
  "commerce_reconciliation",
  "programme_outcome_reconciliation",
  "cohort_reconciliation",
  "manual_export_canary",
  "download_privacy_and_replay",
  "schedule_materialization",
  "reporting_worker_isolation",
  "interactive_latency",
  "rollback_rehearsal",
  "observation_window",
  "final_reconciliation",
]);
const categoryWeights = new Map([
  ["correctness", 20],
  ["security", 15],
  ["ledger_reliability", 15],
  ["tests", 15],
  ["performance", 10],
  ["operability", 10],
  ["maintainability", 15],
]);
const allowedStatuses = new Set(["passed", "pending", "failed"]);
const fail = (message) => {
  throw new Error(`Analytics canary evidence invalid: ${message}`);
};

if (evidence.schema !== "starfiniti.analytics-canary.v1") {
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
if (
  typeof evidence.candidate?.commit !== "string" ||
  !/^[0-9a-f]{40}$/.test(evidence.candidate.commit)
) {
  fail("candidate commit must be a full lowercase Git SHA");
}
if (!Number.isSafeInteger(evidence.candidate.pullRequest)) {
  fail("candidate pull request must be an integer");
}
if (!Array.isArray(evidence.checks)) fail("checks must be an array");

const checkIds = new Set();
for (const check of evidence.checks) {
  if (!requiredChecks.has(check.id)) fail(`unknown check ${check.id}`);
  if (checkIds.has(check.id)) fail(`duplicate check ${check.id}`);
  if (!allowedStatuses.has(check.status)) {
    fail(`invalid status for ${check.id}`);
  }
  if (typeof check.evidence !== "string" || check.evidence.length < 12) {
    fail(`missing minimized evidence for ${check.id}`);
  }
  checkIds.add(check.id);
}
for (const id of requiredChecks) {
  if (!checkIds.has(id)) fail(`missing check ${id}`);
}

if (
  evidence.score?.target !== 90 ||
  evidence.score.minimumCategoryRatio !== 0.8
) {
  fail("score target and minimum category ratio must remain 90 and 0.8");
}
if (!Array.isArray(evidence.score.categories)) {
  fail("score categories must be an array");
}

let calculatedScore = 0;
let calculatedWeight = 0;
const categoryIds = new Set();
for (const category of evidence.score.categories) {
  const expectedWeight = categoryWeights.get(category.id);
  if (expectedWeight === undefined) {
    fail(`unknown score category ${category.id}`);
  }
  if (categoryIds.has(category.id)) {
    fail(`duplicate score category ${category.id}`);
  }
  if (category.weight !== expectedWeight) {
    fail(`unexpected weight for ${category.id}`);
  }
  if (
    !Number.isSafeInteger(category.score) ||
    category.score < 0 ||
    category.score > category.weight
  ) {
    fail(`invalid score for ${category.id}`);
  }
  if (typeof category.evidence !== "string" || category.evidence.length < 12) {
    fail(`missing score evidence for ${category.id}`);
  }
  categoryIds.add(category.id);
  calculatedScore += category.score;
  calculatedWeight += category.weight;
}
for (const id of categoryWeights.keys()) {
  if (!categoryIds.has(id)) fail(`missing score category ${id}`);
}
if (calculatedWeight !== 100 || evidence.score.total !== calculatedScore) {
  fail("score total does not match category arithmetic");
}

for (const [name, expected] of Object.entries({
  dashboardHealth: 200,
  login: 200,
  authWithoutKey: 401,
  restWithoutKey: 401,
})) {
  if (evidence.publicBaseline?.[name] !== expected) {
    fail(`unexpected public baseline ${name}`);
  }
}
if (evidence.publicBaseline.canonicalDns !== true) {
  fail("canonical DNS must be verified");
}

const forbiddenKey =
  /(password|passphrase|secret|private.?key|access.?token|refresh.?token|coupon.?code|email|customer.?id|order.?id|tenant.?id|wallet.?id|connection.?id)/i;
const inspectKeys = (value, path = "evidence") => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectKeys(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (forbiddenKey.test(key))
        fail(`forbidden sensitive key ${path}.${key}`);
      inspectKeys(nested, `${path}.${key}`);
    }
  }
};
inspectKeys(evidence);

if (
  !Array.isArray(evidence.automaticFails) ||
  evidence.automaticFails.length < 7 ||
  new Set(evidence.automaticFails).size !== evidence.automaticFails.length
) {
  fail("automatic failures must contain at least seven unique rules");
}

const m10 = tasks.tasks.find((task) => task.id === "M10-ANALYTICS");
const s05 = m10?.slices?.find(
  (slice) => slice.id === "M10-S05-ANALYTICS-COMMAND-CENTER",
);
const s06 = m10?.slices?.find(
  (slice) => slice.id === "M10-S06-SHADOW-CANARY-AND-CLOSE",
);
if (!m10 || !s05 || !s06) fail("M10, M10-S05, or M10-S06 task is missing");
if (s05.status !== "complete") fail("M10-S05 must be complete before canary");
if (m10.module_score !== calculatedScore) {
  fail("TASKS.yaml module score must match canary evidence");
}

const enforceCompletionBoundary = (candidateEvidence) => {
  const incomplete = candidateEvidence.checks.filter(
    (check) => check.status !== "passed",
  );
  const belowFloor = candidateEvidence.score.categories.filter(
    (category) =>
      category.score / category.weight <
      candidateEvidence.score.minimumCategoryRatio,
  );
  if (
    !candidateEvidence.candidate.approvedRelease ||
    !candidateEvidence.candidate.operatorAccess
  ) {
    fail("complete evidence requires an approved release and operator access");
  }
  if (incomplete.length > 0) {
    fail(
      `complete evidence has non-passing checks: ${incomplete.map((check) => check.id).join(", ")}`,
    );
  }
  if (calculatedScore < candidateEvidence.score.target || belowFloor.length) {
    fail("complete evidence does not meet score and category floors");
  }
  if (m10.status !== "complete" || s06.status !== "complete") {
    fail("complete evidence requires completed M10 and S06 task state");
  }
};

if (evidence.status === "complete") {
  enforceCompletionBoundary(evidence);
} else if (m10.status !== "in_progress" || s06.status !== "in_progress") {
  fail("in-progress evidence must match in-progress M10 and S06 task state");
}

if (process.argv.includes("--self-test")) {
  const falseCompletion = structuredClone(evidence);
  falseCompletion.status = "complete";
  let rejected = false;
  try {
    enforceCompletionBoundary(falseCompletion);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("Analytics canary evidence invalid:")
    ) {
      rejected = true;
    } else {
      throw error;
    }
  }
  if (!rejected) fail("self-test accepted incomplete evidence as complete");
}

console.log(
  `Validated ${evidence.checks.length} M10 canary checks and ${evidence.score.categories.length} score categories; score ${calculatedScore}/100 with ${evidence.checks.filter((check) => check.status === "passed").length} passed, ${evidence.checks.filter((check) => check.status === "pending").length} pending, and ${evidence.checks.filter((check) => check.status === "failed").length} failed.`,
);
