begin;
select plan(31);

select has_table(
  'loyalty_private', 'woocommerce_customer_snapshot_deliveries',
  'private WooCommerce snapshot delivery state exists'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'loyalty_private.woocommerce_customer_snapshot_deliveries',
    'SELECT'
  ),
  'authenticated customers cannot enumerate snapshot delivery state'
);
select ok(
  not has_table_privilege(
    'loyalty_runtime',
    'loyalty_private.woocommerce_customer_snapshot_deliveries',
    'SELECT'
  ),
  'the dashboard runtime cannot enumerate snapshot delivery state'
);
select has_function(
  'loyalty_private', 'build_woocommerce_customer_snapshot_v1',
  array['bigint', 'text', 'bigint', 'timestamp with time zone'],
  'private snapshot builder exists'
);
select has_function(
  'loyalty_private', 'queue_woocommerce_customer_snapshots_v1',
  array['uuid', 'text[]'],
  'bounded signed-poll queue command exists'
);
select has_function(
  'loyalty_private', 'claim_woocommerce_commands',
  array['uuid', 'integer', 'integer', 'text[]'],
  'capability-aware connector lease exists'
);
select ok(
  has_function_privilege(
    'loyalty_runtime',
    'loyalty_private.queue_woocommerce_customer_snapshots_v1(uuid,text[])',
    'EXECUTE'
  ),
  'the signed connector runtime can request bounded snapshots'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'loyalty_private.queue_woocommerce_customer_snapshots_v1(uuid,text[])',
    'EXECUTE'
  ),
  'a customer session cannot queue connector snapshots'
);
select ok(
  not has_function_privilege(
    'loyalty_worker',
    'loyalty_private.queue_woocommerce_customer_snapshots_v1(uuid,text[])',
    'EXECUTE'
  ),
  'the value worker cannot impersonate a signed connector poll'
);
select ok(
  not has_function_privilege(
    'loyalty_runtime',
    'loyalty_private.build_woocommerce_customer_snapshot_v1(bigint,text,bigint,timestamp with time zone)',
    'EXECUTE'
  ),
  'the runtime cannot call the tenant and value builder directly'
);

insert into loyalty.organizations (slug, name)
values
  ('snapshot-one', 'Snapshot One Private Org'),
  ('snapshot-two', 'Snapshot Two Private Org');

insert into loyalty.workspaces (organization_id, slug, name)
select id, 'store', name || ' Store'
from loyalty.organizations
where slug in ('snapshot-one', 'snapshot-two');

insert into loyalty.programme_groups (organization_id, slug, name)
select id, 'loyalty', name || ' Loyalty'
from loyalty.organizations
where slug in ('snapshot-one', 'snapshot-two');

insert into loyalty.programme_group_workspaces (
  organization_id, programme_group_id, workspace_id
)
select organization.id, programme_group.id, workspace.id
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
join loyalty.workspaces as workspace
  on workspace.organization_id = organization.id
where organization.slug in ('snapshot-one', 'snapshot-two');

insert into loyalty.programmes (
  public_id, organization_id, programme_group_id, slug, name, status
)
select
  case organization.slug
    when 'snapshot-one' then '91000000-0000-4000-8000-000000000001'::uuid
    else '92000000-0000-4000-8000-000000000001'::uuid
  end,
  organization.id, programme_group.id, 'rewards',
  case organization.slug
    when 'snapshot-one' then 'First Loyalty'
    else 'Second Loyalty'
  end,
  'active'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
where organization.slug in ('snapshot-one', 'snapshot-two');

insert into loyalty.programme_versions (
  organization_id, programme_group_id, programme_id, version_number,
  status, configuration, configuration_sha256, published_at
)
select organization_id, programme_group_id, id, 1, 'published',
  '{"version":"1","tiers":[],"rewards":[]}'::jsonb,
  extensions.digest(public_id::text, 'sha256'),
  '2026-08-25 10:00:00+00'
from loyalty.programmes
where public_id in (
  '91000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001'
);

insert into loyalty.programme_earning_rules (
  organization_id, programme_group_id, programme_version_id, code, name,
  ordinal, source, enabled, priority, stackable, effect_kind, effect,
  conditions, purchase_exclusions, cap
)
select version.organization_id, version.programme_group_id, version.id,
  'purchase-base', 'Eligible purchases', 1, 'purchase', true, 0, false,
  'base_rate', '{"kind":"base_rate","pointsPerMajorUnit":"5"}'::jsonb,
  '{"productIds":[],"categoryIds":[],"currencyCodes":[],"markets":[],"channels":[],"activityCodes":[],"segmentCodes":[],"tierCodes":[],"startsAt":null,"endsAt":null}'::jsonb,
  '{"productIds":[],"categoryIds":[],"shipping":true,"tax":true,"fees":true,"giftCardPayments":true,"storeCreditPayments":true,"discounts":true}'::jsonb,
  '{"perEventPoints":null,"perMemberPoints":null,"memberPeriod":null,"rollingDays":null}'::jsonb
from loyalty.programme_versions as version
join loyalty.programmes as programme
  on programme.organization_id = version.organization_id
 and programme.id = version.programme_id
where programme.public_id = '91000000-0000-4000-8000-000000000001';

insert into loyalty.programme_rewards (
  organization_id, programme_group_id, programme_version_id,
  code, name, reward_kind, cost_points
)
select version.organization_id, version.programme_group_id, version.id,
  'shipping', 'Free shipping', 'free_shipping', 100
from loyalty.programme_versions as version
join loyalty.programmes as programme
  on programme.organization_id = version.organization_id
 and programme.id = version.programme_id
where programme.public_id = '91000000-0000-4000-8000-000000000001';

insert into loyalty.commerce_connections (
  public_id, organization_id, workspace_id, external_store_id, display_name,
  current_key_version, signing_material_ref, programme_id
)
select
  case organization.slug
    when 'snapshot-one' then '91000000-0000-4000-8000-000000000010'::uuid
    else '92000000-0000-4000-8000-000000000010'::uuid
  end,
  organization.id, workspace.id,
  case organization.slug
    when 'snapshot-one' then 'https://first.example.test'
    else 'https://second.example.test'
  end,
  case organization.slug
    when 'snapshot-one' then 'First Store'
    else 'Second Store'
  end,
  'v1', 'pool:' || organization.slug, programme.id
from loyalty.organizations as organization
join loyalty.workspaces as workspace
  on workspace.organization_id = organization.id
join loyalty.programmes as programme
  on programme.organization_id = organization.id
where organization.slug in ('snapshot-one', 'snapshot-two');

insert into loyalty.customers (organization_id, display_reference)
select id, 'Private customer profile'
from loyalty.organizations
where slug in ('snapshot-one', 'snapshot-two');

insert into loyalty.customer_identities (
  organization_id, customer_id, commerce_connection_id,
  external_customer_id, identity_kind, verified_at
)
select organization.id, customer.id, connection.id,
  'registered:7', 'registered', '2026-08-25 09:00:00+00'
from loyalty.organizations as organization
join loyalty.customers as customer
  on customer.organization_id = organization.id
join loyalty.commerce_connections as connection
  on connection.organization_id = organization.id
where organization.slug in ('snapshot-one', 'snapshot-two');

select * from loyalty_private.award_points(
  (select id from loyalty.organizations where slug = 'snapshot-one'),
  (select id from loyalty.programme_groups where organization_id =
    (select id from loyalty.organizations where slug = 'snapshot-one')),
  (select version.id from loyalty.programme_versions as version
   join loyalty.programmes as programme
     on programme.organization_id = version.organization_id
    and programme.id = version.programme_id
   where programme.public_id = '91000000-0000-4000-8000-000000000001'),
  (select id from loyalty.customers where organization_id =
    (select id from loyalty.organizations where slug = 'snapshot-one')),
  150, 'snapshot-award', extensions.digest('snapshot-award', 'sha256')
);

select * from loyalty_private.release_points(
  (select id from loyalty.organizations where slug = 'snapshot-one'),
  (select id from loyalty.programme_groups where organization_id =
    (select id from loyalty.organizations where slug = 'snapshot-one')),
  (select version.id from loyalty.programme_versions as version
   join loyalty.programmes as programme
     on programme.organization_id = version.organization_id
    and programme.id = version.programme_id
   where programme.public_id = '91000000-0000-4000-8000-000000000001'),
  (select entry.public_id
   from loyalty.ledger_entries as entry
   join loyalty.ledger_accounts as account
     on account.organization_id = entry.organization_id
    and account.id = entry.account_id
   where account.organization_id =
       (select id from loyalty.organizations where slug = 'snapshot-one')
     and account.account_kind = 'pending'
     and entry.points > 0),
  '2026-09-25 10:00:00+00', 'snapshot-release',
  extensions.digest('snapshot-release', 'sha256')
);

create temporary table snapshot_value_before as
select count(*)::bigint as transaction_count
from loyalty.ledger_transactions;

set local role loyalty_runtime;

select results_eq(
  $$ select external_customer_id, revision, outcome
     from loyalty_private.queue_woocommerce_customer_snapshots_v1(
       '91000000-0000-4000-8000-000000000010', array['7']::text[]
     ) $$,
  $$ values ('7'::text, '1'::text, 'created'::text) $$,
  'the signed connection creates one monotonic local snapshot command'
);
reset role;
select ok(
  (select payload::text !~* 'email|auth_user|organization|tenant|coupon|secret|fingerprint|display_reference'
   from loyalty_private.transactional_outbox
   where topic = 'woocommerce.customer_experience.put'
     and organization_id =
       (select id from loyalty.organizations where slug = 'snapshot-one')),
  'the snapshot command omits contacts tenant internals coupons secrets and evidence'
);
set local role loyalty_runtime;
select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.claim_woocommerce_commands(
       '91000000-0000-4000-8000-000000000010', 10, 60,
       array['coupon.issue.v2']::text[]
     ) $$,
  array[0::bigint],
  'an older connector cannot claim the snapshot command'
);
reset role;
set local role loyalty_runtime;
select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.claim_woocommerce_commands(
       '91000000-0000-4000-8000-000000000010', 10, 60,
       array['customer_experience.snapshot.v1']::text[]
     ) $$,
  array[1::bigint],
  'a capability-aware connector leases the snapshot exactly once'
);
reset role;
select results_eq(
  $$ select topic, payload_version, payload ->> 'kind'
     from loyalty_private.transactional_outbox
     where organization_id =
       (select id from loyalty.organizations where slug = 'snapshot-one')
       and topic = 'woocommerce.customer_experience.put' $$,
  $$ values (
    'woocommerce.customer_experience.put'::text,
    'v1'::text,
    'put_customer_experience_snapshot'::text
  ) $$,
  'the leased command uses the pinned topic payload pair'
);
select results_eq(
  $$ select payload #>> '{snapshot,externalCustomerId}',
            payload #>> '{snapshot,balances,available}',
            payload #>> '{snapshot,rewards,0,affordable}',
            payload #>> '{snapshot,earningMethods,0,name}'
     from loyalty_private.transactional_outbox
     where organization_id =
       (select id from loyalty.organizations where slug = 'snapshot-one')
       and topic = 'woocommerce.customer_experience.put' $$,
  $$ values ('7'::text, '150'::text, 'true'::text, 'Eligible purchases'::text) $$,
  'the database derives exact value affordability and safe catalogue content'
);
select ok(
  (select (payload #>> '{snapshot,refreshAfter}')::timestamptz
              > (payload #>> '{snapshot,generatedAt}')::timestamptz
      and (payload #>> '{snapshot,staleAfter}')::timestamptz
              > (payload #>> '{snapshot,refreshAfter}')::timestamptz
   from loyalty_private.transactional_outbox
   where organization_id =
       (select id from loyalty.organizations where slug = 'snapshot-one')
     and topic = 'woocommerce.customer_experience.put'),
  'freshness and stale display boundaries are explicit and ordered'
);
select ok(
  (select pg_column_size(payload) <= 32768
   from loyalty_private.transactional_outbox
   where organization_id =
       (select id from loyalty.organizations where slug = 'snapshot-one')
     and topic = 'woocommerce.customer_experience.put'),
  'the durable connector snapshot is bounded to 32 KiB'
);
set local role loyalty_runtime;
select results_eq(
  $$ select revision, outcome
     from loyalty_private.queue_woocommerce_customer_snapshots_v1(
       '91000000-0000-4000-8000-000000000010', array['7']::text[]
     ) $$,
  $$ values ('1'::text, 'duplicate'::text) $$,
  'a leased command request remains idempotent'
);
reset role;
select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.transactional_outbox
     where organization_id =
       (select id from loyalty.organizations where slug = 'snapshot-one')
       and topic = 'woocommerce.customer_experience.put' $$,
  array[1::bigint],
  'a repeated request creates no duplicate command'
);
select lives_ok(
  $$ select * from loyalty_private.finish_woocommerce_command(
    '91000000-0000-4000-8000-000000000010',
    (select command_id from loyalty_private.transactional_outbox
     where organization_id =
       (select id from loyalty.organizations where slug = 'snapshot-one')
       and topic = 'woocommerce.customer_experience.put'),
    'delivered', 'wordpress:snapshot:7:1', null, 0
  ) $$,
  'a successful local store acknowledges the display-only command'
);
set local role loyalty_runtime;
select results_eq(
  $$ select revision, outcome
     from loyalty_private.queue_woocommerce_customer_snapshots_v1(
       '91000000-0000-4000-8000-000000000010', array['7']::text[]
     ) $$,
  $$ values ('2'::text, 'created'::text) $$,
  'a later explicit refresh creates the next immutable revision'
);
reset role;
select results_eq(
  $$ select current_revision::text
     from loyalty_private.woocommerce_customer_snapshot_deliveries
     where organization_id =
       (select id from loyalty.organizations where slug = 'snapshot-one') $$,
  array['2'::text],
  'the delivery state advances monotonically'
);
set local role loyalty_runtime;
select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.queue_woocommerce_customer_snapshots_v1(
       '91000000-0000-4000-8000-000000000010', array['999']::text[]
     ) $$,
  array[0::bigint],
  'an unknown local customer selector reveals no row and queues no command'
);
select throws_ok(
  $$ select * from loyalty_private.queue_woocommerce_customer_snapshots_v1(
    '91000000-0000-4000-8000-000000000010', array['7', '7']::text[]
  ) $$,
  '22023', 'invalid WooCommerce snapshot selector batch',
  'duplicate customer selectors fail independently at the database boundary'
);
select throws_ok(
  $$ select * from loyalty_private.queue_woocommerce_customer_snapshots_v1(
    '91000000-0000-4000-8000-000000000010', array['email@example.test']::text[]
  ) $$,
  '22023', 'invalid WooCommerce snapshot selector batch',
  'contact-shaped selectors fail before any customer lookup'
);
select results_eq(
  $$ select external_customer_id, revision, outcome
     from loyalty_private.queue_woocommerce_customer_snapshots_v1(
       '92000000-0000-4000-8000-000000000010', array['7']::text[]
     ) $$,
  $$ values ('7'::text, '1'::text, 'created'::text) $$,
  'the same channel-local ID is independently valid for another connection'
);
reset role;
select results_eq(
  $$ select payload #>> '{snapshot,programmeName}',
            payload #>> '{snapshot,balances,available}'
     from loyalty_private.transactional_outbox
     where organization_id =
       (select id from loyalty.organizations where slug = 'snapshot-two')
       and topic = 'woocommerce.customer_experience.put' $$,
  $$ values ('Second Loyalty'::text, '0'::text) $$,
  'same-ID cross-tenant delivery derives only the signed connection value'
);
set local role loyalty_runtime;
select throws_ok(
  $$ select * from loyalty_private.claim_woocommerce_commands(
    '91000000-0000-4000-8000-000000000010', 10, 60,
    array['unknown.snapshot.v1']::text[]
  ) $$,
  '22023', 'unsupported connector capability',
  'unknown capabilities fail closed'
);

reset role;
select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_transactions $$,
  $$ select transaction_count from snapshot_value_before $$,
  'snapshot queueing leasing and acknowledgement create no value effect'
);
select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.woocommerce_customer_snapshot_deliveries
     where organization_id not in (
       select id from loyalty.organizations
       where slug in ('snapshot-one', 'snapshot-two')
     ) $$,
  array[0::bigint],
  'snapshot state remains tenant attributed without an unscoped row'
);

select * from finish();
rollback;
