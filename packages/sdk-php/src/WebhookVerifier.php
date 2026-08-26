<?php

declare(strict_types=1);

namespace Starfiniti\LoyaltySdk;

final class WebhookVerifier
{
    private const UUID_PATTERN = '/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/Di';
    private const EVENT_TYPES = [
        'loyalty.points.earned',
        'loyalty.points.released',
        'loyalty.points.expiring',
        'loyalty.reward.changed',
        'loyalty.tier.changed',
        'loyalty.referral.changed',
        'loyalty.campaign.effect',
        'loyalty.connector.health',
        'loyalty.billing.changed',
    ];

    /** @param array<string, string> $headers */
    public static function verify(
        string $rawBody,
        array $headers,
        string $secret,
        int $toleranceSeconds = 300,
        ?\DateTimeImmutable $now = null,
    ): VerifiedWebhook {
        if ($rawBody === '' || strlen($rawBody) > 20 * 1024) {
            throw new WebhookVerificationException('invalid_body');
        }
        $id = self::header($headers, 'webhook-id');
        if ($id === null || preg_match(self::UUID_PATTERN, $id) !== 1) {
            throw new WebhookVerificationException('invalid_id');
        }
        $timestampText = self::header($headers, 'webhook-timestamp');
        if ($timestampText === null || preg_match('/^[0-9]{10}$/D', $timestampText) !== 1) {
            throw new WebhookVerificationException('invalid_timestamp');
        }
        if ($toleranceSeconds < 1 || $toleranceSeconds > 900) {
            throw new \InvalidArgumentException('toleranceSeconds must be between 1 and 900.');
        }
        $timestamp = (int) $timestampText;
        $current = ($now ?? new \DateTimeImmutable())->getTimestamp();
        if (abs($current - $timestamp) > $toleranceSeconds) {
            throw new WebhookVerificationException('timestamp_outside_tolerance');
        }
        $key = self::secretBytes($secret);
        $expected = hash_hmac('sha256', $id . '.' . $timestampText . '.' . $rawBody, $key, true);
        $signatureHeader = self::header($headers, 'webhook-signature') ?? '';
        $matched = false;
        foreach (array_filter(explode(' ', $signatureHeader)) as $candidate) {
            if (preg_match('/^v1,([A-Za-z0-9+\/]+={0,2})$/D', $candidate, $match) !== 1) {
                continue;
            }
            $supplied = base64_decode($match[1], true);
            if (is_string($supplied) && strlen($supplied) === strlen($expected) && hash_equals($expected, $supplied)) {
                $matched = true;
                break;
            }
        }
        if (!$matched) {
            throw new WebhookVerificationException('invalid_signature');
        }
        try {
            $event = json_decode($rawBody, true, 32, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new WebhookVerificationException('invalid_json');
        }
        if (
            !is_array($event)
            || ($event['schemaVersion'] ?? null) !== '1'
            || ($event['eventId'] ?? null) !== $id
            || !in_array($event['eventType'] ?? null, self::EVENT_TYPES, true)
        ) {
            throw new WebhookVerificationException('invalid_event');
        }

        /** @var array<string, mixed> $event */
        return new VerifiedWebhook($id, $timestamp, $event);
    }

    /** @param array<string, string> $headers */
    public static function verifyAndClaim(
        string $rawBody,
        array $headers,
        string $secret,
        WebhookReplayStore $replayStore,
        int $toleranceSeconds = 300,
        ?\DateTimeImmutable $now = null,
    ): VerifiedWebhook {
        $verified = self::verify($rawBody, $headers, $secret, $toleranceSeconds, $now);
        $expires = (new \DateTimeImmutable())->setTimestamp(
            $verified->timestamp + $toleranceSeconds,
        );
        if (!$replayStore->claim($verified->id, $expires)) {
            throw new WebhookVerificationException('duplicate_webhook');
        }

        return $verified;
    }

    /** @param array<string, string> $headers */
    private static function header(array $headers, string $name): ?string
    {
        foreach ($headers as $key => $value) {
            if (strtolower($key) === $name) {
                return $value;
            }
        }

        return null;
    }

    private static function secretBytes(string $secret): string
    {
        if (!str_starts_with($secret, 'whsec_')) {
            throw new WebhookVerificationException('invalid_secret');
        }
        $encoded = substr($secret, 6);
        if (preg_match('/^[A-Za-z0-9+\/]{43}=$/D', $encoded) !== 1) {
            throw new WebhookVerificationException('invalid_secret');
        }
        $decoded = base64_decode($encoded, true);
        if (!is_string($decoded) || strlen($decoded) !== 32 || base64_encode($decoded) !== $encoded) {
            throw new WebhookVerificationException('invalid_secret');
        }

        return $decoded;
    }
}
