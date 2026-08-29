import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const context = join(root, "infrastructure/testing/openssh-client-security");
const planPath = join(context, "plan.yaml");
const evidencePath = join(
  root,
  "docs/plan/evidence/M16/openssh-client-security.yaml",
);
const paths = {
  clientDockerfile: join(context, "client.Dockerfile"),
  serverDockerfile: join(context, "server.Dockerfile"),
  clientCanary: join(context, "client-canary.sh"),
  serverEntrypoint: join(context, "server-entrypoint.sh"),
  forcedCommand: join(context, "forced-command.sh"),
  sourceVerifier: join(context, "verify-source.py"),
  runner: join(root, "scripts/run-openssh-client-security-canary.mjs"),
  workflow: join(root, ".github/workflows/security.yml"),
};
const sha256Pattern = /^[0-9a-f]{64}$/u;
const commitPattern = /^[0-9a-f]{40}$/u;
const testedCandidateCommit = null;
const testedWorkflowRunId = null;
const testedWorkflowJobId = null;
const testedArtifactId = null;
const testedArtifactName = null;
const testedArtifactSha256 = null;
const testedReportSha256 = null;

function fail(message) {
  throw new Error(`OpenSSH client security plan invalid: ${message}`);
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
    !hosts.has(parsed.hostname)
  ) {
    fail(`${label} is outside the approved HTTPS authority`);
  }
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

export function validateOpenSshPlan(plan) {
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
    plan.schema !== "starfiniti.openssh-client-security-plan.v1" ||
    !["bootstrap", "candidate"].includes(plan.status) ||
    plan.profile !== "privileged-recovery-client" ||
    plan.architecture !== "amd64"
  ) {
    fail("plan identity is invalid");
  }
  exactKeys(plan.baseImages, ["client", "server"], "base images");
  if (
    !/^debian:13-slim@sha256:[0-9a-f]{64}$/u.test(plan.baseImages.client) ||
    !/^ubuntu:24\.04@sha256:[0-9a-f]{64}$/u.test(plan.baseImages.server)
  ) {
    fail("base images must be digest pinned");
  }
  exactKeys(
    plan.sources,
    ["release", "portable", "install", "debianTracker", "ubuntuNotice"],
    "sources",
  );
  for (const [key, value] of Object.entries(plan.sources)) {
    exactHttps(
      value,
      `source ${key}`,
      new Set([
        "www.openssh.org",
        "www.openbsd.org",
        "cdn.openbsd.org",
        "security-tracker.debian.org",
        "ubuntu.com",
      ]),
    );
  }
  exactKeys(plan.installed, ["hostClient", "guestServer"], "installed");
  exactKeys(
    plan.installed.hostClient,
    [
      "authority",
      "name",
      "version",
      "repositoryUrl",
      "suite",
      "url",
      "sha256",
      "executablePath",
      "executableSha256",
    ],
    "host client",
  );
  const host = plan.installed.hostClient;
  if (
    host.authority !== "debian-archive" ||
    host.name !== "openssh-client" ||
    host.version !== "1:10.0p1-7+deb13u4" ||
    host.suite !== "trixie" ||
    host.executablePath !== "/usr/bin/ssh" ||
    host.sha256 !==
      "8fff343654f86c3b3266f94cd338c7b4da2e386da029327815118ea00bce03b9" ||
    host.executableSha256 !==
      "af3b04ec5653755032fc18ad02445e4e51170e75d8bac4265647d423caa9a83e"
  ) {
    fail("host rollback client is invalid");
  }
  exactHttps(host.url, "host client URL", new Set(["deb.debian.org"]));
  exactKeys(
    plan.installed.guestServer,
    [
      "authority",
      "version",
      "repositoryUrl",
      "suite",
      "packages",
      "executablePath",
      "executableSha256",
    ],
    "guest server",
  );
  const guest = plan.installed.guestServer;
  if (
    guest.authority !== "ubuntu-security" ||
    guest.version !== "1:9.6p1-3ubuntu13.18" ||
    guest.suite !== "noble-security" ||
    guest.executablePath !== "/usr/sbin/sshd" ||
    !sha256Pattern.test(guest.executableSha256) ||
    !Array.isArray(guest.packages) ||
    guest.packages.length !== 3
  ) {
    fail("guest server boundary is invalid");
  }
  const packageNames = new Set();
  const expectedGuestPackageDigests = new Map([
    [
      "openssh-client",
      "900ee53c747920694bd508e598702aa794911a7c8273e66f292fe45144a00a9f",
    ],
    [
      "openssh-server",
      "81a6c622a2b566a95f1939f25776e0ec05b6b40c2fa61f7cd9f148bca4344208",
    ],
    [
      "openssh-sftp-server",
      "2287e3e9e3d0ace278173ca218d32d41a24b87afec3b42ef7dabfda4d9125edd",
    ],
  ]);
  for (const item of guest.packages) {
    exactKeys(item, ["name", "url", "sha256"], "guest package");
    if (
      !["openssh-client", "openssh-server", "openssh-sftp-server"].includes(
        item.name,
      ) ||
      packageNames.has(item.name) ||
      item.sha256 !== expectedGuestPackageDigests.get(item.name)
    ) {
      fail("guest package identity is invalid");
    }
    packageNames.add(item.name);
    exactHttps(item.url, "guest package URL", new Set(["security.ubuntu.com"]));
  }
  exactKeys(
    plan.candidate,
    [
      "authority",
      "version",
      "installRoot",
      "executablePath",
      "executableSha256",
      "versionPrefix",
      "source",
      "sourceTree",
      "build",
    ],
    "candidate",
  );
  const candidate = plan.candidate;
  if (
    candidate.authority !== "openssh-portable-upstream" ||
    candidate.version !== "10.5p1" ||
    candidate.installRoot !== "/opt/starfiniti/openssh/10.5p1" ||
    candidate.executablePath !== "/opt/starfiniti/openssh/10.5p1/bin/ssh" ||
    candidate.versionPrefix !== "OpenSSH_10.5p1" ||
    (plan.status === "bootstrap" && candidate.executableSha256 !== null) ||
    (plan.status === "candidate" &&
      !sha256Pattern.test(candidate.executableSha256))
  ) {
    fail("candidate identity or bootstrap boundary is invalid");
  }
  exactKeys(
    candidate.source,
    [
      "url",
      "sha256",
      "sha256Base64",
      "bytes",
      "signatureUrl",
      "signatureSha256",
      "releaseKeyUrl",
      "releaseKeySha256",
      "signingFingerprint",
    ],
    "candidate source",
  );
  if (
    candidate.source.sha256 !==
      "d44d28a839ea9daf969cc69150fde59910b2b39361dad81a3bd6cbd19218db11" ||
    candidate.source.sha256Base64 !==
      "1E0oqDnqna+WnMaRUP3lmRCys5Nh2tgaO9bL0ZIY2xE=" ||
    candidate.source.bytes !== 2333659 ||
    candidate.source.signatureSha256 !==
      "77b48fd2657520db9229b82bc1bab3f5c00b1b6f7ac2dbb9111b1c8584d6e335" ||
    candidate.source.releaseKeySha256 !==
      "c4a6f4692c9b8e75ec096add049fe0314b3ceff9410321f1e85907cf7a864269" ||
    candidate.source.signingFingerprint !==
      "7168B983815A5EEF59A4ADFD2A3F414E736060BA"
  ) {
    fail("candidate source provenance is invalid");
  }
  for (const key of ["url", "signatureUrl", "releaseKeyUrl"]) {
    exactHttps(
      candidate.source[key],
      `candidate source ${key}`,
      new Set(["cdn.openbsd.org"]),
    );
  }
  exactKeys(
    candidate.sourceTree,
    ["root", "entries", "files", "bytes", "manifestSha256"],
    "source tree",
  );
  if (
    candidate.sourceTree.root !== "openssh-10.5p1" ||
    candidate.sourceTree.entries !== 930 ||
    candidate.sourceTree.files !== 892 ||
    candidate.sourceTree.bytes !== 10059047 ||
    candidate.sourceTree.manifestSha256 !==
      "b711344d08bc174e15067b936018eb4e07e308b6526228ba1afd927ba70759ab"
  ) {
    fail("source tree identity is invalid");
  }
  exactKeys(candidate.build, ["configure", "target", "strip"], "build");
  if (
    JSON.stringify(candidate.build.configure) !==
      JSON.stringify([
        "--prefix=/opt/starfiniti/openssh/10.5p1",
        "--sysconfdir=/etc/ssh",
        "--without-pam",
        "--without-libedit",
        "--without-kerberos5",
        "--with-default-path=/usr/bin:/bin",
      ]) ||
    candidate.build.target !== "ssh" ||
    candidate.build.strip !== "--strip-unneeded"
  ) {
    fail("client-only build contract is invalid");
  }
  exactKeys(
    plan.compatibility,
    [
      "serverVersionPrefix",
      "requiredClients",
      "requiredOperations",
      "command",
      "expectedOutput",
      "port",
      "internalNetwork",
      "publishedPorts",
      "maximumConnections",
      "maximumOutputBytes",
    ],
    "compatibility",
  );
  if (
    plan.compatibility.serverVersionPrefix !== "OpenSSH_9.6p1" ||
    JSON.stringify(plan.compatibility.requiredClients) !==
      JSON.stringify(["current", "candidate"]) ||
    JSON.stringify(plan.compatibility.requiredOperations) !==
      JSON.stringify([
        "effective-config",
        "strict-host-key",
        "public-key",
        "forced-command",
      ]) ||
    plan.compatibility.command !== "printf starfiniti-openssh-canary" ||
    plan.compatibility.expectedOutput !== "starfiniti-openssh-canary" ||
    plan.compatibility.port !== 2222 ||
    plan.compatibility.internalNetwork !== true ||
    plan.compatibility.publishedPorts !== 0 ||
    plan.compatibility.maximumConnections !== 4 ||
    plan.compatibility.maximumOutputBytes !== 4096
  ) {
    fail("compatibility boundary is invalid");
  }
  exactKeys(
    plan.rollback,
    [
      "preserveDebianPackage",
      "preserveDistroSshd",
      "preserveKnownHosts",
      "operationsEscrowRequiredBeforeProduction",
      "productionActivationRequiresExactPath",
      "productionActivationRequiresExactDigest",
      "productionMutation",
    ],
    "rollback",
  );
  if (
    Object.values(plan.rollback).some((value) => value !== true) &&
    plan.rollback.productionMutation !== false
  ) {
    fail("rollback boundary is invalid");
  }
  if (
    !plan.rollback.preserveDebianPackage ||
    !plan.rollback.preserveDistroSshd ||
    !plan.rollback.preserveKnownHosts ||
    !plan.rollback.operationsEscrowRequiredBeforeProduction ||
    !plan.rollback.productionActivationRequiresExactPath ||
    !plan.rollback.productionActivationRequiresExactDigest ||
    plan.rollback.productionMutation !== false
  ) {
    fail("rollback controls are invalid");
  }
  return plan;
}

export function validateCanaryReport(report, plan, options = {}) {
  const baseKeys = [
    "schema",
    "status",
    "currentVersion",
    "candidateVersion",
    "currentExecutableSha256",
    "candidateExecutableSha256",
    "serverVersion",
    "clients",
    "connections",
    "effectiveConfigChecks",
    "strictHostKey",
    "publicKey",
    "forcedCommand",
    "internalNetwork",
    "publishedPorts",
    "productionMutation",
  ];
  const keys = options.completed
    ? [...baseKeys, "observedAt", "planSha256", "teardown"]
    : baseKeys;
  exactKeys(report, keys, "canary report");
  if (
    report.schema !== "starfiniti.openssh-client-security-canary.v1" ||
    report.status !== "passed" ||
    report.currentVersion !== "10.0p1" ||
    report.candidateVersion !== "10.5p1" ||
    report.currentExecutableSha256 !==
      plan.installed.hostClient.executableSha256 ||
    !sha256Pattern.test(report.candidateExecutableSha256) ||
    (plan.candidate.executableSha256 !== null &&
      report.candidateExecutableSha256 !== plan.candidate.executableSha256) ||
    report.serverVersion !== "9.6p1" ||
    report.clients !== 2 ||
    report.connections !== 3 ||
    report.effectiveConfigChecks !== 2 ||
    report.strictHostKey !== true ||
    report.publicKey !== true ||
    report.forcedCommand !== true ||
    report.internalNetwork !== true ||
    report.publishedPorts !== 0 ||
    report.productionMutation !== false
  ) {
    fail("canary result differs from the plan");
  }
  if (
    options.completed &&
    (Number.isNaN(Date.parse(report.observedAt)) ||
      report.planSha256 !== planDigest(plan) ||
      report.teardown !== "passed")
  ) {
    fail("completed canary chronology or teardown is invalid");
  }
  return report;
}

function validateEvidence(evidence, plan) {
  exactKeys(
    evidence,
    [
      "schema",
      "status",
      "candidate",
      "plan",
      "canary",
      "checks",
      "productionMutation",
      "automaticFails",
    ],
    "evidence",
  );
  if (
    evidence.schema !== "starfiniti.openssh-client-security-evidence.v1" ||
    evidence.status !== "in_progress" ||
    evidence.productionMutation !== false
  ) {
    fail("evidence identity is invalid");
  }
  exactKeys(evidence.candidate, ["branch", "commit"], "evidence candidate");
  if (
    evidence.candidate.branch !== "codex/enterprise-roadmap-integration" ||
    evidence.candidate.commit !== testedCandidateCommit
  ) {
    fail("evidence candidate binding is invalid");
  }
  exactKeys(evidence.plan, ["path", "sha256"], "evidence plan");
  if (
    evidence.plan.path !==
      "infrastructure/testing/openssh-client-security/plan.yaml" ||
    evidence.plan.sha256 !== planDigest(plan)
  ) {
    fail("evidence plan binding is invalid");
  }
  if (testedCandidateCommit === null) {
    if (plan.status !== "bootstrap" || evidence.canary !== null) {
      fail("bootstrap evidence must not claim an exact canary");
    }
  } else {
    if (!commitPattern.test(testedCandidateCommit))
      fail("tested commit invalid");
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
      ],
      "evidence canary",
    );
    if (
      evidence.canary.workflowRunId !== testedWorkflowRunId ||
      evidence.canary.workflowJobId !== testedWorkflowJobId ||
      evidence.canary.artifactId !== testedArtifactId ||
      evidence.canary.artifactName !== testedArtifactName ||
      evidence.canary.artifactSha256 !== testedArtifactSha256 ||
      evidence.canary.reportPath !== "ci.json" ||
      evidence.canary.reportSha256 !== testedReportSha256
    ) {
      fail("exact canary evidence binding is invalid");
    }
  }
  const expectedChecks = new Map([
    ["threat_model", "passed"],
    ["signed_source", "passed"],
    ["client_only_build", "passed"],
    ["rollback_package", "passed"],
    ["compatibility_canary", testedCandidateCommit ? "passed" : "pending"],
    ["operations_escrow", "pending"],
    ["real_provider", "pending"],
    ["production_rollout", "pending"],
    ["isolated_restore", "pending"],
    ["independent_review", "pending"],
  ]);
  if (!Array.isArray(evidence.checks) || evidence.checks.length !== 10) {
    fail("evidence must contain ten checks");
  }
  for (const check of evidence.checks) {
    exactKeys(check, ["id", "status", "evidence"], "evidence check");
    if (
      expectedChecks.get(check.id) !== check.status ||
      typeof check.evidence !== "string" ||
      check.evidence.length < 20 ||
      check.evidence.length > 700
    ) {
      fail(`evidence check ${check.id} is invalid`);
    }
    expectedChecks.delete(check.id);
  }
  if (expectedChecks.size) fail("evidence check missing or duplicated");
  if (
    !Array.isArray(evidence.automaticFails) ||
    evidence.automaticFails.length !== 5 ||
    evidence.automaticFails.some(
      (value) => typeof value !== "string" || value.length < 20,
    )
  ) {
    fail("automatic failure set is invalid");
  }
}

function requireText(text, requirements, label) {
  for (const requirement of requirements) {
    if (!text.includes(requirement)) fail(`${label} is missing ${requirement}`);
  }
}

function validateImplementation(files) {
  requireText(
    files.clientDockerfile,
    [
      "FROM ${BASE_IMAGE} AS builder",
      "libssl-dev python3 zlib1g-dev",
      "starfiniti-verify-openssh-source --self-test",
      "gpg --batch --status-fd=1 --verify",
      '$2 == "VALIDSIG" && $NF == fingerprint',
      "starfiniti-verify-openssh-source --archive",
      "starfiniti-verify-openssh-source --tree",
      "make -j2 ssh",
      "strip --strip-unneeded ssh",
      'install -D -o root -g root -m 0555 ssh "$INSTALL_ROOT/bin/ssh"',
      'apt-get download "openssh-client=$CURRENT_PACKAGE_VERSION"',
      "cmp signed-metadata.deb exact-url.deb",
      "COPY --from=builder /opt/starfiniti/openssh/10.5p1",
      "USER 65532:65532",
      'CMD ["/opt/starfiniti/openssh/10.5p1/bin/ssh", "-V"]',
    ],
    "client Dockerfile",
  );
  requireText(
    files.serverDockerfile,
    [
      'openssh-client="$PACKAGE_VERSION"',
      'openssh-server="$PACKAGE_VERSION"',
      'openssh-sftp-server="$PACKAGE_VERSION"',
      "cmp client-metadata.deb client-url.deb",
      "cmp server-metadata.deb server-url.deb",
      "cmp sftp-metadata.deb sftp-url.deb",
      "printf '%s  %s\\n' \"$SERVER_EXECUTABLE_SHA256\" /usr/sbin/sshd",
      "USER 65532:65532",
      'CMD ["/usr/bin/test", "-r", "/state/ready"]',
    ],
    "server Dockerfile",
  );
  requireText(
    files.clientCanary,
    [
      "-F /dev/null",
      "StrictHostKeyChecking=yes",
      "ClearAllForwardings=yes",
      "ForwardAgent=no",
      "ControlMaster=no",
      "starfiniti-openssh-client-stage:%s",
      "current-version-execution",
      "current-version-format",
      "current-effective-config",
      "candidate-connection",
      'effective="$($client $options -G "$endpoint")"',
      'output="$($client $options "$endpoint" "$command")"',
      '"productionMutation":false',
    ],
    "client canary",
  );
  requireText(
    files.serverEntrypoint,
    [
      'command="/usr/local/bin/starfiniti-openssh-forced-command",restrict',
      "AllowTcpForwarding no",
      "AllowAgentForwarding no",
      "PermitTunnel no",
      "PasswordAuthentication no",
      "/usr/sbin/sshd -t",
      "ssh-keyscan -T 1 -t ed25519 -p 2222 127.0.0.1",
      'chmod 0600 "$state/client_ed25519" "$state/ssh_host_ed25519_key"\nchmod 0644 "$state/client_ed25519.pub" "$state/ssh_host_ed25519_key.pub"\nchown 65532:65532 "$state/client_ed25519" "$state/client_ed25519.pub"',
      'chmod 0600 "$state/authorized_keys"\nchown 65532:65532 "$state/authorized_keys"',
      'chmod 0444 "$state/known_hosts"\nchown 65532:65532 "$state/known_hosts"',
    ],
    "server entrypoint",
  );
  requireText(
    files.sourceVerifier,
    [
      'if "\\\\" in name or name.startswith("/")',
      'any(part in ("", ".", "..")',
      'fail("archive contains a link or special member")',
      'fail("archive contains a duplicate member")',
      'fail("archive member has unsafe permissions")',
      "stat.S_IMODE(member.mode)",
      "expect_failure(lambda path=archives[name]: archive_rows(path, root))",
      "digest_rows(rows)",
    ],
    "source verifier",
  );
  requireText(
    files.runner,
    [
      "only the repository OpenSSH client security plan may be executed",
      "constants.O_EXCL",
      "constants.O_NOFOLLOW",
      'fail("output already exists; reports are immutable")',
      "output path identity differs after publication",
      "generated Docker resource identity already exists",
      "client canary container exited unsuccessfully",
      "containerAbsent(clientName)",
      "imageAbsent(clientTag, clientImageId)",
      '["network", "create", "--internal", network]',
      '"--read-only"',
      '"--user",\n      "0:0"',
      '"--user",\n        "65532:65532"',
      '"--cap-drop",\n        "ALL"',
      '"no-new-privileges:true"',
      "differs from its isolated runtime contract",
      '"read-only-root", host.ReadonlyRootfs === true',
      '"unprivileged-container", host.Privileged === false',
      '"health-interval", health?.Interval === expected.health.interval',
      '"state-volume-direction", stateMounts[0]?.RW === !expected.stateReadOnly',
      '"create",\n        "--name",',
      '["start", clientName]',
      '["wait", clientName]',
      "clientFailureStage(clientName)",
      '[created.volume, ["volume", "rm", "--force", volume]]',
      "validateCanaryReport(completed, plan, { completed: true })",
    ],
    "runner",
  );
  for (const forbidden of [
    '"--network", "host"',
    '"--privileged"',
    '"--publish"',
    "child_process.exec(",
    "shell: true",
  ]) {
    if (files.runner.includes(forbidden)) fail(`runner contains ${forbidden}`);
  }
  requireText(
    files.workflow,
    [
      "Validate exact OpenSSH recovery client candidate",
      "npm run openssh-client-security:validate",
      "Run isolated OpenSSH recovery client compatibility canary",
      "npm run openssh-client-security:run -- --out dist/openssh-client-security/ci.json",
      "security-openssh-client-${{ github.sha }}",
      "dist/openssh-client-security/ci.json",
    ],
    "security workflow",
  );
}

function selfTest(plan, evidence, files) {
  assert.equal(validateOpenSshPlan(structuredClone(plan)).schema, plan.schema);
  assert.match(planDigest(plan), sha256Pattern);
  for (const mutate of [
    (value) => (value.status = "approved"),
    (value) => (value.architecture = "arm64"),
    (value) => (value.baseImages.client = "debian:13-slim"),
    (value) => (value.installed.hostClient.sha256 = "0".repeat(64)),
    (value) => value.installed.guestServer.packages.pop(),
    (value) => (value.candidate.version = "10.4p1"),
    (value) => (value.candidate.source.url = "https://example.test/a.tgz"),
    (value) => (value.candidate.source.signingFingerprint = "0".repeat(40)),
    (value) => (value.candidate.sourceTree.entries -= 1),
    (value) => value.candidate.build.configure.pop(),
    (value) => (value.compatibility.internalNetwork = false),
    (value) => (value.rollback.preserveDistroSshd = false),
    (value) => (value.rollback.productionMutation = true),
  ]) {
    const candidate = structuredClone(plan);
    mutate(candidate);
    assert.throws(() => validateOpenSshPlan(candidate));
  }
  assert.doesNotThrow(() => validateEvidence(structuredClone(evidence), plan));
  for (const mutate of [
    (value) => (value.status = "complete"),
    (value) => (value.candidate.commit = "0".repeat(40)),
    (value) => (value.plan.sha256 = "0".repeat(64)),
    (value) => (value.canary = {}),
    (value) => value.checks.pop(),
    (value) => (value.productionMutation = true),
  ]) {
    const candidate = structuredClone(evidence);
    mutate(candidate);
    assert.throws(() => validateEvidence(candidate, plan));
  }
  for (const [file, source] of [
    ["clientDockerfile", "gpg --batch --status-fd=1 --verify"],
    ["clientDockerfile", "starfiniti-verify-openssh-source --archive"],
    ["clientDockerfile", "make -j2 ssh"],
    ["serverDockerfile", "cmp server-metadata.deb server-url.deb"],
    ["clientCanary", "StrictHostKeyChecking=yes"],
    ["clientCanary", "ClearAllForwardings=yes"],
    ["clientCanary", "starfiniti-openssh-client-stage:%s"],
    ["serverEntrypoint", "AllowTcpForwarding no"],
    ["serverEntrypoint", "ssh-keyscan -T 1 -t ed25519 -p 2222 127.0.0.1"],
    ["sourceVerifier", 'fail("archive contains a link or special member")'],
    ["runner", '["network", "create", "--internal", network]'],
    ["runner", "constants.O_EXCL"],
    ["runner", '["wait", clientName]'],
  ]) {
    const changed = files[file].replace(source, "removed-control");
    assert.notEqual(changed, files[file]);
    assert.throws(() => validateImplementation({ ...files, [file]: changed }));
  }
}

function main() {
  const plan = validateOpenSshPlan(YAML.parse(readFileSync(planPath, "utf8")));
  const evidence = YAML.parse(readFileSync(evidencePath, "utf8"));
  const files = Object.fromEntries(
    Object.entries(paths).map(([key, path]) => [
      key,
      readFileSync(path, "utf8"),
    ]),
  );
  validateEvidence(evidence, plan);
  validateImplementation(files);
  if (process.argv.includes("--self-test")) selfTest(plan, evidence, files);
  console.log(
    `Validated OpenSSH recovery client ${plan.status} plan at ${planDigest(plan)}.`,
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  main();
}
