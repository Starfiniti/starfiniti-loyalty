# Merchant Data API

## Boundary

Authenticated merchant reads and programme commands use the exposed `loyalty` schema through Supabase PostgREST with the user's access token and publishable key. The browser and Next.js server actions never receive a Supabase secret/service-role key or a PostgreSQL credential.

Tenant and actor authority are not command inputs. Each command derives the Auth subject from PostgreSQL request claims and rechecks a live, unrevoked `organization_memberships` row. Only `owner` and `admin` may alter programme value policy; `operator`, `analyst`, `auditor`, revoked members, anonymous callers, and owners of another tenant fail closed.

## Read models

The programme page reads these RLS-protected relations:

- `programmes` and `programme_versions` for the selected live programme and immutable version history;
- `admin_audit_events` for tenant owners, admins, and auditors;
- tenancy relations described in `DATA_MODEL.md` for organization/workspace/programme scope.

RLS remains authoritative even when the Next.js application already resolved a tenant context.

### Customer operations reads

`/customers` accepts a control-character-free display-reference query bounded to 100 characters; PostgREST wildcard characters are escaped. Results are capped at the newest 50 rows and explicitly filter the resolved organization in addition to RLS. Email is neither queried nor treated as an identity/merge key. Channel customer IDs are masked before leaving server-only code.

`/customers/{public_id}` accepts only a structured UUID and repeats the organization/programme-group filters. It joins wallet accounts to the six authoritative balance projections and returns at most the latest 100 wallet-side ledger entries. Entries expose kind, affected bucket, signed points, effective time, programme version, a bounded source reference, and a shortened correlation reference. Raw commerce payloads, ledger metadata, contact attributes, and unrelated channel identities are not returned.

### Connector operations reads

`get_connector_operation_summaries(target_organization_public_id)` returns one row per authorized WooCommerce connection with connection status, last verified delivery time, and independent ready/failed counts for delivery normalization, loyalty effects, and outbound commands. The organization ID is a selector only: live database membership remains authoritative and another tenant returns no rows.

`get_connector_operation_issues(target_connection_public_id, target_limit)` accepts a limit from 1 to 100 and returns only operation class, public operation ID, state, bounded error code, attempt count, event/topic kind, observation time, and whether replay is permitted. It does not return raw bodies, canonical payloads, source event/object IDs, signing references, coupon codes, or customer attributes.

## Programme commands

All commands are `SECURITY DEFINER`, owned by the `NOLOGIN` `loyalty_owner` role, use an empty search path, schema-qualify every object, revoke default `PUBLIC` execution, and expose `EXECUTE` only to `authenticated`.

### `create_programme_draft_command`

Inputs:

- `target_programme_public_id uuid`
- `target_configuration jsonb` matching `merchantCreateProgrammeDraftCommandV1`
- `target_idempotency_key text`
- `target_correlation_id uuid`

The database bounds the configuration at 256 KiB, canonicalizes PostgreSQL `jsonb`, computes SHA-256 itself, allocates the next version under the programme lock, records the request-derived creator, and appends an immutable `programme.draft.create` audit event.

Result: `resource_public_id`, `outcome` (`created` or `duplicate`), `configuration_sha256`, and `version_number`.

### `publish_programme_version_command`

Inputs:

- `target_version_public_id uuid`
- `target_expected_configuration_sha256 text`
- `target_idempotency_key text`
- `target_correlation_id uuid`

Publication locks the programme, requires the exact reviewed database fingerprint, materializes tiers/rewards transactionally, supersedes the prior published version, and appends `programme.version.publish` audit evidence. Historical programme and ledger attribution is not rewritten.

Result: `resource_public_id`, `outcome`, and `published_at`.

### `schedule_programme_version_command`

Adds `target_scheduled_for timestamptz` to the publication inputs. The timestamp must be in the future. The exact draft is materialized and marked scheduled, and `programme.version.schedule` audit evidence is appended. Worker activation remains idempotent.

Result: `resource_public_id`, `outcome`, and `scheduled_for`.

### `retry_connector_effect_command`

Inputs:

- `target_event_public_id uuid`
- `target_reason text` trimmed, single-line, 8 to 500 characters
- `target_idempotency_key text`
- `target_correlation_id uuid`

Only a live `owner`, `admin`, or `operator` may replay an effect, and only from `dead_letter` to `retryable`. The command clears the prior lease/error, makes work immediately available, preserves monotonic attempt history, and appends `connector.effect.retry` audit evidence in the same transaction. Analysts, auditors, revoked members, other tenants, quarantined items, pending work, and completed work fail closed.

The command deliberately cannot retry `transactional_outbox` coupon issue/cancel dead letters. A coupon-issue dead letter may already have failed the reservation and released points through compensation; replaying it generically could create native value after that release. Those rows are inspect-only until a reservation-aware recovery workflow can prove a safe state transition.

### Customer adjustment reads and command

`get_customer_adjustment_context(target_customer_public_id, target_programme_group_public_id)` returns the authoritative available balance as text, preserving PostgreSQL `bigint` precision in JavaScript. Only a live owner/admin receives a row. The browser uses it solely for exact signed-integer preview; the command rechecks all state.

`adjust_customer_points_command` accepts customer, programme-group, and exact published programme-version public IDs; signed whole points; a required single-line reason; optional internal note; optional expiry; idempotency key; and correlation ID. It never accepts organization or actor authority. Credits require a future expiry and create an attributed lot. Debits prohibit expiry, allocate existing lots FIFO where available, and may produce the explicitly warned negative available balance without rewriting prior awards.

The command is restricted to live owners/admins, locks the active wallet, validates the published version belongs to the wallet's tenant/group, computes the request hash in PostgreSQL, and invokes the existing ledger primitive. The transaction and entries are immutable and zero-sum. The same database transaction appends `customer.points.adjust` audit evidence containing the request-derived actor, reason/note, signed point string, programme attribution, command correlation, and the immutable ledger correlation reference. Exact retries return `duplicate`; changed reuse conflicts.

## Retry and error contract

Idempotency is scoped by organization. Retrying the same key and canonical request returns the original resource with `outcome = duplicate` and creates neither another version nor another audit event. Reusing a key with different input raises SQLSTATE `23514`. Authorization failures use `42501`; invalid/stale configuration or lifecycle inputs use `22023`/`23514`.

The UI presents generic safe messages and never treats a network or database error as success. A fresh operation ID is generated for an intentional new draft, publication, or schedule.

## Verification

`merchant_programme_commands_test.sql` exercises exact privileges/search paths, tenant/role/revocation denial, canonical hashing, retries and conflicts, stale publication hashes, future schedules, materialization, immutable version history, and immutable attributable audit evidence. `connector_operations_test.sql` adds private-queue minimization, cross-tenant/role/revocation denial, retry state, quarantine rejection, idempotency conflict, audit immutability, and outbound-command non-mutation. `customer_adjustment_commands_test.sql` proves owner/admin-only entry, exact bigint balance, credit/debit ledger effects, expiry/lot attribution, FIFO allocation, retries/conflicts, actor/audit linkage, immutability, and projection rebuilds. Contract unit tests reject caller-expanded authority and malformed reasons. Browser QA covers responsive structured editing and deliberate adjustment review/confirmation. Customer and connector helper tests cover bounded inputs, exact bigint preview, masking, balances, role authority, labels, and health states.
