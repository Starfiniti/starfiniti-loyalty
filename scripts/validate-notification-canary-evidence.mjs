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
const evidencePath = join(root, "docs/plan/evidence/M08/canary.yaml");
const tasksPath = join(root, "docs/plan/TASKS.yaml");

const evidence = YAML.parse(readFileSync(evidencePath, "utf8"));
const tasks = YAML.parse(readFileSync(tasksPath, "utf8"));

const requiredChecks = new Set([
  "exact_head_ci",
  "contract_notification_matrix",
  "database_authority_matrix",
  "consent_suppression_matrix",
  "smtp_adapter_matrix",
  "klaviyo_adapter_matrix",
  "webhook_adapter_matrix",
  "template_health_matrix",
  "browser_accessibility",
  "privacy_minimization",
  "value_checkout_independence",
  "rollback_compatibility_repository",
  "operations_documentation",
  "public_production_baseline",
  "operator_access",
  "approved_release",
  "approved_pilot_store",
  "canary_approval",
  "pre_change_recovery_point",
  "production_notification_baseline",
  "disabled_deployment",
  "migration_registration",
  "non_canary_disabled",
  "smtp_local_sink_canary",
  "smtp_transactional_canary",
  "smtp_test_delivery_canary",
  "klaviyo_profile_canary",
  "klaviyo_event_canary",
  "klaviyo_consent_canary",
  "webhook_signature_canary",
  "webhook_rotation_canary",
  "webhook_replay_canary",
  "webhook_destination_policy_canary",
  "consent_withdrawal_canary",
  "suppression_import_canary",
  "event_deduplication_canary",
  "schedule_timezone_canary",
  "retry_dead_letter_canary",
  "ambiguity_manual_review_canary",
  "template_version_canary",
  "delivery_health_canary",
  "event_family_canary",
  "provider_outage_canary",
  "value_continuity_canary",
  "checkout_outage_canary",
  "cross_tenant_denial",
  "delivery_reconciliation",
  "consent_reconciliation",
  "provider_reconciliation",
  "queue_reconciliation",
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
    "consent_bypass",
    "a withdrawn missing superseded or purpose-mismatched consent still authorizes a notification provider action",
  ],
  [
    "suppression_bypass",
    "provider system privacy-erasure or trusted suppression is cleared weakened or bypassed by customer merchant worker or retry state",
  ],
  [
    "duplicate_delivery",
    "duplicate replay delayed delivery lease recovery or concurrent processing creates another provider submission or customer message",
  ],
  [
    "provider_authority",
    "SMTP Klaviyo webhook or provider response becomes authoritative for tenant consent identity value template or delivery history",
  ],
  [
    "tenant_connection_mismatch",
    "a tenant provider connection key fingerprint endpoint template customer event or delivery authority is mismatched or browser-selected",
  ],
  [
    "deployment_mode_violation",
    "self-hosted invokes managed Klaviyo or remote entitlement while managed or disabled state starts an unapproved provider path",
  ],
  [
    "webhook_destination_escape",
    "a redirect DNS rebinding private reserved mixed answer unpinned socket or unbounded response reaches an internal or unapproved destination",
  ],
  [
    "webhook_replay_or_signature_failure",
    "webhook retries change delivery identity exact bytes timestamp or signature or a receiver replay is accepted as a new effect",
  ],
  [
    "ambiguous_delivery_retry",
    "an ambiguous SMTP Klaviyo subscribe or webhook acceptance is automatically retried instead of entering bounded manual review",
  ],
  [
    "unbounded_retry_or_queue",
    "provider work retries exceeds its hard ceiling loses its lease boundary or remains indefinitely accepted without visible terminal or review state",
  ],
  [
    "provider_outage_value_impact",
    "an SMTP Klaviyo webhook DNS or receiver outage delays rejects rewrites or reverses loyalty value consent history refunds or reconciliation",
  ],
  [
    "checkout_dependency",
    "WooCommerce checkout synchronously depends on notification events contacts templates workers providers consent or delivery outcomes",
  ],
  [
    "accepted_work_stranded",
    "disablement rollback suppression or prior-image recovery hides or deletes accepted event delivery attempt template consent or review evidence",
  ],
  [
    "sensitive_evidence",
    "reusable provider or signing material contact data coupon plaintext raw payload rendered content provider body or private ledger metadata enters logs support output or evidence",
  ],
  [
    "cross_tenant_exposure",
    "an unrelated tenant contact event preference suppression template connection endpoint delivery attempt health issue or provider result becomes visible or mutable",
  ],
  [
    "unexplained_or_unapproved_close",
    "any consent event template provider delivery queue tenancy privacy value checkout approval artifact score floor or critical finding remains unresolved",
  ],
]);
const checkArtifactBindings = new Map([
  ["public_production_baseline", ["read_only_baseline"]],
  ["operator_access", ["read_only_baseline"]],
  ["approved_release", ["approval_record"]],
  ["approved_pilot_store", ["approval_record"]],
  ["canary_approval", ["approval_record"]],
  ["pre_change_recovery_point", ["recovery_point"]],
  ["production_notification_baseline", ["production_baseline"]],
  ["disabled_deployment", ["release_inventory", "canary_journal"]],
  ["migration_registration", ["release_inventory", "canary_journal"]],
  ["non_canary_disabled", ["canary_journal"]],
  ["smtp_local_sink_canary", ["canary_journal"]],
  ["smtp_transactional_canary", ["canary_journal"]],
  ["smtp_test_delivery_canary", ["canary_journal"]],
  ["klaviyo_profile_canary", ["canary_journal"]],
  ["klaviyo_event_canary", ["canary_journal"]],
  ["klaviyo_consent_canary", ["canary_journal"]],
  ["webhook_signature_canary", ["canary_journal"]],
  ["webhook_rotation_canary", ["canary_journal"]],
  ["webhook_replay_canary", ["canary_journal"]],
  ["webhook_destination_policy_canary", ["canary_journal"]],
  ["consent_withdrawal_canary", ["canary_journal"]],
  ["suppression_import_canary", ["canary_journal"]],
  ["event_deduplication_canary", ["canary_journal"]],
  ["schedule_timezone_canary", ["canary_journal"]],
  ["retry_dead_letter_canary", ["canary_journal"]],
  ["ambiguity_manual_review_canary", ["canary_journal"]],
  ["template_version_canary", ["canary_journal"]],
  ["delivery_health_canary", ["canary_journal"]],
  ["event_family_canary", ["canary_journal"]],
  ["provider_outage_canary", ["canary_journal"]],
  ["value_continuity_canary", ["canary_journal"]],
  ["checkout_outage_canary", ["canary_journal"]],
  ["cross_tenant_denial", ["canary_journal"]],
  ["delivery_reconciliation", ["reconciliation_report"]],
  ["consent_reconciliation", ["reconciliation_report"]],
  ["provider_reconciliation", ["reconciliation_report"]],
  ["queue_reconciliation", ["reconciliation_report", "rollback_report"]],
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
  throw new Error(`Notification canary evidence invalid: ${message}`);
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
    `^docs/plan/evidence/M08/production/notification-${artifactStem}-[a-z0-9][a-z0-9-]{2,79}\\.json$`,
    "u",
  );
  if (typeof relativePath !== "string" || !pattern.test(relativePath)) {
    fail(`${artifactId} artifact path is unsafe`);
  }
  const absolute = resolve(root, relativePath);
  const allowed = `${resolve(root, "docs/plan/evidence/M08/production")}${sep}`;
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
  const evidenceDigests = new Set();
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
    if (evidenceDigests.has(assertion.evidenceSha256)) {
      fail(`${label} assertions reuse one evidence digest`);
    }
    ids.add(assertion.id);
    evidenceDigests.add(assertion.evidenceSha256);
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

const releaseDigestKeys = [
  "dashboardImageSha256",
  "workerImageSha256",
  "migrationInventorySha256",
  "eventContractSha256",
  "templateCatalogSha256",
  "smtpAdapterSha256",
  "klaviyoAdapterSha256",
  "webhookAdapterSha256",
];

const policyDigestKeys = [
  "pilotScopeSha256",
  "controlScopeSha256",
  "notificationPolicySha256",
  "consentPolicySha256",
  "providerCanaryPolicySha256",
  "messageCeilingPolicySha256",
  "observationPolicySha256",
];

const providerEvidenceDigestKeys = [
  "smtpLocalSinkSha256",
  "smtpTransactionalSha256",
  "smtpTestDeliverySha256",
  "klaviyoProfileSha256",
  "klaviyoEventSha256",
  "klaviyoConsentSha256",
  "webhookSignatureSha256",
  "webhookRotationSha256",
  "webhookReplaySha256",
  "webhookDestinationPolicySha256",
  "consentWithdrawalSha256",
  "suppressionImportSha256",
  "eventDeduplicationSha256",
  "scheduleTimezoneSha256",
  "retryDeadLetterSha256",
  "ambiguityReviewSha256",
  "templateVersionSha256",
  "deliveryHealthSha256",
  "eventFamilySha256",
  "providerOutageSha256",
  "valueContinuitySha256",
  "checkoutOutageSha256",
  "privacyScanSha256",
];

const providerCountKeys = [
  "smtpLocalSinkSubmissionCount",
  "smtpTransactionalSubmissionCount",
  "smtpTestSubmissionCount",
  "klaviyoProfileSubmissionCount",
  "klaviyoEventSubmissionCount",
  "klaviyoConsentTransitionCount",
  "webhookSignedSubmissionCount",
  "webhookCurrentKeyAcceptanceCount",
  "webhookPreviousKeyAcceptanceCount",
  "webhookDestinationRejectionCount",
  "consentWithdrawalBlockedDispatchCount",
  "suppressionImportCount",
  "eventDeduplicationAttemptCount",
  "eventDeduplicatedEffectCount",
  "scheduleTimezoneCaseCount",
  "retryableFailureCount",
  "deadLetterCount",
  "manualReviewCount",
  "templateVersionRetentionCount",
  "activeTemplateCount",
  "deliveryHealthSnapshotCount",
  "eventFamilyCount",
  "providerOutageCaseCount",
  "valueContinuityCaseCount",
  "checkoutOutageCount",
  "crossTenantDenialCount",
  "acceptedWorkCount",
  "externalSubmissionCount",
];

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
        "unsignedWooCommerceIngress",
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
      "unsignedWooCommerceIngress",
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
        ...releaseDigestKeys,
        "deploymentState",
        "smtpWorkerEnabled",
        "klaviyoWorkerEnabled",
        "webhookWorkerEnabled",
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
      details.smtpWorkerEnabled !== false ||
      details.klaviyoWorkerEnabled !== false ||
      details.webhookWorkerEnabled !== false ||
      details.registeredMigrationDifference !== 0
    ) {
      fail("release_inventory identity or disabled state differs");
    }
    uniqueNonzeroDigests(details, releaseDigestKeys, "release_inventory");
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
        ...policyDigestKeys,
        "approvedExternalSubmissionLimit",
        "approvedAttemptLimit",
        "approvedWebhookPayloadByteLimit",
        "approvedWebhookResponseByteLimit",
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
      policyDigestKeys,
      "approval_record approved scope",
    );
    for (const key of [
      "approvedExternalSubmissionLimit",
      "approvedAttemptLimit",
      "approvedWebhookPayloadByteLimit",
      "approvedWebhookResponseByteLimit",
    ]) {
      exactPositiveInteger(details[key], `approval_record ${key}`);
    }
    if (
      details.approvedExternalSubmissionLimit > 50 ||
      details.approvedAttemptLimit > 10 ||
      details.approvedWebhookPayloadByteLimit > 20 * 1024 ||
      details.approvedWebhookResponseByteLimit > 64 * 1024
    ) {
      fail("approval_record provider ceiling differs");
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
    const digestKeys = [
      "baseBackupSha256",
      "walArchiveSha256",
      "applicationConfigurationSha256",
      "providerReferenceInventorySha256",
      "templateInventorySha256",
      "signingReferenceInventorySha256",
      "restoreEvidenceSha256",
    ];
    exactKeys(
      details,
      [
        "createdAt",
        "verifiedAt",
        ...digestKeys,
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
    uniqueNonzeroDigests(details, digestKeys, "recovery_point");
    exactAssertions(
      details.assertions,
      artifactCheckBindings.get("recovery_point"),
      "recovery_point",
    );
    return;
  }
  if (artifactId === "production_baseline") {
    const digestKeys = [
      "eventTotalsSha256",
      "consentTotalsSha256",
      "suppressionTotalsSha256",
      "templateTotalsSha256",
      "providerConnectionTotalsSha256",
      "endpointTotalsSha256",
      "deliveryTotalsSha256",
      "attemptTotalsSha256",
      "manualReviewTotalsSha256",
      "queueTotalsSha256",
      "ledgerTotalsSha256",
      "checkoutAvailabilitySha256",
      "nativeCouponTotalsSha256",
    ];
    exactKeys(
      details,
      [
        "capturedAt",
        "sourceCoverageRatio",
        ...digestKeys,
        "activeSmtpWorkerCount",
        "activeKlaviyoWorkerCount",
        "activeWebhookWorkerCount",
        "pendingAcceptedWorkCount",
        "ledgerDifference",
        "couponDifference",
        "mutationCount",
        "assertions",
      ],
      "production_baseline details",
    );
    if (
      exactUtcTime(details.capturedAt, "production_baseline capturedAt") >
        observedAt ||
      details.sourceCoverageRatio !== 1 ||
      details.activeSmtpWorkerCount !== 0 ||
      details.activeKlaviyoWorkerCount !== 0 ||
      details.activeWebhookWorkerCount !== 0 ||
      details.pendingAcceptedWorkCount !== 0 ||
      details.ledgerDifference !== 0 ||
      details.couponDifference !== 0 ||
      details.mutationCount !== 0
    ) {
      fail(
        "production_baseline authority, coverage, or difference evidence differs",
      );
    }
    uniqueNonzeroDigests(details, digestKeys, "production_baseline");
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
        ...policyDigestKeys,
        ...releaseDigestKeys,
        ...providerEvidenceDigestKeys,
        "approvedExternalSubmissionLimit",
        "approvedAttemptLimit",
        "approvedWebhookPayloadByteLimit",
        "approvedWebhookResponseByteLimit",
        ...providerCountKeys,
        "maximumObservedAttemptCount",
        "webhookPayloadBytes",
        "webhookResponseBytes",
        "webhookReplayDuplicateEffectCount",
        "acceptedWorkStrandedCount",
        "providerSubmissionDuplicateCount",
        "consentBypassCount",
        "suppressionBypassCount",
        "ambiguousAutoRetryCount",
        "crossTenantExposureCount",
        "prohibitedFieldExposureCount",
        "checkoutBlockedCount",
        "ledgerDifference",
        "couponDifference",
        "loyaltyValueDifference",
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
      "approvedExternalSubmissionLimit",
      "approvedAttemptLimit",
      "approvedWebhookPayloadByteLimit",
      "approvedWebhookResponseByteLimit",
      ...providerCountKeys,
      "maximumObservedAttemptCount",
      "webhookPayloadBytes",
      "webhookResponseBytes",
    ]) {
      exactPositiveInteger(details[key], `canary_journal ${key}`);
    }
    const exactScenarioCounts = {
      smtpLocalSinkSubmissionCount: 1,
      smtpTransactionalSubmissionCount: 1,
      smtpTestSubmissionCount: 1,
      klaviyoProfileSubmissionCount: 1,
      klaviyoEventSubmissionCount: 1,
      klaviyoConsentTransitionCount: 4,
      webhookSignedSubmissionCount: 1,
      webhookCurrentKeyAcceptanceCount: 1,
      webhookPreviousKeyAcceptanceCount: 1,
      webhookDestinationRejectionCount: 4,
      consentWithdrawalBlockedDispatchCount: 2,
      suppressionImportCount: 1,
      eventDeduplicationAttemptCount: 4,
      eventDeduplicatedEffectCount: 1,
      scheduleTimezoneCaseCount: 2,
      retryableFailureCount: 1,
      deadLetterCount: 1,
      manualReviewCount: 3,
      templateVersionRetentionCount: 2,
      activeTemplateCount: 6,
      deliveryHealthSnapshotCount: 1,
      eventFamilyCount: 9,
      providerOutageCaseCount: 4,
      valueContinuityCaseCount: 1,
      checkoutOutageCount: 1,
      crossTenantDenialCount: 1,
    };
    for (const [key, expected] of Object.entries(exactScenarioCounts)) {
      if (details[key] !== expected) fail(`canary_journal ${key} differs`);
    }
    if (
      startedAt >= endedAt ||
      endedAt > observedAt ||
      !Number.isSafeInteger(details.intervalCount) ||
      details.intervalCount < minimumIntervals ||
      details.pilotOrganizationCount !== 1 ||
      details.controlOrganizationCount !== 1 ||
      details.nonCanaryEnabledCount !== 0 ||
      details.approvedExternalSubmissionLimit > 50 ||
      details.approvedAttemptLimit > 10 ||
      details.approvedWebhookPayloadByteLimit > 20 * 1024 ||
      details.approvedWebhookResponseByteLimit > 64 * 1024 ||
      details.externalSubmissionCount >
        details.approvedExternalSubmissionLimit ||
      details.maximumObservedAttemptCount > details.approvedAttemptLimit ||
      details.webhookPayloadBytes > details.approvedWebhookPayloadByteLimit ||
      details.webhookResponseBytes > details.approvedWebhookResponseByteLimit ||
      details.webhookReplayDuplicateEffectCount !== 0 ||
      details.acceptedWorkStrandedCount !== 0 ||
      details.providerSubmissionDuplicateCount !== 0 ||
      details.consentBypassCount !== 0 ||
      details.suppressionBypassCount !== 0 ||
      details.ambiguousAutoRetryCount !== 0 ||
      details.crossTenantExposureCount !== 0 ||
      details.prohibitedFieldExposureCount !== 0 ||
      details.checkoutBlockedCount !== 0 ||
      details.ledgerDifference !== 0 ||
      details.couponDifference !== 0 ||
      details.loyaltyValueDifference !== 0 ||
      details.sourceCoverageRatio !== 1
    ) {
      fail(
        "canary_journal scope, provider, privacy, or value evidence differs",
      );
    }
    uniqueNonzeroDigests(
      details,
      [
        ...policyDigestKeys,
        ...releaseDigestKeys,
        ...providerEvidenceDigestKeys,
      ],
      "canary_journal",
    );
    exactAssertions(
      details.assertions,
      artifactCheckBindings.get("canary_journal"),
      "canary_journal",
    );
    return;
  }
  if (artifactId === "reconciliation_report") {
    const truthDigestKeys = [
      "eventTotalsSha256",
      "consentTotalsSha256",
      "suppressionTotalsSha256",
      "templateTotalsSha256",
      "providerConnectionTotalsSha256",
      "endpointTotalsSha256",
      "deliveryTotalsSha256",
      "attemptTotalsSha256",
      "manualReviewTotalsSha256",
      "queueTotalsSha256",
      "providerResultTotalsSha256",
      "ledgerTotalsSha256",
      "checkoutTotalsSha256",
      "nativeCouponTotalsSha256",
    ];
    const differenceKeys = [
      "eventDifference",
      "consentDifference",
      "suppressionDifference",
      "templateDifference",
      "providerConnectionDifference",
      "endpointDifference",
      "deliveryDifference",
      "attemptDifference",
      "manualReviewDifference",
      "queueDifference",
      "providerResultDifference",
      "replayDifferenceCount",
      "privacyDifferenceCount",
      "tenantDifferenceCount",
      "ledgerDifference",
      "checkoutDifferenceCount",
      "couponDifference",
      "loyaltyValueDifference",
      "unresolvedAmbiguousOutcomeCount",
      "unresolvedCriticalCount",
      "unresolvedHighCount",
    ];
    exactKeys(
      details,
      [
        "sourceCoverageRatio",
        "boundedConvergenceComplete",
        ...providerEvidenceDigestKeys,
        ...truthDigestKeys,
        ...providerCountKeys,
        ...differenceKeys,
        "assertions",
      ],
      "reconciliation_report details",
    );
    for (const key of providerCountKeys) {
      exactPositiveInteger(details[key], `reconciliation_report ${key}`);
    }
    for (const key of differenceKeys) {
      if (details[key] !== 0) {
        fail("reconciliation_report value or unresolved evidence differs");
      }
    }
    if (
      details.sourceCoverageRatio !== 1 ||
      details.boundedConvergenceComplete !== true
    ) {
      fail("reconciliation_report coverage or convergence differs");
    }
    uniqueNonzeroDigests(
      details,
      [...providerEvidenceDigestKeys, ...truthDigestKeys],
      "reconciliation_report",
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
        "smtpWorkerStopped",
        "klaviyoWorkerStopped",
        "webhookWorkerStopped",
        "acceptedWorkDrainedOrHeld",
        "priorImagesRestored",
        "immutableEventsPreserved",
        "consentHistoryPreserved",
        "suppressionHistoryPreserved",
        "templateVersionsPreserved",
        "deliveryAttemptsPreserved",
        "manualReviewPreserved",
        "healthEvidencePreserved",
        "customerAccessAvailable",
        "checkoutAvailable",
        "acceptedWorkStrandedCount",
        "providerSubmissionDuplicateCount",
        "consentDifference",
        "suppressionDifference",
        "unresolvedAmbiguousOutcomeCount",
        "ledgerDifference",
        "couponDifference",
        "loyaltyValueDifference",
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
      details.smtpWorkerStopped !== true ||
      details.klaviyoWorkerStopped !== true ||
      details.webhookWorkerStopped !== true ||
      details.acceptedWorkDrainedOrHeld !== true ||
      details.priorImagesRestored !== true ||
      details.immutableEventsPreserved !== true ||
      details.consentHistoryPreserved !== true ||
      details.suppressionHistoryPreserved !== true ||
      details.templateVersionsPreserved !== true ||
      details.deliveryAttemptsPreserved !== true ||
      details.manualReviewPreserved !== true ||
      details.healthEvidencePreserved !== true ||
      details.customerAccessAvailable !== true ||
      details.checkoutAvailable !== true ||
      details.acceptedWorkStrandedCount !== 0 ||
      details.providerSubmissionDuplicateCount !== 0 ||
      details.consentDifference !== 0 ||
      details.suppressionDifference !== 0 ||
      details.unresolvedAmbiguousOutcomeCount !== 0 ||
      details.ledgerDifference !== 0 ||
      details.couponDifference !== 0 ||
      details.loyaltyValueDifference !== 0
    ) {
      fail("rollback_report timing, continuity, or value evidence differs");
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
    const countKeys = [
      "smtpLocalSinkSubmissionCount",
      "smtpTransactionalSubmissionCount",
      "smtpTestSubmissionCount",
      "klaviyoProfileSubmissionCount",
      "klaviyoEventSubmissionCount",
      "klaviyoConsentTransitionCount",
      "webhookSignedSubmissionCount",
      "consentWithdrawalBlockedDispatchCount",
      "suppressionImportCount",
      "retryableFailureCount",
      "deadLetterCount",
      "manualReviewCount",
      "deliveryHealthSnapshotCount",
      "eventFamilyCount",
      "providerOutageCaseCount",
      "valueContinuityCaseCount",
      "checkoutOutageCount",
      "acceptedWorkCount",
      "externalSubmissionCount",
    ];
    const zeroKeys = [
      "acceptedWorkStrandedCount",
      "providerSubmissionDuplicateCount",
      "consentBypassCount",
      "suppressionBypassCount",
      "ambiguousAutoRetryCount",
      "privacyIncidentCount",
      "crossTenantExposureCount",
      "checkoutBlockedCount",
      "eventDifferenceCount",
      "consentDifferenceCount",
      "suppressionDifferenceCount",
      "providerDifferenceCount",
      "queueDifferenceCount",
      "ledgerDifference",
      "couponDifference",
      "loyaltyValueDifference",
      "unresolvedAmbiguousOutcomeCount",
      "openCriticalCount",
      "openHighCount",
    ];
    exactKeys(
      details,
      [
        "startedAt",
        "endedAt",
        "durationSeconds",
        "sampleIntervalCount",
        "sourceCoverageRatio",
        "observationPolicySha256",
        "latencyWithinApprovedBounds",
        "loadWithinApprovedBounds",
        "smtpP95LatencyMs",
        "klaviyoP95LatencyMs",
        "webhookP95LatencyMs",
        "healthP95LatencyMs",
        "checkoutP95LatencyMs",
        "maxQueueDepth",
        ...countKeys,
        ...zeroKeys,
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
      "smtpP95LatencyMs",
      "klaviyoP95LatencyMs",
      "webhookP95LatencyMs",
      "healthP95LatencyMs",
      "checkoutP95LatencyMs",
      ...countKeys,
    ]) {
      exactPositiveInteger(details[key], `observation_report ${key}`);
    }
    exactNonnegativeInteger(
      details.maxQueueDepth,
      "observation_report maxQueueDepth",
    );
    for (const key of zeroKeys) {
      if (details[key] !== 0) {
        fail("observation_report failure evidence differs");
      }
    }
    exactNonzeroDigest(
      details.observationPolicySha256,
      "observation_report policy",
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
      details.loadWithinApprovedBounds !== true ||
      details.smtpP95LatencyMs > 60_000 ||
      details.klaviyoP95LatencyMs > 60_000 ||
      details.webhookP95LatencyMs > 60_000 ||
      details.healthP95LatencyMs > 60_000 ||
      details.checkoutP95LatencyMs > 60_000 ||
      details.maxQueueDepth > 100_000
    ) {
      fail("observation_report duration, coverage, or load evidence differs");
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
  if (candidateEvidence.schema !== "starfiniti.notification-canary.v1") {
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
    candidateEvidence.candidate.commit ===
    candidateEvidence.currentProduction.applicationCommit
  ) {
    fail("candidate commit must differ from current production");
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
      document?.schema !== "starfiniti.notification-canary-artifact.v1" ||
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

  const m08 = candidateTasks.tasks.find(
    (task) => task.id === "M08-NOTIFICATIONS",
  );
  const requiredCompletedSlices = new Set([
    "M08-S01-EVENT-CONSENT-AUTHORITY",
    "M08-S02-SMTP-DELIVERY",
    "M08-S03-KLAVIYO",
    "M08-S04-SIGNED-WEBHOOKS",
    "M08-S05-TEMPLATES-AND-HEALTH",
  ]);
  const s06 = m08?.slices?.find(
    (slice) => slice.id === "M08-S06-CANARY-AND-CLOSE",
  );
  if (!m08 || !s06) fail("M08 or M08-S06 task is missing");
  for (const id of requiredCompletedSlices) {
    const slice = m08.slices.find((candidate) => candidate.id === id);
    if (!new Set(["complete", "completed"]).has(slice?.status)) {
      fail(`${id} must be completed before canary`);
    }
  }
  if (m08.module_score !== calculatedScore) {
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
    const readOnlyBaseline =
      verifiedArtifactDocuments.get("read_only_baseline");
    const releaseInventory = verifiedArtifactDocuments.get("release_inventory");
    const approvalRecord = verifiedArtifactDocuments.get("approval_record");
    const recoveryPoint = verifiedArtifactDocuments.get("recovery_point");
    const productionBaseline = verifiedArtifactDocuments.get(
      "production_baseline",
    );
    const journal = verifiedArtifactDocuments.get("canary_journal");
    const reconciliation = verifiedArtifactDocuments.get(
      "reconciliation_report",
    );
    const rollback = verifiedArtifactDocuments.get("rollback_report");
    const observation = verifiedArtifactDocuments.get("observation_report");
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
    for (const key of policyDigestKeys) {
      if (approvalRecord.details[key] !== journal.details[key]) {
        fail(`approved notification ${key} differs from the canary journal`);
      }
    }
    for (const key of [
      "approvedExternalSubmissionLimit",
      "approvedAttemptLimit",
      "approvedWebhookPayloadByteLimit",
      "approvedWebhookResponseByteLimit",
    ]) {
      if (approvalRecord.details[key] !== journal.details[key]) {
        fail(`approved notification ${key} differs from the canary journal`);
      }
    }
    for (const key of releaseDigestKeys) {
      if (releaseInventory.details[key] !== journal.details[key]) {
        fail(`released notification ${key} differs from the canary journal`);
      }
    }
    for (const key of providerEvidenceDigestKeys) {
      if (reconciliation.details[key] !== journal.details[key]) {
        fail(`canary and reconciliation ${key} differ`);
      }
    }
    for (const key of providerCountKeys) {
      if (reconciliation.details[key] !== journal.details[key]) {
        fail(`notification artifact ${key} differs`);
      }
    }
    for (const key of [
      "smtpLocalSinkSubmissionCount",
      "smtpTransactionalSubmissionCount",
      "smtpTestSubmissionCount",
      "klaviyoProfileSubmissionCount",
      "klaviyoEventSubmissionCount",
      "klaviyoConsentTransitionCount",
      "webhookSignedSubmissionCount",
      "consentWithdrawalBlockedDispatchCount",
      "suppressionImportCount",
      "retryableFailureCount",
      "deadLetterCount",
      "manualReviewCount",
      "deliveryHealthSnapshotCount",
      "eventFamilyCount",
      "providerOutageCaseCount",
      "valueContinuityCaseCount",
      "checkoutOutageCount",
      "acceptedWorkCount",
      "externalSubmissionCount",
    ]) {
      if (observation.details[key] !== journal.details[key]) {
        fail(`notification observation ${key} differs from the journal`);
      }
    }
    if (
      observation.details.observationPolicySha256 !==
      journal.details.observationPolicySha256
    ) {
      fail("notification observation policy differs from the journal");
    }
    const readOnlyObservedAt = exactUtcTime(
      readOnlyBaseline.observedAt,
      "read_only_baseline observedAt",
    );
    const releaseObservedAt = exactUtcTime(
      releaseInventory.observedAt,
      "release_inventory observedAt",
    );
    const recoveryVerifiedAt = exactUtcTime(
      recoveryPoint.details.verifiedAt,
      "recovery_point verifiedAt",
    );
    const baselineCapturedAt = exactUtcTime(
      productionBaseline.details.capturedAt,
      "production_baseline capturedAt",
    );
    const journalStartedAt = exactUtcTime(
      journal.details.startedAt,
      "canary_journal startedAt",
    );
    const journalEndedAt = exactUtcTime(
      journal.details.endedAt,
      "canary_journal endedAt",
    );
    const reconciliationObservedAt = exactUtcTime(
      reconciliation.observedAt,
      "reconciliation_report observedAt",
    );
    const rollbackStartedAt = exactUtcTime(
      rollback.details.startedAt,
      "rollback_report startedAt",
    );
    const rollbackObservedAt = exactUtcTime(
      rollback.observedAt,
      "rollback_report observedAt",
    );
    const observationStartedAt = exactUtcTime(
      observation.details.startedAt,
      "observation_report startedAt",
    );
    const observationEndedAt = exactUtcTime(
      observation.details.endedAt,
      "observation_report endedAt",
    );
    const approvalFinalizedAt = exactUtcTime(
      approvalRecord.details.finalizedAt,
      "approval_record finalizedAt",
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
      readOnlyObservedAt >= journalStartedAt ||
      releaseObservedAt >= journalStartedAt ||
      recoveryVerifiedAt >= journalStartedAt ||
      baselineCapturedAt >= journalStartedAt ||
      latestPrerequisiteApprovalAt >= journalStartedAt ||
      reconciliationObservedAt <= journalEndedAt ||
      rollbackStartedAt <= journalEndedAt ||
      rollbackObservedAt <= journalEndedAt ||
      observationStartedAt > journalStartedAt ||
      observationEndedAt < journalEndedAt ||
      approvalFinalizedAt <= reconciliationObservedAt ||
      approvalFinalizedAt <= rollbackObservedAt ||
      approvalFinalizedAt <= observationEndedAt ||
      approvalObservedAt < approvalFinalizedAt ||
      candidateObservedAt <= approvalObservedAt
    ) {
      fail("production artifact chronology differs");
    }
    if (calculatedScore < candidateEvidence.score.target || belowFloor.length) {
      fail("complete evidence does not meet score and category floors");
    }
    if (m08.status !== "complete" || s06.status !== "completed") {
      fail("complete evidence requires completed M08 and S06 task state");
    }
  } else if (m08.status !== "in_progress" || s06.status !== "in_progress") {
    fail("in-progress evidence must match in-progress M08 and S06 task state");
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
    const m08 = candidateTasks.tasks.find(
      (task) => task.id === "M08-NOTIFICATIONS",
    );
    m08.status = "complete";
    m08.module_score = candidateEvidence.score.total;
    m08.slices.find((slice) => slice.id === "M08-S06-CANARY-AND-CLOSE").status =
      "completed";

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
    candidateEvidence.observedAt = "2026-02-02T00:06:00Z";
    const fixtureDigests = (keys, namespace) =>
      Object.fromEntries(
        keys.map((key) => [key, digest(`fixture:${namespace}:${key}`)]),
      );
    const fixtureAssertions = (artifactId) =>
      artifactCheckBindings.get(artifactId).map((id) => ({
        id,
        status: "passed",
        evidenceSha256: digest(`fixture:${artifactId}:${id}`),
        differenceCount: 0,
      }));
    const releaseDigests = fixtureDigests(releaseDigestKeys, "release");
    const policyDigests = fixtureDigests(policyDigestKeys, "policy");
    const providerEvidenceDigests = fixtureDigests(
      providerEvidenceDigestKeys,
      "provider-evidence",
    );
    const providerCounts = {
      smtpLocalSinkSubmissionCount: 1,
      smtpTransactionalSubmissionCount: 1,
      smtpTestSubmissionCount: 1,
      klaviyoProfileSubmissionCount: 1,
      klaviyoEventSubmissionCount: 1,
      klaviyoConsentTransitionCount: 4,
      webhookSignedSubmissionCount: 1,
      webhookCurrentKeyAcceptanceCount: 1,
      webhookPreviousKeyAcceptanceCount: 1,
      webhookDestinationRejectionCount: 4,
      consentWithdrawalBlockedDispatchCount: 2,
      suppressionImportCount: 1,
      eventDeduplicationAttemptCount: 4,
      eventDeduplicatedEffectCount: 1,
      scheduleTimezoneCaseCount: 2,
      retryableFailureCount: 1,
      deadLetterCount: 1,
      manualReviewCount: 3,
      templateVersionRetentionCount: 2,
      activeTemplateCount: 6,
      deliveryHealthSnapshotCount: 1,
      eventFamilyCount: 9,
      providerOutageCaseCount: 4,
      valueContinuityCaseCount: 1,
      checkoutOutageCount: 1,
      crossTenantDenialCount: 1,
      acceptedWorkCount: 3,
      externalSubmissionCount: 5,
    };
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
          ...releaseDigests,
          deploymentState: "disabled",
          smtpWorkerEnabled: false,
          klaviyoWorkerEnabled: false,
          webhookWorkerEnabled: false,
          registeredMigrationDifference: 0,
          assertions: fixtureAssertions(artifactId),
        };
      }
      if (artifactId === "recovery_point") {
        const keys = [
          "baseBackupSha256",
          "walArchiveSha256",
          "applicationConfigurationSha256",
          "providerReferenceInventorySha256",
          "templateInventorySha256",
          "signingReferenceInventorySha256",
          "restoreEvidenceSha256",
        ];
        return {
          createdAt: "2026-01-31T20:30:00Z",
          verifiedAt: "2026-01-31T20:59:00Z",
          ...fixtureDigests(keys, "recovery"),
          restorable: true,
          rpoSeconds: 60,
          mutationCount: 0,
          assertions: fixtureAssertions(artifactId),
        };
      }
      if (artifactId === "production_baseline") {
        const keys = [
          "eventTotalsSha256",
          "consentTotalsSha256",
          "suppressionTotalsSha256",
          "templateTotalsSha256",
          "providerConnectionTotalsSha256",
          "endpointTotalsSha256",
          "deliveryTotalsSha256",
          "attemptTotalsSha256",
          "manualReviewTotalsSha256",
          "queueTotalsSha256",
          "ledgerTotalsSha256",
          "checkoutAvailabilitySha256",
          "nativeCouponTotalsSha256",
        ];
        return {
          capturedAt: "2026-01-31T22:59:00Z",
          sourceCoverageRatio: 1,
          ...fixtureDigests(keys, "baseline"),
          activeSmtpWorkerCount: 0,
          activeKlaviyoWorkerCount: 0,
          activeWebhookWorkerCount: 0,
          pendingAcceptedWorkCount: 0,
          ledgerDifference: 0,
          couponDifference: 0,
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
          ...policyDigests,
          ...releaseDigests,
          ...providerEvidenceDigests,
          approvedExternalSubmissionLimit: 10,
          approvedAttemptLimit: 5,
          approvedWebhookPayloadByteLimit: 10_240,
          approvedWebhookResponseByteLimit: 32_768,
          ...providerCounts,
          maximumObservedAttemptCount: 3,
          webhookPayloadBytes: 1_024,
          webhookResponseBytes: 2_048,
          webhookReplayDuplicateEffectCount: 0,
          acceptedWorkStrandedCount: 0,
          providerSubmissionDuplicateCount: 0,
          consentBypassCount: 0,
          suppressionBypassCount: 0,
          ambiguousAutoRetryCount: 0,
          crossTenantExposureCount: 0,
          prohibitedFieldExposureCount: 0,
          checkoutBlockedCount: 0,
          ledgerDifference: 0,
          couponDifference: 0,
          loyaltyValueDifference: 0,
          sourceCoverageRatio: 1,
          assertions: fixtureAssertions(artifactId),
        };
      }
      if (artifactId === "reconciliation_report") {
        const truthKeys = [
          "eventTotalsSha256",
          "consentTotalsSha256",
          "suppressionTotalsSha256",
          "templateTotalsSha256",
          "providerConnectionTotalsSha256",
          "endpointTotalsSha256",
          "deliveryTotalsSha256",
          "attemptTotalsSha256",
          "manualReviewTotalsSha256",
          "queueTotalsSha256",
          "providerResultTotalsSha256",
          "ledgerTotalsSha256",
          "checkoutTotalsSha256",
          "nativeCouponTotalsSha256",
        ];
        return {
          sourceCoverageRatio: 1,
          boundedConvergenceComplete: true,
          ...providerEvidenceDigests,
          ...fixtureDigests(truthKeys, "reconciliation"),
          ...providerCounts,
          eventDifference: 0,
          consentDifference: 0,
          suppressionDifference: 0,
          templateDifference: 0,
          providerConnectionDifference: 0,
          endpointDifference: 0,
          deliveryDifference: 0,
          attemptDifference: 0,
          manualReviewDifference: 0,
          queueDifference: 0,
          providerResultDifference: 0,
          replayDifferenceCount: 0,
          privacyDifferenceCount: 0,
          tenantDifferenceCount: 0,
          ledgerDifference: 0,
          checkoutDifferenceCount: 0,
          couponDifference: 0,
          loyaltyValueDifference: 0,
          unresolvedAmbiguousOutcomeCount: 0,
          unresolvedCriticalCount: 0,
          unresolvedHighCount: 0,
          assertions: fixtureAssertions(artifactId),
        };
      }
      if (artifactId === "rollback_report") {
        return {
          startedAt: "2026-02-02T00:01:00Z",
          endedAt: "2026-02-02T00:02:00Z",
          durationSeconds: 60,
          smtpWorkerStopped: true,
          klaviyoWorkerStopped: true,
          webhookWorkerStopped: true,
          acceptedWorkDrainedOrHeld: true,
          priorImagesRestored: true,
          immutableEventsPreserved: true,
          consentHistoryPreserved: true,
          suppressionHistoryPreserved: true,
          templateVersionsPreserved: true,
          deliveryAttemptsPreserved: true,
          manualReviewPreserved: true,
          healthEvidencePreserved: true,
          customerAccessAvailable: true,
          checkoutAvailable: true,
          acceptedWorkStrandedCount: 0,
          providerSubmissionDuplicateCount: 0,
          consentDifference: 0,
          suppressionDifference: 0,
          unresolvedAmbiguousOutcomeCount: 0,
          ledgerDifference: 0,
          couponDifference: 0,
          loyaltyValueDifference: 0,
          evidenceSha256: digest("fixture:rollback:evidence"),
          assertions: fixtureAssertions(artifactId),
        };
      }
      if (artifactId === "observation_report") {
        const observedCounts = Object.fromEntries(
          [
            "smtpLocalSinkSubmissionCount",
            "smtpTransactionalSubmissionCount",
            "smtpTestSubmissionCount",
            "klaviyoProfileSubmissionCount",
            "klaviyoEventSubmissionCount",
            "klaviyoConsentTransitionCount",
            "webhookSignedSubmissionCount",
            "consentWithdrawalBlockedDispatchCount",
            "suppressionImportCount",
            "retryableFailureCount",
            "deadLetterCount",
            "manualReviewCount",
            "deliveryHealthSnapshotCount",
            "eventFamilyCount",
            "providerOutageCaseCount",
            "valueContinuityCaseCount",
            "checkoutOutageCount",
            "acceptedWorkCount",
            "externalSubmissionCount",
          ].map((key) => [key, providerCounts[key]]),
        );
        return {
          startedAt: "2026-02-01T00:00:00Z",
          endedAt: "2026-02-02T00:02:00Z",
          durationSeconds: 86_520,
          sampleIntervalCount: 25,
          sourceCoverageRatio: 1,
          observationPolicySha256: policyDigests.observationPolicySha256,
          latencyWithinApprovedBounds: true,
          loadWithinApprovedBounds: true,
          smtpP95LatencyMs: 250,
          klaviyoP95LatencyMs: 300,
          webhookP95LatencyMs: 350,
          healthP95LatencyMs: 200,
          checkoutP95LatencyMs: 500,
          maxQueueDepth: 5,
          ...observedCounts,
          acceptedWorkStrandedCount: 0,
          providerSubmissionDuplicateCount: 0,
          consentBypassCount: 0,
          suppressionBypassCount: 0,
          ambiguousAutoRetryCount: 0,
          privacyIncidentCount: 0,
          crossTenantExposureCount: 0,
          checkoutBlockedCount: 0,
          eventDifferenceCount: 0,
          consentDifferenceCount: 0,
          suppressionDifferenceCount: 0,
          providerDifferenceCount: 0,
          queueDifferenceCount: 0,
          ledgerDifference: 0,
          couponDifference: 0,
          loyaltyValueDifference: 0,
          unresolvedAmbiguousOutcomeCount: 0,
          openCriticalCount: 0,
          openHighCount: 0,
          evidenceSha256: digest("fixture:observation:evidence"),
          assertions: fixtureAssertions(artifactId),
        };
      }
      if (artifactId === "approval_record") {
        return {
          finalizedAt: fixtureTimes.approval_record,
          release: "v1.0.0",
          ...policyDigests,
          approvedExternalSubmissionLimit: 10,
          approvedAttemptLimit: 5,
          approvedWebhookPayloadByteLimit: 10_240,
          approvedWebhookResponseByteLimit: 32_768,
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
        schema: "starfiniti.notification-canary-artifact.v1",
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
      artifact.path = `docs/plan/evidence/M08/production/notification-${artifact.id.replaceAll("_", "-")}-self-test.json`;
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
  const artifactMutationReader =
    (fixture, targetId, mutation) =>
    (relativePath, expectedDigest, artifactId) => {
      const document = fixture.artifactReader(
        relativePath,
        expectedDigest,
        artifactId,
      );
      if (artifactId === targetId) mutation(document);
      return document;
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
    (check) => check.id === "smtp_local_sink_canary",
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

  const currentProductionCommit = structuredClone(evidence);
  currentProductionCommit.candidate.commit =
    currentProductionCommit.currentProduction.applicationCommit;
  expectRejected(
    currentProductionCommit,
    "candidate commit must differ from current production",
    "a relabelled current-production commit",
  );

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
  ).path = "docs/plan/evidence/M08/canary.yaml";
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
  expectRejected(
    nonzeroReconciliationFixture.candidateEvidence,
    "value or unresolved evidence differs",
    "a reconciliation report with consent drift",
    nonzeroReconciliationFixture.candidateTasks,
    artifactMutationReader(
      nonzeroReconciliationFixture,
      "reconciliation_report",
      (document) => {
        document.details.consentDifference = 1;
      },
    ),
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
    if (new Set(["release_inventory", "approval_record"]).has(artifactId)) {
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
  expectRejected(
    approvalBindingFixture.candidateEvidence,
    "approval_record binding differs",
    "an approval record bound to different production evidence",
    approvalBindingFixture.candidateTasks,
    artifactMutationReader(
      approvalBindingFixture,
      "approval_record",
      (document) => {
        document.details.artifactSha256.read_only_baseline = "f".repeat(64);
      },
    ),
  );

  const approvedPolicyFixture = buildCompleteFixture();
  expectRejected(
    approvedPolicyFixture.candidateEvidence,
    "approved notification notificationPolicySha256 differs",
    "a canary journal for a different approved notification policy",
    approvedPolicyFixture.candidateTasks,
    artifactMutationReader(
      approvedPolicyFixture,
      "canary_journal",
      (document) => {
        document.details.notificationPolicySha256 = digest(
          "fixture:different-notification-policy",
        );
      },
    ),
  );

  const approvedCeilingFixture = buildCompleteFixture();
  expectRejected(
    approvedCeilingFixture.candidateEvidence,
    "approved notification approvedAttemptLimit differs",
    "a canary journal with a different numeric attempt ceiling",
    approvedCeilingFixture.candidateTasks,
    artifactMutationReader(
      approvedCeilingFixture,
      "canary_journal",
      (document) => {
        document.details.approvedAttemptLimit = 4;
      },
    ),
  );

  const releasedAdapterFixture = buildCompleteFixture();
  expectRejected(
    releasedAdapterFixture.candidateEvidence,
    "released notification webhookAdapterSha256 differs",
    "a canary using a different webhook adapter",
    releasedAdapterFixture.candidateTasks,
    artifactMutationReader(
      releasedAdapterFixture,
      "canary_journal",
      (document) => {
        document.details.webhookAdapterSha256 = digest(
          "fixture:different-webhook-adapter",
        );
      },
    ),
  );

  const consentEvidenceFixture = buildCompleteFixture();
  expectRejected(
    consentEvidenceFixture.candidateEvidence,
    "canary and reconciliation consentWithdrawalSha256 differ",
    "a reconciliation report for different consent-withdrawal evidence",
    consentEvidenceFixture.candidateTasks,
    artifactMutationReader(
      consentEvidenceFixture,
      "reconciliation_report",
      (document) => {
        document.details.consentWithdrawalSha256 = digest(
          "fixture:different-consent-withdrawal-evidence",
        );
      },
    ),
  );

  const suppressionEvidenceFixture = buildCompleteFixture();
  expectRejected(
    suppressionEvidenceFixture.candidateEvidence,
    "canary and reconciliation suppressionImportSha256 differ",
    "a reconciliation report for different suppression evidence",
    suppressionEvidenceFixture.candidateTasks,
    artifactMutationReader(
      suppressionEvidenceFixture,
      "reconciliation_report",
      (document) => {
        document.details.suppressionImportSha256 = digest(
          "fixture:different-suppression-evidence",
        );
      },
    ),
  );

  const countMismatchFixture = buildCompleteFixture();
  expectRejected(
    countMismatchFixture.candidateEvidence,
    "notification artifact manualReviewCount differs",
    "a reconciliation report for a different manual-review set",
    countMismatchFixture.candidateTasks,
    artifactMutationReader(
      countMismatchFixture,
      "reconciliation_report",
      (document) => {
        document.details.manualReviewCount = 4;
      },
    ),
  );

  const observationPolicyFixture = buildCompleteFixture();
  expectRejected(
    observationPolicyFixture.candidateEvidence,
    "notification observation policy differs from the journal",
    "an observation measured against a different approved policy",
    observationPolicyFixture.candidateTasks,
    artifactMutationReader(
      observationPolicyFixture,
      "observation_report",
      (document) => {
        document.details.observationPolicySha256 = digest(
          "fixture:different-observation-policy",
        );
      },
    ),
  );

  const lateReleaseFixture = buildCompleteFixture();
  expectRejected(
    lateReleaseFixture.candidateEvidence,
    "production artifact chronology differs",
    "a release inventory observed after canary start",
    lateReleaseFixture.candidateTasks,
    artifactMutationReader(
      lateReleaseFixture,
      "release_inventory",
      (document) => {
        document.observedAt = "2026-02-01T00:01:00Z";
      },
    ),
  );

  const lateOperatorFixture = buildCompleteFixture();
  expectRejected(
    lateOperatorFixture.candidateEvidence,
    "production artifact chronology differs",
    "operator access established only after canary start",
    lateOperatorFixture.candidateTasks,
    artifactMutationReader(
      lateOperatorFixture,
      "read_only_baseline",
      (document) => {
        document.observedAt = "2026-02-01T00:01:00Z";
      },
    ),
  );

  const lateApprovalFixture = buildCompleteFixture();
  expectRejected(
    lateApprovalFixture.candidateEvidence,
    "production artifact chronology differs",
    "a prerequisite approval recorded after canary start",
    lateApprovalFixture.candidateTasks,
    artifactMutationReader(
      lateApprovalFixture,
      "approval_record",
      (document) => {
        document.details.approvals[0].approvedAt = "2026-02-01T00:01:00Z";
      },
    ),
  );

  const earlyRollbackFixture = buildCompleteFixture();
  expectRejected(
    earlyRollbackFixture.candidateEvidence,
    "production artifact chronology differs",
    "a rollback rehearsal completed before canary end",
    earlyRollbackFixture.candidateTasks,
    artifactMutationReader(
      earlyRollbackFixture,
      "rollback_report",
      (document) => {
        document.details.startedAt = "2026-02-01T23:58:00Z";
        document.details.endedAt = "2026-02-01T23:59:00Z";
      },
    ),
  );

  const observationDriftFixture = buildCompleteFixture();
  expectRejected(
    observationDriftFixture.candidateEvidence,
    "observation_report failure evidence differs",
    "an observation window with ledger drift",
    observationDriftFixture.candidateTasks,
    artifactMutationReader(
      observationDriftFixture,
      "observation_report",
      (document) => {
        document.details.ledgerDifference = 1;
      },
    ),
  );

  const shortObservationFixture = buildCompleteFixture();
  expectRejected(
    shortObservationFixture.candidateEvidence,
    "observation_report duration",
    "an observation shorter than twenty-four hours",
    shortObservationFixture.candidateTasks,
    artifactMutationReader(
      shortObservationFixture,
      "observation_report",
      (document) => {
        document.details.startedAt = "2026-02-01T23:02:00Z";
        document.details.durationSeconds = 3_600;
        document.details.sampleIntervalCount = 1;
      },
    ),
  );

  const baselineDrift = structuredClone(evidence);
  baselineDrift.publicBaseline.unsignedWooCommerceIngress = 200;
  expectRejected(
    baselineDrift,
    "differs from the manifest",
    "an unsafe public baseline",
  );

  const incompleteSliceTasks = structuredClone(tasks);
  incompleteSliceTasks.tasks
    .find((task) => task.id === "M08-NOTIFICATIONS")
    .slices.find((slice) => slice.id === "M08-S03-KLAVIYO").status =
    "in_progress";
  expectRejected(
    evidence,
    "must be completed before canary",
    "an incomplete prerequisite slice",
    incompleteSliceTasks,
  );

  const taskScoreDrift = structuredClone(tasks);
  taskScoreDrift.tasks.find(
    (task) => task.id === "M08-NOTIFICATIONS",
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
    (task) => task.id === "M08-NOTIFICATIONS",
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
  `Validated ${evidence.checks.length} M08 notification canary checks and ${evidence.score.categories.length} score categories; score ${result.calculatedScore}/100 with ${evidence.checks.filter((check) => check.status === "passed").length} passed, ${evidence.checks.filter((check) => check.status === "pending").length} pending, and ${evidence.checks.filter((check) => check.status === "failed").length} failed.`,
);
