# ADR-0032: Isolate SMTP behind database-authorized dispatch leases

- Status: Accepted
- Date: 2026-08-24
- Scope: M08-S02 self-hosted transactional email delivery

## Context

ADR-0031 makes PostgreSQL authoritative for provider-neutral events, purpose-bound consent, trusted suppression, and immutable event identity. Self-hosted installations now need useful transactional email without making SMTP a loyalty-value dependency, persisting recipient contact in delivery evidence, or turning uncertain SMTP outcomes into an automatic duplicate-send loop.

Nodemailer supports direct SMTP, pooled connections, explicit TLS modes, bounded connection/greeting/socket timeouts, envelope control, and file/URL access denial. Its errors expose SMTP response classes and the protocol command that failed. SMTP still cannot provide atomic exactly-once delivery with PostgreSQL: after the message is submitted, a connection can fail before the client learns whether the server accepted it. Retrying that ambiguous outcome automatically can duplicate a customer message.

Documentation reviewed on 2026-08-24:

- https://nodemailer.com/smtp
- https://nodemailer.com/message
- https://nodemailer.com/errors
- https://nodemailer.com/smtp/pooled

## Decision

1. Self-hosted transactional SMTP is a separate worker mode and optional Compose profile. The existing value worker remains the default process and never initializes an SMTP connection. Starting, stopping, or misconfiguring the SMTP worker cannot stop commerce ingestion, ledger effects, refunds, reconciliation, customer access, or WooCommerce checkout.
2. PostgreSQL owns a mutable delivery lease projection and append-only template/attempt evidence. Direct table access remains revoked. The worker can only claim a bounded batch, authorize its exact owned lease, and finish one allowlisted outcome.
3. Notification events map idempotently to one SMTP delivery. Six immutable English template versions cover transactional points, reward, tier, and referral events. The worker verifies the database template SHA-256 before rendering and substitutes only event-type allowlisted tokens.
4. A claim contains only a public delivery UUID and lease expiry. PostgreSQL resolves the active customer link and verified Supabase Auth email only during dispatch authorization, after rechecking self-hosted deployment mode, the current `notifications` entitlement, consent, suppression, customer state, and lease ownership. Email is returned ephemerally and is not stored in the event, delivery, template, or attempt tables.
5. Authorization increments the attempt count immediately before one external call. A deterministic message ID derived from the immutable event UUID gives receiving systems a stable deduplication signal. A duplicate event creates no second delivery.
6. Explicit SMTP 4xx rejection and failures proven to occur before message acceptance—DNS, TLS setup, connection, greeting/authentication-phase socket failures, and timeouts—may retry with database-owned exponential backoff, deterministic jitter, and a maximum of ten authorized attempts. SMTP 5xx, authentication, configuration, envelope, template, and message failures terminate as dead letter.
7. Unknown failures, incomplete acceptance, DATA-phase timeout, accepted/rejected-envelope disagreement, and a worker crash after authorization stop in `manual_review`. They are never retried automatically because remote acceptance is ambiguous. A lease that expires before authorization is safely retryable without consuming an attempt.
8. SMTP credentials are optional. When authentication is used, the password is read from an absolute owner-controlled file mounted into the notification-worker container; it is never accepted as a browser field or environment value. Runtime logging/debugging is disabled, raw provider responses and message bodies are not persisted, and bounded result codes are the only provider evidence.

## Alternatives

1. **Send from the existing value worker.** Rejected because SMTP DNS, TLS, authentication, connection pools, and provider backoff would share a failure and restart domain with loyalty-value processing.
2. **Send synchronously from a ledger/event transaction.** Rejected because a remote SMTP operation cannot participate atomically in PostgreSQL and would couple provider latency or outage to value processing.
3. **Persist the resolved email and rendered MIME message in the queue.** Rejected because it increases breach, export, erasure, and backup scope without adding value authority.
4. **Retry every transport exception.** Rejected because SMTP acceptance can be ambiguous after DATA; automatic retry can duplicate a customer message.
5. **Treat every transport exception as terminal.** Rejected because explicit 4xx and pre-acceptance connection failures are safely retryable and otherwise turn short provider outages into unnecessary message loss.

## Security and integrity effects

The worker database role receives no direct template, delivery, attempt, event, preference, customer-link, or Auth table access. One static migration-administrator-owned security-definer bridge in `loyalty_private` accepts only a database-derived Auth user UUID and returns an email only when that Auth row is confirmed and not deleted. This avoids modifying the Supabase-managed `auth` schema, transferring ownership to the reserved `supabase_auth_admin` role, or granting the loyalty owner persistent Auth-table access. Only the NOLOGIN loyalty function owner can execute the bridge; the worker cannot. Both the bridge and dispatch command have empty search paths, derive tenant and contact authority internally, and expose contact only in the authorized result. Templates and attempts are immutable; delivery state is operational projection only. Message rendering disables filesystem and URL access at transport and message level. No SMTP outcome can create, release, reserve, spend, expire, reverse, or reconcile loyalty value.

SMTP does not become exactly-once infrastructure merely because the event is deduplicated. Exact event replay creates one local delivery, while ambiguous remote acceptance deliberately requires review. This is safer than silently converting uncertainty into repeat sends.

## Operations

The `smtp` Compose profile stays disabled until host, port, TLS mode, from address, optional username, and mounted password file are verified against a local or approved test sink. Monitor pending/retryable age, lease expiry before/after authorization, attempts, delivered/dead-letter/manual-review/contact-unavailable/suppressed/held counts, and authorization-to-acceptance latency. Alert on any post-authorization lease expiry, manual review, attempt-limit exhaustion, authentication failure, or queue-age breach.

The canary must cover one verified customer, withdrawal between claim and authorization, trusted suppression, unverified contact, disabled/re-enabled entitlement, exact event replay, explicit 4xx/5xx, SMTP outage, pre/post-authorization worker death, and reconciliation of every event, delivery, attempt, and sink message. Provider outage tests must simultaneously prove the value worker and WooCommerce checkout remain healthy.

## Migration and rollback

Deploy the additive tables, functions, templates, and worker image while the `smtp` profile is absent. The migration backfills eligible existing transactional events idempotently. Enabling the profile is a separate operator action after the database and sink gates pass.

Rollback stops the notification-worker profile or disables the `notifications` entitlement. New provider-neutral events continue to append, disabled events create no SMTP projection, and already queued work is held before contact disclosure. Existing immutable events, templates, attempts, and terminal delivery evidence are retained. Forward fixes may resume held pre-authorization work after rechecking current authority; manual-review outcomes are never blindly replayed.
