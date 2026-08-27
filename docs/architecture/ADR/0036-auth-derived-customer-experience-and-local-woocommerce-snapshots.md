# ADR-0036: Auth-derived customer experience and local WooCommerce snapshots

- Status: Accepted
- Date: 2026-08-25
- Module: M09 storefront and customer experience
- Supersedes: ADR-0020 only for server-side composition of its still-independent referral projection

## Context

The hosted customer account already composes balances, rewards, tier progress,
referrals, and activity from three authenticated database functions. The core
account container is cast in TypeScript rather than validated at runtime, and
the independent calls can observe different committed states. The public
loyalty page is strictly parsed but is intentionally generic. The WooCommerce
connector renders a hosted-account link and native coupon information from
local state; it has no customer progress placements on product, cart, checkout,
or post-purchase surfaces.

M09 must improve discovery without weakening these invariants:

- customer and tenant authority comes from the active Auth/customer link;
- balances, reservations, coupons, and ledger history remain available even
  when a commercial storefront feature is disabled;
- cached presentation cannot authorize value or a native benefit;
- classic and Blocks checkout render without a synchronous Hub dependency;
- customer-facing payloads contain no contact data, secrets, fingerprints,
  internal tenant identifiers, or raw rule selectors; and
- English is the only active language.

WooCommerce documents namespaced Store API extension data for product, cart,
cart-item, and checkout endpoints and warns that checkout data is public. Its
Cart and Checkout documentation requires JavaScript for Block front-end
extensions and exposes extension data to SlotFill components. WordPress
documents transients as an expiring cache whose entries can disappear before
their maximum lifetime. These constraints mean a transient may accelerate a
refresh, but it cannot be the only durable local snapshot or a value authority.

Official references:

- <https://developer.woocommerce.com/docs/apis/store-api/extending-store-api/available-endpoints-to-extend>
- <https://developer.woocommerce.com/docs/apis/store-api/extending-store-api/extend-store-api-add-data/>
- <https://developer.woocommerce.com/docs/block-development/extensible-blocks/cart-and-checkout-blocks>
- <https://developer.woocommerce.com/docs/block-development/reference/slot-fills>
- <https://developer.woocommerce.com/docs/best-practices/urls-and-routing/woocommerce-endpoints>
- <https://developer.wordpress.org/apis/transients/>

## Options considered

### Browser or render-time request to the Hub

This gives the freshest data and the smallest WordPress data store. It is
rejected because latency, DNS, TLS, Auth, or Hub failure would affect a store
surface and could affect checkout. It also creates a broader browser-facing
customer-data boundary.

### Generic public content only

This is simple and already partly available. It is rejected as the complete
experience because it cannot show affordability, progress, expiry, or
customer-specific referral state where customers make purchase decisions.

### Auth-derived hosted aggregate plus asynchronously delivered local snapshot

This provides one strict hosted contract and a bounded, PII-free WooCommerce
projection. The plugin persists a last-known-good snapshot in its own option,
may place a short-lived copy in the transient cache, and renders only local
data. Signed connector polling refreshes that snapshot away from request-time
rendering. This is selected.

## Decision

1. Add `CustomerLoyaltyExperienceV1`, a strict, bounded contract containing
   account state, exact string-form balances, earning methods, rewards,
   reservations, expiry, tier progress, referrals, and recent immutable
   activity. Affordability and reconciled nested state are validated.
2. Add an Auth-derived, no-selector PostgreSQL projection that creates the
   complete container in one statement snapshot by composing existing dedicated
   projections. The caller cannot supply an organization, customer, connection,
   workspace, programme, or account ID. The dedicated referral interface and
   its independent rollout remain compatible; this supersedes ADR-0020 only
   where it prohibited a later versioned composition boundary.
3. Resolve `storefront.experience` in PostgreSQL using the stable public account
   identifier. The result controls enhanced presentation only. It never removes
   balances, history, accepted reservations, redemption access, refunds,
   reconciliation, or native coupons.
4. Expose only safe earning summaries: public code and name, source, effect,
   cap, schedule, and a restriction indicator. Product/category/segment/tier
   selector values, exclusions, private evaluation traces, and customer facts
   remain private.
5. Deliver WooCommerce experience snapshots as versioned, signed, bounded,
   leased, idempotent connector commands. The plugin verifies and stores a
   last-known-good display projection locally. Invalid or older revisions do
   not replace it.
6. Local WooCommerce rendering uses the durable plugin option as the source and
   may use a transient only as a disposable acceleration layer. Missing or
   stale snapshots degrade to generic copy and the hosted-account link.
7. Classic placements use bounded PHP hooks. Block placements use official
   namespaced Store API extension data and reviewed SlotFill integration. Store
   API payloads contain no secrets, contact data, coupon plaintext, or authority
   to redeem.
8. The optional panel is a separate server-side capability with explicit gzip
   JavaScript and CSS budgets. It progressively enhances local markup and is
   not required for navigation, native coupons, or checkout.
9. Active customer-facing copy and document language are English. Stored legacy
   locale rows remain compatibility data and do not create a live switcher.

## Failure and security behavior

- Malformed aggregate containers fail closed at the Next.js server boundary;
  they are never partially trusted.
- An unavailable optional WooCommerce snapshot never blocks a request. Native
  coupons and checkout continue using WooCommerce state.
- A stale snapshot can understate or overstate display progress, so every local
  placement labels its refresh time and routes value actions to the hosted
  Auth-derived flow. It cannot mint or capture a coupon.
- Snapshot commands are rejected on signature, tenant/connection binding,
  revision, size, schema, or expiry failure. Failed delivery retains the prior
  valid snapshot.
- Store API extension callbacks always return bounded arrays and contain errors
  according to the WooCommerce extension contract.

## Rollout

Deploy the contract and read projection first. Keep enhanced hosted sections,
snapshot generation, placements, and the progressive panel disabled. Enable
the hosted experience for the Starfiniti tenant, then the local classic
placements, then Blocks data/SlotFill, and finally the optional panel. At every
step verify request traces contain zero render-time Hub calls.

## Rollback

Disable new snapshot generation and enhanced presentation. Retain the versioned
read interface, the last valid local snapshot, hosted account access, existing
My Account link, and native coupon behavior. Remove Block scripts and enhanced
PHP placements without deleting configuration, customer value, or connector
evidence. Use additive forward fixes for the database contract.

## Consequences

The experience can be temporarily stale but remains resilient and privacy
bounded. WordPress stores a small additional display projection and a reviewed
Blocks asset. The strict aggregate removes unsafe server casts and provides one
canonical input for hosted and connector projections without moving value
authority out of PostgreSQL.
