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
const securityHardeningEvidencePath =
  "docs/plan/evidence/M15/repository-security-hardening-2026-09-01.yaml";
const actionsPolicyCorrectionEvidencePath =
  "docs/plan/evidence/M15/repository-actions-policy-correction-2026-09-01.yaml";
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
const expectedSecurityHardeningGates = [
  "add an eligible independent repository reviewer and obtain approval on the exact candidate",
  "create and verify the signed annotated version tag at exact approved main",
  "create the protected release environment",
  "configure an independent environment reviewer and prevent self-review",
  "independently verify environment administrator bypass is disabled",
  "supply and independently permission-review the expanded read-only policy token",
  "close release-security and reciprocal-licence obligations",
  "approve the exact release separately from deployment",
];
const expectedActionPatterns = [
  "actions/attest-build-provenance@*",
  "actions/checkout@*",
  "actions/download-artifact@*",
  "actions/setup-node@*",
  "actions/upload-artifact@*",
  "anchore/sbom-action@*",
  "aquasecurity/trivy-action@*",
  "github/codeql-action@*",
];
const expectedCorrectedActionPatterns = [
  "actions/attest-build-provenance@*",
  "actions/cache@*",
  "actions/cache/restore@*",
  "actions/cache/save@*",
  "actions/checkout@*",
  "actions/download-artifact@*",
  "actions/setup-node@*",
  "actions/upload-artifact@*",
  "anchore/sbom-action@*",
  "aquasecurity/setup-trivy@*",
  "aquasecurity/trivy-action@*",
  "github/codeql-action/analyze@*",
  "github/codeql-action/init@*",
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

function validateSecurityHardening(document, hardening) {
  exactKeys(
    document,
    [
      "schema",
      "status",
      "observedAt",
      "precondition",
      "repository",
      "actionsPolicy",
      "securityFeatures",
      "alertTriage",
      "releaseBoundary",
      "mutation",
      "remainingGates",
    ],
    "repository security hardening evidence",
  );
  if (
    document.schema !== "starfiniti.github-repository-security-hardening.v1" ||
    document.status !== "hardened" ||
    document.observedAt !== "2026-09-01T10:44:39Z" ||
    exactUtc(document.observedAt, "security hardening observedAt") <=
      exactUtc(hardening.observedAt, "hardening observedAt")
  ) {
    fail("repository security hardening identity or chronology differs");
  }

  exactKeys(
    document.precondition,
    ["path", "sha256"],
    "security hardening precondition",
  );
  const hardeningDigest = createHash("sha256")
    .update(readFileSync(join(root, hardeningEvidencePath)))
    .digest("hex");
  if (
    document.precondition.path !== hardeningEvidencePath ||
    document.precondition.sha256 !== hardeningDigest ||
    hardeningDigest !==
      "6d56b16c3a44e33d5fab60c3271aa0d4c4e058bcb3c5127e2309ae1d519a7fc5"
  ) {
    fail("repository security hardening precondition binding differs");
  }

  exactKeys(
    document.repository,
    [
      "owner",
      "name",
      "visibility",
      "defaultBranch",
      "observedMainCommit",
      "evidenceBranchHead",
    ],
    "security hardening repository",
  );
  if (
    document.repository.owner !== "Starfiniti" ||
    document.repository.name !== "starfiniti-loyalty" ||
    document.repository.visibility !== "public" ||
    document.repository.defaultBranch !== "main" ||
    document.repository.observedMainCommit !==
      "c85d93d0e6e0273543078050e697f04309f11d93" ||
    document.repository.evidenceBranchHead !==
      "3dd71c26b08741800b67f9d82bd8cbae8beb7fcc" ||
    !commitPattern.test(document.repository.observedMainCommit ?? "") ||
    !commitPattern.test(document.repository.evidenceBranchHead ?? "")
  ) {
    fail("repository security hardening repository identity differs");
  }

  exactKeys(
    document.actionsPolicy,
    [
      "enabled",
      "allowedActions",
      "shaPinningRequired",
      "defaultWorkflowPermissions",
      "canApprovePullRequestReviews",
      "githubOwnedAllowed",
      "verifiedCreatorsAllowed",
      "patternsAllowed",
      "workflowActionReferences",
      "uniqueWorkflowActionReferences",
      "unpinnedWorkflowActionReferences",
    ],
    "security hardening actions policy",
  );
  if (
    document.actionsPolicy.enabled !== true ||
    document.actionsPolicy.allowedActions !== "selected" ||
    document.actionsPolicy.shaPinningRequired !== true ||
    document.actionsPolicy.defaultWorkflowPermissions !== "read" ||
    document.actionsPolicy.canApprovePullRequestReviews !== false ||
    document.actionsPolicy.githubOwnedAllowed !== false ||
    document.actionsPolicy.verifiedCreatorsAllowed !== false ||
    JSON.stringify(document.actionsPolicy.patternsAllowed) !==
      JSON.stringify(expectedActionPatterns) ||
    document.actionsPolicy.workflowActionReferences !== 41 ||
    document.actionsPolicy.uniqueWorkflowActionReferences !== 9 ||
    document.actionsPolicy.unpinnedWorkflowActionReferences !== 0
  ) {
    fail("repository actions policy differs");
  }

  exactKeys(
    document.securityFeatures,
    [
      "vulnerabilityAlertsEnabled",
      "dependabotSecurityUpdatesEnabled",
      "dependabotSecurityUpdatesPaused",
      "secretScanningEnabled",
      "secretScanningPushProtectionEnabled",
      "privateVulnerabilityReportingEnabled",
      "nonProviderPatternScanningEnabled",
      "validityChecksEnabled",
      "unavailableOptionsClaimed",
    ],
    "repository security features",
  );
  if (
    document.securityFeatures.vulnerabilityAlertsEnabled !== true ||
    document.securityFeatures.dependabotSecurityUpdatesEnabled !== true ||
    document.securityFeatures.dependabotSecurityUpdatesPaused !== false ||
    document.securityFeatures.secretScanningEnabled !== true ||
    document.securityFeatures.secretScanningPushProtectionEnabled !== true ||
    document.securityFeatures.privateVulnerabilityReportingEnabled !== true ||
    document.securityFeatures.nonProviderPatternScanningEnabled !== false ||
    document.securityFeatures.validityChecksEnabled !== false ||
    document.securityFeatures.unavailableOptionsClaimed !== false
  ) {
    fail("repository security feature state differs or is overclaimed");
  }

  exactKeys(
    document.alertTriage,
    ["openDependabotAlerts", "openCodeScanningAlerts", "secretScanning"],
    "repository alert triage",
  );
  exactKeys(
    document.alertTriage.secretScanning,
    [
      "discovered",
      "resolved",
      "open",
      "resolution",
      "externalCredentialRotated",
      "locations",
      "rationale",
    ],
    "secret scanning triage",
  );
  if (
    document.alertTriage.openDependabotAlerts !== 0 ||
    document.alertTriage.openCodeScanningAlerts !== 0 ||
    document.alertTriage.secretScanning.discovered !== 2 ||
    document.alertTriage.secretScanning.resolved !== 2 ||
    document.alertTriage.secretScanning.open !== 0 ||
    document.alertTriage.secretScanning.resolution !== "used_in_tests" ||
    document.alertTriage.secretScanning.externalCredentialRotated !== false ||
    document.alertTriage.secretScanning.rationale !==
      "Both detections are deterministic synthetic Stripe-format unit-test fixtures constructed from fixed constants or repeat operations. Neither value was issued by Stripe or used outside local verification."
  ) {
    fail("repository alert triage differs or overclaims credential handling");
  }
  const expectedLocations = [
    {
      alertNumber: 1,
      path: "apps/dashboard/lib/server/stripe-billing-webhook.test.ts",
      line: 17,
      commit: "679d7eb7bce3bc31c38559f6cf0e4d5cf2025e60",
    },
    {
      alertNumber: 2,
      path: "apps/dashboard/lib/server/stripe-billing-webhook.test.ts",
      line: 104,
      commit: "679d7eb7bce3bc31c38559f6cf0e4d5cf2025e60",
    },
  ];
  if (
    !Array.isArray(document.alertTriage.secretScanning.locations) ||
    JSON.stringify(document.alertTriage.secretScanning.locations) !==
      JSON.stringify(expectedLocations)
  ) {
    fail("secret scanning locations differ");
  }
  for (const location of document.alertTriage.secretScanning.locations) {
    exactKeys(
      location,
      ["alertNumber", "path", "line", "commit"],
      "secret scanning location",
    );
  }

  exactKeys(
    document.releaseBoundary,
    [
      "workflowId",
      "workflowState",
      "releaseEnvironmentExists",
      "policyTokenConfigured",
      "releaseCreated",
      "deploymentChanged",
      "productionChanged",
    ],
    "security hardening release boundary",
  );
  if (
    document.releaseBoundary.workflowId !== 333373957 ||
    document.releaseBoundary.workflowState !== "disabled_manually" ||
    document.releaseBoundary.releaseEnvironmentExists !== false ||
    document.releaseBoundary.policyTokenConfigured !== false ||
    document.releaseBoundary.releaseCreated !== false ||
    document.releaseBoundary.deploymentChanged !== false ||
    document.releaseBoundary.productionChanged !== false
  ) {
    fail("repository security hardening release boundary differs");
  }

  exactKeys(
    document.mutation,
    [
      "repositorySecurityPolicyChanged",
      "actionsPolicyChanged",
      "vulnerabilityAlertsChanged",
      "dependabotSecurityUpdatesChanged",
      "secretScanningChanged",
      "privateVulnerabilityReportingChanged",
      "alertDispositionChanged",
      "branchProtectionChanged",
      "tagRulesetsChanged",
      "workflowEnabled",
      "tagCreated",
      "releaseCreated",
      "deploymentChanged",
      "productionChanged",
      "rollback",
    ],
    "repository security hardening mutation",
  );
  if (
    document.mutation.repositorySecurityPolicyChanged !== true ||
    document.mutation.actionsPolicyChanged !== true ||
    document.mutation.vulnerabilityAlertsChanged !== true ||
    document.mutation.dependabotSecurityUpdatesChanged !== true ||
    document.mutation.secretScanningChanged !== true ||
    document.mutation.privateVulnerabilityReportingChanged !== true ||
    document.mutation.alertDispositionChanged !== true ||
    document.mutation.branchProtectionChanged !== false ||
    document.mutation.tagRulesetsChanged !== false ||
    document.mutation.workflowEnabled !== false ||
    document.mutation.tagCreated !== false ||
    document.mutation.releaseCreated !== false ||
    document.mutation.deploymentChanged !== false ||
    document.mutation.productionChanged !== false
  ) {
    fail("repository security hardening mutation boundary differs");
  }

  exactKeys(
    document.mutation.rollback,
    [
      "actionsPolicy",
      "vulnerabilityAlerts",
      "dependabotSecurityUpdates",
      "secretScanning",
      "privateVulnerabilityReporting",
      "alertDisposition",
    ],
    "repository security hardening rollback",
  );
  const rollback = document.mutation.rollback;
  exactKeys(
    rollback.actionsPolicy,
    ["method", "endpoint", "payload"],
    "actions policy rollback",
  );
  exactKeys(
    rollback.actionsPolicy.payload,
    ["enabled", "allowed_actions", "sha_pinning_required"],
    "actions policy rollback payload",
  );
  exactKeys(
    rollback.vulnerabilityAlerts,
    ["method", "endpoint"],
    "vulnerability alerts rollback",
  );
  exactKeys(
    rollback.dependabotSecurityUpdates,
    ["method", "endpoint"],
    "dependabot updates rollback",
  );
  exactKeys(
    rollback.secretScanning,
    ["method", "endpoint", "statuses"],
    "secret scanning rollback",
  );
  exactKeys(
    rollback.secretScanning.statuses,
    ["secretScanning", "pushProtection"],
    "secret scanning rollback statuses",
  );
  exactKeys(
    rollback.privateVulnerabilityReporting,
    ["method", "endpoint"],
    "private vulnerability reporting rollback",
  );
  if (
    rollback.actionsPolicy.method !== "PUT" ||
    rollback.actionsPolicy.endpoint !==
      "repos/Starfiniti/starfiniti-loyalty/actions/permissions" ||
    rollback.actionsPolicy.payload.enabled !== true ||
    rollback.actionsPolicy.payload.allowed_actions !== "all" ||
    rollback.actionsPolicy.payload.sha_pinning_required !== false ||
    rollback.vulnerabilityAlerts.method !== "DELETE" ||
    rollback.vulnerabilityAlerts.endpoint !==
      "repos/Starfiniti/starfiniti-loyalty/vulnerability-alerts" ||
    rollback.dependabotSecurityUpdates.method !== "DELETE" ||
    rollback.dependabotSecurityUpdates.endpoint !==
      "repos/Starfiniti/starfiniti-loyalty/automated-security-fixes" ||
    rollback.secretScanning.method !== "PATCH" ||
    rollback.secretScanning.endpoint !==
      "repos/Starfiniti/starfiniti-loyalty" ||
    rollback.secretScanning.statuses.secretScanning !== "disabled" ||
    rollback.secretScanning.statuses.pushProtection !== "disabled" ||
    rollback.privateVulnerabilityReporting.method !== "DELETE" ||
    rollback.privateVulnerabilityReporting.endpoint !==
      "repos/Starfiniti/starfiniti-loyalty/private-vulnerability-reporting" ||
    rollback.alertDisposition !==
      "Resolution comments are append-only audit evidence. Reopening a verified test fixture is not a security rollback and requires a separately reviewed reason."
  ) {
    fail("repository security hardening rollback differs");
  }

  if (
    !Array.isArray(document.remainingGates) ||
    JSON.stringify(document.remainingGates) !==
      JSON.stringify(expectedSecurityHardeningGates)
  ) {
    fail("repository security hardening remaining gates differ");
  }
}

function validateActionsPolicyCorrection(document, securityHardening) {
  exactKeys(
    document,
    [
      "schema",
      "status",
      "observedAt",
      "precondition",
      "repository",
      "failClosedEvidence",
      "correctedActionsPolicy",
      "verification",
      "releaseBoundary",
      "mutation",
      "remainingGates",
    ],
    "Actions policy correction evidence",
  );
  if (
    document.schema !== "starfiniti.github-actions-policy-correction.v1" ||
    document.status !== "corrected" ||
    document.observedAt !== "2026-09-01T11:11:22Z" ||
    exactUtc(document.observedAt, "Actions correction observedAt") <=
      exactUtc(securityHardening.observedAt, "security hardening observedAt")
  ) {
    fail("Actions policy correction identity or chronology differs");
  }

  exactKeys(
    document.precondition,
    ["path", "sha256"],
    "Actions correction precondition",
  );
  const securityHardeningDigest = createHash("sha256")
    .update(readFileSync(join(root, securityHardeningEvidencePath)))
    .digest("hex");
  if (
    document.precondition.path !== securityHardeningEvidencePath ||
    document.precondition.sha256 !== securityHardeningDigest ||
    securityHardeningDigest !==
      "53a90e01f3d1955b00ceaa4b7e5fb54baeda3d13ada0782e68fdc4527e04a3a8"
  ) {
    fail("Actions policy correction precondition binding differs");
  }

  exactKeys(
    document.repository,
    [
      "owner",
      "name",
      "visibility",
      "defaultBranch",
      "observedMainCommit",
      "evidenceBranchHead",
    ],
    "Actions correction repository",
  );
  if (
    document.repository.owner !== "Starfiniti" ||
    document.repository.name !== "starfiniti-loyalty" ||
    document.repository.visibility !== "public" ||
    document.repository.defaultBranch !== "main" ||
    document.repository.observedMainCommit !==
      "c85d93d0e6e0273543078050e697f04309f11d93" ||
    document.repository.evidenceBranchHead !==
      "ac2ad6c901ebad6d6d2f38b890e0913bfb2f942c"
  ) {
    fail("Actions policy correction repository identity differs");
  }

  exactKeys(
    document.failClosedEvidence,
    [
      "pullRequestStartup",
      "directPolicyProbe",
      "supplyChainSetupAttempts",
      "transitiveSourceInspection",
      "finding",
    ],
    "Actions correction negative evidence",
  );
  const startup = document.failClosedEvidence.pullRequestStartup;
  exactKeys(
    startup,
    ["runId", "event", "headCommit", "conclusion", "jobCount"],
    "Actions correction startup failure",
  );
  const probe = document.failClosedEvidence.directPolicyProbe;
  exactKeys(
    probe,
    [
      "runId",
      "event",
      "headCommit",
      "attempt",
      "conclusion",
      "codeqlJobId",
      "codeqlConclusion",
      "dastJobId",
      "dastConclusion",
    ],
    "Actions correction direct policy probe",
  );
  const expectedSupplyChainAttempts = [
    {
      attempt: 1,
      jobId: 99830334324,
      conclusion: "failure",
      stage: "Set up job",
      annotationPath: ".github",
      disallowedActions: [
        {
          action: "aquasecurity/setup-trivy",
          commit: "3fb12ec12f41e471780db15c232d5dd185dcb514",
          source: "aquasecurity/trivy-action composite dependency",
        },
        {
          action: "actions/cache",
          commit: "27d5ce7f107fe9357f9df03efb73ab90386fccae",
          source: "aquasecurity/trivy-action composite dependency",
        },
      ],
    },
    {
      attempt: 2,
      jobId: 99832633787,
      conclusion: "failure",
      stage: "Set up job",
      annotationPath: ".github",
      disallowedActions: [
        {
          action: "actions/cache/restore",
          commit: "9255dc7a253b0ccc959486e2bca901246202afeb",
          source: "aquasecurity/setup-trivy composite dependency",
        },
      ],
    },
  ];
  const expectedResolvedActions = [
    {
      action: "actions/cache/restore",
      commit: "9255dc7a253b0ccc959486e2bca901246202afeb",
      policyPattern: "actions/cache/restore@*",
      newlyRequired: true,
    },
    {
      action: "actions/checkout",
      commit: "8e8c483db84b4bee98b60c0593521ed34d9990e8",
      policyPattern: "actions/checkout@*",
      newlyRequired: false,
    },
    {
      action: "actions/cache/save",
      commit: "9255dc7a253b0ccc959486e2bca901246202afeb",
      policyPattern: "actions/cache/save@*",
      newlyRequired: true,
    },
  ];
  const sourceInspection =
    document.failClosedEvidence.transitiveSourceInspection;
  exactKeys(
    sourceInspection,
    ["repository", "commit", "path", "resolvedActions"],
    "transitive action source inspection",
  );
  if (
    startup.runId !== 33499712113 ||
    startup.event !== "pull_request" ||
    startup.headCommit !== "ac2ad6c901ebad6d6d2f38b890e0913bfb2f942c" ||
    startup.conclusion !== "startup_failure" ||
    startup.jobCount !== 0 ||
    probe.runId !== 33499821641 ||
    probe.event !== "workflow_dispatch" ||
    probe.headCommit !== "ac2ad6c901ebad6d6d2f38b890e0913bfb2f942c" ||
    probe.attempt !== 1 ||
    probe.conclusion !== "failure" ||
    probe.codeqlJobId !== 99830334394 ||
    probe.codeqlConclusion !== "success" ||
    probe.dastJobId !== 99830334338 ||
    probe.dastConclusion !== "success" ||
    JSON.stringify(document.failClosedEvidence.supplyChainSetupAttempts) !==
      JSON.stringify(expectedSupplyChainAttempts) ||
    sourceInspection.repository !== "aquasecurity/setup-trivy" ||
    sourceInspection.commit !== "3fb12ec12f41e471780db15c232d5dd185dcb514" ||
    sourceInspection.path !== "action.yaml" ||
    JSON.stringify(sourceInspection.resolvedActions) !==
      JSON.stringify(expectedResolvedActions) ||
    document.failClosedEvidence.finding !==
      "Repository-level CodeQL matching did not admit public sub-action references, direct workflow inventory omitted two full-SHA composite dependencies, and the first transitive correction did not include public cache restore/save sub-actions from the pinned setup-trivy source."
  ) {
    fail("Actions correction negative evidence differs");
  }
  for (const attempt of document.failClosedEvidence.supplyChainSetupAttempts) {
    exactKeys(
      attempt,
      [
        "attempt",
        "jobId",
        "conclusion",
        "stage",
        "annotationPath",
        "disallowedActions",
      ],
      "Actions correction supply-chain attempt",
    );
    for (const action of attempt.disallowedActions) {
      exactKeys(
        action,
        ["action", "commit", "source"],
        "disallowed transitive action",
      );
      if (!commitPattern.test(action.commit ?? "")) {
        fail("disallowed transitive action commit is invalid");
      }
    }
  }
  for (const action of sourceInspection.resolvedActions) {
    exactKeys(
      action,
      ["action", "commit", "policyPattern", "newlyRequired"],
      "resolved transitive action",
    );
    if (!commitPattern.test(action.commit ?? "")) {
      fail("resolved transitive action commit is invalid");
    }
  }

  exactKeys(
    document.correctedActionsPolicy,
    [
      "enabled",
      "allowedActions",
      "shaPinningRequired",
      "githubOwnedAllowed",
      "verifiedCreatorsAllowed",
      "patternsAllowed",
      "directWorkflowActionReferences",
      "uniqueDirectWorkflowActionReferences",
      "observedTransitiveActionReferences",
      "newlyRequiredTransitivePolicyPatterns",
      "unpinnedResolvedActionReferences",
    ],
    "corrected Actions policy",
  );
  const corrected = document.correctedActionsPolicy;
  if (
    corrected.enabled !== true ||
    corrected.allowedActions !== "selected" ||
    corrected.shaPinningRequired !== true ||
    corrected.githubOwnedAllowed !== false ||
    corrected.verifiedCreatorsAllowed !== false ||
    JSON.stringify(corrected.patternsAllowed) !==
      JSON.stringify(expectedCorrectedActionPatterns) ||
    corrected.directWorkflowActionReferences !== 41 ||
    corrected.uniqueDirectWorkflowActionReferences !== 9 ||
    corrected.observedTransitiveActionReferences !== 5 ||
    corrected.newlyRequiredTransitivePolicyPatterns !== 4 ||
    corrected.unpinnedResolvedActionReferences !== 0
  ) {
    fail("corrected Actions policy differs");
  }

  exactKeys(
    document.verification,
    [
      "runId",
      "attempt",
      "event",
      "headCommit",
      "supplyChainJobId",
      "supplyChainConclusion",
      "policyCorrected",
      "fullSecurityEvidenceClaimed",
    ],
    "Actions policy correction verification",
  );
  const verification = document.verification;
  if (
    verification.runId !== 33499821641 ||
    verification.attempt !== 3 ||
    verification.event !== "workflow_dispatch" ||
    verification.headCommit !== "ac2ad6c901ebad6d6d2f38b890e0913bfb2f942c" ||
    verification.supplyChainJobId !== 99833061733 ||
    verification.supplyChainConclusion !== "success" ||
    verification.policyCorrected !== true ||
    verification.fullSecurityEvidenceClaimed !== false
  ) {
    fail("Actions policy correction verification differs or overclaims");
  }

  exactKeys(
    document.releaseBoundary,
    [
      "workflowId",
      "workflowState",
      "releaseEnvironmentExists",
      "policyTokenConfigured",
      "releaseCreated",
      "deploymentChanged",
      "productionChanged",
    ],
    "Actions correction release boundary",
  );
  if (
    document.releaseBoundary.workflowId !== 333373957 ||
    document.releaseBoundary.workflowState !== "disabled_manually" ||
    document.releaseBoundary.releaseEnvironmentExists !== false ||
    document.releaseBoundary.policyTokenConfigured !== false ||
    document.releaseBoundary.releaseCreated !== false ||
    document.releaseBoundary.deploymentChanged !== false ||
    document.releaseBoundary.productionChanged !== false
  ) {
    fail("Actions correction release boundary differs");
  }

  exactKeys(
    document.mutation,
    [
      "actionsPolicyChanged",
      "implicitGitHubOwnedTrustEnabled",
      "verifiedCreatorTrustEnabled",
      "shaPinningDisabled",
      "workflowEnabled",
      "tagCreated",
      "releaseCreated",
      "deploymentChanged",
      "productionChanged",
      "rollback",
    ],
    "Actions correction mutation",
  );
  exactKeys(
    document.mutation.rollback,
    [
      "method",
      "endpoint",
      "githubOwnedAllowed",
      "verifiedCreatorsAllowed",
      "patternsAllowed",
      "consequence",
    ],
    "Actions correction rollback",
  );
  const rollback = document.mutation.rollback;
  if (
    document.mutation.actionsPolicyChanged !== true ||
    document.mutation.implicitGitHubOwnedTrustEnabled !== false ||
    document.mutation.verifiedCreatorTrustEnabled !== false ||
    document.mutation.shaPinningDisabled !== false ||
    document.mutation.workflowEnabled !== false ||
    document.mutation.tagCreated !== false ||
    document.mutation.releaseCreated !== false ||
    document.mutation.deploymentChanged !== false ||
    document.mutation.productionChanged !== false ||
    rollback.method !== "PUT" ||
    rollback.endpoint !==
      "repos/Starfiniti/starfiniti-loyalty/actions/permissions/selected-actions" ||
    rollback.githubOwnedAllowed !== false ||
    rollback.verifiedCreatorsAllowed !== false ||
    JSON.stringify(rollback.patternsAllowed) !==
      JSON.stringify(expectedActionPatterns) ||
    rollback.consequence !==
      "The direct-only policy fails closed before the current Security workflow can complete; it does not authorize broader Actions access."
  ) {
    fail("Actions correction mutation or rollback differs");
  }

  if (
    !Array.isArray(document.remainingGates) ||
    JSON.stringify(document.remainingGates) !==
      JSON.stringify(expectedSecurityHardeningGates)
  ) {
    fail("Actions policy correction remaining gates differ");
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
    !m15?.risks?.includes("R-065") ||
    !m15?.docs?.includes(
      "docs/architecture/ADR/0115-default-branch-controlled-sealed-releases.md",
    ) ||
    !m15?.docs?.includes(
      "docs/architecture/ADR/0117-repository-native-continuous-security-controls.md",
    ) ||
    !m15?.docs?.includes(
      "docs/architecture/ADR/0118-transitive-github-actions-policy-correction.md",
    ) ||
    !m15?.docs?.includes("docs/operations/RELEASE.md") ||
    !security?.verification?.includes(validationCommand) ||
    !security?.evidence?.includes(evidencePath) ||
    !security?.evidence?.includes(hardeningEvidencePath) ||
    !security?.evidence?.includes(securityHardeningEvidencePath) ||
    !security?.evidence?.includes(actionsPolicyCorrectionEvidencePath) ||
    !security?.evidence?.includes("scripts/validate-release-policy-audit.mjs")
  ) {
    fail("M15 task binding differs");
  }
  const risks = readFileSync(join(root, "RISKS.md"), "utf8");
  if (!risks.includes("| R-064 |") || !risks.includes("| R-065 |")) {
    fail("release-policy risks are missing");
  }
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

function selfTestSecurityHardening(document, hardening) {
  const cases = [
    ["unknown security hardening field", (value) => (value.extra = true)],
    [
      "security precondition drift",
      (value) => (value.precondition.sha256 = "0".repeat(64)),
    ],
    [
      "unrestricted actions",
      (value) => (value.actionsPolicy.allowedActions = "all"),
    ],
    [
      "unpinned actions",
      (value) => (value.actionsPolicy.shaPinningRequired = false),
    ],
    [
      "implicit GitHub-owned action expansion",
      (value) => (value.actionsPolicy.githubOwnedAllowed = true),
    ],
    [
      "verified creator expansion",
      (value) => (value.actionsPolicy.verifiedCreatorsAllowed = true),
    ],
    [
      "third-party pattern expansion",
      (value) => value.actionsPolicy.patternsAllowed.push("example/action@*"),
    ],
    [
      "secret scanning disabled",
      (value) => (value.securityFeatures.secretScanningEnabled = false),
    ],
    [
      "dependabot disabled",
      (value) =>
        (value.securityFeatures.dependabotSecurityUpdatesEnabled = false),
    ],
    [
      "unavailable feature overclaim",
      (value) =>
        (value.securityFeatures.nonProviderPatternScanningEnabled = true),
    ],
    [
      "open secret alert",
      (value) => (value.alertTriage.secretScanning.open = 1),
    ],
    [
      "false credential rotation",
      (value) =>
        (value.alertTriage.secretScanning.externalCredentialRotated = true),
    ],
    [
      "alert location drift",
      (value) => (value.alertTriage.secretScanning.locations[0].line = 18),
    ],
    [
      "release workflow enablement",
      (value) => (value.releaseBoundary.workflowState = "active"),
    ],
    [
      "production mutation overclaim",
      (value) => (value.mutation.productionChanged = true),
    ],
    [
      "rollback weakening",
      (value) =>
        (value.mutation.rollback.actionsPolicy.payload.allowed_actions =
          "selected"),
    ],
    ["missing security hardening gate", (value) => value.remainingGates.pop()],
  ];
  for (const [label, mutate] of cases) {
    const candidate = structuredClone(document);
    mutate(candidate);
    let rejected = false;
    try {
      validateSecurityHardening(candidate, hardening);
    } catch {
      rejected = true;
    }
    if (!rejected) fail(`self-test accepted ${label}`);
  }
  return cases.length;
}

function selfTestActionsPolicyCorrection(document, securityHardening) {
  const cases = [
    ["unknown correction field", (value) => (value.extra = true)],
    [
      "correction precondition drift",
      (value) => (value.precondition.sha256 = "0".repeat(64)),
    ],
    [
      "startup failure erased",
      (value) => (value.failClosedEvidence.pullRequestStartup.jobCount = 1),
    ],
    [
      "transitive dependency erased",
      (value) =>
        value.failClosedEvidence.supplyChainSetupAttempts[0].disallowedActions.pop(),
    ],
    [
      "transitive source dependency erased",
      (value) =>
        value.failClosedEvidence.transitiveSourceInspection.resolvedActions.pop(),
    ],
    [
      "implicit GitHub trust",
      (value) => (value.correctedActionsPolicy.githubOwnedAllowed = true),
    ],
    [
      "verified creator trust",
      (value) => (value.correctedActionsPolicy.verifiedCreatorsAllowed = true),
    ],
    [
      "corrected policy expansion",
      (value) =>
        value.correctedActionsPolicy.patternsAllowed.push("example/action@*"),
    ],
    [
      "unpinned resolved action",
      (value) =>
        (value.correctedActionsPolicy.unpinnedResolvedActionReferences = 1),
    ],
    [
      "failed correction verification",
      (value) => (value.verification.supplyChainConclusion = "failure"),
    ],
    [
      "full security overclaim",
      (value) => (value.verification.fullSecurityEvidenceClaimed = true),
    ],
    [
      "release enablement overclaim",
      (value) => (value.releaseBoundary.workflowState = "active"),
    ],
    [
      "broad rollback",
      (value) => (value.mutation.rollback.githubOwnedAllowed = true),
    ],
    ["missing correction gate", (value) => value.remainingGates.pop()],
  ];
  for (const [label, mutate] of cases) {
    const candidate = structuredClone(document);
    mutate(candidate);
    let rejected = false;
    try {
      validateActionsPolicyCorrection(candidate, securityHardening);
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
const securityHardening = readEvidence(securityHardeningEvidencePath);
const actionsPolicyCorrection = readEvidence(
  actionsPolicyCorrectionEvidencePath,
);
validateAudit(audit);
validateHardening(hardening, audit);
validateSecurityHardening(securityHardening, hardening);
validateActionsPolicyCorrection(actionsPolicyCorrection, securityHardening);
validateBindings();
const cases = args.includes("--self-test")
  ? selfTestAudit(audit) +
    selfTestHardening(hardening, audit) +
    selfTestSecurityHardening(securityHardening, hardening) +
    selfTestActionsPolicyCorrection(actionsPolicyCorrection, securityHardening)
  : 0;
console.log(
  `Validated the disabled release workflow from absent controls through strict branch, immutable tag, repository security, direct-action, and transitive-action hardening${cases ? ` with ${cases} adversarial cases` : ""}; eight external release gates remain and no tag, release, deployment, or production mutation is claimed.`,
);
