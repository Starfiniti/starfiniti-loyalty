# Platform Matrix

The plugin currently declares WordPress 6.6+, WordPress tested through 7.0, WooCommerce 9.0+, WooCommerce tested through 10.9, HPOS compatibility, and PHP 8.1+. It uses native coupons shared by classic checkout and Cart/Checkout Blocks. These declarations follow official WordPress/WooCommerce release and code-reference surfaces reviewed on 2026-08-12.

Exact-head GitHub Actions run `31577312529` passed this pinned smoke matrix:

| WordPress | WooCommerce | PHP | Order storage |
| --------- | ----------- | --- | ------------- |
| 6.6.5     | 9.0.2       | 8.1 | HPOS          |
| 6.6.5     | 9.0.2       | 8.1 | Legacy        |
| 7.0.2     | 10.9.4      | 8.3 | HPOS          |
| 7.0.2     | 10.9.4      | 8.3 | Legacy        |

Every case activates, deactivates, and reactivates the plugin; switches to the bundled Slovenian locale and proves translated customer navigation; creates a customer-bound native coupon; applies it through both the classic cart and the Cart/Checkout Blocks Store API controller while a configured hub is unreachable; proves zero checkout HTTP calls; completes and round-trips an order; captures coupon use without PII; creates partial and final refunds; reconciles without duplicates; refuses release of a used coupon; exhausts one local delivery into dead letter; and restores it through the operator retry path. Strict contracts, PHP syntax, package/language layout, signed delivery/command behavior, worker retries, tenant isolation, immutable ledger effects, and 322 pgTAP assertions run alongside it.

Before a production release, execute and retain results for:

| Dimension               | Required cases                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| WordPress / WooCommerce | Oldest supported and current stable combinations                                                                    |
| Storage                 | HPOS enabled and legacy order tables during supported migration windows                                             |
| Checkout                | Cart/Checkout Blocks and classic checkout; hub online, timeout, and unavailable                                     |
| PHP                     | Every declared supported PHP minor                                                                                  |
| Money                   | Zero-, two-, and three-decimal currencies; taxes, discounts, shipping, fees, partial/full refunds                   |
| Queues                  | WP-Cron disabled, Action Scheduler backlog, retry exhaustion, dead-letter recovery, delayed command acknowledgement |
| Rewards                 | Fixed cart, percentage without unsupported maximum, free shipping, customer mismatch, expiry, use/cancel race       |
| Lifecycle               | Activate, deactivate, reinstall, opt-in uninstall cleanup, multisite rejection, key rotation                        |
| Localization            | Exact POT coverage, placeholder parity, bundled locale loading, fallback, long copy, and RTL presentation           |

The minimum/current smoke is a Phase 7 pass, not the exhaustive production release matrix. R-008 remains open until every declared PHP minor and the remaining money, tax, cache, queue, reward, lifecycle, additional-language/RTL, and multi-currency cases have retained evidence. Docker remains unavailable locally, so GitHub Actions is the container-backed runner.
