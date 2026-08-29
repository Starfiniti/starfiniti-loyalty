import { createHash } from "node:crypto";
import { constants, createWriteStream } from "node:fs";
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";
import { ZipArchive } from "archiver";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = resolve(root, "plugins/woocommerce");
const defaultOutputPath = resolve(root, "dist/starfiniti-loyalty.zip");
const archiveRoot = "starfiniti-loyalty";
const developmentVersion = "0.1.0-dev";
const releaseVersionPattern = /^[0-9]+\.[0-9]+\.[0-9]+$/u;
const maximumArchiveBytes = 10_000_000;
const maximumExpandedBytes = 25_000_000;
const maximumEntries = 500;

const metadataFiles = new Map([
  [
    "starfiniti-loyalty.php",
    [
      [` * Version: ${developmentVersion}`, " * Version: {{VERSION}}"],
      [
        `define('STARFINITI_LOYALTY_VERSION', '${developmentVersion}');`,
        "define('STARFINITI_LOYALTY_VERSION', '{{VERSION}}');",
      ],
    ],
  ],
  [
    "languages/starfiniti-loyalty.pot",
    [
      [
        `Project-Id-Version: Starfiniti Loyalty ${developmentVersion}\\n`,
        "Project-Id-Version: Starfiniti Loyalty {{VERSION}}\\n",
      ],
    ],
  ],
  ["readme.txt", [["Stable tag: trunk", "Stable tag: {{VERSION}}"]]],
]);

const fail = (message) => {
  throw new Error(`WooCommerce package: ${message}`);
};

const parseArguments = (arguments_) => {
  const parsed = {
    archivePath: null,
    mode: "build",
    outputPath: defaultOutputPath,
    version: null,
  };
  const remaining = [...arguments_];
  while (remaining.length > 0) {
    const argument = remaining.shift();
    if (argument === "--self-test") parsed.mode = "self-test";
    else if (argument === "--verify") parsed.mode = "verify";
    else if (argument === "--version") parsed.version = remaining.shift();
    else if (argument === "--archive") parsed.archivePath = remaining.shift();
    else if (argument === "--output") parsed.outputPath = remaining.shift();
    else fail(`unknown argument ${argument ?? "<missing>"}`);
  }
  if (parsed.mode !== "self-test" && typeof parsed.version !== "string") {
    fail("--version requires an exact numeric value");
  }
  if (typeof parsed.outputPath !== "string") fail("--output requires a value");
  if (parsed.archivePath !== null && typeof parsed.archivePath !== "string") {
    fail("--archive requires a value");
  }
  return parsed;
};

const assertVersion = (version) => {
  if (!releaseVersionPattern.test(version)) {
    fail("version must be an exact numeric MAJOR.MINOR.PATCH value");
  }
};

const sameFileIdentity = (left, right) =>
  left.isFile() &&
  right.isFile() &&
  !left.isSymbolicLink() &&
  !right.isSymbolicLink() &&
  left.dev === right.dev &&
  left.ino === right.ino &&
  left.size === right.size &&
  left.mtimeMs === right.mtimeMs &&
  left.ctimeMs === right.ctimeMs;

const readStableRegularFile = async (absolutePath, maximumBytes, label) => {
  const beforePath = await lstat(absolutePath);
  if (!beforePath.isFile() || beforePath.isSymbolicLink()) {
    fail(`${label} is not a regular file`);
  }
  if (beforePath.size > maximumBytes) {
    fail(`${label} exceeds the reviewed byte bound`);
  }
  const descriptor = await open(
    absolutePath,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    const beforeDescriptor = await descriptor.stat();
    if (!sameFileIdentity(beforePath, beforeDescriptor)) {
      fail(`${label} identity changed before reading`);
    }
    const bytes = await descriptor.readFile();
    const afterDescriptor = await descriptor.stat();
    const afterPath = await lstat(absolutePath);
    if (
      bytes.length !== beforeDescriptor.size ||
      !sameFileIdentity(beforeDescriptor, afterDescriptor) ||
      !sameFileIdentity(afterDescriptor, afterPath)
    ) {
      fail(`${label} identity changed while reading`);
    }
    return bytes;
  } finally {
    await descriptor.close();
  }
};

const readStableSource = (relativePath) =>
  readStableRegularFile(
    resolve(pluginRoot, relativePath),
    maximumExpandedBytes,
    `source path ${relativePath}`,
  );

const replaceExactlyOnce = (content, source, replacement, label) => {
  const first = content.indexOf(source);
  if (first < 0 || content.indexOf(source, first + source.length) >= 0) {
    fail(`${label} source marker must occur exactly once`);
  }
  return `${content.slice(0, first)}${replacement}${content.slice(first + source.length)}`;
};

const releaseMetadata = async (version) => {
  const transformed = new Map();
  for (const [relativePath, replacements] of metadataFiles) {
    let content = (await readStableSource(relativePath)).toString("utf8");
    for (const [source, replacementTemplate] of replacements) {
      content = replaceExactlyOnce(
        content,
        source,
        replacementTemplate.replace("{{VERSION}}", version),
        relativePath,
      );
    }
    transformed.set(relativePath, content);
  }
  return transformed;
};

const collectSourceFiles = async (directory = pluginRoot, prefix = "") => {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (relativePath === "tests" || relativePath.startsWith("tests/")) continue;
    const absolutePath = resolve(directory, entry.name);
    if (entry.isSymbolicLink())
      fail(`source path is symbolic: ${relativePath}`);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(absolutePath, relativePath)));
    } else if (entry.isFile()) {
      files.push(relativePath);
    } else {
      fail(`source path has unsupported type: ${relativePath}`);
    }
  }
  return files;
};

const archiveEntryName = (relativePath) =>
  `${archiveRoot}/${relativePath.replaceAll(sep, "/")}`;

const safeOutputPath = (candidate) => {
  const outputPath = resolve(candidate);
  if (basename(outputPath) !== "starfiniti-loyalty.zip") {
    fail("output filename must be starfiniti-loyalty.zip");
  }
  return outputPath;
};

const verifyArchive = async (candidatePath, version) => {
  assertVersion(version);
  const archivePath = resolve(candidatePath);
  const archiveBytes = await readStableRegularFile(
    archivePath,
    maximumArchiveBytes,
    "archive",
  );
  if (archiveBytes.length < 1) fail("archive must not be empty");

  const zip = new AdmZip(archiveBytes);
  const entries = zip.getEntries();
  if (entries.length < 1 || entries.length > maximumEntries) {
    fail("archive entry count is outside the reviewed bound");
  }

  const actualFiles = new Set();
  let expandedBytes = 0;
  for (const entry of entries) {
    const name = entry.entryName;
    if (
      typeof name !== "string" ||
      name.includes("\\") ||
      name.startsWith("/") ||
      name.split("/").includes("..") ||
      !name.startsWith(`${archiveRoot}/`)
    ) {
      fail(`archive entry path is unsafe: ${name}`);
    }
    if (
      !Number.isSafeInteger(entry.header.flags) ||
      !Number.isSafeInteger(entry.header.size) ||
      entry.header.size < 0
    ) {
      fail(`archive entry metadata is invalid: ${name}`);
    }
    if ((entry.header.flags & 1) !== 0)
      fail(`archive entry is encrypted: ${name}`);
    const unixFileType = (entry.attr >>> 16) & 0o170000;
    if (entry.isDirectory || unixFileType !== 0o100000) {
      fail(`archive entry is not a regular file: ${name}`);
    }
    if (actualFiles.has(name)) fail(`archive entry is duplicated: ${name}`);
    actualFiles.add(name);
    expandedBytes += entry.header.size;
    if (expandedBytes > maximumExpandedBytes) {
      fail("archive expanded size exceeds the reviewed bound");
    }
  }

  const expectedFiles = new Set(
    (await collectSourceFiles()).map(archiveEntryName),
  );
  if (
    actualFiles.size !== expectedFiles.size ||
    [...actualFiles].some((name) => !expectedFiles.has(name))
  ) {
    fail("archive file inventory differs from the production plugin source");
  }

  const readText = (relativePath) => {
    const name = archiveEntryName(relativePath);
    const entry = zip.getEntry(name);
    if (!entry || entry.isDirectory || entry.header.size > 512_000) {
      fail(`archive metadata entry is missing or oversized: ${name}`);
    }
    return entry.getData().toString("utf8");
  };
  const bootstrap = readText("starfiniti-loyalty.php");
  const translations = readText("languages/starfiniti-loyalty.pot");
  const readme = readText("readme.txt");
  for (const [label, content] of [
    ["bootstrap", bootstrap],
    ["translation template", translations],
    ["readme", readme],
  ]) {
    if (content.includes(developmentVersion)) {
      fail(`${label} retains the development version marker`);
    }
  }
  for (const [label, content, prefix, expectedLine] of [
    ["plugin header", bootstrap, " * Version:", ` * Version: ${version}`],
    [
      "runtime constant",
      bootstrap,
      "define('STARFINITI_LOYALTY_VERSION',",
      `define('STARFINITI_LOYALTY_VERSION', '${version}');`,
    ],
    [
      "translation template",
      translations,
      '"Project-Id-Version:',
      `"Project-Id-Version: Starfiniti Loyalty ${version}\\n"`,
    ],
    ["readme stable tag", readme, "Stable tag:", `Stable tag: ${version}`],
  ]) {
    const matchingLines = content
      .split(/\r?\n/u)
      .filter((line) => line.startsWith(prefix));
    if (matchingLines.length !== 1 || matchingLines[0] !== expectedLine) {
      fail(`${label} does not exactly match ${version}`);
    }
  }
  return { archiveBytes, archivePath, entryCount: actualFiles.size, version };
};

const buildArchive = async (candidatePath, version) => {
  assertVersion(version);
  const outputPath = safeOutputPath(candidatePath);
  const outputDirectory = dirname(outputPath);
  await mkdir(outputDirectory, { recursive: true });
  const temporaryPath = resolve(
    outputDirectory,
    `.starfiniti-loyalty.${process.pid}.${Date.now()}.zip`,
  );
  const transformed = await releaseMetadata(version);
  const files = await collectSourceFiles();
  const snapshot = new Map();
  for (const relativePath of files) {
    snapshot.set(
      relativePath,
      transformed.has(relativePath)
        ? Buffer.from(transformed.get(relativePath), "utf8")
        : await readStableSource(relativePath),
    );
  }

  try {
    await new Promise((resolveArchive, rejectArchive) => {
      const output = createWriteStream(temporaryPath, {
        flags: "wx",
        mode: 0o600,
      });
      const archive = new ZipArchive({ zlib: { level: 9 } });
      output.on("close", resolveArchive);
      output.on("error", rejectArchive);
      archive.on("error", rejectArchive);
      archive.pipe(output);
      for (const relativePath of files) {
        const name = archiveEntryName(relativePath);
        archive.append(snapshot.get(relativePath), {
          date: new Date(0),
          mode: 0o100644,
          name,
        });
      }
      void archive.finalize();
    });
    const temporaryArchive = await verifyArchive(temporaryPath, version);
    await rm(outputPath, { force: true });
    await writeFile(outputPath, temporaryArchive.archiveBytes, {
      flag: "wx",
      mode: 0o600,
    });
    return await verifyArchive(outputPath, version);
  } finally {
    await rm(temporaryPath, { force: true });
  }
};

const expectRejected = async (label, expected, operation) => {
  try {
    await operation();
  } catch (error) {
    if (error instanceof Error && error.message.includes(expected)) return;
    throw error;
  }
  fail(`self-test accepted ${label}`);
};

const runSelfTest = async () => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "starfiniti-wc-package-"),
  );
  const outputPath = resolve(temporaryDirectory, "starfiniti-loyalty.zip");
  const sourceFiles = await collectSourceFiles();
  const sourceBefore = new Map(
    await Promise.all(
      sourceFiles.map(async (path) => [path, await readStableSource(path)]),
    ),
  );
  try {
    await expectRejected(
      "a missing explicit version",
      "--version requires an exact numeric value",
      () => parseArguments([]),
    );
    const result = await buildArchive(outputPath, "9.8.7");
    if (result.version !== "9.8.7" || result.entryCount < 5) {
      fail("self-test package result differs");
    }
    const firstDigest = createHash("sha256")
      .update(await readFile(outputPath))
      .digest("hex");
    await buildArchive(outputPath, "9.8.7");
    const secondDigest = createHash("sha256")
      .update(await readFile(outputPath))
      .digest("hex");
    if (firstDigest !== secondDigest) {
      fail("self-test package is not reproducible from identical source");
    }
    await expectRejected(
      "a mismatched expected version",
      "does not exactly match 9.8.8",
      () => verifyArchive(outputPath, "9.8.8"),
    );

    const tamperedZip = new AdmZip(outputPath);
    const bootstrapEntry = archiveEntryName("starfiniti-loyalty.php");
    const tamperedBootstrap = tamperedZip
      .readAsText(bootstrapEntry)
      .replace(" * Version: 9.8.7", ` * Version: ${developmentVersion}`);
    tamperedZip.updateFile(
      bootstrapEntry,
      Buffer.from(tamperedBootstrap, "utf8"),
    );
    const tamperedPath = resolve(temporaryDirectory, "tampered.zip");
    await writeFile(tamperedPath, tamperedZip.toBuffer());
    await expectRejected(
      "a retained development marker",
      "retains the development version",
      () => verifyArchive(tamperedPath, "9.8.7"),
    );

    const duplicateZip = new AdmZip(outputPath);
    const duplicateBootstrap = duplicateZip
      .readAsText(bootstrapEntry)
      .replace(" * Version: 9.8.7", " * Version: 9.8.7\n * Version: 9.8.7");
    duplicateZip.updateFile(
      bootstrapEntry,
      Buffer.from(duplicateBootstrap, "utf8"),
    );
    const duplicatePath = resolve(temporaryDirectory, "duplicate.zip");
    await writeFile(duplicatePath, duplicateZip.toBuffer());
    await expectRejected(
      "duplicate plugin version metadata",
      "does not exactly match",
      () => verifyArchive(duplicatePath, "9.8.7"),
    );

    const incompleteZip = new AdmZip(outputPath);
    incompleteZip.deleteFile(archiveEntryName("readme.txt"));
    const incompletePath = resolve(temporaryDirectory, "incomplete.zip");
    await writeFile(incompletePath, incompleteZip.toBuffer());
    await expectRejected(
      "an incomplete file inventory",
      "inventory differs",
      () => verifyArchive(incompletePath, "9.8.7"),
    );

    const directoryZip = new AdmZip(outputPath);
    directoryZip.addFile(
      `${archiveRoot}/unexpected/`,
      Buffer.alloc(0),
      "",
      0o40755 << 16,
    );
    const directoryPath = resolve(temporaryDirectory, "directory.zip");
    await writeFile(directoryPath, directoryZip.toBuffer());
    await expectRejected(
      "a non-file archive entry",
      "is not a regular file",
      () => verifyArchive(directoryPath, "9.8.7"),
    );

    await expectRejected("a prerelease version", "exact numeric", () =>
      assertVersion("9.8.7-rc.1"),
    );
    const sourceAfter = new Map(
      await Promise.all(
        sourceFiles.map(async (path) => [path, await readStableSource(path)]),
      ),
    );
    if (
      [...sourceBefore].some(
        ([path, content]) => !content.equals(sourceAfter.get(path)),
      )
    ) {
      fail("self-test mutated the tracked plugin source");
    }
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
  console.log(
    "Validated exact WooCommerce release version injection, closed inventory, and immutable development source.",
  );
};

const arguments_ = parseArguments(process.argv.slice(2));
if (arguments_.mode === "self-test") {
  await runSelfTest();
} else if (arguments_.mode === "verify") {
  if (!arguments_.archivePath) fail("--verify requires --archive");
  assertVersion(arguments_.version);
  const result = await verifyArchive(
    arguments_.archivePath,
    arguments_.version,
  );
  console.log(
    `Verified ${result.archivePath} as WooCommerce ${result.version} with ${result.entryCount} files.`,
  );
} else {
  const result = await buildArchive(arguments_.outputPath, arguments_.version);
  console.log(
    `Packaged ${result.archivePath} as WooCommerce ${result.version} with ${result.entryCount} files.`,
  );
}
