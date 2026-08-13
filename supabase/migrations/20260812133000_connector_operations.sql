-- Phase 9 tenant-scoped connector operations. Private queue payloads remain
-- outside the Data API; these wrappers expose only bounded operational facts.

create index commerce_delivery_inbox_connector_operations_idx
  on loyalty_private.commerce_delivery_inbox (
    organization_id, connection_id, state, id desc
  )
  where state in ('accepted', 'processing', 'retryable', 'quarantined', 'dead_letter');
create index canonical_commerce_events_connector_operations_idx
  on loyalty_private.canonical_commerce_events (
    organization_id, connection_id, effect_state, id desc
  )
  where effect_state in (
    'pending', 'processing', 'retryable', 'quarantined', 'dead_letter'
  );
create index transactional_outbox_connector_operations_idx
  on loyalty_private.transactional_outbox (
    organization_id, connection_id, state, id desc
  )
  where state in ('pending', 'processing', 'retryable', 'dead_letter');

-- Separate aggregate subqueries avoid cross-products when a connector has more
-- than one row in multiple private queues.
create or replace function loyalty.get_connector_operation_summaries(
  target_organization_public_id uuid
)
returns table (
  connection_public_id uuid,
  display_name text,
  connection_status text,
  last_seen_at timestamptz,
  deliveries_ready bigint,
  deliveries_failed bigint,
  effects_ready bigint,
  effects_failed bigint,
  commands_ready bigint,
  commands_failed bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select connection.public_id, connection.display_name, connection.status,
    connection.last_seen_at,
    coalesce(inbox.ready, 0), coalesce(inbox.failed, 0),
    coalesce(effect.ready, 0), coalesce(effect.failed, 0),
    coalesce(outbox.ready, 0), coalesce(outbox.failed, 0)
  from loyalty.organizations as organization
  join loyalty.commerce_connections as connection
    on connection.organization_id = organization.id
  left join lateral (
    select
      count(*) filter (
        where delivery.state in ('accepted', 'processing', 'retryable')
      )::bigint as ready,
      count(*) filter (
        where delivery.state in ('quarantined', 'dead_letter')
      )::bigint as failed
    from loyalty_private.commerce_delivery_inbox as delivery
    where delivery.organization_id = connection.organization_id
      and delivery.connection_id = connection.id
      and delivery.state in (
        'accepted', 'processing', 'retryable', 'quarantined', 'dead_letter'
      )
  ) as inbox on true
  left join lateral (
    select
      count(*) filter (
        where effect_event.effect_state in ('pending', 'processing', 'retryable')
      )::bigint as ready,
      count(*) filter (
        where effect_event.effect_state in ('quarantined', 'dead_letter')
      )::bigint as failed
    from loyalty_private.canonical_commerce_events as effect_event
    where effect_event.organization_id = connection.organization_id
      and effect_event.connection_id = connection.id
      and effect_event.effect_state in (
        'pending', 'processing', 'retryable', 'quarantined', 'dead_letter'
      )
  ) as effect on true
  left join lateral (
    select
      count(*) filter (
        where command.state in ('pending', 'processing', 'retryable')
      )::bigint as ready,
      count(*) filter (where command.state = 'dead_letter')::bigint as failed
    from loyalty_private.transactional_outbox as command
    where command.organization_id = connection.organization_id
      and command.connection_id = connection.id
      and command.state in ('pending', 'processing', 'retryable', 'dead_letter')
  ) as outbox on true
  where organization.public_id = target_organization_public_id
    and loyalty_private.is_organization_member(organization.id)
  order by connection.display_name, connection.id;
$$;

create or replace function loyalty.get_connector_operation_issues(
  target_connection_public_id uuid,
  target_limit integer default 25
)
returns table (
  item_kind text,
  item_public_id uuid,
  state text,
  error_code text,
  attempt_count integer,
  operation_kind text,
  observed_at timestamptz,
  retry_allowed boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_connection loyalty.commerce_connections%rowtype;
begin
  if target_limit is null or target_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid connector issue limit';
  end if;
  select connection.* into target_connection
  from loyalty.commerce_connections as connection
  where connection.public_id = target_connection_public_id
    and loyalty_private.is_organization_member(connection.organization_id);
  if not found then
    raise exception using errcode = '42501', message = 'connector operations not authorized';
  end if;

  return query
  select issue.item_kind, issue.item_public_id, issue.state,
    issue.error_code, issue.attempt_count, issue.operation_kind,
    issue.observed_at, issue.retry_allowed
  from (
    select 'delivery'::text, inbox.receipt_id, inbox.state,
      pg_catalog.substring(inbox.last_error_code, 1, 120),
      inbox.attempt_count, inbox.event_type,
      inbox.accepted_at, false
    from loyalty_private.commerce_delivery_inbox as inbox
    where inbox.organization_id = target_connection.organization_id
      and inbox.connection_id = target_connection.id
      and inbox.state in ('retryable', 'quarantined', 'dead_letter')
    union all
    select 'effect'::text, event.public_id, event.effect_state,
      pg_catalog.substring(event.effect_last_error_code, 1, 120),
      event.effect_attempt_count,
      event.event_type, event.created_at,
      event.effect_state = 'dead_letter'
    from loyalty_private.canonical_commerce_events as event
    where event.organization_id = target_connection.organization_id
      and event.connection_id = target_connection.id
      and event.effect_state in ('retryable', 'quarantined', 'dead_letter')
    union all
    select 'command'::text, outbox.command_id, outbox.state,
      pg_catalog.substring(outbox.last_error_code, 1, 120),
      outbox.attempt_count, outbox.topic,
      outbox.created_at, false
    from loyalty_private.transactional_outbox as outbox
    where outbox.organization_id = target_connection.organization_id
      and outbox.connection_id = target_connection.id
      and outbox.state in ('retryable', 'dead_letter')
  ) as issue (
    item_kind, item_public_id, state, error_code, attempt_count,
    operation_kind, observed_at, retry_allowed
  )
  order by issue.observed_at desc, issue.item_public_id
  limit target_limit;
end;
$$;

create or replace function loyalty.retry_connector_effect_command(
  target_event_public_id uuid,
  target_reason text,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (resource_public_id uuid, outcome text, effect_state text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := loyalty_private.request_user_id();
  target_event loyalty_private.canonical_commerce_events%rowtype;
  existing_audit loyalty.admin_audit_events%rowtype;
  request_hash bytea;
  normalized_reason text := btrim(target_reason);
begin
  if actor_user_id is null
    or target_event_public_id is null
    or target_correlation_id is null
    or target_idempotency_key is null
    or length(btrim(target_idempotency_key)) not between 1 and 255
    or target_idempotency_key <> btrim(target_idempotency_key)
    or target_reason is null
    or target_reason <> normalized_reason
    or length(normalized_reason) not between 8 and 500
    or normalized_reason ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'invalid connector retry command';
  end if;

  select event.* into target_event
  from loyalty_private.canonical_commerce_events as event
  where event.public_id = target_event_public_id
    and loyalty_private.has_organization_role(
      event.organization_id,
      array['owner', 'admin', 'operator']::text[]
    )
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'connector retry not authorized';
  end if;

  request_hash := extensions.digest(
    convert_to(
      'connector.effect.retry|' || target_event.public_id::text || '|' || normalized_reason,
      'UTF8'
    ),
    'sha256'
  );
  select audit.* into existing_audit
  from loyalty.admin_audit_events as audit
  where audit.organization_id = target_event.organization_id
    and audit.idempotency_key = target_idempotency_key;
  if found then
    if existing_audit.action <> 'connector.effect.retry'
      or existing_audit.request_sha256 <> request_hash then
      raise exception using errcode = '23514', message = 'connector command idempotency conflict';
    end if;
    return query select target_event.public_id, 'duplicate'::text,
      'retryable'::text;
    return;
  end if;

  if target_event.effect_state <> 'dead_letter' then
    raise exception using errcode = '23514', message = 'connector effect is not dead letter';
  end if;

  update loyalty_private.canonical_commerce_events
  set effect_state = 'retryable',
      effect_available_at = clock_timestamp(),
      effect_lease_owner = null,
      effect_lease_expires_at = null,
      effect_last_error_code = null,
      effect_processed_at = null
  where id = target_event.id;

  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id,
    metadata
  ) values (
    target_event.organization_id, actor_user_id,
    'connector.effect.retry', 'commerce_effect', target_event.public_id,
    target_idempotency_key, request_hash, target_correlation_id,
    jsonb_build_object(
      'reason', normalized_reason,
      'previousState', target_event.effect_state,
      'attemptCount', target_event.effect_attempt_count
    )
  );

  return query select target_event.public_id, 'created'::text, 'retryable'::text;
end;
$$;

alter function loyalty.get_connector_operation_summaries(uuid)
  owner to loyalty_owner;
alter function loyalty.get_connector_operation_issues(uuid, integer)
  owner to loyalty_owner;
alter function loyalty.retry_connector_effect_command(uuid, text, text, uuid)
  owner to loyalty_owner;

revoke all on function loyalty.get_connector_operation_summaries(uuid)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function loyalty.get_connector_operation_issues(uuid, integer)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function loyalty.retry_connector_effect_command(uuid, text, text, uuid)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty.get_connector_operation_summaries(uuid)
  to authenticated;
grant execute on function loyalty.get_connector_operation_issues(uuid, integer)
  to authenticated;
grant execute on function loyalty.retry_connector_effect_command(uuid, text, text, uuid)
  to authenticated;

comment on function loyalty.get_connector_operation_summaries(uuid) is
  'Returns tenant-authorized queue counts without exposing private connector payloads.';
comment on function loyalty.get_connector_operation_issues(uuid, integer) is
  'Returns bounded operational failure metadata; raw payload and source identifiers remain private.';
comment on function loyalty.retry_connector_effect_command(uuid, text, text, uuid) is
  'Audited owner/admin/operator replay for dead-letter canonical effects only; outbound coupon commands are deliberately excluded.';
