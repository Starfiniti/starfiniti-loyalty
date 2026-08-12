<?php

namespace Starfiniti\Loyalty;

defined('ABSPATH') || exit;

final class Cli
{
    public static function register(): void
    {
        if (defined('WP_CLI') && WP_CLI && class_exists('\WP_CLI')) {
            \WP_CLI::add_command('starfiniti loyalty status', [self::class, 'status']);
            \WP_CLI::add_command('starfiniti loyalty retry-dead-letters', [self::class, 'retryDeadLetters']);
            \WP_CLI::add_command('starfiniti loyalty reconcile-order', [self::class, 'reconcileOrder']);
        }
    }

    /** @param array<int, string> $args @param array<string, mixed> $assocArgs */
    public static function status(array $args, array $assocArgs): void
    {
        $rows = [];
        foreach (Outbox::diagnostics() as $state => $count) {
            $rows[] = ['state' => $state, 'events' => $count];
        }
        \WP_CLI\Utils\format_items('table', $rows, ['state', 'events']);
        \WP_CLI::log(sprintf(
            'Connection: %s; signing key: %s',
            '' !== Settings::connectionId() ? 'configured' : 'missing',
            Settings::hasSigningKey() ? 'stored encrypted' : 'missing'
        ));
    }

    /** @param array<int, string> $args @param array<string, mixed> $assocArgs */
    public static function retryDeadLetters(array $args, array $assocArgs): void
    {
        $limit = isset($assocArgs['limit']) ? absint($assocArgs['limit']) : 100;
        if ($limit < 1 || $limit > 500) {
            \WP_CLI::error('The --limit value must be between 1 and 500.');
        }
        $retried = Outbox::retryDeadLetters($limit);
        \WP_CLI::success(sprintf('Queued %d dead-letter event(s) for retry.', $retried));
    }

    /** @param array<int, string> $args @param array<string, mixed> $assocArgs */
    public static function reconcileOrder(array $args, array $assocArgs): void
    {
        $orderId = absint($args[0] ?? 0);
        if ($orderId < 1 || ! Outbox::reconcileOrder($orderId)) {
            \WP_CLI::error('A valid parent WooCommerce order ID is required.');
        }
        \WP_CLI::success(sprintf('Queued order %d and its refunds for reconciliation.', $orderId));
    }
}
