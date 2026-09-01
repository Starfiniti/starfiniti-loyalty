begin;

create extension if not exists pgtap with schema extensions;

select plan(63);

-- 1-18: private shape, least privilege, compatibility, and zero-value scope.
select has_table(
  'loyalty_private', 'managed_billing_delinquency_policy_versions',
  'private append-only delinquency policies exist'
);
select has_table(
  'loyalty_private', 'managed_billing_manual_contract_versions',
  'private append-only manual contract decisions exist'
);
select has_function(
  'loyalty_private', 'record_managed_billing_delinquency_policy_v1',
  array['integer','text','text','text','timestamp with time zone','timestamp with time zone','uuid'],
  'operator-only delinquency policy command exists'
);
select has_function(
  'loyalty_private', 'record_managed_billing_manual_contract_v1',
  array['uuid','text','text','text','text','timestamp with time zone','timestamp with time zone','uuid'],
  'operator-only manual contract command exists'
);
select has_function(
  'loyalty_private', 'resolve_managed_billing_commercial_policy_v1',
  array['bigint','timestamp with time zone'],
  'deterministic private commercial resolver exists'
);
select has_function(
  'loyalty_private', 'authorize_managed_growth_configuration_v1',
  array['bigint','text','text','timestamp with time zone'],
  'separate growth configuration authorization exists'
);
select has_function(
  'loyalty', 'get_my_billing_summary_v2',
  array['uuid','timestamp with time zone'],
  'minimized tenant BillingSummaryV2 projection exists'
);
select ok((
  select count(*) = 2 and bool_and(relation.relrowsecurity)
  from pg_class as relation
  join pg_namespace as namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'loyalty_private'
    and relation.relname in (
      'managed_billing_delinquency_policy_versions',
      'managed_billing_manual_contract_versions'
    )
), 'both commercial policy tables enable RLS');
select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'loyalty_private.managed_billing_delinquency_policy_versions'::regclass
      and tgname = 'managed_billing_delinquency_policy_versions_immutable'
      and not tgisinternal
  ) and exists (
    select 1 from pg_trigger
    where tgrelid = 'loyalty_private.managed_billing_manual_contract_versions'::regclass
      and tgname = 'managed_billing_manual_contract_versions_immutable'
      and not tgisinternal
  ),
  'policy and contract history have immutable triggers'
);
select ok(
  has_function_privilege(
    'authenticated', 'loyalty.get_my_billing_summary_v2(uuid,timestamptz)',
    'EXECUTE'
  ) and not has_function_privilege(
    'anon', 'loyalty.get_my_billing_summary_v2(uuid,timestamptz)', 'EXECUTE'
  ),
  'only authenticated sessions can request the minimized V2 projection'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'loyalty_private.record_managed_billing_delinquency_policy_v1(integer,text,text,text,timestamptz,timestamptz,uuid)',
    'EXECUTE'
  ) and not has_function_privilege(
    'loyalty_runtime',
    'loyalty_private.record_managed_billing_manual_contract_v1(uuid,text,text,text,text,timestamptz,timestamptz,uuid)',
    'EXECUTE'
  ) and not has_function_privilege(
    'loyalty_worker',
    'loyalty_private.authorize_managed_growth_configuration_v1(bigint,text,text,timestamptz)',
    'EXECUTE'
  ),
  'browser runtime and general workers cannot configure or directly query commercial policy'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'loyalty_private.managed_billing_delinquency_policy_versions', 'SELECT'
  ) and not has_table_privilege(
    'loyalty_runtime',
    'loyalty_private.managed_billing_manual_contract_versions', 'SELECT'
  ) and not has_table_privilege(
    'loyalty_worker',
    'loyalty_private.managed_billing_manual_contract_versions', 'UPDATE'
  ),
  'application roles cannot enumerate or mutate private commercial evidence'
);
select results_eq($$
  select count(*)::bigint
  from pg_proc as routine
  join pg_namespace as namespace on namespace.oid = routine.pronamespace
  where namespace.nspname in ('loyalty', 'loyalty_private')
    and routine.proname in (
      'record_managed_billing_delinquency_policy_v1',
      'record_managed_billing_manual_contract_v1',
      'resolve_managed_billing_commercial_policy_v1',
      'authorize_managed_growth_configuration_v1',
      'get_my_billing_summary_v2'
    )
    and routine.prosecdef
    and exists (
      select 1 from unnest(routine.proconfig) as setting
      where setting = 'search_path=""'
    )
$$, array[5::bigint], 'all five new boundaries are security definer with an empty search path');
select results_eq($$
  select count(*)::bigint
  from information_schema.columns
  where table_schema = 'loyalty_private'
    and table_name in (
      'managed_billing_delinquency_policy_versions',
      'managed_billing_manual_contract_versions'
    )
    and column_name ~ '(email|domain|card|payment_method|price|api_key|secret|raw_body|provider_customer|provider_subscription)'
$$, array[0::bigint], 'commercial policy storage excludes contact payment price secret body and provider identifiers');
select results_eq($$
  select count(*)::bigint
  from information_schema.parameters
  where specific_schema = 'loyalty'
    and specific_name like 'get_my_billing_summary_v2%'
    and parameter_mode = 'IN'
    and parameter_name ~ '(actor|approver|reason|provider|customer|subscription|email|domain|claims)'
$$, array[0::bigint], 'public V2 read accepts no actor approver provider contact or claim authority');
select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'loyalty_private'
      and indexname = 'managed_billing_delinquency_policy_effective_idx'
  ) and exists (
    select 1 from pg_indexes
    where schemaname = 'loyalty_private'
      and indexname = 'managed_billing_manual_contract_effective_idx'
  ),
  'policy and tenant contract effective-time lookups have reviewed indexes'
);
select results_eq($$
  select
    (select count(*) from loyalty_private.managed_billing_delinquency_policy_versions),
    (select count(*) from loyalty_private.managed_billing_manual_contract_versions)
$$, $$ values (0::bigint, 0::bigint) $$,
  'source control seeds no production policy or manual contract'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_transactions $$,
  array[0::bigint],
  'commercial policy schema creates no loyalty ledger effect'
);

insert into auth.users (id, email)
values
  ('c1000000-0000-4000-8000-000000000001', 'policy-owner@example.test'),
  ('c2000000-0000-4000-8000-000000000001', 'policy-other@example.test'),
  ('c3000000-0000-4000-8000-000000000001', 'policy-revoked@example.test');

insert into loyalty.organizations (public_id, slug, name)
values
  ('c1000000-0000-4000-8000-000000000100', 'policy-one', 'Policy One'),
  ('c2000000-0000-4000-8000-000000000100', 'policy-two', 'Policy Two');

insert into loyalty.organization_memberships (
  organization_id, user_id, role, revoked_at
)
values
  ((select id from loyalty.organizations where slug = 'policy-one'),
   'c1000000-0000-4000-8000-000000000001', 'owner', null),
  ((select id from loyalty.organizations where slug = 'policy-two'),
   'c2000000-0000-4000-8000-000000000001', 'owner', null),
  ((select id from loyalty.organizations where slug = 'policy-one'),
   'c3000000-0000-4000-8000-000000000001', 'admin', now());

-- 19-24: self-hosted exits before all provider and policy evidence.
set local role authenticated;
set local request.jwt.claim.sub = 'c1000000-0000-4000-8000-000000000001';
select results_eq($$
  select
    billing_summary->>'schemaVersion',
    billing_summary->>'deploymentMode',
    billing_summary->>'commercialState',
    billing_summary->>'stateSource',
    billing_summary->>'restrictionReason',
    (billing_summary->>'growthConfigurationAllowed')::boolean
  from loyalty.get_my_billing_summary_v2(
    'c1000000-0000-4000-8000-000000000100',
    '2042-01-01 00:00:00+00'
  )
$$, $$ values ('2'::text, 'self_hosted'::text, 'self_hosted'::text,
  'self_hosted'::text, 'none'::text, true) $$,
  'self-hosted V2 state is local unrestricted and provider-free'
);
select results_eq($$
  select count(*)::bigint
  from loyalty.get_my_billing_summary_v2(
    'c1000000-0000-4000-8000-000000000100',
    '2042-01-01 00:00:00+00'
  )
  where (billing_summary#>>'{protectedAccess,balanceRead}')::boolean
    and (billing_summary#>>'{protectedAccess,refunds}')::boolean
    and (billing_summary#>>'{protectedAccess,reconciliation}')::boolean
    and (billing_summary#>>'{protectedAccess,checkoutIndependence}')::boolean
    and (billing_summary#>>'{protectedAccess,exports}')::boolean
    and (billing_summary#>>'{protectedAccess,promisedRewardRedemption}')::boolean
$$, array[1::bigint], 'all protected paths remain true in self-hosted V2');
reset role;
select results_eq($$
  select provider_linked, subscription_present, state_source
  from loyalty_private.resolve_managed_billing_commercial_policy_v1(
    (select id from loyalty.organizations where slug = 'policy-one'),
    '2042-01-01 00:00:00+00'
  )
$$, $$ values (false, false, 'self_hosted'::text) $$,
  'private self-hosted resolution returns before provider evidence'
);
set local role authenticated;
set local request.jwt.claim.sub = 'c1000000-0000-4000-8000-000000000001';
select results_eq($$
  select count(*)::bigint
  from loyalty.get_my_billing_summary_v2(
    'c2000000-0000-4000-8000-000000000100',
    '2042-01-01 00:00:00+00'
  )
$$, array[0::bigint], 'live membership cannot read another tenant billing summary');
select results_eq($$
  select count(*)::bigint
  from loyalty.get_my_billing_summary_v1(
    'c1000000-0000-4000-8000-000000000100',
    '2042-01-01 00:00:00+00'
  ) cross join lateral jsonb_object_keys(billing_summary)
$$, array[15::bigint], 'BillingSummaryV1 retains its exact fifteen-key shape');
select results_eq($$
  select count(*)::bigint
  from loyalty.get_my_billing_summary_v2(
    'c1000000-0000-4000-8000-000000000100',
    '2042-01-01 00:00:00+00'
  ) cross join lateral jsonb_object_keys(billing_summary)
$$, array[18::bigint], 'BillingSummaryV2 adds exactly three minimized keys');
reset role;

do $$
begin
  perform loyalty_private.set_deployment_mode(
    'managed', 1, 'operator:m14', 'Begin isolated commercial policy test',
    '2042-01-01 00:00:00+00'
  );
  perform loyalty_private.set_organization_entitlement(
    'c1000000-0000-4000-8000-000000000100', 'programme.v2',
    'enabled', null, 'manual_override', 'operator:m14',
    'Enable programme authoring for commercial policy test',
    '2042-01-01 00:00:00+00', null
  );
  perform loyalty_private.set_organization_entitlement(
    'c2000000-0000-4000-8000-000000000100', 'programme.v2',
    'enabled', null, 'manual_override', 'operator:m14',
    'Enable second programme for commercial policy test',
    '2042-01-01 00:00:00+00', null
  );
end;
$$;

-- 25-26: managed mode begins fail-closed but V1 remains compatible.
set local role authenticated;
set local request.jwt.claim.sub = 'c1000000-0000-4000-8000-000000000001';
select results_eq($$
  select
    billing_summary->>'commercialState',
    billing_summary->>'stateSource',
    billing_summary->>'restrictionReason',
    (billing_summary->>'growthConfigurationAllowed')::boolean,
    billing_summary->>'restriction'
  from loyalty.get_my_billing_summary_v2(
    'c1000000-0000-4000-8000-000000000100',
    '2042-01-01 00:00:01+00'
  )
$$, $$ values ('unconfigured'::text, 'unconfigured'::text,
  'billing_unconfigured'::text, false, 'new_growth_only'::text) $$,
  'managed mode is locally restricted until evidence exists'
);
select results_eq($$
  select
    billing_summary->>'schemaVersion',
    billing_summary->>'commercialState',
    (billing_summary ? 'stateSource'),
    (billing_summary ? 'restrictionReason'),
    (billing_summary ? 'contractEndsAt')
  from loyalty.get_my_billing_summary_v1(
    'c1000000-0000-4000-8000-000000000100',
    '2042-01-01 00:00:01+00'
  )
$$, $$ values ('1'::text, 'unconfigured'::text, false, false, false) $$,
  'V1 preserves its exact schema while using the deterministic resolver'
);
reset role;

create temporary table commercial_policy_refs (
  first_policy_id uuid,
  first_contract_id uuid,
  first_account_id uuid,
  second_account_id uuid
) on commit drop;

-- 27-34: delinquency policy is approved append-only and retry exact.
insert into commercial_policy_refs (first_policy_id)
select loyalty_private.record_managed_billing_delinquency_policy_v1(
  7, 'operator:m14-policy', 'owner:commercial-board',
  'Approve seven day managed delinquency grace for test',
  '2042-01-01 00:00:00+00', null,
  'c1000000-0000-4000-8000-000000000501'
);

select ok((select first_policy_id is not null from commercial_policy_refs),
  'approved delinquency command returns a public selector');
select results_eq($$
  select loyalty_private.record_managed_billing_delinquency_policy_v1(
    7, 'operator:m14-policy', 'owner:commercial-board',
    'Approve seven day managed delinquency grace for test',
    '2042-01-01 00:00:00+00', null,
    'c1000000-0000-4000-8000-000000000501'
  )
$$, $$ select first_policy_id from commercial_policy_refs $$,
  'exact policy retry returns the original effect');
select results_eq(
  $$ select count(*)::bigint from loyalty_private.managed_billing_delinquency_policy_versions $$,
  array[1::bigint], 'exact policy retry stores one immutable version'
);
select throws_ok($$
  select loyalty_private.record_managed_billing_delinquency_policy_v1(
    8, 'operator:m14-policy', 'owner:commercial-board',
    'Approve seven day managed delinquency grace for test',
    '2042-01-01 00:00:00+00', null,
    'c1000000-0000-4000-8000-000000000501'
  )
$$, '23505', 'managed billing delinquency policy idempotency conflict',
  'changed policy retry fails closed');
select throws_ok($$
  select loyalty_private.record_managed_billing_delinquency_policy_v1(
    7, 'owner:same-person', 'owner:same-person',
    'Attempt policy without separation of duties',
    '2042-01-01 00:00:00+00', null,
    'c1000000-0000-4000-8000-000000000502'
  )
$$, '22023', 'invalid managed billing delinquency policy request',
  'policy requires a distinct approver');
select throws_ok($$
  select loyalty_private.record_managed_billing_delinquency_policy_v1(
    7, 'operator:m14-policy', 'owner:commercial-board',
    'Attempt a reversed effective policy interval',
    '2042-02-01 00:00:00+00', '2042-01-01 00:00:00+00',
    'c1000000-0000-4000-8000-000000000503'
  )
$$, '22023', 'invalid managed billing delinquency policy request',
  'policy rejects a reversed effective interval');
select throws_ok(
  $$ update loyalty_private.managed_billing_delinquency_policy_versions set past_due_grace_days = 9 $$,
  '55000', 'immutable loyalty history cannot be changed',
  'delinquency policy history is immutable'
);
select results_eq($$
  select past_due_grace_days, actor_reference, approver_reference,
    length(reason) >= 8, octet_length(request_fingerprint)
  from loyalty_private.managed_billing_delinquency_policy_versions
$$, $$ values (7::smallint, 'operator:m14-policy'::text,
  'owner:commercial-board'::text, true, 32) $$,
  'stored policy is bounded attributable approved and fingerprinted'
);

-- 35-42: manual contracts are organization-bound append-only decisions.
update commercial_policy_refs
set first_contract_id = loyalty_private.record_managed_billing_manual_contract_v1(
  'c1000000-0000-4000-8000-000000000100', 'allow_growth',
  'operator:m14-contract', 'owner:commercial-board',
  'Approve bounded enterprise contract for policy test',
  '2042-01-12 00:00:00+00', '2042-01-20 00:00:00+00',
  'c1000000-0000-4000-8000-000000000601'
);
select ok((select first_contract_id is not null from commercial_policy_refs),
  'manual contract command returns a public selector');
select results_eq($$
  select loyalty_private.record_managed_billing_manual_contract_v1(
    'c1000000-0000-4000-8000-000000000100', 'allow_growth',
    'operator:m14-contract', 'owner:commercial-board',
    'Approve bounded enterprise contract for policy test',
    '2042-01-12 00:00:00+00', '2042-01-20 00:00:00+00',
    'c1000000-0000-4000-8000-000000000601'
  )
$$, $$ select first_contract_id from commercial_policy_refs $$,
  'exact contract retry returns the original effect');
select results_eq(
  $$ select count(*)::bigint from loyalty_private.managed_billing_manual_contract_versions $$,
  array[1::bigint], 'exact contract retry stores one immutable version'
);
select throws_ok($$
  select loyalty_private.record_managed_billing_manual_contract_v1(
    'c1000000-0000-4000-8000-000000000100', 'defer_to_provider',
    'operator:m14-contract', 'owner:commercial-board',
    'Change the contract retry decision',
    '2042-01-12 00:00:00+00', null,
    'c1000000-0000-4000-8000-000000000601'
  )
$$, '23505', 'managed billing manual contract idempotency conflict',
  'changed contract retry fails closed');
select throws_ok($$
  select loyalty_private.record_managed_billing_manual_contract_v1(
    'c1000000-0000-4000-8000-000000000100', 'defer_to_provider',
    'operator:m14-contract', 'owner:commercial-board',
    'Attempt a bounded provider deferral',
    '2042-01-21 00:00:00+00', '2042-01-22 00:00:00+00',
    'c1000000-0000-4000-8000-000000000602'
  )
$$, '22023', 'invalid managed billing manual contract request',
  'provider deferral must be open-ended to prevent contract resurrection');
select throws_ok($$
  select loyalty_private.record_managed_billing_manual_contract_v1(
    'c1000000-0000-4000-8000-000000000100', 'allow_growth',
    'owner:same-person', 'owner:same-person',
    'Attempt a contract without a separate approver',
    '2042-01-21 00:00:00+00', null,
    'c1000000-0000-4000-8000-000000000603'
  )
$$, '22023', 'invalid managed billing manual contract request',
  'manual contract requires separation of duties');
select throws_ok(
  $$ delete from loyalty_private.managed_billing_manual_contract_versions $$,
  '55000', 'immutable loyalty history cannot be changed',
  'manual contract history is immutable'
);
select results_eq($$
  select decision, actor_reference, approver_reference,
    effective_from, effective_until, octet_length(request_fingerprint)
  from loyalty_private.managed_billing_manual_contract_versions
$$, $$ values ('allow_growth'::text, 'operator:m14-contract'::text,
  'owner:commercial-board'::text, '2042-01-12 00:00:00+00'::timestamptz,
  '2042-01-20 00:00:00+00'::timestamptz, 32) $$,
  'manual contract stores exact private approval and effective term evidence'
);

update commercial_policy_refs
set first_account_id = loyalty_private.record_managed_billing_account_v1(
  'c1000000-0000-4000-8000-000000000100',
  'cus_CommercialPolicy0001', false, 'operator:m14',
  'Create first commercial policy test account',
  '2042-01-01 01:00:00+00',
  'c1000000-0000-4000-8000-000000000701'
), second_account_id = loyalty_private.record_managed_billing_account_v1(
  'c2000000-0000-4000-8000-000000000100',
  'cus_CommercialPolicy0002', false, 'operator:m14',
  'Create second commercial policy test account',
  '2042-01-01 01:00:00+00',
  'c2000000-0000-4000-8000-000000000701'
);

select loyalty_private.record_managed_billing_state_v1(
  'c1000000-0000-4000-8000-000000000100', first_account_id,
  'sub_CommercialPolicy0001', 'evt_CommercialPastDue001', 'past_due',
  '2042-01-10 00:00:00+00', '2042-02-01 00:00:00+00', null, null,
  'worker:billing', 'Record first immutable past due observation',
  'c1000000-0000-4000-8000-000000000702'
) from commercial_policy_refs;
select loyalty_private.record_managed_billing_state_v1(
  'c2000000-0000-4000-8000-000000000100', second_account_id,
  'sub_CommercialPolicy0002', 'evt_CommercialPastDue002', 'past_due',
  '2042-01-10 00:00:00+00', '2042-02-01 00:00:00+00', null, null,
  'worker:billing', 'Record second immutable past due observation',
  'c2000000-0000-4000-8000-000000000702'
) from commercial_policy_refs;

-- 43-49: provider occurrence, manual precedence, and fallback are exact.
set local role authenticated;
set local request.jwt.claim.sub = 'c1000000-0000-4000-8000-000000000001';
select results_eq($$
  select billing_summary->>'commercialState', billing_summary->>'stateSource',
    billing_summary->>'restrictionReason', billing_summary->>'graceEndsAt'
  from loyalty.get_my_billing_summary_v2(
    'c1000000-0000-4000-8000-000000000100',
    '2042-01-11 00:00:00+00'
  )
$$, $$ values ('grace'::text, 'provider'::text, 'payment_past_due'::text,
  '2042-01-17T00:00:00+00:00'::text) $$,
  'past-due grace is derived from the policy at provider occurrence time');
select results_eq($$
  select billing_summary->>'commercialState', billing_summary->>'stateSource',
    billing_summary->>'restrictionReason', billing_summary->>'contractEndsAt',
    (billing_summary->>'providerLinked')::boolean,
    (billing_summary->>'subscriptionPresent')::boolean
  from loyalty.get_my_billing_summary_v2(
    'c1000000-0000-4000-8000-000000000100',
    '2042-01-18 00:00:00+00'
  )
$$, $$ values ('contract_managed'::text, 'manual_contract'::text, 'none'::text,
  '2042-01-20T00:00:00+00:00'::text, true, true) $$,
  'current manual contract wins while private provider evidence remains retained');
reset role;

-- A delayed cancellation event predates evaluation but cannot beat the contract.
select loyalty_private.record_managed_billing_state_v1(
  'c1000000-0000-4000-8000-000000000100', first_account_id,
  'sub_CommercialPolicy0001', 'evt_CommercialCancelled1', 'cancelled',
  '2042-01-13 00:00:00+00', null, null, null,
  'worker:billing', 'Record delayed provider cancellation observation',
  'c1000000-0000-4000-8000-000000000703'
) from commercial_policy_refs;

set local role authenticated;
set local request.jwt.claim.sub = 'c1000000-0000-4000-8000-000000000001';
select results_eq($$
  select billing_summary->>'commercialState', billing_summary->>'stateSource'
  from loyalty.get_my_billing_summary_v2(
    'c1000000-0000-4000-8000-000000000100',
    '2042-01-18 00:00:00+00'
  )
$$, $$ values ('contract_managed'::text, 'manual_contract'::text) $$,
  'delayed provider cancellation cannot overwrite a current manual contract');
select results_eq($$
  select billing_summary->>'schemaVersion', billing_summary->>'commercialState',
    (billing_summary ? 'stateSource'), (billing_summary ? 'contractEndsAt')
  from loyalty.get_my_billing_summary_v1(
    'c1000000-0000-4000-8000-000000000100',
    '2042-01-18 00:00:00+00'
  )
$$, $$ values ('1'::text, 'contract_managed'::text, false, false) $$,
  'V1 reports contract-managed state without exposing V2 fields');
reset role;

select loyalty_private.record_managed_billing_manual_contract_v1(
  'c1000000-0000-4000-8000-000000000100', 'defer_to_provider',
  'operator:m14-contract', 'owner:commercial-board',
  'Return organization to normalized provider authority',
  '2042-01-19 00:00:00+00', null,
  'c1000000-0000-4000-8000-000000000604'
);

set local role authenticated;
set local request.jwt.claim.sub = 'c1000000-0000-4000-8000-000000000001';
select results_eq($$
  select billing_summary->>'commercialState', billing_summary->>'stateSource',
    billing_summary->>'restrictionReason',
    (billing_summary->>'growthConfigurationAllowed')::boolean
  from loyalty.get_my_billing_summary_v2(
    'c1000000-0000-4000-8000-000000000100',
    '2042-01-19 00:00:00+00'
  )
$$, $$ values ('cancelled'::text, 'provider'::text,
  'provider_cancelled'::text, false) $$,
  'explicit open-ended deferral returns authority to provider state');
reset role;

select loyalty_private.record_managed_billing_state_v1(
  'c1000000-0000-4000-8000-000000000100', first_account_id,
  'sub_CommercialPolicy0001', 'evt_CommercialRecovered1', 'active',
  '2042-01-21 00:00:00+00', '2042-02-21 00:00:00+00', null, null,
  'worker:billing', 'Record provider recovery after contract deferral',
  'c1000000-0000-4000-8000-000000000704'
) from commercial_policy_refs;

set local role authenticated;
set local request.jwt.claim.sub = 'c1000000-0000-4000-8000-000000000001';
select results_eq($$
  select billing_summary->>'commercialState', billing_summary->>'stateSource',
    (billing_summary->>'growthConfigurationAllowed')::boolean
  from loyalty.get_my_billing_summary_v2(
    'c1000000-0000-4000-8000-000000000100',
    '2042-01-22 00:00:00+00'
  )
$$, $$ values ('active'::text, 'provider'::text, true) $$,
  'newer provider recovery reopens growth without rewriting history');
select results_eq($$
  select count(*)::bigint
  from loyalty.get_my_billing_summary_v2(
    'c1000000-0000-4000-8000-000000000100',
    '2042-01-19 00:00:00+00'
  )
  where billing_summary::text ~ '(cus_|sub_|evt_|operator:|owner:|commercial-board|providerCustomer|approver|reason)'
$$, array[0::bigint], 'public V2 output excludes provider and approval evidence');
reset role;

-- 50-52: later policy versions do not retroactively alter old provider events.
select loyalty_private.record_managed_billing_delinquency_policy_v1(
  30, 'operator:m14-policy', 'owner:commercial-board',
  'Approve later thirty day delinquency grace for test',
  '2042-01-15 00:00:00+00', null,
  'c1000000-0000-4000-8000-000000000504'
);

-- Simulate an operator append observed after the old provider occurrence but
-- carrying a backdated effective instant. The old event must never adopt it.
insert into loyalty_private.managed_billing_delinquency_policy_versions (
  past_due_grace_days, actor_reference, approver_reference, reason,
  effective_from, effective_until, idempotency_key, request_fingerprint,
  created_at
) values (
  60, 'operator:m14-policy', 'owner:commercial-board',
  'Simulate a later observed backdated policy append',
  '2042-01-05 00:00:00+00', null,
  'c1000000-0000-4000-8000-000000000505',
  decode(repeat('ab', 32), 'hex'), '2042-01-11 00:00:00+00'
);

select results_eq($$
  select commercial_state, grace_ends_at
  from loyalty_private.resolve_managed_billing_commercial_policy_v1(
    (select id from loyalty.organizations where slug = 'policy-two'),
    '2042-01-16 00:00:00+00'
  )
$$, $$ values ('grace'::text, '2042-01-17 00:00:00+00'::timestamptz) $$,
  'old provider event rejects a later-observed backdated policy and retains its occurrence-time policy');

select loyalty_private.record_managed_billing_state_v1(
  'c2000000-0000-4000-8000-000000000100', second_account_id,
  'sub_CommercialPolicy0002', 'evt_CommercialPastDue003', 'past_due',
  '2042-01-16 00:00:00+00', '2042-03-01 00:00:00+00', null, null,
  'worker:billing', 'Record new past due event under later policy',
  'c2000000-0000-4000-8000-000000000703'
) from commercial_policy_refs;

select results_eq($$
  select commercial_state, grace_ends_at
  from loyalty_private.resolve_managed_billing_commercial_policy_v1(
    (select id from loyalty.organizations where slug = 'policy-two'),
    '2042-02-01 00:00:00+00'
  )
$$, $$ values ('grace'::text, '2042-02-15 00:00:00+00'::timestamptz) $$,
  'new provider event uses the later policy effective at its occurrence');
select results_eq($$
  select commercial_state, restriction_reason
  from loyalty_private.resolve_managed_billing_commercial_policy_v1(
    (select id from loyalty.organizations where slug = 'policy-two'),
    '2042-02-15 00:00:00+00'
  )
$$, $$ values ('suspended'::text, 'grace_expired'::text) $$,
  'grace expires at the exact local deadline without another webhook');

-- 53-59: only the separate authoring decision is commercially restricted.
select results_eq($$
  select allowed, entitlement_enabled, protected_value_path, reason_code
  from loyalty_private.authorize_managed_growth_configuration_v1(
    (select id from loyalty.organizations where slug = 'policy-two'),
    'programme.v2', 'policy-two:programme', '2042-02-01 00:00:00+00'
  )
$$, $$ values (true, true, false, 'allowed'::text) $$,
  'entitled nonprotected authoring remains allowed during grace');
select results_eq($$
  select allowed, commercial_state, reason_code
  from loyalty_private.authorize_managed_growth_configuration_v1(
    (select id from loyalty.organizations where slug = 'policy-one'),
    'programme.v2', 'policy-one:programme', '2042-01-19 00:00:00+00'
  )
$$, $$ values (false, 'cancelled'::text, 'commercial_restricted'::text) $$,
  'new nonprotected authoring is denied after provider cancellation');
select results_eq($$
  select allowed, protected_value_path, reason_code
  from loyalty_private.authorize_managed_growth_configuration_v1(
    (select id from loyalty.organizations where slug = 'policy-one'),
    'core.refund', 'policy-one:refund', '2042-01-19 00:00:00+00'
  )
$$, $$ values (true, true, 'protected_value_path'::text) $$,
  'protected refund remains allowed while commercial growth is restricted');
select results_eq($$
  select allowed, commercial_state, reason_code
  from loyalty_private.authorize_managed_growth_configuration_v1(
    (select id from loyalty.organizations where slug = 'policy-one'),
    'programme.v2', 'policy-one:contract', '2042-01-18 00:00:00+00'
  )
$$, $$ values (true, 'contract_managed'::text, 'allowed'::text) $$,
  'approved manual contract allows entitled new configuration');
select results_eq($$
  select allowed, entitlement_enabled, reason_code
  from loyalty_private.authorize_managed_growth_configuration_v1(
    (select id from loyalty.organizations where slug = 'policy-one'),
    'campaigns', 'policy-one:campaigns', '2042-01-18 00:00:00+00'
  )
$$, $$ values (false, false, 'entitlement_disabled'::text) $$,
  'manual contract never bypasses an ordinary capability entitlement');
select results_eq($$
  select count(*)::bigint
  from (values
    ('core.balance_read'), ('core.refund'), ('core.reconciliation'),
    ('core.checkout_independence'), ('core.export'),
    ('core.promised_reward_redemption')
  ) as capability(key)
  cross join lateral loyalty_private.authorize_managed_growth_configuration_v1(
    (select id from loyalty.organizations where slug = 'policy-two'),
    capability.key, 'policy-two:' || capability.key,
    '2042-02-15 00:00:00+00'
  ) as decision
  where decision.allowed and decision.protected_value_path
$$, array[6::bigint], 'all six protected paths remain allowed after grace expiry');
select results_eq($$
  select count(*)::bigint
  from loyalty.ledger_transactions
  where organization_id in (
    select id from loyalty.organizations where slug in ('policy-one', 'policy-two')
  )
$$, array[0::bigint], 'policy provider contract and authorization evidence create no ledger effects');

-- 60-63: failure boundaries remain explicit and fail closed.
select throws_ok($$
  select * from loyalty.get_my_billing_summary_v2(
    'c1000000-0000-4000-8000-000000000100', null
  )
$$, '22023', 'billing evaluation time is required',
  'V2 rejects a missing evaluation time');
select throws_ok($$
  select * from loyalty_private.resolve_managed_billing_commercial_policy_v1(
    9223372036854775807, '2042-01-01 00:00:00+00'
  )
$$, '22023', 'unknown organization',
  'private resolver rejects an unknown organization');
set local role authenticated;
set local request.jwt.claim.sub = 'c3000000-0000-4000-8000-000000000001';
select results_eq($$
  select count(*)::bigint
  from loyalty.get_my_billing_summary_v2(
    'c1000000-0000-4000-8000-000000000100',
    '2042-01-18 00:00:00+00'
  )
$$, array[0::bigint], 'revoked membership fails closed for V2');
reset role;
select results_eq($$
  select
    (select count(*) from loyalty_private.managed_billing_delinquency_policy_versions),
    (select count(*) from loyalty_private.managed_billing_manual_contract_versions),
    (select count(*) from loyalty_private.managed_billing_state_revisions)
$$, $$ values (3::bigint, 2::bigint, 5::bigint) $$,
  'all accepted commercial and provider history remains independently reconstructable');

select * from finish();
rollback;
