=== Starfiniti Loyalty ===
Contributors: starfiniti
Tags: woocommerce, loyalty, rewards, points
Requires at least: 6.6
Tested up to: 6.9
Requires PHP: 8.1
Stable tag: trunk
License: GPLv2 or later

A resilient connector between WooCommerce and the self-hosted Starfiniti Loyalty platform.

== Description ==

The connector uses an HPOS-safe local outbox for order and refund facts, signed asynchronous delivery, encrypted connection settings, and native one-use WooCommerce coupons for supported rewards. Checkout remains available when the loyalty hub is offline.

Multisite installations activate and configure the connector separately per WooCommerce site. Network activation is intentionally rejected so tenant and signing-key boundaries remain explicit.

Uninstall preserves value-bearing delivery evidence by default. Define `STARFINITI_LOYALTY_REMOVE_DATA` as `true` only after reconciliation if local connector data must be removed.

