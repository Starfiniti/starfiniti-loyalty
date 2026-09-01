import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

import {
  canaryEnvelopeSchemas,
  maximumCanaryEvidenceTextLength,
  validateCanaryManifestEnvelope,
} from "./lib/validate-canary-manifest-envelope.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tasks = YAML.parse(
  readFileSync(join(root, "docs/plan/TASKS.yaml"), "utf8"),
);
const manifests = [
  ["M04", "docs/plan/evidence/M04/canary.yaml"],
  ["M05", "docs/plan/evidence/M05/canary.yaml"],
  ["M06", "docs/plan/evidence/M06/canary.yaml"],
  ["M07", "docs/plan/evidence/M07/canary.yaml"],
  ["M08", "docs/plan/evidence/M08/canary.yaml"],
  ["M09", "docs/plan/evidence/M09/canary.yaml"],
  ["M10", "docs/plan/evidence/M10/canary.yaml"],
  ["M11", "docs/plan/evidence/M11/canary.yaml"],
  ["M12", "docs/plan/evidence/M12/canary.yaml"],
  ["M13", "docs/plan/evidence/M13/canary.yaml"],
  ["M14", "docs/plan/evidence/M14/canary.yaml"],
].map(([module, relativePath]) => ({
  module,
  relativePath,
  document: YAML.parse(readFileSync(join(root, relativePath), "utf8")),
}));

const fail = (message) => {
  throw new Error(`Canary envelope invalid: ${message}`);
};

const expectRejected = (document, taskGraph, messagePart, label) => {
  let rejected = false;
  try {
    validateCanaryManifestEnvelope(document, taskGraph, fail);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes(messagePart)) {
      throw error;
    }
    rejected = true;
  }
  if (!rejected) fail(`self-test accepted ${label}`);
};

if (manifests.length !== canaryEnvelopeSchemas.length) {
  fail("manifest inventory and schema catalogue counts differ");
}
const seenSchemas = new Set();
for (const { module, relativePath, document } of manifests) {
  const result = validateCanaryManifestEnvelope(document, tasks, fail);
  if (result.module !== module) {
    fail(`${relativePath} resolves to ${result.module} instead of ${module}`);
  }
  if (seenSchemas.has(document.schema)) {
    fail(`duplicate schema ${document.schema}`);
  }
  seenSchemas.add(document.schema);

  const mutations = [
    [
      (candidate) => {
        candidate.unreviewed = true;
      },
      "manifest keys differ",
      "an unreviewed manifest field",
    ],
    [
      (candidate) => {
        candidate.currentProduction.unreviewed = true;
      },
      "currentProduction keys differ",
      "an unreviewed production field",
    ],
    [
      (candidate) => {
        candidate.candidate.unreviewed = true;
      },
      "candidate keys differ",
      "an unreviewed candidate field",
    ],
    [
      (candidate) => {
        candidate.publicBaseline.unreviewed = true;
      },
      "publicBaseline keys differ",
      "an unreviewed public-baseline field",
    ],
    [
      (candidate) => {
        candidate.score.unreviewed = true;
      },
      "score keys differ",
      "an unreviewed score field",
    ],
    [
      (candidate) => {
        candidate.score.categories[0].unreviewed = true;
      },
      "score category keys differ",
      "an unreviewed score-category field",
    ],
    [
      (candidate) => {
        candidate.checks[0].unreviewed = true;
      },
      "check keys differ",
      "an unreviewed check field",
    ],
    [
      (candidate) => {
        candidate.artifacts[0].unreviewed = true;
      },
      "artifact keys differ",
      "an unreviewed artifact field",
    ],
    [
      (candidate) => {
        candidate.automaticFails[0].unreviewed = true;
      },
      "automatic failure keys differ",
      "an unreviewed automatic-failure field",
    ],
    [
      (candidate) => {
        candidate.schema = "starfiniti.unregistered-canary.v1";
      },
      "manifest schema is not registered",
      "an unregistered schema",
    ],
    [
      (candidate) => {
        candidate.observedAt = "9999-01-01T00:00:00Z";
      },
      "observedAt must not be in the future",
      "future-dated evidence",
    ],
    [
      (candidate) => {
        candidate.checks[0].evidence = "x".repeat(
          maximumCanaryEvidenceTextLength + 1,
        );
      },
      "exceeds the bounded length",
      "oversized evidence text",
    ],
  ];
  for (const [mutate, messagePart, label] of mutations) {
    const candidate = structuredClone(document);
    mutate(candidate);
    expectRejected(candidate, tasks, messagePart, `${module} ${label}`);
  }

  const cyclic = structuredClone(document);
  cyclic.self = cyclic;
  expectRejected(cyclic, tasks, "cyclic evidence", `${module} cyclic evidence`);
  expectRejected(
    document,
    {},
    "task graph is invalid",
    `${module} invalid task graph`,
  );
}

for (const schema of canaryEnvelopeSchemas) {
  if (!seenSchemas.has(schema)) fail(`unexercised schema ${schema}`);
}

console.log(
  `Validated exact bounded canary manifest envelopes for ${manifests.length} modules with ${manifests.length * 14} adversarial fixtures.`,
);
