begin;

create extension if not exists pgtap with schema extensions;

select plan(84);

select has_table('loyalty', 'programmes', 'programmes exist');
select has_table('loyalty', 'programme_versions', 'programme versions exist');
select has_table('loyalty', 'customers', 'customers exist');
select has_table('loyalty', 'customer_identities', 'channel identities exist');
select has_table('loyalty', 'wallets', 'wallets exist');
select has_table('loyalty', 'ledger_accounts', 'ledger accounts exist');
select has_table('loyalty', 'ledger_transactions', 'ledger transactions exist');
select has_table('loyalty', 'ledger_entries', 'ledger entries exist');
select has_table('loyalty', 'wallet_balances', 'wallet balance projection exists');
select has_table('loyalty', 'point_lots', 'point lots exist');
select has_table('loyalty', 'point_lot_balances', 'point lot projection exists');
select has_table('loyalty', 'redemption_allocations', 'immutable lot allocations exist');

select is_empty(
  $$
    select relation.relname
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'loyalty'
      and relation.relname in (
        'programmes', 'programme_versions', 'customers', 'customer_identities',
        'wallets', 'ledger_accounts', 'ledger_transactions', 'ledger_entries',
        'wallet_balances', 'point_lots', 'point_lot_balances', 'redemption_allocations'
      )
      and not relation.relrowsecurity
  $$,
  'every Phase 5 tenant table enables RLS'
);
select ok(
  not has_schema_privilege('authenticated', 'loyalty_private', 'USAGE'),
  'browser clients cannot use private ledger commands'
);
select ok(
  has_table_privilege('authenticated', 'loyalty.ledger_transactions', 'SELECT'),
  'authenticated members can read RLS-filtered ledger history'
);
select ok(
  not has_table_privilege('authenticated', 'loyalty.ledger_transactions', 'INSERT'),
  'authenticated clients cannot insert ledger transactions'
);
select ok(
  has_function_privilege(
    'loyalty_worker',
    'loyalty_private.award_points(bigint,bigint,bigint,bigint,bigint,text,bytea,bigint,text,timestamp with time zone)',
    'EXECUTE'
  ),
  'worker can execute the award command'
);
select ok(
  not has_function_privilege(
    'loyalty_worker',
    'loyalty_private.post_ledger_transaction(bigint,bigint,bigint,text,text,text,bigint,text,bigint,text,bytea,text,jsonb,timestamp with time zone,jsonb)',
    'EXECUTE'
  ),
  'worker cannot bypass operation policy through the generic posting primitive'
);
select ok(
  not has_table_privilege('loyalty_worker', 'loyalty.ledger_entries', 'INSERT'),
  'worker cannot insert entries directly'
);
select has_index(
  'loyalty', 'point_lots', 'point_lots_fifo_idx',
  'earliest-expiry lot order has a composite index'
);
select has_trigger(
  'loyalty', 'ledger_transactions', 'ledger_transaction_balanced',
  'transaction insertion validates the zero-sum invariant'
);
select has_trigger(
  'loyalty', 'ledger_entries', 'ledger_entries_immutable',
  'ledger entries reject update and delete'
);

insert into auth.users (id, email)
values
  ('11111111-2222-4333-8444-555555555555', 'ledger-one@example.test'),
  ('22222222-3333-4444-8555-666666666666', 'ledger-two@example.test');

insert into loyalty.organizations (slug, name)
values ('ledger-one', 'Ledger One'), ('ledger-two', 'Ledger Two');

insert into loyalty.organization_memberships (organization_id, user_id, role)
values
  ((select id from loyalty.organizations where slug = 'ledger-one'), '11111111-2222-4333-8444-555555555555', 'owner'),
  ((select id from loyalty.organizations where slug = 'ledger-two'), '22222222-3333-4444-8555-666666666666', 'owner');

insert into loyalty.workspaces (organization_id, slug, name)
select id, 'ledger-store', name || ' Store'
from loyalty.organizations where slug in ('ledger-one', 'ledger-two');

insert into loyalty.programme_groups (organization_id, slug, name)
select id, 'rewards', name || ' Rewards'
from loyalty.organizations where slug in ('ledger-one', 'ledger-two');

insert into loyalty.programmes (organization_id, programme_group_id, slug, name)
select organization.id, programme_group.id, 'rosy', 'Rosy Rewards'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group on programme_group.organization_id = organization.id;

insert into loyalty.programme_versions (
  organization_id, programme_group_id, programme_id, version_number, status,
  configuration, configuration_sha256, published_at
)
select programme.organization_id, programme.programme_group_id, programme.id, 1,
  'published', '{"award":{"pointsPerEuro":1}}'::jsonb, decode(repeat('a', 64), 'hex'),
  '2026-08-12T00:00:00Z'
from loyalty.programmes as programme;

insert into loyalty.customers (organization_id, display_reference)
select id, slug || '-customer'
from loyalty.organizations where slug in ('ledger-one', 'ledger-two');

insert into loyalty.commerce_connections (
  organization_id, workspace_id, external_store_id, display_name,
  current_key_version, signing_material_ref
)
select organization.id, workspace.id, 'ledger-store-one', 'Ledger Store One',
  'v1', 'vault://woocommerce/ledger-store-one/v1'
from loyalty.organizations as organization
join loyalty.workspaces as workspace on workspace.organization_id = organization.id
where organization.slug = 'ledger-one';

insert into loyalty_private.commerce_delivery_inbox (
  organization_id, connection_id, source_delivery_id, envelope_version,
  source_event_id, event_type, source_object_id, occurred_at, delivered_at,
  key_version, nonce, body_sha256, raw_body
)
select connection.organization_id, connection.id, 'ledger-delivery-1', '1',
  'ledger-order-1', 'commerce.order.status_changed', '1',
  '2026-08-12T01:00:00Z', '2026-08-12T01:00:01Z',
  'v1', 'ledger-nonce-1', repeat('b', 64), '{"payload":{"status":"completed"}}'::jsonb
from loyalty.commerce_connections as connection where connection.external_store_id = 'ledger-store-one';

insert into loyalty_private.canonical_commerce_events (
  organization_id, connection_id, delivery_inbox_id, source_event_id,
  normalization_version, event_type, source_object_id, occurred_at, payload
)
select inbox.organization_id, inbox.connection_id, inbox.id, inbox.source_event_id,
  'v1', inbox.event_type, inbox.source_object_id, inbox.occurred_at,
  inbox.raw_body -> 'payload'
from loyalty_private.commerce_delivery_inbox as inbox
where inbox.source_delivery_id = 'ledger-delivery-1';

select throws_ok(
  $$
    insert into loyalty.customer_identities (
      organization_id, customer_id, commerce_connection_id,
      external_customer_id, identity_kind
    ) values (
      (select id from loyalty.organizations where slug = 'ledger-one'),
      (select customer.id from loyalty.customers as customer
       join loyalty.organizations as organization on organization.id = customer.organization_id
       where organization.slug = 'ledger-two'),
      (select id from loyalty.commerce_connections where external_store_id = 'ledger-store-one'),
      'forged-customer', 'registered'
    )
  $$,
  '23503', null,
  'composite keys reject a cross-tenant customer identity'
);

create temporary table ledger_results (
  operation text not null,
  transaction_public_id uuid not null,
  wallet_public_id uuid,
  lot_public_id uuid,
  outcome text not null,
  amount bigint
);

insert into ledger_results
select 'award-one', result.transaction_public_id, result.wallet_public_id, null, result.outcome, 1000
from loyalty_private.award_points(
  (select id from loyalty.organizations where slug = 'ledger-one'),
  (select programme_group.id from loyalty.programme_groups as programme_group
   join loyalty.organizations as organization on organization.id = programme_group.organization_id
   where organization.slug = 'ledger-one'),
  (select version.id from loyalty.programme_versions as version
   join loyalty.organizations as organization on organization.id = version.organization_id
   where organization.slug = 'ledger-one'),
  (select customer.id from loyalty.customers as customer
   join loyalty.organizations as organization on organization.id = customer.organization_id
   where organization.slug = 'ledger-one'),
  1000, 'award:order:1', decode(repeat('1', 64), 'hex'),
  (select id from loyalty_private.canonical_commerce_events where source_event_id = 'ledger-order-1'),
  'woocommerce-order:1', '2026-08-12T01:00:00Z'
) as result;

select results_eq(
  $$ select outcome from ledger_results where operation = 'award-one' $$,
  array['created'::text],
  'first award creates a transaction'
);
select results_eq(
  'select count(*)::bigint from loyalty.ledger_transactions',
  array[1::bigint],
  'award creates one transaction header'
);
select results_eq(
  'select count(*)::bigint from loyalty.ledger_entries',
  array[2::bigint],
  'award creates exactly two entries'
);
select results_eq(
  'select sum(points)::bigint from loyalty.ledger_entries',
  array[0::bigint],
  'award entries sum to zero'
);
select results_eq(
  $$ select points from loyalty.wallet_balances where account_kind = 'pending' $$,
  array[1000::bigint],
  'award projects points into pending'
);

insert into ledger_results
select 'award-one-duplicate', result.transaction_public_id, result.wallet_public_id, null, result.outcome, 1000
from loyalty_private.award_points(
  (select id from loyalty.organizations where slug = 'ledger-one'),
  (select programme_group_id from loyalty.programmes where slug = 'rosy' and organization_id =
    (select id from loyalty.organizations where slug = 'ledger-one')),
  (select id from loyalty.programme_versions where organization_id =
    (select id from loyalty.organizations where slug = 'ledger-one')),
  (select id from loyalty.customers where organization_id =
    (select id from loyalty.organizations where slug = 'ledger-one')),
  1000, 'award:order:1', decode(repeat('1', 64), 'hex'),
  (select id from loyalty_private.canonical_commerce_events where source_event_id = 'ledger-order-1'),
  'woocommerce-order:1', '2026-08-12T01:00:00Z'
) as result;

select results_eq(
  $$ select outcome from ledger_results where operation = 'award-one-duplicate' $$,
  array['duplicate'::text],
  'same idempotency key and hash returns the existing award'
);
select results_eq(
  'select count(*)::bigint from loyalty.ledger_transactions',
  array[1::bigint],
  'duplicate award creates no second transaction'
);
select results_eq(
  $$ select points from loyalty.wallet_balances where account_kind = 'pending' $$,
  array[1000::bigint],
  'duplicate award has no second balance effect'
);
select throws_ok(
  $$
    select * from loyalty_private.award_points(
      (select id from loyalty.organizations where slug = 'ledger-one'),
      (select programme_group_id from loyalty.programmes where slug = 'rosy' and organization_id =
        (select id from loyalty.organizations where slug = 'ledger-one')),
      (select id from loyalty.programme_versions where organization_id =
        (select id from loyalty.organizations where slug = 'ledger-one')),
      (select id from loyalty.customers where organization_id =
        (select id from loyalty.organizations where slug = 'ledger-one')),
      1000, 'award:order:1', decode(repeat('2', 64), 'hex')
    )
  $$,
  '23514', 'idempotency key reused with different request hash',
  'same idempotency key with a different request is rejected'
);
select throws_ok(
  $$
    select * from loyalty_private.award_points(
      (select id from loyalty.organizations where slug = 'ledger-one'),
      (select programme_group_id from loyalty.programmes where slug = 'rosy' and organization_id =
        (select id from loyalty.organizations where slug = 'ledger-one')),
      (select id from loyalty.programme_versions where organization_id =
        (select id from loyalty.organizations where slug = 'ledger-one')),
      (select id from loyalty.customers where organization_id =
        (select id from loyalty.organizations where slug = 'ledger-one')),
      1000, 'award:other-key', decode(repeat('3', 64), 'hex'),
      (select id from loyalty_private.canonical_commerce_events where source_event_id = 'ledger-order-1'),
      'woocommerce-order:1'
    )
  $$,
  '23505', null,
  'one canonical event effect cannot be posted under another idempotency key'
);
select throws_ok(
  $$
    select * from loyalty_private.award_points(
      (select id from loyalty.organizations where slug = 'ledger-one'),
      (select programme_group_id from loyalty.programmes where organization_id =
        (select id from loyalty.organizations where slug = 'ledger-two')),
      (select id from loyalty.programme_versions where organization_id =
        (select id from loyalty.organizations where slug = 'ledger-one')),
      (select id from loyalty.customers where organization_id =
        (select id from loyalty.organizations where slug = 'ledger-one')),
      10, 'forged-award', decode(repeat('4', 64), 'hex')
    )
  $$,
  '22023', 'inactive or cross-tenant wallet scope',
  'wallet creation rejects a forged cross-tenant programme group'
);
select throws_ok(
  $$
    insert into loyalty.ledger_transactions (
      organization_id, programme_group_id, programme_version_id,
      transaction_kind, actor_type, actor_id, idempotency_key,
      request_sha256, effective_at
    ) values (
      (select id from loyalty.organizations where slug = 'ledger-one'),
      (select programme_group_id from loyalty.programmes where organization_id =
        (select id from loyalty.organizations where slug = 'ledger-one')),
      (select id from loyalty.programme_versions where organization_id =
        (select id from loyalty.organizations where slug = 'ledger-one')),
      'manual_adjustment', 'system', 'test', 'unbalanced-direct',
      decode(repeat('5', 64), 'hex'), now()
    )
  $$,
  '23514', 'ledger transaction requires at least two entries',
  'a header without balanced entries is rejected immediately'
);
select throws_ok(
  $$ update loyalty.ledger_transactions set actor_id = 'rewritten' where transaction_kind = 'award' $$,
  '55000', 'immutable loyalty history cannot be changed',
  'transaction headers cannot be rewritten'
);
select throws_ok(
  $$ delete from loyalty.ledger_entries where id = (select min(id) from loyalty.ledger_entries) $$,
  '55000', 'immutable loyalty history cannot be changed',
  'ledger entries cannot be deleted'
);
select throws_ok(
  $$ update loyalty.programme_versions set configuration = '{}'::jsonb where status = 'published' $$,
  '55000', 'published programme version is immutable',
  'published programme configuration cannot be rewritten'
);

create temporary table ledger_refs (name text primary key, value uuid not null);
insert into ledger_refs
select 'award-one-origin', entry.public_id
from loyalty.ledger_entries as entry
join loyalty.ledger_transactions as transaction on transaction.id = entry.transaction_id
join loyalty.ledger_accounts as account on account.id = entry.account_id
where transaction.idempotency_key = 'award:order:1'
  and account.account_kind = 'pending' and entry.points > 0;

insert into ledger_results
select 'release-one', result.transaction_public_id, null, result.lot_public_id, result.outcome, 1000
from loyalty_private.release_points(
  (select id from loyalty.organizations where slug = 'ledger-one'),
  (select programme_group_id from loyalty.programmes where organization_id =
    (select id from loyalty.organizations where slug = 'ledger-one')),
  (select id from loyalty.programme_versions where organization_id =
    (select id from loyalty.organizations where slug = 'ledger-one')),
  (select value from ledger_refs where name = 'award-one-origin'),
  '2027-08-12T01:00:00Z', 'release:order:1', decode(repeat('6', 64), 'hex'),
  '2026-09-11T01:00:00Z'
) as result;

select results_eq(
  $$ select outcome from ledger_results where operation = 'release-one' $$,
  array['created'::text],
  'release creates a balanced state transfer'
);
select results_eq(
  $$ select points from loyalty.wallet_balances where account_kind = 'pending' $$,
  array[0::bigint],
  'release removes the pending quantity'
);
select results_eq(
  $$ select points from loyalty.wallet_balances where account_kind = 'available' $$,
  array[1000::bigint],
  'release makes points available'
);
select results_eq(
  'select remaining_points from loyalty.point_lot_balances',
  array[1000::bigint],
  'release creates a fully available immutable lot'
);

insert into ledger_results
select 'award-two', result.transaction_public_id, result.wallet_public_id, null, result.outcome, 500
from loyalty_private.award_points(
  (select id from loyalty.organizations where slug = 'ledger-one'),
  (select programme_group_id from loyalty.programmes where organization_id =
    (select id from loyalty.organizations where slug = 'ledger-one')),
  (select id from loyalty.programme_versions where organization_id =
    (select id from loyalty.organizations where slug = 'ledger-one')),
  (select id from loyalty.customers where organization_id =
    (select id from loyalty.organizations where slug = 'ledger-one')),
  500, 'award:order:2', decode(repeat('7', 64), 'hex'), null,
  'woocommerce-order:2', '2026-08-12T02:00:00Z'
) as result;
insert into ledger_refs
select 'award-two-origin', entry.public_id
from loyalty.ledger_entries as entry
join loyalty.ledger_transactions as transaction on transaction.id = entry.transaction_id
join loyalty.ledger_accounts as account on account.id = entry.account_id
where transaction.idempotency_key = 'award:order:2'
  and account.account_kind = 'pending' and entry.points > 0;
insert into ledger_results
select 'release-two', result.transaction_public_id, null, result.lot_public_id, result.outcome, 500
from loyalty_private.release_points(
  (select id from loyalty.organizations where slug = 'ledger-one'),
  (select programme_group_id from loyalty.programmes where organization_id =
    (select id from loyalty.organizations where slug = 'ledger-one')),
  (select id from loyalty.programme_versions where organization_id =
    (select id from loyalty.organizations where slug = 'ledger-one')),
  (select value from ledger_refs where name = 'award-two-origin'),
  '2027-01-12T02:00:00Z', 'release:order:2', decode(repeat('8', 64), 'hex'),
  '2026-09-11T02:00:00Z'
) as result;
select results_eq(
  $$ select points from loyalty.wallet_balances where account_kind = 'available' $$,
  array[1500::bigint],
  'multiple awards accumulate exactly once'
);

insert into ledger_results
select 'reserve-one', result.transaction_public_id, null, null, result.outcome, 600
from loyalty_private.reserve_points(
  (select id from loyalty.organizations where slug = 'ledger-one'),
  (select programme_group_id from loyalty.programmes where organization_id =
    (select id from loyalty.organizations where slug = 'ledger-one')),
  (select id from loyalty.programme_versions where organization_id =
    (select id from loyalty.organizations where slug = 'ledger-one')),
  (select wallet_public_id from ledger_results where operation = 'award-one'),
  600, 'reserve:reward:1', decode(repeat('9', 64), 'hex'), '2026-10-01T00:00:00Z'
) as result;
select results_eq(
  $$ select outcome from ledger_results where operation = 'reserve-one' $$,
  array['created'::text],
  'reservation creates one transaction'
);
select results_eq(
  $$ select points from loyalty.wallet_balances where account_kind = 'available' $$,
  array[900::bigint],
  'reservation debits available points'
);
select results_eq(
  $$ select points from loyalty.wallet_balances where account_kind = 'reserved' $$,
  array[600::bigint],
  'reservation credits the reserved bucket'
);
select results_eq(
  $$
    select balance.remaining_points
    from loyalty.point_lots as lot
    join loyalty.point_lot_balances as balance on balance.lot_id = lot.id
    order by lot.expires_at
  $$,
  $$ values (0::bigint), (900::bigint) $$,
  'reservation consumes earliest-expiry lots first'
);

insert into ledger_results
select 'reserve-one-duplicate', result.transaction_public_id, null, null, result.outcome, 600
from loyalty_private.reserve_points(
  (select id from loyalty.organizations where slug = 'ledger-one'),
  (select programme_group_id from loyalty.programmes where organization_id =
    (select id from loyalty.organizations where slug = 'ledger-one')),
  (select id from loyalty.programme_versions where organization_id =
    (select id from loyalty.organizations where slug = 'ledger-one')),
  (select wallet_public_id from ledger_results where operation = 'award-one'),
  600, 'reserve:reward:1', decode(repeat('9', 64), 'hex'), '2026-10-01T00:00:00Z'
) as result;
select results_eq(
  $$ select outcome from ledger_results where operation = 'reserve-one-duplicate' $$,
  array['duplicate'::text],
  'reservation retry returns the existing transaction'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.redemption_allocations where allocation_kind = 'reserve' $$,
  array[2::bigint],
  'reservation retry creates no second lot allocation'
);

insert into ledger_results
select 'cancel-one', result.transaction_public_id, null, null, result.outcome, 600
from loyalty_private.cancel_reservation(
  (select id from loyalty.organizations where slug = 'ledger-one'),
  (select transaction_public_id from ledger_results where operation = 'reserve-one'),
  'cancel:reward:1', decode(repeat('a', 64), 'hex'), '2026-10-01T00:05:00Z'
) as result;
select results_eq(
  $$ select outcome from ledger_results where operation = 'cancel-one' $$,
  array['created'::text],
  'cancellation creates a compensating transaction'
);
select results_eq(
  $$ select points from loyalty.wallet_balances where account_kind = 'available' $$,
  array[1500::bigint],
  'cancellation restores available points'
);
select results_eq(
  $$ select points from loyalty.wallet_balances where account_kind = 'reserved' $$,
  array[0::bigint],
  'cancellation clears reserved points'
);
select results_eq(
  $$
    select balance.remaining_points
    from loyalty.point_lots as lot
    join loyalty.point_lot_balances as balance on balance.lot_id = lot.id
    order by lot.expires_at
  $$,
  $$ values (500::bigint), (1000::bigint) $$,
  'cancellation restores the original lot projections'
);
select throws_ok(
  $$
    select * from loyalty_private.capture_reservation(
      (select id from loyalty.organizations where slug = 'ledger-one'),
      (select transaction_public_id from ledger_results where operation = 'reserve-one'),
      'capture:after-cancel', decode(repeat('b', 64), 'hex')
    )
  $$,
  '23514', 'reservation is already resolved',
  'a cancelled reservation cannot also be captured'
);

insert into ledger_results
select 'reserve-two', result.transaction_public_id, null, null, result.outcome, 700
from loyalty_private.reserve_points(
  (select id from loyalty.organizations where slug = 'ledger-one'),
  (select programme_group_id from loyalty.programmes where organization_id =
    (select id from loyalty.organizations where slug = 'ledger-one')),
  (select id from loyalty.programme_versions where organization_id =
    (select id from loyalty.organizations where slug = 'ledger-one')),
  (select wallet_public_id from ledger_results where operation = 'award-one'),
  700, 'reserve:reward:2', decode(repeat('c', 64), 'hex'), '2026-10-02T00:00:00Z'
) as result;
insert into ledger_results
select 'capture-two', result.transaction_public_id, null, null, result.outcome, 700
from loyalty_private.capture_reservation(
  (select id from loyalty.organizations where slug = 'ledger-one'),
  (select transaction_public_id from ledger_results where operation = 'reserve-two'),
  'capture:reward:2', decode(repeat('d', 64), 'hex'), '2026-10-02T00:05:00Z'
) as result;
select results_eq(
  $$ select outcome from ledger_results where operation = 'capture-two' $$,
  array['created'::text],
  'capture creates the final reservation state transfer'
);
select results_eq(
  $$ select points from loyalty.wallet_balances where account_kind = 'available' $$,
  array[800::bigint],
  'captured points remain removed from available'
);
select results_eq(
  $$ select points from loyalty.wallet_balances where account_kind = 'spent' $$,
  array[700::bigint],
  'capture projects redeemed points into spent'
);

insert into ledger_results
select 'reverse-one', result.transaction_public_id, null, null, result.outcome, 900
from loyalty_private.reverse_award_points(
  (select id from loyalty.organizations where slug = 'ledger-one'),
  (select value from ledger_refs where name = 'award-one-origin'),
  900, 'reverse:order:1', decode(repeat('e', 64), 'hex'),
  'Refunded original order', '2026-10-03T00:00:00Z'
) as result;
select results_eq(
  $$ select outcome from ledger_results where operation = 'reverse-one' $$,
  array['created'::text],
  'refund reversal creates a compensating transaction'
);
select results_eq(
  $$ select points from loyalty.wallet_balances where account_kind = 'available' $$,
  array[-100::bigint],
  'approved refund reversal may make available points negative'
);
select results_eq(
  $$ select points from loyalty.wallet_balances where account_kind = 'reversed' $$,
  array[900::bigint],
  'refund quantity is projected into the reversed bucket'
);
select results_eq(
  $$
    select count(*)::bigint from loyalty.ledger_entries
    where transaction_id = (
      select id from loyalty.ledger_transactions where idempotency_key = 'reverse:order:1'
    ) and origin_entry_id = (
      select id from loyalty.ledger_entries where public_id =
        (select value from ledger_refs where name = 'award-one-origin')
    )
  $$,
  array[2::bigint],
  'both reversal entries preserve original award attribution'
);
select throws_ok(
  $$
    select * from loyalty_private.reverse_award_points(
      (select id from loyalty.organizations where slug = 'ledger-one'),
      (select value from ledger_refs where name = 'award-one-origin'),
      101, 'reverse:too-much', decode(repeat('f', 64), 'hex'),
      'Would exceed original award'
    )
  $$,
  '23514', 'cumulative reversal exceeds original award',
  'cumulative refund reversal cannot exceed the original award'
);
select throws_ok(
  $$
    select * from loyalty_private.reserve_points(
      (select id from loyalty.organizations where slug = 'ledger-one'),
      (select programme_group_id from loyalty.programmes where organization_id =
        (select id from loyalty.organizations where slug = 'ledger-one')),
      (select id from loyalty.programme_versions where organization_id =
        (select id from loyalty.organizations where slug = 'ledger-one')),
      (select wallet_public_id from ledger_results where operation = 'award-one'),
      1, 'reserve:negative-wallet', decode(repeat('0', 64), 'hex')
    )
  $$,
  '23514', 'insufficient available points',
  'negative available wallets cannot spend again'
);

insert into ledger_results
select 'award-three', result.transaction_public_id, result.wallet_public_id, null, result.outcome, 300
from loyalty_private.award_points(
  (select id from loyalty.organizations where slug = 'ledger-one'),
  (select programme_group_id from loyalty.programmes where organization_id =
    (select id from loyalty.organizations where slug = 'ledger-one')),
  (select id from loyalty.programme_versions where organization_id =
    (select id from loyalty.organizations where slug = 'ledger-one')),
  (select id from loyalty.customers where organization_id =
    (select id from loyalty.organizations where slug = 'ledger-one')),
  300, 'award:order:3', decode(repeat('1a', 32), 'hex')
) as result;
insert into ledger_refs
select 'award-three-origin', entry.public_id
from loyalty.ledger_entries as entry
join loyalty.ledger_transactions as transaction on transaction.id = entry.transaction_id
join loyalty.ledger_accounts as account on account.id = entry.account_id
where transaction.idempotency_key = 'award:order:3'
  and account.account_kind = 'pending' and entry.points > 0;
insert into ledger_results
select 'release-three', result.transaction_public_id, null, result.lot_public_id, result.outcome, 300
from loyalty_private.release_points(
  (select id from loyalty.organizations where slug = 'ledger-one'),
  (select programme_group_id from loyalty.programmes where organization_id =
    (select id from loyalty.organizations where slug = 'ledger-one')),
  (select id from loyalty.programme_versions where organization_id =
    (select id from loyalty.organizations where slug = 'ledger-one')),
  (select value from ledger_refs where name = 'award-three-origin'),
  '2027-02-01T00:00:00Z', 'release:order:3', decode(repeat('2a', 32), 'hex'),
  '2026-11-01T00:00:00Z'
) as result;
insert into ledger_results
select 'expire-one', result.transaction_public_id, null, null, result.outcome, result.expired_points
from loyalty_private.expire_points(
  (select id from loyalty.organizations where slug = 'ledger-one'),
  (select wallet_public_id from ledger_results where operation = 'award-one'),
  (select id from loyalty.programme_versions where organization_id =
    (select id from loyalty.organizations where slug = 'ledger-one')),
  '2028-01-01T00:00:00Z', 'expire:2028-01', decode(repeat('3a', 32), 'hex')
) as result;
select results_eq(
  $$ select outcome from ledger_results where operation = 'expire-one' $$,
  array['created'::text],
  'expiry creates a balanced state transfer'
);
select results_eq(
  $$ select amount from ledger_results where operation = 'expire-one' $$,
  array[300::bigint],
  'expiry consumes exactly the eligible lot remainder'
);
select results_eq(
  $$ select points from loyalty.wallet_balances where account_kind = 'expired' $$,
  array[300::bigint],
  'expiry projects points into the expired bucket'
);
select results_eq(
  $$ select points from loyalty.wallet_balances where account_kind = 'available' $$,
  array[-100::bigint],
  'expiry does not erase a prior negative-balance reversal'
);
select results_eq(
  $$
    select balance.remaining_points
    from loyalty.point_lot_balances as balance
    join loyalty.point_lots as lot on lot.id = balance.lot_id
    where lot.origin_entry_id = (
      select id from loyalty.ledger_entries where public_id =
        (select value from ledger_refs where name = 'award-three-origin')
    )
  $$,
  array[0::bigint],
  'expired lot has no remaining spendable quantity'
);
select throws_ok(
  $$
    select * from loyalty_private.expire_points(
      (select id from loyalty.organizations where slug = 'ledger-one'),
      (select wallet_public_id from ledger_results where operation = 'award-one'),
      (select id from loyalty.programme_versions where organization_id =
        (select id from loyalty.organizations where slug = 'ledger-one')),
      '2028-01-02T00:00:00Z', 'expire:none', decode(repeat('4a', 32), 'hex')
    )
  $$,
  '22023', 'no eligible points to expire',
  'repeated expiry cannot consume a lot twice'
);

insert into ledger_results
select 'adjust-positive', result.transaction_public_id, null, null, result.outcome, 200
from loyalty_private.adjust_points(
  (select id from loyalty.organizations where slug = 'ledger-one'),
  (select wallet_public_id from ledger_results where operation = 'award-one'),
  (select id from loyalty.programme_versions where organization_id =
    (select id from loyalty.organizations where slug = 'ledger-one')),
  200, 'Approved service recovery credit', 'merchant:owner',
  'adjust:positive', decode(repeat('5a', 32), 'hex'),
  '2028-12-31T00:00:00Z', '2027-01-01T00:00:00Z'
) as result;
select results_eq(
  $$ select outcome from ledger_results where operation = 'adjust-positive' $$,
  array['created'::text],
  'positive manual adjustment requires reason and creates a lot'
);
select results_eq(
  $$ select points from loyalty.wallet_balances where account_kind = 'available' $$,
  array[100::bigint],
  'positive adjustment changes available through the ledger'
);
select results_eq(
  $$
    select remaining_points from loyalty.point_lot_balances
    where lot_id = (
      select lot.id from loyalty.point_lots as lot
      join loyalty.ledger_entries as entry on entry.id = lot.credit_entry_id
      join loyalty.ledger_transactions as transaction on transaction.id = entry.transaction_id
      where transaction.idempotency_key = 'adjust:positive'
    )
  $$,
  array[200::bigint],
  'positive adjustment lot is available for FIFO spending'
);
insert into ledger_results
select 'adjust-negative', result.transaction_public_id, null, null, result.outcome, -50
from loyalty_private.adjust_points(
  (select id from loyalty.organizations where slug = 'ledger-one'),
  (select wallet_public_id from ledger_results where operation = 'award-one'),
  (select id from loyalty.programme_versions where organization_id =
    (select id from loyalty.organizations where slug = 'ledger-one')),
  -50, 'Approved correction debit', 'merchant:owner',
  'adjust:negative', decode(repeat('6a', 32), 'hex'), null,
  '2027-01-02T00:00:00Z'
) as result;
select results_eq(
  $$ select outcome from ledger_results where operation = 'adjust-negative' $$,
  array['created'::text],
  'negative adjustment is a compensating transaction'
);
select results_eq(
  $$ select points from loyalty.wallet_balances where account_kind = 'available' $$,
  array[50::bigint],
  'negative adjustment debits available points'
);
select results_eq(
  $$
    select remaining_points from loyalty.point_lot_balances
    where lot_id = (
      select lot.id from loyalty.point_lots as lot
      join loyalty.ledger_entries as entry on entry.id = lot.credit_entry_id
      join loyalty.ledger_transactions as transaction on transaction.id = entry.transaction_id
      where transaction.idempotency_key = 'adjust:positive'
    )
  $$,
  array[150::bigint],
  'negative adjustment consumes the matching FIFO lot projection'
);

select is_empty(
  $$ select * from loyalty_private.wallet_projection_differences() $$,
  'stored wallet projections exactly rebuild from immutable entries'
);
update loyalty.wallet_balances set points = points + 1 where account_kind = 'available';
select results_eq(
  $$ select count(*)::bigint from loyalty_private.wallet_projection_differences() $$,
  array[1::bigint],
  'consistency checker detects projection drift'
);
select results_eq(
  $$
    select loyalty_private.rebuild_wallet_projections(
      (select id from loyalty.organizations where slug = 'ledger-one'), null
    )
  $$,
  array[6::bigint],
  'projection rebuild rewrites all six wallet buckets from entries'
);
select is_empty(
  $$ select * from loyalty_private.wallet_projection_differences() $$,
  'projection rebuild restores exact equality'
);
select is_empty(
  $$
    select transaction_id
    from loyalty.ledger_entries
    group by transaction_id
    having count(*) < 2 or sum(points::numeric) <> 0
  $$,
  'every stored ledger transaction remains balanced and multi-entry'
);
select is_empty(
  $$ select id from loyalty.ledger_entries where points = 0 $$,
  'zero-value ledger entries do not exist'
);
select is_empty(
  $$
    select transaction.id
    from loyalty.ledger_transactions as transaction
    left join loyalty.programme_versions as version
      on version.id = transaction.programme_version_id
    where version.id is null
  $$,
  'every transaction preserves an immutable programme version'
);

set local role authenticated;
set local request.jwt.claim.sub = '11111111-2222-4333-8444-555555555555';
select results_eq(
  'select count(*)::bigint from loyalty.wallets',
  array[1::bigint],
  'tenant member sees its own wallet'
);
set local request.jwt.claim.sub = '22222222-3333-4444-8555-666666666666';
select results_eq(
  'select count(*)::bigint from loyalty.wallets',
  array[0::bigint],
  'another tenant cannot see the wallet'
);
reset role;

select * from finish();
rollback;
