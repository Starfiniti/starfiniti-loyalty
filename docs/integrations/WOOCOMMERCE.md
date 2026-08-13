# WooCommerce Integration

- Documentation reviewed: 2026-08-13
- REST API: `wc/v3` (current official integration)
- References: https://developer.woocommerce.com/docs/apis/rest-api/, https://developer.woocommerce.com/docs/extensions/best-practices-extensions/compatibility/, https://woocommerce.github.io/code-reference/classes/WC-Order.html, https://developer.wordpress.org/plugins/internationalization/how-to-internationalize-your-plugin/, and https://developer.wordpress.org/reference/functions/load_plugin_textdomain/

WooCommerce is a thin connector. It uses HTTPS, least-privilege credentials, signed outbound events, Action Scheduler retries, local queue diagnostics, HPOS declarations, and tested Cart/Checkout Blocks plus documented classic-checkout compatibility. Monetary API values arrive as decimal strings and must be converted to integer minor units without floating-point arithmetic. Central failure must never block checkout.

## Authority and delivery

- WordPress/WooCommerce is authoritative for orders, customers within that channel, refunds, products, fulfilment, and native coupon execution.
- Starfiniti is authoritative for programme versions, identities/links, wallets, ledger, reservations, tiers, and loyalty audit.
- The plugin writes an outbox row before delivery, signs exact raw bodies, reuses immutable delivery IDs, retries with Action Scheduler, and exposes masked queue health.
- The hub acknowledges durable receipt quickly and applies value asynchronously through a separately credentialed worker. Order awards, cumulative refunds, and coupon captures are idempotent.
- Current order facts retain cumulative product-line plus shipping, tax, and fee refund amounts as decimal strings. Older V1 senders that omit the three component-refund fields remain readable as zero; the current plugin always sends them. V2 converts them to exact integer minor units and subtracts included components during cumulative reversal.
- A published V2 programme is evaluated only after the worker enters the database-serialized member-cap boundary. The same pure evaluator powers simulation and live processing; PostgreSQL atomically records the evaluation, immutable per-rule cap usage, and ledger award, then an exact retry returns the original effect.
- The connector emits one PII-free account-created fact and one product-scoped fact when a registered product review becomes approved and is verified by WooCommerce purchase evidence. Review body, author name, and email never leave WordPress. These events use the same durable outbox and asynchronous V2 award path as orders.
- The plugin receives no Supabase/database/service-role credential. Hub commands are scoped, signed/authenticated, short-lived, and idempotent.
- `wp starfiniti loyalty reconcile-order <id>` re-enqueues the stable completion snapshot, all existing refunds, and any Starfiniti coupon capture for one order. Event keys make repeated reconciliation safe.
- The authenticated hub exposes the same source repair as a reviewed, reason-bound operation. It writes a private transactional-outbox command, delivers that command through the existing signed polling channel, and records the request actor and correlation in immutable administration audit evidence.

## Checkout and reward execution

- Product/cart/checkout loyalty UI is optional and cached with explicit staleness.
- When the hub is unavailable, earning information may degrade but add-to-cart, checkout, payment, and order creation continue.
- The hosted member page requires an authenticated explicit confirmation before redeeming a native fixed-discount, percentage-discount, free-shipping, product-specific free-product, exclusive-access, or custom-perk reward. The browser submits only its linked account public ID, the published reward code, and a request UUID; PostgreSQL derives the live customer, tenant, connector, programme, version, and wallet.
- Native V2 reward configuration is validated at authoring and independently in PostgreSQL: fixed discounts use a positive integer minor-unit amount, percentage discounts use 1–10,000 basis points without a maximum cap, free products select one numeric WooCommerce product ID and bounded quantity, and every native coupon specifies 1–365 validity days. Currency precision is bounded to 0–6 digits.
- V2 restrictions cover minimum spend, included/excluded product and category IDs, sale-item exclusion, and exclusive/combinable stacking. Availability covers date, tier, per-customer limit, global quantity, and points budget. Segment selectors remain unavailable until M07 can evaluate an authoritative audience snapshot.
- Reward points and limited capacity are reserved centrally before a coupon command is issued. Reservation, allocation, immutable ledger entries, transition evidence, and the private WooCommerce issue command commit atomically. Capture consumes capacity; only definitive release returns it. The plugin creates/cancels the customer-only native coupon idempotently and reports capture/use.
- The plugin advertises `coupon.issue.v2` when polling. V2 commands are invisible to older pollers, so an upgrade can precede tenant enablement without an old connector silently ignoring restrictions.
- Free-product execution uses WooCommerce core as a 100% product-restricted coupon with an item limit; it does not require a paid extension or synchronous hub call, and it does not automatically insert a product into the cart.
- Exclusive-access and custom perks never enter the connector. They create an audited tenant-scoped merchant case atomically with the points/capacity reservation. Confirmed delivery captures points, definitive rejection compensates them, and an uncertain result stays reserved in progress.
- Native percentage coupons support 0.01–100% without a maximum-discount cap. Programme authoring and customer redemption reject capped percentage definitions before publication or any reservation/ledger/outbox effect because WooCommerce core has no matching cumulative cap primitive.
- Coupon codes and external WooCommerce customer identifiers never enter the hosted redemption response. Exact request retries return the original reservation result; reuse with changed inputs is rejected.
- Coupon codes are high entropy, one-use, short-lived, and restricted to the intended customer/order/cart conditions where WooCommerce supports them.
- A completed order containing a customer-matched Starfiniti coupon writes a PII-free `commerce.coupon.captured` event to the local outbox. The worker atomically moves the reservation from `issued` to `captured` and the points from `reserved` to `spent` exactly once.
- The worker sweeps expired coupons only after native issuance is confirmed, then queues one cancellation command. Points remain reserved until WooCommerce confirms an unused coupon is disabled; that acknowledgement writes a compensating `cancel` ledger transaction and moves the reservation to `released`.
- A coupon with a non-zero native usage count is never cancelled/released. The connector dead-letters that command so delayed capture/reconciliation can settle the spend instead.
- Unknown command outcomes retry with the same command ID and bounded error codes. Ten unsuccessful delivery attempts stop in an inspect-only manual-review state so an ambiguous native coupon outcome cannot loop forever or release points without proof that no coupon exists.
- Definitive pre-creation issue failure and confirmed-unused expiry compensate through the existing immutable cancel/release path; history is never rewritten.

## Localization

- Every customer and administration string uses the literal `starfiniti-loyalty` text domain. `Domain Path: /languages` and an `init`-time `load_plugin_textdomain` registration support the self-distributed ZIP without loading translations too early.
- `languages/starfiniti-loyalty.pot` is the canonical translator template and must exactly match source strings. `npm run woocommerce:localization:validate` rejects missing/stale messages, missing customer strings, empty translations, and placeholder drift.
- The launch package is English-only. All 43 customer/admin strings use the standard WordPress text domain and have exact POT coverage, so future catalogs can be added deliberately without changing connector authority.

## Storefront budgets

The connector's production customer surfaces deliberately use WooCommerce's native server-rendered markup and coupon field. The enforced Phase 9 budgets are:

- 0 bytes of connector storefront JavaScript and 0 bytes of connector CSS;
- 0 hub requests while rendering My Account or cart loyalty surfaces, validating coupons, or completing checkout;
- at most 20 active reward coupons in one account response;
- at most 32 KiB of account loyalty markup and 4 KiB for the cart notice in the real runtime smoke; and
- at most 12 KiB for the PHP class containing storefront/admin hook rendering, with any expansion requiring an explicit reviewed budget change.

`scripts/validate-woocommerce-storefront.mjs` fails the complete repository gate if connector scripts/styles, inline executable/style tags, browser/network request calls, unbounded coupon reads, or missing escaping/login guards enter the storefront boundary. Every minimum/current HPOS/legacy runtime renders the account and cart surfaces with the hub forcibly unavailable, checks semantic bounded asset-free markup, and proves zero HTTP calls.

## Guided connection setup

Before the first connector is provisioned, generate a deployment-only signing-key pool with `npm run woocommerce:keys -- --output <owner-readable-json-path> --count <n>`. Add capacity later with the same command plus `--append`; append preserves every prior reference and replaces the file atomically. Never print, commit, attach, or paste the pool file into support systems. After atomic replacement, recreate the dashboard container so its read-only secret mount sees the new inode.

When an active workspace has a published programme and no connector, a live tenant owner/admin can enter the canonical HTTPS WooCommerce origin and display name on the hub Operations page. The browser never supplies the key or its reference. The trusted server selects an unused `pool:<uuid>:v1` reference and calls a private audited database command. On success the page displays one exact JSON setup package containing `version`, `endpoint`, `connectionId`, `keyVersion`, and `signingKey`; it is not placed in a URL or browser storage.

Copy that package directly into **WooCommerce > Settings > Starfiniti Loyalty > Connection setup package**, save once, verify masked connection health, and then clear any clipboard or approved transfer record. The plugin rejects missing, extra, malformed, non-HTTPS, or weak-key fields and saves all four values together; the signing key enters the existing Sodium-backed encrypted option. Reopening the page does not retrieve the key from the hub. If transfer is lost, provision a replacement only through an explicit credential-rotation/recovery procedure rather than inventing or reusing a reference.

## Hosted customer account claim

The My Account loyalty endpoint creates a local five-minute link only for the logged-in WooCommerce user and only when the connector has a valid HTTPS hub endpoint, connection UUID, key version, and decrypted signing key. It performs no HTTP request. The purpose-specific HMAC covers the connection UUID, numeric WooCommerce customer ID, ten-digit issue time, UUID nonce, and current key version.

The connector does not append a locale to the claim URL. The hub presents English and canonicalizes legacy locale-bearing links to English without changing the signed connection/customer identity.

The hub verifies the live connection/key and HMAC, preserves the full link only through private no-store/no-referrer authentication navigation, displays the store name, and requires explicit POST confirmation. PostgreSQL resolves only `registered:<Woo customer ID>` on that exact connection, consumes hashed proof/nonce evidence once, and rejects cross-account conflicts. Email/profile fields are never sent or used. A successful link opens the hosted member page; checkout and local coupon behavior remain independent of this optional flow.

## Operations

- The settings screen reports pending, retryable, delivered, and dead-letter event counts without bodies, signatures, coupon codes, or customer data.
- `wp starfiniti loyalty status` reports masked connector health.
- `wp starfiniti loyalty retry-dead-letters [--limit=<n>]` makes selected local events retryable.
- `wp starfiniti loyalty reconcile-order <id>` repairs missed order, refund, and coupon-use facts from WooCommerce source data.
- Hub owners, admins, and operators can queue the same repair by WooCommerce order ID. The plugin returns `order_not_found` as a terminal result, while transient execution failures retry with the unchanged command ID.
- The hub advances `commerce_connections.last_seen_at` only after a verified delivery reaches the durable inbox.
- The installable artifact is built with `npm run woocommerce:package` as `dist/starfiniti-loyalty.zip`.

## Security and privacy

Admin actions require WordPress capabilities and nonces. Inputs are validated; outputs escaped. Signing and Woo REST credentials rotate by version/reference and are masked in logs/support bundles. Plugin logs never contain bodies, access keys, signatures, email/phone, coupon plaintext, or loyalty access tokens.

WooCommerce user deletion and its native personal-data eraser enqueue the same opaque, idempotent `commerce.customer.deleted` event. The event contains only the numeric channel customer ID needed for resolution and never email/profile fields. The worker atomically creates a private keyed suppression tombstone, pseudonymizes the channel identity, revokes the hosted Auth link, clears display data, and scrubs the ID from restricted delivery/canonical evidence. Wallets and immutable ledger history remain attributable through the retained pseudonymous customer; a later order for the deleted channel ID is suppressed instead of silently recreating the identity.

See `docs/architecture/EVENT_MODEL.md`, `docs/api/WEBHOOKS.md`, and ADR-0007.
