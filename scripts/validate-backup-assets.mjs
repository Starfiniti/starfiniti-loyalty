import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const assetRoot = new URL(
  "../infrastructure/environments/proxmox/scripts/",
  import.meta.url,
);
const systemdRoot = new URL(
  "../infrastructure/environments/proxmox/systemd/",
  import.meta.url,
);
const sudoersRoot = new URL(
  "../infrastructure/environments/proxmox/sudoers/",
  import.meta.url,
);
const backupScriptUrls = [
  new URL("starfiniti-postgres-backup-rsync", assetRoot),
  new URL("starfiniti-loyalty-postgres-borg", assetRoot),
  new URL("starfiniti-postgres-basebackup", assetRoot),
];
const [
  pullFile,
  borgFile,
  basebackupFile,
  serviceFile,
  timerFile,
  sudoersFile,
] = await Promise.all([
  ...backupScriptUrls.map((url) => readFile(url, "utf8")),
  readFile(
    new URL("starfiniti-loyalty-postgres-borg.service", systemdRoot),
    "utf8",
  ),
  readFile(
    new URL("starfiniti-loyalty-postgres-borg.timer", systemdRoot),
    "utf8",
  ),
  readFile(new URL("starfiniti-postgres-backup-rsync", sudoersRoot), "utf8"),
]);
const pull = pullFile.replaceAll("\r\n", "\n");
const borg = borgFile.replaceAll("\r\n", "\n");
const basebackup = basebackupFile.replaceAll("\r\n", "\n");
const service = serviceFile.replaceAll("\r\n", "\n");
const timer = timerFile.replaceAll("\r\n", "\n");
const sudoers = sudoersFile.replaceAll("\r\n", "\n");

if (process.platform !== "win32") {
  const syntax = spawnSync(
    "bash",
    ["-n", ...backupScriptUrls.map((url) => fileURLToPath(url))],
    { encoding: "utf8" },
  );
  const syntaxDiagnostic =
    syntax.error?.message ||
    syntax.stderr?.trim() ||
    "bash exited without diagnostics";
  assert.equal(
    syntax.status,
    0,
    `backup scripts must parse as Bash: ${syntaxDiagnostic}`,
  );
}

for (const [label, source] of [
  ["pull", pull],
  ["borg", borg],
  ["basebackup", basebackup],
]) {
  assert.match(
    source,
    /^#!\/usr\/bin\/env bash\nset -Eeuo pipefail\n/u,
    `${label} must fail closed`,
  );
}

assert.match(
  pull,
  /SSH_ORIGINAL_COMMAND/u,
  "pull identity must require the rsync server command",
);
assert.match(
  pull,
  /exec \/usr\/bin\/rrsync -ro/u,
  "pull identity must expose only a read-only restricted rsync root",
);
assert.match(
  pull,
  /readonly backup_root="\/opt\/starfiniti\/supabase-prod\/backups"/u,
  "pull identity must use the reviewed backup root",
);
assert.doesNotMatch(
  pull,
  /eval|bash -c|sh -c/u,
  "pull wrapper must not evaluate the caller command",
);
assert.equal(
  sudoers,
  "vault-admin ALL=(root) NOPASSWD: /usr/local/sbin/starfiniti-postgres-backup-rsync *\n",
  "sudoers must grant only the reviewed restricted wrapper",
);

assert.match(borg, /rsync \\\n/u, "host backup must pull individual files");
assert.match(
  borg,
  /--exclude='\*\.partial'/u,
  "host backup must exclude incomplete bases",
);
assert.match(
  borg,
  /--ignore-existing/u,
  "host backup must not rewrite immutable staged files",
);
assert.match(
  borg,
  /--chmod=D700,F600[\s\S]*--chown=root:root/u,
  "host backup stage must remain owner-only regardless of source numeric owners",
);
assert.match(
  borg,
  /--compress-choice=zstd[\s\S]*--compress-level=3/u,
  "incremental WAL transport must use the negotiated compression supported by both hosts",
);
assert.match(
  borg,
  /--stats/u,
  "host backup must expose per-run transfer measurements",
);
assert.match(
  borg,
  /--files-cache ctime,size,inode/u,
  "Borg must cache unchanged staged files",
);
assert.doesNotMatch(
  borg,
  /--content-from-command|--files-cache disabled|loyalty-postgres-backups\.tar/u,
  "host backup must not stream the complete set as one uncached file",
);
assert.match(
  borg,
  /readonly lock_wait_seconds=120/u,
  "host backup must use the reviewed bounded repository-lock wait",
);
assert.match(
  borg,
  /flock \\\n  --exclusive \\\n  --timeout "\$lock_wait_seconds" \\\n  --conflict-exit-code 75 \\\n  9 \|\| \{[\s\S]*incremental archive not created[\s\S]*exit "\$lock_status"/u,
  "repository-lock contention must wait boundedly and fail visibly without claiming an archive",
);
assert.doesNotMatch(
  borg,
  /flock -n 9|another backup holds the lock[\s\S]{0,160}exit 0/u,
  "repository-lock contention must never be recorded as a successful backup run",
);
assert.match(
  service,
  /StateDirectory=starfiniti-borg starfiniti-postgres-backup-stage/u,
  "systemd must provision the owner-only incremental stage",
);
assert.match(
  service,
  /CacheDirectoryMode=0700[\s\S]*StateDirectoryMode=0700/u,
  "systemd-managed Borg and staging directories must remain owner-only",
);
assert.match(
  timer,
  /OnUnitInactiveSec=3m/u,
  "incremental archive cadence must retain the five-minute RPO target",
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
  "Validated restricted incremental PostgreSQL backup and retained-base WAL cleanup assets.",
);
