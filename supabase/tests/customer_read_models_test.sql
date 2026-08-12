begin;

create extension if not exists pgtap with schema extensions;
select plan(33);

select has_function(
  'loyalty', 'list_customer_summaries', array['uuid', 'uuid', 'text'],
  'bounded exact customer summary read model exists'
);
select has_function(
  'loyalty', 'get_customer_read_model', array['uuid', 'uuid'],
  'exact customer detail read model exists'
);
select function_privs_are(
  'loyalty', 'list_customer_summaries', array['uuid', 'uuid', 'text'],
  'authenticated', array['EXECUTE'],
  'authenticated users can call the summary read model'
);
select function_privs_are(
  'loyalty', 'get_customer_read_model', array['uuid', 'uuid'],
  'authenticated', array['EXECUTE'],
  'authenticated users can call the detail read model'
);
select ok(
  not has_function_privilege(
    'anon', 'loyalty.list_customer_summaries(uuid,uuid,text)', 'EXECUTE'
  ),
  'anonymous users cannot enumerate customer summaries'
);
select ok(
  not has_function_privilege(
    'anon', 'loyalty.get_customer_read_model(uuid,uuid)', 'EXECUTE'
  ),
  'anonymous users cannot read customer detail'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'loyalty'
      and routine.proname in (
        'list_customer_summaries', 'get_customer_read_model'
      )
      and routine.prosecdef
      and routine.provolatile = 's'
      and exists (
        select 1 from unnest(routine.proconfig) as setting
        where setting = 'search_path=""'
      )
  $$,
  array[2::bigint],
  'customer read wrappers are stable security definer functions with empty search paths'
);
select has_index(
  'loyalty', 'customers', 'customers_organization_created_idx',
  'bounded newest-customer reads have a tenant/order index'
);

insert into loyalty.organizations (public_id, slug, name) values
  ('7b000000-0000-4000-8000-000000000100', 'customer-read-one', 'Customer Read One'),
  ('7c000000-0000-4000-8000-000000000100', 'customer-read-two', 'Customer Read Two');
insert into loyalty.organization_memberships (
  organization_id, user_id, role, revoked_at
) values
  ((select id from loyalty.organizations where slug = 'customer-read-one'), '7b000000-0000-4000-8000-000000000001', 'owner', null),
  ((select id from loyalty.organizations where slug = 'customer-read-one'), '7b000000-0000-4000-8000-000000000002', 'analyst', now()),
  ((select id from loyalty.organizations where slug = 'customer-read-two'), '7c000000-0000-4000-8000-000000000001', 'owner', null);
insert into loyalty.workspaces (public_id, organization_id, slug, name)
select case organization.slug
    when 'customer-read-one' then '7b000000-0000-4000-8000-000000000101'::uuid
    else '7c000000-0000-4000-8000-000000000101'::uuid
  end,
  organization.id, 'shop', organization.name || ' Shop'
from loyalty.organizations as organization
where organization.slug in ('customer-read-one', 'customer-read-two');
insert into loyalty.programme_groups (public_id, organization_id, slug, name)
select case organization.slug
    when 'customer-read-one' then '7b000000-0000-4000-8000-000000000110'::uuid
    else '7c000000-0000-4000-8000-000000000110'::uuid
  end,
  organization.id, 'rewards', organization.name || ' Rewards'
from loyalty.organizations as organization
where organization.slug in ('customer-read-one', 'customer-read-two');
insert into loyalty.commerce_connections (
  public_id, organization_id, workspace_id, external_store_id, display_name,
  current_key_version, signing_material_ref
)
select case organization.slug
    when 'customer-read-one' then '7b000000-0000-4000-8000-000000000120'::uuid
    else '7c000000-0000-4000-8000-000000000120'::uuid
  end,
  organization.id, workspace.id, organization.slug || '-store',
  organization.name || ' Store', 'v1', 'vault://' || organization.slug
from loyalty.organizations as organization
join loyalty.workspaces as workspace on workspace.organization_id = organization.id
where organization.slug in ('customer-read-one', 'customer-read-two');
insert into loyalty.programmes (
  public_id, organization_id, programme_group_id, slug, name, status
)
select case organization.slug
    when 'customer-read-one' then '7b000000-0000-4000-8000-000000000130'::uuid
    else '7c000000-0000-4000-8000-000000000130'::uuid
  end,
  organization.id, programme_group.id, 'rewards',
  organization.name || ' Rewards', 'active'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
where organization.slug in ('customer-read-one', 'customer-read-two');
insert into loyalty.programme_versions (
  public_id, organization_id, programme_group_id, programme_id,
  version_number, status, configuration, configuration_sha256,
  approved_by_user_id, published_at
)
select case organization.slug
    when 'customer-read-one' then '7b000000-0000-4000-8000-000000000140'::uuid
    else '7c000000-0000-4000-8000-000000000140'::uuid
  end,
  organization.id, programme_group.id, programme.id, 1, 'published',
  '{"currencyCode":"EUR","minorUnitsPerMajor":100,"tiers":[],"rewards":[]}'::jsonb,
  extensions.digest(convert_to(organization.slug, 'UTF8'), 'sha256'),
  case organization.slug
    when 'customer-read-one' then '7b000000-0000-4000-8000-000000000001'::uuid
    else '7c000000-0000-4000-8000-000000000001'::uuid
  end,
  '2026-08-01T00:00:00Z'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
join loyalty.programmes as programme
  on programme.organization_id = organization.id
where organization.slug in ('customer-read-one', 'customer-read-two');

insert into loyalty.customers (
  public_id, organization_id, display_reference, created_at, updated_at
)
select
  ('7b100000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  organization.id,
  case when number = 1 then 'Large % Member' else 'Member ' || number end,
  '2026-08-12T00:00:00Z'::timestamptz - number * interval '1 minute',
  '2026-08-12T00:00:00Z'::timestamptz - number * interval '1 minute'
from generate_series(1, 55) as generated(number)
cross join loyalty.organizations as organization
where organization.slug = 'customer-read-one';
insert into loyalty.customers (
  public_id, organization_id, display_reference, created_at, updated_at
)
select '7c100000-0000-4000-8000-000000000001', organization.id,
  'Other Tenant Member', '2026-08-12T00:00:00Z', '2026-08-12T00:00:00Z'
from loyalty.organizations as organization
where organization.slug = 'customer-read-two';
insert into loyalty.customer_identities (
  organization_id, customer_id, commerce_connection_id,
  external_customer_id, identity_kind, verified_at
)
select customer.organization_id, customer.id, connection.id,
  'registered:super-secret-9876', 'registered', '2026-08-12T00:00:00Z'
from loyalty.customers as customer
join loyalty.commerce_connections as connection
  on connection.organization_id = customer.organization_id
where customer.public_id = '7b100000-0000-4000-8000-000000000001';
insert into loyalty.wallets (
  public_id, organization_id, programme_group_id, customer_id
)
select '7b200000-0000-4000-8000-000000000001', customer.organization_id,
  programme_group.id, customer.id
from loyalty.customers as customer
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = customer.organization_id
where customer.public_id = '7b100000-0000-4000-8000-000000000001';
select loyalty_private.ensure_wallet_accounts(
  wallet.organization_id, wallet.programme_group_id, wallet.customer_id
)
from loyalty.wallets as wallet
where wallet.public_id = '7b200000-0000-4000-8000-000000000001';
select * from loyalty_private.award_points(
  (select id from loyalty.organizations where slug = 'customer-read-one'),
  (select id from loyalty.programme_groups where public_id = '7b000000-0000-4000-8000-000000000110'),
  (select id from loyalty.programme_versions where public_id = '7b000000-0000-4000-8000-000000000140'),
  (select id from loyalty.customers where public_id = '7b100000-0000-4000-8000-000000000001'),
  9007199254740993, 'customer-read:award',
  extensions.digest(convert_to('customer-read-award', 'UTF8'), 'sha256'),
  null, 'order-exact-1', '2026-08-12T01:00:00Z'
);

set local role authenticated;
set local request.jwt.claim.sub = '7b000000-0000-4000-8000-000000000001';

select results_eq(
  $$ select count(*)::bigint from loyalty.list_customer_summaries(
    '7b000000-0000-4000-8000-000000000100',
    '7b000000-0000-4000-8000-000000000110', null
  ) $$,
  array[50::bigint], 'summary reads have a fixed 50-row ceiling'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.list_customer_summaries(
    '7b000000-0000-4000-8000-000000000100',
    '7b000000-0000-4000-8000-000000000110', '%'
  ) $$,
  array[1::bigint], 'search treats wildcard characters as literal text'
);
select results_eq(
  $$ select pending_points from loyalty.list_customer_summaries(
    '7b000000-0000-4000-8000-000000000100',
    '7b000000-0000-4000-8000-000000000110', '%'
  ) $$,
  array['9007199254740993'::text], 'summary point values remain exact text beyond JavaScript safe integers'
);
select results_eq(
  $$ select masked_external_id from loyalty.list_customer_summaries(
    '7b000000-0000-4000-8000-000000000100',
    '7b000000-0000-4000-8000-000000000110', '%'
  ) $$,
  array[(repeat(chr(8226), 4) || '9876')::text], 'channel identity is masked inside PostgreSQL'
);
select is_empty(
  $$ select * from loyalty.list_customer_summaries(
    '7b000000-0000-4000-8000-000000000100',
    '7b000000-0000-4000-8000-000000000110', '%'
  ) where masked_external_id like '%secret%' $$,
  'raw channel identifiers do not leave the read model'
);
select results_eq(
  $$ select wallet_status from loyalty.list_customer_summaries(
    '7b000000-0000-4000-8000-000000000100',
    '7b000000-0000-4000-8000-000000000110', '%'
  ) $$,
  array['active'::text], 'summary returns the selected programme wallet state'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.get_customer_read_model(
    '7b100000-0000-4000-8000-000000000001',
    '7b000000-0000-4000-8000-000000000110'
  ) $$,
  array[1::bigint], 'authorized customer detail returns one row'
);
select results_eq(
  $$ select pending_points from loyalty.get_customer_read_model(
    '7b100000-0000-4000-8000-000000000001',
    '7b000000-0000-4000-8000-000000000110'
  ) $$,
  array['9007199254740993'::text], 'detail balance remains exact text'
);
select results_eq(
  $$ select available_points || ':' || reserved_points
     from loyalty.get_customer_read_model(
       '7b100000-0000-4000-8000-000000000001',
       '7b000000-0000-4000-8000-000000000110'
     ) $$,
  array['0:0'::text], 'missing balance buckets are explicit exact zeros'
);
select results_eq(
  $$ select jsonb_array_length(ledger_items)
     from loyalty.get_customer_read_model(
       '7b100000-0000-4000-8000-000000000001',
       '7b000000-0000-4000-8000-000000000110'
     ) $$,
  array[1], 'detail ledger contains only the customer wallet entry'
);
select results_eq(
  $$ select ledger_items -> 0 ->> 'points'
     from loyalty.get_customer_read_model(
       '7b100000-0000-4000-8000-000000000001',
       '7b000000-0000-4000-8000-000000000110'
     ) $$,
  array['9007199254740993'::text], 'ledger entry points remain exact text'
);
select results_eq(
  $$ select ledger_items -> 0 ->> 'kind'
     from loyalty.get_customer_read_model(
       '7b100000-0000-4000-8000-000000000001',
       '7b000000-0000-4000-8000-000000000110'
     ) $$,
  array['award'::text], 'ledger history retains attributable transaction kind'
);
select ok(
  (
    select not (ledger_items -> 0 ?| array['metadata', 'reason', 'actorId', 'requestSha256'])
    from loyalty.get_customer_read_model(
      '7b100000-0000-4000-8000-000000000001',
      '7b000000-0000-4000-8000-000000000110'
    )
  ),
  'ledger history omits private command evidence'
);
select results_eq(
  $$ select pending_points || ':' || available_points || ':' || reserved_points
     from loyalty.list_customer_summaries(
       '7b000000-0000-4000-8000-000000000100', null, '%'
     ) $$,
  array['0:0:0'::text], 'summary without a programme group invents no wallet value'
);
select results_eq(
  $$ select pending_points || ':' || jsonb_array_length(ledger_items)
     from loyalty.get_customer_read_model(
       '7b100000-0000-4000-8000-000000000001', null
     ) $$,
  array['0:0'::text], 'detail without a programme group returns an honest empty wallet'
);
select is_empty(
  $$ select * from loyalty.get_customer_read_model(
    '7c100000-0000-4000-8000-000000000001',
    '7c000000-0000-4000-8000-000000000110'
  ) $$,
  'one tenant cannot read another customer detail'
);
select is_empty(
  $$ select * from loyalty.list_customer_summaries(
    '7b000000-0000-4000-8000-000000000100',
    '7c000000-0000-4000-8000-000000000110', null
  ) $$,
  'a foreign programme group fails closed'
);
select throws_ok(
  $$ select * from loyalty.list_customer_summaries(
    '7b000000-0000-4000-8000-000000000100',
    '7b000000-0000-4000-8000-000000000110', repeat('x', 101)
  ) $$,
  '22023', 'invalid customer search request',
  'overlong direct RPC search is rejected'
);
select throws_ok(
  $$ select * from loyalty.list_customer_summaries(
    '7b000000-0000-4000-8000-000000000100',
    '7b000000-0000-4000-8000-000000000110', 'line' || chr(10) || 'break'
  ) $$,
  '22023', 'invalid customer search request',
  'control characters in a direct RPC search are rejected'
);

set local request.jwt.claim.sub = '7b000000-0000-4000-8000-000000000002';
select is_empty(
  $$ select * from loyalty.list_customer_summaries(
    '7b000000-0000-4000-8000-000000000100',
    '7b000000-0000-4000-8000-000000000110', null
  ) $$,
  'revoked users cannot enumerate customers'
);
select is_empty(
  $$ select * from loyalty.get_customer_read_model(
    '7b100000-0000-4000-8000-000000000001',
    '7b000000-0000-4000-8000-000000000110'
  ) $$,
  'revoked users cannot read customer detail'
);

set local request.jwt.claim.sub = '7c000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select count(*)::bigint from loyalty.list_customer_summaries(
    '7c000000-0000-4000-8000-000000000100',
    '7c000000-0000-4000-8000-000000000110', null
  ) $$,
  array[1::bigint], 'another tenant can read its own customer summary'
);
select is_empty(
  $$ select * from loyalty.list_customer_summaries(
    '7b000000-0000-4000-8000-000000000100',
    '7b000000-0000-4000-8000-000000000110', null
  ) $$,
  'another tenant cannot enumerate the populated organization'
);
select is_empty(
  $$ select * from loyalty.get_customer_read_model(
    '7b100000-0000-4000-8000-000000000001',
    '7b000000-0000-4000-8000-000000000110'
  ) $$,
  'another tenant cannot read the populated customer detail'
);

reset role;
select results_eq(
  $$ select count(*)::bigint from loyalty.admin_audit_events
     where organization_id in (
       select id from loyalty.organizations
       where slug in ('customer-read-one', 'customer-read-two')
     ) $$,
  array[0::bigint], 'read models append no mutation audit evidence'
);

select * from finish();
rollback;
