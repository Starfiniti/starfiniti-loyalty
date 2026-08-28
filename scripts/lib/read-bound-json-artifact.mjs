import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
} from "node:fs";

const digestPattern = /^[0-9a-f]{64}$/u;

export function readBoundJsonArtifact(
  relativePath,
  expectedDigest,
  artifactId,
  { fail, resolvePath, maximumBytes = 256 * 1024 },
) {
  if (typeof fail !== "function" || typeof resolvePath !== "function") {
    throw new TypeError(
      "readBoundJsonArtifact requires failure and path-resolution callbacks",
    );
  }
  if (!digestPattern.test(expectedDigest) || /^0{64}$/u.test(expectedDigest)) {
    fail(`${artifactId} artifact digest must be exact and nonzero`);
  }
  const absolute = resolvePath(relativePath, artifactId);
  let descriptor;
  let raw;
  try {
    descriptor = openSync(
      absolute,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    const opened = fstatSync(descriptor);
    const linked = lstatSync(absolute);
    if (
      !opened.isFile() ||
      !linked.isFile() ||
      opened.dev !== linked.dev ||
      opened.ino !== linked.ino ||
      opened.size < 2 ||
      opened.size > maximumBytes
    ) {
      fail(`${artifactId} artifact is not one stable bounded regular file`);
    }
    raw = Buffer.alloc(opened.size);
    let offset = 0;
    while (offset < raw.length) {
      const count = readSync(
        descriptor,
        raw,
        offset,
        raw.length - offset,
        offset,
      );
      if (count === 0) fail(`${artifactId} artifact changed while reading`);
      offset += count;
    }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  const actualDigest = createHash("sha256").update(raw).digest("hex");
  if (actualDigest !== expectedDigest) {
    fail(`${artifactId} artifact digest differs`);
  }
  try {
    return JSON.parse(raw.toString("utf8"));
  } catch {
    fail(`${artifactId} artifact must be valid JSON`);
  }
}
