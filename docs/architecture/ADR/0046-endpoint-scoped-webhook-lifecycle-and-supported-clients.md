# ADR-0046: Endpoint-scoped webhook lifecycle and supported clients

- Status: Accepted
- Date: 2026-08-26
- Scope: M11-S05 outbound webhook lifecycle, TypeScript/PHP clients, and integration operations

## Context

M08 already provides the security-critical outbound path: strict `NotificationEventV1`, endpoint-bound HMAC-SHA256, stable delivery identity, last-moment consent/entitlement/subscription checks, public-address socket pinning, no redirects, bounded retries, and append-only minimized attempt evidence. Endpoint provisioning and rotation still require manual private-table changes, merchant health hides the endpoint data flow, and there is no supported Service API client or receiver implementation.

The [Standard Webhooks specification](https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md), reviewed 2026-08-26, requires the exact `webhook-id.webhook-timestamp.raw-body` signature input, constant-time comparison, bounded timestamp tolerance, stable-ID replay protection, endpoint-unique keys, and multiple signatures for bounded rotation. [Composer's schema](https://getcomposer.org/doc/04-schema.md), reviewed 2026-08-26, recommends PSR-4 autoloading for libraries. [PSR-18](https://www.php-fig.org/psr/psr-18/), reviewed 2026-08-26, defines an HTTP-client abstraction so libraries are not coupled to one vendor implementation. These sources govern receiver and package interoperability; PostgreSQL remains the tenant/lifecycle authority.

## Alternatives

1. **Leave lifecycle as operator SQL and publish snippets.** This preserves the M08 worker but gives merchants no idempotent or attributable control, makes deletion behavior ambiguous, and cannot produce one reconciled operations view.
2. **Store an encrypted raw secret in PostgreSQL and run one pooled webhook worker.** This makes activation easier, but places reusable secrets in the database, expands worker blast radius across tenants/endpoints, and reverses the endpoint-isolated deployment guarantee.
3. **Keep one externally mounted secret and worker per endpoint; add database-authoritative disabled creation, disabled-only rotation, immediate disablement, terminal retirement, append-only revisions, and supported receiver/API clients.** This retains isolation and makes the unavoidable deployment step explicit.

For PHP transport, two approaches were compared:

- Requiring PSR-18 plus a specific PSR-7 factory gives framework interoperability but forces additional packages and version resolution into WordPress and small self-hosted receivers.
- A package-owned minimal `Transport` interface with a bounded TLS-verifying cURL implementation remains dependency-free. A PSR-18 adapter can be injected without coupling the core client to an implementation. This follows the PSR-18 decoupling goal while avoiding a mandatory HTTP stack.

## Decision

1. Existing M08 event, signature, delivery, retry, and worker functions remain the only outbound runtime path and wire contract. M11 adds no second event or value path.
2. The authenticated Next.js server generates a unique 256-bit `whsec_` value. PostgreSQL receives only SHA-256 over the decoded key plus a six-character hint. A newly created or rotated raw secret is returned once; an exact command retry returns the resource but never replays secret material.
3. Creation derives organization from an active workspace and live owner/admin membership, rechecks `notifications`, validates a public HTTPS destination and sorted allowlisted subscriptions, limits an organization to 20 non-retired endpoints, and always creates `disabled`.
4. Rotation is accepted only while disabled. It replaces the current fingerprint, optionally retains the old fingerprint for 0–86,400 seconds, and remains disabled until the reviewed operator deploys the current/prior secret files into that endpoint's isolated worker.
5. Activation is not a merchant command in V1. The operator must reconcile endpoint ID, allowed origin, secret fingerprints, receiver vector, entitlement, and worker isolation, then update the endpoint through the runbook. This prevents UI state from claiming that an external secret mount exists.
6. Disablement is immediate at the database state checked by claim and again before dispatch. It never deletes accepted events or loyalty value.
7. Retirement requires disabled state, is terminal, replaces the live destination with a reserved non-routable tombstone, clears current/prior hints and prior binding, invalidates the current fingerprint, and retains endpoint identity, revisions, deliveries, attempts, audits, and counts. Hard deletion is prohibited.
8. Every relevant endpoint insert/update appends a private immutable revision containing state, destination digest, subscriptions, rate, bounded hints, expiry, reason, and optional actor. It contains no fingerprint, destination history, payload, response body, signature, contact, or worker identity. Automatic `410` disablement is recorded as a system action.
9. The Auth-scoped endpoint document exposes at most 50 endpoints for one active workspace organization. Owner/admin can manage; operator/analyst/auditor are read-only. It returns current live destination only for non-retired endpoints, bounded hints, subscription/rate state, canonical delivery counts, last attempt, and last error; it never returns fingerprints or private delivery content.
10. `@starfiniti/loyalty-sdk` is a publishable Node 20+ ESM package using built-in `fetch` and cryptography. It validates Service API commands/results, bounds response bodies, refuses redirects, maps bounded problems, verifies raw webhook bytes in constant time, and delegates atomic stable-ID claims to a receiver-supplied store.
11. `starfiniti/loyalty-sdk` is a PHP 8.1+ PSR-4 Composer library with no mandatory HTTP-client dependency. It provides the same request/response and webhook semantics, a `Transport` interface, a TLS-verifying non-redirecting bounded cURL transport, and an atomic replay-store interface.
12. One checked-in vector freezes secret, raw body, ID, timestamp, and signature across TypeScript and PHP. Neither SDK logs credentials, bodies, signatures, or responses.

## Consequences

- Merchant lifecycle actions become tenant-derived, idempotent, audited, and reversible until terminal retirement.
- A lost one-time secret requires another disabled rotation or endpoint; recovery cannot reveal prior material.
- Activation remains operationally heavier than pooled secret storage, but the UI and health view state that honestly and preserve the narrower compromise boundary.
- Retirement removes operational configuration rather than immutable delivery evidence. M13 offboarding may apply broader organization-level retention policy without rewriting this history.
- PHP applications can inject a PSR-18 adapter, but the initial package does not ship one or select a framework HTTP implementation.

## Rollout and rollback

Deploy the additive migration with existing endpoints unchanged. Create one disabled Starfiniti endpoint, transfer and mount its one-time secret, run the shared receiver vectors, activate through the reviewed runbook, deliver/replay one event, then disable, rotate, remount, reactivate, and retire. Reconcile revisions, audits, deliveries, attempts, health counts, receiver IDs, and zero ledger effects.

Rollback disables lifecycle actions, disables/stops only the pilot endpoint worker, and leaves the M08 wire/delivery path intact. Existing endpoint, revision, audit, event, delivery, and attempt evidence remains readable. The SDK packages can be withdrawn without affecting accepted commands or deliveries; forward fixes preserve V1 request, response, and signature compatibility.
