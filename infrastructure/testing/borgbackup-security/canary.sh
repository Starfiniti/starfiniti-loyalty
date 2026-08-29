#!/bin/sh
set -eu

readonly current_borg=/usr/bin/borg
readonly candidate_borg=/opt/starfiniti/borg/1.4.5/borg-dir/borg.exe
readonly current_repo='ssh://canary@current-server/./repository-current'
readonly candidate_repo='ssh://canary@candidate-server/./repository-candidate'
readonly fake_ssh=/usr/local/bin/starfiniti-borg-fake-ssh

export BORG_RSH="$fake_ssh"
export BORG_PASSPHRASE='not-a-production-secret'
export BORG_UNKNOWN_UNENCRYPTED_REPO_ACCESS_IS_OK=yes
export BORG_RELOCATED_REPO_ACCESS_IS_OK=no
export BORG_BASE_DIR=/work/base
export BORG_CACHE_DIR=/work/cache
export BORG_CONFIG_DIR=/work/config
export BORG_KEYS_DIR=/work/keys
export BORG_SECURITY_DIR=/work/security
export HOME=/work/home
export LC_ALL=C
export TMPDIR=/tmp

test "$($current_borg --version)" = 'borg 1.4.0'
test "$($candidate_borg --version)" = 'borg.exe 1.4.5'
printf '%s  %s\n' 'babb2b42edd64283220d1f1ca57119d41d8f8b93e4af9c5606874b60dd43bc4d' "$current_borg" | sha256sum --check --strict
printf '%s  %s\n' 'e0a23534bf28aa90940f749bb25dbbeecd401e9bf1de1dd8872cedc45f98718d' "$candidate_borg" | sha256sum --check --strict
starfiniti-verify-borg-tree --tree /opt/starfiniti/borg/1.4.5/borg-dir 106 95 79942815 09fb420dce78c94814520628cf68ecdd77ab75d4fd9c794f8916874f2a767827

mkdir -m 0700 -p /work/base /work/cache /work/config /work/keys /work/security /work/home /work/source /work/extract-current /work/extract-candidate /work/extract-candidate-current
printf 'current-client\n' > /work/source/current.txt

"$current_borg" init --encryption=none --remote-path borg "$current_repo"
"$current_borg" create --remote-path borg "$current_repo::from-1.4.0" /work/source

"$candidate_borg" info --json --remote-path borg "$current_repo" >/work/info.json
"$candidate_borg" list --json --remote-path borg "$current_repo" >/work/list-current.json
"$candidate_borg" check --repository-only --max-duration 30 --remote-path borg "$current_repo"
cd /work/extract-candidate-current
"$candidate_borg" extract --remote-path borg "$current_repo::from-1.4.0"
cmp /work/source/current.txt /work/extract-candidate-current/work/source/current.txt
printf 'candidate-client\n' > /work/source/candidate.txt
"$candidate_borg" create --remote-path borg "$current_repo::from-1.4.5" /work/source
"$candidate_borg" prune --dry-run --keep-within 2d --glob-archives 'from-*' --remote-path borg "$current_repo"
"$candidate_borg" compact --remote-path borg "$current_repo"

cd /work/extract-current
"$current_borg" extract --remote-path borg "$current_repo::from-1.4.5"
cmp /work/source/current.txt /work/extract-current/work/source/current.txt
cmp /work/source/candidate.txt /work/extract-current/work/source/candidate.txt

"$candidate_borg" init --encryption=none --remote-path /opt/starfiniti/borg/1.4.5/borg-dir/borg.exe "$candidate_repo"
"$candidate_borg" create --remote-path /opt/starfiniti/borg/1.4.5/borg-dir/borg.exe "$candidate_repo::candidate-server-write" /work/source
"$current_borg" list --json --remote-path /opt/starfiniti/borg/1.4.5/borg-dir/borg.exe "$candidate_repo" >/work/list-candidate.json
cd /work/extract-candidate
"$current_borg" extract --remote-path /opt/starfiniti/borg/1.4.5/borg-dir/borg.exe "$candidate_repo::candidate-server-write"
cmp /work/source/current.txt /work/extract-candidate/work/source/current.txt
cmp /work/source/candidate.txt /work/extract-candidate/work/source/candidate.txt
"$current_borg" create --remote-path /opt/starfiniti/borg/1.4.5/borg-dir/borg.exe "$candidate_repo::rollback-client-write" /work/source
"$candidate_borg" list --json --remote-path /opt/starfiniti/borg/1.4.5/borg-dir/borg.exe "$candidate_repo" >/work/list-candidate-after-rollback.json

test "$(jq -r '.repository.id | type' /work/info.json)" = string
test "$(jq -r '.archives | length' /work/list-current.json)" -eq 1
test "$(jq -r '.archives | length' /work/list-candidate.json)" -eq 1
test "$(jq -r '.archives | length' /work/list-candidate-after-rollback.json)" -eq 2

payload_bytes=$(wc -c </work/source/current.txt)
payload_bytes=$((payload_bytes + $(wc -c </work/source/candidate.txt)))
test "$payload_bytes" -le 1048576
archive_count=4
file_count=2

printf '{"schema":"starfiniti.borgbackup-security-canary.v1","status":"passed","currentVersion":"1.4.0","candidateVersion":"1.4.5","candidateExecutableSha256":"e0a23534bf28aa90940f749bb25dbbeecd401e9bf1de1dd8872cedc45f98718d","candidateTreeManifestSha256":"09fb420dce78c94814520628cf68ecdd77ab75d4fd9c794f8916874f2a767827","rollbackPackageSha256":"51e1cbdee1fccb31e9c63b93fda81d5fffb14289dc31ba27984e04ebb0c85733","clientServerPairs":4,"archives":%s,"files":%s,"payloadBytes":%s,"networkMode":"none","productionMutation":false}\n' "$archive_count" "$file_count" "$payload_bytes"
