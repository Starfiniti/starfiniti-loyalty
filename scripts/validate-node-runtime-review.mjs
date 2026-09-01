import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const reviewPath = "infrastructure/governance/node-runtime-review.yaml";
const dashboardPath = "apps/dashboard/Dockerfile";
const workerPath = "apps/worker/Dockerfile";
const packagePath = "package.json";
const evidencePath =
  "docs/plan/evidence/M16/runs/node-runtime-d2c347a-2026-08-29T142927Z.json";
const digestPattern = /^[0-9a-f]{64}$/u;

const locked = Object.freeze({
  sourcePath:
    "docs/plan/evidence/M16/runs/provider-source-snapshot-257e99c-2026-08-28T212100Z.json",
  sourceFileSha256:
    "5786186426b065493f5c01b5d76742322e2e8ed3fe92b8f80c30d787caa516be",
  sourceContentSha256:
    "81789e800321e12053f7b815745d481b625192447ad93655578cdc532a66b673",
  previousIndex:
    "d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43",
  previousManifest:
    "2a49bdf71e9fd965a58c1703fd9ddd205b34e5782b692a72dd1d248abb0beb43",
  previousConfig:
    "1746248f2a138f128577ca74d86c9d4a0a17fcc9922c77dfdf92ba7307a4fa3c",
  previousCreatedAt: "2026-08-03T20:26:09.891764423Z",
  candidateIndex:
    "e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf",
  candidateManifest:
    "4caaaf42195bcd6f6f3559a413b20cb8f8ad089e231ee874cf7701643966689f",
  candidateConfig:
    "ee289c69ed1ac50a5a042112ea97f132800e2dd53e832da27784f00e45b3289c",
  candidateCreatedAt: "2026-08-27T17:03:03.001954681Z",
  version: "24.20.0",
  evidenceSha256:
    "222cd276acfd37430db88c993f01301ccc14f0d97b1da5fb907edf4770e0c692",
  implementationCommit: "d2c347a271259a9a93958d02ded2fed732676b59",
  analysisMergeCommit: "c2c3626d695b362eabe00b970ceed9d654f6ef53",
});

function fail(message) {
  throw new Error(`Node runtime review invalid: ${message}`);
}

function exactKeys(value, expected, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    fail(`${label} keys differ`);
  }
}

function exactArray(value, expected, label) {
  if (
    !Array.isArray(value) ||
    value.length !== expected.length ||
    value.some((item, index) => item !== expected[index])
  ) {
    fail(`${label} differs`);
  }
}

function exactDigest(value, expected, label) {
  if (!digestPattern.test(value ?? "") || value !== expected) {
    fail(`${label} differs`);
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function validateDockerfile(
  contents,
  path,
  candidateIndex = locked.candidateIndex,
) {
  const fromLines = contents
    .split(/\r?\n/u)
    .filter((line) => line.startsWith("FROM node:"));
  const expected = ["dependencies", "runner"].map(
    (stage) => `FROM node:24-alpine@sha256:${candidateIndex} AS ${stage}`,
  );
  exactArray(fromLines, expected, `${path} Node stages`);
  if (contents.includes(locked.previousIndex)) {
    fail(`${path} retains the superseded Node index`);
  }
}

function validateEvidence(evidence, review, evidenceBytes) {
  if (sha256(evidenceBytes) !== locked.evidenceSha256) {
    fail("CI evidence bytes differ");
  }
  exactKeys(
    evidence,
    [
      "schema",
      "observedAt",
      "candidate",
      "github",
      "artifacts",
      "security",
      "images",
      "verification",
      "production",
    ],
    "CI evidence",
  );
  if (
    evidence.schema !== "starfiniti.node-runtime-ci-evidence.v1" ||
    evidence.observedAt !== "2026-08-29T14:29:27Z"
  ) {
    fail("CI evidence schema or observation time differs");
  }
  if (
    evidence.candidate?.implementationCommit !== locked.implementationCommit ||
    evidence.candidate?.analysisMergeCommit !== locked.analysisMergeCommit ||
    evidence.candidate?.baseCommit !==
      "2826b0bdc758cf224ac22d85940e73b25b61865f" ||
    evidence.candidate?.pullRequest !== 57 ||
    evidence.candidate?.pullRequestOpen !== true ||
    evidence.candidate?.pullRequestMergeable !== true
  ) {
    fail("CI candidate identity differs");
  }
  if (
    evidence.github?.ci?.runId !== 33257511194 ||
    evidence.github?.ci?.headCommit !== locked.implementationCommit ||
    evidence.github?.ci?.conclusion !== "success" ||
    evidence.github?.security?.runId !== 33257511192 ||
    evidence.github?.security?.headCommit !== locked.implementationCommit ||
    evidence.github?.security?.analysisMergeCommit !==
      locked.analysisMergeCommit ||
    evidence.github?.security?.conclusion !== "success" ||
    evidence.github?.requiredChecks !== 12 ||
    evidence.github?.requiredChecksPassed !== 12
  ) {
    fail("CI or Security run evidence differs");
  }
  exactArray(
    evidence.github.ci.jobs.map(
      (job) => `${job.id}:${job.name}:${job.conclusion}`,
    ),
    [
      "99113691755:containers:success",
      "99113691839:baseline:success",
      "99113691856:database:success",
      "99113691869:woocommerce-runtime (minimum-legacy):success",
      "99113691885:woocommerce-runtime (current-hpos):success",
      "99113691895:woocommerce-runtime (current-legacy):success",
      "99113691938:woocommerce-runtime (minimum-hpos):success",
    ],
    "CI jobs",
  );
  exactArray(
    evidence.github.security.jobs.map(
      (job) => `${job.id}:${job.name}:${job.conclusion}`,
    ),
    [
      "99113691786:supply-chain:success",
      "99113691906:recovery-transport:success",
      "99113691934:dast:success",
      "99113691986:codeql:success",
    ],
    "Security jobs",
  );
  if (
    evidence.github.externalCodeql?.checkRunId !== 99113856918 ||
    evidence.github.externalCodeql?.analysisId !== 1691856923 ||
    evidence.github.externalCodeql?.analysisCommit !==
      locked.analysisMergeCommit ||
    evidence.github.externalCodeql?.results !== 0 ||
    evidence.github.externalCodeql?.rules !== 103 ||
    evidence.github.externalCodeql?.conclusion !== "success"
  ) {
    fail("external CodeQL evidence differs");
  }

  const expectedArtifacts = [
    [
      "supplyChain",
      9716294905,
      "f0f14d44fc849ae5193e73defd2f96e0539626b8d584d61f5361ae39a2479c1d",
    ],
    [
      "codeql",
      9716271177,
      "30d6a34678c8d1b3051895b371cb49a5da41711e06e157c21b64d2c19895a0a0",
    ],
    [
      "dast",
      9716282080,
      "671539df41bab2729cca51e690ab606df212761d442ea7812d3062f267077304",
    ],
  ];
  for (const [name, id, digest] of expectedArtifacts) {
    if (evidence.artifacts?.[name]?.id !== id) {
      fail(`${name} artifact identity differs`);
    }
    exactDigest(
      evidence.artifacts[name].archiveSha256,
      digest,
      `${name} artifact digest`,
    );
  }

  if (
    evidence.security?.repository?.version !== "0.74.0" ||
    evidence.security?.codeql?.version !== "2.26.4" ||
    evidence.security?.codeql?.querySuite !== "security-extended" ||
    evidence.security?.dast?.version !== "2.17.0" ||
    evidence.security?.dast?.informationalAlerts !== 2
  ) {
    fail("security tool evidence differs");
  }
  const forbiddenFindings = [
    evidence.security.repository.vulnerabilities,
    evidence.security.repository.misconfigurations,
    evidence.security.repository.secrets,
    evidence.security.repository.licenceFindings,
    evidence.security.codeql.findings,
    evidence.security.dast.lowAlerts,
    evidence.security.dast.mediumAlerts,
    evidence.security.dast.highAlerts,
    evidence.security.dast.criticalAlerts,
  ];
  if (forbiddenFindings.some((value) => value !== 0)) {
    fail("security evidence contains a nonzero finding");
  }

  const expectedImages = {
    dashboard: {
      imageId:
        "f72f97a61904d1de33c4a5393f0930124ad8dc98a7af5a0c64a4cddba03bf311",
      artifactId:
        "2ca8414ee2d461db4a06007c7d7a15d716ab230ce1e1d1ad352707ca471b82f5",
      trivy: "cfab29a98ede10ea8ca85343ad2928c5c228dff55b3b289258f39606d1fa8374",
      sbom: "98d4f794cd5c34149ccf8a7845776102f3582c30cf9b296ce78829b85f815d75",
      components: 228,
    },
    worker: {
      imageId:
        "b6aaf7091c51a39c176d970b1b55fbae263fdfbd934f93735455ba5bc2ff37ae",
      artifactId:
        "04086ff5a86b854bb570353b02ce573535eb38f28734e1754eaabd814e4d514d",
      trivy: "73e07a64e74e38187c1e67135ed61a7f24d7931d3a4f169a6d8a4c885e891eea",
      sbom: "c4de960a5d901929315d45bc87522cdb466769e00d691154460491fbc6dbc60a",
      components: 108,
    },
  };
  for (const [name, expected] of Object.entries(expectedImages)) {
    const image = evidence.images?.[name];
    if (
      image?.nodeVersion !== locked.version ||
      image?.operatingSystem !== "alpine-3.24.1" ||
      image?.imageId !== expected.imageId ||
      image?.artifactId !== expected.artifactId ||
      image?.sbomComponents !== expected.components ||
      image?.vulnerabilities !== 0 ||
      image?.misconfigurations !== 0 ||
      image?.secrets !== 0
    ) {
      fail(`${name} image evidence differs`);
    }
    exactDigest(
      image.trivyReportSha256,
      expected.trivy,
      `${name} Trivy report`,
    );
    exactDigest(image.sbomSha256, expected.sbom, `${name} SBOM`);
  }
  if (
    evidence.verification?.unitAndContractTests !== 995 ||
    evidence.verification?.migrations !== 87 ||
    evidence.verification?.pgtapFiles !== 69 ||
    evidence.verification?.pgtapAssertions !== 3790 ||
    evidence.verification?.concurrencyProbes !== 22 ||
    evidence.verification?.woocommerceRuntimeCells !== 4 ||
    evidence.verification?.productionAuditVulnerabilities !== 0
  ) {
    fail("verification totals differ");
  }
  if (
    Object.values(evidence.production ?? {}).some((value) => value !== false)
  ) {
    fail("CI evidence overclaims production authority");
  }
  if (
    review.ciEvidence?.path !== evidencePath ||
    review.ciEvidence?.sha256 !== locked.evidenceSha256 ||
    review.ciEvidence?.implementationCommit !== locked.implementationCommit ||
    review.ciEvidence?.analysisMergeCommit !== locked.analysisMergeCommit ||
    review.ciEvidence?.ciRunId !== evidence.github.ci.runId ||
    review.ciEvidence?.securityRunId !== evidence.github.security.runId ||
    review.ciEvidence?.conclusion !== "passed"
  ) {
    fail("review CI evidence binding differs");
  }
}

function validate(review, inputs) {
  exactKeys(
    review,
    [
      "schema",
      "reviewedAt",
      "sourceSnapshot",
      "officialRelease",
      "docker",
      "ciEvidence",
      "impact",
      "production",
    ],
    "review",
  );
  if (
    review.schema !== "starfiniti.node-runtime-review.v1" ||
    review.reviewedAt !== "2026-08-29"
  ) {
    fail("schema or review date differs");
  }

  exactKeys(
    review.sourceSnapshot,
    [
      "path",
      "fileSha256",
      "observedAt",
      "providerId",
      "bytes",
      "contentSha256",
    ],
    "source snapshot",
  );
  if (
    review.sourceSnapshot.path !== locked.sourcePath ||
    review.sourceSnapshot.providerId !== "nodejs" ||
    review.sourceSnapshot.observedAt !== "2026-08-28T21:20:39Z" ||
    review.sourceSnapshot.bytes !== 296072
  ) {
    fail("source snapshot facts differ");
  }
  exactDigest(
    review.sourceSnapshot.fileSha256,
    locked.sourceFileSha256,
    "source snapshot file digest",
  );
  exactDigest(
    review.sourceSnapshot.contentSha256,
    locked.sourceContentSha256,
    "Node source content digest",
  );
  if (sha256(inputs.sourceBytes) !== locked.sourceFileSha256) {
    fail("source snapshot bytes differ");
  }
  const source = JSON.parse(inputs.sourceBytes.toString("utf8"));
  const nodeSource = source.sources?.find((item) => item.id === "nodejs");
  if (
    source.complete !== true ||
    source.contentRetained !== false ||
    nodeSource?.fetchedAt !== review.sourceSnapshot.observedAt ||
    nodeSource?.bytes !== review.sourceSnapshot.bytes ||
    nodeSource?.sha256 !== review.sourceSnapshot.contentSha256
  ) {
    fail("Node source projection differs");
  }

  exactKeys(
    review.officialRelease,
    ["url", "version", "major", "status", "releasedAt"],
    "official release",
  );
  if (
    review.officialRelease.url !==
      "https://nodejs.org/en/blog/release/v24.20.0" ||
    review.officialRelease.version !== locked.version ||
    review.officialRelease.major !== 24 ||
    review.officialRelease.status !== "LTS" ||
    review.officialRelease.releasedAt !== "2026-08-26"
  ) {
    fail("official release facts differ");
  }

  exactKeys(
    review.docker,
    [
      "repository",
      "tag",
      "previous",
      "candidate",
      "dockerfiles",
      "requiredStages",
    ],
    "docker review",
  );
  exactKeys(
    review.docker.previous,
    [
      "indexSha256",
      "linuxAmd64ManifestSha256",
      "configSha256",
      "version",
      "createdAt",
    ],
    "previous image",
  );
  exactKeys(
    review.docker.candidate,
    [
      "indexSha256",
      "linuxAmd64ManifestSha256",
      "configSha256",
      "version",
      "createdAt",
      "baseName",
    ],
    "candidate image",
  );
  if (
    review.docker.repository !== "library/node" ||
    review.docker.tag !== "24-alpine" ||
    review.docker.previous.version !== "24.19.0" ||
    review.docker.previous.createdAt !== locked.previousCreatedAt ||
    review.docker.candidate.version !== locked.version ||
    review.docker.candidate.createdAt !== locked.candidateCreatedAt ||
    review.docker.candidate.baseName !== "alpine:3.24" ||
    Date.parse(review.docker.candidate.createdAt) <=
      Date.parse(review.docker.previous.createdAt)
  ) {
    fail("Docker image identity or chronology differs");
  }
  exactDigest(
    review.docker.previous.indexSha256,
    locked.previousIndex,
    "previous image index",
  );
  exactDigest(
    review.docker.previous.linuxAmd64ManifestSha256,
    locked.previousManifest,
    "previous linux/amd64 manifest",
  );
  exactDigest(
    review.docker.previous.configSha256,
    locked.previousConfig,
    "previous image config",
  );
  exactDigest(
    review.docker.candidate.indexSha256,
    locked.candidateIndex,
    "candidate image index",
  );
  exactDigest(
    review.docker.candidate.linuxAmd64ManifestSha256,
    locked.candidateManifest,
    "candidate linux/amd64 manifest",
  );
  exactDigest(
    review.docker.candidate.configSha256,
    locked.candidateConfig,
    "candidate image config",
  );
  exactArray(
    review.docker.dockerfiles,
    [dashboardPath, workerPath],
    "reviewed Dockerfiles",
  );
  exactArray(
    review.docker.requiredStages,
    ["dependencies", "runner"],
    "required stages",
  );

  exactKeys(
    review.impact,
    [
      "classification",
      "securityRelevant",
      "breakingChangeIdentified",
      "affectedModules",
      "owner",
      "disposition",
      "rationale",
    ],
    "impact",
  );
  if (
    review.impact.classification !== "maintenance-lts" ||
    review.impact.securityRelevant !== true ||
    review.impact.breakingChangeIdentified !== false ||
    review.impact.owner !== "engineering" ||
    review.impact.disposition !== "refresh-candidate-and-rescan" ||
    typeof review.impact.rationale !== "string" ||
    review.impact.rationale.length < 80
  ) {
    fail("impact classification differs");
  }
  exactArray(review.impact.affectedModules, ["M15", "M16"], "affected modules");

  exactKeys(
    review.ciEvidence,
    [
      "path",
      "sha256",
      "implementationCommit",
      "analysisMergeCommit",
      "ciRunId",
      "securityRunId",
      "conclusion",
    ],
    "CI evidence binding",
  );
  validateEvidence(inputs.evidence, review, inputs.evidenceBytes);

  exactKeys(
    review.production,
    ["mutation", "deploymentApproved", "rollbackIndexSha256", "remainingGate"],
    "production boundary",
  );
  if (
    review.production.mutation !== false ||
    review.production.deploymentApproved !== false ||
    typeof review.production.remainingGate !== "string" ||
    review.production.remainingGate.length < 80
  ) {
    fail("production boundary differs");
  }
  exactDigest(
    review.production.rollbackIndexSha256,
    locked.previousIndex,
    "rollback image index",
  );

  validateDockerfile(inputs.dashboard, dashboardPath);
  validateDockerfile(inputs.worker, workerPath);
  if (JSON.parse(inputs.packageJson).engines?.node !== ">=24.0.0") {
    fail("root Node engine differs");
  }
}

const review = YAML.parse(readFileSync(join(root, reviewPath), "utf8"));
const inputs = {
  sourceBytes: readFileSync(join(root, locked.sourcePath)),
  dashboard: readFileSync(join(root, dashboardPath), "utf8"),
  worker: readFileSync(join(root, workerPath), "utf8"),
  packageJson: readFileSync(join(root, packagePath), "utf8"),
  evidenceBytes: readFileSync(join(root, evidencePath)),
};
inputs.evidence = JSON.parse(inputs.evidenceBytes.toString("utf8"));

validate(review, inputs);

if (process.argv.includes("--self-test")) {
  const cases = [
    [
      "source digest drift",
      (candidate) =>
        (candidate.review.sourceSnapshot.fileSha256 = "1".repeat(64)),
    ],
    [
      "candidate index drift",
      (candidate) =>
        (candidate.review.docker.candidate.indexSha256 = "2".repeat(64)),
    ],
    [
      "rollback platform drift",
      (candidate) =>
        (candidate.review.docker.previous.linuxAmd64ManifestSha256 = "3".repeat(
          64,
        )),
    ],
    [
      "mutable Docker tag",
      (candidate) =>
        (candidate.inputs.dashboard = candidate.inputs.dashboard.replace(
          `node:24-alpine@sha256:${locked.candidateIndex}`,
          "node:24-alpine",
        )),
    ],
    [
      "superseded Docker pin",
      (candidate) =>
        (candidate.inputs.worker = candidate.inputs.worker.replaceAll(
          locked.candidateIndex,
          locked.previousIndex,
        )),
    ],
    [
      "missing runtime stage",
      (candidate) =>
        (candidate.inputs.dashboard = candidate.inputs.dashboard.replace(
          /FROM node:24-alpine[^\n]+ AS runner\r?\n/u,
          "",
        )),
    ],
    [
      "production mutation claim",
      (candidate) => (candidate.review.production.mutation = true),
    ],
    [
      "deployment approval claim",
      (candidate) => (candidate.review.production.deploymentApproved = true),
    ],
    [
      "impact owner omission",
      (candidate) => (candidate.review.impact.owner = ""),
    ],
    [
      "Node engine drift",
      (candidate) =>
        (candidate.inputs.packageJson = candidate.inputs.packageJson.replace(
          '">=24.0.0"',
          '">=22.0.0"',
        )),
    ],
    [
      "CI evidence digest drift",
      (candidate) => (candidate.review.ciEvidence.sha256 = "4".repeat(64)),
    ],
    [
      "failed Security run",
      (candidate) =>
        (candidate.inputs.evidence.github.security.conclusion = "failure"),
    ],
    [
      "runtime version misdescription",
      (candidate) =>
        (candidate.inputs.evidence.images.dashboard.nodeVersion = "24.19.0"),
    ],
    [
      "nonzero image finding",
      (candidate) =>
        (candidate.inputs.evidence.images.worker.vulnerabilities = 1),
    ],
    [
      "production deployment overclaim",
      (candidate) => (candidate.inputs.evidence.production.deployed = true),
    ],
  ];
  for (const [name, mutate] of cases) {
    const candidate = {
      review: structuredClone(review),
      inputs: {
        ...inputs,
        sourceBytes: Buffer.from(inputs.sourceBytes),
        evidenceBytes: Buffer.from(inputs.evidenceBytes),
        evidence: structuredClone(inputs.evidence),
      },
    };
    mutate(candidate);
    let rejected = false;
    try {
      validate(candidate.review, candidate.inputs);
    } catch {
      rejected = true;
    }
    if (!rejected) fail(`self-test accepted ${name}`);
  }
  console.log(`Rejected ${cases.length} Node runtime review corruptions.`);
}

console.log(
  `Validated Node ${locked.version} LTS image index ${locked.candidateIndex}.`,
);
