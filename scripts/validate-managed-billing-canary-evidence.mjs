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

import { validateCanaryManifestEnvelope } from "./lib/validate-canary-manifest-envelope.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const evidencePath = join(root, "docs/plan/evidence/M14/canary.yaml");
const tasksPath = join(root, "docs/plan/TASKS.yaml");

const evidence = YAML.parse(readFileSync(evidencePath, "utf8"));
const tasks = YAML.parse(readFileSync(tasksPath, "utf8"));

const requiredChecks = new Set([
  "exact_head_ci",
  "migration_replay",
  "contract_provider_matrix",
  "database_authority_matrix",
  "concurrency_matrix",
  "woocommerce_runtime_matrix",
  "browser_accessibility",
  "privacy_retention_matrix",
  "checkout_independence_matrix",
  "operations_documentation",
  "public_production_baseline",
  "operator_access",
  "self_hosted_no_call_repository",
  "approved_release",
  "approved_stripe_sandbox",
  "approved_catalogue",
  "approved_commercial_policy",
  "canary_approval",
  "pre_change_recovery_point",
  "production_billing_baseline",
  "secret_mounts",
  "disabled_deployment",
  "migration_registration",
  "non_canary_disabled",
  "self_hosted_runtime_no_call",
  "managed_entitlement_canary",
  "checkout_session_canary",
  "portal_session_canary",
  "verified_webhook_intake",
  "webhook_replay_disorder",
  "subscription_trial_activation",
  "subscription_renewal",
  "payment_failure_grace",
  "suspension_cancellation",
  "subscription_recovery",
  "usage_source_capture",
  "usage_dispatch_replay",
  "usage_correction",
  "provider_usage_reconciliation",
  "invoice_reconciliation",
  "manual_contract_override",
  "protected_operations_matrix",
  "provider_outage_recovery",
  "worker_outage_recovery",
  "return_navigation_no_authority",
  "cross_tenant_denial",
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
    "sensitive_provider_data",
    "card payment contact redirect provider response raw webhook or reusable authority material is stored logged exported shown in support output or copied into evidence",
  ],
  [
    "self_hosted_provider_call",
    "self-hosted mode reads a Stripe key scans billable sources constructs a provider client starts a billing worker or makes a Stripe request",
  ],
  [
    "browser_or_provider_authority",
    "browser input Auth claims provider metadata navigation return or mutable response grants tenant customer Price meter subscription entitlement or commercial authority",
  ],
  [
    "unverified_webhook",
    "unsigned stale oversized malformed unsupported or changed replay input enters the verified provider inbox or changes commercial state",
  ],
  [
    "provider_replay_regression",
    "duplicate delayed changed or out-of-order provider delivery creates another receipt effect entitlement revision or regresses event-time commercial state",
  ],
  [
    "duplicate_usage_effect",
    "duplicate source retry concurrency correction or dispatch creates another billable unit loses source period account or meter attribution or makes usage negative",
  ],
  [
    "premature_reconciliation",
    "asynchronous provider usage invoice subscription or ambiguity evidence is declared reconciled before bounded convergence polling and exact local comparison succeed",
  ],
  [
    "protected_path_block",
    "delinquency contract provider outage billing worker failure or commercial restriction blocks checkout ingestion refunds releases redemption reconciliation export account access or promised value",
  ],
  [
    "manual_contract_bypass",
    "a manual contract is self-approved unbounded unaudited backdated over conflicting evidence mutable in place or effective outside its exact interval",
  ],
  [
    "cross_tenant_exposure",
    "an unrelated organization account plan operation event usage policy contract summary provider or protected-path selector becomes visible mutable or externally actionable",
  ],
  [
    "credential_or_resource_leak",
    "reusable Stripe keys signatures raw provider resource identifiers payment values or secret mounts appear in repository browser database logs support output or canary artifacts",
  ],
  [
    "ambiguous_outcome_guess",
    "an ambiguous provider outcome is retried as success released for changed reuse discarded or used as entitlement authority without exact reconciliation",
  ],
  [
    "unsafe_rollout",
    "managed billing Price meter policy contract Checkout Portal webhook or usage dispatch is enabled outside the approved tenant before recovery baseline disabled deployment and isolation pass",
  ],
  [
    "reconciliation_gap",
    "subscription entitlement Price meter usage invoice policy contract attempt protected-path checkout or ledger evidence differs from immutable source facts",
  ],
  [
    "score_or_approval_bypass",
    "module status completion approval catalogue policy artifact score total or category floor is changed without exact synchronized evidence",
  ],
  [
    "unexplained_or_unapproved_close",
    "any billing lifecycle usage invoice protected-path privacy approval artifact score floor or critical security tenancy ledger recovery accessibility data-loss finding remains unresolved",
  ],
]);
const checkArtifactBindings = new Map([
  ["public_production_baseline", ["read_only_baseline"]],
  ["operator_access", ["read_only_baseline"]],
  ["approved_release", ["approval_record"]],
  ["approved_stripe_sandbox", ["approval_record"]],
  ["approved_catalogue", ["approval_record"]],
  ["approved_commercial_policy", ["approval_record"]],
  ["canary_approval", ["approval_record"]],
  ["pre_change_recovery_point", ["recovery_point"]],
  ["production_billing_baseline", ["production_baseline"]],
  ["secret_mounts", ["release_inventory", "canary_journal"]],
  ["disabled_deployment", ["release_inventory", "canary_journal"]],
  ["migration_registration", ["release_inventory", "canary_journal"]],
  ["non_canary_disabled", ["canary_journal"]],
  ["self_hosted_runtime_no_call", ["canary_journal", "observation_report"]],
  ["managed_entitlement_canary", ["canary_journal"]],
  ["checkout_session_canary", ["canary_journal"]],
  ["portal_session_canary", ["canary_journal"]],
  ["verified_webhook_intake", ["canary_journal"]],
  ["webhook_replay_disorder", ["canary_journal", "reconciliation_report"]],
  [
    "subscription_trial_activation",
    ["canary_journal", "reconciliation_report"],
  ],
  ["subscription_renewal", ["canary_journal", "reconciliation_report"]],
  ["payment_failure_grace", ["canary_journal", "reconciliation_report"]],
  ["suspension_cancellation", ["canary_journal", "reconciliation_report"]],
  ["subscription_recovery", ["canary_journal", "reconciliation_report"]],
  ["usage_source_capture", ["canary_journal", "reconciliation_report"]],
  ["usage_dispatch_replay", ["canary_journal", "reconciliation_report"]],
  ["usage_correction", ["canary_journal", "reconciliation_report"]],
  ["provider_usage_reconciliation", ["reconciliation_report"]],
  ["invoice_reconciliation", ["reconciliation_report"]],
  ["manual_contract_override", ["canary_journal", "reconciliation_report"]],
  ["protected_operations_matrix", ["canary_journal", "reconciliation_report"]],
  ["provider_outage_recovery", ["canary_journal", "rollback_report"]],
  ["worker_outage_recovery", ["canary_journal", "rollback_report"]],
  ["return_navigation_no_authority", ["canary_journal"]],
  ["cross_tenant_denial", ["canary_journal"]],
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
  "stripeSandboxApproved",
  "commercialPolicyApproved",
  "canaryApproved",
];
const fail = (message) => {
  throw new Error(`Managed billing canary evidence invalid: ${message}`);
};

const digest = (value) => createHash("sha256").update(value).digest("hex");
const digestPattern = /^[0-9a-f]{64}$/u;
const safeArtifactPath = (relativePath, artifactId) => {
  const artifactStem = artifactId.replaceAll("_", "-");
  const pattern = new RegExp(
    `^docs/plan/evidence/M14/production/billing-${artifactStem}-[a-z0-9][a-z0-9-]{2,79}\\.json$`,
    "u",
  );
  if (typeof relativePath !== "string" || !pattern.test(relativePath)) {
    fail(`${artifactId} artifact path is unsafe`);
  }
  const absolute = resolve(root, relativePath);
  const allowed = `${resolve(root, "docs/plan/evidence/M14/production")}${sep}`;
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
  if (digest(raw) !== expectedDigest)
    fail(`${artifactId} artifact digest differs`);
  try {
    return JSON.parse(raw.toString("utf8"));
  } catch {
    fail(`${artifactId} artifact must be valid JSON`);
  }
};

const isPlainObject = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

const exactKeys = (value, expected, label) => {
  if (!isPlainObject(value)) fail(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    fail(`${label} keys differ`);
  }
};

const exactUtcTime = (value, label) => {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value) ||
    Number.isNaN(parsed) ||
    new Date(parsed).toISOString().replace(".000Z", "Z") !== value
  ) {
    fail(`${label} must be an exact UTC timestamp`);
  }
  return parsed;
};

const exactNonzeroDigest = (value, label) => {
  if (!digestPattern.test(value) || /^0{64}$/u.test(value)) {
    fail(`${label} must be an exact nonzero SHA-256 digest`);
  }
};

const uniqueNonzeroDigests = (value, keys, label) => {
  const seen = new Set();
  for (const key of keys) {
    exactNonzeroDigest(value[key], `${label} ${key}`);
    if (seen.has(value[key])) fail(`${label} reuses one digest`);
    seen.add(value[key]);
  }
};

const exactAssertions = (value, expectedIds, label) => {
  if (!Array.isArray(value) || value.length !== expectedIds.length) {
    fail(`${label} assertions differ`);
  }
  const ids = new Set();
  const sourceDigests = new Set();
  for (const assertion of value) {
    exactKeys(
      assertion,
      ["id", "status", "evidenceSha256", "differenceCount"],
      `${label} assertion`,
    );
    if (!expectedIds.includes(assertion.id) || ids.has(assertion.id)) {
      fail(`${label} assertion identity differs`);
    }
    if (assertion.status !== "passed" || assertion.differenceCount !== 0) {
      fail(`${label} assertion is not a zero-difference pass`);
    }
    exactNonzeroDigest(
      assertion.evidenceSha256,
      `${label}.${assertion.id} evidence`,
    );
    if (sourceDigests.has(assertion.evidenceSha256)) {
      fail(`${label} assertions reuse one source digest`);
    }
    ids.add(assertion.id);
    sourceDigests.add(assertion.evidenceSha256);
  }
};

const validateArtifactDetails = (artifactId, document, candidateEvidence) => {
  const details = document.details;
  const observedAt = exactUtcTime(
    document.observedAt,
    `${artifactId} observedAt`,
  );
  if (artifactId === "read_only_baseline") {
    exactKeys(
      details,
      [
        "dashboardHealth",
        "login",
        "authWithoutKey",
        "restWithoutKey",
        "canonicalDns",
        "applicationVm",
        "databaseVm",
        "applicationVmState",
        "databaseVmState",
        "deploymentMode",
        "providerConfigured",
        "scope",
        "mutationCount",
      ],
      "read_only_baseline details",
    );
    for (const key of [
      "dashboardHealth",
      "login",
      "authWithoutKey",
      "restWithoutKey",
      "canonicalDns",
    ]) {
      if (details[key] !== candidateEvidence.publicBaseline[key]) {
        fail(`read_only_baseline ${key} differs from the manifest`);
      }
    }
    if (
      !Number.isSafeInteger(details.applicationVm) ||
      details.applicationVm < 1 ||
      !Number.isSafeInteger(details.databaseVm) ||
      details.databaseVm < 1 ||
      details.applicationVm === details.databaseVm ||
      details.applicationVmState !== "running" ||
      details.databaseVmState !== "running" ||
      details.deploymentMode !== "self_hosted" ||
      details.providerConfigured !== false ||
      details.scope !== "read_only" ||
      details.mutationCount !== 0
    ) {
      fail("read_only_baseline runtime or mutation evidence differs");
    }
    return;
  }
  if (artifactId === "release_inventory") {
    exactKeys(
      details,
      [
        "release",
        "pullRequest",
        "repositoryCommit",
        "dashboardImageSha256",
        "workerImageSha256",
        "connectorPackageSha256",
        "migrationInventorySha256",
        "configurationSha256",
        "authorityMountInventorySha256",
        "deploymentMode",
        "providerMode",
        "managedTenantCount",
        "migrationDifference",
      ],
      "release_inventory details",
    );
    if (
      !/^v\d+\.\d+\.\d+$/u.test(details.release) ||
      details.pullRequest !== candidateEvidence.candidate.pullRequest ||
      details.repositoryCommit !== candidateEvidence.candidate.commit ||
      details.deploymentMode !== "self_hosted" ||
      details.providerMode !== "disabled" ||
      details.managedTenantCount !== 0 ||
      details.migrationDifference !== 0
    ) {
      fail("release_inventory identity or disabled state differs");
    }
    uniqueNonzeroDigests(
      details,
      [
        "dashboardImageSha256",
        "workerImageSha256",
        "connectorPackageSha256",
        "migrationInventorySha256",
        "configurationSha256",
        "authorityMountInventorySha256",
      ],
      "release_inventory",
    );
    return;
  }
  if (artifactId === "approval_record") {
    exactKeys(
      details,
      ["approvedAt", "release", "approvals", "artifactSha256"],
      "approval_record details",
    );
    const approvedAt = exactUtcTime(
      details.approvedAt,
      "approval_record approvedAt",
    );
    if (approvedAt > observedAt || !/^v\d+\.\d+\.\d+$/u.test(details.release)) {
      fail("approval_record time or release differs");
    }
    const expectedApprovals = artifactCheckBindings.get("approval_record");
    if (
      !Array.isArray(details.approvals) ||
      details.approvals.length !== expectedApprovals.length
    ) {
      fail("approval_record approvals differ");
    }
    const approvalIds = new Set();
    const approvalDigests = new Set();
    for (const approval of details.approvals) {
      exactKeys(
        approval,
        ["id", "approved", "approvedAt", "evidenceSha256"],
        "approval_record approval",
      );
      if (
        !expectedApprovals.includes(approval.id) ||
        approvalIds.has(approval.id) ||
        approval.approved !== true ||
        exactUtcTime(
          approval.approvedAt,
          `approval_record ${approval.id} approvedAt`,
        ) > approvedAt
      ) {
        fail(`approval_record ${approval.id} differs`);
      }
      exactNonzeroDigest(
        approval.evidenceSha256,
        `approval_record ${approval.id} evidence`,
      );
      if (approvalDigests.has(approval.evidenceSha256)) {
        fail("approval_record approvals reuse one evidence digest");
      }
      approvalIds.add(approval.id);
      approvalDigests.add(approval.evidenceSha256);
    }
    exactKeys(
      details.artifactSha256,
      [...requiredArtifacts].filter((id) => id !== "approval_record"),
      "approval_record artifact bindings",
    );
    for (const [id, sha256] of Object.entries(details.artifactSha256)) {
      exactNonzeroDigest(sha256, `approval_record ${id} binding`);
    }
    return;
  }
  if (artifactId === "recovery_point") {
    exactKeys(
      details,
      [
        "createdAt",
        "verifiedAt",
        "baseBackupSha256",
        "walArchiveSha256",
        "configurationSha256",
        "restoreEvidenceSha256",
        "restorable",
        "rpoSeconds",
        "mutationCount",
      ],
      "recovery_point details",
    );
    const createdAt = exactUtcTime(
      details.createdAt,
      "recovery_point createdAt",
    );
    const verifiedAt = exactUtcTime(
      details.verifiedAt,
      "recovery_point verifiedAt",
    );
    if (
      createdAt > verifiedAt ||
      verifiedAt > observedAt ||
      details.restorable !== true ||
      !Number.isSafeInteger(details.rpoSeconds) ||
      details.rpoSeconds < 0 ||
      details.rpoSeconds > 60 ||
      details.mutationCount !== 0
    ) {
      fail("recovery_point timing, RPO, restore, or mutation evidence differs");
    }
    uniqueNonzeroDigests(
      details,
      [
        "baseBackupSha256",
        "walArchiveSha256",
        "configurationSha256",
        "restoreEvidenceSha256",
      ],
      "recovery_point",
    );
    return;
  }
  if (artifactId === "production_baseline") {
    exactKeys(
      details,
      [
        "capturedAt",
        "snapshotSha256",
        "sourceCoverageRatio",
        "managedTenantCount",
        "billingWorkerRunning",
        "providerRequestCount",
        "unresolvedAmbiguousOutcomeCount",
        "checkoutBlockedCount",
        "ledgerDifference",
        "mutationCount",
      ],
      "production_baseline details",
    );
    if (
      exactUtcTime(details.capturedAt, "production_baseline capturedAt") >
        observedAt ||
      details.sourceCoverageRatio !== 1 ||
      details.managedTenantCount !== 0 ||
      details.billingWorkerRunning !== false ||
      details.providerRequestCount !== 0 ||
      details.unresolvedAmbiguousOutcomeCount !== 0 ||
      details.checkoutBlockedCount !== 0 ||
      details.ledgerDifference !== 0 ||
      details.mutationCount !== 0
    ) {
      fail(
        "production_baseline authority, coverage, or difference evidence differs",
      );
    }
    exactNonzeroDigest(details.snapshotSha256, "production_baseline snapshot");
    return;
  }
  if (artifactId === "canary_journal") {
    exactKeys(
      details,
      [
        "startedAt",
        "endedAt",
        "intervalCount",
        "pilotTenantCount",
        "nonCanaryEnabledCount",
        "selfHostedProviderRequestCount",
        "mountedAuthorityFileCount",
        "registeredMigrationDifference",
        "sourceCoverageRatio",
        "assertions",
      ],
      "canary_journal details",
    );
    const startedAt = exactUtcTime(
      details.startedAt,
      "canary_journal startedAt",
    );
    const endedAt = exactUtcTime(details.endedAt, "canary_journal endedAt");
    const minimumIntervals = Math.ceil((endedAt - startedAt) / 3_600_000);
    if (
      startedAt >= endedAt ||
      endedAt > observedAt ||
      !Number.isSafeInteger(details.intervalCount) ||
      details.intervalCount < minimumIntervals ||
      details.pilotTenantCount !== 1 ||
      details.nonCanaryEnabledCount !== 0 ||
      details.selfHostedProviderRequestCount !== 0 ||
      details.mountedAuthorityFileCount !== 3 ||
      details.registeredMigrationDifference !== 0 ||
      details.sourceCoverageRatio !== 1
    ) {
      fail("canary_journal scope, timing, mount, or coverage evidence differs");
    }
    exactAssertions(
      details.assertions,
      artifactCheckBindings.get("canary_journal"),
      "canary_journal",
    );
    return;
  }
  if (artifactId === "reconciliation_report") {
    exactKeys(
      details,
      [
        "sourceCoverageRatio",
        "boundedConvergenceComplete",
        "unresolvedAmbiguousOutcomeCount",
        "unresolvedCriticalCount",
        "unresolvedHighCount",
        "assertions",
      ],
      "reconciliation_report details",
    );
    if (
      details.sourceCoverageRatio !== 1 ||
      details.boundedConvergenceComplete !== true ||
      details.unresolvedAmbiguousOutcomeCount !== 0 ||
      details.unresolvedCriticalCount !== 0 ||
      details.unresolvedHighCount !== 0
    ) {
      fail("reconciliation_report coverage or unresolved evidence differs");
    }
    exactAssertions(
      details.assertions,
      artifactCheckBindings.get("reconciliation_report"),
      "reconciliation_report",
    );
    return;
  }
  if (artifactId === "rollback_report") {
    exactKeys(
      details,
      [
        "startedAt",
        "endedAt",
        "durationSeconds",
        "providerOperationsDisabled",
        "protectedPathsAvailable",
        "checkoutAvailable",
        "selfHostedNoCall",
        "unresolvedAmbiguousOutcomeCount",
        "ledgerDifference",
        "evidenceSha256",
        "assertions",
      ],
      "rollback_report details",
    );
    const startedAt = exactUtcTime(
      details.startedAt,
      "rollback_report startedAt",
    );
    const endedAt = exactUtcTime(details.endedAt, "rollback_report endedAt");
    if (
      startedAt >= endedAt ||
      endedAt > observedAt ||
      !Number.isSafeInteger(details.durationSeconds) ||
      details.durationSeconds !== (endedAt - startedAt) / 1000 ||
      details.providerOperationsDisabled !== true ||
      details.protectedPathsAvailable !== true ||
      details.checkoutAvailable !== true ||
      details.selfHostedNoCall !== true ||
      details.unresolvedAmbiguousOutcomeCount !== 0 ||
      details.ledgerDifference !== 0
    ) {
      fail(
        "rollback_report timing, continuity, or difference evidence differs",
      );
    }
    exactNonzeroDigest(details.evidenceSha256, "rollback_report evidence");
    exactAssertions(
      details.assertions,
      artifactCheckBindings.get("rollback_report"),
      "rollback_report",
    );
    return;
  }
  if (artifactId === "observation_report") {
    exactKeys(
      details,
      [
        "startedAt",
        "endedAt",
        "durationSeconds",
        "sourceCoverageRatio",
        "selfHostedProviderRequestCount",
        "checkoutBlockedCount",
        "protectedPathDifferenceCount",
        "unresolvedAmbiguousOutcomeCount",
        "openCriticalCount",
        "openHighCount",
        "evidenceSha256",
        "assertions",
      ],
      "observation_report details",
    );
    const startedAt = exactUtcTime(
      details.startedAt,
      "observation_report startedAt",
    );
    const endedAt = exactUtcTime(details.endedAt, "observation_report endedAt");
    if (
      startedAt >= endedAt ||
      endedAt > observedAt ||
      !Number.isSafeInteger(details.durationSeconds) ||
      details.durationSeconds !== (endedAt - startedAt) / 1000 ||
      details.durationSeconds < 86_400 ||
      details.sourceCoverageRatio !== 1 ||
      details.selfHostedProviderRequestCount !== 0 ||
      details.checkoutBlockedCount !== 0 ||
      details.protectedPathDifferenceCount !== 0 ||
      details.unresolvedAmbiguousOutcomeCount !== 0 ||
      details.openCriticalCount !== 0 ||
      details.openHighCount !== 0
    ) {
      fail(
        "observation_report duration, coverage, or failure evidence differs",
      );
    }
    exactNonzeroDigest(details.evidenceSha256, "observation_report evidence");
    exactAssertions(
      details.assertions,
      artifactCheckBindings.get("observation_report"),
      "observation_report",
    );
    return;
  }
  fail(`unknown artifact detail contract ${artifactId}`);
};

const validateDocument = (
  candidateEvidence,
  candidateTasks = tasks,
  artifactReader = readBoundArtifact,
) => {
  if (candidateEvidence.schema !== "starfiniti.managed-billing-canary.v1") {
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
  for (const [approval, checkId] of Object.entries({
    approvedRelease: "approved_release",
    operatorAccess: "operator_access",
    stripeSandboxApproved: "approved_stripe_sandbox",
    commercialPolicyApproved: "approved_commercial_policy",
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
    /(password|passphrase|secret|private.?key|access.?token|refresh.?token|bearer|credential.?value|raw.?body|payment.?method|card|customer.?id|subscription.?id|invoice.?id|price.?id|meter.?id|provider.?event.?id|checkout.?session.?id|portal.?session.?id|idempotency.?key|auth.?uuid|tenant.?id|wallet.?id)/i;
  const forbiddenValue =
    /(-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/=-]{12,}|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b|\b(?:sk|rk|pk)_(?:test|live)_[A-Za-z0-9]{8,}\b|\b(?:whsec|epk)_[A-Za-z0-9]{8,}\b|\b(?:acct|bpc|ca|ch|coupon|cus|dp|evt|ii|il|in|invst|ipi|iss|mandate|me|mtr|pi|pm|price|prod|promo|re|req|seti|si|src|sub|sub_sched|tax|tok|txn)_[A-Za-z0-9]{12,}\b|\bcs_(?:test|live)_[A-Za-z0-9]{12,}\b|\bt=\d{9,},v1=[0-9a-f]{32,}\b)/i;
  const hasLikelyPaymentCard = (value) =>
    (value.match(/\b\d{13,19}\b/g) ?? []).some((candidate) => {
      let sum = 0;
      let doubleDigit = false;
      for (let index = candidate.length - 1; index >= 0; index -= 1) {
        let digit = Number(candidate[index]);
        if (doubleDigit) {
          digit *= 2;
          if (digit > 9) digit -= 9;
        }
        sum += digit;
        doubleDigit = !doubleDigit;
      }
      return sum % 10 === 0;
    });
  const inspectEvidence = (value, path = "evidence") => {
    if (Array.isArray(value)) {
      value.forEach((item, index) =>
        inspectEvidence(item, `${path}[${index}]`),
      );
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, nested] of Object.entries(value)) {
        if (forbiddenKey.test(key)) {
          fail(`forbidden sensitive key ${path}.${key}`);
        }
        inspectEvidence(nested, `${path}.${key}`);
      }
      return;
    }
    if (typeof value === "string") {
      if (forbiddenValue.test(value)) {
        fail(`forbidden sensitive value at ${path}`);
      }
      if (hasLikelyPaymentCard(value)) {
        fail(`forbidden card-like value at ${path}`);
      }
    }
  };
  validateCanaryManifestEnvelope(candidateEvidence, candidateTasks, fail, {
    inspect: inspectEvidence,
  });
  if (!Array.isArray(candidateEvidence.artifacts)) {
    fail("artifacts must be an array");
  }
  const artifactIds = new Set();
  const verifiedArtifactPaths = new Set();
  const verifiedArtifactDigests = new Set();
  const verifiedArtifactDocuments = new Map();
  for (const artifact of candidateEvidence.artifacts) {
    if (!requiredArtifacts.has(artifact.id))
      fail(`unknown artifact ${artifact.id}`);
    if (artifactIds.has(artifact.id)) fail(`duplicate artifact ${artifact.id}`);
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
      document?.schema !== "starfiniti.managed-billing-canary-artifact.v1" ||
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
    validateArtifactDetails(artifact.id, document, candidateEvidence);
    verifiedArtifactDocuments.set(artifact.id, document);
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

  const m14 = candidateTasks.tasks.find(
    (task) => task.id === "M14-MANAGED-BILLING",
  );
  const requiredCompletedSlices = new Set([
    "M14-S01-BILLING-AUTHORITY-AND-SELF-HOSTED-INDEPENDENCE",
    "M14-S02-STRIPE-WEBHOOK-INBOX",
    "M14-S03-CHECKOUT-PORTAL-AND-SUBSCRIPTION-LIFECYCLE",
    "M14-S04-IDEMPOTENT-USAGE-METERING",
    "M14-S05-DELINQUENCY-ENTITLEMENTS-AND-MANUAL-CONTRACTS",
  ]);
  const s06 = m14?.slices?.find(
    (slice) => slice.id === "M14-S06-CANARY-AND-CLOSE",
  );
  if (!m14 || !s06) fail("M14 or M14-S06 task is missing");
  for (const id of requiredCompletedSlices) {
    const slice = m14.slices.find((candidate) => candidate.id === id);
    if (slice?.status !== "complete") {
      fail(`${id} must be complete before canary`);
    }
  }
  const s05 = m14.slices.find(
    (slice) =>
      slice.id === "M14-S05-DELINQUENCY-ENTITLEMENTS-AND-MANUAL-CONTRACTS",
  );
  for (const id of [
    "M14-S05A-COMMERCIAL-POLICY-CORE",
    "M14-S05B-GROWTH-CONFIGURATION-ENFORCEMENT",
    "M14-S05C-MERCHANT-EXPERIENCE-AND-CLOSE",
  ]) {
    const slice = s05?.slices?.find((candidate) => candidate.id === id);
    if (slice?.status !== "completed") {
      fail(`${id} must be completed before canary`);
    }
  }
  if (m14.module_score !== calculatedScore) {
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
        "complete evidence requires release, operator, Stripe sandbox, commercial policy, and canary approval",
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
    const artifactById = new Map(
      candidateEvidence.artifacts.map((artifact) => [artifact.id, artifact]),
    );
    const approvalRecord = verifiedArtifactDocuments.get("approval_record");
    for (const artifactId of requiredArtifacts) {
      if (artifactId === "approval_record") continue;
      if (
        approvalRecord.details.artifactSha256[artifactId] !==
        artifactById.get(artifactId).sha256
      ) {
        fail(`approval_record binding differs for ${artifactId}`);
      }
    }
    const releaseObservedAt = exactUtcTime(
      verifiedArtifactDocuments.get("release_inventory").observedAt,
      "release_inventory observedAt",
    );
    const recoveryVerifiedAt = exactUtcTime(
      verifiedArtifactDocuments.get("recovery_point").details.verifiedAt,
      "recovery_point verifiedAt",
    );
    const baselineCapturedAt = exactUtcTime(
      verifiedArtifactDocuments.get("production_baseline").details.capturedAt,
      "production_baseline capturedAt",
    );
    const journal = verifiedArtifactDocuments.get("canary_journal");
    const journalStartedAt = exactUtcTime(
      journal.details.startedAt,
      "canary_journal startedAt",
    );
    const journalEndedAt = exactUtcTime(
      journal.details.endedAt,
      "canary_journal endedAt",
    );
    const reconciliationObservedAt = exactUtcTime(
      verifiedArtifactDocuments.get("reconciliation_report").observedAt,
      "reconciliation_report observedAt",
    );
    const rollbackObservedAt = exactUtcTime(
      verifiedArtifactDocuments.get("rollback_report").observedAt,
      "rollback_report observedAt",
    );
    const observation = verifiedArtifactDocuments.get("observation_report");
    const observationStartedAt = exactUtcTime(
      observation.details.startedAt,
      "observation_report startedAt",
    );
    const observationEndedAt = exactUtcTime(
      observation.details.endedAt,
      "observation_report endedAt",
    );
    const approvalObservedAt = exactUtcTime(
      approvalRecord.observedAt,
      "approval_record observedAt",
    );
    const latestPrerequisiteApprovalAt = Math.max(
      ...approvalRecord.details.approvals.map((approval) =>
        exactUtcTime(
          approval.approvedAt,
          `approval_record ${approval.id} approvedAt`,
        ),
      ),
    );
    if (
      releaseObservedAt > journalStartedAt ||
      recoveryVerifiedAt > journalStartedAt ||
      baselineCapturedAt > journalStartedAt ||
      latestPrerequisiteApprovalAt > journalStartedAt ||
      reconciliationObservedAt < journalEndedAt ||
      rollbackObservedAt < journalEndedAt ||
      observationStartedAt > journalStartedAt ||
      observationEndedAt < journalEndedAt ||
      approvalObservedAt < reconciliationObservedAt ||
      approvalObservedAt < rollbackObservedAt ||
      approvalObservedAt < observationEndedAt ||
      Date.parse(candidateEvidence.observedAt) < approvalObservedAt
    ) {
      fail("production artifact chronology differs");
    }
    if (calculatedScore < candidateEvidence.score.target || belowFloor.length) {
      fail("complete evidence does not meet score and category floors");
    }
    if (m14.status !== "complete" || s06.status !== "complete") {
      fail("complete evidence requires completed M14 and S06 task state");
    }
  } else if (m14.status !== "in_progress" || s06.status !== "in_progress") {
    fail("in-progress evidence must match in-progress M14 and S06 task state");
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
      "Release, recovery, approved Stripe sandbox, bounded billing canary, rollback, observation, and exact final reconciliation evidence are verified and digest-bound.";
    candidateEvidence.score.total = candidateEvidence.score.categories.reduce(
      (total, category) => total + category.score,
      0,
    );
    const m14 = candidateTasks.tasks.find(
      (task) => task.id === "M14-MANAGED-BILLING",
    );
    m14.status = "complete";
    m14.module_score = candidateEvidence.score.total;
    m14.slices.find((slice) => slice.id === "M14-S06-CANARY-AND-CLOSE").status =
      "complete";

    const fixtureTimes = {
      read_only_baseline: "2026-01-31T19:00:00Z",
      release_inventory: "2026-01-31T20:00:00Z",
      recovery_point: "2026-01-31T21:00:00Z",
      production_baseline: "2026-01-31T23:00:00Z",
      canary_journal: "2026-02-02T00:01:00Z",
      reconciliation_report: "2026-02-02T00:02:00Z",
      rollback_report: "2026-02-02T00:03:00Z",
      observation_report: "2026-02-02T00:04:00Z",
      approval_record: "2026-02-02T00:05:00Z",
    };
    const fixtureAssertions = (artifactId) =>
      artifactCheckBindings.get(artifactId).map((id) => ({
        id,
        status: "passed",
        evidenceSha256: digest(`fixture:${artifactId}:${id}`),
        differenceCount: 0,
      }));
    const fixtureDetails = (artifactId) => {
      if (artifactId === "read_only_baseline") {
        return {
          ...candidateEvidence.publicBaseline,
          applicationVm: 970,
          databaseVm: 971,
          applicationVmState: "running",
          databaseVmState: "running",
          deploymentMode: "self_hosted",
          providerConfigured: false,
          scope: "read_only",
          mutationCount: 0,
        };
      }
      if (artifactId === "release_inventory") {
        return {
          release: "v1.0.0",
          pullRequest: candidateEvidence.candidate.pullRequest,
          repositoryCommit: candidateEvidence.candidate.commit,
          dashboardImageSha256: digest("fixture:dashboard-image"),
          workerImageSha256: digest("fixture:worker-image"),
          connectorPackageSha256: digest("fixture:connector-package"),
          migrationInventorySha256: digest("fixture:migrations"),
          configurationSha256: digest("fixture:configuration"),
          authorityMountInventorySha256: digest("fixture:authority-mounts"),
          deploymentMode: "self_hosted",
          providerMode: "disabled",
          managedTenantCount: 0,
          migrationDifference: 0,
        };
      }
      if (artifactId === "recovery_point") {
        return {
          createdAt: "2026-01-31T20:30:00Z",
          verifiedAt: "2026-01-31T20:59:00Z",
          baseBackupSha256: digest("fixture:base-backup"),
          walArchiveSha256: digest("fixture:wal-archive"),
          configurationSha256: digest("fixture:recovery-configuration"),
          restoreEvidenceSha256: digest("fixture:restore-evidence"),
          restorable: true,
          rpoSeconds: 60,
          mutationCount: 0,
        };
      }
      if (artifactId === "production_baseline") {
        return {
          capturedAt: "2026-01-31T22:59:00Z",
          snapshotSha256: digest("fixture:production-baseline"),
          sourceCoverageRatio: 1,
          managedTenantCount: 0,
          billingWorkerRunning: false,
          providerRequestCount: 0,
          unresolvedAmbiguousOutcomeCount: 0,
          checkoutBlockedCount: 0,
          ledgerDifference: 0,
          mutationCount: 0,
        };
      }
      if (artifactId === "canary_journal") {
        return {
          startedAt: "2026-02-01T00:00:00Z",
          endedAt: "2026-02-02T00:00:00Z",
          intervalCount: 24,
          pilotTenantCount: 1,
          nonCanaryEnabledCount: 0,
          selfHostedProviderRequestCount: 0,
          mountedAuthorityFileCount: 3,
          registeredMigrationDifference: 0,
          sourceCoverageRatio: 1,
          assertions: fixtureAssertions(artifactId),
        };
      }
      if (artifactId === "reconciliation_report") {
        return {
          sourceCoverageRatio: 1,
          boundedConvergenceComplete: true,
          unresolvedAmbiguousOutcomeCount: 0,
          unresolvedCriticalCount: 0,
          unresolvedHighCount: 0,
          assertions: fixtureAssertions(artifactId),
        };
      }
      if (artifactId === "rollback_report") {
        return {
          startedAt: "2026-02-02T00:00:00Z",
          endedAt: "2026-02-02T00:01:00Z",
          durationSeconds: 60,
          providerOperationsDisabled: true,
          protectedPathsAvailable: true,
          checkoutAvailable: true,
          selfHostedNoCall: true,
          unresolvedAmbiguousOutcomeCount: 0,
          ledgerDifference: 0,
          evidenceSha256: digest("fixture:rollback-evidence"),
          assertions: fixtureAssertions(artifactId),
        };
      }
      if (artifactId === "observation_report") {
        return {
          startedAt: "2026-02-01T00:00:00Z",
          endedAt: "2026-02-02T00:02:00Z",
          durationSeconds: 86_520,
          sourceCoverageRatio: 1,
          selfHostedProviderRequestCount: 0,
          checkoutBlockedCount: 0,
          protectedPathDifferenceCount: 0,
          unresolvedAmbiguousOutcomeCount: 0,
          openCriticalCount: 0,
          openHighCount: 0,
          evidenceSha256: digest("fixture:observation-evidence"),
          assertions: fixtureAssertions(artifactId),
        };
      }
      if (artifactId === "approval_record") {
        return {
          approvedAt: fixtureTimes.approval_record,
          release: "v1.0.0",
          approvals: artifactCheckBindings.get(artifactId).map((id) => ({
            id,
            approved: true,
            approvedAt: "2026-01-31T18:00:00Z",
            evidenceSha256: digest(`fixture:approval:${id}`),
          })),
          artifactSha256: Object.fromEntries(
            candidateEvidence.artifacts
              .filter((artifact) => artifact.id !== "approval_record")
              .map((artifact) => [artifact.id, artifact.sha256]),
          ),
        };
      }
      fail(`unknown synthetic artifact ${artifactId}`);
    };

    const bindings = new Map();
    const artifactOrder = [
      ...candidateEvidence.artifacts.filter(
        (artifact) => artifact.id !== "approval_record",
      ),
      candidateEvidence.artifacts.find(
        (artifact) => artifact.id === "approval_record",
      ),
    ];
    artifactOrder.forEach((artifact) => {
      const document = {
        schema: "starfiniti.managed-billing-canary-artifact.v1",
        artifactId: artifact.id,
        candidateCommit: candidateEvidence.candidate.commit,
        observedAt: fixtureTimes[artifact.id],
        result: "verified",
        summary: `Synthetic self-test evidence verifies the exact ${artifact.id} completion boundary.`,
        checks: artifactCheckBindings.get(artifact.id),
        details: fixtureDetails(artifact.id),
      };
      const raw = JSON.stringify(document);
      artifact.status = "verified";
      artifact.path = `docs/plan/evidence/M14/production/billing-${artifact.id.replaceAll("_", "-")}-self-test.json`;
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
    "requires release, operator, Stripe sandbox, commercial policy, and canary approval",
    "unapproved evidence as complete",
  );

  const pendingCompletion = buildCompleteFixture();
  pendingCompletion.candidateEvidence.checks.find(
    (check) => check.id === "managed_entitlement_canary",
  ).status = "pending";
  expectRejected(
    pendingCompletion.candidateEvidence,
    "complete evidence has non-passing checks",
    "pending evidence as complete",
    pendingCompletion.candidateTasks,
    pendingCompletion.artifactReader,
  );

  const sensitiveKey = structuredClone(evidence);
  sensitiveKey.providerSecretValue = "must never be accepted";
  expectRejected(
    sensitiveKey,
    "forbidden sensitive key",
    "a sensitive evidence key",
  );

  const stripeResource = structuredClone(evidence);
  stripeResource.checks[0].evidence =
    "Unsafe raw resource cus_A1B2C3D4E5F6G7H8 must be rejected.";
  expectRejected(
    stripeResource,
    "forbidden sensitive value",
    "a raw Stripe resource value",
  );

  const cardValue = structuredClone(evidence);
  cardValue.checks[0].evidence =
    "Unsafe payment test value 4242424242424242 must be rejected.";
  expectRejected(
    cardValue,
    "forbidden card-like value",
    "a payment-card-like value",
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

  const hollowBaselineReader = (relativePath, expectedDigest, artifactId) => {
    const document = readBoundArtifact(
      relativePath,
      expectedDigest,
      artifactId,
    );
    if (artifactId === "read_only_baseline") document.details = {};
    return document;
  };
  expectRejected(
    evidence,
    "read_only_baseline details keys differ",
    "a digest-bound baseline with no semantic evidence",
    tasks,
    hollowBaselineReader,
  );

  const unsafeArtifactPath = structuredClone(evidence);
  unsafeArtifactPath.artifacts.find(
    (artifact) => artifact.id === "read_only_baseline",
  ).path = "docs/plan/evidence/M14/canary.yaml";
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

  const nonzeroReconciliationFixture = buildCompleteFixture();
  const nonzeroReconciliationReader = (
    relativePath,
    expectedDigest,
    artifactId,
  ) => {
    const document = nonzeroReconciliationFixture.artifactReader(
      relativePath,
      expectedDigest,
      artifactId,
    );
    if (artifactId === "reconciliation_report") {
      document.details.assertions[0].differenceCount = 1;
    }
    return document;
  };
  expectRejected(
    nonzeroReconciliationFixture.candidateEvidence,
    "not a zero-difference pass",
    "a reconciliation report with a nonzero difference",
    nonzeroReconciliationFixture.candidateTasks,
    nonzeroReconciliationReader,
  );

  const approvalBindingFixture = buildCompleteFixture();
  const approvalBindingReader = (relativePath, expectedDigest, artifactId) => {
    const document = approvalBindingFixture.artifactReader(
      relativePath,
      expectedDigest,
      artifactId,
    );
    if (artifactId === "approval_record") {
      document.details.artifactSha256.read_only_baseline = "f".repeat(64);
    }
    return document;
  };
  expectRejected(
    approvalBindingFixture.candidateEvidence,
    "approval_record binding differs",
    "an approval record bound to different production evidence",
    approvalBindingFixture.candidateTasks,
    approvalBindingReader,
  );

  const chronologyFixture = buildCompleteFixture();
  const chronologyReader = (relativePath, expectedDigest, artifactId) => {
    const document = chronologyFixture.artifactReader(
      relativePath,
      expectedDigest,
      artifactId,
    );
    if (artifactId === "release_inventory") {
      document.observedAt = "2026-02-01T00:01:00Z";
    }
    return document;
  };
  expectRejected(
    chronologyFixture.candidateEvidence,
    "production artifact chronology differs",
    "a release inventory observed after canary start",
    chronologyFixture.candidateTasks,
    chronologyReader,
  );

  const lateApprovalFixture = buildCompleteFixture();
  const lateApprovalReader = (relativePath, expectedDigest, artifactId) => {
    const document = lateApprovalFixture.artifactReader(
      relativePath,
      expectedDigest,
      artifactId,
    );
    if (artifactId === "approval_record") {
      document.details.approvals[0].approvedAt = "2026-02-01T00:01:00Z";
    }
    return document;
  };
  expectRejected(
    lateApprovalFixture.candidateEvidence,
    "production artifact chronology differs",
    "a prerequisite approval recorded after canary start",
    lateApprovalFixture.candidateTasks,
    lateApprovalReader,
  );

  const shortObservationFixture = buildCompleteFixture();
  const shortObservationReader = (relativePath, expectedDigest, artifactId) => {
    const document = shortObservationFixture.artifactReader(
      relativePath,
      expectedDigest,
      artifactId,
    );
    if (artifactId === "observation_report") {
      document.details.startedAt = "2026-02-01T23:02:00Z";
      document.details.durationSeconds = 3_600;
    }
    return document;
  };
  expectRejected(
    shortObservationFixture.candidateEvidence,
    "observation_report duration",
    "an observation shorter than twenty-four hours",
    shortObservationFixture.candidateTasks,
    shortObservationReader,
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
    .find((task) => task.id === "M14-MANAGED-BILLING")
    .slices.find(
      (slice) => slice.id === "M14-S04-IDEMPOTENT-USAGE-METERING",
    ).status = "in_progress";
  expectRejected(
    evidence,
    "must be complete before canary",
    "an incomplete prerequisite slice",
    incompleteSliceTasks,
  );

  const incompleteNestedSliceTasks = structuredClone(tasks);
  incompleteNestedSliceTasks.tasks
    .find((task) => task.id === "M14-MANAGED-BILLING")
    .slices.find(
      (slice) =>
        slice.id === "M14-S05-DELINQUENCY-ENTITLEMENTS-AND-MANUAL-CONTRACTS",
    )
    .slices.find(
      (slice) => slice.id === "M14-S05C-MERCHANT-EXPERIENCE-AND-CLOSE",
    ).status = "in_progress";
  expectRejected(
    evidence,
    "must be completed before canary",
    "an incomplete nested prerequisite slice",
    incompleteNestedSliceTasks,
  );

  const taskScoreDrift = structuredClone(tasks);
  taskScoreDrift.tasks.find(
    (task) => task.id === "M14-MANAGED-BILLING",
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

  const belowFloorCompletion = buildCompleteFixture();
  const belowFloorOperability =
    belowFloorCompletion.candidateEvidence.score.categories.find(
      (category) => category.id === "operability",
    );
  belowFloorOperability.score = 3;
  belowFloorCompletion.candidateEvidence.score.total =
    belowFloorCompletion.candidateEvidence.score.categories.reduce(
      (total, category) => total + category.score,
      0,
    );
  belowFloorCompletion.candidateTasks.tasks.find(
    (task) => task.id === "M14-MANAGED-BILLING",
  ).module_score = belowFloorCompletion.candidateEvidence.score.total;
  expectRejected(
    belowFloorCompletion.candidateEvidence,
    "score and category floors",
    "completion below a category floor",
    belowFloorCompletion.candidateTasks,
    belowFloorCompletion.artifactReader,
  );

  const completeFixture = buildCompleteFixture();
  validateDocument(
    completeFixture.candidateEvidence,
    completeFixture.candidateTasks,
    completeFixture.artifactReader,
  );
}

console.log(
  `Validated ${evidence.checks.length} M14 canary checks and ${evidence.score.categories.length} score categories; score ${result.calculatedScore}/100 with ${evidence.checks.filter((check) => check.status === "passed").length} passed, ${evidence.checks.filter((check) => check.status === "pending").length} pending, and ${evidence.checks.filter((check) => check.status === "failed").length} failed.`,
);
