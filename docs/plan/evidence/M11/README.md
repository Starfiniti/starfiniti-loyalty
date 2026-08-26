# M11 Evidence — Ecosystem

Status: M11-S01 and M11-S02 repository/browser gates are exact-head green on `codex/m11-multistore`; M11-S03 is next and M11-S06 retains disabled deployment and Starfiniti production-canary closeout.

## M11-S01 explicit multi-store sharing

- Decision: ADR-0042 retains the programme group as the wallet boundary and rejects implicit same-organization sharing, mutable-only topology, and point-copying between per-store wallets.
- Contract: strict V1 isolated/shared policy, command, workspace projection, and result schemas accept only public selectors and exact revision/idempotency evidence.
- Database: additive immutable policy-version tables, migration backfill, RLS, revoked table grants, a minimized member read, and an owner/admin entitlement-gated command.
- Integrity: the reader rejects projection drift, inactive links, empty topology, and unbounded organization workspace sets. The command locks scope, canonicalizes exact workspace selectors, rejects stale revisions and changed retries, and prevents removal of connector-history workspaces.
- Value isolation: configuration writes no ledger transaction or entry and never calls WooCommerce.
- Merchant delivery: Operations includes a Hub-style responsive scope editor with explicit modes, protected connector states, review-before-save, optimistic revision, unavailable states, and English-only copy.
- Local evidence: 11 focused contract/server/action tests and all 626 workspace tests pass (199 dashboard, 105 worker, 265 contract, 57 domain); every workspace typecheck, targeted lint, production build, validators, formatting, and static validation of 63 migrations/50 pgTAP files pass. The new pgTAP file plans 52 RLS/grant/role/tenancy/idempotency/immutability/value-isolation assertions.
- [Native Chrome desktop/mobile QA](sharing-browser-qa-2026-08-26.md) passed the real Hub shell and sharing component for isolated-to-shared interaction, locked connector state, exact review copy, keyboard focus, reduced motion, English-only output, one-column mobile layout, zero page overflow, and zero unexpected diagnostics.
- Exact-head run [`32905613578`](https://github.com/Starfiniti/starfiniti-loyalty/actions/runs/32905613578) at `3cb609d` passed all seven jobs: root checks, both production images, clean 63-migration replay, all 50 pgTAP files including the 52 focused sharing assertions, all seven concurrency probes including the same-revision race, and minimum/current HPOS/legacy WooCommerce runtimes.
- Self-improvement evidence: the first exact-head run `32905188833` correctly rejected both unreviewed new `SECURITY DEFINER` endpoints and an ambiguous JSON-operator expression. The follow-up added the exact signatures to both independent allowlists and parenthesized the expression; no product authority, migration, RLS, or grant was relaxed.

## Pending S01 closeout

- Unavailable and read-only role states remain covered by typed rendering and require production Auth/RLS confirmation during canary.
- Disabled deployment, Starfiniti-only canary, exact topology/wallet/connector reconciliation, rollback rehearsal, and observation.

## M11-S02 verified cross-workspace customer linking

- Decision: ADR-0043 rejects email/organization matching, read-time multi-wallet aggregation, and automatic value transfers. One stable canonical customer is selected only after a separate fresh store HMAC proof reaches the same live Auth subject.
- Value safety: a secondary customer with any wallet in the shared programme group fails with an explicit reviewed-migration state. Link, unlink, and relink never write ledger, lot, reservation, tier, commerce-event, or WooCommerce value.
- Evidence model: immutable revisions retain exact source Auth link, registered identity, source customer, connection, workspace, canonical customer, action, request fingerprint, and correlation evidence. Trigger-guarded current projections require private transaction-local capabilities.
- Customer delivery: a no-selector bounded read and public-account-selector unlink command power an English connected-stores card with verified-store, wallet-home, confirmation, success/error, degraded, keyboard-focus, responsive, and value-preservation states.
- Verification: strict contract/server/action tests, 53 focused pgTAP assertions, and a concurrency probe cover simultaneous secondary proofs plus competing Auth subjects. Focused contracts and all 205 dashboard tests, affected typechecks, lint, production build, 64-migration/51-pgTAP static validation, and diff checks pass locally.
- [Playwright desktop/mobile QA](customer-link-browser-qa-2026-08-26.md) found and corrected 8–11 px text plus a weak focus ring, then passed 1440×1000 and 375×812 layouts with readable 11–18 px type, a 40 px action, required confirmation, keyboard-visible focus, reduced motion, degraded state, zero horizontal overflow, and zero browser diagnostics.
- Exact-head run [`32910582010`](https://github.com/Starfiniti/starfiniti-loyalty/actions/runs/32910582010) at `19c24a4` passed all seven jobs: root checks, both production images, clean 64-migration replay, all 51 pgTAP files with 2,716 assertions including the 53 focused link cases, all eight concurrency probes, and minimum/current HPOS/legacy WooCommerce runtimes.
- Self-improvement evidence: four earlier database runs failed closed on a reserved alias, a legacy insert-compatibility gap plus ambiguous variable, test-role misuse, and a final temporary-fixture grant. Each correction narrowed compatibility or test authority without relaxing production RLS, grants, projection guards, identity authority, or value invariants.

### Pending production closeout

- M11-S06 owns disabled deployment, read compatibility, Starfiniti-only canary, identity/link/wallet/event reconciliation, unlink/relink rollback rehearsal, and observation after reviewed stacked merge.

Later evidence sections will record currency conversion, service-account/API, webhook/client, integration-operations, and final canary results.

## M11-S03 multi-currency evidence — implementation checkpoint

- Decision: ADR-0044 rejects store-supplied and processing-time rates in favor of one immutable provider snapshot selected at canonical commerce occurrence time, exact rational arithmetic, atomic half-away rounding, and original-snapshot refund reuse.
- Contracts/domain: strict policy, snapshot, context, evidence, merchant command, and minimized read schemas pair with BigInt conversion over 0–6 decimal precisions and canonical decimal-string bounds.
- Database: four private RLS/immutable tables and exact-grant functions provide owner/admin policy revision, minimized organization-role read, worker-only snapshot ingestion, fail-closed occurrence-time resolution, independently recomputed atomic evidence, exact batch-retry binding, record-time occurrence-policy/rate revalidation, foreign-award evidence enforcement, and same-connection/order/version refund-origin enforcement.
- Worker: foreign V2 orders convert gross, paid, refunded, shipping, tax, and fee facts into programme base before evaluation; discount is re-derived, source currency remains rule-visible, and refunds reuse the original evidence selector. Same-currency behavior attaches no evidence and remains unchanged.
- Merchant delivery: Operations includes a responsive English-only policy/revision surface with base/source boundary, provider identifier, evidence-age guard, enabled state, explicit review, capability/role degradation, and a clear warning that configuration does not ingest rates.
- Adversarial improvement: final diff review found that a privileged caller could present policy/snapshot selectors without record-time occurrence revalidation, exact retries did not bind the atomic batch itself, and one successful merchant save could strand the next edit on its prior idempotency key. Database reselection/ambiguity checks, a canonical amount-batch digest, focused pgTAP/concurrency cases, and per-review operation rotation close those gaps.
- Verification currently passing locally: five focused contract cases, eight currency-domain cases within the 16 affected domain tests, two new worker scenarios within all 32 processor tests, seven server/action cases, all 654 workspace tests, every workspace typecheck, targeted lint, production dashboard/worker builds, validators, 65-migration/52-pgTAP static validation, exact 58-assertion plan accounting, formatting, and diff checks.
- [Production-build browser QA](currency-browser-qa-2026-08-26.md) passed desktop/mobile responsive layout, exact review state, required confirmation, English-only output, dark mode, mobile navigation, 3 px keyboard focus, zero overflow, and zero diagnostics after correcting 18 px legacy buttons and a masked focus ring.
- Docker-backed clean replay, all 58 focused pgTAP assertions, the ninth two-session concurrency probe, both images, all four WooCommerce runtimes, and exact-head CI remain pending before repository closeout.
- Production conversion remains disabled. Approved provider selection/credentials, isolated adapter ingestion, Starfiniti source-currency canary, exact source→snapshot→amount→evaluation→ledger→analytics reconciliation, rollback rehearsal, and observation remain M11-S06 owner/production gates.
