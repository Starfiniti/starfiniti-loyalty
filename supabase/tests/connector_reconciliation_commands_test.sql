begin;

create extension if not exists pgtap with schema extensions;

select plan(46);

select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.request_connector_reconciliation_command(uuid,text,text,text,uuid)',
    'EXECUTE'
  ),
  'authenticated users can enter the guarded reconciliation command'
);
select ok(
  not has_function_privilege(
    'anon',
    'loyalty.request_connector_reconciliation_command(uuid,text,text,text,uuid)',
    'EXECUTE'
  ),
  'anonymous users cannot request reconciliation'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'loyalty'
      and routine.proname = 'request_connector_reconciliation_command'
      and routine.prosecdef
      and exists (
        select 1 from unnest(routine.proconfig) as setting
        where setting = 'search_path=""'
      )
  $$,
  array[1::bigint],
  'the reconciliation wrapper is security definer with an empty search path'
);
select ok(
  has_function_privilege(
    'loyalty_runtime',
    'loyalty_private.claim_woocommerce_commands(uuid,integer,integer)',
    'EXECUTE'
  ),
  'the connector runtime can claim reconciliation commands'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'loyalty_private.claim_woocommerce_commands(uuid,integer,integer)',
    'EXECUTE'
  ),
  'browser users cannot claim private connector commands'
);

insert into auth.users (id, email)
values
  ('77000000-0000-4000-8000-000000000001', 'reconcile-owner@example.test'),
  ('77000000-0000-4000-8000-000000000002', 'reconcile-operator@example.test'),
  ('77000000-0000-4000-8000-000000000003', 'reconcile-analyst@example.test'),
  ('77000000-0000-4000-8000-000000000004', 'reconcile-auditor@example.test'),
  ('77000000-0000-4000-8000-000000000005', 'reconcile-revoked@example.test'),
  ('78000000-0000-4000-8000-000000000001', 'reconcile-other@example.test');
insert into loyalty.organizations (public_id, slug, name)
values
  ('77000000-0000-4000-8000-000000000100', 'reconcile-one', 'Reconcile One'),
  ('78000000-0000-4000-8000-000000000100', 'reconcile-two', 'Reconcile Two');
insert into loyalty.organization_memberships (
  organization_id, user_id, role, revoked_at
)
values
  ((select id from loyalty.organizations where slug = 'reconcile-one'), '77000000-0000-4000-8000-000000000001', 'owner', null),
  ((select id from loyalty.organizations where slug = 'reconcile-one'), '77000000-0000-4000-8000-000000000002', 'operator', null),
  ((select id from loyalty.organizations where slug = 'reconcile-one'), '77000000-0000-4000-8000-000000000003', 'analyst', null),
  ((select id from loyalty.organizations where slug = 'reconcile-one'), '77000000-0000-4000-8000-000000000004', 'auditor', null),
  ((select id from loyalty.organizations where slug = 'reconcile-one'), '77000000-0000-4000-8000-000000000005', 'admin', now()),
  ((select id from loyalty.organizations where slug = 'reconcile-two'), '78000000-0000-4000-8000-000000000001', 'owner', null);
insert into loyalty.workspaces (organization_id, slug, name)
select id, 'shop', name || ' Shop'
from loyalty.organizations
where slug in ('reconcile-one', 'reconcile-two');
insert into loyalty.commerce_connections (
  public_id, organization_id, workspace_id, external_store_id, display_name,
  current_key_version, signing_material_ref, last_seen_at
)
select
  case organization.slug
    when 'reconcile-one' then '77000000-0000-4000-8000-000000000101'::uuid
    else '78000000-0000-4000-8000-000000000101'::uuid
  end,
  organization.id, workspace.id, organization.slug || '-store',
  organization.name || ' Store', 'v1', 'vault://' || organization.slug, now()
from loyalty.organizations as organization
join loyalty.workspaces as workspace
  on workspace.organization_id = organization.id
where organization.slug in ('reconcile-one', 'reconcile-two');

set local role authenticated;
set local request.jwt.claim.sub = '77000000-0000-4000-8000-000000000001';

select results_eq(
  $$ select outcome from loyalty.request_connector_reconciliation_command(
    '77000000-0000-4000-8000-000000000101', '42',
    'Completed order effect is missing after review',
    'connector:order:reconcile:one',
    '77000000-0000-4000-8000-000000000201'
  ) $$,
  array['created'::text],
  'owner can queue one source-order reconciliation'
);
select results_eq(
  $$ select command_state from loyalty.request_connector_reconciliation_command(
    '77000000-0000-4000-8000-000000000101', '42',
    'Completed order effect is missing after review',
    'connector:order:reconcile:one',
    '77000000-0000-4000-8000-000000000202'
  ) $$,
  array['pending'::text],
  'an exact duplicate reports its current pending command state'
);
reset role;

select results_eq(
  $$ select topic from loyalty_private.transactional_outbox
     where command_id = (
       select resource_public_id from loyalty.admin_audit_events
       where idempotency_key = 'connector:order:reconcile:one'
     ) $$,
  array['woocommerce.order.reconcile'::text],
  'the durable outbox uses the versioned reconciliation topic'
);
select results_eq(
  $$ select payload from loyalty_private.transactional_outbox
     where command_id = (
       select resource_public_id from loyalty.admin_audit_events
       where idempotency_key = 'connector:order:reconcile:one'
     ) $$,
  array['{"kind":"reconcile_order","orderId":"42"}'::jsonb],
  'the command payload contains only the source-order instruction'
);
select results_eq(
  $$ select actor_user_id from loyalty.admin_audit_events
     where idempotency_key = 'connector:order:reconcile:one' $$,
  array['77000000-0000-4000-8000-000000000001'::uuid],
  'the audit actor derives from the live Auth request'
);
select results_eq(
  $$ select metadata ->> 'orderId' from loyalty.admin_audit_events
     where idempotency_key = 'connector:order:reconcile:one' $$,
  array['42'::text],
  'audit evidence retains the reviewed source order ID'
);
select results_eq(
  $$ select metadata ->> 'reason' from loyalty.admin_audit_events
     where idempotency_key = 'connector:order:reconcile:one' $$,
  array['Completed order effect is missing after review'::text],
  'audit evidence retains the bounded merchant reason'
);

create temporary table reconciliation_claim as
select * from loyalty_private.claim_woocommerce_commands(
  '77000000-0000-4000-8000-000000000101', 10, 60
);
select results_eq(
  $$ select count(*)::bigint from reconciliation_claim $$,
  array[1::bigint],
  'the connector claims exactly one ready reconciliation command'
);
select results_eq(
  $$ select topic from reconciliation_claim $$,
  array['woocommerce.order.reconcile'::text],
  'the signed delivery retains the reconciliation topic'
);
select results_eq(
  $$ select payload from reconciliation_claim $$,
  array['{"kind":"reconcile_order","orderId":"42"}'::jsonb],
  'the claimed delivery retains its versioned payload'
);
select results_eq(
  $$ select attempt_count from reconciliation_claim $$,
  array[1],
  'claiming increments the bounded delivery attempt counter'
);
select is_empty(
  $$ select * from loyalty_private.claim_woocommerce_commands(
    '77000000-0000-4000-8000-000000000101', 10, 60
  ) $$,
  'the active lease prevents a duplicate concurrent claim'
);
select throws_ok(
  $$ select * from loyalty_private.finish_woocommerce_command(
    '78000000-0000-4000-8000-000000000101',
    (select command_id from reconciliation_claim), 'delivered',
    'woocommerce:order:42', null, 0
  ) $$,
  '22023', 'unknown connector command',
  'another connector cannot acknowledge the leased command'
);
select results_eq(
  $$ select outcome from loyalty_private.finish_woocommerce_command(
    '77000000-0000-4000-8000-000000000101',
    (select command_id from reconciliation_claim), 'delivered',
    'woocommerce:order:42', null, 0
  ) $$,
  array['delivered'::text],
  'the connector can acknowledge a successful source reconciliation'
);
select results_eq(
  $$ select state from loyalty_private.transactional_outbox
     where command_id = (select command_id from reconciliation_claim) $$,
  array['delivered'::text],
  'the durable command records terminal delivery'
);
select results_eq(
  $$ select payload ->> 'connectorExecutionReference'
     from loyalty_private.transactional_outbox
     where command_id = (select command_id from reconciliation_claim) $$,
  array['woocommerce:order:42'::text],
  'the acknowledgement records a non-sensitive source reference'
);

set local role authenticated;
set local request.jwt.claim.sub = '77000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select outcome || ':' || command_state
     from loyalty.request_connector_reconciliation_command(
       '77000000-0000-4000-8000-000000000101', '42',
       'Completed order effect is missing after review',
       'connector:order:reconcile:one',
       '77000000-0000-4000-8000-000000000203'
     ) $$,
  array['duplicate:delivered'::text],
  'an exact retry returns the original terminal command state'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.admin_audit_events
     where idempotency_key = 'connector:order:reconcile:one' $$,
  array[1::bigint],
  'an idempotent retry creates no second audit event'
);
reset role;
select results_eq(
  $$ select count(*)::bigint from loyalty_private.transactional_outbox
     where topic = 'woocommerce.order.reconcile'
       and organization_id = (
         select id from loyalty.organizations where slug = 'reconcile-one'
       ) $$,
  array[1::bigint],
  'an idempotent retry creates no second connector command'
);

insert into loyalty_private.transactional_outbox (
  command_id, organization_id, connection_id, topic, payload_version,
  payload, state, attempt_count, available_at, last_error_code
)
select command.command_id, organization.id, connection.id, command.topic, 'v1',
  '{}'::jsonb, 'retryable', 9, clock_timestamp(), 'transient_failure'
from loyalty.organizations as organization
join loyalty.commerce_connections as connection
  on connection.organization_id = organization.id
cross join (values
  ('77000000-0000-4000-8000-000000000301'::uuid, 'woocommerce.coupon.issue'),
  ('77000000-0000-4000-8000-000000000302'::uuid, 'woocommerce.coupon.cancel'),
  ('77000000-0000-4000-8000-000000000303'::uuid, 'woocommerce.order.reconcile')
) as command(command_id, topic)
where organization.slug = 'reconcile-one';

create temporary table exhaustion_claim as
select * from loyalty_private.claim_woocommerce_commands(
  '77000000-0000-4000-8000-000000000101', 10, 60
);
select results_eq(
  $$ select count(*)::bigint from exhaustion_claim $$,
  array[3::bigint],
  'all supported command kinds receive their tenth and final automatic claim'
);
select results_eq(
  $$ select min(attempt_count), max(attempt_count) from exhaustion_claim $$,
  $$ values (10, 10) $$,
  'the attempt ceiling is applied consistently at the claim boundary'
);
select * from loyalty_private.finish_woocommerce_command(
  '77000000-0000-4000-8000-000000000101',
  '77000000-0000-4000-8000-000000000301',
  'retryable', null, 'transient_failure', 60
);
select * from loyalty_private.finish_woocommerce_command(
  '77000000-0000-4000-8000-000000000101',
  '77000000-0000-4000-8000-000000000302',
  'retryable', null, 'transient_failure', 60
);
select * from loyalty_private.finish_woocommerce_command(
  '77000000-0000-4000-8000-000000000101',
  '77000000-0000-4000-8000-000000000303',
  'retryable', null, 'transient_failure', 60
);
select results_eq(
  $$ select count(*)::bigint from loyalty_private.transactional_outbox
     where command_id between
       '77000000-0000-4000-8000-000000000301'::uuid and
       '77000000-0000-4000-8000-000000000303'::uuid
       and state = 'manual_review' $$,
  array[3::bigint],
  'retry exhaustion terminalizes issue, cancellation, and reconciliation safely'
);
select results_eq(
  $$ select count(*)::bigint from loyalty_private.transactional_outbox
     where command_id between
       '77000000-0000-4000-8000-000000000301'::uuid and
       '77000000-0000-4000-8000-000000000303'::uuid
       and lease_owner is null and lease_expires_at is null
       and last_error_code = 'transient_failure' $$,
  array[3::bigint],
  'manual-review commands retain diagnostics and release their leases'
);
select is_empty(
  $$ select * from loyalty_private.claim_woocommerce_commands(
    '77000000-0000-4000-8000-000000000101', 10, 60
  ) $$,
  'manual-review commands cannot be claimed again automatically'
);
set local role authenticated;
set local request.jwt.claim.sub = '77000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select commands_failed from loyalty.get_connector_operation_summaries(
    '77000000-0000-4000-8000-000000000100'
  ) $$,
  array[3::bigint],
  'merchant diagnostics count exhausted commands as failed attention items'
);
select results_eq(
  $$ select count(*)::bigint
     from loyalty.get_connector_operation_issues(
       '77000000-0000-4000-8000-000000000101', 25
     )
     where item_kind = 'command' and state = 'manual_review'
       and not retry_allowed $$,
  array[3::bigint],
  'merchant diagnostics expose manual review without an unsafe retry action'
);
reset role;

insert into loyalty_private.transactional_outbox (
  command_id, organization_id, connection_id, topic, payload_version,
  payload, state, attempt_count, lease_owner, lease_expires_at
)
select '77000000-0000-4000-8000-000000000304', organization.id,
  connection.id, 'woocommerce.order.reconcile', 'v1', '{}'::jsonb,
  'processing', 10, 'woocommerce:77000000-0000-4000-8000-000000000101',
  clock_timestamp() - interval '1 minute'
from loyalty.organizations as organization
join loyalty.commerce_connections as connection
  on connection.organization_id = organization.id
where organization.slug = 'reconcile-one';
select is_empty(
  $$ select * from loyalty_private.claim_woocommerce_commands(
    '77000000-0000-4000-8000-000000000101', 10, 60
  ) $$,
  'an expired lease at the ceiling is not reclaimed'
);
select results_eq(
  $$ select state, last_error_code, lease_owner
     from loyalty_private.transactional_outbox
     where command_id = '77000000-0000-4000-8000-000000000304' $$,
  $$ values ('manual_review'::text, 'command_attempts_exhausted'::text, null::text) $$,
  'expired ceiling leases stop with a visible exhaustion diagnostic'
);
set local role authenticated;
set local request.jwt.claim.sub = '77000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select * from loyalty.request_connector_reconciliation_command(
    '77000000-0000-4000-8000-000000000101', '43',
    'Completed order effect is missing after review',
    'connector:order:reconcile:one',
    '77000000-0000-4000-8000-000000000204'
  ) $$,
  '23514', 'reconciliation command idempotency conflict',
  'changed source order content conflicts under one idempotency key'
);

set local request.jwt.claim.sub = '77000000-0000-4000-8000-000000000002';
select results_eq(
  $$ select outcome from loyalty.request_connector_reconciliation_command(
    '77000000-0000-4000-8000-000000000101', '44',
    'Operator reviewed missing order effect',
    'connector:order:reconcile:operator',
    '77000000-0000-4000-8000-000000000205'
  ) $$,
  array['created'::text],
  'operator can request a source reconciliation'
);

set local request.jwt.claim.sub = '77000000-0000-4000-8000-000000000003';
select throws_ok(
  $$ select * from loyalty.request_connector_reconciliation_command(
    '77000000-0000-4000-8000-000000000101', '45',
    'Analyst requested source reconciliation',
    'connector:order:reconcile:analyst',
    '77000000-0000-4000-8000-000000000206'
  ) $$,
  '42501', 'reconciliation command not authorized',
  'analyst cannot mutate connector queues'
);
set local request.jwt.claim.sub = '77000000-0000-4000-8000-000000000004';
select throws_ok(
  $$ select * from loyalty.request_connector_reconciliation_command(
    '77000000-0000-4000-8000-000000000101', '45',
    'Auditor requested source reconciliation',
    'connector:order:reconcile:auditor',
    '77000000-0000-4000-8000-000000000207'
  ) $$,
  '42501', 'reconciliation command not authorized',
  'auditor remains read-only'
);
set local request.jwt.claim.sub = '77000000-0000-4000-8000-000000000005';
select throws_ok(
  $$ select * from loyalty.request_connector_reconciliation_command(
    '77000000-0000-4000-8000-000000000101', '45',
    'Revoked admin requested reconciliation',
    'connector:order:reconcile:revoked',
    '77000000-0000-4000-8000-000000000208'
  ) $$,
  '42501', 'reconciliation command not authorized',
  'revoked membership fails closed with a live token'
);
set local request.jwt.claim.sub = '78000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select * from loyalty.request_connector_reconciliation_command(
    '77000000-0000-4000-8000-000000000101', '45',
    'Other tenant requested reconciliation',
    'connector:order:reconcile:cross',
    '77000000-0000-4000-8000-000000000209'
  ) $$,
  '42501', 'reconciliation command not authorized',
  'another tenant owner cannot mutate this connector'
);
set local request.jwt.claim.sub = '77000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select * from loyalty.request_connector_reconciliation_command(
    '77000000-0000-4000-8000-000000000101', '0',
    'Invalid source order was reviewed',
    'connector:order:reconcile:invalid-order',
    '77000000-0000-4000-8000-000000000210'
  ) $$,
  '22023', 'invalid reconciliation command',
  'zero and non-canonical order identifiers are rejected'
);
select throws_ok(
  $$ select * from loyalty.request_connector_reconciliation_command(
    '77000000-0000-4000-8000-000000000101', '46',
    ' reason has outer space ',
    'connector:order:reconcile:space',
    '77000000-0000-4000-8000-000000000211'
  ) $$,
  '22023', 'invalid reconciliation command',
  'audit reasons must already be canonically trimmed'
);
select throws_ok(
  $query$ select * from loyalty.request_connector_reconciliation_command(
    '77000000-0000-4000-8000-000000000101', '46',
    E'Unsafe\nreason text',
    'connector:order:reconcile:control',
    '77000000-0000-4000-8000-000000000212'
  ) $query$,
  '22023', 'invalid reconciliation command',
  'control characters are rejected from audit reasons'
);
reset role;
update loyalty.commerce_connections set status = 'disabled'
where public_id = '77000000-0000-4000-8000-000000000101';
set local role authenticated;
set local request.jwt.claim.sub = '77000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select * from loyalty.request_connector_reconciliation_command(
    '77000000-0000-4000-8000-000000000101', '46',
    'Disabled connector reconciliation request',
    'connector:order:reconcile:disabled',
    '77000000-0000-4000-8000-000000000213'
  ) $$,
  '42501', 'reconciliation command not authorized',
  'disabled connectors cannot accept new reconciliation commands'
);
reset role;
select ok(
  not has_table_privilege(
    'authenticated', 'loyalty_private.transactional_outbox', 'INSERT'
  ),
  'browser users cannot bypass the command wrapper to write the outbox'
);
select throws_ok(
  $$ update loyalty.admin_audit_events set metadata = '{}'::jsonb
     where idempotency_key = 'connector:order:reconcile:one' $$,
  '55000', 'immutable loyalty history cannot be changed',
  'reconciliation audit evidence cannot be rewritten'
);
set local role authenticated;
set local request.jwt.claim.sub = '';
select throws_ok(
  $$ select * from loyalty.request_connector_reconciliation_command(
    '78000000-0000-4000-8000-000000000101', '46',
    'Missing request identity reconciliation',
    'connector:order:reconcile:no-actor',
    '77000000-0000-4000-8000-000000000214'
  ) $$,
  '22023', 'invalid reconciliation command',
  'a request without a verified Auth actor fails closed'
);

select * from finish();
rollback;
