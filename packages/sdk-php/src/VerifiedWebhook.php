<?php

declare(strict_types=1);

namespace Starfiniti\LoyaltySdk;

final class VerifiedWebhook
{
    /** @param array<string, mixed> $event */
    public function __construct(
        public readonly string $id,
        public readonly int $timestamp,
        public readonly array $event,
    ) {
    }
}
