begin;

create extension if not exists pgtap with schema extensions;

select plan(52);

select results_eq(
  $$
    select relrowsecurity
    from pg_class
    where oid = 'loyalty.programme_group_sharing_versions'::regclass
  $$,
  array[true],
  'sharing version history has row-level security enabled'
);
select results_eq(
  $$
    select relrowsecurity
    from pg_class
    where oid = 'loyalty.programme_group_sharing_version_workspaces'::regclass
  $$,
  array[true],
  'sharing-version workspace history has row-level security enabled'
);

select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.get_programme_group_sharing_policy_v1(uuid)',
    'EXECUTE'
  ),
  'authenticated members can enter the minimized sharing read model'
);
select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.configure_programme_group_sharing_v1(uuid,text,uuid[],integer,text,uuid)',
    'EXECUTE'
  ),
  'authenticated users can enter the guarded sharing command'
);
select ok(
  not has_function_privilege(
    'anon', 'loyalty.get_programme_group_sharing_policy_v1(uuid)', 'EXECUTE'
  ),
  'anonymous users cannot read programme sharing policy'
);
select ok(
  not has_function_privilege(
    'anon',
    'loyalty.configure_programme_group_sharing_v1(uuid,text,uuid[],integer,text,uuid)',
    'EXECUTE'
  ),
  'anonymous users cannot configure programme sharing policy'
);
select ok(
  not has_table_privilege(
    'authenticated', 'loyalty.programme_group_sharing_versions', 'SELECT'
  ),
  'browser roles cannot read immutable sharing versions directly'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'loyalty.programme_group_sharing_version_workspaces',
    'SELECT'
  ),
  'browser roles cannot read sharing-version membership rows directly'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'loyalty'
      and routine.proname in (
        'get_programme_group_sharing_policy_v1',
        'configure_programme_group_sharing_v1'
      )
      and routine.prosecdef
  $$,
  array[2::bigint],
  'both public boundaries are security-definer functions'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'loyalty'
      and routine.proname in (
        'get_programme_group_sharing_policy_v1',
        'configure_programme_group_sharing_v1'
      )
      and exists (
        select 1 from unnest(routine.proconfig) as setting
        where setting = 'search_path=""'
      )
  $$,
  array[2::bigint],
  'both public boundaries use an empty search path'
);
select is_empty(
  $$
    select parameter_name
    from information_schema.parameters
    where specific_schema = 'loyalty'
      and specific_name like 'configure_programme_group_sharing_v1_%'
      and parameter_name in (
        'organization_id', 'actor_user_id', 'customer_id', 'wallet_id',
        'programme_group_id'
      )
  $$,
  'the command accepts no internal tenant actor customer wallet or group authority'
);

insert into auth.users (id, email)
values
  ('91000000-0000-4000-8000-000000000001', 'sharing-owner@example.test'),
  ('91000000-0000-4000-8000-000000000002', 'sharing-admin@example.test'),
  ('91000000-0000-4000-8000-000000000003', 'sharing-operator@example.test'),
  ('91000000-0000-4000-8000-000000000004', 'sharing-analyst@example.test'),
  ('91000000-0000-4000-8000-000000000005', 'sharing-revoked@example.test'),
  ('92000000-0000-4000-8000-000000000001', 'sharing-other@example.test');

insert into loyalty.organizations (public_id, slug, name)
values
  ('91000000-0000-4000-8000-000000000100', 'sharing-one', 'Sharing One'),
  ('92000000-0000-4000-8000-000000000100', 'sharing-two', 'Sharing Two');

insert into loyalty.organization_memberships (
  organization_id, user_id, role, revoked_at
)
values
  ((select id from loyalty.organizations where slug = 'sharing-one'), '91000000-0000-4000-8000-000000000001', 'owner', null),
  ((select id from loyalty.organizations where slug = 'sharing-one'), '91000000-0000-4000-8000-000000000002', 'admin', null),
  ((select id from loyalty.organizations where slug = 'sharing-one'), '91000000-0000-4000-8000-000000000003', 'operator', null),
  ((select id from loyalty.organizations where slug = 'sharing-one'), '91000000-0000-4000-8000-000000000004', 'analyst', null),
  ((select id from loyalty.organizations where slug = 'sharing-one'), '91000000-0000-4000-8000-000000000005', 'owner', now()),
  ((select id from loyalty.organizations where slug = 'sharing-two'), '92000000-0000-4000-8000-000000000001', 'owner', null);

insert into loyalty.workspaces (
  public_id, organization_id, slug, name, status
)
values
  ('91000000-0000-4000-8000-000000000201', (select id from loyalty.organizations where slug = 'sharing-one'), 'alpha', 'Alpha store', 'active'),
  ('91000000-0000-4000-8000-000000000202', (select id from loyalty.organizations where slug = 'sharing-one'), 'beta', 'Beta store', 'active'),
  ('91000000-0000-4000-8000-000000000203', (select id from loyalty.organizations where slug = 'sharing-one'), 'paused', 'Paused store', 'suspended'),
  ('92000000-0000-4000-8000-000000000201', (select id from loyalty.organizations where slug = 'sharing-two'), 'other', 'Other store', 'active');

insert into loyalty.programme_groups (
  public_id, organization_id, slug, name, sharing_policy
)
values
  ('91000000-0000-4000-8000-000000000301', (select id from loyalty.organizations where slug = 'sharing-one'), 'rewards', 'Shared rewards', 'isolated'),
  ('92000000-0000-4000-8000-000000000301', (select id from loyalty.organizations where slug = 'sharing-two'), 'rewards', 'Other rewards', 'isolated');

set local role authenticated;
set local request.jwt.claim.sub = '91000000-0000-4000-8000-000000000001';

create temporary table initial_sharing_result as
select * from loyalty.configure_programme_group_sharing_v1(
  '91000000-0000-4000-8000-000000000301',
  'isolated',
  array['91000000-0000-4000-8000-000000000201'::uuid],
  0,
  'sharing:initial',
  '91000000-0000-4000-8000-000000000401'
);

select results_eq(
  $$ select outcome || ':' || revision::text || ':' || sharing_mode
     from initial_sharing_result $$,
  array['created:1:isolated'::text],
  'an owner creates the first exact isolated topology'
);
select results_eq(
  $$
    select (policy ->> 'version') || ':' || (policy ->> 'mode') || ':' ||
      (policy ->> 'revision')
    from loyalty.get_programme_group_sharing_policy_v1(
      '91000000-0000-4000-8000-000000000301'
    )
  $$,
  array['1:isolated:1'::text],
  'the read model returns its versioned isolated policy'
);
select results_eq(
  $$
    select jsonb_array_length(policy -> 'workspaces')::text || ':' ||
      (select count(*) from jsonb_array_elements(policy -> 'workspaces') as workspace
       where (workspace ->> 'linked')::boolean)::text
    from loyalty.get_programme_group_sharing_policy_v1(
      '91000000-0000-4000-8000-000000000301'
    )
  $$,
  array['2:1'::text],
  'the minimized projection lists active workspaces and one explicit link'
);
select results_eq(
  $$
    select policy ->> 'configurationEnabled'
    from loyalty.get_programme_group_sharing_policy_v1(
      '91000000-0000-4000-8000-000000000301'
    )
  $$,
  array['true'::text],
  'self-hosted ecosystem configuration remains locally enabled'
);

reset role;

select results_eq(
  $$ select sharing_policy from loyalty.programme_groups
     where public_id = '91000000-0000-4000-8000-000000000301' $$,
  array['isolated'::text],
  'the current group projection records isolated policy'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.programme_group_workspaces as link
     join loyalty.programme_groups as group_record on group_record.id = link.programme_group_id
     where group_record.public_id = '91000000-0000-4000-8000-000000000301' $$,
  array[1::bigint],
  'isolated policy links exactly one workspace'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.programme_group_sharing_versions as version
     join loyalty.programme_groups as group_record on group_record.id = version.programme_group_id
     where group_record.public_id = '91000000-0000-4000-8000-000000000301' $$,
  array[1::bigint],
  'the initial policy has one immutable version'
);
select results_eq(
  $$ select count(*)::bigint
     from loyalty.programme_group_sharing_version_workspaces as version_workspace
     join loyalty.programme_group_sharing_versions as version on version.id = version_workspace.sharing_version_id
     join loyalty.programme_groups as group_record on group_record.id = version.programme_group_id
     where group_record.public_id = '91000000-0000-4000-8000-000000000301' $$,
  array[1::bigint],
  'the initial immutable version contains one workspace'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.admin_audit_events
     where action = 'programme_group.sharing.configure' $$,
  array[1::bigint],
  'the initial command appends one tenant audit event'
);

set local role authenticated;
set local request.jwt.claim.sub = '91000000-0000-4000-8000-000000000001';

create temporary table shared_policy_result as
select * from loyalty.configure_programme_group_sharing_v1(
  '91000000-0000-4000-8000-000000000301',
  'explicit-workspace-allowlist',
  array[
    '91000000-0000-4000-8000-000000000202'::uuid,
    '91000000-0000-4000-8000-000000000201'::uuid
  ],
  1,
  'sharing:shared',
  '91000000-0000-4000-8000-000000000402'
);

select results_eq(
  $$ select outcome || ':' || revision::text || ':' || sharing_mode
     from shared_policy_result $$,
  array['created:2:explicit-workspace-allowlist'::text],
  'an owner explicitly shares the programme group across two workspaces'
);
select results_eq(
  $$
    select outcome || ':' || revision::text
    from loyalty.configure_programme_group_sharing_v1(
      '91000000-0000-4000-8000-000000000301',
      'explicit-workspace-allowlist',
      array[
        '91000000-0000-4000-8000-000000000201'::uuid,
        '91000000-0000-4000-8000-000000000202'::uuid
      ],
      1,
      'sharing:shared',
      '91000000-0000-4000-8000-000000000499'
    )
  $$,
  array['duplicate:2'::text],
  'an exact retry returns the original version despite selector ordering'
);

reset role;

select results_eq(
  $$ select sharing_policy from loyalty.programme_groups
     where public_id = '91000000-0000-4000-8000-000000000301' $$,
  array['explicit-workspace-allowlist'::text],
  'the current group projection records explicit sharing'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.programme_group_workspaces as link
     join loyalty.programme_groups as group_record on group_record.id = link.programme_group_id
     where group_record.public_id = '91000000-0000-4000-8000-000000000301' $$,
  array[2::bigint],
  'shared policy links exactly the reviewed two workspaces'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.programme_group_sharing_versions as version
     join loyalty.programme_groups as group_record on group_record.id = version.programme_group_id
     where group_record.public_id = '91000000-0000-4000-8000-000000000301' $$,
  array[2::bigint],
  'the changed policy appends instead of rewriting its first version'
);
select results_eq(
  $$ select count(*)::bigint
     from loyalty.programme_group_sharing_version_workspaces as version_workspace
     join loyalty.programme_group_sharing_versions as version on version.id = version_workspace.sharing_version_id
     join loyalty.programme_groups as group_record on group_record.id = version.programme_group_id
     where group_record.public_id = '91000000-0000-4000-8000-000000000301'
       and version.revision = 2 $$,
  array[2::bigint],
  'the second immutable version records both exact workspaces'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.admin_audit_events
     where action = 'programme_group.sharing.configure' $$,
  array[2::bigint],
  'the exact retry creates no duplicate audit event'
);
select results_eq(
  $$
    select jsonb_array_length(metadata -> 'workspacePublicIds')::bigint
    from loyalty.admin_audit_events
    where action = 'programme_group.sharing.configure'
    order by created_at desc, id desc limit 1
  $$,
  array[2::bigint],
  'audit evidence retains only the two reviewed public workspace selectors'
);

set local role authenticated;
set local request.jwt.claim.sub = '91000000-0000-4000-8000-000000000001';

select throws_ok(
  $$ select * from loyalty.configure_programme_group_sharing_v1(
    '91000000-0000-4000-8000-000000000301', 'isolated',
    array['91000000-0000-4000-8000-000000000201'::uuid], 1,
    'sharing:shared', '91000000-0000-4000-8000-000000000403') $$,
  '23514', 'sharing command idempotency conflict',
  'changed reuse of an idempotency key fails closed'
);
select throws_ok(
  $$ select * from loyalty.configure_programme_group_sharing_v1(
    '91000000-0000-4000-8000-000000000301', 'isolated',
    array['91000000-0000-4000-8000-000000000201'::uuid], 1,
    'sharing:stale', '91000000-0000-4000-8000-000000000404') $$,
  '23514', 'sharing policy revision conflict',
  'a stale reviewed revision cannot overwrite current topology'
);
select throws_ok(
  $$ select * from loyalty.configure_programme_group_sharing_v1(
    '91000000-0000-4000-8000-000000000301', 'explicit-workspace-allowlist',
    array[
      '91000000-0000-4000-8000-000000000201'::uuid,
      '91000000-0000-4000-8000-000000000201'::uuid
    ], 2, 'sharing:duplicate-workspace',
    '91000000-0000-4000-8000-000000000405') $$,
  '22023', 'invalid sharing workspace allowlist',
  'duplicate workspace selectors are rejected'
);
select throws_ok(
  $$ select * from loyalty.configure_programme_group_sharing_v1(
    '91000000-0000-4000-8000-000000000301', 'explicit-workspace-allowlist',
    array['91000000-0000-4000-8000-000000000201'::uuid], 2,
    'sharing:too-few', '91000000-0000-4000-8000-000000000406') $$,
  '22023', 'invalid sharing workspace allowlist',
  'explicit sharing cannot masquerade as one isolated workspace'
);
select throws_ok(
  $$ select * from loyalty.configure_programme_group_sharing_v1(
    '91000000-0000-4000-8000-000000000301', 'isolated',
    array[
      '91000000-0000-4000-8000-000000000201'::uuid,
      '91000000-0000-4000-8000-000000000202'::uuid
    ], 2, 'sharing:too-many',
    '91000000-0000-4000-8000-000000000407') $$,
  '22023', 'invalid sharing workspace allowlist',
  'isolated policy cannot conceal a shared allowlist'
);
select throws_ok(
  $$ select * from loyalty.configure_programme_group_sharing_v1(
    '91000000-0000-4000-8000-000000000301', 'explicit-workspace-allowlist',
    array[
      '91000000-0000-4000-8000-000000000201'::uuid,
      '92000000-0000-4000-8000-000000000201'::uuid
    ], 2, 'sharing:cross-tenant',
    '91000000-0000-4000-8000-000000000408') $$,
  '42501', 'sharing workspace not authorized',
  'a workspace from another tenant cannot enter the allowlist'
);

set local request.jwt.claim.sub = '91000000-0000-4000-8000-000000000004';
select throws_ok(
  $$ select * from loyalty.configure_programme_group_sharing_v1(
    '91000000-0000-4000-8000-000000000301', 'isolated',
    array['91000000-0000-4000-8000-000000000201'::uuid], 2,
    'sharing:analyst', '91000000-0000-4000-8000-000000000409') $$,
  '42501', 'sharing command not authorized',
  'an analyst cannot change wallet-sharing topology'
);
set local request.jwt.claim.sub = '91000000-0000-4000-8000-000000000003';
select throws_ok(
  $$ select * from loyalty.configure_programme_group_sharing_v1(
    '91000000-0000-4000-8000-000000000301', 'isolated',
    array['91000000-0000-4000-8000-000000000201'::uuid], 2,
    'sharing:operator', '91000000-0000-4000-8000-000000000410') $$,
  '42501', 'sharing command not authorized',
  'an operator cannot change wallet-sharing topology'
);
set local request.jwt.claim.sub = '91000000-0000-4000-8000-000000000005';
select throws_ok(
  $$ select * from loyalty.configure_programme_group_sharing_v1(
    '91000000-0000-4000-8000-000000000301', 'isolated',
    array['91000000-0000-4000-8000-000000000201'::uuid], 2,
    'sharing:revoked', '91000000-0000-4000-8000-000000000411') $$,
  '42501', 'sharing command not authorized',
  'a revoked owner cannot change wallet-sharing topology'
);
set local request.jwt.claim.sub = '92000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select * from loyalty.configure_programme_group_sharing_v1(
    '91000000-0000-4000-8000-000000000301', 'isolated',
    array['91000000-0000-4000-8000-000000000201'::uuid], 2,
    'sharing:other', '91000000-0000-4000-8000-000000000412') $$,
  '42501', 'sharing command not authorized',
  'another tenant owner cannot change this topology'
);

set local request.jwt.claim.sub = '91000000-0000-4000-8000-000000000003';
select results_eq(
  $$ select count(*)::bigint from loyalty.get_programme_group_sharing_policy_v1(
    '91000000-0000-4000-8000-000000000301') $$,
  array[1::bigint],
  'an operator may read minimized topology for operations'
);
set local request.jwt.claim.sub = '91000000-0000-4000-8000-000000000005';
select is_empty(
  $$ select * from loyalty.get_programme_group_sharing_policy_v1(
    '91000000-0000-4000-8000-000000000301') $$,
  'a revoked member receives no sharing document'
);
set local request.jwt.claim.sub = '92000000-0000-4000-8000-000000000001';
select is_empty(
  $$ select * from loyalty.get_programme_group_sharing_policy_v1(
    '91000000-0000-4000-8000-000000000301') $$,
  'another tenant owner receives no sharing document'
);

reset role;

insert into loyalty.programmes (
  public_id, organization_id, programme_group_id, slug, name, status
)
select '91000000-0000-4000-8000-000000000501', organization.id,
  group_record.id, 'loyalty', 'Shared loyalty', 'active'
from loyalty.organizations as organization
join loyalty.programme_groups as group_record
  on group_record.organization_id = organization.id
where organization.slug = 'sharing-one' and group_record.slug = 'rewards';

insert into loyalty.commerce_connections (
  public_id, organization_id, workspace_id, platform, external_store_id,
  display_name, current_key_version, signing_material_ref, programme_id
)
select '91000000-0000-4000-8000-000000000502', organization.id,
  workspace.id, 'woocommerce', 'https://beta.example.test', 'Beta WooCommerce',
  'v1', 'vault://sharing-beta', programme.id
from loyalty.organizations as organization
join loyalty.workspaces as workspace
  on workspace.organization_id = organization.id and workspace.slug = 'beta'
join loyalty.programmes as programme
  on programme.organization_id = organization.id and programme.slug = 'loyalty'
where organization.slug = 'sharing-one';

set local role authenticated;
set local request.jwt.claim.sub = '91000000-0000-4000-8000-000000000001';

select results_eq(
  $$
    select workspace ->> 'removalProtected'
    from loyalty.get_programme_group_sharing_policy_v1(
      '91000000-0000-4000-8000-000000000301'
    ) as report
    cross join jsonb_array_elements(report.policy -> 'workspaces') as workspace
    where workspace ->> 'id' = '91000000-0000-4000-8000-000000000202'
  $$,
  array['true'::text],
  'the read model marks a provisioned connector workspace as removal-protected'
);
select throws_ok(
  $$ select * from loyalty.configure_programme_group_sharing_v1(
    '91000000-0000-4000-8000-000000000301', 'isolated',
    array['91000000-0000-4000-8000-000000000201'::uuid], 2,
    'sharing:remove-connected', '91000000-0000-4000-8000-000000000413') $$,
  '23514', 'linked connector workspace cannot be removed from sharing policy',
  'a provisioned workspace cannot be removed while its connector history exists'
);

reset role;

select results_eq(
  $$ select count(*)::bigint from loyalty.programme_group_workspaces as link
     join loyalty.programme_groups as group_record on group_record.id = link.programme_group_id
     where group_record.public_id = '91000000-0000-4000-8000-000000000301' $$,
  array[2::bigint],
  'failed connector removal leaves both links intact'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.programme_group_sharing_versions as version
     join loyalty.programme_groups as group_record on group_record.id = version.programme_group_id
     where group_record.public_id = '91000000-0000-4000-8000-000000000301' $$,
  array[2::bigint],
  'failed connector removal appends no policy version'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.admin_audit_events
     where action = 'programme_group.sharing.configure' $$,
  array[2::bigint],
  'failed connector removal appends no audit success'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_transactions
     where organization_id = (select id from loyalty.organizations where slug = 'sharing-one') $$,
  array[0::bigint],
  'sharing configuration creates no ledger transaction'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_entries
     where organization_id = (select id from loyalty.organizations where slug = 'sharing-one') $$,
  array[0::bigint],
  'sharing configuration creates no ledger entry'
);
select throws_ok(
  $$ update loyalty.programme_group_sharing_versions set revision = 99
     where organization_id = (select id from loyalty.organizations where slug = 'sharing-one') $$,
  '55000', 'immutable loyalty history cannot be changed',
  'sharing version history cannot be rewritten'
);
select throws_ok(
  $$ delete from loyalty.programme_group_sharing_version_workspaces
     where organization_id = (select id from loyalty.organizations where slug = 'sharing-one') $$,
  '55000', 'immutable loyalty history cannot be changed',
  'sharing workspace history cannot be deleted'
);
select results_eq(
  $$
    select count(*)::bigint
    from loyalty.programme_group_workspaces as link
    join loyalty.programme_groups as group_record
      on group_record.organization_id = link.organization_id
     and group_record.id = link.programme_group_id
    join loyalty.programme_group_sharing_versions as version
      on version.organization_id = group_record.organization_id
     and version.programme_group_id = group_record.id and version.revision = 2
    join loyalty.programme_group_sharing_version_workspaces as version_workspace
      on version_workspace.organization_id = version.organization_id
     and version_workspace.sharing_version_id = version.id
     and version_workspace.workspace_id = link.workspace_id
    where group_record.public_id = '91000000-0000-4000-8000-000000000301'
  $$,
  array[2::bigint],
  'the current projection exactly matches the latest immutable allowlist'
);
select results_eq(
  $$
    select count(*)::bigint
    from loyalty.programme_group_sharing_versions
    where organization_id = (select id from loyalty.organizations where slug = 'sharing-one')
      and source_kind = 'merchant_command' and created_by_user_id is not null
  $$,
  array[2::bigint],
  'every merchant-created policy revision retains its request-derived actor'
);

select * from finish();
rollback;
