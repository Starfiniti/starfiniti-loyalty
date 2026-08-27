import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const evidencePath = join(root, "docs/plan/evidence/M15/security.yaml");
const planPath = join(
  root,
  "infrastructure/testing/security/zap-automation.yaml",
);
const tasksPath = join(root, "docs/plan/TASKS.yaml");
const risksPath = join(root, "RISKS.md");
const evidence = YAML.parse(readFileSync(evidencePath, "utf8"));
const plan = YAML.parse(readFileSync(planPath, "utf8"));
const tasks = YAML.parse(readFileSync(tasksPath, "utf8"));
const risksText = readFileSync(risksPath, "utf8");

const requiredChecks = new Set([
  "workflow_contract",
  "immutable_tool_inputs",
  "deployable_image_boundary",
  "isolated_dast_plan",
  "release_evidence_contract",
  "fail_closed_manifest",
  "exact_head_ci",
  "codeql_sast",
  "repository_secret_misconfiguration_scan",
  "dashboard_image_scan",
  "worker_image_scan",
  "dashboard_sbom",
  "worker_sbom",
  "disposable_dast",
  "scanner_database_freshness",
  "release_sbom_verification",
  "release_file_attestations",
  "release_image_attestations",
  "production_configuration_review",
  "independent_penetration_test",
  "penetration_retest",
  "critical_high_findings_zero",
  "medium_and_false_positive_review",
  "development_advisory_resolved",
  "security_owner_approval",
]);
const allowedStatuses = new Set(["passed", "pending", "failed"]);
const expectedTools = {
  codeqlAction: "4.37.9",
  trivyAction: "0.36.0",
  trivy: "0.74.0",
  sbomAction: "0.24.0",
  syft: "1.51.0",
  zap: "2.17.0",
  uploadArtifactAction: "7.0.1",
  attestBuildProvenanceAction: "4.2.2",
};
const artifactKeys = [
  "securityRunPath",
  "securityRunSha256",
  "releaseVerificationPath",
  "releaseVerificationSha256",
  "productionReviewPath",
  "productionReviewSha256",
  "penetrationTestPath",
  "penetrationTestSha256",
  "findingRegisterPath",
  "findingRegisterSha256",
];
const pendingLanguagePattern =
  /\b(await|pending|remain|requires?|must|not yet|has not|will|future|todo)\b/iu;
const uuidPattern =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/iu;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu;
const credentialPattern =
  /\b(?:sflt_v1_[0-9a-f]{32}_[A-Za-z0-9_-]{43}|sk_(?:live|test)_[A-Za-z0-9]{16,}|whsec_[A-Za-z0-9]{16,})\b/u;
const forbiddenEvidenceKeyPattern =
  /(?:secret|password|authorization|cookie|requestbody|responsebody|rawbody|payload|customerid|connectionid|servicekey)$/iu;

function fail(message) {
  throw new Error(`Security evidence invalid: ${message}`);
}

function exactUtc(value, label) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    fail(`${label} must be an exact UTC timestamp`);
  }
}

function rawDigest(relativePath) {
  return createHash("sha256")
    .update(readFileSync(join(root, relativePath)))
    .digest("hex");
}

function scanSensitive(value, path = "evidence") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanSensitive(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (forbiddenEvidenceKeyPattern.test(key)) {
        fail(`forbidden sensitive key ${path}.${key}`);
      }
      scanSensitive(item, `${path}.${key}`);
    }
    return;
  }
  if (typeof value !== "string") return;
  if (uuidPattern.test(value)) fail(`raw resource identifier in ${path}`);
  if (emailPattern.test(value)) fail(`email identity in ${path}`);
  if (credentialPattern.test(value)) fail(`credential-shaped value in ${path}`);
}

function validateZapPlan(candidatePlan) {
  const context = candidatePlan?.env?.contexts;
  if (
    !Array.isArray(context) ||
    context.length !== 1 ||
    context[0]?.name !== "starfiniti-disposable-dashboard" ||
    context[0]?.urls?.length !== 1 ||
    context[0].urls[0] !== "http://starfiniti-dast-target:3000/login" ||
    candidatePlan.env?.parameters?.failOnError !== true ||
    candidatePlan.env?.parameters?.failOnWarning !== false
  ) {
    fail("ZAP environment is not the exact disposable target");
  }
  const serialized = JSON.stringify(candidatePlan);
  const urls = serialized.match(/https?:\\?\/\\?\/[^"\s,\]]+/gu) ?? [];
  if (
    urls.length === 0 ||
    urls.some(
      (url) =>
        !url
          .replaceAll("\\/", "/")
          .startsWith("http://starfiniti-dast-target:3000/"),
    )
  ) {
    fail("ZAP plan names an origin outside the disposable target");
  }
  const jobs = candidatePlan.jobs;
  const expectedTypes = [
    "spider",
    "passiveScan-wait",
    "activeScan",
    "passiveScan-wait",
    "report",
    "exitStatus",
  ];
  if (
    !Array.isArray(jobs) ||
    jobs.map((job) => job.type).join(",") !== expectedTypes.join(",")
  ) {
    fail("ZAP plan must contain the six ordered canonical jobs");
  }
  const spider = jobs[0].parameters;
  const active = jobs[2].parameters;
  const report = jobs[4].parameters;
  const exit = jobs[5];
  if (
    !Number.isInteger(spider.maxDuration) ||
    spider.maxDuration < 1 ||
    spider.maxDuration > 3 ||
    !Number.isInteger(spider.maxDepth) ||
    spider.maxDepth < 1 ||
    spider.maxDepth > 4 ||
    !Number.isInteger(spider.maxChildren) ||
    spider.maxChildren < 1 ||
    spider.maxChildren > 100 ||
    active.defaultStrength !== "Low" ||
    active.defaultThreshold !== "Medium" ||
    !Number.isInteger(active.maxRuleDurationInMins) ||
    active.maxRuleDurationInMins < 1 ||
    active.maxRuleDurationInMins > 2 ||
    !Number.isInteger(active.maxScanDurationInMins) ||
    active.maxScanDurationInMins < 1 ||
    active.maxScanDurationInMins > 7 ||
    !Number.isInteger(active.delayInMs) ||
    active.delayInMs < 25 ||
    active.handleAntiCSRFTokens !== true ||
    report.template !== "traditional-json" ||
    report.reportDir !== "/zap/wrk/dist/security" ||
    report.reportFile !== "zap-report.json" ||
    exit.alwaysRun !== true ||
    exit.parameters?.errorLevel !== "High" ||
    exit.parameters?.warnLevel !== "Medium" ||
    exit.parameters?.errorExitValue !== 1 ||
    exit.parameters?.warnExitValue !== 0
  ) {
    fail("ZAP bounds report or exit policy drifted");
  }
  for (const wait of [jobs[1], jobs[3]]) {
    if (
      !Number.isInteger(wait.parameters?.maxDuration) ||
      wait.parameters.maxDuration < 1 ||
      wait.parameters.maxDuration > 3
    ) {
      fail("ZAP passive scanner wait is not bounded");
    }
  }
}

function safeEvidencePath(relativePath) {
  if (
    typeof relativePath !== "string" ||
    !/^docs\/plan\/evidence\/M15\/runs\/security-[a-z0-9][a-z0-9-]{2,69}\.yaml$/u.test(
      relativePath,
    )
  ) {
    fail("completion artifact path is not a safe M15 security YAML path");
  }
  const absolute = resolve(root, relativePath);
  const runsRoot = `${resolve(root, "docs/plan/evidence/M15/runs")}${sep}`;
  if (!absolute.startsWith(runsRoot)) {
    fail("completion artifact escapes the M15 evidence directory");
  }
  return absolute;
}

function readBoundArtifact(path, expectedDigest) {
  if (
    typeof expectedDigest !== "string" ||
    !/^[0-9a-f]{64}$/u.test(expectedDigest) ||
    /^0{64}$/u.test(expectedDigest)
  ) {
    fail("completion artifact digest must be exact and nonzero");
  }
  const absolute = safeEvidencePath(path);
  const raw = readFileSync(absolute);
  if (createHash("sha256").update(raw).digest("hex") !== expectedDigest) {
    fail(`completion artifact digest drifted for ${path}`);
  }
  const parsed = YAML.parse(raw.toString("utf8"));
  scanSensitive(parsed, path);
  return parsed;
}

function zeroSeverity(record, label) {
  if (
    record?.critical !== 0 ||
    record?.high !== 0 ||
    !Number.isSafeInteger(record.medium) ||
    record.medium < 0 ||
    !Number.isSafeInteger(record.low) ||
    record.low < 0
  ) {
    fail(
      `${label} severity totals are invalid or not zero for Critical and High`,
    );
  }
}

function validateSecurityRun(run, candidate) {
  if (
    run?.schema !== "starfiniti.security-run-summary.v1" ||
    run.candidateCommit !== candidate.candidate.commit ||
    run.securityWorkflowSha256 !== candidate.inputs.securityWorkflow.sha256 ||
    !Number.isSafeInteger(run.githubRunId) ||
    run.githubRunId < 1 ||
    run.status !== "passed" ||
    run.repositorySecrets !== 0 ||
    run.repositoryMisconfigurationsHigh !== 0 ||
    run.dast?.targetClass !== "disposable_internal" ||
    run.dast?.networkInternal !== true ||
    run.dast?.publishedPorts !== 0 ||
    run.dast?.completed !== true
  ) {
    fail("security run identity isolation or result is invalid");
  }
  exactUtc(run.startedAt, "security run startedAt");
  exactUtc(run.finishedAt, "security run finishedAt");
  exactUtc(run.scannerDatabaseUpdatedAt, "scanner database updatedAt");
  if (
    Date.parse(run.finishedAt) <= Date.parse(run.startedAt) ||
    Date.parse(run.startedAt) - Date.parse(run.scannerDatabaseUpdatedAt) >
      24 * 60 * 60 * 1000
  ) {
    fail("security run interval or scanner database freshness is invalid");
  }
  zeroSeverity(run.codeql, "CodeQL");
  if (
    !Array.isArray(run.images) ||
    run.images.length !== 2 ||
    run.images
      .map((item) => item.id)
      .sort()
      .join(",") !== "dashboard,worker" ||
    run.images.some(
      (item) =>
        !/^sha256:[0-9a-f]{64}$/u.test(item.digest) ||
        !/^[0-9a-f]{64}$/u.test(item.sbomSha256),
    )
  ) {
    fail("security image or SBOM inventory is invalid");
  }
  run.images.forEach((item) => zeroSeverity(item.findings, `${item.id} image`));
  zeroSeverity(run.dast.findings, "DAST");
}

function validateRelease(release, candidate) {
  if (
    release?.schema !== "starfiniti.release-security-verification.v1" ||
    release.candidateCommit !== candidate.candidate.commit ||
    !/^v\d+\.\d+\.\d+$/u.test(release.tag) ||
    release.checksumsVerified !== true ||
    release.fileAttestationsVerified !== 4 ||
    release.imageAttestationsVerified !== 2 ||
    !Array.isArray(release.imageDigests) ||
    release.imageDigests.length !== 2 ||
    release.imageDigests.some(
      (digest) => !/^sha256:[0-9a-f]{64}$/u.test(digest),
    ) ||
    !Array.isArray(release.sbomSha256) ||
    release.sbomSha256.length !== 2 ||
    release.sbomSha256.some((digest) => !/^[0-9a-f]{64}$/u.test(digest))
  ) {
    fail("release security verification is incomplete or inconsistent");
  }
  exactUtc(release.verifiedAt, "release verifiedAt");
}

function validateProductionReview(review, candidate) {
  if (
    review?.schema !== "starfiniti.production-security-review.v1" ||
    review.applicationCommit !==
      candidate.currentProduction.applicationCommit ||
    review.release !== candidate.currentProduction.release ||
    review.approvedWindow !== true ||
    review.nonDestructive !== true ||
    review.activeScanPerformed !== false ||
    review.scope?.sort().join(",") !==
      ["cookies", "egress", "edge", "headers", "secret_mounts", "tls"]
        .sort()
        .join(",")
  ) {
    fail(
      "production review identity scope or non-destructive boundary is invalid",
    );
  }
  exactUtc(review.reviewedAt, "production review reviewedAt");
  zeroSeverity(review.findings, "production review");
}

function validatePenetrationTest(test, candidate) {
  const requiredScope = [
    "application",
    "authorization",
    "billing",
    "connectors",
    "infrastructure",
    "ledger",
    "scim",
    "sso",
    "tenant_isolation",
  ];
  if (
    test?.schema !== "starfiniti.penetration-test-summary.v1" ||
    test.candidateCommit !== candidate.candidate.commit ||
    test.independent !== true ||
    test.retestComplete !== true ||
    typeof test.testerReference !== "string" ||
    test.testerReference.length < 12 ||
    test.scope?.sort().join(",") !== requiredScope.sort().join(",")
  ) {
    fail("independent penetration-test identity scope or retest is invalid");
  }
  exactUtc(test.startedAt, "penetration test startedAt");
  exactUtc(test.retestedAt, "penetration test retestedAt");
  if (Date.parse(test.retestedAt) <= Date.parse(test.startedAt)) {
    fail("penetration-test retest interval is invalid");
  }
  zeroSeverity(test.openFindings, "penetration test");
}

function validateFindingRegister(register, candidate) {
  if (
    register?.schema !== "starfiniti.security-finding-register.v1" ||
    register.candidateCommit !== candidate.candidate.commit ||
    register.mediumTriaged !== true ||
    register.falsePositivesReviewed !== true ||
    register.developmentAuditHigh !== 0 ||
    register.r032Resolved !== true ||
    register.ownerApproved !== true
  ) {
    fail("finding register triage advisory resolution or approval is invalid");
  }
  exactUtc(register.approvedAt, "finding register approvedAt");
  zeroSeverity(register.openFindings, "finding register");
}

export function validateDocument(
  candidate = evidence,
  candidatePlan = plan,
  candidateTasks = tasks,
  candidateRisks = risksText,
) {
  validateZapPlan(candidatePlan);
  if (
    candidate?.schema !== "starfiniti.security-evidence.v1" ||
    !["in_progress", "complete"].includes(candidate.status)
  ) {
    fail("manifest identity or status is invalid");
  }
  exactUtc(candidate.observedAt, "observedAt");
  if (
    !/^v\d+\.\d+\.\d+$/u.test(candidate.currentProduction?.release) ||
    !/^[0-9a-f]{40}$/u.test(candidate.currentProduction?.applicationCommit) ||
    !/^codex\/[a-z0-9][a-z0-9-]{2,99}$/u.test(candidate.candidate?.branch) ||
    !/^[0-9a-f]{40}$/u.test(candidate.candidate?.commit) ||
    /^0{40}$/u.test(candidate.candidate.commit) ||
    typeof candidate.candidate.securityOwnerApproved !== "boolean"
  ) {
    fail("production or candidate identity is invalid");
  }
  const exactInputs = [
    ["securityWorkflow", ".github/workflows/security.yml"],
    ["releaseWorkflow", ".github/workflows/release.yml"],
    ["dastPlan", "infrastructure/testing/security/zap-automation.yaml"],
  ];
  for (const [id, path] of exactInputs) {
    if (
      candidate.inputs?.[id]?.path !== path ||
      candidate.inputs[id].sha256 !== rawDigest(path)
    ) {
      fail(`${id} path or digest drifted`);
    }
  }
  if (
    Object.keys(candidate.inputs?.tools ?? {})
      .sort()
      .join(",") !== Object.keys(expectedTools).sort().join(",") ||
    Object.entries(expectedTools).some(
      ([key, value]) => String(candidate.inputs.tools[key]) !== value,
    )
  ) {
    fail("reviewed security tool versions drifted");
  }
  if (!Array.isArray(candidate.checks)) fail("checks must be an array");
  const seen = new Set();
  for (const check of candidate.checks) {
    if (!requiredChecks.has(check.id)) fail(`unknown check ${check.id}`);
    if (seen.has(check.id)) fail(`duplicate check ${check.id}`);
    seen.add(check.id);
    if (!allowedStatuses.has(check.status))
      fail(`invalid status for ${check.id}`);
    if (
      typeof check.evidence !== "string" ||
      check.evidence.length < 45 ||
      check.evidence.length > 700
    ) {
      fail(`evidence for ${check.id} must be bounded and substantive`);
    }
    if (
      check.status === "passed" &&
      pendingLanguagePattern.test(check.evidence)
    ) {
      fail(`passed check ${check.id} contains forward-looking evidence`);
    }
  }
  const missing = [...requiredChecks].filter((id) => !seen.has(id));
  if (missing.length) fail(`missing check ${missing.join(", ")}`);
  if (
    !Array.isArray(candidate.automaticFails) ||
    candidate.automaticFails.length < 18 ||
    new Set(candidate.automaticFails).size !==
      candidate.automaticFails.length ||
    candidate.automaticFails.some(
      (rule) => typeof rule !== "string" || rule.length < 70,
    )
  ) {
    fail("automatic failures require eighteen unique substantive rules");
  }
  scanSensitive(candidate);
  if (
    Object.keys(candidate.artifacts ?? {})
      .sort()
      .join(",") !== artifactKeys.sort().join(",")
  ) {
    fail("artifact binding shape is invalid");
  }
  const m15 = candidateTasks.tasks?.find(
    (task) => task.id === "M15-GA-HARDENING",
  );
  const s03 = m15?.slices?.find(
    (slice) => slice.id === "M15-S03-SUPPLY-CHAIN-AND-SECURITY",
  );
  if (!m15 || !s03) fail("M15-S03 task graph is missing");
  const incomplete = candidate.checks.filter(
    (check) => check.status !== "passed",
  );
  const artifactValues = Object.values(candidate.artifacts);
  if (candidate.status === "complete") {
    if (
      incomplete.length ||
      candidate.candidate.securityOwnerApproved !== true ||
      artifactValues.some((value) => value === null) ||
      s03.status !== "complete" ||
      m15.status !== "in_progress" ||
      /R-032[^\n]*blocks M15 security gate/iu.test(candidateRisks)
    ) {
      fail(
        "complete security evidence requires every check artifact advisory task and owner gate",
      );
    }
    const securityRun = readBoundArtifact(
      candidate.artifacts.securityRunPath,
      candidate.artifacts.securityRunSha256,
    );
    const release = readBoundArtifact(
      candidate.artifacts.releaseVerificationPath,
      candidate.artifacts.releaseVerificationSha256,
    );
    const production = readBoundArtifact(
      candidate.artifacts.productionReviewPath,
      candidate.artifacts.productionReviewSha256,
    );
    const penetration = readBoundArtifact(
      candidate.artifacts.penetrationTestPath,
      candidate.artifacts.penetrationTestSha256,
    );
    const findings = readBoundArtifact(
      candidate.artifacts.findingRegisterPath,
      candidate.artifacts.findingRegisterSha256,
    );
    validateSecurityRun(securityRun, candidate);
    validateRelease(release, candidate);
    validateProductionReview(production, candidate);
    validatePenetrationTest(penetration, candidate);
    validateFindingRegister(findings, candidate);
  } else if (
    candidate.candidate.securityOwnerApproved !== false ||
    artifactValues.some((value) => value !== null) ||
    s03.status !== "in_progress" ||
    m15.status !== "in_progress"
  ) {
    fail(
      "in-progress security evidence must keep artifacts null and S03 active",
    );
  }
  return { incomplete };
}

const result = validateDocument();

if (process.argv.includes("--self-test")) {
  const expectRejected = (
    candidate,
    message,
    label,
    candidatePlan = plan,
    candidateTasks = tasks,
    candidateRisks = risksText,
  ) => {
    try {
      validateDocument(
        candidate,
        candidatePlan,
        candidateTasks,
        candidateRisks,
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes(message)) return;
      throw error;
    }
    fail(`self-test accepted ${label}`);
  };

  const falseComplete = structuredClone(evidence);
  falseComplete.status = "complete";
  expectRejected(falseComplete, "requires every check", "false completion");

  const missingCheck = structuredClone(evidence);
  missingCheck.checks.pop();
  expectRejected(missingCheck, "missing check", "missing check");

  const duplicateCheck = structuredClone(evidence);
  duplicateCheck.checks.push(structuredClone(duplicateCheck.checks[0]));
  expectRejected(duplicateCheck, "duplicate check", "duplicate check");

  const forwardPass = structuredClone(evidence);
  forwardPass.checks[0].evidence =
    "This workflow contract will be reviewed in a future security run before repository acceptance can occur.";
  expectRejected(forwardPass, "forward-looking", "forward-looking pass");

  const sensitive = structuredClone(evidence);
  sensitive.requestBody = "unsafe";
  expectRejected(sensitive, "forbidden sensitive key", "sensitive key");

  const rawIdentifier = structuredClone(evidence);
  rawIdentifier.checks[0].evidence =
    "Unsafe raw selector 94000000-0000-4000-8000-000000000003 entered the committed security evidence record.";
  expectRejected(rawIdentifier, "raw resource identifier", "raw identifier");

  const digestDrift = structuredClone(evidence);
  digestDrift.inputs.securityWorkflow.sha256 = "f".repeat(64);
  expectRejected(digestDrift, "securityWorkflow path or digest", "input drift");

  const taskDrift = structuredClone(tasks);
  taskDrift.tasks
    .find((task) => task.id === "M15-GA-HARDENING")
    .slices.find(
      (slice) => slice.id === "M15-S03-SUPPLY-CHAIN-AND-SECURITY",
    ).status = "planned";
  expectRejected(evidence, "S03 active", "task drift", plan, taskDrift);

  const unsafePlan = structuredClone(plan);
  unsafePlan.env.contexts[0].urls[0] = "https://loyalty.example.test";
  expectRejected(
    evidence,
    "exact disposable target",
    "public DAST target",
    unsafePlan,
  );

  const unboundedPlan = structuredClone(plan);
  unboundedPlan.jobs[2].parameters.maxScanDurationInMins = 60;
  expectRejected(
    evidence,
    "bounds report or exit policy",
    "unbounded active scan",
    unboundedPlan,
  );

  const weakFailures = structuredClone(evidence);
  weakFailures.automaticFails = weakFailures.automaticFails.slice(0, 5);
  expectRejected(weakFailures, "eighteen unique", "weak failure rules");
}

console.log(
  `Validated ${evidence.checks.length} M15 security checks and the isolated six-job DAST plan; ${evidence.checks.filter((check) => check.status === "passed").length} passed and ${result.incomplete.length} remain non-passing.`,
);
