#!/bin/sh
set -eu

readonly state=/state
readonly config=/tmp/starfiniti-sshd-config

test -d "$state"
test ! -L "$state"
test -z "$(find "$state" -mindepth 1 -maxdepth 1 -print -quit)"
install -d -m 0755 /run/sshd
ssh-keygen -q -t ed25519 -N '' -f "$state/ssh_host_ed25519_key"
ssh-keygen -q -t ed25519 -N '' -f "$state/client_ed25519"
chown 65532:65532 "$state/client_ed25519" "$state/client_ed25519.pub"
chmod 0600 "$state/client_ed25519" "$state/ssh_host_ed25519_key"
chmod 0644 "$state/client_ed25519.pub" "$state/ssh_host_ed25519_key.pub"

printf 'command="/usr/local/bin/starfiniti-openssh-forced-command",restrict %s\n' "$(cat "$state/client_ed25519.pub")" >"$state/authorized_keys"
chown 65532:65532 "$state/authorized_keys"
chmod 0600 "$state/authorized_keys"
printf '[openssh-server]:2222 %s\n' "$(cat "$state/ssh_host_ed25519_key.pub")" >"$state/known_hosts"
chown 65532:65532 "$state/known_hosts"
chmod 0444 "$state/known_hosts"

cat >"$config" <<'EOF'
Port 2222
ListenAddress 0.0.0.0
HostKey /state/ssh_host_ed25519_key
AuthorizedKeysFile /state/authorized_keys
PidFile /tmp/starfiniti-sshd.pid
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
PermitRootLogin no
AllowUsers starfiniti
AllowTcpForwarding no
AllowAgentForwarding no
X11Forwarding no
PermitTunnel no
PermitTTY no
PermitUserEnvironment no
UsePAM no
StrictModes yes
LogLevel ERROR
Subsystem sftp internal-sftp
EOF
chmod 0444 "$config"
/usr/sbin/sshd -t -f "$config"
/usr/sbin/sshd -D -e -f "$config" &
sshd_pid=$!
trap 'kill "$sshd_pid" 2>/dev/null || true; wait "$sshd_pid" 2>/dev/null || true' INT TERM EXIT
expected_host_key="$(cut -d ' ' -f 1-2 "$state/ssh_host_ed25519_key.pub")"
ready=false
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  scanned_host_key="$(ssh-keyscan -T 1 -t ed25519 -p 2222 127.0.0.1 2>/dev/null | awk '$2 == "ssh-ed25519" { print $2 " " $3; exit }')"
  if test "$scanned_host_key" = "$expected_host_key"; then
    ready=true
    break
  fi
  kill -0 "$sshd_pid"
  sleep 0.1
done
test "$ready" = true
touch "$state/ready"
chmod 0444 "$state/ready"
wait "$sshd_pid"
status=$?
trap - INT TERM EXIT
exit "$status"
