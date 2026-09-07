<?php
// Run with WP-CLI only in the loopback-only, disposable pilot store.
if (!defined('WP_CLI') || !WP_CLI || home_url() !== 'http://127.0.0.1:8088') {
    throw new RuntimeException('This setup is restricted to the private pilot.');
}
if (!class_exists('WooCommerce')) {
    WP_CLI::error('WooCommerce must be active first.');
}
update_option('blog_public', '0');
update_option('timezone_string', 'Europe/Ljubljana');
update_option('woocommerce_currency', 'EUR');
update_option('woocommerce_default_country', 'SI');
update_option('woocommerce_allow_tracking', 'no');
update_option('woocommerce_cheque_settings', [
    'enabled' => 'yes',
    'title' => 'Test payment — no charge',
    'description' => 'Private loyalty test. No money will be collected.',
    'instructions' => 'An operator completes this test order manually.',
]);
WC_Install::create_pages();
$productId = wc_get_product_id_by_sku('STARFINITI-PILOT-001');
if (!$productId) {
    $product = new WC_Product_Simple();
    $product->set_name('Loyalty test product');
    $product->set_sku('STARFINITI-PILOT-001');
    $product->set_regular_price('20.00');
    $product->set_virtual(true);
    $product->set_status('publish');
    $productId = $product->save();
}
WP_CLI::success('Private EUR pilot ready with test product ' . $productId . '. No hub connection or value was created.');
