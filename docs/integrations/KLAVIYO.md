# Klaviyo Integration

M08 is active. The provider-neutral event and local consent authority are implemented first; no Klaviyo API call or production credential is active in M08-S01. Klaviyo remains a downstream managed-deployment adapter and never becomes the source of loyalty value, customer identity, consent, or suppression.

The managed adapter pins stable API revision `2026-07-15`. ADR-0033 records the tenant/key binding, retry, suppression, and rollback decision. Current official guidance reviewed on 2026-08-24 establishes these release constraints:

- Create Event uses a caller-supplied `unique_id`; Starfiniti will send the immutable notification event UUID and reuse it on retry.
- A `202` response means the event was validated and accepted for asynchronous processing, not that downstream processing or messaging completed.
- `429` must honor `Retry-After`; `429` and `503` use bounded exponential backoff with jitter.
- Event/profile payloads remain below documented limits and include only the adapter-specific allowlist.
- Subscribe and unsubscribe endpoints change consent and can remove suppressions. They are called only from exact local consent/suppression decisions; profile synchronization alone never changes local authority.
- Subscribe first reads provider subscription state. Any provider unsubscribe or suppression is imported as a stronger local suppression; the adapter never blindly clears it and never supplies `historical_import` or `consented_at` for a live opt-in.
- A network-ambiguous subscribe stops for manual reconciliation. Event creation retries with the same unique ID, and global unsubscribe may safely retry because it only tightens consent.
- Private API credentials remain server-side and are never stored in PostgreSQL event payloads, browser code, WordPress, logs, or provider error evidence.

The initial managed deployment uses one disabled-by-default worker per tenant-bound connection. PostgreSQL stores only the private-key SHA-256 fingerprint and verifies it with the connection and organization before disclosing a verified email. Production is fixed to `https://a.klaviyo.com/api`; only explicit test mode permits a loopback HTTP sink.

Official references:

- https://developers.klaviyo.com/en/reference/create_event
- https://developers.klaviyo.com/en/reference/events_api_overview
- https://developers.klaviyo.com/en/docs/rate_limits_and_error_handling
- https://developers.klaviyo.com/en/reference/bulk_subscribe_profiles
- https://developers.klaviyo.com/en/reference/bulk_unsubscribe_profiles

The repository slice can be verified against a local HTTP sink without credentials. Production activation still requires a Klaviyo test credential, a managed pilot organization, and an optional reviewed list identifier at the S06 canary gate.
