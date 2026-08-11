# Webhooks

Every request carries a version, event ID, store/connection identity, event timestamp, delivery timestamp, and HMAC signature. Verify against the raw body with constant-time comparison, enforce bounded clock/replay policy, persist before acknowledgement, and deduplicate both delivery and business effects.
