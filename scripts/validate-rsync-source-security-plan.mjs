import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

import { readBoundJsonArtifact } from "./lib/read-bound-json-artifact.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const context = join(root, "infrastructure/testing/rsync-source-security");
const planPath = join(context, "plan.yaml");
const evidencePath = join(
  root,
  "docs/plan/evidence/M16/rsync-source-security.yaml",
);
const paths = {
  adr: join(
    root,
    "docs/architecture/ADR/0095-side-by-side-rsync-source-candidate.md",
  ),
  dockerfile: join(context, "Dockerfile"),
  sourceVerifier: join(context, "verify-source.py"),
  guestEntrypoint: join(context, "guest-entrypoint.sh"),
  hostCanary: join(context, "host-canary.sh"),
  readme: join(context, "README.md"),
  evidence: evidencePath,
  runner: join(root, "scripts/run-rsync-source-security-canary.mjs"),
  package: join(root, "package.json"),
  workflow: join(root, ".github/workflows/security.yml"),
};

const digestPattern = /^[0-9a-f]{64}$/u;
const commitPattern = /^[0-9a-f]{40}$/u;
const endpointIds = ["proxmox-host", "database-guest"];
const expected = {
  "proxmox-host": {
    image:
      "debian:13-slim@sha256:d7e12182ce18b85b93007c1dedf31f2d29e01ccf3182cc4017c709b6259bc132",
    role: "receiver",
    os: { id: "debian", versionId: "13" },
    authority: "debian-security",
    currentVersion: "3.4.1+ds1-5+deb13u3",
    currentSha256:
      "fee3fa3b5924cc7e0964603945e0edfd63b7f29fc3cd4cf7613ad970e05a55be",
    currentHost: "security.debian.org",
    nativeAclVersion: "2.3.2-2+b1",
  },
  "database-guest": {
    image:
      "ubuntu:24.04@sha256:33ceb71981b602c1a7443a53469e4dba065f7503eab3078a2d7a57a2ab987517",
    role: "sender",
    os: { id: "ubuntu", versionId: "24.04" },
    authority: "ubuntu-security",
    currentVersion: "3.2.7-1ubuntu1.5",
    currentSha256:
      "8f952895697d19a6f1caa71f17c7d4e8c1f1fb485eb824ffe3e4c77dd587b338",
    currentHost: "security.ubuntu.com",
    nativeAclVersion: "2.3.2-1build1.1",
  },
};

function fail(message) {
  throw new Error(`rsync source security plan invalid: ${message}`);
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...keys].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    fail(`${label} fields differ`);
  }
}

function exactHttps(value, label, hosts) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${label} must be an exact URL`);
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.search ||
    parsed.hash ||
    !hosts.has(parsed.hostname)
  ) {
    fail(`${label} is outside the approved HTTPS authority`);
  }
  return parsed;
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

export function planDigest(plan) {
  return createHash("sha256")
    .update(JSON.stringify(canonical(plan)))
    .digest("hex");
}

export function validateRsyncSourcePlan(plan) {
  exactKeys(
    plan,
    [
      "schema",
      "status",
      "profile",
      "architecture",
      "baseImages",
      "sources",
      "installed",
      "candidate",
      "compatibility",
      "rollback",
    ],
    "plan",
  );
  if (
    plan.schema !== "starfiniti.rsync-source-security-plan.v1" ||
    !["bootstrap", "locked", "candidate"].includes(plan.status) ||
    plan.profile !== "privileged-recovery-transport" ||
    plan.architecture !== "amd64"
  ) {
    fail("plan identity differs");
  }
  exactKeys(plan.baseImages, endpointIds, "base images");
  for (const endpointId of endpointIds) {
    if (plan.baseImages[endpointId] !== expected[endpointId].image) {
      fail(`${endpointId} base image differs`);
    }
  }
  exactKeys(
    plan.sources,
    [
      "release",
      "download",
      "install",
      "security",
      "restrictedWrapper",
      "debianAcl",
    ],
    "sources",
  );
  const exactSources = {
    release: "https://rsync.samba.org/",
    download: "https://rsync.samba.org/download.html",
    install: "https://download.samba.org/pub/rsync/INSTALL.html",
    security:
      "https://download.samba.org/pub/unpacked/rsync/rsync-web/security.html",
    restrictedWrapper: "https://download.samba.org/pub/rsync/rrsync.1",
    debianAcl: "https://sources.debian.org/src/acl/",
  };
  for (const [key, value] of Object.entries(plan.sources)) {
    exactHttps(
      value,
      `source ${key}`,
      new Set(["rsync.samba.org", "download.samba.org", "sources.debian.org"]),
    );
    if (value !== exactSources[key]) fail(`source ${key} differs`);
  }
  exactKeys(plan.installed, endpointIds, "installed endpoints");
  for (const endpointId of endpointIds) {
    const endpoint = plan.installed[endpointId];
    const wanted = expected[endpointId];
    exactKeys(
      endpoint,
      [
        "os",
        "package",
        "executablePath",
        "wrapperPath",
        "nativeAclPackage",
        "nativeAclVersion",
      ],
      `${endpointId} installed boundary`,
    );
    exactKeys(endpoint.os, ["id", "versionId"], `${endpointId} OS`);
    exactKeys(
      endpoint.package,
      ["authority", "name", "version", "url", "sha256"],
      `${endpointId} package`,
    );
    const packageUrl = exactHttps(
      endpoint.package.url,
      `${endpointId} package URL`,
      new Set([wanted.currentHost]),
    );
    if (
      endpoint.os.id !== wanted.os.id ||
      endpoint.os.versionId !== wanted.os.versionId ||
      endpoint.package.authority !== wanted.authority ||
      endpoint.package.name !== "rsync" ||
      endpoint.package.version !== wanted.currentVersion ||
      endpoint.package.sha256 !== wanted.currentSha256 ||
      !decodeURIComponent(packageUrl.pathname).endsWith(
        `rsync_${wanted.currentVersion}_amd64.deb`,
      ) ||
      endpoint.executablePath !== "/usr/bin/rsync" ||
      endpoint.wrapperPath !== "/usr/bin/rrsync" ||
      endpoint.nativeAclPackage !== "libacl1" ||
      endpoint.nativeAclVersion !== wanted.nativeAclVersion
    ) {
      fail(`${endpointId} installed rollback boundary differs`);
    }
  }
  exactKeys(
    plan.candidate,
    [
      "authority",
      "version",
      "protocol",
      "installRoot",
      "executablePath",
      "wrapperPath",
      "source",
      "sourceTree",
      "build",
      "endpoints",
    ],
    "candidate",
  );
  const candidate = plan.candidate;
  if (
    candidate.authority !== "rsync-upstream" ||
    candidate.version !== "3.5.0" ||
    candidate.protocol !== 32 ||
    candidate.installRoot !== "/opt/starfiniti/rsync/3.5.0" ||
    candidate.executablePath !== "/opt/starfiniti/rsync/3.5.0/bin/rsync" ||
    candidate.wrapperPath !== "/opt/starfiniti/rsync/3.5.0/bin/rrsync"
  ) {
    fail("candidate identity differs");
  }
  exactKeys(
    candidate.source,
    [
      "url",
      "sha256",
      "bytes",
      "signatureUrl",
      "signatureSha256",
      "releaseKeyUrl",
      "releaseKeySha256",
      "signingFingerprint",
    ],
    "candidate source",
  );
  const source = candidate.source;
  for (const [key, hosts] of [
    ["url", new Set(["download.samba.org"])],
    ["signatureUrl", new Set(["download.samba.org"])],
    ["releaseKeyUrl", new Set(["keys.openpgp.org"])],
  ]) {
    exactHttps(source[key], `candidate source ${key}`, hosts);
  }
  if (
    source.url !== "https://download.samba.org/pub/rsync/rsync-3.5.0.tar.gz" ||
    source.signatureUrl !== `${source.url}.asc` ||
    source.releaseKeyUrl !==
      "https://keys.openpgp.org/vks/v1/by-fingerprint/9FEF112DCE19A0DC7E882CB81BB24997A8535F6F" ||
    source.sha256 !==
      "c7ffd1ef653e99540f661e47cb00b7f9cad1ee6b972399b16f93d672656e0d33" ||
    source.signatureSha256 !==
      "d1991847892c02ba81834273f6bb9aa9107a30ba8bf5d16cc3e4560e4c2140d6" ||
    source.releaseKeySha256 !==
      "4129e90b0b62e915a453f071641f363e8b07d888c763be00f83128fd63447a6f" ||
    source.signingFingerprint !== "9FEF112DCE19A0DC7E882CB81BB24997A8535F6F" ||
    source.bytes !== 1_892_222
  ) {
    fail("candidate source authority differs");
  }
  exactKeys(
    candidate.sourceTree,
    ["root", "entries", "files", "links", "bytes", "manifestSha256"],
    "source tree",
  );
  if (
    candidate.sourceTree.root !== "rsync-3.5.0" ||
    candidate.sourceTree.entries !== 615 ||
    candidate.sourceTree.files !== 597 ||
    candidate.sourceTree.links !== 5 ||
    candidate.sourceTree.bytes !== 6_354_197 ||
    candidate.sourceTree.manifestSha256 !==
      "7c70dfbc4a9c1cddd433a1eeca6b08b2fe244922aeb5b585addb9be776e4d38a"
  ) {
    fail("source tree identity differs");
  }
  exactKeys(
    candidate.build,
    ["hardening", "configure", "requiredCapabilities"],
    "build",
  );
  const exactConfigure = [
    "--prefix=/opt/starfiniti/rsync/3.5.0",
    "--with-rrsync",
    "--with-included-popt",
    "--disable-debug",
  ];
  const exactCapabilities = [
    "ACLs",
    "xattrs",
    "iconv",
    "openssl-crypto",
    "xxhash",
    "zstd",
    "lz4",
  ];
  if (
    candidate.build.hardening !== "debian-dpkg-buildflags-hardening-all" ||
    JSON.stringify(candidate.build.configure) !==
      JSON.stringify(exactConfigure) ||
    JSON.stringify(candidate.build.requiredCapabilities) !==
      JSON.stringify(exactCapabilities)
  ) {
    fail("candidate build or capability set differs");
  }
  if (!Array.isArray(candidate.endpoints) || candidate.endpoints.length !== 2) {
    fail("candidate endpoints differ");
  }
  candidate.endpoints.forEach((endpoint, index) => {
    exactKeys(
      endpoint,
      ["id", "role", "executableSha256", "wrapperSha256"],
      `candidate endpoint ${index + 1}`,
    );
    const endpointId = endpointIds[index];
    if (
      endpoint.id !== endpointId ||
      endpoint.role !== expected[endpointId].role
    ) {
      fail("candidate endpoint order or role differs");
    }
    for (const key of ["executableSha256", "wrapperSha256"]) {
      const value = endpoint[key];
      if (
        (plan.status === "bootstrap" && value !== null) ||
        (["locked", "candidate"].includes(plan.status) &&
          (!digestPattern.test(value) || /^0{64}$/u.test(value)))
      ) {
        fail(`${endpointId} ${key} differs from the plan phase`);
      }
    }
  });
  exactKeys(
    plan.compatibility,
    [
      "internalNetwork",
      "publishedPorts",
      "module",
      "port",
      "requiredPairs",
      "files",
      "bytes",
      "maximumFiles",
      "maximumBytes",
      "maximumOutputBytes",
    ],
    "compatibility",
  );
  if (
    plan.compatibility.internalNetwork !== true ||
    plan.compatibility.publishedPorts !== 0 ||
    plan.compatibility.module !== "recovery" ||
    plan.compatibility.port !== 2873 ||
    JSON.stringify(plan.compatibility.requiredPairs) !==
      JSON.stringify([
        "current-host-to-candidate-guest",
        "candidate-host-to-candidate-guest",
      ]) ||
    plan.compatibility.files !== 2 ||
    plan.compatibility.bytes !== 21 ||
    plan.compatibility.maximumFiles !== 4 ||
    plan.compatibility.maximumBytes !== 1_048_576 ||
    plan.compatibility.maximumOutputBytes !== 16_384
  ) {
    fail("compatibility boundary differs");
  }
  exactKeys(
    plan.rollback,
    [
      "preserveDistributionPackages",
      "preserveDistributionExecutables",
      "preserveNativeAclLibraries",
      "globalLibraryUpgradeRequired",
      "selectorOnly",
      "operationsEscrowRequiredBeforeProduction",
      "realForcedCommandRequiredBeforeProduction",
      "manualAndTimerArchivesRequiredBeforeProduction",
      "isolatedRestoreRequiredBeforeProduction",
      "productionMutation",
    ],
    "rollback",
  );
  const requiredTrue = [
    "preserveDistributionPackages",
    "preserveDistributionExecutables",
    "preserveNativeAclLibraries",
    "selectorOnly",
    "operationsEscrowRequiredBeforeProduction",
    "realForcedCommandRequiredBeforeProduction",
    "manualAndTimerArchivesRequiredBeforeProduction",
    "isolatedRestoreRequiredBeforeProduction",
  ];
  if (
    requiredTrue.some((key) => plan.rollback[key] !== true) ||
    plan.rollback.globalLibraryUpgradeRequired !== false ||
    plan.rollback.productionMutation !== false
  ) {
    fail("rollback or authority boundary differs");
  }
  return plan;
}

export function validateCanaryReport(report, plan, options = {}) {
  const completed = options.completed === true;
  exactKeys(
    report,
    [
      "schema",
      "status",
      "candidateVersion",
      "protocol",
      "pairs",
      "files",
      "bytes",
      "internalNetwork",
      "publishedPorts",
      "sourceSignatureVerified",
      "safeSourceTreeVerified",
      "confinementVerified",
      "forcedCommandNegative",
      "distributionPathsPreserved",
      "globalLibraryUpgradeRequired",
      "endpoints",
      "productionMutation",
      ...(completed ? ["observedAt", "planSha256", "teardown"] : []),
    ],
    "canary report",
  );
  if (
    report.schema !== "starfiniti.rsync-source-security-canary.v1" ||
    report.status !== "passed" ||
    report.candidateVersion !== plan.candidate.version ||
    report.protocol !== plan.candidate.protocol ||
    report.pairs !== plan.compatibility.requiredPairs.length ||
    report.files !== plan.compatibility.files ||
    report.bytes !== plan.compatibility.bytes ||
    report.internalNetwork !== true ||
    report.publishedPorts !== 0 ||
    report.sourceSignatureVerified !== true ||
    report.safeSourceTreeVerified !== true ||
    report.confinementVerified !== true ||
    report.forcedCommandNegative !== true ||
    report.distributionPathsPreserved !== true ||
    report.globalLibraryUpgradeRequired !== false ||
    report.productionMutation !== false
  ) {
    fail("canary report outcome differs");
  }
  if (!Array.isArray(report.endpoints) || report.endpoints.length !== 2) {
    fail("canary endpoint report differs");
  }
  report.endpoints.forEach((endpoint, index) => {
    exactKeys(
      endpoint,
      [
        "id",
        "currentVersion",
        "currentExecutableSha256",
        "currentWrapperSha256",
        "candidateExecutableSha256",
        "candidateWrapperSha256",
        "nativeAclVersion",
      ],
      `canary endpoint ${index + 1}`,
    );
    const endpointId = endpointIds[index];
    const pinned = plan.candidate.endpoints[index];
    if (
      endpoint.id !== endpointId ||
      endpoint.currentVersion !== expected[endpointId].currentVersion ||
      endpoint.nativeAclVersion !== expected[endpointId].nativeAclVersion
    ) {
      fail(`${endpointId} canary identity differs`);
    }
    for (const key of [
      "currentExecutableSha256",
      "currentWrapperSha256",
      "candidateExecutableSha256",
      "candidateWrapperSha256",
    ]) {
      if (
        !digestPattern.test(endpoint[key]) ||
        /^0{64}$/u.test(endpoint[key])
      ) {
        fail(`${endpointId} ${key} is invalid`);
      }
    }
    if (
      plan.status === "candidate" &&
      (endpoint.candidateExecutableSha256 !== pinned.executableSha256 ||
        endpoint.candidateWrapperSha256 !== pinned.wrapperSha256)
    ) {
      fail(`${endpointId} candidate digest differs`);
    }
  });
  if (
    report.endpoints[0].candidateWrapperSha256 !==
    report.endpoints[1].candidateWrapperSha256
  ) {
    fail("the shared signed wrapper differs between endpoints");
  }
  if (completed) {
    if (
      typeof report.observedAt !== "string" ||
      !/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(
        report.observedAt,
      ) ||
      report.planSha256 !== planDigest(plan) ||
      report.teardown !== "passed"
    ) {
      fail("completed report binding differs");
    }
  }
  return report;
}

function bootstrapPlan(plan) {
  const bootstrap = clone(plan);
  bootstrap.status = "bootstrap";
  for (const endpoint of bootstrap.candidate.endpoints) {
    endpoint.executableSha256 = null;
    endpoint.wrapperSha256 = null;
  }
  return validateRsyncSourcePlan(bootstrap);
}

function validateCanaryEvidence(
  canary,
  canaryPlan,
  evidenceObservedAt,
  expectedHeadCommit = null,
) {
  exactKeys(canary, ["report", "github"], "evidence canary");
  exactKeys(canary.report, ["path", "sha256"], "evidence canary report");
  const reportPath = canary.report.path;
  if (
    typeof reportPath !== "string" ||
    !/^docs\/plan\/evidence\/M16\/runs\/rsync-source-security-[0-9a-f]{7}-20\d{2}-\d{2}-\d{2}T\d{6}Z\.json$/u.test(
      reportPath,
    ) ||
    !digestPattern.test(canary.report.sha256)
  ) {
    fail("evidence canary report binding differs");
  }
  const report = readBoundJsonArtifact(
    reportPath,
    canary.report.sha256,
    "rsync source security canary",
    {
      fail,
      resolvePath: (relativePath) => join(root, relativePath),
      maximumBytes: 16 * 1024,
    },
  );
  validateCanaryReport(report, canaryPlan, { completed: true });
  exactKeys(
    canary.github,
    [
      "workflowRunId",
      "jobId",
      "artifactId",
      "artifactName",
      "artifactArchiveSha256",
      "artifactCreatedAt",
      "headCommit",
      "mergeCommit",
    ],
    "evidence GitHub binding",
  );
  const github = canary.github;
  if (
    !Number.isSafeInteger(github.workflowRunId) ||
    github.workflowRunId < 1 ||
    !Number.isSafeInteger(github.jobId) ||
    github.jobId < 1 ||
    !Number.isSafeInteger(github.artifactId) ||
    github.artifactId < 1 ||
    !commitPattern.test(github.headCommit) ||
    (expectedHeadCommit !== null && github.headCommit !== expectedHeadCommit) ||
    !reportPath.startsWith(
      `docs/plan/evidence/M16/runs/rsync-source-security-${github.headCommit.slice(0, 7)}-`,
    ) ||
    !commitPattern.test(github.mergeCommit) ||
    github.artifactName !== `security-rsync-source-${github.mergeCommit}` ||
    !digestPattern.test(github.artifactArchiveSha256) ||
    Number.isNaN(Date.parse(github.artifactCreatedAt)) ||
    Date.parse(report.observedAt) > Date.parse(github.artifactCreatedAt) ||
    Date.parse(github.artifactCreatedAt) > Date.parse(evidenceObservedAt)
  ) {
    fail("evidence GitHub identity or chronology differs");
  }
  return report;
}

function validateEvidence(evidence, plan) {
  exactKeys(
    evidence,
    [
      "schema",
      "status",
      "observedAt",
      "candidate",
      "plan",
      "bootstrapCanary",
      "digestLockCanary",
      "checks",
      "productionAccess",
      "productionMutation",
      "productionAuthority",
      "automaticFails",
    ],
    "evidence",
  );
  if (
    evidence.schema !== "starfiniti.rsync-source-security-evidence.v2" ||
    evidence.status !== "in_progress" ||
    Number.isNaN(Date.parse(evidence.observedAt)) ||
    evidence.productionAccess !== false ||
    evidence.productionMutation !== false ||
    evidence.productionAuthority !== false
  ) {
    fail("evidence identity or production boundary differs");
  }
  exactKeys(evidence.candidate, ["branch", "commit"], "evidence candidate");
  if (
    evidence.candidate.branch !== "codex/enterprise-roadmap-integration" ||
    (["bootstrap", "locked"].includes(plan.status) &&
      evidence.candidate.commit !== null) ||
    (plan.status === "candidate" &&
      (!commitPattern.test(evidence.candidate.commit) ||
        /^0{40}$/u.test(evidence.candidate.commit)))
  ) {
    fail("evidence candidate binding differs");
  }
  exactKeys(evidence.plan, ["path", "sha256"], "evidence plan");
  if (
    evidence.plan.path !==
      "infrastructure/testing/rsync-source-security/plan.yaml" ||
    evidence.plan.sha256 !== planDigest(plan)
  ) {
    fail("evidence plan binding differs");
  }
  let bootstrapReport = null;
  if (evidence.bootstrapCanary !== null) {
    bootstrapReport = validateCanaryEvidence(
      evidence.bootstrapCanary,
      bootstrapPlan(plan),
      evidence.observedAt,
    );
  } else if (plan.status !== "bootstrap") {
    fail("a locked or candidate plan requires its bootstrap canary");
  }
  if (bootstrapReport && plan.status !== "bootstrap") {
    bootstrapReport.endpoints.forEach((endpoint, index) => {
      const pinned = plan.candidate.endpoints[index];
      if (
        endpoint.candidateExecutableSha256 !== pinned.executableSha256 ||
        endpoint.candidateWrapperSha256 !== pinned.wrapperSha256
      ) {
        fail(`${endpoint.id} digest lock differs from bootstrap evidence`);
      }
    });
  }
  if (plan.status === "candidate") {
    if (evidence.digestLockCanary === null) {
      fail("candidate evidence requires its digest-lock canary");
    }
    validateCanaryEvidence(
      evidence.digestLockCanary,
      plan,
      evidence.observedAt,
      evidence.candidate.commit,
    );
  } else if (evidence.digestLockCanary !== null) {
    fail("only candidate evidence may bind a digest-lock canary");
  }
  const bootstrapPassed = evidence.bootstrapCanary !== null;
  const expectedChecks = new Map([
    ["architecture_decision", "passed"],
    ["upstream_source", "passed"],
    ["safe_source_tree", "passed"],
    ["endpoint_native_builds", "passed"],
    ["distribution_rollback", "passed"],
    ["validator_self_test", "passed"],
    ["bootstrap_canary", bootstrapPassed ? "passed" : "pending"],
    [
      "candidate_digest_lock",
      ["locked", "candidate"].includes(plan.status) ? "passed" : "pending",
    ],
    ["digest_lock_canary", plan.status === "candidate" ? "passed" : "pending"],
    ["operations_escrow_v3", "pending"],
    ["real_forced_command", "pending"],
    ["manual_timer_archives", "pending"],
    ["production_rollout", "pending"],
    ["isolated_restore", "pending"],
    ["independent_review", "pending"],
  ]);
  if (!Array.isArray(evidence.checks) || evidence.checks.length !== 15) {
    fail("evidence must contain fifteen checks");
  }
  for (const check of evidence.checks) {
    exactKeys(check, ["id", "status", "evidence"], "evidence check");
    if (
      expectedChecks.get(check.id) !== check.status ||
      typeof check.evidence !== "string" ||
      check.evidence.length < 45 ||
      check.evidence.length > 700
    ) {
      fail(`evidence check ${check.id} differs`);
    }
    expectedChecks.delete(check.id);
  }
  if (expectedChecks.size > 0) fail("evidence check is missing or duplicated");
  if (
    !Array.isArray(evidence.automaticFails) ||
    evidence.automaticFails.length !== 6 ||
    new Set(evidence.automaticFails).size !== 6 ||
    evidence.automaticFails.some(
      (value) => typeof value !== "string" || value.length < 70,
    )
  ) {
    fail("evidence automatic failure set differs");
  }
}

function validateWiring(candidateContent) {
  const content =
    candidateContent ??
    Object.fromEntries(
      Object.entries(paths).map(([key, path]) => [
        key,
        readFileSync(path, "utf8"),
      ]),
    );
  const requirements = [
    ["adr", "global cross-suite ACL library"],
    ["adr", "three fail-closed phases"],
    ["dockerfile", "GNUPGHOME=/tmp/starfiniti-rsync-gnupg"],
    ["dockerfile", "gpg --batch --status-fd=1 --verify"],
    ["dockerfile", '$2 == "VALIDSIG" && $3 == fingerprint'],
    ["dockerfile", "starfiniti-verify-rsync-source"],
    ["dockerfile", "--archive source.tar.gz"],
    ["dockerfile", '--tree "/tmp/starfiniti-rsync-build/$SOURCE_TREE_ROOT"'],
    ["dockerfile", "--with-rrsync"],
    ["dockerfile", "DEB_BUILD_MAINT_OPTIONS=hardening=+all"],
    ["dockerfile", "dpkg-buildflags --get CFLAGS"],
    ["dockerfile", "GNU_RELRO"],
    ["dockerfile", "BIND_NOW"],
    ["dockerfile", "RPATH|RUNPATH"],
    ["dockerfile", "EXPECTED_NATIVE_ACL_VERSION"],
    ["dockerfile", "HEALTHCHECK --interval=30s --timeout=5s"],
    ["sourceVerifier", "source symlink escapes the expected root"],
    ["sourceVerifier", "archive contains a hard link or special member"],
    ["sourceVerifier", "archive member traverses a symbolic-link parent"],
    ["guestEntrypoint", "--daemon --no-detach"],
    ["guestEntrypoint", "[facts]"],
    ["hostCanary", "forced-command-negative"],
    ["hostCanary", "facts/.starfiniti-facts"],
    ["runner", "starfiniti-rsync-source"],
    ["runner", "constants.O_EXCL"],
    ["runner", "constants.O_NOFOLLOW"],
    ["runner", "output bytes or identity changed after publication"],
    ["runner", '"candidate-healthcheck"'],
    ["readme", "Bootstrap discovers endpoint hashes"],
    [
      "runner",
      "passing evidence requires exact container network and image teardown",
    ],
    ["package", "rsync-source-security:validate"],
    ["package", "rsync-source-security:run"],
    ["workflow", "Run side-by-side rsync source compatibility canary"],
    ["workflow", "timeout-minutes: 60"],
    ["workflow", "security-rsync-source-${{ github.sha }}"],
    ["readme", "does not authorize production"],
    ["evidence", "productionAuthority: false"],
  ];
  for (const [file, needle] of requirements) {
    if (!content[file].includes(needle)) fail(`${file} wiring differs`);
  }
  for (const forbidden of [
    '"--network", "host"',
    '"--privileged"',
    '"--publish"',
    "child_process.exec(",
    "shell: true",
    "unlinkSync",
    "existsSync(outputPath)",
  ]) {
    if (content.runner.includes(forbidden)) {
      fail(`runner contains forbidden control ${forbidden}`);
    }
  }
  if ((content.runner.match(/openSync\(\s*outputPath/gu) ?? []).length !== 1) {
    fail("runner must open the immutable report path exactly once");
  }
}

function clone(value) {
  return structuredClone(value);
}

function selfTest() {
  const plan = validateRsyncSourcePlan(
    YAML.parse(readFileSync(planPath, "utf8")),
  );
  const evidence = YAML.parse(readFileSync(evidencePath, "utf8"));
  assert.match(planDigest(plan), digestPattern);
  validateEvidence(evidence, plan);
  const bootstrapReport = JSON.parse(
    readFileSync(join(root, evidence.bootstrapCanary.report.path), "utf8"),
  );
  const lockedPlan = clone(plan);
  lockedPlan.status = "locked";
  lockedPlan.candidate.endpoints.forEach((endpoint, index) => {
    endpoint.executableSha256 =
      bootstrapReport.endpoints[index].candidateExecutableSha256;
    endpoint.wrapperSha256 =
      bootstrapReport.endpoints[index].candidateWrapperSha256;
  });
  validateRsyncSourcePlan(lockedPlan);
  const lockedEvidence = clone(evidence);
  lockedEvidence.plan.sha256 = planDigest(lockedPlan);
  lockedEvidence.checks.find(
    (check) => check.id === "candidate_digest_lock",
  ).status = "passed";
  validateEvidence(lockedEvidence, lockedPlan);
  const mismatchedLock = clone(lockedPlan);
  mismatchedLock.candidate.endpoints[0].executableSha256 = "7".repeat(64);
  const mismatchedEvidence = clone(lockedEvidence);
  mismatchedEvidence.plan.sha256 = planDigest(mismatchedLock);
  assert.throws(() => validateEvidence(mismatchedEvidence, mismatchedLock));
  const candidatePlan = clone(lockedPlan);
  candidatePlan.status = "candidate";
  assert.throws(() => validateEvidence(lockedEvidence, candidatePlan));
  const mutations = [
    (item) => {
      item.candidate.source.sha256 = "0".repeat(64);
    },
    (item) => {
      item.candidate.source.signingFingerprint = "1".repeat(40);
    },
    (item) => {
      item.candidate.sourceTree.links = 0;
    },
    (item) => {
      item.installed["proxmox-host"].nativeAclVersion = "2.4.0-1";
    },
    (item) => {
      item.rollback.globalLibraryUpgradeRequired = true;
    },
    (item) => {
      item.rollback.productionMutation = true;
    },
  ];
  for (const mutate of mutations) {
    const changed = clone(plan);
    mutate(changed);
    assert.throws(() => validateRsyncSourcePlan(changed));
  }
  for (const mutate of [
    (item) => {
      item.candidate.commit = "1".repeat(40);
    },
    (item) => {
      item.plan.sha256 = "0".repeat(64);
    },
    (item) => {
      item.checks.pop();
    },
    (item) => {
      item.productionMutation = true;
    },
  ]) {
    const changed = clone(evidence);
    mutate(changed);
    assert.throws(() => validateEvidence(changed, plan));
  }
  const endpointDigests = ["1".repeat(64), "2".repeat(64)];
  const wrapperDigest = "3".repeat(64);
  const report = {
    schema: "starfiniti.rsync-source-security-canary.v1",
    status: "passed",
    candidateVersion: "3.5.0",
    protocol: 32,
    pairs: 2,
    files: 2,
    bytes: 21,
    internalNetwork: true,
    publishedPorts: 0,
    sourceSignatureVerified: true,
    safeSourceTreeVerified: true,
    confinementVerified: true,
    forcedCommandNegative: true,
    distributionPathsPreserved: true,
    globalLibraryUpgradeRequired: false,
    endpoints: endpointIds.map((id, index) => ({
      id,
      currentVersion: expected[id].currentVersion,
      currentExecutableSha256: "4".repeat(64),
      currentWrapperSha256: "5".repeat(64),
      candidateExecutableSha256: endpointDigests[index],
      candidateWrapperSha256: wrapperDigest,
      nativeAclVersion: expected[id].nativeAclVersion,
    })),
    productionMutation: false,
  };
  validateCanaryReport(report, plan);
  for (const mutate of [
    (item) => item.endpoints.pop(),
    (item) => {
      item.endpoints[0].nativeAclVersion = "2.4.0-1";
    },
    (item) => {
      item.endpoints[1].candidateWrapperSha256 = "6".repeat(64);
    },
    (item) => {
      item.productionMutation = true;
    },
  ]) {
    const changed = clone(report);
    mutate(changed);
    assert.throws(() => validateCanaryReport(changed, plan));
  }
  const wiring = Object.fromEntries(
    Object.entries(paths).map(([key, path]) => [
      key,
      readFileSync(path, "utf8"),
    ]),
  );
  validateWiring(wiring);
  for (const [file, needle] of [
    ["dockerfile", "gpg --batch --status-fd=1 --verify"],
    ["dockerfile", '$2 == "VALIDSIG" && $3 == fingerprint'],
    ["dockerfile", "--archive source.tar.gz"],
    ["sourceVerifier", "archive member traverses a symbolic-link parent"],
    ["guestEntrypoint", "[facts]"],
    ["hostCanary", "facts/.starfiniti-facts"],
    ["runner", "constants.O_EXCL"],
    ["runner", "output bytes or identity changed after publication"],
    ["workflow", "Run side-by-side rsync source compatibility canary"],
  ]) {
    const changed = wiring[file].replace(needle, "removed-control");
    assert.notEqual(changed, wiring[file]);
    assert.throws(() => validateWiring({ ...wiring, [file]: changed }));
  }
  assert.throws(() =>
    validateWiring({
      ...wiring,
      runner: `${wiring.runner}\nconst forbidden = ["--privileged"];`,
    }),
  );
  console.log("rsync source security plan self-test passed.");
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  if (process.argv.slice(2).join(" ") !== "--self-test") {
    fail("only --self-test is supported");
  }
  selfTest();
}
