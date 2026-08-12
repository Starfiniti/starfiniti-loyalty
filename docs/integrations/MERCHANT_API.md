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

## Retry and error contract

Idempotency is scoped by organization. Retrying the same key and canonical request returns the original resource with `outcome = duplicate` and creates neither another version nor another audit event. Reusing a key with different input raises SQLSTATE `23514`. Authorization failures use `42501`; invalid/stale configuration or lifecycle inputs use `22023`/`23514`.

The UI presents generic safe messages and never treats a network or database error as success. A fresh operation ID is generated for an intentional new draft, publication, or schedule.

## Verification

`merchant_programme_commands_test.sql` exercises exact privileges/search paths, tenant/role/revocation denial, canonical hashing, retries and conflicts, stale publication hashes, future schedules, materialization, immutable version history, and immutable attributable audit evidence. Contract unit tests reject caller-supplied actor authority. Browser QA covers responsive structured editing, add/remove controls, and deterministic Rose/Bloom/Icon preview behavior. Customer helper tests cover bounded search, wildcard escaping, UUID rejection, masking, negative balances, and complete bucket projection.
