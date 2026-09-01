import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const paths = Object.freeze({
  plan: "infrastructure/governance/authentik-runtime-capture.yaml",
  evidence:
    "docs/plan/evidence/M16/runs/authentik-runtime-88c8046-2026-08-31T055501Z.json",
  review: "infrastructure/governance/authentik-runtime-review.yaml",
  v1: "infrastructure/governance/provider-impact-review.yaml",
  v2: "infrastructure/governance/provider-impact-review-v2.yaml",
  collector: "scripts/capture-authentik-runtime-snapshot.mjs",
  validator: "scripts/validate-authentik-runtime-review.mjs",
  tasks: "docs/plan/TASKS.yaml",
  package: "package.json",
  risks: "RISKS.md",
  adr: "docs/architecture/ADR/0108-minimized-public-authentik-runtime-evidence.md",
  attributes: ".gitattributes",
  prettierIgnore: ".prettierignore",
});

const locked = Object.freeze({
  observedAt: "2026-08-31T05:55:01Z",
  implementationCommit: "88c8046d5844bd3208dab7ca8bc814e0c1978fde",
  planSha256:
    "3b7630e23ef01157f06d452f2ebdc70405cfe6f64e3839c4e795b4a34738384b",
  evidenceBytes: 3_257,
  evidenceSha256:
    "4e89321c09f46bb4b3cd7e2690eed54110c9e516c0537d88b2c4424b141b5cb0",
  v1FileSha256:
    "16eeeb5943b37c0d3608ddbcea77e1993828f6437f08f4def5a97d98845a5928",
  v1DecisionSha256:
    "ee97ed58f003c8148a19b1e6afc5683bbc9c5b9652b6b43fc55dfd5647667645",
  v2DecisionSha256:
    "3b8372a74aee6128b947e43c3ff3beba34029434b197c4340dff0d9cb3f6dfc3",
  exactVersion: "2026.5.6",
  versionFamily: "2026.5",
  taskAcceptance:
    "a clean exact-commit bounded public Authentik runtime snapshot proves one unique version family and exact patch across the login shell and three independently fetched same-version assets plus HTTP 200 live and ready health while retaining no raw content headers cookies addresses credentials private configuration or production authority and explicitly leaving image digest outpost identity compatibility upgrade recovery approval deployment and reconciliation unproved",
});

function fail(message) {
  throw new Error(`Authentik runtime review invalid: ${message}`);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stable(value[key])]),
    );
  }
  return value;
}

function canonicalHash(value) {
  return sha256(JSON.stringify(stable(value)));
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} is not an object`);
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

function allFalse(value, expected, label) {
  exactKeys(value, expected, label);
  if (Object.values(value).some((item) => item !== false)) {
    fail(`${label} must remain entirely false`);
  }
}

function count(text, phrase) {
  return text.split(phrase).length - 1;
}

function validateEvidence(bundle) {
  if (
    bundle.evidenceBytes.length !== locked.evidenceBytes ||
    sha256(bundle.evidenceBytes) !== locked.evidenceSha256 ||
    bundle.evidenceBytes.includes(13)
  ) {
    fail("evidence bytes differ");
  }
  const evidence = bundle.evidence;
  exactKeys(
    evidence,
    [
      "schema",
      "observedAt",
      "repository",
      "provider",
      "transport",
      "root",
      "version",
      "health",
      "claims",
      "authority",
    ],
    "evidence",
  );
  if (
    evidence.schema !== "starfiniti.authentik-runtime-snapshot.v1" ||
    evidence.observedAt !== locked.observedAt
  ) {
    fail("evidence identity differs");
  }
  exactKeys(
    evidence.repository,
    ["commit", "cleanBefore", "cleanAfter", "planPath", "planSha256"],
    "evidence repository",
  );
  if (
    evidence.repository.commit !== locked.implementationCommit ||
    evidence.repository.cleanBefore !== true ||
    evidence.repository.cleanAfter !== true ||
    evidence.repository.planPath !== paths.plan ||
    evidence.repository.planSha256 !== locked.planSha256 ||
    sha256(bundle.planBytes) !== locked.planSha256
  ) {
    fail("evidence repository or plan binding differs");
  }
  exactKeys(evidence.provider, ["id", "origin"], "provider");
  if (
    evidence.provider.id !== "authentik" ||
    evidence.provider.origin !== "https://auth.starfiniti.com"
  ) {
    fail("provider identity differs");
  }
  exactKeys(
    evidence.transport,
    [
      "method",
      "minimumTlsVersion",
      "dnsPublicOnly",
      "socketPinned",
      "contentEncoding",
      "rawContentRetained",
      "responseHeadersRetained",
      "cookiesRetained",
      "addressesRetained",
    ],
    "transport",
  );
  if (
    evidence.transport.method !== "GET" ||
    evidence.transport.minimumTlsVersion !== "TLSv1.2" ||
    evidence.transport.dnsPublicOnly !== true ||
    evidence.transport.socketPinned !== true ||
    evidence.transport.contentEncoding !== "identity" ||
    [
      "rawContentRetained",
      "responseHeadersRetained",
      "cookiesRetained",
      "addressesRetained",
    ].some((key) => evidence.transport[key] !== false)
  ) {
    fail("transport boundary differs");
  }
  exactKeys(
    evidence.root,
    [
      "path",
      "finalPath",
      "redirects",
      "status",
      "contentType",
      "bytes",
      "sha256",
      "tlsProtocol",
    ],
    "root response",
  );
  if (
    evidence.root.path !== "/" ||
    evidence.root.finalPath !==
      "/if/flow/starfiniti-authentication-flow/?next=%2F" ||
    evidence.root.status !== 200 ||
    evidence.root.contentType !== "text/html" ||
    evidence.root.bytes !== 100_198 ||
    evidence.root.sha256 !==
      "59ca1d4bf6cea3591ec6c5398b8a53e4eaeaf0fbdcd9da29ffb846452ffe3048" ||
    evidence.root.tlsProtocol !== "TLSv1.3"
  ) {
    fail("root response differs");
  }
  if (
    JSON.stringify(evidence.root.redirects) !==
    JSON.stringify([
      { status: 302, path: "/flows/-/default/authentication/" },
      { status: 302, path: "/if/flow/starfiniti-authentication-flow/" },
    ])
  ) {
    fail("root redirect chain differs");
  }
  exactKeys(evidence.version, ["family", "exact", "assets"], "version");
  if (
    evidence.version.family !== locked.versionFamily ||
    evidence.version.exact !== locked.exactVersion
  ) {
    fail("observed version differs");
  }
  const expectedAssets = [
    [
      "stylesheet",
      "/static/dist/styles/flow-2026.5.6.css",
      "text/css",
      124_102,
      "ffe35040145f58ca0a321259bafebf94f13ad27972bcf6a72abd4fef6d08f3ba",
    ],
    [
      "polyfill",
      "/static/dist/poly-2026.5.6.js",
      "text/javascript",
      427_679,
      "61d8f067be7c5466d446f05228eae967a878571b1f7e99c7a4f5bd8a13ef2b2e",
    ],
    [
      "flowInterface",
      "/static/dist/flow/FlowInterface-2026.5.6.js",
      "text/javascript",
      48_634,
      "a696e7f42c5c89e31b89dbe7cefbf0467ee73b78c82a37023bc5bd439fc24459",
    ],
  ];
  if (evidence.version.assets?.length !== expectedAssets.length) {
    fail("asset count differs");
  }
  for (const [index, expected] of expectedAssets.entries()) {
    const asset = evidence.version.assets[index];
    exactKeys(
      asset,
      ["role", "path", "version", "status", "contentType", "bytes", "sha256"],
      `asset ${index}`,
    );
    if (
      asset.role !== expected[0] ||
      asset.path !== expected[1] ||
      asset.version !== locked.exactVersion ||
      asset.status !== 200 ||
      asset.contentType !== expected[2] ||
      asset.bytes !== expected[3] ||
      asset.sha256 !== expected[4]
    ) {
      fail(`asset ${index} differs`);
    }
  }
  exactKeys(evidence.health, ["live", "ready"], "health");
  for (const [name, path, type] of [
    ["live", "/-/health/live/", null],
    ["ready", "/-/health/ready/", "text/html"],
  ]) {
    const health = evidence.health[name];
    exactKeys(
      health,
      ["path", "status", "contentType", "bytes", "sha256"],
      `${name} health`,
    );
    if (
      health.path !== path ||
      health.status !== 200 ||
      health.contentType !== type ||
      health.bytes !== 0 ||
      health.sha256 !==
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    ) {
      fail(`${name} health differs`);
    }
  }
  exactKeys(
    evidence.claims,
    [
      "servedRuntimePatchObserved",
      "containerImageDigestObserved",
      "outpostVersionsObserved",
      "privateConfigurationObserved",
      "identityCompatibilityProven",
      "upgradeAccepted",
    ],
    "claims",
  );
  if (
    evidence.claims.servedRuntimePatchObserved !== true ||
    Object.entries(evidence.claims)
      .filter(([key]) => key !== "servedRuntimePatchObserved")
      .some(([, value]) => value !== false)
  ) {
    fail("evidence claims overstate proof");
  }
  allFalse(
    evidence.authority,
    [
      "credentialsUsed",
      "productionAccess",
      "privateConfigurationRead",
      "productionMutation",
      "mergeApproved",
      "releaseApproved",
      "deploymentApproved",
      "productionReconciled",
    ],
    "evidence authority",
  );
}

function validateRuntimeReview(review) {
  exactKeys(
    review,
    [
      "schema",
      "reviewedAt",
      "reviewCutoff",
      "runtimeEvidence",
      "officialSources",
      "supportDecision",
      "impact",
      "remainingGates",
      "limitations",
      "authority",
    ],
    "runtime review",
  );
  if (
    review.schema !== "starfiniti.authentik-runtime-review.v1" ||
    review.reviewedAt !== "2026-08-31" ||
    review.reviewCutoff !== locked.observedAt
  ) {
    fail("runtime review identity differs");
  }
  exactKeys(
    review.runtimeEvidence,
    [
      "path",
      "bytes",
      "sha256",
      "implementationCommit",
      "observedVersionFamily",
      "observedExactVersion",
    ],
    "runtime evidence reference",
  );
  if (
    review.runtimeEvidence.path !== paths.evidence ||
    review.runtimeEvidence.bytes !== locked.evidenceBytes ||
    review.runtimeEvidence.sha256 !== locked.evidenceSha256 ||
    review.runtimeEvidence.implementationCommit !==
      locked.implementationCommit ||
    review.runtimeEvidence.observedVersionFamily !== locked.versionFamily ||
    review.runtimeEvidence.observedExactVersion !== locked.exactVersion
  ) {
    fail("runtime evidence reference differs");
  }
  exactKeys(
    review.officialSources,
    [
      "securityPolicy",
      "releaseIndex",
      "deployedRelease",
      "currentFeatureRelease",
      "currentFeatureNotes",
    ],
    "official sources",
  );
  if (
    review.officialSources.securityPolicy !==
      "https://docs.goauthentik.io/security/policy/" ||
    review.officialSources.releaseIndex !==
      "https://github.com/goauthentik/authentik/releases" ||
    review.officialSources.deployedRelease !==
      "https://github.com/goauthentik/authentik/releases/tag/version/2026.5.6" ||
    review.officialSources.currentFeatureRelease !==
      "https://github.com/goauthentik/authentik/releases/tag/version/2026.8.0" ||
    review.officialSources.currentFeatureNotes !==
      "https://docs.goauthentik.io/releases/2026.8/"
  ) {
    fail("official sources differ");
  }
  exactKeys(
    review.supportDecision,
    [
      "policy",
      "deployedFeatureLine",
      "deployedPatch",
      "deployedPatchPublishedAt",
      "deployedIsLatestPatchInFeatureLineThroughCutoff",
      "currentFeatureLine",
      "currentFeaturePatch",
      "currentFeaturePatchPublishedAt",
      "deployedState",
      "candidateAccepted",
    ],
    "support decision",
  );
  if (
    review.supportDecision.policy !==
      "the current and previous feature release are supported only at their latest patch" ||
    review.supportDecision.deployedFeatureLine !== locked.versionFamily ||
    review.supportDecision.deployedPatch !== locked.exactVersion ||
    review.supportDecision.deployedPatchPublishedAt !== "2026-07-22" ||
    review.supportDecision.deployedIsLatestPatchInFeatureLineThroughCutoff !==
      true ||
    review.supportDecision.currentFeatureLine !== "2026.8" ||
    review.supportDecision.currentFeaturePatch !== "2026.8.0" ||
    review.supportDecision.currentFeaturePatchPublishedAt !== "2026-08-18" ||
    review.supportDecision.deployedState !==
      "supported-prior-feature-line-current-patch" ||
    review.supportDecision.candidateAccepted !== false
  ) {
    fail("support decision differs or accepts the candidate");
  }
  exactKeys(
    review.impact,
    [
      "previousClassification",
      "classification",
      "previousSeverity",
      "severity",
      "securityRelevant",
      "affectedModules",
      "riskIds",
      "owner",
      "disposition",
      "rationale",
      "rollback",
    ],
    "runtime impact",
  );
  if (
    review.impact.previousClassification !==
      "installed-version-unknown-blocks-upgrade-decision" ||
    review.impact.classification !==
      "supported-prior-feature-line-current-patch" ||
    review.impact.previousSeverity !== "high" ||
    review.impact.severity !== "medium" ||
    review.impact.securityRelevant !== true ||
    review.impact.owner !== "engineering" ||
    review.impact.disposition !==
      "retain-2026-5-6-until-2026-8-identity-and-recovery-rehearsal" ||
    !review.impact.rationale.includes("resolves the version unknown only") ||
    !review.impact.rollback.includes("2026.5.6 running")
  ) {
    fail("runtime impact decision differs");
  }
  exactArray(
    review.impact.affectedModules,
    ["M01", "M13", "M15", "M16"],
    "affected modules",
  );
  exactArray(review.impact.riskIds, ["R-029", "R-044", "R-048"], "risk ids");
  exactArray(
    review.remainingGates,
    [
      "container-image-and-outpost-inventory",
      "private-configuration-and-signing-recovery-export",
      "exact-2026-8-release-and-deprecation-diff",
      "oidc-saml-scim-fixtures",
      "stale-session-and-deprovisioning-canary",
      "clean-room-recovery",
      "independent-review",
      "owner-approval",
    ],
    "remaining gates",
  );
  exactKeys(
    review.limitations,
    [
      "publicShellIsRuntimeEvidence",
      "containerImageIdentityProven",
      "outpostVersionsProven",
      "privateConfigurationProven",
      "identityCompatibilityProven",
      "recoveryProven",
      "elapsedMonthlyReviewComplete",
    ],
    "runtime limitations",
  );
  if (
    review.limitations.publicShellIsRuntimeEvidence !== true ||
    Object.entries(review.limitations)
      .filter(([key]) => key !== "publicShellIsRuntimeEvidence")
      .some(([, value]) => value !== false)
  ) {
    fail("runtime review limitations overclaim proof");
  }
  allFalse(
    review.authority,
    [
      "mergeApproved",
      "releaseApproved",
      "providerUpgradeApproved",
      "deploymentApproved",
      "productionMutation",
      "productionReconciled",
    ],
    "runtime review authority",
  );
}

function validateV2(bundle) {
  const review = bundle.v2;
  exactKeys(
    review,
    [
      "schema",
      "reviewedAt",
      "amendmentCutoff",
      "supersedes",
      "runtimeReview",
      "change",
      "effectiveDecision",
      "outcomes",
      "authority",
    ],
    "V2 review",
  );
  if (
    review.schema !== "starfiniti.provider-impact-review.v2" ||
    review.reviewedAt !== "2026-08-31" ||
    review.amendmentCutoff !== locked.observedAt ||
    sha256(bundle.v1Bytes) !== locked.v1FileSha256 ||
    canonicalHash(bundle.v1.providers) !== locked.v1DecisionSha256
  ) {
    fail("V1 or V2 identity differs");
  }
  exactKeys(
    review.supersedes,
    ["path", "fileSha256", "schema", "decisionSha256"],
    "V2 supersedes",
  );
  exactKeys(
    review.runtimeReview,
    ["path", "evidencePath", "evidenceSha256"],
    "V2 runtime review",
  );
  exactKeys(
    review.change,
    [
      "providerId",
      "expectedPreviousClassification",
      "expectedPreviousSeverity",
      "replacement",
    ],
    "V2 change",
  );
  if (
    review.supersedes.path !== paths.v1 ||
    review.supersedes.fileSha256 !== locked.v1FileSha256 ||
    review.supersedes.schema !== "starfiniti.provider-impact-review.v1" ||
    review.supersedes.decisionSha256 !== locked.v1DecisionSha256 ||
    review.runtimeReview.path !== paths.review ||
    review.runtimeReview.evidencePath !== paths.evidence ||
    review.runtimeReview.evidenceSha256 !== locked.evidenceSha256
  ) {
    fail("V2 input binding differs");
  }
  const previous = bundle.v1.providers.find(
    (provider) => provider.id === review.change.providerId,
  );
  if (
    review.change.providerId !== "authentik" ||
    previous?.impact.classification !==
      review.change.expectedPreviousClassification ||
    previous?.impact.severity !== review.change.expectedPreviousSeverity ||
    review.change.expectedPreviousClassification !==
      "installed-version-unknown-blocks-upgrade-decision" ||
    review.change.expectedPreviousSeverity !== "high"
  ) {
    fail("V2 prior-state guard differs");
  }
  const replacement = review.change.replacement;
  exactKeys(
    replacement,
    [
      "id",
      "reviewedThrough",
      "observedState",
      "candidateState",
      "impact",
      "evidence",
      "remainingGates",
    ],
    "V2 replacement",
  );
  exactKeys(
    replacement.impact,
    [
      "classification",
      "severity",
      "securityRelevant",
      "affectedModules",
      "riskIds",
      "owner",
      "disposition",
      "rationale",
      "rollback",
    ],
    "V2 replacement impact",
  );
  if (
    replacement.id !== "authentik" ||
    replacement.impact.classification !==
      bundle.runtimeReview.impact.classification ||
    replacement.impact.severity !== bundle.runtimeReview.impact.severity ||
    replacement.impact.disposition !==
      bundle.runtimeReview.impact.disposition ||
    replacement.impact.owner !== "engineering" ||
    replacement.impact.securityRelevant !== true ||
    !replacement.observedState.includes(locked.exactVersion) ||
    !replacement.candidateState.includes("not accepted") ||
    !replacement.evidence.includes(paths.review) ||
    !replacement.evidence.includes(paths.evidence)
  ) {
    fail("V2 replacement differs from the runtime review");
  }
  exactArray(
    replacement.impact.affectedModules,
    bundle.runtimeReview.impact.affectedModules,
    "V2 affected modules",
  );
  exactArray(
    replacement.impact.riskIds,
    bundle.runtimeReview.impact.riskIds,
    "V2 risk ids",
  );
  exactArray(
    replacement.evidence,
    [
      paths.review,
      paths.evidence,
      "docs/architecture/ADR/0008-broker-workforce-authentik-through-supabase-auth.md",
      "docs/architecture/ADR/0054-authentik-correlated-scim-and-live-membership-reconciliation.md",
    ],
    "V2 evidence",
  );
  exactArray(
    replacement.remainingGates,
    bundle.runtimeReview.remainingGates,
    "V2 remaining gates",
  );
  for (const risk of replacement.impact.riskIds) {
    if (!bundle.risks.includes(`| ${risk} |`)) {
      fail(`V2 references absent risk ${risk}`);
    }
  }
  const effective = structuredClone(bundle.v1.providers);
  const index = effective.findIndex(
    (provider) => provider.id === review.change.providerId,
  );
  if (index < 0) fail("V2 replacement provider is absent from V1");
  effective[index] = replacement;
  exactKeys(
    review.effectiveDecision,
    ["providerCount", "decisionSha256", "severityInventory"],
    "effective decision",
  );
  exactKeys(
    review.effectiveDecision.severityInventory,
    ["critical", "high", "medium", "low"],
    "severity inventory",
  );
  if (
    review.effectiveDecision.providerCount !== 13 ||
    effective.length !== 13 ||
    review.effectiveDecision.decisionSha256 !== locked.v2DecisionSha256 ||
    canonicalHash(effective) !== locked.v2DecisionSha256
  ) {
    fail("effective provider decision differs");
  }
  const inventory = Object.fromEntries(
    ["critical", "high", "medium", "low"].map((severity) => [
      severity,
      effective.filter((provider) => provider.impact.severity === severity)
        .length,
    ]),
  );
  if (
    JSON.stringify(review.effectiveDecision.severityInventory) !==
      JSON.stringify(inventory) ||
    inventory.critical !== 2 ||
    inventory.high !== 4 ||
    inventory.medium !== 4 ||
    inventory.low !== 3
  ) {
    fail("effective severity inventory differs");
  }
  exactKeys(
    review.outcomes,
    [
      "installedRuntimeVersionUnknown",
      "installedRuntimeVersionObservedFromPublicShell",
      "containerAndOutpostInventory",
      "candidateSelection",
      "deploymentReadiness",
      "monthlyReview",
      "limitation",
    ],
    "V2 outcomes",
  );
  if (
    review.outcomes.installedRuntimeVersionUnknown !== false ||
    review.outcomes.installedRuntimeVersionObservedFromPublicShell !== true ||
    review.outcomes.containerAndOutpostInventory !== "incomplete" ||
    review.outcomes.candidateSelection !== "partial" ||
    review.outcomes.deploymentReadiness !== "incomplete" ||
    review.outcomes.monthlyReview !== "incomplete" ||
    !review.outcomes.limitation.includes("resolves only") ||
    !review.outcomes.limitation.includes("production mutation")
  ) {
    fail("V2 outcomes differ or overclaim completion");
  }
  allFalse(
    review.authority,
    [
      "productionAccess",
      "mergeApproved",
      "releaseApproved",
      "deploymentApproved",
      "providerUpgradeApproved",
      "productionMutation",
      "productionReconciled",
    ],
    "V2 authority",
  );
}

function validateBindings(bundle) {
  for (const path of [
    paths.plan,
    paths.evidence,
    paths.review,
    paths.v1,
    paths.v2,
    paths.collector,
    paths.validator,
    paths.adr,
  ]) {
    const stat = lstatSync(join(root, path));
    if (!stat.isFile() || stat.isSymbolicLink()) {
      fail(`${path} is not a regular repository file`);
    }
  }
  const command =
    "node scripts/validate-authentik-runtime-review.mjs --self-test";
  if (
    bundle.rootPackage.scripts?.[
      "continuous-improvement:authentik-runtime:validate"
    ] !== command ||
    !bundle.rootPackage.scripts?.check?.includes(
      "npm run continuous-improvement:authentik-runtime:validate",
    )
  ) {
    fail("root Authentik runtime command is not gated");
  }
  const task = bundle.tasks.tasks?.find(
    (candidate) => candidate.id === "M16-CONTINUOUS-IMPROVEMENT",
  );
  for (const acceptance of [locked.taskAcceptance]) {
    if (!task?.acceptance?.includes(acceptance)) {
      fail("task acceptance is missing");
    }
  }
  for (const path of [
    paths.evidence,
    paths.review,
    paths.v2,
    paths.validator,
  ]) {
    if (!task?.evidence?.includes(path)) fail(`task evidence omits ${path}`);
  }
  if (
    !task?.docs?.includes(paths.adr) ||
    !task?.docs?.includes(paths.plan) ||
    !task?.verification?.includes(
      "npm run continuous-improvement:authentik-runtime:validate",
    ) ||
    !task?.verification?.includes(
      "node scripts/capture-authentik-runtime-snapshot.mjs --self-test",
    )
  ) {
    fail("task docs or verification binding is incomplete");
  }
  if (
    count(
      bundle.attributes,
      "docs/plan/evidence/M16/runs/authentik-runtime-*.json -text",
    ) !== 1 ||
    count(
      bundle.prettierIgnore,
      "docs/plan/evidence/M16/runs/authentik-runtime-*.json",
    ) !== 1
  ) {
    fail("evidence byte-preservation binding differs");
  }
  for (const phrase of [
    "Public shell evidence is not image evidence",
    "Supported is not upgrade acceptance",
    "V1 remains immutable",
    "Production authority remains false",
  ]) {
    if (!bundle.adr.includes(phrase)) fail(`ADR is missing ${phrase}`);
  }
}

function validate(bundle) {
  validateEvidence(bundle);
  validateRuntimeReview(bundle.runtimeReview);
  validateV2(bundle);
  validateBindings(bundle);
}

function read(path) {
  return readFileSync(join(root, path));
}

function loadBundle() {
  const text = (path) => read(path).toString("utf8");
  const yaml = (path) => YAML.parse(text(path));
  return {
    planBytes: read(paths.plan),
    evidenceBytes: read(paths.evidence),
    evidence: JSON.parse(text(paths.evidence)),
    runtimeReview: yaml(paths.review),
    v1Bytes: read(paths.v1),
    v1: yaml(paths.v1),
    v2: yaml(paths.v2),
    tasks: yaml(paths.tasks),
    rootPackage: JSON.parse(text(paths.package)),
    risks: text(paths.risks),
    adr: text(paths.adr),
    attributes: text(paths.attributes),
    prettierIgnore: text(paths.prettierIgnore),
  };
}

function selfTest(bundle) {
  validate(bundle);
  execFileSync(process.execPath, [join(root, paths.collector), "--self-test"], {
    cwd: root,
    stdio: "pipe",
  });
  const cases = [
    ["evidence bytes", (x) => (x.evidenceBytes = Buffer.from("{}\n"))],
    ["evidence schema", (x) => (x.evidence.schema = "wrong")],
    ["evidence time", (x) => (x.evidence.observedAt = "2026-08-31T00:00:00Z")],
    ["dirty before", (x) => (x.evidence.repository.cleanBefore = false)],
    ["implementation", (x) => (x.evidence.repository.commit = "0".repeat(40))],
    ["plan digest", (x) => (x.evidence.repository.planSha256 = "0".repeat(64))],
    ["private DNS claim", (x) => (x.evidence.transport.dnsPublicOnly = false)],
    ["raw content", (x) => (x.evidence.transport.rawContentRetained = true)],
    ["redirect", (x) => x.evidence.root.redirects.pop()],
    ["root status", (x) => (x.evidence.root.status = 302)],
    ["version family", (x) => (x.evidence.version.family = "2026.8")],
    ["version patch", (x) => (x.evidence.version.exact = "2026.8.0")],
    ["asset removal", (x) => x.evidence.version.assets.pop()],
    [
      "asset digest",
      (x) => (x.evidence.version.assets[0].sha256 = "0".repeat(64)),
    ],
    ["health", (x) => (x.evidence.health.ready.status = 503)],
    [
      "image claim",
      (x) => (x.evidence.claims.containerImageDigestObserved = true),
    ],
    [
      "evidence authority",
      (x) => (x.evidence.authority.productionMutation = true),
    ],
    ["review schema", (x) => (x.runtimeReview.schema = "wrong")],
    [
      "review source",
      (x) =>
        (x.runtimeReview.officialSources.securityPolicy =
          "https://example.invalid"),
    ],
    [
      "patch support",
      (x) =>
        (x.runtimeReview.supportDecision.deployedIsLatestPatchInFeatureLineThroughCutoff = false),
    ],
    [
      "candidate acceptance",
      (x) => (x.runtimeReview.supportDecision.candidateAccepted = true),
    ],
    [
      "support extra field",
      (x) => (x.runtimeReview.supportDecision.approved = false),
    ],
    ["impact severity", (x) => (x.runtimeReview.impact.severity = "low")],
    ["gate removal", (x) => x.runtimeReview.remainingGates.pop()],
    [
      "review authority",
      (x) => (x.runtimeReview.authority.providerUpgradeApproved = true),
    ],
    ["V1 bytes", (x) => (x.v1Bytes = Buffer.from("{}\n"))],
    ["V2 schema", (x) => (x.v2.schema = "wrong")],
    ["V1 decision", (x) => (x.v2.supersedes.decisionSha256 = "0".repeat(64))],
    [
      "prior severity",
      (x) => (x.v2.change.expectedPreviousSeverity = "medium"),
    ],
    [
      "replacement",
      (x) => (x.v2.change.replacement.impact.classification = "current"),
    ],
    [
      "effective digest",
      (x) => (x.v2.effectiveDecision.decisionSha256 = "0".repeat(64)),
    ],
    [
      "severity inventory",
      (x) => (x.v2.effectiveDecision.severityInventory.high = 5),
    ],
    ["monthly completion", (x) => (x.v2.outcomes.monthlyReview = "complete")],
    ["V2 authority", (x) => (x.v2.authority.deploymentApproved = true)],
    ["V2 outcome extra field", (x) => (x.v2.outcomes.approved = false)],
    [
      "task evidence",
      (x) =>
        (x.tasks.tasks.find(
          (task) => task.id === "M16-CONTINUOUS-IMPROVEMENT",
        ).evidence = []),
    ],
    [
      "root gate",
      (x) =>
        (x.rootPackage.scripts.check = x.rootPackage.scripts.check.replace(
          "npm run continuous-improvement:authentik-runtime:validate",
          "",
        )),
    ],
    [
      "attribute",
      (x) =>
        (x.attributes = x.attributes.replace(
          "authentik-runtime-*.json -text",
          "authentik-runtime-*.json text",
        )),
    ],
    [
      "ADR boundary",
      (x) =>
        (x.adr = x.adr.replace(
          "Public shell evidence is not image evidence",
          "Public evidence",
        )),
    ],
  ];
  for (const [name, mutate] of cases) {
    const candidate = structuredClone(bundle);
    mutate(candidate);
    let rejected = false;
    try {
      validate(candidate);
    } catch {
      rejected = true;
    }
    if (!rejected) fail(`self-test accepted ${name}`);
  }
  console.log(
    `Validated Authentik ${locked.exactVersion} runtime evidence and rejected ${cases.length} review corruptions plus the collector's 14 capture corruptions.`,
  );
}

const bundle = loadBundle();
if (process.argv.includes("--self-test")) selfTest(bundle);
else {
  validate(bundle);
  console.log(`Validated Authentik ${locked.exactVersion} runtime evidence.`);
}
