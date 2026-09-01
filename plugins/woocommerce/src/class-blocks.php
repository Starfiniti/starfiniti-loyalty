<?php

namespace Starfiniti\Loyalty;

defined('ABSPATH') || exit;

use Automattic\WooCommerce\StoreApi\Schemas\V1\CartSchema;

final class Blocks
{
    public const NAMESPACE = 'starfiniti-loyalty';

    public static function boot(): void
    {
        add_action('woocommerce_blocks_loaded', [self::class, 'registerStoreApi']);
        add_action(
            'woocommerce_blocks_cart_block_registration',
            [self::class, 'registerIntegration']
        );
        add_action(
            'woocommerce_blocks_checkout_block_registration',
            [self::class, 'registerIntegration']
        );
        add_filter('render_block_woocommerce/cart', [self::class, 'appendNoScript'], 10, 2);
        add_filter('render_block_woocommerce/checkout', [self::class, 'appendNoScript'], 10, 2);
    }

    public static function registerStoreApi(): void
    {
        if (
            ! function_exists('woocommerce_store_api_register_endpoint_data')
            || ! class_exists(CartSchema::class)
        ) {
            return;
        }
        woocommerce_store_api_register_endpoint_data([
            'endpoint' => CartSchema::IDENTIFIER,
            'namespace' => self::NAMESPACE,
            'data_callback' => [self::class, 'storeApiData'],
            'schema_callback' => [self::class, 'storeApiSchema'],
            'schema_type' => ARRAY_A,
        ]);
    }

    /** @param mixed $registry */
    public static function registerIntegration($registry): void
    {
        $interface = \Automattic\WooCommerce\Blocks\Integrations\IntegrationInterface::class;
        if (
            ! Settings::blocksDataEnabled()
            || ! Settings::progressivePanelEnabled()
            || ! is_object($registry)
            || ! method_exists($registry, 'register')
            || ! interface_exists($interface)
        ) {
            return;
        }
        require_once __DIR__ . '/class-blocks-integration.php';
        $registry->register(new BlocksIntegration());
    }

    /** @return array<string,mixed> */
    public static function storeApiData(): array
    {
        if (! Settings::blocksDataEnabled() || ! is_user_logged_in()) {
            return [];
        }
        $state = ExperienceSnapshot::stateForUser(get_current_user_id());
        $snapshot = $state['snapshot'];
        if (! is_array($snapshot) || ! ($snapshot['enhancementsEnabled'] ?? false)) {
            return [];
        }
        $accountUrl = wp_validate_redirect(wc_get_account_endpoint_url('loyalty'), '');
        if ('' === $accountUrl) {
            return [];
        }
        $fresh = 'fresh' === $state['state'];
        $accountStatus = $fresh ? (string) $snapshot['accountStatus'] : '';
        $rewards = [];
        if ($fresh && in_array($accountStatus, ['ready', 'ready_without_activity'], true)) {
            foreach (array_slice($snapshot['rewards'], 0, 3) as $reward) {
                $rewards[] = [
                    'name' => (string) $reward['name'],
                    'costPoints' => (string) $reward['costPoints'],
                    'affordable' => (bool) $reward['affordable'],
                ];
            }
        }
        return [
            'version' => '1',
            'state' => $fresh ? 'fresh' : 'stale',
            'accountUrl' => $accountUrl,
            'accountStatus' => $accountStatus,
            'programmeName' => $fresh ? (string) ($snapshot['programmeName'] ?? '') : '',
            'availablePoints' => $fresh ? (string) $snapshot['balances']['available'] : '',
            'currentTierName' => $fresh && is_array($snapshot['currentTier'] ?? null)
                ? (string) $snapshot['currentTier']['name']
                : '',
            'rewards' => $rewards,
        ];
    }

    /** @return array<string,mixed> */
    public static function storeApiSchema(): array
    {
        $exactPoints = '^(?:|0|-?[1-9][0-9]{0,18})$';
        return [
            'version' => [
                'description' => 'Starfiniti loyalty cart extension version.',
                'type' => 'string',
                'enum' => ['1'],
                'readonly' => true,
            ],
            'state' => [
                'description' => 'Freshness of the local display-only snapshot.',
                'type' => 'string',
                'enum' => ['fresh', 'stale'],
                'readonly' => true,
            ],
            'accountUrl' => [
                'description' => 'Same-store loyalty account path.',
                'type' => 'string',
                'format' => 'uri',
                'readonly' => true,
            ],
            'accountStatus' => [
                'description' => 'Bounded local account presentation state.',
                'type' => 'string',
                'enum' => [
                    '', 'programme_unavailable', 'ready_without_activity',
                    'ready', 'wallet_blocked', 'wallet_closed',
                ],
                'readonly' => true,
            ],
            'programmeName' => [
                'description' => 'Safe local programme label.',
                'type' => 'string',
                'maxLength' => 200,
                'readonly' => true,
            ],
            'availablePoints' => [
                'description' => 'Exact display-only available points or empty when stale.',
                'type' => 'string',
                'pattern' => $exactPoints,
                'readonly' => true,
            ],
            'currentTierName' => [
                'description' => 'Safe local tier label when available.',
                'type' => 'string',
                'maxLength' => 200,
                'readonly' => true,
            ],
            'rewards' => [
                'description' => 'At most three safe local reward summaries.',
                'type' => 'array',
                'maxItems' => 3,
                'readonly' => true,
                'items' => [
                    'type' => 'object',
                    'properties' => [
                        'name' => ['type' => 'string', 'maxLength' => 200],
                        'costPoints' => [
                            'type' => 'string',
                            'pattern' => '^[1-9][0-9]{0,18}$',
                        ],
                        'affordable' => ['type' => 'boolean'],
                    ],
                    'required' => ['name', 'costPoints', 'affordable'],
                    'additionalProperties' => false,
                ],
            ],
        ];
    }

    /** @param array<string,mixed> $block */
    public static function appendNoScript(string $content, array $block): string
    {
        if (
            ! Settings::blocksDataEnabled()
            || ! Settings::progressivePanelEnabled()
            || ! is_user_logged_in()
        ) {
            return $content;
        }
        $data = self::storeApiData();
        if ([] === $data) {
            return $content;
        }
        $message = 'fresh' === $data['state']
            ? sprintf(
                /* translators: %s is an exact loyalty-points balance. */
                __('%s points available', 'starfiniti-loyalty'),
                (string) $data['availablePoints']
            )
            : __(
                'Your loyalty summary is refreshing. Open your secure loyalty account for the latest balance.',
                'starfiniti-loyalty'
            );
        $fallback = '<noscript><p class="starfiniti-loyalty-block-fallback">'
            . esc_html($message) . ' <a href="' . esc_url((string) $data['accountUrl']) . '">'
            . esc_html__('View loyalty account', 'starfiniti-loyalty')
            . '</a></p></noscript>';
        return $content . $fallback;
    }
}
