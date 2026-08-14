# M06 evidence index

M06 is in progress. Attribution, qualification, and cooling are deliberately value-neutral until the give-get ledger slice passes.

## Current evidence

- ADR-0016 records first-attribution, offline WooCommerce capture, privacy-minimized risk evidence, reversible review, and rollback decisions against current official Smile, LoyaltyLion, and Yotpo behavior.
- M06-S01 adds the strict referral policy, one opaque customer-bound advocate code, signed WooCommerce evidence, database-derived first attribution, deterministic self-referral blocking, reversible risk routing, and entitlement rollback. Exact-head run `31763563259` passed 37 migrations, 33 pgTAP files with 1,549 assertions, both images/probes, and all four WooCommerce runtimes.
- ADR-0017 and M06-S02 bind qualification to the attributed historical programme, reuse the exact evaluator, independently enforce paid status/minimum/new-customer rules, append event-time cooling or rejection, retain review holds, and reject value-neutral refunds.
- Local S02 verification passes 19 worker tests, worker typecheck, 38 migration/34 pgTAP static validation, architecture validation, and diff checks. Exact S02 database replay remains pending.

## Open gates

- Exact-head clean database replay including the new 42-assertion qualification/cooling suite
- Exactly-once advocate/friend ledger issuance plus refund/rejection compensation
- Audited merchant fraud review and minimized customer/merchant experiences
- Browser/accessibility evidence, disabled deployment, Starfiniti canary, reconciliation, and module score
