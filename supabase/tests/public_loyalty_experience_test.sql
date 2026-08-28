begin;

create extension if not exists pgtap with schema extensions;

select plan(47);

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
  '{"version":"1","tiers":[],"rewards":[]}'::jsonb,
  extensions.digest('public-fixture', 'sha256'),
  case when organization.slug = 'public-one' then '7b000000-0000-4000-8000-000000000001'::uuid else null end,
  now()
from loyalty.organizations as organization
join loyalty.programmes as programme on programme.organization_id = organization.id;
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
  reward_kind, cost_points
)
select organization_id, programme_group_id, id, 'five-off', '€5 discount',
  'fixed_discount', 500
from loyalty.programme_versions where public_id = '7b000000-0000-4000-8000-000000000140';
insert into loyalty.programme_rewards (
  organization_id, programme_group_id, programme_version_id, code, name,
  reward_kind, cost_points
)
select organization_id, programme_group_id, id, 'unsafe', '<script>reward</script>',
  'custom', 1
from loyalty.programme_versions where public_id = '7b000000-0000-4000-8000-000000000140';
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
  $$ select tiers from loyalty.get_public_loyalty_experience(
       '7b000000-0000-4000-8000-000000000110',
       '7b000000-0000-4000-8000-000000000130', 'en') $$,
  $$ values ('[{"code":"rose","name":"Rose","minimumEligibleSpendMinor":"0","pointsPerMajorUnit":"5"},{"code":"bloom","name":"Bloom","minimumEligibleSpendMinor":"15000","pointsPerMajorUnit":"6"}]'::jsonb) $$,
  'tier projection contains safe names rates and exact text-form thresholds only'
);
select results_eq(
  $$ select rewards from loyalty.get_public_loyalty_experience(
       '7b000000-0000-4000-8000-000000000110',
       '7b000000-0000-4000-8000-000000000130', 'en') $$,
  $$ values ('[{"code":"five-off","name":"€5 discount","kind":"fixed_discount","costPoints":"500"}]'::jsonb) $$,
  'reward projection omits markup-shaped names and private reward configuration'
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
