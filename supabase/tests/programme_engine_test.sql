begin;

create extension if not exists pgtap with schema extensions;

select plan(89);

select has_table('loyalty', 'programme_tiers', 'programme tiers exist');
select has_table('loyalty', 'programme_rewards', 'programme rewards exist');
select has_table('loyalty', 'tier_decisions', 'tier decisions exist');
select has_table('loyalty', 'tier_memberships', 'tier membership intervals exist');
select has_table('loyalty', 'reward_reservations', 'reward reservations exist');
select has_table('loyalty', 'reward_reservation_transitions', 'reward transitions exist');
select has_table('loyalty_private', 'programme_evaluations', 'programme evaluations exist');
select has_table('loyalty_private', 'point_expiry_notifications', 'point expiry notification fences exist');
select is_empty(
  $$
    select relation.relname
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname in ('loyalty', 'loyalty_private')
      and relation.relname in (
        'programme_tiers', 'programme_rewards', 'tier_decisions', 'tier_memberships',
        'reward_reservations', 'reward_reservation_transitions',
        'programme_evaluations', 'point_expiry_notifications'
      )
      and not relation.relrowsecurity
  $$,
  'every Phase 6 tenant table enables RLS'
);
select ok(
  not has_schema_privilege('authenticated', 'loyalty_private', 'USAGE'),
  'browser clients cannot use private programme commands'
);
select ok(
  not has_table_privilege('authenticated', 'loyalty.reward_reservations', 'INSERT'),
  'browser clients cannot create reward reservations directly'
);
select ok(
  has_function_privilege(
    'loyalty_worker',
    'loyalty_private.publish_programme_version(uuid,bytea,uuid,timestamp with time zone)',
    'EXECUTE'
  ),
  'worker can publish an approved programme version'
);
select ok(
  not has_function_privilege(
    'loyalty_worker',
    'loyalty_private.materialize_programme_definition(bigint)',
    'EXECUTE'
  ),
  'worker cannot bypass publication through the materialization primitive'
);
select ok(
  has_function_privilege(
    'loyalty_worker',
    'loyalty_private.enqueue_point_expiry_notifications(timestamp with time zone,smallint)',
    'EXECUTE'
  ),
  'worker can schedule idempotent advance expiry notifications'
);

insert into auth.users (id, email)
values
  ('61000000-0000-4000-8000-000000000001', 'programme-one@example.test'),
  ('62000000-0000-4000-8000-000000000002', 'programme-two@example.test');

insert into loyalty.organizations (slug, name)
values ('programme-one', 'Programme One'), ('programme-two', 'Programme Two');

insert into loyalty.organization_memberships (organization_id, user_id, role)
values
  ((select id from loyalty.organizations where slug = 'programme-one'), '61000000-0000-4000-8000-000000000001', 'owner'),
  ((select id from loyalty.organizations where slug = 'programme-two'), '62000000-0000-4000-8000-000000000002', 'owner');

insert into loyalty.programme_groups (organization_id, slug, name)
select id, 'rewards', name || ' Rewards'
from loyalty.organizations where slug in ('programme-one', 'programme-two');

insert into loyalty.programmes (organization_id, programme_group_id, slug, name)
select organization.id, programme_group.id, 'rosy', 'Rosy Rewards'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group on programme_group.organization_id = organization.id;

insert into loyalty.workspaces (organization_id, slug, name)
select id, 'store', name || ' Store'
from loyalty.organizations where slug in ('programme-one', 'programme-two');
insert into loyalty.commerce_connections (
  organization_id, workspace_id, programme_id, external_store_id,
  display_name, current_key_version, signing_material_ref
)
select organization.id, workspace.id, programme.id,
  organization.slug || '-store', organization.name || ' Store',
  'v1', 'vault://' || organization.slug
from loyalty.organizations as organization
join loyalty.workspaces as workspace on workspace.organization_id = organization.id
join loyalty.programmes as programme on programme.organization_id = organization.id
where organization.slug in ('programme-one', 'programme-two');

insert into loyalty.customers (organization_id, display_reference)
select id, slug || '-customer'
from loyalty.organizations where slug in ('programme-one', 'programme-two');
insert into loyalty.customer_identities (
  organization_id, customer_id, commerce_connection_id,
  external_customer_id, identity_kind, verified_at
)
select customer.organization_id, customer.id, connection.id,
  'registered:7', 'registered', now()
from loyalty.customers as customer
join loyalty.commerce_connections as connection
  on connection.organization_id = customer.organization_id;

create temporary table programme_refs (
  name text primary key,
  public_id uuid not null
);

insert into programme_refs
select 'version-one', result.programme_version_public_id
from loyalty_private.create_programme_draft(
  (select id from loyalty.organizations where slug = 'programme-one'),
  (select programme.id from loyalty.programmes as programme
   join loyalty.organizations as organization on organization.id = programme.organization_id
   where organization.slug = 'programme-one'),
  '{
    "tiers": [
      {"code":"rose","name":"Rose","minimumEligibleSpendMinor":0,"pointsPerMajorUnit":5},
      {"code":"bloom","name":"Bloom","minimumEligibleSpendMinor":15000,"pointsPerMajorUnit":6},
      {"code":"icon","name":"Icon","minimumEligibleSpendMinor":50000,"pointsPerMajorUnit":7}
    ],
    "rewards": [
      {"code":"ten-euro","name":"Ten euro off","kind":"fixed_discount","costPoints":100,"configuration":{"amountMinor":1000}},
      {"code":"free-shipping","name":"Free shipping","kind":"free_shipping","costPoints":50}
    ]
  }'::jsonb,
  decode(repeat('1', 64), 'hex'),
  '61000000-0000-4000-8000-000000000001'
) as result;

select results_eq(
  $$ select version_number from loyalty.programme_versions where public_id = (select public_id from programme_refs where name = 'version-one') $$,
  array[1],
  'first draft receives version number one'
);
select results_eq(
  $$ select status from loyalty.programme_versions where public_id = (select public_id from programme_refs where name = 'version-one') $$,
  array['draft'::text],
  'new programme version starts as a draft'
);
select throws_ok(
  $$ select loyalty_private.publish_programme_version(
    (select public_id from programme_refs where name = 'version-one'),
    decode(repeat('2', 64), 'hex'),
    '61000000-0000-4000-8000-000000000001',
    '2026-08-12T08:00:00Z'
  ) $$,
  '23514', 'programme configuration hash conflict',
  'publication rejects a stale configuration hash'
);
select lives_ok(
  $$ select loyalty_private.publish_programme_version(
    (select public_id from programme_refs where name = 'version-one'),
    decode(repeat('1', 64), 'hex'),
    '61000000-0000-4000-8000-000000000001',
    '2026-08-12T08:00:00Z'
  ) $$,
  'an approved draft can be published'
);
select results_eq(
  $$ select status from loyalty.programme_versions where public_id = (select public_id from programme_refs where name = 'version-one') $$,
  array['published'::text],
  'publication makes the version current'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.programme_tiers where programme_version_id =
    (select id from loyalty.programme_versions where public_id = (select public_id from programme_refs where name = 'version-one')) $$,
  array[3::bigint],
  'publication materializes all tier definitions'
);
select results_eq(
  $$ select code from loyalty.programme_tiers where programme_version_id =
    (select id from loyalty.programme_versions where public_id = (select public_id from programme_refs where name = 'version-one'))
    order by ordinal $$,
  array['rose'::text, 'bloom'::text, 'icon'::text],
  'tier order is deterministic'
);
select results_eq(
  $$ select minimum_eligible_spend_minor from loyalty.programme_tiers where programme_version_id =
    (select id from loyalty.programme_versions where public_id = (select public_id from programme_refs where name = 'version-one'))
    order by ordinal $$,
  array[0::bigint, 15000::bigint, 50000::bigint],
  'tier thresholds retain exact minor-unit values'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.programme_rewards where programme_version_id =
    (select id from loyalty.programme_versions where public_id = (select public_id from programme_refs where name = 'version-one')) $$,
  array[2::bigint],
  'publication materializes connector-neutral rewards'
);
select throws_ok(
  $$ update loyalty.programme_versions set configuration = '{}'::jsonb where public_id =
    (select public_id from programme_refs where name = 'version-one') $$,
  '55000', 'published programme version is immutable',
  'published configuration cannot be rewritten'
);
select throws_ok(
  $$ update loyalty.programme_tiers set points_per_major_unit = 99 where code = 'rose' $$,
  '55000', 'immutable loyalty history cannot be changed',
  'materialized tier definitions cannot be rewritten'
);
select throws_ok(
  $$ delete from loyalty.programme_rewards where code = 'ten-euro' $$,
  '55000', 'immutable loyalty history cannot be changed',
  'materialized reward definitions cannot be deleted'
);

insert into programme_refs
select 'version-two', result.programme_version_public_id
from loyalty_private.create_programme_draft(
  (select id from loyalty.organizations where slug = 'programme-one'),
  (select programme.id from loyalty.programmes as programme
   join loyalty.organizations as organization on organization.id = programme.organization_id
   where organization.slug = 'programme-one'),
  '{
    "tiers": [
      {"code":"rose","name":"Rose","minimumEligibleSpendMinor":0,"pointsPerMajorUnit":6},
      {"code":"bloom","name":"Bloom","minimumEligibleSpendMinor":20000,"pointsPerMajorUnit":7}
    ],
    "rewards": [{"code":"ten-euro","name":"Ten euro off","kind":"fixed_discount","costPoints":100,"configuration":{"amountMinor":1000}}]
  }'::jsonb,
  decode(repeat('3', 64), 'hex'),
  '61000000-0000-4000-8000-000000000001'
) as result;

select throws_ok(
  $$ select loyalty_private.schedule_programme_version(
    (select public_id from programme_refs where name = 'version-two'),
    decode(repeat('3', 64), 'hex'),
    '61000000-0000-4000-8000-000000000001', now() - interval '1 minute'
  ) $$,
  '22023', 'programme schedule must be in the future',
  'past publication schedules are rejected'
);
select lives_ok(
  $$ select loyalty_private.schedule_programme_version(
    (select public_id from programme_refs where name = 'version-two'),
    decode(repeat('3', 64), 'hex'),
    '61000000-0000-4000-8000-000000000001', '2026-12-01T00:00:00Z'
  ) $$,
  'a future version can be scheduled'
);
select results_eq(
  $$ select status from loyalty.programme_versions where public_id = (select public_id from programme_refs where name = 'version-two') $$,
  array['scheduled'::text],
  'scheduled version records its lifecycle state'
);
select results_eq(
  $$ select loyalty_private.activate_scheduled_programme_versions('2026-11-30T23:59:59Z') $$,
  array[0::bigint],
  'scheduler does not activate a version early'
);
select results_eq(
  $$ select loyalty_private.activate_scheduled_programme_versions('2026-12-01T00:00:00Z') $$,
  array[1::bigint],
  'scheduler activates a due version exactly once'
);
select results_eq(
  $$ select loyalty_private.activate_scheduled_programme_versions('2026-12-02T00:00:00Z') $$,
  array[0::bigint],
  'scheduler retry has no duplicate effect'
);
select results_eq(
  $$ select status from loyalty.programme_versions where public_id = (select public_id from programme_refs where name = 'version-one') $$,
  array['superseded'::text],
  'scheduled activation supersedes the old version'
);
select results_eq(
  $$ select status from loyalty.programme_versions where public_id = (select public_id from programme_refs where name = 'version-two') $$,
  array['published'::text],
  'scheduled activation publishes the new version'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.programme_versions where organization_id =
    (select id from loyalty.organizations where slug = 'programme-one') and status = 'published' $$,
  array[1::bigint],
  'a programme has exactly one current published version'
);

insert into programme_refs
select 'invalid-version', result.programme_version_public_id
from loyalty_private.create_programme_draft(
  (select id from loyalty.organizations where slug = 'programme-one'),
  (select programme.id from loyalty.programmes as programme
   join loyalty.organizations as organization on organization.id = programme.organization_id
   where organization.slug = 'programme-one'),
  '{"tiers":[{"code":"bad","name":"Bad","minimumEligibleSpendMinor":10,"pointsPerMajorUnit":1}]}'::jsonb,
  decode(repeat('4', 64), 'hex'),
  '61000000-0000-4000-8000-000000000001'
) as result;
select throws_ok(
  $$ select loyalty_private.publish_programme_version(
    (select public_id from programme_refs where name = 'invalid-version'),
    decode(repeat('4', 64), 'hex'),
    '61000000-0000-4000-8000-000000000001', now()
  ) $$,
  '23514', 'programme tier thresholds must start at zero and increase',
  'invalid tier thresholds cannot be published'
);
select results_eq(
  $$ select status from loyalty.programme_versions where public_id = (select public_id from programme_refs where name = 'invalid-version') $$,
  array['draft'::text],
  'failed publication leaves the draft editable'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.programme_tiers where programme_version_id =
    (select id from loyalty.programme_versions where public_id = (select public_id from programme_refs where name = 'invalid-version')) $$,
  array[0::bigint],
  'failed materialization leaves no partial tier definitions'
);

create temporary table programme_results (
  operation text primary key,
  public_id uuid not null,
  outcome text not null
);

insert into programme_results
select 'evaluation', result.evaluation_public_id, result.outcome
from loyalty_private.record_programme_evaluation(
  (select id from loyalty.organizations where slug = 'programme-one'),
  (select id from loyalty.programme_groups where organization_id = (select id from loyalty.organizations where slug = 'programme-one')),
  (select id from loyalty.programme_versions where public_id = (select public_id from programme_refs where name = 'version-two')),
  null, 'simulation', 'order:42', 'evaluation:42',
  decode(repeat('5', 64), 'hex'), decode(repeat('6', 64), 'hex'),
  '{"points":250}'::jsonb, '{"rules":["base"]}'::jsonb, '2026-12-02T01:00:00Z'
) as result;
select results_eq(
  $$ select outcome from programme_results where operation = 'evaluation' $$,
  array['created'::text],
  'first evaluation writes immutable evidence'
);
select results_eq(
  $$ select evaluation_public_id = (select public_id from programme_results where operation = 'evaluation')
    and outcome = 'duplicate' from loyalty_private.record_programme_evaluation(
    (select id from loyalty.organizations where slug = 'programme-one'),
    (select id from loyalty.programme_groups where organization_id = (select id from loyalty.organizations where slug = 'programme-one')),
    (select id from loyalty.programme_versions where public_id = (select public_id from programme_refs where name = 'version-two')),
    null, 'simulation', 'order:42', 'evaluation:42',
    decode(repeat('5', 64), 'hex'), decode(repeat('6', 64), 'hex'),
    '{"points":250}'::jsonb, '{"rules":["base"]}'::jsonb, '2026-12-02T01:00:00Z'
  ) $$,
  array[true],
  'evaluation retry returns the same evidence identity'
);
select throws_ok(
  $$ select * from loyalty_private.record_programme_evaluation(
    (select id from loyalty.organizations where slug = 'programme-one'),
    (select id from loyalty.programme_groups where organization_id = (select id from loyalty.organizations where slug = 'programme-one')),
    (select id from loyalty.programme_versions where public_id = (select public_id from programme_refs where name = 'version-two')),
    null, 'simulation', 'order:42', 'evaluation:42',
    decode(repeat('7', 64), 'hex'), decode(repeat('6', 64), 'hex'),
    '{}'::jsonb, '{}'::jsonb, now()
  ) $$,
  '23514', 'evaluation idempotency hash conflict',
  'evaluation idempotency key rejects changed input'
);
select results_eq(
  $$
    select outcome from loyalty_private.record_programme_evaluation(
      (select id from loyalty.organizations where slug = 'programme-one'),
      (select id from loyalty.programme_groups where organization_id = (select id from loyalty.organizations where slug = 'programme-one')),
      (select id from loyalty.programme_versions where public_id = (select public_id from programme_refs where name = 'version-two')),
      null, 'live_refund', 'order:42:refund:9', 'evaluation:42:refund:9',
      decode(repeat('8', 64), 'hex'), decode(repeat('9', 64), 'hex'),
      '{"reversalPoints":25}'::jsonb, '{"rules":["original-award"]}'::jsonb,
      '2026-12-02T01:05:00Z'
    )
  $$,
  array['created'::text],
  'refund evaluation stores immutable original-award evidence'
);
select throws_ok(
  $$ delete from loyalty_private.programme_evaluations where idempotency_key = 'evaluation:42' $$,
  '55000', 'immutable loyalty history cannot be changed',
  'evaluation evidence cannot be deleted'
);

select loyalty_private.ensure_wallet_accounts(
  (select id from loyalty.organizations where slug = 'programme-one'),
  (select id from loyalty.programme_groups where organization_id = (select id from loyalty.organizations where slug = 'programme-one')),
  (select id from loyalty.customers where organization_id = (select id from loyalty.organizations where slug = 'programme-one'))
);

insert into programme_results
select 'tier-decision', result.tier_decision_public_id, result.outcome
from loyalty_private.record_tier_decision(
  (select id from loyalty.organizations where slug = 'programme-one'),
  (select id from loyalty.programme_groups where organization_id = (select id from loyalty.organizations where slug = 'programme-one')),
  (select id from loyalty.programme_versions where public_id = (select public_id from programme_refs where name = 'version-two')),
  (select id from loyalty.wallets where organization_id = (select id from loyalty.organizations where slug = 'programme-one')),
  'bloom', 'bloom', 'upgrade', 25000, null, null, '2026-12-02T02:00:00Z',
  'tier:wallet:1', decode(repeat('8', 64), 'hex'), '{"windowDays":365}'::jsonb
) as result;
select results_eq(
  $$ select outcome from programme_results where operation = 'tier-decision' $$,
  array['created'::text],
  'tier review writes an attributable decision'
);
select results_eq(
  $$ select tier_code from loyalty.tier_memberships where effective_until is null $$,
  array['bloom'::text],
  'first tier decision opens the current membership interval'
);
select results_eq(
  $$ select tier_decision_public_id = (select public_id from programme_results where operation = 'tier-decision')
    and outcome = 'duplicate' from loyalty_private.record_tier_decision(
    (select id from loyalty.organizations where slug = 'programme-one'),
    (select id from loyalty.programme_groups where organization_id = (select id from loyalty.organizations where slug = 'programme-one')),
    (select id from loyalty.programme_versions where public_id = (select public_id from programme_refs where name = 'version-two')),
    (select id from loyalty.wallets where organization_id = (select id from loyalty.organizations where slug = 'programme-one')),
    'bloom', 'bloom', 'upgrade', 25000, null, null, '2026-12-02T02:00:00Z',
    'tier:wallet:1', decode(repeat('8', 64), 'hex'), '{"windowDays":365}'::jsonb
  ) $$,
  array[true],
  'tier decision retry returns the existing evidence'
);
select throws_ok(
  $$ select * from loyalty_private.record_tier_decision(
    (select id from loyalty.organizations where slug = 'programme-one'),
    (select id from loyalty.programme_groups where organization_id = (select id from loyalty.organizations where slug = 'programme-one')),
    (select id from loyalty.programme_versions where public_id = (select public_id from programme_refs where name = 'version-two')),
    (select id from loyalty.wallets where organization_id = (select id from loyalty.organizations where slug = 'programme-one')),
    'bloom', 'bloom', 'upgrade', 25000, null, null, now(),
    'tier:wallet:1', decode(repeat('9', 64), 'hex'), '{}'::jsonb
  ) $$,
  '23514', 'tier decision idempotency hash conflict',
  'tier decision idempotency key rejects changed input'
);
select throws_ok(
  $$ update loyalty.tier_decisions set rolling_eligible_spend_minor = 1 $$,
  '55000', 'immutable loyalty history cannot be changed',
  'tier decisions cannot be rewritten'
);
select lives_ok(
  $$ select * from loyalty_private.record_tier_decision(
    (select id from loyalty.organizations where slug = 'programme-one'),
    (select id from loyalty.programme_groups where organization_id = (select id from loyalty.organizations where slug = 'programme-one')),
    (select id from loyalty.programme_versions where public_id = (select public_id from programme_refs where name = 'version-two')),
    (select id from loyalty.wallets where organization_id = (select id from loyalty.organizations where slug = 'programme-one')),
    'rose', 'bloom', 'manual', 25000, null, null, '2026-12-03T02:00:00Z',
    'tier:wallet:manual', decode(repeat('9a', 32), 'hex'), '{"reason":"support override"}'::jsonb
  ) $$,
  'manual tier decision atomically changes the effective interval'
);
select results_eq(
  'select count(*)::bigint from loyalty.tier_memberships',
  array[2::bigint],
  'tier change preserves both membership intervals'
);
select results_eq(
  $$ select effective_until from loyalty.tier_memberships where tier_code = 'bloom' $$,
  array['2026-12-03T02:00:00Z'::timestamptz],
  'prior tier interval closes at the decision instant'
);
select results_eq(
  $$ select tier_code from loyalty.tier_memberships where effective_until is null $$,
  array['rose'::text],
  'manual override opens one new current tier interval'
);

insert into programme_results
select 'adjust', result.transaction_public_id, result.outcome
from loyalty_private.adjust_points(
  (select id from loyalty.organizations where slug = 'programme-one'),
  (select public_id from loyalty.wallets where organization_id = (select id from loyalty.organizations where slug = 'programme-one')),
  (select id from loyalty.programme_versions where public_id = (select public_id from programme_refs where name = 'version-two')),
  500, 'test balance setup', 'programme-test', 'adjust:programme:1',
  decode(repeat('a', 64), 'hex'), '2027-12-01T00:00:00Z', '2026-12-02T03:00:00Z'
) as result;
select results_eq(
  $$ select outcome from programme_results where operation = 'adjust' $$,
  array['created'::text],
  'test wallet receives available points through the ledger'
);
select results_eq(
  $$ select loyalty_private.enqueue_point_expiry_notifications('2027-11-15T00:00:00Z', 30::smallint) $$,
  array[1::bigint],
  'advance expiry scheduler enqueues a due point lot'
);
select results_eq(
  $$ select loyalty_private.enqueue_point_expiry_notifications('2027-11-15T00:00:00Z', 30::smallint) $$,
  array[0::bigint],
  'advance expiry scheduler retry creates no duplicate'
);
select results_eq(
  $$ select count(*)::bigint from loyalty_private.point_expiry_notifications where outbox_id is not null $$,
  array[1::bigint],
  'expiry notification fence retains its outbox command link'
);
select results_eq(
  $$ select topic from loyalty_private.transactional_outbox where topic = 'loyalty.points.expiring' $$,
  array['loyalty.points.expiring'::text],
  'expiry notification is delivered through the transactional outbox'
);

insert into programme_results
select 'reservation', result.reservation_public_id, result.outcome
from loyalty_private.create_reward_reservation(
  (select id from loyalty.organizations where slug = 'programme-one'),
  (select id from loyalty.programme_groups where organization_id = (select id from loyalty.organizations where slug = 'programme-one')),
  (select id from loyalty.programme_versions where public_id = (select public_id from programme_refs where name = 'version-two')),
  (select id from loyalty.wallets where organization_id = (select id from loyalty.organizations where slug = 'programme-one')),
  (select id from loyalty.programme_rewards where code = 'ten-euro' and programme_version_id =
    (select id from loyalty.programme_versions where public_id = (select public_id from programme_refs where name = 'version-two'))),
  100, '2026-12-03T00:00:00Z', 'reward:42', decode(repeat('b', 64), 'hex')
) as result;
select results_eq(
  $$ select outcome from programme_results where operation = 'reservation' $$,
  array['created'::text],
  'reward request creates one reservation'
);
select results_eq(
  $$ select reservation_public_id = (select public_id from programme_results where operation = 'reservation')
    and outcome = 'duplicate' from loyalty_private.create_reward_reservation(
    (select id from loyalty.organizations where slug = 'programme-one'),
    (select id from loyalty.programme_groups where organization_id = (select id from loyalty.organizations where slug = 'programme-one')),
    (select id from loyalty.programme_versions where public_id = (select public_id from programme_refs where name = 'version-two')),
    (select id from loyalty.wallets where organization_id = (select id from loyalty.organizations where slug = 'programme-one')),
    (select id from loyalty.programme_rewards where code = 'ten-euro' and programme_version_id =
      (select id from loyalty.programme_versions where public_id = (select public_id from programme_refs where name = 'version-two'))),
    100, '2026-12-03T00:00:00Z', 'reward:42', decode(repeat('b', 64), 'hex')
  ) $$,
  array[true],
  'reward request retry returns the same reservation'
);
select throws_ok(
  $$ select * from loyalty_private.create_reward_reservation(
    (select id from loyalty.organizations where slug = 'programme-one'),
    (select id from loyalty.programme_groups where organization_id = (select id from loyalty.organizations where slug = 'programme-one')),
    (select id from loyalty.programme_versions where public_id = (select public_id from programme_refs where name = 'version-two')),
    (select id from loyalty.wallets where organization_id = (select id from loyalty.organizations where slug = 'programme-one')),
    (select id from loyalty.programme_rewards where code = 'ten-euro' and programme_version_id =
      (select id from loyalty.programme_versions where public_id = (select public_id from programme_refs where name = 'version-two'))),
    101, '2026-12-03T00:00:00Z', 'reward:wrong-cost', decode(repeat('c', 64), 'hex')
  ) $$,
  '22023', 'reward definition or cost mismatch',
  'reservation cannot alter the approved points cost'
);
select throws_ok(
  $$ update loyalty.reward_reservations set cost_points = 1 where idempotency_key = 'reward:42' $$,
  '55000', 'reward reservation identity and value are immutable',
  'reservation value cannot be rewritten'
);

insert into programme_results
select 'ledger-reserve', result.transaction_public_id, result.outcome
from loyalty_private.reserve_points(
  (select id from loyalty.organizations where slug = 'programme-one'),
  (select id from loyalty.programme_groups where organization_id = (select id from loyalty.organizations where slug = 'programme-one')),
  (select id from loyalty.programme_versions where public_id = (select public_id from programme_refs where name = 'version-two')),
  (select public_id from loyalty.wallets where organization_id = (select id from loyalty.organizations where slug = 'programme-one')),
  100, 'ledger:reward:42:reserve', decode(repeat('d', 64), 'hex'), '2026-12-02T04:00:00Z'
) as result;
select results_eq(
  $$ select reservation_public_id = (select public_id from programme_results where operation = 'reservation')
    and state = 'reserved' and outcome = 'created'
    from loyalty_private.transition_reward_reservation(
    (select public_id from programme_results where operation = 'reservation'),
    'reserved', 'transition:42:reserved', decode(repeat('e', 64), 'hex'),
    'reward-worker', null,
    (select public_id from programme_results where operation = 'ledger-reserve'), null
  ) $$,
  array[true],
  'reservation enters reserved state only with matching ledger evidence'
);
select results_eq(
  $$ select outcome from loyalty_private.transition_reward_reservation(
    (select public_id from programme_results where operation = 'reservation'),
    'reserved', 'transition:42:reserved', decode(repeat('e', 64), 'hex'),
    'reward-worker', null,
    (select public_id from programme_results where operation = 'ledger-reserve'), null
  ) $$,
  array['duplicate'::text],
  'reservation transition retry has no second effect'
);
select results_eq(
  $$ select state from loyalty.reward_reservations where public_id = (select public_id from programme_results where operation = 'reservation') $$,
  array['reserved'::text],
  'reward reservation projects the transition state'
);
select results_eq(
  $$ select transaction_kind from loyalty.ledger_transactions where id =
    (select ledger_transaction_id from loyalty.reward_reservation_transitions where idempotency_key = 'transition:42:reserved') $$,
  array['reserve'::text],
  'transition retains immutable ledger transaction evidence'
);
select throws_ok(
  $$ select * from loyalty_private.transition_reward_reservation(
    (select public_id from programme_results where operation = 'reservation'),
    'captured', 'transition:42:invalid', decode(repeat('f', 64), 'hex'), 'reward-worker'
  ) $$,
  '23514', 'invalid reward reservation transition',
  'state machine rejects reserved-to-captured shortcut'
);
select ok(
  has_function_privilege(
    'loyalty_worker',
    'loyalty_private.enqueue_woocommerce_coupon_issue(uuid,uuid,smallint)',
    'EXECUTE'
  ),
  'the worker can enqueue a native coupon from a reserved reward'
);
create temporary table coupon_command as
select * from loyalty_private.enqueue_woocommerce_coupon_issue(
  (select public_id from programme_results where operation = 'reservation'),
  (select public_id from loyalty.commerce_connections where external_store_id = 'programme-one-store'),
  2::smallint
);
select results_eq(
  $$ select outcome from coupon_command $$,
  array['created'::text],
  'a reserved fixed reward creates one native coupon command'
);
select matches(
  (select coupon_code from coupon_command),
  '^SF[A-F0-9]{32}$',
  'generated coupon codes have high-entropy connector-safe form'
);
select results_eq(
  $$
    select coupon_code, outcome
    from loyalty_private.enqueue_woocommerce_coupon_issue(
      (select public_id from programme_results where operation = 'reservation'),
      (select public_id from loyalty.commerce_connections where external_store_id = 'programme-one-store'),
      2::smallint
    )
  $$,
  $$ select coupon_code, 'duplicate'::text from coupon_command $$,
  'coupon enqueue retry returns the original command and code'
);
create temporary table claimed_coupon_command as
select * from loyalty_private.claim_woocommerce_commands(
  (select public_id from loyalty.commerce_connections where external_store_id = 'programme-one-store'),
  10, 60
);
select results_eq(
  $$ select command_id from claimed_coupon_command $$,
  $$ select command_id from coupon_command $$,
  'the connector claims the exact persisted reward command'
);
select results_eq(
  $$
    select outcome from loyalty_private.finish_woocommerce_command(
      (select public_id from loyalty.commerce_connections where external_store_id = 'programme-one-store'),
      (select command_id from coupon_command),
      'delivered', 'woocommerce:coupon:42', null, 0
    )
  $$,
  array['delivered'::text],
  'native coupon acknowledgement completes the connector command'
);
select results_eq(
  $$ select state from loyalty.reward_reservations where public_id = (select public_id from programme_results where operation = 'reservation') $$,
  array['issued'::text],
  'successful coupon acknowledgement marks the reserved reward issued'
);

insert into programme_results
select 'ledger-capture', result.transaction_public_id, result.outcome
from loyalty_private.capture_reservation(
  (select id from loyalty.organizations where slug = 'programme-one'),
  (select public_id from programme_results where operation = 'ledger-reserve'),
  'ledger:reward:42:capture', decode(repeat('1a', 32), 'hex'), '2026-12-02T05:00:00Z'
) as result;
select throws_ok(
  $$ select * from loyalty_private.transition_reward_reservation(
    (select public_id from programme_results where operation = 'reservation'),
    'captured', 'transition:42:wrong-ledger', decode(repeat('2a', 32), 'hex'),
    'reward-worker', null,
    (select public_id from programme_results where operation = 'ledger-reserve'), null
  ) $$,
  '23514', 'ledger transaction kind does not match reward transition',
  'capture transition rejects reservation ledger evidence'
);
select results_eq(
  $$ select outcome from loyalty_private.transition_reward_reservation(
    (select public_id from programme_results where operation = 'reservation'),
    'captured', 'transition:42:captured', decode(repeat('3a', 32), 'hex'),
    'reward-worker', null,
    (select public_id from programme_results where operation = 'ledger-capture'), null
  ) $$,
  array['created'::text],
  'issued reward captures with its related ledger transaction'
);
select results_eq(
  $$ select state from loyalty.reward_reservations where public_id = (select public_id from programme_results where operation = 'reservation') $$,
  array['captured'::text],
  'captured reward reaches its terminal state'
);
select throws_ok(
  $$ delete from loyalty.reward_reservation_transitions where connector_execution_reference = 'woocommerce:coupon:42' $$,
  '55000', 'immutable loyalty history cannot be changed',
  'reward transition history cannot be deleted'
);

insert into programme_results
select 'reservation-two', result.reservation_public_id, result.outcome
from loyalty_private.create_reward_reservation(
  (select id from loyalty.organizations where slug = 'programme-one'),
  (select id from loyalty.programme_groups where organization_id = (select id from loyalty.organizations where slug = 'programme-one')),
  (select id from loyalty.programme_versions where public_id = (select public_id from programme_refs where name = 'version-two')),
  (select id from loyalty.wallets where organization_id = (select id from loyalty.organizations where slug = 'programme-one')),
  (select id from loyalty.programme_rewards where code = 'ten-euro' and programme_version_id =
    (select id from loyalty.programme_versions where public_id = (select public_id from programme_refs where name = 'version-two'))),
  100, '2026-12-03T00:00:00Z', 'reward:43', decode(repeat('4a', 32), 'hex')
) as result;
select throws_ok(
  $$ select * from loyalty_private.transition_reward_reservation(
    (select public_id from programme_results where operation = 'reservation-two'),
    'reserved', 'transition:42:reserved', decode(repeat('e', 64), 'hex'),
    'reward-worker', null,
    (select public_id from programme_results where operation = 'ledger-reserve'), null
  ) $$,
  '23514', 'reservation transition idempotency hash conflict',
  'one transition key cannot be replayed against another reservation'
);

insert into programme_results
select 'ledger-reserve-two', result.transaction_public_id, result.outcome
from loyalty_private.reserve_points(
  (select id from loyalty.organizations where slug = 'programme-one'),
  (select id from loyalty.programme_groups where organization_id = (select id from loyalty.organizations where slug = 'programme-one')),
  (select id from loyalty.programme_versions where public_id = (select public_id from programme_refs where name = 'version-two')),
  (select public_id from loyalty.wallets where organization_id = (select id from loyalty.organizations where slug = 'programme-one')),
  100, 'ledger:reward:43:reserve', decode(repeat('5a', 32), 'hex'), '2026-12-02T06:00:00Z'
) as result;
select results_eq(
  $$ select outcome from loyalty_private.transition_reward_reservation(
    (select public_id from programme_results where operation = 'reservation-two'),
    'reserved', 'transition:43:reserved', decode(repeat('6a', 32), 'hex'),
    'reward-worker', null,
    (select public_id from programme_results where operation = 'ledger-reserve-two'), null
  ) $$,
  array['created'::text],
  'second reward reserves its own points and ledger transaction'
);
select results_eq(
  $$ select outcome from loyalty_private.transition_reward_reservation(
    (select public_id from programme_results where operation = 'reservation-two'),
    'cancelled', 'transition:43:cancelled', decode(repeat('7a', 32), 'hex'),
    'woocommerce-worker', 'coupon creation failed'
  ) $$,
  array['created'::text],
  'connector failure records cancellation before compensation'
);

insert into programme_results
select 'ledger-cancel-two', result.transaction_public_id, result.outcome
from loyalty_private.cancel_reservation(
  (select id from loyalty.organizations where slug = 'programme-one'),
  (select public_id from programme_results where operation = 'ledger-reserve-two'),
  'ledger:reward:43:cancel', decode(repeat('8a', 32), 'hex'), '2026-12-02T06:01:00Z'
) as result;
select results_eq(
  $$ select outcome from loyalty_private.transition_reward_reservation(
    (select public_id from programme_results where operation = 'reservation-two'),
    'released', 'transition:43:released', decode(repeat('9a', 32), 'hex'),
    'reward-worker', 'connector failure compensated',
    (select public_id from programme_results where operation = 'ledger-cancel-two'), null
  ) $$,
  array['created'::text],
  'cancelled reward releases through its related compensating transaction'
);
select results_eq(
  $$ select state from loyalty.reward_reservations where public_id = (select public_id from programme_results where operation = 'reservation-two') $$,
  array['released'::text],
  'compensated reward reaches released state'
);
select results_eq(
  $$ select points from loyalty.wallet_balances where account_kind = 'available' $$,
  array[400::bigint],
  'connector failure restores every reserved point exactly once'
);

set local role authenticated;
set local request.jwt.claim.sub = '61000000-0000-4000-8000-000000000001';
select results_eq(
  'select count(*)::bigint from loyalty.programme_tiers',
  array[5::bigint],
  'member can read only their materialized tiers'
);
select results_eq(
  'select count(*)::bigint from loyalty.reward_reservations',
  array[2::bigint],
  'member can read their reward reservations'
);
set local request.jwt.claim.sub = '62000000-0000-4000-8000-000000000002';
select results_eq(
  'select count(*)::bigint from loyalty.programme_tiers',
  array[0::bigint],
  'another tenant cannot read programme tiers'
);
select results_eq(
  'select count(*)::bigint from loyalty.reward_reservations',
  array[0::bigint],
  'another tenant cannot read reward reservations'
);
select results_eq(
  'select count(*)::bigint from loyalty.reward_reservation_transitions',
  array[0::bigint],
  'another tenant cannot read reward transition evidence'
);
select results_eq(
  'select count(*)::bigint from loyalty.tier_memberships',
  array[0::bigint],
  'another tenant cannot read tier membership history'
);

reset role;
select * from finish();
rollback;
