# ADR-0045: Hashed service accounts and database-authoritative inbound APIs

- Status: Accepted
- Date: 2026-08-26
- Scope: M11-S04 service-account credentials and inbound customer/activity APIs

## Context

The signed Merchant Activity API already accepts purpose-bound authoritative activity facts through a deployment-managed HMAC key. It deliberately has no general customer namespace, merchant-controlled credential lifecycle, granular scope, or per-tenant quota. M11 requires supported server-to-server customer and activity APIs without distributing a Supabase secret, PostgreSQL login, WooCommerce key, or browser credential and without creating a second path that can mint loyalty value.

[RFC 6750](https://www.rfc-editor.org/rfc/rfc6750) requires bearer credentials to be protected in transport and storage. [Node.js cryptography guidance](https://nodejs.org/api/crypto.html) supplies a cryptographically secure random source and SHA-256 primitives. [Supabase function security guidance](https://supabase.com/docs/guides/database/functions) recommends `security definer` only where required, a controlled search path, and exact execution grants. [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security) and [PostgreSQL row-security documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) make database policy and grants the final tenant boundary. The current IETF [RateLimit header draft](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-ratelimit-headers) is useful for client hints but remains a draft, so HTTP header syntax cannot be the quota authority.

## Alternatives

1. **Extend the deployment-managed Merchant Activity HMAC source.** This preserves the existing signature boundary but cannot give each merchant an independently scoped, self-rotated customer namespace or database-authoritative quota without turning one purpose-specific connector into a general credential system.
2. **Require OAuth client credentials or signed JWTs from an external issuer.** This provides federation and standardized expiry, but adds an identity-provider dependency to self-hosted ingestion, complicates revocation and key rotation, and still requires PostgreSQL to resolve live tenant authority.
3. **Issue high-entropy opaque bearer credentials whose digest and lifecycle are stored privately, then authorize and meter every request inside PostgreSQL.** This keeps self-hosted operation local, makes revocation immediate, and prevents a browser or API caller from choosing tenant or value authority.

## Decision

1. Service accounts belong to one organization, active workspace, published V2 programme, and private `service_api` commerce connection. A live owner/admin with the database-authoritative `ecosystem.api` entitlement creates them. Callers never submit organization, workspace, programme, connection, actor, customer, wallet, rule, tier, points, or reward authority to an inbound endpoint.
2. Version 1 credentials use `sflt_v1_<credential-selector>_<secret>`. The selector is a public UUID encoded without hyphens; the secret is 256 random bits encoded as unpadded base64url. The complete token is shown once over the authenticated management action and must be used only over HTTPS. It is prohibited from browser code, URLs, logs, audit metadata, support bundles, and database rows.
3. PostgreSQL stores only the public credential selector, SHA-256 digest of the complete high-entropy token, six-character display hint, lifecycle timestamps, and creator. A fast digest is appropriate for an unguessable 256-bit machine secret; it is not a password-hashing precedent for human credentials.
4. Rotation creates a new credential and may move current credentials to a bounded `retiring` overlap of 0–86,400 seconds. Immediate revocation is audited and fails on the next request. A repeated issuance command never replays secret material; it returns the prior public result and requires a new rotation if the one-time response was lost.
5. Allowed scopes are exactly `customers:write` and `activities:write`. PostgreSQL resolves the credential digest with constant-time byte comparison, locks the credential/account, rechecks account and connection state, published programme compatibility, entitlement, requested scope, and a fixed one-minute quota before exposing any derived authority to a composite command.
6. Quota counters are database-authoritative and serialize concurrent consumers. Successful and idempotent duplicate requests consume quota; a failed transaction rolls its increment back. HTTP `RateLimit-Policy`, `RateLimit`, and `Retry-After` are minimized client hints and may evolve if the draft standard changes without changing stored quota semantics.
7. `POST /api/v1/service/customers` binds an external customer reference to a new Starfiniti customer inside that one service-account namespace. The raw reference is never stored. PostgreSQL computes HMAC-SHA256 with one private random per-account pepper, serializes creation, and records an immutable idempotency receipt. Email, profile, domain, address, or another connector identity is never a merge key.
8. `POST /api/v1/service/activities` requires that prior customer binding, accepts only the strict V1 authoritative activity contract, and appends a minimized fact through the existing commerce inbox and normalization functions. It returns `202 Accepted`; the existing worker, immutable ProgrammeDefinitionV2 evaluation, caps, effect receipts, and ledger transaction remain the only value path.
9. Exact retries return the original customer or canonical event. Reusing an idempotency/event identity with changed content fails closed. Credential, customer, and activity races are covered by database constraints, row locks, pgTAP, and two-session probes.
10. Direct browser grants are absent for private credential, pepper, identity, receipt, and quota tables. Management reads expose at most 100 accounts and 100 credential descriptors per account through live owner/admin membership, with no digest or reusable secret. Runtime functions are `security definer`, use an empty search path, have exact grants, and return minimized public selectors/outcomes.
11. The legacy signed Merchant Activity endpoint remains supported. Service API unavailability, entitlement changes, credential revocation, or quota exhaustion cannot affect WooCommerce checkout, balances, accepted events, refunds, releases, reconciliation, or customer access.

## Consequences

- Merchants can rotate and revoke independently scoped integrations without receiving a platform-wide secret.
- A lost one-time token cannot be recovered; a new credential must be issued.
- External customer references are stable only within one service-account namespace. Deliberate cross-channel linking continues to require the verified customer-link workflow or a traceable migration.
- Database quota rows grow by active credential-minute windows and require bounded retention as an operational maintenance task; deleting quota windows never changes request receipts or loyalty history.
- Organization offboarding must revoke credentials and handle protected immutable identity/receipt history through the M13 privacy/offboarding workflow rather than relying on an unreviewed cascade.

## Operations and rollback

Deploy the additive schema and routes with `ecosystem.api` disabled. Create one Starfiniti pilot account, issue a credential, synchronize a synthetic customer, accept and process one activity, replay both commands, rotate with overlap, revoke both credentials, and reconcile the customer mapping, commerce inbox, canonical event, evaluation, effect receipt, ledger transaction, balances, audit, and quota window.

Rollback disables new issuance and the two inbound routes, then revokes pilot credentials. Existing service accounts, immutable mappings, receipts, canonical events, evaluations, and ledger effects remain attributable. The legacy Merchant Activity endpoint and WooCommerce connector continue unchanged. Forward fixes restore compatible readers and routes; history is never rewritten.
