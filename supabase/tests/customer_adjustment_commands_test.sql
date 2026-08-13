begin;

create extension if not exists pgtap with schema extensions;

select plan(36);

select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.get_customer_adjustment_context(uuid,uuid)', 'EXECUTE'
  ),
  'authenticated users can enter the guarded adjustment context read'
);
select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.adjust_customer_points_command(uuid,uuid,uuid,bigint,text,text,timestamp with time zone,text,uuid)',
    'EXECUTE'
  ),
  'authenticated users can enter the guarded adjustment command'
);
select ok(
  not has_function_privilege(
    'anon',
    'loyalty.adjust_customer_points_command(uuid,uuid,uuid,bigint,text,text,timestamp with time zone,text,uuid)',
    'EXECUTE'
  ),
  'anonymous users cannot enter adjustment commands'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'loyalty'
      and routine.proname in (
        'get_customer_adjustment_context',
        'adjust_customer_points_command'
      )
      and routine.prosecdef
      and exists (
        select 1 from unnest(routine.proconfig) as setting
        where setting = 'search_path=""'
      )
  $$,
  array[2::bigint],
  'both adjustment wrappers are security definer with empty search paths'
);

insert into auth.users (id, email)
values
  ('75000000-0000-4000-8000-000000000001', 'adjust-owner@example.test'),
  ('75000000-0000-4000-8000-000000000002', 'adjust-admin@example.test'),
  ('75000000-0000-4000-8000-000000000003', 'adjust-operator@example.test'),
  ('75000000-0000-4000-8000-000000000004', 'adjust-analyst@example.test'),
  ('75000000-0000-4000-8000-000000000005', 'adjust-auditor@example.test'),
  ('75000000-0000-4000-8000-000000000006', 'adjust-revoked@example.test'),
  ('76000000-0000-4000-8000-000000000001', 'adjust-other@example.test');
insert into loyalty.organizations (public_id, slug, name)
values
  ('75000000-0000-4000-8000-000000000100', 'adjust-one', 'Adjustment One'),
  ('76000000-0000-4000-8000-000000000100', 'adjust-two', 'Adjustment Two');
insert into loyalty.organization_memberships (
  organization_id, user_id, role, revoked_at
)
values
  ((select id from loyalty.organizations where slug = 'adjust-one'), '75000000-0000-4000-8000-000000000001', 'owner', null),
  ((select id from loyalty.organizations where slug = 'adjust-one'), '75000000-0000-4000-8000-000000000002', 'admin', null),
  ((select id from loyalty.organizations where slug = 'adjust-one'), '75000000-0000-4000-8000-000000000003', 'operator', null),
  ((select id from loyalty.organizations where slug = 'adjust-one'), '75000000-0000-4000-8000-000000000004', 'analyst', null),
  ((select id from loyalty.organizations where slug = 'adjust-one'), '75000000-0000-4000-8000-000000000005', 'auditor', null),
  ((select id from loyalty.organizations where slug = 'adjust-one'), '75000000-0000-4000-8000-000000000006', 'admin', now()),
  ((select id from loyalty.organizations where slug = 'adjust-two'), '76000000-0000-4000-8000-000000000001', 'owner', null);
insert into loyalty.programme_groups (public_id, organization_id, slug, name)
select
  case organization.slug
    when 'adjust-one' then '75000000-0000-4000-8000-000000000110'::uuid
    else '76000000-0000-4000-8000-000000000110'::uuid
  end,
  organization.id, 'rewards', organization.name || ' Rewards'
from loyalty.organizations as organization
where organization.slug in ('adjust-one', 'adjust-two');
insert into loyalty.programmes (
  public_id, organization_id, programme_group_id, slug, name, status
)
select
  case organization.slug
    when 'adjust-one' then '75000000-0000-4000-8000-000000000120'::uuid
    else '76000000-0000-4000-8000-000000000120'::uuid
  end,
  organization.id, programme_group.id, 'rewards',
  organization.name || ' Rewards', 'active'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
where organization.slug in ('adjust-one', 'adjust-two');
insert into loyalty.programme_versions (
  public_id, organization_id, programme_group_id, programme_id,
  version_number, status, configuration, configuration_sha256,
  approved_by_user_id, published_at
)
select
  case organization.slug
    when 'adjust-one' then '75000000-0000-4000-8000-000000000130'::uuid
    else '76000000-0000-4000-8000-000000000130'::uuid
  end,
  organization.id, programme_group.id, programme.id, 1, 'published',
  '{"version":"1","tiers":[],"rewards":[]}'::jsonb,
  extensions.digest(convert_to('{}', 'UTF8'), 'sha256'),
  case organization.slug
    when 'adjust-one' then '75000000-0000-4000-8000-000000000001'::uuid
    else '76000000-0000-4000-8000-000000000001'::uuid
  end,
  now() - interval '1 day'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
join loyalty.programmes as programme
  on programme.organization_id = organization.id
where organization.slug in ('adjust-one', 'adjust-two');
insert into loyalty.customers (
  public_id, organization_id, display_reference, status
)
select
  case organization.slug
    when 'adjust-one' then '75000000-0000-4000-8000-000000000140'::uuid
    else '76000000-0000-4000-8000-000000000140'::uuid
  end,
  organization.id, organization.name || ' Customer', 'active'
from loyalty.organizations as organization
where organization.slug in ('adjust-one', 'adjust-two');
insert into loyalty.wallets (
  public_id, organization_id, programme_group_id, customer_id, status
)
select
  case organization.slug
    when 'adjust-one' then '75000000-0000-4000-8000-000000000150'::uuid
    else '76000000-0000-4000-8000-000000000150'::uuid
  end,
  organization.id, programme_group.id, customer.id, 'active'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
join loyalty.customers as customer
  on customer.organization_id = organization.id
where organization.slug in ('adjust-one', 'adjust-two');
select loyalty_private.ensure_wallet_accounts(
  wallet.organization_id, wallet.programme_group_id, wallet.customer_id
)
from loyalty.wallets as wallet;
select * from loyalty_private.adjust_points(
  (select id from loyalty.organizations where slug = 'adjust-one'),
  '75000000-0000-4000-8000-000000000150',
  (select id from loyalty.programme_versions where public_id = '75000000-0000-4000-8000-000000000130'),
  1000, 'Initial test fixture balance', 'test-fixture',
  'adjustment:fixture:initial', extensions.digest(convert_to('initial', 'UTF8'), 'sha256'),
  now() + interval '1 year', now()
);

set local role authenticated;
set local request.jwt.claim.sub = '75000000-0000-4000-8000-000000000001';

select results_eq(
  $$ select available_points from loyalty.get_customer_adjustment_context(
    '75000000-0000-4000-8000-000000000140',
    '75000000-0000-4000-8000-000000000110'
  ) $$,
  array['1000'::text],
  'owner receives exact text-form available balance for preview'
);
select is_empty(
  $$ select * from loyalty.get_customer_adjustment_context(
    '76000000-0000-4000-8000-000000000140',
    '76000000-0000-4000-8000-000000000110'
  ) $$,
  'adjustment context cannot cross tenant boundaries'
);
select results_eq(
  $$ select outcome from loyalty.adjust_customer_points_command(
    '75000000-0000-4000-8000-000000000140',
    '75000000-0000-4000-8000-000000000110',
    '75000000-0000-4000-8000-000000000130',
    200, 'Approved service recovery credit', 'Ticket CS-1042',
    now() + interval '1 year', 'customer:adjust:positive',
    '75000000-0000-4000-8000-000000000201'
  ) $$,
  array['created'::text],
  'owner creates a positive immutable adjustment'
);
select results_eq(
  $$ select available_points from loyalty.adjust_customer_points_command(
    '75000000-0000-4000-8000-000000000140',
    '75000000-0000-4000-8000-000000000110',
    '75000000-0000-4000-8000-000000000130',
    200, 'Approved service recovery credit', 'Ticket CS-1042',
    now() + interval '1 year', 'customer:adjust:positive:second',
    '75000000-0000-4000-8000-000000000202'
  ) $$,
  array['1400'::text],
  'adjustment result returns the exact authoritative balance'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_transactions
     where transaction_kind = 'manual_adjustment'
       and idempotency_key = 'customer:adjust:positive' $$,
  array[1::bigint],
  'merchant adjustment creates one ledger transaction'
);
select results_eq(
  $$ select actor_id from loyalty.ledger_transactions
     where idempotency_key = 'customer:adjust:positive' $$,
  array['75000000-0000-4000-8000-000000000001'::text],
  'ledger actor is derived from the Auth subject'
);
select results_eq(
  $$ select reason from loyalty.ledger_transactions
     where idempotency_key = 'customer:adjust:positive' $$,
  array['Approved service recovery credit'::text],
  'ledger retains the required adjustment reason'
);
select results_eq(
  $$ select sum(entry.points)::bigint
     from loyalty.ledger_entries as entry
     join loyalty.ledger_transactions as transaction on transaction.id = entry.transaction_id
     where transaction.idempotency_key = 'customer:adjust:positive' $$,
  array[0::bigint],
  'adjustment ledger entries remain zero sum'
);
select results_eq(
  $$ select initial_points from loyalty.point_lots as lot
     join loyalty.ledger_entries as entry on entry.id = lot.credit_entry_id
     join loyalty.ledger_transactions as transaction on transaction.id = entry.transaction_id
     where transaction.idempotency_key = 'customer:adjust:positive' $$,
  array[200::bigint],
  'positive adjustment creates an attributed expiry lot'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.admin_audit_events
     where idempotency_key = 'customer:adjust:positive' $$,
  array[1::bigint],
  'adjustment appends one administration audit event'
);
select results_eq(
  $$ select metadata ->> 'internalNote' from loyalty.admin_audit_events
     where idempotency_key = 'customer:adjust:positive' $$,
  array['Ticket CS-1042'::text],
  'audit evidence retains the optional internal note'
);
select results_eq(
  $$ select metadata ->> 'ledgerCorrelationId' from loyalty.admin_audit_events
     where idempotency_key = 'customer:adjust:positive' $$,
  array[(select correlation_id::text from loyalty.ledger_transactions
         where idempotency_key = 'customer:adjust:positive')],
  'audit evidence links the immutable ledger correlation'
);

select results_eq(
  $$ select outcome from loyalty.adjust_customer_points_command(
    '75000000-0000-4000-8000-000000000140',
    '75000000-0000-4000-8000-000000000110',
    '75000000-0000-4000-8000-000000000130',
    -300, 'Approved customer correction debit', null, null,
    'customer:adjust:negative', '75000000-0000-4000-8000-000000000203'
  ) $$,
  array['created'::text],
  'owner creates a compensating negative adjustment'
);
select results_eq(
  $$ select points from loyalty.wallet_balances
     where organization_id = (select id from loyalty.organizations where slug = 'adjust-one')
       and wallet_id = (select id from loyalty.wallets where public_id = '75000000-0000-4000-8000-000000000150')
       and account_kind = 'available' $$,
  array[1100::bigint],
  'negative adjustment changes only the rebuildable balance through ledger entries'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.redemption_allocations as allocation
     join loyalty.ledger_transactions as transaction on transaction.id = allocation.transaction_id
     where transaction.idempotency_key = 'customer:adjust:negative'
       and allocation.allocation_kind = 'adjustment' $$,
  array[1::bigint],
  'negative adjustment consumes available lots in FIFO order'
);

select results_eq(
  $$ select outcome from loyalty.adjust_customer_points_command(
    '75000000-0000-4000-8000-000000000140',
    '75000000-0000-4000-8000-000000000110',
    '75000000-0000-4000-8000-000000000130',
    -300, 'Approved customer correction debit', null, null,
    'customer:adjust:negative', '75000000-0000-4000-8000-000000000204'
  ) $$,
  array['duplicate'::text],
  'exact adjustment retry returns the existing transaction'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.admin_audit_events
     where idempotency_key = 'customer:adjust:negative' $$,
  array[1::bigint],
  'idempotent retry creates no second audit event'
);
select throws_ok(
  $$ select * from loyalty.adjust_customer_points_command(
    '75000000-0000-4000-8000-000000000140',
    '75000000-0000-4000-8000-000000000110',
    '75000000-0000-4000-8000-000000000130',
    -301, 'Approved customer correction debit', null, null,
    'customer:adjust:negative', '75000000-0000-4000-8000-000000000205'
  ) $$,
  '23514', 'customer adjustment idempotency conflict',
  'changed adjustment conflicts under one idempotency key'
);
select throws_ok(
  $$ select * from loyalty.adjust_customer_points_command(
    '75000000-0000-4000-8000-000000000140',
    '75000000-0000-4000-8000-000000000110',
    '75000000-0000-4000-8000-000000000130',
    10, 'Missing required future expiry', null, null,
    'customer:adjust:no-expiry', '75000000-0000-4000-8000-000000000206'
  ) $$,
  '22023', 'positive adjustment requires a future expiry',
  'positive adjustment fails without an expiry'
);
select throws_ok(
  $$ select * from loyalty.adjust_customer_points_command(
    '75000000-0000-4000-8000-000000000140',
    '75000000-0000-4000-8000-000000000110',
    '75000000-0000-4000-8000-000000000130',
    -10, 'Debit must not create a lot', null, now() + interval '1 year',
    'customer:adjust:bad-expiry', '75000000-0000-4000-8000-000000000207'
  ) $$,
  '22023', 'negative adjustment cannot have an expiry',
  'negative adjustment rejects an expiry'
);
select throws_ok(
  $query$ select * from loyalty.adjust_customer_points_command(
    '75000000-0000-4000-8000-000000000140',
    '75000000-0000-4000-8000-000000000110',
    '75000000-0000-4000-8000-000000000130',
    -10, E'Unsafe\nreason', null, null,
    'customer:adjust:control', '75000000-0000-4000-8000-000000000208'
  ) $query$,
  '22023', 'invalid customer adjustment command',
  'control characters are rejected from reasons'
);

set local request.jwt.claim.sub = '75000000-0000-4000-8000-000000000002';
select results_eq(
  $$ select outcome from loyalty.adjust_customer_points_command(
    '75000000-0000-4000-8000-000000000140',
    '75000000-0000-4000-8000-000000000110',
    '75000000-0000-4000-8000-000000000130',
    -25, 'Admin approved account correction', null, null,
    'customer:adjust:admin', '75000000-0000-4000-8000-000000000209'
  ) $$,
  array['created'::text],
  'admin can create an adjustment'
);

set local request.jwt.claim.sub = '75000000-0000-4000-8000-000000000003';
select throws_ok(
  $$ select * from loyalty.adjust_customer_points_command(
    '75000000-0000-4000-8000-000000000140',
    '75000000-0000-4000-8000-000000000110',
    '75000000-0000-4000-8000-000000000130',
    -25, 'Operator requested adjustment', null, null,
    'customer:adjust:operator', '75000000-0000-4000-8000-000000000210'
  ) $$,
  '42501', 'customer adjustment not authorized',
  'operator cannot create value manually'
);
select is_empty(
  $$ select * from loyalty.get_customer_adjustment_context(
    '75000000-0000-4000-8000-000000000140',
    '75000000-0000-4000-8000-000000000110'
  ) $$,
  'operator cannot retrieve the high-risk adjustment context'
);

set local request.jwt.claim.sub = '75000000-0000-4000-8000-000000000004';
select throws_ok(
  $$ select * from loyalty.adjust_customer_points_command(
    '75000000-0000-4000-8000-000000000140',
    '75000000-0000-4000-8000-000000000110',
    '75000000-0000-4000-8000-000000000130',
    -25, 'Analyst requested adjustment', null, null,
    'customer:adjust:analyst', '75000000-0000-4000-8000-000000000211'
  ) $$,
  '42501', 'customer adjustment not authorized',
  'analyst cannot create value manually'
);

set local request.jwt.claim.sub = '75000000-0000-4000-8000-000000000005';
select throws_ok(
  $$ select * from loyalty.adjust_customer_points_command(
    '75000000-0000-4000-8000-000000000140',
    '75000000-0000-4000-8000-000000000110',
    '75000000-0000-4000-8000-000000000130',
    -25, 'Auditor requested adjustment', null, null,
    'customer:adjust:auditor', '75000000-0000-4000-8000-000000000212'
  ) $$,
  '42501', 'customer adjustment not authorized',
  'auditor remains read-only'
);

set local request.jwt.claim.sub = '75000000-0000-4000-8000-000000000006';
select throws_ok(
  $$ select * from loyalty.adjust_customer_points_command(
    '75000000-0000-4000-8000-000000000140',
    '75000000-0000-4000-8000-000000000110',
    '75000000-0000-4000-8000-000000000130',
    -25, 'Revoked admin requested adjustment', null, null,
    'customer:adjust:revoked', '75000000-0000-4000-8000-000000000213'
  ) $$,
  '42501', 'customer adjustment not authorized',
  'revoked admin fails closed with a live token'
);

set local request.jwt.claim.sub = '76000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select * from loyalty.adjust_customer_points_command(
    '75000000-0000-4000-8000-000000000140',
    '75000000-0000-4000-8000-000000000110',
    '75000000-0000-4000-8000-000000000130',
    -25, 'Other tenant requested adjustment', null, null,
    'customer:adjust:cross', '75000000-0000-4000-8000-000000000214'
  ) $$,
  '42501', 'customer adjustment not authorized',
  'another tenant owner cannot adjust this wallet'
);

reset role;
select throws_ok(
  $$ update loyalty.ledger_transactions set reason = 'rewritten'
     where idempotency_key = 'customer:adjust:positive' $$,
  '55000', 'immutable loyalty history cannot be changed',
  'adjustment ledger transaction cannot be rewritten'
);
select throws_ok(
  $$ update loyalty.admin_audit_events set metadata = '{}'::jsonb
     where idempotency_key = 'customer:adjust:positive' $$,
  '55000', 'immutable loyalty history cannot be changed',
  'adjustment audit evidence cannot be rewritten'
);
select is_empty(
  $$ select * from loyalty_private.wallet_projection_differences(
    (select id from loyalty.organizations where slug = 'adjust-one')
  ) $$,
  'adjustment sequence leaves wallet projections rebuildable'
);
select is_empty(
  $$ select * from loyalty_private.point_lot_projection_differences(
    (select id from loyalty.organizations where slug = 'adjust-one')
  ) $$,
  'adjustment sequence leaves lot projections rebuildable'
);

select * from finish();
rollback;
