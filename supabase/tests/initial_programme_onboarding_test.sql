begin;

create extension if not exists pgtap with schema extensions;

select plan(35);

select has_function(
  'loyalty',
  'create_programme_command',
  array['uuid', 'text', 'text', 'text', 'uuid'],
  'initial programme creation command exists'
);
select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.create_programme_command(uuid,text,text,text,uuid)',
    'EXECUTE'
  ),
  'authenticated role can enter the guarded creation command'
);
select ok(
  not has_function_privilege(
    'anon',
    'loyalty.create_programme_command(uuid,text,text,text,uuid)',
    'EXECUTE'
  ),
  'anonymous clients cannot enter programme creation'
);
select results_eq(
  $$
    select routine.prosecdef
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'loyalty'
      and routine.proname = 'create_programme_command'
  $$,
  array[true],
  'creation command is a security definer boundary'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'loyalty'
      and routine.proname = 'create_programme_command'
      and exists (
        select 1 from unnest(routine.proconfig) as setting
        where setting like 'search_path=%'
      )
  $$,
  array[1::bigint],
  'creation command fixes an empty search path'
);
select ok(
  not has_table_privilege('authenticated', 'loyalty.programmes', 'INSERT'),
  'browser clients still cannot insert programmes directly'
);

insert into auth.users (id, email)
values
  ('73000000-0000-4000-8000-000000000001', 'onboarding-owner@example.test'),
  ('73000000-0000-4000-8000-000000000002', 'onboarding-admin@example.test'),
  ('73000000-0000-4000-8000-000000000003', 'onboarding-operator@example.test'),
  ('73000000-0000-4000-8000-000000000004', 'onboarding-analyst@example.test'),
  ('73000000-0000-4000-8000-000000000005', 'onboarding-auditor@example.test'),
  ('73000000-0000-4000-8000-000000000006', 'onboarding-revoked@example.test'),
  ('74000000-0000-4000-8000-000000000001', 'other-onboarding-owner@example.test');

insert into loyalty.organizations (public_id, slug, name)
values
  ('73000000-0000-4000-8000-000000000100', 'onboarding-one', 'Onboarding One'),
  ('74000000-0000-4000-8000-000000000100', 'onboarding-two', 'Onboarding Two');

insert into loyalty.organization_memberships (
  organization_id, user_id, role, revoked_at
)
values
  ((select id from loyalty.organizations where slug = 'onboarding-one'), '73000000-0000-4000-8000-000000000001', 'owner', null),
  ((select id from loyalty.organizations where slug = 'onboarding-one'), '73000000-0000-4000-8000-000000000002', 'admin', null),
  ((select id from loyalty.organizations where slug = 'onboarding-one'), '73000000-0000-4000-8000-000000000003', 'operator', null),
  ((select id from loyalty.organizations where slug = 'onboarding-one'), '73000000-0000-4000-8000-000000000004', 'analyst', null),
  ((select id from loyalty.organizations where slug = 'onboarding-one'), '73000000-0000-4000-8000-000000000005', 'auditor', null),
  ((select id from loyalty.organizations where slug = 'onboarding-one'), '73000000-0000-4000-8000-000000000006', 'admin', now()),
  ((select id from loyalty.organizations where slug = 'onboarding-two'), '74000000-0000-4000-8000-000000000001', 'owner', null);

insert into loyalty.programme_groups (public_id, organization_id, slug, name)
select
  case organization.slug
    when 'onboarding-one' then '73000000-0000-4000-8000-000000000110'::uuid
    else '74000000-0000-4000-8000-000000000110'::uuid
  end,
  organization.id,
  'rewards',
  organization.name || ' Rewards'
from loyalty.organizations as organization
where organization.slug in ('onboarding-one', 'onboarding-two');

set local role authenticated;
set local request.jwt.claim.sub = '73000000-0000-4000-8000-000000000001';

select results_eq(
  $$
    select outcome
    from loyalty.create_programme_command(
      '73000000-0000-4000-8000-000000000110',
      'rosy-rewards',
      'Rosy Rewards',
      'onboarding:programme:one',
      '73000000-0000-4000-8000-000000000201'
    )
  $$,
  array['created'::text],
  'owner creates the initial programme'
);
select results_eq(
  $$ select status from loyalty.programmes where slug = 'rosy-rewards' $$,
  array['active'::text],
  'new programme is immediately available for drafting'
);
select results_eq(
  $$
    select programme.organization_id = programme_group.organization_id
      and programme.programme_group_id = programme_group.id
    from loyalty.programmes as programme
    join loyalty.programme_groups as programme_group
      on programme_group.public_id = '73000000-0000-4000-8000-000000000110'
    where programme.slug = 'rosy-rewards'
  $$,
  array[true],
  'programme tenant and group come from the authorized public group ID'
);
select results_eq(
  $$ select actor_user_id from loyalty.admin_audit_events where idempotency_key = 'onboarding:programme:one' $$,
  array['73000000-0000-4000-8000-000000000001'::uuid],
  'audit actor comes from the verified request identity'
);
select results_eq(
  $$ select action from loyalty.admin_audit_events where idempotency_key = 'onboarding:programme:one' $$,
  array['programme.create'::text],
  'creation appends the expected audit action'
);
select results_eq(
  $$
    select audit.resource_public_id = programme.public_id
    from loyalty.admin_audit_events as audit
    join loyalty.programmes as programme on programme.slug = 'rosy-rewards'
    where audit.idempotency_key = 'onboarding:programme:one'
  $$,
  array[true],
  'audit evidence links to the created programme'
);
select results_eq(
  $$
    select concat_ws(
      '|',
      metadata ->> 'programmeGroupPublicId',
      metadata ->> 'slug',
      metadata ->> 'name'
    )
    from loyalty.admin_audit_events
    where idempotency_key = 'onboarding:programme:one'
  $$,
  array['73000000-0000-4000-8000-000000000110|rosy-rewards|Rosy Rewards'::text],
  'audit metadata retains the reviewed non-secret creation inputs'
);
select results_eq(
  $$ select octet_length(request_sha256) from loyalty.admin_audit_events where idempotency_key = 'onboarding:programme:one' $$,
  array[32],
  'creation audit retains a SHA-256 request fingerprint'
);
select results_eq(
  $$ select correlation_id from loyalty.admin_audit_events where idempotency_key = 'onboarding:programme:one' $$,
  array['73000000-0000-4000-8000-000000000201'::uuid],
  'creation audit retains its correlation identity'
);
select results_eq(
  $$
    select outcome
    from loyalty.create_programme_command(
      '73000000-0000-4000-8000-000000000110',
      'rosy-rewards',
      'Rosy Rewards',
      'onboarding:programme:one',
      '73000000-0000-4000-8000-000000000299'
    )
  $$,
  array['duplicate'::text],
  'an exact retry returns the existing programme'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.programmes where slug = 'rosy-rewards' $$,
  array[1::bigint],
  'an exact retry creates no second programme'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.admin_audit_events where idempotency_key = 'onboarding:programme:one' $$,
  array[1::bigint],
  'an exact retry creates no second audit event'
);
select throws_ok(
  $$
    select * from loyalty.create_programme_command(
      '73000000-0000-4000-8000-000000000110', 'changed', 'Changed',
      'onboarding:programme:one', '73000000-0000-4000-8000-000000000202'
    )
  $$,
  '23514', 'programme creation idempotency conflict',
  'an idempotency key cannot be reused with changed input'
);
select throws_ok(
  $$
    select * from loyalty.create_programme_command(
      '73000000-0000-4000-8000-000000000110', 'rosy-rewards', 'Another Name',
      'onboarding:programme:duplicate-slug', '73000000-0000-4000-8000-000000000203'
    )
  $$,
  '23514', 'programme slug already exists',
  'a second command cannot silently adopt an existing slug'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.admin_audit_events where idempotency_key = 'onboarding:programme:duplicate-slug' $$,
  array[0::bigint],
  'failed duplicate-slug creation leaves no success audit'
);
select throws_ok(
  $$ select * from loyalty.create_programme_command(
    '73000000-0000-4000-8000-000000000110', 'Rosy-Rewards', 'Valid Name',
    'onboarding:programme:uppercase', '73000000-0000-4000-8000-000000000204'
  ) $$,
  '22023', 'invalid programme creation input',
  'non-canonical slugs are rejected'
);
select throws_ok(
  $$ select * from loyalty.create_programme_command(
    '73000000-0000-4000-8000-000000000110', 'trimmed-name', ' Trim Me ',
    'onboarding:programme:trim', '73000000-0000-4000-8000-000000000205'
  ) $$,
  '22023', 'invalid programme creation input',
  'programme names must already be trimmed'
);
select throws_ok(
  $$ select * from loyalty.create_programme_command(
    '73000000-0000-4000-8000-000000000110', 'control-name', E'Bad\nName',
    'onboarding:programme:control', '73000000-0000-4000-8000-000000000206'
  ) $$,
  '22023', 'invalid programme creation input',
  'control characters are rejected from programme names'
);

set local request.jwt.claim.sub = '73000000-0000-4000-8000-000000000002';
select results_eq(
  $$ select outcome from loyalty.create_programme_command(
    '73000000-0000-4000-8000-000000000110', 'admin-programme', 'Admin Programme',
    'onboarding:programme:admin', '73000000-0000-4000-8000-000000000207'
  ) $$,
  array['created'::text],
  'a live tenant admin can create a programme'
);

set local request.jwt.claim.sub = '73000000-0000-4000-8000-000000000003';
select throws_ok(
  $$ select * from loyalty.create_programme_command(
    '73000000-0000-4000-8000-000000000110', 'operator-programme', 'Operator Programme',
    'onboarding:programme:operator', '73000000-0000-4000-8000-000000000208'
  ) $$,
  '42501', 'programme creation not authorized',
  'operator cannot create a programme'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.admin_audit_events $$,
  array[0::bigint],
  'operator cannot read privileged creation audit evidence'
);

set local request.jwt.claim.sub = '73000000-0000-4000-8000-000000000004';
select throws_ok(
  $$ select * from loyalty.create_programme_command(
    '73000000-0000-4000-8000-000000000110', 'analyst-programme', 'Analyst Programme',
    'onboarding:programme:analyst', '73000000-0000-4000-8000-000000000209'
  ) $$,
  '42501', 'programme creation not authorized',
  'analyst cannot create a programme'
);

set local request.jwt.claim.sub = '73000000-0000-4000-8000-000000000005';
select throws_ok(
  $$ select * from loyalty.create_programme_command(
    '73000000-0000-4000-8000-000000000110', 'auditor-programme', 'Auditor Programme',
    'onboarding:programme:auditor', '73000000-0000-4000-8000-000000000210'
  ) $$,
  '42501', 'programme creation not authorized',
  'auditor cannot create a programme'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.admin_audit_events $$,
  array[2::bigint],
  'auditor can review tenant creation evidence'
);

set local request.jwt.claim.sub = '73000000-0000-4000-8000-000000000006';
select throws_ok(
  $$ select * from loyalty.create_programme_command(
    '73000000-0000-4000-8000-000000000110', 'revoked-programme', 'Revoked Programme',
    'onboarding:programme:revoked', '73000000-0000-4000-8000-000000000211'
  ) $$,
  '42501', 'programme creation not authorized',
  'revoked admin fails closed with a live token'
);

set local request.jwt.claim.sub = '74000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select * from loyalty.create_programme_command(
    '73000000-0000-4000-8000-000000000110', 'cross-tenant', 'Cross Tenant',
    'onboarding:programme:cross-tenant', '73000000-0000-4000-8000-000000000212'
  ) $$,
  '42501', 'programme creation not authorized',
  'another tenant owner cannot target this programme group'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.admin_audit_events $$,
  array[0::bigint],
  'another tenant owner cannot read this tenant audit evidence'
);

reset role;
update loyalty.programme_groups
set status = 'suspended'
where public_id = '73000000-0000-4000-8000-000000000110';
set local role authenticated;
set local request.jwt.claim.sub = '73000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select * from loyalty.create_programme_command(
    '73000000-0000-4000-8000-000000000110', 'suspended-programme', 'Suspended Programme',
    'onboarding:programme:suspended', '73000000-0000-4000-8000-000000000213'
  ) $$,
  '42501', 'programme creation not authorized',
  'suspended programme groups fail closed'
);

reset role;
select throws_ok(
  $$ update loyalty.admin_audit_events set metadata = '{"tampered":true}'::jsonb $$,
  '55000', 'immutable loyalty history cannot be changed',
  'programme creation audit evidence cannot be rewritten'
);

select * from finish();
rollback;
