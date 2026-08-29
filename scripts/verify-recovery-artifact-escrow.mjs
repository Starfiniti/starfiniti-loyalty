import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readSync,
  realpathSync,
  rmSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import {
  dirname,
  isAbsolute,
  join,
  parse,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const policyRelativePath =
  "infrastructure/governance/recovery-artifact-escrow-v2.yaml";
const policyPath = join(root, policyRelativePath);
const evidenceRelativePath =
  "docs/plan/evidence/M16/recovery-artifact-escrow-v2.yaml";
const evidencePath = join(root, evidenceRelativePath);
const historicalPolicyRelativePath =
  "infrastructure/governance/recovery-artifact-escrow-v1.yaml";
const historicalEvidenceRelativePath =
  "docs/plan/evidence/M16/recovery-artifact-escrow.yaml";
const historicalPolicySha256 =
  "eb9840652ab8e7ca2d20af9cc8eabf2d8bde7e0b696f8d51e334f859127eaa05";
const historicalEvidenceSha256 =
  "76ecf6d023eb8dbc7f4eb07be54f46a24ad31420faca815b0bd7f5f47672db58";
const digestPattern = /^[a-f0-9]{64}$/u;
const commitPattern = /^[a-f0-9]{40}$/u;
const providerIds = new Set([
  "borgbackup",
  "openssh-client",
  "rsync-transport",
]);
const privateEntryIds = new Set([
  "borg-signing-key",
  "borg-dependency-inventory",
  "openssh-dependency-inventory",
]);
const v1AuthorityKeys = [
  "networkAccess",
  "artifactCopy",
  "artifactExecution",
  "productionAccess",
  "productionMutation",
  "productionAuthority",
  "signingFingerprintReviewComplete",
  "dependencyReviewComplete",
  "offlineCopyReviewComplete",
  "secondReviewerComplete",
  "operationsEscrowComplete",
];
const v2AuthorityKeys = [
  ...v1AuthorityKeys,
  "packageAuthorityReviewComplete",
  "consumerCompatibilityReviewComplete",
  "isolatedRestoreComplete",
];
const v1ReportLimitationKeys = [
  "signingFingerprintReviewComplete",
  "dependencyReviewComplete",
  "offlineCopyReviewComplete",
  "secondReviewerComplete",
  "operationsEscrowComplete",
];
const v2ReportLimitationKeys = [
  ...v1ReportLimitationKeys,
  "packageAuthorityReviewComplete",
  "consumerCompatibilityReviewComplete",
  "isolatedRestoreComplete",
];
const evidenceChecks = new Map([
  ["design_contract", "passed"],
  ["historical_v1_preserved", "passed"],
  ["closed_catalogue", "passed"],
  ["stable_byte_verification", "passed"],
  ["rsync_package_binding", "passed"],
  ["rsync_runtime_binding", "passed"],
  ["minimized_report_contract", "passed"],
  ["validator_selftest", "passed"],
  ["exact_head_ci", new Set(["pending", "passed"])],
  ["private_inventory", "pending"],
  ["package_authority_review", "pending"],
  ["signing_fingerprint_review", "pending"],
  ["dependency_review", "pending"],
  ["consumer_compatibility_review", "pending"],
  ["offline_copy_review", "pending"],
  ["independent_review", "pending"],
  ["isolated_restore", "pending"],
  ["operations_escrow", "pending"],
]);
const effectiveProvidersByPolicy = new WeakMap();
const expectedRepositoryEntries = new Map([
  [
    "borgbackup",
    new Map([
      ["borg-plan", "infrastructure/testing/borgbackup-security/plan.yaml"],
      [
        "borg-build-instructions",
        "infrastructure/testing/borgbackup-security/Dockerfile",
      ],
      [
        "borg-tree-verifier",
        "infrastructure/testing/borgbackup-security/verify-tree.py",
      ],
      ["borg-canary-runner", "scripts/run-borgbackup-security-canary.mjs"],
      ["borg-runbook", "docs/operations/BORGBACKUP_SECURITY_UPDATE.md"],
      [
        "borg-adr",
        "docs/architecture/ADR/0091-signed-borgbackup-security-candidate.md",
      ],
      ["borg-evidence", "docs/plan/evidence/M16/borgbackup-security.yaml"],
      [
        "borg-canary-report",
        "docs/plan/evidence/M16/runs/borgbackup-security-fe727d5-2026-08-29T051944Z.json",
      ],
    ]),
  ],
  [
    "openssh-client",
    new Map([
      [
        "openssh-plan",
        "infrastructure/testing/openssh-client-security/plan.yaml",
      ],
      [
        "openssh-client-build-instructions",
        "infrastructure/testing/openssh-client-security/client.Dockerfile",
      ],
      [
        "openssh-server-fixture",
        "infrastructure/testing/openssh-client-security/server.Dockerfile",
      ],
      [
        "openssh-source-verifier",
        "infrastructure/testing/openssh-client-security/verify-source.py",
      ],
      [
        "openssh-canary-runner",
        "scripts/run-openssh-client-security-canary.mjs",
      ],
      ["openssh-runbook", "docs/operations/OPENSSH_CLIENT_SECURITY_UPDATE.md"],
      [
        "openssh-adr",
        "docs/architecture/ADR/0092-side-by-side-openssh-recovery-client.md",
      ],
      [
        "openssh-evidence",
        "docs/plan/evidence/M16/openssh-client-security.yaml",
      ],
      [
        "openssh-canary-report",
        "docs/plan/evidence/M16/runs/openssh-client-security-275c9e8-2026-08-29T073759Z.json",
      ],
    ]),
  ],
  [
    "rsync-transport",
    new Map([
      ["rsync-plan", "infrastructure/testing/recovery-transport/plan.yaml"],
      [
        "rsync-build-instructions",
        "infrastructure/testing/recovery-transport/Dockerfile",
      ],
      [
        "rsync-canary-readme",
        "infrastructure/testing/recovery-transport/README.md",
      ],
      ["rsync-plan-validator", "scripts/validate-rsync-transport-plan.mjs"],
      ["rsync-canary-runner", "scripts/run-rsync-transport-canary.mjs"],
      [
        "rsync-guest-forced-exporter",
        "infrastructure/environments/proxmox/scripts/starfiniti-postgres-backup-rsync",
      ],
      [
        "rsync-host-controller",
        "infrastructure/environments/proxmox/scripts/starfiniti-loyalty-postgres-borg-controller",
      ],
      [
        "rsync-host-archive-rollback",
        "infrastructure/environments/proxmox/scripts/starfiniti-loyalty-postgres-borg",
      ],
      [
        "rsync-host-maintenance-rollback",
        "infrastructure/environments/proxmox/scripts/starfiniti-loyalty-postgres-borg-maintain",
      ],
      [
        "rsync-archive-service",
        "infrastructure/environments/proxmox/systemd/starfiniti-loyalty-postgres-borg.service",
      ],
      [
        "rsync-archive-timer",
        "infrastructure/environments/proxmox/systemd/starfiniti-loyalty-postgres-borg.timer",
      ],
      [
        "rsync-maintenance-service",
        "infrastructure/environments/proxmox/systemd/starfiniti-loyalty-postgres-borg-maintain.service",
      ],
      [
        "rsync-maintenance-timer",
        "infrastructure/environments/proxmox/systemd/starfiniti-loyalty-postgres-borg-maintain.timer",
      ],
      [
        "rsync-forced-command-sudoers",
        "infrastructure/environments/proxmox/sudoers/starfiniti-postgres-backup-rsync",
      ],
      ["rsync-backup-asset-validator", "scripts/validate-backup-assets.mjs"],
      ["rsync-runbook", "docs/operations/BACKUP_RESTORE.md"],
      [
        "rsync-adr-incremental-pull",
        "docs/architecture/ADR/0013-incremental-pull-before-borg-archive.md",
      ],
      [
        "rsync-adr-dedicated-repository",
        "docs/architecture/ADR/0071-dedicated-postgresql-borg-repository.md",
      ],
      [
        "rsync-adr-security-baseline",
        "docs/architecture/ADR/0072-rsync-3-5-backup-transport-security-baseline.md",
      ],
      [
        "rsync-adr-package-canary",
        "docs/architecture/ADR/0073-exact-vendor-rsync-recovery-transport-canary.md",
      ],
      [
        "rsync-canary-evidence",
        "docs/plan/evidence/M15/recovery-transport.yaml",
      ],
      [
        "rsync-historical-v1-policy",
        "infrastructure/governance/recovery-artifact-escrow-v1.yaml",
      ],
      [
        "rsync-historical-v1-evidence",
        "docs/plan/evidence/M16/recovery-artifact-escrow.yaml",
      ],
      [
        "rsync-escrow-v1-adr",
        "docs/architecture/ADR/0093-private-recovery-artifact-escrow-verification.md",
      ],
      [
        "rsync-escrow-v2-adr",
        "docs/architecture/ADR/0094-versioned-shared-recovery-artifact-escrow.md",
      ],
      [
        "rsync-escrow-v2-evidence",
        "docs/plan/evidence/M16/recovery-artifact-escrow-v2.yaml",
      ],
      ["rsync-escrow-verifier", "scripts/verify-recovery-artifact-escrow.mjs"],
    ]),
  ],
]);

function fail(message) {
  throw new Error(`Recovery artifact escrow invalid: ${message}`);
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}

function planDigest(plan) {
  return digest(Buffer.from(JSON.stringify(canonical(plan)), "utf8"));
}

function policyProviders(policy) {
  return effectiveProvidersByPolicy.get(policy) ?? policy.providers;
}

function authorityKeysFor(policy) {
  return policy.version === 2 ? v2AuthorityKeys : v1AuthorityKeys;
}

function reportLimitationKeysFor(policy) {
  return policy.version === 2 ? v2ReportLimitationKeys : v1ReportLimitationKeys;
}

function schemaFor(policy, kind) {
  return `starfiniti.recovery-artifact-escrow-${kind}.v${policy.version}`;
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

function isInside(parent, child) {
  const path = relative(resolve(parent), resolve(child));
  return path === "" || (!path.startsWith(`..${sep}`) && path !== "..");
}

function samePath(left, right) {
  const normalize = (value) =>
    process.platform === "win32"
      ? resolve(value).toLowerCase()
      : resolve(value);
  return normalize(left) === normalize(right);
}

function safeRelativePath(value, label) {
  if (
    typeof value !== "string" ||
    value.length < 3 ||
    value.length > 200 ||
    value.includes("\\") ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    !/^[A-Za-z0-9][A-Za-z0-9._+/@-]*(?:\/[A-Za-z0-9][A-Za-z0-9._+@-]*)*$/u.test(
      value,
    ) ||
    value.split("/").some((part) => part === "." || part === "..")
  ) {
    fail(`${label} is not a safe relative path`);
  }
  return value;
}

function safeRepositoryPath(value, label, sourceRoot = root) {
  safeRelativePath(value, label);
  const absolute = resolve(sourceRoot, ...value.split("/"));
  if (!isInside(sourceRoot, absolute) || samePath(sourceRoot, absolute)) {
    fail(`${label} leaves the repository`);
  }
  return absolute;
}

function validateWritableMode(
  stat,
  label,
  enforce = process.platform !== "win32",
) {
  if (enforce && (stat.mode & 0o022) !== 0) {
    fail(`${label} is group or other writable`);
  }
}

function assertDirectPath(path, label) {
  if (!samePath(realpathSync(path), path)) {
    fail(`${label} resolves through a linked parent`);
  }
}

function readStableFile(
  path,
  maximumBytes,
  label,
  { capture = false, enforceMode = process.platform !== "win32" } = {},
) {
  let descriptor;
  try {
    descriptor = openSync(
      path,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    assertDirectPath(path, label);
    const beforeDescriptor = fstatSync(descriptor);
    const beforePath = lstatSync(path);
    if (
      !beforeDescriptor.isFile() ||
      !beforePath.isFile() ||
      beforeDescriptor.isSymbolicLink() ||
      beforePath.isSymbolicLink() ||
      beforeDescriptor.dev !== beforePath.dev ||
      beforeDescriptor.ino !== beforePath.ino ||
      beforeDescriptor.nlink !== 1 ||
      beforePath.nlink !== 1 ||
      beforeDescriptor.size < 1 ||
      beforeDescriptor.size > maximumBytes
    ) {
      fail(`${label} is not one bounded stable regular file`);
    }
    validateWritableMode(beforeDescriptor, label, enforceMode);
    const hash = createHash("sha256");
    const chunks = capture ? [] : undefined;
    const buffer = Buffer.alloc(
      Math.min(65_536, Math.max(1, beforeDescriptor.size)),
    );
    let offset = 0;
    while (offset < beforeDescriptor.size) {
      const count = readSync(
        descriptor,
        buffer,
        0,
        Math.min(buffer.length, beforeDescriptor.size - offset),
        offset,
      );
      if (count === 0) fail(`${label} changed while reading`);
      const chunk = buffer.subarray(0, count);
      hash.update(chunk);
      if (capture) chunks.push(Buffer.from(chunk));
      offset += count;
    }
    const afterDescriptor = fstatSync(descriptor);
    const afterPath = lstatSync(path);
    assertDirectPath(path, label);
    if (
      afterDescriptor.dev !== beforeDescriptor.dev ||
      afterDescriptor.ino !== beforeDescriptor.ino ||
      afterDescriptor.nlink !== beforeDescriptor.nlink ||
      afterDescriptor.size !== beforeDescriptor.size ||
      afterDescriptor.mtimeMs !== beforeDescriptor.mtimeMs ||
      afterPath.dev !== beforePath.dev ||
      afterPath.ino !== beforePath.ino ||
      afterPath.nlink !== beforePath.nlink ||
      afterPath.size !== beforePath.size ||
      afterPath.mtimeMs !== beforePath.mtimeMs
    ) {
      fail(`${label} changed while reading`);
    }
    return {
      bytes: beforeDescriptor.size,
      sha256: hash.digest("hex"),
      content: capture ? Buffer.concat(chunks) : undefined,
    };
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function readJson(path, maximumBytes, label, options) {
  const result = readStableFile(path, maximumBytes, label, {
    ...options,
    capture: true,
  });
  try {
    return { ...result, document: JSON.parse(result.content.toString("utf8")) };
  } catch {
    fail(`${label} is not valid JSON`);
  }
}

function readYaml(path, maximumBytes, label, options) {
  const result = readStableFile(path, maximumBytes, label, {
    ...options,
    capture: true,
  });
  try {
    return { ...result, document: YAML.parse(result.content.toString("utf8")) };
  } catch {
    fail(`${label} is not valid YAML`);
  }
}

function validateBundleRoot(bundlePath, sourceRoot = root) {
  if (!isAbsolute(bundlePath)) fail("bundle path must be absolute");
  const absolute = resolve(bundlePath);
  if (samePath(absolute, parse(absolute).root)) {
    fail("bundle path may not be a filesystem root");
  }
  if (isInside(sourceRoot, absolute) || isInside(absolute, sourceRoot)) {
    fail("bundle path must not overlap the repository");
  }
  const linked = lstatSync(absolute);
  if (!linked.isDirectory() || linked.isSymbolicLink()) {
    fail("bundle root is not a real directory");
  }
  if (!samePath(realpathSync(absolute), absolute)) {
    fail("bundle root resolves through a link");
  }
  validateWritableMode(linked, "bundle root");
  return absolute;
}

function scanBundle(bundleRoot, maximumEntries) {
  const files = new Set();
  const folded = new Set();
  const visit = (directory, parts) => {
    assertDirectPath(directory, `bundle directory ${parts.join("/") || "."}`);
    const directoryStat = lstatSync(directory);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
      fail("bundle contains a linked or non-directory parent");
    }
    validateWritableMode(
      directoryStat,
      `bundle directory ${parts.join("/") || "."}`,
    );
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const nextParts = [...parts, item.name];
      if (nextParts.length > 5) fail("bundle member depth exceeds the bound");
      const relativePath = nextParts.join("/");
      safeRelativePath(relativePath, "bundle member path");
      const foldedPath = relativePath.toLowerCase();
      if (folded.has(foldedPath))
        fail("bundle contains a case-colliding member");
      folded.add(foldedPath);
      const absolute = join(directory, item.name);
      if (item.isSymbolicLink()) fail("bundle contains a symbolic link");
      if (item.isDirectory()) {
        visit(absolute, nextParts);
      } else if (item.isFile()) {
        files.add(relativePath);
        if (files.size > maximumEntries + 2) {
          fail("bundle contains more files than the policy permits");
        }
      } else {
        fail("bundle contains a special file");
      }
    }
  };
  visit(bundleRoot, []);
  return files;
}

function uniqueEntries(providers) {
  const entries = [];
  const ids = new Set();
  const paths = new Set();
  for (const provider of providers) {
    if (!Array.isArray(provider.entries) || provider.entries.length === 0) {
      fail(`${provider.id} entry catalogue is empty`);
    }
    for (const entry of provider.entries) {
      if (ids.has(entry.id)) fail("entry catalogue contains a duplicate id");
      const foldedPath = entry.relativePath.toLowerCase();
      if (paths.has(foldedPath)) {
        fail("entry catalogue contains a duplicate or case-colliding path");
      }
      ids.add(entry.id);
      paths.add(foldedPath);
      entries.push({ ...entry, providerId: provider.id });
    }
  }
  return entries;
}

function validatePolicyShape(policy, historicalPolicy) {
  exactObjectKeys(
    policy,
    [
      "schema",
      "version",
      "status",
      "scope",
      "extends",
      "bounds",
      "filesystem",
      "authority",
      "providers",
      "automaticFails",
    ],
    "policy",
  );
  if (
    policy.schema !== "starfiniti.recovery-artifact-escrow-plan.v2" ||
    policy.version !== 2 ||
    policy.status !== "ready"
  ) {
    fail("policy identity differs");
  }
  if (
    !Array.isArray(policy.scope) ||
    policy.scope.length !== providerIds.size
  ) {
    fail("policy scope count differs");
  }
  exactSet(new Set(policy.scope), providerIds, "policy scope");
  exactObjectKeys(policy.extends, ["path", "sha256"], "policy extension");
  if (
    policy.extends.path !== historicalPolicyRelativePath ||
    policy.extends.sha256 !== historicalPolicySha256
  ) {
    fail("policy extension differs from immutable V1");
  }
  exactObjectKeys(
    policy.bounds,
    [
      "maximumEntries",
      "maximumTotalBytes",
      "maximumManifestBytes",
      "maximumPolicyBytes",
      "maximumReportBytes",
      "readChunkBytes",
    ],
    "policy bounds",
  );
  if (
    !Number.isSafeInteger(policy.bounds.maximumEntries) ||
    policy.bounds.maximumEntries < 1 ||
    policy.bounds.maximumEntries > 64 ||
    !Number.isSafeInteger(policy.bounds.maximumTotalBytes) ||
    policy.bounds.maximumTotalBytes < 1_048_576 ||
    policy.bounds.maximumTotalBytes > 536_870_912 ||
    policy.bounds.maximumManifestBytes !== 262_144 ||
    policy.bounds.maximumPolicyBytes !== 131_072 ||
    policy.bounds.maximumReportBytes !== 65_536 ||
    policy.bounds.readChunkBytes !== 65_536
  ) {
    fail("policy bounds differ");
  }
  exactObjectKeys(
    policy.filesystem,
    [
      "bundleMustBeAbsolute",
      "bundleMustBeOutsideRepository",
      "bundleRootMayNotBeFilesystemRoot",
      "rejectSymlinks",
      "rejectHardlinks",
      "rejectSpecialFiles",
      "rejectUnexpectedMembers",
      "rejectCaseCollisions",
      "rejectGroupOrOtherWritableOnPosix",
      "policyCopyPath",
      "privateManifestPath",
    ],
    "filesystem policy",
  );
  for (const key of [
    "bundleMustBeAbsolute",
    "bundleMustBeOutsideRepository",
    "bundleRootMayNotBeFilesystemRoot",
    "rejectSymlinks",
    "rejectHardlinks",
    "rejectSpecialFiles",
    "rejectUnexpectedMembers",
    "rejectCaseCollisions",
    "rejectGroupOrOtherWritableOnPosix",
  ]) {
    if (policy.filesystem[key] !== true) fail(`${key} must remain true`);
  }
  if (
    policy.filesystem.policyCopyPath !== "escrow-policy.yaml" ||
    policy.filesystem.privateManifestPath !== "manifest.json"
  ) {
    fail("control file paths differ");
  }
  exactObjectKeys(
    policy.authority,
    [
      "networkAccess",
      "artifactCopy",
      "artifactExecution",
      "productionAccess",
      "productionMutation",
      "productionAuthority",
      "inventoryVerificationCompletesEscrow",
      "signingFingerprintReviewRequired",
      "dependencyReviewRequired",
      "packageAuthorityReviewRequired",
      "consumerCompatibilityReviewRequired",
      "offlineCopyReviewRequired",
      "secondReviewerRequired",
      "isolatedRestoreRequired",
    ],
    "authority policy",
  );
  for (const key of [
    "networkAccess",
    "artifactCopy",
    "artifactExecution",
    "productionAccess",
    "productionMutation",
    "productionAuthority",
    "inventoryVerificationCompletesEscrow",
  ]) {
    if (policy.authority[key] !== false) fail(`${key} must remain false`);
  }
  for (const key of [
    "signingFingerprintReviewRequired",
    "dependencyReviewRequired",
    "packageAuthorityReviewRequired",
    "consumerCompatibilityReviewRequired",
    "offlineCopyReviewRequired",
    "secondReviewerRequired",
    "isolatedRestoreRequired",
  ]) {
    if (policy.authority[key] !== true) fail(`${key} must remain true`);
  }
  if (!Array.isArray(policy.providers) || policy.providers.length !== 1) {
    fail("provider catalogue differs");
  }
  exactSet(
    new Set(policy.providers.map((provider) => provider.id)),
    new Set(["rsync-transport"]),
    "provider catalogue",
  );
  for (const provider of policy.providers) {
    exactObjectKeys(
      provider,
      ["id", "candidateCommit", "plan", "entries"],
      `${provider.id} provider`,
    );
    if (!commitPattern.test(provider.candidateCommit)) {
      fail(`${provider.id} candidate commit is invalid`);
    }
    exactObjectKeys(provider.plan, ["path", "sha256"], `${provider.id} plan`);
    safeRepositoryPath(provider.plan.path, `${provider.id} plan path`);
    if (!digestPattern.test(provider.plan.sha256)) {
      fail(`${provider.id} plan digest is invalid`);
    }
    for (const entry of provider.entries) validateEntry(entry, provider.id);
  }
  if (
    historicalPolicy.schema !== "starfiniti.recovery-artifact-escrow-plan.v1" ||
    historicalPolicy.version !== 1 ||
    historicalPolicy.bounds?.maximumEntries !== 30 ||
    !Array.isArray(historicalPolicy.providers) ||
    historicalPolicy.providers.length !== 2
  ) {
    fail("immutable V1 policy identity differs");
  }
  const effectiveProviders = [
    ...historicalPolicy.providers,
    ...policy.providers,
  ];
  exactSet(
    new Set(effectiveProviders.map((provider) => provider.id)),
    providerIds,
    "effective provider catalogue",
  );
  effectiveProvidersByPolicy.set(policy, effectiveProviders);
  const entries = uniqueEntries(effectiveProviders);
  if (
    entries.length !== policy.bounds.maximumEntries ||
    entries.length !== 64
  ) {
    fail("entry catalogue count differs");
  }
  if (
    !Array.isArray(policy.automaticFails) ||
    policy.automaticFails.length !== 7
  ) {
    fail("automatic failure catalogue differs");
  }
  return entries;
}

function validateEntry(entry, providerId) {
  const expectedKeys = [
    "id",
    "relativePath",
    "role",
    "expected",
    "maximumBytes",
  ];
  if (entry.expected === "fixed") expectedKeys.push("sha256");
  if (entry.expected === "repository-file") expectedKeys.push("sourcePath");
  if (entry.exactBytes !== undefined) expectedKeys.push("exactBytes");
  if (entry.signingFingerprint !== undefined)
    expectedKeys.push("signingFingerprint");
  if (entry.contentSchema !== undefined) expectedKeys.push("contentSchema");
  exactObjectKeys(entry, expectedKeys, `${entry.id ?? providerId} entry`);
  if (
    typeof entry.id !== "string" ||
    !/^[a-z][a-z0-9-]{2,80}$/u.test(entry.id) ||
    typeof entry.role !== "string" ||
    !/^[a-z][a-z0-9-]{2,80}$/u.test(entry.role)
  ) {
    fail(`${providerId} entry identity is invalid`);
  }
  safeRelativePath(entry.relativePath, `${entry.id} relative path`);
  if (!entry.relativePath.startsWith(`${providerId}/`)) {
    fail(`${entry.id} is outside its provider directory`);
  }
  if (
    !["fixed", "repository-file", "private-manifest"].includes(
      entry.expected,
    ) ||
    !Number.isSafeInteger(entry.maximumBytes) ||
    entry.maximumBytes < 1 ||
    entry.maximumBytes > 134_217_728
  ) {
    fail(`${entry.id} expectation or byte bound is invalid`);
  }
  if (
    entry.exactBytes !== undefined &&
    (!Number.isSafeInteger(entry.exactBytes) ||
      entry.exactBytes < 1 ||
      entry.exactBytes > entry.maximumBytes)
  ) {
    fail(`${entry.id} exact byte count is invalid`);
  }
  if (
    entry.expected === "fixed" &&
    (!digestPattern.test(entry.sha256) || /^0{64}$/u.test(entry.sha256))
  ) {
    fail(`${entry.id} fixed digest is invalid`);
  }
  if (entry.expected === "repository-file") {
    safeRepositoryPath(entry.sourcePath, `${entry.id} source path`);
  }
  if (entry.expected === "private-manifest" && !privateEntryIds.has(entry.id)) {
    fail(`${entry.id} may not use a private-manifest digest`);
  }
  if (
    entry.signingFingerprint !== undefined &&
    !/^[A-F0-9]{40}$/u.test(entry.signingFingerprint)
  ) {
    fail(`${entry.id} signing fingerprint is invalid`);
  }
  if (
    entry.contentSchema !== undefined &&
    (entry.role !== "dependency-inventory" ||
      entry.contentSchema !==
        "starfiniti.recovery-candidate-dependency-inventory.v1")
  ) {
    fail(`${entry.id} content schema is invalid`);
  }
}

function validateCanonicalBindings(policy, sourceRoot = root) {
  for (const provider of policyProviders(policy)) {
    const raw = readStableFile(
      safeRepositoryPath(
        provider.plan.path,
        `${provider.id} plan path`,
        sourceRoot,
      ),
      262_144,
      `${provider.id} plan`,
      { capture: true },
    );
    const plan = YAML.parse(raw.content.toString("utf8"));
    if (planDigest(plan) !== provider.plan.sha256) {
      fail(`${provider.id} plan digest differs`);
    }
    const expectedRepo = expectedRepositoryEntries.get(provider.id);
    const actualRepo = new Map(
      provider.entries
        .filter((entry) => entry.expected === "repository-file")
        .map((entry) => [entry.id, entry.sourcePath]),
    );
    exactSet(
      new Set(actualRepo.keys()),
      new Set(expectedRepo.keys()),
      `${provider.id} repository entries`,
    );
    for (const [id, path] of expectedRepo) {
      if (actualRepo.get(id) !== path) fail(`${id} repository source differs`);
    }
    const entries = new Map(provider.entries.map((entry) => [entry.id, entry]));
    if (provider.id === "borgbackup") {
      validateFixedBinding(
        entries.get("borg-candidate-archive"),
        plan.candidate.asset.sha256,
        plan.candidate.asset.bytes,
      );
      validateFixedBinding(
        entries.get("borg-candidate-signature"),
        plan.candidate.asset.signatureSha256,
      );
      validateFixedBinding(
        entries.get("borg-candidate-readme"),
        plan.candidate.asset.readmeSha256,
      );
      validateFixedBinding(
        entries.get("borg-candidate-executable"),
        plan.candidate.executableSha256,
      );
      validateFixedBinding(
        entries.get("borg-rollback-package"),
        plan.installed.package.sha256,
      );
      if (
        entries.get("borg-signing-key").signingFingerprint !==
        plan.candidate.signing.primaryFingerprint
      ) {
        fail("Borg signing fingerprint differs from the candidate plan");
      }
      const evidence = YAML.parse(
        readStableFile(
          join(sourceRoot, "docs/plan/evidence/M16/borgbackup-security.yaml"),
          262_144,
          "BorgBackup evidence",
          { capture: true, enforceMode: false },
        ).content.toString("utf8"),
      );
      if (
        evidence.candidate.commit !== provider.candidateCommit ||
        evidence.plan.sha256 !== provider.plan.sha256
      ) {
        fail("Borg candidate evidence binding differs");
      }
    } else if (provider.id === "openssh-client") {
      validateFixedBinding(
        entries.get("openssh-source-archive"),
        plan.candidate.source.sha256,
        plan.candidate.source.bytes,
      );
      validateFixedBinding(
        entries.get("openssh-source-signature"),
        plan.candidate.source.signatureSha256,
      );
      validateFixedBinding(
        entries.get("openssh-release-key"),
        plan.candidate.source.releaseKeySha256,
      );
      validateFixedBinding(
        entries.get("openssh-candidate-executable"),
        plan.candidate.executableSha256,
      );
      validateFixedBinding(
        entries.get("openssh-rollback-package"),
        plan.installed.hostClient.sha256,
      );
      if (
        entries.get("openssh-release-key").signingFingerprint !==
        plan.candidate.source.signingFingerprint
      ) {
        fail("OpenSSH signing fingerprint differs from the candidate plan");
      }
      const evidence = YAML.parse(
        readStableFile(
          join(
            sourceRoot,
            "docs/plan/evidence/M16/openssh-client-security.yaml",
          ),
          262_144,
          "OpenSSH client evidence",
          { capture: true, enforceMode: false },
        ).content.toString("utf8"),
      );
      if (
        evidence.candidate.commit !== provider.candidateCommit ||
        evidence.plan.sha256 !== provider.plan.sha256
      ) {
        fail("OpenSSH candidate evidence binding differs");
      }
    } else {
      const host = plan.endpoints?.find(
        (endpoint) => endpoint.id === "proxmox-host",
      );
      const guest = plan.endpoints?.find(
        (endpoint) => endpoint.id === "database-guest",
      );
      if (
        !host ||
        !guest ||
        host.package?.dependencies?.length !== 1 ||
        host.rollbackPackages?.length !== 2 ||
        guest.rollbackPackages?.length !== 1
      ) {
        fail("rsync endpoint package plan differs");
      }
      validateFixedBinding(
        entries.get("rsync-host-candidate-package"),
        host.package.sha256,
      );
      validateFixedBinding(
        entries.get("rsync-host-candidate-libacl1"),
        host.package.dependencies[0].sha256,
      );
      validateFixedBinding(
        entries.get("rsync-guest-candidate-package"),
        guest.package.sha256,
      );
      validateFixedBinding(
        entries.get("rsync-host-rollback-package"),
        host.rollbackPackages[0].sha256,
      );
      validateFixedBinding(
        entries.get("rsync-host-rollback-libacl1"),
        host.rollbackPackages[1].sha256,
      );
      validateFixedBinding(
        entries.get("rsync-guest-rollback-package"),
        guest.rollbackPackages[0].sha256,
      );
      if (
        entries.get("rsync-guest-candidate-package").signingFingerprint !==
        guest.package.signingFingerprint
      ) {
        fail("rsync guest signing fingerprint differs from the plan");
      }
      const evidence = YAML.parse(
        readStableFile(
          join(sourceRoot, "docs/plan/evidence/M15/recovery-transport.yaml"),
          262_144,
          "rsync transport evidence",
          { capture: true, enforceMode: false },
        ).content.toString("utf8"),
      );
      if (
        evidence.candidate.commit !== provider.candidateCommit ||
        evidence.plan.sha256 !== provider.plan.sha256 ||
        entries.get("rsync-canary-report")?.sha256 !==
          evidence.canary.reportSha256 ||
        evidence.checks?.find((check) => check.id === "rollback_escrow")
          ?.status !== "pending" ||
        evidence.productionMutation !== false
      ) {
        fail("rsync candidate evidence binding or authority differs");
      }
    }
  }
}

function validateCanonicalEvidence(policyBytes) {
  const loaded = readYaml(evidencePath, 262_144, "escrow evidence", {
    enforceMode: false,
  });
  const evidence = loaded.document;
  exactObjectKeys(
    evidence,
    [
      "schema",
      "status",
      "observedAt",
      "candidate",
      "policy",
      "checks",
      "productionAccess",
      "productionMutation",
      "productionAuthority",
      "operationsEscrowComplete",
      "automaticFails",
    ],
    "escrow evidence",
  );
  exactUtc(evidence.observedAt, "escrow evidence observedAt");
  if (
    evidence.schema !== "starfiniti.recovery-artifact-escrow-evidence.v2" ||
    evidence.status !== "in_progress" ||
    evidence.productionAccess !== false ||
    evidence.productionMutation !== false ||
    evidence.productionAuthority !== false ||
    evidence.operationsEscrowComplete !== false
  ) {
    fail("escrow evidence identity or authority differs");
  }
  exactObjectKeys(
    evidence.candidate,
    ["branch", "commit"],
    "evidence candidate",
  );
  if (
    evidence.candidate.branch !== "codex/enterprise-roadmap-integration" ||
    (evidence.candidate.commit !== null &&
      !commitPattern.test(evidence.candidate.commit))
  ) {
    fail("escrow evidence candidate differs");
  }
  exactObjectKeys(evidence.policy, ["path", "sha256"], "evidence policy");
  if (
    evidence.policy.path !== policyRelativePath ||
    evidence.policy.sha256 !== digest(policyBytes)
  ) {
    fail("escrow evidence policy binding differs");
  }
  if (
    !Array.isArray(evidence.checks) ||
    evidence.checks.length !== evidenceChecks.size
  )
    fail("escrow evidence checks are invalid");
  exactSet(
    new Set(evidence.checks.map((check) => check.id)),
    new Set(evidenceChecks.keys()),
    "escrow evidence checks",
  );
  for (const check of evidence.checks) {
    exactObjectKeys(check, ["id", "status", "evidence"], `${check.id} check`);
    const expectedStatus = evidenceChecks.get(check.id);
    const statusMatches =
      expectedStatus instanceof Set
        ? expectedStatus.has(check.status)
        : check.status === expectedStatus;
    if (
      !statusMatches ||
      typeof check.evidence !== "string" ||
      check.evidence.length < 30
    ) {
      fail(`${check.id} evidence check differs`);
    }
  }
  const exactHead = evidence.checks.find(
    (check) => check.id === "exact_head_ci",
  );
  if (
    (exactHead.status === "pending" && evidence.candidate.commit !== null) ||
    (exactHead.status === "passed" &&
      !commitPattern.test(evidence.candidate.commit ?? ""))
  ) {
    fail("escrow evidence candidate and exact-head state disagree");
  }
  if (
    !Array.isArray(evidence.automaticFails) ||
    evidence.automaticFails.length !== 7
  ) {
    fail("escrow evidence automatic failures differ");
  }
}

function validateRepositoryWiring(sourceRoot = root) {
  const packageDocument = readJson(
    join(sourceRoot, "package.json"),
    262_144,
    "package scripts",
    { enforceMode: false },
  ).document;
  const expectedScripts = new Map([
    [
      "recovery-artifact-escrow:validate",
      "node scripts/verify-recovery-artifact-escrow.mjs --self-test",
    ],
    [
      "recovery-artifact-escrow:inventory",
      "node scripts/verify-recovery-artifact-escrow.mjs --inventory",
    ],
    [
      "recovery-artifact-escrow:verify",
      "node scripts/verify-recovery-artifact-escrow.mjs --verify",
    ],
  ]);
  for (const [name, command] of expectedScripts) {
    if (packageDocument.scripts?.[name] !== command) {
      fail(`${name} package wiring differs`);
    }
  }
  if (
    !packageDocument.scripts?.check?.includes(
      "npm run recovery-artifact-escrow:validate",
    )
  ) {
    fail("repository check omits recovery artifact escrow validation");
  }

  const expectedReferences = new Map([
    [
      "docs/operations/BORGBACKUP_SECURITY_UPDATE.md",
      [
        "recovery-artifact-escrow:inventory",
        "recovery-artifact-escrow:verify",
        "recovery-artifact-escrow-v2.yaml",
        "`operations_escrow` remains pending",
      ],
    ],
    [
      "docs/operations/OPENSSH_CLIENT_SECURITY_UPDATE.md",
      [
        "recovery-artifact-escrow:inventory",
        "recovery-artifact-escrow:verify",
        "recovery-artifact-escrow-v2.yaml",
        "cannot prove the signing fingerprint",
      ],
    ],
    [
      "docs/operations/BACKUP_RESTORE.md",
      [
        "recovery-artifact-escrow:inventory",
        "recovery-artifact-escrow:verify",
        "recovery-artifact-escrow-v2.yaml",
        "Package-authority review",
      ],
    ],
    [
      "docs/plan/TASKS.yaml",
      [
        "npm run recovery-artifact-escrow:validate",
        "docs/architecture/ADR/0094-versioned-shared-recovery-artifact-escrow.md",
        "docs/plan/evidence/M16/recovery-artifact-escrow-v2.yaml",
      ],
    ],
    [
      "RISKS.md",
      [
        "R-004",
        "closed 64-entry V2 no-network recovery escrow verifier",
        "private custody/review",
      ],
    ],
  ]);
  for (const [path, references] of expectedReferences) {
    const text = readStableFile(
      safeRepositoryPath(path, `${path} wiring`, sourceRoot),
      2_097_152,
      `${path} wiring`,
      { capture: true, enforceMode: false },
    ).content.toString("utf8");
    for (const reference of references) {
      if (!text.includes(reference)) {
        fail(`${path} omits required recovery escrow wiring`);
      }
    }
  }
}

function validateFixedBinding(entry, sha256, exactBytes) {
  if (!entry || entry.expected !== "fixed" || entry.sha256 !== sha256) {
    fail("fixed artifact binding differs from its candidate plan");
  }
  if (exactBytes !== undefined && entry.exactBytes !== exactBytes) {
    fail(`${entry.id} exact byte binding differs from its candidate plan`);
  }
}

function getCleanHead(sourceRoot = root) {
  const beforeHead = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: sourceRoot,
    encoding: "utf8",
  }).trim();
  const status = execFileSync(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all"],
    { cwd: sourceRoot, encoding: "utf8" },
  );
  const afterHead = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: sourceRoot,
    encoding: "utf8",
  }).trim();
  if (
    !commitPattern.test(beforeHead) ||
    beforeHead !== afterHead ||
    status.trim() !== ""
  ) {
    fail("inventory requires a clean exact Git commit");
  }
  return beforeHead;
}

function expectedEntryDigest(entry, sourceRoot) {
  if (entry.expected === "fixed") return entry.sha256;
  if (entry.expected === "repository-file") {
    return readStableFile(
      safeRepositoryPath(
        entry.sourcePath,
        `${entry.id} source path`,
        sourceRoot,
      ),
      entry.maximumBytes,
      `${entry.id} repository source`,
    ).sha256;
  }
  return undefined;
}

function validateDependencyInventory(bytes, entry, provider, plan) {
  let document;
  try {
    document = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail(`${entry.id} is not valid JSON`);
  }
  exactObjectKeys(
    document,
    [
      "schema",
      "provider",
      "observedAt",
      "inspectionMethod",
      "candidateExecutableSha256",
      "candidateVersion",
      "staticallyLinked",
      "libraries",
      "productionMutation",
    ],
    `${entry.id} document`,
  );
  const expectedSha = plan.candidate.executableSha256;
  const expectedVersion = plan.candidate.version;
  if (
    document.schema !== entry.contentSchema ||
    document.provider !== provider.id ||
    document.inspectionMethod !== "approved-read-only-runtime" ||
    document.candidateExecutableSha256 !== expectedSha ||
    document.candidateVersion !== expectedVersion ||
    typeof document.staticallyLinked !== "boolean" ||
    document.productionMutation !== false
  ) {
    fail(`${entry.id} identity or authority differs`);
  }
  exactUtc(document.observedAt, `${entry.id} observedAt`);
  if (!Array.isArray(document.libraries)) {
    fail(`${entry.id} libraries are invalid`);
  }
  if (!document.staticallyLinked && document.libraries.length === 0) {
    fail(`${entry.id} omits dynamic libraries`);
  }
  const names = new Set();
  for (const library of document.libraries) {
    exactObjectKeys(library, ["soname", "sha256"], `${entry.id} library`);
    if (
      typeof library.soname !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9.+_-]{1,127}$/u.test(library.soname) ||
      names.has(library.soname) ||
      !digestPattern.test(library.sha256) ||
      /^0{64}$/u.test(library.sha256)
    ) {
      fail(`${entry.id} contains an invalid or duplicate library`);
    }
    names.add(library.soname);
  }
}

function validatePrivateContent(result, entry, provider, plan) {
  if (entry.role === "signing-key") {
    const text = result.content.toString("utf8");
    if (
      !text.startsWith("-----BEGIN PGP PUBLIC KEY BLOCK-----") ||
      !text.includes("-----END PGP PUBLIC KEY BLOCK-----") ||
      text.includes("\0")
    ) {
      fail(`${entry.id} is not a bounded armored public-key export`);
    }
  }
  if (entry.contentSchema !== undefined) {
    validateDependencyInventory(result.content, entry, provider, plan);
  }
}

function readAndValidateEntries(
  bundleRoot,
  policy,
  sourceRoot,
  manifestEntries,
) {
  const entries = uniqueEntries(policyProviders(policy));
  const manifestById = manifestEntries
    ? new Map(manifestEntries.map((entry) => [entry.id, entry]))
    : undefined;
  const plans = new Map(
    policyProviders(policy).map((provider) => [
      provider.id,
      YAML.parse(
        readStableFile(
          safeRepositoryPath(
            provider.plan.path,
            `${provider.id} plan`,
            sourceRoot,
          ),
          262_144,
          `${provider.id} plan`,
          { capture: true, enforceMode: false },
        ).content.toString("utf8"),
      ),
    ]),
  );
  let totalBytes = 0;
  const resultEntries = [];
  for (const entry of entries) {
    const provider = policyProviders(policy).find(
      (item) => item.id === entry.providerId,
    );
    const actual = readStableFile(
      join(bundleRoot, ...entry.relativePath.split("/")),
      entry.maximumBytes,
      entry.id,
      { capture: privateEntryIds.has(entry.id) },
    );
    totalBytes += actual.bytes;
    if (totalBytes > policy.bounds.maximumTotalBytes) {
      fail("bundle exceeds the total byte bound");
    }
    if (entry.exactBytes !== undefined && actual.bytes !== entry.exactBytes) {
      fail(`${entry.id} exact byte count differs`);
    }
    const expectedDigest = expectedEntryDigest(entry, sourceRoot);
    if (expectedDigest !== undefined && actual.sha256 !== expectedDigest) {
      fail(`${entry.id} digest differs`);
    }
    validatePrivateContent(actual, entry, provider, plans.get(provider.id));
    if (manifestById) {
      const recorded = manifestById.get(entry.id);
      if (
        !recorded ||
        recorded.relativePath !== entry.relativePath ||
        recorded.sha256 !== actual.sha256 ||
        recorded.bytes !== actual.bytes
      ) {
        fail(`${entry.id} private manifest binding differs`);
      }
    }
    resultEntries.push({
      id: entry.id,
      relativePath: entry.relativePath,
      sha256: actual.sha256,
      bytes: actual.bytes,
    });
  }
  return { entries: resultEntries, totalBytes };
}

function assertStableValidation(first, second) {
  if (
    first.totalBytes !== second.totalBytes ||
    JSON.stringify(first.entries) !== JSON.stringify(second.entries)
  ) {
    fail("bundle bytes changed between verification passes");
  }
}

function assertHeadStable(headCommit, verifyHead) {
  if (verifyHead() !== headCommit) {
    fail("repository head changed during inventory verification");
  }
}

function validateManifest(document, policy, policySha256, headCommit, now) {
  exactObjectKeys(
    document,
    [
      "schema",
      "createdAt",
      "candidateCommit",
      "policySha256",
      "entries",
      "authority",
    ],
    "private manifest",
  );
  const createdAt = exactUtc(document.createdAt, "private manifest createdAt");
  if (createdAt > now + 300_000) fail("private manifest is from the future");
  if (
    document.schema !== schemaFor(policy, "manifest") ||
    document.candidateCommit !== headCommit ||
    document.policySha256 !== policySha256
  ) {
    fail("private manifest identity or governance binding differs");
  }
  if (!Array.isArray(document.entries))
    fail("private manifest entries are invalid");
  const expectedEntries = uniqueEntries(policyProviders(policy));
  if (document.entries.length !== expectedEntries.length) {
    fail("private manifest entry count differs");
  }
  for (let index = 0; index < expectedEntries.length; index += 1) {
    const expected = expectedEntries[index];
    const actual = document.entries[index];
    exactObjectKeys(
      actual,
      ["id", "relativePath", "sha256", "bytes"],
      `${expected.id} manifest entry`,
    );
    if (
      actual.id !== expected.id ||
      actual.relativePath !== expected.relativePath ||
      !digestPattern.test(actual.sha256) ||
      /^0{64}$/u.test(actual.sha256) ||
      !Number.isSafeInteger(actual.bytes) ||
      actual.bytes < 1 ||
      actual.bytes > expected.maximumBytes
    ) {
      fail(`${expected.id} private manifest entry differs`);
    }
  }
  exactObjectKeys(
    document.authority,
    authorityKeysFor(policy),
    "private manifest authority",
  );
  for (const key of authorityKeysFor(policy)) {
    if (document.authority[key] !== false) {
      fail(`${key} may not be asserted by inventory verification`);
    }
  }
}

function validateExpectedMembers(files, policy, includeManifest) {
  const expected = new Set([
    policy.filesystem.policyCopyPath,
    ...uniqueEntries(policyProviders(policy)).map(
      (entry) => entry.relativePath,
    ),
  ]);
  if (includeManifest) expected.add(policy.filesystem.privateManifestPath);
  exactSet(files, expected, "bundle members");
}

function verifyPolicyCopy(bundleRoot, policy, policyBytes) {
  const copy = readStableFile(
    join(bundleRoot, policy.filesystem.policyCopyPath),
    policy.bounds.maximumPolicyBytes,
    "escrow policy copy",
    { capture: true },
  );
  if (!copy.content.equals(policyBytes)) fail("escrow policy copy differs");
}

function writeExclusive(path, bytes, maximumBytes, label) {
  if (!isAbsolute(path) || bytes.length < 2 || bytes.length > maximumBytes) {
    fail(`${label} output path or size is invalid`);
  }
  const parent = dirname(path);
  const parentStat = lstatSync(parent);
  assertDirectPath(parent, `${label} output parent`);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) {
    fail(`${label} output parent is not a real directory`);
  }
  validateWritableMode(parentStat, `${label} output parent`);
  let descriptor;
  try {
    descriptor = openSync(
      path,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    let offset = 0;
    while (offset < bytes.length) {
      const count = writeSync(descriptor, bytes, offset, bytes.length - offset);
      if (count === 0) fail(`${label} output write stopped`);
      offset += count;
    }
    fsyncSync(descriptor);
    const opened = fstatSync(descriptor);
    const linked = lstatSync(path);
    const finalParent = lstatSync(parent);
    assertDirectPath(parent, `${label} output parent`);
    if (
      !opened.isFile() ||
      !linked.isFile() ||
      opened.dev !== linked.dev ||
      opened.ino !== linked.ino ||
      opened.nlink !== 1 ||
      opened.size !== bytes.length ||
      (process.platform !== "win32" && (opened.mode & 0o077) !== 0) ||
      !finalParent.isDirectory() ||
      finalParent.isSymbolicLink() ||
      finalParent.dev !== parentStat.dev ||
      finalParent.ino !== parentStat.ino ||
      finalParent.nlink !== parentStat.nlink
    ) {
      fail(`${label} output is not one exact regular file`);
    }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function inventoryBundle({
  bundle,
  policy,
  policyBytes,
  sourceRoot,
  headCommit,
  verifyHead = () => headCommit,
  now,
}) {
  const bundleRoot = validateBundleRoot(bundle, sourceRoot);
  const files = scanBundle(bundleRoot, policy.bounds.maximumEntries);
  validateExpectedMembers(files, policy, false);
  verifyPolicyCopy(bundleRoot, policy, policyBytes);
  const result = readAndValidateEntries(bundleRoot, policy, sourceRoot);
  const repeated = readAndValidateEntries(bundleRoot, policy, sourceRoot);
  assertStableValidation(result, repeated);
  validateExpectedMembers(
    scanBundle(bundleRoot, policy.bounds.maximumEntries),
    policy,
    false,
  );
  verifyPolicyCopy(bundleRoot, policy, policyBytes);
  assertHeadStable(headCommit, verifyHead);
  const manifest = {
    schema: schemaFor(policy, "manifest"),
    createdAt: nowUtc(now),
    candidateCommit: headCommit,
    policySha256: digest(policyBytes),
    entries: result.entries,
    authority: Object.fromEntries(
      authorityKeysFor(policy).map((key) => [key, false]),
    ),
  };
  const manifestBytes = Buffer.from(
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  writeExclusive(
    join(bundleRoot, policy.filesystem.privateManifestPath),
    manifestBytes,
    policy.bounds.maximumManifestBytes,
    "private manifest",
  );
  return manifest;
}

function verifyBundle({
  bundle,
  output,
  policy,
  policyBytes,
  sourceRoot,
  headCommit,
  verifyHead = () => headCommit,
  now,
}) {
  const bundleRoot = validateBundleRoot(bundle, sourceRoot);
  if (!isAbsolute(output) || isInside(bundleRoot, output)) {
    fail("minimized report must be an absolute path outside the bundle");
  }
  const files = scanBundle(bundleRoot, policy.bounds.maximumEntries);
  validateExpectedMembers(files, policy, true);
  verifyPolicyCopy(bundleRoot, policy, policyBytes);
  const manifestResult = readJson(
    join(bundleRoot, policy.filesystem.privateManifestPath),
    policy.bounds.maximumManifestBytes,
    "private manifest",
  );
  validateManifest(
    manifestResult.document,
    policy,
    digest(policyBytes),
    headCommit,
    now,
  );
  const result = readAndValidateEntries(
    bundleRoot,
    policy,
    sourceRoot,
    manifestResult.document.entries,
  );
  const repeatedManifest = readJson(
    join(bundleRoot, policy.filesystem.privateManifestPath),
    policy.bounds.maximumManifestBytes,
    "private manifest",
  );
  validateManifest(
    repeatedManifest.document,
    policy,
    digest(policyBytes),
    headCommit,
    now,
  );
  if (manifestResult.sha256 !== repeatedManifest.sha256) {
    fail("private manifest changed during verification");
  }
  const repeated = readAndValidateEntries(
    bundleRoot,
    policy,
    sourceRoot,
    repeatedManifest.document.entries,
  );
  assertStableValidation(result, repeated);
  validateExpectedMembers(
    scanBundle(bundleRoot, policy.bounds.maximumEntries),
    policy,
    true,
  );
  verifyPolicyCopy(bundleRoot, policy, policyBytes);
  assertHeadStable(headCommit, verifyHead);
  const providers = policyProviders(policy).map((provider) => {
    const ids = new Set(provider.entries.map((entry) => entry.id));
    const entries = result.entries.filter((entry) => ids.has(entry.id));
    return {
      id: provider.id,
      entryCount: entries.length,
      totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
    };
  });
  const report = {
    schema: schemaFor(policy, "report"),
    observedAt: nowUtc(now),
    candidateCommit: headCommit,
    policySha256: digest(policyBytes),
    privateManifestSha256: repeatedManifest.sha256,
    entryCount: result.entries.length,
    totalBytes: result.totalBytes,
    providers,
    verification: {
      policyCopyExact: true,
      closedEntrySet: true,
      stableDescriptorReads: true,
      fixedDigestsExact: true,
      repositoryFilesExact: true,
      privateInputsPresent: true,
      dependencyInventorySchemasValid: true,
      posixWriteProtectionChecked: process.platform !== "win32",
    },
    limitations: Object.fromEntries(
      reportLimitationKeysFor(policy).map((key) => [key, false]),
    ),
    productionAccess: false,
    productionMutation: false,
    productionAuthority: false,
  };
  validateReport(report, policy);
  const reportBytes = Buffer.from(
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  writeExclusive(
    output,
    reportBytes,
    policy.bounds.maximumReportBytes,
    "minimized report",
  );
  return report;
}

function validateReport(report, policy) {
  exactObjectKeys(
    report,
    [
      "schema",
      "observedAt",
      "candidateCommit",
      "policySha256",
      "privateManifestSha256",
      "entryCount",
      "totalBytes",
      "providers",
      "verification",
      "limitations",
      "productionAccess",
      "productionMutation",
      "productionAuthority",
    ],
    "minimized report",
  );
  exactUtc(report.observedAt, "minimized report observedAt");
  if (
    report.schema !== schemaFor(policy, "report") ||
    !commitPattern.test(report.candidateCommit) ||
    !digestPattern.test(report.policySha256) ||
    !digestPattern.test(report.privateManifestSha256) ||
    report.entryCount !== policy.bounds.maximumEntries ||
    !Number.isSafeInteger(report.totalBytes) ||
    report.totalBytes < 1 ||
    report.totalBytes > policy.bounds.maximumTotalBytes ||
    report.productionAccess !== false ||
    report.productionMutation !== false ||
    report.productionAuthority !== false
  ) {
    fail("minimized report identity, bounds, or authority differs");
  }
  const expectedProviderIds = new Set(
    policyProviders(policy).map((provider) => provider.id),
  );
  exactSet(
    new Set(report.providers.map((provider) => provider.id)),
    expectedProviderIds,
    "minimized report providers",
  );
  if (report.providers.length !== expectedProviderIds.size) {
    fail("minimized report provider count differs");
  }
  let providerEntryCount = 0;
  let providerTotalBytes = 0;
  for (const provider of report.providers) {
    exactObjectKeys(
      provider,
      ["id", "entryCount", "totalBytes"],
      `${provider.id} report provider`,
    );
    const expectedEntryCount =
      policyProviders(policy).find((item) => item.id === provider.id)?.entries
        .length ?? -1;
    if (
      provider.entryCount !== expectedEntryCount ||
      !Number.isSafeInteger(provider.totalBytes) ||
      provider.totalBytes < 1 ||
      provider.totalBytes > policy.bounds.maximumTotalBytes
    ) {
      fail(`${provider.id} report provider bounds differ`);
    }
    providerEntryCount += provider.entryCount;
    providerTotalBytes += provider.totalBytes;
  }
  if (
    providerEntryCount !== report.entryCount ||
    providerTotalBytes !== report.totalBytes
  ) {
    fail("minimized report provider totals do not reconcile");
  }
  exactObjectKeys(
    report.verification,
    [
      "policyCopyExact",
      "closedEntrySet",
      "stableDescriptorReads",
      "fixedDigestsExact",
      "repositoryFilesExact",
      "privateInputsPresent",
      "dependencyInventorySchemasValid",
      "posixWriteProtectionChecked",
    ],
    "minimized report verification",
  );
  for (const [key, value] of Object.entries(report.verification)) {
    if (key === "posixWriteProtectionChecked") {
      if (typeof value !== "boolean") fail(`${key} is not boolean`);
    } else if (value !== true) {
      fail(`${key} must be true`);
    }
  }
  exactObjectKeys(
    report.limitations,
    reportLimitationKeysFor(policy),
    "minimized report limitations",
  );
  for (const value of Object.values(report.limitations)) {
    if (value !== false) fail("minimized report overstates escrow completion");
  }
  const serialized = JSON.stringify(report).toLowerCase();
  for (const forbidden of [
    "privatekey",
    "password",
    "credential",
    "endpoint",
    "hostname",
    "username",
    "repositorypath",
    "bundlepath",
  ]) {
    if (serialized.includes(forbidden)) {
      fail("minimized report contains a forbidden private field");
    }
  }
}

function loadHistoricalPolicy() {
  const policy = readYaml(
    join(root, historicalPolicyRelativePath),
    131_072,
    "historical V1 escrow policy",
    { enforceMode: false },
  );
  const evidence = readStableFile(
    join(root, historicalEvidenceRelativePath),
    262_144,
    "historical V1 escrow evidence",
    { capture: true, enforceMode: false },
  );
  if (
    policy.sha256 !== historicalPolicySha256 ||
    evidence.sha256 !== historicalEvidenceSha256 ||
    policy.document.schema !== "starfiniti.recovery-artifact-escrow-plan.v1" ||
    policy.document.version !== 1 ||
    policy.document.bounds?.maximumEntries !== 30
  ) {
    fail("accepted historical V1 policy or evidence differs");
  }
  return policy.document;
}

function loadCanonicalPolicy() {
  const historicalPolicy = loadHistoricalPolicy();
  const loaded = readYaml(policyPath, 131_072, "escrow policy", {
    enforceMode: false,
  });
  validatePolicyShape(loaded.document, historicalPolicy);
  validateCanonicalBindings(loaded.document);
  validateCanonicalEvidence(loaded.content);
  validateRepositoryWiring();
  return { policy: loaded.document, policyBytes: loaded.content };
}

function parseArguments(argv) {
  const mode = argv[0];
  if (!["--self-test", "--inventory", "--verify"].includes(mode)) {
    fail("use --self-test, --inventory, or --verify");
  }
  if (mode === "--self-test") {
    if (argv.length !== 1) fail("self-test accepts no additional arguments");
    return { mode };
  }
  const values = new Map();
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined || values.has(key)) {
      fail("command arguments are incomplete or duplicated");
    }
    values.set(key, value);
  }
  const expected =
    mode === "--verify"
      ? new Set(["--bundle", "--out"])
      : new Set(["--bundle"]);
  exactSet(new Set(values.keys()), expected, "command arguments");
  return { mode, bundle: values.get("--bundle"), output: values.get("--out") };
}

function clone(value) {
  return structuredClone(value);
}

function fixturePolicy() {
  const fixed = Buffer.from("fixed recovery artifact\n", "utf8");
  const repo = Buffer.from("reviewed repository instruction\n", "utf8");
  const key = Buffer.from(
    "-----BEGIN PGP PUBLIC KEY BLOCK-----\nfixture\n-----END PGP PUBLIC KEY BLOCK-----\n",
    "utf8",
  );
  const dependency = Buffer.from(
    `${JSON.stringify({
      schema: "starfiniti.recovery-candidate-dependency-inventory.v1",
      provider: "openssh-client",
      observedAt: "2026-08-29T08:00:00Z",
      inspectionMethod: "approved-read-only-runtime",
      candidateExecutableSha256: "b".repeat(64),
      candidateVersion: "10.5p1",
      staticallyLinked: false,
      libraries: [{ soname: "libcrypto.so.3", sha256: "c".repeat(64) }],
      productionMutation: false,
    })}\n`,
    "utf8",
  );
  const makeProvider = (id, entries) => ({
    id,
    candidateCommit: "a".repeat(40),
    plan: { path: `${id}/plan.yaml`, sha256: "d".repeat(64) },
    entries,
  });
  return {
    fixed,
    repo,
    key,
    dependency,
    policy: {
      schema: "starfiniti.recovery-artifact-escrow-plan.v1",
      version: 1,
      status: "ready",
      scope: ["borgbackup", "openssh-client"],
      bounds: {
        maximumEntries: 4,
        maximumTotalBytes: 1_048_576,
        maximumManifestBytes: 262_144,
        maximumPolicyBytes: 131_072,
        maximumReportBytes: 65_536,
        readChunkBytes: 65_536,
      },
      filesystem: {
        bundleMustBeAbsolute: true,
        bundleMustBeOutsideRepository: true,
        bundleRootMayNotBeFilesystemRoot: true,
        rejectSymlinks: true,
        rejectHardlinks: true,
        rejectSpecialFiles: true,
        rejectUnexpectedMembers: true,
        rejectCaseCollisions: true,
        rejectGroupOrOtherWritableOnPosix: true,
        policyCopyPath: "escrow-policy.yaml",
        privateManifestPath: "manifest.json",
      },
      authority: {
        networkAccess: false,
        artifactCopy: false,
        artifactExecution: false,
        productionAccess: false,
        productionMutation: false,
        productionAuthority: false,
        inventoryVerificationCompletesEscrow: false,
        signingFingerprintReviewRequired: true,
        dependencyReviewRequired: true,
        offlineCopyReviewRequired: true,
        secondReviewerRequired: true,
      },
      providers: [
        makeProvider("borgbackup", [
          {
            id: "fixture-fixed",
            relativePath: "borgbackup/fixed.bin",
            role: "candidate-source",
            expected: "fixed",
            sha256: digest(fixed),
            exactBytes: fixed.length,
            maximumBytes: fixed.length,
          },
          {
            id: "borg-signing-key",
            relativePath: "borgbackup/signer.asc",
            role: "signing-key",
            expected: "private-manifest",
            signingFingerprint: "A".repeat(40),
            maximumBytes: 4096,
          },
        ]),
        makeProvider("openssh-client", [
          {
            id: "fixture-repository",
            relativePath: "openssh-client/repository/instruction.txt",
            role: "operations-runbook",
            expected: "repository-file",
            sourcePath: "openssh-client/instruction.txt",
            maximumBytes: 4096,
          },
          {
            id: "openssh-dependency-inventory",
            relativePath: "openssh-client/dependency-inventory.json",
            role: "dependency-inventory",
            expected: "private-manifest",
            contentSchema:
              "starfiniti.recovery-candidate-dependency-inventory.v1",
            maximumBytes: 4096,
          },
        ]),
      ],
      automaticFails: Array.from(
        { length: 6 },
        (_, index) => `fixture ${index}`,
      ),
    },
  };
}

function createFixture(base, mutate) {
  const values = fixturePolicy();
  const sourceRoot = join(
    base,
    `source-${Math.random().toString(16).slice(2)}`,
  );
  const bundle = join(base, `bundle-${Math.random().toString(16).slice(2)}`);
  const output = join(
    base,
    `report-${Math.random().toString(16).slice(2)}.json`,
  );
  mkdirSync(join(sourceRoot, "openssh-client"), { recursive: true });
  mkdirSync(join(sourceRoot, "borgbackup"), { recursive: true });
  writeFileSync(
    join(sourceRoot, "openssh-client/instruction.txt"),
    values.repo,
  );
  writeFileSync(
    join(sourceRoot, "openssh-client/plan.yaml"),
    YAML.stringify({
      candidate: { executableSha256: "b".repeat(64), version: "10.5p1" },
    }),
  );
  writeFileSync(
    join(sourceRoot, "borgbackup/plan.yaml"),
    YAML.stringify({
      candidate: { executableSha256: "e".repeat(64), version: "1.4.5" },
    }),
  );
  mkdirSync(join(bundle, "borgbackup"), { recursive: true });
  mkdirSync(join(bundle, "openssh-client/repository"), { recursive: true });
  writeFileSync(join(bundle, "borgbackup/fixed.bin"), values.fixed);
  writeFileSync(join(bundle, "borgbackup/signer.asc"), values.key);
  writeFileSync(
    join(bundle, "openssh-client/repository/instruction.txt"),
    values.repo,
  );
  writeFileSync(
    join(bundle, "openssh-client/dependency-inventory.json"),
    values.dependency,
  );
  if (process.platform !== "win32") {
    chmodSync(sourceRoot, 0o700);
    chmodSync(bundle, 0o700);
    chmodSync(join(bundle, "borgbackup"), 0o700);
    chmodSync(join(bundle, "openssh-client"), 0o700);
    chmodSync(join(bundle, "openssh-client/repository"), 0o700);
    for (const path of [
      join(bundle, "borgbackup/fixed.bin"),
      join(bundle, "borgbackup/signer.asc"),
      join(bundle, "openssh-client/repository/instruction.txt"),
      join(bundle, "openssh-client/dependency-inventory.json"),
    ])
      chmodSync(path, 0o600);
  }
  if (mutate) mutate({ ...values, sourceRoot, bundle, output });
  const policyBytes = Buffer.from(YAML.stringify(values.policy), "utf8");
  writeFileSync(join(bundle, "escrow-policy.yaml"), policyBytes);
  if (process.platform !== "win32")
    chmodSync(join(bundle, "escrow-policy.yaml"), 0o600);
  return { ...values, sourceRoot, bundle, output, policyBytes };
}

function runSelfTest() {
  const canonical = loadCanonicalPolicy();
  if (
    canonical.policy.bounds.maximumEntries !== 64 ||
    policyProviders(canonical.policy).length !== 3
  ) {
    fail("canonical policy self-test did not load the closed catalogue");
  }
  const historicalPolicy = loadHistoricalPolicy();
  const expectCanonicalRejected = (label, expectedMessage, mutate, bind) => {
    const policy = clone(canonical.policy);
    mutate(policy);
    try {
      validatePolicyShape(policy, historicalPolicy);
      if (bind) validateCanonicalBindings(policy);
      fail(`${label} fixture was accepted`);
    } catch (error) {
      if (!String(error.message).includes(expectedMessage)) throw error;
    }
  };
  expectCanonicalRejected(
    "historical V1 drift",
    "policy extension differs from immutable V1",
    (policy) => {
      policy.extends.sha256 = "0".repeat(64);
    },
  );
  expectCanonicalRejected(
    "rsync package drift",
    "fixed artifact binding differs",
    (policy) => {
      policy.providers[0].entries.find(
        (entry) => entry.id === "rsync-host-candidate-package",
      ).sha256 = "0".repeat(63) + "1";
    },
    true,
  );
  expectCanonicalRejected(
    "rsync canary-report drift",
    "rsync candidate evidence binding or authority differs",
    (policy) => {
      policy.providers[0].entries.find(
        (entry) => entry.id === "rsync-canary-report",
      ).sha256 = "0".repeat(63) + "1";
    },
    true,
  );
  expectCanonicalRejected(
    "rsync runtime omission",
    "entry catalogue count differs",
    (policy) => {
      policy.providers[0].entries = policy.providers[0].entries.filter(
        (entry) => entry.id !== "rsync-archive-service",
      );
    },
  );
  const base = mkdtempSync(join(tmpdir(), "starfiniti-recovery-escrow-"));
  const expectRejected = (label, expectedMessage, setup, afterInventory) => {
    const fixture = createFixture(base, setup);
    try {
      if (afterInventory) {
        inventoryBundle({
          ...fixture,
          policy: fixture.policy,
          headCommit: "a".repeat(40),
          now: Date.parse("2026-08-29T08:10:00Z"),
        });
        afterInventory(fixture);
        verifyBundle({
          ...fixture,
          policy: fixture.policy,
          headCommit: "a".repeat(40),
          now: Date.parse("2026-08-29T08:11:00Z"),
        });
      } else {
        inventoryBundle({
          ...fixture,
          policy: fixture.policy,
          headCommit: "a".repeat(40),
          now: Date.parse("2026-08-29T08:10:00Z"),
        });
      }
      fail(`${label} fixture was accepted`);
    } catch (error) {
      if (!String(error.message).includes(expectedMessage)) throw error;
    }
  };
  try {
    const fixture = createFixture(base);
    inventoryBundle({
      ...fixture,
      policy: fixture.policy,
      headCommit: "a".repeat(40),
      now: Date.parse("2026-08-29T08:10:00Z"),
    });
    const report = verifyBundle({
      ...fixture,
      policy: fixture.policy,
      headCommit: "a".repeat(40),
      now: Date.parse("2026-08-29T08:11:00Z"),
    });
    if (report.limitations.operationsEscrowComplete !== false) {
      fail("positive fixture overstated escrow completion");
    }
    const v2Fixture = createFixture(base, ({ policy }) => {
      policy.schema = "starfiniti.recovery-artifact-escrow-plan.v2";
      policy.version = 2;
    });
    inventoryBundle({
      ...v2Fixture,
      policy: v2Fixture.policy,
      headCommit: "a".repeat(40),
      now: Date.parse("2026-08-29T08:10:00Z"),
    });
    const v2FixtureReport = verifyBundle({
      ...v2Fixture,
      policy: v2Fixture.policy,
      headCommit: "a".repeat(40),
      now: Date.parse("2026-08-29T08:11:00Z"),
    });
    if (
      v2FixtureReport.schema !==
        "starfiniti.recovery-artifact-escrow-report.v2" ||
      v2FixtureReport.limitations.packageAuthorityReviewComplete !== false ||
      v2FixtureReport.limitations.consumerCompatibilityReviewComplete !==
        false ||
      v2FixtureReport.limitations.isolatedRestoreComplete !== false
    ) {
      fail("positive V2 fixture omitted versioned false-authority evidence");
    }
    const headDrift = createFixture(base);
    try {
      inventoryBundle({
        ...headDrift,
        policy: headDrift.policy,
        headCommit: "a".repeat(40),
        verifyHead: () => "b".repeat(40),
        now: Date.parse("2026-08-29T08:10:00Z"),
      });
      fail("repository head drift fixture was accepted");
    } catch (error) {
      if (!String(error.message).includes("repository head changed")) {
        throw error;
      }
    }
    expectRejected(
      "changed fixed byte",
      "fixture-fixed digest differs",
      undefined,
      ({ bundle }) =>
        writeFileSync(
          join(bundle, "borgbackup/fixed.bin"),
          "wrong recovery artifact\n",
        ),
    );
    expectRejected(
      "extra member",
      "bundle contains more files than the policy permits",
      undefined,
      ({ bundle }) => writeFileSync(join(bundle, "extra.bin"), "extra"),
    );
    expectRejected(
      "changed policy copy",
      "escrow policy copy differs",
      undefined,
      ({ bundle }) =>
        writeFileSync(join(bundle, "escrow-policy.yaml"), "changed: true\n"),
    );
    expectRejected(
      "false authority",
      "operationsEscrowComplete may not be asserted",
      undefined,
      ({ bundle }) => {
        const path = join(bundle, "manifest.json");
        const manifest = readJson(path, 262_144, "fixture manifest", {
          enforceMode: false,
        }).document;
        manifest.authority.operationsEscrowComplete = true;
        writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
      },
    );
    expectRejected(
      "malformed dependency inventory",
      "openssh-dependency-inventory identity or authority differs",
      ({ bundle, dependency }) => {
        const document = JSON.parse(dependency.toString("utf8"));
        document.productionMutation = true;
        writeFileSync(
          join(bundle, "openssh-client/dependency-inventory.json"),
          `${JSON.stringify(document)}\n`,
        );
      },
    );
    expectRejected(
      "hard linked artifact",
      "not one bounded stable regular file",
      ({ bundle, sourceRoot }) => {
        const path = join(bundle, "borgbackup/fixed.bin");
        linkSync(path, join(sourceRoot, "hardlink.tmp"));
      },
    );
    const unsafe = fixturePolicy().policy;
    unsafe.providers[0].entries[0].relativePath = "borgbackup/../escape.bin";
    try {
      uniqueEntries(unsafe.providers);
      validateEntry(unsafe.providers[0].entries[0], "borgbackup");
      fail("unsafe path fixture was accepted");
    } catch (error) {
      if (!String(error.message).includes("safe relative path")) throw error;
    }
    const overclaim = clone(report);
    overclaim.limitations.secondReviewerComplete = true;
    try {
      validateReport(overclaim, fixture.policy);
      fail("overclaim report fixture was accepted");
    } catch (error) {
      if (!String(error.message).includes("overstates escrow completion"))
        throw error;
    }
    const v2Providers = policyProviders(canonical.policy).map((provider) => ({
      id: provider.id,
      entryCount: provider.entries.length,
      totalBytes: provider.entries.length,
    }));
    const v2Report = {
      schema: schemaFor(canonical.policy, "report"),
      observedAt: "2026-08-29T08:11:00Z",
      candidateCommit: "a".repeat(40),
      policySha256: "b".repeat(64),
      privateManifestSha256: "c".repeat(64),
      entryCount: canonical.policy.bounds.maximumEntries,
      totalBytes: canonical.policy.bounds.maximumEntries,
      providers: v2Providers,
      verification: {
        policyCopyExact: true,
        closedEntrySet: true,
        stableDescriptorReads: true,
        fixedDigestsExact: true,
        repositoryFilesExact: true,
        privateInputsPresent: true,
        dependencyInventorySchemasValid: true,
        posixWriteProtectionChecked: process.platform !== "win32",
      },
      limitations: Object.fromEntries(
        reportLimitationKeysFor(canonical.policy).map((key) => [key, false]),
      ),
      productionAccess: false,
      productionMutation: false,
      productionAuthority: false,
    };
    validateReport(v2Report, canonical.policy);
    v2Report.limitations.packageAuthorityReviewComplete = true;
    try {
      validateReport(v2Report, canonical.policy);
      fail("V2 package-authority overclaim fixture was accepted");
    } catch (error) {
      if (!String(error.message).includes("overstates escrow completion"))
        throw error;
    }
    const providerLeak = clone(report);
    providerLeak.providers[0].bundlePath = "private/location";
    try {
      validateReport(providerLeak, fixture.policy);
      fail("provider report leakage fixture was accepted");
    } catch (error) {
      if (!String(error.message).includes("report provider keys differs")) {
        throw error;
      }
    }
    try {
      verifyBundle({
        ...fixture,
        policy: fixture.policy,
        output: join(fixture.bundle, "report.json"),
        headCommit: "a".repeat(40),
        now: Date.parse("2026-08-29T08:11:00Z"),
      });
      fail("inside-bundle report fixture was accepted");
    } catch (error) {
      if (!String(error.message).includes("outside the bundle")) throw error;
    }
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
  console.log(
    "Validated immutable V1 history plus the 64-entry Borg/OpenSSH/rsync V2 private escrow contract and adversarial inventory/report boundaries; no real escrow, network, production access, copy, execution, or mutation occurred.",
  );
}

const arguments_ = parseArguments(process.argv.slice(2));
if (arguments_.mode === "--self-test") {
  runSelfTest();
} else {
  const loaded = loadCanonicalPolicy();
  const headCommit = getCleanHead();
  if (arguments_.mode === "--inventory") {
    inventoryBundle({
      bundle: arguments_.bundle,
      policy: loaded.policy,
      policyBytes: loaded.policyBytes,
      sourceRoot: root,
      headCommit,
      verifyHead: () => getCleanHead(root),
      now: Date.now(),
    });
    console.log(
      "Created a private byte inventory only; fingerprint, dependency, offline-copy, second-review, production, and operations-escrow gates remain incomplete.",
    );
  } else {
    verifyBundle({
      bundle: arguments_.bundle,
      output: arguments_.output,
      policy: loaded.policy,
      policyBytes: loaded.policyBytes,
      sourceRoot: root,
      headCommit,
      verifyHead: () => getCleanHead(root),
      now: Date.now(),
    });
    console.log(
      "Verified the private byte inventory and wrote minimized evidence; operations escrow and every production authority gate remain incomplete.",
    );
  }
}
