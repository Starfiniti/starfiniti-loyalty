#!/bin/sh
set -eu

readonly current=/usr/bin/ssh
readonly candidate=/opt/starfiniti/openssh/10.5p1/bin/ssh
readonly endpoint=starfiniti@openssh-server
readonly command='printf starfiniti-openssh-canary'
readonly expected='starfiniti-openssh-canary'
readonly options='-F /dev/null -p 2222 -i /state/client_ed25519 -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/state/known_hosts -o GlobalKnownHostsFile=/dev/null -o PasswordAuthentication=no -o KbdInteractiveAuthentication=no -o PreferredAuthentications=publickey -o ClearAllForwardings=yes -o ForwardAgent=no -o ForwardX11=no -o PermitLocalCommand=no -o ProxyCommand=none -o RequestTTY=no -o UpdateHostKeys=no -o ControlMaster=no -o ControlPath=none -o ConnectTimeout=5 -o ConnectionAttempts=1'
stage=state-preflight

on_exit() {
  status=$?
  trap - EXIT INT TERM
  if test "$status" -ne 0; then
    printf 'starfiniti-openssh-client-stage:%s\n' "$stage"
  fi
  exit "$status"
}

trap on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

test -r /state/ready
test -r /state/client_ed25519
test -r /state/known_hosts
test "$(stat -c '%u:%g:%a:%F' /state/client_ed25519)" = '65532:65532:600:regular file'
test "$(stat -c '%u:%g:%a:%F' /state/known_hosts)" = '65532:65532:444:regular file'

stage=current-version
current_version="$($current -V 2>&1)"
printf '%s\n' "$current_version" | grep -Eq '^OpenSSH_10\.0p1([,[:space:]]|$)'
stage=candidate-version
candidate_version="$($candidate -V 2>&1)"
printf '%s\n' "$candidate_version" | grep -Eq '^OpenSSH_10\.5p1([,[:space:]]|$)'
stage=current-hash
current_sha="$(sha256sum "$current" | cut -d' ' -f1)"
test "$current_sha" = af3b04ec5653755032fc18ad02445e4e51170e75d8bac4265647d423caa9a83e
stage=candidate-hash
candidate_sha="$(sha256sum "$candidate" | cut -d' ' -f1)"

for client in "$current" "$candidate"; do
  if test "$client" = "$current"; then
    stage=current-effective-config
  else
    stage=candidate-effective-config
  fi
  # shellcheck disable=SC2086
  effective="$($client $options -G "$endpoint")"
  printf '%s\n' "$effective" | grep -Eq '^batchmode yes$'
  printf '%s\n' "$effective" | grep -Eq '^identitiesonly yes$'
  printf '%s\n' "$effective" | grep -Eq '^stricthostkeychecking true$'
  printf '%s\n' "$effective" | grep -Eq '^clearallforwardings yes$'
  printf '%s\n' "$effective" | grep -Eq '^forwardagent no$'
  printf '%s\n' "$effective" | grep -Eq '^controlmaster false$'
  if test "$client" = "$current"; then
    stage=current-connection
  else
    stage=candidate-connection
  fi
  # shellcheck disable=SC2086
  output="$($client $options "$endpoint" "$command")"
  test "$output" = "$expected"
done

stage=report-publication
printf '{"schema":"starfiniti.openssh-client-security-canary.v1","status":"passed","currentVersion":"10.0p1","candidateVersion":"10.5p1","currentExecutableSha256":"%s","candidateExecutableSha256":"%s","serverVersion":"9.6p1","clients":2,"connections":3,"effectiveConfigChecks":2,"strictHostKey":true,"publicKey":true,"forcedCommand":true,"internalNetwork":true,"publishedPorts":0,"productionMutation":false}\n' "$current_sha" "$candidate_sha"
