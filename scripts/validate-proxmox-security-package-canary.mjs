import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

import {
  candidateProvenance,
  validatePlan as validateCandidatePlan,
} from "./validate-proxmox-security-update-plan.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const planPath = join(
  root,
  "infrastructure/testing/proxmox-security-packages/plan.yaml",
);
const candidatePath = join(
  root,
  "infrastructure/governance/proxmox-security-update-plan.yaml",
);
const digestPattern = /^[0-9a-f]{64}$/u;
const fingerprintPattern = /^[0-9A-F]{40}$/u;
const exactBaseImage =
  "debian:13-slim@sha256:d7e12182ce18b85b93007c1dedf31f2d29e01ccf3182cc4017c709b6259bc132";
const exactCandidatePath =
  "infrastructure/governance/proxmox-security-update-plan.yaml";
const exactCandidateFileSha256 =
  "ec010eb667d6166ee5adc0ee0cd2d6ecdf5b2a114e345b018b51c704d64df075";
const exactCandidateProvenance =
  "39f30c67a374b041944a598ce2334fed3fcb8e5f64264b3db08847d5ee23ff9f";
const exactCanaryPath =
  "infrastructure/testing/proxmox-security-packages/plan.yaml";
const exactRepositoryIds = [
  "debian-trixie",
  "debian-trixie-backports",
  "debian-trixie-updates",
  "debian-trixie-security",
  "proxmox-trixie-no-subscription",
];
const exactOfficialHosts = [
  "enterprise.proxmox.com",
  "deb.debian.org",
  "security.debian.org",
  "download.proxmox.com",
];
const exactRepositories = [
  {
    id: "debian-trixie",
    repositoryUri: "https://deb.debian.org/debian",
    suite: "trixie",
    component: "main",
    inReleaseUrl: "https://deb.debian.org/debian/dists/trixie/InRelease",
    keyring: "debian",
    listToken: "deb.debian.org_debian_dists_trixie_main_binary-amd64_Packages",
  },
  {
    id: "debian-trixie-backports",
    repositoryUri: "https://deb.debian.org/debian",
    suite: "trixie-backports",
    component: "main",
    inReleaseUrl:
      "https://deb.debian.org/debian/dists/trixie-backports/InRelease",
    keyring: "debian",
    listToken:
      "deb.debian.org_debian_dists_trixie-backports_main_binary-amd64_Packages",
  },
  {
    id: "debian-trixie-updates",
    repositoryUri: "https://deb.debian.org/debian",
    suite: "trixie-updates",
    component: "main",
    inReleaseUrl:
      "https://deb.debian.org/debian/dists/trixie-updates/InRelease",
    keyring: "debian",
    listToken:
      "deb.debian.org_debian_dists_trixie-updates_main_binary-amd64_Packages",
  },
  {
    id: "debian-trixie-security",
    repositoryUri: "https://security.debian.org/debian-security",
    suite: "trixie-security",
    component: "main",
    inReleaseUrl:
      "https://security.debian.org/debian-security/dists/trixie-security/InRelease",
    keyring: "debian",
    listToken:
      "security.debian.org_debian-security_dists_trixie-security_main_binary-amd64_Packages",
  },
  {
    id: "proxmox-trixie-no-subscription",
    repositoryUri: "http://download.proxmox.com/debian/pve",
    suite: "trixie",
    component: "pve-no-subscription",
    inReleaseUrl:
      "http://download.proxmox.com/debian/pve/dists/trixie/InRelease",
    keyring: "proxmox",
    listToken:
      "download.proxmox.com_debian_pve_dists_trixie_pve-no-subscription_binary-amd64_Packages",
  },
];

function fail(message) {
  throw new Error(`Proxmox package canary plan invalid: ${message}`);
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(`${label} has an unexpected shape`);
  }
}

function exactDigest(value, label) {
  if (!digestPattern.test(value ?? "") || /^0{64}$/u.test(value)) {
    fail(`${label} must be a nonzero SHA-256 digest`);
  }
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function readStableBytes(absolutePath, maximumBytes, label) {
  let descriptor;
  try {
    descriptor = openSync(
      absolutePath,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    const beforeDescriptor = fstatSync(descriptor);
    const beforePath = lstatSync(absolutePath);
    if (
      !beforeDescriptor.isFile() ||
      !beforePath.isFile() ||
      beforeDescriptor.dev !== beforePath.dev ||
      beforeDescriptor.ino !== beforePath.ino ||
      beforeDescriptor.size < 2 ||
      beforeDescriptor.size > maximumBytes
    ) {
      fail(`${label} is not a bounded stable regular file`);
    }
    const bytes = Buffer.alloc(beforeDescriptor.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(
        descriptor,
        bytes,
        offset,
        bytes.length - offset,
        offset,
      );
      if (count === 0) fail(`${label} changed while reading`);
      offset += count;
    }
    const afterDescriptor = fstatSync(descriptor);
    const afterPath = lstatSync(absolutePath);
    if (
      afterDescriptor.dev !== beforeDescriptor.dev ||
      afterDescriptor.ino !== beforeDescriptor.ino ||
      afterDescriptor.size !== beforeDescriptor.size ||
      afterDescriptor.mtimeMs !== beforeDescriptor.mtimeMs ||
      afterPath.dev !== beforePath.dev ||
      afterPath.ino !== beforePath.ino ||
      afterPath.size !== beforePath.size ||
      afterPath.mtimeMs !== beforePath.mtimeMs
    ) {
      fail(`${label} changed while reading`);
    }
    return bytes;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function readCandidate() {
  const bytes = readStableBytes(candidatePath, 256 * 1024, "candidate plan");
  if (sha256(bytes) !== exactCandidateFileSha256) {
    fail("candidate plan bytes differ from the immutable V1 binding");
  }
  const candidate = YAML.parse(bytes.toString("utf8"));
  validateCandidatePlan(candidate);
  if (candidateProvenance(candidate) !== exactCandidateProvenance) {
    fail("candidate provenance differs");
  }
  return candidate;
}

function orderedStrings(values, expected, label) {
  if (
    !Array.isArray(values) ||
    values.length !== expected.length ||
    values.some((value, index) => value !== expected[index]) ||
    new Set(values).size !== values.length
  ) {
    fail(`${label} order or identity differs`);
  }
}

function validateUrl(value, expected, label) {
  if (value !== expected) fail(`${label} differs`);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${label} is invalid`);
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    fail(`${label} contains authority or query data`);
  }
}

export function canaryPlanDigest(plan) {
  return sha256(JSON.stringify(canonical(plan)));
}

export function canaryPlanFileSha256() {
  return sha256(readStableBytes(planPath, 256 * 1024, "canary plan"));
}

export function validateCanaryPlan(plan) {
  const candidate = readCandidate();
  exactKeys(
    plan,
    [
      "schema",
      "version",
      "status",
      "createdAt",
      "candidate",
      "baseImage",
      "architecture",
      "execution",
      "trustAnchors",
      "repositories",
      "gates",
    ],
    "plan",
  );
  if (
    plan.schema !== "starfiniti.proxmox-security-package-canary-plan.v1" ||
    plan.version !== 1 ||
    plan.status !== "candidate" ||
    plan.createdAt !== "2026-08-28T23:13:42Z" ||
    plan.baseImage !== exactBaseImage ||
    plan.architecture !== "amd64"
  ) {
    fail("plan identity differs");
  }

  exactKeys(
    plan.candidate,
    ["path", "fileSha256", "provenanceSha256"],
    "candidate binding",
  );
  if (
    plan.candidate.path !== exactCandidatePath ||
    plan.candidate.fileSha256 !== exactCandidateFileSha256 ||
    plan.candidate.provenanceSha256 !== exactCandidateProvenance
  ) {
    fail("candidate binding differs");
  }

  exactKeys(
    plan.execution,
    [
      "environment",
      "maximumDurationSeconds",
      "maximumPackageBytes",
      "maximumTransientBytes",
      "requiredOfficialHosts",
      "productionCredentials",
      "productionRouteInput",
      "packageInstallation",
      "packageBytesRetained",
      "productionMutation",
    ],
    "execution",
  );
  orderedStrings(
    plan.execution.requiredOfficialHosts,
    exactOfficialHosts,
    "official hosts",
  );
  if (
    plan.execution.environment !== "github-hosted-disposable-container" ||
    plan.execution.maximumDurationSeconds !== 1200 ||
    plan.execution.maximumPackageBytes !== 200_000_000 ||
    plan.execution.maximumTransientBytes !== 536_870_912 ||
    plan.execution.productionCredentials !== "prohibited" ||
    plan.execution.productionRouteInput !== "prohibited" ||
    plan.execution.packageInstallation !== "prohibited" ||
    plan.execution.packageBytesRetained !== false ||
    plan.execution.productionMutation !== false
  ) {
    fail("execution authority or bounds differ");
  }
  const packageBytes = candidate.repairSet.packages.reduce(
    (total, item) => total + item.size,
    0,
  );
  if (packageBytes > plan.execution.maximumPackageBytes) {
    fail("candidate package bytes exceed the canary bound");
  }

  exactKeys(plan.trustAnchors, ["debian", "proxmox"], "trust anchors");
  exactKeys(
    plan.trustAnchors.debian,
    ["authority", "path", "provenance"],
    "Debian trust anchor",
  );
  if (
    plan.trustAnchors.debian.authority !== "debian-archive-keyring" ||
    plan.trustAnchors.debian.path !==
      "/usr/share/keyrings/debian-archive-keyring.pgp" ||
    plan.trustAnchors.debian.provenance !==
      "digest-pinned-debian-base-image-and-signed-bootstrap"
  ) {
    fail("Debian trust anchor differs");
  }
  exactKeys(
    plan.trustAnchors.proxmox,
    ["authority", "url", "sha256", "releaseFingerprint"],
    "Proxmox trust anchor",
  );
  validateUrl(
    plan.trustAnchors.proxmox.url,
    "https://enterprise.proxmox.com/debian/proxmox-archive-keyring-trixie.gpg",
    "Proxmox key URL",
  );
  exactDigest(plan.trustAnchors.proxmox.sha256, "Proxmox key digest");
  if (
    plan.trustAnchors.proxmox.authority !== "proxmox-archive-keyring-trixie" ||
    plan.trustAnchors.proxmox.sha256 !==
      "136673be77aba35dcce385b28737689ad64fd785a797e57897589aed08db6e45" ||
    !fingerprintPattern.test(
      plan.trustAnchors.proxmox.releaseFingerprint ?? "",
    ) ||
    plan.trustAnchors.proxmox.releaseFingerprint !==
      "24B30F06ECC1836A4E5EFECBA7BCD1420BFE778E"
  ) {
    fail("Proxmox trust anchor differs");
  }

  if (
    !Array.isArray(plan.repositories) ||
    plan.repositories.length !== exactRepositories.length
  ) {
    fail("repository count differs");
  }
  orderedStrings(
    plan.repositories.map((item) => item?.id),
    exactRepositoryIds,
    "repositories",
  );
  const candidateRepositories = new Map(
    candidate.aptObservation.repositories.map((item) => [item.id, item]),
  );
  for (let index = 0; index < exactRepositories.length; index += 1) {
    const repository = plan.repositories[index];
    const expected = exactRepositories[index];
    const proxmox = repository.id === "proxmox-trixie-no-subscription";
    exactKeys(
      repository,
      proxmox
        ? [
            "id",
            "repositoryUri",
            "suite",
            "component",
            "inReleaseUrl",
            "keyring",
            "listToken",
            "observationInReleaseSha256",
            "observationPackagesSha256",
            "productionRecommended",
            "subscriptionDecisionRequired",
          ]
        : [
            "id",
            "repositoryUri",
            "suite",
            "component",
            "inReleaseUrl",
            "keyring",
            "listToken",
            "observationInReleaseSha256",
            "observationPackagesSha256",
          ],
      `${repository.id} repository`,
    );
    for (const key of [
      "id",
      "repositoryUri",
      "suite",
      "component",
      "inReleaseUrl",
      "keyring",
      "listToken",
    ]) {
      if (repository[key] !== expected[key]) {
        fail(`${repository.id} ${key} differs`);
      }
    }
    validateUrl(
      repository.repositoryUri,
      expected.repositoryUri,
      `${repository.id} URI`,
    );
    validateUrl(
      repository.inReleaseUrl,
      expected.inReleaseUrl,
      `${repository.id} InRelease URL`,
    );
    const observed = candidateRepositories.get(repository.id);
    if (
      repository.observationInReleaseSha256 !== observed?.inReleaseSha256 ||
      repository.observationPackagesSha256 !== observed?.packagesSha256
    ) {
      fail(`${repository.id} observation binding differs`);
    }
    exactDigest(
      repository.observationInReleaseSha256,
      `${repository.id} observed InRelease`,
    );
    exactDigest(
      repository.observationPackagesSha256,
      `${repository.id} observed Packages`,
    );
    if (
      proxmox &&
      (repository.productionRecommended !== false ||
        repository.subscriptionDecisionRequired !== true)
    ) {
      fail("no-subscription production limitation is hidden");
    }
  }

  exactKeys(
    plan.gates,
    [
      "candidatePackageBytesVerified",
      "repositoryToolSignatureReverified",
      "candidateDependencySimulationReverified",
      "installedStartingStateReverified",
      "compatibilityProved",
      "rollbackEscrowComplete",
      "recoveryReady",
      "maintenanceApproved",
      "rebootApproved",
      "productionMutation",
    ],
    "gates",
  );
  for (const [key, value] of Object.entries(plan.gates)) {
    if (value !== false) fail(`${key} must remain false in the execution plan`);
  }

  return {
    candidate,
    candidateProvenanceSha256: exactCandidateProvenance,
    repositoryCount: plan.repositories.length,
    packageCount: candidate.repairSet.packages.length,
    packageBytes,
    planDigest: canaryPlanDigest(plan),
  };
}

function canonicalUtc(value, label) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    fail(`${label} must be canonical UTC`);
  }
  return Date.parse(value);
}

export function reportDigest(report) {
  const subject = structuredClone(report);
  delete subject.reportSha256;
  return sha256(JSON.stringify(canonical(subject)));
}

export function validateCanaryReport(
  report,
  plan,
  { expectedCommit = undefined } = {},
) {
  const validated = validateCanaryPlan(plan);
  exactKeys(
    report,
    [
      "schema",
      "generatedAt",
      "candidate",
      "canary",
      "trustAnchors",
      "repositories",
      "packages",
      "summary",
      "gates",
      "reportSha256",
    ],
    "report",
  );
  if (report.schema !== "starfiniti.proxmox-security-package-canary.v1") {
    fail("report schema differs");
  }
  const generatedAt = canonicalUtc(report.generatedAt, "report generatedAt");
  if (generatedAt < Date.parse(plan.createdAt)) {
    fail("report predates the canary plan");
  }
  exactKeys(
    report.candidate,
    ["path", "fileSha256", "provenanceSha256"],
    "report candidate",
  );
  if (
    report.candidate.path !== plan.candidate.path ||
    report.candidate.fileSha256 !== plan.candidate.fileSha256 ||
    report.candidate.provenanceSha256 !== plan.candidate.provenanceSha256
  ) {
    fail("report candidate binding differs");
  }
  exactKeys(
    report.canary,
    [
      "path",
      "fileSha256",
      "planDigest",
      "baseImage",
      "architecture",
      "commit",
      "runnerEnvironment",
      "network",
      "hostNetwork",
      "publishedPorts",
    ],
    "report canary",
  );
  if (
    report.canary.path !== exactCanaryPath ||
    report.canary.fileSha256 !== canaryPlanFileSha256() ||
    report.canary.planDigest !== validated.planDigest ||
    report.canary.baseImage !== plan.baseImage ||
    report.canary.architecture !== plan.architecture ||
    !/^[0-9a-f]{40}$/u.test(report.canary.commit ?? "") ||
    (expectedCommit !== undefined && report.canary.commit !== expectedCommit) ||
    report.canary.runnerEnvironment !== "github-hosted" ||
    report.canary.network !== "default-bridge-official-sources-only" ||
    report.canary.hostNetwork !== false ||
    report.canary.publishedPorts !== 0
  ) {
    fail("report canary boundary differs");
  }

  exactKeys(report.trustAnchors, ["debian", "proxmox"], "report trust");
  exactKeys(
    report.trustAnchors.debian,
    ["authority", "keyringSha256", "provenance"],
    "report Debian trust",
  );
  if (
    report.trustAnchors.debian.authority !==
      plan.trustAnchors.debian.authority ||
    report.trustAnchors.debian.provenance !==
      "digest-pinned-debian-base-image-and-signed-bootstrap"
  ) {
    fail("report Debian trust differs");
  }
  exactDigest(
    report.trustAnchors.debian.keyringSha256,
    "report Debian keyring",
  );
  exactKeys(
    report.trustAnchors.proxmox,
    ["authority", "url", "sha256", "releaseFingerprint"],
    "report Proxmox trust",
  );
  if (
    report.trustAnchors.proxmox.authority !==
      plan.trustAnchors.proxmox.authority ||
    report.trustAnchors.proxmox.url !== plan.trustAnchors.proxmox.url ||
    report.trustAnchors.proxmox.sha256 !== plan.trustAnchors.proxmox.sha256 ||
    report.trustAnchors.proxmox.releaseFingerprint !==
      plan.trustAnchors.proxmox.releaseFingerprint
  ) {
    fail("report Proxmox trust differs");
  }

  if (
    !Array.isArray(report.repositories) ||
    report.repositories.length !== plan.repositories.length
  ) {
    fail("report repository count differs");
  }
  orderedStrings(
    report.repositories.map((item) => item?.id),
    exactRepositoryIds,
    "report repositories",
  );
  let signatureCount = 0;
  let metadataObservationMatches = 0;
  for (let index = 0; index < report.repositories.length; index += 1) {
    const item = report.repositories[index];
    const source = plan.repositories[index];
    exactKeys(
      item,
      [
        "id",
        "inReleaseSha256",
        "packagesSha256",
        "signingFingerprints",
        "signatureVerified",
        "signedIndexBound",
        "observationInReleaseMatch",
        "observationPackagesMatch",
      ],
      `${item.id} report repository`,
    );
    exactDigest(item.inReleaseSha256, `${item.id} report InRelease`);
    exactDigest(item.packagesSha256, `${item.id} report Packages`);
    if (
      !Array.isArray(item.signingFingerprints) ||
      item.signingFingerprints.length < 1 ||
      item.signingFingerprints.length > 4 ||
      item.signingFingerprints.some(
        (fingerprint) => !fingerprintPattern.test(fingerprint ?? ""),
      ) ||
      new Set(item.signingFingerprints).size !==
        item.signingFingerprints.length ||
      item.signatureVerified !== true ||
      item.signedIndexBound !== true ||
      item.observationInReleaseMatch !==
        (item.inReleaseSha256 === source.observationInReleaseSha256) ||
      item.observationPackagesMatch !==
        (item.packagesSha256 === source.observationPackagesSha256)
    ) {
      fail(`${item.id} report repository evidence differs`);
    }
    signatureCount += item.signingFingerprints.length;
    if (item.observationInReleaseMatch && item.observationPackagesMatch) {
      metadataObservationMatches += 1;
    }
  }

  const expectedPackages = validated.candidate.repairSet.packages;
  if (
    !Array.isArray(report.packages) ||
    report.packages.length !== expectedPackages.length
  ) {
    fail("report package count differs");
  }
  orderedStrings(
    report.packages.map((item) => item?.id),
    expectedPackages.map((item) => item.id),
    "report packages",
  );
  for (let index = 0; index < report.packages.length; index += 1) {
    const item = report.packages[index];
    const expected = expectedPackages[index];
    exactKeys(
      item,
      [
        "id",
        "version",
        "architecture",
        "size",
        "sha256",
        "signedMetadataVerified",
        "exactUrlVerified",
        "packageFieldsVerified",
        "packageBytesRetained",
      ],
      `${item.id} report package`,
    );
    if (
      item.id !== expected.id ||
      item.version !== expected.candidateVersion ||
      item.architecture !== expected.architecture ||
      item.size !== expected.size ||
      item.sha256 !== expected.sha256 ||
      item.signedMetadataVerified !== true ||
      item.exactUrlVerified !== true ||
      item.packageFieldsVerified !== true ||
      item.packageBytesRetained !== false
    ) {
      fail(`${item.id} report package evidence differs`);
    }
  }

  exactKeys(
    report.summary,
    [
      "repositoryCount",
      "signatureCount",
      "metadataObservationMatches",
      "packageCount",
      "packageBytes",
      "dpkgStatusBeforeSha256",
      "dpkgStatusAfterSha256",
      "candidatePackageInstallationOccurred",
      "packageBytesRetained",
      "productionCredentialsProvided",
      "productionRouteInputProvided",
      "productionMutation",
      "teardownPassed",
    ],
    "report summary",
  );
  exactDigest(
    report.summary.dpkgStatusBeforeSha256,
    "report dpkg status before",
  );
  exactDigest(report.summary.dpkgStatusAfterSha256, "report dpkg status after");
  if (
    report.summary.repositoryCount !== report.repositories.length ||
    report.summary.signatureCount !== signatureCount ||
    report.summary.metadataObservationMatches !== metadataObservationMatches ||
    report.summary.packageCount !== report.packages.length ||
    report.summary.packageBytes !== validated.packageBytes ||
    report.summary.dpkgStatusBeforeSha256 !==
      report.summary.dpkgStatusAfterSha256 ||
    report.summary.candidatePackageInstallationOccurred !== false ||
    report.summary.packageBytesRetained !== false ||
    report.summary.productionCredentialsProvided !== false ||
    report.summary.productionRouteInputProvided !== false ||
    report.summary.productionMutation !== false ||
    report.summary.teardownPassed !== true
  ) {
    fail("report summary differs");
  }

  exactKeys(
    report.gates,
    [
      "candidatePackageBytesVerified",
      "repositoryToolSignatureReverified",
      "freshSignedMetadataBindsEveryCandidate",
      "candidateDependencySimulationReverified",
      "installedStartingStateReverified",
      "compatibilityProved",
      "rollbackEscrowComplete",
      "recoveryReady",
      "maintenanceApproved",
      "rebootApproved",
      "productionMutation",
    ],
    "report gates",
  );
  const trueGates = new Set([
    "candidatePackageBytesVerified",
    "repositoryToolSignatureReverified",
    "freshSignedMetadataBindsEveryCandidate",
  ]);
  for (const [key, value] of Object.entries(report.gates)) {
    if (value !== trueGates.has(key)) fail(`${key} report gate differs`);
  }
  exactDigest(report.reportSha256, "report digest");
  if (report.reportSha256 !== reportDigest(report)) {
    fail("report digest differs");
  }
  return {
    generatedAt: report.generatedAt,
    repositoryCount: report.repositories.length,
    packageCount: report.packages.length,
    packageBytes: report.summary.packageBytes,
    metadataObservationMatches,
    reportSha256: report.reportSha256,
  };
}

function clone(value) {
  return structuredClone(value);
}

function expectFailure(plan, mutate) {
  const changed = clone(plan);
  mutate(changed);
  assert.throws(() => validateCanaryPlan(changed));
}

function reportFixture(plan, validated) {
  const signingFingerprint = "A".repeat(40);
  const report = {
    schema: "starfiniti.proxmox-security-package-canary.v1",
    generatedAt: "2026-08-28T23:14:00Z",
    candidate: {
      path: plan.candidate.path,
      fileSha256: plan.candidate.fileSha256,
      provenanceSha256: plan.candidate.provenanceSha256,
    },
    canary: {
      path: exactCanaryPath,
      fileSha256: canaryPlanFileSha256(),
      planDigest: validated.planDigest,
      baseImage: plan.baseImage,
      architecture: plan.architecture,
      commit: "a".repeat(40),
      runnerEnvironment: "github-hosted",
      network: "default-bridge-official-sources-only",
      hostNetwork: false,
      publishedPorts: 0,
    },
    trustAnchors: {
      debian: {
        authority: plan.trustAnchors.debian.authority,
        keyringSha256: "1".repeat(64),
        provenance: "digest-pinned-debian-base-image-and-signed-bootstrap",
      },
      proxmox: { ...plan.trustAnchors.proxmox },
    },
    repositories: plan.repositories.map((item) => ({
      id: item.id,
      inReleaseSha256: item.observationInReleaseSha256,
      packagesSha256: item.observationPackagesSha256,
      signingFingerprints: [signingFingerprint],
      signatureVerified: true,
      signedIndexBound: true,
      observationInReleaseMatch: true,
      observationPackagesMatch: true,
    })),
    packages: validated.candidate.repairSet.packages.map((item) => ({
      id: item.id,
      version: item.candidateVersion,
      architecture: item.architecture,
      size: item.size,
      sha256: item.sha256,
      signedMetadataVerified: true,
      exactUrlVerified: true,
      packageFieldsVerified: true,
      packageBytesRetained: false,
    })),
    summary: {
      repositoryCount: 5,
      signatureCount: 5,
      metadataObservationMatches: 5,
      packageCount: 12,
      packageBytes: validated.packageBytes,
      dpkgStatusBeforeSha256: "2".repeat(64),
      dpkgStatusAfterSha256: "2".repeat(64),
      candidatePackageInstallationOccurred: false,
      packageBytesRetained: false,
      productionCredentialsProvided: false,
      productionRouteInputProvided: false,
      productionMutation: false,
      teardownPassed: true,
    },
    gates: {
      candidatePackageBytesVerified: true,
      repositoryToolSignatureReverified: true,
      freshSignedMetadataBindsEveryCandidate: true,
      candidateDependencySimulationReverified: false,
      installedStartingStateReverified: false,
      compatibilityProved: false,
      rollbackEscrowComplete: false,
      recoveryReady: false,
      maintenanceApproved: false,
      rebootApproved: false,
      productionMutation: false,
    },
    reportSha256: "",
  };
  report.reportSha256 = reportDigest(report);
  return report;
}

function expectReportFailure(report, plan, mutate) {
  const changed = clone(report);
  mutate(changed);
  if (changed.reportSha256 === report.reportSha256) {
    changed.reportSha256 = reportDigest(changed);
  }
  assert.throws(() => validateCanaryReport(changed, plan));
}

function selfTest(plan) {
  const result = validateCanaryPlan(plan);
  const cases = [
    (value) => (value.schema = "starfiniti.proxmox-package-canary.v2"),
    (value) => (value.status = "verified"),
    (value) => (value.baseImage = "debian:latest"),
    (value) => (value.architecture = "arm64"),
    (value) => (value.candidate.path = "STATUS.md"),
    (value) => (value.candidate.fileSha256 = "a".repeat(64)),
    (value) => (value.candidate.provenanceSha256 = "b".repeat(64)),
    (value) => (value.execution.environment = "production"),
    (value) => (value.execution.maximumDurationSeconds += 1),
    (value) => (value.execution.maximumPackageBytes = 1),
    (value) => (value.execution.maximumTransientBytes = 1),
    (value) => value.execution.requiredOfficialHosts.pop(),
    (value) => value.execution.requiredOfficialHosts.reverse(),
    (value) => (value.execution.productionCredentials = "allowed"),
    (value) => (value.execution.productionRouteInput = "allowed"),
    (value) => (value.execution.packageInstallation = "allowed"),
    (value) => (value.execution.packageBytesRetained = true),
    (value) => (value.execution.productionMutation = true),
    (value) => (value.trustAnchors.debian.path = "/tmp/keyring.gpg"),
    (value) => (value.trustAnchors.proxmox.url = "https://example.com/key.gpg"),
    (value) => (value.trustAnchors.proxmox.sha256 = "0".repeat(64)),
    (value) => (value.trustAnchors.proxmox.releaseFingerprint = "A".repeat(40)),
    (value) => value.repositories.pop(),
    (value) => value.repositories.reverse(),
    (value) =>
      (value.repositories[0].repositoryUri = "https://mirror.example.com"),
    (value) => (value.repositories[0].suite = "sid"),
    (value) => (value.repositories[0].component = "contrib"),
    (value) => (value.repositories[0].listToken = "../../etc/passwd"),
    (value) =>
      (value.repositories[0].observationInReleaseSha256 = "c".repeat(64)),
    (value) =>
      (value.repositories[0].observationPackagesSha256 = "d".repeat(64)),
    (value) => (value.repositories[4].productionRecommended = true),
    (value) => (value.repositories[4].subscriptionDecisionRequired = false),
    (value) => (value.gates.candidatePackageBytesVerified = true),
    (value) => (value.gates.repositoryToolSignatureReverified = true),
    (value) => (value.gates.compatibilityProved = true),
    (value) => (value.gates.productionMutation = true),
  ];
  for (const mutate of cases) expectFailure(plan, mutate);
  const report = reportFixture(plan, result);
  validateCanaryReport(report, plan, { expectedCommit: "a".repeat(40) });
  const reportCases = [
    (value) => (value.schema = "starfiniti.proxmox-package-canary.v2"),
    (value) => (value.generatedAt = "2026-08-28T22:00:00Z"),
    (value) => (value.candidate.fileSha256 = "3".repeat(64)),
    (value) => (value.canary.commit = "not-a-commit"),
    (value) => (value.canary.runnerEnvironment = "self-hosted"),
    (value) => (value.canary.network = "host"),
    (value) => (value.canary.hostNetwork = true),
    (value) => (value.canary.publishedPorts = 1),
    (value) => (value.trustAnchors.debian.keyringSha256 = "0".repeat(64)),
    (value) => (value.trustAnchors.proxmox.sha256 = "4".repeat(64)),
    (value) => value.repositories.pop(),
    (value) => (value.repositories[0].signatureVerified = false),
    (value) => (value.repositories[0].signedIndexBound = false),
    (value) => (value.repositories[0].inReleaseSha256 = "5".repeat(64)),
    (value) => value.packages.pop(),
    (value) => (value.packages[0].size += 1),
    (value) => (value.packages[0].signedMetadataVerified = false),
    (value) => (value.packages[0].exactUrlVerified = false),
    (value) => (value.packages[0].packageFieldsVerified = false),
    (value) => (value.packages[0].packageBytesRetained = true),
    (value) => (value.summary.dpkgStatusAfterSha256 = "6".repeat(64)),
    (value) => (value.summary.candidatePackageInstallationOccurred = true),
    (value) => (value.summary.productionCredentialsProvided = true),
    (value) => (value.summary.productionRouteInputProvided = true),
    (value) => (value.summary.productionMutation = true),
    (value) => (value.summary.teardownPassed = false),
    (value) => (value.gates.compatibilityProved = true),
    (value) => (value.gates.productionMutation = true),
    (value) => (value.reportSha256 = "7".repeat(64)),
  ];
  for (const mutate of reportCases) {
    expectReportFailure(report, plan, mutate);
  }
  process.stdout.write(
    `Validated the ${result.repositoryCount}-repository, ${result.packageCount}-package, ${result.packageBytes}-byte disposable Proxmox provenance canary, ${cases.length} plan corruptions, and ${reportCases.length} report corruptions; every production authority gate remains false.\n`,
  );
}

if (
  resolve(process.argv[1] ?? "") === resolve(fileURLToPath(import.meta.url))
) {
  const plan = YAML.parse(readFileSync(planPath, "utf8"));
  if (process.argv.includes("--self-test")) {
    selfTest(plan);
  } else if (process.argv.includes("--print-digest")) {
    process.stdout.write(`${validateCanaryPlan(plan).planDigest}\n`);
  } else if (process.argv.includes("--verify-report")) {
    const index = process.argv.indexOf("--verify-report");
    const reportPath = process.argv[index + 1];
    if (!reportPath || reportPath.startsWith("--")) {
      fail("--verify-report requires a path");
    }
    const report = JSON.parse(
      readStableBytes(
        resolve(reportPath),
        512 * 1024,
        "canary report",
      ).toString("utf8"),
    );
    const result = validateCanaryReport(report, plan);
    process.stdout.write(
      `Verified ${result.packageCount} package facts from ${result.repositoryCount} signed repositories under report ${result.reportSha256}.\n`,
    );
  } else {
    fail("usage: --self-test | --print-digest | --verify-report <path>");
  }
}
