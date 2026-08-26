<?php

declare(strict_types=1);

namespace Starfiniti\LoyaltySdk;

final class CurlTransport implements Transport
{
    private const MAX_RESPONSE_BYTES = 32768;

    public function send(
        string $method,
        string $url,
        array $headers,
        string $body,
        int $timeoutMilliseconds,
    ): HttpResponse {
        if (!function_exists('curl_init')) {
            throw new ApiException(0, 'curl_unavailable');
        }
        $handle = curl_init($url);
        if ($handle === false) {
            throw new ApiException(0, 'transport_unavailable');
        }
        $responseHeaders = [];
        $responseBody = '';
        $tooLarge = false;
        $headerLines = [];
        foreach ($headers as $name => $value) {
            $headerLines[] = $name . ': ' . $value;
        }
        curl_setopt_array($handle, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_HTTPHEADER => $headerLines,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_MAXREDIRS => 0,
            CURLOPT_CONNECTTIMEOUT_MS => min(5000, $timeoutMilliseconds),
            CURLOPT_TIMEOUT_MS => $timeoutMilliseconds,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_HEADERFUNCTION => static function ($curl, string $line) use (&$responseHeaders): int {
                $length = strlen($line);
                $separator = strpos($line, ':');
                if ($separator !== false) {
                    $name = strtolower(trim(substr($line, 0, $separator)));
                    $value = trim(substr($line, $separator + 1));
                    if ($name !== '' && strlen($name) <= 100 && strlen($value) <= 1024) {
                        $responseHeaders[$name] = $value;
                    }
                }

                return $length;
            },
            CURLOPT_WRITEFUNCTION => static function ($curl, string $chunk) use (&$responseBody, &$tooLarge): int {
                if (strlen($responseBody) + strlen($chunk) > self::MAX_RESPONSE_BYTES) {
                    $tooLarge = true;

                    return 0;
                }
                $responseBody .= $chunk;

                return strlen($chunk);
            },
        ]);
        $ok = curl_exec($handle);
        $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
        $error = curl_errno($handle);
        curl_close($handle);
        if ($tooLarge) {
            throw new ApiException($status, 'response_too_large');
        }
        if ($ok === false || $error !== 0 || $status === 0) {
            throw new ApiException(0, 'transport_unavailable');
        }

        return new HttpResponse($status, $responseHeaders, $responseBody);
    }
}
