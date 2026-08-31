import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const realRoot = realpathSync.native(root);
const registryPath = "docs/plan/evidence/M16/recurring-failures.yaml";
const planPath = "infrastructure/governance/continuous-improvement.yaml";
const digestPattern = /^[0-9a-f]{64}$/u;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u;
const allowedControls = new Set([
  "regressionTest",
  "validator",
  "monitor",
  "runbook",
  "agentRule",
]);
const requiredRecoveryFingerprint =
  "recovery.postgres-offsite.shared-borg-lock-starvation";
const requiredRecoveryControlPaths = new Set([
  "scripts/validate-backup-assets.mjs",
  "infrastructure/observability/prometheus/rules.yaml",
  "docs/operations/RUNBOOKS.md",
]);
const requiredRecoveryControlTypes = new Map([
  ["scripts/validate-backup-assets.mjs", "validator"],
  ["infrastructure/observability/prometheus/rules.yaml", "monitor"],
  ["docs/operations/RUNBOOKS.md", "runbook"],
]);
const requiredRecoveryOccurrences = new Map([
  [
    "shared-lock-starvation-2026-08-28",
    {
      observedAt: "2026-08-28T01:21:10Z",
      anchor: "## Live follow-up — 2026-08-28",
    },
  ],
  [
    "shared-lock-starvation-2026-08-31",
    {
      observedAt: "2026-08-31T12:08:18Z",
      anchor: "## Repeat off-site lock starvation — 2026-08-31 13:50 CEST",
    },
  ],
]);
const requiredRecoveryGates = new Set([
  "merge reviewed candidate",
  "provision dedicated repository and owner-only configuration",
  "activate repository-isolated archive and maintenance units",
  "activate node-exporter metrics and protected-value paging",
  "prove manual and timer archive continuity",
  "prove retention and isolated restore",
]);

function fail(message) {
  throw new Error(message);
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  const actual = new Set(Object.keys(value));
  if (
    actual.size !== expected.size ||
    [...expected].some((key) => !actual.has(key))
  ) {
    fail(`${label} keys differ`);
  }
}

function exactSet(actual, expected, label) {
  if (
    actual.size !== expected.size ||
    [...expected].some((item) => !actual.has(item))
  ) {
    fail(`${label} differs`);
  }
}

function uniqueStrings(values, label) {
  if (
    !Array.isArray(values) ||
    values.length < 1 ||
    values.some((value) => typeof value !== "string" || value.length < 3)
  ) {
    fail(`${label} must contain substantive strings`);
  }
  const unique = new Set(values);
  if (unique.size !== values.length) fail(`${label} contains a duplicate`);
  return unique;
}

function exactUtc(value, label) {
  if (!timestampPattern.test(value ?? "")) fail(`${label} is not exact UTC`);
  const instant = Date.parse(value);
  if (
    !Number.isFinite(instant) ||
    new Date(instant).toISOString().replace(".000Z", "Z") !== value
  ) {
    fail(`${label} is invalid`);
  }
  return instant;
}

function safeRepositoryPath(relativePath, label) {
  const pathSegments =
    typeof relativePath === "string" ? relativePath.split("/") : [];
  if (
    typeof relativePath !== "string" ||
    relativePath.length < 5 ||
    relativePath.includes("\\") ||
    relativePath.startsWith("/") ||
    /^[A-Za-z]:/u.test(relativePath) ||
    pathSegments.some(
      (segment) => segment === "" || segment === "." || segment === "..",
    )
  ) {
    fail(`${label} is not a repository-relative path`);
  }
  const absolute = resolve(root, relativePath);
  const rootPrefix = `${resolve(root)}${sep}`;
  if (!absolute.startsWith(rootPrefix)) fail(`${label} escapes the repository`);
  return absolute;
}

function readRegularRepositoryFile(relativePath) {
  const absolute = safeRepositoryPath(relativePath, `${relativePath} path`);
  let descriptor;
  try {
    descriptor = openSync(
      absolute,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    let parent = root;
    for (const segment of relativePath.split("/").slice(0, -1)) {
      parent = join(parent, segment);
      const parentStatus = lstatSync(parent);
      if (!parentStatus.isDirectory() || parentStatus.isSymbolicLink()) {
        fail(`${relativePath} parent chain must contain only real directories`);
      }
    }
    const opened = fstatSync(descriptor);
    const linked = lstatSync(absolute);
    if (
      !opened.isFile() ||
      !linked.isFile() ||
      opened.dev !== linked.dev ||
      opened.ino !== linked.ino
    ) {
      fail(`${relativePath} must be a regular file`);
    }
    const openedReal = realpathSync.native(absolute);
    const openedInside = relative(realRoot, openedReal);
    if (
      openedInside === "" ||
      openedInside === ".." ||
      openedInside.startsWith(`..${sep}`)
    ) {
      fail(`${relativePath} resolved outside the repository`);
    }
    const content = readFileSync(descriptor, "utf8");
    const final = fstatSync(descriptor);
    const finalLink = lstatSync(absolute);
    const finalReal = realpathSync.native(absolute);
    if (
      Buffer.byteLength(content, "utf8") !== opened.size ||
      final.dev !== opened.dev ||
      final.ino !== opened.ino ||
      final.size !== opened.size ||
      final.mtimeMs !== opened.mtimeMs ||
      final.ctimeMs !== opened.ctimeMs ||
      finalLink.dev !== opened.dev ||
      finalLink.ino !== opened.ino ||
      finalReal !== openedReal
    ) {
      fail(`${relativePath} changed while reading`);
    }
    return content;
  } catch (error) {
    if (error instanceof Error && error.message.includes("must")) throw error;
    fail(`${relativePath} cannot be read as a regular repository file`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function validateBoundReference(
  reference,
  reader,
  label,
  requireAnchor = false,
) {
  exactKeys(
    reference,
    new Set(requireAnchor ? ["path", "sha256", "anchor"] : ["path", "sha256"]),
    label,
  );
  safeRepositoryPath(reference.path, `${label}.path`);
  if (!digestPattern.test(reference.sha256 ?? "")) {
    fail(`${label}.sha256 is invalid`);
  }
  const content = reader(reference.path);
  if (digest(content) !== reference.sha256) fail(`${label} digest differs`);
  if (requireAnchor) {
    if (
      typeof reference.anchor !== "string" ||
      reference.anchor.length < 12 ||
      content.split(reference.anchor).length !== 2
    ) {
      fail(`${label} must bind one exact evidence anchor`);
    }
  }
}

function validateProof(proof, reader, label) {
  if (proof === null) return;
  validateBoundReference(proof, reader, label);
}

function validateRegistry(document, reader = readRegularRepositoryFile) {
  exactKeys(
    document,
    new Set(["schema", "status", "observedAt", "policy", "failures"]),
    "registry",
  );
  if (
    document.schema !== "starfiniti.recurring-failure-registry.v1" ||
    document.status !== "in_progress"
  ) {
    fail("registry schema or status differs");
  }
  const registryObservedAt = exactUtc(
    document.observedAt,
    "registry observedAt",
  );
  exactKeys(
    document.policy,
    new Set([
      "thresholdOccurrences",
      "allowedControls",
      "evidenceDigestsRequired",
      "candidateCannotClaimMergeOrActivation",
    ]),
    "registry policy",
  );
  if (
    document.policy.thresholdOccurrences !== 2 ||
    document.policy.evidenceDigestsRequired !== true ||
    document.policy.candidateCannotClaimMergeOrActivation !== true
  ) {
    fail("registry policy differs");
  }
  exactSet(
    uniqueStrings(document.policy.allowedControls, "allowed controls"),
    allowedControls,
    "allowed controls",
  );

  if (!Array.isArray(document.failures) || document.failures.length < 1) {
    fail("registry requires at least one failure");
  }
  const fingerprints = new Set();
  for (const failure of document.failures) {
    exactKeys(
      failure,
      new Set([
        "fingerprint",
        "riskId",
        "severity",
        "state",
        "summary",
        "occurrences",
        "decision",
        "implementation",
        "controls",
        "production",
        "remainingGates",
      ]),
      "failure",
    );
    if (
      typeof failure.fingerprint !== "string" ||
      failure.fingerprint.length < 20 ||
      fingerprints.has(failure.fingerprint)
    ) {
      fail("failure fingerprint is invalid or duplicated");
    }
    fingerprints.add(failure.fingerprint);
    if (
      !/^R-\d{3}$/u.test(failure.riskId ?? "") ||
      !["Critical", "High", "Medium", "Low"].includes(failure.severity) ||
      ![
        "control_candidate",
        "merged_pending_activation",
        "active_observation",
      ].includes(failure.state) ||
      typeof failure.summary !== "string" ||
      failure.summary.length < 40
    ) {
      fail(`${failure.fingerprint} identity is incomplete`);
    }

    if (!Array.isArray(failure.occurrences) || failure.occurrences.length < 1) {
      fail(`${failure.fingerprint} requires occurrence evidence`);
    }
    const occurrenceIds = new Set();
    const occurrenceAnchors = new Set();
    let previousOccurrence = 0;
    for (const occurrence of failure.occurrences) {
      exactKeys(
        occurrence,
        new Set(["id", "observedAt", "evidence", "productionMutation"]),
        `${failure.fingerprint} occurrence`,
      );
      if (
        typeof occurrence.id !== "string" ||
        occurrence.id.length < 12 ||
        occurrenceIds.has(occurrence.id) ||
        occurrence.productionMutation !== false
      ) {
        fail(`${failure.fingerprint} occurrence identity differs`);
      }
      occurrenceIds.add(occurrence.id);
      const observedAt = exactUtc(
        occurrence.observedAt,
        `${failure.fingerprint}.${occurrence.id} observedAt`,
      );
      if (observedAt <= previousOccurrence || observedAt > registryObservedAt) {
        fail(`${failure.fingerprint} occurrences are not chronological`);
      }
      previousOccurrence = observedAt;
      validateBoundReference(
        occurrence.evidence,
        reader,
        `${failure.fingerprint}.${occurrence.id} evidence`,
        true,
      );
      if (occurrenceAnchors.has(occurrence.evidence.anchor)) {
        fail(`${failure.fingerprint} occurrence anchor is reused`);
      }
      occurrenceAnchors.add(occurrence.evidence.anchor);
    }

    validateBoundReference(
      failure.decision,
      reader,
      `${failure.fingerprint} decision`,
    );
    validateBoundReference(
      failure.implementation,
      reader,
      `${failure.fingerprint} implementation`,
    );
    if (!Array.isArray(failure.controls)) {
      fail(`${failure.fingerprint} controls must be an array`);
    }
    if (
      failure.occurrences.length >= document.policy.thresholdOccurrences &&
      failure.controls.length < 1
    ) {
      fail(`${failure.fingerprint} recurred without a durable control`);
    }
    const controlIds = new Set();
    const controlReferences = new Set();
    for (const control of failure.controls) {
      exactKeys(
        control,
        new Set([
          "id",
          "type",
          "reference",
          "deliveryStatus",
          "mergeEvidence",
          "productionEvidence",
          "observationEvidence",
        ]),
        `${failure.fingerprint} control`,
      );
      if (
        typeof control.id !== "string" ||
        control.id.length < 8 ||
        controlIds.has(control.id) ||
        !allowedControls.has(control.type) ||
        !["candidate", "merged", "active"].includes(control.deliveryStatus)
      ) {
        fail(`${failure.fingerprint} control identity differs`);
      }
      controlIds.add(control.id);
      validateBoundReference(
        control.reference,
        reader,
        `${failure.fingerprint}.${control.id} reference`,
      );
      if (controlReferences.has(control.reference.path)) {
        fail(`${failure.fingerprint} control reference is duplicated`);
      }
      controlReferences.add(control.reference.path);
      validateProof(
        control.mergeEvidence,
        reader,
        `${failure.fingerprint}.${control.id} merge evidence`,
      );
      validateProof(
        control.productionEvidence,
        reader,
        `${failure.fingerprint}.${control.id} production evidence`,
      );
      validateProof(
        control.observationEvidence,
        reader,
        `${failure.fingerprint}.${control.id} observation evidence`,
      );
      if (
        control.deliveryStatus === "candidate" &&
        (control.mergeEvidence !== null ||
          control.productionEvidence !== null ||
          control.observationEvidence !== null)
      ) {
        fail(
          `${failure.fingerprint}.${control.id} candidate overclaims delivery`,
        );
      }
      if (
        control.deliveryStatus === "merged" &&
        (control.mergeEvidence === null ||
          control.productionEvidence !== null ||
          control.observationEvidence !== null)
      ) {
        fail(`${failure.fingerprint}.${control.id} merged evidence differs`);
      }
      if (
        control.deliveryStatus === "active" &&
        (control.mergeEvidence === null ||
          control.productionEvidence === null ||
          control.observationEvidence === null)
      ) {
        fail(
          `${failure.fingerprint}.${control.id} active evidence is incomplete`,
        );
      }
      const proofReferences = [
        control.reference,
        control.mergeEvidence,
        control.productionEvidence,
        control.observationEvidence,
      ].filter((proof) => proof !== null);
      if (
        new Set(proofReferences.map((proof) => proof.path)).size !==
          proofReferences.length ||
        new Set(proofReferences.map((proof) => proof.sha256)).size !==
          proofReferences.length
      ) {
        fail(
          `${failure.fingerprint}.${control.id} delivery evidence is reused`,
        );
      }
    }

    exactKeys(
      failure.production,
      new Set([
        "defectPresent",
        "dedicatedRepositoryActive",
        "pagingActive",
        "lastVerifiedAt",
        "evidence",
      ]),
      `${failure.fingerprint} production state`,
    );
    const productionObservedAt = exactUtc(
      failure.production.lastVerifiedAt,
      `${failure.fingerprint} production lastVerifiedAt`,
    );
    if (productionObservedAt > registryObservedAt) {
      fail(`${failure.fingerprint} production evidence is from the future`);
    }
    validateBoundReference(
      failure.production.evidence,
      reader,
      `${failure.fingerprint} production evidence`,
      true,
    );
    const candidateState = failure.state === "control_candidate";
    if (
      candidateState &&
      (failure.production.defectPresent !== true ||
        failure.production.dedicatedRepositoryActive !== false ||
        failure.production.pagingActive !== false ||
        failure.controls.some(
          (control) => control.deliveryStatus !== "candidate",
        ))
    ) {
      fail(`${failure.fingerprint} candidate state overclaims production`);
    }
    if (
      failure.state === "merged_pending_activation" &&
      (failure.production.defectPresent !== true ||
        failure.production.dedicatedRepositoryActive !== false ||
        failure.controls.some((control) => control.deliveryStatus !== "merged"))
    ) {
      fail(`${failure.fingerprint} merged state differs`);
    }
    if (
      failure.state === "active_observation" &&
      (failure.production.defectPresent !== false ||
        failure.production.dedicatedRepositoryActive !== true ||
        failure.production.pagingActive !== true ||
        failure.controls.some((control) => control.deliveryStatus !== "active"))
    ) {
      fail(`${failure.fingerprint} active state is incomplete`);
    }
    uniqueStrings(
      failure.remainingGates,
      `${failure.fingerprint} remaining gates`,
    );
  }

  if (!fingerprints.has(requiredRecoveryFingerprint)) {
    fail("the repeated PostgreSQL off-site starvation fingerprint is missing");
  }
  const recoveryFailure = document.failures.find(
    (failure) => failure.fingerprint === requiredRecoveryFingerprint,
  );
  if (
    recoveryFailure.riskId !== "R-004" ||
    recoveryFailure.severity !== "Critical" ||
    recoveryFailure.state !== "control_candidate" ||
    recoveryFailure.occurrences.length !== 2 ||
    recoveryFailure.decision.path !==
      "docs/architecture/ADR/0071-dedicated-postgresql-borg-repository.md" ||
    recoveryFailure.implementation.path !==
      "infrastructure/environments/proxmox/scripts/starfiniti-loyalty-postgres-borg-controller"
  ) {
    fail("the repeated PostgreSQL off-site starvation record differs");
  }
  exactSet(
    new Set(recoveryFailure.controls.map((control) => control.reference.path)),
    requiredRecoveryControlPaths,
    "repeated PostgreSQL off-site starvation controls",
  );
  for (const control of recoveryFailure.controls) {
    if (
      control.type !== requiredRecoveryControlTypes.get(control.reference.path)
    ) {
      fail("repeated PostgreSQL off-site starvation control type differs");
    }
  }
  exactSet(
    new Set(recoveryFailure.occurrences.map((occurrence) => occurrence.id)),
    new Set(requiredRecoveryOccurrences.keys()),
    "repeated PostgreSQL off-site starvation occurrences",
  );
  for (const occurrence of recoveryFailure.occurrences) {
    const expected = requiredRecoveryOccurrences.get(occurrence.id);
    if (
      occurrence.observedAt !== expected.observedAt ||
      occurrence.evidence.path !==
        "docs/plan/evidence/M01/backup-transfer-amplification-2026-08-14.md" ||
      occurrence.evidence.anchor !== expected.anchor
    ) {
      fail("repeated PostgreSQL off-site starvation occurrence differs");
    }
  }
  if (
    recoveryFailure.production.evidence.path !==
      "docs/plan/evidence/M01/backup-transfer-amplification-2026-08-14.md" ||
    recoveryFailure.production.evidence.anchor !==
      "## Repeat off-site lock starvation — 2026-08-31 13:50 CEST"
  ) {
    fail("repeated PostgreSQL off-site starvation production evidence differs");
  }
  exactSet(
    new Set(recoveryFailure.remainingGates),
    requiredRecoveryGates,
    "repeated PostgreSQL off-site starvation remaining gates",
  );
}

function selfTest(registry) {
  validateRegistry(structuredClone(registry));
  const cases = [
    ["schema drift", (value) => (value.schema = "v0")],
    ["threshold drift", (value) => (value.policy.thresholdOccurrences = 3)],
    ["missing recurrence", (value) => value.failures[0].occurrences.pop()],
    [
      "duplicate occurrence",
      (value) =>
        (value.failures[0].occurrences[1].id =
          value.failures[0].occurrences[0].id),
    ],
    [
      "reversed chronology",
      (value) =>
        (value.failures[0].occurrences[1].observedAt = "2026-08-27T00:00:00Z"),
    ],
    [
      "reused occurrence anchor",
      (value) =>
        (value.failures[0].occurrences[1].evidence.anchor =
          value.failures[0].occurrences[0].evidence.anchor),
    ],
    [
      "invented occurrence",
      (value) => (value.failures[0].occurrences[1].id = "invented-occurrence"),
    ],
    [
      "evidence digest drift",
      (value) =>
        (value.failures[0].occurrences[0].evidence.sha256 = "0".repeat(64)),
    ],
    [
      "evidence path escape",
      (value) =>
        (value.failures[0].occurrences[0].evidence.path = "../outside"),
    ],
    [
      "evidence dot segment",
      (value) =>
        (value.failures[0].occurrences[0].evidence.path =
          "docs/plan/./evidence/M01/backup-transfer-amplification-2026-08-14.md"),
    ],
    ["missing controls", (value) => (value.failures[0].controls = [])],
    [
      "unsupported control",
      (value) => (value.failures[0].controls[0].type = "ticket"),
    ],
    [
      "duplicate control",
      (value) =>
        (value.failures[0].controls[1].id = value.failures[0].controls[0].id),
    ],
    [
      "control digest drift",
      (value) =>
        (value.failures[0].controls[0].reference.sha256 = "f".repeat(64)),
    ],
    [
      "candidate merge overclaim",
      (value) =>
        (value.failures[0].controls[0].mergeEvidence = structuredClone(
          value.failures[0].controls[0].reference,
        )),
    ],
    [
      "active without proof",
      (value) => (value.failures[0].controls[0].deliveryStatus = "active"),
    ],
    [
      "production activation overclaim",
      (value) =>
        (value.failures[0].production.dedicatedRepositoryActive = true),
    ],
    ["missing gates", (value) => (value.failures[0].remainingGates = [])],
    ["missing required fingerprint", (value) => (value.failures = [])],
  ];
  for (const [label, mutate] of cases) {
    const candidate = structuredClone(registry);
    mutate(candidate);
    let rejected = false;
    try {
      validateRegistry(candidate);
    } catch {
      rejected = true;
    }
    if (!rejected) fail(`self-test accepted ${label}`);
  }
  return cases.length;
}

function validatePlanBinding(candidatePlan) {
  const recurring = candidatePlan.recurringFailure;
  if (
    recurring?.thresholdOccurrences !== 2 ||
    recurring.minimumDurableControls !== 1
  ) {
    fail("continuous-improvement plan recurrence bounds differ");
  }
  exactSet(
    uniqueStrings(recurring.allowedControls, "plan allowed controls"),
    allowedControls,
    "plan allowed controls",
  );
  exactKeys(
    recurring.registry,
    new Set([
      "schema",
      "path",
      "evidenceDigestsRequired",
      "candidateCannotClaimMergeOrActivation",
    ]),
    "continuous-improvement plan registry",
  );
  if (
    recurring.registry.schema !== "starfiniti.recurring-failure-registry.v1" ||
    recurring.registry.path !== registryPath ||
    recurring.registry.evidenceDigestsRequired !== true ||
    recurring.registry.candidateCannotClaimMergeOrActivation !== true
  ) {
    fail("continuous-improvement plan registry binding differs");
  }
}

const args = process.argv.slice(2);
if (args.some((argument) => argument !== "--self-test")) {
  fail(
    "usage: node scripts/validate-recurring-failure-registry.mjs [--self-test]",
  );
}
const registry = YAML.parse(readRegularRepositoryFile(registryPath));
const plan = YAML.parse(readRegularRepositoryFile(planPath));
validatePlanBinding(plan);
validateRegistry(registry);
let caseCount = 0;
if (args.includes("--self-test")) {
  caseCount = selfTest(registry);
  const driftedPlan = structuredClone(plan);
  driftedPlan.recurringFailure.minimumDurableControls = 0;
  let planRejected = false;
  try {
    validatePlanBinding(driftedPlan);
  } catch {
    planRejected = true;
  }
  if (!planRejected)
    fail("self-test accepted a weakened durable-control bound");
  caseCount += 1;
}
console.log(
  `Recurring-failure registry validated (${registry.failures.length} failure, ${registry.failures[0].occurrences.length} occurrences${caseCount ? `, ${caseCount} adversarial cases` : ""}).`,
);
