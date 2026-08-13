<?php

namespace Starfiniti\Loyalty;

defined('ABSPATH') || exit;

final class Commands
{
    private const ACTION = 'starfiniti_loyalty_poll_commands';
    private const GROUP = 'starfiniti-loyalty';

    public static function boot(): void
    {
        add_action('init', [self::class, 'ensureSchedule']);
        add_action(self::ACTION, [self::class, 'poll']);
        add_filter('woocommerce_coupon_is_valid', [self::class, 'validateCustomer'], 10, 2);
    }

    public static function ensureSchedule(): void
    {
        if (
            function_exists('as_has_scheduled_action')
            && function_exists('as_schedule_recurring_action')
            && ! as_has_scheduled_action(self::ACTION, [], self::GROUP)
        ) {
            as_schedule_recurring_action(time() + 60, 60, self::ACTION, [], self::GROUP);
        }
    }

    public static function poll(): void
    {
        if ('' === Settings::commandsEndpoint() || '' === Settings::signingKey()) {
            return;
        }
        $response = self::request([
            'version' => '1',
            'kind' => 'poll',
            'connectionId' => Settings::connectionId(),
            'requestId' => wp_generate_uuid4(),
            'batchSize' => 10,
            'capabilities' => ['coupon.issue.v2'],
        ]);
        if (is_wp_error($response) || 200 !== wp_remote_retrieve_response_code($response)) {
            return;
        }
        $decoded = json_decode(wp_remote_retrieve_body($response), true);
        if (! is_array($decoded) || ! is_array($decoded['commands'] ?? null)) {
            return;
        }
        foreach ($decoded['commands'] as $command) {
            if (! is_array($command)) {
                continue;
            }
            $result = self::execute($command);
            self::acknowledge($command, $result);
        }
    }

    /** @return array{outcome:string,resultReference:?string,errorCode:?string,retryDelaySeconds:int} */
    private static function execute(array $command): array
    {
        $payload = is_array($command['payload'] ?? null) ? $command['payload'] : [];
        $commandId = sanitize_text_field((string) ($command['commandId'] ?? ''));
        $payloadVersion = (string) ($command['payloadVersion'] ?? '');
        if (
            '1' !== ($command['version'] ?? null)
            || ! wp_is_uuid($commandId)
            || ! in_array($payloadVersion, ['v1', 'v2'], true)
        ) {
            return self::failure('dead_letter', 'invalid_command_payload');
        }
        if ('woocommerce.order.reconcile' === ($command['topic'] ?? null)) {
            $rawOrderId = (string) ($payload['orderId'] ?? '');
            if (
                'v1' !== $payloadVersion
                || 'reconcile_order' !== ($payload['kind'] ?? null)
                || ! preg_match('/^[1-9][0-9]{0,18}$/', $rawOrderId)
                || (string) (int) $rawOrderId !== $rawOrderId
            ) {
                return self::failure('dead_letter', 'invalid_reconciliation_payload');
            }
            try {
                return Outbox::reconcileOrder((int) $rawOrderId)
                    ? [
                        'outcome' => 'delivered',
                        'resultReference' => 'woocommerce:order:' . $rawOrderId,
                        'errorCode' => null,
                        'retryDelaySeconds' => 0,
                    ]
                    : self::failure('dead_letter', 'order_not_found');
            } catch (\Throwable $error) {
                return self::failure('retryable', 'reconciliation_execution_failed', 300);
            }
        }
        $reservationId = sanitize_text_field((string) ($payload['reservationId'] ?? ''));
        $rawCode = (string) ($payload['code'] ?? '');
        $code = wc_format_coupon_code($rawCode);
        if (
            ! wp_is_uuid($reservationId)
            || ! preg_match('/^SF[A-Z0-9]{20,48}$/', $rawCode)
        ) {
            return self::failure('dead_letter', 'invalid_command_payload');
        }
        try {
            if ('woocommerce.coupon.issue' === ($command['topic'] ?? null)) {
                return self::issue($commandId, $reservationId, $code, $payloadVersion, $payload);
            }
            if ('woocommerce.coupon.cancel' === ($command['topic'] ?? null)) {
                if ('v1' !== $payloadVersion) {
                    return self::failure('dead_letter', 'unsupported_payload_version');
                }
                return self::cancel($reservationId, $code);
            }
            return self::failure('dead_letter', 'unsupported_command_topic');
        } catch (\Throwable $error) {
            return self::failure('retryable', 'coupon_execution_failed', 300);
        }
    }

    /** @return array{outcome:string,resultReference:?string,errorCode:?string,retryDelaySeconds:int} */
    private static function issue(
        string $commandId,
        string $reservationId,
        string $code,
        string $payloadVersion,
        array $payload
    ): array {
        $existingId = wc_get_coupon_id_by_code($code);
        if ($existingId > 0) {
            $existing = new \WC_Coupon($existingId);
            if (
                $commandId !== (string) $existing->get_meta('_starfiniti_command_id', true)
                || $reservationId !== (string) $existing->get_meta('_starfiniti_reservation_id', true)
            ) {
                return self::failure('dead_letter', 'coupon_code_collision');
            }
            return self::success($existingId);
        }
        $externalCustomerId = sanitize_text_field((string) ($payload['externalCustomerId'] ?? ''));
        $expiresAt = strtotime((string) ($payload['expiresAt'] ?? ''));
        $reward = is_array($payload['reward'] ?? null) ? $payload['reward'] : [];
        if (
            null === self::numericId($externalCustomerId)
            || false === $expiresAt
            || $expiresAt <= time()
        ) {
            return self::failure('dead_letter', 'invalid_coupon_constraints');
        }
        $coupon = new \WC_Coupon();
        $coupon->set_code($code);
        $coupon->set_description(__('Starfiniti Loyalty reward', 'starfiniti-loyalty'));
        $coupon->set_individual_use(true);
        $coupon->set_usage_limit(1);
        $coupon->set_usage_limit_per_user(1);
        $coupon->set_date_expires($expiresAt);
        $kind = (string) ($reward['kind'] ?? '');
        if ('fixed_discount' === $kind) {
            $coupon->set_discount_type('fixed_cart');
            $amount = self::minorToDecimal(
                (string) ($reward['amountMinor'] ?? ''),
                (int) ($reward['currencyMinorUnitDigits'] ?? -1)
            );
            if (null === $amount) {
                return self::failure('dead_letter', 'invalid_fixed_discount');
            }
            $coupon->set_amount($amount);
        } elseif ('percentage_discount' === $kind) {
            if (null !== ($reward['maximumDiscountMinor'] ?? null)) {
                return self::failure('dead_letter', 'percentage_maximum_unsupported');
            }
            $basisPoints = (int) ($reward['percentageBasisPoints'] ?? 0);
            if ($basisPoints < 1 || $basisPoints > 10000) {
                return self::failure('dead_letter', 'invalid_percentage_discount');
            }
            $coupon->set_discount_type('percent');
            $coupon->set_amount(self::basisPointsToPercent($basisPoints));
        } elseif ('free_shipping' === $kind) {
            $coupon->set_discount_type('fixed_cart');
            $coupon->set_amount('0');
            $coupon->set_free_shipping(true);
        } elseif ('free_product' === $kind && 'v2' === $payloadVersion) {
            $productId = self::numericId((string) ($reward['productId'] ?? ''));
            $quantity = (int) ($reward['quantity'] ?? 0);
            if (null === $productId || $quantity < 1 || $quantity > 10 || ! wc_get_product($productId)) {
                return self::failure('dead_letter', 'invalid_free_product');
            }
            $coupon->set_discount_type('percent');
            $coupon->set_amount('100');
            $coupon->set_product_ids([$productId]);
            $coupon->set_limit_usage_to_x_items($quantity);
        } else {
            return self::failure('dead_letter', 'unsupported_reward_kind');
        }
        if ('v2' === $payloadVersion) {
            $restrictionError = self::applyRestrictions($coupon, $reward, $kind);
            if (null !== $restrictionError) {
                return self::failure('dead_letter', $restrictionError);
            }
        }
        $coupon->update_meta_data('_starfiniti_command_id', $commandId);
        $coupon->update_meta_data('_starfiniti_reservation_id', $reservationId);
        $coupon->update_meta_data('_starfiniti_external_customer_id', $externalCustomerId);
        $couponId = $coupon->save();
        return $couponId > 0
            ? self::success($couponId)
            : self::failure('retryable', 'coupon_save_failed', 300);
    }

    /** @return array{outcome:string,resultReference:?string,errorCode:?string,retryDelaySeconds:int} */
    private static function cancel(string $reservationId, string $code): array
    {
        $couponId = wc_get_coupon_id_by_code($code);
        if ($couponId <= 0) {
            return self::failure('dead_letter', 'coupon_absent_unknown');
        }
        $coupon = new \WC_Coupon($couponId);
        if ($reservationId !== (string) $coupon->get_meta('_starfiniti_reservation_id', true)) {
            return self::failure('dead_letter', 'coupon_reservation_mismatch');
        }
        if ($coupon->get_usage_count() > 0) {
            return self::failure('dead_letter', 'coupon_already_used');
        }
        $coupon->set_date_expires(time() - DAY_IN_SECONDS);
        $coupon->set_status('draft');
        $coupon->save();
        return ['outcome' => 'cancelled', 'resultReference' => 'woocommerce:coupon:' . $couponId, 'errorCode' => null, 'retryDelaySeconds' => 0];
    }

    public static function validateCustomer(bool $valid, $coupon): bool
    {
        if (! $valid || ! $coupon instanceof \WC_Coupon) {
            return $valid;
        }
        $externalCustomerId = (string) $coupon->get_meta('_starfiniti_external_customer_id', true);
        return '' === $externalCustomerId || (string) get_current_user_id() === $externalCustomerId;
    }

    /** @param array{outcome:string,resultReference:?string,errorCode:?string,retryDelaySeconds:int} $result */
    private static function acknowledge(array $command, array $result): void
    {
        self::request([
            'version' => '1',
            'kind' => 'acknowledge',
            'connectionId' => Settings::connectionId(),
            'requestId' => wp_generate_uuid4(),
            'commandId' => (string) ($command['commandId'] ?? ''),
            'outcome' => $result['outcome'],
            'resultReference' => $result['resultReference'],
            'errorCode' => $result['errorCode'],
            'retryDelaySeconds' => $result['retryDelaySeconds'],
        ]);
    }

    /** @return array|\WP_Error */
    private static function request(array $body)
    {
        $endpoint = Settings::commandsEndpoint();
        $encoded = (string) wp_json_encode($body, JSON_UNESCAPED_SLASHES);
        $timestamp = (string) time();
        $requestId = (string) ($body['requestId'] ?? '');
        $bodyHash = hash('sha256', $encoded);
        $path = (string) wp_parse_url($endpoint, PHP_URL_PATH);
        $query = (string) wp_parse_url($endpoint, PHP_URL_QUERY);
        $requestTarget = $path . ('' !== $query ? '?' . $query : '');
        $message = implode("\n", [
            'starfiniti-woocommerce-v1', $requestTarget, Settings::connectionId(),
            $requestId, $timestamp, $requestId, $bodyHash,
        ]);
        return wp_remote_post($endpoint, [
            'timeout' => 10,
            'headers' => [
                'Content-Type' => 'application/json',
                'X-Starfiniti-Connection-ID' => Settings::connectionId(),
                'X-Starfiniti-Delivery-ID' => $requestId,
                'X-Starfiniti-Timestamp' => $timestamp,
                'X-Starfiniti-Nonce' => $requestId,
                'X-Starfiniti-Key-Version' => Settings::keyVersion(),
                'X-Starfiniti-Body-SHA256' => $bodyHash,
                'X-Starfiniti-Signature' => hash_hmac('sha256', $message, Settings::signingKey()),
            ],
            'body' => $encoded,
            'data_format' => 'body',
        ]);
    }

    private static function minorToDecimal(string $minor, int $digits, bool $allowZero = false): ?string
    {
        $pattern = $allowZero ? '/^(?:0|[1-9][0-9]*)$/' : '/^[1-9][0-9]*$/';
        if (! preg_match($pattern, $minor) || $digits < 0 || $digits > 6) {
            return null;
        }
        if (0 === $digits) {
            return $minor;
        }
        $padded = str_pad($minor, $digits + 1, '0', STR_PAD_LEFT);
        return substr($padded, 0, -$digits) . '.' . substr($padded, -$digits);
    }

    private static function basisPointsToPercent(int $basisPoints): string
    {
        return intdiv($basisPoints, 100) . '.' . str_pad((string) ($basisPoints % 100), 2, '0', STR_PAD_LEFT);
    }

    private static function applyRestrictions(\WC_Coupon $coupon, array $reward, string $kind): ?string
    {
        $restrictions = is_array($reward['restrictions'] ?? null)
            ? $reward['restrictions']
            : null;
        if (null === $restrictions) {
            return 'invalid_coupon_restrictions';
        }
        foreach ([
            'minimumSpendMinor', 'currencyMinorUnitDigits', 'productIds',
            'excludedProductIds', 'categoryIds', 'excludedCategoryIds',
            'excludeSaleItems', 'stacking',
        ] as $field) {
            if (! array_key_exists($field, $restrictions)) {
                return 'invalid_coupon_restrictions';
            }
        }
        if (! is_int($restrictions['currencyMinorUnitDigits'])) {
            return 'invalid_coupon_restrictions';
        }
        $digits = $restrictions['currencyMinorUnitDigits'];
        if (
            $digits < 0
            || $digits > 6
            || (
                in_array($kind, ['fixed_discount', 'percentage_discount'], true)
                && (int) ($reward['currencyMinorUnitDigits'] ?? -1) !== $digits
            )
        ) {
            return 'invalid_coupon_restrictions';
        }
        $minimumMinor = $restrictions['minimumSpendMinor'];
        if (null !== $minimumMinor) {
            $minimum = self::minorToDecimal((string) $minimumMinor, $digits, true);
            if (null === $minimum) {
                return 'invalid_coupon_restrictions';
            }
            $coupon->set_minimum_amount($minimum);
        }
        $productIds = self::numericIds($restrictions['productIds']);
        $excludedProductIds = self::numericIds($restrictions['excludedProductIds']);
        $categoryIds = self::numericIds($restrictions['categoryIds']);
        $excludedCategoryIds = self::numericIds($restrictions['excludedCategoryIds']);
        if (
            null === $productIds
            || null === $excludedProductIds
            || null === $categoryIds
            || null === $excludedCategoryIds
            || array_intersect($productIds, $excludedProductIds)
            || array_intersect($categoryIds, $excludedCategoryIds)
        ) {
            return 'invalid_coupon_restrictions';
        }
        if (
            'free_product' === $kind
            && (
                [] !== $productIds
                || [] !== $excludedProductIds
                || [] !== $categoryIds
                || [] !== $excludedCategoryIds
            )
        ) {
            return 'invalid_free_product_restrictions';
        }
        if ('free_product' !== $kind) {
            $coupon->set_product_ids($productIds);
            $coupon->set_excluded_product_ids($excludedProductIds);
            $coupon->set_product_categories($categoryIds);
            $coupon->set_excluded_product_categories($excludedCategoryIds);
        }
        if (! is_bool($restrictions['excludeSaleItems'])) {
            return 'invalid_coupon_restrictions';
        }
        $coupon->set_exclude_sale_items($restrictions['excludeSaleItems']);
        if (! in_array($restrictions['stacking'], ['exclusive', 'combinable'], true)) {
            return 'invalid_coupon_restrictions';
        }
        $coupon->set_individual_use('exclusive' === $restrictions['stacking']);
        return null;
    }

    /** @param mixed $values @return ?array<int,int> */
    private static function numericIds($values): ?array
    {
        if (! is_array($values) || count($values) > 100) {
            return null;
        }
        $ids = [];
        foreach ($values as $value) {
            if (! is_string($value)) {
                return null;
            }
            $id = self::numericId($value);
            if (null === $id) {
                return null;
            }
            $ids[] = $id;
        }
        return array_values(array_unique($ids));
    }

    private static function numericId(string $value): ?int
    {
        if (! preg_match('/^[1-9][0-9]{0,19}$/', $value)) {
            return null;
        }
        $id = (int) $value;
        return $id > 0 && (string) $id === $value ? $id : null;
    }

    /** @return array{outcome:string,resultReference:?string,errorCode:?string,retryDelaySeconds:int} */
    private static function success(int $couponId): array
    {
        return ['outcome' => 'delivered', 'resultReference' => 'woocommerce:coupon:' . $couponId, 'errorCode' => null, 'retryDelaySeconds' => 0];
    }

    /** @return array{outcome:string,resultReference:?string,errorCode:?string,retryDelaySeconds:int} */
    private static function failure(string $outcome, string $errorCode, int $delay = 0): array
    {
        return ['outcome' => $outcome, 'resultReference' => null, 'errorCode' => $errorCode, 'retryDelaySeconds' => $delay];
    }
}
