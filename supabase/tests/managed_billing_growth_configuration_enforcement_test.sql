begin;

create extension if not exists pgtap with schema extensions;

select plan(43);

-- 1-20: the immutable command inventory is private, complete, and excludes
-- protected/operational roots by construction.
select has_table(
  'loyalty_private', 'managed_growth_configuration_boundaries',
  'private managed growth boundary inventory exists'
);
select has_function(
  'loyalty_private', 'evaluate_managed_growth_boundary_v1',
  array['bigint','text','text','text','text','timestamp with time zone'],
  'deterministic managed growth boundary evaluator exists'
);
select has_function(
  'loyalty_private', 'enforce_managed_growth_boundary_v1', array[]::text[],
  'database-authoritative managed growth trigger exists'
);
select ok((
  select relation.relrowsecurity
  from pg_catalog.pg_class as relation
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'loyalty_private'
    and relation.relname = 'managed_growth_configuration_boundaries'
), 'managed growth boundary inventory enables RLS');
select ok(exists (
  select 1 from pg_catalog.pg_trigger
  where tgrelid =
    'loyalty_private.managed_growth_configuration_boundaries'::regclass
    and tgname = 'managed_growth_configuration_boundaries_immutable'
    and not tgisinternal
), 'managed growth boundary inventory is immutable');
select ok(
  not pg_catalog.has_table_privilege(
    'authenticated',
    'loyalty_private.managed_growth_configuration_boundaries', 'SELECT'
  ) and not pg_catalog.has_function_privilege(
    'authenticated',
    'loyalty_private.evaluate_managed_growth_boundary_v1(bigint,text,text,text,text,timestamptz)',
    'EXECUTE'
  ) and not pg_catalog.has_function_privilege(
    'loyalty_worker',
    'loyalty_private.enforce_managed_growth_boundary_v1()', 'EXECUTE'
  ),
  'browser runtime and workers cannot enumerate or invoke growth policy'
);
select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.managed_growth_configuration_boundaries $$,
  array[23::bigint],
  'twenty-three reviewed merchant mutation roots are registered'
);
select results_eq($$
  select count(*)::bigint
  from pg_catalog.pg_trigger as trigger_row
  join pg_catalog.pg_proc as routine on routine.oid = trigger_row.tgfoid
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = routine.pronamespace
  where namespace.nspname = 'loyalty_private'
    and routine.proname = 'enforce_managed_growth_boundary_v1'
    and not trigger_row.tgisinternal
$$, array[23::bigint], 'exactly twenty-three relations use the growth guard');
select results_eq($$
  select count(*)::bigint
  from pg_catalog.pg_trigger as trigger_row
  join pg_catalog.pg_proc as routine on routine.oid = trigger_row.tgfoid
  join pg_catalog.pg_namespace as namespace on namespace.oid = routine.pronamespace
  where namespace.nspname = 'loyalty_private'
    and routine.proname = 'enforce_managed_growth_boundary_v1'
    and trigger_row.tgname like 'zz_managed_growth_%'
    and not trigger_row.tgisinternal
$$, array[23::bigint],
  'commercial guards sort after established contract validation triggers');
select ok((
  select pg_catalog.position(
      'request.jwt.claim.role' in pg_catalog.lower(
        pg_catalog.pg_get_functiondef(routine.oid)
      )
    ) = 0
    and pg_catalog.position(
      'session_user' in pg_catalog.lower(
        pg_catalog.pg_get_functiondef(routine.oid)
      )
    ) > 0
  from pg_catalog.pg_proc as routine
  join pg_catalog.pg_namespace as namespace on namespace.oid = routine.pronamespace
  where namespace.nspname = 'loyalty_private'
    and routine.proname = 'enforce_managed_growth_boundary_v1'
), 'trusted bypasses derive from database role and never JWT metadata');
select results_eq($$
  select count(*)::bigint
  from loyalty_private.managed_growth_configuration_boundaries as boundary
  where exists (
    select 1
    from pg_catalog.pg_trigger as trigger_row
    join pg_catalog.pg_class as relation on relation.oid = trigger_row.tgrelid
    join pg_catalog.pg_namespace as relation_namespace
      on relation_namespace.oid = relation.relnamespace
    join pg_catalog.pg_proc as routine on routine.oid = trigger_row.tgfoid
    join pg_catalog.pg_namespace as routine_namespace
      on routine_namespace.oid = routine.pronamespace
    where relation_namespace.nspname = boundary.relation_schema
      and relation.relname = boundary.relation_name
      and routine_namespace.nspname = 'loyalty_private'
      and routine.proname = 'enforce_managed_growth_boundary_v1'
      and pg_catalog.pg_get_triggerdef(trigger_row.oid)
        like '%' || pg_catalog.quote_literal(boundary.boundary_key) || '%'
      and not trigger_row.tgisinternal
  )
$$, array[23::bigint], 'every inventory row maps to its exact trigger argument');
select results_eq($$
  select count(*)::bigint
  from loyalty_private.managed_growth_configuration_boundaries as boundary
  where pg_catalog.to_regclass(
    pg_catalog.quote_ident(boundary.relation_schema) || '.' ||
      pg_catalog.quote_ident(boundary.relation_name)
  ) is not null
$$, array[23::bigint], 'every registered mutation root exists');
select results_eq($$
  select count(*)::bigint
  from loyalty_private.managed_growth_configuration_boundaries as boundary
  where exists (
    select 1 from loyalty.entitlement_catalogue as capability
    where capability.catalogue_version = 1
      and capability.capability_key = boundary.capability_key
      and not capability.protected_value_path
  )
$$, array[23::bigint], 'every boundary uses a nonprotected catalogue capability');
select results_eq($$
  select count(*)::bigint
  from loyalty_private.managed_growth_configuration_boundaries as boundary,
    lateral pg_catalog.unnest(boundary.command_names) as command_name
  where exists (
    select 1
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = routine.pronamespace
    where namespace.nspname in ('loyalty', 'loyalty_private')
      and routine.proname = command_name
  )
$$, $$
  select sum(cardinality(command_names))::bigint
  from loyalty_private.managed_growth_configuration_boundaries
$$, 'every inventoried command name resolves to a current database function');
select results_eq($$
  select count(*)::bigint
  from loyalty_private.managed_growth_configuration_boundaries
  where relation_name in (
    'ledger_transactions', 'ledger_entries', 'wallet_balances', 'point_lots',
    'point_lot_balances', 'reward_reservations',
    'reward_reservation_transitions', 'commerce_connections',
    'analytics_export_requests', 'organization_memberships',
    'customer_user_links', 'migration_correction_batches'
  )
$$, array[0::bigint], 'value access export identity and connector roots are unguarded');
select results_eq($$
  select count(*)::bigint
  from pg_catalog.pg_proc as routine
  join pg_catalog.pg_namespace as namespace on namespace.oid = routine.pronamespace
  where namespace.nspname in ('loyalty', 'loyalty_private')
    and routine.proname in (
      'accept_commerce_delivery', 'normalize_commerce_delivery',
      'release_points', 'export_ledger_entries', 'claim_woocommerce_effects',
      'finish_commerce_effect', 'claim_woocommerce_commands',
      'capture_woocommerce_coupon_use',
      'request_connector_reconciliation_command', 'redeem_my_reward',
      'issue_customer_data_export_authorization',
      'consume_customer_data_export', 'apply_woocommerce_customer_erasure',
      'record_tier_refund_fact_v2', 'reject_referral_for_refund_v1',
      'create_analytics_export_command', 'claim_analytics_export_jobs_v1',
      'consume_analytics_export_v1',
      'organization_administration_export_v1',
      'compensate_migration_batch_v1'
    )
    and pg_catalog.pg_get_functiondef(routine.oid) ~
      '(authorize_managed_growth_configuration_v1|evaluate_managed_growth_boundary_v1|enforce_managed_growth_boundary_v1)'
$$, array[0::bigint], 'protected and operational functions contain no commercial denial dependency');
select results_eq($$
  select count(*)::bigint
  from pg_catalog.pg_proc as routine
  join pg_catalog.pg_namespace as namespace on namespace.oid = routine.pronamespace
  where namespace.nspname = 'loyalty_private'
    and routine.proname in (
      'evaluate_managed_growth_boundary_v1',
      'enforce_managed_growth_boundary_v1'
    )
    and routine.prosecdef
    and exists (
      select 1 from pg_catalog.unnest(routine.proconfig) as setting
      where setting = 'search_path=""'
    )
$$, array[2::bigint], 'both policy boundaries are hardened security definer functions');
select results_eq($$
  select count(*)::bigint
  from loyalty_private.managed_growth_configuration_boundaries
  where cardinality(safe_insert_states) > 0
     or cardinality(safe_update_states) > 0
$$, array[7::bigint], 'seven roots declare only reviewed risk-reducing transitions');
select results_eq($$
  select coalesce(sum(cardinality(safe_insert_states)), 0)::bigint,
    coalesce(sum(cardinality(safe_update_states)), 0)::bigint
  from loyalty_private.managed_growth_configuration_boundaries
$$, $$ values (10::bigint, 6::bigint) $$,
  'ten safe append states and six safe update states are explicit'
);
select throws_ok(
  $$ update loyalty_private.managed_growth_configuration_boundaries
     set capability_key = 'core.refund' where boundary_key = 'programme.root' $$,
  '55000', 'immutable loyalty history cannot be changed',
  'boundary inventory cannot be rewritten to a protected capability'
);

insert into auth.users (id, email)
values
  ('d1000000-0000-4000-8000-000000000001', 'boundary-owner@example.test'),
  ('d2000000-0000-4000-8000-000000000001', 'boundary-live@example.test');
insert into loyalty.organizations (public_id, slug, name)
values
  ('d1000000-0000-4000-8000-000000000100', 'boundary-matrix', 'Boundary Matrix'),
  ('d2000000-0000-4000-8000-000000000100', 'boundary-live', 'Boundary Live');
insert into loyalty.organization_memberships (organization_id, user_id, role)
values
  ((select id from loyalty.organizations where slug = 'boundary-matrix'),
    'd1000000-0000-4000-8000-000000000001', 'owner'),
  ((select id from loyalty.organizations where slug = 'boundary-live'),
    'd2000000-0000-4000-8000-000000000001', 'owner');
insert into loyalty.workspaces (public_id, organization_id, slug, name)
select 'd2000000-0000-4000-8000-000000000200', id,
  'boundary-store', 'Boundary Store'
from loyalty.organizations where slug = 'boundary-live';
insert into loyalty.programme_groups (
  public_id, organization_id, slug, name, sharing_policy
)
select 'd2000000-0000-4000-8000-000000000300', id,
  'boundary-programme', 'Boundary Programme', 'isolated'
from loyalty.organizations where slug = 'boundary-live';
insert into loyalty.programme_group_workspaces (
  organization_id, programme_group_id, workspace_id
)
select organization.id, programme_group.id, workspace.id
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
join loyalty.workspaces as workspace
  on workspace.organization_id = organization.id
where organization.slug = 'boundary-live';

-- 21-32: every registered root follows the same deterministic state matrix.
select results_eq($$
  select count(*)::bigint
  from loyalty_private.managed_growth_configuration_boundaries as boundary
  cross join lateral loyalty_private.evaluate_managed_growth_boundary_v1(
    (select id from loyalty.organizations where slug = 'boundary-matrix'),
    boundary.boundary_key, boundary.guarded_operations[1], null, '__growth__',
    '2040-01-01 00:00:00+00'
  ) as decision
  where decision.allowed and decision.reason_code = 'allowed'
$$, array[23::bigint], 'self-hosted mode allows every entitled authoring root locally');

select loyalty_private.set_deployment_mode(
  'managed', 1, 'operator:m14-boundary',
  'Begin deterministic managed boundary matrix', '2044-01-01 00:00:00+00'
);
do $$
declare capability_key text;
begin
  for capability_key in
    select distinct boundary.capability_key
    from loyalty_private.managed_growth_configuration_boundaries as boundary
  loop
    perform loyalty_private.set_organization_entitlement(
      'd1000000-0000-4000-8000-000000000100', capability_key,
      'enabled', null, 'manual_override', 'operator:m14-boundary',
      'Enable capability for deterministic boundary matrix',
      '2044-01-01 00:00:00+00', null
    );
  end loop;
end;
$$;

select results_eq($$
  select count(*)::bigint
  from loyalty_private.managed_growth_configuration_boundaries as boundary
  cross join lateral loyalty_private.evaluate_managed_growth_boundary_v1(
    (select id from loyalty.organizations where slug = 'boundary-matrix'),
    boundary.boundary_key, boundary.guarded_operations[1], null, '__growth__',
    '2044-01-01 00:00:00.500001+00'
  ) as decision
  where decision.allowed
    and decision.reason_code = 'commercial_enforcement_disabled'
$$, array[23::bigint],
  'managed billing canary disabled leaves ordinary entitled authoring unchanged');

select loyalty_private.set_organization_entitlement(
  'd1000000-0000-4000-8000-000000000100', 'managed.billing',
  'enabled', null, 'canary', 'operator:m14-boundary',
  'Enable commercial enforcement for deterministic boundary matrix',
  '2044-01-01 00:00:00.750001+00', null
);

select results_eq($$
  select count(*)::bigint
  from loyalty_private.managed_growth_configuration_boundaries as boundary
  cross join lateral loyalty_private.evaluate_managed_growth_boundary_v1(
    (select id from loyalty.organizations where slug = 'boundary-matrix'),
    boundary.boundary_key, boundary.guarded_operations[1], null, '__growth__',
    '2044-01-01 00:00:01+00'
  ) as decision
  where not decision.allowed
    and decision.reason_code = 'commercial_restricted'
$$, array[23::bigint], 'managed mode fails every authoring root closed without provider evidence');

create temporary table managed_boundary_refs (
  matrix_account_id uuid,
  live_account_id uuid,
  live_base_time timestamptz
) on commit drop;
insert into managed_boundary_refs (matrix_account_id, live_base_time)
values (
  loyalty_private.record_managed_billing_account_v1(
    'd1000000-0000-4000-8000-000000000100',
    'cus_BoundaryMatrix001', false, 'operator:m14-boundary',
    'Create deterministic boundary matrix account',
    '2044-01-01 00:10:00+00',
    'd1000000-0000-4000-8000-000000000501'
  ),
  pg_catalog.clock_timestamp() - interval '10 minutes'
);
select loyalty_private.record_managed_billing_state_v1(
  'd1000000-0000-4000-8000-000000000100', matrix_account_id,
  'sub_BoundaryMatrix001', 'evt_BoundaryActive001', 'active',
  '2044-01-02 00:00:00+00', '2044-02-02 00:00:00+00', null, null,
  'worker:billing', 'Record active boundary matrix evidence',
  'd1000000-0000-4000-8000-000000000502'
) from managed_boundary_refs;
select results_eq($$
  select count(*)::bigint
  from loyalty_private.managed_growth_configuration_boundaries as boundary
  cross join lateral loyalty_private.evaluate_managed_growth_boundary_v1(
    (select id from loyalty.organizations where slug = 'boundary-matrix'),
    boundary.boundary_key, boundary.guarded_operations[1], null, '__growth__',
    '2044-01-02 00:00:01+00'
  ) as decision where decision.allowed and decision.commercial_state = 'active'
$$, array[23::bigint], 'active provider evidence allows every authoring root');

select loyalty_private.record_managed_billing_state_v1(
  'd1000000-0000-4000-8000-000000000100', matrix_account_id,
  'sub_BoundaryMatrix001', 'evt_BoundaryPastDue1', 'past_due',
  '2044-01-03 00:00:00+00', '2044-02-03 00:00:00+00', null,
  '2044-01-10 00:00:00+00', 'worker:billing',
  'Record explicit grace boundary matrix evidence',
  'd1000000-0000-4000-8000-000000000503'
) from managed_boundary_refs;
select results_eq($$
  select count(*)::bigint
  from loyalty_private.managed_growth_configuration_boundaries as boundary
  cross join lateral loyalty_private.evaluate_managed_growth_boundary_v1(
    (select id from loyalty.organizations where slug = 'boundary-matrix'),
    boundary.boundary_key, boundary.guarded_operations[1], null, '__growth__',
    '2044-01-04 00:00:00+00'
  ) as decision where decision.allowed and decision.commercial_state = 'grace'
$$, array[23::bigint], 'past-due grace keeps every authoring root available');

select loyalty_private.record_managed_billing_state_v1(
  'd1000000-0000-4000-8000-000000000100', matrix_account_id,
  'sub_BoundaryMatrix001', 'evt_BoundarySuspend1', 'suspended',
  '2044-01-11 00:00:00+00', null, null, null, 'worker:billing',
  'Record suspended boundary matrix evidence',
  'd1000000-0000-4000-8000-000000000504'
) from managed_boundary_refs;
select results_eq($$
  select count(*)::bigint
  from loyalty_private.managed_growth_configuration_boundaries as boundary
  cross join lateral loyalty_private.evaluate_managed_growth_boundary_v1(
    (select id from loyalty.organizations where slug = 'boundary-matrix'),
    boundary.boundary_key, boundary.guarded_operations[1], null, '__growth__',
    '2044-01-11 00:00:01+00'
  ) as decision where not decision.allowed
    and decision.commercial_state = 'suspended'
$$, array[23::bigint], 'suspension restricts every non-recovery authoring root');

select loyalty_private.record_managed_billing_state_v1(
  'd1000000-0000-4000-8000-000000000100', matrix_account_id,
  'sub_BoundaryMatrix001', 'evt_BoundaryCancel001', 'cancelled',
  '2044-01-12 00:00:00+00', null, null, null, 'worker:billing',
  'Record cancelled boundary matrix evidence',
  'd1000000-0000-4000-8000-000000000505'
) from managed_boundary_refs;
select results_eq($$
  select count(*)::bigint
  from loyalty_private.managed_growth_configuration_boundaries as boundary
  cross join lateral loyalty_private.evaluate_managed_growth_boundary_v1(
    (select id from loyalty.organizations where slug = 'boundary-matrix'),
    boundary.boundary_key, boundary.guarded_operations[1], null, '__growth__',
    '2044-01-12 00:00:01+00'
  ) as decision where not decision.allowed
    and decision.commercial_state = 'cancelled'
$$, array[23::bigint], 'cancellation restricts every non-recovery authoring root');

select loyalty_private.record_managed_billing_state_v1(
  'd1000000-0000-4000-8000-000000000100', matrix_account_id,
  'sub_BoundaryMatrix001', 'evt_BoundaryRecover01', 'active',
  '2044-01-13 00:00:00+00', '2044-02-13 00:00:00+00', null, null,
  'worker:billing', 'Record recovered boundary matrix evidence',
  'd1000000-0000-4000-8000-000000000506'
) from managed_boundary_refs;
select results_eq($$
  select count(*)::bigint
  from loyalty_private.managed_growth_configuration_boundaries as boundary
  cross join lateral loyalty_private.evaluate_managed_growth_boundary_v1(
    (select id from loyalty.organizations where slug = 'boundary-matrix'),
    boundary.boundary_key, boundary.guarded_operations[1], null, '__growth__',
    '2044-01-13 00:00:01+00'
  ) as decision where decision.allowed and decision.commercial_state = 'active'
$$, array[23::bigint], 'new provider recovery reopens every authoring root');

select loyalty_private.record_managed_billing_manual_contract_v1(
  'd1000000-0000-4000-8000-000000000100', 'allow_growth',
  'operator:m14-contract', 'owner:commercial-board',
  'Approve deterministic boundary contract window',
  '2044-01-14 00:00:00+00', '2044-01-20 00:00:00+00',
  'd1000000-0000-4000-8000-000000000507'
);
select results_eq($$
  select count(*)::bigint
  from loyalty_private.managed_growth_configuration_boundaries as boundary
  cross join lateral loyalty_private.evaluate_managed_growth_boundary_v1(
    (select id from loyalty.organizations where slug = 'boundary-matrix'),
    boundary.boundary_key, boundary.guarded_operations[1], null, '__growth__',
    '2044-01-15 00:00:00+00'
  ) as decision where decision.allowed
    and decision.commercial_state = 'contract_managed'
$$, array[23::bigint], 'manual contract reopens every entitled authoring root');

select results_eq($$
  with safe_action as (
    select boundary_key, 'INSERT'::text as operation, null::text as old_state,
      state as new_state
    from loyalty_private.managed_growth_configuration_boundaries,
      lateral pg_catalog.unnest(safe_insert_states) as state
    union all
    select boundary_key, 'UPDATE', '__active__', state
    from loyalty_private.managed_growth_configuration_boundaries,
      lateral pg_catalog.unnest(safe_update_states) as state
  )
  select count(*)::bigint
  from safe_action
  cross join lateral loyalty_private.evaluate_managed_growth_boundary_v1(
    (select id from loyalty.organizations where slug = 'boundary-matrix'),
    safe_action.boundary_key, safe_action.operation, safe_action.old_state,
    safe_action.new_state, '2044-01-12 00:00:01+00'
  ) as decision
  where decision.allowed and decision.recovery_action
    and decision.reason_code = 'safe_recovery_action'
$$, array[16::bigint], 'all sixteen risk-reducing actions remain available while cancelled');
select results_eq($$
  with unsafe_action(boundary_key, operation, old_state, new_state) as (
    values
      ('campaign.version','UPDATE','paused','active'),
      ('notification.webhook_endpoint','UPDATE','disabled','active'),
      ('analytics.report_schedule','UPDATE','paused','active'),
      ('ecosystem.sharing_policy','INSERT',null,'explicit-workspace-allowlist'),
      ('ecosystem.currency_policy','INSERT',null,'enabled'),
      ('ecosystem.service_credential','UPDATE','active','retiring')
  )
  select count(*)::bigint
  from unsafe_action
  cross join lateral loyalty_private.evaluate_managed_growth_boundary_v1(
    (select id from loyalty.organizations where slug = 'boundary-matrix'),
    unsafe_action.boundary_key, unsafe_action.operation,
    unsafe_action.old_state, unsafe_action.new_state,
    '2044-01-12 00:00:01+00'
  ) as decision where not decision.allowed and not decision.recovery_action
$$, array[6::bigint], 'inverse growth transitions remain restricted while cancelled');
select throws_ok($$
  select * from loyalty_private.evaluate_managed_growth_boundary_v1(
    (select id from loyalty.organizations where slug = 'boundary-matrix'),
    'unknown.boundary', 'INSERT', null, null, '2044-01-12 00:00:01+00'
  )
$$, '22023', 'invalid managed growth boundary evaluation',
  'unknown authoring boundaries fail closed');

-- 33-43: the live command boundary preserves exact retries and recovers only
-- from newer commercial evidence; no ledger row is created.
select loyalty_private.set_deployment_mode(
  'managed', 1, 'operator:m14-live',
  'Begin current-time managed boundary integration',
  (select live_base_time from managed_boundary_refs)
);
select loyalty_private.set_organization_entitlement(
  'd2000000-0000-4000-8000-000000000100', 'programme.v2',
  'enabled', null, 'manual_override', 'operator:m14-live',
  'Enable programme authoring for live boundary integration',
  (select live_base_time + interval '1 minute' from managed_boundary_refs), null
);
select loyalty_private.set_organization_entitlement(
  'd2000000-0000-4000-8000-000000000100', 'managed.billing',
  'enabled', null, 'canary', 'operator:m14-live',
  'Enable commercial enforcement for live boundary integration',
  (select live_base_time + interval '1 minute' from managed_boundary_refs), null
);
update managed_boundary_refs
set live_account_id = loyalty_private.record_managed_billing_account_v1(
  'd2000000-0000-4000-8000-000000000100',
  'cus_BoundaryLive0001', false, 'operator:m14-live',
  'Create current-time boundary integration account',
  live_base_time + interval '2 minutes',
  'd2000000-0000-4000-8000-000000000501'
);
select loyalty_private.record_managed_billing_state_v1(
  'd2000000-0000-4000-8000-000000000100', live_account_id,
  'sub_BoundaryLive0001', 'evt_BoundaryLiveCancel1', 'cancelled',
  live_base_time + interval '3 minutes', null, null, null,
  'worker:billing', 'Record live cancelled integration evidence',
  'd2000000-0000-4000-8000-000000000502'
) from managed_boundary_refs;

set local role authenticated;
set local request.jwt.claim.sub = 'd2000000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';
select throws_ok($$
  select * from loyalty.create_programme_command(
    'd2000000-0000-4000-8000-000000000300', 'restricted-programme',
    'Restricted Programme', 'boundary:programme:restricted',
    'd2000000-0000-4000-8000-000000000601'
  )
$$, '42501', 'managed growth configuration restricted',
  'cancelled tenant cannot create a new programme');
reset role;
select results_eq($$
  select count(*)::bigint from loyalty.programmes
  where organization_id = (
    select id from loyalty.organizations where slug = 'boundary-live'
  )
$$, array[0::bigint], 'denied command rolls back the entire programme effect');

select loyalty_private.record_managed_billing_state_v1(
  'd2000000-0000-4000-8000-000000000100', live_account_id,
  'sub_BoundaryLive0001', 'evt_BoundaryLiveActive1', 'active',
  live_base_time + interval '4 minutes',
  live_base_time + interval '40 days', null, null,
  'worker:billing', 'Record live active integration recovery',
  'd2000000-0000-4000-8000-000000000503'
) from managed_boundary_refs;
set local role authenticated;
set local request.jwt.claim.sub = 'd2000000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';
select results_eq($$
  select outcome from loyalty.create_programme_command(
    'd2000000-0000-4000-8000-000000000300', 'recovered-programme',
    'Recovered Programme', 'boundary:programme:recovered',
    'd2000000-0000-4000-8000-000000000602'
  )
$$, array['created'::text], 'newer active evidence reopens programme authoring');
reset role;
select results_eq($$
  select count(*)::bigint from loyalty.programmes
  where organization_id = (
    select id from loyalty.organizations where slug = 'boundary-live'
  ) and slug = 'recovered-programme'
$$, array[1::bigint], 'recovered command creates one programme');

select loyalty_private.record_managed_billing_state_v1(
  'd2000000-0000-4000-8000-000000000100', live_account_id,
  'sub_BoundaryLive0001', 'evt_BoundaryLiveSuspend', 'suspended',
  live_base_time + interval '5 minutes', null, null, null,
  'worker:billing', 'Record live suspended integration evidence',
  'd2000000-0000-4000-8000-000000000504'
) from managed_boundary_refs;
set local role authenticated;
set local request.jwt.claim.sub = 'd2000000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';
select results_eq($$
  select outcome from loyalty.create_programme_command(
    'd2000000-0000-4000-8000-000000000300', 'recovered-programme',
    'Recovered Programme', 'boundary:programme:recovered',
    'd2000000-0000-4000-8000-000000000602'
  )
$$, array['duplicate'::text], 'exact historical retry remains readable while suspended');
select throws_ok($$
  select * from loyalty.create_programme_command(
    'd2000000-0000-4000-8000-000000000300', 'new-suspended-programme',
    'New Suspended Programme', 'boundary:programme:suspended',
    'd2000000-0000-4000-8000-000000000603'
  )
$$, '42501', 'managed growth configuration restricted',
  'suspension blocks only the new command');
reset role;
select results_eq($$
  select count(*)::bigint from loyalty.admin_audit_events
  where organization_id = (
    select id from loyalty.organizations where slug = 'boundary-live'
  ) and action = 'programme.create'
$$, array[1::bigint], 'retry and denial retain one immutable authoring audit effect');

select loyalty_private.record_managed_billing_state_v1(
  'd2000000-0000-4000-8000-000000000100', live_account_id,
  'sub_BoundaryLive0001', 'evt_BoundaryLiveRecover2', 'active',
  live_base_time + interval '6 minutes',
  live_base_time + interval '40 days', null, null,
  'worker:billing', 'Record second live active integration recovery',
  'd2000000-0000-4000-8000-000000000505'
) from managed_boundary_refs;
set local role authenticated;
set local request.jwt.claim.sub = 'd2000000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';
select results_eq($$
  select outcome from loyalty.create_programme_command(
    'd2000000-0000-4000-8000-000000000300', 'second-recovery',
    'Second Recovery', 'boundary:programme:second-recovery',
    'd2000000-0000-4000-8000-000000000604'
  )
$$, array['created'::text], 'second recovery reopens new configuration without rewriting history');
reset role;
select results_eq($$
  select count(*)::bigint from loyalty.programmes
  where organization_id = (
    select id from loyalty.organizations where slug = 'boundary-live'
  )
$$, array[2::bigint], 'only commands executed during active evidence created programmes');
select results_eq($$
  select count(*)::bigint from loyalty.ledger_transactions
  where organization_id in (
    select id from loyalty.organizations
    where slug in ('boundary-matrix', 'boundary-live')
  )
$$, array[0::bigint], 'commercial enforcement and recovery create no ledger effect');
select results_eq($$
  select count(*)::bigint
  from loyalty_private.managed_billing_state_revisions
  where organization_id = (
    select id from loyalty.organizations where slug = 'boundary-live'
  )
$$, array[4::bigint], 'all provider restriction and recovery evidence remains immutable');

select * from finish();
rollback;
