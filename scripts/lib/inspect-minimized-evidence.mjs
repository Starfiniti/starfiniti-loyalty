export const maximumEvidenceTextLength = 4_096;
export const maximumEvidenceDepth = 64;

const forbiddenKey =
  /(password|passphrase|secret|private.?key|access.?token|refresh.?token|bearer|credential.?value|raw.?body|coupon.?code|email|customer.?id|order.?id|auth.?uuid|tenant.?id|wallet.?id|reservation.?id|case.?id|connection.?id|idempotency.?key)/i;
const forbiddenValue =
  /(-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/=-]{12,}|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b)/i;

export const inspectMinimizedEvidence = (
  value,
  {
    fail,
    path = "evidence",
    maxDepth = maximumEvidenceDepth,
    maxStringLength = maximumEvidenceTextLength,
  },
) => {
  if (typeof fail !== "function") {
    throw new TypeError("inspectMinimizedEvidence requires a fail callback");
  }

  const activeAncestors = new WeakSet();
  const stack = [{ depth: 0, kind: "enter", path, value }];

  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame.kind === "exit") {
      activeAncestors.delete(frame.value);
      continue;
    }

    if (typeof frame.value === "string") {
      if (frame.value.length > maxStringLength) {
        fail(`evidence text at ${frame.path} exceeds the bounded length`);
      }
      if (forbiddenValue.test(frame.value)) {
        fail(`forbidden sensitive value at ${frame.path}`);
      }
      continue;
    }

    if (!frame.value || typeof frame.value !== "object") continue;
    if (frame.depth >= maxDepth) {
      fail(`evidence nesting at ${frame.path} exceeds the bounded depth`);
    }
    if (activeAncestors.has(frame.value)) {
      fail(`cyclic evidence at ${frame.path}`);
    }

    activeAncestors.add(frame.value);
    stack.push({ ...frame, kind: "exit" });

    const entries = Array.isArray(frame.value)
      ? frame.value.map((nested, index) => [index, nested])
      : Object.entries(frame.value);
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const [key, nested] = entries[index];
      if (!Array.isArray(frame.value) && forbiddenKey.test(key)) {
        fail(`forbidden sensitive key ${frame.path}.${key}`);
      }
      stack.push({
        depth: frame.depth + 1,
        kind: "enter",
        path: Array.isArray(frame.value)
          ? `${frame.path}[${key}]`
          : `${frame.path}.${key}`,
        value: nested,
      });
    }
  }
};
