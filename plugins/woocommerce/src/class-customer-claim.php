<?php

namespace Starfiniti\Loyalty;

defined('ABSPATH') || exit;

final class CustomerClaim
{
    public static function linkForUser(int $customerId): string
    {
        if ($customerId <= 0) {
            return '';
        }
        $endpoint = Settings::endpoint();
        $connectionId = strtolower(Settings::connectionId());
        $keyVersion = Settings::keyVersion();
        $signingKey = Settings::signingKey();
        $parts = wp_parse_url($endpoint);
        if (
            ! is_array($parts)
            || 'https' !== strtolower((string) ($parts['scheme'] ?? ''))
            || '' === (string) ($parts['host'] ?? '')
            || '' === $connectionId
            || '' === $keyVersion
            || '' === $signingKey
        ) {
            return '';
        }

        $issuedAt = (string) time();
        $nonce = wp_generate_uuid4();
        $externalCustomerId = (string) $customerId;
        $message = implode("\n", [
            'starfiniti-woocommerce-customer-claim-v1',
            $connectionId,
            $externalCustomerId,
            $issuedAt,
            $nonce,
            $keyVersion,
        ]);
        $signature = hash_hmac('sha256', $message, $signingKey);
        $host = (string) $parts['host'];
        if (str_contains($host, ':') && ! str_starts_with($host, '[')) {
            $host = '[' . $host . ']';
        }
        $origin = 'https://' . $host;
        if (isset($parts['port'])) {
            $origin .= ':' . (int) $parts['port'];
        }

        return add_query_arg([
            'connectionId' => $connectionId,
            'externalCustomerId' => $externalCustomerId,
            'issuedAt' => $issuedAt,
            'nonce' => $nonce,
            'keyVersion' => $keyVersion,
            'signature' => $signature,
            'lang' => str_starts_with(get_locale(), 'sl_') ? 'sl-SI' : 'en',
        ], $origin . '/claim/woocommerce');
    }
}
