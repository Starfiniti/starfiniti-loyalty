begin;

create extension if not exists pgtap with schema extensions;

select plan(31);

select has_table(
  'loyalty_private', 'member_earning_rule_effects',
  'immutable member/rule usage evidence exists'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'loyalty_private.member_earning_rule_effects'::regclass),
  'member/rule usage evidence has RLS enabled'
);
select has_index(
  'loyalty_private', 'member_earning_rule_effects',
  'member_earning_rule_effects_usage_idx',
  'member cap usage lookup is indexed'
);
select has_trigger(
  'loyalty_private', 'member_earning_rule_effects',
  'member_earning_rule_effects_immutable',
  'member cap evidence is immutable'
);
select ok(
  has_function_privilege(
    'loyalty_worker',
    'loyalty_private.get_member_earning_rule_usage(bigint,bigint,bigint,bigint,timestamp with time zone)',
    'EXECUTE'
  ),
  'worker can enter the serialized usage boundary'
);
select ok(
  has_function_privilege(
    'loyalty_worker',
    'loyalty_private.commit_programme_v2_award(bigint,bigint,bigint,bigint,bigint,text,text,text,bytea,bytea,jsonb,jsonb,timestamp with time zone,timestamp with time zone)',
    'EXECUTE'
  ),
  'worker can enter the atomic V2 award boundary'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'loyalty_private.commit_programme_v2_award(bigint,bigint,bigint,bigint,bigint,text,text,text,bytea,bytea,jsonb,jsonb,timestamp with time zone,timestamp with time zone)',
    'EXECUTE'
  ),
  'browser clients cannot commit V2 value'
);
select ok(
  not has_table_privilege(
    'loyalty_worker', 'loyalty_private.member_earning_rule_effects', 'INSERT'
  ),
  'worker cannot forge cap usage rows directly'
);

insert into auth.users (id, email)
values ('75000000-0000-4000-8000-000000000001', 'v2-cap-owner@example.test');
insert into loyalty.organizations (public_id, slug, name)
values ('75000000-0000-4000-8000-000000000100', 'v2-cap', 'V2 Cap');
insert into loyalty.organization_memberships (organization_id, user_id, role)
values (
  (select id from loyalty.organizations where slug = 'v2-cap'),
  '75000000-0000-4000-8000-000000000001', 'owner'
);
insert into loyalty.programme_groups (organization_id, slug, name)
select id, 'rewards', 'Rewards' from loyalty.organizations where slug = 'v2-cap';
insert into loyalty.workspaces (organization_id, slug, name)
select id, 'store', 'Store' from loyalty.organizations where slug = 'v2-cap';
insert into loyalty.programmes (
  public_id, organization_id, programme_group_id, slug, name, status
)
select '75000000-0000-4000-8000-000000000101', organization.id,
  programme_group.id, 'rewards', 'Rewards', 'active'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
where organization.slug = 'v2-cap';
insert into loyalty.commerce_connections (
  public_id, organization_id, workspace_id, external_store_id, display_name,
  current_key_version, signing_material_ref, programme_id
)
select '75000000-0000-4000-8000-000000000102', organization.id, workspace.id,
  'https://v2-cap.example.test', 'V2 Cap Store', 'v1', 'test://v2-cap', programme.id
from loyalty.organizations as organization
join loyalty.workspaces as workspace on workspace.organization_id = organization.id
join loyalty.programmes as programme on programme.organization_id = organization.id
where organization.slug = 'v2-cap';
insert into loyalty.customers (public_id, organization_id, display_reference)
select '75000000-0000-4000-8000-000000000103', id, 'member-1'
from loyalty.organizations where slug = 'v2-cap';

select lives_ok(
  $$ select loyalty_private.set_deployment_mode(
    'managed', 1, 'test:m03-cap', 'Exercise serialized member cap accounting',
    now() - interval '2 minutes'
  ) $$,
  'test enters managed mode through attributed private configuration'
);
select lives_ok(
  $$ select loyalty_private.set_organization_entitlement(
    '75000000-0000-4000-8000-000000000100', 'programme.v2', 'enabled', null,
    'canary', 'test:m03-cap', 'Enable the member cap test tenant',
    now() - interval '1 minute', null
  ) $$,
  'test enables only its V2 tenant'
);

create temporary table v2_cap_refs (name text primary key, value bigint not null);

insert into v2_cap_refs
select 'version', version.id
from loyalty_private.create_programme_draft(
  (select id from loyalty.organizations where slug = 'v2-cap'),
  (select id from loyalty.programmes where public_id = '75000000-0000-4000-8000-000000000101'),
  '{
    "version":"2","currencyCode":"EUR","currencyMinorUnitDigits":2,
    "pendingDays":30,"pointsExpireAfterDays":365,
    "tiers":[{"code":"rose","name":"Rose","minimumEligibleSpendMinor":"0","pointsPerMajorUnit":"5"}],
    "rewards":[],
    "earningRules":[{
      "code":"purchase-base","name":"Base purchase points","source":"purchase",
      "enabled":true,"priority":0,"stackable":false,
      "effect":{"kind":"base_rate","pointsPerMajorUnit":"5"},
      "conditions":{"productIds":[],"categoryIds":[],"currencyCodes":[],"markets":[],"channels":[],"segmentCodes":[],"tierCodes":[],"startsAt":null,"endsAt":null},
      "purchaseExclusions":{"productIds":[],"categoryIds":[],"shipping":true,"tax":true,"fees":true,"giftCardPayments":true,"storeCreditPayments":true,"discounts":true},
      "cap":{"perEventPoints":"90","perMemberPoints":"100","memberPeriod":"calendar_day","rollingDays":null}
    }]
  }'::jsonb,
  decode(repeat('a', 64), 'hex'),
  '75000000-0000-4000-8000-000000000001'
) as draft
join loyalty.programme_versions as version
  on version.public_id = draft.programme_version_public_id;

select lives_ok(
  $$ select loyalty_private.publish_programme_version(
    (select public_id from loyalty.programme_versions where id = (
      select value from v2_cap_refs where name = 'version'
    )),
    decode(repeat('a', 64), 'hex'),
    '75000000-0000-4000-8000-000000000001',
    '2026-08-13T00:00:00Z'
  ) $$,
  'V2 cap programme publishes'
);

create function pg_temp.add_v2_cap_event(target_number integer, target_occurred_at timestamptz)
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
  select organization.id, connection.id, 'cap-delivery-' || target_number,
    '1', 'cap-event-' || target_number, 'commerce.order.status_changed',
    'order-' || target_number, target_occurred_at, target_occurred_at,
    'v1', 'cap-nonce-' || target_number, repeat(target_number::text, 64),
    '{}'::jsonb, 'applied', target_occurred_at
  from loyalty.organizations as organization
  join loyalty.commerce_connections as connection
    on connection.organization_id = organization.id
  where organization.slug = 'v2-cap'
  returning id into created_inbox_id;

  insert into loyalty_private.canonical_commerce_events (
    organization_id, connection_id, delivery_inbox_id, source_event_id,
    normalization_version, event_type, source_object_id, occurred_at, payload
  )
  select organization.id, connection.id, created_inbox_id,
    'cap-event-' || target_number, 'v1', 'commerce.order.status_changed',
    'order-' || target_number, target_occurred_at, '{}'::jsonb
  from loyalty.organizations as organization
  join loyalty.commerce_connections as connection
    on connection.organization_id = organization.id
  where organization.slug = 'v2-cap'
  returning id into created_event_id;
  return created_event_id;
end;
$$;

insert into v2_cap_refs values
  ('event-1', pg_temp.add_v2_cap_event(1, '2026-08-13T10:00:00Z')),
  ('event-2', pg_temp.add_v2_cap_event(2, '2026-08-13T11:00:00Z')),
  ('event-3', pg_temp.add_v2_cap_event(3, '2026-08-13T12:00:00Z')),
  ('event-4', pg_temp.add_v2_cap_event(4, '2026-08-14T10:00:00Z'));

set local role loyalty_worker;

select results_eq(
  $$ select rule_code, consumed_points from loyalty_private.get_member_earning_rule_usage(
    (select id from loyalty.organizations where slug = 'v2-cap'),
    (select id from loyalty.programme_groups where organization_id = (
      select id from loyalty.organizations where slug = 'v2-cap'
    )),
    (select value from v2_cap_refs where name = 'version'),
    (select id from loyalty.customers where public_id = '75000000-0000-4000-8000-000000000103'),
    '2026-08-13T10:00:00Z'
  ) $$,
  $$ values ('purchase-base'::text, 0::bigint) $$,
  'serialized cap read starts at zero'
);

select results_eq(
  $$ select outcome from loyalty_private.commit_programme_v2_award(
    (select id from loyalty.organizations where slug = 'v2-cap'),
    (select id from loyalty.programme_groups where organization_id = (
      select id from loyalty.organizations where slug = 'v2-cap'
    )),
    (select value from v2_cap_refs where name = 'version'),
    (select value from v2_cap_refs where name = 'event-1'),
    (select id from loyalty.customers where public_id = '75000000-0000-4000-8000-000000000103'),
    'woocommerce:order:1', 'v2:eval:1', 'v2:award:1',
    decode(repeat('1',64),'hex'), decode(repeat('2',64),'hex'),
    '{"version":"2","source":"purchase","awardedPoints":"80","contributions":[{"ruleCode":"purchase-base","effectKind":"base_rate","uncappedPoints":"80","awardedPoints":"80","uncappedNumerator":"80","awardedNumerator":"80","denominator":"1","capApplied":"none"}]}'::jsonb,
    '{}'::jsonb, '2026-08-13T10:00:00Z', '2026-08-13T10:00:01Z'
  ) $$,
  array['created'::text],
  'first award atomically consumes 80 member-cap points'
);
select results_eq(
  $$ select consumed_points from loyalty_private.get_member_earning_rule_usage(
    (select id from loyalty.organizations where slug = 'v2-cap'),
    (select id from loyalty.programme_groups where organization_id = (
      select id from loyalty.organizations where slug = 'v2-cap'
    )),
    (select value from v2_cap_refs where name = 'version'),
    (select id from loyalty.customers where public_id = '75000000-0000-4000-8000-000000000103'),
    '2026-08-13T11:00:00Z'
  ) $$,
  array[80::bigint],
  'second event sees committed member usage while holding the same cap lock'
);
select throws_ok(
  $$ select * from loyalty_private.commit_programme_v2_award(
    (select id from loyalty.organizations where slug = 'v2-cap'),
    (select id from loyalty.programme_groups where organization_id = (
      select id from loyalty.organizations where slug = 'v2-cap'
    )), (select value from v2_cap_refs where name = 'version'),
    (select value from v2_cap_refs where name = 'event-2'),
    (select id from loyalty.customers where public_id = '75000000-0000-4000-8000-000000000103'),
    'woocommerce:order:2', 'v2:eval:2-over', 'v2:award:2-over',
    decode(repeat('3',64),'hex'), decode(repeat('4',64),'hex'),
    '{"version":"2","source":"purchase","awardedPoints":"30","contributions":[{"ruleCode":"purchase-base","effectKind":"base_rate","uncappedPoints":"30","awardedPoints":"30","uncappedNumerator":"30","awardedNumerator":"30","denominator":"1","capApplied":"none"}]}'::jsonb,
    '{}'::jsonb, '2026-08-13T11:00:00Z', '2026-08-13T11:00:01Z'
  ) $$,
  '23514', 'V2 per-member cap exceeded',
  'atomic boundary rejects stale worker usage that would exceed the member cap'
);
select results_eq(
  $$ select outcome from loyalty_private.commit_programme_v2_award(
    (select id from loyalty.organizations where slug = 'v2-cap'),
    (select id from loyalty.programme_groups where organization_id = (
      select id from loyalty.organizations where slug = 'v2-cap'
    )), (select value from v2_cap_refs where name = 'version'),
    (select value from v2_cap_refs where name = 'event-2'),
    (select id from loyalty.customers where public_id = '75000000-0000-4000-8000-000000000103'),
    'woocommerce:order:2', 'v2:eval:2', 'v2:award:2',
    decode(repeat('5',64),'hex'), decode(repeat('6',64),'hex'),
    '{"version":"2","source":"purchase","awardedPoints":"20","contributions":[{"ruleCode":"purchase-base","effectKind":"base_rate","uncappedPoints":"30","awardedPoints":"20","uncappedNumerator":"30","awardedNumerator":"20","denominator":"1","capApplied":"per_member"}]}'::jsonb,
    '{}'::jsonb, '2026-08-13T11:00:00Z', '2026-08-13T11:00:01Z'
  ) $$,
  array['created'::text],
  'recomputed award consumes only the remaining 20 points'
);
select results_eq(
  $$ select outcome from loyalty_private.commit_programme_v2_award(
    (select id from loyalty.organizations where slug = 'v2-cap'),
    (select id from loyalty.programme_groups where organization_id = (
      select id from loyalty.organizations where slug = 'v2-cap'
    )), (select value from v2_cap_refs where name = 'version'),
    (select value from v2_cap_refs where name = 'event-2'),
    (select id from loyalty.customers where public_id = '75000000-0000-4000-8000-000000000103'),
    'woocommerce:order:2', 'v2:eval:2', 'v2:award:2',
    decode(repeat('5',64),'hex'), decode(repeat('6',64),'hex'),
    '{"version":"2","source":"purchase","awardedPoints":"20","contributions":[{"ruleCode":"purchase-base","effectKind":"base_rate","uncappedPoints":"30","awardedPoints":"20","uncappedNumerator":"30","awardedNumerator":"20","denominator":"1","capApplied":"per_member"}]}'::jsonb,
    '{}'::jsonb, '2026-08-13T11:00:00Z', '2026-08-13T11:00:01Z'
  ) $$,
  array['duplicate'::text],
  'exact retry returns the original V2 effect without consuming cap twice'
);
select results_eq(
  $$ select count(*)::bigint from loyalty_private.member_earning_rule_effects $$,
  array[2::bigint],
  'two accepted events create exactly two rule-usage fences'
);
select results_eq(
  $$ select sum(awarded_points)::bigint from loyalty_private.member_earning_rule_effects $$,
  array[100::bigint],
  'rule usage reaches but never exceeds the 100-point member cap'
);
select results_eq(
  $$ select sum((metadata ->> 'points')::bigint)::bigint
     from loyalty.ledger_transactions where transaction_kind = 'award' $$,
  array[100::bigint],
  'immutable ledger awards exactly reconcile to rule usage'
);
select results_eq(
  $$ select consumed_points from loyalty_private.get_member_earning_rule_usage(
    (select id from loyalty.organizations where slug = 'v2-cap'),
    (select id from loyalty.programme_groups where organization_id = (
      select id from loyalty.organizations where slug = 'v2-cap'
    )), (select value from v2_cap_refs where name = 'version'),
    (select id from loyalty.customers where public_id = '75000000-0000-4000-8000-000000000103'),
    '2026-08-14T10:00:00Z'
  ) $$,
  array[0::bigint],
  'UTC calendar-day cap resets on the next day'
);
select throws_ok(
  $$ select * from loyalty_private.commit_programme_v2_award(
    (select id from loyalty.organizations where slug = 'v2-cap'),
    (select id from loyalty.programme_groups where organization_id = (
      select id from loyalty.organizations where slug = 'v2-cap'
    )), (select value from v2_cap_refs where name = 'version'),
    (select value from v2_cap_refs where name = 'event-3'),
    (select id from loyalty.customers where public_id = '75000000-0000-4000-8000-000000000103'),
    'woocommerce:order:3', 'v2:eval:3-event-cap', 'v2:award:3-event-cap',
    decode(repeat('7',64),'hex'), decode(repeat('8',64),'hex'),
    '{"version":"2","source":"purchase","awardedPoints":"91","contributions":[{"ruleCode":"purchase-base","effectKind":"base_rate","uncappedPoints":"91","awardedPoints":"91","uncappedNumerator":"91","awardedNumerator":"91","denominator":"1","capApplied":"none"}]}'::jsonb,
    '{}'::jsonb, '2026-08-13T12:00:00Z', '2026-08-13T12:00:01Z'
  ) $$,
  '23514', 'V2 per-event cap exceeded',
  'database independently enforces the per-event cap'
);
select throws_ok(
  $$ select * from loyalty_private.commit_programme_v2_award(
    (select id from loyalty.organizations where slug = 'v2-cap'),
    (select id from loyalty.programme_groups where organization_id = (
      select id from loyalty.organizations where slug = 'v2-cap'
    )), (select value from v2_cap_refs where name = 'version'),
    (select value from v2_cap_refs where name = 'event-4'),
    (select id from loyalty.customers where public_id = '75000000-0000-4000-8000-000000000103'),
    'woocommerce:order:4', 'v2:eval:4-total', 'v2:award:4-total',
    decode(repeat('9',64),'hex'), decode(repeat('a',64),'hex'),
    '{"version":"2","source":"purchase","awardedPoints":"21","contributions":[{"ruleCode":"purchase-base","effectKind":"base_rate","uncappedPoints":"20","awardedPoints":"20","uncappedNumerator":"20","awardedNumerator":"20","denominator":"1","capApplied":"none"}]}'::jsonb,
    '{}'::jsonb, '2026-08-14T10:00:00Z', '2026-08-14T10:00:01Z'
  ) $$,
  '23514', 'V2 award total does not match contributions',
  'database rejects a result total that does not reconcile to contributions'
);
select throws_ok(
  $$ select * from loyalty_private.commit_programme_v2_award(
    (select id from loyalty.organizations where slug = 'v2-cap'),
    (select id from loyalty.programme_groups where organization_id = (
      select id from loyalty.organizations where slug = 'v2-cap'
    )), (select value from v2_cap_refs where name = 'version'),
    (select value from v2_cap_refs where name = 'event-4'),
    (select id from loyalty.customers where public_id = '75000000-0000-4000-8000-000000000103'),
    'woocommerce:order:4', 'v2:eval:4-rule', 'v2:award:4-rule',
    decode(repeat('b',64),'hex'), decode(repeat('c',64),'hex'),
    '{"version":"2","source":"purchase","awardedPoints":"1","contributions":[{"ruleCode":"forged-rule","effectKind":"base_rate","uncappedPoints":"1","awardedPoints":"1","uncappedNumerator":"1","awardedNumerator":"1","denominator":"1","capApplied":"none"}]}'::jsonb,
    '{}'::jsonb, '2026-08-14T10:00:00Z', '2026-08-14T10:00:01Z'
  ) $$,
  '23514', 'V2 award contribution does not match published rule',
  'worker cannot attribute value to an unpublished rule'
);
select throws_ok(
  $$ select * from loyalty_private.commit_programme_v2_award(
    (select id from loyalty.organizations where slug = 'v2-cap'),
    (select id from loyalty.programme_groups where organization_id = (
      select id from loyalty.organizations where slug = 'v2-cap'
    )), (select value from v2_cap_refs where name = 'version'),
    (select value from v2_cap_refs where name = 'event-4'),
    (select id from loyalty.customers where public_id = '75000000-0000-4000-8000-000000000103'),
    'woocommerce:order:4', 'v2:eval:4-duplicate', 'v2:award:4-duplicate',
    decode(repeat('d',64),'hex'), decode(repeat('e',64),'hex'),
    '{"version":"2","source":"purchase","awardedPoints":"2","contributions":[{"ruleCode":"purchase-base","effectKind":"base_rate","uncappedPoints":"1","awardedPoints":"1","uncappedNumerator":"1","awardedNumerator":"1","denominator":"1","capApplied":"none"},{"ruleCode":"purchase-base","effectKind":"base_rate","uncappedPoints":"1","awardedPoints":"1","uncappedNumerator":"1","awardedNumerator":"1","denominator":"1","capApplied":"none"}]}'::jsonb,
    '{}'::jsonb, '2026-08-14T10:00:00Z', '2026-08-14T10:00:01Z'
  ) $$,
  '23514', 'duplicate V2 award contribution',
  'one event cannot consume the same rule twice'
);

reset role;

select throws_ok(
  $$ update loyalty_private.member_earning_rule_effects set awarded_points = 1 $$,
  '55000', 'immutable loyalty history cannot be changed',
  'accepted cap usage cannot be rewritten'
);
select throws_ok(
  $$ delete from loyalty_private.member_earning_rule_effects $$,
  '55000', 'immutable loyalty history cannot be changed',
  'accepted cap usage cannot be deleted'
);
select results_eq(
  $$ select count(*)::bigint from loyalty_private.programme_evaluations $$,
  array[2::bigint],
  'only the two accepted V2 evaluations exist'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_transactions where transaction_kind = 'award' $$,
  array[2::bigint],
  'only the two accepted V2 ledger awards exist'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.wallets $$,
  array[1::bigint],
  'accepted V2 awards resolve one customer wallet'
);
select results_eq(
  $$ select points from loyalty.wallet_balances where account_kind = 'pending' $$,
  array[100::bigint],
  'accepted cap-limited value remains pending in the wallet projection'
);

select * from finish();
rollback;
