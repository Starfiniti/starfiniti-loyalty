# M05 evidence index

M05 is in progress. Evidence will be added per slice without treating implementation as deployment proof.

## Current evidence

- ADR-0014 records the event-time, versioned-policy, timezone, compatibility, and rollback decisions.
- M05-S01 completed the strict policy contract, pure event-time evaluator, independent publication validation, and Rose/Bloom/Icon migration proof. Exact-head run `31750684991` passed the full repository, clean 31-migration/31-pgTAP replay, concurrency, container, and four WooCommerce runtime gates at commit `f8db7ae`.
- M05-S02 completed immutable qualification facts, independently checked automatic decisions, original-event-time refund compensation, and worker integration. Exact-head run `31751858746` passed the full repository, clean 32-migration/31-pgTAP replay, containers, and all four WooCommerce runtime cells at commit `17c3bd4`.
- M05-S03 completed executable tier multipliers, fulfilment-bound tier reward access, reason-bound owner/admin overrides, underlying automatic qualification while effective membership is pinned, and a bounded exactly-once expiry sweep. Exact-head run `31753641793` passed the full repository, clean 33-migration replay, all 31 pgTAP files with 1,424 assertions including 122 focused VIP assertions, containers, and all four WooCommerce runtime cells at commit `2b48b1c`.
- M05-S04 completed `PointExpiryPolicyV2`, immutable published policy, version-scoped earned-date expiry, original-lot restoration handling, nearest-relevant 30/14/7 reminder fences, a bounded single-flight worker sweep, and minimized merchant liability reporting. Exact-head run `31756142529` passed the full repository gate at commit `26a4c12`, a clean 34-migration replay, all 32 pgTAP files with 1,472 assertions including 48 focused expiry assertions, both concurrency probes, both production images, and all four WooCommerce runtime cells.
- A temporary real Next.js production-build/Playwright fixture used the production merchant shell and `EarningRulesEditor` at 1440 by 1000 and 390 by 844. Changing expiry from 365 to 21 days disabled and removed the 30-day reminder while retaining 14 and 7 days; exact outstanding, 30-day, 90-day, affected-member, next-date, and reserved-past-expiry evidence rendered; mobile navigation opened and closed; both widths had zero horizontal overflow and no console warning, console error, or page error. The fixture and automation were removed after capture.

## Open gates

- Merchant and customer progression browser/accessibility evidence
- Shadow comparison, disabled deployment, Starfiniti canary, reconciliation, and module score
