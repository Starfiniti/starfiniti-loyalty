# M05 evidence index

M05 is in progress. Evidence will be added per slice without treating implementation as deployment proof.

## Current evidence

- ADR-0014 records the event-time, versioned-policy, timezone, compatibility, and rollback decisions.
- M05-S01 completed the strict policy contract, pure event-time evaluator, independent publication validation, and Rose/Bloom/Icon migration proof. Exact-head run `31750684991` passed the full repository, clean 31-migration/31-pgTAP replay, concurrency, container, and four WooCommerce runtime gates at commit `f8db7ae`.
- M05-S02 completed immutable qualification facts, independently checked automatic decisions, original-event-time refund compensation, and worker integration. Exact-head run `31751858746` passed the full repository, clean 32-migration/31-pgTAP replay, containers, and all four WooCommerce runtime cells at commit `17c3bd4`.
- M05-S03 completed executable tier multipliers, fulfilment-bound tier reward access, reason-bound owner/admin overrides, underlying automatic qualification while effective membership is pinned, and a bounded exactly-once expiry sweep. Exact-head run `31753641793` passed the full repository, clean 33-migration replay, all 31 pgTAP files with 1,424 assertions including 122 focused VIP assertions, containers, and all four WooCommerce runtime cells at commit `2b48b1c`.
- M05-S04 implementation now contains `PointExpiryPolicyV2`, immutable published policy, version-scoped earned-date expiry, original-lot restoration handling, nearest-relevant 30/14/7 reminder fences, a bounded single-flight worker sweep, and minimized merchant liability reporting. Contract (116), worker (16), dashboard (110), and domain (42) unit suites plus all workspace typechecks, lint, production builds, migration/workflow/deployment/pilot/entitlement/architecture/accessibility/WooCommerce validators, and secret scanning pass locally. The clean 34-migration/32-pgTAP replay with 48 new focused assertions remains pending exact-head CI; no database-pass claim is made yet.

## Open gates

- Exact-head clean database replay and browser evidence for expiry administration/preview
- Merchant and customer progression browser/accessibility evidence
- Shadow comparison, disabled deployment, Starfiniti canary, reconciliation, and module score
