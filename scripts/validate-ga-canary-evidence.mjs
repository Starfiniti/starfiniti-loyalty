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
  evidence: "docs/plan/evidence/M15/ga-canary.yaml",
  plan: "infrastructure/testing/ga-canary/plan.yaml",
  claims: "docs/product/GA_CLAIMS.yaml",
  tasks: "docs/plan/TASKS.yaml",
  runbook: "docs/operations/GA_CANARY.md",
  adr: "docs/architecture/ADR/0067-evidence-bound-thirty-day-ga-canary.md",
};

const readText = (relativePath) =>
  readFileSync(join(root, relativePath), "utf8");
const evidence = YAML.parse(readText(paths.evidence));
const plan = YAML.parse(readText(paths.plan));
const claims = YAML.parse(readText(paths.claims));
const tasks = YAML.parse(readText(paths.tasks));
const runbook = readText(paths.runbook);
const adr = readText(paths.adr);

const requiredChecks = new Set([
  "repository_contract",
  "claims_catalogue",
  "task_graph_binding",
  "validator_selftest",
  "exact_head_ci",
  "module_closeout",
  "m15_prerequisite_manifests",
  "approved_release",
  "release_provenance",
  "pre_change_recovery_point",
  "canary_approval",
  "disabled_deployment",
  "pilot_tenant_isolation",
  "public_baseline",
  "self_hosted_independence",
  "woocommerce_matrix",
  "monitoring_coverage",
  "thirty_day_continuity",
  "daily_source_freshness",
  "slo_error_budget",
  "capacity_claim",
  "recovery_claim",
  "independent_security_close",
  "operations_ownership",
  "protected_alert_delivery",
  "checkout_independence",
  "event_effect_reconciliation",
  "ledger_reconciliation",
  "queue_reconciliation",
  "pilot_value_reconciliation",
  "tenant_privacy_reconciliation",
  "woocommerce_coupon_reconciliation",
  "referral_campaign_reconciliation",
  "notification_reconciliation",
  "customer_experience_canary",
  "analytics_reconciliation",
  "ecosystem_reconciliation",
  "migration_reconciliation",
  "identity_reconciliation",
  "managed_billing_reconciliation",
  "incident_reconciliation",
  "rollback_rehearsal",
  "rollback_decision_exercise",
  "data_loss_zero",
  "claims_review",
  "product_score",
  "m15_score",
  "independent_final_review",
  "owner_ga_approval",
  "post_ga_handoff",
]);
const requiredClaimIds = new Set([
  "open-source-self-hosted",
  "woocommerce-ga",
  "checkout-independent",
  "immutable-exact-value",
  "tenant-isolation",
  "earning-rewards-vip",
  "referrals-campaigns",
  "communications-experience",
  "analytics-liability",
  "ecosystem-migration",
  "enterprise-identity",
  "managed-billing",
  "measured-enterprise-readiness",
]);
const requiredLimitations = new Map([
  ["shopify", "deferred"],
  ["language", "english-only"],
  ["stored-value", "excluded"],
]);
const prerequisitePaths = new Map([
  ["capacity", "docs/plan/evidence/M15/capacity.yaml"],
  ["fault-injection", "docs/plan/evidence/M15/fault-injection.yaml"],
  ["security", "docs/plan/evidence/M15/security.yaml"],
  ["recovery", "docs/plan/evidence/M15/recovery.yaml"],
  ["operations", "docs/plan/evidence/M15/operations.yaml"],
]);
const artifactBindings = [
  [
    "releaseInventory",
    "release-inventory",
    "starfiniti.ga-release-inventory.v1",
  ],
  ["canaryJournal", "canary-journal", "starfiniti.ga-canary-journal.v1"],
  [
    "finalReconciliation",
    "final-reconciliation",
    "starfiniti.ga-final-reconciliation.v1",
  ],
  ["claimsReview", "claims-review", "starfiniti.ga-claims-review.v1"],
  ["approvalRecord", "approval-record", "starfiniti.ga-approval-record.v1"],
];
const scoreWeights = new Map([
  ["correctness", 20],
  ["security", 15],
  ["ledger_reliability", 15],
  ["tests", 15],
  ["performance", 10],
  ["operability", 10],
  ["maintainability", 15],
]);
const wholeProductScoreWeights = new Map([
  ["activation", 10],
  ["feature-breadth", 25],
  ["merchant-usability", 15],
  ["customer-value", 15],
  ["reliability", 15],
  ["operations", 10],
  ["enterprise-commercial", 10],
]);
const releaseBindingFields = new Set([
  "gitCommit",
  "dashboardImage",
  "workerImage",
  "connectorPackage",
  "migrations",
  "configuration",
]);
const materialChangeFields = new Set([
  "release",
  "applicationImage",
  "workerImage",
  "connectorPackage",
  "migrationSet",
  "valueContract",
  "entitlementCatalogue",
  "monitoringContract",
]);
const requiredModuleIds = new Set([
  "M00",
  "M01",
  "M02",
  "M03",
  "M04",
  "M05",
  "M06",
  "M07",
  "M08",
  "M09",
  "M10",
  "M11",
  "M12",
  "M13",
  "M14",
  "M15",
]);
const requiredM15Slices = new Set([
  "M15-S01-CAPACITY-ENVELOPE",
  "M15-S02-FAULT-INJECTION",
  "M15-S03-SUPPLY-CHAIN-AND-SECURITY",
  "M15-S04-CLEAN-ROOM-RECOVERY",
  "M15-S05-OPERATIONS-AND-INCIDENTS",
  "M15-S06-GA-CANARY-AND-CLOSE",
]);
const dailyDifferenceFields = new Set([
  "unexplainedValue",
  "duplicateEffects",
  "ledger",
  "walletLotsTiersRewards",
  "queues",
  "woocommerceCoupons",
  "tenantBoundary",
  "privacy",
  "checkoutDependency",
  "dataLoss",
  "ambiguousProviderOutcomes",
]);
const finalDifferenceFields = new Set([
  "canonicalEvents",
  "immutableEffects",
  "ledger",
  "walletLotsTiersRewards",
  "woocommerceCoupons",
  "referralsCampaigns",
  "notifications",
  "analytics",
  "ecosystemApisWebhooks",
  "migrations",
  "identityLifecycle",
  "usageInvoices",
  "privacy",
  "tenantAuthorization",
  "dataLoss",
]);
const requiredApprovalRoles = new Set([
  "product",
  "engineering",
  "security",
  "operations",
  "value-integrity",
  "owner",
]);
const digestPattern = /^[0-9a-f]{64}$/u;
const commitPattern = /^[0-9a-f]{40}$/u;
const imageDigestPattern = /^sha256:[0-9a-f]{64}$/u;
const allowedStatuses = new Set(["passed", "pending", "failed"]);
const pendingLanguagePattern =
  /\b(await|pending|remain|requires?|must|not yet|has not|will|future|todo)\b/iu;
const credentialPattern =
  /\b(?:sflt_v1_[0-9a-f]{32}_[A-Za-z0-9_-]{43}|sk_(?:live|test)_[A-Za-z0-9]{16,}|whsec_[A-Za-z0-9]{16,}|eyJ[A-Za-z0-9_-]{20,})\b/u;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu;
const uuidPattern =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/iu;
const forbiddenKeyPattern =
  /(?:tenantid|organizationid|workspaceid|customerid|memberid|orderid|coupon|credential|password|secret|privatekey|authorizationheader|token|payload|rawbody|requestbody|responsebody|email|contact)$/iu;

function fail(message) {
  throw new Error(`GA canary evidence invalid: ${message}`);
}

function digest(raw) {
  return createHash("sha256").update(raw).digest("hex");
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

function scanMinimized(value, location = "evidence") {
  if (Array.isArray(value)) {
    value.forEach((child, index) =>
      scanMinimized(child, `${location}[${index}]`),
    );
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenKeyPattern.test(key.replaceAll("_", "").toLowerCase())) {
        fail(`forbidden sensitive key ${location}.${key}`);
      }
      scanMinimized(child, `${location}.${key}`);
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

function safeArtifactPath(relativePath, artifactId) {
  const pattern = new RegExp(
    `^docs/plan/evidence/M15/runs/ga-${artifactId}-[a-z0-9][a-z0-9-]{2,79}\\.json$`,
    "u",
  );
  if (typeof relativePath !== "string" || !pattern.test(relativePath)) {
    fail(`${artifactId} artifact path is unsafe`);
  }
  const absolute = resolve(root, relativePath);
  const artifactRoot = `${resolve(root, "docs/plan/evidence/M15/runs")}${sep}`;
  if (!absolute.startsWith(artifactRoot)) fail("artifact escapes its root");
  return absolute;
}

function readBoundFile(relativePath, expectedDigest, artifactId, maximumBytes) {
  if (!digestPattern.test(expectedDigest) || /^0{64}$/u.test(expectedDigest)) {
    fail(`${artifactId} digest must be exact and nonzero`);
  }
  const absolute = safeArtifactPath(relativePath, artifactId);
  let descriptor;
  try {
    descriptor = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = fstatSync(descriptor);
    const linked = lstatSync(absolute);
    if (
      !opened.isFile() ||
      !linked.isFile() ||
      opened.dev !== linked.dev ||
      opened.ino !== linked.ino ||
      opened.size < 2 ||
      opened.size > maximumBytes
    ) {
      fail(`${artifactId} artifact is not one stable bounded regular file`);
    }
    const buffer = Buffer.alloc(opened.size);
    let offset = 0;
    while (offset < buffer.length) {
      const count = readSync(
        descriptor,
        buffer,
        offset,
        buffer.length - offset,
        null,
      );
      if (count === 0) break;
      offset += count;
    }
    if (offset !== buffer.length)
      fail(`${artifactId} artifact read was incomplete`);
    const raw = buffer.toString("utf8");
    if (digest(raw) !== expectedDigest)
      fail(`${artifactId} artifact digest differs`);
    return JSON.parse(raw);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function readPrerequisite(relativePath, expectedDigest) {
  if (!digestPattern.test(expectedDigest) || /^0{64}$/u.test(expectedDigest)) {
    fail("prerequisite digest must be exact and nonzero");
  }
  if (![...prerequisitePaths.values()].includes(relativePath)) {
    fail("prerequisite evidence path is unsafe");
  }
  const absolute = resolve(root, relativePath);
  let descriptor;
  try {
    descriptor = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = fstatSync(descriptor);
    const linked = lstatSync(absolute);
    if (
      !opened.isFile() ||
      !linked.isFile() ||
      opened.dev !== linked.dev ||
      opened.ino !== linked.ino ||
      opened.size < 2 ||
      opened.size > 512 * 1024
    ) {
      fail("prerequisite evidence is not one stable bounded regular file");
    }
    const buffer = Buffer.alloc(opened.size);
    let offset = 0;
    while (offset < buffer.length) {
      const count = readSync(
        descriptor,
        buffer,
        offset,
        buffer.length - offset,
        null,
      );
      if (count === 0) break;
      offset += count;
    }
    if (offset !== buffer.length)
      fail("prerequisite evidence read was incomplete");
    const raw = buffer.toString("utf8");
    if (digest(raw) !== expectedDigest)
      fail("prerequisite evidence digest differs");
    return YAML.parse(raw);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function zeroDifferenceObject(value, required, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} differences are missing`);
  }
  exactSet(new Set(Object.keys(value)), required, `${label} difference fields`);
  for (const [key, count] of Object.entries(value)) {
    if (!Number.isInteger(count) || count !== 0) {
      fail(`${label}.${key} must be integer zero`);
    }
  }
}

function validateReleaseInventory(document, candidate, prereqs) {
  if (document.schema !== "starfiniti.ga-release-inventory.v1") {
    fail("release inventory schema differs");
  }
  exactSet(
    new Set(Object.keys(document)),
    new Set([
      "schema",
      "observedAt",
      "candidateCommit",
      "release",
      "bindings",
      "prerequisiteEvidence",
    ]),
    "release inventory fields",
  );
  const observedAt = exactUtc(
    document.observedAt,
    "release inventory observedAt",
  );
  if (
    document.candidateCommit !== candidate.commit ||
    document.release !== candidate.release
  ) {
    fail("release inventory identity differs from candidate");
  }
  const bindings = document.bindings;
  if (!bindings || bindings.gitCommit !== candidate.commit) {
    fail("release inventory Git binding differs");
  }
  exactSet(
    new Set(Object.keys(bindings)),
    releaseBindingFields,
    "release inventory bindings",
  );
  for (const key of ["dashboardImage", "workerImage"]) {
    if (!imageDigestPattern.test(bindings[key])) {
      fail(`release inventory ${key} must be an image digest`);
    }
  }
  for (const key of ["connectorPackage", "migrations", "configuration"]) {
    if (!digestPattern.test(bindings[key]) || /^0{64}$/u.test(bindings[key])) {
      fail(`release inventory ${key} must be a nonzero digest`);
    }
  }
  const ids = uniqueIds(document.prerequisiteEvidence, "release prerequisites");
  exactSet(
    ids,
    new Set(prereqs.map((item) => item.id)),
    "release prerequisites",
  );
  for (const item of document.prerequisiteEvidence) {
    exactSet(
      new Set(Object.keys(item)),
      new Set(["id", "sha256"]),
      `${item.id} release prerequisite fields`,
    );
    const bound = prereqs.find((candidateItem) => candidateItem.id === item.id);
    if (item.sha256 !== bound.sha256)
      fail(`${item.id} release prerequisite drift`);
  }
  return observedAt;
}

function validateCanaryJournal(document, candidate, expectedCanary) {
  if (document.schema !== "starfiniti.ga-canary-journal.v1") {
    fail("canary journal schema differs");
  }
  exactSet(
    new Set(Object.keys(document)),
    new Set([
      "schema",
      "candidateCommit",
      "timezone",
      "pilotTenantCount",
      "materialChanges",
      "start",
      "end",
      "dailyIntervals",
    ]),
    "canary journal fields",
  );
  if (
    document.candidateCommit !== candidate.commit ||
    document.timezone !== "UTC"
  ) {
    fail("canary journal identity or timezone differs");
  }
  if (document.pilotTenantCount !== 1 || document.materialChanges !== 0) {
    fail("canary journal must retain one pilot and zero material changes");
  }
  const start = exactUtc(document.start, "canary journal start");
  const end = exactUtc(document.end, "canary journal end");
  if (
    document.start !== expectedCanary.start ||
    document.end !== expectedCanary.end
  ) {
    fail("canary journal bounds differ from the manifest");
  }
  if (
    !document.start.endsWith("T00:00:00Z") ||
    !document.end.endsWith("T00:00:00Z")
  ) {
    fail("canary bounds must be complete UTC days");
  }
  const windowMilliseconds = end - start;
  if (windowMilliseconds < 720 * 60 * 60 * 1000)
    fail("canary window is shorter than 720 hours");
  if (windowMilliseconds % 86_400_000 !== 0) {
    fail("canary window must contain complete UTC days");
  }
  const expectedDays = windowMilliseconds / 86_400_000;
  if (
    !Array.isArray(document.dailyIntervals) ||
    document.dailyIntervals.length !== expectedDays
  ) {
    fail("canary journal does not cover every complete UTC day");
  }
  const dates = new Set();
  for (let index = 0; index < document.dailyIntervals.length; index += 1) {
    const day = document.dailyIntervals[index];
    const expectedDate = new Date(start + index * 86_400_000)
      .toISOString()
      .slice(0, 10);
    if (day.date !== expectedDate || dates.has(day.date)) {
      fail(
        "canary journal daily intervals are missing, duplicated, or discontinuous",
      );
    }
    dates.add(day.date);
    exactSet(
      new Set(Object.keys(day)),
      new Set([
        "date",
        "releaseCommit",
        "sourceCoverageRatio",
        "openCritical",
        "openHigh",
        "checkoutBlockedByHub",
        "protectedDifferences",
      ]),
      `day ${day.date} fields`,
    );
    if (
      day.releaseCommit !== candidate.commit ||
      day.sourceCoverageRatio !== 1
    ) {
      fail("canary daily release identity or source coverage differs");
    }
    if (
      day.openCritical !== 0 ||
      day.openHigh !== 0 ||
      day.checkoutBlockedByHub !== 0
    ) {
      fail("canary daily protected failures must be zero");
    }
    zeroDifferenceObject(
      day.protectedDifferences,
      dailyDifferenceFields,
      `day ${day.date}`,
    );
  }
  return { start, end };
}

function validateFinalReconciliation(document, candidate) {
  if (document.schema !== "starfiniti.ga-final-reconciliation.v1") {
    fail("final reconciliation schema differs");
  }
  exactSet(
    new Set(Object.keys(document)),
    new Set([
      "schema",
      "observedAt",
      "candidateCommit",
      "unresolvedCritical",
      "unresolvedHigh",
      "differences",
      "productScore",
      "moduleScores",
    ]),
    "final reconciliation fields",
  );
  const observedAt = exactUtc(
    document.observedAt,
    "final reconciliation observedAt",
  );
  if (document.candidateCommit !== candidate.commit) {
    fail("final reconciliation candidate differs");
  }
  if (document.unresolvedCritical !== 0 || document.unresolvedHigh !== 0) {
    fail("final reconciliation has unresolved Critical or High findings");
  }
  zeroDifferenceObject(
    document.differences,
    finalDifferenceFields,
    "final reconciliation",
  );
  const productScore = document.productScore;
  if (
    !productScore ||
    productScore.target !== 90 ||
    productScore.minimumCategoryRatio !== 0.8
  ) {
    fail("whole-product score thresholds differ");
  }
  exactSet(
    new Set(Object.keys(productScore)),
    new Set(["total", "target", "minimumCategoryRatio", "categories"]),
    "whole-product score fields",
  );
  exactSet(
    uniqueIds(productScore.categories, "whole-product score categories"),
    new Set(wholeProductScoreWeights.keys()),
    "whole-product score categories",
  );
  let productTotal = 0;
  for (const category of productScore.categories) {
    exactSet(
      new Set(Object.keys(category)),
      new Set(["id", "weight", "score"]),
      `${category.id} whole-product score fields`,
    );
    if (
      category.weight !== wholeProductScoreWeights.get(category.id) ||
      !Number.isInteger(category.score) ||
      category.score < Math.ceil(category.weight * 0.8) ||
      category.score > category.weight
    ) {
      fail(`${category.id} whole-product score is below its floor`);
    }
    productTotal += category.score;
  }
  if (productScore.total !== productTotal || productTotal < 90) {
    fail("whole-product score is below 90 or arithmetically invalid");
  }
  exactSet(
    uniqueIds(document.moduleScores, "module scores"),
    requiredModuleIds,
    "module scores",
  );
  for (const moduleScore of document.moduleScores) {
    exactSet(
      new Set(Object.keys(moduleScore)),
      new Set(["id", "total", "minimumCategoryRatioObserved"]),
      `${moduleScore.id} module score fields`,
    );
    if (
      !Number.isInteger(moduleScore.total) ||
      moduleScore.total < 90 ||
      moduleScore.total > 100 ||
      typeof moduleScore.minimumCategoryRatioObserved !== "number" ||
      moduleScore.minimumCategoryRatioObserved < 0.8 ||
      moduleScore.minimumCategoryRatioObserved > 1
    ) {
      fail(`${moduleScore.id} module score or category floor is invalid`);
    }
  }
  return observedAt;
}

function validateClaimsReview(document, candidate, candidateClaims) {
  if (document.schema !== "starfiniti.ga-claims-review.v1") {
    fail("claims review schema differs");
  }
  exactSet(
    new Set(Object.keys(document)),
    new Set([
      "schema",
      "observedAt",
      "candidateCommit",
      "independentReview",
      "claims",
      "limitations",
    ]),
    "claims review fields",
  );
  const observedAt = exactUtc(document.observedAt, "claims review observedAt");
  if (
    document.candidateCommit !== candidate.commit ||
    document.independentReview !== true
  ) {
    fail("claims review identity or independent review differs");
  }
  const ids = uniqueIds(document.claims, "reviewed claims");
  exactSet(ids, requiredClaimIds, "reviewed claims");
  for (const reviewed of document.claims) {
    exactSet(
      new Set(Object.keys(reviewed)),
      new Set(["id", "approved", "evidenceChecks"]),
      `${reviewed.id} reviewed claim fields`,
    );
    const source = candidateClaims.claims.find(
      (item) => item.id === reviewed.id,
    );
    if (reviewed.approved !== true || source.publishable !== true) {
      fail(`${reviewed.id} is not approved and publishable`);
    }
    exactSet(
      new Set(reviewed.evidenceChecks),
      new Set(source.evidenceChecks),
      `${reviewed.id} claim evidence`,
    );
  }
  const limitationIds = uniqueIds(document.limitations, "reviewed limitations");
  exactSet(
    limitationIds,
    new Set(requiredLimitations.keys()),
    "reviewed limitations",
  );
  for (const limitation of document.limitations) {
    exactSet(
      new Set(Object.keys(limitation)),
      new Set(["id", "state"]),
      `${limitation.id} reviewed limitation fields`,
    );
    if (limitation.state !== requiredLimitations.get(limitation.id)) {
      fail(`${limitation.id} limitation state differs`);
    }
  }
  return observedAt;
}

function validateApprovalRecord(document, candidate) {
  if (document.schema !== "starfiniti.ga-approval-record.v1") {
    fail("approval record schema differs");
  }
  exactSet(
    new Set(Object.keys(document)),
    new Set([
      "schema",
      "observedAt",
      "candidateCommit",
      "independentReview",
      "approvals",
      "m16",
    ]),
    "approval record fields",
  );
  const observedAt = exactUtc(
    document.observedAt,
    "approval record observedAt",
  );
  if (
    document.candidateCommit !== candidate.commit ||
    document.independentReview !== true
  ) {
    fail("approval record identity or independent review differs");
  }
  const roles = uniqueIds(document.approvals, "GA approvals");
  exactSet(roles, requiredApprovalRoles, "GA approvals");
  const approvalDigests = new Set();
  for (const approval of document.approvals) {
    exactSet(
      new Set(Object.keys(approval)),
      new Set(["id", "approved", "evidenceSha256"]),
      `${approval.id} approval fields`,
    );
    if (
      approval.approved !== true ||
      !digestPattern.test(approval.evidenceSha256) ||
      /^0{64}$/u.test(approval.evidenceSha256) ||
      approvalDigests.has(approval.evidenceSha256)
    ) {
      fail(
        "GA approvals must be approved with distinct nonzero evidence digests",
      );
    }
    approvalDigests.add(approval.evidenceSha256);
  }
  if (
    document.m16?.monthlyReviewScheduled !== true ||
    document.m16?.quarterlyExercisesScheduled !== true
  ) {
    fail("approval record must schedule M16 monthly and quarterly work");
  }
  exactSet(
    new Set(Object.keys(document.m16)),
    new Set(["monthlyReviewScheduled", "quarterlyExercisesScheduled"]),
    "M16 handoff fields",
  );
  return observedAt;
}

function validateDocument(
  candidateEvidence,
  candidateTasks = tasks,
  candidateClaims = claims,
  candidatePlan = plan,
  artifactReader = readBoundFile,
  prerequisiteReader = readPrerequisite,
  candidateClaimsRaw = readText(paths.claims),
  candidatePlanRaw = readText(paths.plan),
) {
  scanMinimized(candidateEvidence);
  if (candidateEvidence.schema !== "starfiniti.ga-canary.v1")
    fail("schema differs");
  if (!new Set(["in_progress", "complete"]).has(candidateEvidence.status)) {
    fail("status must be in_progress or complete");
  }
  exactUtc(candidateEvidence.observedAt, "observedAt");
  if (
    !commitPattern.test(candidateEvidence.currentProduction?.applicationCommit)
  ) {
    fail("current production commit must be a full lowercase Git SHA");
  }
  if (!commitPattern.test(candidateEvidence.candidate?.commit)) {
    fail("candidate commit must be a full lowercase Git SHA");
  }
  if (candidateEvidence.candidate.branch !== "codex/m15-ga-canary") {
    fail("candidate branch differs");
  }

  if (
    candidatePlan.schema !== "starfiniti.ga-canary-plan.v1" ||
    candidatePlan.version !== 1 ||
    candidatePlan.timezone !== "UTC" ||
    candidatePlan.minimumWindowHours !== 720 ||
    candidatePlan.minimumDailyIntervals !== 30 ||
    candidatePlan.pilotTenantCount !== 1
  ) {
    fail("canonical GA plan invariants differ");
  }
  exactSet(
    new Set(candidatePlan.prerequisiteModules),
    requiredModuleIds,
    "plan modules",
  );
  if (candidatePlan.releaseIdentity?.immutable !== true) {
    fail("plan release identity must be immutable");
  }
  exactSet(
    new Set(candidatePlan.releaseIdentity?.requiredBindings ?? []),
    releaseBindingFields,
    "plan release bindings",
  );
  exactSet(
    new Set(candidatePlan.materialChangesRestartWindow ?? []),
    materialChangeFields,
    "plan material changes",
  );
  const planPrerequisiteIds = uniqueIds(
    candidatePlan.prerequisiteEvidence,
    "plan prerequisites",
  );
  exactSet(
    planPrerequisiteIds,
    new Set(prerequisitePaths.keys()),
    "plan prerequisites",
  );
  for (const item of candidatePlan.prerequisiteEvidence) {
    exactSet(
      new Set(Object.keys(item)),
      new Set(["id", "path"]),
      `${item.id} plan prerequisite fields`,
    );
    if (item.path !== prerequisitePaths.get(item.id)) {
      fail(`${item.id} plan prerequisite path differs`);
    }
  }
  exactSet(
    uniqueIds(candidatePlan.artifacts, "plan artifacts"),
    new Set(artifactBindings.map(([, id]) => id)),
    "plan artifacts",
  );
  for (const item of candidatePlan.artifacts) {
    exactSet(
      new Set(Object.keys(item)),
      new Set(["id", "schema"]),
      `${item.id} plan artifact fields`,
    );
    const expected = artifactBindings.find(([, id]) => id === item.id)?.[2];
    if (item.schema !== expected)
      fail(`${item.id} plan artifact schema differs`);
  }
  exactSet(
    new Set(candidatePlan.dailyZeroDifferences),
    dailyDifferenceFields,
    "plan daily differences",
  );
  exactSet(
    new Set(candidatePlan.finalZeroDifferences),
    finalDifferenceFields,
    "plan final differences",
  );
  exactSet(
    new Set(candidatePlan.requiredApprovalRoles),
    requiredApprovalRoles,
    "plan approvals",
  );
  if (
    candidatePlan.score?.target !== 90 ||
    candidatePlan.score?.minimumCategoryRatio !== 0.8 ||
    !Array.isArray(candidatePlan.automaticFails) ||
    candidatePlan.automaticFails.length < 8
  ) {
    fail("canonical GA plan score or failure contract differs");
  }
  if (
    candidateEvidence.plan?.path !== paths.plan ||
    candidateEvidence.plan?.sha256 !== digest(candidatePlanRaw) ||
    candidateEvidence.claimsCatalogue?.path !== paths.claims ||
    candidateEvidence.claimsCatalogue?.sha256 !== digest(candidateClaimsRaw)
  ) {
    fail("plan or claims catalogue digest binding differs");
  }

  if (
    candidateClaims.schema !== "starfiniti.ga-claims.v1" ||
    candidateClaims.policy?.defaultPublishable !== false ||
    candidateClaims.policy?.evidenceRequired !== true ||
    candidateClaims.policy?.exactReleaseRequired !== true ||
    candidateClaims.policy?.ownerApprovalRequired !== true
  ) {
    fail("claims catalogue policy differs");
  }
  exactSet(
    uniqueIds(candidateClaims.claims, "claims"),
    requiredClaimIds,
    "claims",
  );
  for (const claim of candidateClaims.claims) {
    if (
      typeof claim.statement !== "string" ||
      claim.statement.length < 40 ||
      typeof claim.publishable !== "boolean" ||
      !Array.isArray(claim.evidenceChecks) ||
      claim.evidenceChecks.length < 3 ||
      claim.evidenceChecks.some((id) => !requiredChecks.has(id))
    ) {
      fail(`${claim.id} claim contract is incomplete`);
    }
  }
  exactSet(
    uniqueIds(candidateClaims.limitations, "limitations"),
    new Set(requiredLimitations.keys()),
    "limitations",
  );
  for (const limitation of candidateClaims.limitations) {
    if (limitation.state !== requiredLimitations.get(limitation.id)) {
      fail(`${limitation.id} limitation differs`);
    }
  }

  const checks = uniqueIds(candidateEvidence.checks, "checks");
  exactSet(checks, requiredChecks, "checks");
  for (const check of candidateEvidence.checks) {
    if (!allowedStatuses.has(check.status))
      fail(`${check.id} has invalid status`);
    if (
      typeof check.evidence !== "string" ||
      check.evidence.length < 35 ||
      check.evidence !== check.evidence.trim()
    ) {
      fail(`${check.id} evidence is not substantive`);
    }
    if (
      check.status === "passed" &&
      pendingLanguagePattern.test(check.evidence)
    ) {
      fail(`${check.id} passed evidence contains forward-looking language`);
    }
  }

  const prereqIds = uniqueIds(
    candidateEvidence.prerequisiteEvidence,
    "prerequisites",
  );
  exactSet(prereqIds, new Set(prerequisitePaths.keys()), "prerequisites");
  for (const item of candidateEvidence.prerequisiteEvidence) {
    if (item.path !== prerequisitePaths.get(item.id)) {
      fail(`${item.id} prerequisite path differs`);
    }
    if (item.sha256 !== null && !digestPattern.test(item.sha256)) {
      fail(`${item.id} prerequisite digest is invalid`);
    }
  }
  if (
    candidateEvidence.canary?.timezone !== "UTC" ||
    candidateEvidence.canary?.minimumWindowHours !== 720 ||
    candidateEvidence.canary?.minimumDailyIntervals !== 30 ||
    candidateEvidence.canary?.pilotTenantCount !== 1
  ) {
    fail("canary bounds differ from the canonical plan");
  }

  const categories = uniqueIds(
    candidateEvidence.score?.categories,
    "score categories",
  );
  exactSet(categories, new Set(scoreWeights.keys()), "score categories");
  let calculatedScore = 0;
  for (const category of candidateEvidence.score.categories) {
    if (
      category.weight !== scoreWeights.get(category.id) ||
      !Number.isInteger(category.score) ||
      category.score < 0 ||
      category.score > category.weight ||
      typeof category.evidence !== "string" ||
      category.evidence.length < 35
    ) {
      fail(`${category.id} score contract differs`);
    }
    calculatedScore += category.score;
  }
  if (
    candidateEvidence.score.total !== calculatedScore ||
    candidateEvidence.score.target !== 90 ||
    candidateEvidence.score.minimumCategoryRatio !== 0.8
  ) {
    fail("score total or thresholds differ");
  }
  const belowFloor = candidateEvidence.score.categories.filter(
    (category) => category.score / category.weight < 0.8,
  );

  const m15 = candidateTasks.tasks?.find(
    (task) => task.id === "M15-GA-HARDENING",
  );
  const s06 = m15?.slices?.find(
    (slice) => slice.id === "M15-S06-GA-CANARY-AND-CLOSE",
  );
  if (!m15 || !s06) fail("M15 or M15-S06 task is missing");
  exactSet(
    new Set(s06.dependencies),
    new Set([...requiredM15Slices].slice(0, 5)),
    "M15-S06 dependencies",
  );
  for (const requiredText of [
    "720",
    "thirty",
    "claims",
    "reconciliation",
    "docs/plan/evidence/M15/ga-canary.yaml",
  ]) {
    if (
      !YAML.stringify(s06).toLowerCase().includes(requiredText.toLowerCase())
    ) {
      fail(`M15-S06 task is missing ${requiredText} binding`);
    }
  }
  for (const requiredText of [
    "30 consecutive",
    "material change",
    "daily",
    "score",
    "owner",
    "shopify",
  ]) {
    if (!runbook.toLowerCase().includes(requiredText.toLowerCase())) {
      fail(`GA runbook is missing ${requiredText}`);
    }
  }
  if (!adr.includes("sre.google/workbook/canarying-releases/")) {
    fail("GA ADR is missing primary canary guidance");
  }

  if (
    !Array.isArray(candidateEvidence.automaticFails) ||
    candidateEvidence.automaticFails.length < 10 ||
    candidateEvidence.automaticFails.some(
      (rule) =>
        typeof rule !== "string" || rule.length < 45 || rule !== rule.trim(),
    ) ||
    new Set(candidateEvidence.automaticFails).size !==
      candidateEvidence.automaticFails.length
  ) {
    fail("automatic failures must contain ten unique substantive rules");
  }

  const checkById = new Map(
    candidateEvidence.checks.map((check) => [check.id, check]),
  );
  for (const [candidateFlag, checkId] of [
    ["approvedRelease", "approved_release"],
    ["canaryApproved", "canary_approval"],
    ["gaApproved", "owner_ga_approval"],
  ]) {
    if (
      candidateEvidence.candidate[candidateFlag] !==
      (checkById.get(checkId).status === "passed")
    ) {
      fail(`${candidateFlag} must match ${checkId}`);
    }
  }

  const incomplete = candidateEvidence.checks.filter(
    (check) => check.status !== "passed",
  );
  if (candidateEvidence.status === "complete") {
    if (
      candidateEvidence.candidate.approvedRelease !== true ||
      candidateEvidence.candidate.canaryApproved !== true ||
      candidateEvidence.candidate.gaApproved !== true ||
      typeof candidateEvidence.candidate.release !== "string" ||
      !/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(
        candidateEvidence.candidate.release,
      )
    ) {
      fail(
        "complete evidence requires an approved immutable release, canary, and GA decision",
      );
    }
    if (incomplete.length > 0) {
      fail(
        `complete evidence has non-passing checks: ${incomplete.map((item) => item.id).join(", ")}`,
      );
    }
    if (calculatedScore < 90 || belowFloor.length > 0) {
      fail("complete evidence does not meet score and category floors");
    }
    if (
      candidateEvidence.canary.start === null ||
      candidateEvidence.canary.end === null
    ) {
      fail("complete evidence requires exact canary bounds");
    }

    const moduleIds = new Set();
    for (const task of candidateTasks.tasks ?? []) {
      if (requiredModuleIds.has(task.module)) {
        moduleIds.add(task.module);
        if (task.status !== "complete")
          fail(`${task.module} module is incomplete`);
      }
    }
    exactSet(moduleIds, requiredModuleIds, "completed modules");
    exactSet(
      uniqueIds(m15.slices, "M15 slices"),
      requiredM15Slices,
      "M15 slices",
    );
    for (const slice of m15.slices) {
      if (slice.status !== "complete") fail(`${slice.id} is incomplete`);
    }

    for (const claim of candidateClaims.claims) {
      if (claim.publishable !== true)
        fail(`${claim.id} remains non-publishable`);
    }

    const prerequisiteDocuments = new Map();
    for (const item of candidateEvidence.prerequisiteEvidence) {
      if (!digestPattern.test(item.sha256) || /^0{64}$/u.test(item.sha256)) {
        fail(`${item.id} prerequisite is not digest-bound`);
      }
      const document = prerequisiteReader(item.path, item.sha256);
      if (
        document?.status !== "complete" ||
        !Array.isArray(document.checks) ||
        document.checks.some((check) => check.status !== "passed")
      ) {
        fail(`${item.id} prerequisite manifest is incomplete`);
      }
      prerequisiteDocuments.set(item.id, document);
    }

    const artifactDocuments = new Map();
    const artifactDigests = new Set();
    for (const [prefix, artifactId, schema] of artifactBindings) {
      const path = candidateEvidence.artifacts[`${prefix}Path`];
      const sha256 = candidateEvidence.artifacts[`${prefix}Sha256`];
      if (artifactDigests.has(sha256))
        fail("GA artifacts reuse one evidence digest");
      artifactDigests.add(sha256);
      const document = artifactReader(
        path,
        sha256,
        artifactId,
        artifactId === "canary-journal" ? 1024 * 1024 : 256 * 1024,
      );
      if (document.schema !== schema) fail(`${artifactId} schema differs`);
      scanMinimized(document, artifactId);
      artifactDocuments.set(artifactId, document);
    }
    const releaseObservedAt = validateReleaseInventory(
      artifactDocuments.get("release-inventory"),
      candidateEvidence.candidate,
      candidateEvidence.prerequisiteEvidence,
    );
    const journalBounds = validateCanaryJournal(
      artifactDocuments.get("canary-journal"),
      candidateEvidence.candidate,
      candidateEvidence.canary,
    );
    const reconciliationObservedAt = validateFinalReconciliation(
      artifactDocuments.get("final-reconciliation"),
      candidateEvidence.candidate,
    );
    const claimsObservedAt = validateClaimsReview(
      artifactDocuments.get("claims-review"),
      candidateEvidence.candidate,
      candidateClaims,
    );
    const approvalObservedAt = validateApprovalRecord(
      artifactDocuments.get("approval-record"),
      candidateEvidence.candidate,
    );
    const manifestObservedAt = exactUtc(
      candidateEvidence.observedAt,
      "completion observedAt",
    );
    if (
      releaseObservedAt > journalBounds.start ||
      reconciliationObservedAt < journalBounds.end ||
      claimsObservedAt < reconciliationObservedAt ||
      approvalObservedAt < claimsObservedAt ||
      manifestObservedAt < approvalObservedAt
    ) {
      fail("GA artifact chronology is invalid");
    }
  } else {
    if (m15.status !== "in_progress" || s06.status !== "in_progress") {
      fail("in-progress evidence must match in-progress M15 and M15-S06 tasks");
    }
    for (const [prefix] of artifactBindings) {
      if (
        candidateEvidence.artifacts[`${prefix}Path`] !== null ||
        candidateEvidence.artifacts[`${prefix}Sha256`] !== null
      ) {
        fail("in-progress evidence cannot bind unvalidated GA artifacts");
      }
    }
  }

  return { calculatedScore, incomplete, belowFloor };
}

function jsonBinding(document) {
  const raw = JSON.stringify(document);
  return { raw, sha256: digest(raw) };
}

function completionFixture() {
  const fixtureEvidence = structuredClone(evidence);
  const fixtureTasks = structuredClone(tasks);
  const fixtureClaims = structuredClone(claims);
  fixtureEvidence.status = "complete";
  fixtureEvidence.candidate.release = "v1.0.0";
  fixtureEvidence.candidate.approvedRelease = true;
  fixtureEvidence.candidate.canaryApproved = true;
  fixtureEvidence.candidate.gaApproved = true;
  fixtureEvidence.canary.start = "2026-01-01T00:00:00Z";
  fixtureEvidence.canary.end = "2026-01-31T00:00:00Z";
  for (const check of fixtureEvidence.checks) {
    check.status = "passed";
    check.evidence =
      "Verified exact-release independent evidence reconciles this mandatory result with zero difference.";
  }
  for (const category of fixtureEvidence.score.categories)
    category.score = category.weight;
  fixtureEvidence.score.total = 100;
  for (const claim of fixtureClaims.claims) claim.publishable = true;
  for (const task of fixtureTasks.tasks) {
    if (requiredModuleIds.has(task.module)) task.status = "complete";
  }
  const fixtureM15 = fixtureTasks.tasks.find(
    (task) => task.id === "M15-GA-HARDENING",
  );
  for (const slice of fixtureM15.slices) slice.status = "complete";

  const prerequisiteMap = new Map();
  for (const item of fixtureEvidence.prerequisiteEvidence) {
    const raw = YAML.stringify({
      schema: `starfiniti.${item.id}.fixture.v1`,
      status: "complete",
      checks: [{ id: "fixture", status: "passed", evidence: "Verified." }],
    });
    item.sha256 = digest(raw);
    prerequisiteMap.set(item.path, raw);
  }

  const releaseInventory = {
    schema: "starfiniti.ga-release-inventory.v1",
    observedAt: "2025-12-31T23:59:00Z",
    candidateCommit: fixtureEvidence.candidate.commit,
    release: fixtureEvidence.candidate.release,
    bindings: {
      gitCommit: fixtureEvidence.candidate.commit,
      dashboardImage: `sha256:${"1".repeat(64)}`,
      workerImage: `sha256:${"2".repeat(64)}`,
      connectorPackage: "3".repeat(64),
      migrations: "4".repeat(64),
      configuration: "5".repeat(64),
    },
    prerequisiteEvidence: fixtureEvidence.prerequisiteEvidence.map(
      ({ id, sha256 }) => ({ id, sha256 }),
    ),
  };
  const protectedDifferences = Object.fromEntries(
    [...dailyDifferenceFields].map((id) => [id, 0]),
  );
  const canaryJournal = {
    schema: "starfiniti.ga-canary-journal.v1",
    candidateCommit: fixtureEvidence.candidate.commit,
    timezone: "UTC",
    pilotTenantCount: 1,
    materialChanges: 0,
    start: fixtureEvidence.canary.start,
    end: fixtureEvidence.canary.end,
    dailyIntervals: Array.from({ length: 30 }, (_, index) => ({
      date: new Date(
        Date.parse(fixtureEvidence.canary.start) + index * 86_400_000,
      )
        .toISOString()
        .slice(0, 10),
      releaseCommit: fixtureEvidence.candidate.commit,
      sourceCoverageRatio: 1,
      openCritical: 0,
      openHigh: 0,
      checkoutBlockedByHub: 0,
      protectedDifferences,
    })),
  };
  const finalReconciliation = {
    schema: "starfiniti.ga-final-reconciliation.v1",
    observedAt: "2026-01-31T00:02:00Z",
    candidateCommit: fixtureEvidence.candidate.commit,
    unresolvedCritical: 0,
    unresolvedHigh: 0,
    differences: Object.fromEntries(
      [...finalDifferenceFields].map((id) => [id, 0]),
    ),
    productScore: {
      total: 100,
      target: 90,
      minimumCategoryRatio: 0.8,
      categories: [...wholeProductScoreWeights].map(([id, weight]) => ({
        id,
        weight,
        score: weight,
      })),
    },
    moduleScores: [...requiredModuleIds].map((id) => ({
      id,
      total: 100,
      minimumCategoryRatioObserved: 1,
    })),
  };
  const claimsReview = {
    schema: "starfiniti.ga-claims-review.v1",
    observedAt: "2026-01-31T00:03:00Z",
    candidateCommit: fixtureEvidence.candidate.commit,
    independentReview: true,
    claims: fixtureClaims.claims.map((claim) => ({
      id: claim.id,
      approved: true,
      evidenceChecks: claim.evidenceChecks,
    })),
    limitations: fixtureClaims.limitations.map(({ id, state }) => ({
      id,
      state,
    })),
  };
  const approvalRecord = {
    schema: "starfiniti.ga-approval-record.v1",
    observedAt: "2026-01-31T00:04:00Z",
    candidateCommit: fixtureEvidence.candidate.commit,
    independentReview: true,
    approvals: [...requiredApprovalRoles].map((id, index) => ({
      id,
      approved: true,
      evidenceSha256: (index + 6).toString(16).repeat(64),
    })),
    m16: { monthlyReviewScheduled: true, quarterlyExercisesScheduled: true },
  };
  const documents = new Map([
    ["release-inventory", releaseInventory],
    ["canary-journal", canaryJournal],
    ["final-reconciliation", finalReconciliation],
    ["claims-review", claimsReview],
    ["approval-record", approvalRecord],
  ]);
  const rebindArtifacts = () => {
    for (const [prefix, artifactId] of artifactBindings) {
      const binding = jsonBinding(documents.get(artifactId));
      const path = `docs/plan/evidence/M15/runs/ga-${artifactId}-fixture.json`;
      fixtureEvidence.artifacts[`${prefix}Path`] = path;
      fixtureEvidence.artifacts[`${prefix}Sha256`] = binding.sha256;
    }
  };
  const getClaimsRaw = () => YAML.stringify(fixtureClaims);
  const rebindClaims = () => {
    fixtureEvidence.claimsCatalogue.sha256 = digest(getClaimsRaw());
  };
  rebindArtifacts();
  rebindClaims();
  const artifactReader = (path, expectedDigest, artifactId) => {
    safeArtifactPath(path, artifactId);
    const document = documents.get(artifactId);
    const raw = JSON.stringify(document);
    if (!document || digest(raw) !== expectedDigest) {
      fail(`${artifactId} fixture digest differs`);
    }
    return JSON.parse(raw);
  };
  const prerequisiteReader = (path, expectedDigest) => {
    const raw = prerequisiteMap.get(path);
    if (!raw || digest(raw) !== expectedDigest)
      fail("fixture prerequisite digest differs");
    return YAML.parse(raw);
  };
  return {
    fixtureEvidence,
    fixtureTasks,
    fixtureClaims,
    artifactReader,
    prerequisiteReader,
    documents,
    rebindArtifacts,
    rebindClaims,
    getClaimsRaw,
  };
}

const result = validateDocument(evidence);

if (process.argv.includes("--self-test")) {
  const expectRejected = (
    label,
    expectedMessage,
    mutate,
    { rebindArtifacts = true, rebindClaims = true } = {},
  ) => {
    const fixture = completionFixture();
    mutate(fixture);
    if (rebindArtifacts) fixture.rebindArtifacts();
    if (rebindClaims) fixture.rebindClaims();
    try {
      validateDocument(
        fixture.fixtureEvidence,
        fixture.fixtureTasks,
        fixture.fixtureClaims,
        plan,
        fixture.artifactReader,
        fixture.prerequisiteReader,
        fixture.getClaimsRaw(),
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
    positive.fixtureTasks,
    positive.fixtureClaims,
    plan,
    positive.artifactReader,
    positive.prerequisiteReader,
    positive.getClaimsRaw(),
  );

  expectRejected(
    "pending checks as complete",
    "complete evidence has non-passing checks",
    ({ fixtureEvidence }) => {
      fixtureEvidence.checks[0].status = "pending";
      fixtureEvidence.checks[0].evidence =
        "Live exact-release evidence remains pending independent review.";
    },
  );
  expectRejected(
    "short canary",
    "shorter than 720 hours",
    ({ fixtureEvidence, documents }) => {
      fixtureEvidence.canary.end = "2026-01-30T00:00:00Z";
      documents.get("canary-journal").end = fixtureEvidence.canary.end;
    },
  );
  expectRejected(
    "missing canary day",
    "cover every complete UTC day",
    ({ documents }) => {
      documents.get("canary-journal").dailyIntervals.splice(12, 1);
    },
  );
  expectRejected(
    "material canary drift",
    "one pilot and zero material changes",
    ({ documents }) => {
      documents.get("canary-journal").materialChanges = 1;
    },
  );
  expectRejected(
    "nonzero ledger difference",
    "final reconciliation.ledger must be integer zero",
    ({ documents }) => {
      documents.get("final-reconciliation").differences.ledger = 1;
    },
  );
  expectRejected(
    "open High finding",
    "unresolved Critical or High",
    ({ documents }) => {
      documents.get("final-reconciliation").unresolvedHigh = 1;
    },
  );
  expectRejected(
    "M15 category below floor",
    "score and category floors",
    ({ fixtureEvidence }) => {
      const category = fixtureEvidence.score.categories.find(
        (item) => item.id === "operability",
      );
      fixtureEvidence.score.total -= category.score - 7;
      category.score = 7;
    },
  );
  expectRejected(
    "whole-product category below floor",
    "whole-product score is below its floor",
    ({ documents }) => {
      const category = documents
        .get("final-reconciliation")
        .productScore.categories.find((item) => item.id === "activation");
      category.score = 7;
      documents.get("final-reconciliation").productScore.total = 97;
    },
  );
  expectRejected(
    "module score below 90",
    "M10 module score or category floor is invalid",
    ({ documents }) => {
      documents
        .get("final-reconciliation")
        .moduleScores.find((item) => item.id === "M10").total = 89;
    },
  );
  expectRejected(
    "unapproved claim",
    "remains non-publishable",
    ({ fixtureClaims }) => {
      fixtureClaims.claims[0].publishable = false;
    },
  );
  expectRejected(
    "unsafe artifact path",
    "artifact path is unsafe",
    ({ fixtureEvidence }) => {
      fixtureEvidence.artifacts.canaryJournalPath =
        "../ga-canary-journal-fixture.json";
    },
    { rebindArtifacts: false },
  );
  expectRejected(
    "reused artifact digest",
    "artifacts reuse one evidence digest",
    ({ fixtureEvidence }) => {
      fixtureEvidence.artifacts.claimsReviewSha256 =
        fixtureEvidence.artifacts.finalReconciliationSha256;
    },
    { rebindArtifacts: false },
  );
  expectRejected(
    "incomplete module",
    "M10 module is incomplete",
    ({ fixtureTasks }) => {
      fixtureTasks.tasks.find((task) => task.module === "M10").status =
        "in_progress";
    },
  );
  expectRejected(
    "missing owner approval",
    "GA approvals differs from the required closed set",
    ({ documents }) => {
      documents.get("approval-record").approvals.pop();
    },
  );
}

console.log(
  `Validated ${evidence.checks.length} M15 GA checks and ${evidence.score.categories.length} score categories; score ${result.calculatedScore}/100 with ${evidence.checks.filter((check) => check.status === "passed").length} passed, ${evidence.checks.filter((check) => check.status === "pending").length} pending, and ${evidence.checks.filter((check) => check.status === "failed").length} failed.`,
);
