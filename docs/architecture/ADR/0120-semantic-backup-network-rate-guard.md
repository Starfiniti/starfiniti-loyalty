# ADR-0120: Semantic backup-network rate guard

- Status: Accepted
- Date: 2026-09-01
- Scope: M15-S05 operations, IMP-009, and R-004

## Context

VM 971 retains a multi-terabyte cumulative transmit counter from the contained
August full-stream backup incident. Read-only follow-up proved that the current
path is quiet, the historical burst stayed on the internal guest-to-host path,
and the physical uplink did not carry a matching volume. The existing
`StarfinitiBackupTransferAmplification` alert is correct for an instrumented
incremental cycle, but a raw, obsolete, or otherwise uninstrumented stream can
bypass those cycle metrics.

Linux documents per-interface counters under
`/sys/class/net/<device>/statistics/`. Prometheus documents `rate()` as the
counter function suited to alerting and notes that it adjusts counter resets.
The Prometheus node_exporter project documents its textfile collector for
machine-bound metrics and atomic temporary-file replacement:

- https://docs.kernel.org/networking/statistics.html
- https://prometheus.io/docs/prometheus/latest/querying/functions/#rate
- https://github.com/prometheus/node_exporter#textfile-collector
- https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html#PrivateNetwork=

## Options considered

1. Enable node_exporter's general `netdev` collector. This is simple, but the
   exporter endpoint would expose every interface name and counter. It weakens
   the accepted bounded-label and minimal-host-authority profile.
2. Poll the Proxmox API/RRD endpoints. This preserves Proxmox semantics, but it
   adds a credential, a private API route, another parser, and target identity
   to a guard that only needs two monotonic host counters.
3. Publish only two operator-selected sysfs counters and one capture timestamp
   through the existing textfile collector. The private configuration maps the
   guest observation path and physical uplink to semantic metric names; no VM,
   interface, address, bridge, route, or path label is published.

## Decision

Use option 3. A capability-free oneshot service runs as the existing
`starfiniti-node-exporter` account every thirty seconds. Its
environment-owned configuration supplies exactly:

- one `/sys/class/net/.../statistics/rx_bytes` file representing guest egress
  on the approved host observation path;
- one distinct `/sys/class/net/.../statistics/tx_bytes` file representing the
  physical uplink egress comparison; and
- the bounded monitoring environment.

The collector accepts no arguments, commands, endpoints, credentials, VM IDs,
or arbitrary files. It validates both closed sysfs path forms, reads unsigned
decimal totals, and atomically replaces one `0644` textfile. The output has
only `environment` and the fixed `starfiniti-loyalty` service label.

The unit deliberately does not use `PrivateNetwork=yes`. systemd documents
that this creates a namespace containing only loopback and remounts `/sys` for
that namespace, which would hide the approved host interfaces from the
collector. Instead, `RestrictAddressFamilies=AF_UNIX` plus `IPAddressDeny=any`
deny IP socket use and IP traffic while preserving read-only host sysfs
visibility. The script contains no socket or network operation.

Cumulative totals are evidence, never rates. Prometheus computes the two-minute
counter rates. A high internal-stream alert requires guest egress above
104,857,600 bytes per second and more than four times physical-uplink egress
for one minute. That threshold is below the observed 200–235 MB/s incident
bursts but far above the validated quiet-day maximum. A separate absence/stale
alert rejects missing or older-than-90-second capture evidence.

The internal-stream alert says only that a high-rate guest-to-host flow is
suspected. It does not claim exfiltration, identify a process, prove a backup,
or authorize termination. OPS-008 requires process/unit attribution and
independent bridge/uplink/cycle evidence before containment.

The repository change adds no service installation, timer enablement, scrape,
receiver, credential, interface selection, production traffic, or backup
mutation; production activation remains false.

## Security and failure boundaries

- Broad interface collection and interface-derived labels remain prohibited.
- Missing counters, malformed values, a shared counter path, unwritable output,
  or a failed atomic replacement produces no healthy fresh capture.
- The service cannot create IP sockets or send IP traffic and has no Linux
  capability, writable host root, Docker socket, backup repository, database,
  or loyalty authority.
- The alert cannot close R-004, establish external transfer, re-enable the
  whole-VM timer, or replace archive-age, repository-isolation, retention, and
  restore evidence.

## Rollout and rollback

During an approved monitoring window, operations maps and independently checks
the two private sysfs paths, installs the exact collector and units, validates
one quiet capture, then uses synthetic counter fixtures or a disposable host to
exercise both stale and high-internal-stream alerts. Production data must not
be streamed to test the rule.

Rollback disables the exact timer and service, removes only their generated
textfile after confirming the missing-series alert, and retains prior alert and
incident evidence. It never changes VM state, interfaces, backup sources,
archives, PostgreSQL, checkout, or loyalty value.
