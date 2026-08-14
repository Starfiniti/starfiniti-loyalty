# M06 evidence index

M06 is in progress. Attribution is deliberately value-neutral until qualification, cooling, and give-get ledger slices pass.

## Current evidence

- ADR-0016 records first-attribution, offline WooCommerce capture, privacy-minimized risk evidence, reversible review, and rollback decisions against current official Smile, LoyaltyLion, and Yotpo behavior.
- M06-S01 adds the strict referral policy, one opaque customer-bound advocate code, signed WooCommerce evidence, database-derived first attribution, deterministic self-referral blocking, reversible risk routing, and entitlement rollback.
- Local verification passes lint, all workspace typechecks, 305 unit tests, 37 migration/33 pgTAP static validation, architecture validation, PHP syntax, and WooCommerce source/localization/storefront validation. Exact database replay and runtime-matrix evidence remain pending on draft PR #31.

## Open gates

- Exact-head clean database replay including 55 focused referral assertions and four WooCommerce runtime variants
- Qualification status, minimum spend, new-customer and cooling state machine
- Exactly-once advocate/friend ledger issuance plus refund/rejection compensation
- Audited merchant fraud review and minimized customer/merchant experiences
- Browser/accessibility evidence, disabled deployment, Starfiniti canary, reconciliation, and module score
