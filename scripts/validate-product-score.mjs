import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const realRoot = realpathSync.native(root);
const scorePath = "docs/plan/evaluations/product-score.json";
const scorecardPath = "QUALITY_SCORECARD.md";
const tasksPath = "docs/plan/TASKS.yaml";
const document = JSON.parse(readFileSync(join(root, scorePath), "utf8"));
const scorecard = readFileSync(join(root, scorecardPath), "utf8");
const tasks = YAML.parse(readFileSync(join(root, tasksPath), "utf8"));

const categoryWeights = new Map([
  ["activation", 10],
  ["feature_breadth", 25],
  ["merchant_usability", 15],
  ["customer_value", 15],
  ["reliability", 15],
  ["operations", 10],
  ["enterprise_commercial", 10],
]);
const automaticFailDefinitions = new Map([
  [
    "unexplained_protected_difference",
    "an unexplained ledger balance liability coupon referral campaign usage or invoice difference exists",
  ],
  [
    "untrusted_tenant_authority",
    "cross-tenant access or authority derives from browser email domain mutable identity claims or upstream groups",
  ],
  [
    "duplicate_or_unrecoverable_effect",
    "a duplicate value effect overspend budget overrun or unrecoverable accepted event exists",
  ],
  ["checkout_hub_dependency", "checkout synchronously depends on the hub"],
  [
    "unresolved_critical_high",
    "a critical or high security privacy recovery or data-loss finding remains unresolved",
  ],
  [
    "required_live_evidence_absent",
    "required clean-room recovery or real-store canary evidence is absent",
  ],
]);
const automaticFailIds = new Set(automaticFailDefinitions.keys());
const subjectIds = new Set(["production", "candidate"]);
const safeEvidenceExtensions = new Set([".json", ".md", ".yaml", ".yml"]);
const commitPattern = /^[0-9a-f]{40}$/u;
const digestPattern = /^[0-9a-f]{64}$/u;
const historicalScoreIdentity = Object.freeze({
  schemaVersion: 1,
  evaluatedAt: "2026-08-13",
  path: "docs/plan/evaluations/product-score-v1-2026-08-13.json",
  sha256: "699a781d0483068b82a7b369760cc265b969feda9a03b134dfed6129727afc95",
  score: 54,
  release: "v0.1.11",
  sourceCommit: "0ced4b666a55d836bd3d4927337fe057a71bb4ba",
});

function fail(message) {
  throw new Error(`Product score validation failed: ${message}`);
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function exactKeys(value, expected, label) {
  if (!isPlainObject(value)) fail(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    fail(`${label} keys differ`);
  }
}

function uniqueIds(values, label) {
  if (!Array.isArray(values)) fail(`${label} must be an array`);
  const ids = new Set();
  for (const value of values) {
    if (!isPlainObject(value) || typeof value.id !== "string") {
      fail(`${label} must contain objects with string ids`);
    }
    if (ids.has(value.id)) fail(`${label} contains duplicate id ${value.id}`);
    ids.add(value.id);
  }
  return ids;
}

function exactSet(actual, expected, label) {
  if (
    actual.size !== expected.size ||
    [...actual].some((value) => !expected.has(value))
  ) {
    fail(`${label} differs`);
  }
}

function exactDate(value, label) {
  const match =
    typeof value === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value) : null;
  const parsed = match ? new Date(`${value}T00:00:00Z`) : null;
  if (
    !match ||
    !parsed ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.getUTCFullYear() !== Number(match[1]) ||
    parsed.getUTCMonth() + 1 !== Number(match[2]) ||
    parsed.getUTCDate() !== Number(match[3]) ||
    parsed.getTime() > Date.now() + 86_400_000
  ) {
    fail(`${label} must be a current or historical UTC date`);
  }
  return value;
}

function boundedText(value, label) {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length < 8 ||
    value.length > 4096
  ) {
    fail(`${label} must be bounded non-blank text`);
  }
}

function readBoundRepositoryFile(relativePath, label) {
  if (
    typeof relativePath !== "string" ||
    relativePath.length < 3 ||
    relativePath.includes("\\") ||
    !safeEvidenceExtensions.has(extname(relativePath))
  ) {
    fail(`${label} must be a repository evidence path`);
  }
  const absolute = resolve(root, relativePath);
  const inside = relative(root, absolute);
  if (
    inside === "" ||
    inside === ".." ||
    inside.startsWith(`..${sep}`) ||
    resolve(root, inside) !== absolute
  ) {
    fail(`${label} escapes the repository`);
  }
  let cursor = root;
  try {
    for (const part of inside.split(sep)) {
      cursor = join(cursor, part);
      if (lstatSync(cursor).isSymbolicLink()) {
        fail(`${label} must not traverse a symbolic link`);
      }
    }
    const real = realpathSync.native(absolute);
    const realInside = relative(realRoot, real);
    if (
      realInside === "" ||
      realInside === ".." ||
      realInside.startsWith(`..${sep}`)
    ) {
      fail(`${label} resolves outside the repository`);
    }
  } catch {
    fail(`${label} does not exist`);
  }
  const noFollow = constants.O_NOFOLLOW ?? 0;
  let descriptor;
  try {
    descriptor = openSync(absolute, constants.O_RDONLY | noFollow);
    const stateBefore = fstatSync(descriptor);
    if (
      !stateBefore.isFile() ||
      stateBefore.size < 2 ||
      stateBefore.size > 2 * 1024 * 1024
    ) {
      fail(`${label} must be one bounded regular file`);
    }
    const bytes = readFileSync(descriptor);
    const stateAfter = fstatSync(descriptor);
    if (
      bytes.length !== stateBefore.size ||
      stateAfter.size !== stateBefore.size ||
      stateAfter.mtimeMs !== stateBefore.mtimeMs
    ) {
      fail(`${label} changed while it was read`);
    }
    return bytes;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Product score")) {
      throw error;
    }
    fail(`${label} cannot be opened safely`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function verifyCommit(commit, label) {
  if (!commitPattern.test(commit) || /^0{40}$/u.test(commit)) {
    fail(`${label} must be an exact nonzero commit`);
  }
  try {
    execFileSync("git", ["cat-file", "-e", `${commit}^{commit}`], {
      cwd: root,
      stdio: "ignore",
    });
    execFileSync("git", ["merge-base", "--is-ancestor", commit, "HEAD"], {
      cwd: root,
      stdio: "ignore",
    });
  } catch {
    fail(
      `${label} must resolve to an ancestor commit; validation requires full Git history`,
    );
  }
}

function validateHistoricalScore(history) {
  exactKeys(
    history,
    ["schemaVersion", "evaluatedAt", "path", "sha256", "score"],
    "score history entry",
  );
  if (
    Object.entries(historicalScoreIdentity)
      .filter(([key]) => key in history)
      .some(([key, expected]) => history[key] !== expected)
  ) {
    fail("historical score identity differs");
  }
  exactDate(history.evaluatedAt, "score history evaluatedAt");
  if (!digestPattern.test(history.sha256) || /^0{64}$/u.test(history.sha256)) {
    fail("score history digest must be exact and nonzero");
  }
  const raw = readBoundRepositoryFile(history.path, "score history path");
  const actualDigest = createHash("sha256").update(raw).digest("hex");
  if (actualDigest !== history.sha256) fail("score history digest differs");
  const historical = JSON.parse(raw.toString("utf8"));
  exactKeys(
    historical,
    [
      "schemaVersion",
      "evaluatedAt",
      "release",
      "sourceCommit",
      "score",
      "target",
      "minimumCategoryRatio",
      "categories",
      "automaticFails",
    ],
    "historical V1 score",
  );
  if (
    historical.schemaVersion !== 1 ||
    historical.evaluatedAt !== history.evaluatedAt ||
    historical.score !== history.score ||
    historical.target !== 90 ||
    historical.minimumCategoryRatio !== 0.8
  ) {
    fail("historical V1 score binding differs");
  }
  if (
    historical.release !== historicalScoreIdentity.release ||
    historical.sourceCommit !== historicalScoreIdentity.sourceCommit
  ) {
    fail("historical V1 release identity differs");
  }
  verifyCommit(historical.sourceCommit, "historical V1 sourceCommit");
}

function validateSubject(subject, scoreDocument) {
  exactKeys(
    subject,
    [
      "id",
      "kind",
      "evaluatedAt",
      "release",
      "branch",
      "sourceCommit",
      "score",
      "target",
      "minimumCategoryRatio",
      "gateStatus",
      "categories",
      "automaticFailStates",
      "remainingGate",
    ],
    `${subject.id} subject`,
  );
  exactDate(subject.evaluatedAt, `${subject.id} evaluatedAt`);
  if (
    subject.evaluatedAt !== scoreDocument.evaluatedAt ||
    subject.target !== scoreDocument.target ||
    subject.minimumCategoryRatio !== scoreDocument.minimumCategoryRatio
  ) {
    fail(`${subject.id} score thresholds or date differ`);
  }
  verifyCommit(subject.sourceCommit, `${subject.id} sourceCommit`);
  if (subject.id === "production") {
    if (
      subject.kind !== "release" ||
      subject.release !== "v0.1.11" ||
      subject.branch !== null
    ) {
      fail("production subject identity differs");
    }
  } else if (
    subject.kind !== "integration_candidate" ||
    subject.release !== null ||
    subject.branch !== "main"
  ) {
    fail("candidate subject identity differs");
  }
  if (
    ![
      "blocked_external",
      "blocked_dependency",
      "in_progress",
      "complete",
    ].includes(subject.gateStatus)
  ) {
    fail(`${subject.id} gate status differs`);
  }

  exactSet(
    uniqueIds(subject.categories, `${subject.id} categories`),
    new Set(categoryWeights.keys()),
    `${subject.id} categories`,
  );
  let total = 0;
  let categoriesMeetFloor = true;
  for (const category of subject.categories) {
    exactKeys(
      category,
      ["id", "weight", "score", "evidence", "evidencePaths"],
      `${subject.id}.${category.id} category`,
    );
    const weight = categoryWeights.get(category.id);
    if (
      category.weight !== weight ||
      !Number.isInteger(category.score) ||
      category.score < 0 ||
      category.score > weight
    ) {
      fail(`${subject.id}.${category.id} score or weight differs`);
    }
    boundedText(category.evidence, `${subject.id}.${category.id} evidence`);
    if (
      !Array.isArray(category.evidencePaths) ||
      category.evidencePaths.length < 1
    ) {
      fail(`${subject.id}.${category.id} evidence paths are absent`);
    }
    const paths = new Set();
    for (const evidencePath of category.evidencePaths) {
      if (paths.has(evidencePath)) {
        fail(`${subject.id}.${category.id} evidence path is duplicated`);
      }
      paths.add(evidencePath);
      readBoundRepositoryFile(
        evidencePath,
        `${subject.id}.${category.id} evidence path`,
      );
    }
    total += category.score;
    if (category.score < Math.ceil(weight * subject.minimumCategoryRatio)) {
      categoriesMeetFloor = false;
    }
  }
  if (!Number.isInteger(subject.score) || subject.score !== total) {
    fail(`${subject.id} total is not the category sum`);
  }

  exactSet(
    uniqueIds(
      subject.automaticFailStates,
      `${subject.id} automatic fail states`,
    ),
    automaticFailIds,
    `${subject.id} automatic fail states`,
  );
  let automaticFailsClear = true;
  for (const state of subject.automaticFailStates) {
    exactKeys(
      state,
      ["id", "status", "evidence"],
      `${subject.id}.${state.id} automatic fail state`,
    );
    if (!["clear", "active", "unknown"].includes(state.status)) {
      fail(`${subject.id}.${state.id} automatic fail status differs`);
    }
    boundedText(state.evidence, `${subject.id}.${state.id} evidence`);
    if (state.status !== "clear") automaticFailsClear = false;
  }
  boundedText(subject.remainingGate, `${subject.id} remaining gate`);

  const eligible =
    subject.score >= subject.target &&
    categoriesMeetFloor &&
    automaticFailsClear;
  if (subject.id === scoreDocument.completionSubject) {
    if ((subject.gateStatus === "complete") !== eligible) {
      fail(`${subject.id} gate status contradicts its score or failures`);
    }
  } else if (subject.gateStatus === "complete") {
    fail(`${subject.id} is not the completion subject`);
  }
  return eligible;
}

function validateDocument(
  scoreDocument,
  { verifyExternalBindings = true } = {},
) {
  exactKeys(
    scoreDocument,
    [
      "schemaVersion",
      "evaluatedAt",
      "target",
      "minimumCategoryRatio",
      "productionSubject",
      "decisionSubject",
      "completionSubject",
      "completionEligible",
      "categoryWeights",
      "automaticFailDefinitions",
      "history",
      "subjects",
    ],
    "product score",
  );
  if (
    scoreDocument.schemaVersion !== 2 ||
    scoreDocument.target !== 90 ||
    scoreDocument.minimumCategoryRatio !== 0.8
  ) {
    fail("product score version or thresholds differ");
  }
  exactDate(scoreDocument.evaluatedAt, "product score evaluatedAt");
  exactKeys(
    scoreDocument.categoryWeights,
    categoryWeights.keys(),
    "category weights",
  );
  let weightTotal = 0;
  for (const [id, weight] of categoryWeights) {
    if (scoreDocument.categoryWeights[id] !== weight) {
      fail(`${id} category weight differs`);
    }
    weightTotal += weight;
  }
  if (weightTotal !== 100) fail("category weights do not sum to 100");

  exactSet(
    uniqueIds(
      scoreDocument.automaticFailDefinitions,
      "automatic fail definitions",
    ),
    automaticFailIds,
    "automatic fail definitions",
  );
  for (const definition of scoreDocument.automaticFailDefinitions) {
    exactKeys(definition, ["id", "condition"], `${definition.id} definition`);
    boundedText(definition.condition, `${definition.id} condition`);
    if (definition.condition !== automaticFailDefinitions.get(definition.id)) {
      fail(`${definition.id} automatic fail definition differs`);
    }
  }
  if (
    !Array.isArray(scoreDocument.history) ||
    scoreDocument.history.length !== 1
  ) {
    fail("exactly one historical score snapshot is required");
  }
  validateHistoricalScore(scoreDocument.history[0]);

  exactSet(
    uniqueIds(scoreDocument.subjects, "score subjects"),
    subjectIds,
    "score subjects",
  );
  const eligibility = new Map(
    scoreDocument.subjects.map((subject) => [
      subject.id,
      validateSubject(subject, scoreDocument),
    ]),
  );
  for (const subject of scoreDocument.subjects) {
    const failStates = new Map(
      subject.automaticFailStates.map((state) => [state.id, state.status]),
    );
    if (
      failStates.get("unresolved_critical_high") !== "active" ||
      failStates.get("required_live_evidence_absent") !== "active"
    ) {
      fail(`${subject.id} mandatory unresolved gates are suppressed`);
    }
  }
  if (
    scoreDocument.productionSubject !== "production" ||
    scoreDocument.decisionSubject !== "candidate" ||
    scoreDocument.completionSubject !== "production" ||
    scoreDocument.completionEligible !== eligibility.get("production")
  ) {
    fail("score subject selection or completion decision differs");
  }

  if (verifyExternalBindings) {
    const byId = new Map(
      scoreDocument.subjects.map((subject) => [subject.id, subject]),
    );
    const marker = `<!-- product-score:v2 production=${byId.get("production").score} candidate=${byId.get("candidate").score} target=${scoreDocument.target} eligible=${scoreDocument.completionEligible} -->`;
    if (!scorecard.includes(marker)) fail("quality scorecard marker differs");
    if (
      tasks?.roadmap?.evaluation !== scorePath ||
      tasks?.roadmap?.completion_score !== scoreDocument.target ||
      tasks?.roadmap?.minimum_category_ratio !==
        scoreDocument.minimumCategoryRatio ||
      tasks?.roadmap?.deterministic_failures_override_score !== true
    ) {
      fail("task graph score authority differs");
    }
  }
}

validateDocument(document);

if (process.argv.includes("--self-test")) {
  const cases = [
    ["unknown root key", (value) => (value.extra = true)],
    [
      "wrong category weight",
      (value) => (value.categoryWeights.activation = 9),
    ],
    [
      "history digest drift",
      (value) => (value.history[0].sha256 = "1".repeat(64)),
    ],
    [
      "history path replacement",
      (value) => (value.history[0].path = "package.json"),
    ],
    [
      "automatic definition drift",
      (value) => (value.automaticFailDefinitions[0].condition += " today"),
    ],
    ["invalid calendar date", (value) => (value.evaluatedAt = "2026-02-30")],
    [
      "candidate completion subject",
      (value) => (value.completionSubject = "candidate"),
    ],
    ["duplicate subject", (value) => (value.subjects[1].id = "production")],
    [
      "candidate branch drift",
      (value) =>
        (value.subjects[1].branch = "codex/enterprise-roadmap-integration"),
    ],
    [
      "missing evidence path",
      (value) =>
        (value.subjects[1].categories[0].evidencePaths[0] = "docs/missing.md"),
    ],
    [
      "evidence path escape",
      (value) =>
        (value.subjects[1].categories[0].evidencePaths[0] = "../README.md"),
    ],
    ["candidate total drift", (value) => (value.subjects[1].score = 84)],
    [
      "category score overflow",
      (value) => (value.subjects[1].categories[0].score = 11),
    ],
    [
      "automatic fail omission",
      (value) => value.subjects[1].automaticFailStates.pop(),
    ],
    [
      "critical finding suppression",
      (value) =>
        (value.subjects[0].automaticFailStates.find(
          (state) => state.id === "unresolved_critical_high",
        ).status = "clear"),
    ],
    ["false completion", (value) => (value.completionEligible = true)],
    [
      "false complete status",
      (value) => (value.subjects[1].gateStatus = "complete"),
    ],
  ];
  for (const [name, mutate] of cases) {
    const candidate = structuredClone(document);
    mutate(candidate);
    let rejected = false;
    try {
      validateDocument(candidate, { verifyExternalBindings: false });
    } catch {
      rejected = true;
    }
    if (!rejected) fail(`self-test accepted ${name}`);
  }
  console.log(
    `Rejected ${cases.length} deterministic product-score corruptions.`,
  );
}

const production = document.subjects.find(
  (subject) => subject.id === "production",
);
const candidate = document.subjects.find(
  (subject) => subject.id === "candidate",
);
console.log(
  `Validated product score V2: production ${production.score}/100, candidate ${candidate.score}/100, target ${document.target}, completion eligible ${document.completionEligible}.`,
);
