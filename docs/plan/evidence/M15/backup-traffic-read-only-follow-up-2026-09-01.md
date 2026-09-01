# M15 Backup Traffic Read-Only Follow-up — 2026-09-01

Observed through the configured read-only production operator route from
`2026-09-01T12:32:47Z` through `2026-09-01T12:34:23Z`. No secret, personal
data, repository identifier, source order identifier, coupon code, signing
reference, raw configuration, or private route was read or retained.

## Current traffic

- VM 971 was running. Its tap receive counter increased by 1,013 bytes during
  a ten-second quiet sample, approximately 101 bytes/s.
- The complete latest-day Proxmox RRD contained 1,440 one-minute samples. It
  estimated 287,384,753 outbound bytes in total, with a 3,326 bytes/s mean and
  a 107,013 bytes/s maximum. That is approximately 274 MiB for the day, not a
  multi-terabyte transfer.
- The latest-month maximum was 249,641,465 bytes/s at
  `2026-08-14T03:00:00Z`. This independently places the 200–235 MB/s pattern in
  the already-contained 14 August incident rather than the current window.
- The current cumulative tap counter remained approximately 3.605 TB because
  it spans VM uptime and includes the historical incident. A cumulative
  counter is not a transfer rate.

## Backup and application state

- `starfiniti-pve-borg-backup.timer` remained disabled and inactive. Its
  service retained the failed state from the contained 01 September shared-lock
  attempt; it was not restarted or reset by this observation.
- `starfiniti-loyalty-postgres-borg.timer` remained enabled and active. Five
  consecutive archive runs named for 12:20:28, 12:23:48, 12:26:58, 12:30:28,
  and 12:33:58 UTC all completed successfully. The largest interval between
  those archive-name timestamps was 210 seconds, below the current 300-second
  objective.
- The final observed cycle transferred 50,923 changed-content bytes, received
  580,947 rsync bytes, created
  `loyalty-postgres-20260901T123358Z`, and exited successfully. The preceding
  cycles were similarly kilobyte-scale rather than full-cluster transfers.
- Public dashboard readiness at `/api/healthz` and the login page both returned
  HTTP 200.

## Decision boundary

The full-stream amplification remains contained and was not active during this
observation. This evidence does not close R-004: the PostgreSQL and whole-VM
jobs still lack the approved dedicated-repository design, live archive-age and
transfer paging, retention proof, private recovery custody, and isolated
full-service restore. The whole-VM timer must remain disabled until the gate in
the accepted containment record is satisfied or an approved supervised
recovery window explicitly accepts the shared-lock RPO exposure.

This follow-up was read-only. No backup configuration, service, timer, archive,
VM, database, application, route, checkout path, or loyalty value was changed.
