begin;

create extension if not exists pgtap with schema extensions;

select plan(28);

select has_column(
  'loyalty', 'commerce_connections', 'programme_id',
  'commerce connections bind explicitly to a programme'
);
select has_column(
  'loyalty_private', 'canonical_commerce_events', 'effect_state',
  'canonical events carry durable effect state'
);
select has_index(
  'loyalty_private', 'canonical_commerce_events',
  'canonical_commerce_events_effect_claim_idx',
  'ready effect jobs have a partial claim index'
);
select ok(
  has_function_privilege(
    'loyalty_worker',
    'loyalty_private.claim_woocommerce_effects(text,integer,integer)',
    'EXECUTE'
  ),
  'the worker can claim WooCommerce effects'
);
select ok(
  not has_function_privilege(
    'loyalty_runtime',
    'loyalty_private.claim_woocommerce_effects(text,integer,integer)',
    'EXECUTE'
  ),
  'the ingestion runtime cannot claim effects'
);
select ok(
  has_function_privilege(
    'loyalty_worker',
    'loyalty_private.resolve_commerce_customer(bigint,bigint,text,text)',
    'EXECUTE'
  ),
  'the worker can resolve channel identities'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'loyalty_private.resolve_commerce_customer(bigint,bigint,text,text)',
    'EXECUTE'
  ),
  'browser users cannot resolve private channel identities'
);

insert into loyalty.organizations (slug, name)
values ('effect-one', 'Effect One'), ('effect-two', 'Effect Two');
insert into loyalty.workspaces (organization_id, slug, name)
select id, 'store', name || ' Store'
from loyalty.organizations where slug in ('effect-one', 'effect-two');
insert into loyalty.commerce_connections (
  organization_id, workspace_id, external_store_id, display_name,
  current_key_version, signing_material_ref
)
select organization.id, workspace.id, organization.slug || '-store',
  organization.name || ' Store', 'v1', 'vault://' || organization.slug
from loyalty.organizations as organization
join loyalty.workspaces as workspace
  on workspace.organization_id = organization.id
where organization.slug in ('effect-one', 'effect-two');

create temporary table effect_receipts (
  event_number integer primary key,
  receipt_id uuid not null
);
insert into effect_receipts
select 1, accepted.receipt_id
from loyalty_private.accept_commerce_delivery(
  (select id from loyalty.organizations where slug = 'effect-one'),
  (select id from loyalty.commerce_connections where external_store_id = 'effect-one-store'),
  'effect-delivery-1', '1', 'effect-event-1', 'commerce.order.status_changed',
  '42', '1', now(), now(), 'v1', 'effect-nonce-1', repeat('a', 64),
  '{"version":"1","payload":{"status":"completed"}}'::jsonb
) as accepted;
select * from loyalty_private.normalize_commerce_delivery(
  (select receipt_id from effect_receipts where event_number = 1), 'v1'
);

create temporary table first_claim as
select * from loyalty_private.claim_woocommerce_effects('worker-a', 10, 60);
select is(
  (select count(*)::integer from first_claim), 1,
  'the first worker claims one ready event'
);
select is(
  (select attempt_count from first_claim), 1,
  'claiming increments the attempt counter'
);
select is_empty(
  $$ select * from loyalty_private.claim_woocommerce_effects('worker-b', 10, 60) $$,
  'an active lease prevents a second worker claim'
);
select throws_ok(
  format(
    'select * from loyalty_private.finish_commerce_effect(%L, %L, %L, null, null, null, %L, 0)',
    (select canonical_event_public_id from first_claim),
    'worker-b', 'skipped', 'wrong_worker'
  ),
  '55000', 'commerce effect lease is not owned',
  'only the lease owner can finish an effect'
);
select results_eq(
  format(
    'select outcome from loyalty_private.finish_commerce_effect(%L, %L, %L, null, null, null, %L, 0)',
    (select canonical_event_public_id from first_claim),
    'worker-a', 'retryable', 'temporary_failure'
  ),
  array['retryable'::text],
  'a retry releases the lease'
);

create temporary table second_claim as
select * from loyalty_private.claim_woocommerce_effects('worker-b', 10, 60);
select is(
  (select count(*)::integer from second_claim), 1,
  'a released retry can be reclaimed'
);
select is(
  (select attempt_count from second_claim), 2,
  'reclaiming preserves monotonic attempts'
);
select results_eq(
  format(
    'select outcome from loyalty_private.finish_commerce_effect(%L, %L, %L, null, null, null, %L, 0)',
    (select canonical_event_public_id from second_claim),
    'worker-b', 'skipped', 'not_eligible'
  ),
  array['skipped'::text],
  'the owner can finish a non-value effect'
);
select results_eq(
  $$ select effect_state from loyalty_private.canonical_commerce_events
     where public_id = (select canonical_event_public_id from second_claim) $$,
  array['skipped'::text],
  'finished jobs keep their terminal state'
);

select results_eq(
  $$
    select outcome from loyalty_private.resolve_commerce_customer(
      (select id from loyalty.organizations where slug = 'effect-one'),
      (select id from loyalty.commerce_connections where external_store_id = 'effect-one-store'),
      'registered', '7'
    )
  $$,
  array['created'::text],
  'a signed registered channel id creates one customer link'
);
select results_eq(
  $$
    select outcome from loyalty_private.resolve_commerce_customer(
      (select id from loyalty.organizations where slug = 'effect-one'),
      (select id from loyalty.commerce_connections where external_store_id = 'effect-one-store'),
      'registered', '7'
    )
  $$,
  array['existing'::text],
  'the same channel id resolves idempotently'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.customer_identities
     where external_customer_id = 'registered:7' $$,
  array[1::bigint],
  'registered identity resolution creates exactly one link'
);
select results_eq(
  $$
    select outcome from loyalty_private.resolve_commerce_customer(
      (select id from loyalty.organizations where slug = 'effect-one'),
      (select id from loyalty.commerce_connections where external_store_id = 'effect-one-store'),
      'guest', '7'
    )
  $$,
  array['created'::text],
  'a guest order id is namespaced separately from a registered customer id'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.customers
     where organization_id = (select id from loyalty.organizations where slug = 'effect-one') $$,
  array[2::bigint],
  'registered and guest identities do not merge by a coincident raw id'
);
select throws_ok(
  $$
    select * from loyalty_private.resolve_commerce_customer(
      (select id from loyalty.organizations where slug = 'effect-one'),
      (select id from loyalty.commerce_connections where external_store_id = 'effect-two-store'),
      'registered', 'forged'
    )
  $$,
  '22023', 'unknown commerce connection',
  'tenant scope rejects a forged connection id'
);

insert into effect_receipts
select 2, accepted.receipt_id
from loyalty_private.accept_commerce_delivery(
  (select id from loyalty.organizations where slug = 'effect-one'),
  (select id from loyalty.commerce_connections where external_store_id = 'effect-one-store'),
  'effect-delivery-2', '1', 'effect-event-2', 'commerce.order.status_changed',
  '43', '1', now(), now(), 'v1', 'effect-nonce-2', repeat('b', 64),
  '{"version":"1","payload":{"status":"completed"}}'::jsonb
) as accepted;
select * from loyalty_private.normalize_commerce_delivery(
  (select receipt_id from effect_receipts where event_number = 2), 'v1'
);
create temporary table applied_claim as
select * from loyalty_private.claim_woocommerce_effects('worker-c', 10, 60);
select is(
  (select count(*)::integer from applied_claim), 1,
  'a second event can be claimed after the first reaches a terminal state'
);
select results_eq(
  format(
    'select outcome from loyalty_private.finish_commerce_effect(%L, %L, %L, %L, %L, %L, null, 0)',
    (select canonical_event_public_id from applied_claim),
    'worker-c', 'applied', 'loyalty.order.award', 'connection:1:order:43',
    'ledger-transaction:test'
  ),
  array['applied'::text],
  'an applied value effect records its idempotency fence atomically'
);
select results_eq(
  $$ select effect_state from loyalty_private.canonical_commerce_events
     where public_id = (select canonical_event_public_id from applied_claim) $$,
  array['applied'::text],
  'applied effect state is terminal'
);
select results_eq(
  $$ select count(*)::bigint from loyalty_private.commerce_business_effects
     where effect_kind = 'loyalty.order.award' $$,
  array[1::bigint],
  'one applied event creates exactly one business-effect fence'
);
select throws_ok(
  format(
    'select * from loyalty_private.finish_commerce_effect(%L, %L, %L, %L, %L, %L, null, 0)',
    (select canonical_event_public_id from applied_claim),
    'worker-c', 'applied', 'loyalty.order.award', 'connection:1:order:43',
    'ledger-transaction:test'
  ),
  '55000', 'commerce effect lease is not owned',
  'a terminal effect cannot be finished twice'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.customers
     where display_reference is not null $$,
  array[0::bigint],
  'channel identity resolution stores no email or display PII'
);

select * from finish();
rollback;
