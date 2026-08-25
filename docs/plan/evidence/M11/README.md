# M11 Evidence — Ecosystem

Status: M11-S01 repository and browser gates are exact-head green on `codex/m11-multistore`; disabled deployment and the Starfiniti production canary remain open.

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
- Verification implemented: strict contract/server/action tests, 53 focused pgTAP assertions, and a concurrency probe for simultaneous secondary proofs plus competing Auth subjects. Focused contracts and all 205 dashboard tests, affected typechecks, targeted lint, 64-migration/51-pgTAP static validation, and diff checks pass locally.

### Pending S02 closeout

- Clean container replay of the additive migration and all 53 focused pgTAP assertions.
- Execution of the two-scenario concurrency probe.
- Production-build desktop/mobile keyboard, reduced-motion, contrast, overflow, degraded-state, and diagnostic review.
- Exact-head repository/images/all-runtime CI, disabled deployment, Starfiniti-only canary, identity/link/wallet/event reconciliation, unlink/relink rollback rehearsal, and observation.

Later evidence sections will record currency conversion, service-account/API, webhook/client, integration-operations, and final canary results.
