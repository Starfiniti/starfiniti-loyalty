# WooCommerce Integration

- Documentation reviewed: 2026-08-11
- REST API: `wc/v3` (current official integration)
- References: https://developer.woocommerce.com/docs/apis/rest-api/ and https://developer.woocommerce.com/docs/extensions/best-practices-extensions/compatibility/

WooCommerce is a thin connector. It uses HTTPS, least-privilege credentials, signed outbound events, Action Scheduler retries, local queue diagnostics, HPOS declarations, and tested Cart/Checkout Blocks plus documented classic-checkout compatibility. Monetary API values arrive as decimal strings and must be converted to integer minor units without floating-point arithmetic. Central failure must never block checkout.

## Authority and delivery

- WordPress/WooCommerce is authoritative for orders, customers within that channel, refunds, products, fulfilment, and native coupon execution.
- Starfiniti is authoritative for programme versions, identities/links, wallets, ledger, reservations, tiers, and loyalty audit.
- The plugin writes an outbox row before delivery, signs exact raw bodies, reuses immutable delivery IDs, retries with Action Scheduler, and exposes masked queue health.
- The hub acknowledges durable receipt quickly and applies value asynchronously. Order/refund effects are idempotent and reconcile against WooCommerce REST data.
- The plugin receives no Supabase/database/service-role credential. Hub commands are scoped, signed/authenticated, short-lived, and idempotent.

## Checkout and reward execution

- Product/cart/checkout loyalty UI is optional and cached with explicit staleness.
- When the hub is unavailable, earning information may degrade but add-to-cart, checkout, payment, and order creation continue.
- Reward points are reserved centrally before a coupon command is issued. The plugin creates/cancels the native coupon idempotently and reports capture/use.
- Coupon codes are high entropy, one-use, short-lived, and restricted to the intended customer/order/cart conditions where WooCommerce supports them.
- Unknown command outcomes retry with the same command ID; reservation expiry releases points through a compensating ledger transaction.

## Security and privacy

Admin actions require WordPress capabilities and nonces. Inputs are validated; outputs escaped. Signing and Woo REST credentials rotate by version/reference and are masked in logs/support bundles. Plugin logs never contain bodies, access keys, signatures, email/phone, coupon plaintext, or loyalty access tokens.

See `docs/architecture/EVENT_MODEL.md`, `docs/api/WEBHOOKS.md`, and ADR-0007.
