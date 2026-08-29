# ADR-0101: Keep the disposable current WooCommerce matrix on stable security releases

- Status: Accepted
- Date: 2026-08-29
- Scope: M01, M04, M09, M15, and M16 WooCommerce compatibility evidence

## Context

The released minimum matrix remains WordPress 6.6.5, WooCommerce 9.0.2, and
PHP 8.1. The separate current matrix was still WordPress 7.0.2, WooCommerce
10.9.4, and PHP 8.3. Official sources now identify WordPress 7.1 as the current
stable release and WooCommerce 11.0.1 as the current stable security update.
WooCommerce recommends PHP 8.3 or newer and reports testing through PHP 8.4.

The exact previous and candidate WordPress and WooCommerce ZIP URLs, byte
lengths, SHA-256 values, release dates, source snapshot, impact owner, and false
production authority are recorded in
`infrastructure/governance/woocommerce-runtime-review.yaml`.

Official sources:

- <https://wordpress.org/news/2026/08/mary-lou/>
- <https://developer.woocommerce.com/changelog/>
- <https://developer.woocommerce.com/2026/08/10/woocommerce-11-0-1-release-notes/>
- <https://woocommerce.com/document/server-requirements/>
- <https://developer.wordpress.org/block-editor/reference-guides/packages/packages-env/>

## Alternatives

### Retain the stale current matrix

This preserves an already-green combination but stops testing the connector
against the actively supported WordPress line and current WooCommerce security
release. Rejected.

### Follow unversioned latest artifacts

Using `core: null` or a latest-stable WooCommerce URL would reduce maintenance,
but the same commit could exercise different upstream bytes and rollback could
not reconstruct the tested combination. Rejected.

### Refresh exact stable versions and preserve the minimum matrix

Keep the minimum compatibility cells unchanged. Advance only the two disposable
current cells to WordPress 7.1, WooCommerce 11.0.1, and PHP 8.4, update tested-up-to
declarations, and require exact-head HPOS and legacy evidence. Selected.

## Decision

The current matrix uses explicit versioned WordPress and WooCommerce artifact
URLs and PHP 8.4 in both HPOS and legacy order-storage modes. A network-free
validator binds the reviewed versions, artifact provenance, unchanged minimum
matrix, workflow cells, plugin headers, platform documentation, impact owner,
and false production authority. The Linux current cells download and hash-check
the reviewed WordPress and WooCommerce archives immediately before startup, then
assert the running WordPress, WooCommerce, and PHP versions inside `wp-env`.

This decision does not upgrade a merchant store, publish a connector, alter
production WordPress or WooCommerce, change checkout, or authorize release. A
green disposable matrix is compatibility evidence, not a pilot-store upgrade.

## Rollback

If either exact-head current cell fails, restore the current test configuration
and compatibility declarations to WordPress 7.0.2, WooCommerce 10.9.4, and PHP
8.3 in one forward commit. Retain the failed result and fix forward before
claiming WordPress 7.1 or WooCommerce 11.0 compatibility. The minimum cells stay
unchanged throughout.
