import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

import { validateCanaryManifestEnvelope } from "./lib/validate-canary-manifest-envelope.mjs";
import { readBoundJsonArtifact } from "./lib/read-bound-json-artifact.mjs";
import { inspectMinimizedEvidence } from "./lib/inspect-minimized-evidence.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const evidencePath = join(root, "docs/plan/evidence/M11/canary.yaml");
const tasksPath = join(root, "docs/plan/TASKS.yaml");

const evidence = YAML.parse(readFileSync(evidencePath, "utf8"));
const tasks = YAML.parse(readFileSync(tasksPath, "utf8"));

const requiredChecks = new Set([
  "exact_head_ci",
  "migration_replay",
  "contract_client_matrix",
  "database_authority_matrix",
  "concurrency_matrix",
  "woocommerce_runtime_matrix",
  "browser_accessibility",
  "checkout_independence_matrix",
  "public_production_baseline",
  "operator_access",
  "client_package_vectors",
  "approved_release",
  "approved_pilot_store",
  "canary_approval",
  "pre_change_recovery_point",
  "production_source_baseline",
  "disabled_deployment",
  "migration_registration",
  "non_canary_disabled",
  "ecosystem_entitlement_canary",
  "isolated_topology_reconciliation",
  "shared_topology_reconciliation",
  "connector_removal_protection",
  "verified_customer_link_canary",
  "unlink_relink_rollback",
  "approved_rate_provider",
  "provider_adapter_isolation",
  "foreign_order_conversion",
  "foreign_refund_snapshot_reuse",
  "currency_analytics_reconciliation",
  "service_account_issuance",
  "customer_sync_replay",
  "activity_event_ledger_replay",
  "credential_rotation_revocation",
  "quota_concurrency_observation",
  "webhook_secret_mount_isolation",
  "webhook_delivery_replay",
  "webhook_disable_rotation_reactivation",
  "webhook_retirement_reconciliation",
  "production_outage_continuity",
  "latency_capacity_observation",
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
    "implicit_sharing_authority",
    "wallet sharing customer linking workspace membership or programme topology is inferred from email domain organization membership mutable claims or browser selectors",
  ],
  [
    "cross_tenant_exposure",
    "an unrelated tenant workspace customer rate credential endpoint event wallet ledger delivery or operational selector becomes visible mutable or externally actionable",
  ],
  [
    "duplicate_ecosystem_effect",
    "retry concurrency replay rotation lease recovery or receiver replay creates another identity receipt event ledger quota endpoint delivery or downstream business effect",
  ],
  [
    "historical_rate_drift",
    "caller-supplied processing-time refund-time or mutable current rate changes occurrence-bound conversion evidence award refund liability or analytics",
  ],
  [
    "identity_merge_violation",
    "email attribute provider profile or unverified proof merges customer authority or links a wallet with incompatible existing value",
  ],
  [
    "credential_or_secret_leak",
    "raw reusable service API webhook provider or signing material appears in database browser logs support evidence another process or an artifact",
  ],
  [
    "webhook_destination_escape",
    "redirect DNS rebinding private reserved mixed answer unpinned socket or unbounded response reaches an internal or unapproved receiver",
  ],
  [
    "quota_or_rate_bypass",
    "alternate credential route ordering concurrency or retry exceeds the exact fixed-minute quota provider bound payload size attempt ceiling or rate policy",
  ],
  [
    "connector_or_history_stranding",
    "workspace removal unlink endpoint retirement disablement or rollback loses connector history identity provenance customer access immutable evidence or loyalty value",
  ],
  [
    "ecosystem_value_dependency",
    "checkout ingestion refunds releases reconciliation balances promised rewards or existing redemption depends on ecosystem API currency provider or webhook availability",
  ],
  [
    "client_contract_drift",
    "supported TypeScript PHP Service API or Standard Webhooks bytes signature timestamp replay identity or minimized payload diverges from the versioned server contract",
  ],
  [
    "unsafe_rollout",
    "topology sharing linking conversion API credential endpoint or webhook is enabled outside the approved pilot before recovery baseline disabled deployment and isolation pass",
  ],
  [
    "reconciliation_gap",
    "topology identity currency event ledger quota endpoint delivery audit analytics checkout or privacy evidence differs from immutable source facts",
  ],
  [
    "sensitive_evidence",
    "contact identity raw payload reusable key signature coupon plaintext private selector rate-provider material or ledger metadata enters browser logs support output or evidence",
  ],
  [
    "score_or_approval_bypass",
    "module status completion approval provider policy artifact score total or category floor is changed without exact synchronized evidence",
  ],
  [
    "unexplained_or_unapproved_close",
    "any topology identity currency API webhook client value checkout privacy approval artifact score floor or critical finding remains unresolved",
  ],
]);
const checkArtifactBindings = new Map([
  ["public_production_baseline", ["read_only_baseline"]],
  ["operator_access", ["read_only_baseline"]],
  ["approved_release", ["approval_record"]],
  ["approved_pilot_store", ["approval_record"]],
  ["canary_approval", ["approval_record"]],
  ["pre_change_recovery_point", ["recovery_point"]],
  ["production_source_baseline", ["production_baseline"]],
  ["disabled_deployment", ["release_inventory", "canary_journal"]],
  ["migration_registration", ["release_inventory", "canary_journal"]],
  ["non_canary_disabled", ["canary_journal"]],
  ["ecosystem_entitlement_canary", ["canary_journal"]],
  [
    "isolated_topology_reconciliation",
    ["canary_journal", "reconciliation_report"],
  ],
  [
    "shared_topology_reconciliation",
    ["canary_journal", "reconciliation_report"],
  ],
  ["connector_removal_protection", ["canary_journal"]],
  [
    "verified_customer_link_canary",
    ["canary_journal", "reconciliation_report"],
  ],
  ["unlink_relink_rollback", ["canary_journal", "rollback_report"]],
  ["approved_rate_provider", ["approval_record"]],
  ["provider_adapter_isolation", ["canary_journal"]],
  ["foreign_order_conversion", ["canary_journal", "reconciliation_report"]],
  [
    "foreign_refund_snapshot_reuse",
    ["canary_journal", "reconciliation_report"],
  ],
  ["currency_analytics_reconciliation", ["reconciliation_report"]],
  ["service_account_issuance", ["canary_journal"]],
  ["customer_sync_replay", ["canary_journal", "reconciliation_report"]],
  ["activity_event_ledger_replay", ["canary_journal", "reconciliation_report"]],
  ["credential_rotation_revocation", ["canary_journal"]],
  ["quota_concurrency_observation", ["canary_journal", "observation_report"]],
  ["webhook_secret_mount_isolation", ["canary_journal"]],
  ["webhook_delivery_replay", ["canary_journal", "reconciliation_report"]],
  ["webhook_disable_rotation_reactivation", ["canary_journal"]],
  [
    "webhook_retirement_reconciliation",
    ["canary_journal", "reconciliation_report"],
  ],
  ["production_outage_continuity", ["canary_journal", "rollback_report"]],
  ["latency_capacity_observation", ["observation_report"]],
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
  throw new Error(`Ecosystem canary evidence invalid: ${message}`);
};

const digest = (value) => createHash("sha256").update(value).digest("hex");
const digestPattern = /^[0-9a-f]{64}$/u;
const inspectEvidence = (value, path = "evidence") =>
  inspectMinimizedEvidence(value, { fail, path });

const safeArtifactPath = (relativePath, artifactId) => {
  const artifactStem = artifactId.replaceAll("_", "-");
  const pattern = new RegExp(
    `^docs/plan/evidence/M11/production/ecosystem-${artifactStem}-[a-z0-9][a-z0-9-]{2,79}\\.json$`,
    "u",
  );
  if (typeof relativePath !== "string" || !pattern.test(relativePath)) {
    fail(`${artifactId} artifact path is unsafe`);
  }
  const absolute = resolve(root, relativePath);
  const allowed = `${resolve(root, "docs/plan/evidence/M11/production")}${sep}`;
  if (!absolute.startsWith(allowed))
    fail(`${artifactId} artifact escapes its root`);
  return absolute;
};

const readBoundArtifact = (relativePath, expectedDigest, artifactId) =>
  readBoundJsonArtifact(relativePath, expectedDigest, artifactId, {
    fail,
    resolvePath: safeArtifactPath,
  });

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

const exactNonnegativeInteger = (value, label) => {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(`${label} must be a nonnegative safe integer`);
  }
};

const exactPositiveInteger = (value, label) => {
  if (!Number.isSafeInteger(value) || value < 1) {
    fail(`${label} must be a positive safe integer`);
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
        "migrationInventorySha256",
        "clientInventorySha256",
        "ecosystemContractSha256",
        "deploymentState",
        "topologyWorkerRunning",
        "currencyWorkerRunning",
        "apiRoutesEnabled",
        "webhookWorkerCount",
        "registeredMigrationDifference",
        "assertions",
      ],
      "release_inventory details",
    );
    if (
      !/^v\d+\.\d+\.\d+$/u.test(details.release) ||
      details.release === candidateEvidence.currentProduction.release ||
      details.pullRequest !== candidateEvidence.candidate.pullRequest ||
      details.repositoryCommit !== candidateEvidence.candidate.commit ||
      details.deploymentState !== "disabled" ||
      details.topologyWorkerRunning !== false ||
      details.currencyWorkerRunning !== false ||
      details.apiRoutesEnabled !== false ||
      details.webhookWorkerCount !== 0 ||
      details.registeredMigrationDifference !== 0
    ) {
      fail("release_inventory identity or disabled state differs");
    }
    uniqueNonzeroDigests(
      details,
      [
        "dashboardImageSha256",
        "workerImageSha256",
        "migrationInventorySha256",
        "clientInventorySha256",
        "ecosystemContractSha256",
      ],
      "release_inventory",
    );
    exactAssertions(
      details.assertions,
      artifactCheckBindings.get("release_inventory"),
      "release_inventory",
    );
    return;
  }
  if (artifactId === "approval_record") {
    exactKeys(
      details,
      [
        "finalizedAt",
        "release",
        "pilotScopeSha256",
        "controlScopeSha256",
        "ratePolicySha256",
        "valueCeilingSha256",
        "approvals",
        "artifactSha256",
      ],
      "approval_record details",
    );
    const finalizedAt = exactUtcTime(
      details.finalizedAt,
      "approval_record finalizedAt",
    );
    if (
      finalizedAt > observedAt ||
      !/^v\d+\.\d+\.\d+$/u.test(details.release)
    ) {
      fail("approval_record time or release differs");
    }
    uniqueNonzeroDigests(
      details,
      [
        "pilotScopeSha256",
        "controlScopeSha256",
        "ratePolicySha256",
        "valueCeilingSha256",
      ],
      "approval_record approved scope",
    );
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
        ) > finalizedAt
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
        "applicationConfigurationSha256",
        "integrationReferenceInventorySha256",
        "restoreEvidenceSha256",
        "restorable",
        "rpoSeconds",
        "mutationCount",
        "assertions",
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
        "applicationConfigurationSha256",
        "integrationReferenceInventorySha256",
        "restoreEvidenceSha256",
      ],
      "recovery_point",
    );
    exactAssertions(
      details.assertions,
      artifactCheckBindings.get("recovery_point"),
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
        "topologyTotalsSha256",
        "identityTotalsSha256",
        "walletTotalsSha256",
        "currencyTotalsSha256",
        "eventLedgerTotalsSha256",
        "quotaTotalsSha256",
        "credentialLifecycleTotalsSha256",
        "endpointDeliveryTotalsSha256",
        "checkoutPrivacyTotalsSha256",
        "activeEcosystemCapabilityCount",
        "ecosystemWorkerCount",
        "ledgerDifference",
        "mutationCount",
        "assertions",
      ],
      "production_baseline details",
    );
    if (
      exactUtcTime(details.capturedAt, "production_baseline capturedAt") >
        observedAt ||
      details.sourceCoverageRatio !== 1 ||
      details.activeEcosystemCapabilityCount !== 0 ||
      details.ecosystemWorkerCount !== 0 ||
      details.ledgerDifference !== 0 ||
      details.mutationCount !== 0
    ) {
      fail(
        "production_baseline authority, coverage, or difference evidence differs",
      );
    }
    uniqueNonzeroDigests(
      details,
      [
        "snapshotSha256",
        "topologyTotalsSha256",
        "identityTotalsSha256",
        "walletTotalsSha256",
        "currencyTotalsSha256",
        "eventLedgerTotalsSha256",
        "quotaTotalsSha256",
        "credentialLifecycleTotalsSha256",
        "endpointDeliveryTotalsSha256",
        "checkoutPrivacyTotalsSha256",
      ],
      "production_baseline",
    );
    exactAssertions(
      details.assertions,
      artifactCheckBindings.get("production_baseline"),
      "production_baseline",
    );
    return;
  }
  if (artifactId === "canary_journal") {
    exactKeys(
      details,
      [
        "startedAt",
        "endedAt",
        "intervalCount",
        "pilotOrganizationCount",
        "controlOrganizationCount",
        "nonCanaryEnabledCount",
        "pilotScopeSha256",
        "controlScopeSha256",
        "ratePolicySha256",
        "valueCeilingSha256",
        "observedValueTotalsSha256",
        "valueWithinApprovedCeiling",
        "isolatedTopologyCheckCount",
        "sharedTopologyChangeCount",
        "connectorRemovalDeniedCount",
        "verifiedIdentityLinkCount",
        "unlinkRelinkCycleCount",
        "providerIsolationCheckCount",
        "foreignOrderCount",
        "foreignRefundCount",
        "originalSnapshotReuseCount",
        "serviceCredentialIssuedCount",
        "customerSyncEffectCount",
        "activityLedgerEffectCount",
        "credentialRotationCount",
        "credentialRevocationCount",
        "quotaAcceptedCount",
        "quotaRejectedCount",
        "webhookEndpointCount",
        "webhookDeliveryCount",
        "receiverEffectCount",
        "webhookRotationCount",
        "webhookRetirementCount",
        "independentOutageScenarioCount",
        "checkoutBlockedCount",
        "duplicateEffectCount",
        "ambiguousOutcomeCount",
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
    for (const key of [
      "isolatedTopologyCheckCount",
      "sharedTopologyChangeCount",
      "connectorRemovalDeniedCount",
      "verifiedIdentityLinkCount",
      "unlinkRelinkCycleCount",
      "providerIsolationCheckCount",
      "foreignOrderCount",
      "foreignRefundCount",
      "originalSnapshotReuseCount",
      "serviceCredentialIssuedCount",
      "customerSyncEffectCount",
      "activityLedgerEffectCount",
      "credentialRotationCount",
      "credentialRevocationCount",
      "quotaAcceptedCount",
      "quotaRejectedCount",
      "webhookEndpointCount",
      "webhookDeliveryCount",
      "receiverEffectCount",
      "webhookRotationCount",
      "webhookRetirementCount",
    ]) {
      exactPositiveInteger(details[key], `canary_journal ${key}`);
    }
    if (
      startedAt >= endedAt ||
      endedAt > observedAt ||
      !Number.isSafeInteger(details.intervalCount) ||
      details.intervalCount < minimumIntervals ||
      details.pilotOrganizationCount !== 1 ||
      details.controlOrganizationCount !== 1 ||
      details.nonCanaryEnabledCount !== 0 ||
      details.valueWithinApprovedCeiling !== true ||
      details.isolatedTopologyCheckCount !== 1 ||
      details.sharedTopologyChangeCount !== 1 ||
      details.connectorRemovalDeniedCount !== 1 ||
      details.verifiedIdentityLinkCount !== 1 ||
      details.unlinkRelinkCycleCount !== 1 ||
      details.providerIsolationCheckCount !== 1 ||
      details.foreignOrderCount !== 1 ||
      details.foreignRefundCount !== 1 ||
      details.originalSnapshotReuseCount !== 1 ||
      details.serviceCredentialIssuedCount !== 1 ||
      details.customerSyncEffectCount !== 1 ||
      details.activityLedgerEffectCount !== 1 ||
      details.credentialRotationCount !== 1 ||
      details.credentialRevocationCount !== 1 ||
      details.quotaAcceptedCount + details.quotaRejectedCount > 10_000 ||
      details.webhookEndpointCount !== 1 ||
      details.webhookDeliveryCount !== 1 ||
      details.receiverEffectCount !== 1 ||
      details.webhookRotationCount !== 1 ||
      details.webhookRetirementCount !== 1 ||
      details.independentOutageScenarioCount !== 4 ||
      details.checkoutBlockedCount !== 0 ||
      details.duplicateEffectCount !== 0 ||
      details.ambiguousOutcomeCount !== 0 ||
      details.sourceCoverageRatio !== 1
    ) {
      fail(
        "canary_journal scope, timing, effect, or coverage evidence differs",
      );
    }
    uniqueNonzeroDigests(
      details,
      [
        "pilotScopeSha256",
        "controlScopeSha256",
        "ratePolicySha256",
        "valueCeilingSha256",
        "observedValueTotalsSha256",
      ],
      "canary_journal approved scope",
    );
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
        "isolatedTopologyCheckCount",
        "sharedTopologyChangeCount",
        "connectorRemovalDeniedCount",
        "verifiedIdentityLinkCount",
        "unlinkRelinkCycleCount",
        "providerIsolationCheckCount",
        "foreignOrderCount",
        "foreignRefundCount",
        "originalSnapshotReuseCount",
        "serviceCredentialIssuedCount",
        "customerSyncEffectCount",
        "activityLedgerEffectCount",
        "credentialRotationCount",
        "credentialRevocationCount",
        "webhookEndpointCount",
        "webhookDeliveryCount",
        "receiverEffectCount",
        "webhookRotationCount",
        "webhookRetirementCount",
        "observedValueTotalsSha256",
        "valueWithinApprovedCeiling",
        "topologyDifferenceCount",
        "connectorProtectionDifferenceCount",
        "identityDifferenceCount",
        "walletDifferenceCount",
        "currencyAmountMinorDifference",
        "snapshotReuseDifferenceCount",
        "eventDifferenceCount",
        "ledgerDifference",
        "quotaDifferenceCount",
        "credentialLifecycleDifferenceCount",
        "endpointDifferenceCount",
        "deliveryDifferenceCount",
        "analyticsDifferenceCount",
        "checkoutDifferenceCount",
        "customerValueDifference",
        "privacyDifferenceCount",
        "unresolvedAmbiguousOutcomeCount",
        "unresolvedCriticalCount",
        "unresolvedHighCount",
        "assertions",
      ],
      "reconciliation_report details",
    );
    for (const key of [
      "isolatedTopologyCheckCount",
      "sharedTopologyChangeCount",
      "connectorRemovalDeniedCount",
      "verifiedIdentityLinkCount",
      "unlinkRelinkCycleCount",
      "providerIsolationCheckCount",
      "foreignOrderCount",
      "foreignRefundCount",
      "originalSnapshotReuseCount",
      "serviceCredentialIssuedCount",
      "customerSyncEffectCount",
      "activityLedgerEffectCount",
      "credentialRotationCount",
      "credentialRevocationCount",
      "webhookEndpointCount",
      "webhookDeliveryCount",
      "receiverEffectCount",
      "webhookRotationCount",
      "webhookRetirementCount",
    ]) {
      exactPositiveInteger(details[key], `reconciliation_report ${key}`);
    }
    for (const key of [
      "topologyDifferenceCount",
      "connectorProtectionDifferenceCount",
      "identityDifferenceCount",
      "walletDifferenceCount",
      "currencyAmountMinorDifference",
      "snapshotReuseDifferenceCount",
      "eventDifferenceCount",
      "ledgerDifference",
      "quotaDifferenceCount",
      "credentialLifecycleDifferenceCount",
      "endpointDifferenceCount",
      "deliveryDifferenceCount",
      "analyticsDifferenceCount",
      "checkoutDifferenceCount",
      "customerValueDifference",
      "privacyDifferenceCount",
      "unresolvedAmbiguousOutcomeCount",
      "unresolvedCriticalCount",
      "unresolvedHighCount",
    ]) {
      if (details[key] !== 0) {
        fail("reconciliation_report value or unresolved evidence differs");
      }
    }
    if (
      details.sourceCoverageRatio !== 1 ||
      details.boundedConvergenceComplete !== true ||
      details.valueWithinApprovedCeiling !== true
    ) {
      fail("reconciliation_report value or unresolved evidence differs");
    }
    exactNonzeroDigest(
      details.observedValueTotalsSha256,
      "reconciliation_report observed value totals",
    );
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
        "allEcosystemCapabilitiesDisabled",
        "serviceCredentialsRevoked",
        "webhookWorkersStopped",
        "priorImagesRestored",
        "topologyRestored",
        "identityRollbackComplete",
        "customerAccessAvailable",
        "checkoutAvailable",
        "immutableHistoryPreserved",
        "unresolvedAmbiguousOutcomeCount",
        "ledgerDifference",
        "customerValueDifference",
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
      details.allEcosystemCapabilitiesDisabled !== true ||
      details.serviceCredentialsRevoked !== true ||
      details.webhookWorkersStopped !== true ||
      details.priorImagesRestored !== true ||
      details.topologyRestored !== true ||
      details.identityRollbackComplete !== true ||
      details.customerAccessAvailable !== true ||
      details.checkoutAvailable !== true ||
      details.immutableHistoryPreserved !== true ||
      details.unresolvedAmbiguousOutcomeCount !== 0 ||
      details.ledgerDifference !== 0 ||
      details.customerValueDifference !== 0
    ) {
      fail(
        "rollback_report timing, authority, continuity, or difference evidence differs",
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
        "sampleIntervalCount",
        "sourceCoverageRatio",
        "latencyWithinApprovedBounds",
        "capacityWithinApprovedBounds",
        "apiP95LatencyMs",
        "conversionP95LatencyMs",
        "webhookP95LatencyMs",
        "maxQueueDepth",
        "quotaAcceptedCount",
        "quotaRejectedCount",
        "independentOutageScenarioCount",
        "duplicateEffectCount",
        "customerAccessErrorCount",
        "checkoutBlockedCount",
        "privacyIncidentCount",
        "topologyDifferenceCount",
        "identityDifferenceCount",
        "currencyAmountMinorDifference",
        "ledgerDifference",
        "deliveryDifferenceCount",
        "customerValueDifference",
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
    const minimumIntervals = Math.ceil((endedAt - startedAt) / 3_600_000);
    for (const key of [
      "apiP95LatencyMs",
      "conversionP95LatencyMs",
      "webhookP95LatencyMs",
      "quotaAcceptedCount",
      "quotaRejectedCount",
    ]) {
      exactPositiveInteger(details[key], `observation_report ${key}`);
    }
    exactNonnegativeInteger(
      details.maxQueueDepth,
      "observation_report maxQueueDepth",
    );
    if (
      startedAt >= endedAt ||
      endedAt > observedAt ||
      !Number.isSafeInteger(details.durationSeconds) ||
      details.durationSeconds !== (endedAt - startedAt) / 1000 ||
      details.durationSeconds < 86_400 ||
      !Number.isSafeInteger(details.sampleIntervalCount) ||
      details.sampleIntervalCount < minimumIntervals ||
      details.sourceCoverageRatio !== 1 ||
      details.latencyWithinApprovedBounds !== true ||
      details.capacityWithinApprovedBounds !== true ||
      details.apiP95LatencyMs > 60_000 ||
      details.conversionP95LatencyMs > 60_000 ||
      details.webhookP95LatencyMs > 60_000 ||
      details.maxQueueDepth > 100_000 ||
      details.quotaAcceptedCount + details.quotaRejectedCount > 10_000 ||
      details.independentOutageScenarioCount !== 4 ||
      details.duplicateEffectCount !== 0 ||
      details.customerAccessErrorCount !== 0 ||
      details.checkoutBlockedCount !== 0 ||
      details.privacyIncidentCount !== 0 ||
      details.topologyDifferenceCount !== 0 ||
      details.identityDifferenceCount !== 0 ||
      details.currencyAmountMinorDifference !== 0 ||
      details.ledgerDifference !== 0 ||
      details.deliveryDifferenceCount !== 0 ||
      details.customerValueDifference !== 0 ||
      details.openCriticalCount !== 0 ||
      details.openHighCount !== 0
    ) {
      fail(
        "observation_report duration, coverage, capacity, or failure evidence differs",
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
  validateCanaryManifestEnvelope(candidateEvidence, candidateTasks, fail, {
    inspect: inspectEvidence,
  });
  if (candidateEvidence.schema !== "starfiniti.ecosystem-canary.v1") {
    fail("unexpected schema");
  }
  if (!new Set(["in_progress", "complete"]).has(candidateEvidence.status)) {
    fail("status must be in_progress or complete");
  }
  const candidateObservedAt = exactUtcTime(
    candidateEvidence.observedAt,
    "observedAt",
  );
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
  const verifiedArtifactDocuments = new Map();
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
    exactKeys(
      document,
      [
        "schema",
        "artifactId",
        "candidateCommit",
        "observedAt",
        "result",
        "summary",
        "checks",
        "details",
      ],
      `${artifact.id} artifact document`,
    );
    if (
      document?.schema !== "starfiniti.ecosystem-canary-artifact.v1" ||
      document.artifactId !== artifact.id ||
      document.candidateCommit !== candidateEvidence.candidate.commit ||
      document.result !== "verified" ||
      typeof document.summary !== "string" ||
      document.summary.length < 20 ||
      document.summary !== document.summary.trim() ||
      typeof document.observedAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(document.observedAt) ||
      Number.isNaN(Date.parse(document.observedAt)) ||
      Date.parse(document.observedAt) > candidateObservedAt
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

  const m11 = candidateTasks.tasks.find((task) => task.id === "M11-ECOSYSTEM");
  const requiredCompletedSlices = new Set([
    "M11-S01-EXPLICIT-MULTI-STORE-SHARING",
    "M11-S02-EXPLICIT-CROSS-WORKSPACE-CUSTOMER-LINKING",
    "M11-S03-MULTI-CURRENCY-EVIDENCE",
    "M11-S04-SERVICE-ACCOUNTS-AND-INBOUND-APIS",
    "M11-S05-OUTBOUND-WEBHOOKS-CLIENTS-AND-OPERATIONS",
  ]);
  const s06 = m11?.slices?.find(
    (slice) => slice.id === "M11-S06-SHADOW-CANARY-AND-CLOSE",
  );
  if (!m11 || !s06) fail("M11 or M11-S06 task is missing");
  for (const id of requiredCompletedSlices) {
    const slice = m11.slices.find((candidate) => candidate.id === id);
    if (!new Set(["complete", "completed"]).has(slice?.status)) {
      fail(`${id} must be completed before canary`);
    }
  }
  if (m11.module_score !== calculatedScore) {
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
    const artifactById = new Map(
      candidateEvidence.artifacts.map((artifact) => [artifact.id, artifact]),
    );
    const approvalRecord = verifiedArtifactDocuments.get("approval_record");
    const releaseInventory = verifiedArtifactDocuments.get("release_inventory");
    if (approvalRecord.details.release !== releaseInventory.details.release) {
      fail("approval_record release differs from release_inventory");
    }
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
      releaseInventory.observedAt,
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
    const reconciliation = verifiedArtifactDocuments.get(
      "reconciliation_report",
    );
    const reconciliationObservedAt = exactUtcTime(
      reconciliation.observedAt,
      "reconciliation_report observedAt",
    );
    const rollback = verifiedArtifactDocuments.get("rollback_report");
    const rollbackStartedAt = exactUtcTime(
      rollback.details.startedAt,
      "rollback_report startedAt",
    );
    const rollbackObservedAt = exactUtcTime(
      rollback.observedAt,
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
    const approvalFinalizedAt = exactUtcTime(
      approvalRecord.details.finalizedAt,
      "approval_record finalizedAt",
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
      approvalRecord.details.pilotScopeSha256 !==
        journal.details.pilotScopeSha256 ||
      approvalRecord.details.controlScopeSha256 !==
        journal.details.controlScopeSha256 ||
      approvalRecord.details.ratePolicySha256 !==
        journal.details.ratePolicySha256 ||
      approvalRecord.details.valueCeilingSha256 !==
        journal.details.valueCeilingSha256
    ) {
      fail("approved ecosystem scope differs from the canary journal");
    }
    for (const key of [
      "isolatedTopologyCheckCount",
      "sharedTopologyChangeCount",
      "connectorRemovalDeniedCount",
      "verifiedIdentityLinkCount",
      "unlinkRelinkCycleCount",
      "providerIsolationCheckCount",
      "foreignOrderCount",
      "foreignRefundCount",
      "originalSnapshotReuseCount",
      "serviceCredentialIssuedCount",
      "customerSyncEffectCount",
      "activityLedgerEffectCount",
      "credentialRotationCount",
      "credentialRevocationCount",
      "webhookEndpointCount",
      "webhookDeliveryCount",
      "receiverEffectCount",
      "webhookRotationCount",
      "webhookRetirementCount",
    ]) {
      if (reconciliation.details[key] !== journal.details[key]) {
        fail(`canary and reconciliation ${key} differ`);
      }
    }
    if (
      reconciliation.details.observedValueTotalsSha256 !==
      journal.details.observedValueTotalsSha256
    ) {
      fail("canary and reconciliation observed value totals differ");
    }
    if (
      observation.details.quotaAcceptedCount !==
        journal.details.quotaAcceptedCount ||
      observation.details.quotaRejectedCount !==
        journal.details.quotaRejectedCount ||
      observation.details.independentOutageScenarioCount !==
        journal.details.independentOutageScenarioCount
    ) {
      fail("canary and observation scope counts differ");
    }
    if (
      releaseObservedAt > journalStartedAt ||
      recoveryVerifiedAt > journalStartedAt ||
      baselineCapturedAt > journalStartedAt ||
      latestPrerequisiteApprovalAt > journalStartedAt ||
      reconciliationObservedAt < journalEndedAt ||
      rollbackStartedAt < journalEndedAt ||
      rollbackObservedAt < journalEndedAt ||
      observationStartedAt > journalStartedAt ||
      observationEndedAt < journalEndedAt ||
      approvalFinalizedAt < reconciliationObservedAt ||
      approvalFinalizedAt < rollbackObservedAt ||
      approvalFinalizedAt < observationEndedAt ||
      approvalObservedAt < approvalFinalizedAt ||
      candidateObservedAt < approvalObservedAt
    ) {
      fail("production artifact chronology differs");
    }
    if (calculatedScore < candidateEvidence.score.target || belowFloor.length) {
      fail("complete evidence does not meet score and category floors");
    }
    if (m11.status !== "complete" || s06.status !== "completed") {
      fail("complete evidence requires completed M11 and S06 task state");
    }
  } else if (m11.status !== "in_progress" || s06.status !== "in_progress") {
    fail("in-progress evidence must match in-progress M11 and S06 task state");
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
    const m11 = candidateTasks.tasks.find(
      (task) => task.id === "M11-ECOSYSTEM",
    );
    m11.status = "complete";
    m11.module_score = candidateEvidence.score.total;
    m11.slices.find(
      (slice) => slice.id === "M11-S06-SHADOW-CANARY-AND-CLOSE",
    ).status = "completed";

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
    candidateEvidence.observedAt = fixtureTimes.approval_record;
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
          migrationInventorySha256: digest("fixture:migration-inventory"),
          clientInventorySha256: digest("fixture:client-inventory"),
          ecosystemContractSha256: digest("fixture:ecosystem-contract"),
          deploymentState: "disabled",
          topologyWorkerRunning: false,
          currencyWorkerRunning: false,
          apiRoutesEnabled: false,
          webhookWorkerCount: 0,
          registeredMigrationDifference: 0,
          assertions: fixtureAssertions(artifactId),
        };
      }
      if (artifactId === "recovery_point") {
        return {
          createdAt: "2026-01-31T20:30:00Z",
          verifiedAt: "2026-01-31T20:59:00Z",
          baseBackupSha256: digest("fixture:base-backup"),
          walArchiveSha256: digest("fixture:wal-archive"),
          applicationConfigurationSha256: digest(
            "fixture:application-configuration",
          ),
          integrationReferenceInventorySha256: digest(
            "fixture:integration-reference-inventory",
          ),
          restoreEvidenceSha256: digest("fixture:restore-evidence"),
          restorable: true,
          rpoSeconds: 60,
          mutationCount: 0,
          assertions: fixtureAssertions(artifactId),
        };
      }
      if (artifactId === "production_baseline") {
        return {
          capturedAt: "2026-01-31T22:59:00Z",
          snapshotSha256: digest("fixture:production-baseline"),
          sourceCoverageRatio: 1,
          topologyTotalsSha256: digest("fixture:topology-totals"),
          identityTotalsSha256: digest("fixture:identity-totals"),
          walletTotalsSha256: digest("fixture:wallet-totals"),
          currencyTotalsSha256: digest("fixture:currency-totals"),
          eventLedgerTotalsSha256: digest("fixture:event-ledger-totals"),
          quotaTotalsSha256: digest("fixture:quota-totals"),
          credentialLifecycleTotalsSha256: digest(
            "fixture:credential-lifecycle-totals",
          ),
          endpointDeliveryTotalsSha256: digest(
            "fixture:endpoint-delivery-totals",
          ),
          checkoutPrivacyTotalsSha256: digest(
            "fixture:checkout-privacy-totals",
          ),
          activeEcosystemCapabilityCount: 0,
          ecosystemWorkerCount: 0,
          ledgerDifference: 0,
          mutationCount: 0,
          assertions: fixtureAssertions(artifactId),
        };
      }
      if (artifactId === "canary_journal") {
        return {
          startedAt: "2026-02-01T00:00:00Z",
          endedAt: "2026-02-02T00:00:00Z",
          intervalCount: 24,
          pilotOrganizationCount: 1,
          controlOrganizationCount: 1,
          nonCanaryEnabledCount: 0,
          pilotScopeSha256: digest("fixture:pilot-scope"),
          controlScopeSha256: digest("fixture:control-scope"),
          ratePolicySha256: digest("fixture:rate-policy"),
          valueCeilingSha256: digest("fixture:value-ceiling"),
          observedValueTotalsSha256: digest("fixture:observed-value-totals"),
          valueWithinApprovedCeiling: true,
          isolatedTopologyCheckCount: 1,
          sharedTopologyChangeCount: 1,
          connectorRemovalDeniedCount: 1,
          verifiedIdentityLinkCount: 1,
          unlinkRelinkCycleCount: 1,
          providerIsolationCheckCount: 1,
          foreignOrderCount: 1,
          foreignRefundCount: 1,
          originalSnapshotReuseCount: 1,
          serviceCredentialIssuedCount: 1,
          customerSyncEffectCount: 1,
          activityLedgerEffectCount: 1,
          credentialRotationCount: 1,
          credentialRevocationCount: 1,
          quotaAcceptedCount: 3,
          quotaRejectedCount: 1,
          webhookEndpointCount: 1,
          webhookDeliveryCount: 1,
          receiverEffectCount: 1,
          webhookRotationCount: 1,
          webhookRetirementCount: 1,
          independentOutageScenarioCount: 4,
          checkoutBlockedCount: 0,
          duplicateEffectCount: 0,
          ambiguousOutcomeCount: 0,
          sourceCoverageRatio: 1,
          assertions: fixtureAssertions(artifactId),
        };
      }
      if (artifactId === "reconciliation_report") {
        return {
          sourceCoverageRatio: 1,
          boundedConvergenceComplete: true,
          isolatedTopologyCheckCount: 1,
          sharedTopologyChangeCount: 1,
          connectorRemovalDeniedCount: 1,
          verifiedIdentityLinkCount: 1,
          unlinkRelinkCycleCount: 1,
          providerIsolationCheckCount: 1,
          foreignOrderCount: 1,
          foreignRefundCount: 1,
          originalSnapshotReuseCount: 1,
          serviceCredentialIssuedCount: 1,
          customerSyncEffectCount: 1,
          activityLedgerEffectCount: 1,
          credentialRotationCount: 1,
          credentialRevocationCount: 1,
          webhookEndpointCount: 1,
          webhookDeliveryCount: 1,
          receiverEffectCount: 1,
          webhookRotationCount: 1,
          webhookRetirementCount: 1,
          observedValueTotalsSha256: digest("fixture:observed-value-totals"),
          valueWithinApprovedCeiling: true,
          topologyDifferenceCount: 0,
          connectorProtectionDifferenceCount: 0,
          identityDifferenceCount: 0,
          walletDifferenceCount: 0,
          currencyAmountMinorDifference: 0,
          snapshotReuseDifferenceCount: 0,
          eventDifferenceCount: 0,
          ledgerDifference: 0,
          quotaDifferenceCount: 0,
          credentialLifecycleDifferenceCount: 0,
          endpointDifferenceCount: 0,
          deliveryDifferenceCount: 0,
          analyticsDifferenceCount: 0,
          checkoutDifferenceCount: 0,
          customerValueDifference: 0,
          privacyDifferenceCount: 0,
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
          allEcosystemCapabilitiesDisabled: true,
          serviceCredentialsRevoked: true,
          webhookWorkersStopped: true,
          priorImagesRestored: true,
          topologyRestored: true,
          identityRollbackComplete: true,
          customerAccessAvailable: true,
          checkoutAvailable: true,
          immutableHistoryPreserved: true,
          unresolvedAmbiguousOutcomeCount: 0,
          ledgerDifference: 0,
          customerValueDifference: 0,
          evidenceSha256: digest("fixture:rollback-evidence"),
          assertions: fixtureAssertions(artifactId),
        };
      }
      if (artifactId === "observation_report") {
        return {
          startedAt: "2026-02-01T00:00:00Z",
          endedAt: "2026-02-02T00:02:00Z",
          durationSeconds: 86_520,
          sampleIntervalCount: 25,
          sourceCoverageRatio: 1,
          latencyWithinApprovedBounds: true,
          capacityWithinApprovedBounds: true,
          apiP95LatencyMs: 250,
          conversionP95LatencyMs: 300,
          webhookP95LatencyMs: 400,
          maxQueueDepth: 5,
          quotaAcceptedCount: 3,
          quotaRejectedCount: 1,
          independentOutageScenarioCount: 4,
          duplicateEffectCount: 0,
          customerAccessErrorCount: 0,
          checkoutBlockedCount: 0,
          privacyIncidentCount: 0,
          topologyDifferenceCount: 0,
          identityDifferenceCount: 0,
          currencyAmountMinorDifference: 0,
          ledgerDifference: 0,
          deliveryDifferenceCount: 0,
          customerValueDifference: 0,
          openCriticalCount: 0,
          openHighCount: 0,
          evidenceSha256: digest("fixture:observation-evidence"),
          assertions: fixtureAssertions(artifactId),
        };
      }
      if (artifactId === "approval_record") {
        return {
          finalizedAt: fixtureTimes.approval_record,
          release: "v1.0.0",
          pilotScopeSha256: digest("fixture:pilot-scope"),
          controlScopeSha256: digest("fixture:control-scope"),
          ratePolicySha256: digest("fixture:rate-policy"),
          valueCeilingSha256: digest("fixture:value-ceiling"),
          approvals: artifactCheckBindings.get(artifactId).map((id) => ({
            id,
            approved: true,
            approvedAt: "2026-01-31T22:00:00Z",
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
        schema: "starfiniti.ecosystem-canary-artifact.v1",
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
      artifact.path = `docs/plan/evidence/M11/production/ecosystem-${artifact.id.replaceAll("_", "-")}-self-test.json`;
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
    (check) => check.id === "ecosystem_entitlement_canary",
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

  const impossibleManifestTime = structuredClone(evidence);
  impossibleManifestTime.observedAt = "2026-02-31T00:00:00Z";
  expectRejected(
    impossibleManifestTime,
    "observedAt must be an exact UTC timestamp",
    "an impossible manifest calendar time",
  );

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

  const extraArtifactFieldReader = (
    relativePath,
    expectedDigest,
    artifactId,
  ) => {
    const document = readBoundArtifact(
      relativePath,
      expectedDigest,
      artifactId,
    );
    if (artifactId === "read_only_baseline") document.unreviewed = true;
    return document;
  };
  expectRejected(
    evidence,
    "artifact document keys differ",
    "an artifact with an unreviewed top-level field",
    tasks,
    extraArtifactFieldReader,
  );

  const unsafeArtifactPath = structuredClone(evidence);
  unsafeArtifactPath.artifacts.find(
    (artifact) => artifact.id === "read_only_baseline",
  ).path = "docs/plan/evidence/M11/canary.yaml";
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
      document.details.currencyAmountMinorDifference = 1;
    }
    return document;
  };
  expectRejected(
    nonzeroReconciliationFixture.candidateEvidence,
    "value or unresolved evidence differs",
    "a reconciliation report with currency drift",
    nonzeroReconciliationFixture.candidateTasks,
    nonzeroReconciliationReader,
  );

  const reusedProductionReleaseFixture = buildCompleteFixture();
  const reusedProductionReleaseReader = (
    relativePath,
    expectedDigest,
    artifactId,
  ) => {
    const document = reusedProductionReleaseFixture.artifactReader(
      relativePath,
      expectedDigest,
      artifactId,
    );
    if (artifactId === "release_inventory") {
      document.details.release =
        reusedProductionReleaseFixture.candidateEvidence.currentProduction.release;
    }
    if (artifactId === "approval_record") {
      document.details.release =
        reusedProductionReleaseFixture.candidateEvidence.currentProduction.release;
    }
    return document;
  };
  expectRejected(
    reusedProductionReleaseFixture.candidateEvidence,
    "release_inventory identity or disabled state differs",
    "a candidate that reuses the current production release",
    reusedProductionReleaseFixture.candidateTasks,
    reusedProductionReleaseReader,
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

  const approvedScopeFixture = buildCompleteFixture();
  const approvedScopeReader = (relativePath, expectedDigest, artifactId) => {
    const document = approvedScopeFixture.artifactReader(
      relativePath,
      expectedDigest,
      artifactId,
    );
    if (artifactId === "canary_journal") {
      document.details.ratePolicySha256 = digest(
        "fixture:different-rate-policy",
      );
    }
    return document;
  };
  expectRejected(
    approvedScopeFixture.candidateEvidence,
    "approved ecosystem scope differs",
    "a canary journal for a different approved rate policy",
    approvedScopeFixture.candidateTasks,
    approvedScopeReader,
  );

  const countMismatchFixture = buildCompleteFixture();
  const countMismatchReader = (relativePath, expectedDigest, artifactId) => {
    const document = countMismatchFixture.artifactReader(
      relativePath,
      expectedDigest,
      artifactId,
    );
    if (artifactId === "reconciliation_report") {
      document.details.webhookDeliveryCount = 2;
    }
    return document;
  };
  expectRejected(
    countMismatchFixture.candidateEvidence,
    "canary and reconciliation webhookDeliveryCount differ",
    "a reconciliation report for a different delivery set",
    countMismatchFixture.candidateTasks,
    countMismatchReader,
  );

  const valueTotalsFixture = buildCompleteFixture();
  const valueTotalsReader = (relativePath, expectedDigest, artifactId) => {
    const document = valueTotalsFixture.artifactReader(
      relativePath,
      expectedDigest,
      artifactId,
    );
    if (artifactId === "reconciliation_report") {
      document.details.observedValueTotalsSha256 = digest(
        "fixture:different-observed-value-totals",
      );
    }
    return document;
  };
  expectRejected(
    valueTotalsFixture.candidateEvidence,
    "canary and reconciliation observed value totals differ",
    "a reconciliation report for different observed value totals",
    valueTotalsFixture.candidateTasks,
    valueTotalsReader,
  );

  const observationCountFixture = buildCompleteFixture();
  const observationCountReader = (relativePath, expectedDigest, artifactId) => {
    const document = observationCountFixture.artifactReader(
      relativePath,
      expectedDigest,
      artifactId,
    );
    if (artifactId === "observation_report") {
      document.details.quotaAcceptedCount = 4;
    }
    return document;
  };
  expectRejected(
    observationCountFixture.candidateEvidence,
    "canary and observation scope counts differ",
    "an observation report for different quota traffic",
    observationCountFixture.candidateTasks,
    observationCountReader,
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

  const earlyRollbackFixture = buildCompleteFixture();
  const earlyRollbackReader = (relativePath, expectedDigest, artifactId) => {
    const document = earlyRollbackFixture.artifactReader(
      relativePath,
      expectedDigest,
      artifactId,
    );
    if (artifactId === "rollback_report") {
      document.details.startedAt = "2026-02-01T23:58:00Z";
      document.details.endedAt = "2026-02-01T23:59:00Z";
    }
    return document;
  };
  expectRejected(
    earlyRollbackFixture.candidateEvidence,
    "production artifact chronology differs",
    "a rollback rehearsal completed before canary end",
    earlyRollbackFixture.candidateTasks,
    earlyRollbackReader,
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

  const observationDriftFixture = buildCompleteFixture();
  const observationDriftReader = (relativePath, expectedDigest, artifactId) => {
    const document = observationDriftFixture.artifactReader(
      relativePath,
      expectedDigest,
      artifactId,
    );
    if (artifactId === "observation_report") {
      document.details.ledgerDifference = 1;
    }
    return document;
  };
  expectRejected(
    observationDriftFixture.candidateEvidence,
    "observation_report duration, coverage, capacity, or failure evidence differs",
    "an observation window with ledger drift",
    observationDriftFixture.candidateTasks,
    observationDriftReader,
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
      document.details.sampleIntervalCount = 1;
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
    "differs from the manifest",
    "an unsafe public baseline",
  );

  const incompleteSliceTasks = structuredClone(tasks);
  incompleteSliceTasks.tasks
    .find((task) => task.id === "M11-ECOSYSTEM")
    .slices.find(
      (slice) => slice.id === "M11-S03-MULTI-CURRENCY-EVIDENCE",
    ).status = "in_progress";
  expectRejected(
    evidence,
    "must be completed before canary",
    "an incomplete prerequisite slice",
    incompleteSliceTasks,
  );

  const taskScoreDrift = structuredClone(tasks);
  taskScoreDrift.tasks.find(
    (task) => task.id === "M11-ECOSYSTEM",
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
  belowFloorFixture.candidateEvidence.score.total =
    belowFloorFixture.candidateEvidence.score.categories.reduce(
      (total, category) => total + category.score,
      0,
    );
  belowFloorFixture.candidateTasks.tasks.find(
    (task) => task.id === "M11-ECOSYSTEM",
  ).module_score = belowFloorFixture.candidateEvidence.score.total;
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
  `Validated ${evidence.checks.length} M11 ecosystem canary checks and ${evidence.score.categories.length} score categories; score ${result.calculatedScore}/100 with ${evidence.checks.filter((check) => check.status === "passed").length} passed, ${evidence.checks.filter((check) => check.status === "pending").length} pending, and ${evidence.checks.filter((check) => check.status === "failed").length} failed.`,
);
