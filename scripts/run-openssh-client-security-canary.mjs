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
  validateCanaryReport,
  validateOpenSshPlan,
} from "./validate-openssh-client-security-plan.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const context = join(root, "infrastructure/testing/openssh-client-security");
const defaultPlan = join(context, "plan.yaml");
const clientDockerfile = join(context, "client.Dockerfile");
const serverDockerfile = join(context, "server.Dockerfile");
const safeOutputPattern =
  /^dist\/openssh-client-security\/[a-z0-9][a-z0-9._-]{1,79}\.json$/u;

function fail(message) {
  throw new Error(`OpenSSH client security canary failed: ${message}`);
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
    fail(
      "output must be a bounded JSON path under dist/openssh-client-security",
    );
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
      !written.isFile() ||
      written.size !== bytes.length ||
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

function buildArgs(dockerfile, imageTag, values) {
  const args = ["build", "--file", dockerfile, "--tag", imageTag];
  for (const [key, value] of Object.entries(values)) {
    args.push("--build-arg", `${key}=${value ?? ""}`);
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

function volumeAbsent(name) {
  return (
    runDocker(["volume", "ls", "--quiet", "--filter", `name=^${name}$`], {
      capture: true,
    }) === ""
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
  const actualSorted = [...actual].sort();
  const expectedSorted = [...expected].sort();
  return actualSorted.every((value, index) => value === expectedSorted[index]);
}

function canonicalCapability(value) {
  if (typeof value !== "string") return null;
  const upper = value.toUpperCase();
  if (upper === "ALL") return upper;
  const name = upper.startsWith("CAP_") ? upper.slice(4) : upper;
  if (!/^[A-Z0-9_]+$/u.test(name)) return null;
  return `CAP_${name}`;
}

function sameCapabilities(actual, expected) {
  if (!Array.isArray(actual) || actual.length !== expected.length) return false;
  const actualCanonical = actual.map(canonicalCapability);
  const expectedCanonical = expected.map(canonicalCapability);
  if (actualCanonical.includes(null) || expectedCanonical.includes(null))
    return false;
  return sameMembers(actualCanonical, expectedCanonical);
}

function parseServerFailureStage(logs) {
  const matches = [
    ...logs.matchAll(
      /(?:^|\n)starfiniti-openssh-server-stage:([a-z-]+)(?:\n|$)/gu,
    ),
  ];
  const stage = matches.at(-1)?.[1];
  const allowed = new Set([
    "state-preflight",
    "runtime-directory",
    "host-key",
    "client-key",
    "key-permissions",
    "authorized-key",
    "known-host",
    "server-config",
    "configuration-validation",
    "server-launch",
    "host-key-readiness",
    "ready-publication",
    "server-wait",
  ]);
  return allowed.has(stage) ? stage : "unclassified";
}

function serverFailureStage(container) {
  return parseServerFailureStage(
    runDocker(["logs", container], { capture: true }),
  );
}

function parseClientFailureStage(logs) {
  const matches = [
    ...logs.matchAll(
      /(?:^|\n)starfiniti-openssh-client-stage:([a-z-]+)(?:\n|$)/gu,
    ),
  ];
  const stage = matches.at(-1)?.[1];
  const allowed = new Set([
    "state-preflight",
    "candidate-version-execution",
    "candidate-version-prefix",
    "candidate-version-format",
    "current-hash",
    "candidate-hash",
    "current-effective-config",
    "candidate-effective-config",
    "current-connection",
    "candidate-connection",
    "report-publication",
  ]);
  return allowed.has(stage) ? stage : "unclassified";
}

function clientFailureStage(container) {
  return parseClientFailureStage(
    runDocker(["logs", container], { capture: true }),
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
  const networks = Object.keys(details.NetworkSettings.Networks ?? {});
  const tmpfs = Object.keys(host.Tmpfs ?? {});
  const stateMounts = (details.Mounts ?? []).filter(
    (mount) => mount.Destination === "/state",
  );
  const labels = details.Config.Labels ?? {};
  const portBindings = host.PortBindings ?? {};
  const health = details.Config.Healthcheck;
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
    ["cap-add", sameCapabilities(host.CapAdd ?? [], expected.capAdd)],
    [
      "no-new-privileges",
      sameMembers(host.SecurityOpt, ["no-new-privileges:true"]),
    ],
    ["pid-limit", host.PidsLimit === expected.pidsLimit],
    ["memory-limit", host.Memory === 268435456],
    ["cpu-limit", host.NanoCpus === 1_000_000_000],
    ["runtime-user", details.Config.User === expected.user],
    [
      "health-command",
      JSON.stringify(health?.Test) === JSON.stringify(expected.health.test),
    ],
    ["health-interval", health?.Interval === expected.health.interval],
    ["health-timeout", health?.Timeout === expected.health.timeout],
    [
      "health-start-period",
      health?.StartPeriod === expected.health.startPeriod,
    ],
    ["health-retries", health?.Retries === expected.health.retries],
    ["tmpfs-set", sameMembers(tmpfs, expected.tmpfs)],
    ["single-state-mount", stateMounts.length === 1],
    ["state-volume-type", stateMounts[0]?.Type === "volume"],
    ["state-volume-name", stateMounts[0]?.Name === expected.volume],
    ["state-volume-direction", stateMounts[0]?.RW === !expected.stateReadOnly],
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
    fail("only the repository OpenSSH client security plan may be executed");
  }
  const plan = validateOpenSshPlan(YAML.parse(readFileSync(planPath, "utf8")));
  if (args.selfTest) {
    assert.match(planDigest(plan), /^[0-9a-f]{64}$/u);
    assert.throws(() => parseArguments(["--unknown"]));
    assert.throws(() => safeOutputPath("../report.json"));
    assert.equal(sameCapabilities(["CAP_CHOWN"], ["CHOWN"]), true);
    assert.equal(sameCapabilities(["cap_chown"], ["CHOWN"]), true);
    assert.equal(
      sameCapabilities(["CAP_CHOWN", "CAP_SETUID"], ["CHOWN"]),
      false,
    );
    assert.equal(sameCapabilities(["CAP_SYS_ADMIN"], ["CHOWN"]), false);
    assert.equal(
      parseServerFailureStage(
        "starfiniti-openssh-server-stage:host-key-readiness",
      ),
      "host-key-readiness",
    );
    assert.equal(parseServerFailureStage("secret=value"), "unclassified");
    assert.equal(
      parseClientFailureStage(
        "starfiniti-openssh-client-stage:candidate-connection",
      ),
      "candidate-connection",
    );
    assert.equal(parseClientFailureStage("secret=value"), "unclassified");
    console.log("OpenSSH client security runner self-test passed.");
    return;
  }

  const outputPath = safeOutputPath(args.out);
  const parentIdentity = ensureOutputParent(outputPath);
  if (existsSync(outputPath))
    fail("output already exists; reports are immutable");

  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const network = `starfiniti-openssh-${suffix}`;
  const volume = `starfiniti-openssh-state-${suffix}`;
  const serverName = `starfiniti-openssh-server-${suffix}`;
  const clientName = `starfiniti-openssh-client-${suffix}`;
  const clientTag = `starfiniti-openssh-client:${suffix}`;
  const serverTag = `starfiniti-openssh-server:${suffix}`;
  const created = {
    network: false,
    volume: false,
    server: false,
    client: false,
    clientImage: false,
    serverImage: false,
  };
  let clientImageId;
  let serverImageId;
  let report;
  const cleanupErrors = [];
  if (
    !containerAbsent(serverName) ||
    !containerAbsent(clientName) ||
    !networkAbsent(network) ||
    !volumeAbsent(volume) ||
    !imageAbsent(clientTag) ||
    !imageAbsent(serverTag)
  ) {
    fail("generated Docker resource identity already exists");
  }
  try {
    runDocker(
      buildArgs(clientDockerfile, clientTag, {
        BASE_IMAGE: plan.baseImages.client,
        EXPECTED_ARCHITECTURE: plan.architecture,
        CANDIDATE_VERSION: plan.candidate.version,
        SOURCE_URL: plan.candidate.source.url,
        SOURCE_SHA256: plan.candidate.source.sha256,
        SOURCE_BYTES: plan.candidate.source.bytes,
        SIGNATURE_URL: plan.candidate.source.signatureUrl,
        SIGNATURE_SHA256: plan.candidate.source.signatureSha256,
        SIGNING_IDENTITY_URL: plan.candidate.source.releaseKeyUrl,
        SIGNING_IDENTITY_SHA256: plan.candidate.source.releaseKeySha256,
        SIGNING_FINGERPRINT: plan.candidate.source.signingFingerprint,
        SOURCE_TREE_ROOT: plan.candidate.sourceTree.root,
        SOURCE_TREE_ENTRIES: plan.candidate.sourceTree.entries,
        SOURCE_TREE_FILES: plan.candidate.sourceTree.files,
        SOURCE_TREE_BYTES: plan.candidate.sourceTree.bytes,
        SOURCE_TREE_MANIFEST_SHA256: plan.candidate.sourceTree.manifestSha256,
        INSTALL_ROOT: plan.candidate.installRoot,
        CANDIDATE_EXECUTABLE_SHA256: plan.candidate.executableSha256 ?? "",
        CURRENT_PACKAGE_VERSION: plan.installed.hostClient.version,
        CURRENT_PACKAGE_URL: plan.installed.hostClient.url,
        CURRENT_PACKAGE_SHA256: plan.installed.hostClient.sha256,
        CURRENT_EXECUTABLE_SHA256: plan.installed.hostClient.executableSha256,
      }),
      { timeout: 600_000 },
    );
    created.clientImage = true;
    clientImageId = runDocker(
      ["image", "inspect", "--format", "{{.Id}}", clientTag],
      { capture: true },
    );
    if (!/^sha256:[0-9a-f]{64}$/u.test(clientImageId)) {
      fail("client image ID differs");
    }
    const serverPackages = Object.fromEntries(
      plan.installed.guestServer.packages.map((item) => [item.name, item]),
    );
    runDocker(
      buildArgs(serverDockerfile, serverTag, {
        BASE_IMAGE: plan.baseImages.server,
        EXPECTED_ARCHITECTURE: plan.architecture,
        PACKAGE_VERSION: plan.installed.guestServer.version,
        CLIENT_URL: serverPackages["openssh-client"].url,
        CLIENT_SHA256: serverPackages["openssh-client"].sha256,
        SERVER_URL: serverPackages["openssh-server"].url,
        SERVER_SHA256: serverPackages["openssh-server"].sha256,
        SFTP_URL: serverPackages["openssh-sftp-server"].url,
        SFTP_SHA256: serverPackages["openssh-sftp-server"].sha256,
        SERVER_EXECUTABLE_SHA256: plan.installed.guestServer.executableSha256,
      }),
      { timeout: 600_000 },
    );
    created.serverImage = true;
    serverImageId = runDocker(
      ["image", "inspect", "--format", "{{.Id}}", serverTag],
      { capture: true },
    );
    if (!/^sha256:[0-9a-f]{64}$/u.test(serverImageId)) {
      fail("server image ID differs");
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
    runDocker(["volume", "create", volume]);
    created.volume = true;
    runDocker([
      "run",
      "--detach",
      "--name",
      serverName,
      "--network",
      network,
      "--network-alias",
      "openssh-server",
      "--user",
      "0:0",
      "--read-only",
      "--cap-drop",
      "ALL",
      "--cap-add",
      "CHOWN",
      "--cap-add",
      "DAC_OVERRIDE",
      "--cap-add",
      "SETGID",
      "--cap-add",
      "SETUID",
      "--cap-add",
      "SYS_CHROOT",
      "--security-opt",
      "no-new-privileges:true",
      "--pids-limit",
      "128",
      "--memory",
      "268435456",
      "--cpus",
      "1",
      "--tmpfs",
      "/tmp:rw,nosuid,nodev,noexec,size=16m",
      "--tmpfs",
      "/run:rw,nosuid,nodev,noexec,size=4m",
      "--mount",
      `type=volume,src=${volume},dst=/state`,
      "--label",
      "com.starfiniti.disposable=true",
      serverTag,
    ]);
    created.server = true;
    inspectIsolation(serverName, {
      network,
      volume,
      user: "0:0",
      capAdd: ["CHOWN", "DAC_OVERRIDE", "SETGID", "SETUID", "SYS_CHROOT"],
      health: {
        test: ["CMD", "/usr/bin/test", "-r", "/state/ready"],
        interval: 5_000_000_000,
        timeout: 2_000_000_000,
        startPeriod: 2_000_000_000,
        retries: 3,
      },
      pidsLimit: 128,
      purpose: "openssh-client-security-server",
      tmpfs: ["/tmp", "/run"],
      stateReadOnly: false,
    });
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        runDocker(["exec", serverName, "test", "-r", "/state/ready"]);
        ready = true;
        break;
      } catch {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
      }
    }
    if (!ready) {
      fail(
        `exact Ubuntu OpenSSH server did not become ready at ${serverFailureStage(serverName)}`,
      );
    }
    runDocker(
      [
        "create",
        "--name",
        clientName,
        "--network",
        network,
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
        "--mount",
        `type=volume,src=${volume},dst=/state,readonly`,
        "--label",
        "com.starfiniti.disposable=true",
        clientTag,
      ],
      { capture: true },
    );
    created.client = true;
    inspectIsolation(clientName, {
      network,
      volume,
      user: "65532:65532",
      capAdd: [],
      health: {
        test: ["CMD", "/opt/starfiniti/openssh/10.5p1/bin/ssh", "-V"],
        interval: 30_000_000_000,
        timeout: 5_000_000_000,
        startPeriod: 5_000_000_000,
        retries: 1,
      },
      pidsLimit: 64,
      purpose: "openssh-client-security-canary",
      tmpfs: ["/tmp"],
      stateReadOnly: true,
    });
    runDocker(["start", clientName]);
    const exitCode = Number(runDocker(["wait", clientName], { capture: true }));
    if (exitCode !== 0) {
      fail(
        `client canary container exited unsuccessfully at ${clientFailureStage(clientName)}`,
      );
    }
    const raw = runDocker(["logs", clientName], { capture: true });
    if (
      Buffer.byteLength(raw, "utf8") > plan.compatibility.maximumOutputBytes
    ) {
      fail("canary output exceeds the approved bound");
    }
    report = validateCanaryReport(JSON.parse(raw), plan);
  } finally {
    for (const [wasCreated, command] of [
      [created.client, ["rm", "--force", clientName]],
      [created.server, ["rm", "--force", serverName]],
      [created.network, ["network", "rm", network]],
      [created.volume, ["volume", "rm", "--force", volume]],
      [created.clientImage, ["image", "rm", "--force", clientTag]],
      [created.serverImage, ["image", "rm", "--force", serverTag]],
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
    containerAbsent(clientName) &&
    containerAbsent(serverName) &&
    networkAbsent(network) &&
    volumeAbsent(volume) &&
    imageAbsent(clientTag, clientImageId) &&
    imageAbsent(serverTag, serverImageId);
  if (!report || !teardownPassed) {
    fail(
      "passing evidence requires exact container network volume and image teardown",
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
  console.log(`OpenSSH client security canary passed: ${outputPath}`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  main();
}
