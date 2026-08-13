begin;

create extension if not exists pgtap with schema extensions;

select plan(40);

select has_table('loyalty', 'programme_earning_rules', 'V2 earning rules table exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'loyalty.programme_earning_rules'::regclass),
  'V2 earning rules have RLS enabled'
);
select has_index(
  'loyalty', 'programme_earning_rules', 'programme_earning_rules_evaluation_idx',
  'V2 live evaluation lookup is indexed'
);
select has_trigger(
  'loyalty', 'programme_earning_rules', 'programme_earning_rules_immutable',
  'materialized V2 rules are immutable'
);
select has_trigger(
  'loyalty', 'programme_versions', 'programme_versions_v2_entitlement',
  'V2 draft insertion is guarded by the database entitlement'
);
select ok(
  has_table_privilege('authenticated', 'loyalty.programme_earning_rules', 'SELECT'),
  'authenticated members can read RLS-filtered V2 rules'
);
select ok(
  not has_table_privilege('authenticated', 'loyalty.programme_earning_rules', 'INSERT'),
  'browser clients cannot materialize V2 rules'
);
select ok(
  not has_function_privilege(
    'authenticated', 'loyalty_private.validate_programme_definition_v2(jsonb)', 'EXECUTE'
  ),
  'browser clients cannot bypass commands through the V2 validator'
);
select ok(
  not has_function_privilege(
    'loyalty_worker', 'loyalty_private.materialize_programme_definition(bigint)', 'EXECUTE'
  ),
  'workers cannot bypass approved publication'
);

insert into auth.users (id, email)
values
  ('73000000-0000-4000-8000-000000000001', 'v2-owner-one@example.test'),
  ('74000000-0000-4000-8000-000000000001', 'v2-owner-two@example.test');

insert into loyalty.organizations (public_id, slug, name)
values
  ('73000000-0000-4000-8000-000000000100', 'programme-v2-one', 'Programme V2 One'),
  ('74000000-0000-4000-8000-000000000100', 'programme-v2-two', 'Programme V2 Two');

insert into loyalty.organization_memberships (organization_id, user_id, role)
values
  ((select id from loyalty.organizations where slug = 'programme-v2-one'), '73000000-0000-4000-8000-000000000001', 'owner'),
  ((select id from loyalty.organizations where slug = 'programme-v2-two'), '74000000-0000-4000-8000-000000000001', 'owner');

insert into loyalty.programme_groups (organization_id, slug, name)
select id, 'rewards', name || ' Rewards'
from loyalty.organizations where slug in ('programme-v2-one', 'programme-v2-two');

insert into loyalty.programmes (public_id, organization_id, programme_group_id, slug, name)
select
  case organization.slug
    when 'programme-v2-one' then '73000000-0000-4000-8000-000000000101'::uuid
    else '74000000-0000-4000-8000-000000000101'::uuid
  end,
  organization.id, programme_group.id, 'rewards', organization.name || ' Rewards'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
where organization.slug in ('programme-v2-one', 'programme-v2-two');

create function pg_temp.valid_v2()
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
      {"code":"rose","name":"Rose","minimumEligibleSpendMinor":"0","pointsPerMajorUnit":"5"}
    ],
    "rewards":[],
    "earningRules":[
      {
        "code":"purchase-base","name":"Base purchase points","source":"purchase",
        "enabled":true,"priority":0,"stackable":false,
        "effect":{"kind":"base_rate","pointsPerMajorUnit":"5"},
        "conditions":{"productIds":[],"categoryIds":[],"currencyCodes":[],"markets":[],"channels":[],"activityCodes":[],"segmentCodes":[],"tierCodes":[],"startsAt":null,"endsAt":null},
        "purchaseExclusions":{"productIds":[],"categoryIds":["clearance"],"shipping":true,"tax":true,"fees":true,"giftCardPayments":true,"storeCreditPayments":true,"discounts":true},
        "cap":{"perEventPoints":"10000","perMemberPoints":null,"memberPeriod":null,"rollingDays":null}
      },
      {
        "code":"vip-double","name":"VIP double points","source":"purchase",
        "enabled":true,"priority":50,"stackable":false,
        "effect":{"kind":"multiplier","multiplierBasisPoints":20000},
        "conditions":{"productIds":[],"categoryIds":["skincare"],"currencyCodes":["EUR"],"markets":["SI"],"channels":["woocommerce"],"activityCodes":[],"segmentCodes":[],"tierCodes":["rose"],"startsAt":null,"endsAt":null},
        "purchaseExclusions":{"productIds":[],"categoryIds":[],"shipping":true,"tax":true,"fees":true,"giftCardPayments":true,"storeCreditPayments":true,"discounts":true},
        "cap":{"perEventPoints":null,"perMemberPoints":null,"memberPeriod":null,"rollingDays":null}
      },
      {
        "code":"birthday","name":"Birthday points","source":"birthday",
        "enabled":true,"priority":10,"stackable":true,
        "effect":{"kind":"fixed_bonus","points":"500"},
        "conditions":{"productIds":[],"categoryIds":[],"currencyCodes":[],"markets":[],"channels":[],"activityCodes":[],"segmentCodes":[],"tierCodes":[],"startsAt":null,"endsAt":null},
        "purchaseExclusions":null,
        "cap":{"perEventPoints":"500","perMemberPoints":"500","memberPeriod":"calendar_year","rollingDays":null}
      }
    ]
  }'::jsonb;
$$;

select lives_ok(
  $$ select loyalty_private.set_deployment_mode(
    'managed', 1, 'test:m03', 'Exercise managed V2 entitlement gating', now() - interval '1 minute'
  ) $$,
  'test changes the deployment to managed mode through the private append-only command'
);
select lives_ok(
  $$ select loyalty_private.set_organization_entitlement(
    '73000000-0000-4000-8000-000000000100', 'programme.v2', 'enabled', null,
    'canary', 'test:m03', 'Enable only the V2 canary organization',
    now() - interval '30 seconds', null
  ) $$,
  'test enables V2 for only the canary organization'
);

set local role authenticated;
set local request.jwt.claim.sub = '74000000-0000-4000-8000-000000000001';

select throws_ok(
  $$ select * from loyalty.create_programme_draft_command(
    '74000000-0000-4000-8000-000000000101', pg_temp.valid_v2(),
    'v2:disabled:draft', '74000000-0000-4000-8000-000000000201'
  ) $$,
  '42501', 'ProgrammeDefinitionV2 is not enabled for this organization',
  'managed organization without an entitlement cannot store a V2 draft'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.programme_versions where organization_id = (
    select id from loyalty.organizations where slug = 'programme-v2-two'
  ) $$,
  array[0::bigint],
  'failed V2 entitlement creates no draft'
);

select results_eq(
  $$ select outcome from loyalty.create_programme_draft_command(
    '74000000-0000-4000-8000-000000000101',
    '{"version":"1","tiers":[{"code":"rose","name":"Rose","minimumEligibleSpendMinor":"0","pointsPerMajorUnit":"5"}],"rewards":[]}'::jsonb,
    'v1:compatible:draft', '74000000-0000-4000-8000-000000000202'
  ) $$,
  array['created'::text],
  'V1 remains usable when V2 is disabled'
);

set local request.jwt.claim.sub = '73000000-0000-4000-8000-000000000001';

select results_eq(
  $$ select outcome from loyalty.create_programme_draft_command(
    '73000000-0000-4000-8000-000000000101', pg_temp.valid_v2(),
    'v2:canary:draft', '73000000-0000-4000-8000-000000000201'
  ) $$,
  array['created'::text],
  'entitled owner stores a validated V2 draft'
);
select results_eq(
  $$ select configuration ->> 'version' from loyalty.programme_versions
     where organization_id = (select id from loyalty.organizations where slug = 'programme-v2-one') $$,
  array['2'::text],
  'the immutable draft retains its explicit V2 contract version'
);

select throws_ok(
  $$ select * from loyalty.create_programme_draft_command(
    '73000000-0000-4000-8000-000000000101',
    jsonb_set(pg_temp.valid_v2(), '{earningRules}',
      (pg_temp.valid_v2() -> 'earningRules') - 0),
    'v2:invalid:no-base', '73000000-0000-4000-8000-000000000202'
  ) $$,
  '23514', 'ProgrammeDefinitionV2 requires exactly one enabled base rate',
  'direct RPC cannot create V2 without one enabled base rate'
);
select throws_ok(
  $$ select * from loyalty.create_programme_draft_command(
    '73000000-0000-4000-8000-000000000101',
    jsonb_set(pg_temp.valid_v2(), '{earningRules}',
      (pg_temp.valid_v2() -> 'earningRules') || (pg_temp.valid_v2() -> 'earningRules' -> 0)),
    'v2:invalid:duplicate', '73000000-0000-4000-8000-000000000203'
  ) $$,
  '23514', 'duplicate ProgrammeDefinitionV2 earning rule code',
  'direct RPC rejects duplicated rule identity'
);
select throws_ok(
  $$ select * from loyalty.create_programme_draft_command(
    '73000000-0000-4000-8000-000000000101',
    jsonb_set(pg_temp.valid_v2(), '{earningRules,2,conditions,productIds}', '["42"]'::jsonb),
    'v2:invalid:activity-commerce', '73000000-0000-4000-8000-000000000204'
  ) $$,
  '22023', 'non-purchase earning rules cannot use commerce conditions',
  'activities cannot smuggle commerce-line conditions'
);
select throws_ok(
  $$ select * from loyalty.create_programme_draft_command(
    '73000000-0000-4000-8000-000000000101',
    jsonb_set(pg_temp.valid_v2(), '{earningRules,0,purchaseExclusions,storeCreditPayments}', 'false'::jsonb),
    'v2:invalid:store-credit', '73000000-0000-4000-8000-000000000205'
  ) $$,
  '22023', 'invalid ProgrammeDefinitionV2 purchase exclusions',
  'stored-value payments remain unconditionally excluded'
);
select throws_ok(
  $$ select * from loyalty.create_programme_draft_command(
    '73000000-0000-4000-8000-000000000101',
    pg_temp.valid_v2() || '{"unreviewedAuthority":true}'::jsonb,
    'v2:invalid:unknown', '73000000-0000-4000-8000-000000000206'
  ) $$,
  '22023', 'invalid ProgrammeDefinitionV2 object',
  'unknown top-level fields fail closed at the database boundary'
);
select throws_ok(
  $$ select * from loyalty.create_programme_draft_command(
    '73000000-0000-4000-8000-000000000101',
    jsonb_set(
      jsonb_set(pg_temp.valid_v2(), '{earningRules,1,conditions,startsAt}', '"2026-09-01T00:00:00Z"'),
      '{earningRules,1,conditions,endsAt}', '"2026-08-01T00:00:00Z"'
    ),
    'v2:invalid:window', '73000000-0000-4000-8000-000000000207'
  ) $$,
  '22023', 'ProgrammeDefinitionV2 rule end must follow start',
  'invalid half-open rule windows fail before publication'
);
select throws_ok(
  $$ select * from loyalty.create_programme_draft_command(
    '73000000-0000-4000-8000-000000000101',
    jsonb_set(pg_temp.valid_v2(), '{earningRules,2,cap,memberPeriod}', 'null'::jsonb),
    'v2:invalid:cap', '73000000-0000-4000-8000-000000000208'
  ) $$,
  '22023', 'invalid ProgrammeDefinitionV2 member cap period',
  'member cap amount and period cannot drift'
);
select throws_ok(
  $$ select * from loyalty.create_programme_draft_command(
    '73000000-0000-4000-8000-000000000101',
    jsonb_set(pg_temp.valid_v2(), '{earningRules,1,effect,multiplierBasisPoints}', '1000000'::jsonb),
    'v2:invalid:multiplier', '73000000-0000-4000-8000-000000000209'
  ) $$,
  '22023', 'invalid ProgrammeDefinitionV2 multiplier',
  'excessive multiplier fails closed'
);
select throws_ok(
  $$ select * from loyalty.create_programme_draft_command(
    '73000000-0000-4000-8000-000000000101',
    jsonb_set(
      pg_temp.valid_v2(),
      '{earningRules,0,effect,pointsPerMajorUnit}',
      '"9223372036854775808"'::jsonb
    ),
    'v2:invalid:bigint', '73000000-0000-4000-8000-000000000211'
  ) $$,
  '22023', 'invalid ProgrammeDefinitionV2 base rate',
  'direct RPC rejects earning amounts that cannot be materialized as bigint'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.programme_versions
     where organization_id = (select id from loyalty.organizations where slug = 'programme-v2-one') $$,
  array[1::bigint],
  'all rejected direct RPC definitions leave the one valid draft only'
);

select results_eq(
  $$ select outcome from loyalty.publish_programme_version_command(
    (select public_id from loyalty.programme_versions where organization_id = (
      select id from loyalty.organizations where slug = 'programme-v2-one'
    )),
    (select encode(configuration_sha256, 'hex') from loyalty.programme_versions where organization_id = (
      select id from loyalty.organizations where slug = 'programme-v2-one'
    )),
    'v2:canary:publish', '73000000-0000-4000-8000-000000000210'
  ) $$,
  array['created'::text],
  'reviewed V2 draft publishes through the authenticated command'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.programme_earning_rules where organization_id = (
    select id from loyalty.organizations where slug = 'programme-v2-one'
  ) $$,
  array[3::bigint],
  'publication materializes every normalized earning rule'
);
select results_eq(
  $$ select code from loyalty.programme_earning_rules where organization_id = (
    select id from loyalty.organizations where slug = 'programme-v2-one'
  ) order by ordinal $$,
  $$ values ('purchase-base'::text), ('vip-double'::text), ('birthday'::text) $$,
  'materialization preserves immutable contract order'
);
select results_eq(
  $$ select code from loyalty.programme_earning_rules where effect_kind = 'multiplier' $$,
  array['vip-double'::text],
  'materialization keeps one explicit multiplier effect'
);
select results_eq(
  $$ select cap ->> 'memberPeriod' from loyalty.programme_earning_rules where code = 'birthday' $$,
  array['calendar_year'::text],
  'materialization retains member-cap evidence'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.admin_audit_events where action = 'programme.version.publish' $$,
  array[1::bigint],
  'publication retains authenticated immutable audit evidence'
);

set local request.jwt.claim.sub = '74000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select count(*)::bigint from loyalty.programme_earning_rules $$,
  array[0::bigint],
  'another tenant cannot read the canary rules'
);

reset role;

select throws_ok(
  $$ update loyalty.programme_earning_rules set priority = 999 where code = 'vip-double' $$,
  '55000', 'immutable loyalty history cannot be changed',
  'materialized rules cannot be rewritten'
);
select throws_ok(
  $$ delete from loyalty.programme_earning_rules where code = 'vip-double' $$,
  '55000', 'immutable loyalty history cannot be changed',
  'materialized rules cannot be deleted'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.programme_earning_rules $$,
  array[3::bigint],
  'immutability failures preserve all rules'
);

set local role anon;
select throws_ok(
  $$ select count(*) from loyalty.programme_earning_rules $$,
  '42501', null,
  'anonymous clients cannot read earning rules'
);
reset role;

grant loyalty_worker to current_user;
grant usage on schema extensions to loyalty_worker;
grant execute on all functions in schema extensions to loyalty_worker;
set local role loyalty_worker;
select results_eq(
  $$ select count(*)::bigint from loyalty.programme_earning_rules $$,
  array[3::bigint],
  'worker can read materialized rules for live evaluation'
);
reset role;

select results_eq(
  $$ select count(*)::bigint from loyalty.programme_earning_rules as rule
     join loyalty.programme_versions as version
       on version.organization_id = rule.organization_id
      and version.id = rule.programme_version_id
     where version.configuration ->> 'version' = '1' $$,
  array[0::bigint],
  'V1 versions are not retroactively reinterpreted as V2 rules'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.organization_entitlements
     where capability_key = 'programme.v2' and state = 'enabled' $$,
  array[1::bigint],
  'V2 canary authority remains one audited tenant-scoped assignment'
);

select * from finish();
rollback;
