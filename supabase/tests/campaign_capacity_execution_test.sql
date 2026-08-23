begin;

create extension if not exists pgtap with schema extensions;

select plan(115);

select has_table(
  'loyalty_private', 'campaign_trigger_jobs',
  'canonical non-purchase campaign work has a private lease queue'
);
select has_table(
  'loyalty_private', 'campaign_trigger_job_attempts',
  'campaign trigger retries retain immutable bounded attempt evidence'
);
select has_table(
  'loyalty_private', 'campaign_trigger_executions',
  'campaign trigger outcomes retain immutable value and control evidence'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'loyalty_private.campaign_trigger_jobs'::regclass),
  'campaign trigger jobs have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'loyalty_private.campaign_trigger_job_attempts'::regclass),
  'campaign trigger attempts have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'loyalty_private.campaign_trigger_executions'::regclass),
  'campaign trigger executions have RLS enabled'
);
select has_trigger(
  'loyalty_private', 'campaign_trigger_jobs',
  'campaign_trigger_jobs_protect',
  'campaign trigger identity and lifecycle are protected'
);
select has_trigger(
  'loyalty_private', 'campaign_trigger_executions',
  'campaign_trigger_executions_immutable',
  'campaign trigger execution evidence cannot be rewritten'
);
select has_trigger(
  'loyalty', 'reward_reservations',
  'reward_reservations_settle_campaign_funding',
  'campaign-funded cancellation settles back to the control account'
);
select ok(
  has_function_privilege(
    'loyalty_worker',
    'loyalty_private.enqueue_due_limited_campaigns_v1(timestamp with time zone,integer)',
    'EXECUTE'
  ),
  'worker can materialize only bounded due limited campaign work'
);
select ok(
  has_function_privilege(
    'loyalty_worker',
    'loyalty_private.claim_due_campaign_trigger_jobs_v1(text,integer,integer)',
    'EXECUTE'
  ),
  'worker can claim bounded campaign trigger leases'
);
select ok(
  has_function_privilege(
    'loyalty_worker',
    'loyalty_private.execute_campaign_trigger_job_v1(uuid,text)',
    'EXECUTE'
  ),
  'worker can execute one owned campaign trigger lease'
);
select ok(
  has_function_privilege(
    'loyalty_worker',
    'loyalty_private.finish_campaign_trigger_job_v1(uuid,text,text,integer)',
    'EXECUTE'
  ),
  'worker can settle one failed campaign trigger lease'
);
select ok(
  not has_function_privilege(
    'loyalty_worker',
    'loyalty_private.enqueue_campaign_trigger_job_v1(bigint,bigint,bigint,text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,jsonb,timestamp with time zone)',
    'EXECUTE'
  ),
  'worker cannot choose canonical campaign trigger identity'
);
select ok(
  not has_function_privilege(
    'loyalty_worker',
    'loyalty_private.create_campaign_reward_reservation_v1(bigint,bigint,text)',
    'EXECUTE'
  ),
  'worker cannot directly fund a campaign reward reservation'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'loyalty_private.execute_campaign_trigger_job_v1(uuid,text)',
    'EXECUTE'
  ),
  'browser sessions cannot execute campaign value'
);
select ok(
  not has_table_privilege(
    'loyalty_worker', 'loyalty_private.campaign_trigger_jobs', 'SELECT'
  ),
  'worker cannot enumerate private campaign trigger jobs'
);
select ok(
  not has_table_privilege(
    'authenticated', 'loyalty_private.campaign_trigger_executions', 'SELECT'
  ),
  'browser sessions cannot enumerate private campaign execution evidence'
);

select has_table(
  'loyalty_private', 'campaign_capacity_counters',
  'campaign effect points and liability capacity has a private counter'
);
select has_table(
  'loyalty_private', 'campaign_execution_batches',
  'purchase campaign executions retain immutable replay evidence'
);
select has_table(
  'loyalty_private', 'campaign_effects',
  'campaign decisions retain ledger attribution'
);
select has_table(
  'loyalty_private', 'campaign_capacity_allocations',
  'non-purchase campaign capacity is reserved before fulfilment'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'loyalty_private.campaign_capacity_counters'::regclass),
  'campaign capacity counters have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'loyalty_private.campaign_execution_batches'::regclass),
  'campaign execution batches have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'loyalty_private.campaign_effects'::regclass),
  'campaign effects have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'loyalty_private.campaign_capacity_allocations'::regclass),
  'campaign allocations have RLS enabled'
);
select has_trigger(
  'loyalty_private', 'campaign_execution_batches',
  'campaign_execution_batches_immutable',
  'accepted execution evidence is immutable'
);
select has_trigger(
  'loyalty_private', 'campaign_effects', 'campaign_effects_immutable',
  'campaign effect evidence is immutable'
);
select has_trigger(
  'loyalty_private', 'campaign_capacity_counters',
  'campaign_capacity_counters_protect',
  'capacity counter identity cannot be replaced or deleted'
);
select has_trigger(
  'loyalty_private', 'campaign_capacity_allocations',
  'campaign_capacity_allocations_protect',
  'capacity allocations allow only reviewed terminal transitions'
);
select ok(
  has_function_privilege(
    'loyalty_worker',
    'loyalty_private.get_purchase_campaign_context_v1(bigint,bigint,bigint,bigint,timestamp with time zone,text)',
    'EXECUTE'
  ),
  'worker can request one serialized purchase campaign context'
);
select ok(
  has_function_privilege(
    'loyalty_worker',
    'loyalty_private.commit_purchase_campaign_execution_v1(bigint,bigint,bigint,bigint,bigint,text,text,text,bytea,bytea,jsonb,jsonb,text,bytea,bytea,jsonb,jsonb,jsonb,timestamp with time zone,timestamp with time zone)',
    'EXECUTE'
  ),
  'worker can enter the atomic purchase campaign boundary'
);
select ok(
  has_function_privilege(
    'loyalty_worker',
    'loyalty_private.reserve_campaign_capacity_v1(bigint,bigint,uuid,bigint,text,text,bytea,timestamp with time zone)',
    'EXECUTE'
  ),
  'worker can reserve non-purchase capacity through the narrow function'
);
select ok(
  has_function_privilege(
    'loyalty_worker',
    'loyalty_private.finish_campaign_capacity_v1(uuid,text,text)',
    'EXECUTE'
  ),
  'worker can reconcile a reserved allocation through the narrow function'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'loyalty_private.commit_purchase_campaign_execution_v1(bigint,bigint,bigint,bigint,bigint,text,text,text,bytea,bytea,jsonb,jsonb,text,bytea,bytea,jsonb,jsonb,jsonb,timestamp with time zone,timestamp with time zone)',
    'EXECUTE'
  ),
  'browser sessions cannot commit campaign value'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'loyalty_private.reserve_campaign_capacity_v1(bigint,bigint,uuid,bigint,text,text,bytea,timestamp with time zone)',
    'EXECUTE'
  ),
  'browser sessions cannot reserve campaign capacity'
);
select ok(
  not has_function_privilege(
    'loyalty_worker', 'loyalty_private.campaign_multiplier_points_v1(jsonb,integer)',
    'EXECUTE'
  ),
  'worker cannot call the independent multiplier verifier directly'
);
select ok(
  not has_table_privilege(
    'loyalty_worker', 'loyalty_private.campaign_capacity_counters', 'SELECT'
  ),
  'worker cannot enumerate private campaign counters'
);
select ok(
  not has_table_privilege(
    'loyalty_worker', 'loyalty_private.campaign_execution_batches', 'SELECT'
  ),
  'worker cannot enumerate private execution evidence'
);
select ok(
  not has_table_privilege(
    'loyalty_worker', 'loyalty_private.campaign_effects', 'SELECT'
  ),
  'worker cannot enumerate private campaign effects'
);
select ok(
  not has_table_privilege(
    'loyalty_worker', 'loyalty_private.campaign_capacity_allocations', 'SELECT'
  ),
  'worker cannot enumerate private capacity allocations'
);

insert into auth.users (id, email)
values ('8b000000-0000-4000-8000-000000000001',
  'm07-capacity-owner@example.test');

insert into loyalty.organizations (public_id, slug, name)
values ('8b000000-0000-4000-8000-000000000100',
  'm07-capacity', 'M07 Capacity');

insert into loyalty.organization_memberships (organization_id, user_id, role)
select organization.id, '8b000000-0000-4000-8000-000000000001', 'owner'
from loyalty.organizations as organization
where organization.slug = 'm07-capacity';

insert into loyalty.programme_groups (organization_id, slug, name)
select organization.id, 'rewards', 'M07 Capacity Rewards'
from loyalty.organizations as organization
where organization.slug = 'm07-capacity';

insert into loyalty.programmes (
  public_id, organization_id, programme_group_id, slug, name
)
select '8b000000-0000-4000-8000-000000000101', organization.id,
  programme_group.id, 'rewards', 'M07 Capacity Rewards'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
where organization.slug = 'm07-capacity';

insert into loyalty.workspaces (public_id, organization_id, slug, name)
select '8b000000-0000-4000-8000-000000000102', organization.id,
  'store', 'M07 Capacity Store'
from loyalty.organizations as organization
where organization.slug = 'm07-capacity';

insert into loyalty.commerce_connections (
  public_id, organization_id, workspace_id, platform, external_store_id,
  display_name, current_key_version, signing_material_ref, programme_id
)
select '8b000000-0000-4000-8000-000000000103', organization.id,
  workspace.id, 'woocommerce', 'm07-capacity-store', 'M07 Capacity Store',
  'v1', 'test://m07-capacity', programme.id
from loyalty.organizations as organization
join loyalty.workspaces as workspace
  on workspace.organization_id = organization.id
join loyalty.programmes as programme
  on programme.organization_id = organization.id
where organization.slug = 'm07-capacity';

insert into loyalty.customers (
  public_id, organization_id, display_reference, created_at, updated_at
)
select '8b000000-0000-4000-8000-000000000201', organization.id,
  'M07 capacity member', now() - interval '100 days', now()
from loyalty.organizations as organization
where organization.slug = 'm07-capacity';

insert into loyalty.wallets (
  public_id, organization_id, programme_group_id, customer_id
)
select '8b000000-0000-4000-8000-000000000202', customer.organization_id,
  programme_group.id, customer.id
from loyalty.customers as customer
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = customer.organization_id
where customer.public_id = '8b000000-0000-4000-8000-000000000201';

create function pg_temp.m07_capacity_programme()
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
    "rewards":[
      {"code":"five_euro","name":"Five euro reward","kind":"fixed_discount","costPoints":"100","configuration":{"version":"2","fulfilmentMode":"woocommerce_coupon","validityDays":30,"amountMinor":"500","currencyMinorUnitDigits":2,"availability":{"startsAt":null,"endsAt":null,"tierCodes":[],"segmentCodes":[],"perCustomerLimit":3,"globalQuantity":"3","pointsBudget":"300"},"restrictions":{"minimumSpendMinor":null,"productIds":[],"excludedProductIds":[],"categoryIds":[],"excludedCategoryIds":[],"excludeSaleItems":false,"stacking":"exclusive"}}}
    ],
    "earningRules":[
      {
        "code":"purchase-base","name":"Purchase base","source":"purchase",
        "enabled":true,"priority":0,"stackable":false,
        "effect":{"kind":"base_rate","pointsPerMajorUnit":"5"},
        "conditions":{"productIds":[],"categoryIds":[],"currencyCodes":[],"markets":[],"channels":[],"activityCodes":[],"segmentCodes":[],"tierCodes":[],"startsAt":null,"endsAt":null},
        "purchaseExclusions":{"productIds":[],"categoryIds":[],"shipping":true,"tax":true,"fees":true,"giftCardPayments":true,"storeCreditPayments":true,"discounts":true},
        "cap":{"perEventPoints":"1000","perMemberPoints":null,"memberPeriod":null,"rollingDays":null}
      },
      {
        "code":"programme-double","name":"Programme double","source":"purchase",
        "enabled":true,"priority":50,"stackable":false,
        "effect":{"kind":"multiplier","multiplierBasisPoints":20000},
        "conditions":{"productIds":[],"categoryIds":[],"currencyCodes":[],"markets":[],"channels":[],"activityCodes":[],"segmentCodes":[],"tierCodes":[],"startsAt":null,"endsAt":null},
        "purchaseExclusions":{"productIds":[],"categoryIds":[],"shipping":true,"tax":true,"fees":true,"giftCardPayments":true,"storeCreditPayments":true,"discounts":true},
        "cap":{"perEventPoints":null,"perMemberPoints":null,"memberPeriod":null,"rollingDays":null}
      }
    ]
  }'::jsonb;
$$;

select lives_ok(
  $$ select loyalty_private.set_deployment_mode(
    'managed', 1, 'test:m07-capacity', 'Exercise campaign execution gating',
    now() - interval '3 minutes'
  ) $$,
  'fixture enters managed mode through the append-only command'
);
select lives_ok(
  $$ select loyalty_private.set_organization_entitlement(
    '8b000000-0000-4000-8000-000000000100', 'programme.v2', 'enabled', null,
    'canary', 'test:m07-capacity', 'Enable V2 for campaign execution',
    now() - interval '2 minutes', null
  ) $$,
  'fixture enables ProgrammeDefinitionV2 for the canary organization'
);
select lives_ok(
  $$ select loyalty_private.set_organization_entitlement(
    '8b000000-0000-4000-8000-000000000100', 'campaigns', 'enabled', null,
    'canary', 'test:m07-capacity', 'Enable campaigns for execution proof',
    now() - interval '1 minute', null
  ) $$,
  'fixture enables campaigns for the canary organization'
);
select lives_ok(
  $$ select loyalty_private.set_organization_entitlement(
    '8b000000-0000-4000-8000-000000000100', 'rewards.expanded', 'enabled', null,
    'canary', 'test:m07-capacity', 'Enable V2 native campaign rewards',
    now() - interval '30 seconds', null
  ) $$,
  'fixture enables expanded native rewards for campaign-funded fulfilment'
);

set local role authenticated;
set local request.jwt.claim.sub = '8b000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select outcome from loyalty.create_programme_draft_command(
    '8b000000-0000-4000-8000-000000000101',
    pg_temp.m07_capacity_programme(), 'm07:capacity:programme:draft',
    '8b000000-0000-4000-8000-000000000301'
  ) $$,
  array['created'::text],
  'owner creates the V2 programme used by campaign execution'
);
select results_eq(
  $$ select outcome from loyalty.publish_programme_version_command(
    (select public_id from loyalty.programme_versions),
    (select pg_catalog.encode(configuration_sha256, 'hex')
     from loyalty.programme_versions),
    'm07:capacity:programme:publish',
    '8b000000-0000-4000-8000-000000000302'
  ) $$,
  array['created'::text],
  'owner publishes the exact reviewed V2 programme'
);
reset role;

insert into loyalty.programmes (
  public_id, organization_id, programme_group_id, slug, name
)
select '8b000000-0000-4000-8000-000000000104', organization.id,
  programme_group.id, 'other-rewards', 'Other same-group rewards'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
where organization.slug = 'm07-capacity';

set local role authenticated;
set local request.jwt.claim.sub = '8b000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select outcome from loyalty.create_programme_draft_command(
    '8b000000-0000-4000-8000-000000000104',
    pg_temp.m07_capacity_programme(), 'm07:capacity:other-programme:draft',
    '8b000000-0000-4000-8000-000000000303'
  ) $$,
  array['created'::text],
  'owner creates a second programme in the shared programme group'
);
select results_eq(
  $$ select outcome from loyalty.publish_programme_version_command(
    (select version.public_id
     from loyalty.programme_versions as version
     join loyalty.programmes as programme
       on programme.organization_id = version.organization_id
      and programme.id = version.programme_id
     where programme.public_id = '8b000000-0000-4000-8000-000000000104'),
    (select pg_catalog.encode(version.configuration_sha256, 'hex')
     from loyalty.programme_versions as version
     join loyalty.programmes as programme
       on programme.organization_id = version.organization_id
      and programme.id = version.programme_id
     where programme.public_id = '8b000000-0000-4000-8000-000000000104'),
    'm07:capacity:other-programme:publish',
    '8b000000-0000-4000-8000-000000000304'
  ) $$,
  array['created'::text],
  'owner publishes the same-group isolation fixture programme'
);
reset role;

create function pg_temp.m07_capacity_audience()
returns jsonb
language sql
immutable
as $$
  select '{
    "schemaVersion":"1","code":"all_members","name":"All members",
    "description":"","match":"all",
    "conditions":[{"kind":"metric","metric":"available_points","operator":"at_least","minimum":"0","maximum":null,"window":null,"activityCodes":[]}]
  }'::jsonb;
$$;

insert into loyalty.audiences (
  public_id, organization_id, programme_group_id, code, created_by_user_id
)
select '8b000000-0000-4000-8000-000000000401', organization.id,
  programme_group.id, 'all_members',
  '8b000000-0000-4000-8000-000000000001'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
where organization.slug = 'm07-capacity';

insert into loyalty.audience_versions (
  public_id, organization_id, programme_group_id, audience_id,
  version_number, status, definition, definition_sha256, created_by_user_id
)
select '8b000000-0000-4000-8000-000000000402', audience.organization_id,
  audience.programme_group_id, audience.id, 1, 'draft',
  pg_temp.m07_capacity_audience(), extensions.digest(pg_catalog.convert_to(
    pg_temp.m07_capacity_audience()::text, 'UTF8'
  ), 'sha256'), '8b000000-0000-4000-8000-000000000001'
from loyalty.audiences as audience
where audience.public_id = '8b000000-0000-4000-8000-000000000401';

update loyalty.audience_versions
set status = 'published',
  approved_by_user_id = '8b000000-0000-4000-8000-000000000001',
  published_at = now();

insert into loyalty.audience_snapshots (
  public_id, organization_id, programme_group_id, audience_version_id,
  state, snapshot_at, member_count, definition_sha256,
  created_by_user_id, completed_at
)
select '8b000000-0000-4000-8000-000000000403', version.organization_id,
  version.programme_group_id, version.id, 'complete', now(), 1,
  version.definition_sha256, version.created_by_user_id, now()
from loyalty.audience_versions as version
where version.public_id = '8b000000-0000-4000-8000-000000000402';

insert into loyalty_private.audience_snapshot_members (
  organization_id, programme_group_id, audience_snapshot_id,
  customer_id, wallet_id, evaluation
)
select snapshot.organization_id, snapshot.programme_group_id, snapshot.id,
  customer.id, wallet.id, '{"included":true}'::jsonb
from loyalty.audience_snapshots as snapshot
join loyalty.customers as customer
  on customer.organization_id = snapshot.organization_id
join loyalty.wallets as wallet
  on wallet.organization_id = customer.organization_id
 and wallet.customer_id = customer.id
where snapshot.public_id = '8b000000-0000-4000-8000-000000000403';

create function pg_temp.m07_campaign_definition(
  target_code text,
  target_behavior jsonb,
  target_capacity jsonb
)
returns jsonb
language sql
stable
as $$
  with schedule as (
    select pg_catalog.date_trunc(
      'second', pg_catalog.statement_timestamp() + interval '2 days'
    ) as starts_at,
    pg_catalog.date_trunc(
      'second', pg_catalog.statement_timestamp() + interval '3 days'
    ) as ends_at
  )
  select pg_catalog.jsonb_build_object(
    'schemaVersion', '1', 'code', target_code,
    'name', 'Campaign ' || target_code, 'description', '',
    'audienceSnapshotId', '8b000000-0000-4000-8000-000000000403',
    'exclusionSnapshotIds', pg_catalog.jsonb_build_array(),
    'schedule', pg_catalog.jsonb_build_object(
      'timezone', 'UTC',
      'startsAt', pg_catalog.to_char(starts_at at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS') || 'Z',
      'startsLocal', pg_catalog.to_char(starts_at at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS'),
      'endsAt', pg_catalog.to_char(ends_at at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS') || 'Z',
      'endsLocal', pg_catalog.to_char(ends_at at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS')
    ),
    'behavior', target_behavior, 'capacity', target_capacity,
    'controlBasisPoints', 0
  )
  from schedule;
$$;

create function pg_temp.m07_points_capacity(
  target_effect_limit text,
  target_points text
)
returns jsonb
language sql
immutable
as $$
  select pg_catalog.jsonb_build_object(
    'globalEffectLimit', target_effect_limit,
    'perMemberEffectLimit', 1,
    'maximumPoints', target_points,
    'maximumLiabilityMinor', null,
    'liabilityMinorPerEffect', null,
    'liabilityCurrencyCode', null,
    'liabilityMinorUnitDigits', null
  );
$$;

create function pg_temp.m07_liability_capacity()
returns jsonb
language sql
immutable
as $$
  select pg_catalog.jsonb_build_object(
    'globalEffectLimit', '1', 'perMemberEffectLimit', 1,
    'maximumPoints', null, 'maximumLiabilityMinor', '5000',
    'liabilityMinorPerEffect', '5000',
    'liabilityCurrencyCode', 'EUR', 'liabilityMinorUnitDigits', 2
  );
$$;

set local role authenticated;
set local request.jwt.claim.sub = '8b000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select outcome from loyalty.create_campaign_draft_command(
    '8b000000-0000-4000-8000-000000000101',
    pg_temp.m07_campaign_definition(
      'autumn_bonus',
      '{"kind":"bonus_points","earningRuleCodes":["purchase-base"],"reward":{"kind":"points","points":"10"}}'::jsonb,
      pg_temp.m07_points_capacity('1', '10')
    ), 'm07:capacity:campaign:bonus:draft',
    '8b000000-0000-4000-8000-000000000501'
  ) $$,
  array['created'::text],
  'owner creates a fixed bonus campaign'
);
select results_eq(
  $$ select outcome from loyalty.create_campaign_draft_command(
    '8b000000-0000-4000-8000-000000000101',
    pg_temp.m07_campaign_definition(
      'priority_multiplier',
      '{"kind":"purchase_multiplier","earningRuleCodes":["purchase-base"],"multiplierBasisPoints":30000,"priority":100}'::jsonb,
      pg_temp.m07_points_capacity('1', '100')
    ), 'm07:capacity:campaign:multiplier:draft',
    '8b000000-0000-4000-8000-000000000502'
  ) $$,
  array['created'::text],
  'owner creates a higher-priority purchase multiplier campaign'
);
select results_eq(
  $$ select outcome from loyalty.create_campaign_draft_command(
    '8b000000-0000-4000-8000-000000000101',
    pg_temp.m07_campaign_definition(
      'milestone_points',
      '{"kind":"milestone","metric":"order_count","threshold":"1","activityCodes":[],"reward":{"kind":"points","points":"25"}}'::jsonb,
      pg_temp.m07_points_capacity('1', '25')
    ), 'm07:capacity:campaign:milestone:draft',
    '8b000000-0000-4000-8000-000000000503'
  ) $$,
  array['created'::text],
  'owner creates a points allocation campaign'
);
select results_eq(
  $$ select outcome from loyalty.create_campaign_draft_command(
    '8b000000-0000-4000-8000-000000000101',
    pg_temp.m07_campaign_definition(
      'milestone_execution',
      '{"kind":"milestone","metric":"order_count","threshold":"1","activityCodes":[],"reward":{"kind":"points","points":"30"}}'::jsonb,
      pg_temp.m07_points_capacity('1', '30')
    ), 'm07:capacity:campaign:milestone-execution:draft',
    '8b000000-0000-4000-8000-000000000505'
  ) $$,
  array['created'::text],
  'owner creates a milestone campaign for atomic trigger execution'
);
select results_eq(
  $$ select outcome from loyalty.create_campaign_draft_command(
    '8b000000-0000-4000-8000-000000000101',
    pg_temp.m07_campaign_definition(
      'milestone_reward_execution',
      pg_catalog.jsonb_build_object(
        'kind', 'milestone', 'metric', 'order_count', 'threshold', '1',
        'activityCodes', pg_catalog.jsonb_build_array(),
        'reward', pg_catalog.jsonb_build_object(
          'kind', 'programme_reward', 'rewardId',
          (
            select reward.public_id
            from loyalty.programme_rewards reward
            join loyalty.programme_versions version
              on version.organization_id = reward.organization_id
             and version.id = reward.programme_version_id
            join loyalty.programmes programme
              on programme.organization_id = version.organization_id
             and programme.id = version.programme_id
            where reward.code = 'five_euro'
              and programme.public_id = '8b000000-0000-4000-8000-000000000101'
          )
        )
      ), pg_temp.m07_liability_capacity()
    ), 'm07:capacity:campaign:milestone-reward-execution:draft',
    '8b000000-0000-4000-8000-000000000506'
  ) $$,
  array['created'::text],
  'owner creates a native-reward milestone campaign'
);
select results_eq(
  $$ select outcome from loyalty.create_campaign_draft_command(
    '8b000000-0000-4000-8000-000000000101',
    pg_temp.m07_campaign_definition(
      'limited_reward',
      pg_catalog.jsonb_build_object(
        'kind', 'limited_quantity',
        'reward', pg_catalog.jsonb_build_object(
          'kind', 'programme_reward', 'rewardId',
          (
            select reward.public_id
            from loyalty.programme_rewards reward
            join loyalty.programme_versions version
              on version.organization_id = reward.organization_id
             and version.id = reward.programme_version_id
            join loyalty.programmes programme
              on programme.organization_id = version.organization_id
             and programme.id = version.programme_id
            where reward.code = 'five_euro'
              and programme.public_id = '8b000000-0000-4000-8000-000000000101'
          )
        )
      ),
      pg_temp.m07_liability_capacity()
    ), 'm07:capacity:campaign:limited:draft',
    '8b000000-0000-4000-8000-000000000504'
  ) $$,
  array['created'::text],
  'owner creates a liability-bounded limited reward campaign'
);
select results_eq(
  $$ select outcome from loyalty.create_campaign_draft_command(
    '8b000000-0000-4000-8000-000000000101',
    pg_temp.m07_campaign_definition(
      'limited_execution',
      pg_catalog.jsonb_build_object(
        'kind', 'limited_quantity',
        'reward', pg_catalog.jsonb_build_object(
          'kind', 'programme_reward', 'rewardId',
          (
            select reward.public_id
            from loyalty.programme_rewards reward
            join loyalty.programme_versions version
              on version.organization_id = reward.organization_id
             and version.id = reward.programme_version_id
            join loyalty.programmes programme
              on programme.organization_id = version.organization_id
             and programme.id = version.programme_id
            where reward.code = 'five_euro'
              and programme.public_id = '8b000000-0000-4000-8000-000000000101'
          )
        )
      ), pg_temp.m07_liability_capacity()
    ), 'm07:capacity:campaign:limited-execution:draft',
    '8b000000-0000-4000-8000-000000000507'
  ) $$,
  array['created'::text],
  'owner creates a limited native reward for scheduled execution'
);

select lives_ok(
  $$ select loyalty.approve_campaign_version_command(
    version.public_id, pg_catalog.encode(version.definition_sha256, 'hex'),
    'm07:capacity:approve:' || campaign.code,
    case campaign.code
      when 'autumn_bonus' then '8b000000-0000-4000-8000-000000000511'::uuid
      when 'priority_multiplier' then '8b000000-0000-4000-8000-000000000512'::uuid
      when 'milestone_points' then '8b000000-0000-4000-8000-000000000513'::uuid
      when 'limited_reward' then '8b000000-0000-4000-8000-000000000514'::uuid
      when 'milestone_execution' then '8b000000-0000-4000-8000-000000000515'::uuid
      when 'milestone_reward_execution' then '8b000000-0000-4000-8000-000000000516'::uuid
      else '8b000000-0000-4000-8000-000000000517'::uuid
    end
  )
  from loyalty.campaign_versions as version
  join loyalty.campaigns as campaign
    on campaign.organization_id = version.organization_id
   and campaign.id = version.campaign_id
  order by campaign.code $$,
  'all reviewed campaigns approve with immutable treatment assignments'
);
reset role;

create temporary table m07_capacity_refs (
  name text primary key,
  value bigint not null
);
insert into m07_capacity_refs
select 'organization', organization.id
from loyalty.organizations as organization
where organization.slug = 'm07-capacity'
union all
select 'group', programme_group.id
from loyalty.programme_groups as programme_group
join loyalty.organizations as organization
  on organization.id = programme_group.organization_id
where organization.slug = 'm07-capacity'
union all
select 'version', version.id
from loyalty.programme_versions as version
join loyalty.programmes as programme
  on programme.organization_id = version.organization_id
 and programme.id = version.programme_id
where version.status = 'published'
  and programme.public_id = '8b000000-0000-4000-8000-000000000101'
union all
select 'other_version', version.id
from loyalty.programme_versions as version
join loyalty.programmes as programme
  on programme.organization_id = version.organization_id
 and programme.id = version.programme_id
where version.status = 'published'
  and programme.public_id = '8b000000-0000-4000-8000-000000000104'
union all
select 'customer', customer.id
from loyalty.customers as customer
where customer.public_id = '8b000000-0000-4000-8000-000000000201'
union all
select 'wallet', wallet.id
from loyalty.wallets as wallet
join loyalty.customers as customer
  on customer.organization_id = wallet.organization_id
 and customer.id = wallet.customer_id
where customer.public_id = '8b000000-0000-4000-8000-000000000201';

create function pg_temp.m07_ref(target_name text)
returns bigint
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select value from pg_temp.m07_capacity_refs where name = target_name;
$$;
revoke all on function pg_temp.m07_ref(text) from public;
grant execute on function pg_temp.m07_ref(text) to loyalty_worker;

create function pg_temp.m07_campaign_ref(target_code text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select version.public_id
  from loyalty.campaign_versions as version
  join loyalty.campaigns as campaign
    on campaign.organization_id = version.organization_id
   and campaign.id = version.campaign_id
  where campaign.organization_id = pg_temp.m07_ref('organization')
    and campaign.code = target_code
    and version.status = 'scheduled';
$$;
revoke all on function pg_temp.m07_campaign_ref(text) from public;
grant execute on function pg_temp.m07_campaign_ref(text) to loyalty_worker;

create function pg_temp.m07_allocation_ref(target_idempotency_key text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select allocation.public_id
  from loyalty_private.campaign_capacity_allocations as allocation
  where allocation.organization_id = pg_temp.m07_ref('organization')
    and allocation.idempotency_key = target_idempotency_key;
$$;
revoke all on function pg_temp.m07_allocation_ref(text) from public;
grant execute on function pg_temp.m07_allocation_ref(text) to loyalty_worker;

create function pg_temp.m07_job_ref(target_code text, target_action text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select job.public_id
  from loyalty_private.campaign_trigger_jobs as job
  join loyalty.campaign_versions as version
    on version.organization_id = job.organization_id
   and version.id = job.campaign_version_id
  join loyalty.campaigns as campaign
    on campaign.organization_id = version.organization_id
   and campaign.id = version.campaign_id
  where campaign.organization_id = pg_temp.m07_ref('organization')
    and campaign.code = target_code and job.action = target_action
  order by job.id desc limit 1;
$$;
revoke all on function pg_temp.m07_job_ref(text, text) from public;
grant execute on function pg_temp.m07_job_ref(text, text) to loyalty_worker;

create function pg_temp.m07_event_time()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.max(version.starts_at) + interval '1 hour'
  from loyalty.campaign_versions as version
  where version.organization_id = (
    select organization.id from loyalty.organizations as organization
    where organization.slug = 'm07-capacity'
  );
$$;
revoke all on function pg_temp.m07_event_time() from public;
grant execute on function pg_temp.m07_event_time() to loyalty_worker;

insert into loyalty_private.commerce_delivery_inbox (
  organization_id, connection_id, source_delivery_id, envelope_version,
  source_event_id, event_type, source_object_id, occurred_at, delivered_at,
  key_version, nonce, body_sha256, raw_body, state, processed_at
)
select organization.id, connection.id, 'm07-capacity-delivery', '1',
  'm07-capacity-event', 'commerce.order.status_changed', 'order-1',
  pg_temp.m07_event_time(), pg_temp.m07_event_time(), 'v1',
  'm07-capacity-nonce', repeat('a', 64), '{}'::jsonb, 'applied',
  pg_temp.m07_event_time()
from loyalty.organizations as organization
join loyalty.commerce_connections as connection
  on connection.organization_id = organization.id
where organization.slug = 'm07-capacity';

insert into loyalty_private.canonical_commerce_events (
  public_id, organization_id, connection_id, delivery_inbox_id,
  source_event_id, normalization_version, event_type, source_object_id,
  occurred_at, payload
)
select '8b000000-0000-4000-8000-000000000601', inbox.organization_id,
  inbox.connection_id, inbox.id, 'm07-capacity-event', 'v1',
  'commerce.order.status_changed', 'order-1', pg_temp.m07_event_time(),
  '{}'::jsonb
from loyalty_private.commerce_delivery_inbox as inbox
where inbox.source_delivery_id = 'm07-capacity-delivery';

insert into loyalty.customer_identities (
  organization_id, customer_id, commerce_connection_id,
  external_customer_id, identity_kind, verified_at
)
select customer.organization_id, customer.id, connection.id,
  'registered:77', 'registered', pg_catalog.clock_timestamp()
from loyalty.customers as customer
join loyalty.commerce_connections as connection
  on connection.organization_id = customer.organization_id
where customer.public_id = '8b000000-0000-4000-8000-000000000201'
  and connection.public_id = '8b000000-0000-4000-8000-000000000103';

insert into m07_capacity_refs
select 'event', event.id
from loyalty_private.canonical_commerce_events as event
where event.public_id = '8b000000-0000-4000-8000-000000000601';

insert into loyalty_private.programme_evaluations (
  public_id, organization_id, programme_group_id, programme_version_id,
  canonical_event_id, evaluation_kind, subject_reference, idempotency_key,
  input_sha256, result_sha256, result, explanation, evaluated_at
)
select '8b000000-0000-4000-8000-000000000605',
  programme.organization_id, programme.programme_group_id, version.id,
  pg_temp.m07_ref('event'), 'live_award', 'woocommerce:other-programme:order:1',
  'm07:capacity:other-programme:evaluation',
  decode(repeat('c', 64), 'hex'), decode(repeat('d', 64), 'hex'),
  '{"version":"2","source":"purchase","awardedPoints":"1"}'::jsonb,
  '{"fixture":"same_group_programme_isolation"}'::jsonb,
  pg_temp.m07_event_time() - interval '1 day'
from loyalty.programmes as programme
join loyalty.programme_versions as version
  on version.organization_id = programme.organization_id
 and version.programme_id = programme.id
 and version.status = 'published'
where programme.public_id = '8b000000-0000-4000-8000-000000000104';

insert into loyalty_private.tier_qualification_facts (
  public_id, organization_id, programme_group_id,
  source_programme_version_id, customer_id, canonical_event_id,
  evaluation_id, fact_kind, source_reference,
  eligible_spend_minor_delta, earned_points_delta, order_count_delta,
  referral_count_delta, verified_action_count_delta, activity_code,
  effective_at, recorded_at
)
select '8b000000-0000-4000-8000-000000000606',
  evaluation.organization_id, evaluation.programme_group_id,
  evaluation.programme_version_id, pg_temp.m07_ref('customer'),
  evaluation.canonical_event_id, evaluation.id, 'purchase',
  'm07:capacity:other-programme:purchase', 100, 1, 1, 0, 0, null,
  evaluation.evaluated_at, evaluation.evaluated_at
from loyalty_private.programme_evaluations as evaluation
where evaluation.public_id = '8b000000-0000-4000-8000-000000000605';

select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.campaign_trigger_jobs $$,
  array[0::bigint],
  'same-group activity in another programme cannot cross this programme campaign milestones'
);

create function pg_temp.m07_baseline_result()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'version', '2', 'eventId', 'woocommerce:order:1', 'source', 'purchase',
    'eligibleSpendMinor', '100', 'awardedPoints', '10',
    'tierCodeSnapshot', 'rose',
    'pendingAt', pg_temp.m07_event_time(),
    'availableAt', pg_temp.m07_event_time() + interval '30 days',
    'expiresAt', pg_temp.m07_event_time() + interval '395 days',
    'selectedMultiplierRuleCode', 'programme-double',
    'contributions', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'ruleCode', 'purchase-base', 'effectKind', 'base_rate',
        'uncappedPoints', '5', 'awardedPoints', '5',
        'uncappedNumerator', '5000000', 'awardedNumerator', '5000000',
        'denominator', '1000000', 'capApplied', 'none'
      ),
      pg_catalog.jsonb_build_object(
        'ruleCode', 'programme-double', 'effectKind', 'multiplier',
        'uncappedPoints', '5', 'awardedPoints', '5',
        'uncappedNumerator', '5000000', 'awardedNumerator', '5000000',
        'denominator', '1000000', 'capApplied', 'none'
      )
    ),
    'lines', pg_catalog.jsonb_build_array()
  );
$$;

create function pg_temp.m07_programme_result()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_set(
    pg_catalog.jsonb_set(
      pg_catalog.jsonb_set(
        pg_temp.m07_baseline_result(), '{awardedPoints}', '"5"'::jsonb
      ), '{selectedMultiplierRuleCode}', 'null'::jsonb
    ), '{contributions}',
    pg_catalog.jsonb_build_array(
      pg_temp.m07_baseline_result() -> 'contributions' -> 0
    )
  );
$$;

create function pg_temp.m07_context(target_operation text)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'schemaVersion', '1',
    'campaignVersionId', context.campaign_version_public_id,
    'campaignCode', context.campaign_code,
    'assignment', context.assignment,
    'behavior', context.behavior,
    'remainingGlobalEffects', context.remaining_global_effects,
    'remainingMemberEffects', context.remaining_member_effects,
    'remainingPoints', context.remaining_points
  ) order by context.campaign_code, context.campaign_version_public_id),
  '[]'::jsonb)
  from loyalty_private.get_purchase_campaign_context_v1(
    pg_temp.m07_ref('organization'), pg_temp.m07_ref('group'),
    pg_temp.m07_ref('version'), pg_temp.m07_ref('customer'),
    pg_temp.m07_event_time(), target_operation
  ) as context;
$$;

create function pg_temp.m07_campaign_evaluation()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'schemaVersion', '1',
    'selectedCampaignMultiplierVersionId', multiplier.public_id,
    'suppressedProgrammeMultiplierRuleCode', 'programme-double',
    'totalCampaignPoints', '20',
    'decisions', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'campaignVersionId', bonus.public_id,
        'campaignCode', 'autumn_bonus', 'assignment', 'treatment',
        'effectKind', 'bonus_points',
        'matchedRuleCodes', pg_catalog.jsonb_build_array('purchase-base'),
        'priority', null, 'points', '10', 'outcome', 'awarded'
      ),
      pg_catalog.jsonb_build_object(
        'campaignVersionId', multiplier.public_id,
        'campaignCode', 'priority_multiplier', 'assignment', 'treatment',
        'effectKind', 'purchase_multiplier',
        'matchedRuleCodes', pg_catalog.jsonb_build_array('purchase-base'),
        'priority', 100, 'points', '10', 'outcome', 'awarded'
      )
    )
  )
  from loyalty.campaign_versions as bonus
  join loyalty.campaigns as bonus_campaign
    on bonus_campaign.organization_id = bonus.organization_id
   and bonus_campaign.id = bonus.campaign_id
   and bonus_campaign.code = 'autumn_bonus'
  join loyalty.campaign_versions as multiplier
    on multiplier.organization_id = bonus.organization_id
  join loyalty.campaigns as multiplier_campaign
    on multiplier_campaign.organization_id = multiplier.organization_id
   and multiplier_campaign.id = multiplier.campaign_id
   and multiplier_campaign.code = 'priority_multiplier';
$$;

grant execute on function pg_temp.m07_event_time(),
  pg_temp.m07_baseline_result(), pg_temp.m07_programme_result(),
  pg_temp.m07_context(text), pg_temp.m07_campaign_evaluation()
  to loyalty_worker;

grant loyalty_worker to current_user;
grant usage on schema extensions to loyalty_worker;
grant execute on all functions in schema extensions to loyalty_worker;
set local role loyalty_worker;

select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.get_purchase_campaign_context_v1(
       pg_temp.m07_ref('organization'), pg_temp.m07_ref('group'),
       pg_temp.m07_ref('other_version'), pg_temp.m07_ref('customer'),
       pg_temp.m07_event_time(), 'connection:other-programme:order:1'
     ) $$,
  array[0::bigint],
  'purchase context excludes campaigns owned by another same-group programme'
);

select results_eq(
  $$ select pg_catalog.jsonb_array_length(pg_temp.m07_context(
    'connection:1:order:1'
  )) $$,
  array[2::integer],
  'purchase context contains the two treatment campaigns only'
);
select results_eq(
  $$ select item ->> 'remainingGlobalEffects'
     from pg_catalog.jsonb_array_elements(
       pg_temp.m07_context('connection:1:order:1')
     ) as item order by item ->> 'campaignCode' $$,
  $$ values ('1'::text), ('1'::text) $$,
  'initial context exposes exact serialized global headroom'
);
select results_eq(
  $$ select outcome, campaign_points
     from loyalty_private.commit_purchase_campaign_execution_v1(
       pg_temp.m07_ref('organization'), pg_temp.m07_ref('group'),
       pg_temp.m07_ref('version'), pg_temp.m07_ref('event'),
       pg_temp.m07_ref('customer'), 'woocommerce:order:1',
       'm07:capacity:programme:evaluation', 'm07:capacity:programme:award',
       decode(repeat('1',64),'hex'), decode(repeat('2',64),'hex'),
       pg_temp.m07_programme_result(),
       '{"lines":[],"tierMultiplierBasisPoints":10000}'::jsonb,
       'connection:1:order:1', decode(repeat('3',64),'hex'),
       decode(repeat('4',64),'hex'),
       pg_temp.m07_context('connection:1:order:1'),
       pg_temp.m07_baseline_result(), pg_temp.m07_campaign_evaluation(),
       pg_temp.m07_event_time(), pg_temp.m07_event_time() + interval '1 second'
     ) $$,
  $$ values ('created'::text, '20'::text) $$,
  'one transaction commits programme base points and both campaign effects'
);
reset role;

select results_eq(
  $$ select count(*)::bigint from loyalty_private.campaign_execution_batches $$,
  array[1::bigint],
  'one immutable campaign execution batch is stored'
);
select results_eq(
  $$ select count(*)::bigint from loyalty_private.campaign_effects $$,
  array[2::bigint],
  'one immutable effect exists for each matched campaign'
);
select results_eq(
  $$ select effect_kind, points
     from loyalty_private.campaign_effects order by effect_kind $$,
  $$ values ('bonus_points'::text, 10::bigint),
            ('purchase_multiplier'::text, 10::bigint) $$,
  'campaign effects retain exact fixed and selected multiplier points'
);
select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.campaign_effects as effect
     join loyalty.ledger_transactions as transaction
       on transaction.organization_id = effect.organization_id
      and transaction.id = effect.award_transaction_id
     join loyalty.ledger_entries as entry
       on entry.organization_id = effect.organization_id
      and entry.id = effect.award_origin_entry_id
      and entry.transaction_id = transaction.id
     where effect.state = 'committed' and entry.points = effect.points $$,
  array[2::bigint],
  'every campaign effect points to its exact immutable award entry'
);
select results_eq(
  $$ select count(distinct transaction.source_reference)::bigint
     from loyalty_private.campaign_effects as effect
     join loyalty.ledger_transactions as transaction
       on transaction.organization_id = effect.organization_id
      and transaction.id = effect.award_transaction_id
     where transaction.source_event_id = pg_temp.m07_ref('event')
       and transaction.source_reference like 'campaign:%:operation:%' $$,
  array[2::bigint],
  'campaign awards use bounded campaign-specific source identities'
);
select results_eq(
  $$ select balance.points
     from loyalty.wallet_balances as balance
     where balance.organization_id = pg_temp.m07_ref('organization')
       and balance.wallet_id = pg_temp.m07_ref('wallet')
       and balance.account_kind = 'pending' $$,
  array[25::bigint],
  'wallet pending balance reconciles five programme plus 20 campaign points'
);
select results_eq(
  $$ select campaign.code, counter.reserved_effects,
       counter.committed_effects, counter.reserved_points,
       counter.committed_points
     from loyalty_private.campaign_capacity_counters as counter
     join loyalty.campaign_versions as version
       on version.organization_id = counter.organization_id
      and version.id = counter.campaign_version_id
     join loyalty.campaigns as campaign
       on campaign.organization_id = version.organization_id
      and campaign.id = version.campaign_id
     where campaign.code in ('autumn_bonus', 'priority_multiplier')
     order by campaign.code $$,
  $$ values ('autumn_bonus'::text, 0::bigint, 1::bigint, 0::bigint, 10::bigint),
            ('priority_multiplier'::text, 0::bigint, 1::bigint, 0::bigint, 10::bigint) $$,
  'serialized counters reconcile every committed purchase campaign effect'
);

set local role loyalty_worker;
select results_eq(
  $$ select item ->> 'remainingGlobalEffects'
     from pg_catalog.jsonb_array_elements(
       pg_temp.m07_context('connection:1:order:1')
     ) as item order by item ->> 'campaignCode' $$,
  $$ values ('1'::text), ('1'::text) $$,
  'exact retry replays the original context after capacity is consumed'
);
select results_eq(
  $$ select outcome, campaign_points
     from loyalty_private.commit_purchase_campaign_execution_v1(
       pg_temp.m07_ref('organization'), pg_temp.m07_ref('group'),
       pg_temp.m07_ref('version'), pg_temp.m07_ref('event'),
       pg_temp.m07_ref('customer'), 'woocommerce:order:1',
       'm07:capacity:programme:evaluation', 'm07:capacity:programme:award',
       decode(repeat('1',64),'hex'), decode(repeat('2',64),'hex'),
       pg_temp.m07_programme_result(),
       '{"lines":[],"tierMultiplierBasisPoints":10000}'::jsonb,
       'connection:1:order:1', decode(repeat('3',64),'hex'),
       decode(repeat('4',64),'hex'),
       pg_temp.m07_context('connection:1:order:1'),
       pg_temp.m07_baseline_result(), pg_temp.m07_campaign_evaluation(),
       pg_temp.m07_event_time(), pg_temp.m07_event_time() + interval '1 second'
     ) $$,
  $$ values ('duplicate'::text, '20'::text) $$,
  'exact execution retry returns the original accepted result'
);
select throws_ok(
  $$ select * from loyalty_private.commit_purchase_campaign_execution_v1(
       pg_temp.m07_ref('organization'), pg_temp.m07_ref('group'),
       pg_temp.m07_ref('version'), pg_temp.m07_ref('event'),
       pg_temp.m07_ref('customer'), 'woocommerce:order:1',
       'm07:capacity:programme:evaluation', 'm07:capacity:programme:award',
       decode(repeat('1',64),'hex'), decode(repeat('2',64),'hex'),
       pg_temp.m07_programme_result(),
       '{"lines":[],"tierMultiplierBasisPoints":10000}'::jsonb,
       'connection:1:order:1', decode(repeat('f',64),'hex'),
       decode(repeat('4',64),'hex'),
       pg_temp.m07_context('connection:1:order:1'),
       pg_temp.m07_baseline_result(), pg_temp.m07_campaign_evaluation(),
       pg_temp.m07_event_time(), pg_temp.m07_event_time() + interval '1 second'
     ) $$,
  '23514', 'campaign execution idempotency conflict',
  'changed retry evidence fails without another value effect'
);
select results_eq(
  $$ select item ->> 'remainingGlobalEffects'
     from pg_catalog.jsonb_array_elements(
       pg_temp.m07_context('connection:1:order:2')
     ) as item order by item ->> 'campaignCode' $$,
  $$ values ('0'::text), ('0'::text) $$,
  'a new operation sees both hard campaign effect limits exhausted'
);
reset role;

select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_transactions
     where transaction_kind = 'award' $$,
  array[3::bigint],
  'retry and conflict paths create no duplicate programme or campaign award'
);
select throws_ok(
  $$ update loyalty_private.campaign_effects set points = points + 1 $$,
  '55000', 'immutable loyalty history cannot be changed',
  'campaign effect history cannot be rewritten'
);
select throws_ok(
  $$ delete from loyalty_private.campaign_execution_batches $$,
  '55000', 'immutable loyalty history cannot be changed',
  'campaign execution history cannot be deleted'
);

select results_eq(
  $$ select count(*)::bigint
     from loyalty.campaigns as campaign
     join loyalty.programmes as programme
       on programme.organization_id = campaign.organization_id
      and programme.programme_group_id = campaign.programme_group_id
      and programme.id = campaign.programme_id
     where campaign.organization_id = pg_temp.m07_ref('organization') $$,
  array[7::bigint],
  'every stable campaign is bound to the exact authenticated programme'
);
select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.campaign_trigger_jobs as job
     join loyalty.campaign_versions as version
       on version.organization_id = job.organization_id
      and version.id = job.campaign_version_id
     where job.trigger_kind = 'milestone' and job.action = 'issue' $$,
  array[3::bigint],
  'one canonical purchase fact enqueues each matching milestone exactly once'
);

set local role loyalty_worker;
select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.claim_due_campaign_trigger_jobs_v1(
       'campaign-test-worker', 25, 60
     ) $$,
  array[3::bigint],
  'worker claims the three canonical milestone jobs in one bounded lease batch'
);
select results_eq(
  $$ select outcome, allocation_id is not null,
       transaction_id is not null, reward_reservation_id is null
     from loyalty_private.execute_campaign_trigger_job_v1(
       pg_temp.m07_job_ref('milestone_execution', 'issue'),
       'campaign-test-worker'
     ) $$,
  $$ values ('points_awarded'::text, true, true, true) $$,
  'milestone points reserve capacity and commit attributable released value atomically'
);
select results_eq(
  $$ select outcome, allocation_id is not null,
       transaction_id is null, reward_reservation_id is not null
     from loyalty_private.execute_campaign_trigger_job_v1(
       pg_temp.m07_job_ref('milestone_reward_execution', 'issue'),
       'campaign-test-worker'
     ) $$,
  $$ values ('reward_reserved'::text, true, true, true) $$,
  'milestone native reward reserves campaign funding and enqueues fulfilment atomically'
);
select results_eq(
  $$ select state, outcome
     from loyalty_private.finish_campaign_trigger_job_v1(
       pg_temp.m07_job_ref('milestone_points', 'issue'),
       'campaign-test-worker', 'fixture_deferred', 60
     ) $$,
  $$ values ('retryable'::text, 'retryable'::text) $$,
  'a deferred canonical trigger releases its lease without consuming capacity'
);
reset role;

select results_eq(
  $$ select
       (select points from loyalty.wallet_balances
        where organization_id = pg_temp.m07_ref('organization')
          and wallet_id = pg_temp.m07_ref('wallet')
          and account_kind = 'available'),
       (select points from loyalty.wallet_balances
        where organization_id = pg_temp.m07_ref('organization')
          and wallet_id = pg_temp.m07_ref('wallet')
          and account_kind = 'reserved'),
       (select count(*)::bigint from loyalty.reward_reservations
        where funding_kind = 'campaign' and state = 'reserved'),
       (select count(*)::bigint
        from loyalty_private.campaign_trigger_executions) $$,
  $$ values (30::bigint, 100::bigint, 1::bigint, 2::bigint) $$,
  'campaign-funded reward changes reserved only while points reward is released to available'
);

insert into loyalty_private.commerce_delivery_inbox (
  organization_id, connection_id, source_delivery_id, envelope_version,
  source_event_id, event_type, source_object_id, occurred_at, delivered_at,
  key_version, nonce, body_sha256, raw_body, state, processed_at
)
select organization.id, connection.id, 'm07-capacity-refund-delivery', '1',
  'm07-capacity-refund-event', 'commerce.order.refunded', 'order-1',
  pg_temp.m07_event_time() + interval '2 hours',
  pg_temp.m07_event_time() + interval '2 hours', 'v1',
  'm07-capacity-refund-nonce', repeat('b', 64), '{}'::jsonb, 'applied',
  pg_temp.m07_event_time() + interval '2 hours'
from loyalty.organizations as organization
join loyalty.commerce_connections as connection
  on connection.organization_id = organization.id
where organization.slug = 'm07-capacity';

insert into loyalty_private.canonical_commerce_events (
  public_id, organization_id, connection_id, delivery_inbox_id,
  source_event_id, normalization_version, event_type, source_object_id,
  occurred_at, payload
)
select '8b000000-0000-4000-8000-000000000602', inbox.organization_id,
  inbox.connection_id, inbox.id, 'm07-capacity-refund-event', 'v1',
  'commerce.order.refunded', 'order-1',
  pg_temp.m07_event_time() + interval '2 hours', '{}'::jsonb
from loyalty_private.commerce_delivery_inbox as inbox
where inbox.source_delivery_id = 'm07-capacity-refund-delivery';

insert into loyalty_private.programme_evaluations (
  public_id, organization_id, programme_group_id, programme_version_id,
  canonical_event_id, evaluation_kind, subject_reference, idempotency_key,
  input_sha256, result_sha256, result, explanation, evaluated_at
)
select '8b000000-0000-4000-8000-000000000603',
  pg_temp.m07_ref('organization'), pg_temp.m07_ref('group'),
  pg_temp.m07_ref('version'), event.id, 'live_refund',
  'woocommerce:order:1:refund:1', 'm07:capacity:refund:evaluation',
  decode(repeat('a', 64), 'hex'), decode(repeat('b', 64), 'hex'),
  '{"version":"2","source":"refund","reversalPoints":"5"}'::jsonb,
  '{"rule":"cumulative_refund"}'::jsonb,
  pg_temp.m07_event_time() + interval '2 hours'
from loyalty_private.canonical_commerce_events as event
where event.public_id = '8b000000-0000-4000-8000-000000000602';

insert into loyalty_private.tier_qualification_facts (
  public_id, organization_id, programme_group_id,
  source_programme_version_id, customer_id, canonical_event_id,
  evaluation_id, origin_fact_id, fact_kind, source_reference,
  eligible_spend_minor_delta, earned_points_delta, order_count_delta,
  referral_count_delta, verified_action_count_delta, activity_code,
  effective_at, recorded_at
)
select '8b000000-0000-4000-8000-000000000604',
  original.organization_id, original.programme_group_id,
  original.source_programme_version_id, original.customer_id, event.id,
  evaluation.id, original.id, 'refund',
  'campaign-test-refund:' || event.public_id::text,
  -original.eligible_spend_minor_delta, -original.earned_points_delta, -1,
  0, 0, null, event.occurred_at, event.occurred_at
from loyalty_private.tier_qualification_facts as original
join loyalty_private.canonical_commerce_events as event
  on event.public_id = '8b000000-0000-4000-8000-000000000602'
join loyalty_private.programme_evaluations as evaluation
  on evaluation.public_id = '8b000000-0000-4000-8000-000000000603'
where original.organization_id = pg_temp.m07_ref('organization')
  and original.source_programme_version_id = pg_temp.m07_ref('version')
  and original.fact_kind = 'purchase';

select results_eq(
  $$ select state, count(*)::bigint
     from loyalty_private.campaign_trigger_jobs as job
     join loyalty.campaign_versions as version
       on version.organization_id = job.organization_id
      and version.id = job.campaign_version_id
     join loyalty.campaigns as campaign
       on campaign.organization_id = version.organization_id
      and campaign.id = version.campaign_id
     where campaign.code in (
       'milestone_points', 'milestone_execution',
       'milestone_reward_execution'
     ) and (job.action = 'reverse' or campaign.code = 'milestone_points')
     group by state order by state $$,
  $$ values ('cancelled'::text, 1::bigint),
            ('pending'::text, 2::bigint) $$,
  'refund cancels unaccepted work and enqueues one compensation per accepted effect'
);

set local role loyalty_worker;
select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.claim_due_campaign_trigger_jobs_v1(
       'campaign-test-worker', 25, 60
     ) $$,
  array[2::bigint],
  'worker claims only the two refund compensation jobs'
);
select results_eq(
  $$ select outcome, transaction_id is not null
     from loyalty_private.execute_campaign_trigger_job_v1(
       pg_temp.m07_job_ref('milestone_execution', 'reverse'),
       'campaign-test-worker'
     ) $$,
  $$ values ('points_reversed'::text, true) $$,
  'refund appends one full immutable reversal of campaign points'
);
select results_eq(
  $$ select outcome, reward_reservation_id is not null
     from loyalty_private.execute_campaign_trigger_job_v1(
       pg_temp.m07_job_ref('milestone_reward_execution', 'reverse'),
       'campaign-test-worker'
     ) $$,
  $$ values ('reward_already_resolved'::text, true) $$,
  'undelivered native reward is cancelled and campaign funding is compensated atomically'
);
reset role;

select results_eq(
  $$ select
       (select points from loyalty.wallet_balances
        where organization_id = pg_temp.m07_ref('organization')
          and wallet_id = pg_temp.m07_ref('wallet')
          and account_kind = 'available'),
       (select points from loyalty.wallet_balances
        where organization_id = pg_temp.m07_ref('organization')
          and wallet_id = pg_temp.m07_ref('wallet')
          and account_kind = 'reserved'),
       (select coalesce(pg_catalog.sum(entry.points), 0::numeric)::bigint
        from loyalty.ledger_entries as entry
        join loyalty.ledger_accounts as account
          on account.organization_id = entry.organization_id
         and account.programme_group_id = entry.programme_group_id
         and account.id = entry.account_id
        where account.organization_id = pg_temp.m07_ref('organization')
          and account.wallet_id is null
          and account.account_kind = 'adjustment'),
       (select state from loyalty.reward_reservations
        where funding_kind = 'campaign' order by id limit 1),
       (select state from loyalty_private.transactional_outbox
        where topic = 'woocommerce.coupon.issue' order by id limit 1) $$,
  $$ values (0::bigint, 0::bigint, 0::bigint,
             'released'::text, 'cancelled'::text) $$,
  'refund leaves member available and reserved neutral and returns funding to the control account'
);

set local role loyalty_worker;
select results_eq(
  $$ select outcome
     from loyalty_private.execute_campaign_trigger_job_v1(
       pg_temp.m07_job_ref('milestone_execution', 'reverse'),
       'campaign-test-worker'
     ) $$,
  array['duplicate'::text],
  'exact reversal retry returns immutable evidence without another compensation'
);
select results_eq(
  $$ select loyalty_private.enqueue_due_limited_campaigns_v1(
       pg_temp.m07_event_time(), 100
     ) $$,
  array[2::bigint],
  'schedule-open sweep materializes one job per limited campaign assignment'
);
select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.claim_due_campaign_trigger_jobs_v1(
       'campaign-test-worker', 25, 60
     ) $$,
  array[2::bigint],
  'limited campaign jobs use the same bounded lease queue'
);
select results_eq(
  $$ select outcome, reward_reservation_id is not null
     from loyalty_private.execute_campaign_trigger_job_v1(
       pg_temp.m07_job_ref('limited_execution', 'issue'),
       'campaign-test-worker'
     ) $$,
  $$ values ('reward_reserved'::text, true) $$,
  'limited campaign atomically reserves quantity liability reward funding and native fulfilment'
);
select results_eq(
  $$ select state
     from loyalty_private.finish_campaign_trigger_job_v1(
       pg_temp.m07_job_ref('limited_reward', 'issue'),
       'campaign-test-worker', 'fixture_deferred', 60
     ) $$,
  array['retryable'::text],
  'unexecuted limited work releases its lease without reserving value'
);
reset role;

select results_eq(
  $$ select
       (select points from loyalty.wallet_balances
        where organization_id = pg_temp.m07_ref('organization')
          and wallet_id = pg_temp.m07_ref('wallet')
          and account_kind = 'available'),
       (select points from loyalty.wallet_balances
        where organization_id = pg_temp.m07_ref('organization')
          and wallet_id = pg_temp.m07_ref('wallet')
          and account_kind = 'reserved'),
       (select count(*)::bigint from loyalty.reward_reservations
        where funding_kind = 'campaign' and state = 'reserved'),
       (select counter.committed_liability_minor
        from loyalty_private.campaign_capacity_counters as counter
        join loyalty.campaign_versions as version
          on version.organization_id = counter.organization_id
         and version.id = counter.campaign_version_id
        join loyalty.campaigns as campaign
          on campaign.organization_id = version.organization_id
         and campaign.id = version.campaign_id
        where campaign.code = 'limited_execution') $$,
  $$ values (0::bigint, 100::bigint, 1::bigint, 5000::bigint) $$,
  'limited native grant is member-balance neutral and reconciles committed liability'
);

insert into loyalty_private.campaign_trigger_jobs (
  public_id, organization_id, programme_group_id, programme_version_id,
  campaign_version_id, customer_id, wallet_id, assignment, trigger_kind,
  action, source_reference, qualification_fact_id, tier_decision_id,
  referral_issuance_id, referral_compensation_id, campaign_assignment_id,
  canonical_event_id, origin_job_id, canonical_evidence,
  canonical_evidence_sha256, occurred_at, state, attempt_count,
  next_attempt_at, lease_owner, lease_expires_at, created_at, updated_at
)
select case fixture.ordinal
    when 1 then '8b000000-0000-4000-8000-000000000607'::uuid
    else '8b000000-0000-4000-8000-000000000608'::uuid end,
  job.organization_id, job.programme_group_id, job.programme_version_id,
  job.campaign_version_id, job.customer_id, job.wallet_id, job.assignment,
  job.trigger_kind, job.action,
  job.source_reference || ':expired-lease:' || fixture.ordinal::text,
  job.qualification_fact_id, job.tier_decision_id,
  job.referral_issuance_id, job.referral_compensation_id,
  job.campaign_assignment_id, job.canonical_event_id, job.origin_job_id,
  job.canonical_evidence, job.canonical_evidence_sha256, job.occurred_at,
  'processing', 9, pg_catalog.clock_timestamp(), 'expired-fixture',
  pg_catalog.clock_timestamp() - interval '1 minute',
  pg_catalog.clock_timestamp() - interval '2 minutes',
  pg_catalog.clock_timestamp() - interval '1 minute'
from loyalty_private.campaign_trigger_jobs as job
cross join pg_catalog.generate_series(1, 2) as fixture(ordinal)
where job.public_id = pg_temp.m07_job_ref('limited_execution', 'issue');

set local role loyalty_worker;
select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.claim_due_campaign_trigger_jobs_v1(
       'campaign-lease-recovery', 1, 60
     ) $$,
  array[1::bigint],
  'lease recovery and the following claim remain bounded to one job'
);
select results_eq(
  $$ select lease_owner, count(*)::bigint
     from loyalty_private.campaign_trigger_jobs
     where public_id in (
       '8b000000-0000-4000-8000-000000000607',
       '8b000000-0000-4000-8000-000000000608'
     ) group by lease_owner order by lease_owner $$,
  $$ values ('campaign-lease-recovery'::text, 1::bigint),
            ('expired-fixture'::text, 1::bigint) $$,
  'one expired lease remains untouched outside the bounded recovery batch'
);
select results_eq(
  $$ select state from loyalty_private.finish_campaign_trigger_job_v1(
       '8b000000-0000-4000-8000-000000000607',
       'campaign-lease-recovery', 'fixture_retry_exhausted', 60
     ) $$,
  array['manual_review'::text],
  'the tenth failed claim stops at manual review'
);
select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.claim_due_campaign_trigger_jobs_v1(
       'campaign-lease-recovery', 1, 60
     ) $$,
  array[1::bigint],
  'the next bounded claim recovers only the remaining expired lease'
);
select results_eq(
  $$ select state from loyalty_private.finish_campaign_trigger_job_v1(
       '8b000000-0000-4000-8000-000000000608',
       'campaign-lease-recovery', 'fixture_retry_exhausted', 60
     ) $$,
  array['manual_review'::text],
  'each independently exhausted lease stops without an eleventh claim'
);
reset role;

select results_eq(
  $$ select attempt.outcome, count(*)::bigint
     from loyalty_private.campaign_trigger_job_attempts as attempt
     join loyalty_private.campaign_trigger_jobs as job
       on job.organization_id = attempt.organization_id
      and job.id = attempt.job_id
     where job.public_id in (
       '8b000000-0000-4000-8000-000000000607',
       '8b000000-0000-4000-8000-000000000608'
     ) group by attempt.outcome order by attempt.outcome $$,
  $$ values ('lease_expired'::text, 2::bigint),
            ('manual_review'::text, 2::bigint) $$,
  'only won lease transitions append expiry and terminal attempt evidence'
);
select throws_ok(
  $$ update loyalty_private.campaign_trigger_jobs
     set source_reference = source_reference || ':changed' $$,
  '55000', 'campaign trigger job identity is immutable',
  'canonical trigger identity cannot be rewritten'
);

set local role loyalty_worker;
select results_eq(
  $$ select outcome, points, liability_minor
     from loyalty_private.reserve_campaign_capacity_v1(
       pg_temp.m07_ref('organization'), pg_temp.m07_ref('group'),
       pg_temp.m07_campaign_ref('milestone_points'),
       pg_temp.m07_ref('customer'), 'milestone:order:1',
       'm07:capacity:allocation:milestone:1',
       decode(repeat('5',64),'hex'), pg_temp.m07_event_time()
     ) $$,
  $$ values ('created'::text, '25'::text, '0'::text) $$,
  'points campaign reserves its exact value before fulfilment'
);
select results_eq(
  $$ select outcome from loyalty_private.reserve_campaign_capacity_v1(
       pg_temp.m07_ref('organization'), pg_temp.m07_ref('group'),
       pg_temp.m07_campaign_ref('milestone_points'),
       pg_temp.m07_ref('customer'), 'milestone:order:2',
       'm07:capacity:allocation:milestone:2',
       decode(repeat('6',64),'hex'), pg_temp.m07_event_time()
     ) $$,
  array['capacity_exhausted'::text],
  'member and global ceilings reject a competing points reservation'
);
select results_eq(
  $$ select outcome, state from loyalty_private.finish_campaign_capacity_v1(
       pg_temp.m07_allocation_ref('m07:capacity:allocation:milestone:1'),
       'released', 'trigger-not-qualified'
     ) $$,
  $$ values ('created'::text, 'released'::text) $$,
  'failed fulfilment releases its exact reserved points capacity'
);
select results_eq(
  $$ select outcome from loyalty_private.reserve_campaign_capacity_v1(
       pg_temp.m07_ref('organization'), pg_temp.m07_ref('group'),
       pg_temp.m07_campaign_ref('milestone_points'),
       pg_temp.m07_ref('customer'), 'milestone:order:2',
       'm07:capacity:allocation:milestone:2',
       decode(repeat('6',64),'hex'), pg_temp.m07_event_time()
     ) $$,
  array['created'::text],
  'released capacity becomes available to the next idempotent source fact'
);
select results_eq(
  $$ select outcome, state from loyalty_private.finish_campaign_capacity_v1(
       pg_temp.m07_allocation_ref('m07:capacity:allocation:milestone:2'),
       'committed', 'ledger-transaction:test-milestone'
     ) $$,
  $$ values ('created'::text, 'committed'::text) $$,
  'successful fulfilment converts reserved points capacity to committed'
);
select results_eq(
  $$ select outcome, state from loyalty_private.finish_campaign_capacity_v1(
       pg_temp.m07_allocation_ref('m07:capacity:allocation:milestone:2'),
       'committed', 'ledger-transaction:test-milestone'
     ) $$,
  $$ values ('duplicate'::text, 'committed'::text) $$,
  'exact allocation completion retry is idempotent'
);
select results_eq(
  $$ select outcome, points, liability_minor
     from loyalty_private.reserve_campaign_capacity_v1(
       pg_temp.m07_ref('organization'), pg_temp.m07_ref('group'),
       pg_temp.m07_campaign_ref('limited_reward'),
       pg_temp.m07_ref('customer'), 'limited:reward:1',
       'm07:capacity:allocation:limited:1',
       decode(repeat('7',64),'hex'), pg_temp.m07_event_time()
     ) $$,
  $$ values ('created'::text, '0'::text, '5000'::text) $$,
  'limited reward reserves its exact approved monetary liability'
);
select results_eq(
  $$ select outcome from loyalty_private.reserve_campaign_capacity_v1(
       pg_temp.m07_ref('organization'), pg_temp.m07_ref('group'),
       pg_temp.m07_campaign_ref('limited_reward'),
       pg_temp.m07_ref('customer'), 'limited:reward:2',
       'm07:capacity:allocation:limited:2',
       decode(repeat('8',64),'hex'), pg_temp.m07_event_time()
     ) $$,
  array['capacity_exhausted'::text],
  'limited quantity and liability ceilings reject another reservation'
);
select results_eq(
  $$ select outcome from loyalty_private.finish_campaign_capacity_v1(
       pg_temp.m07_allocation_ref('m07:capacity:allocation:limited:1'),
       'committed', 'reward-reservation:test-limited'
     ) $$,
  array['created'::text],
  'limited reward liability commits only after fulfilment evidence exists'
);
reset role;

select lives_ok(
  $$ select loyalty_private.set_organization_entitlement(
    '8b000000-0000-4000-8000-000000000100', 'campaigns', 'disabled', null,
    'canary', 'test:m07-capacity', 'Stop accepting new campaign work',
    pg_catalog.clock_timestamp(), null
  ) $$,
  'campaign rollout can be disabled without mutating accepted value'
);

insert into loyalty_private.programme_evaluations (
  public_id, organization_id, programme_group_id, programme_version_id,
  canonical_event_id, evaluation_kind, subject_reference, idempotency_key,
  input_sha256, result_sha256, result, explanation, evaluated_at
)
values (
  '8b000000-0000-4000-8000-000000000609', pg_temp.m07_ref('organization'),
  pg_temp.m07_ref('group'), pg_temp.m07_ref('version'), pg_temp.m07_ref('event'),
  'live_award', 'woocommerce:order:after-disable',
  'm07:capacity:after-disable:evaluation', decode(repeat('e', 64), 'hex'),
  decode(repeat('f', 64), 'hex'),
  '{"version":"2","source":"purchase","awardedPoints":"1"}'::jsonb,
  '{"fixture":"campaign_rollout_disabled"}'::jsonb,
  pg_temp.m07_event_time() + interval '3 hours'
);

insert into loyalty_private.tier_qualification_facts (
  public_id, organization_id, programme_group_id,
  source_programme_version_id, customer_id, canonical_event_id,
  evaluation_id, fact_kind, source_reference,
  eligible_spend_minor_delta, earned_points_delta, order_count_delta,
  referral_count_delta, verified_action_count_delta, activity_code,
  effective_at, recorded_at
)
select '8b000000-0000-4000-8000-000000000610',
  evaluation.organization_id, evaluation.programme_group_id,
  evaluation.programme_version_id, pg_temp.m07_ref('customer'),
  evaluation.canonical_event_id, evaluation.id, 'purchase',
  'm07:capacity:after-disable:purchase', 100, 1, 1, 0, 0, null,
  evaluation.evaluated_at, evaluation.evaluated_at
from loyalty_private.programme_evaluations as evaluation
where evaluation.public_id = '8b000000-0000-4000-8000-000000000609';

select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.campaign_trigger_jobs as job
     join loyalty_private.tier_qualification_facts as fact
       on fact.organization_id = job.organization_id
      and fact.id = job.qualification_fact_id
     where fact.public_id = '8b000000-0000-4000-8000-000000000610' $$,
  array[0::bigint],
  'disabled rollout accepts no new campaign trigger while prior history remains'
);

select results_eq(
  $$ select campaign.code, counter.reserved_effects,
       counter.committed_effects, counter.reserved_points,
       counter.committed_points, counter.reserved_liability_minor,
       counter.committed_liability_minor
     from loyalty_private.campaign_capacity_counters as counter
     join loyalty.campaign_versions as version
       on version.organization_id = counter.organization_id
      and version.id = counter.campaign_version_id
     join loyalty.campaigns as campaign
       on campaign.organization_id = version.organization_id
      and campaign.id = version.campaign_id
     where campaign.code in ('milestone_points', 'limited_reward')
     order by campaign.code $$,
  $$ values ('limited_reward'::text, 0::bigint, 1::bigint,
              0::bigint, 0::bigint, 0::bigint, 5000::bigint),
            ('milestone_points'::text, 0::bigint, 1::bigint,
              0::bigint, 25::bigint, 0::bigint, 0::bigint) $$,
  'generic allocations reconcile reserved and committed points and liability'
);
select throws_ok(
  $$ update loyalty_private.campaign_capacity_allocations
     set completion_reference = 'changed' where state = 'committed' $$,
  '55000', 'invalid campaign allocation transition',
  'terminal allocation evidence cannot be rewritten'
);
select throws_ok(
  $$ delete from loyalty_private.campaign_capacity_counters $$,
  '55000', 'campaign capacity history cannot be deleted',
  'campaign capacity history cannot be deleted'
);

select * from finish();
rollback;
