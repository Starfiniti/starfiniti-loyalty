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
const evidencePath =
  "docs/plan/evidence/M15/release-policy-audit-2026-09-01.yaml";
const validationCommand = "npm run release-policy:audit:validate";
const commitPattern = /^[0-9a-f]{40}$/u;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u;
const expectedGates = [
  "protect main with exact required checks and signed-commit enforcement",
  "activate an exact version-tag ruleset with immutable signed tags",
  "create the protected release environment",
  "configure an independent required reviewer and prevent self-review",
  "independently verify administrator bypass is disabled",
  "supply and independently permission-review the read-only policy token",
  "close release-security and reciprocal-licence obligations",
  "approve the exact release separately from deployment",
];

function fail(message) {
  throw new Error(`Release-policy audit invalid: ${message}`);
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

function readAudit() {
  const absolute = resolve(root, evidencePath);
  const rootPrefix = `${resolve(root)}${sep}`;
  if (!absolute.startsWith(rootPrefix)) fail("audit path escapes repository");
  let descriptor;
  try {
    descriptor = openSync(
      absolute,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    let parent = root;
    for (const segment of evidencePath.split("/").slice(0, -1)) {
      parent = join(parent, segment);
      const status = lstatSync(parent);
      if (!status.isDirectory() || status.isSymbolicLink()) {
        fail("audit parent chain must contain only real directories");
      }
    }
    const opened = fstatSync(descriptor);
    const linked = lstatSync(absolute);
    const openedReal = realpathSync.native(absolute);
    const inside = relative(realRoot, openedReal);
    if (
      !opened.isFile() ||
      !linked.isFile() ||
      opened.dev !== linked.dev ||
      opened.ino !== linked.ino ||
      opened.size < 100 ||
      opened.size > 32 * 1024 ||
      inside === "" ||
      inside === ".." ||
      inside.startsWith(`..${sep}`)
    ) {
      fail("audit must be one bounded regular repository file");
    }
    const raw = readFileSync(descriptor, "utf8");
    const final = fstatSync(descriptor);
    if (
      Buffer.byteLength(raw, "utf8") !== opened.size ||
      final.dev !== opened.dev ||
      final.ino !== opened.ino ||
      final.size !== opened.size ||
      final.mtimeMs !== opened.mtimeMs ||
      final.ctimeMs !== opened.ctimeMs ||
      realpathSync.native(absolute) !== openedReal
    ) {
      fail("audit changed while reading");
    }
    return YAML.parse(raw);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function validateAudit(document) {
  exactKeys(
    document,
    [
      "schema",
      "status",
      "observedAt",
      "repository",
      "candidate",
      "workflow",
      "latestRelease",
      "branchProtection",
      "tagRulesets",
      "releaseEnvironment",
      "policyToken",
      "actionsPolicy",
      "approvals",
      "productionMutation",
      "remainingGates",
    ],
    "audit",
  );
  if (
    document.schema !== "starfiniti.github-release-policy-audit.v1" ||
    document.status !== "external_controls_absent"
  ) {
    fail("schema or status differs");
  }
  const observedAt = exactUtc(document.observedAt, "observedAt");
  if (document.observedAt !== "2026-09-01T09:09:45Z") {
    fail("observation identity differs");
  }

  exactKeys(
    document.repository,
    ["owner", "name", "visibility", "defaultBranch", "archived", "disabled"],
    "repository",
  );
  if (
    document.repository.owner !== "Starfiniti" ||
    document.repository.name !== "starfiniti-loyalty" ||
    document.repository.visibility !== "public" ||
    document.repository.defaultBranch !== "main" ||
    document.repository.archived !== false ||
    document.repository.disabled !== false
  ) {
    fail("repository identity differs");
  }

  exactKeys(
    document.candidate,
    ["mainCommit", "observedCheckCount", "successfulCheckCount"],
    "candidate",
  );
  if (
    document.candidate.mainCommit !==
      "c85d93d0e6e0273543078050e697f04309f11d93" ||
    !commitPattern.test(document.candidate.mainCommit ?? "") ||
    document.candidate.observedCheckCount !== 11 ||
    document.candidate.successfulCheckCount !== 11
  ) {
    fail("candidate evidence differs");
  }

  exactKeys(
    document.workflow,
    ["id", "name", "path", "state", "releaseForCandidate"],
    "workflow",
  );
  if (
    document.workflow.id !== 333373957 ||
    document.workflow.name !== "Release" ||
    document.workflow.path !== ".github/workflows/release.yml" ||
    document.workflow.state !== "disabled_manually" ||
    document.workflow.releaseForCandidate !== false
  ) {
    fail("workflow containment differs");
  }

  exactKeys(document.latestRelease, ["tag", "publishedAt"], "latest release");
  const publishedAt = exactUtc(
    document.latestRelease.publishedAt,
    "latest release publishedAt",
  );
  if (document.latestRelease.tag !== "v0.1.11" || publishedAt >= observedAt) {
    fail("latest release identity differs");
  }

  exactKeys(
    document.branchProtection,
    [
      "branch",
      "exists",
      "requiredChecksConfigured",
      "signedCommitsRequired",
      "administratorEnforcement",
    ],
    "branch protection",
  );
  if (
    document.branchProtection.branch !== "main" ||
    document.branchProtection.exists !== false ||
    document.branchProtection.requiredChecksConfigured !== false ||
    document.branchProtection.signedCommitsRequired !== false ||
    document.branchProtection.administratorEnforcement !== false
  ) {
    fail("branch protection is overclaimed");
  }

  exactKeys(
    document.tagRulesets,
    ["totalCount", "activeVersionTagCount"],
    "tag rulesets",
  );
  if (
    document.tagRulesets.totalCount !== 0 ||
    document.tagRulesets.activeVersionTagCount !== 0
  ) {
    fail("tag ruleset is overclaimed");
  }

  exactKeys(
    document.releaseEnvironment,
    [
      "totalCount",
      "exists",
      "independentReviewerConfigured",
      "preventSelfReview",
      "protectedBranchRestriction",
      "administratorBypassDisabled",
    ],
    "release environment",
  );
  if (
    document.releaseEnvironment.totalCount !== 0 ||
    document.releaseEnvironment.exists !== false ||
    document.releaseEnvironment.independentReviewerConfigured !== false ||
    document.releaseEnvironment.preventSelfReview !== false ||
    document.releaseEnvironment.protectedBranchRestriction !== false ||
    document.releaseEnvironment.administratorBypassDisabled !== null
  ) {
    fail("release environment is overclaimed");
  }

  exactKeys(
    document.policyToken,
    [
      "repositorySecretNamed",
      "inheritedOrEnvironmentSecretObserved",
      "permissionReviewComplete",
    ],
    "policy token",
  );
  if (
    document.policyToken.repositorySecretNamed !== false ||
    document.policyToken.inheritedOrEnvironmentSecretObserved !== null ||
    document.policyToken.permissionReviewComplete !== false
  ) {
    fail("policy token is overclaimed");
  }

  exactKeys(
    document.actionsPolicy,
    [
      "defaultWorkflowPermissions",
      "canApprovePullRequestReviews",
      "allowedActions",
      "shaPinningRequired",
    ],
    "actions policy",
  );
  if (
    document.actionsPolicy.defaultWorkflowPermissions !== "read" ||
    document.actionsPolicy.canApprovePullRequestReviews !== false ||
    document.actionsPolicy.allowedActions !== "all" ||
    document.actionsPolicy.shaPinningRequired !== false
  ) {
    fail("actions policy differs");
  }

  exactKeys(
    document.approvals,
    ["releaseSecurity", "licence", "ownerRelease"],
    "approvals",
  );
  if (
    document.approvals.releaseSecurity !== false ||
    document.approvals.licence !== false ||
    document.approvals.ownerRelease !== false ||
    document.productionMutation !== false
  ) {
    fail("approval or production authority is overclaimed");
  }
  if (
    !Array.isArray(document.remainingGates) ||
    document.remainingGates.length !== expectedGates.length ||
    document.remainingGates.some((gate, index) => gate !== expectedGates[index])
  ) {
    fail("remaining release gates differ");
  }
}

function validateBindings() {
  const rootPackage = JSON.parse(
    readFileSync(join(root, "package.json"), "utf8"),
  );
  if (
    rootPackage.scripts?.["release-policy:audit:validate"] !==
      "node scripts/validate-release-policy-audit.mjs --self-test" ||
    !rootPackage.scripts?.check?.includes(validationCommand)
  ) {
    fail("root validation wiring differs");
  }
  const tasks = YAML.parse(
    readFileSync(join(root, "docs/plan/TASKS.yaml"), "utf8"),
  );
  const m15 = tasks.tasks?.find((task) => task.id === "M15-GA-HARDENING");
  const security = m15?.slices?.find(
    (slice) => slice.id === "M15-S03-SUPPLY-CHAIN-AND-SECURITY",
  );
  if (
    !m15?.risks?.includes("R-064") ||
    !m15?.docs?.includes(
      "docs/architecture/ADR/0115-default-branch-controlled-sealed-releases.md",
    ) ||
    !m15?.docs?.includes("docs/operations/RELEASE.md") ||
    !security?.verification?.includes(validationCommand) ||
    !security?.evidence?.includes(evidencePath) ||
    !security?.evidence?.includes("scripts/validate-release-policy-audit.mjs")
  ) {
    fail("M15 task binding differs");
  }
  const risks = readFileSync(join(root, "RISKS.md"), "utf8");
  if (!risks.includes("| R-064 |")) fail("R-064 is missing");
}

function selfTest(document) {
  const cases = [
    ["unknown field", (value) => (value.extra = true)],
    ["schema drift", (value) => (value.schema = "v0")],
    [
      "observation drift",
      (value) => (value.observedAt = "2026-09-02T00:00:00Z"),
    ],
    [
      "repository drift",
      (value) => (value.repository.defaultBranch = "develop"),
    ],
    [
      "candidate drift",
      (value) => (value.candidate.mainCommit = "0".repeat(40)),
    ],
    ["workflow enablement", (value) => (value.workflow.state = "active")],
    [
      "release overclaim",
      (value) => (value.workflow.releaseForCandidate = true),
    ],
    ["branch overclaim", (value) => (value.branchProtection.exists = true)],
    ["ruleset overclaim", (value) => (value.tagRulesets.totalCount = 1)],
    [
      "environment overclaim",
      (value) => (value.releaseEnvironment.exists = true),
    ],
    [
      "token overclaim",
      (value) => (value.policyToken.repositorySecretNamed = true),
    ],
    ["approval overclaim", (value) => (value.approvals.ownerRelease = true)],
    ["production overclaim", (value) => (value.productionMutation = true)],
    ["missing gate", (value) => value.remainingGates.pop()],
  ];
  for (const [label, mutate] of cases) {
    const candidate = structuredClone(document);
    mutate(candidate);
    let rejected = false;
    try {
      validateAudit(candidate);
    } catch {
      rejected = true;
    }
    if (!rejected) fail(`self-test accepted ${label}`);
  }
  return cases.length;
}

const args = process.argv.slice(2);
if (args.some((argument) => argument !== "--self-test")) {
  fail("usage: node scripts/validate-release-policy-audit.mjs [--self-test]");
}
const audit = readAudit();
validateAudit(audit);
validateBindings();
const cases = args.includes("--self-test") ? selfTest(audit) : 0;
console.log(
  `Validated disabled release workflow and eight absent external policy gates${cases ? ` through ${cases} adversarial cases` : ""}; no repository or production mutation is claimed.`,
);
