<?php

use Automattic\WooCommerce\Utilities\OrderUtil;
use Starfiniti\Loyalty\Commands;
use Starfiniti\Loyalty\Outbox;

defined('ABSPATH') || exit(1);

/** @param mixed $condition */
function starfiniti_runtime_assert($condition, string $message): void
{
    if (! $condition) {
        fwrite(STDERR, "FAIL: {$message}\n");
        exit(1);
    }
    fwrite(STDOUT, "PASS: {$message}\n");
}

starfiniti_runtime_assert(class_exists('WooCommerce'), 'WooCommerce is active');
starfiniti_runtime_assert(class_exists(Outbox::class), 'Starfiniti Loyalty is active');
starfiniti_runtime_assert(
    OrderUtil::custom_orders_table_usage_is_enabled(),
    'HPOS is enabled for the runtime smoke test'
);

Outbox::install();
global $wpdb;
$outboxTable = $wpdb->prefix . 'starfiniti_loyalty_outbox';
starfiniti_runtime_assert(
    $wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $outboxTable)) === $outboxTable,
    'plugin activation creates the durable local outbox'
);

$customerId = wc_create_new_customer(
    'runtime-smoke@example.test',
    'starfiniti-runtime-smoke',
    wp_generate_password(24, true)
);
starfiniti_runtime_assert(! is_wp_error($customerId), 'WooCommerce customer fixture is created');

$product = new WC_Product_Simple();
$product->set_name('Starfiniti runtime smoke product');
$product->set_status('publish');
$product->set_regular_price('20.00');
$productId = $product->save();
starfiniti_runtime_assert($productId > 0, 'WooCommerce product fixture is created');

$reservationId = '63000000-0000-4000-8000-000000000001';
$couponCode = 'SF0123456789ABCDEF0123456789ABCDEF';
$execute = new ReflectionMethod(Commands::class, 'execute');
$execute->setAccessible(true);
$issue = $execute->invoke(null, [
    'version' => '1',
    'commandId' => '61000000-0000-4000-8000-000000000001',
    'connectionId' => '62000000-0000-4000-8000-000000000001',
    'topic' => 'woocommerce.coupon.issue',
    'payloadVersion' => 'v1',
    'deliveredAt' => gmdate('c'),
    'payload' => [
        'kind' => 'issue_coupon',
        'reservationId' => $reservationId,
        'code' => $couponCode,
        'externalCustomerId' => (string) $customerId,
        'expiresAt' => gmdate('c', time() + DAY_IN_SECONDS),
        'reward' => [
            'kind' => 'fixed_discount',
            'amountMinor' => '1000',
            'currencyMinorUnitDigits' => 2,
        ],
    ],
]);
starfiniti_runtime_assert(
    is_array($issue) && ($issue['outcome'] ?? null) === 'delivered',
    'signed-command executor creates a native coupon'
);
$couponId = wc_get_coupon_id_by_code($couponCode);
$coupon = new WC_Coupon($couponId);
starfiniti_runtime_assert(
    $couponId > 0
    && $coupon->get_usage_limit() === 1
    && (string) $coupon->get_meta('_starfiniti_reservation_id', true) === $reservationId
    && (string) $coupon->get_meta('_starfiniti_external_customer_id', true) === (string) $customerId,
    'native coupon is one-use and bound to the reservation and customer'
);

$order = wc_create_order(['customer_id' => $customerId]);
starfiniti_runtime_assert(! is_wp_error($order), 'HPOS order fixture is created');
$order->add_product($product, 1);
wp_set_current_user((int) $customerId);
$applyResult = $order->apply_coupon($couponCode);
starfiniti_runtime_assert(! is_wp_error($applyResult), 'native coupon applies through WooCommerce core');
$order->calculate_totals();
$order->save();
$order->update_status('completed');
$orderId = $order->get_id();
starfiniti_runtime_assert(
    wc_get_order($orderId) instanceof WC_Order,
    'completed order round-trips through HPOS getters'
);

$captureRows = (int) $wpdb->get_var($wpdb->prepare(
    "SELECT COUNT(*) FROM {$outboxTable} WHERE event_type = %s AND source_object_id = %s",
    'commerce.coupon.captured',
    $reservationId
));
starfiniti_runtime_assert($captureRows === 1, 'completed coupon use creates one local capture event');
$capturePayload = (string) $wpdb->get_var($wpdb->prepare(
    "SELECT event_payload FROM {$outboxTable} WHERE event_type = %s AND source_object_id = %s LIMIT 1",
    'commerce.coupon.captured',
    $reservationId
));
starfiniti_runtime_assert(
    str_contains($capturePayload, $reservationId)
    && str_contains($capturePayload, (string) $orderId)
    && ! str_contains($capturePayload, 'runtime-smoke@example.test'),
    'coupon capture evidence is PII-free'
);

$coupon = new WC_Coupon($couponId);
starfiniti_runtime_assert($coupon->get_usage_count() > 0, 'WooCommerce records native coupon use');
$cancel = $execute->invoke(null, [
    'version' => '1',
    'commandId' => '61000000-0000-4000-8000-000000000002',
    'connectionId' => '62000000-0000-4000-8000-000000000001',
    'topic' => 'woocommerce.coupon.cancel',
    'payloadVersion' => 'v1',
    'deliveredAt' => gmdate('c'),
    'payload' => [
        'kind' => 'cancel_coupon',
        'reservationId' => $reservationId,
        'code' => $couponCode,
    ],
]);
starfiniti_runtime_assert(
    is_array($cancel)
    && ($cancel['outcome'] ?? null) === 'dead_letter'
    && ($cancel['errorCode'] ?? null) === 'coupon_already_used',
    'used coupon cannot be cancelled and released'
);

starfiniti_runtime_assert(Outbox::reconcileOrder($orderId), 'source order reconciliation is available');
starfiniti_runtime_assert(Outbox::reconcileOrder($orderId), 'source reconciliation retry is accepted');
$captureRowsAfterRetry = (int) $wpdb->get_var($wpdb->prepare(
    "SELECT COUNT(*) FROM {$outboxTable} WHERE event_type = %s AND source_object_id = %s",
    'commerce.coupon.captured',
    $reservationId
));
starfiniti_runtime_assert(
    $captureRowsAfterRetry === 1,
    'source reconciliation does not duplicate coupon capture'
);
starfiniti_runtime_assert(
    has_action('woocommerce_before_cart', ['Starfiniti\\Loyalty\\Plugin', 'renderCartNotice']) !== false
    && has_filter('woocommerce_coupon_is_valid', [Commands::class, 'validateCustomer']) !== false,
    'storefront and customer-scope hooks are registered'
);

fwrite(STDOUT, "WooCommerce HPOS runtime smoke passed.\n");
