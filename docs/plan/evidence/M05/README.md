# M05 evidence index

M05 is in progress. Evidence will be added per slice without treating implementation as deployment proof.

## Current evidence

- ADR-0014 records the event-time, versioned-policy, timezone, compatibility, and rollback decisions.
- M05-S01 completed the strict policy contract, pure event-time evaluator, independent publication validation, and Rose/Bloom/Icon migration proof. Exact-head run `31750684991` passed the full repository, clean 31-migration/31-pgTAP replay, concurrency, container, and four WooCommerce runtime gates at commit `f8db7ae`.
- M05-S02 completed immutable qualification facts, independently checked automatic decisions, original-event-time refund compensation, and worker integration. Exact-head run `31751858746` passed the full repository, clean 32-migration/31-pgTAP replay, containers, and all four WooCommerce runtime cells at commit `17c3bd4`.
- M05-S03 locally implements executable tier multipliers, fulfilment-bound tier reward access, reason-bound owner/admin overrides, underlying automatic qualification while effective membership is pinned, and a bounded exactly-once expiry sweep. Contracts, domain, worker, TypeScript, unit, and static 33-migration validation pass; the expanded 122-assertion tier suite still requires exact-head database CI.

## Open gates

- Exact-head database replay and adversarial review of M05-S03 benefits and overrides
- Expiry administration, preview, notification, and liability evidence
- Merchant and customer progression browser/accessibility evidence
- Shadow comparison, disabled deployment, Starfiniti canary, reconciliation, and module score
