# PostgreSQL backup transfer amplification incident — 2026-08-14

## Outcome

The internal VM-to-host transfer loop was contained and replaced without stopping PostgreSQL, Supabase, local WAL archiving, or the daily verified base-backup timer. The corrected steady-state job transfers only newly completed immutable recovery files and keeps the Borg repository credential off the database VM.

## Detection and impact

- Proxmox VM 971 reported approximately 3.60 TB transmitted since boot. Its tap receive counter and `vmbr10` receive counter matched, while the physical uplink did not, proving the traffic stayed inside the Proxmox host.
- Bursts recurred roughly every five minutes. Each old Borg archive reported one 22.2–22.7 GB input file and ran for 94–114 seconds.
- VM disk-read telemetry reached approximately 2.28 TB. No evidence indicated PostgreSQL replication, another guest receiving the data, or external exfiltration.
- Database availability and checkout-facing services were unaffected, but the repeated full-tree reads and internal transfer were an unacceptable reliability risk.

## Root cause

The host service used `borg create --content-from-command` and obtained one tar stream from a forced SSH exporter. Borg reduced each completed stream to a few kilobytes of new chunks, but only after the entire logical backup set crossed the VM-to-host link. With one stdin object, Borg's file cache had no individual immutable files to skip. `OnUnitInactiveSec=3m` plus the 94–114 second job duration produced the observed roughly five-minute cycle.

## Containment and recovery validation

1. Disabled and stopped only `starfiniti-loyalty-postgres-borg.timer`; the in-flight service was terminated and its failed state reset.
2. Confirmed the VM tap counter increased only about 13 KB over 15 seconds after containment.
3. Confirmed all Supabase containers healthy, PostgreSQL ready, `archive_mode=on`, and `pg_stat_archiver` at 634 successes and zero failures.
4. Confirmed the daily physical-base timer remained enabled/active, 62 GB remained free on the database VM, and four completed bases plus the continuous WAL set remained present.
5. Opened the Borg repository and listed the last three completed archives, proving the interrupted process left no repository lock or corruption symptom.

## Corrective implementation and measurements

- Replaced the forced tar exporter with a read-only `rrsync` wrapper bound to the fixed backup root. An allowed directory listing succeeded; an attempted arbitrary `id` command failed with `SSH_ORIGINAL_COMMAND does not run rsync`.
- Seeded the owner-only Proxmox stage from the last valid encrypted archive (`loyalty-postgres-20260814T070347Z`) rather than retransmitting 22 GB from VM 971.
- First measured incremental cycle: 269,360,503 guest bytes, representing the WAL files created since the seed; 1,377 normal files archived; 28.96 MB new Borg data; exit code zero.
- Immediate warm-cache cycle: 16,871,892 guest bytes, three seconds end to end, 1.72 KB new Borg data; exit code zero.
- The immediate timer-triggered archive after re-enabling completed successfully and added 824 bytes of new Borg data. The next scheduled steady-state cycle transferred 50,602,257 guest bytes (three WAL segments plus overhead), completed Borg processing in 0.50 seconds, and added 3.56 KB of new Borg data.
- Both endpoints advertised zstd support. Enabling negotiated transport compression reduced a measured 50,331,648 bytes of newly completed WAL content to 45,178 bytes on the guest interface; the complete archive cycle still finished in three seconds.
- Extracted one completed base backup and one WAL segment from the new normal-file archive and compared both byte-for-byte with the staged source; both matched. The owner-only verification directory was removed afterward.

## Rollback and follow-up

Timestamped copies of the prior guest `authorized_keys` entry, host script, service, and timer remain on their respective machines. The timer can be disabled immediately without affecting PostgreSQL or local recovery files. Legacy tar-stream archives remain readable during retention; restore procedures must recognize both layouts. Capacity and transfer-size anomaly monitoring remain part of the unfinished M01 operational gate.

## Live follow-up — 2026-08-26

- Read-only inspection through the configured `s2-root` operator route confirmed VM 971 running with about 12.6 days uptime and a cumulative 3,603,568,607,883-byte outbound counter. That counter includes the Aug 14 incident and has not reset.
- The active timer still invokes the incremental `rrsync` stage. The old `--content-from-command` PostgreSQL script exists only as the timestamped pre-incremental rollback copy; no second active timer or cron job targets `10.10.10.71`.
- A live scheduled cycle transferred three new files: 50,108 bytes of file content, 308,904 bytes received by rsync, and about 383 KB added to the VM tap counter. It completed successfully in roughly four seconds.
- PVE RRD reported a maximum VM outbound rate of 102,968 bytes/s over both the last hour and last 24 hours. The last-hour disk-read maximum was zero and the 24-hour maximum was 1,843 bytes/s. The former 200–235 MB/s, 22 GB-per-cycle behavior is not active.
- No production mutation was required for the traffic path; the healthy recovery timer remained enabled.
- The same read-only sweep found the independently unrelated Realtime container stopped since an Aug 17 overlay-mount failure during the historical disk-full event. Starting the existing container required no image or configuration change; it returned healthy with PostgreSQL ready and every Supabase container running. Realtime was not the transfer source.

## Live follow-up — 2026-08-28

- A second read-only sweep refuted a renewed transfer incident. VM 971's 3.604 TB `netout` value spans 14.68 days of uptime; the latest 24-hour RRD estimate was about 190 MiB total, 2.3 KB/s average, and 104 KB/s maximum. A direct ten-second tap sample increased by only 1,013 bytes, and dashboard readiness returned 200.
- The active PostgreSQL script still uses incremental rsync staging and normal Borg files; the old tar-over-stdin implementation remains only a dated rollback file with no active timer reference.
- The sweep exposed a distinct recovery-evidence defect. The nightly whole-VM Borg controller held the shared repository lock from 01:31 CEST onward, while the PostgreSQL timer repeatedly logged contention and exited zero. The last actual PostgreSQL archive was created at 01:30:31 CEST, so later successful unit results did not represent new archives.
- ADR-0070 selects a bounded 120-second wait followed by visible temporary-failure status 75. The repository candidate and Linux Bash syntax gate are verified, but the production script, timer, lock, archives, and database remain unchanged pending an approved rollout and measured contention/success canary.
