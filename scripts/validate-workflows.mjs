import { readFileSync } from "node:fs";
import { parse } from "yaml";

const workflowPath = ".github/workflows/ci.yml";
const workflow = parse(readFileSync(workflowPath, "utf8"));

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

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
requireCondition(
  /^\d+\.\d+\.\d+$/u.test(packageJson.devDependencies?.supabase ?? ""),
  "Supabase CLI must be pinned to an exact version",
);

console.log(
  `Validated ${Object.keys(workflow.jobs).length} CI job(s) and pinned actions.`,
);
