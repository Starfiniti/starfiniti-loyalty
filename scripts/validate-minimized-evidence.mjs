import assert from "node:assert/strict";

import {
  inspectMinimizedEvidence,
  maximumEvidenceDepth,
  maximumEvidenceTextLength,
} from "./lib/inspect-minimized-evidence.mjs";

const inspect = (value) =>
  inspectMinimizedEvidence(value, {
    fail: (message) => {
      throw new Error(message);
    },
  });

const rejectsWithDomainError = (value, pattern) => {
  assert.throws(
    () => inspect(value),
    (error) => {
      assert.equal(error instanceof RangeError, false);
      assert.match(error.message, pattern);
      return true;
    },
  );
};

const exactBoundary = "x".repeat(maximumEvidenceTextLength);
assert.doesNotThrow(() => inspect({ summary: exactBoundary }));
rejectsWithDomainError(
  { summary: `${exactBoundary}x` },
  /exceeds the bounded length/u,
);

const cyclic = {};
cyclic.child = cyclic;
rejectsWithDomainError(cyclic, /cyclic evidence/u);

let tooDeep = { summary: "bounded" };
for (let depth = 0; depth <= maximumEvidenceDepth; depth += 1) {
  tooDeep = { child: tooDeep };
}
rejectsWithDomainError(tooDeep, /exceeds the bounded depth/u);

const shared = { summary: "one intentionally shared evidence object" };
assert.doesNotThrow(() => inspect({ first: shared, second: shared }));

rejectsWithDomainError(
  { connectorSecretValue: "must not be accepted" },
  /forbidden sensitive key/u,
);
rejectsWithDomainError(
  { summary: "Bearer abcdefghijklmnop" },
  /forbidden sensitive value/u,
);

console.log("Minimized evidence inspection passed.");
