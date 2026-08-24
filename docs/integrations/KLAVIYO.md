# Klaviyo Integration

M08 is active. The provider-neutral event and local consent authority are implemented first; no Klaviyo API call or production credential is active in M08-S01. Klaviyo remains a downstream managed-deployment adapter and never becomes the source of loyalty value, customer identity, consent, or suppression.

The managed adapter will pin an explicit API revision when M08-S03 ships. Current official guidance reviewed on 2026-08-24 establishes these release constraints:

- Create Event uses a caller-supplied `unique_id`; Starfiniti will send the immutable notification event UUID and reuse it on retry.
- A `202` response means the event was validated and accepted for asynchronous processing, not that downstream processing or messaging completed.
- `429` must honor `Retry-After`; `429` and `503` use bounded exponential backoff with jitter.
- Event/profile payloads remain below documented limits and include only the adapter-specific allowlist.
- Subscribe and unsubscribe endpoints change consent and can remove suppressions. They are called only from exact local consent/suppression decisions; profile synchronization alone never changes local authority.
- Private API credentials remain server-side and are never stored in PostgreSQL event payloads, browser code, WordPress, logs, or provider error evidence.

Official references:

- https://developers.klaviyo.com/en/reference/create_event
- https://developers.klaviyo.com/en/reference/events_api_overview
- https://developers.klaviyo.com/en/docs/rate_limits_and_error_handling
- https://developers.klaviyo.com/en/reference/bulk_subscribe_profiles
- https://developers.klaviyo.com/en/reference/bulk_unsubscribe_profiles

M08-S03 still requires a Klaviyo test credential and explicit test account/list identifiers for its canary. Their absence does not block the provider-neutral repository slices.
