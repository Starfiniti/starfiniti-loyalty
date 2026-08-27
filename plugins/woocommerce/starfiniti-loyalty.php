<?php
/**
 * Plugin Name: Starfiniti Loyalty
 * Description: Resilient WooCommerce connector for the self-hosted Starfiniti Loyalty platform.
 * Version: 0.1.0-dev
 * Requires at least: 6.6
 * Requires PHP: 8.1
 * WC requires at least: 9.0
 * WC tested up to: 10.9
 * License: GPL-2.0-or-later
 * Text Domain: starfiniti-loyalty
 * Domain Path: /languages
 */

defined('ABSPATH') || exit;

define('STARFINITI_LOYALTY_VERSION', '0.1.0-dev');
define('STARFINITI_LOYALTY_FILE', __FILE__);

register_activation_hook(__FILE__, static function (bool $networkWide): void {
    if (is_multisite() && $networkWide) {
        wp_die(esc_html__('Activate Starfiniti Loyalty separately on each WooCommerce site.', 'starfiniti-loyalty'));
    }
    require_once __DIR__ . '/src/class-outbox.php';
    Starfiniti\Loyalty\Outbox::install();
    add_rewrite_endpoint('loyalty', EP_ROOT | EP_PAGES);
    flush_rewrite_rules();
});

add_action('before_woocommerce_init', static function (): void {
    if (class_exists(\Automattic\WooCommerce\Utilities\FeaturesUtil::class)) {
        \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility(
            'custom_order_tables',
            __FILE__,
            true
        );
        \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility(
            'cart_checkout_blocks',
            __FILE__,
            true
        );
    }
});

add_action('plugins_loaded', static function (): void {
    if (! class_exists('WooCommerce')) {
        add_action('admin_notices', static function (): void {
            echo '<div class="notice notice-error"><p>' . esc_html__(
                'Starfiniti Loyalty requires WooCommerce.',
                'starfiniti-loyalty'
            ) . '</p></div>';
        });
        return;
    }

    require_once __DIR__ . '/src/class-plugin.php';
    require_once __DIR__ . '/src/class-settings.php';
    require_once __DIR__ . '/src/class-customer-claim.php';
    require_once __DIR__ . '/src/class-experience-snapshot.php';
    require_once __DIR__ . '/src/class-blocks.php';
    require_once __DIR__ . '/src/class-referrals.php';
    require_once __DIR__ . '/src/class-outbox.php';
    require_once __DIR__ . '/src/class-commands.php';
    require_once __DIR__ . '/src/class-privacy.php';
    require_once __DIR__ . '/src/class-cli.php';
    Starfiniti\Loyalty\Plugin::boot();
});
