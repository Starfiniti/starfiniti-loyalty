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

## Delivery boundary

M08-S01 creates no external delivery and no fake provider. Later adapters must:

1. derive a minimized delivery from the immutable event;
2. resolve contact information late from a separately controlled source;
3. recheck current preference and suppression at serialized dispatch authorization;
4. send outside value-processing transactions;
5. retain only bounded provider codes/references and retry evidence.

Disabling notification delivery cannot block checkout, events, ledger effects, refunds, reconciliation, balances, or customer access.
