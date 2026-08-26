import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const evidencePath = join(root, "docs/plan/evidence/M13/canary.yaml");
const tasksPath = join(root, "docs/plan/TASKS.yaml");

const evidence = YAML.parse(readFileSync(evidencePath, "utf8"));
const tasks = YAML.parse(readFileSync(tasksPath, "utf8"));

const requiredChecks = new Set([
  "exact_head_ci",
  "migration_replay",
  "contract_protocol_matrix",
  "database_authority_matrix",
  "concurrency_matrix",
  "woocommerce_runtime_matrix",
  "browser_accessibility",
  "checkout_independence_matrix",
  "operations_documentation",
  "public_production_baseline",
  "authentik_public_baseline",
  "operator_access",
  "approved_release",
  "approved_enterprise_identity_fixture",
  "canary_approval",
  "pre_change_recovery_point",
  "production_source_baseline",
  "administration_secret_mounts",
  "authentik_egress_policy",
  "dns_rebinding_denial",
  "disabled_deployment",
  "migration_registration",
  "identity_entitlement_canary",
  "local_owner_recovery",
  "oidc_tenant_canary",
  "saml_tenant_canary",
  "scim_discovery_contract",
  "scim_provisioning_canary",
  "group_role_allowlist",
  "mapped_unmapped_login",
  "immediate_deprovisioning",
  "stale_session_denial",
  "endpoint_rotation_revocation",
  "forged_claim_denial",
  "cross_tenant_denial",
  "provider_outage_recovery",
  "agency_bilateral_canary",
  "agency_revocation",
  "support_approval_separation",
  "support_scope_use_audit",
  "support_revocation_stale_session",
  "aal2_break_glass",
  "administration_export_reconciliation",
  "offboarding_credential_inventory",
  "deletion_cooling_cancel",
  "deletion_pseudonymization",
  "production_outage_continuity",
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
  throw new Error(`Enterprise identity canary evidence invalid: ${message}`);
};

const validateDocument = (candidateEvidence, candidateTasks = tasks) => {
  if (candidateEvidence.schema !== "starfiniti.enterprise-identity-canary.v1") {
    fail("unexpected schema");
  }
  if (!new Set(["in_progress", "complete"]).has(candidateEvidence.status)) {
    fail("status must be in_progress or complete");
  }
  if (
    typeof candidateEvidence.observedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(
      candidateEvidence.observedAt,
    ) ||
    Number.isNaN(Date.parse(candidateEvidence.observedAt))
  ) {
    fail("observedAt must be an exact UTC timestamp");
  }
  if (
    typeof candidateEvidence.currentProduction?.release !== "string" ||
    !/^v\d+\.\d+\.\d+$/.test(candidateEvidence.currentProduction.release) ||
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
  if (
    !Number.isSafeInteger(candidateEvidence.candidate.pullRequest) ||
    candidateEvidence.candidate.pullRequest < 1
  ) {
    fail("candidate pull request must be a positive integer");
  }
  for (const approval of [
    "approvedRelease",
    "operatorAccess",
    "enterpriseIdentityApproved",
    "canaryApproved",
  ]) {
    if (typeof candidateEvidence.candidate[approval] !== "boolean") {
      fail(`candidate ${approval} must be boolean`);
    }
  }
  if (!Array.isArray(candidateEvidence.checks)) {
    fail("checks must be an array");
  }

  const checkIds = new Set();
  for (const check of candidateEvidence.checks) {
    if (!requiredChecks.has(check.id)) fail(`unknown check ${check.id}`);
    if (checkIds.has(check.id)) fail(`duplicate check ${check.id}`);
    if (!allowedStatuses.has(check.status)) {
      fail(`invalid status for ${check.id}`);
    }
    if (
      typeof check.evidence !== "string" ||
      check.evidence.length < 12 ||
      check.evidence !== check.evidence.trim()
    ) {
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
      category.evidence.length < 12 ||
      category.evidence !== category.evidence.trim()
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
    authentikLive: 200,
    authentikReady: 200,
  })) {
    if (candidateEvidence.publicBaseline?.[name] !== expected) {
      fail(`unexpected public baseline ${name}`);
    }
  }
  if (candidateEvidence.publicBaseline.canonicalDns !== true) {
    fail("canonical DNS must be verified");
  }

  const forbiddenKey =
    /(password|passphrase|secret|private.?key|access.?token|refresh.?token|bearer|credential.?value|capability.?value|scim.?token|saml.?assertion|raw.?body|email|auth.?uuid|external.?id|subject|customer.?id|order.?id|tenant.?id|wallet.?id|connection.?id)/i;
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
    candidateEvidence.automaticFails.length < 12 ||
    candidateEvidence.automaticFails.some(
      (rule) =>
        typeof rule !== "string" || rule.length < 20 || rule !== rule.trim(),
    ) ||
    new Set(candidateEvidence.automaticFails).size !==
      candidateEvidence.automaticFails.length
  ) {
    fail("automatic failures must contain at least twelve unique rules");
  }

  const m13 = candidateTasks.tasks.find(
    (task) => task.id === "M13-ENTERPRISE-IDENTITY",
  );
  const requiredCompletedSlices = new Set([
    "M13-S01-ACCESS-CATALOGUE-AND-REVIEW",
    "M13-S02-ORGANIZATION-AND-TEAM-LIFECYCLE",
    "M13-S03-TENANT-FEDERATION",
    "M13-S04-SCIM-PROVISIONING",
    "M13-S05-SUPPORT-AGENCY-AND-OFFBOARDING",
  ]);
  const s06 = m13?.slices?.find(
    (slice) => slice.id === "M13-S06-CANARY-AND-CLOSE",
  );
  if (!m13 || !s06) fail("M13 or M13-S06 task is missing");
  for (const id of requiredCompletedSlices) {
    const slice = m13.slices.find((candidate) => candidate.id === id);
    if (slice?.status !== "complete") {
      fail(`${id} must be complete before canary`);
    }
  }
  if (m13.module_score !== calculatedScore) {
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
      !candidateEvidence.candidate.enterpriseIdentityApproved ||
      !candidateEvidence.candidate.canaryApproved
    ) {
      fail(
        "complete evidence requires release, operator, enterprise identity, and canary approval",
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
    if (m13.status !== "complete" || s06.status !== "complete") {
      fail("complete evidence requires completed M13 and S06 task state");
    }
  } else if (m13.status !== "in_progress" || s06.status !== "in_progress") {
    fail("in-progress evidence must match in-progress M13 and S06 task state");
  }

  return { calculatedScore, incomplete, belowFloor };
};

const result = validateDocument(evidence);

if (process.argv.includes("--self-test")) {
  const expectRejected = (
    candidateEvidence,
    messagePart,
    label,
    candidateTasks = tasks,
  ) => {
    try {
      validateDocument(candidateEvidence, candidateTasks);
    } catch (error) {
      if (error instanceof Error && error.message.includes(messagePart)) return;
      throw error;
    }
    fail(`self-test accepted ${label}`);
  };

  const falseCompletion = structuredClone(evidence);
  falseCompletion.status = "complete";
  expectRejected(
    falseCompletion,
    "complete evidence requires",
    "incomplete evidence as complete",
  );

  const sensitiveEvidence = structuredClone(evidence);
  sensitiveEvidence.operatorSecretValue = "must never be accepted";
  expectRejected(
    sensitiveEvidence,
    "forbidden sensitive key",
    "a sensitive evidence key",
  );

  const missingCheck = structuredClone(evidence);
  missingCheck.checks = missingCheck.checks.slice(1);
  expectRejected(missingCheck, "missing check", "a missing mandatory check");

  const scoreDrift = structuredClone(evidence);
  scoreDrift.score.total += 1;
  expectRejected(scoreDrift, "score total", "score arithmetic drift");

  const nonExactCommit = structuredClone(evidence);
  nonExactCommit.candidate.commit = nonExactCommit.candidate.commit.slice(
    0,
    12,
  );
  expectRejected(nonExactCommit, "full lowercase Git SHA", "a short commit");

  const shortAutomaticFailure = structuredClone(evidence);
  shortAutomaticFailure.automaticFails[0] = "too short";
  expectRejected(
    shortAutomaticFailure,
    "at least twelve unique rules",
    "a hollow automatic failure rule",
  );

  const baselineDrift = structuredClone(evidence);
  baselineDrift.publicBaseline.authWithoutKey = 200;
  expectRejected(
    baselineDrift,
    "unexpected public baseline",
    "an unsafe public baseline",
  );

  const incompleteSliceTasks = structuredClone(tasks);
  incompleteSliceTasks.tasks
    .find((task) => task.id === "M13-ENTERPRISE-IDENTITY")
    .slices.find(
      (slice) => slice.id === "M13-S05-SUPPORT-AGENCY-AND-OFFBOARDING",
    ).status = "in_progress";
  expectRejected(
    evidence,
    "must be complete before canary",
    "an incomplete prerequisite slice",
    incompleteSliceTasks,
  );

  const belowFloorCompletion = structuredClone(evidence);
  belowFloorCompletion.status = "complete";
  belowFloorCompletion.candidate.approvedRelease = true;
  belowFloorCompletion.candidate.enterpriseIdentityApproved = true;
  belowFloorCompletion.candidate.canaryApproved = true;
  belowFloorCompletion.checks.forEach((check) => {
    check.status = "passed";
  });
  expectRejected(
    belowFloorCompletion,
    "score and category floors",
    "completion below a category floor",
  );
}

console.log(
  `Validated ${evidence.checks.length} M13 canary checks and ${evidence.score.categories.length} score categories; score ${result.calculatedScore}/100 with ${evidence.checks.filter((check) => check.status === "passed").length} passed, ${evidence.checks.filter((check) => check.status === "pending").length} pending, and ${evidence.checks.filter((check) => check.status === "failed").length} failed.`,
);
