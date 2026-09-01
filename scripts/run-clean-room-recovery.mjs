import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import YAML from "yaml";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sha256Pattern = /^[0-9a-f]{64}$/u;
const commitPattern = /^[0-9a-f]{40}$/u;
const safeTokenPattern = /^[a-z][a-z0-9-]{2,79}$/u;
const exactStageAdapters = new Map([
  ["provision_clean_room", "provision_isolated_target_v1"],
  ["inspect_isolation", "inspect_isolated_target_v1"],
  ["verify_inputs", "verify_recovery_inputs_v1"],
  ["restore_postgres", "restore_physical_base_v1"],
  ["replay_wal", "replay_wal_to_target_v1"],
  ["verify_database", "verify_database_integrity_v1"],
  ["restore_authentik", "restore_authentik_v1"],
  ["restore_configuration", "restore_versioned_configuration_v1"],
  ["restore_signing_material", "restore_signing_references_v1"],
  ["replay_privacy", "replay_privacy_journal_v1"],
  ["start_services", "start_exact_services_v1"],
  ["verify_identity_application", "verify_identity_application_v1"],
  ["reconcile", "reconcile_recovered_state_v1"],
  ["destroy_clean_room", "destroy_isolated_target_v1"],
]);
const requiredImageIds = [
  "authentik",
  "dashboard",
  "postgres",
  "supabase-auth",
  "worker",
];
const requiredInputIds = [
  "application_configuration",
  "authentik_data",
  "authentik_database",
  "base_backup",
  "privacy_journal",
  "secret_escrow_manifest",
  "supabase_configuration",
  "wal_archive",
];
const credentialPattern =
  /\b(?:sflt_v1_[0-9a-f]{32}_[A-Za-z0-9_-]{43}|sk_(?:live|test)_[A-Za-z0-9]{16,}|whsec_[A-Za-z0-9]{16,}|eyJ[A-Za-z0-9_-]{20,})\b/u;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu;
const forbiddenKeyPattern =
  /(?:password|token|cookie|authorization|privatekey|rawbody|requestbody|responsebody|customerid|connectionid|orderid)$/iu;

function fail(message) {
  throw new Error(`Recovery runner failed: ${message}`);
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(`${label} has an unexpected shape`);
  }
}

function boundedInteger(value, label, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(`${label} is outside its safety bound`);
  }
  return value;
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

function scanSensitive(value, path = "document") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanSensitive(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenKeyPattern.test(key)) {
        fail(`forbidden sensitive key ${path}.${key}`);
      }
      scanSensitive(child, `${path}.${key}`);
    }
    return;
  }
  if (typeof value === "string") {
    if (credentialPattern.test(value)) fail(`credential material at ${path}`);
    if (emailPattern.test(value)) fail(`email identity at ${path}`);
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalJson(value[key])]),
    );
  }
  return value;
}

export function documentDigest(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalJson(value)))
    .digest("hex");
}

function rawDigest(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function validateRecoveryPlan(plan) {
  exactKeys(
    plan,
    ["schema", "status", "profile", "objectives", "safety", "stages"],
    "recovery plan",
  );
  if (
    plan.schema !== "starfiniti.recovery-plan.v1" ||
    plan.status !== "candidate" ||
    !safeTokenPattern.test(plan.profile)
  ) {
    fail("recovery plan identity is invalid");
  }
  exactKeys(
    plan.objectives,
    [
      "maximumRpoSeconds",
      "maximumFullServiceRtoSeconds",
      "maximumSourceMarkerAgeSeconds",
      "maximumStageSeconds",
      "maximumDriverOutputBytes",
      "maximumExactImages",
    ],
    "recovery objectives",
  );
  boundedInteger(plan.objectives.maximumRpoSeconds, "maximum RPO", 1, 900);
  boundedInteger(
    plan.objectives.maximumFullServiceRtoSeconds,
    "maximum full-service RTO",
    60,
    7_200,
  );
  boundedInteger(
    plan.objectives.maximumSourceMarkerAgeSeconds,
    "maximum source marker age",
    1,
    300,
  );
  boundedInteger(
    plan.objectives.maximumStageSeconds,
    "maximum stage duration",
    60,
    3_600,
  );
  boundedInteger(
    plan.objectives.maximumDriverOutputBytes,
    "maximum driver output",
    1_024,
    65_536,
  );
  boundedInteger(
    plan.objectives.maximumExactImages,
    "maximum exact image count",
    requiredImageIds.length,
    64,
  );
  exactKeys(
    plan.safety,
    [
      "targetClass",
      "environmentMarker",
      "composeProjectPrefix",
      "internalNetworkRequired",
      "publicIngressAllowed",
      "externalEgressAllowed",
      "productionRoutesAllowed",
      "destroyAfterRun",
    ],
    "recovery safety",
  );
  if (
    plan.safety.targetClass !== "clean_room_disposable" ||
    plan.safety.environmentMarker !== "starfiniti-clean-room-v1" ||
    plan.safety.composeProjectPrefix !== "starfiniti-recovery-" ||
    plan.safety.internalNetworkRequired !== true ||
    plan.safety.publicIngressAllowed !== false ||
    plan.safety.externalEgressAllowed !== false ||
    plan.safety.productionRoutesAllowed !== false ||
    plan.safety.destroyAfterRun !== true
  ) {
    fail("recovery safety boundary is invalid");
  }
  if (
    !Array.isArray(plan.stages) ||
    plan.stages.length !== exactStageAdapters.size ||
    plan.stages.map((stage) => stage.id).join(",") !==
      [...exactStageAdapters.keys()].join(",")
  ) {
    fail("recovery stages are missing or reordered");
  }
  plan.stages.forEach((stage, index) => {
    const cleanup = index === plan.stages.length - 1;
    exactKeys(
      stage,
      cleanup
        ? ["id", "adapter", "timeoutSeconds", "alwaysRun"]
        : ["id", "adapter", "timeoutSeconds"],
      `recovery stage ${index}`,
    );
    if (
      exactStageAdapters.get(stage.id) !== stage.adapter ||
      (cleanup ? stage.alwaysRun !== true : "alwaysRun" in stage)
    ) {
      fail(`recovery stage ${stage.id} adapter or cleanup policy is invalid`);
    }
    boundedInteger(
      stage.timeoutSeconds,
      `${stage.id} timeout`,
      1,
      plan.objectives.maximumStageSeconds,
    );
  });
  return plan;
}

export function validateRecoveryInventory(inventory, plan) {
  exactKeys(
    inventory,
    [
      "schema",
      "observedAt",
      "target",
      "recoveryPoint",
      "expectations",
      "images",
      "inputs",
    ],
    "recovery inventory",
  );
  if (inventory.schema !== "starfiniti.recovery-inventory.v1") {
    fail("recovery inventory schema is invalid");
  }
  const observedAt = exactUtc(inventory.observedAt, "inventory observation");
  exactKeys(
    inventory.target,
    [
      "class",
      "environmentId",
      "marker",
      "markerSha256",
      "composeProject",
      "internalNetwork",
      "publicIngress",
      "externalEgress",
      "productionRouteCount",
    ],
    "recovery target",
  );
  if (
    inventory.target.class !== plan.safety.targetClass ||
    !safeTokenPattern.test(inventory.target.environmentId) ||
    inventory.target.marker !== plan.safety.environmentMarker ||
    !sha256Pattern.test(inventory.target.markerSha256) ||
    !inventory.target.composeProject.startsWith(
      plan.safety.composeProjectPrefix,
    ) ||
    !safeTokenPattern.test(inventory.target.composeProject) ||
    inventory.target.internalNetwork !== true ||
    inventory.target.publicIngress !== false ||
    inventory.target.externalEgress !== false ||
    inventory.target.productionRouteCount !== 0
  ) {
    fail("recovery target is not an isolated disposable clean room");
  }
  exactKeys(
    inventory.recoveryPoint,
    ["simulatedFailureAt", "lastCommittedFactAt", "latestRecoverableAt"],
    "recovery point",
  );
  const simulatedFailureAt = exactUtc(
    inventory.recoveryPoint.simulatedFailureAt,
    "simulated failure",
  );
  const lastCommittedFactAt = exactUtc(
    inventory.recoveryPoint.lastCommittedFactAt,
    "last committed fact",
  );
  const latestRecoverableAt = exactUtc(
    inventory.recoveryPoint.latestRecoverableAt,
    "latest recoverable point",
  );
  if (
    simulatedFailureAt > observedAt ||
    lastCommittedFactAt > simulatedFailureAt ||
    latestRecoverableAt > simulatedFailureAt ||
    (simulatedFailureAt - lastCommittedFactAt) / 1_000 >
      plan.objectives.maximumSourceMarkerAgeSeconds
  ) {
    fail("recovery point does not contain a fresh pre-failure source marker");
  }
  const rpoSeconds = Math.max(
    0,
    Math.ceil((lastCommittedFactAt - latestRecoverableAt) / 1_000),
  );
  if (rpoSeconds > plan.objectives.maximumRpoSeconds) {
    fail("recovery point exceeds the declared RPO");
  }
  const expectationKeys = [
    "authoritativeCommittedFacts",
    "ledgerTransactions",
    "queueFacts",
    "supabaseAuthIdentities",
    "authentikObjects",
    "activeProviderConfigurations",
    "activeSigningReferences",
    "privacyActionsAfterRecoveryPoint",
  ];
  exactKeys(inventory.expectations, expectationKeys, "recovery expectations");
  for (const key of expectationKeys) {
    boundedInteger(
      inventory.expectations[key],
      `recovery expectation ${key}`,
      0,
      1_000_000_000_000,
    );
  }
  if (
    !Array.isArray(inventory.images) ||
    inventory.images.length < requiredImageIds.length ||
    inventory.images.length > plan.objectives.maximumExactImages
  ) {
    fail("recovery image inventory is incomplete or oversized");
  }
  const imageIds = new Set();
  for (const image of inventory.images) {
    exactKeys(image, ["id", "digest"], "recovery image");
    if (
      !safeTokenPattern.test(image.id) ||
      imageIds.has(image.id) ||
      !/^sha256:[0-9a-f]{64}$/u.test(image.digest)
    ) {
      fail("recovery image identity or digest is invalid");
    }
    imageIds.add(image.id);
  }
  if (requiredImageIds.some((id) => !imageIds.has(id))) {
    fail("recovery image inventory lacks a required service");
  }
  if (
    !Array.isArray(inventory.inputs) ||
    inventory.inputs.length !== requiredInputIds.length
  ) {
    fail("recovery input inventory is incomplete");
  }
  const inputIds = new Set();
  for (const input of inventory.inputs) {
    exactKeys(input, ["id", "sha256", "capturedAt", "verified"], "input");
    const capturedAt = exactUtc(input.capturedAt, `${input.id} capture`);
    if (
      !requiredInputIds.includes(input.id) ||
      inputIds.has(input.id) ||
      !sha256Pattern.test(input.sha256) ||
      capturedAt > observedAt ||
      input.verified !== true
    ) {
      fail("recovery input identity verification or digest is invalid");
    }
    inputIds.add(input.id);
  }
  scanSensitive(inventory, "inventory");
  return { rpoSeconds };
}

export function validateRecoveryControl(control, plan, inventory, now) {
  exactKeys(
    control,
    [
      "schema",
      "candidateCommit",
      "planSha256",
      "inventorySha256",
      "driverSha256",
      "approval",
      "target",
    ],
    "recovery control",
  );
  if (
    control.schema !== "starfiniti.recovery-control.v1" ||
    !commitPattern.test(control.candidateCommit) ||
    !sha256Pattern.test(control.planSha256) ||
    !sha256Pattern.test(control.inventorySha256) ||
    !sha256Pattern.test(control.driverSha256)
  ) {
    fail("recovery control identity or digest is invalid");
  }
  exactKeys(
    control.approval,
    ["reference", "approvedAt", "expiresAt", "maximumRunSeconds"],
    "recovery approval",
  );
  const approvedAt = exactUtc(control.approval.approvedAt, "approval start");
  const expiresAt = exactUtc(control.approval.expiresAt, "approval expiry");
  if (
    !/^[A-Z0-9][A-Z0-9-]{7,79}$/u.test(control.approval.reference) ||
    expiresAt <= approvedAt ||
    expiresAt - approvedAt > 4 * 60 * 60 * 1_000 ||
    now < approvedAt ||
    now >= expiresAt
  ) {
    fail("recovery approval is absent expired or too broad");
  }
  boundedInteger(
    control.approval.maximumRunSeconds,
    "approved maximum run",
    plan.objectives.maximumFullServiceRtoSeconds,
    7_200,
  );
  if (now + control.approval.maximumRunSeconds * 1_000 > expiresAt) {
    fail("recovery approval lacks a complete approved run window");
  }
  exactKeys(
    control.target,
    ["environmentId", "markerSha256", "composeProject"],
    "approved target",
  );
  if (
    control.target.environmentId !== inventory.target.environmentId ||
    control.target.markerSha256 !== inventory.target.markerSha256 ||
    control.target.composeProject !== inventory.target.composeProject
  ) {
    fail("recovery approval target differs from inventory");
  }
  scanSensitive(control, "control");
  return control;
}

function zeroCounts(observations, keys, label) {
  for (const key of keys) {
    if (observations[key] !== 0) fail(`${label} ${key} is not zero`);
  }
}

function trueValues(observations, keys, label) {
  for (const key of keys) {
    if (observations[key] !== true) fail(`${label} ${key} is not true`);
  }
}

function validateObservations(stageId, observations, inventory) {
  const imageCount = inventory.images.length;
  switch (stageId) {
    case "provision_clean_room":
      exactKeys(
        observations,
        ["created", "disposableLabelCount", "publicPorts", "externalRoutes"],
        stageId,
      );
      trueValues(observations, ["created"], stageId);
      boundedInteger(
        observations.disposableLabelCount,
        "disposable label count",
        2,
        20,
      );
      zeroCounts(observations, ["publicPorts", "externalRoutes"], stageId);
      break;
    case "inspect_isolation":
      exactKeys(
        observations,
        [
          "markerVerified",
          "internalNetwork",
          "publicIngress",
          "externalEgress",
          "productionRouteCount",
        ],
        stageId,
      );
      trueValues(observations, ["markerVerified", "internalNetwork"], stageId);
      if (
        observations.publicIngress !== false ||
        observations.externalEgress !== false
      ) {
        fail("clean room has ingress or egress");
      }
      zeroCounts(observations, ["productionRouteCount"], stageId);
      break;
    case "verify_inputs":
      exactKeys(
        observations,
        [
          "baseBackupVerified",
          "walContinuityVerified",
          "configurationVerified",
          "secretEscrowManifestVerified",
          "privacyJournalVerified",
          "exactImageCount",
        ],
        stageId,
      );
      trueValues(
        observations,
        [
          "baseBackupVerified",
          "walContinuityVerified",
          "configurationVerified",
          "secretEscrowManifestVerified",
          "privacyJournalVerified",
        ],
        stageId,
      );
      if (observations.exactImageCount !== imageCount) {
        fail("verified image count differs from inventory");
      }
      break;
    case "restore_postgres":
      exactKeys(
        observations,
        ["baseRestoreCompleted", "backupVerificationErrors"],
        stageId,
      );
      trueValues(observations, ["baseRestoreCompleted"], stageId);
      zeroCounts(observations, ["backupVerificationErrors"], stageId);
      break;
    case "replay_wal":
      exactKeys(
        observations,
        [
          "recoveryTargetAt",
          "missingWalSegments",
          "walReplayErrors",
          "databaseReady",
        ],
        stageId,
      );
      exactUtc(observations.recoveryTargetAt, "driver recovery target");
      if (
        observations.recoveryTargetAt !==
        inventory.recoveryPoint.latestRecoverableAt
      ) {
        fail("driver recovery target differs from inventory");
      }
      trueValues(observations, ["databaseReady"], stageId);
      zeroCounts(
        observations,
        ["missingWalSegments", "walReplayErrors"],
        stageId,
      );
      break;
    case "verify_database":
      exactKeys(
        observations,
        [
          "migrationDifferences",
          "rlsFailures",
          "grantFailures",
          "unbalancedTransactions",
          "projectionDifferences",
          "queueDifferences",
          "lostCommittedFacts",
          "committedFactsObserved",
          "ledgerTransactionsObserved",
          "queueFactsObserved",
        ],
        stageId,
      );
      zeroCounts(
        observations,
        [
          "migrationDifferences",
          "rlsFailures",
          "grantFailures",
          "unbalancedTransactions",
          "projectionDifferences",
          "queueDifferences",
          "lostCommittedFacts",
        ],
        stageId,
      );
      if (
        observations.committedFactsObserved !==
          inventory.expectations.authoritativeCommittedFacts ||
        observations.ledgerTransactionsObserved !==
          inventory.expectations.ledgerTransactions ||
        observations.queueFactsObserved !== inventory.expectations.queueFacts
      ) {
        fail("database source aggregate expectations differ");
      }
      break;
    case "restore_authentik":
      exactKeys(
        observations,
        [
          "databaseRestored",
          "dataRestored",
          "migrationErrors",
          "objectsRestored",
        ],
        stageId,
      );
      trueValues(observations, ["databaseRestored", "dataRestored"], stageId);
      zeroCounts(observations, ["migrationErrors"], stageId);
      if (
        observations.objectsRestored !== inventory.expectations.authentikObjects
      ) {
        fail("Authentik source aggregate expectation differs");
      }
      break;
    case "restore_configuration":
      exactKeys(
        observations,
        [
          "supabaseAuthRowsMatch",
          "configurationDifferences",
          "exactImageCount",
          "supabaseAuthIdentitiesObserved",
          "providerConfigurationsObserved",
        ],
        stageId,
      );
      trueValues(observations, ["supabaseAuthRowsMatch"], stageId);
      zeroCounts(observations, ["configurationDifferences"], stageId);
      if (observations.exactImageCount !== imageCount) {
        fail("restored image count differs from inventory");
      }
      if (
        observations.supabaseAuthIdentitiesObserved !==
          inventory.expectations.supabaseAuthIdentities ||
        observations.providerConfigurationsObserved !==
          inventory.expectations.activeProviderConfigurations
      ) {
        fail("identity or provider source aggregate expectation differs");
      }
      break;
    case "restore_signing_material":
      exactKeys(
        observations,
        [
          "activeReferences",
          "resolvedReferences",
          "duplicateReferences",
          "unresolvedReferences",
        ],
        stageId,
      );
      boundedInteger(
        observations.activeReferences,
        "active signing references",
        0,
        1_000_000,
      );
      boundedInteger(
        observations.resolvedReferences,
        "resolved signing references",
        0,
        1_000_000,
      );
      if (observations.activeReferences !== observations.resolvedReferences) {
        fail("active signing references do not resolve exactly");
      }
      if (
        observations.activeReferences !==
        inventory.expectations.activeSigningReferences
      ) {
        fail("signing source aggregate expectation differs");
      }
      zeroCounts(
        observations,
        ["duplicateReferences", "unresolvedReferences"],
        stageId,
      );
      break;
    case "replay_privacy":
      exactKeys(
        observations,
        ["expectedActions", "appliedActions", "differences"],
        stageId,
      );
      boundedInteger(
        observations.expectedActions,
        "expected privacy actions",
        0,
        10_000_000,
      );
      boundedInteger(
        observations.appliedActions,
        "applied privacy actions",
        0,
        10_000_000,
      );
      if (observations.expectedActions !== observations.appliedActions) {
        fail("privacy replay count differs");
      }
      if (
        observations.expectedActions !==
        inventory.expectations.privacyActionsAfterRecoveryPoint
      ) {
        fail("privacy source aggregate expectation differs");
      }
      zeroCounts(observations, ["differences"], stageId);
      break;
    case "start_services":
      exactKeys(
        observations,
        ["exactImagesStarted", "unhealthyServices"],
        stageId,
      );
      if (observations.exactImagesStarted !== imageCount) {
        fail("started image count differs from inventory");
      }
      zeroCounts(observations, ["unhealthyServices"], stageId);
      break;
    case "verify_identity_application":
      exactKeys(
        observations,
        [
          "supabaseAuthSessionIssued",
          "authentikLoginCompleted",
          "authorizedTenantRead",
          "crossTenantDenied",
          "signedWebhookAccepted",
          "valueEffectsExpected",
          "valueEffectsObserved",
        ],
        stageId,
      );
      trueValues(
        observations,
        [
          "supabaseAuthSessionIssued",
          "authentikLoginCompleted",
          "authorizedTenantRead",
          "crossTenantDenied",
          "signedWebhookAccepted",
        ],
        stageId,
      );
      if (
        observations.valueEffectsExpected !== 1 ||
        observations.valueEffectsObserved !== 1
      ) {
        fail("recovered value command is not exactly once");
      }
      break;
    case "reconcile":
      exactKeys(
        observations,
        [
          "ledgerDifferences",
          "connectorDifferences",
          "authDifferences",
          "configurationDifferences",
          "privacyDifferences",
          "unexplainedDataLoss",
        ],
        stageId,
      );
      zeroCounts(observations, Object.keys(observations), stageId);
      break;
    case "destroy_clean_room":
      exactKeys(
        observations,
        ["destroyed", "retainedVolumes", "retainedNetworks", "exposedRoutes"],
        stageId,
      );
      trueValues(observations, ["destroyed"], stageId);
      zeroCounts(
        observations,
        ["retainedVolumes", "retainedNetworks", "exposedRoutes"],
        stageId,
      );
      break;
    default:
      fail(`unknown recovery stage ${stageId}`);
  }
}

export function validateStageResult(result, stage, inventory) {
  exactKeys(
    result,
    ["schema", "stage", "status", "startedAt", "finishedAt", "observations"],
    `${stage.id} result`,
  );
  if (
    result.schema !== "starfiniti.recovery-stage-result.v1" ||
    result.stage !== stage.id ||
    result.status !== "passed"
  ) {
    fail(`${stage.id} result identity or status is invalid`);
  }
  const startedAt = exactUtc(result.startedAt, `${stage.id} start`);
  const finishedAt = exactUtc(result.finishedAt, `${stage.id} finish`);
  if (
    finishedAt < startedAt ||
    finishedAt - startedAt > stage.timeoutSeconds * 1_000
  ) {
    fail(`${stage.id} result duration is invalid`);
  }
  scanSensitive(result, `${stage.id} result`);
  validateObservations(stage.id, result.observations, inventory);
  return {
    id: stage.id,
    status: "passed",
    durationMs: finishedAt - startedAt,
    evidenceSha256: documentDigest(result),
  };
}

function failedReportBase(context, startedAt, rpoSeconds) {
  return {
    schema: "starfiniti.recovery-run.v1",
    status: "failed",
    candidateCommit: context.control.candidateCommit,
    planProfile: context.plan.profile,
    planSha256: context.control.planSha256,
    inventorySha256: context.control.inventorySha256,
    driverSha256: context.control.driverSha256,
    controlSha256: documentDigest(context.control),
    targetClass: context.plan.safety.targetClass,
    startedAt,
    serviceReadyAt: null,
    finishedAt: null,
    rpoSeconds,
    rtoSeconds: null,
    stages: [],
    cleanup: {
      attempted: false,
      passed: false,
      durationMs: null,
      evidenceSha256: null,
    },
    failureStage: null,
    failureCode: null,
  };
}

export function runRecoveryWithAdapter(context, invokeStage) {
  validateRecoveryPlan(context.plan);
  const { rpoSeconds } = validateRecoveryInventory(
    context.inventory,
    context.plan,
  );
  validateRecoveryControl(
    context.control,
    context.plan,
    context.inventory,
    Date.now(),
  );
  if (
    context.control.planSha256 !== documentDigest(context.plan) ||
    context.control.inventorySha256 !== documentDigest(context.inventory)
  ) {
    fail("recovery context differs from its approved plan or inventory");
  }
  const startedAt = new Date().toISOString();
  const startedPerformance = performance.now();
  const report = failedReportBase(context, startedAt, rpoSeconds);
  const cleanupStage = context.plan.stages.at(-1);
  const maximumRunMs = context.control.approval.maximumRunSeconds * 1_000;
  const approvalExpiresAt = Date.parse(context.control.approval.expiresAt);
  let failure = null;
  try {
    for (const stage of context.plan.stages.slice(0, -1)) {
      report.failureStage = stage.id;
      if (
        performance.now() - startedPerformance > maximumRunMs ||
        Date.now() >= approvalExpiresAt
      ) {
        fail("recovery exceeded its approved execution window");
      }
      const stageStarted = performance.now();
      const rawResult = invokeStage(stage);
      const summary = validateStageResult(rawResult, stage, context.inventory);
      summary.durationMs = Number(
        (performance.now() - stageStarted).toFixed(3),
      );
      if (summary.durationMs > stage.timeoutSeconds * 1_000) {
        fail(`${stage.id} exceeds the controller-measured timeout`);
      }
      report.stages.push(summary);
      if (
        performance.now() - startedPerformance > maximumRunMs ||
        Date.now() >= approvalExpiresAt
      ) {
        fail("recovery exceeded its approved execution window");
      }
      if (stage.id === "reconcile") {
        report.serviceReadyAt = new Date().toISOString();
        report.rtoSeconds = Number(
          ((performance.now() - startedPerformance) / 1_000).toFixed(3),
        );
        if (
          report.rtoSeconds >
          context.plan.objectives.maximumFullServiceRtoSeconds
        ) {
          fail("full-service recovery exceeds the declared RTO");
        }
      }
    }
  } catch (error) {
    failure = error;
    report.failureCode = "stage_failed";
  } finally {
    report.cleanup.attempted = true;
    try {
      const cleanupStarted = performance.now();
      const cleanupResult = invokeStage(cleanupStage);
      const summary = validateStageResult(
        cleanupResult,
        cleanupStage,
        context.inventory,
      );
      summary.durationMs = Number(
        (performance.now() - cleanupStarted).toFixed(3),
      );
      if (summary.durationMs > cleanupStage.timeoutSeconds * 1_000) {
        fail("clean-room teardown exceeds the controller-measured timeout");
      }
      report.cleanup = {
        attempted: true,
        passed: true,
        durationMs: summary.durationMs,
        evidenceSha256: summary.evidenceSha256,
      };
    } catch (error) {
      if (!failure) {
        failure = error;
        report.failureStage = cleanupStage.id;
        report.failureCode = "cleanup_failed";
      } else {
        report.failureCode = "stage_and_cleanup_failed";
      }
    }
  }
  report.finishedAt = new Date().toISOString();
  if (!failure) {
    report.status = "passed";
    report.failureStage = null;
    report.failureCode = null;
  }
  scanSensitive(report, "recovery report");
  return { report, error: failure };
}

function parseArguments(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--self-test") {
      parsed.selfTest = true;
      continue;
    }
    if (!argument?.startsWith("--")) fail("unexpected command argument");
    const key = argument.slice(2);
    if (
      !["config", "control-file", "inventory-file", "driver", "out"].includes(
        key,
      )
    ) {
      fail(`unknown option --${key}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) fail(`--${key} requires a value`);
    if (Object.hasOwn(parsed, key)) fail(`--${key} was provided twice`);
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}

function readRegularFile(path, label, maximumBytes, ownerOnly = false) {
  if (!isAbsolute(path)) fail(`${label} path must be absolute`);
  let linkStatus;
  let status;
  let raw;
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    status = fstatSync(descriptor);
    linkStatus = lstatSync(path);
    if (
      !linkStatus.isFile() ||
      status.dev !== linkStatus.dev ||
      status.ino !== linkStatus.ino ||
      !status.isFile()
    ) {
      fail(`${label} changed during validation`);
    }
    if (status.size < 1 || status.size > maximumBytes) {
      fail(`${label} must be a bounded regular file`);
    }
    const buffer = Buffer.alloc(status.size);
    let offset = 0;
    while (offset < buffer.length) {
      const read = readSync(
        descriptor,
        buffer,
        offset,
        buffer.length - offset,
        offset,
      );
      if (read === 0) fail(`${label} changed during validation`);
      offset += read;
    }
    raw = buffer.toString("utf8");
  } catch {
    fail(`${label} is unreadable`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  if (Buffer.byteLength(raw, "utf8") !== status.size) {
    fail(`${label} must be a bounded regular file`);
  }
  if (
    ownerOnly &&
    process.platform !== "win32" &&
    (status.mode & 0o077) !== 0
  ) {
    fail(`${label} must not grant group or other access`);
  }
  return raw;
}

function repositoryState() {
  let commit;
  let dirty;
  try {
    commit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    dirty =
      execFileSync(
        "git",
        ["status", "--porcelain", "--untracked-files=normal"],
        {
          cwd: root,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        },
      ).trim().length > 0;
  } catch {
    fail("repository state is unavailable");
  }
  if (!commitPattern.test(commit) || dirty) {
    fail("recovery runs require an exact clean repository commit");
  }
  return commit;
}

function makeDriverInvoker({ driverRaw, controlRaw, inventoryRaw, context }) {
  const requestDirectory = mkdtempSync(
    join(tmpdir(), "starfiniti-recovery-requests-"),
  );
  const driverPath = join(requestDirectory, "approved-driver.mjs");
  const controlPath = join(requestDirectory, "approved-control.yaml");
  const inventoryPath = join(requestDirectory, "approved-inventory.yaml");
  try {
    for (const [path, raw] of [
      [driverPath, driverRaw],
      [controlPath, controlRaw],
      [inventoryPath, inventoryRaw],
    ]) {
      writeFileSync(path, raw, {
        encoding: "utf8",
        mode: 0o400,
        flag: "wx",
      });
    }
  } catch {
    rmSync(requestDirectory, { recursive: true, force: true });
    fail("approved recovery inputs could not be materialized privately");
  }
  let counter = 0;
  const invoke = (stage) => {
    counter += 1;
    const request = {
      schema: "starfiniti.recovery-stage-request.v1",
      sequence: counter,
      stage: stage.id,
      adapter: stage.adapter,
      planSha256: context.control.planSha256,
      inventorySha256: context.control.inventorySha256,
      targetEnvironment: context.inventory.target.environmentId,
    };
    const requestPath = join(
      requestDirectory,
      `${String(counter).padStart(2, "0")}-${stage.id}.json`,
    );
    writeFileSync(requestPath, `${JSON.stringify(request)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    let output;
    try {
      output = execFileSync(
        process.execPath,
        [
          driverPath,
          "--stage",
          stage.id,
          "--request",
          requestPath,
          "--control",
          controlPath,
          "--inventory",
          inventoryPath,
        ],
        {
          encoding: "utf8",
          timeout: stage.timeoutSeconds * 1_000,
          maxBuffer: context.plan.objectives.maximumDriverOutputBytes,
          stdio: ["ignore", "pipe", "ignore"],
          windowsHide: true,
        },
      );
    } catch {
      fail(`${stage.id} driver invocation failed`);
    }
    try {
      return JSON.parse(output);
    } catch {
      fail(`${stage.id} driver output is not bounded JSON`);
    }
  };
  invoke.dispose = () =>
    rmSync(requestDirectory, { recursive: true, force: true });
  return invoke;
}

function sampleInventory(now = Date.now()) {
  const failure = new Date(now - 1_000).toISOString();
  const fact = new Date(now - 10_000).toISOString();
  const recoverable = new Date(now - 5_000).toISOString();
  const zeroDigest = "1".repeat(64);
  return {
    schema: "starfiniti.recovery-inventory.v1",
    observedAt: new Date(now).toISOString(),
    target: {
      class: "clean_room_disposable",
      environmentId: "clean-room-selftest",
      marker: "starfiniti-clean-room-v1",
      markerSha256: "2".repeat(64),
      composeProject: "starfiniti-recovery-selftest",
      internalNetwork: true,
      publicIngress: false,
      externalEgress: false,
      productionRouteCount: 0,
    },
    recoveryPoint: {
      simulatedFailureAt: failure,
      lastCommittedFactAt: fact,
      latestRecoverableAt: recoverable,
    },
    expectations: {
      authoritativeCommittedFacts: 4,
      ledgerTransactions: 2,
      queueFacts: 3,
      supabaseAuthIdentities: 1,
      authentikObjects: 12,
      activeProviderConfigurations: 2,
      activeSigningReferences: 3,
      privacyActionsAfterRecoveryPoint: 2,
    },
    images: requiredImageIds.map((id, index) => ({
      id,
      digest: `sha256:${String(index + 3).repeat(64)}`,
    })),
    inputs: requiredInputIds.map((id) => ({
      id,
      sha256: zeroDigest,
      capturedAt: fact,
      verified: true,
    })),
  };
}

function sampleObservations(stageId, inventory) {
  const values = {
    provision_clean_room: {
      created: true,
      disposableLabelCount: 2,
      publicPorts: 0,
      externalRoutes: 0,
    },
    inspect_isolation: {
      markerVerified: true,
      internalNetwork: true,
      publicIngress: false,
      externalEgress: false,
      productionRouteCount: 0,
    },
    verify_inputs: {
      baseBackupVerified: true,
      walContinuityVerified: true,
      configurationVerified: true,
      secretEscrowManifestVerified: true,
      privacyJournalVerified: true,
      exactImageCount: inventory.images.length,
    },
    restore_postgres: {
      baseRestoreCompleted: true,
      backupVerificationErrors: 0,
    },
    replay_wal: {
      recoveryTargetAt: inventory.recoveryPoint.latestRecoverableAt,
      missingWalSegments: 0,
      walReplayErrors: 0,
      databaseReady: true,
    },
    verify_database: {
      migrationDifferences: 0,
      rlsFailures: 0,
      grantFailures: 0,
      unbalancedTransactions: 0,
      projectionDifferences: 0,
      queueDifferences: 0,
      lostCommittedFacts: 0,
      committedFactsObserved:
        inventory.expectations.authoritativeCommittedFacts,
      ledgerTransactionsObserved: inventory.expectations.ledgerTransactions,
      queueFactsObserved: inventory.expectations.queueFacts,
    },
    restore_authentik: {
      databaseRestored: true,
      dataRestored: true,
      migrationErrors: 0,
      objectsRestored: inventory.expectations.authentikObjects,
    },
    restore_configuration: {
      supabaseAuthRowsMatch: true,
      configurationDifferences: 0,
      exactImageCount: inventory.images.length,
      supabaseAuthIdentitiesObserved:
        inventory.expectations.supabaseAuthIdentities,
      providerConfigurationsObserved:
        inventory.expectations.activeProviderConfigurations,
    },
    restore_signing_material: {
      activeReferences: inventory.expectations.activeSigningReferences,
      resolvedReferences: inventory.expectations.activeSigningReferences,
      duplicateReferences: 0,
      unresolvedReferences: 0,
    },
    replay_privacy: {
      expectedActions: inventory.expectations.privacyActionsAfterRecoveryPoint,
      appliedActions: inventory.expectations.privacyActionsAfterRecoveryPoint,
      differences: 0,
    },
    start_services: {
      exactImagesStarted: inventory.images.length,
      unhealthyServices: 0,
    },
    verify_identity_application: {
      supabaseAuthSessionIssued: true,
      authentikLoginCompleted: true,
      authorizedTenantRead: true,
      crossTenantDenied: true,
      signedWebhookAccepted: true,
      valueEffectsExpected: 1,
      valueEffectsObserved: 1,
    },
    reconcile: {
      ledgerDifferences: 0,
      connectorDifferences: 0,
      authDifferences: 0,
      configurationDifferences: 0,
      privacyDifferences: 0,
      unexplainedDataLoss: 0,
    },
    destroy_clean_room: {
      destroyed: true,
      retainedVolumes: 0,
      retainedNetworks: 0,
      exposedRoutes: 0,
    },
  };
  return values[stageId];
}

function selfTest() {
  const plan = validateRecoveryPlan(
    YAML.parse(
      readFileSync(
        join(root, "infrastructure/testing/recovery/plan.yaml"),
        "utf8",
      ),
    ),
  );
  const inventory = sampleInventory();
  const control = {
    schema: "starfiniti.recovery-control.v1",
    candidateCommit: "a".repeat(40),
    planSha256: documentDigest(plan),
    inventorySha256: documentDigest(inventory),
    driverSha256: "b".repeat(64),
    approval: {
      reference: "RECOVERY-SELFTEST",
      approvedAt: new Date(Date.now() - 1_000).toISOString(),
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1_000).toISOString(),
      maximumRunSeconds: 3_600,
    },
    target: {
      environmentId: inventory.target.environmentId,
      markerSha256: inventory.target.markerSha256,
      composeProject: inventory.target.composeProject,
    },
  };
  validateRecoveryInventory(inventory, plan);
  validateRecoveryControl(control, plan, inventory, Date.now());
  const invoke = (stage) => {
    const now = Date.now();
    return {
      schema: "starfiniti.recovery-stage-result.v1",
      stage: stage.id,
      status: "passed",
      startedAt: new Date(now).toISOString(),
      finishedAt: new Date(now + 1).toISOString(),
      observations: sampleObservations(stage.id, inventory),
    };
  };
  const passed = runRecoveryWithAdapter({ plan, inventory, control }, invoke);
  assert.equal(passed.error, null);
  assert.equal(passed.report.status, "passed");
  assert.equal(passed.report.stages.length, plan.stages.length - 1);
  assert.equal(passed.report.cleanup.passed, true);
  assert.equal(passed.report.rpoSeconds, 0);
  assert.equal(passed.report.controlSha256, documentDigest(control));

  const measured = runRecoveryWithAdapter(
    { plan, inventory, control },
    (stage) => {
      if (stage.id === "provision_clean_room") {
        const waitUntil = performance.now() + 8;
        while (performance.now() < waitUntil) {
          // The controller must measure elapsed wall time independently.
        }
      }
      return invoke(stage);
    },
  );
  assert.equal(measured.error, null);
  assert.ok(measured.report.stages[0].durationMs >= 5);

  const driverObservations = Object.fromEntries(
    plan.stages.map((stage) => [
      stage.id,
      sampleObservations(stage.id, inventory),
    ]),
  );
  const driverRaw = `import { readFileSync } from "node:fs";
const argumentsList = process.argv.slice(2);
const option = (name) => argumentsList[argumentsList.indexOf(name) + 1];
const stage = option("--stage");
for (const name of ["--request", "--control", "--inventory"]) {
  const content = readFileSync(option(name), "utf8");
  if (!content.length) throw new Error("approved driver input is empty");
}
const observations = ${JSON.stringify(driverObservations)};
const now = Date.now();
process.stdout.write(JSON.stringify({
  schema: "starfiniti.recovery-stage-result.v1",
  stage,
  status: "passed",
  startedAt: new Date(now).toISOString(),
  finishedAt: new Date(now + 1).toISOString(),
  observations: observations[stage],
}));
`;
  const executedControl = {
    ...control,
    driverSha256: rawDigest(driverRaw),
  };
  validateRecoveryControl(executedControl, plan, inventory, Date.now());
  const childProcessInvoke = makeDriverInvoker({
    driverRaw,
    controlRaw: YAML.stringify(executedControl),
    inventoryRaw: YAML.stringify(inventory),
    context: { plan, inventory, control: executedControl },
  });
  try {
    const executed = runRecoveryWithAdapter(
      { plan, inventory, control: executedControl },
      childProcessInvoke,
    );
    assert.equal(executed.error, null);
    assert.equal(executed.report.status, "passed");
    assert.equal(
      executed.report.controlSha256,
      documentDigest(executedControl),
    );
  } finally {
    childProcessInvoke.dispose();
  }

  const failed = runRecoveryWithAdapter(
    { plan, inventory, control },
    (stage) => {
      const result = invoke(stage);
      if (stage.id === "verify_database") {
        result.observations.unbalancedTransactions = 1;
      }
      return result;
    },
  );
  assert.ok(failed.error instanceof Error);
  assert.equal(failed.report.status, "failed");
  assert.equal(failed.report.failureStage, "verify_database");
  assert.equal(failed.report.cleanup.passed, true);

  const sourceAggregateFailed = runRecoveryWithAdapter(
    { plan, inventory, control },
    (stage) => {
      const result = invoke(stage);
      if (stage.id === "verify_database") {
        result.observations.committedFactsObserved = 0;
      }
      return result;
    },
  );
  assert.ok(sourceAggregateFailed.error instanceof Error);
  assert.equal(sourceAggregateFailed.report.failureStage, "verify_database");
  assert.equal(sourceAggregateFailed.report.cleanup.passed, true);

  const cleanupFailed = runRecoveryWithAdapter(
    { plan, inventory, control },
    (stage) => {
      const result = invoke(stage);
      if (stage.id === "destroy_clean_room") {
        result.observations.retainedVolumes = 1;
      }
      return result;
    },
  );
  assert.ok(cleanupFailed.error instanceof Error);
  assert.equal(cleanupFailed.report.failureCode, "cleanup_failed");

  const publicInventory = structuredClone(inventory);
  publicInventory.target.publicIngress = true;
  assert.throws(
    () => validateRecoveryInventory(publicInventory, plan),
    /isolated disposable clean room/u,
  );
  const staleMarker = structuredClone(inventory);
  staleMarker.recoveryPoint.lastCommittedFactAt = new Date(
    Date.parse(staleMarker.recoveryPoint.simulatedFailureAt) - 61_000,
  ).toISOString();
  assert.throws(
    () => validateRecoveryInventory(staleMarker, plan),
    /fresh pre-failure source marker/u,
  );
  const leaked = structuredClone(inventory);
  leaked.inputs[0].password = "not-allowed";
  assert.throws(
    () => validateRecoveryInventory(leaked, plan),
    /unexpected shape/u,
  );
  const shortApproval = structuredClone(control);
  shortApproval.approval.expiresAt = new Date(
    Date.now() + 60_000,
  ).toISOString();
  assert.throws(
    () => validateRecoveryControl(shortApproval, plan, inventory, Date.now()),
    /complete approved run window/u,
  );
  console.log(
    "Validated exact recovery stages, approval and digest binding, RPO/RTO measurement, isolation, integrity, identity, privacy, reconciliation, deterministic teardown, and minimized failure behavior.",
  );
}

function main() {
  const args = parseArguments(process.argv.slice(2));
  if (args.selfTest) {
    selfTest();
    return;
  }
  for (const key of ["control-file", "inventory-file", "driver", "out"]) {
    if (!args[key]) fail(`--${key} is required`);
  }
  const planPath = resolve(
    args.config ?? join(root, "infrastructure/testing/recovery/plan.yaml"),
  );
  const planRaw = readRegularFile(planPath, "recovery plan", 64 * 1_024);
  const plan = validateRecoveryPlan(YAML.parse(planRaw));
  const controlRaw = readRegularFile(
    args["control-file"],
    "recovery control",
    64 * 1_024,
    true,
  );
  const inventoryRaw = readRegularFile(
    args["inventory-file"],
    "recovery inventory",
    256 * 1_024,
    true,
  );
  const driverRaw = readRegularFile(
    args.driver,
    "recovery driver",
    1024 * 1_024,
    true,
  );
  const control = YAML.parse(controlRaw);
  const inventory = YAML.parse(inventoryRaw);
  validateRecoveryInventory(inventory, plan);
  validateRecoveryControl(control, plan, inventory, Date.now());
  if (
    control.planSha256 !== documentDigest(plan) ||
    control.inventorySha256 !== documentDigest(inventory) ||
    control.driverSha256 !== rawDigest(driverRaw)
  ) {
    fail("recovery plan inventory or driver digest differs from approval");
  }
  const commit = repositoryState();
  if (commit !== control.candidateCommit) {
    fail("recovery approval does not bind the current commit");
  }
  if (!isAbsolute(args.out) || existsSync(args.out)) {
    fail("recovery output must be a new absolute path");
  }
  const context = { plan, inventory, control };
  const invoke = makeDriverInvoker({
    driverRaw,
    controlRaw,
    inventoryRaw,
    context,
  });
  let result;
  try {
    result = runRecoveryWithAdapter(context, invoke);
  } finally {
    invoke.dispose();
  }
  writeFileSync(args.out, `${JSON.stringify(result.report, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  if (result.error) {
    process.exitCode = 1;
    console.error(
      `Recovery runner failed closed at ${result.report.failureStage} with ${result.report.failureCode}; minimized report written.`,
    );
    return;
  }
  console.log(
    `Recovery runner passed ${result.report.stages.length} service stages plus teardown with measured RPO ${result.report.rpoSeconds}s and RTO ${result.report.rtoSeconds}s.`,
  );
}

const invokedDirectly =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) main();
