# M09 Evidence — Storefront Experience

Status: in progress. M09-S01 is complete; M09-S02 is active. Desktop/mobile accessibility, performance budget, cache/offline behavior, plugin matrix, checkout-independence, and canary evidence remain required for module closure.

## S01 — Auth-derived customer experience contract

- Commit: `f531f82e2fcd78ab43ca5ac2d4d7e1247dec0b2c`
- Exact-head CI: [run 32839387263](https://github.com/Starfiniti/starfiniti-loyalty/actions/runs/32839387263)
- Result: baseline, dashboard and worker images, clean database replay, and all four minimum/current HPOS/legacy WooCommerce runtime cells passed.
- Database: 55 additive migrations and all 43 pgTAP files passed with 2,361 assertions. The focused read-model suite exercises Auth derivation, grants, live tenant membership, cross-account rejection, disabled-presentation behavior, bounded/minimized earning data, one-statement coherence, and zero ledger mutation.
- Application: the server consumes one `get_my_loyalty_experiences_v1` call, strictly parses every row, rejects duplicates and mismatched account identifiers, and fails closed on unauthenticated or malformed database responses.
- Contract: exact bigint text balances, reward affordability, bounds, identifiers, account states, earning summaries, expiry, tier, referral, reservation, and activity consistency are validated without browser-supplied tenant, customer, channel, wallet, or programme authority.
- Rollback: stop consuming the V1 aggregate and retain the compatible legacy projections. The additive function and old readers can coexist; rollback never removes ledger or customer value.

## Remaining

- S02 hosted seven-area member and guest experience.
- S03 local WooCommerce snapshot and classic placements.
- S04 Blocks data and progressively enhanced panel.
- S05 branding, accessibility, and outage hardening.
- S06 disabled deployment, Starfiniti canary, reconciliation, rollback, and score.
