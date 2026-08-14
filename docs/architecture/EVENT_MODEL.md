# Event Model

## Delivery contract

WooCommerce deliveries are at-least-once, may be delayed or reordered, and are untrusted until verified. Each envelope carries:

- contract version and event type;
- immutable connection/store ID;
- delivery ID and source object/event ID;
- source occurrence and delivery timestamps;
- optional source revision/modified timestamp;
- nonce;
- raw-body SHA-256;
- HMAC key version and signature;
- correlation/causation IDs when the plugin is responding to a hub command.

The signature covers the exact request-target identifier, timestamp, nonce, and raw body. Comparison is constant-time. The server bounds body size and read time before allocation, rejects disabled connections and unknown key versions, and does not parse JSON before signature verification.

## Ingestion sequence

```mermaid
sequenceDiagram
  participant WC as WooCommerce plugin
  participant IN as Ingestion endpoint
  participant DB as PostgreSQL
  participant W as Worker

  WC->>WC: Persist local outbox row
  WC->>IN: Signed raw delivery
  IN->>IN: Bound size/time; locate connection; verify HMAC/replay window
  IN->>DB: INSERT delivery ON CONFLICT
  DB-->>IN: Stable receipt/result
  IN-->>WC: 202 accepted or idempotent prior result
  W->>DB: Lease accepted delivery with SKIP LOCKED
  W->>W: Parse and normalize versioned payload
  W->>DB: Atomic event + business effect + ledger/audit/outbox
  DB-->>W: Commit result
  WC->>WC: Mark local outbox delivered
```

Invalid signatures are never stored as processable deliveries. Aggregated rejection metrics may retain connection, reason code, time, and request ID without body or signature values.

## Idempotency layers

1. **HTTP delivery:** unique `(connection_id, source_delivery_id)` returns the original receipt for retries.
2. **Canonical event:** unique `(connection_id, source_event_id, normalization_version)` prevents duplicate facts.
3. **Business effect:** unique `(organization_id, event_id, effect_kind, effect_key)` prevents an event from applying the same intent twice.
4. **Domain command:** unique tenant-scoped idempotency key plus canonical input hash returns the original transaction/reservation result.
5. **Connector command:** unique command ID makes coupon creation/cancellation and synchronization idempotent in WordPress.

Same key plus different canonical hash is a conflict and is quarantined; it is never treated as a successful replay.

## Ordering model

- Events are not globally ordered.
- Aggregate ordering uses source revision/modified timestamp where trustworthy, then occurrence time and receipt ID only as deterministic tie-breakers.
- State transitions use compare-and-set guards. An older event cannot regress a newer known state.
- Late events remain recorded and may create a valid compensating effect—for example a refund arriving after award release.
- Missing or ambiguous transitions schedule source reconciliation instead of inventing facts.
- Clock skew is recorded and monitored; commerce timestamps do not replace database receipt/commit timestamps.

## Canonical event types

Initial versioned types are:

- `commerce.order.upserted`
- `commerce.order.status_changed`
- `commerce.order.refunded`
- `commerce.customer.upserted`
- `commerce.customer.deleted`
- `commerce.product.upserted`
- `commerce.connection.rotated`
- `commerce.connection.disabled`
- `commerce.coupon.issued`
- `commerce.coupon.captured`
- `commerce.coupon.cancelled`

Platform payloads are preserved only in the restricted delivery record. Canonical payloads contain integer minor units, ISO currency, stable source IDs, line/refund attribution, and the minimum customer attributes required by policy. Once a `commerce.customer.deleted` effect is applied, both the restricted delivery body and canonical event are reduced to an opaque privacy-case reference; a private keyed tombstone retains only what is needed to suppress re-import.

An order may carry `ReferralAttributionEvidenceV1`: one opaque advocate UUID, capture instant, and nullable purpose-separated network, device, payment, and shipping HMAC fingerprints. WooCommerce retains the raw inputs locally. The canonical event contains no IP address, user agent, email, name, payment token, or shipping address. PostgreSQL derives the tenant, programme, advocate, and friend from the signed event and connection-scoped identities, then serializes first attribution before the worker records its business-effect fence.

Referral qualification derives the attribution's original immutable programme version from the canonical status event. The worker runs the shared V2 evaluator against that historical definition; PostgreSQL verifies event identity/time and result bounds, derives prior paid-order history and minimum-spend eligibility, and appends cooling/rejection/review-held evidence. An eligible cooling transition enqueues private leased work at its event-time deadline. One database transaction issues and releases the advocate/friend points, records both tier facts and immutable issuance evidence, then appends `qualified`. A signed source-order refund either rejects/cancels value-neutral work or atomically reverses both issued sides before appending `reversed`.

## Processing states

Deliveries transition only through:

```text
accepted -> processing -> applied
                     |-> retryable -> processing
                     |-> quarantined
                     |-> dead_letter
```

Leases have owner and expiry. A crashed worker leaves a recoverable lease. Attempts use exponential backoff with jitter and a maximum age/attempt policy. Dead-letter replay requires authorization, reason, correlation ID, and an audit event; replay does not bypass idempotency.

## Transactional outbox

Any database transaction that requires a later external action writes an outbox row before commit. Workers claim available rows in small batches with `FOR UPDATE SKIP LOCKED`, commit the lease, perform the network call outside a transaction, then record the idempotent result in a short transaction.

Outbox payloads are versioned and contain references, not secrets or unnecessary PII. A delivery is considered complete only after the remote idempotency result is recorded. Unknown outcomes are retried with the same command ID.

## Reconciliation

- Per-connection scheduled jobs page through WooCommerce REST API using a durable cursor/watermark.
- Reconciliation compares source orders/refunds/coupons with canonical facts and business effects.
- Differences are classified as missing delivery, normalization error, transient dependency failure, policy conflict, or source mutation.
- Safe repairs reuse the normal command path and idempotency keys. Unsafe/ambiguous cases become operator work items.
- Counts, monetary totals, point totals, cursor range, and repair references are retained for audit.

## Failure behavior

| Failure                 | Required behavior                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------- |
| Hub unavailable         | Plugin keeps local outbox; checkout proceeds; cached UI declares staleness            |
| Plugin/Woo unavailable  | Outbox command retries; reservation eventually expires/releases                       |
| Worker crash            | Lease expires; same delivery/command safely resumes                                   |
| Duplicate delivery      | Stable prior receipt; one canonical event/effect                                      |
| Out-of-order refund     | Stored and applied against original attribution; no historical rule recalculation     |
| Database unavailable    | Ingestion returns retryable status; no false acknowledgement                          |
| Poison payload          | Quarantine with bounded diagnostic metadata; later deliveries continue                |
| Secret rotation overlap | Verify current or explicitly retained previous key version; audit use; expire old key |

## Observability and tests

Metrics include accepted/rejected deliveries, signature reason codes, ingest latency, oldest unprocessed age, attempts, dead letters, reconciliation gaps, outbox age, and effect latency. Logs use request/correlation IDs and exclude bodies, credentials, email, phone, signatures, coupon plaintext, and access tokens.

Mandatory tests cover invalid/old signatures, body tampering, replay, key rotation, duplicate IDs, same key/different payload, delayed/out-of-order events, worker crash after external success, poison isolation, reconciliation repair, and hub/plugin/database outages.
