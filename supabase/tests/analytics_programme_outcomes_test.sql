begin;

create extension if not exists pgtap with schema extensions;

select plan(23);

select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.get_analytics_programme_outcomes_v1(uuid,uuid,uuid,integer,timestamp with time zone)',
    'EXECUTE'
  ),
  'authenticated members can enter the guarded outcome report'
);
select ok(
  not has_function_privilege(
    'anon',
    'loyalty.get_analytics_programme_outcomes_v1(uuid,uuid,uuid,integer,timestamp with time zone)',
    'EXECUTE'
  ),
  'anonymous callers cannot enter outcome reporting'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'loyalty'
      and routine.proname = 'get_analytics_programme_outcomes_v1'
      and routine.prosecdef
      and routine.provolatile = 's'
      and exists (
        select 1 from unnest(routine.proconfig) as setting
        where setting = 'search_path=""'
      )
  $$,
  array[1::bigint],
  'the outcome report is stable security-definer code with an empty search path'
);
select has_index(
  'loyalty', 'reward_reservations',
  'reward_reservations_analytics_period_idx',
  'reward occurrence reads have a scoped index'
);
select is_empty(
  $$
    select parameter_name
    from information_schema.parameters
    where specific_schema = 'loyalty'
      and specific_name like 'get_analytics_programme_outcomes_v1_%'
      and parameter_name in (
        'organization_id', 'workspace_id', 'programme_group_id',
        'customer_id', 'wallet_id', 'payload', 'metadata', 'actor_id'
      )
  $$,
  'the public signature accepts no internal authority or private fact'
);

insert into auth.users (id, email)
values
  ('8f000000-0000-4000-8000-000000000001', 'outcome-owner@example.test'),
  ('8f000000-0000-4000-8000-000000000002', 'outcome-analyst@example.test'),
  ('8f000000-0000-4000-8000-000000000003', 'outcome-revoked@example.test'),
  ('9f000000-0000-4000-8000-000000000001', 'outcome-other@example.test');

insert into loyalty.organizations (public_id, slug, name)
values
  ('8f000000-0000-4000-8000-000000000100', 'outcome-analytics-one', 'Outcome Analytics One'),
  ('9f000000-0000-4000-8000-000000000100', 'outcome-analytics-two', 'Outcome Analytics Two');

insert into loyalty.organization_memberships (
  organization_id, user_id, role, created_at, revoked_at
)
values
  ((select id from loyalty.organizations where slug = 'outcome-analytics-one'), '8f000000-0000-4000-8000-000000000001', 'owner', '2026-07-01T00:00:00Z', null),
  ((select id from loyalty.organizations where slug = 'outcome-analytics-one'), '8f000000-0000-4000-8000-000000000002', 'analyst', '2026-07-01T00:00:00Z', null),
  ((select id from loyalty.organizations where slug = 'outcome-analytics-one'), '8f000000-0000-4000-8000-000000000003', 'admin', '2026-07-01T00:00:00Z', '2026-08-01T00:00:00Z'),
  ((select id from loyalty.organizations where slug = 'outcome-analytics-two'), '9f000000-0000-4000-8000-000000000001', 'owner', '2026-07-01T00:00:00Z', null);

insert into loyalty.workspaces (public_id, organization_id, slug, name)
select case organization.slug
    when 'outcome-analytics-one' then '8f000000-0000-4000-8000-000000000101'::uuid
    else '9f000000-0000-4000-8000-000000000101'::uuid
  end,
  organization.id, 'shop', organization.name || ' Shop'
from loyalty.organizations as organization
where organization.slug in ('outcome-analytics-one', 'outcome-analytics-two');

insert into loyalty.programme_groups (public_id, organization_id, slug, name)
select case organization.slug
    when 'outcome-analytics-one' then '8f000000-0000-4000-8000-000000000110'::uuid
    else '9f000000-0000-4000-8000-000000000110'::uuid
  end,
  organization.id, 'rewards', organization.name || ' Rewards'
from loyalty.organizations as organization
where organization.slug in ('outcome-analytics-one', 'outcome-analytics-two');

insert into loyalty.programme_group_workspaces (
  organization_id, programme_group_id, workspace_id
)
select organization.id, programme_group.id, workspace.id
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
join loyalty.workspaces as workspace
  on workspace.organization_id = organization.id
where organization.slug in ('outcome-analytics-one', 'outcome-analytics-two');

insert into loyalty.programmes (
  public_id, organization_id, programme_group_id, slug, name, status
)
select case organization.slug
    when 'outcome-analytics-one' then '8f000000-0000-4000-8000-000000000130'::uuid
    else '9f000000-0000-4000-8000-000000000130'::uuid
  end,
  organization.id, programme_group.id, 'rewards',
  organization.name || ' Rewards', 'active'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
where organization.slug in ('outcome-analytics-one', 'outcome-analytics-two');

insert into loyalty.programme_versions (
  public_id, organization_id, programme_group_id, programme_id,
  version_number, status, configuration, configuration_sha256,
  approved_by_user_id, published_at
)
select case organization.slug
    when 'outcome-analytics-one' then '8f000000-0000-4000-8000-000000000140'::uuid
    else '9f000000-0000-4000-8000-000000000140'::uuid
  end,
  organization.id, programme_group.id, programme.id, 1, 'published',
  '{"currencyCode":"EUR","minorUnitsPerMajor":100,"tiers":[],"rewards":[]}'::jsonb,
  extensions.digest(convert_to(organization.slug, 'UTF8'), 'sha256'),
  case organization.slug
    when 'outcome-analytics-one' then '8f000000-0000-4000-8000-000000000001'::uuid
    else '9f000000-0000-4000-8000-000000000001'::uuid
  end,
  '2026-07-01T00:00:00Z'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
join loyalty.programmes as programme
  on programme.organization_id = organization.id
where organization.slug in ('outcome-analytics-one', 'outcome-analytics-two');

insert into loyalty.customers (
  public_id, organization_id, display_reference, created_at, updated_at
)
select '8f100000-0000-4000-8000-000000000001', organization.id,
  'Outcome member', '2026-07-01T00:00:00Z', '2026-07-01T00:00:00Z'
from loyalty.organizations as organization
where organization.slug = 'outcome-analytics-one';

insert into loyalty.wallets (
  public_id, organization_id, programme_group_id, customer_id,
  created_at, updated_at
)
select '8f200000-0000-4000-8000-000000000001', customer.organization_id,
  programme_group.id, customer.id,
  '2026-07-01T00:00:00Z', '2026-07-01T00:00:00Z'
from loyalty.customers as customer
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = customer.organization_id
where customer.public_id = '8f100000-0000-4000-8000-000000000001';

insert into loyalty.programme_tiers (
  organization_id, programme_group_id, programme_version_id,
  code, name, ordinal, minimum_eligible_spend_minor, points_per_major_unit
)
select version.organization_id, version.programme_group_id, version.id,
  tier.code, tier.name, tier.ordinal, tier.minimum_spend, tier.points_rate
from loyalty.programme_versions as version
cross join (values
  ('rose', 'Rose', 1::smallint, 0::bigint, 5::bigint),
  ('bloom', 'Bloom', 2::smallint, 10000::bigint, 6::bigint)
) as tier(code, name, ordinal, minimum_spend, points_rate)
where version.public_id = '8f000000-0000-4000-8000-000000000140';

insert into loyalty.programme_rewards (
  organization_id, programme_group_id, programme_version_id,
  code, name, reward_kind, cost_points, configuration
)
select version.organization_id, version.programme_group_id, version.id,
  'five-off', 'Five off', 'fixed_discount', 100,
  '{"amountMinor":"500","currencyMinorUnitDigits":2,"validityDays":7}'::jsonb
from loyalty.programme_versions as version
where version.public_id = '8f000000-0000-4000-8000-000000000140';

insert into loyalty.reward_reservations (
  public_id, organization_id, programme_group_id, programme_version_id,
  wallet_id, reward_id, cost_points, state, idempotency_key,
  request_sha256, expires_at, created_at, updated_at
)
select
  ('8f300000-0000-4000-8000-' || lpad(request.number::text, 12, '0'))::uuid,
  version.organization_id, version.programme_group_id, version.id,
  wallet.id, reward.id, 100, request.state,
  'outcome-reward-' || request.number,
  extensions.digest(convert_to('outcome-reward-' || request.number, 'UTF8'), 'sha256'),
  request.created_at + interval '30 days', request.created_at, request.updated_at
from (values
  (1, 'captured', '2026-08-19T12:00:00Z'::timestamptz, '2026-08-19T13:00:00Z'::timestamptz),
  (2, 'requested', '2026-08-20T12:00:00Z'::timestamptz, '2026-08-20T12:00:00Z'::timestamptz),
  (3, 'requested', '2026-08-25T12:00:00Z'::timestamptz, '2026-08-25T12:00:00Z'::timestamptz),
  (4, 'issued', '2026-08-18T12:00:00Z'::timestamptz, '2026-08-19T10:00:00Z'::timestamptz)
) as request(number, state, created_at, updated_at)
join loyalty.programme_versions as version
  on version.public_id = '8f000000-0000-4000-8000-000000000140'
join loyalty.wallets as wallet
  on wallet.public_id = '8f200000-0000-4000-8000-000000000001'
join loyalty.programme_rewards as reward
  on reward.programme_version_id = version.id
 and reward.code = 'five-off';

insert into loyalty.reward_reservation_transitions (
  organization_id, reservation_id, from_state, to_state, idempotency_key,
  request_sha256, actor_id, created_at
)
select reservation.organization_id, reservation.id,
  transition.from_state, transition.to_state,
  'outcome-transition-' || transition.number,
  extensions.digest(convert_to('outcome-transition-' || transition.number, 'UTF8'), 'sha256'),
  'test-fixture', transition.created_at
from (values
  (1, 1, 'requested', 'reserved', '2026-08-19T12:10:00Z'::timestamptz),
  (2, 1, 'reserved', 'issued', '2026-08-19T12:30:00Z'::timestamptz),
  (3, 1, 'issued', 'captured', '2026-08-19T13:00:00Z'::timestamptz),
  (4, 4, 'requested', 'reserved', '2026-08-18T14:00:00Z'::timestamptz),
  (5, 4, 'reserved', 'issued', '2026-08-19T10:00:00Z'::timestamptz)
) as transition(number, reservation_number, from_state, to_state, created_at)
join loyalty.reward_reservations as reservation
  on reservation.public_id = (
    '8f300000-0000-4000-8000-' ||
    lpad(transition.reservation_number::text, 12, '0')
  )::uuid;

insert into loyalty.tier_decisions (
  public_id, organization_id, programme_group_id, programme_version_id,
  wallet_id, tier_code, qualified_tier_code, transition,
  rolling_eligible_spend_minor, effective_at, idempotency_key,
  request_sha256, explanation, created_at
)
select
  ('8f400000-0000-4000-8000-' || lpad(decision.number::text, 12, '0'))::uuid,
  version.organization_id, version.programme_group_id, version.id,
  wallet.id, decision.tier_code, decision.tier_code, decision.transition,
  decision.spend, decision.effective_at, 'outcome-tier-' || decision.number,
  extensions.digest(convert_to('outcome-tier-' || decision.number, 'UTF8'), 'sha256'),
  '{}'::jsonb, decision.created_at
from (values
  (1, 'rose', 'entry', 0::bigint, '2026-08-19T08:00:00Z'::timestamptz, '2026-08-19T08:01:00Z'::timestamptz),
  (2, 'bloom', 'upgrade', 10000::bigint, '2026-08-20T08:00:00Z'::timestamptz, '2026-08-20T08:01:00Z'::timestamptz),
  (3, 'bloom', 'none', 11000::bigint, '2026-08-21T08:00:00Z'::timestamptz, '2026-08-21T08:01:00Z'::timestamptz),
  (4, 'rose', 'manual', 0::bigint, '2026-08-22T08:00:00Z'::timestamptz, '2026-08-22T08:01:00Z'::timestamptz)
) as decision(number, tier_code, transition, spend, effective_at, created_at)
join loyalty.programme_versions as version
  on version.public_id = '8f000000-0000-4000-8000-000000000140'
join loyalty.wallets as wallet
  on wallet.public_id = '8f200000-0000-4000-8000-000000000001';

insert into loyalty.commerce_connections (
  public_id, organization_id, workspace_id, external_store_id, display_name,
  current_key_version, signing_material_ref, programme_id,
  created_at, updated_at
)
select '8f500000-0000-4000-8000-000000000001', organization.id,
  workspace.id, 'https://outcome-analytics.example.test',
  'Outcome analytics WooCommerce', 'v1', 'vault://outcome-analytics',
  programme.id, '2026-07-01T00:00:00Z', '2026-07-01T00:00:00Z'
from loyalty.organizations as organization
join loyalty.workspaces as workspace
  on workspace.organization_id = organization.id
join loyalty.programmes as programme
  on programme.organization_id = organization.id
where organization.slug = 'outcome-analytics-one';

insert into loyalty.programme_referral_policies (
  organization_id, programme_group_id, programme_version_id,
  attribution_window_days, qualification_status, cooling_days,
  minimum_eligible_spend_minor, require_new_customer,
  monthly_advocate_referral_limit, advocate_reward_points,
  friend_reward_points, manual_review_enabled, risk_window_hours,
  source_network_referral_limit, device_referral_limit, created_at
)
select version.organization_id, version.programme_group_id, version.id,
  30, 'completed', 14, 2500, true, 10, 500, 250, true, 24, 3, 3,
  '2026-07-01T00:00:00Z'
from loyalty.programme_versions as version
where version.public_id = '8f000000-0000-4000-8000-000000000140';

insert into loyalty.customers (
  public_id, organization_id, display_reference, created_at, updated_at
)
select
  ('8f100000-0000-4000-8000-' || lpad(fixture.number::text, 12, '0'))::uuid,
  organization.id, 'Outcome friend ' || fixture.number,
  '2026-07-01T00:00:00Z', '2026-07-01T00:00:00Z'
from loyalty.organizations as organization
cross join (values (2), (3), (4), (5)) as fixture(number)
where organization.slug = 'outcome-analytics-one';

insert into loyalty.referral_advocates (
  public_id, organization_id, programme_group_id, customer_id,
  source_connection_id, status, created_at
)
select '8f510000-0000-4000-8000-000000000001', customer.organization_id,
  programme_group.id, customer.id, connection.id, 'active',
  '2026-08-01T00:00:00Z'
from loyalty.customers as customer
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = customer.organization_id
join loyalty.commerce_connections as connection
  on connection.organization_id = customer.organization_id
where customer.public_id = '8f100000-0000-4000-8000-000000000001';

insert into loyalty_private.commerce_delivery_inbox (
  receipt_id, organization_id, connection_id, source_delivery_id,
  envelope_version, source_event_id, event_type, source_object_id,
  source_revision, occurred_at, delivered_at, key_version, nonce,
  body_sha256, raw_body, state, accepted_at, last_received_at
)
select
  ('8f520000-0000-4000-8000-' || lpad(fixture.number::text, 12, '0'))::uuid,
  organization.id, connection.id,
  'outcome-referral-delivery-' || fixture.number, '1',
  'outcome-referral-event-' || fixture.number,
  'commerce.order.status_changed', 'outcome-referral-order-' || fixture.number,
  '1', fixture.occurred_at, fixture.occurred_at + interval '1 minute',
  'v1', 'outcome-referral-nonce-' || fixture.number, repeat('a', 64),
  '{}'::jsonb, 'applied', fixture.occurred_at + interval '1 minute',
  fixture.occurred_at + interval '1 minute'
from loyalty.organizations as organization
join loyalty.commerce_connections as connection
  on connection.organization_id = organization.id
cross join (values
  (1, '2026-08-20T10:00:00Z'::timestamptz),
  (2, '2026-08-21T10:00:00Z'::timestamptz),
  (3, '2026-08-22T10:00:00Z'::timestamptz),
  (4, '2026-08-23T10:00:00Z'::timestamptz)
) as fixture(number, occurred_at)
where organization.slug = 'outcome-analytics-one';

insert into loyalty_private.canonical_commerce_events (
  public_id, organization_id, connection_id, delivery_inbox_id,
  source_event_id, normalization_version, event_type, source_object_id,
  source_revision, occurred_at, payload, effect_state, created_at
)
select
  ('8f530000-0000-4000-8000-' || lpad(fixture.number::text, 12, '0'))::uuid,
  inbox.organization_id, inbox.connection_id, inbox.id,
  inbox.source_event_id, 'v1', inbox.event_type, inbox.source_object_id,
  inbox.source_revision, inbox.occurred_at, '{}'::jsonb, 'applied',
  inbox.occurred_at + interval '2 minutes'
from (values (1), (2), (3), (4)) as fixture(number)
join loyalty_private.commerce_delivery_inbox as inbox
  on inbox.receipt_id = (
    '8f520000-0000-4000-8000-' || lpad(fixture.number::text, 12, '0')
  )::uuid;

insert into loyalty.referral_attributions (
  public_id, organization_id, programme_group_id, programme_version_id,
  advocate_id, friend_customer_id, source_connection_id, source_event_id,
  source_order_id, captured_at, attribution_expires_at, risk_codes,
  created_at
)
select
  ('8f540000-0000-4000-8000-' || lpad(fixture.number::text, 12, '0'))::uuid,
  version.organization_id, version.programme_group_id, version.id,
  advocate.id, friend.id, connection.id, event.id,
  'outcome-referral-order-' || fixture.number, fixture.captured_at,
  fixture.captured_at + interval '30 days', array[]::text[],
  fixture.captured_at + interval '3 minutes'
from (values
  (1, '2026-08-20T10:00:00Z'::timestamptz),
  (2, '2026-08-21T10:00:00Z'::timestamptz),
  (3, '2026-08-22T10:00:00Z'::timestamptz),
  (4, '2026-08-23T10:00:00Z'::timestamptz)
) as fixture(number, captured_at)
join loyalty.programme_versions as version
  on version.public_id = '8f000000-0000-4000-8000-000000000140'
join loyalty.referral_advocates as advocate
  on advocate.public_id = '8f510000-0000-4000-8000-000000000001'
join loyalty.customers as friend
  on friend.public_id = (
    '8f100000-0000-4000-8000-' || lpad((fixture.number + 1)::text, 12, '0')
  )::uuid
join loyalty.commerce_connections as connection
  on connection.public_id = '8f500000-0000-4000-8000-000000000001'
join loyalty_private.canonical_commerce_events as event
  on event.public_id = (
    '8f530000-0000-4000-8000-' || lpad(fixture.number::text, 12, '0')
  )::uuid;

insert into loyalty.referral_attribution_transitions (
  organization_id, attribution_id, from_state, to_state, reason_code,
  actor_kind, idempotency_key, created_at
)
select attribution.organization_id, attribution.id,
  transition.from_state, transition.to_state, 'analytics_fixture', 'system',
  'outcome-referral-transition-' || transition.number,
  transition.created_at
from (values
  (1, 1, null::text, 'captured', '2026-08-20T10:04:00Z'::timestamptz),
  (2, 2, null::text, 'captured', '2026-08-21T10:04:00Z'::timestamptz),
  (3, 2, 'captured', 'qualified', '2026-08-21T11:00:00Z'::timestamptz),
  (4, 3, null::text, 'captured', '2026-08-22T10:04:00Z'::timestamptz),
  (5, 3, 'captured', 'rejected', '2026-08-22T11:00:00Z'::timestamptz),
  (6, 4, null::text, 'captured', '2026-08-23T10:04:00Z'::timestamptz),
  (7, 4, 'captured', 'qualified', '2026-08-23T11:00:00Z'::timestamptz),
  (8, 4, 'qualified', 'reversed', '2026-08-24T11:00:00Z'::timestamptz)
) as transition(number, attribution_number, from_state, to_state, created_at)
join loyalty.referral_attributions as attribution
  on attribution.public_id = (
    '8f540000-0000-4000-8000-' ||
    lpad(transition.attribution_number::text, 12, '0')
  )::uuid;

create function pg_temp.outcome_audience_definition()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'schemaVersion', '1', 'code', 'outcome-members',
    'name', 'Outcome members', 'description', '', 'match', 'all',
    'conditions', jsonb_build_array(jsonb_build_object(
      'kind', 'metric', 'metric', 'available_points',
      'operator', 'at_least', 'minimum', '0', 'maximum', null,
      'window', null, 'activityCodes', jsonb_build_array()
    ))
  );
$$;

insert into loyalty.audiences (
  public_id, organization_id, programme_group_id, code,
  created_by_user_id, created_at
)
select '8f600000-0000-4000-8000-000000000001', organization.id,
  programme_group.id, 'outcome-members',
  '8f000000-0000-4000-8000-000000000001', '2026-07-01T00:00:00Z'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
where organization.slug = 'outcome-analytics-one';

insert into loyalty.audience_versions (
  public_id, organization_id, programme_group_id, audience_id,
  version_number, status, definition, definition_sha256,
  created_by_user_id, created_at
)
select '8f600000-0000-4000-8000-000000000002', audience.organization_id,
  audience.programme_group_id, audience.id, 1, 'draft',
  pg_temp.outcome_audience_definition(),
  extensions.digest(
    pg_catalog.convert_to(pg_temp.outcome_audience_definition()::text, 'UTF8'),
    'sha256'
  ), '8f000000-0000-4000-8000-000000000001',
  '2026-07-01T00:01:00Z'
from loyalty.audiences as audience
where audience.public_id = '8f600000-0000-4000-8000-000000000001';

update loyalty.audience_versions
set status = 'published',
  approved_by_user_id = '8f000000-0000-4000-8000-000000000001',
  published_at = '2026-07-01T00:02:00Z'
where public_id = '8f600000-0000-4000-8000-000000000002';

insert into loyalty.audience_snapshots (
  public_id, organization_id, programme_group_id, audience_version_id,
  state, snapshot_at, member_count, definition_sha256,
  created_by_user_id, completed_at, created_at
)
select '8f600000-0000-4000-8000-000000000003', version.organization_id,
  version.programme_group_id, version.id, 'complete',
  '2026-07-01T00:03:00Z', 1, version.definition_sha256,
  '8f000000-0000-4000-8000-000000000001',
  '2026-07-01T00:04:00Z', '2026-07-01T00:03:00Z'
from loyalty.audience_versions as version
where version.public_id = '8f600000-0000-4000-8000-000000000002';

insert into loyalty_private.audience_snapshot_members (
  organization_id, programme_group_id, audience_snapshot_id,
  customer_id, wallet_id, evaluation, created_at
)
select snapshot.organization_id, snapshot.programme_group_id, snapshot.id,
  wallet.customer_id, wallet.id, '{"included":true}'::jsonb,
  '2026-07-01T00:04:00Z'
from loyalty.audience_snapshots as snapshot
join loyalty.wallets as wallet
  on wallet.organization_id = snapshot.organization_id
 and wallet.public_id = '8f200000-0000-4000-8000-000000000001'
where snapshot.public_id = '8f600000-0000-4000-8000-000000000003';

create function pg_temp.outcome_campaign_definition()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'schemaVersion', '1', 'code', 'outcome-campaign',
    'name', 'Outcome campaign', 'description', '',
    'audienceSnapshotId', '8f600000-0000-4000-8000-000000000003',
    'exclusionSnapshotIds', jsonb_build_array(),
    'schedule', jsonb_build_object(
      'timezone', 'UTC',
      'startsAt', '2026-08-19T00:00:00Z',
      'startsLocal', '2026-08-19T00:00:00',
      'endsAt', '2026-08-27T00:00:00Z',
      'endsLocal', '2026-08-27T00:00:00'
    ),
    'behavior', jsonb_build_object(
      'kind', 'bonus_points',
      'earningRuleCodes', jsonb_build_array('purchase'),
      'reward', jsonb_build_object('kind', 'points', 'points', '100')
    ),
    'capacity', jsonb_build_object(
      'globalEffectLimit', '10', 'perMemberEffectLimit', 10,
      'maximumPoints', '10000', 'maximumLiabilityMinor', null,
      'liabilityMinorPerEffect', null, 'liabilityCurrencyCode', null,
      'liabilityMinorUnitDigits', null
    ),
    'controlBasisPoints', 2500
  );
$$;

insert into loyalty.campaigns (
  public_id, organization_id, programme_group_id, programme_id,
  code, created_by_user_id, created_at
)
select '8f610000-0000-4000-8000-000000000001', programme.organization_id,
  programme.programme_group_id, programme.id, 'outcome-campaign',
  '8f000000-0000-4000-8000-000000000001', '2026-07-01T00:05:00Z'
from loyalty.programmes as programme
where programme.public_id = '8f000000-0000-4000-8000-000000000130';

insert into loyalty.campaign_versions (
  public_id, organization_id, programme_group_id, campaign_id,
  version_number, status, definition, definition_sha256,
  audience_snapshot_id, schedule_timezone, starts_at, ends_at,
  global_effect_limit, per_member_effect_limit, maximum_points,
  control_basis_points, created_by_user_id, status_changed_at, created_at
)
select '8f610000-0000-4000-8000-000000000002', campaign.organization_id,
  campaign.programme_group_id, campaign.id, 1, 'draft',
  pg_temp.outcome_campaign_definition(),
  extensions.digest(
    pg_catalog.convert_to(pg_temp.outcome_campaign_definition()::text, 'UTF8'),
    'sha256'
  ), snapshot.id, 'UTC', '2026-08-19T00:00:00Z',
  '2026-08-27T00:00:00Z', 10, 10, 10000, 2500,
  '8f000000-0000-4000-8000-000000000001',
  '2026-07-01T00:06:00Z', '2026-07-01T00:06:00Z'
from loyalty.campaigns as campaign
join loyalty.audience_snapshots as snapshot
  on snapshot.public_id = '8f600000-0000-4000-8000-000000000003'
where campaign.public_id = '8f610000-0000-4000-8000-000000000001';

select loyalty_private.ensure_wallet_accounts(
  organization.id, programme_group.id, customer.id
)
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
join loyalty.customers as customer
  on customer.organization_id = organization.id
 and customer.public_id = '8f100000-0000-4000-8000-000000000001'
where organization.slug = 'outcome-analytics-one';

select * from loyalty_private.post_ledger_transaction(
  (select id from loyalty.organizations
    where slug = 'outcome-analytics-one'),
  (select id from loyalty.programme_groups
    where public_id = '8f000000-0000-4000-8000-000000000110'),
  (select id from loyalty.programme_versions
    where public_id = '8f000000-0000-4000-8000-000000000140'),
  'award', 'worker', 'analytics-outcome-fixture',
  (select id from loyalty_private.canonical_commerce_events
    where public_id = '8f530000-0000-4000-8000-000000000001'),
  'outcome-campaign-order-1', null, 'outcome-campaign-award-1',
  extensions.digest(
    pg_catalog.convert_to('outcome-campaign-award-1', 'UTF8'), 'sha256'
  ), null, '{"campaign":"outcome-campaign"}'::jsonb,
  '2026-08-20T10:00:00Z',
  jsonb_build_array(
    jsonb_build_object(
      'account_id', (select id from loyalty.ledger_accounts
        where organization_id = (select id from loyalty.organizations
          where slug = 'outcome-analytics-one')
          and programme_group_id = (select id from loyalty.programme_groups
            where public_id = '8f000000-0000-4000-8000-000000000110')
          and wallet_id is null and account_kind = 'issuance'),
      'points', -100
    ),
    jsonb_build_object(
      'account_id', (select account.id
        from loyalty.ledger_accounts as account
        join loyalty.wallets as wallet on wallet.id = account.wallet_id
        where wallet.public_id = '8f200000-0000-4000-8000-000000000001'
          and account.account_kind = 'pending'),
      'points', 100
    )
  )
);

insert into loyalty_private.programme_evaluations (
  public_id, organization_id, programme_group_id, programme_version_id,
  canonical_event_id, evaluation_kind, subject_reference,
  idempotency_key, input_sha256, result_sha256, result, explanation,
  evaluated_at, created_at
)
select
  ('8f620000-0000-4000-8000-' || lpad(fixture.number::text, 12, '0'))::uuid,
  version.organization_id, version.programme_group_id, version.id, event.id,
  'live_award', 'outcome-campaign-order-' || fixture.number,
  'outcome-campaign-evaluation-' || fixture.number,
  extensions.digest(
    pg_catalog.convert_to('outcome-input-' || fixture.number, 'UTF8'), 'sha256'
  ),
  extensions.digest(
    pg_catalog.convert_to('outcome-result-' || fixture.number, 'UTF8'), 'sha256'
  ),
  jsonb_build_object('eligibleSpendMinor', fixture.eligible_spend::text),
  '{}'::jsonb, fixture.occurred_at + interval '5 minutes',
  fixture.occurred_at + interval '5 minutes'
from (values
  (1, 10000::bigint, '2026-08-20T10:00:00Z'::timestamptz),
  (2, 20000::bigint, '2026-08-21T10:00:00Z'::timestamptz),
  (3, 30000::bigint, '2026-08-22T10:00:00Z'::timestamptz),
  (4, 40000::bigint, '2026-08-23T10:00:00Z'::timestamptz)
) as fixture(number, eligible_spend, occurred_at)
join loyalty.programme_versions as version
  on version.public_id = '8f000000-0000-4000-8000-000000000140'
join loyalty_private.canonical_commerce_events as event
  on event.public_id = (
    '8f530000-0000-4000-8000-' || lpad(fixture.number::text, 12, '0')
  )::uuid;

insert into loyalty_private.campaign_execution_batches (
  public_id, organization_id, programme_group_id, programme_version_id,
  programme_evaluation_id, programme_transaction_id, canonical_event_id,
  customer_id, wallet_id, operation_key, input_sha256, result_sha256,
  campaign_context, baseline_result, campaign_evaluation,
  occurred_at, evaluated_at, created_at
)
select
  ('8f630000-0000-4000-8000-' || lpad(fixture.number::text, 12, '0'))::uuid,
  evaluation.organization_id, evaluation.programme_group_id,
  evaluation.programme_version_id, evaluation.id,
  case when fixture.number = 1 then transaction.id else null end,
  evaluation.canonical_event_id, wallet.customer_id, wallet.id,
  'outcome-campaign-batch-' || fixture.number,
  extensions.digest(
    pg_catalog.convert_to('outcome-batch-input-' || fixture.number, 'UTF8'),
    'sha256'
  ),
  extensions.digest(
    pg_catalog.convert_to('outcome-batch-result-' || fixture.number, 'UTF8'),
    'sha256'
  ), '{}'::jsonb,
  jsonb_build_object('eligibleSpendMinor', fixture.eligible_spend::text),
  '{}'::jsonb, fixture.occurred_at,
  fixture.occurred_at + interval '5 minutes',
  fixture.occurred_at + interval '5 minutes'
from (values
  (1, 10000::bigint, '2026-08-20T10:00:00Z'::timestamptz),
  (2, 20000::bigint, '2026-08-21T10:00:00Z'::timestamptz),
  (3, 30000::bigint, '2026-08-22T10:00:00Z'::timestamptz),
  (4, 40000::bigint, '2026-08-23T10:00:00Z'::timestamptz)
) as fixture(number, eligible_spend, occurred_at)
join loyalty_private.programme_evaluations as evaluation
  on evaluation.public_id = (
    '8f620000-0000-4000-8000-' || lpad(fixture.number::text, 12, '0')
  )::uuid
join loyalty.wallets as wallet
  on wallet.public_id = '8f200000-0000-4000-8000-000000000001'
left join loyalty.ledger_transactions as transaction
  on transaction.idempotency_key = 'outcome-campaign-award-1';

insert into loyalty_private.campaign_effects (
  public_id, organization_id, programme_group_id, campaign_version_id,
  execution_batch_id, customer_id, wallet_id, assignment, effect_kind,
  decision_outcome, matched_rule_codes, points, state,
  award_transaction_id, award_origin_entry_id, created_at
)
select
  ('8f640000-0000-4000-8000-' || lpad(fixture.number::text, 12, '0'))::uuid,
  batch.organization_id, batch.programme_group_id, version.id, batch.id,
  batch.customer_id, batch.wallet_id,
  case when fixture.outcome = 'control' then 'control' else 'treatment' end,
  'bonus_points', fixture.outcome, '["purchase"]'::jsonb,
  case when fixture.outcome = 'awarded' then 100 else 0 end,
  case when fixture.outcome = 'awarded' then 'committed' else 'recorded' end,
  case when fixture.outcome = 'awarded' then transaction.id else null end,
  case when fixture.outcome = 'awarded' then origin.id else null end,
  fixture.created_at
from (values
  (1, 'awarded', '2026-08-20T10:06:00Z'::timestamptz),
  (2, 'control', '2026-08-21T10:06:00Z'::timestamptz),
  (3, 'capacity_exhausted', '2026-08-22T10:06:00Z'::timestamptz),
  (4, 'suppressed', '2026-08-23T10:06:00Z'::timestamptz)
) as fixture(number, outcome, created_at)
join loyalty_private.campaign_execution_batches as batch
  on batch.public_id = (
    '8f630000-0000-4000-8000-' || lpad(fixture.number::text, 12, '0')
  )::uuid
join loyalty.campaign_versions as version
  on version.public_id = '8f610000-0000-4000-8000-000000000002'
left join loyalty.ledger_transactions as transaction
  on transaction.idempotency_key = 'outcome-campaign-award-1'
left join loyalty.ledger_entries as origin
  on origin.transaction_id = transaction.id
 and origin.points = 100;

insert into loyalty_private.programme_evaluations (
  public_id, organization_id, programme_group_id, programme_version_id,
  canonical_event_id, evaluation_kind, subject_reference,
  idempotency_key, input_sha256, result_sha256, result, explanation,
  evaluated_at, created_at
)
select '8f620000-0000-4000-8000-000000000005', version.organization_id,
  version.programme_group_id, version.id, event.id, 'live_refund',
  'outcome-campaign-refund-1', 'outcome-campaign-refund-evaluation-1',
  extensions.digest(pg_catalog.convert_to('outcome-refund-input', 'UTF8'), 'sha256'),
  extensions.digest(pg_catalog.convert_to('outcome-refund-result', 'UTF8'), 'sha256'),
  '{"cumulativeRefundedEligibleSpendMinor":"2500"}'::jsonb,
  '{}'::jsonb, '2026-08-24T10:00:00Z', '2026-08-24T10:00:00Z'
from loyalty.programme_versions as version
join loyalty_private.canonical_commerce_events as event
  on event.public_id = '8f530000-0000-4000-8000-000000000002'
where version.public_id = '8f000000-0000-4000-8000-000000000140';

insert into loyalty_private.campaign_purchase_refund_compensations (
  public_id, organization_id, programme_group_id, campaign_effect_id,
  original_evaluation_id, refund_evaluation_id, canonical_refund_event_id,
  cumulative_refunded_eligible_spend_minor, target_reversed_points,
  reversal_points, created_at
)
select '8f650000-0000-4000-8000-000000000001', effect.organization_id,
  effect.programme_group_id, effect.id, original.id, refund.id,
  refund.canonical_event_id, 2500, 0, 0, '2026-08-24T10:01:00Z'
from loyalty_private.campaign_effects as effect
join loyalty_private.campaign_execution_batches as batch
  on batch.id = effect.execution_batch_id
join loyalty_private.programme_evaluations as original
  on original.id = batch.programme_evaluation_id
join loyalty_private.programme_evaluations as refund
  on refund.public_id = '8f620000-0000-4000-8000-000000000005'
where effect.public_id = '8f640000-0000-4000-8000-000000000001';

set local role authenticated;
set local request.jwt.claim.sub = '8f000000-0000-4000-8000-000000000001';

create temporary table analytics_outcome_report as
select * from loyalty.get_analytics_programme_outcomes_v1(
  '8f000000-0000-4000-8000-000000000100',
  '8f000000-0000-4000-8000-000000000101',
  '8f000000-0000-4000-8000-000000000110',
  7, '2026-08-26T00:00:00Z'
);

select results_eq(
  $$ select count(*)::bigint from analytics_outcome_report $$,
  array[1::bigint], 'authorized outcome report returns one minimized row'
);
select results_eq(
  $$ select report_version || ':' || dictionary_version from analytics_outcome_report $$,
  array['1:3'::text], 'outcome report binds the additive V3 dictionary'
);
select results_eq(
  $$ select period_from::text || '/' || period_to::text from analytics_outcome_report $$,
  array['2026-08-19 00:00:00+00/2026-08-26 00:00:00+00'::text],
  'outcome report uses the exact UTC half-open period'
);
select results_eq(
  $$ select reward_requests || ':' || reward_captures || ':' || reward_captured_points || ':' || reward_unresolved_at_as_of from analytics_outcome_report $$,
  array['3:1:100:3'::text],
  'reward request capture point and unresolved facts reconcile'
);
select results_eq(
  $$ select reward_mature_cohort_from::text || '/' || reward_mature_cohort_to::text || ':' || reward_mature_requests || ':' || reward_mature_captures || ':' || reward_mature_unresolved || ':' || reward_mature_capture_rate_basis_points from analytics_outcome_report $$,
  array['2026-08-18 00:00:00+00/2026-08-25 00:00:00+00:3:1:2:3333'::text],
  'reward realization uses a complete 24-hour cohort'
);
select results_eq(
  $$ select tier_decisions || ':' || tier_moved_members || ':' || tier_entry || ':' || tier_upgrade || ':' || tier_manual || ':' || tier_none from analytics_outcome_report $$,
  array['4:1:1:1:1:1'::text],
  'VIP movements use immutable decisions rather than current membership'
);
select results_eq(
  $$ select referral_active_advocates || ':' || referral_attributions || ':' || referral_pending || ':' || referral_qualified || ':' || referral_rejected || ':' || referral_reversed || ':' || referral_qualification_rate_basis_points || ':' || referral_issuances || ':' || referral_advocate_points_net from analytics_outcome_report $$,
  array['1:4:1:1:1:1:2500:0:0'::text],
  'the referral funnel reconstructs each latest immutable state and exact rate'
);
select results_eq(
  $$ select campaign_currency_status || ':' || campaign_currency_code || ':' || campaign_currency_minor_unit_digits || ':' || campaign_treatment_outcomes || ':' || campaign_control_outcomes || ':' || campaign_capacity_exhausted || ':' || campaign_suppressed || ':' || campaign_influenced_orders || ':' || campaign_influenced_members || ':' || campaign_influenced_eligible_spend_minor || ':' || campaign_points_awarded_gross || ':' || campaign_points_reversed || ':' || campaign_points_net || ':' || campaign_manual_review_jobs from analytics_outcome_report $$,
  array['available:EUR:2:1:1:1:1:1:1:7500:100:0:100:0'::text],
  'campaign effects de-duplicate influenced orders, compensate spend, and retain operational outcomes'
);
select results_eq(
  $$ select campaign_incrementality_status || ':' || campaign_incrementality_reason || ':' || (campaign_incremental_revenue_minor is null)::text from analytics_outcome_report $$,
  array['unavailable:estimator_not_configured:true'::text],
  'direct attribution cannot become an incremental revenue claim'
);
select results_eq(
  $$ select reward_requests || ':' || reward_mature_requests || ':' || tier_decisions
     from loyalty.get_analytics_programme_outcomes_v1(
       '8f000000-0000-4000-8000-000000000100',
       '8f000000-0000-4000-8000-000000000101',
       '8f000000-0000-4000-8000-000000000110',
       7, '2026-08-20T00:00:00Z'
     ) $$,
  array['2:1:1'::text],
  'later requests and decisions do not rewrite an earlier as-of snapshot'
);
select throws_ok(
  $$ select * from loyalty.get_analytics_programme_outcomes_v1(
    '8f000000-0000-4000-8000-000000000100',
    '8f000000-0000-4000-8000-000000000101',
    '8f000000-0000-4000-8000-000000000110',
    365, '2026-08-26T00:00:00Z'
  ) $$,
  '22023', 'invalid analytics programme outcome request',
  'unsupported interactive ranges fail closed'
);
select is_empty(
  $$ select * from loyalty.get_analytics_programme_outcomes_v1(
    '8f000000-0000-4000-8000-000000000100',
    '9f000000-0000-4000-8000-000000000101',
    '8f000000-0000-4000-8000-000000000110',
    7, '2026-08-26T00:00:00Z'
  ) $$,
  'mixed public selectors cannot fabricate internal authority'
);
select is_empty(
  $$ select * from loyalty.get_analytics_programme_outcomes_v1(
    '9f000000-0000-4000-8000-000000000100',
    '9f000000-0000-4000-8000-000000000101',
    '9f000000-0000-4000-8000-000000000110',
    7, '2026-08-26T00:00:00Z'
  ) $$,
  'one tenant cannot read another tenant outcome report'
);

set local request.jwt.claim.sub = '8f000000-0000-4000-8000-000000000002';
select results_eq(
  $$ select reward_requests from loyalty.get_analytics_programme_outcomes_v1(
    '8f000000-0000-4000-8000-000000000100',
    '8f000000-0000-4000-8000-000000000101',
    '8f000000-0000-4000-8000-000000000110',
    7, '2026-08-26T00:00:00Z'
  ) $$,
  array['3'::text], 'analyst role receives only minimized aggregate evidence'
);
set local request.jwt.claim.sub = '8f000000-0000-4000-8000-000000000003';
select is_empty(
  $$ select * from loyalty.get_analytics_programme_outcomes_v1(
    '8f000000-0000-4000-8000-000000000100',
    '8f000000-0000-4000-8000-000000000101',
    '8f000000-0000-4000-8000-000000000110',
    7, '2026-08-26T00:00:00Z'
  ) $$,
  'revoked membership fails closed with a live token'
);

reset role;
select results_eq(
  $$ select count(*)::bigint from loyalty.reward_reservations
     where organization_id = (
       select id from loyalty.organizations where slug = 'outcome-analytics-one'
     ) $$,
  array[4::bigint], 'read-only outcome reports append no reward state'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.tier_decisions
     where organization_id = (
       select id from loyalty.organizations where slug = 'outcome-analytics-one'
     ) $$,
  array[4::bigint], 'read-only outcome reports append no VIP decision'
);

select * from loyalty_private.set_organization_entitlement(
  '8f000000-0000-4000-8000-000000000100', 'analytics', 'disabled', null,
  'local_control', 'operator:test', 'Disable analytics for outcome test',
  now() - interval '1 second', null
);
set local role authenticated;
set local request.jwt.claim.sub = '8f000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select * from loyalty.get_analytics_programme_outcomes_v1(
    '8f000000-0000-4000-8000-000000000100',
    '8f000000-0000-4000-8000-000000000101',
    '8f000000-0000-4000-8000-000000000110',
    7, '2026-08-26T00:00:00Z'
  ) $$,
  '42501', 'analytics capability disabled',
  'server-side entitlement disablement fails closed'
);

reset role;
select * from finish();
rollback;
