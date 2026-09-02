import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const evidencePath =
  "docs/plan/evidence/M15/solo-maintainer-policy-2026-09-02.yaml";
const adrPath =
  "docs/architecture/ADR/0124-temporary-solo-maintainer-merge-policy.md";
const validationCommand = "npm run solo-maintainer:validate";
const expectedChecks = [
  { context: "CodeQL", appId: 57789 },
  { context: "baseline", appId: 15368 },
  { context: "codeql", appId: 15368 },
  { context: "containers", appId: 15368 },
  { context: "dast", appId: 15368 },
  { context: "database", appId: 15368 },
  { context: "recovery-transport", appId: 15368 },
  { context: "supply-chain", appId: 15368 },
  { context: "woocommerce-runtime (current-hpos)", appId: 15368 },
  { context: "woocommerce-runtime (current-legacy)", appId: 15368 },
  { context: "woocommerce-runtime (minimum-hpos)", appId: 15368 },
  { context: "woocommerce-runtime (minimum-legacy)", appId: 15368 },
];

function fail(message) {
  throw new Error(`Solo-maintainer policy invalid: ${message}`);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  const actual = Object.keys(value);
  if (
    actual.length !== expected.length ||
    expected.some((key) => !Object.hasOwn(value, key))
  ) {
    fail(`${label} keys differ`);
  }
}

function exactUtc(value, label) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value)
  ) {
    fail(`${label} must be an exact UTC timestamp`);
  }
  const time = Date.parse(value);
  if (
    !Number.isFinite(time) ||
    new Date(time).toISOString() !== value.replace("Z", ".000Z")
  ) {
    fail(`${label} is invalid`);
  }
  return time;
}

function validate(document, now = Date.now()) {
  exactKeys(
    document,
    [
      "schema",
      "status",
      "decision",
      "repository",
      "previousProtection",
      "activeProtection",
      "compensatingControls",
      "termination",
      "rollback",
      "nonClaims",
    ],
    "document",
  );
  if (
    document.schema !== "starfiniti.solo-maintainer-merge-policy.v1" ||
    document.status !== "active"
  ) {
    fail("schema or status differs");
  }

  exactKeys(
    document.decision,
    ["approvedAt", "approvedBy", "authoritySource", "scope", "reason"],
    "decision",
  );
  const approvedAt = exactUtc(document.decision.approvedAt, "approvedAt");
  if (
    document.decision.approvedBy !== "Starfiniti" ||
    document.decision.authoritySource !==
      "owner instruction in Codex thread 019ff11c-497b-7760-94ed-f49cf9710899" ||
    document.decision.scope !== "protected main pull-request merges" ||
    document.decision.reason !==
      "The repository has one administrator and no eligible second reviewer; the owner explicitly selected temporary solo operation."
  ) {
    fail("owner decision differs");
  }

  exactKeys(
    document.repository,
    ["owner", "name", "defaultBranch", "collaboratorCount", "collaborator"],
    "repository",
  );
  exactKeys(
    document.repository.collaborator,
    ["login", "id", "admin"],
    "collaborator",
  );
  if (
    document.repository.owner !== "Starfiniti" ||
    document.repository.name !== "starfiniti-loyalty" ||
    document.repository.defaultBranch !== "main" ||
    document.repository.collaboratorCount !== 1 ||
    document.repository.collaborator.login !== "Starfiniti" ||
    document.repository.collaborator.id !== 120020919 ||
    document.repository.collaborator.admin !== true
  ) {
    fail("repository authority differs");
  }

  exactKeys(
    document.previousProtection,
    [
      "observedAt",
      "pullRequestRequired",
      "requiredApprovingReviewCount",
      "dismissStaleReviews",
      "requireLastPushApproval",
    ],
    "previous protection",
  );
  const previousObservedAt = exactUtc(
    document.previousProtection.observedAt,
    "previousProtection.observedAt",
  );
  if (
    document.previousProtection.pullRequestRequired !== true ||
    document.previousProtection.requiredApprovingReviewCount !== 1 ||
    document.previousProtection.dismissStaleReviews !== true ||
    document.previousProtection.requireLastPushApproval !== true
  ) {
    fail("previous protection is not the exact rollback precondition");
  }

  exactKeys(
    document.activeProtection,
    [
      "observedAt",
      "pullRequestRequired",
      "requiredApprovingReviewCount",
      "dismissStaleReviews",
      "requireLastPushApproval",
      "strictRequiredChecks",
      "requiredChecks",
      "signedCommits",
      "conversationResolution",
      "administratorEnforcement",
      "forcePushesAllowed",
      "deletionsAllowed",
    ],
    "active protection",
  );
  const activeObservedAt = exactUtc(
    document.activeProtection.observedAt,
    "activeProtection.observedAt",
  );
  if (
    activeObservedAt <= previousObservedAt ||
    activeObservedAt < approvedAt ||
    document.activeProtection.pullRequestRequired !== true ||
    document.activeProtection.requiredApprovingReviewCount !== 0 ||
    document.activeProtection.dismissStaleReviews !== false ||
    document.activeProtection.requireLastPushApproval !== false ||
    document.activeProtection.strictRequiredChecks !== true ||
    JSON.stringify(document.activeProtection.requiredChecks) !==
      JSON.stringify(expectedChecks) ||
    document.activeProtection.signedCommits !== true ||
    document.activeProtection.conversationResolution !== true ||
    document.activeProtection.administratorEnforcement !== true ||
    document.activeProtection.forcePushesAllowed !== false ||
    document.activeProtection.deletionsAllowed !== false
  ) {
    fail("active protection differs");
  }

  exactKeys(
    document.compensatingControls,
    [
      "exactHeadChecksRequired",
      "adversarialDiffReviewRequired",
      "ownerMergeDecisionRequired",
      "releaseWorkflowState",
      "releaseCoolingOffSeconds",
      "newestRequiredCheckMustPass",
      "productionDeploymentAuthorized",
    ],
    "compensating controls",
  );
  if (
    document.compensatingControls.exactHeadChecksRequired !== true ||
    document.compensatingControls.adversarialDiffReviewRequired !== true ||
    document.compensatingControls.ownerMergeDecisionRequired !== true ||
    document.compensatingControls.releaseWorkflowState !==
      "disabled_manually" ||
    document.compensatingControls.releaseCoolingOffSeconds !== 86400 ||
    document.compensatingControls.newestRequiredCheckMustPass !== true ||
    document.compensatingControls.productionDeploymentAuthorized !== false
  ) {
    fail("compensating controls differ");
  }

  exactKeys(
    document.termination,
    [
      "expiresAt",
      "restoreOnSecondEligibleCollaborator",
      "restoreOnOwnerRevocation",
      "failClosedAfterExpiry",
    ],
    "termination",
  );
  const expiresAt = exactUtc(document.termination.expiresAt, "expiresAt");
  if (
    expiresAt <= approvedAt ||
    expiresAt - approvedAt > 90 * 24 * 60 * 60 * 1000 ||
    now >= expiresAt ||
    document.termination.restoreOnSecondEligibleCollaborator !== true ||
    document.termination.restoreOnOwnerRevocation !== true ||
    document.termination.failClosedAfterExpiry !== true
  ) {
    fail("termination boundary differs or has expired");
  }

  exactKeys(document.rollback, ["method", "endpoint", "payload"], "rollback");
  exactKeys(
    document.rollback.payload,
    [
      "dismiss_stale_reviews",
      "require_code_owner_reviews",
      "required_approving_review_count",
      "require_last_push_approval",
    ],
    "rollback payload",
  );
  if (
    document.rollback.method !== "PATCH" ||
    document.rollback.endpoint !==
      "repos/Starfiniti/starfiniti-loyalty/branches/main/protection/required_pull_request_reviews" ||
    document.rollback.payload.dismiss_stale_reviews !== true ||
    document.rollback.payload.require_code_owner_reviews !== false ||
    document.rollback.payload.required_approving_review_count !== 1 ||
    document.rollback.payload.require_last_push_approval !== true
  ) {
    fail("rollback differs");
  }
  if (
    JSON.stringify(document.nonClaims) !==
    JSON.stringify([
      "independent review occurred",
      "penetration testing is complete",
      "release is approved",
      "deployment is approved",
      "GA is approved",
    ])
  ) {
    fail("non-claims differ");
  }
}

function validateBindings() {
  const rootPackage = JSON.parse(
    readFileSync(join(root, "package.json"), "utf8"),
  );
  if (
    rootPackage.scripts?.["solo-maintainer:validate"] !==
      "node scripts/validate-solo-maintainer-policy.mjs --self-test" ||
    !rootPackage.scripts?.check?.includes(validationCommand)
  ) {
    fail("package validation wiring differs");
  }
  const tasks = readFileSync(join(root, "docs/plan/TASKS.yaml"), "utf8");
  const release = readFileSync(
    join(root, "docs/operations/RELEASE.md"),
    "utf8",
  );
  const workflow = readFileSync(
    join(root, ".github/workflows/release.yml"),
    "utf8",
  );
  for (const [path, content] of [
    [evidencePath, tasks],
    [adrPath, tasks],
    [validationCommand, tasks],
    ["Temporary solo-maintainer", release],
    ["minimum_release_cooling_seconds=86400", workflow],
    [
      ".required_pull_request_reviews.required_approving_review_count == 0",
      workflow,
    ],
  ]) {
    if (!content.includes(path)) fail(`binding is missing: ${path}`);
  }
}

function selfTest(document) {
  const cases = [
    ["unknown field", (value) => (value.extra = true)],
    [
      "false independent authority",
      (value) => (value.status = "independently_reviewed"),
    ],
    [
      "second collaborator",
      (value) => (value.repository.collaboratorCount = 2),
    ],
    [
      "review restored without evidence",
      (value) => (value.activeProtection.requiredApprovingReviewCount = 1),
    ],
    [
      "required check removed",
      (value) => value.activeProtection.requiredChecks.pop(),
    ],
    [
      "unsigned commit allowed",
      (value) => (value.activeProtection.signedCommits = false),
    ],
    [
      "force push allowed",
      (value) => (value.activeProtection.forcePushesAllowed = true),
    ],
    [
      "cooling removed",
      (value) => (value.compensatingControls.releaseCoolingOffSeconds = 0),
    ],
    [
      "release overclaim",
      (value) =>
        (value.compensatingControls.productionDeploymentAuthorized = true),
    ],
    [
      "rollback weakened",
      (value) => (value.rollback.payload.required_approving_review_count = 0),
    ],
  ];
  for (const [label, mutate] of cases) {
    const candidate = structuredClone(document);
    mutate(candidate);
    let rejected = false;
    try {
      validate(candidate, Date.parse("2026-09-03T00:00:00Z"));
    } catch {
      rejected = true;
    }
    if (!rejected) fail(`self-test accepted ${label}`);
  }
  return cases.length;
}

const document = YAML.parse(readFileSync(join(root, evidencePath), "utf8"));
validate(document);
validateBindings();
if (process.argv.includes("--self-test")) {
  console.log(
    `Solo-maintainer policy valid; ${selfTest(document)} corruption cases rejected.`,
  );
} else {
  console.log("Solo-maintainer policy valid.");
}
