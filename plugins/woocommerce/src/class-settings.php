<?php

namespace Starfiniti\Loyalty;

defined('ABSPATH') || exit;

final class Settings
{
    private const ENDPOINT = 'starfiniti_loyalty_endpoint';
    private const CONNECTION_ID = 'starfiniti_loyalty_connection_id';
    private const KEY_VERSION = 'starfiniti_loyalty_key_version';
    private const SIGNING_KEY = 'starfiniti_loyalty_signing_key_encrypted';

    public static function endpoint(): string
    {
        return (string) get_option(self::ENDPOINT, '');
    }

    public static function commandsEndpoint(): string
    {
        return preg_replace('#/events$#', '/commands', self::endpoint()) ?: '';
    }

    public static function connectionId(): string
    {
        return (string) get_option(self::CONNECTION_ID, '');
    }

    public static function keyVersion(): string
    {
        return (string) get_option(self::KEY_VERSION, '');
    }

    public static function hasSigningKey(): bool
    {
        return '' !== (string) get_option(self::SIGNING_KEY, '');
    }

    public static function signingKey(): string
    {
        $encrypted = (string) get_option(self::SIGNING_KEY, '');
        if ('' === $encrypted || ! function_exists('sodium_crypto_secretbox_open')) {
            return '';
        }
        $packed = base64_decode($encrypted, true);
        if (false === $packed || strlen($packed) <= SODIUM_CRYPTO_SECRETBOX_NONCEBYTES) {
            return '';
        }
        $nonce = substr($packed, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $ciphertext = substr($packed, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $encoded = sodium_crypto_secretbox_open($ciphertext, $nonce, self::encryptionKey());
        if (false === $encoded) {
            return '';
        }
        $decoded = base64_decode($encoded, true);
        return false !== $decoded && strlen($decoded) >= 32 ? $decoded : '';
    }

    public static function handleSave(): void
    {
        if (! current_user_can('manage_woocommerce')) {
            wp_die(esc_html__('You do not have permission to manage loyalty settings.', 'starfiniti-loyalty'));
        }
        check_admin_referer('starfiniti_loyalty_save_settings');

        $endpoint = esc_url_raw((string) wp_unslash($_POST['endpoint'] ?? ''));
        $connectionId = sanitize_text_field((string) wp_unslash($_POST['connection_id'] ?? ''));
        $keyVersion = sanitize_key((string) wp_unslash($_POST['key_version'] ?? ''));
        $encodedSigningKey = trim((string) wp_unslash($_POST['signing_key'] ?? ''));
        $setupCode = trim((string) wp_unslash($_POST['setup_code'] ?? ''));
        if ('' !== $setupCode) {
            $connectionPackage = self::decodeConnectionPackage($setupCode);
            if (null === $connectionPackage) {
                self::redirect('invalid_setup_code');
            }
            $endpoint = $connectionPackage['endpoint'];
            $connectionId = $connectionPackage['connectionId'];
            $keyVersion = $connectionPackage['keyVersion'];
            $encodedSigningKey = $connectionPackage['signingKey'];
        }
        $error = self::validate($endpoint, $connectionId, $keyVersion, $encodedSigningKey);
        if (null !== $error) {
            self::redirect($error);
        }

        $encrypted = null;
        if ('' !== $encodedSigningKey) {
            $encrypted = self::encrypt($encodedSigningKey);
            if (null === $encrypted) {
                self::redirect('encryption_unavailable');
            }
        }
        self::store(self::ENDPOINT, untrailingslashit($endpoint));
        self::store(self::CONNECTION_ID, strtolower($connectionId));
        self::store(self::KEY_VERSION, $keyVersion);
        if (null !== $encrypted) {
            self::store(self::SIGNING_KEY, $encrypted);
        }
        self::redirect('saved');
    }

    public static function notice(): ?array
    {
        $code = sanitize_key((string) wp_unslash($_GET['starfiniti_notice'] ?? ''));
        $messages = [
            'saved' => ['success', __('Connection settings saved.', 'starfiniti-loyalty')],
            'invalid_endpoint' => ['error', __('Use a valid HTTPS hub endpoint.', 'starfiniti-loyalty')],
            'invalid_connection_id' => ['error', __('Enter the connection UUID issued by the hub.', 'starfiniti-loyalty')],
            'invalid_key_version' => ['error', __('Key version must look like v1, v2, and so on.', 'starfiniti-loyalty')],
            'invalid_signing_key' => ['error', __('Signing key must be valid base64 containing at least 32 random bytes.', 'starfiniti-loyalty')],
            'invalid_setup_code' => ['error', __('The setup code is invalid or incomplete.', 'starfiniti-loyalty')],
            'signing_key_required' => ['error', __('A signing key is required for the initial connection.', 'starfiniti-loyalty')],
            'encryption_unavailable' => ['error', __('PHP Sodium is required to protect the connector signing key.', 'starfiniti-loyalty')],
        ];
        return $messages[$code] ?? null;
    }

    private static function validate(
        string $endpoint,
        string $connectionId,
        string $keyVersion,
        string $encodedSigningKey
    ): ?string {
        $scheme = strtolower((string) wp_parse_url($endpoint, PHP_URL_SCHEME));
        $path = (string) wp_parse_url($endpoint, PHP_URL_PATH);
        if (
            '' === $endpoint || false === wp_http_validate_url($endpoint)
            || 'https' !== $scheme
            || ! str_ends_with(untrailingslashit($path), '/api/v1/integrations/woocommerce/events')
        ) {
            return 'invalid_endpoint';
        }
        if (! preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $connectionId)) {
            return 'invalid_connection_id';
        }
        if (! preg_match('/^v[1-9][0-9]*$/', $keyVersion)) {
            return 'invalid_key_version';
        }
        if ('' === $encodedSigningKey) {
            return self::hasSigningKey() && self::keyVersion() === $keyVersion
                ? null
                : 'signing_key_required';
        }
        $decoded = base64_decode($encodedSigningKey, true);
        return false !== $decoded && strlen($decoded) >= 32 ? null : 'invalid_signing_key';
    }

    private static function encrypt(string $encodedSigningKey): ?string
    {
        if (! function_exists('sodium_crypto_secretbox')) {
            return null;
        }
        $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $ciphertext = sodium_crypto_secretbox($encodedSigningKey, $nonce, self::encryptionKey());
        return base64_encode($nonce . $ciphertext);
    }

    /** @return array{endpoint:string,connectionId:string,keyVersion:string,signingKey:string}|null */
    private static function decodeConnectionPackage(string $setupCode): ?array
    {
        $decoded = json_decode($setupCode, true, 8);
        if (! is_array($decoded)) {
            return null;
        }
        $expectedKeys = ['connectionId', 'endpoint', 'keyVersion', 'signingKey', 'version'];
        $actualKeys = array_keys($decoded);
        sort($actualKeys);
        if ($actualKeys !== $expectedKeys || '1' !== ($decoded['version'] ?? null)) {
            return null;
        }
        foreach (['endpoint', 'connectionId', 'keyVersion', 'signingKey'] as $key) {
            if (! is_string($decoded[$key] ?? null)) {
                return null;
            }
        }
        return [
            'endpoint' => $decoded['endpoint'],
            'connectionId' => $decoded['connectionId'],
            'keyVersion' => $decoded['keyVersion'],
            'signingKey' => $decoded['signingKey'],
        ];
    }

    private static function encryptionKey(): string
    {
        return hash('sha256', wp_salt('auth') . wp_salt('secure_auth'), true);
    }

    private static function store(string $name, string $value): void
    {
        update_option($name, $value, false);
    }

    private static function redirect(string $notice): void
    {
        wp_safe_redirect(add_query_arg(
            ['page' => 'starfiniti-loyalty', 'starfiniti_notice' => $notice],
            admin_url('admin.php')
        ));
        exit;
    }
}
