<?php

namespace Starfiniti\Loyalty;

defined('ABSPATH') || exit;

final class Privacy
{
    public static function boot(): void
    {
        add_filter('wp_privacy_personal_data_exporters', [self::class, 'registerExporter']);
        add_filter('wp_privacy_personal_data_erasers', [self::class, 'registerEraser']);
    }

    public static function registerExporter(array $exporters): array
    {
        $exporters['starfiniti-loyalty'] = [
            'exporter_friendly_name' => __('Starfiniti Loyalty connector', 'starfiniti-loyalty'),
            'callback' => [self::class, 'export'],
        ];
        return $exporters;
    }

    public static function registerEraser(array $erasers): array
    {
        $erasers['starfiniti-loyalty'] = [
            'eraser_friendly_name' => __('Starfiniti Loyalty connector', 'starfiniti-loyalty'),
            'callback' => [self::class, 'erase'],
        ];
        return $erasers;
    }

    /** @return array{data:array<int,array<string,mixed>>,done:bool} */
    public static function export(string $emailAddress, int $page = 1): array
    {
        $user = get_user_by('email', $emailAddress);
        if (! $user instanceof \WP_User) {
            return ['data' => [], 'done' => true];
        }
        $rows = self::rowsForCustomer((string) $user->ID, $page);
        $data = [];
        foreach ($rows as $row) {
            $data[] = [
                'group_id' => 'starfiniti-loyalty-events',
                'group_label' => __('Starfiniti Loyalty delivery events', 'starfiniti-loyalty'),
                'item_id' => 'starfiniti-event-' . (int) $row['id'],
                'data' => [
                    ['name' => __('Event type', 'starfiniti-loyalty'), 'value' => (string) $row['event_type']],
                    ['name' => __('Source object', 'starfiniti-loyalty'), 'value' => (string) $row['source_object_id']],
                    ['name' => __('Delivery state', 'starfiniti-loyalty'), 'value' => (string) $row['state']],
                    ['name' => __('Occurred (UTC)', 'starfiniti-loyalty'), 'value' => (string) $row['occurred_gmt']],
                ],
            ];
        }
        return ['data' => $data, 'done' => count($rows) < 100];
    }

    /** @return array{items_removed:bool,items_retained:bool,messages:array<int,string>,done:bool} */
    public static function erase(string $emailAddress, int $page = 1): array
    {
        global $wpdb;
        $user = get_user_by('email', $emailAddress);
        if (! $user instanceof \WP_User) {
            return ['items_removed' => false, 'items_retained' => false, 'messages' => [], 'done' => true];
        }
        $pattern = '%"externalCustomerId":"' . $wpdb->esc_like((string) $user->ID) . '"%';
        $removed = $wpdb->query($wpdb->prepare(
            'DELETE FROM ' . self::table() . ' WHERE state = %s AND event_payload LIKE %s LIMIT 100',
            'delivered',
            $pattern
        ));
        $retained = (int) $wpdb->get_var($wpdb->prepare(
            'SELECT COUNT(*) FROM ' . self::table() . ' WHERE state <> %s AND event_payload LIKE %s',
            'delivered',
            $pattern
        ));
        $messages = [];
        if ($retained > 0) {
            $messages[] = __('Undelivered event evidence is retained until delivery or operator resolution; authoritative loyalty records follow the hub retention policy.', 'starfiniti-loyalty');
        }
        return [
            'items_removed' => is_int($removed) && $removed > 0,
            'items_retained' => $retained > 0,
            'messages' => $messages,
            'done' => ! (is_int($removed) && 100 === $removed),
        ];
    }

    /** @return array<int,array<string,mixed>> */
    private static function rowsForCustomer(string $customerId, int $page): array
    {
        global $wpdb;
        $offset = max(0, $page - 1) * 100;
        $pattern = '%"externalCustomerId":"' . $wpdb->esc_like($customerId) . '"%';
        return (array) $wpdb->get_results($wpdb->prepare(
            'SELECT id,event_type,source_object_id,state,occurred_gmt FROM ' . self::table() .
            ' WHERE event_payload LIKE %s ORDER BY id ASC LIMIT 100 OFFSET %d',
            $pattern,
            $offset
        ), ARRAY_A);
    }

    private static function table(): string
    {
        global $wpdb;
        return $wpdb->prefix . 'starfiniti_loyalty_outbox';
    }
}
