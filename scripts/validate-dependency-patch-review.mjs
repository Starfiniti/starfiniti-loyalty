import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const paths = Object.freeze({
  review: "infrastructure/governance/dependency-patch-review.yaml",
  rootPackage: "package.json",
  dashboardPackage: "apps/dashboard/package.json",
  workerPackage: "apps/worker/package.json",
  lock: "package-lock.json",
  tasks: "docs/plan/TASKS.yaml",
  adr: "docs/architecture/ADR/0106-reviewed-notification-and-federation-dependency-patches.md",
  federationSource: "apps/dashboard/lib/server/federation-validation.ts",
  notificationSource: "apps/worker/src/notification-delivery.ts",
});

const packages = Object.freeze([
  {
    id: "fast-xml-parser",
    use: "bounded parsing of tenant SAML metadata after independent syntax validation",
    manifest: paths.dashboardPackage,
    manifestGroup: "dependencies",
    lockPath: "apps/dashboard/node_modules/fast-xml-parser",
    previousVersion: "5.11.0",
    previousIntegrity:
      "sha512-9IGxMqvqLOnqP+Egi1nqDHKv5k8aZ7r9n558enxcucmyVGEBNPAU+MOg/8jPIS7rO7sSq4gFm1/nHtiaubMruw==",
    previousCommit: "f3c69ae2a9a1a1df4e4be9ca954ddcdf6563d16a",
    version: "5.11.1",
    tag: "v5.11.1",
    commit: "3617550adfb280989f482d662b7e9ece55a32a34",
    comparison:
      "https://github.com/NaturalIntelligence/fast-xml-parser/compare/v5.11.0...v5.11.1",
    tarball:
      "https://registry.npmjs.org/fast-xml-parser/-/fast-xml-parser-5.11.1.tgz",
    integrity:
      "sha512-TBw6K/fxoQGGjCmZDw9w/ZwP3uDcnTM4YH/g+PFRWr8sbe5idXtxNN6vITh4+1ruCZaho6uBFurElsA7F0zzgw==",
    license: "MIT",
    minimumNode: undefined,
    disposition: "accept-single-pass-validator-patch",
  },
  {
    id: "nodemailer",
    use: "provider-neutral SMTP notification delivery with file and URL access denied",
    manifest: paths.workerPackage,
    manifestGroup: "dependencies",
    lockPath: "node_modules/nodemailer",
    previousVersion: "9.0.5",
    previousIntegrity:
      "sha512-wvjiKvjczmsN7U/8006JOdXubgBk2XFAbioDMbT+sM7cPs0QrhJTa6KBRX7P5REGGkDcLUz/EarWidb8G8C1jQ==",
    previousCommit: "742cff9e2d5376962da19f8fcf2408e910ff2020",
    version: "9.0.6",
    tag: "v9.0.6",
    commit: "4e467a8fd298f47b481fb96888dc4658fde70a5b",
    comparison:
      "https://github.com/nodemailer/nodemailer/compare/v9.0.5...v9.0.6",
    tarball: "https://registry.npmjs.org/nodemailer/-/nodemailer-9.0.6.tgz",
    integrity:
      "sha512-IQUGFdhdGwI9+AWX+FpUt4DLmvFaOjTMEoneTIWX/RXxuy1TdenPwWrvFMSfLkPKl+HQEXWuSAxEMMbPYXtBmg==",
    license: "MIT-0",
    minimumNode: ">=6.0.0",
    disposition: "accept-user-key-and-url-fetch-hardening",
  },
  {
    id: "smtp-server",
    use: "isolated SMTP delivery test sink only",
    manifest: paths.workerPackage,
    manifestGroup: "devDependencies",
    lockPath: "node_modules/smtp-server",
    previousVersion: "3.19.3",
    previousIntegrity:
      "sha512-1WkMlusxxy0Pdx3Bj4+nxzXLakON3EvV8+e0ZD/u6weNkHiX/ih2KGRV2A6Hg54Z30CQjE1OvNs79EZ0r0fBkw==",
    previousCommit: "2f21fb6b8764917c06c0dd9b70b181ca65e82528",
    version: "3.19.4",
    tag: "v3.19.4",
    commit: "b5bbf3d1209c5d0198f5e600714317c69ca79c71",
    comparison:
      "https://github.com/nodemailer/smtp-server/compare/v3.19.3...v3.19.4",
    tarball: "https://registry.npmjs.org/smtp-server/-/smtp-server-3.19.4.tgz",
    integrity:
      "sha512-ThET3Upb7y6KfZArVPESLXafPurJ+bHAs5h0I+MzJKqVng2oDMgGo521HSuk4O+A8BfC1RgHjM7UvAVNRiDUOA==",
    license: "MIT-0",
    minimumNode: ">=18.18.0",
    disposition: "accept-test-sink-nodemailer-alignment",
  },
]);

function fail(message) {
  throw new Error(`Dependency patch review invalid: ${message}`);
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

function validatePackage(reviewed, expected, manifests, lock) {
  sameKeys(
    reviewed,
    [
      "id",
      "use",
      "manifest",
      "lockPath",
      "previous",
      "candidate",
      "disposition",
    ],
    `${expected.id} review`,
  );
  sameKeys(
    reviewed.previous,
    ["version", "integrity", "gitCommit"],
    `${expected.id} previous provenance`,
  );
  sameKeys(
    reviewed.candidate,
    [
      "version",
      "tag",
      "gitCommit",
      "comparison",
      "tarball",
      "integrity",
      "license",
      ...(expected.minimumNode === undefined ? [] : ["minimumNode"]),
    ],
    `${expected.id} candidate provenance`,
  );
  if (
    reviewed?.id !== expected.id ||
    reviewed.use !== expected.use ||
    reviewed.manifest !== expected.manifest ||
    reviewed.lockPath !== expected.lockPath ||
    reviewed.previous?.version !== expected.previousVersion ||
    reviewed.previous.integrity !== expected.previousIntegrity ||
    reviewed.previous.gitCommit !== expected.previousCommit ||
    reviewed.candidate?.version !== expected.version ||
    reviewed.candidate.tag !== expected.tag ||
    reviewed.candidate.gitCommit !== expected.commit ||
    reviewed.candidate.comparison !== expected.comparison ||
    reviewed.candidate.tarball !== expected.tarball ||
    reviewed.candidate.integrity !== expected.integrity ||
    reviewed.candidate.license !== expected.license ||
    reviewed.candidate.minimumNode !== expected.minimumNode ||
    reviewed.disposition !== expected.disposition
  )
    fail(`${expected.id} provenance differs`);

  const manifestVersion =
    manifests[expected.manifest]?.[expected.manifestGroup]?.[expected.id];
  if (manifestVersion !== expected.version || /^[~^]/u.test(manifestVersion))
    fail(`${expected.id} manifest is not the exact reviewed version`);

  const lockEntry = lock.packages?.[expected.lockPath];
  if (
    lockEntry?.version !== expected.version ||
    lockEntry.resolved !== expected.tarball ||
    lockEntry.integrity !== expected.integrity ||
    lockEntry.license !== expected.license ||
    lockEntry.engines?.node !== expected.minimumNode
  )
    fail(`${expected.id} lock entry differs`);
}

function validateReview(bundle) {
  const {
    review,
    rootPackage,
    dashboardPackage,
    workerPackage,
    lock,
    tasks,
    adr,
    federationSource,
    notificationSource,
  } = bundle;
  sameKeys(
    review,
    [
      "schema",
      "reviewedAt",
      "owner",
      "scope",
      "packages",
      "compatibility",
      "controls",
      "deferred",
      "decision",
      "authority",
    ],
    "review",
  );
  if (
    review?.schema !== "starfiniti.dependency-patch-review.v1" ||
    review.reviewedAt !== "2026-08-30" ||
    review.owner !== "engineering" ||
    review.scope !== "notification-and-federation-untrusted-input-boundaries"
  )
    fail("review identity differs");
  if (
    !Array.isArray(review.packages) ||
    review.packages.length !== packages.length
  )
    fail("reviewed package set differs");

  const manifests = {
    [paths.dashboardPackage]: dashboardPackage,
    [paths.workerPackage]: workerPackage,
  };
  for (const [index, expected] of packages.entries())
    validatePackage(review.packages[index], expected, manifests, lock);

  if (
    lock.packages?.["apps/dashboard"]?.dependencies?.["fast-xml-parser"] !==
      "5.11.1" ||
    lock.packages?.["apps/worker"]?.dependencies?.nodemailer !== "9.0.6" ||
    lock.packages?.["apps/worker"]?.devDependencies?.["smtp-server"] !==
      "3.19.4"
  )
    fail("workspace lock roots differ");
  if (
    lock.packages?.["node_modules/smtp-server"]?.dev !== true ||
    lock.packages["node_modules/smtp-server"].dependencies?.nodemailer !==
      "9.0.6"
  )
    fail("SMTP sink dependency alignment differs");

  sameKeys(
    review.compatibility,
    [
      "repositoryNode",
      "candidateRuntimeDependencyChange",
      "contractChange",
      "migrationChange",
      "ledgerChange",
      "tenantAuthorityChange",
      "checkoutChange",
      "productionRuntimeMutation",
    ],
    "compatibility",
  );
  if (
    review.compatibility.repositoryNode !== ">=24.0.0" ||
    review.compatibility.candidateRuntimeDependencyChange !== true ||
    Object.entries(review.compatibility)
      .filter(
        ([key]) =>
          !["repositoryNode", "candidateRuntimeDependencyChange"].includes(key),
      )
      .some(([, value]) => value !== false) ||
    rootPackage.engines?.node !== ">=24.0.0"
  )
    fail("compatibility boundary differs");

  sameKeys(
    review.controls,
    [
      "samlDocumentMaxBytes",
      "samlDeclarationsRejected",
      "independentSyntaxValidation",
      "entityExpansionBounded",
      "smtpTransportFileAccessDisabled",
      "smtpTransportUrlAccessDisabled",
      "smtpMessageFileAccessDisabled",
      "smtpMessageUrlAccessDisabled",
    ],
    "controls",
  );
  if (
    review.controls.samlDocumentMaxBytes !== 262144 ||
    Object.entries(review.controls)
      .filter(([key]) => key !== "samlDocumentMaxBytes")
      .some(([, value]) => value !== true)
  )
    fail("untrusted-input controls differ");
  sameArray(
    review.deferred?.majorUpgrades,
    ["typescript", "eslint", "types-node"],
    "deferred major upgrades",
  );
  sameArray(
    review.deferred?.unrelatedMinorUpgrades,
    ["zod", "lucide-react"],
    "deferred unrelated minor upgrades",
  );
  sameKeys(
    review.deferred,
    ["majorUpgrades", "unrelatedMinorUpgrades"],
    "deferred updates",
  );
  sameKeys(
    review.decision,
    ["disposition", "breakingChangeIdentified", "rollback"],
    "decision",
  );
  if (
    review.decision?.disposition !==
      "exact-compatible-untrusted-input-patch-refresh" ||
    review.decision.breakingChangeIdentified !== false ||
    !review.decision.rollback?.includes("all three manifest pins") ||
    !review.decision.rollback.includes("SAML bounds") ||
    !review.decision.rollback.includes("SMTP file and URL denial")
  )
    fail("decision or rollback differs");

  for (const phrase of [
    "const MAX_DOCUMENT_BYTES = 256 * 1024;",
    "if (/<!/iu.test(xml))",
    "SyntaxValidator.validate(xml, {",
    "docType: { maxEntityCount: 0, maxEntitySize: 0 }",
    "maxExpandedLength: MAX_DOCUMENT_BYTES",
    "maxBytes: MAX_DOCUMENT_BYTES",
    "response.body.length > MAX_DOCUMENT_BYTES",
    "onDangerousProperty:",
  ]) {
    if (!federationSource.includes(phrase))
      fail(`federation source is missing ${phrase}`);
  }
  for (const phrase of ["disableFileAccess: true", "disableUrlAccess: true"]) {
    if ((notificationSource.match(new RegExp(phrase, "gu")) ?? []).length !== 2)
      fail(`notification source must enforce ${phrase} twice`);
  }

  const authorityKeys = [
    "productionAccess",
    "mergeApproved",
    "releaseApproved",
    "deploymentApproved",
    "productionMutation",
    "productionReconciled",
  ];
  sameKeys(review.authority, authorityKeys, "authority");
  if (Object.values(review.authority).some((value) => value !== false))
    fail("authority must remain entirely false");

  const command =
    "node scripts/validate-dependency-patch-review.mjs --self-test";
  if (
    rootPackage.scripts?.[
      "continuous-improvement:dependency-patches:validate"
    ] !== command ||
    !rootPackage.scripts?.check?.includes(
      "npm run continuous-improvement:dependency-patches:validate",
    )
  )
    fail("repository validation command is not gated");

  const task = tasks.tasks?.find(
    (item) => item.id === "M16-CONTINUOUS-IMPROVEMENT",
  );
  if (
    !task ||
    !task.evidence?.includes(paths.review) ||
    !task.evidence.includes("scripts/validate-dependency-patch-review.mjs") ||
    !task.docs?.includes(paths.adr) ||
    !task.verification?.includes(
      "npm run continuous-improvement:dependency-patches:validate",
    )
  )
    fail("task graph evidence is incomplete");
  for (const phrase of [
    "Keep the existing package set",
    "Upgrade every currently outdated package together",
    "Apply only the reviewed compatible patch set with exact manifest pins",
    "Compatibility and rollback consequences",
    "disableFileAccess: true",
    "single-pass",
  ]) {
    if (!adr.includes(phrase)) fail(`ADR is missing ${phrase}`);
  }
}

function loadBundle() {
  const read = (path) => readFileSync(join(root, path), "utf8");
  return {
    review: YAML.parse(read(paths.review)),
    rootPackage: JSON.parse(read(paths.rootPackage)),
    dashboardPackage: JSON.parse(read(paths.dashboardPackage)),
    workerPackage: JSON.parse(read(paths.workerPackage)),
    lock: JSON.parse(read(paths.lock)),
    tasks: YAML.parse(read(paths.tasks)),
    adr: read(paths.adr),
    federationSource: read(paths.federationSource),
    notificationSource: read(paths.notificationSource),
  };
}

function selfTest(bundle) {
  validateReview(bundle);
  const cases = [
    ["schema", (x) => (x.review.schema = "wrong")],
    ["package removal", (x) => x.review.packages.pop()],
    ["package order", (x) => x.review.packages.reverse()],
    ["package use", (x) => (x.review.packages[0].use = "generic XML parsing")],
    [
      "unrecognized package field",
      (x) => (x.review.packages[0].unreviewed = true),
    ],
    [
      "source commit",
      (x) => (x.review.packages[0].candidate.gitCommit = "0".repeat(40)),
    ],
    [
      "tarball",
      (x) =>
        (x.review.packages[1].candidate.tarball =
          "https://example.invalid/package.tgz"),
    ],
    [
      "integrity",
      (x) => (x.review.packages[2].candidate.integrity = "sha512-wrong"),
    ],
    [
      "range pin",
      (x) => (x.dashboardPackage.dependencies["fast-xml-parser"] = "^5.11.1"),
    ],
    ["worker pin", (x) => (x.workerPackage.dependencies.nodemailer = "9.0.5")],
    [
      "sink pin",
      (x) => (x.workerPackage.devDependencies["smtp-server"] = "3.19.3"),
    ],
    [
      "workspace lock",
      (x) => (x.lock.packages["apps/worker"].dependencies.nodemailer = "9.0.5"),
    ],
    [
      "nested parser",
      (x) =>
        (x.lock.packages[
          "apps/dashboard/node_modules/fast-xml-parser"
        ].version = "5.11.0"),
    ],
    [
      "resolved source",
      (x) =>
        (x.lock.packages["node_modules/nodemailer"].resolved =
          "https://example.invalid"),
    ],
    [
      "sink dependency",
      (x) =>
        (x.lock.packages["node_modules/smtp-server"].dependencies.nodemailer =
          "9.0.5"),
    ],
    [
      "sink production",
      (x) => (x.lock.packages["node_modules/smtp-server"].dev = false),
    ],
    ["contract claim", (x) => (x.review.compatibility.contractChange = true)],
    [
      "candidate runtime claim",
      (x) => (x.review.compatibility.candidateRuntimeDependencyChange = false),
    ],
    ["SAML size", (x) => (x.review.controls.samlDocumentMaxBytes = 1048576)],
    [
      "syntax gate",
      (x) => (x.review.controls.independentSyntaxValidation = false),
    ],
    [
      "SMTP URL access",
      (x) => (x.review.controls.smtpMessageUrlAccessDisabled = false),
    ],
    ["deferred major", (x) => x.review.deferred.majorUpgrades.pop()],
    ["decision", (x) => (x.review.decision.breakingChangeIdentified = true)],
    [
      "rollback",
      (x) => (x.review.decision.rollback = "Revert package-lock.json"),
    ],
    [
      "production authority",
      (x) => (x.review.authority.productionMutation = true),
    ],
    ["authority shape", (x) => (x.review.authority.unreviewed = false)],
    [
      "root command",
      (x) =>
        delete x.rootPackage.scripts[
          "continuous-improvement:dependency-patches:validate"
        ],
    ],
    [
      "root gate",
      (x) =>
        (x.rootPackage.scripts.check = x.rootPackage.scripts.check.replace(
          "npm run continuous-improvement:dependency-patches:validate",
          "",
        )),
    ],
    [
      "task evidence",
      (x) =>
        (x.tasks.tasks.find(
          (item) => item.id === "M16-CONTINUOUS-IMPROVEMENT",
        ).evidence = []),
    ],
    [
      "ADR rollback",
      (x) =>
        (x.adr = x.adr.replace(
          "Compatibility and rollback consequences",
          "Compatibility consequences",
        )),
    ],
    [
      "SAML source control",
      (x) =>
        (x.federationSource = x.federationSource.replace(
          "const MAX_DOCUMENT_BYTES = 256 * 1024;",
          "const MAX_DOCUMENT_BYTES = 1024 * 1024;",
        )),
    ],
    [
      "SMTP source control",
      (x) =>
        (x.notificationSource = x.notificationSource.replace(
          "disableUrlAccess: true",
          "disableUrlAccess: false",
        )),
    ],
  ];
  for (const [name, mutate] of cases) {
    const candidate = structuredClone(bundle);
    mutate(candidate);
    let rejected = false;
    try {
      validateReview(candidate);
    } catch {
      rejected = true;
    }
    if (!rejected) fail(`self-test corruption was accepted: ${name}`);
  }
  console.log(
    `Validated three reviewed dependency patches and rejected ${cases.length} corruptions.`,
  );
}

const bundle = loadBundle();
if (process.argv.includes("--self-test")) selfTest(bundle);
else {
  validateReview(bundle);
  console.log("Validated three reviewed dependency patches.");
}
