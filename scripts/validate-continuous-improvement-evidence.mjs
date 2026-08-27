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
  evidence: "docs/plan/evidence/M16/continuous-improvement.yaml",
  plan: "infrastructure/governance/continuous-improvement.yaml",
  backlog: "docs/plan/IMPROVEMENT_BACKLOG.yaml",
  tasks: "docs/plan/TASKS.yaml",
  runbook: "docs/operations/CONTINUOUS_IMPROVEMENT.md",
  adr: "docs/architecture/ADR/0068-evidence-bound-continuous-improvement.md",
};
const readText = (relativePath) =>
  readFileSync(join(root, relativePath), "utf8");
const evidence = YAML.parse(readText(paths.evidence));
const plan = YAML.parse(readText(paths.plan));
const backlog = YAML.parse(readText(paths.backlog));
const tasks = YAML.parse(readText(paths.tasks));
const runbook = readText(paths.runbook);
const adr = readText(paths.adr);
const planRaw = readText(paths.plan);
const backlogRaw = readText(paths.backlog);

const requiredChecks = new Set([
  "repository_contract",
  "backlog_contract",
  "task_graph_binding",
  "runbook_contract",
  "adr_contract",
  "validator_selftest",
  "exact_head_ci",
  "owner_roster",
  "schedules_active",
  "monthly_review_primary",
  "monthly_review_repeat",
  "monthly_continuity",
  "activation_review",
  "errors_support_review",
  "reconciliation_fraud_review",
  "campaign_churn_review",
  "usability_performance_review",
  "security_billing_review",
  "provider_review",
  "dependency_pins",
  "backlog_freshness",
  "backlog_priority",
  "no_overdue_critical_high",
  "recurring_failure_inventory",
  "durable_regression_controls",
  "module_rescoring",
  "score_history",
  "experiment_registry",
  "experiment_guardrails",
  "quarterly_restore",
  "quarterly_tenant_isolation",
  "quarterly_privacy",
  "quarterly_scim",
  "quarterly_incident",
  "exercise_reconciliation",
  "adr_supersession",
  "living_documents_current",
  "independent_review",
  "owner_approval",
]);
const reviewSections = new Set([
  "activation",
  "errors",
  "support",
  "reconciliation",
  "fraud",
  "campaigns",
  "churn",
  "usability",
  "performance",
  "security",
  "billing",
  "providerChanges",
  "backlog",
  "moduleScores",
]);
const exerciseIds = new Set([
  "restore",
  "tenantIsolation",
  "privacy",
  "scimDeprovisioning",
  "incident",
]);
const differenceFields = new Set([
  "protectedValue",
  "tenantBoundary",
  "privacy",
  "recovery",
  "checkoutDependency",
  "dataLoss",
]);
const providerSources = new Map([
  ["supabase", "https://supabase.com/changelog"],
  ["postgresql", "https://www.postgresql.org/support/versioning/"],
  ["woocommerce", "https://developer.woocommerce.com/changelog/"],
  ["stripe", "https://docs.stripe.com/changelog"],
  ["authentik", "https://docs.goauthentik.io/releases/"],
  ["klaviyo", "https://developers.klaviyo.com/en/docs/changelog_"],
  ["nodejs", "https://nodejs.org/en/about/previous-releases"],
]);
const scoreWeights = new Map([
  ["correctness", 20],
  ["security", 15],
  ["ledgerReliability", 15],
  ["tests", 15],
  ["performance", 10],
  ["operability", 10],
  ["maintainability", 15],
]);
const severityPoints = new Map([
  ["critical", 40],
  ["high", 30],
  ["medium", 20],
  ["low", 10],
]);
const allowedControls = new Set([
  "regressionTest",
  "validator",
  "monitor",
  "runbook",
  "agentRule",
]);
const approvalRoles = new Set([
  "product",
  "engineering",
  "security",
  "operations",
  "owner",
]);
const moduleIds = new Set(
  Array.from(
    { length: 17 },
    (_, index) => `M${String(index).padStart(2, "0")}`,
  ),
);
const artifactBindings = [
  [
    "monthlyReviewPrimary",
    "monthly-review-primary",
    "starfiniti.monthly-improvement-review.v1",
  ],
  [
    "monthlyReviewRepeat",
    "monthly-review-repeat",
    "starfiniti.monthly-improvement-review.v1",
  ],
  [
    "quarterlyExerciseBundle",
    "quarterly-exercise-bundle",
    "starfiniti.quarterly-exercise-bundle.v1",
  ],
  [
    "finalReconciliation",
    "final-reconciliation",
    "starfiniti.improvement-reconciliation.v1",
  ],
  [
    "approvalRecord",
    "approval-record",
    "starfiniti.improvement-approval-record.v1",
  ],
];
const digestPattern = /^[a-f0-9]{64}$/u;
const commitPattern = /^[a-f0-9]{40}$/u;

function fail(message) {
  throw new Error(`M16 continuous-improvement evidence invalid: ${message}`);
}

function digest(raw) {
  return createHash("sha256").update(raw).digest("hex");
}

function exactSet(actual, expected, label) {
  if (
    actual.size !== expected.size ||
    [...expected].some((value) => !actual.has(value))
  ) {
    fail(`${label} differs from the required closed set`);
  }
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

function exactUtc(value, label) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().replace(".000Z", "Z") !== value
  ) {
    fail(`${label} is not an exact UTC instant`);
  }
  return Date.parse(value);
}

function exactInteger(value, label, minimum = 0, maximum = 10) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    fail(`${label} is outside its integer bounds`);
  }
}

function safeArtifactPath(relativePath, artifactId) {
  if (
    typeof relativePath !== "string" ||
    !relativePath.startsWith("docs/plan/evidence/M16/runs/") ||
    relativePath.includes("..") ||
    !relativePath.endsWith(".json")
  ) {
    fail(`${artifactId} artifact path is unsafe`);
  }
  const resolved = resolve(root, relativePath);
  const allowed = resolve(root, "docs/plan/evidence/M16/runs") + sep;
  if (!resolved.startsWith(allowed))
    fail(`${artifactId} escapes evidence root`);
  return resolved;
}

function readBoundArtifact(relativePath, expectedDigest, artifactId) {
  if (!digestPattern.test(expectedDigest) || /^0{64}$/u.test(expectedDigest)) {
    fail(`${artifactId} digest is invalid`);
  }
  const absolute = safeArtifactPath(relativePath, artifactId);
  let descriptor;
  let raw;
  try {
    descriptor = openSync(
      absolute,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    const status = fstatSync(descriptor);
    const linkStatus = lstatSync(absolute);
    if (
      !status.isFile() ||
      !linkStatus.isFile() ||
      status.dev !== linkStatus.dev ||
      status.ino !== linkStatus.ino ||
      status.size < 2 ||
      status.size > 256 * 1024
    ) {
      fail(`${artifactId} is not a bounded stable file`);
    }
    raw = Buffer.alloc(status.size);
    let offset = 0;
    while (offset < raw.length) {
      const count = readSync(
        descriptor,
        raw,
        offset,
        raw.length - offset,
        offset,
      );
      if (count === 0) fail(`${artifactId} changed while reading`);
      offset += count;
    }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  const text = raw.toString("utf8");
  if (digest(text) !== expectedDigest) fail(`${artifactId} digest differs`);
  return JSON.parse(text);
}

function scanMinimized(value, label, path = "$") {
  const prohibitedKeys = new Set([
    "email",
    "token",
    "secret",
    "password",
    "cookie",
    "customerId",
    "tenantId",
    "coupon",
    "providerPayload",
    "receiverDestination",
  ]);
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      scanMinimized(item, label, `${path}[${index}]`),
    );
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (prohibitedKeys.has(key))
        fail(`${label} contains prohibited key ${path}.${key}`);
      scanMinimized(child, label, `${path}.${key}`);
    }
    return;
  }
  if (
    typeof value === "string" &&
    /(sk_(?:live|test)_|whsec_|-----BEGIN [A-Z ]+PRIVATE KEY-----)/u.test(value)
  ) {
    fail(`${label} contains reusable secret material`);
  }
}

function backlogScore(item) {
  for (const field of [
    "merchantImpact",
    "customerImpact",
    "effort",
    "confidence",
    "dependencyPenalty",
  ]) {
    exactInteger(item[field], `${item.id}.${field}`);
  }
  if (!severityPoints.has(item.severity)) {
    fail(`${item.id} severity is unsupported`);
  }
  return (
    severityPoints.get(item.severity) +
    2 * item.merchantImpact +
    2 * item.customerImpact +
    item.confidence -
    item.effort -
    item.dependencyPenalty
  );
}

function validateBacklog(candidateBacklog) {
  if (
    candidateBacklog?.schema !== "starfiniti.improvement-backlog.v1" ||
    candidateBacklog.version !== 1
  ) {
    fail("backlog schema or version differs");
  }
  exactUtc(candidateBacklog.observedAt, "backlog observedAt");
  if (
    candidateBacklog.ranking?.formula !== plan.backlog.ranking.formula ||
    JSON.stringify(candidateBacklog.ranking?.severityPoints) !==
      JSON.stringify(plan.backlog.ranking.severityPoints) ||
    JSON.stringify(candidateBacklog.ranking?.sort) !==
      JSON.stringify(plan.backlog.ranking.sort)
  ) {
    fail("backlog ranking contract differs from the plan");
  }
  uniqueIds(candidateBacklog.items, "backlog items");
  let previous = Number.POSITIVE_INFINITY;
  let previousId = "";
  for (const item of candidateBacklog.items) {
    const calculated = backlogScore(item);
    if (item.score !== calculated) fail(`${item.id} backlog score differs`);
    if (
      calculated > previous ||
      (calculated === previous && item.id.localeCompare(previousId) < 0)
    ) {
      fail("backlog order differs from score-descending id-ascending");
    }
    for (const field of [
      "title",
      "status",
      "evidence",
      "dependency",
      "ownerInput",
    ]) {
      if (typeof item[field] !== "string" || item[field].trim().length < 8) {
        fail(`${item.id}.${field} is missing or too short`);
      }
    }
    if (
      ![
        "planned",
        "in_progress",
        "blocked_external",
        "blocked_dependency",
        "complete",
      ].includes(item.status)
    ) {
      fail(`${item.id}.status is unsupported`);
    }
    previous = calculated;
    previousId = item.id;
  }
}

function validateScore(candidateScore, label, requireFloor) {
  const ids = uniqueIds(candidateScore?.categories, `${label} categories`);
  exactSet(ids, new Set(scoreWeights.keys()), `${label} categories`);
  let total = 0;
  for (const category of candidateScore.categories) {
    const weight = scoreWeights.get(category.id);
    if (
      category.weight !== weight ||
      !Number.isInteger(category.score) ||
      category.score < 0 ||
      category.score > weight ||
      ("evidence" in category &&
        (typeof category.evidence !== "string" ||
          category.evidence.length < 35))
    ) {
      fail(`${label}.${category.id} score contract differs`);
    }
    if (requireFloor && category.score / weight < 0.8) {
      fail(`${label}.${category.id} is below its category floor`);
    }
    total += category.score;
  }
  if (
    candidateScore.total !== total ||
    candidateScore.target !== 90 ||
    candidateScore.minimumCategoryRatio !== 0.8 ||
    (requireFloor && total < 90)
  ) {
    fail(`${label} total or thresholds differ`);
  }
  return total;
}

function monthIndex(period) {
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/u.test(period)) {
    fail("monthly review period is invalid");
  }
  const [year, month] = period.split("-").map(Number);
  return year * 12 + month - 1;
}

function validateMonthlyReview(document, candidate, bindings) {
  if (document.schema !== "starfiniti.monthly-improvement-review.v1") {
    fail("monthly review schema differs");
  }
  const index = monthIndex(document.period);
  const year = Math.floor(index / 12);
  const month = index % 12;
  const periodStart = Date.UTC(year, month, 1);
  const periodEnd = Date.UTC(year, month + 1, 1);
  const observedAt = exactUtc(
    document.observedAt,
    `${document.period} observedAt`,
  );
  if (observedAt < periodEnd || observedAt > periodEnd + 10 * 86_400_000) {
    fail(`${document.period} review is outside its ten-day close window`);
  }
  if (
    document.candidateCommit !== candidate.commit ||
    document.planSha256 !== bindings.planSha256 ||
    document.backlogSha256 !== bindings.backlogSha256 ||
    typeof document.reviewerRole !== "string" ||
    document.reviewerRole.length < 5
  ) {
    fail(`${document.period} candidate governance or reviewer binding differs`);
  }
  exactSet(
    uniqueIds(document.sections, `${document.period} sections`),
    reviewSections,
    `${document.period} sections`,
  );
  for (const section of document.sections) {
    if (
      section.sourceFresh !== true ||
      !digestPattern.test(section.sourceSha256 ?? "") ||
      /^0{64}$/u.test(section.sourceSha256) ||
      exactUtc(
        section.sourceObservedAt,
        `${document.period}.${section.id} sourceObservedAt`,
      ) < periodStart ||
      exactUtc(
        section.sourceObservedAt,
        `${document.period}.${section.id} sourceObservedAt`,
      ) > observedAt ||
      !["string", "number"].includes(typeof section.baseline) ||
      !["string", "number"].includes(typeof section.observed) ||
      !["string", "number"].includes(typeof section.target) ||
      typeof section.disposition !== "string" ||
      section.disposition.length < 20
    ) {
      fail(`${document.period}.${section.id} section is incomplete or stale`);
    }
  }
  exactSet(
    uniqueIds(document.providers, `${document.period} providers`),
    new Set(providerSources.keys()),
    `${document.period} providers`,
  );
  for (const provider of document.providers) {
    if (
      provider.source !== providerSources.get(provider.id) ||
      exactUtc(provider.reviewedAt, `${provider.id} reviewedAt`) <
        periodStart ||
      exactUtc(provider.reviewedAt, `${provider.id} reviewedAt`) > observedAt ||
      ![
        "none",
        "breaking",
        "security",
        "support",
        "deprecation",
        "feature",
      ].includes(provider.impact) ||
      typeof provider.observedVersionOrEntry !== "string" ||
      provider.observedVersionOrEntry.length < 4 ||
      typeof provider.ownerRole !== "string" ||
      provider.ownerRole.length < 5 ||
      typeof provider.disposition !== "string" ||
      provider.disposition.length < 20
    ) {
      fail(`${document.period}.${provider.id} provider review is incomplete`);
    }
  }
  const material = new Set(document.materiallyChangedModules ?? []);
  if ([...material].some((id) => !moduleIds.has(id))) {
    fail(`${document.period} materially changed modules are invalid`);
  }
  const rescored = new Set(
    document.moduleRescores?.map((item) => item.id) ?? [],
  );
  for (const id of material) {
    if (!rescored.has(id))
      fail(`${document.period}.${id} material change was not rescored`);
  }
  for (const rescore of document.moduleRescores ?? []) {
    if (
      !moduleIds.has(rescore.id) ||
      !Number.isInteger(rescore.previousTotal) ||
      !Number.isInteger(rescore.currentTotal) ||
      rescore.previousTotal < 0 ||
      rescore.currentTotal < 0 ||
      rescore.currentTotal > 100 ||
      typeof rescore.evidenceSha256 !== "string" ||
      !digestPattern.test(rescore.evidenceSha256)
    ) {
      fail(`${document.period} module rescore is invalid`);
    }
  }
  for (const failure of document.failures ?? []) {
    if (
      typeof failure.fingerprint !== "string" ||
      failure.fingerprint.length < 12 ||
      !Number.isInteger(failure.occurrences) ||
      failure.occurrences < 1 ||
      !Array.isArray(failure.controls)
    ) {
      fail(`${document.period} failure inventory is invalid`);
    }
    if (failure.occurrences >= 2 && failure.controls.length < 1) {
      fail(`${failure.fingerprint} recurred without a durable control`);
    }
    for (const control of failure.controls) {
      if (
        !allowedControls.has(control.type) ||
        typeof control.reference !== "string" ||
        control.reference.length < 8
      ) {
        fail(`${failure.fingerprint} durable control is invalid`);
      }
    }
  }
  for (const experiment of document.experiments ?? []) {
    if (
      typeof experiment.id !== "string" ||
      typeof experiment.primaryMetric !== "string" ||
      experiment.primaryMetric.length < 5 ||
      !digestPattern.test(experiment.declarationSha256 ?? "") ||
      /^0{64}$/u.test(experiment.declarationSha256) ||
      !["maximize", "minimize"].includes(experiment.direction) ||
      !Number.isFinite(experiment.baseline) ||
      !Number.isFinite(experiment.target) ||
      !Number.isFinite(experiment.observed) ||
      !Array.isArray(experiment.guardrails) ||
      !["promoted", "stopped", "continued"].includes(experiment.decision)
    ) {
      fail(`${document.period} experiment is invalid`);
    }
    const guardrailIds = uniqueIds(
      experiment.guardrails,
      `${experiment.id} guardrails`,
    );
    if (
      guardrailIds.size < 1 ||
      experiment.guardrails.some(
        (guardrail) => typeof guardrail.passed !== "boolean",
      )
    ) {
      fail(`${experiment.id} guardrail evidence is invalid`);
    }
    if (experiment.decision === "promoted") {
      const improved =
        experiment.direction === "maximize"
          ? experiment.observed > experiment.baseline
          : experiment.observed < experiment.baseline;
      if (
        !improved ||
        experiment.guardrails.some((guardrail) => guardrail.passed !== true)
      ) {
        fail(
          `${experiment.id} was promoted without improvement and passing guardrails`,
        );
      }
    }
  }
  return { index, observedAt };
}

function validateQuarterlyBundle(document, candidate, bindings) {
  if (
    document.schema !== "starfiniti.quarterly-exercise-bundle.v1" ||
    !/^\d{4}-Q[1-4]$/u.test(document.quarter)
  ) {
    fail("quarterly bundle schema or period differs");
  }
  const observedAt = exactUtc(document.observedAt, "quarterly observedAt");
  const [yearText, quarterText] = document.quarter.split("-Q");
  const year = Number(yearText);
  const quarter = Number(quarterText);
  const quarterEnd = Date.UTC(year, quarter * 3, 1);
  if (observedAt < quarterEnd || observedAt > quarterEnd + 30 * 86_400_000) {
    fail("quarterly bundle is outside its thirty-day close window");
  }
  if (
    document.candidateCommit !== candidate.commit ||
    document.planSha256 !== bindings.planSha256 ||
    document.backlogSha256 !== bindings.backlogSha256
  ) {
    fail("quarterly candidate or governance binding differs");
  }
  exactSet(
    uniqueIds(document.exercises, "quarterly exercises"),
    exerciseIds,
    "quarterly exercises",
  );
  const reportDigests = new Set();
  for (const exercise of document.exercises) {
    const startedAt = exactUtc(exercise.startedAt, `${exercise.id} startedAt`);
    const endedAt = exactUtc(exercise.endedAt, `${exercise.id} endedAt`);
    if (
      exercise.status !== "passed" ||
      exercise.sourceCoverageRatio !== 1 ||
      startedAt >= endedAt ||
      endedAt > observedAt ||
      !digestPattern.test(exercise.approvalSha256 ?? "") ||
      /^0{64}$/u.test(exercise.approvalSha256) ||
      !digestPattern.test(exercise.environmentSha256 ?? "") ||
      /^0{64}$/u.test(exercise.environmentSha256) ||
      !digestPattern.test(exercise.inputSha256 ?? "") ||
      /^0{64}$/u.test(exercise.inputSha256) ||
      typeof exercise.ownerRole !== "string" ||
      exercise.ownerRole.length < 5 ||
      !digestPattern.test(exercise.reportSha256) ||
      /^0{64}$/u.test(exercise.reportSha256) ||
      reportDigests.has(exercise.reportSha256)
    ) {
      fail(`${exercise.id} quarterly exercise is incomplete or reused`);
    }
    reportDigests.add(exercise.reportSha256);
    exactSet(
      new Set(Object.keys(exercise.differences ?? {})),
      differenceFields,
      `${exercise.id} differences`,
    );
    for (const [field, value] of Object.entries(exercise.differences)) {
      if (!Number.isInteger(value) || value !== 0) {
        fail(`${exercise.id}.${field} difference is nonzero`);
      }
    }
  }
  return observedAt;
}

function validateReconciliation(document, candidate, bindings) {
  if (document.schema !== "starfiniti.improvement-reconciliation.v1") {
    fail("final reconciliation schema differs");
  }
  const observedAt = exactUtc(document.observedAt, "reconciliation observedAt");
  if (
    document.candidateCommit !== candidate.commit ||
    document.planSha256 !== bindings.planSha256 ||
    document.backlogSha256 !== bindings.backlogSha256
  ) {
    fail("final reconciliation identity differs");
  }
  for (const field of [
    "dueReviewGaps",
    "providerStale",
    "overdueCriticalHigh",
    "recurringWithoutControl",
    "unrescoredMaterialChanges",
    "promotedExperimentGuardrailFailures",
    "exerciseDifferences",
    "livingDocumentDrift",
    "unresolvedCritical",
    "unresolvedHigh",
  ]) {
    if (!Number.isInteger(document[field]) || document[field] !== 0) {
      fail(`final reconciliation ${field} is nonzero`);
    }
  }
  validateScore(document.moduleScore, "M16 completion score", true);
  exactSet(
    uniqueIds(document.moduleScores, "final module scores"),
    moduleIds,
    "final module scores",
  );
  for (const moduleScore of document.moduleScores) {
    if (
      !Number.isInteger(moduleScore.total) ||
      moduleScore.total < 90 ||
      moduleScore.total > 100 ||
      typeof moduleScore.minimumCategoryRatioObserved !== "number" ||
      moduleScore.minimumCategoryRatioObserved < 0.8 ||
      moduleScore.minimumCategoryRatioObserved > 1
    ) {
      fail(`${moduleScore.id} final module score or category floor is invalid`);
    }
  }
  return observedAt;
}

function validateApproval(document, candidate, expectedArtifacts) {
  if (
    document.schema !== "starfiniti.improvement-approval-record.v1" ||
    document.candidateCommit !== candidate.commit ||
    document.independentReview !== true
  ) {
    fail("approval record identity or independent review differs");
  }
  const observedAt = exactUtc(document.observedAt, "approval observedAt");
  if (
    document.schedulesActive !== true ||
    exactUtc(document.nextMonthlyReviewAt, "next monthly review") <=
      observedAt ||
    exactUtc(document.nextQuarterlyExerciseAt, "next quarterly exercise") <=
      observedAt
  ) {
    fail("approval record does not bind active future schedules");
  }
  exactSet(
    new Set(Object.keys(document.artifactSha256 ?? {})),
    new Set(Object.keys(expectedArtifacts)),
    "approval artifact bindings",
  );
  for (const [id, expectedDigest] of Object.entries(expectedArtifacts)) {
    if (document.artifactSha256[id] !== expectedDigest) {
      fail(`approval artifact binding differs for ${id}`);
    }
  }
  exactSet(
    uniqueIds(document.approvals, "improvement approvals"),
    approvalRoles,
    "improvement approvals",
  );
  for (const approval of document.approvals) {
    if (
      approval.approved !== true ||
      !digestPattern.test(approval.evidenceSha256) ||
      /^0{64}$/u.test(approval.evidenceSha256)
    ) {
      fail(`${approval.id} approval is incomplete`);
    }
  }
  return observedAt;
}

function validateDocument(
  candidateEvidence,
  candidatePlan = plan,
  candidateBacklog = backlog,
  candidateTasks = tasks,
  artifactReader = readBoundArtifact,
  candidatePlanRaw = planRaw,
  candidateBacklogRaw = backlogRaw,
) {
  if (
    candidatePlan?.schema !== "starfiniti.continuous-improvement-plan.v1" ||
    candidatePlan.version !== 1 ||
    candidatePlan.timezone !== "UTC"
  ) {
    fail("plan schema version or timezone differs");
  }
  exactSet(
    new Set(candidatePlan.reviewCalendar.monthly.requiredSections),
    reviewSections,
    "monthly sections",
  );
  exactSet(
    new Set(candidatePlan.reviewCalendar.quarterly.requiredExercises),
    exerciseIds,
    "quarterly exercises",
  );
  if (
    candidatePlan.reviewCalendar.monthly.dueDaysAfterPeriodEnd !== 10 ||
    candidatePlan.reviewCalendar.monthly
      .minimumConsecutiveReviewsForInitialClose !== 2 ||
    candidatePlan.reviewCalendar.quarterly.dueDaysAfterPeriodEnd !== 30 ||
    candidatePlan.reviewCalendar.quarterly.minimumBundlesForInitialClose !==
      1 ||
    candidatePlan.recurringFailure.thresholdOccurrences !== 2 ||
    candidatePlan.moduleRescoring.target !== 90 ||
    candidatePlan.moduleRescoring.minimumCategoryRatio !== 0.8
  ) {
    fail("cadence regression or scoring bounds differ");
  }
  exactSet(
    uniqueIds(candidatePlan.providerCatalogue, "provider catalogue"),
    new Set(providerSources.keys()),
    "provider catalogue",
  );
  for (const provider of candidatePlan.providerCatalogue) {
    if (
      provider.source !== providerSources.get(provider.id) ||
      provider.reviewFrequency !== "monthly"
    ) {
      fail(`${provider.id} provider source or cadence differs`);
    }
  }
  exactSet(
    new Set(candidatePlan.recurringFailure.allowedControls),
    allowedControls,
    "allowed durable controls",
  );
  exactSet(
    new Set(candidatePlan.requiredApprovalRoles),
    approvalRoles,
    "approval roles",
  );
  exactSet(
    new Set(candidatePlan.backlog.incompleteCriticalHighRequire),
    new Set(["approvedRiskSha256", "nextReviewAt", "dependency"]),
    "Critical and High accepted-risk bindings",
  );
  if (
    candidatePlan.experiments.promotionRequiresMetricImprovement !== true ||
    candidatePlan.experiments.promotionRequiresAllGuardrailsPass !== true ||
    candidatePlan.experiments.stopOnGuardrailBreach !== true ||
    candidatePlan.decisions.supersedeByAdr !== true ||
    candidatePlan.decisions.rewriteHistoricalEvidence !== false ||
    candidatePlan.artifacts.approvalBindsPriorArtifacts !== true
  ) {
    fail("experiment guardrails or history semantics differ");
  }
  exactSet(
    new Set(candidatePlan.artifacts.governanceBindings),
    new Set(["candidateCommit", "planSha256", "backlogSha256"]),
    "artifact governance bindings",
  );
  exactSet(
    uniqueIds(candidatePlan.artifacts.required, "required artifacts"),
    new Set(artifactBindings.map(([, id]) => id)),
    "required artifacts",
  );
  for (const artifact of candidatePlan.artifacts.required) {
    const binding = artifactBindings.find(([, id]) => id === artifact.id);
    if (artifact.schema !== binding?.[2]) {
      fail(`${artifact.id} canonical artifact schema differs`);
    }
  }
  validateBacklog(candidateBacklog);

  if (
    candidateEvidence?.schema !== "starfiniti.continuous-improvement.v1" ||
    !["in_progress", "complete"].includes(candidateEvidence.status) ||
    !commitPattern.test(candidateEvidence.candidate?.commit)
  ) {
    fail("manifest schema status or candidate differs");
  }
  exactUtc(candidateEvidence.observedAt, "manifest observedAt");
  if (
    candidateEvidence.plan?.path !== paths.plan ||
    candidateEvidence.plan.sha256 !== digest(candidatePlanRaw) ||
    candidateEvidence.backlog?.path !== paths.backlog ||
    candidateEvidence.backlog.sha256 !== digest(candidateBacklogRaw)
  ) {
    fail("plan or backlog digest binding differs");
  }
  const checkIds = uniqueIds(candidateEvidence.checks, "manifest checks");
  exactSet(checkIds, requiredChecks, "manifest checks");
  for (const check of candidateEvidence.checks) {
    if (
      !["passed", "pending", "failed"].includes(check.status) ||
      typeof check.evidence !== "string" ||
      check.evidence.length < 35
    ) {
      fail(`${check.id} status or evidence is invalid`);
    }
  }
  validateScore(candidateEvidence.score, "manifest score", false);
  if (
    JSON.stringify(candidateEvidence.automaticFails) !==
      JSON.stringify(candidatePlan.automaticFails) ||
    candidateEvidence.automaticFails.length < 9
  ) {
    fail("automatic failures differ from the canonical plan");
  }
  const m16 = candidateTasks.tasks?.find(
    (task) => task.id === "M16-CONTINUOUS-IMPROVEMENT",
  );
  if (!m16) fail("M16 task is missing");
  const taskText = YAML.stringify(m16).toLowerCase();
  for (const term of [
    "two consecutive",
    "provider",
    "recurring",
    "experiment",
    "quarterly",
    "90/100",
    "continuous-improvement.yaml",
  ]) {
    if (!taskText.includes(term)) fail(`M16 task is missing ${term} binding`);
  }
  for (const term of [
    "two distinct consecutive",
    "missing source is unknown",
    "second occurrence",
    "all guardrails",
    "quarterly",
    "historical evidence",
  ]) {
    if (!runbook.toLowerCase().includes(term)) {
      fail(`continuous-improvement runbook is missing ${term}`);
    }
  }
  for (const source of providerSources.values()) {
    if (!adr.includes(source)) fail(`ADR is missing official source ${source}`);
  }

  const incomplete = candidateEvidence.checks.filter(
    (check) => check.status !== "passed",
  );
  if (candidateEvidence.status === "complete") {
    if (candidateEvidence.candidate.initialCloseApproved !== true) {
      fail("complete evidence requires initial close approval");
    }
    if (incomplete.length > 0) {
      fail(
        `complete evidence has non-passing checks: ${incomplete.map((item) => item.id).join(", ")}`,
      );
    }
    validateScore(candidateEvidence.score, "manifest score", true);
    const backlogObservedAt = exactUtc(
      candidateBacklog.observedAt,
      "completion backlog observedAt",
    );
    const manifestObservedAt = exactUtc(
      candidateEvidence.observedAt,
      "completion manifest observedAt",
    );
    if (backlogObservedAt > manifestObservedAt) {
      fail("completion backlog is newer than the manifest");
    }
    for (const item of candidateBacklog.items) {
      if (
        ["critical", "high"].includes(item.severity) &&
        item.status !== "complete"
      ) {
        if (
          !digestPattern.test(item.approvedRiskSha256 ?? "") ||
          /^0{64}$/u.test(item.approvedRiskSha256) ||
          exactUtc(item.nextReviewAt, `${item.id} next review`) <=
            manifestObservedAt
        ) {
          fail(`${item.id} is an unaccepted or overdue Critical/High item`);
        }
      }
    }
    if (m16.status !== "complete")
      fail("complete evidence requires complete M16 task");
    const presentModules = new Set();
    for (const task of candidateTasks.tasks ?? []) {
      if (moduleIds.has(task.module)) {
        presentModules.add(task.module);
        if (task.status !== "complete")
          fail(`${task.module} task remains incomplete`);
      }
    }
    exactSet(presentModules, moduleIds, "completed module tasks");

    const documents = new Map();
    const artifactDigests = new Set();
    const artifactPaths = new Set();
    const artifactShaById = {};
    for (const [prefix, artifactId, schema] of artifactBindings) {
      const artifactPath = candidateEvidence.artifacts[`${prefix}Path`];
      const artifactSha256 = candidateEvidence.artifacts[`${prefix}Sha256`];
      if (
        artifactDigests.has(artifactSha256) ||
        artifactPaths.has(artifactPath)
      ) {
        fail("M16 artifacts reuse one evidence path or digest");
      }
      artifactDigests.add(artifactSha256);
      artifactPaths.add(artifactPath);
      artifactShaById[artifactId] = artifactSha256;
      const document = artifactReader(artifactPath, artifactSha256, artifactId);
      if (document.schema !== schema) fail(`${artifactId} schema differs`);
      scanMinimized(document, artifactId);
      documents.set(artifactId, document);
    }
    const primary = validateMonthlyReview(
      documents.get("monthly-review-primary"),
      candidateEvidence.candidate,
      {
        planSha256: candidateEvidence.plan.sha256,
        backlogSha256: candidateEvidence.backlog.sha256,
      },
    );
    const repeat = validateMonthlyReview(
      documents.get("monthly-review-repeat"),
      candidateEvidence.candidate,
      {
        planSha256: candidateEvidence.plan.sha256,
        backlogSha256: candidateEvidence.backlog.sha256,
      },
    );
    if (repeat.index !== primary.index + 1) {
      fail("monthly reviews are not two distinct consecutive periods");
    }
    const quarterlyAt = validateQuarterlyBundle(
      documents.get("quarterly-exercise-bundle"),
      candidateEvidence.candidate,
      {
        planSha256: candidateEvidence.plan.sha256,
        backlogSha256: candidateEvidence.backlog.sha256,
      },
    );
    const reconciliationAt = validateReconciliation(
      documents.get("final-reconciliation"),
      candidateEvidence.candidate,
      {
        planSha256: candidateEvidence.plan.sha256,
        backlogSha256: candidateEvidence.backlog.sha256,
      },
    );
    const approvalAt = validateApproval(
      documents.get("approval-record"),
      candidateEvidence.candidate,
      Object.fromEntries(
        Object.entries(artifactShaById).filter(
          ([id]) => id !== "approval-record",
        ),
      ),
    );
    const manifestAt = manifestObservedAt;
    if (
      quarterlyAt < repeat.observedAt ||
      reconciliationAt < quarterlyAt ||
      approvalAt < reconciliationAt ||
      manifestAt < approvalAt
    ) {
      fail("M16 artifact chronology is invalid");
    }
  } else {
    if (m16.status !== "in_progress") {
      fail("in-progress evidence must match in-progress M16 task");
    }
    if (candidateEvidence.candidate.initialCloseApproved !== false) {
      fail("in-progress evidence cannot carry close approval");
    }
    for (const [prefix] of artifactBindings) {
      if (
        candidateEvidence.artifacts[`${prefix}Path`] !== null ||
        candidateEvidence.artifacts[`${prefix}Sha256`] !== null
      ) {
        fail("in-progress evidence cannot bind unvalidated closeout artifacts");
      }
    }
  }
  return { incomplete };
}

function jsonBinding(document) {
  const raw = JSON.stringify(document);
  return { raw, sha256: digest(raw) };
}

function completionFixture() {
  const fixtureEvidence = structuredClone(evidence);
  const fixtureTasks = structuredClone(tasks);
  const fixtureBacklog = structuredClone(backlog);
  fixtureEvidence.status = "complete";
  fixtureEvidence.observedAt = "2026-10-03T00:05:00Z";
  fixtureEvidence.candidate.initialCloseApproved = true;
  fixtureBacklog.observedAt = "2026-09-30T00:00:00Z";
  fixtureBacklog.items.forEach((item, index) => {
    if (
      ["critical", "high"].includes(item.severity) &&
      item.status !== "complete"
    ) {
      item.approvedRiskSha256 = (index + 1).toString(16).repeat(64);
      item.nextReviewAt = "2026-10-15T00:00:00Z";
    }
  });
  for (const check of fixtureEvidence.checks) {
    check.status = "passed";
    check.evidence =
      "Verified distinct digest-bound evidence satisfies this mandatory continuous-improvement result.";
  }
  for (const category of fixtureEvidence.score.categories) {
    category.score = category.weight;
  }
  fixtureEvidence.score.total = 100;
  for (const task of fixtureTasks.tasks ?? []) {
    if (moduleIds.has(task.module)) task.status = "complete";
  }

  const makeSections = (sourceObservedAt) =>
    [...reviewSections].map((id, index) => ({
      id,
      sourceFresh: true,
      sourceSha256: (index + 1).toString(16).repeat(64),
      sourceObservedAt,
      baseline: 10,
      observed: 11,
      target: 12,
      disposition:
        "Reviewed against the exact source and assigned no unresolved follow-up.",
    }));
  const makeProviders = (reviewedAt) =>
    [...providerSources].map(([id, source]) => ({
      id,
      source,
      reviewedAt,
      observedVersionOrEntry: "review-cutoff-entry",
      impact: "none",
      ownerRole: "engineering",
      disposition:
        "Official changes were reviewed and require no candidate change for this period.",
    }));
  const monthlyPrimary = {
    schema: "starfiniti.monthly-improvement-review.v1",
    period: "2026-07",
    observedAt: "2026-08-05T00:00:00Z",
    candidateCommit: fixtureEvidence.candidate.commit,
    planSha256: fixtureEvidence.plan.sha256,
    backlogSha256: fixtureEvidence.backlog.sha256,
    reviewerRole: "product-reviewer",
    sections: makeSections("2026-08-01T00:00:00Z"),
    providers: makeProviders("2026-08-04T00:00:00Z"),
    materiallyChangedModules: ["M10"],
    moduleRescores: [
      {
        id: "M10",
        previousTotal: 90,
        currentTotal: 92,
        evidenceSha256: "1".repeat(64),
      },
    ],
    failures: [
      {
        fingerprint: "queue-lease-timeout",
        occurrences: 2,
        controls: [
          {
            type: "regressionTest",
            reference: "packages/domain/test/queue.test.ts",
          },
        ],
      },
    ],
    experiments: [
      {
        id: "activation-copy",
        primaryMetric: "activation-rate",
        declarationSha256: "e".repeat(64),
        direction: "maximize",
        baseline: 10,
        target: 11,
        observed: 12,
        guardrails: [{ id: "support", passed: true }],
        decision: "promoted",
      },
    ],
  };
  const monthlyRepeat = structuredClone(monthlyPrimary);
  monthlyRepeat.period = "2026-08";
  monthlyRepeat.observedAt = "2026-09-05T00:00:00Z";
  monthlyRepeat.sections = makeSections("2026-09-01T00:00:00Z");
  monthlyRepeat.providers = makeProviders("2026-09-04T00:00:00Z");
  monthlyRepeat.materiallyChangedModules = [];
  monthlyRepeat.moduleRescores = [];
  monthlyRepeat.failures = [];
  monthlyRepeat.experiments = [];
  const differences = Object.fromEntries(
    [...differenceFields].map((id) => [id, 0]),
  );
  const quarterlyBundle = {
    schema: "starfiniti.quarterly-exercise-bundle.v1",
    quarter: "2026-Q3",
    observedAt: "2026-10-01T00:00:00Z",
    candidateCommit: fixtureEvidence.candidate.commit,
    planSha256: fixtureEvidence.plan.sha256,
    backlogSha256: fixtureEvidence.backlog.sha256,
    exercises: [...exerciseIds].map((id, index) => ({
      id,
      status: "passed",
      sourceCoverageRatio: 1,
      startedAt: "2026-09-29T00:00:00Z",
      endedAt: "2026-09-29T01:00:00Z",
      approvalSha256: (index + 7).toString(16).repeat(64),
      environmentSha256: (index + 8).toString(16).repeat(64),
      inputSha256: (index + 9).toString(16).repeat(64),
      ownerRole: "exercise-owner",
      reportSha256: (index + 2).toString(16).repeat(64),
      differences,
    })),
  };
  const categories = [...scoreWeights].map(([id, weight]) => ({
    id,
    weight,
    score: weight,
  }));
  const finalReconciliation = {
    schema: "starfiniti.improvement-reconciliation.v1",
    observedAt: "2026-10-02T00:00:00Z",
    candidateCommit: fixtureEvidence.candidate.commit,
    planSha256: fixtureEvidence.plan.sha256,
    backlogSha256: fixtureEvidence.backlog.sha256,
    dueReviewGaps: 0,
    providerStale: 0,
    overdueCriticalHigh: 0,
    recurringWithoutControl: 0,
    unrescoredMaterialChanges: 0,
    promotedExperimentGuardrailFailures: 0,
    exerciseDifferences: 0,
    livingDocumentDrift: 0,
    unresolvedCritical: 0,
    unresolvedHigh: 0,
    moduleScore: {
      total: 100,
      target: 90,
      minimumCategoryRatio: 0.8,
      categories,
    },
    moduleScores: [...moduleIds].map((id) => ({
      id,
      total: 100,
      minimumCategoryRatioObserved: 1,
    })),
  };
  const approvalRecord = {
    schema: "starfiniti.improvement-approval-record.v1",
    observedAt: "2026-10-03T00:00:00Z",
    candidateCommit: fixtureEvidence.candidate.commit,
    independentReview: true,
    schedulesActive: true,
    nextMonthlyReviewAt: "2026-10-10T00:00:00Z",
    nextQuarterlyExerciseAt: "2027-01-10T00:00:00Z",
    artifactSha256: {},
    approvals: [...approvalRoles].map((id, index) => ({
      id,
      approved: true,
      evidenceSha256: (index + 8).toString(16).repeat(64),
    })),
  };
  const documents = new Map([
    ["monthly-review-primary", monthlyPrimary],
    ["monthly-review-repeat", monthlyRepeat],
    ["quarterly-exercise-bundle", quarterlyBundle],
    ["final-reconciliation", finalReconciliation],
    ["approval-record", approvalRecord],
  ]);
  const rebindArtifacts = () => {
    const fixtureBacklogRaw = YAML.stringify(fixtureBacklog);
    fixtureEvidence.backlog.sha256 = digest(fixtureBacklogRaw);
    for (const document of [monthlyPrimary, monthlyRepeat, quarterlyBundle]) {
      document.planSha256 = fixtureEvidence.plan.sha256;
      document.backlogSha256 = fixtureEvidence.backlog.sha256;
    }
    finalReconciliation.planSha256 = fixtureEvidence.plan.sha256;
    finalReconciliation.backlogSha256 = fixtureEvidence.backlog.sha256;
    approvalRecord.artifactSha256 = {};
    for (const [prefix, artifactId] of artifactBindings.slice(0, -1)) {
      const binding = jsonBinding(documents.get(artifactId));
      fixtureEvidence.artifacts[`${prefix}Path`] =
        `docs/plan/evidence/M16/runs/${artifactId}-fixture.json`;
      fixtureEvidence.artifacts[`${prefix}Sha256`] = binding.sha256;
      approvalRecord.artifactSha256[artifactId] = binding.sha256;
    }
    const [approvalPrefix, approvalId] = artifactBindings.at(-1);
    const approvalBinding = jsonBinding(approvalRecord);
    fixtureEvidence.artifacts[`${approvalPrefix}Path`] =
      `docs/plan/evidence/M16/runs/${approvalId}-fixture.json`;
    fixtureEvidence.artifacts[`${approvalPrefix}Sha256`] =
      approvalBinding.sha256;
  };
  rebindArtifacts();
  const artifactReader = (path, expectedDigest, artifactId) => {
    safeArtifactPath(path, artifactId);
    const document = documents.get(artifactId);
    const raw = JSON.stringify(document);
    if (!document || digest(raw) !== expectedDigest) {
      fail(`${artifactId} fixture digest differs`);
    }
    return JSON.parse(raw);
  };
  return {
    fixtureEvidence,
    fixtureTasks,
    fixtureBacklog,
    documents,
    rebindArtifacts,
    artifactReader,
    getBacklogRaw: () => YAML.stringify(fixtureBacklog),
  };
}

const result = validateDocument(evidence);

if (process.argv.includes("--self-test")) {
  const expectRejected = (label, expectedMessage, mutate, rebind = true) => {
    const fixture = completionFixture();
    mutate(fixture);
    if (rebind) fixture.rebindArtifacts();
    try {
      validateDocument(
        fixture.fixtureEvidence,
        plan,
        fixture.fixtureBacklog,
        fixture.fixtureTasks,
        fixture.artifactReader,
        planRaw,
        fixture.getBacklogRaw(),
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes(expectedMessage))
        return;
      throw error;
    }
    fail(`self-test accepted ${label}`);
  };

  const positive = completionFixture();
  validateDocument(
    positive.fixtureEvidence,
    plan,
    positive.fixtureBacklog,
    positive.fixtureTasks,
    positive.artifactReader,
    planRaw,
    positive.getBacklogRaw(),
  );
  expectRejected(
    "pending completion check",
    "complete evidence has non-passing checks",
    ({ fixtureEvidence }) => {
      fixtureEvidence.checks[0].status = "pending";
    },
  );
  expectRejected(
    "nonconsecutive monthly review",
    "not two distinct consecutive periods",
    ({ documents }) => {
      documents.get("monthly-review-repeat").period = "2026-09";
      documents.get("monthly-review-repeat").observedAt =
        "2026-10-05T00:00:00Z";
    },
  );
  expectRejected(
    "stale monthly source",
    "section is incomplete or stale",
    ({ documents }) => {
      documents.get("monthly-review-primary").sections[0].sourceFresh = false;
    },
  );
  expectRejected(
    "missing provider",
    "providers differs from the required closed set",
    ({ documents }) => {
      documents.get("monthly-review-primary").providers.pop();
    },
  );
  expectRejected(
    "stale provider review",
    "provider review is incomplete",
    ({ documents }) => {
      documents.get("monthly-review-primary").providers[0].reviewedAt =
        "2026-06-30T23:59:59Z";
    },
  );
  expectRejected(
    "late quarterly bundle",
    "outside its thirty-day close window",
    ({ documents }) => {
      documents.get("quarterly-exercise-bundle").observedAt =
        "2026-11-01T00:00:00Z";
    },
  );
  expectRejected(
    "unaccepted Critical backlog item",
    "is an unaccepted or overdue Critical/High item",
    ({ fixtureBacklog }) => {
      delete fixtureBacklog.items[0].approvedRiskSha256;
    },
  );
  expectRejected(
    "inflated backlog priority",
    "backlog score differs",
    ({ fixtureBacklog }) => {
      fixtureBacklog.items[0].score += 1;
    },
  );
  expectRejected(
    "recurring failure without control",
    "recurred without a durable control",
    ({ documents }) => {
      documents.get("monthly-review-primary").failures[0].controls = [];
    },
  );
  expectRejected(
    "unrescored material change",
    "material change was not rescored",
    ({ documents }) => {
      documents.get("monthly-review-primary").moduleRescores = [];
    },
  );
  expectRejected(
    "failed experiment guardrail",
    "promoted without improvement and passing guardrails",
    ({ documents }) => {
      documents.get(
        "monthly-review-primary",
      ).experiments[0].guardrails[0].passed = false;
    },
  );
  expectRejected(
    "nonzero quarterly privacy difference",
    "privacy difference is nonzero",
    ({ documents }) => {
      documents.get(
        "quarterly-exercise-bundle",
      ).exercises[0].differences.privacy = 1;
    },
  );
  expectRejected(
    "module below score floor",
    "M10 final module score or category floor is invalid",
    ({ documents }) => {
      documents
        .get("final-reconciliation")
        .moduleScores.find((item) => item.id === "M10").total = 89;
    },
  );
  expectRejected(
    "reused artifact digest",
    "artifacts reuse one evidence path or digest",
    ({ fixtureEvidence }) => {
      fixtureEvidence.artifacts.approvalRecordSha256 =
        fixtureEvidence.artifacts.finalReconciliationSha256;
    },
    false,
  );
  expectRejected(
    "unsafe artifact path",
    "artifact path is unsafe",
    ({ fixtureEvidence }) => {
      fixtureEvidence.artifacts.monthlyReviewPrimaryPath =
        "../monthly-review-primary-fixture.json";
    },
    false,
  );
  expectRejected(
    "approval not bound to reviewed artifacts",
    "approval artifact binding differs",
    ({ fixtureEvidence, documents }) => {
      const approval = documents.get("approval-record");
      approval.artifactSha256["final-reconciliation"] = "f".repeat(64);
      fixtureEvidence.artifacts.approvalRecordSha256 = digest(
        JSON.stringify(approval),
      );
    },
    false,
  );
  expectRejected(
    "missing owner approval",
    "improvement approvals differs from the required closed set",
    ({ documents }) => {
      documents.get("approval-record").approvals.pop();
    },
  );
  expectRejected(
    "incomplete prerequisite module",
    "M10 task remains incomplete",
    ({ fixtureTasks }) => {
      fixtureTasks.tasks.find((task) => task.module === "M10").status =
        "in_progress";
    },
  );
}

console.log(
  `Validated ${evidence.checks.length} M16 checks and ${backlog.items.length} ranked backlog items; score ${evidence.score.total}/100 with ${evidence.checks.filter((check) => check.status === "passed").length} passed, ${result.incomplete.length} pending or failed.`,
);
