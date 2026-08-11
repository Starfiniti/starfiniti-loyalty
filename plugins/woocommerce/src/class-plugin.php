<?php

namespace Starfiniti\Loyalty;

defined('ABSPATH') || exit;

final class Plugin
{
    public static function boot(): void
    {
        add_action('admin_menu', [self::class, 'registerMenu']);
        Outbox::boot();
    }

    public static function registerMenu(): void
    {
        add_submenu_page(
            'woocommerce',
            __('Loyalty', 'starfiniti-loyalty'),
            __('Loyalty', 'starfiniti-loyalty'),
            'manage_woocommerce',
            'starfiniti-loyalty',
            [self::class, 'renderAdmin']
        );
    }

    public static function renderAdmin(): void
    {
        if (! current_user_can('manage_woocommerce')) {
            wp_die(esc_html__('You do not have permission to manage loyalty settings.', 'starfiniti-loyalty'));
        }

        echo '<div class="wrap"><h1>' . esc_html__('Starfiniti Loyalty', 'starfiniti-loyalty') . '</h1>';
        echo '<p>' . esc_html__(
            'Programme rules and balances remain in the central loyalty platform. Commerce events use a local durable outbox and never wait on the hub during checkout.',
            'starfiniti-loyalty'
        ) . '</p></div>';
    }
}
