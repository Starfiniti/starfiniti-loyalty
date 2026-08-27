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
const evidencePath = join(root, "docs/plan/evidence/M07/canary.yaml");
const tasksPath = join(root, "docs/plan/TASKS.yaml");

const evidence = YAML.parse(readFileSync(evidencePath, "utf8"));
const tasks = YAML.parse(readFileSync(tasksPath, "utf8"));

const requiredChecks = new Set([
  "exact_head_ci",
  "contract_campaign_matrix",
  "database_authority_matrix",
  "audience_snapshot_concurrency",
  "capacity_concurrency",
  "execution_refund_matrix",
  "lifecycle_selector_matrix",
  "browser_accessibility",
  "privacy_minimization",
  "checkout_independence",
  "rollback_compatibility_repository",
  "operations_documentation",
  "public_production_baseline",
  "operator_access",
  "approved_release",
  "approved_pilot_store",
  "canary_approval",
  "pre_change_recovery_point",
  "production_value_baseline",
  "disabled_deployment",
  "migration_registration",
  "non_canary_disabled",
  "audience_snapshot_canary",
  "preview_liability_canary",
  "approval_control_canary",
  "schedule_dst_canary",
  "lifecycle_canary",
  "bonus_points_canary",
  "multiplier_canary",
  "milestone_canary",
  "winback_canary",
  "tier_campaign_canary",
  "referral_campaign_canary",
  "limited_quantity_canary",
  "native_fixed_discount_canary",
  "last_capacity_canary",
  "member_cap_canary",
  "control_group_canary",
  "partial_full_refund_canary",
  "audience_source_change_canary",
  "deterministic_failure_canary",
  "transient_retry_canary",
  "programme_selector_compatibility",
  "cross_tenant_denial",
  "capacity_reconciliation",
  "ledger_reconciliation",
  "native_reward_reconciliation",
  "queue_result_reconciliation",
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
const requiredArtifacts = new Set([
  "read_only_baseline",
  "release_inventory",
  "approval_record",
  "recovery_point",
  "production_baseline",
  "canary_journal",
  "reconciliation_report",
  "rollback_report",
  "observation_report",
]);
const requiredAutomaticFails = new Map([
  [
    "arbitrary_audience_sql",
    "an audience accepts arbitrary SQL browser tags unsupported facts unbounded candidates or customer-selected authority",
  ],
  [
    "mixed_audience_snapshot",
    "one immutable audience snapshot mixes separately committed source states or changes historical membership after publication",
  ],
  [
    "dst_schedule_drift",
    "campaign schedule or lifecycle changes because an invalid ambiguous or execution-time timezone instant is accepted",
  ],
  [
    "budget_oversubscription",
    "global quantity points budget monetary liability or per-member capacity oversubscribes or partially allocates",
  ],
  [
    "multiplier_stack_violation",
    "more than the highest-priority eligible multiplier applies or a fixed bonus stacks without explicit published permission",
  ],
  [
    "duplicate_campaign_effect",
    "duplicate replay delayed delivery or concurrent processing creates another assignment capacity value native reward or reversal effect",
  ],
  [
    "refund_compensation_gap",
    "a partial or full refund leaves any campaign ledger origin spendable or rewrites gross capacity or accepted history",
  ],
  [
    "liability_understatement",
    "merchant-declared or stale monetary liability differs from the exact published fixed-discount face value currency or precision",
  ],
  [
    "trigger_time_expiry_drift",
    "worker delay changes campaign point availability expiry qualification or historical programme evidence from the canonical trigger instant",
  ],
  [
    "deterministic_retry_storm",
    "a deterministic contract authority selector or native-capability failure enters transient audience-wide retries instead of manual review",
  ],
  [
    "selector_authority_drift",
    "a campaign uses unknown disabled cross-programme or later-incompatible rule tier reward or connector selectors",
  ],
  [
    "cross_tenant_exposure",
    "an unrelated tenant programme audience campaign assignment capacity job ledger native reward or evidence becomes visible or mutable",
  ],
  [
    "checkout_dependency",
    "WooCommerce checkout synchronously depends on the Hub worker entitlement audience campaign or native reward outcome",
  ],
  [
    "accepted_work_stranded",
    "pausing disabling cancelling or rolling back campaigns hides or strands accepted assignments capacity value native work or required reversals",
  ],
  [
    "sensitive_evidence",
    "reusable signing material coupon plaintext raw payload personal data assignments salts source references or private ledger metadata enters logs support output or evidence",
  ],
  [
    "unexplained_or_unapproved_close",
    "any audience capacity campaign value refund native reward queue result tenancy or privacy difference approval artifact score floor or critical finding remains unresolved",
  ],
]);
const checkArtifactBindings = new Map([
  ["public_production_baseline", ["read_only_baseline"]],
  ["operator_access", ["read_only_baseline"]],
  ["approved_release", ["approval_record"]],
  ["approved_pilot_store", ["approval_record"]],
  ["canary_approval", ["approval_record"]],
  ["pre_change_recovery_point", ["recovery_point"]],
  ["production_value_baseline", ["production_baseline"]],
  ["disabled_deployment", ["release_inventory", "canary_journal"]],
  ["migration_registration", ["release_inventory", "canary_journal"]],
  ["non_canary_disabled", ["canary_journal"]],
  ["audience_snapshot_canary", ["canary_journal"]],
  ["preview_liability_canary", ["canary_journal"]],
  ["approval_control_canary", ["canary_journal"]],
  ["schedule_dst_canary", ["canary_journal"]],
  ["lifecycle_canary", ["canary_journal"]],
  ["bonus_points_canary", ["canary_journal"]],
  ["multiplier_canary", ["canary_journal"]],
  ["milestone_canary", ["canary_journal"]],
  ["winback_canary", ["canary_journal"]],
  ["tier_campaign_canary", ["canary_journal"]],
  ["referral_campaign_canary", ["canary_journal"]],
  ["limited_quantity_canary", ["canary_journal"]],
  ["native_fixed_discount_canary", ["canary_journal"]],
  ["last_capacity_canary", ["canary_journal"]],
  ["member_cap_canary", ["canary_journal"]],
  ["control_group_canary", ["canary_journal"]],
  ["partial_full_refund_canary", ["canary_journal"]],
  ["audience_source_change_canary", ["canary_journal"]],
  ["deterministic_failure_canary", ["canary_journal"]],
  ["transient_retry_canary", ["canary_journal"]],
  ["programme_selector_compatibility", ["canary_journal"]],
  ["cross_tenant_denial", ["canary_journal"]],
  ["capacity_reconciliation", ["reconciliation_report"]],
  ["ledger_reconciliation", ["reconciliation_report"]],
  ["native_reward_reconciliation", ["reconciliation_report"]],
  ["queue_result_reconciliation", ["reconciliation_report", "rollback_report"]],
  ["rollback_rehearsal", ["rollback_report"]],
  ["observation_window", ["observation_report"]],
  ["final_reconciliation", ["reconciliation_report"]],
]);
const artifactCheckBindings = new Map(
  [...requiredArtifacts].map((artifactId) => [artifactId, []]),
);
for (const [checkId, artifactIds] of checkArtifactBindings) {
  for (const artifactId of artifactIds) {
    artifactCheckBindings.get(artifactId).push(checkId);
  }
}
const allowedStatuses = new Set(["passed", "pending", "failed"]);
const completionApprovals = [
  "approvedRelease",
  "operatorAccess",
  "pilotStoreApproved",
  "canaryApproved",
];
const fail = (message) => {
  throw new Error(`Campaign canary evidence invalid: ${message}`);
};

const digest = (value) => createHash("sha256").update(value).digest("hex");
const digestPattern = /^[0-9a-f]{64}$/u;
const forbiddenKey =
  /(password|passphrase|secret|private.?key|access.?token|refresh.?token|bearer|credential.?value|raw.?body|coupon.?code|email|customer.?id|order.?id|auth.?uuid|tenant.?id|wallet.?id|reservation.?id|case.?id|connection.?id|idempotency.?key)/i;
const forbiddenValue =
  /(-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/=-]{12,}|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b)/i;

const inspectEvidence = (value, path = "evidence") => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectEvidence(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (forbiddenKey.test(key))
        fail(`forbidden sensitive key ${path}.${key}`);
      inspectEvidence(nested, `${path}.${key}`);
    }
    return;
  }
  if (typeof value === "string" && forbiddenValue.test(value)) {
    fail(`forbidden sensitive value at ${path}`);
  }
};

const safeArtifactPath = (relativePath, artifactId) => {
  const artifactStem = artifactId.replaceAll("_", "-");
  const pattern = new RegExp(
    `^docs/plan/evidence/M07/production/campaign-${artifactStem}-[a-z0-9][a-z0-9-]{2,79}\\.json$`,
    "u",
  );
  if (typeof relativePath !== "string" || !pattern.test(relativePath)) {
    fail(`${artifactId} artifact path is unsafe`);
  }
  const absolute = resolve(root, relativePath);
  const allowed = `${resolve(root, "docs/plan/evidence/M07/production")}${sep}`;
  if (!absolute.startsWith(allowed))
    fail(`${artifactId} artifact escapes its root`);
  return absolute;
};

const readBoundArtifact = (relativePath, expectedDigest, artifactId) => {
  if (!digestPattern.test(expectedDigest) || /^0{64}$/u.test(expectedDigest)) {
    fail(`${artifactId} artifact digest must be exact and nonzero`);
  }
  const absolute = safeArtifactPath(relativePath, artifactId);
  let descriptor;
  let raw;
  try {
    descriptor = openSync(
      absolute,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    const opened = fstatSync(descriptor);
    const linked = lstatSync(absolute);
    if (
      !opened.isFile() ||
      !linked.isFile() ||
      opened.dev !== linked.dev ||
      opened.ino !== linked.ino ||
      opened.size < 2 ||
      opened.size > 256 * 1024
    ) {
      fail(`${artifactId} artifact is not one stable bounded regular file`);
    }
    raw = Buffer.alloc(opened.size);
    let offset = 0;
    while (offset < raw.length) {
      const count = readSync(
        descriptor,
        raw,
        offset,
        raw.length - offset,
        offset,
      );
      if (count === 0) fail(`${artifactId} artifact changed while reading`);
      offset += count;
    }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  if (digest(raw) !== expectedDigest) {
    fail(`${artifactId} artifact digest differs`);
  }
  let document;
  try {
    document = JSON.parse(raw.toString("utf8"));
  } catch {
    fail(`${artifactId} artifact must be valid JSON`);
  }
  return document;
};

const validateDocument = (
  candidateEvidence,
  candidateTasks = tasks,
  artifactReader = readBoundArtifact,
) => {
  if (candidateEvidence.schema !== "starfiniti.campaign-canary.v1") {
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
  for (const approval of completionApprovals) {
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
    if (
      check.status === "passed" &&
      /\b(pending|await(?:s|ing)?|not yet|has not|still required)\b/i.test(
        check.evidence,
      )
    ) {
      fail(`passed check ${check.id} contains forward-looking evidence`);
    }
    checkIds.add(check.id);
  }
  for (const id of requiredChecks) {
    if (!checkIds.has(id)) fail(`missing check ${id}`);
  }

  if (!Array.isArray(candidateEvidence.artifacts)) {
    fail("artifacts must be an array");
  }
  const artifactIds = new Set();
  const verifiedArtifactPaths = new Set();
  const verifiedArtifactDigests = new Set();
  for (const artifact of candidateEvidence.artifacts) {
    if (!requiredArtifacts.has(artifact.id)) {
      fail(`unknown artifact ${artifact.id}`);
    }
    if (artifactIds.has(artifact.id)) {
      fail(`duplicate artifact ${artifact.id}`);
    }
    if (!new Set(["pending", "verified"]).has(artifact.status)) {
      fail(`invalid artifact status for ${artifact.id}`);
    }
    artifactIds.add(artifact.id);
    if (artifact.status === "pending") {
      if (artifact.path !== null || artifact.sha256 !== null) {
        fail(`pending artifact ${artifact.id} must not claim a path or digest`);
      }
      continue;
    }
    if (verifiedArtifactPaths.has(artifact.path)) {
      fail("verified artifacts reuse one evidence path");
    }
    if (verifiedArtifactDigests.has(artifact.sha256)) {
      fail("verified artifacts reuse one evidence digest");
    }
    verifiedArtifactPaths.add(artifact.path);
    verifiedArtifactDigests.add(artifact.sha256);
    const document = artifactReader(
      artifact.path,
      artifact.sha256,
      artifact.id,
    );
    if (
      document?.schema !== "starfiniti.campaign-canary-artifact.v1" ||
      document.artifactId !== artifact.id ||
      document.candidateCommit !== candidateEvidence.candidate.commit ||
      document.result !== "verified" ||
      typeof document.summary !== "string" ||
      document.summary.length < 20 ||
      document.summary !== document.summary.trim() ||
      typeof document.observedAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(document.observedAt) ||
      Number.isNaN(Date.parse(document.observedAt)) ||
      Date.parse(document.observedAt) > Date.parse(candidateEvidence.observedAt)
    ) {
      fail(`${artifact.id} artifact contract differs`);
    }
    const expectedChecks = artifactCheckBindings.get(artifact.id);
    if (
      !Array.isArray(document.checks) ||
      document.checks.length !== expectedChecks.length ||
      new Set(document.checks).size !== document.checks.length ||
      expectedChecks.some((checkId) => !document.checks.includes(checkId))
    ) {
      fail(`${artifact.id} artifact check coverage differs`);
    }
    inspectEvidence(document, `artifact.${artifact.id}`);
  }
  for (const artifactId of requiredArtifacts) {
    if (!artifactIds.has(artifactId)) fail(`missing artifact ${artifactId}`);
  }
  for (const check of candidateEvidence.checks) {
    if (check.status !== "passed") continue;
    for (const artifactId of checkArtifactBindings.get(check.id) ?? []) {
      const artifact = candidateEvidence.artifacts.find(
        (candidate) => candidate.id === artifactId,
      );
      if (artifact?.status !== "verified") {
        fail(`passed check ${check.id} lacks verified artifact ${artifactId}`);
      }
    }
  }
  for (const [approval, checkId] of Object.entries({
    approvedRelease: "approved_release",
    operatorAccess: "operator_access",
    pilotStoreApproved: "approved_pilot_store",
    canaryApproved: "canary_approval",
  })) {
    const passed =
      candidateEvidence.checks.find((check) => check.id === checkId)?.status ===
      "passed";
    if (candidateEvidence.candidate[approval] !== passed) {
      fail(`candidate ${approval} must match ${checkId}`);
    }
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
    unsignedWooCommerceIngress: 401,
  })) {
    if (candidateEvidence.publicBaseline?.[name] !== expected) {
      fail(`unexpected public baseline ${name}`);
    }
  }
  if (candidateEvidence.publicBaseline.canonicalDns !== true) {
    fail("canonical DNS must be verified");
  }

  inspectEvidence(candidateEvidence);

  if (
    !Array.isArray(candidateEvidence.automaticFails) ||
    candidateEvidence.automaticFails.length !== requiredAutomaticFails.size ||
    candidateEvidence.automaticFails.some(
      (rule) =>
        !requiredAutomaticFails.has(rule.id) ||
        rule.rule !== requiredAutomaticFails.get(rule.id),
    ) ||
    new Set(candidateEvidence.automaticFails.map((rule) => rule.id)).size !==
      requiredAutomaticFails.size
  ) {
    fail("automatic failures must contain every required unique rule ID");
  }

  const m07 = candidateTasks.tasks.find((task) => task.id === "M07-CAMPAIGNS");
  const requiredCompletedSlices = new Set([
    "M07-S01-AUDIENCE-AUTHORITY",
    "M07-S02-CAMPAIGN-CONTRACT-AND-SCHEDULE",
    "M07-S03-ATOMIC-CAPACITY-AND-EXECUTION",
    "M07-S04-MILESTONE-WINBACK-TIER-REFERRAL",
    "M07-S05-MERCHANT-EXPERIENCE-AND-RESULTS",
  ]);
  const s06 = m07?.slices?.find(
    (slice) => slice.id === "M07-S06-CANARY-AND-CLOSE",
  );
  if (!m07 || !s06) fail("M07 or M07-S06 task is missing");
  for (const id of requiredCompletedSlices) {
    const slice = m07.slices.find((candidate) => candidate.id === id);
    if (!new Set(["complete", "completed"]).has(slice?.status)) {
      fail(`${id} must be completed before canary`);
    }
  }
  if (m07.module_score !== calculatedScore) {
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
      completionApprovals.some(
        (approval) => candidateEvidence.candidate[approval] !== true,
      )
    ) {
      fail(
        "complete evidence requires release, operator, pilot-store, and canary approval",
      );
    }
    if (incomplete.length > 0) {
      fail(
        `complete evidence has non-passing checks: ${incomplete.map((check) => check.id).join(", ")}`,
      );
    }
    const incompleteArtifacts = candidateEvidence.artifacts.filter(
      (artifact) => artifact.status !== "verified",
    );
    if (incompleteArtifacts.length > 0) {
      fail(
        `complete evidence has unverified artifacts: ${incompleteArtifacts.map((artifact) => artifact.id).join(", ")}`,
      );
    }
    if (calculatedScore < candidateEvidence.score.target || belowFloor.length) {
      fail("complete evidence does not meet score and category floors");
    }
    if (m07.status !== "complete" || s06.status !== "completed") {
      fail("complete evidence requires completed M07 and S06 task state");
    }
  } else if (m07.status !== "in_progress" || s06.status !== "in_progress") {
    fail("in-progress evidence must match in-progress M07 and S06 task state");
  }

  return { calculatedScore, incomplete, belowFloor };
};

const result = validateDocument(evidence);

if (process.argv.includes("--self-test")) {
  const markPassed = (check) => {
    check.status = "passed";
    check.evidence =
      "Verified immutable canary evidence reconciles this mandatory result exactly.";
  };
  const buildCompleteFixture = () => {
    const candidateEvidence = structuredClone(evidence);
    const candidateTasks = structuredClone(tasks);
    candidateEvidence.status = "complete";
    completionApprovals.forEach((approval) => {
      candidateEvidence.candidate[approval] = true;
    });
    candidateEvidence.checks.forEach(markPassed);
    const operability = candidateEvidence.score.categories.find(
      (category) => category.id === "operability",
    );
    operability.score = 8;
    operability.evidence =
      "Release, recovery, bounded canary, rollback, observation, and exact final reconciliation evidence are verified and digest-bound.";
    candidateEvidence.score.total = candidateEvidence.score.categories.reduce(
      (total, category) => total + category.score,
      0,
    );
    const m07 = candidateTasks.tasks.find(
      (task) => task.id === "M07-CAMPAIGNS",
    );
    m07.status = "complete";
    m07.module_score = candidateEvidence.score.total;
    m07.slices.find((slice) => slice.id === "M07-S06-CANARY-AND-CLOSE").status =
      "completed";

    const bindings = new Map();
    candidateEvidence.artifacts.forEach((artifact) => {
      const document = {
        schema: "starfiniti.campaign-canary-artifact.v1",
        artifactId: artifact.id,
        candidateCommit: candidateEvidence.candidate.commit,
        observedAt: candidateEvidence.observedAt,
        result: "verified",
        summary: `Synthetic self-test evidence verifies the exact ${artifact.id} completion boundary.`,
        checks: artifactCheckBindings.get(artifact.id),
        details: { fixture: true, mutationCount: 0 },
      };
      const raw = JSON.stringify(document);
      artifact.status = "verified";
      artifact.path = `docs/plan/evidence/M07/production/campaign-${artifact.id.replaceAll("_", "-")}-self-test.json`;
      artifact.sha256 = digest(raw);
      bindings.set(artifact.id, {
        artifact: structuredClone(artifact),
        document,
      });
    });
    const artifactReader = (relativePath, expectedDigest, artifactId) => {
      const binding = bindings.get(artifactId);
      if (
        !binding ||
        binding.artifact.path !== relativePath ||
        binding.artifact.sha256 !== expectedDigest
      ) {
        fail(`${artifactId} fixture binding differs`);
      }
      return structuredClone(binding.document);
    };
    return { candidateEvidence, candidateTasks, artifactReader };
  };
  const expectRejected = (
    candidateEvidence,
    messagePart,
    label,
    candidateTasks = tasks,
    artifactReader = readBoundArtifact,
  ) => {
    try {
      validateDocument(candidateEvidence, candidateTasks, artifactReader);
    } catch (error) {
      if (error instanceof Error && error.message.includes(messagePart)) return;
      throw error;
    }
    fail(`self-test accepted ${label}`);
  };

  const unapprovedCompletion = structuredClone(evidence);
  unapprovedCompletion.status = "complete";
  expectRejected(
    unapprovedCompletion,
    "requires release, operator, pilot-store, and canary approval",
    "unapproved evidence as complete",
  );

  const pendingFixture = buildCompleteFixture();
  pendingFixture.candidateEvidence.checks.find(
    (check) => check.id === "audience_snapshot_canary",
  ).status = "pending";
  expectRejected(
    pendingFixture.candidateEvidence,
    "complete evidence has non-passing checks",
    "pending evidence as complete",
    pendingFixture.candidateTasks,
    pendingFixture.artifactReader,
  );

  const sensitiveKey = structuredClone(evidence);
  sensitiveKey.connectorSecretValue = "must never be accepted";
  expectRejected(
    sensitiveKey,
    "forbidden sensitive key",
    "a sensitive evidence key",
  );

  const sensitiveValue = structuredClone(evidence);
  sensitiveValue.checks[0].evidence =
    "Unsafe customer evidence 84000000-0000-4000-8000-000000000001 must be rejected.";
  expectRejected(
    sensitiveValue,
    "forbidden sensitive value",
    "a raw identity value",
  );

  const missingCheck = structuredClone(evidence);
  missingCheck.checks = missingCheck.checks.slice(1);
  expectRejected(missingCheck, "missing check", "a missing mandatory check");

  const duplicateCheck = structuredClone(evidence);
  duplicateCheck.checks.push(structuredClone(duplicateCheck.checks[0]));
  expectRejected(duplicateCheck, "duplicate check", "a duplicate check");

  const forwardLookingPass = structuredClone(evidence);
  forwardLookingPass.checks[0].evidence =
    "The exact repository run is still pending external confirmation.";
  expectRejected(
    forwardLookingPass,
    "contains forward-looking evidence",
    "a passed check with pending evidence",
  );

  const approvalDrift = structuredClone(evidence);
  approvalDrift.candidate.approvedRelease = true;
  expectRejected(
    approvalDrift,
    "must match approved_release",
    "approval and check drift",
  );

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
  shortAutomaticFailure.automaticFails[0].rule = "too short";
  expectRejected(
    shortAutomaticFailure,
    "every required unique rule ID",
    "a hollow automatic failure rule",
  );

  const missingAutomaticFailure = structuredClone(evidence);
  missingAutomaticFailure.automaticFails[0].id = "replacement_rule";
  expectRejected(
    missingAutomaticFailure,
    "every required unique rule ID",
    "a replaced automatic failure boundary",
  );

  const passedWithoutArtifact = structuredClone(evidence);
  const baselineArtifact = passedWithoutArtifact.artifacts.find(
    (artifact) => artifact.id === "read_only_baseline",
  );
  baselineArtifact.status = "pending";
  baselineArtifact.path = null;
  baselineArtifact.sha256 = null;
  expectRejected(
    passedWithoutArtifact,
    "lacks verified artifact",
    "a passed production check without a verified artifact",
  );

  const artifactDigestDrift = structuredClone(evidence);
  artifactDigestDrift.artifacts.find(
    (artifact) => artifact.id === "read_only_baseline",
  ).sha256 = "f".repeat(64);
  expectRejected(
    artifactDigestDrift,
    "artifact digest differs",
    "artifact digest drift",
  );

  const unsafeArtifactPath = structuredClone(evidence);
  unsafeArtifactPath.artifacts.find(
    (artifact) => artifact.id === "read_only_baseline",
  ).path = "docs/plan/evidence/M07/canary.yaml";
  expectRejected(
    unsafeArtifactPath,
    "artifact path is unsafe",
    "an unsafe artifact path",
  );

  const reusedPathFixture = buildCompleteFixture();
  const reusedPathArtifacts = reusedPathFixture.candidateEvidence.artifacts;
  reusedPathArtifacts.find(
    (artifact) => artifact.id === "observation_report",
  ).path = reusedPathArtifacts.find(
    (artifact) => artifact.id === "rollback_report",
  ).path;
  expectRejected(
    reusedPathFixture.candidateEvidence,
    "reuse one evidence path",
    "a reused production evidence path",
    reusedPathFixture.candidateTasks,
    reusedPathFixture.artifactReader,
  );

  const reusedDigestFixture = buildCompleteFixture();
  const reusedDigestArtifacts = reusedDigestFixture.candidateEvidence.artifacts;
  reusedDigestArtifacts.find(
    (artifact) => artifact.id === "observation_report",
  ).sha256 = reusedDigestArtifacts.find(
    (artifact) => artifact.id === "rollback_report",
  ).sha256;
  expectRejected(
    reusedDigestFixture.candidateEvidence,
    "reuse one evidence digest",
    "a reused production evidence digest",
    reusedDigestFixture.candidateTasks,
    reusedDigestFixture.artifactReader,
  );

  const baselineDrift = structuredClone(evidence);
  baselineDrift.publicBaseline.unsignedWooCommerceIngress = 200;
  expectRejected(
    baselineDrift,
    "unexpected public baseline",
    "an unsafe public baseline",
  );

  const incompleteSliceTasks = structuredClone(tasks);
  incompleteSliceTasks.tasks
    .find((task) => task.id === "M07-CAMPAIGNS")
    .slices.find(
      (slice) => slice.id === "M07-S04-MILESTONE-WINBACK-TIER-REFERRAL",
    ).status = "in_progress";
  expectRejected(
    evidence,
    "must be completed before canary",
    "an incomplete prerequisite slice",
    incompleteSliceTasks,
  );

  const taskScoreDrift = structuredClone(tasks);
  taskScoreDrift.tasks.find(
    (task) => task.id === "M07-CAMPAIGNS",
  ).module_score += 1;
  expectRejected(
    evidence,
    "module score must match",
    "task and evidence score drift",
    taskScoreDrift,
  );

  const falseCompletion = buildCompleteFixture();
  const missingProductionArtifact =
    falseCompletion.candidateEvidence.artifacts.find(
      (artifact) => artifact.id === "reconciliation_report",
    );
  missingProductionArtifact.status = "pending";
  missingProductionArtifact.path = null;
  missingProductionArtifact.sha256 = null;
  expectRejected(
    falseCompletion.candidateEvidence,
    "lacks verified artifact",
    "prose-only completion without bound production evidence",
    falseCompletion.candidateTasks,
    falseCompletion.artifactReader,
  );

  const belowFloorFixture = buildCompleteFixture();
  const belowFloorOperability =
    belowFloorFixture.candidateEvidence.score.categories.find(
      (category) => category.id === "operability",
    );
  belowFloorOperability.score = 3;
  belowFloorFixture.candidateEvidence.score.total = 90;
  belowFloorFixture.candidateTasks.tasks.find(
    (task) => task.id === "M07-CAMPAIGNS",
  ).module_score = 90;
  expectRejected(
    belowFloorFixture.candidateEvidence,
    "score and category floors",
    "completion below a category floor",
    belowFloorFixture.candidateTasks,
    belowFloorFixture.artifactReader,
  );

  const completeFixture = buildCompleteFixture();
  validateDocument(
    completeFixture.candidateEvidence,
    completeFixture.candidateTasks,
    completeFixture.artifactReader,
  );
}

console.log(
  `Validated ${evidence.checks.length} M07 canary checks and ${evidence.score.categories.length} score categories; score ${result.calculatedScore}/100 with ${evidence.checks.filter((check) => check.status === "passed").length} passed, ${evidence.checks.filter((check) => check.status === "pending").length} pending, and ${evidence.checks.filter((check) => check.status === "failed").length} failed.`,
);
