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

Later evidence sections will record explicit cross-workspace customer linking, currency conversion, service-account/API, webhook/client, integration-operations, and final canary results.
