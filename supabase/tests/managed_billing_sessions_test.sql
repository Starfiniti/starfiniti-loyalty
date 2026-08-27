begin;

create extension if not exists pgtap with schema extensions;

select plan(55);

grant loyalty_runtime to current_user;
grant usage on schema extensions to loyalty_runtime;
grant execute on all functions in schema extensions to loyalty_runtime;

-- 1-20: private shape, grants, RLS, minimization, and reviewed access paths.
select has_table('loyalty_private', 'managed_billing_provider_configuration_versions', 'private provider mode versions exist');
select has_table('loyalty_private', 'managed_billing_plan_versions', 'private plan versions exist');
select has_table('loyalty_private', 'managed_billing_session_operations', 'private session fences exist');
select has_table('loyalty_private', 'managed_billing_session_attempts', 'private attempt evidence exists');
select has_function('loyalty_private', 'record_managed_billing_provider_configuration_v1',
  array['boolean','boolean','timestamp with time zone','text','text','uuid'], 'operator provider configuration recorder exists');
select has_function('loyalty_private', 'record_managed_billing_plan_v1',
  array['uuid','integer','text','text','text','text','bigint','text','integer','integer','text','boolean','boolean','timestamp with time zone','text','text','uuid'], 'operator plan recorder exists');
select has_function('loyalty_private', 'list_managed_billing_plans_v1',
  array['uuid','uuid','timestamp with time zone'], 'minimized plan catalogue exists');
select has_function('loyalty_private', 'reserve_managed_billing_session_v1',
  array['uuid','uuid','text','uuid','uuid','timestamp with time zone'], 'database reservation exists');
select has_function('loyalty_private', 'authorize_managed_billing_session_attempt_v1',
  array['uuid','uuid','text','timestamp with time zone'], 'pre-provider authorization exists');
select has_function('loyalty_private', 'record_managed_billing_session_attempt_v1',
  array['uuid','uuid','uuid','text','text','text','text','timestamp with time zone'], 'attempt recorder exists');
select ok((
  select count(*) = 4 and bool_and(relation.relrowsecurity)
  from pg_class as relation join pg_namespace as namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'loyalty_private' and relation.relname in (
    'managed_billing_provider_configuration_versions', 'managed_billing_plan_versions',
    'managed_billing_session_operations', 'managed_billing_session_attempts'
  )
), 'all four private tables enable RLS');
select ok(
  exists (select 1 from pg_trigger where tgrelid = 'loyalty_private.managed_billing_provider_configuration_versions'::regclass and tgname = 'managed_billing_provider_configuration_versions_immutable' and not tgisinternal)
  and exists (select 1 from pg_trigger where tgrelid = 'loyalty_private.managed_billing_plan_versions'::regclass and tgname = 'managed_billing_plan_versions_immutable' and not tgisinternal)
  and exists (select 1 from pg_trigger where tgrelid = 'loyalty_private.managed_billing_session_attempts'::regclass and tgname = 'managed_billing_session_attempts_immutable' and not tgisinternal),
  'configuration, plan, and attempt evidence is immutable');
select ok(
  has_function_privilege('loyalty_runtime', 'loyalty_private.list_managed_billing_plans_v1(uuid,uuid,timestamptz)', 'EXECUTE')
  and has_function_privilege('loyalty_runtime', 'loyalty_private.reserve_managed_billing_session_v1(uuid,uuid,text,uuid,uuid,timestamptz)', 'EXECUTE')
  and has_function_privilege('loyalty_runtime', 'loyalty_private.authorize_managed_billing_session_attempt_v1(uuid,uuid,text,timestamptz)', 'EXECUTE')
  and has_function_privilege('loyalty_runtime', 'loyalty_private.record_managed_billing_session_attempt_v1(uuid,uuid,uuid,text,text,text,text,timestamptz)', 'EXECUTE'),
  'runtime has only the four orchestration commands');
select ok(
  not has_function_privilege('authenticated', 'loyalty_private.reserve_managed_billing_session_v1(uuid,uuid,text,uuid,uuid,timestamptz)', 'EXECUTE')
  and not has_function_privilege('anon', 'loyalty_private.list_managed_billing_plans_v1(uuid,uuid,timestamptz)', 'EXECUTE'),
  'browser roles cannot call billing orchestration');
select ok(
  not has_table_privilege('loyalty_runtime', 'loyalty_private.managed_billing_plan_versions', 'SELECT')
  and not has_table_privilege('loyalty_runtime', 'loyalty_private.managed_billing_session_operations', 'UPDATE')
  and not has_table_privilege('authenticated', 'loyalty_private.managed_billing_session_attempts', 'SELECT'),
  'application roles cannot enumerate or mutate private billing data');
select ok(
  not has_function_privilege('loyalty_runtime', 'loyalty_private.record_managed_billing_provider_configuration_v1(boolean,boolean,timestamptz,text,text,uuid)', 'EXECUTE')
  and not has_function_privilege('loyalty_runtime', 'loyalty_private.record_managed_billing_plan_v1(uuid,integer,text,text,text,text,bigint,text,integer,integer,text,boolean,boolean,timestamptz,text,text,uuid)', 'EXECUTE'),
  'runtime cannot configure provider mode or prices');
select results_eq($$
  select count(*)::bigint from pg_proc as routine
  join pg_namespace as namespace on namespace.oid = routine.pronamespace
  where namespace.nspname = 'loyalty_private'
    and routine.proname in (
      'record_managed_billing_provider_configuration_v1', 'record_managed_billing_plan_v1',
      'list_managed_billing_plans_v1', 'reserve_managed_billing_session_v1',
      'authorize_managed_billing_session_attempt_v1', 'record_managed_billing_session_attempt_v1'
    ) and routine.prosecdef
    and exists (select 1 from unnest(routine.proconfig) as setting where setting = 'search_path=""')
$$, array[6::bigint], 'all six functions are security definer with empty search paths');
select results_eq($$
  select count(*)::bigint from information_schema.columns
  where table_schema = 'loyalty_private'
    and table_name in ('managed_billing_provider_configuration_versions','managed_billing_plan_versions','managed_billing_session_operations','managed_billing_session_attempts')
    and column_name ~ '(api_key|secret|email|address|card|payment_method|redirect|return_url|response|raw_body|client_secret)'
$$, array[0::bigint], 'storage has no API secret contact payment redirect response or raw body field');
select results_eq($$
  select count(*)::bigint from information_schema.parameters
  where specific_schema = 'loyalty_private'
    and specific_name like 'reserve_managed_billing_session_v1%'
    and parameter_name ~ '(provider_customer|provider_price|live_mode|return|success|cancel|email|claims)'
$$, array[0::bigint], 'reservation accepts no provider return contact or claims authority');
select ok(
  exists (select 1 from pg_indexes where schemaname = 'loyalty_private' and indexname = 'managed_billing_plan_versions_current_idx')
  and exists (select 1 from pg_indexes where schemaname = 'loyalty_private' and indexname = 'managed_billing_session_operations_tenant_idx')
  and exists (select 1 from pg_indexes where schemaname = 'loyalty_private' and indexname = 'managed_billing_session_one_customer_provision_idx')
  and exists (select 1 from pg_indexes where schemaname = 'loyalty_private' and indexname = 'managed_billing_account_versions_one_open_idx'),
  'current-plan tenant-operation and one-customer access paths have reviewed indexes');
select results_eq($$
  select count(*)::bigint from loyalty.ledger_transactions
$$, array[0::bigint], 'billing schema creates no loyalty value effect');

-- 21-23: self-hosted exits before tenant or provider evidence.
set local role loyalty_runtime;
select results_eq($$
  select deployment_mode, operation_state, provider_customer_id, provider_price_id, live_mode
  from loyalty_private.reserve_managed_billing_session_v1(
    'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000100',
    'checkout', 'b1000000-0000-4000-8000-000000000200', 'b1000000-0000-4000-8000-000000000300',
    '2039-01-01 00:00:00+00'
  )
$$, $$ values ('self_hosted'::text, 'self_hosted'::text, null::text, null::text, null::boolean) $$,
  'self-hosted reservation returns before unknown tenant plan and provider lookups');
reset role;
select results_eq($$ select count(*)::bigint from loyalty_private.managed_billing_session_operations $$,
  array[0::bigint], 'self-hosted reservation persists no operation');
set local role loyalty_runtime;
select results_eq($$
  select count(*)::bigint from loyalty_private.list_managed_billing_plans_v1(
    'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000100',
    '2039-01-01 00:00:00+00'
  )
$$, array[0::bigint], 'self-hosted plan catalogue is empty without provider evidence');
reset role;

insert into auth.users (id, email) values
  ('b1000000-0000-4000-8000-000000000001', 'session-owner@example.test'),
  ('b1000000-0000-4000-8000-000000000002', 'session-admin@example.test'),
  ('b2000000-0000-4000-8000-000000000001', 'session-other@example.test');
insert into loyalty.organizations (public_id, slug, name) values
  ('b1000000-0000-4000-8000-000000000100', 'billing-session-one', 'Billing Session One'),
  ('b2000000-0000-4000-8000-000000000100', 'billing-session-two', 'Billing Session Two');
insert into loyalty.organization_memberships (organization_id, user_id, role) values
  ((select id from loyalty.organizations where slug = 'billing-session-one'), 'b1000000-0000-4000-8000-000000000001', 'owner'),
  ((select id from loyalty.organizations where slug = 'billing-session-one'), 'b1000000-0000-4000-8000-000000000002', 'admin'),
  ((select id from loyalty.organizations where slug = 'billing-session-two'), 'b2000000-0000-4000-8000-000000000001', 'owner');
select loyalty_private.set_deployment_mode('managed', 1, 'operator:m14',
  'Enable isolated managed billing session test', '2040-01-01 00:00:00+00');
select loyalty_private.set_organization_entitlement(
  'b1000000-0000-4000-8000-000000000100', 'managed.billing', 'enabled', null,
  'canary', 'operator:m14', 'Enable isolated tenant billing canary',
  '2040-01-01 00:00:00+00', null);

-- 24-28: operator configuration is append-only, idempotent, and minimized.
create temporary table billing_session_refs (
  provider_configuration_id uuid, plan_id uuid
) on commit drop;
insert into billing_session_refs (provider_configuration_id) select
  loyalty_private.record_managed_billing_provider_configuration_v1(
    false, true, '2040-01-01 00:00:00+00', 'operator:m14',
    'Enable Stripe test-mode session provider', 'b1000000-0000-4000-8000-000000000401');
select results_eq($$
  select loyalty_private.record_managed_billing_provider_configuration_v1(
    false, true, '2040-01-01 00:00:00+00', 'operator:m14',
    'Enable Stripe test-mode session provider', 'b1000000-0000-4000-8000-000000000401')
$$, $$ select provider_configuration_id from billing_session_refs $$,
  'exact provider configuration retry returns one version');
update billing_session_refs set plan_id = loyalty_private.record_managed_billing_plan_v1(
  'b1000000-0000-4000-8000-000000000200', 1, 'growth', 'Growth',
  'Growth plan for established stores', 'EUR', 4900, 'month', 1, 14,
  'price_BillingSessionTest0001', false, true, '2040-01-01 00:00:00+00',
  'operator:m14', 'Configure isolated Stripe test plan',
  'b1000000-0000-4000-8000-000000000402');
select results_eq($$
  select loyalty_private.record_managed_billing_plan_v1(
    'b1000000-0000-4000-8000-000000000200', 1, 'growth', 'Growth',
    'Growth plan for established stores', 'EUR', 4900, 'month', 1, 14,
    'price_BillingSessionTest0001', false, true, '2040-01-01 00:00:00+00',
    'operator:m14', 'Configure isolated Stripe test plan',
    'b1000000-0000-4000-8000-000000000402')
$$, $$ select plan_id from billing_session_refs $$, 'exact plan retry returns one version');
select throws_ok($$
  select loyalty_private.record_managed_billing_plan_v1(
    'b1000000-0000-4000-8000-000000000200', 3, 'growth', 'Growth',
    'Growth plan for established stores', 'EUR', 6900, 'month', 1, 0,
    'price_BillingSessionTest0003', false, true, '2040-01-01 01:00:00+00',
    'operator:m14', 'Reject skipped managed plan version',
    'b1000000-0000-4000-8000-000000000404')
$$, '22023', 'managed billing plan version sequence invalid',
  'plan versions cannot skip an immutable revision');
select throws_ok($$
  select loyalty_private.record_managed_billing_plan_v1(
    'b1000000-0000-4000-8000-000000000201', 1, 'growth', 'Other growth',
    'Conflicting public identity for plan key', 'EUR', 6900, 'month', 1, 0,
    'price_BillingSessionTest0004', false, true, '2040-01-01 01:00:00+00',
    'operator:m14', 'Reject conflicting managed plan identity',
    'b1000000-0000-4000-8000-000000000405')
$$, '23505', 'managed billing plan identity conflict',
  'one plan key cannot drift to another public selector');
set local role loyalty_runtime;
select results_eq($$
  select plan_key, display_name, currency, unit_amount_minor, billing_interval, interval_count, trial_days
  from loyalty_private.list_managed_billing_plans_v1(
    'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000100',
    '2040-01-02 00:00:00+00')
$$, $$ values ('growth'::text, 'Growth'::text, 'EUR'::text, 4900::bigint, 'month'::text, 1, 14) $$,
  'owner sees the current minimized plan');
select results_eq($$
  select count(*)::bigint from information_schema.columns
  where table_schema = 'loyalty_private' and table_name = 'managed_billing_plan_versions'
    and column_name = 'provider_price_id'
$$, array[1::bigint], 'provider Price exists only in the private catalogue');
select results_eq($$
  select count(*)::bigint from loyalty_private.list_managed_billing_plans_v1(
    'b1000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000100',
    '2040-01-02 00:00:00+00')
$$, array[0::bigint], 'admin cannot select commercial plans');

-- 29-39: checkout is reserved before provider use and converges exactly once.
select results_eq($$
  select deployment_mode, operation_state, provider_customer_id, provider_price_id,
    live_mode, customer_idempotency_key, session_idempotency_key
  from loyalty_private.reserve_managed_billing_session_v1(
    'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000100',
    'checkout', 'b1000000-0000-4000-8000-000000000200', 'b1000000-0000-4000-8000-000000000300',
    '2040-01-02 00:00:00+00')
$$, $$ values (
  'managed'::text, 'customer_required'::text, null::text, 'price_BillingSessionTest0001'::text,
  false, 'm14:customer:b1000000-0000-4000-8000-000000000300'::text,
  'm14:checkout:b1000000-0000-4000-8000-000000000300'::text
) $$, 'checkout reservation derives private price mode and stable provider keys');
select results_eq($$
  select operation_state from loyalty_private.reserve_managed_billing_session_v1(
    'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000100',
    'checkout', 'b1000000-0000-4000-8000-000000000200', 'b1000000-0000-4000-8000-000000000300',
    '2040-01-02 00:00:00+00')
$$, array['customer_required'::text], 'exact reservation retry returns the same fence');
reset role;
select results_eq($$ select count(*)::bigint from loyalty_private.managed_billing_session_operations $$,
  array[1::bigint], 'exact reservation retry stores one operation');
set local role loyalty_runtime;
select throws_ok($$
  select * from loyalty_private.reserve_managed_billing_session_v1(
    'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000100',
    'checkout', 'b1000000-0000-4000-8000-000000000200', 'b1000000-0000-4000-8000-000000000304',
    '2040-01-02 00:00:00+00')
$$, '55000', 'managed billing customer provisioning in progress',
  'a second operation cannot create another provider customer while the first is unresolved');
select throws_ok($$
  select * from loyalty_private.reserve_managed_billing_session_v1(
    'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000100',
    'portal', null, 'b1000000-0000-4000-8000-000000000300', '2040-01-02 00:00:00+00')
$$, '23505', 'managed billing session idempotency conflict', 'changed operation replay fails closed');
select results_eq($$
  select action, provider_customer_id, provider_price_id, live_mode, provider_idempotency_key
  from loyalty_private.authorize_managed_billing_session_attempt_v1(
    'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000300',
    'customer', '2040-01-02 00:00:00+00')
$$, $$ values ('checkout'::text, null::text, 'price_BillingSessionTest0001'::text, false,
  'm14:customer:b1000000-0000-4000-8000-000000000300'::text) $$,
  'customer creation is authorized immediately before provider use');
select results_eq($$
  select operation_state from loyalty_private.record_managed_billing_session_attempt_v1(
    'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000300',
    'b1000000-0000-4000-8000-000000000501', 'customer', 'succeeded',
    'cus_BillingSessionTest0001', 'customer_created', '2040-01-02 00:01:00+00')
$$, array['ready'::text], 'successful customer attempt binds one private account');
select results_eq($$
  select operation_state from loyalty_private.record_managed_billing_session_attempt_v1(
    'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000300',
    'b1000000-0000-4000-8000-000000000501', 'customer', 'succeeded',
    'cus_BillingSessionTest0001', 'customer_created', '2040-01-02 00:02:00+00')
$$, array['ready'::text], 'exact customer result retry returns the converged state');
reset role;
select results_eq($$
  select (select count(*) from loyalty_private.managed_billing_session_attempts)::bigint,
    (select count(*) from loyalty_private.managed_billing_account_versions)::bigint
$$, $$ values (1::bigint, 1::bigint) $$, 'customer retry creates one attempt and one account');
set local role loyalty_runtime;
select throws_ok($$
  select * from loyalty_private.record_managed_billing_session_attempt_v1(
    'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000300',
    'b1000000-0000-4000-8000-000000000501', 'customer', 'succeeded',
    'cus_BillingSessionChanged', 'customer_created', '2040-01-02 00:03:00+00')
$$, '23505', 'managed billing attempt idempotency conflict', 'changed attempt retry fails closed');
select throws_ok($$
  select * from loyalty_private.authorize_managed_billing_session_attempt_v1(
    'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000300',
    'customer', '2040-01-02 00:03:00+00')
$$, '55000', 'managed billing operation stage unavailable', 'completed customer stage cannot be replayed with new work');
select results_eq($$
  select action, provider_customer_id, provider_price_id, provider_idempotency_key
  from loyalty_private.authorize_managed_billing_session_attempt_v1(
    'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000300',
    'session', '2040-01-02 00:03:00+00')
$$, $$ values ('checkout'::text, 'cus_BillingSessionTest0001'::text,
  'price_BillingSessionTest0001'::text, 'm14:checkout:b1000000-0000-4000-8000-000000000300'::text) $$,
  'Checkout creation receives the DB-derived customer price and stable key');
select results_eq($$
  select operation_state from loyalty_private.record_managed_billing_session_attempt_v1(
    'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000300',
    'b1000000-0000-4000-8000-000000000502', 'session', 'succeeded',
    'cs_test_BillingSessionTest0001', 'checkout_created', '2040-01-02 00:04:00+00')
$$, array['completed'::text], 'Checkout completion stores only its provider resource fence');
reset role;
select results_eq($$ select count(*)::bigint from loyalty.ledger_transactions $$,
  array[0::bigint], 'Checkout and customer creation produce zero loyalty ledger effects');

-- 40-48: Portal, tenancy, historical price, disablement, and immutability.
set local role loyalty_runtime;
select results_eq($$
  select operation_state, provider_customer_id, provider_price_id
  from loyalty_private.reserve_managed_billing_session_v1(
    'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000100',
    'portal', null, 'b1000000-0000-4000-8000-000000000301', '2040-01-02 00:05:00+00')
$$, $$ values ('ready'::text, 'cus_BillingSessionTest0001'::text, null::text) $$,
  'Portal reservation requires and derives the current customer without a Price');
select results_eq($$
  select action, provider_customer_id, provider_price_id
  from loyalty_private.authorize_managed_billing_session_attempt_v1(
    'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000301',
    'session', '2040-01-02 00:06:00+00')
$$, $$ values ('portal'::text, 'cus_BillingSessionTest0001'::text, null::text) $$,
  'Portal authorization exposes no plan authority');
select throws_ok($$
  select * from loyalty_private.reserve_managed_billing_session_v1(
    'b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000100',
    'portal', null, 'b1000000-0000-4000-8000-000000000302', '2040-01-02 00:06:00+00')
$$, '42501', 'managed billing owner authority required', 'cross-tenant actor cannot reserve a session');
reset role;
select loyalty_private.record_managed_billing_plan_v1(
  'b1000000-0000-4000-8000-000000000200', 2, 'growth', 'Growth',
  'Growth plan for established stores', 'EUR', 5900, 'month', 1, 0,
  'price_BillingSessionTest0002', false, false, '2040-01-03 00:00:00+00',
  'operator:m14', 'Disable superseded isolated Stripe plan',
  'b1000000-0000-4000-8000-000000000403');
set local role loyalty_runtime;
select results_eq($$
  select count(*)::bigint from loyalty_private.list_managed_billing_plans_v1(
    'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000100',
    '2040-01-04 00:00:00+00')
$$, array[0::bigint], 'disabled current plan disappears from new selection');
select results_eq($$
  select operation_state, provider_price_id
  from loyalty_private.reserve_managed_billing_session_v1(
    'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000100',
    'checkout', 'b1000000-0000-4000-8000-000000000200', 'b1000000-0000-4000-8000-000000000300',
    '2040-01-04 00:00:00+00')
$$, $$ values ('completed'::text, 'price_BillingSessionTest0001'::text) $$,
  'historical operation retains its exact original Price evidence');
select throws_ok($$
  select * from loyalty_private.reserve_managed_billing_session_v1(
    'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000100',
    'checkout', 'b1000000-0000-4000-8000-000000000200', 'b1000000-0000-4000-8000-000000000303',
    '2040-01-04 00:00:00+00')
$$, '22023', 'managed billing plan unavailable', 'disabled plan cannot reserve new Checkout growth');
reset role;
select loyalty_private.set_organization_entitlement(
  'b1000000-0000-4000-8000-000000000100', 'managed.billing', 'disabled', null,
  'manual_override', 'operator:m14', 'Disable tenant billing after canary test',
  '2040-01-05 00:00:00+00', null);
set local role loyalty_runtime;
select throws_ok($$
  select * from loyalty_private.authorize_managed_billing_session_attempt_v1(
    'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000301',
    'session', '2040-01-06 00:00:00+00')
$$, '42501', 'managed billing operation unavailable', 'entitlement disablement prevents the next provider request');
reset role;
select results_eq($$
  select state, last_detail_code from loyalty_private.managed_billing_session_operations
  where public_id = 'b1000000-0000-4000-8000-000000000301'
$$, $$ values ('held'::text, 'billing_session_disabled'::text) $$,
  'disabled pending Portal is retained in an explicit recoverable hold');
select throws_ok($$
  update loyalty_private.managed_billing_session_attempts set detail_code = 'rewritten'
  where operation_id = (select id from loyalty_private.managed_billing_session_operations
    where public_id = 'b1000000-0000-4000-8000-000000000300')
$$, '55000', 'immutable record', 'provider attempt evidence cannot be rewritten');
select results_eq($$
  select count(*)::bigint from information_schema.columns
  where table_schema = 'loyalty_private'
    and table_name in ('managed_billing_session_operations','managed_billing_session_attempts')
    and column_name ~ '(url|email|address|card|payment|body|secret)'
$$, array[0::bigint], 'session evidence stores no redirect contact payment body or secret data');

select * from finish();
rollback;
