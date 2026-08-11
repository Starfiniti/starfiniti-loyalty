# ADR-0007: Transactional inbox, outbox, and reconciliation

- Status: Accepted
- Date: 2026-08-11
- Scope: WooCommerce delivery, processing, external commands, and recovery

## Context

WooCommerce webhooks and plugin deliveries are at-least-once, delayed, reorderable, and may have unknown outcomes. Direct synchronous award processing or external calls inside database transactions would duplicate effects, hold locks, and make crash recovery ambiguous.

## Decision

Use a signed raw inbox, canonical events, transactional business effects, and an outbox/reconciliation loop.

- Verify HMAC over bounded raw bytes before parsing or creating a processable row.
- Persist each delivery once, acknowledge quickly, and normalize asynchronously.
- Enforce separate uniqueness for delivery, canonical event, business effect, domain command, and connector command.
- Write database effects and outbox messages in one transaction.
- Lease outbox work in bounded batches; perform external calls after committing the lease; record results idempotently.
- Quarantine poison/conflicting payloads without blocking later work.
- Reconcile WooCommerce source data on a durable schedule and repair through ordinary idempotent commands.
- Checkout remains independent of the hub; the plugin owns a local Action Scheduler-backed outbox.

## Alternatives

1. **Process during webhook request.** Lower latency but fragile under timeouts, retries, and worker/database outages.
2. **Use only an external queue.** Useful later, but cannot atomically couple queue publication to database effects without an outbox.
3. **Trust WooCommerce event ordering.** Incorrect: sources and networks provide no total order and refunds can arrive after awards/releases.

## Security and integrity effects

Signature/replay controls reject forged deliveries. Layered idempotency ensures one business effect. Restricted raw-body retention reduces PII exposure. Replay and repair require authorization and audit.

## Operations

Operators monitor ingest latency, oldest queue age, attempts, dead letters, reconciliation gaps, and event-to-ledger latency. Backoff is bounded with jitter. Dead-letter replay retains the original IDs and never disables uniqueness checks.

## Migration and rollback

Tables/functions are introduced before traffic is enabled. Plugin rollout is feature-flagged per connection. Rollback disables new ingestion/dispatch while retaining queued evidence; the previous compatible worker can resume. Destructive queue cleanup requires retention policy and reconciliation evidence.
