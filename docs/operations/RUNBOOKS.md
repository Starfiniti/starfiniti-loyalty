# Runbooks

Every runbook records incident/change owner, environment, start/end, commands, evidence, customer impact, and follow-up. Commands must be verified against the pinned deployment before use.

## Required runbooks and first actions

| Runbook                         | Detect                            | Safe first actions                                                                                               |
| ------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Service health                  | Failed readiness/synthetic probe  | Check edge/app/Supabase health and recent change; do not restart Postgres blindly                                |
| Database saturation             | Connections/CPU/locks/latency     | Stop nonessential jobs, inspect `pg_stat_activity`, preserve evidence, use pool limits                           |
| Queue backlog                   | Oldest age/SLO burn               | Identify tenant/event class, pause poison source, scale safe consumers, preserve idempotency                     |
| Dead-letter replay              | Dead-letter alert/operator case   | Fix cause, authorize scoped replay, retain IDs, monitor one canary batch                                         |
| Woo credential/signing rotation | Expiry/compromise/change          | Overlap explicit key versions, rotate least-privilege credential, verify signed canary, revoke old               |
| Dependency outage               | Upstream failure rate             | Keep checkout independent, extend bounded retries, communicate staleness, reconcile after recovery               |
| Failed deployment               | Readiness/error/SLO regression    | Stop traffic shift, roll back application image if schema compatible, forward-fix migrations                     |
| Database restore                | Loss/corruption/drill             | Isolate, select recovery point, follow `BACKUP_RESTORE.md`, verify before exposure                               |
| Privacy request                 | Verified case                     | Freeze scope/identity evidence, run idempotent export/deletion workflow, audit completion                        |
| Suspected tenant exposure       | Security signal/report            | Revoke affected credentials/sessions, preserve logs, contain route, notify incident owner, do not alter evidence |
| Ledger mismatch                 | Projection/reconciliation failure | Stop affected value commands, snapshot evidence, rebuild comparison, compensate—never edit ledger                |
| Proxmox host loss               | Host/storage monitoring           | Protect surviving replicas/backups, provision isolated replacement, restore; do not rely only on VM snapshot     |

Concrete target commands and screenshots are added only after the real Proxmox/Supabase deployment exists; placeholder commands that could destroy data are forbidden.
