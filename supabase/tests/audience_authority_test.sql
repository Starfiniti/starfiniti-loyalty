begin;

create extension if not exists pgtap with schema extensions;

select plan(67);

select has_table('loyalty', 'audiences', 'stable audience identities exist');
select has_table('loyalty', 'audience_versions', 'audience definitions are versioned');
select has_table('loyalty', 'audience_snapshots', 'audience snapshots exist');
select has_table(
  'loyalty_private', 'audience_snapshot_members',
  'audience membership evidence remains private'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'loyalty.audiences'::regclass),
  'audience identities have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'loyalty.audience_versions'::regclass),
  'audience versions have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'loyalty.audience_snapshots'::regclass),
  'audience snapshots have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class
    where oid = 'loyalty_private.audience_snapshot_members'::regclass),
  'private audience membership has RLS enabled'
);
select has_trigger(
  'loyalty', 'audiences', 'audiences_immutable',
  'stable audience identities cannot be rewritten'
);
select has_trigger(
  'loyalty', 'audience_versions', 'audience_versions_protect_history',
  'audience definition history has a strict lifecycle'
);
select has_trigger(
  'loyalty', 'audience_versions', 'audience_versions_contract',
  'audience definitions are independently validated at storage'
);
select has_trigger(
  'loyalty', 'audience_snapshots', 'audience_snapshots_protect_history',
  'completed audience snapshots cannot be rewritten'
);
select has_trigger(
  'loyalty_private', 'audience_snapshot_members',
  'audience_snapshot_members_immutable',
  'included-member evidence is immutable'
);
select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.create_audience_draft_command(uuid,jsonb,text,uuid)', 'EXECUTE'
  ),
  'authenticated merchants can enter the audience draft command'
);
select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.publish_audience_version_command(uuid,text,text,uuid)', 'EXECUTE'
  ),
  'authenticated merchants can enter the audience publication command'
);
select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.create_audience_snapshot_command(uuid,text,uuid)', 'EXECUTE'
  ),
  'authenticated merchants can request a database-timed snapshot'
);
select ok(
  not has_function_privilege(
    'anon', 'loyalty.create_audience_draft_command(uuid,jsonb,text,uuid)',
    'EXECUTE'
  ),
  'anonymous callers cannot author audiences'
);
select ok(
  not has_function_privilege(
    'loyalty_runtime',
    'loyalty.create_audience_snapshot_command(uuid,text,uuid)', 'EXECUTE'
  ),
  'application runtime credentials cannot manufacture audience membership'
);
select ok(
  not has_table_privilege(
    'authenticated', 'loyalty_private.audience_snapshot_members', 'SELECT'
  ),
  'browser sessions cannot enumerate audience members'
);
select ok(
  not has_table_privilege(
    'authenticated', 'loyalty_private.audience_snapshot_members', 'INSERT'
  ),
  'browser sessions cannot insert audience membership'
);
select ok(
  not has_table_privilege('authenticated', 'loyalty.audiences', 'INSERT'),
  'browser sessions cannot bypass audience commands with direct inserts'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'loyalty_private.validate_audience_definition_v1(jsonb)', 'EXECUTE'
  ),
  'the independent database validator remains private'
);

insert into auth.users (id, email)
values
  ('87000000-0000-4000-8000-000000000001', 'm07-owner@example.test'),
  ('87000000-0000-4000-8000-000000000002', 'm07-operator@example.test'),
  ('87000000-0000-4000-8000-000000000003', 'm07-analyst@example.test'),
  ('88000000-0000-4000-8000-000000000001', 'm07-other@example.test');

insert into loyalty.organizations (public_id, slug, name)
values
  ('87000000-0000-4000-8000-000000000100', 'm07-one', 'M07 One'),
  ('88000000-0000-4000-8000-000000000100', 'm07-two', 'M07 Two');

insert into loyalty.organization_memberships (organization_id, user_id, role)
values
  ((select id from loyalty.organizations where slug = 'm07-one'),
    '87000000-0000-4000-8000-000000000001', 'owner'),
  ((select id from loyalty.organizations where slug = 'm07-one'),
    '87000000-0000-4000-8000-000000000002', 'operator'),
  ((select id from loyalty.organizations where slug = 'm07-one'),
    '87000000-0000-4000-8000-000000000003', 'analyst'),
  ((select id from loyalty.organizations where slug = 'm07-two'),
    '88000000-0000-4000-8000-000000000001', 'owner');

insert into loyalty.programme_groups (organization_id, slug, name)
select id, 'rewards', name || ' Rewards'
from loyalty.organizations where slug in ('m07-one', 'm07-two');

insert into loyalty.programmes (
  public_id, organization_id, programme_group_id, slug, name
)
select case organization.slug
    when 'm07-one' then '87000000-0000-4000-8000-000000000101'::uuid
    else '88000000-0000-4000-8000-000000000101'::uuid end,
  organization.id, programme_group.id, 'rewards', organization.name || ' Rewards'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
where organization.slug in ('m07-one', 'm07-two');

insert into loyalty.customers (
  public_id, organization_id, display_reference, created_at, updated_at
)
select '87000000-0000-4000-8000-000000000301', id, 'M07 A',
  now() - interval '60 days', now() - interval '60 days'
from loyalty.organizations where slug = 'm07-one'
union all
select '87000000-0000-4000-8000-000000000302', id, 'M07 B',
  now() - interval '10 days', now() - interval '10 days'
from loyalty.organizations where slug = 'm07-one'
union all
select '88000000-0000-4000-8000-000000000301', id, 'M07 Other',
  now() - interval '90 days', now() - interval '90 days'
from loyalty.organizations where slug = 'm07-two';

insert into loyalty.wallets (
  public_id, organization_id, programme_group_id, customer_id
)
select case customer.public_id
    when '87000000-0000-4000-8000-000000000301'
      then '87000000-0000-4000-8000-000000000401'::uuid
    when '87000000-0000-4000-8000-000000000302'
      then '87000000-0000-4000-8000-000000000402'::uuid
    else '88000000-0000-4000-8000-000000000401'::uuid end,
  customer.organization_id, programme_group.id, customer.id
from loyalty.customers as customer
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = customer.organization_id
where customer.public_id in (
  '87000000-0000-4000-8000-000000000301',
  '87000000-0000-4000-8000-000000000302',
  '88000000-0000-4000-8000-000000000301'
);

insert into loyalty.ledger_accounts (
  organization_id, programme_group_id, wallet_id, account_kind
)
select wallet.organization_id, wallet.programme_group_id, wallet.id, kind.value
from loyalty.wallets as wallet
cross join (values ('available'::text), ('pending'::text)) as kind(value)
where wallet.public_id in (
  '87000000-0000-4000-8000-000000000401',
  '87000000-0000-4000-8000-000000000402',
  '88000000-0000-4000-8000-000000000401'
);

insert into loyalty.wallet_balances (
  ledger_account_id, organization_id, programme_group_id, wallet_id,
  account_kind, points
)
select account.id, account.organization_id, account.programme_group_id,
  account.wallet_id, account.account_kind,
  case
    when wallet.public_id = '87000000-0000-4000-8000-000000000401'
      and account.account_kind = 'available' then 1200
    when wallet.public_id = '87000000-0000-4000-8000-000000000401'
      and account.account_kind = 'pending' then 50
    when wallet.public_id = '87000000-0000-4000-8000-000000000402'
      and account.account_kind = 'available' then -100
    else 0
  end
from loyalty.ledger_accounts as account
join loyalty.wallets as wallet
  on wallet.organization_id = account.organization_id
 and wallet.id = account.wallet_id
where wallet.public_id in (
  '87000000-0000-4000-8000-000000000401',
  '87000000-0000-4000-8000-000000000402',
  '88000000-0000-4000-8000-000000000401'
);

create function pg_temp.m07_value_audience(target_code text)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'schemaVersion', '1', 'code', target_code,
    'name', 'Established high balance', 'description', '', 'match', 'all',
    'conditions', jsonb_build_array(
      jsonb_build_object(
        'kind', 'metric', 'metric', 'available_points',
        'operator', 'at_least', 'minimum', '1000', 'maximum', null,
        'window', null, 'activityCodes', jsonb_build_array()
      ),
      jsonb_build_object(
        'kind', 'metric', 'metric', 'customer_age_days',
        'operator', 'at_least', 'minimum', '30', 'maximum', null,
        'window', null, 'activityCodes', jsonb_build_array()
      )
    )
  );
$$;

create function pg_temp.m07_negative_audience()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'schemaVersion', '1', 'code', 'negative_balance',
    'name', 'Negative balance', 'description', '', 'match', 'all',
    'conditions', jsonb_build_array(jsonb_build_object(
      'kind', 'metric', 'metric', 'available_points',
      'operator', 'at_most', 'minimum', '0', 'maximum', null,
      'window', null, 'activityCodes', jsonb_build_array()
    ))
  );
$$;

create function pg_temp.m07_recency_audience()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'schemaVersion', '1', 'code', 'inactive_paid_members',
    'name', 'Inactive paid members', 'description', '', 'match', 'all',
    'conditions', jsonb_build_array(jsonb_build_object(
      'kind', 'metric', 'metric', 'days_since_last_paid_order',
      'operator', 'at_least', 'minimum', '30', 'maximum', null,
      'window', null, 'activityCodes', jsonb_build_array()
    ))
  );
$$;

create function pg_temp.m07_rolling_audience()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'schemaVersion', '1', 'code', 'recent_spenders',
    'name', 'Recent spenders', 'description', '', 'match', 'all',
    'conditions', jsonb_build_array(jsonb_build_object(
      'kind', 'metric', 'metric', 'eligible_spend',
      'operator', 'at_least', 'minimum', '1', 'maximum', null,
      'window', jsonb_build_object('kind', 'rolling_days', 'days', 30),
      'activityCodes', jsonb_build_array()
    ))
  );
$$;

select lives_ok(
  $$ select loyalty_private.set_deployment_mode(
    'managed', 1, 'test:m07', 'Exercise managed campaign gating',
    now() - interval '2 minutes'
  ) $$,
  'test enters managed mode through the append-only deployment command'
);
select lives_ok(
  $$ select loyalty_private.set_organization_entitlement(
    '87000000-0000-4000-8000-000000000100', 'campaigns', 'enabled', null,
    'canary', 'test:m07', 'Enable campaigns for audience canary',
    now() - interval '90 seconds', null
  ) $$,
  'test enables campaigns for only the canary tenant'
);

set local role authenticated;
set local request.jwt.claim.sub = '88000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select * from loyalty.create_audience_draft_command(
    '88000000-0000-4000-8000-000000000101',
    pg_temp.m07_value_audience('blocked'), 'm07:blocked:draft',
    '88000000-0000-4000-8000-000000000201'
  ) $$,
  '42501', 'campaigns are not enabled for this organization',
  'managed control tenant cannot bypass the campaign entitlement'
);

set local request.jwt.claim.sub = '87000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select * from loyalty.create_audience_draft_command(
    '87000000-0000-4000-8000-000000000101', null::jsonb,
    'm07:invalid:null', '87000000-0000-4000-8000-000000000200'
  ) $$,
  '22023', 'invalid AudienceDefinitionV1',
  'SQL null cannot bypass the independent audience validator'
);
select throws_ok(
  $$ select * from loyalty.create_audience_draft_command(
    '87000000-0000-4000-8000-000000000101',
    jsonb_set(pg_temp.m07_value_audience('sql_injection'),
      '{conditions,0,sql}', '"select true"'::jsonb),
    'm07:invalid:sql', '87000000-0000-4000-8000-000000000201'
  ) $$,
  '22023', 'invalid audience condition',
  'arbitrary merchant SQL fails at the independent database boundary'
);
select throws_ok(
  $$ select * from loyalty.create_audience_draft_command(
    '87000000-0000-4000-8000-000000000101',
    jsonb_set(pg_temp.m07_value_audience('invalid_window'),
      '{conditions,0,window}', '{"kind":"lifetime"}'::jsonb),
    'm07:invalid:window', '87000000-0000-4000-8000-000000000202'
  ) $$,
  '22023', 'invalid audience metric condition',
  'current balance metrics cannot smuggle a historical window'
);
select throws_ok(
  $$ select * from loyalty.create_audience_draft_command(
    '87000000-0000-4000-8000-000000000101',
    jsonb_set(jsonb_set(pg_temp.m07_value_audience('invalid_range'),
      '{conditions,0,operator}', '"between"'::jsonb),
      '{conditions,0,maximum}', '"999"'::jsonb),
    'm07:invalid:range', '87000000-0000-4000-8000-000000000203'
  ) $$,
  '22023', 'invalid audience metric condition',
  'an inverted bigint range fails before storage'
);
select results_eq(
  $$ select outcome from loyalty.create_audience_draft_command(
    '87000000-0000-4000-8000-000000000101',
    pg_temp.m07_value_audience('established'), 'm07:established:draft',
    '87000000-0000-4000-8000-000000000204'
  ) $$,
  array['created'::text],
  'entitled owner stores one strict audience draft'
);
reset role;
select throws_ok(
  $$ insert into loyalty.audience_versions (
       organization_id, programme_group_id, audience_id, version_number,
       status, definition, definition_sha256, created_by_user_id
     )
     select version.organization_id, version.programme_group_id,
       version.audience_id, 2, 'draft', version.definition,
       decode(repeat('a', 64), 'hex'),
       '87000000-0000-4000-8000-000000000001'::uuid
     from loyalty.audience_versions as version
     join loyalty.audiences as audience on audience.id = version.audience_id
     where audience.code = 'established' $$,
  '23514', 'audience definition hash mismatch',
  'storage rejects a definition whose claimed hash does not match its JSON'
);
set local role authenticated;
set local request.jwt.claim.sub = '87000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select outcome from loyalty.create_audience_draft_command(
    '87000000-0000-4000-8000-000000000101',
    pg_temp.m07_value_audience('established'), 'm07:established:draft',
    '87000000-0000-4000-8000-000000000299'
  ) $$,
  array['duplicate'::text],
  'exact audience draft retry resolves to the original version'
);
select throws_ok(
  $$ select * from loyalty.create_audience_draft_command(
    '87000000-0000-4000-8000-000000000101',
    jsonb_set(pg_temp.m07_value_audience('established'),
      '{name}', '"Changed"'::jsonb), 'm07:established:draft',
    '87000000-0000-4000-8000-000000000205'
  ) $$,
  '23514', 'audience command idempotency conflict',
  'idempotency-key reuse with different definition fails closed'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.audience_versions $$,
  array[1::bigint],
  'rejected and duplicate audience drafts create no extra version'
);
select results_eq(
  $$ select outcome from loyalty.publish_audience_version_command(
    (select public_id from loyalty.audience_versions),
    (select encode(definition_sha256, 'hex') from loyalty.audience_versions),
    'm07:established:publish', '87000000-0000-4000-8000-000000000206'
  ) $$,
  array['created'::text],
  'reviewed audience definition publishes through the Auth-derived command'
);
select results_eq(
  $$ select outcome from loyalty.publish_audience_version_command(
    (select public_id from loyalty.audience_versions),
    (select encode(definition_sha256, 'hex') from loyalty.audience_versions),
    'm07:established:publish', '87000000-0000-4000-8000-000000000297'
  ) $$,
  array['duplicate'::text],
  'exact publication retry retains the original publication time'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.audience_versions
     where status = 'published' $$,
  array[1::bigint],
  'one audience code has exactly one published version'
);
select results_eq(
  $$ select member_count from loyalty.create_audience_snapshot_command(
    (select public_id from loyalty.audience_versions where status = 'published'),
    'm07:established:snapshot', '87000000-0000-4000-8000-000000000207'
  ) $$,
  array['1'::text],
  'database-timed all-condition snapshot includes only the established member'
);
reset role;

select results_eq(
  $$ select count(*)::bigint from loyalty_private.audience_snapshot_members $$,
  array[1::bigint],
  'snapshot member count reconciles to private membership evidence'
);
select results_eq(
  $$ select evaluation ->> 'subjectReference', evaluation ->> 'included'
     from loyalty_private.audience_snapshot_members $$,
  $$ values (
    'customer:87000000-0000-4000-8000-000000000301'::text, 'true'::text
  ) $$,
  'included member retains a pseudonymous subject and exact decision'
);

set local role authenticated;
set local request.jwt.claim.sub = '87000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select outcome from loyalty.create_audience_snapshot_command(
    (select public_id from loyalty.audience_versions where status = 'published'),
    'm07:established:snapshot', '87000000-0000-4000-8000-000000000296'
  ) $$,
  array['duplicate'::text],
  'exact snapshot retry returns the database-created snapshot'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.audience_snapshots $$,
  array[1::bigint],
  'snapshot retry creates no duplicate membership set'
);
reset role;

select throws_ok(
  $$ update loyalty.audiences set code = 'rewritten' $$,
  '55000', 'immutable loyalty history cannot be changed',
  'stable audience identity cannot be renamed'
);
select throws_ok(
  $$ update loyalty.audience_versions
     set definition = jsonb_set(definition, '{name}', '"Rewritten"'::jsonb) $$,
  '55000', 'audience definition history is immutable',
  'published audience definition cannot be rewritten'
);
select throws_ok(
  $$ update loyalty.audience_snapshots set member_count = 99 $$,
  '55000', 'audience snapshots are immutable after completion',
  'completed snapshot totals cannot be rewritten'
);
select throws_ok(
  $$ delete from loyalty_private.audience_snapshot_members $$,
  '55000', 'immutable loyalty history cannot be changed',
  'included member evidence cannot be deleted'
);

set local role authenticated;
set local request.jwt.claim.sub = '87000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select outcome from loyalty.create_audience_draft_command(
    '87000000-0000-4000-8000-000000000101',
    pg_temp.m07_negative_audience(), 'm07:negative:draft',
    '87000000-0000-4000-8000-000000000208'
  ) $$,
  array['created'::text],
  'signed balance evidence can be targeted without clamping'
);
select results_eq(
  $$ select outcome from loyalty.publish_audience_version_command(
    (select version.public_id from loyalty.audience_versions as version
     join loyalty.audiences as audience on audience.id = version.audience_id
     where audience.code = 'negative_balance'),
    (select encode(version.definition_sha256, 'hex')
     from loyalty.audience_versions as version
     join loyalty.audiences as audience on audience.id = version.audience_id
     where audience.code = 'negative_balance'),
    'm07:negative:publish', '87000000-0000-4000-8000-000000000209'
  ) $$,
  array['created'::text],
  'negative-balance audience publishes independently'
);
select results_eq(
  $$ select member_count from loyalty.create_audience_snapshot_command(
    (select version.public_id from loyalty.audience_versions as version
     join loyalty.audiences as audience on audience.id = version.audience_id
     where audience.code = 'negative_balance'),
    'm07:negative:snapshot', '87000000-0000-4000-8000-000000000210'
  ) $$,
  array['1'::text],
  'at-most zero snapshot includes the exact negative-balance member only'
);
reset role;
select results_eq(
  $$ select member.evaluation -> 'results' -> 0 ->> 'observedValue'
     from loyalty_private.audience_snapshot_members as member
     join loyalty.audience_snapshots as snapshot
       on snapshot.id = member.audience_snapshot_id
     join loyalty.audience_versions as version
       on version.id = snapshot.audience_version_id
     join loyalty.audiences as audience on audience.id = version.audience_id
     where audience.code = 'negative_balance' $$,
  array['-100'::text],
  'snapshot evidence retains the signed balance exactly'
);

set local role authenticated;
set local request.jwt.claim.sub = '87000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select outcome from loyalty.create_audience_draft_command(
    '87000000-0000-4000-8000-000000000101',
    pg_temp.m07_recency_audience(), 'm07:recency:draft',
    '87000000-0000-4000-8000-000000000211'
  ) $$,
  array['created'::text],
  'no-order recency is authorable with explicit null semantics'
);
select results_eq(
  $$ select outcome from loyalty.publish_audience_version_command(
    (select version.public_id from loyalty.audience_versions as version
     join loyalty.audiences as audience on audience.id = version.audience_id
     where audience.code = 'inactive_paid_members'),
    (select encode(version.definition_sha256, 'hex')
     from loyalty.audience_versions as version
     join loyalty.audiences as audience on audience.id = version.audience_id
     where audience.code = 'inactive_paid_members'),
    'm07:recency:publish', '87000000-0000-4000-8000-000000000212'
  ) $$,
  array['created'::text],
  'recency definition publishes'
);
select results_eq(
  $$ select member_count from loyalty.create_audience_snapshot_command(
    (select version.public_id from loyalty.audience_versions as version
     join loyalty.audiences as audience on audience.id = version.audience_id
     where audience.code = 'inactive_paid_members'),
    'm07:recency:snapshot', '87000000-0000-4000-8000-000000000213'
  ) $$,
  array['0'::text],
  'customers with no paid order are not treated as infinitely inactive'
);
select results_eq(
  $$ select outcome from loyalty.create_audience_draft_command(
    '87000000-0000-4000-8000-000000000101',
    pg_temp.m07_rolling_audience(), 'm07:rolling:draft',
    '87000000-0000-4000-8000-000000000214'
  ) $$,
  array['created'::text],
  'rolling canonical-fact window stores without arbitrary predicates'
);
select results_eq(
  $$ select outcome from loyalty.publish_audience_version_command(
    (select version.public_id from loyalty.audience_versions as version
     join loyalty.audiences as audience on audience.id = version.audience_id
     where audience.code = 'recent_spenders'),
    (select encode(version.definition_sha256, 'hex')
     from loyalty.audience_versions as version
     join loyalty.audiences as audience on audience.id = version.audience_id
     where audience.code = 'recent_spenders'),
    'm07:rolling:publish', '87000000-0000-4000-8000-000000000215'
  ) $$,
  array['created'::text],
  'rolling definition publishes with its exact window'
);
select results_eq(
  $$ select member_count from loyalty.create_audience_snapshot_command(
    (select version.public_id from loyalty.audience_versions as version
     join loyalty.audiences as audience on audience.id = version.audience_id
     where audience.code = 'recent_spenders'),
    'm07:rolling:snapshot', '87000000-0000-4000-8000-000000000216'
  ) $$,
  array['0'::text],
  'empty canonical facts produce exact zero rather than fabricated spend'
);

set local request.jwt.claim.sub = '87000000-0000-4000-8000-000000000002';
select throws_ok(
  $$ select * from loyalty.create_audience_draft_command(
    '87000000-0000-4000-8000-000000000101',
    pg_temp.m07_value_audience('operator_forged'), 'm07:operator:draft',
    '87000000-0000-4000-8000-000000000217'
  ) $$,
  '42501', 'audience command not authorized',
  'operator cannot author audience policy'
);
select results_eq(
  $$ select member_count from loyalty.create_audience_snapshot_command(
    (select version.public_id from loyalty.audience_versions as version
     join loyalty.audiences as audience on audience.id = version.audience_id
     where audience.code = 'recent_spenders'),
    'm07:operator:snapshot', '87000000-0000-4000-8000-000000000218'
  ) $$,
  array['0'::text],
  'operator may run an already-published value-neutral snapshot'
);

set local request.jwt.claim.sub = '87000000-0000-4000-8000-000000000003';
select throws_ok(
  $$ select * from loyalty.create_audience_snapshot_command(
    (select version.public_id from loyalty.audience_versions as version
     join loyalty.audiences as audience on audience.id = version.audience_id
     where audience.code = 'recent_spenders'),
    'm07:analyst:snapshot', '87000000-0000-4000-8000-000000000219'
  ) $$,
  '42501', 'audience command not authorized',
  'analyst remains read-only'
);

set local request.jwt.claim.sub = '88000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select count(*)::bigint from loyalty.audience_snapshots $$,
  array[0::bigint],
  'another tenant cannot read canary audience snapshots'
);
set local request.jwt.claim.sub = '87000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select count(*)::bigint from loyalty.audience_snapshots $$,
  array[5::bigint],
  'canary owner can inspect aggregate snapshot history'
);
select throws_ok(
  $$ select count(*) from loyalty_private.audience_snapshot_members $$,
  '42501', null,
  'canary owner still cannot enumerate private member identities'
);
reset role;

select lives_ok(
  $$ select loyalty_private.set_organization_entitlement(
    '87000000-0000-4000-8000-000000000100', 'campaigns', 'disabled', null,
    'canary', 'test:m07', 'Pause new campaign audience work after test',
    now() - interval '1 second', null
  ) $$,
  'test records an immediately effective campaign rollback decision'
);
set local role authenticated;
set local request.jwt.claim.sub = '87000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select outcome from loyalty.create_audience_snapshot_command(
    (select version.public_id from loyalty.audience_versions as version
     join loyalty.audiences as audience on audience.id = version.audience_id
     where audience.code = 'established'),
    'm07:established:snapshot', '87000000-0000-4000-8000-000000000207'
  ) $$,
  array['duplicate'::text],
  'rollback still resolves an exact retry of an accepted snapshot'
);
select throws_ok(
  $$ select * from loyalty.create_audience_snapshot_command(
    (select version.public_id from loyalty.audience_versions as version
     join loyalty.audiences as audience on audience.id = version.audience_id
     where audience.code = 'established'),
    'm07:disabled:snapshot', '87000000-0000-4000-8000-000000000220'
  ) $$,
  '42501', 'campaigns are not enabled for this organization',
  'rollback blocks new snapshots without deleting accepted history'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.audience_snapshots $$,
  array[5::bigint],
  'rollback preserves every completed audience snapshot'
);
reset role;

select results_eq(
  $$ select count(*)::bigint from loyalty.admin_audit_events
     where action like 'audience.%' $$,
  array[13::bigint],
  'audience drafts publications and unique snapshots retain immutable audit evidence'
);

select * from finish();
rollback;
