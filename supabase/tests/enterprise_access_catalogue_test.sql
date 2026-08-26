begin;

create extension if not exists pgtap with schema extensions;

select plan(29);

select has_table(
  'loyalty', 'enterprise_access_profiles',
  'versioned enterprise access profiles exist'
);
select has_table(
  'loyalty', 'enterprise_access_profile_permissions',
  'versioned enterprise permission rows exist'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.enterprise_access_profiles where catalog_version = '1' $$,
  array[7::bigint],
  'catalogue contains seven exact profiles'
);
select results_eq(
  $$ select assignment_kind from loyalty.enterprise_access_profiles where catalog_version = '1' and role = 'support' $$,
  array['support_grant'::text],
  'support is structurally grant-only'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.enterprise_access_profiles where catalog_version = '1' and role <> 'support' and assignment_kind = 'membership' $$,
  array[6::bigint],
  'six tenant profiles use live memberships'
);
select ok(
  not has_table_privilege('authenticated', 'loyalty.enterprise_access_profiles', 'SELECT')
  and not has_table_privilege('authenticated', 'loyalty.enterprise_access_profiles', 'INSERT')
  and not has_table_privilege('loyalty_runtime', 'loyalty.enterprise_access_profiles', 'SELECT')
  and not has_table_privilege('loyalty_worker', 'loyalty.enterprise_access_profiles', 'SELECT'),
  'catalogue tables have no direct application-role access'
);
select has_function(
  'loyalty', 'get_organization_access_workspace_v1', array['uuid'],
  'access workspace has one public selector'
);
select ok(
  has_function_privilege(
    'authenticated', 'loyalty.get_organization_access_workspace_v1(uuid)', 'EXECUTE'
  ),
  'authenticated sessions may enter the minimized projection'
);
select ok(
  not has_function_privilege(
    'anon', 'loyalty.get_organization_access_workspace_v1(uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'loyalty_runtime', 'loyalty.get_organization_access_workspace_v1(uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'loyalty_worker', 'loyalty.get_organization_access_workspace_v1(uuid)', 'EXECUTE'
  ),
  'anonymous runtime and worker roles cannot enter the access review'
);
select ok(
  not has_function_privilege(
    'authenticated', 'loyalty_private.has_enterprise_permission_v1(bigint,text)', 'EXECUTE'
  ),
  'the permission helper is private'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname in ('loyalty', 'loyalty_private')
      and routine.proname in (
        'get_organization_access_workspace_v1',
        'has_enterprise_permission_v1'
      )
      and routine.prosecdef
      and exists (
        select 1 from unnest(routine.proconfig) as setting
        where setting = 'search_path=""'
      )
      and exists (
        select 1 from unnest(routine.proconfig) as setting
        where setting = 'statement_timeout=5s'
      )
  $$,
  array[2::bigint],
  'both boundaries fix search path and statement timeout'
);
select results_eq(
  $$
    select count(*)::bigint from information_schema.parameters
    where specific_schema = 'loyalty'
      and specific_name like 'get_organization_access_workspace_v1_%'
      and parameter_name in (
        'organization_id', 'actor_user_id', 'user_id', 'email', 'domain',
        'group', 'claims'
      )
  $$,
  array[0::bigint],
  'projection accepts no actor identity or raw tenant authority'
);
select throws_ok(
  $$ select * from loyalty.get_organization_access_workspace_v1(null) $$,
  '22023', 'invalid organization access request',
  'null selectors fail before projection'
);

insert into auth.users (id, email)
values
  ('87000000-0000-4000-8000-000000000001', 'access-owner@example.test'),
  ('87000000-0000-4000-8000-000000000002', 'access-admin@example.test'),
  ('87000000-0000-4000-8000-000000000003', 'access-marketer@example.test'),
  ('87000000-0000-4000-8000-000000000004', 'access-operator@example.test'),
  ('87000000-0000-4000-8000-000000000005', 'access-analyst@example.test'),
  ('87000000-0000-4000-8000-000000000006', 'access-auditor@example.test'),
  ('87000000-0000-4000-8000-000000000007', 'access-revoked@example.test'),
  ('88000000-0000-4000-8000-000000000001', 'access-other@example.test'),
  ('89000000-0000-4000-8000-000000000001', 'access-unassigned@example.test');

insert into loyalty.organizations (public_id, slug, name)
values
  ('87000000-0000-4000-8000-000000000100', 'access-review-one', 'Access Review One'),
  ('88000000-0000-4000-8000-000000000100', 'access-review-two', 'Access Review Two');

insert into loyalty.organization_memberships (
  organization_id, user_id, role, revoked_at
)
select organization.id, member.user_id, member.role, member.revoked_at
from loyalty.organizations as organization
cross join (values
  ('87000000-0000-4000-8000-000000000001'::uuid, 'owner'::text, null::timestamptz),
  ('87000000-0000-4000-8000-000000000002'::uuid, 'admin'::text, null::timestamptz),
  ('87000000-0000-4000-8000-000000000003'::uuid, 'marketer'::text, null::timestamptz),
  ('87000000-0000-4000-8000-000000000004'::uuid, 'operator'::text, null::timestamptz),
  ('87000000-0000-4000-8000-000000000005'::uuid, 'analyst'::text, null::timestamptz),
  ('87000000-0000-4000-8000-000000000006'::uuid, 'auditor'::text, null::timestamptz),
  ('87000000-0000-4000-8000-000000000007'::uuid, 'admin'::text, now())
) as member(user_id, role, revoked_at)
where organization.slug = 'access-review-one';

insert into loyalty.organization_memberships (organization_id, user_id, role)
select id, '88000000-0000-4000-8000-000000000001', 'owner'
from loyalty.organizations where slug = 'access-review-two';

set local request.jwt.claim.sub = '87000000-0000-4000-8000-000000000001';
select ok(
  loyalty_private.has_enterprise_permission_v1(
    (select id from loyalty.organizations where slug = 'access-review-one'),
    'organization.lifecycle.manage'
  ),
  'active organization and live membership make the exact permission effective'
);
reset request.jwt.claim.sub;

select throws_ok(
  $$
    insert into loyalty.organization_memberships (organization_id, user_id, role)
    select id, '89000000-0000-4000-8000-000000000001', 'support'
    from loyalty.organizations where slug = 'access-review-one'
  $$,
  '23514',
  'new row for relation "organization_memberships" violates check constraint "organization_memberships_role_check"',
  'support cannot become a permanent organization member'
);

set local role authenticated;
set local request.jwt.claim.sub = '87000000-0000-4000-8000-000000000001';

select results_eq(
  $$ select workspace->>'schemaVersion' from loyalty.get_organization_access_workspace_v1('87000000-0000-4000-8000-000000000100') $$,
  array['1'::text],
  'owner receives the versioned workspace'
);
select results_eq(
  $$ select workspace #>> '{currentAccess,role}' from loyalty.get_organization_access_workspace_v1('87000000-0000-4000-8000-000000000100') $$,
  array['owner'::text],
  'current role comes from live membership'
);
select results_eq(
  $$ select jsonb_array_length(workspace #> '{catalogue,profiles}')::bigint from loyalty.get_organization_access_workspace_v1('87000000-0000-4000-8000-000000000100') $$,
  array[7::bigint],
  'projection returns all seven profiles once'
);
select results_eq(
  $$
    select profile->>'assignmentKind'
    from loyalty.get_organization_access_workspace_v1('87000000-0000-4000-8000-000000000100'),
      lateral jsonb_array_elements(workspace #> '{catalogue,profiles}') as profile
    where profile->>'role' = 'support'
  $$,
  array['support_grant'::text],
  'projection labels support as grant-only'
);
select results_eq(
  $$
    select sum((count_row->>'count')::bigint)
    from loyalty.get_organization_access_workspace_v1('87000000-0000-4000-8000-000000000100'),
      lateral jsonb_array_elements(workspace->'activeMembershipCounts') as count_row
  $$,
  array[6::numeric],
  'active role counts reconcile and exclude revoked membership'
);
select is_empty(
  $$
    select workspace
    from loyalty.get_organization_access_workspace_v1('87000000-0000-4000-8000-000000000100')
    where workspace::text ~* '"(email|domain|group|claim|token|secret|userid|user_id)"[[:space:]]*:'
  $$,
  'projection exposes no nested identity claim or secret key'
);

set local request.jwt.claim.sub = '87000000-0000-4000-8000-000000000003';
select results_eq(
  $$ select workspace #>> '{currentAccess,role}' from loyalty.get_organization_access_workspace_v1('87000000-0000-4000-8000-000000000100') $$,
  array['marketer'::text],
  'new marketer membership resolves only its exact M13 profile'
);
select results_eq(
  $$ select jsonb_array_length(workspace #> '{currentAccess,permissions}')::bigint from loyalty.get_organization_access_workspace_v1('87000000-0000-4000-8000-000000000100') $$,
  array[1::bigint],
  'marketer receives no implicit M13 administration permission'
);

set local request.jwt.claim.sub = '87000000-0000-4000-8000-000000000007';
select is_empty(
  $$ select * from loyalty.get_organization_access_workspace_v1('87000000-0000-4000-8000-000000000100') $$,
  'revoked membership fails with a still-live token'
);

set local request.jwt.claim.sub = '88000000-0000-4000-8000-000000000001';
select is_empty(
  $$ select * from loyalty.get_organization_access_workspace_v1('87000000-0000-4000-8000-000000000100') $$,
  'cross-tenant public selector returns no data'
);

set local request.jwt.claim.sub = '89000000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"89000000-0000-4000-8000-000000000001","email":"owner@access-review-one.test","role":"owner","groups":["tenant-admin"],"organization_id":"87000000-0000-4000-8000-000000000100"}';
select is_empty(
  $$ select * from loyalty.get_organization_access_workspace_v1('87000000-0000-4000-8000-000000000100') $$,
  'forged email role group and organization claims grant nothing'
);

reset request.jwt.claim.sub;
reset request.jwt.claims;
reset role;

update loyalty.organizations set status = 'suspended'
where slug = 'access-review-one';
set local role authenticated;
set local request.jwt.claim.sub = '87000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select workspace #>> '{organization,status}' from loyalty.get_organization_access_workspace_v1('87000000-0000-4000-8000-000000000100') $$,
  array['suspended'::text],
  'suspended organizations retain transparent access review for recovery'
);
select results_eq(
  $$ select workspace #>> '{currentAccess,effective}' from loyalty.get_organization_access_workspace_v1('87000000-0000-4000-8000-000000000100') $$,
  array['false'::text],
  'suspended organization access is explicitly inactive'
);

reset role;
select ok(
  not loyalty_private.has_enterprise_permission_v1(
    (select id from loyalty.organizations where slug = 'access-review-one'),
    'organization.lifecycle.manage'
  ),
  'suspension makes the same live membership ineffective for commands'
);

select * from finish();
rollback;
