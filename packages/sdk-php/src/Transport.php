<?php

declare(strict_types=1);

namespace Starfiniti\LoyaltySdk;

interface Transport
{
    /**
     * @param array<string, string> $headers
     */
    public function send(
        string $method,
        string $url,
        array $headers,
        string $body,
        int $timeoutMilliseconds,
    ): HttpResponse;
}
