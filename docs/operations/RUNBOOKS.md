# Operations runbooks

Every runbook records incident/change owner role, environment, start/end, alert fingerprint, safe commands, retained evidence, customer impact, value/privacy impact, and follow-up. Commands must be verified against the pinned deployment before use. An operator never restarts PostgreSQL, replays value work, releases a reservation, edits ledger history, changes RLS, or rotates a credential merely to clear an alert.

Use the incident state machine and communication policy in `INCIDENT_MANAGEMENT.md`. Evidence excludes tenant, workspace, customer, order, email, coupon, credential, token, payload, raw query, and correlation identifiers from general channels. Restricted evidence uses a separately authorized incident store.

## OPS-001 — Service health and wallet latency

**Detect:** failed edge readiness, Central API availability, or wallet-read latency. **Owner:** `platform-on-call`.

1. Declare the incident at the catalogue severity and record the exact release, image digests, migration set, probe region, and first failing instant.
2. Compare edge, reverse proxy, dashboard server, Supabase gateway, Authentik, and database aggregate health. Do not treat a successful database probe as full-service recovery.
3. Stop a rollout when the regression follows a release. Roll back only application images when schema compatibility is proven; migrations are forward-fixed.
4. Verify authorized wallet reads, tenant isolation, checkout independence, and protected operations before recovery. Reconcile any queued work.

## OPS-002 — Webhook acknowledgement

**Detect:** valid signed WooCommerce acknowledgement p95 above two seconds or p99 above five seconds. **Owner:** `value-integrity-on-call`.

1. Separate edge receipt, signature verification, canonical persistence, and response latency using aggregate histograms.
2. Confirm checkout never waits for the hub and the plugin retains its bounded local queue.
3. Inspect database pool, lock, WAL, and canonical-event contention without logging raw request bodies or commerce identities.
4. After recovery, replay one approved duplicate test delivery and prove one canonical fact/effect.

## OPS-003 — Queue backlog or worker unavailable

**Detect:** oldest work over sixty seconds, event-to-ledger p95 above ten seconds, or a required worker class unavailable. **Owner:** `value-integrity-on-call`.

1. Identify the bounded queue class and failure-code aggregate; never copy payloads into the incident channel.
2. Pause only the poison source or feature class. Preserve checkout, refunds, releases, reconciliation, and existing promised-value access.
3. Restore or scale idempotent consumers within the proven capacity envelope. Do not add unbounded concurrency.
4. Reconcile accepted facts, effects, ledger transactions, queue leases, and retry counts before declaring recovery.

## OPS-004 — Dead-letter replay

**Detect:** any dead-letter work. **Owner:** `value-integrity-on-call`.

1. Classify the deterministic or ambiguous cause before replay. Ambiguous native coupon outcomes remain inspect-only until independently reconciled.
2. Fix the cause and authorize a bounded, idempotent canary replay through the existing command—not direct SQL.
3. Observe one effect per source fact and no cross-tenant access, then expand in bounded batches.
4. Preserve dead-letter and replay history; corrections compensate and never rewrite the ledger.

## OPS-005 — Provider ambiguity or outage

**Detect:** ambiguous outcome count, provider error-rate alert, or confirmed SMTP/Klaviyo/webhook/Stripe/WooCommerce outage. **Owner:** `value-integrity-on-call`.

1. Stop new claims for the affected provider boundary while retaining reservations for ambiguous native value.
2. Keep value processing and checkout independent of notification, analytics, billing, and marketing providers.
3. Reconcile provider receipt/status through an approved read path before retry or compensation.
4. Verify consent, suppression, entitlement, reservation, coupon, and ledger state after recovery.

## OPS-006 — Database saturation or disk pressure

**Detect:** connection-pool use above eighty percent, CPU/lock/latency saturation, or filesystem available capacity below fifteen percent. **Owner:** `platform-on-call`, with `recovery-on-call` for disk risk.

1. Preserve aggregate `pg_stat_activity`, lock, pool, WAL, filesystem, and recent-change evidence; exclude query values and identifiers.
2. Stop nonessential exports, analytics, campaigns, notifications, and billing jobs before protected-value workers.
3. Apply only proven pool/concurrency limits. Do not restart PostgreSQL blindly or remove WAL/backups/logs to create space.
4. Verify WAL continuity, replication/archive state, ledger writes, queue recovery, and projections after headroom returns.

## OPS-007 — WAL RPO or stale base backup

**Detect:** WAL archive lag over five minutes, missing/corrupt segment, failed archive, or verified base backup older than one day. **Owner:** `recovery-on-call`.

1. Declare a protected-value incident at an RPO breach. Preserve the last successful segment/base fingerprint and failure evidence.
2. Inspect archive destination availability, continuity, permissions, capacity, exact pinned backup units, and the dedicated PostgreSQL Borg lock owner without exposing paths or credentials broadly. If a whole-VM process owns that lock or both jobs resolve to one repository, fail the configuration and keep recovery status non-passing. Lock timeout status 75 means no incremental archive was created; maintenance timeout status 124 means check/prune/compact did not complete. Do not reinterpret a later timer retry, older archive, or partial maintenance trace as success.
3. Do not delete the last known-good base/WAL chain or claim recovery from a successful timer alone.
4. Resume archiving, verify continuity and integrity, then schedule an approved isolated restore. RPO/RTO claims require clean-room evidence.

## OPS-008 — Backup transfer amplification

**Detect:** one cycle transfers more than four times changed bytes and more than one GiB; investigate sustained guest-to-host egress even when external uplink is quiet. **Owner:** `recovery-on-call`.

1. Stop only the offending backup transfer after identifying the exact unit/process. Do not stop PostgreSQL or remove the source backup chain.
2. Compare guest transmit, bridge receive, physical-uplink transmit, disk read, changed-byte estimate, and transferred-byte total. Cumulative VM counters are not rates.
3. Confirm the active stage is the restricted incremental implementation and the PostgreSQL repository/lock differ from the whole-VM repository/lock. A full tar/stream loop or timestamped rollback copy must never be executable by a timer.
4. Run one bounded manual incremental cycle, verify source/destination totals and the exact dedicated Borg archive, then resume the timer. Retain aggregate start/end counters and amplification ratio.

## OPS-009 — Ledger mismatch

**Detect:** any unexplained immutable ledger, lot, wallet, or projection difference. **Owner:** `value-integrity-on-call`.

1. Stop affected new value commands and preserve the immutable source/effect/transaction evidence.
2. Use tenant-scoped reconciliation and projection rebuild comparisons; never issue update/delete against immutable entries.
3. Separate projection repair from value correction. Projection rebuild may repair only mutable projections under the worker role and incident correlation record.
4. An attribution or zero-sum mismatch requires root-cause review and an approved compensating transaction.

## OPS-010 — Suspected tenant exposure

**Detect:** tenant-boundary guard, cross-tenant test failure, report, or suspicious authorization evidence. **Owner:** `security-on-call`.

1. Declare a security incident immediately, contain the affected route and revoke affected sessions/credentials without changing evidence.
2. Validate live database membership, RLS, grants, private functions, service scopes, Auth subject mapping, and recent changes. Email, domain, groups, and JWT metadata grant no authority.
3. Determine exact exposure scope through restricted evidence. Do not enumerate customer data into general incident systems.
4. Follow legal/privacy notification decisions, restore fail-closed authorization, run adversarial cross-tenant tests, and require independent review.

## OPS-011 — Checkout dependency

**Detect:** any WooCommerce checkout failure caused by central hub availability or latency. **Owner:** `value-integrity-on-call`.

1. Treat one event as critical. Disable the optional loyalty placement/path causing the dependency while leaving native checkout and coupons intact.
2. Verify plugin local cache, bounded queue, timeouts, circuit behavior, HPOS/legacy, Blocks/classic, and minimum/current runtime compatibility.
3. Recover queued loyalty effects asynchronously and reconcile order/refund/coupon facts.
4. Add a regression outage test before re-enabling the placement.

## OPS-012 — Privacy replay or request failure

**Detect:** failed deletion, pseudonymization, consent withdrawal, suppression, SCIM deprovisioning, or recovery-journal replay. **Owner:** `security-on-call`.

1. Prevent stale restored data or authority from becoming visible. Suspend the affected identity/access surface if required.
2. Preserve minimized action type/count/timestamp evidence; raw identity and payload evidence stays restricted.
3. Re-run the idempotent action through its approved workflow and verify downstream provider suppression/deletion.
4. Confirm old sessions fail, notifications remain suppressed, ledger attribution remains immutable, and privacy evidence is complete.

## OPS-013 — Identity broker unavailable

**Detect:** Authentik/Supabase brokered login probe failure. **Owner:** `security-on-call`.

1. Confirm whether Authentik, Supabase Auth, upstream IdP, DNS/TLS, or application callback is failing.
2. Preserve existing valid sessions unless compromise is suspected. Do not infer membership from a successful IdP login.
3. Retain break-glass owner access under AAL2/live-session controls and record every use.
4. Verify a fresh brokered login, live membership/RLS authorization, deprovisioned-user rejection, and cross-tenant denial before recovery.

## OPS-014 — Certificate expiry

**Detect:** earliest production certificate expiry under fourteen days. **Owner:** `security-on-call`.

1. Identify the bounded service/surface label; never put private keys or full configuration in incident evidence.
2. Renew through the approved ACME/provider flow, verify chain/SAN/time from an external probe, and preserve rollback material securely.
3. Verify dashboard, Auth, webhook, API, and WooCommerce connector paths after rotation.

## OPS-015 — Security finding

**Detect:** unresolved Critical/High SAST, dependency, image, secret, misconfiguration, DAST, production-review, or penetration-test finding. **Owner:** `security-on-call`.

1. Bind the finding to exact source/image/release evidence and classify exploitability without copying secrets or sensitive report contents.
2. Contain affected exposure and stop rollout. Do not lower severity, blanket-ignore, or delete history to make the gate green.
3. Patch, scan the exact deployable artifact, retest independently where required, and update the durable regression control.

## OPS-016 — Recovery exercise stale or failed

**Detect:** last independently reconciled clean-room exercise older than ninety-two days or any failed stage/teardown. **Owner:** `recovery-on-call`.

1. Block recovery/RPO/RTO claims and GA change windows that depend on stale evidence.
2. Preserve the failed minimized report and source chain; never rerun against production to save time.
3. Schedule a new approved isolated two-run exercise using `BACKUP_RESTORE.md` and the digest-bound controller.

## OPS-017 — Incident route exercise stale or failed

**Detect:** test-alert delivery/acknowledgement/escalation evidence older than thirty-one days or failed routing configuration. **Owner:** `platform-on-call`.

1. Treat an unrouteable protected-value/security alert as a production readiness failure.
2. Keep destination credentials and person identities outside Git; validate and reload only a known-good Alertmanager configuration.
3. Test each route class, primary/secondary delivery, acknowledgement, escalation, handoff, and durable ticket path.
4. Stop the monitoring-plane heartbeat and prove the independently hosted dead-man switch pages without Prometheus or Alertmanager, then convert any routing or ownership failure into a regression check before closing.

## Supporting runbooks

- WooCommerce credential/signing rotation uses overlapping explicit key versions, a least-privilege credential, a signed canary, old-key revocation, and exact reconciliation.
- Failed deployment stops traffic shift, restores a schema-compatible application image, and forward-fixes additive migrations.
- Database restoration follows `BACKUP_RESTORE.md`; service readiness is insufficient until identity, authorization, signing, privacy, connector, and value checks reconcile.
- Agency/support recovery follows `AGENCY_SUPPORT_RECOVERY.md`; it requires separate approval, AAL2/live session, bounded scope, and tenant-visible retained history.
- A support diagnostic bundle is aggregate evidence—not authorization or an unrestricted export. Restricted evidence always requires separate approval.
