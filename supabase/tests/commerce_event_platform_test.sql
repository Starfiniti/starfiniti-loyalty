begin;

create extension if not exists pgtap with schema extensions;

select plan(35);

select has_table('loyalty', 'commerce_connections', 'commerce connections exist');
select has_table('loyalty_private', 'commerce_delivery_inbox', 'delivery inbox exists');
select has_table('loyalty_private', 'canonical_commerce_events', 'canonical events exist');
select has_table('loyalty_private', 'commerce_business_effects', 'business effects exist');
select has_table('loyalty_private', 'transactional_outbox', 'transactional outbox exists');

select is_empty(
  $$
    select relation.relname
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname in ('loyalty', 'loyalty_private')
      and relation.relname in (
        'commerce_connections',
        'commerce_delivery_inbox',
        'canonical_commerce_events',
        'commerce_business_effects',
        'transactional_outbox'
      )
      and not relation.relrowsecurity
  $$,
  'every commerce table enables RLS'
);
select ok(
  not has_schema_privilege('authenticated', 'loyalty_private', 'USAGE'),
  'browser clients cannot use the private event schema'
);
select ok(
  has_table_privilege('authenticated', 'loyalty.commerce_connections', 'SELECT'),
  'authenticated users can read RLS-filtered connection metadata'
);
select ok(
  not has_table_privilege('authenticated', 'loyalty.commerce_connections', 'INSERT'),
  'authenticated users cannot create connections directly'
);
select ok(
  has_function_privilege(
    'loyalty_runtime',
    'loyalty_private.accept_commerce_delivery(bigint,bigint,text,text,text,text,text,text,timestamp with time zone,timestamp with time zone,text,text,text,jsonb)',
    'EXECUTE'
  ),
  'ingestion runtime can execute only the acceptance command'
);
select ok(
  has_function_privilege(
    'loyalty_runtime',
    'loyalty_private.normalize_commerce_delivery(uuid,text)',
    'EXECUTE'
  ),
  'ingestion runtime can execute the idempotent normalization command'
);
select ok(
  not has_table_privilege(
    'loyalty_runtime',
    'loyalty_private.commerce_delivery_inbox',
    'SELECT'
  ),
  'ingestion runtime cannot query restricted payload rows'
);
select has_index(
  'loyalty_private',
  'commerce_delivery_inbox',
  'commerce_delivery_inbox_claim_idx',
  'inbox claim path is indexed'
);
select has_index(
  'loyalty_private',
  'canonical_commerce_events',
  'canonical_commerce_events_aggregate_idx',
  'canonical aggregate ordering is indexed'
);
select has_index(
  'loyalty_private',
  'commerce_business_effects',
  'commerce_business_effects_event_idx',
  'business-effect event lookup is indexed'
);
select has_index(
  'loyalty_private',
  'transactional_outbox',
  'transactional_outbox_claim_idx',
  'outbox claim path is indexed'
);
select ok(
  (
    select routine.prosecdef
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'loyalty_private'
      and routine.proname = 'accept_commerce_delivery'
  ),
  'delivery acceptance is security definer'
);
select ok(
  (
    select exists (
      select 1 from unnest(routine.proconfig) as setting
      where setting = 'search_path=""'
    )
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'loyalty_private'
      and routine.proname = 'accept_commerce_delivery'
  ),
  'delivery acceptance fixes an empty search path'
);

insert into auth.users (id, email)
values
  ('77777777-7777-4777-8777-777777777777', 'commerce-one@example.test'),
  ('88888888-8888-4888-8888-888888888888', 'commerce-two@example.test');

insert into loyalty.organizations (slug, name)
values ('commerce-one', 'Commerce One'), ('commerce-two', 'Commerce Two');

insert into loyalty.organization_memberships (organization_id, user_id, role)
values
  ((select id from loyalty.organizations where slug = 'commerce-one'), '77777777-7777-4777-8777-777777777777', 'owner'),
  ((select id from loyalty.organizations where slug = 'commerce-two'), '88888888-8888-4888-8888-888888888888', 'owner');

insert into loyalty.workspaces (organization_id, slug, name)
select id, 'store', name || ' Store' from loyalty.organizations
where slug in ('commerce-one', 'commerce-two');

insert into loyalty.commerce_connections (
  organization_id, workspace_id, external_store_id, display_name,
  current_key_version, signing_material_ref
)
select organization.id, workspace.id, 'store-one', 'Store One', 'v1', 'vault://woocommerce/store-one/v1'
from loyalty.organizations as organization
join loyalty.workspaces as workspace on workspace.organization_id = organization.id
where organization.slug = 'commerce-one';

create temporary table delivery_results (
  attempt integer not null,
  receipt_id uuid not null,
  outcome text not null
);

insert into delivery_results
select 1, accepted.receipt_id, accepted.outcome
from loyalty_private.accept_commerce_delivery(
  (select id from loyalty.organizations where slug = 'commerce-one'),
  (select id from loyalty.commerce_connections where external_store_id = 'store-one'),
  'delivery-42', '1', 'order-42-v3', 'commerce.order.status_changed',
  '42', '3', '2026-08-11T18:00:00Z', '2026-08-11T18:00:01Z',
  'v1', 'nonce-42', repeat('a', 64), '{"version":"1","payload":{"status":"completed"}}'::jsonb
) as accepted;

select results_eq(
  $$ select outcome from delivery_results where attempt = 1 $$,
  array['accepted'::text],
  'first verified delivery is accepted'
);
select results_eq(
  'select count(*)::bigint from loyalty_private.commerce_delivery_inbox',
  array[1::bigint],
  'first delivery creates one inbox row'
);

insert into delivery_results
select 2, accepted.receipt_id, accepted.outcome
from loyalty_private.accept_commerce_delivery(
  (select id from loyalty.organizations where slug = 'commerce-one'),
  (select id from loyalty.commerce_connections where external_store_id = 'store-one'),
  'delivery-42', '1', 'order-42-v3', 'commerce.order.status_changed',
  '42', '3', '2026-08-11T18:00:00Z', '2026-08-11T18:00:02Z',
  'v1', 'nonce-42-retry', repeat('a', 64), '{"version":"1","payload":{"status":"completed"}}'::jsonb
) as accepted;

select results_eq(
  $$ select outcome from delivery_results where attempt = 2 $$,
  array['duplicate'::text],
  'same delivery and body returns a stable duplicate result'
);
select results_eq(
  'select count(*)::bigint from loyalty_private.commerce_delivery_inbox',
  array[1::bigint],
  'duplicate delivery still has one inbox row'
);
select throws_ok(
  $$
    select * from loyalty_private.accept_commerce_delivery(
      (select id from loyalty.organizations where slug = 'commerce-one'),
      (select id from loyalty.commerce_connections where external_store_id = 'store-one'),
      'delivery-replayed-nonce', '1', 'order-43-v1', 'commerce.order.upserted',
      '43', '1', now(), now(), 'v1', 'nonce-42', repeat('c', 64), '{"order":43}'::jsonb
    )
  $$,
  '23505', null,
  'nonce cannot be replayed under a different delivery id'
);
select throws_ok(
  $$
    select * from loyalty_private.accept_commerce_delivery(
      (select id from loyalty.organizations where slug = 'commerce-one'),
      (select id from loyalty.commerce_connections where external_store_id = 'store-one'),
      'delivery-42', '1', 'order-42-v3', 'commerce.order.status_changed',
      '42', '3', now(), now(), 'v1', 'nonce-conflict', repeat('b', 64), '{"changed":true}'::jsonb
    )
  $$,
  '23514',
  'delivery id reused with different body hash',
  'same delivery id with different content is rejected'
);
select throws_ok(
  $$
    select * from loyalty_private.accept_commerce_delivery(
      (select id from loyalty.organizations where slug = 'commerce-one'),
      999999, 'missing', '1', 'missing', 'commerce.order.upserted',
      '99', null, now(), now(), 'v1', 'nonce-missing', repeat('c', 64), '{}'::jsonb
    )
  $$,
  '22023',
  'inactive or unknown commerce connection',
  'unknown connection fails before inbox storage'
);

update loyalty.commerce_connections set status = 'disabled'
where external_store_id = 'store-one';
select throws_ok(
  $$
    select * from loyalty_private.accept_commerce_delivery(
      (select id from loyalty.organizations where slug = 'commerce-one'),
      (select id from loyalty.commerce_connections where external_store_id = 'store-one'),
      'disabled', '1', 'disabled', 'commerce.connection.disabled',
      'store-one', null, now(), now(), 'v1', 'nonce-disabled', repeat('d', 64), '{}'::jsonb
    )
  $$,
  '22023',
  'inactive or unknown commerce connection',
  'disabled connection cannot create a processable delivery'
);
update loyalty.commerce_connections set status = 'active'
where external_store_id = 'store-one';

select results_eq(
  $$
    select outcome from loyalty_private.normalize_commerce_delivery(
      (select receipt_id from delivery_results where attempt = 1), 'v1'
    )
  $$,
  array['created'::text],
  'accepted delivery creates one canonical fact'
);
select results_eq(
  'select count(*)::bigint from loyalty_private.canonical_commerce_events',
  array[1::bigint],
  'normalization stores exactly one canonical event'
);
select results_eq(
  $$
    select outcome from loyalty_private.normalize_commerce_delivery(
      (select receipt_id from delivery_results where attempt = 1), 'v1'
    )
  $$,
  array['duplicate'::text],
  'repeated normalization returns the existing canonical fact'
);

select throws_ok(
  $$
    insert into loyalty_private.canonical_commerce_events (
      organization_id, connection_id, delivery_inbox_id, source_event_id,
      normalization_version, event_type, source_object_id, occurred_at, payload
    )
    select organization_id, connection_id, id, source_event_id, 'v1', event_type,
      source_object_id, occurred_at, raw_body
    from loyalty_private.commerce_delivery_inbox
  $$,
  '23505', null,
  'canonical event uniqueness prevents duplicate facts'
);

insert into loyalty_private.commerce_business_effects (
  organization_id, event_id, effect_kind, effect_key, result_reference
)
select organization_id, id, 'points.award', 'order:42', 'pending-award:42'
from loyalty_private.canonical_commerce_events;
select throws_ok(
  $$
    insert into loyalty_private.commerce_business_effects (
      organization_id, event_id, effect_kind, effect_key
    )
    select organization_id, id, 'points.award', 'order:42'
    from loyalty_private.canonical_commerce_events
  $$,
  '23505', null,
  'business effect uniqueness prevents duplicate value changes'
);

insert into loyalty_private.transactional_outbox (
  command_id, organization_id, connection_id, topic, payload_version, payload
)
select '99999999-9999-4999-8999-999999999999', organization_id, id,
  'woocommerce.coupon.issue', 'v1', '{"reservationRef":"reservation-1"}'::jsonb
from loyalty.commerce_connections where external_store_id = 'store-one';
select throws_ok(
  $$
    insert into loyalty_private.transactional_outbox (
      command_id, organization_id, topic, payload_version, payload
    ) values (
      '99999999-9999-4999-8999-999999999999',
      (select id from loyalty.organizations where slug = 'commerce-one'),
      'woocommerce.coupon.issue', 'v1', '{}'::jsonb
    )
  $$,
  '23505', null,
  'outbox command id is globally idempotent'
);

select throws_ok(
  $$
    insert into loyalty.commerce_connections (
      organization_id, workspace_id, external_store_id, display_name,
      current_key_version, signing_material_ref
    ) values (
      (select id from loyalty.organizations where slug = 'commerce-one'),
      (select id from loyalty.workspaces where organization_id = (
        select id from loyalty.organizations where slug = 'commerce-two'
      )),
      'forged-store', 'Forged', 'v1', 'vault://forged'
    )
  $$,
  '23503', null,
  'composite foreign key rejects a cross-tenant connection'
);

set local role authenticated;
set local request.jwt.claim.sub = '77777777-7777-4777-8777-777777777777';
select results_eq(
  'select external_store_id from loyalty.commerce_connections',
  array['store-one'::text],
  'tenant member sees its own connection metadata'
);
set local request.jwt.claim.sub = '88888888-8888-4888-8888-888888888888';
select results_eq(
  'select count(*)::bigint from loyalty.commerce_connections',
  array[0::bigint],
  'other tenant cannot see connection metadata'
);
reset role;

select * from finish();
rollback;
