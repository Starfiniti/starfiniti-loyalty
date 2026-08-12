begin;

create extension if not exists pgtap with schema extensions;

select plan(33);

select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.get_overview_report(uuid,uuid,uuid,integer,timestamp with time zone)',
    'EXECUTE'
  ),
  'authenticated members can enter the guarded Overview report'
);
select ok(
  not has_function_privilege(
    'anon',
    'loyalty.get_overview_report(uuid,uuid,uuid,integer,timestamp with time zone)',
    'EXECUTE'
  ),
  'anonymous users cannot enter merchant reporting'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'loyalty'
      and routine.proname = 'get_overview_report'
      and routine.prosecdef
      and routine.provolatile = 's'
      and exists (
        select 1 from unnest(routine.proconfig) as setting
        where setting = 'search_path=""'
      )
  $$,
  array[1::bigint],
  'the report is a stable security-definer function with an empty search path'
);
select has_index(
  'loyalty_private', 'programme_evaluations',
  'programme_evaluations_overview_report_idx',
  'live evaluation aggregation uses a scoped partial index'
);

insert into auth.users (id, email)
values
  ('79000000-0000-4000-8000-000000000001', 'report-owner@example.test'),
  ('79000000-0000-4000-8000-000000000002', 'report-analyst@example.test'),
  ('79000000-0000-4000-8000-000000000003', 'report-revoked@example.test'),
  ('7a000000-0000-4000-8000-000000000001', 'report-other@example.test');
insert into loyalty.organizations (public_id, slug, name)
values
  ('79000000-0000-4000-8000-000000000100', 'report-one', 'Report One'),
  ('7a000000-0000-4000-8000-000000000100', 'report-two', 'Report Two');
insert into loyalty.organization_memberships (
  organization_id, user_id, role, revoked_at
)
values
  ((select id from loyalty.organizations where slug = 'report-one'), '79000000-0000-4000-8000-000000000001', 'owner', null),
  ((select id from loyalty.organizations where slug = 'report-one'), '79000000-0000-4000-8000-000000000002', 'analyst', null),
  ((select id from loyalty.organizations where slug = 'report-one'), '79000000-0000-4000-8000-000000000003', 'admin', now()),
  ((select id from loyalty.organizations where slug = 'report-two'), '7a000000-0000-4000-8000-000000000001', 'owner', null);
insert into loyalty.workspaces (public_id, organization_id, slug, name)
select
  case organization.slug
    when 'report-one' then '79000000-0000-4000-8000-000000000101'::uuid
    else '7a000000-0000-4000-8000-000000000101'::uuid
  end,
  organization.id, 'shop', organization.name || ' Shop'
from loyalty.organizations as organization
where organization.slug in ('report-one', 'report-two');
insert into loyalty.programme_groups (public_id, organization_id, slug, name)
select
  case organization.slug
    when 'report-one' then '79000000-0000-4000-8000-000000000110'::uuid
    else '7a000000-0000-4000-8000-000000000110'::uuid
  end,
  organization.id, 'rewards', organization.name || ' Rewards'
from loyalty.organizations as organization
where organization.slug in ('report-one', 'report-two');
insert into loyalty.programme_group_workspaces (
  organization_id, programme_group_id, workspace_id
)
select organization.id, programme_group.id, workspace.id
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
join loyalty.workspaces as workspace
  on workspace.organization_id = organization.id
where organization.slug in ('report-one', 'report-two');
insert into loyalty.commerce_connections (
  public_id, organization_id, workspace_id, external_store_id, display_name,
  current_key_version, signing_material_ref
)
select
  case organization.slug
    when 'report-one' then '79000000-0000-4000-8000-000000000120'::uuid
    else '7a000000-0000-4000-8000-000000000120'::uuid
  end,
  organization.id, workspace.id, organization.slug || '-store',
  organization.name || ' Store', 'v1', 'vault://' || organization.slug
from loyalty.organizations as organization
join loyalty.workspaces as workspace on workspace.organization_id = organization.id
where organization.slug in ('report-one', 'report-two');
insert into loyalty.programmes (
  public_id, organization_id, programme_group_id, slug, name, status
)
select
  case organization.slug
    when 'report-one' then '79000000-0000-4000-8000-000000000130'::uuid
    else '7a000000-0000-4000-8000-000000000130'::uuid
  end,
  organization.id, programme_group.id, 'rewards',
  organization.name || ' Rewards', 'active'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
where organization.slug in ('report-one', 'report-two');
insert into loyalty.programme_versions (
  public_id, organization_id, programme_group_id, programme_id,
  version_number, status, configuration, configuration_sha256,
  approved_by_user_id, published_at
)
select
  case organization.slug
    when 'report-one' then '79000000-0000-4000-8000-000000000140'::uuid
    else '7a000000-0000-4000-8000-000000000140'::uuid
  end,
  organization.id, programme_group.id, programme.id, 1, 'published',
  '{"currencyCode":"EUR","minorUnitsPerMajor":100,"tiers":[],"rewards":[]}'::jsonb,
  extensions.digest(convert_to(organization.slug, 'UTF8'), 'sha256'),
  case organization.slug
    when 'report-one' then '79000000-0000-4000-8000-000000000001'::uuid
    else '7a000000-0000-4000-8000-000000000001'::uuid
  end,
  '2026-07-01T00:00:00Z'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
join loyalty.programmes as programme on programme.organization_id = organization.id
where organization.slug in ('report-one', 'report-two');

insert into loyalty.customers (
  public_id, organization_id, display_reference, created_at, updated_at
)
select
  ('79000000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  organization.id, 'Member ' || number,
  case number when 1 then '2026-08-07T10:00:00Z'::timestamptz
    when 2 then '2026-08-08T10:00:00Z'::timestamptz
    else '2026-08-01T10:00:00Z'::timestamptz end,
  case number when 1 then '2026-08-07T10:00:00Z'::timestamptz
    when 2 then '2026-08-08T10:00:00Z'::timestamptz
    else '2026-08-01T10:00:00Z'::timestamptz end
from generate_series(1, 3) as generated(number)
cross join loyalty.organizations as organization
where organization.slug = 'report-one';
insert into loyalty.customer_identities (
  organization_id, customer_id, commerce_connection_id,
  external_customer_id, identity_kind, verified_at
)
select customer.organization_id, customer.id, connection.id,
  'registered:' || lower(right(customer.display_reference, 1)),
  'registered', customer.created_at
from loyalty.customers as customer
join loyalty.commerce_connections as connection
  on connection.organization_id = customer.organization_id
where customer.display_reference like 'Member %';
insert into loyalty.wallets (
  public_id, organization_id, programme_group_id, customer_id,
  created_at, updated_at
)
select
  ('79100000-0000-4000-8000-' || lpad(row_number() over (order by customer.id)::text, 12, '0'))::uuid,
  customer.organization_id, programme_group.id, customer.id,
  customer.created_at, customer.created_at
from loyalty.customers as customer
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = customer.organization_id
where customer.display_reference like 'Member %';
select loyalty_private.ensure_wallet_accounts(
  wallet.organization_id, wallet.programme_group_id, wallet.customer_id
)
from loyalty.wallets as wallet
join loyalty.organizations as organization on organization.id = wallet.organization_id
where organization.slug = 'report-one';

insert into loyalty_private.commerce_delivery_inbox (
  receipt_id, organization_id, connection_id, source_delivery_id,
  envelope_version, source_event_id, event_type, source_object_id,
  occurred_at, delivered_at, key_version, nonce, body_sha256, raw_body,
  state
)
select
  ('79200000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  organization.id, connection.id, 'report-delivery-' || number, '1',
  'report-event-' || number, 'commerce.order.status_changed',
  'order-' || number,
  case number when 1 then '2026-08-08T10:00:00Z'::timestamptz
    when 2 then '2026-08-10T10:00:00Z'::timestamptz
    when 3 then '2026-08-09T10:00:00Z'::timestamptz
    else '2026-08-02T10:00:00Z'::timestamptz end,
  '2026-08-12T09:00:00Z', 'v1', 'report-nonce-' || number,
  repeat(number::text, 64), '{}'::jsonb, 'applied'
from generate_series(1, 4) as generated(number)
cross join loyalty.organizations as organization
join loyalty.commerce_connections as connection
  on connection.organization_id = organization.id
where organization.slug = 'report-one';
insert into loyalty_private.canonical_commerce_events (
  public_id, organization_id, connection_id, delivery_inbox_id,
  source_event_id, normalization_version, event_type, source_object_id,
  occurred_at, payload, effect_state
)
select
  ('79300000-0000-4000-8000-' || lpad(row_number() over (order by inbox.id)::text, 12, '0'))::uuid,
  inbox.organization_id, inbox.connection_id, inbox.id, inbox.source_event_id,
  'v1', inbox.event_type, inbox.source_object_id, inbox.occurred_at,
  jsonb_build_object(
    'kind', 'order_status_changed',
    'order', jsonb_build_object(
      'customer', jsonb_build_object(
        'kind', 'registered',
        'externalCustomerId', case inbox.source_object_id
          when 'order-1' then '1' when 'order-2' then '1'
          when 'order-3' then '2' else '3' end
      )
    )
  ),
  'applied'
from loyalty_private.commerce_delivery_inbox as inbox
join loyalty.organizations as organization on organization.id = inbox.organization_id
where organization.slug = 'report-one';
insert into loyalty_private.programme_evaluations (
  public_id, organization_id, programme_group_id, programme_version_id,
  canonical_event_id, evaluation_kind, subject_reference, idempotency_key,
  input_sha256, result_sha256, result, explanation, evaluated_at
)
select
  ('79400000-0000-4000-8000-' || lpad(row_number() over (order by event.id)::text, 12, '0'))::uuid,
  event.organization_id, programme_group.id, version.id, event.id,
  'live_award', 'woocommerce:' || event.source_object_id,
  'report:evaluation:' || event.source_object_id,
  extensions.digest(convert_to('input:' || event.source_object_id, 'UTF8'), 'sha256'),
  extensions.digest(convert_to('result:' || event.source_object_id, 'UTF8'), 'sha256'),
  jsonb_build_object(
    'eligibleSpendMinor', case event.source_object_id
      when 'order-1' then 1000 when 'order-2' then 2000
      when 'order-3' then 3000 else 4000 end
  ),
  '{}'::jsonb, event.occurred_at
from loyalty_private.canonical_commerce_events as event
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = event.organization_id
join loyalty.programme_versions as version
  on version.organization_id = event.organization_id
where event.source_event_id like 'report-event-%';

-- Create exact current/previous award and current capture flows through the
-- same atomic posting primitive used by value commands. Projections are then
-- set to a large exact value to prove browser-facing text does not lose bigint
-- precision.
select * from loyalty_private.post_ledger_transaction(
  (select id from loyalty.organizations where slug = 'report-one'),
  (select id from loyalty.programme_groups where public_id = '79000000-0000-4000-8000-000000000110'),
  (select id from loyalty.programme_versions where public_id = '79000000-0000-4000-8000-000000000140'),
  'award', 'worker', 'report-fixture', null, null, null,
  'report:ledger:award:current',
  extensions.digest(convert_to('award-current', 'UTF8'), 'sha256'),
  null, '{}'::jsonb, '2026-08-08T11:00:00Z',
  jsonb_build_array(
    jsonb_build_object(
      'account_id', (select id from loyalty.ledger_accounts
        where programme_group_id = (select id from loyalty.programme_groups where public_id = '79000000-0000-4000-8000-000000000110')
          and wallet_id is null and account_kind = 'issuance'),
      'points', -100
    ),
    jsonb_build_object(
      'account_id', (select account.id from loyalty.ledger_accounts as account
        join loyalty.wallets as wallet on wallet.id = account.wallet_id
        join loyalty.customers as customer on customer.id = wallet.customer_id
        where customer.display_reference = 'Member 1' and account.account_kind = 'pending'),
      'points', 100
    )
  )
);
select * from loyalty_private.post_ledger_transaction(
  (select id from loyalty.organizations where slug = 'report-one'),
  (select id from loyalty.programme_groups where public_id = '79000000-0000-4000-8000-000000000110'),
  (select id from loyalty.programme_versions where public_id = '79000000-0000-4000-8000-000000000140'),
  'award', 'worker', 'report-fixture', null, null, null,
  'report:ledger:award:previous',
  extensions.digest(convert_to('award-previous', 'UTF8'), 'sha256'),
  null, '{}'::jsonb, '2026-08-02T11:00:00Z',
  jsonb_build_array(
    jsonb_build_object(
      'account_id', (select id from loyalty.ledger_accounts
        where programme_group_id = (select id from loyalty.programme_groups where public_id = '79000000-0000-4000-8000-000000000110')
          and wallet_id is null and account_kind = 'issuance'),
      'points', -100
    ),
    jsonb_build_object(
      'account_id', (select account.id from loyalty.ledger_accounts as account
        join loyalty.wallets as wallet on wallet.id = account.wallet_id
        join loyalty.customers as customer on customer.id = wallet.customer_id
        where customer.display_reference = 'Member 3' and account.account_kind = 'pending'),
      'points', 100
    )
  )
);
update loyalty.wallet_balances as balance
set points = 25
from loyalty.ledger_accounts as account
join loyalty.wallets as wallet on wallet.id = account.wallet_id
join loyalty.customers as customer on customer.id = wallet.customer_id
where balance.ledger_account_id = account.id
  and customer.display_reference = 'Member 1'
  and account.account_kind = 'reserved';
select * from loyalty_private.post_ledger_transaction(
  (select id from loyalty.organizations where slug = 'report-one'),
  (select id from loyalty.programme_groups where public_id = '79000000-0000-4000-8000-000000000110'),
  (select id from loyalty.programme_versions where public_id = '79000000-0000-4000-8000-000000000140'),
  'capture', 'worker', 'report-fixture', null, null, null,
  'report:ledger:capture:current',
  extensions.digest(convert_to('capture-current', 'UTF8'), 'sha256'),
  null, '{}'::jsonb, '2026-08-10T11:00:00Z',
  jsonb_build_array(
    jsonb_build_object(
      'account_id', (select account.id from loyalty.ledger_accounts as account
        join loyalty.wallets as wallet on wallet.id = account.wallet_id
        join loyalty.customers as customer on customer.id = wallet.customer_id
        where customer.display_reference = 'Member 1' and account.account_kind = 'reserved'),
      'points', -25
    ),
    jsonb_build_object(
      'account_id', (select account.id from loyalty.ledger_accounts as account
        join loyalty.wallets as wallet on wallet.id = account.wallet_id
        join loyalty.customers as customer on customer.id = wallet.customer_id
        where customer.display_reference = 'Member 1' and account.account_kind = 'spent'),
      'points', 25
    )
  )
);

update loyalty.wallet_balances as balance
set points = case
  when customer.display_reference = 'Member 1' and balance.account_kind = 'pending' then 100
  when customer.display_reference = 'Member 1' and balance.account_kind = 'available' then 9007199254740993
  when customer.display_reference = 'Member 1' and balance.account_kind = 'reserved' then 25
  when customer.display_reference = 'Member 2' and balance.account_kind = 'pending' then 10
  when customer.display_reference = 'Member 2' and balance.account_kind = 'available' then 20
  when customer.display_reference = 'Member 2' and balance.account_kind = 'reserved' then 5
  when customer.display_reference = 'Member 3' and balance.account_kind = 'pending' then 1
  when customer.display_reference = 'Member 3' and balance.account_kind = 'available' then 2
  when customer.display_reference = 'Member 3' and balance.account_kind = 'reserved' then 3
  else balance.points
end
from loyalty.ledger_accounts as account
join loyalty.wallets as wallet on wallet.id = account.wallet_id
join loyalty.customers as customer on customer.id = wallet.customer_id
where balance.ledger_account_id = account.id;

set local role authenticated;
set local request.jwt.claim.sub = '79000000-0000-4000-8000-000000000001';
create temporary table owner_report as
select * from loyalty.get_overview_report(
  '79000000-0000-4000-8000-000000000100',
  '79000000-0000-4000-8000-000000000101',
  '79000000-0000-4000-8000-000000000110',
  7, '2026-08-12T12:00:00Z'
);
select results_eq($$ select count(*)::bigint from owner_report $$, array[1::bigint], 'authorized report returns one aggregate row');
select results_eq($$ select report_version from owner_report $$, array['1'::text], 'report contract is explicitly versioned');
select results_eq($$ select range_days from owner_report $$, array[7], 'report returns the selected bounded range');
select results_eq($$ select members_total from owner_report $$, array['3'::text], 'workspace-scoped member total is exact text');
select results_eq($$ select members_new from owner_report $$, array['2'::text], 'current period counts two new members');
select results_eq($$ select members_new_previous from owner_report $$, array['1'::text], 'previous aligned period counts one new member');
select results_eq($$ select eligible_spend_minor from owner_report $$, array['6000'::text], 'eligible member spend aggregates private current evaluations');
select results_eq($$ select eligible_spend_minor_previous from owner_report $$, array['4000'::text], 'previous spend uses an equal aligned period');
select results_eq($$ select repeat_rate_basis_points from owner_report $$, array['5000'::text], 'one of two registered purchasers is a repeat member');
select results_eq($$ select repeat_rate_basis_points_previous from owner_report $$, array['0'::text], 'previous repeat rate has a zero-safe denominator');
select results_eq($$ select redemption_rate_basis_points from owner_report $$, array['2500'::text], 'captured points are compared with current awarded points');
select results_eq($$ select redemption_rate_basis_points_previous from owner_report $$, array['0'::text], 'previous period has no captured points');
select results_eq($$ select outstanding_points from owner_report $$, array['9007199254741159'::text], 'liability preserves values beyond JavaScript safe integer precision');
select results_eq($$ select currency_code from owner_report $$, array['EUR'::text], 'published programme supplies report currency');
select results_eq($$ select minor_units_per_major from owner_report $$, array[100], 'published programme supplies exact currency scaling');
select results_eq($$ select jsonb_array_length(daily_new_members) from owner_report $$, array[7], 'daily trend has exactly one point per day');
select results_eq(
  $$ select sum((point ->> 'current')::bigint)::bigint
     from owner_report, jsonb_array_elements(daily_new_members) as point $$,
  array[2::bigint], 'current daily buckets reconcile to current new members'
);
select results_eq(
  $$ select sum((point ->> 'previous')::bigint)::bigint
     from owner_report, jsonb_array_elements(daily_new_members) as point $$,
  array[1::bigint], 'previous daily buckets reconcile to previous new members'
);
select results_eq(
  $$ select point ->> 'current'
     from owner_report, jsonb_array_elements(daily_new_members) as point
     where point ->> 'date' = '2026-08-07' $$,
  array['1'::text], 'daily trend uses stable UTC date labels'
);
select is_empty(
  $$ select parameter_name from information_schema.parameters
     where specific_schema = 'loyalty'
       and specific_name like 'get_overview_report_%'
       and parameter_name in (
         'payload', 'external_customer_id', 'source_object_id', 'metadata',
         'actor_id', 'reason'
       ) $$,
  'report signature exposes no private evidence fields'
);
select throws_ok(
  $$ select * from loyalty.get_overview_report(
    '79000000-0000-4000-8000-000000000100',
    '79000000-0000-4000-8000-000000000101',
    '79000000-0000-4000-8000-000000000110',
    365, '2026-08-12T12:00:00Z'
  ) $$,
  '22023', 'invalid overview report request',
  'unsupported report ranges fail closed'
);
select is_empty(
  $$ select * from loyalty.get_overview_report(
    '7a000000-0000-4000-8000-000000000100',
    '7a000000-0000-4000-8000-000000000101',
    '7a000000-0000-4000-8000-000000000110',
    7, '2026-08-12T12:00:00Z'
  ) $$,
  'one tenant cannot read another tenant report'
);
set local request.jwt.claim.sub = '79000000-0000-4000-8000-000000000002';
select results_eq(
  $$ select members_total from loyalty.get_overview_report(
    '79000000-0000-4000-8000-000000000100',
    '79000000-0000-4000-8000-000000000101',
    '79000000-0000-4000-8000-000000000110',
    7, '2026-08-12T12:00:00Z'
  ) $$,
  array['3'::text], 'analyst role can read minimized aggregates'
);
set local request.jwt.claim.sub = '79000000-0000-4000-8000-000000000003';
select is_empty(
  $$ select * from loyalty.get_overview_report(
    '79000000-0000-4000-8000-000000000100',
    '79000000-0000-4000-8000-000000000101',
    '79000000-0000-4000-8000-000000000110',
    7, '2026-08-12T12:00:00Z'
  ) $$,
  'revoked members receive no aggregate row with a live token'
);
set local request.jwt.claim.sub = '7a000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select members_total || ':' || outstanding_points
     from loyalty.get_overview_report(
       '7a000000-0000-4000-8000-000000000100',
       '7a000000-0000-4000-8000-000000000101',
       '7a000000-0000-4000-8000-000000000110',
       7, '2026-08-12T12:00:00Z'
     ) $$,
  array['0:0'::text], 'another tenant receives only its own empty report'
);
select is_empty(
  $$ select * from loyalty.get_overview_report(
    '79000000-0000-4000-8000-000000000100',
    '79000000-0000-4000-8000-000000000101',
    '79000000-0000-4000-8000-000000000110',
    7, '2026-08-12T12:00:00Z'
  ) $$,
  'another tenant owner cannot read the populated report'
);
select ok(
  not has_table_privilege(
    'authenticated', 'loyalty_private.programme_evaluations', 'SELECT'
  ),
  'browser users cannot read private evaluation evidence directly'
);
select ok(
  not has_table_privilege(
    'authenticated', 'loyalty_private.canonical_commerce_events', 'SELECT'
  ),
  'browser users cannot read raw canonical commerce payloads directly'
);
reset role;
select results_eq(
  $$ select count(*)::bigint from loyalty.admin_audit_events
     where organization_id = (
       select id from loyalty.organizations where slug = 'report-one'
     ) $$,
  array[0::bigint], 'read-only reporting appends no mutation audit event'
);

select * from finish();
rollback;
