#!/bin/sh
set -eu
umask 077

test "$(id -u)" -eq 0
. /etc/os-release
test "$ID" = debian
test "$VERSION_ID" = 13
test "$(dpkg --print-architecture)" = amd64
test -f /workspace/manifest.tsv
test ! -L /workspace/manifest.tsv
test ! -e /output/facts.tsv

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install --yes --no-install-recommends \
  ca-certificates curl debian-archive-keyring gnupg gpgv python3
test "$(dpkg-query -W -f='${db:Status-Status}\n' debian-archive-keyring)" = installed
test "$(dpkg-query -S /usr/share/keyrings/debian-archive-keyring.pgp)" = \
  'debian-archive-keyring: /usr/share/keyrings/debian-archive-keyring.pgp'
test "$(command -v gpgv)" = /usr/bin/gpgv
apt-get clean

exec python3 /workspace/verify.py
