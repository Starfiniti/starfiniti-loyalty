import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const planPath = join(
  root,
  "infrastructure/testing/borgbackup-security/plan.yaml",
);
const evidencePath = join(
  root,
  "docs/plan/evidence/M16/borgbackup-security.yaml",
);
const dockerfilePath = join(
  root,
  "infrastructure/testing/borgbackup-security/Dockerfile",
);
const canaryPath = join(
  root,
  "infrastructure/testing/borgbackup-security/canary.sh",
);
const fakeSshPath = join(
  root,
  "infrastructure/testing/borgbackup-security/starfiniti-borg-fake-ssh",
);
const treeVerifierPath = join(
  root,
  "infrastructure/testing/borgbackup-security/verify-tree.py",
);
const runnerPath = join(root, "scripts/run-borgbackup-security-canary.mjs");
const workflowPath = join(root, ".github/workflows/security.yml");
const digestPattern = /^[0-9a-f]{64}$/u;
const fingerprintPattern = /^[0-9A-F]{40}$/u;

function fail(message) {
  throw new Error(`BorgBackup security plan invalid: ${message}`);
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

function exactHttps(value, expected, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${label} is not a URL`);
  }
  if (
    value !== expected ||
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port
  ) {
    fail(`${label} differs from its exact HTTPS authority`);
  }
}

export function validateBorgPlan(plan) {
  exactKeys(
    plan,
    [
      "schema",
      "status",
      "profile",
      "architecture",
      "baseImage",
      "sources",
      "installed",
      "candidate",
      "compatibility",
      "rollback",
    ],
    "plan",
  );
  if (
    plan.schema !== "starfiniti.borgbackup-security-plan.v1" ||
    plan.status !== "candidate" ||
    plan.profile !== "production-recovery-client" ||
    plan.architecture !== "amd64" ||
    plan.baseImage !==
      "debian:13-slim@sha256:d7e12182ce18b85b93007c1dedf31f2d29e01ccf3182cc4017c709b6259bc132"
  ) {
    fail("plan identity differs");
  }

  const sources = {
    release: "https://github.com/borgbackup/borg/releases/tag/1.4.5",
    installation:
      "https://borgbackup.readthedocs.io/en/1.4.5/installation.html",
    changes:
      "https://borgbackup.readthedocs.io/en/1.4.5/changes.html#version-1-4-5-2026-07-19",
    security:
      "https://borgbackup.readthedocs.io/en/1.4.5/support.html#security-contact",
    debianPackage: "https://packages.debian.org/trixie/borgbackup",
    debianSecurity:
      "https://security-tracker.debian.org/tracker/CVE-2026-62268",
  };
  exactKeys(plan.sources, Object.keys(sources), "sources");
  for (const [key, expected] of Object.entries(sources)) {
    exactHttps(plan.sources[key], expected, `source ${key}`);
  }

  exactKeys(plan.installed, ["package", "security"], "installed");
  exactKeys(
    plan.installed.package,
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
    "installed package",
  );
  const installed = plan.installed.package;
  const expectedInstalled = {
    authority: "debian-archive",
    name: "borgbackup",
    version: "1.4.0-5",
    repositoryUrl: "https://deb.debian.org/debian",
    suite: "trixie",
    url: "https://deb.debian.org/debian/pool/main/b/borgbackup/borgbackup_1.4.0-5_amd64.deb",
    sha256: "51e1cbdee1fccb31e9c63b93fda81d5fffb14289dc31ba27984e04ebb0c85733",
    executablePath: "/usr/bin/borg",
    executableSha256:
      "babb2b42edd64283220d1f1ca57119d41d8f8b93e4af9c5606874b60dd43bc4d",
  };
  if (
    Object.entries(expectedInstalled).some(
      ([key, value]) => installed[key] !== value,
    ) ||
    !digestPattern.test(installed.sha256) ||
    !digestPattern.test(installed.executableSha256)
  ) {
    fail("installed rollback anchor differs");
  }
  exactHttps(
    installed.repositoryUrl,
    expectedInstalled.repositoryUrl,
    "installed repository",
  );
  exactHttps(installed.url, expectedInstalled.url, "installed package URL");
  exactKeys(
    plan.installed.security,
    ["cve", "status", "debianDisposition"],
    "installed security",
  );
  if (
    plan.installed.security.cve !== "CVE-2026-62268" ||
    plan.installed.security.status !== "affected" ||
    plan.installed.security.debianDisposition !== "no-dsa-minor-issue"
  ) {
    fail("installed security classification differs");
  }

  exactKeys(
    plan.candidate,
    [
      "authority",
      "version",
      "glibcMinimum",
      "installRoot",
      "executablePath",
      "executableSha256",
      "versionLine",
      "asset",
      "signing",
      "extractedTree",
    ],
    "candidate",
  );
  if (
    plan.candidate.authority !== "borgbackup-upstream-release" ||
    plan.candidate.version !== "1.4.5" ||
    plan.candidate.glibcMinimum !== "2.31" ||
    plan.candidate.installRoot !== "/opt/starfiniti/borg/1.4.5" ||
    plan.candidate.executablePath !==
      "/opt/starfiniti/borg/1.4.5/borg-dir/borg.exe" ||
    plan.candidate.executableSha256 !==
      "e0a23534bf28aa90940f749bb25dbbeecd401e9bf1de1dd8872cedc45f98718d" ||
    plan.candidate.versionLine !== "borg.exe 1.4.5"
  ) {
    fail("candidate identity differs");
  }
  exactKeys(
    plan.candidate.asset,
    [
      "url",
      "sha256",
      "bytes",
      "signatureUrl",
      "signatureSha256",
      "readmeUrl",
      "readmeSha256",
    ],
    "candidate asset",
  );
  const asset = plan.candidate.asset;
  const expectedAsset = {
    url: "https://github.com/borgbackup/borg/releases/download/1.4.5/borg-linux-glibc231-x86_64.tgz",
    sha256: "b6cba6b5eee19d51fbf4d89c6090dd40647b856755fffe2e26417365536f2c58",
    bytes: 29702061,
    signatureUrl:
      "https://github.com/borgbackup/borg/releases/download/1.4.5/borg-linux-glibc231-x86_64.tgz.asc",
    signatureSha256:
      "9e7027a2573028e67d9138ccd3de4008d3fad22a5840ac4711f7d56fe89f850a",
    readmeUrl:
      "https://github.com/borgbackup/borg/releases/download/1.4.5/00_README.txt",
    readmeSha256:
      "9245dd1cfffb1b40d7f1b112e9e917902f2ca255b63a417f671d3da3a12e204a",
  };
  if (
    Object.entries(expectedAsset).some(([key, value]) => asset[key] !== value)
  ) {
    fail("candidate asset differs");
  }
  for (const key of ["url", "signatureUrl", "readmeUrl"]) {
    exactHttps(asset[key], expectedAsset[key], `candidate ${key}`);
  }
  exactKeys(
    plan.candidate.signing,
    ["keyserverUrl", "primaryFingerprint"],
    "candidate signing",
  );
  if (
    plan.candidate.signing.keyserverUrl !==
      "https://keyserver.ubuntu.com/pks/lookup?op=get&search=0x6D5BEF9ADD2075805747B70F9F88FB52FAF7B393" ||
    plan.candidate.signing.primaryFingerprint !==
      "6D5BEF9ADD2075805747B70F9F88FB52FAF7B393" ||
    !fingerprintPattern.test(plan.candidate.signing.primaryFingerprint)
  ) {
    fail("candidate signing identity differs");
  }
  exactKeys(
    plan.candidate.extractedTree,
    ["root", "entries", "files", "bytes", "manifestSha256"],
    "candidate tree",
  );
  if (
    plan.candidate.extractedTree.root !== "borg-dir" ||
    plan.candidate.extractedTree.entries !== 106 ||
    plan.candidate.extractedTree.files !== 95 ||
    plan.candidate.extractedTree.bytes !== 79942815 ||
    plan.candidate.extractedTree.manifestSha256 !==
      "09fb420dce78c94814520628cf68ecdd77ab75d4fd9c794f8916874f2a767827"
  ) {
    fail("candidate tree boundary differs");
  }

  exactKeys(
    plan.compatibility,
    [
      "currentClientVersion",
      "candidateClientVersion",
      "remoteServerVersions",
      "requiredOperations",
      "maximumArchives",
      "maximumFiles",
      "maximumPayloadBytes",
      "networkMode",
    ],
    "compatibility",
  );
  const operations = [
    "init",
    "create",
    "info-json",
    "list-json",
    "check-repository",
    "prune-dry-run",
    "compact",
    "extract",
  ];
  if (
    plan.compatibility.currentClientVersion !== "1.4.0" ||
    plan.compatibility.candidateClientVersion !== "1.4.5" ||
    JSON.stringify(plan.compatibility.remoteServerVersions) !==
      JSON.stringify(["1.4.0", "1.4.5"]) ||
    JSON.stringify(plan.compatibility.requiredOperations) !==
      JSON.stringify(operations) ||
    plan.compatibility.maximumArchives !== 4 ||
    plan.compatibility.maximumFiles !== 8 ||
    plan.compatibility.maximumPayloadBytes !== 1048576 ||
    plan.compatibility.networkMode !== "none"
  ) {
    fail("compatibility boundary differs");
  }
  exactKeys(
    plan.rollback,
    [
      "preserveDebianPackage",
      "preserveRepositories",
      "preserveArchives",
      "operationsEscrowRequiredBeforeProduction",
      "productionActivationRequiresExactPath",
      "productionActivationRequiresExactDigest",
      "productionMutation",
    ],
    "rollback",
  );
  if (
    Object.entries(plan.rollback)
      .filter(([key]) => key !== "productionMutation")
      .some(([, value]) => value !== true) ||
    plan.rollback.productionMutation !== false
  ) {
    fail("rollback or production-mutation boundary differs");
  }
  return plan;
}

export function validateCanaryReport(report, plan) {
  exactKeys(
    report,
    [
      "schema",
      "status",
      "observedAt",
      "planSha256",
      "imageId",
      "candidate",
      "rollback",
      "compatibility",
      "isolation",
      "teardown",
      "productionMutation",
    ],
    "canary report",
  );
  if (
    report.schema !== "starfiniti.borgbackup-security-canary-evidence.v1" ||
    report.status !== "passed" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(report.observedAt) ||
    Number.isNaN(Date.parse(report.observedAt)) ||
    Date.parse(report.observedAt) > Date.now() + 5 * 60 * 1000 ||
    report.planSha256 !== planDigest(plan) ||
    !/^sha256:[0-9a-f]{64}$/u.test(report.imageId) ||
    report.productionMutation !== false
  ) {
    fail("canary report identity differs");
  }
  exactKeys(
    report.candidate,
    [
      "version",
      "executableSha256",
      "treeManifestSha256",
      "signatureVerified",
      "rawAssetRetained",
    ],
    "canary candidate",
  );
  if (
    report.candidate.version !== plan.candidate.version ||
    report.candidate.executableSha256 !== plan.candidate.executableSha256 ||
    report.candidate.treeManifestSha256 !==
      plan.candidate.extractedTree.manifestSha256 ||
    report.candidate.signatureVerified !== true ||
    report.candidate.rawAssetRetained !== false
  ) {
    fail("canary candidate facts differ");
  }
  exactKeys(
    report.rollback,
    [
      "version",
      "packageVersion",
      "packageSha256",
      "executableSha256",
      "packageBytesRetained",
    ],
    "canary rollback",
  );
  if (
    report.rollback.version !== plan.compatibility.currentClientVersion ||
    report.rollback.packageVersion !== plan.installed.package.version ||
    report.rollback.packageSha256 !== plan.installed.package.sha256 ||
    report.rollback.executableSha256 !==
      plan.installed.package.executableSha256 ||
    report.rollback.packageBytesRetained !== false
  ) {
    fail("canary rollback facts differ");
  }
  exactKeys(
    report.compatibility,
    ["pairs", "archives", "files", "payloadBytes", "operations"],
    "canary compatibility",
  );
  if (
    report.compatibility.pairs !== 4 ||
    report.compatibility.archives !== 4 ||
    report.compatibility.archives > plan.compatibility.maximumArchives ||
    report.compatibility.files !== 2 ||
    report.compatibility.files > plan.compatibility.maximumFiles ||
    report.compatibility.payloadBytes !== 32 ||
    report.compatibility.payloadBytes >
      plan.compatibility.maximumPayloadBytes ||
    JSON.stringify(report.compatibility.operations) !==
      JSON.stringify(plan.compatibility.requiredOperations)
  ) {
    fail("canary compatibility facts differ");
  }
  exactKeys(
    report.isolation,
    [
      "networkMode",
      "readOnlyRootfs",
      "user",
      "capDrop",
      "noNewPrivileges",
      "pidsLimit",
      "memoryBytes",
      "nanoCpus",
      "publishedPorts",
    ],
    "canary isolation",
  );
  if (
    report.isolation.networkMode !== "none" ||
    report.isolation.readOnlyRootfs !== true ||
    report.isolation.user !== "65532:65532" ||
    JSON.stringify(report.isolation.capDrop) !== JSON.stringify(["ALL"]) ||
    report.isolation.noNewPrivileges !== true ||
    report.isolation.pidsLimit !== 256 ||
    report.isolation.memoryBytes !== 1073741824 ||
    report.isolation.nanoCpus !== 2000000000 ||
    report.isolation.publishedPorts !== 0
  ) {
    fail("canary isolation facts differ");
  }
  exactKeys(
    report.teardown,
    ["containerRemoved", "imageRemoved"],
    "canary teardown",
  );
  if (
    report.teardown.containerRemoved !== true ||
    report.teardown.imageRemoved !== true
  ) {
    fail("canary teardown is incomplete");
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
      "canary",
      "checks",
      "productionMutation",
      "automaticFails",
    ],
    "evidence",
  );
  if (
    evidence.schema !== "starfiniti.borgbackup-security-evidence.v1" ||
    evidence.status !== "in_progress" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(evidence.observedAt) ||
    Number.isNaN(Date.parse(evidence.observedAt)) ||
    Date.parse(evidence.observedAt) > Date.now() + 5 * 60 * 1000 ||
    evidence.productionMutation !== false
  ) {
    fail("evidence identity differs");
  }
  exactKeys(evidence.candidate, ["branch", "commit"], "evidence candidate");
  if (
    evidence.candidate.branch !== "codex/enterprise-roadmap-integration" ||
    evidence.candidate.commit !== null
  ) {
    fail("unproved evidence must not claim an exact candidate commit");
  }
  exactKeys(evidence.plan, ["path", "sha256"], "evidence plan");
  if (
    evidence.plan.path !==
      "infrastructure/testing/borgbackup-security/plan.yaml" ||
    evidence.plan.sha256 !== planDigest(plan) ||
    evidence.canary !== null
  ) {
    fail("evidence plan or canary binding differs");
  }
  const expected = new Map([
    ["plan_contract", "passed"],
    ["official_release_impact", "passed"],
    ["candidate_signature_contract", "passed"],
    ["rollback_package_contract", "passed"],
    ["compatibility_canary", "pending"],
    ["operations_escrow", "pending"],
    ["production_remote_compatibility", "pending"],
    ["production_rollout", "pending"],
    ["isolated_restore", "pending"],
    ["independent_review", "pending"],
  ]);
  if (!Array.isArray(evidence.checks) || evidence.checks.length !== 10) {
    fail("evidence check count differs");
  }
  for (const check of evidence.checks) {
    exactKeys(check, ["id", "status", "evidence"], "evidence check");
    if (
      expected.get(check.id) !== check.status ||
      typeof check.evidence !== "string" ||
      check.evidence.length < 20 ||
      check.evidence.length > 700
    ) {
      fail(`evidence check ${check.id} differs`);
    }
    expected.delete(check.id);
  }
  if (expected.size !== 0) fail("evidence check is missing or duplicated");
  if (
    !Array.isArray(evidence.automaticFails) ||
    evidence.automaticFails.length !== 5 ||
    evidence.automaticFails.some(
      (item) => typeof item !== "string" || item.length < 20,
    )
  ) {
    fail("automatic-failure set differs");
  }
}

function requireText(text, requirements, label) {
  for (const requirement of requirements) {
    if (!text.includes(requirement)) fail(`${label} is missing ${requirement}`);
  }
}

function validateImplementation(files) {
  requireText(
    files.dockerfile,
    [
      "FROM ${BASE_IMAGE}",
      'borgbackup="$CURRENT_PACKAGE_VERSION"',
      'apt-get download "borgbackup=$CURRENT_PACKAGE_VERSION"',
      "curl --fail --location --proto '=https' --tlsv1.2",
      "cmp signed-metadata.deb exact-url.deb",
      "dpkg-deb --field signed-metadata.deb Package",
      "printf '%s  %s\\n' \"$CANDIDATE_SHA256\" candidate.tgz",
      "gpg --batch --with-colons --fingerprint",
      "GPG key fingerprint: 6D5B EF9A DD20 7580 5747 B70F 9F88 FB52 FAF7 B393",
      "gpg --batch --status-fd=1 --verify candidate.tgz.asc candidate.tgz",
      '$2 == "VALIDSIG" && $NF == fingerprint',
      "starfiniti-verify-borg-tree --archive candidate.tgz",
      "tar -xzf candidate.tgz --no-same-owner --no-same-permissions",
      "find /opt/starfiniti/borg -type f -exec chmod 0444",
      'chmod 0555 "$candidate"',
      "starfiniti-verify-borg-tree --tree",
      "rm -rf /tmp/starfiniti-borg-verify",
      "! getent passwd 65532",
      "! getent group 65532",
      "! getent passwd starfiniti",
      "! getent group starfiniti",
      "starfiniti:x:65532:65532:Starfiniti Borg canary:/nonexistent:/bin/false",
      'com.starfiniti.disposable="true"',
      "HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=1",
      "/opt/starfiniti/borg/1.4.5/borg-dir/borg.exe --version >/dev/null || exit 1",
      "USER 65532:65532",
    ],
    "Dockerfile",
  );
  const checksum = files.dockerfile.indexOf(
    '"$CANDIDATE_SHA256" candidate.tgz',
  );
  const signature = files.dockerfile.indexOf(
    "gpg --batch --status-fd=1 --verify candidate.tgz.asc candidate.tgz",
  );
  const archiveValidation = files.dockerfile.indexOf(
    "starfiniti-verify-borg-tree --archive candidate.tgz",
  );
  const extraction = files.dockerfile.indexOf("tar -xzf candidate.tgz");
  if (
    ![checksum, signature, archiveValidation, extraction].every(
      (value, index, values) =>
        value >= 0 && (index === 0 || value > values[index - 1]),
    )
  ) {
    fail("candidate verification must precede extraction");
  }
  const cleanup = files.dockerfile.indexOf(
    "rm -rf /tmp/starfiniti-borg-verify",
  );
  if (
    cleanup < archiveValidation ||
    files.dockerfile
      .slice(files.dockerfile.indexOf("RUN test"), cleanup)
      .includes("\nRUN ")
  ) {
    fail("raw acquisition bytes must be removed in their creating image layer");
  }
  for (const forbidden of [
    " unstable",
    " sid",
    "apt-get install -t",
    "ADD https://",
    "curl |",
    "wget |",
  ]) {
    if (files.dockerfile.includes(forbidden)) {
      fail(`Dockerfile contains forbidden ${forbidden}`);
    }
  }

  requireText(
    files.treeVerifier,
    [
      'tarfile.open(archive, "r:gz")',
      'member.name.startswith("/")',
      'part in {"", ".", ".."}',
      "member.isdir() or member.isreg()",
      "member.name in names",
      "candidate archive exceeds byte bound",
      "stat.S_ISLNK(mode)",
      "candidate tree manifest differs",
    ],
    "tree verifier",
  );
  requireText(
    files.fakeSsh,
    [
      "canary@current-server",
      "canary@candidate-server",
      'test "$1" = "$requested_borg"',
      'test "${1:-}" = serve',
      "--critical|--info|--debug|--debug-topic=repository.*|--storage-quota=*",
      'exec "$remote_borg" serve "$@"',
    ],
    "fake SSH",
  );
  requireText(
    files.canary,
    [
      'export BORG_RSH="$fake_ssh"',
      "BORG_RELOCATED_REPO_ACCESS_IS_OK=no",
      "check --repository-only --max-duration 30",
      "prune --dry-run --keep-within 2d",
      '"$candidate_borg" compact',
      '"$candidate_borg" extract --remote-path borg',
      '"$current_borg" extract --remote-path /opt/starfiniti/borg/1.4.5/borg-dir/borg.exe',
      '"$current_borg" create --remote-path /opt/starfiniti/borg/1.4.5/borg-dir/borg.exe',
      'clientServerPairs":4',
      'productionMutation":false',
    ],
    "canary",
  );
  requireText(
    files.runner,
    [
      "only the repository BorgBackup security plan may be executed",
      "output must be a bounded JSON path under dist/borgbackup-security",
      "constants.O_EXCL",
      "constants.O_NOFOLLOW",
      '"--network",\n      "none"',
      '"--read-only"',
      '"--user",\n      "65532:65532"',
      '"--cap-drop",\n      "ALL"',
      '"--security-opt",\n      "no-new-privileges:true"',
      '"--pids-limit",\n      "256"',
      '"--memory",\n      "1073741824"',
      '"--cpus",\n      "2"',
      "productionMutation: false",
      '[containerCreated, ["rm", "--force", containerName]]',
      '[imageCreated, ["image", "rm", "--force", imageTag]]',
      '"container",\n        "ls"',
      '["image", "ls", "--all", "--quiet", "--no-trunc"]',
      "validateCanaryReport(report, plan)",
    ],
    "runner",
  );
  for (const forbidden of [
    '"--network", "host"',
    '"--privileged"',
    '"--publish"',
    "child_process.exec(",
    "shell: true",
    "ssh ",
    "scp ",
  ]) {
    if (files.runner.includes(forbidden)) fail(`runner contains ${forbidden}`);
  }
  requireText(
    files.workflow,
    [
      "Validate exact BorgBackup security candidate",
      "npm run borgbackup-security:validate",
      "Run disposable networkless BorgBackup compatibility canary",
      "npm run borgbackup-security:run -- --out dist/borgbackup-security/ci.json",
      "security-borgbackup-${{ github.sha }}",
      "dist/borgbackup-security/ci.json",
    ],
    "security workflow",
  );
}

function selfTest(plan, evidence, files) {
  assert.equal(validateBorgPlan(structuredClone(plan)).schema, plan.schema);
  assert.match(planDigest(plan), digestPattern);
  const planMutations = [
    (value) => (value.status = "approved"),
    (value) => (value.architecture = "arm64"),
    (value) => (value.baseImage = "debian:13-slim"),
    (value) => (value.sources.release = "https://example.test/release"),
    (value) => (value.installed.package.version = "1.4.1"),
    (value) => (value.installed.package.sha256 = "0".repeat(64)),
    (value) => (value.installed.package.url = "http://deb.debian.org/a.deb"),
    (value) => (value.installed.security.status = "fixed"),
    (value) => (value.candidate.authority = "debian-unstable"),
    (value) => (value.candidate.version = "1.4.6"),
    (value) => (value.candidate.installRoot = "/usr/local/bin"),
    (value) => (value.candidate.executableSha256 = "0".repeat(64)),
    (value) => (value.candidate.asset.bytes += 1),
    (value) => (value.candidate.asset.signatureSha256 = "0".repeat(64)),
    (value) => (value.candidate.signing.primaryFingerprint = "0".repeat(40)),
    (value) => (value.candidate.extractedTree.entries -= 1),
    (value) => (value.candidate.extractedTree.files -= 1),
    (value) => (value.candidate.extractedTree.bytes -= 1),
    (value) => (value.candidate.extractedTree.manifestSha256 = "0".repeat(64)),
    (value) => value.compatibility.remoteServerVersions.pop(),
    (value) => value.compatibility.requiredOperations.pop(),
    (value) => (value.compatibility.networkMode = "bridge"),
    (value) => (value.rollback.preserveArchives = false),
    (value) => (value.rollback.productionMutation = true),
  ];
  for (const mutate of planMutations) {
    const candidate = structuredClone(plan);
    mutate(candidate);
    assert.throws(() => validateBorgPlan(candidate));
  }
  assert.doesNotThrow(() => validateEvidence(structuredClone(evidence), plan));
  for (const mutate of [
    (value) => (value.status = "complete"),
    (value) => (value.candidate.commit = "0".repeat(40)),
    (value) => (value.plan.sha256 = "0".repeat(64)),
    (value) => (value.canary = {}),
    (value) => (value.productionMutation = true),
    (value) => value.checks.pop(),
    (value) =>
      (value.checks.find(
        (check) => check.id === "compatibility_canary",
      ).status = "passed"),
  ]) {
    const candidate = structuredClone(evidence);
    mutate(candidate);
    assert.throws(() => validateEvidence(candidate, plan));
  }
  for (const [source, replacement] of [
    ['$2 == "VALIDSIG" && $NF == fingerprint', '$2 == "VALIDSIG"'],
    ["starfiniti-verify-borg-tree --archive candidate.tgz", "removed"],
    ["cmp signed-metadata.deb exact-url.deb", "removed"],
    ['chmod 0555 "$candidate"', "removed"],
  ]) {
    const changed = files.dockerfile.replace(source, replacement);
    assert.notEqual(changed, files.dockerfile);
    assert.throws(() =>
      validateImplementation({ ...files, dockerfile: changed }),
    );
  }
  for (const source of [
    '"--read-only"',
    '"--network",\n      "none"',
    "constants.O_EXCL",
    '[containerCreated, ["rm", "--force", containerName]]',
    "validateCanaryReport(report, plan)",
  ]) {
    const changed = files.runner.replace(source, "removed-control");
    assert.notEqual(changed, files.runner);
    assert.throws(() => validateImplementation({ ...files, runner: changed }));
  }
}

function main() {
  const plan = validateBorgPlan(YAML.parse(readFileSync(planPath, "utf8")));
  const evidence = YAML.parse(readFileSync(evidencePath, "utf8"));
  const files = {
    dockerfile: readFileSync(dockerfilePath, "utf8"),
    canary: readFileSync(canaryPath, "utf8"),
    fakeSsh: readFileSync(fakeSshPath, "utf8"),
    treeVerifier: readFileSync(treeVerifierPath, "utf8"),
    runner: readFileSync(runnerPath, "utf8"),
    workflow: readFileSync(workflowPath, "utf8"),
  };
  validateEvidence(evidence, plan);
  validateImplementation(files);
  if (process.argv.includes("--self-test")) selfTest(plan, evidence, files);
  console.log(
    `Validated exact BorgBackup security candidate at ${planDigest(plan)}.`,
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  main();
}
