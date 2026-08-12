# Threat Model

## Scope and assets

This model covers the public edge, Next.js/BFF, WooCommerce plugin, Supabase Auth/PostgREST/Storage, application/worker database access, PostgreSQL, queues, backups, support tooling, and deployment supply chain.

Highest-value assets are tenant isolation, Auth sessions, customer identifiers, WooCommerce/signing credentials, programme versions, wallet/ledger integrity, coupon/reservation capability, audit history, backups, and availability of checkout-independent connector processing.

## Actors

- unauthenticated internet attacker;
- authenticated customer or merchant attempting privilege escalation;
- compromised WordPress site/plugin credential;
- malicious or mistaken tenant administrator/support operator;
- compromised application/worker container;
- supply-chain attacker;
- infrastructure administrator or stolen backup holder;
- ordinary component failure producing duplicate, delayed, or lost work.

## Trust boundaries

1. Browser/WordPress to public TLS edge.
2. Edge to application and Supabase gateways.
3. Authenticated user context to tenant authorization rows.
4. Application/worker roles to private database commands.
5. Postgres primary storage to backup/off-host storage.
6. Hub outbox to WooCommerce command execution.
7. Support/operator access to tenant-restricted data and actions.

## Threat/control/test register

| ID    | Threat                                                                         | Severity | Required controls                                                                                   | Verification                                         | Implementation      |
| ----- | ------------------------------------------------------------------------------ | -------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------- |
| T-001 | Cross-tenant read/write through forged IDs or missing filter                   | Critical | Composite tenant FKs, explicit grants, RLS, live membership helpers, no owner role at runtime       | Two-tenant pgTAP/API tests; forged org/object matrix | Phase 3             |
| T-002 | Secret/service key reaches browser, WordPress, log, or repository              | Critical | Publishable key only in client; separate runtime roles; secret store; scanning/redaction            | Bundle scan, secret scan, runtime config tests       | Phase 3/deploy      |
| T-003 | Duplicate/replayed event creates repeated value                                | Critical | HMAC/replay window; delivery/event/effect/command uniqueness; canonical hash conflict               | Duplicate/replay/property and crash tests            | Phase 4/5           |
| T-004 | Concurrent redemption or expiry double-spends                                  | Critical | Double-entry constraints, wallet/lot row locks in fixed order, capture/release uniqueness           | Concurrent database/property tests                   | Phase 5/6           |
| T-005 | Ledger history edited or unbalanced                                            | Critical | No DML grants; immutable triggers; deferred zero-sum assertion; compensations only                  | pgTAP mutation/imbalance/rebuild tests               | Phase 5             |
| T-006 | Forged/tampered webhook accepted                                               | Critical | HMAC raw body, key version, constant-time compare, bounded input, connection status                 | Tamper/unknown key/size/skew tests                   | Phase 4/7           |
| T-007 | Proxmox/storage loss destroys authority                                        | Critical | Off-host encrypted base backups + WAL, config escrow, restore drills, monitored replication/archive | Scheduled clean-room restore and RPO/RTO evidence    | Deployment/Phase 14 |
| T-008 | Hub outage breaks WooCommerce checkout                                         | Critical | Plugin local outbox, asynchronous hub calls, cached optional UI, fail-open commerce path            | Central outage checkout tests                        | Phase 7             |
| T-009 | Email-only linking steals another wallet                                       | High     | Channel-bound verified claim; unique active links; auditable decisions                              | Claim takeover/race tests                            | Phase 3/9           |
| T-010 | Stale JWT preserves revoked membership                                         | High     | Live database membership on every tenant path; short tokens; session validation for high risk       | Revoke-with-live-token tests                         | Phase 3             |
| T-011 | SQL injection/search-path hijack in privileged function                        | Critical | Parameterized calls, empty search path, qualified objects, owner NOLOGIN, restricted execute        | Static catalog pgTAP and adversarial inputs          | Phase 3-6           |
| T-012 | Coupon/reservation theft or replay                                             | High     | High-entropy code, keyed hash, customer/order binding, one-use/expiry, capture uniqueness           | Guess/replay/cross-customer tests                    | Phase 6/7           |
| T-013 | Support impersonation is invisible or permanent                                | High     | Scoped expiring approved grant; per-use tenant-visible audit; no claim override                     | Expiry/scope/audit tests                             | Phase 3/9           |
| T-014 | PII/secrets leak in logs, exports, raw payloads                                | High     | Classification, allowlist logging, masked support UI, encrypted time-limited exports, raw retention | Log/export snapshot scans; retention jobs            | Phase 3 onward      |
| T-015 | Dependency/container/plugin supply-chain compromise                            | High     | Lockfiles, pinned action/image SHAs/tags, signatures/SBOM/scans, staged rollout                     | CI dependency/container/plugin scans                 | Continuous          |
| T-016 | Malicious programme publication changes historical value                       | Critical | Immutable published versions, canonical hash, approval workflow, transaction snapshot               | Mutation/hash/history tests                          | Phase 6             |
| T-017 | Worker crash after remote success duplicates command                           | High     | Remote command ID, idempotent plugin handler, durable lease/result reconciliation                   | Kill-after-success test                              | Phase 4/7           |
| T-018 | Queue poison/retry storm causes denial of service                              | High     | Size/schema bounds, quarantine, capped jittered retry, per-tenant fairness/rate limits              | Poison/burst/backlog tests                           | Phase 4/14          |
| T-019 | Backup holder reads restricted data                                            | High     | Separate encryption keys, least privilege, immutable retention, access audit, key rotation          | Restore with controlled key; access review           | Deployment          |
| T-020 | Supabase upgrade silently breaks gateway/Auth/database                         | High     | Pinned release set; Envoy/API URL/PG17 compatibility checks; staged restore/rollback                | Upgrade rehearsal and smoke suite                    | Deployment          |
| T-021 | Forged/stale session, open redirect, or shared-cache leak crosses user context | Critical | Verified claims, live membership RLS, local-only redirects, private no-store cookie responses       | Auth unit/browser tests; revoked-member API matrix   | Phase 9/deploy      |

## Abuse cases

- A merchant changes `organization_id` in a request: database composite keys and RLS reject it even if application validation fails.
- A WordPress attacker replays a valid signed body: the delivery ID/nonce and effect uniqueness return the prior result.
- Two checkout sessions reserve the same available points: one transaction obtains the wallet/lot locks; the other sees the committed remaining balance and fails or reserves a smaller valid amount.
- An admin tries to update a published programme or ledger row: no direct DML grant and immutability guards reject it.
- A worker times out after coupon creation: retry uses the same command ID and obtains the existing coupon result.
- A deleted Auth user presents an unexpired token: membership/customer-link checks still fail after revocation.
- A support user changes JWT metadata to enter a tenant: there is no metadata authorization path; a live scoped support grant is required.

## Security requirements by boundary

### Public edge

TLS 1.2+, HSTS after validation, bounded body/header sizes, timeouts, safe forwarded headers, per-IP/connection rate limits, request IDs, and no direct Postgres/Studio exposure. Envoy admin is private.

### Application

Schema validation, origin/CSRF controls for cookie-authenticated mutations, verified Supabase sessions, server-derived actor/tenant context, parameterized database calls, strict response minimization, and no secret-bearing `NEXT_PUBLIC_` variables.

The Next.js request proxy refreshes Supabase Auth through `getAll`/`setAll`, applies the Auth library's private/no-store response headers, and uses `getClaims()` rather than trusting cookie-loaded session objects. It excludes signed WooCommerce API routes from merchant redirects. Server pages verify claims again, query only with the publishable key and user JWT, and derive tenant scope from live membership rows under RLS. Redirect targets must be local absolute application paths.

Merchant programme mutations omit actor and organization IDs from their public contracts. Exact-signature Data API wrappers derive the actor from request claims, recheck live owner/admin membership, canonicalize and hash persisted JSON in PostgreSQL, and append immutable tenant audit evidence in the same transaction. Exact idempotency retries return the original result; changed input, stale hashes, revoked roles, and cross-tenant resource IDs fail closed.

Merchant customer reads validate public UUIDs, bound and escape reference search, repeat explicit organization/programme-group filters underneath RLS, and mask external channel identifiers in server-only code. The customer timeline exposes wallet-side ledger evidence and shortened correlation context but omits raw commerce payloads, ledger metadata, contact attributes, and unrelated identities.

Merchant connector reads enter exact-signature security-definer wrappers because queue tables are private. The wrappers recheck live tenant membership and return only bounded state, count, attempt, error-code, event/topic, and watermark fields. They never return queue payloads, raw bodies, source object identifiers, coupon codes, signing references, or customer attributes. Effect replay is restricted to live owner/admin/operator roles, dead-letter canonical effects, a bounded reason, and immutable audit evidence. Quarantined work and compensated coupon commands cannot be replayed through this surface.

Source-order reconciliation is a separate narrow command, not a generic outbox replay. PostgreSQL derives the actor, rechecks owner/admin/operator membership and live connection status, validates one canonical numeric order ID and bounded reason, and atomically records audit evidence with a private signed outbox command. The plugin re-emits WooCommerce source facts through existing source-revision and central idempotency fences; it cannot directly mutate the ledger. Missing orders dead-letter rather than creating a retry storm.

Overview analytics enter one exact-signature stable wrapper that rechecks live membership and the active organization/workspace/programme relationship. Date ranges are allowlisted and aligned in UTC. Private evaluations, canonical payloads, identities, ledger entries, actors, and reasons remain inaccessible to browser roles; only minimized exact aggregates and bounded daily counts are returned. The UI uses text-form integers and `BigInt`, states metric definitions, and shows no illustrative fallback that could be mistaken for tenant truth.

Manual point adjustment is treated as a high-risk value command. The public contract omits actor/organization IDs, preserves point values as integer strings, requires deliberate review and a bounded reason, and gives removal a distinct warning/confirmation. PostgreSQL rechecks live owner/admin membership, customer/group/version relationships, and expiry direction before invoking the immutable ledger primitive. Operators, analysts, auditors, revoked users, stale versions, and cross-tenant targets fail closed. The ledger and administration audit rows are committed together and cannot be rewritten.

### Database

Least privilege, RLS, composite tenant FKs, immutable ledger/programme/audit tables, idempotency constraints, short transactions, fixed lock order, empty privileged-function search paths, and audit correlation.

### WooCommerce

HPOS compatibility, least-privilege REST credentials, signing-key rotation, local Action Scheduler queue, input/output escaping, capability/nonces for admin actions, dependency pinning, masked diagnostics, and checkout independence.

### Operations

Separate environments/credentials, encrypted off-host backups, tested restore, image/action pinning, patch cadence, vulnerability/secret scans, restricted Studio, incident procedures, and break-glass audit.

## Residual risk and gate result

All critical threats have a concrete preventive/detective control and executable verification assigned to a build phase. None requires an unresolved product decision. The controls are not yet all implemented, so production readiness remains an automatic fail; Phase 2's design gate passes only after these documents and ADRs are reviewed by CI/diff evidence.
