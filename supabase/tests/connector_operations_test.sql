begin;

create extension if not exists pgtap with schema extensions;

select plan(38);

select ok(
  has_function_privilege(
    'authenticated', 'loyalty.get_connector_operation_summaries(uuid)', 'EXECUTE'
  ),
  'authenticated members can enter the connector summary wrapper'
);
select ok(
  has_function_privilege(
    'authenticated', 'loyalty.get_connector_operation_issues(uuid,integer)', 'EXECUTE'
  ),
  'authenticated members can enter the bounded connector issue wrapper'
);
select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.retry_connector_effect_command(uuid,text,text,uuid)', 'EXECUTE'
  ),
  'authenticated users can enter the guarded effect retry command'
);
select ok(
  not has_function_privilege(
    'anon', 'loyalty.retry_connector_effect_command(uuid,text,text,uuid)', 'EXECUTE'
  ),
  'anonymous users cannot enter connector retry commands'
);
select ok(
  not has_table_privilege(
    'authenticated', 'loyalty_private.canonical_commerce_events', 'SELECT'
  ),
  'browser users cannot read private canonical event payloads'
);
select has_index(
  'loyalty_private', 'commerce_delivery_inbox',
  'commerce_delivery_inbox_connector_operations_idx',
  'connector delivery operations use a tenant and state index'
);
select has_index(
  'loyalty_private', 'canonical_commerce_events',
  'canonical_commerce_events_connector_operations_idx',
  'connector effect operations use a tenant and state index'
);
select has_index(
  'loyalty_private', 'transactional_outbox',
  'transactional_outbox_connector_operations_idx',
  'connector command operations use a tenant and state index'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'loyalty'
      and routine.proname in (
        'get_connector_operation_summaries',
        'get_connector_operation_issues',
        'retry_connector_effect_command'
      )
      and routine.prosecdef
  $$,
  array[3::bigint],
  'all connector operation wrappers are security definer functions'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'loyalty'
      and routine.proname in (
        'get_connector_operation_summaries',
        'get_connector_operation_issues',
        'retry_connector_effect_command'
      )
      and exists (
        select 1 from unnest(routine.proconfig) as setting
        where setting = 'search_path=""'
      )
  $$,
  array[3::bigint],
  'connector operation wrappers pin an empty search path'
);

insert into auth.users (id, email)
values
  ('73000000-0000-4000-8000-000000000001', 'ops-owner@example.test'),
  ('73000000-0000-4000-8000-000000000002', 'ops-operator@example.test'),
  ('73000000-0000-4000-8000-000000000003', 'ops-analyst@example.test'),
  ('73000000-0000-4000-8000-000000000004', 'ops-auditor@example.test'),
  ('73000000-0000-4000-8000-000000000005', 'ops-revoked@example.test'),
  ('74000000-0000-4000-8000-000000000001', 'ops-other@example.test');

insert into loyalty.organizations (public_id, slug, name)
values
  ('73000000-0000-4000-8000-000000000100', 'connector-ops-one', 'Connector Ops One'),
  ('74000000-0000-4000-8000-000000000100', 'connector-ops-two', 'Connector Ops Two');
insert into loyalty.organization_memberships (
  organization_id, user_id, role, revoked_at
)
values
  ((select id from loyalty.organizations where slug = 'connector-ops-one'), '73000000-0000-4000-8000-000000000001', 'owner', null),
  ((select id from loyalty.organizations where slug = 'connector-ops-one'), '73000000-0000-4000-8000-000000000002', 'operator', null),
  ((select id from loyalty.organizations where slug = 'connector-ops-one'), '73000000-0000-4000-8000-000000000003', 'analyst', null),
  ((select id from loyalty.organizations where slug = 'connector-ops-one'), '73000000-0000-4000-8000-000000000004', 'auditor', null),
  ((select id from loyalty.organizations where slug = 'connector-ops-one'), '73000000-0000-4000-8000-000000000005', 'admin', now()),
  ((select id from loyalty.organizations where slug = 'connector-ops-two'), '74000000-0000-4000-8000-000000000001', 'owner', null);
insert into loyalty.workspaces (organization_id, slug, name)
select id, 'shop', name || ' Shop'
from loyalty.organizations
where slug in ('connector-ops-one', 'connector-ops-two');
insert into loyalty.commerce_connections (
  public_id, organization_id, workspace_id, external_store_id, display_name,
  current_key_version, signing_material_ref, last_seen_at
)
select
  case organization.slug
    when 'connector-ops-one' then '73000000-0000-4000-8000-000000000101'::uuid
    else '74000000-0000-4000-8000-000000000101'::uuid
  end,
  organization.id, workspace.id, organization.slug || '-store',
  organization.name || ' Store', 'v1', 'vault://' || organization.slug,
  now() - interval '2 minutes'
from loyalty.organizations as organization
join loyalty.workspaces as workspace
  on workspace.organization_id = organization.id
where organization.slug in ('connector-ops-one', 'connector-ops-two');

insert into loyalty_private.commerce_delivery_inbox (
  receipt_id, organization_id, connection_id, source_delivery_id,
  envelope_version, source_event_id, event_type, source_object_id,
  occurred_at, delivered_at, key_version, nonce, body_sha256, raw_body,
  state, attempt_count, last_error_code
)
select
  ('73000000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
  organization.id, connection.id, 'delivery-' || number, '1',
  'event-' || number, 'commerce.order.status_changed', number::text,
  now(), now(), 'v1', 'nonce-' || number, repeat('a', 64),
  jsonb_build_object('privateCustomerEmail', 'never-return@example.test'),
  case number when 1 then 'dead_letter' else 'applied' end,
  number, case number when 1 then 'invalid_order' else null end
from generate_series(1, 4) as generated(number)
cross join loyalty.organizations as organization
join loyalty.commerce_connections as connection
  on connection.organization_id = organization.id
where organization.slug = 'connector-ops-one';

insert into loyalty_private.canonical_commerce_events (
  public_id, organization_id, connection_id, delivery_inbox_id,
  source_event_id, normalization_version, event_type, source_object_id,
  occurred_at, payload, effect_state, effect_attempt_count,
  effect_last_error_code
)
select
  ('73100000-0000-4000-8000-' || lpad(row_number() over (order by inbox.id)::text, 12, '0'))::uuid,
  inbox.organization_id, inbox.connection_id, inbox.id,
  inbox.source_event_id, 'v1', inbox.event_type, inbox.source_object_id,
  inbox.occurred_at,
  jsonb_build_object('privateCustomerEmail', 'never-return@example.test'),
  case row_number() over (order by inbox.id)
    when 1 then 'dead_letter'
    when 2 then 'dead_letter'
    when 3 then 'dead_letter'
    else 'quarantined'
  end,
  row_number() over (order by inbox.id)::integer,
  'worker_failure'
from loyalty_private.commerce_delivery_inbox as inbox
join loyalty.organizations as organization on organization.id = inbox.organization_id
where organization.slug = 'connector-ops-one';

insert into loyalty_private.transactional_outbox (
  command_id, organization_id, connection_id, topic, payload_version,
  payload, state, attempt_count, last_error_code
)
select '73200000-0000-4000-8000-000000000001', organization.id,
  connection.id, 'woocommerce.coupon.issue', 'v1',
  '{"kind":"issue_coupon","privateCode":"never-return"}'::jsonb,
  'dead_letter', 3, 'coupon_code_collision'
from loyalty.organizations as organization
join loyalty.commerce_connections as connection
  on connection.organization_id = organization.id
where organization.slug = 'connector-ops-one';

set local role authenticated;
set local request.jwt.claim.sub = '73000000-0000-4000-8000-000000000001';

select results_eq(
  $$ select count(*)::bigint from loyalty.get_connector_operation_summaries(
    '73000000-0000-4000-8000-000000000100'
  ) $$,
  array[1::bigint],
  'a member sees the selected tenant connector'
);
select results_eq(
  $$ select deliveries_failed from loyalty.get_connector_operation_summaries(
    '73000000-0000-4000-8000-000000000100'
  ) $$,
  array[1::bigint],
  'summary counts failed deliveries without a queue cross-product'
);
select results_eq(
  $$ select effects_failed from loyalty.get_connector_operation_summaries(
    '73000000-0000-4000-8000-000000000100'
  ) $$,
  array[4::bigint],
  'summary counts failed effects independently'
);
select results_eq(
  $$ select commands_failed from loyalty.get_connector_operation_summaries(
    '73000000-0000-4000-8000-000000000100'
  ) $$,
  array[1::bigint],
  'summary counts failed commands independently'
);
select is_empty(
  $$ select * from loyalty.get_connector_operation_summaries(
    '74000000-0000-4000-8000-000000000100'
  ) $$,
  'a member cannot enumerate another tenant connector'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.get_connector_operation_issues(
    '73000000-0000-4000-8000-000000000101', 25
  ) $$,
  array[6::bigint],
  'bounded issue view returns delivery, effect, and command failures'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.get_connector_operation_issues(
    '73000000-0000-4000-8000-000000000101', 25
  ) where item_kind = 'effect' and retry_allowed $$,
  array[3::bigint],
  'only dead-letter canonical effects are marked replayable'
);
select results_eq(
  $$ select retry_allowed from loyalty.get_connector_operation_issues(
    '73000000-0000-4000-8000-000000000101', 25
  ) where item_kind = 'command' $$,
  array[false],
  'outbound coupon dead letters are inspect-only after compensation'
);
select is_empty(
  $$
    select parameter_name
    from information_schema.parameters
    where specific_schema = 'loyalty'
      and specific_name like 'get_connector_operation_issues_%'
      and parameter_name in ('payload', 'raw_body', 'source_event_id', 'source_object_id')
  $$,
  'issue wrapper has no private payload or source identifier output'
);
select throws_ok(
  $$ select * from loyalty.get_connector_operation_issues(
    '73000000-0000-4000-8000-000000000101', 0
  ) $$,
  '22023', 'invalid connector issue limit',
  'issue limits fail closed outside the bounded range'
);

select results_eq(
  $$ select outcome from loyalty.retry_connector_effect_command(
    '73100000-0000-4000-8000-000000000001',
    'Reviewed worker failure and approved replay',
    'connector:effect:retry:one',
    '73000000-0000-4000-8000-000000000201'
  ) $$,
  array['created'::text],
  'owner can replay a dead-letter canonical effect'
);
reset role;
select results_eq(
  $$ select effect_state from loyalty_private.canonical_commerce_events
     where public_id = '73100000-0000-4000-8000-000000000001' $$,
  array['retryable'::text],
  'replay resets the effect to the worker retry queue'
);
set local role authenticated;
select results_eq(
  $$ select count(*)::bigint from loyalty.admin_audit_events
     where idempotency_key = 'connector:effect:retry:one' $$,
  array[1::bigint],
  'replay records one immutable audit event'
);
select results_eq(
  $$ select actor_user_id from loyalty.admin_audit_events
     where idempotency_key = 'connector:effect:retry:one' $$,
  array['73000000-0000-4000-8000-000000000001'::uuid],
  'audit actor comes from the live Auth request'
);
select results_eq(
  $$ select metadata ->> 'reason' from loyalty.admin_audit_events
     where idempotency_key = 'connector:effect:retry:one' $$,
  array['Reviewed worker failure and approved replay'::text],
  'audit evidence retains the bounded operator reason'
);
select results_eq(
  $$ select outcome from loyalty.retry_connector_effect_command(
    '73100000-0000-4000-8000-000000000001',
    'Reviewed worker failure and approved replay',
    'connector:effect:retry:one',
    '73000000-0000-4000-8000-000000000202'
  ) $$,
  array['duplicate'::text],
  'same idempotency identity returns the original replay outcome'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.admin_audit_events
     where idempotency_key = 'connector:effect:retry:one' $$,
  array[1::bigint],
  'idempotent replay creates no second audit event'
);
select throws_ok(
  $$ select * from loyalty.retry_connector_effect_command(
    '73100000-0000-4000-8000-000000000001',
    'A different reason must conflict',
    'connector:effect:retry:one',
    '73000000-0000-4000-8000-000000000203'
  ) $$,
  '23514', 'connector command idempotency conflict',
  'changed replay content conflicts under one idempotency key'
);
select throws_ok(
  $$ select * from loyalty.retry_connector_effect_command(
    '73100000-0000-4000-8000-000000000001',
    'Trying to replay a non-terminal effect',
    'connector:effect:retry:state',
    '73000000-0000-4000-8000-000000000204'
  ) $$,
  '23514', 'connector effect is not dead letter',
  'a fresh command cannot replay a non-dead-letter effect'
);

set local request.jwt.claim.sub = '73000000-0000-4000-8000-000000000002';
select results_eq(
  $$ select outcome from loyalty.retry_connector_effect_command(
    '73100000-0000-4000-8000-000000000002',
    'Operator reviewed the failure evidence',
    'connector:effect:retry:operator',
    '73000000-0000-4000-8000-000000000205'
  ) $$,
  array['created'::text],
  'operator role can replay a dead-letter effect'
);

set local request.jwt.claim.sub = '73000000-0000-4000-8000-000000000003';
select throws_ok(
  $$ select * from loyalty.retry_connector_effect_command(
    '73100000-0000-4000-8000-000000000003', 'Analyst requested replay',
    'connector:effect:retry:analyst', '73000000-0000-4000-8000-000000000206'
  ) $$,
  '42501', 'connector retry not authorized',
  'analyst cannot mutate connector queues'
);

set local request.jwt.claim.sub = '73000000-0000-4000-8000-000000000004';
select throws_ok(
  $$ select * from loyalty.retry_connector_effect_command(
    '73100000-0000-4000-8000-000000000003', 'Auditor requested replay',
    'connector:effect:retry:auditor', '73000000-0000-4000-8000-000000000207'
  ) $$,
  '42501', 'connector retry not authorized',
  'auditor can inspect but cannot mutate connector queues'
);

set local request.jwt.claim.sub = '73000000-0000-4000-8000-000000000005';
select throws_ok(
  $$ select * from loyalty.retry_connector_effect_command(
    '73100000-0000-4000-8000-000000000003', 'Revoked admin requested replay',
    'connector:effect:retry:revoked', '73000000-0000-4000-8000-000000000208'
  ) $$,
  '42501', 'connector retry not authorized',
  'revoked membership fails closed with a live token'
);

set local request.jwt.claim.sub = '74000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select * from loyalty.retry_connector_effect_command(
    '73100000-0000-4000-8000-000000000003', 'Other tenant requested replay',
    'connector:effect:retry:cross', '73000000-0000-4000-8000-000000000209'
  ) $$,
  '42501', 'connector retry not authorized',
  'another tenant owner cannot replay this connector effect'
);

set local request.jwt.claim.sub = '73000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select * from loyalty.retry_connector_effect_command(
    '73100000-0000-4000-8000-000000000004', 'Quarantine needs remediation first',
    'connector:effect:retry:quarantine', '73000000-0000-4000-8000-000000000210'
  ) $$,
  '23514', 'connector effect is not dead letter',
  'quarantined effects cannot bypass remediation'
);
select throws_ok(
  $query$ select * from loyalty.retry_connector_effect_command(
    '73100000-0000-4000-8000-000000000003', E'Unsafe\nreason text',
    'connector:effect:retry:control', '73000000-0000-4000-8000-000000000211'
  ) $query$,
  '22023', 'invalid connector retry command',
  'control characters are rejected from audit reasons'
);
reset role;
select results_eq(
  $$ select state from loyalty_private.transactional_outbox
     where command_id = '73200000-0000-4000-8000-000000000001' $$,
  array['dead_letter'::text],
  'merchant effect replay never changes compensated outbound commands'
);

select throws_ok(
  $$ update loyalty.admin_audit_events set metadata = '{}'::jsonb
     where idempotency_key = 'connector:effect:retry:one' $$,
  '55000', 'immutable table rows cannot be updated or deleted',
  'connector audit evidence cannot be rewritten'
);

select * from finish();
rollback;
