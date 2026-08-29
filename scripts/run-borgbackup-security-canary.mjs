import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

import {
  planDigest,
  validateBorgPlan,
  validateCanaryReport,
} from "./validate-borgbackup-security-plan.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const defaultPlan = join(
  root,
  "infrastructure/testing/borgbackup-security/plan.yaml",
);
const context = join(root, "infrastructure/testing/borgbackup-security");
const dockerfile = join(context, "Dockerfile");
const safeOutputPattern =
  /^dist\/borgbackup-security\/[a-z0-9][a-z0-9._-]{1,79}\.json$/u;

function fail(message) {
  throw new Error(`BorgBackup security canary failed: ${message}`);
}

function runDocker(args, options = {}) {
  try {
    return execFileSync("docker", args, {
      cwd: root,
      encoding: "utf8",
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
      timeout: options.timeout ?? 120_000,
      windowsHide: true,
    })?.trim();
  } catch (error) {
    const detail =
      typeof error?.stderr === "string"
        ? error.stderr.replaceAll(/[\r\n]+/gu, " ").slice(0, 500)
        : "docker command failed";
    fail(detail);
  }
}

function parseArguments(argv) {
  if (argv.length === 1 && argv[0] === "--self-test") {
    return { selfTest: true, plan: defaultPlan };
  }
  const parsed = { selfTest: false, plan: defaultPlan };
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (!["--plan", "--out"].includes(option)) fail(`unknown option ${option}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) fail(`${option} requires a value`);
    const key = option.slice(2);
    if (
      (key === "out" && parsed.out) ||
      (key === "plan" && parsed.plan !== defaultPlan)
    ) {
      fail(`${option} was provided twice`);
    }
    parsed[key] = value;
    index += 1;
  }
  if (!parsed.out) fail("--out is required");
  return parsed;
}

function safeOutputPath(value) {
  const normalized = value.replaceAll("\\", "/");
  if (isAbsolute(value) || !safeOutputPattern.test(normalized)) {
    fail("output must be a bounded JSON path under dist/borgbackup-security");
  }
  return resolve(root, normalized);
}

function ensureOutputParent(outputPath) {
  const parent = dirname(outputPath);
  mkdirSync(parent, { recursive: true });
  const status = lstatSync(parent);
  if (
    !status.isDirectory() ||
    resolve(realpathSync(parent)) !== resolve(parent)
  ) {
    fail("output parent must be a canonical directory without symbolic links");
  }
  return { path: parent, dev: status.dev, ino: status.ino };
}

function writeReport(outputPath, parentIdentity, report) {
  const bytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`, "utf8");
  let descriptor;
  let identity;
  let complete = false;
  try {
    const parentStatus = lstatSync(parentIdentity.path);
    if (
      !parentStatus.isDirectory() ||
      parentStatus.dev !== parentIdentity.dev ||
      parentStatus.ino !== parentIdentity.ino
    ) {
      fail("output parent identity changed");
    }
    descriptor = openSync(
      outputPath,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    const opened = fstatSync(descriptor);
    if (!opened.isFile()) fail("output is not a regular file");
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
      if (count === 0) fail("output write stopped early");
      offset += count;
    }
    fsyncSync(descriptor);
    const written = fstatSync(descriptor);
    if (
      written.size !== bytes.length ||
      !written.isFile() ||
      (process.platform !== "win32" && (written.mode & 0o777) !== 0o600)
    ) {
      fail("output permissions or length differ");
    }
    closeSync(descriptor);
    descriptor = undefined;
    const pathStatus = lstatSync(outputPath);
    const finalParent = lstatSync(parentIdentity.path);
    if (
      !pathStatus.isFile() ||
      pathStatus.dev !== written.dev ||
      pathStatus.ino !== written.ino ||
      finalParent.dev !== parentIdentity.dev ||
      finalParent.ino !== parentIdentity.ino
    ) {
      fail("output path identity differs after publication");
    }
    complete = true;
  } catch (error) {
    if (error?.code === "EEXIST")
      fail("output already exists; reports are immutable");
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (!complete && identity && existsSync(outputPath)) {
      const status = lstatSync(outputPath);
      if (
        status.isFile() &&
        status.dev === identity.dev &&
        status.ino === identity.ino
      ) {
        unlinkSync(outputPath);
      }
    }
  }
}

function buildArguments(plan, imageTag) {
  const values = {
    BASE_IMAGE: plan.baseImage,
    EXPECTED_ARCHITECTURE: plan.architecture,
    CURRENT_PACKAGE_VERSION: plan.installed.package.version,
    CURRENT_PACKAGE_URL: plan.installed.package.url,
    CURRENT_PACKAGE_SHA256: plan.installed.package.sha256,
    CURRENT_EXECUTABLE_SHA256: plan.installed.package.executableSha256,
    CANDIDATE_VERSION: plan.candidate.version,
    CANDIDATE_URL: plan.candidate.asset.url,
    CANDIDATE_SHA256: plan.candidate.asset.sha256,
    CANDIDATE_BYTES: String(plan.candidate.asset.bytes),
    CANDIDATE_SIGNATURE_URL: plan.candidate.asset.signatureUrl,
    CANDIDATE_SIGNATURE_SHA256: plan.candidate.asset.signatureSha256,
    CANDIDATE_README_URL: plan.candidate.asset.readmeUrl,
    CANDIDATE_README_SHA256: plan.candidate.asset.readmeSha256,
    SIGNING_KEY_URL: plan.candidate.signing.keyserverUrl,
    SIGNING_FINGERPRINT: plan.candidate.signing.primaryFingerprint,
    CANDIDATE_EXECUTABLE_SHA256: plan.candidate.executableSha256,
    CANDIDATE_TREE_ENTRIES: String(plan.candidate.extractedTree.entries),
    CANDIDATE_TREE_FILES: String(plan.candidate.extractedTree.files),
    CANDIDATE_TREE_BYTES: String(plan.candidate.extractedTree.bytes),
    CANDIDATE_TREE_MANIFEST_SHA256: plan.candidate.extractedTree.manifestSha256,
  };
  const args = ["build", "--file", dockerfile, "--tag", imageTag];
  for (const [key, value] of Object.entries(values)) {
    args.push("--build-arg", `${key}=${value}`);
  }
  args.push(context);
  return args;
}

function inspectIsolation(containerName) {
  const [inspection] = JSON.parse(
    runDocker(["inspect", containerName], { capture: true }),
  );
  const publishedPorts = Object.values(
    inspection.HostConfig.PortBindings ?? {},
  ).reduce(
    (count, bindings) =>
      count + (Array.isArray(bindings) ? bindings.length : 0),
    0,
  );
  const security = inspection.HostConfig.SecurityOpt ?? [];
  const isolation = {
    networkMode: inspection.HostConfig.NetworkMode,
    readOnlyRootfs: inspection.HostConfig.ReadonlyRootfs,
    user: inspection.Config.User,
    capDrop: inspection.HostConfig.CapDrop ?? [],
    noNewPrivileges: security.includes("no-new-privileges:true"),
    pidsLimit: inspection.HostConfig.PidsLimit,
    memoryBytes: inspection.HostConfig.Memory,
    nanoCpus: inspection.HostConfig.NanoCpus,
    publishedPorts,
  };
  if (
    isolation.networkMode !== "none" ||
    isolation.readOnlyRootfs !== true ||
    isolation.user !== "65532:65532" ||
    JSON.stringify(isolation.capDrop) !== JSON.stringify(["ALL"]) ||
    isolation.noNewPrivileges !== true ||
    isolation.pidsLimit !== 256 ||
    isolation.memoryBytes !== 1073741824 ||
    isolation.nanoCpus !== 2000000000 ||
    isolation.publishedPorts !== 0 ||
    Object.keys(inspection.Config.ExposedPorts ?? {}).length !== 0
  ) {
    fail("created container differs from the exact isolation contract");
  }
  return isolation;
}

function parseCanaryOutput(output, plan) {
  if (Buffer.byteLength(output, "utf8") > 32 * 1024) {
    fail("canary output exceeds its byte bound");
  }
  let result;
  try {
    result = JSON.parse(output);
  } catch {
    fail("canary output is not one JSON object");
  }
  const expectedKeys = [
    "schema",
    "status",
    "currentVersion",
    "candidateVersion",
    "candidateExecutableSha256",
    "candidateTreeManifestSha256",
    "rollbackPackageSha256",
    "clientServerPairs",
    "archives",
    "files",
    "payloadBytes",
    "networkMode",
    "productionMutation",
  ].sort();
  assert.deepEqual(Object.keys(result).sort(), expectedKeys);
  if (
    result.schema !== "starfiniti.borgbackup-security-canary.v1" ||
    result.status !== "passed" ||
    result.currentVersion !== plan.compatibility.currentClientVersion ||
    result.candidateVersion !== plan.compatibility.candidateClientVersion ||
    result.candidateExecutableSha256 !== plan.candidate.executableSha256 ||
    result.candidateTreeManifestSha256 !==
      plan.candidate.extractedTree.manifestSha256 ||
    result.rollbackPackageSha256 !== plan.installed.package.sha256 ||
    result.clientServerPairs !== 4 ||
    result.archives !== 4 ||
    result.archives > plan.compatibility.maximumArchives ||
    result.files !== 2 ||
    result.files > plan.compatibility.maximumFiles ||
    result.payloadBytes !== 32 ||
    result.payloadBytes > plan.compatibility.maximumPayloadBytes ||
    result.networkMode !== "none" ||
    result.productionMutation !== false
  ) {
    fail("canary output differs from the approved plan");
  }
  return result;
}

function containerAbsent(containerName) {
  return (
    runDocker(
      [
        "container",
        "ls",
        "--all",
        "--quiet",
        "--no-trunc",
        "--filter",
        `name=^/${containerName}$`,
      ],
      { capture: true },
    ) === ""
  );
}

function imageAbsent(imageTag, imageId) {
  const tagged = runDocker(
    [
      "image",
      "ls",
      "--all",
      "--quiet",
      "--no-trunc",
      "--filter",
      `reference=${imageTag}`,
    ],
    { capture: true },
  );
  const allImages = runDocker(
    ["image", "ls", "--all", "--quiet", "--no-trunc"],
    { capture: true },
  )
    .split("\n")
    .filter(Boolean);
  return tagged === "" && (!imageId || !allImages.includes(imageId));
}

function execute(args) {
  const outputPath = safeOutputPath(args.out);
  const parentIdentity = ensureOutputParent(outputPath);
  if (existsSync(outputPath))
    fail("output already exists; reports are immutable");
  const planPath = resolve(args.plan);
  if (planPath !== resolve(defaultPlan)) {
    fail("only the repository BorgBackup security plan may be executed");
  }
  const plan = validateBorgPlan(YAML.parse(readFileSync(planPath, "utf8")));
  const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
  const imageTag = `starfiniti-borg-security:${suffix}`;
  const containerName = `starfiniti-borg-security-${suffix}`;
  if (!containerAbsent(containerName) || !imageAbsent(imageTag)) {
    fail("generated Docker resource name already exists");
  }
  let containerCreated = false;
  let imageCreated = false;
  let imageId;
  let isolation;
  let canary;
  const cleanupErrors = [];
  try {
    runDocker(buildArguments(plan, imageTag), { timeout: 900_000 });
    imageCreated = true;
    imageId = runDocker(["image", "inspect", "--format", "{{.Id}}", imageTag], {
      capture: true,
    });
    if (!/^sha256:[0-9a-f]{64}$/u.test(imageId)) fail("built image ID differs");
    const imageLabels = JSON.parse(
      runDocker(
        ["image", "inspect", "--format", "{{json .Config.Labels}}", imageTag],
        { capture: true },
      ),
    );
    if (
      imageLabels?.["com.starfiniti.disposable"] !== "true" ||
      imageLabels?.["com.starfiniti.purpose"] !== "borgbackup-security-canary"
    ) {
      fail("built image labels differ");
    }
    runDocker([
      "create",
      "--name",
      containerName,
      "--network",
      "none",
      "--read-only",
      "--user",
      "65532:65532",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges:true",
      "--pids-limit",
      "256",
      "--memory",
      "1073741824",
      "--cpus",
      "2",
      "--tmpfs",
      "/work:rw,nosuid,nodev,noexec,size=67108864,uid=65532,gid=65532,mode=0700",
      "--tmpfs",
      "/tmp:rw,nosuid,nodev,noexec,size=16777216,uid=65532,gid=65532,mode=0700",
      "--label",
      "com.starfiniti.disposable=true",
      imageTag,
    ]);
    containerCreated = true;
    isolation = inspectIsolation(containerName);
    const output = runDocker(["start", "--attach", containerName], {
      capture: true,
      timeout: 300_000,
    });
    const exitCode = Number(
      runDocker(["inspect", "--format", "{{.State.ExitCode}}", containerName], {
        capture: true,
      }),
    );
    if (exitCode !== 0) fail("canary container exited unsuccessfully");
    canary = parseCanaryOutput(output, plan);
  } finally {
    for (const [created, command] of [
      [containerCreated, ["rm", "--force", containerName]],
      [imageCreated, ["image", "rm", "--force", imageTag]],
    ]) {
      if (!created) continue;
      try {
        runDocker(command);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
  }
  const teardown = {
    containerRemoved: containerAbsent(containerName),
    imageRemoved: imageAbsent(imageTag, imageId),
  };
  if (
    cleanupErrors.length > 0 ||
    !canary ||
    !teardown.containerRemoved ||
    !teardown.imageRemoved
  ) {
    fail("exact container or image teardown did not complete");
  }
  const report = {
    schema: "starfiniti.borgbackup-security-canary-evidence.v1",
    status: "passed",
    observedAt: new Date().toISOString(),
    planSha256: planDigest(plan),
    imageId,
    candidate: {
      version: plan.candidate.version,
      executableSha256: plan.candidate.executableSha256,
      treeManifestSha256: plan.candidate.extractedTree.manifestSha256,
      signatureVerified: true,
      rawAssetRetained: false,
    },
    rollback: {
      version: plan.compatibility.currentClientVersion,
      packageVersion: plan.installed.package.version,
      packageSha256: plan.installed.package.sha256,
      executableSha256: plan.installed.package.executableSha256,
      packageBytesRetained: false,
    },
    compatibility: {
      pairs: canary.clientServerPairs,
      archives: canary.archives,
      files: canary.files,
      payloadBytes: canary.payloadBytes,
      operations: plan.compatibility.requiredOperations,
    },
    isolation,
    teardown,
    productionMutation: false,
  };
  validateCanaryReport(report, plan);
  writeReport(outputPath, parentIdentity, report);
  console.log(`BorgBackup security canary passed: ${outputPath}`);
}

function selfTest() {
  const plan = validateBorgPlan(YAML.parse(readFileSync(defaultPlan, "utf8")));
  assert.throws(() => parseArguments([]));
  assert.throws(() => parseArguments(["--unknown", "x"]));
  assert.throws(() => parseArguments(["--out", "a", "--out", "b"]));
  assert.throws(() => safeOutputPath("../outside.json"));
  assert.throws(() => safeOutputPath("dist/borgbackup-security/a.txt"));
  assert.equal(
    safeOutputPath("dist/borgbackup-security/self-test.json"),
    resolve(root, "dist/borgbackup-security/self-test.json"),
  );
  const output = JSON.stringify({
    schema: "starfiniti.borgbackup-security-canary.v1",
    status: "passed",
    currentVersion: "1.4.0",
    candidateVersion: "1.4.5",
    candidateExecutableSha256: plan.candidate.executableSha256,
    candidateTreeManifestSha256: plan.candidate.extractedTree.manifestSha256,
    rollbackPackageSha256: plan.installed.package.sha256,
    clientServerPairs: 4,
    archives: 4,
    files: 2,
    payloadBytes: 32,
    networkMode: "none",
    productionMutation: false,
  });
  assert.equal(parseCanaryOutput(output, plan).status, "passed");
  assert.throws(() =>
    parseCanaryOutput(output.replace('"archives":4', '"archives":5'), plan),
  );
  console.log("BorgBackup security runner self-test passed.");
}

const args = parseArguments(process.argv.slice(2));
if (args.selfTest) selfTest();
else execute(args);
