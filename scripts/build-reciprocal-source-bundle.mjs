import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  readFileSync,
  statSync,
} from "node:fs";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  normalize,
  resolve,
  sep,
} from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { fileURLToPath } from "node:url";
import { request as httpsRequest } from "node:https";

import YAML from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const planPath = join(
  root,
  "infrastructure/testing/security/reciprocal-source-plan.yaml",
);
const licensePolicyPath = join(
  root,
  "infrastructure/testing/security/trivy.yaml",
);
const planBytes = readFileSync(planPath);
const plan = YAML.parse(planBytes.toString("utf8"));
const licensePolicyBytes = readFileSync(licensePolicyPath);
const licensePolicy = YAML.parse(licensePolicyBytes.toString("utf8"));

const allowedImages = new Set(["dashboard", "worker"]);
const sha256Pattern = /^[0-9a-f]{64}$/u;
const sha512Pattern = /^[0-9a-f]{128}$/u;
const commitPattern = /^[0-9a-f]{40}$/u;
const tagPattern = /^v\d+\.\d+\.\d+$/u;
const safeFilePattern = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/u;
const reciprocalLicenseIds = new Set(licensePolicy?.license?.reciprocal ?? []);

function fail(message) {
  throw new Error(`Reciprocal source bundle invalid: ${message}`);
}

function exactKeys(value, keys, label) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(",") !== [...keys].sort().join(",")
  ) {
    fail(`${label} shape is invalid`);
  }
}

function sortedUniqueStrings(values, label) {
  if (
    !Array.isArray(values) ||
    values.length === 0 ||
    values.some((value) => typeof value !== "string" || value.length === 0) ||
    new Set(values).size !== values.length
  ) {
    fail(`${label} must contain unique non-empty strings`);
  }
  return [...values].sort();
}

function isSafeInputFilename(value) {
  return (
    typeof value === "string" &&
    value !== "." &&
    value !== ".." &&
    /^[A-Za-z0-9_.+-]{1,128}$/u.test(value)
  );
}

function assertSafeRelativePath(value, label = "path") {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 512 ||
    value.includes("\\") ||
    value.includes("\0") ||
    isAbsolute(value) ||
    value.startsWith("/") ||
    value.split("/").some((part) => !part || part === "." || part === "..") ||
    normalize(value).split(sep).includes("..")
  ) {
    fail(`${label} is not a safe relative path`);
  }
  return value;
}

function assertHttps(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${label} is not a URL`);
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.hash
  ) {
    fail(`${label} must be credential-free HTTPS`);
  }
}

function resolveHttpsRedirect(currentUrl, location, label) {
  if (typeof location !== "string" || location.length === 0) {
    fail(`${label} redirect has no location`);
  }
  const target = new URL(location, currentUrl).toString();
  assertHttps(target, `${label} redirect URL`);
  return target;
}

function digestBytes(bytes, algorithm = "sha256") {
  return createHash(algorithm).update(bytes).digest("hex");
}

function digestFile(path, algorithm = "sha256") {
  return new Promise((resolveDigest, rejectDigest) => {
    const hash = createHash(algorithm);
    const input = createReadStream(path);
    input.on("data", (chunk) => hash.update(chunk));
    input.on("error", rejectDigest);
    input.on("end", () => resolveDigest(hash.digest("hex")));
  });
}

function licenseIds(expression) {
  if (typeof expression !== "string" || expression.length === 0) return [];
  return expression.match(/[A-Za-z0-9][A-Za-z0-9-.+]*/gu) ?? [];
}

function isReciprocalExpression(expression) {
  return licenseIds(expression).some((id) => reciprocalLicenseIds.has(id));
}

function hasReciprocalLicense(component) {
  return (component?.licenses ?? []).some((entry) => {
    const expression = entry?.expression ?? entry?.license?.id;
    return typeof expression === "string" && isReciprocalExpression(expression);
  });
}

function licenseExpression(component) {
  if (!Array.isArray(component?.licenses) || component.licenses.length !== 1) {
    fail(`${component?.name ?? "component"} must have one SBOM licence entry`);
  }
  const entry = component.licenses[0];
  const expression = entry.expression ?? entry.license?.id;
  if (typeof expression !== "string" || expression.length > 180) {
    fail(`${component.name} licence expression is invalid`);
  }
  return expression;
}

function propertyMap(component) {
  const result = new Map();
  for (const property of component?.properties ?? []) {
    if (
      typeof property?.name !== "string" ||
      typeof property?.value !== "string" ||
      result.has(property.name)
    ) {
      if (property?.name?.startsWith("syft:metadata:")) {
        fail(`${component.name} contains duplicate or invalid metadata`);
      }
      continue;
    }
    result.set(property.name, property.value);
  }
  return result;
}

function validatePlan(candidate = plan) {
  exactKeys(
    candidate,
    ["alpine", "artifact", "licenseTexts", "product", "schema"],
    "source plan",
  );
  if (candidate.schema !== "starfiniti.reciprocal-source-plan.v1") {
    fail("source plan schema is invalid");
  }
  exactKeys(
    candidate.artifact,
    [
      "archive",
      "manifest",
      "maxArchiveBytes",
      "maxExpandedBytes",
      "maxFiles",
      "notices",
    ],
    "artifact policy",
  );
  for (const key of ["archive", "manifest", "notices"]) {
    if (!safeFilePattern.test(candidate.artifact[key])) {
      fail(`artifact ${key} name is invalid`);
    }
  }
  if (
    new Set([
      candidate.artifact.archive,
      candidate.artifact.manifest,
      candidate.artifact.notices,
    ]).size !== 3 ||
    !Number.isInteger(candidate.artifact.maxArchiveBytes) ||
    candidate.artifact.maxArchiveBytes < 10_000_000 ||
    candidate.artifact.maxArchiveBytes > 500_000_000 ||
    !Number.isInteger(candidate.artifact.maxExpandedBytes) ||
    candidate.artifact.maxExpandedBytes < candidate.artifact.maxArchiveBytes ||
    candidate.artifact.maxExpandedBytes > 800_000_000 ||
    !Number.isInteger(candidate.artifact.maxFiles) ||
    candidate.artifact.maxFiles < 1000 ||
    candidate.artifact.maxFiles > 20_000
  ) {
    fail("artifact bounds are invalid");
  }

  exactKeys(
    candidate.product,
    ["images", "licenseExpression", "package", "sourcePath", "version"],
    "product source",
  );
  if (
    candidate.product.package !== "@starfiniti/dashboard" ||
    candidate.product.version !== "0.0.0" ||
    candidate.product.licenseExpression !== "AGPL-3.0-or-later" ||
    sortedUniqueStrings(candidate.product.images, "product images").join(
      ",",
    ) !== "dashboard" ||
    candidate.product.sourcePath !== "source/starfiniti"
  ) {
    fail("product source identity is invalid");
  }

  exactKeys(
    candidate.alpine,
    ["architecture", "distro", "origins", "repository"],
    "Alpine source policy",
  );
  assertHttps(candidate.alpine.repository, "Alpine repository");
  if (
    candidate.alpine.repository !==
      "https://gitlab.alpinelinux.org/alpine/aports.git" ||
    candidate.alpine.distro !== "alpine-3.24.1" ||
    candidate.alpine.architecture !== "x86_64" ||
    !Array.isArray(candidate.alpine.origins) ||
    candidate.alpine.origins.length !== 7
  ) {
    fail("Alpine repository distro architecture or origin count is invalid");
  }

  const originIds = new Set();
  const componentNames = new Set([candidate.product.package]);
  for (const origin of candidate.alpine.origins) {
    exactKeys(
      origin,
      ["aportsCommit", "aportsPath", "components", "id", "sources", "version"],
      "Alpine origin",
    );
    if (
      !/^[a-z0-9][a-z0-9-]{1,63}$/u.test(origin.id) ||
      originIds.has(origin.id) ||
      !/^[0-9A-Za-z.+_-]+-r\d+$/u.test(origin.version) ||
      !commitPattern.test(origin.aportsCommit) ||
      origin.aportsPath !== `main/${origin.id}` ||
      !Array.isArray(origin.components) ||
      origin.components.length === 0 ||
      !Array.isArray(origin.sources)
    ) {
      fail(`Alpine origin ${origin.id ?? "unknown"} is invalid`);
    }
    originIds.add(origin.id);
    for (const component of origin.components) {
      exactKeys(
        component,
        ["images", "licenseExpression", "package"],
        `${origin.id} component`,
      );
      const images = sortedUniqueStrings(
        component.images,
        `${component.package} images`,
      );
      if (
        !/^[A-Za-z0-9@][A-Za-z0-9@+._/-]{0,127}$/u.test(component.package) ||
        componentNames.has(component.package) ||
        typeof component.licenseExpression !== "string" ||
        !isReciprocalExpression(component.licenseExpression) ||
        images.some((image) => !allowedImages.has(image)) ||
        images.join(",") !== "dashboard,worker"
      ) {
        fail(`${origin.id} component inventory is invalid`);
      }
      componentNames.add(component.package);
    }
    const sourceNames = new Set();
    for (const source of origin.sources) {
      exactKeys(
        source,
        ["file", "maxBytes", "sha512", "url"],
        `${origin.id} source`,
      );
      assertHttps(source.url, `${origin.id} source URL`);
      if (
        !safeFilePattern.test(source.file) ||
        sourceNames.has(source.file) ||
        !sha512Pattern.test(source.sha512) ||
        /^0+$/u.test(source.sha512) ||
        !Number.isInteger(source.maxBytes) ||
        source.maxBytes < 1000 ||
        source.maxBytes > 250_000_000
      ) {
        fail(`${origin.id} source input is invalid`);
      }
      sourceNames.add(source.file);
    }
  }
  if (componentNames.size !== 13) {
    fail("closed reciprocal component count is invalid");
  }

  exactKeys(
    candidate.licenseTexts,
    ["commit", "items", "repository"],
    "licence-text policy",
  );
  assertHttps(candidate.licenseTexts.repository, "licence repository");
  if (
    candidate.licenseTexts.repository !==
      "https://github.com/spdx/license-list-data" ||
    !commitPattern.test(candidate.licenseTexts.commit) ||
    !Array.isArray(candidate.licenseTexts.items) ||
    candidate.licenseTexts.items.length !== 7
  ) {
    fail("licence-text source is invalid");
  }
  const expectedLicenseIds = new Set();
  for (const component of [
    candidate.product,
    ...candidate.alpine.origins.flatMap((origin) => origin.components),
  ]) {
    for (const id of licenseIds(component.licenseExpression)) {
      if (id !== "AND" && id !== "OR") expectedLicenseIds.add(id);
    }
  }
  const actualLicenseIds = new Set();
  for (const item of candidate.licenseTexts.items) {
    exactKeys(item, ["id", "maxBytes", "sha512", "url"], "licence text");
    assertHttps(item.url, `${item.id} licence URL`);
    if (
      actualLicenseIds.has(item.id) ||
      !expectedLicenseIds.has(item.id) ||
      !sha512Pattern.test(item.sha512) ||
      /^0+$/u.test(item.sha512) ||
      !Number.isInteger(item.maxBytes) ||
      item.maxBytes < 1000 ||
      item.maxBytes > 100_000 ||
      !item.url.includes(
        `/${candidate.licenseTexts.commit}/text/${item.id}.txt`,
      )
    ) {
      fail(`${item.id ?? "unknown"} licence text is invalid`);
    }
    actualLicenseIds.add(item.id);
  }
  if (
    [...expectedLicenseIds].sort().join(",") !==
    [...actualLicenseIds].sort().join(",")
  ) {
    fail("licence-text set does not cover every declared expression");
  }
}

function parsePurlQuery(purl) {
  if (typeof purl !== "string") return new Map();
  const query = purl.split("?", 2)[1] ?? "";
  return new Map(
    query
      .split("&")
      .filter(Boolean)
      .map((entry) => {
        const [key, value = ""] = entry.split("=", 2);
        return [decodeURIComponent(key), decodeURIComponent(value)];
      }),
  );
}

function expectedInventory(candidate = plan) {
  return [
    {
      name: candidate.product.package,
      version: candidate.product.version,
      licenseExpression: candidate.product.licenseExpression,
      images: [...candidate.product.images].sort(),
      kind: "product",
      origin: "starfiniti-loyalty",
      aportsCommit: null,
    },
    ...candidate.alpine.origins.flatMap((origin) =>
      origin.components.map((component) => ({
        name: component.package,
        version: origin.version,
        licenseExpression: component.licenseExpression,
        images: [...component.images].sort(),
        kind: "alpine",
        origin: origin.id,
        aportsCommit: origin.aportsCommit,
      })),
    ),
  ].sort((left, right) => left.name.localeCompare(right.name));
}

function sourceInputFacts(candidate = plan) {
  return {
    alpineRepository: candidate.alpine.repository,
    alpine: candidate.alpine.origins.map((origin) => ({
      id: origin.id,
      version: origin.version,
      aportsCommit: origin.aportsCommit,
      aportsPath: origin.aportsPath,
      sources: origin.sources.map((source) => ({ ...source })),
    })),
    licenseRepository: candidate.licenseTexts.repository,
    licenseCommit: candidate.licenseTexts.commit,
    licenseTexts: candidate.licenseTexts.items.map((item) => ({ ...item })),
  };
}

function validateSboms(dashboardDocument, workerDocument, candidate = plan) {
  validatePlan(candidate);
  const expected = expectedInventory(candidate);
  const documents = new Map([
    ["dashboard", dashboardDocument],
    ["worker", workerDocument],
  ]);
  const observedByName = new Map();

  for (const [image, document] of documents) {
    if (
      document?.bomFormat !== "CycloneDX" ||
      !Array.isArray(document.components)
    ) {
      fail(`${image} SBOM is not CycloneDX`);
    }
    const reciprocal = document.components.filter(hasReciprocalLicense);
    const expectedForImage = expected.filter((item) =>
      item.images.includes(image),
    );
    const expectedNames = expectedForImage.map((item) => item.name).sort();
    const observedNames = reciprocal.map((item) => item.name).sort();
    if (
      reciprocal.length !== expectedForImage.length ||
      new Set(observedNames).size !== observedNames.length ||
      observedNames.join(",") !== expectedNames.join(",")
    ) {
      fail(
        `${image} reciprocal inventory drifted; expected ${expectedNames.join(",")}, observed ${observedNames.join(",")}`,
      );
    }
    for (const component of reciprocal) {
      const planned = expected.find((item) => item.name === component.name);
      const expression = licenseExpression(component);
      if (
        !planned ||
        component.version !== planned.version ||
        expression !== planned.licenseExpression ||
        typeof component.purl !== "string" ||
        component.purl.length > 500
      ) {
        fail(`${image} ${component.name} version licence or purl drifted`);
      }
      if (planned.kind === "alpine") {
        const properties = propertyMap(component);
        const query = parsePurlQuery(component.purl);
        if (
          !component.purl.startsWith("pkg:apk/alpine/") ||
          query.get("arch") !== candidate.alpine.architecture ||
          query.get("distro") !== candidate.alpine.distro ||
          properties.get("syft:metadata:originPackage") !== planned.origin ||
          properties.get("syft:metadata:gitCommitOfApkPort") !==
            planned.aportsCommit
        ) {
          fail(`${image} ${component.name} Alpine provenance drifted`);
        }
      } else if (
        !component.purl.startsWith("pkg:npm/%40starfiniti/dashboard@")
      ) {
        fail("dashboard product purl drifted");
      }
      const current = observedByName.get(component.name) ?? {
        ...planned,
        images: [],
        purls: [],
      };
      current.images.push(image);
      current.purls.push(component.purl);
      observedByName.set(component.name, current);
    }
  }

  const inventory = [...observedByName.values()]
    .map((item) => ({
      ...item,
      images: [...item.images].sort(),
      purls: [...new Set(item.purls)].sort(),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  for (const item of inventory) {
    const planned = expected.find((entry) => entry.name === item.name);
    if (item.images.join(",") !== planned.images.join(",")) {
      fail(`${item.name} image placement drifted`);
    }
  }
  return inventory;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: options.env ?? process.env,
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    const detail = `${result.stderr ?? ""}`.trim().slice(0, 1000);
    fail(`${command} failed${detail ? `: ${detail}` : ""}`);
  }
  return `${result.stdout ?? ""}`.trim();
}

function assertGeneratedTemp(path) {
  const absolute = resolve(path);
  const base = resolve(tmpdir());
  if (
    absolute === base ||
    !absolute.startsWith(`${base}${sep}`) ||
    !basename(absolute).startsWith("starfiniti-reciprocal-source-")
  ) {
    fail("temporary directory boundary is invalid");
  }
}

function requestHttps(url, signal) {
  return new Promise((resolveRequest, rejectRequest) => {
    const request = httpsRequest(
      url,
      {
        headers: { "user-agent": "Starfiniti-Loyalty-source-bundle/1" },
        method: "GET",
        signal,
      },
      resolveRequest,
    );
    request.on("error", rejectRequest);
    request.end();
  });
}

async function downloadVerified(input, destination) {
  assertHttps(input.url, `${input.file ?? input.id} download URL`);
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.partial`;
  let bytes = 0;
  const sha512 = createHash("sha512");
  const label = input.file ?? input.id;
  const signal = AbortSignal.timeout(180_000);
  const visited = new Set();
  let currentUrl = input.url;
  let response;
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    if (visited.has(currentUrl)) fail(`${label} redirect loop detected`);
    visited.add(currentUrl);
    response = await requestHttps(currentUrl, signal);
    if (![301, 302, 303, 307, 308].includes(response.statusCode)) break;
    if (redirects === 5) fail(`${label} exceeded five redirects`);
    const target = resolveHttpsRedirect(
      currentUrl,
      response.headers.location,
      label,
    );
    response.destroy();
    currentUrl = target;
    response = undefined;
  }
  if (!response || response.statusCode < 200 || response.statusCode >= 300) {
    fail(
      `${input.file ?? input.id} download returned HTTP ${response?.statusCode ?? "unknown"}`,
    );
  }
  assertHttps(currentUrl, `${input.file ?? input.id} final download URL`);
  const declaredLength = Number(response.headers["content-length"]);
  if (Number.isFinite(declaredLength) && declaredLength > input.maxBytes) {
    fail(`${input.file ?? input.id} declared length exceeds its bound`);
  }
  const meter = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > input.maxBytes) {
        callback(new Error("download exceeds its byte bound"));
        return;
      }
      sha512.update(chunk);
      callback(null, chunk);
    },
  });
  try {
    await pipeline(
      response,
      meter,
      createWriteStream(temporary, { flags: "wx", mode: 0o600 }),
    );
    if (bytes === 0 || sha512.digest("hex") !== input.sha512) {
      fail(`${input.file ?? input.id} SHA-512 does not match the source plan`);
    }
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  return bytes;
}

async function walkTree(basePath, options = {}) {
  const entries = [];
  async function visit(directory, prefix = "") {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      const absolute = join(directory, child.name);
      const path = prefix ? `${prefix}/${child.name}` : child.name;
      assertSafeRelativePath(path, "bundle entry");
      const details = await lstat(absolute);
      if (details.isDirectory()) {
        await visit(absolute, path);
      } else if (details.isFile()) {
        if (options.exclude?.has(path)) continue;
        entries.push({
          path,
          type: "file",
          size: details.size,
          mode: details.mode & 0o111 ? 0o755 : 0o644,
          sha256: await digestFile(absolute),
        });
      } else if (details.isSymbolicLink()) {
        if (options.exclude?.has(path)) continue;
        const target = await readlink(absolute);
        if (isAbsolute(target)) fail(`${path} has an absolute symlink target`);
        const resolvedTarget = resolve(dirname(absolute), target);
        const resolvedBase = resolve(basePath);
        if (
          resolvedTarget !== resolvedBase &&
          !resolvedTarget.startsWith(`${resolvedBase}${sep}`)
        ) {
          fail(`${path} symlink escapes the source bundle`);
        }
        entries.push({ path, type: "symlink", target });
      } else {
        fail(`${path} is not a regular file, directory, or safe symlink`);
      }
    }
  }
  await visit(basePath);
  return entries;
}

function parseApkbuildChecksums(apkbuild, originId) {
  const match = apkbuild.match(/^sha512sums="\r?\n([\s\S]*?)^"\s*$/mu);
  if (!match) fail(`${originId} APKBUILD has no bounded SHA-512 block`);
  const entries = match[1]
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const entry = line.match(/^([0-9a-f]{128})\s{2}([^\s]+)$/u);
      if (!entry || !isSafeInputFilename(entry[2])) {
        fail(`${originId} APKBUILD checksum entry is invalid`);
      }
      return { sha512: entry[1], file: entry[2] };
    });
  if (
    entries.length === 0 ||
    new Set(entries.map((item) => item.file)).size !== entries.length
  ) {
    fail(`${originId} APKBUILD checksum set is empty or duplicated`);
  }
  return entries;
}

async function verifyApkbuildInputs(staging, origin) {
  const packageRoot = join(staging, "source", "alpine", origin.id);
  const packagingRoot = join(packageRoot, "packaging");
  const upstreamRoot = join(packageRoot, "upstream");
  const apkbuild = await readFile(join(packagingRoot, "APKBUILD"), "utf8");
  const expectedVersion = `${origin.version.replace(/-r\d+$/u, "")}`;
  const pkgrel = origin.version.match(/-r(\d+)$/u)?.[1];
  if (
    !new RegExp(
      `^pkgver=${expectedVersion.replaceAll(".", "\\.")}$`,
      "mu",
    ).test(apkbuild) ||
    !new RegExp(`^pkgrel=${pkgrel}$`, "mu").test(apkbuild)
  ) {
    fail(`${origin.id} APKBUILD version does not match the image package`);
  }
  const checksums = parseApkbuildChecksums(apkbuild, origin.id);
  const plannedSources = new Map(
    origin.sources.map((source) => [source.file, source]),
  );
  for (const entry of checksums) {
    const localPath = join(packagingRoot, entry.file);
    const remotePath = join(upstreamRoot, entry.file);
    const localExists = await lstat(localPath).then(
      () => true,
      () => false,
    );
    const remoteExists = await lstat(remotePath).then(
      () => true,
      () => false,
    );
    if (localExists === remoteExists) {
      fail(
        `${origin.id} ${entry.file} must resolve to exactly one source input`,
      );
    }
    const sourcePath = localExists ? localPath : remotePath;
    if ((await digestFile(sourcePath, "sha512")) !== entry.sha512) {
      fail(`${origin.id} ${entry.file} does not match APKBUILD SHA-512`);
    }
    if (remoteExists) {
      const planned = plannedSources.get(entry.file);
      if (!planned || planned.sha512 !== entry.sha512) {
        fail(`${origin.id} ${entry.file} is not bound by the source plan`);
      }
    }
  }
  const remoteNames = new Set(
    checksums
      .filter((entry) => plannedSources.has(entry.file))
      .map((entry) => entry.file),
  );
  if (
    remoteNames.size !== plannedSources.size ||
    [...plannedSources.keys()].some((name) => !remoteNames.has(name))
  ) {
    fail(`${origin.id} planned remote inputs do not match APKBUILD`);
  }
  return checksums;
}

function generateNotices(candidate, candidateCommit, tag) {
  const lines = [
    "# Starfiniti Loyalty third-party notices",
    "",
    `Release: ${tag}`,
    `Source commit: ${candidateCommit}`,
    "",
    "This file identifies the reciprocal components distributed in the Starfiniti Loyalty dashboard and worker images. The accompanying source archive contains the exact Starfiniti tree, Alpine packaging inputs, upstream source archives, patches, build recipes, and licence texts bound by `SOURCE-MANIFEST.json`.",
    "",
    "## Starfiniti Loyalty",
    "",
    `- Component: ${candidate.product.package}@${candidate.product.version}`,
    `- Licence: ${candidate.product.licenseExpression}`,
    `- Images: ${candidate.product.images.join(", ")}`,
    `- Corresponding source: ${candidate.product.sourcePath}/`,
    "",
  ];
  for (const origin of candidate.alpine.origins) {
    lines.push(`## Alpine origin: ${origin.id}@${origin.version}`, "");
    lines.push(
      `- Components: ${origin.components.map((item) => item.package).join(", ")}`,
      `- Licence expressions: ${[...new Set(origin.components.map((item) => item.licenseExpression))].join("; ")}`,
      `- Images: ${[...new Set(origin.components.flatMap((item) => item.images))].sort().join(", ")}`,
      `- Alpine packaging commit: ${origin.aportsCommit}`,
      `- Packaging and patches: source/alpine/${origin.id}/packaging/`,
      `- Upstream inputs: source/alpine/${origin.id}/upstream/`,
      "",
    );
  }
  lines.push(
    "## Licence texts",
    "",
    ...candidate.licenseTexts.items.map(
      (item) => `- ${item.id}: licenses/${item.id}.txt`,
    ),
    "",
    "The notices describe provenance and do not replace the licence terms contained in the source archive. Retain this file, the manifest, the archive, and the release checksums together.",
    "",
  );
  return lines.join("\n");
}

async function createDeterministicArchive(staging, archivePath, epochSeconds) {
  const { TarArchive } = await import("archiver");
  const entries = await walkTree(staging);
  const epoch = new Date(epochSeconds * 1000);
  await new Promise((resolveArchive, rejectArchive) => {
    const output = createWriteStream(archivePath, { flags: "wx", mode: 0o600 });
    const archive = new TarArchive({
      gzip: true,
      gzipOptions: { level: 9, mtime: 0 },
    });
    output.on("close", resolveArchive);
    output.on("error", rejectArchive);
    archive.on("error", rejectArchive);
    archive.on("warning", (error) => rejectArchive(error));
    archive.pipe(output);
    for (const entry of entries) {
      const options = {
        date: epoch,
        mode: entry.type === "file" ? entry.mode : 0o777,
        name: entry.path,
      };
      if (entry.type === "file") {
        archive.file(join(staging, ...entry.path.split("/")), options);
      } else {
        archive.symlink(entry.path, entry.target, 0o777);
      }
    }
    void archive.finalize();
  });
}

function validateManifestIdentity(
  manifest,
  candidate,
  candidateCommit,
  tag,
  epochSeconds,
  sbomFacts,
  inventory,
) {
  exactKeys(
    manifest,
    [
      "archive",
      "candidateCommit",
      "components",
      "createdAt",
      "expandedBytes",
      "fileCount",
      "files",
      "licensePolicySha256",
      "notices",
      "planSha256",
      "productSourcePath",
      "sboms",
      "schema",
      "sourceInputs",
      "tag",
    ],
    "source manifest",
  );
  if (
    manifest?.schema !== "starfiniti.reciprocal-source-manifest.v1" ||
    manifest.candidateCommit !== candidateCommit ||
    manifest.tag !== tag ||
    manifest.createdAt !== new Date(epochSeconds * 1000).toISOString() ||
    manifest.planSha256 !== digestBytes(planBytes) ||
    manifest.licensePolicySha256 !== digestBytes(licensePolicyBytes) ||
    manifest.archive !== candidate.artifact.archive ||
    manifest.notices !== candidate.artifact.notices ||
    manifest.productSourcePath !== candidate.product.sourcePath ||
    JSON.stringify(manifest.sourceInputs) !==
      JSON.stringify(sourceInputFacts(candidate)) ||
    JSON.stringify(manifest.sboms) !== JSON.stringify(sbomFacts) ||
    JSON.stringify(manifest.components) !== JSON.stringify(inventory) ||
    !Number.isInteger(manifest.fileCount) ||
    !Number.isInteger(manifest.expandedBytes) ||
    !Array.isArray(manifest.files)
  ) {
    fail("source manifest identity or inventory is invalid");
  }
  if (
    manifest.fileCount !== manifest.files.length ||
    manifest.fileCount > candidate.artifact.maxFiles ||
    manifest.expandedBytes > candidate.artifact.maxExpandedBytes ||
    manifest.expandedBytes !==
      manifest.files
        .filter((entry) => entry.type === "file")
        .reduce((sum, entry) => sum + entry.size, 0)
  ) {
    fail("source manifest file or byte bounds are invalid");
  }
  const seen = new Set();
  for (const entry of manifest.files) {
    assertSafeRelativePath(entry.path, "manifest file path");
    if (seen.has(entry.path)) fail("source manifest contains a duplicate path");
    seen.add(entry.path);
    if (entry.type === "file") {
      exactKeys(
        entry,
        ["mode", "path", "sha256", "size", "type"],
        "manifest file",
      );
      if (
        !Number.isInteger(entry.size) ||
        entry.size < 0 ||
        ![0o644, 0o755].includes(entry.mode) ||
        !sha256Pattern.test(entry.sha256)
      ) {
        fail(`${entry.path} manifest file facts are invalid`);
      }
    } else if (entry.type === "symlink") {
      exactKeys(entry, ["path", "target", "type"], "manifest symlink");
      if (typeof entry.target !== "string" || isAbsolute(entry.target)) {
        fail(`${entry.path} manifest symlink is invalid`);
      }
    } else {
      fail(`${entry.path} manifest entry type is invalid`);
    }
  }
  for (const required of [
    "SOURCE-PLAN.yaml",
    "THIRD-PARTY-NOTICES.md",
    `${candidate.product.sourcePath}/package.json`,
    ...candidate.alpine.origins.flatMap((origin) => [
      `source/alpine/${origin.id}/packaging/APKBUILD`,
      ...origin.sources.map(
        (source) => `source/alpine/${origin.id}/upstream/${source.file}`,
      ),
    ]),
    ...candidate.licenseTexts.items.map((item) => `licenses/${item.id}.txt`),
  ]) {
    if (!seen.has(required)) fail(`source manifest is missing ${required}`);
  }
}

async function verifyArchiveEnvelope(candidate, outputDirectory, expected) {
  const archivePath = join(outputDirectory, candidate.artifact.archive);
  const manifestPath = join(outputDirectory, candidate.artifact.manifest);
  const noticesPath = join(outputDirectory, candidate.artifact.notices);
  const archiveSize = statSync(archivePath).size;
  if (archiveSize <= 0 || archiveSize > candidate.artifact.maxArchiveBytes) {
    fail("source archive size is outside its release bound");
  }
  const listed = run("tar", ["-tzf", archivePath])
    .split(/\r?\n/u)
    .filter(Boolean);
  if (listed.length === 0 || new Set(listed).size !== listed.length) {
    fail("source archive listing is empty or duplicated");
  }
  listed.forEach((entry) => assertSafeRelativePath(entry, "archive entry"));
  const temporary = await mkdtemp(
    join(tmpdir(), "starfiniti-reciprocal-source-verify-"),
  );
  assertGeneratedTemp(temporary);
  try {
    run("tar", ["-xzf", archivePath, "-C", temporary]);
    const externalManifest = await readFile(manifestPath);
    const internalManifest = await readFile(
      join(temporary, "SOURCE-MANIFEST.json"),
    );
    const externalNotices = await readFile(noticesPath);
    const internalNotices = await readFile(
      join(temporary, "THIRD-PARTY-NOTICES.md"),
    );
    if (!externalManifest.equals(internalManifest)) {
      fail("external and archived source manifests differ");
    }
    if (!externalNotices.equals(internalNotices)) {
      fail("external and archived third-party notices differ");
    }
    const parsed = JSON.parse(externalManifest.toString("utf8"));
    if (expected) {
      validateManifestIdentity(
        parsed,
        candidate,
        expected.candidateCommit,
        expected.tag,
        expected.epochSeconds,
        expected.sbomFacts,
        expected.inventory,
      );
    }
    const actualEntries = await walkTree(temporary, {
      exclude: new Set(["SOURCE-MANIFEST.json"]),
    });
    if (JSON.stringify(actualEntries) !== JSON.stringify(parsed.files)) {
      fail("archived files do not match the source manifest");
    }
    if (
      listed.sort().join(",") !==
      [...parsed.files.map((entry) => entry.path), "SOURCE-MANIFEST.json"]
        .sort()
        .join(",")
    ) {
      fail("archive listing does not match the manifest envelope");
    }
    return {
      archiveBytes: archiveSize,
      archiveSha256: await digestFile(archivePath),
      manifestSha256: await digestFile(manifestPath),
      noticesSha256: await digestFile(noticesPath),
    };
  } finally {
    await rm(temporary, { force: true, recursive: true });
  }
}

async function loadReleaseInputs(argumentsMap) {
  const dashboardPath = argumentsMap.get("dashboard-sbom");
  const workerPath = argumentsMap.get("worker-sbom");
  if (!dashboardPath || !workerPath) {
    fail("dashboard and worker SBOM paths are required");
  }
  const dashboardBytes = await readFile(resolve(dashboardPath));
  const workerBytes = await readFile(resolve(workerPath));
  const dashboard = JSON.parse(dashboardBytes.toString("utf8"));
  const worker = JSON.parse(workerBytes.toString("utf8"));
  const inventory = validateSboms(dashboard, worker);
  return {
    dashboard,
    worker,
    inventory,
    sbomFacts: [
      { image: "dashboard", sha256: digestBytes(dashboardBytes) },
      { image: "worker", sha256: digestBytes(workerBytes) },
    ],
  };
}

function releaseIdentity(argumentsMap) {
  const candidateCommit = argumentsMap.get("candidate-commit");
  const tag = argumentsMap.get("tag");
  const epochSeconds = Number(argumentsMap.get("source-date-epoch"));
  if (
    !commitPattern.test(candidateCommit ?? "") ||
    !tagPattern.test(tag ?? "") ||
    !Number.isInteger(epochSeconds) ||
    epochSeconds < 1_600_000_000 ||
    epochSeconds > 4_102_444_800
  ) {
    fail("candidate commit tag or source epoch is invalid");
  }
  return { candidateCommit, tag, epochSeconds };
}

async function buildBundle(argumentsMap) {
  validatePlan();
  const { inventory, sbomFacts } = await loadReleaseInputs(argumentsMap);
  const identity = releaseIdentity(argumentsMap);
  const outputDirectory = resolve(argumentsMap.get("output-dir") ?? "");
  if (!argumentsMap.get("output-dir")) fail("output directory is required");
  await mkdir(outputDirectory, { recursive: true });
  const head = run("git", ["rev-parse", "HEAD"], { cwd: root });
  if (head !== identity.candidateCommit) {
    fail("candidate commit does not match the checked-out source tree");
  }
  if (run("git", ["status", "--porcelain"], { cwd: root })) {
    fail("source bundle requires a clean checked-out release commit");
  }
  const temporary = await mkdtemp(
    join(tmpdir(), "starfiniti-reciprocal-source-build-"),
  );
  assertGeneratedTemp(temporary);
  const staging = join(temporary, "staging");
  const gitRoot = join(temporary, "git");
  await mkdir(staging, { recursive: true });
  await mkdir(gitRoot, { recursive: true });
  try {
    const productTar = join(temporary, "starfiniti.tar");
    run(
      "git",
      [
        "-c",
        "core.autocrlf=false",
        "archive",
        "--format=tar",
        `--output=${productTar}`,
        `--prefix=${plan.product.sourcePath}/`,
        identity.candidateCommit,
      ],
      { cwd: root },
    );
    run("tar", ["-xf", productTar, "-C", staging]);

    run("git", ["init", "--quiet"], { cwd: gitRoot });
    run("git", ["remote", "add", "origin", plan.alpine.repository], {
      cwd: gitRoot,
    });
    for (const origin of plan.alpine.origins) {
      const reference = `refs/starfiniti-sources/${origin.id}`;
      run(
        "git",
        [
          "fetch",
          "--quiet",
          "--no-tags",
          "--depth=1",
          "--filter=blob:none",
          "origin",
          `${origin.aportsCommit}:${reference}`,
        ],
        { cwd: gitRoot },
      );
      if (
        run("git", ["rev-parse", reference], { cwd: gitRoot }) !==
        origin.aportsCommit
      ) {
        fail(`${origin.id} fetched aports commit does not match the SBOM`);
      }
      const packagingTar = join(temporary, `${origin.id}.tar`);
      run(
        "git",
        [
          "-c",
          "core.autocrlf=false",
          "archive",
          "--format=tar",
          `--output=${packagingTar}`,
          `--prefix=source/alpine/${origin.id}/packaging/`,
          `${reference}:${origin.aportsPath}`,
        ],
        { cwd: gitRoot },
      );
      run("tar", ["-xf", packagingTar, "-C", staging]);
      for (const source of origin.sources) {
        await downloadVerified(
          source,
          join(staging, "source", "alpine", origin.id, "upstream", source.file),
        );
      }
      await verifyApkbuildInputs(staging, origin);
    }

    for (const item of plan.licenseTexts.items) {
      await downloadVerified(
        { ...item, file: `${item.id}.txt` },
        join(staging, "licenses", `${item.id}.txt`),
      );
    }
    await writeFile(join(staging, "SOURCE-PLAN.yaml"), planBytes, {
      flag: "wx",
      mode: 0o600,
    });
    const notices = generateNotices(
      plan,
      identity.candidateCommit,
      identity.tag,
    );
    await writeFile(join(staging, "THIRD-PARTY-NOTICES.md"), notices, {
      flag: "wx",
      mode: 0o600,
    });
    const files = await walkTree(staging);
    const manifest = {
      schema: "starfiniti.reciprocal-source-manifest.v1",
      candidateCommit: identity.candidateCommit,
      tag: identity.tag,
      createdAt: new Date(identity.epochSeconds * 1000).toISOString(),
      planSha256: digestBytes(planBytes),
      licensePolicySha256: digestBytes(licensePolicyBytes),
      archive: plan.artifact.archive,
      notices: plan.artifact.notices,
      productSourcePath: plan.product.sourcePath,
      sourceInputs: sourceInputFacts(plan),
      sboms: sbomFacts,
      components: inventory,
      fileCount: files.length,
      expandedBytes: files
        .filter((entry) => entry.type === "file")
        .reduce((sum, entry) => sum + entry.size, 0),
      files,
    };
    validateManifestIdentity(
      manifest,
      plan,
      identity.candidateCommit,
      identity.tag,
      identity.epochSeconds,
      sbomFacts,
      inventory,
    );
    const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
    await writeFile(join(staging, "SOURCE-MANIFEST.json"), manifestBytes, {
      flag: "wx",
      mode: 0o600,
    });

    const archivePath = join(outputDirectory, plan.artifact.archive);
    const manifestPath = join(outputDirectory, plan.artifact.manifest);
    const noticesPath = join(outputDirectory, plan.artifact.notices);
    await writeFile(manifestPath, manifestBytes, { flag: "wx", mode: 0o600 });
    await writeFile(noticesPath, notices, { flag: "wx", mode: 0o600 });
    await createDeterministicArchive(
      staging,
      archivePath,
      identity.epochSeconds,
    );
    const verification = await verifyArchiveEnvelope(plan, outputDirectory, {
      ...identity,
      inventory,
      sbomFacts,
    });
    process.stdout.write(
      `${JSON.stringify({
        status: "verified",
        components: inventory.length,
        files: files.length,
        expandedBytes: manifest.expandedBytes,
        ...verification,
      })}\n`,
    );
  } finally {
    await rm(temporary, { force: true, recursive: true });
  }
}

async function verifyBundle(argumentsMap) {
  validatePlan();
  const { inventory, sbomFacts } = await loadReleaseInputs(argumentsMap);
  const identity = releaseIdentity(argumentsMap);
  const outputDirectory = resolve(argumentsMap.get("output-dir") ?? "");
  if (!argumentsMap.get("output-dir")) fail("output directory is required");
  const manifest = JSON.parse(
    await readFile(join(outputDirectory, plan.artifact.manifest), "utf8"),
  );
  validateManifestIdentity(
    manifest,
    plan,
    identity.candidateCommit,
    identity.tag,
    identity.epochSeconds,
    sbomFacts,
    inventory,
  );
  const verification = await verifyArchiveEnvelope(plan, outputDirectory, {
    ...identity,
    inventory,
    sbomFacts,
  });
  process.stdout.write(
    `${JSON.stringify({ status: "verified", ...verification })}\n`,
  );
}

function syntheticSboms(candidate = plan) {
  const expected = expectedInventory(candidate);
  function componentFor(item) {
    if (item.kind === "product") {
      return {
        name: item.name,
        version: item.version,
        purl: "pkg:npm/%40starfiniti/dashboard@0.0.0",
        licenses: [{ license: { id: item.licenseExpression } }],
      };
    }
    return {
      name: item.name,
      version: item.version,
      purl: `pkg:apk/alpine/${encodeURIComponent(item.name)}@${item.version}?arch=${candidate.alpine.architecture}&distro=${candidate.alpine.distro}`,
      licenses: item.licenseExpression.includes(" AND ")
        ? [{ expression: item.licenseExpression }]
        : [{ license: { id: item.licenseExpression } }],
      properties: [
        { name: "syft:metadata:originPackage", value: item.origin },
        {
          name: "syft:metadata:gitCommitOfApkPort",
          value: item.aportsCommit,
        },
      ],
    };
  }
  return {
    dashboard: {
      bomFormat: "CycloneDX",
      components: expected
        .filter((item) => item.images.includes("dashboard"))
        .map(componentFor),
    },
    worker: {
      bomFormat: "CycloneDX",
      components: expected
        .filter((item) => item.images.includes("worker"))
        .map(componentFor),
    },
  };
}

function expectFailure(label, action, pattern) {
  try {
    action();
  } catch (error) {
    if (pattern.test(String(error?.message))) return;
    throw error;
  }
  fail(`self-test ${label} unexpectedly passed`);
}

async function runSelfTest() {
  validatePlan();
  const fixtures = syntheticSboms();
  const inventory = validateSboms(fixtures.dashboard, fixtures.worker);
  if (inventory.length !== 13) fail("self-test exact inventory count drifted");
  parseApkbuildChecksums(
    `sha512sums="\n${"a".repeat(128)}  _apk\n"\n`,
    "self-test",
  );

  const ordinaryComponents = structuredClone(fixtures);
  ordinaryComponents.dashboard.components.push(
    {
      name: "unlicensed-permissive-component",
      version: "1.0.0",
      purl: "pkg:npm/unlicensed-permissive-component@1.0.0",
    },
    {
      name: "multi-licence-permissive-component",
      version: "1.0.0",
      purl: "pkg:npm/multi-licence-permissive-component@1.0.0",
      licenses: [
        { license: { id: "MIT" } },
        { license: { id: "BSD-2-Clause" } },
      ],
    },
  );
  validateSboms(ordinaryComponents.dashboard, ordinaryComponents.worker);

  const missing = structuredClone(fixtures);
  missing.worker.components = missing.worker.components.filter(
    (component) => component.name !== "scanelf",
  );
  expectFailure(
    "missing component",
    () => validateSboms(missing.dashboard, missing.worker),
    /worker reciprocal inventory drifted/u,
  );

  const addedSharp = structuredClone(fixtures);
  addedSharp.dashboard.components.push({
    name: "@img/sharp-libvips-linuxmusl-x64",
    version: "1.3.2",
    purl: "pkg:npm/%40img/sharp-libvips-linuxmusl-x64@1.3.2",
    licenses: [{ license: { id: "LGPL-3.0-or-later" } }],
  });
  expectFailure(
    "unexpected sharp",
    () => validateSboms(addedSharp.dashboard, addedSharp.worker),
    /dashboard reciprocal inventory drifted/u,
  );

  for (const [label, mutate, pattern] of [
    [
      "aports commit drift",
      (candidate) => {
        candidate.dashboard.components
          .find((component) => component.name === "busybox")
          .properties.find(
            (property) => property.name === "syft:metadata:gitCommitOfApkPort",
          ).value = "0".repeat(40);
      },
      /busybox Alpine provenance drifted/u,
    ],
    [
      "origin drift",
      (candidate) => {
        candidate.worker.components
          .find((component) => component.name === "libgcc")
          .properties.find(
            (property) => property.name === "syft:metadata:originPackage",
          ).value = "not-gcc";
      },
      /libgcc Alpine provenance drifted/u,
    ],
    [
      "distro drift",
      (candidate) => {
        const component = candidate.dashboard.components.find(
          (item) => item.name === "apk-tools",
        );
        component.purl = component.purl.replace(
          "alpine-3.24.1",
          "alpine-3.25.0",
        );
      },
      /apk-tools Alpine provenance drifted/u,
    ],
    [
      "licence drift",
      (candidate) => {
        candidate.dashboard.components.find(
          (component) => component.name === "musl-utils",
        ).licenses = [{ license: { id: "MIT" } }];
      },
      /dashboard reciprocal inventory drifted/u,
    ],
  ]) {
    const candidate = structuredClone(fixtures);
    mutate(candidate);
    expectFailure(
      label,
      () => validateSboms(candidate.dashboard, candidate.worker),
      pattern,
    );
  }

  for (const [label, mutate, pattern] of [
    [
      "unsafe artifact name",
      (candidate) => {
        candidate.artifact.archive = "../source.tar.gz";
      },
      /artifact archive name/u,
    ],
    [
      "source checksum drift",
      (candidate) => {
        candidate.alpine.origins[0].sources[0].sha512 = "0".repeat(128);
      },
      /source input is invalid/u,
    ],
    [
      "missing origin",
      (candidate) => {
        candidate.alpine.origins.pop();
      },
      /origin count/u,
    ],
    [
      "uncovered licence",
      (candidate) => {
        candidate.licenseTexts.items.pop();
      },
      /licence-text source/u,
    ],
  ]) {
    const candidate = structuredClone(plan);
    mutate(candidate);
    expectFailure(label, () => validatePlan(candidate), pattern);
  }

  expectFailure(
    "path traversal",
    () => assertSafeRelativePath("source/../outside"),
    /safe relative path/u,
  );
  expectFailure(
    "insecure redirect",
    () =>
      resolveHttpsRedirect(
        "https://sources.example.test/archive",
        "http://mirror.example.test/archive",
        "fixture",
      ),
    /must be credential-free HTTPS/u,
  );

  const archiveFixture = await mkdtemp(
    join(tmpdir(), "starfiniti-reciprocal-source-self-test-"),
  );
  assertGeneratedTemp(archiveFixture);
  try {
    const staging = join(archiveFixture, "staging");
    const output = join(archiveFixture, "output");
    await mkdir(join(staging, "source"), { recursive: true });
    await mkdir(output, { recursive: true });
    const notices = "# Synthetic third-party notices\n";
    await writeFile(join(staging, "THIRD-PARTY-NOTICES.md"), notices);
    await writeFile(join(staging, "source", "fixture.txt"), "fixture\n");
    const files = await walkTree(staging);
    const manifestBytes = Buffer.from(
      `${JSON.stringify({ files }, null, 2)}\n`,
    );
    await writeFile(join(staging, "SOURCE-MANIFEST.json"), manifestBytes);
    await writeFile(join(output, plan.artifact.manifest), manifestBytes);
    await writeFile(join(output, plan.artifact.notices), notices);
    await createDeterministicArchive(
      staging,
      join(output, plan.artifact.archive),
      1_700_000_000,
    );
    const verified = await verifyArchiveEnvelope(plan, output);
    if (!sha256Pattern.test(verified.archiveSha256)) {
      fail("self-test archive digest is invalid");
    }
  } finally {
    await rm(archiveFixture, { force: true, recursive: true });
  }
  process.stdout.write(
    "Validated reciprocal source plan, closed SBOM inventory, deterministic archive envelope, and 13 adversarial cases.\n",
  );
}

function parseArguments(argv) {
  const modes = new Set(["build", "inventory-only", "self-test", "verify"]);
  const argumentsMap = new Map();
  let mode = null;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) fail(`unexpected argument ${token}`);
    const key = token.slice(2);
    if (modes.has(key)) {
      if (mode) fail("exactly one source-bundle mode is required");
      mode = key;
      continue;
    }
    if (argumentsMap.has(key)) fail(`duplicate argument --${key}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) fail(`--${key} requires a value`);
    argumentsMap.set(key, value);
    index += 1;
  }
  if (!mode)
    fail(
      "one of --build, --verify, --inventory-only, or --self-test is required",
    );
  return { mode, argumentsMap };
}

const { mode, argumentsMap } = parseArguments(process.argv.slice(2));
if (mode === "self-test") {
  await runSelfTest();
} else if (mode === "inventory-only") {
  const { inventory, sbomFacts } = await loadReleaseInputs(argumentsMap);
  process.stdout.write(
    `${JSON.stringify({ status: "verified", components: inventory.length, sboms: sbomFacts })}\n`,
  );
} else if (mode === "build") {
  await buildBundle(argumentsMap);
} else {
  await verifyBundle(argumentsMap);
}
