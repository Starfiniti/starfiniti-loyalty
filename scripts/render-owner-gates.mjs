import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";
import { format, resolveConfig } from "prettier";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const paths = {
  backlog: "docs/plan/IMPROVEMENT_BACKLOG.yaml",
  output: "docs/plan/OWNER_GATES.md",
};

const ranking = {
  formula:
    "severityPoints + (2 * merchantImpact) + (2 * customerImpact) + confidence - effort - dependencyPenalty",
  severityPoints: { critical: 40, high: 30, medium: 20, low: 10 },
  sort: ["score-descending", "id-ascending"],
};
const expectedIds = new Set(
  Array.from(
    { length: 14 },
    (_, index) => `IMP-${String(index + 1).padStart(3, "0")}`,
  ),
);
const allowedStatuses = new Set([
  "planned",
  "in_progress",
  "blocked_external",
  "blocked_dependency",
  "complete",
]);
const pendingStatuses = new Set([
  "planned",
  "in_progress",
  "blocked_external",
  "blocked_dependency",
]);
const rootKeys = new Set([
  "schema",
  "version",
  "observedAt",
  "ranking",
  "items",
]);
const rankingKeys = new Set(["formula", "severityPoints", "sort"]);
const itemKeys = new Set([
  "id",
  "title",
  "severity",
  "merchantImpact",
  "customerImpact",
  "effort",
  "confidence",
  "dependencyPenalty",
  "score",
  "status",
  "evidence",
  "dependency",
  "ownerInput",
]);
const secretPatterns = [
  /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{8,}\b/u,
  /\bwhsec_[A-Za-z0-9]{8,}\b/u,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /\bgh[opsu]_[A-Za-z0-9]{20,}\b/u,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/u,
  /\b(?:Basic|Bearer)\s+[A-Za-z0-9+/_=-]{16,}\b/iu,
  /\b(?:xox[baprs]-[A-Za-z0-9-]{16,}|SG\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{20,})\b/u,
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/iu,
  /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password|passwd|pwd)\s*[:=]\s*["']?[A-Za-z0-9+/_=.-]{8,}/iu,
];

function fail(message) {
  throw new Error(`owner-gates: ${message}`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  const actual = Object.keys(value);
  const missing = [...expected].filter((key) => !actual.includes(key));
  const unknown = actual.filter((key) => !expected.has(key));
  if (missing.length > 0 || unknown.length > 0) {
    fail(
      `${label} keys differ (missing: ${missing.join(", ") || "none"}; unknown: ${unknown.join(", ") || "none"})`,
    );
  }
}

function exactString(value, label, minimum = 8) {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length < minimum ||
    /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/u.test(
      value,
    )
  ) {
    fail(
      `${label} must be a trimmed single-line string of at least ${minimum} characters`,
    );
  }
  for (const pattern of secretPatterns) {
    if (pattern.test(value)) fail(`${label} contains reusable secret material`);
  }
  return value;
}

function markdownSentence(value, label, minimum) {
  exactString(value, label, minimum);
  if (/[<>`[\]{}|]/u.test(value)) {
    fail(`${label} contains unsafe Markdown control characters`);
  }
  return value;
}

function exactInteger(value, label, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    fail(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function score(item) {
  return (
    ranking.severityPoints[item.severity] +
    2 * item.merchantImpact +
    2 * item.customerImpact +
    item.confidence -
    item.effort -
    item.dependencyPenalty
  );
}

function evidencePath(relativePath, checkFilesystem) {
  exactString(relativePath, "evidence path", 6);
  if (
    isAbsolute(relativePath) ||
    relativePath.includes("\\") ||
    relativePath.split("/").some((part) => part === "" || part === "..")
  ) {
    fail(`evidence path is unsafe: ${relativePath}`);
  }
  const absolute = resolve(root, relativePath);
  if (absolute !== root && !absolute.startsWith(`${root}${sep}`)) {
    fail(`evidence path escapes the repository: ${relativePath}`);
  }
  if (checkFilesystem) {
    const comparePath = (value) =>
      process.platform === "win32" ? value.toLowerCase() : value;
    if (existsSync(absolute)) {
      const stat = lstatSync(absolute);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        fail(
          `evidence path must be a regular non-symlink file: ${relativePath}`,
        );
      }
      if (
        comparePath(realpathSync.native(absolute)) !== comparePath(absolute)
      ) {
        fail(`evidence path is not canonical: ${relativePath}`);
      }
    } else {
      const parent = dirname(absolute);
      let parentStat;
      try {
        parentStat = lstatSync(parent);
      } catch {
        fail(`pending evidence parent does not exist: ${relativePath}`);
      }
      if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) {
        fail(
          `pending evidence parent must be a non-symlink directory: ${relativePath}`,
        );
      }
      if (comparePath(realpathSync.native(parent)) !== comparePath(parent)) {
        fail(`pending evidence parent is not canonical: ${relativePath}`);
      }
    }
  }
  return absolute;
}

function generatedOutputPath({ required }) {
  const output = resolve(root, paths.output);
  const comparePath = (value) =>
    process.platform === "win32" ? value.toLowerCase() : value;
  if (existsSync(output)) {
    const stat = lstatSync(output);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      fail(`${paths.output} must be a regular non-symlink file`);
    }
    if (comparePath(realpathSync.native(output)) !== comparePath(output)) {
      fail(`${paths.output} is not canonical`);
    }
  } else {
    const parent = dirname(output);
    const parentStat = lstatSync(parent);
    if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) {
      fail(`${paths.output} parent must be a non-symlink directory`);
    }
    if (comparePath(realpathSync.native(parent)) !== comparePath(parent)) {
      fail(`${paths.output} parent is not canonical`);
    }
    if (required)
      fail(`${paths.output} is missing; run npm run owner-gates:render`);
  }
  return output;
}

function validateBacklog(backlog, { checkFilesystem = true } = {}) {
  exactKeys(backlog, rootKeys, "backlog");
  if (
    backlog.schema !== "starfiniti.improvement-backlog.v1" ||
    backlog.version !== 1
  ) {
    fail("backlog schema or version differs");
  }
  const observedAtPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u;
  const observedAtDate =
    typeof backlog.observedAt === "string"
      ? new Date(backlog.observedAt)
      : new Date(Number.NaN);
  const canonicalObservedAt = Number.isNaN(observedAtDate.valueOf())
    ? null
    : observedAtDate.toISOString().replace(".000Z", "Z");
  if (
    typeof backlog.observedAt !== "string" ||
    !observedAtPattern.test(backlog.observedAt) ||
    canonicalObservedAt !== backlog.observedAt
  ) {
    fail("backlog observedAt must be an exact UTC timestamp");
  }
  exactKeys(backlog.ranking, rankingKeys, "backlog ranking");
  if (
    backlog.ranking.formula !== ranking.formula ||
    JSON.stringify(backlog.ranking.severityPoints) !==
      JSON.stringify(ranking.severityPoints) ||
    JSON.stringify(backlog.ranking.sort) !== JSON.stringify(ranking.sort)
  ) {
    fail("backlog ranking contract differs");
  }
  if (
    !Array.isArray(backlog.items) ||
    backlog.items.length !== expectedIds.size
  ) {
    fail(`backlog must contain exactly ${expectedIds.size} items`);
  }

  const ids = new Set();
  let previousScore = Number.POSITIVE_INFINITY;
  let previousId = "";
  for (const [index, item] of backlog.items.entries()) {
    exactKeys(item, itemKeys, `backlog item ${index + 1}`);
    exactString(item.id, `backlog item ${index + 1} id`, 7);
    if (!/^IMP-\d{3}$/u.test(item.id) || !expectedIds.has(item.id)) {
      fail(`${item.id} is not a required backlog id`);
    }
    if (ids.has(item.id)) fail(`${item.id} is duplicated`);
    ids.add(item.id);

    markdownSentence(item.title, `${item.id}.title`, 12);
    if (item.title.includes("#")) {
      fail(`${item.id}.title contains unsafe Markdown control characters`);
    }
    if (!(item.severity in ranking.severityPoints)) {
      fail(`${item.id}.severity is unsupported`);
    }
    for (const field of [
      "merchantImpact",
      "customerImpact",
      "effort",
      "confidence",
      "dependencyPenalty",
    ]) {
      exactInteger(item[field], `${item.id}.${field}`, 0, 10);
    }
    exactInteger(item.score, `${item.id}.score`, 0, 100);
    const calculated = score(item);
    if (item.score !== calculated)
      fail(`${item.id}.score differs from ${calculated}`);
    if (
      calculated > previousScore ||
      (calculated === previousScore && item.id.localeCompare(previousId) < 0)
    ) {
      fail("backlog order differs from score-descending, id-ascending");
    }
    if (!allowedStatuses.has(item.status)) {
      fail(`${item.id}.status is unsupported`);
    }
    markdownSentence(item.dependency, `${item.id}.dependency`, 20);
    markdownSentence(item.ownerInput, `${item.id}.ownerInput`, 20);
    const absoluteEvidence = evidencePath(item.evidence, checkFilesystem);
    if (
      checkFilesystem &&
      item.status === "complete" &&
      !existsSync(absoluteEvidence)
    ) {
      fail(`${item.id} completed gate evidence does not exist`);
    }
    previousScore = calculated;
    previousId = item.id;
  }
  if ([...expectedIds].some((id) => !ids.has(id))) {
    fail("backlog does not contain every required id");
  }
  return backlog;
}

function markdownEvidenceLink(path) {
  const outputDirectory = dirname(resolve(root, paths.output));
  const target = relative(outputDirectory, resolve(root, path)).replaceAll(
    "\\",
    "/",
  );
  const state = existsSync(resolve(root, path))
    ? "current artifact"
    : "pending artifact";
  return `[${path}](${target}) (${state})`;
}

function statusLabel(status) {
  return {
    planned: "Planned",
    in_progress: "In progress",
    blocked_external: "External input required",
    blocked_dependency: "Dependency blocked",
    complete: "Complete",
  }[status];
}

function render(backlog, backlogRaw) {
  validateBacklog(backlog);
  const pending = backlog.items.filter((item) =>
    pendingStatuses.has(item.status),
  );
  const external = backlog.items.filter(
    (item) => item.status === "blocked_external",
  );
  const dependent = backlog.items.filter(
    (item) => item.status === "blocked_dependency",
  );
  const complete = backlog.items.filter((item) => item.status === "complete");
  const lines = [
    "# Starfiniti Loyalty — Owner Gates",
    "",
    `> Generated from \`${paths.backlog}\` observed at \`${backlog.observedAt}\` (SHA-256 \`${sha256(backlogRaw)}\`). Do not edit this file by hand; run \`npm run owner-gates:render\`.`,
    "",
    "This is the final handoff for actions that require an owner, approved environment, external credential, independent reviewer, or elapsed production window. Repository work continues independently wherever a safe slice remains. A gate passes only when its referenced evidence records the required result; saying “approved” in chat or checking a box here is not completion evidence.",
    "",
    "## Safety and authority",
    "",
    "- Never paste credentials, private keys, receiver destinations, customer data, tenant identifiers, provider payloads, or private environment inventories into Git, pull requests, issues, chat, or committed evidence. Supply them through the approved secret or operations channel named for the gate.",
    "- Authorize one gate ID and one action boundary at a time. Merge, release, deployment, installation, reboot, destructive exercise, canary activation, and GA approval are separate decisions unless the gate explicitly proves otherwise.",
    "- An approval does not grant tenant, ledger, customer, billing, database-superuser, checkout, or secret authority. Existing RLS, immutable-ledger, idempotency, recovery, and checkout-independence controls remain mandatory.",
    "- Before acting, revalidate the exact candidate, evidence freshness, rollback owner, recovery point, window, and observation plan. Historical commit or run identifiers in the backlog cannot authorize a newer head.",
    "- Self-hosted deployments remain usable without Stripe or remote licence enforcement. Shopify and cash-like stored value remain outside this roadmap.",
    "",
    "## Current queue",
    "",
    `- Pending gates: **${pending.length}**`,
    `- External-input gates: **${external.length}**`,
    `- Dependency-blocked gates: **${dependent.length}**`,
    `- Completed gates retained in this backlog: **${complete.length}**`,
    "",
    "| Priority | Gate | Severity | Score | State | Owner action |",
    "| ---: | --- | --- | ---: | --- | --- |",
  ];

  for (const [index, item] of backlog.items.entries()) {
    lines.push(
      `| ${index + 1} | \`${item.id}\` — ${item.title} | ${item.severity} | ${item.score} | ${statusLabel(item.status)} | ${item.ownerInput.replaceAll("|", "\\|")} |`,
    );
  }

  lines.push("", "## Gate details", "");
  for (const [index, item] of backlog.items.entries()) {
    lines.push(
      `### ${index + 1}. ${item.id} — ${item.title}`,
      "",
      `- State: **${statusLabel(item.status)}**; severity **${item.severity}**; priority score **${item.score}**.`,
      `- What only the owner or external party must do: ${item.ownerInput}`,
      `- Why it is not closed: ${item.dependency}`,
      `- Evidence gate: ${markdownEvidenceLink(item.evidence)}.`,
      "- Passing boundary: the evidence gate must record the exact approved input, bounded execution, rollback or recovery result, independent review where required, observation, and reconciliation. Until then this item remains open regardless of verbal approval.",
      "",
    );
  }

  lines.push(
    "## Scoped authorization template",
    "",
    "> Approve gate `IMP-___` only for `[exact action]` against `[exact candidate or release]` during `[bounded window]`. `[named rollback owner]` owns rollback and `[named independent reviewer]` owns reconciliation. This does not approve any other gate or reveal any credential in this message.",
    "",
    "Operations should record the actual authorization in the approved private system and retain only its minimized digest or reference in repository evidence when the relevant gate permits it.",
    "",
  );
  return `${lines.join("\n")}\n`;
}

async function renderFormatted(backlog, backlogRaw) {
  const output = resolve(root, paths.output);
  const config = (await resolveConfig(output)) ?? {};
  return format(render(backlog, backlogRaw), {
    ...config,
    filepath: output,
  });
}

function parse(raw) {
  let value;
  try {
    value = YAML.parse(raw);
  } catch (error) {
    fail(`backlog YAML is invalid: ${error.message}`);
  }
  return value;
}

function expectFailure(label, callback, pattern) {
  try {
    callback();
  } catch (error) {
    if (pattern && !pattern.test(error.message)) {
      fail(`${label} failed for the wrong reason: ${error.message}`);
    }
    return;
  }
  fail(`${label} was accepted`);
}

function secretFixture(...parts) {
  return parts.join("");
}

async function runSelfTests(backlog, backlogRaw) {
  const clone = () => structuredClone(backlog);
  const valid = validateBacklog(clone(), { checkFilesystem: false });
  const first = await renderFormatted(valid, backlogRaw);
  const second = await renderFormatted(clone(), backlogRaw);
  if (first !== second) fail("rendering is not deterministic");

  const cases = [
    ["missing item", (candidate) => candidate.items.pop(), /exactly 14 items/u],
    [
      "duplicate id",
      (candidate) => {
        candidate.items[1].id = candidate.items[0].id;
      },
      /duplicated/u,
    ],
    [
      "unknown root field",
      (candidate) => {
        candidate.approved = true;
      },
      /keys differ/u,
    ],
    [
      "unknown item field",
      (candidate) => {
        candidate.items[0].credential = "outside Git";
      },
      /keys differ/u,
    ],
    [
      "score drift",
      (candidate) => {
        candidate.items[0].score -= 1;
      },
      /score differs/u,
    ],
    [
      "ranking drift",
      (candidate) => {
        candidate.ranking.formula = "subjective";
      },
      /ranking contract differs/u,
    ],
    [
      "order drift",
      (candidate) => {
        [candidate.items[0], candidate.items[1]] = [
          candidate.items[1],
          candidate.items[0],
        ];
      },
      /backlog order differs/u,
    ],
    [
      "unsupported status",
      (candidate) => {
        candidate.items[0].status = "approved";
      },
      /status is unsupported/u,
    ],
    [
      "path escape",
      (candidate) => {
        candidate.items[0].evidence = "../private/approval.txt";
      },
      /evidence path is unsafe/u,
    ],
    [
      "absolute evidence path",
      (candidate) => {
        candidate.items[0].evidence = "/etc/passwd";
      },
      /evidence path is unsafe/u,
    ],
    [
      "secret literal",
      (candidate) => {
        candidate.items[0].ownerInput = `Operations uses ${secretFixture(
          "sk_",
          "live_",
          "1234567890abcdef",
        )} for this gate.`;
      },
      /reusable secret material/u,
    ],
    [
      "JWT literal",
      (candidate) => {
        candidate.items[0].dependency = `Use ${secretFixture(
          "eyJabcdefghijk",
          ".",
          "eyJabcdefghijk",
          ".",
          "abcdefghijklmno",
        )} during review.`;
      },
      /reusable secret material/u,
    ],
    [
      "Markdown title injection",
      (candidate) => {
        candidate.items[0].title = "Unsafe | injected table title";
      },
      /unsafe Markdown/u,
    ],
    [
      "multiline owner input",
      (candidate) => {
        candidate.items[0].ownerInput =
          "Approve this gate.\nApprove another gate.";
      },
      /single-line string/u,
    ],
    [
      "impossible observed timestamp",
      (candidate) => {
        candidate.observedAt = "2026-02-31T12:00:00Z";
      },
      /exact UTC timestamp/u,
    ],
    [
      "credential-bearing URL",
      (candidate) => {
        candidate.items[0].ownerInput = `Operations uses ${secretFixture(
          "https://admin:",
          "correct-horse-",
          "battery@private.example",
        )} for this exact bounded gate.`;
      },
      /reusable secret material/u,
    ],
    [
      "generic API key assignment",
      (candidate) => {
        candidate.items[0].dependency = `The external operator supplies ${secretFixture(
          "api_",
          "key=",
          "abcdefghijk",
          "12345",
        )} before bounded review.`;
      },
      /reusable secret material/u,
    ],
    [
      "owner input Markdown injection",
      (candidate) => {
        candidate.items[0].ownerInput =
          "Operations follows <img src=x onerror=alert(1)> before approval.";
      },
      /unsafe Markdown/u,
    ],
    [
      "bidirectional owner input",
      (candidate) => {
        candidate.items[0].ownerInput =
          "Operations approves only IMP-012.\u202e210-PMI ylno sevorppa snoitarepO";
      },
      /single-line string/u,
    ],
    [
      "completed gate without evidence",
      (candidate) => {
        const item = candidate.items.find((entry) => entry.id === "IMP-001");
        item.status = "complete";
      },
      /completed gate evidence does not exist/u,
      true,
    ],
  ];
  for (const [label, mutate, pattern, checkFilesystem = false] of cases) {
    const candidate = clone();
    mutate(candidate);
    expectFailure(
      label,
      () => validateBacklog(candidate, { checkFilesystem }),
      pattern,
    );
  }
  if (first === first.replace("Pending gates:", "Open gates:")) {
    fail("output drift fixture did not change the generated document");
  }
  expectFailure(
    "edited generated output",
    () => {
      const edited = first.replace("Pending gates:", "Open gates:");
      if (edited !== first) fail("generated output differs");
    },
    /generated output differs/u,
  );
  return cases.length + 3;
}

const args = new Set(process.argv.slice(2));
for (const argument of args) {
  if (!["--self-test", "--write"].includes(argument)) {
    fail(`unsupported argument: ${argument}`);
  }
}
if (args.has("--self-test") && args.has("--write")) {
  fail("--self-test and --write are mutually exclusive");
}

const backlogRaw = readFileSync(join(root, paths.backlog), "utf8");
const backlog = validateBacklog(parse(backlogRaw));
const expected = await renderFormatted(backlog, backlogRaw);

if (args.has("--write")) {
  writeFileSync(generatedOutputPath({ required: false }), expected, "utf8");
  console.log(
    `Rendered ${paths.output} from ${backlog.items.length} owner gates.`,
  );
} else {
  const current = readFileSync(generatedOutputPath({ required: true }), "utf8");
  if (current !== expected) {
    fail(`${paths.output} has drifted; run npm run owner-gates:render`);
  }
  const selfTestCount = args.has("--self-test")
    ? await runSelfTests(backlog, backlogRaw)
    : 0;
  console.log(
    `Validated ${backlog.items.length} owner gates, deterministic generated output, and ${selfTestCount} adversarial cases.`,
  );
}
