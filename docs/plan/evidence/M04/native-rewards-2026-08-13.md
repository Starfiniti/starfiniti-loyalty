# M04 native reward slice evidence — 2026-08-13

Status: native, manual, merchant, and customer slices are implemented locally; exact-head CI, full WooCommerce runtime matrix, browser review, deployment, and tenant canary remain required.

## Implemented evidence

- `ProgrammeRewardDefinitionV2` strictly models fixed discount, uncapped percentage discount, free shipping, and product-specific free-product rewards plus their availability and WooCommerce restrictions.
- `20260813210000_expanded_reward_fulfilment.sql` independently validates published V2 rewards, atomically allocates global quantity and points budget, protects per-customer limits, and enqueues only versioned native commands.
- The connector advertises `coupon.issue.v2`; older pollers can claim only V1 commands. The plugin maps bounded restrictions to `WC_Coupon` without a checkout-time hub request.
- The V2 segment list is intentionally empty until M07 supplies authoritative audience evaluation.
- `20260813211000_manual_reward_fulfilment.sql` creates one private, immutable case and transition history for exclusive-access and custom perks. A store operator must first accept a case, then either prove fulfilment or definitively reject it; uncertain delivery remains `in_progress` with points and limited capacity reserved.
- Confirmed manual fulfilment records `issued` and `captured` reservation transitions plus the exact related capture ledger transaction. Definitive rejection records `failed`, a compensating cancel transaction, and `released`. Exact retries return the original result; conflicting reuse fails.
- The merchant Rewards workflow now provides six supported templates, restrictions, availability and limit controls, compatibility/readiness feedback, queue summaries, and role-gated start/fulfil/reject operations. The hosted customer account exposes every supported native and manual reward through the same confirmation and atomic reservation boundary.
- Queue reads are tenant-derived and minimized. Owners, admins, and operators may mutate; analysts and auditors can inspect; raw cases, transition history, wallet IDs, external identities, and ledger internals remain private.
- Rollout disablement blocks new expanded reward value but does not hide accepted manual cases. The merchant route always reads accepted cases, and PostgreSQL keeps queue inspection, start, and resolution independent from the authoring entitlement.
- V2 accepts unversioned V1 carry-forward only for fixed discount, uncapped percentage discount, and free shipping. Unsupported legacy kinds, disguised version markers, malformed native configurations, and precision mismatches fail in both the public TypeScript contract and the independent PostgreSQL command boundary.
- Availability windows compare normalized timestamp instants, so valid cross-offset windows agree with PostgreSQL `timestamptz` ordering.

## Executed verification

- A clean PostgreSQL 17 database replayed all 30 migrations.
- All 30 pgTAP files passed before release hardening. The focused file now contains 102 assertions, adding direct authenticated-RPC rejection for unsupported, disguised, and malformed legacy definitions; valid three-kind legacy publication/materialization; and accepted-case operation while rollout is disabled. Exact-head CI must replay this updated database suite.
- `scripts/verify-reward-capacity-concurrency.mjs` raced two independent sessions for the last global reward unit. Exactly one committed, retry stayed idempotent, and counters reconciled.
- The PHP runtime smoke covers restricted percentage, free shipping, free product, and invalid topic/version inputs.
- Contracts pass 105 tests and the dashboard passes 110 tests, including offset ordering and rollback queue visibility. Repository lint, all workspace typechecks/tests, architecture/deployment/entitlement/accessibility/WooCommerce validators, and the production build pass serially on Windows. Docker-backed replay is delegated to exact-head CI because the local container engine is unavailable.

## Remaining M04 evidence

- Complete PHP/WooCommerce minimum/current, HPOS/legacy, Blocks/classic matrix.
- Desktop/mobile browser, keyboard, accessibility, slow/offline, and recovery review.
- Exact-head CI, disabled production deployment, Starfiniti canary, reconciliation, and module score.
