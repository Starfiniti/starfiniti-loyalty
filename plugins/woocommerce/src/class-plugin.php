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
        add_action('woocommerce_single_product_summary', [self::class, 'renderProductLoyalty'], 25);
        add_action('woocommerce_before_cart', [self::class, 'renderCartNotice']);
        add_action('woocommerce_review_order_before_payment', [self::class, 'renderCheckoutLoyalty']);
        add_action('woocommerce_thankyou', [self::class, 'renderPostPurchaseLoyalty'], 20, 1);
        Referrals::boot();
        ExperienceSnapshot::boot();
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
        echo '<tr><th scope="row"><label for="starfiniti_setup_code">' . esc_html__('One-time setup code', 'starfiniti-loyalty') . '</label></th><td>';
        echo '<textarea class="large-text code" id="starfiniti_setup_code" name="setup_code" rows="6" spellcheck="false"></textarea>';
        echo '<p class="description">' . esc_html__('Paste the complete setup code issued by the hub. It configures all connection fields at once.', 'starfiniti-loyalty') . '</p></td></tr>';
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
        $snapshotState = ExperienceSnapshot::stateForUser(get_current_user_id());
        echo '<h2>' . esc_html__('Loyalty rewards', 'starfiniti-loyalty') . '</h2>';
        if ('fresh' === $snapshotState['state'] && is_array($snapshotState['snapshot'])) {
            self::renderSnapshotSummary($snapshotState['snapshot']);
        } elseif ('stale' === $snapshotState['state']) {
            echo '<p>' . esc_html__(
                'Your loyalty summary is refreshing. Open your secure loyalty account for the latest balance.',
                'starfiniti-loyalty'
            ) . '</p>';
        }
        $accountLink = CustomerClaim::linkForUser(get_current_user_id());
        if ('' !== $accountLink) {
            echo '<p>' . esc_html__(
                'View your live points, tier, and available rewards in the secure loyalty hub.',
                'starfiniti-loyalty'
            ) . '</p>';
            echo '<p><a class="button" rel="noreferrer" href="' . esc_url($accountLink) . '">' . esc_html__(
                'Open loyalty account',
                'starfiniti-loyalty'
            ) . '</a></p>';
        }
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
        if (! is_user_logged_in()) {
            return;
        }
        $customerId = get_current_user_id();
        if ([] !== self::customerCoupons($customerId)) {
            wc_print_notice(sprintf(
                /* translators: %s is the My Account loyalty URL. */
                wp_kses(__('You have an active loyalty reward. <a href="%s">View your code</a>.', 'starfiniti-loyalty'), ['a' => ['href' => true]]),
                esc_url(wc_get_account_endpoint_url('loyalty'))
            ), 'notice');
        }
        self::renderPlacementNotice('cart', ExperienceSnapshot::stateForUser($customerId));
    }

    public static function renderProductLoyalty(): void
    {
        if (is_user_logged_in()) {
            self::renderPlacementNotice(
                'product',
                ExperienceSnapshot::stateForUser(get_current_user_id())
            );
        }
    }

    public static function renderCheckoutLoyalty(): void
    {
        if (is_user_logged_in()) {
            self::renderPlacementNotice(
                'checkout',
                ExperienceSnapshot::stateForUser(get_current_user_id())
            );
        }
    }

    /** @param int|string $orderId */
    public static function renderPostPurchaseLoyalty($orderId): void
    {
        if (! is_user_logged_in()) {
            return;
        }
        $order = wc_get_order((int) $orderId);
        $customerId = get_current_user_id();
        if (! $order instanceof \WC_Order || $order->get_customer_id() !== $customerId) {
            return;
        }
        self::renderPlacementNotice(
            'post_purchase',
            ExperienceSnapshot::stateForUser($customerId)
        );
    }

    /** @param array<string,mixed> $snapshot */
    private static function renderSnapshotSummary(array $snapshot): void
    {
        echo '<section class="starfiniti-loyalty-summary" aria-labelledby="starfiniti-loyalty-balance">';
        echo '<h3 id="starfiniti-loyalty-balance">' . esc_html__('Points balance', 'starfiniti-loyalty') . '</h3>';
        echo '<p><strong>' . esc_html(sprintf(
            /* translators: %s is an exact loyalty-points balance. */
            __('%s points available', 'starfiniti-loyalty'),
            (string) $snapshot['balances']['available']
        )) . '</strong><br><small>' . esc_html(sprintf(
            /* translators: 1: pending points, 2: reserved points. */
            __('Pending: %1$s · Reserved: %2$s', 'starfiniti-loyalty'),
            (string) $snapshot['balances']['pending'],
            (string) $snapshot['balances']['reserved']
        )) . '</small></p>';
        if (is_array($snapshot['currentTier'] ?? null)) {
            echo '<p>' . esc_html(sprintf(
                /* translators: %s is the current VIP tier name. */
                __('VIP tier: %s', 'starfiniti-loyalty'),
                (string) $snapshot['currentTier']['name']
            )) . '</p>';
        }
        if (is_array($snapshot['nextExpiry'] ?? null)) {
            $expiry = ExperienceSnapshot::displayInstant((string) $snapshot['nextExpiry']['expiresAt']);
            if (null !== $expiry) {
                echo '<p>' . esc_html(sprintf(
                    /* translators: 1: expiring points, 2: locale-neutral expiry date. */
                    __('%1$s points expire %2$s', 'starfiniti-loyalty'),
                    (string) $snapshot['nextExpiry']['points'],
                    $expiry
                )) . '</p>';
            }
        }
        if (($snapshot['enhancementsEnabled'] ?? false) && [] !== $snapshot['rewards']) {
            echo '<h3>' . esc_html__('Available rewards', 'starfiniti-loyalty') . '</h3><ul>';
            foreach ($snapshot['rewards'] as $reward) {
                $message = $reward['affordable']
                    ? __('%1$s — %2$s points', 'starfiniti-loyalty')
                    : __('%1$s — %2$s points needed', 'starfiniti-loyalty');
                echo '<li>' . esc_html(sprintf(
                    /* translators: 1: reward name, 2: exact points cost. */
                    $message,
                    (string) $reward['name'],
                    (string) $reward['costPoints']
                )) . '</li>';
            }
            echo '</ul>';
        }
        $generated = ExperienceSnapshot::displayInstant((string) $snapshot['generatedAt']);
        if (null !== $generated) {
            echo '<p><small>' . esc_html(sprintf(
                /* translators: %s is the locale-neutral snapshot time. */
                __('Last updated %s. Live value is confirmed in the secure loyalty hub.', 'starfiniti-loyalty'),
                $generated
            )) . '</small></p>';
        }
        echo '</section>';
    }

    /** @param array{state:string,snapshot:?array} $state */
    private static function renderPlacementNotice(string $placement, array $state): void
    {
        $snapshot = $state['snapshot'];
        if (! is_array($snapshot) || ! ($snapshot['enhancementsEnabled'] ?? false)) {
            return;
        }
        $accountUrl = wc_get_account_endpoint_url('loyalty');
        if ('stale' === $state['state']) {
            echo '<p class="starfiniti-loyalty-notice">' . esc_html__(
                'Your loyalty summary is refreshing. Open your secure loyalty account for the latest balance.',
                'starfiniti-loyalty'
            ) . ' <a href="' . esc_url($accountUrl) . '">' . esc_html__('View loyalty account', 'starfiniti-loyalty') . '</a></p>';
            return;
        }
        if ('fresh' !== $state['state']) {
            return;
        }
        $available = (string) $snapshot['balances']['available'];
        $message = match ($placement) {
            'checkout' => __('Loyalty balance: %s points. Rewards are redeemed through your loyalty account.', 'starfiniti-loyalty'),
            'post_purchase' => __('Eligible loyalty points are added after your order is processed. Current balance: %s points.', 'starfiniti-loyalty'),
            default => __('You have %s loyalty points.', 'starfiniti-loyalty'),
        };
        echo '<p class="starfiniti-loyalty-notice">' . esc_html(sprintf(
            /* translators: %s is an exact loyalty-points balance. */
            $message,
            $available
        )) . ' <a href="' . esc_url($accountUrl) . '">' . esc_html__('View loyalty account', 'starfiniti-loyalty') . '</a></p>';
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
