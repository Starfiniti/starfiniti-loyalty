import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";
import { validateCanaryManifestEnvelope } from "./lib/validate-canary-manifest-envelope.mjs";
import { readBoundJsonArtifact } from "./lib/read-bound-json-artifact.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const evidencePath = join(root, "docs/plan/evidence/M09/canary.yaml");
const tasksPath = join(root, "docs/plan/TASKS.yaml");

const evidence = YAML.parse(readFileSync(evidencePath, "utf8"));
const tasks = YAML.parse(readFileSync(tasksPath, "utf8"));

const requiredChecks = new Set([
  "exact_head_ci",
  "migration_replay",
  "test_and_contract_matrix",
  "woocommerce_runtime_matrix",
  "browser_accessibility",
  "asset_and_checkout_budget",
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
  "hosted_public_canary",
  "hosted_member_canary",
  "merchant_editor_canary",
  "english_only_production",
  "woocommerce_snapshot_canary",
  "woocommerce_classic_canary",
  "woocommerce_blocks_canary",
  "no_script_fallback",
  "native_coupon_continuity",
  "hub_outage_checkout",
  "worker_outage_checkout",
  "production_privacy",
  "ledger_reconciliation",
  "coupon_reconciliation",
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
    "browser_scope_authority",
    "browser route query form preview cache or mutable identity claim chooses tenant customer channel wallet programme balance reward or value authority",
  ],
  [
    "cross_tenant_exposure",
    "an unrelated tenant programme customer snapshot presentation reservation coupon queue or internal selector becomes visible mutable or externally actionable",
  ],
  [
    "stale_snapshot_value_authority",
    "stale malformed conflicting older or cross-connection local snapshot replaces the last valid cache or grants affordability redemption or coupon authority",
  ],
  [
    "duplicate_value_effect",
    "retry concurrent delivery outage recovery or presentation action creates another ledger reservation coupon command or native value effect",
  ],
  [
    "checkout_dependency",
    "WooCommerce checkout synchronously depends on Hub DNS application worker entitlement presentation provider snapshot or progressive panel availability",
  ],
  [
    "public_customer_exposure",
    "anonymous or public output reveals customer order balance referral reservation coupon identity or private authority evidence",
  ],
  [
    "uncontrolled_asset_or_script",
    "merchant copy markup URL asset script style remote content or unbounded progressive payload escapes the controlled presentation contract",
  ],
  [
    "accessibility_regression",
    "a critical keyboard screen-reader focus contrast zoom reflow reduced-motion mobile or no-script task remains inaccessible",
  ],
  [
    "language_scope_drift",
    "a non-English route locale selector switcher or hidden active customer-language path enters the English-only product",
  ],
  [
    "native_coupon_loss",
    "presentation disablement Hub outage worker outage rollback or prior-image recovery hides invalidates or releases an already promised native coupon",
  ],
  [
    "accepted_work_stranded",
    "disablement rollback or prior-image recovery hides deletes or strands accepted events snapshots commands leases reservations coupons or required reconciliation",
  ],
  [
    "reconciliation_gap",
    "ledger lot reservation coupon connector queue presentation or customer aggregate differs from immutable commerce and value evidence",
  ],
  [
    "sensitive_evidence",
    "contact identity raw payload coupon plaintext reusable signing material private selector or ledger metadata enters public output logs support output or evidence",
  ],
  [
    "unsafe_rollout",
    "migration presentation or panel is enabled outside the approved pilot before recovery baseline disabled deployment and non-canary isolation pass",
  ],
  [
    "score_or_approval_bypass",
    "module status completion approval artifact score total or category floor is changed without exact synchronized evidence",
  ],
  [
    "unexplained_or_unapproved_close",
    "any accessibility privacy tenancy snapshot value coupon checkout queue approval artifact score floor or critical finding remains unresolved",
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
  ["hosted_public_canary", ["canary_journal"]],
  ["hosted_member_canary", ["canary_journal"]],
  ["merchant_editor_canary", ["canary_journal"]],
  ["english_only_production", ["canary_journal"]],
  ["woocommerce_snapshot_canary", ["canary_journal"]],
  ["woocommerce_classic_canary", ["canary_journal"]],
  ["woocommerce_blocks_canary", ["canary_journal"]],
  ["no_script_fallback", ["canary_journal"]],
  ["native_coupon_continuity", ["canary_journal"]],
  ["hub_outage_checkout", ["canary_journal"]],
  ["worker_outage_checkout", ["canary_journal"]],
  ["production_privacy", ["canary_journal"]],
  ["ledger_reconciliation", ["reconciliation_report"]],
  ["coupon_reconciliation", ["reconciliation_report"]],
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
const maximumEvidenceTextLength = 4_096;
const fail = (message) => {
  throw new Error(`Storefront canary evidence invalid: ${message}`);
};

const digest = (value) => createHash("sha256").update(value).digest("hex");
const digestPattern = /^[0-9a-f]{64}$/u;
const forbiddenKey =
  /(password|passphrase|secret|private.?key|access.?token|refresh.?token|bearer|credential.?value|raw.?body|coupon.?code|email|customer.?id|order.?id|auth.?uuid|tenant.?id|wallet.?id|reservation.?id|case.?id|connection.?id|idempotency.?key)/i;
const forbiddenValue =
  /(-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/=-]{12,}|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b)/i;

const inspectEvidence = (
  value,
  path = "evidence",
  ancestors = new WeakSet(),
) => {
  if (typeof value === "string") {
    if (value.length > maximumEvidenceTextLength) {
      fail(`evidence text at ${path} exceeds the bounded length`);
    }
    if (forbiddenValue.test(value)) {
      fail(`forbidden sensitive value at ${path}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) fail(`cyclic evidence at ${path}`);
    ancestors.add(value);
    value.forEach((item, index) =>
      inspectEvidence(item, `${path}[${index}]`, ancestors),
    );
    ancestors.delete(value);
    return;
  }
  if (value && typeof value === "object") {
    if (ancestors.has(value)) fail(`cyclic evidence at ${path}`);
    ancestors.add(value);
    for (const [key, nested] of Object.entries(value)) {
      if (forbiddenKey.test(key))
        fail(`forbidden sensitive key ${path}.${key}`);
      inspectEvidence(nested, `${path}.${key}`, ancestors);
    }
    ancestors.delete(value);
    return;
  }
};

const safeArtifactPath = (relativePath, artifactId) => {
  const artifactStem = artifactId.replaceAll("_", "-");
  const pattern = new RegExp(
    `^docs/plan/evidence/M09/production/storefront-${artifactStem}-[a-z0-9][a-z0-9-]{2,79}\\.json$`,
    "u",
  );
  if (typeof relativePath !== "string" || !pattern.test(relativePath)) {
    fail(`${artifactId} artifact path is unsafe`);
  }
  const absolute = resolve(root, relativePath);
  const allowed = `${resolve(root, "docs/plan/evidence/M09/production")}${sep}`;
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
    const digestKeys = [
      "dashboardImageSha256",
      "workerImageSha256",
      "wordpressPluginSha256",
      "migrationInventorySha256",
      "experienceContractSha256",
    ];
    exactKeys(
      details,
      [
        "release",
        "pullRequest",
        "repositoryCommit",
        ...digestKeys,
        "deploymentState",
        "hostedPresentationEnabled",
        "woocommerceClassicEnabled",
        "woocommerceBlocksDataEnabled",
        "woocommerceBlocksPanelEnabled",
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
      details.hostedPresentationEnabled !== false ||
      details.woocommerceClassicEnabled !== false ||
      details.woocommerceBlocksDataEnabled !== false ||
      details.woocommerceBlocksPanelEnabled !== false ||
      details.registeredMigrationDifference !== 0
    ) {
      fail("release_inventory identity or disabled state differs");
    }
    uniqueNonzeroDigests(details, digestKeys, "release_inventory");
    exactAssertions(
      details.assertions,
      artifactCheckBindings.get("release_inventory"),
      "release_inventory",
    );
    return;
  }
  if (artifactId === "approval_record") {
    const policyDigestKeys = [
      "pilotScopeSha256",
      "controlScopeSha256",
      "rolloutPolicySha256",
      "experienceContractSha256",
      "assetBudgetPolicySha256",
      "observationPolicySha256",
    ];
    exactKeys(
      details,
      [
        "finalizedAt",
        "release",
        ...policyDigestKeys,
        "snapshotByteLimit",
        "snapshotSelectorLimit",
        "blocksJavaScriptGzipByteLimit",
        "blocksCssGzipByteLimit",
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
      "snapshotByteLimit",
      "snapshotSelectorLimit",
      "blocksJavaScriptGzipByteLimit",
      "blocksCssGzipByteLimit",
    ]) {
      exactPositiveInteger(details[key], `approval_record ${key}`);
    }
    if (
      details.snapshotByteLimit > 32 * 1024 ||
      details.snapshotSelectorLimit > 25 ||
      details.blocksJavaScriptGzipByteLimit > 4 * 1024 ||
      details.blocksCssGzipByteLimit > 2 * 1024
    ) {
      fail("approval_record storefront budget differs");
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
      "snapshotSha256",
      "ledgerTotalsSha256",
      "lotTotalsSha256",
      "walletProjectionTotalsSha256",
      "reservationTotalsSha256",
      "commerceEventTotalsSha256",
      "commandQueueTotalsSha256",
      "nativeCouponTotalsSha256",
      "wordpressCacheTotalsSha256",
      "presentationRevisionTotalsSha256",
      "checkoutAvailabilitySha256",
    ];
    exactKeys(
      details,
      [
        "capturedAt",
        "sourceCoverageRatio",
        ...digestKeys,
        "activeHostedPresentationCount",
        "activeClassicPlacementCount",
        "activeBlocksDataCount",
        "activeBlocksPanelCount",
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
      details.activeHostedPresentationCount !== 0 ||
      details.activeClassicPlacementCount !== 0 ||
      details.activeBlocksDataCount !== 0 ||
      details.activeBlocksPanelCount !== 0 ||
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
    const digestKeys = [
      "pilotScopeSha256",
      "controlScopeSha256",
      "rolloutPolicySha256",
      "experienceContractSha256",
      "assetBudgetPolicySha256",
      "observationPolicySha256",
      "dashboardImageSha256",
      "workerImageSha256",
      "wordpressPluginSha256",
      "migrationInventorySha256",
      "hostedPublicSnapshotSha256",
      "hostedMemberSnapshotSha256",
      "presentationRevisionSha256",
      "woocommerceSnapshotRevisionSha256",
      "nativeCouponContinuitySha256",
      "hubOutageCheckoutTraceSha256",
      "workerOutageCheckoutTraceSha256",
      "privacyScanSha256",
      "browserAccessibilitySha256",
    ];
    exactKeys(
      details,
      [
        "startedAt",
        "endedAt",
        "intervalCount",
        "pilotStoreCount",
        "controlStoreCount",
        "nonCanaryEnabledCount",
        ...digestKeys,
        "snapshotByteLimit",
        "snapshotSelectorLimit",
        "blocksJavaScriptGzipByteLimit",
        "blocksCssGzipByteLimit",
        "hostedPublicRenderCount",
        "hostedMemberRenderCount",
        "merchantEditorSaveCount",
        "documentLanguage",
        "activeLocaleRouteCount",
        "languageSwitcherCount",
        "nonEnglishCustomerStringCount",
        "woocommerceSnapshotAcceptedCount",
        "malformedSnapshotRejectedCount",
        "staleSnapshotRejectedCount",
        "conflictingSnapshotRejectedCount",
        "olderSnapshotRejectedCount",
        "crossConnectionSnapshotRejectedCount",
        "classicMyAccountRenderCount",
        "classicProductRenderCount",
        "classicCartRenderCount",
        "classicCheckoutRenderCount",
        "classicPostPurchaseRenderCount",
        "classicPlacementRenderCount",
        "blocksDataRenderCount",
        "blocksPanelRenderCount",
        "blocksDataEnabledBeforePanel",
        "noScriptCheckoutCount",
        "nativeCouponBeforeCount",
        "nativeCouponAfterCount",
        "hubOutageCheckoutCount",
        "workerOutageCheckoutCount",
        "workerRecoveryConvergedCount",
        "acceptedWorkCount",
        "acceptedWorkStrandedCount",
        "snapshotBytes",
        "snapshotSelectorCount",
        "classicJavaScriptBytes",
        "classicCssBytes",
        "blocksJavaScriptGzipBytes",
        "blocksCssGzipBytes",
        "renderTimeHubRequestCount",
        "checkoutSynchronousHubRequestCount",
        "publicProhibitedFieldExposureCount",
        "crossTenantExposureCount",
        "browserAuthorityAcceptedCount",
        "duplicateValueEffectCount",
        "checkoutBlockedCount",
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
      "snapshotByteLimit",
      "snapshotSelectorLimit",
      "blocksJavaScriptGzipByteLimit",
      "blocksCssGzipByteLimit",
      "snapshotBytes",
      "snapshotSelectorCount",
      "blocksJavaScriptGzipBytes",
      "blocksCssGzipBytes",
      "acceptedWorkCount",
    ]) {
      exactPositiveInteger(details[key], `canary_journal ${key}`);
    }
    for (const key of [
      "hostedPublicRenderCount",
      "hostedMemberRenderCount",
      "merchantEditorSaveCount",
      "woocommerceSnapshotAcceptedCount",
      "malformedSnapshotRejectedCount",
      "staleSnapshotRejectedCount",
      "conflictingSnapshotRejectedCount",
      "olderSnapshotRejectedCount",
      "crossConnectionSnapshotRejectedCount",
      "classicMyAccountRenderCount",
      "classicProductRenderCount",
      "classicCartRenderCount",
      "classicCheckoutRenderCount",
      "classicPostPurchaseRenderCount",
      "blocksDataRenderCount",
      "blocksPanelRenderCount",
      "noScriptCheckoutCount",
      "nativeCouponBeforeCount",
      "nativeCouponAfterCount",
      "hubOutageCheckoutCount",
      "workerOutageCheckoutCount",
      "workerRecoveryConvergedCount",
    ]) {
      if (details[key] !== 1) fail(`canary_journal ${key} differs`);
    }
    if (
      startedAt >= endedAt ||
      endedAt > observedAt ||
      !Number.isSafeInteger(details.intervalCount) ||
      details.intervalCount < minimumIntervals ||
      details.pilotStoreCount !== 1 ||
      details.controlStoreCount !== 1 ||
      details.nonCanaryEnabledCount !== 0 ||
      details.documentLanguage !== "en" ||
      details.activeLocaleRouteCount !== 0 ||
      details.languageSwitcherCount !== 0 ||
      details.nonEnglishCustomerStringCount !== 0 ||
      details.classicPlacementRenderCount !== 5 ||
      details.classicPlacementRenderCount !==
        details.classicMyAccountRenderCount +
          details.classicProductRenderCount +
          details.classicCartRenderCount +
          details.classicCheckoutRenderCount +
          details.classicPostPurchaseRenderCount ||
      details.blocksDataEnabledBeforePanel !== true ||
      details.snapshotByteLimit > 32 * 1024 ||
      details.snapshotSelectorLimit > 25 ||
      details.blocksJavaScriptGzipByteLimit > 4 * 1024 ||
      details.blocksCssGzipByteLimit > 2 * 1024 ||
      details.snapshotBytes > details.snapshotByteLimit ||
      details.snapshotSelectorCount > details.snapshotSelectorLimit ||
      details.classicJavaScriptBytes !== 0 ||
      details.classicCssBytes !== 0 ||
      details.blocksJavaScriptGzipBytes >
        details.blocksJavaScriptGzipByteLimit ||
      details.blocksCssGzipBytes > details.blocksCssGzipByteLimit ||
      details.renderTimeHubRequestCount !== 0 ||
      details.checkoutSynchronousHubRequestCount !== 0 ||
      details.acceptedWorkStrandedCount !== 0 ||
      details.publicProhibitedFieldExposureCount !== 0 ||
      details.crossTenantExposureCount !== 0 ||
      details.browserAuthorityAcceptedCount !== 0 ||
      details.duplicateValueEffectCount !== 0 ||
      details.checkoutBlockedCount !== 0 ||
      details.ambiguousOutcomeCount !== 0 ||
      details.sourceCoverageRatio !== 1
    ) {
      fail(
        "canary_journal scope, delivery, budget, or safety evidence differs",
      );
    }
    uniqueNonzeroDigests(details, digestKeys, "canary_journal");
    exactAssertions(
      details.assertions,
      artifactCheckBindings.get("canary_journal"),
      "canary_journal",
    );
    return;
  }
  if (artifactId === "reconciliation_report") {
    const matchedDigestKeys = [
      "hostedPublicSnapshotSha256",
      "hostedMemberSnapshotSha256",
      "presentationRevisionSha256",
      "woocommerceSnapshotRevisionSha256",
      "nativeCouponContinuitySha256",
      "hubOutageCheckoutTraceSha256",
      "workerOutageCheckoutTraceSha256",
      "privacyScanSha256",
      "browserAccessibilitySha256",
    ];
    const truthDigestKeys = [
      "ledgerTotalsSha256",
      "lotTotalsSha256",
      "walletProjectionTotalsSha256",
      "reservationTotalsSha256",
      "commerceEventTotalsSha256",
      "commandQueueTotalsSha256",
      "wordpressCacheTotalsSha256",
      "presentationTotalsSha256",
      "nativeCouponTotalsSha256",
    ];
    const countKeys = [
      "hostedPublicRenderCount",
      "hostedMemberRenderCount",
      "merchantEditorSaveCount",
      "woocommerceSnapshotAcceptedCount",
      "classicPlacementRenderCount",
      "blocksDataRenderCount",
      "blocksPanelRenderCount",
      "noScriptCheckoutCount",
      "nativeCouponBeforeCount",
      "nativeCouponAfterCount",
      "hubOutageCheckoutCount",
      "workerOutageCheckoutCount",
      "workerRecoveryConvergedCount",
      "acceptedWorkCount",
    ];
    const differenceKeys = [
      "presentationDifference",
      "snapshotDifference",
      "ledgerDifference",
      "lotDifference",
      "walletProjectionDifference",
      "reservationDifference",
      "commerceEventDifference",
      "commandDifference",
      "queueDifference",
      "wordpressCacheDifference",
      "nativeCouponDifference",
      "checkoutDifferenceCount",
      "accessibilityCriticalCount",
      "privacyDifferenceCount",
      "tenantDifferenceCount",
      "languageScopeDifferenceCount",
      "duplicateValueEffectCount",
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
        ...matchedDigestKeys,
        ...truthDigestKeys,
        ...countKeys,
        ...differenceKeys,
        "assertions",
      ],
      "reconciliation_report details",
    );
    for (const key of countKeys) {
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
      [...matchedDigestKeys, ...truthDigestKeys],
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
        "hostedPresentationDisabled",
        "woocommerceClassicDisabled",
        "woocommerceBlocksDataDisabled",
        "woocommerceBlocksPanelDisabled",
        "acceptedWorkDrainedOrHeld",
        "priorImagesRestored",
        "priorPluginRestored",
        "lastValidSnapshotPreserved",
        "nativeCouponPreserved",
        "nativeCouponUsable",
        "customerValueAccessAvailable",
        "checkoutAvailable",
        "immutableHistoryPreserved",
        "auditHistoryPreserved",
        "acceptedWorkStrandedCount",
        "duplicateValueEffectCount",
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
      details.hostedPresentationDisabled !== true ||
      details.woocommerceClassicDisabled !== true ||
      details.woocommerceBlocksDataDisabled !== true ||
      details.woocommerceBlocksPanelDisabled !== true ||
      details.acceptedWorkDrainedOrHeld !== true ||
      details.priorImagesRestored !== true ||
      details.priorPluginRestored !== true ||
      details.lastValidSnapshotPreserved !== true ||
      details.nativeCouponPreserved !== true ||
      details.nativeCouponUsable !== true ||
      details.customerValueAccessAvailable !== true ||
      details.checkoutAvailable !== true ||
      details.immutableHistoryPreserved !== true ||
      details.auditHistoryPreserved !== true ||
      details.acceptedWorkStrandedCount !== 0 ||
      details.duplicateValueEffectCount !== 0 ||
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
      "hostedPublicRenderCount",
      "hostedMemberRenderCount",
      "merchantEditorSaveCount",
      "woocommerceSnapshotAcceptedCount",
      "classicPlacementRenderCount",
      "blocksDataRenderCount",
      "blocksPanelRenderCount",
      "noScriptCheckoutCount",
      "nativeCouponAfterCount",
      "hubOutageCheckoutCount",
      "workerOutageCheckoutCount",
      "workerRecoveryConvergedCount",
      "acceptedWorkCount",
    ];
    const zeroKeys = [
      "acceptedWorkStrandedCount",
      "duplicateValueEffectCount",
      "privacyIncidentCount",
      "crossTenantExposureCount",
      "browserAuthorityAcceptedCount",
      "activeLocaleRouteCount",
      "languageSwitcherCount",
      "nonEnglishCustomerStringCount",
      "checkoutBlockedCount",
      "presentationDifferenceCount",
      "snapshotDifferenceCount",
      "ledgerDifference",
      "queueDifferenceCount",
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
        "hostedPublicP95LatencyMs",
        "hostedMemberP95LatencyMs",
        "merchantEditorP95LatencyMs",
        "woocommerceRenderP95LatencyMs",
        "checkoutP95LatencyMs",
        "maxQueueDepth",
        ...countKeys,
        "accessibilityAuditCount",
        "staleFallbackCount",
        "offlineFallbackCount",
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
      "hostedPublicP95LatencyMs",
      "hostedMemberP95LatencyMs",
      "merchantEditorP95LatencyMs",
      "woocommerceRenderP95LatencyMs",
      "checkoutP95LatencyMs",
      ...countKeys,
      "accessibilityAuditCount",
      "staleFallbackCount",
      "offlineFallbackCount",
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
      details.hostedPublicP95LatencyMs > 60_000 ||
      details.hostedMemberP95LatencyMs > 60_000 ||
      details.merchantEditorP95LatencyMs > 60_000 ||
      details.woocommerceRenderP95LatencyMs > 60_000 ||
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
  const { observedAt: candidateObservedAt } = validateCanaryManifestEnvelope(
    candidateEvidence,
    candidateTasks,
    fail,
    {
      inspect: inspectEvidence,
    },
  );
  if (candidateEvidence.schema !== "starfiniti.storefront-canary.v1") {
    fail("unexpected schema");
  }
  if (!new Set(["in_progress", "complete"]).has(candidateEvidence.status)) {
    fail("status must be in_progress or complete");
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
      document?.schema !== "starfiniti.storefront-canary-artifact.v1" ||
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

  if (!Array.isArray(candidateEvidence.automaticFails)) {
    fail("automatic failures must be an array");
  }
  if (
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

  const m09 = candidateTasks.tasks.find(
    (task) => task.id === "M09-STOREFRONT-EXPERIENCE",
  );
  const requiredCompletedSlices = new Set([
    "M09-S01-CUSTOMER-EXPERIENCE-CONTRACT",
    "M09-S02-HOSTED-SEVEN-AREA-EXPERIENCE",
    "M09-S03-LOCAL-WOOCOMMERCE-SNAPSHOT-AND-PLACEMENTS",
    "M09-S04-BLOCKS-AND-PROGRESSIVE-PANEL",
    "M09-S05-BRANDING-ACCESSIBILITY-AND-OUTAGE-HARDENING",
  ]);
  const s06 = m09?.slices?.find(
    (slice) => slice.id === "M09-S06-CANARY-AND-CLOSE",
  );
  if (!m09 || !s06) fail("M09 or M09-S06 task is missing");
  for (const id of requiredCompletedSlices) {
    const slice = m09.slices.find((candidate) => candidate.id === id);
    if (!new Set(["complete", "completed"]).has(slice?.status)) {
      fail(`${id} must be completed before canary`);
    }
  }
  if (m09.module_score !== calculatedScore) {
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
    for (const key of [
      "pilotScopeSha256",
      "controlScopeSha256",
      "rolloutPolicySha256",
      "experienceContractSha256",
      "assetBudgetPolicySha256",
      "observationPolicySha256",
    ]) {
      if (approvalRecord.details[key] !== journal.details[key]) {
        fail(`approved storefront ${key} differs from the canary journal`);
      }
    }
    for (const key of [
      "snapshotByteLimit",
      "snapshotSelectorLimit",
      "blocksJavaScriptGzipByteLimit",
      "blocksCssGzipByteLimit",
    ]) {
      if (approvalRecord.details[key] !== journal.details[key]) {
        fail(`approved storefront ${key} differs from the canary journal`);
      }
    }
    for (const key of [
      "dashboardImageSha256",
      "workerImageSha256",
      "wordpressPluginSha256",
      "migrationInventorySha256",
      "experienceContractSha256",
    ]) {
      if (releaseInventory.details[key] !== journal.details[key]) {
        fail(`released storefront ${key} differs from the canary journal`);
      }
    }
    for (const key of [
      "hostedPublicSnapshotSha256",
      "hostedMemberSnapshotSha256",
      "presentationRevisionSha256",
      "woocommerceSnapshotRevisionSha256",
      "nativeCouponContinuitySha256",
      "hubOutageCheckoutTraceSha256",
      "workerOutageCheckoutTraceSha256",
      "privacyScanSha256",
      "browserAccessibilitySha256",
    ]) {
      if (reconciliation.details[key] !== journal.details[key]) {
        fail(`canary and reconciliation ${key} differ`);
      }
    }
    for (const key of [
      "hostedPublicRenderCount",
      "hostedMemberRenderCount",
      "merchantEditorSaveCount",
      "woocommerceSnapshotAcceptedCount",
      "classicPlacementRenderCount",
      "blocksDataRenderCount",
      "blocksPanelRenderCount",
      "noScriptCheckoutCount",
      "nativeCouponAfterCount",
      "hubOutageCheckoutCount",
      "workerOutageCheckoutCount",
      "workerRecoveryConvergedCount",
      "acceptedWorkCount",
    ]) {
      if (
        reconciliation.details[key] !== journal.details[key] ||
        observation.details[key] !== journal.details[key]
      ) {
        fail(`storefront artifact ${key} differs`);
      }
    }
    if (
      reconciliation.details.nativeCouponBeforeCount !==
        journal.details.nativeCouponBeforeCount ||
      observation.details.observationPolicySha256 !==
        journal.details.observationPolicySha256
    ) {
      fail("storefront observation or coupon scope differs from the journal");
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
      readOnlyObservedAt > journalStartedAt ||
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
    if (m09.status !== "complete" || s06.status !== "completed") {
      fail("complete evidence requires completed M09 and S06 task state");
    }
  } else if (m09.status !== "in_progress" || s06.status !== "in_progress") {
    fail("in-progress evidence must match in-progress M09 and S06 task state");
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
    const m09 = candidateTasks.tasks.find(
      (task) => task.id === "M09-STOREFRONT-EXPERIENCE",
    );
    m09.status = "complete";
    m09.module_score = candidateEvidence.score.total;
    m09.slices.find((slice) => slice.id === "M09-S06-CANARY-AND-CLOSE").status =
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
          wordpressPluginSha256: digest("fixture:wordpress-plugin"),
          migrationInventorySha256: digest("fixture:migration-inventory"),
          experienceContractSha256: digest("fixture:experience-contract"),
          deploymentState: "disabled",
          hostedPresentationEnabled: false,
          woocommerceClassicEnabled: false,
          woocommerceBlocksDataEnabled: false,
          woocommerceBlocksPanelEnabled: false,
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
          connectorSigningReferenceInventorySha256: digest(
            "fixture:connector-signing-reference-inventory",
          ),
          pluginRollbackPackageSha256: digest(
            "fixture:plugin-rollback-package",
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
          sourceCoverageRatio: 1,
          snapshotSha256: digest("fixture:production-snapshot"),
          ledgerTotalsSha256: digest("fixture:baseline-ledger-totals"),
          lotTotalsSha256: digest("fixture:baseline-lot-totals"),
          walletProjectionTotalsSha256: digest(
            "fixture:baseline-wallet-projection-totals",
          ),
          reservationTotalsSha256: digest(
            "fixture:baseline-reservation-totals",
          ),
          commerceEventTotalsSha256: digest(
            "fixture:baseline-commerce-event-totals",
          ),
          commandQueueTotalsSha256: digest(
            "fixture:baseline-command-queue-totals",
          ),
          nativeCouponTotalsSha256: digest(
            "fixture:baseline-native-coupon-totals",
          ),
          wordpressCacheTotalsSha256: digest(
            "fixture:baseline-wordpress-cache-totals",
          ),
          presentationRevisionTotalsSha256: digest(
            "fixture:baseline-presentation-revision-totals",
          ),
          checkoutAvailabilitySha256: digest(
            "fixture:baseline-checkout-availability",
          ),
          activeHostedPresentationCount: 0,
          activeClassicPlacementCount: 0,
          activeBlocksDataCount: 0,
          activeBlocksPanelCount: 0,
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
          pilotStoreCount: 1,
          controlStoreCount: 1,
          nonCanaryEnabledCount: 0,
          pilotScopeSha256: digest("fixture:pilot-scope"),
          controlScopeSha256: digest("fixture:control-scope"),
          rolloutPolicySha256: digest("fixture:rollout-policy"),
          experienceContractSha256: digest("fixture:experience-contract"),
          assetBudgetPolicySha256: digest("fixture:asset-budget-policy"),
          observationPolicySha256: digest("fixture:observation-policy"),
          dashboardImageSha256: digest("fixture:dashboard-image"),
          workerImageSha256: digest("fixture:worker-image"),
          wordpressPluginSha256: digest("fixture:wordpress-plugin"),
          migrationInventorySha256: digest("fixture:migration-inventory"),
          hostedPublicSnapshotSha256: digest("fixture:hosted-public-snapshot"),
          hostedMemberSnapshotSha256: digest("fixture:hosted-member-snapshot"),
          presentationRevisionSha256: digest("fixture:presentation-revision"),
          woocommerceSnapshotRevisionSha256: digest(
            "fixture:woocommerce-snapshot-revision",
          ),
          nativeCouponContinuitySha256: digest(
            "fixture:native-coupon-continuity",
          ),
          hubOutageCheckoutTraceSha256: digest(
            "fixture:hub-outage-checkout-trace",
          ),
          workerOutageCheckoutTraceSha256: digest(
            "fixture:worker-outage-checkout-trace",
          ),
          privacyScanSha256: digest("fixture:privacy-scan"),
          browserAccessibilitySha256: digest("fixture:browser-accessibility"),
          snapshotByteLimit: 32_768,
          snapshotSelectorLimit: 25,
          blocksJavaScriptGzipByteLimit: 4_096,
          blocksCssGzipByteLimit: 2_048,
          hostedPublicRenderCount: 1,
          hostedMemberRenderCount: 1,
          merchantEditorSaveCount: 1,
          documentLanguage: "en",
          activeLocaleRouteCount: 0,
          languageSwitcherCount: 0,
          nonEnglishCustomerStringCount: 0,
          woocommerceSnapshotAcceptedCount: 1,
          malformedSnapshotRejectedCount: 1,
          staleSnapshotRejectedCount: 1,
          conflictingSnapshotRejectedCount: 1,
          olderSnapshotRejectedCount: 1,
          crossConnectionSnapshotRejectedCount: 1,
          classicMyAccountRenderCount: 1,
          classicProductRenderCount: 1,
          classicCartRenderCount: 1,
          classicCheckoutRenderCount: 1,
          classicPostPurchaseRenderCount: 1,
          classicPlacementRenderCount: 5,
          blocksDataRenderCount: 1,
          blocksPanelRenderCount: 1,
          blocksDataEnabledBeforePanel: true,
          noScriptCheckoutCount: 1,
          nativeCouponBeforeCount: 1,
          nativeCouponAfterCount: 1,
          hubOutageCheckoutCount: 1,
          workerOutageCheckoutCount: 1,
          workerRecoveryConvergedCount: 1,
          acceptedWorkCount: 3,
          acceptedWorkStrandedCount: 0,
          snapshotBytes: 4_096,
          snapshotSelectorCount: 1,
          classicJavaScriptBytes: 0,
          classicCssBytes: 0,
          blocksJavaScriptGzipBytes: 1_177,
          blocksCssGzipBytes: 430,
          renderTimeHubRequestCount: 0,
          checkoutSynchronousHubRequestCount: 0,
          publicProhibitedFieldExposureCount: 0,
          crossTenantExposureCount: 0,
          browserAuthorityAcceptedCount: 0,
          duplicateValueEffectCount: 0,
          checkoutBlockedCount: 0,
          ambiguousOutcomeCount: 0,
          sourceCoverageRatio: 1,
          assertions: fixtureAssertions(artifactId),
        };
      }
      if (artifactId === "reconciliation_report") {
        return {
          sourceCoverageRatio: 1,
          boundedConvergenceComplete: true,
          hostedPublicSnapshotSha256: digest("fixture:hosted-public-snapshot"),
          hostedMemberSnapshotSha256: digest("fixture:hosted-member-snapshot"),
          presentationRevisionSha256: digest("fixture:presentation-revision"),
          woocommerceSnapshotRevisionSha256: digest(
            "fixture:woocommerce-snapshot-revision",
          ),
          nativeCouponContinuitySha256: digest(
            "fixture:native-coupon-continuity",
          ),
          hubOutageCheckoutTraceSha256: digest(
            "fixture:hub-outage-checkout-trace",
          ),
          workerOutageCheckoutTraceSha256: digest(
            "fixture:worker-outage-checkout-trace",
          ),
          privacyScanSha256: digest("fixture:privacy-scan"),
          browserAccessibilitySha256: digest("fixture:browser-accessibility"),
          ledgerTotalsSha256: digest("fixture:reconciled-ledger-totals"),
          lotTotalsSha256: digest("fixture:reconciled-lot-totals"),
          walletProjectionTotalsSha256: digest(
            "fixture:reconciled-wallet-projection-totals",
          ),
          reservationTotalsSha256: digest(
            "fixture:reconciled-reservation-totals",
          ),
          commerceEventTotalsSha256: digest(
            "fixture:reconciled-commerce-event-totals",
          ),
          commandQueueTotalsSha256: digest(
            "fixture:reconciled-command-queue-totals",
          ),
          wordpressCacheTotalsSha256: digest(
            "fixture:reconciled-wordpress-cache-totals",
          ),
          presentationTotalsSha256: digest(
            "fixture:reconciled-presentation-totals",
          ),
          nativeCouponTotalsSha256: digest(
            "fixture:reconciled-native-coupon-totals",
          ),
          hostedPublicRenderCount: 1,
          hostedMemberRenderCount: 1,
          merchantEditorSaveCount: 1,
          woocommerceSnapshotAcceptedCount: 1,
          classicPlacementRenderCount: 5,
          blocksDataRenderCount: 1,
          blocksPanelRenderCount: 1,
          noScriptCheckoutCount: 1,
          nativeCouponBeforeCount: 1,
          nativeCouponAfterCount: 1,
          hubOutageCheckoutCount: 1,
          workerOutageCheckoutCount: 1,
          workerRecoveryConvergedCount: 1,
          acceptedWorkCount: 3,
          presentationDifference: 0,
          snapshotDifference: 0,
          ledgerDifference: 0,
          lotDifference: 0,
          walletProjectionDifference: 0,
          reservationDifference: 0,
          commerceEventDifference: 0,
          commandDifference: 0,
          queueDifference: 0,
          wordpressCacheDifference: 0,
          nativeCouponDifference: 0,
          checkoutDifferenceCount: 0,
          accessibilityCriticalCount: 0,
          privacyDifferenceCount: 0,
          tenantDifferenceCount: 0,
          languageScopeDifferenceCount: 0,
          duplicateValueEffectCount: 0,
          loyaltyValueDifference: 0,
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
          hostedPresentationDisabled: true,
          woocommerceClassicDisabled: true,
          woocommerceBlocksDataDisabled: true,
          woocommerceBlocksPanelDisabled: true,
          acceptedWorkDrainedOrHeld: true,
          priorImagesRestored: true,
          priorPluginRestored: true,
          lastValidSnapshotPreserved: true,
          nativeCouponPreserved: true,
          nativeCouponUsable: true,
          customerValueAccessAvailable: true,
          checkoutAvailable: true,
          immutableHistoryPreserved: true,
          auditHistoryPreserved: true,
          acceptedWorkStrandedCount: 0,
          duplicateValueEffectCount: 0,
          unresolvedAmbiguousOutcomeCount: 0,
          ledgerDifference: 0,
          couponDifference: 0,
          loyaltyValueDifference: 0,
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
          observationPolicySha256: digest("fixture:observation-policy"),
          latencyWithinApprovedBounds: true,
          loadWithinApprovedBounds: true,
          hostedPublicP95LatencyMs: 250,
          hostedMemberP95LatencyMs: 300,
          merchantEditorP95LatencyMs: 350,
          woocommerceRenderP95LatencyMs: 50,
          checkoutP95LatencyMs: 500,
          maxQueueDepth: 5,
          hostedPublicRenderCount: 1,
          hostedMemberRenderCount: 1,
          merchantEditorSaveCount: 1,
          woocommerceSnapshotAcceptedCount: 1,
          classicPlacementRenderCount: 5,
          blocksDataRenderCount: 1,
          blocksPanelRenderCount: 1,
          noScriptCheckoutCount: 1,
          nativeCouponAfterCount: 1,
          hubOutageCheckoutCount: 1,
          workerOutageCheckoutCount: 1,
          workerRecoveryConvergedCount: 1,
          acceptedWorkCount: 3,
          accessibilityAuditCount: 5,
          staleFallbackCount: 1,
          offlineFallbackCount: 1,
          acceptedWorkStrandedCount: 0,
          duplicateValueEffectCount: 0,
          privacyIncidentCount: 0,
          crossTenantExposureCount: 0,
          browserAuthorityAcceptedCount: 0,
          activeLocaleRouteCount: 0,
          languageSwitcherCount: 0,
          nonEnglishCustomerStringCount: 0,
          checkoutBlockedCount: 0,
          presentationDifferenceCount: 0,
          snapshotDifferenceCount: 0,
          ledgerDifference: 0,
          queueDifferenceCount: 0,
          couponDifference: 0,
          loyaltyValueDifference: 0,
          unresolvedAmbiguousOutcomeCount: 0,
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
          rolloutPolicySha256: digest("fixture:rollout-policy"),
          experienceContractSha256: digest("fixture:experience-contract"),
          assetBudgetPolicySha256: digest("fixture:asset-budget-policy"),
          observationPolicySha256: digest("fixture:observation-policy"),
          snapshotByteLimit: 32_768,
          snapshotSelectorLimit: 25,
          blocksJavaScriptGzipByteLimit: 4_096,
          blocksCssGzipByteLimit: 2_048,
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
        schema: "starfiniti.storefront-canary-artifact.v1",
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
      artifact.path = `docs/plan/evidence/M09/production/storefront-${artifact.id.replaceAll("_", "-")}-self-test.json`;
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

  const extraManifestField = structuredClone(evidence);
  extraManifestField.unreviewed = true;
  expectRejected(
    extraManifestField,
    "manifest keys differ",
    "an unreviewed manifest field",
  );

  const extraCandidateField = structuredClone(evidence);
  extraCandidateField.candidate.unreviewed = true;
  expectRejected(
    extraCandidateField,
    "candidate keys differ",
    "an unreviewed candidate field",
  );

  const extraCheckField = structuredClone(evidence);
  extraCheckField.checks[0].unreviewed = true;
  expectRejected(
    extraCheckField,
    "check keys differ",
    "an unreviewed check field",
  );

  const extraArtifactField = structuredClone(evidence);
  extraArtifactField.artifacts[0].unreviewed = true;
  expectRejected(
    extraArtifactField,
    "artifact keys differ",
    "an unreviewed artifact manifest field",
  );

  const extraCategoryField = structuredClone(evidence);
  extraCategoryField.score.categories[0].unreviewed = true;
  expectRejected(
    extraCategoryField,
    "score category keys differ",
    "an unreviewed score-category field",
  );

  const extraAutomaticFailureField = structuredClone(evidence);
  extraAutomaticFailureField.automaticFails[0].unreviewed = true;
  expectRejected(
    extraAutomaticFailureField,
    "automatic failure keys differ",
    "an unreviewed automatic-failure field",
  );

  const futureManifest = structuredClone(evidence);
  futureManifest.observedAt = "9999-01-01T00:00:00Z";
  expectRejected(
    futureManifest,
    "observedAt must not be in the future",
    "future-dated evidence",
  );

  const oversizedEvidence = structuredClone(evidence);
  oversizedEvidence.checks[0].evidence = "x".repeat(
    maximumEvidenceTextLength + 1,
  );
  expectRejected(
    oversizedEvidence,
    "exceeds the bounded length",
    "unbounded evidence text",
  );

  expectRejected(evidence, "task graph is invalid", "a missing task array", {});

  const cyclicEvidence = {};
  cyclicEvidence.self = cyclicEvidence;
  let cyclicEvidenceRejected = false;
  try {
    inspectEvidence(cyclicEvidence);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes("cyclic evidence")
    ) {
      throw error;
    }
    cyclicEvidenceRejected = true;
  }
  if (!cyclicEvidenceRejected) {
    fail("self-test accepted a recursive evidence structure");
  }

  const unapprovedCompletion = structuredClone(evidence);
  unapprovedCompletion.status = "complete";
  expectRejected(
    unapprovedCompletion,
    "requires release, operator, pilot-store, and canary approval",
    "unapproved evidence as complete",
  );

  const pendingFixture = buildCompleteFixture();
  pendingFixture.candidateEvidence.checks.find(
    (check) => check.id === "hosted_public_canary",
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
  ).path = "docs/plan/evidence/M09/canary.yaml";
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
      document.details.ledgerDifference = 1;
    }
    return document;
  };
  expectRejected(
    nonzeroReconciliationFixture.candidateEvidence,
    "value or unresolved evidence differs",
    "a reconciliation report with ledger drift",
    nonzeroReconciliationFixture.candidateTasks,
    nonzeroReconciliationReader,
  );

  const languageDriftFixture = buildCompleteFixture();
  const languageDriftReader = (relativePath, expectedDigest, artifactId) => {
    const document = languageDriftFixture.artifactReader(
      relativePath,
      expectedDigest,
      artifactId,
    );
    if (artifactId === "canary_journal") {
      document.details.documentLanguage = "sl";
    }
    return document;
  };
  expectRejected(
    languageDriftFixture.candidateEvidence,
    "scope, delivery, budget, or safety evidence differs",
    "a non-English production storefront",
    languageDriftFixture.candidateTasks,
    languageDriftReader,
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
      document.details.rolloutPolicySha256 = digest(
        "fixture:different-rollout-policy",
      );
    }
    return document;
  };
  expectRejected(
    approvedScopeFixture.candidateEvidence,
    "approved storefront rolloutPolicySha256 differs",
    "a canary journal for a different approved rollout policy",
    approvedScopeFixture.candidateTasks,
    approvedScopeReader,
  );

  const approvedBudgetFixture = buildCompleteFixture();
  const approvedBudgetReader = (relativePath, expectedDigest, artifactId) => {
    const document = approvedBudgetFixture.artifactReader(
      relativePath,
      expectedDigest,
      artifactId,
    );
    if (artifactId === "canary_journal") {
      document.details.snapshotByteLimit = 16_384;
    }
    return document;
  };
  expectRejected(
    approvedBudgetFixture.candidateEvidence,
    "approved storefront snapshotByteLimit differs",
    "a canary journal with a different numeric snapshot budget",
    approvedBudgetFixture.candidateTasks,
    approvedBudgetReader,
  );

  const releasedPluginFixture = buildCompleteFixture();
  const releasedPluginReader = (relativePath, expectedDigest, artifactId) => {
    const document = releasedPluginFixture.artifactReader(
      relativePath,
      expectedDigest,
      artifactId,
    );
    if (artifactId === "canary_journal") {
      document.details.wordpressPluginSha256 = digest(
        "fixture:different-wordpress-plugin",
      );
    }
    return document;
  };
  expectRejected(
    releasedPluginFixture.candidateEvidence,
    "released storefront wordpressPluginSha256 differs",
    "a canary using a different WooCommerce plugin package",
    releasedPluginFixture.candidateTasks,
    releasedPluginReader,
  );

  const snapshotMismatchFixture = buildCompleteFixture();
  const snapshotMismatchReader = (relativePath, expectedDigest, artifactId) => {
    const document = snapshotMismatchFixture.artifactReader(
      relativePath,
      expectedDigest,
      artifactId,
    );
    if (artifactId === "reconciliation_report") {
      document.details.woocommerceSnapshotRevisionSha256 = digest(
        "fixture:different-woocommerce-snapshot-revision",
      );
    }
    return document;
  };
  expectRejected(
    snapshotMismatchFixture.candidateEvidence,
    "canary and reconciliation woocommerceSnapshotRevisionSha256 differ",
    "a reconciliation report for a different local snapshot",
    snapshotMismatchFixture.candidateTasks,
    snapshotMismatchReader,
  );

  const hostedSnapshotMismatchFixture = buildCompleteFixture();
  const hostedSnapshotMismatchReader = (
    relativePath,
    expectedDigest,
    artifactId,
  ) => {
    const document = hostedSnapshotMismatchFixture.artifactReader(
      relativePath,
      expectedDigest,
      artifactId,
    );
    if (artifactId === "reconciliation_report") {
      document.details.hostedMemberSnapshotSha256 = digest(
        "fixture:different-hosted-member-snapshot",
      );
    }
    return document;
  };
  expectRejected(
    hostedSnapshotMismatchFixture.candidateEvidence,
    "canary and reconciliation hostedMemberSnapshotSha256 differ",
    "a reconciliation report for a different hosted member snapshot",
    hostedSnapshotMismatchFixture.candidateTasks,
    hostedSnapshotMismatchReader,
  );

  const countMismatchFixture = buildCompleteFixture();
  const countMismatchReader = (relativePath, expectedDigest, artifactId) => {
    const document = countMismatchFixture.artifactReader(
      relativePath,
      expectedDigest,
      artifactId,
    );
    if (artifactId === "reconciliation_report") {
      document.details.classicPlacementRenderCount = 6;
    }
    return document;
  };
  expectRejected(
    countMismatchFixture.candidateEvidence,
    "storefront artifact classicPlacementRenderCount differs",
    "a reconciliation report for a different classic placement set",
    countMismatchFixture.candidateTasks,
    countMismatchReader,
  );

  const observationPolicyFixture = buildCompleteFixture();
  const observationPolicyReader = (
    relativePath,
    expectedDigest,
    artifactId,
  ) => {
    const document = observationPolicyFixture.artifactReader(
      relativePath,
      expectedDigest,
      artifactId,
    );
    if (artifactId === "observation_report") {
      document.details.observationPolicySha256 = digest(
        "fixture:different-observation-policy",
      );
    }
    return document;
  };
  expectRejected(
    observationPolicyFixture.candidateEvidence,
    "storefront observation or coupon scope differs",
    "an observation measured against a different approved policy",
    observationPolicyFixture.candidateTasks,
    observationPolicyReader,
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

  const lateOperatorBaselineFixture = buildCompleteFixture();
  const lateOperatorBaselineReader = (
    relativePath,
    expectedDigest,
    artifactId,
  ) => {
    const document = lateOperatorBaselineFixture.artifactReader(
      relativePath,
      expectedDigest,
      artifactId,
    );
    if (artifactId === "read_only_baseline") {
      document.observedAt = "2026-02-01T00:01:00Z";
    }
    return document;
  };
  expectRejected(
    lateOperatorBaselineFixture.candidateEvidence,
    "production artifact chronology differs",
    "operator access established only after canary start",
    lateOperatorBaselineFixture.candidateTasks,
    lateOperatorBaselineReader,
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
      document.details.couponDifference = 1;
    }
    return document;
  };
  expectRejected(
    observationDriftFixture.candidateEvidence,
    "observation_report failure evidence differs",
    "an observation window with native coupon drift",
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
    .find((task) => task.id === "M09-STOREFRONT-EXPERIENCE")
    .slices.find(
      (slice) =>
        slice.id === "M09-S03-LOCAL-WOOCOMMERCE-SNAPSHOT-AND-PLACEMENTS",
    ).status = "in_progress";
  expectRejected(
    evidence,
    "must be completed before canary",
    "an incomplete prerequisite slice",
    incompleteSliceTasks,
  );

  const taskScoreDrift = structuredClone(tasks);
  taskScoreDrift.tasks.find(
    (task) => task.id === "M09-STOREFRONT-EXPERIENCE",
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
    (task) => task.id === "M09-STOREFRONT-EXPERIENCE",
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
  `Validated ${evidence.checks.length} M09 storefront canary checks and ${evidence.score.categories.length} score categories; score ${result.calculatedScore}/100 with ${evidence.checks.filter((check) => check.status === "passed").length} passed, ${evidence.checks.filter((check) => check.status === "pending").length} pending, and ${evidence.checks.filter((check) => check.status === "failed").length} failed.`,
);
