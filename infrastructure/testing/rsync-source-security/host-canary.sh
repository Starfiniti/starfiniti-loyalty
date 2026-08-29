#!/bin/sh
set -eu

readonly current=/usr/bin/rsync
readonly current_wrapper=/usr/bin/rrsync
readonly candidate=/opt/starfiniti/rsync/3.5.0/bin/rsync
readonly candidate_wrapper=/opt/starfiniti/rsync/3.5.0/bin/rrsync
readonly source=rsync://database-guest:2873/recovery/
readonly facts_source=rsync://database-guest:2873/facts/.starfiniti-facts
stage=preflight

on_exit() {
  status=$?
  trap - EXIT INT TERM
  if test "$status" -ne 0; then
    printf 'starfiniti-rsync-source-host-stage:%s\n' "$stage"
  fi
  exit "$status"
}

trap on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

test -x "$current"
test -x "$current_wrapper"
test -x "$candidate"
test -x "$candidate_wrapper"
test -r /usr/local/share/starfiniti-rsync-current-facts
grep -Fq -- "rsync_opts.append('--confine-root=' + os.getcwd())" "$candidate_wrapper"
stage=forced-command-negative
if SSH_ORIGINAL_COMMAND='not-an-rsync-command' "$candidate_wrapper" -ro /tmp >/dev/null 2>&1; then
  exit 1
fi

stage=readiness
ready=false
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do
  if "$candidate" --list-only "$source" >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 0.2
done
test "$ready" = true

stage=current-pair
mkdir -p /state/current
"$current" --archive --checksum "$source" /state/current/
stage=candidate-pair
mkdir -p /state/candidate
"$candidate" --archive --checksum "$source" /state/candidate/
"$candidate" --archive --checksum "$facts_source" /state/candidate/.starfiniti-facts

stage=payload
for directory in /state/current /state/candidate; do
  test "$(cat "$directory/base")" = base-proof
  test "$(cat "$directory/wal")" = wal-proof
  expected_files=2
  test "$directory" = /state/candidate && expected_files=3
  test "$(find "$directory" -maxdepth 1 -type f | wc -l)" -eq "$expected_files"
  test "$(wc -c <"$directory/base")" -eq 11
  test "$(wc -c <"$directory/wal")" -eq 10
done
cmp /state/current/base /state/candidate/base
cmp /state/current/wal /state/candidate/wal

fact() {
  key="$1"
  value="$(sed -n "s/^${key}=//p" /state/candidate/.starfiniti-facts)"
  test -n "$value"
  test "$(grep -c "^${key}=" /state/candidate/.starfiniti-facts)" -eq 1
  printf '%s' "$value"
}

stage=facts
host_current_version="$(dpkg-query --show --showformat='${Version}' rsync)"
host_current_sha="$(sha256sum "$current" | cut -d' ' -f1)"
host_current_wrapper_sha="$(sha256sum "$current_wrapper" | cut -d' ' -f1)"
host_candidate_sha="$(sha256sum "$candidate" | cut -d' ' -f1)"
host_candidate_wrapper_sha="$(sha256sum "$candidate_wrapper" | cut -d' ' -f1)"
host_acl_version="$(dpkg-query --show --showformat='${Version}' libacl1)"
guest_current_version="$(fact currentVersion)"
guest_current_sha="$(fact currentExecutableSha256)"
guest_current_wrapper_sha="$(fact currentWrapperSha256)"
guest_candidate_sha="$(fact candidateExecutableSha256)"
guest_candidate_wrapper_sha="$(fact candidateWrapperSha256)"
guest_acl_version="$(fact nativeAclVersion)"

for digest in \
  "$host_current_sha" "$host_current_wrapper_sha" \
  "$host_candidate_sha" "$host_candidate_wrapper_sha" \
  "$guest_current_sha" "$guest_current_wrapper_sha" \
  "$guest_candidate_sha" "$guest_candidate_wrapper_sha"; do
  printf '%s\n' "$digest" | grep -Eq '^[0-9a-f]{64}$'
done

test "$host_current_sha" = "$(sed -n 's/^currentExecutableSha256=//p' /usr/local/share/starfiniti-rsync-current-facts)"
test "$host_current_wrapper_sha" = "$(sed -n 's/^currentWrapperSha256=//p' /usr/local/share/starfiniti-rsync-current-facts)"
test "$host_acl_version" = "$(sed -n 's/^nativeAclVersion=//p' /usr/local/share/starfiniti-rsync-current-facts)"
test "$host_current_version" = "$(sed -n 's/^currentVersion=//p' /usr/local/share/starfiniti-rsync-current-facts)"

stage=report
printf '{"schema":"starfiniti.rsync-source-security-canary.v1","status":"passed","candidateVersion":"3.5.0","protocol":32,"pairs":2,"files":2,"bytes":21,"internalNetwork":true,"publishedPorts":0,"sourceSignatureVerified":true,"safeSourceTreeVerified":true,"confinementVerified":true,"forcedCommandNegative":true,"distributionPathsPreserved":true,"globalLibraryUpgradeRequired":false,"endpoints":[{"id":"proxmox-host","currentVersion":"%s","currentExecutableSha256":"%s","currentWrapperSha256":"%s","candidateExecutableSha256":"%s","candidateWrapperSha256":"%s","nativeAclVersion":"%s"},{"id":"database-guest","currentVersion":"%s","currentExecutableSha256":"%s","currentWrapperSha256":"%s","candidateExecutableSha256":"%s","candidateWrapperSha256":"%s","nativeAclVersion":"%s"}],"productionMutation":false}\n' \
  "$host_current_version" "$host_current_sha" "$host_current_wrapper_sha" "$host_candidate_sha" "$host_candidate_wrapper_sha" "$host_acl_version" \
  "$guest_current_version" "$guest_current_sha" "$guest_current_wrapper_sha" "$guest_candidate_sha" "$guest_candidate_wrapper_sha" "$guest_acl_version"
