import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import YAML from "yaml";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const sha256Pattern = /^[0-9a-f]{64}$/u;
const serviceTokenPattern = /^sflt_v1_[0-9a-f]{32}_[A-Za-z0-9_-]{43}$/u;
const safeFilePattern = /^[a-z0-9][a-z0-9._-]{0,99}$/u;
const adapterNames = new Set([
  "readiness",
  "authenticated_get",
  "service_customer_upsert",
  "woocommerce_order_upsert",
]);

function fail(message) {
  throw new Error(`Capacity runner failed: ${message}`);
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalJson(value[key])]),
    );
  }
  return value;
}

export function documentDigest(value) {
  return digest(JSON.stringify(canonicalJson(value)));
}

export function repositoryState({ allowDirty = false } = {}) {
  let commit;
  let dirty;
  try {
    commit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    dirty =
      execFileSync(
        "git",
        ["status", "--porcelain", "--untracked-files=normal"],
        {
          cwd: root,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        },
      ).trim().length > 0;
  } catch {
    fail("repository commit and worktree state are unavailable");
  }
  if (!/^[0-9a-f]{40}$/u.test(commit)) fail("repository commit is not exact");
  if (dirty && !allowDirty)
    fail("capacity runs require a clean repository worktree");
  return { commit, dirty };
}

function parseArguments(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--self-test") {
      parsed.selfTest = true;
      continue;
    }
    if (!argument?.startsWith("--")) fail("unexpected command argument");
    const key = argument.slice(2);
    if (
      ![
        "config",
        "origin-file",
        "credential-dir",
        "approval-file",
        "out",
      ].includes(key)
    ) {
      fail(`unknown option --${key}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) fail(`--${key} requires a value`);
    if (Object.hasOwn(parsed, key)) fail(`--${key} was provided twice`);
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}

export function readRegularFile(path, label, maximumBytes, ownerOnly = false) {
  if (!isAbsolute(path)) fail(`${label} path must be absolute`);
  if (ownerOnly) {
    const parent = dirname(path);
    let parentStatus;
    try {
      parentStatus = lstatSync(parent);
      if (
        !parentStatus.isDirectory() ||
        realpathSync(parent) !== resolve(parent) ||
        (process.platform !== "win32" &&
          ((parentStatus.mode & 0o022) !== 0 ||
            (typeof process.getuid === "function" &&
              parentStatus.uid !== process.getuid())))
      ) {
        fail(`${label} parent must be private and stable`);
      }
    } catch {
      fail(`${label} parent is unreadable`);
    }
  }
  let descriptor;
  let initial;
  let value;
  try {
    descriptor = openSync(
      path,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    initial = fstatSync(descriptor);
    const link = lstatSync(path);
    if (
      !initial.isFile() ||
      !link.isFile() ||
      initial.dev !== link.dev ||
      initial.ino !== link.ino ||
      initial.size < 1 ||
      initial.size > maximumBytes
    ) {
      fail(`${label} must be a bounded stable file`);
    }
    const raw = Buffer.alloc(initial.size);
    let offset = 0;
    while (offset < raw.length) {
      const count = readSync(
        descriptor,
        raw,
        offset,
        raw.length - offset,
        offset,
      );
      if (count === 0) fail(`${label} changed while reading`);
      offset += count;
    }
    const final = fstatSync(descriptor);
    const finalLink = lstatSync(path);
    if (
      final.dev !== initial.dev ||
      final.ino !== initial.ino ||
      final.size !== initial.size ||
      final.mtimeMs !== initial.mtimeMs ||
      final.ctimeMs !== initial.ctimeMs ||
      finalLink.dev !== initial.dev ||
      finalLink.ino !== initial.ino
    ) {
      fail(`${label} changed while reading`);
    }
    value = raw.toString("utf8");
  } catch {
    fail(`${label} file is unreadable`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  if (Buffer.byteLength(value, "utf8") !== initial.size) {
    fail(`${label} must contain valid UTF-8 text`);
  }
  if (
    ownerOnly &&
    process.platform !== "win32" &&
    ((initial.mode & 0o077) !== 0 ||
      (typeof process.getuid === "function" &&
        initial.uid !== process.getuid()))
  ) {
    fail(`${label} must be caller-owned without group or other access`);
  }
  return value;
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

function positiveNumber(value, label, maximum) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    fail(`${label} must be a positive number`);
  }
  if (value > maximum) fail(`${label} exceeds its safety bound`);
  return value;
}

export function validateWorkload(
  workload,
  { minimumMeasuredRequests = 500 } = {},
) {
  exactKeys(
    workload,
    ["schema", "profile", "status", "driver", "phases", "scenarios"],
    "workload",
  );
  if (workload.schema !== "starfiniti.capacity-workload.v1") {
    fail("unexpected workload schema");
  }
  if (workload.status !== "candidate")
    fail("workload must use the immutable candidate status");
  if (!/^[a-z][a-z0-9-]{2,79}$/u.test(workload.profile))
    fail("invalid workload profile");
  exactKeys(
    workload.driver,
    [
      "implementation",
      "maximumEventLoopP95Ms",
      "maximumCpuPercent",
      "maximumMemoryMiB",
    ],
    "driver",
  );
  if (workload.driver.implementation !== "node-fixed-arrival-v1") {
    fail("unsupported driver implementation");
  }
  positiveNumber(
    workload.driver.maximumEventLoopP95Ms,
    "driver event-loop threshold",
    1_000,
  );
  positiveNumber(
    workload.driver.maximumCpuPercent,
    "driver CPU threshold",
    100,
  );
  positiveNumber(
    workload.driver.maximumMemoryMiB,
    "driver memory threshold",
    16_384,
  );

  if (
    !Array.isArray(workload.phases) ||
    workload.phases.length < 3 ||
    workload.phases.length > 8
  ) {
    fail("workload must contain three to eight phases");
  }
  const phaseIds = new Set();
  for (const phase of workload.phases) {
    exactKeys(
      phase,
      ["id", "durationSeconds", "rateMultiplier", "measured"],
      "phase",
    );
    if (!/^[a-z][a-z0-9_]{2,39}$/u.test(phase.id) || phaseIds.has(phase.id)) {
      fail("phase IDs must be unique safe tokens");
    }
    phaseIds.add(phase.id);
    positiveNumber(phase.durationSeconds, `${phase.id} duration`, 3_600);
    positiveNumber(phase.rateMultiplier, `${phase.id} rate multiplier`, 10);
    if (typeof phase.measured !== "boolean")
      fail(`${phase.id} measured must be boolean`);
  }
  if (!workload.phases.some((phase) => phase.measured))
    fail("at least one phase must be measured");
  const totalDuration = workload.phases.reduce(
    (total, phase) => total + phase.durationSeconds,
    0,
  );
  if (totalDuration > 7_200) fail("workload duration exceeds two hours");

  if (
    !Array.isArray(workload.scenarios) ||
    workload.scenarios.length < 3 ||
    workload.scenarios.length > 12
  ) {
    fail("workload must contain three to twelve scenarios");
  }
  const scenarioIds = new Set();
  for (const scenario of workload.scenarios) {
    const required = [
      "id",
      "adapter",
      "method",
      "path",
      "mutates",
      "ratePerSecond",
      "concurrencyLimit",
      "timeoutMs",
      "maximumResponseBytes",
      "expectedStatuses",
      "thresholds",
    ];
    if (
      scenario.adapter === "authenticated_get" ||
      scenario.adapter.includes("service_") ||
      scenario.adapter.includes("woocommerce_")
    ) {
      required.push("credentialFile");
    }
    exactKeys(scenario, required, `scenario ${scenario.id ?? "unknown"}`);
    if (
      !/^[a-z][a-z0-9_]{2,49}$/u.test(scenario.id) ||
      scenarioIds.has(scenario.id)
    ) {
      fail("scenario IDs must be unique safe tokens");
    }
    scenarioIds.add(scenario.id);
    if (!adapterNames.has(scenario.adapter))
      fail(`${scenario.id} uses an unsupported adapter`);
    const expectedMethod =
      scenario.adapter === "readiness" ||
      scenario.adapter === "authenticated_get"
        ? "GET"
        : "POST";
    if (scenario.method !== expectedMethod)
      fail(`${scenario.id} uses the wrong method for its adapter`);
    if (
      !/^\/[A-Za-z0-9/_-]{1,199}$/u.test(scenario.path) ||
      scenario.path.includes("//")
    ) {
      fail(`${scenario.id} path is invalid`);
    }
    if (typeof scenario.mutates !== "boolean")
      fail(`${scenario.id} mutates must be boolean`);
    if ((scenario.method === "POST") !== scenario.mutates)
      fail(`${scenario.id} mutation classification is inconsistent`);
    positiveNumber(scenario.ratePerSecond, `${scenario.id} rate`, 1_000);
    if (
      !Number.isSafeInteger(scenario.concurrencyLimit) ||
      scenario.concurrencyLimit < 1 ||
      scenario.concurrencyLimit > 10_000
    ) {
      fail(`${scenario.id} concurrency limit is invalid`);
    }
    if (
      !Number.isSafeInteger(scenario.timeoutMs) ||
      scenario.timeoutMs < 100 ||
      scenario.timeoutMs > 60_000
    ) {
      fail(`${scenario.id} timeout is invalid`);
    }
    if (
      !Number.isSafeInteger(scenario.maximumResponseBytes) ||
      scenario.maximumResponseBytes < 1 ||
      scenario.maximumResponseBytes > 1_048_576
    ) {
      fail(`${scenario.id} response bound is invalid`);
    }
    if (
      !Array.isArray(scenario.expectedStatuses) ||
      scenario.expectedStatuses.length < 1 ||
      scenario.expectedStatuses.length > 5 ||
      new Set(scenario.expectedStatuses).size !==
        scenario.expectedStatuses.length ||
      scenario.expectedStatuses.some(
        (status) =>
          !Number.isSafeInteger(status) || status < 200 || status > 299,
      )
    ) {
      fail(`${scenario.id} expected statuses are invalid`);
    }
    if (
      required.includes("credentialFile") &&
      (typeof scenario.credentialFile !== "string" ||
        !safeFilePattern.test(scenario.credentialFile))
    ) {
      fail(`${scenario.id} credential file name is invalid`);
    }
    exactKeys(
      scenario.thresholds,
      [
        "maximumErrorRate",
        "maximumP95Ms",
        "maximumP99Ms",
        "maximumScheduleLagP95Ms",
      ],
      `${scenario.id} thresholds`,
    );
    if (
      typeof scenario.thresholds.maximumErrorRate !== "number" ||
      scenario.thresholds.maximumErrorRate < 0 ||
      scenario.thresholds.maximumErrorRate > 0.05
    ) {
      fail(`${scenario.id} error-rate threshold is invalid`);
    }
    positiveNumber(
      scenario.thresholds.maximumP95Ms,
      `${scenario.id} p95`,
      scenario.timeoutMs,
    );
    positiveNumber(
      scenario.thresholds.maximumP99Ms,
      `${scenario.id} p99`,
      scenario.timeoutMs,
    );
    if (scenario.thresholds.maximumP99Ms < scenario.thresholds.maximumP95Ms)
      fail(`${scenario.id} p99 is below p95`);
    positiveNumber(
      scenario.thresholds.maximumScheduleLagP95Ms,
      `${scenario.id} schedule lag`,
      5_000,
    );
  }
  for (const requiredAdapter of [
    "readiness",
    "authenticated_get",
    "service_customer_upsert",
    "woocommerce_order_upsert",
  ]) {
    if (
      !workload.scenarios.some(
        (scenario) => scenario.adapter === requiredAdapter,
      )
    ) {
      fail(`workload is missing ${requiredAdapter}`);
    }
  }
  let totalScheduledRequests = 0;
  for (const phase of workload.phases) {
    for (const scenario of workload.scenarios) {
      const scheduled = Math.floor(
        phase.durationSeconds * phase.rateMultiplier * scenario.ratePerSecond,
      );
      totalScheduledRequests += scheduled;
      if (phase.measured && scheduled < minimumMeasuredRequests) {
        fail(
          `${phase.id}/${scenario.id} has fewer than ${minimumMeasuredRequests} measured requests`,
        );
      }
    }
  }
  if (totalScheduledRequests > 2_000_000) {
    fail("workload exceeds the two-million-request driver safety bound");
  }
  return {
    totalDuration,
    totalScheduledRequests,
    maximumAggregateRate:
      Math.max(...workload.phases.map((phase) => phase.rateMultiplier)) *
      workload.scenarios.reduce(
        (total, scenario) => total + scenario.ratePerSecond,
        0,
      ),
  };
}

export function readOrigin(path, allowLoopbackHttp = false) {
  const value = readRegularFile(path, "origin", 2_048, true).trim();
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail("origin file does not contain a valid URL");
  }
  const loopback =
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname === "localhost" ||
    parsed.hostname === "[::1]";
  if (
    (!allowLoopbackHttp && parsed.protocol !== "https:") ||
    (allowLoopbackHttp && !["https:", "http:"].includes(parsed.protocol)) ||
    (parsed.protocol === "http:" && !loopback) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    parsed.origin !== value
  ) {
    fail(
      "origin must be one exact canonical HTTPS origin without credentials or a path",
    );
  }
  return parsed;
}

export function readApproval(path, expected) {
  const raw = readRegularFile(path, "approval", 16_384, true);
  let approval;
  try {
    approval = YAML.parse(raw);
  } catch {
    fail("approval is not valid YAML");
  }
  exactKeys(
    approval,
    [
      "schema",
      "approvalReference",
      "targetClass",
      "originSha256",
      "workloadSha256",
      "candidateCommit",
      "approvedAt",
      "expiresAt",
      "maximumAggregateRate",
      "maximumDurationSeconds",
    ],
    "approval",
  );
  if (approval.schema !== "starfiniti.capacity-run-approval.v1")
    fail("unexpected approval schema");
  if (!/^[A-Za-z0-9._:-]{8,100}$/u.test(approval.approvalReference))
    fail("invalid approval reference");
  if (
    !new Set(["local", "disposable_staging", "approved_canary_readonly"]).has(
      approval.targetClass,
    )
  )
    fail("invalid target class");
  if (
    !sha256Pattern.test(approval.originSha256) ||
    approval.originSha256 !== expected.originSha256
  )
    fail("approval origin digest does not match");
  if (
    !sha256Pattern.test(approval.workloadSha256) ||
    approval.workloadSha256 !== expected.workloadSha256
  )
    fail("approval workload digest does not match");
  if (
    !/^[0-9a-f]{40}$/u.test(approval.candidateCommit) ||
    approval.candidateCommit !== expected.candidateCommit
  ) {
    fail("approval candidate commit does not match");
  }
  for (const field of ["approvedAt", "expiresAt"]) {
    if (
      typeof approval[field] !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(approval[field]) ||
      Number.isNaN(Date.parse(approval[field]))
    ) {
      fail(`approval ${field} must be an exact UTC timestamp`);
    }
  }
  const now = Date.now();
  if (
    Date.parse(approval.approvedAt) > now + 60_000 ||
    Date.parse(approval.expiresAt) <= now ||
    Date.parse(approval.expiresAt) - Date.parse(approval.approvedAt) >
      86_400_000
  ) {
    fail("approval interval is not current and bounded to 24 hours");
  }
  positiveNumber(
    approval.maximumAggregateRate,
    "approved aggregate rate",
    20_000,
  );
  positiveNumber(approval.maximumDurationSeconds, "approved duration", 7_200);
  if (expected.maximumAggregateRate > approval.maximumAggregateRate)
    fail("workload aggregate rate exceeds approval");
  if (expected.totalDuration > approval.maximumDurationSeconds)
    fail("workload duration exceeds approval");
  if (
    expected.mutates &&
    approval.targetClass !== "disposable_staging" &&
    approval.targetClass !== "local"
  ) {
    fail("mutating workloads require local or disposable staging target class");
  }
  if (expected.publicTarget && approval.targetClass === "local")
    fail("public targets cannot use local approval");
  return { approval, approvalSha256: documentDigest(approval) };
}

export function loadCredentials(workload, directory) {
  if (!isAbsolute(directory))
    fail("credential directory path must be absolute");
  let directoryStatus;
  try {
    directoryStatus = lstatSync(directory);
  } catch {
    fail("credential directory is unreadable");
  }
  if (
    !directoryStatus.isDirectory() ||
    realpathSync(directory) !== resolve(directory)
  ) {
    fail("credential directory must be a directory");
  }
  if (
    process.platform !== "win32" &&
    ((directoryStatus.mode & 0o077) !== 0 ||
      (typeof process.getuid === "function" &&
        directoryStatus.uid !== process.getuid()))
  ) {
    fail("credential directory must be caller-owned and private");
  }
  const credentials = new Map();
  for (const scenario of workload.scenarios) {
    if (!scenario.credentialFile || credentials.has(scenario.credentialFile))
      continue;
    const path = join(directory, scenario.credentialFile);
    const raw = readRegularFile(
      path,
      `${scenario.id} credential`,
      16_384,
      true,
    ).trim();
    if (scenario.adapter === "authenticated_get") {
      if (raw.length < 8 || raw.length > 8_192 || /[\r\n]/u.test(raw))
        fail("customer cookie credential is invalid");
      credentials.set(scenario.credentialFile, raw);
    } else if (scenario.adapter === "service_customer_upsert") {
      if (!serviceTokenPattern.test(raw)) fail("service credential is invalid");
      credentials.set(scenario.credentialFile, raw);
    } else if (scenario.adapter === "woocommerce_order_upsert") {
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        fail("WooCommerce credential is not valid JSON");
      }
      exactKeys(
        parsed,
        ["connectionId", "keyVersion", "signingKey"],
        "WooCommerce credential",
      );
      if (
        !uuidPattern.test(parsed.connectionId) ||
        !/^v[1-9][0-9]*$/u.test(parsed.keyVersion)
      )
        fail("WooCommerce selectors are invalid");
      const decoded = Buffer.from(parsed.signingKey, "base64");
      if (
        !/^[A-Za-z0-9+/]+={0,2}$/u.test(parsed.signingKey) ||
        decoded.byteLength < 32 ||
        decoded.toString("base64") !== parsed.signingKey
      )
        fail("WooCommerce signing key is invalid");
      credentials.set(scenario.credentialFile, {
        ...parsed,
        signingKey: decoded,
      });
    }
  }
  return credentials;
}

function numericSelector(sequence, runSeed) {
  const prefix =
    (BigInt(`0x${runSeed.slice(0, 10)}`) % 8_000_000_000n) + 1_000_000_000n;
  return (prefix * 1_000_000n + BigInt(sequence + 1)).toString();
}

function buildRequest(scenario, sequence, runSeed, credentials) {
  const headers = { Accept: "application/json" };
  if (scenario.adapter === "readiness") return { headers };
  if (scenario.adapter === "authenticated_get") {
    headers.Cookie = credentials.get(scenario.credentialFile);
    return { headers };
  }
  const correlationId = randomUUID();
  const stableKey = `capacity:${runSeed.slice(0, 16)}:${scenario.id}:${sequence}`;
  if (scenario.adapter === "service_customer_upsert") {
    headers.Authorization = `Bearer ${credentials.get(scenario.credentialFile)}`;
    headers["Content-Type"] = "application/json";
    return {
      headers,
      expectedCorrelationId: correlationId,
      body: JSON.stringify({
        version: "1",
        externalCustomerId: stableKey,
        idempotencyKey: stableKey,
        correlationId,
      }),
    };
  }
  const credential = credentials.get(scenario.credentialFile);
  const now = new Date();
  const deliveryId = stableKey;
  const externalCustomerId = numericSelector(sequence, runSeed);
  const envelope = {
    version: "1",
    deliveryId,
    connectionId: credential.connectionId,
    sourceEventId: deliveryId,
    eventType: "commerce.order.upserted",
    sourceObjectId: externalCustomerId,
    sourceRevision: `capacity-${sequence}`,
    occurredAt: now.toISOString(),
    deliveredAt: now.toISOString(),
    correlationId,
    causationId: null,
    payload: {
      kind: "order",
      orderId: externalCustomerId,
      status: "processing",
      currency: "EUR",
      currencyMinorUnitDigits: 2,
      market: "SI",
      customer: { kind: "registered", externalCustomerId },
      paymentKind: "money",
      lines: [
        {
          lineId: "1",
          productId: "1",
          variationId: null,
          quantity: "1",
          categoryIds: [],
          collectionIds: [],
          subtotal: "10.00",
          total: "10.00",
          refundedTotal: "0",
        },
      ],
      shippingTotal: "0",
      shippingRefundedTotal: "0",
      taxTotal: "0",
      taxRefundedTotal: "0",
      feeTotal: "0",
      feeRefundedTotal: "0",
      discountTotal: "0",
      refundedTotal: "0",
    },
  };
  const body = JSON.stringify(envelope);
  const bodySha256 = digest(body);
  const timestamp = Math.floor(Date.now() / 1_000).toString();
  const nonce = randomUUID();
  const message = [
    "starfiniti-woocommerce-v1",
    scenario.path,
    credential.connectionId,
    deliveryId,
    timestamp,
    nonce,
    bodySha256,
  ].join("\n");
  const signature = createHmac("sha256", credential.signingKey)
    .update(message)
    .digest("hex");
  return {
    headers: {
      ...headers,
      "Content-Type": "application/json",
      "X-Starfiniti-Connection-Id": credential.connectionId,
      "X-Starfiniti-Delivery-Id": deliveryId,
      "X-Starfiniti-Timestamp": timestamp,
      "X-Starfiniti-Nonce": nonce,
      "X-Starfiniti-Key-Version": credential.keyVersion,
      "X-Starfiniti-Body-Sha256": bodySha256,
      "X-Starfiniti-Signature": signature,
    },
    expectedCorrelationId: correlationId,
    body,
  };
}

async function readBoundedResponse(response, maximumBytes) {
  if (!response.body) return { bytes: 0, body: Buffer.alloc(0) };
  const reader = response.body.getReader();
  let total = 0;
  const chunks = [];
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new Error("response_too_large");
      }
      chunks.push(Buffer.from(chunk.value));
    }
  } finally {
    reader.releaseLock();
  }
  return { bytes: total, body: Buffer.concat(chunks, total) };
}

function responseMatchesContract(scenario, response, body, request) {
  if (scenario.adapter === "readiness") {
    return body.equals(Buffer.from("ok\n", "utf8"));
  }
  if (scenario.adapter === "authenticated_get") {
    return (response.headers.get("content-type") ?? "")
      .toLowerCase()
      .startsWith("text/html");
  }
  let parsed;
  try {
    parsed = JSON.parse(body.toString("utf8"));
  } catch {
    return false;
  }
  if (scenario.adapter === "service_customer_upsert") {
    return (
      parsed?.version === "1" &&
      uuidPattern.test(parsed.customerId) &&
      parsed.outcome === "created" &&
      parsed.correlationId === request.expectedCorrelationId
    );
  }
  return (
    uuidPattern.test(parsed?.receipt_id) &&
    parsed?.outcome === "accepted" &&
    uuidPattern.test(parsed?.normalization?.canonical_event_id) &&
    parsed?.normalization?.outcome === "created"
  );
}

function percentile(values, percentileValue) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[
    Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1)
  ];
}

function round(value, places = 3) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

async function executeRequest(
  origin,
  scenario,
  sequence,
  runSeed,
  credentials,
) {
  const request = buildRequest(scenario, sequence, runSeed, credentials);
  const started = performance.now();
  try {
    const response = await fetch(new URL(scenario.path, origin), {
      method: scenario.method,
      headers: request.headers,
      body: request.body,
      redirect: "manual",
      signal: AbortSignal.timeout(scenario.timeoutMs),
    });
    const bounded = await readBoundedResponse(
      response,
      scenario.maximumResponseBytes,
    );
    const expectedStatus = scenario.expectedStatuses.includes(response.status);
    const expectedContract =
      expectedStatus &&
      responseMatchesContract(scenario, response, bounded.body, request);
    return {
      latencyMs: performance.now() - started,
      status: response.status,
      bytes: bounded.bytes,
      ok: expectedContract,
      failure: expectedStatus
        ? expectedContract
          ? null
          : "invalid_response"
        : "unexpected_status",
    };
  } catch (error) {
    return {
      latencyMs: performance.now() - started,
      status: null,
      bytes: 0,
      ok: false,
      failure:
        error instanceof Error && error.message === "response_too_large"
          ? "response_too_large"
          : "request_failed",
    };
  }
}

async function runScenarioPhase(
  origin,
  scenario,
  phase,
  phaseIndex,
  runSeed,
  credentials,
  phaseStart,
) {
  const rate = scenario.ratePerSecond * phase.rateMultiplier;
  const scheduled = Math.max(1, Math.floor(rate * phase.durationSeconds));
  const intervalMs = 1_000 / rate;
  const inflight = new Set();
  const latencies = [];
  const scheduleLags = [];
  const statuses = {};
  const failures = {};
  let dropped = 0;
  let completed = 0;
  let responseBytes = 0;

  for (let sequence = 0; sequence < scheduled; sequence += 1) {
    const scheduledAt = phaseStart + sequence * intervalMs;
    const waitMs = scheduledAt - performance.now();
    if (waitMs > 0)
      await new Promise((resolveWait) => setTimeout(resolveWait, waitMs));
    const lag = Math.max(0, performance.now() - scheduledAt);
    scheduleLags.push(lag);
    if (inflight.size >= scenario.concurrencyLimit) {
      dropped += 1;
      failures.driver_saturation = (failures.driver_saturation ?? 0) + 1;
      continue;
    }
    const globallyUniqueSequence = phaseIndex * 100_000_000 + sequence;
    const request = executeRequest(
      origin,
      scenario,
      globallyUniqueSequence,
      runSeed,
      credentials,
    )
      .then((result) => {
        completed += 1;
        latencies.push(result.latencyMs);
        responseBytes += result.bytes;
        const statusKey =
          result.status === null ? "network" : String(result.status);
        statuses[statusKey] = (statuses[statusKey] ?? 0) + 1;
        if (!result.ok && result.failure)
          failures[result.failure] = (failures[result.failure] ?? 0) + 1;
      })
      .finally(() => inflight.delete(request));
    inflight.add(request);
  }
  await Promise.all(inflight);
  const errorCount = Object.values(failures).reduce(
    (total, count) => total + count,
    0,
  );
  const errorRate = errorCount / scheduled;
  const metrics = {
    scheduled,
    completed,
    dropped,
    errorCount,
    errorRate: round(errorRate, 6),
    responseBytes,
    statusTotals: statuses,
    failureTotals: failures,
    latencyMs: {
      p50: round(percentile(latencies, 50)),
      p95: round(percentile(latencies, 95)),
      p99: round(percentile(latencies, 99)),
      maximum: round(
        latencies.reduce((maximum, value) => Math.max(maximum, value), 0),
      ),
    },
    scheduleLagMs: {
      p50: round(percentile(scheduleLags, 50)),
      p95: round(percentile(scheduleLags, 95)),
      p99: round(percentile(scheduleLags, 99)),
      maximum: round(
        scheduleLags.reduce((maximum, value) => Math.max(maximum, value), 0),
      ),
    },
  };
  const decisions = {
    noDrops: dropped === 0,
    errorRate: errorRate <= scenario.thresholds.maximumErrorRate,
    p95: metrics.latencyMs.p95 <= scenario.thresholds.maximumP95Ms,
    p99: metrics.latencyMs.p99 <= scenario.thresholds.maximumP99Ms,
    scheduleLagP95:
      metrics.scheduleLagMs.p95 <= scenario.thresholds.maximumScheduleLagP95Ms,
  };
  return {
    scenarioId: scenario.id,
    adapter: scenario.adapter,
    ratePerSecond: round(rate),
    metrics,
    decisions,
    passed: Object.values(decisions).every(Boolean),
  };
}

async function runWorkload(input) {
  const startedAt = new Date();
  const startedPerformance = performance.now();
  const cpuStart = process.cpuUsage();
  let peakMemoryBytes = process.memoryUsage().rss;
  const memoryTimer = setInterval(() => {
    peakMemoryBytes = Math.max(peakMemoryBytes, process.memoryUsage().rss);
  }, 100);
  memoryTimer.unref();
  const eventLoop = monitorEventLoopDelay({ resolution: 10 });
  eventLoop.enable();
  const runSeed = digest(
    `${startedAt.toISOString()}-${randomBytes(32).toString("hex")}`,
  );
  const phases = [];
  try {
    for (const [phaseIndex, phase] of input.workload.phases.entries()) {
      const phaseStartedAt = new Date();
      const phaseStart = performance.now();
      const scenarios = await Promise.all(
        input.workload.scenarios.map((scenario) =>
          runScenarioPhase(
            input.origin,
            scenario,
            phase,
            phaseIndex,
            runSeed,
            input.credentials,
            phaseStart,
          ),
        ),
      );
      phases.push({
        id: phase.id,
        measured: phase.measured,
        rateMultiplier: phase.rateMultiplier,
        startedAt: phaseStartedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        scenarios,
        passed: scenarios.every((scenario) => scenario.passed),
      });
    }
  } finally {
    clearInterval(memoryTimer);
    eventLoop.disable();
  }
  const elapsedMs = performance.now() - startedPerformance;
  const cpu = process.cpuUsage(cpuStart);
  const cpuPercent = ((cpu.user + cpu.system) / 1_000 / elapsedMs) * 100;
  const eventLoopP95Ms =
    eventLoop.count > 0 ? eventLoop.percentile(95) / 1_000_000 : 0;
  const driver = {
    cpuPercent: round(cpuPercent),
    peakMemoryMiB: round(peakMemoryBytes / 1_048_576),
    eventLoopP95Ms: round(eventLoopP95Ms),
  };
  const driverDecisions = {
    cpu: driver.cpuPercent <= input.workload.driver.maximumCpuPercent,
    memory: driver.peakMemoryMiB <= input.workload.driver.maximumMemoryMiB,
    eventLoop:
      driver.eventLoopP95Ms <= input.workload.driver.maximumEventLoopP95Ms,
  };
  const measuredPhases = phases.filter((phase) => phase.measured);
  const passed =
    measuredPhases.length > 0 &&
    measuredPhases.every((phase) => phase.passed) &&
    Object.values(driverDecisions).every(Boolean);
  return {
    schema: "starfiniti.capacity-run.v1",
    status: passed ? "passed" : "failed",
    candidateCommit: input.candidateCommit,
    workloadProfile: input.workload.profile,
    workloadSha256: input.workloadSha256,
    originSha256: input.originSha256,
    approvalSha256: input.approvalSha256,
    targetClass: input.targetClass,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    driver,
    driverDecisions,
    phases,
  };
}

async function execute(options) {
  for (const name of [
    "config",
    "origin-file",
    "credential-dir",
    "approval-file",
    "out",
  ]) {
    if (typeof options[name] !== "string") fail(`--${name} is required`);
  }
  const configPath = resolve(root, options.config);
  let workload;
  try {
    workload = YAML.parse(readFileSync(configPath, "utf8"));
  } catch {
    fail("workload configuration is unreadable or invalid YAML");
  }
  const workloadBounds = validateWorkload(workload, {
    minimumMeasuredRequests: options.allowLoopbackHttp === true ? 1 : 500,
  });
  const workloadSha256 = documentDigest(workload);
  const repository = repositoryState({
    allowDirty: options.allowDirtyRepository === true,
  });
  const origin = readOrigin(
    options["origin-file"],
    options.allowLoopbackHttp === true,
  );
  const originSha256 = digest(origin.origin);
  const publicTarget = !["localhost", "127.0.0.1", "[::1]"].includes(
    origin.hostname,
  );
  const mutates = workload.scenarios.some((scenario) => scenario.mutates);
  if (
    mutates &&
    new Set([
      "loyalty.starfiniti.com",
      "hub.starfiniti.com",
      "auth.starfiniti.com",
    ]).has(origin.hostname)
  ) {
    fail(
      "mutating capacity workloads are prohibited on known production origins",
    );
  }
  const approved = readApproval(options["approval-file"], {
    workloadSha256,
    candidateCommit: repository.commit,
    originSha256,
    publicTarget,
    mutates,
    ...workloadBounds,
  });
  const credentials = loadCredentials(workload, options["credential-dir"]);
  if (!isAbsolute(options.out)) fail("report path must be absolute");
  const report = await runWorkload({
    workload,
    origin,
    credentials,
    workloadSha256,
    originSha256,
    approvalSha256: approved.approvalSha256,
    targetClass: approved.approval.targetClass,
    candidateCommit: repository.commit,
  });
  writeFileSync(options.out, `${JSON.stringify(report, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  return report;
}

async function selfTest() {
  const temporary = mkdtempSync(join(tmpdir(), "starfiniti-capacity-"));
  const credentialsDirectory = join(temporary, "credentials");
  const { mkdirSync } = await import("node:fs");
  mkdirSync(credentialsDirectory, { mode: 0o700 });
  const serviceToken = `sflt_v1_${randomBytes(16).toString("hex")}_${randomBytes(32).toString("base64url")}`;
  const customerCookie = `sb-test=${randomBytes(32).toString("base64url")}`;
  const connectionId = randomUUID();
  const signingKey = randomBytes(32);
  const seen = new Set();
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    if (request.url === "/api/healthz") {
      seen.add("readiness");
      response.writeHead(200, { "Content-Type": "text/plain" }).end("ok\n");
      return;
    }
    if (
      request.url === "/account/loyalty" &&
      request.headers.cookie === customerCookie
    ) {
      seen.add("authenticated_get");
      response
        .writeHead(200, { "Content-Type": "text/html" })
        .end("<main>ok</main>");
      return;
    }
    if (
      request.url === "/api/v1/service/customers" &&
      request.headers.authorization === `Bearer ${serviceToken}`
    ) {
      const command = JSON.parse(body.toString("utf8"));
      seen.add("service_customer_upsert");
      response.writeHead(201, { "Content-Type": "application/json" }).end(
        JSON.stringify({
          version: "1",
          customerId: randomUUID(),
          outcome: "created",
          correlationId: command.correlationId,
        }),
      );
      return;
    }
    if (request.url === "/api/v1/integrations/woocommerce/events") {
      const bodySha256 = digest(body);
      const message = [
        "starfiniti-woocommerce-v1",
        request.url,
        request.headers["x-starfiniti-connection-id"],
        request.headers["x-starfiniti-delivery-id"],
        request.headers["x-starfiniti-timestamp"],
        request.headers["x-starfiniti-nonce"],
        bodySha256,
      ].join("\n");
      const expected = createHmac("sha256", signingKey)
        .update(message)
        .digest("hex");
      if (
        request.headers["x-starfiniti-body-sha256"] === bodySha256 &&
        request.headers["x-starfiniti-signature"] === expected
      ) {
        seen.add("woocommerce_order_upsert");
        response.writeHead(202, { "Content-Type": "application/json" }).end(
          JSON.stringify({
            receipt_id: randomUUID(),
            outcome: "accepted",
            normalization: {
              canonical_event_id: randomUUID(),
              outcome: "created",
            },
          }),
        );
        return;
      }
    }
    response.writeHead(503).end();
  });
  await new Promise((resolveListen) =>
    server.listen(0, "127.0.0.1", resolveListen),
  );
  try {
    const address = server.address();
    if (!address || typeof address === "string")
      fail("self-test server address unavailable");
    const workload = YAML.parse(
      readFileSync(
        join(root, "infrastructure/testing/capacity/workload.yaml"),
        "utf8",
      ),
    );
    workload.phases = [
      {
        id: "warmup",
        durationSeconds: 0.2,
        rateMultiplier: 1,
        measured: false,
      },
      {
        id: "sustained",
        durationSeconds: 0.4,
        rateMultiplier: 1,
        measured: true,
      },
      {
        id: "recovery",
        durationSeconds: 0.2,
        rateMultiplier: 1,
        measured: true,
      },
    ];
    workload.driver = {
      ...workload.driver,
      maximumEventLoopP95Ms: Math.max(
        250,
        workload.driver.maximumEventLoopP95Ms,
      ),
    };
    workload.scenarios = workload.scenarios.map((scenario) => ({
      ...scenario,
      ratePerSecond: 10,
      thresholds: {
        ...scenario.thresholds,
        maximumP95Ms: Math.max(1_000, scenario.thresholds.maximumP95Ms),
        maximumP99Ms: Math.max(1_500, scenario.thresholds.maximumP99Ms),
        maximumScheduleLagP95Ms: 500,
      },
    }));
    const configPath = join(temporary, "workload.yaml");
    const originPath = join(temporary, "origin.txt");
    const approvalPath = join(temporary, "approval.yaml");
    const reportPath = join(temporary, "report.json");
    const origin = `http://127.0.0.1:${address.port}`;
    writeFileSync(configPath, YAML.stringify(workload), { mode: 0o600 });
    writeFileSync(originPath, origin, { mode: 0o600 });
    writeFileSync(
      join(credentialsDirectory, "customer-cookie.txt"),
      customerCookie,
      { mode: 0o600 },
    );
    writeFileSync(
      join(credentialsDirectory, "service-api.token"),
      serviceToken,
      { mode: 0o600 },
    );
    writeFileSync(
      join(credentialsDirectory, "woocommerce.json"),
      JSON.stringify({
        connectionId,
        keyVersion: "v1",
        signingKey: signingKey.toString("base64"),
      }),
      { mode: 0o600 },
    );
    const workloadSha256 = documentDigest(workload);
    const candidateCommit = repositoryState({ allowDirty: true }).commit;
    const now = Date.now();
    const approval = {
      schema: "starfiniti.capacity-run-approval.v1",
      approvalReference: "self-test:local",
      targetClass: "local",
      originSha256: digest(origin),
      workloadSha256,
      candidateCommit,
      approvedAt: new Date(now - 1_000)
        .toISOString()
        .replace(/\.\d{3}Z$/u, "Z"),
      expiresAt: new Date(now + 60_000)
        .toISOString()
        .replace(/\.\d{3}Z$/u, "Z"),
      maximumAggregateRate: 100,
      maximumDurationSeconds: 10,
    };
    writeFileSync(approvalPath, YAML.stringify(approval), { mode: 0o600 });
    const report = await execute({
      config: configPath,
      "origin-file": originPath,
      "credential-dir": credentialsDirectory,
      "approval-file": approvalPath,
      out: reportPath,
      allowLoopbackHttp: true,
      allowDirtyRepository: true,
    });
    if (report.status !== "passed" || seen.size !== 4) {
      const missingAdapters = [
        "authenticated_get",
        "readiness",
        "service_customer_upsert",
        "woocommerce_order_upsert",
      ].filter((adapter) => !seen.has(adapter));
      const failedDecisions = report.phases
        .filter((phase) => phase.measured)
        .flatMap((phase) =>
          phase.scenarios.flatMap((scenario) =>
            Object.entries(scenario.decisions)
              .filter(([, passed]) => passed !== true)
              .map(([decision]) =>
                [phase.id, scenario.adapter, decision].join(":"),
              ),
          ),
        );
      const failedDriverDecisions = Object.entries(report.driverDecisions)
        .filter(([, passed]) => passed !== true)
        .map(([decision]) => decision);
      fail(
        [
          "self-test did not pass all four adapters",
          `status=${report.status}`,
          `missing=${missingAdapters.join(",") || "none"}`,
          `decisions=${failedDecisions.join(",") || "none"}`,
          `driver=${failedDriverDecisions.join(",") || "none"}`,
        ].join("; "),
      );
    }
    const serialized = readFileSync(reportPath, "utf8");
    for (const forbidden of [
      serviceToken,
      customerCookie,
      connectionId,
      signingKey.toString("base64"),
      origin,
    ]) {
      if (serialized.includes(forbidden))
        fail("self-test report leaked request authority");
    }
    const failingWorkload = structuredClone(workload);
    failingWorkload.scenarios = failingWorkload.scenarios.map((scenario) =>
      scenario.id === "dashboard_readiness"
        ? { ...scenario, expectedStatuses: [204] }
        : scenario,
    );
    const failedReport = await runWorkload({
      workload: failingWorkload,
      origin: new URL(origin),
      credentials: loadCredentials(failingWorkload, credentialsDirectory),
      workloadSha256: documentDigest(failingWorkload),
      originSha256: digest(origin),
      approvalSha256: documentDigest(approval),
      targetClass: "local",
      candidateCommit,
    });
    if (failedReport.status !== "failed") {
      fail("self-test did not return a failed result for a threshold breach");
    }
    const drifted = { ...approval, workloadSha256: "f".repeat(64) };
    const driftedPath = join(temporary, "drifted.yaml");
    writeFileSync(driftedPath, YAML.stringify(drifted), { mode: 0o600 });
    try {
      readApproval(driftedPath, {
        workloadSha256,
        candidateCommit,
        originSha256: digest(origin),
        maximumAggregateRate: 40,
        totalDuration: 0.8,
        publicTarget: false,
        mutates: true,
      });
      fail("self-test accepted a drifted approval");
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.includes("workload digest does not match")
      )
        throw error;
    }
    const readonlyApproval = {
      ...approval,
      targetClass: "approved_canary_readonly",
    };
    const readonlyPath = join(temporary, "readonly.yaml");
    writeFileSync(readonlyPath, YAML.stringify(readonlyApproval), {
      mode: 0o600,
    });
    try {
      readApproval(readonlyPath, {
        workloadSha256,
        candidateCommit,
        originSha256: digest(origin),
        maximumAggregateRate: 40,
        totalDuration: 0.8,
        publicTarget: false,
        mutates: true,
      });
      fail("self-test accepted mutation on a read-only canary");
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.includes("mutating workloads require")
      )
        throw error;
    }
    if (process.platform !== "win32") {
      const { chmodSync } = await import("node:fs");
      const unsafeAuthorityDirectory = join(temporary, "unsafe-authority");
      mkdirSync(unsafeAuthorityDirectory, { mode: 0o700 });
      chmodSync(unsafeAuthorityDirectory, 0o777);
      const unsafeOriginPath = join(unsafeAuthorityDirectory, "origin.txt");
      writeFileSync(unsafeOriginPath, origin, { mode: 0o600 });
      try {
        readOrigin(unsafeOriginPath, true);
        fail("self-test accepted authority below a writable parent");
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !error.message.includes("parent is unreadable")
        ) {
          throw error;
        }
      }
    }
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const options = parseArguments(process.argv.slice(2));
  if (options.selfTest) {
    await selfTest();
    console.log(
      "Validated fixed-arrival scheduling, all four adapters, approval binding, mutation boundaries, and minimized capacity reports.",
    );
  } else {
    const report = await execute(options);
    console.log(
      `Capacity run ${report.status}; aggregate report written without request or credential material.`,
    );
    if (report.status !== "passed") process.exitCode = 1;
  }
}
