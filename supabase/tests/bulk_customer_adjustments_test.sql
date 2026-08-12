begin;

create extension if not exists pgtap with schema extensions;

select plan(39);

select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.preview_bulk_customer_adjustment(uuid[],uuid,uuid,bigint,text,timestamp with time zone)',
    'EXECUTE'
  ),
  'authenticated users can enter the guarded bulk preview'
);
select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.execute_bulk_customer_adjustment(uuid[],uuid,uuid,bigint,text,timestamp with time zone,text,text,uuid)',
    'EXECUTE'
  ),
  'authenticated users can enter the guarded bulk command'
);
select ok(
  not has_function_privilege(
    'anon',
    'loyalty.execute_bulk_customer_adjustment(uuid[],uuid,uuid,bigint,text,timestamp with time zone,text,text,uuid)',
    'EXECUTE'
  ),
  'anonymous users cannot enter bulk commands'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'loyalty'
      and routine.proname in (
        'preview_bulk_customer_adjustment',
        'execute_bulk_customer_adjustment'
      )
      and routine.prosecdef
      and exists (
        select 1 from unnest(routine.proconfig) as setting
        where setting = 'search_path=""'
      )
  $$,
  array[2::bigint],
  'both bulk wrappers are security definer with empty search paths'
);
select has_table('loyalty', 'bulk_adjustment_batches', 'bulk batch evidence exists');
select has_table('loyalty', 'bulk_adjustment_items', 'bulk item evidence exists');
select ok(
  not has_table_privilege('authenticated', 'loyalty.bulk_adjustment_batches', 'INSERT'),
  'authenticated users cannot forge batch evidence'
);
select ok(
  not has_table_privilege('authenticated', 'loyalty.bulk_adjustment_items', 'INSERT'),
  'authenticated users cannot forge item evidence'
);

insert into auth.users (id, email)
values
  ('77000000-0000-4000-8000-000000000001', 'bulk-owner@example.test'),
  ('77000000-0000-4000-8000-000000000002', 'bulk-admin@example.test'),
  ('77000000-0000-4000-8000-000000000003', 'bulk-operator@example.test'),
  ('77000000-0000-4000-8000-000000000004', 'bulk-auditor@example.test'),
  ('77000000-0000-4000-8000-000000000005', 'bulk-revoked@example.test'),
  ('78000000-0000-4000-8000-000000000001', 'bulk-other@example.test');

insert into loyalty.organizations (public_id, slug, name)
values
  ('77000000-0000-4000-8000-000000000100', 'bulk-one', 'Bulk One'),
  ('78000000-0000-4000-8000-000000000100', 'bulk-two', 'Bulk Two');

insert into loyalty.organization_memberships (organization_id, user_id, role, revoked_at)
values
  ((select id from loyalty.organizations where slug = 'bulk-one'), '77000000-0000-4000-8000-000000000001', 'owner', null),
  ((select id from loyalty.organizations where slug = 'bulk-one'), '77000000-0000-4000-8000-000000000002', 'admin', null),
  ((select id from loyalty.organizations where slug = 'bulk-one'), '77000000-0000-4000-8000-000000000003', 'operator', null),
  ((select id from loyalty.organizations where slug = 'bulk-one'), '77000000-0000-4000-8000-000000000004', 'auditor', null),
  ((select id from loyalty.organizations where slug = 'bulk-one'), '77000000-0000-4000-8000-000000000005', 'admin', now()),
  ((select id from loyalty.organizations where slug = 'bulk-two'), '78000000-0000-4000-8000-000000000001', 'owner', null);

insert into loyalty.programme_groups (public_id, organization_id, slug, name)
select
  case organization.slug
    when 'bulk-one' then '77000000-0000-4000-8000-000000000110'::uuid
    else '78000000-0000-4000-8000-000000000110'::uuid
  end,
  organization.id, 'rewards', organization.name || ' Rewards'
from loyalty.organizations as organization
where organization.slug in ('bulk-one', 'bulk-two');

insert into loyalty.programmes (
  public_id, organization_id, programme_group_id, slug, name, status
)
select
  case organization.slug
    when 'bulk-one' then '77000000-0000-4000-8000-000000000120'::uuid
    else '78000000-0000-4000-8000-000000000120'::uuid
  end,
  organization.id, programme_group.id, 'rewards', organization.name || ' Rewards', 'active'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
where organization.slug in ('bulk-one', 'bulk-two');

insert into loyalty.programme_versions (
  public_id, organization_id, programme_group_id, programme_id,
  version_number, status, configuration, configuration_sha256,
  approved_by_user_id, published_at
)
select
  case organization.slug
    when 'bulk-one' then '77000000-0000-4000-8000-000000000130'::uuid
    else '78000000-0000-4000-8000-000000000130'::uuid
  end,
  organization.id, programme_group.id, programme.id, 1, 'published',
  '{"version":"1","tiers":[],"rewards":[]}'::jsonb,
  extensions.digest(convert_to('{}', 'UTF8'), 'sha256'),
  case organization.slug
    when 'bulk-one' then '77000000-0000-4000-8000-000000000001'::uuid
    else '78000000-0000-4000-8000-000000000001'::uuid
  end,
  now() - interval '1 day'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
join loyalty.programmes as programme
  on programme.organization_id = organization.id
where organization.slug in ('bulk-one', 'bulk-two');

insert into loyalty.customers (public_id, organization_id, display_reference, status)
values
  ('77000000-0000-4000-8000-000000000141', (select id from loyalty.organizations where slug = 'bulk-one'), 'Customer A', 'active'),
  ('77000000-0000-4000-8000-000000000142', (select id from loyalty.organizations where slug = 'bulk-one'), 'Customer B', 'active'),
  ('78000000-0000-4000-8000-000000000141', (select id from loyalty.organizations where slug = 'bulk-two'), 'Other Customer', 'active');

insert into loyalty.wallets (public_id, organization_id, programme_group_id, customer_id, status)
select
  case customer.public_id
    when '77000000-0000-4000-8000-000000000141' then '77000000-0000-4000-8000-000000000151'::uuid
    when '77000000-0000-4000-8000-000000000142' then '77000000-0000-4000-8000-000000000152'::uuid
    else '78000000-0000-4000-8000-000000000151'::uuid
  end,
  customer.organization_id, programme_group.id, customer.id, 'active'
from loyalty.customers as customer
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = customer.organization_id
where customer.public_id in (
  '77000000-0000-4000-8000-000000000141',
  '77000000-0000-4000-8000-000000000142',
  '78000000-0000-4000-8000-000000000141'
);

select loyalty_private.ensure_wallet_accounts(
  wallet.organization_id, wallet.programme_group_id, wallet.customer_id
)
from loyalty.wallets as wallet
where wallet.public_id in (
  '77000000-0000-4000-8000-000000000151',
  '77000000-0000-4000-8000-000000000152',
  '78000000-0000-4000-8000-000000000151'
);

select adjustment.*
from loyalty.wallets as wallet
cross join lateral loyalty_private.adjust_points(
  (select id from loyalty.organizations where slug = 'bulk-one'),
  wallet.public_id,
  (select id from loyalty.programme_versions where public_id = '77000000-0000-4000-8000-000000000130'),
  case wallet.public_id
    when '77000000-0000-4000-8000-000000000151' then 1000
    else 500
  end,
  'Initial bulk test balance', 'test-fixture',
  'bulk:fixture:' || wallet.public_id::text,
  extensions.digest(convert_to(wallet.public_id::text, 'UTF8'), 'sha256'),
  now() + interval '2 years', now()
) as adjustment
where wallet.public_id in (
  '77000000-0000-4000-8000-000000000151',
  '77000000-0000-4000-8000-000000000152'
);

create temporary table saved_bulk_previews (
  name text primary key,
  preview_sha256 text not null
);
grant select, insert on saved_bulk_previews to authenticated;

set local role authenticated;
set local request.jwt.claim.sub = '77000000-0000-4000-8000-000000000001';

select results_eq(
  $$ select customer_count from loyalty.preview_bulk_customer_adjustment(
    array['77000000-0000-4000-8000-000000000142'::uuid, '77000000-0000-4000-8000-000000000141'::uuid],
    '77000000-0000-4000-8000-000000000110',
    '77000000-0000-4000-8000-000000000130',
    50, 'Approved bulk service recovery', now() + interval '1 year'
  ) $$,
  array[2],
  'preview resolves the exact customer count'
);
select results_eq(
  $$ select total_points from loyalty.preview_bulk_customer_adjustment(
    array['77000000-0000-4000-8000-000000000141'::uuid, '77000000-0000-4000-8000-000000000142'::uuid],
    '77000000-0000-4000-8000-000000000110',
    '77000000-0000-4000-8000-000000000130',
    50, 'Approved bulk service recovery', '2028-08-12T00:00:00Z'
  ) $$,
  array['100'::text],
  'preview calculates an exact integer total'
);
select results_eq(
  $$ select string_agg(item ->> 'customerId', ',' order by ordinal)
     from loyalty.preview_bulk_customer_adjustment(
       array['77000000-0000-4000-8000-000000000142'::uuid, '77000000-0000-4000-8000-000000000141'::uuid],
       '77000000-0000-4000-8000-000000000110',
       '77000000-0000-4000-8000-000000000130',
       50, 'Approved bulk service recovery', '2028-08-12T00:00:00Z'
     ) as preview,
     jsonb_array_elements(preview.items) with ordinality as entry(item, ordinal) $$,
  array['77000000-0000-4000-8000-000000000141,77000000-0000-4000-8000-000000000142'::text],
  'preview canonicalizes item order independently of input order'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.bulk_adjustment_batches $$,
  array[0::bigint],
  'preview is read-only'
);
select results_eq(
  $$ select item ->> 'projectedAvailablePoints'
     from loyalty.preview_bulk_customer_adjustment(
       array['77000000-0000-4000-8000-000000000141'::uuid, '77000000-0000-4000-8000-000000000142'::uuid],
       '77000000-0000-4000-8000-000000000110',
       '77000000-0000-4000-8000-000000000130',
       50, 'Approved bulk service recovery', '2028-08-12T00:00:00Z'
     ) as preview,
     jsonb_array_elements(preview.items) as entry(item)
     order by item ->> 'customerId' $$,
  $$ values ('1050'::text), ('550'::text) $$,
  'preview exposes exact projected balances'
);

insert into saved_bulk_previews (name, preview_sha256)
select 'main', preview_sha256
from loyalty.preview_bulk_customer_adjustment(
  array['77000000-0000-4000-8000-000000000141'::uuid, '77000000-0000-4000-8000-000000000142'::uuid],
  '77000000-0000-4000-8000-000000000110',
  '77000000-0000-4000-8000-000000000130',
  50, 'Approved bulk service recovery', '2028-08-12T00:00:00Z'
);

select results_eq(
  $$ select outcome from loyalty.execute_bulk_customer_adjustment(
    array['77000000-0000-4000-8000-000000000141'::uuid, '77000000-0000-4000-8000-000000000142'::uuid],
    '77000000-0000-4000-8000-000000000110',
    '77000000-0000-4000-8000-000000000130',
    50, 'Approved bulk service recovery', '2028-08-12T00:00:00Z',
    (select preview_sha256 from saved_bulk_previews where name = 'main'),
    'bulk:adjust:main', '77000000-0000-4000-8000-000000000201'
  ) $$,
  array['created'::text],
  'owner executes the approved preview'
);
select results_eq(
  $$ select balance.points
     from loyalty.wallet_balances as balance
     join loyalty.wallets as wallet on wallet.id = balance.wallet_id
     where wallet.public_id in (
       '77000000-0000-4000-8000-000000000151',
       '77000000-0000-4000-8000-000000000152'
     ) and balance.account_kind = 'available'
     order by wallet.public_id $$,
  $$ values (1050::bigint), (550::bigint) $$,
  'execution updates both projections only through ledger effects'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_transactions
     where idempotency_key like 'bulk:adjust:main:%' $$,
  array[2::bigint],
  'execution creates one ledger transaction per customer'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.bulk_adjustment_items $$,
  array[2::bigint],
  'execution records one immutable item per customer'
);
select is_empty(
  $$ select transaction.id
     from loyalty.ledger_transactions as transaction
     join loyalty.ledger_entries as entry on entry.transaction_id = transaction.id
     where transaction.idempotency_key like 'bulk:adjust:main:%'
     group by transaction.id
     having sum(entry.points) <> 0 $$,
  'every bulk ledger transaction is zero sum'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.point_lots as lot
     join loyalty.ledger_entries as entry on entry.id = lot.credit_entry_id
     join loyalty.ledger_transactions as transaction on transaction.id = entry.transaction_id
     where transaction.idempotency_key like 'bulk:adjust:main:%' $$,
  array[2::bigint],
  'positive bulk adjustments create attributed expiry lots'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.admin_audit_events
     where idempotency_key = 'bulk:adjust:main' $$,
  array[1::bigint],
  'execution appends one batch administration audit event'
);
select results_eq(
  $$ select actor_user_id from loyalty.bulk_adjustment_batches
     where idempotency_key = 'bulk:adjust:main' $$,
  array['77000000-0000-4000-8000-000000000001'::uuid],
  'batch actor is derived from the Auth subject'
);
select results_eq(
  $$ select outcome from loyalty.execute_bulk_customer_adjustment(
    array['77000000-0000-4000-8000-000000000142'::uuid, '77000000-0000-4000-8000-000000000141'::uuid],
    '77000000-0000-4000-8000-000000000110',
    '77000000-0000-4000-8000-000000000130',
    50, 'Approved bulk service recovery', '2028-08-12T00:00:00Z',
    (select preview_sha256 from saved_bulk_previews where name = 'main'),
    'bulk:adjust:main', '77000000-0000-4000-8000-000000000202'
  ) $$,
  array['duplicate'::text],
  'exact retry succeeds after balances have changed'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.bulk_adjustment_batches $$,
  array[1::bigint],
  'exact retry creates no second batch or effects'
);
select throws_ok(
  $$ select * from loyalty.execute_bulk_customer_adjustment(
    array['77000000-0000-4000-8000-000000000141'::uuid, '77000000-0000-4000-8000-000000000142'::uuid],
    '77000000-0000-4000-8000-000000000110',
    '77000000-0000-4000-8000-000000000130',
    51, 'Approved bulk service recovery', '2028-08-12T00:00:00Z',
    (select preview_sha256 from saved_bulk_previews where name = 'main'),
    'bulk:adjust:main', '77000000-0000-4000-8000-000000000203'
  ) $$,
  '23514', 'bulk adjustment idempotency conflict',
  'changed command conflicts under one idempotency key'
);

insert into saved_bulk_previews (name, preview_sha256)
select 'stale', preview_sha256
from loyalty.preview_bulk_customer_adjustment(
  array['77000000-0000-4000-8000-000000000141'::uuid, '77000000-0000-4000-8000-000000000142'::uuid],
  '77000000-0000-4000-8000-000000000110',
  '77000000-0000-4000-8000-000000000130',
  -25, 'Approved bulk correction debit', null
);
select * from loyalty.adjust_customer_points_command(
  '77000000-0000-4000-8000-000000000141',
  '77000000-0000-4000-8000-000000000110',
  '77000000-0000-4000-8000-000000000130',
  -1, 'Intervening approved correction', null, null,
  'bulk:stale:intervening', '77000000-0000-4000-8000-000000000204'
);
select throws_ok(
  $$ select * from loyalty.execute_bulk_customer_adjustment(
    array['77000000-0000-4000-8000-000000000141'::uuid, '77000000-0000-4000-8000-000000000142'::uuid],
    '77000000-0000-4000-8000-000000000110',
    '77000000-0000-4000-8000-000000000130',
    -25, 'Approved bulk correction debit', null,
    (select preview_sha256 from saved_bulk_previews where name = 'stale'),
    'bulk:adjust:stale', '77000000-0000-4000-8000-000000000205'
  ) $$,
  '23514', 'bulk adjustment preview is stale',
  'an intervening balance change invalidates an unexecuted preview'
);
select throws_ok(
  $$ select * from loyalty.preview_bulk_customer_adjustment(
    array['77000000-0000-4000-8000-000000000141'::uuid, '77000000-0000-4000-8000-000000000141'::uuid],
    '77000000-0000-4000-8000-000000000110',
    '77000000-0000-4000-8000-000000000130',
    -10, 'Approved duplicate test debit', null
  ) $$,
  '22023', 'invalid bulk adjustment preview',
  'duplicate customer IDs fail closed'
);
select throws_ok(
  $$ select * from loyalty.preview_bulk_customer_adjustment(
    array['77000000-0000-4000-8000-000000000141'::uuid],
    '77000000-0000-4000-8000-000000000110',
    '77000000-0000-4000-8000-000000000130',
    -10, 'Approved undersized test debit', null
  ) $$,
  '22023', 'invalid bulk adjustment preview',
  'a one-customer request is not a bulk command'
);
select throws_ok(
  $$ select * from loyalty.preview_bulk_customer_adjustment(
    array['77000000-0000-4000-8000-000000000141'::uuid, '77000000-0000-4000-8000-000000000199'::uuid],
    '77000000-0000-4000-8000-000000000110',
    '77000000-0000-4000-8000-000000000130',
    -10, 'Approved missing customer debit', null
  ) $$,
  '22023', 'bulk adjustment customer set changed',
  'missing customers fail closed without partial effects'
);
select throws_ok(
  $$ select * from loyalty.preview_bulk_customer_adjustment(
    array['77000000-0000-4000-8000-000000000141'::uuid, '78000000-0000-4000-8000-000000000141'::uuid],
    '77000000-0000-4000-8000-000000000110',
    '77000000-0000-4000-8000-000000000130',
    -10, 'Approved tenant boundary debit', null
  ) $$,
  '22023', 'bulk adjustment customer set changed',
  'mixed-tenant customer sets fail closed'
);

set local request.jwt.claim.sub = '77000000-0000-4000-8000-000000000003';
select throws_ok(
  $$ select * from loyalty.preview_bulk_customer_adjustment(
    array['77000000-0000-4000-8000-000000000141'::uuid, '77000000-0000-4000-8000-000000000142'::uuid],
    '77000000-0000-4000-8000-000000000110',
    '77000000-0000-4000-8000-000000000130',
    -10, 'Operator requested bulk debit', null
  ) $$,
  '42501', 'bulk adjustment not authorized',
  'operator cannot preview value changes'
);
set local request.jwt.claim.sub = '77000000-0000-4000-8000-000000000004';
select throws_ok(
  $$ select * from loyalty.preview_bulk_customer_adjustment(
    array['77000000-0000-4000-8000-000000000141'::uuid, '77000000-0000-4000-8000-000000000142'::uuid],
    '77000000-0000-4000-8000-000000000110',
    '77000000-0000-4000-8000-000000000130',
    -10, 'Auditor requested bulk debit', null
  ) $$,
  '42501', 'bulk adjustment not authorized',
  'auditor remains read-only'
);
set local request.jwt.claim.sub = '77000000-0000-4000-8000-000000000005';
select throws_ok(
  $$ select * from loyalty.preview_bulk_customer_adjustment(
    array['77000000-0000-4000-8000-000000000141'::uuid, '77000000-0000-4000-8000-000000000142'::uuid],
    '77000000-0000-4000-8000-000000000110',
    '77000000-0000-4000-8000-000000000130',
    -10, 'Revoked admin bulk debit', null
  ) $$,
  '42501', 'bulk adjustment not authorized',
  'revoked admin fails closed'
);
set local request.jwt.claim.sub = '78000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select * from loyalty.preview_bulk_customer_adjustment(
    array['77000000-0000-4000-8000-000000000141'::uuid, '77000000-0000-4000-8000-000000000142'::uuid],
    '77000000-0000-4000-8000-000000000110',
    '77000000-0000-4000-8000-000000000130',
    -10, 'Other tenant requested bulk debit', null
  ) $$,
  '42501', 'bulk adjustment not authorized',
  'another tenant owner cannot preview this batch'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.bulk_adjustment_batches $$,
  array[0::bigint],
  'batch evidence is tenant isolated by RLS'
);

reset role;
select throws_ok(
  $$ update loyalty.bulk_adjustment_batches set reason = 'rewritten evidence'
     where idempotency_key = 'bulk:adjust:main' $$,
  '55000', 'immutable loyalty history cannot be changed',
  'batch evidence cannot be rewritten'
);
select throws_ok(
  $$ update loyalty.bulk_adjustment_items set available_points_after = 0 $$,
  '55000', 'immutable loyalty history cannot be changed',
  'batch item evidence cannot be rewritten'
);
select is_empty(
  $$ select * from loyalty_private.wallet_projection_differences(
    (select id from loyalty.organizations where slug = 'bulk-one')
  ) $$,
  'bulk sequence leaves wallet projections rebuildable'
);
select is_empty(
  $$ select * from loyalty_private.point_lot_projection_differences(
    (select id from loyalty.organizations where slug = 'bulk-one')
  ) $$,
  'bulk sequence leaves lot projections rebuildable'
);
select results_eq(
  $$ select metadata ->> 'customerCount' from loyalty.admin_audit_events
     where idempotency_key = 'bulk:adjust:main' $$,
  array['2'::text],
  'batch audit records aggregate scope without duplicating customer identifiers'
);

select * from finish();
rollback;
