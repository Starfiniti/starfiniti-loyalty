begin;

create extension if not exists pgtap with schema extensions;

select plan(45);

-- pg_prove connects with the migration/test administration login. Granting
-- membership inside this rolled-back test transaction lets the suite exercise
-- the exact NOINHERIT runtime role without changing deployed role membership.
grant loyalty_runtime to current_user;
-- The runtime role deliberately has no pgTAP privileges in production. Test-
-- local access keeps assertions callable while that role is active.
grant usage on schema extensions to loyalty_runtime;
grant execute on all functions in schema extensions to loyalty_runtime;

select has_index(
  'loyalty', 'commerce_connections',
  'commerce_connections_signing_material_ref_uidx',
  'each signing-material reference can back at most one connection'
);
select has_function(
  'loyalty_private', 'provision_woocommerce_connection',
  array['uuid', 'uuid', 'uuid', 'text', 'text', 'text', 'text', 'uuid'],
  'private WooCommerce provisioning command exists'
);
select ok(
  has_function_privilege(
    'loyalty_runtime',
    'loyalty_private.provision_woocommerce_connection(uuid,uuid,uuid,text,text,text,text,uuid)',
    'EXECUTE'
  ),
  'trusted runtime can enter provisioning'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'loyalty_private.provision_woocommerce_connection(uuid,uuid,uuid,text,text,text,text,uuid)',
    'EXECUTE'
  ),
  'browser sessions cannot call private provisioning'
);
select ok(
  not has_function_privilege(
    'anon',
    'loyalty_private.provision_woocommerce_connection(uuid,uuid,uuid,text,text,text,text,uuid)',
    'EXECUTE'
  ),
  'anonymous clients cannot call private provisioning'
);
select ok(
  not has_function_privilege(
    'loyalty_worker',
    'loyalty_private.provision_woocommerce_connection(uuid,uuid,uuid,text,text,text,text,uuid)',
    'EXECUTE'
  ),
  'effect workers cannot provision connectors'
);
select results_eq(
  $$
    select routine.prosecdef
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'loyalty_private'
      and routine.proname = 'provision_woocommerce_connection'
  $$,
  array[true],
  'provisioning is a security-definer boundary'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'loyalty_private'
      and routine.proname = 'provision_woocommerce_connection'
      and exists (
        select 1 from unnest(routine.proconfig) as setting
        where setting = 'search_path=""'
      )
  $$,
  array[1::bigint],
  'provisioning pins an empty search path'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'loyalty_private'
      and routine.proname = 'provision_woocommerce_connection'
      and exists (
        select 1 from unnest(routine.proconfig) as setting
        where setting = 'statement_timeout=5s'
      )
  $$,
  array[1::bigint],
  'provisioning has a bounded statement timeout'
);
set local role loyalty_runtime;
select results_eq(
  $$
    select
      pg_catalog.coalesce(
        pg_catalog.has_function_privilege(
          current_user,
          pg_catalog.to_regprocedure(
            'loyalty_private.accept_commerce_delivery(bigint,bigint,text,text,text,text,text,text,timestamp with time zone,timestamp with time zone,text,text,text,jsonb)'
          ),
          'EXECUTE'
        ),
        false
      )
      and pg_catalog.coalesce(
        pg_catalog.has_function_privilege(
          current_user,
          pg_catalog.to_regprocedure(
            'loyalty_private.provision_woocommerce_connection(uuid,uuid,uuid,text,text,text,text,uuid)'
          ),
          'EXECUTE'
        ),
        false
      )
  $$,
  array[true],
  'dashboard readiness probe confirms exact runtime functions and privileges'
);
reset role;
select ok(
  not has_table_privilege('authenticated', 'loyalty.commerce_connections', 'INSERT'),
  'browser sessions cannot insert connections directly'
);
select ok(
  not has_table_privilege('loyalty_runtime', 'loyalty.commerce_connections', 'INSERT'),
  'trusted runtime still cannot insert connections directly'
);
select ok(
  not has_column_privilege(
    'authenticated', 'loyalty.commerce_connections', 'signing_material_ref', 'SELECT'
  ),
  'browser sessions cannot read signing-material references'
);

insert into auth.users (id, email)
values
  ('a2000000-0000-4000-8000-000000000001', 'provision-owner@example.test'),
  ('a2000000-0000-4000-8000-000000000002', 'provision-admin@example.test'),
  ('a2000000-0000-4000-8000-000000000003', 'provision-operator@example.test'),
  ('a2000000-0000-4000-8000-000000000004', 'provision-revoked@example.test'),
  ('a3000000-0000-4000-8000-000000000001', 'other-owner@example.test');

insert into loyalty.organizations (public_id, slug, name)
values
  ('a2000000-0000-4000-8000-000000000100', 'provision-one', 'Provision One'),
  ('a3000000-0000-4000-8000-000000000100', 'provision-two', 'Provision Two');
insert into loyalty.organization_memberships (
  organization_id, user_id, role, revoked_at
)
values
  ((select id from loyalty.organizations where slug = 'provision-one'), 'a2000000-0000-4000-8000-000000000001', 'owner', null),
  ((select id from loyalty.organizations where slug = 'provision-one'), 'a2000000-0000-4000-8000-000000000002', 'admin', null),
  ((select id from loyalty.organizations where slug = 'provision-one'), 'a2000000-0000-4000-8000-000000000003', 'operator', null),
  ((select id from loyalty.organizations where slug = 'provision-one'), 'a2000000-0000-4000-8000-000000000004', 'admin', now()),
  ((select id from loyalty.organizations where slug = 'provision-two'), 'a3000000-0000-4000-8000-000000000001', 'owner', null);
insert into loyalty.workspaces (public_id, organization_id, slug, name)
select
  case
    when organization.slug = 'provision-two' then 'a3000000-0000-4000-8000-000000000110'::uuid
    when workspace.number = 1 then 'a2000000-0000-4000-8000-000000000111'::uuid
    when workspace.number = 2 then 'a2000000-0000-4000-8000-000000000112'::uuid
    else 'a2000000-0000-4000-8000-000000000113'::uuid
  end,
  organization.id, 'store-' || workspace.number, organization.name || ' Store ' || workspace.number
from loyalty.organizations as organization
cross join lateral generate_series(
  1, case when organization.slug = 'provision-two' then 1 else 3 end
) as workspace(number)
where organization.slug in ('provision-one', 'provision-two');
insert into loyalty.programme_groups (public_id, organization_id, slug, name)
select
  case when slug = 'provision-one'
    then 'a2000000-0000-4000-8000-000000000120'::uuid
    else 'a3000000-0000-4000-8000-000000000120'::uuid end,
  id, 'rewards', name || ' Rewards'
from loyalty.organizations where slug in ('provision-one', 'provision-two');
insert into loyalty.programme_group_workspaces (
  organization_id, programme_group_id, workspace_id
)
select organization.id, programme_group.id, workspace.id
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
join loyalty.workspaces as workspace
  on workspace.organization_id = organization.id;
insert into loyalty.programmes (
  public_id, organization_id, programme_group_id, slug, name, status
)
select
  case
    when organization.slug = 'provision-two' then 'a3000000-0000-4000-8000-000000000130'::uuid
    when definition.slug = 'rewards' then 'a2000000-0000-4000-8000-000000000131'::uuid
    else 'a2000000-0000-4000-8000-000000000132'::uuid
  end,
  organization.id, programme_group.id, definition.slug,
  organization.name || ' ' || definition.name, 'active'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
cross join lateral (
  select 'rewards'::text as slug, 'Rewards'::text as name
  union all
  select 'draft-only', 'Draft Only'
  where organization.slug = 'provision-one'
) as definition;
insert into loyalty.programme_versions (
  organization_id, programme_group_id, programme_id, version_number,
  status, configuration, configuration_sha256, published_at
)
select organization_id, programme_group_id, id, 1,
  case when slug = 'draft-only' then 'draft' else 'published' end,
  '{"version":"1","tiers":[],"rewards":[]}'::jsonb,
  extensions.digest(public_id::text, 'sha256'),
  case when slug = 'draft-only' then null else now() end
from loyalty.programmes;

set local role loyalty_runtime;

select results_eq(
  $$
    select outcome
    from loyalty_private.provision_woocommerce_connection(
      'a2000000-0000-4000-8000-000000000001',
      'a2000000-0000-4000-8000-000000000111',
      'a2000000-0000-4000-8000-000000000131',
      'https://shop-one.example.test', 'Shop One',
      'pool:a2000000-0000-4000-8000-000000000201:v1',
      'connector:provision:one',
      'a2000000-0000-4000-8000-000000000301'
    )
  $$,
  array['created'::text],
  'owner provisions one active connector'
);

reset role;

select results_eq(
  $$
    select concat_ws('|', connection.platform, connection.status,
      connection.current_key_version, workspace.slug, programme.slug)
    from loyalty.commerce_connections as connection
    join loyalty.workspaces as workspace on workspace.id = connection.workspace_id
    join loyalty.programmes as programme on programme.id = connection.programme_id
    where connection.external_store_id = 'https://shop-one.example.test'
  $$,
  array['woocommerce|active|v1|store-1|rewards'::text],
  'connection scope and lifecycle come from authorized live records'
);
select results_eq(
  $$
    select signing_material_ref
    from loyalty.commerce_connections
    where external_store_id = 'https://shop-one.example.test'
  $$,
  array['pool:a2000000-0000-4000-8000-000000000201:v1'::text],
  'connection retains only the consumed signing-material reference'
);
select results_eq(
  $$ select actor_user_id from loyalty.admin_audit_events where idempotency_key = 'connector:provision:one' $$,
  array['a2000000-0000-4000-8000-000000000001'::uuid],
  'audit attributes the verified runtime actor'
);
select results_eq(
  $$ select action from loyalty.admin_audit_events where idempotency_key = 'connector:provision:one' $$,
  array['connector.woocommerce.provision'::text],
  'audit records the provisioning action'
);
select results_eq(
  $$
    select metadata ? 'workspacePublicId'
      and metadata ? 'programmePublicId'
      and metadata ? 'externalStoreId'
      and metadata ? 'displayName'
      and metadata ? 'keyVersion'
      and not (metadata::text ~* 'signing|secret|pool:')
    from loyalty.admin_audit_events
    where idempotency_key = 'connector:provision:one'
  $$,
  array[true],
  'audit metadata contains reviewed scope and no signing reference or key'
);
select results_eq(
  $$ select octet_length(request_sha256) from loyalty.admin_audit_events where idempotency_key = 'connector:provision:one' $$,
  array[32],
  'audit retains a canonical SHA-256 request fingerprint'
);
select results_eq(
  $$ select correlation_id from loyalty.admin_audit_events where idempotency_key = 'connector:provision:one' $$,
  array['a2000000-0000-4000-8000-000000000301'::uuid],
  'audit retains the command correlation ID'
);

set local role loyalty_runtime;
select results_eq(
  $$
    select outcome
    from loyalty_private.provision_woocommerce_connection(
      'a2000000-0000-4000-8000-000000000001',
      'a2000000-0000-4000-8000-000000000111',
      'a2000000-0000-4000-8000-000000000131',
      'https://shop-one.example.test', 'Shop One',
      'pool:a2000000-0000-4000-8000-000000000299:v1',
      'connector:provision:one',
      'a2000000-0000-4000-8000-000000000399'
    )
  $$,
  array['duplicate'::text],
  'exact retry returns the prior connection without depending on the proposed pool slot'
);
reset role;
select results_eq(
  $$ select count(*)::bigint from loyalty.commerce_connections where organization_id = (select id from loyalty.organizations where slug = 'provision-one') $$,
  array[1::bigint],
  'exact retry creates no second connection'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.admin_audit_events where idempotency_key = 'connector:provision:one' $$,
  array[1::bigint],
  'exact retry creates no second audit event'
);

set local role loyalty_runtime;
select throws_ok(
  $$ select * from loyalty_private.provision_woocommerce_connection(
    'a2000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000111',
    'a2000000-0000-4000-8000-000000000131',
    'https://changed.example.test', 'Changed',
    'pool:a2000000-0000-4000-8000-000000000202:v1',
    'connector:provision:one', 'a2000000-0000-4000-8000-000000000302'
  ) $$,
  '23514', 'connector provisioning idempotency conflict',
  'changed idempotency reuse fails closed'
);
select throws_ok(
  $$ select * from loyalty_private.provision_woocommerce_connection(
    'a2000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000112',
    'a2000000-0000-4000-8000-000000000131',
    'https://shop-two.example.test', 'Shop Two',
    'pool:a2000000-0000-4000-8000-000000000201:v1',
    'connector:provision:used-key', 'a2000000-0000-4000-8000-000000000303'
  ) $$,
  '23514', 'connector signing material unavailable',
  'one signing key cannot be shared by two connections'
);
reset role;
select results_eq(
  $$ select count(*)::bigint from loyalty.admin_audit_events where idempotency_key = 'connector:provision:used-key' $$,
  array[0::bigint],
  'failed signing-key reuse leaves no success audit'
);

set local role loyalty_runtime;
select throws_ok(
  $$ select * from loyalty_private.provision_woocommerce_connection(
    'a2000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000113',
    'a2000000-0000-4000-8000-000000000131',
    'https://shop-one.example.test', 'Duplicate Store',
    'pool:a2000000-0000-4000-8000-000000000203:v1',
    'connector:provision:duplicate-store', 'a2000000-0000-4000-8000-000000000304'
  ) $$,
  '23514', 'WooCommerce connection already exists',
  'one source store cannot be attached twice inside the tenant'
);
select throws_ok(
  $$ select * from loyalty_private.provision_woocommerce_connection(
    'a2000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000113',
    'a2000000-0000-4000-8000-000000000131',
    'http://unsafe.example.test', 'Unsafe',
    'pool:a2000000-0000-4000-8000-000000000203:v1',
    'connector:provision:http', 'a2000000-0000-4000-8000-000000000305'
  ) $$,
  '22023', 'invalid connector provisioning input',
  'non-HTTPS store identity is rejected'
);
select throws_ok(
  $$ select * from loyalty_private.provision_woocommerce_connection(
    'a2000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000113',
    'a2000000-0000-4000-8000-000000000131',
    'https://safe.example.test', E'Unsafe\nName',
    'pool:a2000000-0000-4000-8000-000000000203:v1',
    'connector:provision:control', 'a2000000-0000-4000-8000-000000000306'
  ) $$,
  '22023', 'invalid connector provisioning input',
  'control characters are rejected from display names'
);
select throws_ok(
  $$ select * from loyalty_private.provision_woocommerce_connection(
    'a2000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000113',
    'a2000000-0000-4000-8000-000000000131',
    'https://safe.example.test', 'Safe', 'operator-chosen-secret',
    'connector:provision:bad-ref', 'a2000000-0000-4000-8000-000000000307'
  ) $$,
  '22023', 'invalid connector provisioning input',
  'non-pool signing references are rejected'
);
select throws_ok(
  $$ select * from loyalty_private.provision_woocommerce_connection(
    'a2000000-0000-4000-8000-000000000003',
    'a2000000-0000-4000-8000-000000000113',
    'a2000000-0000-4000-8000-000000000131',
    'https://operator.example.test', 'Operator',
    'pool:a2000000-0000-4000-8000-000000000203:v1',
    'connector:provision:operator', 'a2000000-0000-4000-8000-000000000308'
  ) $$,
  '42501', 'connector provisioning not authorized',
  'operators cannot provision signing authority'
);
select throws_ok(
  $$ select * from loyalty_private.provision_woocommerce_connection(
    'a2000000-0000-4000-8000-000000000004',
    'a2000000-0000-4000-8000-000000000113',
    'a2000000-0000-4000-8000-000000000131',
    'https://revoked.example.test', 'Revoked',
    'pool:a2000000-0000-4000-8000-000000000203:v1',
    'connector:provision:revoked', 'a2000000-0000-4000-8000-000000000309'
  ) $$,
  '42501', 'connector provisioning not authorized',
  'revoked admins cannot provision'
);
select throws_ok(
  $$ select * from loyalty_private.provision_woocommerce_connection(
    'a3000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000113',
    'a2000000-0000-4000-8000-000000000131',
    'https://cross-actor.example.test', 'Cross Actor',
    'pool:a2000000-0000-4000-8000-000000000203:v1',
    'connector:provision:cross-actor', 'a2000000-0000-4000-8000-000000000310'
  ) $$,
  '42501', 'connector provisioning not authorized',
  'another tenant owner cannot provision this workspace'
);
select throws_ok(
  $$ select * from loyalty_private.provision_woocommerce_connection(
    'a2000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000113',
    'a3000000-0000-4000-8000-000000000130',
    'https://cross-programme.example.test', 'Cross Programme',
    'pool:a2000000-0000-4000-8000-000000000203:v1',
    'connector:provision:cross-programme', 'a2000000-0000-4000-8000-000000000311'
  ) $$,
  '42501', 'connector provisioning not authorized',
  'another tenant programme cannot be attached'
);
select throws_ok(
  $$ select * from loyalty_private.provision_woocommerce_connection(
    'a2000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000113',
    'a2000000-0000-4000-8000-000000000132',
    'https://draft.example.test', 'Draft',
    'pool:a2000000-0000-4000-8000-000000000203:v1',
    'connector:provision:draft', 'a2000000-0000-4000-8000-000000000312'
  ) $$,
  '42501', 'connector provisioning not authorized',
  'a programme without a published version cannot launch'
);
reset role;

update loyalty.workspaces set status = 'suspended'
where public_id = 'a2000000-0000-4000-8000-000000000113';
set local role loyalty_runtime;
select throws_ok(
  $$ select * from loyalty_private.provision_woocommerce_connection(
    'a2000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000113',
    'a2000000-0000-4000-8000-000000000131',
    'https://suspended.example.test', 'Suspended',
    'pool:a2000000-0000-4000-8000-000000000203:v1',
    'connector:provision:suspended', 'a2000000-0000-4000-8000-000000000313'
  ) $$,
  '42501', 'connector provisioning not authorized',
  'suspended workspaces cannot be provisioned'
);
reset role;
update loyalty.workspaces set status = 'active'
where public_id = 'a2000000-0000-4000-8000-000000000113';
update loyalty.organizations set status = 'suspended'
where slug = 'provision-one';
set local role loyalty_runtime;
select throws_ok(
  $$ select * from loyalty_private.provision_woocommerce_connection(
    'a2000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000113',
    'a2000000-0000-4000-8000-000000000131',
    'https://suspended-org.example.test', 'Suspended Org',
    'pool:a2000000-0000-4000-8000-000000000203:v1',
    'connector:provision:suspended-org', 'a2000000-0000-4000-8000-000000000314'
  ) $$,
  '42501', 'connector provisioning not authorized',
  'suspended organizations cannot be provisioned'
);
reset role;
update loyalty.organizations set status = 'active'
where slug = 'provision-one';

set local role loyalty_runtime;
select results_eq(
  $$
    select concat_ws('|', outcome, key_version)
    from loyalty_private.provision_woocommerce_connection(
      'a2000000-0000-4000-8000-000000000002',
      'a2000000-0000-4000-8000-000000000112',
      'a2000000-0000-4000-8000-000000000131',
      'https://shop-two.example.test', 'Shop Two',
      'pool:a2000000-0000-4000-8000-000000000202:v1',
      'connector:provision:admin',
      'a2000000-0000-4000-8000-000000000315'
    )
  $$,
  array['created|v1'::text],
  'live admin can provision another workspace with a distinct pool key'
);
reset role;
select results_eq(
  $$
    select count(distinct signing_material_ref)::bigint
    from loyalty.commerce_connections
    where organization_id = (select id from loyalty.organizations where slug = 'provision-one')
  $$,
  array[2::bigint],
  'provisioned connections never share signing references'
);
select results_eq(
  $$
    select count(*)::bigint
    from loyalty.admin_audit_events
    where action = 'connector.woocommerce.provision'
  $$,
  array[2::bigint],
  'only successful distinct provisioning commands create audit evidence'
);
select results_eq(
  $$
    select count(*)::bigint
    from loyalty.admin_audit_events
    where action = 'connector.woocommerce.provision'
      and metadata::text ~* 'signing|secret|pool:'
  $$,
  array[0::bigint],
  'no provisioning audit contains secret-store coordinates'
);
select throws_ok(
  $$ update loyalty.admin_audit_events set metadata = '{}'::jsonb where idempotency_key = 'connector:provision:one' $$,
  '55000', 'immutable loyalty history cannot be changed',
  'provisioning audit evidence is immutable'
);
select results_eq(
  $$
    select count(*)::bigint
    from loyalty.commerce_connections as connection
    join loyalty.programmes as programme
      on programme.organization_id = connection.organization_id
     and programme.id = connection.programme_id
    join loyalty.programme_versions as version
      on version.organization_id = programme.organization_id
     and version.programme_id = programme.id
     and version.status = 'published'
    where connection.status = 'active'
  $$,
  array[2::bigint],
  'every provisioned active connector targets a published programme'
);
select results_eq(
  $$
    select count(*)::bigint
    from loyalty.commerce_connections
    where external_store_id !~ '^https://'
  $$,
  array[0::bigint],
  'provisioned source-store identities remain HTTPS origins'
);

select * from finish();
rollback;
