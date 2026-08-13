begin;

create extension if not exists pgtap with schema extensions;

select plan(30);

grant loyalty_runtime, loyalty_worker to current_user;
grant usage on schema extensions to loyalty_runtime, loyalty_worker;
grant execute on all functions in schema extensions to loyalty_runtime, loyalty_worker;

select has_function(
  'loyalty_private', 'provision_merchant_activity_source',
  array['uuid','uuid','uuid','text','text','text','uuid'],
  'private Merchant Activity source provisioning command exists'
);
select ok(
  has_function_privilege(
    'loyalty_runtime',
    'loyalty_private.provision_merchant_activity_source(uuid,uuid,uuid,text,text,text,uuid)',
    'EXECUTE'
  ),
  'trusted runtime can provision an activity source'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'loyalty_private.provision_merchant_activity_source(uuid,uuid,uuid,text,text,text,uuid)',
    'EXECUTE'
  ),
  'browser sessions cannot provision activity sources'
);
select ok(
  not has_function_privilege(
    'anon',
    'loyalty_private.provision_merchant_activity_source(uuid,uuid,uuid,text,text,text,uuid)',
    'EXECUTE'
  ),
  'anonymous clients cannot provision activity sources'
);
select ok(
  not has_function_privilege(
    'loyalty_worker',
    'loyalty_private.provision_merchant_activity_source(uuid,uuid,uuid,text,text,text,uuid)',
    'EXECUTE'
  ),
  'effect workers cannot provision activity sources'
);
select results_eq(
  $$ select count(*)::bigint
     from pg_constraint
     where conrelid = 'loyalty.commerce_connections'::regclass
       and conname = 'commerce_connections_platform_check'
       and pg_get_constraintdef(oid) like '%merchant_activity%' $$,
  array[1::bigint],
  'the connector platform boundary explicitly recognizes Merchant Activity'
);
select ok(
  not has_table_privilege('authenticated', 'loyalty.commerce_connections', 'INSERT'),
  'browser sessions cannot insert activity sources directly'
);
select ok(
  not has_column_privilege(
    'authenticated', 'loyalty.commerce_connections', 'signing_material_ref', 'SELECT'
  ),
  'browser sessions cannot read activity signing references'
);

insert into auth.users (id, email)
values
  ('b1000000-0000-4000-8000-000000000001', 'activity-owner@example.test'),
  ('b2000000-0000-4000-8000-000000000001', 'activity-other@example.test');
insert into loyalty.organizations (public_id, slug, name)
values
  ('b1000000-0000-4000-8000-000000000100', 'activity-one', 'Activity One'),
  ('b2000000-0000-4000-8000-000000000100', 'activity-two', 'Activity Two');
insert into loyalty.organization_memberships (organization_id, user_id, role)
values
  ((select id from loyalty.organizations where slug = 'activity-one'), 'b1000000-0000-4000-8000-000000000001', 'owner'),
  ((select id from loyalty.organizations where slug = 'activity-two'), 'b2000000-0000-4000-8000-000000000001', 'owner');
insert into loyalty.workspaces (public_id, organization_id, slug, name)
select
  case slug when 'activity-one' then 'b1000000-0000-4000-8000-000000000110'::uuid
    else 'b2000000-0000-4000-8000-000000000110'::uuid end,
  id, 'store', name || ' Store'
from loyalty.organizations where slug in ('activity-one', 'activity-two');
insert into loyalty.programme_groups (public_id, organization_id, slug, name)
select
  case slug when 'activity-one' then 'b1000000-0000-4000-8000-000000000120'::uuid
    else 'b2000000-0000-4000-8000-000000000120'::uuid end,
  id, 'rewards', name || ' Rewards'
from loyalty.organizations where slug in ('activity-one', 'activity-two');
insert into loyalty.programme_group_workspaces (
  organization_id, programme_group_id, workspace_id
)
select organization.id, programme_group.id, workspace.id
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
join loyalty.workspaces as workspace
  on workspace.organization_id = organization.id;
insert into loyalty.programmes (
  public_id, organization_id, programme_group_id, slug, name, status
)
select
  case organization.slug when 'activity-one' then 'b1000000-0000-4000-8000-000000000130'::uuid
    else 'b2000000-0000-4000-8000-000000000130'::uuid end,
  organization.id, programme_group.id, 'rewards', organization.name || ' Rewards', 'active'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id;

create function pg_temp.activity_v2()
returns jsonb language sql immutable as $$
  select '{
    "version":"2","currencyCode":"EUR","currencyMinorUnitDigits":2,
    "pendingDays":30,"pointsExpireAfterDays":365,
    "tiers":[{"code":"rose","name":"Rose","minimumEligibleSpendMinor":"0","pointsPerMajorUnit":"5"}],
    "rewards":[],"earningRules":[
      {"code":"purchase-base","name":"Base purchase points","source":"purchase","enabled":true,"priority":0,"stackable":false,
       "effect":{"kind":"base_rate","pointsPerMajorUnit":"5"},
       "conditions":{"productIds":[],"categoryIds":[],"currencyCodes":[],"markets":[],"channels":[],"activityCodes":[],"segmentCodes":[],"tierCodes":[],"startsAt":null,"endsAt":null},
       "purchaseExclusions":{"productIds":[],"categoryIds":[],"shipping":true,"tax":true,"fees":true,"giftCardPayments":true,"storeCreditPayments":true,"discounts":true},
       "cap":{"perEventPoints":null,"perMemberPoints":null,"memberPeriod":null,"rollingDays":null}},
      {"code":"consultation","name":"Consultation","source":"custom_activity","enabled":true,"priority":10,"stackable":true,
       "effect":{"kind":"fixed_bonus","points":"100"},
       "conditions":{"productIds":[],"categoryIds":[],"currencyCodes":[],"markets":[],"channels":["merchant-api"],"activityCodes":["consultation"],"segmentCodes":[],"tierCodes":[],"startsAt":null,"endsAt":null},
       "purchaseExclusions":null,
       "cap":{"perEventPoints":"100","perMemberPoints":"100","memberPeriod":"lifetime","rollingDays":null}}
    ]
  }'::jsonb;
$$;
insert into loyalty.programme_versions (
  organization_id, programme_group_id, programme_id, version_number,
  status, configuration, configuration_sha256, published_at
)
select organization_id, programme_group_id, id, 1, 'draft',
  pg_temp.activity_v2(), extensions.digest(public_id::text, 'sha256'), null
from loyalty.programmes;
select loyalty_private.materialize_programme_definition(version.id)
from loyalty.programme_versions as version;
update loyalty.programme_versions set status = 'published', published_at = now();
insert into loyalty.customers (public_id, organization_id)
values (
  'b1000000-0000-4000-8000-000000000501',
  (select id from loyalty.organizations where slug = 'activity-one')
);

set local role loyalty_runtime;
create temporary table provisioned_activity_source as
select * from loyalty_private.provision_merchant_activity_source(
  'b1000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000110',
  'b1000000-0000-4000-8000-000000000130',
  'CRM activity source',
  'pool:b1000000-0000-4000-8000-000000000201:v1',
  'activity-source:provision:one',
  'b1000000-0000-4000-8000-000000000301'
);
select results_eq(
  $$ select outcome from provisioned_activity_source $$,
  array['created'::text],
  'owner provisions one programme-bound activity source'
);
reset role;

select results_eq(
  $$ select concat_ws('|', platform, status, current_key_version, display_name)
     from loyalty.commerce_connections
     where public_id = (select source_public_id from provisioned_activity_source) $$,
  array['merchant_activity|active|v1|CRM activity source'::text],
  'source scope and lifecycle are database-authored'
);
select results_eq(
  $$ select signing_material_ref from loyalty.commerce_connections
     where public_id = (select source_public_id from provisioned_activity_source) $$,
  array['pool:b1000000-0000-4000-8000-000000000201:v1'::text],
  'source retains only the external secret reference'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.admin_audit_events
     where action = 'source.merchant_activity.provision'
       and metadata ? 'signingMaterialRef' $$,
  array[0::bigint],
  'immutable audit evidence omits signing references'
);

set local role loyalty_runtime;
select results_eq(
  $$ select outcome from loyalty_private.provision_merchant_activity_source(
    'b1000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000110',
    'b1000000-0000-4000-8000-000000000130', 'CRM activity source',
    'pool:b1000000-0000-4000-8000-000000000201:v1',
    'activity-source:provision:one',
    'b1000000-0000-4000-8000-000000000301') $$,
  array['duplicate'::text],
  'exact source provisioning retries are idempotent'
);
select throws_ok(
  $$ select * from loyalty_private.provision_merchant_activity_source(
    'b1000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000110',
    'b1000000-0000-4000-8000-000000000130', 'Changed source',
    'pool:b1000000-0000-4000-8000-000000000202:v1',
    'activity-source:provision:one',
    'b1000000-0000-4000-8000-000000000302') $$,
  '23514', 'activity source idempotency conflict',
  'changed reuse of a provisioning key fails closed'
);
select throws_ok(
  $$ select * from loyalty_private.provision_merchant_activity_source(
    'b1000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000110',
    'b1000000-0000-4000-8000-000000000130', 'Second source',
    'pool:b1000000-0000-4000-8000-000000000202:v1',
    'activity-source:provision:two',
    'b1000000-0000-4000-8000-000000000303') $$,
  '23514', 'merchant activity source already exists',
  'one workspace cannot accidentally create competing activity authorities'
);
select throws_ok(
  $$ select * from loyalty_private.provision_merchant_activity_source(
    'b2000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000110',
    'b1000000-0000-4000-8000-000000000130', 'Forged source',
    'pool:b1000000-0000-4000-8000-000000000203:v1',
    'activity-source:provision:forged',
    'b1000000-0000-4000-8000-000000000304') $$,
  '42501', 'activity source provisioning not authorized',
  'another tenant owner cannot provision against this workspace'
);
reset role;

create temporary table activity_runtime_refs (
  name text primary key,
  value bigint not null
);
insert into activity_runtime_refs
select 'organization', id from loyalty.organizations where slug = 'activity-one'
union all
select 'connection', id from loyalty.commerce_connections where public_id = (
  select source_public_id from provisioned_activity_source
);
create function pg_temp.activity_runtime_ref(target_name text)
returns bigint
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select value from pg_temp.activity_runtime_refs where name = target_name;
$$;
revoke all on function pg_temp.activity_runtime_ref(text) from public;
grant execute on function pg_temp.activity_runtime_ref(text) to loyalty_runtime;

set local role loyalty_runtime;

create temporary table activity_receipt as
select * from loyalty_private.accept_commerce_delivery(
  pg_temp.activity_runtime_ref('organization'),
  pg_temp.activity_runtime_ref('connection'),
  'delivery-1', '1', 'crm:consultation:42', 'commerce.activity.recorded',
  'b1000000-0000-4000-8000-000000000501', null,
  '2026-08-13T12:00:00Z', '2026-08-13T12:00:01Z',
  'v1', 'nonce-1', repeat('a', 64),
  '{"version":"1","payload":{"kind":"activity","source":"custom_activity","customerId":"b1000000-0000-4000-8000-000000000501","activityCode":"consultation","productId":null,"categoryIds":[]}}'::jsonb
);
select results_eq(
  $$ select outcome from activity_receipt $$,
  array['accepted'::text],
  'verified route authority can persist one bounded delivery'
);
select results_eq(
  $$ select outcome from loyalty_private.normalize_commerce_delivery(
    (select receipt_id from activity_receipt), 'v1') $$,
  array['created'::text],
  'activity delivery normalizes into immutable canonical evidence'
);
reset role;

create temporary table activity_worker_refs (
  name text primary key,
  value bigint not null
);
insert into activity_worker_refs
select 'organization-one', id from loyalty.organizations where slug = 'activity-one'
union all
select 'organization-two', id from loyalty.organizations where slug = 'activity-two'
union all
select 'group-one', id from loyalty.programme_groups where organization_id = (
  select id from loyalty.organizations where slug = 'activity-one'
)
union all
select 'group-two', id from loyalty.programme_groups where organization_id = (
  select id from loyalty.organizations where slug = 'activity-two'
)
union all
select 'version-one', id from loyalty.programme_versions where organization_id = (
  select id from loyalty.organizations where slug = 'activity-one'
)
union all
select 'version-two', id from loyalty.programme_versions where organization_id = (
  select id from loyalty.organizations where slug = 'activity-two'
)
union all
select 'programme-one', id from loyalty.programmes
where public_id = 'b1000000-0000-4000-8000-000000000130'
union all
select 'customer-one', id from loyalty.customers
where public_id = 'b1000000-0000-4000-8000-000000000501';
create function pg_temp.activity_worker_ref(target_name text)
returns bigint
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select value from pg_temp.activity_worker_refs where name = target_name;
$$;
revoke all on function pg_temp.activity_worker_ref(text) from public;
grant execute on function pg_temp.activity_worker_ref(text) to loyalty_worker;

set local role loyalty_worker;
create temporary table activity_effect_claim as
select * from loyalty_private.claim_woocommerce_effects('activity-worker', 10, 60);
select results_eq(
  $$ select event_type from activity_effect_claim $$,
  array['commerce.activity.recorded'::text],
  'activity events enter the bounded effect queue'
);
select results_eq(
  $$ select programme_id from activity_effect_claim $$,
  array[pg_temp.activity_worker_ref('programme-one')],
  'claimed activity derives its programme from the provisioned source'
);
create temporary table committed_activity_award as
select * from loyalty_private.commit_programme_v2_award(
  pg_temp.activity_worker_ref('organization-one'),
  pg_temp.activity_worker_ref('group-one'),
  pg_temp.activity_worker_ref('version-one'),
  (select canonical_event_id from activity_effect_claim),
  pg_temp.activity_worker_ref('customer-one'),
  'merchant-activity:crm:consultation:42',
  'activity:evaluation:crm:consultation:42',
  'activity:ledger:crm:consultation:42',
  decode(repeat('1', 64), 'hex'), decode(repeat('2', 64), 'hex'),
  '{"version":"2","eventId":"merchant-api:crm:consultation:42","source":"custom_activity","eligibleSpendMinor":"0","awardedPoints":"100","tierCodeSnapshot":"rose","pendingAt":"2026-08-13T12:00:00Z","availableAt":"2026-09-12T12:00:00Z","expiresAt":"2027-09-12T12:00:00Z","selectedMultiplierRuleCode":null,"contributions":[{"ruleCode":"consultation","effectKind":"fixed_bonus","uncappedPoints":"100","awardedPoints":"100","uncappedNumerator":"100","awardedNumerator":"100","denominator":"1","capApplied":"none"}],"lines":[]}'::jsonb,
  '{"activity":"consultation"}'::jsonb,
  '2026-08-13T12:00:00Z', '2026-08-13T12:00:02Z'
);
select results_eq(
  $$ select outcome from committed_activity_award $$,
  array['created'::text],
  'signed activity appends one atomic V2 award'
);
select results_eq(
  $$ select balance.points::bigint from loyalty.wallet_balances as balance
     join loyalty.ledger_accounts as account on account.id = balance.ledger_account_id
     where account.account_kind = 'pending'
       and account.wallet_id = (select id from loyalty.wallets where customer_id = (
         select id from loyalty.customers where public_id = 'b1000000-0000-4000-8000-000000000501'
       )) $$,
  array[100::bigint],
  'activity value enters the immutable pending bucket'
);
select results_eq(
  $$ select outcome from loyalty_private.commit_programme_v2_award(
    pg_temp.activity_worker_ref('organization-one'),
    pg_temp.activity_worker_ref('group-one'),
    pg_temp.activity_worker_ref('version-one'),
    (select canonical_event_id from activity_effect_claim),
    pg_temp.activity_worker_ref('customer-one'),
    'merchant-activity:crm:consultation:42',
    'activity:evaluation:crm:consultation:42', 'activity:ledger:crm:consultation:42',
    decode(repeat('1', 64), 'hex'), decode(repeat('2', 64), 'hex'),
    '{"version":"2","eventId":"merchant-api:crm:consultation:42","source":"custom_activity","eligibleSpendMinor":"0","awardedPoints":"100","tierCodeSnapshot":"rose","pendingAt":"2026-08-13T12:00:00Z","availableAt":"2026-09-12T12:00:00Z","expiresAt":"2027-09-12T12:00:00Z","selectedMultiplierRuleCode":null,"contributions":[{"ruleCode":"consultation","effectKind":"fixed_bonus","uncappedPoints":"100","awardedPoints":"100","uncappedNumerator":"100","awardedNumerator":"100","denominator":"1","capApplied":"none"}],"lines":[]}'::jsonb,
    '{"activity":"consultation"}'::jsonb,
    '2026-08-13T12:00:00Z', '2026-08-13T12:00:03Z') $$,
  array['duplicate'::text],
  'exact activity retry returns the original effect'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_transactions
     where idempotency_key = 'activity:ledger:crm:consultation:42' $$,
  array[1::bigint],
  'exact activity retry cannot duplicate ledger value'
);
select throws_ok(
  $$ select * from loyalty_private.commit_programme_v2_award(
    pg_temp.activity_worker_ref('organization-two'),
    pg_temp.activity_worker_ref('group-two'),
    pg_temp.activity_worker_ref('version-two'),
    (select canonical_event_id from activity_effect_claim),
    pg_temp.activity_worker_ref('customer-one'),
    'forged', 'forged:evaluation', 'forged:ledger',
    decode(repeat('1', 64), 'hex'), decode(repeat('2', 64), 'hex'),
    '{}'::jsonb, '{}'::jsonb, now(), now()) $$,
  '22023', 'unknown V2 award context',
  'another tenant cannot commit the claimed activity'
);
select results_eq(
  $$ select outcome from loyalty_private.finish_commerce_effect(
    (select canonical_event_public_id from activity_effect_claim),
    'activity-worker', 'applied', 'loyalty.activity.award',
    'merchant-activity:crm:consultation:42',
    'ledger-transaction:' || (select transaction_public_id from committed_activity_award),
    null, null, 0) $$,
  array['applied'::text],
  'the lease owner closes the value effect with its ledger reference'
);
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select platform from loyalty.commerce_connections where platform = 'merchant_activity' $$,
  array['merchant_activity'::text],
  'the owning tenant can see safe activity-source health fields'
);
set local request.jwt.claim.sub = 'b2000000-0000-4000-8000-000000000001';
select is_empty(
  $$ select public_id from loyalty.commerce_connections where platform = 'merchant_activity' $$,
  'another tenant cannot see the activity source'
);
select throws_ok(
  $$ select count(*) from loyalty_private.commerce_delivery_inbox $$,
  '42501', null,
  'browser roles cannot inspect raw signed activity deliveries'
);
reset role;

select results_eq(
  $$ select count(*)::bigint from loyalty_private.canonical_commerce_events
     where event_type = 'commerce.activity.recorded'
       and (payload ? 'email' or payload ? 'name') $$,
  array[0::bigint],
  'canonical activity evidence contains no contact or profile fields'
);

select * from finish();
rollback;
