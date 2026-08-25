# ADR-0037: Demand-driven WooCommerce snapshots and classic placements

- Status: Accepted
- Date: 2026-08-25
- Module: M09 storefront and customer experience
- Extends: ADR-0036

## Context

ADR-0036 selects asynchronously delivered, durable, PII-free WooCommerce
snapshots and prohibits a render-time Hub dependency. It does not decide how
the Hub discovers which of a store's potentially millions of customers needs a
refresh, how an older connector avoids leasing an unknown command, or how the
plugin scales its durable WordPress storage.

A periodic full-tenant scan would spend database and connector capacity on
customers who are not visiting the store. A single option containing every
customer would create an unbounded read-modify-write object and make concurrent
refreshes contend. Render-time HTTP would make DNS, TLS, Auth, database, and Hub
availability part of product, cart, and checkout rendering.

Current official guidance supports the selected boundaries:

- WooCommerce recommends using existing lifecycle hooks rather than template
  overrides and warns against using filters as feature flags:
  <https://developer.woocommerce.com/docs/extensions/core-concepts/adding-actions-and-filters/>
- WooCommerce's classic-theme guidance prefers hooks because template
  overrides carry ongoing compatibility cost:
  <https://developer.woocommerce.com/docs/theming/theme-development/classic-theme-developer-handbook>
- WordPress documents that `update_option` can disable autoload for data used
  only on specific routes and warns that excessive autoload harms performance:
  <https://developer.wordpress.org/reference/functions/update_option/>
- WordPress requires plugins to include their stored personal data in the
  exporter/eraser lifecycle:
  <https://developer.wordpress.org/plugins/privacy/adding-the-personal-data-eraser-to-your-plugin/>

## Decision

1. A logged-in classic placement performs only local reads. If its snapshot is
   missing or past `refreshAfter`, it adds the numeric WordPress customer ID to
   a bounded durable pending option. It does not make an HTTP request.
2. The next scheduled signed connector poll advertises
   `customer_experience.snapshot.v1` and submits at most 25 unique numeric local
   selectors. The request contract rejects selectors unless that capability is
   present.
3. PostgreSQL binds the signed connection to its organization and resolves each
   selector through that connection's registered identity. It derives the
   programme, wallet, exact balances, expiry, tier, earning summaries, rewards,
   affordability, and presentation entitlement. Unknown selectors return no
   row and reveal no cross-connection state.
4. PostgreSQL creates one bounded command with a monotonic per-customer
   revision. Existing pending, processing, or retryable work is returned as a
   duplicate. The established lease and acknowledgement state machine remains
   authoritative for delivery evidence.
5. Older connectors cannot claim the new topic. The command is eligible only
   when the poll advertises the exact snapshot capability.
6. The plugin validates the complete schema, exact values, freshness order,
   affordability, size, local customer existence, and revision before storage.
   An invalid, conflicting, or older revision never replaces the last known
   good snapshot.
7. Each customer snapshot uses its own non-autoloaded plugin option. A separate
   bounded pending option contains only local numeric customer IDs and request
   times. This avoids one unbounded store-wide object and keeps ordinary
   WordPress startup from loading customer snapshots.
8. My Account exposes core locally cached value even when enhancements are
   disabled. Product, cart, classic checkout, and post-purchase placements
   require the database-authored enhancement flag. Stale content never shows a
   balance; it shows generic refresh guidance and the local account route.
9. Classic placements use official WooCommerce hooks, semantic PHP markup, and
   the theme's existing styles. The slice has explicit budgets of zero
   connector JavaScript, zero connector CSS, zero render-time Hub calls, 48 KiB
   combined storefront PHP source, 32 KiB per snapshot, ten projected rewards,
   and 25 requested customers per poll.
10. The WordPress privacy exporter includes the local summary, and erasure,
    user deletion, and explicit data-removing uninstall delete it. Canonical
    ledger and undelivered value evidence retain their existing policies.

## Alternatives

### Periodically rebuild every customer in each tenant

Rejected. It has predictable timing but database, outbox, network, and
WordPress write volume scale with all historical customers rather than active
storefront demand. It also repeats the same full-store amplification pattern
that the platform's bounded workers are designed to avoid.

### Ask the Hub during product, cart, checkout, or account rendering

Rejected. It gives fresher data but makes storefront latency and availability
depend on a remote service and expands the browser-facing customer-data
boundary.

### Store all customer snapshots in one option

Rejected. A global serialized map becomes unbounded, contended, expensive to
rewrite, difficult to erase per subject, and risky to autoload accidentally.

### Store display data in user metadata

Viable, but not selected. Per-user metadata has convenient privacy ownership,
yet the connector's data is connection-owned integration state rather than a
WordPress profile attribute. A namespaced non-autoloaded option preserves that
boundary while remaining independently erasable.

## Security and integrity effects

- The browser cannot sign a poll or choose a tenant. PostgreSQL derives tenant,
  connection, customer, programme, wallet, and value authority.
- Numeric local customer IDs are channel selectors, not contact or identity
  merge evidence. Email, names, addresses, raw rule selectors, tenant IDs,
  coupons, secrets, fingerprints, and ledger metadata are absent.
- Cached data is presentation only. It cannot reserve points, redeem value,
  issue or capture a coupon, qualify a tier, or mutate the ledger.
- Exact string-form points remain within PostgreSQL bigint capacity in every
  contract and PHP comparison. JavaScript number coercion is not involved.
- Capability negotiation prevents an old plugin from dead-lettering a command
  it cannot understand. Database grants prevent customer, worker, and browser
  roles from constructing or enumerating snapshot state.
- Same-revision/different-content commands fail closed. Older commands retain
  the newer local projection, and duplicate commands acknowledge idempotently.

## Operations

- Snapshot generation is demand-driven by storefront reads and occurs during
  the existing one-minute Action Scheduler poll.
- `refreshAfter` is 15 minutes and `staleAfter` is 24 hours. A stale snapshot
  may remain stored for recovery evidence but does not render its value.
- Delivery uses the existing ten-attempt bounded command lifecycle and visible
  connector issue reporting. Native coupon and checkout behavior is unchanged.
- Runtime-matrix evidence must cover minimum/current WordPress, WooCommerce,
  PHP, HPOS/legacy, all five classic placements, strict revision behavior,
  privacy export/erasure, bounded markup, and a forced Hub outage.

## Migration and rollback

The database change is additive: one private delivery-state table, a private
builder/queue function, and a capability-aware extension of the existing claim
function. The HTTP poll fields default to empty, so old clients remain valid.
The plugin adds a new class and non-autoloaded options without changing its
value-bearing outbox or native coupon metadata.

Rollback stops snapshot queueing and removes the four enhanced placement hooks.
The last valid local option, hosted claim link, My Account core path, native
coupons, durable commerce outbox, and all canonical value remain intact. A
forward fix may supersede the private functions and contract version; deployed
snapshot state is not rewritten and ledger history is never involved.
