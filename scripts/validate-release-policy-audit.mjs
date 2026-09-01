import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const realRoot = realpathSync.native(root);
const evidencePath =
  "docs/plan/evidence/M15/release-policy-audit-2026-09-01.yaml";
const hardeningEvidencePath =
  "docs/plan/evidence/M15/release-policy-hardening-2026-09-01.yaml";
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
const expectedHardeningChecks = [
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
const expectedHardeningGates = [
  "add an eligible independent repository reviewer and obtain approval on the exact candidate",
  "create and verify the signed annotated version tag at exact approved main",
  "create the protected release environment",
  "configure an independent environment reviewer and prevent self-review",
  "independently verify environment administrator bypass is disabled",
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

function readEvidence(relativePath) {
  const absolute = resolve(root, relativePath);
  const rootPrefix = `${resolve(root)}${sep}`;
  if (!absolute.startsWith(rootPrefix)) fail("audit path escapes repository");
  let descriptor;
  try {
    descriptor = openSync(
      absolute,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    let parent = root;
    for (const segment of relativePath.split("/").slice(0, -1)) {
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

function validateHardening(document, audit) {
  exactKeys(
    document,
    [
      "schema",
      "status",
      "observedAt",
      "precondition",
      "repository",
      "workflow",
      "production",
      "branchProtection",
      "tagRulesets",
      "releaseEnvironment",
      "policyToken",
      "approvals",
      "mutation",
      "remainingGates",
    ],
    "hardening evidence",
  );
  if (
    document.schema !== "starfiniti.github-release-policy-hardening.v1" ||
    document.status !== "partially_hardened" ||
    document.observedAt !== "2026-09-01T10:00:52Z" ||
    exactUtc(document.observedAt, "hardening observedAt") <=
      exactUtc(audit.observedAt, "audit observedAt")
  ) {
    fail("hardening identity or chronology differs");
  }

  exactKeys(
    document.precondition,
    ["path", "sha256"],
    "hardening precondition",
  );
  const originalDigest = createHash("sha256")
    .update(readFileSync(join(root, evidencePath)))
    .digest("hex");
  if (
    document.precondition.path !== evidencePath ||
    document.precondition.sha256 !== originalDigest ||
    originalDigest !==
      "d50088031448244ec620e58c5959fcd70b77935c3a56fecba7c6910fba2ee85b"
  ) {
    fail("hardening precondition binding differs");
  }

  exactKeys(
    document.repository,
    [
      "owner",
      "name",
      "defaultBranch",
      "mainCommit",
      "visibility",
      "administratorAuthorityObserved",
    ],
    "hardening repository",
  );
  if (
    document.repository.owner !== "Starfiniti" ||
    document.repository.name !== "starfiniti-loyalty" ||
    document.repository.defaultBranch !== "main" ||
    document.repository.mainCommit !==
      "c85d93d0e6e0273543078050e697f04309f11d93" ||
    !commitPattern.test(document.repository.mainCommit ?? "") ||
    document.repository.visibility !== "public" ||
    document.repository.administratorAuthorityObserved !== true
  ) {
    fail("hardening repository identity differs");
  }

  exactKeys(
    document.workflow,
    ["id", "state", "releaseForCandidate"],
    "hardening workflow",
  );
  exactKeys(
    document.production,
    ["release", "changed"],
    "hardening production",
  );
  if (
    document.workflow.id !== 333373957 ||
    document.workflow.state !== "disabled_manually" ||
    document.workflow.releaseForCandidate !== false ||
    document.production.release !== "v0.1.11" ||
    document.production.changed !== false
  ) {
    fail("hardening release or production boundary differs");
  }

  exactKeys(
    document.branchProtection,
    [
      "exists",
      "strictRequiredChecks",
      "requiredChecks",
      "signedCommitsRequired",
      "administratorEnforcement",
      "approvingReviewsRequired",
      "dismissStaleReviews",
      "lastPusherCannotApprove",
      "conversationsResolved",
      "forcePushesAllowed",
      "deletionsAllowed",
      "independentEligibleReviewerCount",
    ],
    "hardening branch protection",
  );
  if (
    document.branchProtection.exists !== true ||
    document.branchProtection.strictRequiredChecks !== true ||
    document.branchProtection.signedCommitsRequired !== true ||
    document.branchProtection.administratorEnforcement !== true ||
    document.branchProtection.approvingReviewsRequired !== 1 ||
    document.branchProtection.dismissStaleReviews !== true ||
    document.branchProtection.lastPusherCannotApprove !== true ||
    document.branchProtection.conversationsResolved !== true ||
    document.branchProtection.forcePushesAllowed !== false ||
    document.branchProtection.deletionsAllowed !== false ||
    document.branchProtection.independentEligibleReviewerCount !== 0 ||
    JSON.stringify(document.branchProtection.requiredChecks) !==
      JSON.stringify(expectedHardeningChecks)
  ) {
    fail("hardening branch protection differs");
  }
  for (const check of document.branchProtection.requiredChecks) {
    exactKeys(check, ["context", "appId"], "hardening required check");
  }

  exactKeys(
    document.tagRulesets,
    ["totalCount", "activeVersionTagCount", "creation", "immutability"],
    "hardening tag rulesets",
  );
  exactKeys(
    document.tagRulesets.creation,
    [
      "id",
      "name",
      "target",
      "enforcement",
      "include",
      "rules",
      "bypassActorType",
      "bypassActorId",
      "bypassMode",
      "bypassAudited",
    ],
    "hardening tag creation ruleset",
  );
  exactKeys(
    document.tagRulesets.immutability,
    [
      "id",
      "name",
      "target",
      "enforcement",
      "include",
      "rules",
      "bypassActorCount",
    ],
    "hardening tag immutability ruleset",
  );
  const creation = document.tagRulesets.creation;
  const immutability = document.tagRulesets.immutability;
  if (
    document.tagRulesets.totalCount !== 2 ||
    document.tagRulesets.activeVersionTagCount !== 2 ||
    creation.id !== 22002643 ||
    creation.name !== "Release tag creation authority" ||
    creation.target !== "tag" ||
    creation.enforcement !== "active" ||
    creation.include !== "refs/tags/v*.*.*" ||
    JSON.stringify(creation.rules) !== JSON.stringify(["creation"]) ||
    creation.bypassActorType !== "User" ||
    creation.bypassActorId !== 120020919 ||
    creation.bypassMode !== "always" ||
    creation.bypassAudited !== true ||
    immutability.id !== 22002644 ||
    immutability.name !== "Signed immutable release tags" ||
    immutability.target !== "tag" ||
    immutability.enforcement !== "active" ||
    immutability.include !== "refs/tags/v*.*.*" ||
    JSON.stringify(immutability.rules) !==
      JSON.stringify(["update", "deletion", "required_signatures"]) ||
    immutability.bypassActorCount !== 0
  ) {
    fail("hardening tag ruleset boundary differs");
  }

  exactKeys(
    document.releaseEnvironment,
    [
      "exists",
      "independentReviewerConfigured",
      "preventSelfReview",
      "protectedBranchRestriction",
      "administratorBypassDisabled",
    ],
    "hardening release environment",
  );
  exactKeys(
    document.policyToken,
    [
      "repositorySecretNamed",
      "inheritedOrEnvironmentSecretObserved",
      "permissionReviewComplete",
    ],
    "hardening policy token",
  );
  exactKeys(
    document.approvals,
    ["releaseSecurity", "licence", "ownerRelease"],
    "hardening approvals",
  );
  if (
    document.releaseEnvironment.exists !== false ||
    document.releaseEnvironment.independentReviewerConfigured !== false ||
    document.releaseEnvironment.preventSelfReview !== false ||
    document.releaseEnvironment.protectedBranchRestriction !== false ||
    document.releaseEnvironment.administratorBypassDisabled !== null ||
    document.policyToken.repositorySecretNamed !== false ||
    document.policyToken.inheritedOrEnvironmentSecretObserved !== null ||
    document.policyToken.permissionReviewComplete !== false ||
    document.approvals.releaseSecurity !== false ||
    document.approvals.licence !== false ||
    document.approvals.ownerRelease !== false
  ) {
    fail("hardening external gate is overclaimed");
  }

  exactKeys(
    document.mutation,
    [
      "repositoryPolicyChanged",
      "branchProtectionChanged",
      "tagRulesetsChanged",
      "workflowChanged",
      "tagCreated",
      "releaseCreated",
      "deploymentChanged",
      "productionChanged",
      "rollback",
    ],
    "hardening mutation",
  );
  exactKeys(
    document.mutation.rollback,
    ["branchProtection", "tagRulesets"],
    "hardening rollback",
  );
  exactKeys(
    document.mutation.rollback.branchProtection,
    ["method", "endpoint"],
    "hardening branch rollback",
  );
  exactKeys(
    document.mutation.rollback.tagRulesets,
    ["method", "endpoints"],
    "hardening tag rollback",
  );
  if (
    document.mutation.repositoryPolicyChanged !== true ||
    document.mutation.branchProtectionChanged !== true ||
    document.mutation.tagRulesetsChanged !== true ||
    document.mutation.workflowChanged !== false ||
    document.mutation.tagCreated !== false ||
    document.mutation.releaseCreated !== false ||
    document.mutation.deploymentChanged !== false ||
    document.mutation.productionChanged !== false ||
    document.mutation.rollback.branchProtection.method !== "DELETE" ||
    document.mutation.rollback.branchProtection.endpoint !==
      "repos/Starfiniti/starfiniti-loyalty/branches/main/protection" ||
    document.mutation.rollback.tagRulesets.method !== "DELETE" ||
    JSON.stringify(document.mutation.rollback.tagRulesets.endpoints) !==
      JSON.stringify([
        "repos/Starfiniti/starfiniti-loyalty/rulesets/22002643",
        "repos/Starfiniti/starfiniti-loyalty/rulesets/22002644",
      ])
  ) {
    fail("hardening mutation or rollback boundary differs");
  }
  if (
    !Array.isArray(document.remainingGates) ||
    JSON.stringify(document.remainingGates) !==
      JSON.stringify(expectedHardeningGates)
  ) {
    fail("hardening remaining gates differ");
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
    !security?.evidence?.includes(hardeningEvidencePath) ||
    !security?.evidence?.includes("scripts/validate-release-policy-audit.mjs")
  ) {
    fail("M15 task binding differs");
  }
  const risks = readFileSync(join(root, "RISKS.md"), "utf8");
  if (!risks.includes("| R-064 |")) fail("R-064 is missing");
}

function selfTestAudit(document) {
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

function selfTestHardening(document, audit) {
  const cases = [
    ["unknown hardening field", (value) => (value.extra = true)],
    [
      "precondition digest drift",
      (value) => (value.precondition.sha256 = "0".repeat(64)),
    ],
    [
      "required check removal",
      (value) => value.branchProtection.requiredChecks.pop(),
    ],
    [
      "false reviewer availability",
      (value) => (value.branchProtection.independentEligibleReviewerCount = 1),
    ],
    [
      "immutable tag bypass",
      (value) => (value.tagRulesets.immutability.bypassActorCount = 1),
    ],
    [
      "environment overclaim after hardening",
      (value) => (value.releaseEnvironment.exists = true),
    ],
    [
      "token overclaim after hardening",
      (value) => (value.policyToken.repositorySecretNamed = true),
    ],
    [
      "approval overclaim after hardening",
      (value) => (value.approvals.ownerRelease = true),
    ],
    [
      "production mutation overclaim",
      (value) => (value.mutation.productionChanged = true),
    ],
    ["missing hardening gate", (value) => value.remainingGates.pop()],
  ];
  for (const [label, mutate] of cases) {
    const candidate = structuredClone(document);
    mutate(candidate);
    let rejected = false;
    try {
      validateHardening(candidate, audit);
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
const audit = readEvidence(evidencePath);
const hardening = readEvidence(hardeningEvidencePath);
validateAudit(audit);
validateHardening(hardening, audit);
validateBindings();
const cases = args.includes("--self-test")
  ? selfTestAudit(audit) + selfTestHardening(hardening, audit)
  : 0;
console.log(
  `Validated the disabled release workflow from absent controls through strict branch and immutable tag hardening${cases ? ` with ${cases} adversarial cases` : ""}; eight external release gates remain and no tag, release, deployment, or production mutation is claimed.`,
);
