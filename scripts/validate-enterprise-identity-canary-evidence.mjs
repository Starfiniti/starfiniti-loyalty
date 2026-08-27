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
  "non_canary_disabled",
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
    "upstream_claim_authority",
    "email domain group name profile metadata browser input upstream claim issuer label or provider attribute grants tenant membership role support recovery or deletion authority",
  ],
  [
    "unprovisioned_access",
    "an uninvited unprovisioned unmapped conflicting revoked or unrelated identity gains membership relationship support recovery export or administration access",
  ],
  [
    "stale_session_access",
    "a stale Auth or application session retains access after membership endpoint grant relationship recovery agency or organization revocation",
  ],
  [
    "credential_or_identity_leak",
    "reusable plaintext federation SCIM agency support recovery administration or identity material persists outside its approved isolated handoff or enters logs evidence browser or database",
  ],
  [
    "cross_tenant_exposure",
    "an unrelated organization source endpoint directory membership relationship grant export deletion audit identity or value selector becomes visible mutable or externally actionable",
  ],
  [
    "egress_or_rebinding_escape",
    "redirect DNS rebinding private reserved link-local metadata mixed answer unpinned socket or changed validation reaches an internal or unapproved destination",
  ],
  [
    "duplicate_identity_effect",
    "retry concurrency replay rotation lease recovery or provider ambiguity creates another membership source endpoint mapping relationship grant use case deletion or audit effect",
  ],
  [
    "agency_authority_escalation",
    "an agency relationship creates organization membership customer sharing wallet sharing owner role write authority or product command authority",
  ],
  [
    "support_approval_bypass",
    "support is self-approved over-scoped writable hidden unaudited expired changed on retry or usable after grant relationship membership endpoint or session revocation",
  ],
  [
    "break_glass_bypass",
    "break-glass works without a live owner signed fresh AAL2 correlated Auth session exact short expiry tenant-visible use evidence and immediate revocation checks",
  ],
  [
    "offboarding_residue",
    "offboarding leaves an active credential session destination signing fingerprint schedule export payload relationship support grant or non-recovery membership",
  ],
  [
    "premature_or_destructive_deletion",
    "deletion completes before cooling without exact approval or rewrites removes or loses ledger programme event provisioning value tombstone or immutable audit history",
  ],
  [
    "identity_value_dependency",
    "checkout ingestion refunds releases reconciliation export existing redemption promised value or customer access depends on federation SCIM agency support recovery or deletion availability",
  ],
  [
    "unsafe_rollout",
    "identity federation SCIM agency support recovery offboarding or deletion is enabled outside the approved fixture before recovery baseline disabled deployment egress and isolation pass",
  ],
  [
    "reconciliation_gap",
    "membership role session source endpoint relationship grant use credential pseudonym audit ledger checkout privacy or identity evidence differs from immutable source facts",
  ],
  [
    "score_or_approval_bypass",
    "module status completion approval fixture policy artifact score total or category floor is changed without exact synchronized evidence",
  ],
  [
    "unexplained_or_unapproved_close",
    "any identity access tenancy federation SCIM agency support recovery offboarding deletion privacy approval artifact score floor or critical finding remains unresolved",
  ],
]);
const checkArtifactBindings = new Map([
  ["public_production_baseline", ["read_only_baseline"]],
  ["authentik_public_baseline", ["read_only_baseline"]],
  ["operator_access", ["read_only_baseline"]],
  ["approved_release", ["approval_record"]],
  ["approved_enterprise_identity_fixture", ["approval_record"]],
  ["canary_approval", ["approval_record"]],
  ["pre_change_recovery_point", ["recovery_point"]],
  ["production_source_baseline", ["production_baseline"]],
  ["administration_secret_mounts", ["release_inventory", "canary_journal"]],
  ["authentik_egress_policy", ["canary_journal"]],
  ["dns_rebinding_denial", ["canary_journal"]],
  ["disabled_deployment", ["release_inventory", "canary_journal"]],
  ["migration_registration", ["release_inventory", "canary_journal"]],
  ["non_canary_disabled", ["canary_journal"]],
  ["identity_entitlement_canary", ["canary_journal"]],
  ["local_owner_recovery", ["canary_journal", "reconciliation_report"]],
  ["oidc_tenant_canary", ["canary_journal", "reconciliation_report"]],
  ["saml_tenant_canary", ["canary_journal", "reconciliation_report"]],
  ["scim_discovery_contract", ["canary_journal"]],
  ["scim_provisioning_canary", ["canary_journal", "reconciliation_report"]],
  ["group_role_allowlist", ["canary_journal", "reconciliation_report"]],
  ["mapped_unmapped_login", ["canary_journal", "reconciliation_report"]],
  ["immediate_deprovisioning", ["canary_journal", "reconciliation_report"]],
  ["stale_session_denial", ["canary_journal", "reconciliation_report"]],
  ["endpoint_rotation_revocation", ["canary_journal", "reconciliation_report"]],
  ["forged_claim_denial", ["canary_journal"]],
  ["cross_tenant_denial", ["canary_journal"]],
  ["provider_outage_recovery", ["canary_journal", "rollback_report"]],
  ["agency_bilateral_canary", ["canary_journal", "reconciliation_report"]],
  ["agency_revocation", ["canary_journal", "reconciliation_report"]],
  ["support_approval_separation", ["canary_journal"]],
  ["support_scope_use_audit", ["canary_journal", "reconciliation_report"]],
  [
    "support_revocation_stale_session",
    ["canary_journal", "reconciliation_report"],
  ],
  ["aal2_break_glass", ["canary_journal", "reconciliation_report"]],
  ["administration_export_reconciliation", ["reconciliation_report"]],
  [
    "offboarding_credential_inventory",
    ["canary_journal", "reconciliation_report"],
  ],
  ["deletion_cooling_cancel", ["canary_journal", "rollback_report"]],
  ["deletion_pseudonymization", ["canary_journal", "reconciliation_report"]],
  ["production_outage_continuity", ["canary_journal", "rollback_report"]],
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
  "enterpriseIdentityApproved",
  "canaryApproved",
];
const fail = (message) => {
  throw new Error(`Enterprise identity canary evidence invalid: ${message}`);
};

const digest = (value) => createHash("sha256").update(value).digest("hex");
const digestPattern = /^[0-9a-f]{64}$/u;
const forbiddenKey =
  /(password|passphrase|secret|private.?key|access.?token|refresh.?token|bearer|credential.?value|capability.?value|scim.?token|saml.?assertion|raw.?body|email|auth.?uuid|external.?id|subject|customer.?id|order.?id|tenant.?id|wallet.?id|connection.?id|membership.?id|endpoint.?id|relationship.?id|grant.?id|case.?id|idempotency.?key)/i;
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
    `^docs/plan/evidence/M13/production/identity-${artifactStem}-[a-z0-9][a-z0-9-]{2,79}\\.json$`,
    "u",
  );
  if (typeof relativePath !== "string" || !pattern.test(relativePath)) {
    fail(`${artifactId} artifact path is unsafe`);
  }
  const absolute = resolve(root, relativePath);
  const allowed = `${resolve(root, "docs/plan/evidence/M13/production")}${sep}`;
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
        "authentikLive",
        "authentikReady",
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
      "authentikLive",
      "authentikReady",
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
        "identityConfigurationSha256",
        "administrationMountInventorySha256",
        "deploymentState",
        "identitySourceCount",
        "scimEndpointCount",
        "activeSupportGrantCount",
        "migrationDifference",
        "assertions",
      ],
      "release_inventory details",
    );
    if (
      !/^v\d+\.\d+\.\d+$/u.test(details.release) ||
      details.pullRequest !== candidateEvidence.candidate.pullRequest ||
      details.repositoryCommit !== candidateEvidence.candidate.commit ||
      details.deploymentState !== "disabled" ||
      details.identitySourceCount !== 0 ||
      details.scimEndpointCount !== 0 ||
      details.activeSupportGrantCount !== 0 ||
      details.migrationDifference !== 0
    ) {
      fail("release_inventory identity or disabled state differs");
    }
    uniqueNonzeroDigests(
      details,
      [
        "dashboardImageSha256",
        "workerImageSha256",
        "migrationInventorySha256",
        "identityConfigurationSha256",
        "administrationMountInventorySha256",
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
      ["finalizedAt", "release", "approvals", "artifactSha256"],
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
        "supabaseAuthSha256",
        "authentikSha256",
        "applicationConfigurationSha256",
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
        "supabaseAuthSha256",
        "authentikSha256",
        "applicationConfigurationSha256",
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
        "identitySourceCount",
        "scimEndpointCount",
        "agencyRelationshipCount",
        "activeSupportGrantCount",
        "nonRecoveryMembershipDifference",
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
      details.identitySourceCount !== 0 ||
      details.scimEndpointCount !== 0 ||
      details.agencyRelationshipCount !== 0 ||
      details.activeSupportGrantCount !== 0 ||
      details.nonRecoveryMembershipDifference !== 0 ||
      details.ledgerDifference !== 0 ||
      details.mutationCount !== 0
    ) {
      fail(
        "production_baseline authority, coverage, or difference evidence differs",
      );
    }
    exactNonzeroDigest(details.snapshotSha256, "production_baseline snapshot");
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
        "administrationMountCount",
        "privateEgressDifference",
        "dnsRebindingEscapeCount",
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
      details.pilotOrganizationCount !== 1 ||
      details.controlOrganizationCount !== 1 ||
      details.nonCanaryEnabledCount !== 0 ||
      !Number.isSafeInteger(details.administrationMountCount) ||
      details.administrationMountCount !== 3 ||
      details.privateEgressDifference !== 0 ||
      details.dnsRebindingEscapeCount !== 0 ||
      details.sourceCoverageRatio !== 1
    ) {
      fail(
        "canary_journal scope, timing, egress, or coverage evidence differs",
      );
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
        "crossTenantDifference",
        "staleSessionAccessCount",
        "ledgerDifference",
        "assertions",
      ],
      "reconciliation_report details",
    );
    if (
      details.sourceCoverageRatio !== 1 ||
      details.boundedConvergenceComplete !== true ||
      details.unresolvedAmbiguousOutcomeCount !== 0 ||
      details.unresolvedCriticalCount !== 0 ||
      details.unresolvedHighCount !== 0 ||
      details.crossTenantDifference !== 0 ||
      details.staleSessionAccessCount !== 0 ||
      details.ledgerDifference !== 0
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
        "federationDisabled",
        "scimRevoked",
        "supportRevoked",
        "localOwnerAvailable",
        "checkoutAvailable",
        "immutableHistoryPreserved",
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
      details.federationDisabled !== true ||
      details.scimRevoked !== true ||
      details.supportRevoked !== true ||
      details.localOwnerAvailable !== true ||
      details.checkoutAvailable !== true ||
      details.immutableHistoryPreserved !== true ||
      details.unresolvedAmbiguousOutcomeCount !== 0 ||
      details.ledgerDifference !== 0
    ) {
      fail(
        "rollback_report timing, revocation, continuity, or difference evidence differs",
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
        "crossTenantAccessCount",
        "staleSessionAccessCount",
        "internalEgressEscapeCount",
        "checkoutBlockedCount",
        "ledgerDifference",
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
      details.crossTenantAccessCount !== 0 ||
      details.staleSessionAccessCount !== 0 ||
      details.internalEgressEscapeCount !== 0 ||
      details.checkoutBlockedCount !== 0 ||
      details.ledgerDifference !== 0 ||
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
      document?.schema !==
        "starfiniti.enterprise-identity-canary-artifact.v1" ||
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
  for (const [approval, checkId] of Object.entries({
    approvedRelease: "approved_release",
    operatorAccess: "operator_access",
    enterpriseIdentityApproved: "approved_enterprise_identity_fixture",
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
      completionApprovals.some(
        (approval) => candidateEvidence.candidate[approval] !== true,
      )
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
    const reconciliationObservedAt = exactUtcTime(
      verifiedArtifactDocuments.get("reconciliation_report").observedAt,
      "reconciliation_report observedAt",
    );
    const rollbackObservedAt = exactUtcTime(
      verifiedArtifactDocuments.get("rollback_report").observedAt,
      "rollback_report observedAt",
    );
    const rollbackStartedAt = exactUtcTime(
      verifiedArtifactDocuments.get("rollback_report").details.startedAt,
      "rollback_report startedAt",
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
      Date.parse(candidateEvidence.observedAt) < approvalObservedAt
    ) {
      fail("production artifact chronology differs");
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
  const markPassed = (check) => {
    check.status = "passed";
    check.evidence =
      "Verified immutable enterprise identity canary evidence reconciles this mandatory result exactly.";
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
      "Release, recovery, bounded enterprise identity canaries, rollback, observation, and exact final reconciliation evidence are verified and digest-bound.";
    candidateEvidence.score.total = candidateEvidence.score.categories.reduce(
      (total, category) => total + category.score,
      0,
    );
    const m13 = candidateTasks.tasks.find(
      (task) => task.id === "M13-ENTERPRISE-IDENTITY",
    );
    m13.status = "complete";
    m13.module_score = candidateEvidence.score.total;
    m13.slices.find((slice) => slice.id === "M13-S06-CANARY-AND-CLOSE").status =
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
          migrationInventorySha256: digest("fixture:migrations"),
          identityConfigurationSha256: digest("fixture:identity-configuration"),
          administrationMountInventorySha256: digest(
            "fixture:administration-mounts",
          ),
          deploymentState: "disabled",
          identitySourceCount: 0,
          scimEndpointCount: 0,
          activeSupportGrantCount: 0,
          migrationDifference: 0,
          assertions: fixtureAssertions(artifactId),
        };
      }
      if (artifactId === "recovery_point") {
        return {
          createdAt: "2026-01-31T20:30:00Z",
          verifiedAt: "2026-01-31T20:59:00Z",
          baseBackupSha256: digest("fixture:base-backup"),
          walArchiveSha256: digest("fixture:wal-archive"),
          supabaseAuthSha256: digest("fixture:supabase-auth"),
          authentikSha256: digest("fixture:authentik"),
          applicationConfigurationSha256: digest(
            "fixture:application-configuration",
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
          identitySourceCount: 0,
          scimEndpointCount: 0,
          agencyRelationshipCount: 0,
          activeSupportGrantCount: 0,
          nonRecoveryMembershipDifference: 0,
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
          administrationMountCount: 3,
          privateEgressDifference: 0,
          dnsRebindingEscapeCount: 0,
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
          crossTenantDifference: 0,
          staleSessionAccessCount: 0,
          ledgerDifference: 0,
          assertions: fixtureAssertions(artifactId),
        };
      }
      if (artifactId === "rollback_report") {
        return {
          startedAt: "2026-02-02T00:00:00Z",
          endedAt: "2026-02-02T00:01:00Z",
          durationSeconds: 60,
          federationDisabled: true,
          scimRevoked: true,
          supportRevoked: true,
          localOwnerAvailable: true,
          checkoutAvailable: true,
          immutableHistoryPreserved: true,
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
          crossTenantAccessCount: 0,
          staleSessionAccessCount: 0,
          internalEgressEscapeCount: 0,
          checkoutBlockedCount: 0,
          ledgerDifference: 0,
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
        schema: "starfiniti.enterprise-identity-canary-artifact.v1",
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
      artifact.path = `docs/plan/evidence/M13/production/identity-${artifact.id.replaceAll("_", "-")}-self-test.json`;
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
    "release, operator, enterprise identity, and canary approval",
    "unapproved evidence as complete",
  );

  const pendingCompletion = buildCompleteFixture();
  pendingCompletion.candidateEvidence.checks.find(
    (check) => check.id === "identity_entitlement_canary",
  ).status = "pending";
  expectRejected(
    pendingCompletion.candidateEvidence,
    "complete evidence has non-passing checks",
    "pending evidence as complete",
    pendingCompletion.candidateTasks,
    pendingCompletion.artifactReader,
  );

  const sensitiveEvidence = structuredClone(evidence);
  sensitiveEvidence.operatorSecretValue = "must never be accepted";
  expectRejected(
    sensitiveEvidence,
    "forbidden sensitive key",
    "a sensitive evidence key",
  );

  const sensitiveValue = structuredClone(evidence);
  sensitiveValue.checks[0].evidence =
    "Unsafe identity evidence for alice@example.invalid must be rejected.";
  expectRejected(
    sensitiveValue,
    "forbidden sensitive value",
    "a sensitive evidence value",
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
  ).path = "docs/plan/evidence/M13/canary.yaml";
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
    "differs from the manifest",
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

  const taskScoreDrift = structuredClone(tasks);
  taskScoreDrift.tasks.find(
    (task) => task.id === "M13-ENTERPRISE-IDENTITY",
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
    (task) => task.id === "M13-ENTERPRISE-IDENTITY",
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
  `Validated ${evidence.checks.length} M13 canary checks and ${evidence.score.categories.length} score categories; score ${result.calculatedScore}/100 with ${evidence.checks.filter((check) => check.status === "passed").length} passed, ${evidence.checks.filter((check) => check.status === "pending").length} pending, and ${evidence.checks.filter((check) => check.status === "failed").length} failed.`,
);
