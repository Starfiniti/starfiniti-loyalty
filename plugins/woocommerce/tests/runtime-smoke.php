<?php

use Automattic\WooCommerce\Utilities\OrderUtil;
use Automattic\WooCommerce\StoreApi\Utilities\CartController;
use Starfiniti\Loyalty\Commands;
use Starfiniti\Loyalty\CustomerClaim;
use Starfiniti\Loyalty\Outbox;
use Starfiniti\Loyalty\Plugin;
use Starfiniti\Loyalty\Settings;

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
$originalLocale = determine_locale();
starfiniti_runtime_assert(
    $originalLocale === 'sl_SI' || switch_to_locale('sl_SI'),
    'runtime can switch to the bundled Slovenian locale'
);
unload_textdomain('starfiniti-loyalty', true);
Plugin::loadTextDomain();
$localizedMenu = Plugin::accountMenuItems([
    'dashboard' => 'Dashboard',
    'customer-logout' => 'Logout',
]);
starfiniti_runtime_assert(
    ($localizedMenu['loyalty'] ?? null) === 'Nagrade za zvestobo',
    'bundled Slovenian customer navigation translation loads at runtime'
);
if ($originalLocale !== 'sl_SI') {
    restore_previous_locale();
}
unload_textdomain('starfiniti-loyalty', true);
Plugin::loadTextDomain();
$expectedHpos = get_option('starfiniti_runtime_expected_hpos');
starfiniti_runtime_assert(
    in_array($expectedHpos, ['yes', 'no'], true),
    'runtime smoke declares the expected order storage mode'
);
starfiniti_runtime_assert(
    OrderUtil::custom_orders_table_usage_is_enabled() === ($expectedHpos === 'yes'),
    $expectedHpos === 'yes'
        ? 'HPOS is enabled for the runtime smoke test'
        : 'legacy order storage is enabled for the runtime smoke test'
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

update_option(
    'starfiniti_loyalty_endpoint',
    'https://unreachable.invalid/api/v1/integrations/woocommerce/events',
    false
);
$claimConnectionId = '62000000-0000-4000-8000-000000000001';
$claimKeyVersion = 'v1';
$claimSigningKey = str_repeat("\x42", 32);
$encryptSigningKey = new ReflectionMethod(Settings::class, 'encrypt');
$encryptSigningKey->setAccessible(true);
$encryptedSigningKey = $encryptSigningKey->invoke(null, base64_encode($claimSigningKey));
starfiniti_runtime_assert(is_string($encryptedSigningKey), 'runtime can protect claim signing material');
update_option('starfiniti_loyalty_connection_id', $claimConnectionId, false);
update_option('starfiniti_loyalty_key_version', $claimKeyVersion, false);
update_option('starfiniti_loyalty_signing_key_encrypted', $encryptedSigningKey, false);
$claimLink = CustomerClaim::linkForUser((int) $customerId);
$claimQuery = [];
parse_str((string) wp_parse_url($claimLink, PHP_URL_QUERY), $claimQuery);
$claimMessage = implode("\n", [
    'starfiniti-woocommerce-customer-claim-v1',
    $claimConnectionId,
    (string) $customerId,
    (string) ($claimQuery['issuedAt'] ?? ''),
    (string) ($claimQuery['nonce'] ?? ''),
    $claimKeyVersion,
]);
starfiniti_runtime_assert(
    str_starts_with($claimLink, 'https://unreachable.invalid/claim/woocommerce?')
    && ($claimQuery['connectionId'] ?? null) === $claimConnectionId
    && ($claimQuery['externalCustomerId'] ?? null) === (string) $customerId
    && ($claimQuery['keyVersion'] ?? null) === $claimKeyVersion
    && ($claimQuery['lang'] ?? null) === 'sl-SI'
    && 1 === preg_match('/^\d{10}$/', (string) ($claimQuery['issuedAt'] ?? ''))
    && 1 === preg_match('/^[0-9a-f-]{36}$/', (string) ($claimQuery['nonce'] ?? ''))
    && hash_equals(
        hash_hmac('sha256', $claimMessage, $claimSigningKey),
        (string) ($claimQuery['signature'] ?? '')
    )
    && ! array_key_exists('email', $claimQuery),
    'customer claim is short-lived, channel-bound, PII-free, signed locally, and preserves the active locale'
);
$checkoutHttpRequests = 0;
$rejectCheckoutHttp = static function ($preempt) use (&$checkoutHttpRequests) {
    $checkoutHttpRequests++;
    return new WP_Error('starfiniti_runtime_hub_unavailable', 'Hub unavailable in runtime smoke.');
};
add_filter('pre_http_request', $rejectCheckoutHttp, 10, 1);

wp_set_current_user((int) $customerId);
ob_start();
Plugin::renderAccount();
$accountMarkup = (string) ob_get_clean();
ob_start();
Plugin::renderCartNotice();
$cartMarkup = (string) ob_get_clean();
starfiniti_runtime_assert(
    0 === $checkoutHttpRequests,
    'customer account and cart loyalty rendering make no hub request during outage'
);
starfiniti_runtime_assert(
    str_contains($accountMarkup, '<h2>')
    && str_contains($accountMarkup, '/claim/woocommerce?')
    && str_contains($accountMarkup, 'rel="noreferrer"')
    && str_contains($accountMarkup, esc_html($coupon->get_code()))
    && substr_count($accountMarkup, '<li>') <= 20
    && strlen($accountMarkup) <= 32768
    && ! str_contains($accountMarkup, '<script')
    && ! str_contains($accountMarkup, '<style'),
    'customer account loyalty markup is semantic, bounded, and asset-free'
);
starfiniti_runtime_assert(
    str_contains($cartMarkup, wc_get_account_endpoint_url('loyalty'))
    && strlen($cartMarkup) <= 4096
    && ! str_contains($cartMarkup, '<script')
    && ! str_contains($cartMarkup, '<style'),
    'cart loyalty notice is bounded, linked, and asset-free'
);

$cartController = new CartController();
$cartController->load_cart();
$cart = $cartController->get_cart_instance();
$cart->empty_cart();
$cartItemKey = $cart->add_to_cart($productId, 1);
starfiniti_runtime_assert(false !== $cartItemKey, 'classic cart fixture contains the product');
starfiniti_runtime_assert(
    $cart->apply_coupon($couponCode) && $cart->has_discount($couponCode),
    'classic cart applies the native loyalty coupon'
);
$cart->remove_coupon($couponCode);
$storeApiCouponCode = wc_format_coupon_code($couponCode);
$cartController->apply_coupon($storeApiCouponCode);
starfiniti_runtime_assert(
    $cartController->has_coupon($storeApiCouponCode),
    'Cart and Checkout Blocks Store API controller applies the native loyalty coupon'
);
$cart->empty_cart();

$order = wc_create_order(['customer_id' => $customerId]);
starfiniti_runtime_assert(! is_wp_error($order), 'order fixture is created through WooCommerce CRUD');
$order->add_product($product, 1);
$applyResult = $order->apply_coupon($couponCode);
starfiniti_runtime_assert(! is_wp_error($applyResult), 'native coupon applies through WooCommerce core');
starfiniti_runtime_assert(
    0 === $checkoutHttpRequests,
    'coupon validation makes no hub request when the configured hub is unavailable'
);
remove_filter('pre_http_request', $rejectCheckoutHttp, 10);
$order->calculate_totals();
$order->save();
$order->update_status('completed');
$orderId = $order->get_id();
starfiniti_runtime_assert(
    wc_get_order($orderId) instanceof WC_Order,
    'completed order round-trips through WooCommerce CRUD getters'
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
$partialRefund = wc_create_refund([
    'amount' => '4.00',
    'reason' => 'Runtime smoke partial refund',
    'order_id' => $orderId,
    'refund_payment' => false,
    'restock_items' => false,
]);
starfiniti_runtime_assert(
    $partialRefund instanceof WC_Order_Refund,
    'partial refund is created through WooCommerce CRUD'
);
$refreshedOrder = wc_get_order($orderId);
$remainingRefundAmount = $refreshedOrder instanceof WC_Order
    ? $refreshedOrder->get_remaining_refund_amount()
    : 0;
$finalRefund = wc_create_refund([
    'amount' => $remainingRefundAmount,
    'reason' => 'Runtime smoke final refund',
    'order_id' => $orderId,
    'refund_payment' => false,
    'restock_items' => false,
]);
starfiniti_runtime_assert(
    $remainingRefundAmount > 0 && $finalRefund instanceof WC_Order_Refund,
    'remaining amount is fully refunded through WooCommerce CRUD'
);
$refundRows = (int) $wpdb->get_var($wpdb->prepare(
    "SELECT COUNT(*) FROM {$outboxTable} WHERE event_type = %s AND source_object_id = %s",
    'commerce.order.refunded',
    (string) $orderId
));
starfiniti_runtime_assert($refundRows === 2, 'partial and final refunds create two source facts');
$refundPayloads = (string) $wpdb->get_var($wpdb->prepare(
    "SELECT GROUP_CONCAT(event_payload SEPARATOR '\n') FROM {$outboxTable} WHERE event_type = %s AND source_object_id = %s",
    'commerce.order.refunded',
    (string) $orderId
));
starfiniti_runtime_assert(
    ! str_contains($refundPayloads, 'runtime-smoke@example.test'),
    'refund source facts are PII-free'
);
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
$reconciliation = $execute->invoke(null, [
    'version' => '1',
    'commandId' => '61000000-0000-4000-8000-000000000004',
    'connectionId' => '62000000-0000-4000-8000-000000000001',
    'topic' => 'woocommerce.order.reconcile',
    'payloadVersion' => 'v1',
    'deliveredAt' => gmdate('c'),
    'payload' => ['kind' => 'reconcile_order', 'orderId' => (string) $orderId],
]);
starfiniti_runtime_assert(
    is_array($reconciliation)
    && ($reconciliation['outcome'] ?? null) === 'delivered'
    && ($reconciliation['resultReference'] ?? null) === 'woocommerce:order:' . $orderId,
    'signed hub command reconciles a source order through the durable local outbox'
);
$missingReconciliation = $execute->invoke(null, [
    'version' => '1',
    'commandId' => '61000000-0000-4000-8000-000000000005',
    'connectionId' => '62000000-0000-4000-8000-000000000001',
    'topic' => 'woocommerce.order.reconcile',
    'payloadVersion' => 'v1',
    'deliveredAt' => gmdate('c'),
    'payload' => ['kind' => 'reconcile_order', 'orderId' => '999999999'],
]);
starfiniti_runtime_assert(
    is_array($missingReconciliation)
    && ($missingReconciliation['outcome'] ?? null) === 'dead_letter'
    && ($missingReconciliation['errorCode'] ?? null) === 'order_not_found',
    'missing source order reconciliation fails explicitly without retry storm'
);
$captureRowsAfterRetry = (int) $wpdb->get_var($wpdb->prepare(
    "SELECT COUNT(*) FROM {$outboxTable} WHERE event_type = %s AND source_object_id = %s",
    'commerce.coupon.captured',
    $reservationId
));
starfiniti_runtime_assert(
    $captureRowsAfterRetry === 1,
    'source reconciliation does not duplicate coupon capture'
);
$refundRowsAfterRetry = (int) $wpdb->get_var($wpdb->prepare(
    "SELECT COUNT(*) FROM {$outboxTable} WHERE event_type = %s AND source_object_id = %s",
    'commerce.order.refunded',
    (string) $orderId
));
starfiniti_runtime_assert(
    $refundRowsAfterRetry === 2,
    'source reconciliation does not duplicate refund facts'
);
$retryTable = esc_sql($outboxTable);
for ($attempt = 0; $attempt < 12; $attempt++) {
    $wpdb->query(
        "UPDATE {$retryTable} SET available_gmt = UTC_TIMESTAMP() WHERE state IN ('pending','retryable')"
    );
    Outbox::deliverPending();
}
$queueDiagnostics = Outbox::diagnostics();
starfiniti_runtime_assert(
    ($queueDiagnostics['dead_letter'] ?? 0) === 1,
    'bounded connector failures move one source event to dead letter'
);
starfiniti_runtime_assert(
    Outbox::retryDeadLetters(1) === 1,
    'operator recovery returns a dead-letter event to the retry queue'
);
$recoveredDiagnostics = Outbox::diagnostics();
starfiniti_runtime_assert(
    ($recoveredDiagnostics['dead_letter'] ?? 0) === 0
    && ($recoveredDiagnostics['retryable'] ?? 0) >= 1,
    'queue diagnostics expose the recovered retryable event'
);
Outbox::captureCustomerDeletion((int) $customerId);
Outbox::captureCustomerDeletion((int) $customerId);
$privacyRows = (array) $wpdb->get_results($wpdb->prepare(
    "SELECT event_key,event_type,source_object_id,event_payload FROM {$outboxTable} WHERE event_type = %s",
    'commerce.customer.deleted'
), ARRAY_A);
$privacyPayload = isset($privacyRows[0]['event_payload'])
    ? json_decode((string) $privacyRows[0]['event_payload'], true)
    : null;
starfiniti_runtime_assert(
    count($privacyRows) === 1
    && ($privacyRows[0]['source_object_id'] ?? null) === 'customer-erasure'
    && 1 === preg_match('/^privacy-erasure:[0-9a-f]{64}$/', (string) ($privacyRows[0]['event_key'] ?? ''))
    && is_array($privacyPayload)
    && ($privacyPayload['kind'] ?? null) === 'customer_deleted'
    && ($privacyPayload['externalCustomerId'] ?? null) === (string) $customerId
    && ! array_key_exists('email', $privacyPayload),
    'customer erasure is queued once with an opaque key and the minimum channel subject'
);
starfiniti_runtime_assert(
    has_action('woocommerce_before_cart', ['Starfiniti\\Loyalty\\Plugin', 'renderCartNotice']) !== false
    && has_filter('woocommerce_coupon_is_valid', [Commands::class, 'validateCustomer']) !== false
    && has_action('delete_user', [Outbox::class, 'captureCustomerDeletion']) !== false,
    'storefront, customer-scope, and privacy lifecycle hooks are registered'
);

fwrite(STDOUT, sprintf(
    "WooCommerce %s runtime smoke passed.\n",
    $expectedHpos === 'yes' ? 'HPOS' : 'legacy-storage'
));
