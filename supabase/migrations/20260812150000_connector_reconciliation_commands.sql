-- Phase 9 source reconciliation requests. Merchant intent becomes a durable,
-- signed connector command; the plugin re-emits source facts idempotently.

create or replace function loyalty_private.claim_woocommerce_commands(
  target_connection_public_id uuid,
  target_batch_size integer default 25,
  target_lease_seconds integer default 60
)
returns table (
  outbox_id bigint,
  command_id uuid,
  connection_id uuid,
  topic text,
  payload_version text,
  payload jsonb,
  attempt_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_connection_id bigint;
begin
  if target_batch_size not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid batch size';
  end if;
  if target_lease_seconds not between 10 and 300 then
    raise exception using errcode = '22023', message = 'invalid lease duration';
  end if;
  select connection.id into target_connection_id
  from loyalty.commerce_connections as connection
  where connection.public_id = target_connection_public_id
    and connection.status in ('active', 'rotating');
  if not found then
    raise exception using errcode = '22023', message = 'unknown commerce connection';
  end if;

  return query
  with candidates as (
    select outbox.id
    from loyalty_private.transactional_outbox as outbox
    where outbox.connection_id = target_connection_id
      and outbox.topic in (
        'woocommerce.coupon.issue',
        'woocommerce.coupon.cancel',
        'woocommerce.order.reconcile'
      )
      and (
        (outbox.state in ('pending', 'retryable')
          and outbox.available_at <= clock_timestamp())
        or (outbox.state = 'processing'
          and outbox.lease_expires_at <= clock_timestamp())
      )
    order by outbox.available_at, outbox.id
    for update skip locked
    limit target_batch_size
  ), claimed as (
    update loyalty_private.transactional_outbox as outbox
    set state = 'processing',
        attempt_count = outbox.attempt_count + 1,
        lease_owner = 'woocommerce:' || target_connection_public_id::text,
        lease_expires_at = clock_timestamp()
          + pg_catalog.make_interval(secs => target_lease_seconds),
        last_error_code = null
    from candidates
    where outbox.id = candidates.id
    returning outbox.*
  )
  select claimed.id, claimed.command_id, target_connection_public_id,
    claimed.topic, claimed.payload_version, claimed.payload,
    claimed.attempt_count
  from claimed
  order by claimed.id;
end;
$$;

create or replace function loyalty.request_connector_reconciliation_command(
  target_connection_public_id uuid,
  target_order_id text,
  target_reason text,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (resource_public_id uuid, outcome text, command_state text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := loyalty_private.request_user_id();
  target_connection loyalty.commerce_connections%rowtype;
  existing_audit loyalty.admin_audit_events%rowtype;
  request_hash bytea;
  normalized_reason text := btrim(target_reason);
  created_command_id uuid;
  existing_state text;
begin
  if actor_user_id is null
    or target_connection_public_id is null
    or target_order_id is null
    or target_order_id !~ '^[1-9][0-9]{0,18}$'
    or target_reason is null
    or target_reason <> normalized_reason
    or length(normalized_reason) not between 8 and 500
    or normalized_reason ~ '[[:cntrl:]]'
    or target_idempotency_key is null
    or length(btrim(target_idempotency_key)) not between 1 and 255
    or target_idempotency_key <> btrim(target_idempotency_key)
    or target_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid reconciliation command';
  end if;

  select connection.* into target_connection
  from loyalty.commerce_connections as connection
  where connection.public_id = target_connection_public_id
    and connection.status in ('active', 'rotating')
    and loyalty_private.has_organization_role(
      connection.organization_id,
      array['owner', 'admin', 'operator']::text[]
    )
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'reconciliation command not authorized';
  end if;

  request_hash := extensions.digest(
    convert_to(
      'connector.order.reconcile|' || target_connection.public_id::text ||
      '|' || target_order_id || '|' || normalized_reason,
      'UTF8'
    ),
    'sha256'
  );
  select audit.* into existing_audit
  from loyalty.admin_audit_events as audit
  where audit.organization_id = target_connection.organization_id
    and audit.idempotency_key = target_idempotency_key;
  if found then
    if existing_audit.action <> 'connector.order.reconcile'
      or existing_audit.request_sha256 <> request_hash then
      raise exception using errcode = '23514', message = 'reconciliation command idempotency conflict';
    end if;
    select outbox.state into existing_state
    from loyalty_private.transactional_outbox as outbox
    where outbox.organization_id = target_connection.organization_id
      and outbox.command_id = existing_audit.resource_public_id;
    return query select existing_audit.resource_public_id,
      'duplicate'::text, existing_state;
    return;
  end if;

  insert into loyalty_private.transactional_outbox (
    organization_id, connection_id, topic, payload_version, payload,
    available_at
  ) values (
    target_connection.organization_id, target_connection.id,
    'woocommerce.order.reconcile', 'v1',
    jsonb_build_object('kind', 'reconcile_order', 'orderId', target_order_id),
    clock_timestamp()
  ) returning command_id into created_command_id;

  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id,
    metadata
  ) values (
    target_connection.organization_id, actor_user_id,
    'connector.order.reconcile', 'connector_command', created_command_id,
    target_idempotency_key, request_hash, target_correlation_id,
    jsonb_build_object(
      'connectionPublicId', target_connection.public_id,
      'orderId', target_order_id,
      'reason', normalized_reason
    )
  );

  return query select created_command_id, 'created'::text, 'pending'::text;
end;
$$;

alter function loyalty_private.claim_woocommerce_commands(uuid, integer, integer)
  owner to loyalty_owner;
alter function loyalty.request_connector_reconciliation_command(
  uuid, text, text, text, uuid
) owner to loyalty_owner;

revoke all on function loyalty.request_connector_reconciliation_command(
  uuid, text, text, text, uuid
) from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty.request_connector_reconciliation_command(
  uuid, text, text, text, uuid
) to authenticated;

comment on function loyalty.request_connector_reconciliation_command(
  uuid, text, text, text, uuid
) is 'Queues one audited signed WooCommerce source-order reconciliation command for a live owner/admin/operator.';
