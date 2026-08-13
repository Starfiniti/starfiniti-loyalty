import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const assetRoot = new URL(
  "../infrastructure/environments/proxmox/scripts/",
  import.meta.url,
);
const [exporterFile, basebackupFile] = await Promise.all([
  readFile(new URL("starfiniti-postgres-backup-export", assetRoot), "utf8"),
  readFile(new URL("starfiniti-postgres-basebackup", assetRoot), "utf8"),
]);
const exporter = exporterFile.replaceAll("\r\n", "\n");
const basebackup = basebackupFile.replaceAll("\r\n", "\n");

for (const [label, source] of [
  ["exporter", exporter],
  ["basebackup", basebackup],
]) {
  assert.match(
    source,
    /^#!\/usr\/bin\/env bash\nset -Eeuo pipefail\n/u,
    `${label} must fail closed`,
  );
  assert.match(
    source,
    /STARFINITI_POSTGRES_BACKUP_ROOT/u,
    `${label} must share the reviewed root`,
  );
}

assert.match(
  exporter,
  /find base wal -xdev -type f/u,
  "export must snapshot only backup files",
);
assert.match(
  exporter,
  /! -name '\*\.partial'/u,
  "export must exclude incomplete bases",
);
assert.match(exporter, /-print0/u, "export filenames must be NUL-delimited");
assert.match(exporter, /sort -z/u, "export ordering must be deterministic");
assert.match(exporter, /--null/u, "tar must consume NUL-delimited names");
assert.match(
  exporter,
  /--no-recursion/u,
  "tar must not rewalk changing WAL directories",
);
assert.doesNotMatch(
  exporter,
  /-C .* -cf - \./u,
  "export must not recursively archive the live root",
);

assert.match(
  basebackup,
  /\.tar\.gz\.partial/u,
  "base backup must stage partial output",
);
assert.match(basebackup, /gzip -t/u, "base backup must verify compression");
assert.match(
  basebackup,
  /tar -tzf .*backup_label backup_manifest/u,
  "base backup must verify recovery metadata",
);
assert.match(
  basebackup,
  /oldest_base=/u,
  "WAL cleanup must derive the oldest retained base",
);
assert.match(
  basebackup,
  /\^\[0-9A-F\]\{24\}\$/u,
  "WAL boundary extraction must be exact",
);
assert.match(
  basebackup,
  /pg_archivecleanup/u,
  "retained WAL must be pruned with PostgreSQL tooling",
);

console.log(
  "Validated snapshot-safe PostgreSQL export and retained-base WAL cleanup assets.",
);
