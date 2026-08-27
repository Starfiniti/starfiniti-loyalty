<?php

namespace Starfiniti\Loyalty;

defined('ABSPATH') || exit;

final class Referrals
{
    private const SESSION_CODE = 'starfiniti_referral_code';
    private const SESSION_CAPTURED_AT = 'starfiniti_referral_captured_at';
    private const SESSION_NETWORK = 'starfiniti_referral_network';
    private const SESSION_DEVICE = 'starfiniti_referral_device';
    private const META_CODE = '_starfiniti_referral_code';
    private const META_CAPTURED_AT = '_starfiniti_referral_captured_at';
    private const META_NETWORK = '_starfiniti_referral_network';
    private const META_DEVICE = '_starfiniti_referral_device';
    private const META_PAYMENT = '_starfiniti_referral_payment';
    private const META_SHIPPING = '_starfiniti_referral_shipping';

    public static function boot(): void
    {
        add_action('template_redirect', [self::class, 'captureAttribution'], 1);
        add_action('woocommerce_checkout_create_order', [self::class, 'attachOrderEvidence'], 20, 2);
    }

    public static function captureAttribution(): void
    {
        if (is_admin() || ! function_exists('WC') || null === WC()->session) {
            return;
        }
        $queryCode = $_GET['stf_ref'] ?? '';
        if (! is_string($queryCode)) {
            return;
        }
        $rawCode = strtolower(trim((string) wp_unslash($queryCode)));
        if (! wp_is_uuid($rawCode) || '' === Settings::signingKey()) {
            return;
        }
        WC()->session->set(self::SESSION_CODE, $rawCode);
        WC()->session->set(self::SESSION_CAPTURED_AT, gmdate('c'));
        WC()->session->set(
            self::SESSION_NETWORK,
            self::networkFingerprint((string) ($_SERVER['REMOTE_ADDR'] ?? ''))
        );
        WC()->session->set(
            self::SESSION_DEVICE,
            self::fingerprint('device', substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 512))
        );
    }

    /** @param array<string, mixed> $data */
    public static function attachOrderEvidence(\WC_Order $order, array $data): void
    {
        unset($data);
        if (! function_exists('WC') || null === WC()->session) {
            return;
        }
        $code = strtolower((string) WC()->session->get(self::SESSION_CODE, ''));
        $capturedAt = (string) WC()->session->get(self::SESSION_CAPTURED_AT, '');
        if (! wp_is_uuid($code) || false === strtotime($capturedAt)) {
            return;
        }
        $order->update_meta_data(self::META_CODE, $code);
        $order->update_meta_data(self::META_CAPTURED_AT, gmdate('c', (int) strtotime($capturedAt)));
        self::setFingerprintMeta(
            $order,
            self::META_NETWORK,
            (string) WC()->session->get(self::SESSION_NETWORK, '')
        );
        self::setFingerprintMeta(
            $order,
            self::META_DEVICE,
            (string) WC()->session->get(self::SESSION_DEVICE, '')
        );
        self::setFingerprintMeta($order, self::META_PAYMENT, self::paymentFingerprint($order));
        self::setFingerprintMeta($order, self::META_SHIPPING, self::shippingFingerprint($order));
    }

    /** @return array<string, mixed>|null */
    public static function orderEvidence(\WC_Order $order): ?array
    {
        $code = strtolower((string) $order->get_meta(self::META_CODE, true));
        $capturedAt = (string) $order->get_meta(self::META_CAPTURED_AT, true);
        if (! wp_is_uuid($code) || false === strtotime($capturedAt)) {
            return null;
        }
        return [
            'version' => '1',
            'advocateCode' => $code,
            'capturedAt' => gmdate('c', (int) strtotime($capturedAt)),
            'sourceNetworkFingerprint' => self::fingerprintMeta($order, self::META_NETWORK),
            'deviceFingerprint' => self::fingerprintMeta($order, self::META_DEVICE),
            'paymentFingerprint' => self::fingerprintMeta($order, self::META_PAYMENT),
            'shippingFingerprint' => self::fingerprintMeta($order, self::META_SHIPPING),
        ];
    }

    private static function networkFingerprint(string $address): ?string
    {
        $packed = @inet_pton(trim($address));
        return false === $packed ? null : self::fingerprint('network', bin2hex($packed));
    }

    private static function paymentFingerprint(\WC_Order $order): ?string
    {
        $tokens = array_map('strval', $order->get_payment_tokens());
        sort($tokens, SORT_STRING);
        return [] === $tokens
            ? null
            : self::fingerprint('payment', $order->get_payment_method() . ':' . implode(',', $tokens));
    }

    private static function shippingFingerprint(\WC_Order $order): ?string
    {
        $parts = array_map(
            static fn (string $value): string => strtolower(trim($value)),
            [
                (string) $order->get_shipping_country(),
                (string) $order->get_shipping_postcode(),
                (string) $order->get_shipping_city(),
                (string) $order->get_shipping_address_1(),
                (string) $order->get_shipping_address_2(),
            ]
        );
        $normalized = implode('|', $parts);
        return '' === str_replace('|', '', $normalized)
            ? null
            : self::fingerprint('shipping', $normalized);
    }

    private static function fingerprint(string $purpose, string $value): ?string
    {
        $key = Settings::signingKey();
        if ('' === $key || '' === $value) {
            return null;
        }
        return hash_hmac('sha256', 'starfiniti-referral-v1:' . $purpose . ':' . $value, $key);
    }

    private static function setFingerprintMeta(\WC_Order $order, string $key, ?string $value): void
    {
        if (null !== $value && 1 === preg_match('/^[a-f0-9]{64}$/', $value)) {
            $order->update_meta_data($key, $value);
        }
    }

    private static function fingerprintMeta(\WC_Order $order, string $key): ?string
    {
        $value = (string) $order->get_meta($key, true);
        return 1 === preg_match('/^[a-f0-9]{64}$/', $value) ? $value : null;
    }
}
