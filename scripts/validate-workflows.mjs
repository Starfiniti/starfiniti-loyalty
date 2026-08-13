import { readFileSync } from "node:fs";
import { parse } from "yaml";

const workflowPath = ".github/workflows/ci.yml";
const workflow = parse(readFileSync(workflowPath, "utf8"));
const releaseWorkflowPath = ".github/workflows/release.yml";
const releaseWorkflow = parse(readFileSync(releaseWorkflowPath, "utf8"));

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
    releaseWorkflow?.permissions?.packages === "write",
  `${releaseWorkflowPath}: release and package write permissions are required`,
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
for (const requiredCommand of [
  "npm run check",
  "npm run db:verify",
  "npm run woocommerce:package",
  "docker login ghcr.io",
  "apps/dashboard/Dockerfile",
  "apps/worker/Dockerfile",
  "gh release create",
]) {
  requireCondition(
    releaseSteps.some((step) => step.run?.includes(requiredCommand)),
    `${releaseWorkflowPath}: release job must execute ${requiredCommand}`,
  );
}

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
  `Validated ${Object.keys(workflow.jobs).length} CI job(s), release publication, pinned actions, and container inputs.`,
);
