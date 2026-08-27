# GA canary and approval

This runbook defines the only path from a release candidate to a Starfiniti Loyalty general-availability claim. Repository readiness does not authorize a deployment, a production mutation, a public claim, or owner approval.

## Preconditions

1. Select one immutable reviewed release. Record its Git commit, image digests, connector package digest, migration manifest digest, configuration digest, and every M15 prerequisite evidence digest.
2. Close M00 through M14 and M15-S01 through M15-S05. A provisional score or passing repository test cannot replace a live module closeout.
3. Confirm zero unresolved Critical or High security, tenancy, ledger, privacy, recovery, data-loss, or checkout finding.
4. Obtain a named release window, one Starfiniti pilot tenant, rollback authority, value-integrity owner, security owner, operations owner, product owner, and an independent reviewer. Identities and contact routes remain outside Git.
5. Create a fresh recovery point and verify the tested rollback path before exposure.

## Window rules

- The measured canary is at least 30 consecutive 24-hour periods in UTC on one approved Starfiniti pilot tenant.
- The release, migrations, entitlement catalogue, value contracts, and monitoring contract remain fixed for the measured window. A material change starts a new window.
- Any unresolved Critical or High finding, unexplained value difference, cross-tenant access, duplicate effect, data loss, or synchronous checkout dependency fails the window. Fixing the problem does not preserve the elapsed days; start a new window on the corrected immutable release.
- A monitoring gap, missing daily record, stale source, disabled protected alert, or incomplete reconciliation is unknown, not healthy. Restore evidence and start a new complete window when the gap prevents reconstruction.
- Billing state cannot suppress protected paths, monitoring, or canary evidence.

## Daily evidence

For every UTC day, retain one digest-bound minimized observation with:

- exact release and configuration identity;
- request, error, latency, queue, worker, database, WAL, backup, and monitoring coverage aggregates;
- immutable ledger, wallet, lot, tier, reward reservation, coupon, inbox, outbox, dead-letter, and connector reconciliation differences;
- tenant-boundary, privacy, checkout-dependency, data-loss, and ambiguous-provider counters;
- WooCommerce award, release, redemption, coupon, refund, expiry, referral, campaign, notification, API, import, identity, and billing/usage outcomes applicable to the pilot;
- incident references by opaque digest and the closure state, without customer, tenant, order, coupon, credential, payload, or contact data.

All protected differences are zero. Daily observations are append-only; corrections add a superseding record and retain the failed original.

## Exposure and rollback

1. Deploy disabled and prove public baseline, migration registration, image identity, self-hosted no-call behavior, checkout independence, monitoring, and rollback readiness.
2. Enable only the approved Starfiniti tenant. Do not use browser, WordPress, email, domain, identity-provider group, billing, or entitlement metadata as tenant or value authority.
3. Exercise normal value paths, provider outages, worker interruption, queue recovery, refund/reversal, and native checkout independence within approved non-destructive windows.
4. Perform one rollback rehearsal before the measured window and one production rollback decision exercise during it. The exercise may conclude “do not roll back,” but must prove decision authority, commands, recovery point, and reconciliation.
5. Roll back immediately on a deterministic failure. Preserve accepted events and immutable value, continue refunds/releases/redemption/reconciliation/account access/exports/checkout, and forward-fix schema changes.

## Final reconciliation and claims

After the thirtieth complete day, an independent reviewer reconciles every canonical event, immutable effect, wallet/lot/tier/reward projection, native WooCommerce coupon, referral, campaign, notification, analytics aggregate, API/webhook effect, import batch, identity lifecycle action, usage fact, and invoice applicable to the pilot. Every difference is zero or the gate fails.

Review every entry in `docs/product/GA_CLAIMS.yaml` against the exact release evidence. Only claims whose required checks pass may become publishable. Shopify, additional languages, store credit, gift cards, cash redemption, and other cash-like stored value remain explicit limitations.

GA requires:

- all evidence checks passed;
- M15 at least 90/100 and every category at least 80% of its weight;
- the whole-product score at least 90/100 with its category floors;
- no unresolved Critical or High issue;
- SLO, capacity, RPO, and RTO claims bound to current evidence;
- named operational ownership and incident routing;
- independent reconciliation and claims review;
- explicit product, engineering, security, operations, value-integrity, and owner approvals.

Failed and superseded evidence is retained. Approval never rewrites an incident, finding, score, or reconciliation result.

## Repository verification

Run `npm run ga:validate`. The validator accepts an in-progress manifest with honest pending gates and rejects any completion claim with a short or discontinuous window, material drift, missing module closeout, stale prerequisite evidence, unsafe artifact, nonzero protected difference, unpublished evidence-backed claim, score-floor failure, unresolved finding, or missing approval.
