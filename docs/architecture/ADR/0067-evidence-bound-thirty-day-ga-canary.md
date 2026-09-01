# ADR-0067: Evidence-bound thirty-day GA canary

- Status: Accepted
- Date: 2026-08-27
- Decision owners: Starfiniti product and engineering
- Scope: M15-S06 production canary, reconciliation, claims, scoring, and GA approval

## Context

Passing repository tests proves deterministic contracts, not production behavior over time. A loyalty release can remain available while delayed events duplicate value, native coupons diverge, WAL recovery degrades, tenant isolation fails, a provider backlog grows, or daily evidence disappears. A calendar-only “30 days running” claim would conceal those failures. Conversely, requiring a big-bang rollout to prove production behavior would enlarge blast radius and make rollback ambiguous.

Primary guidance reviewed on 2026-08-27:

- Google SRE Workbook, Canarying Releases: <https://sre.google/workbook/canarying-releases/>
- Google SRE, Release Engineering: <https://sre.google/sre-book/release-engineering/>
- NIST SP 800-218, Secure Software Development Framework 1.1: <https://doi.org/10.6028/NIST.SP.800-218>

The SRE guidance requires controlled subset exposure, an evaluation process, release integration, reproducible artifacts, test evidence for the exact release, and an audit trail. NIST SSDF requires release integrity and retained provenance. Starfiniti additionally needs immutable-value, tenant, privacy, checkout, recovery, billing-independence, and WooCommerce reconciliation evidence.

## Decision

1. Canary one approved Starfiniti pilot tenant for at least 30 consecutive 24-hour UTC periods on one immutable release and configuration set. A material release, migration, value-contract, entitlement, or monitoring-contract change starts a new window.
2. Treat each UTC day as a required evidence interval. Missing or stale telemetry is unknown, never a healthy zero. The canary journal binds exact release/configuration identity, source coverage, operational aggregates, and protected zero-difference reconciliations.
3. Make M00 through M14 and M15-S01 through M15-S05 closeouts prerequisites. M15 capacity, fault, security, recovery, and operations manifests must be complete, current, distinct, and digest-bound to the GA release inventory.
4. Fail and restart the window on any unresolved Critical/High finding, cross-tenant access, unexplained value or coupon difference, duplicate business effect, data loss, checkout hub dependency, immutable-history rewrite, or evidence gap that prevents reconstruction. Green service readiness cannot override a deterministic failure.
5. Require one fresh pre-change recovery point, a rollback rehearsal, a production rollback decision exercise, and forward-fix handling for additive migrations. Rollback preserves accepted events, immutable value, protected operations, and historical evidence.
6. Reconcile the full pilot after the final day: commerce events, effects, ledger, wallet/lot/tier/reward projections, WooCommerce coupons, referrals, campaigns, notifications, analytics, APIs/webhooks, imports, identity lifecycle, usage, and invoices where applicable.
7. Keep a source-controlled claims catalogue. Claims default to non-publishable and become publishable only when their exact required checks, independent review, and owner approval pass. Deferred and excluded capabilities remain explicit.
8. Require M15 and whole-product scores of at least 90/100 with every relevant category at least 80%, but never allow scoring to override a deterministic failure.
9. Bind five distinct minimized artifacts: release inventory, 30-day journal, final reconciliation, claims review, and approval record. Sensitive raw evidence, tenant/customer/order/coupon identifiers, credentials, receiver destinations, and named people remain in an authorized external evidence store.
10. `npm run ga:validate` rejects false completion and validates the repository contract without authorizing production. The manifest remains `in_progress` until every live and approval gate has real evidence.

## Alternatives

### Count uptime from deployment day

Rejected. Uptime does not prove evidence continuity, exact release identity, value reconciliation, checkout independence, or provider/queue recovery.

### Roll out broadly and compare support volume

Rejected. Support volume is delayed, incomplete, and cannot establish tenant, ledger, privacy, recovery, or data-loss correctness. Broad exposure also increases blast radius.

### Let a high score compensate for missing live evidence

Rejected. Weighted scores can hide a zero in a safety-critical category. Deterministic failures and category floors remain mandatory.

### Publish claims before the canary and retract them on failure

Rejected. Product and marketing statements require evidence before publication; retraction does not undo customer reliance.

## Security and integrity effects

- The canary manifest and monitoring are evidence only; they grant no tenant, membership, value, release, rollback, or approval authority.
- Repository artifacts are minimized, bounded, digest-bound, and reject credentials and raw identities.
- No billing, entitlement, browser, WordPress, domain, email, or IdP metadata can suppress a protected gate.
- Failed days, findings, incidents, and reconciliation attempts remain historical evidence.

## Operations

Operators follow `docs/operations/GA_CANARY.md`, store sensitive observations externally, and commit only the five minimized artifacts with exact SHA-256 digests. Any deterministic failure stops exposure and begins incident/rollback handling. A corrected release starts a new 30-day journal.

## Migration and rollback

This slice adds no database migration, deployment, tenant enablement, monitoring receiver, credential, external message, or loyalty-value behavior. Reverting it removes only the repository gate and documentation; it cannot erase canary evidence or authorize a release. Production rollback follows the exact release runbook, retains immutable history, and forward-fixes additive schema changes.
