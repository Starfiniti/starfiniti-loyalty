# OpenSSH recovery client security update

This runbook governs only the side-by-side recovery client selected by
ADR-0092. It never authorizes replacing or restarting `sshd`.

## Repository proof

Run:

```sh
npm run openssh-client-security:validate
npm run openssh-client-security:run -- \
  --out dist/openssh-client-security/ci.json
```

A bootstrap report discovers a candidate digest only. Change the plan to
`candidate`, bind that digest, and require a second exact-head report before any
later gate may use it.

## Operations escrow

Operations must copy the exact portable archive, detached signature, release
key, source manifest, build instructions and dependency inventory, candidate
binary, Debian rollback package, checksums, and this runbook to approved offline
escrow. A different person rechecks the official signing fingerprint, every
digest, executable ownership/mode, version, and dynamic libraries.

Use the shared closed private layout in
`infrastructure/governance/recovery-artifact-escrow-v1.yaml`; it also carries the
matching Borg recovery inputs so one dependency cannot be silently omitted.
From a clean exact commit, copy the policy to `escrow-policy.yaml` in the private
root and run:

```sh
npm run recovery-artifact-escrow:inventory -- --bundle /absolute/private/escrow
npm run recovery-artifact-escrow:verify -- \
  --bundle /absolute/private/escrow \
  --out /absolute/new/minimized-report.json
```

Keep `manifest.json` private. The minimized report proves only closed-set byte
inventory. It cannot prove the signing fingerprint, dynamic-library review,
physical offline copies, independent custody, or restoration. A local directory
or GitHub artifact is not approved escrow, and neither candidate may be selected
until the separate private and second-person reviews pass.

## Real-provider preflight

Inventory every `ssh`, `RSYNC_RSH`, `BORG_RSH`, systemd unit, timer, wrapper,
manual command, remote endpoint, known-hosts file, identity file, forced command,
timeout, retry, and monitor. For each consumer, prove a command using the exact
candidate path and digest with:

- `-F /dev/null`, `BatchMode=yes`, `IdentitiesOnly=yes`;
- strict pinned host keys and explicit known-host files;
- public-key-only authentication;
- agent, X11, local/remote/tunnel forwarding, proxy, multiplexing, TTY,
  password, keyboard-interactive, local-command, and host-key-update behavior
  disabled;
- the exact rsync or Borg forced-command behavior;
- bounded timeout, retry, bytes, files, logs, metrics, and cleanup.

Do not place private keys, endpoints, host keys, repository paths, or raw command
output in Git evidence.

## Activation

After escrow, real-provider proof, isolated restore, independent review, and an
approved maintenance window:

1. Pause only the selected consumer and record its last successful state.
2. Install the escrowed binary below the exact versioned root without changing
   `/usr/bin/ssh` or any daemon.
3. Recheck the candidate digest, canonical path, root ownership, non-writable
   mode, version, and dynamic libraries.
4. Change one reviewed consumer to the exact candidate command and flags.
5. Run its manual transfer/archive path, then one timer cycle.
6. Check transfer bounds, archive/ledger recovery evidence, alerts, logs, locks,
   and the absence of checkout or loyalty effects.
7. Observe for the approved interval before changing another consumer.

## Rollback

Pause the affected timer, restore the exact `/usr/bin/ssh` command and reviewed
flags, verify Debian's executable digest, repeat host-key and forced-command
checks, run one transfer/archive cycle, and confirm monitoring. Do not uninstall
the candidate during incident response, release an ambiguous lock, delete or
rewrite WAL/base/stage/archive data, change retention, or restart `sshd` unless a
separate incident procedure authorizes it.

## Automatic stop conditions

Stop and roll back on any digest, signature, fingerprint, version, owner/mode,
library, host-key, authentication, forced-command, forwarding, proxy,
multiplexing, timeout, retry, transfer, archive, lock, alert, restore, checkout,
or loyalty-value difference that is not already explained and approved.
