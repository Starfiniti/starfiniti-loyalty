# ADR-0020: Auth-derived referral experience and fact-sourced funnel

- Status: Accepted
- Date: 2026-08-14
- Decision owners: Starfiniti Loyalty engineering
- Related modules: M06, M09, M10, M13
- Superseded in part: ADR-0036 supersedes only the prohibition on a later strict server-side aggregate; the dedicated referral projection, authority, privacy, and rollout decisions remain active.

## Context

Customers need a unique referral URL, a clear explanation of both rewards, and progress/history after friends use the URL. Merchants need a useful funnel, recent referral history, advocate performance, and the existing fraud-review operations. Smile, LoyaltyLion, and Yotpo all expose referral links in signed-in customer surfaces and referral/customer history in merchant administration. Their current official documentation also reinforces that referral completion depends on the referred customer's qualifying purchase rather than the advocate merely pressing a share button.

Starfiniti currently observes link creation, canonical order attribution, immutable state transitions, qualification, two-sided ledger issuance, compensation, and review. It does not observe a customer copying a URL, sending it through another application, or a recipient opening it before WooCommerce captures the opaque code on a canonical order. Rendering prototype share, click, signup, or revenue numbers would therefore create false product evidence. The customer experience must also avoid exposing a friend's identity or order reference, while merchant reporting may show bounded display references and canonical order references under a live tenant role.

The existing `get_my_loyalty_accounts()` projection is a stable balance/reward boundary used by customer self-service. Expanding it with an independently evolving referral object would couple two modules and complicate rollback. Direct table RLS would expose internal identifiers and require customer-specific policies across immutable and private referral tables.

## Decision

Add a dedicated no-selector `loyalty.get_my_referral_experiences_v1()` projection. It derives the Auth subject, active customer link, organization, programme, published referral policy, entitlement, advocate, current transitions, and bounded history inside PostgreSQL. The browser supplies no organization, programme, customer, advocate, or friend selector. The result contains only the linked account public ID, sharing state, canonical HTTPS referral URL when active, published policy explanation, reconciled current-state counts, and at most 20 history rows without friend identity, order reference, risk signal, or fingerprint.

Keep link creation as the existing resource-selector command. The caller may submit only the public linked-account ID and request ID; PostgreSQL still derives and verifies the Auth-linked customer. A paused rollout or disabled advocate removes the URL and blocks new link creation while preserving accepted counts and history.

Add `loyalty.get_referral_dashboard_v1(programmeId, lookbackDays)` for live owner, admin, operator, marketer, analyst, or auditor roles. PostgreSQL derives organization and programme group from the public programme selector and membership. It reports active advocates; reconciled attributed, pending, qualified, rejected, and reversed counts; issued advocate/friend points; top advocates; and recent canonical referrals. It does not report shares, clicks, signup conversion, influenced revenue, or acquisition cost until a later canonical fact contract exists for each metric.

Join the two dedicated projections to the existing customer and merchant server read models after strict versioned contract parsing. Customer copy/share interaction is progressive enhancement: the HTTPS URL remains selectable, while clipboard and native-share controls are optional. The customer experience never performs a synchronous hub call from WooCommerce checkout.

## Alternatives considered

1. Append referral JSON to `get_my_loyalty_accounts()`. Rejected because it couples balance/reward availability to an independently gated module and makes rollback of referral UI riskier.
2. Grant customer RLS reads over advocate, attribution, transition, and issuance tables. Rejected because internal keys, friend relationships, source orders, risk codes, and private issuance joins are broader than the customer needs.
3. Record client-side copy/share button presses as funnel facts. Rejected because browser events are forgeable and cannot prove delivery or a recipient click; they would create vanity metrics rather than commerce evidence.
4. Show the prototype's shares, clicks, signup, revenue, and CAC values from placeholders. Rejected because no canonical facts currently support them.
5. Use separate Auth-derived customer and tenant-derived merchant projections over immutable facts. Accepted because privacy, role boundaries, reconciliation, metric honesty, and rollback remain independently testable.

## Security and integrity effects

- Customer projection accepts no selector and returns only active Auth-linked accounts. Cross-customer and merchant-only identities receive no customer referral history.
- Merchant projection accepts a public programme selector and bounded window only. Organization and programme group are database-derived; cross-tenant access fails closed.
- Raw tables retain no browser `SELECT`. Risk fingerprints, friend identity/order details, and internal keys never enter the customer contract.
- Every count maps each attribution's latest immutable transition into exactly one pending, qualified, rejected, or reversed bucket. Contract parsing rejects unreconciled totals.
- Issued-point metrics come from immutable referral issuance facts. No UI event can create or alter ledger value or merchant performance facts.

## Operations

Monitor projection errors, count-reconciliation failures, history truncation, active-link creation failures, paused/disabled sharing states, and dashboard query latency for the supported 1-365 day window. Customer history must remain readable while rollout is paused. Merchant UI must define each metric next to the value and explicitly label the dashboard as canonical order-attribution performance.

Current competitor references used for this slice:

- [Smile referral flow and customer-panel sharing](https://help.smile.io/en/articles/4036289-understand-how-referrals-work)
- [LoyaltyLion customer referral history](https://help.loyaltylion.com/en/articles/1965801-managing-customers)
- [Yotpo link-based referral programme](https://support.yotpo.com/docs/setting-up-your-referral-program)

## Migration and rollback

Deploy the additive functions and contracts while referral entry remains disabled in production. Run no-selector customer isolation, tenant-role, count reconciliation, paused/disabled link, bounded history, and no-fabricated-metric tests before enabling the pilot.

Rollback may remove the new customer and merchant screens or pause new referral entry. It must not delete advocates, attributions, transitions, qualification, jobs, issuance, compensation, or review evidence. Accepted customer and merchant history remains available to a forward-fixed projection, and checkout remains independent throughout.
