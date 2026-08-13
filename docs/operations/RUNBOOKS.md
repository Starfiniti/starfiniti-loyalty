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
| Support diagnostic collection   | Merchant support case             | Download sanitized bundle, verify schema/scope, and use separate approval for restricted evidence                |
| Proxmox host loss               | Host/storage monitoring           | Protect surviving replicas/backups, provision isolated replacement, restore; do not rely only on VM snapshot     |
| Real WooCommerce pilot          | Approved M01 change window        | Follow `WOOCOMMERCE_PILOT.md`; start from zero-value aggregates and abort on any unexplained value/coupon result |

Concrete target commands and screenshots are added only after the real Proxmox/Supabase deployment exists; placeholder commands that could destroy data are forbidden.

The merchant support bundle is aggregate operational evidence, not an authorization token or unrestricted export. Support must confirm `starfiniti.support-diagnostics.v1`, the intended public organization/workspace/connection scope, and the generation time. Never ask a merchant to add raw webhook bodies, customer/order identifiers, session data, signing material, or secrets to the bundle; any restricted evidence requires a separately authorized, audited process.

For a ledger mismatch, first call the tenant-scoped wallet and lot difference functions and export the affected ledger evidence. Rebuild functions may repair only mutable projections and must run under the worker role with an incident correlation record. A mismatch in immutable entries, attribution, or zero sum is never repaired by SQL update/delete; stop value commands and issue an approved compensating transaction after root-cause review.
