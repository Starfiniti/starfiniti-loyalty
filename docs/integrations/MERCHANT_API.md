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

`experience_themes` exposes at most one member-readable row for the selected linked workspace and programme group. It contains revisioned public-facing design tokens only. Executable CSS, markup, scripts, URLs, uploads, customer data, and secret material are not columns.

### Customer operations reads

`list_customer_summaries(target_organization_public_id, target_programme_group_public_id, target_search)` accepts a control-character-free literal display-reference query bounded to 100 characters. It rechecks live membership, caps results at the newest 50 rows, casts wallet `bigint` values to text, and masks channel customer IDs before they leave PostgreSQL. Email is neither queried nor treated as an identity/merge key.

`get_customer_read_model(target_customer_public_id, target_programme_group_public_id)` accepts only structured UUID selectors and derives the organization through the customer plus live membership. It joins wallet accounts to the six authoritative balance projections and returns at most the latest 100 wallet-side ledger entries. Balances and signed entry points are text-form exact integers. Entries expose kind, affected bucket, effective time, programme version, a bounded source reference, and correlation reference. Raw commerce payloads, ledger metadata/reasons/request hashes, actor IDs, contact attributes, and unrelated channel identities are not returned.

The customer page may filter that already-bounded array into order/refund, reward, release/expiry, or adjustment views. The URL value is allowlisted and unknown or repeated-array input resolves to `all`; it never becomes a database selector or expands the response.

`get_customer_tier_read_model(target_customer_public_id, target_programme_group_public_id)` derives the active tenant/group through the customer plus live membership and returns one bounded row. The row contains the current effective and qualified tier code/name, transition, rolling eligible spend as exact text-form minor units, and effective/below-threshold/grace timestamps. An authorized unevaluated wallet returns null tier fields instead of an invented default. Immutable decision explanations, request hashes, idempotency keys, actors, and unrelated history remain private.

### Connector operations reads

`get_connector_operation_summaries(target_organization_public_id)` returns one row per authorized WooCommerce connection with connection status, last verified delivery time, and independent ready/failed counts for delivery normalization, loyalty effects, and outbound commands. The organization ID is a selector only: live database membership remains authoritative and another tenant returns no rows.

`get_connector_operation_issues(target_connection_public_id, target_limit)` accepts a limit from 1 to 100 and returns only operation class, public operation ID, state, bounded error code, attempt count, event/topic kind, observation time, and whether replay is permitted. It does not return raw bodies, canonical payloads, source event/object IDs, signing references, coupon codes, or customer attributes.

The dashboard's versioned support-diagnostics bundle further minimizes these authorized rows before download: it removes individual operation IDs and connection display names, labels the returned and maximum counts for the bounded recent-issue sample, groups only canonical error/operation codes, normalizes queue counters, and includes an explicit omission manifest. The bundle is generated locally from the already-authorized operations view and creates no separate public or service-role API.

### Overview reporting read

`get_overview_report(target_organization_public_id, target_workspace_public_id, target_programme_group_public_id, target_days, target_as_of)` accepts only 7, 30, or 90 aligned UTC days. Organization/workspace/programme-group IDs are selectors; the wrapper rechecks live membership and the active workspace/group assignment. Unknown, revoked, cross-tenant, suspended, or mismatched scope returns no row. `target_as_of` exists for deterministic verification; the dashboard omits it and uses database time.

The versioned result returns exact integers as text: scoped wallet/member totals and new-member counts; current/previous eligible spend from immutable live programme-evaluation results; repeat-member basis points; captured-to-awarded point basis points; pending/available/reserved point liability; and one bounded current/previous daily new-member point per report day. Published programme configuration supplies currency and minor-unit metadata. The browser formats with `BigInt`, avoiding IEEE-754 precision loss.

The wrapper does not return customer or channel identifiers, raw commerce payloads, evaluation inputs/explanations, source IDs, ledger entries/metadata, actor IDs, reasons, or signing material. Eligible spend is labelled as loyalty-eligible spend rather than gross store revenue. Liability is reported in points because a universal accounting valuation policy is not yet approved; no invented cash conversion is shown.

## Programme commands

All commands are `SECURITY DEFINER`, owned by the `NOLOGIN` `loyalty_owner` role, use an empty search path, schema-qualify every object, revoke default `PUBLIC` execution, and expose `EXECUTE` only to `authenticated`.

### `create_programme_command`

Inputs:

- `target_programme_group_public_id uuid`
- `target_slug text` matching the lowercase hyphenated programme-slug contract
- `target_name text` trimmed, control-character-free, and at most 200 characters
- `target_idempotency_key text`
- `target_correlation_id uuid`

The database locks one active programme group, derives its organization and the actor from live Auth state, and allows only an unrevoked owner/admin. It inserts the active programme without granting browser table DML and appends `programme.create` audit evidence in the same transaction. The command accepts no organization or actor ID, returns no internal numeric key, and exact retries return the original public programme ID.

Result: `resource_public_id` and `outcome` (`created` or `duplicate`). The merchant UI exposes this command only when the selected group has no visible active/draft programme; public organization/group provisioning remains disabled.

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

### `request_connector_reconciliation_command`

Inputs:

- `target_connection_public_id uuid`
- `target_order_id text` containing one canonical positive WooCommerce integer ID
- `target_reason text` trimmed, single-line, 8 to 500 characters
- `target_idempotency_key text`
- `target_correlation_id uuid`

A live `owner`, `admin`, or `operator` can request source reconciliation only for an active or rotating connection in their organization. PostgreSQL locks that connection, hashes the canonical request, appends a `connector.order.reconcile` audit event, and creates one private `woocommerce.order.reconcile` transactional-outbox command in the same transaction. The public contract accepts neither organization nor actor authority and exposes no signing material or commerce payload.

The signed connector polling route delivers `{ "kind": "reconcile_order", "orderId": "…" }`. The plugin re-reads that local WooCommerce order and writes stable order, refund, and Starfiniti coupon-capture facts to its existing durable outbox. Existing source-revision keys make a repeated command safe. A missing order is acknowledged as a terminal `order_not_found` dead letter; transient execution failures use bounded retry.

Result: `resource_public_id`, `outcome` (`created` or `duplicate`), and the current durable command state.

### Customer adjustment reads and command

`get_customer_adjustment_context(target_customer_public_id, target_programme_group_public_id)` returns the authoritative available balance as text, preserving PostgreSQL `bigint` precision in JavaScript. Only a live owner/admin receives a row. The browser uses it solely for exact signed-integer preview; the command rechecks all state.

`adjust_customer_points_command` accepts customer, programme-group, and exact published programme-version public IDs; signed whole points; a required single-line reason; optional internal note; optional expiry; idempotency key; and correlation ID. It never accepts organization or actor authority. Credits require a future expiry and create an attributed lot. Debits prohibit expiry, allocate existing lots FIFO where available, and may produce the explicitly warned negative available balance without rewriting prior awards.

The command is restricted to live owners/admins, locks the active wallet, validates the published version belongs to the wallet's tenant/group, computes the request hash in PostgreSQL, and invokes the existing ledger primitive. The transaction and entries are immutable and zero-sum. The same database transaction appends `customer.points.adjust` audit evidence containing the request-derived actor, reason/note, signed point string, programme attribution, command correlation, and the immutable ledger correlation reference. Exact retries return `duplicate`; changed reuse conflicts.

### Bulk customer adjustments

`preview_bulk_customer_adjustment` accepts 2–50 unique customer public IDs, exact programme group/version public IDs, one non-zero signed whole-point amount per customer, a required single-line reason, and the credit expiry (or null for a debit). It is an owner/admin-only read: PostgreSQL resolves every active wallet in one tenant/group, returns exact text-form before/projected balances in canonical customer order, and fingerprints the complete request and current balance set. It writes nothing.

`execute_bulk_customer_adjustment` accepts the same canonical request plus the expected preview SHA-256, an idempotency key, and a correlation ID. It accepts neither actor nor organization authority. Exact retries are resolved from immutable batch evidence before current balances are inspected, so a network retry remains safe after the original batch changed those balances. A new execution locks all selected balance rows in deterministic order, rebuilds the preview, rejects a stale fingerprint, and then atomically creates:

- one reason-bound, zero-sum `manual_adjustment` ledger transaction per customer;
- one expiry lot per credited customer, or FIFO lot allocations for debits;
- one immutable batch row and one immutable batch-item link per ledger effect; and
- one aggregate `customer.points.bulk_adjust` administration audit event.

The operation is capped at 50 customers and uses one uniform amount to keep approval legible. Any invalid, missing, suspended, overflowed, cross-tenant, or concurrently changed wallet aborts the whole transaction; partial batches do not commit. Browser rendering of the preview is informative only—the expected database fingerprint is the execution authority.

### `save_experience_theme_command`

Inputs are workspace and programme-group public IDs; one lowercase `#rrggbb` brand color that provides at least 4.5:1 contrast with white text; an allowlisted local display-font token; an 8, 14, or 22 pixel card radius; trimmed, control-character-free headline and points copy; tier/reward visibility booleans; left/right widget position; idempotency key; and correlation ID.

PostgreSQL locks the active workspace/programme-group link, derives the organization and Auth actor, and permits only a live owner/admin. It creates or revisions the single scoped theme and appends `experience.theme.save` audit evidence atomically. The audit stores public scope and revision plus the request hash, not executable content. Exact retries return the original resource and recorded revision; changed key reuse conflicts.

The contract accepts no organization or actor authority and no CSS, HTML, JavaScript, asset upload, or URL. Font tokens resolve to local system stacks, so the preview makes no third-party font request. Result fields are `resource_public_id`, `outcome` (`created`, `updated`, or `duplicate`), and positive `revision`.

### `save_experience_translation_command`

Customer copy is stored independently from visual theme tokens in `experience_translations`, keyed by the linked tenant workspace/programme group and an allowlisted launch locale (`en` or `sl-SI`). Each locale has bounded single-line hero, points, balance, rewards, redeem, join, and earning-message fields. Unsupported locale strings, control characters, HTML/script expansion, caller-supplied tenant/actor authority, and direct browser table DML are rejected.

The command derives live owner/admin authority, locks the exact workspace/programme-group link, hashes the complete canonical copy request, and creates or revisions only the selected locale. Its immutable `experience.translation.save` audit event records public scope, locale, and revision but deliberately omits the translated copy. Exact retries return the original revision; changed reuse conflicts. Authenticated members may read only their tenant's locale rows through RLS. The experience editor previews the selected locale immediately and retains prior English theme copy as an unsaved fallback until explicit English translation data exists.

### `get_public_loyalty_experience`

The hosted guest route calls this stable anonymous projection with a public workspace UUID, public programme UUID, and allowlisted locale (`en` or `sl-SI`). PostgreSQL returns a document only when the organization, workspace, programme group, and programme are active, the workspace/group link is exact, and one current programme version is published. Mixed-tenant, unknown, suspended, unpublished, and unsupported-locale requests return no row.

The response is capped at 12 tiers and 20 rewards. It contains public programme/group/workspace IDs, programme name, resolved locale, bounded theme tokens and copy, tier names/thresholds/rates, and reward names/kinds/costs. All bigint values are text. It deliberately omits organization identity, customer/wallet/ledger state, raw programme JSON and hashes, reward configuration, actors, audit records, connector state, signing data, and commerce evidence. Anonymous callers retain no underlying table grants, and reads create no mutable or audit effect.

## Retry and error contract

Idempotency is scoped by organization. Retrying the same key and canonical request returns the original resource with `outcome = duplicate` and creates neither another version nor another audit event. Reusing a key with different input raises SQLSTATE `23514`. Authorization failures use `42501`; invalid/stale configuration or lifecycle inputs use `22023`/`23514`.

The UI presents generic safe messages and never treats a network or database error as success. A fresh operation ID is generated for an intentional new draft, publication, or schedule.

## Verification

`initial_programme_onboarding_test.sql` exercises exact privileges/search paths, direct-DML denial, canonical inputs, owner/admin authorization, tenant/group derivation, retries/conflicts, duplicate slugs, suspended groups, role revocation, cross-tenant denial, RLS-filtered audit reads, and immutable actor/correlation evidence. `merchant_programme_commands_test.sql` covers canonical drafting, publication, and scheduling. `customer_read_models_test.sql` proves exact values beyond JavaScript's safe range, database-side masking, literal bounded search, result ceilings, minimized ledger fields, empty wallet scope, group mismatch, revocation, and cross-tenant isolation. `customer_tier_read_model_test.sql` adds current/qualified/grace semantics, exact large eligible-spend values, honest unevaluated state, result minimization, suspended-group, revoked-role, and cross-tenant denial. `connector_operations_test.sql` adds private-queue minimization, cross-tenant/role/revocation denial, retry state, quarantine rejection, idempotency conflict, audit immutability, and outbound-command non-mutation. `connector_reconciliation_commands_test.sql` proves durable source-command creation/claim/acknowledgement, current-state retries, tenant and role denial, disabled-connection rejection, bounded inputs, and immutable actor/reason evidence. `merchant_overview_reporting_test.sql` proves exact aggregate definitions, equal periods, UTC buckets, workspace/programme scope, bigint preservation, private-source denial, live role/revocation behavior, and empty-tenant isolation. `customer_adjustment_commands_test.sql` proves owner/admin-only entry, exact bigint balance, credit/debit ledger effects, expiry/lot attribution, FIFO allocation, retries/conflicts, actor/audit linkage, immutability, and projection rebuilds. `bulk_customer_adjustments_test.sql` adds dry-run non-mutation, canonical order/arithmetic, exact retry after balance changes, stale-preview rejection, atomic per-customer ledger/lot/batch/audit effects, role/revocation/tenant denial, evidence immutability, and projection rebuilds. `experience_themes_test.sql` proves direct-DML denial, composite linked scope, member-read RLS, owner/admin revisions, role/revocation/cross-tenant denial, contrast and token validation, exact retries/conflicts, and immutable audit linkage. Contract unit tests reject caller-expanded authority, unsafe theme inputs, malformed reasons, inconsistent bulk arithmetic, and duplicate preview items. Browser QA covers responsive structured editing and deliberate adjustment review/confirmation. Customer, Overview, connector, and theme helper tests cover bounded inputs, exact bigint formatting/preview, masking, balances, role authority, labels, health states, and local font stacks.
