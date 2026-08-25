# ADR-0038: Namespaced Store API data and a separately flagged Blocks panel

- Status: Accepted
- Date: 2026-08-25
- Module: M09 storefront and customer experience
- Extends: ADR-0037

## Context

ADR-0037 provides local, bounded, display-only customer snapshots and complete
classic WooCommerce placements without JavaScript, CSS, or render-time Hub
requests. Cart and Checkout Blocks do not execute classic checkout hooks, so a
Blocks-native placement needs an explicit Store API and client integration
boundary. It must not make checkout dependent on the Hub, disclose private
customer evidence, or turn cached presentation data into value authority.

Current official WooCommerce guidance supports the selected boundary:

- Store API extensions attach callback-produced arrays under a unique namespace
  on an existing endpoint schema:
  <https://developer.woocommerce.com/docs/apis/store-api/extending-store-api/extend-store-api-add-data/>
- Cart and Checkout integrations register reviewed script handles through
  `IntegrationInterface` after Blocks is available:
  <https://developer.woocommerce.com/docs/block-development/reference/integration-interface/>
- SlotFills receive the Store API `extensions` object but currently include
  experimental interfaces whose compatibility must be treated explicitly:
  <https://developer.woocommerce.com/docs/block-development/reference/slot-fills/>
- `ExperimentalOrderMeta` is available in both Cart and Checkout Blocks:
  <https://developer.woocommerce.com/docs/block-development/extensible-blocks/cart-and-checkout-blocks/available-slot-fills/>

## Decision

1. Register one extension on `CartSchema::IDENTIFIER` under the
   `starfiniti-loyalty` namespace. Its data and schema callbacks always return
   arrays and expose version `1` presentation data only.
2. Derive the response from the authenticated WordPress user and the strict
   local snapshot. The request accepts no tenant, customer, channel, wallet,
   programme, balance, tier, reward, or entitlement selector.
3. Return exact points as strings, one same-store account URL, bounded safe
   labels, and at most three reward summaries. Email, names, internal IDs,
   coupons, ledger evidence, activity, fingerprints, and secrets are absent.
4. When the snapshot is stale, retain only `state=stale` and the local account
   path. Do not return balances, tier labels, programme labels, or rewards.
5. Add two non-autoloaded server-side WordPress flags, both defaulting off.
   `blocks_data` enables the namespaced display projection first;
   `progressive_panel` separately loads the visual integration. Saving an
   enabled panel also enables its data dependency, while either layer can be
   disabled without changing customer value.
6. Register the script through WooCommerce's Cart and Checkout block
   registration hooks and `IntegrationInterface`. The script depends only on
   WooCommerce Blocks Checkout plus WordPress element, i18n, and plugin APIs;
   no editor asset is loaded.
7. Render through `ExperimentalOrderMeta` in the `woocommerce-checkout` scope.
   The component reads only the already-delivered `extensions` object and must
   not fetch, poll, open a socket, inject HTML, or execute remote code.
8. Append a semantic local `<noscript>` account path to Cart and Checkout block
   rendering when the panel is enabled. Fresh data may show the exact local
   balance; stale data shows only refresh guidance.
9. Declare Cart and Checkout Blocks compatibility and keep native WooCommerce
   coupon behavior authoritative. The panel cannot apply, reserve, issue,
   capture, or cancel a benefit.
10. Enforce compressed budgets of 4 KiB JavaScript and 2 KiB CSS, zero
    panel-initiated network calls, three rewards, and the existing 32 KiB local
    snapshot ceiling. CSS uses theme values, visible focus, forced-color
    support, and no remote assets.

## Alternatives

### Keep the classic placements only

Rejected. Native coupons continue working, but a Blocks store would lose the
useful local balance, tier, reward discovery, and account path even though the
same bounded snapshot is already available.

### Fetch the hosted account from the panel

Rejected. It would add DNS, TLS, Hub, Auth, and database availability to cart
and checkout rendering and expand the browser-facing identity boundary.

### Append all Blocks content with `render_block` only

Rejected as the primary path. It provides a strong no-script fallback but
cannot consume live Store API extension updates or participate in the Blocks
component lifecycle. It remains the degradation path.

### Use a custom block or template override

Rejected. It increases merchant setup and theme compatibility cost, and a
template override would duplicate WooCommerce-owned cart/checkout structure.

## Security and integrity effects

- WordPress session identity selects the only local option that may be read.
  Browser fields and Store API query values grant no tenant or customer scope.
- The database-authored enhancement bit and local rollout flags can hide the
  optional presentation only. They cannot hide hosted value, remove native
  coupons, modify a snapshot, or affect the immutable ledger.
- Exact points remain strings through PHP, JSON schema, and JavaScript. No
  floating-point or unsafe-number conversion is permitted.
- Stale data fails closed before serialization, so a client cannot recover a
  hidden balance or reward from the namespaced response.
- Assets contain no request primitive, absolute URL, dynamic HTML sink, or
  executable merchant content. All customer-facing strings use the literal
  plugin text domain.
- The selected SlotFill is experimental. Compatibility is proven in every
  supported minimum/current runtime cell, and the independent flags provide an
  immediate rollback if WooCommerce changes the interface.

## Operations

- Deploy with both flags off. Enable Blocks data first on the approved pilot
  store and inspect the namespaced Cart Store API response, checkout latency,
  browser diagnostics, and absence of PII. Enable the panel only afterward.
- Turning the panel off prevents its integration registration, script/style
  load, and no-script enhancement while leaving the separately observable data
  canary available. Turning data off makes the callback return an empty array.
- Runtime evidence must cover minimum/current WordPress, WooCommerce, PHP,
  HPOS/legacy storage, real `/wc/store/v1/cart` fresh and stale responses,
  native coupon application, forced Hub failure, flag staging, assets, and the
  no-script path.
- Static validation executes the panel with fresh and stale fixtures, rejects
  network/dangerous primitives, verifies accessible semantics, and measures
  gzip sizes on every repository gate.

## Migration and rollback

This slice adds no database migration and no new value-bearing WordPress data.
It adds two non-autoloaded site options, reviewed assets, a Store API namespace,
and a conditional integration class. Explicit data-removing uninstall deletes
the flags; normal uninstall retains the same reconciliation-first policy.

Rollback disables `progressive_panel` first, which removes the client and
no-script enhancement without touching the Store API canary. If necessary,
disable `blocks_data`, which returns an empty extension. Classic local
placements, My Account, hosted account access, native coupons, durable events,
snapshots, reservations, and canonical ledger value remain intact. If
WooCommerce removes or changes the experimental SlotFill, forward-fix only the
conditional integration; do not migrate or rewrite customer value.
