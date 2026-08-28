begin;

create extension if not exists pgtap with schema extensions;

select plan(77);

select has_function(
  'loyalty', 'get_my_loyalty_accounts', array[]::text[],
  'authenticated customer self-service read model exists'
);
select ok(
  has_function_privilege('authenticated', 'loyalty.get_my_loyalty_accounts()', 'EXECUTE'),
  'authenticated sessions can call their own projection'
);
select ok(
  not has_function_privilege('anon', 'loyalty.get_my_loyalty_accounts()', 'EXECUTE'),
  'anonymous sessions cannot call the customer projection'
);
select results_eq(
  $$ select routine.prosecdef
     from pg_proc as routine
     join pg_namespace as namespace on namespace.oid = routine.pronamespace
     where namespace.nspname = 'loyalty'
       and routine.proname = 'get_my_loyalty_accounts'
       and exists (
         select 1 from unnest(routine.proconfig) as setting
         where setting = 'search_path=""'
       ) $$,
  array[true],
  'customer projection is security definer with an empty search path'
);
select ok(
  not has_table_privilege('authenticated', 'loyalty.customer_user_links', 'SELECT'),
  'customers cannot enumerate raw Auth links'
);
select ok(
  not has_table_privilege('authenticated', 'loyalty.identity_link_decisions', 'SELECT'),
  'customers cannot enumerate identity-link evidence'
);
select has_function(
  'loyalty', 'get_my_loyalty_experiences_v1', array[]::text[],
  'strict customer loyalty experience projection exists'
);
select ok(
  has_function_privilege('authenticated', 'loyalty.get_my_loyalty_experiences_v1()', 'EXECUTE'),
  'authenticated customers can read their strict aggregate'
);
select ok(
  not has_function_privilege('anon', 'loyalty.get_my_loyalty_experiences_v1()', 'EXECUTE'),
  'anonymous sessions cannot read a customer aggregate'
);
select results_eq(
  $$ select routine.prosecdef
     from pg_proc as routine
     join pg_namespace as namespace on namespace.oid = routine.pronamespace
     where namespace.nspname = 'loyalty'
       and routine.proname = 'get_my_loyalty_experiences_v1'
       and exists (
         select 1 from unnest(routine.proconfig) as setting
         where setting = 'search_path=""'
       ) $$,
  array[true],
  'strict customer aggregate is security definer with an empty search path'
);
select has_function(
  'loyalty', 'get_my_loyalty_experiences_v2', array[]::text[],
  'strict controlled-presentation customer projection exists'
);
select ok(
  has_function_privilege(
    'authenticated', 'loyalty.get_my_loyalty_experiences_v2()', 'EXECUTE'
  ),
  'authenticated customers can read their V2 aggregate'
);
select ok(
  not has_function_privilege(
    'anon', 'loyalty.get_my_loyalty_experiences_v2()', 'EXECUTE'
  ),
  'anonymous sessions cannot read a V2 customer aggregate'
);
select results_eq(
  $$ select routine.prosecdef
     from pg_proc as routine
     join pg_namespace as namespace on namespace.oid = routine.pronamespace
     where namespace.nspname = 'loyalty'
       and routine.proname = 'get_my_loyalty_experiences_v2'
       and exists (
         select 1 from unnest(routine.proconfig) as setting
         where setting = 'search_path=""'
       ) $$,
  array[true],
  'V2 customer aggregate is security definer with an empty search path'
);
select has_function(
  'loyalty', 'get_my_loyalty_experiences_v3', array[]::text[],
  'strict Auth-derived campaign-opportunity customer projection exists'
);
select ok(
  has_function_privilege(
    'authenticated', 'loyalty.get_my_loyalty_experiences_v3()', 'EXECUTE'
  ),
  'authenticated customers can read their V3 aggregate'
);
select ok(
  not has_function_privilege(
    'anon', 'loyalty.get_my_loyalty_experiences_v3()', 'EXECUTE'
  ),
  'anonymous sessions cannot read a V3 customer aggregate'
);
select results_eq(
  $$ select routine.prosecdef
     from pg_proc as routine
     join pg_namespace as namespace on namespace.oid = routine.pronamespace
     where namespace.nspname = 'loyalty'
       and routine.proname = 'get_my_loyalty_experiences_v3'
       and exists (
         select 1 from unnest(routine.proconfig) as setting
         where setting = 'search_path=""'
       ) $$,
  array[true],
  'V3 customer aggregate is security definer with an empty search path'
);

insert into auth.users (id, email)
values
  ('8c000000-0000-4000-8000-000000000001', 'member-one@example.test'),
  ('8c000000-0000-4000-8000-000000000002', 'member-two@example.test'),
  ('8c000000-0000-4000-8000-000000000003', 'member-one-control@example.test');
insert into loyalty.organizations (slug, name)
values ('member-one', 'Private Member One Org'), ('member-two', 'Private Member Two Org');
insert into loyalty.workspaces (public_id, organization_id, slug, name)
select
  case slug when 'member-one' then '8c000000-0000-4000-8000-000000000110'::uuid
    else '8d000000-0000-4000-8000-000000000110'::uuid end,
  id, 'store', name || ' Store'
from loyalty.organizations where slug in ('member-one', 'member-two');
insert into loyalty.programme_groups (organization_id, slug, name)
select id, 'rewards', name || ' Rewards'
from loyalty.organizations where slug in ('member-one', 'member-two');
insert into loyalty.programme_group_workspaces (organization_id, programme_group_id, workspace_id)
select organization.id, programme_group.id, workspace.id
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group on programme_group.organization_id = organization.id
join loyalty.workspaces as workspace on workspace.organization_id = organization.id;
insert into loyalty.programmes (
  public_id, organization_id, programme_group_id, slug, name, status
)
select
  case organization.slug when 'member-one' then '8c000000-0000-4000-8000-000000000130'::uuid
    else '8d000000-0000-4000-8000-000000000130'::uuid end,
  organization.id, programme_group.id, 'rosy-rewards',
  case organization.slug when 'member-one' then 'Rosy Rewards' else 'Other Rewards' end,
  'active'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group on programme_group.organization_id = organization.id;
insert into loyalty.programme_versions (
  organization_id, programme_group_id, programme_id, version_number,
  status, configuration, configuration_sha256, published_at
)
select organization_id, programme_group_id, id, 1, 'published',
  '{"version":"1","tiers":[],"rewards":[]}'::jsonb,
  extensions.digest(public_id::text, 'sha256'), now()
from loyalty.programmes where public_id in (
  '8c000000-0000-4000-8000-000000000130',
  '8d000000-0000-4000-8000-000000000130'
);
insert into loyalty.programme_tiers (
  organization_id, programme_group_id, programme_version_id, code, name,
  ordinal, minimum_eligible_spend_minor, points_per_major_unit
)
select organization_id, programme_group_id, id, 'rose', 'Rose', 1, 0, 5
from loyalty.programme_versions;
insert into loyalty.programme_rewards (
  organization_id, programme_group_id, programme_version_id,
  code, name, reward_kind, cost_points
)
select organization_id, programme_group_id, id,
  'five-off', 'Five off', 'fixed_discount', 500
from loyalty.programme_versions
where organization_id = (select id from loyalty.organizations where slug = 'member-one');
insert into loyalty.programme_earning_rules (
  organization_id, programme_group_id, programme_version_id, code, name,
  ordinal, source, enabled, priority, stackable, effect_kind, effect, conditions,
  purchase_exclusions, cap
)
select version.organization_id, version.programme_group_id, version.id,
  'purchase-base', 'Every purchase', 1, 'purchase', true, 0, false, 'base_rate',
  '{"kind":"base_rate","pointsPerMajorUnit":"5"}'::jsonb,
  '{"productIds":[],"categoryIds":[],"currencyCodes":[],"markets":[],"channels":[],"activityCodes":[],"segmentCodes":[],"tierCodes":[],"startsAt":null,"endsAt":null}'::jsonb,
  '{"productIds":[],"categoryIds":[],"shipping":true,"tax":true,"fees":true,"giftCardPayments":true,"storeCreditPayments":true,"discounts":true}'::jsonb,
  '{"perEventPoints":null,"perMemberPoints":null,"memberPeriod":null,"rollingDays":null}'::jsonb
from loyalty.programme_versions as version
where version.organization_id = (
  select id from loyalty.organizations where slug = 'member-one'
);
insert into loyalty.programme_earning_rules (
  organization_id, programme_group_id, programme_version_id, code, name,
  ordinal, source, enabled, priority, stackable, effect_kind, effect, conditions,
  purchase_exclusions, cap
)
select version.organization_id, version.programme_group_id, version.id,
  'birthday', 'Birthday bonus', 2, 'birthday', true, 10, true, 'fixed_bonus',
  '{"kind":"fixed_bonus","points":"250"}'::jsonb,
  '{"productIds":[],"categoryIds":[],"currencyCodes":[],"markets":[],"channels":[],"activityCodes":[],"segmentCodes":["private-segment"],"tierCodes":[],"startsAt":null,"endsAt":null}'::jsonb,
  null,
  '{"perEventPoints":"250","perMemberPoints":"250","memberPeriod":"calendar_year","rollingDays":null}'::jsonb
from loyalty.programme_versions as version
where version.organization_id = (
  select id from loyalty.organizations where slug = 'member-one'
);
insert into loyalty.programme_earning_rules (
  organization_id, programme_group_id, programme_version_id, code, name,
  ordinal, source, enabled, priority, stackable, effect_kind, effect, conditions,
  purchase_exclusions, cap
)
select version.organization_id, version.programme_group_id, version.id,
  'unsafe-rule', '<script>unsafe</script>', 3, 'custom_activity', true, 0, true,
  'fixed_bonus',
  '{"kind":"fixed_bonus","points":"1"}'::jsonb,
  '{"productIds":[],"categoryIds":[],"currencyCodes":[],"markets":[],"channels":[],"activityCodes":["unsafe"],"segmentCodes":[],"tierCodes":[],"startsAt":null,"endsAt":null}'::jsonb,
  null,
  '{"perEventPoints":"1","perMemberPoints":null,"memberPeriod":null,"rollingDays":null}'::jsonb
from loyalty.programme_versions as version
where version.organization_id = (
  select id from loyalty.organizations where slug = 'member-one'
);
insert into loyalty.programme_rewards (
  organization_id, programme_group_id, programme_version_id,
  code, name, reward_kind, cost_points
)
select organization_id, programme_group_id, id,
  'large-reward', 'Large reward', 'custom', 9007199254740994
from loyalty.programme_versions
where organization_id = (select id from loyalty.organizations where slug = 'member-one');
insert into loyalty.programme_rewards (
  organization_id, programme_group_id, programme_version_id,
  code, name, reward_kind, cost_points
)
select organization_id, programme_group_id, id,
  'unsafe', '<script>unsafe</script>', 'custom', 1
from loyalty.programme_versions
where organization_id = (select id from loyalty.organizations where slug = 'member-one');
insert into loyalty.commerce_connections (
  public_id, organization_id, workspace_id, external_store_id, display_name,
  current_key_version, signing_material_ref, programme_id
)
select
  case organization.slug when 'member-one' then '8c000000-0000-4000-8000-000000000101'::uuid
    else '8d000000-0000-4000-8000-000000000101'::uuid end,
  organization.id, workspace.id, organization.slug || '-store',
  case organization.slug when 'member-one' then 'Rosy Store' else 'Other Store' end,
  'v1', 'vault://' || organization.slug, programme.id
from loyalty.organizations as organization
join loyalty.workspaces as workspace on workspace.organization_id = organization.id
join loyalty.programmes as programme on programme.organization_id = organization.id;
insert into loyalty.experience_themes (
  organization_id, workspace_id, programme_group_id, brand_color,
  display_font, card_radius_px, hero_text, points_label, show_tier,
  show_rewards, widget_position, density, hero_asset, show_referrals,
  section_order
)
select link.organization_id, link.workspace_id, link.programme_group_id,
  '#4f46e5', 'modern-serif', 22, 'Member rewards', 'Stars', false, true,
  'left', 'compact', 'crown', false,
  array['overview','rewards','earning','history','vip','referrals','account']::text[]
from loyalty.programme_group_workspaces as link
join loyalty.workspaces as workspace on workspace.id = link.workspace_id
where workspace.public_id = '8c000000-0000-4000-8000-000000000110';
insert into loyalty.experience_translations (
  organization_id, workspace_id, programme_group_id, locale, hero_text,
  points_label, balance_label, rewards_label, redeem_label, join_label,
  earn_message
)
select link.organization_id, link.workspace_id, link.programme_group_id,
  'en', 'Your loyalty home', 'Stars', 'Available stars', 'Choose a reward',
  'Use reward', 'Join the programme', 'Earn Stars on eligible orders.'
from loyalty.programme_group_workspaces as link
join loyalty.workspaces as workspace on workspace.id = link.workspace_id
where workspace.public_id = '8c000000-0000-4000-8000-000000000110';
insert into loyalty.customers (public_id, organization_id, display_reference)
select
  case slug when 'member-one' then '8c000000-0000-4000-8000-000000000150'::uuid
    else '8d000000-0000-4000-8000-000000000150'::uuid end,
  id, 'Private profile reference'
from loyalty.organizations where slug in ('member-one', 'member-two');
insert into loyalty.customer_user_links (
  organization_id, customer_id, auth_user_id, source_connection_id
)
select organization.id, customer.id,
  case organization.slug when 'member-one' then '8c000000-0000-4000-8000-000000000001'::uuid
    else '8c000000-0000-4000-8000-000000000002'::uuid end,
  connection.id
from loyalty.organizations as organization
join loyalty.customers as customer on customer.organization_id = organization.id
join loyalty.commerce_connections as connection on connection.organization_id = organization.id;
insert into loyalty.organization_memberships (organization_id, user_id, role)
select id, '8c000000-0000-4000-8000-000000000001', 'owner'
from loyalty.organizations where slug = 'member-one';
insert into loyalty.organization_entitlements (
  organization_id, catalogue_version, capability_key, state, source,
  actor_reference, reason, effective_from
)
select id, 1, 'storefront.experience', 'disabled', 'local_control',
  'test:customer-experience',
  'Verify that disabled enhancements preserve the customer value container',
  '2026-08-25 00:00:00+00'
from loyalty.organizations where slug = 'member-two';

select * from loyalty_private.award_points(
  (select id from loyalty.organizations where slug = 'member-one'),
  (select id from loyalty.programme_groups where organization_id =
    (select id from loyalty.organizations where slug = 'member-one')),
  (select id from loyalty.programme_versions where organization_id =
    (select id from loyalty.organizations where slug = 'member-one')),
  (select id from loyalty.customers where organization_id =
    (select id from loyalty.organizations where slug = 'member-one')),
  9007199254740993, 'member-award', extensions.digest('member-award', 'sha256')
);
select * from loyalty_private.release_points(
  (select id from loyalty.organizations where slug = 'member-one'),
  (select id from loyalty.programme_groups where organization_id =
    (select id from loyalty.organizations where slug = 'member-one')),
  (select id from loyalty.programme_versions where organization_id =
    (select id from loyalty.organizations where slug = 'member-one')),
  (select entry.public_id from loyalty.ledger_entries as entry
   join loyalty.ledger_accounts as account on account.id = entry.account_id
   where account.organization_id =
       (select id from loyalty.organizations where slug = 'member-one')
     and account.account_kind = 'pending' and entry.points > 0),
  now() + interval '90 days', 'member-release',
  extensions.digest('member-release', 'sha256')
);

insert into loyalty.customers (public_id, organization_id, display_reference)
select '8c000000-0000-4000-8000-000000000151', id,
  'Private control profile reference'
from loyalty.organizations where slug = 'member-one';
insert into loyalty.customer_user_links (
  organization_id, customer_id, auth_user_id, source_connection_id
)
select customer.organization_id, customer.id,
  '8c000000-0000-4000-8000-000000000003', connection.id
from loyalty.customers as customer
join loyalty.commerce_connections as connection
  on connection.organization_id = customer.organization_id
where customer.public_id = '8c000000-0000-4000-8000-000000000151';
select loyalty_private.ensure_wallet_accounts(
  customer.organization_id, programme_group.id, customer.id
)
from loyalty.customers as customer
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = customer.organization_id
where customer.public_id = '8c000000-0000-4000-8000-000000000151';

create function pg_temp.member_campaign_audience()
returns jsonb
language sql
immutable
as $$
  select '{
    "schemaVersion":"1","code":"member-campaigns",
    "name":"Member campaigns","description":"","match":"all",
    "conditions":[{
      "kind":"metric","metric":"available_points","operator":"at_least",
      "minimum":"0","maximum":null,"window":null,"activityCodes":[]
    }]
  }'::jsonb;
$$;

insert into loyalty.audiences (
  public_id, organization_id, programme_group_id, code, created_by_user_id
)
select '8c600000-0000-4000-8000-000000000001', organization.id,
  programme_group.id, 'member-campaigns',
  '8c000000-0000-4000-8000-000000000001'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
where organization.slug = 'member-one';

insert into loyalty.audience_versions (
  public_id, organization_id, programme_group_id, audience_id, version_number,
  status, definition, definition_sha256, created_by_user_id,
  approved_by_user_id, published_at
)
select '8c600000-0000-4000-8000-000000000002', audience.organization_id,
  audience.programme_group_id, audience.id, 1, 'draft',
  pg_temp.member_campaign_audience(),
  extensions.digest(
    pg_catalog.convert_to(pg_temp.member_campaign_audience()::text, 'UTF8'),
    'sha256'
  ), audience.created_by_user_id, null, null
from loyalty.audiences as audience
where audience.public_id = '8c600000-0000-4000-8000-000000000001';

update loyalty.audience_versions
set status = 'published', approved_by_user_id = created_by_user_id,
  published_at = statement_timestamp()
where public_id = '8c600000-0000-4000-8000-000000000002';

insert into loyalty.audience_snapshots (
  public_id, organization_id, programme_group_id, audience_version_id,
  state, snapshot_at, member_count, definition_sha256,
  created_by_user_id, completed_at
)
select '8c600000-0000-4000-8000-000000000003', version.organization_id,
  version.programme_group_id, version.id, 'complete', statement_timestamp(),
  2, version.definition_sha256, version.created_by_user_id,
  statement_timestamp()
from loyalty.audience_versions as version
where version.public_id = '8c600000-0000-4000-8000-000000000002';

insert into loyalty_private.audience_snapshot_members (
  organization_id, programme_group_id, audience_snapshot_id,
  customer_id, wallet_id, evaluation
)
select snapshot.organization_id, snapshot.programme_group_id, snapshot.id,
  wallet.customer_id, wallet.id, '{"included":true}'::jsonb
from loyalty.audience_snapshots as snapshot
join loyalty.wallets as wallet
  on wallet.organization_id = snapshot.organization_id
 and wallet.programme_group_id = snapshot.programme_group_id
where snapshot.public_id = '8c600000-0000-4000-8000-000000000003';

create function pg_temp.member_purchase_campaign(
  target_code text,
  target_kind text,
  target_control_basis_points integer
)
returns jsonb
language sql
stable
as $$
  with schedule as (
    select pg_catalog.date_trunc(
      'second', pg_catalog.statement_timestamp() + interval '5 minutes'
    ) as starts_at,
    pg_catalog.date_trunc(
      'second', pg_catalog.statement_timestamp() + interval '1 day'
    ) as ends_at
  )
  select pg_catalog.jsonb_build_object(
    'schemaVersion', '1',
    'code', target_code,
    'name', case target_kind
      when 'bonus_points' then 'Member bonus'
      else 'Member multiplier'
    end,
    'description', case target_kind
      when 'bonus_points' then 'Earn an exact bonus on eligible purchases.'
      else 'Earn more points on eligible purchases.'
    end,
    'audienceSnapshotId', '8c600000-0000-4000-8000-000000000003',
    'exclusionSnapshotIds', pg_catalog.jsonb_build_array(),
    'schedule', pg_catalog.jsonb_build_object(
      'timezone', 'UTC',
      'startsAt', schedule.starts_at,
      'startsLocal', pg_catalog.to_char(
        schedule.starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS'
      ),
      'endsAt', schedule.ends_at,
      'endsLocal', pg_catalog.to_char(
        schedule.ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS'
      )
    ),
    'behavior', case target_kind
      when 'bonus_points' then pg_catalog.jsonb_build_object(
        'kind', 'bonus_points',
        'earningRuleCodes', pg_catalog.jsonb_build_array('purchase-base'),
        'reward', pg_catalog.jsonb_build_object(
          'kind', 'points', 'points', '9007199254740993'
        )
      )
      else pg_catalog.jsonb_build_object(
        'kind', 'purchase_multiplier',
        'earningRuleCodes', pg_catalog.jsonb_build_array('purchase-base'),
        'multiplierBasisPoints', 15000,
        'priority', 100
      )
    end,
    'capacity', pg_catalog.jsonb_build_object(
      'globalEffectLimit', '2', 'perMemberEffectLimit', 1,
      'maximumPoints', '9223372036854775807',
      'maximumLiabilityMinor', null, 'liabilityMinorPerEffect', null,
      'liabilityCurrencyCode', null, 'liabilityMinorUnitDigits', null
    ),
    'controlBasisPoints', target_control_basis_points
  )
  from schedule;
$$;

set local role authenticated;
set local request.jwt.claim.sub = '8c000000-0000-4000-8000-000000000001';
do $$
declare
  created record;
begin
  select * into strict created
  from loyalty.create_campaign_draft_command(
    '8c000000-0000-4000-8000-000000000130',
    pg_temp.member_purchase_campaign('member-bonus', 'bonus_points', 5000),
    'member-campaign-bonus-draft',
    '8c690000-0000-4000-8000-000000000001'
  );
  perform * from loyalty.approve_campaign_version_command(
    created.resource_public_id,
    created.definition_sha256,
    'member-campaign-bonus-approve',
    '8c690000-0000-4000-8000-000000000002'
  );
  select * into strict created
  from loyalty.create_campaign_draft_command(
    '8c000000-0000-4000-8000-000000000130',
    pg_temp.member_purchase_campaign(
      'member-multiplier', 'purchase_multiplier', 0
    ),
    'member-campaign-multiplier-draft',
    '8c690000-0000-4000-8000-000000000003'
  );
  perform * from loyalty.approve_campaign_version_command(
    created.resource_public_id,
    created.definition_sha256,
    'member-campaign-multiplier-approve',
    '8c690000-0000-4000-8000-000000000004'
  );
end;
$$;
reset role;
select pg_catalog.set_config(
  'test.member_bonus_treatment_sub',
  (
    select customer_link.auth_user_id::text
    from loyalty_private.campaign_assignments as assignment
    join loyalty.campaign_versions as campaign_version
      on campaign_version.id = assignment.campaign_version_id
    join loyalty.campaigns as campaign
      on campaign.id = campaign_version.campaign_id
    join loyalty.customer_user_links as customer_link
      on customer_link.organization_id = assignment.organization_id
     and customer_link.customer_id = assignment.customer_id
     and customer_link.revoked_at is null
    where campaign.code = 'member-bonus'
      and assignment.assignment = 'treatment'
  ),
  true
);
select pg_catalog.set_config(
  'test.member_bonus_control_sub',
  (
    select customer_link.auth_user_id::text
    from loyalty_private.campaign_assignments as assignment
    join loyalty.campaign_versions as campaign_version
      on campaign_version.id = assignment.campaign_version_id
    join loyalty.campaigns as campaign
      on campaign.id = campaign_version.campaign_id
    join loyalty.customer_user_links as customer_link
      on customer_link.organization_id = assignment.organization_id
     and customer_link.customer_id = assignment.customer_id
     and customer_link.revoked_at is null
    where campaign.code = 'member-bonus'
      and assignment.assignment = 'control'
  ),
  true
);
select pg_catalog.set_config(
  'test.member_multiplier_version',
  (
    select version.public_id::text
    from loyalty.campaign_versions as version
    join loyalty.campaigns as campaign on campaign.id = version.campaign_id
    where campaign.code = 'member-multiplier'
  ),
  true
);
insert into loyalty.tier_decisions (
  organization_id, programme_group_id, programme_version_id, wallet_id,
  tier_code, qualified_tier_code, transition, rolling_eligible_spend_minor,
  effective_at, idempotency_key, request_sha256, explanation
)
select wallet.organization_id, wallet.programme_group_id, version.id, wallet.id,
  'rose', 'rose', 'upgrade', 5000, now(), 'member-tier',
  extensions.digest('member-tier', 'sha256'), '{}'::jsonb
from loyalty.wallets as wallet
join loyalty.programme_versions as version
  on version.organization_id = wallet.organization_id
 and version.programme_group_id = wallet.programme_group_id
where wallet.organization_id = (select id from loyalty.organizations where slug = 'member-one');
insert into loyalty.tier_memberships (
  organization_id, programme_group_id, programme_version_id, wallet_id,
  tier_code, decision_id, effective_from
)
select decision.organization_id, decision.programme_group_id,
  decision.programme_version_id, decision.wallet_id, decision.tier_code,
  decision.id, decision.effective_at
from loyalty.tier_decisions as decision where decision.idempotency_key = 'member-tier';
insert into loyalty.reward_reservations (
  organization_id, programme_group_id, programme_version_id, wallet_id,
  reward_id, cost_points, state, idempotency_key, request_sha256, expires_at
)
select wallet.organization_id, wallet.programme_group_id, version.id, wallet.id,
  reward.id, reward.cost_points, 'issued', 'member-reservation',
  extensions.digest('member-reservation', 'sha256'), now() + interval '1 day'
from loyalty.wallets as wallet
join loyalty.programme_versions as version
  on version.organization_id = wallet.organization_id
 and version.programme_group_id = wallet.programme_group_id
join loyalty.programme_rewards as reward
  on reward.organization_id = version.organization_id
 and reward.programme_version_id = version.id
 and reward.code = 'five-off';

create temporary table member_ledger_before as
select count(*)::bigint as transaction_count from loyalty.ledger_transactions;

set local role authenticated;
set local request.jwt.claim.sub = '8c000000-0000-4000-8000-000000000001';

select results_eq(
  $$ select count(*)::bigint from loyalty.get_my_loyalty_accounts() $$,
  array[1::bigint],
  'a customer sees exactly their active linked account'
);
select results_eq(
  $$ select store_name, programme_name from loyalty.get_my_loyalty_accounts() $$,
  $$ values ('Rosy Store'::text, 'Rosy Rewards'::text) $$,
  'the projection exposes only the relevant public-facing store and programme names'
);
select results_eq(
  $$ select account_status from loyalty.get_my_loyalty_accounts() $$,
  array['ready'::text],
  'an active linked wallet reports ready status'
);
select results_eq(
  $$ select pending_points, available_points, reserved_points
     from loyalty.get_my_loyalty_accounts() $$,
  $$ values ('0'::text, '9007199254740993'::text, '0'::text) $$,
  'all balances retain exact text-form bigint precision'
);
select results_eq(
  $$ select tier_code, tier_name from loyalty.get_my_loyalty_accounts() $$,
  $$ values ('rose'::text, 'Rose'::text) $$,
  'current tier is minimized to its safe code and name'
);
select results_eq(
  $$ select next_expiry_points from loyalty.get_my_loyalty_accounts() $$,
  array['9007199254740993'::text],
  'the next live expiry lot retains exact points'
);
select results_eq(
  $$ select rewards from loyalty.get_my_loyalty_accounts() $$,
  $$ values ('[{"code":"five-off","kind":"fixed_discount","name":"Five off","affordable":true,"costPoints":"500"},{"code":"large-reward","kind":"custom","name":"Large reward","affordable":false,"costPoints":"9007199254740994"}]'::jsonb) $$,
  'safe current rewards are bounded and affordability is computed with bigint arithmetic'
);
select ok(
  (select rewards::text !~ 'unsafe|script|configuration'
   from loyalty.get_my_loyalty_accounts()),
  'markup-shaped names and raw reward configuration never enter the customer projection'
);
select results_eq(
  $$ select reservations -> 0 ->> 'state' from loyalty.get_my_loyalty_accounts() $$,
  array['issued'::text],
  'only the customer current active reservation is visible'
);
select results_eq(
  $$ select jsonb_array_length(activity) from loyalty.get_my_loyalty_accounts() $$,
  array[2],
  'recent activity is bounded to minimized immutable transactions'
);
select ok(
  (select activity::text !~ 'actor|source|request|metadata|reason'
   from loyalty.get_my_loyalty_accounts()),
  'activity omits actors source references fingerprints metadata and reasons'
);
select ok(
  (select store_name <> 'Private Member One Org'
      and customer_id = '8c000000-0000-4000-8000-000000000150'
   from loyalty.get_my_loyalty_accounts()),
  'organization identity and private customer profile text are omitted'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.get_my_loyalty_experiences_v1() $$,
  array[1::bigint],
  'strict aggregate returns exactly the active linked account'
);
select results_eq(
  $$ select experience ->> 'version',
            (experience ->> 'accountId')::uuid = account_id
     from loyalty.get_my_loyalty_experiences_v1() $$,
  $$ values ('1'::text, true) $$,
  'strict aggregate is versioned and bound to the public account link'
);
select results_eq(
  $$ select experience #>> '{balances,available}'
     from loyalty.get_my_loyalty_experiences_v1() $$,
  array['9007199254740993'::text],
  'strict aggregate preserves exact bigint balances'
);
select results_eq(
  $$ select (experience ->> 'enhancementsEnabled')::boolean
     from loyalty.get_my_loyalty_experiences_v1() $$,
  array[true],
  'self-hosted database authority enables storefront enhancements locally'
);
select results_eq(
  $$ select jsonb_array_length(experience -> 'earningMethods'),
            experience #>> '{earningMethods,0,name}',
            experience #>> '{earningMethods,1,name}'
     from loyalty.get_my_loyalty_experiences_v1() $$,
  $$ values (2, 'Every purchase'::text, 'Birthday bonus'::text) $$,
  'safe active earning methods are bounded and deterministically ordered'
);
select ok(
  (select experience -> 'earningMethods' -> 1 ->> 'hasRestrictions' = 'true'
      and experience::text !~ 'private-segment|productIds|categoryIds|tierCodes|activityCodes'
   from loyalty.get_my_loyalty_experiences_v1()),
  'earning summaries disclose a restriction indicator but no internal selectors'
);
select ok(
  (select experience::text !~ 'unsafe-rule|script'
   from loyalty.get_my_loyalty_experiences_v1()),
  'markup-shaped earning names are excluded from customer output'
);
select results_eq(
  $$ select experience #>> '{currentTier,name}',
            experience #>> '{rewards,0,affordable}'
     from loyalty.get_my_loyalty_experiences_v1() $$,
  $$ values ('Rose'::text, 'true'::text) $$,
  'tier and exact reward affordability share the canonical account container'
);
select ok(
  (select experience::text !~* 'customerId|organization|auth_user|email|metadata|request_sha256'
   from loyalty.get_my_loyalty_experiences_v1()),
  'strict aggregate omits customer internals tenant internals contacts and evidence'
);
select results_eq(
  $$ select experience ->> 'version',
            (experience ->> 'accountId')::uuid = account_id,
            experience #>> '{balances,available}'
     from loyalty.get_my_loyalty_experiences_v2() $$,
  $$ values ('2'::text, true, '9007199254740993'::text) $$,
  'V2 nests presentation without changing exact customer value or link authority'
);
select results_eq(
  $$ select experience #>> '{presentation,theme,density}',
            experience #>> '{presentation,theme,heroAsset}',
            (experience #>> '{presentation,theme,showReferrals}')::boolean,
            experience #>> '{presentation,copy,locale}',
            experience #>> '{presentation,copy,heroText}',
            experience #> '{presentation,theme,sectionOrder}'
     from loyalty.get_my_loyalty_experiences_v2() $$,
  $$ values (
    'compact'::text, 'crown'::text, false, 'en'::text,
    'Your loyalty home'::text,
    '["overview","rewards","earning","history","vip","referrals","account"]'::jsonb
  ) $$,
  'V2 returns the exact controlled English presentation and semantic order'
);
select ok(
  (select experience::text !~* 'customerId|organization|auth_user|email|metadata|request_sha256|sl-SI'
   from loyalty.get_my_loyalty_experiences_v2()),
  'V2 omits private evidence tenant authority contacts and inactive locales'
);

select results_eq(
  $$ select experience ->> 'version',
            experience #>> '{balances,available}'
     from loyalty.get_my_loyalty_experiences_v3() $$,
  $$ values ('3'::text, '9007199254740993'::text) $$,
  'V3 preserves the exact V2 customer value container'
);
select pg_catalog.set_config(
  'request.jwt.claim.sub',
  pg_catalog.current_setting('test.member_bonus_treatment_sub'),
  true
);
select results_eq(
  $$ select jsonb_array_length(experience -> 'campaignOpportunities'),
            (select count(*)::integer
             from jsonb_array_elements(
               experience -> 'campaignOpportunities'
             ) as opportunity(value)
             where opportunity.value ->> 'state' = 'scheduled')
     from loyalty.get_my_loyalty_experiences_v3() $$,
  $$ values (2, 2) $$,
  'the treatment member sees both future assigned purchase offers as scheduled'
);
select results_eq(
  $$ select opportunity.value #>> '{effect,points}',
            opportunity.value #>> '{effect,combination}'
     from loyalty.get_my_loyalty_experiences_v3() as projection
     cross join lateral jsonb_array_elements(
       projection.experience -> 'campaignOpportunities'
     ) as opportunity(value)
     where opportunity.value #>> '{effect,kind}' = 'bonus_points' $$,
  $$ values ('9007199254740993'::text, 'additive_bonus'::text) $$,
  'the purchase bonus retains exact bigint points and additive semantics'
);
select results_eq(
  $$ select (opportunity.value #>> '{effect,multiplierBasisPoints}')::integer,
            opportunity.value #>> '{effect,combination}'
     from loyalty.get_my_loyalty_experiences_v3() as projection
     cross join lateral jsonb_array_elements(
       projection.experience -> 'campaignOpportunities'
     ) as opportunity(value)
     where opportunity.value #>> '{effect,kind}' = 'purchase_multiplier' $$,
  $$ values (15000, 'highest_eligible_multiplier'::text) $$,
  'the multiplier retains exact basis points and highest-eligible semantics'
);
select ok(
  (select experience::text
      !~* 'campaignVersion|campaignId|audience|snapshot|assignment|control|wallet|customerId|earningRule|priority|budget|liability|globalEffect|perMember|raw|definition'
   from loyalty.get_my_loyalty_experiences_v3()),
  'V3 omits campaign selectors identities assignments controls budgets and raw policy'
);

select pg_catalog.set_config(
  'request.jwt.claim.sub',
  pg_catalog.current_setting('test.member_bonus_control_sub'),
  true
);
select results_eq(
  $$ select jsonb_array_length(experience -> 'campaignOpportunities'),
            (select count(*)::integer
             from jsonb_array_elements(
               experience -> 'campaignOpportunities'
             ) as opportunity(value)
             where opportunity.value #>> '{effect,kind}' = 'bonus_points'),
            (select count(*)::integer
             from jsonb_array_elements(
               experience -> 'campaignOpportunities'
             ) as opportunity(value)
             where opportunity.value #>> '{effect,kind}' = 'purchase_multiplier')
     from loyalty.get_my_loyalty_experiences_v3() $$,
  $$ values (1, 0, 1) $$,
  'a control member cannot distinguish the hidden bonus assignment from ineligibility'
);

reset role;
do $$
begin
  perform * from loyalty_private.set_organization_entitlement(
    (select organization.public_id
     from loyalty.organizations as organization
     where organization.slug = 'member-one'),
    'campaigns', 'disabled', null,
    'local_control', 'test:customer-campaigns',
    'Block new campaign growth without erasing accepted offers',
    pg_catalog.transaction_timestamp() - interval '1 second', null
  );
end;
$$;
set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claim.sub',
  pg_catalog.current_setting('test.member_bonus_treatment_sub'),
  true
);
select results_eq(
  $$ select jsonb_array_length(experience -> 'campaignOpportunities')
     from loyalty.get_my_loyalty_experiences_v3() $$,
  array[2],
  'later commercial restriction does not erase accepted customer offers'
);

select pg_catalog.set_config(
  'request.jwt.claim.sub',
  '8c000000-0000-4000-8000-000000000001',
  true
);
do $$
begin
  perform * from loyalty.pause_campaign_version_command(
    pg_catalog.current_setting('test.member_multiplier_version')::uuid,
    'Pause this member projection fixture safely',
    'member-campaign-multiplier-pause',
    '8c690000-0000-4000-8000-000000000005'
  );
end;
$$;
select pg_catalog.set_config(
  'request.jwt.claim.sub',
  pg_catalog.current_setting('test.member_bonus_treatment_sub'),
  true
);
select results_eq(
  $$ select jsonb_array_length(experience -> 'campaignOpportunities'),
            experience #>> '{campaignOpportunities,0,effect,kind}'
     from loyalty.get_my_loyalty_experiences_v3() $$,
  $$ values (1, 'bonus_points'::text) $$,
  'a paused campaign disappears without affecting the remaining accepted offer'
);

reset role;
insert into loyalty_private.campaign_capacity_counters (
  organization_id, programme_group_id, campaign_version_id,
  committed_effects
)
select version.organization_id, version.programme_group_id, version.id,
  version.global_effect_limit
from loyalty.campaign_versions as version
join loyalty.campaigns as campaign on campaign.id = version.campaign_id
where campaign.code = 'member-bonus'
on conflict (organization_id, campaign_version_id) do update
set committed_effects = excluded.committed_effects,
  updated_at = pg_catalog.statement_timestamp();
set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claim.sub',
  pg_catalog.current_setting('test.member_bonus_treatment_sub'),
  true
);
select results_eq(
  $$ select jsonb_array_length(experience -> 'campaignOpportunities')
     from loyalty.get_my_loyalty_experiences_v3() $$,
  array[0],
  'an exhausted global campaign capacity is no longer presented as available'
);

reset role;
create temporary table member_campaign_read_before as
select pg_catalog.jsonb_build_object(
  'assignments', (select count(*) from loyalty_private.campaign_assignments),
  'effects', (select count(*) from loyalty_private.campaign_effects),
  'counters', (select count(*) from loyalty_private.campaign_capacity_counters),
  'jobs', (select count(*) from loyalty_private.campaign_trigger_jobs),
  'ledger', (select count(*) from loyalty.ledger_transactions),
  'audit', (select count(*) from loyalty.admin_audit_events)
) as evidence;
set local role authenticated;
select lives_ok(
  $$ select count(*) from loyalty.get_my_loyalty_experiences_v3() $$,
  'an authenticated campaign opportunity read succeeds at the public grant boundary'
);
reset role;
select results_eq(
  $$ select pg_catalog.jsonb_build_object(
       'assignments', (select count(*) from loyalty_private.campaign_assignments),
       'effects', (select count(*) from loyalty_private.campaign_effects),
       'counters', (select count(*) from loyalty_private.campaign_capacity_counters),
       'jobs', (select count(*) from loyalty_private.campaign_trigger_jobs),
       'ledger', (select count(*) from loyalty.ledger_transactions),
       'audit', (select count(*) from loyalty.admin_audit_events)
     ) $$,
  $$ select evidence from member_campaign_read_before $$,
  'campaign opportunity reads mutate no assignment capacity queue value or audit evidence'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_transactions $$,
  $$ select transaction_count from member_ledger_before $$,
  'reading the account creates no ledger transaction'
);
set local role authenticated;
set local request.jwt.claim.sub = '8c000000-0000-4000-8000-000000000001';

set local request.jwt.claim.sub = '8c000000-0000-4000-8000-000000000002';
select results_eq(
  $$ select store_name, account_status from loyalty.get_my_loyalty_accounts() $$,
  $$ values ('Other Store'::text, 'ready_without_activity'::text) $$,
  'another Auth user sees only their own honest empty account'
);
select ok(
  (select every(store_name <> 'Rosy Store') from loyalty.get_my_loyalty_accounts()),
  'another customer cannot read the first tenant account'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.get_my_loyalty_experiences_v1() $$,
  array[1::bigint],
  'another customer receives one aggregate for their own active link'
);
select ok(
  (select every(experience ->> 'storeName' <> 'Rosy Store')
   from loyalty.get_my_loyalty_experiences_v1()),
  'another customer cannot read the first tenant aggregate'
);
select results_eq(
  $$ select (experience ->> 'enhancementsEnabled')::boolean,
            experience #>> '{balances,available}',
            experience ->> 'accountStatus'
     from loyalty.get_my_loyalty_experiences_v1() $$,
  $$ values (false, '0'::text, 'ready_without_activity'::text) $$,
  'disabled enhancements preserve the honest core value and account state'
);
select results_eq(
  $$ select count(*)::bigint,
            min(experience ->> 'storeName'),
            min(experience #>> '{balances,available}')
     from loyalty.get_my_loyalty_experiences_v2() $$,
  $$ values (1::bigint, 'Other Store'::text, '0'::text) $$,
  'another customer receives only their own honest V2 account and value'
);
select results_eq(
  $$ select count(*)::bigint,
            min(experience ->> 'storeName'),
            min(jsonb_array_length(experience -> 'campaignOpportunities'))
     from loyalty.get_my_loyalty_experiences_v3() $$,
  $$ values (1::bigint, 'Other Store'::text, 0) $$,
  'another tenant receives only its own V3 account and no foreign campaign'
);

set local request.jwt.claim.sub = '8c000000-0000-4000-8000-000000000001';
reset role;
update loyalty.customer_user_links set revoked_at = clock_timestamp()
where auth_user_id = '8c000000-0000-4000-8000-000000000001';
set local role authenticated;
select results_eq(
  $$ select count(*)::bigint from loyalty.get_my_loyalty_accounts() $$,
  array[0::bigint],
  'revocation removes customer self access immediately'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.get_my_loyalty_experiences_v1() $$,
  array[0::bigint],
  'revocation removes strict aggregate access immediately'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.get_my_loyalty_experiences_v2() $$,
  array[0::bigint],
  'revocation removes V2 aggregate access immediately'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.get_my_loyalty_experiences_v3() $$,
  array[0::bigint],
  'revocation removes V3 campaign-opportunity access immediately'
);

reset role;
update loyalty.workspaces set status = 'suspended'
where public_id = '8d000000-0000-4000-8000-000000000110';
set local role authenticated;
set local request.jwt.claim.sub = '8c000000-0000-4000-8000-000000000002';
select results_eq(
  $$ select count(*)::bigint from loyalty.get_my_loyalty_accounts() $$,
  array[0::bigint],
  'a suspended workspace removes hosted account access'
);

set local request.jwt.claim.sub = '';
select results_eq(
  $$ select count(*)::bigint from loyalty.get_my_loyalty_accounts() $$,
  array[0::bigint],
  'a missing authenticated subject fails closed'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.get_my_loyalty_experiences_v1() $$,
  array[0::bigint],
  'a missing authenticated subject cannot read a strict aggregate'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.get_my_loyalty_experiences_v3() $$,
  array[0::bigint],
  'a missing authenticated subject cannot read campaign opportunities'
);
select is_empty(
  $$ select parameter_name from information_schema.parameters
     where specific_schema = 'loyalty'
       and specific_name like 'get_my_loyalty_accounts_%'
       and parameter_mode = 'IN' $$,
  'the caller cannot inject organization customer workspace or programme authority'
);
select ok(
  (select pg_get_functiondef('loyalty.get_my_loyalty_accounts()'::regprocedure)
      !~* 'email'),
  'customer self access contains no email matching path'
);
select ok(
  (select pg_get_functiondef('loyalty.get_my_loyalty_accounts()'::regprocedure)
      ~ 'limit 20'),
  'account and reward output is explicitly bounded'
);
select is_empty(
  $$ select parameter_name from information_schema.parameters
     where specific_schema = 'loyalty'
       and specific_name like 'get_my_loyalty_experiences_v1_%'
       and parameter_mode = 'IN' $$,
  'strict aggregate accepts no tenant customer connection workspace programme or account selector'
);
select is_empty(
  $$ select parameter_name from information_schema.parameters
     where specific_schema = 'loyalty'
       and specific_name like 'get_my_loyalty_experiences_v2_%'
       and parameter_mode = 'IN' $$,
  'V2 accepts no tenant customer connection workspace programme account or locale selector'
);
select is_empty(
  $$ select parameter_name from information_schema.parameters
     where specific_schema = 'loyalty'
       and specific_name like 'get_my_loyalty_experiences_v3_%'
       and parameter_mode = 'IN' $$,
  'V3 accepts no tenant customer account programme campaign audience or assignment selector'
);
select ok(
  (select pg_get_functiondef('loyalty.get_my_loyalty_experiences_v1()'::regprocedure)
      !~* 'email'),
  'strict aggregate contains no email matching path'
);
select ok(
  (select pg_get_functiondef('loyalty.get_my_loyalty_experiences_v1()'::regprocedure)
      ~ 'limit 24'),
  'earning-method output is explicitly bounded'
);

select * from finish();
rollback;
