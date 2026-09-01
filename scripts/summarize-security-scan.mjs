import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";

const MAX_INPUT_BYTES = 64 * 1024 * 1024;
const MAX_SARIF_FILES = 8;
const severityOrder = ["unknown", "low", "medium", "high", "critical"];

function fail(message) {
  throw new Error(message);
}

class SecurityPolicyError extends Error {
  constructor(message, summary) {
    super(message);
    this.name = "SecurityPolicyError";
    this.summary = summary;
  }
}

function policyFail(message, summary) {
  throw new SecurityPolicyError(message, summary);
}

function sha256(raw) {
  return createHash("sha256").update(raw).digest("hex");
}

function exactCommit(value, label) {
  if (!/^[0-9a-f]{40}$/u.test(value ?? "") || /^0{40}$/u.test(value)) {
    fail(`${label} must be a nonzero lowercase commit`);
  }
  return value;
}

function exactUtc(value, label) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    fail(`${label} must be an exact UTC instant`);
  }
  return value;
}

function readStableFile(path, maximumBytes = MAX_INPUT_BYTES) {
  const resolved = resolve(path);
  let descriptor;
  try {
    descriptor = openSync(
      resolved,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    const before = fstatSync(descriptor);
    if (!before.isFile()) {
      fail(`security input is not a regular file: ${path}`);
    }
    if (before.size < 1 || before.size > maximumBytes) {
      fail(`security input is outside its byte bound: ${path}`);
    }
    const raw = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    const finalLink = lstatSync(resolved);
    if (
      raw.length !== before.size ||
      after.size !== before.size ||
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      finalLink.isSymbolicLink() ||
      finalLink.dev !== before.dev ||
      finalLink.ino !== before.ino ||
      finalLink.size !== before.size
    ) {
      fail(`security input changed during read: ${path}`);
    }
    return raw;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function readJson(path, maximumBytes = MAX_INPUT_BYTES) {
  const raw = readStableFile(path, maximumBytes);
  try {
    return { raw, document: JSON.parse(raw.toString("utf8")) };
  } catch {
    fail(`security input is not valid JSON: ${path}`);
  }
}

function writeAtomicJson(path, value) {
  const resolved = resolve(path);
  mkdirSync(dirname(resolved), { recursive: true });
  const temporary = `${resolved}.partial-${process.pid}-${randomUUID()}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  renameSync(temporary, resolved);
}

function emptyCounts() {
  return {
    unknown: 0,
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
    total: 0,
  };
}

function increment(counts, severity) {
  if (!severityOrder.includes(severity)) severity = "unknown";
  counts[severity] += 1;
  counts.total += 1;
}

function normalizeSeverity(value) {
  const normalized = String(value ?? "").toLowerCase();
  return severityOrder.includes(normalized) ? normalized : "unknown";
}

function declaredSarifSecurityScores(value) {
  const properties = value?.properties;
  if (!properties || typeof properties !== "object") {
    return { declared: false, raw: [] };
  }
  const raw = [];
  let declared = false;
  if (Object.hasOwn(properties, "security-severity")) {
    declared = true;
    raw.push(properties["security-severity"]);
  }
  if (Array.isArray(properties.tags)) {
    for (const tag of properties.tags) {
      if (typeof tag === "string" && tag.startsWith("security-severity/")) {
        declared = true;
        raw.push(tag.slice("security-severity/".length));
      }
    }
  }
  return { declared, raw };
}

function parseSarifSecurityScore(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 && value <= 10 ? value : null;
  }
  if (
    typeof value !== "string" ||
    !/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u.test(value)
  ) {
    return null;
  }
  const score = Number(value);
  return Number.isFinite(score) && score >= 0 && score <= 10 ? score : null;
}

function sarifSeverity(result, rule) {
  const declarations = [
    declaredSarifSecurityScores(result),
    declaredSarifSecurityScores(rule),
  ];
  const declared = declarations.some((item) => item.declared);
  const rawScores = declarations.flatMap((item) => item.raw);
  const scores = rawScores.map(parseSarifSecurityScore);
  const uniqueScores = new Set(scores);
  if (
    declared &&
    rawScores.length > 0 &&
    scores.every((score) => score !== null) &&
    uniqueScores.size === 1
  ) {
    const [score] = uniqueScores;
    if (score >= 9) return "critical";
    if (score >= 7) return "high";
    if (score >= 4) return "medium";
    return "low";
  }
  if (declared) return "unknown";
  const level = String(
    result?.level ?? rule?.defaultConfiguration?.level ?? "",
  ).toLowerCase();
  if (level === "error") return "high";
  if (level === "warning") return "medium";
  if (level === "note") return "low";
  return "unknown";
}

function codeqlVersion(driver) {
  const declared = [driver?.version, driver?.semanticVersion].filter(
    (value) => typeof value === "string" && value.length,
  );
  if (!declared.length || new Set(declared).size !== 1) {
    fail("CodeQL tool version is absent or inconsistent");
  }
  const [version] = declared;
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(version)) {
    fail("CodeQL tool version is malformed");
  }
  return version;
}

function findingScope(result) {
  const scopes = new Set();
  for (const location of result?.locations ?? []) {
    const uri = String(
      location?.physicalLocation?.artifactLocation?.uri ?? "",
    ).replaceAll("\\", "/");
    if (uri.startsWith("docs/")) scopes.add("documentation");
    else if (/^(apps|packages|supabase)\//u.test(uri))
      scopes.add("application");
    else if (uri.startsWith("plugins/")) scopes.add("plugin");
    else if (uri.startsWith("infrastructure/")) scopes.add("infrastructure");
    else if (/^(scripts|\.github)\//u.test(uri)) scopes.add("automation");
    else scopes.add("other");
  }
  if (!scopes.size) scopes.add("unknown");
  return [...scopes].sort();
}

function collectFiles(rootPath, extension) {
  const root = resolve(rootPath);
  if (!lstatSync(root).isDirectory()) {
    fail(`security input directory is invalid: ${rootPath}`);
  }
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink())
        fail(`linked security input rejected: ${path}`);
      if (entry.isDirectory()) visit(path);
      else if (
        entry.isFile() &&
        extname(entry.name).toLowerCase() === extension
      )
        files.push(path);
      else if (!entry.isFile())
        fail(`special security input rejected: ${path}`);
      if (files.length > MAX_SARIF_FILES) fail("too many SARIF inputs");
    }
  };
  visit(root);
  if (!files.length) fail("no SARIF input found");
  return files.sort();
}

export function summarizeCodeql({ input, candidateCommit, analysisCommit }) {
  exactCommit(candidateCommit, "candidate commit");
  exactCommit(analysisCommit, "analysis commit");
  const counts = emptyCounts();
  const ruleCounts = new Map();
  const toolVersions = new Set();
  const sourceDigests = [];

  for (const path of collectFiles(input, ".sarif")) {
    const { raw, document } = readJson(path);
    sourceDigests.push(sha256(raw));
    if (document?.version !== "2.1.0" || !Array.isArray(document.runs)) {
      fail("CodeQL SARIF identity is invalid");
    }
    for (const run of document.runs) {
      const driver = run?.tool?.driver;
      if (!/codeql/iu.test(String(driver?.name ?? ""))) {
        fail("SARIF tool is not CodeQL");
      }
      toolVersions.add(codeqlVersion(driver));
      const extensions = run?.tool?.extensions ?? [];
      if (!Array.isArray(extensions)) fail("CodeQL extensions are malformed");
      const components = [driver, ...extensions];
      const rules = new Map();
      for (const component of components) {
        if (component?.rules !== undefined && !Array.isArray(component.rules)) {
          fail("CodeQL rule metadata is malformed");
        }
        for (const rule of component?.rules ?? []) {
          const id = String(rule?.id ?? "");
          if (!id || rules.has(id)) {
            fail("CodeQL rule metadata is absent or ambiguous");
          }
          rules.set(id, rule);
        }
      }
      for (const result of run.results ?? []) {
        const kind = String(result?.kind ?? "fail");
        if (["pass", "notApplicable", "informational"].includes(kind)) continue;
        const rule = rules.get(result.ruleId);
        if (!rule) fail("CodeQL result references absent rule metadata");
        const id = String(result.ruleId ?? rule?.id ?? "");
        if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{1,159}$/u.test(id)) {
          fail("CodeQL finding has an invalid rule identifier");
        }
        const severity = sarifSeverity(result, rule);
        increment(counts, severity);
        const existing = ruleCounts.get(id) ?? {
          id,
          severity,
          occurrences: 0,
          scopes: new Set(),
        };
        if (existing.severity !== severity) {
          fail(`CodeQL rule severity drifted within one run: ${id}`);
        }
        existing.occurrences += 1;
        findingScope(result).forEach((scope) => existing.scopes.add(scope));
        ruleCounts.set(id, existing);
      }
    }
  }
  if (toolVersions.size !== 1) fail("CodeQL tool versions are inconsistent");
  const summary = {
    schema: "starfiniti.codeql-summary.v1",
    candidateCommit,
    analysisCommit,
    tool: "CodeQL",
    toolVersion: [...toolVersions][0],
    querySuite: "security-extended",
    sourceSha256: sourceDigests.sort(),
    findings: counts,
    rules: [...ruleCounts.values()]
      .map((item) => ({
        id: item.id,
        severity: item.severity,
        occurrences: item.occurrences,
        scopes: [...item.scopes].sort(),
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
  if (counts.critical || counts.high || counts.unknown) {
    policyFail(
      "CodeQL contains Critical High or unclassified findings",
      summary,
    );
  }
  return summary;
}

function trivyFindings(document) {
  const counts = emptyCounts();
  const categoryCounts = {
    vulnerabilities: 0,
    misconfigurations: 0,
    secrets: 0,
    licenses: 0,
  };
  for (const result of document?.Results ?? []) {
    for (const [key, category] of [
      ["Vulnerabilities", "vulnerabilities"],
      ["Misconfigurations", "misconfigurations"],
      ["Secrets", "secrets"],
      ["Licenses", "licenses"],
    ]) {
      for (const finding of result?.[key] ?? []) {
        increment(counts, normalizeSeverity(finding?.Severity));
        categoryCounts[category] += 1;
      }
    }
  }
  return { counts, categoryCounts };
}

export function summarizeRepository({
  input,
  candidateCommit,
  analysisCommit,
}) {
  exactCommit(candidateCommit, "candidate commit");
  exactCommit(analysisCommit, "analysis commit");
  const { raw, document } = readJson(input);
  if (
    document?.SchemaVersion !== 2 ||
    document?.Trivy?.Version !== "0.74.0" ||
    !["filesystem", "repository"].includes(document.ArtifactType) ||
    !Array.isArray(document.Results)
  ) {
    fail("repository Trivy report identity is invalid");
  }
  exactUtc(document.CreatedAt, "repository Trivy createdAt");
  const { counts, categoryCounts } = trivyFindings(document);
  const summary = {
    schema: "starfiniti.repository-scan-summary.v1",
    candidateCommit,
    analysisCommit,
    createdAt: document.CreatedAt,
    artifactType: document.ArtifactType,
    tool: "Trivy",
    toolVersion: document.Trivy.Version,
    sourceSha256: sha256(raw),
    findings: counts,
    categories: categoryCounts,
  };
  if (
    categoryCounts.secrets ||
    counts.critical ||
    counts.high ||
    counts.unknown
  ) {
    policyFail(
      "repository scan contains a secret Critical High or unknown finding",
      summary,
    );
  }
  return summary;
}

export function summarizeTrivyVersion({
  document,
  candidateCommit,
  analysisCommit,
  capturedAt = new Date().toISOString(),
}) {
  exactCommit(candidateCommit, "candidate commit");
  exactCommit(analysisCommit, "analysis commit");
  exactUtc(capturedAt, "Trivy capture time");
  const database = document?.VulnerabilityDB;
  const bundle = document?.CheckBundle;
  if (
    document?.Version !== "0.74.0" ||
    !Number.isSafeInteger(database?.Version) ||
    database.Version < 1 ||
    !/^sha256:[0-9a-f]{64}$/u.test(bundle?.Digest ?? "")
  ) {
    fail("Trivy version or database identity is invalid");
  }
  for (const [value, label] of [
    [database.UpdatedAt, "Trivy database updatedAt"],
    [database.NextUpdate, "Trivy database nextUpdate"],
    [database.DownloadedAt, "Trivy database downloadedAt"],
    [bundle.DownloadedAt, "Trivy check bundle downloadedAt"],
  ]) {
    exactUtc(value, label);
  }
  const captured = Date.parse(capturedAt);
  const updated = Date.parse(database.UpdatedAt);
  const downloaded = Date.parse(database.DownloadedAt);
  const bundleDownloaded = Date.parse(bundle.DownloadedAt);
  if (
    updated > downloaded ||
    downloaded > captured ||
    Date.parse(database.NextUpdate) <= updated ||
    captured - updated > 24 * 60 * 60 * 1000 ||
    bundleDownloaded > captured ||
    captured - bundleDownloaded > 24 * 60 * 60 * 1000
  ) {
    fail("Trivy database or check bundle exceeds the 24-hour freshness bound");
  }
  return {
    schema: "starfiniti.trivy-version-summary.v1",
    candidateCommit,
    analysisCommit,
    capturedAt,
    version: document.Version,
    vulnerabilityDatabase: {
      version: database.Version,
      updatedAt: database.UpdatedAt,
      nextUpdate: database.NextUpdate,
      downloadedAt: database.DownloadedAt,
    },
    checkBundle: {
      digest: bundle.Digest,
      downloadedAt: bundle.DownloadedAt,
    },
  };
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) fail(`unexpected argument: ${token}`);
    const key = token.slice(2);
    if (key === "self-test") {
      result.selfTest = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) fail(`missing value for --${key}`);
    if (Object.hasOwn(result, key)) fail(`duplicate argument --${key}`);
    result[key] = value;
    index += 1;
  }
  return result;
}

function runSelfTest() {
  const temporary = mkdtempSync(join(tmpdir(), "starfiniti-security-summary-"));
  try {
    const writeFixture = (path, value) =>
      writeFileSync(path, JSON.stringify(value), {
        encoding: "utf8",
        flag: "w",
        mode: 0o600,
      });
    const candidateCommit = "a".repeat(40);
    const analysisCommit = "b".repeat(40);
    const sarifDirectory = join(temporary, "sarif");
    mkdirSync(sarifDirectory);
    const sarif = {
      version: "2.1.0",
      runs: [
        {
          tool: {
            driver: {
              name: "CodeQL",
              semanticVersion: "2.26.4",
              rules: [],
            },
            extensions: [
              {
                name: "codeql/javascript-queries",
                rules: [
                  {
                    id: "js/example",
                    properties: { "security-severity": "6.5" },
                  },
                ],
              },
            ],
          },
          results: [
            {
              ruleId: "js/example",
              kind: "fail",
              locations: [
                {
                  physicalLocation: {
                    artifactLocation: { uri: "docs/example.js" },
                  },
                },
              ],
            },
          ],
        },
      ],
    };
    const sarifRule = sarif.runs[0].tool.extensions[0].rules[0];
    writeFixture(join(sarifDirectory, "result.sarif"), sarif);
    const codeql = summarizeCodeql({
      input: sarifDirectory,
      candidateCommit,
      analysisCommit,
    });
    if (
      codeql.findings.medium !== 1 ||
      codeql.rules[0]?.scopes?.[0] !== "documentation"
    ) {
      fail("self-test CodeQL summary did not preserve the finding");
    }
    sarif.runs[0].tool.driver.version = "2.26.3";
    writeFixture(join(sarifDirectory, "result.sarif"), sarif);
    try {
      summarizeCodeql({
        input: sarifDirectory,
        candidateCommit,
        analysisCommit,
      });
      fail("self-test accepted inconsistent CodeQL versions");
    } catch (error) {
      if (!String(error?.message).includes("absent or inconsistent"))
        throw error;
    }
    delete sarif.runs[0].tool.driver.version;
    delete sarifRule.properties["security-severity"];
    sarifRule.properties.tags = ["security", "security-severity/8.1"];
    writeFixture(join(sarifDirectory, "result.sarif"), sarif);
    try {
      summarizeCodeql({
        input: sarifDirectory,
        candidateCommit,
        analysisCommit,
      });
      fail("self-test accepted a High CodeQL finding");
    } catch (error) {
      if (
        !String(error?.message).includes("Critical High") ||
        error?.summary?.findings?.high !== 1 ||
        JSON.stringify(error?.summary).includes("docs/example.js")
      ) {
        throw error;
      }
    }
    sarifRule.properties["security-severity"] = "6.5";
    writeFixture(join(sarifDirectory, "result.sarif"), sarif);
    try {
      summarizeCodeql({
        input: sarifDirectory,
        candidateCommit,
        analysisCommit,
      });
      fail("self-test accepted conflicting CodeQL security severities");
    } catch (error) {
      if (
        !String(error?.message).includes("unclassified") ||
        error?.summary?.findings?.unknown !== 1
      ) {
        throw error;
      }
    }
    delete sarifRule.properties["security-severity"];
    sarifRule.properties.tags = ["security", "security-severity/"];
    writeFixture(join(sarifDirectory, "result.sarif"), sarif);
    try {
      summarizeCodeql({
        input: sarifDirectory,
        candidateCommit,
        analysisCommit,
      });
      fail("self-test accepted an empty CodeQL security severity as zero");
    } catch (error) {
      if (
        !String(error?.message).includes("unclassified") ||
        error?.summary?.findings?.unknown !== 1
      ) {
        throw error;
      }
    }
    delete sarifRule.properties.tags;
    sarifRule.properties["security-severity"] = "6.5";
    sarif.runs[0].tool.extensions.push({
      name: "duplicate-query-pack",
      rules: [{ ...sarifRule }],
    });
    writeFixture(join(sarifDirectory, "result.sarif"), sarif);
    try {
      summarizeCodeql({
        input: sarifDirectory,
        candidateCommit,
        analysisCommit,
      });
      fail("self-test accepted ambiguous CodeQL extension rules");
    } catch (error) {
      if (!String(error?.message).includes("absent or ambiguous")) throw error;
    }
    sarif.runs[0].tool.extensions.pop();
    sarif.runs[0].tool.extensions[0].rules = [];
    writeFixture(join(sarifDirectory, "result.sarif"), sarif);
    try {
      summarizeCodeql({
        input: sarifDirectory,
        candidateCommit,
        analysisCommit,
      });
      fail("self-test accepted absent CodeQL extension rule metadata");
    } catch (error) {
      if (!String(error?.message).includes("references absent")) throw error;
    }

    const repositoryPath = join(temporary, "repository.json");
    const repository = {
      SchemaVersion: 2,
      Trivy: { Version: "0.74.0" },
      CreatedAt: "2026-08-29T10:00:00Z",
      ArtifactType: "repository",
      Results: [],
    };
    writeFixture(repositoryPath, repository);
    const repositorySummary = summarizeRepository({
      input: repositoryPath,
      candidateCommit,
      analysisCommit,
    });
    if (
      repositorySummary.findings.total !== 0 ||
      repositorySummary.artifactType !== "repository" ||
      repositorySummary.toolVersion !== "0.74.0"
    ) {
      fail("self-test repository summary drifted");
    }
    repository.Results.push({
      Secrets: [{ Severity: "CRITICAL", Match: "never retained" }],
    });
    writeFixture(repositoryPath, repository);
    try {
      summarizeRepository({
        input: repositoryPath,
        candidateCommit,
        analysisCommit,
      });
      fail("self-test accepted a repository secret");
    } catch (error) {
      if (
        !String(error?.message).includes("repository scan contains") ||
        error?.summary?.categories?.secrets !== 1 ||
        JSON.stringify(error?.summary).includes("never retained")
      )
        throw error;
    }

    const trivy = summarizeTrivyVersion({
      candidateCommit,
      analysisCommit,
      capturedAt: "2026-08-29T12:00:00Z",
      document: {
        Version: "0.74.0",
        VulnerabilityDB: {
          Version: 2,
          UpdatedAt: "2026-08-29T00:00:00Z",
          NextUpdate: "2026-08-30T00:00:00Z",
          DownloadedAt: "2026-08-29T01:00:00Z",
        },
        CheckBundle: {
          Digest: `sha256:${"c".repeat(64)}`,
          DownloadedAt: "2026-08-29T01:00:00Z",
        },
      },
    });
    if (trivy.vulnerabilityDatabase.version !== 2) {
      fail("self-test Trivy summary drifted");
    }
    try {
      summarizeTrivyVersion({
        candidateCommit,
        analysisCommit,
        capturedAt: "2026-08-30T02:00:01Z",
        document: {
          Version: "0.74.0",
          VulnerabilityDB: {
            Version: 2,
            UpdatedAt: "2026-08-29T00:00:00Z",
            NextUpdate: "2026-08-30T00:00:00Z",
            DownloadedAt: "2026-08-29T01:00:00Z",
          },
          CheckBundle: {
            Digest: `sha256:${"c".repeat(64)}`,
            DownloadedAt: "2026-08-29T01:00:00Z",
          },
        },
      });
      fail("self-test accepted stale scanner databases");
    } catch (error) {
      if (!String(error?.message).includes("freshness bound")) throw error;
    }
  } finally {
    const resolved = resolve(temporary);
    const expectedPrefix = `${resolve(tmpdir())}${sep}`;
    if (
      !resolved.startsWith(expectedPrefix) ||
      !resolved.includes("starfiniti-security-summary-")
    ) {
      fail("refusing to remove an unexpected self-test directory");
    }
    rmSync(resolved, { recursive: true, force: true });
  }
}

const args = parseArgs(process.argv.slice(2));
if (args.selfTest) {
  runSelfTest();
  console.log("Validated minimized CodeQL, repository, and Trivy summaries.");
} else {
  const candidateCommit = exactCommit(args.candidate, "candidate commit");
  const analysisCommit = exactCommit(args.analysis, "analysis commit");
  if (!args.out) fail("--out is required");
  let summary;
  let policyError;
  try {
    if (args.mode === "codeql") {
      if (!args.input) fail("--input is required for CodeQL mode");
      summary = summarizeCodeql({
        input: args.input,
        candidateCommit,
        analysisCommit,
      });
    } else if (args.mode === "repository") {
      if (!args.input) fail("--input is required for repository mode");
      summary = summarizeRepository({
        input: args.input,
        candidateCommit,
        analysisCommit,
      });
    } else if (args.mode === "trivy-version") {
      const raw = execFileSync(
        "trivy",
        [
          "--cache-dir",
          args["cache-dir"] ?? ".cache/trivy",
          "version",
          "--format",
          "json",
        ],
        { encoding: "utf8", maxBuffer: 1024 * 1024 },
      );
      summary = summarizeTrivyVersion({
        document: JSON.parse(raw),
        candidateCommit,
        analysisCommit,
      });
    } else {
      fail("--mode must be codeql, repository, or trivy-version");
    }
  } catch (error) {
    if (!(error instanceof SecurityPolicyError)) throw error;
    summary = error.summary;
    policyError = error;
  }
  writeAtomicJson(args.out, summary);
  if (policyError) {
    console.error(
      `${policyError.message}; retained only minimized evidence at ${args.out}.`,
    );
    process.exitCode = 1;
  } else {
    console.log(`Wrote minimized ${args.mode} evidence to ${args.out}.`);
  }
}
