begin;

create extension if not exists pgtap with schema extensions;

select plan(30);

grant loyalty_runtime to current_user;
grant usage on schema extensions to loyalty_runtime;
grant execute on all functions in schema extensions to loyalty_runtime;

select has_table(
  'loyalty_private', 'managed_billing_session_reconciliations',
  'expired provider operations have immutable reconciliation evidence'
);
select results_eq($$
  select count(*)::bigint
  from information_schema.columns
  where table_schema = 'loyalty_private'
    and table_name = 'managed_billing_session_operations'
    and column_name in (
      'customer_replay_deadline_at', 'session_replay_deadline_at'
    )
$$, array[2::bigint], 'both provider stages have independent replay deadlines');
select has_function(
  'loyalty_private', 'reserve_managed_billing_session_v2',
  array['uuid','uuid','text','uuid','uuid','timestamp with time zone'],
  'serialized checkout reservation V2 exists'
);
select has_function(
  'loyalty_private', 'authorize_managed_billing_session_attempt_v2',
  array['uuid','uuid','text','timestamp with time zone'],
  'bounded provider authorization V2 exists'
);
select has_function(
  'loyalty_private', 'reconcile_managed_billing_session_v1',
  array['uuid','text','text','text','text','text','uuid','timestamp with time zone'],
  'deployment-operator reconciliation exists'
);
select ok((
  select relation.relrowsecurity and relation.relforcerowsecurity
  from pg_class as relation
  where relation.oid =
    'loyalty_private.managed_billing_session_reconciliations'::regclass
), 'reconciliation evidence forces RLS');
select ok(exists (
  select 1
  from pg_policies
  where schemaname = 'loyalty_private'
    and tablename = 'managed_billing_session_reconciliations'
    and policyname = 'managed_billing_session_reconciliations_owner'
    and roles @> array['loyalty_owner']::name[]
    and cmd = 'ALL'
), 'forced RLS permits only the security-definer owner path');
select ok(exists (
  select 1 from pg_trigger
  where tgrelid =
    'loyalty_private.managed_billing_session_reconciliations'::regclass
    and tgname = 'managed_billing_session_reconciliations_immutable'
    and not tgisinternal
), 'reconciliation evidence is immutable');
select ok(
  has_function_privilege(
    'loyalty_runtime',
    'loyalty_private.reserve_managed_billing_session_v2(uuid,uuid,text,uuid,uuid,timestamptz)',
    'EXECUTE'
  ) and has_function_privilege(
    'loyalty_runtime',
    'loyalty_private.authorize_managed_billing_session_attempt_v2(uuid,uuid,text,timestamptz)',
    'EXECUTE'
  ),
  'runtime receives only the bounded V2 reservation and authorization paths'
);
select ok(
  not has_function_privilege(
    'loyalty_runtime',
    'loyalty_private.reconcile_managed_billing_session_v1(uuid,text,text,text,text,text,uuid,timestamptz)',
    'EXECUTE'
  ) and not has_function_privilege(
    'authenticated',
    'loyalty_private.reconcile_managed_billing_session_v1(uuid,text,text,text,text,text,uuid,timestamptz)',
    'EXECUTE'
  ),
  'application and browser roles cannot assert provider reconciliation'
);

set local role loyalty_runtime;
select results_eq($$
  select deployment_mode, operation_state
  from loyalty_private.reserve_managed_billing_session_v2(
    'c1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000100',
    'checkout', 'c1000000-0000-4000-8000-000000000200',
    'c1000000-0000-4000-8000-000000000300',
    '2041-01-01 00:00:00+00'
  )
$$, $$ values ('self_hosted'::text, 'self_hosted'::text) $$,
  'self-hosted V2 returns before tenant or provider evidence');
reset role;
select results_eq($$
  select count(*)::bigint
  from loyalty_private.managed_billing_session_operations
$$, array[0::bigint], 'self-hosted V2 persists no operation');

insert into auth.users (id, email) values
  ('c1000000-0000-4000-8000-000000000001', 'billing-safety@example.test');
insert into loyalty.organizations (public_id, slug, name) values
  ('c1000000-0000-4000-8000-000000000100',
   'billing-safety', 'Billing Safety');
insert into loyalty.organization_memberships (
  organization_id, user_id, role
) values (
  (select id from loyalty.organizations where slug = 'billing-safety'),
  'c1000000-0000-4000-8000-000000000001', 'owner'
);
select loyalty_private.set_deployment_mode(
  'managed', 1, 'operator:m14', 'Enable billing safety test deployment',
  '2042-01-01 00:00:00+00'
);
select loyalty_private.set_organization_entitlement(
  'c1000000-0000-4000-8000-000000000100',
  'managed.billing', 'enabled', null, 'canary', 'operator:m14',
  'Enable billing safety test tenant', '2042-01-01 00:00:00+00', null
);
select loyalty_private.record_managed_billing_provider_configuration_v1(
  false, true, '2042-01-01 00:00:00+00', 'operator:m14',
  'Enable Stripe test provider for billing safety',
  'c1000000-0000-4000-8000-000000000401'
);
select loyalty_private.record_managed_billing_plan_v1(
  'c1000000-0000-4000-8000-000000000200', 1, 'safety', 'Safety',
  'Managed billing session safety plan', 'EUR', 4900, 'month', 1, 0,
  'price_BillingSafety0001', false, true,
  '2042-01-01 00:00:00+00', 'operator:m14',
  'Configure Stripe plan for billing safety',
  'c1000000-0000-4000-8000-000000000402'
);

set local role loyalty_runtime;
select results_eq($$
  select operation_state
  from loyalty_private.reserve_managed_billing_session_v2(
    'c1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000100',
    'checkout', 'c1000000-0000-4000-8000-000000000200',
    'c1000000-0000-4000-8000-000000000300',
    '2042-01-02 00:00:00+00'
  )
$$, array['customer_required'::text],
  'first checkout reserves one customer-provisioning operation');
select results_eq($$
  select count(*)::bigint
  from loyalty_private.authorize_managed_billing_session_attempt_v2(
    'c1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000300',
    'customer', '2042-01-02 00:00:00+00'
  )
$$, array[1::bigint], 'first provider attempt receives bounded authority');
reset role;
select results_eq($$
  select customer_replay_deadline_at
  from loyalty_private.managed_billing_session_operations
  where public_id = 'c1000000-0000-4000-8000-000000000300'
$$, array['2042-01-02 23:00:00+00'::timestamptz],
  'first authorization fixes the exact 23-hour replay deadline');

set local role loyalty_runtime;
select operation_state
from loyalty_private.record_managed_billing_session_attempt_v1(
  'c1000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000300',
  'c1000000-0000-4000-8000-000000000501',
  'customer', 'ambiguous', null, 'provider_timeout',
  '2042-01-02 00:01:00+00'
);
select results_eq($$
  select count(*)::bigint
  from loyalty_private.authorize_managed_billing_session_attempt_v2(
    'c1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000300',
    'customer', '2042-01-02 22:59:59+00'
  )
$$, array[1::bigint], 'exact ambiguous retry is allowed before the deadline');
select results_eq($$
  select count(*)::bigint
  from loyalty_private.authorize_managed_billing_session_attempt_v2(
    'c1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000300',
    'customer', '2042-01-02 23:00:00+00'
  )
$$, array[0::bigint], 'expired ambiguous retry receives no provider authority');
reset role;
select results_eq($$
  select state, last_detail_code
  from loyalty_private.managed_billing_session_operations
  where public_id = 'c1000000-0000-4000-8000-000000000300'
$$, $$ values (
  'reconciliation_required'::text,
  'provider_reconciliation_required'::text
) $$, 'expired ambiguity becomes an explicit reconciliation hold');
select throws_ok($$
  select loyalty_private.reconcile_managed_billing_session_v1(
    'c1000000-0000-4000-8000-000000000300', 'session',
    'provider_resource_absent', null, 'operator:m14',
    'The customer stage cannot be relabelled as a session stage',
    'c1000000-0000-4000-8000-000000000607',
    '2042-01-02 23:30:00+00'
  )
$$, '22023', 'invalid managed billing reconciliation stage',
  'reconciliation evidence must match the unresolved provider stage');
select results_eq($$
  select loyalty_private.reconcile_managed_billing_session_v1(
    'c1000000-0000-4000-8000-000000000300', 'customer',
    'provider_resource_absent', null, 'operator:m14',
    'Stripe search confirmed no customer was created',
    'c1000000-0000-4000-8000-000000000601',
    '2042-01-03 00:00:00+00'
  )
$$, array['rejected'::text],
  'operator can record confirmed provider absence without replaying the call');
select results_eq($$
  select loyalty_private.reconcile_managed_billing_session_v1(
    'c1000000-0000-4000-8000-000000000300', 'customer',
    'provider_resource_absent', null, 'operator:m14',
    'Stripe search confirmed no customer was created',
    'c1000000-0000-4000-8000-000000000601',
    '2042-01-03 00:01:00+00'
  )
$$, array['rejected'::text], 'exact reconciliation retry is idempotent');
select throws_ok($$
  select loyalty_private.reconcile_managed_billing_session_v1(
    'c1000000-0000-4000-8000-000000000300', 'customer',
    'provider_resource_absent', null, 'operator:m14',
    'Changed evidence must not reuse the operation',
    'c1000000-0000-4000-8000-000000000601',
    '2042-01-03 00:02:00+00'
  )
$$, '23505', 'managed billing reconciliation idempotency conflict',
  'changed reconciliation evidence fails closed');

create temporary table billing_safety_refs (
  account_id uuid, second_account_id uuid, state_id uuid
) on commit drop;
insert into billing_safety_refs (account_id)
select loyalty_private.record_managed_billing_account_v1(
  'c1000000-0000-4000-8000-000000000100',
  'cus_BillingSafety0001', false, 'operator:m14',
  'Bind provider customer for subscription safety',
  '2042-01-04 00:00:00+00',
  'c1000000-0000-4000-8000-000000000602'
);
update billing_safety_refs set state_id =
  loyalty_private.record_managed_billing_state_v1(
    'c1000000-0000-4000-8000-000000000100', account_id,
    'sub_BillingSafety0001', 'evt_BillingSafety0001', 'active',
    '2042-01-04 00:01:00+00', '2042-02-04 00:00:00+00',
    null, null, 'worker:billing-webhook',
    'Normalize active subscription for safety test',
    'c1000000-0000-4000-8000-000000000603'
  );

set local role loyalty_runtime;
select throws_ok($$
  select * from loyalty_private.reserve_managed_billing_session_v2(
    'c1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000100',
    'checkout', 'c1000000-0000-4000-8000-000000000200',
    'c1000000-0000-4000-8000-000000000301',
    '2042-01-04 01:00:00+00'
  )
$$, '55000', 'managed billing subscription already present',
  'live subscription blocks a second checkout at the database boundary');
reset role;

update billing_safety_refs set state_id =
  loyalty_private.record_managed_billing_state_v1(
    'c1000000-0000-4000-8000-000000000100', account_id,
    'sub_BillingSafety0001', 'evt_BillingSafety0002', 'cancelled',
    '2042-01-05 00:00:00+00', null, null, null,
    'worker:billing-webhook',
    'Normalize cancelled subscription for safety test',
    'c1000000-0000-4000-8000-000000000604'
  );
set local role loyalty_runtime;
select results_eq($$
  select operation_state
  from loyalty_private.reserve_managed_billing_session_v2(
    'c1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000100',
    'checkout', 'c1000000-0000-4000-8000-000000000200',
    'c1000000-0000-4000-8000-000000000301',
    '2042-01-05 01:00:00+00'
  )
$$, array['ready'::text],
  'an explicitly cancelled subscription permits resubscription');
reset role;

update billing_safety_refs set state_id =
  loyalty_private.record_managed_billing_state_v1(
    'c1000000-0000-4000-8000-000000000100', account_id,
    'sub_BillingSafety0002', 'evt_BillingSafety0003', 'active',
    '2042-01-05 02:00:00+00', '2042-02-05 00:00:00+00',
    null, null, 'worker:billing-webhook',
    'Normalize replacement subscription for safety test',
    'c1000000-0000-4000-8000-000000000605'
  );
set local role loyalty_runtime;
select results_eq($$
  select count(*)::bigint
  from loyalty_private.authorize_managed_billing_session_attempt_v2(
    'c1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000301',
    'session', '2042-01-05 02:01:00+00'
  )
$$, array[0::bigint],
  'a subscription arriving before provider authorization suppresses checkout');
reset role;
select results_eq($$
  select state, last_detail_code
  from loyalty_private.managed_billing_session_operations
  where public_id = 'c1000000-0000-4000-8000-000000000301'
$$, $$ values (
  'rejected'::text, 'managed_billing_subscription_already_present'::text
) $$, 'suppressed stale checkout remains explicit operator evidence');
select throws_ok($$
  select loyalty_private.record_managed_billing_state_v1(
    'c1000000-0000-4000-8000-000000000100', account_id,
    'sub_BillingSafety0003', 'evt_BillingSafety0004', 'active',
    '2042-01-05 03:00:00+00', '2042-02-05 00:00:00+00',
    null, null, 'worker:billing-webhook',
    'Reject concurrent second subscription identity',
    'c1000000-0000-4000-8000-000000000606'
  ) from billing_safety_refs
$$, '55000', 'managed billing subscription identity conflict',
  'a second live subscription identity is quarantined');
with inserted_account as (
  insert into loyalty_private.managed_billing_account_versions (
    organization_id, provider, provider_customer_id, live_mode,
    actor_reference, reason, effective_from, effective_until,
    idempotency_key, request_fingerprint
  )
  select organization.id, 'stripe', 'cus_BillingSafety0002', false,
    'operator:m14',
    'Seed a fixed-term second account version for organization-wide safety',
    '2042-01-06 00:00:00+00', '2042-01-07 00:00:00+00',
    'c1000000-0000-4000-8000-000000000608',
    extensions.digest(
      pg_catalog.convert_to('billing-safety-second-account', 'UTF8'),
      'sha256'
    )
  from loyalty.organizations as organization
  where organization.public_id = 'c1000000-0000-4000-8000-000000000100'
  returning public_id
)
update billing_safety_refs
set second_account_id = inserted_account.public_id
from inserted_account;
select throws_ok($$
  select loyalty_private.record_managed_billing_state_v1(
    'c1000000-0000-4000-8000-000000000100', second_account_id,
    'sub_BillingSafety0004', 'evt_BillingSafety0005', 'active',
    '2042-01-06 00:01:00+00', '2042-02-06 00:00:00+00',
    null, null, 'worker:billing-webhook',
    'Reject second subscription through another billing account version',
    'c1000000-0000-4000-8000-000000000609'
  ) from billing_safety_refs
$$, '55000', 'managed billing subscription identity conflict',
  'one-live-subscription enforcement spans billing-account versions');
select throws_ok($$
  update loyalty_private.managed_billing_session_reconciliations
  set reason = 'Rewritten reconciliation evidence is forbidden'
$$, '55000', 'immutable loyalty history cannot be changed',
  'reconciliation evidence cannot be rewritten');
select results_eq($$
  select count(*)::bigint from loyalty.ledger_transactions
$$, array[0::bigint], 'billing safety creates no loyalty ledger effect');

select * from finish();
rollback;
