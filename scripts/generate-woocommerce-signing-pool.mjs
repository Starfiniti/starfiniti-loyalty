import { randomBytes, randomUUID } from "node:crypto";
import {
  closeSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const countText = argument("--count");
const outputText = argument("--output");
const append = process.argv.includes("--append");
const count = Number(countText);
if (!Number.isInteger(count) || count < 1 || count > 1_000 || !outputText) {
  throw new Error(
    "Usage: npm run woocommerce:keys -- --count <1-1000> --output <json-file> [--append]",
  );
}

const outputPath = resolve(outputText);
let existing = {};
if (append) {
  const parsed = JSON.parse(readFileSync(outputPath, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("The existing signing-key pool is not a JSON object.");
  }
  for (const [reference, encoded] of Object.entries(parsed)) {
    if (
      !/^pool:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:v1$/u.test(
        reference,
      ) ||
      typeof encoded !== "string" ||
      !/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded) ||
      Buffer.from(encoded, "base64").byteLength < 32
    ) {
      throw new Error(
        "The existing signing-key pool contains an invalid entry.",
      );
    }
  }
  existing = parsed;
}
const additions = Object.fromEntries(
  Array.from({ length: count }, () => [
    `pool:${randomUUID()}:v1`,
    randomBytes(32).toString("base64"),
  ]),
);
const material = { ...existing, ...additions };
const writePath = append ? `${outputPath}.${randomUUID()}.tmp` : outputPath;
const descriptor = openSync(writePath, "wx", 0o600);
try {
  writeFileSync(descriptor, `${JSON.stringify(material, null, 2)}\n`, {
    encoding: "utf8",
  });
} finally {
  closeSync(descriptor);
}
if (append) {
  try {
    renameSync(writePath, outputPath);
  } catch (error) {
    unlinkSync(writePath);
    throw error;
  }
}

console.log(
  `${append ? "Added" : "Created"} ${count} WooCommerce signing-key slot(s) at ${outputPath}. The file was not printed and must remain outside Git with mode 0600.`,
);
