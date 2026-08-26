<?php

declare(strict_types=1);

namespace Starfiniti\LoyaltySdk;

final class HttpResponse
{
    /**
     * @param array<string, string> $headers
     */
    public function __construct(
        public readonly int $status,
        public readonly array $headers,
        public readonly string $body,
    ) {
        if ($status < 100 || $status > 599) {
            throw new \InvalidArgumentException('HTTP status is outside the supported range.');
        }
        if (strlen($body) > 32 * 1024) {
            throw new ApiException($status, 'response_too_large');
        }
    }

    public function header(string $name): ?string
    {
        $target = strtolower($name);
        foreach ($this->headers as $key => $value) {
            if (strtolower($key) === $target) {
                return $value;
            }
        }

        return null;
    }
}
