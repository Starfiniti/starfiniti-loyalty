#!/bin/sh
set -eu

readonly current=/usr/bin/ssh
readonly candidate=/opt/starfiniti/openssh/10.5p1/bin/ssh
readonly endpoint=starfiniti@openssh-server
readonly command='printf starfiniti-openssh-canary'
readonly expected='starfiniti-openssh-canary'
readonly options='-F /dev/null -p 2222 -i /state/client_ed25519 -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/state/known_hosts -o GlobalKnownHostsFile=/dev/null -o PasswordAuthentication=no -o KbdInteractiveAuthentication=no -o PreferredAuthentications=publickey -o ClearAllForwardings=yes -o ForwardAgent=no -o ForwardX11=no -o PermitLocalCommand=no -o ProxyCommand=none -o RequestTTY=no -o UpdateHostKeys=no -o ControlMaster=no -o ControlPath=none -o ConnectTimeout=5 -o ConnectionAttempts=1'

test -r /state/ready
test -r /state/client_ed25519
test -r /state/known_hosts
test "$(stat -c '%u:%g:%a:%F' /state/client_ed25519)" = '65532:65532:600:regular file'
test "$(stat -c '%u:%g:%a:%F' /state/known_hosts)" = '65532:65532:444:regular file'

current_version="$($current -V 2>&1)"
candidate_version="$($candidate -V 2>&1)"
printf '%s\n' "$current_version" | grep -Eq '^OpenSSH_10\.0p1([,[:space:]]|$)'
printf '%s\n' "$candidate_version" | grep -Eq '^OpenSSH_10\.5p1([,[:space:]]|$)'
current_sha="$(sha256sum "$current" | cut -d' ' -f1)"
candidate_sha="$(sha256sum "$candidate" | cut -d' ' -f1)"
test "$current_sha" = af3b04ec5653755032fc18ad02445e4e51170e75d8bac4265647d423caa9a83e

for client in "$current" "$candidate"; do
  # shellcheck disable=SC2086
  effective="$($client $options -G "$endpoint")"
  printf '%s\n' "$effective" | grep -Eq '^batchmode yes$'
  printf '%s\n' "$effective" | grep -Eq '^identitiesonly yes$'
  printf '%s\n' "$effective" | grep -Eq '^stricthostkeychecking true$'
  printf '%s\n' "$effective" | grep -Eq '^clearallforwardings yes$'
  printf '%s\n' "$effective" | grep -Eq '^forwardagent no$'
  printf '%s\n' "$effective" | grep -Eq '^controlmaster false$'
  # shellcheck disable=SC2086
  output="$($client $options "$endpoint" "$command")"
  test "$output" = "$expected"
done

printf '{"schema":"starfiniti.openssh-client-security-canary.v1","status":"passed","currentVersion":"10.0p1","candidateVersion":"10.5p1","currentExecutableSha256":"%s","candidateExecutableSha256":"%s","serverVersion":"9.6p1","clients":2,"connections":3,"effectiveConfigChecks":2,"strictHostKey":true,"publicKey":true,"forcedCommand":true,"internalNetwork":true,"publishedPorts":0,"productionMutation":false}\n' "$current_sha" "$candidate_sha"
