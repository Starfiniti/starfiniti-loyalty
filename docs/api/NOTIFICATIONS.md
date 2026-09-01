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

## Immutable tenant email templates

The six transactional SMTP event types each resolve one active English template. A tenant may use the immutable system version or publish an immutable organization version; switching the private active binding affects only subsequently accepted deliveries. Every delivery retains its exact template UUID, version, and SHA-256, so a retry cannot silently adopt later copy.

`loyalty.publish_notification_email_template_command(workspaceId, eventType, subjectTemplate, textTemplate, idempotencyKey, correlationId)` is available only to a live organization owner or admin. The caller supplies one public workspace UUID and content, never organization, actor, locale, version, hash, binding, or HTML authority. PostgreSQL derives those fields, appends minimized audit evidence, and returns only the public template UUID, version, and `created`/`duplicate` outcome. An exact retry returns the original version; changed content under the same key conflicts.

Content is intentionally constrained:

| Event                      | Allowed tokens                               |
| -------------------------- | -------------------------------------------- |
| `loyalty.points.earned`    | `points`, `pendingUntil`                     |
| `loyalty.points.released`  | `points`, `availableBalance`                 |
| `loyalty.points.expiring`  | `points`, `expiresAt`, `daysRemaining`       |
| `loyalty.reward.changed`   | `rewardReservationId`, `rewardCode`, `state` |
| `loyalty.tier.changed`     | `fromTierCode`, `toTierCode`, `effectiveAt`  |
| `loyalty.referral.changed` | `referralId`, `party`, `state`               |

Subjects are 1–200 characters and bodies 1–4,000 characters. Unknown or malformed tokens, control characters, markup, URL schemes, `www.` links, files, scripts, styles, and remote assets fail closed. PostgreSQL escapes the accepted plain text into deterministic HTML; the browser never submits HTML.

## Actor-bound test delivery

`loyalty.send_notification_test_command(workspaceId, eventType, idempotencyKey, correlationId)` accepts no recipient, contact, subject, body, version, or sample values. PostgreSQL binds the current active template and requesting Auth user to a separate SMTP test-delivery queue. Dispatch authorization rechecks a live owner/admin membership, self-hosted notification entitlement, exact lease, verified Auth email, and template hash before returning the one ephemeral address and a database-owned synthetic event. The worker adds a visible `[Starfiniti test]` subject prefix and uses the same bounded retry, dead-letter, and ambiguity rules as normal SMTP without sharing its queue lifecycle.

Disabling the notification entitlement blocks new tests and holds pre-send work but does not remove active bindings, historical versions, accepted attempts, normal delivery evidence, or any loyalty value path.

The merchant studio exposes the same boundary without becoming its authority. When the notification entitlement is disabled, publication, SMTP test, webhook creation, and key rotation controls are unavailable while templates, health, issues, endpoint evidence, and owner/admin disable or retirement remain visible. Managed deployments may publish immutable templates and manage signed webhooks, but only self-hosted deployments can queue the SMTP test. Stale or forged form submissions are still rejected by the PostgreSQL commands.

## Merchant notification workspace

`loyalty.get_notification_workspace_v1(workspaceId, issueLimit)` derives tenant scope from the live membership and returns exactly six active template projections, three provider summaries (`smtp`, `klaviyo`, `webhook`), aggregate transactional/marketing consent counts, deployment/entitlement state, and at most 100 newest canonical issues.

Issue rows expose only provider, delivery/operation/test kind, public reference UUID, optional event type, canonical `contact_unavailable`/`dead_letter`/`manual_review` state, bounded attempt count, allowlisted error code, and update instant. The projection excludes email, customer identity, payload, rendered content, destination, key or secret fingerprint, signature, worker/lease reference, raw provider body, and arbitrary error text. An incomplete or malformed projection fails closed in both PostgreSQL and the server parser rather than appearing as a healthy empty state.
