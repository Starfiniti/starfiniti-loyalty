<?php

declare(strict_types=1);

namespace Starfiniti\LoyaltySdk;

interface WebhookReplayStore
{
    public function claim(string $id, \DateTimeImmutable $expiresAt): bool;
}
