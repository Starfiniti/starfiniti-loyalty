#!/bin/sh
set -eu

readonly candidate=/opt/starfiniti/rsync/3.5.0/bin/rsync
readonly wrapper=/opt/starfiniti/rsync/3.5.0/bin/rrsync
readonly root=/state/recovery
readonly facts=/state/facts
readonly config=/tmp/starfiniti-rsyncd.conf
stage=preflight

on_exit() {
  status=$?
  trap - EXIT INT TERM
  if test "$status" -ne 0; then
    printf 'starfiniti-rsync-source-guest-stage:%s\n' "$stage"
  fi
  exit "$status"
}

trap on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

test -x "$candidate"
test -x "$wrapper"
test -r /usr/local/share/starfiniti-rsync-current-facts
stage=source
mkdir -p "$root" "$facts"
printf 'base-proof\n' >"$root/base"
printf 'wal-proof\n' >"$root/wal"
current_executable_sha="$(sha256sum /usr/bin/rsync | cut -d' ' -f1)"
current_wrapper_sha="$(sha256sum /usr/bin/rrsync | cut -d' ' -f1)"
candidate_executable_sha="$(sha256sum "$candidate" | cut -d' ' -f1)"
candidate_wrapper_sha="$(sha256sum "$wrapper" | cut -d' ' -f1)"
native_acl_version="$(dpkg-query --show --showformat='${Version}' libacl1)"
current_version="$(dpkg-query --show --showformat='${Version}' rsync)"
cat >"$facts/.starfiniti-facts" <<EOF
currentVersion=$current_version
currentExecutableSha256=$current_executable_sha
currentWrapperSha256=$current_wrapper_sha
candidateExecutableSha256=$candidate_executable_sha
candidateWrapperSha256=$candidate_wrapper_sha
nativeAclVersion=$native_acl_version
EOF
chmod 0444 "$root/base" "$root/wal" "$facts/.starfiniti-facts"

stage=config
cat >"$config" <<EOF
port = 2873
pid file = /tmp/starfiniti-rsyncd.pid
lock file = /tmp/starfiniti-rsyncd.lock
use chroot = no
max connections = 2
[recovery]
path = $root
read only = true
list = true
[facts]
path = $facts
read only = true
list = false
EOF
chmod 0444 "$config"
stage=daemon
exec "$candidate" --daemon --no-detach --config="$config"
