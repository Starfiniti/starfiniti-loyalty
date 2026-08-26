begin;

create extension if not exists pgtap with schema extensions;

select plan(50);

select has_table(
  'loyalty', 'migration_dry_runs',
  'migration dry-run receipts retain immutable minimized evidence'
);
select results_eq(
  $$ select relrowsecurity from pg_class where oid = 'loyalty.migration_dry_runs'::regclass $$,
  array[true],
  'migration dry-run receipts have RLS enabled'
);
select has_trigger(
  'loyalty', 'migration_dry_runs', 'migration_dry_runs_immutable',
  'migration dry-run receipts cannot be rewritten'
);
select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.record_migration_dry_run_v1(uuid,uuid,text,text,text,text,text,text,integer,integer,integer,integer,bigint,bigint,jsonb,text,uuid)',
    'EXECUTE'
  ),
  'authenticated sessions can enter the guarded dry-run boundary'
);
select ok(
  not has_function_privilege(
    'anon',
    'loyalty.record_migration_dry_run_v1(uuid,uuid,text,text,text,text,text,text,integer,integer,integer,integer,bigint,bigint,jsonb,text,uuid)',
    'EXECUTE'
  ),
  'anonymous callers cannot record migration dry runs'
);
select ok(
  not has_table_privilege('authenticated', 'loyalty.migration_dry_runs', 'INSERT'),
  'browser sessions cannot forge receipt rows'
);
select ok(
  not has_table_privilege('loyalty_runtime', 'loyalty.migration_dry_runs', 'SELECT'),
  'runtime has no direct migration receipt read'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'loyalty'
      and routine.proname = 'record_migration_dry_run_v1'
      and routine.prosecdef
  $$,
  array[1::bigint],
  'migration dry-run boundary is security definer'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'loyalty'
      and routine.proname = 'record_migration_dry_run_v1'
      and exists (
        select 1 from unnest(routine.proconfig) as setting
        where setting = 'search_path=""'
      )
  $$,
  array[1::bigint],
  'migration dry-run boundary pins an empty search path'
);
select is_empty(
  $$
    select parameter_name
    from information_schema.parameters
    where specific_schema = 'loyalty'
      and specific_name like 'record_migration_dry_run_v1_%'
      and parameter_name in (
        'organization_id', 'actor_user_id', 'customer_id', 'wallet_id'
      )
  $$,
  'the browser command accepts no tenant actor customer or wallet authority'
);

insert into auth.users (id, email)
values
  ('81000000-0000-4000-8000-000000000001', 'migration-owner@example.test'),
  ('81000000-0000-4000-8000-000000000002', 'migration-admin@example.test'),
  ('81000000-0000-4000-8000-000000000003', 'migration-operator@example.test'),
  ('81000000-0000-4000-8000-000000000004', 'migration-auditor@example.test'),
  ('81000000-0000-4000-8000-000000000005', 'migration-revoked@example.test'),
  ('82000000-0000-4000-8000-000000000001', 'migration-other-owner@example.test');

insert into loyalty.organizations (public_id, slug, name)
values
  ('81000000-0000-4000-8000-000000000100', 'migration-one', 'Migration One'),
  ('82000000-0000-4000-8000-000000000100', 'migration-two', 'Migration Two');

insert into loyalty.organization_memberships (
  organization_id, user_id, role, revoked_at
)
values
  ((select id from loyalty.organizations where slug = 'migration-one'), '81000000-0000-4000-8000-000000000001', 'owner', null),
  ((select id from loyalty.organizations where slug = 'migration-one'), '81000000-0000-4000-8000-000000000002', 'admin', null),
  ((select id from loyalty.organizations where slug = 'migration-one'), '81000000-0000-4000-8000-000000000003', 'operator', null),
  ((select id from loyalty.organizations where slug = 'migration-one'), '81000000-0000-4000-8000-000000000004', 'auditor', null),
  ((select id from loyalty.organizations where slug = 'migration-one'), '81000000-0000-4000-8000-000000000005', 'admin', now()),
  ((select id from loyalty.organizations where slug = 'migration-two'), '82000000-0000-4000-8000-000000000001', 'owner', null);

insert into loyalty.programme_groups (
  public_id, organization_id, slug, name, status
)
select
  case organization.slug
    when 'migration-one' then '81000000-0000-4000-8000-000000000110'::uuid
    else '82000000-0000-4000-8000-000000000110'::uuid
  end,
  organization.id, 'rewards', organization.name || ' Rewards', 'active'
from loyalty.organizations as organization
where organization.slug in ('migration-one', 'migration-two');

insert into loyalty.programmes (
  public_id, organization_id, programme_group_id, slug, name, status
)
select
  case organization.slug
    when 'migration-one' then '81000000-0000-4000-8000-000000000120'::uuid
    else '82000000-0000-4000-8000-000000000120'::uuid
  end,
  organization.id, programme_group.id, 'rewards',
  organization.name || ' Rewards', 'active'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
where organization.slug in ('migration-one', 'migration-two');

insert into loyalty.programme_versions (
  public_id, organization_id, programme_group_id, programme_id,
  version_number, status, configuration, configuration_sha256,
  approved_by_user_id, published_at
)
select
  case organization.slug
    when 'migration-one' then '81000000-0000-4000-8000-000000000130'::uuid
    else '82000000-0000-4000-8000-000000000130'::uuid
  end,
  organization.id, programme_group.id, programme.id, 1, 'published',
  '{"version":"1","tiers":[],"rewards":[]}'::jsonb,
  extensions.digest(convert_to('{}', 'UTF8'), 'sha256'),
  case organization.slug
    when 'migration-one' then '81000000-0000-4000-8000-000000000001'::uuid
    else '82000000-0000-4000-8000-000000000001'::uuid
  end,
  now() - interval '1 day'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
join loyalty.programmes as programme
  on programme.organization_id = organization.id
where organization.slug in ('migration-one', 'migration-two');

insert into loyalty.organization_entitlements (
  organization_id, catalogue_version, capability_key, state, source,
  actor_reference, reason, effective_from
)
values (
  (select id from loyalty.organizations where slug = 'migration-two'),
  1, 'migration', 'disabled', 'local_control', 'pgTAP:M12-S01',
  'Prove the migration dry-run gate fails closed when disabled',
  now() - interval '1 hour'
);

create temporary table saved_migration_results (
  name text primary key,
  dry_run_public_id uuid not null,
  outcome text not null,
  status text not null,
  approval_sha256 text not null
);
grant select, insert on saved_migration_results to authenticated;

set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-4000-8000-000000000001';

insert into saved_migration_results
select 'valid', result.*
from loyalty.record_migration_dry_run_v1(
  '81000000-0000-4000-8000-000000000110',
  '81000000-0000-4000-8000-000000000130',
  'valid', 'wployalty', repeat('a', 64), repeat('b', 64),
  repeat('c', 64), repeat('d', 64),
  2, 1, 1, 0, 350, 0, '{}'::jsonb,
  'migration:dry-run:valid',
  '81000000-0000-4000-8000-000000000201'
) as result;

select results_eq(
  $$ select outcome from saved_migration_results where name = 'valid' $$,
  array['created'::text],
  'owner records a new value-free dry run'
);
select results_eq(
  $$ select status from saved_migration_results where name = 'valid' $$,
  array['valid'::text],
  'fully resolved dry run is valid'
);
select results_eq(
  $$ select approval_sha256 ~ '^[0-9a-f]{64}$' from saved_migration_results where name = 'valid' $$,
  array[true],
  'PostgreSQL derives a canonical approval fingerprint'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.migration_dry_runs $$,
  array[1::bigint],
  'one immutable dry-run receipt exists'
);
select results_eq(
  $$ select row_count || ':' || matched_count || ':' || create_count || ':' || unresolved_count || ':' || available_points || ':' || pending_points
     from loyalty.migration_dry_runs $$,
  array['2:1:1:0:350:0'::text],
  'receipt counts and exact totals reconcile'
);
select results_eq(
  $$ select encode(source_export_sha256, 'hex') || ':' || encode(canonical_document_sha256, 'hex') || ':' || encode(resolution_sha256, 'hex') || ':' || encode(engine_sha256, 'hex')
     from loyalty.migration_dry_runs $$,
  array[repeat('a', 64) || ':' || repeat('b', 64) || ':' || repeat('c', 64) || ':' || repeat('d', 64)],
  'receipt preserves every upstream fingerprint exactly'
);
select results_eq(
  $$ select issue_counts from loyalty.migration_dry_runs $$,
  array['{}'::jsonb],
  'valid receipt stores no issue payload'
);
select is_empty(
  $$ select id from loyalty.migration_dry_runs where row_to_json(migration_dry_runs)::text like '%@%' $$,
  'receipt persists no source email or raw identity'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_transactions $$,
  array[0::bigint],
  'dry-run recording creates no ledger value'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.admin_audit_events where action = 'migration.dry_run.record' $$,
  array[1::bigint],
  'dry-run recording appends administration audit evidence'
);
select results_eq(
  $$ select actor_user_id from loyalty.admin_audit_events where idempotency_key = 'migration:dry-run:valid' $$,
  array['81000000-0000-4000-8000-000000000001'::uuid],
  'audit actor is derived from the live Auth subject'
);
select is_empty(
  $$ select id from loyalty.admin_audit_events
     where action = 'migration.dry_run.record'
       and metadata::text ~* '(email|identityValue|rawRow|sourcePayload)' $$,
  'audit metadata is minimized and contains no raw migration identity field'
);

select results_eq(
  $$ select outcome from loyalty.record_migration_dry_run_v1(
    '81000000-0000-4000-8000-000000000110',
    '81000000-0000-4000-8000-000000000130',
    'valid', 'wployalty', repeat('a', 64), repeat('b', 64),
    repeat('c', 64), repeat('d', 64),
    2, 1, 1, 0, 350, 0, '{}'::jsonb,
    'migration:dry-run:valid',
    '81000000-0000-4000-8000-000000000202'
  ) $$,
  array['duplicate'::text],
  'exact idempotency retry returns the original receipt'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.migration_dry_runs $$,
  array[1::bigint],
  'exact retry creates no duplicate receipt'
);
select throws_ok(
  $$ select * from loyalty.record_migration_dry_run_v1(
    '81000000-0000-4000-8000-000000000110',
    '81000000-0000-4000-8000-000000000130',
    'valid', 'wployalty', repeat('a', 64), repeat('b', 64),
    repeat('c', 64), repeat('e', 64),
    2, 1, 1, 0, 350, 0, '{}'::jsonb,
    'migration:dry-run:valid',
    '81000000-0000-4000-8000-000000000203'
  ) $$,
  '23514', 'migration dry-run idempotency conflict',
  'changed reuse of an idempotency key fails closed'
);
select results_eq(
  $$ select outcome from loyalty.record_migration_dry_run_v1(
    '81000000-0000-4000-8000-000000000110',
    '81000000-0000-4000-8000-000000000130',
    'valid', 'wployalty', repeat('a', 64), repeat('b', 64),
    repeat('c', 64), repeat('d', 64),
    2, 1, 1, 0, 350, 0, '{}'::jsonb,
    'migration:dry-run:valid:second-key',
    '81000000-0000-4000-8000-000000000204'
  ) $$,
  array['duplicate'::text],
  'same content under a new key resolves to its content-addressed receipt'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.migration_dry_runs $$,
  array[1::bigint],
  'content-addressed rerun duplicates no receipt'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.admin_audit_events where action = 'migration.dry_run.record' $$,
  array[2::bigint],
  'content-addressed rerun remains attributable in audit history'
);

insert into saved_migration_results
select 'invalid', result.*
from loyalty.record_migration_dry_run_v1(
  '81000000-0000-4000-8000-000000000110',
  '81000000-0000-4000-8000-000000000130',
  'invalid', 'woorewards', repeat('1', 64), repeat('2', 64),
  repeat('3', 64), repeat('4', 64),
  1, 1, 0, 0, 80, 0, '{"identity_fingerprint_mismatch":1}'::jsonb,
  'migration:dry-run:invalid',
  '81000000-0000-4000-8000-000000000205'
) as result;

select results_eq(
  $$ select outcome from saved_migration_results where name = 'invalid' $$,
  array['created'::text],
  'invalid validation evidence remains traceable'
);
select results_eq(
  $$ select status from loyalty.migration_dry_runs where source_system = 'woorewards' $$,
  array['invalid'::text],
  'fingerprint drift invalidates a fully resolved receipt'
);
select results_eq(
  $$ select issue_counts from loyalty.migration_dry_runs where source_system = 'woorewards' $$,
  array['{"identity_fingerprint_mismatch":1}'::jsonb],
  'invalid receipt retains bounded aggregate issue evidence only'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_transactions $$,
  array[0::bigint],
  'invalid dry run also creates no ledger effect'
);
select throws_ok(
  $$ select * from loyalty.record_migration_dry_run_v1(
    '81000000-0000-4000-8000-000000000110',
    '81000000-0000-4000-8000-000000000130',
    'valid', 'generic_csv', repeat('1', 64), repeat('2', 64),
    repeat('3', 64), repeat('4', 64),
    1, 0, 0, 1, 80, 0, '{"unresolved_identity":1}'::jsonb,
    'migration:dry-run:status-mismatch',
    '81000000-0000-4000-8000-000000000206'
  ) $$,
  '22023', 'invalid migration dry-run receipt',
  'status cannot contradict issues or unresolved counts'
);
select throws_ok(
  $$ select * from loyalty.record_migration_dry_run_v1(
    '81000000-0000-4000-8000-000000000110',
    '81000000-0000-4000-8000-000000000130',
    'invalid', 'generic_csv', repeat('1', 64), repeat('2', 64),
    repeat('3', 64), repeat('4', 64),
    1, 0, 0, 1, 80, 0, '{"raw_email_error":1}'::jsonb,
    'migration:dry-run:unknown-issue',
    '81000000-0000-4000-8000-000000000207'
  ) $$,
  '22023', 'invalid migration dry-run receipt',
  'unallowlisted issue keys cannot persist source details'
);
select throws_ok(
  $$ select * from loyalty.record_migration_dry_run_v1(
    '81000000-0000-4000-8000-000000000110',
    '81000000-0000-4000-8000-000000000130',
    'invalid', 'generic_csv', repeat('1', 64), repeat('2', 64),
    repeat('3', 64), repeat('4', 64),
    1, 0, 0, 1, 80, 0, '[]'::jsonb,
    'migration:dry-run:array-issues',
    '81000000-0000-4000-8000-000000000214'
  ) $$,
  '22023', 'invalid migration dry-run receipt',
  'non-object issue evidence fails with the minimized validation error'
);
select throws_ok(
  $$ select * from loyalty.record_migration_dry_run_v1(
    '81000000-0000-4000-8000-000000000110',
    '81000000-0000-4000-8000-000000000130',
    'valid', 'generic_csv', 'not-a-sha', repeat('2', 64),
    repeat('3', 64), repeat('4', 64),
    1, 1, 0, 0, 80, 0, '{}'::jsonb,
    'migration:dry-run:bad-sha',
    '81000000-0000-4000-8000-000000000208'
  ) $$,
  '22023', 'invalid migration dry-run receipt',
  'malformed evidence fingerprints fail before persistence'
);

set local request.jwt.claim.sub = '81000000-0000-4000-8000-000000000003';
select throws_ok(
  $$ select * from loyalty.record_migration_dry_run_v1(
    '81000000-0000-4000-8000-000000000110',
    '81000000-0000-4000-8000-000000000130',
    'valid', 'generic_csv', repeat('1', 64), repeat('2', 64),
    repeat('3', 64), repeat('4', 64),
    1, 1, 0, 0, 80, 0, '{}'::jsonb,
    'migration:dry-run:operator',
    '81000000-0000-4000-8000-000000000209'
  ) $$,
  '42501', 'migration dry run not authorized',
  'operator cannot record migration approval evidence'
);

set local request.jwt.claim.sub = '81000000-0000-4000-8000-000000000004';
select throws_ok(
  $$ select * from loyalty.record_migration_dry_run_v1(
    '81000000-0000-4000-8000-000000000110',
    '81000000-0000-4000-8000-000000000130',
    'valid', 'generic_csv', repeat('1', 64), repeat('2', 64),
    repeat('3', 64), repeat('4', 64),
    1, 1, 0, 0, 80, 0, '{}'::jsonb,
    'migration:dry-run:auditor',
    '81000000-0000-4000-8000-000000000210'
  ) $$,
  '42501', 'migration dry run not authorized',
  'auditor is read-only at the migration boundary'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.migration_dry_runs $$,
  array[2::bigint],
  'auditor can inspect tenant migration receipts through RLS'
);

set local request.jwt.claim.sub = '81000000-0000-4000-8000-000000000003';
select results_eq(
  $$ select count(*)::bigint from loyalty.migration_dry_runs $$,
  array[0::bigint],
  'operator receives no direct migration receipt projection'
);

set local request.jwt.claim.sub = '81000000-0000-4000-8000-000000000005';
select throws_ok(
  $$ select * from loyalty.record_migration_dry_run_v1(
    '81000000-0000-4000-8000-000000000110',
    '81000000-0000-4000-8000-000000000130',
    'valid', 'generic_csv', repeat('1', 64), repeat('2', 64),
    repeat('3', 64), repeat('4', 64),
    1, 1, 0, 0, 80, 0, '{}'::jsonb,
    'migration:dry-run:revoked',
    '81000000-0000-4000-8000-000000000211'
  ) $$,
  '42501', 'migration dry run not authorized',
  'revoked membership fails closed'
);

set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select * from loyalty.record_migration_dry_run_v1(
    '81000000-0000-4000-8000-000000000110',
    '81000000-0000-4000-8000-000000000130',
    'valid', 'generic_csv', repeat('1', 64), repeat('2', 64),
    repeat('3', 64), repeat('4', 64),
    1, 1, 0, 0, 80, 0, '{}'::jsonb,
    'migration:dry-run:cross-tenant',
    '81000000-0000-4000-8000-000000000212'
  ) $$,
  '42501', 'migration dry run not authorized',
  'other tenant owner cannot record against the first tenant'
);
select throws_ok(
  $$ select * from loyalty.record_migration_dry_run_v1(
    '82000000-0000-4000-8000-000000000110',
    '82000000-0000-4000-8000-000000000130',
    'valid', 'generic_csv', repeat('1', 64), repeat('2', 64),
    repeat('3', 64), repeat('4', 64),
    1, 1, 0, 0, 80, 0, '{}'::jsonb,
    'migration:dry-run:disabled',
    '82000000-0000-4000-8000-000000000212'
  ) $$,
  '42501', 'migration is not enabled for this organization',
  'disabled tenant entitlement blocks new migration work'
);

set local request.jwt.claim.sub = '';
select throws_ok(
  $$ select * from loyalty.record_migration_dry_run_v1(
    '81000000-0000-4000-8000-000000000110',
    '81000000-0000-4000-8000-000000000130',
    'valid', 'generic_csv', repeat('1', 64), repeat('2', 64),
    repeat('3', 64), repeat('4', 64),
    1, 1, 0, 0, 80, 0, '{}'::jsonb,
    'migration:dry-run:no-auth',
    '81000000-0000-4000-8000-000000000213'
  ) $$,
  '22023', 'invalid migration dry-run receipt',
  'missing Auth subject fails closed'
);

reset role;

select throws_ok(
  $$ update loyalty.migration_dry_runs set status = 'invalid' where status = 'valid' $$,
  '55000', 'immutable loyalty history cannot be changed',
  'migration receipts reject mutation'
);
select throws_ok(
  $$ delete from loyalty.migration_dry_runs $$,
  '55000', 'immutable loyalty history cannot be changed',
  'migration receipts reject deletion'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.migration_dry_runs $$,
  array[2::bigint],
  'adversarial failures leave only the two explained receipts'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_entries $$,
  array[0::bigint],
  'entire dry-run slice remains value-free'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.wallet_balances $$,
  array[0::bigint],
  'dry-run validation creates no wallet projection'
);
select is_empty(
  $$ select id from loyalty.admin_audit_events
     where action = 'migration.dry_run.record'
       and metadata ?| array['email', 'rawRows', 'identity', 'sourceExportId'] $$,
  'all migration audit evidence omits raw export and identity fields'
);

select * from finish();
rollback;
