-- Release-review hardening for bounded connector retries and native reward
-- compatibility. Ambiguous coupon execution exhausts into manual review; it
-- never reuses definitive dead-letter compensation without proof of absence.

alter table loyalty_private.transactional_outbox
  drop constraint transactional_outbox_state_check;
alter table loyalty_private.transactional_outbox
  add constraint transactional_outbox_state_check
  check (state in (
    'pending', 'processing', 'delivered', 'retryable', 'manual_review',
    'dead_letter', 'cancelled'
  ));

drop index loyalty_private.transactional_outbox_connector_operations_idx;
create index transactional_outbox_connector_operations_idx
  on loyalty_private.transactional_outbox (
    organization_id, connection_id, state, id desc
  )
  where state in (
    'pending', 'processing', 'retryable', 'manual_review', 'dead_letter'
  );

create or replace function loyalty_private.bound_woocommerce_command_retry()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.state = 'processing'
    and new.state = 'retryable'
    and new.topic in (
      'woocommerce.coupon.issue',
      'woocommerce.coupon.cancel',
      'woocommerce.order.reconcile'
    )
    and old.attempt_count >= 10 then
    new.state := 'manual_review';
  end if;
  return new;
end;
$$;

create trigger transactional_outbox_retry_exhaustion
before update of state on loyalty_private.transactional_outbox
for each row execute function loyalty_private.bound_woocommerce_command_retry();

update loyalty_private.transactional_outbox
set state = 'manual_review',
    lease_owner = null,
    lease_expires_at = null,
    last_error_code = coalesce(last_error_code, 'command_attempts_exhausted')
where state = 'retryable'
  and attempt_count >= 10
  and topic in (
    'woocommerce.coupon.issue',
    'woocommerce.coupon.cancel',
    'woocommerce.order.reconcile'
  );

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

  update loyalty_private.transactional_outbox as exhausted
  set state = 'manual_review',
      lease_owner = null,
      lease_expires_at = null,
      last_error_code = coalesce(
        exhausted.last_error_code,
        'command_attempts_exhausted'
      )
  where exhausted.connection_id = target_connection_id
    and exhausted.topic in (
      'woocommerce.coupon.issue',
      'woocommerce.coupon.cancel',
      'woocommerce.order.reconcile'
    )
    and exhausted.attempt_count >= 10
    and (
      exhausted.state = 'retryable'
      or (
        exhausted.state = 'processing'
        and exhausted.lease_expires_at <= clock_timestamp()
      )
    );

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
      and outbox.attempt_count < 10
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

create or replace function loyalty_private.reject_unsupported_reward_cap()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from loyalty.programme_rewards as reward
    where reward.organization_id = new.organization_id
      and reward.id = new.reward_id
      and reward.reward_kind = 'percentage_discount'
      and reward.configuration ->> 'maximumDiscountMinor' is not null
  ) then
    raise exception using errcode = '22023',
      message = 'percentage discount maximum is unsupported';
  end if;
  return new;
end;
$$;

create trigger reward_reservation_native_cap_guard
before insert on loyalty.reward_reservations
for each row execute function loyalty_private.reject_unsupported_reward_cap();

create or replace function loyalty_private.reject_unsupported_programme_reward_cap()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'draft'
    and new.status in ('published', 'scheduled')
    and pg_catalog.jsonb_typeof(new.configuration -> 'rewards') = 'array'
    and exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        new.configuration -> 'rewards'
      ) as reward(value)
      where reward.value ->> 'kind' = 'percentage_discount'
        and reward.value -> 'configuration'
          ->> 'maximumDiscountMinor' is not null
    ) then
    raise exception using errcode = '22023',
      message = 'percentage discount maximum is unsupported';
  end if;
  return new;
end;
$$;

create trigger programme_version_native_cap_guard
before update of status on loyalty.programme_versions
for each row execute function loyalty_private.reject_unsupported_programme_reward_cap();

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
      count(*) filter (
        where command.state in ('manual_review', 'dead_letter')
      )::bigint as failed
    from loyalty_private.transactional_outbox as command
    where command.organization_id = connection.organization_id
      and command.connection_id = connection.id
      and command.state in (
        'pending', 'processing', 'retryable', 'manual_review', 'dead_letter'
      )
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
      and outbox.state in ('retryable', 'manual_review', 'dead_letter')
  ) as issue (
    item_kind, item_public_id, state, error_code, attempt_count,
    operation_kind, observed_at, retry_allowed
  )
  order by issue.observed_at desc, issue.item_public_id
  limit target_limit;
end;
$$;

alter function loyalty_private.bound_woocommerce_command_retry()
  owner to loyalty_owner;
alter function loyalty_private.reject_unsupported_reward_cap()
  owner to loyalty_owner;
alter function loyalty_private.reject_unsupported_programme_reward_cap()
  owner to loyalty_owner;
alter function loyalty_private.claim_woocommerce_commands(uuid, integer, integer)
  owner to loyalty_owner;
alter function loyalty.get_connector_operation_summaries(uuid)
  owner to loyalty_owner;
alter function loyalty.get_connector_operation_issues(uuid, integer)
  owner to loyalty_owner;

revoke all on function loyalty_private.bound_woocommerce_command_retry()
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function loyalty_private.reject_unsupported_reward_cap()
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function loyalty_private.reject_unsupported_programme_reward_cap()
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

comment on function loyalty_private.bound_woocommerce_command_retry() is
  'Stops ambiguous WooCommerce command retries at ten attempts for manual review without assuming a coupon was absent or releasing reserved value.';
comment on function loyalty_private.reject_unsupported_reward_cap() is
  'Rejects percentage reward reservations whose maximum cannot be represented by the native WooCommerce coupon boundary.';
comment on function loyalty_private.reject_unsupported_programme_reward_cap() is
  'Prevents publication or scheduling of a percentage reward maximum that the native WooCommerce coupon boundary cannot enforce.';
