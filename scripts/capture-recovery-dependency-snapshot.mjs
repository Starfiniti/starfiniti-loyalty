import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readSync,
  rmSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import {
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";
import { TextDecoder } from "node:util";

import YAML from "yaml";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const policyRelativePath =
  "infrastructure/governance/recovery-dependency-snapshot-v1.yaml";
const rsyncPlanRelativePath =
  "infrastructure/testing/recovery-transport/plan.yaml";
const policyPath = join(root, policyRelativePath);
const rsyncPlanPath = join(root, rsyncPlanRelativePath);
const attributesPath = join(root, ".gitattributes");
const sourceAttribute =
  "docs/plan/evidence/M16/runs/provider-source-snapshot-*.json -text";
const snapshotAttribute =
  "docs/plan/evidence/M16/runs/recovery-dependency-snapshot-*.json -text";
const factsSchema = "starfiniti.recovery-endpoint-facts.v1";
const snapshotSchema = "starfiniti.recovery-dependency-snapshot.v1";
const sourceSchema = "starfiniti.provider-source-snapshot.v1";
const limitation =
  "This artifact proves the complete installed recovery-dependency fact catalogue supplied through the approved read-only route. It does not attest the operator route, complete candidate selection, classify provider impact, approve an upgrade, close dependency review, or authorize production mutation.";
const unresolvedReason =
  "Human candidate selection, official-source impact classification, ownership, and provenance review remain required.";
const digestPattern = /^[a-f0-9]{64}$/u;
const commitPattern = /^[a-f0-9]{40}$/u;
const idPattern = /^[a-z][a-z0-9-]{1,63}$/u;
const safeFactPattern = /^[0-9A-Za-z .+_:~()/\-]{1,128}$/u;
const utf8 = new TextDecoder("utf-8", { fatal: true });

const endpointDefinitions = new Map([
  [
    "proxmox-host",
    {
      osProvider: "debian",
      packageIds: [
        "rsync",
        "borgbackup",
        "openssh-client",
        "openssh-server",
        "pve-manager",
      ],
      executableIds: ["rsync", "borg", "ssh", "sshd"],
      platformIds: ["proxmox"],
    },
  ],
  [
    "database-guest",
    {
      osProvider: "ubuntu",
      packageIds: ["rsync", "openssh-client", "openssh-server"],
      executableIds: ["rsync", "ssh", "sshd"],
      platformIds: [],
    },
  ],
]);

const providerDefinitions = new Map([
  [
    "rsync",
    {
      installedEndpoints: ["proxmox-host", "database-guest"],
      packageIds: ["rsync"],
      executableIds: ["rsync"],
      platformIds: [],
      osProvider: null,
    },
  ],
  [
    "borgbackup",
    {
      installedEndpoints: ["proxmox-host"],
      packageIds: ["borgbackup"],
      executableIds: ["borg"],
      platformIds: [],
      osProvider: null,
    },
  ],
  [
    "openssh",
    {
      installedEndpoints: ["proxmox-host", "database-guest"],
      packageIds: ["openssh-client", "openssh-server"],
      executableIds: ["ssh", "sshd"],
      platformIds: [],
      osProvider: null,
    },
  ],
  [
    "debian",
    {
      installedEndpoints: ["proxmox-host"],
      packageIds: [],
      executableIds: [],
      platformIds: [],
      osProvider: "debian",
    },
  ],
  [
    "ubuntu",
    {
      installedEndpoints: ["database-guest"],
      packageIds: [],
      executableIds: [],
      platformIds: [],
      osProvider: "ubuntu",
    },
  ],
  [
    "proxmox",
    {
      installedEndpoints: ["proxmox-host"],
      packageIds: ["pve-manager"],
      executableIds: [],
      platformIds: ["proxmox"],
      osProvider: null,
    },
  ],
]);

const sourceUrls = new Map([
  ["supabase", "https://supabase.com/changelog.md"],
  ["postgresql", "https://www.postgresql.org/support/versioning/"],
  ["woocommerce", "https://developer.woocommerce.com/changelog/"],
  ["stripe", "https://docs.stripe.com/changelog"],
  ["authentik", "https://docs.goauthentik.io/releases/"],
  ["klaviyo", "https://developers.klaviyo.com/en/docs/changelog_"],
  ["nodejs", "https://nodejs.org/en/about/previous-releases"],
  ["rsync", "https://download.samba.org/pub/rsync/NEWS"],
  ["borgbackup", "https://borgbackup.readthedocs.io/en/stable/changes.html"],
  ["openssh", "https://www.openssh.com/releasenotes.html"],
  ["debian", "https://www.debian.org/security/"],
  ["ubuntu", "https://ubuntu.com/security/notices"],
  ["proxmox", "https://forum.proxmox.com/forums/security-advisories.26/"],
]);
const sourceIds = new Set(sourceUrls.keys());
const sourceLimitation =
  "This artifact proves bounded official-source freshness and byte provenance only. It does not complete provider review, classify impact, prove installed versions, approve an upgrade, or close a monthly review.";

function fail(message) {
  throw new Error(`Recovery dependency snapshot failed: ${message}`);
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalBytes(value) {
  return Buffer.from(JSON.stringify(value), "utf8");
}

function exactSet(actual, expected, label) {
  if (
    actual.size !== expected.size ||
    [...expected].some((value) => !actual.has(value))
  ) {
    fail(`${label} differs from the required closed set`);
  }
}

function exactObjectKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} is not an object`);
  }
  exactSet(new Set(Object.keys(value)), new Set(expected), `${label} keys`);
}

function exactUtc(value, label) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().replace(".000Z", "Z") !== value
  ) {
    fail(`${label} is not an exact UTC instant`);
  }
  return Date.parse(value);
}

function nowUtc(now = Date.now()) {
  return new Date(Math.floor(now / 1_000) * 1_000)
    .toISOString()
    .replace(".000Z", "Z");
}

function safeFact(value, label) {
  if (
    typeof value !== "string" ||
    !safeFactPattern.test(value) ||
    value.includes("://") ||
    value.includes("@") ||
    /(?:BEGIN [A-Z ]+PRIVATE KEY|eyJ[A-Za-z0-9_-]{8})/u.test(value)
  ) {
    fail(`${label} is not a bounded public software fact`);
  }
  return value;
}

function exactDigest(value, label) {
  if (!digestPattern.test(value ?? "") || /^0{64}$/u.test(value)) {
    fail(`${label} is not a nonzero SHA-256 digest`);
  }
  return value;
}

function orderedUnique(items, expected, label) {
  if (!Array.isArray(items)) fail(`${label} is not an array`);
  const ids = items.map((item) => item?.id ?? item?.endpointId);
  if (ids.some((id) => typeof id !== "string")) {
    fail(`${label} contains an invalid id`);
  }
  if (new Set(ids).size !== ids.length)
    fail(`${label} contains a duplicate id`);
  if (
    ids.length !== expected.length ||
    ids.some((id, index) => id !== expected[index])
  ) {
    fail(`${label} order or membership differs`);
  }
  return items;
}

function readStableFile(path, maximumBytes, label) {
  let descriptor;
  try {
    descriptor = openSync(
      path,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    const beforeDescriptor = fstatSync(descriptor);
    const beforePath = lstatSync(path);
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
    const afterPath = lstatSync(path);
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

function parseYaml(bytes, label) {
  try {
    return YAML.parse(bytes.toString("utf8"));
  } catch {
    fail(`${label} YAML is invalid`);
  }
}

function validateAttributesBytes(bytes) {
  const lines = bytes
    .toString("utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim() !== "");
  for (const required of [sourceAttribute, snapshotAttribute]) {
    if (lines.filter((line) => line === required).length !== 1) {
      fail("snapshot byte-preservation attributes differ");
    }
  }
}

function validateAttributes() {
  const raw = readStableFile(attributesPath, 64 * 1024, "Git attributes");
  validateAttributesBytes(raw);
  return raw;
}

function validatePolicy(policy) {
  exactObjectKeys(
    policy,
    [
      "schema",
      "version",
      "timezone",
      "facts",
      "providers",
      "providerSourceSnapshot",
      "candidateReferences",
      "assertions",
      "output",
    ],
    "snapshot policy",
  );
  if (
    policy.schema !== "starfiniti.recovery-dependency-snapshot-plan.v1" ||
    policy.version !== 1 ||
    policy.timezone !== "UTC"
  ) {
    fail("snapshot policy identity differs");
  }
  exactObjectKeys(
    policy.facts,
    [
      "schema",
      "maximumDecodedBytes",
      "maximumObservationAgeSeconds",
      "productionMutation",
      "captureMethod",
      "endpoints",
    ],
    "facts policy",
  );
  if (
    policy.facts.schema !== factsSchema ||
    policy.facts.maximumDecodedBytes !== 8_192 ||
    policy.facts.maximumObservationAgeSeconds !== 3_600 ||
    policy.facts.productionMutation !== false ||
    policy.facts.captureMethod !== "approved-read-only-ssh"
  ) {
    fail("facts policy bounds or assertions differ");
  }
  orderedUnique(
    policy.facts.endpoints,
    [...endpointDefinitions.keys()],
    "facts endpoints",
  );
  for (const endpoint of policy.facts.endpoints) {
    exactObjectKeys(
      endpoint,
      ["id", "osProvider", "packageIds", "executableIds", "platformIds"],
      `${endpoint.id} policy endpoint`,
    );
    const expected = endpointDefinitions.get(endpoint.id);
    if (endpoint.osProvider !== expected.osProvider) {
      fail(`${endpoint.id} OS provider differs`);
    }
    for (const key of ["packageIds", "executableIds", "platformIds"]) {
      if (
        !Array.isArray(endpoint[key]) ||
        endpoint[key].length !== expected[key].length ||
        endpoint[key].some((id, index) => id !== expected[key][index])
      ) {
        fail(`${endpoint.id} ${key} differ`);
      }
    }
  }

  orderedUnique(
    policy.providers,
    [...providerDefinitions.keys()],
    "recovery providers",
  );
  for (const provider of policy.providers) {
    const expected = providerDefinitions.get(provider.id);
    const expectedKeys = ["id", "installedEndpoints"];
    if (expected.packageIds.length > 0) expectedKeys.push("packageIds");
    if (expected.executableIds.length > 0) expectedKeys.push("executableIds");
    if (expected.platformIds.length > 0) expectedKeys.push("platformIds");
    if (expected.osProvider !== null) expectedKeys.push("osProvider");
    exactObjectKeys(provider, expectedKeys, `${provider.id} provider policy`);
    for (const key of [
      "installedEndpoints",
      "packageIds",
      "executableIds",
      "platformIds",
    ]) {
      const actual = provider[key] ?? [];
      const wanted = expected[key];
      if (
        actual.length !== wanted.length ||
        actual.some((id, index) => id !== wanted[index])
      ) {
        fail(`${provider.id} ${key} differ`);
      }
    }
    if (
      expected.osProvider !== null &&
      provider.osProvider !== expected.osProvider
    ) {
      fail(`${provider.id} OS provider differs`);
    }
  }

  exactObjectKeys(
    policy.providerSourceSnapshot,
    ["schema", "repositoryPathPrefix", "maximumBytes"],
    "provider source snapshot binding",
  );
  if (
    policy.providerSourceSnapshot.schema !== sourceSchema ||
    policy.providerSourceSnapshot.repositoryPathPrefix !==
      "docs/plan/evidence/M16/runs/provider-source-snapshot-" ||
    policy.providerSourceSnapshot.maximumBytes !== 262_144
  ) {
    fail("provider source snapshot binding differs");
  }
  exactObjectKeys(
    policy.candidateReferences,
    ["rsync", "unresolvedProviders"],
    "candidate references",
  );
  exactObjectKeys(
    policy.candidateReferences.rsync,
    ["planPath", "endpoints"],
    "rsync candidate reference",
  );
  if (
    policy.candidateReferences.rsync.planPath !==
      "infrastructure/testing/recovery-transport/plan.yaml" ||
    policy.candidateReferences.rsync.endpoints.length !== 2 ||
    policy.candidateReferences.rsync.endpoints.some(
      (id, index) => id !== [...endpointDefinitions.keys()][index],
    )
  ) {
    fail("rsync candidate reference differs");
  }
  const unresolved = [...providerDefinitions.keys()].slice(1);
  if (
    policy.candidateReferences.unresolvedProviders.length !==
      unresolved.length ||
    policy.candidateReferences.unresolvedProviders.some(
      (id, index) => id !== unresolved[index],
    )
  ) {
    fail("unresolved candidate providers differ");
  }
  exactObjectKeys(
    policy.assertions,
    [
      "installedCaptureComplete",
      "candidateEvidenceComplete",
      "reviewComplete",
      "impactClassified",
      "approvalComplete",
      "productionMutation",
    ],
    "snapshot assertions",
  );
  if (
    policy.assertions.installedCaptureComplete !== true ||
    policy.assertions.candidateEvidenceComplete !== false ||
    policy.assertions.reviewComplete !== false ||
    policy.assertions.impactClassified !== false ||
    policy.assertions.approvalComplete !== false ||
    policy.assertions.productionMutation !== false
  ) {
    fail("snapshot assertions differ");
  }
  exactObjectKeys(
    policy.output,
    ["schema", "absolutePathRequired", "extension", "overwrite", "mode"],
    "snapshot output policy",
  );
  if (
    policy.output.schema !== snapshotSchema ||
    policy.output.absolutePathRequired !== true ||
    policy.output.extension !== ".json" ||
    policy.output.overwrite !== false ||
    policy.output.mode !== "0600"
  ) {
    fail("snapshot output policy differs");
  }
  return policy;
}

function loadPolicy() {
  const raw = readStableFile(policyPath, 256 * 1024, "snapshot policy");
  return loadPolicyBytes(raw);
}

function loadPolicyBytes(raw) {
  const policy = parseYaml(raw, "snapshot policy");
  validatePolicy(policy);
  return { policy, raw };
}

function validateFacts(facts, policy, expectedEndpoint, referenceNow = null) {
  exactObjectKeys(
    facts,
    [
      "schema",
      "endpointId",
      "observedAt",
      "captureMethod",
      "productionMutation",
      "os",
      "packages",
      "executables",
      "platforms",
    ],
    `${expectedEndpoint} facts`,
  );
  if (
    facts.schema !== factsSchema ||
    facts.endpointId !== expectedEndpoint ||
    facts.captureMethod !== policy.facts.captureMethod ||
    facts.productionMutation !== false
  ) {
    fail(`${expectedEndpoint} facts identity or mutation assertion differs`);
  }
  const observedAt = exactUtc(
    facts.observedAt,
    `${expectedEndpoint} observedAt`,
  );
  if (referenceNow !== null) {
    if (
      observedAt > referenceNow + 5_000 ||
      referenceNow - observedAt >
        policy.facts.maximumObservationAgeSeconds * 1_000
    ) {
      fail(`${expectedEndpoint} facts are stale or future-dated`);
    }
  }
  const definition = endpointDefinitions.get(expectedEndpoint);
  exactObjectKeys(
    facts.os,
    ["id", "versionId", "release", "codename"],
    `${expectedEndpoint} OS facts`,
  );
  if (facts.os.id !== definition.osProvider) {
    fail(`${expectedEndpoint} OS provider differs`);
  }
  for (const [key, value] of Object.entries(facts.os)) {
    safeFact(value, `${expectedEndpoint} OS ${key}`);
  }
  orderedUnique(
    facts.packages,
    definition.packageIds,
    `${expectedEndpoint} packages`,
  );
  for (const item of facts.packages) {
    exactObjectKeys(
      item,
      ["id", "version", "architecture"],
      `${expectedEndpoint}.${item.id} package`,
    );
    if (!idPattern.test(item.id)) fail(`${item.id} package id is invalid`);
    safeFact(item.version, `${expectedEndpoint}.${item.id} package version`);
    safeFact(
      item.architecture,
      `${expectedEndpoint}.${item.id} package architecture`,
    );
  }
  orderedUnique(
    facts.executables,
    definition.executableIds,
    `${expectedEndpoint} executables`,
  );
  for (const item of facts.executables) {
    exactObjectKeys(
      item,
      ["id", "sha256"],
      `${expectedEndpoint}.${item.id} executable`,
    );
    exactDigest(
      item.sha256,
      `${expectedEndpoint}.${item.id} executable digest`,
    );
  }
  orderedUnique(
    facts.platforms,
    definition.platformIds,
    `${expectedEndpoint} platforms`,
  );
  for (const item of facts.platforms) {
    exactObjectKeys(
      item,
      ["id", "version", "runningVersion", "kernelVersion"],
      `${expectedEndpoint}.${item.id} platform`,
    );
    for (const [key, value] of Object.entries(item)) {
      safeFact(value, `${expectedEndpoint}.${item.id} platform ${key}`);
    }
  }
  return normalizeFacts(facts);
}

function normalizeFacts(facts) {
  return {
    schema: facts.schema,
    endpointId: facts.endpointId,
    observedAt: facts.observedAt,
    captureMethod: facts.captureMethod,
    productionMutation: facts.productionMutation,
    os: {
      id: facts.os.id,
      versionId: facts.os.versionId,
      release: facts.os.release,
      codename: facts.os.codename,
    },
    packages: facts.packages.map((item) => ({
      id: item.id,
      version: item.version,
      architecture: item.architecture,
    })),
    executables: facts.executables.map((item) => ({
      id: item.id,
      sha256: item.sha256,
    })),
    platforms: facts.platforms.map((item) => ({
      id: item.id,
      version: item.version,
      runningVersion: item.runningVersion,
      kernelVersion: item.kernelVersion,
    })),
  };
}

function decodeFacts(value, policy, expectedEndpoint, referenceNow) {
  if (
    typeof value !== "string" ||
    value.length < 4 ||
    value.length > Math.ceil((policy.facts.maximumDecodedBytes * 4) / 3) + 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
      value,
    )
  ) {
    fail(`${expectedEndpoint} facts are not canonical bounded base64`);
  }
  const bytes = Buffer.from(value, "base64");
  if (
    bytes.length < 2 ||
    bytes.length > policy.facts.maximumDecodedBytes ||
    bytes.toString("base64") !== value
  ) {
    fail(`${expectedEndpoint} facts are not canonical bounded base64`);
  }
  let parsed;
  try {
    parsed = JSON.parse(utf8.decode(bytes));
  } catch {
    fail(`${expectedEndpoint} facts JSON is invalid UTF-8 or JSON`);
  }
  return validateFacts(parsed, policy, expectedEndpoint, referenceNow);
}

function validateRepositoryRelativePath(relativePath, prefix, label) {
  if (
    typeof relativePath !== "string" ||
    relativePath.length > 2_048 ||
    /[\u0000-\u001f\u007f]/u.test(relativePath) ||
    relativePath.startsWith("/") ||
    relativePath.includes("\\") ||
    relativePath.split("/").some((part) => part === "" || part === "..") ||
    !relativePath.startsWith(prefix) ||
    !relativePath.endsWith(".json")
  ) {
    fail(`${label} is outside the required repository evidence boundary`);
  }
  return relativePath;
}

function relativeRepositoryPath(path, prefix, label) {
  if (
    typeof path !== "string" ||
    !isAbsolute(path) ||
    path.length > 2_048 ||
    /[\u0000-\u001f\u007f]/u.test(path)
  ) {
    fail(`${label} is not an absolute bounded repository path`);
  }
  const absolute = resolve(path);
  const relativePath = relative(root, absolute).replaceAll("\\", "/");
  validateRepositoryRelativePath(relativePath, prefix, label);
  return { absolute, relativePath };
}

function validateSourceSnapshot(source) {
  exactObjectKeys(
    source,
    [
      "schema",
      "observedAt",
      "completedAt",
      "candidateCommit",
      "planSha256",
      "catalogueCount",
      "complete",
      "contentRetained",
      "reviewComplete",
      "impactClassified",
      "installedEvidenceComplete",
      "limitation",
      "sources",
    ],
    "provider source snapshot",
  );
  const observedAt = exactUtc(source.observedAt, "source snapshot observedAt");
  const completedAt = exactUtc(
    source.completedAt,
    "source snapshot completedAt",
  );
  if (
    source.schema !== sourceSchema ||
    completedAt < observedAt ||
    !commitPattern.test(source.candidateCommit) ||
    !digestPattern.test(source.planSha256) ||
    /^0{64}$/u.test(source.planSha256) ||
    source.catalogueCount !== sourceIds.size ||
    source.complete !== true ||
    source.contentRetained !== false ||
    source.reviewComplete !== false ||
    source.impactClassified !== false ||
    source.installedEvidenceComplete !== false ||
    typeof source.limitation !== "string" ||
    source.limitation !== sourceLimitation ||
    !Array.isArray(source.sources)
  ) {
    fail(
      "provider source snapshot identity or false-authority assertions differ",
    );
  }
  const ids = source.sources.map((item) => item?.id);
  exactSet(new Set(ids), sourceIds, "provider source snapshot sources");
  if (
    ids.length !== sourceIds.size ||
    ids.some((id, index) => id !== [...sourceIds][index])
  ) {
    fail("provider source snapshot contains duplicate or reordered sources");
  }
  for (const item of source.sources) {
    exactObjectKeys(
      item,
      [
        "id",
        "source",
        "finalUrl",
        "fetchedAt",
        "status",
        "contentType",
        "bytes",
        "sha256",
        "lastModified",
        "etagSha256",
      ],
      `${item?.id ?? "unknown"} provider source fact`,
    );
    const fetchedAt = exactUtc(item.fetchedAt, `${item.id} fetchedAt`);
    let finalUrl;
    try {
      finalUrl = new URL(item.finalUrl);
    } catch {
      fail(`${item.id} provider source final URL is invalid`);
    }
    const finalAllowed =
      item.finalUrl === item.source ||
      (item.id === "openssh" &&
        item.finalUrl === "https://www.openssh.org/releasenotes.html");
    if (
      !item ||
      !sourceIds.has(item.id) ||
      item.source !== sourceUrls.get(item.id) ||
      !finalAllowed ||
      finalUrl.protocol !== "https:" ||
      finalUrl.username !== "" ||
      finalUrl.password !== "" ||
      finalUrl.search !== "" ||
      finalUrl.hash !== "" ||
      fetchedAt < observedAt ||
      fetchedAt > completedAt ||
      item.status !== 200 ||
      !["text/html", "text/plain", "text/markdown"].includes(
        item.contentType,
      ) ||
      !Number.isInteger(item.bytes) ||
      item.bytes < 1 ||
      item.bytes > 4_000_000 ||
      !digestPattern.test(item.sha256 ?? "") ||
      /^0{64}$/u.test(item.sha256) ||
      (item.lastModified !== null &&
        !Number.isFinite(
          exactUtc(item.lastModified, `${item.id} lastModified`),
        )) ||
      (item.etagSha256 !== null &&
        (!digestPattern.test(item.etagSha256 ?? "") ||
          /^0{64}$/u.test(item.etagSha256)))
    ) {
      fail(`${item?.id ?? "unknown"} provider source fact is incomplete`);
    }
  }
  return source;
}

function loadSourceSnapshot(path, policy, requireTracked = false) {
  const bounded = relativeRepositoryPath(
    path,
    policy.providerSourceSnapshot.repositoryPathPrefix,
    "provider source snapshot",
  );
  const raw = readStableFile(
    bounded.absolute,
    policy.providerSourceSnapshot.maximumBytes,
    "provider source snapshot",
  );
  if (requireTracked) {
    assertTrackedBytes(
      bounded.absolute,
      bounded.relativePath,
      raw,
      "provider source snapshot",
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(utf8.decode(raw));
  } catch {
    fail("provider source snapshot JSON is invalid");
  }
  validateSourceSnapshot(parsed);
  return {
    raw,
    parsed,
    path: bounded.relativePath,
    absolute: bounded.absolute,
    sha256: digest(raw),
  };
}

function loadSourceSnapshotAtCommit(relativePath, commit, policy) {
  const safePath = validateRepositoryRelativePath(
    relativePath,
    policy.providerSourceSnapshot.repositoryPathPrefix,
    "provider source snapshot",
  );
  const raw = readCommittedBlob(
    commit,
    safePath,
    policy.providerSourceSnapshot.maximumBytes,
    "provider source snapshot",
  );
  let parsed;
  try {
    parsed = JSON.parse(utf8.decode(raw));
  } catch {
    fail("provider source snapshot JSON is invalid");
  }
  validateSourceSnapshot(parsed);
  return {
    raw,
    parsed,
    path: safePath,
    sha256: digest(raw),
  };
}

function validateRsyncPlan(plan) {
  if (
    plan?.schema !== "starfiniti.rsync-transport-plan.v1" ||
    plan.status !== "candidate" ||
    plan.minimumVersion !== "3.5.0" ||
    plan.architecture !== "amd64"
  ) {
    fail("rsync candidate plan identity differs");
  }
  orderedUnique(
    plan.endpoints,
    [...endpointDefinitions.keys()],
    "rsync endpoints",
  );
  for (const endpoint of plan.endpoints) {
    if (
      !endpoint.package ||
      typeof endpoint.package.version !== "string" ||
      !safeFactPattern.test(endpoint.package.version) ||
      !digestPattern.test(endpoint.package.sha256 ?? "") ||
      /^0{64}$/u.test(endpoint.package.sha256) ||
      endpoint.package.name !== "rsync"
    ) {
      fail(`${endpoint.id} rsync candidate package is incomplete`);
    }
  }
  return plan;
}

function loadRsyncPlan() {
  const raw = readStableFile(rsyncPlanPath, 256 * 1024, "rsync candidate plan");
  return loadRsyncPlanBytes(raw);
}

function loadRsyncPlanBytes(raw) {
  const plan = parseYaml(raw, "rsync candidate plan");
  validateRsyncPlan(plan);
  return { raw, plan };
}

function arrayItems(items, ids) {
  return ids.map((id) => items.find((item) => item.id === id));
}

function installedVersion(providerId, facts, definition) {
  if (definition.osProvider !== null) return facts.os.release;
  if (providerId === "proxmox") return facts.platforms[0].runningVersion;
  return arrayItems(facts.packages, definition.packageIds)
    .map((item) => `${item.id}=${item.version}`)
    .join(";");
}

function installedProvenance(facts, definition) {
  const material = {
    endpointId: facts.endpointId,
    os:
      definition.osProvider === null
        ? null
        : {
            id: facts.os.id,
            versionId: facts.os.versionId,
            release: facts.os.release,
            codename: facts.os.codename,
          },
    packages: arrayItems(facts.packages, definition.packageIds),
    executables: arrayItems(facts.executables, definition.executableIds),
    platforms: arrayItems(facts.platforms, definition.platformIds),
  };
  return digest(canonicalBytes(material));
}

function buildRsyncCandidate(binding) {
  const parsed = parseYaml(binding.raw, "rsync candidate binding");
  validateRsyncPlan(parsed);
  if (JSON.stringify(parsed) !== JSON.stringify(binding.plan)) {
    fail("rsync candidate parsed facts differ from their exact plan bytes");
  }
  const endpoints = binding.plan.endpoints.map((endpoint) => ({
    id: endpoint.id,
    version: endpoint.package.version,
    packageSha256: endpoint.package.sha256,
  }));
  const versionOrEntry = endpoints
    .map((item) => `${item.id}=${item.version}`)
    .join(";");
  const planSha256 = digest(binding.raw);
  return {
    planPath: "infrastructure/testing/recovery-transport/plan.yaml",
    planSha256,
    versionOrEntry,
    provenanceSha256: planSha256,
    endpoints,
  };
}

function buildProviders(endpointFacts, rsyncCandidate) {
  return [...providerDefinitions].map(([id, definition]) => {
    const installed = definition.installedEndpoints.map((endpointId) => {
      const facts = endpointFacts.get(endpointId);
      return {
        id: endpointId,
        versionOrRelease: installedVersion(id, facts, definition),
        provenanceSha256: installedProvenance(facts, definition),
      };
    });
    return {
      id,
      installed,
      candidate:
        id === "rsync"
          ? {
              status: "captured",
              versionOrEntry: rsyncCandidate.versionOrEntry,
              provenanceSha256: rsyncCandidate.provenanceSha256,
              reason: null,
            }
          : {
              status: "unresolved",
              versionOrEntry: null,
              provenanceSha256: null,
              reason: unresolvedReason,
            },
    };
  });
}

function buildSnapshot({
  policy,
  policyRaw,
  source,
  rsync,
  facts,
  candidateCommit,
  completedAt,
}) {
  const times = facts.map((item) =>
    exactUtc(item.observedAt, `${item.endpointId} observedAt`),
  );
  const observedAt = nowUtc(Math.min(...times));
  const endpointFacts = new Map(facts.map((item) => [item.endpointId, item]));
  const rsyncCandidate = buildRsyncCandidate(rsync);
  const snapshot = {
    schema: snapshotSchema,
    observedAt,
    completedAt,
    candidateCommit,
    policySha256: digest(policyRaw),
    sourceSnapshot: {
      path: source.path,
      sha256: source.sha256,
      observedAt: source.parsed.observedAt,
      completedAt: source.parsed.completedAt,
      catalogueCount: source.parsed.catalogueCount,
    },
    rsyncCandidate,
    endpointCount: endpointFacts.size,
    providerCount: providerDefinitions.size,
    installedCaptureComplete: true,
    candidateEvidenceComplete: false,
    reviewComplete: false,
    impactClassified: false,
    approvalComplete: false,
    productionMutation: false,
    limitation,
    endpoints: facts,
    providers: buildProviders(endpointFacts, rsyncCandidate),
    unresolvedCandidates: policy.candidateReferences.unresolvedProviders,
  };
  validateSnapshot(snapshot, policy, policyRaw, source, rsync, candidateCommit);
  return snapshot;
}

function validateSnapshot(
  snapshot,
  policy,
  policyRaw,
  source,
  rsync,
  expectedCommit = null,
) {
  exactObjectKeys(
    snapshot,
    [
      "schema",
      "observedAt",
      "completedAt",
      "candidateCommit",
      "policySha256",
      "sourceSnapshot",
      "rsyncCandidate",
      "endpointCount",
      "providerCount",
      "installedCaptureComplete",
      "candidateEvidenceComplete",
      "reviewComplete",
      "impactClassified",
      "approvalComplete",
      "productionMutation",
      "limitation",
      "endpoints",
      "providers",
      "unresolvedCandidates",
    ],
    "recovery dependency snapshot",
  );
  const observedAt = exactUtc(snapshot.observedAt, "snapshot observedAt");
  const completedAt = exactUtc(snapshot.completedAt, "snapshot completedAt");
  if (
    snapshot.schema !== snapshotSchema ||
    completedAt < observedAt ||
    completedAt - observedAt >
      policy.facts.maximumObservationAgeSeconds * 1_000 ||
    !commitPattern.test(snapshot.candidateCommit) ||
    (expectedCommit !== null && snapshot.candidateCommit !== expectedCommit) ||
    snapshot.policySha256 !== digest(policyRaw) ||
    snapshot.endpointCount !== endpointDefinitions.size ||
    snapshot.providerCount !== providerDefinitions.size ||
    snapshot.installedCaptureComplete !== true ||
    snapshot.candidateEvidenceComplete !== false ||
    snapshot.reviewComplete !== false ||
    snapshot.impactClassified !== false ||
    snapshot.approvalComplete !== false ||
    snapshot.productionMutation !== false ||
    snapshot.limitation !== limitation
  ) {
    fail("snapshot identity completeness or false-authority assertions differ");
  }
  exactObjectKeys(
    snapshot.sourceSnapshot,
    ["path", "sha256", "observedAt", "completedAt", "catalogueCount"],
    "snapshot source binding",
  );
  if (
    snapshot.sourceSnapshot.path !== source.path ||
    snapshot.sourceSnapshot.sha256 !== source.sha256 ||
    snapshot.sourceSnapshot.observedAt !== source.parsed.observedAt ||
    snapshot.sourceSnapshot.completedAt !== source.parsed.completedAt ||
    snapshot.sourceSnapshot.catalogueCount !== sourceIds.size
  ) {
    fail("snapshot source binding differs");
  }
  const expectedRsync = buildRsyncCandidate(rsync);
  if (
    JSON.stringify(snapshot.rsyncCandidate) !== JSON.stringify(expectedRsync)
  ) {
    fail("snapshot rsync candidate binding differs");
  }
  orderedUnique(
    snapshot.endpoints,
    [...endpointDefinitions.keys()],
    "snapshot endpoints",
  );
  for (const facts of snapshot.endpoints) {
    const normalized = validateFacts(facts, policy, facts.endpointId);
    if (JSON.stringify(facts) !== JSON.stringify(normalized)) {
      fail(`${facts.endpointId} facts are not canonically ordered`);
    }
    const factTime = exactUtc(
      facts.observedAt,
      `${facts.endpointId} observedAt`,
    );
    if (factTime < observedAt || factTime > completedAt) {
      fail(`${facts.endpointId} observation falls outside snapshot chronology`);
    }
  }
  const endpointFacts = new Map(
    snapshot.endpoints.map((item) => [item.endpointId, item]),
  );
  const expectedProviders = buildProviders(endpointFacts, expectedRsync);
  if (
    JSON.stringify(snapshot.providers) !== JSON.stringify(expectedProviders)
  ) {
    fail("snapshot provider projections differ from endpoint facts");
  }
  if (
    snapshot.unresolvedCandidates.length !==
      policy.candidateReferences.unresolvedProviders.length ||
    snapshot.unresolvedCandidates.some(
      (id, index) =>
        id !== policy.candidateReferences.unresolvedProviders[index],
    )
  ) {
    fail("snapshot unresolved candidate set differs");
  }
  return snapshot;
}

function validateOutputPath(outputPath) {
  if (
    typeof outputPath !== "string" ||
    !isAbsolute(outputPath) ||
    extname(outputPath).toLowerCase() !== ".json" ||
    /[\u0000-\u001f\u007f]/u.test(outputPath)
  ) {
    fail("output path must be an absolute JSON path");
  }
  const absolute = resolve(outputPath);
  let parentStatus;
  try {
    parentStatus = lstatSync(dirname(absolute));
  } catch {
    fail("output parent must be a pre-existing regular directory");
  }
  if (!parentStatus.isDirectory() || parentStatus.isSymbolicLink()) {
    fail("output parent must be a pre-existing regular directory");
  }
  return absolute;
}

function writeSnapshot(outputPath, snapshot) {
  const absolute = validateOutputPath(outputPath);
  const bytes = Buffer.from(`${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  let descriptor;
  let created = false;
  let completed = false;
  let createdIdentity;
  try {
    descriptor = openSync(
      absolute,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    created = true;
    const opened = fstatSync(descriptor);
    if (!opened.isFile()) fail("snapshot output is not a regular file");
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
      if (count === 0) fail("snapshot write stopped before completion");
      offset += count;
    }
    fsyncSync(descriptor);
    const status = fstatSync(descriptor);
    if (
      !status.isFile() ||
      status.size !== bytes.length ||
      (process.platform !== "win32" && (status.mode & 0o777) !== 0o600)
    ) {
      fail("written snapshot is not an exact bounded regular file");
    }
    closeSync(descriptor);
    descriptor = undefined;
    const pathStatus = lstatSync(absolute);
    if (
      !pathStatus.isFile() ||
      pathStatus.dev !== status.dev ||
      pathStatus.ino !== status.ino
    ) {
      fail("written snapshot path identity differs");
    }
    completed = true;
    return { path: absolute, bytes: bytes.length, sha256: digest(bytes) };
  } catch (error) {
    if (error && typeof error === "object" && error.code === "EEXIST") {
      fail("output path already exists; snapshots are never overwritten");
    }
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (created && !completed && createdIdentity) {
      try {
        const status = lstatSync(absolute);
        if (
          status.isFile() &&
          status.dev === createdIdentity.dev &&
          status.ino === createdIdentity.ino
        ) {
          unlinkSync(absolute);
        }
      } catch (error) {
        if (!error || typeof error !== "object" || error.code !== "ENOENT") {
          throw error;
        }
      }
    }
  }
}

function gitOutput(args) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    fail(`git ${args.join(" ")} failed`);
  }
}

function gitBytes(args, maximumBytes, label) {
  try {
    const bytes = execFileSync("git", args, {
      cwd: root,
      encoding: null,
      maxBuffer: maximumBytes + 1,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (!Buffer.isBuffer(bytes) || bytes.length > maximumBytes) {
      fail(`${label} committed blob exceeds its byte bound`);
    }
    return bytes;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("Recovery dependency")
    ) {
      throw error;
    }
    fail(`${label} committed blob could not be read`);
  }
}

function readCommittedBlob(commit, relativePath, maximumBytes, label) {
  if (
    (commit !== "HEAD" && !commitPattern.test(commit)) ||
    typeof relativePath !== "string" ||
    relativePath.length < 1 ||
    relativePath.length > 2_048 ||
    relativePath.startsWith("/") ||
    relativePath.includes("\\") ||
    relativePath.split("/").some((part) => part === "" || part === "..") ||
    /[\u0000-\u001f\u007f]/u.test(relativePath)
  ) {
    fail(`${label} committed identity is invalid`);
  }
  const entry = gitOutput(["ls-tree", commit, "--", relativePath]);
  const match = /^(100644) blob ([a-f0-9]{40,64})\t(.+)$/u.exec(entry);
  if (!match || match[3] !== relativePath) {
    fail(`${label} is not one exact committed regular blob`);
  }
  return gitBytes(["cat-file", "blob", match[2]], maximumBytes, label);
}

function assertTrackedBytes(absolute, relativePath, bytes, label) {
  const expectedAbsolute = resolve(root, relativePath.replaceAll("/", sep));
  const samePath =
    process.platform === "win32"
      ? expectedAbsolute.toLowerCase() === resolve(absolute).toLowerCase()
      : expectedAbsolute === resolve(absolute);
  if (!samePath) fail(`${label} path does not match its repository identity`);
  const committed = readCommittedBlob(
    "HEAD",
    relativePath,
    bytes.length,
    label,
  );
  if (!committed.equals(bytes)) {
    fail(`${label} bytes differ from the exact committed blob`);
  }
}

function assertCoreBindings(attributesRaw, policyRaw, rsyncRaw) {
  assertTrackedBytes(
    attributesPath,
    ".gitattributes",
    attributesRaw,
    "Git attributes",
  );
  assertTrackedBytes(
    policyPath,
    policyRelativePath,
    policyRaw,
    "snapshot policy",
  );
  assertTrackedBytes(
    rsyncPlanPath,
    rsyncPlanRelativePath,
    rsyncRaw,
    "rsync candidate plan",
  );
}

function exactCleanHead(expectedCommit = null) {
  const topLevel = resolve(gitOutput(["rev-parse", "--show-toplevel"]));
  const sameRoot =
    process.platform === "win32"
      ? topLevel.toLowerCase() === root.toLowerCase()
      : topLevel === root;
  if (!sameRoot) fail("collector is not running at the repository root");
  const commit = gitOutput(["rev-parse", "--verify", "HEAD"]);
  if (!commitPattern.test(commit)) fail("HEAD is not an exact commit");
  if (expectedCommit !== null && commit !== expectedCommit) {
    fail("HEAD changed during installed-state capture");
  }
  if (gitOutput(["status", "--porcelain=v1", "--untracked-files=all"]) !== "") {
    fail("installed-state capture requires a clean exact HEAD");
  }
  return commit;
}

function fixtureFacts(endpointId, observedAt) {
  if (endpointId === "proxmox-host") {
    return {
      schema: factsSchema,
      endpointId,
      observedAt,
      captureMethod: "approved-read-only-ssh",
      productionMutation: false,
      os: {
        id: "debian",
        versionId: "13",
        release: "Debian GNU/Linux 13.5",
        codename: "trixie",
      },
      packages: endpointDefinitions.get(endpointId).packageIds.map((id) => ({
        id,
        version: id === "rsync" ? "3.4.1+ds1-5+deb13u3" : "1.2.3-1",
        architecture: "amd64",
      })),
      executables: endpointDefinitions
        .get(endpointId)
        .executableIds.map((id, index) => ({
          id,
          sha256: (index + 1).toString(16).repeat(64),
        })),
      platforms: [
        {
          id: "proxmox",
          version: "9.2.3",
          runningVersion: "9.2.3/d0fde103346cf89a",
          kernelVersion: "7.0.6-2-pve",
        },
      ],
    };
  }
  return {
    schema: factsSchema,
    endpointId,
    observedAt,
    captureMethod: "approved-read-only-ssh",
    productionMutation: false,
    os: {
      id: "ubuntu",
      versionId: "24.04",
      release: "Ubuntu 24.04.4 LTS",
      codename: "noble",
    },
    packages: endpointDefinitions.get(endpointId).packageIds.map((id) => ({
      id,
      version: id === "rsync" ? "3.2.7-1ubuntu1.5" : "1.2.3-1",
      architecture: "amd64",
    })),
    executables: endpointDefinitions
      .get(endpointId)
      .executableIds.map((id, index) => ({
        id,
        sha256: (index + 5).toString(16).repeat(64),
      })),
    platforms: [],
  };
}

function fixtureSource() {
  const parsed = {
    schema: sourceSchema,
    observedAt: "2026-08-28T20:00:00Z",
    completedAt: "2026-08-28T20:00:10Z",
    candidateCommit: "b".repeat(40),
    planSha256: "c".repeat(64),
    catalogueCount: sourceIds.size,
    complete: true,
    contentRetained: false,
    reviewComplete: false,
    impactClassified: false,
    installedEvidenceComplete: false,
    limitation: sourceLimitation,
    sources: [...sourceIds].map((id, index) => ({
      id,
      source: sourceUrls.get(id),
      finalUrl: sourceUrls.get(id),
      fetchedAt: "2026-08-28T20:00:05Z",
      status: 200,
      contentType: "text/plain",
      bytes: index + 1,
      sha256: ((index % 15) + 1).toString(16).repeat(64),
      lastModified: null,
      etagSha256: null,
    })),
  };
  parsed.sources.find((item) => item.id === "openssh").finalUrl =
    "https://www.openssh.org/releasenotes.html";
  validateSourceSnapshot(parsed);
  return {
    parsed,
    path: "docs/plan/evidence/M16/runs/provider-source-snapshot-fixture.json",
    sha256: digest(canonicalBytes(parsed)),
  };
}

async function runSelfTest(policy, policyRaw, rsync) {
  let passed = 0;
  const expectFailure = async (label, expected, action) => {
    try {
      await action();
    } catch (error) {
      if (error instanceof Error && error.message.includes(expected)) {
        passed += 1;
        return;
      }
      throw error;
    }
    fail(`self-test accepted ${label}`);
  };
  const clock = Date.parse("2026-08-28T21:00:00Z");
  const facts = [
    fixtureFacts("proxmox-host", "2026-08-28T20:59:50Z"),
    fixtureFacts("database-guest", "2026-08-28T20:59:55Z"),
  ];
  for (const item of facts) {
    validateFacts(item, policy, item.endpointId, clock);
  }
  const reorderedHost = {
    platforms: facts[0].platforms.map((item) => ({
      kernelVersion: item.kernelVersion,
      runningVersion: item.runningVersion,
      version: item.version,
      id: item.id,
    })),
    executables: facts[0].executables.map((item) => ({
      sha256: item.sha256,
      id: item.id,
    })),
    packages: facts[0].packages.map((item) => ({
      architecture: item.architecture,
      version: item.version,
      id: item.id,
    })),
    os: {
      codename: facts[0].os.codename,
      release: facts[0].os.release,
      versionId: facts[0].os.versionId,
      id: facts[0].os.id,
    },
    productionMutation: facts[0].productionMutation,
    captureMethod: facts[0].captureMethod,
    observedAt: facts[0].observedAt,
    endpointId: facts[0].endpointId,
    schema: facts[0].schema,
  };
  const normalizedHost = decodeFacts(
    Buffer.from(JSON.stringify(reorderedHost), "utf8").toString("base64"),
    policy,
    "proxmox-host",
    clock,
  );
  if (JSON.stringify(normalizedHost) !== JSON.stringify(facts[0])) {
    fail("fact normalization self-test failed");
  }
  passed += 1;
  const source = fixtureSource();
  const positive = buildSnapshot({
    policy,
    policyRaw,
    source,
    rsync,
    facts,
    candidateCommit: "a".repeat(40),
    completedAt: "2026-08-28T21:00:00Z",
  });
  passed += 1;

  await expectFailure("missing policy endpoint", "order or membership", () => {
    const changed = structuredClone(policy);
    changed.facts.endpoints.pop();
    validatePolicy(changed);
  });
  await expectFailure("extra policy provider", "order or membership", () => {
    const changed = structuredClone(policy);
    changed.providers.push({ id: "extra", installedEndpoints: [] });
    validatePolicy(changed);
  });
  await expectFailure("missing byte preservation", "attributes differ", () =>
    validateAttributesBytes(Buffer.from(`${sourceAttribute}\n`, "utf8")),
  );
  await expectFailure("invalid base64", "canonical bounded base64", () =>
    decodeFacts("not-base64", policy, "proxmox-host", clock),
  );
  await expectFailure("extra fact key", "keys", () => {
    const changed = structuredClone(facts[0]);
    changed.hostname = "forbidden";
    validateFacts(changed, policy, "proxmox-host", clock);
  });
  await expectFailure("wrong endpoint", "identity", () =>
    validateFacts(facts[0], policy, "database-guest", clock),
  );
  await expectFailure("mutation assertion", "mutation assertion", () => {
    const changed = structuredClone(facts[0]);
    changed.productionMutation = true;
    validateFacts(changed, policy, "proxmox-host", clock);
  });
  await expectFailure("stale facts", "stale or future", () => {
    const changed = structuredClone(facts[0]);
    changed.observedAt = "2026-08-28T19:00:00Z";
    validateFacts(changed, policy, "proxmox-host", clock);
  });
  await expectFailure("future facts", "stale or future", () => {
    const changed = structuredClone(facts[0]);
    changed.observedAt = "2026-08-28T21:01:00Z";
    validateFacts(changed, policy, "proxmox-host", clock);
  });
  await expectFailure("missing package", "order or membership", () => {
    const changed = structuredClone(facts[0]);
    changed.packages.pop();
    validateFacts(changed, policy, "proxmox-host", clock);
  });
  await expectFailure("duplicate package", "duplicate", () => {
    const changed = structuredClone(facts[0]);
    changed.packages.at(-1).id = changed.packages[0].id;
    validateFacts(changed, policy, "proxmox-host", clock);
  });
  await expectFailure("bad executable digest", "nonzero SHA-256", () => {
    const changed = structuredClone(facts[0]);
    changed.executables[0].sha256 = "0".repeat(64);
    validateFacts(changed, policy, "proxmox-host", clock);
  });
  await expectFailure("guest platform expansion", "order or membership", () => {
    const changed = structuredClone(facts[1]);
    changed.platforms.push(facts[0].platforms[0]);
    validateFacts(changed, policy, "database-guest", clock);
  });
  await expectFailure("identifying fact", "public software fact", () => {
    const changed = structuredClone(facts[0]);
    changed.os.release = "admin@example.com";
    validateFacts(changed, policy, "proxmox-host", clock);
  });
  await expectFailure("retained source content", "false-authority", () => {
    const changed = structuredClone(source.parsed);
    changed.contentRetained = true;
    validateSourceSnapshot(changed);
  });
  await expectFailure("source review claim", "false-authority", () => {
    const changed = structuredClone(source.parsed);
    changed.reviewComplete = true;
    validateSourceSnapshot(changed);
  });
  await expectFailure("source digest missing", "incomplete", () => {
    const changed = structuredClone(source.parsed);
    changed.sources[0].sha256 = "0".repeat(64);
    validateSourceSnapshot(changed);
  });
  await expectFailure("source omitted", "closed set", () => {
    const changed = structuredClone(source.parsed);
    changed.sources.pop();
    validateSourceSnapshot(changed);
  });
  await expectFailure("source field expansion", "keys", () => {
    const changed = structuredClone(source.parsed);
    changed.sources[0].body = "provider content";
    validateSourceSnapshot(changed);
  });
  await expectFailure("source order drift", "reordered", () => {
    const changed = structuredClone(source.parsed);
    [changed.sources[0], changed.sources[1]] = [
      changed.sources[1],
      changed.sources[0],
    ];
    validateSourceSnapshot(changed);
  });
  await expectFailure("source plan digest missing", "false-authority", () => {
    const changed = structuredClone(source.parsed);
    changed.planSha256 = "0".repeat(64);
    validateSourceSnapshot(changed);
  });
  await expectFailure("source path traversal", "evidence boundary", () =>
    validateRepositoryRelativePath(
      "docs/plan/evidence/M16/runs/../secret.json",
      policy.providerSourceSnapshot.repositoryPathPrefix,
      "provider source snapshot",
    ),
  );
  await expectFailure("source path separator drift", "evidence boundary", () =>
    validateRepositoryRelativePath(
      "docs\\plan\\evidence\\M16\\runs\\provider-source-snapshot-x.json",
      policy.providerSourceSnapshot.repositoryPathPrefix,
      "provider source snapshot",
    ),
  );
  await expectFailure(
    "candidate endpoint missing",
    "order or membership",
    () => {
      const changed = structuredClone(rsync.plan);
      changed.endpoints.pop();
      validateRsyncPlan(changed);
    },
  );
  await expectFailure("candidate digest missing", "incomplete", () => {
    const changed = structuredClone(rsync.plan);
    changed.endpoints[0].package.sha256 = "0".repeat(64);
    validateRsyncPlan(changed);
  });
  await expectFailure("candidate byte/object drift", "exact plan bytes", () => {
    const changed = {
      raw: rsync.raw,
      plan: structuredClone(rsync.plan),
    };
    changed.plan.endpoints[0].package.authority = "substituted-authority";
    buildRsyncCandidate(changed);
  });
  await expectFailure("false review", "false-authority", () => {
    const changed = structuredClone(positive);
    changed.reviewComplete = true;
    validateSnapshot(changed, policy, policyRaw, source, rsync);
  });
  await expectFailure(
    "false installed incompleteness",
    "false-authority",
    () => {
      const changed = structuredClone(positive);
      changed.installedCaptureComplete = false;
      validateSnapshot(changed, policy, policyRaw, source, rsync);
    },
  );
  await expectFailure("false candidate completion", "false-authority", () => {
    const changed = structuredClone(positive);
    changed.candidateEvidenceComplete = true;
    validateSnapshot(changed, policy, policyRaw, source, rsync);
  });
  await expectFailure(
    "provider projection omitted",
    "projections differ",
    () => {
      const changed = structuredClone(positive);
      changed.providers.pop();
      validateSnapshot(changed, policy, policyRaw, source, rsync);
    },
  );
  await expectFailure("installed digest drift", "projections differ", () => {
    const changed = structuredClone(positive);
    changed.providers[0].installed[0].provenanceSha256 = "f".repeat(64);
    validateSnapshot(changed, policy, policyRaw, source, rsync);
  });
  await expectFailure("relative output", "absolute JSON path", () =>
    writeSnapshot("snapshot.json", positive),
  );
  const temporary = mkdtempSync(
    join(tmpdir(), "starfiniti-recovery-dependency-snapshot-"),
  );
  try {
    await expectFailure("missing output parent", "pre-existing", () =>
      writeSnapshot(join(temporary, "missing", "snapshot.json"), positive),
    );
    const output = join(temporary, "snapshot.json");
    writeSnapshot(output, positive);
    await expectFailure("output reuse", "never overwritten", () =>
      writeSnapshot(output, positive),
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
  console.log(
    `Validated ${endpointDefinitions.size} recovery endpoints, ${providerDefinitions.size} provider projections, and ${passed} deterministic installed-state cases without network or SSH access.`,
  );
}

function parseArguments(args) {
  if (args.length === 1 && args[0] === "--self-test") {
    return { mode: "self-test" };
  }
  if (args[0] === "--verify" && args.length === 3 && args[1] === "--in") {
    return { mode: "verify", input: args[2] };
  }
  if (
    args[0] === "--capture" &&
    args.length === 9 &&
    args[1] === "--source" &&
    args[3] === "--host-facts-base64" &&
    args[5] === "--guest-facts-base64" &&
    args[7] === "--out"
  ) {
    return {
      mode: "capture",
      source: args[2],
      hostFacts: args[4],
      guestFacts: args[6],
      output: args[8],
    };
  }
  fail(
    "usage: --self-test | --verify --in <absolute-json-path> | --capture --source <repository-provider-snapshot> --host-facts-base64 <base64-json> --guest-facts-base64 <base64-json> --out <absolute-new-json-path>",
  );
}

async function main() {
  const command = parseArguments(process.argv.slice(2));
  if (command.mode === "self-test") {
    validateAttributes();
    const { policy, raw: policyRaw } = loadPolicy();
    const rsync = loadRsyncPlan();
    await runSelfTest(policy, policyRaw, rsync);
    return;
  }
  if (command.mode === "verify") {
    const input = validateOutputPath(command.input);
    const raw = readStableFile(
      input,
      256 * 1024,
      "recovery dependency snapshot",
    );
    let snapshot;
    try {
      snapshot = JSON.parse(utf8.decode(raw));
    } catch {
      fail("recovery dependency snapshot JSON is invalid");
    }
    if (!commitPattern.test(snapshot?.candidateCommit ?? "")) {
      fail("snapshot candidate commit is invalid");
    }
    const candidateCommit = snapshot.candidateCommit;
    const historicalAttributes = readCommittedBlob(
      candidateCommit,
      ".gitattributes",
      64 * 1024,
      "Git attributes",
    );
    validateAttributesBytes(historicalAttributes);
    const policyRaw = readCommittedBlob(
      candidateCommit,
      policyRelativePath,
      256 * 1024,
      "snapshot policy",
    );
    const { policy } = loadPolicyBytes(policyRaw);
    const rsyncRaw = readCommittedBlob(
      candidateCommit,
      rsyncPlanRelativePath,
      256 * 1024,
      "rsync candidate plan",
    );
    const rsync = loadRsyncPlanBytes(rsyncRaw);
    const source = loadSourceSnapshotAtCommit(
      snapshot?.sourceSnapshot?.path,
      candidateCommit,
      policy,
    );
    validateSnapshot(snapshot, policy, policyRaw, source, rsync);
    console.log(
      `Verified ${snapshot.endpointCount}-endpoint ${snapshot.providerCount}-provider installed-state snapshot ${input}; candidate ${snapshot.candidateCommit}.`,
    );
    return;
  }

  const attributesRaw = validateAttributes();
  const { policy, raw: policyRaw } = loadPolicy();
  const rsync = loadRsyncPlan();
  const output = validateOutputPath(command.output);
  const candidateCommit = exactCleanHead();
  assertCoreBindings(attributesRaw, policyRaw, rsync.raw);
  const source = loadSourceSnapshot(command.source, policy, true);
  const capturedAt = Date.now();
  const facts = [
    decodeFacts(command.hostFacts, policy, "proxmox-host", capturedAt),
    decodeFacts(command.guestFacts, policy, "database-guest", capturedAt),
  ];
  const completedAt = nowUtc();
  const snapshot = buildSnapshot({
    policy,
    policyRaw,
    source,
    rsync,
    facts,
    candidateCommit,
    completedAt,
  });
  exactCleanHead(candidateCommit);
  const currentPolicy = readStableFile(
    policyPath,
    256 * 1024,
    "snapshot policy",
  );
  const currentRsync = readStableFile(
    rsyncPlanPath,
    256 * 1024,
    "rsync candidate plan",
  );
  const currentAttributes = readStableFile(
    attributesPath,
    64 * 1024,
    "Git attributes",
  );
  const currentSource = readStableFile(
    source.absolute,
    policy.providerSourceSnapshot.maximumBytes,
    "provider source snapshot",
  );
  if (
    digest(currentPolicy) !== digest(policyRaw) ||
    digest(currentRsync) !== digest(rsync.raw) ||
    digest(currentAttributes) !== digest(attributesRaw) ||
    digest(currentSource) !== source.sha256
  ) {
    fail("a committed binding changed during installed-state capture");
  }
  const written = writeSnapshot(output, snapshot);
  console.log(
    `Captured ${snapshot.endpointCount} endpoints and ${snapshot.providerCount} installed provider projections in ${written.path}; ${written.bytes} bytes; SHA-256 ${written.sha256}; no route, credential, provider review, upgrade approval, or production mutation retained.`,
  );
}

main().catch((error) => {
  if (error instanceof Error) console.error(error.message);
  else
    console.error("Recovery dependency snapshot failed with an unknown error");
  process.exitCode = 1;
});
