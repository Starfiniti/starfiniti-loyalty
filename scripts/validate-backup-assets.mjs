import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  new URL("starfiniti-loyalty-postgres-borg-maintain", assetRoot),
  new URL("starfiniti-postgres-basebackup", assetRoot),
];
const [
  pullFile,
  borgFile,
  maintenanceFile,
  basebackupFile,
  serviceFile,
  timerFile,
  maintenanceServiceFile,
  maintenanceTimerFile,
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
  readFile(
    new URL("starfiniti-loyalty-postgres-borg-maintain.service", systemdRoot),
    "utf8",
  ),
  readFile(
    new URL("starfiniti-loyalty-postgres-borg-maintain.timer", systemdRoot),
    "utf8",
  ),
  readFile(new URL("starfiniti-postgres-backup-rsync", sudoersRoot), "utf8"),
]);
const pull = pullFile.replaceAll("\r\n", "\n");
const borg = borgFile.replaceAll("\r\n", "\n");
const maintenance = maintenanceFile.replaceAll("\r\n", "\n");
const basebackup = basebackupFile.replaceAll("\r\n", "\n");
const service = serviceFile.replaceAll("\r\n", "\n");
const timer = timerFile.replaceAll("\r\n", "\n");
const maintenanceService = maintenanceServiceFile.replaceAll("\r\n", "\n");
const maintenanceTimer = maintenanceTimerFile.replaceAll("\r\n", "\n");
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
  ["maintenance", maintenance],
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
  /: "\$\{STARFINITI_POSTGRES_BORG_REPO:\?STARFINITI_POSTGRES_BORG_REPO is required\}"/u,
  "host backup must require an explicit PostgreSQL repository",
);
assert.match(
  borg,
  /\[\[ "\$STARFINITI_POSTGRES_BORG_REPO" != "\$whole_vm_borg_repo" \]\]/u,
  "host backup must reject reuse of the whole-VM repository",
);
assert.match(
  borg,
  /STARFINITI_WHOLE_VM_BORG_REPOSITORY_ID[\s\S]*STARFINITI_POSTGRES_BORG_REPOSITORY_ID[\s\S]*\^\[0-9a-f\]\{64\}\$[\s\S]*\^\[0-9a-f\]\{64\}\$[\s\S]*\[\[ "\$STARFINITI_POSTGRES_BORG_REPOSITORY_ID" != "\$STARFINITI_WHOLE_VM_BORG_REPOSITORY_ID" \]\]/u,
  "host backup must bind and distinguish both canonical repository IDs",
);
assert.match(
  borg,
  /BORG_REPO="\$STARFINITI_POSTGRES_BORG_REPO"\nexport BORG_REPO BORG_RSH BORG_PASSCOMMAND/u,
  "host backup must select the dedicated repository before invoking Borg",
);
assert.doesNotMatch(
  borg,
  /readonly lock_file=.*starfiniti-pve-borg\.lock/u,
  "PostgreSQL backup must never select the whole-VM repository lock",
);
assert.match(
  borg,
  /STARFINITI_POSTGRES_BORG_LOCK_FILE:-\/run\/lock\/starfiniti-loyalty-postgres-borg\.lock/u,
  "PostgreSQL backup must use its dedicated local repository lock",
);
assert.match(
  borg,
  /whole_vm_lock_file="\/run\/lock\/starfiniti-pve-borg\.lock"[\s\S]*\[\[ "\$lock_file" != "\$whole_vm_lock_file" \]\]/u,
  "host backup must reject a configured fallback to the whole-VM lock",
);
assert.match(
  borg,
  /STARFINITI_POSTGRES_BORG_LOCK_WAIT_SECONDS:-120/u,
  "host backup must use the reviewed bounded repository-lock wait",
);
assert.match(
  borg,
  /\[\[ "\$lock_wait_seconds" =~ \^\[1-9\]\[0-9\]\{0,2\}\$ \]\][\s\S]*\(\(lock_wait_seconds <= 120\)\)/u,
  "host backup must reject unbounded lock-wait overrides",
);
assert.match(
  borg,
  /flock \\\n  --exclusive \\\n  --timeout "\$lock_wait_seconds" \\\n  --conflict-exit-code 75 \\\n  9 \|\| \{[\s\S]*dedicated repository lock unavailable[\s\S]*incremental archive not created[\s\S]*exit "\$lock_status"/u,
  "repository-lock contention must wait boundedly and fail visibly without claiming an archive",
);
assert.doesNotMatch(
  borg,
  /flock -n 9|another backup holds the lock[\s\S]{0,160}exit 0/u,
  "repository-lock contention must never be recorded as a successful backup run",
);
assert.ok(
  borg.indexOf("rsync \\\n") < borg.indexOf('exec 9>"$lock_file"'),
  "staging must complete before the dedicated repository lock is acquired",
);
assert.match(
  borg,
  /borg create \\\n  --remote-path "\$BORG_REMOTE_PATH" \\\n  --lock-wait "\$lock_wait_seconds"/u,
  "Borg must independently bound remote repository lock waiting",
);
assert.match(
  borg,
  /borg info \\\n      --remote-path "\$BORG_REMOTE_PATH" \\\n      --json \\\n      --lock-wait "\$lock_wait_seconds"[\s\S]*jq -er '\.repository\.id \| select\(type == "string" and test\("\^\[0-9a-f\]\{64\}\$"\)\)'[\s\S]*\[\[ "\$actual_repository_id" == "\$STARFINITI_POSTGRES_BORG_REPOSITORY_ID" \]\]/u,
  "host backup must compare the actual remote Borg identity with approved configuration",
);
assert.match(
  service,
  /Environment=BORG_CACHE_DIR=\/var\/cache\/starfiniti-postgres-borg[\s\S]*Environment=BORG_SECURITY_DIR=\/var\/lib\/starfiniti-postgres-borg\/security[\s\S]*StateDirectory=starfiniti-postgres-borg starfiniti-postgres-backup-stage/u,
  "systemd must isolate PostgreSQL Borg state and its owner-only incremental stage",
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
  maintenance,
  /BORG_REPO="\$STARFINITI_POSTGRES_BORG_REPO"\nexport BORG_REPO BORG_RSH BORG_PASSCOMMAND/u,
  "maintenance must target only the dedicated PostgreSQL repository",
);
assert.match(
  maintenance,
  /STARFINITI_WHOLE_VM_BORG_REPOSITORY_ID[\s\S]*STARFINITI_POSTGRES_BORG_REPOSITORY_ID[\s\S]*\[\[ "\$STARFINITI_POSTGRES_BORG_REPOSITORY_ID" != "\$STARFINITI_WHOLE_VM_BORG_REPOSITORY_ID" \]\]/u,
  "maintenance must independently bind and distinguish canonical repository IDs",
);
assert.match(
  maintenance,
  /run_borg_bounded info[\s\S]*--json[\s\S]*jq -er '\.repository\.id \| select\(type == "string" and test\("\^\[0-9a-f\]\{64\}\$"\)\)'[\s\S]*\[\[ "\$actual_repository_id" == "\$STARFINITI_POSTGRES_BORG_REPOSITORY_ID" \]\]/u,
  "maintenance must verify the actual remote repository identity before pruning",
);
assert.doesNotMatch(
  maintenance,
  /readonly lock_file=.*starfiniti-pve-borg\.lock|flock -n 9/u,
  "maintenance must neither acquire the whole-VM lock nor silently skip contention",
);
assert.match(
  maintenance,
  /whole_vm_lock_file="\/run\/lock\/starfiniti-pve-borg\.lock"[\s\S]*\[\[ "\$lock_file" != "\$whole_vm_lock_file" \]\]/u,
  "maintenance must reject a configured fallback to the whole-VM lock",
);
assert.match(
  maintenance,
  /run_borg_bounded check \\\n  --remote-path "\$BORG_REMOTE_PATH" \\\n  --lock-wait "\$lock_wait_seconds" \\\n  --repository-only \\\n  --max-duration "\$check_max_duration_seconds" \\\n  --show-rc/u,
  "maintenance must run a bounded repository-structure slice before destructive retention",
);
assert.match(
  maintenance,
  /STARFINITI_POSTGRES_BORG_MAINTENANCE_LOCK_WAIT_SECONDS:-10[\s\S]*STARFINITI_POSTGRES_BORG_MAINTENANCE_COMMAND_TIMEOUT_SECONDS:-15[\s\S]*STARFINITI_POSTGRES_BORG_CHECK_MAX_DURATION_SECONDS:-8[\s\S]*timeout \\\n    --foreground \\\n    --signal=INT \\\n    --kill-after=10s \\\n    "\$\{command_timeout_seconds\}s" \\\n    borg "\$@"/u,
  "maintenance must bound local waiting, every remote operation, and partial checking",
);
assert.match(
  maintenance,
  /\(\(lock_wait_seconds <= 10\)\)[\s\S]*\(\(command_timeout_seconds <= 15\)\)[\s\S]*\(\(check_max_duration_seconds <= 8\)\)/u,
  "maintenance timeout overrides must retain their reviewed upper bounds",
);
assert.doesNotMatch(
  maintenance,
  /\n(?:borg info|borg check|borg prune|borg compact) /u,
  "maintenance must not bypass its bounded Borg command wrapper",
);
assert.match(
  maintenance,
  /--glob-archives 'loyalty-postgres-\*' \\\n  --keep-within 48h \\\n  --keep-daily 35 \\\n  --keep-monthly 12/u,
  "retention must preserve every recent archive before daily and monthly thinning",
);
assert.match(
  maintenance,
  /run_borg_bounded compact \\\n  --remote-path "\$BORG_REMOTE_PATH" \\\n  --lock-wait "\$lock_wait_seconds" \\\n  --show-rc/u,
  "Borg 1.2+ retention must compact pruned repository segments",
);
assert.match(
  maintenanceService,
  /Requires=starfiniti-loyalty-postgres-borg\.service[\s\S]*After=.*starfiniti-loyalty-postgres-borg\.service[\s\S]*Conflicts=starfiniti-loyalty-postgres-borg-prune\.service[\s\S]*ExecStart=\/usr\/local\/sbin\/starfiniti-loyalty-postgres-borg-maintain[\s\S]*CacheDirectory=starfiniti-postgres-borg[\s\S]*StateDirectory=starfiniti-postgres-borg[\s\S]*TimeoutStartSec=90s[\s\S]*TimeoutStopSec=10s[\s\S]*KillSignal=SIGINT/u,
  "maintenance must require a fresh archive, conflict with legacy pruning, share only dedicated PostgreSQL state, and retain a hard service deadline",
);
assert.match(
  maintenanceTimer,
  /Conflicts=starfiniti-loyalty-postgres-borg-prune\.timer[\s\S]*OnCalendar=\*-\*-\* 03:30:00 Europe\/Ljubljana[\s\S]*Persistent=true[\s\S]*Unit=starfiniti-loyalty-postgres-borg-maintain\.service/u,
  "dedicated retention must retire the legacy timer, run daily, and catch up after downtime",
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

if (process.platform !== "win32") {
  const testRoot = await mkdtemp(
    join(tmpdir(), "starfiniti-postgres-borg-validation-"),
  );
  const mockBin = join(testRoot, "bin");
  const configPath = join(testRoot, "backup.env");
  const incompleteConfigPath = join(testRoot, "incomplete.env");
  const aliasConfigPath = join(testRoot, "alias.env");
  const reusedIdConfigPath = join(testRoot, "reused-id.env");
  const stagePath = join(testRoot, "stage");
  const lockPath = join(testRoot, "postgres.lock");
  const tracePath = join(testRoot, "trace");
  const borgScriptPath = fileURLToPath(
    new URL("starfiniti-loyalty-postgres-borg", assetRoot),
  );
  const maintenanceScriptPath = fileURLToPath(
    new URL("starfiniti-loyalty-postgres-borg-maintain", assetRoot),
  );

  const writeExecutable = async (name, source) => {
    const path = join(mockBin, name);
    await writeFile(path, source, "utf8");
    await chmod(path, 0o700);
  };

  const formatProcessFailure = (result) =>
    result.error?.message ||
    result.stderr?.trim() ||
    result.stdout?.trim() ||
    "process exited with status " + String(result.status);

  try {
    await mkdir(mockBin, { recursive: true });
    await writeFile(
      configPath,
      [
        "BORG_REPO='ssh://backup.invalid/./whole-vm'",
        "STARFINITI_POSTGRES_BORG_REPO='ssh://backup.invalid/./loyalty-postgres'",
        "STARFINITI_WHOLE_VM_BORG_REPOSITORY_ID='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'",
        "STARFINITI_POSTGRES_BORG_REPOSITORY_ID='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'",
        "BORG_RSH='ssh -o BatchMode=yes'",
        "BORG_PASSCOMMAND='printf test-only'",
        "BORG_REMOTE_PATH='borg-1.4'",
        "BORG_COMPRESSION='zstd,3'",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      aliasConfigPath,
      [
        "BORG_REPO='ssh://backup.invalid/./whole-vm'",
        "STARFINITI_POSTGRES_BORG_REPO='ssh://backup.invalid/./whole-vm'",
        "STARFINITI_WHOLE_VM_BORG_REPOSITORY_ID='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'",
        "STARFINITI_POSTGRES_BORG_REPOSITORY_ID='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'",
        "BORG_RSH='ssh -o BatchMode=yes'",
        "BORG_PASSCOMMAND='printf test-only'",
        "BORG_REMOTE_PATH='borg-1.4'",
        "BORG_COMPRESSION='zstd,3'",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      reusedIdConfigPath,
      [
        "BORG_REPO='ssh://backup.invalid/./whole-vm'",
        "STARFINITI_POSTGRES_BORG_REPO='ssh://backup.invalid/./loyalty-postgres'",
        "STARFINITI_WHOLE_VM_BORG_REPOSITORY_ID='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'",
        "STARFINITI_POSTGRES_BORG_REPOSITORY_ID='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'",
        "BORG_RSH='ssh -o BatchMode=yes'",
        "BORG_PASSCOMMAND='printf test-only'",
        "BORG_REMOTE_PATH='borg-1.4'",
        "BORG_COMPRESSION='zstd,3'",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      incompleteConfigPath,
      [
        "BORG_REPO='ssh://backup.invalid/./whole-vm'",
        "BORG_RSH='ssh -o BatchMode=yes'",
        "BORG_PASSCOMMAND='printf test-only'",
        "BORG_REMOTE_PATH='borg-1.4'",
        "BORG_COMPRESSION='zstd,3'",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeExecutable(
      "rsync",
      [
        "#!/usr/bin/env bash",
        "set -Eeuo pipefail",
        'destination="${!#}"',
        'mkdir -p "$destination/base" "$destination/wal"',
        "printf 'rsync\\n' >>\"$STARFINITI_TEST_TRACE\"",
        "",
      ].join("\n"),
    );
    await writeExecutable(
      "borg",
      [
        "#!/usr/bin/env bash",
        "set -Eeuo pipefail",
        'if [[ "${1:-}" == "info" ]]; then',
        '  repository_id="${STARFINITI_TEST_ACTUAL_REPOSITORY_ID:-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb}"',
        '  printf \'{"repository":{"id":"%s"}}\\n\' "$repository_id"',
        "  exit 0",
        "fi",
        'printf \'borg|%s|%s\\n\' "$BORG_REPO" "$*" >>"$STARFINITI_TEST_TRACE"',
        'if [[ "${1:-}" == "prune" && -n "${STARFINITI_TEST_BORG_PRUNE_SLEEP_SECONDS:-}" ]]; then',
        '  exec sleep "$STARFINITI_TEST_BORG_PRUNE_SLEEP_SECONDS"',
        "fi",
        'if [[ "${1:-}" == "check" && -n "${STARFINITI_TEST_BORG_CHECK_STATUS:-}" ]]; then',
        '  exit "$STARFINITI_TEST_BORG_CHECK_STATUS"',
        "fi",
        "",
      ].join("\n"),
    );

    const runEnvironment = {
      ...process.env,
      PATH: mockBin + ":" + (process.env.PATH ?? ""),
      STARFINITI_POSTGRES_BORG_CONFIG: configPath,
      STARFINITI_POSTGRES_BORG_LOCK_FILE: lockPath,
      STARFINITI_POSTGRES_BORG_LOCK_WAIT_SECONDS: "1",
      STARFINITI_POSTGRES_BORG_MAINTENANCE_LOCK_WAIT_SECONDS: "1",
      STARFINITI_POSTGRES_BORG_MAINTENANCE_COMMAND_TIMEOUT_SECONDS: "2",
      STARFINITI_POSTGRES_BORG_CHECK_MAX_DURATION_SECONDS: "1",
      STARFINITI_POSTGRES_STAGE_ROOT: stagePath,
      STARFINITI_TEST_TRACE: tracePath,
    };

    await writeFile(tracePath, "", "utf8");
    const success = spawnSync("bash", [borgScriptPath], {
      encoding: "utf8",
      env: runEnvironment,
    });
    assert.equal(
      success.status,
      0,
      "dedicated repository backup fixture must pass: " +
        formatProcessFailure(success),
    );
    const successTrace = (await readFile(tracePath, "utf8")).trim().split("\n");
    assert.equal(
      successTrace.length,
      2,
      "successful backup must invoke exactly rsync then Borg",
    );
    assert.equal(successTrace[0], "rsync", "staging must run before Borg");
    assert.match(
      successTrace[1] ?? "",
      /^borg\|ssh:\/\/backup\.invalid\/\.\/loyalty-postgres\|create --remote-path borg-1\.4 --lock-wait 1 --compression zstd,3 --files-cache ctime,size,inode --one-file-system --show-rc --stats ssh:\/\/backup\.invalid\/\.\/loyalty-postgres::loyalty-postgres-[0-9]{8}T[0-9]{6}Z /u,
      "backup must write only to the dedicated repository",
    );

    await writeFile(tracePath, "", "utf8");
    const incomplete = spawnSync("bash", [borgScriptPath], {
      encoding: "utf8",
      env: {
        ...runEnvironment,
        STARFINITI_POSTGRES_BORG_CONFIG: incompleteConfigPath,
      },
    });
    assert.notEqual(
      incomplete.status,
      0,
      "missing dedicated repository configuration must fail closed",
    );
    assert.equal(
      await readFile(tracePath, "utf8"),
      "",
      "missing repository configuration must fail before rsync or Borg",
    );

    for (const [label, invalidConfigPath] of [
      ["repository URL reuse", aliasConfigPath],
      ["repository ID reuse", reusedIdConfigPath],
    ]) {
      await writeFile(tracePath, "", "utf8");
      const invalid = spawnSync("bash", [borgScriptPath], {
        encoding: "utf8",
        env: {
          ...runEnvironment,
          STARFINITI_POSTGRES_BORG_CONFIG: invalidConfigPath,
        },
      });
      assert.notEqual(invalid.status, 0, `${label} must fail closed`);
      assert.equal(
        await readFile(tracePath, "utf8"),
        "",
        `${label} must fail before rsync or Borg`,
      );
    }

    await writeFile(tracePath, "", "utf8");
    const reusedLock = spawnSync("bash", [borgScriptPath], {
      encoding: "utf8",
      env: {
        ...runEnvironment,
        STARFINITI_POSTGRES_BORG_LOCK_FILE:
          "/run/lock/starfiniti-pve-borg.lock",
      },
    });
    assert.notEqual(
      reusedLock.status,
      0,
      "whole-VM lock reuse must fail closed",
    );
    assert.equal(
      await readFile(tracePath, "utf8"),
      "",
      "whole-VM lock reuse must fail before rsync or Borg",
    );

    await writeFile(tracePath, "", "utf8");
    const identityMismatch = spawnSync("bash", [borgScriptPath], {
      encoding: "utf8",
      env: {
        ...runEnvironment,
        STARFINITI_TEST_ACTUAL_REPOSITORY_ID:
          "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      },
    });
    assert.notEqual(
      identityMismatch.status,
      0,
      "actual remote repository identity mismatch must fail closed",
    );
    assert.deepEqual(
      (await readFile(tracePath, "utf8")).trim().split("\n"),
      ["rsync"],
      "identity mismatch may refresh staging but must not create an archive",
    );

    await writeFile(tracePath, "", "utf8");
    const contention = spawnSync(
      "bash",
      [
        "-c",
        'exec 8>"$1"; flock --exclusive 8; shift; exec "$@"',
        "_",
        lockPath,
        "bash",
        borgScriptPath,
      ],
      { encoding: "utf8", env: runEnvironment },
    );
    assert.equal(
      contention.status,
      75,
      "dedicated lock contention must return the temporary-failure status",
    );
    assert.deepEqual(
      (await readFile(tracePath, "utf8")).trim().split("\n"),
      ["rsync"],
      "contention may refresh staging but must never invoke Borg",
    );

    await writeFile(tracePath, "", "utf8");
    const maintenanceSuccess = spawnSync("bash", [maintenanceScriptPath], {
      encoding: "utf8",
      env: runEnvironment,
    });
    assert.equal(
      maintenanceSuccess.status,
      0,
      "dedicated repository maintenance fixture must pass: " +
        formatProcessFailure(maintenanceSuccess),
    );
    const maintenanceTrace = (await readFile(tracePath, "utf8"))
      .trim()
      .split("\n");
    assert.equal(
      maintenanceTrace.length,
      3,
      "maintenance must run exactly check then prune then compact",
    );
    assert.match(
      maintenanceTrace[0] ?? "",
      /^borg\|ssh:\/\/backup\.invalid\/\.\/loyalty-postgres\|check .*--repository-only --max-duration 1 --show-rc/u,
      "maintenance must check only the dedicated repository",
    );
    assert.match(
      maintenanceTrace[1] ?? "",
      /^borg\|ssh:\/\/backup\.invalid\/\.\/loyalty-postgres\|prune .*--keep-within 48h --keep-daily 35 --keep-monthly 12/u,
      "maintenance must preserve the exact recent retention window",
    );
    assert.match(
      maintenanceTrace[2] ?? "",
      /^borg\|ssh:\/\/backup\.invalid\/\.\/loyalty-postgres\|compact /u,
      "maintenance must compact only the dedicated repository",
    );

    await writeFile(tracePath, "", "utf8");
    const failedCheck = spawnSync("bash", [maintenanceScriptPath], {
      encoding: "utf8",
      env: { ...runEnvironment, STARFINITI_TEST_BORG_CHECK_STATUS: "2" },
    });
    assert.equal(
      failedCheck.status,
      2,
      "repository-check failure must remain visible",
    );
    const failedCheckTrace = (await readFile(tracePath, "utf8"))
      .trim()
      .split("\n");
    assert.equal(
      failedCheckTrace.length,
      1,
      "failed repository check must stop before prune or compact",
    );
    assert.match(
      failedCheckTrace[0] ?? "",
      /\|check /u,
      "maintenance failure must be attributable to repository check",
    );

    await writeFile(tracePath, "", "utf8");
    const timedOutPrune = spawnSync("bash", [maintenanceScriptPath], {
      encoding: "utf8",
      env: {
        ...runEnvironment,
        STARFINITI_POSTGRES_BORG_MAINTENANCE_COMMAND_TIMEOUT_SECONDS: "1",
        STARFINITI_TEST_BORG_PRUNE_SLEEP_SECONDS: "2",
      },
    });
    assert.equal(
      timedOutPrune.status,
      124,
      "bounded prune timeout must remain visible",
    );
    const timedOutPruneTrace = (await readFile(tracePath, "utf8"))
      .trim()
      .split("\n");
    assert.equal(
      timedOutPruneTrace.length,
      2,
      "timed-out prune must stop before compact",
    );
    assert.match(
      timedOutPruneTrace[1] ?? "",
      /\|prune /u,
      "maintenance timeout must be attributable to prune",
    );

    await writeFile(tracePath, "", "utf8");
    const maintenanceContention = spawnSync(
      "bash",
      [
        "-c",
        'exec 8>"$1"; flock --exclusive 8; shift; exec "$@"',
        "_",
        lockPath,
        "bash",
        maintenanceScriptPath,
      ],
      { encoding: "utf8", env: runEnvironment },
    );
    assert.equal(
      maintenanceContention.status,
      75,
      "maintenance lock contention must return temporary failure",
    );
    assert.equal(
      await readFile(tracePath, "utf8"),
      "",
      "maintenance contention must not invoke Borg",
    );
  } finally {
    await rm(testRoot, { force: true, recursive: true });
  }
}

console.log(
  "Validated restricted incremental PostgreSQL backup, dedicated Borg identity/retention isolation, and retained-base WAL cleanup assets.",
);
