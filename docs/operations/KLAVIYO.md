# Managed Klaviyo Operations

Managed Klaviyo synchronization is optional, tenant-bound, and disabled by default. It runs from the immutable worker image in `klaviyo` mode, separately from the loyalty-value and SMTP workers. Self-hosted deployments do not create Klaviyo operations or require a provider key.

## Provider and database binding

Use one least-scope Klaviyo private key for one managed tenant connection. Required scopes are `profiles:read`, `profiles:write`, `events:write`, and `subscriptions:write`; add `lists:write` only when a reviewed Klaviyo list ID is configured.

1. Store the key in an owner-controlled file outside Git and the deployment environment file. Mount it read-only only into `klaviyo-worker`.
2. Compute its SHA-256 fingerprint without printing or logging the key.
3. As a database administrator, create the private connection row for the exact organization with the fingerprint, pinned revision `2026-07-15`, optional list ID, and initial `disabled` state. The key itself never enters PostgreSQL.
4. Confirm the organization is `managed` and has the database-authoritative `notifications` entitlement. Self-hosted mode and disabled entitlement both fail closed.
5. Set `LOYALTY_KLAVIYO_CONNECTION_ID` to the connection public UUID and `LOYALTY_KLAVIYO_API_KEY_PATH` to the host key file. The container reads `/run/secrets/klaviyo_api_key`; do not put key material in an environment value.
6. Activate the connection row only after the local sink and fingerprint mismatch tests pass. Start the isolated profile with `docker compose --profile klaviyo up -d klaviyo-worker`.

Production API origin is fixed to `https://a.klaviyo.com/api`. `LOYALTY_KLAVIYO_BASE_URL` is rejected unless `LOYALTY_KLAVIYO_TEST_MODE=true`, and test mode accepts only loopback HTTP. Never enable test mode in production.

## Data and consent behavior

- Profile upsert sends verified email plus the opaque Starfiniti customer UUID. PostgreSQL stores only the returned tenant-scoped profile ID.
- Event sync sends the strict provider-neutral event payload, original occurrence time, metric name, and immutable notification event UUID as `unique_id`. A `202` means accepted for asynchronous processing, not delivered.
- Marketing subscribe requires the exact current local customer opt-in and a provider subscription read immediately before authorization. Any global/list suppression, provider unsubscribe, hard bounce, spam complaint, invalid contact, or `can_receive_email_marketing=false` becomes a stronger local suppression and blocks subscribe.
- Live subscribe never uses `historical_import` or `consented_at`. A network-ambiguous subscribe is `manual_review`; do not replay it until provider state and double-opt-in behavior are reconciled.
- Local withdrawal uses global email-marketing unsubscribe without a list relation. Repeating it is safe because it only tightens consent.

No Klaviyo operation can create, reserve, release, spend, expire, reverse, or reconcile loyalty value. Provider outage must leave the value worker and WooCommerce checkout healthy.

## Monitoring and reconciliation

Monitor oldest due operation, state counts, attempts, rate-limit delay, profile mapping conflicts, provider-suppression imports, lease expiry, and time from preparation to provider acceptance. Alert immediately on:

- connection/fingerprint mismatch or authorization failure;
- any `manual_review`, especially subscribe ambiguity or post-action lease expiry;
- profile mapping conflict;
- attempt-limit exhaustion;
- sustained `429`/5xx growth or oldest-due breach; or
- simultaneous value-worker or checkout degradation.

Reconcile a canary by matching each immutable event/preference to one operation, its profile/action attempts, one provider profile, event `unique_id` or consent job, current local suppression/consent, and zero ledger changes. Raw provider bodies and contacts are intentionally absent from database evidence; use the controlled provider/test account for remote confirmation.

## Outage and rollback

Stop only `klaviyo-worker`, disable its private connection, or disable the tenant `notifications` entitlement. Do not stop the default worker. New provider-neutral facts continue to append; disabled work is held before contact disclosure. Existing profile IDs, attempts, terminal outcomes, and consent history remain for audit.

Rollback never calls subscribe, unsubscribe, profile deletion, or provider suppression removal. Re-enable only after verifying the same tenant/key fingerprint and current entitlement. Safe pre-action event/unsubscribe work can resume after authority is rechecked; ambiguous subscribe remains manual until reconciled.
