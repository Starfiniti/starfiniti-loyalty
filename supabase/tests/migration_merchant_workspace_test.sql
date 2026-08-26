begin;

create extension if not exists pgtap with schema extensions;

select plan(18);

select has_function(
  'loyalty', 'get_migration_workspace_v1', array['uuid', 'integer'],
  'merchant migration workspace is versioned and bounded'
);
select ok(
  has_function_privilege(
    'authenticated', 'loyalty.get_migration_workspace_v1(uuid,integer)',
    'EXECUTE'
  ),
  'authenticated sessions can enter the minimized read boundary'
);
select ok(
  not has_function_privilege(
    'anon', 'loyalty.get_migration_workspace_v1(uuid,integer)', 'EXECUTE'
  ),
  'anonymous callers cannot read migration evidence'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'loyalty'
      and routine.proname = 'get_migration_workspace_v1'
      and routine.prosecdef
      and exists (
        select 1 from unnest(routine.proconfig) as setting
        where setting = 'search_path=""'
      )
  $$,
  array[1::bigint],
  'workspace projection is security definer with an empty search path'
);
select results_eq(
  $$
    select count(*)::bigint from information_schema.parameters
    where specific_schema = 'loyalty'
      and specific_name like 'get_migration_workspace_v1_%'
      and parameter_name in ('organization_id', 'actor_user_id', 'customer_id')
  $$,
  array[0::bigint],
  'workspace accepts no caller tenant actor or customer authority'
);
select throws_ok(
  $$ select * from loyalty.get_migration_workspace_v1(
    '85000000-0000-4000-8000-000000000110', 0
  ) $$,
  '22023', 'invalid migration workspace request',
  'invalid limits fail before any projection'
);

insert into auth.users (id, email)
values
  ('85000000-0000-4000-8000-000000000001', 'workspace-owner@example.test'),
  ('85000000-0000-4000-8000-000000000002', 'workspace-auditor@example.test'),
  ('85000000-0000-4000-8000-000000000003', 'workspace-operator@example.test'),
  ('86000000-0000-4000-8000-000000000001', 'workspace-other@example.test');

insert into loyalty.organizations (public_id, slug, name)
values
  ('85000000-0000-4000-8000-000000000100', 'migration-workspace-one', 'Migration Workspace One'),
  ('86000000-0000-4000-8000-000000000100', 'migration-workspace-two', 'Migration Workspace Two');

insert into loyalty.organization_memberships (organization_id, user_id, role)
values
  ((select id from loyalty.organizations where slug = 'migration-workspace-one'),
    '85000000-0000-4000-8000-000000000001', 'owner'),
  ((select id from loyalty.organizations where slug = 'migration-workspace-one'),
    '85000000-0000-4000-8000-000000000002', 'auditor'),
  ((select id from loyalty.organizations where slug = 'migration-workspace-one'),
    '85000000-0000-4000-8000-000000000003', 'operator'),
  ((select id from loyalty.organizations where slug = 'migration-workspace-two'),
    '86000000-0000-4000-8000-000000000001', 'owner');

insert into loyalty.programme_groups (
  public_id, organization_id, slug, name, status
)
select '85000000-0000-4000-8000-000000000110', id,
  'rewards', 'Migration Rewards', 'active'
from loyalty.organizations where slug = 'migration-workspace-one';

insert into loyalty.programmes (
  public_id, organization_id, programme_group_id, slug, name, status
)
select '85000000-0000-4000-8000-000000000120', organization.id,
  programme_group.id, 'rewards', 'Migration Rewards', 'active'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
where organization.slug = 'migration-workspace-one';

insert into loyalty.programme_versions (
  public_id, organization_id, programme_group_id, programme_id,
  version_number, status, configuration, configuration_sha256,
  approved_by_user_id, published_at
)
select '85000000-0000-4000-8000-000000000130', organization.id,
  programme_group.id, programme.id, 1, 'published',
  '{"version":"1","tiers":[],"rewards":[]}'::jsonb,
  extensions.digest(convert_to('{}', 'UTF8'), 'sha256'),
  '85000000-0000-4000-8000-000000000001', now() - interval '1 day'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
join loyalty.programmes as programme
  on programme.organization_id = organization.id
where organization.slug = 'migration-workspace-one';

create temporary table migration_workspace_fixture (
  document_text text not null,
  resolutions_text text not null,
  document_sha text not null,
  resolution_sha text not null,
  dry_run_id uuid,
  approval_sha text,
  batch_id uuid
);
grant select, update on migration_workspace_fixture to authenticated;

with identity as (
  select encode(extensions.digest(convert_to(
    '{"identity":{"kind":"email","value":"private@example.test"},"schemaVersion":"1"}',
    'UTF8'
  ), 'sha256'), 'hex') as sha
), fixture as (
  select
    '{"expiryPolicy":{"expiresAt":"2027-08-26T08:00:00Z","mode":"apply_default"},"programmeGroupId":"85000000-0000-4000-8000-000000000110","programmeVersionId":"85000000-0000-4000-8000-000000000130","rows":[{"balance":{"availablePoints":"250","lots":[],"pendingPoints":"0"},"identity":{"kind":"email","value":"private@example.test"},"referral":null,"sourceHistory":[],"sourceRowId":"opaque-row-1","tier":null}],"schemaVersion":"1","source":{"exportId":"workspace-export-1","exportSha256":"' || repeat('a', 64) || '","exportedAt":"2026-08-26T06:00:00Z","system":"generic_csv"}}' as document_text,
    '[{"basis":"explicit_create","identitySha256":"' || identity.sha || '","outcome":"create_new","sourceRowId":"opaque-row-1","targetCustomerId":null}]' as resolutions_text
  from identity
)
insert into migration_workspace_fixture (
  document_text, resolutions_text, document_sha, resolution_sha
)
select document_text, resolutions_text,
  encode(extensions.digest(convert_to(document_text, 'UTF8'), 'sha256'), 'hex'),
  encode(extensions.digest(convert_to(resolutions_text, 'UTF8'), 'sha256'), 'hex')
from fixture;

set local role authenticated;
set local request.jwt.claim.sub = '85000000-0000-4000-8000-000000000001';

with created as (
  select * from loyalty.record_migration_dry_run_v1(
    '85000000-0000-4000-8000-000000000110',
    '85000000-0000-4000-8000-000000000130',
    'valid', 'generic_csv', repeat('a', 64),
    (select document_sha from migration_workspace_fixture),
    (select resolution_sha from migration_workspace_fixture),
    repeat('d', 64), 1, 0, 1, 0, 250, 0, '{}'::jsonb,
    'migration:workspace:dry-run:1',
    '85000000-0000-4000-8000-000000000201'
  )
)
update migration_workspace_fixture as fixture
set dry_run_id = created.dry_run_public_id,
  approval_sha = created.approval_sha256
from created;

with applied as (
  select * from loyalty.apply_migration_opening_balance_v1(
    (select dry_run_id from migration_workspace_fixture),
    (select approval_sha from migration_workspace_fixture),
    (select document_text from migration_workspace_fixture),
    (select resolutions_text from migration_workspace_fixture),
    null, 'migration:workspace:application:1',
    '85000000-0000-4000-8000-000000000202'
  )
)
update migration_workspace_fixture as fixture
set batch_id = applied.batch_public_id
from applied;

select results_eq(
  $$ select workspace->>'canConfigure'
     from loyalty.get_migration_workspace_v1(
       '85000000-0000-4000-8000-000000000110', 20
     ) $$,
  array['true'::text],
  'owner write access derives from the live migration entitlement'
);
select results_eq(
  $$ select jsonb_array_length(workspace->'dryRuns')
     from loyalty.get_migration_workspace_v1(
       '85000000-0000-4000-8000-000000000110', 20
     ) $$,
  array[1],
  'workspace returns the immutable dry-run receipt'
);
select results_eq(
  $$ select jsonb_array_length(workspace->'batches')
     from loyalty.get_migration_workspace_v1(
       '85000000-0000-4000-8000-000000000110', 20
     ) $$,
  array[1],
  'workspace returns the receipt-bound application batch'
);
select results_eq(
  $$ select workspace#>>'{batches,0,reconciliation,status}'
     from loyalty.get_migration_workspace_v1(
       '85000000-0000-4000-8000-000000000110', 20
     ) $$,
  array['reconciled'::text],
  'batch counts, lots, transactions, and credit entries reconcile exactly'
);
select results_eq(
  $$ select workspace#>>'{batches,0,reconciliation,lotPoints}'
     from loyalty.get_migration_workspace_v1(
       '85000000-0000-4000-8000-000000000110', 20
     ) $$,
  array['250'::text],
  'workspace preserves exact bigint totals as text'
);
select is_empty(
  $$ select workspace from loyalty.get_migration_workspace_v1(
       '85000000-0000-4000-8000-000000000110', 20
     ) where workspace::text like '%private@example.test%' $$,
  'workspace never returns the uploaded identity'
);
select results_eq(
  $$ select workspace#>>'{batches,0,items,0,sourceRowRef}'
     from loyalty.get_migration_workspace_v1(
       '85000000-0000-4000-8000-000000000110', 20
     ) $$,
  array['opaque-row-1'::text],
  'source rows remain traceable only through opaque references'
);

select * from loyalty.compensate_migration_batch_v1(
  (select batch_id from migration_workspace_fixture),
  'Correct approved workspace migration',
  'migration:workspace:correction:1',
  '85000000-0000-4000-8000-000000000203'
);
select results_eq(
  $$ select workspace#>>'{batches,0,correction,correctedPoints}'
     from loyalty.get_migration_workspace_v1(
       '85000000-0000-4000-8000-000000000110', 20
     ) $$,
  array['250'::text],
  'correction evidence is appended without changing original totals'
);

reset role;
insert into loyalty.organization_entitlements (
  organization_id, catalogue_version, capability_key, state, source,
  actor_reference, reason, effective_from
)
values (
  (select id from loyalty.organizations where slug = 'migration-workspace-one'),
  1, 'migration', 'disabled', 'local_control', 'pgTAP:M12-S05',
  'Prove history survives feature disable', now() - interval '1 second'
);

set local role authenticated;
set local request.jwt.claim.sub = '85000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select (workspace->>'entitlementEnabled') || ':' ||
       (workspace->>'canCorrect') || ':' ||
       jsonb_array_length(workspace->'batches')
     from loyalty.get_migration_workspace_v1(
       '85000000-0000-4000-8000-000000000110', 20
     ) $$,
  array['false:true:1'::text],
  'feature disable removes import writes while preserving correction and history'
);

set local request.jwt.claim.sub = '85000000-0000-4000-8000-000000000002';
select results_eq(
  $$ select (workspace->>'canConfigure') || ':' ||
       jsonb_array_length(workspace->'batches')
     from loyalty.get_migration_workspace_v1(
       '85000000-0000-4000-8000-000000000110', 20
     ) $$,
  array['false:1'::text],
  'auditor retains evidence access without write authority'
);

set local request.jwt.claim.sub = '85000000-0000-4000-8000-000000000003';
select is_empty(
  $$ select * from loyalty.get_migration_workspace_v1(
    '85000000-0000-4000-8000-000000000110', 20
  ) $$,
  'operator receives no migration evidence projection'
);

set local request.jwt.claim.sub = '86000000-0000-4000-8000-000000000001';
select is_empty(
  $$ select * from loyalty.get_migration_workspace_v1(
    '85000000-0000-4000-8000-000000000110', 20
  ) $$,
  'another tenant owner cannot read migration evidence'
);

reset role;

select * from finish();
rollback;
