# WooCommerce Integration

- Documentation reviewed: 2026-08-11
- REST API: `wc/v3` (current official integration)
- References: https://developer.woocommerce.com/docs/apis/rest-api/ and https://developer.woocommerce.com/docs/extensions/best-practices-extensions/compatibility/

WooCommerce is a thin connector. It uses HTTPS, least-privilege credentials, signed outbound events, Action Scheduler retries, local queue diagnostics, HPOS declarations, and tested Cart/Checkout Blocks plus documented classic-checkout compatibility. Monetary API values arrive as decimal strings and must be converted to integer minor units without floating-point arithmetic. Central failure must never block checkout.
