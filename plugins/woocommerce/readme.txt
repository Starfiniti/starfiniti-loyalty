=== Starfiniti Loyalty ===
Contributors: starfiniti
Tags: woocommerce, loyalty, rewards, points
Requires at least: 6.6
Tested up to: 7.1
Requires PHP: 8.1
Stable tag: trunk
License: GPLv2 or later

A resilient connector between WooCommerce and the self-hosted Starfiniti Loyalty platform.

== Description ==

The connector uses an HPOS-safe local outbox for order and refund facts, signed asynchronous delivery, encrypted connection settings, and native one-use WooCommerce coupons for supported rewards. Checkout remains available when the loyalty hub is offline.

Signed background polling also delivers a strict, bounded, PII-free last-known-good customer summary. My Account, product, cart, classic checkout, and post-purchase placements render only local data, label freshness, and never wait for the loyalty hub. Cached summaries are display-only and cannot redeem points or issue coupons.

Cart and Checkout Blocks support uses a namespaced WooCommerce Store API projection and an optional local panel. Both data and panel switches default off so data can be canaried before loading the panel. The panel reads the existing local response, makes no Hub request, retains a no-script account path, and can be disabled without affecting native coupons or checkout.

Customer and administration strings use the `starfiniti-loyalty` WordPress text domain. The installable package includes an exact source POT template for standard WordPress translation workflows; the initial product experience is English-only.

Multisite installations activate and configure the connector separately per WooCommerce site. Network activation is intentionally rejected so tenant and signing-key boundaries remain explicit.

Uninstall preserves value-bearing delivery evidence by default. Define `STARFINITI_LOYALTY_REMOVE_DATA` as `true` only after reconciliation if local connector data must be removed.

Local customer summaries participate in the WordPress personal-data exporter and eraser and are removed when the matching WordPress user is deleted.

