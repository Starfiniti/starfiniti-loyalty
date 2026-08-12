<?php

namespace Starfiniti\Loyalty;

defined('ABSPATH') || exit;

final class Plugin
{
    public static function boot(): void
    {
        add_action('init', [self::class, 'loadTextDomain'], 0);
        add_action('admin_menu', [self::class, 'registerMenu']);
        add_action('admin_post_starfiniti_loyalty_save_settings', [Settings::class, 'handleSave']);
        add_action('init', [self::class, 'registerAccountEndpoint']);
        add_filter('woocommerce_account_menu_items', [self::class, 'accountMenuItems']);
        add_action('woocommerce_account_loyalty_endpoint', [self::class, 'renderAccount']);
        add_action('woocommerce_before_cart', [self::class, 'renderCartNotice']);
        Outbox::boot();
        Commands::boot();
        Privacy::boot();
        Cli::register();
    }

    public static function loadTextDomain(): void
    {
        load_plugin_textdomain(
            'starfiniti-loyalty',
            false,
            dirname(plugin_basename(STARFINITI_LOYALTY_FILE)) . '/languages'
        );
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

    public static function registerAccountEndpoint(): void
    {
        add_rewrite_endpoint('loyalty', EP_ROOT | EP_PAGES);
    }

    public static function accountMenuItems(array $items): array
    {
        $logout = $items['customer-logout'] ?? null;
        unset($items['customer-logout']);
        $items['loyalty'] = __('Loyalty rewards', 'starfiniti-loyalty');
        if (null !== $logout) {
            $items['customer-logout'] = $logout;
        }
        return $items;
    }

    public static function renderAccount(): void
    {
        if (! is_user_logged_in()) {
            return;
        }
        $coupons = self::customerCoupons(get_current_user_id());
        echo '<h2>' . esc_html__('Loyalty rewards', 'starfiniti-loyalty') . '</h2>';
        if ([] === $coupons) {
            echo '<p>' . esc_html__('No active loyalty coupons are available yet.', 'starfiniti-loyalty') . '</p>';
            return;
        }
        echo '<ul class="woocommerce-MyAccount-loyalty-coupons">';
        foreach ($coupons as $coupon) {
            $expiry = $coupon->get_date_expires();
            echo '<li><strong><code>' . esc_html($coupon->get_code()) . '</code></strong> &mdash; ';
            if ($coupon->get_free_shipping()) {
                echo esc_html__('Free shipping', 'starfiniti-loyalty');
            } elseif ('percent' === $coupon->get_discount_type()) {
                echo esc_html($coupon->get_amount() . '%');
            } else {
                echo wp_kses_post(wc_price((float) $coupon->get_amount()));
            }
            if (null !== $expiry) {
                echo '<br><small>' . esc_html(sprintf(
                    /* translators: %s is a localized date. */
                    __('Expires %s', 'starfiniti-loyalty'),
                    wc_format_datetime($expiry)
                )) . '</small>';
            }
            echo '</li>';
        }
        echo '</ul>';
        echo '<p>' . esc_html__('Enter a reward code in the native coupon field at cart or checkout.', 'starfiniti-loyalty') . '</p>';
    }

    public static function renderCartNotice(): void
    {
        if (is_user_logged_in() && [] !== self::customerCoupons(get_current_user_id())) {
            wc_print_notice(sprintf(
                /* translators: %s is the My Account loyalty URL. */
                wp_kses(__('You have an active loyalty reward. <a href="%s">View your code</a>.', 'starfiniti-loyalty'), ['a' => ['href' => true]]),
                esc_url(wc_get_account_endpoint_url('loyalty'))
            ), 'notice');
        }
    }

    /** @return array<int, \WC_Coupon> */
    private static function customerCoupons(int $customerId): array
    {
        $query = new \WP_Query([
            'post_type' => 'shop_coupon',
            'post_status' => 'publish',
            'posts_per_page' => 20,
            'fields' => 'ids',
            'no_found_rows' => true,
            'meta_key' => '_starfiniti_external_customer_id',
            'meta_value' => (string) $customerId,
        ]);
        $coupons = [];
        foreach ($query->posts as $couponId) {
            $coupon = new \WC_Coupon((int) $couponId);
            $expiry = $coupon->get_date_expires();
            if (
                (null !== $expiry && $expiry->getTimestamp() <= time())
                || ($coupon->get_usage_limit() > 0 && $coupon->get_usage_count() >= $coupon->get_usage_limit())
            ) {
                continue;
            }
            $coupons[] = $coupon;
        }
        return $coupons;
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
