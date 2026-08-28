import { readFileSync } from "node:fs";
import { parse } from "yaml";

const workflowPath = ".github/workflows/ci.yml";
const workflow = parse(readFileSync(workflowPath, "utf8"));
const releaseWorkflowPath = ".github/workflows/release.yml";
const releaseWorkflow = parse(readFileSync(releaseWorkflowPath, "utf8"));
const securityWorkflowPath = ".github/workflows/security.yml";
const securityWorkflow = parse(readFileSync(securityWorkflowPath, "utf8"));
const trivyPolicyPath = "infrastructure/testing/security/trivy.yaml";
const trivyPolicy = parse(readFileSync(trivyPolicyPath, "utf8"));
const reciprocalSourcePlanPath =
  "infrastructure/testing/security/reciprocal-source-plan.yaml";
const reciprocalSourcePlan = parse(
  readFileSync(reciprocalSourcePlanPath, "utf8"),
);

function requireCondition(condition, message) {
  if (!condition) throw new Error(`${workflowPath}: ${message}`);
}

requireCondition(
  workflow?.on?.pull_request !== undefined,
  "pull_request trigger is required",
);
requireCondition(
  workflow?.on?.push?.branches?.includes("main"),
  "main push trigger is required",
);
requireCondition(
  workflow?.permissions?.contents === "read",
  "default contents permission must remain read-only",
);

for (const [jobName, job] of Object.entries(workflow?.jobs ?? {})) {
  requireCondition(
    job["runs-on"] === "ubuntu-latest",
    `${jobName} must run on ubuntu-latest`,
  );
  requireCondition(
    Number.isInteger(job["timeout-minutes"]),
    `${jobName} must set a timeout`,
  );

  for (const step of job.steps ?? []) {
    if (step.uses) {
      requireCondition(
        /^[^@]+@[0-9a-f]{40}$/u.test(step.uses),
        `${jobName} action must be pinned to a full commit SHA: ${step.uses}`,
      );
    }
  }
}

const databaseSteps = workflow.jobs?.database?.steps ?? [];
requireCondition(
  databaseSteps.some((step) => step.run === "npm run db:verify"),
  "database job must execute npm run db:verify",
);
requireCondition(
  databaseSteps.some(
    (step) => step.run === "npm run db:stop" && step.if === "always()",
  ),
  "database cleanup must always execute",
);

const containerSteps = workflow.jobs?.containers?.steps ?? [];
for (const dockerfile of [
  "apps/dashboard/Dockerfile",
  "apps/worker/Dockerfile",
]) {
  requireCondition(
    containerSteps.some((step) => step.run?.includes(`--file ${dockerfile}`)),
    `containers job must build ${dockerfile}`,
  );
  const fromLines = readFileSync(dockerfile, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.startsWith("FROM node:"));
  requireCondition(
    fromLines.length > 0,
    `${dockerfile} must contain an external Node base`,
  );
  requireCondition(
    fromLines.every((line) => /@sha256:[0-9a-f]{64}(?:\s|$)/u.test(line)),
    `${dockerfile} base images must be pinned by digest`,
  );
  const dockerfileText = readFileSync(dockerfile, "utf8");
  const runnerStage = dockerfileText.split(/\sAS runner\s/iu)[1] ?? "";
  requireCondition(
    runnerStage.includes("HEALTHCHECK --interval=30s --timeout=5s") &&
      runnerStage.includes("--start-period=30s --retries=3"),
    `${dockerfile} must retain the bounded image-level health check`,
  );
  requireCondition(
    runnerStage.includes("libcrypto3=3.5.8-r0") &&
      runnerStage.includes("libssl3=3.5.8-r0") &&
      runnerStage.includes("rm -rf /usr/local/lib/node_modules"),
    `${dockerfile} runtime must retain the reviewed Alpine fix and exclude the unused global Node package toolchain`,
  );
}
requireCondition(
  readFileSync("apps/dashboard/Dockerfile", "utf8").includes(
    "http://127.0.0.1:3000/api/healthz",
  ),
  "dashboard image health check must use the private readiness endpoint",
);
requireCondition(
  readFileSync("apps/worker/Dockerfile", "utf8").includes(
    'node -e "process.kill(1, 0)"',
  ),
  "worker image health check must verify the unprivileged PID 1 runtime",
);
const workerDockerfile = readFileSync("apps/worker/Dockerfile", "utf8");
const workerRunnerStage = workerDockerfile.split(/\sAS runner\s/iu)[1] ?? "";
const exactWorkerRuntimePackages = ["nodemailer", "postgres", "zod"];
const workerRuntimeCopies = workerRunnerStage
  .split(/\r?\n/u)
  .filter((line) => line.startsWith("COPY ") && line.includes("node_modules/"));
requireCondition(
  !workerRunnerStage.includes("/app/node_modules ./node_modules") &&
    workerRuntimeCopies.length === exactWorkerRuntimePackages.length &&
    exactWorkerRuntimePackages.every(
      (name) =>
        workerRuntimeCopies.filter((line) =>
          line.endsWith(`/app/node_modules/${name} ./node_modules/${name}`),
        ).length === 1,
    ),
  "worker runtime must copy only its three externally resolved production packages",
);
const workerBuildCommand = JSON.parse(
  readFileSync("apps/worker/package.json", "utf8"),
).scripts?.build;
requireCondition(
  [...(workerBuildCommand?.matchAll(/--external:([^\s]+)/gu) ?? [])]
    .map((match) => match[1])
    .sort()
    .join(",") === exactWorkerRuntimePackages.join(","),
  "worker bundle must leave exactly the image-inventoried runtime packages external",
);
const workerRuntimeProbe =
  "await Promise.all(['nodemailer','postgres','zod'].map((name) => import(name)))";
requireCondition(
  containerSteps.some(
    (step) =>
      step.name === "Verify exact worker runtime modules" &&
      step.run?.includes("starfiniti-worker:ci") &&
      step.run.includes(workerRuntimeProbe),
  ),
  "containers job must import every exact worker runtime package from the built image",
);

requireCondition(
  releaseWorkflow?.on?.push?.tags?.includes("v*.*.*"),
  `${releaseWorkflowPath}: semantic version tag trigger is required`,
);
requireCondition(
  releaseWorkflow?.permissions?.contents === "write" &&
    releaseWorkflow?.permissions?.packages === "write" &&
    releaseWorkflow?.permissions?.attestations === "write" &&
    releaseWorkflow?.permissions?.["id-token"] === "write",
  `${releaseWorkflowPath}: release package and provenance permissions are required`,
);

for (const [jobName, job] of Object.entries(releaseWorkflow?.jobs ?? {})) {
  requireCondition(
    job["runs-on"] === "ubuntu-latest",
    `${releaseWorkflowPath}: ${jobName} must run on ubuntu-latest`,
  );
  requireCondition(
    Number.isInteger(job["timeout-minutes"]),
    `${releaseWorkflowPath}: ${jobName} must set a timeout`,
  );
  for (const step of job.steps ?? []) {
    if (step.uses) {
      requireCondition(
        /^[^@]+@[0-9a-f]{40}$/u.test(step.uses),
        `${releaseWorkflowPath}: ${jobName} action must be pinned to a full commit SHA: ${step.uses}`,
      );
    }
  }
}

const releaseSteps = releaseWorkflow.jobs?.release?.steps ?? [];
const releaseStepContract = JSON.stringify(releaseSteps);
const reciprocalArtifactNames = reciprocalSourcePlan?.artifact;
requireCondition(
  reciprocalSourcePlan?.schema === "starfiniti.reciprocal-source-plan.v1" &&
    reciprocalArtifactNames?.archive === "starfiniti-loyalty-source.tar.gz" &&
    reciprocalArtifactNames?.manifest ===
      "starfiniti-loyalty-source-manifest.json" &&
    reciprocalArtifactNames?.notices ===
      "starfiniti-loyalty-third-party-notices.md",
  `${reciprocalSourcePlanPath}: exact reciprocal release artifact contract is required`,
);
const releasePayloads = [
  "dist/starfiniti-loyalty.zip",
  "dist/loyalty-dashboard.cdx.json",
  "dist/loyalty-worker.cdx.json",
  ...[
    reciprocalArtifactNames.archive,
    reciprocalArtifactNames.manifest,
    reciprocalArtifactNames.notices,
  ].map((name) => `dist/${name}`),
];
const attestedReleaseFiles = [...releasePayloads, "dist/SHA256SUMS"];
const exactDistPaths = (value) =>
  [...new Set(value?.match(/dist\/[A-Za-z0-9][A-Za-z0-9._+-]*/gu) ?? [])]
    .sort()
    .join(",");
const exactAttestedReleasePaths = [...attestedReleaseFiles].sort().join(",");
const normalizeShell = (value) =>
  value?.replaceAll("\\\n", " ").replace(/\s+/gu, " ").trim();
for (const requiredCommand of [
  "npm run check",
  "npm run db:verify",
  "npm run woocommerce:package",
  "docker login ghcr.io",
  "apps/dashboard/Dockerfile",
  "apps/worker/Dockerfile",
  "cyclonedx-json",
  "npm run release:sources:build",
  "npm run release:sources:verify",
  "actions/attest-build-provenance@4d101475d8b20a2381f78447822ac1eab6504dd8",
  "subject-digest",
  "push-to-registry",
  "dist/loyalty-dashboard.cdx.json",
  "dist/loyalty-worker.cdx.json",
  ...releasePayloads.slice(3),
  "gh release create",
]) {
  requireCondition(
    releaseStepContract.includes(requiredCommand),
    `${releaseWorkflowPath}: release job must execute ${requiredCommand}`,
  );
}
const releaseStepIndex = (name) =>
  releaseSteps.findIndex((step) => step.name === name);
const orderedReleaseSteps = [
  "Build immutable application images",
  "Generate dashboard CycloneDX SBOM",
  "Generate worker CycloneDX SBOM",
  "Build exact corresponding source release artifacts",
  "Verify exact corresponding source release artifacts",
  "Write release checksums",
  "Authenticate to GitHub Container Registry",
  "Publish immutable application images and capture digests",
  "Attest release files",
  "Attest dashboard image",
  "Attest worker image",
  "Publish GitHub release",
].map(releaseStepIndex);
requireCondition(
  orderedReleaseSteps.every((index) => index >= 0) &&
    orderedReleaseSteps.every(
      (index, position) =>
        position === 0 || index > orderedReleaseSteps[position - 1],
    ),
  `${releaseWorkflowPath}: build SBOM source verification checksum publication attestation and release order must fail before publishing unsupported evidence`,
);
const imageBuildStep =
  releaseSteps[releaseStepIndex("Build immutable application images")];
const imagePublishStep =
  releaseSteps[
    releaseStepIndex("Publish immutable application images and capture digests")
  ];
requireCondition(
  imageBuildStep.id === "image_build" &&
    !imageBuildStep.run.includes("docker push") &&
    imagePublishStep.id === "images" &&
    imagePublishStep.run.includes(
      '[[ "$dashboard_digest" =~ ^sha256:[0-9a-f]{64}$ ]]',
    ) &&
    imagePublishStep.run.includes(
      '[[ "$worker_digest" =~ ^sha256:[0-9a-f]{64}$ ]]',
    ),
  `${releaseWorkflowPath}: local image build and post-SBOM digest-bound publication must remain separate`,
);
const sourceBuildStep =
  releaseSteps[
    releaseStepIndex("Build exact corresponding source release artifacts")
  ];
const sourceVerifyStep =
  releaseSteps[
    releaseStepIndex("Verify exact corresponding source release artifacts")
  ];
const checksumStep = releaseSteps[releaseStepIndex("Write release checksums")];
const registryAuthIndex = releaseStepIndex(
  "Authenticate to GitHub Container Registry",
);
const sourceArgumentContract = [
  "--dashboard-sbom dist/loyalty-dashboard.cdx.json",
  "--worker-sbom dist/loyalty-worker.cdx.json",
  '--candidate-commit "$GITHUB_SHA"',
  '--tag "$GITHUB_REF_NAME"',
  '--source-date-epoch "$source_date_epoch"',
  "--output-dir dist",
];
requireCondition(
  sourceBuildStep?.run?.includes("npm run release:sources:build") &&
    sourceVerifyStep?.run?.includes("npm run release:sources:verify") &&
    [sourceBuildStep, sourceVerifyStep].every((step) =>
      sourceArgumentContract.every((argument) => step.run.includes(argument)),
    ) &&
    releaseStepIndex("Verify exact corresponding source release artifacts") <
      registryAuthIndex &&
    releaseStepIndex("Verify exact corresponding source release artifacts") <
      releaseStepIndex(
        "Publish immutable application images and capture digests",
      ),
  `${releaseWorkflowPath}: exact source build and independent verification must complete before registry authentication or image publication`,
);
requireCondition(
  normalizeShell(checksumStep?.run) ===
    `sha256sum ${releasePayloads.join(" ")} > dist/SHA256SUMS` &&
    exactDistPaths(checksumStep.run) === exactAttestedReleasePaths,
  `${releaseWorkflowPath}: the checksum file must bind every release payload`,
);
const fileAttestationStep =
  releaseSteps[releaseStepIndex("Attest release files")];
const releasePublicationStep =
  releaseSteps[releaseStepIndex("Publish GitHub release")];
requireCondition(
  fileAttestationStep?.with?.["subject-path"]
    ?.split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(",") === attestedReleaseFiles.join(",") &&
    normalizeShell(releasePublicationStep?.run) ===
      `gh release create "$GITHUB_REF_NAME" ${attestedReleaseFiles.join(" ")} --verify-tag --generate-notes --title "Starfiniti Loyalty $GITHUB_REF_NAME"` &&
    exactDistPaths(releasePublicationStep.run) === exactAttestedReleasePaths,
  `${releaseWorkflowPath}: release publication and file provenance must include all seven exact files`,
);

const dashboardNextConfig = readFileSync(
  "apps/dashboard/next.config.ts",
  "utf8",
);
const dashboardStandalonePreparation = readFileSync(
  "apps/dashboard/scripts/prepare-standalone.mjs",
  "utf8",
);
requireCondition(
  /images:\s*\{\s*unoptimized:\s*true,?\s*\}/u.test(dashboardNextConfig) &&
    dashboardStandalonePreparation.includes("node_modules/sharp/") &&
    dashboardStandalonePreparation.includes("node_modules/@img/") &&
    dashboardStandalonePreparation.includes(
      "Refusing to remove unexpected traced @img package",
    ),
  "dashboard must disable its unused optimizer and fail closed before pruning the traced sharp runtime family",
);

requireCondition(
  securityWorkflow?.on?.pull_request !== undefined &&
    securityWorkflow?.on?.push?.branches?.includes("main") &&
    Array.isArray(securityWorkflow?.on?.schedule) &&
    securityWorkflow?.on?.workflow_dispatch !== undefined,
  `${securityWorkflowPath}: pull request main schedule and manual triggers are required`,
);
requireCondition(
  securityWorkflow?.permissions?.contents === "read" &&
    Object.keys(securityWorkflow.permissions).length === 1,
  `${securityWorkflowPath}: default permissions must remain contents-read only`,
);
requireCondition(
  Object.keys(securityWorkflow?.jobs ?? {})
    .sort()
    .join(",") === "codeql,dast,recovery-transport,supply-chain",
  `${securityWorkflowPath}: exact CodeQL supply-chain recovery-transport and DAST jobs are required`,
);

for (const [jobName, job] of Object.entries(securityWorkflow?.jobs ?? {})) {
  requireCondition(
    job["runs-on"] === "ubuntu-latest" &&
      Number.isInteger(job["timeout-minutes"]) &&
      job["timeout-minutes"] <= 40,
    `${securityWorkflowPath}: ${jobName} must be a bounded Ubuntu job`,
  );
  for (const step of job.steps ?? []) {
    if (step.uses) {
      requireCondition(
        /^[^@]+@[0-9a-f]{40}$/u.test(step.uses),
        `${securityWorkflowPath}: ${jobName} action must be pinned to a full commit SHA: ${step.uses}`,
      );
    }
  }
}

requireCondition(
  securityWorkflow.jobs.codeql?.permissions?.contents === "read" &&
    securityWorkflow.jobs.codeql?.permissions?.["security-events"] ===
      "write" &&
    Object.keys(securityWorkflow.jobs.codeql.permissions).length === 2,
  `${securityWorkflowPath}: CodeQL permissions must be exact`,
);
const codeqlSteps = securityWorkflow.jobs.codeql.steps;
requireCondition(
  codeqlSteps.some(
    (step) =>
      step.uses ===
        "github/codeql-action/init@cdf488f595d80d6e07e03d4674febd5ab45fa938" &&
      step.with?.languages === "javascript-typescript" &&
      step.with?.["build-mode"] === "none" &&
      step.with?.queries === "security-extended",
  ),
  `${securityWorkflowPath}: CodeQL must use the reviewed JavaScript security-extended configuration`,
);
requireCondition(
  codeqlSteps.some(
    (step) =>
      step.uses ===
      "github/codeql-action/analyze@cdf488f595d80d6e07e03d4674febd5ab45fa938",
  ),
  `${securityWorkflowPath}: CodeQL analysis step is required`,
);

const supplySteps = securityWorkflow.jobs["supply-chain"].steps;
const supplyInstallIndex = supplySteps.findIndex(
  (step) =>
    step.name ===
      "Install exact repository dependencies without lifecycle scripts" &&
    step.run === "npm ci --ignore-scripts",
);
const supplyInventoryIndex = supplySteps.findIndex(
  (step) => step.name === "Verify exact reciprocal source inventory",
);
requireCondition(
  supplySteps.some(
    (step) =>
      step.uses ===
        "actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444" &&
      step.with?.["node-version"] === 24 &&
      step.with?.cache === "npm",
  ) &&
    supplySteps.some((step) => step.run === "npm audit --audit-level=high") &&
    supplyInstallIndex >= 0 &&
    supplyInstallIndex < supplyInventoryIndex,
  `${securityWorkflowPath}: exact no-lifecycle dependency installation and full dependency audit are required before source inventory`,
);
const trivySteps = supplySteps.filter(
  (step) =>
    step.uses ===
    "aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25",
);
requireCondition(
  trivySteps.length === 5 &&
    trivySteps.every((step) => step.with?.version === "v0.74.0"),
  `${securityWorkflowPath}: five scans with the reviewed Trivy version are required`,
);
const imageReports = trivySteps.filter(
  (step) =>
    step.with?.["scan-type"] === "image" && step.with?.["exit-code"] === "0",
);
requireCondition(
  imageReports.length === 2 &&
    imageReports
      .map((step) => step.with?.["image-ref"])
      .sort()
      .join(",") ===
      "starfiniti-dashboard:security,starfiniti-worker:security" &&
    imageReports.every(
      (step) =>
        step.with?.scanners === "vuln,misconfig,license" &&
        step.with?.severity === "UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL" &&
        step.with?.["ignore-unfixed"] === "false" &&
        step.with?.format === "json" &&
        /^dist\/security\/(?:dashboard|worker)-trivy\.json$/u.test(
          step.with?.output ?? "",
        ) &&
        step.with?.["trivy-config"] === trivyPolicyPath,
    ),
  `${securityWorkflowPath}: both deployable images require full-severity secret-free review reports`,
);
const imageEnforcement = trivySteps.filter(
  (step) =>
    step.with?.["scan-type"] === "image" && step.with?.["exit-code"] === "1",
);
requireCondition(
  imageEnforcement.length === 2 &&
    imageEnforcement
      .map((step) => step.with?.["image-ref"])
      .sort()
      .join(",") ===
      "starfiniti-dashboard:security,starfiniti-worker:security" &&
    imageEnforcement.every(
      (step) =>
        step.with?.scanners === "vuln,secret,misconfig,license" &&
        step.with?.severity === "UNKNOWN,HIGH,CRITICAL" &&
        step.with?.["ignore-unfixed"] === "false" &&
        step.with?.format === "table" &&
        step.with?.["trivy-config"] === trivyPolicyPath,
    ),
  `${securityWorkflowPath}: both deployable images must fail on unknown high or critical vulnerability secret misconfiguration and policy-classified licence findings`,
);
requireCondition(
  trivySteps.some(
    (step) =>
      step.with?.["scan-type"] === "fs" &&
      step.with?.["scan-ref"] === "." &&
      step.with?.scanners === "secret,misconfig" &&
      step.with?.["exit-code"] === "1" &&
      step.with?.format === "table",
  ),
  `${securityWorkflowPath}: repository secret and misconfiguration scan is required`,
);
const license = trivyPolicy?.license;
const acceptedCopyleft = [
  "AGPL-3.0-or-later",
  "GPL-2.0-only",
  "GPL-2.0-or-later",
  "GPL-3.0-only",
  "GPL-3.0-or-later",
  "LGPL-3.0-or-later",
];
const prohibitedLicenses = [
  "BUSL-1.1",
  "Commons-Clause",
  "Elastic-2.0",
  "SSPL-1.0",
];
const policyCategories = [
  ...(license?.forbidden ?? []),
  ...(license?.restricted ?? []),
  ...(license?.reciprocal ?? []),
  ...(license?.permissive ?? []),
];
requireCondition(
  Object.keys(license ?? {})
    .sort()
    .join(",") ===
    "confidenceLevel,forbidden,full,ignored,permissive,reciprocal,restricted" &&
    license?.confidenceLevel === 0.9 &&
    license?.full === false &&
    Array.isArray(license?.ignored) &&
    license.ignored.length === 0 &&
    policyCategories.length === new Set(policyCategories).size &&
    acceptedCopyleft.every(
      (id) =>
        license.reciprocal?.includes(id) &&
        !license.forbidden?.includes(id) &&
        !license.restricted?.includes(id),
    ) &&
    ["MIT-0", "SIL OPEN FONT LICENSE"].every((id) =>
      license.permissive?.includes(id),
    ) &&
    prohibitedLicenses.every((id) => license.forbidden?.includes(id)),
  `${trivyPolicyPath}: explicit AGPL-compatible reciprocal and prohibited licence policy is required`,
);
requireCondition(
  supplySteps.some(
    (step) =>
      step.name === "Verify exact worker runtime modules" &&
      step.run?.includes("starfiniti-worker:security") &&
      step.run.includes(workerRuntimeProbe),
  ),
  `${securityWorkflowPath}: built worker image must import every exact runtime package before scanning`,
);
const sbomSteps = supplySteps.filter(
  (step) =>
    step.uses ===
    "anchore/sbom-action@e22c389904149dbc22b58101806040fa8d37a610",
);
requireCondition(
  sbomSteps.length === 2 &&
    sbomSteps.every(
      (step) =>
        step.with?.format === "cyclonedx-json" &&
        step.with?.["syft-version"] === "v1.51.0" &&
        step.with?.["upload-artifact"] === "false" &&
        step.with?.["upload-release-assets"] === "false",
    ),
  `${securityWorkflowPath}: exact pinned dashboard and worker CycloneDX generation is required`,
);
requireCondition(
  supplySteps.some(
    (step) =>
      step.name === "Verify exact reciprocal source inventory" &&
      step.run?.includes("npm run release:sources:inventory") &&
      step.run.includes("--dashboard-sbom dist/security/dashboard.cdx.json") &&
      step.run.includes("--worker-sbom dist/security/worker.cdx.json"),
  ),
  `${securityWorkflowPath}: both exact image SBOMs must pass the reciprocal source inventory contract`,
);
requireCondition(
  supplySteps.some(
    (step) =>
      step.name === "Upload minimized supply-chain evidence" &&
      step.if === "always()" &&
      step.with?.name === "security-supply-chain-${{ github.sha }}" &&
      step.with?.path?.includes("dist/security/*-trivy.json") &&
      step.with?.path?.includes("dist/security/*.cdx.json") &&
      step.with?.["if-no-files-found"] === "error",
  ),
  `${securityWorkflowPath}: minimized review reports and SBOMs must upload even when enforcement fails`,
);

const recoveryTransportSteps =
  securityWorkflow.jobs["recovery-transport"].steps;
const recoveryTransportText = recoveryTransportSteps
  .map((step) => step.run ?? "")
  .join("\n");
requireCondition(
  recoveryTransportSteps.some(
    (step) =>
      step.uses ===
        "actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444" &&
      step.with?.["node-version"] === 24 &&
      step.with?.cache === "npm",
  ) &&
    recoveryTransportSteps.some((step) => step.run === "npm ci") &&
    recoveryTransportSteps.some(
      (step) => step.run === "npm run recovery-transport:validate",
    ) &&
    recoveryTransportSteps.some(
      (step) =>
        step.run ===
        "npm run recovery-transport:run -- --out dist/recovery-transport/ci.json",
    ),
  `${securityWorkflowPath}: recovery transport must validate and execute the exact repository plan`,
);
requireCondition(
  recoveryTransportSteps.some(
    (step) =>
      step.name === "Upload minimized recovery transport evidence" &&
      step.if === "always()" &&
      step.uses ===
        "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a" &&
      step.with?.name === "security-recovery-transport-${{ github.sha }}" &&
      step.with?.path === "dist/recovery-transport/ci.json" &&
      step.with?.["if-no-files-found"] === "error" &&
      step.with?.["retention-days"] === 30,
  ),
  `${securityWorkflowPath}: minimized exact-head recovery transport evidence must upload or fail`,
);
requireCondition(
  !recoveryTransportText.includes("--publish") &&
    !recoveryTransportText.includes("--network host") &&
    !recoveryTransportText.includes("production") &&
    !recoveryTransportText.includes("ssh"),
  `${securityWorkflowPath}: recovery transport canary must not publish ports or name production access`,
);

const dastText = securityWorkflow.jobs.dast.steps
  .map((step) => step.run ?? "")
  .join("\n");
for (const requirement of [
  "docker network create --internal starfiniti-dast",
  "--name starfiniti-dast-target --network starfiniti-dast",
  "com.starfiniti.disposable=true",
  "ghcr.io/zaproxy/zaproxy@sha256:781a2bdaea47324e7bab583e2263f21d257b0aee61ed51521a5be45f5f5081ef",
  "Content-Security-Policy:",
  "script-src 'self' 'nonce-[A-Za-z0-9+/]{48}' 'strict-dynamic'",
  "frame-ancestors 'none'",
  "X-Frame-Options:",
  "X-Content-Type-Options:",
  "script-src[^;]*'unsafe-inline'",
  "/_next/image?",
  "r.status!==404",
  "zap.sh -cmd -autorun /zap/wrk/infrastructure/testing/security/zap-automation.yaml",
  "docker rm --force starfiniti-dast-target",
  "docker network rm starfiniti-dast",
]) {
  requireCondition(
    dastText.includes(requirement),
    `${securityWorkflowPath}: isolated DAST requirement is missing: ${requirement}`,
  );
}
requireCondition(
  !dastText.includes("--publish") &&
    !dastText.includes("--network host") &&
    !dastText.split("\n").some((line) => line.trimStart().startsWith("-p ")) &&
    (dastText.match(/https?:\/\/[^\s"']+/gu) ?? []).every((url) =>
      url.startsWith("http://127.0.0.1:"),
    ),
  `${securityWorkflowPath}: DAST control must not publish a port use host networking or name an external origin`,
);

const deploymentEnvironment = readFileSync(
  "infrastructure/environments/proxmox/.env.example",
  "utf8",
);
for (const variable of ["DASHBOARD_IMAGE=", "WORKER_IMAGE="]) {
  requireCondition(
    deploymentEnvironment
      .split(/\r?\n/u)
      .some((line) => line.startsWith(variable)),
    `Proxmox environment example must declare ${variable}`,
  );
}

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
requireCondition(
  /^\d+\.\d+\.\d+$/u.test(packageJson.devDependencies?.supabase ?? ""),
  "Supabase CLI must be pinned to an exact version",
);

console.log(
  `Validated ${Object.keys(workflow.jobs).length} CI job(s), ${Object.keys(securityWorkflow.jobs).length} security job(s), release SBOM/provenance, pinned actions, and container inputs.`,
);
