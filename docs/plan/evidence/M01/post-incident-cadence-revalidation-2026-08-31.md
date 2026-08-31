# M01 Post-Incident Archive Cadence Revalidation — 2026-08-31

Observed through the configured read-only production operator route at
`2026-08-31T17:01:38Z`. No secret value, personal data, source order
identifier, coupon code, signing reference, repository identifier, or raw
configuration was read or retained.

- The one-time whole-VM service was inactive and the PostgreSQL off-site timer
  was active and waiting. Its latest scheduled unit started at 18:59:47 CEST,
  exited zero at 18:59:54, and produced
  `loyalty-postgres-20260831T165948Z`; three real archives were present in the
  preceding ten minutes and no contention message was present.
- Six consecutive completed archives ran at 18:42:58, 18:46:18, 18:49:37,
  18:53:08, 18:56:28, and 18:59:48 CEST. Their maximum observed
  completed-archive interval was 211 seconds and the newest archive was 110
  seconds old at 19:01:38, so this bounded post-incident window met the
  300-second objective.
- The latest rsync cycle received 547,767 bytes and Borg added 4.71 kB of
  unique compressed data. A separate twenty-second `tap971i0` receive sample
  increased by 13,611 bytes, about 680 bytes/s; the latest one-hour PVE RRD had
  60 samples, a 3,260 bytes/s mean, and a 9,753 bytes/s maximum. The historical
  200–235 MB/s full-tree pattern remained absent.
- This observation proves automatic cadence recovery only. It does not repair
  the shared repository and lock, the unbounded production wait, missing
  archive-age metrics and paging, retention policy, or isolated restore
  evidence. R-004 and the M15 recovery and operations gates remain open.
- No production configuration, service, timer, archive, database, VM, network,
  route, checkout path, or loyalty value was changed by the inspection.
