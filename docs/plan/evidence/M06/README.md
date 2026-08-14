# M06 evidence index

M06 is in progress. The referral path now remains value-neutral through attribution and cooling, then issues or compensates both sides atomically after qualification.

## Current evidence

- ADR-0016 records first-attribution, offline WooCommerce capture, privacy-minimized risk evidence, reversible review, and rollback decisions against current official Smile, LoyaltyLion, and Yotpo behavior.
- M06-S01 adds the strict referral policy, one opaque customer-bound advocate code, signed WooCommerce evidence, database-derived first attribution, deterministic self-referral blocking, reversible risk routing, and entitlement rollback. Exact-head run `31763563259` passed 37 migrations, 33 pgTAP files with 1,549 assertions, both images/probes, and all four WooCommerce runtimes.
- ADR-0017 and M06-S02 bind qualification to the attributed historical programme, reuse the exact evaluator, independently enforce paid status/minimum/new-customer rules, append event-time cooling or rejection, retain review holds, and reject value-neutral refunds.
- M06-S02 exact-head run `31764805380` passes baseline, both images, a clean 38-migration replay, all 34 pgTAP files with 1,592 assertions including the 43 focused qualification/cooling assertions, both concurrency probes, and all four WooCommerce runtime cells.
- ADR-0018 and M06-S03 add a bounded leased cooling queue, atomic advocate/friend award-release pairs, historical expiry lots, immutable tier evidence, ten-attempt manual review, and atomic two-sided refund compensation.
- M06-S03 exact-head run `31766887239` passes baseline, both images, a clean 39-migration replay, all 34 pgTAP files with 1,635 assertions including 86 focused referral qualification/cooling/ledger assertions, all three concurrency probes including the dedicated two-worker referral race, and all four WooCommerce runtime cells.
- ADR-0019 and M06-S04 add an Auth-derived, reason-bound, idempotent risk decision command; a fingerprint-free merchant review projection; immutable merchant/audit evidence; and at most four reviewed ten-attempt recovery cycles for atomic internal jobs.
- M06-S04 exact-head run `31768294674` passes baseline, both images, a clean 40-migration replay, all 34 pgTAP files with 1,668 assertions including 119 focused referral assertions, all three concurrency probes, 115 dashboard tests, 132 contract tests, the `/referrals` production route, and all four WooCommerce runtime cells.

## Open gates

- Customer sharing/progress/history; merchant funnel/history; browser/accessibility evidence; disabled deployment; Starfiniti canary; reconciliation; and module score
