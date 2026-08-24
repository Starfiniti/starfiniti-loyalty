# Generic outbound webhook operations

The generic webhook adapter is disabled by default and isolated from the value, SMTP, and Klaviyo workers. It observes provider-neutral events only; it cannot alter points, rewards, refunds, reconciliation, customer access, or WooCommerce checkout.

## Provisioning

1. Review one receiver HTTPS origin and path. Production requires public DNS, port 443, no URL credentials/query/fragment, and no redirect dependency.
2. Generate 32 random bytes outside Git and serialize them as `whsec_` plus canonical base64. Store the value in an owner-only file and transfer it to the receiver through the approved secret channel. Never print it into shell history, tickets, logs, browser telemetry, or support output.
3. Calculate SHA-256 over the decoded secret bytes. Create the private tenant endpoint with that fingerprint, exact destination/origin, sorted unique event-type allowlist, rate limit, and `disabled` state. PostgreSQL never receives the secret.
4. Run the local sink gate using explicit test mode and loopback HTTP. Verify exact raw-body HMAC, stable-ID duplicate handling, timestamp tolerance, `2xx`, `302`, `410`, `429`, `503`, oversized response, timeout, and no secret/contact logging.
5. Mount the current secret file read-only only into one `webhook-worker`. Set `LOYALTY_WEBHOOK_ENDPOINT_ID`, `LOYALTY_WEBHOOK_ALLOWED_ORIGIN`, and `LOYALTY_WEBHOOK_CURRENT_SECRET_PATH`. Keep `LOYALTY_WEBHOOK_TEST_MODE` absent in production.
6. Activate the endpoint only after its database fingerprint, worker fingerprint, allowed origin, receiver verifier, subscription, rate limit, and entitlement evidence match. Start only `docker compose --profile webhook up -d webhook-worker`.

One worker profile represents one endpoint. Run additional instances through reviewed Compose overrides with distinct service names and secret mounts. Do not share one secret across endpoints or tenants.

## Rotation

Generate a new unique secret. Update the endpoint's current fingerprint, move the old fingerprint to `previous_secret_sha256`, and set a short explicit expiry. Mount both files and set `LOYALTY_WEBHOOK_PREVIOUS_SECRET_FILE=/run/secrets/webhook_previous_secret`; the worker emits both signatures while the database overlap is valid.

After the receiver confirms the new signature, clear the previous fingerprint/expiry, unset the previous-file variable, remove the old mount, and destroy the retired secret under the credential-retention policy. A worker presenting a missing, wrong, or expired previous fingerprint cannot claim or authorize work.

## Monitoring and response

Monitor endpoint pending/retryable age, attempts/minute, DNS-policy failures, `429` delay, `410` disablement, dead letters, manual review, and lease expiry after authorization. The fixed database window is authoritative and permits 1–600 claims per minute.

Never inspect or store raw response bodies. Attempt evidence contains only bounded status/error classification and timing. A destination-policy failure is terminal until configuration is corrected. Network ambiguity is retryable because the stable webhook ID is the receiver idempotency key; after the ten-attempt ceiling, reconcile that ID before manual replay.

## Rollback

Stop only `webhook-worker`, set the endpoint to `disabled`, or disable the tenant `notifications` entitlement. Do not stop the default worker or delete events/deliveries/attempts. Disabled or removed subscriptions are rechecked before dispatch and hold queued work without disclosing payload. Do not rotate or replay a manual-review delivery until receiver state is reconciled.
