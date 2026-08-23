begin;

create extension if not exists pgtap with schema extensions;

select plan(82);

select has_table('loyalty', 'campaigns', 'stable campaign identities exist');
select has_table('loyalty', 'campaign_versions', 'campaign definitions are versioned');
select has_table(
  'loyalty_private', 'campaign_controls',
  'control-assignment secrets remain private'
);
select has_table(
  'loyalty_private', 'campaign_assignments',
  'wallet treatment/control assignments remain private'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'loyalty.campaigns'::regclass),
  'campaign identities have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'loyalty.campaign_versions'::regclass),
  'campaign versions have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'loyalty_private.campaign_controls'::regclass),
  'private campaign controls have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'loyalty_private.campaign_assignments'::regclass),
  'private campaign assignments have RLS enabled'
);
select has_trigger(
  'loyalty', 'campaigns', 'campaigns_immutable',
  'stable campaign identity cannot be rewritten'
);
select has_trigger(
  'loyalty', 'campaign_versions', 'campaign_versions_contract',
  'campaign definitions are independently checked at storage'
);
select has_trigger(
  'loyalty', 'campaign_versions', 'campaign_versions_protect_history',
  'campaign definition and lifecycle history is protected'
);
select has_trigger(
  'loyalty_private', 'campaign_controls', 'campaign_controls_immutable',
  'control salts and aggregate hashes are immutable'
);
select has_trigger(
  'loyalty_private', 'campaign_assignments', 'campaign_assignments_immutable',
  'wallet assignments are immutable'
);
select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.create_campaign_draft_command(uuid,jsonb,text,uuid)', 'EXECUTE'
  ),
  'authenticated merchants can enter the campaign draft command'
);
select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.preview_campaign_version_command(uuid,text,text,uuid)', 'EXECUTE'
  ),
  'authenticated merchants can request a campaign preview'
);
select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.approve_campaign_version_command(uuid,text,text,uuid)', 'EXECUTE'
  ),
  'authenticated merchants can enter the campaign approval command'
);
select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.pause_campaign_version_command(uuid,text,text,uuid)', 'EXECUTE'
  ),
  'authenticated operators can enter the pause command'
);
select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.cancel_campaign_version_command(uuid,text,text,uuid)', 'EXECUTE'
  ),
  'authenticated owners can enter the cancellation command'
);
select ok(
  not has_function_privilege(
    'anon', 'loyalty.create_campaign_draft_command(uuid,jsonb,text,uuid)',
    'EXECUTE'
  ),
  'anonymous callers cannot author campaigns'
);
select ok(
  not has_function_privilege(
    'loyalty_runtime',
    'loyalty.approve_campaign_version_command(uuid,text,text,uuid)', 'EXECUTE'
  ),
  'application runtime cannot approve campaign value'
);
select ok(
  not has_table_privilege(
    'authenticated', 'loyalty_private.campaign_assignments', 'SELECT'
  ),
  'browser sessions cannot enumerate treatment/control membership'
);
select ok(
  not has_table_privilege(
    'authenticated', 'loyalty_private.campaign_controls', 'SELECT'
  ),
  'browser sessions cannot read assignment salts'
);
select ok(
  not has_table_privilege('authenticated', 'loyalty.campaigns', 'INSERT'),
  'browser sessions cannot bypass campaign commands with direct inserts'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'loyalty_private.validate_campaign_definition_v1(jsonb)', 'EXECUTE'
  ),
  'the independent campaign validator remains private'
);

insert into auth.users (id, email)
values
  ('89000000-0000-4000-8000-000000000001', 'm07-campaign-owner@example.test'),
  ('89000000-0000-4000-8000-000000000002', 'm07-campaign-operator@example.test'),
  ('89000000-0000-4000-8000-000000000003', 'm07-campaign-analyst@example.test'),
  ('8a000000-0000-4000-8000-000000000001', 'm07-campaign-other@example.test');

insert into loyalty.organizations (public_id, slug, name)
values
  ('89000000-0000-4000-8000-000000000100', 'm07-campaign-one', 'M07 Campaign One'),
  ('8a000000-0000-4000-8000-000000000100', 'm07-campaign-two', 'M07 Campaign Two');

insert into loyalty.organization_memberships (organization_id, user_id, role)
values
  ((select id from loyalty.organizations where slug = 'm07-campaign-one'),
    '89000000-0000-4000-8000-000000000001', 'owner'),
  ((select id from loyalty.organizations where slug = 'm07-campaign-one'),
    '89000000-0000-4000-8000-000000000002', 'operator'),
  ((select id from loyalty.organizations where slug = 'm07-campaign-one'),
    '89000000-0000-4000-8000-000000000003', 'analyst'),
  ((select id from loyalty.organizations where slug = 'm07-campaign-two'),
    '8a000000-0000-4000-8000-000000000001', 'owner');

insert into loyalty.programme_groups (organization_id, slug, name)
select id, 'rewards', name || ' Rewards'
from loyalty.organizations
where slug in ('m07-campaign-one', 'm07-campaign-two');

insert into loyalty.programmes (
  public_id, organization_id, programme_group_id, slug, name
)
select case organization.slug
    when 'm07-campaign-one' then '89000000-0000-4000-8000-000000000101'::uuid
    else '8a000000-0000-4000-8000-000000000101'::uuid end,
  organization.id, programme_group.id, 'rewards', organization.name || ' Rewards'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
where organization.slug in ('m07-campaign-one', 'm07-campaign-two');

insert into loyalty.customers (
  public_id, organization_id, display_reference, created_at, updated_at
)
select ('89000000-0000-4000-8000-00000000030' || value)::uuid,
  organization.id, 'Campaign member ' || value, now() - interval '90 days', now()
from loyalty.organizations as organization
cross join generate_series(1, 3) as value
where organization.slug = 'm07-campaign-one'
union all
select '8a000000-0000-4000-8000-000000000301'::uuid,
  organization.id, 'Other campaign member', now() - interval '90 days', now()
from loyalty.organizations as organization
where organization.slug = 'm07-campaign-two';

insert into loyalty.wallets (
  public_id, organization_id, programme_group_id, customer_id
)
select case organization.slug
    when 'm07-campaign-one'
      then ('89000000-0000-4000-8000-00000000040' ||
        right(customer.public_id::text, 1))::uuid
    else '8a000000-0000-4000-8000-000000000401'::uuid end,
  customer.organization_id, programme_group.id, customer.id
from loyalty.customers as customer
join loyalty.organizations as organization on organization.id = customer.organization_id
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = customer.organization_id
where organization.slug in ('m07-campaign-one', 'm07-campaign-two');

create function pg_temp.m07_campaign_audience(target_code text)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'schemaVersion', '1', 'code', target_code, 'name', target_code,
    'description', '', 'match', 'all',
    'conditions', jsonb_build_array(jsonb_build_object(
      'kind', 'metric', 'metric', 'available_points', 'operator', 'at_least',
      'minimum', '0', 'maximum', null, 'window', null,
      'activityCodes', jsonb_build_array()
    ))
  );
$$;

insert into loyalty.audiences (
  public_id, organization_id, programme_group_id, code, created_by_user_id
)
select fixture.public_id, organization.id, programme_group.id,
  fixture.code, fixture.actor_id
from (values
  ('89000000-0000-4000-8000-000000000451'::uuid, 'm07-campaign-one', 'included',
    '89000000-0000-4000-8000-000000000001'::uuid),
  ('89000000-0000-4000-8000-000000000452'::uuid, 'm07-campaign-one', 'excluded',
    '89000000-0000-4000-8000-000000000001'::uuid),
  ('8a000000-0000-4000-8000-000000000451'::uuid, 'm07-campaign-two', 'other',
    '8a000000-0000-4000-8000-000000000001'::uuid)
) as fixture(public_id, slug, code, actor_id)
join loyalty.organizations as organization on organization.slug = fixture.slug
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id;

insert into loyalty.audience_versions (
  public_id, organization_id, programme_group_id, audience_id, version_number,
  status, definition, definition_sha256, created_by_user_id,
  approved_by_user_id, published_at
)
select case audience.code
    when 'included' then '89000000-0000-4000-8000-000000000461'::uuid
    when 'excluded' then '89000000-0000-4000-8000-000000000462'::uuid
    else '8a000000-0000-4000-8000-000000000461'::uuid end,
  audience.organization_id, audience.programme_group_id, audience.id, 1,
  'draft', pg_temp.m07_campaign_audience(audience.code),
  extensions.digest(
    pg_catalog.convert_to(
      pg_temp.m07_campaign_audience(audience.code)::text, 'UTF8'
    ), 'sha256'
  ),
  audience.created_by_user_id, null, null
from loyalty.audiences as audience
where audience.code in ('included', 'excluded', 'other');

update loyalty.audience_versions
set status = 'published', approved_by_user_id = created_by_user_id,
  published_at = now();

insert into loyalty.audience_snapshots (
  public_id, organization_id, programme_group_id, audience_version_id,
  state, snapshot_at, member_count, definition_sha256,
  created_by_user_id, completed_at
)
select case audience.code
    when 'included' then '89000000-0000-4000-8000-000000000501'::uuid
    when 'excluded' then '89000000-0000-4000-8000-000000000502'::uuid
    else '8a000000-0000-4000-8000-000000000501'::uuid end,
  version.organization_id, version.programme_group_id, version.id, 'complete',
  now(), case audience.code when 'included' then 3 else 1 end,
  version.definition_sha256, version.created_by_user_id, now()
from loyalty.audience_versions as version
join loyalty.audiences as audience on audience.id = version.audience_id
where audience.code in ('included', 'excluded', 'other');

insert into loyalty_private.audience_snapshot_members (
  organization_id, programme_group_id, audience_snapshot_id,
  customer_id, wallet_id, evaluation
)
select snapshot.organization_id, snapshot.programme_group_id, snapshot.id,
  customer.id, wallet.id, '{"included":true}'::jsonb
from loyalty.audience_snapshots as snapshot
join loyalty.audience_versions as version on version.id = snapshot.audience_version_id
join loyalty.audiences as audience on audience.id = version.audience_id
join loyalty.customers as customer on customer.organization_id = snapshot.organization_id
join loyalty.wallets as wallet
  on wallet.organization_id = snapshot.organization_id
 and wallet.customer_id = customer.id
where audience.code = 'included'
union all
select snapshot.organization_id, snapshot.programme_group_id, snapshot.id,
  customer.id, wallet.id, '{"included":true}'::jsonb
from loyalty.audience_snapshots as snapshot
join loyalty.audience_versions as version on version.id = snapshot.audience_version_id
join loyalty.audiences as audience on audience.id = version.audience_id
join loyalty.customers as customer on customer.organization_id = snapshot.organization_id
join loyalty.wallets as wallet
  on wallet.organization_id = snapshot.organization_id
 and wallet.customer_id = customer.id
where audience.code in ('excluded', 'other')
  and customer.public_id in (
    '89000000-0000-4000-8000-000000000302',
    '8a000000-0000-4000-8000-000000000301'
  );

create function pg_temp.m07_campaign(
  target_code text,
  target_behavior jsonb,
  target_capacity jsonb
)
returns jsonb
language sql
stable
as $$
  with schedule as (
    select date_trunc('second', statement_timestamp() + interval '2 days') as starts_at,
      date_trunc('second', statement_timestamp() + interval '3 days') as ends_at
  )
  select jsonb_build_object(
    'schemaVersion', '1', 'code', target_code, 'name', 'Campaign ' || target_code,
    'description', '',
    'audienceSnapshotId', '89000000-0000-4000-8000-000000000501',
    'exclusionSnapshotIds', jsonb_build_array(
      '89000000-0000-4000-8000-000000000502'
    ),
    'schedule', jsonb_build_object(
      'timezone', 'UTC',
      'startsAt', to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z',
      'startsLocal', to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS'),
      'endsAt', to_char(ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z',
      'endsLocal', to_char(ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS')
    ),
    'behavior', target_behavior, 'capacity', target_capacity,
    'controlBasisPoints', 5000
  )
  from schedule;
$$;

create function pg_temp.m07_points_capacity()
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'globalEffectLimit', '10', 'perMemberEffectLimit', 2,
    'maximumPoints', '10000', 'maximumLiabilityMinor', null,
    'liabilityMinorPerEffect', null,
    'liabilityCurrencyCode', null, 'liabilityMinorUnitDigits', null
  );
$$;

create function pg_temp.m07_reward_capacity()
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'globalEffectLimit', '10', 'perMemberEffectLimit', 1,
    'maximumPoints', null, 'maximumLiabilityMinor', '50000',
    'liabilityMinorPerEffect', '5000',
    'liabilityCurrencyCode', 'EUR', 'liabilityMinorUnitDigits', 2
  );
$$;

create function pg_temp.m07_bonus(target_code text)
returns jsonb language sql stable as $$
  select pg_temp.m07_campaign(
    target_code,
    jsonb_build_object(
      'kind', 'bonus_points', 'earningRuleCodes', jsonb_build_array('purchase'),
      'reward', jsonb_build_object('kind', 'points', 'points', '100')
    ),
    pg_temp.m07_points_capacity()
  );
$$;

create function pg_temp.m07_stored_campaign(target_code text)
returns jsonb language sql stable as $$
  select version.definition
  from loyalty.campaign_versions as version
  join loyalty.campaigns as campaign
    on campaign.organization_id = version.organization_id
   and campaign.id = version.campaign_id
  where campaign.code = target_code
  order by version.version_number
  limit 1;
$$;

select lives_ok(
  $$ select loyalty_private.validate_campaign_definition_v1(
    pg_temp.m07_bonus('bonus_contract')
  ) $$,
  'database independently accepts strict bonus-points behavior'
);
select lives_ok(
  $$ select loyalty_private.validate_campaign_definition_v1(
    pg_temp.m07_campaign('multiplier_contract', jsonb_build_object(
      'kind', 'purchase_multiplier', 'earningRuleCodes', jsonb_build_array('purchase'),
      'multiplierBasisPoints', 20000, 'priority', 100
    ), pg_temp.m07_points_capacity())
  ) $$,
  'database independently accepts strict multiplier behavior'
);
select lives_ok(
  $$ select loyalty_private.validate_campaign_definition_v1(
    pg_temp.m07_campaign('milestone_contract', jsonb_build_object(
      'kind', 'milestone', 'metric', 'order_count', 'threshold', '5',
      'activityCodes', jsonb_build_array(),
      'reward', jsonb_build_object('kind', 'points', 'points', '100')
    ), pg_temp.m07_points_capacity())
  ) $$,
  'database independently accepts strict milestone behavior'
);
select lives_ok(
  $$ select loyalty_private.validate_campaign_definition_v1(
    pg_temp.m07_campaign('winback_contract', jsonb_build_object(
      'kind', 'win_back', 'minimumInactiveDays', 30,
      'minimumEligibleSpendMinor', '5000',
      'reward', jsonb_build_object('kind', 'points', 'points', '100')
    ), pg_temp.m07_points_capacity())
  ) $$,
  'database independently accepts strict win-back behavior'
);
select lives_ok(
  $$ select loyalty_private.validate_campaign_definition_v1(
    pg_temp.m07_campaign('tier_contract', jsonb_build_object(
      'kind', 'tier', 'movement', 'entry', 'tierCodes', jsonb_build_array('bloom'),
      'reward', jsonb_build_object('kind', 'points', 'points', '100')
    ), pg_temp.m07_points_capacity())
  ) $$,
  'database independently accepts strict tier behavior'
);
select lives_ok(
  $$ select loyalty_private.validate_campaign_definition_v1(
    pg_temp.m07_campaign('referral_contract', jsonb_build_object(
      'kind', 'referral', 'rewardedParty', 'advocate',
      'reward', jsonb_build_object('kind', 'points', 'points', '100')
    ), pg_temp.m07_points_capacity())
  ) $$,
  'database independently accepts strict referral behavior'
);
select lives_ok(
  $$ select loyalty_private.validate_campaign_definition_v1(
    pg_temp.m07_campaign('limited_contract', jsonb_build_object(
      'kind', 'limited_quantity',
      'reward', jsonb_build_object(
        'kind', 'programme_reward',
        'rewardId', '89000000-0000-4000-8000-000000000601'
      )
    ), pg_temp.m07_reward_capacity())
  ) $$,
  'database independently accepts strict limited-reward behavior'
);
select throws_ok(
  $$ select loyalty_private.validate_campaign_definition_v1(jsonb_set(
    pg_temp.m07_bonus('spring_gap'), '{schedule}', jsonb_build_object(
      'timezone', 'Europe/Ljubljana',
      'startsAt', '2027-03-28T02:30:00+01:00',
      'startsLocal', '2027-03-28T02:30:00',
      'endsAt', '2027-03-28T04:00:00+02:00',
      'endsLocal', '2027-03-28T04:00:00'
    )
  )) $$,
  '22023', 'campaign timezone evidence mismatch',
  'nonexistent spring-gap local time fails closed'
);
select throws_ok(
  $$ select loyalty_private.validate_campaign_definition_v1(
    pg_temp.m07_bonus('extra_field') || '{"sql":"select true"}'::jsonb
  ) $$,
  '22023', 'invalid campaign definition',
  'arbitrary campaign fields fail the exact-key database boundary'
);
select throws_ok(
  $$ select loyalty_private.validate_campaign_definition_v1(jsonb_set(
    pg_temp.m07_bonus('missing_budget'),
    '{capacity,maximumPoints}', 'null'::jsonb
  )) $$,
  '22023', 'point campaigns require a maximum-points budget',
  'point campaigns cannot omit their hard budget'
);
select throws_ok(
  $$ select loyalty_private.validate_campaign_definition_v1(jsonb_set(
    pg_temp.m07_bonus('numeric_budget'),
    '{capacity,globalEffectLimit}', '10'::jsonb
  )) $$,
  '22023', 'invalid campaign capacity',
  'numeric JSON cannot disguise exact bigint text'
);
select throws_ok(
  $$ select loyalty_private.validate_campaign_definition_v1(jsonb_set(
    pg_temp.m07_campaign('liability_overrun', jsonb_build_object(
      'kind', 'limited_quantity',
      'reward', jsonb_build_object(
        'kind', 'programme_reward',
        'rewardId', '89000000-0000-4000-8000-000000000601'
      )
    ), pg_temp.m07_reward_capacity()),
    '{capacity,liabilityMinorPerEffect}', '"50001"'::jsonb
  )) $$,
  '22023', 'invalid campaign liability budget',
  'per-effect liability cannot exceed the approved campaign ceiling'
);
select throws_ok(
  $$ select loyalty_private.validate_campaign_definition_v1(jsonb_set(
    pg_temp.m07_bonus('null_exclusions'),
    '{exclusionSnapshotIds}', 'null'::jsonb
  )) $$,
  '22023', 'invalid campaign definition',
  'JSON null cannot bypass bounded exclusion-array validation'
);

select lives_ok(
  $$ select loyalty_private.set_deployment_mode(
    'managed', 1, 'test:m07-campaign', 'Exercise managed campaign gating',
    now() - interval '2 minutes'
  ) $$,
  'test enters managed mode through the append-only deployment command'
);
select lives_ok(
  $$ select loyalty_private.set_organization_entitlement(
    '89000000-0000-4000-8000-000000000100', 'campaigns', 'enabled', null,
    'canary', 'test:m07-campaign', 'Enable strict campaign canary',
    now() - interval '90 seconds', null
  ) $$,
  'test enables campaigns for only the canary tenant'
);

set local role authenticated;
set local request.jwt.claim.sub = '8a000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select * from loyalty.create_campaign_draft_command(
    '8a000000-0000-4000-8000-000000000101',
    jsonb_set(pg_temp.m07_bonus('blocked'), '{audienceSnapshotId}',
      '"8a000000-0000-4000-8000-000000000501"'::jsonb),
    'm07:campaign:blocked', '8a000000-0000-4000-8000-000000000201'
  ) $$,
  '42501', 'campaigns are not enabled for this organization',
  'managed control tenant cannot bypass campaign entitlement'
);

set local request.jwt.claim.sub = '89000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select * from loyalty.create_campaign_draft_command(
    '89000000-0000-4000-8000-000000000101',
    jsonb_set(pg_temp.m07_bonus('cross_tenant'), '{audienceSnapshotId}',
      '"8a000000-0000-4000-8000-000000000501"'::jsonb),
    'm07:campaign:cross-tenant', '89000000-0000-4000-8000-000000000201'
  ) $$,
  '23514', 'campaign inclusion snapshot unavailable',
  'campaign cannot bind another tenant audience snapshot'
);
select throws_ok(
  $$ select * from loyalty.create_campaign_draft_command(
    '89000000-0000-4000-8000-000000000101',
    pg_temp.m07_campaign('missing_reward', jsonb_build_object(
      'kind', 'limited_quantity',
      'reward', jsonb_build_object(
        'kind', 'programme_reward',
        'rewardId', '89000000-0000-4000-8000-000000000601'
      )
    ), pg_temp.m07_reward_capacity()),
    'm07:campaign:missing-reward', '89000000-0000-4000-8000-000000000202'
  ) $$,
  '23514', 'campaign programme reward unavailable',
  'campaign cannot bind an unmaterialized programme reward'
);
select results_eq(
  $$ select outcome from loyalty.create_campaign_draft_command(
    '89000000-0000-4000-8000-000000000101', pg_temp.m07_bonus('autumn_bonus'),
    'm07:campaign:draft', '89000000-0000-4000-8000-000000000203'
  ) $$,
  array['created'::text],
  'entitled owner stores one strict campaign draft'
);
select results_eq(
  $$ select outcome from loyalty.create_campaign_draft_command(
    '89000000-0000-4000-8000-000000000101',
    pg_temp.m07_stored_campaign('autumn_bonus'),
    'm07:campaign:draft', '89000000-0000-4000-8000-000000000299'
  ) $$,
  array['duplicate'::text],
  'exact campaign draft retry resolves to the original version'
);
select throws_ok(
  $$ select * from loyalty.create_campaign_draft_command(
    '89000000-0000-4000-8000-000000000101',
    jsonb_set(
      pg_temp.m07_stored_campaign('autumn_bonus'),
      '{name}', '"Changed"'::jsonb
    ),
    'm07:campaign:draft', '89000000-0000-4000-8000-000000000204'
  ) $$,
  '23514', 'campaign command idempotency conflict',
  'campaign idempotency-key reuse with another definition fails'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.campaign_versions $$,
  array[1::bigint],
  'rejected and duplicate campaign drafts create no extra version'
);
reset role;
select throws_ok(
  $$ insert into loyalty.campaign_versions (
       organization_id, programme_group_id, campaign_id, version_number,
       status, definition, definition_sha256, created_by_user_id,
       approved_by_user_id, approved_at, eligible_member_count,
       treatment_member_count, control_member_count, assignment_sha256
     )
     select organization_id, programme_group_id, campaign_id, 99,
       'scheduled', definition, definition_sha256, created_by_user_id,
       created_by_user_id, now(), 1, 1, 0,
       extensions.digest(pg_catalog.convert_to('forged', 'UTF8'), 'sha256')
     from loyalty.campaign_versions limit 1 $$,
  '23514', 'campaign versions must enter through draft state',
  'even privileged direct insertion cannot forge accepted campaign work'
);

set local role authenticated;
set local request.jwt.claim.sub = '89000000-0000-4000-8000-000000000002';
select throws_ok(
  $$ select * from loyalty.create_campaign_draft_command(
    '89000000-0000-4000-8000-000000000101', pg_temp.m07_bonus('operator'),
    'm07:campaign:operator', '89000000-0000-4000-8000-000000000205'
  ) $$,
  '42501', 'campaign command not authorized',
  'operator cannot author campaign value policy'
);

set local request.jwt.claim.sub = '89000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select outcome, inclusion_members, excluded_members, eligible_members,
       expected_control_members, expected_treatment_members
     from loyalty.preview_campaign_version_command(
       (select public_id from loyalty.campaign_versions),
       (select encode(definition_sha256, 'hex') from loyalty.campaign_versions),
       'm07:campaign:preview', '89000000-0000-4000-8000-000000000206'
     ) $$,
  $$ values ('created'::text, '3'::text, '1'::text, '2'::text, '1'::text, '1'::text) $$,
  'preview reconciles inclusion exclusions and expected control totals'
);
select results_eq(
  $$ select maximum_effects, maximum_points, maximum_liability_minor
     from loyalty.preview_campaign_version_command(
       (select public_id from loyalty.campaign_versions),
       (select encode(definition_sha256, 'hex') from loyalty.campaign_versions),
       'm07:campaign:preview', '89000000-0000-4000-8000-000000000298'
     ) $$,
  $$ values ('4'::text, '10000'::text, null::text) $$,
  'exact preview retry retains bounded capacity and liability evidence'
);
select results_eq(
  $$ select outcome from loyalty.preview_campaign_version_command(
       (select public_id from loyalty.campaign_versions),
       (select encode(definition_sha256, 'hex') from loyalty.campaign_versions),
       'm07:campaign:preview', '89000000-0000-4000-8000-000000000297'
     ) $$,
  array['duplicate'::text],
  'exact preview retry is idempotent'
);
select throws_ok(
  $$ select * from loyalty.approve_campaign_version_command(
    (select public_id from loyalty.campaign_versions), repeat('a', 64),
    'm07:campaign:bad-approve', '89000000-0000-4000-8000-000000000207'
  ) $$,
  '23514', 'campaign approval precondition failed',
  'approval requires the reviewed exact definition hash'
);
select results_eq(
  $$ select outcome, status, eligible_members
     from loyalty.approve_campaign_version_command(
       (select public_id from loyalty.campaign_versions),
       (select encode(definition_sha256, 'hex') from loyalty.campaign_versions),
       'm07:campaign:approve', '89000000-0000-4000-8000-000000000208'
     ) $$,
  $$ values ('created'::text, 'scheduled'::text, '2'::text) $$,
  'reviewed future campaign schedules only after private assignments reconcile'
);
reset role;

select results_eq(
  $$ select status, eligible_member_count,
       treatment_member_count + control_member_count,
       octet_length(assignment_sha256)
     from loyalty.campaign_versions $$,
  $$ values ('scheduled'::text, 2::bigint, 2::bigint, 32::integer) $$,
  'stored campaign aggregates reconcile without exposing membership'
);
select results_eq(
  $$ select treatment_member_count, control_member_count
     from loyalty.campaign_versions $$,
  $$ values (1::bigint, 1::bigint) $$,
  'approval materializes the exact treatment and control counts from preview'
);
select results_eq(
  $$ select count(*)::bigint from loyalty_private.campaign_assignments $$,
  array[2::bigint],
  'approval creates one private assignment per eligible wallet'
);
select results_eq(
  $$ select count(*)::bigint from loyalty_private.campaign_controls
     where assignment_sha256 = (
       select assignment_sha256 from loyalty.campaign_versions
     ) $$,
  array[1::bigint],
  'private control evidence matches the public aggregate hash'
);

set local role authenticated;
set local request.jwt.claim.sub = '89000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select outcome, status from loyalty.approve_campaign_version_command(
       (select public_id from loyalty.campaign_versions),
       (select encode(definition_sha256, 'hex') from loyalty.campaign_versions),
       'm07:campaign:approve', '89000000-0000-4000-8000-000000000296'
     ) $$,
  $$ values ('duplicate'::text, 'scheduled'::text) $$,
  'exact campaign approval retry returns the original accepted outcome'
);
select results_eq(
  $$ select outcome from loyalty.create_campaign_draft_command(
    '89000000-0000-4000-8000-000000000101', pg_temp.m07_bonus('autumn_bonus'),
    'm07:campaign:draft:2', '89000000-0000-4000-8000-000000000209'
  ) $$,
  array['created'::text],
  'owner may prepare a new immutable campaign version'
);
select throws_ok(
  $$ select * from loyalty.approve_campaign_version_command(
    (select public_id from loyalty.campaign_versions where status = 'draft'),
    (select encode(definition_sha256, 'hex') from loyalty.campaign_versions
      where status = 'draft'),
    'm07:campaign:approve:2', '89000000-0000-4000-8000-000000000210'
  ) $$,
  '23514', 'campaign already has accepted work',
  'a second version cannot overlap accepted work for the same campaign'
);

set local request.jwt.claim.sub = '89000000-0000-4000-8000-000000000002';
select throws_ok(
  $$ select * from loyalty.pause_campaign_version_command(
    (select public_id from loyalty.campaign_versions where status = 'scheduled'),
    E'Operational\nsafety pause', 'm07:campaign:pause:multiline',
    '89000000-0000-4000-8000-000000000214'
  ) $$,
  '22023', 'invalid campaign pause identity',
  'database rejects multiline operational reasons at the command boundary'
);
select results_eq(
  $$ select outcome, status from loyalty.pause_campaign_version_command(
    (select public_id from loyalty.campaign_versions where status = 'scheduled'),
    'Operational safety pause', 'm07:campaign:pause',
    '89000000-0000-4000-8000-000000000211'
  ) $$,
  $$ values ('created'::text, 'paused'::text) $$,
  'operator may pause accepted campaign work without changing assignments'
);
select results_eq(
  $$ select outcome, status from loyalty.pause_campaign_version_command(
    (select public_id from loyalty.campaign_versions where status = 'paused'),
    'Operational safety pause', 'm07:campaign:pause',
    '89000000-0000-4000-8000-000000000295'
  ) $$,
  $$ values ('duplicate'::text, 'paused'::text) $$,
  'exact pause retry returns its original accepted outcome'
);
select throws_ok(
  $$ select * from loyalty.cancel_campaign_version_command(
    (select public_id from loyalty.campaign_versions where status = 'paused'),
    'Operator cannot cancel value', 'm07:campaign:operator-cancel',
    '89000000-0000-4000-8000-000000000212'
  ) $$,
  '42501', 'campaign command not authorized',
  'operator cannot cancel approved value policy'
);

set local request.jwt.claim.sub = '89000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select outcome, status from loyalty.cancel_campaign_version_command(
    (select public_id from loyalty.campaign_versions where status = 'paused'),
    'Owner-approved cancellation', 'm07:campaign:cancel',
    '89000000-0000-4000-8000-000000000213'
  ) $$,
  $$ values ('created'::text, 'cancelled'::text) $$,
  'owner cancels accepted campaign through an audited transition'
);
select results_eq(
  $$ select outcome, status from loyalty.cancel_campaign_version_command(
    (select public_id from loyalty.campaign_versions where status = 'cancelled'),
    'Owner-approved cancellation', 'm07:campaign:cancel',
    '89000000-0000-4000-8000-000000000294'
  ) $$,
  $$ values ('duplicate'::text, 'cancelled'::text) $$,
  'exact cancellation retry is idempotent'
);
reset role;

select throws_ok(
  $$ update loyalty.campaigns set code = 'rewritten' $$,
  '55000', 'immutable loyalty history cannot be changed',
  'stable campaign identity cannot be renamed'
);
select throws_ok(
  $$ update loyalty.campaign_versions
     set definition = jsonb_set(definition, '{name}', '"Rewritten"'::jsonb) $$,
  '55000', 'campaign definition history is immutable',
  'campaign definitions cannot be rewritten'
);
select throws_ok(
  $$ delete from loyalty_private.campaign_assignments $$,
  '55000', 'immutable loyalty history cannot be changed',
  'private treatment/control evidence cannot be deleted'
);

set local role authenticated;
set local request.jwt.claim.sub = '8a000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select count(*)::bigint from loyalty.campaign_versions $$,
  array[0::bigint],
  'another tenant cannot read canary campaign versions'
);
set local request.jwt.claim.sub = '89000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select count(*)::bigint from loyalty.campaign_versions $$,
  array[2::bigint],
  'canary owner can inspect aggregate campaign history'
);
select throws_ok(
  $$ select count(*) from loyalty_private.campaign_assignments $$,
  '42501', null,
  'canary owner still cannot enumerate private assignments'
);
reset role;

select lives_ok(
  $$ select loyalty_private.set_organization_entitlement(
    '89000000-0000-4000-8000-000000000100', 'campaigns', 'disabled', null,
    'canary', 'test:m07-campaign', 'Pause new campaign work after test',
    now() - interval '1 second', null
  ) $$,
  'test records an immediately effective campaign rollback decision'
);

set local role authenticated;
set local request.jwt.claim.sub = '89000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select outcome from loyalty.create_campaign_draft_command(
    '89000000-0000-4000-8000-000000000101',
    pg_temp.m07_stored_campaign('autumn_bonus'),
    'm07:campaign:draft', '89000000-0000-4000-8000-000000000293'
  ) $$,
  array['duplicate'::text],
  'rollback resolves an exact accepted campaign draft retry'
);
select results_eq(
  $$ select outcome from loyalty.preview_campaign_version_command(
    (select public_id from loyalty.campaign_versions order by version_number limit 1),
    (select encode(definition_sha256, 'hex') from loyalty.campaign_versions
      order by version_number limit 1),
    'm07:campaign:preview', '89000000-0000-4000-8000-000000000292'
  ) $$,
  array['duplicate'::text],
  'rollback resolves an exact accepted preview retry'
);
select results_eq(
  $$ select outcome, status from loyalty.approve_campaign_version_command(
    (select public_id from loyalty.campaign_versions order by version_number limit 1),
    (select encode(definition_sha256, 'hex') from loyalty.campaign_versions
      order by version_number limit 1),
    'm07:campaign:approve', '89000000-0000-4000-8000-000000000291'
  ) $$,
  $$ values ('duplicate'::text, 'scheduled'::text) $$,
  'rollback resolves approval to its original scheduled outcome after cancellation'
);
select results_eq(
  $$ select outcome, status from loyalty.pause_campaign_version_command(
    (select public_id from loyalty.campaign_versions order by version_number limit 1),
    'Operational safety pause', 'm07:campaign:pause',
    '89000000-0000-4000-8000-000000000290'
  ) $$,
  $$ values ('duplicate'::text, 'paused'::text) $$,
  'rollback resolves pause to its original outcome after cancellation'
);
select results_eq(
  $$ select outcome from loyalty.cancel_campaign_version_command(
    (select public_id from loyalty.campaign_versions order by version_number limit 1),
    'Owner-approved cancellation', 'm07:campaign:cancel',
    '89000000-0000-4000-8000-000000000289'
  ) $$,
  array['duplicate'::text],
  'rollback resolves an exact accepted cancellation retry'
);
select throws_ok(
  $$ select * from loyalty.create_campaign_draft_command(
    '89000000-0000-4000-8000-000000000101', pg_temp.m07_bonus('disabled'),
    'm07:campaign:disabled', '89000000-0000-4000-8000-000000000214'
  ) $$,
  '42501', 'campaigns are not enabled for this organization',
  'rollback blocks new campaign authoring'
);
select throws_ok(
  $$ select * from loyalty.preview_campaign_version_command(
    (select public_id from loyalty.campaign_versions where status = 'draft'),
    (select encode(definition_sha256, 'hex') from loyalty.campaign_versions
      where status = 'draft'),
    'm07:campaign:disabled-preview', '89000000-0000-4000-8000-000000000215'
  ) $$,
  '42501', 'campaigns are not enabled for this organization',
  'rollback blocks a new preview without deleting accepted evidence'
);
reset role;

select results_eq(
  $$ select count(*)::bigint from loyalty_private.campaign_assignments $$,
  array[2::bigint],
  'rollback preserves private treatment/control evidence'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.admin_audit_events
     where action like 'campaign.%' $$,
  array[6::bigint],
  'unique campaign commands retain immutable audit evidence'
);

select * from finish();
rollback;
