import assert from "node:assert/strict";
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

import {
  documentDigest,
  validateRecoveryInventory,
  validateRecoveryPlan,
} from "./run-clean-room-recovery.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const evidencePath = join(root, "docs/plan/evidence/M15/recovery.yaml");
const planPath = join(root, "infrastructure/testing/recovery/plan.yaml");
const tasksPath = join(root, "docs/plan/TASKS.yaml");
const evidence = YAML.parse(readFileSync(evidencePath, "utf8"));
const plan = validateRecoveryPlan(YAML.parse(readFileSync(planPath, "utf8")));
const tasks = YAML.parse(readFileSync(tasksPath, "utf8"));
const requiredChecks = new Set([
  "plan_contract",
  "controller_selftest",
  "approval_digest_binding",
  "disposable_isolation_guard",
  "deterministic_teardown",
  "minimized_report",
  "exact_head_ci",
  "approved_drill_window",
  "exact_source_inventory",
  "source_marker_freshness",
  "base_backup_integrity",
  "wal_continuity_pitr",
  "measured_rpo",
  "migration_parity",
  "rls_grant_parity",
  "ledger_projection_integrity",
  "queue_idempotency_integrity",
  "supabase_auth_data",
  "supabase_auth_session",
  "authentik_state",
  "authentik_login",
  "application_image_configuration",
  "signing_reference_resolution",
  "provider_secret_configuration",
  "privacy_journal_replay",
  "tenant_authorization",
  "connector_webhook",
  "protected_value_idempotency",
  "measured_full_service_rto",
  "final_reconciliation",
  "repeatability",
  "teardown_evidence",
]);
const artifactKeys = [
  "primaryInventoryPath",
  "primaryInventorySha256",
  "repeatInventoryPath",
  "repeatInventorySha256",
  "primaryRunPath",
  "primaryRunSha256",
  "repeatRunPath",
  "repeatRunSha256",
  "reconciliationPath",
  "reconciliationSha256",
];
const allowedStatuses = new Set(["passed", "pending", "failed"]);
const pendingLanguagePattern =
  /\b(await|pending|remain|requires?|must|not yet|has not|will|future|todo)\b/iu;
const credentialPattern =
  /\b(?:sflt_v1_[0-9a-f]{32}_[A-Za-z0-9_-]{43}|sk_(?:live|test)_[A-Za-z0-9]{16,}|whsec_[A-Za-z0-9]{16,}|eyJ[A-Za-z0-9_-]{20,})\b/u;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu;
const uuidPattern =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/iu;
const forbiddenKeyPattern =
  /(?:password|token|cookie|authorization|privatekey|rawbody|requestbody|responsebody|customerid|connectionid|orderid|payload)$/iu;

function fail(message) {
  throw new Error(`Recovery evidence invalid: ${message}`);
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

function scanSensitive(value, path = "evidence") {
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
    if (uuidPattern.test(value)) fail(`raw resource identifier at ${path}`);
  }
}

function rawDigest(raw) {
  return createHash("sha256").update(raw).digest("hex");
}

function safeArtifactPath(relativePath, extension) {
  if (
    typeof relativePath !== "string" ||
    !new RegExp(
      `^docs/plan/evidence/M15/runs/recovery-[a-z0-9][a-z0-9-]{2,79}\\.${extension}$`,
      "u",
    ).test(relativePath)
  ) {
    fail(`recovery ${extension} artifact path is unsafe`);
  }
  const absolute = resolve(root, relativePath);
  const artifactRoot = `${resolve(root, "docs/plan/evidence/M15/runs")}${sep}`;
  if (!absolute.startsWith(artifactRoot)) {
    fail("recovery artifact escapes the evidence root");
  }
  return absolute;
}

function readBoundArtifact(relativePath, expectedDigest, extension) {
  if (
    typeof expectedDigest !== "string" ||
    !/^[0-9a-f]{64}$/u.test(expectedDigest) ||
    /^0{64}$/u.test(expectedDigest)
  ) {
    fail("recovery artifact digest must be exact and nonzero");
  }
  const absolute = safeArtifactPath(relativePath, extension);
  const maximumBytes = extension === "json" ? 1024 * 1_024 : 256 * 1_024;
  let descriptor;
  let raw;
  try {
    const linkStatus = lstatSync(absolute);
    if (!linkStatus.isFile()) fail("recovery artifact must not be a link");
    descriptor = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
    const status = fstatSync(descriptor);
    if (
      !status.isFile() ||
      status.dev !== linkStatus.dev ||
      status.ino !== linkStatus.ino ||
      status.size < 1 ||
      status.size > maximumBytes
    ) {
      fail("recovery artifact is not a bounded stable file");
    }
    raw = Buffer.alloc(status.size);
    let offset = 0;
    while (offset < raw.length) {
      const read = readSync(
        descriptor,
        raw,
        offset,
        raw.length - offset,
        offset,
      );
      if (read === 0) fail("recovery artifact changed while reading");
      offset += read;
    }
  } catch {
    fail(`recovery artifact ${relativePath} is unreadable`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  if (rawDigest(raw) !== expectedDigest) {
    fail(`recovery artifact digest drifted for ${relativePath}`);
  }
  let parsed;
  try {
    parsed =
      extension === "json"
        ? JSON.parse(raw.toString("utf8"))
        : YAML.parse(raw.toString("utf8"));
  } catch {
    fail(`recovery artifact ${relativePath} is invalid ${extension}`);
  }
  scanSensitive(parsed, relativePath);
  return { parsed, rawSha256: expectedDigest };
}

function validateRun(report, candidate, inventory, candidatePlan, label) {
  const { rpoSeconds: inventoryRpoSeconds } = validateRecoveryInventory(
    inventory,
    candidatePlan,
  );
  exactKeys(
    report,
    [
      "schema",
      "status",
      "candidateCommit",
      "planProfile",
      "planSha256",
      "inventorySha256",
      "driverSha256",
      "controlSha256",
      "targetClass",
      "startedAt",
      "serviceReadyAt",
      "finishedAt",
      "rpoSeconds",
      "rtoSeconds",
      "stages",
      "cleanup",
      "failureStage",
      "failureCode",
    ],
    `${label} recovery run`,
  );
  if (
    report.schema !== "starfiniti.recovery-run.v1" ||
    report.status !== "passed" ||
    report.candidateCommit !== candidate.candidate.commit ||
    report.planProfile !== candidate.plan.profile ||
    report.planSha256 !== documentDigest(candidatePlan) ||
    report.inventorySha256 !== documentDigest(inventory) ||
    !/^[0-9a-f]{64}$/u.test(report.driverSha256) ||
    /^0{64}$/u.test(report.driverSha256) ||
    !/^[0-9a-f]{64}$/u.test(report.controlSha256) ||
    /^0{64}$/u.test(report.controlSha256) ||
    report.targetClass !== "clean_room_disposable" ||
    report.failureStage !== null ||
    report.failureCode !== null
  ) {
    fail(`${label} recovery run identity or outcome is invalid`);
  }
  const startedAt = exactUtc(report.startedAt, `${label} run start`);
  const serviceReadyAt = exactUtc(
    report.serviceReadyAt,
    `${label} service ready`,
  );
  const finishedAt = exactUtc(report.finishedAt, `${label} run finish`);
  if (
    serviceReadyAt < startedAt ||
    finishedAt < serviceReadyAt ||
    typeof report.rpoSeconds !== "number" ||
    report.rpoSeconds !== inventoryRpoSeconds ||
    report.rpoSeconds > candidate.objectives.maximumRpoSeconds ||
    typeof report.rtoSeconds !== "number" ||
    report.rtoSeconds < 0 ||
    report.rtoSeconds > candidate.objectives.maximumFullServiceRtoSeconds
  ) {
    fail(`${label} recovery RPO RTO or interval is invalid`);
  }
  const expectedStages = candidatePlan.stages
    .slice(0, -1)
    .map((stage) => stage.id);
  if (
    !Array.isArray(report.stages) ||
    report.stages.length !== expectedStages.length ||
    report.stages.map((stage) => stage.id).join(",") !==
      expectedStages.join(",")
  ) {
    fail(`${label} recovery stage evidence is incomplete or reordered`);
  }
  for (const stage of report.stages) {
    exactKeys(
      stage,
      ["id", "status", "durationMs", "evidenceSha256"],
      `${label} stage`,
    );
    const planStage = candidatePlan.stages.find((item) => item.id === stage.id);
    if (
      stage.status !== "passed" ||
      typeof stage.durationMs !== "number" ||
      stage.durationMs < 0 ||
      stage.durationMs > planStage.timeoutSeconds * 1_000 ||
      !/^[0-9a-f]{64}$/u.test(stage.evidenceSha256) ||
      /^0{64}$/u.test(stage.evidenceSha256)
    ) {
      fail(`${label} stage timing or evidence digest is invalid`);
    }
  }
  const measuredStageMilliseconds = report.stages.reduce(
    (total, stage) => total + stage.durationMs,
    0,
  );
  if (measuredStageMilliseconds > report.rtoSeconds * 1_000) {
    fail(`${label} stage timing exceeds its full-service RTO`);
  }
  exactKeys(
    report.cleanup,
    ["attempted", "passed", "durationMs", "evidenceSha256"],
    `${label} cleanup`,
  );
  if (
    report.cleanup.attempted !== true ||
    report.cleanup.passed !== true ||
    typeof report.cleanup.durationMs !== "number" ||
    report.cleanup.durationMs < 0 ||
    report.cleanup.durationMs >
      candidatePlan.stages.at(-1).timeoutSeconds * 1_000 ||
    !/^[0-9a-f]{64}$/u.test(report.cleanup.evidenceSha256) ||
    /^0{64}$/u.test(report.cleanup.evidenceSha256)
  ) {
    fail(`${label} teardown evidence is invalid`);
  }
}

function validateReconciliation(
  reconciliation,
  candidate,
  primaryInventorySha256,
  repeatInventorySha256,
  primarySha256,
  repeatSha256,
) {
  exactKeys(
    reconciliation,
    [
      "schema",
      "candidateCommit",
      "primaryInventorySha256",
      "repeatInventorySha256",
      "primaryRunSha256",
      "repeatRunSha256",
      "reviewedAt",
      "reviewerRole",
      "approved",
      "differences",
    ],
    "recovery reconciliation",
  );
  if (
    reconciliation.schema !== "starfiniti.recovery-reconciliation.v1" ||
    reconciliation.candidateCommit !== candidate.candidate.commit ||
    reconciliation.primaryInventorySha256 !== primaryInventorySha256 ||
    reconciliation.repeatInventorySha256 !== repeatInventorySha256 ||
    reconciliation.primaryRunSha256 !== primarySha256 ||
    reconciliation.repeatRunSha256 !== repeatSha256 ||
    reconciliation.reviewerRole !== "independent_recovery_reviewer" ||
    reconciliation.approved !== true
  ) {
    fail("recovery reconciliation identity or approval is invalid");
  }
  exactUtc(reconciliation.reviewedAt, "recovery reconciliation review");
  const differenceKeys = [
    "database",
    "ledger",
    "queues",
    "supabaseAuth",
    "authentik",
    "configuration",
    "signingReferences",
    "privacy",
    "connector",
    "woocommerce",
    "unexplainedDataLoss",
  ];
  exactKeys(reconciliation.differences, differenceKeys, "recovery differences");
  if (differenceKeys.some((key) => reconciliation.differences[key] !== 0)) {
    fail("recovery reconciliation contains a difference");
  }
}

export function validateDocument(
  candidate = evidence,
  candidatePlan = plan,
  candidateTasks = tasks,
  artifactReader = readBoundArtifact,
) {
  validateRecoveryPlan(candidatePlan);
  exactKeys(
    candidate,
    [
      "schema",
      "status",
      "observedAt",
      "currentProduction",
      "candidate",
      "plan",
      "objectives",
      "artifacts",
      "checks",
      "automaticFails",
    ],
    "recovery evidence",
  );
  if (
    candidate?.schema !== "starfiniti.recovery-evidence.v1" ||
    !["in_progress", "complete"].includes(candidate.status)
  ) {
    fail("recovery evidence identity or status is invalid");
  }
  exactUtc(candidate.observedAt, "recovery observedAt");
  exactKeys(
    candidate.currentProduction,
    ["release", "applicationCommit"],
    "current production",
  );
  exactKeys(
    candidate.candidate,
    ["branch", "commit", "approvedDrill", "reconciliationApproved"],
    "recovery candidate",
  );
  if (
    !/^v\d+\.\d+\.\d+$/u.test(candidate.currentProduction?.release) ||
    !/^[0-9a-f]{40}$/u.test(candidate.currentProduction?.applicationCommit) ||
    candidate.candidate?.branch !== "codex/m15-clean-room-recovery" ||
    !/^[0-9a-f]{40}$/u.test(candidate.candidate?.commit) ||
    typeof candidate.candidate.approvedDrill !== "boolean" ||
    typeof candidate.candidate.reconciliationApproved !== "boolean"
  ) {
    fail("recovery production or candidate identity is invalid");
  }
  exactKeys(candidate.plan, ["path", "profile", "sha256"], "recovery plan");
  exactKeys(
    candidate.objectives,
    ["maximumRpoSeconds", "maximumFullServiceRtoSeconds"],
    "recovery objectives",
  );
  if (
    candidate.plan?.path !== "infrastructure/testing/recovery/plan.yaml" ||
    candidate.plan.profile !== candidatePlan.profile ||
    candidate.plan.sha256 !== rawDigest(readFileSync(planPath)) ||
    candidate.objectives?.maximumRpoSeconds !==
      candidatePlan.objectives.maximumRpoSeconds ||
    candidate.objectives?.maximumFullServiceRtoSeconds !==
      candidatePlan.objectives.maximumFullServiceRtoSeconds
  ) {
    fail("recovery plan path digest profile or objective drifted");
  }
  if (!Array.isArray(candidate.checks))
    fail("recovery checks must be an array");
  const seen = new Set();
  for (const check of candidate.checks) {
    if (!requiredChecks.has(check.id))
      fail(`unknown recovery check ${check.id}`);
    if (seen.has(check.id)) fail(`duplicate recovery check ${check.id}`);
    seen.add(check.id);
    if (!allowedStatuses.has(check.status)) {
      fail(`invalid recovery status for ${check.id}`);
    }
    if (
      typeof check.evidence !== "string" ||
      check.evidence.length < 45 ||
      check.evidence.length > 700
    ) {
      fail(`recovery evidence for ${check.id} is not substantive and bounded`);
    }
    if (
      check.status === "passed" &&
      pendingLanguagePattern.test(check.evidence)
    ) {
      fail(`passed recovery check ${check.id} contains forward language`);
    }
  }
  const missing = [...requiredChecks].filter((id) => !seen.has(id));
  if (missing.length) fail(`missing recovery checks ${missing.join(", ")}`);
  if (
    !Array.isArray(candidate.automaticFails) ||
    candidate.automaticFails.length < 18 ||
    new Set(candidate.automaticFails).size !==
      candidate.automaticFails.length ||
    candidate.automaticFails.some(
      (rule) => typeof rule !== "string" || rule.length < 80,
    )
  ) {
    fail("recovery automatic failures are incomplete or duplicated");
  }
  exactKeys(candidate.artifacts, artifactKeys, "recovery artifacts");
  scanSensitive(candidate, "recovery evidence");
  const m15 = candidateTasks.tasks?.find(
    (task) => task.id === "M15-GA-HARDENING",
  );
  const s04 = m15?.slices?.find(
    (slice) => slice.id === "M15-S04-CLEAN-ROOM-RECOVERY",
  );
  if (!m15 || !s04) fail("M15-S04 task graph is missing");
  const incomplete = candidate.checks.filter(
    (check) => check.status !== "passed",
  );
  const artifactValues = Object.values(candidate.artifacts);
  if (candidate.status === "complete") {
    if (
      incomplete.length ||
      candidate.candidate.approvedDrill !== true ||
      candidate.candidate.reconciliationApproved !== true ||
      artifactValues.some((value) => value === null) ||
      s04.status !== "complete" ||
      m15.status !== "in_progress"
    ) {
      fail(
        "complete recovery evidence lacks checks artifacts task or approval",
      );
    }
    const primaryInventory = artifactReader(
      candidate.artifacts.primaryInventoryPath,
      candidate.artifacts.primaryInventorySha256,
      "yaml",
    );
    const repeatInventory = artifactReader(
      candidate.artifacts.repeatInventoryPath,
      candidate.artifacts.repeatInventorySha256,
      "yaml",
    );
    const primary = artifactReader(
      candidate.artifacts.primaryRunPath,
      candidate.artifacts.primaryRunSha256,
      "json",
    );
    const repeat = artifactReader(
      candidate.artifacts.repeatRunPath,
      candidate.artifacts.repeatRunSha256,
      "json",
    );
    const reconciliation = artifactReader(
      candidate.artifacts.reconciliationPath,
      candidate.artifacts.reconciliationSha256,
      "yaml",
    );
    const artifactPaths = [
      candidate.artifacts.primaryInventoryPath,
      candidate.artifacts.repeatInventoryPath,
      candidate.artifacts.primaryRunPath,
      candidate.artifacts.repeatRunPath,
      candidate.artifacts.reconciliationPath,
    ];
    if (
      new Set(artifactPaths).size !== artifactPaths.length ||
      primaryInventory.rawSha256 === repeatInventory.rawSha256 ||
      primary.rawSha256 === repeat.rawSha256
    ) {
      fail("recovery completion must contain two distinct approved runs");
    }
    validateRecoveryInventory(primaryInventory.parsed, candidatePlan);
    validateRecoveryInventory(repeatInventory.parsed, candidatePlan);
    validateRun(
      primary.parsed,
      candidate,
      primaryInventory.parsed,
      candidatePlan,
      "primary",
    );
    validateRun(
      repeat.parsed,
      candidate,
      repeatInventory.parsed,
      candidatePlan,
      "repeat",
    );
    validateReconciliation(
      reconciliation.parsed,
      candidate,
      primaryInventory.rawSha256,
      repeatInventory.rawSha256,
      primary.rawSha256,
      repeat.rawSha256,
    );
  } else if (
    candidate.candidate.approvedDrill !== false ||
    candidate.candidate.reconciliationApproved !== false ||
    artifactValues.some((value) => value !== null) ||
    s04.status !== "in_progress" ||
    m15.status !== "in_progress"
  ) {
    fail("in-progress recovery evidence contains completion authority");
  }
  return { incomplete };
}

const result = validateDocument();

if (process.argv.includes("--self-test")) {
  const reject = (
    candidate,
    pattern,
    candidatePlan = plan,
    candidateTasks = tasks,
  ) => {
    assert.throws(
      () => validateDocument(candidate, candidatePlan, candidateTasks),
      pattern,
    );
  };
  const duplicate = structuredClone(evidence);
  duplicate.checks.push(structuredClone(duplicate.checks[0]));
  reject(duplicate, /duplicate recovery check/u);
  const falsePass = structuredClone(evidence);
  const pending = falsePass.checks.find(
    (check) => check.id === "approved_drill_window",
  );
  pending.status = "passed";
  reject(falsePass, /forward language/u);
  const unsafe = structuredClone(evidence);
  unsafe.candidate.approvedDrill = true;
  reject(unsafe, /completion authority/u);
  const routePlan = structuredClone(plan);
  routePlan.safety.productionRoutesAllowed = true;
  reject(evidence, /safety boundary/u, routePlan);
  const shortRule = structuredClone(evidence);
  shortRule.automaticFails[0] = "too short";
  reject(shortRule, /automatic failures/u);

  const inputIds = [
    "application_configuration",
    "authentik_data",
    "authentik_database",
    "base_backup",
    "privacy_journal",
    "secret_escrow_manifest",
    "supabase_configuration",
    "wal_archive",
  ];
  const imageIds = [
    "authentik",
    "dashboard",
    "postgres",
    "supabase-auth",
    "worker",
  ];
  const makeInventory = (suffix, observedAt) => {
    const observed = Date.parse(observedAt);
    const fact = new Date(observed - 10_000).toISOString();
    return {
      schema: "starfiniti.recovery-inventory.v1",
      observedAt,
      target: {
        class: "clean_room_disposable",
        environmentId: `clean-room-${suffix}`,
        marker: "starfiniti-clean-room-v1",
        markerSha256: suffix === "primary" ? "1".repeat(64) : "2".repeat(64),
        composeProject: `starfiniti-recovery-${suffix}`,
        internalNetwork: true,
        publicIngress: false,
        externalEgress: false,
        productionRouteCount: 0,
      },
      recoveryPoint: {
        simulatedFailureAt: new Date(observed - 1_000).toISOString(),
        lastCommittedFactAt: fact,
        latestRecoverableAt: new Date(observed - 5_000).toISOString(),
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
      images: imageIds.map((id, index) => ({
        id,
        digest: `sha256:${String(index + 3).repeat(64)}`,
      })),
      inputs: inputIds.map((id) => ({
        id,
        sha256: "a".repeat(64),
        capturedAt: fact,
        verified: true,
      })),
    };
  };
  const primaryInventory = makeInventory("primary", "2026-08-27T10:00:00Z");
  const repeatInventory = makeInventory("repeat", "2026-08-27T11:00:00Z");
  const makeRun = (inventory, startedAt) => ({
    schema: "starfiniti.recovery-run.v1",
    status: "passed",
    candidateCommit: evidence.candidate.commit,
    planProfile: plan.profile,
    planSha256: documentDigest(plan),
    inventorySha256: documentDigest(inventory),
    driverSha256: "b".repeat(64),
    controlSha256: "c".repeat(64),
    targetClass: "clean_room_disposable",
    startedAt,
    serviceReadyAt: new Date(Date.parse(startedAt) + 10_000).toISOString(),
    finishedAt: new Date(Date.parse(startedAt) + 11_000).toISOString(),
    rpoSeconds: 0,
    rtoSeconds: 10,
    stages: plan.stages.slice(0, -1).map((stage, index) => ({
      id: stage.id,
      status: "passed",
      durationMs: 1,
      evidenceSha256: String((index % 8) + 1).repeat(64),
    })),
    cleanup: {
      attempted: true,
      passed: true,
      durationMs: 1,
      evidenceSha256: "d".repeat(64),
    },
    failureStage: null,
    failureCode: null,
  });
  const primaryRun = makeRun(primaryInventory, "2026-08-27T10:01:00Z");
  const repeatRun = makeRun(repeatInventory, "2026-08-27T11:01:00Z");
  const primaryInventoryRaw = YAML.stringify(primaryInventory);
  const repeatInventoryRaw = YAML.stringify(repeatInventory);
  const primaryRunRaw = `${JSON.stringify(primaryRun)}\n`;
  const repeatRunRaw = `${JSON.stringify(repeatRun)}\n`;
  const reconciliation = {
    schema: "starfiniti.recovery-reconciliation.v1",
    candidateCommit: evidence.candidate.commit,
    primaryInventorySha256: rawDigest(primaryInventoryRaw),
    repeatInventorySha256: rawDigest(repeatInventoryRaw),
    primaryRunSha256: rawDigest(primaryRunRaw),
    repeatRunSha256: rawDigest(repeatRunRaw),
    reviewedAt: "2026-08-27T12:00:00Z",
    reviewerRole: "independent_recovery_reviewer",
    approved: true,
    differences: {
      database: 0,
      ledger: 0,
      queues: 0,
      supabaseAuth: 0,
      authentik: 0,
      configuration: 0,
      signingReferences: 0,
      privacy: 0,
      connector: 0,
      woocommerce: 0,
      unexplainedDataLoss: 0,
    },
  };
  const reconciliationRaw = YAML.stringify(reconciliation);
  const artifactsByPath = new Map([
    [
      "docs/plan/evidence/M15/runs/recovery-primary-inventory.yaml",
      { parsed: primaryInventory, rawSha256: rawDigest(primaryInventoryRaw) },
    ],
    [
      "docs/plan/evidence/M15/runs/recovery-repeat-inventory.yaml",
      { parsed: repeatInventory, rawSha256: rawDigest(repeatInventoryRaw) },
    ],
    [
      "docs/plan/evidence/M15/runs/recovery-primary-run.json",
      { parsed: primaryRun, rawSha256: rawDigest(primaryRunRaw) },
    ],
    [
      "docs/plan/evidence/M15/runs/recovery-repeat-run.json",
      { parsed: repeatRun, rawSha256: rawDigest(repeatRunRaw) },
    ],
    [
      "docs/plan/evidence/M15/runs/recovery-reconciliation.yaml",
      { parsed: reconciliation, rawSha256: rawDigest(reconciliationRaw) },
    ],
  ]);
  const memoryArtifactReader = (path, expectedDigest, extension) => {
    safeArtifactPath(path, extension);
    const artifact = artifactsByPath.get(path);
    if (
      !artifact ||
      artifact.rawSha256 !== expectedDigest ||
      !path.endsWith(`.${extension}`)
    ) {
      fail("self-test artifact binding differs");
    }
    return structuredClone(artifact);
  };
  const complete = structuredClone(evidence);
  complete.status = "complete";
  complete.candidate.approvedDrill = true;
  complete.candidate.reconciliationApproved = true;
  complete.checks.forEach((check) => {
    check.status = "passed";
    check.evidence =
      "Exact independently reviewed recovery evidence reconciles to zero difference and satisfies the declared bounded objective.";
  });
  complete.artifacts = {
    primaryInventoryPath:
      "docs/plan/evidence/M15/runs/recovery-primary-inventory.yaml",
    primaryInventorySha256: rawDigest(primaryInventoryRaw),
    repeatInventoryPath:
      "docs/plan/evidence/M15/runs/recovery-repeat-inventory.yaml",
    repeatInventorySha256: rawDigest(repeatInventoryRaw),
    primaryRunPath: "docs/plan/evidence/M15/runs/recovery-primary-run.json",
    primaryRunSha256: rawDigest(primaryRunRaw),
    repeatRunPath: "docs/plan/evidence/M15/runs/recovery-repeat-run.json",
    repeatRunSha256: rawDigest(repeatRunRaw),
    reconciliationPath:
      "docs/plan/evidence/M15/runs/recovery-reconciliation.yaml",
    reconciliationSha256: rawDigest(reconciliationRaw),
  };
  const completeTasks = structuredClone(tasks);
  completeTasks.tasks
    .find((task) => task.id === "M15-GA-HARDENING")
    .slices.find((slice) => slice.id === "M15-S04-CLEAN-ROOM-RECOVERY").status =
    "complete";
  assert.equal(
    validateDocument(complete, plan, completeTasks, memoryArtifactReader)
      .incomplete.length,
    0,
  );
  const reusedInventory = structuredClone(complete);
  reusedInventory.artifacts.repeatInventoryPath =
    reusedInventory.artifacts.primaryInventoryPath;
  reusedInventory.artifacts.repeatInventorySha256 =
    reusedInventory.artifacts.primaryInventorySha256;
  assert.throws(
    () =>
      validateDocument(
        reusedInventory,
        plan,
        completeTasks,
        memoryArtifactReader,
      ),
    /two distinct approved runs/u,
  );
  const wrongReconciliation = structuredClone(reconciliation);
  wrongReconciliation.primaryInventorySha256 = "e".repeat(64);
  assert.throws(
    () =>
      validateReconciliation(
        wrongReconciliation,
        complete,
        rawDigest(primaryInventoryRaw),
        rawDigest(repeatInventoryRaw),
        rawDigest(primaryRunRaw),
        rawDigest(repeatRunRaw),
      ),
    /identity or approval/u,
  );
}

console.log(
  `Validated ${requiredChecks.size} M15 recovery checks and ${plan.stages.length} exact stages; ${requiredChecks.size - result.incomplete.length} passed and ${result.incomplete.length} remain non-passing.`,
);
