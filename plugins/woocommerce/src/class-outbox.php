<?php

namespace Starfiniti\Loyalty;

defined('ABSPATH') || exit;

final class Outbox
{
    private const ACTION = 'starfiniti_loyalty_deliver_outbox';
    private const GROUP = 'starfiniti-loyalty';
    private const MAX_ATTEMPTS = 12;

    public static function install(): void
    {
        global $wpdb;
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';

        $table = self::table();
        $charset = $wpdb->get_charset_collate();
        dbDelta("CREATE TABLE {$table} (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            delivery_id char(36) NOT NULL,
            event_key varchar(255) NOT NULL,
            event_type varchar(100) NOT NULL,
            source_object_id varchar(255) NOT NULL,
            source_revision varchar(255) DEFAULT NULL,
            occurred_gmt datetime NOT NULL,
            event_payload longtext NOT NULL,
            envelope longtext DEFAULT NULL,
            state varchar(20) NOT NULL DEFAULT 'pending',
            attempts int(10) unsigned NOT NULL DEFAULT 0,
            available_gmt datetime NOT NULL,
            created_gmt datetime NOT NULL,
            updated_gmt datetime NOT NULL,
            last_error_code varchar(100) DEFAULT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY delivery_id (delivery_id),
            UNIQUE KEY event_key (event_key),
            KEY claim (state,available_gmt,id)
        ) {$charset};");
    }

    public static function boot(): void
    {
        add_action('woocommerce_order_status_changed', [self::class, 'captureOrderStatus'], 10, 4);
        add_action('woocommerce_refund_created', [self::class, 'captureRefund'], 10, 2);
        add_action('woocommerce_created_customer', [self::class, 'captureCustomerCreation'], 20, 1);
        add_action('transition_comment_status', [self::class, 'captureReviewVerification'], 20, 3);
        add_action('delete_user', [self::class, 'captureCustomerDeletion'], 10, 1);
        add_action(self::ACTION, [self::class, 'deliverPending']);
    }

    /**
     * @param int      $orderId Order ID.
     * @param string   $from Previous status.
     * @param string   $to New status.
     * @param \WC_Order $order Order object.
     */
    public static function captureOrderStatus(int $orderId, string $from, string $to, $order): void
    {
        if (! $order instanceof \WC_Order) {
            return;
        }

        $revision = $order->get_date_modified();
        self::enqueue(
            sprintf('order:%d:status:%s:%s:%s', $orderId, $from, $to, $revision ? $revision->getTimestamp() : '0'),
            'commerce.order.status_changed',
            (string) $orderId,
            $revision ? (string) $revision->getTimestamp() : null,
            [
                'kind' => 'order_status_changed',
                'previousStatus' => sanitize_key($from),
                'order' => self::orderFact($order),
            ],
            $revision ? gmdate('Y-m-d H:i:s', $revision->getTimestamp()) : null
        );
        if ('completed' === $to) {
            self::captureCoupons($order);
        }
    }

    public static function captureRefund(int $refundId, array $args): void
    {
        $refund = wc_get_order($refundId);
        if (! $refund instanceof \WC_Order_Refund) {
            return;
        }

        $orderId = $refund->get_parent_id();
        $order = wc_get_order($orderId);
        if (! $order instanceof \WC_Order) {
            return;
        }
        self::enqueue(
            sprintf('refund:%d:order:%d', $refundId, $orderId),
            'commerce.order.refunded',
            (string) $orderId,
            (string) $refundId,
            [
                'kind' => 'order_refunded',
                'refundId' => (string) $refundId,
                'refundAmount' => self::money($refund->get_amount(), true),
                'order' => self::orderFact($order),
            ],
            $refund->get_date_created()
                ? gmdate('Y-m-d H:i:s', $refund->get_date_created()->getTimestamp())
                : null
        );
    }

    public static function captureCustomerDeletion(int $customerId): void
    {
        if ($customerId <= 0) {
            return;
        }
        $externalCustomerId = (string) $customerId;
        self::enqueue(
            'privacy-erasure:' . hash_hmac('sha256', $externalCustomerId, wp_salt('auth')),
            'commerce.customer.deleted',
            'customer-erasure',
            null,
            [
                'kind' => 'customer_deleted',
                'externalCustomerId' => $externalCustomerId,
            ]
        );
    }

    public static function captureCustomerCreation(int $customerId): void
    {
        if ($customerId <= 0) {
            return;
        }
        self::enqueue(
            'customer:' . $customerId . ':created',
            'commerce.customer.created',
            (string) $customerId,
            null,
            [
                'kind' => 'customer_created',
                'externalCustomerId' => (string) $customerId,
            ]
        );
    }

    /** @param mixed $comment */
    public static function captureReviewVerification(
        string $newStatus,
        string $oldStatus,
        $comment
    ): void {
        if (
            'approved' !== $newStatus
            || 'approved' === $oldStatus
            || ! $comment instanceof \WP_Comment
            || 'product' !== get_post_type((int) $comment->comment_post_ID)
            || (int) $comment->user_id <= 0
        ) {
            return;
        }
        $reviewId = (int) $comment->comment_ID;
        $productId = (int) $comment->comment_post_ID;
        $verified = '1' === (string) get_comment_meta($reviewId, 'verified', true)
            || wc_customer_bought_product('', (int) $comment->user_id, $productId);
        if (! $verified) {
            return;
        }
        $product = wc_get_product($productId);
        $categoryIds = $product instanceof \WC_Product
            ? array_map('strval', $product->get_category_ids())
            : [];
        self::enqueue(
            'review:' . $reviewId . ':verified',
            'commerce.review.verified',
            (string) $reviewId,
            (string) $productId,
            [
                'kind' => 'verified_product_review',
                'externalCustomerId' => (string) $comment->user_id,
                'reviewId' => (string) $reviewId,
                'productId' => (string) $productId,
                'categoryIds' => $categoryIds,
            ],
            '' !== (string) $comment->comment_date_gmt
                ? (string) $comment->comment_date_gmt
                : null
        );
    }

    public static function reconcileOrder(int $orderId): bool
    {
        $order = wc_get_order($orderId);
        if (! $order instanceof \WC_Order || $order instanceof \WC_Order_Refund) {
            return false;
        }
        $revision = $order->get_date_modified();
        $completed = $order->get_date_completed();
        $occurred = $completed ?: $revision;
        $orderFact = self::orderFact($order);
        if ($completed) {
            $orderFact['status'] = 'completed';
        }
        self::enqueue(
            sprintf('order:%d:reconcile:%s', $orderId, $revision ? $revision->getTimestamp() : '0'),
            'commerce.order.status_changed',
            (string) $orderId,
            $revision ? (string) $revision->getTimestamp() : null,
            [
                'kind' => 'order_status_changed',
                'previousStatus' => sanitize_key($order->get_status()),
                'order' => $orderFact,
            ],
            $occurred ? gmdate('Y-m-d H:i:s', $occurred->getTimestamp()) : null
        );
        foreach ($order->get_refunds() as $refund) {
            if ($refund instanceof \WC_Order_Refund) {
                self::captureRefund($refund->get_id(), []);
            }
        }
        if ($completed) {
            self::captureCoupons($order);
        }
        return true;
    }

    public static function captureCoupons(\WC_Order $order): void
    {
        $orderId = $order->get_id();
        $occurred = $order->get_date_completed() ?: $order->get_date_modified();
        foreach ($order->get_coupon_codes() as $rawCode) {
            $couponId = wc_get_coupon_id_by_code((string) $rawCode);
            if ($couponId < 1) {
                continue;
            }
            $coupon = new \WC_Coupon($couponId);
            $reservationId = (string) $coupon->get_meta('_starfiniti_reservation_id', true);
            $externalCustomerId = (string) $coupon->get_meta('_starfiniti_external_customer_id', true);
            if (
                ! wp_is_uuid($reservationId)
                || '' === $externalCustomerId
                || (string) $order->get_customer_id() !== $externalCustomerId
            ) {
                continue;
            }
            self::enqueue(
                sprintf('coupon:%s:captured:order:%d', $reservationId, $orderId),
                'commerce.coupon.captured',
                $reservationId,
                (string) $orderId,
                [
                    'kind' => 'coupon_captured',
                    'reservationId' => $reservationId,
                    'orderId' => (string) $orderId,
                ],
                $occurred ? gmdate('Y-m-d H:i:s', $occurred->getTimestamp()) : null
            );
        }
    }

    /** @param array<string, mixed> $payload */
    private static function enqueue(
        string $eventKey,
        string $eventType,
        string $sourceObjectId,
        ?string $sourceRevision,
        array $payload,
        ?string $occurredGmt = null
    ): void {
        global $wpdb;
        $now = gmdate('Y-m-d H:i:s');
        $inserted = $wpdb->query($wpdb->prepare(
            'INSERT IGNORE INTO ' . self::table() .
            ' (delivery_id,event_key,event_type,source_object_id,source_revision,occurred_gmt,event_payload,state,available_gmt,created_gmt,updated_gmt)' .
            ' VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',
            wp_generate_uuid4(),
            $eventKey,
            $eventType,
            $sourceObjectId,
            $sourceRevision,
            $occurredGmt ?? $now,
            wp_json_encode($payload, JSON_UNESCAPED_SLASHES),
            'pending',
            $now,
            $now,
            $now
        ));

        if (1 === $inserted) {
            self::schedule(0);
        }
    }

    public static function deliverPending(): void
    {
        global $wpdb;
        $row = $wpdb->get_row($wpdb->prepare(
            'SELECT * FROM ' . self::table() . ' WHERE state IN (%s,%s) AND available_gmt <= %s ORDER BY id ASC LIMIT 1',
            'pending',
            'retryable',
            gmdate('Y-m-d H:i:s')
        ), ARRAY_A);
        if (! is_array($row)) {
            return;
        }

        $endpoint = Settings::endpoint();
        $connectionId = Settings::connectionId();
        $keyVersion = Settings::keyVersion();
        $signingKey = Settings::signingKey();
        if ('' === $endpoint || '' === $connectionId || '' === $keyVersion || '' === $signingKey) {
            self::retry((int) $row['id'], (int) $row['attempts'], 'connector_not_configured');
            return;
        }

        $envelope = (string) $row['envelope'];
        if ('' === $envelope) {
            $occurred = gmdate('c', strtotime((string) $row['occurred_gmt'] . ' UTC'));
            $envelope = (string) wp_json_encode([
                'version' => '1',
                'deliveryId' => (string) $row['delivery_id'],
                'connectionId' => $connectionId,
                'sourceEventId' => (string) $row['event_key'],
                'eventType' => (string) $row['event_type'],
                'sourceObjectId' => (string) $row['source_object_id'],
                'sourceRevision' => $row['source_revision'],
                'occurredAt' => $occurred,
                'deliveredAt' => gmdate('c'),
                'payload' => json_decode((string) $row['event_payload'], true),
            ], JSON_UNESCAPED_SLASHES);
            $wpdb->update(self::table(), ['envelope' => $envelope], ['id' => (int) $row['id']], ['%s'], ['%d']);
        }

        $timestamp = (string) time();
        $nonce = (string) $row['delivery_id'];
        $bodyHash = hash('sha256', $envelope);
        $path = (string) wp_parse_url($endpoint, PHP_URL_PATH);
        $query = (string) wp_parse_url($endpoint, PHP_URL_QUERY);
        $requestTarget = $path . ('' !== $query ? '?' . $query : '');
        $message = implode("\n", ['starfiniti-woocommerce-v1', $requestTarget, $connectionId, (string) $row['delivery_id'], $timestamp, $nonce, $bodyHash]);
        $signature = hash_hmac('sha256', $message, $signingKey);

        $response = wp_remote_post($endpoint, [
            'timeout' => 10,
            'headers' => [
                'Content-Type' => 'application/json',
                'X-Starfiniti-Connection-ID' => $connectionId,
                'X-Starfiniti-Delivery-ID' => (string) $row['delivery_id'],
                'X-Starfiniti-Timestamp' => $timestamp,
                'X-Starfiniti-Nonce' => $nonce,
                'X-Starfiniti-Key-Version' => $keyVersion,
                'X-Starfiniti-Body-SHA256' => $bodyHash,
                'X-Starfiniti-Signature' => $signature,
            ],
            'body' => $envelope,
            'data_format' => 'body',
        ]);

        if (! is_wp_error($response)) {
            $status = wp_remote_retrieve_response_code($response);
            if ($status >= 200 && $status < 300) {
                $wpdb->update(
                    self::table(),
                    ['state' => 'delivered', 'updated_gmt' => gmdate('Y-m-d H:i:s'), 'last_error_code' => null],
                    ['id' => (int) $row['id']],
                    ['%s', '%s', '%s'],
                    ['%d']
                );
                self::schedule(0);
                return;
            }
            self::retry((int) $row['id'], (int) $row['attempts'], 'http_' . $status);
            return;
        }

        self::retry((int) $row['id'], (int) $row['attempts'], 'network_error');
    }

    private static function retry(int $id, int $attempts, string $errorCode): void
    {
        global $wpdb;
        $nextAttempt = $attempts + 1;
        $state = $nextAttempt >= self::MAX_ATTEMPTS ? 'dead_letter' : 'retryable';
        $delay = min(21600, 30 * (2 ** min($nextAttempt, 9)));
        $wpdb->update(
            self::table(),
            [
                'state' => $state,
                'attempts' => $nextAttempt,
                'available_gmt' => gmdate('Y-m-d H:i:s', time() + $delay),
                'updated_gmt' => gmdate('Y-m-d H:i:s'),
                'last_error_code' => $errorCode,
            ],
            ['id' => $id],
            ['%s', '%d', '%s', '%s', '%s'],
            ['%d']
        );
        if ('retryable' === $state) {
            self::schedule($delay);
        }
    }

    private static function schedule(int $delay): void
    {
        if (function_exists('as_has_scheduled_action') && function_exists('as_schedule_single_action')) {
            if (! as_has_scheduled_action(self::ACTION, [], self::GROUP)) {
                as_schedule_single_action(time() + $delay, self::ACTION, [], self::GROUP);
            }
        }
    }

    /** @return array<string, int> */
    public static function diagnostics(): array
    {
        global $wpdb;
        $counts = [
            'pending' => 0,
            'retryable' => 0,
            'delivered' => 0,
            'dead_letter' => 0,
        ];
        $rows = $wpdb->get_results(
            'SELECT state, COUNT(*) AS event_count FROM ' . self::table() . ' GROUP BY state',
            ARRAY_A
        );
        foreach ($rows as $row) {
            $state = (string) ($row['state'] ?? '');
            if (array_key_exists($state, $counts)) {
                $counts[$state] = (int) ($row['event_count'] ?? 0);
            }
        }
        return $counts;
    }

    public static function retryDeadLetters(int $limit): int
    {
        global $wpdb;
        $limit = max(1, min(500, $limit));
        $now = gmdate('Y-m-d H:i:s');
        $updated = $wpdb->query($wpdb->prepare(
            'UPDATE ' . self::table() .
            ' SET state = %s, attempts = 0, available_gmt = %s, updated_gmt = %s, last_error_code = NULL' .
            ' WHERE state = %s ORDER BY id ASC LIMIT %d',
            'retryable',
            $now,
            $now,
            'dead_letter',
            $limit
        ));
        if (is_int($updated) && $updated > 0) {
            self::schedule(0);
            return $updated;
        }
        return 0;
    }

    /** @return array<string, mixed> */
    private static function orderFact(\WC_Order $order): array
    {
        $lines = [];
        $feeRefundedTotal = 0.0;
        foreach ($order->get_items('line_item') as $itemId => $item) {
            if (! $item instanceof \WC_Order_Item_Product) {
                continue;
            }
            $productId = $item->get_product_id();
            $product = wc_get_product($productId);
            $categoryIds = $product instanceof \WC_Product
                ? array_map('strval', $product->get_category_ids())
                : [];
            $collectionIds = apply_filters(
                'starfiniti_loyalty_line_collection_ids',
                [],
                $item,
                $order
            );
            if (! is_array($collectionIds)) {
                $collectionIds = [];
            }
            $collectionIds = array_values(array_filter(array_map(
                static fn ($value): string => sanitize_key((string) $value),
                $collectionIds
            )));
            $lines[] = [
                'lineId' => (string) $itemId,
                'productId' => (string) $productId,
                'variationId' => $item->get_variation_id() > 0
                    ? (string) $item->get_variation_id()
                    : null,
                'quantity' => self::quantity($item->get_quantity()),
                'categoryIds' => $categoryIds,
                'collectionIds' => $collectionIds,
                'subtotal' => self::money($item->get_subtotal()),
                'total' => self::money($item->get_total()),
                'refundedTotal' => self::money(
                    $order->get_total_refunded_for_item((int) $itemId),
                    true
                ),
            ];
        }
        foreach ($order->get_items('fee') as $itemId => $item) {
            if ($item instanceof \WC_Order_Item_Fee) {
                $feeRefundedTotal += abs($order->get_total_refunded_for_item((int) $itemId, 'fee'));
            }
        }

        $customerId = $order->get_customer_id();
        $paymentKind = apply_filters(
            'starfiniti_loyalty_payment_kind',
            'money',
            $order->get_payment_method(),
            $order
        );
        if (! in_array($paymentKind, ['money', 'gift-card', 'store-credit'], true)) {
            $paymentKind = 'money';
        }
        $market = strtoupper((string) $order->get_shipping_country());
        if ('' === $market) {
            $market = strtoupper((string) $order->get_billing_country());
        }
        if (! preg_match('/^[A-Z]{2}$/', $market)) {
            $market = 'ZZ';
        }

        return [
            'kind' => 'order',
            'orderId' => (string) $order->get_id(),
            'status' => sanitize_key($order->get_status()),
            'currency' => strtoupper((string) $order->get_currency()),
            'currencyMinorUnitDigits' => wc_get_price_decimals(),
            'market' => $market,
            'customer' => $customerId > 0
                ? ['kind' => 'registered', 'externalCustomerId' => (string) $customerId]
                : ['kind' => 'guest', 'guestOrderId' => (string) $order->get_id()],
            'paymentKind' => $paymentKind,
            'lines' => $lines,
            'shippingTotal' => self::money($order->get_shipping_total()),
            'shippingRefundedTotal' => self::money($order->get_total_shipping_refunded(), true),
            'taxTotal' => self::money($order->get_total_tax()),
            'taxRefundedTotal' => self::money($order->get_total_tax_refunded(), true),
            'feeTotal' => self::money($order->get_total_fees(), true),
            'feeRefundedTotal' => self::money($feeRefundedTotal, true),
            'discountTotal' => self::money($order->get_total_discount(), true),
            'refundedTotal' => self::money($order->get_total_refunded(), true),
        ];
    }

    /** @param mixed $value */
    private static function money($value, bool $absolute = false): string
    {
        $decimal = wc_format_decimal((string) $value, wc_get_price_decimals());
        if ($absolute && str_starts_with($decimal, '-')) {
            return substr($decimal, 1);
        }
        return $decimal;
    }

    /** @param mixed $value */
    private static function quantity($value): string
    {
        $decimal = wc_format_decimal((string) $value, 6);
        $trimmed = rtrim(rtrim($decimal, '0'), '.');
        return '' === $trimmed ? '0' : $trimmed;
    }

    private static function table(): string
    {
        global $wpdb;
        return $wpdb->prefix . 'starfiniti_loyalty_outbox';
    }
}
