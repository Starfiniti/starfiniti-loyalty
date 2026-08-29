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
  readSync,
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
  validateCanaryReport,
  validateRsyncSourcePlan,
} from "./validate-rsync-source-security-plan.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const context = join(root, "infrastructure/testing/rsync-source-security");
const defaultPlan = join(context, "plan.yaml");
const dockerfile = join(context, "Dockerfile");
const safeOutputPattern =
  /^dist\/rsync-source-security\/[a-z0-9][a-z0-9._-]{1,79}\.json$/u;

function fail(message) {
  throw new Error(`Rsync source security canary failed: ${message}`);
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
        ? error.stderr.replaceAll(/[\r\n]+/gu, " ").slice(0, 600)
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
    fail("output must be a bounded JSON path under dist/rsync-source-security");
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
    const parent = lstatSync(parentIdentity.path);
    if (
      !parent.isDirectory() ||
      parent.dev !== parentIdentity.dev ||
      parent.ino !== parentIdentity.ino
    ) {
      fail("output parent identity changed");
    }
    descriptor = openSync(
      outputPath,
      constants.O_RDWR |
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
      !written.isFile() ||
      written.size !== bytes.length ||
      (process.platform !== "win32" && (written.mode & 0o777) !== 0o600)
    ) {
      fail("output permissions or length differ");
    }
    const observed = Buffer.alloc(bytes.length);
    let readOffset = 0;
    while (readOffset < observed.length) {
      const count = readSync(
        descriptor,
        observed,
        readOffset,
        observed.length - readOffset,
        readOffset,
      );
      if (count === 0) fail("output verification ended early");
      readOffset += count;
    }
    if (!observed.equals(bytes)) fail("output bytes differ after write");
    closeSync(descriptor);
    descriptor = undefined;
    descriptor = openSync(
      outputPath,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    const reopened = fstatSync(descriptor);
    if (
      !reopened.isFile() ||
      reopened.dev !== written.dev ||
      reopened.ino !== written.ino ||
      reopened.size !== bytes.length
    ) {
      fail("output identity changed before verification");
    }
    const reopenedBytes = Buffer.alloc(bytes.length);
    readOffset = 0;
    while (readOffset < reopenedBytes.length) {
      const count = readSync(
        descriptor,
        reopenedBytes,
        readOffset,
        reopenedBytes.length - readOffset,
        readOffset,
      );
      if (count === 0) fail("reopened output verification ended early");
      readOffset += count;
    }
    const reread = fstatSync(descriptor);
    if (
      !reopenedBytes.equals(bytes) ||
      reread.dev !== reopened.dev ||
      reread.ino !== reopened.ino ||
      reread.size !== bytes.length
    ) {
      fail("output bytes or identity changed after publication");
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
    if (error?.code === "EEXIST") {
      fail("output already exists; reports are immutable");
    }
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

function buildArgs(endpointId, plan, imageTag) {
  const installed = plan.installed[endpointId];
  const pinned = plan.candidate.endpoints.find(
    (item) => item.id === endpointId,
  );
  const values = {
    BASE_IMAGE: plan.baseImages[endpointId],
    EXPECTED_OS_ID: installed.os.id,
    EXPECTED_OS_VERSION: installed.os.versionId,
    EXPECTED_ARCHITECTURE: plan.architecture,
    SOURCE_URL: plan.candidate.source.url,
    SOURCE_SHA256: plan.candidate.source.sha256,
    SOURCE_BYTES: plan.candidate.source.bytes,
    SIGNATURE_URL: plan.candidate.source.signatureUrl,
    SIGNATURE_SHA256: plan.candidate.source.signatureSha256,
    RELEASE_KEY_URL: plan.candidate.source.releaseKeyUrl,
    RELEASE_KEY_SHA256: plan.candidate.source.releaseKeySha256,
    SIGNING_FINGERPRINT: plan.candidate.source.signingFingerprint,
    SOURCE_TREE_ROOT: plan.candidate.sourceTree.root,
    SOURCE_TREE_ENTRIES: plan.candidate.sourceTree.entries,
    SOURCE_TREE_FILES: plan.candidate.sourceTree.files,
    SOURCE_TREE_LINKS: plan.candidate.sourceTree.links,
    SOURCE_TREE_BYTES: plan.candidate.sourceTree.bytes,
    SOURCE_TREE_MANIFEST_SHA256: plan.candidate.sourceTree.manifestSha256,
    INSTALL_ROOT: plan.candidate.installRoot,
    CANDIDATE_EXECUTABLE_SHA256: pinned.executableSha256 ?? "",
    CANDIDATE_WRAPPER_SHA256: pinned.wrapperSha256 ?? "",
    CURRENT_PACKAGE_VERSION: installed.package.version,
    CURRENT_PACKAGE_URL: installed.package.url,
    CURRENT_PACKAGE_SHA256: installed.package.sha256,
    EXPECTED_NATIVE_ACL_VERSION: installed.nativeAclVersion,
  };
  const args = ["build", "--file", dockerfile, "--tag", imageTag];
  for (const [key, value] of Object.entries(values)) {
    args.push("--build-arg", `${key}=${value}`);
  }
  args.push(context);
  return args;
}

function containerAbsent(name) {
  return (
    runDocker(
      [
        "container",
        "ls",
        "--all",
        "--quiet",
        "--no-trunc",
        "--filter",
        `name=^/${name}$`,
      ],
      { capture: true },
    ) === ""
  );
}

function networkAbsent(name) {
  return (
    runDocker(
      ["network", "ls", "--quiet", "--no-trunc", "--filter", `name=^${name}$`],
      { capture: true },
    ) === ""
  );
}

function imageAbsent(tag, id) {
  const tagged = runDocker(
    [
      "image",
      "ls",
      "--all",
      "--quiet",
      "--no-trunc",
      "--filter",
      `reference=${tag}`,
    ],
    { capture: true },
  );
  const all = runDocker(["image", "ls", "--all", "--quiet", "--no-trunc"], {
    capture: true,
  })
    .split("\n")
    .filter(Boolean);
  return tagged === "" && (!id || !all.includes(id));
}

function sameMembers(actual, expected) {
  if (!Array.isArray(actual) || actual.length !== expected.length) return false;
  const left = [...actual].sort();
  const right = [...expected].sort();
  return left.every((value, index) => value === right[index]);
}

function canonicalCapability(value) {
  if (typeof value !== "string") return null;
  const upper = value.toUpperCase();
  if (upper === "ALL") return upper;
  const name = upper.startsWith("CAP_") ? upper.slice(4) : upper;
  return /^[A-Z0-9_]+$/u.test(name) ? `CAP_${name}` : null;
}

function sameCapabilities(actual, expected) {
  if (!Array.isArray(actual) || actual.length !== expected.length) return false;
  const left = actual.map(canonicalCapability);
  const right = expected.map(canonicalCapability);
  return (
    !left.includes(null) && !right.includes(null) && sameMembers(left, right)
  );
}

function parseFailureStage(logs, role) {
  const matches = [
    ...logs.matchAll(
      new RegExp(
        `(?:^|\\n)starfiniti-rsync-source-${role}-stage:([a-z-]+)(?:\\n|$)`,
        "gu",
      ),
    ),
  ];
  const stage = matches.at(-1)?.[1];
  const allowed =
    role === "host"
      ? new Set([
          "preflight",
          "forced-command-negative",
          "readiness",
          "current-pair",
          "candidate-pair",
          "payload",
          "facts",
          "report",
        ])
      : new Set(["preflight", "source", "config", "daemon"]);
  return allowed.has(stage) ? stage : "unclassified";
}

function failureStage(container, role) {
  return parseFailureStage(
    runDocker(["logs", container], { capture: true }),
    role,
  );
}

function inspectIsolation(container, expected) {
  const details = JSON.parse(
    runDocker(["inspect", "--format", "{{json .}}", container], {
      capture: true,
    }),
  );
  const host = details.HostConfig;
  const ports = details.NetworkSettings.Ports ?? {};
  const portBindings = host.PortBindings ?? {};
  const networks = Object.keys(details.NetworkSettings.Networks ?? {});
  const tmpfs = Object.keys(host.Tmpfs ?? {});
  const labels = details.Config.Labels ?? {};
  const controls = [
    [
      "network-port-bindings",
      !Object.values(ports).some(
        (bindings) => Array.isArray(bindings) && bindings.length > 0,
      ),
    ],
    [
      "host-port-bindings",
      !Object.values(portBindings).some(
        (bindings) => Array.isArray(bindings) && bindings.length > 0,
      ),
    ],
    ["single-internal-network", sameMembers(networks, [expected.network])],
    ["network-mode", host.NetworkMode === expected.network],
    ["unprivileged-container", host.Privileged === false],
    ["read-only-root", host.ReadonlyRootfs === true],
    ["manual-lifecycle", host.AutoRemove === false],
    ["no-restart", host.RestartPolicy?.Name === "no"],
    ["cap-drop", sameCapabilities(host.CapDrop, ["ALL"])],
    ["cap-add", sameCapabilities(host.CapAdd ?? [], [])],
    [
      "no-new-privileges",
      sameMembers(host.SecurityOpt, ["no-new-privileges:true"]),
    ],
    ["pid-limit", host.PidsLimit === expected.pidsLimit],
    ["memory-limit", host.Memory === 268435456],
    ["cpu-limit", host.NanoCpus === 1_000_000_000],
    ["runtime-user", details.Config.User === "65532:65532"],
    [
      "entrypoint",
      JSON.stringify(details.Config.Entrypoint) ===
        JSON.stringify([expected.entrypoint]),
    ],
    ["tmpfs-set", sameMembers(tmpfs, ["/tmp", "/state"])],
    ["no-volume-or-bind-mount", (details.Mounts ?? []).length === 0],
    ["no-bind-mount", (host.Binds ?? []).length === 0],
    ["disposable-label", labels["com.starfiniti.disposable"] === "true"],
    ["purpose-label", labels["com.starfiniti.purpose"] === expected.purpose],
  ];
  const failed = controls.filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length > 0) {
    fail(
      `${container} differs from its isolated runtime contract: ${failed.join(",")}`,
    );
  }
}

function main() {
  const args = parseArguments(process.argv.slice(2));
  const planPath = resolve(args.plan);
  if (planPath !== resolve(defaultPlan)) {
    fail("only the repository rsync source security plan may be executed");
  }
  const plan = validateRsyncSourcePlan(
    YAML.parse(readFileSync(planPath, "utf8")),
  );
  if (args.selfTest) {
    assert.match(planDigest(plan), /^[0-9a-f]{64}$/u);
    assert.throws(() => parseArguments(["--unknown"]));
    assert.throws(() => parseArguments(["--out", "a.json", "--out", "b.json"]));
    assert.throws(() => safeOutputPath("../report.json"));
    assert.equal(sameCapabilities(["CAP_CHOWN"], ["CHOWN"]), true);
    assert.equal(sameCapabilities(["CAP_SYS_ADMIN"], []), false);
    assert.equal(
      parseFailureStage(
        "starfiniti-rsync-source-host-stage:candidate-pair",
        "host",
      ),
      "candidate-pair",
    );
    assert.equal(parseFailureStage("secret=value", "guest"), "unclassified");
    console.log("Rsync source security runner self-test passed.");
    return;
  }

  const outputPath = safeOutputPath(args.out);
  const parentIdentity = ensureOutputParent(outputPath);
  if (existsSync(outputPath))
    fail("output already exists; reports are immutable");

  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const network = `starfiniti-rsync-source-${suffix}`;
  const hostName = `starfiniti-rsync-source-host-${suffix}`;
  const guestName = `starfiniti-rsync-source-guest-${suffix}`;
  const hostTag = `starfiniti-rsync-source-host:${suffix}`;
  const guestTag = `starfiniti-rsync-source-guest:${suffix}`;
  const created = {
    network: false,
    host: false,
    guest: false,
    hostImage: false,
    guestImage: false,
  };
  const cleanupErrors = [];
  let hostImageId;
  let guestImageId;
  let report;
  if (
    !containerAbsent(hostName) ||
    !containerAbsent(guestName) ||
    !networkAbsent(network) ||
    !imageAbsent(hostTag) ||
    !imageAbsent(guestTag)
  ) {
    fail("generated Docker resource identity already exists");
  }

  try {
    runDocker(buildArgs("proxmox-host", plan, hostTag), {
      timeout: 600_000,
    });
    created.hostImage = true;
    hostImageId = runDocker(
      ["image", "inspect", "--format", "{{.Id}}", hostTag],
      { capture: true },
    );
    if (!/^sha256:[0-9a-f]{64}$/u.test(hostImageId)) {
      fail("host image ID differs");
    }
    runDocker(buildArgs("database-guest", plan, guestTag), {
      timeout: 600_000,
    });
    created.guestImage = true;
    guestImageId = runDocker(
      ["image", "inspect", "--format", "{{.Id}}", guestTag],
      { capture: true },
    );
    if (!/^sha256:[0-9a-f]{64}$/u.test(guestImageId)) {
      fail("guest image ID differs");
    }
    runDocker(["network", "create", "--internal", network]);
    created.network = true;
    if (
      runDocker(["network", "inspect", "--format", "{{.Internal}}", network], {
        capture: true,
      }) !== "true"
    ) {
      fail("canary network is not internal");
    }

    runDocker([
      "run",
      "--detach",
      "--name",
      guestName,
      "--network",
      network,
      "--network-alias",
      "database-guest",
      "--entrypoint",
      "/usr/local/bin/starfiniti-rsync-source-guest",
      "--read-only",
      "--user",
      "65532:65532",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges:true",
      "--pids-limit",
      "64",
      "--memory",
      "268435456",
      "--cpus",
      "1",
      "--tmpfs",
      "/tmp:rw,nosuid,nodev,noexec,size=8m,uid=65532,gid=65532,mode=700",
      "--tmpfs",
      "/state:rw,nosuid,nodev,noexec,size=8m,uid=65532,gid=65532,mode=700",
      "--label",
      "com.starfiniti.disposable=true",
      "--label",
      "com.starfiniti.purpose=rsync-source-security-guest",
      guestTag,
    ]);
    created.guest = true;
    inspectIsolation(guestName, {
      network,
      entrypoint: "/usr/local/bin/starfiniti-rsync-source-guest",
      pidsLimit: 64,
      purpose: "rsync-source-security-guest",
    });

    runDocker(
      [
        "create",
        "--name",
        hostName,
        "--network",
        network,
        "--entrypoint",
        "/usr/local/bin/starfiniti-rsync-source-host",
        "--read-only",
        "--user",
        "65532:65532",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges:true",
        "--pids-limit",
        "64",
        "--memory",
        "268435456",
        "--cpus",
        "1",
        "--tmpfs",
        "/tmp:rw,nosuid,nodev,noexec,size=8m,uid=65532,gid=65532,mode=700",
        "--tmpfs",
        "/state:rw,nosuid,nodev,noexec,size=8m,uid=65532,gid=65532,mode=700",
        "--label",
        "com.starfiniti.disposable=true",
        "--label",
        "com.starfiniti.purpose=rsync-source-security-host",
        hostTag,
      ],
      { capture: true },
    );
    created.host = true;
    inspectIsolation(hostName, {
      network,
      entrypoint: "/usr/local/bin/starfiniti-rsync-source-host",
      pidsLimit: 64,
      purpose: "rsync-source-security-host",
    });
    runDocker(["start", hostName]);
    const exitCode = Number(runDocker(["wait", hostName], { capture: true }));
    if (exitCode !== 0) {
      fail(
        `host canary container exited unsuccessfully at ${failureStage(hostName, "host")}`,
      );
    }
    const raw = runDocker(["logs", hostName], { capture: true });
    if (
      Buffer.byteLength(raw, "utf8") > plan.compatibility.maximumOutputBytes
    ) {
      fail("canary output exceeds the approved bound");
    }
    report = validateCanaryReport(JSON.parse(raw), plan);
  } finally {
    for (const [wasCreated, command] of [
      [created.host, ["rm", "--force", hostName]],
      [created.guest, ["rm", "--force", guestName]],
      [created.network, ["network", "rm", network]],
      [created.hostImage, ["image", "rm", "--force", hostTag]],
      [created.guestImage, ["image", "rm", "--force", guestTag]],
    ]) {
      if (!wasCreated) continue;
      try {
        runDocker(command);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
  }

  const teardownPassed =
    cleanupErrors.length === 0 &&
    containerAbsent(hostName) &&
    containerAbsent(guestName) &&
    networkAbsent(network) &&
    imageAbsent(hostTag, hostImageId) &&
    imageAbsent(guestTag, guestImageId);
  if (!report || !teardownPassed) {
    fail(
      "passing evidence requires exact container network and image teardown",
    );
  }
  const completed = {
    ...report,
    observedAt: new Date().toISOString(),
    planSha256: planDigest(plan),
    teardown: "passed",
  };
  validateCanaryReport(completed, plan, { completed: true });
  writeReport(outputPath, parentIdentity, completed);
  console.log(`Rsync source security canary passed: ${outputPath}`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  main();
}
