<?php

declare(strict_types=1);

namespace Starfiniti\LoyaltySdk;

final class Client
{
    private const TOKEN_PATTERN = '/^sflt_v1_[0-9a-f]{32}_[A-Za-z0-9_-]{43}$/D';
    private const UUID_PATTERN = '/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/Di';
    private const SAFE_KEY_PATTERN = '/^[A-Za-z0-9._:-]{1,255}$/D';

    private readonly string $baseUrl;

    public function __construct(
        string $baseUrl,
        private readonly string $credential,
        private readonly Transport $transport = new CurlTransport(),
        private readonly int $timeoutMilliseconds = 15000,
        bool $allowInsecureLocalhost = false,
    ) {
        $parts = parse_url($baseUrl);
        $host = is_array($parts) ? ($parts['host'] ?? '') : '';
        $scheme = is_array($parts) ? ($parts['scheme'] ?? '') : '';
        $local = in_array($host, ['localhost', '127.0.0.1', '::1'], true);
        if (
            !is_array($parts)
            || $host === ''
            || isset($parts['user'])
            || isset($parts['pass'])
            || isset($parts['query'])
            || isset($parts['fragment'])
            || ($scheme !== 'https' && !($allowInsecureLocalhost && $local && $scheme === 'http'))
        ) {
            throw new \InvalidArgumentException('baseUrl must be an HTTPS origin without credentials.');
        }
        if (preg_match(self::TOKEN_PATTERN, $credential) !== 1) {
            throw new \InvalidArgumentException('credential is not a Starfiniti service token.');
        }
        if ($timeoutMilliseconds < 1000 || $timeoutMilliseconds > 30000) {
            throw new \InvalidArgumentException('timeoutMilliseconds must be between 1000 and 30000.');
        }
        $this->baseUrl = rtrim($baseUrl, '/');
    }

    /**
     * @param array{version: '1', externalCustomerId: string, idempotencyKey: string, correlationId: string} $command
     * @return array{version: '1', customerId: string, outcome: string, correlationId: string}
     */
    public function upsertCustomer(array $command): array
    {
        if (
            ($command['version'] ?? null) !== '1'
            || !$this->safeReference($command['externalCustomerId'] ?? null)
            || preg_match(self::SAFE_KEY_PATTERN, $command['idempotencyKey'] ?? '') !== 1
            || preg_match(self::UUID_PATTERN, $command['correlationId'] ?? '') !== 1
        ) {
            throw new \InvalidArgumentException('invalid ServiceCustomerUpsertV1 command.');
        }
        $result = $this->post('/api/v1/service/customers', $command);
        if (
            ($result['version'] ?? null) !== '1'
            || preg_match(self::UUID_PATTERN, $result['customerId'] ?? '') !== 1
            || !in_array($result['outcome'] ?? null, ['created', 'existing', 'duplicate'], true)
            || preg_match(self::UUID_PATTERN, $result['correlationId'] ?? '') !== 1
        ) {
            throw new ApiException(200, 'invalid_response');
        }

        /** @var array{version: '1', customerId: string, outcome: string, correlationId: string} $result */
        return $result;
    }

    /**
     * @param array<string, mixed> $command
     * @return array{version: '1', receiptId: string, outcome: string, canonicalEventId: string, canonicalOutcome: string, correlationId: string}
     */
    public function submitActivity(array $command): array
    {
        $sources = ['account_created', 'birthday', 'verified_product_review', 'custom_activity'];
        $source = $command['source'] ?? null;
        $categories = $command['categoryIds'] ?? null;
        $product = $command['productId'] ?? null;
        $canonical = $source === 'custom_activity' ? null : $source;
        if (
            ($command['version'] ?? null) !== '1'
            || !$this->safeReference($command['externalCustomerId'] ?? null)
            || preg_match(self::SAFE_KEY_PATTERN, $command['eventId'] ?? '') !== 1
            || !is_string($command['occurredAt'] ?? null)
            || strtotime($command['occurredAt']) === false
            || !in_array($source, $sources, true)
            || preg_match('/^[a-z][a-z0-9_-]{0,79}$/D', $command['activityCode'] ?? '') !== 1
            || ($canonical !== null && $command['activityCode'] !== $canonical)
            || !is_array($categories)
            || count($categories) > 100
            || array_filter($categories, fn ($item): bool => !$this->safeReference($item)) !== []
            || ($source === 'verified_product_review' && !$this->safeReference($product))
            || ($source !== 'verified_product_review' && ($product !== null || $categories !== []))
            || preg_match(self::SAFE_KEY_PATTERN, $command['idempotencyKey'] ?? '') !== 1
            || preg_match(self::UUID_PATTERN, $command['correlationId'] ?? '') !== 1
        ) {
            throw new \InvalidArgumentException('invalid ServiceActivityV1 command.');
        }
        $result = $this->post('/api/v1/service/activities', $command);
        if (
            ($result['version'] ?? null) !== '1'
            || preg_match(self::UUID_PATTERN, $result['receiptId'] ?? '') !== 1
            || !in_array($result['outcome'] ?? null, ['accepted', 'duplicate'], true)
            || preg_match(self::UUID_PATTERN, $result['canonicalEventId'] ?? '') !== 1
            || !in_array($result['canonicalOutcome'] ?? null, ['created', 'duplicate'], true)
            || preg_match(self::UUID_PATTERN, $result['correlationId'] ?? '') !== 1
        ) {
            throw new ApiException(200, 'invalid_response');
        }

        /** @var array{version: '1', receiptId: string, outcome: string, canonicalEventId: string, canonicalOutcome: string, correlationId: string} $result */
        return $result;
    }

    /** @param array<string, mixed> $command @return array<string, mixed> */
    private function post(string $path, array $command): array
    {
        $body = json_encode($command, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
        $response = $this->transport->send('POST', $this->baseUrl . $path, [
            'authorization' => 'Bearer ' . $this->credential,
            'content-type' => 'application/json; charset=utf-8',
            'accept' => 'application/json',
        ], $body, $this->timeoutMilliseconds);
        try {
            $decoded = json_decode($response->body, true, 32, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new ApiException($response->status, 'invalid_response');
        }
        if (!is_array($decoded)) {
            throw new ApiException($response->status, 'invalid_response');
        }
        if ($response->status < 200 || $response->status > 299) {
            $code = $decoded['error']['code'] ?? 'request_failed';
            if (!is_string($code) || preg_match('/^[a-z][a-z0-9_]{0,79}$/D', $code) !== 1) {
                $code = 'request_failed';
            }
            $retry = $response->header('retry-after');
            $retrySeconds = is_string($retry) && preg_match('/^[0-9]{1,5}$/D', $retry) === 1
                ? (int) $retry
                : null;
            if ($retrySeconds !== null && ($retrySeconds < 1 || $retrySeconds > 86400)) {
                $retrySeconds = null;
            }
            throw new ApiException($response->status, $code, $retrySeconds);
        }

        /** @var array<string, mixed> $decoded */
        return $decoded;
    }

    private function safeReference(mixed $value): bool
    {
        return is_string($value)
            && $value === trim($value)
            && strlen($value) >= 1
            && strlen($value) <= 200
            && preg_match('/[\x00-\x1F\x7F]/', $value) !== 1;
    }
}
