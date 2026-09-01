<?php

namespace Starfiniti\Loyalty;

defined('ABSPATH') || exit;

final class ExperienceSnapshot
{
    private const OPTION_PREFIX = 'starfiniti_loyalty_snapshot_';
    private const PENDING_OPTION = 'starfiniti_loyalty_snapshot_pending';
    private const MAX_SNAPSHOT_BYTES = 32768;
    private const MAX_PENDING = 100;
    private const POLL_BATCH = 25;

    public static function boot(): void
    {
        add_action('delete_user', [self::class, 'deleteForUser'], 20);
    }

    /** @return array<int,string> */
    public static function pendingCustomerIds(): array
    {
        $pending = self::pending();
        asort($pending, SORT_NUMERIC);
        return array_map(
            'strval',
            array_slice(array_keys($pending), 0, self::POLL_BATCH)
        );
    }

    public static function requestForUser(int $userId): void
    {
        if ($userId <= 0 || '' === Settings::connectionId()) {
            return;
        }
        $stored = self::storedForUser($userId);
        $refreshAfter = is_array($stored)
            ? self::instant((string) ($stored['refreshAfter'] ?? ''))
            : null;
        if (null !== $refreshAfter && $refreshAfter > time()) {
            return;
        }
        $pending = self::pending();
        $customerId = (string) $userId;
        if (isset($pending[$customerId])) {
            return;
        }
        $pending[$customerId] = time();
        if (count($pending) > self::MAX_PENDING) {
            asort($pending, SORT_NUMERIC);
            $pending = array_slice($pending, -self::MAX_PENDING, null, true);
        }
        update_option(self::PENDING_OPTION, $pending, false);
    }

    /** @return array{state:string,snapshot:?array} */
    public static function stateForUser(int $userId): array
    {
        if ($userId <= 0) {
            return ['state' => 'missing', 'snapshot' => null];
        }
        $snapshot = self::storedForUser($userId);
        self::requestForUser($userId);
        if (! is_array($snapshot)) {
            return ['state' => 'missing', 'snapshot' => null];
        }
        $staleAfter = self::instant((string) $snapshot['staleAfter']);
        if (null === $staleAfter || $staleAfter <= time()) {
            return ['state' => 'stale', 'snapshot' => $snapshot];
        }
        return ['state' => 'fresh', 'snapshot' => $snapshot];
    }

    /** @return ?array<string,mixed> */
    public static function exportForUser(int $userId): ?array
    {
        return self::storedForUser($userId);
    }

    /** @return array{outcome:string,resultReference:?string,errorCode:?string,retryDelaySeconds:int} */
    public static function store(string $commandId, array $snapshot): array
    {
        if (! wp_is_uuid($commandId) || ! self::valid($snapshot)) {
            return self::failure('invalid_customer_experience_snapshot');
        }
        $customerId = self::numericId((string) $snapshot['externalCustomerId']);
        if (null === $customerId || ! get_userdata($customerId) instanceof \WP_User) {
            return self::failure('snapshot_customer_not_found');
        }
        $encoded = wp_json_encode($snapshot, JSON_UNESCAPED_SLASHES);
        if (! is_string($encoded) || strlen($encoded) > self::MAX_SNAPSHOT_BYTES) {
            return self::failure('snapshot_size_exceeded');
        }

        $existing = self::storedForUser($customerId);
        if (is_array($existing)) {
            $comparison = self::compareDecimal(
                (string) $snapshot['revision'],
                (string) $existing['revision']
            );
            if ($comparison < 0) {
                return self::delivered($customerId, (string) $existing['revision']);
            }
            if (0 === $comparison) {
                $existingEncoded = wp_json_encode($existing, JSON_UNESCAPED_SLASHES);
                if (! is_string($existingEncoded) || ! hash_equals($existingEncoded, $encoded)) {
                    return self::failure('snapshot_revision_conflict');
                }
                self::completeRequest($customerId);
                return self::delivered($customerId, (string) $snapshot['revision']);
            }
        }

        update_option(self::optionName($customerId), $snapshot, false);
        $stored = self::storedForUser($customerId);
        if (! is_array($stored) || (string) $stored['revision'] !== (string) $snapshot['revision']) {
            return [
                'outcome' => 'retryable',
                'resultReference' => null,
                'errorCode' => 'snapshot_storage_failed',
                'retryDelaySeconds' => 300,
            ];
        }
        self::completeRequest($customerId);
        return self::delivered($customerId, (string) $snapshot['revision']);
    }

    public static function deleteForUser(int $userId): void
    {
        if ($userId <= 0) {
            return;
        }
        delete_option(self::optionName($userId));
        self::completeRequest($userId);
    }

    public static function displayInstant(string $value): ?string
    {
        $instant = self::instant($value);
        if (null === $instant) {
            return null;
        }
        return wp_date('Y-m-d H:i T', $instant);
    }

    /** @return ?array<string,mixed> */
    private static function storedForUser(int $userId): ?array
    {
        $stored = get_option(self::optionName($userId), null);
        if (! is_array($stored) || ! self::valid($stored, true)) {
            return null;
        }
        return (string) $stored['externalCustomerId'] === (string) $userId
            ? $stored
            : null;
    }

    /** @param array<string,mixed> $snapshot */
    private static function valid(array $snapshot, bool $allowExpired = false): bool
    {
        if (! self::exactKeys($snapshot, [
            'version', 'revision', 'externalCustomerId', 'generatedAt',
            'refreshAfter', 'staleAfter', 'accountStatus',
            'enhancementsEnabled', 'programmeName', 'balances', 'currentTier',
            'nextExpiry', 'earningMethods', 'rewards',
        ])) {
            return false;
        }
        if (
            '1' !== $snapshot['version']
            || ! self::positivePoints($snapshot['revision'])
            || null === self::numericId((string) $snapshot['externalCustomerId'])
            || ! is_bool($snapshot['enhancementsEnabled'])
            || ! in_array($snapshot['accountStatus'], [
                'programme_unavailable', 'ready_without_activity', 'ready',
                'wallet_blocked', 'wallet_closed',
            ], true)
            || (null !== $snapshot['programmeName'] && ! self::safeText($snapshot['programmeName']))
        ) {
            return false;
        }
        $generatedAt = self::instant($snapshot['generatedAt']);
        $refreshAfter = self::instant($snapshot['refreshAfter']);
        $staleAfter = self::instant($snapshot['staleAfter']);
        if (
            null === $generatedAt || null === $refreshAfter || null === $staleAfter
            || $generatedAt > time() + 300
            || $refreshAfter <= $generatedAt
            || $refreshAfter - $generatedAt > HOUR_IN_SECONDS
            || $staleAfter <= $refreshAfter
            || $staleAfter - $generatedAt > 2 * DAY_IN_SECONDS
            || (! $allowExpired && $staleAfter <= time())
        ) {
            return false;
        }
        if (! is_array($snapshot['balances']) || ! self::exactKeys(
            $snapshot['balances'], ['pending', 'available', 'reserved']
        )) {
            return false;
        }
        foreach ($snapshot['balances'] as $points) {
            if (! self::points($points)) {
                return false;
            }
        }
        if (null !== $snapshot['currentTier']) {
            if (! is_array($snapshot['currentTier'])
                || ! self::exactKeys($snapshot['currentTier'], ['name'])
                || ! self::safeText($snapshot['currentTier']['name'])) {
                return false;
            }
        }
        if (null !== $snapshot['nextExpiry']) {
            if (! is_array($snapshot['nextExpiry'])
                || ! self::exactKeys($snapshot['nextExpiry'], ['points', 'expiresAt'])
                || ! self::positivePoints($snapshot['nextExpiry']['points'])
                || null === self::instant($snapshot['nextExpiry']['expiresAt'])) {
                return false;
            }
        }
        if (! is_array($snapshot['earningMethods']) || count($snapshot['earningMethods']) > 8) {
            return false;
        }
        foreach ($snapshot['earningMethods'] as $method) {
            if (! is_array($method)
                || ! self::exactKeys($method, ['name', 'availableNow'])
                || ! self::safeText($method['name'])
                || ! is_bool($method['availableNow'])) {
                return false;
            }
        }
        if (! is_array($snapshot['rewards']) || count($snapshot['rewards']) > 10) {
            return false;
        }
        foreach ($snapshot['rewards'] as $reward) {
            if (! is_array($reward)
                || ! self::exactKeys($reward, ['name', 'kind', 'costPoints', 'affordable'])
                || ! self::safeText($reward['name'])
                || ! in_array($reward['kind'], [
                    'fixed_discount', 'percentage_discount', 'free_product',
                    'free_shipping', 'exclusive_access', 'custom',
                ], true)
                || ! self::positivePoints($reward['costPoints'])
                || ! is_bool($reward['affordable'])
                || $reward['affordable'] !== (
                    self::compareSignedDecimal(
                        (string) $reward['costPoints'],
                        (string) $snapshot['balances']['available']
                    ) <= 0
                )) {
                return false;
            }
        }
        return true;
    }

    /** @return array<string,int> */
    private static function pending(): array
    {
        $stored = get_option(self::PENDING_OPTION, []);
        if (! is_array($stored)) {
            return [];
        }
        $pending = [];
        foreach ($stored as $customerId => $requestedAt) {
            if (null !== self::numericId((string) $customerId) && is_int($requestedAt)) {
                $pending[(string) $customerId] = $requestedAt;
            }
        }
        return $pending;
    }

    private static function completeRequest(int $userId): void
    {
        $pending = self::pending();
        if (! isset($pending[(string) $userId])) {
            return;
        }
        unset($pending[(string) $userId]);
        update_option(self::PENDING_OPTION, $pending, false);
    }

    private static function optionName(int $userId): string
    {
        return self::OPTION_PREFIX . $userId;
    }

    /** @param array<mixed> $value @param array<int,string> $expected */
    private static function exactKeys(array $value, array $expected): bool
    {
        $actual = array_keys($value);
        sort($actual);
        sort($expected);
        return $actual === $expected;
    }

    /** @param mixed $value */
    private static function safeText($value): bool
    {
        return is_string($value)
            && '' !== trim($value)
            && strlen($value) <= 200
            && ! preg_match('/[<>\x00-\x1F\x7F]/', $value);
    }

    /** @param mixed $value */
    private static function points($value): bool
    {
        return is_string($value)
            && 1 === preg_match('/^(?:0|-?[1-9][0-9]{0,18})$/', $value)
            && (
                str_starts_with($value, '-')
                    ? self::compareDecimal(substr($value, 1), '9223372036854775808') <= 0
                    : self::compareDecimal($value, '9223372036854775807') <= 0
            );
    }

    /** @param mixed $value */
    private static function positivePoints($value): bool
    {
        return self::points($value)
            && '0' !== $value
            && ! str_starts_with($value, '-');
    }

    /** @param mixed $value */
    private static function instant($value): ?int
    {
        if (! is_string($value)
            || ! preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/', $value)) {
            return null;
        }
        $instant = strtotime($value);
        return false === $instant ? null : $instant;
    }

    private static function numericId(string $value): ?int
    {
        if (1 !== preg_match('/^[1-9][0-9]{0,19}$/', $value)
            || self::compareDecimal($value, (string) PHP_INT_MAX) > 0) {
            return null;
        }
        $id = (int) $value;
        return $id > 0 && (string) $id === $value ? $id : null;
    }

    private static function compareDecimal(string $left, string $right): int
    {
        $length = strlen($left) <=> strlen($right);
        return 0 !== $length ? $length : strcmp($left, $right);
    }

    private static function compareSignedDecimal(string $left, string $right): int
    {
        $leftNegative = str_starts_with($left, '-');
        $rightNegative = str_starts_with($right, '-');
        if ($leftNegative !== $rightNegative) {
            return $leftNegative ? -1 : 1;
        }
        $comparison = self::compareDecimal(
            $leftNegative ? substr($left, 1) : $left,
            $rightNegative ? substr($right, 1) : $right
        );
        return $leftNegative ? -$comparison : $comparison;
    }

    /** @return array{outcome:string,resultReference:string,errorCode:null,retryDelaySeconds:int} */
    private static function delivered(int $customerId, string $revision): array
    {
        return [
            'outcome' => 'delivered',
            'resultReference' => 'wordpress:snapshot:' . $customerId . ':' . $revision,
            'errorCode' => null,
            'retryDelaySeconds' => 0,
        ];
    }

    /** @return array{outcome:string,resultReference:null,errorCode:string,retryDelaySeconds:int} */
    private static function failure(string $errorCode): array
    {
        return [
            'outcome' => 'dead_letter',
            'resultReference' => null,
            'errorCode' => $errorCode,
            'retryDelaySeconds' => 0,
        ];
    }
}
