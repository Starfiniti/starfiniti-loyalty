begin;

create extension if not exists pgtap with schema extensions;

select plan(35);

select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.get_analytics_value_truth_v1(uuid,uuid,uuid,integer,timestamp with time zone)',
    'EXECUTE'
  ),
  'authenticated members can enter the guarded value-truth report'
);
select ok(
  not has_function_privilege(
    'anon',
    'loyalty.get_analytics_value_truth_v1(uuid,uuid,uuid,integer,timestamp with time zone)',
    'EXECUTE'
  ),
  'anonymous users cannot enter analytics reporting'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'loyalty'
      and routine.proname = 'get_analytics_value_truth_v1'
      and routine.prosecdef
      and routine.provolatile = 's'
      and exists (
        select 1 from unnest(routine.proconfig) as setting
        where setting = 'search_path=""'
      )
  $$,
  array[1::bigint],
  'the report is stable security-definer code with an empty search path'
);
select is_empty(
  $$
    select parameter_name
    from information_schema.parameters
    where specific_schema = 'loyalty'
      and specific_name like 'get_analytics_value_truth_v1_%'
      and parameter_name in (
        'organization_id', 'workspace_id', 'programme_group_id', 'wallet_id',
        'customer_id', 'payload', 'metadata', 'actor_id', 'reason'
      )
  $$,
  'the public signature accepts no internal authority or private evidence'
);

insert into auth.users (id, email)
values
  ('8b000000-0000-4000-8000-000000000001', 'analytics-owner@example.test'),
  ('8b000000-0000-4000-8000-000000000002', 'analytics-analyst@example.test'),
  ('8b000000-0000-4000-8000-000000000003', 'analytics-revoked@example.test'),
  ('8c000000-0000-4000-8000-000000000001', 'analytics-other@example.test');

insert into loyalty.organizations (public_id, slug, name)
values
  ('8b000000-0000-4000-8000-000000000100', 'analytics-one', 'Analytics One'),
  ('8c000000-0000-4000-8000-000000000100', 'analytics-two', 'Analytics Two');

insert into loyalty.organization_memberships (
  organization_id, user_id, role, revoked_at
)
values
  ((select id from loyalty.organizations where slug = 'analytics-one'), '8b000000-0000-4000-8000-000000000001', 'owner', null),
  ((select id from loyalty.organizations where slug = 'analytics-one'), '8b000000-0000-4000-8000-000000000002', 'analyst', null),
  ((select id from loyalty.organizations where slug = 'analytics-one'), '8b000000-0000-4000-8000-000000000003', 'admin', now()),
  ((select id from loyalty.organizations where slug = 'analytics-two'), '8c000000-0000-4000-8000-000000000001', 'owner', null);

insert into loyalty.workspaces (public_id, organization_id, slug, name)
select
  case organization.slug
    when 'analytics-one' then '8b000000-0000-4000-8000-000000000101'::uuid
    else '8c000000-0000-4000-8000-000000000101'::uuid
  end,
  organization.id, 'shop', organization.name || ' Shop'
from loyalty.organizations as organization
where organization.slug in ('analytics-one', 'analytics-two');

insert into loyalty.programme_groups (public_id, organization_id, slug, name)
select
  case organization.slug
    when 'analytics-one' then '8b000000-0000-4000-8000-000000000110'::uuid
    else '8c000000-0000-4000-8000-000000000110'::uuid
  end,
  organization.id, 'rewards', organization.name || ' Rewards'
from loyalty.organizations as organization
where organization.slug in ('analytics-one', 'analytics-two');

insert into loyalty.programme_group_workspaces (
  organization_id, programme_group_id, workspace_id
)
select organization.id, programme_group.id, workspace.id
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
join loyalty.workspaces as workspace
  on workspace.organization_id = organization.id
where organization.slug in ('analytics-one', 'analytics-two');

-- The legacy Overview read model deliberately counts only customers linked to
-- the selected commerce workspace. Keep this fixture inside that same scope so
-- the shadow comparison measures aggregate compatibility rather than the two
-- reports' intentionally different treatment of unlinked wallets.
insert into loyalty.commerce_connections (
  public_id, organization_id, workspace_id, external_store_id, display_name,
  current_key_version, signing_material_ref
)
select
  case organization.slug
    when 'analytics-one' then '8b000000-0000-4000-8000-000000000120'::uuid
    else '8c000000-0000-4000-8000-000000000120'::uuid
  end,
  organization.id, workspace.id, organization.slug || '-store',
  organization.name || ' Store', 'v1', 'vault://' || organization.slug
from loyalty.organizations as organization
join loyalty.workspaces as workspace
  on workspace.organization_id = organization.id
where organization.slug in ('analytics-one', 'analytics-two');

insert into loyalty.programmes (
  public_id, organization_id, programme_group_id, slug, name, status
)
select
  case organization.slug
    when 'analytics-one' then '8b000000-0000-4000-8000-000000000130'::uuid
    else '8c000000-0000-4000-8000-000000000130'::uuid
  end,
  organization.id, programme_group.id, 'rewards',
  organization.name || ' Rewards', 'active'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
where organization.slug in ('analytics-one', 'analytics-two');

insert into loyalty.programme_versions (
  public_id, organization_id, programme_group_id, programme_id,
  version_number, status, configuration, configuration_sha256,
  approved_by_user_id, published_at
)
select
  case organization.slug
    when 'analytics-one' then '8b000000-0000-4000-8000-000000000140'::uuid
    else '8c000000-0000-4000-8000-000000000140'::uuid
  end,
  organization.id, programme_group.id, programme.id, 1, 'published',
  '{"currencyCode":"EUR","minorUnitsPerMajor":100,"tiers":[],"rewards":[]}'::jsonb,
  extensions.digest(convert_to(organization.slug, 'UTF8'), 'sha256'),
  case organization.slug
    when 'analytics-one' then '8b000000-0000-4000-8000-000000000001'::uuid
    else '8c000000-0000-4000-8000-000000000001'::uuid
  end,
  '2026-08-01T00:00:00Z'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
join loyalty.programmes as programme
  on programme.organization_id = organization.id
where organization.slug in ('analytics-one', 'analytics-two');

insert into loyalty.customers (
  public_id, organization_id, display_reference, created_at, updated_at
)
select '8b000000-0000-4000-8000-000000000150', organization.id,
  'Analytics member', '2026-08-18T00:00:00Z', '2026-08-18T00:00:00Z'
from loyalty.organizations as organization
where organization.slug = 'analytics-one';

insert into loyalty.customer_identities (
  organization_id, customer_id, commerce_connection_id,
  external_customer_id, identity_kind, verified_at
)
select customer.organization_id, customer.id, connection.id,
  'registered:analytics-member', 'registered', customer.created_at
from loyalty.customers as customer
join loyalty.commerce_connections as connection
  on connection.organization_id = customer.organization_id
where customer.public_id = '8b000000-0000-4000-8000-000000000150';

insert into loyalty.wallets (
  public_id, organization_id, programme_group_id, customer_id,
  created_at, updated_at
)
select '8b000000-0000-4000-8000-000000000160', customer.organization_id,
  programme_group.id, customer.id, customer.created_at, customer.created_at
from loyalty.customers as customer
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = customer.organization_id
where customer.public_id = '8b000000-0000-4000-8000-000000000150';

select loyalty_private.ensure_wallet_accounts(
  wallet.organization_id, wallet.programme_group_id, wallet.customer_id
)
from loyalty.wallets as wallet
where wallet.public_id = '8b000000-0000-4000-8000-000000000160';

-- A full value lifecycle, including exact bigint, reservation capture,
-- corrections, refund reversal, expiry, and multiple expiry horizons.
select * from loyalty_private.award_points(
  (select id from loyalty.organizations where slug = 'analytics-one'),
  (select id from loyalty.programme_groups where public_id = '8b000000-0000-4000-8000-000000000110'),
  (select id from loyalty.programme_versions where public_id = '8b000000-0000-4000-8000-000000000140'),
  (select id from loyalty.customers where public_id = '8b000000-0000-4000-8000-000000000150'),
  9007199254740993, 'analytics:award',
  extensions.digest(convert_to('analytics-award', 'UTF8'), 'sha256'),
  null, 'analytics-fixture', '2026-08-19T01:00:00Z'
);

select * from loyalty_private.release_points(
  (select id from loyalty.organizations where slug = 'analytics-one'),
  (select id from loyalty.programme_groups where public_id = '8b000000-0000-4000-8000-000000000110'),
  (select id from loyalty.programme_versions where public_id = '8b000000-0000-4000-8000-000000000140'),
  (
    select entry.public_id
    from loyalty.ledger_entries as entry
    join loyalty.ledger_transactions as transaction
      on transaction.id = entry.transaction_id
    join loyalty.ledger_accounts as account on account.id = entry.account_id
    where transaction.idempotency_key = 'analytics:award'
      and account.account_kind = 'pending'
  ),
  '2026-09-10T00:00:00Z', 'analytics:release',
  extensions.digest(convert_to('analytics-release', 'UTF8'), 'sha256'),
  '2026-08-19T02:00:00Z'
);

create temporary table analytics_reservation as
select * from loyalty_private.reserve_points(
  (select id from loyalty.organizations where slug = 'analytics-one'),
  (select id from loyalty.programme_groups where public_id = '8b000000-0000-4000-8000-000000000110'),
  (select id from loyalty.programme_versions where public_id = '8b000000-0000-4000-8000-000000000140'),
  '8b000000-0000-4000-8000-000000000160', 40,
  'analytics:reserve',
  extensions.digest(convert_to('analytics-reserve', 'UTF8'), 'sha256'),
  '2026-08-20T00:00:00Z'
);

select * from loyalty_private.capture_reservation(
  (select id from loyalty.organizations where slug = 'analytics-one'),
  (select transaction_public_id from analytics_reservation),
  'analytics:capture',
  extensions.digest(convert_to('analytics-capture', 'UTF8'), 'sha256'),
  '2026-08-21T00:00:00Z'
);

select * from loyalty_private.adjust_points(
  (select id from loyalty.organizations where slug = 'analytics-one'),
  '8b000000-0000-4000-8000-000000000160',
  (select id from loyalty.programme_versions where public_id = '8b000000-0000-4000-8000-000000000140'),
  -5, 'Audited debit fixture', 'analytics-fixture', 'analytics:manual-debit',
  extensions.digest(convert_to('analytics-manual-debit', 'UTF8'), 'sha256'),
  null, '2026-08-22T00:00:00Z'
);

select * from loyalty_private.reverse_award_points(
  (select id from loyalty.organizations where slug = 'analytics-one'),
  (
    select entry.public_id
    from loyalty.ledger_entries as entry
    join loyalty.ledger_transactions as transaction
      on transaction.id = entry.transaction_id
    join loyalty.ledger_accounts as account on account.id = entry.account_id
    where transaction.idempotency_key = 'analytics:award'
      and account.account_kind = 'pending'
  ),
  10, 'analytics:refund-reversal',
  extensions.digest(convert_to('analytics-refund-reversal', 'UTF8'), 'sha256'),
  'Audited refund fixture', '2026-08-23T00:00:00Z'
);

select * from loyalty_private.adjust_points(
  (select id from loyalty.organizations where slug = 'analytics-one'),
  '8b000000-0000-4000-8000-000000000160',
  (select id from loyalty.programme_versions where public_id = '8b000000-0000-4000-8000-000000000140'),
  20, 'Short expiry fixture', 'analytics-fixture', 'analytics:manual-short',
  extensions.digest(convert_to('analytics-manual-short', 'UTF8'), 'sha256'),
  '2026-08-24T00:00:00Z', '2026-08-23T12:00:00Z'
);

select * from loyalty_private.adjust_points(
  (select id from loyalty.organizations where slug = 'analytics-one'),
  '8b000000-0000-4000-8000-000000000160',
  (select id from loyalty.programme_versions where public_id = '8b000000-0000-4000-8000-000000000140'),
  100, 'Long expiry fixture', 'analytics-fixture', 'analytics:manual-long',
  extensions.digest(convert_to('analytics-manual-long', 'UTF8'), 'sha256'),
  '2026-12-10T00:00:00Z', '2026-08-23T13:00:00Z'
);

select * from loyalty_private.expire_points(
  (select id from loyalty.organizations where slug = 'analytics-one'),
  '8b000000-0000-4000-8000-000000000160',
  (select id from loyalty.programme_versions where public_id = '8b000000-0000-4000-8000-000000000140'),
  '2026-08-25T00:00:00Z', 'analytics:expire',
  extensions.digest(convert_to('analytics-expire', 'UTF8'), 'sha256')
);

set local role authenticated;
set local request.jwt.claim.sub = '8b000000-0000-4000-8000-000000000001';

create temporary table analytics_owner_report as
select * from loyalty.get_analytics_value_truth_v1(
  '8b000000-0000-4000-8000-000000000100',
  '8b000000-0000-4000-8000-000000000101',
  '8b000000-0000-4000-8000-000000000110',
  7, '2026-08-26T00:00:00Z'
);

create temporary table analytics_overview_shadow as
select * from loyalty.get_overview_report(
  '8b000000-0000-4000-8000-000000000100',
  '8b000000-0000-4000-8000-000000000101',
  '8b000000-0000-4000-8000-000000000110',
  7, '2026-08-26T00:00:00Z'
);

select results_eq(
  $$ select overview.report_as_of::text || ':' || overview.range_days::text
     from analytics_overview_shadow as overview $$,
  $$ select analytics.report_as_of::text || ':' || analytics.range_days::text
     from analytics_owner_report as analytics $$,
  'overview and analytics shadow use one exact instant and range'
);
select results_eq(
  $$ select overview.members_total || ':' || overview.outstanding_points
     from analytics_overview_shadow as overview $$,
  $$ select analytics.wallet_count || ':' || analytics.outstanding_points
     from analytics_owner_report as analytics $$,
  'overview members and outstanding points match reconciled analytics truth'
);

select results_eq(
  $$ select count(*)::bigint from analytics_owner_report $$,
  array[1::bigint], 'authorized report returns one exact aggregate row'
);
select results_eq(
  $$ select report_version || ':' || dictionary_version from analytics_owner_report $$,
  array['1:1'::text], 'report and metric dictionary are independently versioned'
);
select results_eq(
  $$ select period_from::text || '/' || period_to::text from analytics_owner_report $$,
  array['2026-08-19 00:00:00+00/2026-08-26 00:00:00+00'::text],
  'report uses the exact seven-day UTC half-open interval'
);
select results_eq(
  $$ select projection_status from analytics_owner_report $$,
  array['reconciled'::text], 'only reconciled projections leave PostgreSQL'
);
select results_eq(
  $$ select wallet_count || ':' || wallet_account_count || ':' || ledger_entry_count || ':' || lot_count from analytics_owner_report $$,
  array['1:6:14:3'::text], 'projection evidence counts are exact text'
);
select results_eq(
  $$ select pending_points || ':' || reserved_points from analytics_owner_report $$,
  array['0:0'::text], 'released and captured lifecycle buckets reconcile to zero'
);
select results_eq(
  $$ select available_points from analytics_owner_report $$,
  array['9007199254741038'::text], 'available point exposure preserves values beyond JavaScript safe integer precision'
);
select results_eq(
  $$ select spent_points || ':' || expired_points || ':' || reversed_points from analytics_owner_report $$,
  array['40:20:10'::text], 'terminal wallet buckets remain distinct'
);
select results_eq(
  $$ select outstanding_points from analytics_owner_report $$,
  array['9007199254741038'::text], 'outstanding points equal pending plus signed available plus reserved'
);
select results_eq(
  $$ select awarded_flow_points || ':' || released_flow_points from analytics_owner_report $$,
  array['9007199254740993:9007199254740993'::text], 'award and release flows are gross and exact'
);
select results_eq(
  $$ select reserved_flow_points || ':' || captured_flow_points || ':' || cancelled_flow_points from analytics_owner_report $$,
  array['40:40:0'::text], 'reservation movement and resolution are not treated as new point supply'
);
select results_eq(
  $$ select expired_flow_points || ':' || refund_reversed_flow_points from analytics_owner_report $$,
  array['20:10'::text], 'expiry and refund reversal remain separately attributable'
);
select results_eq(
  $$ select manual_credit_points || ':' || manual_debit_points || ':' || manual_net_points from analytics_owner_report $$,
  array['120:5:115'::text], 'manual gross credits debits and signed net reconcile'
);
select results_eq(
  $$ select lot_backed_points from analytics_owner_report $$,
  array['9007199254741038'::text], 'lot-backed exposure exactly reconciles released available value'
);
select results_eq(
  $$ select overdue_available_points || ':' || reserved_past_expiry_points from analytics_owner_report $$,
  array['0:0'::text], 'consumed expired lots and resolved reservations create no false overdue exposure'
);
select results_eq(
  $$ select expiring_next_30_days || ':' || expiring_days_31_to_90 || ':' || expiring_beyond_90_days from analytics_owner_report $$,
  array['9007199254740938:0:100'::text], 'expiry horizons are mutually exclusive and exhaustive'
);
select results_eq(
  $$ select affected_members || ':' || next_expiry_at::text from analytics_owner_report $$,
  array['1:2026-09-10 00:00:00+00'::text], 'member count and next positive expiry omit identity data'
);
select results_eq(
  $$ select monetary_liability_status || ':' || monetary_liability_reason from analytics_owner_report $$,
  array['unavailable:valuation_policy_not_configured'::text],
  'point exposure is never fabricated as accounting currency liability'
);
select throws_ok(
  $$ select * from loyalty.get_analytics_value_truth_v1(
    '8b000000-0000-4000-8000-000000000100',
    '8b000000-0000-4000-8000-000000000101',
    '8b000000-0000-4000-8000-000000000110',
    365, '2026-08-26T00:00:00Z'
  ) $$,
  '22023', 'invalid analytics value truth request',
  'unsupported ranges fail closed'
);
select is_empty(
  $$ select * from loyalty.get_analytics_value_truth_v1(
    '8b000000-0000-4000-8000-000000000100',
    '8c000000-0000-4000-8000-000000000101',
    '8b000000-0000-4000-8000-000000000110',
    7, '2026-08-26T00:00:00Z'
  ) $$,
  'mixed public selectors cannot fabricate a valid internal scope'
);
select is_empty(
  $$ select * from loyalty.get_analytics_value_truth_v1(
    '8c000000-0000-4000-8000-000000000100',
    '8c000000-0000-4000-8000-000000000101',
    '8c000000-0000-4000-8000-000000000110',
    7, '2026-08-26T00:00:00Z'
  ) $$,
  'one tenant cannot read another tenant report'
);

set local request.jwt.claim.sub = '8b000000-0000-4000-8000-000000000002';
select results_eq(
  $$ select outstanding_points from loyalty.get_analytics_value_truth_v1(
    '8b000000-0000-4000-8000-000000000100',
    '8b000000-0000-4000-8000-000000000101',
    '8b000000-0000-4000-8000-000000000110',
    7, '2026-08-26T00:00:00Z'
  ) $$,
  array['9007199254741038'::text], 'analyst role can read minimized aggregate evidence'
);
set local request.jwt.claim.sub = '8b000000-0000-4000-8000-000000000003';
select is_empty(
  $$ select * from loyalty.get_analytics_value_truth_v1(
    '8b000000-0000-4000-8000-000000000100',
    '8b000000-0000-4000-8000-000000000101',
    '8b000000-0000-4000-8000-000000000110',
    7, '2026-08-26T00:00:00Z'
  ) $$,
  'revoked membership fails closed even with a live token'
);
set local request.jwt.claim.sub = '8c000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select wallet_count || ':' || outstanding_points
     from loyalty.get_analytics_value_truth_v1(
       '8c000000-0000-4000-8000-000000000100',
       '8c000000-0000-4000-8000-000000000101',
       '8c000000-0000-4000-8000-000000000110',
       7, '2026-08-26T00:00:00Z'
     ) $$,
  array['0:0'::text], 'another tenant receives only its own empty aggregate'
);

reset role;
select results_eq(
  $$ select count(*)::bigint from loyalty.admin_audit_events
     where organization_id = (
       select id from loyalty.organizations where slug = 'analytics-one'
     ) $$,
  array[0::bigint], 'read-only analytics appends no mutation audit event'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_entries
     where organization_id = (
       select id from loyalty.organizations where slug = 'analytics-one'
     ) $$,
  array[18::bigint], 'all report reads leave immutable ledger entry count unchanged'
);

update loyalty.wallet_balances as balance
set points = balance.points + 1
where balance.organization_id = (
    select id from loyalty.organizations where slug = 'analytics-one'
  )
  and balance.account_kind = 'available';
set local role authenticated;
set local request.jwt.claim.sub = '8b000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select * from loyalty.get_analytics_value_truth_v1(
    '8b000000-0000-4000-8000-000000000100',
    '8b000000-0000-4000-8000-000000000101',
    '8b000000-0000-4000-8000-000000000110',
    7, '2026-08-26T00:00:00Z'
  ) $$,
  '55000', 'analytics wallet projection drift',
  'wallet projection drift prevents a plausible but false report'
);
reset role;
update loyalty.wallet_balances as balance
set points = balance.points - 1
where balance.organization_id = (
    select id from loyalty.organizations where slug = 'analytics-one'
  )
  and balance.account_kind = 'available';

update loyalty.point_lot_balances as balance
set remaining_points = balance.remaining_points + 1
where balance.lot_id = (
  select lot.id from loyalty.point_lots as lot
  where lot.expires_at = '2026-12-10T00:00:00Z'
);
set local role authenticated;
set local request.jwt.claim.sub = '8b000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select * from loyalty.get_analytics_value_truth_v1(
    '8b000000-0000-4000-8000-000000000100',
    '8b000000-0000-4000-8000-000000000101',
    '8b000000-0000-4000-8000-000000000110',
    7, '2026-08-26T00:00:00Z'
  ) $$,
  '55000', 'analytics point-lot projection drift',
  'point-lot projection drift prevents a false expiry report'
);
reset role;
update loyalty.point_lot_balances as balance
set remaining_points = balance.remaining_points - 1
where balance.lot_id = (
  select lot.id from loyalty.point_lots as lot
  where lot.expires_at = '2026-12-10T00:00:00Z'
);

select loyalty_private.set_organization_entitlement(
  '8b000000-0000-4000-8000-000000000100', 'analytics', 'disabled', null,
  'local_control', 'operator:test', 'Disable analytics for fail-closed verification',
  now() - interval '1 second', null
);
set local role authenticated;
set local request.jwt.claim.sub = '8b000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select * from loyalty.get_analytics_value_truth_v1(
    '8b000000-0000-4000-8000-000000000100',
    '8b000000-0000-4000-8000-000000000101',
    '8b000000-0000-4000-8000-000000000110',
    7, '2026-08-26T00:00:00Z'
  ) $$,
  '42501', 'analytics capability disabled',
  'server-side entitlement disablement fails closed'
);

reset role;
select * from finish();
rollback;
