import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const evidencePath = join(root, "docs/plan/evidence/M12/canary.yaml");
const tasksPath = join(root, "docs/plan/TASKS.yaml");

const evidence = YAML.parse(readFileSync(evidencePath, "utf8"));
const tasks = YAML.parse(readFileSync(tasksPath, "utf8"));

const requiredChecks = new Set([
  "exact_head_ci",
  "migration_replay",
  "contract_adapter_matrix",
  "database_authority_matrix",
  "concurrency_matrix",
  "woocommerce_runtime_matrix",
  "browser_accessibility",
  "privacy_retention_matrix",
  "checkout_independence_matrix",
  "public_production_baseline",
  "operator_access",
  "approved_release",
  "pre_change_recovery_point",
  "production_source_baseline",
  "disabled_deployment",
  "migration_registration",
  "migration_entitlement_canary",
  "approved_redacted_source",
  "adapter_fingerprint_rerun",
  "dry_run_zero_value",
  "mapping_approval_binding",
  "small_batch_application",
  "application_rerun",
  "customer_count_reconciliation",
  "balance_reconciliation",
  "expiry_reconciliation",
  "liability_reconciliation",
  "traceability_reconciliation",
  "pending_release_reconciliation",
  "correction_compensation",
  "outage_recovery",
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
  throw new Error(`Migration canary evidence invalid: ${message}`);
};

const validateDocument = (candidateEvidence) => {
  if (candidateEvidence.schema !== "starfiniti.migration-canary.v1") {
    fail("unexpected schema");
  }
  if (!new Set(["in_progress", "complete"]).has(candidateEvidence.status)) {
    fail("status must be in_progress or complete");
  }
  if (
    typeof candidateEvidence.observedAt !== "string" ||
    Number.isNaN(Date.parse(candidateEvidence.observedAt))
  ) {
    fail("observedAt must be an ISO timestamp");
  }
  if (
    typeof candidateEvidence.currentProduction?.release !== "string" ||
    candidateEvidence.currentProduction.release.length < 2 ||
    typeof candidateEvidence.currentProduction?.applicationCommit !==
      "string" ||
    !/^[0-9a-f]{40}$/.test(
      candidateEvidence.currentProduction.applicationCommit,
    )
  ) {
    fail("current production release and commit must be exact");
  }
  if (
    typeof candidateEvidence.candidate?.commit !== "string" ||
    !/^[0-9a-f]{40}$/.test(candidateEvidence.candidate.commit)
  ) {
    fail("candidate commit must be a full lowercase Git SHA");
  }
  if (!Number.isSafeInteger(candidateEvidence.candidate.pullRequest)) {
    fail("candidate pull request must be an integer");
  }
  for (const field of [
    "approvedRelease",
    "operatorAccess",
    "sourceApproved",
    "canaryApproved",
  ]) {
    if (typeof candidateEvidence.candidate[field] !== "boolean") {
      fail(`candidate ${field} must be boolean`);
    }
  }
  if (!Array.isArray(candidateEvidence.checks)) fail("checks must be an array");

  const checkIds = new Set();
  for (const check of candidateEvidence.checks) {
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
    candidateEvidence.score?.target !== 90 ||
    candidateEvidence.score.minimumCategoryRatio !== 0.8
  ) {
    fail("score target and minimum category ratio must remain 90 and 0.8");
  }
  if (!Array.isArray(candidateEvidence.score.categories)) {
    fail("score categories must be an array");
  }

  let calculatedScore = 0;
  let calculatedWeight = 0;
  const categoryIds = new Set();
  for (const category of candidateEvidence.score.categories) {
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
    if (
      typeof category.evidence !== "string" ||
      category.evidence.length < 12
    ) {
      fail(`missing score evidence for ${category.id}`);
    }
    categoryIds.add(category.id);
    calculatedScore += category.score;
    calculatedWeight += category.weight;
  }
  for (const id of categoryWeights.keys()) {
    if (!categoryIds.has(id)) fail(`missing score category ${id}`);
  }
  if (
    calculatedWeight !== 100 ||
    candidateEvidence.score.total !== calculatedScore
  ) {
    fail("score total does not match category arithmetic");
  }

  for (const [name, expected] of Object.entries({
    dashboardHealth: 200,
    login: 200,
    authWithoutKey: 401,
    restWithoutKey: 401,
  })) {
    if (candidateEvidence.publicBaseline?.[name] !== expected) {
      fail(`unexpected public baseline ${name}`);
    }
  }
  if (candidateEvidence.publicBaseline.canonicalDns !== true) {
    fail("canonical DNS must be verified");
  }

  const forbiddenKey =
    /(password|passphrase|secret|private.?key|access.?token|refresh.?token|coupon.?code|email|customer.?id|order.?id|tenant.?id|wallet.?id|connection.?id|source.?row|source.?identity|raw.?source)/i;
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
  inspectKeys(candidateEvidence);

  if (
    !Array.isArray(candidateEvidence.automaticFails) ||
    candidateEvidence.automaticFails.length < 9 ||
    new Set(candidateEvidence.automaticFails).size !==
      candidateEvidence.automaticFails.length
  ) {
    fail("automatic failures must contain at least nine unique rules");
  }

  const m12 = tasks.tasks.find((task) => task.id === "M12-MIGRATION");
  const requiredCompletedSlices = new Set([
    "M12-S01-CANONICAL-IMPORT-AND-DRY-RUN",
    "M12-S02-OPENING-BALANCE-LEDGER-APPLICATION",
    "M12-S03-STABLE-SOURCE-ADAPTERS",
    "M12-S04-YITH-AND-FORMAT-CHANGE-GATES",
    "M12-S05-MERCHANT-WORKFLOW-AND-RECONCILIATION",
  ]);
  const s06 = m12?.slices?.find(
    (slice) => slice.id === "M12-S06-CANARY-AND-CLOSE",
  );
  if (!m12 || !s06) fail("M12 or M12-S06 task is missing");
  for (const id of requiredCompletedSlices) {
    const slice = m12.slices.find((candidate) => candidate.id === id);
    if (slice?.status !== "complete") {
      fail(`${id} must be complete before canary`);
    }
  }
  if (m12.module_score !== calculatedScore) {
    fail("TASKS.yaml module score must match canary evidence");
  }

  const incomplete = candidateEvidence.checks.filter(
    (check) => check.status !== "passed",
  );
  const belowFloor = candidateEvidence.score.categories.filter(
    (category) =>
      category.score / category.weight <
      candidateEvidence.score.minimumCategoryRatio,
  );
  if (candidateEvidence.status === "complete") {
    if (
      !candidateEvidence.candidate.approvedRelease ||
      !candidateEvidence.candidate.operatorAccess ||
      !candidateEvidence.candidate.sourceApproved ||
      !candidateEvidence.candidate.canaryApproved
    ) {
      fail(
        "complete evidence requires an approved release, operator access, source approval, and canary approval",
      );
    }
    if (incomplete.length > 0) {
      fail(
        `complete evidence has non-passing checks: ${incomplete.map((check) => check.id).join(", ")}`,
      );
    }
    if (calculatedScore < candidateEvidence.score.target || belowFloor.length) {
      fail("complete evidence does not meet score and category floors");
    }
    if (m12.status !== "complete" || s06.status !== "complete") {
      fail("complete evidence requires completed M12 and S06 task state");
    }
  } else if (m12.status !== "in_progress" || s06.status !== "in_progress") {
    fail("in-progress evidence must match in-progress M12 and S06 task state");
  }

  return { calculatedScore, incomplete, belowFloor };
};

const result = validateDocument(evidence);

if (process.argv.includes("--self-test")) {
  const falseCompletion = structuredClone(evidence);
  falseCompletion.status = "complete";
  let completionRejected = false;
  try {
    validateDocument(falseCompletion);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("Migration canary evidence invalid:")
    ) {
      completionRejected = true;
    } else {
      throw error;
    }
  }
  if (!completionRejected)
    fail("self-test accepted incomplete evidence as complete");

  const sensitiveEvidence = structuredClone(evidence);
  sensitiveEvidence.rawSourceIdentity = "must never be accepted";
  let sensitiveKeyRejected = false;
  try {
    validateDocument(sensitiveEvidence);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("forbidden sensitive key")
    ) {
      sensitiveKeyRejected = true;
    } else {
      throw error;
    }
  }
  if (!sensitiveKeyRejected)
    fail("self-test accepted a sensitive evidence key");
}

console.log(
  `Validated ${evidence.checks.length} M12 canary checks and ${evidence.score.categories.length} score categories; score ${result.calculatedScore}/100 with ${evidence.checks.filter((check) => check.status === "passed").length} passed, ${evidence.checks.filter((check) => check.status === "pending").length} pending, and ${evidence.checks.filter((check) => check.status === "failed").length} failed.`,
);
