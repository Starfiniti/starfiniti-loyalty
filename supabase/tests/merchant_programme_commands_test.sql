begin;

create extension if not exists pgtap with schema extensions;

select plan(58);

select has_table('loyalty', 'admin_audit_events', 'merchant audit table exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'loyalty.admin_audit_events'::regclass),
  'merchant audit table has RLS enabled'
);
select ok(
  has_table_privilege('authenticated', 'loyalty.admin_audit_events', 'SELECT'),
  'authenticated users can read authorized audit evidence'
);
select ok(
  not has_table_privilege('authenticated', 'loyalty.admin_audit_events', 'INSERT'),
  'authenticated users cannot forge audit evidence'
);
select ok(
  not has_table_privilege('anon', 'loyalty.admin_audit_events', 'SELECT'),
  'anonymous users cannot read merchant audit evidence'
);
select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.create_programme_draft_command(uuid,jsonb,text,uuid)',
    'EXECUTE'
  ),
  'authenticated role can enter the guarded draft command'
);
select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.publish_programme_version_command(uuid,text,text,uuid)',
    'EXECUTE'
  ),
  'authenticated role can enter the guarded publish command'
);
select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.schedule_programme_version_command(uuid,text,timestamp with time zone,text,uuid)',
    'EXECUTE'
  ),
  'authenticated role can enter the guarded schedule command'
);
select ok(
  not has_function_privilege(
    'anon',
    'loyalty.create_programme_draft_command(uuid,jsonb,text,uuid)',
    'EXECUTE'
  ),
  'anonymous role cannot enter merchant commands'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'loyalty'
      and routine.proname in (
        'create_programme_draft_command',
        'publish_programme_version_command',
        'schedule_programme_version_command'
      )
      and routine.prosecdef
  $$,
  array[3::bigint],
  'all exposed merchant command wrappers are security definer functions'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'loyalty'
      and routine.proname in (
        'create_programme_draft_command',
        'publish_programme_version_command',
        'schedule_programme_version_command'
      )
      and exists (
        select 1 from unnest(routine.proconfig) as setting
        where setting like 'search_path=%'
      )
  $$,
  array[3::bigint],
  'every exposed merchant command fixes an empty search path'
);
select has_trigger(
  'loyalty',
  'admin_audit_events',
  'admin_audit_events_immutable',
  'audit history has an immutable trigger'
);
select has_index(
  'loyalty',
  'admin_audit_events',
  'admin_audit_events_tenant_history_idx',
  'tenant audit history is indexed'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'loyalty_private.request_user_id()',
    'EXECUTE'
  ),
  'browser clients cannot call the actor primitive directly'
);

insert into auth.users (id, email)
values
  ('71000000-0000-4000-8000-000000000001', 'merchant-owner@example.test'),
  ('71000000-0000-4000-8000-000000000002', 'merchant-operator@example.test'),
  ('71000000-0000-4000-8000-000000000003', 'merchant-analyst@example.test'),
  ('71000000-0000-4000-8000-000000000004', 'merchant-auditor@example.test'),
  ('71000000-0000-4000-8000-000000000005', 'merchant-revoked@example.test'),
  ('72000000-0000-4000-8000-000000000001', 'other-owner@example.test');

insert into loyalty.organizations (public_id, slug, name)
values
  ('71000000-0000-4000-8000-000000000100', 'merchant-command-one', 'Merchant Command One'),
  ('72000000-0000-4000-8000-000000000100', 'merchant-command-two', 'Merchant Command Two');

insert into loyalty.organization_memberships (
  organization_id, user_id, role, revoked_at
)
values
  ((select id from loyalty.organizations where slug = 'merchant-command-one'), '71000000-0000-4000-8000-000000000001', 'owner', null),
  ((select id from loyalty.organizations where slug = 'merchant-command-one'), '71000000-0000-4000-8000-000000000002', 'operator', null),
  ((select id from loyalty.organizations where slug = 'merchant-command-one'), '71000000-0000-4000-8000-000000000003', 'analyst', null),
  ((select id from loyalty.organizations where slug = 'merchant-command-one'), '71000000-0000-4000-8000-000000000004', 'auditor', null),
  ((select id from loyalty.organizations where slug = 'merchant-command-one'), '71000000-0000-4000-8000-000000000005', 'admin', now()),
  ((select id from loyalty.organizations where slug = 'merchant-command-two'), '72000000-0000-4000-8000-000000000001', 'owner', null);

insert into loyalty.programme_groups (organization_id, slug, name)
select id, 'rewards', name || ' Rewards'
from loyalty.organizations
where slug in ('merchant-command-one', 'merchant-command-two');

insert into loyalty.programmes (
  public_id, organization_id, programme_group_id, slug, name
)
select
  case organization.slug
    when 'merchant-command-one' then '71000000-0000-4000-8000-000000000101'::uuid
    else '72000000-0000-4000-8000-000000000101'::uuid
  end,
  organization.id,
  programme_group.id,
  'rewards',
  organization.name || ' Rewards'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
where organization.slug in ('merchant-command-one', 'merchant-command-two');

set local role authenticated;
set local request.jwt.claim.sub = '71000000-0000-4000-8000-000000000001';

select results_eq(
  $$
    select outcome
    from loyalty.create_programme_draft_command(
      '71000000-0000-4000-8000-000000000101',
      '{
        "version":"1",
        "tiers":[
          {"code":"rose","name":"Rose","minimumEligibleSpendMinor":"0","pointsPerMajorUnit":"5"},
          {"code":"bloom","name":"Bloom","minimumEligibleSpendMinor":"15000","pointsPerMajorUnit":"6"}
        ],
        "rewards":[]
      }'::jsonb,
      'merchant:draft:one',
      '71000000-0000-4000-8000-000000000201'
    )
  $$,
  array['created'::text],
  'owner creates a canonical programme draft'
);
select results_eq(
  $$ select version_number from loyalty.programme_versions where programme_id = (
    select id from loyalty.programmes where public_id = '71000000-0000-4000-8000-000000000101'
  ) $$,
  array[1],
  'first merchant draft receives version one'
);
select results_eq(
  $$
    select configuration_sha256 = extensions.digest(
      convert_to(configuration::text, 'UTF8'), 'sha256'
    )
    from loyalty.programme_versions
    where version_number = 1
  $$,
  array[true],
  'database canonicalizes and hashes the persisted configuration'
);
select results_eq(
  $$ select created_by_user_id from loyalty.programme_versions where version_number = 1 $$,
  array['71000000-0000-4000-8000-000000000001'::uuid],
  'draft actor comes from the verified request identity'
);
select results_eq(
  $$ select action from loyalty.admin_audit_events where idempotency_key = 'merchant:draft:one' $$,
  array['programme.draft.create'::text],
  'draft creation appends audit evidence'
);
select results_eq(
  $$ select actor_user_id from loyalty.admin_audit_events where idempotency_key = 'merchant:draft:one' $$,
  array['71000000-0000-4000-8000-000000000001'::uuid],
  'audit actor is derived from the request'
);
select results_eq(
  $$ select correlation_id from loyalty.admin_audit_events where idempotency_key = 'merchant:draft:one' $$,
  array['71000000-0000-4000-8000-000000000201'::uuid],
  'audit evidence retains the command correlation ID'
);
select results_eq(
  $$
    select outcome
    from loyalty.create_programme_draft_command(
      '71000000-0000-4000-8000-000000000101',
      '{
        "version":"1",
        "tiers":[
          {"code":"rose","name":"Rose","minimumEligibleSpendMinor":"0","pointsPerMajorUnit":"5"},
          {"code":"bloom","name":"Bloom","minimumEligibleSpendMinor":"15000","pointsPerMajorUnit":"6"}
        ],
        "rewards":[]
      }'::jsonb,
      'merchant:draft:one',
      '71000000-0000-4000-8000-000000000299'
    )
  $$,
  array['duplicate'::text],
  'draft retry returns the existing version'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.programme_versions $$,
  array[1::bigint],
  'draft retry creates no second version'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.admin_audit_events where idempotency_key = 'merchant:draft:one' $$,
  array[1::bigint],
  'draft retry creates no second audit event'
);
select throws_ok(
  $$
    select * from loyalty.create_programme_draft_command(
      '71000000-0000-4000-8000-000000000101',
      '{"version":"1","tiers":[{"code":"changed","name":"Changed","minimumEligibleSpendMinor":"0","pointsPerMajorUnit":"1"}],"rewards":[]}'::jsonb,
      'merchant:draft:one',
      '71000000-0000-4000-8000-000000000202'
    )
  $$,
  '23514',
  'programme command idempotency conflict',
  'an idempotency key cannot be reused with changed input'
);
select throws_ok(
  $$
    select * from loyalty.publish_programme_version_command(
      (select public_id from loyalty.programme_versions where version_number = 1),
      repeat('0', 64),
      'merchant:publish:stale',
      '71000000-0000-4000-8000-000000000203'
    )
  $$,
  '23514',
  'programme configuration hash conflict',
  'publication rejects a stale configuration hash'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.admin_audit_events where idempotency_key = 'merchant:publish:stale' $$,
  array[0::bigint],
  'failed publication leaves no success audit event'
);
select results_eq(
  $$
    select outcome
    from loyalty.publish_programme_version_command(
      (select public_id from loyalty.programme_versions where version_number = 1),
      (select encode(configuration_sha256, 'hex') from loyalty.programme_versions where version_number = 1),
      'merchant:publish:one',
      '71000000-0000-4000-8000-000000000204'
    )
  $$,
  array['created'::text],
  'owner publishes the exact reviewed draft'
);
select results_eq(
  $$ select status from loyalty.programme_versions where version_number = 1 $$,
  array['published'::text],
  'published command advances the draft lifecycle'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.programme_tiers $$,
  array[2::bigint],
  'publication materializes the validated tiers'
);
select results_eq(
  $$ select action from loyalty.admin_audit_events where idempotency_key = 'merchant:publish:one' $$,
  array['programme.version.publish'::text],
  'publication appends immutable audit evidence'
);
select results_eq(
  $$
    select outcome
    from loyalty.publish_programme_version_command(
      (select public_id from loyalty.programme_versions where version_number = 1),
      (select encode(configuration_sha256, 'hex') from loyalty.programme_versions where version_number = 1),
      'merchant:publish:one',
      '71000000-0000-4000-8000-000000000298'
    )
  $$,
  array['duplicate'::text],
  'publication retry returns the existing publication'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.admin_audit_events where idempotency_key = 'merchant:publish:one' $$,
  array[1::bigint],
  'publication retry creates no second audit event'
);
select results_eq(
  $$
    select outcome
    from loyalty.create_programme_draft_command(
      '71000000-0000-4000-8000-000000000101',
      '{"version":"1","tiers":[{"code":"rose","name":"Rose","minimumEligibleSpendMinor":"0","pointsPerMajorUnit":"6"}],"rewards":[]}'::jsonb,
      'merchant:draft:two',
      '71000000-0000-4000-8000-000000000205'
    )
  $$,
  array['created'::text],
  'owner creates a second version without rewriting history'
);
select throws_ok(
  $$
    select * from loyalty.schedule_programme_version_command(
      (select public_id from loyalty.programme_versions where version_number = 2),
      (select encode(configuration_sha256, 'hex') from loyalty.programme_versions where version_number = 2),
      now() - interval '1 minute',
      'merchant:schedule:past',
      '71000000-0000-4000-8000-000000000206'
    )
  $$,
  '22023',
  'programme schedule must be in the future',
  'past publication schedules are rejected'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.admin_audit_events where idempotency_key = 'merchant:schedule:past' $$,
  array[0::bigint],
  'failed schedule leaves no success audit event'
);
select results_eq(
  $$
    select outcome
    from loyalty.schedule_programme_version_command(
      (select public_id from loyalty.programme_versions where version_number = 2),
      (select encode(configuration_sha256, 'hex') from loyalty.programme_versions where version_number = 2),
      '2027-08-12T12:00:00Z',
      'merchant:schedule:two',
      '71000000-0000-4000-8000-000000000207'
    )
  $$,
  array['created'::text],
  'owner schedules an exact reviewed draft'
);
select results_eq(
  $$ select status from loyalty.programme_versions where version_number = 2 $$,
  array['scheduled'::text],
  'schedule command advances the draft lifecycle'
);
select results_eq(
  $$ select action from loyalty.admin_audit_events where idempotency_key = 'merchant:schedule:two' $$,
  array['programme.version.schedule'::text],
  'schedule command appends audit evidence'
);
select results_eq(
  $$
    select outcome
    from loyalty.schedule_programme_version_command(
      (select public_id from loyalty.programme_versions where version_number = 2),
      (select encode(configuration_sha256, 'hex') from loyalty.programme_versions where version_number = 2),
      '2027-08-12T12:00:00Z',
      'merchant:schedule:two',
      '71000000-0000-4000-8000-000000000297'
    )
  $$,
  array['duplicate'::text],
  'schedule retry returns the existing schedule'
);

select results_eq(
  $$ select outcome from loyalty.create_programme_draft_command(
    '71000000-0000-4000-8000-000000000101',
    '{
      "version":"1",
      "tiers":[{"code":"rose","name":"Rose","minimumEligibleSpendMinor":"0","pointsPerMajorUnit":"5"}],
      "rewards":[{
        "code":"capped","name":"Capped","kind":"percentage_discount","costPoints":"100",
        "configuration":{"percentageBasisPoints":1000,"maximumDiscountMinor":"2500","currencyMinorUnitDigits":2,"validityDays":30}
      }]
    }'::jsonb,
    'merchant:draft:capped-publish',
    '71000000-0000-4000-8000-000000000220'
  ) $$,
  array['created'::text],
  'the database boundary accepts an inspectable draft before publication review'
);
select throws_ok(
  $$ select * from loyalty.publish_programme_version_command(
    (select public_id from loyalty.programme_versions where version_number = 3),
    (select encode(configuration_sha256, 'hex') from loyalty.programme_versions where version_number = 3),
    'merchant:publish:capped',
    '71000000-0000-4000-8000-000000000221'
  ) $$,
  '22023', 'percentage discount maximum is unsupported',
  'direct authenticated RPC cannot publish an unsupported capped percentage'
);
select results_eq(
  $$ select outcome from loyalty.create_programme_draft_command(
    '71000000-0000-4000-8000-000000000101',
    '{
      "version":"1",
      "tiers":[{"code":"rose","name":"Rose","minimumEligibleSpendMinor":"0","pointsPerMajorUnit":"5"}],
      "rewards":[{
        "code":"capped-later","name":"Capped later","kind":"percentage_discount","costPoints":"100",
        "configuration":{"percentageBasisPoints":1000,"maximumDiscountMinor":"2500","currencyMinorUnitDigits":2,"validityDays":30}
      }]
    }'::jsonb,
    'merchant:draft:capped-schedule',
    '71000000-0000-4000-8000-000000000222'
  ) $$,
  array['created'::text],
  'a second capped draft exercises the independent schedule boundary'
);
select throws_ok(
  $$ select * from loyalty.schedule_programme_version_command(
    (select public_id from loyalty.programme_versions where version_number = 4),
    (select encode(configuration_sha256, 'hex') from loyalty.programme_versions where version_number = 4),
    now() + interval '1 day',
    'merchant:schedule:capped',
    '71000000-0000-4000-8000-000000000223'
  ) $$,
  '22023', 'percentage discount maximum is unsupported',
  'direct authenticated RPC cannot schedule an unsupported capped percentage'
);
select results_eq(
  $$ select version_number, status from loyalty.programme_versions
     where version_number in (3, 4) order by version_number $$,
  $$ values (3, 'draft'::text), (4, 'draft'::text) $$,
  'failed publish and schedule attempts leave both definitions as drafts'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.programme_rewards
     where programme_version_id in (
       select id from loyalty.programme_versions where version_number in (3, 4)
     ) $$,
  array[0::bigint],
  'failed capped definitions leave no materialized reward rows'
);

set local request.jwt.claim.sub = '71000000-0000-4000-8000-000000000002';
select throws_ok(
  $$ select * from loyalty.create_programme_draft_command(
    '71000000-0000-4000-8000-000000000101', '{}'::jsonb,
    'merchant:operator:denied', '71000000-0000-4000-8000-000000000208'
  ) $$,
  '42501', 'programme command not authorized',
  'operator cannot alter programme value policy'
);

set local request.jwt.claim.sub = '71000000-0000-4000-8000-000000000003';
select throws_ok(
  $$ select * from loyalty.create_programme_draft_command(
    '71000000-0000-4000-8000-000000000101', '{}'::jsonb,
    'merchant:analyst:denied', '71000000-0000-4000-8000-000000000209'
  ) $$,
  '42501', 'programme command not authorized',
  'analyst cannot alter programme value policy'
);

set local request.jwt.claim.sub = '71000000-0000-4000-8000-000000000005';
select throws_ok(
  $$ select * from loyalty.create_programme_draft_command(
    '71000000-0000-4000-8000-000000000101', '{}'::jsonb,
    'merchant:revoked:denied', '71000000-0000-4000-8000-000000000210'
  ) $$,
  '42501', 'programme command not authorized',
  'revoked admin fails closed with a live token'
);

set local request.jwt.claim.sub = '72000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select * from loyalty.create_programme_draft_command(
    '71000000-0000-4000-8000-000000000101', '{}'::jsonb,
    'merchant:cross-tenant:denied', '71000000-0000-4000-8000-000000000211'
  ) $$,
  '42501', 'programme command not authorized',
  'another tenant owner cannot target this programme'
);

set local request.jwt.claim.sub = '71000000-0000-4000-8000-000000000004';
select results_eq(
  $$ select count(*)::bigint from loyalty.admin_audit_events $$,
  array[4::bigint],
  'auditor can review all tenant programme mutations'
);
select throws_ok(
  $$ select * from loyalty.create_programme_draft_command(
    '71000000-0000-4000-8000-000000000101', '{}'::jsonb,
    'merchant:auditor:denied', '71000000-0000-4000-8000-000000000212'
  ) $$,
  '42501', 'programme command not authorized',
  'auditor cannot mutate programme policy'
);

set local request.jwt.claim.sub = '71000000-0000-4000-8000-000000000002';
select results_eq(
  $$ select count(*)::bigint from loyalty.admin_audit_events $$,
  array[0::bigint],
  'operator cannot read privileged administration audit evidence'
);

set local request.jwt.claim.sub = '72000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select count(*)::bigint from loyalty.admin_audit_events $$,
  array[0::bigint],
  'another tenant owner cannot read this tenant audit evidence'
);

reset role;

select throws_ok(
  $$ update loyalty.admin_audit_events set metadata = '{"tampered":true}'::jsonb $$,
  '55000', 'immutable loyalty history cannot be changed',
  'audit evidence cannot be rewritten'
);
select throws_ok(
  $$ update loyalty.programme_versions set configuration = '{}'::jsonb where version_number = 1 $$,
  '55000', 'published programme version is immutable',
  'published programme configuration remains immutable'
);
select results_eq(
  $$ select distinct octet_length(request_sha256) from loyalty.admin_audit_events $$,
  array[32],
  'every audit command retains a SHA-256 request fingerprint'
);
select results_eq(
  $$
    select count(*)::bigint
    from loyalty.admin_audit_events as audit
    join loyalty.organizations as organization on organization.id = audit.organization_id
    where organization.slug = 'merchant-command-one'
  $$,
  array[4::bigint],
  'every successful mutation is attributable to exactly one tenant'
);

select * from finish();
rollback;
