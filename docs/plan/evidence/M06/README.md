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
- ADR-0020 and M06-S05 add an Auth-derived customer share/progress/history projection, a tenant-derived fact-sourced merchant funnel, honest metric boundaries, independently degradable reads, and responsive customer/merchant experiences.
- M06-S05 exact-head run `31770764870` passes baseline, both images, a clean 41-migration replay, all 35 pgTAP files with 1,700 assertions including 151 focused referral assertions, all three concurrency probes, 126 dashboard tests, 136 contract tests, 14 accepted ADRs, and all four WooCommerce runtime cells. Production-build browser review passed desktop/mobile, keyboard, copy/share fallback, mobile navigation, contained table overflow, and zero diagnostics.

## Open gates

M06-S06 now has a fail-closed machine gate in [`canary.yaml`](canary.yaml), validated during `npm run check`. It requires 48 unique minimized checks, nine named production artifacts, exact score arithmetic, at least 90/100 overall, at least 80% in every category, four explicit approvals, completed prerequisite slices, no failed or pending check, and matching completed task state before it can claim completion. Verified artifacts are unique, safe bounded JSON files under the M06 evidence root with exact SHA-256 digests, exact check and [semantic detail contracts](ARTIFACT_CONTRACT.md), the exact candidate commit, and minimized contents. The provisional score is 90/100, but operability is 3/10 and below its mandatory 8/10 floor.

The validator binds approved attribution/cooling/fraud/value/retention policies and numeric ceilings to the canary, released images/plugin/contracts to the exercised build, and all first-attribution, risk, give/get, refund, review, recovery, customer, merchant, privacy, tenancy, and checkout evidence and counts to reconciliation and observation. Canonical UTC chronology requires prerequisites before canary, reconciliation and rollback after it, at least 24 hours of covering observation, and final approval bound to every artifact. Positive and adversarial fixtures reject hollow/extra evidence, impossible time, current-production reuse, nonzero differences or self-referral value, changed policy/ceiling/plugin/evidence/counts, late prerequisites, early rollback, observation drift, and short observation.

- Approved exact release and real pilot store
- Fresh production recovery point and disabled deployment
- Starfiniti-only canary, full attribution/value/fraud reconciliation, rollback, observation, and final category-floor scoring
