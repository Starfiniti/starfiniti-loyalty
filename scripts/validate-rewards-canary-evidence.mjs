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
const evidencePath = join(root, "docs/plan/evidence/M04/canary.yaml");
const tasksPath = join(root, "docs/plan/TASKS.yaml");

const evidence = YAML.parse(readFileSync(evidencePath, "utf8"));
const tasks = YAML.parse(readFileSync(tasksPath, "utf8"));

const requiredChecks = new Set([
  "exact_head_ci",
  "migration_replay",
  "contract_reward_matrix",
  "database_authority_matrix",
  "concurrency_matrix",
  "woocommerce_runtime_matrix",
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
  "native_capability_preflight",
  "merchant_workflow_canary",
  "customer_reward_canary",
  "historical_version_canary",
  "fixed_discount_canary",
  "percentage_discount_canary",
  "free_shipping_canary",
  "free_product_canary",
  "restriction_matrix_canary",
  "availability_capacity_canary",
  "per_customer_limit_canary",
  "native_cancellation_expiry",
  "manual_claim_canary",
  "manual_fulfilment_canary",
  "manual_rejection_compensation",
  "ambiguous_native_recovery",
  "connector_outage_checkout",
  "worker_outage_checkout",
  "cross_tenant_denial",
  "ledger_reconciliation",
  "coupon_reconciliation",
  "capacity_reconciliation",
  "queue_reconciliation",
  "disable_accepted_work_continuity",
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
    "unsupported_reward",
    "an authorable reward has no executable native or audited manual fulfilment state machine",
  ],
  [
    "unsupported_stored_value",
    "store credit gift card cash redemption cash-like value or maximum-capped percentage reward becomes publishable",
  ],
  [
    "duplicate_business_effect",
    "duplicate replay delayed delivery or concurrent processing creates another native or manual business effect",
  ],
  [
    "capacity_oversubscription",
    "global quantity points budget wallet funds or per-member capacity oversubscribes or partially allocates",
  ],
  [
    "member_limit_bypass",
    "a per-customer limit can be bypassed by replay concurrency identity alias or connector ordering",
  ],
  [
    "ambiguous_native_outcome",
    "an ambiguous native outcome releases captures reissues or reuses points or capacity before reconciliation",
  ],
  [
    "duplicate_compensation",
    "definitive rejection cancellation or expiry loses original reservation attribution or compensates more than once",
  ],
  [
    "untrusted_authority",
    "browser input Auth claims email domain or connector metadata grants tenant customer wallet reward or value authority",
  ],
  [
    "cross_tenant_exposure",
    "unrelated tenant programme customer reward reservation case operation connector or evidence becomes visible or mutable",
  ],
  [
    "checkout_dependency",
    "WooCommerce checkout synchronously depends on the Hub worker entitlement provider or reward command outcome",
  ],
  [
    "accepted_work_stranded",
    "disabling expanded rewards hides or strands an accepted native reservation or manual fulfilment case",
  ],
  [
    "sensitive_evidence",
    "reusable signing material coupon plaintext raw payload personal data or private ledger metadata enters logs support output or evidence",
  ],
  [
    "unexplained_reconciliation",
    "any ledger balance lot reservation capacity command coupon case queue checkout tenancy or privacy reconciliation has an unexplained difference",
  ],
  [
    "canary_scope_breach",
    "production enables expanded rewards outside the exact approved pilot scope value ceiling or observation window",
  ],
  [
    "missing_production_evidence",
    "approved release pilot store recovery point canary rollback observation or final reconciliation evidence is absent",
  ],
  [
    "score_or_critical_finding",
    "module score or any category floor is missed or a critical security tenancy privacy ledger recovery accessibility data-loss or immutable-history finding remains",
  ],
]);
const checkArtifactBindings = new Map([
  ["public_production_baseline", ["read_only_baseline"]],
  ["operator_access", ["read_only_baseline"]],
  ["approved_release", ["approval_record", "release_inventory"]],
  ["approved_pilot_store", ["approval_record"]],
  ["canary_approval", ["approval_record"]],
  ["pre_change_recovery_point", ["recovery_point"]],
  ["production_value_baseline", ["production_baseline"]],
  ["disabled_deployment", ["release_inventory", "canary_journal"]],
  ["migration_registration", ["release_inventory", "canary_journal"]],
  ["non_canary_disabled", ["canary_journal"]],
  ["native_capability_preflight", ["canary_journal"]],
  ["merchant_workflow_canary", ["canary_journal"]],
  ["customer_reward_canary", ["canary_journal"]],
  ["historical_version_canary", ["canary_journal"]],
  ["fixed_discount_canary", ["canary_journal"]],
  ["percentage_discount_canary", ["canary_journal"]],
  ["free_shipping_canary", ["canary_journal"]],
  ["free_product_canary", ["canary_journal"]],
  ["restriction_matrix_canary", ["canary_journal"]],
  ["availability_capacity_canary", ["canary_journal"]],
  ["per_customer_limit_canary", ["canary_journal"]],
  ["native_cancellation_expiry", ["canary_journal"]],
  ["manual_claim_canary", ["canary_journal"]],
  ["manual_fulfilment_canary", ["canary_journal"]],
  ["manual_rejection_compensation", ["canary_journal"]],
  ["ambiguous_native_recovery", ["canary_journal"]],
  ["connector_outage_checkout", ["canary_journal"]],
  ["worker_outage_checkout", ["canary_journal"]],
  ["cross_tenant_denial", ["canary_journal"]],
  ["ledger_reconciliation", ["reconciliation_report"]],
  ["coupon_reconciliation", ["reconciliation_report"]],
  ["capacity_reconciliation", ["reconciliation_report"]],
  ["queue_reconciliation", ["reconciliation_report"]],
  ["disable_accepted_work_continuity", ["rollback_report"]],
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
  throw new Error(`Rewards canary evidence invalid: ${message}`);
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
    `^docs/plan/evidence/M04/production/rewards-${artifactStem}-[a-z0-9][a-z0-9-]{2,79}\\.json$`,
    "u",
  );
  if (typeof relativePath !== "string" || !pattern.test(relativePath)) {
    fail(`${artifactId} artifact path is unsafe`);
  }
  const absolute = resolve(root, relativePath);
  const allowed = `${resolve(root, "docs/plan/evidence/M04/production")}${sep}`;
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
  )
    fail(`${label} keys differ`);
};

const exactUtcTime = (value, label) => {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value) ||
    Number.isNaN(parsed) ||
    new Date(parsed).toISOString().replace(".000Z", "Z") !== value
  )
    fail(`${label} must be an exact UTC timestamp`);
  return parsed;
};

const exactNonzeroDigest = (value, label) => {
  if (!digestPattern.test(value) || /^0{64}$/u.test(value))
    fail(`${label} must be an exact nonzero SHA-256 digest`);
};

const exactDigestMap = (value, keys, label) => {
  exactKeys(value, keys, label);
  const seen = new Set();
  for (const key of keys) {
    exactNonzeroDigest(value[key], `${label} ${key}`);
    if (seen.has(value[key])) fail(`${label} reuses one digest`);
    seen.add(value[key]);
  }
};

const exactPositiveMap = (value, expected, label) => {
  exactKeys(value, Object.keys(expected), label);
  for (const [key, wanted] of Object.entries(expected)) {
    if (
      !Number.isSafeInteger(value[key]) ||
      value[key] < 1 ||
      value[key] !== wanted
    )
      fail(`${label} ${key} differs`);
  }
};

const exactZeroMap = (value, keys, label) => {
  exactKeys(value, keys, label);
  for (const key of keys)
    if (value[key] !== 0) fail(`${label} zero-difference evidence differs`);
};

const exactAssertions = (value, expectedIds, label) => {
  if (!Array.isArray(value) || value.length !== expectedIds.length)
    fail(`${label} assertions differ`);
  const ids = new Set();
  const digests = new Set();
  for (const assertion of value) {
    exactKeys(
      assertion,
      ["id", "status", "evidenceSha256", "differenceCount"],
      `${label} assertion`,
    );
    if (
      !expectedIds.includes(assertion.id) ||
      ids.has(assertion.id) ||
      assertion.status !== "passed" ||
      assertion.differenceCount !== 0
    )
      fail(`${label} assertion differs`);
    exactNonzeroDigest(
      assertion.evidenceSha256,
      `${label}.${assertion.id} evidence`,
    );
    if (digests.has(assertion.evidenceSha256))
      fail(`${label} assertions reuse one evidence digest`);
    ids.add(assertion.id);
    digests.add(assertion.evidenceSha256);
  }
};

const releaseComponentKeys = [
  "dashboardImage",
  "workerImage",
  "wordpressPlugin",
  "migrationInventory",
  "rewardDefinitionContract",
  "programmeContract",
  "redemptionContract",
  "woocommerceCommandContract",
  "manualFulfilmentContract",
];
const approvalPolicyKeys = [
  "pilotScope",
  "rollout",
  "rewardValueCeiling",
  "availability",
  "stacking",
  "nativeFulfilment",
  "manualFulfilment",
  "ambiguousOutcome",
  "observation",
];
const rewardEvidenceKeys = [
  "nativeCapability",
  "merchantWorkflow",
  "customerReward",
  "historicalVersion",
  "fixedDiscount",
  "percentageDiscount",
  "freeShipping",
  "freeProduct",
  "restrictionMatrix",
  "availabilityCapacity",
  "perCustomerLimit",
  "nativeCancellationExpiry",
  "manualClaim",
  "manualFulfilment",
  "manualRejectionCompensation",
  "ambiguousNativeRecovery",
  "connectorOutageCheckout",
  "workerOutageCheckout",
  "crossTenantDenial",
  "privacyScan",
  "deterministicFailure",
  "transientRetry",
];
const rewardCounts = {
  nativeCapabilityPreflight: 1,
  merchantWorkflow: 1,
  customerReward: 1,
  historicalVersion: 2,
  fixedDiscount: 1,
  percentageDiscount: 1,
  freeShipping: 1,
  freeProduct: 1,
  restrictionMatrix: 4,
  availabilityCapacity: 2,
  perCustomerLimit: 1,
  nativeCancellationExpiry: 2,
  manualClaim: 1,
  manualFulfilment: 1,
  manualRejectionCompensation: 1,
  ambiguousNativeRecovery: 1,
  connectorOutageCheckout: 1,
  workerOutageCheckout: 1,
  crossTenantDenial: 1,
  acceptedWork: 6,
};
const rewardDifferenceKeys = [
  "unsupportedReward",
  "unsupportedStoredValue",
  "duplicateBusinessEffect",
  "capacityOversubscription",
  "memberLimitBypass",
  "ambiguousPointsRelease",
  "duplicateCompensation",
  "browserAuthority",
  "crossTenantExposure",
  "checkoutBlocked",
  "acceptedWorkStranded",
  "ledger",
  "balance",
  "lot",
  "reservation",
  "capacity",
  "command",
  "coupon",
  "case",
  "queue",
  "privacy",
  "loyaltyValue",
  "unresolvedAmbiguousOutcome",
  "unresolvedCritical",
  "unresolvedHigh",
];
const canaryCeilingObservedKeys = {
  maxCustomers: "customers",
  maxRewardEffects: "rewardEffects",
  maxReservedPoints: "reservedPoints",
  maxQuantityUnits: "quantityUnits",
  maxLiabilityMinor: "liabilityMinor",
  maxManualCases: "manualCases",
  maxReservationHours: "reservationHours",
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
    ])
      if (details[key] !== candidateEvidence.publicBaseline[key])
        fail(`read_only_baseline ${key} differs from the manifest`);
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
    )
      fail("read_only_baseline runtime or mutation evidence differs");
    return;
  }
  if (artifactId === "release_inventory") {
    exactKeys(
      details,
      [
        "release",
        "pullRequest",
        "repositoryCommit",
        "components",
        "deploymentState",
        "expandedRewardsEnabled",
        "rewardWorkerEnabled",
        "manualFulfilmentEnabled",
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
      details.expandedRewardsEnabled !== false ||
      details.rewardWorkerEnabled !== false ||
      details.manualFulfilmentEnabled !== false ||
      details.registeredMigrationDifference !== 0
    )
      fail("release_inventory identity or disabled state differs");
    exactDigestMap(
      details.components,
      releaseComponentKeys,
      "release_inventory components",
    );
    exactAssertions(
      details.assertions,
      artifactCheckBindings.get(artifactId),
      artifactId,
    );
    return;
  }
  if (artifactId === "approval_record") {
    exactKeys(
      details,
      [
        "finalizedAt",
        "release",
        "policies",
        "ceilings",
        "approvals",
        "artifactSha256",
      ],
      "approval_record details",
    );
    const finalizedAt = exactUtcTime(
      details.finalizedAt,
      "approval_record finalizedAt",
    );
    if (finalizedAt > observedAt || !/^v\d+\.\d+\.\d+$/u.test(details.release))
      fail("approval_record time or release differs");
    exactDigestMap(
      details.policies,
      approvalPolicyKeys,
      "approval_record policies",
    );
    exactKeys(
      details.ceilings,
      [
        "maxCustomers",
        "maxRewardEffects",
        "maxReservedPoints",
        "maxQuantityUnits",
        "maxLiabilityMinor",
        "maxManualCases",
        "maxReservationHours",
      ],
      "approval_record ceilings",
    );
    for (const [key, maximum] of Object.entries({
      maxCustomers: 10000,
      maxRewardEffects: 100000,
      maxReservedPoints: 1000000000,
      maxQuantityUnits: 1000000,
      maxLiabilityMinor: 1000000000,
      maxManualCases: 10000,
      maxReservationHours: 720,
    }))
      if (
        !Number.isSafeInteger(details.ceilings[key]) ||
        details.ceilings[key] < 1 ||
        details.ceilings[key] > maximum
      )
        fail(`approval_record ${key} differs`);
    const expectedApprovals = artifactCheckBindings.get(artifactId);
    if (
      !Array.isArray(details.approvals) ||
      details.approvals.length !== expectedApprovals.length
    )
      fail("approval_record approvals differ");
    const ids = new Set();
    const approvalDigests = new Set();
    for (const approval of details.approvals) {
      exactKeys(
        approval,
        ["id", "approved", "approvedAt", "evidenceSha256"],
        "approval_record approval",
      );
      if (
        !expectedApprovals.includes(approval.id) ||
        ids.has(approval.id) ||
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
      ids.add(approval.id);
      approvalDigests.add(approval.evidenceSha256);
    }
    exactKeys(
      details.artifactSha256,
      [...requiredArtifacts].filter((id) => id !== artifactId),
      "approval_record artifact bindings",
    );
    for (const [id, sha256] of Object.entries(details.artifactSha256))
      exactNonzeroDigest(sha256, `approval_record ${id} binding`);
    return;
  }
  if (artifactId === "recovery_point") {
    const keys = [
      "baseBackup",
      "walArchive",
      "applicationConfiguration",
      "connectorSigningReferenceInventory",
      "pluginRollbackPackage",
      "restoreEvidence",
    ];
    exactKeys(
      details,
      [
        "createdAt",
        "verifiedAt",
        "components",
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
    )
      fail("recovery_point timing, RPO, restore, or mutation evidence differs");
    exactDigestMap(details.components, keys, "recovery_point components");
    exactAssertions(
      details.assertions,
      artifactCheckBindings.get(artifactId),
      artifactId,
    );
    return;
  }
  if (artifactId === "production_baseline") {
    const sourceKeys = [
      "programme",
      "rewardDefinition",
      "wallet",
      "ledger",
      "lot",
      "reservation",
      "capacity",
      "nativeCommand",
      "coupon",
      "manualCase",
      "queue",
      "connector",
      "checkoutAvailability",
    ];
    exactKeys(
      details,
      [
        "capturedAt",
        "sourceCoverageRatio",
        "sources",
        "expandedRewardsActive",
        "rewardWorkerActive",
        "manualFulfilmentActive",
        "pendingAcceptedWork",
        "differences",
        "mutationCount",
        "assertions",
      ],
      "production_baseline details",
    );
    if (
      exactUtcTime(details.capturedAt, "production_baseline capturedAt") >
        observedAt ||
      details.sourceCoverageRatio !== 1 ||
      details.expandedRewardsActive !== false ||
      details.rewardWorkerActive !== false ||
      details.manualFulfilmentActive !== false ||
      details.pendingAcceptedWork !== 0 ||
      details.mutationCount !== 0
    )
      fail("production_baseline authority or coverage evidence differs");
    exactDigestMap(details.sources, sourceKeys, "production_baseline sources");
    exactZeroMap(
      details.differences,
      [
        "ledger",
        "balance",
        "reservation",
        "capacity",
        "coupon",
        "manualCase",
        "queue",
        "privacy",
        "loyaltyValue",
      ],
      "production_baseline differences",
    );
    exactAssertions(
      details.assertions,
      artifactCheckBindings.get(artifactId),
      artifactId,
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
        "nonCanaryEnabledCount",
        "policies",
        "components",
        "evidence",
        "ceilings",
        "observed",
        "counts",
        "differences",
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
    if (
      startedAt >= endedAt ||
      endedAt > observedAt ||
      !Number.isSafeInteger(details.intervalCount) ||
      details.intervalCount < Math.ceil((endedAt - startedAt) / 3600000) ||
      details.pilotOrganizationCount !== 1 ||
      details.nonCanaryEnabledCount !== 0 ||
      details.sourceCoverageRatio !== 1
    )
      fail("canary_journal timing, scope, or coverage differs");
    exactDigestMap(
      details.policies,
      approvalPolicyKeys,
      "canary_journal policies",
    );
    exactDigestMap(
      details.components,
      releaseComponentKeys,
      "canary_journal components",
    );
    exactDigestMap(
      details.evidence,
      rewardEvidenceKeys,
      "canary_journal evidence",
    );
    exactPositiveMap(details.counts, rewardCounts, "canary_journal counts");
    exactKeys(
      details.ceilings,
      [
        "maxCustomers",
        "maxRewardEffects",
        "maxReservedPoints",
        "maxQuantityUnits",
        "maxLiabilityMinor",
        "maxManualCases",
        "maxReservationHours",
      ],
      "canary_journal ceilings",
    );
    exactKeys(
      details.observed,
      [
        "customers",
        "rewardEffects",
        "reservedPoints",
        "quantityUnits",
        "liabilityMinor",
        "manualCases",
        "reservationHours",
      ],
      "canary_journal observed",
    );
    for (const [ceilingKey, observedKey] of Object.entries(
      canaryCeilingObservedKeys,
    ))
      if (
        !Number.isSafeInteger(details.ceilings[ceilingKey]) ||
        details.ceilings[ceilingKey] < 1 ||
        !Number.isSafeInteger(details.observed[observedKey]) ||
        details.observed[observedKey] < 1 ||
        details.observed[observedKey] > details.ceilings[ceilingKey]
      )
        fail(`canary_journal ${ceilingKey} ceiling differs`);
    exactZeroMap(
      details.differences,
      rewardDifferenceKeys,
      "canary_journal differences",
    );
    exactAssertions(
      details.assertions,
      artifactCheckBindings.get(artifactId),
      artifactId,
    );
    return;
  }
  if (artifactId === "reconciliation_report") {
    const sourceKeys = [
      "rewardDefinition",
      "wallet",
      "ledger",
      "lot",
      "reservation",
      "capacity",
      "nativeCommand",
      "coupon",
      "manualCase",
      "queue",
      "checkout",
    ];
    exactKeys(
      details,
      [
        "sourceCoverageRatio",
        "boundedConvergenceComplete",
        "evidence",
        "counts",
        "sources",
        "differences",
        "assertions",
      ],
      "reconciliation_report details",
    );
    if (
      details.sourceCoverageRatio !== 1 ||
      details.boundedConvergenceComplete !== true
    )
      fail("reconciliation_report coverage or convergence differs");
    exactDigestMap(
      details.evidence,
      rewardEvidenceKeys,
      "reconciliation_report evidence",
    );
    exactPositiveMap(
      details.counts,
      rewardCounts,
      "reconciliation_report counts",
    );
    exactDigestMap(
      details.sources,
      sourceKeys,
      "reconciliation_report sources",
    );
    exactZeroMap(
      details.differences,
      rewardDifferenceKeys,
      "reconciliation_report differences",
    );
    exactAssertions(
      details.assertions,
      artifactCheckBindings.get(artifactId),
      artifactId,
    );
    return;
  }
  if (artifactId === "rollback_report") {
    const stateKeys = [
      "expandedRewardsDisabled",
      "rewardWorkerStopped",
      "manualFulfilmentDisabled",
      "acceptedWorkDrainedOrHeld",
      "priorImagesRestored",
      "priorPluginRestored",
      "rewardDefinitionsPreserved",
      "reservationsPreserved",
      "capacityPreserved",
      "nativeStatesPreserved",
      "manualCasesPreserved",
      "ledgerPreserved",
      "customerAccessAvailable",
      "checkoutAvailable",
    ];
    exactKeys(
      details,
      [
        "startedAt",
        "endedAt",
        "durationSeconds",
        "states",
        "differences",
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
      details.durationSeconds !== (endedAt - startedAt) / 1000
    )
      fail("rollback_report timing differs");
    exactKeys(details.states, stateKeys, "rollback_report states");
    if (stateKeys.some((key) => details.states[key] !== true))
      fail("rollback_report continuity differs");
    exactZeroMap(
      details.differences,
      rewardDifferenceKeys,
      "rollback_report differences",
    );
    exactNonzeroDigest(details.evidenceSha256, "rollback_report evidence");
    exactAssertions(
      details.assertions,
      artifactCheckBindings.get(artifactId),
      artifactId,
    );
    return;
  }
  if (artifactId === "observation_report") {
    const latencyKeys = [
      "reservationP95Ms",
      "nativeCommandP95Ms",
      "manualCaseP95Ms",
      "reconciliationP95Ms",
      "customerRewardP95Ms",
      "checkoutP95Ms",
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
        "latencies",
        "maxQueueDepth",
        "counts",
        "differences",
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
      details.durationSeconds < 86400 ||
      !Number.isSafeInteger(details.sampleIntervalCount) ||
      details.sampleIntervalCount <
        Math.ceil((endedAt - startedAt) / 3600000) ||
      details.sourceCoverageRatio !== 1 ||
      details.latencyWithinApprovedBounds !== true ||
      details.loadWithinApprovedBounds !== true ||
      !Number.isSafeInteger(details.maxQueueDepth) ||
      details.maxQueueDepth < 0 ||
      details.maxQueueDepth > 100000
    )
      fail("observation_report duration, coverage, or load evidence differs");
    exactNonzeroDigest(
      details.observationPolicySha256,
      "observation_report policy",
    );
    exactKeys(details.latencies, latencyKeys, "observation_report latencies");
    for (const key of latencyKeys)
      if (
        !Number.isSafeInteger(details.latencies[key]) ||
        details.latencies[key] < 1 ||
        details.latencies[key] > 60000
      )
        fail(`observation_report ${key} differs`);
    exactPositiveMap(details.counts, rewardCounts, "observation_report counts");
    exactZeroMap(
      details.differences,
      rewardDifferenceKeys,
      "observation_report differences",
    );
    exactNonzeroDigest(details.evidenceSha256, "observation_report evidence");
    exactAssertions(
      details.assertions,
      artifactCheckBindings.get(artifactId),
      artifactId,
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
  if (candidateEvidence.schema !== "starfiniti.rewards-canary.v1") {
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
      document?.schema !== "starfiniti.rewards-canary-artifact.v1" ||
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

  const m04 = candidateTasks.tasks.find(
    (task) => task.id === "M04-REWARDS-AND-FULFILMENT",
  );
  const requiredCompletedSlices = new Set([
    "M04-S01-NATIVE-REWARDS",
    "M04-S02-MANUAL-FULFILMENT",
    "M04-S03-MERCHANT-WORKFLOWS",
  ]);
  const s04 = m04?.slices?.find(
    (slice) => slice.id === "M04-S04-CANARY-AND-CLOSE",
  );
  if (!m04 || !s04) fail("M04 or M04-S04 task is missing");
  for (const id of requiredCompletedSlices) {
    const slice = m04.slices.find((candidate) => candidate.id === id);
    if (slice?.status !== "completed") {
      fail(`${id} must be completed before canary`);
    }
  }
  if (m04.module_score !== calculatedScore) {
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
    for (const key of approvalPolicyKeys) {
      if (
        approvalRecord.details.policies[key] !== journal.details.policies[key]
      ) {
        fail(`approved reward ${key} differs from the canary journal`);
      }
    }
    for (const key of Object.keys(canaryCeilingObservedKeys)) {
      if (
        approvalRecord.details.ceilings[key] !== journal.details.ceilings[key]
      ) {
        fail(`approved reward ${key} differs from the canary journal`);
      }
    }
    for (const key of releaseComponentKeys) {
      if (
        releaseInventory.details.components[key] !==
        journal.details.components[key]
      ) {
        fail(`released reward ${key} differs from the canary journal`);
      }
    }
    for (const key of rewardEvidenceKeys) {
      if (
        reconciliation.details.evidence[key] !== journal.details.evidence[key]
      ) {
        fail(`canary and reconciliation ${key} evidence differ`);
      }
    }
    for (const key of Object.keys(rewardCounts)) {
      if (
        reconciliation.details.counts[key] !== journal.details.counts[key] ||
        observation.details.counts[key] !== journal.details.counts[key]
      ) {
        fail(`reward artifact ${key} count differs`);
      }
    }
    if (
      observation.details.observationPolicySha256 !==
      journal.details.policies.observation
    ) {
      fail("reward observation policy differs from the journal");
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
    if (m04.status !== "complete" || s04.status !== "completed") {
      fail("complete evidence requires completed M04 and S04 task state");
    }
  } else if (m04.status !== "in_progress" || s04.status !== "in_progress") {
    fail("in-progress evidence must match in-progress M04 and S04 task state");
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
    const m04 = candidateTasks.tasks.find(
      (task) => task.id === "M04-REWARDS-AND-FULFILMENT",
    );
    m04.status = "complete";
    m04.module_score = candidateEvidence.score.total;
    m04.slices.find((slice) => slice.id === "M04-S04-CANARY-AND-CLOSE").status =
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
    const fixtureZeroes = (keys) =>
      Object.fromEntries(keys.map((key) => [key, 0]));
    const releaseComponents = fixtureDigests(
      releaseComponentKeys,
      "release-components",
    );
    const policyDigests = fixtureDigests(approvalPolicyKeys, "reward-policy");
    const rewardEvidence = fixtureDigests(
      rewardEvidenceKeys,
      "reward-evidence",
    );
    const ceilings = {
      maxCustomers: 100,
      maxRewardEffects: 100,
      maxReservedPoints: 10_000,
      maxQuantityUnits: 100,
      maxLiabilityMinor: 100_000,
      maxManualCases: 10,
      maxReservationHours: 72,
    };
    const observed = {
      customers: 3,
      rewardEffects: 8,
      reservedPoints: 600,
      quantityUnits: 5,
      liabilityMinor: 5_000,
      manualCases: 2,
      reservationHours: 24,
    };
    const currentVersion = candidateEvidence.currentProduction.release
      .slice(1)
      .split(".")
      .map(Number);
    const fixtureRelease = `v${currentVersion[0]}.${currentVersion[1]}.${currentVersion[2] + 1}`;
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
          release: fixtureRelease,
          pullRequest: candidateEvidence.candidate.pullRequest,
          repositoryCommit: candidateEvidence.candidate.commit,
          components: releaseComponents,
          deploymentState: "disabled",
          expandedRewardsEnabled: false,
          rewardWorkerEnabled: false,
          manualFulfilmentEnabled: false,
          registeredMigrationDifference: 0,
          assertions: fixtureAssertions(artifactId),
        };
      }
      if (artifactId === "recovery_point") {
        return {
          createdAt: "2026-01-31T20:30:00Z",
          verifiedAt: "2026-01-31T20:59:00Z",
          components: fixtureDigests(
            [
              "baseBackup",
              "walArchive",
              "applicationConfiguration",
              "connectorSigningReferenceInventory",
              "pluginRollbackPackage",
              "restoreEvidence",
            ],
            "recovery",
          ),
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
          sources: fixtureDigests(
            [
              "programme",
              "rewardDefinition",
              "wallet",
              "ledger",
              "lot",
              "reservation",
              "capacity",
              "nativeCommand",
              "coupon",
              "manualCase",
              "queue",
              "connector",
              "checkoutAvailability",
            ],
            "baseline",
          ),
          expandedRewardsActive: false,
          rewardWorkerActive: false,
          manualFulfilmentActive: false,
          pendingAcceptedWork: 0,
          differences: fixtureZeroes([
            "ledger",
            "balance",
            "reservation",
            "capacity",
            "coupon",
            "manualCase",
            "queue",
            "privacy",
            "loyaltyValue",
          ]),
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
          nonCanaryEnabledCount: 0,
          policies: policyDigests,
          components: releaseComponents,
          evidence: rewardEvidence,
          ceilings,
          observed,
          counts: rewardCounts,
          differences: fixtureZeroes(rewardDifferenceKeys),
          sourceCoverageRatio: 1,
          assertions: fixtureAssertions(artifactId),
        };
      }
      if (artifactId === "reconciliation_report") {
        return {
          sourceCoverageRatio: 1,
          boundedConvergenceComplete: true,
          evidence: rewardEvidence,
          counts: rewardCounts,
          sources: fixtureDigests(
            [
              "rewardDefinition",
              "wallet",
              "ledger",
              "lot",
              "reservation",
              "capacity",
              "nativeCommand",
              "coupon",
              "manualCase",
              "queue",
              "checkout",
            ],
            "reconciliation",
          ),
          differences: fixtureZeroes(rewardDifferenceKeys),
          assertions: fixtureAssertions(artifactId),
        };
      }
      if (artifactId === "rollback_report") {
        return {
          startedAt: "2026-02-02T00:01:00Z",
          endedAt: "2026-02-02T00:02:00Z",
          durationSeconds: 60,
          states: Object.fromEntries(
            [
              "expandedRewardsDisabled",
              "rewardWorkerStopped",
              "manualFulfilmentDisabled",
              "acceptedWorkDrainedOrHeld",
              "priorImagesRestored",
              "priorPluginRestored",
              "rewardDefinitionsPreserved",
              "reservationsPreserved",
              "capacityPreserved",
              "nativeStatesPreserved",
              "manualCasesPreserved",
              "ledgerPreserved",
              "customerAccessAvailable",
              "checkoutAvailable",
            ].map((key) => [key, true]),
          ),
          differences: fixtureZeroes(rewardDifferenceKeys),
          evidenceSha256: digest("fixture:rollback:evidence"),
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
          observationPolicySha256: policyDigests.observation,
          latencyWithinApprovedBounds: true,
          loadWithinApprovedBounds: true,
          latencies: {
            reservationP95Ms: 250,
            nativeCommandP95Ms: 300,
            manualCaseP95Ms: 350,
            reconciliationP95Ms: 400,
            customerRewardP95Ms: 200,
            checkoutP95Ms: 500,
          },
          maxQueueDepth: 5,
          counts: rewardCounts,
          differences: fixtureZeroes(rewardDifferenceKeys),
          evidenceSha256: digest("fixture:observation:evidence"),
          assertions: fixtureAssertions(artifactId),
        };
      }
      if (artifactId === "approval_record") {
        return {
          finalizedAt: fixtureTimes.approval_record,
          release: fixtureRelease,
          policies: policyDigests,
          ceilings,
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
      fail(`missing fixture details for ${artifactId}`);
    };
    const bindings = new Map();
    for (const artifact of candidateEvidence.artifacts.filter(
      (candidate) => candidate.id !== "approval_record",
    )) {
      const document = {
        schema: "starfiniti.rewards-canary-artifact.v1",
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
      artifact.path = `docs/plan/evidence/M04/production/rewards-${artifact.id.replaceAll("_", "-")}-self-test.json`;
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
      schema: "starfiniti.rewards-canary-artifact.v1",
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
      "docs/plan/evidence/M04/production/rewards-approval-record-self-test.json";
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
    (check) => check.id === "fixed_discount_canary",
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
  ).path = "docs/plan/evidence/M04/canary.yaml";
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
    "zero-difference evidence differs",
    "a reconciliation report with ledger drift",
    nonzeroReconciliationFixture.candidateTasks,
    artifactMutationReader(
      nonzeroReconciliationFixture,
      "reconciliation_report",
      (document) => {
        document.details.differences.ledger = 1;
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
    "approved reward pilotScope differs",
    "a canary journal for a different pilot-scope policy",
    approvedPolicyFixture.candidateTasks,
    artifactMutationReader(
      approvedPolicyFixture,
      "canary_journal",
      (document) => {
        document.details.policies.pilotScope = digest(
          "fixture:different-pilot-scope-policy",
        );
      },
    ),
  );

  const approvedCeilingFixture = buildCompleteFixture();
  expectRejected(
    approvedCeilingFixture.candidateEvidence,
    "approved reward maxReservedPoints differs",
    "a canary journal with a different reserved-points ceiling",
    approvedCeilingFixture.candidateTasks,
    artifactMutationReader(
      approvedCeilingFixture,
      "canary_journal",
      (document) => {
        document.details.ceilings.maxReservedPoints = 9_999;
      },
    ),
  );

  const releasedPluginFixture = buildCompleteFixture();
  expectRejected(
    releasedPluginFixture.candidateEvidence,
    "released reward wordpressPlugin differs",
    "a canary using a different WooCommerce plugin package",
    releasedPluginFixture.candidateTasks,
    artifactMutationReader(
      releasedPluginFixture,
      "canary_journal",
      (document) => {
        document.details.components.wordpressPlugin = digest(
          "fixture:different-wordpress-plugin",
        );
      },
    ),
  );

  const nativeEvidenceFixture = buildCompleteFixture();
  expectRejected(
    nativeEvidenceFixture.candidateEvidence,
    "canary and reconciliation nativeCapability evidence differ",
    "a reconciliation report for different native-capability evidence",
    nativeEvidenceFixture.candidateTasks,
    artifactMutationReader(
      nativeEvidenceFixture,
      "reconciliation_report",
      (document) => {
        document.details.evidence.nativeCapability = digest(
          "fixture:different-native-capability",
        );
      },
    ),
  );

  const ambiguousRecoveryEvidenceFixture = buildCompleteFixture();
  expectRejected(
    ambiguousRecoveryEvidenceFixture.candidateEvidence,
    "canary and reconciliation ambiguousNativeRecovery evidence differ",
    "a reconciliation report for different ambiguous recovery evidence",
    ambiguousRecoveryEvidenceFixture.candidateTasks,
    artifactMutationReader(
      ambiguousRecoveryEvidenceFixture,
      "reconciliation_report",
      (document) => {
        document.details.evidence.ambiguousNativeRecovery = digest(
          "fixture:different-ambiguous-recovery",
        );
      },
    ),
  );

  const countMismatchFixture = buildCompleteFixture();
  expectRejected(
    countMismatchFixture.candidateEvidence,
    "reconciliation_report counts historicalVersion differs",
    "a reconciliation report with fewer historical-version cases",
    countMismatchFixture.candidateTasks,
    artifactMutationReader(
      countMismatchFixture,
      "reconciliation_report",
      (document) => {
        document.details.counts.historicalVersion = 1;
      },
    ),
  );

  const observationPolicyFixture = buildCompleteFixture();
  expectRejected(
    observationPolicyFixture.candidateEvidence,
    "reward observation policy differs from the journal",
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

  const ambiguousReleaseFixture = buildCompleteFixture();
  expectRejected(
    ambiguousReleaseFixture.candidateEvidence,
    "zero-difference evidence differs",
    "a canary that released points while native outcome was ambiguous",
    ambiguousReleaseFixture.candidateTasks,
    artifactMutationReader(
      ambiguousReleaseFixture,
      "canary_journal",
      (document) => {
        document.details.differences.ambiguousPointsRelease = 1;
      },
    ),
  );

  const capacityOversubscriptionFixture = buildCompleteFixture();
  expectRejected(
    capacityOversubscriptionFixture.candidateEvidence,
    "zero-difference evidence differs",
    "an observation with limited-reward capacity oversubscription",
    capacityOversubscriptionFixture.candidateTasks,
    artifactMutationReader(
      capacityOversubscriptionFixture,
      "observation_report",
      (document) => {
        document.details.differences.capacityOversubscription = 1;
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
    "zero-difference evidence differs",
    "an observation window with loyalty-value drift",
    observationDriftFixture.candidateTasks,
    artifactMutationReader(
      observationDriftFixture,
      "observation_report",
      (document) => {
        document.details.differences.loyaltyValue = 1;
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
    .find((task) => task.id === "M04-REWARDS-AND-FULFILMENT")
    .slices.find((slice) => slice.id === "M04-S02-MANUAL-FULFILMENT").status =
    "in_progress";
  expectRejected(
    evidence,
    "must be completed before canary",
    "an incomplete prerequisite slice",
    incompleteSliceTasks,
  );

  const taskScoreDrift = structuredClone(tasks);
  taskScoreDrift.tasks.find(
    (task) => task.id === "M04-REWARDS-AND-FULFILMENT",
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
    (task) => task.id === "M04-REWARDS-AND-FULFILMENT",
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
  `Validated ${evidence.checks.length} M04 canary checks and ${evidence.score.categories.length} score categories; score ${result.calculatedScore}/100 with ${evidence.checks.filter((check) => check.status === "passed").length} passed, ${evidence.checks.filter((check) => check.status === "pending").length} pending, and ${evidence.checks.filter((check) => check.status === "failed").length} failed.`,
);
