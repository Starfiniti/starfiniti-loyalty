begin;

create extension if not exists pgtap with schema extensions;

select plan(67);

grant loyalty_runtime, loyalty_worker to current_user;
grant usage on schema extensions to loyalty_runtime, loyalty_worker;
grant execute on all functions in schema extensions to loyalty_runtime, loyalty_worker;

-- 1-17: private shape, role boundary, and minimization.
select has_table(
  'loyalty_private', 'managed_billing_webhook_events',
  'verified webhook receipts are private immutable evidence'
);
select has_table(
  'loyalty_private', 'managed_billing_webhook_jobs',
  'billing normalization uses a private lease projection'
);
select has_table(
  'loyalty_private', 'managed_billing_webhook_attempts',
  'billing normalization attempts are private evidence'
);
select has_function(
  'loyalty_private', 'get_managed_billing_webhook_gate_v1',
  array['timestamp with time zone'],
  'runtime gate exists'
);
select has_function(
  'loyalty_private', 'accept_managed_billing_webhook_v1',
  array[
    'text', 'text', 'boolean', 'text', 'text', 'text', 'text',
    'timestamp with time zone', 'timestamp with time zone',
    'timestamp with time zone', 'timestamp with time zone', 'bytea'
  ],
  'verified minimized intake command exists'
);
select has_function(
  'loyalty_private', 'claim_managed_billing_webhooks_v1',
  array['text', 'integer', 'integer'],
  'isolated billing claim command exists'
);
select has_function(
  'loyalty_private', 'process_managed_billing_webhook_v1',
  array['uuid', 'uuid', 'text'],
  'leased normalization command exists'
);
select ok(
  (
    select count(*) = 3 and bool_and(relation.relrowsecurity)
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'loyalty_private'
      and relation.relname in (
        'managed_billing_webhook_events',
        'managed_billing_webhook_jobs',
        'managed_billing_webhook_attempts'
      )
  ),
  'all three private webhook tables enable RLS'
);
select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'loyalty_private.managed_billing_webhook_events'::regclass
      and tgname = 'managed_billing_webhook_events_immutable'
      and not tgisinternal
  ) and exists (
    select 1 from pg_trigger
    where tgrelid = 'loyalty_private.managed_billing_webhook_attempts'::regclass
      and tgname = 'managed_billing_webhook_attempts_immutable'
      and not tgisinternal
  ),
  'receipt and attempt evidence cannot be rewritten'
);
select ok(
  has_function_privilege(
    'loyalty_runtime',
    'loyalty_private.get_managed_billing_webhook_gate_v1(timestamptz)',
    'EXECUTE'
  ) and has_function_privilege(
    'loyalty_runtime',
    'loyalty_private.accept_managed_billing_webhook_v1(text,text,boolean,text,text,text,text,timestamptz,timestamptz,timestamptz,timestamptz,bytea)',
    'EXECUTE'
  ) and not has_function_privilege(
    'loyalty_runtime',
    'loyalty_private.claim_managed_billing_webhooks_v1(text,integer,integer)',
    'EXECUTE'
  ),
  'runtime can gate and accept but cannot claim work'
);
select ok(
  has_function_privilege(
    'loyalty_worker',
    'loyalty_private.claim_managed_billing_webhooks_v1(text,integer,integer)',
    'EXECUTE'
  ) and has_function_privilege(
    'loyalty_worker',
    'loyalty_private.process_managed_billing_webhook_v1(uuid,uuid,text)',
    'EXECUTE'
  ) and not has_function_privilege(
    'loyalty_worker',
    'loyalty_private.accept_managed_billing_webhook_v1(text,text,boolean,text,text,text,text,timestamptz,timestamptz,timestamptz,timestamptz,bytea)',
    'EXECUTE'
  ),
  'worker can claim and process but cannot accept internet input'
);
select ok(
  not has_function_privilege(
    'anon',
    'loyalty_private.get_managed_billing_webhook_gate_v1(timestamptz)',
    'EXECUTE'
  ) and not has_function_privilege(
    'authenticated',
    'loyalty_private.accept_managed_billing_webhook_v1(text,text,boolean,text,text,text,text,timestamptz,timestamptz,timestamptz,timestamptz,bytea)',
    'EXECUTE'
  ),
  'browser roles have no billing webhook command'
);
select ok(
  not has_table_privilege(
    'loyalty_runtime', 'loyalty_private.managed_billing_webhook_events', 'SELECT'
  ) and not has_table_privilege(
    'loyalty_worker', 'loyalty_private.managed_billing_webhook_jobs', 'UPDATE'
  ) and not has_table_privilege(
    'authenticated', 'loyalty_private.managed_billing_webhook_attempts', 'SELECT'
  ),
  'application roles cannot directly enumerate or mutate provider evidence'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'loyalty_private'
      and routine.proname in (
        'get_managed_billing_webhook_gate_v1',
        'accept_managed_billing_webhook_v1',
        'claim_managed_billing_webhooks_v1',
        'process_managed_billing_webhook_v1'
      )
      and routine.prosecdef
      and exists (
        select 1 from unnest(routine.proconfig) as setting
        where setting = 'search_path=""'
      )
  $$,
  array[4::bigint],
  'all webhook commands are security definer with empty search paths'
);
select results_eq(
  $$
    select count(*)::bigint
    from information_schema.columns
    where table_schema = 'loyalty_private'
      and table_name in (
        'managed_billing_webhook_events',
        'managed_billing_webhook_jobs',
        'managed_billing_webhook_attempts'
      )
      and column_name ~ '(raw_body|signature_header|email|address|card|payment_method|metadata|secret|payload|response_body)'
  $$,
  array[0::bigint],
  'storage has no raw body signature contact payment metadata secret or response field'
);
select results_eq(
  $$
    select count(*)::bigint
    from information_schema.parameters
    where specific_schema = 'loyalty_private'
      and specific_name like 'accept_managed_billing_webhook_v1%'
      and parameter_name ~ '(organization|tenant|actor|user|workspace|plan|entitlement)'
  $$,
  array[0::bigint],
  'internet intake accepts no tenant actor plan or entitlement authority'
);
select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'loyalty_private'
      and indexname = 'managed_billing_webhook_jobs_claim_idx'
  ) and exists (
    select 1 from pg_indexes
    where schemaname = 'loyalty_private'
      and indexname = 'managed_billing_webhook_events_tenant_time_idx'
  ),
  'claim and tenant-time access paths have reviewed indexes'
);

-- 18-21: self-hosted returns before provider evidence exists.
set local role loyalty_runtime;
select results_eq(
  $$
    select deployment_mode, enabled
    from loyalty_private.get_managed_billing_webhook_gate_v1()
  $$,
  $$ values ('self_hosted'::text, false) $$,
  'self-hosted gate is locally disabled'
);
select throws_ok(
  $$
    select * from loyalty_private.accept_managed_billing_webhook_v1(
      'evt_WebhookSelfHosted0001', 'customer.subscription.updated', false,
      'sub_WebhookSelfHosted0001', 'cus_WebhookSelfHosted0001',
      'sub_WebhookSelfHosted0001', 'active', statement_timestamp() - interval '30 seconds',
      statement_timestamp() + interval '1 day', null, statement_timestamp(),
      decode(repeat('ab', 32), 'hex')
    )
  $$,
  '42501', 'managed billing webhook unavailable',
  'self-hosted intake fails before account lookup'
);
reset role;
select results_eq(
  $$
    select
      (select count(*) from loyalty_private.managed_billing_webhook_events)::bigint,
      (select count(*) from loyalty_private.managed_billing_webhook_jobs)::bigint,
      (select count(*) from loyalty_private.managed_billing_webhook_attempts)::bigint
  $$,
  $$ values (0::bigint, 0::bigint, 0::bigint) $$,
  'self-hosted calls create no provider or job evidence'
);

do $$
begin
  perform loyalty_private.set_deployment_mode(
    'managed', 1, 'operator:m14-webhook',
    'Enable isolated managed webhook inbox tests',
    statement_timestamp() - interval '3 minutes'
  );
end;
$$;

insert into auth.users (id, email)
values ('c1000000-0000-4000-8000-000000000001', 'webhook-owner@example.test');
insert into loyalty.organizations (public_id, slug, name)
values
  ('c1000000-0000-4000-8000-000000000100', 'billing-webhook-one', 'Billing Webhook One'),
  ('c2000000-0000-4000-8000-000000000100', 'billing-webhook-two', 'Billing Webhook Two');
insert into loyalty.organization_memberships (organization_id, user_id, role)
select id, 'c1000000-0000-4000-8000-000000000001', 'owner'
from loyalty.organizations where slug = 'billing-webhook-one';

create temporary table billing_webhook_test_refs (
  event_at timestamptz not null,
  signature_at timestamptz not null,
  period_end timestamptz not null,
  first_account_id uuid,
  second_account_id uuid
) on commit drop;
insert into billing_webhook_test_refs (
  event_at, signature_at, period_end, first_account_id, second_account_id
)
select
  statement_timestamp() - interval '30 seconds',
  statement_timestamp(),
  statement_timestamp() + interval '1 day',
  loyalty_private.record_managed_billing_account_v1(
    'c1000000-0000-4000-8000-000000000100',
    'cus_WebhookCustomer0001', false, 'operator:m14-webhook',
    'Create enabled webhook billing account',
    statement_timestamp() - interval '2 minutes',
    'c1000000-0000-4000-8000-000000000501'
  ),
  loyalty_private.record_managed_billing_account_v1(
    'c2000000-0000-4000-8000-000000000100',
    'cus_WebhookCustomer0002', false, 'operator:m14-webhook',
    'Create disabled webhook billing account',
    statement_timestamp() - interval '2 minutes',
    'c2000000-0000-4000-8000-000000000501'
  );
insert into loyalty.organization_entitlements (
  organization_id, catalogue_version, capability_key, state, source,
  actor_reference, reason, effective_from
)
select id, 1, 'managed.billing',
  case slug when 'billing-webhook-one' then 'enabled' else 'disabled' end,
  'canary', 'operator:m14-webhook',
  'Set isolated webhook billing entitlement',
  statement_timestamp() - interval '2 minutes'
from loyalty.organizations
where slug in ('billing-webhook-one', 'billing-webhook-two');

select results_eq(
  $$
    select deployment_mode, enabled
    from loyalty_private.get_managed_billing_webhook_gate_v1()
  $$,
  $$ values ('managed'::text, true) $$,
  'managed gate opens only after one account is explicitly entitled'
);

create temporary table billing_webhook_receipts (
  label text primary key,
  receipt_public_id uuid not null,
  outcome text not null
) on commit drop;
create temporary table billing_webhook_claims (
  label text,
  receipt_public_id uuid not null,
  lease_token uuid not null,
  event_type text not null,
  attempt_number integer not null
) on commit drop;
create temporary table billing_webhook_results (
  label text primary key,
  outcome text not null,
  state_revision_public_id uuid
) on commit drop;
grant all on billing_webhook_receipts to loyalty_runtime;
grant all on billing_webhook_claims to loyalty_worker;
grant all on billing_webhook_results to loyalty_worker;

-- 22-37: exact intake, tenant derivation, and immutable minimization.
set local role loyalty_runtime;
select throws_ok(
  $$
    select * from loyalty_private.accept_managed_billing_webhook_v1(
      'evt_WebhookDisabled0001', 'customer.subscription.updated', false,
      'sub_WebhookDisabled0001', 'cus_WebhookCustomer0002',
      'sub_WebhookDisabled0001', 'active',
      (select event_at from billing_webhook_test_refs),
      (select period_end from billing_webhook_test_refs), null,
      (select signature_at from billing_webhook_test_refs),
      decode(repeat('12', 32), 'hex')
    )
  $$,
  '42501', 'managed billing webhook unavailable',
  'disabled tenant cannot enter the managed inbox'
);
select throws_ok(
  $$
    select * from loyalty_private.accept_managed_billing_webhook_v1(
      'bad-event', 'customer.subscription.updated', false,
      'sub_WebhookSubscription0001', 'cus_WebhookCustomer0001',
      'sub_WebhookSubscription0001', 'active',
      (select event_at from billing_webhook_test_refs),
      (select period_end from billing_webhook_test_refs), null,
      (select signature_at from billing_webhook_test_refs),
      decode(repeat('12', 32), 'hex')
    )
  $$,
  '22023', 'invalid managed billing webhook request',
  'invalid provider identity fails before storage'
);
insert into billing_webhook_receipts
select 'subscription', receipt_public_id, outcome
from loyalty_private.accept_managed_billing_webhook_v1(
  'evt_WebhookSubscription0001', 'customer.subscription.updated', false,
  'sub_WebhookSubscription0001', 'cus_WebhookCustomer0001',
  'sub_WebhookSubscription0001', 'active',
  (select event_at from billing_webhook_test_refs),
  (select period_end from billing_webhook_test_refs), null,
  (select signature_at from billing_webhook_test_refs),
  decode(repeat('12', 32), 'hex')
);
select results_eq(
  $$ select label, outcome from billing_webhook_receipts where label = 'subscription' $$,
  $$ values ('subscription'::text, 'accepted'::text) $$,
  'valid signed projection is accepted'
);
reset role;
select results_eq(
  $$
    select
      (select count(*) from loyalty_private.managed_billing_webhook_events)::bigint,
      (select count(*) from loyalty_private.managed_billing_webhook_jobs)::bigint
  $$,
  $$ values (1::bigint, 1::bigint) $$,
  'one accepted event creates one immutable receipt and one job'
);
select results_eq(
  $$
    select
      provider, live_mode, event_type,
      octet_length(body_sha256)::integer,
      octet_length(request_fingerprint)::integer,
      provider_subscription_status
    from loyalty_private.managed_billing_webhook_events
  $$,
  $$
    values (
      'stripe'::text, false, 'customer.subscription.updated'::text,
      32::integer, 32::integer, 'active'::text
    )
  $$,
  'stored evidence is strict minimized and digest-bound'
);
set local role loyalty_runtime;
select results_eq(
  $$
    select receipt_public_id, outcome
    from loyalty_private.accept_managed_billing_webhook_v1(
      'evt_WebhookSubscription0001', 'customer.subscription.updated', false,
      'sub_WebhookSubscription0001', 'cus_WebhookCustomer0001',
      'sub_WebhookSubscription0001', 'active',
      (select event_at from billing_webhook_test_refs),
      (select period_end from billing_webhook_test_refs), null,
      (select signature_at from billing_webhook_test_refs),
      decode(repeat('12', 32), 'hex')
    )
  $$,
  $$
    select receipt_public_id, 'duplicate'::text
    from billing_webhook_receipts where label = 'subscription'
  $$,
  'exact provider retry returns the original receipt'
);
reset role;
select results_eq(
  $$
    select
      (select count(*) from loyalty_private.managed_billing_webhook_events)::bigint,
      (select count(*) from loyalty_private.managed_billing_webhook_jobs)::bigint
  $$,
  $$ values (1::bigint, 1::bigint) $$,
  'exact retry creates no duplicate receipt or job'
);
set local role loyalty_runtime;
select throws_ok(
  $$
    select * from loyalty_private.accept_managed_billing_webhook_v1(
      'evt_WebhookSubscription0001', 'customer.subscription.updated', false,
      'sub_WebhookSubscription0001', 'cus_WebhookCustomer0001',
      'sub_WebhookSubscription0001', 'active',
      (select event_at from billing_webhook_test_refs),
      (select period_end from billing_webhook_test_refs), null,
      (select signature_at from billing_webhook_test_refs),
      decode(repeat('34', 32), 'hex')
    )
  $$,
  '23505', 'managed billing webhook event conflict',
  'changed raw-body digest under one Stripe event ID fails closed'
);
select throws_ok(
  $$
    select * from loyalty_private.accept_managed_billing_webhook_v1(
      'evt_WebhookSubscription0001', 'customer.subscription.updated', false,
      'sub_WebhookSubscription0001', 'cus_WebhookCustomer0001',
      'sub_WebhookSubscription0001', 'past_due',
      (select event_at from billing_webhook_test_refs),
      (select period_end from billing_webhook_test_refs), null,
      (select signature_at from billing_webhook_test_refs),
      decode(repeat('12', 32), 'hex')
    )
  $$,
  '23505', 'managed billing webhook event conflict',
  'changed normalized state under one Stripe event ID fails closed'
);
reset role;
select throws_ok(
  $$ update loyalty_private.managed_billing_webhook_events set event_type = 'invoice.paid' $$,
  '55000', 'immutable evidence cannot be changed',
  'accepted receipt evidence is immutable'
);
set local role loyalty_runtime;
insert into billing_webhook_receipts
select 'invoice', receipt_public_id, outcome
from loyalty_private.accept_managed_billing_webhook_v1(
  'evt_WebhookInvoice0001', 'invoice.payment_failed', false,
  'in_WebhookInvoice0001', 'cus_WebhookCustomer0001',
  'sub_WebhookSubscription0001', null,
  (select event_at + interval '1 second' from billing_webhook_test_refs),
  null, null, (select signature_at from billing_webhook_test_refs),
  decode(repeat('56', 32), 'hex')
);
select results_eq(
  $$ select label, outcome from billing_webhook_receipts where label = 'invoice' $$,
  $$ values ('invoice'::text, 'accepted'::text) $$,
  'invoice event is retained as an observation'
);
reset role;
select results_eq(
  $$
    select provider_object_id, provider_subscription_id,
      provider_subscription_status, current_period_end, trial_end
    from loyalty_private.managed_billing_webhook_events
    where event_type = 'invoice.payment_failed'
  $$,
  $$
    values (
      'in_WebhookInvoice0001'::text, 'sub_WebhookSubscription0001'::text,
      null::text, null::timestamptz, null::timestamptz
    )
  $$,
  'invoice observation carries no subscription authority'
);
set local role loyalty_runtime;
select throws_ok(
  $$
    select * from loyalty_private.accept_managed_billing_webhook_v1(
      'evt_WebhookInvoiceInvalid', 'invoice.paid', false,
      'in_WebhookInvoiceInvalid', 'cus_WebhookCustomer0001',
      'sub_WebhookSubscription0001', 'active',
      (select event_at from billing_webhook_test_refs), null, null,
      (select signature_at from billing_webhook_test_refs),
      decode(repeat('78', 32), 'hex')
    )
  $$,
  '22023', 'invalid managed billing invoice event',
  'invoice cannot assert subscription lifecycle state'
);
reset role;
select results_eq(
  $$
    select count(*)::bigint from loyalty.ledger_transactions
    where organization_id = (
      select id from loyalty.organizations where slug = 'billing-webhook-one'
    )
  $$,
  array[0::bigint],
  'billing intake cannot create loyalty value'
);
set local role loyalty_runtime;
select throws_ok(
  $$ select * from loyalty_private.claim_managed_billing_webhooks_v1('runtime-worker', 10, 60) $$,
  '42501', null,
  'runtime role cannot claim billing work'
);
reset role;

-- 38-51: leases, asynchronous state, and public minimization.
set local role loyalty_worker;
insert into billing_webhook_claims
select
  case event_type when 'invoice.payment_failed' then 'invoice' else 'subscription' end,
  receipt_public_id, lease_token, event_type, attempt_number
from loyalty_private.claim_managed_billing_webhooks_v1('billing-worker-test', 10, 60);
select results_eq(
  $$ select count(*)::bigint from billing_webhook_claims $$,
  array[2::bigint],
  'worker claims the two enabled pending receipts'
);
select results_eq(
  $$
    select label, attempt_number
    from billing_webhook_claims order by label
  $$,
  $$ values ('invoice'::text, 1::integer), ('subscription'::text, 1::integer) $$,
  'claims expose only receipt lease type and bounded attempt'
);
reset role;
select results_eq(
  $$
    select count(*)::bigint
    from loyalty_private.managed_billing_webhook_jobs
    where state = 'processing' and locked_by = 'billing-worker-test'
      and lock_token is not null and lease_expires_at > locked_at
  $$,
  array[2::bigint],
  'claimed jobs have complete bounded lease evidence'
);
set local role loyalty_worker;
select results_eq(
  $$
    select count(*)::bigint
    from loyalty_private.claim_managed_billing_webhooks_v1('billing-worker-peer', 10, 60)
  $$,
  array[0::bigint],
  'a peer cannot claim already leased receipts'
);
select throws_ok(
  $$
    select * from loyalty_private.process_managed_billing_webhook_v1(
      (select receipt_public_id from billing_webhook_claims where label = 'subscription'),
      gen_random_uuid(), 'billing-worker-test'
    )
  $$,
  '42501', 'billing webhook lease not owned',
  'mismatched lease token fails closed'
);
insert into billing_webhook_results
select 'subscription', outcome, state_revision_public_id
from loyalty_private.process_managed_billing_webhook_v1(
  (select receipt_public_id from billing_webhook_claims where label = 'subscription'),
  (select lease_token from billing_webhook_claims where label = 'subscription'),
  'billing-worker-test'
);
select results_eq(
  $$
    select outcome, state_revision_public_id is not null
    from billing_webhook_results where label = 'subscription'
  $$,
  $$ values ('state_recorded'::text, true) $$,
  'subscription event records one immutable normalized state'
);
insert into billing_webhook_results
select 'invoice', outcome, state_revision_public_id
from loyalty_private.process_managed_billing_webhook_v1(
  (select receipt_public_id from billing_webhook_claims where label = 'invoice'),
  (select lease_token from billing_webhook_claims where label = 'invoice'),
  'billing-worker-test'
);
select results_eq(
  $$
    select outcome, state_revision_public_id
    from billing_webhook_results where label = 'invoice'
  $$,
  $$ values ('invoice_observed'::text, null::uuid) $$,
  'invoice processing records observation without lifecycle effect'
);
reset role;
select results_eq(
  $$
    select count(*)::bigint
    from loyalty_private.managed_billing_webhook_jobs
    where state = 'completed' and completed_at is not null
  $$,
  array[2::bigint],
  'both processed jobs complete exactly once'
);
select results_eq(
  $$
    select outcome, count(*)::bigint
    from loyalty_private.managed_billing_webhook_attempts
    group by outcome order by outcome
  $$,
  $$
    values ('invoice_observed'::text, 1::bigint), ('state_recorded'::text, 1::bigint)
  $$,
  'attempt history distinguishes observation from state effect'
);
select results_eq(
  $$
    select provider_state, provider_event_id
    from loyalty_private.managed_billing_state_revisions
  $$,
  $$ values ('active'::text, 'evt_WebhookSubscription0001'::text) $$,
  'verified subscription maps to active normalized state'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_transactions $$,
  array[0::bigint],
  'normalization creates no loyalty ledger value'
);
set local role authenticated;
set local request.jwt.claim.sub = 'c1000000-0000-4000-8000-000000000001';
select results_eq(
  $$
    select
      billing_summary->>'commercialState',
      (billing_summary->>'subscriptionPresent')::boolean,
      (billing_summary->>'growthConfigurationAllowed')::boolean
    from loyalty.get_my_billing_summary_v1(
      'c1000000-0000-4000-8000-000000000100', statement_timestamp()
    )
  $$,
  $$ values ('active'::text, true, true) $$,
  'merchant projection exposes only normalized commercial state'
);
reset role;
select throws_ok(
  $$ update loyalty_private.managed_billing_webhook_attempts set outcome = 'held' $$,
  '55000', 'immutable evidence cannot be changed',
  'attempt history cannot be rewritten'
);
set local role loyalty_worker;
select throws_ok(
  $$
    select * from loyalty_private.process_managed_billing_webhook_v1(
      (select receipt_public_id from billing_webhook_claims where label = 'subscription'),
      (select lease_token from billing_webhook_claims where label = 'subscription'),
      'billing-worker-test'
    )
  $$,
  '42501', 'billing webhook lease not owned',
  'completed receipt cannot be processed twice'
);
reset role;

-- 52-58: entitlement revocation between claim and effect is held closed.
set local role loyalty_runtime;
insert into billing_webhook_receipts
select 'held', receipt_public_id, outcome
from loyalty_private.accept_managed_billing_webhook_v1(
  'evt_WebhookHeld0001', 'customer.subscription.updated', false,
  'sub_WebhookSubscription0001', 'cus_WebhookCustomer0001',
  'sub_WebhookSubscription0001', 'past_due',
  (select event_at + interval '2 seconds' from billing_webhook_test_refs),
  (select period_end from billing_webhook_test_refs), null,
  (select signature_at from billing_webhook_test_refs),
  decode(repeat('9a', 32), 'hex')
);
select results_eq(
  $$ select outcome from billing_webhook_receipts where label = 'held' $$,
  array['accepted'::text],
  'third event enters while entitlement is enabled'
);
reset role;
set local role loyalty_worker;
insert into billing_webhook_claims
select 'held', receipt_public_id, lease_token, event_type, attempt_number
from loyalty_private.claim_managed_billing_webhooks_v1('billing-worker-hold', 1, 60);
select results_eq(
  $$ select attempt_number from billing_webhook_claims where label = 'held' $$,
  array[1::integer],
  'third event receives its first isolated lease'
);
reset role;
insert into loyalty.organization_entitlements (
  organization_id, catalogue_version, capability_key, state, source,
  actor_reference, reason, effective_from
)
select id, 1, 'managed.billing', 'disabled', 'manual_override',
  'operator:m14-webhook', 'Disable billing before normalized effect',
  statement_timestamp()
from loyalty.organizations where slug = 'billing-webhook-one';
set local role loyalty_worker;
insert into billing_webhook_results
select 'held', outcome, state_revision_public_id
from loyalty_private.process_managed_billing_webhook_v1(
  (select receipt_public_id from billing_webhook_claims where label = 'held'),
  (select lease_token from billing_webhook_claims where label = 'held'),
  'billing-worker-hold'
);
select results_eq(
  $$ select outcome, state_revision_public_id from billing_webhook_results where label = 'held' $$,
  $$ values ('held'::text, null::uuid) $$,
  'revocation after claim prevents lifecycle authority'
);
reset role;
select results_eq(
  $$
    select state, last_error_code
    from loyalty_private.managed_billing_webhook_jobs as job
    join loyalty_private.managed_billing_webhook_events as event
      on event.id = job.webhook_event_id
    where event.provider_event_id = 'evt_WebhookHeld0001'
  $$,
  $$ values ('held'::text, 'billing_webhook_disabled'::text) $$,
  'revoked work is held with stable minimized cause'
);
select results_eq(
  $$ select count(*)::bigint from loyalty_private.managed_billing_state_revisions $$,
  array[1::bigint],
  'held event creates no normalized state revision'
);
set local role loyalty_worker;
select results_eq(
  $$
    select count(*)::bigint
    from loyalty_private.claim_managed_billing_webhooks_v1('billing-worker-disabled', 10, 60)
  $$,
  array[0::bigint],
  'disabled entitlement prevents held work from being reclaimed'
);
reset role;
select results_eq(
  $$
    select deployment_mode, enabled
    from loyalty_private.get_managed_billing_webhook_gate_v1()
  $$,
  $$ values ('managed'::text, false) $$,
  'public intake gate closes after the final enabled account is disabled'
);

-- 59-67: expired leases retry exactly once and remain value-neutral.
insert into loyalty.organization_entitlements (
  organization_id, catalogue_version, capability_key, state, source,
  actor_reference, reason, effective_from
)
select id, 1, 'managed.billing', 'enabled', 'canary',
  'operator:m14-webhook', 'Re-enable isolated lease expiry test',
  statement_timestamp() + interval '1 millisecond'
from loyalty.organizations where slug = 'billing-webhook-one';
do $$
begin
  perform pg_catalog.pg_sleep(0.01);
end;
$$;
set local role loyalty_runtime;
insert into billing_webhook_receipts
select 'retry', receipt_public_id, outcome
from loyalty_private.accept_managed_billing_webhook_v1(
  'evt_WebhookRetry0001', 'customer.subscription.updated', false,
  'sub_WebhookSubscription0001', 'cus_WebhookCustomer0001',
  'sub_WebhookSubscription0001', 'active',
  (select event_at + interval '3 seconds' from billing_webhook_test_refs),
  (select period_end from billing_webhook_test_refs), null,
  statement_timestamp(), decode(repeat('bc', 32), 'hex')
);
select results_eq(
  $$ select outcome from billing_webhook_receipts where label = 'retry' $$,
  array['accepted'::text],
  'retry fixture enters after explicit re-enable'
);
reset role;
set local role loyalty_worker;
insert into billing_webhook_claims
select 'retry-first', receipt_public_id, lease_token, event_type, attempt_number
from loyalty_private.claim_managed_billing_webhooks_v1('billing-worker-expiry', 1, 60);
select results_eq(
  $$ select attempt_number from billing_webhook_claims where label = 'retry-first' $$,
  array[1::integer],
  'retry fixture receives its first lease'
);
reset role;
update loyalty_private.managed_billing_webhook_jobs as job
set lease_expires_at = statement_timestamp() - interval '1 second'
from loyalty_private.managed_billing_webhook_events as event
where event.id = job.webhook_event_id
  and event.provider_event_id = 'evt_WebhookRetry0001';
set local role loyalty_worker;
insert into billing_webhook_claims
select 'retry-second', receipt_public_id, lease_token, event_type, attempt_number
from loyalty_private.claim_managed_billing_webhooks_v1('billing-worker-expiry-2', 1, 60);
select results_eq(
  $$ select attempt_number from billing_webhook_claims where label = 'retry-second' $$,
  array[2::integer],
  'expired lease is atomically reclaimed as attempt two'
);
reset role;
select results_eq(
  $$
    select outcome, attempt_number, error_code
    from loyalty_private.managed_billing_webhook_attempts as attempt
    join loyalty_private.managed_billing_webhook_jobs as job
      on job.id = attempt.webhook_job_id
    join loyalty_private.managed_billing_webhook_events as event
      on event.id = job.webhook_event_id
    where event.provider_event_id = 'evt_WebhookRetry0001'
  $$,
  $$ values ('lease_expired'::text, 1::integer, 'billing_webhook_lease_expired'::text) $$,
  'lease expiry appends one stable attempt outcome'
);
set local role loyalty_worker;
insert into billing_webhook_results
select 'retry', outcome, state_revision_public_id
from loyalty_private.process_managed_billing_webhook_v1(
  (select receipt_public_id from billing_webhook_claims where label = 'retry-second'),
  (select lease_token from billing_webhook_claims where label = 'retry-second'),
  'billing-worker-expiry-2'
);
select results_eq(
  $$ select outcome, state_revision_public_id is not null from billing_webhook_results where label = 'retry' $$,
  $$ values ('state_recorded'::text, true) $$,
  'reclaimed event records one normalized effect'
);
reset role;
select results_eq(
  $$
    select job.state, job.attempt_count,
      count(attempt.id)::bigint
    from loyalty_private.managed_billing_webhook_jobs as job
    join loyalty_private.managed_billing_webhook_events as event
      on event.id = job.webhook_event_id
    join loyalty_private.managed_billing_webhook_attempts as attempt
      on attempt.webhook_job_id = job.id
    where event.provider_event_id = 'evt_WebhookRetry0001'
    group by job.state, job.attempt_count
  $$,
  $$ values ('completed'::text, 2::integer, 2::bigint) $$,
  'reclaimed job closes with one expiry and one state outcome'
);
select results_eq(
  $$
    select count(*)::bigint
    from loyalty_private.managed_billing_state_revisions
    where provider_event_id = 'evt_WebhookRetry0001'
  $$,
  array[1::bigint],
  'retry creates one provider-event state revision'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_transactions $$,
  array[0::bigint],
  'lease retry remains loyalty-value neutral'
);
set local role loyalty_worker;
select throws_ok(
  $$ update loyalty_private.managed_billing_webhook_jobs set state = 'pending' $$,
  '42501', null,
  'worker cannot bypass lease functions with direct job mutation'
);
reset role;
select results_eq(
  $$
    select count(*)::bigint
    from loyalty_private.managed_billing_webhook_events
    where provider_event_id in (
      'evt_WebhookSubscription0001', 'evt_WebhookInvoice0001',
      'evt_WebhookHeld0001', 'evt_WebhookRetry0001'
    )
  $$,
  array[4::bigint],
  'all accepted provider events remain independently reconstructable'
);

select * from finish();
rollback;
