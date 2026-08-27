# ADR-0065: Digest-bound full-service clean-room recovery

- Status: Accepted
- Date: 2026-08-27
- Decision owners: Starfiniti product and engineering
- Scope: M15-S04 database, identity, application, configuration, signing, privacy, and value recovery

## Context

Production has PostgreSQL physical base backups, continuous WAL archive, encrypted off-host storage, and one isolated database-only PITR drill. That drill proved that the exact PostgreSQL image could extract a verified base, replay WAL, promote, and expose the expected migrations. It did not prove Supabase Auth session issuance, Authentik recovery, application/image compatibility, configuration and credential restoration, WooCommerce signing-reference resolution, privacy-action replay, tenant authorization, connector/value behavior, or a full-service RTO.

A database-only result is especially easy to overstate. Supabase stores `auth.users` and related Auth data in PostgreSQL, while JWT/API keys, OAuth provider settings, SMTP configuration, DNS, and other service configuration require separate restoration. Authentik likewise treats PostgreSQL as its most important persistent component, but file-backed `/data`, custom templates, blueprints, certificates where applicable, and its stable secret/configuration boundary may also be necessary. PostgreSQL PITR itself needs a valid physical base plus an unbroken WAL and timeline-history sequence through the target; a logical dump is not a WAL replay source.

Primary guidance reviewed on 2026-08-27:

- PostgreSQL 17 continuous archiving, base backups, recovery targets, `recovery.signal`, missing-file behavior, and timelines: <https://www.postgresql.org/docs/17/continuous-archiving.html>
- Supabase self-hosted restore boundaries, Auth data included in database exports, and separate JWT/API/provider configuration: <https://supabase.com/docs/guides/self-hosting/restore-from-platform>
- Supabase physical backup/PITR behavior and storage-object exclusions: <https://supabase.com/docs/guides/platform/backups>
- Supabase self-hosted asymmetric signing and API-key configuration: <https://supabase.com/docs/guides/self-hosting/self-hosted-auth-keys>
- Authentik database plus static-directory backup/restore requirements: <https://docs.goauthentik.io/sys-mgmt/ops/backup-restore>
- Authentik configuration, stable secret-key consequences, PostgreSQL, and file/S3-backed data settings: <https://docs.goauthentik.io/install-config/configuration/>

## Decision

1. Define recovery as full-service integrity through independent reconciliation, not database readiness. The measured RTO begins before clean-room provisioning and ends only after database, identity, application, signing, privacy, connector, and value checks reconcile. Teardown is measured separately and remains mandatory.
2. Retain the five-minute authoritative PostgreSQL RPO and sixty-minute initial single-site full-service RTO as objectives, not claims. Two approved clean-room runs and independent reconciliation are required before either becomes a supported statement.
3. Require a controlled authoritative source marker within sixty seconds before simulated failure. RPO is the positive gap between that last committed fact and the restored target. This prevents an idle database or delayed WAL timestamp from making data loss appear smaller.
4. Use a canonical fourteen-stage plan: provision, isolation inspection, input verification, physical-base restore, WAL replay, database verification, Authentik restore, versioned configuration restore, signing-reference restore, privacy replay, exact service start, identity/application verification, reconciliation, and always-run teardown.
5. Separate orchestration policy from environment mechanics. The repository controller accepts only fixed stage IDs and one owner-controlled Node driver whose content digest is bound into a four-hour-or-shorter approval. It never accepts shell text, stage arguments, production routing, or browser authority. Environment-specific backup locations and secret access stay inside the reviewed driver environment.
6. Bind the clean commit, plan, minimized source inventory, driver, target marker, environment identifier, and prefixed Compose project by SHA-256 before the first driver call. Inventory contains an observation instant, digests, exact image identifiers, timestamps, booleans, and non-identifying source aggregates for database facts, ledger, queues, identity/configuration objects, signing references, and privacy actions—not backup paths, credentials, identities, or contents. Stage observations must independently reproduce those aggregates. After validation, the controller executes private byte-for-byte driver/control/inventory copies so path replacement cannot change approved authority.
7. Require internal networking with zero public ingress, external egress, or production route. The live inspection stage must independently reproduce those facts after provisioning. A declared disposable inventory cannot override a failed live inspection.
8. Verify PostgreSQL beyond startup: base transfer/compression/manifest/`pg_verifybackup`, WAL continuity/target/timeline, release migration and extension parity, RLS/grants/roles, zero-sum immutable transactions, projection rebuilds, queue/idempotency state, and committed-fact retention.
9. Restore Supabase Auth and Authentik as distinct boundaries. A fresh internal Authentik-to-Supabase broker login must issue a new application session. Live database membership and RLS—not email, domain, group claim, token metadata, or restored identity-provider state—remain tenant authority.
10. Restore configuration and credentials by exact version and minimized fingerprint/purpose evidence. Every active WooCommerce signing reference must resolve to one escrow entry, with no entry reused across connections. Raw JWT keys, API keys, OAuth secrets, provider keys, signing material, and identity data never enter runner output or Git.
11. Replay every deletion, pseudonymization, consent withdrawal, suppression, and deprovisioning action newer than the restore target before any test-user access. This journal is a required recovery input because restoring an older backup can otherwise resurrect data or authority intentionally removed later.
12. Exercise one approved synthetic signed WooCommerce event and replay plus one synthetic value command and replay. Both must converge to one canonical fact and one immutable attributable value effect; protected refunds, releases, customer access, export, and native checkout remain available.
13. Run teardown in `finally` after success or failure. Any retained clean-room volume, network, route, credential copy, identity, or runnable service makes the run fail. Controller-measured per-stage duration, approval-control digest, evidence digest, RPO/RTO, failure code, and cleanup evidence are the only run facts retained in the repository gate.
14. Require two independently inventoried and approved runs. The reconciliation document binds both inventory digests and both raw run digests; reused inventory, reused reports, shared artifact paths, symlinked artifacts, or oversized artifacts fail completion.

## Alternatives

### Treat the Proxmox VM snapshot as the recovery source

Rejected. A snapshot is useful supplementary infrastructure evidence but does not independently prove a consistent database point, WAL continuity, portable configuration, current privacy actions, or application/identity integrity.

### Close the gate with the existing database-only PITR drill

Rejected. It proves an important layer but stops before the user can authenticate, the application can authorize a tenant, connector signatures can resolve, or value can reconcile. Reporting its nine-second database readiness as a full-service RTO would be false.

### Put one production-specific shell script in the repository

Rejected. Host paths, secret stores, Borg repositories, Authentik layout, and provisioning vary and would either embed sensitive topology or encourage unchecked shell interpolation. The fixed-stage driver contract keeps policy testable while binding the separately reviewed environment implementation by digest.

### Manually follow the runbook and attach operator screenshots

Rejected. Manual steps are necessary for approval and independent review, but screenshots do not prove exact inputs, ordering, teardown, RPO/RTO start/end, or machine-reconcilable zero differences.

## Security and integrity effects

- The controller cannot target production by plan and inventory shape; the live driver still has to prove the disposable marker and route isolation.
- A driver is powerful operator code, so it is accepted only from an owner-only file whose exact digest and target are in a short approval. No standing daemon, Docker socket mount, or generic command endpoint is introduced.
- The report contains no path, origin, credential, customer, connection, order, request/response body, backup content, or privacy payload.
- Recovery correctness preserves immutable ledger history. A mismatch stops the drill; it is never corrected by update/delete or hidden by projection rebuild.
- Privacy replay precedes identity/application verification, preventing restored stale data or authority from becoming visible even inside the approved test flow.

## Operations

- `npm run recovery:validate` validates the canonical plan, 32-check evidence gate, and corruption/self-test matrix without Docker, backups, credentials, or production access.
- `npm run recovery:run -- --control-file ... --inventory-file ... --driver ... --out ...` is reserved for an approved isolated Linux host. Control, inventory, and driver files must be regular owner-only files outside Git; output must be a new absolute path.
- The environment driver receives one fixed stage name and a digest-bound request. It returns one bounded JSON result with only the exact allowlisted observations for that stage. Nonzero exit, timeout, malformed output, extra fields, nonzero integrity differences, or teardown residue fails closed.
- Raw driver receipts, logs, backup data, keys, and test identity details remain in restricted operator evidence. Repository evidence contains only signed summaries and content digests.

## Migration and rollback

This slice adds no database migration, runtime route, service, secret, production job, or provider call. Rollback removes the controller, canonical plan, and validators from new drills while preserving backup sources, privacy journals, prior sanitized evidence, and historical ADRs. Stop using an incorrect driver through a new approval and digest; never weaken the plan, erase a failed run, delete recovery sources, or bypass teardown to obtain a passing result.
