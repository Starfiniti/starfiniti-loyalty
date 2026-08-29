import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
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

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const planRelative =
  "infrastructure/testing/proxmox-security-preflight/plan.yaml";
const planPath = join(root, ...planRelative.split("/"));
const candidateRelative =
  "infrastructure/governance/proxmox-security-update-plan.yaml";
const candidatePath = join(root, ...candidateRelative.split("/"));
const packagePlanRelative =
  "infrastructure/testing/proxmox-security-packages/plan.yaml";
const packagePlanPath = join(root, ...packagePlanRelative.split("/"));
const collectorRelative =
  "infrastructure/testing/proxmox-security-preflight/collect-facts.py";
const collectorPath = join(root, ...collectorRelative.split("/"));
const evidenceDirectory = join(root, "docs/plan/evidence/M16/runs");
const digestPattern = /^[0-9a-f]{64}$/u;
const commitPattern = /^[0-9a-f]{40}$/u;
const exactCandidateFileSha256 =
  "ec010eb667d6166ee5adc0ee0cd2d6ecdf5b2a114e345b018b51c704d64df075";
const exactCandidateProvenance =
  "39f30c67a374b041944a598ce2334fed3fcb8e5f64264b3db08847d5ee23ff9f";
const exactPackageCanaryFileSha256 =
  "3eec19512a6b2535cf0c6359144c1807b78e01015f43c470ad53335c6eb1090e";
const exactPackageCanaryReportSha256 =
  "0b703cc553f2304de75f28160e7482b09718794205efa7615fb39f2eab0f0382";
const exactCollectorSha256 =
  "8aebe8bcd03212dc545a3edef0c138281e9ac74b23bce2358dd5994ab491c0b7";
const exactToolIds = [
  "python3",
  "apt-get",
  "apt-mark",
  "dpkg",
  "dpkg-query",
  "unshare",
  "pveversion",
];

function fail(message) {
  throw new Error(`Proxmox security preflight invalid: ${message}`);
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

function orderedIds(items, expected, label) {
  if (!Array.isArray(items) || items.length !== expected.length) {
    fail(`${label} count differs`);
  }
  const actual = items.map((item) => item?.id);
  if (
    actual.some((id, index) => id !== expected[index]) ||
    new Set(actual).size !== actual.length
  ) {
    fail(`${label} order or identity differs`);
  }
}

function exactDigest(value, label) {
  if (!digestPattern.test(value ?? "") || /^0{64}$/u.test(value)) {
    fail(`${label} must be a nonzero SHA-256 digest`);
  }
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

function loadYaml(absolutePath, maximumBytes, label) {
  const bytes = readStableBytes(absolutePath, maximumBytes, label);
  return { bytes, value: YAML.parse(bytes.toString("utf8")) };
}

function loadJson(absolutePath, maximumBytes, label) {
  const bytes = readStableBytes(absolutePath, maximumBytes, label);
  return { bytes, value: parseJsonBytes(bytes, label) };
}

function parseJsonBytes(bytes, label) {
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail(`${label} is not valid JSON`);
  }
  return value;
}

function readBoundedStdin(maximumBytes, label) {
  const chunks = [];
  let total = 0;
  while (true) {
    const buffer = Buffer.alloc(Math.min(16 * 1024, maximumBytes + 1 - total));
    const count = readSync(0, buffer, 0, buffer.length, null);
    if (count === 0) break;
    total += count;
    if (total > maximumBytes) fail(`${label} exceeds the byte bound`);
    chunks.push(buffer.subarray(0, count));
  }
  if (total < 2) fail(`${label} is empty`);
  return Buffer.concat(chunks, total);
}

export function preflightPlanDigest(plan) {
  return sha256(JSON.stringify(canonical(plan)));
}

function loadBindings() {
  const candidate = loadYaml(candidatePath, 256 * 1024, "candidate plan");
  if (sha256(candidate.bytes) !== exactCandidateFileSha256) {
    fail("candidate plan bytes differ");
  }
  validateCandidatePlan(candidate.value);
  if (candidateProvenance(candidate.value) !== exactCandidateProvenance) {
    fail("candidate provenance differs");
  }

  const packagePlan = loadYaml(
    packagePlanPath,
    256 * 1024,
    "package canary plan",
  );
  validateCanaryPlan(packagePlan.value);
  const packageArtifactRelative =
    "docs/plan/evidence/M16/runs/proxmox-security-package-canary-957e1de-2026-08-29T003101Z.json";
  const packageArtifact = loadJson(
    join(root, ...packageArtifactRelative.split("/")),
    256 * 1024,
    "package canary report",
  );
  if (sha256(packageArtifact.bytes) !== exactPackageCanaryFileSha256) {
    fail("package canary report bytes differ");
  }
  validateCanaryReport(packageArtifact.value, packagePlan.value);
  if (
    packageArtifact.value.reportSha256 !== exactPackageCanaryReportSha256 ||
    packageArtifact.value.gates?.candidatePackageBytesVerified !== true ||
    packageArtifact.value.gates?.repositoryToolSignatureReverified !== true ||
    packageArtifact.value.gates?.productionMutation !== false
  ) {
    fail("package canary report gates differ");
  }

  const collector = readStableBytes(
    collectorPath,
    64 * 1024,
    "preflight collector",
  );
  if (sha256(collector) !== exactCollectorSha256) {
    fail("preflight collector bytes differ");
  }
  return {
    candidate: candidate.value,
    packagePlan: packagePlan.value,
    packageArtifact: packageArtifact.value,
    packageArtifactRelative,
    collector,
  };
}

export function validatePreflightPlan(plan) {
  const bindings = loadBindings();
  exactKeys(
    plan,
    [
      "schema",
      "version",
      "status",
      "createdAt",
      "candidate",
      "packageCanary",
      "collector",
      "expectedStartingState",
      "simulation",
      "gates",
    ],
    "plan",
  );
  if (
    plan.schema !== "starfiniti.proxmox-security-preflight-plan.v1" ||
    plan.version !== 1 ||
    plan.status !== "candidate" ||
    plan.createdAt !== "2026-08-29T01:15:00Z"
  ) {
    fail("plan identity differs");
  }
  canonicalUtc(plan.createdAt, "plan createdAt");

  exactKeys(
    plan.candidate,
    ["path", "fileSha256", "provenanceSha256"],
    "candidate binding",
  );
  if (
    plan.candidate.path !== candidateRelative ||
    plan.candidate.fileSha256 !== exactCandidateFileSha256 ||
    plan.candidate.provenanceSha256 !== exactCandidateProvenance
  ) {
    fail("candidate binding differs");
  }

  exactKeys(
    plan.packageCanary,
    ["path", "fileSha256", "reportSha256", "generatedAt"],
    "package canary binding",
  );
  if (
    plan.packageCanary.path !== bindings.packageArtifactRelative ||
    plan.packageCanary.fileSha256 !== exactPackageCanaryFileSha256 ||
    plan.packageCanary.reportSha256 !== exactPackageCanaryReportSha256 ||
    plan.packageCanary.generatedAt !== bindings.packageArtifact.generatedAt
  ) {
    fail("package canary binding differs");
  }

  exactKeys(
    plan.collector,
    [
      "path",
      "fileSha256",
      "endpointId",
      "transport",
      "routeInput",
      "credentialInput",
      "effectiveUid",
      "pythonIsolation",
      "maximumDurationSeconds",
      "maximumFactBytes",
      "maximumFactAgeSeconds",
      "networkNamespace",
      "packageRefresh",
      "packageDownload",
      "packageInstallation",
      "repositoryChange",
      "serviceControl",
      "reboot",
    ],
    "collector boundary",
  );
  if (
    plan.collector.path !== collectorRelative ||
    plan.collector.fileSha256 !== exactCollectorSha256 ||
    plan.collector.endpointId !== "proxmox-host" ||
    plan.collector.transport !==
      "operator-supplied-stdin-over-approved-session" ||
    plan.collector.routeInput !== "prohibited" ||
    plan.collector.credentialInput !== "prohibited" ||
    plan.collector.effectiveUid !== 0 ||
    plan.collector.pythonIsolation !== "required" ||
    plan.collector.maximumDurationSeconds !== 90 ||
    plan.collector.maximumFactBytes !== 65_536 ||
    plan.collector.maximumFactAgeSeconds !== 300 ||
    plan.collector.networkNamespace !== "isolated-empty" ||
    [
      "packageRefresh",
      "packageDownload",
      "packageInstallation",
      "repositoryChange",
      "serviceControl",
      "reboot",
    ].some((key) => plan.collector[key] !== "prohibited")
  ) {
    fail("collector authority or bound differs");
  }

  exactKeys(
    plan.expectedStartingState,
    [
      "architecture",
      "pveVersion",
      "runningKernel",
      "runningKernelPackage",
      "exactSourceIndexes",
      "exactTools",
      "relevantHolds",
    ],
    "expected starting state",
  );
  if (
    plan.expectedStartingState.architecture !== "amd64" ||
    plan.expectedStartingState.pveVersion !==
      "pve-manager/9.2.3/d0fde103346cf89a (running kernel: 7.0.6-2-pve)" ||
    plan.expectedStartingState.runningKernel !== "7.0.6-2-pve"
  ) {
    fail("expected platform starting state differs");
  }
  exactKeys(
    plan.expectedStartingState.runningKernelPackage,
    ["id", "version", "architecture"],
    "running kernel package",
  );
  if (
    plan.expectedStartingState.runningKernelPackage.id !==
      "proxmox-kernel-7.0.6-2-pve-signed" ||
    plan.expectedStartingState.runningKernelPackage.version !== "7.0.6-2" ||
    plan.expectedStartingState.runningKernelPackage.architecture !== "amd64"
  ) {
    fail("running kernel package differs");
  }
  orderedIds(
    plan.expectedStartingState.exactSourceIndexes,
    ["debian-trixie", "proxmox-trixie-no-subscription"],
    "source indexes",
  );
  const expectedIndexDigests = [
    "be70297f6ea499e8ef0bd93906719298c795bc3dc4ce72560f13e6c9836bfedb",
    "e3675a92287d0a77e15f1ca512fa95ca56564624eff7d4164f2bd91f3cd091c7",
  ];
  plan.expectedStartingState.exactSourceIndexes.forEach((item, index) => {
    exactKeys(item, ["id", "packagesSha256"], `${item.id} source index`);
    if (item.packagesSha256 !== expectedIndexDigests[index]) {
      fail(`${item.id} source index differs`);
    }
  });
  orderedIds(
    plan.expectedStartingState.exactTools,
    exactToolIds,
    "exact tools",
  );
  for (const tool of plan.expectedStartingState.exactTools) {
    exactKeys(tool, ["id", "sha256"], `${tool.id} tool`);
    exactDigest(tool.sha256, `${tool.id} tool`);
  }
  if (
    !Array.isArray(plan.expectedStartingState.relevantHolds) ||
    plan.expectedStartingState.relevantHolds.length !== 0
  ) {
    fail("relevant holds must remain empty");
  }

  exactKeys(
    plan.simulation,
    [
      "command",
      "downloadPrevention",
      "selectorsSha256",
      "expectedUpgrades",
      "expectedInstalls",
      "expectedRemovals",
      "expectedConfigurations",
      "expectedNotUpgraded",
      "autoremovablePackagesToRetain",
    ],
    "simulation contract",
  );
  if (
    plan.simulation.command !== "apt-get --simulate --no-remove install" ||
    plan.simulation.downloadPrevention !==
      "apt-simulation-inside-empty-network-namespace" ||
    plan.simulation.selectorsSha256 !==
      "2502fcc4037d72d2ec024972e4115e2d258aa43fd101267228e305330c8d20cd" ||
    plan.simulation.expectedUpgrades !== 11 ||
    plan.simulation.expectedInstalls !== 1 ||
    plan.simulation.expectedRemovals !== 0 ||
    plan.simulation.expectedConfigurations !== 12 ||
    plan.simulation.expectedNotUpgraded !== 95 ||
    !Array.isArray(plan.simulation.autoremovablePackagesToRetain) ||
    plan.simulation.autoremovablePackagesToRetain.length !== 1 ||
    plan.simulation.autoremovablePackagesToRetain[0] !==
      "proxmox-kernel-7.0.6-2-pve-signed"
  ) {
    fail("simulation contract differs");
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
    "plan gates",
  );
  const expectedGates = {
    candidatePackageBytesVerified: true,
    repositoryToolSignatureReverified: true,
    candidateDependencySimulationReverified: false,
    installedStartingStateReverified: false,
    compatibilityProved: false,
    rollbackEscrowComplete: false,
    recoveryReady: false,
    maintenanceApproved: false,
    rebootApproved: false,
    productionMutation: false,
  };
  for (const [key, value] of Object.entries(expectedGates)) {
    if (plan.gates[key] !== value) fail(`${key} plan gate differs`);
  }
  return {
    ...bindings,
    planDigest: preflightPlanDigest(plan),
    packageCount: bindings.candidate.repairSet.packages.length,
    retainedCount: bindings.candidate.repairSet.retainedBoundaryPackages.length,
  };
}

function validatePackageRecord(record, expected, label) {
  exactKeys(record, ["id", "version", "architecture", "status"], label);
  const absent = expected.version === null;
  if (
    record.id !== expected.id ||
    record.version !== expected.version ||
    record.architecture !== expected.architecture ||
    record.status !== (absent ? "absent" : "installed")
  ) {
    fail(`${label} differs`);
  }
}

function validateTreeState(value, label, { requireEmpty = false } = {}) {
  exactKeys(value, ["sha256", "fileCount", "bytes"], label);
  exactDigest(value.sha256, `${label} digest`);
  if (
    !Number.isInteger(value.fileCount) ||
    value.fileCount < 0 ||
    value.fileCount > 2_048 ||
    !Number.isInteger(value.bytes) ||
    value.bytes < 0 ||
    value.bytes > 512 * 1024 * 1024 ||
    (requireEmpty && value.bytes !== 0)
  ) {
    fail(`${label} bounds differ`);
  }
}

function validateState(value, label) {
  exactKeys(
    value,
    [
      "dpkgStatusSha256",
      "dpkgUpdates",
      "dpkgSelectionsSha256",
      "aptState",
      "aptLists",
      "aptCache",
      "aptArchives",
      "aptConfiguration",
      "aptTrust",
    ],
    label,
  );
  exactDigest(value.dpkgStatusSha256, `${label} dpkg status`);
  exactDigest(value.dpkgSelectionsSha256, `${label} dpkg selections`);
  validateTreeState(value.dpkgUpdates, `${label} dpkg updates`, {
    requireEmpty: true,
  });
  validateTreeState(value.aptState, `${label} APT state`);
  validateTreeState(value.aptLists, `${label} APT lists`);
  validateTreeState(value.aptCache, `${label} APT cache`);
  validateTreeState(value.aptArchives, `${label} APT archives`, {
    requireEmpty: true,
  });
  validateTreeState(value.aptConfiguration, `${label} APT configuration`);
  validateTreeState(value.aptTrust, `${label} APT trust`);
}

export function validateFacts(
  facts,
  plan,
  validatedPlan,
  { requireFresh = false, now = Date.now() } = {},
) {
  exactKeys(
    facts,
    [
      "schema",
      "observedAt",
      "endpointId",
      "architecture",
      "pveVersion",
      "runningKernel",
      "runningKernelPackage",
      "tools",
      "installedPackages",
      "retainedBoundaryPackages",
      "relevantHolds",
      "aptIndexes",
      "simulation",
      "stateBefore",
      "stateAfter",
      "elapsedMilliseconds",
    ],
    "facts",
  );
  if (
    facts.schema !== "starfiniti.proxmox-security-preflight-facts.v1" ||
    facts.endpointId !== plan.collector.endpointId ||
    facts.architecture !== plan.expectedStartingState.architecture ||
    facts.pveVersion !== plan.expectedStartingState.pveVersion ||
    facts.runningKernel !== plan.expectedStartingState.runningKernel
  ) {
    fail("fact identity or platform differs");
  }
  const observedAt = canonicalUtc(facts.observedAt, "facts observedAt");
  if (observedAt < Date.parse(plan.createdAt)) {
    fail("facts predate the preflight plan");
  }
  if (
    requireFresh &&
    (now - observedAt > plan.collector.maximumFactAgeSeconds * 1_000 ||
      observedAt - now > 30_000)
  ) {
    fail("facts are stale or future-dated");
  }
  validatePackageRecord(
    facts.runningKernelPackage,
    {
      ...plan.expectedStartingState.runningKernelPackage,
      status: "installed",
    },
    "running kernel package fact",
  );

  orderedIds(facts.tools, exactToolIds, "fact tools");
  facts.tools.forEach((tool, index) => {
    exactKeys(tool, ["id", "sha256"], `${tool.id} fact tool`);
    if (tool.sha256 !== plan.expectedStartingState.exactTools[index].sha256) {
      fail(`${tool.id} executable digest differs`);
    }
  });

  const repairPackages = validatedPlan.candidate.repairSet.packages;
  orderedIds(
    facts.installedPackages,
    repairPackages.map((item) => item.id),
    "installed repair packages",
  );
  facts.installedPackages.forEach((record, index) => {
    const expected = repairPackages[index];
    validatePackageRecord(
      record,
      {
        id: expected.id,
        version: expected.installedVersion,
        architecture:
          expected.installedVersion === null ? null : expected.architecture,
      },
      `${expected.id} installed fact`,
    );
  });

  const retained = validatedPlan.candidate.repairSet.retainedBoundaryPackages;
  orderedIds(
    facts.retainedBoundaryPackages,
    retained.map((item) => item.id),
    "retained boundary packages",
  );
  facts.retainedBoundaryPackages.forEach((record, index) => {
    const expected = retained[index];
    validatePackageRecord(
      record,
      {
        id: expected.id,
        version: expected.version,
        architecture: expected.architecture,
      },
      `${expected.id} retained fact`,
    );
  });
  if (
    !Array.isArray(facts.relevantHolds) ||
    JSON.stringify(facts.relevantHolds) !==
      JSON.stringify(plan.expectedStartingState.relevantHolds)
  ) {
    fail("relevant package holds differ");
  }

  orderedIds(
    facts.aptIndexes,
    plan.expectedStartingState.exactSourceIndexes.map((item) => item.id),
    "fact APT indexes",
  );
  facts.aptIndexes.forEach((item, index) => {
    exactKeys(item, ["id", "packagesSha256"], `${item.id} fact index`);
    if (
      item.packagesSha256 !==
      plan.expectedStartingState.exactSourceIndexes[index].packagesSha256
    ) {
      fail(`${item.id} fact index differs`);
    }
  });

  exactKeys(
    facts.simulation,
    [
      "networkNamespace",
      "selectorsSha256",
      "outputSha256",
      "actions",
      "configurations",
      "removals",
      "autoremovablePackages",
      "summary",
    ],
    "simulation facts",
  );
  if (
    facts.simulation.networkNamespace !== plan.collector.networkNamespace ||
    facts.simulation.selectorsSha256 !== plan.simulation.selectorsSha256
  ) {
    fail("simulation isolation or selectors differ");
  }
  exactDigest(facts.simulation.outputSha256, "simulation output");
  orderedIds(
    facts.simulation.actions,
    repairPackages.map((item) => item.id),
    "simulation actions",
  );
  facts.simulation.actions.forEach((action, index) => {
    exactKeys(
      action,
      ["id", "fromVersion", "toVersion", "architecture"],
      `${action.id} simulation action`,
    );
    const expected = repairPackages[index];
    if (
      action.fromVersion !== expected.installedVersion ||
      action.toVersion !== expected.candidateVersion ||
      action.architecture !== expected.architecture
    ) {
      fail(`${action.id} simulation action differs`);
    }
  });
  orderedIds(
    facts.simulation.configurations,
    repairPackages.map((item) => item.id),
    "simulation configurations",
  );
  facts.simulation.configurations.forEach((configuration, index) => {
    exactKeys(
      configuration,
      ["id", "version", "architecture"],
      `${configuration.id} configuration`,
    );
    const expected = repairPackages[index];
    if (
      configuration.version !== expected.candidateVersion ||
      configuration.architecture !== expected.architecture
    ) {
      fail(`${configuration.id} simulated configuration differs`);
    }
  });
  if (
    !Array.isArray(facts.simulation.removals) ||
    facts.simulation.removals.length !== 0 ||
    JSON.stringify(facts.simulation.autoremovablePackages) !==
      JSON.stringify(plan.simulation.autoremovablePackagesToRetain)
  ) {
    fail("removal or old-kernel retention evidence differs");
  }
  exactKeys(
    facts.simulation.summary,
    ["upgrades", "installs", "removals", "kept"],
    "simulation summary",
  );
  if (
    facts.simulation.summary.upgrades !== plan.simulation.expectedUpgrades ||
    facts.simulation.summary.installs !== plan.simulation.expectedInstalls ||
    facts.simulation.summary.removals !== plan.simulation.expectedRemovals ||
    facts.simulation.summary.kept !== plan.simulation.expectedNotUpgraded ||
    facts.simulation.configurations.length !==
      plan.simulation.expectedConfigurations
  ) {
    fail("simulation totals differ");
  }

  validateState(facts.stateBefore, "state before");
  validateState(facts.stateAfter, "state after");
  if (
    JSON.stringify(canonical(facts.stateBefore)) !==
    JSON.stringify(canonical(facts.stateAfter))
  ) {
    fail("package, APT, or repository state changed");
  }
  if (
    !Number.isInteger(facts.elapsedMilliseconds) ||
    facts.elapsedMilliseconds < 1 ||
    facts.elapsedMilliseconds > plan.collector.maximumDurationSeconds * 1_000
  ) {
    fail("fact collection duration differs");
  }
  return {
    observedAt: facts.observedAt,
    actionCount: facts.simulation.actions.length,
    configurationCount: facts.simulation.configurations.length,
    installedCount: facts.installedPackages.filter(
      (item) => item.status === "installed",
    ).length,
  };
}

export function reportDigest(report) {
  const subject = structuredClone(report);
  delete subject.reportSha256;
  return sha256(JSON.stringify(canonical(subject)));
}

function buildReport(
  facts,
  plan,
  validatedPlan,
  implementationCommit,
  { requireFresh = true, now = Date.now() } = {},
) {
  const factResult = validateFacts(facts, plan, validatedPlan, {
    requireFresh,
    now,
  });
  const report = {
    schema: "starfiniti.proxmox-security-preflight.v1",
    generatedAt: facts.observedAt,
    candidate: structuredClone(plan.candidate),
    packageCanary: structuredClone(plan.packageCanary),
    preflight: {
      path: planRelative,
      fileSha256: sha256(
        readStableBytes(planPath, 256 * 1024, "preflight plan"),
      ),
      planDigest: validatedPlan.planDigest,
      collectorPath: plan.collector.path,
      collectorFileSha256: plan.collector.fileSha256,
      implementationCommit,
      factsSha256: sha256(JSON.stringify(canonical(facts))),
    },
    endpoint: structuredClone(facts),
    summary: {
      candidateActions: factResult.actionCount,
      configurations: factResult.configurationCount,
      upgrades: facts.simulation.summary.upgrades,
      installs: facts.simulation.summary.installs,
      removals: facts.simulation.summary.removals,
      downgrades: 0,
      retainedBoundaryPackages: facts.retainedBoundaryPackages.length,
      relevantHolds: facts.relevantHolds.length,
      oldKernelRetained: true,
      stateUnchanged: true,
      packageListsRefreshed: false,
      packageDownloads: false,
      packageInstallation: false,
      repositoryChange: false,
      serviceControl: false,
      reboot: false,
      productionMutation: false,
    },
    gates: {
      candidatePackageBytesVerified: true,
      repositoryToolSignatureReverified: true,
      candidateDependencySimulationReverified: true,
      installedStartingStateReverified: true,
      compatibilityProved: false,
      rollbackEscrowComplete: false,
      recoveryReady: false,
      maintenanceApproved: false,
      rebootApproved: false,
      productionMutation: false,
    },
  };
  report.reportSha256 = reportDigest(report);
  return report;
}

export function validateReport(report, plan, validatedPlan) {
  exactKeys(
    report,
    [
      "schema",
      "generatedAt",
      "candidate",
      "packageCanary",
      "preflight",
      "endpoint",
      "summary",
      "gates",
      "reportSha256",
    ],
    "report",
  );
  if (
    report.schema !== "starfiniti.proxmox-security-preflight.v1" ||
    report.generatedAt !== report.endpoint?.observedAt
  ) {
    fail("report identity differs");
  }
  canonicalUtc(report.generatedAt, "report generatedAt");
  if (
    JSON.stringify(canonical(report.candidate)) !==
      JSON.stringify(canonical(plan.candidate)) ||
    JSON.stringify(canonical(report.packageCanary)) !==
      JSON.stringify(canonical(plan.packageCanary))
  ) {
    fail("report source binding differs");
  }
  exactKeys(
    report.preflight,
    [
      "path",
      "fileSha256",
      "planDigest",
      "collectorPath",
      "collectorFileSha256",
      "implementationCommit",
      "factsSha256",
    ],
    "report preflight binding",
  );
  const currentPlanSha256 = sha256(
    readStableBytes(planPath, 256 * 1024, "preflight plan"),
  );
  if (
    report.preflight.path !== planRelative ||
    report.preflight.fileSha256 !== currentPlanSha256 ||
    report.preflight.planDigest !== validatedPlan.planDigest ||
    report.preflight.collectorPath !== collectorRelative ||
    report.preflight.collectorFileSha256 !== exactCollectorSha256 ||
    !commitPattern.test(report.preflight.implementationCommit ?? "") ||
    report.preflight.factsSha256 !==
      sha256(JSON.stringify(canonical(report.endpoint)))
  ) {
    fail("report preflight binding differs");
  }
  exactDigest(report.preflight.factsSha256, "report facts");
  validateFacts(report.endpoint, plan, validatedPlan);

  exactKeys(
    report.summary,
    [
      "candidateActions",
      "configurations",
      "upgrades",
      "installs",
      "removals",
      "downgrades",
      "retainedBoundaryPackages",
      "relevantHolds",
      "oldKernelRetained",
      "stateUnchanged",
      "packageListsRefreshed",
      "packageDownloads",
      "packageInstallation",
      "repositoryChange",
      "serviceControl",
      "reboot",
      "productionMutation",
    ],
    "report summary",
  );
  const expectedSummary = {
    candidateActions: 12,
    configurations: 12,
    upgrades: 11,
    installs: 1,
    removals: 0,
    downgrades: 0,
    retainedBoundaryPackages: 4,
    relevantHolds: 0,
    oldKernelRetained: true,
    stateUnchanged: true,
    packageListsRefreshed: false,
    packageDownloads: false,
    packageInstallation: false,
    repositoryChange: false,
    serviceControl: false,
    reboot: false,
    productionMutation: false,
  };
  if (
    JSON.stringify(canonical(report.summary)) !==
    JSON.stringify(canonical(expectedSummary))
  ) {
    fail("report summary differs");
  }
  exactKeys(report.gates, Object.keys(plan.gates), "report gates");
  const expectedGates = {
    ...plan.gates,
    candidateDependencySimulationReverified: true,
    installedStartingStateReverified: true,
  };
  if (
    JSON.stringify(canonical(report.gates)) !==
    JSON.stringify(canonical(expectedGates))
  ) {
    fail("report gates differ");
  }
  exactDigest(report.reportSha256, "report");
  if (report.reportSha256 !== reportDigest(report)) {
    fail("report digest differs");
  }
  return {
    generatedAt: report.generatedAt,
    implementationCommit: report.preflight.implementationCommit,
    reportSha256: report.reportSha256,
  };
}

function fixture(plan, validatedPlan) {
  const digest = "a".repeat(64);
  const tree = (bytes, fileCount) => ({ sha256: digest, fileCount, bytes });
  const state = {
    dpkgStatusSha256: digest,
    dpkgUpdates: tree(0, 0),
    dpkgSelectionsSha256: digest,
    aptState: tree(100_100_000, 35),
    aptLists: tree(100_000_000, 31),
    aptCache: tree(0, 2),
    aptArchives: tree(0, 1),
    aptConfiguration: tree(80_000, 23),
    aptTrust: tree(1_000_000, 20),
  };
  const repairs = validatedPlan.candidate.repairSet.packages;
  const retained = validatedPlan.candidate.repairSet.retainedBoundaryPackages;
  return {
    schema: "starfiniti.proxmox-security-preflight-facts.v1",
    observedAt: "2026-08-29T01:16:00Z",
    endpointId: plan.collector.endpointId,
    architecture: plan.expectedStartingState.architecture,
    pveVersion: plan.expectedStartingState.pveVersion,
    runningKernel: plan.expectedStartingState.runningKernel,
    runningKernelPackage: {
      ...plan.expectedStartingState.runningKernelPackage,
      status: "installed",
    },
    tools: structuredClone(plan.expectedStartingState.exactTools),
    installedPackages: repairs.map((item) => ({
      id: item.id,
      version: item.installedVersion,
      architecture: item.installedVersion === null ? null : item.architecture,
      status: item.installedVersion === null ? "absent" : "installed",
    })),
    retainedBoundaryPackages: retained.map((item) => ({
      id: item.id,
      version: item.version,
      architecture: item.architecture,
      status: "installed",
    })),
    relevantHolds: [],
    aptIndexes: structuredClone(plan.expectedStartingState.exactSourceIndexes),
    simulation: {
      networkNamespace: plan.collector.networkNamespace,
      selectorsSha256: plan.simulation.selectorsSha256,
      outputSha256: digest,
      actions: repairs.map((item) => ({
        id: item.id,
        fromVersion: item.installedVersion,
        toVersion: item.candidateVersion,
        architecture: item.architecture,
      })),
      configurations: repairs.map((item) => ({
        id: item.id,
        version: item.candidateVersion,
        architecture: item.architecture,
      })),
      removals: [],
      autoremovablePackages: structuredClone(
        plan.simulation.autoremovablePackagesToRetain,
      ),
      summary: { upgrades: 11, installs: 1, removals: 0, kept: 95 },
    },
    stateBefore: structuredClone(state),
    stateAfter: structuredClone(state),
    elapsedMilliseconds: 1_234,
  };
}

function expectFailure(value, mutate, validate) {
  const changed = structuredClone(value);
  mutate(changed);
  assert.throws(() => validate(changed));
}

function selfTest(plan, validatedPlan) {
  const facts = fixture(plan, validatedPlan);
  validateFacts(facts, plan, validatedPlan);
  const factCases = [
    (value) => (value.schema = "forged"),
    (value) => (value.endpointId = "database-guest"),
    (value) => (value.observedAt = "2026-08-29 01:16:00"),
    (value) => (value.architecture = "arm64"),
    (value) => (value.pveVersion = "pve-manager/9.2.4/forged"),
    (value) => (value.runningKernel = "7.0.14-14-pve"),
    (value) => (value.runningKernelPackage.version = "7.0.14-14"),
    (value) => value.tools.pop(),
    (value) => value.tools.reverse(),
    (value) => (value.tools[0].sha256 = "b".repeat(64)),
    (value) => value.installedPackages.pop(),
    (value) => value.installedPackages.reverse(),
    (value) => (value.installedPackages[0].version = "13.8+deb13u6"),
    (value) => (value.installedPackages[0].architecture = "all"),
    (value) => (value.installedPackages[10].status = "installed"),
    (value) => value.retainedBoundaryPackages.pop(),
    (value) => (value.retainedBoundaryPackages[0].version = "3.5.0-forged"),
    (value) => value.relevantHolds.push("pve-manager"),
    (value) => value.aptIndexes.reverse(),
    (value) => (value.aptIndexes[0].packagesSha256 = "b".repeat(64)),
    (value) => (value.simulation.networkNamespace = "host"),
    (value) => (value.simulation.selectorsSha256 = "b".repeat(64)),
    (value) => value.simulation.actions.pop(),
    (value) => value.simulation.actions.reverse(),
    (value) => (value.simulation.actions[0].fromVersion = null),
    (value) => (value.simulation.actions[0].toVersion = "13.8+deb13u5"),
    (value) => (value.simulation.actions[0].architecture = "all"),
    (value) => value.simulation.configurations.pop(),
    (value) => (value.simulation.configurations[0].version = "forged"),
    (value) => value.simulation.removals.push({ id: "pve-manager" }),
    (value) => value.simulation.autoremovablePackages.pop(),
    (value) => (value.simulation.summary.upgrades = 10),
    (value) => (value.simulation.summary.installs = 2),
    (value) => (value.simulation.summary.removals = 1),
    (value) => (value.simulation.summary.kept = 94),
    (value) => (value.stateAfter.dpkgStatusSha256 = "b".repeat(64)),
    (value) => (value.stateAfter.aptLists.bytes += 1),
    (value) => (value.stateBefore.aptArchives.bytes = 1),
    (value) => (value.stateBefore.dpkgUpdates.bytes = 1),
    (value) => (value.elapsedMilliseconds = 90_001),
    (value) => (value.route = "ssh://forged"),
  ];
  for (const mutate of factCases) {
    expectFailure(facts, mutate, (value) =>
      validateFacts(value, plan, validatedPlan),
    );
  }

  const planCases = [
    (value) => (value.collector.routeInput = "allowed"),
    (value) => (value.collector.pythonIsolation = "optional"),
    (value) => (value.collector.packageRefresh = "allowed"),
    (value) => (value.collector.networkNamespace = "host"),
    (value) => (value.expectedStartingState.relevantHolds = ["pve-manager"]),
    (value) => value.expectedStartingState.exactTools.pop(),
    (value) => (value.simulation.command = "apt-get install"),
    (value) => (value.simulation.expectedRemovals = 1),
    (value) => value.simulation.autoremovablePackagesToRetain.pop(),
    (value) => (value.gates.candidateDependencySimulationReverified = true),
    (value) => (value.gates.productionMutation = true),
  ];
  for (const mutate of planCases) {
    expectFailure(plan, mutate, validatePreflightPlan);
  }
  const report = buildReport(facts, plan, validatedPlan, "c".repeat(40), {
    requireFresh: false,
  });
  validateReport(report, plan, validatedPlan);
  const reportCases = [
    (value) => (value.schema = "forged"),
    (value) => (value.preflight.implementationCommit = "short"),
    (value) => (value.preflight.collectorFileSha256 = "b".repeat(64)),
    (value) => (value.summary.packageDownloads = true),
    (value) => (value.gates.candidateDependencySimulationReverified = false),
    (value) => (value.gates.productionMutation = true),
    (value) => (value.endpoint.relevantHolds = ["pve-manager"]),
    (value) => (value.reportSha256 = "b".repeat(64)),
  ];
  for (const mutate of reportCases) {
    expectFailure(report, mutate, (value) =>
      validateReport(value, plan, validatedPlan),
    );
  }
  process.stdout.write(
    `Validated ${validatedPlan.packageCount} exact Proxmox actions, ${validatedPlan.retainedCount} retained recovery packages, and ${factCases.length + planCases.length + reportCases.length} adversarial cases; capture remains route-free and production mutation remains false.\n`,
  );
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
  if (status.trim()) fail("capture requires a clean implementation commit");
  return head;
}

function parseOption(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) fail(`${name} is required`);
  return process.argv[index + 1];
}

function resolveInput(value, label) {
  const absolute = isAbsolute(value) ? resolve(value) : resolve(root, value);
  if (!existsSync(absolute)) fail(`${label} does not exist`);
  return absolute;
}

function writeReport(report, implementationCommit) {
  mkdirSync(evidenceDirectory, { recursive: true });
  const timestamp = report.generatedAt.replaceAll(":", "");
  const basename = `proxmox-security-preflight-${implementationCommit.slice(0, 7)}-${timestamp}.json`;
  const output = join(evidenceDirectory, basename);
  if (existsSync(output)) fail("evidence output already exists");
  const temporary = join(
    evidenceDirectory,
    `.${basename}.${process.pid}.temporary`,
  );
  const bytes = `${JSON.stringify(report, null, 2)}\n`;
  try {
    writeFileSync(temporary, bytes, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    renameSync(temporary, output);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
  return { output, bytes: Buffer.byteLength(bytes), sha256: sha256(bytes) };
}

function main() {
  const { value: plan } = loadYaml(planPath, 256 * 1024, "preflight plan");
  const validatedPlan = validatePreflightPlan(plan);
  const arguments_ = process.argv.slice(2);
  if (arguments_.length === 1 && arguments_[0] === "--self-test") {
    selfTest(plan, validatedPlan);
    return;
  }
  if (arguments_.length === 2 && arguments_[0] === "--verify-report") {
    const reportPath = resolveInput(
      parseOption("--verify-report"),
      "preflight report",
    );
    const { value: report } = loadJson(
      reportPath,
      256 * 1024,
      "preflight report",
    );
    const result = validateReport(report, plan, validatedPlan);
    process.stdout.write(
      `Verified Proxmox security preflight ${result.reportSha256} from ${result.generatedAt}; implementation ${result.implementationCommit}; production mutation remains false.\n`,
    );
    return;
  }
  if (
    arguments_.length === 3 &&
    arguments_[0] === "--capture" &&
    arguments_[1] === "--facts"
  ) {
    const factsInput = parseOption("--facts");
    const implementationCommit = exactCleanHead();
    const factsResult =
      factsInput === "-"
        ? (() => {
            const bytes = readBoundedStdin(
              plan.collector.maximumFactBytes,
              "preflight facts",
            );
            return { bytes, value: parseJsonBytes(bytes, "preflight facts") };
          })()
        : loadJson(
            resolveInput(factsInput, "preflight facts"),
            plan.collector.maximumFactBytes,
            "preflight facts",
          );
    const { bytes, value: facts } = factsResult;
    if (bytes.includes(0)) fail("preflight facts contain a NUL byte");
    const report = buildReport(
      facts,
      plan,
      validatedPlan,
      implementationCommit,
    );
    validateReport(report, plan, validatedPlan);
    if (exactCleanHead() !== implementationCommit) {
      fail("implementation head changed during capture");
    }
    const written = writeReport(report, implementationCommit);
    process.stdout.write(
      `Captured ${report.summary.candidateActions} exact simulated actions and ${report.summary.retainedBoundaryPackages} retained packages in ${relative(root, written.output).replaceAll("\\", "/")}; ${written.bytes} bytes; SHA-256 ${written.sha256}; no package refresh, download, installation, repository change, service control, reboot, route, credential, or production mutation retained.\n`,
    );
    return;
  }
  fail(
    "usage: --self-test | --capture --facts <path> | --verify-report <path>",
  );
}

if (
  resolve(process.argv[1] ?? "") === resolve(fileURLToPath(import.meta.url))
) {
  try {
    main();
  } catch (error) {
    if (error instanceof Error) console.error(error.message);
    else
      console.error("Proxmox security preflight failed with an unknown error");
    process.exitCode = 1;
  }
}
