# Test Strategy

Use unit and property tests for domain invariants, database integration tests for transactions/RLS/migrations, contract tests for signed commerce envelopes, plugin tests across supported PHP/WP/WC, browser tests for merchant/customer flows, and failure/load tests for retries, concurrency, and recovery. Mocks cannot be the only evidence for authoritative behavior.

The M15 capacity-foundation gate validates the exact four-scenario fixed-arrival workload plus a loopback execution of readiness, authenticated account, scoped Service API, and exact-body signed WooCommerce adapters. It corrupts evidence, approval digests and target class, sample topology, task state, claims, sensitive keys/identities, and generated schedule results. A successful HTTP run cannot close the slice: committed aggregate reports must retain driver headroom and zero drops, an independent mature driver must reproduce the boundary, and separately hashed environment and reconciliation documents must prove the exact production-like topology, data shape, sub-300 ms wallet p95, sub-10-second event-to-ledger p95, and zero unexplained request/ledger/WooCommerce difference.

The M15 fault-foundation gate validates all six canonical scenarios and executes them against a loopback fixture with fake disposable service/proxy controls. It proves deterministic restoration, recovery probes, replay bounds, minimized reports, rejection of non-loopback origins, and rejection of missing fault coverage. A passing controller report cannot close the slice: two digest-bound disposable environment runs plus separate WAL, queue, immutable-ledger, wallet/lot, WooCommerce/coupon, provider-attempt, checkout, and no-loss reconciliation must pass with zero differences.

The M15 security gate separates source, full development/production
dependencies, deployable artifact, dynamic, release,
production-configuration, and independent-human evidence. CodeQL covers
JavaScript/TypeScript; private SARIF is reduced to exact rule/severity/scope
counts and Critical/High/unknown results fail. Security scores are accepted from
the SARIF direct property or exact `security-severity/<number>` rule/result tag;
malformed or conflicting declarations remain unknown rather than inheriting a
lower warning level. Temporary scan fixtures use explicit `0600` files. The
federation suite proves domain-separated keyed fingerprints, wrong-key rejection
before database/provider work, canonical 256-bit key parsing, and the optional
four-file all-or-none deployment boundary. The complete npm audit includes
development tooling. Repository Trivy uses a non-retained raw secret report, a
count-only summary, and an independent enforcing scan; both production images
fail on High/Critical vulnerability, secret, misconfiguration, and licence
findings. Trivy database/check-bundle timestamps must remain within 24 hours,
and Syft emits exact CycloneDX inventories. ZAP runs only against an
unauthenticated disposable dashboard on an internal Docker network with no host
port or external route, bounded spider/rule/scan/wait durations, and a
High-alert failure. The 26-check manifest validator plus the scan-summary
adversarial suite corrupt tool/workflow/plan digests, message source/origin
guards, task state, checks, failure rules, public targets, scan duration,
severity, secret, freshness, and sensitive-evidence boundaries. Completion
additionally requires exact SBOM/image/release reconciliation, verified
file/image provenance, non-destructive production review, independent
penetration test/retest, zero unresolved Critical/High findings, explicit
Medium/false-positive dispositions, exact-head four-cell R-032 compatibility,
and named security-owner approval.

Database migrations, seed replay, schema grants, RLS coverage, and privileged-function placement are exercised with `npm run db:verify`; see `DATABASE_TESTS.md`. Static validation alone cannot close a database task.

`npm run accessibility:validate` statically enforces the shared first-focus skip link, one focusable main target on all 17 route/component surfaces, text-area focus visibility, and reduced-motion coverage. It complements, rather than replaces, keyboard and responsive browser inspection of primary workflows. The authenticated redemption route is also checked at a 390-pixel viewport for safe login continuation, private/no-store and no-referrer handling, and a bounded confirmation layout.

Support-diagnostic tests serialize adversarial inputs and assert forbidden customer, payload, store-name, item-identity, and signing values are absent. Noncanonical error/operation strings are redacted rather than trusted as safe codes.

`woocommerce:validate` also enforces literal text-domain use and exact POT source coverage with no stale entries. The launch package is English-only; the container matrix proves the complete connector lifecycle on all four supported runtime combinations without installing a locale pack.

English-only presentation tests prove that legacy and unsupported locale selectors resolve to English, are removed from safe local navigation, and never enter WooCommerce claim URLs or signed identity fields. Existing open-redirect and narrow-viewport guards remain unchanged.

Experience-theme tests require contract/database agreement on contrast, token allowlists, copy bounds, linked tenant scope, RLS, role revocation, idempotent revisions, and immutable audit evidence. The dashboard preview must remain keyboard reachable and responsive without loading remote fonts or executing merchant CSS.

Customer activity-filter tests require a closed query-value allowlist, total transaction-kind categorization, stable newest-first ordering, and no mutation or expansion of the bounded database result.

The Phase 5 gate adds immutable-ledger pgTAP coverage plus a real two-session overspend race and a deterministic mixed-operation property sequence. Any future value command must join these gates and prove zero sum, attribution, idempotency, tenant isolation, deterministic locks, and wallet/lot projection equality.

The controlled customer redemption gate adds 45 pgTAP assertions for exact grants, Auth-derived active-link authority, tenant isolation, native-reward configuration bounds, atomic reservation/ledger/transition/private-outbox effects, exact retry/conflict behavior, insufficient-balance and lifecycle rollback, coupon minimization, actor attribution, and revocation. The complete database suite remains the authority for those transactional claims; the browser check covers only navigation and presentation boundaries.

The WooCommerce customer-erasure gate adds 47 pgTAP assertions for private grants/RLS/search path, keyed fingerprint material, event/lease/tenant binding, known and pre-import subjects, repeat application, immutable tombstones, hosted-link revocation, customer/channel pseudonymization, raw/canonical scrubbing, import suppression, and zero wallet/ledger effects. Every minimum/current HPOS/legacy runtime also proves the connector registers the deletion hook and writes one opaque deduplicated PII-minimized outbox event.

The hosted customer-export gate adds 43 pgTAP assertions for private-only grants and tables, empty search paths, hashed authorization storage, five-minute expiry, one-use atomic consumption, exact Auth subject/session binding, live-link and tenant isolation, versioned/minimized identities, exact text-form balances, tiers, reservations, complete wallet-side ledger entries, payload-free immutable per-customer audit, and zero ledger effects. Contract and dashboard tests additionally cover schema rejection, token handling, transaction rollback on response-contract mismatch, filename/headers, canonical English password-reauthentication continuation, and no horizontal overflow; authoritative authenticated execution remains covered by disposable Supabase CI.

The guided WooCommerce-provisioning gate adds 44 pgTAP assertions for the unique signing-reference index, column-level browser minimization, private-function grants, empty search path and timeout, live owner/admin and published-programme authority, role revocation, tenant isolation, exact retries/conflicts, store/input bounds, reference reuse denial, and secret-free immutable audit evidence. Three contract tests and two dashboard helper tests cover the exact setup package and eligibility logic. All four minimum/current HPOS/legacy WordPress runtimes import the package through the real settings boundary, validate all four saved fields, and retain the existing encrypted-at-rest signing-key flow. The key-pool generator is exercised for new-file and atomic append behavior without logging material.

The readiness gate adds one pgTAP assertion that executes the exact production catalog query as `loyalty_runtime`, plus one pure dashboard test covering positive, absent, null, duplicate-row, denied-privilege, and empty-pool outcomes. The public route catches internal failures and returns only a no-store `503 unavailable`; CI also builds that route into the production image used by Proxmox Compose.

The initial-tenant bootstrap gate verifies the private function signature, empty search path, absent browser/runtime/worker execution privileges, atomic organization/workspace/programme-group/owner creation, exact retry behavior, changed-request and existing-slug rejection, existing Auth identity requirement, canonical inputs, bounded secret-free audit metadata, immutable evidence, and deliberate separation from authenticated programme creation. The operator-command self-test covers UUID/slug/name validation, exact confirmation, administration-role separation, deterministic idempotency, and secret-free failures without connecting to a database.

The M13 agency/support/recovery gate combines 73 focused pgTAP assertions with a three-race, two-session concurrency probe. It proves bilateral relationships never become membership, support approval is separate and scope/expiry/session bound, every support or break-glass read appends tenant-visible evidence, AAL2 recovery checks a live Auth session without exposing `auth.sessions`, terminal offboarding removes every supported credential path including live webhook destinations/fingerprints, cooled deletion pseudonymizes only mutable identity, and immutable ledger/programme/audit evidence remains unchanged. Production-build browser review separately covers the real Hub workflows at desktop/mobile/narrow widths, keyboard/focus restoration, reduced motion, dark mode, 44-pixel mobile controls, cooling-state denial, overflow, and diagnostics.

The M13 production-closeout gate adds an exact 50-check enterprise identity manifest to `npm run check`. It rejects pending, failed, missing, duplicate, or unknown checks at completion; non-exact candidate commits; score drift; any category below 80% of its weight; incomplete M13-S01–S05 prerequisites; unsafe public status; sensitive keys or obvious raw identity/credential value shapes; hollow automatic-failure claims; and completion without all explicit approvals. Its self-test corrupts each boundary and must observe a deterministic rejection before the validator accepts the in-progress manifest.

The M14 billing-foundation gate adds 61 focused pgTAP assertions for private grants/RLS/search paths, live-membership tenancy, forged-claim denial, revocation, immutable account/state evidence, exact request/provider-customer/provider-event retries, changed-replay conflict, delayed-event ordering, grace/suspension/cancellation, six literal protected paths, and zero loyalty ledger effects. A two-session probe races exact provider customers and events under different caller keys, then races changed normalized payloads under the same provider event. Contract/server/UI tests enforce strict minimized output and prove self-hosted returns before provider construction; mocks are not authoritative for database behavior.

The M14 webhook-inbox gate adds 67 focused pgTAP assertions for runtime/worker separation, RLS/search paths, storage minimization, database-first self-hosted and entitlement gates, exact/changed provider-event replay, immutable receipts/attempts, bounded claims, peer exclusion, lease ownership/expiry/reclaim, entitlement revocation after claim, invoice no-authority behavior, event-time state normalization, and zero ledger effects. Sixteen dashboard tests exercise exact-byte HMAC tamper/skew/rotation, JSON minimization, current/legacy and terminal-period Stripe shapes, regular-file secret handling, route ordering, response minimization, and safe failures. Three worker tests cover bounded claim/result parsing and private failure deferral. A two-session probe races exact and changed event intake and two distinct worker claims.

Merchant presentation tests prove a canonical English document and copy boundary, removal of legacy locale queries, and English formatting. Programme publication and customer credit-expiry tests still convert winter and summer Europe/Ljubljana wall times to exact UTC instants and reject malformed dates, spring DST gaps, and autumn ambiguous times. Playwright renders the real Overview, programme, operations, customer-adjustment, and experience-editor components at 390×844 and 1440×1000, exercises add/review/preview interactions, asserts no horizontal overflow, and rejects console or failed-network responses. Production login smoke verifies the English document language and first-focus keyboard bypass.
