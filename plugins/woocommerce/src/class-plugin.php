<?php

namespace Starfiniti\Loyalty;

defined('ABSPATH') || exit;

final class Plugin
{
    public static function boot(): void
    {
        add_action('admin_menu', [self::class, 'registerMenu']);
        add_action('admin_post_starfiniti_loyalty_save_settings', [Settings::class, 'handleSave']);
        Outbox::boot();
        Cli::register();
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

        $notice = Settings::notice();
        $diagnostics = Outbox::diagnostics();
        echo '<div class="wrap"><h1>' . esc_html__('Starfiniti Loyalty', 'starfiniti-loyalty') . '</h1>';
        if (null !== $notice) {
            echo '<div class="notice notice-' . esc_attr($notice[0]) . '"><p>' . esc_html($notice[1]) . '</p></div>';
        }
        echo '<p>' . esc_html__(
            'Programme rules and balances remain in the central loyalty platform. Commerce events use a local durable outbox and never wait on the hub during checkout.',
            'starfiniti-loyalty'
        ) . '</p>';
        echo '<h2>' . esc_html__('Hub connection', 'starfiniti-loyalty') . '</h2>';
        echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '">';
        wp_nonce_field('starfiniti_loyalty_save_settings');
        echo '<input type="hidden" name="action" value="starfiniti_loyalty_save_settings">';
        echo '<table class="form-table"><tbody>';
        self::textField('endpoint', __('HTTPS event endpoint', 'starfiniti-loyalty'), Settings::endpoint(), 'url');
        self::textField('connection_id', __('Connection UUID', 'starfiniti-loyalty'), Settings::connectionId());
        self::textField('key_version', __('Key version', 'starfiniti-loyalty'), Settings::keyVersion());
        self::textField('signing_key', __('Base64 signing key', 'starfiniti-loyalty'), '', 'password', Settings::hasSigningKey()
            ? __('Leave blank to keep the encrypted key already stored.', 'starfiniti-loyalty')
            : __('Paste the one-time key issued by the hub.', 'starfiniti-loyalty'));
        echo '</tbody></table>';
        submit_button(__('Save connection', 'starfiniti-loyalty'));
        echo '</form>';
        echo '<h2>' . esc_html__('Delivery queue', 'starfiniti-loyalty') . '</h2>';
        echo '<table class="widefat striped"><thead><tr><th>' . esc_html__('State', 'starfiniti-loyalty') . '</th><th>' . esc_html__('Events', 'starfiniti-loyalty') . '</th></tr></thead><tbody>';
        foreach ($diagnostics as $state => $count) {
            echo '<tr><td>' . esc_html($state) . '</td><td>' . esc_html((string) $count) . '</td></tr>';
        }
        echo '</tbody></table></div>';
    }

    private static function textField(
        string $name,
        string $label,
        string $value,
        string $type = 'text',
        string $description = ''
    ): void {
        echo '<tr><th scope="row"><label for="starfiniti-' . esc_attr($name) . '">' . esc_html($label) . '</label></th><td>';
        echo '<input class="regular-text" id="starfiniti-' . esc_attr($name) . '" name="' . esc_attr($name) . '" type="' . esc_attr($type) . '" value="' . esc_attr($value) . '" autocomplete="off">';
        if ('' !== $description) {
            echo '<p class="description">' . esc_html($description) . '</p>';
        }
        echo '</td></tr>';
    }
}
