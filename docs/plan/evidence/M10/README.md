# M10 Evidence — Analytics

Status: in progress. M10-S01 metric dictionary and exact value-truth reporting is active while M09 waits only on its reviewed production canary gate.

## Reconstructed baseline

- `MerchantOverviewReportV1` exposes member count, eligible spend, repeat-member rate, captured-to-awarded redemption rate, outstanding points, and a UTC daily member series. It preserves exact integers as text and passed the existing tenant/grant/large-integer database gate.
- The current Overview labels outstanding points as “liability” but has no immutable monetary valuation policy. M10 will retain the exact point exposure and will not present currency liability or an accounting provision by inferring Rosy Rewards' 100-points-per-euro acceptance configuration globally.
- `loyalty_private.programme_liability_report` is worker-only and reads wallet balance projections. It is useful as an operational cross-check, not as historical flow authority.
- Immutable ledger transactions and entries contain award, release, reserve, capture, cancel, expire, refund-reversal, and manual-adjustment facts. Point lots and allocations retain earned-date expiry and unresolved reservation exposure.
- PostgreSQL remains the analytical source for M10. There is no measured capacity evidence that justifies a warehouse, cache, or mutable aggregate truth table.

## S01 decisions and evidence targets

- ADR-0040 selects an immutable-ledger-sourced, versioned on-demand report with projection cross-checks, UTC half-open V1 periods, exact decimal strings, and explicit causal labels.
- The first dictionary publishes only implemented metrics. Candidate business metrics are recorded in `docs/api/ANALYTICS.md` and enter a later dictionary version only with executable source/formula/reconciliation evidence.
- Exact point exposure and flows are operational loyalty obligations. Monetary liability remains unavailable until an explicit immutable valuation policy exists; a reward catalogue or merchant-specific acceptance ratio is not substituted.
- S01 completion requires contracts, additive PostgreSQL, pgTAP, server parsing, merchant-visible definitions, independent reconciliation, exact-head CI, and documented limitations.
