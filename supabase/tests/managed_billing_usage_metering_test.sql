begin;

create extension if not exists pgtap with schema extensions;

select plan(72);

grant loyalty_runtime, loyalty_worker to current_user;
grant usage on schema extensions to loyalty_runtime, loyalty_worker;
grant execute on all functions in schema extensions to loyalty_runtime, loyalty_worker;

-- 1-24: private shape, least privilege, minimization, and zero-value boundary.
select has_table('loyalty_private', 'managed_billing_usage_meter_versions',
  'private usage meter versions exist');
select has_table('loyalty_private', 'managed_billing_usage_facts',
  'private immutable usage facts exist');
select has_table('loyalty_private', 'managed_billing_usage_dispatches',
  'private recoverable usage dispatches exist');
select has_table('loyalty_private', 'managed_billing_usage_dispatch_attempts',
  'private usage attempt evidence exists');
select has_function('loyalty_private', 'record_managed_billing_usage_meter_v1',
  array['text','integer','text','boolean','boolean','timestamp with time zone','text','text','uuid'],
  'versioned external meter configuration exists');
select has_function('loyalty_private', 'capture_managed_billing_usage_facts_v1',
  array['integer','timestamp with time zone'], 'source fact capture exists');
select has_function('loyalty_private', 'record_managed_billing_usage_correction_v1',
  array['uuid','bigint','text','text','timestamp with time zone','uuid'],
  'compensating usage correction exists');
select has_function('loyalty_private', 'claim_managed_billing_usage_dispatches_v1',
  array['text','integer','integer','timestamp with time zone'],
  'isolated usage claim exists');
select has_function('loyalty_private', 'authorize_managed_billing_usage_dispatch_v1',
  array['uuid','uuid','text','timestamp with time zone'],
  'pre-provider usage authorization exists');
select has_function('loyalty_private', 'finish_managed_billing_usage_dispatch_v1',
  array['uuid','uuid','text','text','text','integer','text','timestamp with time zone'],
  'classified usage result recorder exists');
select has_function('loyalty', 'get_my_managed_billing_usage_summary_v1',
  array['uuid','timestamp with time zone','timestamp with time zone'],
  'tenant-scoped usage summary exists');
select ok((
  select count(*) = 4 and bool_and(relation.relrowsecurity)
  from pg_class as relation
  join pg_namespace as namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'loyalty_private'
    and relation.relname in (
      'managed_billing_usage_meter_versions',
      'managed_billing_usage_facts',
      'managed_billing_usage_dispatches',
      'managed_billing_usage_dispatch_attempts'
    )
), 'all four usage tables enable RLS');
select ok(
  (select relation.relrowsecurity and relation.relforcerowsecurity
   from pg_class as relation
   where relation.oid =
     'loyalty_private.managed_billing_usage_policy_holds'::regclass)
  and exists (
    select 1 from pg_policies
    where schemaname = 'loyalty_private'
      and tablename = 'managed_billing_usage_policy_holds'
      and policyname = 'managed_billing_usage_policy_holds_owner'
      and roles @> array['loyalty_owner']::name[]
      and cmd = 'ALL'
  )
  and (
    select data_type = 'bigint'
    from information_schema.columns
    where table_schema = 'loyalty_private'
      and table_name = 'managed_billing_usage_dispatch_attempts'
      and column_name = 'attempt_number'
  ),
  'policy holds force the owner-only RLS path and claim evidence is bigint-safe'
);
select ok(
  exists (select 1 from pg_trigger
    where tgrelid = 'loyalty_private.managed_billing_usage_meter_versions'::regclass
      and tgname = 'managed_billing_usage_meter_versions_immutable'
      and not tgisinternal)
  and exists (select 1 from pg_trigger
    where tgrelid = 'loyalty_private.managed_billing_usage_facts'::regclass
      and tgname = 'managed_billing_usage_facts_immutable'
      and not tgisinternal)
  and exists (select 1 from pg_trigger
    where tgrelid = 'loyalty_private.managed_billing_usage_dispatch_attempts'::regclass
      and tgname = 'managed_billing_usage_dispatch_attempts_immutable'
      and not tgisinternal),
  'meter facts and attempt history are immutable');
select ok(exists (
  select 1 from pg_trigger
  where tgrelid = 'loyalty_private.managed_billing_usage_dispatches'::regclass
    and tgname = 'managed_billing_usage_dispatch_identity'
    and not tgisinternal
), 'mutable dispatch state has an immutable identity fence');
select ok(
  has_function_privilege('loyalty_worker',
    'loyalty_private.capture_managed_billing_usage_facts_v1(integer,timestamptz)', 'EXECUTE')
  and has_function_privilege('loyalty_worker',
    'loyalty_private.claim_managed_billing_usage_dispatches_v1(text,integer,integer,timestamptz)', 'EXECUTE')
  and has_function_privilege('loyalty_worker',
    'loyalty_private.authorize_managed_billing_usage_dispatch_v1(uuid,uuid,text,timestamptz)', 'EXECUTE')
  and has_function_privilege('loyalty_worker',
    'loyalty_private.finish_managed_billing_usage_dispatch_v1(uuid,uuid,text,text,text,integer,text,timestamptz)', 'EXECUTE'),
  'worker has only capture claim authorization and result commands');
select ok(has_function_privilege('authenticated',
  'loyalty.get_my_managed_billing_usage_summary_v1(uuid,timestamptz,timestamptz)', 'EXECUTE'),
  'authenticated role can request the membership-scoped summary');
select ok(
  not has_function_privilege('loyalty_worker',
    'loyalty_private.record_managed_billing_usage_meter_v1(text,integer,text,boolean,boolean,timestamptz,text,text,uuid)', 'EXECUTE')
  and not has_function_privilege('loyalty_runtime',
    'loyalty_private.record_managed_billing_usage_correction_v1(uuid,bigint,text,text,timestamptz,uuid)', 'EXECUTE'),
  'application roles cannot configure meters or append corrections');
select ok(
  not has_function_privilege('authenticated',
    'loyalty_private.claim_managed_billing_usage_dispatches_v1(text,integer,integer,timestamptz)', 'EXECUTE')
  and not has_function_privilege('anon',
    'loyalty.get_my_managed_billing_usage_summary_v1(uuid,timestamptz,timestamptz)', 'EXECUTE'),
  'browser and anonymous roles cannot claim provider work');
select ok(
  not has_table_privilege('loyalty_worker',
    'loyalty_private.managed_billing_usage_facts', 'SELECT')
  and not has_table_privilege('loyalty_runtime',
    'loyalty_private.managed_billing_usage_dispatches', 'UPDATE')
  and not has_table_privilege('authenticated',
    'loyalty_private.managed_billing_usage_dispatch_attempts', 'SELECT'),
  'application roles cannot directly enumerate or mutate usage evidence');
select results_eq($$
  select count(*)::bigint from pg_proc as routine
  join pg_namespace as namespace on namespace.oid = routine.pronamespace
  where namespace.nspname = 'loyalty_private'
    and routine.proname in (
      'record_managed_billing_usage_meter_v1',
      'capture_managed_billing_usage_facts_v1',
      'record_managed_billing_usage_correction_v1',
      'claim_managed_billing_usage_dispatches_v1',
      'authorize_managed_billing_usage_dispatch_v1',
      'finish_managed_billing_usage_dispatch_v1'
    ) and routine.prosecdef
    and exists (select 1 from unnest(routine.proconfig) as setting
      where setting = 'search_path=""')
$$, array[6::bigint], 'all six private commands use security definer and empty search paths');
select results_eq($$
  select count(*)::bigint from information_schema.columns
  where table_schema = 'loyalty_private'
    and table_name in (
      'managed_billing_usage_meter_versions', 'managed_billing_usage_facts',
      'managed_billing_usage_dispatches',
      'managed_billing_usage_dispatch_attempts'
    ) and column_name ~ '(email|address|card|payment|price|api_key|secret|raw|body|payload|response_body|source_object)'
$$, array[0::bigint], 'usage storage excludes contact payment price secret body payload and raw source fields');
select results_eq($$
  select count(*)::bigint from information_schema.parameters
  where specific_schema = 'loyalty_private'
    and specific_name like 'claim_managed_billing_usage_dispatches_v1%'
    and parameter_mode = 'IN'
    and parameter_name ~ '(tenant|organization|customer|event|meter|price|claims)'
$$, array[0::bigint], 'claim accepts no tenant customer meter price or claims authority');
select ok(
  exists (select 1 from pg_indexes where schemaname = 'loyalty_private'
    and indexname = 'managed_billing_usage_facts_period_idx')
  and exists (select 1 from pg_indexes where schemaname = 'loyalty_private'
    and indexname = 'managed_billing_usage_dispatches_claim_idx')
  and exists (select 1 from pg_indexes where schemaname = 'loyalty_private'
    and indexname = 'managed_billing_usage_meter_versions_current_idx'),
  'period claim and current meter access paths have reviewed indexes');
select results_eq($$ select count(*)::bigint from loyalty.ledger_transactions $$,
  array[0::bigint], 'usage schema creates no loyalty ledger effect');

-- 25-26: self-hosted exits before source or provider evidence.
set local role loyalty_worker;
select results_eq($$
  select count(*)::bigint
  from loyalty_private.capture_managed_billing_usage_facts_v1(
    100, '2041-01-01 00:00:00+00'
  )
$$, array[0::bigint], 'self-hosted capture returns before source scans');
select results_eq($$
  select count(*)::bigint
  from loyalty_private.claim_managed_billing_usage_dispatches_v1(
    'billing-usage-worker', 25, 60, '2041-01-01 00:00:00+00'
  )
$$, array[0::bigint], 'self-hosted claim returns before provider configuration');
reset role;
select results_eq($$
  select
    (select count(*) from loyalty_private.managed_billing_usage_facts)::bigint,
    (select count(*) from loyalty_private.managed_billing_usage_dispatches)::bigint
$$, $$ values (0::bigint, 0::bigint) $$,
  'self-hosted capture and claim persist no usage state');

insert into auth.users (id, email) values
  ('c1000000-0000-4000-8000-000000000001', 'usage-owner@example.test'),
  ('c2000000-0000-4000-8000-000000000001', 'usage-other@example.test');
insert into loyalty.organizations (public_id, slug, name) values
  ('c1000000-0000-4000-8000-000000000100', 'billing-usage-one', 'Billing Usage One'),
  ('c2000000-0000-4000-8000-000000000100', 'billing-usage-two', 'Billing Usage Two');
insert into loyalty.organization_memberships (organization_id, user_id, role) values
  ((select id from loyalty.organizations where slug = 'billing-usage-one'),
    'c1000000-0000-4000-8000-000000000001', 'owner'),
  ((select id from loyalty.organizations where slug = 'billing-usage-two'),
    'c2000000-0000-4000-8000-000000000001', 'owner');
select loyalty_private.set_deployment_mode('managed', 1, 'operator:m14',
  'Enable isolated managed usage tests', '2041-01-01 00:00:00+00');
select loyalty_private.set_organization_entitlement(
  'c1000000-0000-4000-8000-000000000100', 'managed.billing', 'enabled', null,
  'canary', 'operator:m14', 'Enable isolated managed usage tenant',
  '2041-01-01 00:00:00+00', null);
select loyalty_private.record_managed_billing_provider_configuration_v1(
  false, true, '2041-01-01 00:00:00+00', 'operator:m14',
  'Enable isolated test usage provider',
  'c1000000-0000-4000-8000-000000000200');
select loyalty_private.record_managed_billing_account_v1(
  'c1000000-0000-4000-8000-000000000100',
  'cus_BillingUsageTest0001', false, 'operator:m14',
  'Bind isolated managed usage account', '2041-01-01 00:00:00+00',
  'c1000000-0000-4000-8000-000000000201');

create temporary table usage_meter_refs (
  meter_key text primary key,
  public_id uuid not null
) on commit drop;
insert into usage_meter_refs values (
  'orders', loyalty_private.record_managed_billing_usage_meter_v1(
    'orders', 1, 'starfiniti_orders', false, true,
    '2041-01-01 00:00:00+00', 'operator:m14',
    'Configure isolated order usage meter',
    'c1000000-0000-4000-8000-000000000301')
), (
  'active_members', loyalty_private.record_managed_billing_usage_meter_v1(
    'active_members', 1, 'starfiniti_active_members', false, true,
    '2041-01-01 00:00:00+00', 'operator:m14',
    'Configure isolated active-member usage meter',
    'c1000000-0000-4000-8000-000000000302')
), (
  'messages', loyalty_private.record_managed_billing_usage_meter_v1(
    'messages', 1, 'starfiniti_messages', false, true,
    '2041-01-01 00:00:00+00', 'operator:m14',
    'Configure isolated message usage meter',
    'c1000000-0000-4000-8000-000000000303')
), (
  'api_requests', loyalty_private.record_managed_billing_usage_meter_v1(
    'api_requests', 1, 'starfiniti_api_requests', false, true,
    '2041-01-01 00:00:00+00', 'operator:m14',
    'Configure isolated API usage meter',
    'c1000000-0000-4000-8000-000000000304')
);

-- 28-33: append-only external configuration is exact and versioned.
select results_eq($$
  select loyalty_private.record_managed_billing_usage_meter_v1(
    'orders', 1, 'starfiniti_orders', false, true,
    '2041-01-01 00:00:00+00', 'operator:m14',
    'Configure isolated order usage meter',
    'c1000000-0000-4000-8000-000000000301')
$$, $$ select public_id from usage_meter_refs where meter_key = 'orders' $$,
  'exact meter configuration retry returns one immutable version');
select throws_ok($$
  select loyalty_private.record_managed_billing_usage_meter_v1(
    'orders', 1, 'starfiniti_orders', false, false,
    '2041-01-01 00:00:00+00', 'operator:m14',
    'Change an existing idempotency request',
    'c1000000-0000-4000-8000-000000000301')
$$, '23505', 'managed billing usage meter idempotency conflict',
  'changed meter idempotency retry fails closed');
select throws_ok($$
  select loyalty_private.record_managed_billing_usage_meter_v1(
    'orders', 3, 'starfiniti_orders', false, true,
    '2041-01-02 00:00:00+00', 'operator:m14',
    'Reject skipped usage meter version',
    'c1000000-0000-4000-8000-000000000305')
$$, '22023', 'managed billing usage meter version sequence invalid',
  'meter versions cannot skip a revision');
select throws_ok($$
  select loyalty_private.record_managed_billing_usage_meter_v1(
    'messages', 2, 'starfiniti_orders', false, true,
    '2041-01-02 00:00:00+00', 'operator:m14',
    'Reject cross-metric provider event reuse',
    'c1000000-0000-4000-8000-000000000306')
$$, '23505', 'managed billing usage event name conflict',
  'one provider event name cannot change metric meaning');
select results_eq($$
  select count(*)::bigint from loyalty_private.managed_billing_usage_meter_versions
$$, array[4::bigint], 'exactly four reviewed meters are configured');
select results_eq($$
  select count(*)::bigint from loyalty_private.managed_billing_account_versions
$$, array[1::bigint], 'usage tenant has one private provider account');

insert into loyalty.workspaces (organization_id, slug, name)
select id, 'usage-shop', 'Usage source-time shop'
from loyalty.organizations where slug = 'billing-usage-one';
insert into loyalty.commerce_connections (
  public_id, organization_id, workspace_id, external_store_id, display_name,
  current_key_version, signing_material_ref
)
select 'c1000000-0000-4000-8000-000000000420', organization.id,
  workspace.id, 'billing-usage-source-time-store', 'Usage source-time store',
  'v1', 'vault://billing-usage-source-time'
from loyalty.organizations as organization
join loyalty.workspaces as workspace
  on workspace.organization_id = organization.id
where organization.slug = 'billing-usage-one'
  and workspace.slug = 'usage-shop';
insert into loyalty_private.commerce_delivery_inbox (
  receipt_id, organization_id, connection_id, source_delivery_id,
  envelope_version, source_event_id, event_type, source_object_id,
  occurred_at, delivered_at, key_version, nonce, body_sha256, raw_body,
  state, accepted_at, last_received_at
)
select source.receipt_id, organization.id, connection.id,
  source.delivery_id, '1', source.event_id,
  'commerce.order.status_changed', source.object_id,
  source.source_at, source.source_at, 'v1', source.nonce, repeat('a', 64),
  '{}'::jsonb, 'applied', source.source_at, source.source_at
from loyalty.organizations as organization
join loyalty.commerce_connections as connection
  on connection.organization_id = organization.id
cross join (values
  ('c1000000-0000-4000-8000-000000000421'::uuid,
    'usage-before-activation', 'usage-event-before-activation',
    'usage-order-before-activation', 'usage-nonce-before-activation',
    '2040-12-31 23:59:59+00'::timestamptz),
  ('c1000000-0000-4000-8000-000000000422'::uuid,
    'usage-after-activation', 'usage-event-after-activation',
    'usage-order-after-activation', 'usage-nonce-after-activation',
    '2041-01-05 00:00:00+00'::timestamptz)
) as source(receipt_id, delivery_id, event_id, object_id, nonce, source_at)
where organization.slug = 'billing-usage-one';
insert into loyalty_private.canonical_commerce_events (
  public_id, organization_id, connection_id, delivery_inbox_id,
  source_event_id, normalization_version, event_type, source_object_id,
  occurred_at, payload, effect_state, effect_processed_at, created_at
)
select source.public_id, inbox.organization_id, inbox.connection_id, inbox.id,
  inbox.source_event_id, 'v1', inbox.event_type, inbox.source_object_id,
  inbox.occurred_at, '{}'::jsonb, 'applied', source.source_at,
  source.source_at
from loyalty_private.commerce_delivery_inbox as inbox
join (values
  ('usage-before-activation'::text,
    'c1000000-0000-4000-8000-000000000423'::uuid,
    '2040-12-31 23:59:59+00'::timestamptz),
  ('usage-after-activation'::text,
    'c1000000-0000-4000-8000-000000000424'::uuid,
    '2041-01-05 00:00:00+00'::timestamptz)
) as source(delivery_id, public_id, source_at)
  on source.delivery_id = inbox.source_delivery_id;
select results_eq($$
  select meter_key, captured_count
  from loyalty_private.capture_managed_billing_usage_facts_v1(
    100, '2041-01-05 00:00:01+00'
  )
$$, $$ values ('orders'::text, 1::bigint) $$,
  'capture bills only the immutable order source after managed activation');

insert into loyalty_private.managed_billing_usage_facts (
  organization_id, meter_key, source_kind, source_subject_public_id,
  source_evidence_public_id, source_reference_sha256, quantity,
  usage_period_start, usage_period_end, occurred_at,
  actor_reference, reason, fact_sha256, created_at
)
select organization.id, source.meter_key, source.source_kind,
  source.subject_id, source.evidence_id,
  extensions.digest(convert_to('source:' || source.meter_key, 'UTF8'), 'sha256'),
  1, '2041-01-01 00:00:00+00', '2041-02-01 00:00:00+00',
  '2041-01-05 00:00:00+00', 'worker:billing-usage-capture',
  'Captured from one reviewed immutable product source fact',
  extensions.digest(convert_to('fact:' || source.meter_key, 'UTF8'), 'sha256'),
  '2041-01-05 00:00:00+00'
from loyalty.organizations as organization
cross join (values
  ('active_members'::text, 'active_member_month'::text,
    'c1000000-0000-4000-8000-000000000402'::uuid,
    'c1000000-0000-4000-8000-000000000412'::uuid),
  ('messages'::text, 'smtp_message'::text,
    'c1000000-0000-4000-8000-000000000403'::uuid,
    'c1000000-0000-4000-8000-000000000413'::uuid),
  ('api_requests'::text, 'service_customer_command'::text,
    'c1000000-0000-4000-8000-000000000404'::uuid,
    'c1000000-0000-4000-8000-000000000414'::uuid)
) as source(meter_key, source_kind, subject_id, evidence_id)
where organization.slug = 'billing-usage-one';

-- 34-46: one dispatch per fact, live reauthorization, and classified outcomes.
select results_eq($$
  select meter_key, quantity from loyalty_private.managed_billing_usage_facts
  order by meter_key
$$, $$ values
  ('active_members'::text, 1::bigint), ('api_requests'::text, 1::bigint),
  ('messages'::text, 1::bigint), ('orders'::text, 1::bigint)
$$, 'all four bigint source facts are retained exactly');

create temporary table usage_claims (
  dispatch_public_id uuid primary key,
  lease_token uuid not null,
  attempt_number integer not null
) on commit drop;
insert into usage_claims
select * from loyalty_private.claim_managed_billing_usage_dispatches_v1(
  'billing-usage-worker', 25, 60, '2041-01-05 00:00:00+00'
);
select results_eq($$ select count(*)::bigint from usage_claims $$,
  array[4::bigint], 'one worker claim is created per source fact');
select ok((
  select count(*) = 4 and count(distinct dispatch.usage_fact_id) = 4
    and bool_and(dispatch.provider_identifier =
      'm14u_' || replace(fact.public_id::text, '-', ''))
  from loyalty_private.managed_billing_usage_dispatches as dispatch
  join loyalty_private.managed_billing_usage_facts as fact
    on fact.organization_id = dispatch.organization_id
   and fact.id = dispatch.usage_fact_id
), 'dispatches have one permanent identifier per fact');
select results_eq($$
  select count(*)::bigint
  from loyalty_private.claim_managed_billing_usage_dispatches_v1(
    'billing-usage-peer', 25, 60, '2041-01-05 00:00:10+00'
  )
$$, array[0::bigint], 'concurrent claim cannot lease processing facts twice');

select results_eq($$
  select authority.provider_event_name, authority.provider_customer_id,
    authority.quantity, authority.live_mode
  from usage_claims as claim
  join loyalty_private.managed_billing_usage_dispatches as dispatch
    on dispatch.public_id = claim.dispatch_public_id
  join loyalty_private.managed_billing_usage_facts as fact
    on fact.id = dispatch.usage_fact_id
  cross join lateral loyalty_private.authorize_managed_billing_usage_dispatch_v1(
    claim.dispatch_public_id, claim.lease_token,
    'billing-usage-worker', '2041-01-05 00:00:10+00'
  ) as authority
  where fact.meter_key = 'orders'
$$, $$ values ('starfiniti_orders'::text, 'cus_BillingUsageTest0001'::text,
  '1'::text, false) $$,
  'authorization derives minimized provider payload immediately before use');
select throws_ok($$
  select * from loyalty_private.authorize_managed_billing_usage_dispatch_v1(
    (select claim.dispatch_public_id from usage_claims as claim
      join loyalty_private.managed_billing_usage_dispatches as dispatch
        on dispatch.public_id = claim.dispatch_public_id
      join loyalty_private.managed_billing_usage_facts as fact
        on fact.id = dispatch.usage_fact_id where fact.meter_key = 'orders'),
    (select claim.lease_token from usage_claims as claim
      join loyalty_private.managed_billing_usage_dispatches as dispatch
        on dispatch.public_id = claim.dispatch_public_id
      join loyalty_private.managed_billing_usage_facts as fact
        on fact.id = dispatch.usage_fact_id where fact.meter_key = 'orders'),
    'billing-usage-attacker', '2041-01-05 00:00:11+00'
  )
$$, '42501', 'managed billing usage dispatch unavailable',
  'wrong worker cannot reuse another lease');

select results_eq($$
  select result.state
  from usage_claims as claim
  join loyalty_private.managed_billing_usage_dispatches as dispatch
    on dispatch.public_id = claim.dispatch_public_id
  join loyalty_private.managed_billing_usage_facts as fact
    on fact.id = dispatch.usage_fact_id
  cross join lateral loyalty_private.finish_managed_billing_usage_dispatch_v1(
    claim.dispatch_public_id, claim.lease_token, 'billing-usage-worker',
    'accepted', 'success', 200, null, '2041-01-05 00:00:20+00'
  ) as result
  where fact.meter_key = 'orders'
$$, array['accepted'::text], 'accepted provider result closes the order dispatch');
select results_eq($$
  select state, accepted_at from loyalty_private.managed_billing_usage_dispatches
  where usage_fact_id = (select id from loyalty_private.managed_billing_usage_facts
    where meter_key = 'orders')
$$, $$ values ('accepted'::text, '2041-01-05 00:00:20+00'::timestamptz) $$,
  'accepted state retains its provider acknowledgement time');
select results_eq($$
  select outcome, response_class, response_code
  from loyalty_private.managed_billing_usage_dispatch_attempts
  where dispatch_id = (select id from loyalty_private.managed_billing_usage_dispatches
    where usage_fact_id = (select id from loyalty_private.managed_billing_usage_facts
      where meter_key = 'orders'))
$$, $$ values ('accepted'::text, 'success'::text, 200) $$,
  'accepted attempt evidence is minimized and immutable');
select throws_ok($$
  select * from loyalty_private.finish_managed_billing_usage_dispatch_v1(
    (select claim.dispatch_public_id from usage_claims as claim
      join loyalty_private.managed_billing_usage_dispatches as dispatch
        on dispatch.public_id = claim.dispatch_public_id
      join loyalty_private.managed_billing_usage_facts as fact
        on fact.id = dispatch.usage_fact_id where fact.meter_key = 'orders'),
    (select claim.lease_token from usage_claims as claim
      join loyalty_private.managed_billing_usage_dispatches as dispatch
        on dispatch.public_id = claim.dispatch_public_id
      join loyalty_private.managed_billing_usage_facts as fact
        on fact.id = dispatch.usage_fact_id where fact.meter_key = 'orders'),
    'billing-usage-worker', 'accepted', 'success', 200, null,
    '2041-01-05 00:00:21+00'
  )
$$, '42501', 'managed billing usage result not owned',
  'a completed provider lease cannot be replayed');

select authority.provider_event_name
from usage_claims as claim
join loyalty_private.managed_billing_usage_dispatches as dispatch
  on dispatch.public_id = claim.dispatch_public_id
join loyalty_private.managed_billing_usage_facts as fact
  on fact.id = dispatch.usage_fact_id
cross join lateral loyalty_private.authorize_managed_billing_usage_dispatch_v1(
  claim.dispatch_public_id, claim.lease_token, 'billing-usage-worker',
  '2041-01-05 00:00:10+00'
) as authority
where fact.meter_key in ('active_members', 'messages', 'api_requests');
select results_eq($$
  select result.state
  from usage_claims as claim
  join loyalty_private.managed_billing_usage_dispatches as dispatch
    on dispatch.public_id = claim.dispatch_public_id
  join loyalty_private.managed_billing_usage_facts as fact
    on fact.id = dispatch.usage_fact_id
  cross join lateral loyalty_private.finish_managed_billing_usage_dispatch_v1(
    claim.dispatch_public_id, claim.lease_token, 'billing-usage-worker',
    'retryable', 'temporary_failure', 503,
    'stripe_usage_provider_unavailable', '2041-01-05 00:00:20+00'
  ) as result
  where fact.meter_key = 'active_members'
$$, array['retryable'::text], 'temporary provider failure receives a bounded retry');
select results_eq($$
  select result.state
  from usage_claims as claim
  join loyalty_private.managed_billing_usage_dispatches as dispatch
    on dispatch.public_id = claim.dispatch_public_id
  join loyalty_private.managed_billing_usage_facts as fact
    on fact.id = dispatch.usage_fact_id
  cross join lateral loyalty_private.finish_managed_billing_usage_dispatch_v1(
    claim.dispatch_public_id, claim.lease_token, 'billing-usage-worker',
    'ambiguous', 'ambiguous', null, 'stripe_usage_timeout',
    '2041-01-05 00:00:20+00'
  ) as result
  where fact.meter_key = 'messages'
$$, array['ambiguous'::text], 'timeout is held ambiguous instead of blindly replayed');
select results_eq($$
  select result.state
  from usage_claims as claim
  join loyalty_private.managed_billing_usage_dispatches as dispatch
    on dispatch.public_id = claim.dispatch_public_id
  join loyalty_private.managed_billing_usage_facts as fact
    on fact.id = dispatch.usage_fact_id
  cross join lateral loyalty_private.finish_managed_billing_usage_dispatch_v1(
    claim.dispatch_public_id, claim.lease_token, 'billing-usage-worker',
    'rejected', 'permanent_failure', 422, 'stripe_usage_request_rejected',
    '2041-01-05 00:00:20+00'
  ) as result
  where fact.meter_key = 'api_requests'
$$, array['rejected'::text], 'permanent provider rejection requires reconciliation');

create temporary table usage_held_claim (
  dispatch_public_id uuid primary key,
  lease_token uuid not null,
  attempt_number integer not null
) on commit drop;
insert into usage_held_claim
select * from loyalty_private.claim_managed_billing_usage_dispatches_v1(
  'billing-usage-worker', 1, 60, '2041-01-05 00:00:50+00'
);
select authority.provider_event_name
from usage_held_claim as claim
cross join lateral loyalty_private.authorize_managed_billing_usage_dispatch_v1(
  claim.dispatch_public_id, claim.lease_token, 'billing-usage-worker',
  '2041-01-05 00:00:51+00'
) as authority;
select results_eq($$
  select result.state, result.next_attempt_at
  from usage_held_claim as claim
  cross join lateral loyalty_private.finish_managed_billing_usage_dispatch_v1(
    claim.dispatch_public_id, claim.lease_token, 'billing-usage-worker',
    'held', 'policy', null, 'stripe_usage_provider_config_unavailable',
    '2041-01-05 00:00:52+00'
  ) as result
$$, $$ values ('held'::text, '2041-01-05 00:05:52+00'::timestamptz) $$,
  'policy-held provider attempts cool before another bounded claim');

-- 48-52: corrections compensate and remain exact beyond provider retry windows.
create temporary table usage_correction_ref (public_id uuid) on commit drop;
insert into usage_correction_ref select
  loyalty_private.record_managed_billing_usage_correction_v1(
    (select public_id from loyalty_private.managed_billing_usage_facts
      where meter_key = 'orders' and source_kind = 'commerce_order'),
    -1, 'operator:m14', 'Reverse incorrectly classified order usage',
    '2041-01-05 00:02:00+00',
    'c1000000-0000-4000-8000-000000000501'
  );
select results_eq($$
  select loyalty_private.record_managed_billing_usage_correction_v1(
    (select public_id from loyalty_private.managed_billing_usage_facts
      where meter_key = 'orders' and source_kind = 'commerce_order'),
    -1, 'operator:m14', 'Reverse incorrectly classified order usage',
    '2041-01-05 00:02:00+00',
    'c1000000-0000-4000-8000-000000000501')
$$, $$ select public_id from usage_correction_ref $$,
  'exact correction retry returns one compensating fact');
select results_eq($$
  select count(*)::bigint from loyalty_private.managed_billing_usage_facts
  where source_kind = 'correction'
$$, array[1::bigint], 'correction retry stores one fact');
select throws_ok($$
  select loyalty_private.record_managed_billing_usage_correction_v1(
    (select public_id from loyalty_private.managed_billing_usage_facts
      where meter_key = 'orders' and source_kind = 'commerce_order'),
    1, 'operator:m14', 'Change existing correction request quantity',
    '2041-01-05 00:02:00+00',
    'c1000000-0000-4000-8000-000000000501')
$$, '23505', 'managed billing usage correction idempotency conflict',
  'changed correction retry fails closed');
select throws_ok($$
  select loyalty_private.record_managed_billing_usage_correction_v1(
    (select public_id from loyalty_private.managed_billing_usage_facts
      where meter_key = 'orders' and source_kind = 'commerce_order'),
    -1, 'operator:m14', 'Reject usage correction below zero',
    '2041-01-05 00:03:00+00',
    'c1000000-0000-4000-8000-000000000502')
$$, '22003', 'managed billing usage correction total invalid',
  'cumulative corrected source usage cannot become negative');
select throws_ok($$
  select loyalty_private.record_managed_billing_usage_correction_v1(
    (select public_id from loyalty_private.managed_billing_usage_facts
      where meter_key = 'orders' and source_kind = 'commerce_order'),
    1, 'operator:m14', 'Reject correction in another UTC billing month',
    '2041-02-01 00:00:00+00',
    'c1000000-0000-4000-8000-000000000503')
$$, '22023', 'managed billing usage correction period invalid',
  'provider correction timestamp cannot drift from its immutable UTC period');

create temporary table usage_correction_claim (
  dispatch_public_id uuid primary key,
  lease_token uuid not null,
  attempt_number integer not null
) on commit drop;
insert into usage_correction_claim
select * from loyalty_private.claim_managed_billing_usage_dispatches_v1(
  'billing-usage-correction-worker', 25, 60, '2041-01-05 00:03:10+00'
);
select results_eq($$
  select authority.provider_event_name, authority.provider_customer_id,
    authority.quantity
  from usage_correction_claim as claim
  join loyalty_private.managed_billing_usage_dispatches as dispatch
    on dispatch.public_id = claim.dispatch_public_id
  join loyalty_private.managed_billing_usage_facts as fact
    on fact.id = dispatch.usage_fact_id
  cross join lateral loyalty_private.authorize_managed_billing_usage_dispatch_v1(
    claim.dispatch_public_id, claim.lease_token,
    'billing-usage-correction-worker', '2041-01-05 00:03:11+00'
  ) as authority
  where fact.source_kind = 'correction'
$$, $$ values ('starfiniti_orders'::text, 'cus_BillingUsageTest0001'::text,
  '-1'::text) $$,
  'correction dispatch reuses its accepted source meter and account');

-- Policy/local configuration holds are independent from provider attempts.
update loyalty_private.managed_billing_usage_dispatches
set next_attempt_at = '2050-01-01 00:00:00+00'
where state = 'held';
insert into loyalty_private.managed_billing_usage_facts (
  organization_id, meter_key, source_kind, source_subject_public_id,
  source_evidence_public_id, source_reference_sha256, quantity,
  usage_period_start, usage_period_end, occurred_at,
  actor_reference, reason, fact_sha256, created_at
)
select organization.id, 'api_requests', 'service_customer_command',
  'c1000000-0000-4000-8000-000000000430',
  'c1000000-0000-4000-8000-000000000431',
  extensions.digest(convert_to('source:v2-hold', 'UTF8'), 'sha256'),
  1, '2041-01-01 00:00:00+00', '2041-02-01 00:00:00+00',
  '2041-01-05 00:03:20+00', 'worker:billing-usage-capture',
  'Captured for policy hold attempt isolation test',
  extensions.digest(convert_to('fact:v2-hold', 'UTF8'), 'sha256'),
  '2041-01-05 00:03:20+00'
from loyalty.organizations as organization
where organization.slug = 'billing-usage-one';
create temporary table usage_v2_hold_claim (
  dispatch_public_id uuid primary key,
  lease_token uuid not null,
  claim_sequence bigint not null
) on commit drop;
do $$
declare
  iteration integer;
  attempt_at timestamptz;
begin
  for iteration in 0..10 loop
    attempt_at := '2041-01-05 00:10:00+00'::timestamptz
      + pg_catalog.make_interval(mins => iteration * 6);
    delete from usage_v2_hold_claim;
    insert into usage_v2_hold_claim
    select * from loyalty_private.claim_managed_billing_usage_dispatches_v2(
      'billing-usage-v2-worker', 1, 60, attempt_at
    );
    if (select count(*) from usage_v2_hold_claim) <> 1 then
      raise exception 'usage V2 hold claim unavailable';
    end if;
    perform *
    from usage_v2_hold_claim as claim
    cross join lateral loyalty_private.authorize_managed_billing_usage_dispatch_v2(
      claim.dispatch_public_id, claim.lease_token,
      'billing-usage-v2-worker', attempt_at + interval '1 second'
    );
    perform *
    from usage_v2_hold_claim as claim
    cross join lateral loyalty_private.hold_managed_billing_usage_dispatch_v1(
      claim.dispatch_public_id, claim.lease_token,
      'billing-usage-v2-worker',
      'stripe_usage_provider_config_unavailable',
      attempt_at + interval '2 seconds'
    );
  end loop;
end;
$$;
select results_eq($$
  select dispatch.provider_attempt_count, dispatch.claim_sequence_count
  from loyalty_private.managed_billing_usage_dispatches as dispatch
  join loyalty_private.managed_billing_usage_facts as fact
    on fact.id = dispatch.usage_fact_id
  where fact.source_evidence_public_id =
    'c1000000-0000-4000-8000-000000000431'
$$, $$ values (0, 11::bigint) $$,
  'eleven local holds consume zero provider attempts');
select results_eq($$
  select count(*)::bigint
  from loyalty_private.managed_billing_usage_policy_holds as hold
  join loyalty_private.managed_billing_usage_dispatches as dispatch
    on dispatch.id = hold.dispatch_id
  join loyalty_private.managed_billing_usage_facts as fact
    on fact.id = dispatch.usage_fact_id
  where fact.source_evidence_public_id =
    'c1000000-0000-4000-8000-000000000431'
$$, array[11::bigint], 'every local hold remains immutable evidence');
delete from usage_v2_hold_claim;
insert into usage_v2_hold_claim
select * from loyalty_private.claim_managed_billing_usage_dispatches_v2(
  'billing-usage-v2-worker', 1, 60, '2041-01-05 01:16:00+00'
);
select results_eq($$ select count(*)::bigint from usage_v2_hold_claim $$,
  array[1::bigint], 'configuration recovery permits a twelfth claim');
select authority.provider_event_name
from usage_v2_hold_claim as claim
cross join lateral loyalty_private.authorize_managed_billing_usage_dispatch_v2(
  claim.dispatch_public_id, claim.lease_token,
  'billing-usage-v2-worker', '2041-01-05 01:16:01+00'
) as authority;
select results_eq($$
  select attempt.attempt_number
  from usage_v2_hold_claim as claim
  cross join lateral loyalty_private.begin_managed_billing_usage_provider_attempt_v1(
    claim.dispatch_public_id, claim.lease_token,
    'billing-usage-v2-worker', '2041-01-05 01:16:02+00'
  ) as attempt
$$, array[1], 'first real provider send consumes attempt one');
select results_eq($$
  select result.state
  from usage_v2_hold_claim as claim
  cross join lateral loyalty_private.finish_managed_billing_usage_dispatch_v2(
    claim.dispatch_public_id, claim.lease_token,
    'billing-usage-v2-worker', 'accepted', 'success', 200, null,
    '2041-01-05 01:16:03+00'
  ) as result
$$, array['accepted'::text],
  'recovered provider send closes after eleven non-provider holds');

-- Tenant summary, privacy, immutability, and final zero-ledger proof.
set local role authenticated;
select set_config('request.jwt.claim.sub',
  'c1000000-0000-4000-8000-000000000001', true);
select results_eq($$
  select jsonb_array_length(usage_summary -> 'meters'),
    usage_summary -> 'meters' -> 0 ->> 'quantity',
    usage_summary ->> 'dispatchMode'
  from loyalty.get_my_managed_billing_usage_summary_v1(
    'c1000000-0000-4000-8000-000000000100',
    '2041-01-01 00:00:00+00', '2041-01-05 00:04:00+00'
  )
$$, $$ values (4, '0'::text, 'configured'::text) $$,
  'owner summary returns four exact UTC metrics including compensation');
select results_eq($$
  select count(*)::bigint
  from loyalty.get_my_managed_billing_usage_summary_v1(
    'c2000000-0000-4000-8000-000000000100',
    '2041-01-01 00:00:00+00', '2041-01-05 00:04:00+00'
  )
$$, array[0::bigint], 'membership cannot read another tenant usage summary');
reset role;
select loyalty_private.set_organization_entitlement(
  'c1000000-0000-4000-8000-000000000100', 'managed.billing', 'disabled', null,
  'canary', 'operator:m14', 'Disable usage dispatch for projection test',
  '2041-01-05 00:04:01+00', null);
set local role authenticated;
select set_config('request.jwt.claim.sub',
  'c1000000-0000-4000-8000-000000000001', true);
select results_eq($$
  select usage_summary ->> 'dispatchMode'
  from loyalty.get_my_managed_billing_usage_summary_v1(
    'c1000000-0000-4000-8000-000000000100',
    '2041-01-01 00:00:00+00', '2041-01-05 00:04:02+00'
  )
$$, array['shadow'::text],
  'disabled effective tenant entitlement returns usage to shadow mode');
reset role;
select loyalty_private.set_organization_entitlement(
  'c1000000-0000-4000-8000-000000000100', 'managed.billing', 'enabled', null,
  'canary', 'operator:m14', 'Restore usage dispatch for provider-mode test',
  '2041-01-05 00:04:03+00', null);
select loyalty_private.record_managed_billing_provider_configuration_v1(
  false, false, '2041-01-05 00:04:04+00', 'operator:m14',
  'Disable provider after usage projection test',
  'c1000000-0000-4000-8000-000000000504');
set local role authenticated;
select set_config('request.jwt.claim.sub',
  'c1000000-0000-4000-8000-000000000001', true);
select results_eq($$
  select usage_summary ->> 'dispatchMode'
  from loyalty.get_my_managed_billing_usage_summary_v1(
    'c1000000-0000-4000-8000-000000000100',
    '2041-01-01 00:00:00+00', '2041-01-05 00:04:05+00'
  )
$$, array['shadow'::text],
  'disabled effective provider configuration returns usage to shadow mode');
reset role;
select results_eq($$
  select count(*)::bigint
  from loyalty.get_my_managed_billing_usage_summary_v1(
    'c1000000-0000-4000-8000-000000000100',
    '2041-01-01 00:00:00+00', '2041-01-05 00:04:00+00'
  ) as summary
  where summary.usage_summary::text ~
    '(cus_|starfiniti_orders|source_subject|source_evidence|provider_identifier|email|price_)'
$$, array[0::bigint], 'public summary contains no provider source contact or price identity');
select throws_ok($$
  update loyalty_private.managed_billing_usage_facts set quantity = 9
  where meter_key = 'orders'
$$, '55000', 'immutable loyalty history cannot be changed',
  'usage facts and corrections cannot be rewritten');
select throws_ok($$
  delete from loyalty_private.managed_billing_usage_dispatch_attempts
$$, '55000', 'immutable loyalty history cannot be changed',
  'provider attempt evidence cannot be deleted');
select throws_ok($$
  delete from loyalty_private.managed_billing_usage_dispatches
$$, '55000', 'managed billing usage dispatch identity is immutable',
  'provider dispatch identity cannot be deleted');

insert into loyalty_private.commerce_delivery_inbox (
  receipt_id, organization_id, connection_id, source_delivery_id,
  envelope_version, source_event_id, event_type, source_object_id,
  occurred_at, delivered_at, key_version, nonce, body_sha256, raw_body,
  state, accepted_at, last_received_at
)
select 'c1000000-0000-4000-8000-000000000425', organization.id,
  connection.id, 'usage-delayed-delivery', '1', 'usage-event-delayed',
  'commerce.order.status_changed', 'usage-order-delayed',
  '2041-01-31 23:59:00+00', '2041-02-02 12:00:00+00', 'v1',
  'usage-nonce-delayed', repeat('b', 64), '{}'::jsonb, 'applied',
  '2041-02-02 12:00:00+00', '2041-02-02 12:00:00+00'
from loyalty.organizations as organization
join loyalty.commerce_connections as connection
  on connection.organization_id = organization.id
where organization.slug = 'billing-usage-one';
insert into loyalty_private.canonical_commerce_events (
  public_id, organization_id, connection_id, delivery_inbox_id,
  source_event_id, normalization_version, event_type, source_object_id,
  occurred_at, payload, effect_state, effect_processed_at, created_at
)
select 'c1000000-0000-4000-8000-000000000426', inbox.organization_id,
  inbox.connection_id, inbox.id, inbox.source_event_id, 'v1',
  inbox.event_type, inbox.source_object_id, inbox.occurred_at, '{}'::jsonb,
  'applied', '2041-02-02 12:00:00+00', '2041-02-02 12:00:00+00'
from loyalty_private.commerce_delivery_inbox as inbox
where inbox.source_delivery_id = 'usage-delayed-delivery';
select results_eq($$
  select meter_key, captured_count
  from loyalty_private.capture_managed_billing_usage_facts_v2(
    100, '2041-02-02 12:00:01+00'
  )
$$, $$ values ('orders'::text, 1::bigint) $$,
  'delayed order capture uses occurrence eligibility after ingestion');
select results_eq($$
  select occurred_at, usage_period_start
  from loyalty_private.managed_billing_usage_facts
  where source_evidence_public_id =
    'c1000000-0000-4000-8000-000000000426'
$$, $$ values (
  '2041-01-31 23:59:00+00'::timestamptz,
  '2041-01-01 00:00:00+00'::timestamptz
) $$, 'delayed ingestion remains in the January occurrence period');
select ok(
  pg_catalog.position(
    'notification_klaviyo_operations' in pg_catalog.pg_get_functiondef(
      'loyalty_private.capture_managed_billing_usage_facts_v2(integer,timestamptz)'::regprocedure
    )
  ) = 0,
  'Klaviyo event acceptance is not a delivered-message source'
);
select results_eq($$ select count(*)::bigint from loyalty.ledger_transactions $$,
  array[0::bigint], 'capture dispatch correction and summary create zero loyalty value effects');

select * from finish();
rollback;
