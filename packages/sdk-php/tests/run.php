<?php

declare(strict_types=1);

use Starfiniti\LoyaltySdk\ApiException;
use Starfiniti\LoyaltySdk\Client;
use Starfiniti\LoyaltySdk\HttpResponse;
use Starfiniti\LoyaltySdk\Transport;
use Starfiniti\LoyaltySdk\WebhookReplayStore;
use Starfiniti\LoyaltySdk\WebhookVerificationException;
use Starfiniti\LoyaltySdk\WebhookVerifier;

foreach ([
    'Transport.php',
    'ApiException.php',
    'HttpResponse.php',
    'CurlTransport.php',
    'Client.php',
    'WebhookReplayStore.php',
    'WebhookVerificationException.php',
    'VerifiedWebhook.php',
    'WebhookVerifier.php',
] as $source) {
    require_once __DIR__ . '/../src/' . $source;
}

function check(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$vector = json_decode(
    file_get_contents(__DIR__ . '/../../webhook-test-vectors/v1.json') ?: '',
    true,
    32,
    JSON_THROW_ON_ERROR,
);
$now = (new DateTimeImmutable())->setTimestamp((int) $vector['timestamp']);
$verified = WebhookVerifier::verify($vector['rawBody'], [
    'Webhook-Id' => $vector['id'],
    'Webhook-Timestamp' => $vector['timestamp'],
    'Webhook-Signature' => $vector['signature'],
], 'whsec_' . $vector['secretBase64'], 300, $now);
check($verified->id === $vector['id'], 'PHP verifier did not accept the shared vector.');
check($verified->event['eventType'] === 'loyalty.connector.health', 'PHP verifier returned the wrong event.');

try {
    WebhookVerifier::verify($vector['rawBody'] . ' ', [
        'webhook-id' => $vector['id'],
        'webhook-timestamp' => $vector['timestamp'],
        'webhook-signature' => $vector['signature'],
    ], 'whsec_' . $vector['secretBase64'], 300, $now);
    throw new RuntimeException('Tampered body was accepted.');
} catch (WebhookVerificationException $error) {
    check($error->errorCode === 'invalid_signature', 'Tampered body failed with the wrong code.');
}

$store = new class() implements WebhookReplayStore {
    private int $claims = 0;
    public function claim(string $id, DateTimeImmutable $expiresAt): bool
    {
        $this->claims++;

        return $this->claims === 1;
    }
};
WebhookVerifier::verifyAndClaim($vector['rawBody'], [
    'webhook-id' => $vector['id'],
    'webhook-timestamp' => $vector['timestamp'],
    'webhook-signature' => $vector['signature'],
], 'whsec_' . $vector['secretBase64'], $store, 300, $now);
try {
    WebhookVerifier::verifyAndClaim($vector['rawBody'], [
        'webhook-id' => $vector['id'],
        'webhook-timestamp' => $vector['timestamp'],
        'webhook-signature' => $vector['signature'],
    ], 'whsec_' . $vector['secretBase64'], $store, 300, $now);
    throw new RuntimeException('Duplicate webhook was accepted.');
} catch (WebhookVerificationException $error) {
    check($error->errorCode === 'duplicate_webhook', 'Replay failed with the wrong code.');
}

$transport = new class() implements Transport {
    /** @var array<int, array<string, mixed>> */
    public array $captured = [];
    public function send(string $method, string $url, array $headers, string $body, int $timeoutMilliseconds): HttpResponse
    {
        $this->captured[] = compact('method', 'url', 'headers', 'body', 'timeoutMilliseconds');

        return new HttpResponse(201, [], json_encode([
            'version' => '1',
            'customerId' => '94000000-0000-4000-8000-000000000006',
            'outcome' => 'created',
            'correlationId' => '94000000-0000-4000-8000-000000000005',
        ], JSON_THROW_ON_ERROR));
    }
};
$credential = 'sflt_v1_94000000000040008000000000000001_ERERERERERERERERERERERERERERERERERERERERERE';
$client = new Client('https://loyalty.starfiniti.com', $credential, $transport);
$result = $client->upsertCustomer([
    'version' => '1',
    'externalCustomerId' => 'merchant-customer-42',
    'idempotencyKey' => 'customer:42:v1',
    'correlationId' => '94000000-0000-4000-8000-000000000005',
]);
check($result['outcome'] === 'created', 'PHP Service API client returned the wrong outcome.');
check($transport->captured[0]['url'] === 'https://loyalty.starfiniti.com/api/v1/service/customers', 'PHP client used the wrong route.');
check($transport->captured[0]['headers']['authorization'] === 'Bearer ' . $credential, 'PHP client omitted authorization.');
check(json_decode($transport->captured[0]['body'], true)['externalCustomerId'] === 'merchant-customer-42', 'PHP client changed the request body.');

echo "Validated PHP Service API and Standard Webhooks contracts.\n";
