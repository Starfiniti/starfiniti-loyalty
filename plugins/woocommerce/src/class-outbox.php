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
                'orderId' => (string) $orderId,
                'fromStatus' => $from,
                'toStatus' => $to,
                'currency' => $order->get_currency(),
                'total' => $order->get_total(),
                'customerId' => (string) $order->get_customer_id(),
            ]
        );
    }

    public static function captureRefund(int $refundId, array $args): void
    {
        $refund = wc_get_order($refundId);
        if (! $refund instanceof \WC_Order_Refund) {
            return;
        }

        $orderId = $refund->get_parent_id();
        self::enqueue(
            sprintf('refund:%d:order:%d', $refundId, $orderId),
            'commerce.order.refunded',
            (string) $orderId,
            (string) $refundId,
            [
                'orderId' => (string) $orderId,
                'refundId' => (string) $refundId,
                'amount' => $refund->get_amount(),
                'currency' => $refund->get_currency(),
            ]
        );
    }

    /** @param array<string, scalar|null> $payload */
    private static function enqueue(
        string $eventKey,
        string $eventType,
        string $sourceObjectId,
        ?string $sourceRevision,
        array $payload
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
            $now,
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

        $endpoint = (string) get_option('starfiniti_loyalty_endpoint', '');
        $connectionId = (string) get_option('starfiniti_loyalty_connection_id', '');
        $keyVersion = (string) get_option('starfiniti_loyalty_key_version', '');
        $signingKey = (string) get_option('starfiniti_loyalty_signing_key', '');
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

    private static function table(): string
    {
        global $wpdb;
        return $wpdb->prefix . 'starfiniti_loyalty_outbox';
    }
}
