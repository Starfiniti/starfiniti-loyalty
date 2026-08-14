begin;

create extension if not exists pgtap with schema extensions;

select plan(141);

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
  ('85000000-0000-4000-8000-000000000002', 'm05-admin-one@example.test'),
  ('85000000-0000-4000-8000-000000000003', 'm05-analyst-one@example.test'),
  ('86000000-0000-4000-8000-000000000001', 'm05-owner-two@example.test');

insert into loyalty.organizations (public_id, slug, name)
values
  ('85000000-0000-4000-8000-000000000100', 'm05-one', 'M05 One'),
  ('86000000-0000-4000-8000-000000000100', 'm05-two', 'M05 Two');

insert into loyalty.organization_memberships (organization_id, user_id, role)
values
  ((select id from loyalty.organizations where slug = 'm05-one'), '85000000-0000-4000-8000-000000000001', 'owner'),
  ((select id from loyalty.organizations where slug = 'm05-one'), '85000000-0000-4000-8000-000000000002', 'admin'),
  ((select id from loyalty.organizations where slug = 'm05-one'), '85000000-0000-4000-8000-000000000003', 'analyst'),
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
        {"tierCode":"bloom","entry":{"operator":"all","thresholds":[{"metric":"eligible_spend","minimum":"15000","activityCodes":[]}]},"retention":{"operator":"any","thresholds":[{"metric":"eligible_spend","minimum":"12500","activityCodes":[]},{"metric":"order_count","minimum":"3","activityCodes":[]}]},"reentry":{"operator":"all","thresholds":[{"metric":"eligible_spend","minimum":"10000","activityCodes":[]}]},"benefits":{"earningMultiplierBasisPoints":12000,"rewardCodes":["bloom-shipping"],"earlyAccess":true}},
        {"tierCode":"icon","entry":{"operator":"all","thresholds":[{"metric":"verified_action_count","minimum":"3","activityCodes":["verified-review"]}]},"retention":{"operator":"all","thresholds":[{"metric":"eligible_spend","minimum":"45000","activityCodes":[]}]},"reentry":{"operator":"all","thresholds":[{"metric":"eligible_spend","minimum":"40000","activityCodes":[]}]},"benefits":{"earningMultiplierBasisPoints":14000,"rewardCodes":[],"earlyAccess":true}}
      ]
    },
    "rewards":[{
      "code":"bloom-shipping","name":"Bloom free shipping",
      "kind":"free_shipping","costPoints":"500",
      "configuration":{
        "version":"2","fulfilmentMode":"woocommerce_coupon","validityDays":30,
        "availability":{"startsAt":null,"endsAt":null,"tierCodes":["bloom"],"segmentCodes":[],"perCustomerLimit":1,"globalQuantity":null,"pointsBudget":null},
        "restrictions":{"minimumSpendMinor":null,"productIds":[],"excludedProductIds":[],"categoryIds":[],"excludedCategoryIds":[],"excludeSaleItems":false,"stacking":"exclusive"}
      }
    }],
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
    '85000000-0000-4000-8000-000000000100', 'rewards.expanded', 'enabled', null,
    'canary', 'test:m05', 'Enable fulfilable tier reward benefits',
    now() - interval '30 seconds', null
  ) $$,
  'test enables expanded fulfilment for linked tier rewards'
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
select throws_ok(
  $$ select * from loyalty.create_programme_draft_command(
    '85000000-0000-4000-8000-000000000101',
    jsonb_set(pg_temp.valid_m05(),
      '{rewards,0,configuration,availability,tierCodes}', '["rose"]'::jsonb),
    'm05:invalid:benefit-availability',
    '85000000-0000-4000-8000-000000000210'
  ) $$,
  '23514', 'tier benefit reward must be V2 and available to its tier',
  'linked tier rewards must independently allow the benefiting tier'
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
select results_eq(
  $$ select level.tier_code, level.reward_codes,
       reward.configuration -> 'availability' -> 'tierCodes'
     from loyalty.programme_tier_policy_levels as level
     join loyalty.programme_rewards as reward
       on reward.organization_id = level.organization_id
      and reward.programme_version_id = level.programme_version_id
      and reward.code = any(level.reward_codes)
     where level.tier_code = 'bloom' $$,
  $$ values ('bloom'::text, array['bloom-shipping']::text[], '["bloom"]'::jsonb) $$,
  'materialized tier reward access resolves to its executable availability boundary'
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

select has_table(
  'loyalty_private', 'tier_qualification_facts',
  'live qualification uses immutable private event-time facts'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'loyalty_private.tier_qualification_facts'::regclass),
  'live qualification facts have RLS enabled'
);
select has_trigger(
  'loyalty_private', 'tier_qualification_facts',
  'tier_qualification_facts_immutable',
  'live qualification facts cannot be rewritten'
);
select ok(
  not has_table_privilege(
    'authenticated', 'loyalty_private.tier_qualification_facts', 'SELECT'
  ),
  'browser sessions cannot read private qualification facts'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'loyalty_private.get_tier_qualification_context_v2(bigint,bigint,bigint,bigint,timestamp with time zone)',
    'EXECUTE'
  ),
  'browser sessions cannot request authoritative qualification context'
);
select ok(
  has_function_privilege(
    'loyalty_worker',
    'loyalty_private.commit_programme_v2_award(bigint,bigint,bigint,bigint,bigint,text,text,text,bytea,bytea,jsonb,jsonb,timestamp with time zone,timestamp with time zone)',
    'EXECUTE'
  ),
  'worker enters the fact-producing V2 award boundary'
);
select ok(
  has_function_privilege(
    'loyalty_worker',
    'loyalty_private.record_tier_refund_fact_v2(bigint,uuid,uuid)',
    'EXECUTE'
  ),
  'worker can append refund compensation facts'
);
select ok(
  has_function_privilege(
    'loyalty_worker',
    'loyalty_private.get_tier_qualification_context_v2(bigint,bigint,bigint,bigint,timestamp with time zone)',
    'EXECUTE'
  ),
  'worker can read one serialized authoritative snapshot'
);
select ok(
  has_function_privilege(
    'loyalty_worker',
    'loyalty_private.record_tier_qualification_decision_v2(bigint,bigint,bigint,bigint,bigint,timestamp with time zone,jsonb)',
    'EXECUTE'
  ),
  'worker can submit a pure evaluation for independent verification'
);
select ok(
  not has_function_privilege(
    'loyalty_worker',
    'loyalty_private.commit_programme_v2_award_core(bigint,bigint,bigint,bigint,bigint,text,text,text,bytea,bytea,jsonb,jsonb,timestamp with time zone,timestamp with time zone)',
    'EXECUTE'
  ),
  'worker cannot bypass immutable qualification fact creation'
);
select ok(
  not has_table_privilege(
    'loyalty_worker', 'loyalty_private.tier_qualification_facts', 'SELECT'
  ),
  'worker cannot enumerate private facts outside narrow functions'
);

insert into loyalty.workspaces (public_id, organization_id, slug, name)
select '85000000-0000-4000-8000-000000000110', id, 'm05-store', 'M05 Store'
from loyalty.organizations where slug = 'm05-one';

insert into loyalty.commerce_connections (
  public_id, organization_id, workspace_id, platform, external_store_id,
  display_name, current_key_version, signing_material_ref, programme_id
)
select '85000000-0000-4000-8000-000000000111', organization.id, workspace.id,
  'woocommerce', 'm05-store', 'M05 Store', 'v1', 'test://m05', programme.id
from loyalty.organizations as organization
join loyalty.workspaces as workspace on workspace.organization_id = organization.id
join loyalty.programmes as programme on programme.organization_id = organization.id
  and programme.public_id = '85000000-0000-4000-8000-000000000101'
where organization.slug = 'm05-one';

insert into loyalty.customers (public_id, organization_id, display_reference)
select customer.public_id, organization.id, customer.display_reference
from loyalty.organizations as organization
cross join (values
  ('85000000-0000-4000-8000-000000000112'::uuid, 'm05-member'),
  ('85000000-0000-4000-8000-000000000113'::uuid, 'm05-override-owner'),
  ('85000000-0000-4000-8000-000000000114'::uuid, 'm05-override-admin')
) as customer(public_id, display_reference)
where organization.slug = 'm05-one';

create temporary table m05_live_refs (name text primary key, value bigint not null);
insert into m05_live_refs
select 'organization', organization.id
from loyalty.organizations as organization where organization.slug = 'm05-one'
union all
select 'organization-two', organization.id
from loyalty.organizations as organization where organization.slug = 'm05-two'
union all
select 'group', programme.programme_group_id
from loyalty.programmes as programme
where programme.public_id = '85000000-0000-4000-8000-000000000101'
union all
select 'programme', programme.id
from loyalty.programmes as programme
where programme.public_id = '85000000-0000-4000-8000-000000000101'
union all
select 'version', version.id
from loyalty.programme_versions as version
join loyalty.programmes as programme on programme.id = version.programme_id
where programme.public_id = '85000000-0000-4000-8000-000000000101'
  and version.status = 'published'
union all
select 'customer', customer.id
from loyalty.customers as customer
where customer.public_id = '85000000-0000-4000-8000-000000000112';

create function pg_temp.m05_live_ref(target_name text)
returns bigint
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select value from pg_temp.m05_live_refs where name = target_name;
$$;
revoke all on function pg_temp.m05_live_ref(text) from public;
grant execute on function pg_temp.m05_live_ref(text) to loyalty_worker;

create function pg_temp.m05_evaluation_ref(target_idempotency_key text)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select evaluation.public_id
  from loyalty_private.programme_evaluations as evaluation
  where evaluation.idempotency_key = target_idempotency_key;
$$;
revoke all on function pg_temp.m05_evaluation_ref(text) from public;
grant execute on function pg_temp.m05_evaluation_ref(text) to loyalty_worker;

create temporary view m05_live_facts as
select * from loyalty_private.tier_qualification_facts;
grant select on pg_temp.m05_live_facts to loyalty_worker;

create function pg_temp.add_m05_live_event(
  target_number integer,
  target_event_type text,
  target_occurred_at timestamptz
)
returns bigint
language plpgsql
as $$
declare
  created_inbox_id bigint;
  created_event_id bigint;
begin
  insert into loyalty_private.commerce_delivery_inbox (
    organization_id, connection_id, source_delivery_id, envelope_version,
    source_event_id, event_type, source_object_id, occurred_at, delivered_at,
    key_version, nonce, body_sha256, raw_body, state, processed_at
  )
  select organization.id, connection.id, 'm05-delivery-' || target_number,
    '1', 'm05-event-' || target_number, target_event_type, 'order-m05-1',
    target_occurred_at, target_occurred_at, 'v1',
    'm05-nonce-' || target_number,
    repeat(substr(md5(target_number::text), 1, 1), 64),
    '{}'::jsonb, 'applied', target_occurred_at
  from loyalty.organizations as organization
  join loyalty.commerce_connections as connection
    on connection.organization_id = organization.id
  where organization.slug = 'm05-one'
  returning id into created_inbox_id;

  insert into loyalty_private.canonical_commerce_events (
    organization_id, connection_id, delivery_inbox_id, source_event_id,
    normalization_version, event_type, source_object_id, occurred_at, payload
  )
  select organization.id, connection.id, created_inbox_id,
    'm05-event-' || target_number, 'v1', target_event_type,
    'order-m05-1', target_occurred_at, '{}'::jsonb
  from loyalty.organizations as organization
  join loyalty.commerce_connections as connection
    on connection.organization_id = organization.id
  where organization.slug = 'm05-one'
  returning id into created_event_id;
  return created_event_id;
end;
$$;

insert into m05_live_refs values
  ('event-award', pg_temp.add_m05_live_event(
    1, 'commerce.order.status_changed', '2026-08-14T10:00:00Z'
  )),
  ('event-refund-partial', pg_temp.add_m05_live_event(
    2, 'commerce.order.refunded', '2026-08-20T10:00:00Z'
  )),
  ('event-refund-full', pg_temp.add_m05_live_event(
    3, 'commerce.order.refunded', '2026-09-21T10:00:00Z'
  )),
  ('event-refund-invalid', pg_temp.add_m05_live_event(
    4, 'commerce.order.refunded', '2026-09-22T10:00:00Z'
  ));

create function pg_temp.m05_entry_result()
returns jsonb
language sql
immutable
as $$
  select '{
    "version":"2","evaluatedAt":"2026-08-14T10:00:01.000Z",
    "window":{"kind":"rolling_days","startsAt":"2025-08-14T10:00:01.000Z","endsAt":"2026-08-14T10:00:01.000Z"},
    "metrics":{"eligibleSpendMinor":"16000","earnedPoints":"800","orderCount":"1","referralCount":"0","verifiedActionCount":"0","verifiedActionCounts":{}},
    "currentTierCode":null,"qualifiedTierCode":"bloom","effectiveTierCode":"bloom","transition":"entry","belowThresholdSince":null,"graceUntil":null,
    "levels":[
      {"tierCode":"rose","thresholdKind":"base","operator":null,"matched":true,"thresholds":[]},
      {"tierCode":"bloom","thresholdKind":"entry","operator":"all","matched":true,"thresholds":[{"metric":"eligible_spend","activityCodes":[],"actual":"16000","minimum":"15000","remaining":"0","matched":true}]},
      {"tierCode":"icon","thresholdKind":"entry","operator":"all","matched":false,"thresholds":[{"metric":"verified_action_count","activityCodes":["verified-review"],"actual":"0","minimum":"3","remaining":"3","matched":false}]}
    ],
    "nextMilestone":{"tierCode":"icon","thresholdKind":"entry","operator":"all","matched":false,"thresholds":[{"metric":"verified_action_count","activityCodes":["verified-review"],"actual":"0","minimum":"3","remaining":"3","matched":false}]}
  }'::jsonb;
$$;

create function pg_temp.m05_grace_result()
returns jsonb
language sql
immutable
as $$
  select '{
    "version":"2","evaluatedAt":"2026-08-20T10:00:01.000Z",
    "window":{"kind":"rolling_days","startsAt":"2025-08-20T10:00:01.000Z","endsAt":"2026-08-20T10:00:01.000Z"},
    "metrics":{"eligibleSpendMinor":"11000","earnedPoints":"550","orderCount":"1","referralCount":"0","verifiedActionCount":"0","verifiedActionCounts":{}},
    "currentTierCode":"bloom","qualifiedTierCode":"rose","effectiveTierCode":"bloom","transition":"grace","belowThresholdSince":"2026-08-20T10:00:01.000Z","graceUntil":"2026-09-19T10:00:01.000Z",
    "levels":[
      {"tierCode":"rose","thresholdKind":"base","operator":null,"matched":true,"thresholds":[]},
      {"tierCode":"bloom","thresholdKind":"retention","operator":"any","matched":false,"thresholds":[{"metric":"eligible_spend","activityCodes":[],"actual":"11000","minimum":"12500","remaining":"1500","matched":false},{"metric":"order_count","activityCodes":[],"actual":"1","minimum":"3","remaining":"2","matched":false}]},
      {"tierCode":"icon","thresholdKind":"entry","operator":"all","matched":false,"thresholds":[{"metric":"verified_action_count","activityCodes":["verified-review"],"actual":"0","minimum":"3","remaining":"3","matched":false}]}
    ],
    "nextMilestone":{"tierCode":"icon","thresholdKind":"entry","operator":"all","matched":false,"thresholds":[{"metric":"verified_action_count","activityCodes":["verified-review"],"actual":"0","minimum":"3","remaining":"3","matched":false}]}
  }'::jsonb;
$$;

create function pg_temp.m05_downgrade_result()
returns jsonb
language sql
immutable
as $$
  select '{
    "version":"2","evaluatedAt":"2026-09-21T10:00:01.000Z",
    "window":{"kind":"rolling_days","startsAt":"2025-09-21T10:00:01.000Z","endsAt":"2026-09-21T10:00:01.000Z"},
    "metrics":{"eligibleSpendMinor":"0","earnedPoints":"0","orderCount":"0","referralCount":"0","verifiedActionCount":"0","verifiedActionCounts":{}},
    "currentTierCode":"bloom","qualifiedTierCode":"rose","effectiveTierCode":"rose","transition":"downgrade","belowThresholdSince":"2026-08-20T10:00:01.000Z","graceUntil":"2026-09-19T10:00:01.000Z",
    "levels":[
      {"tierCode":"rose","thresholdKind":"base","operator":null,"matched":true,"thresholds":[]},
      {"tierCode":"bloom","thresholdKind":"retention","operator":"any","matched":false,"thresholds":[{"metric":"eligible_spend","activityCodes":[],"actual":"0","minimum":"12500","remaining":"12500","matched":false},{"metric":"order_count","activityCodes":[],"actual":"0","minimum":"3","remaining":"3","matched":false}]},
      {"tierCode":"icon","thresholdKind":"entry","operator":"all","matched":false,"thresholds":[{"metric":"verified_action_count","activityCodes":["verified-review"],"actual":"0","minimum":"3","remaining":"3","matched":false}]}
    ],
    "nextMilestone":{"tierCode":"bloom","thresholdKind":"retention","operator":"any","matched":false,"thresholds":[{"metric":"eligible_spend","activityCodes":[],"actual":"0","minimum":"12500","remaining":"12500","matched":false},{"metric":"order_count","activityCodes":[],"actual":"0","minimum":"3","remaining":"3","matched":false}]}
  }'::jsonb;
$$;

grant execute on function pg_temp.m05_entry_result(),
  pg_temp.m05_grace_result(), pg_temp.m05_downgrade_result()
  to loyalty_worker;

set local role loyalty_worker;

select throws_ok(
  $$ select * from loyalty_private.commit_programme_v2_award(
    pg_temp.m05_live_ref('organization'), pg_temp.m05_live_ref('group'),
    pg_temp.m05_live_ref('version'), pg_temp.m05_live_ref('event-award'),
    pg_temp.m05_live_ref('customer'), 'woocommerce:order:m05-forged-tier',
    'm05:forged:tier-multiplier:evaluation',
    'm05:forged:tier-multiplier:ledger',
    decode(repeat('a',64),'hex'), decode(repeat('b',64),'hex'),
    '{"version":"2","eventId":"woo:event:m05:forged-tier","source":"purchase","eligibleSpendMinor":"16000","awardedPoints":"960","tierCodeSnapshot":"rose","pendingAt":"2026-08-14T10:00:00Z","availableAt":"2026-09-13T10:00:00Z","expiresAt":"2027-09-13T10:00:00Z","selectedMultiplierRuleCode":null,"contributions":[{"ruleCode":"purchase-base","effectKind":"base_rate","uncappedPoints":"960","awardedPoints":"960","uncappedNumerator":"960","awardedNumerator":"960","denominator":"1","capApplied":"none"}],"lines":[]}'::jsonb,
    '{"tierMultiplierBasisPoints":12000}'::jsonb,
    '2026-08-14T10:00:00Z', '2026-08-14T10:00:01Z'
  ) $$,
  '23514', 'tier earning multiplier does not match published benefit',
  'worker cannot forge a tier earning multiplier at the atomic award boundary'
);
select results_eq(
  $$ select pg_temp.m05_evaluation_ref(
       'm05:forged:tier-multiplier:evaluation'
     ) is null $$,
  array[true],
  'rejected multiplier evidence creates no evaluation or value effect'
);

select results_eq(
  $$ select outcome from loyalty_private.commit_programme_v2_award(
    pg_temp.m05_live_ref('organization'), pg_temp.m05_live_ref('group'),
    pg_temp.m05_live_ref('version'), pg_temp.m05_live_ref('event-award'),
    pg_temp.m05_live_ref('customer'), 'woocommerce:order:m05-1',
    'm05:live:award:evaluation', 'm05:live:award:ledger',
    decode(repeat('1',64),'hex'), decode(repeat('2',64),'hex'),
    '{"version":"2","eventId":"woo:event:m05:1","source":"purchase","eligibleSpendMinor":"16000","awardedPoints":"800","tierCodeSnapshot":"rose","pendingAt":"2026-08-14T10:00:00Z","availableAt":"2026-09-13T10:00:00Z","expiresAt":"2027-09-13T10:00:00Z","selectedMultiplierRuleCode":null,"contributions":[{"ruleCode":"purchase-base","effectKind":"base_rate","uncappedPoints":"800","awardedPoints":"800","uncappedNumerator":"800","awardedNumerator":"800","denominator":"1","capApplied":"none"}],"lines":[]}'::jsonb,
    '{"tierMultiplierBasisPoints":10000}'::jsonb,
    '2026-08-14T10:00:00Z', '2026-08-14T10:00:01Z'
  ) $$,
  array['created'::text],
  'purchase award appends its qualification fact atomically'
);
select results_eq(
  $$ select fact_kind, eligible_spend_minor_delta, earned_points_delta,
       order_count_delta::integer, effective_at, recorded_at
     from pg_temp.m05_live_facts $$,
  $$ values ('purchase'::text, 16000::bigint, 800::bigint, 1,
    '2026-08-14T10:00:00Z'::timestamptz,
    '2026-08-14T10:00:01Z'::timestamptz) $$,
  'purchase fact preserves separate event and recording time'
);
select results_eq(
  $$ select outcome from loyalty_private.commit_programme_v2_award(
    pg_temp.m05_live_ref('organization'), pg_temp.m05_live_ref('group'),
    pg_temp.m05_live_ref('version'), pg_temp.m05_live_ref('event-award'),
    pg_temp.m05_live_ref('customer'), 'woocommerce:order:m05-1',
    'm05:live:award:evaluation', 'm05:live:award:ledger',
    decode(repeat('1',64),'hex'), decode(repeat('2',64),'hex'),
    '{"version":"2","eventId":"woo:event:m05:1","source":"purchase","eligibleSpendMinor":"16000","awardedPoints":"800","tierCodeSnapshot":"rose","pendingAt":"2026-08-14T10:00:00Z","availableAt":"2026-09-13T10:00:00Z","expiresAt":"2027-09-13T10:00:00Z","selectedMultiplierRuleCode":null,"contributions":[{"ruleCode":"purchase-base","effectKind":"base_rate","uncappedPoints":"800","awardedPoints":"800","uncappedNumerator":"800","awardedNumerator":"800","denominator":"1","capApplied":"none"}],"lines":[]}'::jsonb,
    '{"tierMultiplierBasisPoints":10000}'::jsonb,
    '2026-08-14T10:00:00Z', '2026-08-14T10:00:01Z'
  ) $$,
  array['duplicate'::text],
  'duplicate award returns its original effect'
);
select results_eq(
  $$ select count(*)::bigint from pg_temp.m05_live_facts $$,
  array[1::bigint],
  'duplicate award creates one qualification fact'
);
select results_eq(
  $$ select metrics from loyalty_private.get_tier_qualification_context_v2(
    pg_temp.m05_live_ref('organization'), pg_temp.m05_live_ref('group'),
    pg_temp.m05_live_ref('version'), pg_temp.m05_live_ref('customer'),
    '2026-08-14T10:00:01Z'
  ) $$,
  $$ values ('{"eligibleSpendMinor":"16000","earnedPoints":"800","orderCount":"1","referralCount":"0","verifiedActionCount":"0","verifiedActionCounts":{}}'::jsonb) $$,
  'authoritative entry snapshot reconciles to the immutable fact'
);
select throws_ok(
  $$ select * from loyalty_private.record_tier_qualification_decision_v2(
    pg_temp.m05_live_ref('organization'), pg_temp.m05_live_ref('group'),
    pg_temp.m05_live_ref('version'), pg_temp.m05_live_ref('event-award'),
    pg_temp.m05_live_ref('customer'), '2026-08-14T10:00:01Z',
    jsonb_set(pg_temp.m05_entry_result(), '{metrics,eligibleSpendMinor}', '"99999"')
  ) $$,
  '23514', 'live tier evaluation does not match authoritative metrics',
  'worker cannot forge qualification metrics'
);
select results_eq(
  $$ select outcome from loyalty_private.record_tier_qualification_decision_v2(
    pg_temp.m05_live_ref('organization'), pg_temp.m05_live_ref('group'),
    pg_temp.m05_live_ref('version'), pg_temp.m05_live_ref('event-award'),
    pg_temp.m05_live_ref('customer'), '2026-08-14T10:00:01Z',
    pg_temp.m05_entry_result()
  ) $$,
  array['created'::text],
  'verified entry decision is appended'
);
select results_eq(
  $$ select membership.tier_code
     from loyalty.tier_memberships as membership
     where membership.effective_until is null $$,
  array['bloom'::text],
  'entry creates one current Bloom membership'
);

select results_eq(
  $$ select outcome from loyalty_private.record_programme_evaluation(
    pg_temp.m05_live_ref('organization'), pg_temp.m05_live_ref('group'),
    pg_temp.m05_live_ref('version'), pg_temp.m05_live_ref('event-refund-partial'),
    'live_refund', 'woocommerce:refund:m05-partial',
    'm05:refund:partial:evaluation', decode(repeat('3',64),'hex'),
    decode(repeat('4',64),'hex'),
    '{"version":"2","orderEventId":"woo:event:m05:1","cumulativeRefundedEligibleSpendMinor":"5000","originalEligibleSpendMinor":"16000","reversalPoints":"250"}'::jsonb,
    '{}'::jsonb, '2026-08-20T10:00:01Z'
  ) $$,
  array['created'::text],
  'partial refund evaluation is immutable and idempotent'
);
select results_eq(
  $$ select outcome from loyalty_private.record_tier_refund_fact_v2(
    pg_temp.m05_live_ref('organization'),
    pg_temp.m05_evaluation_ref('m05:live:award:evaluation'),
    pg_temp.m05_evaluation_ref('m05:refund:partial:evaluation')
  ) $$,
  array['created'::text],
  'partial refund appends a compensating qualification fact'
);
select results_eq(
  $$ select metrics from loyalty_private.get_tier_qualification_context_v2(
    pg_temp.m05_live_ref('organization'), pg_temp.m05_live_ref('group'),
    pg_temp.m05_live_ref('version'), pg_temp.m05_live_ref('customer'),
    '2026-08-20T10:00:01Z'
  ) $$,
  $$ values ('{"eligibleSpendMinor":"11000","earnedPoints":"550","orderCount":"1","referralCount":"0","verifiedActionCount":"0","verifiedActionCounts":{}}'::jsonb) $$,
  'partial refund reduces spend and points without removing the order'
);
select results_eq(
  $$ select outcome from loyalty_private.record_tier_qualification_decision_v2(
    pg_temp.m05_live_ref('organization'), pg_temp.m05_live_ref('group'),
    pg_temp.m05_live_ref('version'), pg_temp.m05_live_ref('event-refund-partial'),
    pg_temp.m05_live_ref('customer'), '2026-08-20T10:00:01Z',
    pg_temp.m05_grace_result()
  ) $$,
  array['created'::text],
  'failed retention starts an audited grace decision'
);
select results_eq(
  $$ select tier_code from loyalty.tier_memberships
     where effective_until is null $$,
  array['bloom'::text],
  'grace preserves the current tier'
);
select results_eq(
  $$ select below_threshold_since, grace_until
     from loyalty.tier_decisions order by id desc limit 1 $$,
  $$ values (
    '2026-08-20T10:00:01Z'::timestamptz,
    '2026-09-19T10:00:01Z'::timestamptz
  ) $$,
  'grace boundary is stored exactly'
);

select results_eq(
  $$ select outcome from loyalty_private.record_programme_evaluation(
    pg_temp.m05_live_ref('organization'), pg_temp.m05_live_ref('group'),
    pg_temp.m05_live_ref('version'), pg_temp.m05_live_ref('event-refund-full'),
    'live_refund', 'woocommerce:refund:m05-full',
    'm05:refund:full:evaluation', decode(repeat('5',64),'hex'),
    decode(repeat('6',64),'hex'),
    '{"version":"2","orderEventId":"woo:event:m05:1","cumulativeRefundedEligibleSpendMinor":"16000","originalEligibleSpendMinor":"16000","reversalPoints":"550"}'::jsonb,
    '{}'::jsonb, '2026-09-21T10:00:01Z'
  ) $$,
  array['created'::text],
  'full refund evaluation is appended after the partial refund'
);
select results_eq(
  $$ select outcome from loyalty_private.record_tier_refund_fact_v2(
    pg_temp.m05_live_ref('organization'),
    pg_temp.m05_evaluation_ref('m05:live:award:evaluation'),
    pg_temp.m05_evaluation_ref('m05:refund:full:evaluation')
  ) $$,
  array['created'::text],
  'full refund appends only the remaining compensation'
);
select results_eq(
  $$ select metrics from loyalty_private.get_tier_qualification_context_v2(
    pg_temp.m05_live_ref('organization'), pg_temp.m05_live_ref('group'),
    pg_temp.m05_live_ref('version'), pg_temp.m05_live_ref('customer'),
    '2026-09-21T10:00:01Z'
  ) $$,
  $$ values ('{"eligibleSpendMinor":"0","earnedPoints":"0","orderCount":"0","referralCount":"0","verifiedActionCount":"0","verifiedActionCounts":{}}'::jsonb) $$,
  'full refund reconciles every qualification metric to zero'
);
select results_eq(
  $$ select outcome from loyalty_private.record_tier_qualification_decision_v2(
    pg_temp.m05_live_ref('organization'), pg_temp.m05_live_ref('group'),
    pg_temp.m05_live_ref('version'), pg_temp.m05_live_ref('event-refund-full'),
    pg_temp.m05_live_ref('customer'), '2026-09-21T10:00:01Z',
    pg_temp.m05_downgrade_result()
  ) $$,
  array['created'::text],
  'expired grace appends a verified downgrade decision'
);
select results_eq(
  $$ select tier_code from loyalty.tier_memberships
     where effective_until is null $$,
  array['rose'::text],
  'expired grace moves the current membership to Rose'
);
select results_eq(
  $$ select count(*)::bigint,
       count(*) filter (where effective_until is null)::bigint
     from loyalty.tier_memberships $$,
  $$ values (2::bigint, 1::bigint) $$,
  'membership history retains Bloom and exactly one current Rose row'
);
select results_eq(
  $$ select count(*)::bigint from pg_temp.m05_live_facts
     where fact_kind = 'refund'
       and effective_at = '2026-08-14T10:00:00Z'
       and recorded_at > effective_at $$,
  array[2::bigint],
  'refund facts compensate the original order event time without rewriting it'
);
select results_eq(
  $$ select outcome from loyalty_private.record_tier_refund_fact_v2(
    pg_temp.m05_live_ref('organization'),
    pg_temp.m05_evaluation_ref('m05:live:award:evaluation'),
    pg_temp.m05_evaluation_ref('m05:refund:full:evaluation')
  ) $$,
  array['duplicate'::text],
  'duplicate refund fact returns the original immutable fact'
);
select results_eq(
  $$ select count(*)::bigint from pg_temp.m05_live_facts $$,
  array[3::bigint],
  'award and two refunds create exactly three qualification facts'
);

select results_eq(
  $$ select outcome from loyalty_private.record_programme_evaluation(
    pg_temp.m05_live_ref('organization'), pg_temp.m05_live_ref('group'),
    pg_temp.m05_live_ref('version'), pg_temp.m05_live_ref('event-refund-invalid'),
    'live_refund', 'woocommerce:refund:m05-invalid',
    'm05:refund:invalid:evaluation', decode(repeat('7',64),'hex'),
    decode(repeat('8',64),'hex'),
    '{"version":"2","orderEventId":"woo:event:m05:1","cumulativeRefundedEligibleSpendMinor":"16000","originalEligibleSpendMinor":"99999","reversalPoints":"0"}'::jsonb,
    '{}'::jsonb, '2026-09-22T10:00:01Z'
  ) $$,
  array['created'::text],
  'invalid refund evidence is stored before the fact boundary rejects it'
);
select throws_ok(
  $$ select * from loyalty_private.record_tier_refund_fact_v2(
    pg_temp.m05_live_ref('organization'),
    pg_temp.m05_evaluation_ref('m05:live:award:evaluation'),
    pg_temp.m05_evaluation_ref('m05:refund:invalid:evaluation')
  ) $$,
  '23514', 'refund tier fact cumulative spend moved outside its original award',
  'forged original totals cannot release qualification value'
);
select throws_ok(
  $$ select * from loyalty_private.get_tier_qualification_context_v2(
    pg_temp.m05_live_ref('organization-two'),
    pg_temp.m05_live_ref('group'), pg_temp.m05_live_ref('version'),
    pg_temp.m05_live_ref('customer'), '2026-09-22T10:00:01Z'
  ) $$,
  '22023', 'unknown active tier customer',
  'cross-tenant qualification context fails closed'
);
reset role;

select throws_ok(
  $$ update loyalty_private.tier_qualification_facts
     set earned_points_delta = earned_points_delta + 1 $$,
  '55000', 'immutable loyalty history cannot be changed',
  'qualification facts reject corrective rewrites'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.tier_decisions $$,
  array[3::bigint],
  'entry grace and downgrade remain as three attributable decisions'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.tier_memberships
     where effective_until is null $$,
  array[1::bigint],
  'live qualification leaves exactly one current tier membership'
);

select has_trigger(
  'loyalty', 'programme_versions', 'programme_versions_tier_benefit_execution',
  'tier benefit execution is guarded at the immutable version boundary'
);
select has_table(
  'loyalty', 'tier_manual_overrides',
  'manual tier override grants are immutable resources'
);
select has_table(
  'loyalty', 'tier_manual_override_resolutions',
  'manual tier override resolution evidence is immutable'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'loyalty.tier_manual_overrides'::regclass),
  'manual tier overrides have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'loyalty.tier_manual_override_resolutions'::regclass),
  'manual tier override resolutions have RLS enabled'
);
select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.set_customer_tier_override_command(uuid,uuid,uuid,text,timestamp with time zone,text,text,uuid)',
    'EXECUTE'
  ),
  'authenticated merchants can enter the scoped override command'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'loyalty_private.expire_due_tier_overrides_v1(timestamp with time zone,integer)',
    'EXECUTE'
  ),
  'browser sessions cannot run override expiry maintenance'
);
select ok(
  has_function_privilege(
    'loyalty_worker',
    'loyalty_private.expire_due_tier_overrides_v1(timestamp with time zone,integer)',
    'EXECUTE'
  ),
  'worker can run only the bounded override expiry boundary'
);
select ok(
  not has_function_privilege(
    'loyalty_worker',
    'loyalty_private.record_tier_decision(bigint,bigint,bigint,bigint,text,text,text,bigint,timestamp with time zone,timestamp with time zone,timestamp with time zone,text,bytea,jsonb)',
    'EXECUTE'
  ),
  'worker cannot bypass independently verified qualification with a raw decision'
);
select ok(
  not has_function_privilege(
    'loyalty_worker',
    'loyalty_private.record_tier_decision_core(bigint,bigint,bigint,bigint,text,text,text,bigint,timestamp with time zone,timestamp with time zone,timestamp with time zone,text,bytea,jsonb)',
    'EXECUTE'
  ),
  'worker cannot enter the membership-writing core'
);
select ok(
  has_table_privilege(
    'authenticated', 'loyalty.tier_manual_overrides', 'SELECT'
  ) and not has_table_privilege(
    'authenticated', 'loyalty.tier_manual_overrides', 'INSERT'
  ),
  'merchant sessions receive tenant-filtered inspection without table writes'
);

set local role authenticated;
set local request.jwt.claim.sub = '85000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select outcome, effective_tier_code from loyalty.set_customer_tier_override_command(
    '85000000-0000-4000-8000-000000000113',
    (select public_id from loyalty.programme_groups where slug = 'rewards'
      and organization_id = (select id from loyalty.organizations where slug = 'm05-one')),
    (select version.public_id from loyalty.programme_versions as version
      join loyalty.programmes as programme on programme.id = version.programme_id
      where programme.public_id = '85000000-0000-4000-8000-000000000101'
        and version.status = 'published'),
    'icon', now() + interval '2 days', 'Approved service recovery',
    'm05:override:owner', '85000000-0000-4000-8000-000000000301'
  ) $$,
  $$ values ('created'::text, 'icon'::text) $$,
  'owner creates one future-expiring reason-bound override'
);
select results_eq(
  $$ select tier_code, previous_tier_code, reason, actor_user_id
     from loyalty.tier_manual_overrides
     where idempotency_key = 'm05:override:owner' $$,
  $$ values ('icon'::text, 'rose'::text, 'Approved service recovery'::text,
    '85000000-0000-4000-8000-000000000001'::uuid) $$,
  'override evidence attributes the exact tier reason actor and prior tier'
);
select results_eq(
  $$ select outcome from loyalty.set_customer_tier_override_command(
    '85000000-0000-4000-8000-000000000113',
    (select public_id from loyalty.programme_groups where slug = 'rewards'
      and organization_id = (select id from loyalty.organizations where slug = 'm05-one')),
    (select version.public_id from loyalty.programme_versions as version
      join loyalty.programmes as programme on programme.id = version.programme_id
      where programme.public_id = '85000000-0000-4000-8000-000000000101'
        and version.status = 'published'),
    'icon', now() + interval '2 days', 'Approved service recovery',
    'm05:override:owner', '85000000-0000-4000-8000-000000000301'
  ) $$,
  array['duplicate'::text],
  'same override command returns its original result'
);
select throws_ok(
  $$ select * from loyalty.set_customer_tier_override_command(
    '85000000-0000-4000-8000-000000000113',
    (select public_id from loyalty.programme_groups where slug = 'rewards'
      and organization_id = (select id from loyalty.organizations where slug = 'm05-one')),
    (select version.public_id from loyalty.programme_versions as version
      join loyalty.programmes as programme on programme.id = version.programme_id
      where programme.public_id = '85000000-0000-4000-8000-000000000101'
        and version.status = 'published'),
    'bloom', now() + interval '2 days', 'Approved service recovery',
    'm05:override:owner', '85000000-0000-4000-8000-000000000301'
  ) $$,
  '23514', 'manual tier override idempotency conflict',
  'changed override payload conflicts instead of creating another grant'
);

set local request.jwt.claim.sub = '85000000-0000-4000-8000-000000000003';
select throws_ok(
  $$ select * from loyalty.set_customer_tier_override_command(
    '85000000-0000-4000-8000-000000000114',
    (select public_id from loyalty.programme_groups where slug = 'rewards'
      and organization_id = (select id from loyalty.organizations where slug = 'm05-one')),
    (select version.public_id from loyalty.programme_versions as version
      join loyalty.programmes as programme on programme.id = version.programme_id
      where programme.public_id = '85000000-0000-4000-8000-000000000101'
        and version.status = 'published'),
    'icon', now() + interval '4 days', 'Unapproved analyst request',
    'm05:override:analyst', '85000000-0000-4000-8000-000000000302'
  ) $$,
  '42501', 'manual tier override not authorized',
  'analyst membership cannot grant a manual tier override'
);
set local request.jwt.claim.sub = '86000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select * from loyalty.set_customer_tier_override_command(
    '85000000-0000-4000-8000-000000000114',
    '85000000-0000-4000-8000-000000000001',
    '85000000-0000-4000-8000-000000000002',
    'icon', now() + interval '4 days', 'Cross tenant override request',
    'm05:override:cross-tenant', '85000000-0000-4000-8000-000000000303'
  ) $$,
  '42501', 'manual tier override not authorized',
  'another organization owner cannot discover or override this customer'
);

set local request.jwt.claim.sub = '85000000-0000-4000-8000-000000000002';
select results_eq(
  $$ select outcome, effective_tier_code from loyalty.set_customer_tier_override_command(
    '85000000-0000-4000-8000-000000000114',
    (select public_id from loyalty.programme_groups where slug = 'rewards'
      and organization_id = (select id from loyalty.organizations where slug = 'm05-one')),
    (select version.public_id from loyalty.programme_versions as version
      join loyalty.programmes as programme on programme.id = version.programme_id
      where programme.public_id = '85000000-0000-4000-8000-000000000101'
        and version.status = 'published'),
    'icon', now() + interval '4 days', 'Approved account recovery',
    'm05:override:admin', '85000000-0000-4000-8000-000000000304'
  ) $$,
  $$ values ('created'::text, 'icon'::text) $$,
  'admin has the same bounded override authority as owner'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.tier_manual_overrides $$,
  array[2::bigint],
  'tenant RLS exposes both attributable override grants to this member'
);
select results_eq(
  $$ select count(*)::bigint, count(distinct actor_user_id)::bigint
     from loyalty.admin_audit_events
     where action = 'customer.tier.override' $$,
  $$ values (2::bigint, 2::bigint) $$,
  'each created override has one immutable admin audit event and actor'
);
reset role;

set local role anon;
select throws_ok(
  $$ select count(*) from loyalty.tier_manual_overrides $$,
  '42501', null,
  'anonymous clients cannot inspect manual tier override evidence'
);
reset role;

insert into pg_temp.m05_live_refs
select 'customer-override-owner', customer.id
from loyalty.customers as customer
where customer.public_id = '85000000-0000-4000-8000-000000000113'
union all
select 'wallet-override-owner', wallet.id
from loyalty.wallets as wallet
join loyalty.customers as customer on customer.id = wallet.customer_id
where customer.public_id = '85000000-0000-4000-8000-000000000113'
union all
select 'customer-override-admin', customer.id
from loyalty.customers as customer
where customer.public_id = '85000000-0000-4000-8000-000000000114';

set local role loyalty_worker;
select results_eq(
  $$ select current_tier_code, previously_held_tier_codes
     from loyalty_private.get_tier_qualification_context_v2(
       pg_temp.m05_live_ref('organization'), pg_temp.m05_live_ref('group'),
       pg_temp.m05_live_ref('version'),
       pg_temp.m05_live_ref('customer-override-owner'), now() + interval '1 hour'
     ) $$,
  $$ values ('rose'::text, array[]::text[]) $$,
  'active override exposes the underlying automatic tier to qualification'
);
select throws_ok(
  $$ select * from loyalty_private.record_tier_decision(
    pg_temp.m05_live_ref('organization'), pg_temp.m05_live_ref('group'),
    pg_temp.m05_live_ref('version'), pg_temp.m05_live_ref('wallet-override-owner'),
    'bloom', 'bloom', 'upgrade', 16000, null, null, now() + interval '1 hour',
    'm05:override:forged-worker-decision', decode(repeat('c',64),'hex'),
    '{"version":"2","effectiveTierCode":"bloom"}'::jsonb
  ) $$,
  '42501', null,
  'worker cannot forge the automatic decision used beneath an override'
);
reset role;

select results_eq(
  $$ select outcome from loyalty_private.record_tier_decision(
    pg_temp.m05_live_ref('organization'), pg_temp.m05_live_ref('group'),
    pg_temp.m05_live_ref('version'), pg_temp.m05_live_ref('wallet-override-owner'),
    'bloom', 'bloom', 'upgrade', 16000, null, null, now() + interval '1 hour',
    'm05:override:verified-automatic', decode(repeat('d',64),'hex'),
    '{"version":"2","effectiveTierCode":"bloom"}'::jsonb
  ) $$,
  array['created'::text],
  'verified automatic decision path continues while the override is active'
);
select results_eq(
  $$ select decision.tier_code, decision.qualified_tier_code,
       decision.transition, decision.explanation ->> 'effectiveTierCode',
       (decision.explanation ? 'activeOverrideId')
     from loyalty.tier_decisions as decision
     where decision.idempotency_key = 'm05:override:verified-automatic' $$,
  $$ values ('icon'::text, 'bloom'::text, 'manual'::text, 'bloom'::text, true) $$,
  'automatic decision records underlying qualification while pinning effective tier'
);
select results_eq(
  $$ select tier_code from loyalty.tier_memberships as membership
     join loyalty.wallets as wallet on wallet.id = membership.wallet_id
     join loyalty.customers as customer on customer.id = wallet.customer_id
     where customer.public_id = '85000000-0000-4000-8000-000000000113'
       and membership.effective_until is null $$,
  array['icon'::text],
  'active override keeps the customer effective membership at Icon'
);

set local role loyalty_worker;
select results_eq(
  $$ select current_tier_code from loyalty_private.get_tier_qualification_context_v2(
    pg_temp.m05_live_ref('organization'), pg_temp.m05_live_ref('group'),
    pg_temp.m05_live_ref('version'),
    pg_temp.m05_live_ref('customer-override-owner'), now() + interval '2 hours'
  ) $$,
  array['bloom'::text],
  'next automatic evaluation advances from verified Bloom rather than manual Icon'
);
select results_eq(
  $$ select expired_count from loyalty_private.expire_due_tier_overrides_v1(
    now() + interval '1 day', 50
  ) $$,
  array[0],
  'expiry sweep does nothing before the bounded override deadline'
);
select results_eq(
  $$ select expired_count from loyalty_private.expire_due_tier_overrides_v1(
    now() + interval '3 days', 50
  ) $$,
  array[1],
  'expiry sweep resolves only the due owner override'
);
select results_eq(
  $$ select expired_count from loyalty_private.expire_due_tier_overrides_v1(
    now() + interval '3 days', 50
  ) $$,
  array[0],
  'replayed expiry sweep creates no duplicate decision or resolution'
);
select results_eq(
  $$ select expired_count from loyalty_private.expire_due_tier_overrides_v1(
    now() + interval '5 days', 50
  ) $$,
  array[1],
  'later expiry sweep independently resolves the admin override'
);
select throws_ok(
  $$ select * from loyalty_private.expire_due_tier_overrides_v1(now(), 201) $$,
  '22023', 'invalid tier override expiry sweep',
  'worker maintenance cannot request an unbounded override sweep'
);
select throws_ok(
  $$ select * from loyalty_private.expire_due_tier_overrides_v1(now(), null) $$,
  '22023', 'invalid tier override expiry sweep',
  'null cannot bypass the bounded override sweep limit'
);
reset role;

select results_eq(
  $$ select customer.public_id, membership.tier_code
     from loyalty.tier_memberships as membership
     join loyalty.wallets as wallet on wallet.id = membership.wallet_id
     join loyalty.customers as customer on customer.id = wallet.customer_id
     where customer.public_id in (
       '85000000-0000-4000-8000-000000000113',
       '85000000-0000-4000-8000-000000000114'
     ) and membership.effective_until is null
     order by customer.public_id $$,
  $$ values
    ('85000000-0000-4000-8000-000000000113'::uuid, 'bloom'::text),
    ('85000000-0000-4000-8000-000000000114'::uuid, 'rose'::text)
  $$,
  'expiry restores the latest verified owner tier and admin pre-override tier'
);
select results_eq(
  $$ select count(*)::bigint, count(*) filter (where resolution = 'expired')::bigint
     from loyalty.tier_manual_override_resolutions $$,
  $$ values (2::bigint, 2::bigint) $$,
  'every override has exactly one immutable terminal resolution'
);
select throws_ok(
  $$ update loyalty.tier_manual_overrides set reason = 'Rewritten reason' $$,
  '55000', 'immutable loyalty history cannot be changed',
  'manual override grants reject corrective rewrites'
);
select throws_ok(
  $$ delete from loyalty.tier_manual_override_resolutions $$,
  '55000', 'immutable loyalty history cannot be changed',
  'manual override resolutions reject deletion'
);

select has_function(
  'loyalty', 'get_customer_tier_progress_v1',
  array['uuid', 'uuid', 'timestamp with time zone'],
  'merchant customer progress projection exists'
);
select has_function(
  'loyalty', 'get_my_tier_progress_v1',
  array['timestamp with time zone'],
  'customer self-service progress projection exists'
);
select has_function(
  'loyalty', 'get_programme_tier_performance_v1',
  array['uuid', 'timestamp with time zone'],
  'merchant aggregate tier performance projection exists'
);
select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.get_customer_tier_progress_v1(uuid,uuid,timestamp with time zone)',
    'EXECUTE'
  ),
  'authenticated merchants can enter the tenant-authorized progress projection'
);
select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.get_my_tier_progress_v1(timestamp with time zone)', 'EXECUTE'
  ),
  'authenticated customers can enter their Auth-derived progress projection'
);
select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.get_programme_tier_performance_v1(uuid,timestamp with time zone)',
    'EXECUTE'
  ),
  'authenticated merchants can enter aggregate tier performance'
);
select ok(
  not has_function_privilege(
    'anon',
    'loyalty.get_customer_tier_progress_v1(uuid,uuid,timestamp with time zone)',
    'EXECUTE'
  ),
  'anonymous clients cannot enter merchant progress'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'loyalty_private.build_customer_tier_progress_v1(bigint,bigint,bigint,bigint,bigint,timestamp with time zone)',
    'EXECUTE'
  ),
  'browser sessions cannot bypass the scoped projections through the private builder'
);

insert into loyalty.customer_user_links (
  public_id, organization_id, customer_id, auth_user_id, source_connection_id
)
select '85000000-0000-4000-8000-000000000119',
  customer.organization_id, customer.id,
  '85000000-0000-4000-8000-000000000001', connection.id
from loyalty.customers as customer
join loyalty.commerce_connections as connection
  on connection.organization_id = customer.organization_id
where customer.public_id = '85000000-0000-4000-8000-000000000113';

set local role authenticated;
set local request.jwt.claim.sub = '85000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select customer_id from loyalty.get_customer_tier_progress_v1(
    '85000000-0000-4000-8000-000000000113',
    (select public_id from loyalty.programme_groups where slug = 'rewards'
      and organization_id = (select id from loyalty.organizations where slug = 'm05-one')),
    now() + interval '6 days'
  ) $$,
  array['85000000-0000-4000-8000-000000000113'::uuid],
  'merchant progress returns only the requested tenant customer'
);
select results_eq(
  $$ select tier_progress -> 'currentTier' ->> 'code',
       tier_progress -> 'automaticTier' ->> 'code',
       tier_progress -> 'qualifiedTier' ->> 'code'
     from loyalty.get_customer_tier_progress_v1(
       '85000000-0000-4000-8000-000000000113',
       (select public_id from loyalty.programme_groups where slug = 'rewards'
         and organization_id = (select id from loyalty.organizations where slug = 'm05-one')),
       now() + interval '6 days'
     ) $$,
  $$ values ('bloom'::text, 'bloom'::text, 'bloom'::text) $$,
  'progress distinguishes effective automatic and qualified tier after override expiry'
);
select results_eq(
  $$ select tier_progress -> 'nextMilestone' -> 'tier' ->> 'code',
       tier_progress -> 'nextMilestone' ->> 'thresholdKind',
       tier_progress -> 'nextMilestone' -> 'thresholds' -> 0 ->> 'remaining'
     from loyalty.get_customer_tier_progress_v1(
       '85000000-0000-4000-8000-000000000113',
       (select public_id from loyalty.programme_groups where slug = 'rewards'
         and organization_id = (select id from loyalty.organizations where slug = 'm05-one')),
       now() + interval '6 days'
     ) $$,
  $$ values ('icon'::text, 'reentry'::text, '40000'::text) $$,
  'next milestone returns exact re-entry progress after a prior manual tier interval'
);
select ok(
  (select jsonb_array_length(tier_progress -> 'history') >= 3
   from loyalty.get_customer_tier_progress_v1(
     '85000000-0000-4000-8000-000000000113',
     (select public_id from loyalty.programme_groups where slug = 'rewards'
       and organization_id = (select id from loyalty.organizations where slug = 'm05-one')),
     now() + interval '6 days'
   )),
  'progress includes bounded immutable membership history'
);
select ok(
  (select not (tier_progress ? 'availablePoints')
     and not (tier_progress::text ~ 'reason|actor|idempotency|request')
   from loyalty.get_customer_tier_progress_v1(
     '85000000-0000-4000-8000-000000000113',
     (select public_id from loyalty.programme_groups where slug = 'rewards'
       and organization_id = (select id from loyalty.organizations where slug = 'm05-one')),
     now() + interval '6 days'
   )),
  'qualification progress omits wallet balances and private decision evidence'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.get_customer_tier_progress_v1(
    '86000000-0000-4000-8000-000000000999',
    (select public_id from loyalty.programme_groups where slug = 'rewards'
      and organization_id = (select id from loyalty.organizations where slug = 'm05-one')),
    now()
  ) $$,
  array[0::bigint],
  'unknown or cross-tenant customer progress returns no row'
);
select results_eq(
  $$ select account_id from loyalty.get_my_tier_progress_v1(now() + interval '6 days') $$,
  array['85000000-0000-4000-8000-000000000119'::uuid],
  'customer self-service progress derives the one active Auth link'
);
select results_eq(
  $$ select tier_progress -> 'currentTier' ->> 'name',
       tier_progress -> 'metrics' ->> 'eligibleSpendMinor'
     from loyalty.get_my_tier_progress_v1(now() + interval '6 days') $$,
  $$ values ('Bloom'::text, '0'::text) $$,
  'customer progress returns safe names and exact qualification metrics'
);
select results_eq(
  $$ select tier_performance ->> 'membersWithTier',
       tier_performance -> 'tiers' -> 0 -> 'tier' ->> 'code'
     from loyalty.get_programme_tier_performance_v1(
       '85000000-0000-4000-8000-000000000101', now() + interval '6 days'
     ) $$,
  $$ values ('3'::text, 'rose'::text) $$,
  'merchant performance aggregates current memberships and ordered tiers'
);
select ok(
  (select not (tier_performance::text ~ 'customer|display|email|reason|actor')
   from loyalty.get_programme_tier_performance_v1(
     '85000000-0000-4000-8000-000000000101', now() + interval '6 days'
   )),
  'aggregate performance exposes no customer identity or override reason'
);
reset role;

update loyalty.customer_user_links set revoked_at = now()
where public_id = '85000000-0000-4000-8000-000000000119';
set local role authenticated;
set local request.jwt.claim.sub = '85000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select count(*)::bigint from loyalty.get_my_tier_progress_v1(now()) $$,
  array[0::bigint],
  'revoked customer links lose progression access immediately'
);
reset role;

select * from finish();
rollback;
