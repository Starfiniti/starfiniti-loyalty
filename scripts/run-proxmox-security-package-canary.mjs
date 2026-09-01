import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  constants,
  copyFileSync,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  rmSync,
  unlinkSync,
  writeSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

import {
  canaryPlanDigest,
  canaryPlanFileSha256,
  reportDigest,
  validateCanaryPlan,
  validateCanaryReport,
} from "./validate-proxmox-security-package-canary.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const defaultPlan = join(
  root,
  "infrastructure/testing/proxmox-security-packages/plan.yaml",
);
const verifierFiles = [
  join(root, "infrastructure/testing/proxmox-security-packages/verify.sh"),
  join(root, "infrastructure/testing/proxmox-security-packages/verify.py"),
];
const safeOutputPattern =
  /^dist\/proxmox-security-packages\/[a-z0-9][a-z0-9._-]{1,79}\.json$/u;
const digestPattern = /^[0-9a-f]{64}$/u;
const fingerprintPattern = /^[0-9A-F]{40}$/u;

function fail(message) {
  throw new Error(`Proxmox package canary failed: ${message}`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function readStableBytes(path, maximumBytes, label) {
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

function parseArguments(argv) {
  if (argv.length === 1 && argv[0] === "--self-test") {
    return { selfTest: true, plan: defaultPlan };
  }
  const parsed = { selfTest: false, plan: defaultPlan };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!["--plan", "--out"].includes(argument)) {
      fail(`unknown option ${argument}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) fail(`${argument} requires a value`);
    const key = argument.slice(2);
    if (key === "out" && parsed.out) fail("--out was provided twice");
    parsed[key] = value;
    index += 1;
  }
  if (!parsed.out) fail("--out is required");
  return parsed;
}

function safeOutputPath(value) {
  const normalized = value.replaceAll("\\", "/");
  if (isAbsolute(value) || !safeOutputPattern.test(normalized)) {
    fail(
      "output must be a bounded JSON path under dist/proxmox-security-packages",
    );
  }
  return resolve(root, normalized);
}

function writeReport(outputPath, report) {
  const bytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`, "utf8");
  let descriptor;
  let created = false;
  let completed = false;
  let createdIdentity;
  try {
    descriptor = openSync(
      outputPath,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    created = true;
    const opened = fstatSync(descriptor);
    if (!opened.isFile()) fail("report output is not a regular file");
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
      if (count === 0) fail("report write stopped before completion");
      offset += count;
    }
    fsyncSync(descriptor);
    const written = fstatSync(descriptor);
    if (
      !written.isFile() ||
      written.size !== bytes.length ||
      (process.platform !== "win32" && (written.mode & 0o777) !== 0o600)
    ) {
      fail("written report is not an exact bounded regular file");
    }
    closeSync(descriptor);
    descriptor = undefined;
    const pathStatus = lstatSync(outputPath);
    if (
      !pathStatus.isFile() ||
      pathStatus.dev !== written.dev ||
      pathStatus.ino !== written.ino
    ) {
      fail("written report path identity differs");
    }
    completed = true;
  } catch (error) {
    if (error && typeof error === "object" && error.code === "EEXIST") {
      fail("output path already exists; reports are never overwritten");
    }
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (created && !completed && createdIdentity) {
      try {
        const status = lstatSync(outputPath);
        if (
          status.isFile() &&
          status.dev === createdIdentity.dev &&
          status.ino === createdIdentity.ino
        ) {
          unlinkSync(outputPath);
        }
      } catch (error) {
        if (!(error && typeof error === "object" && error.code === "ENOENT")) {
          throw error;
        }
      }
    }
  }
}

function manifestText(plan, candidate) {
  const rows = [
    [
      "plan",
      "starfiniti.proxmox-security-package-canary-manifest.v1",
      plan.candidate.provenanceSha256,
      plan.trustAnchors.proxmox.url,
      plan.trustAnchors.proxmox.sha256,
      plan.trustAnchors.proxmox.releaseFingerprint,
      String(
        candidate.repairSet.packages.reduce(
          (total, item) => total + item.size,
          0,
        ),
      ),
      plan.architecture,
    ],
    ...plan.repositories.map((repository) => [
      "repository",
      repository.id,
      repository.repositoryUri,
      repository.suite,
      repository.component,
      repository.inReleaseUrl,
      repository.keyring,
      repository.listToken,
      repository.observationInReleaseSha256,
      repository.observationPackagesSha256,
      plan.architecture,
    ]),
    ...candidate.repairSet.packages.map((item) => [
      "package",
      item.id,
      item.sourceId,
      item.candidateVersion,
      item.architecture,
      item.filename,
      String(item.size),
      item.sha256,
      item.action,
    ]),
  ];
  if (
    rows.length !== 18 ||
    rows.some((row) => row.some((value) => /[\t\r\n]/u.test(value)))
  ) {
    fail("generated manifest shape differs");
  }
  return `${rows.map((row) => row.join("\t")).join("\n")}\n`;
}

function parseBoolean(value, label) {
  if (value === "true") return true;
  if (value === "false") return false;
  fail(`${label} is not a canonical boolean`);
}

function parseFacts(text, plan, candidate) {
  if (Buffer.byteLength(text) > 128 * 1024) fail("facts exceed the byte bound");
  const rows = text
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t"));
  if (rows.length !== 18) fail("facts row count differs");
  const repositoryRows = rows.slice(0, 5);
  const packageRows = rows.slice(5, 17);
  const summaryRow = rows[17];
  const repositories = repositoryRows.map((row, index) => {
    if (row.length !== 9 || row[0] !== "repository") {
      fail("repository fact shape differs");
    }
    const source = plan.repositories[index];
    const signers = row[4].split(",");
    if (
      row[1] !== source.id ||
      !digestPattern.test(row[2]) ||
      !digestPattern.test(row[3]) ||
      signers.length < 1 ||
      signers.length > 4 ||
      signers.some((value) => !fingerprintPattern.test(value)) ||
      new Set(signers).size !== signers.length
    ) {
      fail(`${source.id} repository facts differ`);
    }
    const result = {
      id: row[1],
      inReleaseSha256: row[2],
      packagesSha256: row[3],
      signingFingerprints: signers,
      signatureVerified: parseBoolean(row[5], `${source.id} signature`),
      signedIndexBound: parseBoolean(row[6], `${source.id} signed index`),
      observationInReleaseMatch: parseBoolean(
        row[7],
        `${source.id} InRelease comparison`,
      ),
      observationPackagesMatch: parseBoolean(
        row[8],
        `${source.id} Packages comparison`,
      ),
    };
    if (
      !result.signatureVerified ||
      !result.signedIndexBound ||
      result.observationInReleaseMatch !==
        (result.inReleaseSha256 === source.observationInReleaseSha256) ||
      result.observationPackagesMatch !==
        (result.packagesSha256 === source.observationPackagesSha256)
    ) {
      fail(`${source.id} repository proof differs`);
    }
    return result;
  });
  const packages = packageRows.map((row, index) => {
    if (row.length !== 10 || row[0] !== "package") {
      fail("package fact shape differs");
    }
    const expected = candidate.repairSet.packages[index];
    if (
      row[1] !== expected.id ||
      row[2] !== expected.candidateVersion ||
      row[3] !== expected.architecture ||
      row[4] !== String(expected.size) ||
      row[5] !== expected.sha256
    ) {
      fail(`${expected.id} package facts differ`);
    }
    const result = {
      id: row[1],
      version: row[2],
      architecture: row[3],
      size: Number(row[4]),
      sha256: row[5],
      signedMetadataVerified: parseBoolean(
        row[6],
        `${expected.id} signed metadata`,
      ),
      exactUrlVerified: parseBoolean(row[7], `${expected.id} exact URL`),
      packageFieldsVerified: parseBoolean(
        row[8],
        `${expected.id} package fields`,
      ),
      packageBytesRetained: parseBoolean(row[9], `${expected.id} retention`),
    };
    if (
      !result.signedMetadataVerified ||
      !result.exactUrlVerified ||
      !result.packageFieldsVerified ||
      result.packageBytesRetained
    ) {
      fail(`${expected.id} package proof differs`);
    }
    return result;
  });
  if (
    summaryRow.length !== 12 ||
    summaryRow[0] !== "summary" ||
    summaryRow[1] !== "starfiniti.proxmox-security-package-canary-facts.v1" ||
    !digestPattern.test(summaryRow[2]) ||
    summaryRow[3] !== plan.trustAnchors.proxmox.sha256 ||
    summaryRow[4] !== plan.trustAnchors.proxmox.releaseFingerprint ||
    summaryRow[5] !== String(repositories.length) ||
    summaryRow[6] !== String(packages.length) ||
    summaryRow[7] !==
      String(packages.reduce((total, item) => total + item.size, 0)) ||
    !digestPattern.test(summaryRow[8]) ||
    summaryRow[9] !== summaryRow[8] ||
    parseBoolean(summaryRow[10], "summary package retention") ||
    parseBoolean(summaryRow[11], "summary production mutation")
  ) {
    fail("summary facts differ");
  }
  return {
    debianKeyringSha256: summaryRow[2],
    repositories,
    packages,
    dpkgStatusSha256: summaryRow[8],
  };
}

function buildReport({ plan, facts, commit, generatedAt, teardownPassed }) {
  const metadataObservationMatches = facts.repositories.filter(
    (item) => item.observationInReleaseMatch && item.observationPackagesMatch,
  ).length;
  const report = {
    schema: "starfiniti.proxmox-security-package-canary.v1",
    generatedAt,
    candidate: {
      path: plan.candidate.path,
      fileSha256: plan.candidate.fileSha256,
      provenanceSha256: plan.candidate.provenanceSha256,
    },
    canary: {
      path: "infrastructure/testing/proxmox-security-packages/plan.yaml",
      fileSha256: canaryPlanFileSha256(),
      planDigest: canaryPlanDigest(plan),
      baseImage: plan.baseImage,
      architecture: plan.architecture,
      commit,
      runnerEnvironment: "github-hosted",
      network: "default-bridge-official-sources-only",
      hostNetwork: false,
      publishedPorts: 0,
    },
    trustAnchors: {
      debian: {
        authority: plan.trustAnchors.debian.authority,
        keyringSha256: facts.debianKeyringSha256,
        provenance: "digest-pinned-debian-base-image-and-signed-bootstrap",
      },
      proxmox: { ...plan.trustAnchors.proxmox },
    },
    repositories: facts.repositories,
    packages: facts.packages,
    summary: {
      repositoryCount: facts.repositories.length,
      signatureCount: facts.repositories.reduce(
        (total, item) => total + item.signingFingerprints.length,
        0,
      ),
      metadataObservationMatches,
      packageCount: facts.packages.length,
      packageBytes: facts.packages.reduce(
        (total, item) => total + item.size,
        0,
      ),
      dpkgStatusBeforeSha256: facts.dpkgStatusSha256,
      dpkgStatusAfterSha256: facts.dpkgStatusSha256,
      candidatePackageInstallationOccurred: false,
      packageBytesRetained: false,
      productionCredentialsProvided: false,
      productionRouteInputProvided: false,
      productionMutation: false,
      teardownPassed,
    },
    gates: {
      candidatePackageBytesVerified: true,
      repositoryToolSignatureReverified: true,
      freshSignedMetadataBindsEveryCandidate: true,
      candidateDependencySimulationReverified: false,
      installedStartingStateReverified: false,
      compatibilityProved: false,
      rollbackEscrowComplete: false,
      recoveryReady: false,
      maintenanceApproved: false,
      rebootApproved: false,
      productionMutation: false,
    },
    reportSha256: "",
  };
  report.reportSha256 = reportDigest(report);
  return report;
}

function runDocker(dockerArguments, options = {}) {
  return execFileSync("docker", dockerArguments, {
    cwd: root,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    timeout: options.timeout ?? 120_000,
  })?.trim();
}

function confirmContainerAbsent(containerName) {
  try {
    runDocker(["container", "inspect", containerName], { capture: true });
  } catch (error) {
    const stderr = String(error?.stderr ?? "");
    if (error?.status === 1 && /No such (?:object|container)/iu.test(stderr)) {
      return true;
    }
    throw error;
  }
  fail("disposable container remained after the canary");
}

function requireExactCiHead() {
  if (
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.STARFINITI_CANARY_RUNNER !== "github-hosted" ||
    process.env.CI !== "true"
  ) {
    fail(
      "networked execution is restricted to the GitHub-hosted disposable job",
    );
  }
  const commit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const status = execFileSync(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all"],
    { cwd: root, encoding: "utf8" },
  ).trim();
  if (
    !/^[0-9a-f]{40}$/u.test(commit) ||
    process.env.GITHUB_SHA !== commit ||
    status !== ""
  ) {
    fail("networked execution requires a clean exact GitHub commit");
  }
  return commit;
}

function stageVerifier(stageDirectory) {
  for (const source of verifierFiles) {
    const bytes = readStableBytes(source, 128 * 1024, relative(root, source));
    const destination = join(
      stageDirectory,
      source.endsWith(".sh") ? "verify.sh" : "verify.py",
    );
    copyFileSync(source, destination, constants.COPYFILE_EXCL);
    chmodSync(destination, source.endsWith(".sh") ? 0o500 : 0o400);
    const copied = readStableBytes(destination, 128 * 1024, "staged verifier");
    if (sha256(copied) !== sha256(bytes)) fail("staged verifier bytes differ");
  }
}

function execute(args) {
  const planPath = resolve(args.plan);
  if (planPath !== resolve(defaultPlan)) {
    fail("only the repository Proxmox package canary plan may be executed");
  }
  const commit = requireExactCiHead();
  const outputPath = safeOutputPath(args.out);
  const outputParent = dirname(outputPath);
  mkdirSync(outputParent, { recursive: true });
  if (resolve(realpathSync(outputParent)) !== resolve(outputParent)) {
    fail("output parent must not traverse a symbolic link");
  }
  const plan = YAML.parse(
    readStableBytes(planPath, 256 * 1024, "canary plan").toString("utf8"),
  );
  const validated = validateCanaryPlan(plan);
  const workRoot = mkdtempSync(join(outputParent, ".package-canary-"));
  if (
    !resolve(workRoot).startsWith(
      `${resolve(outputParent)}${process.platform === "win32" ? "\\" : "/"}`,
    )
  ) {
    fail("work directory escaped the bounded output parent");
  }
  const stageDirectory = join(workRoot, "stage");
  const containerOutput = join(workRoot, "output");
  mkdirSync(stageDirectory);
  mkdirSync(containerOutput);
  const manifestPath = join(stageDirectory, "manifest.tsv");
  const factsPath = join(containerOutput, "facts.tsv");
  const containerName = `starfiniti-proxmox-packages-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  let teardownPassed = false;
  let facts;
  try {
    stageVerifier(stageDirectory);
    writeFileSync(manifestPath, manifestText(plan, validated.candidate), {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    runDocker(["pull", plan.baseImage], { timeout: 600_000 });
    runDocker(
      [
        "run",
        "--rm",
        "--name",
        containerName,
        "--label",
        "com.starfiniti.disposable=true",
        "--label",
        "com.starfiniti.purpose=proxmox-package-provenance",
        "--network",
        "bridge",
        "--security-opt",
        "no-new-privileges",
        "--pids-limit",
        "256",
        "--memory",
        "1g",
        "--cpus",
        "2",
        "--tmpfs",
        `/tmp:rw,nosuid,nodev,size=${plan.execution.maximumTransientBytes}`,
        "--mount",
        `type=bind,src=${stageDirectory},dst=/workspace,readonly`,
        "--mount",
        `type=bind,src=${containerOutput},dst=/output`,
        plan.baseImage,
        "sh",
        "/workspace/verify.sh",
      ],
      { timeout: plan.execution.maximumDurationSeconds * 1000 },
    );
    teardownPassed = confirmContainerAbsent(containerName);
    const factsBytes = readStableBytes(factsPath, 128 * 1024, "canary facts");
    facts = parseFacts(factsBytes.toString("utf8"), plan, validated.candidate);
    const retained = execFileSync(
      process.execPath,
      [
        "-e",
        "const fs=require('node:fs'),p=process.argv[1];for(const e of fs.readdirSync(p,{recursive:true,withFileTypes:true})){if(e.isFile()&&e.name.endsWith('.deb'))process.exit(1)}",
        workRoot,
      ],
      { encoding: "utf8" },
    );
    if (retained !== "") fail("unexpected retained-package probe output");
  } finally {
    try {
      runDocker(["rm", "--force", containerName], { capture: true });
    } catch {
      // Expected after --rm; a still-running exact random container is removed.
    }
    const resolvedWork = resolve(workRoot);
    const resolvedParent = resolve(outputParent);
    if (
      resolvedWork.startsWith(
        `${resolvedParent}${process.platform === "win32" ? "\\" : "/"}`,
      )
    ) {
      rmSync(resolvedWork, { recursive: true, force: true });
    }
  }
  if (!teardownPassed || !facts || existsSync(workRoot)) {
    fail("canary teardown or facts are incomplete");
  }
  const generatedAt = new Date().toISOString().replace(/\.\d{3}Z$/u, "Z");
  const report = buildReport({
    plan,
    facts,
    commit,
    generatedAt,
    teardownPassed,
  });
  validateCanaryReport(report, plan, { expectedCommit: commit });
  writeReport(outputPath, report);
  process.stdout.write(
    `Verified ${report.summary.packageCount} exact packages (${report.summary.packageBytes} bytes) through ${report.summary.repositoryCount} signed repositories; retained bytes and production mutation are false.\n`,
  );
}

function selfTest() {
  const plan = YAML.parse(readFileSync(defaultPlan, "utf8"));
  const validated = validateCanaryPlan(plan);
  const manifest = manifestText(plan, validated.candidate);
  assert.equal(manifest.trimEnd().split("\n").length, 18);
  const reportDirectory = mkdtempSync(
    join(tmpdir(), "starfiniti-proxmox-report-"),
  );
  try {
    const reportPath = join(reportDirectory, "report.json");
    writeReport(reportPath, { status: "verified" });
    assert.deepEqual(
      JSON.parse(readStableBytes(reportPath, 1024, "self-test report")),
      { status: "verified" },
    );
    assert.throws(() => writeReport(reportPath, { status: "overwritten" }));
  } finally {
    rmSync(reportDirectory, { recursive: true, force: true });
  }
  const signer = "A".repeat(40);
  const rows = [
    ...plan.repositories.map((repository) =>
      [
        "repository",
        repository.id,
        repository.observationInReleaseSha256,
        repository.observationPackagesSha256,
        signer,
        "true",
        "true",
        "true",
        "true",
      ].join("\t"),
    ),
    ...validated.candidate.repairSet.packages.map((item) =>
      [
        "package",
        item.id,
        item.candidateVersion,
        item.architecture,
        item.size,
        item.sha256,
        "true",
        "true",
        "true",
        "false",
      ].join("\t"),
    ),
    [
      "summary",
      "starfiniti.proxmox-security-package-canary-facts.v1",
      "1".repeat(64),
      plan.trustAnchors.proxmox.sha256,
      plan.trustAnchors.proxmox.releaseFingerprint,
      "5",
      "12",
      "165341024",
      "2".repeat(64),
      "2".repeat(64),
      "false",
      "false",
    ].join("\t"),
  ];
  const fixture = `${rows.join("\n")}\n`;
  parseFacts(fixture, plan, validated.candidate);
  const cases = [
    (value) => value.slice(1),
    (value) => value.with(0, value[0].replace("repository", "forged")),
    (value) =>
      value.with(
        0,
        value[0].replace(
          "\ttrue\ttrue\ttrue\ttrue",
          "\tfalse\ttrue\ttrue\ttrue",
        ),
      ),
    (value) =>
      value.with(
        5,
        value[5].replace(
          "\ttrue\ttrue\ttrue\tfalse",
          "\ttrue\tfalse\ttrue\tfalse",
        ),
      ),
    (value) =>
      value.with(17, value[17].replace("\tfalse\tfalse", "\ttrue\tfalse")),
  ];
  for (const mutate of cases) {
    assert.throws(() =>
      parseFacts(`${mutate(rows).join("\n")}\n`, plan, validated.candidate),
    );
  }
  process.stdout.write(
    `Validated the network-free Proxmox canary controller boundary, exclusive report writes, and ${cases.length} corrupt fact streams.\n`,
  );
}

const args = parseArguments(process.argv.slice(2));
if (args.selfTest) selfTest();
else execute(args);
