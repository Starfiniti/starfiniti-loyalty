import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

import { validateCanaryManifestEnvelope } from "./lib/validate-canary-manifest-envelope.mjs";
import { readBoundJsonArtifact } from "./lib/read-bound-json-artifact.mjs";
import { inspectMinimizedEvidence } from "./lib/inspect-minimized-evidence.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const evidencePath = join(root, "docs/plan/evidence/M05/canary.yaml");
const tasksPath = join(root, "docs/plan/TASKS.yaml");

const evidence = YAML.parse(readFileSync(evidencePath, "utf8"));
const tasks = YAML.parse(readFileSync(tasksPath, "utf8"));

const requiredChecks = new Set([
  "exact_head_ci",
  "shadow_v1_v2",
  "contract_policy_matrix",
  "database_authority_matrix",
  "qualification_concurrency",
  "expiry_lifecycle_matrix",
  "browser_accessibility",
  "privacy_minimization",
  "checkout_independence",
  "legacy_compatibility_repository",
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
  "production_shadow_parity",
  "lifetime_qualification_canary",
  "rolling_qualification_canary",
  "calendar_qualification_canary",
  "threshold_group_canary",
  "upgrade_grace_downgrade",
  "refund_backdated_canary",
  "manual_override_canary",
  "multiplier_benefit_canary",
  "reward_access_benefit",
  "free_shipping_benefit",
  "early_access_custom_perk",
  "expiry_preview_canary",
  "expiry_reminder_canary",
  "expiry_sweep_canary",
  "refund_expiry_restoration",
  "customer_progress_canary",
  "merchant_performance_canary",
  "cross_tenant_denial",
  "membership_history_reconciliation",
  "award_multiplier_reconciliation",
  "expiry_liability_reconciliation",
  "notification_reconciliation",
  "disable_state_continuity",
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
    "historical_tier_rewrite",
    "a published tier policy or historical qualification decision is rewritten or reinterpreted",
  ],
  [
    "shadow_parity_drift",
    "a migrated Rose Bloom or Icon case differs between immutable V1 and V2 evaluation",
  ],
  [
    "timezone_boundary_drift",
    "calendar or rolling qualification changes because worker execution time replaces the original event instant",
  ],
  [
    "backdated_nondeterminism",
    "a delayed or backdated fact produces an ordering-dependent tier decision or unexplained history",
  ],
  [
    "refund_downgrade_failure",
    "a refund fails to compensate its original qualification fact or apply the configured retention grace",
  ],
  [
    "duplicate_tier_decision",
    "duplicate replay delayed delivery or concurrent processing creates another tier movement benefit or expiry effect",
  ],
  [
    "override_authority_bypass",
    "a manual override lacks live owner or admin authority reason expiry underlying automatic tier or immutable audit",
  ],
  [
    "benefit_rate_mismatch",
    "a displayed tier rate reward access or fulfilment benefit differs from the executable published definition",
  ],
  [
    "expiry_attribution_loss",
    "expiry or refund restoration loses the original tenant wallet programme version lot or earned-date attribution",
  ],
  [
    "duplicate_expiry_notice",
    "an expiry reminder retry creates another delivery intent or ignores current consent suppression or policy",
  ],
  [
    "untrusted_authority",
    "browser input Auth claims email domain or connector metadata grants tenant customer wallet tier override or value authority",
  ],
  [
    "cross_tenant_exposure",
    "an unrelated tenant programme customer wallet tier fact decision override benefit or evidence becomes visible or mutable",
  ],
  [
    "checkout_dependency",
    "WooCommerce checkout synchronously depends on the Hub worker entitlement tier evaluation expiry or benefit outcome",
  ],
  [
    "disabled_state_stranded",
    "disabling advanced VIP hides history overrides progress expiry evidence or an already accepted tier benefit",
  ],
  [
    "sensitive_evidence",
    "reusable signing material raw payload personal data private qualification facts or ledger metadata enters logs support output or evidence",
  ],
  [
    "unexplained_or_unapproved_close",
    "any tier award expiry reminder liability tenancy or privacy difference approval artifact score floor or critical finding remains unresolved",
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
  ["production_shadow_parity", ["canary_journal"]],
  ["lifetime_qualification_canary", ["canary_journal"]],
  ["rolling_qualification_canary", ["canary_journal"]],
  ["calendar_qualification_canary", ["canary_journal"]],
  ["threshold_group_canary", ["canary_journal"]],
  ["upgrade_grace_downgrade", ["canary_journal"]],
  ["refund_backdated_canary", ["canary_journal"]],
  ["manual_override_canary", ["canary_journal"]],
  ["multiplier_benefit_canary", ["canary_journal"]],
  ["reward_access_benefit", ["canary_journal"]],
  ["free_shipping_benefit", ["canary_journal"]],
  ["early_access_custom_perk", ["canary_journal"]],
  ["expiry_preview_canary", ["canary_journal"]],
  ["expiry_reminder_canary", ["canary_journal"]],
  ["expiry_sweep_canary", ["canary_journal"]],
  ["refund_expiry_restoration", ["canary_journal"]],
  ["customer_progress_canary", ["canary_journal"]],
  ["merchant_performance_canary", ["canary_journal"]],
  ["cross_tenant_denial", ["canary_journal"]],
  ["membership_history_reconciliation", ["reconciliation_report"]],
  ["award_multiplier_reconciliation", ["reconciliation_report"]],
  ["expiry_liability_reconciliation", ["reconciliation_report"]],
  ["notification_reconciliation", ["reconciliation_report"]],
  ["disable_state_continuity", ["rollback_report"]],
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
  throw new Error(`VIP canary evidence invalid: ${message}`);
};

const digest = (value) => createHash("sha256").update(value).digest("hex");
const digestPattern = /^[0-9a-f]{64}$/u;
const inspectEvidence = (value, path = "evidence") =>
  inspectMinimizedEvidence(value, { fail, path });

const safeArtifactPath = (relativePath, artifactId) => {
  const artifactStem = artifactId.replaceAll("_", "-");
  const pattern = new RegExp(
    `^docs/plan/evidence/M05/production/vip-${artifactStem}-[a-z0-9][a-z0-9-]{2,79}\\.json$`,
    "u",
  );
  if (typeof relativePath !== "string" || !pattern.test(relativePath)) {
    fail(`${artifactId} artifact path is unsafe`);
  }
  const absolute = resolve(root, relativePath);
  const allowed = `${resolve(root, "docs/plan/evidence/M05/production")}${sep}`;
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
  "wordpressPluginSha256",
  "migrationInventorySha256",
  "vipContractSha256",
  "programmeContractSha256",
  "rewardContractSha256",
  "notificationContractSha256",
];

const policyDigestKeys = [
  "pilotScopeSha256",
  "rolloutPolicySha256",
  "qualificationPolicySha256",
  "tierLifecyclePolicySha256",
  "benefitPolicySha256",
  "overridePolicySha256",
  "expiryPolicySha256",
  "reminderPolicySha256",
  "observationPolicySha256",
];

const vipEvidenceDigestKeys = [
  "shadowParitySha256",
  "lifetimeQualificationSha256",
  "rollingQualificationSha256",
  "calendarQualificationSha256",
  "thresholdGroupSha256",
  "upgradeGraceDowngradeSha256",
  "refundBackdatedSha256",
  "manualOverrideSha256",
  "multiplierBenefitSha256",
  "rewardAccessSha256",
  "freeShippingSha256",
  "earlyAccessCustomPerkSha256",
  "expiryPreviewSha256",
  "expiryReminderSha256",
  "expirySweepSha256",
  "refundExpiryRestorationSha256",
  "customerProgressSha256",
  "merchantPerformanceSha256",
  "crossTenantDenialSha256",
  "checkoutOutageSha256",
  "privacyScanSha256",
  "deterministicFailureSha256",
  "transientRetrySha256",
];

const vipCountKeys = [
  "shadowParityCaseCount",
  "lifetimeQualificationCount",
  "rollingQualificationCount",
  "calendarQualificationCount",
  "thresholdGroupCount",
  "tierUpgradeCount",
  "graceRetentionCount",
  "tierDowngradeCount",
  "refundBackdatedCount",
  "manualOverrideCount",
  "manualOverrideExpiryCount",
  "multiplierAwardCount",
  "rewardAccessCaseCount",
  "freeShippingCaseCount",
  "earlyAccessCustomPerkCount",
  "expiryPreviewCount",
  "expiryReminderCount",
  "expirySweepCount",
  "refundExpiryRestorationCount",
  "customerProgressCaseCount",
  "merchantPerformanceCaseCount",
  "crossTenantDenialCount",
  "acceptedWorkCount",
  "tierMovementHistoryCount",
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
        "advancedVipFeatureEnabled",
        "vipWorkerEnabled",
        "vipExperienceEnabled",
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
      details.advancedVipFeatureEnabled !== false ||
      details.vipWorkerEnabled !== false ||
      details.vipExperienceEnabled !== false ||
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
        "approvedMaxMembers",
        "approvedMaxBenefitEffects",
        "approvedMaxAdjustedPoints",
        "approvedMaxExpiryPoints",
        "approvedMaxGraceDays",
        "approvedMaxOverrideHours",
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
    uniqueNonzeroDigests(details, policyDigestKeys, "approval_record scope");
    for (const key of [
      "approvedMaxMembers",
      "approvedMaxBenefitEffects",
      "approvedMaxAdjustedPoints",
      "approvedMaxExpiryPoints",
      "approvedMaxGraceDays",
      "approvedMaxOverrideHours",
    ])
      exactPositiveInteger(details[key], `approval_record ${key}`);
    if (
      details.approvedMaxMembers > 100_000 ||
      details.approvedMaxBenefitEffects > 1_000_000 ||
      details.approvedMaxAdjustedPoints > 1_000_000_000 ||
      details.approvedMaxExpiryPoints > 1_000_000_000 ||
      details.approvedMaxGraceDays > 365 ||
      details.approvedMaxOverrideHours > 8_760
    )
      fail("approval_record VIP ceiling differs");
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
      )
        fail(`approval_record ${approval.id} differs`);
      exactNonzeroDigest(
        approval.evidenceSha256,
        `approval_record ${approval.id} evidence`,
      );
      if (approvalDigests.has(approval.evidenceSha256))
        fail("approval_record approvals reuse one evidence digest");
      approvalIds.add(approval.id);
      approvalDigests.add(approval.evidenceSha256);
    }
    exactKeys(
      details.artifactSha256,
      [...requiredArtifacts].filter((id) => id !== "approval_record"),
      "approval_record artifact bindings",
    );
    for (const [id, sha256] of Object.entries(details.artifactSha256))
      exactNonzeroDigest(sha256, `approval_record ${id} binding`);
    return;
  }
  if (artifactId === "recovery_point") {
    const digestKeys = [
      "baseBackupSha256",
      "walArchiveSha256",
      "applicationConfigurationSha256",
      "connectorSigningReferenceInventorySha256",
      "pluginRollbackPackageSha256",
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
      "programmeTotalsSha256",
      "tierPolicyTotalsSha256",
      "qualificationFactTotalsSha256",
      "membershipDecisionTotalsSha256",
      "overrideTotalsSha256",
      "benefitTotalsSha256",
      "expiryPolicyTotalsSha256",
      "expiryLotTotalsSha256",
      "reminderTotalsSha256",
      "ledgerTotalsSha256",
      "notificationTotalsSha256",
      "connectorTotalsSha256",
      "checkoutAvailabilitySha256",
    ];
    exactKeys(
      details,
      [
        "capturedAt",
        "sourceCoverageRatio",
        ...digestKeys,
        "activeAdvancedVipFeatureCount",
        "activeVipWorkerCount",
        "activeVipExperienceCount",
        "pendingAcceptedWorkCount",
        "ledgerDifference",
        "notificationDifference",
        "loyaltyValueDifference",
        "privacyDifferenceCount",
        "mutationCount",
        "assertions",
      ],
      "production_baseline details",
    );
    if (
      exactUtcTime(details.capturedAt, "production_baseline capturedAt") >
        observedAt ||
      details.sourceCoverageRatio !== 1 ||
      details.activeAdvancedVipFeatureCount !== 0 ||
      details.activeVipWorkerCount !== 0 ||
      details.activeVipExperienceCount !== 0 ||
      details.pendingAcceptedWorkCount !== 0 ||
      details.ledgerDifference !== 0 ||
      details.notificationDifference !== 0 ||
      details.loyaltyValueDifference !== 0 ||
      details.privacyDifferenceCount !== 0 ||
      details.mutationCount !== 0
    )
      fail("production_baseline authority, privacy, or value evidence differs");
    uniqueNonzeroDigests(details, digestKeys, "production_baseline");
    exactAssertions(
      details.assertions,
      artifactCheckBindings.get("production_baseline"),
      "production_baseline",
    );
    return;
  }
  if (artifactId === "canary_journal") {
    const zeroKeys = [
      "historicalTierRewriteCount",
      "shadowParityDifference",
      "timezoneBoundaryDriftCount",
      "backdatedOrderingDifference",
      "refundDowngradeGapCount",
      "duplicateTierDecisionCount",
      "overrideAuthorityBypassCount",
      "benefitRateMismatchCount",
      "expiryAttributionLossCount",
      "duplicateExpiryNoticeCount",
      "browserAuthorityCount",
      "crossTenantExposureCount",
      "checkoutBlockedCount",
      "acceptedWorkStrandedCount",
      "deterministicFailureEffectCount",
      "ledgerDifference",
      "notificationDifference",
      "loyaltyValueDifference",
    ];
    exactKeys(
      details,
      [
        "startedAt",
        "endedAt",
        "intervalCount",
        "pilotOrganizationCount",
        "nonCanaryEnabledCount",
        ...policyDigestKeys,
        ...releaseDigestKeys,
        ...vipEvidenceDigestKeys,
        "approvedMaxMembers",
        "approvedMaxBenefitEffects",
        "approvedMaxAdjustedPoints",
        "approvedMaxExpiryPoints",
        "approvedMaxGraceDays",
        "approvedMaxOverrideHours",
        ...vipCountKeys,
        "observedMemberCount",
        "observedBenefitEffectCount",
        "observedAdjustedPoints",
        "observedExpiryPoints",
        "maximumGraceDays",
        "maximumOverrideHours",
        ...zeroKeys,
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
      "approvedMaxMembers",
      "approvedMaxBenefitEffects",
      "approvedMaxAdjustedPoints",
      "approvedMaxExpiryPoints",
      "approvedMaxGraceDays",
      "approvedMaxOverrideHours",
      ...vipCountKeys,
      "observedMemberCount",
      "observedBenefitEffectCount",
      "observedAdjustedPoints",
      "observedExpiryPoints",
      "maximumGraceDays",
      "maximumOverrideHours",
    ])
      exactPositiveInteger(details[key], `canary_journal ${key}`);
    const exactScenarioCounts = {
      shadowParityCaseCount: 36,
      lifetimeQualificationCount: 1,
      rollingQualificationCount: 1,
      calendarQualificationCount: 2,
      thresholdGroupCount: 2,
      tierUpgradeCount: 1,
      graceRetentionCount: 1,
      tierDowngradeCount: 1,
      refundBackdatedCount: 2,
      manualOverrideCount: 1,
      manualOverrideExpiryCount: 1,
      multiplierAwardCount: 1,
      rewardAccessCaseCount: 1,
      freeShippingCaseCount: 1,
      earlyAccessCustomPerkCount: 1,
      expiryPreviewCount: 1,
      expiryReminderCount: 3,
      expirySweepCount: 1,
      refundExpiryRestorationCount: 1,
      customerProgressCaseCount: 1,
      merchantPerformanceCaseCount: 1,
      crossTenantDenialCount: 1,
      acceptedWorkCount: 6,
      tierMovementHistoryCount: 3,
    };
    for (const [key, expected] of Object.entries(exactScenarioCounts))
      if (details[key] !== expected) fail(`canary_journal ${key} differs`);
    for (const key of zeroKeys)
      if (details[key] !== 0) fail("canary_journal safety evidence differs");
    if (
      startedAt >= endedAt ||
      endedAt > observedAt ||
      !Number.isSafeInteger(details.intervalCount) ||
      details.intervalCount < minimumIntervals ||
      details.pilotOrganizationCount !== 1 ||
      details.nonCanaryEnabledCount !== 0 ||
      details.approvedMaxMembers > 100_000 ||
      details.approvedMaxBenefitEffects > 1_000_000 ||
      details.approvedMaxAdjustedPoints > 1_000_000_000 ||
      details.approvedMaxExpiryPoints > 1_000_000_000 ||
      details.approvedMaxGraceDays > 365 ||
      details.approvedMaxOverrideHours > 8_760 ||
      details.observedMemberCount > details.approvedMaxMembers ||
      details.observedBenefitEffectCount > details.approvedMaxBenefitEffects ||
      details.observedAdjustedPoints > details.approvedMaxAdjustedPoints ||
      details.observedExpiryPoints > details.approvedMaxExpiryPoints ||
      details.maximumGraceDays > details.approvedMaxGraceDays ||
      details.maximumOverrideHours > details.approvedMaxOverrideHours ||
      details.sourceCoverageRatio !== 1
    )
      fail("canary_journal scope, value ceiling, or coverage evidence differs");
    uniqueNonzeroDigests(
      details,
      [...policyDigestKeys, ...releaseDigestKeys, ...vipEvidenceDigestKeys],
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
      "tierPolicyTotalsSha256",
      "qualificationFactTotalsSha256",
      "membershipDecisionTotalsSha256",
      "overrideTotalsSha256",
      "benefitTotalsSha256",
      "expiryPolicyTotalsSha256",
      "expiryLotTotalsSha256",
      "reminderTotalsSha256",
      "ledgerTotalsSha256",
      "notificationTotalsSha256",
      "queueTotalsSha256",
      "checkoutTotalsSha256",
    ];
    const differenceKeys = [
      "tierPolicyDifference",
      "qualificationFactDifference",
      "membershipHistoryDifference",
      "awardMultiplierDifference",
      "overrideDifference",
      "benefitDifference",
      "expiryPolicyDifference",
      "expiryLotDifference",
      "expiryLiabilityDifference",
      "notificationDifference",
      "ledgerDifference",
      "queueDifference",
      "checkoutDifferenceCount",
      "privacyDifferenceCount",
      "tenantDifferenceCount",
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
        ...vipEvidenceDigestKeys,
        ...truthDigestKeys,
        ...vipCountKeys,
        ...differenceKeys,
        "assertions",
      ],
      "reconciliation_report details",
    );
    for (const key of vipCountKeys)
      exactPositiveInteger(details[key], `reconciliation_report ${key}`);
    for (const key of differenceKeys)
      if (details[key] !== 0)
        fail("reconciliation_report value or unresolved evidence differs");
    if (
      details.sourceCoverageRatio !== 1 ||
      details.boundedConvergenceComplete !== true
    )
      fail("reconciliation_report coverage or convergence differs");
    uniqueNonzeroDigests(
      details,
      [...vipEvidenceDigestKeys, ...truthDigestKeys],
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
    const trueKeys = [
      "advancedVipFeatureDisabled",
      "vipWorkerStopped",
      "vipExperienceDisabled",
      "acceptedWorkDrainedOrHeld",
      "priorImagesRestored",
      "priorPluginRestored",
      "tierPoliciesPreserved",
      "qualificationFactsPreserved",
      "membershipHistoryPreserved",
      "overridesPreserved",
      "benefitsPreserved",
      "expiryPoliciesPreserved",
      "expiryLotsPreserved",
      "remindersPreserved",
      "ledgerPreserved",
      "customerAccessAvailable",
      "checkoutAvailable",
    ];
    const zeroKeys = [
      "acceptedWorkStrandedCount",
      "duplicateTierDecisionCount",
      "expiryLiabilityDifference",
      "notificationDifference",
      "ledgerDifference",
      "loyaltyValueDifference",
      "unresolvedAmbiguousOutcomeCount",
    ];
    exactKeys(
      details,
      [
        "startedAt",
        "endedAt",
        "durationSeconds",
        ...trueKeys,
        ...zeroKeys,
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
      trueKeys.some((key) => details[key] !== true) ||
      zeroKeys.some((key) => details[key] !== 0)
    )
      fail("rollback_report timing, continuity, or value evidence differs");
    exactNonzeroDigest(details.evidenceSha256, "rollback_report evidence");
    exactAssertions(
      details.assertions,
      artifactCheckBindings.get("rollback_report"),
      "rollback_report",
    );
    return;
  }
  if (artifactId === "observation_report") {
    const zeroKeys = [
      "acceptedWorkStrandedCount",
      "duplicateTierDecisionCount",
      "shadowParityDifference",
      "benefitRateMismatchCount",
      "expiryAttributionLossCount",
      "duplicateExpiryNoticeCount",
      "privacyIncidentCount",
      "crossTenantExposureCount",
      "checkoutBlockedCount",
      "membershipHistoryDifference",
      "awardMultiplierDifference",
      "expiryLiabilityDifference",
      "notificationDifference",
      "ledgerDifference",
      "queueDifferenceCount",
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
        "qualificationP95LatencyMs",
        "lifecycleP95LatencyMs",
        "benefitP95LatencyMs",
        "expiryP95LatencyMs",
        "progressP95LatencyMs",
        "checkoutP95LatencyMs",
        "maxQueueDepth",
        ...vipCountKeys,
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
      "qualificationP95LatencyMs",
      "lifecycleP95LatencyMs",
      "benefitP95LatencyMs",
      "expiryP95LatencyMs",
      "progressP95LatencyMs",
      "checkoutP95LatencyMs",
      ...vipCountKeys,
    ])
      exactPositiveInteger(details[key], `observation_report ${key}`);
    exactNonnegativeInteger(
      details.maxQueueDepth,
      "observation_report maxQueueDepth",
    );
    for (const key of zeroKeys)
      if (details[key] !== 0)
        fail("observation_report failure evidence differs");
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
      [
        "qualificationP95LatencyMs",
        "lifecycleP95LatencyMs",
        "benefitP95LatencyMs",
        "expiryP95LatencyMs",
        "progressP95LatencyMs",
        "checkoutP95LatencyMs",
      ].some((key) => details[key] > 60_000) ||
      details.maxQueueDepth > 100_000
    )
      fail("observation_report duration, coverage, or load evidence differs");
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
  if (candidateEvidence.schema !== "starfiniti.vip-canary.v1") {
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
    const artifactObservedAt = exactUtcTime(
      document.observedAt,
      `${artifact.id} observedAt`,
    );
    if (
      document?.schema !== "starfiniti.vip-canary-artifact.v1" ||
      document.artifactId !== artifact.id ||
      document.candidateCommit !== candidateEvidence.candidate.commit ||
      document.result !== "verified" ||
      typeof document.summary !== "string" ||
      document.summary.length < 20 ||
      document.summary !== document.summary.trim() ||
      artifactObservedAt > candidateObservedAt
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

  const m05 = candidateTasks.tasks.find(
    (task) => task.id === "M05-VIP-AND-EXPIRY",
  );
  const requiredCompletedSlices = new Set([
    "M05-S01-TIER-POLICY",
    "M05-S02-LIVE-QUALIFICATION",
    "M05-S03-BENEFITS-AND-OVERRIDES",
    "M05-S04-EXPIRY-POLICY",
    "M05-S05-PROGRESSION-EXPERIENCE",
  ]);
  const s06 = m05?.slices?.find(
    (slice) => slice.id === "M05-S06-CANARY-AND-CLOSE",
  );
  if (!m05 || !s06) fail("M05 or M05-S06 task is missing");
  for (const id of requiredCompletedSlices) {
    const slice = m05.slices.find((candidate) => candidate.id === id);
    if (slice?.status !== "completed") {
      fail(`${id} must be completed before canary`);
    }
  }
  if (m05.module_score !== calculatedScore) {
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
    if (approvalRecord.details.release !== releaseInventory.details.release)
      fail("approval_record release differs from release_inventory");
    for (const artifactId of requiredArtifacts) {
      if (artifactId === "approval_record") continue;
      if (
        approvalRecord.details.artifactSha256[artifactId] !==
        artifactById.get(artifactId).sha256
      )
        fail(`approval_record binding differs for ${artifactId}`);
    }
    for (const key of policyDigestKeys)
      if (approvalRecord.details[key] !== journal.details[key])
        fail(`approved VIP ${key} differs from the canary journal`);
    for (const key of [
      "approvedMaxMembers",
      "approvedMaxBenefitEffects",
      "approvedMaxAdjustedPoints",
      "approvedMaxExpiryPoints",
      "approvedMaxGraceDays",
      "approvedMaxOverrideHours",
    ])
      if (approvalRecord.details[key] !== journal.details[key])
        fail(`approved VIP ${key} differs from the canary journal`);
    for (const key of releaseDigestKeys)
      if (releaseInventory.details[key] !== journal.details[key])
        fail(`released VIP ${key} differs from the canary journal`);
    for (const key of vipEvidenceDigestKeys)
      if (reconciliation.details[key] !== journal.details[key])
        fail(`canary and reconciliation ${key} differ`);
    for (const key of vipCountKeys) {
      if (
        reconciliation.details[key] !== journal.details[key] ||
        observation.details[key] !== journal.details[key]
      )
        fail(`VIP artifact ${key} differs`);
    }
    if (
      observation.details.observationPolicySha256 !==
      journal.details.observationPolicySha256
    )
      fail("VIP observation policy differs from the journal");
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
    )
      fail("production artifact chronology differs");
    if (calculatedScore < candidateEvidence.score.target || belowFloor.length) {
      fail("complete evidence does not meet score and category floors");
    }
    if (m05.status !== "complete" || s06.status !== "completed") {
      fail("complete evidence requires completed M05 and S06 task state");
    }
  } else if (m05.status !== "in_progress" || s06.status !== "in_progress") {
    fail("in-progress evidence must match in-progress M05 and S06 task state");
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
    const m05 = candidateTasks.tasks.find(
      (task) => task.id === "M05-VIP-AND-EXPIRY",
    );
    m05.status = "complete";
    m05.module_score = candidateEvidence.score.total;
    m05.slices.find((slice) => slice.id === "M05-S06-CANARY-AND-CLOSE").status =
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
    const vipEvidenceDigests = fixtureDigests(
      vipEvidenceDigestKeys,
      "vip-evidence",
    );
    const vipCounts = {
      shadowParityCaseCount: 36,
      lifetimeQualificationCount: 1,
      rollingQualificationCount: 1,
      calendarQualificationCount: 2,
      thresholdGroupCount: 2,
      tierUpgradeCount: 1,
      graceRetentionCount: 1,
      tierDowngradeCount: 1,
      refundBackdatedCount: 2,
      manualOverrideCount: 1,
      manualOverrideExpiryCount: 1,
      multiplierAwardCount: 1,
      rewardAccessCaseCount: 1,
      freeShippingCaseCount: 1,
      earlyAccessCustomPerkCount: 1,
      expiryPreviewCount: 1,
      expiryReminderCount: 3,
      expirySweepCount: 1,
      refundExpiryRestorationCount: 1,
      customerProgressCaseCount: 1,
      merchantPerformanceCaseCount: 1,
      crossTenantDenialCount: 1,
      acceptedWorkCount: 6,
      tierMovementHistoryCount: 3,
    };
    const fixtureDetails = (artifactId) => {
      if (artifactId === "read_only_baseline")
        return {
          ...candidateEvidence.publicBaseline,
          applicationVm: 970,
          databaseVm: 971,
          applicationVmState: "running",
          databaseVmState: "running",
          scope: "read_only",
          mutationCount: 0,
        };
      if (artifactId === "release_inventory")
        return {
          release: "v1.0.0",
          pullRequest: candidateEvidence.candidate.pullRequest,
          repositoryCommit: candidateEvidence.candidate.commit,
          ...releaseDigests,
          deploymentState: "disabled",
          advancedVipFeatureEnabled: false,
          vipWorkerEnabled: false,
          vipExperienceEnabled: false,
          registeredMigrationDifference: 0,
          assertions: fixtureAssertions(artifactId),
        };
      if (artifactId === "recovery_point") {
        const keys = [
          "baseBackupSha256",
          "walArchiveSha256",
          "applicationConfigurationSha256",
          "connectorSigningReferenceInventorySha256",
          "pluginRollbackPackageSha256",
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
          "programmeTotalsSha256",
          "tierPolicyTotalsSha256",
          "qualificationFactTotalsSha256",
          "membershipDecisionTotalsSha256",
          "overrideTotalsSha256",
          "benefitTotalsSha256",
          "expiryPolicyTotalsSha256",
          "expiryLotTotalsSha256",
          "reminderTotalsSha256",
          "ledgerTotalsSha256",
          "notificationTotalsSha256",
          "connectorTotalsSha256",
          "checkoutAvailabilitySha256",
        ];
        return {
          capturedAt: "2026-01-31T22:59:00Z",
          sourceCoverageRatio: 1,
          ...fixtureDigests(keys, "baseline"),
          activeAdvancedVipFeatureCount: 0,
          activeVipWorkerCount: 0,
          activeVipExperienceCount: 0,
          pendingAcceptedWorkCount: 0,
          ledgerDifference: 0,
          notificationDifference: 0,
          loyaltyValueDifference: 0,
          privacyDifferenceCount: 0,
          mutationCount: 0,
          assertions: fixtureAssertions(artifactId),
        };
      }
      if (artifactId === "canary_journal")
        return {
          startedAt: "2026-02-01T00:00:00Z",
          endedAt: "2026-02-02T00:00:00Z",
          intervalCount: 24,
          pilotOrganizationCount: 1,
          nonCanaryEnabledCount: 0,
          ...policyDigests,
          ...releaseDigests,
          ...vipEvidenceDigests,
          approvedMaxMembers: 100,
          approvedMaxBenefitEffects: 100,
          approvedMaxAdjustedPoints: 10_000,
          approvedMaxExpiryPoints: 10_000,
          approvedMaxGraceDays: 30,
          approvedMaxOverrideHours: 168,
          ...vipCounts,
          observedMemberCount: 3,
          observedBenefitEffectCount: 4,
          observedAdjustedPoints: 400,
          observedExpiryPoints: 200,
          maximumGraceDays: 30,
          maximumOverrideHours: 168,
          historicalTierRewriteCount: 0,
          shadowParityDifference: 0,
          timezoneBoundaryDriftCount: 0,
          backdatedOrderingDifference: 0,
          refundDowngradeGapCount: 0,
          duplicateTierDecisionCount: 0,
          overrideAuthorityBypassCount: 0,
          benefitRateMismatchCount: 0,
          expiryAttributionLossCount: 0,
          duplicateExpiryNoticeCount: 0,
          browserAuthorityCount: 0,
          crossTenantExposureCount: 0,
          checkoutBlockedCount: 0,
          acceptedWorkStrandedCount: 0,
          deterministicFailureEffectCount: 0,
          ledgerDifference: 0,
          notificationDifference: 0,
          loyaltyValueDifference: 0,
          sourceCoverageRatio: 1,
          assertions: fixtureAssertions(artifactId),
        };
      if (artifactId === "reconciliation_report") {
        const truthKeys = [
          "tierPolicyTotalsSha256",
          "qualificationFactTotalsSha256",
          "membershipDecisionTotalsSha256",
          "overrideTotalsSha256",
          "benefitTotalsSha256",
          "expiryPolicyTotalsSha256",
          "expiryLotTotalsSha256",
          "reminderTotalsSha256",
          "ledgerTotalsSha256",
          "notificationTotalsSha256",
          "queueTotalsSha256",
          "checkoutTotalsSha256",
        ];
        return {
          sourceCoverageRatio: 1,
          boundedConvergenceComplete: true,
          ...vipEvidenceDigests,
          ...fixtureDigests(truthKeys, "reconciliation"),
          ...vipCounts,
          tierPolicyDifference: 0,
          qualificationFactDifference: 0,
          membershipHistoryDifference: 0,
          awardMultiplierDifference: 0,
          overrideDifference: 0,
          benefitDifference: 0,
          expiryPolicyDifference: 0,
          expiryLotDifference: 0,
          expiryLiabilityDifference: 0,
          notificationDifference: 0,
          ledgerDifference: 0,
          queueDifference: 0,
          checkoutDifferenceCount: 0,
          privacyDifferenceCount: 0,
          tenantDifferenceCount: 0,
          loyaltyValueDifference: 0,
          unresolvedAmbiguousOutcomeCount: 0,
          unresolvedCriticalCount: 0,
          unresolvedHighCount: 0,
          assertions: fixtureAssertions(artifactId),
        };
      }
      if (artifactId === "rollback_report")
        return {
          startedAt: "2026-02-02T00:01:00Z",
          endedAt: "2026-02-02T00:02:00Z",
          durationSeconds: 60,
          advancedVipFeatureDisabled: true,
          vipWorkerStopped: true,
          vipExperienceDisabled: true,
          acceptedWorkDrainedOrHeld: true,
          priorImagesRestored: true,
          priorPluginRestored: true,
          tierPoliciesPreserved: true,
          qualificationFactsPreserved: true,
          membershipHistoryPreserved: true,
          overridesPreserved: true,
          benefitsPreserved: true,
          expiryPoliciesPreserved: true,
          expiryLotsPreserved: true,
          remindersPreserved: true,
          ledgerPreserved: true,
          customerAccessAvailable: true,
          checkoutAvailable: true,
          acceptedWorkStrandedCount: 0,
          duplicateTierDecisionCount: 0,
          expiryLiabilityDifference: 0,
          notificationDifference: 0,
          ledgerDifference: 0,
          loyaltyValueDifference: 0,
          unresolvedAmbiguousOutcomeCount: 0,
          evidenceSha256: digest("fixture:rollback:evidence"),
          assertions: fixtureAssertions(artifactId),
        };
      if (artifactId === "observation_report")
        return {
          startedAt: "2026-02-01T00:00:00Z",
          endedAt: "2026-02-02T00:02:00Z",
          durationSeconds: 86_520,
          sampleIntervalCount: 25,
          sourceCoverageRatio: 1,
          observationPolicySha256: policyDigests.observationPolicySha256,
          latencyWithinApprovedBounds: true,
          loadWithinApprovedBounds: true,
          qualificationP95LatencyMs: 250,
          lifecycleP95LatencyMs: 300,
          benefitP95LatencyMs: 350,
          expiryP95LatencyMs: 400,
          progressP95LatencyMs: 200,
          checkoutP95LatencyMs: 500,
          maxQueueDepth: 5,
          ...vipCounts,
          acceptedWorkStrandedCount: 0,
          duplicateTierDecisionCount: 0,
          shadowParityDifference: 0,
          benefitRateMismatchCount: 0,
          expiryAttributionLossCount: 0,
          duplicateExpiryNoticeCount: 0,
          privacyIncidentCount: 0,
          crossTenantExposureCount: 0,
          checkoutBlockedCount: 0,
          membershipHistoryDifference: 0,
          awardMultiplierDifference: 0,
          expiryLiabilityDifference: 0,
          notificationDifference: 0,
          ledgerDifference: 0,
          queueDifferenceCount: 0,
          loyaltyValueDifference: 0,
          unresolvedAmbiguousOutcomeCount: 0,
          openCriticalCount: 0,
          openHighCount: 0,
          evidenceSha256: digest("fixture:observation:evidence"),
          assertions: fixtureAssertions(artifactId),
        };
      if (artifactId === "approval_record")
        return {
          finalizedAt: fixtureTimes.approval_record,
          release: "v1.0.0",
          ...policyDigests,
          approvedMaxMembers: 100,
          approvedMaxBenefitEffects: 100,
          approvedMaxAdjustedPoints: 10_000,
          approvedMaxExpiryPoints: 10_000,
          approvedMaxGraceDays: 30,
          approvedMaxOverrideHours: 168,
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
      fail(`missing fixture details for ${artifactId}`);
    };
    const bindings = new Map();
    for (const artifact of candidateEvidence.artifacts.filter(
      (candidate) => candidate.id !== "approval_record",
    )) {
      const document = {
        schema: "starfiniti.vip-canary-artifact.v1",
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
      artifact.path = `docs/plan/evidence/M05/production/vip-${artifact.id.replaceAll("_", "-")}-self-test.json`;
      artifact.sha256 = digest(raw);
      bindings.set(artifact.id, {
        artifact: structuredClone(artifact),
        document,
      });
    }
    const approvalArtifact = candidateEvidence.artifacts.find(
      (artifact) => artifact.id === "approval_record",
    );
    const approvalDocument = {
      schema: "starfiniti.vip-canary-artifact.v1",
      artifactId: approvalArtifact.id,
      candidateCommit: candidateEvidence.candidate.commit,
      observedAt: fixtureTimes.approval_record,
      result: "verified",
      summary:
        "Synthetic self-test evidence verifies the exact approval_record completion boundary.",
      checks: artifactCheckBindings.get("approval_record"),
      details: fixtureDetails("approval_record"),
    };
    const approvalRaw = JSON.stringify(approvalDocument);
    approvalArtifact.status = "verified";
    approvalArtifact.path =
      "docs/plan/evidence/M05/production/vip-approval-record-self-test.json";
    approvalArtifact.sha256 = digest(approvalRaw);
    bindings.set("approval_record", {
      artifact: structuredClone(approvalArtifact),
      document: approvalDocument,
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
    (check) => check.id === "lifetime_qualification_canary",
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
  ).path = "docs/plan/evidence/M05/canary.yaml";
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

  const hollowArtifactFixture = buildCompleteFixture();
  expectRejected(
    hollowArtifactFixture.candidateEvidence,
    "details keys differ",
    "digest-valid but semantically hollow production evidence",
    hollowArtifactFixture.candidateTasks,
    artifactMutationReader(
      hollowArtifactFixture,
      "canary_journal",
      (document) => {
        document.details = { fixture: true, mutationCount: 0 };
      },
    ),
  );

  const extraArtifactFieldFixture = buildCompleteFixture();
  expectRejected(
    extraArtifactFieldFixture.candidateEvidence,
    "artifact document keys differ",
    "an artifact with an unreviewed top-level field",
    extraArtifactFieldFixture.candidateTasks,
    artifactMutationReader(
      extraArtifactFieldFixture,
      "reconciliation_report",
      (document) => {
        document.unreviewedClaim = true;
      },
    ),
  );

  const impossibleTimeFixture = buildCompleteFixture();
  expectRejected(
    impossibleTimeFixture.candidateEvidence,
    "must be an exact UTC timestamp",
    "an impossible normalized artifact timestamp",
    impossibleTimeFixture.candidateTasks,
    artifactMutationReader(
      impossibleTimeFixture,
      "read_only_baseline",
      (document) => {
        document.observedAt = "2026-02-30T00:00:00Z";
      },
    ),
  );

  const nonzeroReconciliationFixture = buildCompleteFixture();
  expectRejected(
    nonzeroReconciliationFixture.candidateEvidence,
    "value or unresolved evidence differs",
    "a reconciliation report with tier-history drift",
    nonzeroReconciliationFixture.candidateTasks,
    artifactMutationReader(
      nonzeroReconciliationFixture,
      "reconciliation_report",
      (document) => {
        document.details.membershipHistoryDifference = 1;
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
    if (new Set(["release_inventory", "approval_record"]).has(artifactId))
      document.details.release =
        reusedProductionReleaseFixture.candidateEvidence.currentProduction.release;
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
    "approved VIP qualificationPolicySha256 differs",
    "a canary journal for a different qualification policy",
    approvedPolicyFixture.candidateTasks,
    artifactMutationReader(
      approvedPolicyFixture,
      "canary_journal",
      (document) => {
        document.details.qualificationPolicySha256 = digest(
          "fixture:different-qualification-policy",
        );
      },
    ),
  );

  const approvedCeilingFixture = buildCompleteFixture();
  expectRejected(
    approvedCeilingFixture.candidateEvidence,
    "approved VIP approvedMaxExpiryPoints differs",
    "a canary journal with a different expiry ceiling",
    approvedCeilingFixture.candidateTasks,
    artifactMutationReader(
      approvedCeilingFixture,
      "canary_journal",
      (document) => {
        document.details.approvedMaxExpiryPoints = 9_999;
      },
    ),
  );

  const releasedPluginFixture = buildCompleteFixture();
  expectRejected(
    releasedPluginFixture.candidateEvidence,
    "released VIP wordpressPluginSha256 differs",
    "a canary using a different WooCommerce plugin package",
    releasedPluginFixture.candidateTasks,
    artifactMutationReader(
      releasedPluginFixture,
      "canary_journal",
      (document) => {
        document.details.wordpressPluginSha256 = digest(
          "fixture:different-wordpress-plugin",
        );
      },
    ),
  );

  const shadowEvidenceFixture = buildCompleteFixture();
  expectRejected(
    shadowEvidenceFixture.candidateEvidence,
    "canary and reconciliation shadowParitySha256 differ",
    "a reconciliation report for different shadow parity evidence",
    shadowEvidenceFixture.candidateTasks,
    artifactMutationReader(
      shadowEvidenceFixture,
      "reconciliation_report",
      (document) => {
        document.details.shadowParitySha256 = digest(
          "fixture:different-shadow-parity",
        );
      },
    ),
  );

  const expiryEvidenceFixture = buildCompleteFixture();
  expectRejected(
    expiryEvidenceFixture.candidateEvidence,
    "canary and reconciliation refundExpiryRestorationSha256 differ",
    "a reconciliation report for different expiry restoration",
    expiryEvidenceFixture.candidateTasks,
    artifactMutationReader(
      expiryEvidenceFixture,
      "reconciliation_report",
      (document) => {
        document.details.refundExpiryRestorationSha256 = digest(
          "fixture:different-expiry-restoration",
        );
      },
    ),
  );

  const countMismatchFixture = buildCompleteFixture();
  expectRejected(
    countMismatchFixture.candidateEvidence,
    "VIP artifact shadowParityCaseCount differs",
    "a reconciliation report with fewer shadow cases",
    countMismatchFixture.candidateTasks,
    artifactMutationReader(
      countMismatchFixture,
      "reconciliation_report",
      (document) => {
        document.details.shadowParityCaseCount = 35;
      },
    ),
  );

  const observationPolicyFixture = buildCompleteFixture();
  expectRejected(
    observationPolicyFixture.candidateEvidence,
    "VIP observation policy differs from the journal",
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

  const benefitMismatchFixture = buildCompleteFixture();
  expectRejected(
    benefitMismatchFixture.candidateEvidence,
    "canary_journal safety evidence differs",
    "a canary with displayed-versus-executed benefit drift",
    benefitMismatchFixture.candidateTasks,
    artifactMutationReader(
      benefitMismatchFixture,
      "canary_journal",
      (document) => {
        document.details.benefitRateMismatchCount = 1;
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
    "an observation window with expiry-liability drift",
    observationDriftFixture.candidateTasks,
    artifactMutationReader(
      observationDriftFixture,
      "observation_report",
      (document) => {
        document.details.expiryLiabilityDifference = 1;
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
    .find((task) => task.id === "M05-VIP-AND-EXPIRY")
    .slices.find(
      (slice) => slice.id === "M05-S03-BENEFITS-AND-OVERRIDES",
    ).status = "in_progress";
  expectRejected(
    evidence,
    "must be completed before canary",
    "an incomplete prerequisite slice",
    incompleteSliceTasks,
  );

  const taskScoreDrift = structuredClone(tasks);
  taskScoreDrift.tasks.find(
    (task) => task.id === "M05-VIP-AND-EXPIRY",
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
    (task) => task.id === "M05-VIP-AND-EXPIRY",
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
  `Validated ${evidence.checks.length} M05 canary checks and ${evidence.score.categories.length} score categories; score ${result.calculatedScore}/100 with ${evidence.checks.filter((check) => check.status === "passed").length} passed, ${evidence.checks.filter((check) => check.status === "pending").length} pending, and ${evidence.checks.filter((check) => check.status === "failed").length} failed.`,
);
