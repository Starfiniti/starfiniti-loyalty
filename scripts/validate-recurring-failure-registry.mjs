import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
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
const legacyRegistryPath = "docs/plan/evidence/M16/recurring-failures.yaml";
const registryPath = "docs/plan/evidence/M16/recurring-failures-v2.yaml";
const planPath = "infrastructure/governance/continuous-improvement.yaml";
const mainIntegrationPath =
  "docs/plan/evidence/M16/main-integration-2026-09-01.yaml";
const digestPattern = /^[0-9a-f]{64}$/u;
const commitPattern = /^[0-9a-f]{40}$/u;
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
const requiredActionsFingerprint =
  "security.github-actions.transitive-policy-inventory";
const requiredLegacyRegistry = Object.freeze({
  schema: "starfiniti.recurring-failure-registry.v1",
  path: legacyRegistryPath,
  sha256: "5b9bd0b668818b276266420d61afdea4b75dff2fb059ba6f91406a7ecf584c81",
});
const requiredSupersedingDecision = Object.freeze({
  path: "docs/architecture/ADR/0119-generalized-recurring-failure-registry.md",
  sha256: "a13c2f1318e25203175b0790b413b3a3c85b0eaa035da7e4147b25db2cef7ac1",
});
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
const requiredMergeEvidence = Object.freeze({
  path: "docs/plan/evidence/M16/main-integration-2026-09-01.yaml",
  sha256: "45ba2c59c8be7089f470b0ed21f4f486ed5c6370e65cbbfd1dc63fb52157c1e5",
});
const requiredMergeCommit = "c85d93d0e6e0273543078050e697f04309f11d93";
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
  "provision dedicated repository and owner-only configuration",
  "activate repository-isolated archive and maintenance units",
  "activate node-exporter metrics and protected-value paging",
  "prove manual and timer archive continuity",
  "prove retention and isolated restore",
]);
const requiredActionsOccurrences = new Map([
  [
    "actions-startup-failure-33499712113",
    {
      observedAt: "2026-09-01T10:53:44Z",
      anchor: "pullRequestStartup:",
    },
  ],
  [
    "actions-setup-failure-33499821641-attempt-1",
    {
      observedAt: "2026-09-01T10:55:06Z",
      anchor: "- attempt: 1",
    },
  ],
  [
    "actions-setup-failure-33499821641-attempt-2",
    {
      observedAt: "2026-09-01T11:03:49Z",
      anchor: "- attempt: 2",
    },
  ],
]);
const requiredActionsControlPaths = new Map([
  [".github/workflows/release.yml", "regressionTest"],
  ["scripts/validate-workflows.mjs", "validator"],
  ["scripts/validate-release-policy-audit.mjs", "validator"],
  ["scripts/validate-recurring-failure-registry.mjs", "validator"],
]);
const requiredActionsGates = new Set([
  "merge candidate validators and release preflight after eligible independent approval",
  "observe the merged controls on a later exact-head Security run",
  "inspect exact composite-action source whenever a pinned action revision changes",
  "retain all failed attempts and the non-exhaustive discovery limitation",
]);
const requiredActionsPolicyPatterns = Object.freeze([
  "actions/attest-build-provenance@*",
  "actions/cache@*",
  "actions/cache/restore@*",
  "actions/cache/save@*",
  "actions/checkout@*",
  "actions/download-artifact@*",
  "actions/setup-node@*",
  "actions/upload-artifact@*",
  "anchore/sbom-action@*",
  "aquasecurity/setup-trivy@*",
  "aquasecurity/trivy-action@*",
  "github/codeql-action/analyze@*",
  "github/codeql-action/init@*",
]);
const actionsCorrectionPath =
  "docs/plan/evidence/M15/repository-actions-policy-correction-2026-09-01.yaml";

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

function verifyCommitAncestry(ancestor, descendant) {
  try {
    execFileSync("git", ["cat-file", "-e", `${ancestor}^{commit}`], {
      cwd: root,
      stdio: "ignore",
    });
    execFileSync("git", ["cat-file", "-e", `${descendant}^{commit}`], {
      cwd: root,
      stdio: "ignore",
    });
    execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
      cwd: root,
      stdio: "ignore",
    });
  } catch {
    fail(
      "main integration reviewed head is not an ancestor of the merge commit",
    );
  }
}

function validateMainIntegrationEvidence(document) {
  exactKeys(
    document,
    new Set([
      "schema",
      "observedAt",
      "pullRequest",
      "main",
      "release",
      "production",
    ]),
    "main integration evidence",
  );
  if (document.schema !== "starfiniti.main-integration-evidence.v1") {
    fail("main integration evidence schema differs");
  }
  const observedAt = exactUtc(
    document.observedAt,
    "main integration evidence observedAt",
  );
  exactKeys(
    document.pullRequest,
    new Set([
      "number",
      "url",
      "state",
      "reviewedHead",
      "mergeCommit",
      "mergedAt",
    ]),
    "main integration pull request",
  );
  const mergedAt = exactUtc(
    document.pullRequest.mergedAt,
    "main integration mergedAt",
  );
  if (
    document.pullRequest.number !== 57 ||
    document.pullRequest.url !==
      "https://github.com/Starfiniti/starfiniti-loyalty/pull/57" ||
    document.pullRequest.state !== "merged" ||
    document.pullRequest.reviewedHead !==
      "149724a3a2fad89d1a7990e0c3114be2754ecab6" ||
    document.pullRequest.mergeCommit !==
      "c85d93d0e6e0273543078050e697f04309f11d93" ||
    !commitPattern.test(document.pullRequest.reviewedHead ?? "") ||
    !commitPattern.test(document.pullRequest.mergeCommit ?? "") ||
    mergedAt > observedAt
  ) {
    fail("main integration pull request evidence differs");
  }
  verifyCommitAncestry(
    document.pullRequest.reviewedHead,
    document.pullRequest.mergeCommit,
  );
  exactKeys(
    document.main,
    new Set(["commit", "reviewedHeadIsAncestor", "ci", "security"]),
    "main integration main state",
  );
  if (
    document.main.commit !== document.pullRequest.mergeCommit ||
    document.main.reviewedHeadIsAncestor !== true
  ) {
    fail("main integration ancestry differs");
  }
  for (const [name, expectedRunId] of [
    ["ci", 33475350770],
    ["security", 33475350801],
  ]) {
    const run = document.main[name];
    exactKeys(
      run,
      new Set(["runId", "headCommit", "conclusion"]),
      `main integration ${name}`,
    );
    if (
      run.runId !== expectedRunId ||
      run.headCommit !== document.main.commit ||
      run.conclusion !== "success"
    ) {
      fail(`main integration ${name} evidence differs`);
    }
  }
  exactKeys(
    document.release,
    new Set(["workflowId", "workflowState", "releaseForMergeCommit"]),
    "main integration release state",
  );
  if (
    document.release.workflowId !== 333373957 ||
    document.release.workflowState !== "disabled_manually" ||
    document.release.releaseForMergeCommit !== false
  ) {
    fail("main integration release state differs");
  }
  exactKeys(
    document.production,
    new Set([
      "release",
      "applicationCommit",
      "deploymentChanged",
      "loyaltyValueChanged",
    ]),
    "main integration production state",
  );
  if (
    document.production.release !== "v0.1.11" ||
    document.production.applicationCommit !==
      "0ced4b666a55d836bd3d4927337fe057a71bb4ba" ||
    !commitPattern.test(document.production.applicationCommit ?? "") ||
    document.production.deploymentChanged !== false ||
    document.production.loyaltyValueChanged !== false
  ) {
    fail("main integration production state differs");
  }
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

function validateCommittedFileDigest(commit, reference, label) {
  if (!commitPattern.test(commit ?? "")) fail(`${label} commit is invalid`);
  safeRepositoryPath(reference.path, `${label} path`);
  let content;
  try {
    content = execFileSync("git", ["show", `${commit}:${reference.path}`], {
      cwd: root,
      encoding: "buffer",
      maxBuffer: 4 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    fail(`${label} cannot be read from the merge commit`);
  }
  if (digest(content) !== reference.sha256) {
    fail(`${label} does not match the merge commit`);
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

function validateLegacyRegistry(document, reader = readRegularRepositoryFile) {
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
    recoveryFailure.state !== "merged_pending_activation" ||
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
      control.type !==
        requiredRecoveryControlTypes.get(control.reference.path) ||
      control.deliveryStatus !== "merged" ||
      control.mergeEvidence?.path !== requiredMergeEvidence.path ||
      control.mergeEvidence?.sha256 !== requiredMergeEvidence.sha256 ||
      control.productionEvidence !== null ||
      control.observationEvidence !== null
    ) {
      fail("repeated PostgreSQL off-site starvation control type differs");
    }
    validateCommittedFileDigest(
      requiredMergeCommit,
      control.reference,
      `repeated PostgreSQL off-site starvation ${control.id}`,
    );
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

function validateActionsCorrection(document) {
  if (
    document?.schema !== "starfiniti.github-actions-policy-correction.v1" ||
    document.status !== "corrected"
  ) {
    fail("Actions correction schema or status differs");
  }
  const startup = document.failClosedEvidence?.pullRequestStartup;
  const attempts = document.failClosedEvidence?.supplyChainSetupAttempts;
  const source = document.failClosedEvidence?.transitiveSourceInspection;
  if (
    startup?.runId !== 33499712113 ||
    startup.event !== "pull_request" ||
    startup.headCommit !== "ac2ad6c901ebad6d6d2f38b890e0913bfb2f942c" ||
    startup.conclusion !== "startup_failure" ||
    startup.jobCount !== 0 ||
    !Array.isArray(attempts) ||
    attempts.length !== 2 ||
    attempts[0]?.attempt !== 1 ||
    attempts[0].jobId !== 99830334324 ||
    attempts[0].conclusion !== "failure" ||
    attempts[0].stage !== "Set up job" ||
    attempts[1]?.attempt !== 2 ||
    attempts[1].jobId !== 99832633787 ||
    attempts[1].conclusion !== "failure" ||
    attempts[1].stage !== "Set up job"
  ) {
    fail("Actions correction negative run chronology differs");
  }
  const attemptOneActions = attempts[0].disallowedActions?.map(
    (action) => action.action,
  );
  const attemptTwoActions = attempts[1].disallowedActions?.map(
    (action) => action.action,
  );
  if (
    JSON.stringify(attemptOneActions) !==
      JSON.stringify(["aquasecurity/setup-trivy", "actions/cache"]) ||
    JSON.stringify(attemptTwoActions) !==
      JSON.stringify(["actions/cache/restore"]) ||
    source?.repository !== "aquasecurity/setup-trivy" ||
    source.commit !== "3fb12ec12f41e471780db15c232d5dd185dcb514" ||
    source.path !== "action.yaml" ||
    JSON.stringify(source.resolvedActions?.map((action) => action.action)) !==
      JSON.stringify([
        "actions/cache/restore",
        "actions/checkout",
        "actions/cache/save",
      ]) ||
    document.failClosedEvidence.finding !==
      "Repository-level CodeQL matching did not admit public sub-action references, direct workflow inventory omitted two full-SHA composite dependencies, and the first transitive correction did not include public cache restore/save sub-actions from the pinned setup-trivy source."
  ) {
    fail("Actions correction transitive dependency evidence differs");
  }

  const policy = document.correctedActionsPolicy;
  if (
    policy?.enabled !== true ||
    policy.allowedActions !== "selected" ||
    policy.shaPinningRequired !== true ||
    policy.githubOwnedAllowed !== false ||
    policy.verifiedCreatorsAllowed !== false ||
    JSON.stringify(policy.patternsAllowed) !==
      JSON.stringify(requiredActionsPolicyPatterns) ||
    policy.directWorkflowActionReferences !== 41 ||
    policy.uniqueDirectWorkflowActionReferences !== 9 ||
    policy.observedTransitiveActionReferences !== 5 ||
    policy.newlyRequiredTransitivePolicyPatterns !== 4 ||
    policy.unpinnedResolvedActionReferences !== 0
  ) {
    fail("Actions correction selected-actions policy differs");
  }

  const verification = document.verification;
  if (
    verification?.runId !== 33499821641 ||
    verification.attempt !== 3 ||
    verification.event !== "workflow_dispatch" ||
    verification.headCommit !== "ac2ad6c901ebad6d6d2f38b890e0913bfb2f942c" ||
    verification.supplyChainJobId !== 99833061733 ||
    verification.supplyChainConclusion !== "success" ||
    verification.policyCorrected !== true ||
    verification.fullSecurityEvidenceClaimed !== false
  ) {
    fail("Actions correction successful verification differs");
  }
  if (
    document.releaseBoundary?.workflowId !== 333373957 ||
    document.releaseBoundary.workflowState !== "disabled_manually" ||
    document.releaseBoundary.releaseCreated !== false ||
    document.releaseBoundary.deploymentChanged !== false ||
    document.releaseBoundary.productionChanged !== false ||
    document.mutation?.implicitGitHubOwnedTrustEnabled !== false ||
    document.mutation.verifiedCreatorTrustEnabled !== false ||
    document.mutation.shaPinningDisabled !== false ||
    document.mutation.workflowEnabled !== false ||
    document.mutation.releaseCreated !== false ||
    document.mutation.deploymentChanged !== false ||
    document.mutation.productionChanged !== false
  ) {
    fail("Actions correction authority boundary differs");
  }
}

function validateRegistryV2(document, reader = readRegularRepositoryFile) {
  exactKeys(
    document,
    new Set([
      "schema",
      "status",
      "observedAt",
      "supersedes",
      "policy",
      "failures",
    ]),
    "V2 registry",
  );
  if (
    document.schema !== "starfiniti.recurring-failure-registry.v2" ||
    document.status !== "in_progress"
  ) {
    fail("V2 registry schema or status differs");
  }
  const registryObservedAt = exactUtc(
    document.observedAt,
    "V2 registry observedAt",
  );
  exactKeys(
    document.supersedes,
    new Set(["registry", "decision"]),
    "V2 registry supersedes",
  );
  exactKeys(
    document.supersedes.registry,
    new Set(["schema", "path", "sha256"]),
    "V2 legacy registry binding",
  );
  if (
    document.supersedes.registry.schema !== requiredLegacyRegistry.schema ||
    document.supersedes.registry.path !== requiredLegacyRegistry.path ||
    document.supersedes.registry.sha256 !== requiredLegacyRegistry.sha256
  ) {
    fail("V2 legacy registry binding differs");
  }
  validateBoundReference(
    {
      path: document.supersedes.registry.path,
      sha256: document.supersedes.registry.sha256,
    },
    reader,
    "V2 legacy registry",
  );
  const legacy = YAML.parse(reader(document.supersedes.registry.path));
  validateLegacyRegistry(legacy, reader);
  if (
    document.supersedes.decision.path !== requiredSupersedingDecision.path ||
    document.supersedes.decision.sha256 !== requiredSupersedingDecision.sha256
  ) {
    fail("V2 superseding decision differs");
  }
  validateBoundReference(
    document.supersedes.decision,
    reader,
    "V2 superseding decision",
  );

  exactKeys(
    document.policy,
    new Set([
      "thresholdOccurrences",
      "allowedControls",
      "evidenceDigestsRequired",
      "candidateCannotClaimMergeOrActivation",
      "exhaustiveDiscoveryClaimsAllowed",
    ]),
    "V2 registry policy",
  );
  if (
    document.policy.thresholdOccurrences !== 2 ||
    document.policy.evidenceDigestsRequired !== true ||
    document.policy.candidateCannotClaimMergeOrActivation !== true ||
    document.policy.exhaustiveDiscoveryClaimsAllowed !== false
  ) {
    fail("V2 registry policy differs");
  }
  exactSet(
    uniqueStrings(document.policy.allowedControls, "V2 allowed controls"),
    allowedControls,
    "V2 allowed controls",
  );

  if (!Array.isArray(document.failures) || document.failures.length !== 2) {
    fail("V2 registry requires exactly the two reviewed failures");
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
        "current",
        "remainingGates",
      ]),
      "V2 failure",
    );
    if (
      typeof failure.fingerprint !== "string" ||
      failure.fingerprint.length < 20 ||
      fingerprints.has(failure.fingerprint) ||
      !/^R-\d{3}$/u.test(failure.riskId ?? "") ||
      !["Critical", "High", "Medium", "Low"].includes(failure.severity) ||
      ![
        "control_candidate",
        "merged_pending_activation",
        "active_observation",
        "closed_observed",
      ].includes(failure.state) ||
      typeof failure.summary !== "string" ||
      failure.summary.length < 40
    ) {
      fail("V2 failure identity is incomplete or duplicated");
    }
    fingerprints.add(failure.fingerprint);

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
    const controlPaths = new Set();
    for (const control of failure.controls) {
      exactKeys(
        control,
        new Set([
          "id",
          "type",
          "reference",
          "deliveryStatus",
          "mergeEvidence",
          "activationEvidence",
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
      if (controlPaths.has(control.reference.path)) {
        fail(`${failure.fingerprint} control reference is duplicated`);
      }
      controlPaths.add(control.reference.path);
      for (const [name, proof] of [
        ["merge", control.mergeEvidence],
        ["activation", control.activationEvidence],
        ["observation", control.observationEvidence],
      ]) {
        validateProof(
          proof,
          reader,
          `${failure.fingerprint}.${control.id} ${name} evidence`,
        );
      }
      if (
        control.deliveryStatus === "candidate" &&
        (control.mergeEvidence !== null ||
          control.activationEvidence !== null ||
          control.observationEvidence !== null)
      ) {
        fail(
          `${failure.fingerprint}.${control.id} candidate overclaims delivery`,
        );
      }
      if (
        control.deliveryStatus === "merged" &&
        (control.mergeEvidence === null ||
          control.activationEvidence !== null ||
          control.observationEvidence !== null)
      ) {
        fail(`${failure.fingerprint}.${control.id} merged evidence differs`);
      }
      if (
        control.deliveryStatus === "active" &&
        (control.mergeEvidence === null || control.activationEvidence === null)
      ) {
        fail(
          `${failure.fingerprint}.${control.id} active evidence is incomplete`,
        );
      }
      const proofs = [
        control.reference,
        control.mergeEvidence,
        control.activationEvidence,
        control.observationEvidence,
      ].filter((proof) => proof !== null);
      if (
        new Set(proofs.map((proof) => proof.path)).size !== proofs.length ||
        new Set(proofs.map((proof) => proof.sha256)).size !== proofs.length
      ) {
        fail(
          `${failure.fingerprint}.${control.id} delivery evidence is reused`,
        );
      }
    }

    exactKeys(
      failure.current,
      new Set([
        "defectPresent",
        "externalControlActive",
        "observationComplete",
        "lastVerifiedAt",
        "evidence",
        "negativeEvidenceRetained",
        "exhaustiveDiscoveryClaimed",
        "authority",
      ]),
      `${failure.fingerprint} current state`,
    );
    const currentObservedAt = exactUtc(
      failure.current.lastVerifiedAt,
      `${failure.fingerprint} current lastVerifiedAt`,
    );
    if (
      currentObservedAt > registryObservedAt ||
      failure.current.negativeEvidenceRetained !== true ||
      failure.current.exhaustiveDiscoveryClaimed !== false
    ) {
      fail(`${failure.fingerprint} current evidence boundary differs`);
    }
    validateBoundReference(
      failure.current.evidence,
      reader,
      `${failure.fingerprint} current evidence`,
      true,
    );
    exactKeys(
      failure.current.authority,
      new Set([
        "productionMutation",
        "releaseEnabled",
        "releaseCreated",
        "deploymentChanged",
        "protectedValueChanged",
      ]),
      `${failure.fingerprint} authority`,
    );
    if (
      Object.values(failure.current.authority).some((value) => value !== false)
    ) {
      fail(`${failure.fingerprint} overclaims external authority`);
    }
    if (
      failure.state === "control_candidate" &&
      (failure.current.observationComplete !== false ||
        failure.controls.some(
          (control) => control.deliveryStatus !== "candidate",
        ))
    ) {
      fail(`${failure.fingerprint} candidate state differs`);
    }
    if (
      failure.state === "merged_pending_activation" &&
      (failure.current.defectPresent !== true ||
        failure.current.externalControlActive !== false ||
        failure.current.observationComplete !== false ||
        failure.controls.some((control) => control.deliveryStatus !== "merged"))
    ) {
      fail(`${failure.fingerprint} merged state differs`);
    }
    if (
      failure.state === "active_observation" &&
      (failure.current.defectPresent !== false ||
        failure.current.externalControlActive !== true ||
        failure.current.observationComplete !== false ||
        failure.controls.some((control) => control.deliveryStatus !== "active"))
    ) {
      fail(`${failure.fingerprint} active state differs`);
    }
    if (
      failure.state === "closed_observed" &&
      (failure.current.defectPresent !== false ||
        failure.current.externalControlActive !== true ||
        failure.current.observationComplete !== true ||
        failure.controls.some(
          (control) =>
            control.deliveryStatus !== "active" ||
            control.observationEvidence === null,
        ))
    ) {
      fail(`${failure.fingerprint} closed state differs`);
    }
    uniqueStrings(
      failure.remainingGates,
      `${failure.fingerprint} remaining gates`,
    );
  }

  exactSet(
    fingerprints,
    new Set([requiredRecoveryFingerprint, requiredActionsFingerprint]),
    "V2 required failure fingerprints",
  );
  const recovery = document.failures.find(
    (failure) => failure.fingerprint === requiredRecoveryFingerprint,
  );
  if (
    recovery.riskId !== "R-004" ||
    recovery.severity !== "Critical" ||
    recovery.state !== "merged_pending_activation" ||
    recovery.occurrences.length !== 2 ||
    recovery.decision.path !==
      "docs/architecture/ADR/0071-dedicated-postgresql-borg-repository.md" ||
    recovery.implementation.path !==
      "infrastructure/environments/proxmox/scripts/starfiniti-loyalty-postgres-borg-controller"
  ) {
    fail("V2 recovery recurrence record differs");
  }
  exactSet(
    new Set(recovery.controls.map((control) => control.reference.path)),
    requiredRecoveryControlPaths,
    "V2 recovery controls",
  );
  for (const control of recovery.controls) {
    if (
      control.type !==
        requiredRecoveryControlTypes.get(control.reference.path) ||
      control.deliveryStatus !== "merged" ||
      control.mergeEvidence?.path !== requiredMergeEvidence.path ||
      control.mergeEvidence?.sha256 !== requiredMergeEvidence.sha256 ||
      control.activationEvidence !== null ||
      control.observationEvidence !== null
    ) {
      fail("V2 recovery control delivery differs");
    }
    validateCommittedFileDigest(
      requiredMergeCommit,
      control.reference,
      `V2 recovery ${control.id}`,
    );
  }
  exactSet(
    new Set(recovery.occurrences.map((occurrence) => occurrence.id)),
    new Set(requiredRecoveryOccurrences.keys()),
    "V2 recovery occurrences",
  );
  for (const occurrence of recovery.occurrences) {
    const expected = requiredRecoveryOccurrences.get(occurrence.id);
    if (
      occurrence.observedAt !== expected.observedAt ||
      occurrence.evidence.path !==
        "docs/plan/evidence/M01/backup-transfer-amplification-2026-08-14.md" ||
      occurrence.evidence.anchor !== expected.anchor
    ) {
      fail("V2 recovery occurrence differs");
    }
  }
  if (
    recovery.current.defectPresent !== true ||
    recovery.current.externalControlActive !== false ||
    recovery.current.observationComplete !== false ||
    recovery.current.evidence.path !==
      "docs/plan/evidence/M01/backup-transfer-amplification-2026-08-14.md" ||
    recovery.current.evidence.anchor !==
      "## Repeat off-site lock starvation — 2026-08-31 13:50 CEST"
  ) {
    fail("V2 recovery current state differs");
  }
  exactSet(
    new Set(recovery.remainingGates),
    requiredRecoveryGates,
    "V2 recovery remaining gates",
  );

  const actions = document.failures.find(
    (failure) => failure.fingerprint === requiredActionsFingerprint,
  );
  if (
    actions.riskId !== "R-065" ||
    actions.severity !== "Critical" ||
    actions.state !== "control_candidate" ||
    actions.occurrences.length !== 3 ||
    actions.decision.path !==
      "docs/architecture/ADR/0118-transitive-github-actions-policy-correction.md" ||
    actions.implementation.path !== ".github/workflows/release.yml"
  ) {
    fail("GitHub Actions recurrence record differs");
  }
  exactSet(
    new Set(actions.occurrences.map((occurrence) => occurrence.id)),
    new Set(requiredActionsOccurrences.keys()),
    "GitHub Actions recurrence occurrences",
  );
  for (const occurrence of actions.occurrences) {
    const expected = requiredActionsOccurrences.get(occurrence.id);
    if (
      occurrence.observedAt !== expected.observedAt ||
      occurrence.evidence.path !== actionsCorrectionPath ||
      occurrence.evidence.anchor !== expected.anchor
    ) {
      fail("GitHub Actions recurrence occurrence differs");
    }
  }
  exactSet(
    new Set(actions.controls.map((control) => control.reference.path)),
    new Set(requiredActionsControlPaths.keys()),
    "GitHub Actions recurrence controls",
  );
  for (const control of actions.controls) {
    if (
      control.type !==
        requiredActionsControlPaths.get(control.reference.path) ||
      control.deliveryStatus !== "candidate" ||
      control.mergeEvidence !== null ||
      control.activationEvidence !== null ||
      control.observationEvidence !== null
    ) {
      fail("GitHub Actions recurrence control delivery differs");
    }
  }
  if (
    actions.current.defectPresent !== false ||
    actions.current.externalControlActive !== true ||
    actions.current.observationComplete !== false ||
    actions.current.lastVerifiedAt !== "2026-09-01T11:11:22Z" ||
    actions.current.evidence.path !== actionsCorrectionPath ||
    actions.current.evidence.anchor !== "correctedActionsPolicy:" ||
    actions.current.negativeEvidenceRetained !== true ||
    actions.current.exhaustiveDiscoveryClaimed !== false
  ) {
    fail("GitHub Actions recurrence current state differs");
  }
  exactSet(
    new Set(actions.remainingGates),
    requiredActionsGates,
    "GitHub Actions recurrence remaining gates",
  );
  validateActionsCorrection(YAML.parse(reader(actionsCorrectionPath)));
}

function selfTestLegacyRegistry(registry) {
  validateLegacyRegistry(structuredClone(registry));
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
      "merged proof omission",
      (value) => (value.failures[0].controls[0].mergeEvidence = null),
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
      validateLegacyRegistry(candidate);
    } catch {
      rejected = true;
    }
    if (!rejected) fail(`self-test accepted ${label}`);
  }
  let mergedControlDriftRejected = false;
  try {
    validateCommittedFileDigest(
      requiredMergeCommit,
      {
        path: "scripts/validate-backup-assets.mjs",
        sha256: "0".repeat(64),
      },
      "self-test merged control",
    );
  } catch {
    mergedControlDriftRejected = true;
  }
  if (!mergedControlDriftRejected) {
    fail("self-test accepted merged control byte drift");
  }
  return cases.length + 1;
}

function selfTestRegistryV2(registry) {
  validateRegistryV2(structuredClone(registry));
  const recoveryIndex = registry.failures.findIndex(
    (failure) => failure.fingerprint === requiredRecoveryFingerprint,
  );
  const actionsIndex = registry.failures.findIndex(
    (failure) => failure.fingerprint === requiredActionsFingerprint,
  );
  const cases = [
    ["V2 schema drift", (value) => (value.schema = "v1")],
    [
      "legacy registry digest drift",
      (value) => (value.supersedes.registry.sha256 = "0".repeat(64)),
    ],
    [
      "superseding decision drift",
      (value) => (value.supersedes.decision.sha256 = "f".repeat(64)),
    ],
    ["V2 threshold drift", (value) => (value.policy.thresholdOccurrences = 3)],
    [
      "exhaustive discovery policy enabled",
      (value) => (value.policy.exhaustiveDiscoveryClaimsAllowed = true),
    ],
    [
      "recovery recurrence erased",
      (value) => value.failures[recoveryIndex].occurrences.pop(),
    ],
    [
      "Actions startup occurrence erased",
      (value) => value.failures[actionsIndex].occurrences.shift(),
    ],
    [
      "Actions first setup occurrence erased",
      (value) => value.failures[actionsIndex].occurrences.splice(1, 1),
    ],
    [
      "Actions second setup occurrence erased",
      (value) => value.failures[actionsIndex].occurrences.pop(),
    ],
    [
      "Actions chronology reversed",
      (value) =>
        (value.failures[actionsIndex].occurrences[2].observedAt =
          "2026-09-01T10:54:00Z"),
    ],
    [
      "Actions occurrence anchor reused",
      (value) =>
        (value.failures[actionsIndex].occurrences[2].evidence.anchor =
          value.failures[actionsIndex].occurrences[1].evidence.anchor),
    ],
    [
      "Actions negative evidence relabelled",
      (value) =>
        (value.failures[actionsIndex].current.negativeEvidenceRetained = false),
    ],
    [
      "automatic exhaustive discovery overclaim",
      (value) =>
        (value.failures[actionsIndex].current.exhaustiveDiscoveryClaimed =
          true),
    ],
    [
      "Actions durable control erased",
      (value) => value.failures[actionsIndex].controls.pop(),
    ],
    [
      "Actions candidate merge overclaim",
      (value) =>
        (value.failures[actionsIndex].controls[0].deliveryStatus = "merged"),
    ],
    [
      "Actions control byte drift",
      (value) =>
        (value.failures[actionsIndex].controls[0].reference.sha256 = "0".repeat(
          64,
        )),
    ],
    [
      "Actions release authority overclaim",
      (value) =>
        (value.failures[actionsIndex].current.authority.releaseEnabled = true),
    ],
    [
      "Actions deployment authority overclaim",
      (value) =>
        (value.failures[actionsIndex].current.authority.deploymentChanged =
          true),
    ],
    [
      "Actions external control erased",
      (value) =>
        (value.failures[actionsIndex].current.externalControlActive = false),
    ],
    [
      "Actions successful observation overclaim",
      (value) =>
        (value.failures[actionsIndex].current.observationComplete = true),
    ],
    [
      "unknown third failure",
      (value) => value.failures.push(value.failures[0]),
    ],
  ];
  for (const [label, mutate] of cases) {
    const candidate = structuredClone(registry);
    mutate(candidate);
    let rejected = false;
    try {
      validateRegistryV2(candidate);
    } catch {
      rejected = true;
    }
    if (!rejected) fail(`self-test accepted ${label}`);
  }

  const correctionCases = [
    [
      "startup failure erased from source evidence",
      (value) =>
        (value.failClosedEvidence.pullRequestStartup.conclusion = "success"),
    ],
    [
      "first setup failure erased from source evidence",
      (value) => value.failClosedEvidence.supplyChainSetupAttempts.shift(),
    ],
    [
      "cache restore failure erased from source evidence",
      (value) =>
        (value.failClosedEvidence.supplyChainSetupAttempts[1].disallowedActions =
          []),
    ],
    [
      "cache save source dependency erased",
      (value) =>
        value.failClosedEvidence.transitiveSourceInspection.resolvedActions.pop(),
    ],
    [
      "broad GitHub-owned trust enabled",
      (value) => (value.correctedActionsPolicy.githubOwnedAllowed = true),
    ],
    [
      "verified-creator trust enabled",
      (value) => (value.correctedActionsPolicy.verifiedCreatorsAllowed = true),
    ],
    [
      "full-SHA pinning disabled",
      (value) => (value.correctedActionsPolicy.shaPinningRequired = false),
    ],
    [
      "thirteen-pattern policy drift",
      (value) => value.correctedActionsPolicy.patternsAllowed.pop(),
    ],
    [
      "successful correction erased",
      (value) => (value.verification.supplyChainConclusion = "failure"),
    ],
    [
      "failed attempts relabelled as completion",
      (value) => (value.verification.fullSecurityEvidenceClaimed = true),
    ],
    [
      "Release enabled through correction evidence",
      (value) => (value.releaseBoundary.workflowState = "active"),
    ],
  ];
  for (const [label, mutate] of correctionCases) {
    const candidate = structuredClone(registry);
    const correction = YAML.parse(
      readRegularRepositoryFile(actionsCorrectionPath),
    );
    mutate(correction);
    const correctionBytes = YAML.stringify(correction);
    const correctionDigest = digest(correctionBytes);
    const actions = candidate.failures.find(
      (failure) => failure.fingerprint === requiredActionsFingerprint,
    );
    for (const occurrence of actions.occurrences) {
      occurrence.evidence.sha256 = correctionDigest;
    }
    actions.current.evidence.sha256 = correctionDigest;
    const reader = (path) =>
      path === actionsCorrectionPath
        ? correctionBytes
        : readRegularRepositoryFile(path);
    let rejected = false;
    try {
      validateRegistryV2(candidate, reader);
    } catch {
      rejected = true;
    }
    if (!rejected) fail(`self-test accepted ${label}`);
  }
  return cases.length + correctionCases.length;
}

function selfTestMainIntegration(mainIntegration) {
  validateMainIntegrationEvidence(structuredClone(mainIntegration));
  const cases = [
    [
      "main integration ancestry overclaim",
      (value) => (value.main.reviewedHeadIsAncestor = false),
    ],
    [
      "main integration failed run",
      (value) => (value.main.security.conclusion = "failure"),
    ],
    [
      "main integration release overclaim",
      (value) => (value.release.releaseForMergeCommit = true),
    ],
    [
      "main integration deployment overclaim",
      (value) => (value.production.deploymentChanged = true),
    ],
    [
      "main integration value overclaim",
      (value) => (value.production.loyaltyValueChanged = true),
    ],
  ];
  for (const [label, mutate] of cases) {
    const candidate = structuredClone(mainIntegration);
    mutate(candidate);
    let rejected = false;
    try {
      validateMainIntegrationEvidence(candidate);
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
      "supersedes",
      "evidenceDigestsRequired",
      "candidateCannotClaimMergeOrActivation",
      "exhaustiveDiscoveryClaimsAllowed",
    ]),
    "continuous-improvement plan registry",
  );
  if (
    recurring.registry.schema !== "starfiniti.recurring-failure-registry.v2" ||
    recurring.registry.path !== registryPath ||
    recurring.registry.evidenceDigestsRequired !== true ||
    recurring.registry.candidateCannotClaimMergeOrActivation !== true ||
    recurring.registry.exhaustiveDiscoveryClaimsAllowed !== false
  ) {
    fail("continuous-improvement plan registry binding differs");
  }
  exactKeys(
    recurring.registry.supersedes,
    new Set(["schema", "path", "sha256"]),
    "continuous-improvement plan legacy registry binding",
  );
  if (
    recurring.registry.supersedes.schema !== requiredLegacyRegistry.schema ||
    recurring.registry.supersedes.path !== requiredLegacyRegistry.path ||
    recurring.registry.supersedes.sha256 !== requiredLegacyRegistry.sha256
  ) {
    fail("continuous-improvement plan legacy registry binding differs");
  }
}

const args = process.argv.slice(2);
if (args.some((argument) => argument !== "--self-test")) {
  fail(
    "usage: node scripts/validate-recurring-failure-registry.mjs [--self-test]",
  );
}
const legacyRegistry = YAML.parse(
  readRegularRepositoryFile(legacyRegistryPath),
);
const registry = YAML.parse(readRegularRepositoryFile(registryPath));
const plan = YAML.parse(readRegularRepositoryFile(planPath));
const mainIntegration = YAML.parse(
  readRegularRepositoryFile(mainIntegrationPath),
);
validatePlanBinding(plan);
validateMainIntegrationEvidence(mainIntegration);
validateLegacyRegistry(legacyRegistry);
validateRegistryV2(registry);
let caseCount = 0;
if (args.includes("--self-test")) {
  caseCount = selfTestLegacyRegistry(legacyRegistry);
  caseCount += selfTestRegistryV2(registry);
  caseCount += selfTestMainIntegration(mainIntegration);
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
  `Recurring-failure registry validated (${registry.failures.length} failures, ${registry.failures.reduce((total, failure) => total + failure.occurrences.length, 0)} occurrences${caseCount ? `, ${caseCount} adversarial cases` : ""}).`,
);
