begin;

create extension if not exists pgtap with schema extensions;

select plan(41);

select has_table('loyalty', 'organizations', 'organizations table exists');
select has_table(
  'loyalty',
  'organization_memberships',
  'organization memberships table exists'
);
select has_table('loyalty', 'workspaces', 'workspaces table exists');
select has_table('loyalty', 'programme_groups', 'programme groups table exists');
select has_table(
  'loyalty',
  'programme_group_workspaces',
  'programme group workspace allowlist exists'
);
select has_table(
  'loyalty',
  'support_access_grants',
  'support access grants table exists'
);

select is_empty(
  $$
    select relation.relname
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'loyalty'
      and relation.relkind in ('r', 'p')
      and not relation.relrowsecurity
  $$,
  'every loyalty table has RLS enabled'
);

select is_empty(
  $$
    select 'owner:' || relation.relname as violation
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    join pg_roles as owner_role on owner_role.oid = relation.relowner
    where namespace.nspname = 'loyalty'
      and relation.relkind in ('r', 'p')
      and owner_role.rolname <> 'loyalty_owner'
    union all
    select 'membership:' || member_role.rolname as violation
    from pg_auth_members as membership
    join pg_roles as owner_role on owner_role.oid = membership.roleid
    join pg_roles as member_role on member_role.oid = membership.member
    where owner_role.rolname = 'loyalty_owner'
      and member_role.rolname in (
        'anon',
        'authenticated',
        'authenticator',
        'loyalty_runtime',
        'loyalty_worker'
      )
  $$,
  'tenant tables use the no-login owner and runtime roles cannot assume it'
);

select ok(
  not has_schema_privilege('authenticated', 'loyalty_private', 'USAGE'),
  'authenticated cannot use the private schema'
);
select ok(
  has_schema_privilege('anon', 'loyalty', 'USAGE'),
  'anonymous clients can resolve only explicitly granted loyalty functions'
);
select ok(
  has_schema_privilege('authenticated', 'loyalty', 'USAGE'),
  'authenticated clients can use the RLS-protected loyalty schema'
);
select ok(
  has_table_privilege('authenticated', 'loyalty.organizations', 'SELECT'),
  'authenticated clients receive explicit organization read access'
);
select ok(
  not has_table_privilege('authenticated', 'loyalty.organizations', 'INSERT'),
  'authenticated clients cannot insert organizations directly'
);
select ok(
  not has_table_privilege('authenticated', 'loyalty.organizations', 'UPDATE'),
  'authenticated clients cannot update organizations directly'
);
select ok(
  not has_table_privilege('authenticated', 'loyalty.organizations', 'DELETE'),
  'authenticated clients cannot delete organizations directly'
);
select is_empty(
  $$
    select routine.oid::regprocedure::text
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname in ('public', 'loyalty')
      and routine.prosecdef
      and not (
        namespace.nspname = 'loyalty'
        and routine.proname in (
          'adjust_customer_points_command',
          'approve_campaign_version_command',
          'cancel_campaign_version_command',
          'create_campaign_draft_command',
          'create_programme_command',
          'create_programme_draft_command',
          'create_audience_draft_command',
          'create_audience_snapshot_command',
          'create_my_referral_link',
          'execute_bulk_customer_adjustment',
          'get_customer_adjustment_context',
          'get_customer_read_model',
          'get_customer_tier_progress_v1',
          'get_customer_tier_read_model',
          'get_campaign_results_v1',
          'get_my_loyalty_accounts',
          'get_my_referral_experiences_v1',
          'get_my_entitlements_v1',
          'get_my_tier_progress_v1',
          'get_programme_expiry_liability_v2',
          'get_programme_tier_performance_v1',
          'get_referral_dashboard_v1',
          'get_connector_operation_issues',
          'get_connector_operation_summaries',
          'get_overview_report',
          'get_public_loyalty_experience',
          'get_reward_fulfilment_summary',
          'list_customer_summaries',
          'list_referral_review_cases',
          'list_reward_fulfilment_cases',
          'publish_programme_version_command',
          'publish_audience_version_command',
          'pause_campaign_version_command',
          'preview_bulk_customer_adjustment',
          'preview_campaign_version_command',
          'redeem_my_reward',
          'request_connector_reconciliation_command',
          'retry_connector_effect_command',
          'retry_referral_reward_job_command',
          'save_experience_translation_command',
          'save_experience_theme_command',
          'schedule_programme_version_command',
          'set_customer_tier_override_command',
          'start_reward_fulfilment_command',
          'resolve_reward_fulfilment_command',
          'resolve_referral_review_command'
        )
      )
      and not exists (
        select 1
        from pg_depend as dependency
        join pg_extension as extension on extension.oid = dependency.refobjid
        where dependency.classid = 'pg_proc'::regclass
          and dependency.objid = routine.oid
          and dependency.deptype = 'e'
      )
  $$,
  'only reviewed merchant command security-definer functions are exposed'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'loyalty_private'
      and routine.proname in (
        'is_organization_member',
        'has_organization_role',
        'can_access_workspace'
      )
      and routine.prosecdef
  $$,
  array[3::bigint],
  'all three authorization helpers are security definer functions'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'loyalty_private'
      and routine.proname in (
        'is_organization_member',
        'has_organization_role',
        'can_access_workspace'
      )
      and exists (
        select 1
        from unnest(routine.proconfig) as setting
        where setting like 'search_path=%'
      )
  $$,
  array[3::bigint],
  'every authorization helper fixes its search path'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_roles
    where rolname in ('loyalty_owner', 'loyalty_runtime', 'loyalty_worker')
      and not rolcanlogin
      and not rolsuper
      and not rolbypassrls
      and not rolcreaterole
      and not rolcreatedb
  $$,
  array[3::bigint],
  'application database roles are no-login and cannot bypass tenant controls'
);
select has_index(
  'loyalty',
  'organization_memberships',
  'organization_memberships_user_active_idx',
  'live membership authorization lookup is indexed'
);
select has_index(
  'loyalty',
  'workspaces',
  'workspaces_organization_status_idx',
  'workspace tenant/status lookup is indexed'
);
select has_index(
  'loyalty',
  'programme_group_workspaces',
  'programme_group_workspaces_workspace_idx',
  'programme group workspace lookup is indexed'
);

insert into auth.users (id, email)
values
  ('11111111-1111-4111-8111-111111111111', 'owner-one@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'owner-two@example.test'),
  ('33333333-3333-4333-8333-333333333333', 'revoked@example.test'),
  ('44444444-4444-4444-8444-444444444444', 'operator@example.test'),
  ('55555555-5555-4555-8555-555555555555', 'outsider@example.test'),
  ('66666666-6666-4666-8666-666666666666', 'support@example.test');

insert into loyalty.organizations (slug, name)
values ('tenant-one', 'Tenant One'), ('tenant-two', 'Tenant Two');

insert into loyalty.organization_memberships (
  organization_id,
  user_id,
  role,
  revoked_at
)
values
  (
    (select id from loyalty.organizations where slug = 'tenant-one'),
    '11111111-1111-4111-8111-111111111111',
    'owner',
    null
  ),
  (
    (select id from loyalty.organizations where slug = 'tenant-two'),
    '22222222-2222-4222-8222-222222222222',
    'owner',
    null
  ),
  (
    (select id from loyalty.organizations where slug = 'tenant-one'),
    '33333333-3333-4333-8333-333333333333',
    'analyst',
    now()
  ),
  (
    (select id from loyalty.organizations where slug = 'tenant-one'),
    '44444444-4444-4444-8444-444444444444',
    'operator',
    null
  );

insert into loyalty.workspaces (organization_id, slug, name)
select id, 'store', name || ' Store'
from loyalty.organizations;

insert into loyalty.programme_groups (
  organization_id,
  slug,
  name,
  sharing_policy
)
select id, 'rewards', name || ' Rewards', 'explicit-workspace-allowlist'
from loyalty.organizations;

insert into loyalty.programme_group_workspaces (
  organization_id,
  programme_group_id,
  workspace_id
)
select organization.id, programme_group.id, workspace.id
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
join loyalty.workspaces as workspace
  on workspace.organization_id = organization.id;

insert into loyalty.support_access_grants (
  organization_id,
  support_user_id,
  approved_by_user_id,
  reason,
  scopes,
  expires_at
)
values (
  (select id from loyalty.organizations where slug = 'tenant-one'),
  '66666666-6666-4666-8666-666666666666',
  '11111111-1111-4111-8111-111111111111',
  'Investigate an owner-approved connection incident',
  array['connection:read'],
  now() + interval '30 minutes'
);

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select results_eq(
  'select count(*)::bigint from loyalty.organizations',
  array[1::bigint],
  'tenant-one owner sees exactly one organization'
);
select results_eq(
  'select count(*)::bigint from loyalty.workspaces',
  array[1::bigint],
  'tenant-one owner sees only its workspace'
);
select results_eq(
  'select count(*)::bigint from loyalty.programme_groups',
  array[1::bigint],
  'tenant-one owner sees only its programme group'
);
select results_eq(
  'select count(*)::bigint from loyalty.programme_group_workspaces',
  array[1::bigint],
  'tenant-one owner sees only its workspace allowlist'
);
select results_eq(
  'select count(*)::bigint from loyalty.organization_memberships',
  array[3::bigint],
  'tenant owner can review active and revoked membership evidence in its tenant'
);
select results_eq(
  'select count(*)::bigint from loyalty.support_access_grants',
  array[1::bigint],
  'tenant owner can review its support grant'
);

set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

select results_eq(
  $$ select slug from loyalty.organizations order by slug $$,
  $$ values ('tenant-two'::text) $$,
  'tenant-two owner cannot read tenant one'
);
select results_eq(
  $$ select name from loyalty.workspaces order by name $$,
  $$ values ('Tenant Two Store'::text) $$,
  'tenant-two owner cannot read tenant-one workspace'
);
select results_eq(
  'select count(*)::bigint from loyalty.organization_memberships',
  array[1::bigint],
  'tenant-two owner sees only its membership'
);

set local request.jwt.claim.sub = '44444444-4444-4444-8444-444444444444';

select results_eq(
  $$ select slug from loyalty.organizations order by slug $$,
  $$ values ('tenant-one'::text) $$,
  'active operator can read its organization'
);
select results_eq(
  'select count(*)::bigint from loyalty.organization_memberships',
  array[1::bigint],
  'operator sees only its own membership row'
);

set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';

select results_eq(
  'select count(*)::bigint from loyalty.organizations',
  array[0::bigint],
  'revoked member fails closed with an otherwise valid user identity'
);

set local request.jwt.claim.sub = '55555555-5555-4555-8555-555555555555';

select results_eq(
  'select count(*)::bigint from loyalty.organizations',
  array[0::bigint],
  'authenticated outsider sees no organization'
);

set local request.jwt.claim.sub = '66666666-6666-4666-8666-666666666666';

select results_eq(
  'select count(*)::bigint from loyalty.support_access_grants',
  array[1::bigint],
  'support subject can see only its scoped grant'
);
select results_eq(
  'select count(*)::bigint from loyalty.organizations',
  array[0::bigint],
  'support grant does not silently become tenant membership'
);
select ok(
  not has_sequence_privilege(
    'authenticated',
    'loyalty.organizations_id_seq',
    'USAGE'
  ),
  'authenticated cannot allocate internal organization IDs'
);
select ok(
  not has_table_privilege('anon', 'loyalty.organizations', 'SELECT'),
  'anonymous clients cannot select tenant rows'
);

reset role;

select throws_ok(
  $$
    insert into loyalty.programme_group_workspaces (
      organization_id,
      programme_group_id,
      workspace_id
    )
    values (
      (select id from loyalty.organizations where slug = 'tenant-one'),
      (
        select id from loyalty.programme_groups
        where organization_id = (
          select id from loyalty.organizations where slug = 'tenant-one'
        )
      ),
      (
        select id from loyalty.workspaces
        where organization_id = (
          select id from loyalty.organizations where slug = 'tenant-two'
        )
      )
    )
  $$,
  '23503',
  null,
  'composite foreign keys reject a forged cross-tenant workspace link'
);

select throws_ok(
  $$
    insert into loyalty.organization_memberships (
      organization_id,
      user_id,
      role
    )
    values (
      (select id from loyalty.organizations where slug = 'tenant-one'),
      '11111111-1111-4111-8111-111111111111',
      'owner'
    )
  $$,
  '23505',
  null,
  'unique membership prevents duplicate authorization rows'
);

select * from finish();
rollback;
