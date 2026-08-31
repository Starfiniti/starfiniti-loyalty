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
  closeoutAdr:
    "docs/architecture/ADR/0113-closed-minimized-continuous-improvement-artifacts.md",
};
const readText = (relativePath) =>
  readFileSync(join(root, relativePath), "utf8");
const evidence = YAML.parse(readText(paths.evidence));
const plan = YAML.parse(readText(paths.plan));
const backlog = YAML.parse(readText(paths.backlog));
const tasks = YAML.parse(readText(paths.tasks));
const runbook = readText(paths.runbook);
const adr = readText(paths.adr);
const closeoutAdr = readText(paths.closeoutAdr);
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
  ["supabase", "https://supabase.com/changelog.md"],
  ["postgresql", "https://www.postgresql.org/support/versioning/"],
  ["woocommerce", "https://developer.woocommerce.com/changelog/"],
  ["stripe", "https://docs.stripe.com/changelog"],
  ["authentik", "https://docs.goauthentik.io/releases/"],
  ["klaviyo", "https://developers.klaviyo.com/en/docs/changelog_"],
  ["nodejs", "https://nodejs.org/en/about/previous-releases"],
  ["rsync", "https://download.samba.org/pub/rsync/NEWS"],
  ["borgbackup", "https://borgbackup.readthedocs.io/en/stable/changes.html"],
  ["openssh", "https://www.openssh.com/releasenotes.html"],
  ["debian", "https://www.debian.org/security/"],
  ["ubuntu", "https://ubuntu.com/security/notices"],
  ["proxmox", "https://forum.proxmox.com/forums/security-advisories.26/"],
]);
const recoverySourceEndpoints = new Map([
  ["rsync", new Set(["proxmox-host", "database-guest"])],
  ["borgbackup", new Set(["proxmox-host"])],
  ["openssh", new Set(["proxmox-host", "database-guest"])],
  ["debian", new Set(["proxmox-host"])],
  ["ubuntu", new Set(["database-guest"])],
  ["proxmox", new Set(["proxmox-host"])],
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
const requiredBacklogEvidence = new Map([
  ["IMP-001", "docs/plan/evidence/M01/production-pilot.yaml"],
  ["IMP-002", "docs/plan/evidence/M15/operations.yaml"],
  ["IMP-003", "docs/plan/evidence/M15/recovery.yaml"],
  ["IMP-004", "docs/plan/evidence/M15/security.yaml"],
  ["IMP-005", "docs/plan/evidence/M15/ga-canary.yaml"],
  ["IMP-006", "docs/plan/evidence/M14/managed-billing-canary.yaml"],
  ["IMP-007", "docs/plan/evidence/M13/enterprise-identity-canary.yaml"],
  ["IMP-008", "docs/plan/evidence/M08/notification-canary.yaml"],
  [
    "IMP-009",
    "docs/plan/evidence/M01/backup-transfer-amplification-2026-08-14.md",
  ],
  ["IMP-010", "docs/plan/evidence/M16/rsync-source-security.yaml"],
  ["IMP-011", "infrastructure/governance/proxmox-security-update-plan.yaml"],
  ["IMP-012", "infrastructure/governance/next-runtime-review.yaml"],
  ["IMP-013", "docs/plan/evidence/M15/capacity.yaml"],
  ["IMP-014", "docs/plan/evidence/M15/fault-injection.yaml"],
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
const artifactKeys = {
  monthlyReview: new Set([
    "schema",
    "period",
    "observedAt",
    "candidateCommit",
    "planSha256",
    "backlogSha256",
    "reviewerRole",
    "sections",
    "providers",
    "materiallyChangedModules",
    "moduleRescores",
    "failures",
    "experiments",
  ]),
  monthlySection: new Set([
    "id",
    "sourceFresh",
    "sourceSha256",
    "sourceObservedAt",
    "baseline",
    "observed",
    "target",
    "disposition",
  ]),
  provider: new Set([
    "id",
    "source",
    "reviewedAt",
    "observedVersionOrEntry",
    "impact",
    "ownerRole",
    "disposition",
  ]),
  recoveryProvider: new Set([
    "id",
    "source",
    "reviewedAt",
    "observedVersionOrEntry",
    "impact",
    "ownerRole",
    "disposition",
    "installed",
    "candidateVersionOrEntry",
    "candidateProvenanceSha256",
  ]),
  installedProvider: new Set(["id", "versionOrRelease", "provenanceSha256"]),
  moduleRescore: new Set([
    "id",
    "previousTotal",
    "currentTotal",
    "evidenceSha256",
  ]),
  failure: new Set(["fingerprint", "occurrences", "controls"]),
  control: new Set(["type", "reference"]),
  experiment: new Set([
    "id",
    "primaryMetric",
    "declarationSha256",
    "direction",
    "baseline",
    "target",
    "observed",
    "guardrails",
    "decision",
  ]),
  guardrail: new Set(["id", "passed"]),
  quarterlyBundle: new Set([
    "schema",
    "quarter",
    "observedAt",
    "candidateCommit",
    "planSha256",
    "backlogSha256",
    "exercises",
  ]),
  exercise: new Set([
    "id",
    "status",
    "sourceCoverageRatio",
    "startedAt",
    "endedAt",
    "approvalSha256",
    "environmentSha256",
    "inputSha256",
    "ownerRole",
    "reportSha256",
    "differences",
  ]),
  reconciliation: new Set([
    "schema",
    "observedAt",
    "candidateCommit",
    "planSha256",
    "backlogSha256",
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
    "moduleScore",
    "moduleScores",
  ]),
  completionScore: new Set([
    "total",
    "target",
    "minimumCategoryRatio",
    "categories",
  ]),
  scoreCategory: new Set(["id", "weight", "score"]),
  moduleScore: new Set(["id", "total", "minimumCategoryRatioObserved"]),
  approval: new Set([
    "schema",
    "observedAt",
    "candidateCommit",
    "independentReview",
    "schedulesActive",
    "nextMonthlyReviewAt",
    "nextQuarterlyExerciseAt",
    "artifactSha256",
    "approvals",
  ]),
  approvalEntry: new Set(["id", "approved", "evidenceSha256"]),
};
const digestPattern = /^[a-f0-9]{64}$/u;
const commitPattern = /^[a-f0-9]{40}$/u;
const minimumArtifactBytes = 2;
const maximumArtifactBytes = 256 * 1024;
const maximumArtifactStringCodeUnits = 4096;
const maximumArtifactArrayItems = 100;
const rolePattern = /^[a-z][a-z0-9-]{4,63}$/u;
const identifierPattern = /^[a-z0-9][a-z0-9._:-]{2,127}$/u;
const prohibitedNormalizedKeys = new Set([
  "address",
  "cookie",
  "coupon",
  "customeremail",
  "customerid",
  "email",
  "firstname",
  "fullname",
  "hostname",
  "ipaddress",
  "lastname",
  "memberemail",
  "memberid",
  "password",
  "phone",
  "providerpayload",
  "receiverdestination",
  "route",
  "secret",
  "tenantemail",
  "tenantid",
  "token",
  "username",
]);
const prohibitedKeySuffixes = [
  "cookie",
  "email",
  "password",
  "phone",
  "secret",
  "token",
];
const prohibitedValuePatterns = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu,
  /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{8,}\b/u,
  /\bwhsec_[A-Za-z0-9]{8,}\b/u,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /\bgh[opsu]_[A-Za-z0-9]{20,}\b/u,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/u,
  /\bglpat-[A-Za-z0-9_-]{20,}\b/u,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/u,
  /\b(?:Basic|Bearer)\s+[A-Za-z0-9+/_=-]{16,}\b/iu,
  /\b(?:xox[baprs]-[A-Za-z0-9-]{16,}|SG\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{20,})\b/u,
  /\bASIA[0-9A-Z]{16}\b/u,
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/iu,
  /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password|passwd|pwd)\s*[:=]\s*["']?[A-Za-z0-9+/_=.-]{8,}/iu,
];

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

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  exactSet(new Set(Object.keys(value)), expected, `${label} keys`);
}

function exactText(
  value,
  label,
  minimum = 1,
  maximum = maximumArtifactStringCodeUnits,
) {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length < minimum ||
    value.length > maximum ||
    /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/u.test(
      value,
    )
  ) {
    fail(`${label} is not bounded minimized text`);
  }
  return value;
}

function exactRole(value, label) {
  exactText(value, label, 5, 64);
  if (!rolePattern.test(value)) fail(`${label} is not a minimized role slug`);
  return value;
}

function exactIdentifier(value, label, minimum = 3) {
  exactText(value, label, minimum, 128);
  if (!identifierPattern.test(value)) {
    fail(`${label} is not a minimized stable identifier`);
  }
  return value;
}

function exactMetric(value, label) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail(`${label} must be finite`);
    return value;
  }
  return exactText(value, label, 1, 512);
}

function boundedArray(value, label, maximum, allowEmpty = true) {
  if (
    !Array.isArray(value) ||
    (!allowEmpty && value.length === 0) ||
    value.length > maximum
  ) {
    fail(`${label} is not a bounded array`);
  }
  return value;
}

function optionalUniqueIds(items, label, maximum) {
  boundedArray(items, label, maximum);
  const ids = new Set();
  for (const item of items) {
    if (!item || typeof item.id !== "string" || ids.has(item.id)) {
      fail(`${label} contains a missing or duplicate id`);
    }
    ids.add(item.id);
  }
  return ids;
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
      status.size < minimumArtifactBytes ||
      status.size > maximumArtifactBytes
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
    const finalStatus = fstatSync(descriptor);
    const finalLinkStatus = lstatSync(absolute);
    if (
      finalStatus.dev !== status.dev ||
      finalStatus.ino !== status.ino ||
      finalStatus.size !== status.size ||
      !finalLinkStatus.isFile() ||
      finalStatus.dev !== finalLinkStatus.dev ||
      finalStatus.ino !== finalLinkStatus.ino
    ) {
      fail(`${artifactId} changed identity while reading`);
    }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  const text = raw.toString("utf8");
  if (!raw.equals(Buffer.from(text, "utf8"))) {
    fail(`${artifactId} is not strict UTF-8`);
  }
  if (digest(raw) !== expectedDigest) fail(`${artifactId} digest differs`);
  return JSON.parse(text);
}

function scanMinimized(value, label, path = "$") {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      scanMinimized(item, label, `${path}[${index}]`),
    );
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/gu, "");
      if (
        prohibitedNormalizedKeys.has(normalizedKey) ||
        prohibitedKeySuffixes.some((suffix) => normalizedKey.endsWith(suffix))
      ) {
        fail(`${label} contains prohibited key ${path}.${key}`);
      }
      scanMinimized(child, label, `${path}.${key}`);
    }
    return;
  }
  if (typeof value === "string") {
    exactText(value, `${label} ${path}`, 1, 4096);
    if (prohibitedValuePatterns.some((pattern) => pattern.test(value))) {
      fail(`${label} contains prohibited personal or credential material`);
    }
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
  exactSet(
    uniqueIds(candidateBacklog.items, "backlog items"),
    new Set(requiredBacklogEvidence.keys()),
    "current backlog items",
  );
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
    if (item.evidence !== requiredBacklogEvidence.get(item.id)) {
      fail(`${item.id}.evidence differs from its required exact gate`);
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
  exactKeys(document, artifactKeys.monthlyReview, "monthly review");
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
    document.backlogSha256 !== bindings.backlogSha256
  ) {
    fail(`${document.period} candidate governance or reviewer binding differs`);
  }
  exactRole(document.reviewerRole, `${document.period} reviewerRole`);
  exactSet(
    uniqueIds(document.sections, `${document.period} sections`),
    reviewSections,
    `${document.period} sections`,
  );
  for (const section of document.sections) {
    exactKeys(
      section,
      artifactKeys.monthlySection,
      `${document.period}.${section.id} section`,
    );
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
      ) > observedAt
    ) {
      fail(`${document.period}.${section.id} section is incomplete or stale`);
    }
    exactMetric(section.baseline, `${document.period}.${section.id} baseline`);
    exactMetric(section.observed, `${document.period}.${section.id} observed`);
    exactMetric(section.target, `${document.period}.${section.id} target`);
    exactText(
      section.disposition,
      `${document.period}.${section.id} disposition`,
      20,
      2048,
    );
  }
  exactSet(
    uniqueIds(document.providers, `${document.period} providers`),
    new Set(providerSources.keys()),
    `${document.period} providers`,
  );
  for (const provider of document.providers) {
    const requiredEndpoints = recoverySourceEndpoints.get(provider.id);
    exactKeys(
      provider,
      requiredEndpoints ? artifactKeys.recoveryProvider : artifactKeys.provider,
      `${document.period}.${provider.id} provider`,
    );
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
      ].includes(provider.impact)
    ) {
      fail(`${document.period}.${provider.id} provider review is incomplete`);
    }
    exactText(
      provider.observedVersionOrEntry,
      `${document.period}.${provider.id} observedVersionOrEntry`,
      4,
      256,
    );
    exactRole(
      provider.ownerRole,
      `${document.period}.${provider.id} ownerRole`,
    );
    exactText(
      provider.disposition,
      `${document.period}.${provider.id} disposition`,
      20,
      2048,
    );
    if (requiredEndpoints) {
      exactSet(
        uniqueIds(
          provider.installed,
          `${document.period}.${provider.id} installed endpoints`,
        ),
        requiredEndpoints,
        `${document.period}.${provider.id} installed endpoints`,
      );
      for (const installed of provider.installed) {
        exactKeys(
          installed,
          artifactKeys.installedProvider,
          `${document.period}.${provider.id}.${installed.id} installed evidence`,
        );
        if (
          !digestPattern.test(installed.provenanceSha256 ?? "") ||
          /^0{64}$/u.test(installed.provenanceSha256)
        ) {
          fail(
            `${document.period}.${provider.id}.${installed.id} installed evidence is incomplete`,
          );
        }
        exactText(
          installed.versionOrRelease,
          `${document.period}.${provider.id}.${installed.id} versionOrRelease`,
          4,
          256,
        );
      }
      if (
        !digestPattern.test(provider.candidateProvenanceSha256 ?? "") ||
        /^0{64}$/u.test(provider.candidateProvenanceSha256)
      ) {
        fail(
          `${document.period}.${provider.id} candidate evidence is incomplete`,
        );
      }
      exactText(
        provider.candidateVersionOrEntry,
        `${document.period}.${provider.id} candidateVersionOrEntry`,
        4,
        256,
      );
    }
  }
  boundedArray(
    document.materiallyChangedModules,
    `${document.period} materially changed modules`,
    moduleIds.size,
  );
  const material = new Set(document.materiallyChangedModules);
  if (
    material.size !== document.materiallyChangedModules.length ||
    [...material].some((id) => !moduleIds.has(id))
  ) {
    fail(`${document.period} materially changed modules are invalid`);
  }
  const rescored = optionalUniqueIds(
    document.moduleRescores,
    `${document.period} module rescores`,
    moduleIds.size,
  );
  for (const id of material) {
    if (!rescored.has(id))
      fail(`${document.period}.${id} material change was not rescored`);
  }
  for (const rescore of document.moduleRescores) {
    exactKeys(
      rescore,
      artifactKeys.moduleRescore,
      `${document.period}.${rescore.id} module rescore`,
    );
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
  boundedArray(document.failures, `${document.period} failures`, 100);
  const failureFingerprints = new Set();
  for (const failure of document.failures) {
    exactKeys(failure, artifactKeys.failure, `${document.period} failure`);
    if (
      failureFingerprints.has(failure.fingerprint) ||
      !Number.isInteger(failure.occurrences) ||
      failure.occurrences < 1 ||
      failure.occurrences > 1_000
    ) {
      fail(`${document.period} failure inventory is invalid`);
    }
    failureFingerprints.add(failure.fingerprint);
    exactIdentifier(
      failure.fingerprint,
      `${document.period} failure fingerprint`,
      12,
    );
    boundedArray(failure.controls, `${failure.fingerprint} controls`, 10);
    if (failure.occurrences >= 2 && failure.controls.length < 1) {
      fail(`${failure.fingerprint} recurred without a durable control`);
    }
    const controlKeys = new Set();
    for (const control of failure.controls) {
      exactKeys(
        control,
        artifactKeys.control,
        `${failure.fingerprint} control`,
      );
      const controlKey = `${control.type}:${control.reference}`;
      if (!allowedControls.has(control.type) || controlKeys.has(controlKey)) {
        fail(`${failure.fingerprint} durable control is invalid`);
      }
      controlKeys.add(controlKey);
      exactText(
        control.reference,
        `${failure.fingerprint} control reference`,
        8,
        512,
      );
    }
  }
  optionalUniqueIds(
    document.experiments,
    `${document.period} experiments`,
    100,
  );
  for (const experiment of document.experiments) {
    exactKeys(
      experiment,
      artifactKeys.experiment,
      `${document.period}.${experiment.id} experiment`,
    );
    if (
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
    exactIdentifier(experiment.id, `${document.period} experiment id`, 3);
    exactIdentifier(
      experiment.primaryMetric,
      `${experiment.id} primary metric`,
      5,
    );
    boundedArray(
      experiment.guardrails,
      `${experiment.id} guardrails`,
      20,
      false,
    );
    const guardrailIds = uniqueIds(
      experiment.guardrails,
      `${experiment.id} guardrails`,
    );
    for (const guardrail of experiment.guardrails) {
      exactKeys(
        guardrail,
        artifactKeys.guardrail,
        `${experiment.id}.${guardrail.id} guardrail`,
      );
      exactIdentifier(guardrail.id, `${experiment.id} guardrail id`, 3);
    }
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
  exactKeys(document, artifactKeys.quarterlyBundle, "quarterly bundle");
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
    exactKeys(
      exercise,
      artifactKeys.exercise,
      `${exercise.id} quarterly exercise`,
    );
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
      !digestPattern.test(exercise.reportSha256) ||
      /^0{64}$/u.test(exercise.reportSha256) ||
      reportDigests.has(exercise.reportSha256)
    ) {
      fail(`${exercise.id} quarterly exercise is incomplete or reused`);
    }
    exactRole(exercise.ownerRole, `${exercise.id} ownerRole`);
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
  exactKeys(document, artifactKeys.reconciliation, "final reconciliation");
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
  exactKeys(
    document.moduleScore,
    artifactKeys.completionScore,
    "M16 completion score",
  );
  boundedArray(
    document.moduleScore.categories,
    "M16 completion score categories",
    scoreWeights.size,
    false,
  );
  for (const category of document.moduleScore.categories) {
    exactKeys(
      category,
      artifactKeys.scoreCategory,
      `M16 completion score ${category.id}`,
    );
  }
  validateScore(document.moduleScore, "M16 completion score", true);
  exactSet(
    uniqueIds(document.moduleScores, "final module scores"),
    moduleIds,
    "final module scores",
  );
  for (const moduleScore of document.moduleScores) {
    exactKeys(
      moduleScore,
      artifactKeys.moduleScore,
      `${moduleScore.id} final module score`,
    );
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
  exactKeys(document, artifactKeys.approval, "approval record");
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
    exactKeys(approval, artifactKeys.approvalEntry, `${approval.id} approval`);
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
    const requiredEndpoints = recoverySourceEndpoints.get(provider.id);
    if (requiredEndpoints) {
      if (
        !Array.isArray(provider.installedEndpoints) ||
        provider.installedEndpoints.length !== requiredEndpoints.size ||
        provider.installedEndpoints.some(
          (endpoint) => typeof endpoint !== "string",
        )
      ) {
        fail(`${provider.id} installed endpoint requirements are invalid`);
      }
      exactSet(
        new Set(provider.installedEndpoints),
        requiredEndpoints,
        `${provider.id} installed endpoint requirements`,
      );
      if (provider.requiresCandidateProvenanceSha256 !== true) {
        fail(`${provider.id} candidate provenance requirement differs`);
      }
    } else if (
      provider.installedEndpoints !== undefined ||
      provider.requiresCandidateProvenanceSha256 !== undefined
    ) {
      fail(`${provider.id} unexpected recovery requirements`);
    }
  }
  const snapshotPolicy = candidatePlan.providerSourceSnapshot;
  if (
    snapshotPolicy?.schema !== "starfiniti.provider-source-snapshot.v1" ||
    snapshotPolicy.catalogueCount !== providerSources.size ||
    snapshotPolicy.timeoutMs !== 20_000 ||
    snapshotPolicy.maximumRedirects !== 5 ||
    snapshotPolicy.maximumResponseBytes !== 4_000_000 ||
    snapshotPolicy.maximumHeaderBytes !== 32_768 ||
    snapshotPolicy.minimumTlsVersion !== "TLSv1.2" ||
    snapshotPolicy.contentRetained !== false ||
    snapshotPolicy.reviewComplete !== false ||
    snapshotPolicy.impactClassified !== false ||
    snapshotPolicy.installedEvidenceComplete !== false ||
    snapshotPolicy.output?.absolutePathRequired !== true ||
    snapshotPolicy.output.extension !== ".json" ||
    snapshotPolicy.output.overwrite !== false ||
    snapshotPolicy.output.mode !== "0600"
  ) {
    fail("provider source snapshot policy differs");
  }
  exactSet(
    new Set(snapshotPolicy.acceptedContentTypes ?? []),
    new Set(["text/html", "text/plain", "text/markdown"]),
    "provider source snapshot content types",
  );
  if (snapshotPolicy.acceptedContentTypes.length !== 3) {
    fail("provider source snapshot content types contain a duplicate");
  }
  exactSet(
    new Set(snapshotPolicy.acceptedContentEncodings ?? []),
    new Set(["identity"]),
    "provider source snapshot content encodings",
  );
  if (snapshotPolicy.acceptedContentEncodings.length !== 1) {
    fail("provider source snapshot content encodings contain a duplicate");
  }
  exactSet(
    new Set(Object.keys(snapshotPolicy.allowedRedirectHosts ?? {})),
    new Set(["openssh"]),
    "provider source snapshot redirect providers",
  );
  exactSet(
    new Set(snapshotPolicy.allowedRedirectHosts.openssh ?? []),
    new Set(["www.openssh.org"]),
    "provider source snapshot OpenSSH redirect hosts",
  );
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
  const schemaPolicy = candidatePlan.artifacts.schemaPolicy;
  exactKeys(
    schemaPolicy,
    new Set([
      "objectMembers",
      "minimumArtifactBytes",
      "maximumArtifactBytes",
      "maximumStringCodeUnits",
      "maximumArrayItems",
      "rejectLeadingOrTrailingWhitespace",
      "rejectControlOrBidirectionalText",
      "rejectMachineDetectablePersonalOrCredentialMaterial",
      "strictUtf8",
      "stableNoFollowRead",
      "reviewerIdentity",
      "privateInputs",
      "extensionRequires",
    ]),
    "closeout artifact schema policy",
  );
  if (
    schemaPolicy.objectMembers !== "closed" ||
    schemaPolicy.minimumArtifactBytes !== minimumArtifactBytes ||
    schemaPolicy.maximumArtifactBytes !== maximumArtifactBytes ||
    schemaPolicy.maximumStringCodeUnits !== maximumArtifactStringCodeUnits ||
    schemaPolicy.maximumArrayItems !== maximumArtifactArrayItems ||
    schemaPolicy.rejectLeadingOrTrailingWhitespace !== true ||
    schemaPolicy.rejectControlOrBidirectionalText !== true ||
    schemaPolicy.rejectMachineDetectablePersonalOrCredentialMaterial !== true ||
    schemaPolicy.strictUtf8 !== true ||
    schemaPolicy.stableNoFollowRead !== true ||
    schemaPolicy.reviewerIdentity !== "role-slug" ||
    schemaPolicy.privateInputs !== "environment-owned" ||
    schemaPolicy.extensionRequires !== "superseding-schema-and-adr"
  ) {
    fail("closeout artifact schema policy differs");
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
    "closed v1",
    paths.closeoutAdr.toLowerCase(),
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
    "closed v1",
    "machine-detectable",
  ]) {
    if (!runbook.toLowerCase().includes(term)) {
      fail(`continuous-improvement runbook is missing ${term}`);
    }
  }
  for (const source of providerSources.values()) {
    if (!adr.includes(source)) fail(`ADR is missing official source ${source}`);
  }
  for (const term of [
    "unknown members",
    "private inputs",
    "role slugs",
    "superseding adr",
    "no runtime or production authority",
  ]) {
    if (!closeoutAdr.toLowerCase().includes(term)) {
      fail(`closeout ADR is missing ${term}`);
    }
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
    [...providerSources].map(([id, source]) => {
      const provider = {
        id,
        source,
        reviewedAt,
        observedVersionOrEntry: "review-cutoff-entry",
        impact: "none",
        ownerRole: "engineering",
        disposition:
          "Official changes were reviewed and require no candidate change for this period.",
      };
      const installedEndpoints = recoverySourceEndpoints.get(id);
      if (installedEndpoints) {
        provider.installed = [...installedEndpoints].map((endpoint) => ({
          id: endpoint,
          versionOrRelease: "installed-version",
          provenanceSha256: "9".repeat(64),
        }));
        provider.candidateVersionOrEntry = "candidate-version";
        provider.candidateProvenanceSha256 = "a".repeat(64);
      }
      return provider;
    });
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
  const expectPlanRejected = (label, expectedMessage, mutate) => {
    const fixture = completionFixture();
    const candidatePlan = structuredClone(plan);
    mutate(candidatePlan);
    const candidatePlanRaw = YAML.stringify(candidatePlan);
    fixture.fixtureEvidence.plan.sha256 = digest(candidatePlanRaw);
    fixture.rebindArtifacts();
    try {
      validateDocument(
        fixture.fixtureEvidence,
        candidatePlan,
        fixture.fixtureBacklog,
        fixture.fixtureTasks,
        fixture.artifactReader,
        candidatePlanRaw,
        fixture.getBacklogRaw(),
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes(expectedMessage)) {
        return;
      }
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
  expectPlanRejected(
    "weakened closeout schema policy",
    "closeout artifact schema policy differs",
    (candidatePlan) => {
      candidatePlan.artifacts.schemaPolicy.maximumStringCodeUnits = 8192;
    },
  );
  expectRejected(
    "unknown monthly review member",
    "monthly review keys differs from the required closed set",
    ({ documents }) => {
      documents.get("monthly-review-primary").notes =
        "Unrecognized V1 members must not become an implicit evidence channel.";
    },
  );
  expectRejected(
    "unknown monthly section member",
    "section keys differs from the required closed set",
    ({ documents }) => {
      documents.get("monthly-review-primary").sections[0].notes =
        "Full source material stays outside the minimized repository artifact.";
    },
  );
  expectRejected(
    "customer identity field",
    "contains prohibited key $.customerEmail",
    ({ documents }) => {
      documents.get("monthly-review-primary").customerEmail = [
        "reviewer",
        "@",
        "example.invalid",
      ].join("");
    },
  );
  expectRejected(
    "email hidden in a disposition",
    "contains prohibited personal or credential material",
    ({ documents }) => {
      documents.get("monthly-review-primary").sections[0].disposition = [
        "Escalated privately to reviewer",
        "@",
        "example.invalid after the deterministic review.",
      ].join("");
    },
  );
  expectRejected(
    "credential hidden in a disposition",
    "contains prohibited personal or credential material",
    ({ documents }) => {
      documents.get("monthly-review-primary").sections[0].disposition = [
        "Private source was accessed at https://operator:",
        "not-a-real-password",
        "@example.invalid/input and reviewed.",
      ].join("");
    },
  );
  expectRejected(
    "provider credential hidden in a disposition",
    "contains prohibited personal or credential material",
    ({ documents }) => {
      documents.get("monthly-review-primary").sections[0].disposition = [
        "Escalation used provider credential ",
        "xoxb-",
        "1234567890abcdef",
        " before deterministic review.",
      ].join("");
    },
  );
  expectRejected(
    "bidirectional control text",
    "is not bounded minimized text",
    ({ documents }) => {
      documents.get("monthly-review-primary").sections[0].disposition =
        "Reviewed evidence and found no difference.\u202eexe.txt";
    },
  );
  expectRejected(
    "oversized minimized text",
    "is not bounded minimized text",
    ({ documents }) => {
      documents.get("monthly-review-primary").sections[0].disposition =
        "x".repeat(4097);
    },
  );
  expectRejected(
    "duplicate failure fingerprint",
    "failure inventory is invalid",
    ({ documents }) => {
      const review = documents.get("monthly-review-primary");
      review.failures.push(structuredClone(review.failures[0]));
    },
  );
  expectRejected(
    "unknown quarterly exercise member",
    "quarterly exercise keys differs from the required closed set",
    ({ documents }) => {
      documents.get("quarterly-exercise-bundle").exercises[0].notes =
        "Private exercise detail is represented only by the report digest.";
    },
  );
  expectRejected(
    "unknown reconciliation score member",
    "final module score keys differs from the required closed set",
    ({ documents }) => {
      documents.get("final-reconciliation").moduleScores[0].notes =
        "The authoritative score remains in the closed score fields.";
    },
  );
  expectRejected(
    "unknown approval member",
    "approval keys differs from the required closed set",
    ({ documents }) => {
      documents.get("approval-record").approvals[0].notes =
        "The signed approval is represented by its evidence digest.";
    },
  );
  expectRejected(
    "unexpected installed-provider evidence",
    "provider keys differs from the required closed set",
    ({ documents }) => {
      const provider = documents
        .get("monthly-review-primary")
        .providers.find((item) => item.id === "woocommerce");
      provider.installed = [];
    },
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
    "substituted recovery dependency source",
    "provider review is incomplete",
    ({ documents }) => {
      documents
        .get("monthly-review-primary")
        .providers.find((provider) => provider.id === "rsync").source =
        "https://example.invalid/rsync-news";
    },
  );
  expectRejected(
    "missing recovery endpoint evidence",
    "installed endpoints differs from the required closed set",
    ({ documents }) => {
      documents
        .get("monthly-review-primary")
        .providers.find((provider) => provider.id === "rsync")
        .installed.pop();
    },
  );
  expectRejected(
    "missing recovery candidate provenance",
    "candidate evidence is incomplete",
    ({ documents }) => {
      documents
        .get("monthly-review-primary")
        .providers.find(
          (provider) => provider.id === "rsync",
        ).candidateProvenanceSha256 = "0".repeat(64);
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
    "missing current backlog blocker",
    "current backlog items differs",
    ({ fixtureBacklog }) => {
      fixtureBacklog.items = fixtureBacklog.items.filter(
        (item) => item.id !== "IMP-013",
      );
    },
  );
  expectRejected(
    "substituted backlog evidence",
    "IMP-014.evidence differs from its required exact gate",
    ({ fixtureBacklog }) => {
      fixtureBacklog.items.find((item) => item.id === "IMP-014").evidence =
        "docs/plan/evidence/M15/capacity.yaml";
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
