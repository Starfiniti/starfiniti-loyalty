begin;

create extension if not exists pgtap with schema extensions;

select plan(40);

select has_table('loyalty', 'programme_tier_policies', 'advanced tier policies exist');
select has_table('loyalty', 'programme_tier_policy_levels', 'advanced tier levels exist');
select has_table('loyalty', 'programme_tier_thresholds', 'advanced tier thresholds exist');
select ok(
  (select relrowsecurity from pg_class where oid = 'loyalty.programme_tier_policies'::regclass),
  'advanced tier policies have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'loyalty.programme_tier_policy_levels'::regclass),
  'advanced tier levels have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'loyalty.programme_tier_thresholds'::regclass),
  'advanced tier thresholds have RLS enabled'
);
select has_trigger(
  'loyalty', 'programme_versions', 'programme_versions_advanced_tier_contract',
  'advanced policy is guarded at the immutable version boundary'
);
select has_trigger(
  'loyalty', 'programme_versions', 'programme_versions_materialize_advanced_tier_policy',
  'approved advanced policy materializes from the version transition'
);
select has_trigger(
  'loyalty', 'programme_tier_policies', 'programme_tier_policies_immutable',
  'materialized advanced policy is immutable'
);
select has_trigger(
  'loyalty', 'programme_tier_policy_levels', 'programme_tier_policy_levels_immutable',
  'materialized advanced levels are immutable'
);
select has_trigger(
  'loyalty', 'programme_tier_thresholds', 'programme_tier_thresholds_immutable',
  'materialized advanced thresholds are immutable'
);
select ok(
  has_table_privilege('authenticated', 'loyalty.programme_tier_policies', 'SELECT'),
  'authenticated members can read tenant-filtered advanced policies'
);
select ok(
  not has_table_privilege('authenticated', 'loyalty.programme_tier_policies', 'INSERT'),
  'browser sessions cannot materialize advanced policies'
);
select ok(
  not has_function_privilege(
    'authenticated', 'loyalty_private.validate_tier_policy_v2(jsonb)', 'EXECUTE'
  ),
  'browser sessions cannot bypass commands through the advanced validator'
);

insert into auth.users (id, email)
values
  ('85000000-0000-4000-8000-000000000001', 'm05-owner-one@example.test'),
  ('86000000-0000-4000-8000-000000000001', 'm05-owner-two@example.test');

insert into loyalty.organizations (public_id, slug, name)
values
  ('85000000-0000-4000-8000-000000000100', 'm05-one', 'M05 One'),
  ('86000000-0000-4000-8000-000000000100', 'm05-two', 'M05 Two');

insert into loyalty.organization_memberships (organization_id, user_id, role)
values
  ((select id from loyalty.organizations where slug = 'm05-one'), '85000000-0000-4000-8000-000000000001', 'owner'),
  ((select id from loyalty.organizations where slug = 'm05-two'), '86000000-0000-4000-8000-000000000001', 'owner');

insert into loyalty.programme_groups (organization_id, slug, name)
select id, 'rewards', name || ' Rewards'
from loyalty.organizations where slug in ('m05-one', 'm05-two');

insert into loyalty.programmes (public_id, organization_id, programme_group_id, slug, name)
select
  case organization.slug
    when 'm05-one' then '85000000-0000-4000-8000-000000000101'::uuid
    else '86000000-0000-4000-8000-000000000101'::uuid
  end,
  organization.id, programme_group.id, 'rewards', organization.name || ' Rewards'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
where organization.slug in ('m05-one', 'm05-two');

insert into loyalty.programmes (public_id, organization_id, programme_group_id, slug, name)
select '85000000-0000-4000-8000-000000000102', organization.id,
  programme_group.id, 'compatible', 'Compatible V2'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
where organization.slug = 'm05-one';

create function pg_temp.valid_m05()
returns jsonb
language sql
immutable
as $$
  select '{
    "version":"2",
    "currencyCode":"EUR",
    "currencyMinorUnitDigits":2,
    "pendingDays":30,
    "pointsExpireAfterDays":365,
    "tiers":[
      {"code":"rose","name":"Rose","minimumEligibleSpendMinor":"0","pointsPerMajorUnit":"5"},
      {"code":"bloom","name":"Bloom","minimumEligibleSpendMinor":"15000","pointsPerMajorUnit":"6"},
      {"code":"icon","name":"Icon","minimumEligibleSpendMinor":"50000","pointsPerMajorUnit":"7"}
    ],
    "tierPolicy":{
      "version":"2",
      "qualificationPeriod":{"kind":"rolling_days","days":365},
      "downgradeGraceDays":30,
      "levels":[
        {"tierCode":"rose","entry":null,"retention":null,"reentry":null,"benefits":{"earningMultiplierBasisPoints":10000,"rewardCodes":[],"earlyAccess":false}},
        {"tierCode":"bloom","entry":{"operator":"all","thresholds":[{"metric":"eligible_spend","minimum":"15000","activityCodes":[]}]},"retention":{"operator":"any","thresholds":[{"metric":"eligible_spend","minimum":"12500","activityCodes":[]},{"metric":"order_count","minimum":"3","activityCodes":[]}]},"reentry":{"operator":"all","thresholds":[{"metric":"eligible_spend","minimum":"10000","activityCodes":[]}]},"benefits":{"earningMultiplierBasisPoints":12000,"rewardCodes":[],"earlyAccess":true}},
        {"tierCode":"icon","entry":{"operator":"all","thresholds":[{"metric":"verified_action_count","minimum":"3","activityCodes":["verified-review"]}]},"retention":{"operator":"all","thresholds":[{"metric":"eligible_spend","minimum":"45000","activityCodes":[]}]},"reentry":{"operator":"all","thresholds":[{"metric":"eligible_spend","minimum":"40000","activityCodes":[]}]},"benefits":{"earningMultiplierBasisPoints":14000,"rewardCodes":[],"earlyAccess":true}}
      ]
    },
    "rewards":[],
    "earningRules":[{
      "code":"purchase-base","name":"Base purchase points","source":"purchase",
      "enabled":true,"priority":0,"stackable":false,
      "effect":{"kind":"base_rate","pointsPerMajorUnit":"5"},
      "conditions":{"productIds":[],"categoryIds":[],"currencyCodes":[],"markets":[],"channels":[],"activityCodes":[],"segmentCodes":[],"tierCodes":[],"startsAt":null,"endsAt":null},
      "purchaseExclusions":{"productIds":[],"categoryIds":[],"shipping":true,"tax":true,"fees":true,"giftCardPayments":true,"storeCreditPayments":true,"discounts":true},
      "cap":{"perEventPoints":null,"perMemberPoints":null,"memberPeriod":null,"rollingDays":null}
    }]
  }'::jsonb;
$$;

select lives_ok(
  $$ select loyalty_private.set_deployment_mode(
    'managed', 1, 'test:m05', 'Exercise managed advanced VIP gating', now() - interval '1 minute'
  ) $$,
  'test changes deployment mode through the private append-only command'
);
select lives_ok(
  $$ select loyalty_private.set_organization_entitlement(
    '85000000-0000-4000-8000-000000000100', 'programme.v2', 'enabled', null,
    'canary', 'test:m05', 'Enable V2 for M05 canary', now() - interval '30 seconds', null
  ) $$,
  'test enables ProgrammeDefinitionV2 for the canary'
);
select lives_ok(
  $$ select loyalty_private.set_organization_entitlement(
    '85000000-0000-4000-8000-000000000100', 'vip.advanced', 'enabled', null,
    'canary', 'test:m05', 'Enable advanced VIP for M05 canary', now() - interval '30 seconds', null
  ) $$,
  'test enables advanced VIP for the canary'
);
select lives_ok(
  $$ select loyalty_private.set_organization_entitlement(
    '86000000-0000-4000-8000-000000000100', 'programme.v2', 'enabled', null,
    'canary', 'test:m05', 'Enable only V2 for control tenant', now() - interval '30 seconds', null
  ) $$,
  'test enables only V2 for the control tenant'
);

set local role authenticated;
set local request.jwt.claim.sub = '86000000-0000-4000-8000-000000000001';

select throws_ok(
  $$ select * from loyalty.create_programme_draft_command(
    '86000000-0000-4000-8000-000000000101', pg_temp.valid_m05(),
    'm05:disabled:draft', '86000000-0000-4000-8000-000000000201'
  ) $$,
  '42501', 'advanced VIP is not enabled for this organization',
  'a V2 entitlement cannot bypass the advanced VIP entitlement'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.programme_versions
     where organization_id = (select id from loyalty.organizations where slug = 'm05-two') $$,
  array[0::bigint],
  'disabled advanced VIP stores no version'
);

set local request.jwt.claim.sub = '85000000-0000-4000-8000-000000000001';

select results_eq(
  $$ select outcome from loyalty.create_programme_draft_command(
    '85000000-0000-4000-8000-000000000101', pg_temp.valid_m05(),
    'm05:valid:draft', '85000000-0000-4000-8000-000000000201'
  ) $$,
  array['created'::text],
  'entitled owner stores a strict advanced tier draft'
);
select throws_ok(
  $$ select * from loyalty.create_programme_draft_command(
    '85000000-0000-4000-8000-000000000101',
    jsonb_set(pg_temp.valid_m05(), '{tierPolicy,qualificationPeriod}',
      '{"kind":"calendar_year","timeZone":"Mars/Olympus"}'::jsonb),
    'm05:invalid:timezone', '85000000-0000-4000-8000-000000000202'
  ) $$,
  '22023', 'invalid calendar tier timezone',
  'unknown calendar timezone fails at the database command boundary'
);
select throws_ok(
  $$ select * from loyalty.create_programme_draft_command(
    '85000000-0000-4000-8000-000000000101',
    jsonb_set(pg_temp.valid_m05(), '{tierPolicy,levels}',
      (pg_temp.valid_m05() -> 'tierPolicy' -> 'levels') - 2),
    'm05:invalid:levels', '85000000-0000-4000-8000-000000000203'
  ) $$,
  '23514', 'TierPolicyV2 levels must match ordered programme tiers',
  'hidden or missing policy levels fail at the database command boundary'
);
select throws_ok(
  $$ select * from loyalty.create_programme_draft_command(
    '85000000-0000-4000-8000-000000000101',
    jsonb_set(pg_temp.valid_m05(),
      '{tierPolicy,levels,1,entry,thresholds,0,activityCodes}', '["review"]'::jsonb),
    'm05:invalid:selector', '85000000-0000-4000-8000-000000000204'
  ) $$,
  '22023', 'invalid tier qualification threshold',
  'non-action metrics cannot smuggle verified activity selectors'
);
select throws_ok(
  $$ select * from loyalty.create_programme_draft_command(
    '85000000-0000-4000-8000-000000000101',
    jsonb_set(pg_temp.valid_m05(), '{tierPolicy,levels,1,entry,thresholds}',
      (pg_temp.valid_m05() -> 'tierPolicy' -> 'levels' -> 1 -> 'entry' -> 'thresholds') ||
      (pg_temp.valid_m05() -> 'tierPolicy' -> 'levels' -> 1 -> 'entry' -> 'thresholds' -> 0)),
    'm05:invalid:duplicate', '85000000-0000-4000-8000-000000000205'
  ) $$,
  '23514', 'duplicate tier qualification threshold',
  'duplicate threshold identity fails closed'
);
select throws_ok(
  $$ select * from loyalty.create_programme_draft_command(
    '85000000-0000-4000-8000-000000000101',
    jsonb_set(pg_temp.valid_m05(),
      '{tierPolicy,levels,1,benefits,rewardCodes}', '["missing-reward"]'::jsonb),
    'm05:invalid:benefit', '85000000-0000-4000-8000-000000000206'
  ) $$,
  '22023', 'invalid TierPolicyV2 benefits',
  'tier benefit cannot reference an unfulfillable reward'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.programme_versions
     where programme_id = (select id from loyalty.programmes where public_id =
       '85000000-0000-4000-8000-000000000101') $$,
  array[1::bigint],
  'rejected definitions leave only the valid draft'
);

select results_eq(
  $$ select outcome from loyalty.publish_programme_version_command(
    (select public_id from loyalty.programme_versions where programme_id =
      (select id from loyalty.programmes where public_id = '85000000-0000-4000-8000-000000000101')),
    (select encode(configuration_sha256, 'hex') from loyalty.programme_versions where programme_id =
      (select id from loyalty.programmes where public_id = '85000000-0000-4000-8000-000000000101')),
    'm05:valid:publish', '85000000-0000-4000-8000-000000000207'
  ) $$,
  array['created'::text],
  'reviewed advanced policy publishes through the authenticated command'
);
select results_eq(
  $$ select qualification_period_kind, rolling_days, downgrade_grace_days
     from loyalty.programme_tier_policies $$,
  $$ values ('rolling_days'::text, 365, 30) $$,
  'publication materializes the exact qualification window and grace'
);
select results_eq(
  $$ select tier_code from loyalty.programme_tier_policy_levels order by ordinal $$,
  $$ values ('rose'::text), ('bloom'::text), ('icon'::text) $$,
  'materialization preserves exact tier order'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.programme_tier_thresholds $$,
  array[7::bigint],
  'materialization retains every entry retention and re-entry threshold'
);
select results_eq(
  $$ select metric, minimum_value from loyalty.programme_tier_thresholds
     where tier_code = 'bloom' and threshold_kind = 'retention' order by ordinal $$,
  $$ values ('eligible_spend'::text, 12500::bigint), ('order_count'::text, 3::bigint) $$,
  'materialization preserves independent OR retention values'
);
select results_eq(
  $$ select earning_multiplier_basis_points, early_access
     from loyalty.programme_tier_policy_levels where tier_code = 'icon' $$,
  $$ values (14000, true) $$,
  'materialization preserves value-neutral tier benefit configuration'
);

set local role anon;
select throws_ok(
  $$ select count(*) from loyalty.programme_tier_policies $$,
  '42501', null,
  'anonymous clients cannot read advanced tier policy tables'
);
reset role;

select throws_ok(
  $$ update loyalty.programme_tier_policies set downgrade_grace_days = 1 $$,
  '55000', 'immutable loyalty history cannot be changed',
  'materialized advanced policy cannot be rewritten'
);
select throws_ok(
  $$ delete from loyalty.programme_tier_thresholds where tier_code = 'bloom' $$,
  '55000', 'immutable loyalty history cannot be changed',
  'materialized advanced thresholds cannot be deleted'
);

grant loyalty_worker to current_user;
grant usage on schema extensions to loyalty_worker;
grant execute on all functions in schema extensions to loyalty_worker;
set local role loyalty_worker;
select results_eq(
  $$ select count(*)::bigint from loyalty.programme_tier_policy_levels $$,
  array[3::bigint],
  'worker can read materialized advanced policy for live evaluation'
);
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '85000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select outcome from loyalty.create_programme_draft_command(
    '85000000-0000-4000-8000-000000000102', pg_temp.valid_m05() - 'tierPolicy',
    'm05:compatible:draft', '85000000-0000-4000-8000-000000000208'
  ) $$,
  array['created'::text],
  'existing ProgrammeDefinitionV2 remains valid without advanced policy'
);
select results_eq(
  $$ select outcome from loyalty.publish_programme_version_command(
    (select public_id from loyalty.programme_versions where programme_id =
      (select id from loyalty.programmes where public_id = '85000000-0000-4000-8000-000000000102')),
    (select encode(configuration_sha256, 'hex') from loyalty.programme_versions where programme_id =
      (select id from loyalty.programmes where public_id = '85000000-0000-4000-8000-000000000102')),
    'm05:compatible:publish', '85000000-0000-4000-8000-000000000209'
  ) $$,
  array['created'::text],
  'existing V2 publication remains compatible without advanced policy'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.programme_tier_policies $$,
  array[1::bigint],
  'compatible V2 publication is not retroactively reinterpreted as advanced VIP'
);
reset role;

select * from finish();
rollback;
