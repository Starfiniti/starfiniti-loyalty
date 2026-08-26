<?php

declare(strict_types=1);

namespace Starfiniti\LoyaltySdk;

final class WebhookVerificationException extends \RuntimeException
{
    public function __construct(public readonly string $errorCode)
    {
        parent::__construct('Starfiniti webhook verification failed with ' . $errorCode . '.');
    }
}
