import { readFileSync } from "node:fs";
import { parse } from "yaml";

const workflowPath = ".github/workflows/ci.yml";
const workflow = parse(readFileSync(workflowPath, "utf8"));
const releaseWorkflowPath = ".github/workflows/release.yml";
const releaseWorkflow = parse(readFileSync(releaseWorkflowPath, "utf8"));
const securityWorkflowPath = ".github/workflows/security.yml";
const securityWorkflow = parse(readFileSync(securityWorkflowPath, "utf8"));

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
}

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
for (const requiredCommand of [
  "npm run check",
  "npm run db:verify",
  "npm run woocommerce:package",
  "docker login ghcr.io",
  "apps/dashboard/Dockerfile",
  "apps/worker/Dockerfile",
  "cyclonedx-json",
  "actions/attest-build-provenance@4d101475d8b20a2381f78447822ac1eab6504dd8",
  "subject-digest",
  "push-to-registry",
  "dist/loyalty-dashboard.cdx.json",
  "dist/loyalty-worker.cdx.json",
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
  `${releaseWorkflowPath}: build SBOM checksum publication attestation and release order must fail before publishing unsupported evidence`,
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
    .join(",") === "codeql,dast,supply-chain",
  `${securityWorkflowPath}: exact CodeQL supply-chain and DAST jobs are required`,
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
requireCondition(
  supplySteps.some(
    (step) =>
      step.uses ===
        "actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444" &&
      step.with?.["node-version"] === 24 &&
      step.with?.cache === "npm",
  ) && supplySteps.some((step) => step.run === "npm audit --audit-level=high"),
  `${securityWorkflowPath}: full development and production dependency audit is required`,
);
const trivySteps = supplySteps.filter(
  (step) =>
    step.uses ===
    "aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25",
);
requireCondition(
  trivySteps.length === 3 &&
    trivySteps.every(
      (step) =>
        step.with?.version === "v0.74.0" && step.with?.["exit-code"] === "1",
    ),
  `${securityWorkflowPath}: three fail-closed scans with the reviewed Trivy version are required`,
);
const imageScans = trivySteps.filter(
  (step) => step.with?.["scan-type"] === "image",
);
requireCondition(
  imageScans.length === 2 &&
    imageScans.every(
      (step) =>
        step.with?.scanners === "vuln,secret,misconfig,license" &&
        step.with?.severity === "HIGH,CRITICAL" &&
        step.with?.["ignore-unfixed"] === "false",
    ),
  `${securityWorkflowPath}: both deployable images must fail on high or critical vulnerability secret misconfiguration and license findings`,
);
requireCondition(
  trivySteps.some(
    (step) =>
      step.with?.["scan-type"] === "fs" &&
      step.with?.["scan-ref"] === "." &&
      step.with?.scanners === "secret,misconfig",
  ),
  `${securityWorkflowPath}: repository secret and misconfiguration scan is required`,
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

const dastText = securityWorkflow.jobs.dast.steps
  .map((step) => step.run ?? "")
  .join("\n");
for (const requirement of [
  "docker network create --internal starfiniti-dast",
  "--name starfiniti-dast-target --network starfiniti-dast",
  "com.starfiniti.disposable=true",
  "ghcr.io/zaproxy/zaproxy@sha256:781a2bdaea47324e7bab583e2263f21d257b0aee61ed51521a5be45f5f5081ef",
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
