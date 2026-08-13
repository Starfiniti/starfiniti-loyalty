begin;

create extension if not exists pgtap with schema extensions;

select plan(30);

select has_function(
  'loyalty_private',
  'bootstrap_initial_tenant',
  array['uuid', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'uuid'],
  'deployment-only initial tenant bootstrap exists'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'loyalty_private.bootstrap_initial_tenant(uuid,text,text,text,text,text,text,text,uuid)',
    'EXECUTE'
  ),
  'authenticated browser sessions cannot bootstrap tenants'
);
select ok(
  not has_function_privilege(
    'anon',
    'loyalty_private.bootstrap_initial_tenant(uuid,text,text,text,text,text,text,text,uuid)',
    'EXECUTE'
  ),
  'anonymous sessions cannot bootstrap tenants'
);
select ok(
  not has_function_privilege(
    'loyalty_runtime',
    'loyalty_private.bootstrap_initial_tenant(uuid,text,text,text,text,text,text,text,uuid)',
    'EXECUTE'
  ),
  'dashboard runtime cannot bootstrap tenants'
);
select ok(
  not has_function_privilege(
    'loyalty_worker',
    'loyalty_private.bootstrap_initial_tenant(uuid,text,text,text,text,text,text,text,uuid)',
    'EXECUTE'
  ),
  'worker runtime cannot bootstrap tenants'
);
select results_eq(
  $$
    select routine.prosecdef
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'loyalty_private'
      and routine.proname = 'bootstrap_initial_tenant'
  $$,
  array[true],
  'bootstrap is a security-definer boundary'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'loyalty_private'
      and routine.proname = 'bootstrap_initial_tenant'
      and exists (
        select 1 from unnest(routine.proconfig) as setting
        where setting = 'search_path=""'
      )
  $$,
  array[1::bigint],
  'bootstrap fixes an empty search path'
);

insert into auth.users (id, email)
values ('8b000000-0000-4000-8000-000000000001', 'bootstrap-owner@example.test');

select results_eq(
  $$
    select outcome
    from loyalty_private.bootstrap_initial_tenant(
      '8b000000-0000-4000-8000-000000000001',
      'bootstrap-tenant', 'Bootstrap Tenant',
      'main-store', 'Main Store',
      'shared-loyalty', 'Shared Loyalty',
      'tenant-bootstrap:bootstrap-tenant',
      '8b000000-0000-4000-8000-000000000010'
    )
  $$,
  array['created'::text],
  'bootstrap atomically creates the first tenant scope'
);
select results_eq(
  $$ select status from loyalty.organizations where slug = 'bootstrap-tenant' $$,
  array['active'::text],
  'organization starts active'
);
select results_eq(
  $$
    select workspace.status
    from loyalty.workspaces as workspace
    join loyalty.organizations as organization
      on organization.id = workspace.organization_id
    where organization.slug = 'bootstrap-tenant'
      and workspace.slug = 'main-store'
  $$,
  array['active'::text],
  'workspace starts active'
);
select results_eq(
  $$
    select programme_group.status
    from loyalty.programme_groups as programme_group
    join loyalty.organizations as organization
      on organization.id = programme_group.organization_id
    where organization.slug = 'bootstrap-tenant'
      and programme_group.slug = 'shared-loyalty'
  $$,
  array['active'::text],
  'programme group starts active'
);
select results_eq(
  $$
    select membership.role
    from loyalty.organization_memberships as membership
    join loyalty.organizations as organization
      on organization.id = membership.organization_id
    where organization.slug = 'bootstrap-tenant'
      and membership.user_id = '8b000000-0000-4000-8000-000000000001'
      and membership.revoked_at is null
  $$,
  array['owner'::text],
  'Auth user receives one live owner membership'
);
select is(
  (
    select count(*)
    from loyalty.programme_group_workspaces as link
    join loyalty.organizations as organization
      on organization.id = link.organization_id
    where organization.slug = 'bootstrap-tenant'
  ),
  1::bigint,
  'workspace is linked to the programme group'
);
select results_eq(
  $$
    select audit.action
    from loyalty.admin_audit_events as audit
    join loyalty.organizations as organization
      on organization.id = audit.organization_id
    where organization.slug = 'bootstrap-tenant'
  $$,
  array['tenant.bootstrap'::text],
  'bootstrap appends one administration audit event'
);
select results_eq(
  $$
    select audit.resource_public_id = organization.public_id
    from loyalty.admin_audit_events as audit
    join loyalty.organizations as organization
      on organization.id = audit.organization_id
    where organization.slug = 'bootstrap-tenant'
  $$,
  array[true],
  'audit resource identifies the created organization'
);
select results_eq(
  $$
    select audit.actor_user_id
    from loyalty.admin_audit_events as audit
    join loyalty.organizations as organization
      on organization.id = audit.organization_id
    where organization.slug = 'bootstrap-tenant'
  $$,
  array['8b000000-0000-4000-8000-000000000001'::uuid],
  'audit identifies the initial owner principal'
);
select results_eq(
  $$
    select audit.metadata ?& array[
      'authority',
      'workspace_public_id',
      'programme_group_public_id',
      'membership_public_id'
    ]
    from loyalty.admin_audit_events as audit
    join loyalty.organizations as organization
      on organization.id = audit.organization_id
    where organization.slug = 'bootstrap-tenant'
  $$,
  array[true],
  'audit retains only the bounded bootstrap scope references'
);
select results_eq(
  $$
    select audit.metadata ?| array[
      'email',
      'organization_name',
      'workspace_name',
      'programme_group_name'
    ]
    from loyalty.admin_audit_events as audit
    join loyalty.organizations as organization
      on organization.id = audit.organization_id
    where organization.slug = 'bootstrap-tenant'
  $$,
  array[false],
  'audit metadata omits email and tenant names'
);
select results_eq(
  $$
    select outcome
    from loyalty_private.bootstrap_initial_tenant(
      '8b000000-0000-4000-8000-000000000001',
      'bootstrap-tenant', 'Bootstrap Tenant',
      'main-store', 'Main Store',
      'shared-loyalty', 'Shared Loyalty',
      'tenant-bootstrap:bootstrap-tenant',
      '8b000000-0000-4000-8000-000000000010'
    )
  $$,
  array['retry'::text],
  'exact retry returns the existing bootstrap result'
);
select is(
  (
    select count(*)
    from loyalty.admin_audit_events as audit
    join loyalty.organizations as organization
      on organization.id = audit.organization_id
    where organization.slug = 'bootstrap-tenant'
  ),
  1::bigint,
  'exact retry creates no second audit event'
);
select is(
  (
    select count(*)
    from loyalty.organization_memberships as membership
    join loyalty.organizations as organization
      on organization.id = membership.organization_id
    where organization.slug = 'bootstrap-tenant'
  ),
  1::bigint,
  'exact retry creates no second membership'
);
select throws_ok(
  $$
    select * from loyalty_private.bootstrap_initial_tenant(
      '8b000000-0000-4000-8000-000000000001',
      'bootstrap-tenant', 'Changed Tenant',
      'main-store', 'Main Store',
      'shared-loyalty', 'Shared Loyalty',
      'tenant-bootstrap:bootstrap-tenant',
      '8b000000-0000-4000-8000-000000000011'
    )
  $$,
  '23514',
  'bootstrap idempotency conflict',
  'changed request cannot reuse the bootstrap idempotency key'
);
select throws_ok(
  $$
    select * from loyalty_private.bootstrap_initial_tenant(
      '8b000000-0000-4000-8000-000000000001',
      'bootstrap-tenant', 'Bootstrap Tenant',
      'main-store', 'Main Store',
      'shared-loyalty', 'Shared Loyalty',
      'tenant-bootstrap:another-key',
      '8b000000-0000-4000-8000-000000000012'
    )
  $$,
  '23505',
  'bootstrap organization slug already exists',
  'existing organization cannot be adopted through a new request'
);
select throws_ok(
  $$
    select * from loyalty_private.bootstrap_initial_tenant(
      '8b000000-0000-4000-8000-000000000099',
      'missing-user', 'Missing User',
      'main-store', 'Main Store',
      'shared-loyalty', 'Shared Loyalty',
      'tenant-bootstrap:missing-user',
      '8b000000-0000-4000-8000-000000000013'
    )
  $$,
  '22023',
  'bootstrap Auth user does not exist',
  'bootstrap requires an existing Auth principal'
);
select throws_ok(
  $$
    select * from loyalty_private.bootstrap_initial_tenant(
      '8b000000-0000-4000-8000-000000000001',
      'Not Canonical', 'Bad Slug',
      'main-store', 'Main Store',
      'shared-loyalty', 'Shared Loyalty',
      'tenant-bootstrap:bad-slug',
      '8b000000-0000-4000-8000-000000000014'
    )
  $$,
  '22023',
  'bootstrap slugs must be canonical',
  'bootstrap rejects noncanonical slugs'
);
select throws_ok(
  $$
    select * from loyalty_private.bootstrap_initial_tenant(
      '8b000000-0000-4000-8000-000000000001',
      'trimmed-name', ' Trimmed Name ',
      'main-store', 'Main Store',
      'shared-loyalty', 'Shared Loyalty',
      'tenant-bootstrap:trimmed-name',
      '8b000000-0000-4000-8000-000000000015'
    )
  $$,
  '22023',
  'bootstrap names must be canonical',
  'bootstrap rejects names with hidden surrounding whitespace'
);
select throws_ok(
  $$
    select * from loyalty_private.bootstrap_initial_tenant(
      '8b000000-0000-4000-8000-000000000001',
      'bad-key', 'Bad Key',
      'main-store', 'Main Store',
      'shared-loyalty', 'Shared Loyalty',
      ' ',
      '8b000000-0000-4000-8000-000000000016'
    )
  $$,
  '22023',
  'bootstrap idempotency key is invalid',
  'bootstrap rejects blank idempotency keys'
);
select throws_ok(
  $$
    update loyalty.admin_audit_events
    set metadata = '{}'::jsonb
    where action = 'tenant.bootstrap'
  $$,
  '55000',
  'immutable loyalty history cannot be changed',
  'bootstrap audit evidence is immutable'
);
select is(
  (
    select count(*)
    from loyalty.programmes as programme
    join loyalty.organizations as organization
      on organization.id = programme.organization_id
    where organization.slug = 'bootstrap-tenant'
  ),
  0::bigint,
  'deployment bootstrap leaves programme launch to the authenticated owner command'
);
select results_eq(
  $$
    select count(*)::bigint
    from loyalty.organizations
    where slug = 'bootstrap-tenant'
  $$,
  array[1::bigint],
  'bootstrap creates exactly one organization'
);

select * from finish();

rollback;
