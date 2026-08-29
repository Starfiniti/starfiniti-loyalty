import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readSync,
  rmdirSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

import {
  candidateProvenance,
  validatePlan as validateCandidatePlan,
} from "./validate-proxmox-security-update-plan.mjs";
import {
  validatePreflightPlan,
  validateReport as validatePreflightReport,
} from "./validate-proxmox-security-preflight.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const planRelative =
  "infrastructure/testing/proxmox-compatibility-inventory/plan.yaml";
const planPath = join(root, ...planRelative.split("/"));
const candidateRelative =
  "infrastructure/governance/proxmox-security-update-plan.yaml";
const candidatePath = join(root, ...candidateRelative.split("/"));
const preflightPlanRelative =
  "infrastructure/testing/proxmox-security-preflight/plan.yaml";
const preflightPlanPath = join(root, ...preflightPlanRelative.split("/"));
const preflightReportRelative =
  "docs/plan/evidence/M16/runs/proxmox-security-preflight-5659404-2026-08-29T013145Z.json";
const preflightReportPath = join(root, ...preflightReportRelative.split("/"));
const collectorRelative =
  "infrastructure/testing/proxmox-compatibility-inventory/collect-facts.py";
const collectorPath = join(root, ...collectorRelative.split("/"));
const evidenceDirectory = join(root, "docs/plan/evidence/M16/runs");

const digestPattern = /^[0-9a-f]{64}$/u;
const commitPattern = /^[0-9a-f]{40}$/u;
const utcPattern =
  /^20[0-9]{2}-[01][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z$/u;
const exactCandidateFileSha256 =
  "ec010eb667d6166ee5adc0ee0cd2d6ecdf5b2a114e345b018b51c704d64df075";
const exactCandidateProvenance =
  "39f30c67a374b041944a598ce2334fed3fcb8e5f64264b3db08847d5ee23ff9f";
const exactPreflightPlanSha256 =
  "af2b01cbdff3c6f88861c0e5285cd2cf2a98a7aa5b033f74d19c21b60b77461d";
const exactPreflightReportFileSha256 =
  "b18037b19263020fabce46c2b6b13ec69b640775d2747dae474521191cba8a85";
const exactPreflightReportSha256 =
  "898d10bde0e5dd1103dfd8838f19febff3e781ac95ecf305d4767eadf20a110a";
const exactCollectorSha256 =
  "44838b5c9cea4de61ea3cbde297c00772c862abd547f3fdca0581242e0ad7201";
const exactProjectionSha256 =
  "e5b11768254534c2f4bd18a2734b78c5c2a63250d32c7715b86dd18c7b3689de";
const exactToolIds = [
  "python3",
  "pvesh",
  "qm",
  "pct",
  "pvesm",
  "systemctl",
  "pveversion",
];
const exactServiceIds = [
  "pve-cluster.service",
  "pvedaemon.service",
  "pveproxy.service",
  "pvestatd.service",
  "pvescheduler.service",
  "pve-ha-crm.service",
  "pve-ha-lrm.service",
  "qmeventd.service",
  "ssh.service",
];
const exactRehearsalIds = [
  "candidate-host-boot",
  "qemu-profiles",
  "lxc-profiles",
  "storage-profiles",
  "management-services",
  "critical-workload-clones",
];
const qemuProjectionKeys = [
  "bios",
  "bridgedNicCount",
  "cloudInitConfigured",
  "cpuType",
  "customArguments",
  "diskBuses",
  "efiConfigured",
  "firewalledNicCount",
  "guestAgentConfigured",
  "hookscript",
  "hostPciDeviceCount",
  "keyCount",
  "keySetSha256",
  "machine",
  "nicModels",
  "numaConfigured",
  "ostype",
  "protection",
  "scsiController",
  "serialDeviceCount",
  "startupPolicy",
  "tpmConfigured",
  "usbDeviceCount",
];
const lxcProjectionKeys = [
  "architecture",
  "customArguments",
  "devicePassThroughCount",
  "hookscript",
  "keyCount",
  "keySetSha256",
  "mountPointCount",
  "nestingConfigured",
  "networkInterfaceCount",
  "ostype",
  "protection",
  "startupPolicy",
  "unprivileged",
];

function fail(message) {
  throw new Error(`Proxmox compatibility inventory invalid: ${message}`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(",")}}`;
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
    fail(`${label} fields differ`);
  }
}

function integer(value, minimum, maximum, label) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    fail(`${label} is outside the integer bound`);
  }
}

function exactUtc(value, label) {
  if (typeof value !== "string" || !utcPattern.test(value)) {
    fail(`${label} is not an exact UTC second`);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) fail(`${label} is invalid`);
  return timestamp;
}

function readRegular(path, maximumBytes, label) {
  const metadata = lstatSync(path, { throwIfNoEntry: false });
  if (
    !metadata?.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.size < 1 ||
    metadata.size > maximumBytes
  ) {
    fail(`${label} is not a bounded regular file`);
  }
  const descriptor = openSync(
    path,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    const before = fstatSync(descriptor);
    if (
      before.dev !== metadata.dev ||
      before.ino !== metadata.ino ||
      before.size !== metadata.size ||
      before.mtimeMs !== metadata.mtimeMs
    ) {
      fail(`${label} path identity changed before reading`);
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
      if (count === 0) fail(`${label} ended early`);
      offset += count;
    }
    const after = fstatSync(descriptor);
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs
    ) {
      fail(`${label} changed while reading`);
    }
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}

function parseYaml(path, maximumBytes, label) {
  const bytes = readRegular(path, maximumBytes, label);
  try {
    return { bytes, value: YAML.parse(bytes.toString("utf8")) };
  } catch {
    fail(`${label} YAML is invalid`);
  }
}

function parseJsonBytes(bytes, label) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    fail(`${label} JSON is invalid`);
  }
}

function parseJson(path, maximumBytes, label) {
  const bytes = readRegular(path, maximumBytes, label);
  return { bytes, value: parseJsonBytes(bytes, label) };
}

function safeRelativePath(value, expected, label) {
  if (value !== expected || value.includes("\\") || value.includes("..")) {
    fail(`${label} path differs`);
  }
}

function validateSummaryProfile(profile, label) {
  exactKeys(profile, ["profileSha256", "type", "count", "statusCounts"], label);
  if (
    !digestPattern.test(profile.profileSha256) ||
    !["qemu", "lxc"].includes(profile.type)
  ) {
    fail(`${label} identity is invalid`);
  }
  integer(profile.count, 1, 32, `${label} count`);
  exactKeys(
    profile.statusCounts,
    Object.keys(profile.statusCounts),
    `${label} status counts`,
  );
  const statusKeys = Object.keys(profile.statusCounts);
  if (
    statusKeys.length < 1 ||
    statusKeys.some(
      (key) => !["running", "stopped", "paused", "suspended"].includes(key),
    )
  ) {
    fail(`${label} status key is invalid`);
  }
  let total = 0;
  for (const [key, value] of Object.entries(profile.statusCounts)) {
    integer(value, 1, 32, `${label} ${key}`);
    total += value;
  }
  if (total !== profile.count) fail(`${label} status count does not reconcile`);
}

function validatePlan(plan) {
  exactKeys(
    plan,
    [
      "schema",
      "version",
      "status",
      "createdAt",
      "candidate",
      "preflight",
      "collector",
      "expectedInventory",
      "rehearsalMatrix",
      "gates",
    ],
    "plan",
  );
  if (
    plan.schema !== "starfiniti.proxmox-compatibility-inventory-plan.v1" ||
    plan.version !== 1 ||
    plan.status !== "candidate"
  ) {
    fail("plan identity differs");
  }
  exactUtc(plan.createdAt, "plan createdAt");
  exactKeys(
    plan.candidate,
    ["path", "fileSha256", "provenanceSha256"],
    "candidate",
  );
  safeRelativePath(plan.candidate.path, candidateRelative, "candidate");
  const candidateRaw = readRegular(candidatePath, 256 * 1024, "candidate plan");
  if (
    plan.candidate.fileSha256 !== exactCandidateFileSha256 ||
    sha256(candidateRaw) !== exactCandidateFileSha256
  ) {
    fail("candidate plan bytes differ");
  }
  const candidatePlan = YAML.parse(candidateRaw.toString("utf8"));
  validateCandidatePlan(candidatePlan);
  if (
    plan.candidate.provenanceSha256 !== exactCandidateProvenance ||
    candidateProvenance(candidatePlan) !== exactCandidateProvenance
  ) {
    fail("candidate provenance differs");
  }

  exactKeys(
    plan.preflight,
    [
      "planPath",
      "planSha256",
      "reportPath",
      "reportFileSha256",
      "reportSha256",
    ],
    "preflight binding",
  );
  safeRelativePath(
    plan.preflight.planPath,
    preflightPlanRelative,
    "preflight plan",
  );
  safeRelativePath(
    plan.preflight.reportPath,
    preflightReportRelative,
    "preflight report",
  );
  const preflightPlanRaw = readRegular(
    preflightPlanPath,
    256 * 1024,
    "preflight plan",
  );
  const preflightReportRaw = readRegular(
    preflightReportPath,
    256 * 1024,
    "preflight report",
  );
  if (
    plan.preflight.planSha256 !== exactPreflightPlanSha256 ||
    sha256(preflightPlanRaw) !== exactPreflightPlanSha256 ||
    plan.preflight.reportFileSha256 !== exactPreflightReportFileSha256 ||
    sha256(preflightReportRaw) !== exactPreflightReportFileSha256 ||
    plan.preflight.reportSha256 !== exactPreflightReportSha256
  ) {
    fail("preflight bytes or digest differ");
  }
  const preflightPlan = YAML.parse(preflightPlanRaw.toString("utf8"));
  const validatedPreflight = validatePreflightPlan(preflightPlan);
  const preflightReport = parseJsonBytes(
    preflightReportRaw,
    "preflight report",
  );
  const preflightResult = validatePreflightReport(
    preflightReport,
    preflightPlan,
    validatedPreflight,
  );
  if (preflightResult.reportSha256 !== exactPreflightReportSha256) {
    fail("preflight report result differs");
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
      "packageManager",
      "configurationWrite",
      "serviceControl",
      "guestControl",
      "storageWrite",
      "reboot",
    ],
    "collector",
  );
  safeRelativePath(plan.collector.path, collectorRelative, "collector");
  const collectorRaw = readRegular(collectorPath, 128 * 1024, "collector");
  if (
    plan.collector.fileSha256 !== exactCollectorSha256 ||
    sha256(collectorRaw) !== exactCollectorSha256 ||
    plan.collector.endpointId !== "proxmox-host" ||
    plan.collector.transport !==
      "operator-supplied-stdin-over-approved-session" ||
    plan.collector.routeInput !== "prohibited" ||
    plan.collector.credentialInput !== "prohibited" ||
    plan.collector.effectiveUid !== 0 ||
    plan.collector.pythonIsolation !== "required" ||
    plan.collector.maximumDurationSeconds !== 120 ||
    plan.collector.maximumFactBytes !== 65_536 ||
    plan.collector.maximumFactAgeSeconds !== 300 ||
    [
      "packageManager",
      "configurationWrite",
      "serviceControl",
      "guestControl",
      "storageWrite",
      "reboot",
    ].some((key) => plan.collector[key] !== "prohibited")
  ) {
    fail("collector boundary differs");
  }
  const collectorText = collectorRaw.toString("utf8");
  for (const prohibited of [
    "import socket",
    "import urllib",
    "import requests",
    "paramiko",
    "apt-get",
    "apt ",
    "dpkg ",
    "qm start",
    "qm stop",
    "pct start",
    "pct stop",
    "systemctl restart",
    "systemctl stop",
    '"/usr/sbin/reboot"',
    '"/sbin/reboot"',
    '"/usr/sbin/shutdown"',
    '"/sbin/shutdown"',
    "os.system",
    "os.popen",
  ]) {
    if (collectorText.includes(prohibited))
      fail(`collector contains prohibited capability ${prohibited}`);
  }

  const expected = plan.expectedInventory;
  exactKeys(
    expected,
    [
      "projectionSha256",
      "pveVersion",
      "tools",
      "platform",
      "guests",
      "storages",
      "services",
      "serviceState",
      "network",
      "haResourceCount",
    ],
    "expected inventory",
  );
  if (
    expected.projectionSha256 !== exactProjectionSha256 ||
    expected.pveVersion !==
      "pve-manager/9.2.3/d0fde103346cf89a (running kernel: 7.0.6-2-pve)"
  ) {
    fail("expected projection identity differs");
  }
  if (
    !Array.isArray(expected.tools) ||
    expected.tools.length !== exactToolIds.length ||
    expected.tools.some(
      (tool, index) =>
        Object.keys(tool).sort().join(",") !== "id,sha256" ||
        tool.id !== exactToolIds[index] ||
        !digestPattern.test(tool.sha256),
    )
  ) {
    fail("expected tool inventory differs");
  }
  validatePlatform(expected.platform);
  validateGuestPlan(expected.guests);
  validateStorages(expected.storages);
  if (
    !Array.isArray(expected.services) ||
    expected.services.join(",") !== exactServiceIds.join(",") ||
    expected.serviceState !== "active-running-enabled"
  ) {
    fail("expected service inventory differs");
  }
  validateNetwork(expected.network);
  if (expected.haResourceCount !== 0) fail("expected HA inventory differs");

  if (
    !Array.isArray(plan.rehearsalMatrix) ||
    plan.rehearsalMatrix.length !== exactRehearsalIds.length
  ) {
    fail("rehearsal matrix differs");
  }
  plan.rehearsalMatrix.forEach((item, index) => {
    exactKeys(item, ["id", "scope", "status"], `rehearsal ${index}`);
    if (
      item.id !== exactRehearsalIds[index] ||
      item.status !== "pending" ||
      typeof item.scope !== "string" ||
      item.scope.length < 40 ||
      item.scope.length > 240
    ) {
      fail(`rehearsal ${index} differs`);
    }
  });
  const gateKeys = [
    "candidatePackageBytesVerified",
    "repositoryToolSignatureReverified",
    "candidateDependencySimulationReverified",
    "installedStartingStateReverified",
    "consumerInventoryCaptured",
    "compatibilityProved",
    "rollbackEscrowComplete",
    "recoveryReady",
    "maintenanceApproved",
    "rebootApproved",
    "productionMutation",
  ];
  exactKeys(plan.gates, gateKeys, "plan gates");
  for (const key of gateKeys.slice(0, 4)) {
    if (plan.gates[key] !== true) fail(`${key} must remain passed`);
  }
  for (const key of gateKeys.slice(4)) {
    if (plan.gates[key] !== false) fail(`${key} must remain false`);
  }
  return {
    expectedProjectionSha256: expected.projectionSha256,
    planSha256: sha256(readRegular(planPath, 512 * 1024, "inventory plan")),
    profileCount: expected.guests.profileCount,
  };
}

function validatePlatform(platform) {
  exactKeys(
    platform,
    [
      "architecture",
      "runningKernel",
      "cpuCount",
      "hardwareVirtualizationFlag",
      "kvmDevicePresent",
      "iommuGroupCount",
      "bootMode",
      "loadedModules",
    ],
    "platform",
  );
  if (
    platform.architecture !== "x86_64" ||
    platform.runningKernel !== "7.0.6-2-pve" ||
    platform.cpuCount !== 16 ||
    platform.hardwareVirtualizationFlag !== "vmx" ||
    platform.kvmDevicePresent !== true ||
    platform.iommuGroupCount !== 11 ||
    platform.bootMode !== "bios"
  ) {
    fail("platform inventory differs");
  }
  exactKeys(
    platform.loadedModules,
    ["bridge", "kvm", "kvm_amd", "kvm_intel", "vfio_pci", "vhost_net", "zfs"],
    "loaded modules",
  );
  const expected = {
    bridge: true,
    kvm: true,
    kvm_amd: false,
    kvm_intel: true,
    vfio_pci: false,
    vhost_net: true,
    zfs: false,
  };
  assert.deepStrictEqual(platform.loadedModules, expected);
}

function validateGuestPlan(guests) {
  exactKeys(
    guests,
    ["counts", "profileCount", "profiles", "criticalWorkloads"],
    "guest plan",
  );
  exactKeys(
    guests.counts,
    ["total", "qemu", "lxc", "running", "stopped", "pausedOrSuspended"],
    "guest counts",
  );
  assert.deepStrictEqual(guests.counts, {
    total: 22,
    qemu: 18,
    lxc: 4,
    running: 20,
    stopped: 2,
    pausedOrSuspended: 0,
  });
  if (guests.profileCount !== 19 || guests.profiles?.length !== 19) {
    fail("guest profile count differs");
  }
  let guestTotal = 0;
  let qemuProfiles = 0;
  let lxcProfiles = 0;
  let previous = "";
  for (const [index, profile] of guests.profiles.entries()) {
    validateSummaryProfile(profile, `guest profile ${index}`);
    if (profile.profileSha256 <= previous)
      fail("guest profiles are not canonical");
    previous = profile.profileSha256;
    guestTotal += profile.count;
    qemuProfiles += Number(profile.type === "qemu");
    lxcProfiles += Number(profile.type === "lxc");
  }
  if (guestTotal !== 22 || qemuProfiles !== 15 || lxcProfiles !== 4) {
    fail("guest profile coverage does not reconcile");
  }
  if (
    !Array.isArray(guests.criticalWorkloads) ||
    guests.criticalWorkloads.length !== 2
  ) {
    fail("critical workload inventory differs");
  }
  guests.criticalWorkloads.forEach((workload, index) => {
    exactKeys(
      workload,
      ["id", "type", "status", "profileSha256"],
      `critical workload ${index}`,
    );
    if (
      workload.id !== ["application", "database"][index] ||
      workload.type !== "qemu" ||
      workload.status !== "running" ||
      workload.profileSha256 !==
        "692f58829f2ee746c654e1e9551beff66f87aeee657f2e9d14f77ddc0e6f6dec"
    ) {
      fail(`critical workload ${index} differs`);
    }
  });
}

function validateStorages(storages) {
  if (!Array.isArray(storages) || storages.length !== 2)
    fail("storage inventory differs");
  const expected = [
    {
      type: "dir",
      content: [
        "backup",
        "images",
        "import",
        "iso",
        "rootdir",
        "snippets",
        "vztmpl",
      ],
      active: true,
      enabled: true,
      shared: false,
    },
    {
      type: "lvmthin",
      content: ["images", "rootdir"],
      active: true,
      enabled: true,
      shared: false,
    },
  ];
  assert.deepStrictEqual(storages, expected);
}

function validateNetwork(network) {
  exactKeys(
    network,
    ["ipv4DefaultRouteCount", "kindCounts", "stateCounts"],
    "network inventory",
  );
  assert.deepStrictEqual(network, {
    ipv4DefaultRouteCount: 1,
    kindCounts: { bridge: 4, "guest-virtual": 71, loopback: 1, physical: 1 },
    stateCounts: { unknown: 18, up: 59 },
  });
}

function validateProjectionShape(projection, plan) {
  exactKeys(
    projection,
    [
      "pveVersion",
      "platform",
      "guests",
      "storages",
      "services",
      "network",
      "haResourceCount",
    ],
    "projection",
  );
  if (projection.pveVersion !== plan.expectedInventory.pveVersion)
    fail("PVE version differs");
  assert.deepStrictEqual(projection.platform, plan.expectedInventory.platform);
  exactKeys(
    projection.guests,
    ["counts", "profiles", "criticalWorkloads"],
    "guest facts",
  );
  assert.deepStrictEqual(
    projection.guests.counts,
    plan.expectedInventory.guests.counts,
  );
  if (
    projection.guests.profiles?.length !==
    plan.expectedInventory.guests.profileCount
  ) {
    fail("fact profile count differs");
  }
  const summaries = [];
  for (const [index, profile] of projection.guests.profiles.entries()) {
    exactKeys(
      profile,
      ["profileSha256", "type", "count", "statusCounts", "projection"],
      `fact profile ${index}`,
    );
    validateSummaryProfile(
      {
        profileSha256: profile.profileSha256,
        type: profile.type,
        count: profile.count,
        statusCounts: profile.statusCounts,
      },
      `fact profile ${index}`,
    );
    exactKeys(
      profile.projection,
      profile.type === "qemu" ? qemuProjectionKeys : lxcProjectionKeys,
      `fact profile ${index} projection`,
    );
    if (
      sha256(
        canonical({ type: profile.type, projection: profile.projection }),
      ) !== profile.profileSha256
    ) {
      fail(`fact profile ${index} digest differs`);
    }
    for (const [key, value] of Object.entries(profile.projection)) {
      if (typeof value === "string" && value.length > 64) {
        fail(`fact profile ${index} ${key} is oversized`);
      }
      if (typeof value === "number")
        integer(value, 0, 512, `fact profile ${index} ${key}`);
      if (key.endsWith("Count") || key === "keyCount") {
        integer(value, 0, 512, `fact profile ${index} ${key}`);
      }
    }
    summaries.push({
      profileSha256: profile.profileSha256,
      type: profile.type,
      count: profile.count,
      statusCounts: profile.statusCounts,
    });
  }
  assert.deepStrictEqual(summaries, plan.expectedInventory.guests.profiles);
  assert.deepStrictEqual(
    projection.guests.criticalWorkloads,
    plan.expectedInventory.guests.criticalWorkloads,
  );
  assert.deepStrictEqual(projection.storages, plan.expectedInventory.storages);
  if (
    !Array.isArray(projection.services) ||
    projection.services.length !== exactServiceIds.length
  ) {
    fail("service facts differ");
  }
  projection.services.forEach((service, index) => {
    exactKeys(
      service,
      ["id", "loadState", "activeState", "subState", "unitFileState"],
      `service fact ${index}`,
    );
    if (
      service.id !== exactServiceIds[index] ||
      service.loadState !== "loaded" ||
      service.activeState !== "active" ||
      service.subState !== "running" ||
      service.unitFileState !== "enabled"
    ) {
      fail(`service fact ${index} differs`);
    }
  });
  assert.deepStrictEqual(projection.network, plan.expectedInventory.network);
  if (projection.haResourceCount !== 0) fail("HA resource facts differ");
}

function scanMinimized(value, label) {
  const text = JSON.stringify(value);
  if (
    /(?:^|[^0-9])(?:10\.|127\.|169\.254\.|172\.(?:1[6-9]|2[0-9]|3[01])\.|192\.168\.)[0-9.]+/u.test(
      text,
    ) ||
    /\b[0-9a-f]{2}(?::[0-9a-f]{2}){5}\b/iu.test(text) ||
    /-----BEGIN [A-Z ]+PRIVATE KEY-----/u.test(text)
  ) {
    fail(`${label} contains an address, MAC, or private key`);
  }
  const prohibitedKeys = new Set([
    "hostname",
    "node",
    "name",
    "vmid",
    "mac",
    "address",
    "ip",
    "username",
    "route",
    "path",
    "secret",
    "credential",
    "raw",
  ]);
  const visit = (item) => {
    if (!item || typeof item !== "object") return;
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    for (const [key, child] of Object.entries(item)) {
      if (prohibitedKeys.has(key.toLowerCase()))
        fail(`${label} contains prohibited field ${key}`);
      visit(child);
    }
  };
  visit(value);
}

export function validateFacts(facts, plan, validatedPlan, options = {}) {
  exactKeys(
    facts,
    [
      "schema",
      "observedAt",
      "endpointId",
      "tools",
      "projection",
      "projectionSha256",
      "stableRead",
      "elapsedMilliseconds",
    ],
    "facts",
  );
  if (
    facts.schema !== "starfiniti.proxmox-compatibility-inventory-facts.v1" ||
    facts.endpointId !== "proxmox-host" ||
    facts.stableRead !== true
  ) {
    fail("fact identity differs");
  }
  const observedAt = exactUtc(facts.observedAt, "fact observedAt");
  if (
    options.requireFresh !== false &&
    (Date.now() - observedAt < -30_000 ||
      Date.now() - observedAt > plan.collector.maximumFactAgeSeconds * 1_000)
  ) {
    fail("facts are stale or future-dated");
  }
  integer(
    facts.elapsedMilliseconds,
    1,
    plan.collector.maximumDurationSeconds * 1_000,
    "fact duration",
  );
  assert.deepStrictEqual(facts.tools, plan.expectedInventory.tools);
  validateProjectionShape(facts.projection, plan);
  const projectionSha256 = sha256(canonical(facts.projection));
  if (
    facts.projectionSha256 !== projectionSha256 ||
    projectionSha256 !== validatedPlan.expectedProjectionSha256
  ) {
    fail("fact projection digest differs");
  }
  scanMinimized(facts, "facts");
  return { observedAt: facts.observedAt, projectionSha256 };
}

function reportDigest(report) {
  const copy = structuredClone(report);
  delete copy.reportSha256;
  return sha256(canonical(copy));
}

function buildReport(
  facts,
  plan,
  validatedPlan,
  implementationCommit,
  options = {},
) {
  validateFacts(facts, plan, validatedPlan, options);
  const profiles = facts.projection.guests.profiles.map((profile) => ({
    profileSha256: profile.profileSha256,
    type: profile.type,
    count: profile.count,
    statusCounts: profile.statusCounts,
  }));
  const report = {
    schema: "starfiniti.proxmox-compatibility-inventory-report.v1",
    generatedAt: facts.observedAt,
    inventory: {
      implementationCommit,
      planFileSha256: validatedPlan.planSha256,
      collectorFileSha256: exactCollectorSha256,
      candidateProvenanceSha256: exactCandidateProvenance,
      preflightReportSha256: exactPreflightReportSha256,
      factProjectionSha256: facts.projectionSha256,
    },
    endpoint: {
      pveVersion: facts.projection.pveVersion,
      platform: facts.projection.platform,
      guestCounts: facts.projection.guests.counts,
      guestProfiles: profiles,
      criticalWorkloads: facts.projection.guests.criticalWorkloads,
      storages: facts.projection.storages,
      services: facts.projection.services,
      network: facts.projection.network,
      haResourceCount: facts.projection.haResourceCount,
    },
    summary: {
      guests: facts.projection.guests.counts.total,
      qemuGuests: facts.projection.guests.counts.qemu,
      lxcGuests: facts.projection.guests.counts.lxc,
      guestProfiles: profiles.length,
      storageProfiles: facts.projection.storages.length,
      requiredServices: facts.projection.services.length,
      stableRead: facts.stableRead,
      rawFactsRetained: false,
      packageManagerUsed: false,
      configurationWritten: false,
      serviceControlled: false,
      guestControlled: false,
      storageWritten: false,
      rebooted: false,
    },
    gates: {
      ...plan.gates,
      consumerInventoryCaptured: true,
    },
    reportSha256: "",
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
      "inventory",
      "endpoint",
      "summary",
      "gates",
      "reportSha256",
    ],
    "report",
  );
  if (
    report.schema !== "starfiniti.proxmox-compatibility-inventory-report.v1"
  ) {
    fail("report identity differs");
  }
  exactUtc(report.generatedAt, "report generatedAt");
  exactKeys(
    report.inventory,
    [
      "implementationCommit",
      "planFileSha256",
      "collectorFileSha256",
      "candidateProvenanceSha256",
      "preflightReportSha256",
      "factProjectionSha256",
    ],
    "report inventory",
  );
  if (
    !commitPattern.test(report.inventory.implementationCommit) ||
    report.inventory.planFileSha256 !== validatedPlan.planSha256 ||
    report.inventory.collectorFileSha256 !== exactCollectorSha256 ||
    report.inventory.candidateProvenanceSha256 !== exactCandidateProvenance ||
    report.inventory.preflightReportSha256 !== exactPreflightReportSha256 ||
    report.inventory.factProjectionSha256 !==
      validatedPlan.expectedProjectionSha256
  ) {
    fail("report inventory binding differs");
  }
  exactKeys(
    report.endpoint,
    [
      "pveVersion",
      "platform",
      "guestCounts",
      "guestProfiles",
      "criticalWorkloads",
      "storages",
      "services",
      "network",
      "haResourceCount",
    ],
    "report endpoint",
  );
  assert.deepStrictEqual(
    report.endpoint.pveVersion,
    plan.expectedInventory.pveVersion,
  );
  assert.deepStrictEqual(
    report.endpoint.platform,
    plan.expectedInventory.platform,
  );
  assert.deepStrictEqual(
    report.endpoint.guestCounts,
    plan.expectedInventory.guests.counts,
  );
  assert.deepStrictEqual(
    report.endpoint.guestProfiles,
    plan.expectedInventory.guests.profiles,
  );
  assert.deepStrictEqual(
    report.endpoint.criticalWorkloads,
    plan.expectedInventory.guests.criticalWorkloads,
  );
  assert.deepStrictEqual(
    report.endpoint.storages,
    plan.expectedInventory.storages,
  );
  if (
    !Array.isArray(report.endpoint.services) ||
    report.endpoint.services.length !== exactServiceIds.length
  ) {
    fail("report service inventory differs");
  }
  report.endpoint.services.forEach((service, index) => {
    if (
      service.id !== exactServiceIds[index] ||
      service.loadState !== "loaded" ||
      service.activeState !== "active" ||
      service.subState !== "running" ||
      service.unitFileState !== "enabled"
    ) {
      fail(`report service ${index} differs`);
    }
  });
  assert.deepStrictEqual(
    report.endpoint.network,
    plan.expectedInventory.network,
  );
  if (report.endpoint.haResourceCount !== 0)
    fail("report HA inventory differs");
  exactKeys(
    report.summary,
    [
      "guests",
      "qemuGuests",
      "lxcGuests",
      "guestProfiles",
      "storageProfiles",
      "requiredServices",
      "stableRead",
      "rawFactsRetained",
      "packageManagerUsed",
      "configurationWritten",
      "serviceControlled",
      "guestControlled",
      "storageWritten",
      "rebooted",
    ],
    "report summary",
  );
  assert.deepStrictEqual(report.summary, {
    guests: plan.expectedInventory.guests.counts.total,
    qemuGuests: plan.expectedInventory.guests.counts.qemu,
    lxcGuests: plan.expectedInventory.guests.counts.lxc,
    guestProfiles: plan.expectedInventory.guests.profileCount,
    storageProfiles: plan.expectedInventory.storages.length,
    requiredServices: plan.expectedInventory.services.length,
    stableRead: true,
    rawFactsRetained: false,
    packageManagerUsed: false,
    configurationWritten: false,
    serviceControlled: false,
    guestControlled: false,
    storageWritten: false,
    rebooted: false,
  });
  const expectedGates = { ...plan.gates, consumerInventoryCaptured: true };
  assert.deepStrictEqual(report.gates, expectedGates);
  if (
    report.gates.compatibilityProved !== false ||
    report.gates.rollbackEscrowComplete !== false ||
    report.gates.recoveryReady !== false ||
    report.gates.maintenanceApproved !== false ||
    report.gates.rebootApproved !== false ||
    report.gates.productionMutation !== false
  ) {
    fail("report advances prohibited authority");
  }
  scanMinimized(report, "report");
  if (
    !digestPattern.test(report.reportSha256) ||
    report.reportSha256 !== reportDigest(report)
  ) {
    fail("report digest differs");
  }
  return {
    reportSha256: report.reportSha256,
    generatedAt: report.generatedAt,
    implementationCommit: report.inventory.implementationCommit,
  };
}

function fixture(plan, validatedPlan) {
  const fixturePlan = structuredClone(plan);
  const projection = {
    pveVersion: plan.expectedInventory.pveVersion,
    platform: plan.expectedInventory.platform,
    guests: {
      counts: {
        total: 2,
        qemu: 2,
        lxc: 0,
        running: 2,
        stopped: 0,
        pausedOrSuspended: 0,
      },
      profiles: [],
      criticalWorkloads: [],
    },
    storages: plan.expectedInventory.storages,
    services: exactServiceIds.map((id) => ({
      id,
      loadState: "loaded",
      activeState: "active",
      subState: "running",
      unitFileState: "enabled",
    })),
    network: plan.expectedInventory.network,
    haResourceCount: 0,
  };
  const qemuProjection = {
    bios: "seabios",
    bridgedNicCount: 1,
    cloudInitConfigured: false,
    cpuType: "host",
    customArguments: false,
    diskBuses: { scsi: 1 },
    efiConfigured: false,
    firewalledNicCount: 1,
    guestAgentConfigured: true,
    hookscript: false,
    hostPciDeviceCount: 0,
    keyCount: 4,
    keySetSha256: "a".repeat(64),
    machine: "default",
    nicModels: { virtio: 1 },
    numaConfigured: false,
    ostype: "l26",
    protection: false,
    scsiController: "virtio-scsi-single",
    serialDeviceCount: 1,
    startupPolicy: true,
    tpmConfigured: false,
    usbDeviceCount: 0,
  };
  const profileSha256 = sha256(
    canonical({ type: "qemu", projection: qemuProjection }),
  );
  projection.guests.profiles = [
    {
      profileSha256,
      type: "qemu",
      count: 2,
      statusCounts: { running: 2 },
      projection: qemuProjection,
    },
  ];
  projection.guests.criticalWorkloads = ["application", "database"].map(
    (id) => ({
      id,
      type: "qemu",
      status: "running",
      profileSha256,
    }),
  );
  fixturePlan.expectedInventory.guests = {
    counts: projection.guests.counts,
    profileCount: 1,
    profiles: [
      { profileSha256, type: "qemu", count: 2, statusCounts: { running: 2 } },
    ],
    criticalWorkloads: projection.guests.criticalWorkloads,
  };
  const projectionSha256 = sha256(canonical(projection));
  fixturePlan.expectedInventory.projectionSha256 = projectionSha256;
  return {
    fixturePlan,
    fixtureValidated: {
      ...validatedPlan,
      expectedProjectionSha256: projectionSha256,
    },
    facts: {
      schema: "starfiniti.proxmox-compatibility-inventory-facts.v1",
      observedAt: "2026-08-29T02:10:00Z",
      endpointId: "proxmox-host",
      tools: plan.expectedInventory.tools,
      projection,
      projectionSha256,
      stableRead: true,
      elapsedMilliseconds: 1_000,
    },
  };
}

function expectFailure(value, mutate, validate) {
  const changed = structuredClone(value);
  mutate(changed);
  assert.throws(() => validate(changed));
}

function selfTest(plan, validatedPlan) {
  const { fixturePlan, fixtureValidated, facts } = fixture(plan, validatedPlan);
  validateFacts(facts, fixturePlan, fixtureValidated, { requireFresh: false });
  const factCases = [
    (value) => (value.schema = "forged"),
    (value) => (value.endpointId = "database-guest"),
    (value) => (value.observedAt = "2026-08-29 02:10:00"),
    (value) => (value.stableRead = false),
    (value) => (value.elapsedMilliseconds = 120_001),
    (value) => value.tools.pop(),
    (value) => value.tools.reverse(),
    (value) => (value.tools[0].sha256 = "b".repeat(64)),
    (value) => (value.projection.pveVersion = "pve-manager/forged"),
    (value) => (value.projection.platform.runningKernel = "7.0.14-14-pve"),
    (value) => (value.projection.platform.kvmDevicePresent = false),
    (value) => (value.projection.platform.loadedModules.kvm = false),
    (value) => (value.projection.guests.counts.total = 3),
    (value) => value.projection.guests.profiles.pop(),
    (value) => (value.projection.guests.profiles[0].count = 1),
    (value) =>
      (value.projection.guests.profiles[0].profileSha256 = "b".repeat(64)),
    (value) =>
      (value.projection.guests.profiles[0].projection.customArguments = true),
    (value) =>
      (value.projection.guests.profiles[0].projection.hostname = "forged"),
    (value) =>
      (value.projection.guests.criticalWorkloads[0].status = "stopped"),
    (value) => (value.projection.guests.criticalWorkloads[0].vmid = 970),
    (value) => value.projection.storages.pop(),
    (value) => (value.projection.storages[0].active = false),
    (value) => value.projection.services.pop(),
    (value) => (value.projection.services[0].activeState = "inactive"),
    (value) => (value.projection.network.ipv4DefaultRouteCount = 0),
    (value) => (value.projection.haResourceCount = 1),
    (value) => (value.projectionSha256 = "b".repeat(64)),
    (value) => (value.route = "ssh://forged"),
  ];
  for (const mutate of factCases) {
    expectFailure(facts, mutate, (value) =>
      validateFacts(value, fixturePlan, fixtureValidated, {
        requireFresh: false,
      }),
    );
  }
  const planCases = [
    (value) => (value.collector.routeInput = "allowed"),
    (value) => (value.collector.credentialInput = "allowed"),
    (value) => (value.collector.packageManager = "allowed"),
    (value) => (value.collector.serviceControl = "allowed"),
    (value) => (value.collector.guestControl = "allowed"),
    (value) => (value.collector.storageWrite = "allowed"),
    (value) => (value.collector.reboot = "allowed"),
    (value) => (value.expectedInventory.projectionSha256 = "b".repeat(64)),
    (value) => value.expectedInventory.guests.profiles.pop(),
    (value) => value.expectedInventory.services.pop(),
    (value) => (value.rehearsalMatrix[0].status = "passed"),
    (value) => value.rehearsalMatrix.pop(),
    (value) => (value.gates.consumerInventoryCaptured = true),
    (value) => (value.gates.compatibilityProved = true),
    (value) => (value.gates.productionMutation = true),
  ];
  for (const mutate of planCases) expectFailure(plan, mutate, validatePlan);
  const report = buildReport(
    facts,
    fixturePlan,
    fixtureValidated,
    "c".repeat(40),
    { requireFresh: false },
  );
  validateReport(report, fixturePlan, fixtureValidated);
  const reportCases = [
    (value) => (value.schema = "forged"),
    (value) => (value.inventory.implementationCommit = "short"),
    (value) => (value.inventory.collectorFileSha256 = "b".repeat(64)),
    (value) => (value.endpoint.guestCounts.total = 23),
    (value) => value.endpoint.guestProfiles.pop(),
    (value) => (value.endpoint.criticalWorkloads[0].status = "stopped"),
    (value) => (value.endpoint.services[0].activeState = "inactive"),
    (value) => (value.summary.rawFactsRetained = true),
    (value) => (value.summary.packageManagerUsed = true),
    (value) => (value.gates.consumerInventoryCaptured = false),
    (value) => (value.gates.compatibilityProved = true),
    (value) => (value.gates.productionMutation = true),
    (value) => (value.reportSha256 = "b".repeat(64)),
  ];
  for (const mutate of reportCases) {
    expectFailure(report, mutate, (value) =>
      validateReport(value, fixturePlan, fixtureValidated),
    );
  }
  const outputDirectory = mkdtempSync(
    join(tmpdir(), "starfiniti-proxmox-compatibility-inventory-"),
  );
  let written;
  try {
    written = writeReport(report, "c".repeat(40), outputDirectory);
    const { value: writtenReport } = parseJson(
      written.output,
      256 * 1024,
      "self-test report",
    );
    validateReport(writtenReport, fixturePlan, fixtureValidated);
    assert.throws(
      () => writeReport(report, "c".repeat(40), outputDirectory),
      /reports are never overwritten/u,
    );
  } finally {
    if (written?.output && existsSync(written.output)) {
      unlinkSync(written.output);
    }
    rmdirSync(outputDirectory);
  }
  process.stdout.write(
    `Validated ${plan.expectedInventory.guests.counts.total} anonymous guests across ${plan.expectedInventory.guests.profileCount} exact profiles, ${plan.expectedInventory.storages.length} storage profiles, ${plan.expectedInventory.services.length} services, ${plan.rehearsalMatrix.length} pending rehearsals, ${factCases.length + planCases.length + reportCases.length} adversarial cases, and exclusive report publication; compatibility and production mutation remain false.\n`,
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

function readBoundedStdin(maximumBytes, label) {
  const chunks = [];
  let total = 0;
  const buffer = Buffer.alloc(16 * 1024);
  while (true) {
    const count = readSync(0, buffer, 0, buffer.length, null);
    if (count === 0) break;
    total += count;
    if (total > maximumBytes) fail(`${label} exceeds the byte bound`);
    chunks.push(Buffer.from(buffer.subarray(0, count)));
  }
  if (total === 0) fail(`${label} is empty`);
  return Buffer.concat(chunks);
}

function resolveInput(value, label) {
  const absolute = isAbsolute(value) ? resolve(value) : resolve(root, value);
  if (!existsSync(absolute)) fail(`${label} does not exist`);
  return absolute;
}

function writeReport(
  report,
  implementationCommit,
  outputDirectory = evidenceDirectory,
) {
  const parent = lstatSync(outputDirectory, { throwIfNoEntry: false });
  if (!parent?.isDirectory() || parent.isSymbolicLink()) {
    fail("evidence parent is not a pre-existing regular directory");
  }
  const timestamp = report.generatedAt.replaceAll(":", "");
  const basename = `proxmox-compatibility-inventory-${implementationCommit.slice(0, 7)}-${timestamp}.json`;
  const output = join(outputDirectory, basename);
  const bytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`, "utf8");
  let descriptor;
  let created = false;
  let completed = false;
  let createdIdentity;
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
    if (!opened.isFile()) fail("evidence output is not a regular file");
    createdIdentity = { dev: opened.dev, ino: opened.ino };
    let offset = 0;
    while (offset < bytes.length) {
      const count = writeSync(
        descriptor,
        bytes,
        offset,
        bytes.length - offset,
        offset,
      );
      if (count === 0) fail("evidence write stopped before completion");
      offset += count;
    }
    fsyncSync(descriptor);
    const written = fstatSync(descriptor);
    if (
      !written.isFile() ||
      written.size !== bytes.length ||
      (process.platform !== "win32" && (written.mode & 0o777) !== 0o600)
    ) {
      fail("written evidence is not an exact bounded regular file");
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
      fail("written evidence path identity differs");
    }
    completed = true;
  } catch (error) {
    if (error && typeof error === "object" && error.code === "EEXIST") {
      fail("evidence output already exists; reports are never overwritten");
    }
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (created && !completed && createdIdentity) {
      try {
        const status = lstatSync(output);
        if (
          status.isFile() &&
          status.dev === createdIdentity.dev &&
          status.ino === createdIdentity.ino
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
  return { output, bytes: bytes.length, sha256: sha256(bytes) };
}

function main() {
  const { value: plan } = parseYaml(planPath, 512 * 1024, "inventory plan");
  const validatedPlan = validatePlan(plan);
  const arguments_ = process.argv.slice(2);
  if (arguments_.length === 1 && arguments_[0] === "--self-test") {
    selfTest(plan, validatedPlan);
    return;
  }
  if (arguments_.length === 2 && arguments_[0] === "--verify-report") {
    const { value: report } = parseJson(
      resolveInput(arguments_[1], "inventory report"),
      256 * 1024,
      "inventory report",
    );
    const result = validateReport(report, plan, validatedPlan);
    process.stdout.write(
      `Verified Proxmox compatibility inventory ${result.reportSha256} from ${result.generatedAt}; implementation ${result.implementationCommit}; compatibility and production mutation remain false.\n`,
    );
    return;
  }
  if (
    arguments_.length === 3 &&
    arguments_[0] === "--capture" &&
    arguments_[1] === "--facts"
  ) {
    const implementationCommit = exactCleanHead();
    const factsBytes =
      arguments_[2] === "-"
        ? readBoundedStdin(plan.collector.maximumFactBytes, "inventory facts")
        : readRegular(
            resolveInput(arguments_[2], "inventory facts"),
            plan.collector.maximumFactBytes,
            "inventory facts",
          );
    if (factsBytes.includes(0)) fail("inventory facts contain a NUL byte");
    const facts = parseJsonBytes(factsBytes, "inventory facts");
    const report = buildReport(
      facts,
      plan,
      validatedPlan,
      implementationCommit,
    );
    validateReport(report, plan, validatedPlan);
    if (exactCleanHead() !== implementationCommit)
      fail("implementation head changed during capture");
    const written = writeReport(report, implementationCommit);
    process.stdout.write(
      `Captured ${report.summary.guests} anonymous guests across ${report.summary.guestProfiles} exact profiles in ${relative(root, written.output).replaceAll("\\", "/")}; ${written.bytes} bytes; SHA-256 ${written.sha256}; compatibility, package management, configuration write, service or guest control, storage write, reboot, route, credential, raw-fact retention, and production mutation remain false.\n`,
    );
    return;
  }
  fail(
    "usage: --self-test | --capture --facts <path> | --verify-report <path>",
  );
}

try {
  main();
} catch (error) {
  if (error instanceof Error) console.error(error.message);
  else
    console.error(
      "Proxmox compatibility inventory failed with an unknown error",
    );
  process.exitCode = 1;
}
