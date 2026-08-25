begin;

create extension if not exists pgtap with schema extensions;

select plan(27);

select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.get_analytics_commerce_performance_v1(uuid,uuid,uuid,integer,timestamp with time zone)',
    'EXECUTE'
  ),
  'authenticated members can enter the guarded commerce report'
);
select ok(
  not has_function_privilege(
    'anon',
    'loyalty.get_analytics_commerce_performance_v1(uuid,uuid,uuid,integer,timestamp with time zone)',
    'EXECUTE'
  ),
  'anonymous callers cannot enter commerce reporting'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'loyalty'
      and routine.proname = 'get_analytics_commerce_performance_v1'
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
select has_index(
  'loyalty_private', 'tier_qualification_facts',
  'tier_qualification_facts_analytics_period_idx',
  'V2 occurrence and knowledge-time reads have a scoped covering index'
);
select is_empty(
  $$
    select parameter_name
    from information_schema.parameters
    where specific_schema = 'loyalty'
      and specific_name like 'get_analytics_commerce_performance_v1_%'
      and parameter_name in (
        'organization_id', 'workspace_id', 'programme_group_id',
        'customer_id', 'wallet_id', 'payload', 'metadata', 'actor_id'
      )
  $$,
  'the public signature accepts no internal authority or private fact'
);

insert into auth.users (id, email)
values
  ('8d000000-0000-4000-8000-000000000001', 'commerce-owner@example.test'),
  ('8d000000-0000-4000-8000-000000000002', 'commerce-analyst@example.test'),
  ('8d000000-0000-4000-8000-000000000003', 'commerce-revoked@example.test'),
  ('8e000000-0000-4000-8000-000000000001', 'commerce-other@example.test');

insert into loyalty.organizations (public_id, slug, name)
values
  ('8d000000-0000-4000-8000-000000000100', 'commerce-analytics-one', 'Commerce Analytics One'),
  ('8e000000-0000-4000-8000-000000000100', 'commerce-analytics-two', 'Commerce Analytics Two');

insert into loyalty.organization_memberships (
  organization_id, user_id, role, revoked_at
)
values
  ((select id from loyalty.organizations where slug = 'commerce-analytics-one'), '8d000000-0000-4000-8000-000000000001', 'owner', null),
  ((select id from loyalty.organizations where slug = 'commerce-analytics-one'), '8d000000-0000-4000-8000-000000000002', 'analyst', null),
  ((select id from loyalty.organizations where slug = 'commerce-analytics-one'), '8d000000-0000-4000-8000-000000000003', 'admin', now()),
  ((select id from loyalty.organizations where slug = 'commerce-analytics-two'), '8e000000-0000-4000-8000-000000000001', 'owner', null);

insert into loyalty.workspaces (public_id, organization_id, slug, name)
select case organization.slug
    when 'commerce-analytics-one' then '8d000000-0000-4000-8000-000000000101'::uuid
    else '8e000000-0000-4000-8000-000000000101'::uuid
  end,
  organization.id, 'shop', organization.name || ' Shop'
from loyalty.organizations as organization
where organization.slug in ('commerce-analytics-one', 'commerce-analytics-two');

insert into loyalty.programme_groups (public_id, organization_id, slug, name)
select case organization.slug
    when 'commerce-analytics-one' then '8d000000-0000-4000-8000-000000000110'::uuid
    else '8e000000-0000-4000-8000-000000000110'::uuid
  end,
  organization.id, 'rewards', organization.name || ' Rewards'
from loyalty.organizations as organization
where organization.slug in ('commerce-analytics-one', 'commerce-analytics-two');

insert into loyalty.programme_group_workspaces (
  organization_id, programme_group_id, workspace_id
)
select organization.id, programme_group.id, workspace.id
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
join loyalty.workspaces as workspace
  on workspace.organization_id = organization.id
where organization.slug in ('commerce-analytics-one', 'commerce-analytics-two');

insert into loyalty.commerce_connections (
  public_id, organization_id, workspace_id, external_store_id, display_name,
  current_key_version, signing_material_ref
)
select case organization.slug
    when 'commerce-analytics-one' then '8d000000-0000-4000-8000-000000000120'::uuid
    else '8e000000-0000-4000-8000-000000000120'::uuid
  end,
  organization.id, workspace.id, organization.slug || '-store',
  organization.name || ' Store', 'v1', 'vault://' || organization.slug
from loyalty.organizations as organization
join loyalty.workspaces as workspace
  on workspace.organization_id = organization.id
where organization.slug in ('commerce-analytics-one', 'commerce-analytics-two');

insert into loyalty.programmes (
  public_id, organization_id, programme_group_id, slug, name, status
)
select case organization.slug
    when 'commerce-analytics-one' then '8d000000-0000-4000-8000-000000000130'::uuid
    else '8e000000-0000-4000-8000-000000000130'::uuid
  end,
  organization.id, programme_group.id, 'rewards',
  organization.name || ' Rewards', 'active'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
where organization.slug in ('commerce-analytics-one', 'commerce-analytics-two');

insert into loyalty.programme_versions (
  public_id, organization_id, programme_group_id, programme_id,
  version_number, status, configuration, configuration_sha256,
  approved_by_user_id, published_at
)
select case organization.slug
    when 'commerce-analytics-one' then '8d000000-0000-4000-8000-000000000140'::uuid
    else '8e000000-0000-4000-8000-000000000140'::uuid
  end,
  organization.id, programme_group.id, programme.id, 1, 'published',
  '{"currencyCode":"EUR","minorUnitsPerMajor":100,"tiers":[],"rewards":[]}'::jsonb,
  extensions.digest(convert_to(organization.slug, 'UTF8'), 'sha256'),
  case organization.slug
    when 'commerce-analytics-one' then '8d000000-0000-4000-8000-000000000001'::uuid
    else '8e000000-0000-4000-8000-000000000001'::uuid
  end,
  '2026-07-01T00:00:00Z'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
join loyalty.programmes as programme
  on programme.organization_id = organization.id
where organization.slug in ('commerce-analytics-one', 'commerce-analytics-two');

update loyalty.commerce_connections as connection
set programme_id = programme.id
from loyalty.programmes as programme
where programme.organization_id = connection.organization_id;

insert into loyalty.customers (
  public_id, organization_id, display_reference, created_at, updated_at
)
select
  ('8d100000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  organization.id, 'Commerce member ' || number,
  case number
    when 1 then '2026-07-20T12:00:00Z'::timestamptz
    when 2 then '2026-07-21T12:00:00Z'::timestamptz
    when 3 then '2026-07-01T12:00:00Z'::timestamptz
    else '2026-08-23T12:00:00Z'::timestamptz
  end,
  case number
    when 1 then '2026-07-20T12:00:00Z'::timestamptz
    when 2 then '2026-07-21T12:00:00Z'::timestamptz
    when 3 then '2026-07-01T12:00:00Z'::timestamptz
    else '2026-08-23T12:00:00Z'::timestamptz
  end
from generate_series(1, 4) as generated(number)
cross join loyalty.organizations as organization
where organization.slug = 'commerce-analytics-one';

insert into loyalty.customer_identities (
  organization_id, customer_id, commerce_connection_id,
  external_customer_id, identity_kind, verified_at
)
select customer.organization_id, customer.id, connection.id,
  identity.external_id, identity.kind, customer.created_at
from (
  values
    ('Commerce member 1', 'registered:1', 'registered'),
    ('Commerce member 2', 'guest-order:order-3', 'guest'),
    ('Commerce member 2', 'guest-order:order-6', 'guest'),
    ('Commerce member 3', 'registered:3', 'registered'),
    ('Commerce member 4', 'registered:4', 'registered')
) as identity(member_name, external_id, kind)
join loyalty.customers as customer
  on customer.display_reference = identity.member_name
join loyalty.commerce_connections as connection
  on connection.organization_id = customer.organization_id;

insert into loyalty.wallets (
  public_id, organization_id, programme_group_id, customer_id,
  created_at, updated_at
)
select
  ('8d200000-0000-4000-8000-' || lpad(row_number() over (order by customer.id)::text, 12, '0'))::uuid,
  customer.organization_id, programme_group.id, customer.id,
  customer.created_at, customer.created_at
from loyalty.customers as customer
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = customer.organization_id
where customer.display_reference like 'Commerce member %';

select loyalty_private.ensure_wallet_accounts(
  wallet.organization_id, wallet.programme_group_id, wallet.customer_id
)
from loyalty.wallets as wallet
join loyalty.organizations as organization
  on organization.id = wallet.organization_id
where organization.slug = 'commerce-analytics-one';

select * from loyalty_private.award_points(
  (select id from loyalty.organizations where slug = 'commerce-analytics-one'),
  (select id from loyalty.programme_groups where public_id = '8d000000-0000-4000-8000-000000000110'),
  (select id from loyalty.programme_versions where public_id = '8d000000-0000-4000-8000-000000000140'),
  (select id from loyalty.customers where display_reference = 'Commerce member 1'),
  100, 'analytics-commerce:activation-award',
  extensions.digest(convert_to('activation-award', 'UTF8'), 'sha256'),
  null, 'analytics-commerce-fixture', '2026-07-21T00:00:00Z'
);

select * from loyalty_private.release_points(
  (select id from loyalty.organizations where slug = 'commerce-analytics-one'),
  (select id from loyalty.programme_groups where public_id = '8d000000-0000-4000-8000-000000000110'),
  (select id from loyalty.programme_versions where public_id = '8d000000-0000-4000-8000-000000000140'),
  (
    select entry.public_id
    from loyalty.ledger_entries as entry
    join loyalty.ledger_transactions as transaction
      on transaction.id = entry.transaction_id
    join loyalty.ledger_accounts as account on account.id = entry.account_id
    where transaction.idempotency_key = 'analytics-commerce:activation-award'
      and account.account_kind = 'pending'
  ),
  '2027-08-10T00:00:00Z', 'analytics-commerce:activation-release',
  extensions.digest(convert_to('activation-release', 'UTF8'), 'sha256'),
  '2026-08-10T00:00:00Z'
);

insert into loyalty_private.commerce_delivery_inbox (
  receipt_id, organization_id, connection_id, source_delivery_id,
  envelope_version, source_event_id, event_type, source_object_id,
  occurred_at, delivered_at, key_version, nonce, body_sha256, raw_body, state
)
select
  ('8d300000-0000-4000-8000-' || lpad(event.number::text, 12, '0'))::uuid,
  organization.id, connection.id, 'commerce-analytics-delivery-' || event.number,
  '1', 'commerce-analytics-event-' || event.number, event.event_type,
  event.order_id, event.occurred_at, event.occurred_at + interval '1 hour',
  'v1', 'commerce-analytics-nonce-' || event.number,
  repeat(event.number::text, 64),
  '{}'::jsonb, 'applied'
from (
  values
    (1, 'order-1', 'commerce.order.status_changed', '2026-08-20T10:00:00Z'::timestamptz),
    (2, 'order-2', 'commerce.order.status_changed', '2026-08-21T10:00:00Z'::timestamptz),
    (3, 'order-3', 'commerce.order.status_changed', '2026-08-22T10:00:00Z'::timestamptz),
    (4, 'order-4', 'commerce.order.status_changed', '2026-08-10T10:00:00Z'::timestamptz),
    (5, 'order-5', 'commerce.order.status_changed', '2026-08-23T10:00:00Z'::timestamptz),
    (6, 'order-3', 'commerce.order.refunded', '2026-08-24T02:00:00Z'::timestamptz),
    (7, 'order-5', 'commerce.order.refunded', '2026-08-25T02:00:00Z'::timestamptz),
    (8, 'order-6', 'commerce.order.status_changed', '2026-08-23T12:00:00Z'::timestamptz),
    (9, 'order-6', 'commerce.order.refunded', '2026-08-25T12:00:00Z'::timestamptz)
) as event(number, order_id, event_type, occurred_at)
cross join loyalty.organizations as organization
join loyalty.commerce_connections as connection
  on connection.organization_id = organization.id
where organization.slug = 'commerce-analytics-one';

insert into loyalty_private.canonical_commerce_events (
  public_id, organization_id, connection_id, delivery_inbox_id,
  source_event_id, normalization_version, event_type, source_object_id,
  occurred_at, payload, effect_state
)
select
  ('8d400000-0000-4000-8000-' || lpad(row_number() over (order by inbox.id)::text, 12, '0'))::uuid,
  inbox.organization_id, inbox.connection_id, inbox.id, inbox.source_event_id,
  'v1', inbox.event_type, inbox.source_object_id, inbox.occurred_at,
  jsonb_build_object(
    'kind', case when inbox.event_type = 'commerce.order.refunded'
      then 'order_refunded' else 'order_status_changed' end,
    'order', jsonb_build_object(
      'customer', case inbox.source_object_id
        when 'order-3' then jsonb_build_object('kind', 'guest', 'guestOrderId', 'order-3')
        when 'order-6' then jsonb_build_object('kind', 'guest', 'guestOrderId', 'order-6')
        when 'order-5' then jsonb_build_object('kind', 'registered', 'externalCustomerId', '999')
        else jsonb_build_object(
          'kind', 'registered', 'externalCustomerId', case inbox.source_object_id
            when 'order-1' then '1' when 'order-2' then '1'
            when 'order-4' then '3' else right(inbox.source_object_id, 1)
          end
        )
      end
    )
  ),
  'applied'
from loyalty_private.commerce_delivery_inbox as inbox
join loyalty.organizations as organization
  on organization.id = inbox.organization_id
where organization.slug = 'commerce-analytics-one';

insert into loyalty_private.programme_evaluations (
  public_id, organization_id, programme_group_id, programme_version_id,
  canonical_event_id, evaluation_kind, subject_reference, idempotency_key,
  input_sha256, result_sha256, result, explanation, evaluated_at
)
select
  ('8d500000-0000-4000-8000-' || lpad(row_number() over (order by event.id)::text, 12, '0'))::uuid,
  event.organization_id, programme_group.id, version.id, event.id,
  'live_award', 'woocommerce:order:' || event.source_object_id,
  'commerce-analytics:evaluation:' || event.source_event_id,
  extensions.digest(convert_to('input:' || event.source_event_id, 'UTF8'), 'sha256'),
  extensions.digest(convert_to('result:' || event.source_event_id, 'UTF8'), 'sha256'),
  jsonb_build_object(
    'eligibleSpendMinor', case event.source_object_id
      when 'order-1' then 10000 when 'order-2' then 5000
      when 'order-3' then 3000 when 'order-4' then 20000
      else 4000 end
  ),
  '{}'::jsonb, event.occurred_at + interval '1 hour'
from loyalty_private.canonical_commerce_events as event
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = event.organization_id
join loyalty.programme_versions as version
  on version.organization_id = event.organization_id
where event.source_event_id in (
  'commerce-analytics-event-1', 'commerce-analytics-event-2',
  'commerce-analytics-event-3', 'commerce-analytics-event-4',
  'commerce-analytics-event-5'
);

insert into loyalty_private.programme_evaluations (
  public_id, organization_id, programme_group_id, programme_version_id,
  canonical_event_id, evaluation_kind, subject_reference, idempotency_key,
  input_sha256, result_sha256, result, explanation, evaluated_at
)
select
  ('8d510000-0000-4000-8000-' || lpad(row_number() over (order by event.id)::text, 12, '0'))::uuid,
  event.organization_id, programme_group.id, version.id, event.id,
  'live_refund',
  'woocommerce:order:' || event.source_object_id || ':refund:' || event.source_event_id,
  'commerce-analytics:evaluation:' || event.source_event_id,
  extensions.digest(convert_to('input:' || event.source_event_id, 'UTF8'), 'sha256'),
  extensions.digest(convert_to('result:' || event.source_event_id, 'UTF8'), 'sha256'),
  jsonb_build_object(
    'orderId', event.source_object_id,
    'originalEligibleSpendMinor', case event.source_object_id
      when 'order-3' then 3000 else 4000 end,
    'cumulativeRefundedEligibleSpendMinor', case event.source_object_id
      when 'order-3' then 1000 else 4000 end
  ),
  '{}'::jsonb, event.occurred_at
from loyalty_private.canonical_commerce_events as event
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = event.organization_id
join loyalty.programme_versions as version
  on version.organization_id = event.organization_id
where event.source_event_id in (
  'commerce-analytics-event-6', 'commerce-analytics-event-7'
);

insert into loyalty_private.programme_evaluations (
  public_id, organization_id, programme_group_id, programme_version_id,
  canonical_event_id, evaluation_kind, subject_reference, idempotency_key,
  input_sha256, result_sha256, result, explanation, evaluated_at
)
select
  ('8d520000-0000-4000-8000-' || lpad(row_number() over (order by event.id)::text, 12, '0'))::uuid,
  event.organization_id, programme_group.id, version.id, event.id,
  'tier_review', 'v2-fact:' || event.source_event_id,
  'commerce-analytics:evaluation:' || event.source_event_id,
  extensions.digest(convert_to('input:' || event.source_event_id, 'UTF8'), 'sha256'),
  extensions.digest(convert_to('result:' || event.source_event_id, 'UTF8'), 'sha256'),
  '{}'::jsonb, '{}'::jsonb, event.occurred_at
from loyalty_private.canonical_commerce_events as event
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = event.organization_id
join loyalty.programme_versions as version
  on version.organization_id = event.organization_id
where event.source_event_id in (
  'commerce-analytics-event-8', 'commerce-analytics-event-9'
);

insert into loyalty_private.tier_qualification_facts (
  organization_id, programme_group_id, source_programme_version_id,
  customer_id, canonical_event_id, evaluation_id, fact_kind,
  source_reference, eligible_spend_minor_delta, earned_points_delta,
  order_count_delta, referral_count_delta, verified_action_count_delta,
  activity_code, effective_at, recorded_at
)
select event.organization_id, programme_group.id, version.id, customer.id,
  event.id, evaluation.id, 'purchase', 'analytics-v2:purchase',
  7000, 70, 1, 0, 0, null,
  '2026-08-23T12:00:00Z', '2026-08-23T13:00:00Z'
from loyalty_private.canonical_commerce_events as event
join loyalty_private.programme_evaluations as evaluation
  on evaluation.organization_id = event.organization_id
 and evaluation.canonical_event_id = event.id
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = event.organization_id
join loyalty.programme_versions as version
  on version.organization_id = event.organization_id
join loyalty.customers as customer
  on customer.organization_id = event.organization_id
 and customer.display_reference = 'Commerce member 2'
where event.source_event_id = 'commerce-analytics-event-8';

insert into loyalty_private.tier_qualification_facts (
  organization_id, programme_group_id, source_programme_version_id,
  customer_id, canonical_event_id, evaluation_id, origin_fact_id, fact_kind,
  source_reference, eligible_spend_minor_delta, earned_points_delta,
  order_count_delta, referral_count_delta, verified_action_count_delta,
  activity_code, effective_at, recorded_at
)
select event.organization_id, original.programme_group_id,
  original.source_programme_version_id, original.customer_id,
  event.id, evaluation.id, original.id, 'refund', 'analytics-v2:refund',
  -2000, -20, 0, 0, 0, null,
  original.effective_at, '2026-08-25T12:00:00Z'
from loyalty_private.canonical_commerce_events as event
join loyalty_private.programme_evaluations as evaluation
  on evaluation.organization_id = event.organization_id
 and evaluation.canonical_event_id = event.id
join loyalty_private.tier_qualification_facts as original
  on original.organization_id = event.organization_id
 and original.source_reference = 'analytics-v2:purchase'
where event.source_event_id = 'commerce-analytics-event-9';

set local role authenticated;
set local request.jwt.claim.sub = '8d000000-0000-4000-8000-000000000001';

create temporary table analytics_commerce_report as
select * from loyalty.get_analytics_commerce_performance_v1(
  '8d000000-0000-4000-8000-000000000100',
  '8d000000-0000-4000-8000-000000000101',
  '8d000000-0000-4000-8000-000000000110',
  7, '2026-08-26T00:00:00Z'
);

select results_eq(
  $$ select count(*)::bigint from analytics_commerce_report $$,
  array[1::bigint], 'authorized report returns one minimized row'
);
select results_eq(
  $$ select report_version || ':' || dictionary_version from analytics_commerce_report $$,
  array['1:2'::text], 'commerce report binds the additive metric dictionary'
);
select results_eq(
  $$ select period_from::text || '/' || period_to::text from analytics_commerce_report $$,
  array['2026-08-19 00:00:00+00/2026-08-26 00:00:00+00'::text],
  'event attribution uses the exact UTC half-open period'
);
select results_eq(
  $$ select currency_status || ':' || currency_code || ':' || currency_minor_unit_digits from analytics_commerce_report $$,
  array['available:EUR:2'::text], 'one exact historical currency and precision are explicit'
);
select results_eq(
  $$ select members_total from analytics_commerce_report $$,
  array['4'::text], 'all programme-group wallets created before as-of are counted'
);
select results_eq(
  $$ select activation_cohort_from::text || '/' || activation_cohort_to::text || ':' || activation_cohort_members || ':' || activated_members || ':' || activation_rate_basis_points from analytics_commerce_report $$,
  array['2026-07-20 00:00:00+00/2026-07-27 00:00:00+00:2:1:5000'::text],
  'activation uses a complete 30-day cohort and release evidence only'
);
select results_eq(
  $$ select participating_members || ':' || participation_rate_basis_points from analytics_commerce_report $$,
  array['2:5000'::text], 'participation uses linked compensated activity and an exact denominator'
);
select results_eq(
  $$ select net_eligible_orders || ':' || net_eligible_spend_minor from analytics_commerce_report $$,
  array['4:22000'::text], 'V1 and V2 purchase/refund facts reconcile without double counting'
);
select results_eq(
  $$ select purchasing_members || ':' || repeat_purchasing_members || ':' || repeat_purchase_rate_basis_points from analytics_commerce_report $$,
  array['2:2:10000'::text], 'repeat purchase is member-grained and refund compensated'
);
select results_eq(
  $$ select average_order_value_minor from analytics_commerce_report $$,
  array['5500'::text], 'AOV uses exact net spend and net eligible orders'
);
select results_eq(
  $$ select observed_lifetime_eligible_spend_minor || ':' || observed_lifetime_purchasing_members || ':' || observed_lifetime_value_minor from analytics_commerce_report $$,
  array['42000:3:14000'::text], 'observed LTV is linked lifetime eligible spend with a visible denominator'
);
select results_eq(
  $$ select v1_net_eligible_orders || ':' || v2_net_eligible_orders from analytics_commerce_report $$,
  array['3:1'::text], 'source coverage reconciles exactly to the combined order count'
);
select results_eq(
  $$ select guest_net_eligible_orders || ':' || missing_customer_link_orders || ':' || missing_customer_link_spend_minor || ':' || coverage_status from analytics_commerce_report $$,
  array['2:1:0:partial_customer_linkage'::text],
  'guest activity remains included while missing linkage is explicit'
);

select results_eq(
  $$ select net_eligible_orders || ':' || net_eligible_spend_minor
     from loyalty.get_analytics_commerce_performance_v1(
       '8d000000-0000-4000-8000-000000000100',
       '8d000000-0000-4000-8000-000000000101',
       '8d000000-0000-4000-8000-000000000110',
       7, '2026-08-24T00:00:00Z'
     ) $$,
  array['5:29000'::text],
  'refunds recorded after as-of do not rewrite the earlier knowledge snapshot'
);
select throws_ok(
  $$ select * from loyalty.get_analytics_commerce_performance_v1(
    '8d000000-0000-4000-8000-000000000100',
    '8d000000-0000-4000-8000-000000000101',
    '8d000000-0000-4000-8000-000000000110',
    365, '2026-08-26T00:00:00Z'
  ) $$,
  '22023', 'invalid analytics commerce performance request',
  'unsupported interactive ranges fail closed'
);
select is_empty(
  $$ select * from loyalty.get_analytics_commerce_performance_v1(
    '8d000000-0000-4000-8000-000000000100',
    '8e000000-0000-4000-8000-000000000101',
    '8d000000-0000-4000-8000-000000000110',
    7, '2026-08-26T00:00:00Z'
  ) $$,
  'mixed public selectors cannot fabricate internal authority'
);
select is_empty(
  $$ select * from loyalty.get_analytics_commerce_performance_v1(
    '8e000000-0000-4000-8000-000000000100',
    '8e000000-0000-4000-8000-000000000101',
    '8e000000-0000-4000-8000-000000000110',
    7, '2026-08-26T00:00:00Z'
  ) $$,
  'one tenant cannot read another tenant report'
);

set local request.jwt.claim.sub = '8d000000-0000-4000-8000-000000000002';
select results_eq(
  $$ select net_eligible_orders from loyalty.get_analytics_commerce_performance_v1(
    '8d000000-0000-4000-8000-000000000100',
    '8d000000-0000-4000-8000-000000000101',
    '8d000000-0000-4000-8000-000000000110',
    7, '2026-08-26T00:00:00Z'
  ) $$,
  array['4'::text], 'analyst role receives only minimized aggregate evidence'
);
set local request.jwt.claim.sub = '8d000000-0000-4000-8000-000000000003';
select is_empty(
  $$ select * from loyalty.get_analytics_commerce_performance_v1(
    '8d000000-0000-4000-8000-000000000100',
    '8d000000-0000-4000-8000-000000000101',
    '8d000000-0000-4000-8000-000000000110',
    7, '2026-08-26T00:00:00Z'
  ) $$,
  'revoked membership fails closed with a live token'
);

reset role;
select results_eq(
  $$ select count(*)::bigint from loyalty_private.programme_evaluations
     where organization_id = (
       select id from loyalty.organizations where slug = 'commerce-analytics-one'
     ) $$,
  array[9::bigint], 'read-only reports append no evaluation evidence'
);

insert into loyalty.programmes (
  public_id, organization_id, programme_group_id, slug, name, status
)
select '8d000000-0000-4000-8000-000000000131', organization.id,
  programme_group.id, 'usd-rewards', 'USD Rewards', 'active'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
where organization.slug = 'commerce-analytics-one';
insert into loyalty.programme_versions (
  public_id, organization_id, programme_group_id, programme_id,
  version_number, status, configuration, configuration_sha256
)
select '8d000000-0000-4000-8000-000000000141', programme.organization_id,
  programme.programme_group_id, programme.id, 1, 'draft',
  '{"currencyCode":"USD","minorUnitsPerMajor":100,"tiers":[],"rewards":[]}'::jsonb,
  extensions.digest(convert_to('usd-version', 'UTF8'), 'sha256')
from loyalty.programmes as programme
where programme.public_id = '8d000000-0000-4000-8000-000000000131';
insert into loyalty_private.programme_evaluations (
  public_id, organization_id, programme_group_id, programme_version_id,
  canonical_event_id, evaluation_kind, subject_reference, idempotency_key,
  input_sha256, result_sha256, result, explanation, evaluated_at
)
select '8d530000-0000-4000-8000-000000000001', event.organization_id,
  version.programme_group_id, version.id, event.id, 'live_award',
  'woocommerce:order:usd-history', 'commerce-analytics:evaluation:usd-history',
  extensions.digest(convert_to('usd-input', 'UTF8'), 'sha256'),
  extensions.digest(convert_to('usd-result', 'UTF8'), 'sha256'),
  '{"eligibleSpendMinor":100}'::jsonb, '{}'::jsonb, '2026-08-10T12:00:00Z'
from loyalty_private.canonical_commerce_events as event
join loyalty.programme_versions as version
  on version.public_id = '8d000000-0000-4000-8000-000000000141'
where event.source_event_id = 'commerce-analytics-event-4';

set local role authenticated;
set local request.jwt.claim.sub = '8d000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select currency_status || ':' || currency_reason || ':' ||
       (net_eligible_spend_minor is null)::text || ':' || net_eligible_orders
     from loyalty.get_analytics_commerce_performance_v1(
       '8d000000-0000-4000-8000-000000000100',
       '8d000000-0000-4000-8000-000000000101',
       '8d000000-0000-4000-8000-000000000110',
       7, '2026-08-26T00:00:00Z'
     ) $$,
  array['unavailable:mixed_currency_scope:true:4'::text],
  'mixed historical currency hides monetary fields without hiding valid counts'
);

reset role;
select * from loyalty_private.set_organization_entitlement(
  '8d000000-0000-4000-8000-000000000100', 'analytics', 'disabled', null,
  'local_control', 'operator:test', 'Disable analytics for commerce test',
  now() - interval '1 second', null
);
set local role authenticated;
set local request.jwt.claim.sub = '8d000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select * from loyalty.get_analytics_commerce_performance_v1(
    '8d000000-0000-4000-8000-000000000100',
    '8d000000-0000-4000-8000-000000000101',
    '8d000000-0000-4000-8000-000000000110',
    7, '2026-08-26T00:00:00Z'
  ) $$,
  '42501', 'analytics capability disabled',
  'server-side entitlement disablement fails closed'
);

reset role;
select * from finish();
rollback;
