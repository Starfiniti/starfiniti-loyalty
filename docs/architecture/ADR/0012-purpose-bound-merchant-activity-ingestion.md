# ADR-0012: Reuse canonical commerce evidence for purpose-bound merchant activities

- Status: Accepted
- Date: 2026-08-13

## Context

ProgrammeDefinitionV2 supports birthdays, account creation, verified product reviews, and custom activities. WooCommerce can authoritatively emit account and verified-review facts, but a merchant CRM or backend also needs a connector-neutral path. Browser assertions, Auth metadata, email matching, or a generic unauthenticated event endpoint would let a customer manufacture value.

Current Supabase guidance recommends private-schema security-definer functions with an empty search path and explicit execution grants. PostgreSQL row locks/advisory locks remain the final concurrency boundary. WooCommerce's official webhook contract also confirms the established model of signing the exact raw payload with HMAC-SHA256. Documentation reviewed on 2026-08-13: https://supabase.com/docs/guides/database/functions, https://supabase.com/docs/guides/database/postgres/row-level-security, https://www.postgresql.org/docs/current/explicit-locking.html, and https://developer.woocommerce.com/docs/apis/rest-api/v2/webhooks.

## Alternatives

1. Add a separate activity inbox, worker, and ledger command. This isolates terminology but duplicates replay, lease, retry, operations, and immutable-evidence code, increasing drift risk.
2. Reuse the canonical delivery/effect pipeline with a distinct `merchant_activity` source and `commerce.activity.recorded` event. Purpose-bound signing and strict payloads preserve independent credentials while sharing proven idempotency and operations.
3. Accept activities from authenticated browsers and rate-limit them. This is simpler but makes an untrusted client value authority and is rejected.

## Decision

Use option 2. A live owner/admin may provision one programme-bound Merchant Activity source per workspace from the trusted Next.js runtime. PostgreSQL requires a published V2 programme, consumes one unique deployment signing reference, writes secret-free immutable audit evidence, and returns a one-time package. Browser roles cannot provision sources, read signing references, inspect raw deliveries, or write events.

`POST /api/v1/activities/events` streams at most 64 KiB before database or signing-material access. The HMAC message has its own `starfiniti-merchant-activity-delivery-v1` purpose and covers request target, source UUID, delivery ID, timestamp, nonce, key version, and raw-body SHA-256. The strict envelope accepts one public customer UUID plus allowlisted source/code and optional review product/category selectors; unknown fields and PII fail closed.

The existing delivery inbox and canonical queue retain immutable replay evidence. The worker resolves the public customer only inside the source tenant, derives the programme from the source, uses the shared V2 evaluator and serialized cap boundary, and atomically appends evaluation, rule usage, and ledger evidence. WooCommerce activity facts retain their separate connector credential and channel identity.

## Security and integrity effects

- A signing key for WooCommerce cannot authenticate a Merchant Activity delivery because the purpose, source header, and endpoint differ.
- A public customer UUID is a selector, not tenant authority; another tenant's customer resolves to no row.
- `deliveryId`, nonce, and source event uniqueness reject replay or changed reuse.
- Birthday and custom activity can be delivered only by a provisioned trusted server; browsers never receive the source key.
- Raw activity evidence stays private and operational views expose only bounded queue health.

## Operations

Readiness verifies the runtime can accept deliveries and provision both WooCommerce and Merchant Activity sources, and that at least one valid signing-pool key exists. Tenant operations shows source status, last verified activity, and bounded ready/failed counts. Operators rotate or disable a compromised source before reviewing its canonical facts; they never copy raw bodies or key references into support records.

## Migration and rollback

Deploy source tables/constraints, runtime grants, endpoint, worker reader, and UI disabled with `programme.v2`. Provision only the Starfiniti canary after exact-head database and route tests pass. Rollback disables the source and stops new activity acceptance; it does not delete accepted evidence, reverse awarded value, or reinterpret V1/V2 history. Forward-fix any accepted ambiguous delivery through the immutable reconciliation path.
