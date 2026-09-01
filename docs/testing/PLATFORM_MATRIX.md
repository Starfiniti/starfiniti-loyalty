# Platform Matrix

The plugin currently declares WordPress 6.6+, WordPress tested through 7.1, WooCommerce 9.0+, WooCommerce tested through 11.0, HPOS compatibility, and PHP 8.1+. It uses native coupons shared by classic checkout and Cart/Checkout Blocks. The minimum cells remain unchanged; the current cells follow the official WordPress 7.1 release, WooCommerce 11.0.1 security release, WooCommerce PHP compatibility guidance, and `wp-env` source contract reviewed on 2026-08-29.

The prior current matrix passed exact-head GitHub Actions run `31577312529`. The refreshed current cells remain candidate evidence until both exact-head jobs hash-check the reviewed downloads, start successfully, assert the running WordPress, WooCommerce, and PHP versions, and pass:

| WordPress | WooCommerce | PHP | Order storage |
| --------- | ----------- | --- | ------------- |
| 6.6.5     | 9.0.2       | 8.1 | HPOS          |
| 6.6.5     | 9.0.2       | 8.1 | Legacy        |
| 7.1       | 11.0.1      | 8.4 | HPOS          |
| 7.1       | 11.0.1      | 8.4 | Legacy        |

Every case activates, deactivates, and reactivates the English-only plugin; creates a customer-bound native coupon; applies it through both the classic cart and the Cart/Checkout Blocks Store API controller while a configured hub is unreachable; proves zero checkout HTTP calls; completes and round-trips an order; captures coupon use without PII; creates partial and final refunds; reconciles without duplicates; refuses release of a used coupon; exhausts one local delivery into dead letter; and restores it through the operator retry path. Strict contracts, PHP syntax, package layout, signed delivery/command behavior, worker retries, tenant isolation, immutable ledger effects, and pgTAP assertions run alongside it.

Before a production release, execute and retain results for:

| Dimension               | Required cases                                                                                                                                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WordPress / WooCommerce | Oldest supported and current stable combinations                                                                                                                                                    |
| Storage                 | HPOS enabled and legacy order tables during supported migration windows                                                                                                                             |
| Checkout                | Cart/Checkout Blocks and classic checkout; hub online, timeout, and unavailable                                                                                                                     |
| PHP                     | Every declared supported PHP minor                                                                                                                                                                  |
| Money                   | Zero-, two-, and three-decimal currencies; taxes, discounts, shipping, fees, partial/full refunds                                                                                                   |
| Queues                  | WP-Cron disabled, Action Scheduler backlog, retry exhaustion, dead-letter recovery, delayed command acknowledgement                                                                                 |
| Rewards                 | V1 fixed/percentage/free shipping; V2 fixed, restricted uncapped percentage, free shipping, product-specific free product, old-plugin capability denial, customer mismatch, expiry, use/cancel race |
| Lifecycle               | Activate, deactivate, reinstall, opt-in uninstall cleanup, multisite rejection, key rotation                                                                                                        |
| Localization            | English source/POT parity; additional locale catalogs, long-copy, and RTL presentation are deferred                                                                                                 |

The released minimum/current smoke is a Phase 7 pass, not the exhaustive production release matrix. The M04 additions have local contract, pgTAP, concurrency, and PHP runtime-smoke coverage but are not production evidence until the complete four-cell runtime matrix passes at the exact commit. R-008 remains open until every declared PHP minor and the remaining money, tax, cache, queue, reward, lifecycle, and multi-currency cases have retained evidence. Additional-language and RTL presentation are deferred because the active product is English-only. Docker remains unavailable locally, so GitHub Actions is the container-backed runner.
