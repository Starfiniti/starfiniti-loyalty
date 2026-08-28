import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

import {
  planDigest,
  validateTransportPlan,
} from "./validate-rsync-transport-plan.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const defaultPlan = join(
  root,
  "infrastructure/testing/recovery-transport/plan.yaml",
);
const dockerfile = join(
  root,
  "infrastructure/testing/recovery-transport/Dockerfile",
);
const safeOutputPattern =
  /^dist\/recovery-transport\/[a-z0-9][a-z0-9._-]{1,79}\.json$/u;

function fail(message) {
  throw new Error(`Recovery transport canary failed: ${message}`);
}

function run(args, options = {}) {
  return execFileSync("docker", args, {
    cwd: root,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    timeout: options.timeout ?? 120_000,
  })?.trim();
}

function parseArguments(argv) {
  const parsed = { plan: defaultPlan };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!["--plan", "--out"].includes(argument))
      fail(`unknown option ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) fail(`${argument} requires a value`);
    const key = argument.slice(2);
    if (Object.hasOwn(parsed, key) && key !== "plan")
      fail(`${argument} was provided twice`);
    parsed[key] = value;
    index += 1;
  }
  if (!parsed.out) fail("--out is required");
  return parsed;
}

function safeOutputPath(value) {
  const normalized = value.replaceAll("\\", "/");
  if (isAbsolute(value) || !safeOutputPattern.test(normalized)) {
    fail("output must be a bounded JSON path under dist/recovery-transport");
  }
  return resolve(root, normalized);
}

function buildArgs(endpoint, plan, tag) {
  const dependency = endpoint.package.dependencies[0];
  const values = {
    BASE_IMAGE: endpoint.baseImage,
    EXPECTED_OS_ID: endpoint.os.id,
    EXPECTED_OS_VERSION: endpoint.os.versionId,
    EXPECTED_ARCHITECTURE: plan.architecture,
    PACKAGE_NAME: endpoint.package.name,
    PACKAGE_VERSION: endpoint.package.version,
    PACKAGE_AUTHORITY: endpoint.package.authority,
    PACKAGE_REPOSITORY_URL: endpoint.package.repositoryUrl,
    PACKAGE_SUITE: endpoint.package.suite,
    PACKAGE_URL: endpoint.package.url,
    PACKAGE_SHA256: endpoint.package.sha256,
    SIGNING_FINGERPRINT: endpoint.package.signingFingerprint,
    DEPENDENCY_NAME: dependency?.name ?? "",
    DEPENDENCY_VERSION: dependency?.version ?? "",
    DEPENDENCY_SHA256: dependency?.sha256 ?? "",
    MINIMUM_VERSION: plan.minimumVersion,
  };
  const args = ["build", "--file", dockerfile, "--tag", tag];
  for (const [key, value] of Object.entries(values)) {
    args.push("--build-arg", `${key}=${value}`);
  }
  args.push(dirname(dockerfile));
  return args;
}

function inspectEndpoint(container, endpoint) {
  const output = run(
    [
      "exec",
      container,
      "sh",
      "-ec",
      "printf 'version='; dpkg-query --show --showformat='${Version}' rsync; printf '\\nrsyncSha256='; sha256sum /usr/bin/rsync | cut -d' ' -f1; printf '\\nrrsyncSha256='; sha256sum /usr/bin/rrsync | cut -d' ' -f1; printf '\\nversionLine='; rsync --version | sed -n '1p'; printf '\\nconfined='; grep -Fq -- \"rsync_opts.append('--confine-root=' + os.getcwd())\" /usr/bin/rrsync && printf true; printf '\\npackageVerified='; test -z \"$(dpkg --verify rsync)\" && printf true; printf '\\n'",
    ],
    { capture: true },
  );
  const facts = Object.fromEntries(
    output.split("\n").map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    }),
  );
  const protocol = facts.versionLine.match(/protocol version (\d+)$/u)?.[1];
  if (
    facts.version !== endpoint.package.version ||
    !/^[0-9a-f]{64}$/u.test(facts.rsyncSha256) ||
    !/^[0-9a-f]{64}$/u.test(facts.rrsyncSha256) ||
    !facts.versionLine.startsWith("rsync  version 3.5.0") ||
    protocol !== "32" ||
    facts.confined !== "true" ||
    facts.packageVerified !== "true"
  ) {
    fail(`${endpoint.id} runtime facts are invalid`);
  }
  facts.protocol = Number(protocol);
  facts.dependencies = endpoint.package.dependencies.map((dependency) => {
    const installedVersion = run(
      [
        "exec",
        container,
        "dpkg-query",
        "--show",
        "--showformat=${Version}",
        dependency.name,
      ],
      { capture: true },
    );
    if (installedVersion !== dependency.version) {
      fail(`${endpoint.id} dependency ${dependency.name} is invalid`);
    }
    return {
      name: dependency.name,
      version: installedVersion,
      packageSha256: dependency.sha256,
    };
  });
  return facts;
}

function main() {
  const args = parseArguments(process.argv.slice(2));
  const outputPath = safeOutputPath(args.out);
  const planPath = resolve(args.plan);
  if (planPath !== resolve(defaultPlan)) {
    fail("only the repository recovery transport plan may be executed");
  }
  mkdirSync(dirname(outputPath), { recursive: true });
  if (
    resolve(realpathSync(dirname(outputPath))) !== resolve(dirname(outputPath))
  ) {
    fail("output parent must not traverse a symbolic link");
  }
  rmSync(outputPath, { force: true });
  const plan = validateTransportPlan(
    YAML.parse(readFileSync(planPath, "utf8")),
  );
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const network = `starfiniti-rsync-${suffix}`;
  const hostName = `starfiniti-rsync-host-${suffix}`;
  const guestName = `starfiniti-rsync-guest-${suffix}`;
  const hostTag = `starfiniti-rsync-host:${suffix}`;
  const guestTag = `starfiniti-rsync-guest:${suffix}`;
  const host = plan.endpoints.find(
    (endpoint) => endpoint.id === "proxmox-host",
  );
  const guest = plan.endpoints.find(
    (endpoint) => endpoint.id === "database-guest",
  );
  const created = { network: false, host: false, guest: false };
  let teardownPassed = false;
  try {
    run(buildArgs(host, plan, hostTag), { timeout: 600_000 });
    run(buildArgs(guest, plan, guestTag), { timeout: 600_000 });
    run(["network", "create", "--internal", network]);
    created.network = true;
    const internal = run(
      ["network", "inspect", "--format", "{{.Internal}}", network],
      { capture: true },
    );
    if (internal !== "true") fail("canary network is not internal");
    run([
      "run",
      "--detach",
      "--name",
      guestName,
      "--network",
      network,
      "--network-alias",
      "database-guest",
      "--label",
      "com.starfiniti.disposable=true",
      guestTag,
      "sh",
      "-ec",
      "mkdir -p /tmp/recovery; printf 'base-proof\\n' > /tmp/recovery/base; printf 'wal-proof\\n' > /tmp/recovery/wal; printf '[recovery]\\npath = /tmp/recovery\\nread only = true\\nuse chroot = no\\nlist = true\\n' > /tmp/rsyncd.conf; exec rsync --daemon --no-detach --config=/tmp/rsyncd.conf",
    ]);
    created.guest = true;
    run([
      "run",
      "--detach",
      "--name",
      hostName,
      "--network",
      network,
      "--label",
      "com.starfiniti.disposable=true",
      hostTag,
    ]);
    created.host = true;
    for (const container of [hostName, guestName]) {
      const ports = JSON.parse(
        run(
          ["inspect", "--format", "{{json .NetworkSettings.Ports}}", container],
          { capture: true },
        ),
      );
      const networks = Object.keys(
        JSON.parse(
          run(
            [
              "inspect",
              "--format",
              "{{json .NetworkSettings.Networks}}",
              container,
            ],
            { capture: true },
          ),
        ),
      );
      if (
        Object.values(ports).some(
          (bindings) => Array.isArray(bindings) && bindings.length > 0,
        ) ||
        networks.length !== 1 ||
        networks[0] !== network
      ) {
        fail(`${container} escaped its internal no-port network boundary`);
      }
    }
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        run(
          [
            "exec",
            hostName,
            "rsync",
            "--list-only",
            "rsync://database-guest/recovery/",
          ],
          { capture: true },
        );
        ready = true;
        break;
      } catch {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
      }
    }
    if (!ready) fail("guest sender did not become ready");
    run([
      "exec",
      hostName,
      "sh",
      "-ec",
      `mkdir -p /tmp/received && rsync --archive --checksum rsync://database-guest/recovery/ /tmp/received/ && test "$(cat /tmp/received/base)" = base-proof && test "$(cat /tmp/received/wal)" = wal-proof && test "$(find /tmp/received -type f | wc -l)" -eq 2 && test "$(du -sb /tmp/received | cut -f1)" -le ${plan.network.maximumBytes}`,
    ]);
    const transferFacts = Object.fromEntries(
      run(
        [
          "exec",
          hostName,
          "sh",
          "-ec",
          'printf \'files=%s\\nbytes=%s\\n\' "$(find /tmp/received -type f | wc -l)" "$(du -sb /tmp/received | cut -f1)"',
        ],
        { capture: true },
      )
        .split("\n")
        .map((line) => line.split("=")),
    );
    const transferredFiles = Number(transferFacts.files);
    const transferredBytes = Number(transferFacts.bytes);
    if (
      transferredFiles !== 2 ||
      transferredFiles > plan.network.maximumFiles ||
      !Number.isSafeInteger(transferredBytes) ||
      transferredBytes < 1 ||
      transferredBytes > plan.network.maximumBytes
    ) {
      fail("observed transfer exceeds the approved file or byte boundary");
    }
    const hostFacts = inspectEndpoint(hostName, host);
    const guestFacts = inspectEndpoint(guestName, guest);
    const payloadDigest = run(
      [
        "exec",
        hostName,
        "sh",
        "-ec",
        "find /tmp/received -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | cut -d' ' -f1",
      ],
      { capture: true },
    );
    if (!/^[0-9a-f]{64}$/u.test(payloadDigest))
      fail("payload digest is invalid");
    const report = {
      schema: "starfiniti.rsync-transport-canary.v1",
      status: "passed",
      observedAt: new Date().toISOString(),
      planSha256: planDigest(plan),
      isolation: { internalNetwork: true, publishedPorts: 0 },
      endpoints: [
        {
          id: host.id,
          role: host.role,
          packageVersion: hostFacts.version,
          packageSha256: host.package.sha256,
          executableSha256: hostFacts.rsyncSha256,
          wrapperSha256: hostFacts.rrsyncSha256,
          dependencies: hostFacts.dependencies,
          confinement: true,
          packageVerified: true,
        },
        {
          id: guest.id,
          role: guest.role,
          packageVersion: guestFacts.version,
          packageSha256: guest.package.sha256,
          executableSha256: guestFacts.rsyncSha256,
          wrapperSha256: guestFacts.rrsyncSha256,
          dependencies: guestFacts.dependencies,
          confinement: true,
          packageVerified: true,
        },
      ],
      transfer: {
        direction: "database-guest-to-proxmox-host",
        protocol: hostFacts.protocol,
        files: transferredFiles,
        bytes: transferredBytes,
        maximumFiles: plan.network.maximumFiles,
        maximumBytes: plan.network.maximumBytes,
        payloadSha256: payloadDigest,
      },
      productionMutation: false,
      teardown: "pending",
    };
    writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
  } finally {
    const cleanup = [];
    for (const [wasCreated, command] of [
      [created.host, ["rm", "--force", hostName]],
      [created.guest, ["rm", "--force", guestName]],
      [created.network, ["network", "rm", network]],
      [true, ["image", "rm", "--force", hostTag, guestTag]],
    ]) {
      if (!wasCreated) continue;
      try {
        run(command);
        cleanup.push(true);
      } catch {
        cleanup.push(false);
      }
    }
    teardownPassed = cleanup.every(Boolean);
    if (outputPath && teardownPassed) {
      try {
        const report = JSON.parse(readFileSync(outputPath, "utf8"));
        report.teardown = "passed";
        writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, {
          encoding: "utf8",
          mode: 0o600,
        });
      } catch {
        // A failed run must not publish a synthetic passing report.
      }
    }
  }
  const report = JSON.parse(readFileSync(outputPath, "utf8"));
  const raw = readFileSync(outputPath);
  const digest = createHash("sha256").update(raw).digest("hex");
  if (report.status !== "passed" || report.teardown !== "passed") {
    fail("completed report is not passing");
  }
  console.log(`Recovery transport canary passed: ${digest}`);
}

main();
