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

## Executed verification

- A clean PostgreSQL 17 database replayed all 30 migrations.
- All 30 pgTAP files passed, including 90 expanded-reward assertions for grants, RLS, entitlement denial, invalid configuration, direct publication, native and manual reservation/capacity, capability negotiation, role separation, exact capture/release, immutable history, and idempotency conflicts.
- `scripts/verify-reward-capacity-concurrency.mjs` raced two independent sessions for the last global reward unit. Exactly one committed, retry stayed idempotent, and counters reconciled.
- The PHP runtime smoke covers restricted percentage, free shipping, free product, and invalid topic/version inputs.
- Contracts pass 95 tests. Dashboard server parsing and mutation boundaries pass their focused tests; dashboard typecheck, lint, and production build pass.

## Remaining M04 evidence

- Complete PHP/WooCommerce minimum/current, HPOS/legacy, Blocks/classic matrix.
- Desktop/mobile browser, keyboard, accessibility, slow/offline, and recovery review.
- Exact-head CI, disabled production deployment, Starfiniti canary, reconciliation, and module score.
