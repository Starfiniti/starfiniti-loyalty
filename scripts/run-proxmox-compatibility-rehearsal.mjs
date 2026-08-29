import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readSync,
  realpathSync,
  rmSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

import {
  candidateProvenance,
  validatePlan as validateCandidatePlan,
} from "./validate-proxmox-security-update-plan.mjs";
import {
  validateCanaryPlan,
  validateCanaryReport,
} from "./validate-proxmox-security-package-canary.mjs";
import {
  validatePreflightPlan,
  validateReport as validatePreflightReport,
} from "./validate-proxmox-security-preflight.mjs";
import {
  validateFacts as validateInventoryFacts,
  validatePlan as validateInventoryPlan,
  validateReport as validateInventoryReport,
} from "./validate-proxmox-compatibility-inventory.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const planRelative =
  "infrastructure/testing/proxmox-compatibility-rehearsal/plan.yaml";
const planPath = join(root, ...planRelative.split("/"));
const candidateRelative =
  "infrastructure/governance/proxmox-security-update-plan.yaml";
const packagePlanRelative =
  "infrastructure/testing/proxmox-security-packages/plan.yaml";
const preflightPlanRelative =
  "infrastructure/testing/proxmox-security-preflight/plan.yaml";
const inventoryPlanRelative =
  "infrastructure/testing/proxmox-compatibility-inventory/plan.yaml";
const supabaseCompatibilityRelative =
  "infrastructure/environments/proxmox/supabase-compatibility.json";

const exactCandidateFileSha256 =
  "ec010eb667d6166ee5adc0ee0cd2d6ecdf5b2a114e345b018b51c704d64df075";
const exactCandidateProvenance =
  "39f30c67a374b041944a598ce2334fed3fcb8e5f64264b3db08847d5ee23ff9f";
const exactPackageEvidenceFileSha256 =
  "3eec19512a6b2535cf0c6359144c1807b78e01015f43c470ad53335c6eb1090e";
const exactPackageEvidenceReportSha256 =
  "0b703cc553f2304de75f28160e7482b09718794205efa7615fb39f2eab0f0382";
const exactPreflightEvidenceFileSha256 =
  "b18037b19263020fabce46c2b6b13ec69b640775d2747dae474521191cba8a85";
const exactPreflightEvidenceReportSha256 =
  "898d10bde0e5dd1103dfd8838f19febff3e781ac95ecf305d4767eadf20a110a";
const exactInventoryPlanFileSha256 =
  "19232bf6eaf0463c26aae96e30f767f8983b92e99171efa2f5b0c9929561b081";
const exactInventoryEvidenceFileSha256 =
  "f6af50f506044e7578dcd02f800c1c71680e322460bf81cf4faa705b0ff5e25f";
const exactInventoryEvidenceReportSha256 =
  "495d7960a59359794fdb5024171c2e2de66cf69fc7b6701447ae285b46ee376f";
const exactInventoryProjectionSha256 =
  "e5b11768254534c2f4bd18a2734b78c5c2a63250d32c7715b86dd18c7b3689de";
const exactSupabaseCompatibilitySha256 =
  "1add7b7e0df5580ea36e032f26849515fdbbb2e960247013ab72fb1cbaa0ac1a";

const digestPattern = /^[0-9a-f]{64}$/u;
const commitPattern = /^[0-9a-f]{40}$/u;
const utcPattern =
  /^20[0-9]{2}-[01][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9](?:\.[0-9]{3})?Z$/u;
const opaqueIdPattern = /^rehearsal-[a-z0-9][a-z0-9-]{7,63}$/u;
const approvalPattern = /^[A-Z0-9][A-Z0-9-]{7,79}$/u;

const exactStageDefinitions = [
  ["inspect_isolation", "inspect_isolated_equivalent_host_v1"],
  ["verify_candidate_bytes", "verify_prestaged_candidate_v1"],
  ["install_candidate", "install_exact_candidate_v1"],
  ["reboot_candidate_host", "reboot_isolated_candidate_v1"],
  ["verify_host_boot", "verify_candidate_host_boot_v1"],
  ["verify_management_services", "verify_management_services_v1"],
  ["verify_storage_profiles", "verify_storage_profiles_v1"],
  ["verify_qemu_profiles", "verify_qemu_profiles_v1"],
  ["verify_lxc_profiles", "verify_lxc_profiles_v1"],
  ["restore_critical_workload_clones", "restore_critical_workload_clones_v1"],
  ["verify_critical_workload_clones", "verify_critical_workload_clones_v1"],
  ["reconcile_rehearsal", "reconcile_rehearsal_v1"],
  ["destroy_rehearsal", "destroy_isolated_rehearsal_v1"],
];
const exactRehearsalRows = [
  "candidate-host-boot",
  "qemu-profiles",
  "lxc-profiles",
  "storage-profiles",
  "management-services",
  "critical-workload-clones",
];
const exactGateKeys = [
  "candidatePackageBytesVerified",
  "repositoryToolSignatureReverified",
  "candidateDependencySimulationReverified",
  "installedStartingStateReverified",
  "consumerInventoryCaptured",
  "rehearsalExecuted",
  "independentReviewApproved",
  "compatibilityProved",
  "rollbackEscrowComplete",
  "recoveryReady",
  "repositoryPolicyApproved",
  "maintenanceApproved",
  "installationApproved",
  "rebootApproved",
  "productionMutation",
];

function fail(message) {
  throw new Error("Proxmox compatibility rehearsal invalid: " + message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  return (
    "{" +
    Object.keys(value)
      .sort()
      .map((key) => JSON.stringify(key) + ":" + canonical(value[key]))
      .join(",") +
    "}"
  );
}

export function documentDigest(value) {
  return sha256(canonical(value));
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(label + " must be an object");
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(label + " fields differ");
  }
}

function exactUtc(value, label) {
  if (typeof value !== "string" || !utcPattern.test(value)) {
    fail(label + " is not an exact UTC instant");
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) fail(label + " is invalid");
  return timestamp;
}

function boundedInteger(value, minimum, maximum, label) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(label + " is outside the integer bound");
  }
}

function readRegular(path, maximumBytes, label, ownerOnly = false) {
  let descriptor;
  try {
    descriptor = openSync(
      path,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
  } catch {
    fail(label + " cannot be opened as a regular file");
  }
  try {
    const before = fstatSync(descriptor);
    const metadata = lstatSync(path, { throwIfNoEntry: false });
    if (
      !before.isFile() ||
      before.size < 1 ||
      before.size > maximumBytes ||
      !metadata?.isFile() ||
      metadata.isSymbolicLink() ||
      before.dev !== metadata.dev ||
      before.ino !== metadata.ino ||
      before.size !== metadata.size ||
      before.mtimeMs !== metadata.mtimeMs
    ) {
      fail(label + " path identity changed before reading");
    }
    if (
      ownerOnly &&
      process.platform !== "win32" &&
      ((before.mode & 0o077) !== 0 || before.uid !== process.getuid())
    ) {
      fail(label + " must be owned by the caller and mode 0600");
    }
    const bytes = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(
        descriptor,
        bytes,
        offset,
        bytes.length - offset,
        null,
      );
      if (count === 0) fail(label + " ended early");
      offset += count;
    }
    const after = fstatSync(descriptor);
    const afterPath = lstatSync(path, { throwIfNoEntry: false });
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      !afterPath?.isFile() ||
      afterPath.isSymbolicLink() ||
      metadata.dev !== afterPath.dev ||
      metadata.ino !== afterPath.ino ||
      metadata.size !== afterPath.size ||
      metadata.mtimeMs !== afterPath.mtimeMs
    ) {
      fail(label + " changed while reading");
    }
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}

function parseYaml(path, maximumBytes, label, ownerOnly = false) {
  const bytes = readRegular(path, maximumBytes, label, ownerOnly);
  try {
    return { bytes, value: YAML.parse(bytes.toString("utf8")) };
  } catch {
    fail(label + " YAML is invalid");
  }
}

function parseJson(path, maximumBytes, label, ownerOnly = false) {
  const bytes = readRegular(path, maximumBytes, label, ownerOnly);
  try {
    return { bytes, value: JSON.parse(bytes.toString("utf8")) };
  } catch {
    fail(label + " JSON is invalid");
  }
}

function parseJsonBytes(bytes, label) {
  if (bytes.includes(0)) fail(label + " contains a NUL byte");
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    fail(label + " JSON is invalid");
  }
}

function safeRelativePath(value, expected, label) {
  if (value !== expected || value.includes("\\") || value.includes("..")) {
    fail(label + " path differs");
  }
}

function absoluteRepositoryPath(relativePath) {
  return join(root, ...relativePath.split("/"));
}

function loadBoundYaml(binding, expectedPath, expectedSha256, label) {
  exactKeys(binding, ["path", "fileSha256"], label + " binding");
  safeRelativePath(binding.path, expectedPath, label);
  if (binding.fileSha256 !== expectedSha256) {
    fail(label + " bound digest differs");
  }
  const parsed = parseYaml(
    absoluteRepositoryPath(expectedPath),
    512 * 1024,
    label,
  );
  if (sha256(parsed.bytes) !== expectedSha256) {
    fail(label + " bytes differ");
  }
  return parsed.value;
}

function loadBoundJson(
  binding,
  expectedPath,
  expectedFileSha256,
  expectedReportSha256,
  label,
  extraKeys = [],
) {
  exactKeys(
    binding,
    ["path", "fileSha256", "reportSha256", ...extraKeys],
    label + " binding",
  );
  safeRelativePath(binding.path, expectedPath, label);
  if (
    binding.fileSha256 !== expectedFileSha256 ||
    binding.reportSha256 !== expectedReportSha256
  ) {
    fail(label + " bound digest differs");
  }
  const parsed = parseJson(
    absoluteRepositoryPath(expectedPath),
    512 * 1024,
    label,
  );
  if (
    sha256(parsed.bytes) !== expectedFileSha256 ||
    parsed.value.reportSha256 !== expectedReportSha256
  ) {
    fail(label + " bytes or internal digest differ");
  }
  return parsed.value;
}

function validateProfileList(profiles, expectedType, expectedCount, label) {
  if (!Array.isArray(profiles) || profiles.length !== expectedCount) {
    fail(label + " count differs");
  }
  let previous = "";
  for (const [index, profile] of profiles.entries()) {
    exactKeys(profile, ["profileSha256", "sourceCount"], label + " " + index);
    if (
      !digestPattern.test(profile.profileSha256) ||
      profile.profileSha256 <= previous
    ) {
      fail(label + " ordering or digest differs");
    }
    boundedInteger(profile.sourceCount, 1, 32, label + " source count");
    previous = profile.profileSha256;
  }
  if (!["qemu", "lxc"].includes(expectedType)) {
    fail(label + " type is invalid");
  }
}

function validateSourceMatrix(matrix, plan, inventoryReport, inventoryPlan) {
  exactKeys(
    matrix,
    [
      "qemuProfiles",
      "lxcProfiles",
      "storageProfiles",
      "requiredServices",
      "criticalWorkloads",
      "rehearsalRows",
    ],
    "source matrix",
  );
  validateProfileList(
    matrix.qemuProfiles,
    "qemu",
    plan.objectives.qemuProfileCount,
    "QEMU profiles",
  );
  validateProfileList(
    matrix.lxcProfiles,
    "lxc",
    plan.objectives.lxcProfileCount,
    "LXC profiles",
  );
  const expectedQemu = inventoryReport.endpoint.guestProfiles
    .filter((profile) => profile.type === "qemu")
    .map((profile) => ({
      profileSha256: profile.profileSha256,
      sourceCount: profile.count,
    }));
  const expectedLxc = inventoryReport.endpoint.guestProfiles
    .filter((profile) => profile.type === "lxc")
    .map((profile) => ({
      profileSha256: profile.profileSha256,
      sourceCount: profile.count,
    }));
  assert.deepStrictEqual(matrix.qemuProfiles, expectedQemu);
  assert.deepStrictEqual(matrix.lxcProfiles, expectedLxc);

  if (
    !Array.isArray(matrix.storageProfiles) ||
    matrix.storageProfiles.length !== plan.objectives.storageProfileCount
  ) {
    fail("storage profile count differs");
  }
  const expectedStorage = inventoryReport.endpoint.storages.map((storage) => ({
    type: storage.type,
    content: storage.content,
  }));
  assert.deepStrictEqual(matrix.storageProfiles, expectedStorage);
  if (
    !Array.isArray(matrix.requiredServices) ||
    matrix.requiredServices.length !== plan.objectives.requiredServiceCount
  ) {
    fail("required service count differs");
  }
  assert.deepStrictEqual(
    matrix.requiredServices,
    inventoryReport.endpoint.services.map((service) => service.id),
  );
  if (
    !Array.isArray(matrix.criticalWorkloads) ||
    matrix.criticalWorkloads.length !== 2
  ) {
    fail("critical workload count differs");
  }
  assert.deepStrictEqual(
    matrix.criticalWorkloads,
    inventoryReport.endpoint.criticalWorkloads.map((workload) => ({
      id: workload.id,
      type: workload.type,
      profileSha256: workload.profileSha256,
    })),
  );
  assert.deepStrictEqual(matrix.rehearsalRows, exactRehearsalRows);
  assert.deepStrictEqual(
    inventoryPlan.rehearsalMatrix.map((row) => row.id),
    exactRehearsalRows,
  );
}

export function validateRehearsalPlan(plan) {
  exactKeys(
    plan,
    [
      "schema",
      "version",
      "status",
      "createdAt",
      "bindings",
      "objectives",
      "safety",
      "expectedCandidate",
      "criticalWorkloadRelease",
      "sourceMatrix",
      "stages",
      "gates",
    ],
    "plan",
  );
  if (
    plan.schema !== "starfiniti.proxmox-compatibility-rehearsal-plan.v1" ||
    plan.version !== 1 ||
    plan.status !== "candidate"
  ) {
    fail("plan identity differs");
  }
  exactUtc(plan.createdAt, "plan createdAt");
  exactKeys(
    plan.bindings,
    [
      "candidate",
      "packageEvidence",
      "preflightEvidence",
      "inventoryPlan",
      "inventoryEvidence",
    ],
    "plan bindings",
  );

  exactKeys(
    plan.bindings.candidate,
    ["path", "fileSha256", "provenanceSha256"],
    "candidate binding",
  );
  safeRelativePath(
    plan.bindings.candidate.path,
    candidateRelative,
    "candidate",
  );
  if (
    plan.bindings.candidate.fileSha256 !== exactCandidateFileSha256 ||
    plan.bindings.candidate.provenanceSha256 !== exactCandidateProvenance
  ) {
    fail("candidate binding differs");
  }
  const candidateParsed = parseYaml(
    absoluteRepositoryPath(candidateRelative),
    512 * 1024,
    "candidate plan",
  );
  if (sha256(candidateParsed.bytes) !== exactCandidateFileSha256) {
    fail("candidate plan bytes differ");
  }
  validateCandidatePlan(candidateParsed.value);
  if (candidateProvenance(candidateParsed.value) !== exactCandidateProvenance) {
    fail("candidate provenance differs");
  }

  const packageEvidenceRelative =
    "docs/plan/evidence/M16/runs/proxmox-security-package-canary-957e1de-2026-08-29T003101Z.json";
  const packageEvidence = loadBoundJson(
    plan.bindings.packageEvidence,
    packageEvidenceRelative,
    exactPackageEvidenceFileSha256,
    exactPackageEvidenceReportSha256,
    "package evidence",
  );
  const packagePlan = parseYaml(
    absoluteRepositoryPath(packagePlanRelative),
    512 * 1024,
    "package canary plan",
  ).value;
  validateCanaryPlan(packagePlan);
  validateCanaryReport(packageEvidence, packagePlan);

  const preflightEvidenceRelative =
    "docs/plan/evidence/M16/runs/proxmox-security-preflight-5659404-2026-08-29T013145Z.json";
  const preflightEvidence = loadBoundJson(
    plan.bindings.preflightEvidence,
    preflightEvidenceRelative,
    exactPreflightEvidenceFileSha256,
    exactPreflightEvidenceReportSha256,
    "preflight evidence",
  );
  const preflightPlan = parseYaml(
    absoluteRepositoryPath(preflightPlanRelative),
    512 * 1024,
    "preflight plan",
  ).value;
  const validatedPreflight = validatePreflightPlan(preflightPlan);
  validatePreflightReport(preflightEvidence, preflightPlan, validatedPreflight);

  const inventoryPlan = loadBoundYaml(
    plan.bindings.inventoryPlan,
    inventoryPlanRelative,
    exactInventoryPlanFileSha256,
    "inventory plan",
  );
  const validatedInventory = validateInventoryPlan(inventoryPlan);
  exactKeys(
    plan.bindings.inventoryEvidence,
    ["path", "fileSha256", "reportSha256", "projectionSha256"],
    "inventory evidence binding",
  );
  if (
    plan.bindings.inventoryEvidence.projectionSha256 !==
    exactInventoryProjectionSha256
  ) {
    fail("inventory projection binding differs");
  }
  const inventoryEvidenceRelative =
    "docs/plan/evidence/M16/runs/proxmox-compatibility-inventory-e7825b6-2026-08-29T023345Z.json";
  const inventoryEvidence = loadBoundJson(
    plan.bindings.inventoryEvidence,
    inventoryEvidenceRelative,
    exactInventoryEvidenceFileSha256,
    exactInventoryEvidenceReportSha256,
    "inventory evidence",
    ["projectionSha256"],
  );
  validateInventoryReport(inventoryEvidence, inventoryPlan, validatedInventory);
  if (
    inventoryEvidence.inventory.factProjectionSha256 !==
    exactInventoryProjectionSha256
  ) {
    fail("inventory report projection differs");
  }

  exactKeys(
    plan.objectives,
    [
      "maximumInventoryAgeSeconds",
      "maximumRunSeconds",
      "maximumStageSeconds",
      "maximumDriverOutputBytes",
      "maximumReportBytes",
      "qemuProfileCount",
      "lxcProfileCount",
      "storageProfileCount",
      "requiredServiceCount",
    ],
    "objectives",
  );
  const exactObjectives = {
    maximumInventoryAgeSeconds: 300,
    maximumRunSeconds: 14_400,
    maximumStageSeconds: 3_600,
    maximumDriverOutputBytes: 65_536,
    maximumReportBytes: 262_144,
    qemuProfileCount: 15,
    lxcProfileCount: 4,
    storageProfileCount: 2,
    requiredServiceCount: 9,
  };
  assert.deepStrictEqual(plan.objectives, exactObjectives);

  exactKeys(
    plan.safety,
    [
      "targetClass",
      "environmentMarker",
      "equivalentPhysicalBootRequired",
      "nestedOnlyAccepted",
      "syntheticProfileGuestsRequired",
      "criticalSourcesReadOnly",
      "publicIngressAllowed",
      "externalEgressAllowed",
      "productionRoutesAllowed",
      "productionCredentialsAllowed",
      "productionTargetAllowed",
      "candidatePackagesPreStaged",
      "destroyAfterRun",
      "outOfProcessExpiryRequired",
    ],
    "safety",
  );
  assert.deepStrictEqual(plan.safety, {
    targetClass: "isolated-equivalent-proxmox-host",
    environmentMarker: "starfiniti-proxmox-rehearsal-v1",
    equivalentPhysicalBootRequired: true,
    nestedOnlyAccepted: false,
    syntheticProfileGuestsRequired: true,
    criticalSourcesReadOnly: true,
    publicIngressAllowed: false,
    externalEgressAllowed: false,
    productionRoutesAllowed: false,
    productionCredentialsAllowed: false,
    productionTargetAllowed: false,
    candidatePackagesPreStaged: true,
    destroyAfterRun: true,
    outOfProcessExpiryRequired: true,
  });

  exactKeys(
    plan.expectedCandidate,
    [
      "architecture",
      "bootMode",
      "hardwareVirtualizationFlag",
      "candidateKernel",
      "priorKernel",
      "packageCount",
      "packageBytes",
      "removals",
      "downgrades",
      "packages",
    ],
    "expected candidate",
  );
  if (
    plan.expectedCandidate.architecture !== "x86_64" ||
    plan.expectedCandidate.bootMode !== "bios" ||
    plan.expectedCandidate.hardwareVirtualizationFlag !== "vmx" ||
    plan.expectedCandidate.candidateKernel !== "7.0.14-14-pve" ||
    plan.expectedCandidate.priorKernel !== "7.0.6-2-pve" ||
    plan.expectedCandidate.packageCount !== 12 ||
    plan.expectedCandidate.packageBytes !== 165_341_024 ||
    plan.expectedCandidate.removals !== 0 ||
    plan.expectedCandidate.downgrades !== 0
  ) {
    fail("expected candidate summary differs");
  }
  const expectedPackages = candidateParsed.value.repairSet.packages.map(
    (item) => ({
      id: item.id,
      version: item.candidateVersion,
      action: item.action,
    }),
  );
  assert.deepStrictEqual(plan.expectedCandidate.packages, expectedPackages);
  if (
    packageEvidence.summary.packageCount !== 12 ||
    packageEvidence.summary.packageBytes !== 165_341_024 ||
    preflightEvidence.summary.candidateActions !== 12 ||
    preflightEvidence.summary.removals !== 0 ||
    preflightEvidence.summary.downgrades !== 0
  ) {
    fail("bound evidence does not prove the candidate prerequisites");
  }

  exactKeys(
    plan.criticalWorkloadRelease,
    ["application", "supabase"],
    "critical workload release",
  );
  exactKeys(
    plan.criticalWorkloadRelease.application,
    ["release", "tagObjectSha", "commitSha"],
    "application release",
  );
  assert.deepStrictEqual(plan.criticalWorkloadRelease.application, {
    release: "v0.1.11",
    tagObjectSha: "ee11cca4e3af3a8a7cc7cf1df13ccf438a3c6efd",
    commitSha: "0ced4b666a55d836bd3d4927337fe057a71bb4ba",
  });
  exactKeys(
    plan.criticalWorkloadRelease.supabase,
    [
      "compatibilityPath",
      "compatibilitySha256",
      "releaseRef",
      "commitSha",
      "composeVariantSha256",
      "platform",
      "imageSetSha256",
    ],
    "Supabase release",
  );
  safeRelativePath(
    plan.criticalWorkloadRelease.supabase.compatibilityPath,
    supabaseCompatibilityRelative,
    "Supabase compatibility",
  );
  assert.deepStrictEqual(plan.criticalWorkloadRelease.supabase, {
    compatibilityPath: supabaseCompatibilityRelative,
    compatibilitySha256: exactSupabaseCompatibilitySha256,
    releaseRef: "self-hosted/v0.8.0",
    commitSha: "241bb11c0627f2981746d37033f57dbfa81d29b0",
    composeVariantSha256:
      "3c0cc8d931fba8e40923b1e05961d10692cbd7e7cb378d59cdb7f2b590ca4a55",
    platform: "linux/amd64",
    imageSetSha256:
      "51f16d49a921d60cc321658030d2edb14c1dec4211f0872764e815edfaa0abfd",
  });
  const supabaseParsed = parseJson(
    absoluteRepositoryPath(supabaseCompatibilityRelative),
    512 * 1024,
    "Supabase compatibility",
  );
  if (
    sha256(supabaseParsed.bytes) !== exactSupabaseCompatibilitySha256 ||
    supabaseParsed.value.upstream.releaseRef !==
      plan.criticalWorkloadRelease.supabase.releaseRef ||
    supabaseParsed.value.upstream.commitSha !==
      plan.criticalWorkloadRelease.supabase.commitSha ||
    supabaseParsed.value.approvedComposeVariants?.find(
      (item) => item.id === "asymmetric-jwks-enabled",
    )?.sha256 !== plan.criticalWorkloadRelease.supabase.composeVariantSha256 ||
    documentDigest(
      supabaseParsed.value.platformImageDigests?.[
        plan.criticalWorkloadRelease.supabase.platform
      ],
    ) !== plan.criticalWorkloadRelease.supabase.imageSetSha256
  ) {
    fail("critical Supabase release binding differs");
  }

  validateSourceMatrix(
    plan.sourceMatrix,
    plan,
    inventoryEvidence,
    inventoryPlan,
  );
  if (
    !Array.isArray(plan.stages) ||
    plan.stages.length !== exactStageDefinitions.length
  ) {
    fail("stage count differs");
  }
  plan.stages.forEach((stage, index) => {
    const cleanup = index === plan.stages.length - 1;
    exactKeys(
      stage,
      cleanup
        ? ["id", "adapter", "timeoutSeconds", "alwaysRun"]
        : ["id", "adapter", "timeoutSeconds"],
      "stage " + index,
    );
    if (
      stage.id !== exactStageDefinitions[index][0] ||
      stage.adapter !== exactStageDefinitions[index][1] ||
      (cleanup ? stage.alwaysRun !== true : "alwaysRun" in stage)
    ) {
      fail("stage " + index + " identity differs");
    }
    boundedInteger(
      stage.timeoutSeconds,
      1,
      plan.objectives.maximumStageSeconds,
      "stage timeout",
    );
  });

  exactKeys(plan.gates, exactGateKeys, "plan gates");
  for (const key of exactGateKeys.slice(0, 5)) {
    if (plan.gates[key] !== true) fail(key + " must remain passed");
  }
  for (const key of exactGateKeys.slice(5)) {
    if (plan.gates[key] !== false) fail(key + " must remain false");
  }
  return {
    planSha256: documentDigest(plan),
    candidateProvenanceSha256: exactCandidateProvenance,
    packageEvidenceReportSha256: exactPackageEvidenceReportSha256,
    preflightEvidenceReportSha256: exactPreflightEvidenceReportSha256,
    inventoryEvidenceReportSha256: exactInventoryEvidenceReportSha256,
    inventoryProjectionSha256: exactInventoryProjectionSha256,
    inventoryObservedAt: inventoryEvidence.generatedAt,
    sourceMatrixSha256: documentDigest(plan.sourceMatrix),
    criticalWorkloadReleaseSha256: documentDigest(plan.criticalWorkloadRelease),
    inventoryPlan,
    validatedInventoryPlan: validatedInventory,
    preflightPlan,
    validatedPreflight,
  };
}

function scanMinimized(value, label, path = "") {
  const forbiddenKeys = new Set([
    "hostname",
    "ip",
    "ipAddress",
    "mac",
    "macAddress",
    "username",
    "password",
    "secret",
    "token",
    "credential",
    "credentialValue",
    "keyPath",
    "vmid",
    "ctid",
    "storageId",
    "tenant",
    "customer",
    "raw",
    "rawOutput",
    "commandOutput",
  ]);
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      scanMinimized(item, label, path + "[" + index + "]"),
    );
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenKeys.has(key)) {
        fail(label + " contains forbidden field " + key);
      }
      scanMinimized(child, label, path ? path + "." + key : key);
    }
    return;
  }
  if (typeof value !== "string") return;
  if (
    /(?:^|[^0-9])(?:[0-9]{1,3}\.){3}[0-9]{1,3}(?:$|[^0-9])/u.test(value) ||
    /[A-Z]:\\/iu.test(value) ||
    /(?:ssh|file):\/\//iu.test(value) ||
    /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/u.test(value) ||
    value.includes("../") ||
    value.includes("/root/") ||
    value.includes("/home/")
  ) {
    fail(label + " contains a forbidden identifier or location");
  }
}

export function validateRehearsalInventory(
  inventory,
  plan,
  validatedPlan,
  now,
  options = {},
) {
  exactKeys(
    inventory,
    ["schema", "observedAt", "target", "candidate", "source"],
    "rehearsal inventory",
  );
  if (inventory.schema !== "starfiniti.proxmox-rehearsal-inventory.v1") {
    fail("rehearsal inventory identity differs");
  }
  const observedAt = exactUtc(inventory.observedAt, "inventory observedAt");
  exactKeys(
    inventory.target,
    [
      "class",
      "environmentId",
      "markerSha256",
      "architecture",
      "bootMode",
      "hardwareVirtualizationFlag",
      "cpuCount",
      "kvmDevicePresent",
      "iommuGroupCount",
      "physicalNetworkDeviceCount",
      "automaticDestroyAt",
      "nested",
      "disposable",
      "publicIngress",
      "externalEgress",
      "productionRouteCount",
      "productionCredentialCount",
    ],
    "rehearsal target",
  );
  if (
    inventory.target.class !== plan.safety.targetClass ||
    !opaqueIdPattern.test(inventory.target.environmentId) ||
    inventory.target.markerSha256 !== sha256(plan.safety.environmentMarker) ||
    inventory.target.architecture !== plan.expectedCandidate.architecture ||
    inventory.target.bootMode !== plan.expectedCandidate.bootMode ||
    inventory.target.hardwareVirtualizationFlag !==
      plan.expectedCandidate.hardwareVirtualizationFlag ||
    inventory.target.cpuCount !== 16 ||
    inventory.target.kvmDevicePresent !== true ||
    inventory.target.iommuGroupCount !== 11 ||
    inventory.target.physicalNetworkDeviceCount !== 1 ||
    exactUtc(
      inventory.target.automaticDestroyAt,
      "rehearsal target automaticDestroyAt",
    ) <= now ||
    Date.parse(inventory.target.automaticDestroyAt) >
      now +
        (plan.objectives.maximumRunSeconds +
          plan.stages.at(-1).timeoutSeconds) *
          1_000 ||
    inventory.target.nested !== false ||
    inventory.target.disposable !== true ||
    inventory.target.publicIngress !== false ||
    inventory.target.externalEgress !== false ||
    inventory.target.productionRouteCount !== 0 ||
    inventory.target.productionCredentialCount !== 0
  ) {
    fail("rehearsal target is not an isolated equivalent physical host");
  }
  exactKeys(
    inventory.candidate,
    [
      "candidateProvenanceSha256",
      "packageEvidenceReportSha256",
      "packageCount",
      "packageBytes",
      "packagesPreStaged",
      "packageSourceReadOnly",
    ],
    "rehearsal candidate",
  );
  if (
    inventory.candidate.candidateProvenanceSha256 !==
      validatedPlan.candidateProvenanceSha256 ||
    inventory.candidate.packageEvidenceReportSha256 !==
      validatedPlan.packageEvidenceReportSha256 ||
    inventory.candidate.packageCount !== plan.expectedCandidate.packageCount ||
    inventory.candidate.packageBytes !== plan.expectedCandidate.packageBytes ||
    inventory.candidate.packagesPreStaged !== true ||
    inventory.candidate.packageSourceReadOnly !== true
  ) {
    fail("rehearsal candidate staging differs");
  }
  exactKeys(
    inventory.source,
    [
      "inventoryReportSha256",
      "inventoryProjectionSha256",
      "inventoryObservedAt",
      "restrictedMappingSha256",
      "criticalRecoverySourceSha256",
      "applicationRelease",
      "applicationCommitSha",
      "supabaseCompatibilitySha256",
      "supabaseReleaseRef",
      "supabaseCommitSha",
      "supabaseComposeSha256",
      "supabaseImageSetSha256",
      "recoverySourceReadOnly",
      "qemuProfileCount",
      "lxcProfileCount",
      "storageProfileCount",
      "requiredServiceCount",
      "criticalWorkloadCount",
    ],
    "rehearsal source",
  );
  exactUtc(
    inventory.source.inventoryObservedAt,
    "baseline source inventory observedAt",
  );
  if (
    inventory.source.inventoryReportSha256 !==
      validatedPlan.inventoryEvidenceReportSha256 ||
    inventory.source.inventoryProjectionSha256 !==
      validatedPlan.inventoryProjectionSha256 ||
    inventory.source.inventoryObservedAt !==
      validatedPlan.inventoryObservedAt ||
    !digestPattern.test(inventory.source.restrictedMappingSha256) ||
    !digestPattern.test(inventory.source.criticalRecoverySourceSha256) ||
    inventory.source.applicationRelease !==
      plan.criticalWorkloadRelease.application.release ||
    inventory.source.applicationCommitSha !==
      plan.criticalWorkloadRelease.application.commitSha ||
    inventory.source.supabaseCompatibilitySha256 !==
      plan.criticalWorkloadRelease.supabase.compatibilitySha256 ||
    inventory.source.supabaseReleaseRef !==
      plan.criticalWorkloadRelease.supabase.releaseRef ||
    inventory.source.supabaseCommitSha !==
      plan.criticalWorkloadRelease.supabase.commitSha ||
    inventory.source.supabaseComposeSha256 !==
      plan.criticalWorkloadRelease.supabase.composeVariantSha256 ||
    inventory.source.supabaseImageSetSha256 !==
      plan.criticalWorkloadRelease.supabase.imageSetSha256 ||
    inventory.source.recoverySourceReadOnly !== true ||
    inventory.source.qemuProfileCount !== plan.objectives.qemuProfileCount ||
    inventory.source.lxcProfileCount !== plan.objectives.lxcProfileCount ||
    inventory.source.storageProfileCount !==
      plan.objectives.storageProfileCount ||
    inventory.source.requiredServiceCount !==
      plan.objectives.requiredServiceCount ||
    inventory.source.criticalWorkloadCount !== 2
  ) {
    fail("rehearsal source binding differs");
  }
  if (
    options.requireFresh !== false &&
    (now - observedAt < -30_000 ||
      now - observedAt > plan.objectives.maximumInventoryAgeSeconds * 1_000)
  ) {
    fail("rehearsal inventory or source inventory is stale");
  }
  scanMinimized(inventory, "rehearsal inventory");
  return {
    inventorySha256: documentDigest(inventory),
    environmentId: inventory.target.environmentId,
    markerSha256: inventory.target.markerSha256,
  };
}

export function validateFreshInventoryFacts(factsBytes, plan, validatedPlan) {
  if (!Buffer.isBuffer(factsBytes) || factsBytes.length > 65_536) {
    fail("fresh inventory facts exceed the byte bound");
  }
  const facts = parseJsonBytes(factsBytes, "fresh inventory facts");
  const result = validateInventoryFacts(
    facts,
    validatedPlan.inventoryPlan,
    validatedPlan.validatedInventoryPlan,
  );
  if (result.projectionSha256 !== validatedPlan.inventoryProjectionSha256) {
    fail("fresh inventory projection differs from the bound matrix");
  }
  return {
    observedAt: result.observedAt,
    projectionSha256: result.projectionSha256,
    factsSha256: sha256(factsBytes),
  };
}

function validateFreshEvidenceSummary(evidence, plan, validatedPlan, now) {
  exactKeys(
    evidence,
    ["observedAt", "projectionSha256", "factsSha256"],
    "fresh inventory evidence",
  );
  const observedAt = exactUtc(
    evidence.observedAt,
    "fresh inventory evidence observedAt",
  );
  if (
    evidence.projectionSha256 !== validatedPlan.inventoryProjectionSha256 ||
    !digestPattern.test(evidence.factsSha256) ||
    now - observedAt < -30_000 ||
    now - observedAt > plan.objectives.maximumInventoryAgeSeconds * 1_000
  ) {
    fail("fresh inventory evidence is stale or differs");
  }
  return evidence;
}

export function validateFreshPreflightReport(
  reportBytes,
  plan,
  validatedPlan,
  now = Date.now(),
) {
  if (!Buffer.isBuffer(reportBytes) || reportBytes.length > 256 * 1024) {
    fail("fresh preflight report exceeds the byte bound");
  }
  const report = parseJsonBytes(reportBytes, "fresh preflight report");
  const result = validatePreflightReport(
    report,
    validatedPlan.preflightPlan,
    validatedPlan.validatedPreflight,
  );
  const generatedAt = exactUtc(
    result.generatedAt,
    "fresh preflight generatedAt",
  );
  if (
    now - generatedAt < -30_000 ||
    now - generatedAt > plan.objectives.maximumInventoryAgeSeconds * 1_000
  ) {
    fail("fresh preflight report is stale");
  }
  return {
    observedAt: result.generatedAt,
    reportSha256: result.reportSha256,
    fileSha256: sha256(reportBytes),
  };
}

function validateFreshPreflightEvidenceSummary(evidence, plan, now) {
  exactKeys(
    evidence,
    ["observedAt", "reportSha256", "fileSha256"],
    "fresh preflight evidence",
  );
  const observedAt = exactUtc(
    evidence.observedAt,
    "fresh preflight evidence observedAt",
  );
  if (
    !digestPattern.test(evidence.reportSha256) ||
    !digestPattern.test(evidence.fileSha256) ||
    now - observedAt < -30_000 ||
    now - observedAt > plan.objectives.maximumInventoryAgeSeconds * 1_000
  ) {
    fail("fresh preflight evidence is stale or differs");
  }
  return evidence;
}

export function validateRehearsalControl(
  control,
  plan,
  inventory,
  validatedInventory,
  freshPreflightEvidence,
  now,
) {
  exactKeys(
    control,
    [
      "schema",
      "candidateCommit",
      "planSha256",
      "inventorySha256",
      "driverSha256",
      "freshPreflightFileSha256",
      "approval",
      "target",
    ],
    "rehearsal control",
  );
  if (
    control.schema !== "starfiniti.proxmox-rehearsal-control.v1" ||
    !commitPattern.test(control.candidateCommit) ||
    !digestPattern.test(control.planSha256) ||
    !digestPattern.test(control.inventorySha256) ||
    !digestPattern.test(control.driverSha256) ||
    !digestPattern.test(control.freshPreflightFileSha256)
  ) {
    fail("rehearsal control identity or digest differs");
  }
  exactKeys(
    control.approval,
    [
      "reference",
      "approvedAt",
      "expiresAt",
      "maximumRunSeconds",
      "productionMutationApproved",
    ],
    "rehearsal approval",
  );
  const approvedAt = exactUtc(control.approval.approvedAt, "approval start");
  const expiresAt = exactUtc(control.approval.expiresAt, "approval expiry");
  if (
    !approvalPattern.test(control.approval.reference) ||
    approvedAt > now ||
    expiresAt <= now ||
    control.approval.productionMutationApproved !== false
  ) {
    fail("rehearsal approval is absent, expired, or authorizes production");
  }
  boundedInteger(
    control.approval.maximumRunSeconds,
    1,
    plan.objectives.maximumRunSeconds,
    "approved maximum run",
  );
  if (now + control.approval.maximumRunSeconds * 1_000 > expiresAt) {
    fail("rehearsal approval lacks a complete run window");
  }
  exactKeys(
    control.target,
    ["environmentId", "markerSha256"],
    "approved target",
  );
  if (
    control.target.environmentId !== validatedInventory.environmentId ||
    control.target.markerSha256 !== validatedInventory.markerSha256 ||
    control.approval.expiresAt !== inventory.target.automaticDestroyAt ||
    control.freshPreflightFileSha256 !== freshPreflightEvidence.fileSha256 ||
    control.inventorySha256 !== validatedInventory.inventorySha256 ||
    control.planSha256 !== documentDigest(plan)
  ) {
    fail("rehearsal approval binding differs");
  }
  scanMinimized(control, "rehearsal control");
  return control;
}

function everyTrue(value, keys, label) {
  for (const key of keys) {
    if (value[key] !== true) fail(label + " " + key + " did not pass");
  }
}

function everyZero(value, keys, label) {
  for (const key of keys) {
    if (value[key] !== 0) fail(label + " " + key + " is not zero");
  }
}

function validateManagementObservations(observations, plan) {
  exactKeys(
    observations,
    [
      "services",
      "apiReady",
      "consoleReady",
      "authenticationReady",
      "statisticsReady",
      "schedulerReady",
      "haZeroResourceReady",
    ],
    "management observations",
  );
  everyTrue(
    observations,
    [
      "apiReady",
      "consoleReady",
      "authenticationReady",
      "statisticsReady",
      "schedulerReady",
      "haZeroResourceReady",
    ],
    "management",
  );
  if (
    !Array.isArray(observations.services) ||
    observations.services.length !== plan.objectives.requiredServiceCount
  ) {
    fail("management service coverage differs");
  }
  observations.services.forEach((service, index) => {
    exactKeys(
      service,
      ["id", "loaded", "active", "running", "enabled"],
      "management service " + index,
    );
    if (service.id !== plan.sourceMatrix.requiredServices[index]) {
      fail("management service order differs");
    }
    everyTrue(
      service,
      ["loaded", "active", "running", "enabled"],
      "management service " + index,
    );
  });
}

function validateStorageObservations(observations, plan) {
  exactKeys(observations, ["profiles"], "storage observations");
  if (
    !Array.isArray(observations.profiles) ||
    observations.profiles.length !== plan.objectives.storageProfileCount
  ) {
    fail("storage rehearsal coverage differs");
  }
  observations.profiles.forEach((profile, index) => {
    exactKeys(
      profile,
      [
        "type",
        "content",
        "created",
        "writePassed",
        "readPassed",
        "snapshotPassed",
        "backupPassed",
        "restorePassed",
        "destroyPassed",
        "capacityWithinBound",
      ],
      "storage rehearsal " + index,
    );
    if (
      canonical({ type: profile.type, content: profile.content }) !==
      canonical(plan.sourceMatrix.storageProfiles[index])
    ) {
      fail("storage rehearsal " + index + " identity differs");
    }
    everyTrue(
      profile,
      [
        "created",
        "writePassed",
        "readPassed",
        "snapshotPassed",
        "backupPassed",
        "restorePassed",
        "destroyPassed",
        "capacityWithinBound",
      ],
      "storage rehearsal " + index,
    );
  });
}

function validateQemuObservations(observations, plan) {
  exactKeys(observations, ["profiles"], "QEMU observations");
  if (
    !Array.isArray(observations.profiles) ||
    observations.profiles.length !== plan.objectives.qemuProfileCount
  ) {
    fail("QEMU rehearsal coverage differs");
  }
  observations.profiles.forEach((profile, index) => {
    exactKeys(
      profile,
      [
        "profileSha256",
        "sourceCount",
        "synthetic",
        "bootPassed",
        "diskIoPassed",
        "bridgePassed",
        "firewallContractPassed",
        "serialContractPassed",
        "guestAgentContractPassed",
        "shutdownPassed",
        "restartPassed",
        "noUnexpectedDifference",
      ],
      "QEMU rehearsal " + index,
    );
    if (
      canonical({
        profileSha256: profile.profileSha256,
        sourceCount: profile.sourceCount,
      }) !== canonical(plan.sourceMatrix.qemuProfiles[index])
    ) {
      fail("QEMU rehearsal " + index + " identity differs");
    }
    everyTrue(
      profile,
      [
        "synthetic",
        "bootPassed",
        "diskIoPassed",
        "bridgePassed",
        "firewallContractPassed",
        "serialContractPassed",
        "guestAgentContractPassed",
        "shutdownPassed",
        "restartPassed",
        "noUnexpectedDifference",
      ],
      "QEMU rehearsal " + index,
    );
  });
}

function validateLxcObservations(observations, plan) {
  exactKeys(observations, ["profiles"], "LXC observations");
  if (
    !Array.isArray(observations.profiles) ||
    observations.profiles.length !== plan.objectives.lxcProfileCount
  ) {
    fail("LXC rehearsal coverage differs");
  }
  observations.profiles.forEach((profile, index) => {
    exactKeys(
      profile,
      [
        "profileSha256",
        "sourceCount",
        "synthetic",
        "startPassed",
        "execPassed",
        "bridgePassed",
        "nestingContractPassed",
        "unprivilegedContractPassed",
        "deviceContractPassed",
        "shutdownPassed",
        "restartPassed",
        "noUnexpectedDifference",
      ],
      "LXC rehearsal " + index,
    );
    if (
      canonical({
        profileSha256: profile.profileSha256,
        sourceCount: profile.sourceCount,
      }) !== canonical(plan.sourceMatrix.lxcProfiles[index])
    ) {
      fail("LXC rehearsal " + index + " identity differs");
    }
    everyTrue(
      profile,
      [
        "synthetic",
        "startPassed",
        "execPassed",
        "bridgePassed",
        "nestingContractPassed",
        "unprivilegedContractPassed",
        "deviceContractPassed",
        "shutdownPassed",
        "restartPassed",
        "noUnexpectedDifference",
      ],
      "LXC rehearsal " + index,
    );
  });
}

export function validateStageResult(
  result,
  stage,
  plan,
  inventory,
  controllerTiming = null,
) {
  exactKeys(
    result,
    ["schema", "stage", "status", "startedAt", "finishedAt", "observations"],
    "stage result",
  );
  if (
    result.schema !== "starfiniti.proxmox-rehearsal-stage-result.v1" ||
    result.stage !== stage.id ||
    result.status !== "passed"
  ) {
    fail(stage.id + " result identity or status differs");
  }
  const startedAt = exactUtc(result.startedAt, stage.id + " startedAt");
  const finishedAt = exactUtc(result.finishedAt, stage.id + " finishedAt");
  if (
    finishedAt < startedAt ||
    finishedAt - startedAt > stage.timeoutSeconds * 1_000
  ) {
    fail(stage.id + " driver timing is invalid");
  }
  if (controllerTiming) {
    exactKeys(
      controllerTiming,
      ["startedAt", "finishedAt"],
      stage.id + " controller timing",
    );
    if (
      !Number.isFinite(controllerTiming.startedAt) ||
      !Number.isFinite(controllerTiming.finishedAt) ||
      controllerTiming.finishedAt < controllerTiming.startedAt ||
      startedAt < controllerTiming.startedAt - 30_000 ||
      finishedAt > controllerTiming.finishedAt + 30_000
    ) {
      fail(stage.id + " driver clock differs from controller timing");
    }
  }
  const observations = result.observations;
  switch (stage.id) {
    case "inspect_isolation":
      exactKeys(
        observations,
        [
          "markerVerified",
          "targetClassVerified",
          "equivalentPhysicalBoot",
          "nestedOnly",
          "syntheticProfiles",
          "criticalSourcesReadOnly",
          "publicIngress",
          "externalEgress",
          "productionRouteCount",
          "productionCredentialCount",
          "automaticDestroyArmed",
          "automaticDestroyAt",
        ],
        "isolation observations",
      );
      everyTrue(
        observations,
        [
          "markerVerified",
          "targetClassVerified",
          "equivalentPhysicalBoot",
          "syntheticProfiles",
          "criticalSourcesReadOnly",
          "automaticDestroyArmed",
        ],
        "isolation",
      );
      if (
        observations.nestedOnly !== false ||
        observations.publicIngress !== false ||
        observations.externalEgress !== false
      ) {
        fail("isolation boundary differs");
      }
      if (
        observations.automaticDestroyAt !== inventory.target.automaticDestroyAt
      ) {
        fail("isolation automatic-destroy lease differs");
      }
      everyZero(
        observations,
        ["productionRouteCount", "productionCredentialCount"],
        "isolation",
      );
      break;
    case "verify_candidate_bytes":
      exactKeys(
        observations,
        [
          "candidateProvenanceSha256",
          "packageEvidenceReportSha256",
          "packageCount",
          "packageBytes",
          "allBytesVerified",
          "sourceReadOnly",
          "unexpectedPackages",
        ],
        "candidate byte observations",
      );
      if (
        observations.candidateProvenanceSha256 !==
          inventory.candidate.candidateProvenanceSha256 ||
        observations.packageEvidenceReportSha256 !==
          inventory.candidate.packageEvidenceReportSha256 ||
        observations.packageCount !== plan.expectedCandidate.packageCount ||
        observations.packageBytes !== plan.expectedCandidate.packageBytes ||
        observations.allBytesVerified !== true ||
        observations.sourceReadOnly !== true ||
        observations.unexpectedPackages !== 0
      ) {
        fail("candidate byte verification differs");
      }
      break;
    case "install_candidate":
      exactKeys(
        observations,
        [
          "packageCount",
          "configuredCount",
          "removedCount",
          "downgradedCount",
          "unexpectedCount",
          "configurationConflictCount",
          "priorKernelRetained",
          "transactionSucceeded",
        ],
        "candidate installation observations",
      );
      if (
        observations.packageCount !== plan.expectedCandidate.packageCount ||
        observations.configuredCount !== plan.expectedCandidate.packageCount
      ) {
        fail("candidate installation package count differs");
      }
      everyZero(
        observations,
        [
          "removedCount",
          "downgradedCount",
          "unexpectedCount",
          "configurationConflictCount",
        ],
        "candidate installation",
      );
      everyTrue(
        observations,
        ["priorKernelRetained", "transactionSucceeded"],
        "candidate installation",
      );
      break;
    case "reboot_candidate_host":
      exactKeys(
        observations,
        [
          "runningKernel",
          "bootEntryVerified",
          "consoleReady",
          "kvmDevicePresent",
          "iommuGroupCount",
          "physicalNetworkReady",
          "priorKernelStillInstalled",
          "bootErrorCount",
        ],
        "candidate reboot observations",
      );
      if (
        observations.runningKernel !== plan.expectedCandidate.candidateKernel ||
        observations.iommuGroupCount !== inventory.target.iommuGroupCount ||
        observations.bootErrorCount !== 0
      ) {
        fail("candidate reboot facts differ");
      }
      everyTrue(
        observations,
        [
          "bootEntryVerified",
          "consoleReady",
          "kvmDevicePresent",
          "physicalNetworkReady",
          "priorKernelStillInstalled",
        ],
        "candidate reboot",
      );
      break;
    case "verify_host_boot":
      exactKeys(
        observations,
        [
          "architecture",
          "bootMode",
          "hardwareVirtualizationFlag",
          "bridgeModule",
          "vhostNetModule",
          "kvmModule",
          "physicalNetworkReady",
          "managementApiReady",
          "failedRequiredServiceCount",
        ],
        "host boot observations",
      );
      if (
        observations.architecture !== inventory.target.architecture ||
        observations.bootMode !== inventory.target.bootMode ||
        observations.hardwareVirtualizationFlag !==
          inventory.target.hardwareVirtualizationFlag ||
        observations.failedRequiredServiceCount !== 0
      ) {
        fail("candidate host boot facts differ");
      }
      everyTrue(
        observations,
        [
          "bridgeModule",
          "vhostNetModule",
          "kvmModule",
          "physicalNetworkReady",
          "managementApiReady",
        ],
        "candidate host boot",
      );
      break;
    case "verify_management_services":
      validateManagementObservations(observations, plan);
      break;
    case "verify_storage_profiles":
      validateStorageObservations(observations, plan);
      break;
    case "verify_qemu_profiles":
      validateQemuObservations(observations, plan);
      break;
    case "verify_lxc_profiles":
      validateLxcObservations(observations, plan);
      break;
    case "restore_critical_workload_clones":
      exactKeys(
        observations,
        [
          "criticalRecoverySourceSha256",
          "applicationRelease",
          "applicationCommitSha",
          "supabaseCompatibilitySha256",
          "supabaseReleaseRef",
          "supabaseCommitSha",
          "supabaseComposeSha256",
          "supabaseImageSetSha256",
          "restoredWorkloadCount",
          "applicationRestored",
          "databaseRestored",
          "productionDetached",
          "sourceReadOnly",
          "privacyReplayPassed",
        ],
        "critical restore observations",
      );
      if (
        observations.criticalRecoverySourceSha256 !==
          inventory.source.criticalRecoverySourceSha256 ||
        observations.applicationRelease !==
          inventory.source.applicationRelease ||
        observations.applicationCommitSha !==
          inventory.source.applicationCommitSha ||
        observations.supabaseCompatibilitySha256 !==
          inventory.source.supabaseCompatibilitySha256 ||
        observations.supabaseReleaseRef !==
          inventory.source.supabaseReleaseRef ||
        observations.supabaseCommitSha !== inventory.source.supabaseCommitSha ||
        observations.supabaseComposeSha256 !==
          inventory.source.supabaseComposeSha256 ||
        observations.supabaseImageSetSha256 !==
          inventory.source.supabaseImageSetSha256 ||
        observations.restoredWorkloadCount !== 2
      ) {
        fail("critical restore source or count differs");
      }
      everyTrue(
        observations,
        [
          "applicationRestored",
          "databaseRestored",
          "productionDetached",
          "sourceReadOnly",
          "privacyReplayPassed",
        ],
        "critical restore",
      );
      break;
    case "verify_critical_workload_clones":
      exactKeys(
        observations,
        [
          "supabaseComposeHealthy",
          "postgresReady",
          "migrationCompatible",
          "rlsCompatible",
          "authReady",
          "restReady",
          "realtimeReady",
          "storageReady",
          "studioReady",
          "dashboardReady",
          "workerReady",
          "authentikLoginReady",
          "woocommerceCheckoutIndependent",
          "walArchiveReady",
          "backupReady",
          "ledgerReconciled",
          "balanceReconciled",
          "couponReconciled",
          "eventReconciled",
          "unexplainedDifferenceCount",
        ],
        "critical workload observations",
      );
      everyTrue(
        observations,
        [
          "supabaseComposeHealthy",
          "postgresReady",
          "migrationCompatible",
          "rlsCompatible",
          "authReady",
          "restReady",
          "realtimeReady",
          "storageReady",
          "studioReady",
          "dashboardReady",
          "workerReady",
          "authentikLoginReady",
          "woocommerceCheckoutIndependent",
          "walArchiveReady",
          "backupReady",
          "ledgerReconciled",
          "balanceReconciled",
          "couponReconciled",
          "eventReconciled",
        ],
        "critical workload",
      );
      if (observations.unexplainedDifferenceCount !== 0) {
        fail("critical workload has an unexplained difference");
      }
      break;
    case "reconcile_rehearsal":
      exactKeys(
        observations,
        [
          "qemuProfilesPassed",
          "lxcProfilesPassed",
          "storageProfilesPassed",
          "servicesPassed",
          "criticalWorkloadsPassed",
          "ledgerDifference",
          "balanceDifference",
          "couponDifference",
          "eventDifference",
          "walDifference",
          "backupDifference",
          "productionContactCount",
        ],
        "reconciliation observations",
      );
      if (
        observations.qemuProfilesPassed !== plan.objectives.qemuProfileCount ||
        observations.lxcProfilesPassed !== plan.objectives.lxcProfileCount ||
        observations.storageProfilesPassed !==
          plan.objectives.storageProfileCount ||
        observations.servicesPassed !== plan.objectives.requiredServiceCount ||
        observations.criticalWorkloadsPassed !== 2
      ) {
        fail("reconciliation coverage differs");
      }
      everyZero(
        observations,
        [
          "ledgerDifference",
          "balanceDifference",
          "couponDifference",
          "eventDifference",
          "walDifference",
          "backupDifference",
          "productionContactCount",
        ],
        "reconciliation",
      );
      break;
    case "destroy_rehearsal":
      exactKeys(
        observations,
        [
          "targetDestroyed",
          "syntheticGuestsDestroyed",
          "criticalClonesDestroyed",
          "storageDestroyed",
          "networksDestroyed",
          "credentialCopiesDestroyed",
          "testIdentitiesDestroyed",
          "routesDestroyed",
          "residualResourceCount",
        ],
        "teardown observations",
      );
      everyTrue(
        observations,
        [
          "targetDestroyed",
          "syntheticGuestsDestroyed",
          "criticalClonesDestroyed",
          "storageDestroyed",
          "networksDestroyed",
          "credentialCopiesDestroyed",
          "testIdentitiesDestroyed",
          "routesDestroyed",
        ],
        "teardown",
      );
      if (observations.residualResourceCount !== 0) {
        fail("teardown left a residual resource");
      }
      break;
    default:
      fail("unknown stage " + stage.id);
  }
  scanMinimized(result, "stage result");
  return {
    id: stage.id,
    driverStartedAt: result.startedAt,
    driverFinishedAt: result.finishedAt,
    observationsSha256: documentDigest(observations),
  };
}

function reportDigest(report) {
  const copy = structuredClone(report);
  delete copy.reportSha256;
  return documentDigest(copy);
}

function reportBase(context, startedAt) {
  return {
    schema: "starfiniti.proxmox-compatibility-rehearsal-report.v1",
    generatedAt: "",
    startedAt,
    finishedAt: "",
    status: "failed",
    failureStage: null,
    failureCode: null,
    bindings: {
      candidateCommit: context.control.candidateCommit,
      planSha256: context.control.planSha256,
      inventorySha256: context.control.inventorySha256,
      driverSha256: context.control.driverSha256,
      controlSha256: documentDigest(context.control),
      candidateProvenanceSha256:
        context.validatedPlan.candidateProvenanceSha256,
      packageEvidenceReportSha256:
        context.validatedPlan.packageEvidenceReportSha256,
      preflightEvidenceReportSha256:
        context.validatedPlan.preflightEvidenceReportSha256,
      inventoryEvidenceReportSha256:
        context.validatedPlan.inventoryEvidenceReportSha256,
      inventoryProjectionSha256:
        context.validatedPlan.inventoryProjectionSha256,
      freshInventoryObservedAt: context.freshEvidence.observedAt,
      freshInventoryProjectionSha256: context.freshEvidence.projectionSha256,
      freshInventoryFactsSha256: context.freshEvidence.factsSha256,
      freshPreflightObservedAt: context.freshPreflightEvidence.observedAt,
      freshPreflightReportSha256: context.freshPreflightEvidence.reportSha256,
      freshPreflightFileSha256: context.freshPreflightEvidence.fileSha256,
      sourceMatrixSha256: context.validatedPlan.sourceMatrixSha256,
      criticalWorkloadReleaseSha256:
        context.validatedPlan.criticalWorkloadReleaseSha256,
    },
    target: {
      class: context.inventory.target.class,
      markerSha256: context.inventory.target.markerSha256,
      equivalentPhysicalBoot: true,
      nestedOnly: false,
      productionRouteCount: 0,
      productionCredentialCount: 0,
      automaticDestroyAt: context.inventory.target.automaticDestroyAt,
    },
    coverage: {
      qemuProfiles: context.plan.objectives.qemuProfileCount,
      lxcProfiles: context.plan.objectives.lxcProfileCount,
      storageProfiles: context.plan.objectives.storageProfileCount,
      requiredServices: context.plan.objectives.requiredServiceCount,
      criticalWorkloads: 2,
      rehearsalRows: exactRehearsalRows.length,
    },
    stages: [],
    cleanup: {
      attempted: false,
      passed: false,
      durationMs: 0,
      observationsSha256: null,
    },
    summary: {
      serviceStagesPassed: 0,
      serviceStageCount: context.plan.stages.length - 1,
      cleanupPassed: false,
      rawDriverOutputRetained: false,
      independentReviewPending: true,
      productionRouteUsed: false,
      productionCredentialUsed: false,
      productionMutation: false,
    },
    gates: structuredClone(context.plan.gates),
    reportSha256: "",
  };
}

function stageSummary(validated, durationMs) {
  return {
    id: validated.id,
    durationMs: Number(durationMs.toFixed(3)),
    driverStartedAt: validated.driverStartedAt,
    driverFinishedAt: validated.driverFinishedAt,
    observationsSha256: validated.observationsSha256,
  };
}

export function runRehearsalWithAdapter(context, invokeStage) {
  validateFreshEvidenceSummary(
    context.freshEvidence,
    context.plan,
    context.validatedPlan,
    Date.now(),
  );
  validateFreshPreflightEvidenceSummary(
    context.freshPreflightEvidence,
    context.plan,
    Date.now(),
  );
  validateRehearsalControl(
    context.control,
    context.plan,
    context.inventory,
    context.validatedInventory,
    context.freshPreflightEvidence,
    Date.now(),
  );
  const startedAt = new Date().toISOString();
  const startedPerformance = performance.now();
  const report = reportBase(context, startedAt);
  const serviceStages = context.plan.stages.slice(0, -1);
  const cleanupStage = context.plan.stages.at(-1);
  let failure = null;
  for (const stage of serviceStages) {
    try {
      if (
        performance.now() - startedPerformance >
          context.control.approval.maximumRunSeconds * 1_000 ||
        Date.now() >= Date.parse(context.control.approval.expiresAt)
      ) {
        fail("approved rehearsal window expired");
      }
      const stageStarted = performance.now();
      const stageWallStarted = Date.now();
      const result = invokeStage(stage);
      const stageWallFinished = Date.now();
      const measuredDuration = performance.now() - stageStarted;
      if (measuredDuration > stage.timeoutSeconds * 1_000) {
        fail(stage.id + " exceeds the controller-measured timeout");
      }
      const validated = validateStageResult(
        result,
        stage,
        context.plan,
        context.inventory,
        { startedAt: stageWallStarted, finishedAt: stageWallFinished },
      );
      report.stages.push(stageSummary(validated, measuredDuration));
    } catch (error) {
      failure = error;
      report.failureStage = stage.id;
      report.failureCode = "stage_failed";
      break;
    }
  }
  report.cleanup.attempted = true;
  try {
    const cleanupStarted = performance.now();
    const cleanupWallStarted = Date.now();
    const cleanupResult = invokeStage(cleanupStage);
    const cleanupWallFinished = Date.now();
    const cleanupDuration = performance.now() - cleanupStarted;
    if (cleanupDuration > cleanupStage.timeoutSeconds * 1_000) {
      fail("teardown exceeds the controller-measured timeout");
    }
    const validatedCleanup = validateStageResult(
      cleanupResult,
      cleanupStage,
      context.plan,
      context.inventory,
      { startedAt: cleanupWallStarted, finishedAt: cleanupWallFinished },
    );
    report.cleanup = {
      attempted: true,
      passed: true,
      durationMs: Number(cleanupDuration.toFixed(3)),
      observationsSha256: validatedCleanup.observationsSha256,
    };
  } catch (error) {
    if (!failure) {
      failure = error;
      report.failureStage = cleanupStage.id;
      report.failureCode = "cleanup_failed";
    } else {
      report.failureCode = "stage_and_cleanup_failed";
    }
  }
  report.finishedAt = new Date().toISOString();
  report.generatedAt = report.finishedAt;
  report.summary.serviceStagesPassed = report.stages.length;
  report.summary.cleanupPassed = report.cleanup.passed;
  if (
    !failure &&
    report.stages.length === serviceStages.length &&
    report.cleanup.passed
  ) {
    report.status = "passed";
    report.failureStage = null;
    report.failureCode = null;
    report.gates.rehearsalExecuted = true;
  }
  report.reportSha256 = reportDigest(report);
  validateRehearsalReport(report, context.plan, context.validatedPlan);
  return { report, error: failure };
}

export function validateRehearsalReport(report, plan, validatedPlan) {
  exactKeys(
    report,
    [
      "schema",
      "generatedAt",
      "startedAt",
      "finishedAt",
      "status",
      "failureStage",
      "failureCode",
      "bindings",
      "target",
      "coverage",
      "stages",
      "cleanup",
      "summary",
      "gates",
      "reportSha256",
    ],
    "rehearsal report",
  );
  if (
    report.schema !== "starfiniti.proxmox-compatibility-rehearsal-report.v1" ||
    !["passed", "failed"].includes(report.status)
  ) {
    fail("rehearsal report identity differs");
  }
  const startedAt = exactUtc(report.startedAt, "report startedAt");
  const finishedAt = exactUtc(report.finishedAt, "report finishedAt");
  if (
    report.generatedAt !== report.finishedAt ||
    finishedAt < startedAt ||
    finishedAt - startedAt > plan.objectives.maximumRunSeconds * 1_000
  ) {
    fail("rehearsal report timing differs");
  }
  exactKeys(
    report.bindings,
    [
      "candidateCommit",
      "planSha256",
      "inventorySha256",
      "driverSha256",
      "controlSha256",
      "candidateProvenanceSha256",
      "packageEvidenceReportSha256",
      "preflightEvidenceReportSha256",
      "inventoryEvidenceReportSha256",
      "inventoryProjectionSha256",
      "freshInventoryObservedAt",
      "freshInventoryProjectionSha256",
      "freshInventoryFactsSha256",
      "freshPreflightObservedAt",
      "freshPreflightReportSha256",
      "freshPreflightFileSha256",
      "sourceMatrixSha256",
      "criticalWorkloadReleaseSha256",
    ],
    "report bindings",
  );
  if (
    !commitPattern.test(report.bindings.candidateCommit) ||
    !digestPattern.test(report.bindings.inventorySha256) ||
    !digestPattern.test(report.bindings.driverSha256) ||
    !digestPattern.test(report.bindings.controlSha256) ||
    report.bindings.planSha256 !== validatedPlan.planSha256 ||
    report.bindings.candidateProvenanceSha256 !==
      validatedPlan.candidateProvenanceSha256 ||
    report.bindings.packageEvidenceReportSha256 !==
      validatedPlan.packageEvidenceReportSha256 ||
    report.bindings.preflightEvidenceReportSha256 !==
      validatedPlan.preflightEvidenceReportSha256 ||
    report.bindings.inventoryEvidenceReportSha256 !==
      validatedPlan.inventoryEvidenceReportSha256 ||
    report.bindings.inventoryProjectionSha256 !==
      validatedPlan.inventoryProjectionSha256 ||
    report.bindings.freshInventoryProjectionSha256 !==
      validatedPlan.inventoryProjectionSha256 ||
    !utcPattern.test(report.bindings.freshInventoryObservedAt) ||
    !digestPattern.test(report.bindings.freshInventoryFactsSha256) ||
    !utcPattern.test(report.bindings.freshPreflightObservedAt) ||
    !digestPattern.test(report.bindings.freshPreflightReportSha256) ||
    !digestPattern.test(report.bindings.freshPreflightFileSha256) ||
    report.bindings.sourceMatrixSha256 !== validatedPlan.sourceMatrixSha256 ||
    report.bindings.criticalWorkloadReleaseSha256 !==
      validatedPlan.criticalWorkloadReleaseSha256
  ) {
    fail("rehearsal report binding differs");
  }
  exactKeys(
    report.target,
    [
      "class",
      "markerSha256",
      "equivalentPhysicalBoot",
      "nestedOnly",
      "productionRouteCount",
      "productionCredentialCount",
      "automaticDestroyAt",
    ],
    "report target",
  );
  if (
    report.target.class !== plan.safety.targetClass ||
    report.target.markerSha256 !== sha256(plan.safety.environmentMarker) ||
    report.target.equivalentPhysicalBoot !== true ||
    report.target.nestedOnly !== false ||
    report.target.productionRouteCount !== 0 ||
    report.target.productionCredentialCount !== 0
  ) {
    fail("rehearsal report target differs");
  }
  const automaticDestroyAt = exactUtc(
    report.target.automaticDestroyAt,
    "report target automaticDestroyAt",
  );
  if (
    automaticDestroyAt <= startedAt ||
    automaticDestroyAt >
      startedAt +
        (plan.objectives.maximumRunSeconds +
          plan.stages.at(-1).timeoutSeconds) *
          1_000
  ) {
    fail("report target automatic-destroy lease differs");
  }
  exactKeys(
    report.coverage,
    [
      "qemuProfiles",
      "lxcProfiles",
      "storageProfiles",
      "requiredServices",
      "criticalWorkloads",
      "rehearsalRows",
    ],
    "report coverage",
  );
  assert.deepStrictEqual(report.coverage, {
    qemuProfiles: plan.objectives.qemuProfileCount,
    lxcProfiles: plan.objectives.lxcProfileCount,
    storageProfiles: plan.objectives.storageProfileCount,
    requiredServices: plan.objectives.requiredServiceCount,
    criticalWorkloads: 2,
    rehearsalRows: exactRehearsalRows.length,
  });
  if (!Array.isArray(report.stages)) fail("report stages are not an array");
  const maximumServiceStages = plan.stages.length - 1;
  if (
    report.stages.length > maximumServiceStages ||
    report.stages.some((stage, index) => {
      try {
        exactKeys(
          stage,
          [
            "id",
            "durationMs",
            "driverStartedAt",
            "driverFinishedAt",
            "observationsSha256",
          ],
          "report stage " + index,
        );
      } catch {
        return true;
      }
      const driverStartedAt = Date.parse(stage.driverStartedAt);
      const driverFinishedAt = Date.parse(stage.driverFinishedAt);
      const previousFinishedAt =
        index === 0
          ? startedAt
          : Date.parse(report.stages[index - 1].driverFinishedAt);
      return (
        stage.id !== plan.stages[index].id ||
        typeof stage.durationMs !== "number" ||
        !Number.isFinite(stage.durationMs) ||
        stage.durationMs < 0 ||
        stage.durationMs > plan.stages[index].timeoutSeconds * 1_000 ||
        !digestPattern.test(stage.observationsSha256) ||
        !utcPattern.test(stage.driverStartedAt) ||
        !utcPattern.test(stage.driverFinishedAt) ||
        !Number.isFinite(driverStartedAt) ||
        !Number.isFinite(driverFinishedAt) ||
        driverFinishedAt < driverStartedAt ||
        driverStartedAt < startedAt - 30_000 ||
        driverFinishedAt > finishedAt + 30_000 ||
        driverStartedAt < previousFinishedAt - 30_000
      );
    })
  ) {
    fail("report stage coverage or shape differs");
  }
  exactKeys(
    report.cleanup,
    ["attempted", "passed", "durationMs", "observationsSha256"],
    "report cleanup",
  );
  if (
    report.cleanup.attempted !== true ||
    typeof report.cleanup.durationMs !== "number" ||
    !Number.isFinite(report.cleanup.durationMs) ||
    report.cleanup.durationMs < 0 ||
    report.cleanup.durationMs > plan.stages.at(-1).timeoutSeconds * 1_000 ||
    (report.cleanup.passed
      ? !digestPattern.test(report.cleanup.observationsSha256)
      : report.cleanup.observationsSha256 !== null)
  ) {
    fail("report cleanup differs");
  }
  exactKeys(
    report.summary,
    [
      "serviceStagesPassed",
      "serviceStageCount",
      "cleanupPassed",
      "rawDriverOutputRetained",
      "independentReviewPending",
      "productionRouteUsed",
      "productionCredentialUsed",
      "productionMutation",
    ],
    "report summary",
  );
  if (
    report.summary.serviceStagesPassed !== report.stages.length ||
    report.summary.serviceStageCount !== maximumServiceStages ||
    report.summary.cleanupPassed !== report.cleanup.passed ||
    report.summary.rawDriverOutputRetained !== false ||
    report.summary.independentReviewPending !== true ||
    report.summary.productionRouteUsed !== false ||
    report.summary.productionCredentialUsed !== false ||
    report.summary.productionMutation !== false
  ) {
    fail("report summary differs");
  }
  exactKeys(report.gates, exactGateKeys, "report gates");
  for (const key of exactGateKeys.slice(0, 5)) {
    if (report.gates[key] !== true) fail(key + " report gate regressed");
  }
  for (const key of exactGateKeys.slice(6)) {
    if (report.gates[key] !== false) {
      fail(key + " cannot be promoted by rehearsal execution");
    }
  }
  const passed =
    report.status === "passed" &&
    report.failureStage === null &&
    report.failureCode === null &&
    report.stages.length === maximumServiceStages &&
    report.cleanup.passed &&
    report.gates.rehearsalExecuted === true;
  if (passed && finishedAt > automaticDestroyAt) {
    fail("passing report exceeded the automatic-destroy lease");
  }
  const failed =
    report.status === "failed" &&
    typeof report.failureStage === "string" &&
    ["stage_failed", "cleanup_failed", "stage_and_cleanup_failed"].includes(
      report.failureCode,
    ) &&
    report.gates.rehearsalExecuted === false;
  if (!passed && !failed) fail("report outcome is internally inconsistent");
  if (
    !digestPattern.test(report.reportSha256) ||
    report.reportSha256 !== reportDigest(report)
  ) {
    fail("report digest differs");
  }
  scanMinimized(report, "rehearsal report");
  return {
    status: report.status,
    reportSha256: report.reportSha256,
    rehearsalExecuted: report.gates.rehearsalExecuted,
  };
}

function exactCleanHead() {
  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  if (!commitPattern.test(head)) fail("Git HEAD is invalid");
  const status = execFileSync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
  });
  if (status.trim())
    fail("rehearsal requires an exact clean repository commit");
  return head;
}

function makePrivateCopy(path, bytes) {
  writeFileSync(path, bytes, { flag: "wx", mode: 0o600 });
  if (process.platform !== "win32") chmodSync(path, 0o600);
}

function makeDriverInvoker({ driverRaw, controlRaw, inventoryRaw, context }) {
  const requestDirectory = mkdtempSync(
    join(tmpdir(), "starfiniti-proxmox-rehearsal-"),
  );
  if (process.platform !== "win32") chmodSync(requestDirectory, 0o700);
  const driverPath = join(requestDirectory, "approved-driver.mjs");
  const controlPath = join(requestDirectory, "approved-control.yaml");
  const inventoryPath = join(requestDirectory, "approved-inventory.yaml");
  makePrivateCopy(driverPath, driverRaw);
  makePrivateCopy(controlPath, controlRaw);
  makePrivateCopy(inventoryPath, inventoryRaw);
  let requestIndex = 0;
  return {
    invoke(stage) {
      requestIndex += 1;
      const requestPath = join(
        requestDirectory,
        "request-" + String(requestIndex).padStart(2, "0") + ".json",
      );
      const request = {
        schema: "starfiniti.proxmox-rehearsal-stage-request.v1",
        stage: stage.id,
        adapter: stage.adapter,
        planSha256: context.validatedPlan.planSha256,
        inventorySha256: context.validatedInventory.inventorySha256,
        sourceMatrixSha256: context.validatedPlan.sourceMatrixSha256,
        freshInventoryFactsSha256: context.freshEvidence.factsSha256,
        freshPreflightReportSha256: context.freshPreflightEvidence.reportSha256,
        timeoutSeconds: stage.timeoutSeconds,
      };
      makePrivateCopy(
        requestPath,
        Buffer.from(JSON.stringify(request) + "\n", "utf8"),
      );
      let output;
      try {
        output = execFileSync(
          process.execPath,
          [
            driverPath,
            "--stage",
            stage.id,
            "--request",
            requestPath,
            "--control",
            controlPath,
            "--inventory",
            inventoryPath,
          ],
          {
            cwd: requestDirectory,
            encoding: "utf8",
            timeout: stage.timeoutSeconds * 1_000,
            maxBuffer: context.plan.objectives.maximumDriverOutputBytes,
            windowsHide: true,
            env: {
              PATH:
                process.platform === "win32"
                  ? (process.env.PATH ?? "")
                  : "/usr/sbin:/usr/bin:/sbin:/bin",
              LANG: "C",
              LC_ALL: "C",
              TZ: "UTC",
            },
          },
        );
      } catch {
        fail(stage.id + " driver invocation failed");
      }
      if (
        Buffer.byteLength(output, "utf8") < 2 ||
        Buffer.byteLength(output, "utf8") >
          context.plan.objectives.maximumDriverOutputBytes
      ) {
        fail(stage.id + " driver output is outside the byte bound");
      }
      try {
        return JSON.parse(output);
      } catch {
        fail(stage.id + " driver output is not bounded JSON");
      }
    },
    dispose() {
      const status = lstatSync(requestDirectory, { throwIfNoEntry: false });
      if (!status) return;
      const realTemporaryRoot = realpathSync(tmpdir());
      const realRequestDirectory = realpathSync(requestDirectory);
      const insideTemporaryRoot = relative(
        realTemporaryRoot,
        realRequestDirectory,
      );
      if (
        !status.isDirectory() ||
        status.isSymbolicLink() ||
        !insideTemporaryRoot.startsWith("starfiniti-proxmox-rehearsal-") ||
        insideTemporaryRoot.includes(sep) ||
        isAbsolute(insideTemporaryRoot)
      ) {
        fail("private driver directory cannot be safely removed");
      }
      rmSync(realRequestDirectory, { recursive: true, force: false });
    },
  };
}

function resolveExternal(value, label) {
  if (!isAbsolute(value) || value.includes("\0")) {
    fail(label + " must be an absolute path");
  }
  return resolve(value);
}

function readBoundedStdin(maximumBytes, label) {
  const chunks = [];
  let total = 0;
  const buffer = Buffer.alloc(16 * 1024);
  while (true) {
    const count = readSync(0, buffer, 0, buffer.length, null);
    if (count === 0) break;
    total += count;
    if (total > maximumBytes) fail(label + " exceeds the byte bound");
    chunks.push(Buffer.from(buffer.subarray(0, count)));
  }
  if (total === 0) fail(label + " is empty");
  return Buffer.concat(chunks);
}

function validateOutputPath(value) {
  const output = resolveExternal(value, "output");
  const inside = relative(root, output);
  if (inside === "" || (!inside.startsWith("..") && !isAbsolute(inside))) {
    fail("output must remain outside the repository");
  }
  if (existsSync(output)) fail("output already exists; reports are immutable");
  const parentPath = dirname(output);
  const parent = lstatSync(parentPath, { throwIfNoEntry: false });
  if (!parent?.isDirectory() || parent.isSymbolicLink()) {
    fail("output parent must be a pre-existing regular directory");
  }
  const realParent = realpathSync(parentPath);
  const realRoot = realpathSync(root);
  const realInside = relative(realRoot, realParent);
  if (
    realInside === "" ||
    (!realInside.startsWith("..") && !isAbsolute(realInside))
  ) {
    fail("output parent resolves inside the repository");
  }
  if (
    process.platform !== "win32" &&
    ((parent.mode & 0o077) !== 0 || parent.uid !== process.getuid())
  ) {
    fail("output parent must be caller-owned and mode 0700");
  }
  return output;
}

function writeExclusiveReport(output, report, maximumBytes) {
  const bytes = Buffer.from(JSON.stringify(report, null, 2) + "\n", "utf8");
  if (bytes.length > maximumBytes) fail("report exceeds the byte bound");
  let descriptor;
  let created = false;
  let completed = false;
  let identity;
  try {
    descriptor = openSync(
      output,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    created = true;
    const opened = fstatSync(descriptor);
    if (!opened.isFile()) fail("report output is not a regular file");
    identity = { dev: opened.dev, ino: opened.ino };
    let offset = 0;
    while (offset < bytes.length) {
      const count = writeSync(
        descriptor,
        bytes,
        offset,
        bytes.length - offset,
        offset,
      );
      if (count === 0) fail("report write ended early");
      offset += count;
    }
    fsyncSync(descriptor);
    const written = fstatSync(descriptor);
    if (
      written.size !== bytes.length ||
      !written.isFile() ||
      (process.platform !== "win32" && (written.mode & 0o777) !== 0o600)
    ) {
      fail("written report is not exact or private");
    }
    closeSync(descriptor);
    descriptor = undefined;
    const pathStatus = lstatSync(output);
    if (
      !pathStatus.isFile() ||
      pathStatus.isSymbolicLink() ||
      pathStatus.dev !== written.dev ||
      pathStatus.ino !== written.ino
    ) {
      fail("written report path identity differs");
    }
    completed = true;
  } catch (error) {
    if (error && typeof error === "object" && error.code === "EEXIST") {
      fail("output already exists; reports are immutable");
    }
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (created && !completed && identity) {
      try {
        const status = lstatSync(output);
        if (
          status.isFile() &&
          status.dev === identity.dev &&
          status.ino === identity.ino
        ) {
          unlinkSync(output);
        }
      } catch (error) {
        if (!(error && typeof error === "object" && error.code === "ENOENT")) {
          throw error;
        }
      }
    }
  }
  return { bytes: bytes.length, sha256: sha256(bytes) };
}

function fixtureInventory(plan, validatedPlan, now) {
  return {
    schema: "starfiniti.proxmox-rehearsal-inventory.v1",
    observedAt: new Date(now).toISOString(),
    target: {
      class: plan.safety.targetClass,
      environmentId: "rehearsal-selftest-01",
      markerSha256: sha256(plan.safety.environmentMarker),
      architecture: plan.expectedCandidate.architecture,
      bootMode: plan.expectedCandidate.bootMode,
      hardwareVirtualizationFlag:
        plan.expectedCandidate.hardwareVirtualizationFlag,
      cpuCount: 16,
      kvmDevicePresent: true,
      iommuGroupCount: 11,
      physicalNetworkDeviceCount: 1,
      automaticDestroyAt: new Date(
        now + plan.objectives.maximumRunSeconds * 1_000 + 60_000,
      ).toISOString(),
      nested: false,
      disposable: true,
      publicIngress: false,
      externalEgress: false,
      productionRouteCount: 0,
      productionCredentialCount: 0,
    },
    candidate: {
      candidateProvenanceSha256: validatedPlan.candidateProvenanceSha256,
      packageEvidenceReportSha256: validatedPlan.packageEvidenceReportSha256,
      packageCount: plan.expectedCandidate.packageCount,
      packageBytes: plan.expectedCandidate.packageBytes,
      packagesPreStaged: true,
      packageSourceReadOnly: true,
    },
    source: {
      inventoryReportSha256: validatedPlan.inventoryEvidenceReportSha256,
      inventoryProjectionSha256: validatedPlan.inventoryProjectionSha256,
      inventoryObservedAt: validatedPlan.inventoryObservedAt,
      restrictedMappingSha256: "a".repeat(64),
      criticalRecoverySourceSha256: "b".repeat(64),
      applicationRelease: plan.criticalWorkloadRelease.application.release,
      applicationCommitSha: plan.criticalWorkloadRelease.application.commitSha,
      supabaseCompatibilitySha256:
        plan.criticalWorkloadRelease.supabase.compatibilitySha256,
      supabaseReleaseRef: plan.criticalWorkloadRelease.supabase.releaseRef,
      supabaseCommitSha: plan.criticalWorkloadRelease.supabase.commitSha,
      supabaseComposeSha256:
        plan.criticalWorkloadRelease.supabase.composeVariantSha256,
      supabaseImageSetSha256:
        plan.criticalWorkloadRelease.supabase.imageSetSha256,
      recoverySourceReadOnly: true,
      qemuProfileCount: plan.objectives.qemuProfileCount,
      lxcProfileCount: plan.objectives.lxcProfileCount,
      storageProfileCount: plan.objectives.storageProfileCount,
      requiredServiceCount: plan.objectives.requiredServiceCount,
      criticalWorkloadCount: 2,
    },
  };
}

function fixtureControl(
  plan,
  inventory,
  freshPreflightEvidence,
  now,
  driverSha256 = "c".repeat(64),
) {
  return {
    schema: "starfiniti.proxmox-rehearsal-control.v1",
    candidateCommit: "d".repeat(40),
    planSha256: documentDigest(plan),
    inventorySha256: documentDigest(inventory),
    driverSha256,
    freshPreflightFileSha256: freshPreflightEvidence.fileSha256,
    approval: {
      reference: "REHEARSAL-SELFTEST-01",
      approvedAt: new Date(now - 60_000).toISOString(),
      expiresAt: inventory.target.automaticDestroyAt,
      maximumRunSeconds: plan.objectives.maximumRunSeconds,
      productionMutationApproved: false,
    },
    target: {
      environmentId: inventory.target.environmentId,
      markerSha256: inventory.target.markerSha256,
    },
  };
}

function fixtureObservations(stage, plan, inventory) {
  switch (stage.id) {
    case "inspect_isolation":
      return {
        markerVerified: true,
        targetClassVerified: true,
        equivalentPhysicalBoot: true,
        nestedOnly: false,
        syntheticProfiles: true,
        criticalSourcesReadOnly: true,
        publicIngress: false,
        externalEgress: false,
        productionRouteCount: 0,
        productionCredentialCount: 0,
        automaticDestroyArmed: true,
        automaticDestroyAt: inventory.target.automaticDestroyAt,
      };
    case "verify_candidate_bytes":
      return {
        candidateProvenanceSha256:
          inventory.candidate.candidateProvenanceSha256,
        packageEvidenceReportSha256:
          inventory.candidate.packageEvidenceReportSha256,
        packageCount: plan.expectedCandidate.packageCount,
        packageBytes: plan.expectedCandidate.packageBytes,
        allBytesVerified: true,
        sourceReadOnly: true,
        unexpectedPackages: 0,
      };
    case "install_candidate":
      return {
        packageCount: 12,
        configuredCount: 12,
        removedCount: 0,
        downgradedCount: 0,
        unexpectedCount: 0,
        configurationConflictCount: 0,
        priorKernelRetained: true,
        transactionSucceeded: true,
      };
    case "reboot_candidate_host":
      return {
        runningKernel: plan.expectedCandidate.candidateKernel,
        bootEntryVerified: true,
        consoleReady: true,
        kvmDevicePresent: true,
        iommuGroupCount: inventory.target.iommuGroupCount,
        physicalNetworkReady: true,
        priorKernelStillInstalled: true,
        bootErrorCount: 0,
      };
    case "verify_host_boot":
      return {
        architecture: inventory.target.architecture,
        bootMode: inventory.target.bootMode,
        hardwareVirtualizationFlag: inventory.target.hardwareVirtualizationFlag,
        bridgeModule: true,
        vhostNetModule: true,
        kvmModule: true,
        physicalNetworkReady: true,
        managementApiReady: true,
        failedRequiredServiceCount: 0,
      };
    case "verify_management_services":
      return {
        services: plan.sourceMatrix.requiredServices.map((id) => ({
          id,
          loaded: true,
          active: true,
          running: true,
          enabled: true,
        })),
        apiReady: true,
        consoleReady: true,
        authenticationReady: true,
        statisticsReady: true,
        schedulerReady: true,
        haZeroResourceReady: true,
      };
    case "verify_storage_profiles":
      return {
        profiles: plan.sourceMatrix.storageProfiles.map((profile) => ({
          ...structuredClone(profile),
          created: true,
          writePassed: true,
          readPassed: true,
          snapshotPassed: true,
          backupPassed: true,
          restorePassed: true,
          destroyPassed: true,
          capacityWithinBound: true,
        })),
      };
    case "verify_qemu_profiles":
      return {
        profiles: plan.sourceMatrix.qemuProfiles.map((profile) => ({
          ...structuredClone(profile),
          synthetic: true,
          bootPassed: true,
          diskIoPassed: true,
          bridgePassed: true,
          firewallContractPassed: true,
          serialContractPassed: true,
          guestAgentContractPassed: true,
          shutdownPassed: true,
          restartPassed: true,
          noUnexpectedDifference: true,
        })),
      };
    case "verify_lxc_profiles":
      return {
        profiles: plan.sourceMatrix.lxcProfiles.map((profile) => ({
          ...structuredClone(profile),
          synthetic: true,
          startPassed: true,
          execPassed: true,
          bridgePassed: true,
          nestingContractPassed: true,
          unprivilegedContractPassed: true,
          deviceContractPassed: true,
          shutdownPassed: true,
          restartPassed: true,
          noUnexpectedDifference: true,
        })),
      };
    case "restore_critical_workload_clones":
      return {
        criticalRecoverySourceSha256:
          inventory.source.criticalRecoverySourceSha256,
        applicationRelease: inventory.source.applicationRelease,
        applicationCommitSha: inventory.source.applicationCommitSha,
        supabaseCompatibilitySha256:
          inventory.source.supabaseCompatibilitySha256,
        supabaseReleaseRef: inventory.source.supabaseReleaseRef,
        supabaseCommitSha: inventory.source.supabaseCommitSha,
        supabaseComposeSha256: inventory.source.supabaseComposeSha256,
        supabaseImageSetSha256: inventory.source.supabaseImageSetSha256,
        restoredWorkloadCount: 2,
        applicationRestored: true,
        databaseRestored: true,
        productionDetached: true,
        sourceReadOnly: true,
        privacyReplayPassed: true,
      };
    case "verify_critical_workload_clones":
      return {
        supabaseComposeHealthy: true,
        postgresReady: true,
        migrationCompatible: true,
        rlsCompatible: true,
        authReady: true,
        restReady: true,
        realtimeReady: true,
        storageReady: true,
        studioReady: true,
        dashboardReady: true,
        workerReady: true,
        authentikLoginReady: true,
        woocommerceCheckoutIndependent: true,
        walArchiveReady: true,
        backupReady: true,
        ledgerReconciled: true,
        balanceReconciled: true,
        couponReconciled: true,
        eventReconciled: true,
        unexplainedDifferenceCount: 0,
      };
    case "reconcile_rehearsal":
      return {
        qemuProfilesPassed: plan.objectives.qemuProfileCount,
        lxcProfilesPassed: plan.objectives.lxcProfileCount,
        storageProfilesPassed: plan.objectives.storageProfileCount,
        servicesPassed: plan.objectives.requiredServiceCount,
        criticalWorkloadsPassed: 2,
        ledgerDifference: 0,
        balanceDifference: 0,
        couponDifference: 0,
        eventDifference: 0,
        walDifference: 0,
        backupDifference: 0,
        productionContactCount: 0,
      };
    case "destroy_rehearsal":
      return {
        targetDestroyed: true,
        syntheticGuestsDestroyed: true,
        criticalClonesDestroyed: true,
        storageDestroyed: true,
        networksDestroyed: true,
        credentialCopiesDestroyed: true,
        testIdentitiesDestroyed: true,
        routesDestroyed: true,
        residualResourceCount: 0,
      };
    default:
      fail("unknown fixture stage");
  }
}

function fixtureStageResult(stage, plan, inventory) {
  const instant = new Date().toISOString();
  return {
    schema: "starfiniti.proxmox-rehearsal-stage-result.v1",
    stage: stage.id,
    status: "passed",
    startedAt: instant,
    finishedAt: instant,
    observations: fixtureObservations(stage, plan, inventory),
  };
}

function expectFailure(action, pattern) {
  assert.throws(action, pattern);
}

function selfTest(plan, validatedPlan) {
  const now = Date.now();
  const boundPreflightBytes = readRegular(
    absoluteRepositoryPath(
      "docs/plan/evidence/M16/runs/proxmox-security-preflight-5659404-2026-08-29T013145Z.json",
    ),
    256 * 1024,
    "bound preflight self-test report",
  );
  const boundPreflight = validateFreshPreflightReport(
    boundPreflightBytes,
    plan,
    validatedPlan,
    Date.parse("2026-08-29T01:31:46Z"),
  );
  assert.equal(boundPreflight.reportSha256, exactPreflightEvidenceReportSha256);
  assert.equal(boundPreflight.fileSha256, exactPreflightEvidenceFileSha256);
  const inventory = fixtureInventory(plan, validatedPlan, now);
  const validatedInventory = validateRehearsalInventory(
    inventory,
    plan,
    validatedPlan,
    now,
    { requireFresh: false },
  );
  const freshPreflightEvidence = {
    observedAt: new Date(now).toISOString(),
    reportSha256: "9".repeat(64),
    fileSha256: "8".repeat(64),
  };
  const control = fixtureControl(plan, inventory, freshPreflightEvidence, now);
  validateRehearsalControl(
    control,
    plan,
    inventory,
    validatedInventory,
    freshPreflightEvidence,
    now,
  );
  const context = {
    plan,
    validatedPlan,
    inventory,
    validatedInventory,
    control,
    freshPreflightEvidence,
    freshEvidence: {
      observedAt: new Date(now).toISOString(),
      projectionSha256: validatedPlan.inventoryProjectionSha256,
      factsSha256: "e".repeat(64),
    },
  };
  const freshEvidenceCases = [
    [
      "wrong fresh projection",
      (value) => (value.projectionSha256 = "f".repeat(64)),
    ],
    ["malformed fresh digest", (value) => (value.factsSha256 = "not-a-digest")],
    [
      "stale fresh facts",
      (value) =>
        (value.observedAt = new Date(
          now - (plan.objectives.maximumInventoryAgeSeconds + 1) * 1_000,
        ).toISOString()),
    ],
    [
      "future fresh facts",
      (value) => (value.observedAt = new Date(now + 31_000).toISOString()),
    ],
  ];
  for (const [, mutate] of freshEvidenceCases) {
    const changed = structuredClone(context.freshEvidence);
    mutate(changed);
    expectFailure(
      () => validateFreshEvidenceSummary(changed, plan, validatedPlan, now),
      /stale or differs/u,
    );
  }
  const freshPreflightCases = [
    [
      "stale fresh preflight",
      (value) =>
        (value.observedAt = new Date(
          now - (plan.objectives.maximumInventoryAgeSeconds + 1) * 1_000,
        ).toISOString()),
    ],
    [
      "malformed fresh preflight digest",
      (value) => (value.reportSha256 = "not-a-digest"),
    ],
  ];
  for (const [, mutate] of freshPreflightCases) {
    const changed = structuredClone(context.freshPreflightEvidence);
    mutate(changed);
    expectFailure(
      () => validateFreshPreflightEvidenceSummary(changed, plan, now),
      /stale or differs/u,
    );
  }
  const passed = runRehearsalWithAdapter(context, (stage) =>
    fixtureStageResult(stage, plan, inventory),
  );
  assert.equal(passed.report.status, "passed");
  assert.equal(passed.report.gates.rehearsalExecuted, true);
  assert.equal(passed.report.gates.compatibilityProved, false);
  assert.equal(passed.report.cleanup.passed, true);

  const inventoryCases = [
    ["nested target", (value) => (value.target.nested = true)],
    ["production route", (value) => (value.target.productionRouteCount = 1)],
    [
      "production credential",
      (value) => (value.target.productionCredentialCount = 1),
    ],
    ["public ingress", (value) => (value.target.publicIngress = true)],
    ["external egress", (value) => (value.target.externalEgress = true)],
    ["wrong CPU count", (value) => (value.target.cpuCount = 15)],
    [
      "late automatic destroy",
      (value) =>
        (value.target.automaticDestroyAt = new Date(
          now +
            (plan.objectives.maximumRunSeconds +
              plan.stages.at(-1).timeoutSeconds +
              1) *
              1_000,
        ).toISOString()),
    ],
    [
      "wrong source projection",
      (value) => (value.source.inventoryProjectionSha256 = "e".repeat(64)),
    ],
    [
      "wrong application release",
      (value) => (value.source.applicationRelease = "v0.1.12"),
    ],
    [
      "writable recovery source",
      (value) => (value.source.recoverySourceReadOnly = false),
    ],
    ["identifier leakage", (value) => (value.target.hostname = "sensitive")],
  ];
  for (const [, mutate] of inventoryCases) {
    const changed = structuredClone(inventory);
    mutate(changed);
    expectFailure(
      () =>
        validateRehearsalInventory(changed, plan, validatedPlan, now, {
          requireFresh: false,
        }),
      /invalid/u,
    );
  }
  const stale = structuredClone(inventory);
  stale.observedAt = new Date(
    now - (plan.objectives.maximumInventoryAgeSeconds + 1) * 1_000,
  ).toISOString();
  expectFailure(
    () => validateRehearsalInventory(stale, plan, validatedPlan, now),
    /stale/u,
  );
  const controlCases = [
    [
      "production approval",
      (value) => (value.approval.productionMutationApproved = true),
    ],
    ["wrong plan", (value) => (value.planSha256 = "f".repeat(64))],
    [
      "wrong fresh preflight",
      (value) => (value.freshPreflightFileSha256 = "f".repeat(64)),
    ],
    ["wrong target", (value) => (value.target.environmentId += "-other")],
    [
      "unbound automatic destroy",
      (value) =>
        (value.approval.expiresAt = new Date(
          now + plan.objectives.maximumRunSeconds * 1_000 + 30_000,
        ).toISOString()),
    ],
    [
      "expired",
      (value) =>
        (value.approval.expiresAt = new Date(now - 1_000).toISOString()),
    ],
  ];
  for (const [, mutate] of controlCases) {
    const changed = structuredClone(control);
    mutate(changed);
    expectFailure(
      () =>
        validateRehearsalControl(
          changed,
          plan,
          inventory,
          validatedInventory,
          freshPreflightEvidence,
          now,
        ),
      /invalid/u,
    );
  }

  const stageCases = [
    [
      "missing QEMU profile",
      "verify_qemu_profiles",
      (value) => value.observations.profiles.pop(),
    ],
    [
      "duplicate LXC profile",
      "verify_lxc_profiles",
      (value) =>
        (value.observations.profiles[1] = structuredClone(
          value.observations.profiles[0],
        )),
    ],
    [
      "service reorder",
      "verify_management_services",
      (value) => value.observations.services.reverse(),
    ],
    [
      "storage restore failure",
      "verify_storage_profiles",
      (value) => (value.observations.profiles[0].restorePassed = false),
    ],
    [
      "automatic destroy disarmed",
      "inspect_isolation",
      (value) => (value.observations.automaticDestroyArmed = false),
    ],
    [
      "wrong critical Supabase image set",
      "restore_critical_workload_clones",
      (value) => (value.observations.supabaseImageSetSha256 = "f".repeat(64)),
    ],
    [
      "wrong running kernel",
      "reboot_candidate_host",
      (value) => (value.observations.runningKernel = "7.0.6-2-pve"),
    ],
    [
      "checkout dependency",
      "verify_critical_workload_clones",
      (value) => (value.observations.woocommerceCheckoutIndependent = false),
    ],
    [
      "ledger difference",
      "reconcile_rehearsal",
      (value) => (value.observations.ledgerDifference = 1),
    ],
    [
      "cleanup residue",
      "destroy_rehearsal",
      (value) => (value.observations.residualResourceCount = 1),
    ],
  ];
  for (const [, stageId, mutate] of stageCases) {
    const stage = plan.stages.find((item) => item.id === stageId);
    const changed = fixtureStageResult(stage, plan, inventory);
    mutate(changed);
    expectFailure(
      () => validateStageResult(changed, stage, plan, inventory),
      /invalid/u,
    );
  }

  const failed = runRehearsalWithAdapter(context, (stage) => {
    if (stage.id === "verify_qemu_profiles") fail("synthetic stage failure");
    return fixtureStageResult(stage, plan, inventory);
  });
  assert.equal(failed.report.status, "failed");
  assert.equal(failed.report.failureStage, "verify_qemu_profiles");
  assert.equal(failed.report.cleanup.passed, true);
  const cleanupFailed = runRehearsalWithAdapter(context, (stage) => {
    if (stage.id === "destroy_rehearsal") fail("synthetic cleanup failure");
    return fixtureStageResult(stage, plan, inventory);
  });
  assert.equal(cleanupFailed.report.status, "failed");
  assert.equal(cleanupFailed.report.failureCode, "cleanup_failed");

  const promoted = structuredClone(passed.report);
  promoted.gates.compatibilityProved = true;
  promoted.reportSha256 = reportDigest(promoted);
  expectFailure(
    () => validateRehearsalReport(promoted, plan, validatedPlan),
    /cannot be promoted/u,
  );
  const hiddenRoute = structuredClone(passed.report);
  hiddenRoute.summary.productionRouteUsed = true;
  hiddenRoute.reportSha256 = reportDigest(hiddenRoute);
  expectFailure(
    () => validateRehearsalReport(hiddenRoute, plan, validatedPlan),
    /summary differs/u,
  );
  const impossibleChronology = structuredClone(passed.report);
  impossibleChronology.stages[1].driverStartedAt = new Date(
    Date.parse(impossibleChronology.stages[0].driverFinishedAt) - 31_000,
  ).toISOString();
  impossibleChronology.stages[1].driverFinishedAt =
    impossibleChronology.stages[1].driverStartedAt;
  impossibleChronology.reportSha256 = reportDigest(impossibleChronology);
  expectFailure(
    () => validateRehearsalReport(impossibleChronology, plan, validatedPlan),
    /stage coverage or shape differs/u,
  );

  const observations = Object.fromEntries(
    plan.stages.map((stage) => [
      stage.id,
      fixtureStageResult(stage, plan, inventory),
    ]),
  );
  const driverRaw = Buffer.from(
    [
      'import { readFileSync } from "node:fs";',
      "const args = process.argv.slice(2);",
      "const at = (name) => args[args.indexOf(name) + 1];",
      'for (const name of ["--request", "--control", "--inventory"]) {',
      "  const content = readFileSync(at(name));",
      '  if (content.length < 1) throw new Error("approved input is empty");',
      "}",
      "const observations = " + JSON.stringify(observations) + ";",
      'process.stdout.write(JSON.stringify(observations[at("--stage")]));',
    ].join("\n"),
    "utf8",
  );
  const executedControl = fixtureControl(
    plan,
    inventory,
    freshPreflightEvidence,
    now,
    sha256(driverRaw),
  );
  const executedContext = {
    ...context,
    control: executedControl,
  };
  const driver = makeDriverInvoker({
    driverRaw,
    controlRaw: Buffer.from(YAML.stringify(executedControl), "utf8"),
    inventoryRaw: Buffer.from(YAML.stringify(inventory), "utf8"),
    context: executedContext,
  });
  try {
    const executed = runRehearsalWithAdapter(executedContext, driver.invoke);
    assert.equal(executed.report.status, "passed");
  } finally {
    driver.dispose();
  }

  const outputDirectory = mkdtempSync(
    join(tmpdir(), "starfiniti-proxmox-rehearsal-report-"),
  );
  if (process.platform !== "win32") chmodSync(outputDirectory, 0o700);
  const output = join(outputDirectory, "report.json");
  try {
    writeExclusiveReport(
      output,
      passed.report,
      plan.objectives.maximumReportBytes,
    );
    expectFailure(
      () =>
        writeExclusiveReport(
          output,
          passed.report,
          plan.objectives.maximumReportBytes,
        ),
      /immutable/u,
    );
  } finally {
    if (existsSync(output)) unlinkSync(output);
    rmdirSync(outputDirectory);
  }
  process.stdout.write(
    "Validated 15 QEMU profiles, 4 LXC profiles, 2 storage profiles, 9 management services, 2 critical workloads, 13 bounded stages, " +
      String(
        inventoryCases.length +
          1 +
          freshEvidenceCases.length +
          freshPreflightCases.length +
          controlCases.length +
          stageCases.length +
          5,
      ) +
      " adversarial cases, driver isolation, controller teardown, approval-bound automatic expiry, and immutable report publication; no real rehearsal or production mutation occurred.\n",
  );
}

function parseArguments(values) {
  const args = {};
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (
      !name?.startsWith("--") ||
      !value ||
      value.startsWith("--") ||
      ![
        "control-file",
        "inventory-file",
        "fresh-facts",
        "fresh-preflight-report",
        "driver",
        "out",
      ].includes(name.slice(2)) ||
      name.slice(2) in args
    ) {
      fail("run arguments differ");
    }
    args[name.slice(2)] = value;
  }
  for (const key of [
    "control-file",
    "inventory-file",
    "fresh-facts",
    "fresh-preflight-report",
    "driver",
    "out",
  ]) {
    if (!(key in args)) fail("missing --" + key);
  }
  return args;
}

function main() {
  const plan = parseYaml(planPath, 512 * 1024, "rehearsal plan").value;
  const validatedPlan = validateRehearsalPlan(plan);
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--self-test") {
    selfTest(plan, validatedPlan);
    return;
  }
  if (args.length === 2 && args[0] === "--verify-report") {
    const report = parseJson(
      resolveExternal(args[1], "report"),
      plan.objectives.maximumReportBytes,
      "rehearsal report",
    ).value;
    const result = validateRehearsalReport(report, plan, validatedPlan);
    process.stdout.write(
      "Verified rehearsal report " +
        result.reportSha256 +
        " with status " +
        result.status +
        "; independent review, compatibility, approvals, and production mutation remain false.\n",
    );
    return;
  }
  const parsed = parseArguments(args);
  if (process.platform !== "linux") {
    fail("real rehearsal execution requires an approved isolated Linux host");
  }
  const controlPath = resolveExternal(parsed["control-file"], "control");
  const inventoryPath = resolveExternal(parsed["inventory-file"], "inventory");
  const driverPath = resolveExternal(parsed.driver, "driver");
  const freshPreflightPath = resolveExternal(
    parsed["fresh-preflight-report"],
    "fresh preflight report",
  );
  const output = validateOutputPath(parsed.out);
  if (parsed["fresh-facts"] !== "-") {
    fail(
      "fresh inventory facts must be supplied on stdin and are not retained",
    );
  }
  const freshFactsBytes = readBoundedStdin(65_536, "fresh inventory facts");
  const freshEvidence = validateFreshInventoryFacts(
    freshFactsBytes,
    plan,
    validatedPlan,
  );
  const freshPreflightBytes = readRegular(
    freshPreflightPath,
    256 * 1024,
    "fresh preflight report",
    true,
  );
  const freshPreflightEvidence = validateFreshPreflightReport(
    freshPreflightBytes,
    plan,
    validatedPlan,
  );
  const controlParsed = parseYaml(
    controlPath,
    128 * 1024,
    "rehearsal control",
    true,
  );
  const inventoryParsed = parseYaml(
    inventoryPath,
    128 * 1024,
    "rehearsal inventory",
    true,
  );
  const driverRaw = readRegular(
    driverPath,
    512 * 1024,
    "rehearsal driver",
    true,
  );
  const now = Date.now();
  const validatedInventory = validateRehearsalInventory(
    inventoryParsed.value,
    plan,
    validatedPlan,
    now,
    { freshEvidence },
  );
  validateRehearsalControl(
    controlParsed.value,
    plan,
    inventoryParsed.value,
    validatedInventory,
    freshPreflightEvidence,
    now,
  );
  if (controlParsed.value.driverSha256 !== sha256(driverRaw)) {
    fail("approved driver bytes differ");
  }
  const head = exactCleanHead();
  if (head !== controlParsed.value.candidateCommit) {
    fail("approval does not bind the current exact commit");
  }
  const context = {
    plan,
    validatedPlan,
    inventory: inventoryParsed.value,
    validatedInventory,
    control: controlParsed.value,
    freshEvidence,
    freshPreflightEvidence,
  };
  const driver = makeDriverInvoker({
    driverRaw,
    controlRaw: controlParsed.bytes,
    inventoryRaw: inventoryParsed.bytes,
    context,
  });
  let result;
  try {
    result = runRehearsalWithAdapter(context, driver.invoke);
  } finally {
    driver.dispose();
  }
  if (exactCleanHead() !== head) {
    fail("implementation head changed during rehearsal");
  }
  const written = writeExclusiveReport(
    output,
    result.report,
    plan.objectives.maximumReportBytes,
  );
  if (result.error) {
    process.stderr.write(
      "Rehearsal failed closed at " +
        result.report.failureStage +
        "; private minimized report written; no compatibility or production gate advanced.\n",
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    "Rehearsal execution passed all service stages plus teardown; " +
      String(written.bytes) +
      " private report bytes with SHA-256 " +
      written.sha256 +
      "; independent review and compatibility remain pending, and production was not changed.\n",
  );
}

if (
  resolve(process.argv[1] ?? "") === resolve(fileURLToPath(import.meta.url))
) {
  try {
    main();
  } catch (error) {
    if (error instanceof Error) console.error(error.message);
    else console.error("Proxmox compatibility rehearsal failed");
    process.exitCode = 1;
  }
}
