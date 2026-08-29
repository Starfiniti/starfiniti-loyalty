import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const paths = Object.freeze({
  review: "infrastructure/governance/woocommerce-runtime-review.yaml",
  current: ".wp-env.woocommerce.json",
  minimum: ".wp-env.woocommerce-min.json",
  workflow: ".github/workflows/ci.yml",
  pluginMain: "plugins/woocommerce/starfiniti-loyalty.php",
  pluginReadme: "plugins/woocommerce/readme.txt",
  matrix: "docs/testing/PLATFORM_MATRIX.md",
  tasks: "docs/plan/TASKS.yaml",
  attributes: ".gitattributes",
  prettierIgnore: ".prettierignore",
});
const digestPattern = /^[0-9a-f]{64}$/u;

const locked = Object.freeze({
  sourcePath:
    "docs/plan/evidence/M16/runs/provider-source-snapshot-257e99c-2026-08-28T212100Z.json",
  sourceFileSha256:
    "5786186426b065493f5c01b5d76742322e2e8ed3fe92b8f80c30d787caa516be",
  sourceContentSha256:
    "0aaa1bfb692bc298d38b0d11edc7fed2a9b67348a37866b11d28e08393052caa",
  previous: Object.freeze({
    wordpress: Object.freeze({
      version: "7.0.2",
      url: "https://wordpress.org/wordpress-7.0.2.zip",
      bytes: 31_435_175,
      sha256:
        "a616580ed2152ae71d81439884b4bcda329c5322f9bd2092ac7a3a68dbcea7a7",
    }),
    woocommerce: Object.freeze({
      version: "10.9.4",
      url: "https://downloads.wordpress.org/plugin/woocommerce.10.9.4.zip",
      bytes: 20_545_768,
      sha256:
        "6e58fc3ba9b18d1c9aee6b0227d3c3c09e4fe2c1332823bd2e0ac54ffcff64a9",
    }),
    phpMinor: "8.3",
  }),
  candidate: Object.freeze({
    wordpress: Object.freeze({
      version: "7.1",
      releasedAt: "2026-08-19",
      url: "https://wordpress.org/wordpress-7.1.zip",
      bytes: 37_216_004,
      sha256:
        "d1ae02b5ae18428031ffc3943659fa87ab361d827f4aa804adf9276e4dc75df6",
    }),
    woocommerce: Object.freeze({
      version: "11.0.1",
      releasedAt: "2026-08-10",
      url: "https://downloads.wordpress.org/plugin/woocommerce.11.0.1.zip",
      bytes: 20_218_895,
      sha256:
        "da189b6616c610d15a2106f93151dab81b78f83e075bcefce221ac0d00b4fa21",
    }),
    phpMinor: "8.4",
  }),
  minimum: Object.freeze({
    wordpress: "https://wordpress.org/wordpress-6.6.5.zip",
    woocommerce: "https://downloads.wordpress.org/plugin/woocommerce.9.0.2.zip",
    phpMinor: "8.1",
  }),
  evidence: Object.freeze({
    path: "docs/plan/evidence/M16/runs/woocommerce-runtime-c3b2954-2026-08-29T163051Z.json",
    bytes: 4_291,
    fileSha256:
      "950091da92c90a5834a1020bed83d275e1d3b0891ff6ca565ac79d2a0682188e",
    observedAt: "2026-08-29T16:30:51Z",
    implementationCommit: "c3b29542035772ddcbc48d92e2b159ac605dd80f",
    runtimeReviewCommit: "a71a84b6d35438043ce3a0f7db86cf2231c9b3c5",
    runId: 33_261_152_926,
    createdAt: "2026-08-29T15:46:20Z",
    completedAt: "2026-08-29T15:49:18Z",
  }),
});

function fail(message) {
  throw new Error(`WooCommerce runtime review invalid: ${message}`);
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

function exactDigest(value, expected, label) {
  if (!digestPattern.test(value ?? "") || value !== expected) {
    fail(`${label} differs`);
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function exactUtc(value, expected, label) {
  if (
    value !== expected ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    fail(`${label} differs`);
  }
}

function validateCiEvidence(evidence, evidenceBytes, review) {
  if (
    evidenceBytes.length !== locked.evidence.bytes ||
    sha256(evidenceBytes) !== locked.evidence.fileSha256 ||
    evidenceBytes.includes(13)
  ) {
    fail("CI evidence bytes differ");
  }
  exactKeys(
    evidence,
    [
      "schema",
      "observedAt",
      "repository",
      "implementation",
      "review",
      "ci",
      "result",
      "authority",
    ],
    "CI evidence",
  );
  if (
    evidence.schema !== "starfiniti.woocommerce-runtime-ci-evidence.v1" ||
    evidence.repository !== "Starfiniti/starfiniti-loyalty"
  ) {
    fail("CI evidence identity differs");
  }
  exactUtc(
    evidence.observedAt,
    locked.evidence.observedAt,
    "CI evidence observation",
  );
  if (
    Date.parse(evidence.observedAt) < Date.parse(locked.evidence.completedAt)
  ) {
    fail("CI evidence predates the completed run");
  }

  exactKeys(
    evidence.implementation,
    ["commit", "runtimeReviewCommit", "runtimeReviewIsAncestor"],
    "CI implementation",
  );
  if (
    evidence.implementation.commit !== locked.evidence.implementationCommit ||
    evidence.implementation.runtimeReviewCommit !==
      locked.evidence.runtimeReviewCommit ||
    evidence.implementation.runtimeReviewIsAncestor !== true
  ) {
    fail("CI implementation binding differs");
  }

  exactKeys(
    evidence.review,
    ["schema", "path", "current", "minimum"],
    "CI reviewed runtime",
  );
  if (
    evidence.review.schema !== review.schema ||
    evidence.review.path !== paths.review
  ) {
    fail("CI review binding differs");
  }
  exactKeys(
    evidence.review.current,
    ["wordpress", "woocommerce", "php"],
    "CI current runtime",
  );
  for (const [name, expected] of [
    ["wordpress", locked.candidate.wordpress],
    ["woocommerce", locked.candidate.woocommerce],
  ]) {
    exactKeys(
      evidence.review.current[name],
      ["version", "bytes", "sha256"],
      `CI current ${name}`,
    );
    if (
      evidence.review.current[name].version !== expected.version ||
      evidence.review.current[name].bytes !== expected.bytes
    ) {
      fail(`CI current ${name} identity differs`);
    }
    exactDigest(
      evidence.review.current[name].sha256,
      expected.sha256,
      `CI current ${name} digest`,
    );
  }
  if (evidence.review.current.php !== locked.candidate.phpMinor) {
    fail("CI current PHP differs");
  }
  exactKeys(
    evidence.review.minimum,
    ["wordpress", "woocommerce", "php"],
    "CI minimum runtime",
  );
  if (
    evidence.review.minimum.wordpress !== "6.6.5" ||
    evidence.review.minimum.woocommerce !== "9.0.2" ||
    evidence.review.minimum.php !== locked.minimum.phpMinor
  ) {
    fail("CI minimum runtime differs");
  }

  exactKeys(
    evidence.ci,
    [
      "workflow",
      "runId",
      "runAttempt",
      "event",
      "headSha",
      "createdAt",
      "completedAt",
      "conclusion",
      "jobs",
    ],
    "CI run",
  );
  if (
    evidence.ci.workflow !== paths.workflow ||
    evidence.ci.runId !== locked.evidence.runId ||
    evidence.ci.runAttempt !== 1 ||
    evidence.ci.event !== "pull_request" ||
    evidence.ci.headSha !== locked.evidence.implementationCommit ||
    evidence.ci.conclusion !== "success"
  ) {
    fail("CI run identity differs");
  }
  exactUtc(evidence.ci.createdAt, locked.evidence.createdAt, "CI run creation");
  exactUtc(
    evidence.ci.completedAt,
    locked.evidence.completedAt,
    "CI run completion",
  );

  const expectedJobs = [
    {
      name: "woocommerce-runtime (minimum-hpos)",
      jobId: 99_123_210_797,
      startedAt: "2026-08-29T15:46:22Z",
      completedAt: "2026-08-29T15:48:50Z",
      wordpress: "6.6.5",
      woocommerce: "9.0.2",
      php: "8.1",
      storage: "hpos",
      reviewedArtifacts: "skipped",
    },
    {
      name: "woocommerce-runtime (minimum-legacy)",
      jobId: 99_123_210_819,
      startedAt: "2026-08-29T15:46:23Z",
      completedAt: "2026-08-29T15:48:51Z",
      wordpress: "6.6.5",
      woocommerce: "9.0.2",
      php: "8.1",
      storage: "legacy",
      reviewedArtifacts: "skipped",
    },
    {
      name: "woocommerce-runtime (current-hpos)",
      jobId: 99_123_210_753,
      startedAt: "2026-08-29T15:46:24Z",
      completedAt: "2026-08-29T15:48:44Z",
      wordpress: "7.1",
      woocommerce: "11.0.1",
      php: "8.4",
      storage: "hpos",
      reviewedArtifacts: "success",
    },
    {
      name: "woocommerce-runtime (current-legacy)",
      jobId: 99_123_210_743,
      startedAt: "2026-08-29T15:46:22Z",
      completedAt: "2026-08-29T15:48:26Z",
      wordpress: "7.1",
      woocommerce: "11.0.1",
      php: "8.4",
      storage: "legacy",
      reviewedArtifacts: "success",
    },
  ];
  if (!Array.isArray(evidence.ci.jobs) || evidence.ci.jobs.length !== 4) {
    fail("CI job matrix differs");
  }
  for (const [index, expected] of expectedJobs.entries()) {
    const job = evidence.ci.jobs[index];
    exactKeys(
      job,
      [
        "name",
        "jobId",
        "startedAt",
        "completedAt",
        "conclusion",
        "runtime",
        "steps",
      ],
      `CI job ${index + 1}`,
    );
    if (
      job.name !== expected.name ||
      job.jobId !== expected.jobId ||
      job.conclusion !== "success"
    ) {
      fail(`CI job ${index + 1} identity differs`);
    }
    exactUtc(job.startedAt, expected.startedAt, `${job.name} start`);
    exactUtc(job.completedAt, expected.completedAt, `${job.name} completion`);
    exactKeys(
      job.runtime,
      ["wordpress", "woocommerce", "php", "storage"],
      `${job.name} runtime`,
    );
    for (const key of ["wordpress", "woocommerce", "php", "storage"]) {
      if (job.runtime[key] !== expected[key]) {
        fail(`${job.name} ${key} differs`);
      }
    }
    exactKeys(
      job.steps,
      [
        "reviewedArtifacts",
        "runtimeStart",
        "activationAndStorage",
        "nativeCouponOrderAndReconciliation",
        "cleanup",
      ],
      `${job.name} steps`,
    );
    if (
      job.steps.reviewedArtifacts !== expected.reviewedArtifacts ||
      job.steps.runtimeStart !== "success" ||
      job.steps.activationAndStorage !== "success" ||
      job.steps.nativeCouponOrderAndReconciliation !== "success" ||
      job.steps.cleanup !== "success"
    ) {
      fail(`${job.name} step result differs`);
    }
  }

  exactKeys(
    evidence.result,
    [
      "matrixCells",
      "passedCells",
      "failedCells",
      "currentArtifactsVerified",
      "minimumMatrixPreserved",
      "nativeCouponOrderAndReconciliationPassed",
      "runtimeCleanupPassed",
    ],
    "CI result",
  );
  if (
    evidence.result.matrixCells !== 4 ||
    evidence.result.passedCells !== 4 ||
    evidence.result.failedCells !== 0 ||
    evidence.result.currentArtifactsVerified !== true ||
    evidence.result.minimumMatrixPreserved !== true ||
    evidence.result.nativeCouponOrderAndReconciliationPassed !== true ||
    evidence.result.runtimeCleanupPassed !== true
  ) {
    fail("CI result differs");
  }

  exactKeys(
    evidence.authority,
    [
      "productionAccessed",
      "productionMutated",
      "storeUpgradeApproved",
      "connectorReleased",
      "pilotStoreRehearsed",
      "deployed",
      "observed",
      "reconciled",
    ],
    "CI authority",
  );
  if (Object.values(evidence.authority).some((value) => value !== false)) {
    fail("CI evidence claims production authority");
  }
}

function validateRelease(value, expected, label, candidate = false) {
  exactKeys(
    value,
    candidate
      ? ["version", "releasedAt", "url", "bytes", "sha256"]
      : ["version", "url", "bytes", "sha256"],
    label,
  );
  if (
    value.version !== expected.version ||
    value.url !== expected.url ||
    value.bytes !== expected.bytes
  ) {
    fail(`${label} identity differs`);
  }
  if (candidate && value.releasedAt !== expected.releasedAt) {
    fail(`${label} release date differs`);
  }
  if (/latest|trunk/iu.test(value.url)) {
    fail(`${label} uses a mutable artifact URL`);
  }
  exactDigest(value.sha256, expected.sha256, `${label} artifact digest`);
}

function validateConfig(config, expected, label) {
  exactKeys(
    config,
    [
      "$schema",
      "core",
      "phpVersion",
      "plugins",
      "mappings",
      "testsEnvironment",
      "config",
    ],
    label,
  );
  if (
    config.$schema !== "https://schemas.wp.org/trunk/wp-env.json" ||
    config.core !== expected.wordpress ||
    config.phpVersion !== expected.phpMinor ||
    config.testsEnvironment !== false
  ) {
    fail(`${label} runtime differs`);
  }
  exactArray(config.plugins, [expected.woocommerce], `${label} plugins`);
  exactKeys(
    config.mappings,
    ["wp-content/plugins/starfiniti-loyalty"],
    `${label} mappings`,
  );
  if (
    config.mappings["wp-content/plugins/starfiniti-loyalty"] !==
    "./plugins/woocommerce"
  ) {
    fail(`${label} plugin mapping differs`);
  }
  exactKeys(
    config.config,
    ["WP_DEBUG", "WP_DEBUG_LOG", "WP_DEBUG_DISPLAY"],
    `${label} WordPress config`,
  );
  if (
    config.config.WP_DEBUG !== true ||
    config.config.WP_DEBUG_LOG !== true ||
    config.config.WP_DEBUG_DISPLAY !== false
  ) {
    fail(`${label} WordPress diagnostics differ`);
  }
}

function exactHeader(contents, name, expected, label) {
  const matches = [
    ...contents.matchAll(
      new RegExp(`^\\s*(?:\\*\\s*)?${name}:\\s*(.+?)\\s*$`, "gmu"),
    ),
  ];
  if (matches.length !== 1 || matches[0][1] !== expected) {
    fail(`${label} ${name} header differs`);
  }
}

function validateWorkflow(contents) {
  const workflow = YAML.parse(contents);
  const runtimes =
    workflow?.jobs?.["woocommerce-runtime"]?.strategy?.matrix?.runtime;
  if (!Array.isArray(runtimes)) {
    fail("WooCommerce runtime workflow matrix is absent");
  }
  exactArray(
    runtimes.map((runtime) => {
      exactKeys(
        runtime,
        [
          "name",
          "config",
          "hpos",
          "wordpress",
          "woocommerce",
          "php",
          "artifactReview",
          "artifact",
        ],
        `${runtime.name ?? "unknown"} workflow cell`,
      );
      return `${runtime.name}:${runtime.config}:${runtime.hpos}:${runtime.wordpress}:${runtime.woocommerce}:${runtime.php}:${runtime.artifactReview}`;
    }),
    [
      "minimum-hpos:.wp-env.woocommerce-min.json:yes:6.6.5:9.0.2:8.1:false",
      "minimum-legacy:.wp-env.woocommerce-min.json:no:6.6.5:9.0.2:8.1:false",
      "current-hpos:.wp-env.woocommerce.json:yes:7.1:11.0.1:8.4:true",
      "current-legacy:.wp-env.woocommerce.json:no:7.1:11.0.1:8.4:true",
    ],
    "workflow runtime cells",
  );
  for (const runtime of runtimes) {
    if (runtime.artifactReview === false) {
      if (runtime.artifact !== null) {
        fail(`${runtime.name} must not claim an artifact review`);
      }
      continue;
    }
    exactKeys(
      runtime.artifact,
      ["wordpress", "woocommerce"],
      `${runtime.name} reviewed artifacts`,
    );
    for (const [name, expected] of [
      ["wordpress", locked.candidate.wordpress],
      ["woocommerce", locked.candidate.woocommerce],
    ]) {
      exactKeys(
        runtime.artifact[name],
        ["url", "bytes", "sha256"],
        `${runtime.name} ${name} artifact`,
      );
      if (
        runtime.artifact[name].url !== expected.url ||
        runtime.artifact[name].bytes !== expected.bytes
      ) {
        fail(`${runtime.name} ${name} artifact identity differs`);
      }
      exactDigest(
        runtime.artifact[name].sha256,
        expected.sha256,
        `${runtime.name} ${name} artifact digest`,
      );
    }
  }
  if (
    !contents.includes("if: matrix.runtime.artifactReview") ||
    !contents.includes("curl --fail --location --proto '=https' --tlsv1.2") ||
    !contents.includes("sha256sum --check --strict") ||
    !contents.includes(
      'wp-env start --config "${{ matrix.runtime.config }}"',
    ) ||
    !contents.includes(
      'get_bloginfo("version") !== "${{ matrix.runtime.wordpress }}"',
    ) ||
    !contents.includes('WC_VERSION !== "${{ matrix.runtime.woocommerce }}"') ||
    !contents.includes('PHP_MINOR_VERSION !== "${{ matrix.runtime.php }}"') ||
    !contents.includes(
      'wp option update woocommerce_custom_orders_table_enabled "${{ matrix.runtime.hpos }}"',
    ) ||
    !contents.includes(
      "wp eval-file wp-content/plugins/starfiniti-loyalty/tests/runtime-smoke.php",
    ) ||
    !contents.includes(
      'wp-env destroy --force --config "${{ matrix.runtime.config }}"',
    )
  ) {
    fail("workflow runtime execution contract differs");
  }
}

function validate(review, inputs) {
  exactKeys(
    review,
    [
      "schema",
      "reviewedAt",
      "officialSources",
      "sourceSnapshot",
      "previous",
      "candidate",
      "matrix",
      "impact",
      "production",
      "ciEvidence",
    ],
    "review",
  );
  if (
    review.schema !== "starfiniti.woocommerce-runtime-review.v1" ||
    review.reviewedAt !== "2026-08-29"
  ) {
    fail("schema or review date differs");
  }

  exactKeys(
    review.officialSources,
    [
      "wordpressRelease",
      "wordpressArtifactBase",
      "woocommerceChangelog",
      "woocommerceRelease",
      "woocommerceArtifactBase",
      "phpCompatibility",
    ],
    "official sources",
  );
  const officialSources = {
    wordpressRelease: "https://wordpress.org/news/2026/08/mary-lou/",
    wordpressArtifactBase: "https://wordpress.org/",
    woocommerceChangelog: "https://developer.woocommerce.com/changelog/",
    woocommerceRelease:
      "https://developer.woocommerce.com/2026/08/10/woocommerce-11-0-1-release-notes/",
    woocommerceArtifactBase: "https://downloads.wordpress.org/plugin/",
    phpCompatibility: "https://woocommerce.com/document/server-requirements/",
  };
  for (const [name, expected] of Object.entries(officialSources)) {
    if (review.officialSources[name] !== expected) {
      fail(`${name} source differs`);
    }
  }

  exactKeys(
    review.sourceSnapshot,
    [
      "path",
      "fileSha256",
      "providerId",
      "observedAt",
      "bytes",
      "contentSha256",
    ],
    "source snapshot",
  );
  if (
    review.sourceSnapshot.path !== locked.sourcePath ||
    review.sourceSnapshot.providerId !== "woocommerce" ||
    review.sourceSnapshot.observedAt !== "2026-08-28T21:20:37Z" ||
    review.sourceSnapshot.bytes !== 225_526
  ) {
    fail("source snapshot facts differ");
  }
  exactDigest(
    review.sourceSnapshot.fileSha256,
    locked.sourceFileSha256,
    "source snapshot file digest",
  );
  exactDigest(
    review.sourceSnapshot.contentSha256,
    locked.sourceContentSha256,
    "WooCommerce source content digest",
  );
  if (sha256(inputs.sourceBytes) !== locked.sourceFileSha256) {
    fail("source snapshot bytes differ");
  }
  const source = JSON.parse(inputs.sourceBytes.toString("utf8"));
  const wooSource = source.sources?.find((item) => item.id === "woocommerce");
  if (
    source.complete !== true ||
    source.contentRetained !== false ||
    wooSource?.source !== review.officialSources.woocommerceChangelog ||
    wooSource?.finalUrl !== review.officialSources.woocommerceChangelog ||
    wooSource?.status !== 200 ||
    wooSource?.fetchedAt !== review.sourceSnapshot.observedAt ||
    wooSource?.bytes !== review.sourceSnapshot.bytes ||
    wooSource?.sha256 !== review.sourceSnapshot.contentSha256
  ) {
    fail("WooCommerce source projection differs");
  }

  exactKeys(
    review.previous,
    ["wordpress", "woocommerce", "phpMinor"],
    "previous",
  );
  validateRelease(
    review.previous.wordpress,
    locked.previous.wordpress,
    "previous WordPress",
  );
  validateRelease(
    review.previous.woocommerce,
    locked.previous.woocommerce,
    "previous WooCommerce",
  );
  if (review.previous.phpMinor !== locked.previous.phpMinor) {
    fail("previous PHP minor differs");
  }

  exactKeys(
    review.candidate,
    ["wordpress", "woocommerce", "phpMinor"],
    "candidate",
  );
  validateRelease(
    review.candidate.wordpress,
    locked.candidate.wordpress,
    "candidate WordPress",
    true,
  );
  exactKeys(
    review.candidate.woocommerce,
    [
      "version",
      "releasedAt",
      "securityUpdate",
      "databaseUpdate",
      "url",
      "bytes",
      "sha256",
    ],
    "candidate WooCommerce",
  );
  const wooCandidate = { ...review.candidate.woocommerce };
  delete wooCandidate.securityUpdate;
  delete wooCandidate.databaseUpdate;
  validateRelease(
    wooCandidate,
    locked.candidate.woocommerce,
    "candidate WooCommerce",
    true,
  );
  if (
    review.candidate.woocommerce.securityUpdate !== true ||
    review.candidate.woocommerce.databaseUpdate !== false ||
    review.candidate.phpMinor !== locked.candidate.phpMinor
  ) {
    fail("candidate security, database, or PHP classification differs");
  }

  exactKeys(
    review.matrix,
    ["config", "storageModes", "workflow", "pluginMain", "pluginReadme"],
    "matrix",
  );
  if (
    review.matrix.config !== paths.current ||
    review.matrix.workflow !== paths.workflow ||
    review.matrix.pluginMain !== paths.pluginMain ||
    review.matrix.pluginReadme !== paths.pluginReadme
  ) {
    fail("matrix paths differ");
  }
  exactArray(review.matrix.storageModes, ["hpos", "legacy"], "storage modes");

  exactKeys(
    review.impact,
    [
      "classification",
      "securityRelevant",
      "breakingChangeIdentified",
      "affectedModules",
      "owner",
      "disposition",
      "rationale",
    ],
    "impact",
  );
  if (
    review.impact.classification !== "security-and-current-compatibility" ||
    review.impact.securityRelevant !== true ||
    review.impact.breakingChangeIdentified !== false ||
    review.impact.owner !== "engineering" ||
    review.impact.disposition !== "refresh-disposable-current-matrix" ||
    typeof review.impact.rationale !== "string" ||
    review.impact.rationale.length < 120
  ) {
    fail("impact classification differs");
  }
  exactArray(
    review.impact.affectedModules,
    ["M01", "M04", "M09", "M15", "M16"],
    "affected modules",
  );

  exactKeys(
    review.production,
    [
      "access",
      "mutation",
      "storeUpgradeApproved",
      "rollbackWordPressVersion",
      "rollbackWooCommerceVersion",
      "remainingGate",
    ],
    "production boundary",
  );
  if (
    review.production.access !== false ||
    review.production.mutation !== false ||
    review.production.storeUpgradeApproved !== false ||
    review.production.rollbackWordPressVersion !==
      locked.previous.wordpress.version ||
    review.production.rollbackWooCommerceVersion !==
      locked.previous.woocommerce.version ||
    typeof review.production.remainingGate !== "string" ||
    review.production.remainingGate.length < 120
  ) {
    fail("production boundary differs");
  }

  exactKeys(
    review.ciEvidence,
    [
      "path",
      "fileSha256",
      "bytes",
      "implementationCommit",
      "runtimeReviewCommit",
      "runId",
      "completedAt",
      "conclusion",
      "passedJobs",
      "productionMutated",
    ],
    "CI evidence binding",
  );
  if (
    review.ciEvidence.path !== locked.evidence.path ||
    review.ciEvidence.bytes !== locked.evidence.bytes ||
    review.ciEvidence.implementationCommit !==
      locked.evidence.implementationCommit ||
    review.ciEvidence.runtimeReviewCommit !==
      locked.evidence.runtimeReviewCommit ||
    review.ciEvidence.runId !== locked.evidence.runId ||
    review.ciEvidence.conclusion !== "success" ||
    review.ciEvidence.productionMutated !== false
  ) {
    fail("CI evidence binding differs");
  }
  exactDigest(
    review.ciEvidence.fileSha256,
    locked.evidence.fileSha256,
    "CI evidence file digest",
  );
  exactUtc(
    review.ciEvidence.completedAt,
    locked.evidence.completedAt,
    "CI evidence completion",
  );
  exactArray(
    review.ciEvidence.passedJobs,
    [
      "woocommerce-runtime (minimum-hpos)",
      "woocommerce-runtime (minimum-legacy)",
      "woocommerce-runtime (current-hpos)",
      "woocommerce-runtime (current-legacy)",
    ],
    "CI passed jobs",
  );
  validateCiEvidence(inputs.evidence, inputs.evidenceBytes, review);
  if (
    !inputs.attributes
      .split(/\r?\n/u)
      .includes(
        "docs/plan/evidence/M16/runs/woocommerce-runtime-*.json -text",
      ) ||
    !inputs.prettierIgnore
      .split(/\r?\n/u)
      .includes("docs/plan/evidence/M16/runs/woocommerce-runtime-*.json")
  ) {
    fail("CI evidence byte-preservation controls differ");
  }

  validateConfig(
    inputs.current,
    {
      wordpress: locked.candidate.wordpress.url,
      woocommerce: locked.candidate.woocommerce.url,
      phpMinor: locked.candidate.phpMinor,
    },
    "current wp-env",
  );
  validateConfig(inputs.minimum, locked.minimum, "minimum wp-env");
  validateWorkflow(inputs.workflow);

  exactHeader(inputs.pluginMain, "WC requires at least", "9.0", "plugin main");
  exactHeader(inputs.pluginMain, "WC tested up to", "11.0", "plugin main");
  exactHeader(inputs.pluginMain, "Requires PHP", "8.1", "plugin main");
  exactHeader(inputs.pluginReadme, "Requires at least", "6.6", "plugin readme");
  exactHeader(inputs.pluginReadme, "Tested up to", "7.1", "plugin readme");
  exactHeader(inputs.pluginReadme, "Requires PHP", "8.1", "plugin readme");

  const expectedRows = [
    "| 6.6.5     | 9.0.2       | 8.1 | HPOS          |",
    "| 6.6.5     | 9.0.2       | 8.1 | Legacy        |",
    "| 7.1       | 11.0.1      | 8.4 | HPOS          |",
    "| 7.1       | 11.0.1      | 8.4 | Legacy        |",
  ];
  for (const row of expectedRows) {
    if (
      inputs.matrix.split(/\r?\n/u).filter((line) => line === row).length !== 1
    ) {
      fail(`platform matrix row differs: ${row}`);
    }
  }
  const historicalTaskEvidence =
    "WordPress 6.6.5 WooCommerce 9.0.2 PHP 8.1 and WordPress 7.0.2 WooCommerce 10.9.4 PHP 8.3 pass in HPOS and legacy modes";
  const candidateTaskEvidence =
    "ADR-0101 binds official sources exact downloaded WordPress 7.1 and WooCommerce 11.0.1 artifact sizes and SHA-256 values PHP 8.4";
  const exactHeadTaskEvidence =
    "exact implementation c3b29542035772ddcbc48d92e2b159ac605dd80f passed all four WooCommerce runtime cells in CI run 33261152926";
  const taskDocument = YAML.parse(inputs.tasks);
  const task = taskDocument?.tasks?.find(
    (candidate) => candidate.id === "M16-CONTINUOUS-IMPROVEMENT",
  );
  if (
    !inputs.tasks.includes(historicalTaskEvidence) ||
    !inputs.tasks.includes(candidateTaskEvidence) ||
    !inputs.tasks.includes(exactHeadTaskEvidence) ||
    !Array.isArray(task?.evidence) ||
    task.evidence.filter((value) => value === locked.evidence.path).length !== 1
  ) {
    fail("TASKS historical or candidate compatibility evidence differs");
  }
}

const review = YAML.parse(readFileSync(join(root, paths.review), "utf8"));
const evidenceBytes = readFileSync(join(root, locked.evidence.path));
const inputs = {
  sourceBytes: readFileSync(join(root, locked.sourcePath)),
  evidenceBytes,
  evidence: JSON.parse(evidenceBytes.toString("utf8")),
  current: JSON.parse(readFileSync(join(root, paths.current), "utf8")),
  minimum: JSON.parse(readFileSync(join(root, paths.minimum), "utf8")),
  workflow: readFileSync(join(root, paths.workflow), "utf8"),
  pluginMain: readFileSync(join(root, paths.pluginMain), "utf8"),
  pluginReadme: readFileSync(join(root, paths.pluginReadme), "utf8"),
  matrix: readFileSync(join(root, paths.matrix), "utf8"),
  tasks: readFileSync(join(root, paths.tasks), "utf8"),
  attributes: readFileSync(join(root, paths.attributes), "utf8"),
  prettierIgnore: readFileSync(join(root, paths.prettierIgnore), "utf8"),
};

validate(review, inputs);

if (process.argv.includes("--self-test")) {
  const cases = [
    [
      "source snapshot drift",
      (candidate) =>
        (candidate.inputs.sourceBytes = Buffer.from(
          `${candidate.inputs.sourceBytes.toString("utf8")} `,
        )),
    ],
    [
      "artifact digest drift",
      (candidate) =>
        (candidate.review.candidate.woocommerce.sha256 = "1".repeat(64)),
    ],
    [
      "CI evidence byte drift",
      (candidate) =>
        (candidate.inputs.evidenceBytes = Buffer.from(
          `${candidate.inputs.evidenceBytes.toString("utf8")} `,
        )),
    ],
    [
      "CI evidence job identity drift",
      (candidate) => (candidate.inputs.evidence.ci.jobs[0].jobId += 1),
    ],
    [
      "CI evidence failed runtime step",
      (candidate) =>
        (candidate.inputs.evidence.ci.jobs[2].steps.runtimeStart = "failure"),
    ],
    [
      "CI evidence incomplete matrix",
      (candidate) => candidate.inputs.evidence.ci.jobs.pop(),
    ],
    [
      "CI evidence false production authority",
      (candidate) =>
        (candidate.inputs.evidence.authority.productionMutated = true),
    ],
    [
      "CI evidence observation predates completion",
      (candidate) =>
        (candidate.inputs.evidence.observedAt = "2026-08-29T15:49:17Z"),
    ],
    [
      "CI evidence line-ending control omission",
      (candidate) =>
        (candidate.inputs.attributes = candidate.inputs.attributes.replace(
          "docs/plan/evidence/M16/runs/woocommerce-runtime-*.json -text",
          "docs/plan/evidence/M16/runs/woocommerce-runtime-*.json text",
        )),
    ],
    [
      "CI evidence formatter exclusion omission",
      (candidate) =>
        (candidate.inputs.prettierIgnore =
          candidate.inputs.prettierIgnore.replace(
            "docs/plan/evidence/M16/runs/woocommerce-runtime-*.json",
            "docs/plan/evidence/M16/runs/forged-woocommerce-runtime-*.json",
          )),
    ],
    [
      "mutable latest artifact URL",
      (candidate) =>
        (candidate.review.candidate.wordpress.url =
          "https://wordpress.org/latest.zip"),
    ],
    [
      "candidate version drift",
      (candidate) =>
        (candidate.review.candidate.woocommerce.version = "11.0.0"),
    ],
    [
      "minimum runtime drift",
      (candidate) => (candidate.inputs.minimum.phpVersion = "8.2"),
    ],
    [
      "missing HPOS workflow cell",
      (candidate) =>
        (candidate.inputs.workflow = candidate.inputs.workflow.replace(
          "          - name: current-hpos",
          "          - name: current-disabled",
        )),
    ],
    [
      "workflow artifact digest drift",
      (candidate) =>
        (candidate.inputs.workflow = candidate.inputs.workflow.replace(
          locked.candidate.woocommerce.sha256,
          "2".repeat(64),
        )),
    ],
    [
      "runtime version assertion omission",
      (candidate) =>
        (candidate.inputs.workflow = candidate.inputs.workflow.replace(
          'WC_VERSION !== "${{ matrix.runtime.woocommerce }}"',
          'WC_VERSION !== "unreviewed"',
        )),
    ],
    [
      "plugin compatibility header drift",
      (candidate) =>
        (candidate.inputs.pluginMain = candidate.inputs.pluginMain.replace(
          "WC tested up to: 11.0",
          "WC tested up to: 10.9",
        )),
    ],
    [
      "readme PHP drift",
      (candidate) =>
        (candidate.inputs.pluginReadme = candidate.inputs.pluginReadme.replace(
          "Requires PHP: 8.1",
          "Requires PHP: 8.2",
        )),
    ],
    [
      "production mutation claim",
      (candidate) => (candidate.review.production.mutation = true),
    ],
    [
      "impact owner omission",
      (candidate) => (candidate.review.impact.owner = ""),
    ],
    [
      "matrix current row drift",
      (candidate) =>
        (candidate.inputs.matrix = candidate.inputs.matrix.replace(
          "| 7.1       | 11.0.1      | 8.4 | HPOS          |",
          "| 7.0.2     | 10.9.4      | 8.3 | HPOS          |",
        )),
    ],
    [
      "TASKS acceptance drift",
      (candidate) =>
        (candidate.inputs.tasks = candidate.inputs.tasks.replace(
          "exact implementation c3b29542035772ddcbc48d92e2b159ac605dd80f passed all four WooCommerce runtime cells in CI run 33261152926",
          "unbound runtime evidence passed",
        )),
    ],
    [
      "TASKS structured evidence omission",
      (candidate) =>
        (candidate.inputs.tasks = candidate.inputs.tasks.replace(
          `        ${locked.evidence.path},`,
          `        docs/plan/evidence/M16/runs/forged-woocommerce-runtime.json,`,
        )),
    ],
  ];
  for (const [name, mutate] of cases) {
    const candidate = {
      review: structuredClone(review),
      inputs: {
        ...structuredClone(inputs),
        sourceBytes: Buffer.from(inputs.sourceBytes),
        evidenceBytes: Buffer.from(inputs.evidenceBytes),
      },
    };
    mutate(candidate);
    let rejected = false;
    try {
      validate(candidate.review, candidate.inputs);
    } catch {
      rejected = true;
    }
    if (!rejected) {
      fail(`self-test accepted ${name}`);
    }
  }
  console.log(
    `Rejected ${cases.length} WooCommerce runtime review corruptions.`,
  );
}

console.log(
  "WooCommerce runtime review is source-bound, reviewed-artifact verified, production-safe, and matrix-consistent.",
);
