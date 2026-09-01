import { scryptSync } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
} from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CONTEXT = "starfiniti/klaviyo/credential-fingerprint/v2";
const SCRYPT = Object.freeze({
  N: 1 << 15,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
});

function fail(message) {
  throw new Error(`Klaviyo fingerprint failed: ${message}`);
}

export function fingerprintKlaviyoCredential(apiKey, connectionId) {
  if (!UUID.test(connectionId) || !/^[^\s\r\n]{8,500}$/u.test(apiKey)) {
    fail("invalid input");
  }
  const salt = `${CONTEXT}\0${connectionId.toLowerCase()}`;
  return scryptSync(apiKey, salt, 32, SCRYPT).toString("hex");
}

function readOwnerOnlyKey(path) {
  if (!isAbsolute(path) || path.includes("\0")) fail("invalid key path");
  let descriptor;
  try {
    descriptor = openSync(
      path,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
  } catch {
    fail("key file unavailable");
  }
  try {
    const before = fstatSync(descriptor);
    if (
      !before.isFile() ||
      before.size < 8 ||
      before.size > 502 ||
      (process.platform !== "win32" && (before.mode & 0o077) !== 0)
    ) {
      fail("key file is not a bounded owner-only regular file");
    }
    const raw = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    let link;
    try {
      link = lstatSync(path);
    } catch {
      fail("key file changed while reading");
    }
    if (
      raw.length !== before.size ||
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.size !== before.size ||
      after.mode !== before.mode ||
      after.uid !== before.uid ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs ||
      link.isSymbolicLink() ||
      !link.isFile() ||
      link.dev !== before.dev ||
      link.ino !== before.ino ||
      link.size !== before.size ||
      link.mode !== before.mode ||
      link.uid !== before.uid
    ) {
      fail("key file changed while reading");
    }
    let value;
    try {
      value = new TextDecoder("utf-8", { fatal: true }).decode(raw);
    } catch {
      fail("key file is not UTF-8");
    }
    return value.replace(/(?:\r\n|\n)$/u, "");
  } finally {
    closeSync(descriptor);
  }
}

function parseArguments(argv) {
  if (argv.length !== 4) fail("expected --connection-id and --key-file");
  const options = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (
      !["--connection-id", "--key-file"].includes(name) ||
      typeof value !== "string" ||
      options.has(name)
    ) {
      fail("invalid arguments");
    }
    options.set(name, value);
  }
  return {
    connectionId: options.get("--connection-id"),
    keyFile: options.get("--key-file"),
  };
}

function selfTest() {
  const fingerprint = fingerprintKlaviyoCredential(
    "pk_test_private_value",
    "93000000-0000-4000-8000-000000000010",
  );
  if (
    fingerprint !==
    "1507304bee39ac083a95ded831e524fcb52aad114022ab1ca96e6dbcf08d9e59"
  ) {
    fail("cryptographic vector drifted");
  }
  try {
    fingerprintKlaviyoCredential("short", "invalid");
    fail("invalid input was accepted");
  } catch (error) {
    if (!String(error?.message).includes("invalid input")) throw error;
  }
  console.log("Validated the V2 tenant-bound Klaviyo credential fingerprint.");
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  if (process.argv.includes("--self-test")) {
    selfTest();
  } else {
    try {
      const { connectionId, keyFile } = parseArguments(process.argv.slice(2));
      console.log(
        fingerprintKlaviyoCredential(readOwnerOnlyKey(keyFile), connectionId),
      );
    } catch (error) {
      console.error(
        error instanceof Error
          ? error.message
          : "Klaviyo fingerprint failed: unknown error",
      );
      process.exitCode = 1;
    }
  }
}
