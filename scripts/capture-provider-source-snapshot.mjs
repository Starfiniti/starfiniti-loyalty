import { createHash } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import { execFileSync } from "node:child_process";
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readSync,
  rmSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const planPath = join(
  root,
  "infrastructure/governance/continuous-improvement.yaml",
);
const attributesPath = join(root, ".gitattributes");
const snapshotAttribute =
  "docs/plan/evidence/M16/runs/provider-source-snapshot-*.json -text";
const snapshotSchema = "starfiniti.provider-source-snapshot.v1";
const limitation =
  "This artifact proves bounded official-source freshness and byte provenance only. It does not complete provider review, classify impact, prove installed versions, approve an upgrade, or close a monthly review.";
const digestPattern = /^[a-f0-9]{64}$/u;
const commitPattern = /^[a-f0-9]{40}$/u;
const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const forbiddenHostnameSuffixes = [
  ".example",
  ".home.arpa",
  ".internal",
  ".invalid",
  ".local",
  ".localhost",
  ".test",
];

const providerSources = new Map([
  ["supabase", "https://supabase.com/changelog.md"],
  ["postgresql", "https://www.postgresql.org/support/versioning/"],
  ["woocommerce", "https://developer.woocommerce.com/changelog/"],
  ["stripe", "https://docs.stripe.com/changelog"],
  ["authentik", "https://docs.goauthentik.io/releases/"],
  ["klaviyo", "https://developers.klaviyo.com/en/docs/changelog_"],
  ["nodejs", "https://nodejs.org/en/about/previous-releases"],
  ["rsync", "https://download.samba.org/pub/rsync/NEWS"],
  ["borgbackup", "https://borgbackup.readthedocs.io/en/stable/changes.html"],
  ["openssh", "https://www.openssh.com/releasenotes.html"],
  ["debian", "https://www.debian.org/security/"],
  ["ubuntu", "https://ubuntu.com/security/notices"],
  ["proxmox", "https://forum.proxmox.com/forums/security-advisories.26/"],
]);

const addressBlockList = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
]) {
  addressBlockList.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
]) {
  addressBlockList.addSubnet(network, prefix, "ipv6");
}

function fail(message) {
  throw new Error(`Provider source snapshot failed: ${message}`);
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function exactSet(actual, expected, label) {
  if (
    actual.size !== expected.size ||
    [...expected].some((value) => !actual.has(value))
  ) {
    fail(`${label} differs from the required closed set`);
  }
}

function exactObjectKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} is not an object`);
  }
  exactSet(new Set(Object.keys(value)), new Set(expected), `${label} keys`);
}

function exactUtc(value, label) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().replace(".000Z", "Z") !== value
  ) {
    fail(`${label} is not an exact UTC instant`);
  }
  return Date.parse(value);
}

function nowUtc(now = Date.now()) {
  return new Date(Math.floor(now / 1_000) * 1_000)
    .toISOString()
    .replace(".000Z", "Z");
}

function parseHttpsUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`${label} is not a URL`);
  }
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.hash !== "" ||
    url.search !== "" ||
    url.port !== "" ||
    value.length > 2_048 ||
    hostname.length === 0 ||
    hostname.length > 253 ||
    !hostname.includes(".") ||
    hostname.endsWith(".") ||
    isIP(hostname) !== 0 ||
    forbiddenHostnameSuffixes.some(
      (suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix),
    )
  ) {
    fail(`${label} is not an allowed public HTTPS URL`);
  }
  return url;
}

function isPublicAddress(address) {
  const family = isIP(address);
  return (
    (family === 4 && !addressBlockList.check(address, "ipv4")) ||
    (family === 6 && !addressBlockList.check(address, "ipv6"))
  );
}

function readStableFile(path, maximumBytes, label) {
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

function validateGitAttributesBytes(bytes) {
  const lines = bytes
    .toString("utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim() !== "");
  if (lines.filter((line) => line === snapshotAttribute).length !== 1) {
    fail("provider snapshot byte-preservation attribute differs");
  }
}

function validateGitAttributes() {
  validateGitAttributesBytes(
    readStableFile(attributesPath, 64 * 1024, "Git attributes"),
  );
}

function uniqueCatalogue(items) {
  if (!Array.isArray(items) || items.length === 0) {
    fail("provider catalogue is empty");
  }
  const ids = new Set();
  for (const item of items) {
    if (!item || typeof item.id !== "string" || ids.has(item.id)) {
      fail("provider catalogue contains a missing or duplicate id");
    }
    ids.add(item.id);
  }
  return ids;
}

function validatePlan(plan) {
  if (
    plan?.schema !== "starfiniti.continuous-improvement-plan.v1" ||
    plan.version !== 1 ||
    plan.timezone !== "UTC"
  ) {
    fail("continuous-improvement plan identity differs");
  }
  exactSet(
    uniqueCatalogue(plan.providerCatalogue),
    new Set(providerSources.keys()),
    "provider catalogue",
  );
  for (const provider of plan.providerCatalogue) {
    if (
      provider.source !== providerSources.get(provider.id) ||
      provider.reviewFrequency !== "monthly"
    ) {
      fail(`${provider.id} source or review cadence differs`);
    }
    parseHttpsUrl(provider.source, `${provider.id} source`);
  }

  const policy = plan.providerSourceSnapshot;
  exactObjectKeys(
    policy,
    [
      "schema",
      "catalogueCount",
      "timeoutMs",
      "maximumRedirects",
      "maximumResponseBytes",
      "maximumHeaderBytes",
      "minimumTlsVersion",
      "acceptedContentTypes",
      "acceptedContentEncodings",
      "allowedRedirectHosts",
      "contentRetained",
      "reviewComplete",
      "impactClassified",
      "installedEvidenceComplete",
      "output",
    ],
    "provider source snapshot policy",
  );
  if (
    policy.schema !== snapshotSchema ||
    policy.catalogueCount !== providerSources.size ||
    policy.timeoutMs !== 20_000 ||
    policy.maximumRedirects !== 5 ||
    policy.maximumResponseBytes !== 4_000_000 ||
    policy.maximumHeaderBytes !== 32_768 ||
    policy.minimumTlsVersion !== "TLSv1.2" ||
    policy.contentRetained !== false ||
    policy.reviewComplete !== false ||
    policy.impactClassified !== false ||
    policy.installedEvidenceComplete !== false
  ) {
    fail("provider source snapshot policy bounds or assertions differ");
  }
  exactSet(
    new Set(policy.acceptedContentTypes),
    new Set(["text/html", "text/plain", "text/markdown"]),
    "accepted provider content types",
  );
  if (policy.acceptedContentTypes.length !== 3) {
    fail("accepted provider content types contain a duplicate");
  }
  exactSet(
    new Set(policy.acceptedContentEncodings),
    new Set(["identity"]),
    "accepted provider content encodings",
  );
  if (policy.acceptedContentEncodings.length !== 1) {
    fail("accepted provider content encodings contain a duplicate");
  }
  exactObjectKeys(
    policy.allowedRedirectHosts,
    ["openssh"],
    "provider redirect allowlist",
  );
  if (
    !Array.isArray(policy.allowedRedirectHosts.openssh) ||
    policy.allowedRedirectHosts.openssh.length !== 1 ||
    policy.allowedRedirectHosts.openssh[0] !== "www.openssh.org"
  ) {
    fail("OpenSSH redirect allowlist differs");
  }
  exactObjectKeys(
    policy.output,
    ["absolutePathRequired", "extension", "overwrite", "mode"],
    "provider snapshot output policy",
  );
  if (
    policy.output.absolutePathRequired !== true ||
    policy.output.extension !== ".json" ||
    policy.output.overwrite !== false ||
    policy.output.mode !== "0600"
  ) {
    fail("provider snapshot output policy differs");
  }
  return policy;
}

async function resolvePublicAddresses(hostname, runtime) {
  let answers;
  try {
    answers = await runtime.lookup(hostname);
  } catch {
    fail(`${hostname} DNS lookup failed`);
  }
  if (
    !Array.isArray(answers) ||
    answers.length === 0 ||
    answers.some(
      (answer) =>
        !answer ||
        (answer.family !== 4 && answer.family !== 6) ||
        isIP(answer.address) !== answer.family ||
        !isPublicAddress(answer.address),
    )
  ) {
    fail(
      `${hostname} DNS answers include a private reserved or invalid address`,
    );
  }
  return [...answers].sort(
    (left, right) =>
      left.family - right.family || left.address.localeCompare(right.address),
  );
}

function firstHeader(headers, name) {
  const value = headers[name];
  if (Array.isArray(value)) {
    if (value.length !== 1) fail(`${name} header is duplicated`);
    return value[0] ?? null;
  }
  return value ?? null;
}

function boundedHeader(headers, name) {
  const value = firstHeader(headers, name);
  if (value === null) return null;
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 4_096 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
  ) {
    fail(`${name} header is invalid`);
  }
  return value.trim();
}

function parseDeclaredLength(value, maximumBytes) {
  if (value === null) return null;
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) {
    fail("content-length header is invalid");
  }
  const length = Number(value);
  if (!Number.isSafeInteger(length) || length > maximumBytes) {
    fail("declared response length exceeds the byte bound");
  }
  return length;
}

function normalizeContentType(value, accepted) {
  if (value === null) fail("content-type header is missing");
  const contentType = value.split(";", 1)[0].trim().toLowerCase();
  if (!accepted.includes(contentType)) {
    fail(`content type ${contentType || "empty"} is not accepted`);
  }
  return contentType;
}

function normalizeLastModified(value) {
  if (value === null) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return nowUtc(parsed);
}

function defaultRequest({ url, pinnedAddress, policy }) {
  return new Promise((resolveRequest, rejectRequest) => {
    let responseReceived = false;
    let responseStream;
    const request = httpsRequest(
      {
        protocol: "https:",
        hostname: url.hostname,
        servername: url.hostname,
        port: 443,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        agent: false,
        minVersion: policy.minimumTlsVersion,
        maxHeaderSize: policy.maximumHeaderBytes,
        headers: {
          accept: policy.acceptedContentTypes.join(", "),
          "accept-encoding": "identity",
          connection: "close",
          "user-agent": "Starfiniti-Loyalty-provider-source-snapshot/1",
        },
        lookup: (_hostname, options, callback) => {
          if (options.all) {
            callback(null, [pinnedAddress]);
            return;
          }
          callback(null, pinnedAddress.address, pinnedAddress.family);
        },
      },
      (response) => {
        responseReceived = true;
        responseStream = response;
        response.on("close", () => clearTimeout(timeout));
        resolveRequest({
          status: response.statusCode ?? 0,
          headers: response.headers,
          body: response,
          discard: () => response.destroy(),
          isComplete: () => response.complete,
        });
      },
    );
    const timeout = setTimeout(() => {
      const error = new Error("provider request timed out");
      responseStream?.destroy(error);
      request.destroy(error);
    }, policy.timeoutMs);
    timeout.unref();
    request.on("error", () => {
      if (!responseReceived) {
        clearTimeout(timeout);
        rejectRequest(new Error("provider unavailable"));
      }
    });
    request.end();
  });
}

const defaultRuntime = {
  clock: () => nowUtc(),
  lookup: (hostname) => dnsLookup(hostname, { all: true, verbatim: true }),
  request: defaultRequest,
};

function allowedHosts(provider, policy) {
  const canonical = parseHttpsUrl(provider.source, `${provider.id} source`);
  return new Set([
    canonical.hostname.toLowerCase(),
    ...(policy.allowedRedirectHosts[provider.id] ?? []),
  ]);
}

function resolveRedirect(currentUrl, location, provider, policy) {
  if (location === null) fail(`${provider.id} redirect has no location`);
  let target;
  try {
    target = new URL(location, currentUrl);
  } catch {
    fail(`${provider.id} redirect location is invalid`);
  }
  const parsed = parseHttpsUrl(target.href, `${provider.id} redirect`);
  if (!allowedHosts(provider, policy).has(parsed.hostname.toLowerCase())) {
    fail(`${provider.id} redirect host is not allowlisted`);
  }
  return parsed;
}

async function hashFinalResponse(response, provider, policy, fetchedAt) {
  const contentEncoding =
    boundedHeader(response.headers, "content-encoding") ?? "identity";
  if (
    !policy.acceptedContentEncodings.includes(contentEncoding.toLowerCase())
  ) {
    fail(`${provider.id} content encoding is not accepted`);
  }
  const contentType = normalizeContentType(
    boundedHeader(response.headers, "content-type"),
    policy.acceptedContentTypes,
  );
  const declaredLength = parseDeclaredLength(
    boundedHeader(response.headers, "content-length"),
    policy.maximumResponseBytes,
  );
  const sha256 = createHash("sha256");
  let bytes = 0;
  try {
    for await (const chunk of response.body) {
      const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += value.length;
      if (bytes > policy.maximumResponseBytes) {
        fail(`${provider.id} response exceeds the byte bound`);
      }
      sha256.update(value);
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("Provider source snapshot failed:")
    ) {
      throw error;
    }
    fail(`${provider.id} response stream failed`);
  }
  if (response.isComplete && response.isComplete() !== true) {
    fail(`${provider.id} response stream was incomplete`);
  }
  if (bytes === 0) fail(`${provider.id} response is empty`);
  if (declaredLength !== null && declaredLength !== bytes) {
    fail(`${provider.id} response length differs from content-length`);
  }
  const etag = boundedHeader(response.headers, "etag");
  return {
    fetchedAt,
    status: 200,
    contentType,
    bytes,
    sha256: sha256.digest("hex"),
    lastModified: normalizeLastModified(
      boundedHeader(response.headers, "last-modified"),
    ),
    etagSha256: etag === null ? null : digest(etag),
  };
}

async function captureProvider(provider, policy, runtime = defaultRuntime) {
  const canonical = parseHttpsUrl(provider.source, `${provider.id} source`);
  let current = canonical;
  const visited = new Set();
  for (
    let redirects = 0;
    redirects <= policy.maximumRedirects;
    redirects += 1
  ) {
    if (visited.has(current.href))
      fail(`${provider.id} redirect loop detected`);
    visited.add(current.href);
    if (!allowedHosts(provider, policy).has(current.hostname.toLowerCase())) {
      fail(`${provider.id} destination host is not allowlisted`);
    }
    const addresses = await resolvePublicAddresses(current.hostname, runtime);
    let response;
    try {
      response = await runtime.request({
        url: current,
        pinnedAddress: addresses[0],
        policy,
      });
    } catch {
      fail(`${provider.id} official source is unavailable`);
    }
    if (redirectStatuses.has(response.status)) {
      response.discard?.();
      if (redirects === policy.maximumRedirects) {
        fail(`${provider.id} exceeded the redirect bound`);
      }
      current = resolveRedirect(
        current,
        boundedHeader(response.headers, "location"),
        provider,
        policy,
      );
      continue;
    }
    if (response.status !== 200) {
      response.discard?.();
      fail(`${provider.id} official source returned HTTP ${response.status}`);
    }
    const fetchedAt = runtime.clock();
    exactUtc(fetchedAt, `${provider.id} fetchedAt`);
    try {
      const hashed = await hashFinalResponse(
        response,
        provider,
        policy,
        fetchedAt,
      );
      return {
        id: provider.id,
        source: provider.source,
        finalUrl: current.href,
        ...hashed,
      };
    } catch (error) {
      response.discard?.();
      throw error;
    }
  }
  fail(`${provider.id} did not produce a final response`);
}

async function captureSnapshot(
  plan,
  planRaw,
  candidateCommit,
  runtime = defaultRuntime,
) {
  const policy = validatePlan(plan);
  if (!commitPattern.test(candidateCommit)) {
    fail("candidate commit is invalid");
  }
  const observedAt = runtime.clock();
  exactUtc(observedAt, "snapshot observedAt");
  const sources = [];
  for (const provider of plan.providerCatalogue) {
    sources.push(await captureProvider(provider, policy, runtime));
  }
  const completedAt = runtime.clock();
  exactUtc(completedAt, "snapshot completedAt");
  const snapshot = {
    schema: snapshotSchema,
    observedAt,
    completedAt,
    candidateCommit,
    planSha256: digest(planRaw),
    catalogueCount: sources.length,
    complete: true,
    contentRetained: false,
    reviewComplete: false,
    impactClassified: false,
    installedEvidenceComplete: false,
    limitation,
    sources,
  };
  validateSnapshot(snapshot, plan, planRaw, candidateCommit);
  return snapshot;
}

function validateSnapshot(snapshot, plan, planRaw, expectedCommit = null) {
  const policy = validatePlan(plan);
  exactObjectKeys(
    snapshot,
    [
      "schema",
      "observedAt",
      "completedAt",
      "candidateCommit",
      "planSha256",
      "catalogueCount",
      "complete",
      "contentRetained",
      "reviewComplete",
      "impactClassified",
      "installedEvidenceComplete",
      "limitation",
      "sources",
    ],
    "provider source snapshot",
  );
  const observedAt = exactUtc(snapshot.observedAt, "snapshot observedAt");
  const completedAt = exactUtc(snapshot.completedAt, "snapshot completedAt");
  if (
    snapshot.schema !== snapshotSchema ||
    completedAt < observedAt ||
    !commitPattern.test(snapshot.candidateCommit) ||
    (expectedCommit !== null && snapshot.candidateCommit !== expectedCommit) ||
    snapshot.planSha256 !== digest(planRaw) ||
    snapshot.catalogueCount !== providerSources.size ||
    snapshot.complete !== true ||
    snapshot.contentRetained !== false ||
    snapshot.reviewComplete !== false ||
    snapshot.impactClassified !== false ||
    snapshot.installedEvidenceComplete !== false ||
    snapshot.limitation !== limitation
  ) {
    fail("snapshot identity completeness or non-review assertions differ");
  }
  if (!Array.isArray(snapshot.sources)) fail("snapshot sources are missing");
  const sourceIds = new Set(snapshot.sources.map((source) => source?.id));
  if (sourceIds.size !== snapshot.sources.length) {
    fail("snapshot sources contain a duplicate id");
  }
  exactSet(sourceIds, new Set(providerSources.keys()), "snapshot sources");
  for (let index = 0; index < snapshot.sources.length; index += 1) {
    const source = snapshot.sources[index];
    const provider = plan.providerCatalogue[index];
    exactObjectKeys(
      source,
      [
        "id",
        "source",
        "finalUrl",
        "fetchedAt",
        "status",
        "contentType",
        "bytes",
        "sha256",
        "lastModified",
        "etagSha256",
      ],
      `snapshot source ${index}`,
    );
    const fetchedAt = exactUtc(source.fetchedAt, `${source.id} fetchedAt`);
    const finalUrl = parseHttpsUrl(source.finalUrl, `${source.id} final URL`);
    if (
      source.id !== provider.id ||
      source.source !== provider.source ||
      source.source !== providerSources.get(source.id) ||
      !allowedHosts(provider, policy).has(finalUrl.hostname.toLowerCase()) ||
      source.status !== 200 ||
      !policy.acceptedContentTypes.includes(source.contentType) ||
      !Number.isInteger(source.bytes) ||
      source.bytes < 1 ||
      source.bytes > policy.maximumResponseBytes ||
      !digestPattern.test(source.sha256) ||
      /^0{64}$/u.test(source.sha256) ||
      fetchedAt < observedAt ||
      fetchedAt > completedAt ||
      (source.lastModified !== null &&
        !Number.isFinite(
          exactUtc(source.lastModified, `${source.id} lastModified`),
        )) ||
      (source.etagSha256 !== null &&
        (!digestPattern.test(source.etagSha256) ||
          /^0{64}$/u.test(source.etagSha256)))
    ) {
      fail(`${source.id} snapshot fact differs from the bounded contract`);
    }
  }
  return snapshot;
}

function validateOutputPath(outputPath) {
  if (
    typeof outputPath !== "string" ||
    !isAbsolute(outputPath) ||
    extname(outputPath).toLowerCase() !== ".json" ||
    /[\u0000-\u001f\u007f]/u.test(outputPath)
  ) {
    fail("output path must be an absolute JSON path");
  }
  const absolute = resolve(outputPath);
  let parentStatus;
  try {
    parentStatus = lstatSync(dirname(absolute));
  } catch {
    fail("output parent must be a pre-existing regular directory");
  }
  if (!parentStatus.isDirectory() || parentStatus.isSymbolicLink()) {
    fail("output parent must be a pre-existing regular directory");
  }
  return absolute;
}

function writeSnapshot(outputPath, snapshot) {
  const absolute = validateOutputPath(outputPath);
  const bytes = Buffer.from(`${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  let descriptor;
  let created = false;
  let completed = false;
  let createdIdentity;
  try {
    descriptor = openSync(
      absolute,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    created = true;
    const openedStatus = fstatSync(descriptor);
    if (!openedStatus.isFile()) {
      fail("snapshot output descriptor is not a regular file");
    }
    createdIdentity = { dev: openedStatus.dev, ino: openedStatus.ino };
    let offset = 0;
    while (offset < bytes.length) {
      const count = writeSync(
        descriptor,
        bytes,
        offset,
        bytes.length - offset,
        offset,
      );
      if (count === 0) fail("snapshot write stopped before completion");
      offset += count;
    }
    fsyncSync(descriptor);
    const status = fstatSync(descriptor);
    if (
      !status.isFile() ||
      status.size !== bytes.length ||
      (process.platform !== "win32" && (status.mode & 0o777) !== 0o600)
    ) {
      fail("written snapshot is not an exact bounded regular file");
    }
    closeSync(descriptor);
    descriptor = undefined;
    const pathStatus = lstatSync(absolute);
    if (
      !pathStatus.isFile() ||
      pathStatus.dev !== status.dev ||
      pathStatus.ino !== status.ino
    ) {
      fail("written snapshot path identity differs");
    }
    completed = true;
    return { path: absolute, bytes: bytes.length, sha256: digest(bytes) };
  } catch (error) {
    if (error && typeof error === "object" && error.code === "EEXIST") {
      fail("output path already exists; snapshots are never overwritten");
    }
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (created && !completed && createdIdentity) {
      try {
        const status = lstatSync(absolute);
        if (
          status.isFile() &&
          status.dev === createdIdentity.dev &&
          status.ino === createdIdentity.ino
        ) {
          unlinkSync(absolute);
        }
      } catch (error) {
        if (error && typeof error === "object" && error.code === "ENOENT") {
          // The complete file can be absent only after an earlier failure cleanup.
        }
      }
    }
  }
}

function gitOutput(args) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    fail(`git ${args.join(" ")} failed`);
  }
}

function exactCleanHead(expectedCommit = null) {
  const topLevel = resolve(gitOutput(["rev-parse", "--show-toplevel"]));
  const sameRoot =
    process.platform === "win32"
      ? topLevel.toLowerCase() === root.toLowerCase()
      : topLevel === root;
  if (!sameRoot) fail("collector is not running at the repository root");
  const commit = gitOutput(["rev-parse", "--verify", "HEAD"]);
  if (!commitPattern.test(commit)) fail("HEAD is not an exact commit");
  if (expectedCommit !== null && commit !== expectedCommit) {
    fail("HEAD changed during source capture");
  }
  const status = gitOutput([
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]);
  if (status !== "") fail("source capture requires a clean exact HEAD");
  return commit;
}

function loadPlan() {
  const raw = readStableFile(
    planPath,
    256 * 1024,
    "continuous-improvement plan",
  );
  let parsed;
  try {
    parsed = YAML.parse(raw.toString("utf8"));
  } catch {
    fail("continuous-improvement plan YAML is invalid");
  }
  validatePlan(parsed);
  return { plan: parsed, raw };
}

function mockResponse({
  status = 200,
  body = Buffer.from("official-source", "utf8"),
  headers = {},
  complete = true,
} = {}) {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
  return {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-length": String(bytes.length),
      ...headers,
    },
    body: Readable.from([bytes]),
    discard: () => undefined,
    isComplete: () => complete,
  };
}

async function runSelfTest(plan, planRaw) {
  let passed = 0;
  const expectFailure = async (label, expected, action) => {
    try {
      await action();
    } catch (error) {
      if (error instanceof Error && error.message.includes(expected)) {
        passed += 1;
        return;
      }
      throw error;
    }
    fail(`self-test accepted ${label}`);
  };
  const fixtureCommit = "a".repeat(40);
  let networkCalls = 0;
  const runtime = {
    clock: () => "2026-08-28T20:00:00Z",
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    request: async () => {
      networkCalls += 1;
      return mockResponse();
    },
  };
  const positive = await captureSnapshot(plan, planRaw, fixtureCommit, runtime);
  validateSnapshot(positive, plan, planRaw, fixtureCommit);
  if (networkCalls !== providerSources.size) {
    fail("positive self-test did not cover the exact provider catalogue");
  }
  passed += 1;

  await expectFailure("missing catalogue source", "closed set", () => {
    const changed = structuredClone(plan);
    changed.providerCatalogue.pop();
    validatePlan(changed);
  });
  await expectFailure("duplicate catalogue source", "duplicate id", () => {
    const changed = structuredClone(plan);
    changed.providerCatalogue.at(-1).id = changed.providerCatalogue[0].id;
    validatePlan(changed);
  });
  await expectFailure(
    "canonical source drift",
    "source or review cadence",
    () => {
      const changed = structuredClone(plan);
      changed.providerCatalogue[0].source = "https://supabase.com/docs";
      validatePlan(changed);
    },
  );
  await expectFailure("missing snapshot source", "closed set", () => {
    const changed = structuredClone(positive);
    changed.sources.pop();
    validateSnapshot(changed, plan, planRaw, fixtureCommit);
  });
  await expectFailure("duplicate snapshot source", "duplicate id", () => {
    const changed = structuredClone(positive);
    changed.sources.at(-1).id = changed.sources[0].id;
    validateSnapshot(changed, plan, planRaw, fixtureCommit);
  });
  await expectFailure("source fact drift", "bounded contract", () => {
    const changed = structuredClone(positive);
    changed.sources[0].source = "https://supabase.com/docs";
    validateSnapshot(changed, plan, planRaw, fixtureCommit);
  });
  await expectFailure(
    "retained provider content",
    "non-review assertions",
    () => {
      const changed = structuredClone(positive);
      changed.contentRetained = true;
      validateSnapshot(changed, plan, planRaw, fixtureCommit);
    },
  );
  await expectFailure("false completed review", "non-review assertions", () => {
    const changed = structuredClone(positive);
    changed.reviewComplete = true;
    validateSnapshot(changed, plan, planRaw, fixtureCommit);
  });
  await expectFailure("bad source digest", "bounded contract", () => {
    const changed = structuredClone(positive);
    changed.sources[0].sha256 = "0".repeat(64);
    validateSnapshot(changed, plan, planRaw, fixtureCommit);
  });
  await expectFailure(
    "missing byte-preservation attribute",
    "byte-preservation attribute differs",
    () => validateGitAttributesBytes(Buffer.from("*.json text\n", "utf8")),
  );

  const provider = plan.providerCatalogue[0];
  const policy = plan.providerSourceSnapshot;
  await expectFailure("private DNS", "private reserved", () =>
    captureProvider(provider, policy, {
      ...runtime,
      lookup: async () => [{ address: "127.0.0.1", family: 4 }],
    }),
  );
  await expectFailure("IPv4-mapped private DNS", "private reserved", () =>
    captureProvider(provider, policy, {
      ...runtime,
      lookup: async () => [{ address: "::ffff:127.0.0.1", family: 6 }],
    }),
  );
  await expectFailure("mixed DNS", "private reserved", () =>
    captureProvider(provider, policy, {
      ...runtime,
      lookup: async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.1", family: 4 },
      ],
    }),
  );
  await expectFailure("insecure redirect", "public HTTPS URL", () =>
    captureProvider(provider, policy, {
      ...runtime,
      request: async () =>
        mockResponse({
          status: 302,
          headers: { location: "http://supabase.com/changelog.md" },
        }),
    }),
  );
  await expectFailure("query-bearing redirect", "public HTTPS URL", () =>
    captureProvider(provider, policy, {
      ...runtime,
      request: async () =>
        mockResponse({
          status: 302,
          headers: { location: "https://supabase.com/changelog.md?token=x" },
        }),
    }),
  );
  await expectFailure("unapproved redirect host", "not allowlisted", () =>
    captureProvider(provider, policy, {
      ...runtime,
      request: async () =>
        mockResponse({
          status: 302,
          headers: { location: "https://example.org/changelog.md" },
        }),
    }),
  );
  await expectFailure("invalid content type", "is not accepted", () =>
    captureProvider(provider, policy, {
      ...runtime,
      request: async () =>
        mockResponse({
          headers: { "content-type": "application/octet-stream" },
        }),
    }),
  );
  await expectFailure("compressed response", "encoding is not accepted", () =>
    captureProvider(provider, policy, {
      ...runtime,
      request: async () =>
        mockResponse({ headers: { "content-encoding": "gzip" } }),
    }),
  );
  await expectFailure(
    "declared oversized response",
    "exceeds the byte bound",
    () =>
      captureProvider(provider, policy, {
        ...runtime,
        request: async () =>
          mockResponse({
            headers: {
              "content-length": String(policy.maximumResponseBytes + 1),
            },
          }),
      }),
  );
  await expectFailure("truncated response", "differs from content-length", () =>
    captureProvider(provider, policy, {
      ...runtime,
      request: async () =>
        mockResponse({
          body: "short",
          headers: { "content-length": "10" },
        }),
    }),
  );
  await expectFailure("incomplete response", "stream was incomplete", () =>
    captureProvider(provider, policy, {
      ...runtime,
      request: async () => mockResponse({ complete: false }),
    }),
  );

  let opensshCalls = 0;
  const openssh = plan.providerCatalogue.find((item) => item.id === "openssh");
  const redirected = await captureProvider(openssh, policy, {
    ...runtime,
    request: async () => {
      opensshCalls += 1;
      return opensshCalls === 1
        ? mockResponse({
            status: 301,
            headers: {
              location: "https://www.openssh.org/releasenotes.html",
            },
          })
        : mockResponse();
    },
  });
  if (
    opensshCalls !== 2 ||
    redirected.finalUrl !== "https://www.openssh.org/releasenotes.html"
  ) {
    fail("allowlisted redirect self-test failed");
  }
  passed += 1;

  await expectFailure("relative output", "absolute JSON path", () =>
    writeSnapshot("provider-source-snapshot.json", positive),
  );
  const temporary = mkdtempSync(
    join(tmpdir(), "starfiniti-provider-source-snapshot-"),
  );
  try {
    await expectFailure(
      "missing output parent",
      "pre-existing regular directory",
      () =>
        writeSnapshot(join(temporary, "missing", "snapshot.json"), positive),
    );
    const output = join(temporary, "snapshot.json");
    writeSnapshot(output, positive);
    await expectFailure("output reuse", "never overwritten", () =>
      writeSnapshot(output, positive),
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }

  console.log(
    `Validated ${providerSources.size} official provider sources and ${passed} deterministic collector cases without network access.`,
  );
}

function parseArguments(args) {
  if (args.length === 1 && args[0] === "--self-test") {
    return { mode: "self-test" };
  }
  if (args[0] === "--capture" && args.length === 3 && args[1] === "--out") {
    return { mode: "capture", output: args[2] };
  }
  if (args[0] === "--verify" && args.length === 3 && args[1] === "--in") {
    return { mode: "verify", input: args[2] };
  }
  fail(
    "usage: --self-test | --capture --out <absolute-new-json-path> | --verify --in <absolute-json-path>",
  );
}

async function main() {
  const command = parseArguments(process.argv.slice(2));
  validateGitAttributes();
  const { plan, raw: planRaw } = loadPlan();
  if (command.mode === "self-test") {
    await runSelfTest(plan, planRaw);
    return;
  }
  if (command.mode === "verify") {
    const input = validateOutputPath(command.input);
    const raw = readStableFile(input, 256 * 1024, "provider source snapshot");
    let snapshot;
    try {
      snapshot = JSON.parse(raw.toString("utf8"));
    } catch {
      fail("provider source snapshot JSON is invalid");
    }
    validateSnapshot(snapshot, plan, planRaw);
    console.log(
      `Verified ${snapshot.sources.length}-source snapshot ${input}; candidate ${snapshot.candidateCommit}.`,
    );
    return;
  }

  const output = validateOutputPath(command.output);
  const candidateCommit = exactCleanHead();
  const snapshot = await captureSnapshot(
    plan,
    planRaw,
    candidateCommit,
    defaultRuntime,
  );
  exactCleanHead(candidateCommit);
  const currentPlanRaw = readStableFile(
    planPath,
    256 * 1024,
    "continuous-improvement plan",
  );
  if (digest(currentPlanRaw) !== digest(planRaw)) {
    fail("continuous-improvement plan changed during source capture");
  }
  const written = writeSnapshot(output, snapshot);
  console.log(
    `Captured ${snapshot.sources.length} official source digests in ${written.path}; ${written.bytes} bytes; SHA-256 ${written.sha256}; no provider content retained and no review completed.`,
  );
}

main().catch((error) => {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error("Provider source snapshot failed with an unknown error");
  }
  process.exitCode = 1;
});
