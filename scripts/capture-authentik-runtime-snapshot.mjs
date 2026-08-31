import { createHash } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import {
  chmodSync,
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { Readable } from "node:stream";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const planPath = join(
  root,
  "infrastructure/governance/authentik-runtime-capture.yaml",
);
const snapshotSchema = "starfiniti.authentik-runtime-snapshot.v1";
const commitPattern = /^[a-f0-9]{40}$/u;
const redirectStatuses = new Set([301, 302, 303, 307, 308]);

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
  throw new Error(`Authentik runtime snapshot failed: ${message}`);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} is not an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    fail(`${label} keys differ`);
  }
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

function validatePlan(plan) {
  exactKeys(
    plan,
    [
      "schema",
      "providerId",
      "origin",
      "entryPath",
      "healthPaths",
      "assetRoles",
      "network",
      "output",
      "claims",
      "authority",
    ],
    "plan",
  );
  if (
    plan.schema !== "starfiniti.authentik-runtime-capture-plan.v1" ||
    plan.providerId !== "authentik" ||
    plan.origin !== "https://auth.starfiniti.com" ||
    plan.entryPath !== "/"
  ) {
    fail("plan identity differs");
  }
  exactKeys(plan.healthPaths, ["live", "ready"], "health paths");
  if (
    plan.healthPaths.live !== "/-/health/live/" ||
    plan.healthPaths.ready !== "/-/health/ready/"
  ) {
    fail("health paths differ");
  }
  exactKeys(
    plan.assetRoles,
    ["stylesheet", "polyfill", "flowInterface"],
    "asset roles",
  );
  for (const pattern of Object.values(plan.assetRoles)) {
    const regex = new RegExp(pattern, "u");
    if (!regex.source.includes("(?<version>")) {
      fail("asset role has no named version capture");
    }
  }
  exactKeys(
    plan.network,
    [
      "method",
      "minimumTlsVersion",
      "timeoutMs",
      "maximumRedirects",
      "redirectPolicy",
      "dnsPolicy",
      "contentEncoding",
      "maximumHeaderBytes",
      "maximumRootBytes",
      "maximumAssetBytes",
      "maximumHealthBytes",
    ],
    "network policy",
  );
  if (
    plan.network.method !== "GET" ||
    plan.network.minimumTlsVersion !== "TLSv1.2" ||
    plan.network.timeoutMs !== 10_000 ||
    plan.network.maximumRedirects !== 2 ||
    plan.network.redirectPolicy !== "same-origin-relative-only" ||
    plan.network.dnsPolicy !== "public-addresses-only-and-socket-pinned" ||
    plan.network.contentEncoding !== "identity" ||
    plan.network.maximumHeaderBytes !== 32_768 ||
    plan.network.maximumRootBytes !== 2_097_152 ||
    plan.network.maximumAssetBytes !== 8_388_608 ||
    plan.network.maximumHealthBytes !== 4_096
  ) {
    fail("network policy differs");
  }
  exactKeys(
    plan.output,
    [
      "rawContentRetained",
      "responseHeadersRetained",
      "cookiesRetained",
      "addressesRetained",
      "mode",
    ],
    "output policy",
  );
  if (
    Object.entries(plan.output)
      .filter(([key]) => key !== "mode")
      .some(([, value]) => value !== false) ||
    plan.output.mode !== "0600"
  ) {
    fail("output policy differs");
  }
  exactKeys(plan.claims, ["proves", "doesNotProve"], "claims");
  if (
    !Array.isArray(plan.claims.proves) ||
    plan.claims.proves.length !== 3 ||
    !Array.isArray(plan.claims.doesNotProve) ||
    plan.claims.doesNotProve.length !== 5
  ) {
    fail("claim boundary differs");
  }
  exactKeys(
    plan.authority,
    [
      "credentialsUsed",
      "privateConfigurationRead",
      "productionMutation",
      "upgradeAccepted",
      "deploymentApproved",
    ],
    "authority",
  );
  if (Object.values(plan.authority).some((value) => value !== false)) {
    fail("plan authority must remain false");
  }
  return plan;
}

function isPublicAddress(address) {
  const family = isIP(address);
  return (
    (family === 4 && !addressBlockList.check(address, "ipv4")) ||
    (family === 6 && !addressBlockList.check(address, "ipv6"))
  );
}

async function resolvePublic(hostname, runtime) {
  let answers;
  try {
    answers = await runtime.lookup(hostname);
  } catch {
    fail("public DNS lookup failed");
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
    fail("DNS answers include a private reserved or invalid address");
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
    value.length > 4_096 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
  ) {
    fail(`${name} header is invalid`);
  }
  return value.trim();
}

function defaultRequest({ url, address, plan }) {
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
        minVersion: plan.network.minimumTlsVersion,
        maxHeaderSize: plan.network.maximumHeaderBytes,
        headers: {
          accept:
            "text/html, text/css, text/javascript, application/javascript, */*;q=0.1",
          "accept-encoding": "identity",
          connection: "close",
          "user-agent": "Starfiniti-Loyalty-authentik-runtime-snapshot/1",
        },
        lookup: (_hostname, options, callback) => {
          if (options.all) callback(null, [address]);
          else callback(null, address.address, address.family);
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
          tls: {
            protocol: response.socket.getProtocol?.() ?? "unknown",
            authorized: response.socket.authorized === true,
          },
          discard: () => response.destroy(),
          complete: () => response.complete,
        });
      },
    );
    const timeout = setTimeout(() => {
      const error = new Error("request timed out");
      responseStream?.destroy(error);
      request.destroy(error);
    }, plan.network.timeoutMs);
    timeout.unref();
    request.on("error", () => {
      if (!responseReceived) {
        clearTimeout(timeout);
        rejectRequest(new Error("endpoint unavailable"));
      }
    });
    request.end();
  });
}

const defaultRuntime = Object.freeze({
  lookup: (hostname) => dnsLookup(hostname, { all: true, verbatim: true }),
  request: defaultRequest,
  clock: () => Date.now(),
});

async function readBoundedResponse(response, maximumBytes, retainBody) {
  const encoding = boundedHeader(response.headers, "content-encoding");
  if (encoding !== null && encoding.toLowerCase() !== "identity") {
    response.discard();
    fail("response content encoding is not identity");
  }
  const declared = boundedHeader(response.headers, "content-length");
  if (declared !== null) {
    if (!/^(?:0|[1-9][0-9]*)$/u.test(declared)) {
      response.discard();
      fail("content-length header is invalid");
    }
    const length = Number(declared);
    if (!Number.isSafeInteger(length) || length > maximumBytes) {
      response.discard();
      fail("declared response length exceeds the byte bound");
    }
  }
  const chunks = [];
  const hash = createHash("sha256");
  let bytes = 0;
  try {
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > maximumBytes) fail("response exceeds the byte bound");
      hash.update(chunk);
      if (retainBody) chunks.push(Buffer.from(chunk));
    }
  } catch (error) {
    response.discard();
    throw error;
  }
  if (!response.complete()) fail("response ended before completion");
  if (declared !== null && bytes !== Number(declared)) {
    fail("response length differs from content-length");
  }
  return {
    bytes,
    sha256: hash.digest("hex"),
    body: retainBody ? Buffer.concat(chunks) : null,
  };
}

function contentType(headers, allowed, allowAbsentForEmpty, bytes) {
  const raw = boundedHeader(headers, "content-type");
  if (raw === null && allowAbsentForEmpty && bytes === 0) return null;
  if (raw === null) fail("content-type header is missing");
  const normalized = raw.split(";", 1)[0].trim().toLowerCase();
  if (!allowed.includes(normalized)) {
    fail(`content type ${normalized || "empty"} is not accepted`);
  }
  return normalized;
}

function sameOriginRelativeRedirect(current, location, origin) {
  if (
    typeof location !== "string" ||
    location.length === 0 ||
    location.length > 2_048 ||
    !location.startsWith("/") ||
    location.startsWith("//") ||
    /[\u0000-\u001f\u007f]/u.test(location)
  ) {
    fail("redirect location is not a relative same-origin path");
  }
  const target = new URL(location, current);
  if (
    target.origin !== origin ||
    target.username ||
    target.password ||
    target.hash
  ) {
    fail("redirect escaped the fixed origin");
  }
  return target;
}

async function fetchEndpoint(
  url,
  { maximumBytes, retainBody, allowRedirect },
  plan,
  runtime,
) {
  let current = url;
  const redirects = [];
  for (
    let attempt = 0;
    attempt <= plan.network.maximumRedirects;
    attempt += 1
  ) {
    const answers = await resolvePublic(current.hostname, runtime);
    let response;
    try {
      response = await runtime.request({
        url: current,
        address: answers[0],
        plan,
      });
    } catch {
      fail(`${current.pathname} request failed`);
    }
    if (response.tls.authorized !== true) {
      response.discard();
      fail("TLS peer was not authorized");
    }
    if (redirectStatuses.has(response.status)) {
      if (!allowRedirect || attempt === plan.network.maximumRedirects) {
        response.discard();
        fail("redirect is not allowed");
      }
      let target;
      try {
        target = sameOriginRelativeRedirect(
          current,
          boundedHeader(response.headers, "location"),
          plan.origin,
        );
      } finally {
        response.discard();
      }
      redirects.push({ status: response.status, path: target.pathname });
      current = target;
      continue;
    }
    if (response.status !== 200) {
      response.discard();
      fail(`${current.pathname} returned HTTP ${response.status}`);
    }
    const read = await readBoundedResponse(response, maximumBytes, retainBody);
    return {
      finalUrl: current,
      redirects,
      status: response.status,
      headers: response.headers,
      tls: response.tls,
      ...read,
    };
  }
  fail("redirect limit exhausted");
}

function parseRootHtml(html, plan) {
  const familyMatches = [
    ...html.matchAll(/\bversionFamily\s*:\s*["']([0-9]{4}\.[0-9]{1,2})["']/gu),
  ].map((match) => match[1]);
  const families = [...new Set(familyMatches)];
  if (families.length !== 1) fail("root HTML has no unique version family");

  const references = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/gu)].map(
    (match) => match[1],
  );
  const assets = [];
  for (const [role, pattern] of Object.entries(plan.assetRoles)) {
    const regex = new RegExp(pattern, "u");
    const matches = references
      .map((path) => ({ path, match: regex.exec(path) }))
      .filter((candidate) => candidate.match !== null);
    if (matches.length !== 1) fail(`${role} asset reference is not unique`);
    assets.push({
      role,
      path: matches[0].path,
      version: matches[0].match.groups.version,
    });
  }
  const versions = [...new Set(assets.map((asset) => asset.version))];
  if (versions.length !== 1 || !versions[0].startsWith(`${families[0]}.`)) {
    fail("asset versions do not share the unique version family");
  }
  return { family: families[0], exact: versions[0], assets };
}

async function capture(plan, runtime = defaultRuntime) {
  const rootResult = await fetchEndpoint(
    new URL(plan.entryPath, plan.origin),
    {
      maximumBytes: plan.network.maximumRootBytes,
      retainBody: true,
      allowRedirect: true,
    },
    plan,
    runtime,
  );
  const rootType = contentType(
    rootResult.headers,
    ["text/html"],
    false,
    rootResult.bytes,
  );
  const parsed = parseRootHtml(rootResult.body.toString("utf8"), plan);
  const assets = [];
  for (const asset of parsed.assets) {
    const result = await fetchEndpoint(
      new URL(asset.path, plan.origin),
      {
        maximumBytes: plan.network.maximumAssetBytes,
        retainBody: false,
        allowRedirect: false,
      },
      plan,
      runtime,
    );
    assets.push({
      role: asset.role,
      path: asset.path,
      version: asset.version,
      status: result.status,
      contentType: contentType(
        result.headers,
        ["text/css", "text/javascript", "application/javascript"],
        false,
        result.bytes,
      ),
      bytes: result.bytes,
      sha256: result.sha256,
    });
  }
  const health = {};
  for (const [name, path] of Object.entries(plan.healthPaths)) {
    const result = await fetchEndpoint(
      new URL(path, plan.origin),
      {
        maximumBytes: plan.network.maximumHealthBytes,
        retainBody: false,
        allowRedirect: false,
      },
      plan,
      runtime,
    );
    health[name] = {
      path,
      status: result.status,
      contentType: contentType(
        result.headers,
        ["text/html", "text/plain", "application/json"],
        true,
        result.bytes,
      ),
      bytes: result.bytes,
      sha256: result.sha256,
    };
  }
  return {
    root: {
      path: plan.entryPath,
      finalPath: `${rootResult.finalUrl.pathname}${rootResult.finalUrl.search}`,
      redirects: rootResult.redirects,
      status: rootResult.status,
      contentType: rootType,
      bytes: rootResult.bytes,
      sha256: rootResult.sha256,
      tlsProtocol: rootResult.tls.protocol,
    },
    version: { family: parsed.family, exact: parsed.exact, assets },
    health,
  };
}

function gitOutput(args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function cleanCommit() {
  const commit = gitOutput(["rev-parse", "HEAD"]);
  if (!commitPattern.test(commit)) fail("HEAD is not an exact commit");
  if (gitOutput(["status", "--porcelain=v1", "--untracked-files=all"]) !== "") {
    fail("capture requires a clean worktree");
  }
  return commit;
}

function exactUtc(now) {
  return new Date(Math.floor(now / 1_000) * 1_000)
    .toISOString()
    .replace(".000Z", "Z");
}

function snapshot(plan, commit, observedAt, result) {
  return {
    schema: snapshotSchema,
    observedAt,
    repository: {
      commit,
      cleanBefore: true,
      cleanAfter: true,
      planPath: relative(root, planPath).replaceAll("\\", "/"),
      planSha256: sha256(readStableFile(planPath, 64 * 1024, "capture plan")),
    },
    provider: { id: plan.providerId, origin: plan.origin },
    transport: {
      method: plan.network.method,
      minimumTlsVersion: plan.network.minimumTlsVersion,
      dnsPublicOnly: true,
      socketPinned: true,
      contentEncoding: plan.network.contentEncoding,
      rawContentRetained: false,
      responseHeadersRetained: false,
      cookiesRetained: false,
      addressesRetained: false,
    },
    ...result,
    claims: {
      servedRuntimePatchObserved: true,
      containerImageDigestObserved: false,
      outpostVersionsObserved: false,
      privateConfigurationObserved: false,
      identityCompatibilityProven: false,
      upgradeAccepted: false,
    },
    authority: {
      credentialsUsed: false,
      productionAccess: false,
      privateConfigurationRead: false,
      productionMutation: false,
      mergeApproved: false,
      releaseApproved: false,
      deploymentApproved: false,
      productionReconciled: false,
    },
  };
}

function containsPath(base, target) {
  const child = relative(base, target);
  return (
    child === "" ||
    (child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child))
  );
}

function validateOutputPath(outputPath) {
  if (typeof outputPath !== "string" || !isAbsolute(outputPath)) {
    fail("capture output must be a new file outside the repository");
  }
  const absolute = resolve(outputPath);
  const parent = dirname(absolute);
  const parentStat = lstatSync(parent);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) {
    fail("capture output parent must be a real directory");
  }
  const realParent = realpathSync(parent);
  const realRoot = realpathSync(root);
  if (containsPath(realRoot, join(realParent, basename(absolute)))) {
    fail("capture output must be a new file outside the repository");
  }
  return absolute;
}

function writeSnapshot(outputPath, value) {
  const absolute = validateOutputPath(outputPath);
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  let descriptor;
  try {
    descriptor = openSync(
      absolute,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    if (!fstatSync(descriptor).isFile()) {
      fail("capture output is not a regular file");
    }
    writeFileSync(descriptor, bytes);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  chmodSync(absolute, 0o600);
  return { absolute, bytes };
}

function fakeResponse({
  status = 200,
  headers = {},
  body = "",
  authorized = true,
}) {
  const bytes = Buffer.from(body);
  return {
    status,
    headers,
    body: Readable.from([bytes]),
    tls: { protocol: "TLSv1.3", authorized },
    discard() {},
    complete: () => true,
  };
}

function fixtureHtml(version = "2026.5.6") {
  return `<script>window.ak={versionFamily: \"2026.5\"}</script><link href=\"/static/dist/styles/flow-${version}.css\"><script src=\"/static/dist/poly-${version}.js\"></script><script src=\"/static/dist/flow/FlowInterface-${version}.js\"></script>`;
}

function fakeRuntime(overrides = {}) {
  const bodies = new Map([
    [
      "/",
      {
        status: 302,
        headers: { location: "/flows/-/default/authentication/?next=/" },
        body: "",
      },
    ],
    [
      "/flows/-/default/authentication/",
      {
        status: 302,
        headers: {
          location: "/if/flow/starfiniti-authentication-flow/?next=%2F",
        },
        body: "",
      },
    ],
    [
      "/if/flow/starfiniti-authentication-flow/",
      {
        headers: { "content-type": "text/html; charset=utf-8" },
        body: fixtureHtml(),
      },
    ],
    [
      "/static/dist/styles/flow-2026.5.6.css",
      { headers: { "content-type": "text/css" }, body: "css" },
    ],
    [
      "/static/dist/poly-2026.5.6.js",
      { headers: { "content-type": "text/javascript" }, body: "poly" },
    ],
    [
      "/static/dist/flow/FlowInterface-2026.5.6.js",
      { headers: { "content-type": "text/javascript" }, body: "flow" },
    ],
    ["/-/health/live/", { body: "" }],
    [
      "/-/health/ready/",
      { headers: { "content-type": "text/html" }, body: "" },
    ],
  ]);
  return {
    lookup: async () =>
      overrides.answers ?? [{ address: "203.0.114.10", family: 4 }],
    request: async ({ url }) => {
      const key = url.pathname;
      const value = overrides.responses?.get(key) ?? bodies.get(key);
      if (!value) throw new Error("missing fixture");
      const response = fakeResponse(value);
      if (overrides.mutate) overrides.mutate(response, url);
      return response;
    },
    clock: () => Date.parse("2026-08-31T06:00:00Z"),
  };
}

async function selfTest(plan) {
  const positive = await capture(plan, fakeRuntime());
  if (
    positive.version.exact !== "2026.5.6" ||
    positive.version.assets.length !== 3 ||
    positive.health.live.status !== 200
  ) {
    fail("positive self-test result differs");
  }
  let repositoryOutputRejected = false;
  try {
    validateOutputPath(join(root, "forbidden-authentik-snapshot.json"));
  } catch {
    repositoryOutputRejected = true;
  }
  if (!repositoryOutputRejected) {
    fail("self-test accepted a repository-contained output path");
  }
  const cases = [
    [
      "private DNS",
      () => fakeRuntime({ answers: [{ address: "10.0.0.1", family: 4 }] }),
    ],
    [
      "loopback DNS",
      () => fakeRuntime({ answers: [{ address: "127.0.0.1", family: 4 }] }),
    ],
    [
      "unauthorized TLS",
      () =>
        fakeRuntime({
          mutate: (response) => {
            response.tls.authorized = false;
          },
        }),
    ],
    [
      "gzip",
      () =>
        fakeRuntime({
          mutate: (response, url) => {
            if (url.pathname.includes("authentication"))
              response.headers["content-encoding"] = "gzip";
          },
        }),
    ],
    [
      "external redirect",
      () => {
        const responses = new Map([
          [
            "/",
            {
              status: 302,
              headers: { location: "https://evil.invalid/" },
              body: "",
            },
          ],
        ]);
        return fakeRuntime({ responses });
      },
    ],
    [
      "protocol-relative redirect",
      () => {
        const responses = new Map([
          [
            "/",
            { status: 302, headers: { location: "//evil.invalid/" }, body: "" },
          ],
        ]);
        return fakeRuntime({ responses });
      },
    ],
    [
      "third redirect",
      () => {
        const responses = new Map([
          [
            "/if/flow/starfiniti-authentication-flow/",
            { status: 302, headers: { location: "/again" }, body: "" },
          ],
        ]);
        return fakeRuntime({ responses });
      },
    ],
    [
      "mismatched asset patch",
      () => {
        const responses = new Map([
          [
            "/if/flow/starfiniti-authentication-flow/",
            {
              headers: { "content-type": "text/html" },
              body: fixtureHtml().replace("poly-2026.5.6", "poly-2026.5.5"),
            },
          ],
        ]);
        return fakeRuntime({ responses });
      },
    ],
    [
      "missing family",
      () => {
        const responses = new Map([
          [
            "/if/flow/starfiniti-authentication-flow/",
            {
              headers: { "content-type": "text/html" },
              body: fixtureHtml().replace('versionFamily: "2026.5"', ""),
            },
          ],
        ]);
        return fakeRuntime({ responses });
      },
    ],
    [
      "duplicate asset",
      () => {
        const responses = new Map([
          [
            "/if/flow/starfiniti-authentication-flow/",
            {
              headers: { "content-type": "text/html" },
              body: `${fixtureHtml()}<script src=\"/static/dist/poly-2026.5.6.js\"></script>`,
            },
          ],
        ]);
        return fakeRuntime({ responses });
      },
    ],
    [
      "oversize",
      () =>
        fakeRuntime({
          mutate: (response, url) => {
            if (url.pathname.startsWith("/if/flow/"))
              response.headers["content-length"] = String(
                plan.network.maximumRootBytes + 1,
              );
          },
        }),
    ],
    [
      "bad type",
      () =>
        fakeRuntime({
          mutate: (response, url) => {
            if (url.pathname.startsWith("/if/flow/"))
              response.headers["content-type"] = "application/octet-stream";
          },
        }),
    ],
    [
      "asset redirect",
      () => {
        const responses = new Map([
          [
            "/static/dist/poly-2026.5.6.js",
            { status: 302, headers: { location: "/other.js" }, body: "" },
          ],
        ]);
        return fakeRuntime({ responses });
      },
    ],
    [
      "health failure",
      () => {
        const responses = new Map([
          ["/-/health/live/", { status: 503, body: "" }],
        ]);
        return fakeRuntime({ responses });
      },
    ],
  ];
  for (const [name, makeRuntime] of cases) {
    let rejected = false;
    try {
      await capture(plan, makeRuntime());
    } catch {
      rejected = true;
    }
    if (!rejected) fail(`self-test accepted ${name}`);
  }
  console.log(
    `Validated Authentik runtime capture and rejected ${cases.length} corruptions.`,
  );
}

const plan = validatePlan(
  YAML.parse(
    readStableFile(planPath, 64 * 1024, "capture plan").toString("utf8"),
  ),
);

if (process.argv.includes("--self-test")) {
  await selfTest(plan);
} else if (process.argv.includes("--capture")) {
  const outputIndex = process.argv.indexOf("--output");
  if (outputIndex < 0 || !process.argv[outputIndex + 1]) {
    fail(
      "--capture requires --output <new absolute path outside the repository>",
    );
  }
  const before = cleanCommit();
  const result = await capture(plan);
  const after = cleanCommit();
  if (after !== before) fail("HEAD changed during capture");
  const value = snapshot(
    plan,
    before,
    exactUtc(defaultRuntime.clock()),
    result,
  );
  const written = writeSnapshot(process.argv[outputIndex + 1], value);
  console.log(
    `Captured Authentik ${value.version.exact} metadata (${written.bytes.length} bytes, SHA-256 ${sha256(written.bytes)}) to ${written.absolute}.`,
  );
} else {
  fail("use --self-test or --capture --output <path>");
}
