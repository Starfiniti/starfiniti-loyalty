# ADR-0016: First referral attribution with minimized risk evidence

- Status: Accepted
- Date: 2026-08-14
- Decision owners: Starfiniti Loyalty engineering
- Related modules: M06, M08, M09, M10

## Context

Referral value depends on an attribution decision made before the referred order qualifies. That decision must survive duplicate, delayed, and reordered WooCommerce events without allowing a browser, email address, cookie, or network address to select a tenant, customer, advocate, wallet, or point amount. It must also detect clear self-referral and route uncertain reuse or velocity signals to review without building a long-lived plaintext identity graph.

Current competitor documentation consistently uses the referred customer's first eligible purchase, an attribution/cooling period, caps, and fraud review. Smile documents IP volume, similar identity, first-order, and manual block/review controls. LoyaltyLion documents a friend first purchase, an approval period, minimum spend, monthly caps, and IP self-referral controls. Yotpo documents first-purchase qualification, minimum spend, IP/user-agent comparison, duplicate attribution, return reversal, and manual completion.

References reviewed on 2026-08-14:

- [Smile referral fraud prevention](https://help.smile.io/en/articles/4036291-preventing-referral-fraud)
- [LoyaltyLion refer-a-friend activity](https://help.loyaltylion.com/en/articles/1965586-activity-refer-a-friend)
- [Yotpo referral-program migration behavior](https://support.yotpo.com/docs/migrating-to-the-new-referral-program)
- [Yotpo referral monitoring and management](https://support.yotpo.com/docs/monitoring-and-managing-customer-referrals)

## Decision

Add an optional strict `ReferralPolicyV1` to `ProgrammeDefinitionV2`. It versions the 1–90 day attribution window, qualifying WooCommerce status, cooling period, minimum eligible spend, monthly advocate cap, points-only advocate/friend rewards, and bounded manual-review risk policy. Definitions without a referral policy retain their existing meaning. Database publication independently validates and materializes the immutable policy, and the separate `referrals` entitlement gates new policy use.

One active Auth-linked customer receives one random UUID advocate code per organization/programme group. The customer command accepts only the linked account public ID and request UUID. PostgreSQL derives Auth subject, active customer link, tenant, store, programme, published policy, and entitlement. The returned HTTPS share URL contains only the WooCommerce origin and `stf_ref=<opaque UUID>`; it contains no customer, organization, channel identity, email, or signed authority.

The WooCommerce plugin captures the code locally and never calls the hub during page render or checkout. At order construction it records the code and capture instant plus purpose-separated HMAC-SHA-256 fingerprints. The network fingerprint uses only the direct peer address, not untrusted forwarding headers. Device evidence uses a bounded user-agent string; payment evidence uses saved token identifiers plus method; shipping evidence uses a normalized address. Raw IP, user agent, payment, address, email, and name do not leave WordPress. Order events remain signed, durable, asynchronous, and checkout-independent.

PostgreSQL resolves the friend only from the canonical event's exact connection-scoped registered or guest identity. It resolves the advocate only from the opaque code under the same tenant and programme group. A transaction-scoped advisory lock serializes the friend/programme-group decision. The first eligible advocate wins; an exact retry returns the same fact, and a different later advocate cannot replace it. Deterministic self-referral enters `blocked`. Allowlisted velocity or evidence reuse enters `pending_review` when review is enabled. Every accepted decision is an immutable attribution plus append-only transition.

Fingerprint evidence is private, connection-keyed, and retained only for the configured 1–720 hour window. Public/customer tables store only allowlisted reason codes. A bounded worker purge deletes expired fingerprint rows. Attribution itself creates no ledger value. ADR-0017 defines historical qualification and value-neutral cooling; points issuance, post-issuance refund compensation, and merchant review remain later M06 slices and must use the normal immutable ledger and audited transition boundaries.

## Alternatives considered

1. Query the hub during referral click, cart, or checkout. Rejected because it would make conversion and checkout depend on central availability and expose an online tracking surface.
2. Send raw IP, user agent, email, payment, and shipping identity to a central fraud graph. Rejected because the initial controls need equality/velocity evidence, not plaintext identity, and long-lived central PII would exceed the declared purpose.
3. Trust a browser-submitted advocate/customer/tenant tuple. Rejected because browser input is not identity or value authority.
4. Last-click attribution until qualification. Rejected because delayed events and code changes could steal an existing attribution and make replay order affect value.
5. First eligible, database-serialized attribution from signed WooCommerce evidence. Accepted because it is deterministic, replay-safe, tenant-derived, and compatible with offline checkout.
6. Automatically reject every risk signal. Rejected because shared households, devices, networks, payment methods, or addresses are ambiguous. Only deterministic self-referral blocks automatically; uncertainty remains reversible review state.

## Security and integrity effects

- Auth/customer links and canonical connection identities derive all tenant, advocate, and friend authority.
- UUID codes are identifiers, not bearer authorization and reveal no channel identity.
- Signed canonical events, friend-scoped locking, unique constraints, and event/effect fences make replay and competing attribution idempotent.
- Raw network, device, payment, shipping, name, email, and address data never enter hub payloads or logs.
- Risk fingerprints are purpose-separated keyed digests, private to workers, bounded in retention, and excluded from customer/merchant projections.
- Attribution issues no value. Later reward effects must remain exact, double-entry, reversible, and refund-aware.

## Operations

Metrics distinguish created, duplicate, conflicting, outside-window, unknown-advocate, feature-disabled, blocked, and pending-review outcomes without fingerprint values. Alerts cover oldest unprocessed referral event, purge lag, review backlog, duplicate/conflict rate, and attribution-to-qualification delay. Operators can disable new referral policy publication, link creation, and attribution through the database-authoritative entitlement while accepted history remains inspectable.

## Migration and rollback

Deploy the additive contract, policy/attribution tables, connector capture, and worker path while `referrals` is disabled. Upgrade WooCommerce first; old order events simply omit referral evidence and remain compatible. Enable one Starfiniti tenant only after clean replay and runtime-matrix evidence.

Rollback disables new referral authoring, link requests, and attribution. It does not delete advocate codes, accepted attributions, transitions, or later ledger effects. Existing accepted value and review work remain readable and must be reconciled through forward fixes. Expired private fingerprint evidence continues to purge; immutable attribution history is never rewritten.
