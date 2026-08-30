import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const paths = Object.freeze({
  review: "infrastructure/governance/provider-impact-review.yaml",
  plan: "infrastructure/governance/continuous-improvement.yaml",
  sourceSnapshot:
    "docs/plan/evidence/M16/runs/provider-source-snapshot-257e99c-2026-08-28T212100Z.json",
  installedSnapshot:
    "docs/plan/evidence/M16/runs/recovery-dependency-snapshot-c5678b6-2026-08-28T221524Z.json",
  supabaseCompatibility:
    "infrastructure/environments/proxmox/supabase-compatibility.json",
  supabaseReview: "infrastructure/governance/supabase-runtime-review.yaml",
  wooReview: "infrastructure/governance/woocommerce-runtime-review.yaml",
  nodeReview: "infrastructure/governance/node-runtime-review.yaml",
  rsyncPlan: "infrastructure/testing/rsync-source-security/plan.yaml",
  borgPlan: "infrastructure/testing/borgbackup-security/plan.yaml",
  opensshPlan: "infrastructure/testing/openssh-client-security/plan.yaml",
  proxmoxPlan: "infrastructure/governance/proxmox-security-update-plan.yaml",
  stripeDashboard: "apps/dashboard/lib/server/stripe-billing-sessions.ts",
  stripeWorker: "apps/worker/src/billing-usage.ts",
  klaviyoWorker: "apps/worker/src/klaviyo-delivery.ts",
  klaviyoContract: "packages/contracts/src/notification.ts",
  rootPackage: "package.json",
  tasks: "docs/plan/TASKS.yaml",
  risks: "RISKS.md",
  adr: "docs/architecture/ADR/0107-cutoff-bound-provider-impact-register.md",
});

const expectedProviderIds = Object.freeze([
  "supabase",
  "postgresql",
  "woocommerce",
  "stripe",
  "authentik",
  "klaviyo",
  "nodejs",
  "rsync",
  "borgbackup",
  "openssh",
  "debian",
  "ubuntu",
  "proxmox",
]);
// V1 locks the complete provider decision set; later semantic changes supersede it.
const expectedRecoveryProviderIds = Object.freeze([
  "rsync",
  "borgbackup",
  "openssh",
  "debian",
  "ubuntu",
  "proxmox",
]);
const expectedProviderHash =
  "ee97ed58f003c8148a19b1e6afc5683bbc9c5b9652b6b43fc55dfd5647667645";
const expectedTaskAcceptance =
  "one cutoff-bound thirteen-entry engineering register composes the immutable source and installed snapshots with current repository pins candidate facts affected modules risk links rollback and remaining gates while unknown state monthly cadence independent review every approval and production authority remain explicitly incomplete or false";
const expectedSourceHash =
  "5786186426b065493f5c01b5d76742322e2e8ed3fe92b8f80c30d787caa516be";
const expectedInstalledHash =
  "9960e01bea1a66856a2e0ed36493b28e183f5e316ce027fef3534ba5043448f7";

function fail(message) {
  throw new Error(`Provider impact review invalid: ${message}`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stable(value[key])]),
    );
  return value;
}

function canonicalHash(value) {
  return sha256(JSON.stringify(stable(value)));
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

function sameArray(actual, expected, label) {
  if (
    !Array.isArray(actual) ||
    actual.length !== expected.length ||
    actual.some((value, index) => value !== expected[index])
  )
    fail(`${label} differs`);
}

function count(text, phrase) {
  return text.split(phrase).length - 1;
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    fail(`${label} is not JSON`);
  }
}

function validateReviewShape(review) {
  sameKeys(
    review,
    [
      "schema",
      "reviewedAt",
      "reviewCutoff",
      "owner",
      "inputs",
      "rules",
      "providers",
      "outcomes",
      "authority",
    ],
    "review",
  );
  if (
    review.schema !== "starfiniti.provider-impact-review.v1" ||
    review.reviewedAt !== "2026-08-30" ||
    review.reviewCutoff !== "2026-08-28T21:20:42Z" ||
    review.owner !== "engineering"
  )
    fail("review identity differs");

  sameKeys(review.inputs, ["sourceSnapshot", "installedSnapshot"], "inputs");
  for (const [id, expectedPath, expectedHash] of [
    ["sourceSnapshot", paths.sourceSnapshot, expectedSourceHash],
    ["installedSnapshot", paths.installedSnapshot, expectedInstalledHash],
  ]) {
    sameKeys(review.inputs[id], ["path", "sha256"], `${id} input`);
    if (
      review.inputs[id].path !== expectedPath ||
      review.inputs[id].sha256 !== expectedHash
    )
      fail(`${id} input differs`);
  }

  sameKeys(
    review.rules,
    [
      "providerCount",
      "sourceCoverageComplete",
      "entryImpactClassified",
      "installedRecoveryCoverageComplete",
      "unknownInstalledStateBlocksAcceptance",
      "automaticUpgradeAllowed",
      "monthlyReviewComplete",
      "independentReviewComplete",
      "ownerApprovalComplete",
    ],
    "rules",
  );
  if (
    review.rules.providerCount !== 13 ||
    review.rules.sourceCoverageComplete !== true ||
    review.rules.entryImpactClassified !== true ||
    review.rules.installedRecoveryCoverageComplete !== true ||
    review.rules.unknownInstalledStateBlocksAcceptance !== true ||
    review.rules.automaticUpgradeAllowed !== false ||
    review.rules.monthlyReviewComplete !== false ||
    review.rules.independentReviewComplete !== false ||
    review.rules.ownerApprovalComplete !== false
  )
    fail("review rules differ or overclaim completion");

  if (canonicalHash(review.providers) !== expectedProviderHash)
    fail("provider classification bytes differ from the accepted V1 decision");
  sameArray(
    review.providers?.map((provider) => provider.id),
    expectedProviderIds,
    "provider order",
  );
  for (const provider of review.providers) {
    sameKeys(
      provider,
      [
        "id",
        "reviewedThrough",
        "observedState",
        "candidateState",
        "impact",
        "evidence",
        "remainingGates",
      ],
      `${provider.id} provider`,
    );
    sameKeys(
      provider.impact,
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
      `${provider.id} impact`,
    );
    if (
      !["critical", "high", "medium", "low"].includes(
        provider.impact.severity,
      ) ||
      provider.impact.securityRelevant !== true ||
      provider.impact.owner !== "engineering" ||
      !Array.isArray(provider.impact.affectedModules) ||
      provider.impact.affectedModules.length === 0 ||
      provider.impact.affectedModules.some(
        (module) => !/^M(?:0[0-9]|1[0-6])$/u.test(module),
      ) ||
      !Array.isArray(provider.impact.riskIds) ||
      provider.impact.riskIds.some((risk) => !/^R-[0-9]{3}$/u.test(risk)) ||
      typeof provider.impact.rationale !== "string" ||
      provider.impact.rationale.length < 80 ||
      typeof provider.impact.rollback !== "string" ||
      provider.impact.rollback.length < 60 ||
      !Array.isArray(provider.evidence) ||
      provider.evidence.length === 0 ||
      !Array.isArray(provider.remainingGates) ||
      provider.remainingGates.length === 0
    )
      fail(`${provider.id} classification is incomplete`);
  }
  const severityCounts = Object.fromEntries(
    ["critical", "high", "medium", "low"].map((severity) => [
      severity,
      review.providers.filter(
        (provider) => provider.impact.severity === severity,
      ).length,
    ]),
  );
  if (
    severityCounts.critical !== 2 ||
    severityCounts.high !== 5 ||
    severityCounts.medium !== 3 ||
    severityCounts.low !== 3
  )
    fail("provider severity inventory differs");

  sameKeys(
    review.outcomes,
    [
      "sourceReviewCoverage",
      "impactClassification",
      "candidateSelection",
      "deploymentReadiness",
      "monthlyReview",
      "limitation",
    ],
    "outcomes",
  );
  if (
    review.outcomes.sourceReviewCoverage !== "complete" ||
    review.outcomes.impactClassification !== "complete" ||
    review.outcomes.candidateSelection !== "partial" ||
    review.outcomes.deploymentReadiness !== "incomplete" ||
    review.outcomes.monthlyReview !== "incomplete" ||
    !review.outcomes.limitation.includes("not an elapsed monthly review") ||
    !review.outcomes.limitation.includes("production mutation")
  )
    fail("outcomes differ or overclaim completion");

  const authorityKeys = [
    "productionAccess",
    "mergeApproved",
    "releaseApproved",
    "deploymentApproved",
    "providerUpgradeApproved",
    "productionMutation",
    "productionReconciled",
  ];
  sameKeys(review.authority, authorityKeys, "authority");
  if (Object.values(review.authority).some((value) => value !== false))
    fail("authority must remain entirely false");
}

function validateSourceInputs(bundle) {
  const sourceHash = sha256(bundle.sourceSnapshotBytes);
  const installedHash = sha256(bundle.installedSnapshotBytes);
  if (
    sourceHash !== expectedSourceHash ||
    installedHash !== expectedInstalledHash
  )
    fail("snapshot bytes differ");
  const source = parseJson(bundle.sourceSnapshotBytes, "source snapshot");
  const installed = parseJson(
    bundle.installedSnapshotBytes,
    "installed snapshot",
  );
  if (
    source.schema !== "starfiniti.provider-source-snapshot.v1" ||
    source.completedAt !== bundle.review.reviewCutoff ||
    source.catalogueCount !== 13 ||
    source.complete !== true ||
    source.contentRetained !== false ||
    source.reviewComplete !== false ||
    source.impactClassified !== false ||
    source.installedEvidenceComplete !== false
  )
    fail("historical source snapshot boundary differs");
  const catalogue = bundle.plan.providerCatalogue;
  sameArray(
    catalogue?.map((provider) => provider.id),
    expectedProviderIds,
    "plan provider catalogue",
  );
  sameArray(
    source.sources?.map((provider) => provider.id),
    expectedProviderIds,
    "source snapshot provider catalogue",
  );
  for (const [index, provider] of catalogue.entries()) {
    const captured = source.sources[index];
    if (
      provider.source !== captured.source ||
      captured.status !== 200 ||
      captured.bytes <= 0 ||
      !/^[a-f0-9]{64}$/u.test(captured.sha256)
    )
      fail(`${provider.id} source binding differs`);
  }

  if (
    installed.schema !== "starfiniti.recovery-dependency-snapshot.v1" ||
    installed.sourceSnapshot?.path !== paths.sourceSnapshot ||
    installed.sourceSnapshot?.sha256 !== expectedSourceHash ||
    installed.endpointCount !== 2 ||
    installed.providerCount !== 6 ||
    installed.installedCaptureComplete !== true ||
    installed.candidateEvidenceComplete !== false ||
    installed.reviewComplete !== false ||
    installed.impactClassified !== false ||
    installed.approvalComplete !== false ||
    installed.productionMutation !== false
  )
    fail("historical installed snapshot boundary differs");
  sameArray(
    installed.providers?.map((provider) => provider.id),
    expectedRecoveryProviderIds,
    "installed provider catalogue",
  );
  sameArray(
    installed.endpoints?.map((endpoint) => endpoint.endpointId),
    ["proxmox-host", "database-guest"],
    "installed endpoints",
  );
  return { source, installed };
}

function validateRepositoryFacts(bundle, snapshots) {
  const { supabaseCompatibility, supabaseReview, wooReview, nodeReview } =
    bundle;
  if (
    supabaseCompatibility.upstream?.releaseRef !== "self-hosted/v0.8.0" ||
    supabaseCompatibility.serviceImages?.db !==
      "supabase/postgres:17.6.1.136" ||
    supabaseCompatibility.database?.postgresMajor !== 17 ||
    supabaseReview.packages?.candidate?.cli?.version !== "2.116.0" ||
    supabaseReview.packages?.candidate?.supabaseJs?.version !== "2.112.4" ||
    supabaseReview.packages?.candidate?.ssr?.version !== "0.12.5" ||
    supabaseReview.authority?.productionMutation !== false
  )
    fail("Supabase or PostgreSQL repository facts differ");
  if (
    wooReview.candidate?.wordpress?.version !== "7.1" ||
    wooReview.candidate?.woocommerce?.version !== "11.0.1" ||
    wooReview.candidate?.phpMinor !== "8.4" ||
    wooReview.production?.mutation !== false
  )
    fail("WooCommerce review facts differ");
  if (
    count(
      bundle.stripeDashboard,
      'const STRIPE_API_VERSION = "2026-02-25.clover";',
    ) !== 1 ||
    count(
      bundle.stripeWorker,
      'const STRIPE_API_VERSION = "2026-02-25.clover";',
    ) !== 1
  )
    fail("Stripe API version pin differs");
  if (
    count(
      bundle.klaviyoWorker,
      'const KLAVIYO_API_REVISION = "2026-07-15";',
    ) !== 1 ||
    count(bundle.klaviyoContract, 'z.literal("2026-07-15")') !== 1
  )
    fail("Klaviyo revision pin differs");
  if (
    nodeReview.officialRelease?.version !== "24.20.0" ||
    nodeReview.officialRelease?.status !== "LTS" ||
    nodeReview.production?.mutation !== false
  )
    fail("Node runtime review facts differ");
  if (
    bundle.rsyncPlan.installed?.["proxmox-host"]?.package?.version !==
      "3.4.1+ds1-5+deb13u3" ||
    bundle.rsyncPlan.installed?.["database-guest"]?.package?.version !==
      "3.2.7-1ubuntu1.5" ||
    bundle.rsyncPlan.candidate?.version !== "3.5.0" ||
    bundle.rsyncPlan.rollback?.productionMutation !== false
  )
    fail("rsync installed or candidate facts differ");
  if (
    bundle.borgPlan.installed?.package?.version !== "1.4.0-5" ||
    bundle.borgPlan.installed?.security?.status !== "affected" ||
    bundle.borgPlan.candidate?.version !== "1.4.5" ||
    bundle.borgPlan.rollback?.productionMutation !== false
  )
    fail("BorgBackup installed or candidate facts differ");
  if (
    bundle.opensshPlan.installed?.hostClient?.version !==
      "1:10.0p1-7+deb13u4" ||
    bundle.opensshPlan.installed?.guestServer?.version !==
      "1:9.6p1-3ubuntu13.18" ||
    bundle.opensshPlan.candidate?.version !== "10.5p1" ||
    bundle.opensshPlan.rollback?.productionMutation !== false
  )
    fail("OpenSSH installed or candidate facts differ");
  if (
    snapshots.installed.endpoints?.[0]?.os?.release !==
      "Debian GNU/Linux 13 (trixie)" ||
    snapshots.installed.endpoints?.[1]?.os?.release !== "Ubuntu 24.04.4 LTS"
  )
    fail("endpoint OS facts differ");
  if (
    bundle.proxmoxPlan.endpointId !== "proxmox-host" ||
    bundle.proxmoxPlan.advisories?.length !== 5 ||
    bundle.proxmoxPlan.repairSet?.packages?.length !== 12 ||
    bundle.proxmoxPlan.repairSet?.removals?.length !== 0 ||
    bundle.proxmoxPlan.gates?.currentClosesKnownAdvisories !== false ||
    bundle.proxmoxPlan.gates?.candidateClosesKnownAdvisories !== true ||
    bundle.proxmoxPlan.gates?.productionMutation !== false
  )
    fail("Proxmox current or candidate facts differ");
}

function validateEvidenceAndBindings(bundle) {
  const seen = new Set();
  for (const provider of bundle.review.providers) {
    for (const path of provider.evidence) {
      if (
        typeof path !== "string" ||
        path.includes("\\") ||
        path.startsWith("/") ||
        path.split("/").includes("..")
      )
        fail(`${provider.id} evidence path is unsafe`);
      const stat = lstatSync(join(root, path));
      if (!stat.isFile() || stat.isSymbolicLink())
        fail(`${provider.id} evidence is not a regular repository file`);
      seen.add(path);
    }
    for (const risk of provider.impact.riskIds) {
      if (!bundle.risks.includes(`| ${risk} |`))
        fail(`${provider.id} references an absent risk`);
    }
  }
  if (seen.size < 20) fail("provider evidence is not independently broad");

  const command =
    "node scripts/validate-provider-impact-review.mjs --self-test";
  if (
    bundle.rootPackage.scripts?.[
      "continuous-improvement:provider-impact:validate"
    ] !== command ||
    !bundle.rootPackage.scripts?.check?.includes(
      "npm run continuous-improvement:provider-impact:validate",
    )
  )
    fail("root provider-impact command is not gated");
  const task = bundle.tasks.tasks?.find(
    (candidate) => candidate.id === "M16-CONTINUOUS-IMPROVEMENT",
  );
  if (
    !task?.acceptance?.includes(expectedTaskAcceptance) ||
    !task?.evidence?.includes(paths.review) ||
    !task.evidence.includes("scripts/validate-provider-impact-review.mjs") ||
    !task.docs?.includes(paths.adr) ||
    !task.verification?.includes(
      "npm run continuous-improvement:provider-impact:validate",
    )
  )
    fail("task graph provider-impact binding is incomplete");
  for (const phrase of [
    "Classification is not acceptance",
    "Unknown remains blocking",
    "Compatibility and rollback consequences",
    "monthly review remains incomplete",
  ]) {
    if (!bundle.adr.includes(phrase)) fail(`ADR is missing ${phrase}`);
  }
}

function validate(bundle) {
  validateReviewShape(bundle.review);
  const snapshots = validateSourceInputs(bundle);
  validateRepositoryFacts(bundle, snapshots);
  validateEvidenceAndBindings(bundle);
}

function read(path) {
  return readFileSync(join(root, path));
}

function loadBundle() {
  const text = (path) => read(path).toString("utf8");
  const yaml = (path) => YAML.parse(text(path));
  const json = (path) => JSON.parse(text(path));
  return {
    review: yaml(paths.review),
    plan: yaml(paths.plan),
    sourceSnapshotBytes: read(paths.sourceSnapshot),
    installedSnapshotBytes: read(paths.installedSnapshot),
    supabaseCompatibility: json(paths.supabaseCompatibility),
    supabaseReview: yaml(paths.supabaseReview),
    wooReview: yaml(paths.wooReview),
    nodeReview: yaml(paths.nodeReview),
    rsyncPlan: yaml(paths.rsyncPlan),
    borgPlan: yaml(paths.borgPlan),
    opensshPlan: yaml(paths.opensshPlan),
    proxmoxPlan: yaml(paths.proxmoxPlan),
    stripeDashboard: text(paths.stripeDashboard),
    stripeWorker: text(paths.stripeWorker),
    klaviyoWorker: text(paths.klaviyoWorker),
    klaviyoContract: text(paths.klaviyoContract),
    rootPackage: json(paths.rootPackage),
    tasks: yaml(paths.tasks),
    risks: text(paths.risks),
    adr: text(paths.adr),
  };
}

function selfTest(bundle) {
  validate(bundle);
  const cases = [
    ["schema", (x) => (x.review.schema = "wrong")],
    ["review cutoff", (x) => (x.review.reviewCutoff = "2026-08-29T00:00:00Z")],
    ["owner", (x) => (x.review.owner = "automation")],
    ["extra review field", (x) => (x.review.approved = false)],
    [
      "source path",
      (x) => (x.review.inputs.sourceSnapshot.path = "other.json"),
    ],
    [
      "installed digest",
      (x) => (x.review.inputs.installedSnapshot.sha256 = "0".repeat(64)),
    ],
    ["provider count", (x) => (x.review.rules.providerCount = 12)],
    ["source coverage", (x) => (x.review.rules.sourceCoverageComplete = false)],
    ["impact coverage", (x) => (x.review.rules.entryImpactClassified = false)],
    [
      "automatic upgrade",
      (x) => (x.review.rules.automaticUpgradeAllowed = true),
    ],
    [
      "monthly completion",
      (x) => (x.review.rules.monthlyReviewComplete = true),
    ],
    [
      "independent completion",
      (x) => (x.review.rules.independentReviewComplete = true),
    ],
    ["provider removal", (x) => x.review.providers.pop()],
    ["provider order", (x) => x.review.providers.reverse()],
    ["provider state", (x) => (x.review.providers[0].observedState = "latest")],
    [
      "classification",
      (x) => (x.review.providers[1].impact.classification = "current"),
    ],
    ["severity", (x) => (x.review.providers[7].impact.severity = "low")],
    ["impact owner", (x) => (x.review.providers[4].impact.owner = "")],
    ["risk removal", (x) => x.review.providers[12].impact.riskIds.pop()],
    ["rollback", (x) => (x.review.providers[8].impact.rollback = "Revert")],
    ["evidence", (x) => x.review.providers[5].evidence.pop()],
    ["remaining gate", (x) => x.review.providers[6].remainingGates.pop()],
    [
      "candidate selection",
      (x) => (x.review.outcomes.candidateSelection = "complete"),
    ],
    [
      "deployment readiness",
      (x) => (x.review.outcomes.deploymentReadiness = "complete"),
    ],
    ["monthly outcome", (x) => (x.review.outcomes.monthlyReview = "complete")],
    [
      "production authority",
      (x) => (x.review.authority.productionMutation = true),
    ],
    [
      "upgrade authority",
      (x) => (x.review.authority.providerUpgradeApproved = true),
    ],
    ["source bytes", (x) => (x.sourceSnapshotBytes = Buffer.from("{}"))],
    ["installed bytes", (x) => (x.installedSnapshotBytes = Buffer.from("{}"))],
    [
      "Supabase release",
      (x) => (x.supabaseCompatibility.upstream.releaseRef = "latest"),
    ],
    [
      "PostgreSQL image",
      (x) =>
        (x.supabaseCompatibility.serviceImages.db = "supabase/postgres:latest"),
    ],
    [
      "WooCommerce",
      (x) => (x.wooReview.candidate.woocommerce.version = "11.1.0"),
    ],
    [
      "Stripe dashboard pin",
      (x) =>
        (x.stripeDashboard = x.stripeDashboard.replace(
          "2026-02-25.clover",
          "2026-08-26.dahlia",
        )),
    ],
    [
      "Stripe worker pin",
      (x) =>
        (x.stripeWorker = x.stripeWorker.replace(
          "2026-02-25.clover",
          "2026-08-26.dahlia",
        )),
    ],
    [
      "Klaviyo pin",
      (x) =>
        (x.klaviyoWorker = x.klaviyoWorker.replace("2026-07-15", "latest")),
    ],
    ["Node version", (x) => (x.nodeReview.officialRelease.version = "24.21.0")],
    ["rsync version", (x) => (x.rsyncPlan.candidate.version = "3.4.1")],
    ["Borg version", (x) => (x.borgPlan.candidate.version = "1.4.0")],
    ["OpenSSH version", (x) => (x.opensshPlan.candidate.version = "10.0p1")],
    [
      "Proxmox current claim",
      (x) => (x.proxmoxPlan.gates.currentClosesKnownAdvisories = true),
    ],
    [
      "risk record",
      (x) => (x.risks = x.risks.replace("| R-059 |", "| R-999 |")),
    ],
    [
      "root command",
      (x) =>
        delete x.rootPackage.scripts[
          "continuous-improvement:provider-impact:validate"
        ],
    ],
    [
      "root gate",
      (x) =>
        (x.rootPackage.scripts.check = x.rootPackage.scripts.check.replace(
          "npm run continuous-improvement:provider-impact:validate",
          "",
        )),
    ],
    [
      "task evidence",
      (x) =>
        (x.tasks.tasks.find(
          (task) => task.id === "M16-CONTINUOUS-IMPROVEMENT",
        ).evidence = []),
    ],
    [
      "task acceptance",
      (x) =>
        (x.tasks.tasks.find(
          (task) => task.id === "M16-CONTINUOUS-IMPROVEMENT",
        ).acceptance = []),
    ],
    [
      "ADR classification boundary",
      (x) =>
        (x.adr = x.adr.replace(
          "Classification is not acceptance",
          "Classification",
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
    `Validated ${expectedProviderIds.length} provider classifications and rejected ${cases.length} corruptions.`,
  );
}

const bundle = loadBundle();
if (process.argv.includes("--self-test")) selfTest(bundle);
else {
  validate(bundle);
  console.log(
    `Validated ${expectedProviderIds.length} provider classifications.`,
  );
}
