import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const paths = Object.freeze({
  review: "infrastructure/governance/next-runtime-review.yaml",
  evidence:
    "docs/plan/evidence/M16/runs/next-runtime-c3b2954-2026-08-29T155152Z.json",
  attributes: ".gitattributes",
  prettierIgnore: ".prettierignore",
  rootPackage: "package.json",
  dashboardPackage: "apps/dashboard/package.json",
  lock: "package-lock.json",
  nextConfig: "apps/dashboard/next.config.ts",
  tasks: "docs/plan/TASKS.yaml",
  risks: "RISKS.md",
  backlog: "docs/plan/IMPROVEMENT_BACKLOG.yaml",
  adr: "docs/architecture/ADR/0102-nextjs-16-3-3-critical-security-update.md",
});

const locked = Object.freeze({
  previousVersion: "16.3.0",
  candidateVersion: "16.3.3",
  releaseUrl: "https://github.com/vercel/next.js/releases/tag/v16.3.3",
  releasePublishedAt: "2026-08-25T16:17:10Z",
  productionCommit: "0ced4b666a55d836bd3d4927337fe057a71bb4ba",
  candidatePreviousCommit: "a71a84b6d35438043ce3a0f7db86cf2231c9b3c5",
  implementationCommit: "c3b29542035772ddcbc48d92e2b159ac605dd80f",
  analysisMergeCommit: "4722ec6f5ca5ead74d4f80587150135c6b789e8e",
  evidenceSha256:
    "d90150e1ec818f1fa092df6cf6a91137c1333cf5b97b4eafb4bcfe3b4ec205ca",
  evidenceAttribute: "docs/plan/evidence/M16/runs/next-runtime-*.json -text",
  evidencePrettierIgnore: "docs/plan/evidence/M16/runs/next-runtime-*.json",
  next: {
    previousTarball: "https://registry.npmjs.org/next/-/next-16.3.0.tgz",
    previousIntegrity:
      "sha512-NEdGOzH+08eTXMUp9UYkA99Nhi5N6Thrhc1jgFOQgfgnGK/dA2hRwBpXep+exdFQrnwlRf/3Wixyp8lLBUpE2A==",
    previousShasum: "03ed9eaf21bac38ceab5aa6f3b03f0fff587b42b",
    candidateTarball: "https://registry.npmjs.org/next/-/next-16.3.3.tgz",
    candidateIntegrity:
      "sha512-tuRTx1nQ/yVw83cwJBo9F+njGUgMn3UHQycreWHB8XsStvvAh1AthbI8/4IpKnFaF58F+iSiHejYOlMQ/eq83g==",
    candidateShasum: "dc062aa903c34e2af41a0ffa2ad99c9369447d07",
  },
  eslint: {
    previousTarball:
      "https://registry.npmjs.org/eslint-config-next/-/eslint-config-next-16.3.0.tgz",
    previousIntegrity:
      "sha512-lPrf1kHsMJEZqO0uXkNB400c5MGrhrTk3BNX7P0ol4gt61+iUlQfjy9TyIOEA9eOXrf+5+mYbT/JsY8+zqUByQ==",
    previousShasum: "b6e7cdceb55d98577837937898d1be71e9d17273",
    candidateTarball:
      "https://registry.npmjs.org/eslint-config-next/-/eslint-config-next-16.3.3.tgz",
    candidateIntegrity:
      "sha512-teqtsR26tnlfXFHfVLTM/4tzEzU8DMu6GS1sddZzhfGzgd2f2ofbgDUcsk6cssSCzX6Tk6fmWifJcdANSdPJrw==",
    candidateShasum: "bc1d635194f4d81ef4ef9338547b20a432022e2b",
  },
  lockPackages: [
    [
      "@next/env",
      "16.3.3",
      "sha512-U2eYQRwXj+dsqxV79zFqExDdatnNY/ZWc2nsJU1p/OgT7fd3dXwlF6OjYaFQCfMoeTA19PWq+wVmYgimVA+V+g==",
    ],
    [
      "@next/eslint-plugin-next",
      "16.3.3",
      "sha512-pbEh30vvjKpDoTAmo1v3q2uM4JUi8QaEBpbmjWvGfoec2jLghy/WNtvzAT0bk+Ik9oz6etjt4YjXEk4BQnicCw==",
    ],
    [
      "@next/swc-darwin-arm64",
      "16.3.3",
      "sha512-8Hiv32QJPwdV6KYJ8meR9SBA061tQqnIKTJDocvOXlEQqib0xMFpzArosuffFUUc0sslbh7QQ8a3Yey1QV8EIw==",
    ],
    [
      "@next/swc-darwin-x64",
      "16.3.3",
      "sha512-A1lgKgwVchRYmSe467zdwhxT9040dd8lH+o65sL5Jet8fjB4kegw/rDyPIpYVRb6jAqwXFOJpjIXJLxQKLiE3A==",
    ],
    [
      "@next/swc-linux-arm64-gnu",
      "16.3.3",
      "sha512-bf0FIssMFueU2dm7vQEWWxk0c8UjKTdW0yzuh0sQsD8pf1+KCLDdaqhYZNMYGmXwEOiHAUzgBKudovIlcvvBjg==",
    ],
    [
      "@next/swc-linux-arm64-musl",
      "16.3.3",
      "sha512-W7viwCk9JY/cAkdz/A273rd5bb3RgT/IHwR7Upv90tunjBWNtAAhGhoecHh+teRNRSinuAFmE+l7fwZ4YKkrXg==",
    ],
    [
      "@next/swc-linux-x64-gnu",
      "16.3.3",
      "sha512-0W46zw1N3ODpI6n0GeivHvvob1pooozgZVqy65k0mh4/7vr+FbY9+WpHzNVXjHipJf/A3FDheBG19H1s5A25rA==",
    ],
    [
      "@next/swc-linux-x64-musl",
      "16.3.3",
      "sha512-H4mBso8ZTMBPtdT0PN0pBx2ayTvQuTuvS6qT13d77yVFJXAPCxkyIhLTmdMaGTJs0krQYI/qpzdHijCeihXhbg==",
    ],
    [
      "@next/swc-win32-arm64-msvc",
      "16.3.3",
      "sha512-cTMUJpcEGmeywofCUfhR+rSsoE33+rVPnPEYNTNdLNlsOeEg/vktOsKUSTb28vUGqD2jkm4Zaskcwn7OCI6FQg==",
    ],
    [
      "@next/swc-win32-x64-msvc",
      "16.3.3",
      "sha512-2VR4cTBzHXaBjnGsuH6GyJjENzQOmHeAh11uY1iUhjm3j5dEUrVJuUj+VL78jaGi/Dik8xS76zEj18BsFhlVZQ==",
    ],
    [
      "@swc/helpers",
      "0.5.23",
      "sha512-5lSsMOTXURePglDfvuAQUqkGek9Hg2kksOYay2m0+XR++b2NWYL/4sWyuvVBIs8oKnJaxkdi9whaL/sqN13afw==",
    ],
  ],
});

function fail(message) {
  throw new Error(`Next.js runtime review invalid: ${message}`);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
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

function validatePackageEvidence(actual, expected, label) {
  exactKeys(actual, ["version", "tarball", "integrity", "shasum"], label);
  for (const key of Object.keys(expected)) {
    if (actual[key] !== expected[key]) fail(`${label}.${key} differs`);
  }
}

function validateCiEvidence(evidence, raw) {
  if (sha256(raw) !== locked.evidenceSha256) {
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
      "verification",
      "production",
    ],
    "CI evidence",
  );
  if (
    evidence.schema !== "starfiniti.next-runtime-ci-evidence.v1" ||
    evidence.observedAt !== "2026-08-29T15:51:52Z" ||
    evidence.candidate?.implementationCommit !== locked.implementationCommit ||
    evidence.candidate?.analysisMergeCommit !== locked.analysisMergeCommit ||
    evidence.candidate?.baseCommit !==
      "2826b0bdc758cf224ac22d85940e73b25b61865f" ||
    evidence.candidate?.pullRequest !== 57 ||
    evidence.candidate?.pullRequestOpen !== true ||
    evidence.candidate?.pullRequestMergeable !== true
  ) {
    fail("CI evidence candidate identity differs");
  }
  if (
    evidence.github?.ci?.runId !== 33261152926 ||
    evidence.github?.ci?.headCommit !== locked.implementationCommit ||
    evidence.github?.ci?.completedAt !== "2026-08-29T15:49:18Z" ||
    evidence.github?.ci?.conclusion !== "success" ||
    evidence.github?.security?.runId !== 33261152934 ||
    evidence.github?.security?.headCommit !== locked.implementationCommit ||
    evidence.github?.security?.analysisMergeCommit !==
      locked.analysisMergeCommit ||
    evidence.github?.security?.completedAt !== "2026-08-29T15:51:52Z" ||
    evidence.github?.security?.conclusion !== "success" ||
    evidence.github?.requiredChecks !== 12 ||
    evidence.github?.requiredChecksPassed !== 12
  ) {
    fail("CI or Security run evidence differs");
  }
  const observedAt = Date.parse(evidence.observedAt);
  const completionTimes = [
    evidence.github.ci.completedAt,
    evidence.github.security.completedAt,
    evidence.github.externalCodeql?.completedAt,
  ].map((value) => Date.parse(value));
  if (
    !Number.isFinite(observedAt) ||
    completionTimes.some(
      (value) => !Number.isFinite(value) || value > observedAt,
    )
  ) {
    fail("evidence predates a required check completion");
  }
  exactArray(
    evidence.github.ci.jobs.map(
      (job) => `${job.id}:${job.name}:${job.conclusion}`,
    ),
    [
      "99123210642:containers:success",
      "99123210743:woocommerce-runtime (current-legacy):success",
      "99123210753:woocommerce-runtime (current-hpos):success",
      "99123210785:baseline:success",
      "99123210797:woocommerce-runtime (minimum-hpos):success",
      "99123210800:database:success",
      "99123210819:woocommerce-runtime (minimum-legacy):success",
    ],
    "CI jobs",
  );
  exactArray(
    evidence.github.security.jobs.map(
      (job) => `${job.id}:${job.name}:${job.conclusion}`,
    ),
    [
      "99123210677:dast:success",
      "99123210744:recovery-transport:success",
      "99123210752:supply-chain:success",
      "99123210754:codeql:success",
    ],
    "Security jobs",
  );
  if (
    evidence.github.externalCodeql?.checkRunId !== 99123424225 ||
    evidence.github.externalCodeql?.analysisId !== 1691996816 ||
    evidence.github.externalCodeql?.analysisCommit !==
      locked.analysisMergeCommit ||
    evidence.github.externalCodeql?.completedAt !== "2026-08-29T15:48:10Z" ||
    evidence.github.externalCodeql?.results !== 0 ||
    evidence.github.externalCodeql?.rules !== 103 ||
    evidence.github.externalCodeql?.conclusion !== "success"
  ) {
    fail("external CodeQL evidence differs");
  }
  const artifacts = [
    [
      "supplyChain",
      9717321080,
      "1f7a7f8292f537eec0758bbcce86afa9446d89b259982c6cb174760ec1c3f5e7",
    ],
    [
      "codeql",
      9717306479,
      "0c09ce28decb6ea3b9432360e406cd3b71fa37b7c8369327b505c2200d8eaad6",
    ],
    [
      "dast",
      9717310530,
      "b9ce9511a65da964d226e7812755b1f186e531489107d09285b3a616864a2d00",
    ],
  ];
  for (const [name, id, digest] of artifacts) {
    if (
      evidence.artifacts?.[name]?.id !== id ||
      evidence.artifacts?.[name]?.archiveSha256 !== digest
    ) {
      fail(`${name} artifact evidence differs`);
    }
  }
  if (
    evidence.security?.repository?.version !== "0.74.0" ||
    evidence.security?.repository?.vulnerabilities !== 0 ||
    evidence.security?.repository?.misconfigurations !== 0 ||
    evidence.security?.repository?.secrets !== 0 ||
    evidence.security?.repository?.licenceFindings !== 0 ||
    evidence.security?.codeql?.version !== "2.26.4" ||
    evidence.security?.codeql?.querySuite !== "security-extended" ||
    evidence.security?.codeql?.findings !== 0 ||
    evidence.security?.dast?.version !== "2.17.0" ||
    evidence.security?.dast?.informationalAlerts !== 2 ||
    evidence.security?.dast?.lowAlerts !== 0 ||
    evidence.security?.dast?.mediumAlerts !== 0 ||
    evidence.security?.dast?.highAlerts !== 0 ||
    evidence.security?.dast?.criticalAlerts !== 0
  ) {
    fail("security result evidence differs");
  }
  const expectedImages = {
    dashboard: {
      imageId:
        "1ee51bbbf36f0f5f26a76b0fe26dab40ce7d10924717feddc4710a05c478da93",
      components: 228,
    },
    worker: {
      imageId:
        "8ab52b924b6b32a12c1c5412850f137fd74b818564c2994a3746f5d612d11611",
      components: 108,
    },
  };
  for (const [name, expected] of Object.entries(expectedImages)) {
    const image = evidence.security.images?.[name];
    if (
      image?.imageId !== expected.imageId ||
      image?.components !== expected.components ||
      image?.vulnerabilities !== 0 ||
      image?.misconfigurations !== 0 ||
      image?.secrets !== 0
    ) {
      fail(`${name} image evidence differs`);
    }
  }
  const verification = evidence.verification;
  if (
    verification?.tests !== 995 ||
    verification?.migrations !== 87 ||
    verification?.pgTapFiles !== 69 ||
    verification?.pgTapAssertions !== 3790 ||
    verification?.concurrencyProbes !== 22 ||
    verification?.woocommerceRuntimeJobs !== 4 ||
    verification?.npmAuditVulnerabilities !== 0 ||
    verification?.secretScanFiles !== 1185
  ) {
    fail("verification evidence differs");
  }
  if (
    evidence.production?.mutation !== false ||
    evidence.production?.mergeApproved !== false ||
    evidence.production?.releaseApproved !== false ||
    evidence.production?.deploymentApproved !== false ||
    evidence.production?.productionReconciled !== false ||
    evidence.production?.deployedNextVersion !== locked.previousVersion
  ) {
    fail("production authority evidence differs");
  }
}

function validateReview(review, files) {
  if (
    !files.attributes.split(/\r?\n/u).includes(locked.evidenceAttribute) ||
    !files.prettierIgnore
      .split(/\r?\n/u)
      .includes(locked.evidencePrettierIgnore)
  ) {
    fail("immutable evidence byte-preservation controls differ");
  }
  exactKeys(
    review,
    [
      "schema",
      "reviewedAt",
      "owner",
      "officialSources",
      "affected",
      "packages",
      "decision",
      "ciEvidence",
      "authority",
    ],
    "review",
  );
  if (
    review.schema !== "starfiniti.next-runtime-review.v1" ||
    review.reviewedAt !== "2026-08-29" ||
    review.owner !== "engineering"
  ) {
    fail("schema, date, or owner differs");
  }

  exactKeys(
    review.officialSources,
    ["release", "advisories"],
    "officialSources",
  );
  exactKeys(
    review.officialSources.release,
    ["url", "version", "publishedAt"],
    "officialSources.release",
  );
  if (
    review.officialSources.release.url !== locked.releaseUrl ||
    review.officialSources.release.version !== locked.candidateVersion ||
    review.officialSources.release.publishedAt !== locked.releasePublishedAt
  ) {
    fail("official release differs");
  }
  const expectedAdvisories = [
    {
      id: "GHSA-2xp9-vwfh-vxw4",
      cve: null,
      url: "https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4",
      severity: "critical",
      vulnerableRange: "<16.3.3",
      patchedVersion: "16.3.3",
      precondition: "AVIF input reaches the Next.js Image Optimization API",
    },
    {
      id: "GHSA-p293-qw3h-jr36",
      cve: "CVE-2026-75604",
      url: "https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36",
      severity: "critical",
      vulnerableRange: ">=16.0 <16.3.3",
      patchedVersion: "16.3.3",
      precondition:
        "Windows-hosted Pages or App Router server without Cache Components",
    },
  ];
  if (
    JSON.stringify(review.officialSources.advisories) !==
    JSON.stringify(expectedAdvisories)
  ) {
    fail("official advisories differ");
  }

  exactKeys(
    review.affected,
    ["production", "candidateBeforeReview"],
    "affected",
  );
  exactKeys(
    review.affected.production,
    [
      "release",
      "commit",
      "nextVersion",
      "platform",
      "imageOptimizationDisabled",
      "status",
    ],
    "affected.production",
  );
  if (
    review.affected.production.release !== "v0.1.11" ||
    review.affected.production.commit !== locked.productionCommit ||
    review.affected.production.nextVersion !== locked.previousVersion ||
    review.affected.production.platform !== "linux/amd64" ||
    review.affected.production.imageOptimizationDisabled !== false ||
    review.affected.production.status !==
      "affected-until-approved-release-deployment"
  ) {
    fail("production impact differs");
  }
  exactKeys(
    review.affected.candidateBeforeReview,
    ["branch", "commit", "nextVersion", "imageOptimizationDisabled"],
    "affected.candidateBeforeReview",
  );
  if (
    review.affected.candidateBeforeReview.branch !==
      "codex/enterprise-roadmap-integration" ||
    review.affected.candidateBeforeReview.commit !==
      locked.candidatePreviousCommit ||
    review.affected.candidateBeforeReview.nextVersion !==
      locked.previousVersion ||
    review.affected.candidateBeforeReview.imageOptimizationDisabled !== true
  ) {
    fail("candidate starting state differs");
  }

  exactKeys(review.packages, ["previous", "candidate"], "packages");
  exactKeys(
    review.packages.previous,
    ["next", "eslintConfigNext"],
    "packages.previous",
  );
  exactKeys(
    review.packages.candidate,
    ["next", "eslintConfigNext", "lockPackages", "imageOptimizationDisabled"],
    "packages.candidate",
  );
  validatePackageEvidence(
    review.packages.previous.next,
    {
      version: locked.previousVersion,
      tarball: locked.next.previousTarball,
      integrity: locked.next.previousIntegrity,
      shasum: locked.next.previousShasum,
    },
    "packages.previous.next",
  );
  validatePackageEvidence(
    review.packages.previous.eslintConfigNext,
    {
      version: locked.previousVersion,
      tarball: locked.eslint.previousTarball,
      integrity: locked.eslint.previousIntegrity,
      shasum: locked.eslint.previousShasum,
    },
    "packages.previous.eslintConfigNext",
  );
  validatePackageEvidence(
    review.packages.candidate.next,
    {
      version: locked.candidateVersion,
      tarball: locked.next.candidateTarball,
      integrity: locked.next.candidateIntegrity,
      shasum: locked.next.candidateShasum,
    },
    "packages.candidate.next",
  );
  validatePackageEvidence(
    review.packages.candidate.eslintConfigNext,
    {
      version: locked.candidateVersion,
      tarball: locked.eslint.candidateTarball,
      integrity: locked.eslint.candidateIntegrity,
      shasum: locked.eslint.candidateShasum,
    },
    "packages.candidate.eslintConfigNext",
  );
  const expectedLockPackages = locked.lockPackages.map(
    ([id, version, integrity]) => ({ id, version, integrity }),
  );
  if (
    JSON.stringify(review.packages.candidate.lockPackages) !==
    JSON.stringify(expectedLockPackages)
  ) {
    fail("packages.candidate.lockPackages differs");
  }
  if (review.packages.candidate.imageOptimizationDisabled !== true) {
    fail("candidate image optimization defence differs");
  }

  exactKeys(
    review.decision,
    ["disposition", "breakingChangeIdentified", "requiredEvidence", "rollback"],
    "decision",
  );
  if (
    review.decision.disposition !== "update-exact-patch-and-rebuild" ||
    review.decision.breakingChangeIdentified !== false ||
    review.decision.rollback !==
      "Disable or withdraw the candidate and forward-fix; never restore a deployable artifact to Next.js 16.3.0."
  ) {
    fail("decision differs");
  }
  exactArray(
    review.decision.requiredEvidence,
    [
      "exact-package-lock-provenance",
      "validator-self-test",
      "dashboard-tests-types-lint-and-build",
      "repository-and-production-audit",
      "image-build-sbom-and-trivy",
      "codeql-and-dast",
      "database-and-woocommerce-regression",
    ],
    "decision.requiredEvidence",
  );
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
    "ciEvidence",
  );
  if (
    review.ciEvidence.path !== paths.evidence ||
    review.ciEvidence.sha256 !== locked.evidenceSha256 ||
    review.ciEvidence.implementationCommit !== locked.implementationCommit ||
    review.ciEvidence.analysisMergeCommit !== locked.analysisMergeCommit ||
    review.ciEvidence.ciRunId !== 33261152926 ||
    review.ciEvidence.securityRunId !== 33261152934 ||
    review.ciEvidence.conclusion !== "passed"
  ) {
    fail("CI evidence binding differs");
  }
  validateCiEvidence(files.evidence, files.evidenceRaw);
  exactKeys(
    review.authority,
    [
      "productionAccess",
      "mergeApproved",
      "releaseApproved",
      "deploymentApproved",
      "productionReconciled",
      "rollbackToVulnerableVersionAllowed",
    ],
    "authority",
  );
  if (Object.values(review.authority).some((value) => value !== false)) {
    fail("authority must remain false");
  }

  if (
    files.dashboardPackage.dependencies?.next !== locked.candidateVersion ||
    files.rootPackage.devDependencies?.["eslint-config-next"] !==
      locked.candidateVersion
  ) {
    fail("package manifests are not exact 16.3.3");
  }
  const lockRoot = files.lock.packages?.[""];
  const lockDashboard = files.lock.packages?.["apps/dashboard"];
  const lockNext = files.lock.packages?.["node_modules/next"];
  const lockEslint = files.lock.packages?.["node_modules/eslint-config-next"];
  if (
    lockRoot?.devDependencies?.["eslint-config-next"] !==
      locked.candidateVersion ||
    lockDashboard?.dependencies?.next !== locked.candidateVersion ||
    lockNext?.version !== locked.candidateVersion ||
    lockNext?.resolved !== locked.next.candidateTarball ||
    lockNext?.integrity !== locked.next.candidateIntegrity ||
    lockEslint?.version !== locked.candidateVersion ||
    lockEslint?.resolved !== locked.eslint.candidateTarball ||
    lockEslint?.integrity !== locked.eslint.candidateIntegrity
  ) {
    fail("package-lock provenance differs");
  }
  for (const [id, version, integrity] of locked.lockPackages) {
    const entry = files.lock.packages?.[`node_modules/${id}`];
    const unscopedName = id.split("/").at(-1);
    const resolved = `https://registry.npmjs.org/${id}/-/${unscopedName}-${version}.tgz`;
    if (
      entry?.version !== version ||
      entry?.resolved !== resolved ||
      entry?.integrity !== integrity
    ) {
      fail(`package-lock ${id} provenance differs`);
    }
  }
  if (files.lockRaw.includes("next-16.3.0.tgz")) {
    fail("package-lock retains the vulnerable Next.js tarball");
  }
  if (!/images:\s*\{[\s\S]*?unoptimized:\s*true/u.test(files.nextConfig)) {
    fail("Next.js image optimization defence is absent");
  }
  const rootCheck = files.rootPackage.scripts?.check ?? "";
  if (
    files.rootPackage.scripts?.[
      "continuous-improvement:next-runtime:validate"
    ] !== "node scripts/validate-next-runtime-review.mjs --self-test" ||
    !rootCheck.includes("npm run continuous-improvement:next-runtime:validate")
  ) {
    fail("root validation wiring differs");
  }
  const task = files.taskDocument.tasks?.find(
    (item) => item.id === "M16-CONTINUOUS-IMPROVEMENT",
  );
  if (
    !task ||
    !task.verification?.includes(
      "npm run continuous-improvement:next-runtime:validate",
    ) ||
    !task.risks?.includes("R-060") ||
    !task.docs?.includes(
      "docs/architecture/ADR/0102-nextjs-16-3-3-critical-security-update.md",
    ) ||
    !task.evidence?.includes(
      "infrastructure/governance/next-runtime-review.yaml",
    ) ||
    !task.evidence?.includes("scripts/validate-next-runtime-review.mjs") ||
    !task.evidence?.includes(paths.evidence)
  ) {
    fail("M16 task binding differs");
  }
  if (!files.risks.includes("| R-060 |")) fail("R-060 is missing");
  const backlogItem = files.backlog.items?.find(
    (item) => item.id === "IMP-012",
  );
  if (
    backlogItem?.severity !== "critical" ||
    backlogItem?.score !== 87 ||
    backlogItem?.status !== "blocked_external" ||
    backlogItem?.evidence !== paths.review
  ) {
    fail("IMP-012 backlog evidence differs");
  }
  for (const text of [files.adr, files.tasks, files.risks]) {
    if (!text.includes("16.3.3") || !text.includes("16.3.0")) {
      fail("living evidence omits previous or patched version");
    }
  }
}

function loadFiles() {
  const read = (path) => readFileSync(join(root, path), "utf8");
  const lockRaw = read(paths.lock);
  const evidenceRaw = read(paths.evidence);
  return {
    review: YAML.parse(read(paths.review)),
    evidence: JSON.parse(evidenceRaw),
    evidenceRaw,
    attributes: read(paths.attributes),
    prettierIgnore: read(paths.prettierIgnore),
    rootPackage: JSON.parse(read(paths.rootPackage)),
    dashboardPackage: JSON.parse(read(paths.dashboardPackage)),
    lock: JSON.parse(lockRaw),
    lockRaw,
    nextConfig: read(paths.nextConfig),
    tasks: read(paths.tasks),
    taskDocument: YAML.parse(read(paths.tasks)),
    risks: read(paths.risks),
    backlog: YAML.parse(read(paths.backlog)),
    adr: read(paths.adr),
  };
}

function clone(value) {
  return structuredClone(value);
}

function runSelfTest(files) {
  const cases = [
    (value) => (value.review.schema = "starfiniti.next-runtime-review.v2"),
    (value) =>
      (value.attributes = value.attributes.replace(
        locked.evidenceAttribute,
        "docs/plan/evidence/M16/runs/next-runtime-*.json text",
      )),
    (value) =>
      (value.prettierIgnore = value.prettierIgnore.replace(
        locked.evidencePrettierIgnore,
        "docs/plan/evidence/M16/runs/forged-next-runtime-*.json",
      )),
    (value) => (value.review.officialSources.release.version = "16.3.4"),
    (value) => (value.review.officialSources.advisories[0].severity = "high"),
    (value) => (value.review.officialSources.advisories[1].cve = null),
    (value) => (value.review.affected.production.nextVersion = "16.3.3"),
    (value) =>
      (value.review.affected.production.imageOptimizationDisabled = true),
    (value) =>
      (value.review.packages.candidate.next.integrity = "sha512-forged"),
    (value) =>
      (value.review.packages.candidate.eslintConfigNext.tarball =
        "https://example.com/forged.tgz"),
    (value) =>
      (value.review.packages.candidate.lockPackages[4].integrity =
        "sha512-forged"),
    (value) => value.review.decision.requiredEvidence.pop(),
    (value) => (value.evidenceRaw += " "),
    (value) =>
      (value.evidence.github.security.completedAt = "2026-08-29T15:51:53Z"),
    (value) => (value.evidence.production.mergeApproved = true),
    (value) => (value.review.authority.mergeApproved = true),
    (value) =>
      (value.review.authority.rollbackToVulnerableVersionAllowed = true),
    (value) => (value.dashboardPackage.dependencies.next = "16.3.0"),
    (value) =>
      (value.rootPackage.devDependencies["eslint-config-next"] = "16.3.0"),
    (value) =>
      (value.lock.packages["node_modules/next"].integrity = "sha512-forged"),
    (value) =>
      (value.lock.packages["node_modules/eslint-config-next"].version =
        "16.3.0"),
    (value) =>
      (value.lock.packages["node_modules/@next/swc-linux-x64-musl"].integrity =
        "sha512-forged"),
    (value) => (value.lockRaw += "next-16.3.0.tgz"),
    (value) =>
      (value.nextConfig = value.nextConfig.replace(
        "unoptimized: true",
        "unoptimized: false",
      )),
    (value) =>
      delete value.rootPackage.scripts[
        "continuous-improvement:next-runtime:validate"
      ],
    (value) =>
      (value.taskDocument.tasks.find(
        (item) => item.id === "M16-CONTINUOUS-IMPROVEMENT",
      ).risks = value.taskDocument.tasks
        .find((item) => item.id === "M16-CONTINUOUS-IMPROVEMENT")
        .risks.filter((risk) => risk !== "R-060")),
    (value) =>
      (value.taskDocument.tasks.find(
        (item) => item.id === "M16-CONTINUOUS-IMPROVEMENT",
      ).evidence = value.taskDocument.tasks
        .find((item) => item.id === "M16-CONTINUOUS-IMPROVEMENT")
        .evidence.filter((path) => path !== paths.evidence)),
    (value) => (value.risks = value.risks.replace("| R-060 |", "| R-999 |")),
    (value) =>
      (value.backlog.items.find((item) => item.id === "IMP-012").score = 86),
  ];
  for (const [index, mutate] of cases.entries()) {
    const candidate = clone(files);
    mutate(candidate);
    let rejected = false;
    try {
      validateReview(candidate.review, candidate);
    } catch {
      rejected = true;
    }
    if (!rejected) fail(`self-test corruption ${index + 1} was accepted`);
  }
  return cases.length;
}

const files = loadFiles();
validateReview(files.review, files);
const selfTest = process.argv.includes("--self-test");
const corruptionCases = selfTest ? runSelfTest(files) : 0;
process.stdout.write(
  `${JSON.stringify({
    valid: true,
    schema: files.review.schema,
    candidateVersion: locked.candidateVersion,
    advisories: files.review.officialSources.advisories.length,
    corruptionCases,
    productionMutated: false,
  })}\n`,
);
