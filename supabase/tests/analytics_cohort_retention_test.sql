begin;

create extension if not exists pgtap with schema extensions;

select plan(26);

select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.get_analytics_cohort_retention_v1(uuid,uuid,uuid,integer,text,timestamp with time zone)',
    'EXECUTE'
  ),
  'authenticated members can enter the guarded cohort report'
);
select ok(
  not has_function_privilege(
    'anon',
    'loyalty.get_analytics_cohort_retention_v1(uuid,uuid,uuid,integer,text,timestamp with time zone)',
    'EXECUTE'
  ),
  'anonymous callers cannot enter cohort reporting'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'loyalty'
      and routine.proname = 'get_analytics_cohort_retention_v1'
      and routine.prosecdef
      and routine.provolatile = 's'
      and exists (
        select 1 from unnest(routine.proconfig) as setting
        where setting = 'search_path=""'
      )
  $$,
  array[1::bigint],
  'the cohort report is stable security-definer code with an empty search path'
);
select has_index(
  'loyalty', 'wallets', 'wallets_analytics_created_idx',
  'membership cohort reads have a scoped occurrence index'
);
select has_index(
  'loyalty', 'point_lots', 'point_lots_analytics_release_idx',
  'release cohort reads have a scoped wallet and availability index'
);
select is_empty(
  $$
    select parameter_name
    from information_schema.parameters
    where specific_schema = 'loyalty'
      and specific_name like 'get_analytics_cohort_retention_v1_%'
      and parameter_name in (
        'organization_id', 'workspace_id', 'programme_group_id',
        'customer_id', 'wallet_id', 'campaign_version_id', 'payload',
        'metadata', 'actor_id'
      )
  $$,
  'the public signature accepts no internal authority or private fact'
);

insert into auth.users (id, email)
values
  ('7c000000-0000-4000-8000-000000000001', 'cohort-owner@example.test'),
  ('7c000000-0000-4000-8000-000000000002', 'cohort-analyst@example.test'),
  ('7c000000-0000-4000-8000-000000000003', 'cohort-revoked@example.test'),
  ('7d000000-0000-4000-8000-000000000001', 'cohort-other@example.test');

insert into loyalty.organizations (public_id, slug, name)
values
  ('7c000000-0000-4000-8000-000000000100', 'cohort-analytics-one', 'Cohort Analytics One'),
  ('7d000000-0000-4000-8000-000000000100', 'cohort-analytics-two', 'Cohort Analytics Two');

insert into loyalty.organization_memberships (
  organization_id, user_id, role, created_at, revoked_at
)
values
  ((select id from loyalty.organizations where slug = 'cohort-analytics-one'), '7c000000-0000-4000-8000-000000000001', 'owner', now() - interval '1 day', null),
  ((select id from loyalty.organizations where slug = 'cohort-analytics-one'), '7c000000-0000-4000-8000-000000000002', 'analyst', now() - interval '1 day', null),
  ((select id from loyalty.organizations where slug = 'cohort-analytics-one'), '7c000000-0000-4000-8000-000000000003', 'admin', now() - interval '1 day', now()),
  ((select id from loyalty.organizations where slug = 'cohort-analytics-two'), '7d000000-0000-4000-8000-000000000001', 'owner', now() - interval '1 day', null);

insert into loyalty.workspaces (public_id, organization_id, slug, name)
select case organization.slug
    when 'cohort-analytics-one' then '7c000000-0000-4000-8000-000000000101'::uuid
    else '7d000000-0000-4000-8000-000000000101'::uuid
  end,
  organization.id, 'shop', organization.name || ' Shop'
from loyalty.organizations as organization
where organization.slug in ('cohort-analytics-one', 'cohort-analytics-two');

insert into loyalty.programme_groups (public_id, organization_id, slug, name)
select case organization.slug
    when 'cohort-analytics-one' then '7c000000-0000-4000-8000-000000000110'::uuid
    else '7d000000-0000-4000-8000-000000000110'::uuid
  end,
  organization.id, 'rewards', organization.name || ' Rewards'
from loyalty.organizations as organization
where organization.slug in ('cohort-analytics-one', 'cohort-analytics-two');

insert into loyalty.programme_group_workspaces (
  organization_id, programme_group_id, workspace_id
)
select organization.id, programme_group.id, workspace.id
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
join loyalty.workspaces as workspace
  on workspace.organization_id = organization.id
where organization.slug in ('cohort-analytics-one', 'cohort-analytics-two');

insert into loyalty.programmes (
  public_id, organization_id, programme_group_id, slug, name, status
)
select case organization.slug
    when 'cohort-analytics-one' then '7c000000-0000-4000-8000-000000000130'::uuid
    else '7d000000-0000-4000-8000-000000000130'::uuid
  end,
  organization.id, programme_group.id, 'rewards',
  organization.name || ' Rewards', 'active'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
where organization.slug in ('cohort-analytics-one', 'cohort-analytics-two');

insert into loyalty.programme_versions (
  public_id, organization_id, programme_group_id, programme_id,
  version_number, status, configuration, configuration_sha256,
  approved_by_user_id, published_at
)
select case organization.slug
    when 'cohort-analytics-one' then '7c000000-0000-4000-8000-000000000140'::uuid
    else '7d000000-0000-4000-8000-000000000140'::uuid
  end,
  organization.id, programme_group.id, programme.id, 1, 'published',
  '{"currencyCode":"EUR","minorUnitsPerMajor":100,"tiers":[],"rewards":[]}'::jsonb,
  extensions.digest(convert_to(organization.slug, 'UTF8'), 'sha256'),
  case organization.slug
    when 'cohort-analytics-one' then '7c000000-0000-4000-8000-000000000001'::uuid
    else '7d000000-0000-4000-8000-000000000001'::uuid
  end,
  now() - interval '1 day'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
join loyalty.programmes as programme
  on programme.organization_id = organization.id;

insert into loyalty.programme_earning_rules (
  organization_id, programme_group_id, programme_version_id, code, name,
  ordinal, source, enabled, priority, stackable, effect_kind, effect,
  conditions, purchase_exclusions, cap
)
select version.organization_id, version.programme_group_id, version.id,
  'purchase', 'Eligible purchases', 1, 'purchase', true, 0, false,
  'base_rate', '{"kind":"base_rate","pointsPerMajorUnit":"5"}'::jsonb,
  '{"productIds":[],"categoryIds":[],"currencyCodes":[],"markets":[],"channels":[],"activityCodes":[],"segmentCodes":[],"tierCodes":[],"startsAt":null,"endsAt":null}'::jsonb,
  '{"productIds":[],"categoryIds":[],"shipping":true,"tax":true,"fees":true,"giftCardPayments":true,"storeCreditPayments":true,"discounts":true}'::jsonb,
  '{"perEventPoints":null,"perMemberPoints":null,"memberPeriod":null,"rollingDays":null}'::jsonb
from loyalty.programme_versions as version
where version.public_id = '7c000000-0000-4000-8000-000000000140';

insert into loyalty.commerce_connections (
  public_id, organization_id, workspace_id, programme_id,
  external_store_id, display_name, current_key_version, signing_material_ref
)
select '7c000000-0000-4000-8000-000000000120', organization.id,
  workspace.id, programme.id, 'cohort-test-store', 'Cohort Test Store',
  'v1', 'vault://cohort-test-store'
from loyalty.organizations as organization
join loyalty.workspaces as workspace
  on workspace.organization_id = organization.id
join loyalty.programmes as programme
  on programme.organization_id = organization.id
where organization.slug = 'cohort-analytics-one';

insert into loyalty.customers (
  public_id, organization_id, display_reference, created_at, updated_at
)
select
  ('7c100000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  organization.id, 'Cohort member ' || number,
  date_trunc('day', statement_timestamp() + interval '3 days')
    - interval '64 days' + interval '12 hours',
  date_trunc('day', statement_timestamp() + interval '3 days')
    - interval '64 days' + interval '12 hours'
from generate_series(1, 60) as generated(number)
cross join loyalty.organizations as organization
where organization.slug = 'cohort-analytics-one';

insert into loyalty.wallets (
  public_id, organization_id, programme_group_id, customer_id,
  created_at, updated_at
)
select
  ('7c200000-0000-4000-8000-' || lpad(row_number() over (order by customer.id)::text, 12, '0'))::uuid,
  customer.organization_id, programme_group.id, customer.id,
  customer.created_at, customer.created_at
from loyalty.customers as customer
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = customer.organization_id
where customer.display_reference like 'Cohort member %';

do $$
declare
  selected_organization_id bigint;
  selected_programme_group_id bigint;
  selected_programme_version_id bigint;
  fixture record;
  award record;
  origin_entry_public_id uuid;
begin
  select organization.id, programme_group.id, version.id
  into selected_organization_id, selected_programme_group_id,
    selected_programme_version_id
  from loyalty.organizations as organization
  join loyalty.programme_groups as programme_group
    on programme_group.organization_id = organization.id
  join loyalty.programme_versions as version
    on version.organization_id = organization.id
   and version.programme_group_id = programme_group.id
  where organization.slug = 'cohort-analytics-one';

  for fixture in
    select input.sequence_number, customer.id as customer_id,
      customer.created_at + input.release_after as release_at
    from (values
      (1, 'Cohort member 1', interval '1 day'),
      (2, 'Cohort member 1', interval '32 days'),
      (3, 'Cohort member 2', interval '1 day')
    ) as input(sequence_number, member_name, release_after)
    join loyalty.customers as customer
      on customer.display_reference = input.member_name
  loop
    select * into strict award
    from loyalty_private.award_points(
      selected_organization_id,
      selected_programme_group_id,
      selected_programme_version_id,
      fixture.customer_id,
      100,
      'cohort-award-' || fixture.sequence_number,
      extensions.digest(
        convert_to('cohort-award-' || fixture.sequence_number, 'UTF8'),
        'sha256'
      ),
      null,
      'cohort-release-' || fixture.sequence_number,
      fixture.release_at - interval '1 hour'
    );

    select entry.public_id into strict origin_entry_public_id
    from loyalty.ledger_transactions as transaction
    join loyalty.ledger_entries as entry
      on entry.transaction_id = transaction.id
     and entry.points > 0
    join loyalty.ledger_accounts as account
      on account.id = entry.account_id
     and account.account_kind = 'pending'
    where transaction.public_id = award.transaction_public_id;

    perform * from loyalty_private.release_points(
      selected_organization_id,
      selected_programme_group_id,
      selected_programme_version_id,
      origin_entry_public_id,
      fixture.release_at + interval '365 days',
      'cohort-release-' || fixture.sequence_number,
      extensions.digest(
        convert_to('cohort-release-' || fixture.sequence_number, 'UTF8'),
        'sha256'
      ),
      fixture.release_at
    );
  end loop;
end;
$$;

create function pg_temp.cohort_audience_definition()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'schemaVersion', '1', 'code', 'cohort-members',
    'name', 'Cohort members', 'description', '', 'match', 'all',
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
select '7c600000-0000-4000-8000-000000000001', organization.id,
  programme_group.id, 'cohort-members',
  '7c000000-0000-4000-8000-000000000001', now()
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
where organization.slug = 'cohort-analytics-one';

insert into loyalty.audience_versions (
  public_id, organization_id, programme_group_id, audience_id,
  version_number, status, definition, definition_sha256,
  created_by_user_id, created_at
)
select '7c600000-0000-4000-8000-000000000002', audience.organization_id,
  audience.programme_group_id, audience.id, 1, 'draft',
  pg_temp.cohort_audience_definition(),
  extensions.digest(
    convert_to(pg_temp.cohort_audience_definition()::text, 'UTF8'), 'sha256'
  ), '7c000000-0000-4000-8000-000000000001', now()
from loyalty.audiences as audience
where audience.public_id = '7c600000-0000-4000-8000-000000000001';

update loyalty.audience_versions
set status = 'published',
  approved_by_user_id = '7c000000-0000-4000-8000-000000000001',
  published_at = now()
where public_id = '7c600000-0000-4000-8000-000000000002';

insert into loyalty.audience_snapshots (
  public_id, organization_id, programme_group_id, audience_version_id,
  state, snapshot_at, member_count, definition_sha256,
  created_by_user_id, completed_at, created_at
)
select '7c600000-0000-4000-8000-000000000003', version.organization_id,
  version.programme_group_id, version.id, 'complete', now(), 60,
  version.definition_sha256, '7c000000-0000-4000-8000-000000000001',
  now(), now()
from loyalty.audience_versions as version
where version.public_id = '7c600000-0000-4000-8000-000000000002';

insert into loyalty_private.audience_snapshot_members (
  organization_id, programme_group_id, audience_snapshot_id,
  customer_id, wallet_id, evaluation, created_at
)
select snapshot.organization_id, snapshot.programme_group_id, snapshot.id,
  wallet.customer_id, wallet.id, '{"included":true}'::jsonb, now()
from loyalty.audience_snapshots as snapshot
join loyalty.wallets as wallet
  on wallet.organization_id = snapshot.organization_id
where snapshot.public_id = '7c600000-0000-4000-8000-000000000003';

create function pg_temp.cohort_campaign_definition()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'schemaVersion', '1', 'code', 'cohort-experiment',
    'name', 'Cohort experiment', 'description', '',
    'audienceSnapshotId', '7c600000-0000-4000-8000-000000000003',
    'exclusionSnapshotIds', jsonb_build_array(),
    'schedule', jsonb_build_object(
      'timezone', 'UTC',
      'startsAt', date_trunc('day', statement_timestamp()) + interval '1 day',
      'startsLocal', to_char(
        date_trunc('day', statement_timestamp()) + interval '1 day',
        'YYYY-MM-DD"T"HH24:MI:SS'
      ),
      'endsAt', date_trunc('day', statement_timestamp()) + interval '2 days',
      'endsLocal', to_char(
        date_trunc('day', statement_timestamp()) + interval '2 days',
        'YYYY-MM-DD"T"HH24:MI:SS'
      )
    ),
    'behavior', jsonb_build_object(
      'kind', 'bonus_points',
      'earningRuleCodes', jsonb_build_array('purchase'),
      'reward', jsonb_build_object('kind', 'points', 'points', '100')
    ),
    'capacity', jsonb_build_object(
      'globalEffectLimit', '120', 'perMemberEffectLimit', 2,
      'maximumPoints', '12000', 'maximumLiabilityMinor', null,
      'liabilityMinorPerEffect', null, 'liabilityCurrencyCode', null,
      'liabilityMinorUnitDigits', null
    ),
    'controlBasisPoints', 5000
  );
$$;

insert into loyalty.campaigns (
  public_id, organization_id, programme_group_id, programme_id,
  code, created_by_user_id, created_at
)
select '7c610000-0000-4000-8000-000000000001', programme.organization_id,
  programme.programme_group_id, programme.id, 'cohort-experiment',
  '7c000000-0000-4000-8000-000000000001', now()
from loyalty.programmes as programme
where programme.public_id = '7c000000-0000-4000-8000-000000000130';

insert into loyalty.campaign_versions (
  public_id, organization_id, programme_group_id, campaign_id,
  version_number, status, definition, definition_sha256,
  audience_snapshot_id, schedule_timezone, starts_at, ends_at,
  global_effect_limit, per_member_effect_limit, maximum_points,
  control_basis_points, created_by_user_id, status_changed_at, created_at
)
select '7c610000-0000-4000-8000-000000000002', campaign.organization_id,
  campaign.programme_group_id, campaign.id, 1, 'draft',
  pg_temp.cohort_campaign_definition(),
  extensions.digest(
    convert_to(pg_temp.cohort_campaign_definition()::text, 'UTF8'), 'sha256'
  ), snapshot.id, 'UTC',
  date_trunc('day', statement_timestamp()) + interval '1 day',
  date_trunc('day', statement_timestamp()) + interval '2 days',
  120, 2, 12000, 5000,
  '7c000000-0000-4000-8000-000000000001', now(), now()
from loyalty.campaigns as campaign
join loyalty.audience_snapshots as snapshot
  on snapshot.public_id = '7c600000-0000-4000-8000-000000000003'
where campaign.public_id = '7c610000-0000-4000-8000-000000000001';

select * from loyalty_private.set_organization_entitlement(
  '7c000000-0000-4000-8000-000000000100', 'campaigns', 'enabled', null,
  'local_control', 'operator:test', 'Enable campaign experiment test',
  now() - interval '1 second', null
);
select * from loyalty_private.set_organization_entitlement(
  '7c000000-0000-4000-8000-000000000100', 'analytics', 'enabled', null,
  'local_control', 'operator:test', 'Enable cohort analytics test',
  now() - interval '1 second', null
);

set local role authenticated;
set local request.jwt.claim.sub = '7c000000-0000-4000-8000-000000000001';
select * from loyalty.approve_campaign_version_command(
  '7c610000-0000-4000-8000-000000000002',
  (select encode(definition_sha256, 'hex')
   from loyalty.campaign_versions
   where public_id = '7c610000-0000-4000-8000-000000000002'),
  'cohort-campaign-approve',
  '7c690000-0000-4000-8000-000000000001'
);
reset role;

insert into loyalty_private.commerce_delivery_inbox (
  organization_id, connection_id, source_delivery_id, envelope_version,
  source_event_id, event_type, source_object_id, occurred_at, delivered_at,
  key_version, nonce, body_sha256, raw_body, state
)
select connection.organization_id, connection.id,
  'cohort-delivery-' || fixture.number, '1',
  'cohort-event-' || fixture.number, 'commerce.order.paid',
  'cohort-order-' || fixture.number, fixture.occurred_at,
  fixture.occurred_at + interval '1 minute', 'v1',
  'cohort-nonce-' || fixture.number,
  repeat(fixture.number::text, 64), '{}'::jsonb, 'applied'
from (values
  (1, date_trunc('day', statement_timestamp()) + interval '1 day 6 hours'),
  (2, date_trunc('day', statement_timestamp()) + interval '1 day 7 hours')
) as fixture(number, occurred_at)
cross join loyalty.commerce_connections as connection
where connection.public_id = '7c000000-0000-4000-8000-000000000120';

insert into loyalty_private.canonical_commerce_events (
  public_id, organization_id, connection_id, delivery_inbox_id,
  source_event_id, normalization_version, event_type, source_object_id,
  occurred_at, payload
)
select
  ('7c530000-0000-4000-8000-' || lpad(fixture.number::text, 12, '0'))::uuid,
  inbox.organization_id, inbox.connection_id, inbox.id, inbox.source_event_id,
  'v1', inbox.event_type, inbox.source_object_id, inbox.occurred_at, '{}'::jsonb
from (values (1), (2)) as fixture(number)
join loyalty_private.commerce_delivery_inbox as inbox
  on inbox.source_delivery_id = 'cohort-delivery-' || fixture.number;

insert into loyalty_private.programme_evaluations (
  public_id, organization_id, programme_group_id, programme_version_id,
  canonical_event_id, evaluation_kind, subject_reference,
  idempotency_key, input_sha256, result_sha256, result, explanation,
  evaluated_at, created_at
)
select
  ('7c620000-0000-4000-8000-' || lpad(fixture.number::text, 12, '0'))::uuid,
  version.organization_id, version.programme_group_id, version.id, event.id,
  'live_award', 'cohort-order-' || fixture.number,
  'cohort-evaluation-' || fixture.number,
  extensions.digest(convert_to('cohort-input-' || fixture.number, 'UTF8'), 'sha256'),
  extensions.digest(convert_to('cohort-result-' || fixture.number, 'UTF8'), 'sha256'),
  jsonb_build_object('eligibleSpendMinor', fixture.eligible_spend::text),
  '{}'::jsonb, event.occurred_at + interval '1 minute', now()
from (values (1, 30000::bigint), (2, 18000::bigint))
  as fixture(number, eligible_spend)
join loyalty.programme_versions as version
  on version.public_id = '7c000000-0000-4000-8000-000000000140'
join loyalty_private.canonical_commerce_events as event
  on event.public_id = (
    '7c530000-0000-4000-8000-' || lpad(fixture.number::text, 12, '0')
  )::uuid;

insert into loyalty_private.campaign_execution_batches (
  public_id, organization_id, programme_group_id, programme_version_id,
  programme_evaluation_id, canonical_event_id, customer_id, wallet_id,
  operation_key, input_sha256, result_sha256, campaign_context,
  baseline_result, campaign_evaluation, occurred_at, evaluated_at, created_at
)
select
  ('7c630000-0000-4000-8000-' || lpad(fixture.number::text, 12, '0'))::uuid,
  evaluation.organization_id, evaluation.programme_group_id,
  evaluation.programme_version_id, evaluation.id,
  evaluation.canonical_event_id, assignment.customer_id, assignment.wallet_id,
  'cohort-campaign-batch-' || fixture.number,
  extensions.digest(convert_to('cohort-batch-input-' || fixture.number, 'UTF8'), 'sha256'),
  extensions.digest(convert_to('cohort-batch-result-' || fixture.number, 'UTF8'), 'sha256'),
  '{}'::jsonb,
  jsonb_build_object('eligibleSpendMinor', fixture.eligible_spend::text),
  '{}'::jsonb, evaluation.evaluated_at - interval '1 minute',
  evaluation.evaluated_at + interval '1 minute', now()
from (values
  (1, 'treatment', 30000::bigint),
  (2, 'control', 18000::bigint)
) as fixture(number, assignment_kind, eligible_spend)
join loyalty_private.programme_evaluations as evaluation
  on evaluation.public_id = (
    '7c620000-0000-4000-8000-' || lpad(fixture.number::text, 12, '0')
  )::uuid
join lateral (
  select assignment.customer_id, assignment.wallet_id
  from loyalty_private.campaign_assignments as assignment
  join loyalty.campaign_versions as version
    on version.id = assignment.campaign_version_id
  where version.public_id = '7c610000-0000-4000-8000-000000000002'
    and assignment.assignment = fixture.assignment_kind
  order by assignment.wallet_id
  limit 1
) as assignment on true;

insert into loyalty_private.campaign_effects (
  public_id, organization_id, programme_group_id, campaign_version_id,
  execution_batch_id, customer_id, wallet_id, assignment, effect_kind,
  decision_outcome, matched_rule_codes, points, state, created_at
)
select
  ('7c640000-0000-4000-8000-' || lpad(fixture.number::text, 12, '0'))::uuid,
  batch.organization_id, batch.programme_group_id, version.id, batch.id,
  batch.customer_id, batch.wallet_id, fixture.assignment_kind,
  'bonus_points',
  case fixture.assignment_kind
    when 'control' then 'control' else 'capacity_exhausted' end,
  '["purchase"]'::jsonb, 0, 'recorded', now()
from (values (1, 'treatment'), (2, 'control'))
  as fixture(number, assignment_kind)
join loyalty_private.campaign_execution_batches as batch
  on batch.public_id = (
    '7c630000-0000-4000-8000-' || lpad(fixture.number::text, 12, '0')
  )::uuid
join loyalty.campaign_versions as version
  on version.public_id = '7c610000-0000-4000-8000-000000000002';

set local role authenticated;
set local request.jwt.claim.sub = '7c000000-0000-4000-8000-000000000001';

create temporary table analytics_cohort_report as
select * from loyalty.get_analytics_cohort_retention_v1(
  '7c000000-0000-4000-8000-000000000100',
  '7c000000-0000-4000-8000-000000000101',
  '7c000000-0000-4000-8000-000000000110',
  7, 'UTC', statement_timestamp() + interval '3 days'
);

select results_eq(
  $$ select count(*)::bigint from analytics_cohort_report $$,
  array[1::bigint], 'authorized cohort report returns one minimized row'
);
select results_eq(
  $$ select report ->> 'reportVersion' || ':' || report ->> 'dictionaryVersion'
     from analytics_cohort_report $$,
  array['1:4'::text], 'cohort report binds the additive V4 dictionary'
);
select results_eq(
  $$ select jsonb_array_length(report #> '{membershipActivation,cohorts}')
     from analytics_cohort_report $$,
  array[7], 'membership output includes every requested local cohort date'
);
select results_eq(
  $$ select report #>> '{membershipActivation,joinedMembers}' || ':' ||
            report #>> '{membershipActivation,activatedMembers}' || ':' ||
            report #>> '{membershipActivation,activationRateBasisPoints}'
     from analytics_cohort_report $$,
  array['60:2:333'::text],
  'mature membership activation uses only release-backed 30-day outcomes'
);
select results_eq(
  $$ select report #>> '{earningRetention,qualifiedMembers}' || ':' ||
            report #>> '{earningRetention,retainedMembers}' || ':' ||
            report #>> '{earningRetention,retentionRateBasisPoints}'
     from analytics_cohort_report $$,
  array['2:1:5000'::text],
  'earning retention uses a complete exact days 31 through 60 window'
);
select results_eq(
  $$ select report #>> '{campaignExperiments,eligibleCampaigns}' || ':' ||
            report #>> '{campaignExperiments,availableCampaigns}' || ':' ||
            report #>> '{campaignExperiments,unavailableCampaigns}'
     from analytics_cohort_report $$,
  array['1:1:0'::text],
  'campaign experiment availability is evidence-gated and reconciled'
);
select results_eq(
  $$ select report #>> '{campaignExperiments,campaigns,0,treatmentMembers}' || ':' ||
            report #>> '{campaignExperiments,campaigns,0,controlMembers}'
     from analytics_cohort_report $$,
  array['30:30'::text],
  'the ITT population includes every immutable assignment and zero outcome'
);
select results_eq(
  $$ select report #>> '{campaignExperiments,campaigns,0,incrementality,status}' || ':' ||
            report #>> '{campaignExperiments,campaigns,0,incrementality,currencyCode}' || ':' ||
            report #>> '{campaignExperiments,campaigns,0,incrementality,minorUnitDigits}' || ':' ||
            report #>> '{campaignExperiments,campaigns,0,incrementality,treatmentEligibleSpendMinor}' || ':' ||
            report #>> '{campaignExperiments,campaigns,0,incrementality,controlEligibleSpendMinor}' || ':' ||
            report #>> '{campaignExperiments,campaigns,0,incrementality,exactNumerator}' || ':' ||
            report #>> '{campaignExperiments,campaigns,0,incrementality,exactDenominator}' || ':' ||
            report #>> '{campaignExperiments,campaigns,0,incrementality,estimatedIncrementalEligibleSpendMinor}'
     from analytics_cohort_report $$,
  array['available:EUR:2:30000:18000:360000:30:12000'::text],
  'difference-in-means ITT evidence and exact rational estimate reconcile'
);
select results_eq(
  $$ select report #>> '{campaignExperiments,campaigns,0,incrementality,pointEstimateOnly}'
     from analytics_cohort_report $$,
  array['true'::text], 'the estimate explicitly makes no significance claim'
);
select is_empty(
  $$ select 1 from analytics_cohort_report
     where report::text ~ '"(customer|wallet|order|assignment)(Id|_id)"[[:space:]]*:' $$,
  'the minimized JSON exposes no customer wallet order or assignment identity'
);
select results_eq(
  $$ select (extract(epoch from (
       (report #>> '{cohortPeriod,to}')::timestamptz
       - (report #>> '{cohortPeriod,from}')::timestamptz
     )) / 3600)::integer || ':' ||
     report #>> '{cohortPeriod,timeZone}' || ':' ||
     jsonb_array_length(report #> '{earningRetention,cohorts}')
     from loyalty.get_analytics_cohort_retention_v1(
       '7c000000-0000-4000-8000-000000000100',
       '7c000000-0000-4000-8000-000000000101',
       '7c000000-0000-4000-8000-000000000110',
       7, 'Europe/Ljubljana', '2026-05-29T00:00:00Z'
     ) $$,
  array['167:Europe/Ljubljana:7'::text],
  'IANA local-day cohorts preserve seven rows across the spring DST boundary'
);
select throws_ok(
  $$ select * from loyalty.get_analytics_cohort_retention_v1(
    '7c000000-0000-4000-8000-000000000100',
    '7c000000-0000-4000-8000-000000000101',
    '7c000000-0000-4000-8000-000000000110',
    365, 'UTC', statement_timestamp() + interval '3 days'
  ) $$,
  '22023', 'invalid analytics cohort retention request',
  'unsupported interactive ranges fail closed'
);
select throws_ok(
  $$ select * from loyalty.get_analytics_cohort_retention_v1(
    '7c000000-0000-4000-8000-000000000100',
    '7c000000-0000-4000-8000-000000000101',
    '7c000000-0000-4000-8000-000000000110',
    7, 'Mars/Olympus', statement_timestamp() + interval '3 days'
  ) $$,
  '22023', 'invalid analytics cohort retention request',
  'unknown timezones fail before date arithmetic'
);
select is_empty(
  $$ select * from loyalty.get_analytics_cohort_retention_v1(
    '7c000000-0000-4000-8000-000000000100',
    '7d000000-0000-4000-8000-000000000101',
    '7c000000-0000-4000-8000-000000000110',
    7, 'UTC', statement_timestamp() + interval '3 days'
  ) $$,
  'mixed public selectors cannot fabricate internal authority'
);
select is_empty(
  $$ select * from loyalty.get_analytics_cohort_retention_v1(
    '7d000000-0000-4000-8000-000000000100',
    '7d000000-0000-4000-8000-000000000101',
    '7d000000-0000-4000-8000-000000000110',
    7, 'UTC', statement_timestamp() + interval '3 days'
  ) $$,
  'one tenant cannot read another tenant cohort report'
);

set local request.jwt.claim.sub = '7c000000-0000-4000-8000-000000000002';
select results_eq(
  $$ select report #>> '{membershipActivation,joinedMembers}'
     from loyalty.get_analytics_cohort_retention_v1(
       '7c000000-0000-4000-8000-000000000100',
       '7c000000-0000-4000-8000-000000000101',
       '7c000000-0000-4000-8000-000000000110',
       7, 'UTC', statement_timestamp() + interval '3 days'
     ) $$,
  array['60'::text], 'analyst receives only minimized aggregate evidence'
);
set local request.jwt.claim.sub = '7c000000-0000-4000-8000-000000000003';
select is_empty(
  $$ select * from loyalty.get_analytics_cohort_retention_v1(
    '7c000000-0000-4000-8000-000000000100',
    '7c000000-0000-4000-8000-000000000101',
    '7c000000-0000-4000-8000-000000000110',
    7, 'UTC', statement_timestamp() + interval '3 days'
  ) $$,
  'revoked membership fails closed with a live token'
);

reset role;
select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_transactions
     where organization_id = (
       select id from loyalty.organizations where slug = 'cohort-analytics-one'
     ) $$,
  array[6::bigint], 'read-only cohort reports append no ledger transaction'
);

select * from loyalty_private.set_organization_entitlement(
  '7c000000-0000-4000-8000-000000000100', 'analytics', 'disabled', null,
  'local_control', 'operator:test', 'Disable analytics for cohort test',
  now() - interval '500 milliseconds', null
);
set local role authenticated;
set local request.jwt.claim.sub = '7c000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select * from loyalty.get_analytics_cohort_retention_v1(
    '7c000000-0000-4000-8000-000000000100',
    '7c000000-0000-4000-8000-000000000101',
    '7c000000-0000-4000-8000-000000000110',
    7, 'UTC', statement_timestamp() + interval '3 days'
  ) $$,
  '42501', 'analytics capability disabled',
  'server-side entitlement disablement fails closed'
);

reset role;
select * from finish();
rollback;
