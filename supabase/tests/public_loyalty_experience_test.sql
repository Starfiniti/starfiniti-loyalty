begin;

create extension if not exists pgtap with schema extensions;

select plan(89);

select has_function(
  'loyalty', 'get_public_loyalty_experience', array['uuid', 'uuid', 'text'],
  'public hosted loyalty read model exists'
);
select has_function(
  'loyalty', 'get_public_loyalty_experience_v2', array['uuid', 'uuid'],
  'English-only V2 public loyalty read model exists'
);
select ok(
  has_function_privilege(
    'anon', 'loyalty.get_public_loyalty_experience_v2(uuid,uuid)', 'EXECUTE'
  ),
  'anonymous callers can enter the bounded V2 read model'
);
select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.get_public_loyalty_experience_v2(uuid,uuid)',
    'EXECUTE'
  ),
  'signed-in customers may enter the same V2 public projection'
);
select results_eq(
  $$ select routine.prosecdef
     from pg_proc as routine
     join pg_namespace as namespace on namespace.oid = routine.pronamespace
     where namespace.nspname = 'loyalty'
       and routine.proname = 'get_public_loyalty_experience_v2'
       and exists (
         select 1 from unnest(routine.proconfig) as setting
         where setting = 'search_path=""'
       ) $$,
  array[true],
  'V2 public projection is security definer with an empty search path'
);
select results_eq(
  $$ select routine.pronargs::integer
     from pg_proc as routine
     join pg_namespace as namespace on namespace.oid = routine.pronamespace
     where namespace.nspname = 'loyalty'
       and routine.proname = 'get_public_loyalty_experience_v2' $$,
  array[2],
  'V2 accepts only public workspace and programme selectors and no locale authority'
);
select has_function(
  'loyalty', 'get_public_loyalty_experience_v3', array['uuid', 'uuid'],
  'guest-safe V3 public VIP catalogue read model exists'
);
select ok(
  has_function_privilege(
    'anon', 'loyalty.get_public_loyalty_experience_v3(uuid,uuid)', 'EXECUTE'
  ),
  'anonymous callers can enter the bounded V3 read model'
);
select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.get_public_loyalty_experience_v3(uuid,uuid)', 'EXECUTE'
  ),
  'signed-in customers may enter the same V3 public projection'
);
select results_eq(
  $$ select routine.prosecdef
     from pg_proc as routine
     join pg_namespace as namespace on namespace.oid = routine.pronamespace
     where namespace.nspname = 'loyalty'
       and routine.proname = 'get_public_loyalty_experience_v3'
       and exists (
         select 1 from unnest(routine.proconfig) as setting
         where setting = 'search_path=""'
       ) $$,
  array[true],
  'V3 public projection is security definer with an empty search path'
);
select results_eq(
  $$ select routine.pronargs::integer
     from pg_proc as routine
     join pg_namespace as namespace on namespace.oid = routine.pronamespace
     where namespace.nspname = 'loyalty'
       and routine.proname = 'get_public_loyalty_experience_v3' $$,
  array[2],
  'V3 accepts only public workspace and programme selectors'
);
select has_function(
  'loyalty', 'get_public_loyalty_experience_v4', array['uuid', 'uuid'],
  'guest-safe V4 public earning catalogue read model exists'
);
select ok(
  has_function_privilege(
    'anon', 'loyalty.get_public_loyalty_experience_v4(uuid,uuid)', 'EXECUTE'
  ),
  'anonymous callers can enter the bounded V4 read model'
);
select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.get_public_loyalty_experience_v4(uuid,uuid)', 'EXECUTE'
  ),
  'signed-in customers may enter the same V4 public projection'
);
select results_eq(
  $$ select routine.prosecdef
     from pg_proc as routine
     join pg_namespace as namespace on namespace.oid = routine.pronamespace
     where namespace.nspname = 'loyalty'
       and routine.proname = 'get_public_loyalty_experience_v4'
       and exists (
         select 1 from unnest(routine.proconfig) as setting
         where setting = 'search_path=""'
       ) $$,
  array[true],
  'V4 public projection is security definer with an empty search path'
);
select results_eq(
  $$ select routine.pronargs::integer
     from pg_proc as routine
     join pg_namespace as namespace on namespace.oid = routine.pronamespace
     where namespace.nspname = 'loyalty'
       and routine.proname = 'get_public_loyalty_experience_v4' $$,
  array[2],
  'V4 accepts only public workspace and programme selectors'
);
select has_function(
  'loyalty', 'get_public_loyalty_experience_v5', array['uuid', 'uuid'],
  'guest-safe V5 public reward catalogue read model exists'
);
select ok(
  has_function_privilege(
    'anon', 'loyalty.get_public_loyalty_experience_v5(uuid,uuid)', 'EXECUTE'
  ),
  'anonymous callers can enter the bounded V5 read model'
);
select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.get_public_loyalty_experience_v5(uuid,uuid)', 'EXECUTE'
  ),
  'signed-in customers may enter the same V5 public projection'
);
select results_eq(
  $$ select routine.prosecdef
     from pg_proc as routine
     join pg_namespace as namespace on namespace.oid = routine.pronamespace
     where namespace.nspname = 'loyalty'
       and routine.proname = 'get_public_loyalty_experience_v5'
       and exists (
         select 1 from unnest(routine.proconfig) as setting
         where setting = 'search_path=""'
       ) $$,
  array[true],
  'V5 public projection is security definer with an empty search path'
);
select results_eq(
  $$ select routine.pronargs::integer
     from pg_proc as routine
     join pg_namespace as namespace on namespace.oid = routine.pronamespace
     where namespace.nspname = 'loyalty'
       and routine.proname = 'get_public_loyalty_experience_v5' $$,
  array[2],
  'V5 accepts only public workspace and programme selectors'
);
select has_function(
  'loyalty', 'get_public_loyalty_experience_v6', array['uuid', 'uuid'],
  'guest-safe V6 public referral catalogue read model exists'
);
select ok(
  has_function_privilege(
    'anon', 'loyalty.get_public_loyalty_experience_v6(uuid,uuid)', 'EXECUTE'
  ),
  'anonymous callers can enter the bounded V6 read model'
);
select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.get_public_loyalty_experience_v6(uuid,uuid)', 'EXECUTE'
  ),
  'signed-in customers may enter the same V6 public projection'
);
select results_eq(
  $$ select routine.prosecdef
     from pg_proc as routine
     join pg_namespace as namespace on namespace.oid = routine.pronamespace
     where namespace.nspname = 'loyalty'
       and routine.proname = 'get_public_loyalty_experience_v6'
       and exists (
         select 1 from unnest(routine.proconfig) as setting
         where setting = 'search_path=""'
       ) $$,
  array[true],
  'V6 public projection is security definer with an empty search path'
);
select results_eq(
  $$ select routine.pronargs::integer
     from pg_proc as routine
     join pg_namespace as namespace on namespace.oid = routine.pronamespace
     where namespace.nspname = 'loyalty'
       and routine.proname = 'get_public_loyalty_experience_v6' $$,
  array[2],
  'V6 accepts only public workspace and programme selectors'
);
select ok(
  has_function_privilege('anon', 'loyalty.get_public_loyalty_experience(uuid,uuid,text)', 'EXECUTE'),
  'anonymous callers can enter only the public read model'
);
select ok(
  has_schema_privilege('anon', 'loyalty', 'USAGE'),
  'anonymous callers can resolve reviewed functions in the exposed schema'
);
select ok(
  has_function_privilege('authenticated', 'loyalty.get_public_loyalty_experience(uuid,uuid,text)', 'EXECUTE'),
  'signed-in customers may enter the same public projection'
);
select ok(
  not has_table_privilege('anon', 'loyalty.programme_versions', 'SELECT'),
  'anonymous callers cannot read raw programme versions'
);
select ok(
  not has_table_privilege('anon', 'loyalty.programme_rewards', 'SELECT'),
  'anonymous callers cannot read raw reward definitions or configuration'
);
select ok(
  not has_table_privilege('anon', 'loyalty.programme_earning_rules', 'SELECT'),
  'anonymous callers cannot read raw earning rules or selectors'
);
select ok(
  not has_table_privilege(
    'anon', 'loyalty.programme_referral_policies', 'SELECT'
  ),
  'anonymous callers cannot read raw referral policy or fraud configuration'
);
select ok(
  not has_table_privilege('anon', 'loyalty.experience_translations', 'SELECT'),
  'anonymous callers cannot read translation tables directly'
);
select ok(
  not has_table_privilege('anon', 'loyalty.programme_tier_policies', 'SELECT')
  and not has_table_privilege(
    'anon', 'loyalty.programme_tier_policy_levels', 'SELECT'
  )
  and not has_table_privilege(
    'anon', 'loyalty.programme_tier_thresholds', 'SELECT'
  ),
  'anonymous callers cannot read raw advanced VIP policy tables'
);
select ok(
  not has_function_privilege(
    'anon', 'loyalty_private.try_parse_public_timestamptz(text)', 'EXECUTE'
  ) and not has_function_privilege(
    'anon', 'loyalty_private.try_parse_public_integer(text)', 'EXECUTE'
  ),
  'anonymous callers cannot invoke private public-projection parsers'
);
select results_eq(
  $$ select routine.prosecdef
     from pg_proc as routine
     join pg_namespace as namespace on namespace.oid = routine.pronamespace
     where namespace.nspname = 'loyalty'
       and routine.proname = 'get_public_loyalty_experience'
       and exists (
         select 1 from unnest(routine.proconfig) as setting
         where setting = 'search_path=""'
       ) $$,
  array[true],
  'public projection is security definer with an empty search path'
);

insert into auth.users (id, email)
values ('7b000000-0000-4000-8000-000000000001', 'public-owner@example.test');
insert into loyalty.organizations (public_id, slug, name)
values
  ('7b000000-0000-4000-8000-000000000100', 'public-one', 'Private Organization Name'),
  ('7c000000-0000-4000-8000-000000000100', 'public-two', 'Other Organization');
insert into loyalty.organization_memberships (organization_id, user_id, role)
select id, '7b000000-0000-4000-8000-000000000001', 'owner'
from loyalty.organizations where slug = 'public-one';
insert into loyalty.workspaces (public_id, organization_id, slug, name)
select
  case slug when 'public-one' then '7b000000-0000-4000-8000-000000000110'::uuid
    else '7c000000-0000-4000-8000-000000000110'::uuid end,
  id, 'store', name || ' Store'
from loyalty.organizations where slug in ('public-one', 'public-two');
insert into loyalty.programme_groups (public_id, organization_id, slug, name)
select
  case slug when 'public-one' then '7b000000-0000-4000-8000-000000000120'::uuid
    else '7c000000-0000-4000-8000-000000000120'::uuid end,
  id, 'rewards', name || ' Rewards'
from loyalty.organizations where slug in ('public-one', 'public-two');
insert into loyalty.programme_group_workspaces (organization_id, programme_group_id, workspace_id)
select organization.id, programme_group.id, workspace.id
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group on programme_group.organization_id = organization.id
join loyalty.workspaces as workspace on workspace.organization_id = organization.id;
insert into loyalty.programmes (public_id, organization_id, programme_group_id, slug, name, status)
select
  case organization.slug when 'public-one' then '7b000000-0000-4000-8000-000000000130'::uuid
    else '7c000000-0000-4000-8000-000000000130'::uuid end,
  organization.id, programme_group.id, 'rosy-rewards',
  case organization.slug when 'public-one' then 'Rosy Rewards' else 'Other Rewards' end,
  'active'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group on programme_group.organization_id = organization.id;
insert into loyalty.programme_versions (
  public_id, organization_id, programme_group_id, programme_id,
  version_number, status, configuration, configuration_sha256,
  approved_by_user_id, published_at
)
select
  case organization.slug when 'public-one' then '7b000000-0000-4000-8000-000000000140'::uuid
    else '7c000000-0000-4000-8000-000000000140'::uuid end,
  organization.id, programme.programme_group_id, programme.id, 1, 'published',
  case when organization.slug = 'public-one' then
    '{
      "version":"2","currencyCode":"EUR","currencyMinorUnitDigits":2,
      "pendingDays":30,"pointsExpireAfterDays":365,
      "tiers":[{
        "code":"rose","name":"Rose","minimumEligibleSpendMinor":"0",
        "pointsPerMajorUnit":"5"
      }],
      "rewards":[],
      "earningRules":[{
        "code":"purchase-base","name":"Base purchase points",
        "source":"purchase","enabled":true,"priority":0,
        "stackable":false,
        "effect":{"kind":"base_rate","pointsPerMajorUnit":"5"},
        "conditions":{
          "productIds":[],"categoryIds":[],"currencyCodes":[],
          "markets":[],"channels":[],"activityCodes":[],
          "segmentCodes":[],"tierCodes":[],"startsAt":null,"endsAt":null
        },
        "purchaseExclusions":{
          "productIds":[],"categoryIds":[],"shipping":true,"tax":true,
          "fees":true,"giftCardPayments":true,"storeCreditPayments":true,
          "discounts":true
        },
        "cap":{
          "perEventPoints":null,"perMemberPoints":null,
          "memberPeriod":null,"rollingDays":null
        }
      }],
      "referralPolicy":{
        "version":"1","attributionWindowDays":30,
        "qualificationStatus":"completed","coolingDays":14,
        "minimumEligibleSpendMinor":"3000","requireNewCustomer":true,
        "monthlyAdvocateReferralLimit":12,
        "advocateReward":{"kind":"points","points":"500"},
        "friendReward":{"kind":"points","points":"250"},
        "risk":{
          "manualReviewEnabled":true,"rollingWindowHours":168,
          "sourceNetworkReferralLimit":5,"deviceReferralLimit":5
        }
      }
    }'::jsonb
  else '{"version":"1","tiers":[],"rewards":[]}'::jsonb end,
  extensions.digest('public-fixture', 'sha256'),
  case when organization.slug = 'public-one' then '7b000000-0000-4000-8000-000000000001'::uuid else null end,
  now()
from loyalty.organizations as organization
join loyalty.programmes as programme on programme.organization_id = organization.id;
insert into loyalty.programme_referral_policies (
  organization_id, programme_group_id, programme_version_id,
  attribution_window_days, qualification_status, cooling_days,
  minimum_eligible_spend_minor, require_new_customer,
  monthly_advocate_referral_limit, advocate_reward_points,
  friend_reward_points, manual_review_enabled, risk_window_hours,
  source_network_referral_limit, device_referral_limit
)
select
  version.organization_id, version.programme_group_id, version.id,
  30, 'completed', 14, 3000, true, 12, 500, 250, true, 168, 5, 5
from loyalty.programme_versions as version
join loyalty.organizations as organization
  on organization.id = version.organization_id
where organization.slug = 'public-one';
insert into loyalty.programme_tiers (
  organization_id, programme_group_id, programme_version_id, code, name,
  ordinal, minimum_eligible_spend_minor, points_per_major_unit
)
select organization_id, programme_group_id, id, 'rose', 'Rose', 1, 0, 5
from loyalty.programme_versions where public_id = '7b000000-0000-4000-8000-000000000140';
insert into loyalty.programme_tiers (
  organization_id, programme_group_id, programme_version_id, code, name,
  ordinal, minimum_eligible_spend_minor, points_per_major_unit
)
select organization_id, programme_group_id, id, 'bloom', 'Bloom', 2, 15000, 6
from loyalty.programme_versions where public_id = '7b000000-0000-4000-8000-000000000140';
insert into loyalty.programme_tiers (
  organization_id, programme_group_id, programme_version_id, code, name,
  ordinal, minimum_eligible_spend_minor, points_per_major_unit
)
select organization_id, programme_group_id, id, 'unsafe', '<script>tier</script>', 3, 30000, 7
from loyalty.programme_versions where public_id = '7b000000-0000-4000-8000-000000000140';
insert into loyalty.programme_tiers (
  organization_id, programme_group_id, programme_version_id, code, name,
  ordinal, minimum_eligible_spend_minor, points_per_major_unit
)
select organization_id, programme_group_id, id, 'starter', 'Starter', 1, 0, 4
from loyalty.programme_versions where public_id = '7c000000-0000-4000-8000-000000000140';
insert into loyalty.programme_tiers (
  organization_id, programme_group_id, programme_version_id, code, name,
  ordinal, minimum_eligible_spend_minor, points_per_major_unit
)
select organization_id, programme_group_id, id, 'silver', 'Silver', 2, 25000, 5
from loyalty.programme_versions where public_id = '7c000000-0000-4000-8000-000000000140';
insert into loyalty.programme_rewards (
  organization_id, programme_group_id, programme_version_id, code, name,
  reward_kind, cost_points, configuration
)
select organization_id, programme_group_id, id, 'five-off', '€5 discount',
  'fixed_discount', 500,
  '{"version":"2","fulfilmentMode":"woocommerce_coupon","validityDays":30,"amountMinor":"500","currencyMinorUnitDigits":2,"availability":{"startsAt":null,"endsAt":null,"tierCodes":["bloom"],"segmentCodes":[],"perCustomerLimit":2,"globalQuantity":"50","pointsBudget":"25000"},"restrictions":{"minimumSpendMinor":"2000","productIds":["42"],"excludedProductIds":[],"categoryIds":[],"excludedCategoryIds":[],"excludeSaleItems":true,"stacking":"combinable"}}'::jsonb
from loyalty.programme_versions where public_id = '7b000000-0000-4000-8000-000000000140';
insert into loyalty.programme_rewards (
  organization_id, programme_group_id, programme_version_id, code, name,
  reward_kind, cost_points
)
select organization_id, programme_group_id, id, 'unsafe', '<script>reward</script>',
  'custom', 1
from loyalty.programme_versions where public_id = '7b000000-0000-4000-8000-000000000140';
insert into loyalty.programme_rewards (
  organization_id, programme_group_id, programme_version_id, code, name,
  reward_kind, cost_points, configuration
)
select organization_id, programme_group_id, id, 'legacy-ten-percent', 'Legacy 10% off',
  'percentage_discount', 400,
  '{"validityDays":30,"percentageBasisPoints":1000,"maximumDiscountMinor":null,"currencyMinorUnitDigits":2}'::jsonb
from loyalty.programme_versions where public_id = '7c000000-0000-4000-8000-000000000140';
insert into loyalty.programme_tier_policies (
  organization_id, programme_group_id, programme_version_id,
  qualification_period_kind, rolling_days, downgrade_grace_days
)
select organization_id, programme_group_id, id, 'rolling_days', 365, 30
from loyalty.programme_versions
where public_id = '7b000000-0000-4000-8000-000000000140';
insert into loyalty.programme_tier_policy_levels (
  organization_id, programme_group_id, programme_version_id, tier_code,
  ordinal, entry_operator, retention_operator, reentry_operator,
  earning_multiplier_basis_points, reward_codes, early_access
)
select organization_id, programme_group_id, id, 'rose', 1,
  null, null, null, 10000, '{}'::text[], false
from loyalty.programme_versions
where public_id = '7b000000-0000-4000-8000-000000000140';
insert into loyalty.programme_tier_policy_levels (
  organization_id, programme_group_id, programme_version_id, tier_code,
  ordinal, entry_operator, retention_operator, reentry_operator,
  earning_multiplier_basis_points, reward_codes, early_access
)
select organization_id, programme_group_id, id, 'bloom', 2,
  'any', 'all', 'all', 12000, array['five-off'], true
from loyalty.programme_versions
where public_id = '7b000000-0000-4000-8000-000000000140';
insert into loyalty.programme_tier_thresholds (
  organization_id, programme_group_id, programme_version_id, tier_code,
  threshold_kind, ordinal, metric, minimum_value, activity_codes
)
select organization_id, programme_group_id, id, 'bloom', threshold_kind,
  ordinal, metric, minimum_value, activity_codes
from loyalty.programme_versions
cross join (values
  ('entry'::text, 1::smallint, 'eligible_spend'::text, 15000::bigint, '{}'::text[]),
  ('entry', 2::smallint, 'order_count', 5::bigint, '{}'::text[]),
  ('entry', 3::smallint, 'verified_action_count', 2::bigint, array['birthday']::text[]),
  ('retention', 1::smallint, 'eligible_spend', 12000::bigint, '{}'::text[]),
  ('reentry', 1::smallint, 'eligible_spend', 15000::bigint, '{}'::text[])
) as threshold(threshold_kind, ordinal, metric, minimum_value, activity_codes)
where public_id = '7b000000-0000-4000-8000-000000000140';
insert into loyalty.programme_earning_rules (
  organization_id, programme_group_id, programme_version_id, code, name,
  ordinal, source, enabled, priority, stackable, effect_kind, effect,
  conditions, purchase_exclusions, cap
)
select version.organization_id, version.programme_group_id, version.id,
  rule.code, rule.name, rule.ordinal, rule.source, true, rule.priority,
  rule.stackable, rule.effect_kind, rule.effect, rule.conditions,
  rule.purchase_exclusions, rule.cap
from loyalty.programme_versions as version
cross join (values
  (
    'purchase-base'::text, 'Eligible purchases'::text, 1::smallint,
    'purchase'::text, 0::integer, false, 'base_rate'::text,
    '{"kind":"base_rate","pointsPerMajorUnit":"5"}'::jsonb,
    '{"productIds":[],"categoryIds":[],"currencyCodes":[],"markets":[],"channels":[],"activityCodes":[],"segmentCodes":[],"tierCodes":[],"startsAt":null,"endsAt":null}'::jsonb,
    '{}'::jsonb,
    '{"perEventPoints":null,"perMemberPoints":null,"memberPeriod":null,"rollingDays":null}'::jsonb
  ),
  (
    'internal-high-value-multiplier', 'Internal high-value multiplier',
    2::smallint, 'purchase', 10, false, 'multiplier',
    '{"kind":"multiplier","multiplierBasisPoints":15000}'::jsonb,
    '{"productIds":[],"categoryIds":[],"currencyCodes":[],"markets":[],"channels":[],"activityCodes":[],"segmentCodes":["private-segment"],"tierCodes":[],"startsAt":null,"endsAt":null}'::jsonb,
    '{}'::jsonb,
    '{"perEventPoints":null,"perMemberPoints":null,"memberPeriod":null,"rollingDays":null}'::jsonb
  ),
  (
    'birthday-bonus', 'Birthday bonus', 3::smallint, 'birthday',
    10, true, 'fixed_bonus',
    '{"kind":"fixed_bonus","points":"250"}'::jsonb,
    '{"productIds":[],"categoryIds":[],"currencyCodes":[],"markets":[],"channels":[],"activityCodes":[],"segmentCodes":[],"tierCodes":[],"startsAt":"2099-01-01T00:00:00Z","endsAt":null}'::jsonb,
    null,
    '{"perEventPoints":null,"perMemberPoints":null,"memberPeriod":null,"rollingDays":null}'::jsonb
  ),
  (
    'private-consultation', 'Private consultation', 4::smallint,
    'custom_activity', 20, true, 'fixed_bonus',
    '{"kind":"fixed_bonus","points":"100"}'::jsonb,
    '{"productIds":[],"categoryIds":[],"currencyCodes":[],"markets":[],"channels":[],"activityCodes":["consultation"],"segmentCodes":[],"tierCodes":[],"startsAt":null,"endsAt":null}'::jsonb,
    null,
    '{"perEventPoints":null,"perMemberPoints":null,"memberPeriod":null,"rollingDays":null}'::jsonb
  ),
  (
    'unsafe-referral', '<script>internal referral label</script>', 5::smallint,
    'referral', 30, true, 'fixed_bonus',
    '{"kind":"fixed_bonus","points":"125"}'::jsonb,
    '{"productIds":[],"categoryIds":[],"currencyCodes":[],"markets":[],"channels":[],"activityCodes":[],"segmentCodes":[],"tierCodes":[],"startsAt":null,"endsAt":null}'::jsonb,
    null,
    '{"perEventPoints":null,"perMemberPoints":null,"memberPeriod":null,"rollingDays":null}'::jsonb
  ),
  (
    'invalid-effect', 'Invalid effect', 6::smallint,
    'account_created', 40, true, 'fixed_bonus',
    '{"kind":"fixed_bonus","points":"9223372036854775808"}'::jsonb,
    '{"productIds":[],"categoryIds":[],"currencyCodes":[],"markets":[],"channels":[],"activityCodes":[],"segmentCodes":[],"tierCodes":[],"startsAt":null,"endsAt":null}'::jsonb,
    null,
    '{"perEventPoints":null,"perMemberPoints":null,"memberPeriod":null,"rollingDays":null}'::jsonb
  ),
  (
    'invalid-date', 'Invalid date', 7::smallint,
    'verified_product_review', 50, true, 'fixed_bonus',
    '{"kind":"fixed_bonus","points":"50"}'::jsonb,
    '{"productIds":[],"categoryIds":[],"currencyCodes":[],"markets":[],"channels":[],"activityCodes":[],"segmentCodes":[],"tierCodes":[],"startsAt":"2099-99-99T00:00:00Z","endsAt":null}'::jsonb,
    null,
    '{"perEventPoints":null,"perMemberPoints":null,"memberPeriod":null,"rollingDays":null}'::jsonb
  )
) as rule(
  code, name, ordinal, source, priority, stackable, effect_kind, effect,
  conditions, purchase_exclusions, cap
)
where version.public_id = '7b000000-0000-4000-8000-000000000140';
insert into loyalty.experience_themes (
  organization_id, workspace_id, programme_group_id, brand_color,
  display_font, card_radius_px, hero_text, points_label, show_tier, show_rewards
)
select link.organization_id, link.workspace_id, link.programme_group_id,
  '#7c2d4f', 'editorial-serif', 22, 'Saved English hero', 'Stars', true, true
from loyalty.programme_group_workspaces as link
join loyalty.workspaces as workspace on workspace.id = link.workspace_id
where workspace.public_id = '7b000000-0000-4000-8000-000000000110';
insert into loyalty.experience_translations (
  organization_id, workspace_id, programme_group_id, locale, hero_text,
  points_label, balance_label, rewards_label, redeem_label, join_label, earn_message
)
select link.organization_id, link.workspace_id, link.programme_group_id,
  'sl-SI', 'Lepota, ki vrača', 'Točke', 'Vaše stanje', 'Vaše nagrade',
  'Unovči', 'Pridruži se brezplačno',
  'Zbirajte točke pri vsakem upravičenem naročilu.'
from loyalty.programme_group_workspaces as link
join loyalty.workspaces as workspace on workspace.id = link.workspace_id
where workspace.public_id = '7b000000-0000-4000-8000-000000000110';

set local role anon;

select results_eq(
  $$ select programme_name, requested_locale, resolved_locale
     from loyalty.get_public_loyalty_experience(
       '7b000000-0000-4000-8000-000000000110',
       '7b000000-0000-4000-8000-000000000130', 'sl-SI') $$,
  $$ values ('Rosy Rewards'::text, 'sl-SI'::text, 'sl-SI'::text) $$,
  'anonymous Slovenian request resolves one published programme'
);
select results_eq(
  $$ select hero_text, points_label, balance_label, join_label
     from loyalty.get_public_loyalty_experience(
       '7b000000-0000-4000-8000-000000000110',
       '7b000000-0000-4000-8000-000000000130', 'sl-SI') $$,
  $$ values ('Lepota, ki vrača'::text, 'Točke'::text,
             'Vaše stanje'::text, 'Pridruži se brezplačno'::text) $$,
  'public projection returns exact approved Slovenian copy'
);
select results_eq(
  $$ select brand_color, display_font, card_radius_px, show_tier, show_rewards
     from loyalty.get_public_loyalty_experience(
       '7b000000-0000-4000-8000-000000000110',
       '7b000000-0000-4000-8000-000000000130', 'en') $$,
  $$ values ('#7c2d4f'::text, 'editorial-serif'::text, 22, true, true) $$,
  'public projection exposes only approved bounded theme tokens'
);
select results_eq(
  $$ select hero_text, points_label, balance_label
     from loyalty.get_public_loyalty_experience(
       '7b000000-0000-4000-8000-000000000110',
       '7b000000-0000-4000-8000-000000000130', 'en') $$,
  $$ values ('Saved English hero'::text, 'Stars'::text, 'Your balance'::text) $$,
  'unsaved English translation retains legacy theme copy and safe defaults'
);
select results_eq(
  $$ select requested_locale, resolved_locale,
            presentation ->> 'version',
            presentation #>> '{copy,locale}',
            presentation #>> '{copy,heroText}'
     from loyalty.get_public_loyalty_experience_v2(
       '7b000000-0000-4000-8000-000000000110',
       '7b000000-0000-4000-8000-000000000130') $$,
  $$ values ('en'::text, 'en'::text, '2'::text, 'en'::text,
             'Saved English hero'::text) $$,
  'V2 emits only reviewed English copy in one strict nested presentation'
);
select results_eq(
  $$ select presentation #>> '{theme,density}',
            presentation #>> '{theme,heroAsset}',
            (presentation #>> '{theme,showReferrals}')::boolean,
            presentation #> '{theme,sectionOrder}'
     from loyalty.get_public_loyalty_experience_v2(
       '7b000000-0000-4000-8000-000000000110',
       '7b000000-0000-4000-8000-000000000130') $$,
  $$ values (
    'comfortable'::text, 'sparkles'::text, true,
    '["overview","earning","rewards","vip","referrals","history","account"]'::jsonb
  ) $$,
  'V2 supplies controlled defaults and every semantic section exactly once'
);
select results_eq(
  $$ select tiers, rewards
     from loyalty.get_public_loyalty_experience_v2(
       '7b000000-0000-4000-8000-000000000110',
       '7b000000-0000-4000-8000-000000000130') $$,
  $$ values (
    '[{"code":"rose","name":"Rose","minimumEligibleSpendMinor":"0","pointsPerMajorUnit":"5"},{"code":"bloom","name":"Bloom","minimumEligibleSpendMinor":"15000","pointsPerMajorUnit":"6"}]'::jsonb,
    '[{"code":"five-off","name":"€5 discount","kind":"fixed_discount","costPoints":"500"}]'::jsonb
  ) $$,
  'V2 preserves the bounded published tier and reward value contract'
);
select results_eq(
  $$ select requested_locale, resolved_locale, tiers, rewards, vip_catalogue
     from loyalty.get_public_loyalty_experience_v3(
       '7b000000-0000-4000-8000-000000000110',
       '7b000000-0000-4000-8000-000000000130') $$,
  $$ values (
    'en'::text,
    'en'::text,
    '[{"code":"rose","name":"Rose","minimumEligibleSpendMinor":"0","pointsPerMajorUnit":"5"},{"code":"bloom","name":"Bloom","minimumEligibleSpendMinor":"15000","pointsPerMajorUnit":"6"}]'::jsonb,
    '[{"code":"five-off","name":"€5 discount","kind":"fixed_discount","costPoints":"500"}]'::jsonb,
    '{"version":"1","qualificationPeriod":{"kind":"rolling_days","days":365},"downgradeGraceDays":30,"levels":[{"code":"rose","name":"Rose","entry":null,"pointsPerMajorUnit":"5","earlyAccess":false,"exclusiveRewardAccess":false},{"code":"bloom","name":"Bloom","entry":{"operator":"any","thresholds":[{"metric":"eligible_spend","minimum":"15000"},{"metric":"order_count","minimum":"5"},{"metric":"verified_action_count","minimum":"2"}]},"pointsPerMajorUnit":"6","earlyAccess":true,"exclusiveRewardAccess":true}]}'::jsonb
  ) $$,
  'V3 exposes exact public metrics and benefit flags without private activity selectors'
);
select results_eq(
  $$ select vip_catalogue
     from loyalty.get_public_loyalty_experience_v3(
       '7c000000-0000-4000-8000-000000000110',
       '7c000000-0000-4000-8000-000000000130') $$,
  $$ values (
    '{"version":"1","qualificationPeriod":{"kind":"lifetime"},"downgradeGraceDays":0,"levels":[{"code":"starter","name":"Starter","entry":null,"pointsPerMajorUnit":"4","earlyAccess":false,"exclusiveRewardAccess":false},{"code":"silver","name":"Silver","entry":{"operator":"all","thresholds":[{"metric":"eligible_spend","minimum":"25000"}]},"pointsPerMajorUnit":"5","earlyAccess":false,"exclusiveRewardAccess":false}]}'::jsonb
  ) $$,
  'V3 synthesizes an equivalent lifetime catalogue for legacy published tiers'
);
select results_eq(
  $$ select
       pg_catalog.jsonb_array_length(earning_methods),
       earning_methods #>> '{0,code}',
       earning_methods #>> '{0,source}',
       earning_methods #>> '{0,effect,kind}',
       earning_methods #>> '{0,effect,pointsPerMajorUnit}',
       (earning_methods #>> '{0,hasRestrictions}')::boolean,
       earning_methods #>> '{1,code}',
       earning_methods #>> '{1,name}',
       earning_methods #>> '{1,effect,kind}',
       (earning_methods #>> '{1,effect,multiplierBasisPoints}')::integer,
       earning_methods #>> '{2,code}',
       (earning_methods #>> '{2,availableNow}')::boolean,
       earning_methods #>> '{3,code}',
       earning_methods #>> '{3,name}'
     from loyalty.get_public_loyalty_experience_v4(
       '7b000000-0000-4000-8000-000000000110',
       '7b000000-0000-4000-8000-000000000130') $$,
  $$ values (
    4, 'purchase-1'::text, 'purchase'::text, 'base_rate'::text,
    '5'::text, true, 'purchase-2'::text, 'Purchase multiplier'::text,
    'multiplier'::text, 15000, 'birthday-3'::text, false,
    'referral-5'::text, 'Refer a friend'::text
  ) $$,
  'V4 returns exact public standard methods and schedule availability'
);
select results_eq(
  $$ select
       earning_methods::text !~
         '(private-consultation|unsafe-referral|internal-high-value|internal referral|invalid-effect|invalid-date|activityCodes|segmentCodes|tierCodes|perMemberPoints)',
       not (earning_methods -> 0 ? 'cap'),
       not (earning_methods -> 0 ? 'conditions'),
       not (earning_methods -> 0 ? 'purchaseExclusions')
     from loyalty.get_public_loyalty_experience_v4(
       '7b000000-0000-4000-8000-000000000110',
       '7b000000-0000-4000-8000-000000000130') $$,
  $$ values (true, true, true, true) $$,
  'V4 omits custom activities, unsafe rules, merchant labels/codes, raw selectors, caps, and exclusions'
);
select results_eq(
  $$ select
       pg_catalog.jsonb_array_length(earning_methods),
       earning_methods #>> '{0,code}',
       earning_methods #>> '{0,effect,pointsPerMajorUnit}'
     from loyalty.get_public_loyalty_experience_v4(
       '7c000000-0000-4000-8000-000000000110',
       '7c000000-0000-4000-8000-000000000130') $$,
  $$ values (1, 'eligible-purchases'::text, '4'::text) $$,
  'V4 synthesizes one conservative public purchase method for legacy V1'
);
select results_eq(
  $$ select rewards from loyalty.get_public_loyalty_experience(
       '7b000000-0000-4000-8000-000000000110',
       '7b000000-0000-4000-8000-000000000130', 'en') $$,
  $$ values ('[{"code":"five-off","name":"€5 discount","kind":"fixed_discount","costPoints":"500"}]'::jsonb) $$,
  'reward projection omits markup-shaped names and private reward configuration'
);

reset role;
insert into loyalty.programme_rewards (
  organization_id, programme_group_id, programme_version_id, code, name,
  reward_kind, cost_points, configuration
)
select organization_id, programme_group_id, id, 'summer-percent', 'Summer 15% off',
  'percentage_discount', 900,
  '{"version":"2","fulfilmentMode":"woocommerce_coupon","validityDays":14,"percentageBasisPoints":1500,"maximumDiscountMinor":null,"currencyMinorUnitDigits":2,"availability":{"startsAt":"2099-06-01T00:00:00Z","endsAt":"2099-09-01T00:00:00Z","tierCodes":[],"segmentCodes":[],"perCustomerLimit":null,"globalQuantity":null,"pointsBudget":null},"restrictions":{"minimumSpendMinor":null,"productIds":[],"excludedProductIds":[],"categoryIds":[],"excludedCategoryIds":[],"excludeSaleItems":false,"stacking":"exclusive"}}'::jsonb
from loyalty.programme_versions where public_id = '7b000000-0000-4000-8000-000000000140';
insert into loyalty.programme_rewards (
  organization_id, programme_group_id, programme_version_id, code, name,
  reward_kind, cost_points, configuration
)
select organization_id, programme_group_id, id, 'private-preview', 'Studio preview',
  'exclusive_access', 1200,
  '{"version":"2","fulfilmentMode":"manual","availability":{"startsAt":null,"endsAt":null,"tierCodes":[],"segmentCodes":[],"perCustomerLimit":1,"globalQuantity":null,"pointsBudget":null},"fulfilmentInstructions":"Internal delivery instructions must stay private.","fulfilmentSlaDays":5}'::jsonb
from loyalty.programme_versions where public_id = '7b000000-0000-4000-8000-000000000140';
insert into loyalty.programme_rewards (
  organization_id, programme_group_id, programme_version_id, code, name,
  reward_kind, cost_points, configuration
)
select organization_id, programme_group_id, id, 'credit', 'Store balance',
  'store_credit', 300, '{}'::jsonb
from loyalty.programme_versions where public_id = '7b000000-0000-4000-8000-000000000140';
insert into loyalty.programme_rewards (
  organization_id, programme_group_id, programme_version_id, code, name,
  reward_kind, cost_points, configuration
)
select organization_id, programme_group_id, id, 'expired-shipping', 'Expired shipping',
  'free_shipping', 250,
  '{"version":"2","fulfilmentMode":"woocommerce_coupon","validityDays":30,"availability":{"startsAt":null,"endsAt":"2000-01-01T00:00:00Z","tierCodes":[],"segmentCodes":[],"perCustomerLimit":null,"globalQuantity":null,"pointsBudget":null},"restrictions":{"minimumSpendMinor":null,"productIds":[],"excludedProductIds":[],"categoryIds":[],"excludedCategoryIds":[],"excludeSaleItems":false,"stacking":"exclusive"}}'::jsonb
from loyalty.programme_versions where public_id = '7b000000-0000-4000-8000-000000000140';
insert into loyalty.programme_rewards (
  organization_id, programme_group_id, programme_version_id, code, name,
  reward_kind, cost_points, configuration
)
select organization_id, programme_group_id, id, 'invalid-product', 'Invalid product',
  'free_product', 700,
  '{"version":"2","fulfilmentMode":"woocommerce_coupon","validityDays":30,"productId":"42","quantity":99,"availability":{"startsAt":null,"endsAt":null,"tierCodes":[],"segmentCodes":[],"perCustomerLimit":null,"globalQuantity":null,"pointsBudget":null},"restrictions":{"minimumSpendMinor":null,"productIds":[],"excludedProductIds":[],"categoryIds":[],"excludedCategoryIds":[],"excludeSaleItems":false,"stacking":"exclusive"}}'::jsonb
from loyalty.programme_versions where public_id = '7b000000-0000-4000-8000-000000000140';
insert into loyalty.programme_rewards (
  organization_id, programme_group_id, programme_version_id, code, name,
  reward_kind, cost_points, configuration
)
select organization_id, programme_group_id, id, 'wrong-scale', 'Wrong currency scale',
  'fixed_discount', 500,
  '{"version":"2","fulfilmentMode":"woocommerce_coupon","validityDays":30,"amountMinor":"500","currencyMinorUnitDigits":3,"availability":{"startsAt":null,"endsAt":null,"tierCodes":[],"segmentCodes":[],"perCustomerLimit":null,"globalQuantity":null,"pointsBudget":null},"restrictions":{"minimumSpendMinor":null,"productIds":[],"excludedProductIds":[],"categoryIds":[],"excludedCategoryIds":[],"excludeSaleItems":false,"stacking":"exclusive"}}'::jsonb
from loyalty.programme_versions where public_id = '7b000000-0000-4000-8000-000000000140';
insert into loyalty.programme_rewards (
  organization_id, programme_group_id, programme_version_id, code, name,
  reward_kind, cost_points, configuration
)
select organization_id, programme_group_id, id, 'duplicate-tiers', 'Duplicate tier condition',
  'free_shipping', 600,
  '{"version":"2","fulfilmentMode":"woocommerce_coupon","validityDays":30,"availability":{"startsAt":null,"endsAt":null,"tierCodes":["bloom","bloom"],"segmentCodes":[],"perCustomerLimit":null,"globalQuantity":null,"pointsBudget":null},"restrictions":{"minimumSpendMinor":null,"productIds":[],"excludedProductIds":[],"categoryIds":[],"excludedCategoryIds":[],"excludeSaleItems":false,"stacking":"exclusive"}}'::jsonb
from loyalty.programme_versions where public_id = '7b000000-0000-4000-8000-000000000140';
insert into loyalty.programme_rewards (
  organization_id, programme_group_id, programme_version_id, code, name,
  reward_kind, cost_points, configuration
)
select organization_id, programme_group_id, id, 'missing-cap-evidence', 'Missing maximum evidence',
  'percentage_discount', 800,
  '{"version":"2","fulfilmentMode":"woocommerce_coupon","validityDays":30,"percentageBasisPoints":1000,"currencyMinorUnitDigits":2,"availability":{"startsAt":null,"endsAt":null,"tierCodes":[],"segmentCodes":[],"perCustomerLimit":null,"globalQuantity":null,"pointsBudget":null},"restrictions":{"minimumSpendMinor":null,"productIds":[],"excludedProductIds":[],"categoryIds":[],"excludedCategoryIds":[],"excludeSaleItems":false,"stacking":"exclusive"}}'::jsonb
from loyalty.programme_versions where public_id = '7b000000-0000-4000-8000-000000000140';
set local role anon;

select results_eq(
  $$ select
       reward_catalogue ->> 'version',
       pg_catalog.jsonb_array_length(reward_catalogue -> 'offers'),
       reward_catalogue #>> '{offers,0,code}',
       reward_catalogue #>> '{offers,0,name}',
       reward_catalogue #>> '{offers,0,costPoints}',
       reward_catalogue #>> '{offers,0,benefit,kind}',
       reward_catalogue #>> '{offers,1,name}',
       reward_catalogue #>> '{offers,2,name}'
     from loyalty.get_public_loyalty_experience_v5(
       '7b000000-0000-4000-8000-000000000110',
       '7b000000-0000-4000-8000-000000000130') $$,
  $$ values (
    '1'::text, 3, 'reward-1'::text, '€5 discount'::text, '500'::text,
    'fixed_discount'::text, 'Summer 15% off'::text, 'Studio preview'::text
  ) $$,
  'V5 returns the safe published reward catalogue in stable order'
);
select results_eq(
  $$ select
       reward_catalogue #>> '{offers,0,benefit,amountMinor}',
       reward_catalogue #>> '{offers,0,currency,code}',
       (reward_catalogue #>> '{offers,0,currency,minorUnitDigits}')::integer,
       (reward_catalogue #>> '{offers,0,validityDays}')::integer,
       reward_catalogue #>> '{offers,0,conditions,minimumSpendMinor}',
       reward_catalogue #> '{offers,0,conditions,requiredTierNames}',
       (reward_catalogue #>> '{offers,0,conditions,hasProductOrCategoryRestrictions}')::boolean,
       (reward_catalogue #>> '{offers,0,conditions,excludesSaleItems}')::boolean,
       (reward_catalogue #>> '{offers,0,conditions,hasMemberLimit}')::boolean,
       (reward_catalogue #>> '{offers,0,conditions,limitedAvailability}')::boolean,
       reward_catalogue #>> '{offers,0,conditions,stacking}'
     from loyalty.get_public_loyalty_experience_v5(
       '7b000000-0000-4000-8000-000000000110',
       '7b000000-0000-4000-8000-000000000130') $$,
  $$ values (
    '500'::text, 'EUR'::text, 2, 30, '2000'::text, '["Bloom"]'::jsonb,
    true, true, true, true, 'combinable'::text
  ) $$,
  'V5 exposes exact customer-relevant fixed benefit and summarized conditions'
);
select results_eq(
  $$ select
       reward_catalogue #>> '{offers,1,benefit,percentageBasisPoints}',
       reward_catalogue #>> '{offers,1,state}',
       reward_catalogue #>> '{offers,1,startsAt}',
       reward_catalogue #>> '{offers,1,endsAt}',
       reward_catalogue #>> '{offers,1,delivery}',
       reward_catalogue #>> '{offers,1,conditions,stacking}'
     from loyalty.get_public_loyalty_experience_v5(
       '7b000000-0000-4000-8000-000000000110',
       '7b000000-0000-4000-8000-000000000130') $$,
  $$ values (
    '1500'::text, 'scheduled'::text, '2099-06-01T00:00:00+00:00'::text,
    '2099-09-01T00:00:00+00:00'::text, 'woocommerce_coupon'::text,
    'exclusive'::text
  ) $$,
  'V5 distinguishes scheduled native rewards and exact checkout behavior'
);
select results_eq(
  $$ select
       reward_catalogue #>> '{offers,2,benefit,kind}',
       reward_catalogue #>> '{offers,2,delivery}',
       (reward_catalogue #>> '{offers,2,deliveryEstimateDays}')::integer,
       reward_catalogue #>> '{offers,2,conditions,stacking}',
       (reward_catalogue #>> '{offers,2,conditions,hasMemberLimit}')::boolean
     from loyalty.get_public_loyalty_experience_v5(
       '7b000000-0000-4000-8000-000000000110',
       '7b000000-0000-4000-8000-000000000130') $$,
  $$ values ('exclusive_access'::text, 'manual'::text, 5,
             'not_applicable'::text, true) $$,
  'V5 presents manual rewards without exposing fulfilment instructions'
);
select results_eq(
  $$ select
       reward_catalogue::text !~
         '(five-off|summer-percent|private-preview|fulfilmentInstructions|Internal delivery|productIds|categoryIds|perCustomerLimit|globalQuantity|pointsBudget|programmeVersion|organization)',
       not (reward_catalogue -> 'offers' -> 0 ? 'configuration'),
       not (reward_catalogue -> 'offers' -> 0 ? 'publicId')
     from loyalty.get_public_loyalty_experience_v5(
       '7b000000-0000-4000-8000-000000000110',
       '7b000000-0000-4000-8000-000000000130') $$,
  $$ values (true, true, true) $$,
  'V5 omits internal codes, selectors, instructions, exact limits, budgets, and identifiers'
);
select results_eq(
  $$ select reward_catalogue::text !~
       '(Store balance|Expired shipping|Invalid product|Wrong currency scale|Duplicate tier condition|Missing maximum evidence|script|store_credit)'
     from loyalty.get_public_loyalty_experience_v5(
       '7b000000-0000-4000-8000-000000000110',
       '7b000000-0000-4000-8000-000000000130') $$,
  $$ values (true) $$,
  'V5 excludes unsupported stored value, ended, malformed, and unsafe rewards'
);
select results_eq(
  $$ select
       reward_catalogue #>> '{offers,0,code}',
       reward_catalogue #>> '{offers,0,name}',
       reward_catalogue #>> '{offers,0,benefit,kind}',
       reward_catalogue #>> '{offers,0,benefit,percentageBasisPoints}',
       reward_catalogue #>> '{offers,0,state}',
       reward_catalogue #>> '{offers,0,delivery}',
       reward_catalogue #> '{offers,0,currency}'
     from loyalty.get_public_loyalty_experience_v5(
       '7c000000-0000-4000-8000-000000000110',
       '7c000000-0000-4000-8000-000000000130') $$,
  $$ values (
    'reward-1'::text, 'Legacy 10% off'::text, 'percentage_discount'::text,
    '1000'::text, 'confirm_in_account'::text, 'woocommerce_coupon'::text,
    'null'::jsonb
  ) $$,
  'V5 retains a conservative no-schedule compatibility offer for valid legacy rewards'
);
select results_eq(
  $$ select
       programme_currency ->> 'code',
       (programme_currency ->> 'minorUnitDigits')::integer
     from loyalty.get_public_loyalty_experience_v6(
       '7b000000-0000-4000-8000-000000000110',
       '7b000000-0000-4000-8000-000000000130') $$,
  $$ values ('EUR'::text, 2) $$,
  'V6 derives exact display currency only from the selected immutable published programme'
);
select results_eq(
  $$ select
       referral_catalogue ->> 'version',
       referral_catalogue ->> 'state',
       referral_catalogue ->> 'advocateRewardPoints',
       referral_catalogue ->> 'friendRewardPoints',
       referral_catalogue ->> 'minimumEligibleSpendMinor',
       referral_catalogue #>> '{currency,code}',
       (referral_catalogue #>> '{currency,minorUnitDigits}')::integer,
       (referral_catalogue ->> 'attributionWindowDays')::integer,
       (referral_catalogue ->> 'coolingDays')::integer,
       referral_catalogue ->> 'qualification',
       (referral_catalogue ->> 'newCustomersOnly')::boolean,
       (referral_catalogue ->> 'monthlyLimitApplies')::boolean
     from loyalty.get_public_loyalty_experience_v6(
       '7b000000-0000-4000-8000-000000000110',
       '7b000000-0000-4000-8000-000000000130') $$,
  $$ values (
    '1'::text, 'available'::text, '500'::text, '250'::text, '3000'::text,
    'EUR'::text, 2, 30, 14, 'first_eligible_purchase'::text, true, true
  ) $$,
  'V6 returns exact published give-and-get terms and first-order conditions'
);
select results_eq(
  $$ select
       referral_catalogue::text !~
         '(customer|advocateCode|friendId|order|shareUrl|fingerprint|risk|manualReview|sourceNetwork|deviceReferral|monthlyAdvocateReferralLimit|qualificationStatus|programmeVersion|organization|ledger)',
       not (referral_catalogue ? 'configuration'),
       not (referral_catalogue ? 'publicId')
     from loyalty.get_public_loyalty_experience_v6(
       '7b000000-0000-4000-8000-000000000110',
       '7b000000-0000-4000-8000-000000000130') $$,
  $$ values (true, true, true) $$,
  'V6 omits customer links, identities, orders, risk evidence, raw policy, internal IDs, and value authority'
);
select results_eq(
  $$ select referral_catalogue
     from loyalty.get_public_loyalty_experience_v6(
       '7c000000-0000-4000-8000-000000000110',
       '7c000000-0000-4000-8000-000000000130') $$,
  $$ values ('{"version":"1","state":"unavailable"}'::jsonb) $$,
  'V6 reports no referral offer when the immutable published version has no policy'
);

reset role;
insert into loyalty.organization_entitlements (
  organization_id, catalogue_version, capability_key, state, source,
  actor_reference, reason, effective_from
)
select id, 1, 'referrals', 'disabled', 'local_control',
  'test:public-referrals',
  'Verify that the public catalogue reports a server-side rollout pause',
  pg_catalog.transaction_timestamp() - interval '2 seconds'
from loyalty.organizations where slug = 'public-one';
set local role anon;
select results_eq(
  $$ select referral_catalogue,
       (select count(*)::integer
        from pg_catalog.jsonb_object_keys(referral_catalogue))
     from loyalty.get_public_loyalty_experience_v6(
       '7b000000-0000-4000-8000-000000000110',
       '7b000000-0000-4000-8000-000000000130') $$,
  $$ values ('{"version":"1","state":"paused"}'::jsonb, 2) $$,
  'V6 exposes only an honest paused state when PostgreSQL disables referral entry'
);
reset role;
insert into loyalty.organization_entitlements (
  organization_id, catalogue_version, capability_key, state, source,
  actor_reference, reason, effective_from
)
select id, 1, 'referrals', 'enabled', 'local_control',
  'test:public-referrals',
  'Restore the public referral fixture after the append-only pause assertion',
  pg_catalog.transaction_timestamp() - interval '1 second'
from loyalty.organizations where slug = 'public-one';
set local role anon;
select results_eq(
  $$ select tiers from loyalty.get_public_loyalty_experience(
       '7b000000-0000-4000-8000-000000000110',
       '7b000000-0000-4000-8000-000000000130', 'en') $$,
  $$ values ('[{"code":"rose","name":"Rose","minimumEligibleSpendMinor":"0","pointsPerMajorUnit":"5"},{"code":"bloom","name":"Bloom","minimumEligibleSpendMinor":"15000","pointsPerMajorUnit":"6"}]'::jsonb) $$,
  'tier projection contains safe names rates and exact text-form thresholds only'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.get_public_loyalty_experience(
       '7b000000-0000-4000-8000-000000000110',
       '7b000000-0000-4000-8000-000000000130', 'fr') $$,
  array[0::bigint],
  'unsupported locale returns no document'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.get_public_loyalty_experience(
       '7c000000-0000-4000-8000-000000000110',
       '7b000000-0000-4000-8000-000000000130', 'en') $$,
  array[0::bigint],
  'mixed-tenant workspace and programme IDs return no document'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.get_public_loyalty_experience(
       '7b000000-0000-4000-8000-000000000110',
       '7c000000-0000-4000-8000-000000000130', 'en') $$,
  array[0::bigint],
  'other-tenant programme does not cross the linked workspace boundary'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.get_public_loyalty_experience_v2(
       '7c000000-0000-4000-8000-000000000110',
       '7b000000-0000-4000-8000-000000000130') $$,
  array[0::bigint],
  'V2 mixed-tenant selectors fail closed'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.get_public_loyalty_experience_v3(
       '7c000000-0000-4000-8000-000000000110',
       '7b000000-0000-4000-8000-000000000130') $$,
  array[0::bigint],
  'V3 mixed-tenant selectors fail closed'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.get_public_loyalty_experience_v4(
       '7c000000-0000-4000-8000-000000000110',
       '7b000000-0000-4000-8000-000000000130') $$,
  array[0::bigint],
  'V4 mixed-tenant selectors fail closed'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.get_public_loyalty_experience_v5(
       '7c000000-0000-4000-8000-000000000110',
       '7b000000-0000-4000-8000-000000000130') $$,
  array[0::bigint],
  'V5 mixed-tenant selectors fail closed'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.get_public_loyalty_experience_v6(
       '7c000000-0000-4000-8000-000000000110',
       '7b000000-0000-4000-8000-000000000130') $$,
  array[0::bigint],
  'V6 mixed-tenant selectors fail closed'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.get_public_loyalty_experience(
       '00000000-0000-4000-8000-000000000000',
       '7b000000-0000-4000-8000-000000000130', 'en') $$,
  array[0::bigint],
  'unknown public workspace ID fails closed'
);

reset role;
update loyalty.workspaces set status = 'suspended'
where public_id = '7b000000-0000-4000-8000-000000000110';
set local role anon;
select results_eq(
  $$ select count(*)::bigint from loyalty.get_public_loyalty_experience(
       '7b000000-0000-4000-8000-000000000110',
       '7b000000-0000-4000-8000-000000000130', 'en') $$,
  array[0::bigint],
  'suspended workspace removes the public document'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.get_public_loyalty_experience_v2(
       '7b000000-0000-4000-8000-000000000110',
       '7b000000-0000-4000-8000-000000000130') $$,
  array[0::bigint],
  'suspended workspace removes the V2 public document'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.get_public_loyalty_experience_v3(
       '7b000000-0000-4000-8000-000000000110',
       '7b000000-0000-4000-8000-000000000130') $$,
  array[0::bigint],
  'suspended workspace removes the V3 public document'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.get_public_loyalty_experience_v4(
       '7b000000-0000-4000-8000-000000000110',
       '7b000000-0000-4000-8000-000000000130') $$,
  array[0::bigint],
  'suspended workspace removes the V4 public document'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.get_public_loyalty_experience_v5(
       '7b000000-0000-4000-8000-000000000110',
       '7b000000-0000-4000-8000-000000000130') $$,
  array[0::bigint],
  'suspended workspace removes the V5 public document'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.get_public_loyalty_experience_v6(
       '7b000000-0000-4000-8000-000000000110',
       '7b000000-0000-4000-8000-000000000130') $$,
  array[0::bigint],
  'suspended workspace removes the V6 public document'
);
reset role;
update loyalty.workspaces set status = 'active'
where public_id = '7b000000-0000-4000-8000-000000000110';
update loyalty.programmes set status = 'suspended'
where public_id = '7b000000-0000-4000-8000-000000000130';
set local role anon;
select results_eq(
  $$ select count(*)::bigint from loyalty.get_public_loyalty_experience(
       '7b000000-0000-4000-8000-000000000110',
       '7b000000-0000-4000-8000-000000000130', 'en') $$,
  array[0::bigint],
  'suspended programme removes the public document'
);
reset role;
update loyalty.programmes set status = 'active'
where public_id = '7b000000-0000-4000-8000-000000000130';
update loyalty.programme_versions set status = 'retired', retired_at = now()
where public_id = '7b000000-0000-4000-8000-000000000140';
set local role anon;
select results_eq(
  $$ select count(*)::bigint from loyalty.get_public_loyalty_experience(
       '7b000000-0000-4000-8000-000000000110',
       '7b000000-0000-4000-8000-000000000130', 'en') $$,
  array[0::bigint],
  'absence of a published version removes the public document'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.get_public_loyalty_experience_v3(
       '7b000000-0000-4000-8000-000000000110',
       '7b000000-0000-4000-8000-000000000130') $$,
  array[0::bigint],
  'absence of a published version removes the V3 public document'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.get_public_loyalty_experience_v4(
       '7b000000-0000-4000-8000-000000000110',
       '7b000000-0000-4000-8000-000000000130') $$,
  array[0::bigint],
  'absence of a published version removes the V4 public document'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.get_public_loyalty_experience_v5(
       '7b000000-0000-4000-8000-000000000110',
       '7b000000-0000-4000-8000-000000000130') $$,
  array[0::bigint],
  'absence of a published version removes the V5 public document'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.get_public_loyalty_experience_v6(
       '7b000000-0000-4000-8000-000000000110',
       '7b000000-0000-4000-8000-000000000130') $$,
  array[0::bigint],
  'absence of a published version removes the V6 public document'
);

reset role;
select results_eq(
  $$ select count(*)::bigint from loyalty.customers $$,
  array[0::bigint],
  'guest read model creates no customer or identity state'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.admin_audit_events $$,
  array[0::bigint],
  'guest reads create no administration audit or mutable state'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_transactions $$,
  array[0::bigint],
  'guest reads create no ledger effect'
);
select results_eq(
  $$ select count(*)::bigint from loyalty_private.canonical_commerce_events $$,
  array[0::bigint],
  'guest reads create no commerce event effect'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.experience_translations $$,
  array[1::bigint],
  'guest reads never mutate approved translation state'
);

select * from finish();
rollback;
