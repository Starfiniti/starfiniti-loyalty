# Notification Events and Preferences

M08 uses a provider-neutral event boundary. PostgreSQL is the authority for event identity, customer purpose, consent, and suppression; SMTP, Klaviyo, and generic webhooks are downstream adapters.

## Event contract

`NotificationEventV1` is strict, English-only, and discriminated by `eventType`:

- `loyalty.points.earned`
- `loyalty.points.released`
- `loyalty.points.expiring`
- `loyalty.reward.changed`
- `loyalty.tier.changed`
- `loyalty.referral.changed`
- `loyalty.campaign.effect`
- `loyalty.connector.health`
- `loyalty.billing.changed`

Customer events bind an exact internal organization, programme group, and customer before PostgreSQL emits a public event UUID. Merchant operational events have no customer subject. Each type has an exact payload shape and purpose. Extra properties fail validation, so the event stream cannot be used to copy email, phone, name, address, coupon plaintext, raw provider responses, secrets, tokens, or ledger metadata.

`loyalty_private.emit_notification_event_v1` accepts only trusted worker/database calls. The organization-scoped deduplication key returns the original UUID for an exact retry and rejects changed evidence. The event row and hash are immutable.

## Customer preferences

Email preferences are purpose-separated:

| Purpose                 | Default        | Meaning                                     |
| ----------------------- | -------------- | ------------------------------------------- |
| `loyalty_transactional` | `subscribed`   | Loyalty value and account-state information |
| `loyalty_marketing`     | `unsubscribed` | Promotional campaign communication          |

`loyalty.get_my_notification_preferences_v1()` derives every account from the active Supabase Auth customer link and returns no contact data. `loyalty.set_my_notification_preference_v1(accountId, purpose, state, idempotencyKey, correlationId)` accepts only `subscribed` or `unsubscribed`; it never accepts organization, customer, channel, provider, email, or phone authority.

Trusted provider/system suppression is stronger than a customer preference. A customer cannot clear it. Trusted unsuppression resolves to `unsubscribed`, requiring a new explicit marketing consent before marketing can resume. Pseudonymizing or closing a customer immediately suppresses both purposes.

## Self-hosted SMTP delivery

M08-S02 implements transactional email for the six customer event types. Campaign marketing and merchant operational events remain provider-neutral only; they do not enter the SMTP transactional queue.

`SmtpNotificationDeliveryClaimV1` contains only a public delivery UUID and lease expiry. `loyalty_private.authorize_smtp_notification_delivery_v1` then rechecks the current self-hosted deployment mode, `notifications` entitlement, exact lease owner, active customer/link, verified Supabase Auth email, transactional preference, and trusted suppression. Only an authorized result contains an ephemeral `recipientEmail`, immutable template evidence, and strict event. Held, suppressed, and contact-unavailable outcomes contain no contact or message content.

SMTP projection creation evaluates deployment mode and entitlement at the enqueue or backfill statement time, not at the event transaction timestamp. A disablement committed by an earlier statement therefore prevents later work creation even when both statements share one long transaction; already accepted leases still recheck the same authority before contact disclosure.

The worker verifies the template SHA-256, renders only event-specific allowlisted tokens, and supplies a stable event-derived `Message-ID`. Recipient email, rendered subject/body, MIME content, SMTP password, and raw provider response are never written to notification event/delivery/attempt tables or logs.

SMTP outcomes are conservative:

| Evidence                                                                  | State           | Automatic retry |
| ------------------------------------------------------------------------- | --------------- | --------------- |
| Exact 2xx acceptance for the one expected recipient                       | `delivered`     | No              |
| Explicit 4xx or proven pre-acceptance DNS/TLS/connection/timeout failure  | `retryable`     | Yes, max 10     |
| Explicit 5xx, authentication, configuration, envelope, or message failure | `dead_letter`   | No              |
| Unknown/incomplete acceptance, DATA timeout, or post-authorization crash  | `manual_review` | No              |
| Consent/suppression/contact/entitlement fails at authorization            | Withheld state  | No send         |

An exact provider-neutral event replay creates one delivery. SMTP itself cannot atomically prove remote exactly-once delivery, so ambiguous acceptance is stopped for review rather than automatically repeated.

The SMTP worker is a separate process and optional Compose profile. Disabling it cannot block checkout, events, ledger effects, refunds, reconciliation, balances, or customer access. See `docs/operations/SMTP.md` and ADR-0032.
