import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const paths = Object.freeze({
  review: "infrastructure/governance/supabase-runtime-review.yaml",
  evidence:
    "docs/plan/evidence/M16/runs/supabase-runtime-1b9a4d4-2026-08-29T172357Z.json",
  attributes: ".gitattributes",
  prettierIgnore: ".prettierignore",
  rootPackage: "package.json",
  dashboardPackage: "apps/dashboard/package.json",
  lock: "package-lock.json",
  config: "supabase/config.toml",
  tasks: "docs/plan/TASKS.yaml",
  adr: "docs/architecture/ADR/0103-reviewed-supabase-client-toolchain-refresh.md",
});

const locked = Object.freeze({
  schema: "starfiniti.supabase-runtime-review.v1",
  evidenceSchema: "starfiniti.supabase-runtime-ci-evidence.v1",
  evidenceSize: 5932,
  evidenceSha256:
    "3826e55e239bb4a2f9a3ee6d3d3f3e7541c5de0572d0d53dcd552b3cccd21aa7",
  implementationCommit: "1b9a4d4767eb504b65b5e06d5d8e8ec444dd46c3",
  analysisMergeCommit: "bb19a18be4b889573cfb163df3d924933c90bfeb",
  changelog: "https://supabase.com/changelog.md",
  dataApiSecurity: "https://supabase.com/docs/guides/api/securing-your-api",
  releases: {
    cli: [
      "https://github.com/supabase/cli/releases/tag/v2.116.0",
      "2.116.0",
      "2026-08-26T19:51:24Z",
    ],
    supabaseJs: [
      "https://github.com/supabase/supabase-js/releases/tag/v2.112.4",
      "2.112.4",
      "2026-08-24T10:32:46Z",
    ],
    ssr: [
      "https://github.com/supabase/ssr/releases/tag/v0.12.5",
      "0.12.5",
      "2026-08-24T11:32:32Z",
    ],
  },
  previous: {
    cli: [
      "2.113.0",
      "sha512-GWlx87NpsT1opPOLWRkaTnXEUUchWmCMPVCLRU22GD+oJEH/sVnUI9NCrMZuf5XpmQE+aSbPogHW69UIbVL32w==",
    ],
    supabaseJs: [
      "2.112.3",
      "sha512-Jv1bxVQmEJNkjvPEhFaKjPzsh+Ozyew6lWGD+SoYcsclDEP1z7yEvKvfUQfzy0DkxRIQnZNxmmWtAzw5XLTQoA==",
    ],
    ssr: [
      "0.12.4",
      "sha512-xHzcgI8cC1TpBKSwJcR5Yd8CCwfIq0SBc5yb4yz/YFw5tbCrEQ0QT3a+2jymCxHgQWLfzwN93HZ6eRbcoMkOlA==",
    ],
  },
  candidates: {
    cli: [
      "2.116.0",
      "https://registry.npmjs.org/supabase/-/supabase-2.116.0.tgz",
      "sha512-cMUHkpjBacq4oLGWnMM2HC2drmUlAlfN/PQb31RARoIdYJ8sqA0xONvqBR6yd5v7w8dXuCPwvfd4N1NTHjBKEw==",
      "f3628bddff4aed857dba5bea5211908a39c16e03",
    ],
    supabaseJs: [
      "2.112.4",
      "https://registry.npmjs.org/@supabase/supabase-js/-/supabase-js-2.112.4.tgz",
      "sha512-UiCX1udlFY1fQQrO7Z3GU7obQsju0w5Vk9mOOwalfo/+Gy+tahWVenSSuu5E/GTy/q//HxvGv2IrCdW66/61kw==",
      "a9f987cced71b7a4dda52d37f915a31c6fa265c9",
    ],
    ssr: [
      "0.12.5",
      "https://registry.npmjs.org/@supabase/ssr/-/ssr-0.12.5.tgz",
      "sha512-0GllaAtHe7FHs6tlSg1CwkFw0a7aai1Shs9rEqSs/HaVkJzPk35C9r0Z8WUtKJ3eY6G/Y5y47YvCro3LynrAJg==",
      "df9a289a7d3974e554da7a4741fb2320fcf06927",
    ],
  },
  jose: [
    "6.2.10",
    "https://registry.npmjs.org/jose/-/jose-6.2.10.tgz",
    "sha512-iiW7J9qRFlGxvCOIBDBDxFePQSn7ZMAnrYGhrrOo6siO/MIqwfyilLR27pkfDgUk+raLuzADS8A3S/KLBisc0g==",
  ],
  authorityKeys: [
    "deploymentApproved",
    "mergeApproved",
    "productionAccess",
    "productionMutation",
    "productionReconciled",
    "productionStackUpgradeApproved",
    "releaseApproved",
  ],
  lockPackages: [
    [
      "@supabase/auth-js",
      "2.112.4",
      "sha512-z8DesgwLzKM5PiT0yNmJU8VJyh1zAhYi+20Z7drdJQLXg/wWW4yGt/un+He5ERYUo94Vz66t5aeyr1DIDemI5A==",
    ],
    [
      "@supabase/functions-js",
      "2.112.4",
      "sha512-DQ0aVH8wSQAccVqNoEkec62qCu2QRNyoGN53RqsVZ1k6F1zq4/v8scrlR6LNT2RJmT97apiTmORijPVhErCS2g==",
    ],
    [
      "@supabase/postgrest-js",
      "2.112.4",
      "sha512-uaubtPSeg2TR4wrtfQoQWgkTAe+a0qWX2KhmwvTfNl5mGN9+U7owiJt6abk3o/V6O899PSRD1yzxs5RlF4xTug==",
    ],
    [
      "@supabase/realtime-js",
      "2.112.4",
      "sha512-vZ+j079SKrM0Xiq7MJCvQKLDpaH2kfKfLY68xuQE1sqsCsMmx1CyrDBJHsxZ3cX01VOs5SI9igmoZAF3BmdZxw==",
    ],
    [
      "@supabase/storage-js",
      "2.112.4",
      "sha512-lQ0JemuTlMIXVKgSci1qez8yPnM5hyDngeAfEBjZS2Om4D+Cus0EE5BE6glFobrxdyii1OF4UzWfF0zcQgDq5A==",
    ],
    [
      "@supabase/cli-darwin-arm64",
      "2.116.0",
      "sha512-Mvfxf5q7oQ1KR59ndFFyGkh12IfwKH5ZOv7OWtHsFkBuwHtHiJgY6Zwd3w09tnat4spkpDTFavclBlLsOQnh2A==",
    ],
    [
      "@supabase/cli-darwin-x64",
      "2.116.0",
      "sha512-dxKmIPcVunC8sPTuU+eVWj2SOB5tLoRTE5FX6J/KMZhGH03khTn6ptHvaanZp0YwaACbm//uoffUlJKZrAgt0w==",
    ],
    [
      "@supabase/cli-linux-arm64",
      "2.116.0",
      "sha512-ZmV96NQqcgx1MH4jWdfyqqjLghy57mRI5bysy6lM7MezsirQh+eXaOdWI0xCy7r7FA09k2fKLGh+r7r0X3mxBg==",
    ],
    [
      "@supabase/cli-linux-arm64-musl",
      "2.116.0",
      "sha512-6lYrbKFJT5NKbEKGBJTArEc1F3oMfWxnQeq8+RZ4wSLjCq4uwluh6+fzKCsLVxZgPOg4r+RZRqDdb+/cLi0yyg==",
    ],
    [
      "@supabase/cli-linux-x64",
      "2.116.0",
      "sha512-o0PvHKyQSKEuC3jJqeV2qorgyMIFGDWQ1Bj+OXf0p80ddgktnJFlDElCU+VDKZkuwLC6vO/LMoBql34zFHzXhw==",
    ],
    [
      "@supabase/cli-linux-x64-musl",
      "2.116.0",
      "sha512-EtPJPHUvLHvXHkvZHAEr+i6w/bDVm5BOPD+09uXgUffsUbNAzfZ8r7Fb94+SfWI+dQwivw4WmijsX7tlx61Zcg==",
    ],
    [
      "@supabase/cli-windows-arm64",
      "2.116.0",
      "sha512-IiglNMXXssDiZbeSRvixYH7eYDDvhiEa2CrOSj419jO5vLrMKvzi1ATxe8E4i7MpKuI9S5U/3tA3rFlIMHtwrg==",
    ],
    [
      "@supabase/cli-windows-x64",
      "2.116.0",
      "sha512-pz4zNDs3KCEx0l9JS9Xaiuzd5WXrISajVlBSxC5/2Jyo2+g+N/ftQJDYTHQ6Jir5fNelIqSHIXZelmGds14upw==",
    ],
  ],
});

function fail(message) {
  throw new Error(`Supabase runtime review invalid: ${message}`);
}

function sameArray(actual, expected, label) {
  if (
    !Array.isArray(actual) ||
    actual.length !== expected.length ||
    actual.some((value, index) => value !== expected[index])
  )
    fail(`${label} differs`);
}

function sameKeys(actual, expected, label) {
  if (
    actual === null ||
    typeof actual !== "object" ||
    Array.isArray(actual) ||
    Object.keys(actual).sort().join("\n") !== [...expected].sort().join("\n")
  )
    fail(`${label} keys differ`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function validateCiEvidence(evidence, raw) {
  if (
    Buffer.byteLength(raw) !== locked.evidenceSize ||
    sha256(raw) !== locked.evidenceSha256
  )
    fail("CI evidence bytes differ");
  sameKeys(
    evidence,
    [
      "schema",
      "observedAt",
      "candidate",
      "github",
      "artifacts",
      "security",
      "verification",
      "supabaseBoundary",
      "production",
    ],
    "CI evidence",
  );
  if (
    evidence.schema !== locked.evidenceSchema ||
    evidence.observedAt !== "2026-08-29T17:23:57Z" ||
    evidence.candidate?.branch !== "codex/enterprise-roadmap-integration" ||
    evidence.candidate?.implementationCommit !== locked.implementationCommit ||
    evidence.candidate?.analysisMergeCommit !== locked.analysisMergeCommit ||
    evidence.candidate?.baseCommit !==
      "2826b0bdc758cf224ac22d85940e73b25b61865f" ||
    evidence.candidate?.pullRequest !== 57 ||
    evidence.candidate?.pullRequestOpen !== true ||
    evidence.candidate?.pullRequestMergeable !== true ||
    evidence.candidate?.pullRequestMergeState !== "CLEAN"
  )
    fail("CI evidence candidate differs");
  if (
    evidence.github?.ci?.runId !== 33265165945 ||
    evidence.github.ci.headCommit !== locked.implementationCommit ||
    evidence.github.ci.completedAt !== "2026-08-29T17:18:52Z" ||
    evidence.github.ci.conclusion !== "success" ||
    evidence.github?.security?.runId !== 33265166008 ||
    evidence.github.security.headCommit !== locked.implementationCommit ||
    evidence.github.security.analysisMergeCommit !==
      locked.analysisMergeCommit ||
    evidence.github.security.completedAt !== "2026-08-29T17:21:25Z" ||
    evidence.github.security.conclusion !== "success" ||
    evidence.github?.externalCodeql?.checkRunId !== 99134053293 ||
    evidence.github.externalCodeql.analysisId !== 1692149107 ||
    evidence.github.externalCodeql.analysisCommit !==
      locked.analysisMergeCommit ||
    evidence.github.externalCodeql.completedAt !== "2026-08-29T17:17:44Z" ||
    evidence.github.externalCodeql.results !== 0 ||
    evidence.github.externalCodeql.rules !== 103 ||
    evidence.github.externalCodeql.conclusion !== "success" ||
    evidence.github.requiredChecks !== 12 ||
    evidence.github.requiredChecksPassed !== 12
  )
    fail("CI evidence run identity differs");
  const observed = Date.parse(evidence.observedAt);
  for (const completed of [
    evidence.github.ci.completedAt,
    evidence.github.security.completedAt,
    evidence.github.externalCodeql.completedAt,
  ]) {
    if (!Number.isFinite(observed) || Date.parse(completed) > observed)
      fail("CI evidence chronology differs");
  }
  sameArray(
    evidence.github.ci.jobs.map(
      (job) => `${job.id}:${job.name}:${job.conclusion}`,
    ),
    [
      "99133843239:baseline:success",
      "99133843346:woocommerce-runtime (minimum-legacy):success",
      "99133843389:woocommerce-runtime (current-legacy):success",
      "99133843400:database:success",
      "99133843417:containers:success",
      "99133843482:woocommerce-runtime (minimum-hpos):success",
      "99133843525:woocommerce-runtime (current-hpos):success",
    ],
    "CI evidence jobs",
  );
  sameArray(
    evidence.github.security.jobs.map(
      (job) => `${job.id}:${job.name}:${job.conclusion}`,
    ),
    [
      "99133843540:supply-chain:success",
      "99133843704:recovery-transport:success",
      "99133843730:dast:success",
      "99133843748:codeql:success",
    ],
    "Security evidence jobs",
  );
  sameArray(
    [
      evidence.artifacts?.supplyChain?.id,
      evidence.artifacts?.supplyChain?.sizeBytes,
      evidence.artifacts?.supplyChain?.archiveSha256,
      evidence.artifacts?.codeql?.id,
      evidence.artifacts?.codeql?.archiveSha256,
      evidence.artifacts?.dast?.id,
      evidence.artifacts?.dast?.archiveSha256,
    ],
    [
      9718454652,
      52390,
      "c10860d2fd8724b38b762c11a1865e8588db44890c4d1b959405aef176ccf9d5",
      9718440688,
      "650d3747ba3570208435b207bd32377e1dbc0280e39b1e7935bf1492f782daef",
      9718443849,
      "6d97ede2e046ef2439ff78dec328caae45164c59a54b918956749d13f3cb56c2",
    ],
    "retained artifact evidence",
  );
  if (
    evidence.security?.repository?.version !== "0.74.0" ||
    evidence.security.repository.summarySha256 !==
      "8ac286957ef47af7f2d0e18c91217302dc2611362bce630ae2e090021516da09" ||
    ["vulnerabilities", "misconfigurations", "secrets", "licenceFindings"].some(
      (key) => evidence.security.repository[key] !== 0,
    ) ||
    evidence.security?.codeql?.version !== "2.26.4" ||
    evidence.security.codeql.findings !== 0 ||
    evidence.security?.dast?.version !== "2.17.0" ||
    evidence.security.dast.informationalAlerts !== 2 ||
    ["lowAlerts", "mediumAlerts", "highAlerts", "criticalAlerts"].some(
      (key) => evidence.security.dast[key] !== 0,
    )
  )
    fail("security summary differs");
  const images = [
    [
      evidence.security?.images?.dashboard,
      "9491618cab4e16f8a2dc2a447a04a06abe67e63fb61b2fb23282142a3b3119e0",
      "9779e6b68d32711d6985d4ecd1e4a23d653e8985e121b0af7436a0eeb27b1e4f",
      "e5114452d1f7c4893c84cef1e339da898844cafeb13fb49258c1b88b8f8db98b",
      228,
    ],
    [
      evidence.security?.images?.worker,
      "56a678b6098247a94812a006e8f726f0576510513a0cd9d04d42b2cc0c0bee0f",
      "4d808feb96a25fb6a9cfd70a552fc637ebdfe8deca4592e320c35b16730f4953",
      "7cf1c7716016a05ee941d41bcfc18b27ae2d5e22cb3d0dad4d1ff0d5bd376fcb",
      108,
    ],
  ];
  for (const [image, id, trivy, sbom, components] of images) {
    if (
      image?.imageId !== id ||
      image.trivySha256 !== trivy ||
      image.sbomSha256 !== sbom ||
      image.components !== components ||
      image.vulnerabilities !== 0 ||
      image.misconfigurations !== 0 ||
      image.secrets !== 0
    )
      fail("image evidence differs");
  }
  sameArray(
    [
      evidence.verification?.tests,
      evidence.verification?.migrations,
      evidence.verification?.pgTapFiles,
      evidence.verification?.pgTapAssertions,
      evidence.verification?.concurrencyProbes,
      evidence.verification?.woocommerceRuntimeJobs,
      evidence.verification?.supabaseReviewCorruptions,
      evidence.verification?.npmAuditVulnerabilities,
      evidence.verification?.secretScanFiles,
    ],
    [995, 87, 69, 3790, 22, 4, 31, 0, 1190],
    "verification evidence",
  );
  sameArray(
    [
      evidence.supabaseBoundary?.cliVersion,
      evidence.supabaseBoundary?.supabaseJsVersion,
      evidence.supabaseBoundary?.ssrVersion,
      evidence.supabaseBoundary?.privateSchemaExcluded,
      evidence.supabaseBoundary?.autoExposeNewTables,
      evidence.supabaseBoundary?.authorization,
    ],
    [
      "2.116.0",
      "2.112.4",
      "0.12.5",
      "loyalty_private",
      false,
      "explicit-grants-plus-rls",
    ],
    "Supabase boundary evidence",
  );
  sameArray(
    evidence.supabaseBoundary.dataApiSchemas,
    ["public", "graphql_public", "loyalty"],
    "evidence Data API schemas",
  );
  sameKeys(
    evidence.production,
    [
      "access",
      "mutation",
      "imagesPublished",
      "mergeApproved",
      "releaseApproved",
      "deploymentApproved",
      "productionStackUpgradeApproved",
      "productionReconciled",
      "remainingGate",
    ],
    "production evidence",
  );
  if (
    Object.entries(evidence.production)
      .filter(([key]) => key !== "remainingGate")
      .some(([, value]) => value !== false) ||
    !evidence.production.remainingGate.includes("separately rehearsed")
  )
    fail("production evidence overclaims authority");
}

function validateReview(bundle) {
  const {
    review,
    evidence,
    evidenceRaw,
    attributes,
    prettierIgnore,
    rootPackage,
    dashboardPackage,
    lock,
    config,
    tasks,
    adr,
  } = bundle;
  validateCiEvidence(evidence, evidenceRaw);
  if (
    review?.schema !== locked.schema ||
    review.reviewedAt !== "2026-08-29" ||
    review.owner !== "engineering"
  )
    fail("review identity differs");
  if (
    review.officialSources?.changelog !== locked.changelog ||
    review.officialSources?.dataApiSecurity !== locked.dataApiSecurity
  )
    fail("official source differs");
  for (const [id, expected] of Object.entries(locked.releases)) {
    const actual = review.officialSources?.releases?.[id];
    sameArray(
      [actual?.url, actual?.version, actual?.publishedAt],
      expected,
      `${id} release`,
    );
  }
  for (const [id, expected] of Object.entries(locked.previous)) {
    const actual = review.packages?.previous?.[id];
    sameArray(
      [actual?.version, actual?.integrity],
      expected,
      `${id} previous package`,
    );
  }
  for (const [id, expected] of Object.entries(locked.candidates)) {
    const actual = review.packages?.candidate?.[id];
    sameArray(
      [actual?.version, actual?.tarball, actual?.integrity, actual?.shasum],
      expected,
      `${id} candidate package`,
    );
  }
  sameArray(
    [
      review.packages?.candidate?.jose?.version,
      review.packages?.candidate?.jose?.integrity,
    ],
    [locked.jose[0], locked.jose[2]],
    "jose candidate package",
  );
  const reviewedLocks = review.packages?.candidate?.lockPackages;
  if (
    !Array.isArray(reviewedLocks) ||
    reviewedLocks.length !== locked.lockPackages.length
  )
    fail("reviewed lock package count differs");
  for (const [index, expected] of locked.lockPackages.entries()) {
    const actual = reviewedLocks[index];
    sameArray(
      [actual?.id, actual?.version, actual?.integrity],
      expected,
      `reviewed lock package ${index}`,
    );
  }

  if (
    rootPackage.devDependencies?.supabase !== "2.116.0" ||
    rootPackage.engines?.node !== ">=24.0.0"
  )
    fail("root runtime pins differ");
  if (
    dashboardPackage.dependencies?.["@supabase/supabase-js"] !== "2.112.4" ||
    dashboardPackage.dependencies?.["@supabase/ssr"] !== "0.12.5"
  )
    fail("dashboard Supabase pins differ");
  if (
    lock.packages?.[""]?.devDependencies?.supabase !== "2.116.0" ||
    lock.packages?.["apps/dashboard"]?.dependencies?.[
      "@supabase/supabase-js"
    ] !== "2.112.4" ||
    lock.packages?.["apps/dashboard"]?.dependencies?.["@supabase/ssr"] !==
      "0.12.5"
  )
    fail("workspace lock roots differ");
  for (const [id, version, integrity] of locked.lockPackages) {
    const actual = lock.packages?.[`node_modules/${id}`];
    if (
      actual?.version !== version ||
      actual?.integrity !== integrity ||
      actual?.resolved !==
        `https://registry.npmjs.org/${id}/-/${id.split("/").at(-1)}-${version}.tgz`
    )
      fail(`lock package ${id} differs`);
  }
  const cli = lock.packages?.["node_modules/supabase"];
  if (
    cli?.version !== "2.116.0" ||
    cli.resolved !== locked.candidates.cli[1] ||
    cli.integrity !== locked.candidates.cli[2] ||
    cli.dependencies?.jose !== "^6.2.9"
  )
    fail("CLI lock entry differs");
  const optionalIds = locked.lockPackages
    .filter(([id]) => id.startsWith("@supabase/cli-"))
    .map(([id]) => id);
  if (
    Object.keys(cli.optionalDependencies ?? {})
      .sort()
      .join("\n") !== [...optionalIds].sort().join("\n") ||
    optionalIds.some((id) => cli.optionalDependencies[id] !== "2.116.0")
  )
    fail("CLI optional platform set differs");
  const supabaseJs = lock.packages?.["node_modules/@supabase/supabase-js"];
  if (
    supabaseJs?.version !== "2.112.4" ||
    supabaseJs.resolved !== locked.candidates.supabaseJs[1] ||
    supabaseJs.integrity !== locked.candidates.supabaseJs[2] ||
    supabaseJs.engines?.node !== ">=22.0.0"
  )
    fail("supabase-js lock entry differs");
  const jsIds = locked.lockPackages
    .filter(([id]) => id.endsWith("-js") && id !== "@supabase/supabase-js")
    .map(([id]) => id);
  if (jsIds.some((id) => supabaseJs.dependencies?.[id] !== "2.112.4"))
    fail("supabase-js subpackage set differs");
  const ssr = lock.packages?.["node_modules/@supabase/ssr"];
  if (
    ssr?.version !== "0.12.5" ||
    ssr.resolved !== locked.candidates.ssr[1] ||
    ssr.integrity !== locked.candidates.ssr[2] ||
    ssr.peerDependencies?.["@supabase/supabase-js"] !== "^2.112.4"
  )
    fail("SSR lock entry differs");
  const jose = lock.packages?.["node_modules/jose"];
  if (
    jose?.version !== locked.jose[0] ||
    jose.resolved !== locked.jose[1] ||
    jose.integrity !== locked.jose[2]
  )
    fail("jose lock entry differs");

  sameArray(
    review.configuration?.dataApiSchemas,
    ["public", "graphql_public", "loyalty"],
    "reviewed Data API schemas",
  );
  if (
    review.configuration?.privateSchemaExcluded !== "loyalty_private" ||
    review.configuration?.autoExposeNewTables !== false ||
    review.configuration?.authorization !== "explicit-grants-plus-rls"
  )
    fail("reviewed Data API boundary differs");
  const apiBlock = config.match(/\[api\]([\s\S]*?)(?=\n\[|$)/u)?.[1] ?? "";
  const autoExposeAssignments =
    apiBlock.match(/^\s*auto_expose_new_tables\s*=\s*(?:true|false)\s*$/gmu) ??
    [];
  if (
    autoExposeAssignments.length !== 1 ||
    !/^\s*auto_expose_new_tables\s*=\s*false\s*$/u.test(
      autoExposeAssignments[0],
    ) ||
    /schemas\s*=\s*\[[^\]]*"loyalty_private"[^\]]*\]/u.test(apiBlock)
  )
    fail("repository Data API boundary differs");
  const schemaMatch = apiBlock.match(/schemas\s*=\s*\[([^\]]*)\]/u)?.[1] ?? "";
  const schemas = [...schemaMatch.matchAll(/"([^"]+)"/gu)].map(
    (match) => match[1],
  );
  sameArray(
    schemas,
    ["public", "graphql_public", "loyalty"],
    "repository Data API schemas",
  );

  if (
    review.compatibility?.repositoryNode !== ">=24.0.0" ||
    review.compatibility?.packageMinimumNode !== ">=22.0.0" ||
    [
      "contractChange",
      "migrationChange",
      "ledgerChange",
      "productionStackChange",
    ].some((key) => review.compatibility?.[key] !== false)
  )
    fail("compatibility boundary differs");
  if (
    review.decision?.disposition !==
      "exact-patch-refresh-with-explicit-api-grant-boundary" ||
    review.decision?.breakingChangeIdentified !== false ||
    !review.decision?.rollback?.includes("never restore implicit grants")
  )
    fail("decision or rollback differs");
  if (
    review.ciEvidence?.path !== paths.evidence ||
    review.ciEvidence?.sizeBytes !== locked.evidenceSize ||
    review.ciEvidence?.sha256 !== locked.evidenceSha256 ||
    review.ciEvidence?.implementationCommit !== locked.implementationCommit ||
    review.ciEvidence?.analysisMergeCommit !== locked.analysisMergeCommit ||
    review.ciEvidence?.ciRunId !== 33265165945 ||
    review.ciEvidence?.securityRunId !== 33265166008 ||
    review.ciEvidence?.externalCodeqlCheckRunId !== 99134053293 ||
    review.ciEvidence?.conclusion !== "passed"
  )
    fail("CI evidence governance binding differs");
  if (
    Object.keys(review.authority ?? {})
      .sort()
      .join("\n") !== locked.authorityKeys.join("\n") ||
    Object.values(review.authority).some((value) => value !== false)
  )
    fail("authority must remain entirely false");

  if (
    rootPackage.scripts?.[
      "continuous-improvement:supabase-runtime:validate"
    ] !== "node scripts/validate-supabase-runtime-review.mjs --self-test" ||
    !rootPackage.scripts?.check?.includes(
      "npm run continuous-improvement:supabase-runtime:validate",
    )
  )
    fail("repository validation command is not gated");
  const task = tasks.tasks?.find(
    (item) => item.id === "M16-CONTINUOUS-IMPROVEMENT",
  );
  if (
    !task ||
    !task.evidence?.includes(paths.review) ||
    !task.evidence?.includes(paths.evidence) ||
    !task.evidence?.includes("scripts/validate-supabase-runtime-review.mjs") ||
    !task.docs?.includes(paths.adr)
  )
    fail("task graph evidence is incomplete");
  if (
    !attributes
      .split(/\r?\n/u)
      .includes("docs/plan/evidence/M16/runs/supabase-runtime-*.json -text") ||
    !prettierIgnore
      .split(/\r?\n/u)
      .includes("docs/plan/evidence/M16/runs/supabase-runtime-*.json")
  )
    fail("CI evidence byte-preservation rules differ");
  for (const phrase of [
    "Keep the existing package set",
    "Upgrade without an explicit API grant boundary",
    "exact patch refresh",
    "Rollback",
    "auto_expose_new_tables = false",
  ]) {
    if (!adr.includes(phrase)) fail(`ADR is missing ${phrase}`);
  }
}

function loadBundle() {
  const read = (path) => readFileSync(join(root, path), "utf8");
  return {
    review: YAML.parse(read(paths.review)),
    evidence: JSON.parse(read(paths.evidence)),
    evidenceRaw: read(paths.evidence),
    attributes: read(paths.attributes),
    prettierIgnore: read(paths.prettierIgnore),
    rootPackage: JSON.parse(read(paths.rootPackage)),
    dashboardPackage: JSON.parse(read(paths.dashboardPackage)),
    lock: JSON.parse(read(paths.lock)),
    config: read(paths.config),
    tasks: YAML.parse(read(paths.tasks)),
    adr: read(paths.adr),
  };
}

function selfTest(bundle) {
  validateReview(bundle);
  const cases = [
    (x) => {
      x.review.schema = "wrong";
    },
    (x) => {
      x.review.officialSources.dataApiSecurity = "https://example.invalid";
    },
    (x) => {
      x.review.officialSources.releases.cli.version = "2.116.1";
    },
    (x) => {
      x.review.packages.candidate.supabaseJs.integrity = "sha512-wrong";
    },
    (x) => {
      x.review.packages.candidate.lockPackages.pop();
    },
    (x) => {
      x.review.configuration.autoExposeNewTables = true;
    },
    (x) => {
      x.review.authority.productionMutation = true;
    },
    (x) => {
      delete x.review.authority.productionMutation;
      x.review.authority.noOp = false;
    },
    (x) => {
      x.review.compatibility.productionStackChange = true;
    },
    (x) => {
      x.rootPackage.devDependencies.supabase = "2.113.0";
    },
    (x) => {
      x.rootPackage.engines.node = ">=22.0.0";
    },
    (x) => {
      x.lock.packages[""].devDependencies.supabase = "2.113.0";
    },
    (x) => {
      x.lock.packages["apps/dashboard"].dependencies["@supabase/supabase-js"] =
        "2.112.3";
    },
    (x) => {
      x.dashboardPackage.dependencies["@supabase/supabase-js"] = "2.112.3";
    },
    (x) => {
      x.dashboardPackage.dependencies["@supabase/ssr"] = "0.12.4";
    },
    (x) => {
      x.lock.packages["node_modules/@supabase/cli-linux-x64"].version =
        "2.113.0";
    },
    (x) => {
      x.lock.packages["node_modules/@supabase/cli-windows-x64"].integrity =
        "sha512-wrong";
    },
    (x) => {
      x.lock.packages["node_modules/supabase"].resolved =
        "https://example.invalid/supabase.tgz";
    },
    (x) => {
      x.lock.packages["node_modules/@supabase/auth-js"].version = "2.112.3";
    },
    (x) => {
      x.lock.packages["node_modules/@supabase/supabase-js"].resolved =
        "https://example.invalid/supabase-js.tgz";
    },
    (x) => {
      x.lock.packages["node_modules/@supabase/ssr"].peerDependencies[
        "@supabase/supabase-js"
      ] = "^2.111.0";
    },
    (x) => {
      x.review.packages.candidate.jose.integrity = "sha512-wrong";
    },
    (x) => {
      x.lock.packages["node_modules/jose"].version = "6.2.8";
    },
    (x) => {
      x.config = x.config.replace("auto_expose_new_tables = false", "");
    },
    (x) => {
      x.config = x.config.replace(
        "auto_expose_new_tables = false",
        "auto_expose_new_tables = true",
      );
    },
    (x) => {
      x.config = x.config.replace(
        "auto_expose_new_tables = false",
        "auto_expose_new_tables = false\nauto_expose_new_tables = true",
      );
    },
    (x) => {
      x.config = x.config.replace(
        '"loyalty"]',
        '"loyalty", "loyalty_private"]',
      );
    },
    (x) => {
      delete x.rootPackage.scripts[
        "continuous-improvement:supabase-runtime:validate"
      ];
    },
    (x) => {
      x.rootPackage.scripts.check = x.rootPackage.scripts.check.replace(
        "npm run continuous-improvement:supabase-runtime:validate",
        "",
      );
    },
    (x) => {
      x.tasks.tasks.find(
        (item) => item.id === "M16-CONTINUOUS-IMPROVEMENT",
      ).evidence = [];
    },
    (x) => {
      x.adr = x.adr.replaceAll(
        "auto_expose_new_tables = false",
        "automatic grants",
      );
    },
    (x) => {
      x.evidenceRaw += " ";
    },
    (x) => {
      x.evidence.candidate.implementationCommit = "0".repeat(40);
    },
    (x) => {
      x.evidence.github.ci.runId = 1;
    },
    (x) => {
      x.evidence.github.ci.jobs[0].conclusion = "failure";
    },
    (x) => {
      x.evidence.github.security.jobs[1].id = 1;
    },
    (x) => {
      x.evidence.github.externalCodeql.results = 1;
    },
    (x) => {
      x.evidence.artifacts.supplyChain.archiveSha256 = "0".repeat(64);
    },
    (x) => {
      x.evidence.security.repository.vulnerabilities = 1;
    },
    (x) => {
      x.evidence.security.images.dashboard.components = 227;
    },
    (x) => {
      x.evidence.verification.pgTapAssertions = 3789;
    },
    (x) => {
      x.evidence.supabaseBoundary.autoExposeNewTables = true;
    },
    (x) => {
      x.evidence.production.mergeApproved = true;
    },
    (x) => {
      x.review.ciEvidence.sha256 = "0".repeat(64);
    },
    (x) => {
      x.attributes = x.attributes.replace(
        "docs/plan/evidence/M16/runs/supabase-runtime-*.json -text",
        "",
      );
    },
    (x) => {
      x.prettierIgnore = x.prettierIgnore.replace(
        "docs/plan/evidence/M16/runs/supabase-runtime-*.json",
        "",
      );
    },
    (x) => {
      x.tasks.tasks
        .find((item) => item.id === "M16-CONTINUOUS-IMPROVEMENT")
        .evidence.splice(
          x.tasks.tasks
            .find((item) => item.id === "M16-CONTINUOUS-IMPROVEMENT")
            .evidence.indexOf(paths.evidence),
          1,
        );
    },
  ];
  for (const [index, mutate] of cases.entries()) {
    const candidate = structuredClone(bundle);
    mutate(candidate);
    let rejected = false;
    try {
      validateReview(candidate);
    } catch {
      rejected = true;
    }
    if (!rejected) fail(`self-test corruption ${index + 1} was accepted`);
  }
  console.log(
    `Validated Supabase runtime review and rejected ${cases.length} corruptions.`,
  );
}

const bundle = loadBundle();
if (process.argv.includes("--self-test")) selfTest(bundle);
else {
  validateReview(bundle);
  console.log("Validated Supabase runtime review.");
}
