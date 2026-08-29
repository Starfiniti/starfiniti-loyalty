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
const prototypeMessageSources = {
  deckStage: readFileSync(
    join(root, "docs/design/prototype-source/deck-stage.js"),
    "utf8",
  ),
  support: readFileSync(
    join(root, "docs/design/prototype-source/support.js"),
    "utf8",
  ),
};

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
  "dashboard_response_security_headers",
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
const expectedReleaseFiles = [
  "SHA256SUMS",
  "loyalty-dashboard.cdx.json",
  "loyalty-worker.cdx.json",
  "starfiniti-loyalty-source-manifest.json",
  "starfiniti-loyalty-source.tar.gz",
  "starfiniti-loyalty-third-party-notices.md",
  "starfiniti-loyalty.zip",
].sort();
const pendingLanguagePattern =
  /\b(await|pending|remain|requires?|must|not yet|has not|will|future|todo)\b/iu;
const uuidPattern =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/iu;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu;
const credentialPattern =
  /\b(?:sflt_v1_[0-9a-f]{32}_[A-Za-z0-9_-]{43}|sk_(?:live|test)_[A-Za-z0-9]{16,}|whsec_[A-Za-z0-9]{16,})\b/u;
const forbiddenEvidenceKeyPattern =
  /(?:secret|password|authorization|cookie|requestbody|responsebody|rawbody|payload|customerid|connectionid|servicekey)$/iu;
const expectedMediumFindings = [
  [
    "alpine-baselayout-gpl-2-only",
    "alpine-baselayout",
    "3.7.2-r1",
    "GPL-2.0-only",
    ["dashboard", "worker"],
    "release_obligation_open",
  ],
  [
    "alpine-baselayout-data-gpl-2-only",
    "alpine-baselayout-data",
    "3.7.2-r1",
    "GPL-2.0-only",
    ["dashboard", "worker"],
    "release_obligation_open",
  ],
  [
    "apk-tools-gpl-2-only",
    "apk-tools",
    "3.0.6-r0",
    "GPL-2.0-only",
    ["dashboard", "worker"],
    "release_obligation_open",
  ],
  [
    "busybox-gpl-2-only",
    "busybox",
    "1.37.0-r31",
    "GPL-2.0-only",
    ["dashboard", "worker"],
    "release_obligation_open",
  ],
  [
    "busybox-binsh-gpl-2-only",
    "busybox-binsh",
    "1.37.0-r31",
    "GPL-2.0-only",
    ["dashboard", "worker"],
    "release_obligation_open",
  ],
  [
    "ca-certificates-bundle-mpl-2",
    "ca-certificates-bundle",
    "20260611-r0",
    "MPL-2.0",
    ["dashboard", "worker"],
    "release_obligation_open",
  ],
  [
    "libapk-gpl-2-only",
    "libapk",
    "3.0.6-r0",
    "GPL-2.0-only",
    ["dashboard", "worker"],
    "release_obligation_open",
  ],
  [
    "libgcc-gpl-2-or-later",
    "libgcc",
    "15.2.0-r5",
    "GPL-2.0-or-later",
    ["dashboard", "worker"],
    "release_obligation_open",
  ],
  [
    "libgcc-lgpl-2-1-or-later",
    "libgcc",
    "15.2.0-r5",
    "LGPL-2.1-or-later",
    ["dashboard", "worker"],
    "release_obligation_open",
  ],
  [
    "libstdcxx-gpl-2-or-later",
    "libstdc++",
    "15.2.0-r5",
    "GPL-2.0-or-later",
    ["dashboard", "worker"],
    "release_obligation_open",
  ],
  [
    "libstdcxx-lgpl-2-1-or-later",
    "libstdc++",
    "15.2.0-r5",
    "LGPL-2.1-or-later",
    ["dashboard", "worker"],
    "release_obligation_open",
  ],
  [
    "musl-utils-gpl-2-or-later",
    "musl-utils",
    "1.2.6-r2",
    "GPL-2.0-or-later",
    ["dashboard", "worker"],
    "release_obligation_open",
  ],
  [
    "scanelf-gpl-2-only",
    "scanelf",
    "1.3.9-r1",
    "GPL-2.0-only",
    ["dashboard", "worker"],
    "release_obligation_open",
  ],
  [
    "ssl-client-gpl-2-only",
    "ssl_client",
    "1.37.0-r31",
    "GPL-2.0-only",
    ["dashboard", "worker"],
    "release_obligation_open",
  ],
  [
    "starfiniti-dashboard-agpl-3-or-later",
    "@starfiniti/dashboard",
    "0.0.0",
    "AGPL-3.0-or-later",
    ["dashboard"],
    "source_available",
  ],
].map(([id, packageName, version, license, images, disposition]) => ({
  id,
  package: packageName,
  version,
  license,
  images,
  rawOccurrences: images.length,
  disposition,
}));

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

function exactKeys(value, keys, label) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(",") !== [...keys].sort().join(",")
  ) {
    fail(`${label} shape is invalid`);
  }
}

function exactDigest(value, label, prefixed = false) {
  const pattern = prefixed ? /^sha256:[0-9a-f]{64}$/u : /^[0-9a-f]{64}$/u;
  if (typeof value !== "string" || !pattern.test(value)) {
    fail(`${label} digest is invalid`);
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
  let descriptor;
  let raw;
  try {
    descriptor = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
    const status = fstatSync(descriptor);
    const linkStatus = lstatSync(absolute);
    if (
      !linkStatus.isFile() ||
      !status.isFile() ||
      status.dev !== linkStatus.dev ||
      status.ino !== linkStatus.ino ||
      status.size < 1 ||
      status.size > 256 * 1024
    ) {
      fail("completion artifact is not a bounded stable file");
    }
    raw = Buffer.alloc(status.size);
    let offset = 0;
    while (offset < raw.length) {
      const bytesRead = readSync(
        descriptor,
        raw,
        offset,
        raw.length - offset,
        offset,
      );
      if (bytesRead === 0) fail("completion artifact changed while reading");
      offset += bytesRead;
    }
  } catch {
    fail(`completion artifact ${path} is unreadable`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
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

function validatePrototypeMessageTrust(sources = prototypeMessageSources) {
  const contracts = [
    {
      id: "deck-stage",
      source: sources.deckStage,
      handler: "_onMessage(e) {",
      originSource: "return new URL(document.referrer).origin;",
    },
    {
      id: "support",
      source: sources.support,
      handler: 'window.addEventListener("message", (e) => {',
      originSource: "return new URL(doc.referrer).origin;",
    },
  ];
  const sourceBinding =
    "const HOST_MESSAGE_SOURCE = window.parent === window ? window : window.parent;";
  const originBinding = "const HOST_MESSAGE_ORIGIN = (() => {";
  const sourceGuard = "e.source !== HOST_MESSAGE_SOURCE ||";
  const absentOriginGuard = "HOST_MESSAGE_ORIGIN === null ||";
  const originGuard = "e.origin !== HOST_MESSAGE_ORIGIN";

  for (const contract of contracts) {
    if (typeof contract.source !== "string") {
      fail(`${contract.id} message-trust source is missing`);
    }
    const handlerIndex = contract.source.indexOf(contract.handler);
    const sourceGuardIndex = contract.source.indexOf(sourceGuard, handlerIndex);
    const originGuardIndex = contract.source.indexOf(originGuard, handlerIndex);
    const dataIndex = contract.source.indexOf("e.data", handlerIndex);
    if (
      !contract.source.includes(sourceBinding) ||
      !contract.source.includes(originBinding) ||
      !contract.source.includes(contract.originSource) ||
      !contract.source.includes("return null;") ||
      handlerIndex < 0 ||
      sourceGuardIndex <= handlerIndex ||
      originGuardIndex <= sourceGuardIndex ||
      !contract.source
        .slice(sourceGuardIndex, originGuardIndex)
        .includes(absentOriginGuard) ||
      dataIndex <= originGuardIndex
    ) {
      fail(`${contract.id} message handler is not source-and-origin bound`);
    }
  }
}

function validateMediumTriage(register, candidate, candidateRisks) {
  exactKeys(
    register,
    [
      "schema",
      "candidateCommit",
      "observedAt",
      "source",
      "reconciliation",
      "review",
      "findings",
      "remediations",
      "falsePositives",
    ],
    "Medium triage register",
  );
  if (
    register.schema !== "starfiniti.security-medium-triage.v1" ||
    register.candidateCommit !== candidate.candidate.commit ||
    register.observedAt !== candidate.observedAt
  ) {
    fail("Medium triage identity is invalid");
  }
  exactUtc(register.observedAt, "Medium triage observedAt");

  exactKeys(
    register.source,
    [
      "securityRunId",
      "securityWorkflowSha256",
      "trivyVersion",
      "zapVersion",
      "completedAt",
      "supplyChain",
      "dast",
      "previousDast",
    ],
    "Medium triage source",
  );
  if (
    !Number.isSafeInteger(register.source.securityRunId) ||
    register.source.securityRunId < 1 ||
    register.source.securityWorkflowSha256 !==
      candidate.inputs.securityWorkflow.sha256 ||
    String(register.source.trivyVersion) !== candidate.inputs.tools.trivy ||
    String(register.source.zapVersion) !== candidate.inputs.tools.zap
  ) {
    fail("Medium triage source identity or tool versions are invalid");
  }
  exactUtc(register.source.completedAt, "Medium triage completedAt");
  if (
    Date.parse(register.source.completedAt) >= Date.parse(register.observedAt)
  ) {
    fail("Medium triage chronology is invalid");
  }

  exactKeys(
    register.source.supplyChain,
    [
      "jobId",
      "artifactId",
      "artifactName",
      "artifactArchiveSha256",
      "artifactExpiresAt",
      "dashboardReportSha256",
      "workerReportSha256",
      "dashboardSbomSha256",
      "workerSbomSha256",
      "dashboardImageDigest",
      "workerImageDigest",
    ],
    "Medium triage supply-chain source",
  );
  exactKeys(
    register.source.dast,
    [
      "jobId",
      "artifactId",
      "artifactName",
      "artifactArchiveSha256",
      "artifactExpiresAt",
      "reportSha256",
    ],
    "Medium triage DAST source",
  );
  exactKeys(
    register.source.previousDast,
    [
      "securityRunId",
      "artifactId",
      "artifactArchiveSha256",
      "artifactExpiresAt",
      "reportSha256",
    ],
    "Medium triage previous DAST source",
  );
  for (const source of [
    register.source.supplyChain,
    register.source.dast,
    register.source.previousDast,
  ]) {
    for (const id of ["jobId", "artifactId", "securityRunId"]) {
      if (
        source[id] !== undefined &&
        (!Number.isSafeInteger(source[id]) || source[id] < 1)
      ) {
        fail(`Medium triage ${id} is invalid`);
      }
    }
    exactUtc(source.artifactExpiresAt, "Medium triage artifact expiry");
    if (
      Date.parse(source.artifactExpiresAt) <= Date.parse(register.observedAt)
    ) {
      fail("Medium triage source expired before review");
    }
    if (Date.parse(source.artifactExpiresAt) <= Date.now()) {
      fail("Medium triage source artifact has expired");
    }
  }
  if (
    !/^security-supply-chain-[0-9a-f]{40}$/u.test(
      register.source.supplyChain.artifactName,
    ) ||
    !/^security-dast-[0-9a-f]{40}$/u.test(register.source.dast.artifactName)
  ) {
    fail("Medium triage artifact names are invalid");
  }
  for (const [key, value] of Object.entries(register.source.supplyChain)) {
    if (key.endsWith("Sha256")) exactDigest(value, `supply-chain ${key}`);
  }
  for (const [key, value] of Object.entries(register.source.dast)) {
    if (key.endsWith("Sha256")) exactDigest(value, `DAST ${key}`);
  }
  for (const [key, value] of Object.entries(register.source.previousDast)) {
    if (key.endsWith("Sha256")) exactDigest(value, `previous DAST ${key}`);
  }
  exactDigest(
    register.source.supplyChain.dashboardImageDigest,
    "dashboard image",
    true,
  );
  exactDigest(
    register.source.supplyChain.workerImageDigest,
    "worker image",
    true,
  );

  const expectedReconciliation = {
    currentCritical: 0,
    currentHigh: 0,
    currentMedium: 29,
    currentMediumLicenses: 29,
    currentMediumDast: 0,
    currentDastInformational: 2,
    distinctMediumFindings: 15,
    rawMediumOccurrences: 29,
    remediatedPriorDastMedium: 2,
    falsePositives: 0,
    sourceAvailable: 1,
    openReleaseObligations: 14,
  };
  exactKeys(
    register.reconciliation,
    Object.keys(expectedReconciliation),
    "Medium triage reconciliation",
  );
  if (
    Object.entries(expectedReconciliation).some(
      ([key, value]) => register.reconciliation[key] !== value,
    )
  ) {
    fail("Medium triage counts do not reconcile");
  }

  exactKeys(
    register.review,
    [
      "status",
      "ownerRole",
      "risk",
      "reviewedAt",
      "expiresAt",
      "allMediumTriaged",
      "falsePositivesReviewed",
      "blockingTaggedRelease",
      "requiredAction",
      "rationale",
    ],
    "Medium triage review",
  );
  exactUtc(register.review.reviewedAt, "Medium triage reviewedAt");
  exactUtc(register.review.expiresAt, "Medium triage expiresAt");
  const reviewDuration =
    Date.parse(register.review.expiresAt) -
    Date.parse(register.review.reviewedAt);
  const earliestArtifactExpiry = Math.min(
    Date.parse(register.source.supplyChain.artifactExpiresAt),
    Date.parse(register.source.dast.artifactExpiresAt),
    Date.parse(register.source.previousDast.artifactExpiresAt),
  );
  if (
    register.review.status !== "triaged_release_blocked" ||
    register.review.ownerRole !== "release_security" ||
    register.review.risk !== "R-056" ||
    register.review.reviewedAt !== register.observedAt ||
    reviewDuration <= 0 ||
    reviewDuration > 31 * 24 * 60 * 60 * 1000 ||
    Date.parse(register.review.expiresAt) <= Date.now() ||
    Date.parse(register.review.expiresAt) > earliestArtifactExpiry ||
    register.review.allMediumTriaged !== true ||
    register.review.falsePositivesReviewed !== true ||
    register.review.blockingTaggedRelease !== true ||
    register.review.requiredAction !==
      "Publish exact corresponding-source and third-party-notice evidence for every open reciprocal component before distributing a tagged dashboard or worker image." ||
    typeof register.review.rationale !== "string" ||
    register.review.rationale.length < 120 ||
    !/^\| R-056 \|/mu.test(candidateRisks)
  ) {
    fail("Medium triage ownership expiry or release gate is invalid");
  }

  if (
    JSON.stringify(register.findings) !== JSON.stringify(expectedMediumFindings)
  ) {
    fail("Medium triage finding matrix is incomplete or drifted");
  }
  if (
    register.findings.reduce(
      (sum, finding) => sum + finding.rawOccurrences,
      0,
    ) !== register.reconciliation.rawMediumOccurrences ||
    register.findings.filter(
      (finding) => finding.disposition === "release_obligation_open",
    ).length !== register.reconciliation.openReleaseObligations ||
    register.findings.filter(
      (finding) => finding.disposition === "source_available",
    ).length !== register.reconciliation.sourceAvailable
  ) {
    fail("Medium triage occurrence or disposition totals drifted");
  }

  const expectedControls = [
    "apps/dashboard/lib/security-headers.test.ts",
    "apps/dashboard/proxy.test.ts",
    ".github/workflows/security.yml",
  ];
  if (
    !Array.isArray(register.remediations) ||
    register.remediations.length !== 2 ||
    register.remediations
      .map((item) => item.ruleId)
      .sort()
      .join(",") !== "10020,10038"
  ) {
    fail("Medium triage remediation coverage is invalid");
  }
  for (const remediation of register.remediations) {
    exactKeys(
      remediation,
      [
        "ruleId",
        "name",
        "status",
        "falsePositive",
        "remediationCommit",
        "priorReportSha256",
        "currentReportSha256",
        "regressionControls",
      ],
      "Medium triage remediation",
    );
    if (
      remediation.status !== "remediated" ||
      remediation.falsePositive !== false ||
      remediation.remediationCommit !==
        "f9c83ac5de0fc7c73aed7528dc8e158ef45df17d" ||
      remediation.priorReportSha256 !==
        register.source.previousDast.reportSha256 ||
      remediation.currentReportSha256 !== register.source.dast.reportSha256 ||
      JSON.stringify(remediation.regressionControls) !==
        JSON.stringify(expectedControls)
    ) {
      fail("Medium triage remediation evidence is invalid");
    }
  }
  if (
    !Array.isArray(register.falsePositives) ||
    register.falsePositives.length
  ) {
    fail("Medium triage false-positive reconciliation is invalid");
  }
  scanSensitive(register, "Medium triage register");
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
  exactKeys(
    release,
    [
      "candidateCommit",
      "checksumsVerified",
      "fileAttestationsVerified",
      "files",
      "imageAttestationsVerified",
      "imageDigests",
      "reciprocalComponentsVerified",
      "sbomSha256",
      "schema",
      "sourceArchiveVerified",
      "sourceManifestVerified",
      "tag",
      "verifiedAt",
    ],
    "release security verification",
  );
  const files = release.files;
  const filesByName = new Map(
    Array.isArray(files) ? files.map((file) => [file?.name, file]) : [],
  );
  if (
    release?.schema !== "starfiniti.release-security-verification.v1" ||
    release.candidateCommit !== candidate.candidate.commit ||
    !/^v\d+\.\d+\.\d+$/u.test(release.tag) ||
    release.checksumsVerified !== true ||
    release.fileAttestationsVerified !== 7 ||
    release.sourceArchiveVerified !== true ||
    release.sourceManifestVerified !== true ||
    release.reciprocalComponentsVerified !== 13 ||
    !Array.isArray(files) ||
    files.length !== expectedReleaseFiles.length ||
    filesByName.size !== expectedReleaseFiles.length ||
    [...filesByName.keys()].sort().join(",") !==
      expectedReleaseFiles.join(",") ||
    files.some(
      (file) =>
        !file ||
        Object.keys(file).sort().join(",") !==
          "attestationVerified,name,sha256" ||
        file.attestationVerified !== true ||
        !/^[0-9a-f]{64}$/u.test(file.sha256) ||
        /^0{64}$/u.test(file.sha256),
    ) ||
    release.imageAttestationsVerified !== 2 ||
    !Array.isArray(release.imageDigests) ||
    release.imageDigests.length !== 2 ||
    release.imageDigests.some(
      (digest) =>
        !/^sha256:[0-9a-f]{64}$/u.test(digest) ||
        /^sha256:0{64}$/u.test(digest),
    ) ||
    !Array.isArray(release.sbomSha256) ||
    release.sbomSha256.length !== 2 ||
    release.sbomSha256.some(
      (digest) => !/^[0-9a-f]{64}$/u.test(digest) || /^0{64}$/u.test(digest),
    ) ||
    release.sbomSha256[0] !==
      filesByName.get("loyalty-dashboard.cdx.json")?.sha256 ||
    release.sbomSha256[1] !== filesByName.get("loyalty-worker.cdx.json")?.sha256
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
  validatePrototypeMessageTrust();
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
    ["licensePolicy", "infrastructure/testing/security/trivy.yaml"],
    [
      "reciprocalSourcePlan",
      "infrastructure/testing/security/reciprocal-source-plan.yaml",
    ],
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
  exactKeys(candidate.triage, ["path", "sha256"], "Medium triage binding");
  const mediumTriageCheck = candidate.checks.find(
    (check) => check.id === "medium_and_false_positive_review",
  );
  if (mediumTriageCheck?.status === "passed") {
    const mediumTriage = readBoundArtifact(
      candidate.triage.path,
      candidate.triage.sha256,
    );
    validateMediumTriage(mediumTriage, candidate, candidateRisks);
    const releaseEvidencePassed = [
      "release_sbom_verification",
      "release_file_attestations",
      "release_image_attestations",
    ].some(
      (id) =>
        candidate.checks.find((check) => check.id === id)?.status === "passed",
    );
    if (mediumTriage.review.blockingTaggedRelease && releaseEvidencePassed) {
      fail("tagged release evidence conflicts with open Medium obligations");
    }
  } else if (
    candidate.triage.path !== null ||
    candidate.triage.sha256 !== null
  ) {
    fail("non-passing Medium triage cannot bind a completion artifact");
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

  const syntheticReleaseFiles = expectedReleaseFiles.map((name, index) => ({
    name,
    sha256: (index + 1).toString(16).padStart(64, "0"),
    attestationVerified: true,
  }));
  const syntheticRelease = {
    schema: "starfiniti.release-security-verification.v1",
    candidateCommit: evidence.candidate.commit,
    tag: "v1.0.0",
    checksumsVerified: true,
    fileAttestationsVerified: 7,
    files: syntheticReleaseFiles,
    imageAttestationsVerified: 2,
    imageDigests: [`sha256:${"a".repeat(64)}`, `sha256:${"b".repeat(64)}`],
    reciprocalComponentsVerified: 13,
    sbomSha256: [
      syntheticReleaseFiles.find(
        (file) => file.name === "loyalty-dashboard.cdx.json",
      ).sha256,
      syntheticReleaseFiles.find(
        (file) => file.name === "loyalty-worker.cdx.json",
      ).sha256,
    ],
    sourceArchiveVerified: true,
    sourceManifestVerified: true,
    verifiedAt: "2026-08-28T18:00:00Z",
  };
  validateRelease(syntheticRelease, evidence);
  const incompleteReleaseFiles = structuredClone(syntheticRelease);
  incompleteReleaseFiles.files.pop();
  try {
    validateRelease(incompleteReleaseFiles, evidence);
    fail("self-test accepted incomplete release file evidence");
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes("release security verification is incomplete")
    ) {
      throw error;
    }
  }

  const historicalTriagePath =
    "docs/plan/evidence/M15/runs/security-medium-triage-188d9d8.yaml";
  const mediumTriage = readBoundArtifact(
    historicalTriagePath,
    rawDigest(historicalTriagePath),
  );
  const mediumTriageEvidence = structuredClone(evidence);
  mediumTriageEvidence.observedAt = mediumTriage.observedAt;
  mediumTriageEvidence.candidate.commit = mediumTriage.candidateCommit;
  mediumTriageEvidence.inputs.securityWorkflow.sha256 =
    mediumTriage.source.securityWorkflowSha256;
  const expectTriageRejected = (candidate, message, label) => {
    try {
      validateMediumTriage(candidate, mediumTriageEvidence, risksText);
    } catch (error) {
      if (error instanceof Error && error.message.includes(message)) return;
      throw error;
    }
    fail(`self-test accepted ${label}`);
  };

  const missingMediumFinding = structuredClone(mediumTriage);
  missingMediumFinding.findings.pop();
  expectTriageRejected(
    missingMediumFinding,
    "finding matrix",
    "incomplete Medium finding matrix",
  );

  const incorrectMediumCount = structuredClone(mediumTriage);
  incorrectMediumCount.reconciliation.rawMediumOccurrences = 28;
  expectTriageRejected(
    incorrectMediumCount,
    "counts do not reconcile",
    "incorrect Medium count",
  );

  const overlongMediumReview = structuredClone(mediumTriage);
  overlongMediumReview.review.expiresAt = "2026-09-27T17:15:56Z";
  expectTriageRejected(
    overlongMediumReview,
    "ownership expiry or release gate",
    "review beyond source expiry",
  );

  const unblockedMediumRelease = structuredClone(mediumTriage);
  unblockedMediumRelease.review.blockingTaggedRelease = false;
  expectTriageRejected(
    unblockedMediumRelease,
    "ownership expiry or release gate",
    "unblocked reciprocal release",
  );

  const expiredMediumReview = structuredClone(mediumTriage);
  expiredMediumReview.review.expiresAt = mediumTriage.observedAt;
  expectTriageRejected(
    expiredMediumReview,
    "ownership expiry or release gate",
    "expired Medium review",
  );

  const expiredMediumSource = structuredClone(mediumTriage);
  expiredMediumSource.source.dast.artifactExpiresAt = "2026-08-28T19:40:53Z";
  expectTriageRejected(
    expiredMediumSource,
    "source artifact has expired",
    "expired Medium source artifact",
  );

  const inventedFalsePositive = structuredClone(mediumTriage);
  inventedFalsePositive.falsePositives.push({ ruleId: "invented" });
  expectTriageRejected(
    inventedFalsePositive,
    "false-positive reconciliation",
    "invented false positive",
  );

  const weakenedRemediation = structuredClone(mediumTriage);
  weakenedRemediation.remediations[0].falsePositive = true;
  expectTriageRejected(
    weakenedRemediation,
    "remediation evidence",
    "real defect relabelled false positive",
  );

  const expectMessageTrustRejected = (candidate, message, label) => {
    try {
      validatePrototypeMessageTrust(candidate);
    } catch (error) {
      if (error instanceof Error && error.message.includes(message)) return;
      throw error;
    }
    fail(`self-test accepted ${label}`);
  };

  const missingDeckOrigin = structuredClone(prototypeMessageSources);
  missingDeckOrigin.deckStage = missingDeckOrigin.deckStage.replace(
    "e.origin !== HOST_MESSAGE_ORIGIN",
    "false",
  );
  expectMessageTrustRejected(
    missingDeckOrigin,
    "deck-stage message handler",
    "deck handler without origin verification",
  );

  const missingSupportSource = structuredClone(prototypeMessageSources);
  missingSupportSource.support = missingSupportSource.support.replace(
    "e.source !== HOST_MESSAGE_SOURCE ||",
    "false ||",
  );
  expectMessageTrustRejected(
    missingSupportSource,
    "support message handler",
    "support handler without source verification",
  );
}

console.log(
  `Validated ${evidence.checks.length} M15 security checks and the isolated six-job DAST plan; ${evidence.checks.filter((check) => check.status === "passed").length} passed and ${result.incomplete.length} remain non-passing.`,
);
