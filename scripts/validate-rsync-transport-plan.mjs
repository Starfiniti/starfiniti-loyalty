import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const planPath = join(
  root,
  "infrastructure/testing/recovery-transport/plan.yaml",
);
const dockerfilePath = join(
  root,
  "infrastructure/testing/recovery-transport/Dockerfile",
);
const evidencePath = join(
  root,
  "docs/plan/evidence/M15/recovery-transport.yaml",
);
const runnerPath = join(root, "scripts/run-rsync-transport-canary.mjs");
const sha256Pattern = /^[0-9a-f]{64}$/u;
const imagePattern = /^(?:debian:13-slim|ubuntu:24\.04)@sha256:[0-9a-f]{64}$/u;
const versionPattern = /^[0-9][0-9A-Za-z.+:~-]{2,79}$/u;
const endpointIds = ["database-guest", "proxmox-host"];
const testedCandidateCommit = null;
const testedWorkflowRunId = null;
const testedWorkflowJobId = null;
const testedArtifactId = null;
const testedArtifactName = null;
const testedArtifactSha256 = null;
const testedReportSha256 = null;
const testedReportObservedAt = null;
const rollbackPackageExpectations = {
  "proxmox-host": [
    {
      authority: "debian-security",
      name: "rsync",
      version: "3.4.1+ds1-5+deb13u3",
      repositoryUrl: "https://security.debian.org/debian-security",
      suite: "trixie-security",
      url: "https://security.debian.org/debian-security/pool/updates/main/r/rsync/rsync_3.4.1+ds1-5+deb13u3_amd64.deb",
      sha256:
        "fee3fa3b5924cc7e0964603945e0edfd63b7f29fc3cd4cf7613ad970e05a55be",
      signingFingerprint: "debian-archive-keyring",
    },
    {
      authority: "debian-archive",
      name: "libacl1",
      version: "2.3.2-2+b1",
      repositoryUrl: "https://deb.debian.org/debian",
      suite: "trixie",
      url: "https://deb.debian.org/debian/pool/main/a/acl/libacl1_2.3.2-2+b1_amd64.deb",
      sha256:
        "08074f01e384bc07c0c2d79a58cf4a6523f71cf75d1808101c79617656c9a39d",
      signingFingerprint: "debian-archive-keyring",
    },
  ],
  "database-guest": [
    {
      authority: "ubuntu-security",
      name: "rsync",
      version: "3.2.7-1ubuntu1.5",
      repositoryUrl: "https://security.ubuntu.com/ubuntu",
      suite: "noble-security",
      url: "https://security.ubuntu.com/ubuntu/pool/main/r/rsync/rsync_3.2.7-1ubuntu1.5_amd64.deb",
      sha256:
        "8f952895697d19a6f1caa71f17c7d4e8c1f1fb485eb824ffe3e4c77dd587b338",
      signingFingerprint: "ubuntu-archive-keyring",
    },
  ],
};

function fail(message) {
  throw new Error(`Recovery transport plan invalid: ${message}`);
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

function exactHttps(value, label, allowedHosts) {
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
    !allowedHosts.has(parsed.hostname)
  ) {
    fail(`${label} is outside the approved HTTPS authority`);
  }
  return parsed;
}

function parseVersion(value, label) {
  if (typeof value !== "string" || !/^\d+\.\d+\.\d+$/u.test(value)) {
    fail(`${label} must be semantic x.y.z`);
  }
  return value.split(".").map(Number);
}

function atLeastVersion(value, minimum) {
  const candidate = parseVersion(value, "candidate version");
  const baseline = parseVersion(minimum, "minimum version");
  return (
    candidate.some(
      (part, index) =>
        part > baseline[index] &&
        candidate
          .slice(0, index)
          .every((prior, priorIndex) => prior === baseline[priorIndex]),
    ) || candidate.every((part, index) => part === baseline[index])
  );
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

export function planDigest(plan) {
  return createHash("sha256")
    .update(JSON.stringify(canonical(plan)))
    .digest("hex");
}

export function validateTransportPlan(plan) {
  exactKeys(
    plan,
    [
      "schema",
      "status",
      "profile",
      "minimumVersion",
      "architecture",
      "network",
      "sources",
      "endpoints",
      "rollback",
    ],
    "plan",
  );
  if (
    plan.schema !== "starfiniti.rsync-transport-plan.v1" ||
    plan.status !== "candidate" ||
    plan.profile !== "production-recovery-transport" ||
    plan.architecture !== "amd64" ||
    !atLeastVersion(plan.minimumVersion, "3.5.0")
  ) {
    fail("plan identity or baseline is invalid");
  }
  exactKeys(
    plan.network,
    ["internalOnly", "module", "maximumFiles", "maximumBytes"],
    "network",
  );
  if (
    plan.network.internalOnly !== true ||
    plan.network.module !== "recovery" ||
    !Number.isInteger(plan.network.maximumFiles) ||
    plan.network.maximumFiles < 2 ||
    plan.network.maximumFiles > 16 ||
    !Number.isInteger(plan.network.maximumBytes) ||
    plan.network.maximumBytes < 1024 ||
    plan.network.maximumBytes > 16 * 1024 * 1024
  ) {
    fail("network boundary is invalid");
  }
  exactKeys(
    plan.sources,
    [
      "upstreamRelease",
      "upstreamSecurity",
      "upstreamInstall",
      "debianPackage",
      "ubuntuPpa",
    ],
    "sources",
  );
  const sourceHosts = new Set([
    "download.samba.org",
    "packages.debian.org",
    "launchpad.net",
  ]);
  for (const [key, value] of Object.entries(plan.sources)) {
    exactHttps(value, `source ${key}`, sourceHosts);
  }
  if (!Array.isArray(plan.endpoints) || plan.endpoints.length !== 2) {
    fail("exactly two endpoints are required");
  }
  const seen = new Set();
  for (const endpoint of plan.endpoints) {
    exactKeys(
      endpoint,
      ["id", "role", "os", "baseImage", "rollbackPackages", "package"],
      "endpoint",
    );
    if (seen.has(endpoint.id) || !endpointIds.includes(endpoint.id)) {
      fail("endpoint identity is invalid or duplicated");
    }
    seen.add(endpoint.id);
    const expected =
      endpoint.id === "proxmox-host"
        ? {
            role: "receiver",
            osId: "debian",
            osVersion: "13",
            authority: "debian-archive",
            host: "deb.debian.org",
            fingerprint: "debian-archive-keyring",
          }
        : {
            role: "sender",
            osId: "ubuntu",
            osVersion: "24.04",
            authority: "rsync-project-launchpad-ppa",
            host: "launchpad.net",
            fingerprint: "72BBF83452B11E5B5A8F99123CC6C2BBC7F3DB85",
          };
    exactKeys(endpoint.os, ["id", "versionId"], `${endpoint.id} OS`);
    exactKeys(
      endpoint.package,
      [
        "authority",
        "name",
        "version",
        "repositoryUrl",
        "suite",
        "url",
        "sha256",
        "signingFingerprint",
        "dependencies",
      ],
      `${endpoint.id} package`,
    );
    if (
      endpoint.role !== expected.role ||
      endpoint.os.id !== expected.osId ||
      endpoint.os.versionId !== expected.osVersion ||
      !imagePattern.test(endpoint.baseImage) ||
      endpoint.package.authority !== expected.authority ||
      endpoint.package.name !== "rsync" ||
      endpoint.package.suite !==
        (endpoint.id === "proxmox-host" ? "sid" : "noble") ||
      !versionPattern.test(endpoint.package.version) ||
      endpoint.package.signingFingerprint !== expected.fingerprint ||
      !sha256Pattern.test(endpoint.package.sha256) ||
      /^0{64}$/u.test(endpoint.package.sha256)
    ) {
      fail(`${endpoint.id} package boundary is invalid`);
    }
    if (!Array.isArray(endpoint.package.dependencies)) {
      fail(`${endpoint.id} dependencies must be an array`);
    }
    const expectedRollbackPackages = rollbackPackageExpectations[endpoint.id];
    if (
      !Array.isArray(endpoint.rollbackPackages) ||
      endpoint.rollbackPackages.length !== expectedRollbackPackages.length
    ) {
      fail(`${endpoint.id} rollback package set is invalid`);
    }
    for (const [
      index,
      rollbackPackage,
    ] of endpoint.rollbackPackages.entries()) {
      exactKeys(
        rollbackPackage,
        [
          "authority",
          "name",
          "version",
          "repositoryUrl",
          "suite",
          "url",
          "sha256",
          "signingFingerprint",
        ],
        `${endpoint.id} rollback package`,
      );
      const expectedRollbackPackage = expectedRollbackPackages[index];
      const rollbackUrl = exactHttps(
        rollbackPackage.url,
        `${endpoint.id} rollback package URL`,
        new Set([new URL(expectedRollbackPackage.url).hostname]),
      );
      const rollbackRepositoryUrl = exactHttps(
        rollbackPackage.repositoryUrl,
        `${endpoint.id} rollback repository URL`,
        new Set([new URL(expectedRollbackPackage.repositoryUrl).hostname]),
      );
      if (
        Object.entries(expectedRollbackPackage).some(
          ([key, value]) => rollbackPackage[key] !== value,
        ) ||
        rollbackUrl.pathname !==
          new URL(expectedRollbackPackage.url).pathname ||
        rollbackRepositoryUrl.pathname !==
          new URL(expectedRollbackPackage.repositoryUrl).pathname ||
        !versionPattern.test(rollbackPackage.version) ||
        !sha256Pattern.test(rollbackPackage.sha256) ||
        /^0{64}$/u.test(rollbackPackage.sha256)
      ) {
        fail(`${endpoint.id} rollback package ${index + 1} is invalid`);
      }
    }
    if (endpoint.id === "proxmox-host") {
      if (endpoint.package.dependencies.length !== 1) {
        fail("proxmox-host requires the exact libacl1 dependency");
      }
      const [dependency] = endpoint.package.dependencies;
      exactKeys(
        dependency,
        ["name", "version", "url", "sha256"],
        "proxmox-host dependency",
      );
      const dependencyUrl = exactHttps(
        dependency.url,
        "proxmox-host dependency URL",
        new Set(["deb.debian.org"]),
      );
      if (
        dependency.name !== "libacl1" ||
        dependency.version !== "2.4.0-1" ||
        dependencyUrl.pathname !==
          "/debian/pool/main/a/acl/libacl1_2.4.0-1_amd64.deb" ||
        dependency.sha256 !==
          "e9da0e00387e31c1709b70497f1eda91389c962c3940e6d233d4c57f5ea6f635"
      ) {
        fail("proxmox-host dependency boundary is invalid");
      }
    } else if (endpoint.package.dependencies.length !== 0) {
      fail("database-guest must not acquire an extra package dependency");
    }
    const packageUrl = exactHttps(
      endpoint.package.url,
      `${endpoint.id} package URL`,
      new Set([expected.host]),
    );
    const repositoryUrl = exactHttps(
      endpoint.package.repositoryUrl,
      `${endpoint.id} repository URL`,
      new Set([
        endpoint.id === "proxmox-host"
          ? "deb.debian.org"
          : "ppa.launchpadcontent.net",
      ]),
    );
    const expectedRepositoryPath =
      endpoint.id === "proxmox-host" ? "/debian" : "/rsyncproject/rsync/ubuntu";
    const expectedFilename = `rsync_${endpoint.package.version}_amd64.deb`;
    if (
      !decodeURIComponent(packageUrl.pathname).endsWith(expectedFilename) ||
      repositoryUrl.pathname !== expectedRepositoryPath ||
      !endpoint.package.version.startsWith(plan.minimumVersion)
    ) {
      fail(`${endpoint.id} package filename or version is invalid`);
    }
  }
  if (seen.size !== endpointIds.length) fail("both endpoints are required");
  exactKeys(
    plan.rollback,
    [
      "hostCandidateVersion",
      "verifyArtifactsInCanary",
      "operationsEscrowRequiredBeforeProduction",
      "preserveLocalWalAndBases",
      "preserveStagesAndArchives",
    ],
    "rollback",
  );
  if (
    !versionPattern.test(plan.rollback.hostCandidateVersion) ||
    plan.rollback.verifyArtifactsInCanary !== true ||
    plan.rollback.operationsEscrowRequiredBeforeProduction !== true ||
    plan.rollback.preserveLocalWalAndBases !== true ||
    plan.rollback.preserveStagesAndArchives !== true
  ) {
    fail("rollback boundary is invalid");
  }
  return plan;
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
      "endpoints",
      "canary",
      "checks",
      "productionMutation",
      "automaticFails",
    ],
    "evidence",
  );
  if (
    evidence.schema !== "starfiniti.rsync-transport-evidence.v1" ||
    evidence.status !== "in_progress" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(evidence.observedAt) ||
    Number.isNaN(Date.parse(evidence.observedAt)) ||
    Date.parse(evidence.observedAt) > Date.now() + 5 * 60 * 1000 ||
    evidence.productionMutation !== false
  ) {
    fail("evidence identity or production boundary is invalid");
  }
  exactKeys(evidence.candidate, ["branch", "commit"], "evidence candidate");
  if (
    evidence.candidate.branch !== "codex/enterprise-roadmap-integration" ||
    evidence.candidate.commit !== testedCandidateCommit
  ) {
    fail("evidence must bind the exact tested candidate commit");
  }
  exactKeys(evidence.plan, ["path", "sha256"], "evidence plan");
  if (
    evidence.plan.path !==
      "infrastructure/testing/recovery-transport/plan.yaml" ||
    evidence.plan.sha256 !== planDigest(plan)
  ) {
    fail("evidence plan binding is invalid");
  }
  if (!Array.isArray(evidence.endpoints) || evidence.endpoints.length !== 2) {
    fail("evidence must bind both endpoints");
  }
  for (const endpointEvidence of evidence.endpoints) {
    exactKeys(
      endpointEvidence,
      [
        "id",
        "authority",
        "packageVersion",
        "packageSha256",
        "signingFingerprint",
        "dependencies",
        "rollbackPackages",
      ],
      "evidence endpoint",
    );
    const endpoint = plan.endpoints.find(
      (candidate) => candidate.id === endpointEvidence.id,
    );
    if (
      !endpoint ||
      endpointEvidence.authority !== endpoint.package.authority ||
      endpointEvidence.packageVersion !== endpoint.package.version ||
      endpointEvidence.packageSha256 !== endpoint.package.sha256 ||
      endpointEvidence.signingFingerprint !==
        endpoint.package.signingFingerprint ||
      JSON.stringify(endpointEvidence.dependencies) !==
        JSON.stringify(endpoint.package.dependencies) ||
      JSON.stringify(endpointEvidence.rollbackPackages) !==
        JSON.stringify(endpoint.rollbackPackages)
    ) {
      fail("evidence endpoint differs from the approved plan");
    }
  }
  if (testedCandidateCommit === null) {
    if (evidence.canary !== null) {
      fail("unproved exact-head canary must not bind an artifact");
    }
  } else {
    exactKeys(
      evidence.canary,
      [
        "workflowRunId",
        "workflowJobId",
        "artifactId",
        "artifactName",
        "artifactSha256",
        "reportPath",
        "reportSha256",
        "report",
      ],
      "evidence canary",
    );
    exactKeys(
      evidence.canary.report,
      [
        "observedAt",
        "status",
        "planSha256",
        "protocol",
        "files",
        "bytes",
        "maximumFiles",
        "maximumBytes",
        "rollbackPackages",
        "productionMutation",
        "teardown",
      ],
      "evidence canary report",
    );
    if (
      evidence.canary.workflowRunId !== testedWorkflowRunId ||
      evidence.canary.workflowJobId !== testedWorkflowJobId ||
      evidence.canary.artifactId !== testedArtifactId ||
      evidence.canary.artifactName !== testedArtifactName ||
      evidence.canary.artifactSha256 !== testedArtifactSha256 ||
      evidence.canary.reportPath !== "ci.json" ||
      evidence.canary.reportSha256 !== testedReportSha256 ||
      evidence.canary.report.observedAt !== testedReportObservedAt ||
      evidence.canary.report.status !== "passed" ||
      evidence.canary.report.planSha256 !== planDigest(plan) ||
      evidence.canary.report.protocol !== 32 ||
      evidence.canary.report.files !== 2 ||
      evidence.canary.report.bytes !== 21 ||
      evidence.canary.report.maximumFiles !== plan.network.maximumFiles ||
      evidence.canary.report.maximumBytes !== plan.network.maximumBytes ||
      evidence.canary.report.rollbackPackages !== 3 ||
      evidence.canary.report.productionMutation !== false ||
      evidence.canary.report.teardown !== "passed"
    ) {
      fail("exact-head canary binding or minimized result is invalid");
    }
  }
  const expectedChecks = new Map([
    ["plan_contract", "passed"],
    ["source_authority_contract", "passed"],
    ["build_verification_contract", "passed"],
    ["rollback_artifact_contract", "passed"],
    ["workflow_contract", "passed"],
    [
      "exact_head_canary",
      testedCandidateCommit === null ? "pending" : "passed",
    ],
    ["rollback_escrow", "pending"],
    ["production_rollout", "pending"],
    ["isolated_restore", "pending"],
  ]);
  if (!Array.isArray(evidence.checks) || evidence.checks.length !== 9) {
    fail("evidence must contain the exact nine checks");
  }
  for (const check of evidence.checks) {
    exactKeys(check, ["id", "status", "evidence"], "evidence check");
    if (
      expectedChecks.get(check.id) !== check.status ||
      typeof check.evidence !== "string" ||
      check.evidence.length < 20 ||
      check.evidence.length > 600
    ) {
      fail(`evidence check ${check.id} is invalid`);
    }
    expectedChecks.delete(check.id);
  }
  if (expectedChecks.size !== 0)
    fail("an evidence check is missing or duplicated");
  if (
    !Array.isArray(evidence.automaticFails) ||
    evidence.automaticFails.length !== 4 ||
    evidence.automaticFails.some(
      (failure) => typeof failure !== "string" || failure.length < 20,
    )
  ) {
    fail("evidence automatic failures are invalid");
  }
}

function validateDockerfile(text) {
  const requirements = [
    "ARG BASE_IMAGE=debian:13-slim@sha256:d7e12182ce18b85b93007c1dedf31f2d29e01ccf3182cc4017c709b6259bc132\nFROM ${BASE_IMAGE}",
    "curl --fail --location --proto '=https' --tlsv1.2",
    "signed-by=/usr/share/keyrings/debian-archive-keyring.gpg",
    "https://keyserver.ubuntu.com/pks/lookup?op=get&search=0x${SIGNING_FINGERPRINT}",
    "gpg --batch --with-colons --fingerprint",
    "awk -F: '$1 == \"pub\" { count += 1 } END { print count + 0 }'",
    'gpg --batch --export "$SIGNING_FINGERPRINT"',
    "signed-by=/usr/share/keyrings/starfiniti-rsync-ppa.gpg",
    "Pin: release a=unstable",
    "Pin: release o=LP-PPA-rsyncproject-rsync",
    "Pin-Priority: 1",
    "Pin-Priority: 1001",
    'apt-get download "$PACKAGE_NAME=$PACKAGE_VERSION"',
    "ARG ROLLBACK_ONE_NAME",
    "ARG ROLLBACK_ONE_VERSION",
    "ARG ROLLBACK_ONE_URL",
    "ARG ROLLBACK_ONE_SHA256",
    "ARG ROLLBACK_TWO_NAME",
    "ARG ROLLBACK_TWO_VERSION",
    "ARG ROLLBACK_TWO_URL",
    "ARG ROLLBACK_TWO_SHA256",
    'apt-get download "$name=$version"',
    "curl --fail --proto '=https' --tlsv1.2 --output exact-url.deb \"$url\"",
    'printf \'%s  %s\\n\' "$expected_sha256" signed-metadata.deb "$expected_sha256" exact-url.deb | sha256sum --check --strict',
    "cmp signed-metadata.deb exact-url.deb",
    'dpkg-deb --field signed-metadata.deb Package)" = "$name"',
    'dpkg-deb --field signed-metadata.deb Version)" = "$version"',
    'dpkg-deb --field signed-metadata.deb Architecture)" = "$EXPECTED_ARCHITECTURE"',
    "/usr/local/share/starfiniti/rollback-package-facts",
    "chmod 0444 /usr/local/share/starfiniti/rollback-package-facts",
    "/tmp/rollback-one /tmp/rollback-two",
    "/var/cache/apt/archives/*.deb",
    `test -z "$(find /tmp /var/cache/apt/archives -type f -name '*.deb' -print -quit)"`,
    "sha256sum --check --strict",
    "dpkg-deb --field /tmp/rsync-candidate.deb Package",
    "dpkg-deb --field /tmp/rsync-candidate.deb Version",
    "dpkg-deb --field /tmp/rsync-candidate.deb Architecture",
    'apt-get download "$DEPENDENCY_NAME=$DEPENDENCY_VERSION"',
    "sha256sum --check --strict",
    "dpkg-deb --field /tmp/rsync-dependency.deb Package",
    "dpkg-deb --field /tmp/rsync-dependency.deb Version",
    "dpkg-deb --field /tmp/rsync-dependency.deb Architecture",
    "apt-get install --yes --no-install-recommends /tmp/rsync-dependency.deb",
    '"$DEPENDENCY_SHA256" /tmp/rsync-dependency.deb | sha256sum --check --strict',
    '"$PACKAGE_SHA256" /tmp/rsync-candidate.deb | sha256sum --check --strict',
    "apt-get install --yes --no-install-recommends /tmp/rsync-candidate.deb",
    "readlink -f /usr/bin/rsync",
    "readlink -f /usr/bin/rrsync",
    "rsync_opts.append('--confine-root=' + os.getcwd())",
    "subprocess.run(cmd, pass_fds=tuple(pinned_fds))",
    "env -i PATH=/usr/bin:/bin LC_ALL=C SSH_ORIGINAL_COMMAND=id",
    'com.starfiniti.disposable="true"',
    "USER 65532:65532",
    'HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=2 CMD ["rsync", "--version"]',
  ];
  for (const requirement of requirements) {
    if (!text.includes(requirement))
      fail(`Dockerfile is missing ${requirement}`);
  }
  const dependencyRepositoryIndex = text.indexOf(
    'apt-get download "$DEPENDENCY_NAME=$DEPENDENCY_VERSION"',
  );
  const dependencyChecksumIndex = text.indexOf(
    '"$DEPENDENCY_SHA256" /tmp/rsync-dependency.deb',
  );
  const dependencyMetadataIndex = text.indexOf(
    "dpkg-deb --field /tmp/rsync-dependency.deb Package",
  );
  const dependencyInstallIndex = text.indexOf(
    "apt-get install --yes --no-install-recommends /tmp/rsync-dependency.deb",
  );
  const packageRepositoryIndex = text.indexOf(
    'apt-get download "$PACKAGE_NAME=$PACKAGE_VERSION"',
  );
  const packageChecksumIndex = text.indexOf(
    '"$PACKAGE_SHA256" /tmp/rsync-candidate.deb',
  );
  const packageMetadataIndex = text.indexOf(
    "dpkg-deb --field /tmp/rsync-candidate.deb Package",
  );
  const packageInstallIndex = text.indexOf(
    "apt-get install --yes --no-install-recommends /tmp/rsync-candidate.deb",
  );
  const rollbackRepositoryIndex = text.indexOf(
    'apt-get download "$name=$version"',
  );
  const rollbackChecksumIndex = text.indexOf(
    '"$expected_sha256" signed-metadata.deb "$expected_sha256" exact-url.deb',
  );
  const rollbackEqualityIndex = text.indexOf(
    "cmp signed-metadata.deb exact-url.deb",
  );
  const rollbackMetadataIndex = text.indexOf(
    "dpkg-deb --field signed-metadata.deb Package",
  );
  const rollbackMarkerIndex = text.indexOf(
    "chmod 0444 /usr/local/share/starfiniti/rollback-package-facts",
  );
  const candidateAuthorityIndex = text.indexOf('case "$PACKAGE_AUTHORITY" in');
  const cleanupIndex = text.indexOf("/tmp/rollback-one /tmp/rollback-two");
  const ordered = (indexes) =>
    indexes.every(
      (index, position) =>
        index >= 0 && (position === 0 || index > indexes[position - 1]),
    );
  if (
    !ordered([
      dependencyRepositoryIndex,
      dependencyChecksumIndex,
      dependencyMetadataIndex,
      dependencyInstallIndex,
    ]) ||
    !ordered([
      packageRepositoryIndex,
      packageChecksumIndex,
      packageMetadataIndex,
      packageInstallIndex,
    ]) ||
    !ordered([
      rollbackRepositoryIndex,
      rollbackChecksumIndex,
      rollbackEqualityIndex,
      rollbackMetadataIndex,
      rollbackMarkerIndex,
      cleanupIndex,
      candidateAuthorityIndex,
    ]) ||
    text
      .slice(rollbackRepositoryIndex, candidateAuthorityIndex)
      .includes("apt-get install")
  ) {
    fail(
      "rollback verification must precede candidate acquisition and package verification must precede installation",
    );
  }
}

function validateRunner(text) {
  for (const requirement of [
    "only the repository recovery transport plan may be executed",
    "[a-z0-9][a-z0-9._-]{1,79}\\.json",
    "output parent must not traverse a symbolic link",
    "rmSync(outputPath, { force: true })",
    "timeout: options.timeout ?? 120_000",
    "{ timeout: 600_000 }",
    '["network", "create", "--internal", network]',
    '"{{json .NetworkSettings.Ports}}"',
    '"{{json .NetworkSettings.Networks}}"',
    "escaped its internal no-port network boundary",
    "pid file = /tmp/rsyncd.pid",
    "lock file = /tmp/rsyncd.lock",
    "transferredFiles > plan.network.maximumFiles",
    "transferredBytes > plan.network.maximumBytes",
    "ROLLBACK_ONE_NAME: rollbackOne.name",
    'ROLLBACK_TWO_NAME: rollbackTwo?.name ?? ""',
    "/usr/local/share/starfiniti/rollback-package-facts",
    "rollbackFacts.length !== endpoint.rollbackPackages.length",
    "fact[1] !== rollbackPackage.version",
    "fact[2] !== rollbackPackage.sha256",
    "signedMetadataVerified: true",
    "exactUrlVerified: true",
    "packageBytesRetained: false",
    `test -z "$(find /tmp /var/cache/apt/archives -type f -name '*.deb' -print -quit)"`,
    "rollbackPackages: hostFacts.rollbackPackages",
    "rollbackPackages: guestFacts.rollbackPackages",
    "productionMutation: false",
    '["rm", "--force", hostName]',
    '["rm", "--force", guestName]',
    '["network", "rm", network]',
  ]) {
    if (!text.includes(requirement)) fail(`runner is missing ${requirement}`);
  }
  for (const forbidden of [
    '"--publish"',
    '"--network", "host"',
    "child_process.exec(",
    "shell: true",
  ]) {
    if (text.includes(forbidden))
      fail(`runner contains forbidden ${forbidden}`);
  }
}

function selfTest(plan, evidence, dockerfile, runner) {
  const valid = structuredClone(plan);
  assert.equal(validateTransportPlan(valid), valid);
  assert.match(planDigest(valid), sha256Pattern);
  const mutations = [
    (candidate) => (candidate.network.internalOnly = false),
    (candidate) => candidate.endpoints.pop(),
    (candidate) => (candidate.endpoints[0].id = candidate.endpoints[1].id),
    (candidate) => (candidate.endpoints[0].package.sha256 = "0".repeat(64)),
    (candidate) => candidate.endpoints[0].package.dependencies.pop(),
    (candidate) =>
      (candidate.endpoints[0].package.dependencies[0].sha256 = "0".repeat(64)),
    (candidate) =>
      candidate.endpoints[1].package.dependencies.push({
        name: "unexpected",
        version: "1.0.0",
        url: "https://launchpad.net/unexpected.deb",
        sha256: "1".repeat(64),
      }),
    (candidate) =>
      (candidate.endpoints[0].package.url = "http://example.test/rsync.deb"),
    (candidate) =>
      (candidate.endpoints[1].package.signingFingerprint =
        "debian-archive-keyring"),
    (candidate) =>
      (candidate.endpoints[0].package.repositoryUrl =
        "https://example.test/debian"),
    (candidate) => (candidate.endpoints[1].baseImage = "ubuntu:24.04"),
    (candidate) => (candidate.rollback.verifyArtifactsInCanary = false),
    (candidate) => candidate.endpoints[0].rollbackPackages.pop(),
    (candidate) =>
      (candidate.endpoints[0].rollbackPackages[0].sha256 = "0".repeat(64)),
    (candidate) =>
      (candidate.endpoints[1].rollbackPackages[0].url =
        "https://example.test/rsync.deb"),
  ];
  for (const mutate of mutations) {
    const candidate = structuredClone(plan);
    mutate(candidate);
    assert.throws(() => validateTransportPlan(candidate));
  }
  assert.doesNotThrow(() => validateEvidence(structuredClone(evidence), plan));
  for (const mutate of [
    (candidate) => (candidate.status = "complete"),
    (candidate) => (candidate.candidate.commit = "0".repeat(40)),
    (candidate) => (candidate.plan.sha256 = "0".repeat(64)),
    (candidate) => (candidate.endpoints[0].packageSha256 = "0".repeat(64)),
    (candidate) =>
      (candidate.endpoints[0].rollbackPackages[0].sha256 = "0".repeat(64)),
    (candidate) => (candidate.canary = {}),
    (candidate) =>
      (candidate.checks.find(
        (check) => check.id === "workflow_contract",
      ).status = "pending"),
    (candidate) => candidate.checks.pop(),
    (candidate) => (candidate.productionMutation = true),
  ]) {
    const candidate = structuredClone(evidence);
    mutate(candidate);
    assert.throws(() => validateEvidence(candidate, plan));
  }
  for (const mutation of [
    [
      '"$DEPENDENCY_SHA256" /tmp/rsync-dependency.deb | sha256sum --check --strict',
      '"$DEPENDENCY_SHA256" /tmp/rsync-dependency.deb | sha256sum --check',
    ],
    [
      '"$PACKAGE_SHA256" /tmp/rsync-candidate.deb | sha256sum --check --strict',
      '"$PACKAGE_SHA256" /tmp/rsync-candidate.deb | sha256sum --check',
    ],
    ["Pin: release a=unstable", "Pin: release *"],
    ['gpg --batch --export "$SIGNING_FINGERPRINT"', "gpg --batch --export"],
    ["readlink -f /usr/bin/rrsync", "readlink -f /tmp/rrsync"],
    ["rsync_opts.append('--confine-root=' + os.getcwd())", "confine-root"],
    ['apt-get download "$name=$version"', "removed-rollback-repository"],
    [
      "curl --fail --proto '=https' --tlsv1.2 --output exact-url.deb \"$url\"",
      'curl --fail --output exact-url.deb "$url"',
    ],
    [
      '"$expected_sha256" signed-metadata.deb "$expected_sha256" exact-url.deb',
      '"$expected_sha256" signed-metadata.deb',
    ],
    ["cmp signed-metadata.deb exact-url.deb", "removed-rollback-equality"],
    [
      "dpkg-deb --field signed-metadata.deb Version",
      "removed-rollback-version",
    ],
    [
      "chmod 0444 /usr/local/share/starfiniti/rollback-package-facts",
      "removed-read-only-marker",
    ],
    ["/tmp/rollback-one /tmp/rollback-two", "/tmp/rollback-one"],
    [
      `test -z "$(find /tmp /var/cache/apt/archives -type f -name '*.deb' -print -quit)"`,
      "removed-package-byte-check",
    ],
  ]) {
    const candidate = dockerfile.replace(...mutation);
    assert.notEqual(candidate, dockerfile);
    assert.throws(() => validateDockerfile(candidate));
  }
  for (const requirement of [
    '["network", "create", "--internal", network]',
    '"{{json .NetworkSettings.Ports}}"',
    "rmSync(outputPath, { force: true })",
    "transferredBytes > plan.network.maximumBytes",
    "/usr/local/share/starfiniti/rollback-package-facts",
    "signedMetadataVerified: true",
    "fact[2] !== rollbackPackage.sha256",
    "packageBytesRetained: false",
    "rollbackPackages: hostFacts.rollbackPackages",
  ]) {
    const candidate = runner.replace(requirement, "removed-control");
    assert.notEqual(candidate, runner);
    assert.throws(() => validateRunner(candidate));
  }
}

const plan = validateTransportPlan(YAML.parse(readFileSync(planPath, "utf8")));
const dockerfile = readFileSync(dockerfilePath, "utf8");
validateDockerfile(dockerfile);
const runner = readFileSync(runnerPath, "utf8");
validateRunner(runner);
const evidence = YAML.parse(readFileSync(evidencePath, "utf8"));
validateEvidence(evidence, plan);
if (process.argv.includes("--self-test")) {
  selfTest(plan, evidence, dockerfile, runner);
}
console.log(
  `Validated ${plan.endpoints.length} exact rsync transport endpoints at ${planDigest(plan)}.`,
);
