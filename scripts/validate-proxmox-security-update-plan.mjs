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
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const planPath = join(
  root,
  "infrastructure/governance/proxmox-security-update-plan.yaml",
);
const digestPattern = /^[0-9a-f]{64}$/u;
const safeVersionPattern = /^[0-9][0-9A-Za-z.+:~_-]{0,79}$/u;
const safeIdPattern = /^[a-z0-9][a-z0-9.-]{0,79}$/u;
const exactRepositoryIds = [
  "debian-trixie",
  "debian-trixie-backports",
  "debian-trixie-updates",
  "debian-trixie-security",
  "proxmox-trixie-no-subscription",
];
const exactRepairIds = [
  "base-files",
  "pve-qemu-kvm",
  "libpve-storage-perl",
  "qemu-server",
  "pve-manager",
  "libpve-common-perl",
  "pve-container",
  "pve-ha-manager",
  "proxmox-mini-journalreader",
  "proxmox-widget-toolkit",
  "proxmox-kernel-7.0.14-14-pve-signed",
  "proxmox-kernel-7.0",
];
const exactRetainedIds = [
  "rsync",
  "borgbackup",
  "openssh-client",
  "openssh-server",
];
const exactAdvisoryIds = [
  "PSA-2026-00037-1",
  "PSA-2026-00038-1",
  "PSA-2026-00039-1",
  "PSA-2026-00040-1",
  "PSA-2026-00042-1",
];
const criticalCandidates = new Map([
  ["proxmox-kernel-7.0", "7.0.14-14"],
  ["qemu-server", "9.2.7"],
  ["pve-container", "6.1.13"],
  ["pve-manager", "9.2.11"],
]);
const exactBindingPaths = {
  providerSnapshot:
    "docs/plan/evidence/M16/runs/provider-source-snapshot-257e99c-2026-08-28T212100Z.json",
  installedSnapshot:
    "docs/plan/evidence/M16/runs/recovery-dependency-snapshot-c5678b6-2026-08-28T221524Z.json",
};
const exactCandidateProvenance =
  "39f30c67a374b041944a598ce2334fed3fcb8e5f64264b3db08847d5ee23ff9f";

function fail(message) {
  throw new Error(`Proxmox security update plan invalid: ${message}`);
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

function exactUtc(value, label) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    fail(`${label} must be canonical UTC`);
  }
  return Date.parse(value);
}

function orderedIds(items, expected, label) {
  if (!Array.isArray(items) || items.length !== expected.length) {
    fail(`${label} count differs`);
  }
  const ids = items.map((item) => item?.id);
  if (ids.some((id, index) => id !== expected[index])) {
    fail(`${label} order or identity differs`);
  }
  if (new Set(ids).size !== ids.length) fail(`${label} contains duplicates`);
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

function readBoundArtifact(relativePath, expectedDigest, label) {
  if (relativePath !== exactBindingPaths[label]) {
    fail(`${label} path differs`);
  }
  const absolutePath = join(root, ...relativePath.split("/"));
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
      beforeDescriptor.size > 256 * 1024
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
    if (sha256(bytes) !== expectedDigest) {
      fail(`${label} bytes differ from the bound digest`);
    }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function validatePackage(item, repositoryIds, allowNullInstalled) {
  exactKeys(
    item,
    [
      "id",
      "sourceId",
      "installedVersion",
      "candidateVersion",
      "architecture",
      "action",
      "filename",
      "size",
      "sha256",
    ],
    `${item?.id ?? "unknown"} repair package`,
  );
  if (!safeIdPattern.test(item.id ?? "") || !repositoryIds.has(item.sourceId)) {
    fail(`${item.id} package identity or source differs`);
  }
  if (
    (!allowNullInstalled || item.installedVersion !== null) &&
    !safeVersionPattern.test(item.installedVersion ?? "")
  ) {
    fail(`${item.id} installed version is invalid`);
  }
  if (
    !safeVersionPattern.test(item.candidateVersion ?? "") ||
    !["install", "upgrade"].includes(item.action) ||
    (item.action === "install") !== (item.installedVersion === null) ||
    !["all", "amd64"].includes(item.architecture) ||
    typeof item.filename !== "string" ||
    item.filename.length < 15 ||
    item.filename.length > 240 ||
    item.filename.startsWith("/") ||
    item.filename.includes("..") ||
    item.filename.includes("\\") ||
    !Number.isInteger(item.size) ||
    item.size < 1 ||
    item.size > 192 * 1024 * 1024
  ) {
    fail(`${item.id} package metadata differs`);
  }
  exactDigest(item.sha256, `${item.id} package digest`);
}

export function candidateProvenance(plan) {
  const subject = {
    schema: plan.schema,
    observedAt: plan.observedAt,
    endpointId: plan.endpointId,
    sourceBindings: plan.sourceBindings,
    aptObservation: plan.aptObservation,
    repairSet: plan.repairSet,
    advisories: plan.advisories,
    gates: plan.gates,
  };
  return sha256(JSON.stringify(canonical(subject)));
}

export function validatePlan(plan, { allowPlaceholder = false } = {}) {
  exactKeys(
    plan,
    [
      "schema",
      "version",
      "status",
      "observedAt",
      "endpointId",
      "sourceBindings",
      "aptObservation",
      "repairSet",
      "advisories",
      "gates",
      "candidateProvenanceSha256",
    ],
    "plan",
  );
  if (
    plan.schema !== "starfiniti.proxmox-security-update-plan.v1" ||
    plan.version !== 1 ||
    plan.status !== "blocked_external" ||
    plan.endpointId !== "proxmox-host"
  ) {
    fail("plan identity differs");
  }
  const observedAt = exactUtc(plan.observedAt, "observedAt");
  if (observedAt < Date.parse("2026-08-17T00:00:00Z")) {
    fail("observation predates the latest bound advisory");
  }

  exactKeys(
    plan.sourceBindings,
    ["providerSnapshot", "installedSnapshot"],
    "source bindings",
  );
  for (const label of ["providerSnapshot", "installedSnapshot"]) {
    const binding = plan.sourceBindings[label];
    exactKeys(binding, ["path", "sha256"], `${label} binding`);
    exactDigest(binding.sha256, `${label} digest`);
    readBoundArtifact(binding.path, binding.sha256, label);
  }

  exactKeys(
    plan.aptObservation,
    [
      "captureMethod",
      "trustBoundary",
      "repositoryToolSignatureReverified",
      "productionMutation",
      "repositories",
    ],
    "APT observation",
  );
  if (
    plan.aptObservation.captureMethod !==
      "approved-read-only-apt-cache-and-simulation" ||
    plan.aptObservation.trustBoundary !== "endpoint-apt-verified-metadata" ||
    plan.aptObservation.repositoryToolSignatureReverified !== false ||
    plan.aptObservation.productionMutation !== false
  ) {
    fail("APT observation authority differs");
  }
  orderedIds(
    plan.aptObservation.repositories,
    exactRepositoryIds,
    "APT repositories",
  );
  for (const repository of plan.aptObservation.repositories) {
    const proxmox = repository.id === "proxmox-trixie-no-subscription";
    exactKeys(
      repository,
      proxmox
        ? [
            "id",
            "inReleaseSha256",
            "packagesSha256",
            "productionRecommended",
            "subscriptionDecisionRequired",
          ]
        : ["id", "inReleaseSha256", "packagesSha256"],
      `${repository.id} repository`,
    );
    exactDigest(repository.inReleaseSha256, `${repository.id} InRelease`);
    exactDigest(repository.packagesSha256, `${repository.id} Packages`);
    if (
      proxmox &&
      (repository.productionRecommended !== false ||
        repository.subscriptionDecisionRequired !== true)
    ) {
      fail("no-subscription production limitation is hidden");
    }
  }

  exactKeys(
    plan.repairSet,
    ["strategy", "removals", "packages", "retainedBoundaryPackages"],
    "repair set",
  );
  if (
    plan.repairSet.strategy !== "exact-security-minimum-superset" ||
    !Array.isArray(plan.repairSet.removals) ||
    plan.repairSet.removals.length !== 0
  ) {
    fail("repair strategy or removals differ");
  }
  orderedIds(plan.repairSet.packages, exactRepairIds, "repair packages");
  const repositoryIds = new Set(exactRepositoryIds);
  for (const item of plan.repairSet.packages) {
    validatePackage(
      item,
      repositoryIds,
      item.id === "proxmox-kernel-7.0.14-14-pve-signed",
    );
  }
  const packages = new Map(
    plan.repairSet.packages.map((item) => [item.id, item]),
  );
  for (const [id, expectedCandidate] of criticalCandidates) {
    if (
      packages.get(id)?.candidateVersion !== expectedCandidate ||
      packages.get(id)?.installedVersion === expectedCandidate
    ) {
      fail(`${id} current/candidate security boundary differs`);
    }
  }
  const totalBytes = plan.repairSet.packages.reduce(
    (total, item) => total + item.size,
    0,
  );
  if (totalBytes < 128 * 1024 * 1024 || totalBytes > 192 * 1024 * 1024) {
    fail("repair package byte envelope differs");
  }

  orderedIds(
    plan.repairSet.retainedBoundaryPackages,
    exactRetainedIds,
    "retained boundary packages",
  );
  for (const item of plan.repairSet.retainedBoundaryPackages) {
    exactKeys(
      item,
      ["id", "version", "architecture", "sha256"],
      `${item.id} retained package`,
    );
    if (
      !safeVersionPattern.test(item.version ?? "") ||
      item.architecture !== "amd64"
    ) {
      fail(`${item.id} retained package metadata differs`);
    }
    exactDigest(item.sha256, `${item.id} retained package digest`);
  }

  orderedIds(plan.advisories, exactAdvisoryIds, "advisories");
  for (const advisory of plan.advisories) {
    exactKeys(advisory, ["id", "publishedAt", "url", "fixes"], advisory.id);
    const publishedAt = exactUtc(
      advisory.publishedAt,
      `${advisory.id} publishedAt`,
    );
    if (publishedAt > observedAt) fail(`${advisory.id} postdates observation`);
    let parsed;
    try {
      parsed = new URL(advisory.url);
    } catch {
      fail(`${advisory.id} URL is invalid`);
    }
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname !== "forum.proxmox.com" ||
      !/^\/threads\/proxmox-virtual-environment-security-advisories\.149331\/post-\d+$/u.test(
        parsed.pathname,
      ) ||
      parsed.search ||
      parsed.hash ||
      !Array.isArray(advisory.fixes) ||
      advisory.fixes.length < 1 ||
      advisory.fixes.length > 2
    ) {
      fail(`${advisory.id} source or fixes differ`);
    }
    for (const fix of advisory.fixes) {
      exactKeys(
        fix,
        ["packageId", "minimumVersion", "candidateVersion"],
        `${advisory.id} fix`,
      );
      const candidate = packages.get(fix.packageId);
      if (
        !candidate ||
        !safeVersionPattern.test(fix.minimumVersion ?? "") ||
        fix.candidateVersion !== candidate.candidateVersion
      ) {
        fail(`${advisory.id} candidate fix is unbound`);
      }
    }
  }

  exactKeys(
    plan.gates,
    [
      "candidateMetadataComplete",
      "candidatePackageBytesVerified",
      "repositoryToolSignatureReverified",
      "currentClosesKnownAdvisories",
      "candidateClosesKnownAdvisories",
      "compatibilityProved",
      "rollbackEscrowComplete",
      "recoveryReady",
      "maintenanceApproved",
      "rebootApproved",
      "productionMutation",
    ],
    "gates",
  );
  const expectedGates = {
    candidateMetadataComplete: true,
    candidatePackageBytesVerified: false,
    repositoryToolSignatureReverified: false,
    currentClosesKnownAdvisories: false,
    candidateClosesKnownAdvisories: true,
    compatibilityProved: false,
    rollbackEscrowComplete: false,
    recoveryReady: false,
    maintenanceApproved: false,
    rebootApproved: false,
    productionMutation: false,
  };
  for (const [key, expected] of Object.entries(expectedGates)) {
    if (plan.gates[key] !== expected) fail(`${key} gate differs`);
  }

  const calculated = candidateProvenance(plan);
  if (
    calculated !== exactCandidateProvenance ||
    (!allowPlaceholder &&
      (plan.candidateProvenanceSha256 !== calculated ||
        /^0{64}$/u.test(plan.candidateProvenanceSha256)))
  ) {
    fail("candidate provenance digest differs");
  }
  return {
    repositoryCount: plan.aptObservation.repositories.length,
    packageCount: plan.repairSet.packages.length,
    retainedCount: plan.repairSet.retainedBoundaryPackages.length,
    advisoryCount: plan.advisories.length,
    candidateProvenanceSha256: calculated,
  };
}

function clone(value) {
  return structuredClone(value);
}

function expectFailure(plan, mutate) {
  const changed = clone(plan);
  mutate(changed);
  assert.throws(() => validatePlan(changed));
}

function selfTest(plan) {
  const result = validatePlan(plan);
  const cases = [
    (value) => value.advisories.pop(),
    (value) => (value.advisories[0].id = "PSA-2026-99999-1"),
    (value) => (value.advisories[0].url = "https://example.com/advisory"),
    (value) => (value.advisories[0].publishedAt = "2026-08-11T00:00:00Z"),
    (value) => (value.advisories[0].fixes[0].minimumVersion = "7.0.14-9"),
    (value) => (value.advisories[0].fixes[0].candidateVersion = "7.0.14-10"),
    (value) => value.aptObservation.repositories.pop(),
    (value) =>
      (value.aptObservation.repositories[0].inReleaseSha256 = "0".repeat(64)),
    (value) =>
      (value.aptObservation.repositories[0].packagesSha256 = "a".repeat(64)),
    (value) =>
      (value.aptObservation.repositories[4].productionRecommended = true),
    (value) =>
      (value.aptObservation.repositories[4].subscriptionDecisionRequired = false),
    (value) => (value.aptObservation.repositoryToolSignatureReverified = true),
    (value) => (value.aptObservation.productionMutation = true),
    (value) => value.repairSet.packages.pop(),
    (value) => value.repairSet.packages.reverse(),
    (value) => (value.repairSet.packages[4].candidateVersion = "9.2.7"),
    (value) =>
      (value.repairSet.packages[4].filename = "pool/forged-package.deb"),
    (value) => (value.repairSet.packages[4].size += 1),
    (value) => (value.repairSet.packages[4].sha256 = "0".repeat(64)),
    (value) => value.repairSet.removals.push("proxmox-kernel-7.0"),
    (value) => value.repairSet.retainedBoundaryPackages.pop(),
    (value) =>
      (value.repairSet.retainedBoundaryPackages[0].sha256 = "b".repeat(64)),
    (value) => (value.gates.candidatePackageBytesVerified = true),
    (value) => (value.gates.currentClosesKnownAdvisories = true),
    (value) => (value.gates.compatibilityProved = true),
    (value) => (value.gates.maintenanceApproved = true),
    (value) => (value.gates.rebootApproved = true),
    (value) => (value.gates.productionMutation = true),
    (value) => (value.candidateProvenanceSha256 = "f".repeat(64)),
    (value) => (value.sourceBindings.providerSnapshot.sha256 = "a".repeat(64)),
    (value) => (value.sourceBindings.installedSnapshot.path = "STATUS.md"),
  ];
  for (const mutate of cases) expectFailure(plan, mutate);
  process.stdout.write(
    `Validated ${result.advisoryCount} Proxmox advisories, ${result.packageCount} exact repair packages, ${result.retainedCount} retained recovery packages, and ${cases.length} adversarial cases; production mutation remains false.\n`,
  );
}

const plan = YAML.parse(readFileSync(planPath, "utf8"));
if (process.argv.includes("--print-provenance")) {
  const result = validatePlan(plan, { allowPlaceholder: true });
  process.stdout.write(`${result.candidateProvenanceSha256}\n`);
} else if (process.argv.includes("--self-test")) {
  selfTest(plan);
} else {
  fail("usage: --self-test | --print-provenance");
}
