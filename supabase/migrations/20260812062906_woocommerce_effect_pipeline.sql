-- Phase 7 durable WooCommerce business-effect processing. Signed ingestion is
-- intentionally fast; a separately credentialed worker owns leases and value
-- effects. Customer links use channel IDs only and never infer identity by email.

grant usage on schema extensions to loyalty_owner;

alter table loyalty.commerce_connections
  add column programme_id bigint,
  add foreign key (organization_id, programme_id)
    references loyalty.programmes(organization_id, id) on delete restrict;

create index commerce_connections_programme_idx
  on loyalty.commerce_connections (organization_id, programme_id, id)
  where programme_id is not null;

alter table loyalty_private.programme_evaluations
  drop constraint programme_evaluations_evaluation_kind_check,
  add constraint programme_evaluations_evaluation_kind_check
    check (evaluation_kind in (
      'live_award', 'live_refund', 'simulation', 'tier_review'
    ));

alter table loyalty_private.canonical_commerce_events
  add column effect_state text not null default 'pending'
    check (effect_state in (
      'pending', 'processing', 'applied', 'skipped', 'retryable',
      'quarantined', 'dead_letter'
    )),
  add column effect_attempt_count integer not null default 0
    check (effect_attempt_count >= 0),
  add column effect_available_at timestamptz not null default now(),
  add column effect_lease_owner text,
  add column effect_lease_expires_at timestamptz,
  add column effect_last_error_code text,
  add column effect_processed_at timestamptz,
  add constraint canonical_commerce_events_effect_lease_check check (
    (effect_lease_owner is null) = (effect_lease_expires_at is null)
  );

create index canonical_commerce_events_effect_claim_idx
  on loyalty_private.canonical_commerce_events (effect_available_at, id)
  where effect_state in ('pending', 'retryable');
create index canonical_commerce_events_effect_lease_idx
  on loyalty_private.canonical_commerce_events (effect_lease_expires_at, id)
  where effect_state = 'processing';
create index canonical_commerce_events_effect_tenant_idx
  on loyalty_private.canonical_commerce_events (organization_id, effect_state, id);

create unique index transactional_outbox_coupon_reservation_uidx
  on loyalty_private.transactional_outbox (
    organization_id, topic, (payload ->> 'reservationId')
  )
  where topic in ('woocommerce.coupon.issue', 'woocommerce.coupon.cancel');

create or replace function loyalty_private.touch_commerce_connection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update loyalty.commerce_connections
  set last_seen_at = greatest(coalesce(last_seen_at, new.last_received_at), new.last_received_at),
      updated_at = clock_timestamp()
  where id = new.connection_id and organization_id = new.organization_id;
  return new;
end;
$$;

create trigger commerce_delivery_inbox_touch_connection
after insert or update of last_received_at
on loyalty_private.commerce_delivery_inbox
for each row execute function loyalty_private.touch_commerce_connection();

create or replace function loyalty_private.claim_woocommerce_effects(
  target_worker_id text,
  target_batch_size integer default 25,
  target_lease_seconds integer default 60
)
returns table (
  canonical_event_id bigint,
  canonical_event_public_id uuid,
  organization_id bigint,
  connection_id bigint,
  programme_id bigint,
  event_type text,
  source_event_id text,
  source_object_id text,
  occurred_at timestamptz,
  payload jsonb,
  attempt_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if length(btrim(target_worker_id)) not between 1 and 200 then
    raise exception using errcode = '22023', message = 'invalid worker id';
  end if;
  if target_batch_size not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid batch size';
  end if;
  if target_lease_seconds not between 10 and 3600 then
    raise exception using errcode = '22023', message = 'invalid lease duration';
  end if;

  return query
  with candidates as (
    select event.id
    from loyalty_private.canonical_commerce_events as event
    where event.event_type in (
        'commerce.order.status_changed', 'commerce.order.refunded'
      )
      and (
        (event.effect_state in ('pending', 'retryable')
          and event.effect_available_at <= clock_timestamp())
        or (event.effect_state = 'processing'
          and event.effect_lease_expires_at <= clock_timestamp())
      )
    order by event.effect_available_at, event.id
    for update skip locked
    limit target_batch_size
  ), claimed as (
    update loyalty_private.canonical_commerce_events as event
    set effect_state = 'processing',
        effect_attempt_count = event.effect_attempt_count + 1,
        effect_lease_owner = target_worker_id,
        effect_lease_expires_at = clock_timestamp()
          + pg_catalog.make_interval(secs => target_lease_seconds),
        effect_last_error_code = null
    from candidates
    where event.id = candidates.id
    returning event.*
  )
  select claimed.id, claimed.public_id, claimed.organization_id,
    claimed.connection_id, connection.programme_id, claimed.event_type,
    claimed.source_event_id, claimed.source_object_id, claimed.occurred_at,
    claimed.payload, claimed.effect_attempt_count
  from claimed
  join loyalty.commerce_connections as connection
    on connection.organization_id = claimed.organization_id
   and connection.id = claimed.connection_id
  order by claimed.id;
end;
$$;

create or replace function loyalty_private.resolve_commerce_customer(
  target_organization_id bigint,
  target_connection_id bigint,
  target_identity_kind text,
  target_external_id text
)
returns table (customer_id bigint, customer_public_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  identity_key text;
  existing_customer_id bigint;
  existing_customer_public_id uuid;
  created_customer_id bigint;
  created_customer_public_id uuid;
begin
  if target_identity_kind not in ('registered', 'guest') then
    raise exception using errcode = '22023', message = 'invalid commerce identity kind';
  end if;
  if length(target_external_id) not between 1 and 230 then
    raise exception using errcode = '22023', message = 'invalid external customer id';
  end if;
  if not exists (
    select 1 from loyalty.commerce_connections as connection
    where connection.organization_id = target_organization_id
      and connection.id = target_connection_id
      and connection.status in ('active', 'rotating')
  ) then
    raise exception using errcode = '22023', message = 'unknown commerce connection';
  end if;

  identity_key := case target_identity_kind
    when 'registered' then 'registered:' else 'guest-order:' end
    || target_external_id;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      target_connection_id::text || ':' || identity_key,
      target_organization_id
    )
  );

  select customer.id, customer.public_id
  into existing_customer_id, existing_customer_public_id
  from loyalty.customer_identities as identity
  join loyalty.customers as customer
    on customer.organization_id = identity.organization_id
   and customer.id = identity.customer_id
  where identity.organization_id = target_organization_id
    and identity.commerce_connection_id = target_connection_id
    and identity.external_customer_id = identity_key;
  if found then
    return query select existing_customer_id, existing_customer_public_id,
      'existing'::text;
    return;
  end if;

  insert into loyalty.customers (organization_id, display_reference)
  values (target_organization_id, null)
  returning id, public_id into created_customer_id, created_customer_public_id;
  insert into loyalty.customer_identities (
    organization_id, customer_id, commerce_connection_id,
    external_customer_id, identity_kind, verified_at
  ) values (
    target_organization_id, created_customer_id, target_connection_id,
    identity_key, target_identity_kind, clock_timestamp()
  );
  return query select created_customer_id, created_customer_public_id,
    'created'::text;
end;
$$;

create or replace function loyalty_private.finish_commerce_effect(
  target_canonical_event_public_id uuid,
  target_worker_id text,
  target_outcome text,
  target_effect_kind text default null,
  target_effect_key text default null,
  target_result_reference text default null,
  target_error_code text default null,
  target_retry_delay_seconds integer default 0
)
returns table (effect_public_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_event loyalty_private.canonical_commerce_events%rowtype;
  resulting_effect_public_id uuid;
begin
  if target_outcome not in (
    'applied', 'skipped', 'retryable', 'quarantined', 'dead_letter'
  ) then
    raise exception using errcode = '22023', message = 'invalid effect outcome';
  end if;
  if target_retry_delay_seconds < 0 or target_retry_delay_seconds > 86400 then
    raise exception using errcode = '22023', message = 'invalid retry delay';
  end if;

  select event.* into target_event
  from loyalty_private.canonical_commerce_events as event
  where event.public_id = target_canonical_event_public_id
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'unknown canonical commerce event';
  end if;
  if target_event.effect_state <> 'processing'
    or target_event.effect_lease_owner <> target_worker_id
    or target_event.effect_lease_expires_at <= clock_timestamp() then
    raise exception using errcode = '55000', message = 'commerce effect lease is not owned';
  end if;

  if target_outcome = 'applied' then
    if target_effect_kind is null or target_effect_key is null then
      raise exception using errcode = '22023', message = 'applied effect requires a fence';
    end if;
    insert into loyalty_private.commerce_business_effects (
      organization_id, event_id, effect_kind, effect_key, result_reference
    ) values (
      target_event.organization_id, target_event.id, target_effect_kind,
      target_effect_key, target_result_reference
    )
    on conflict (organization_id, event_id, effect_kind, effect_key) do update
      set result_reference = commerce_business_effects.result_reference
    returning public_id into resulting_effect_public_id;
  end if;

  update loyalty_private.canonical_commerce_events
  set effect_state = target_outcome,
      effect_available_at = case when target_outcome = 'retryable'
        then clock_timestamp()
          + pg_catalog.make_interval(secs => target_retry_delay_seconds)
        else effect_available_at end,
      effect_lease_owner = null,
      effect_lease_expires_at = null,
      effect_last_error_code = target_error_code,
      effect_processed_at = case when target_outcome in ('applied', 'skipped')
        then clock_timestamp() else effect_processed_at end
  where id = target_event.id;

  return query select resulting_effect_public_id, target_outcome;
end;
$$;

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
        'woocommerce.coupon.issue', 'woocommerce.coupon.cancel'
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

create or replace function loyalty_private.enqueue_woocommerce_coupon_issue(
  target_reservation_public_id uuid,
  target_connection_public_id uuid,
  target_currency_minor_unit_digits smallint default 2
)
returns table (command_id uuid, coupon_code text, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_reservation loyalty.reward_reservations%rowtype;
  target_connection loyalty.commerce_connections%rowtype;
  target_reward loyalty.programme_rewards%rowtype;
  external_customer_id text;
  created_command_id uuid;
  created_coupon_code text;
begin
  if target_currency_minor_unit_digits not between 0 and 6 then
    raise exception using errcode = '22023', message = 'invalid currency minor unit digits';
  end if;
  select reservation.* into target_reservation
  from loyalty.reward_reservations as reservation
  where reservation.public_id = target_reservation_public_id
  for update;
  if not found or target_reservation.state <> 'reserved' then
    raise exception using errcode = '22023', message = 'unknown reserved reward';
  end if;
  select connection.* into target_connection
  from loyalty.commerce_connections as connection
  join loyalty.programmes as programme
    on programme.organization_id = connection.organization_id
   and programme.id = connection.programme_id
   and programme.programme_group_id = target_reservation.programme_group_id
  where connection.public_id = target_connection_public_id
    and connection.organization_id = target_reservation.organization_id
    and connection.status in ('active', 'rotating');
  if not found then
    raise exception using errcode = '22023', message = 'connection is not bound to reward programme';
  end if;
  select reward.* into target_reward
  from loyalty.programme_rewards as reward
  where reward.id = target_reservation.reward_id
    and reward.organization_id = target_reservation.organization_id
    and reward.programme_version_id = target_reservation.programme_version_id;
  if not found or target_reward.reward_kind not in (
    'fixed_discount', 'percentage_discount', 'free_shipping'
  ) then
    raise exception using errcode = '22023', message = 'reward is not a native WooCommerce coupon';
  end if;
  if target_reward.reward_kind = 'fixed_discount'
    and coalesce(target_reward.configuration ->> 'amountMinor', '') !~ '^[1-9][0-9]*$' then
    raise exception using errcode = '22023', message = 'invalid fixed discount configuration';
  end if;
  if target_reward.reward_kind = 'percentage_discount'
    and (
      coalesce(target_reward.configuration ->> 'percentageBasisPoints', '') !~ '^[1-9][0-9]*$'
      or (target_reward.configuration ->> 'percentageBasisPoints')::integer > 10000
    ) then
    raise exception using errcode = '22023', message = 'invalid percentage discount configuration';
  end if;
  select pg_catalog.substr(identity.external_customer_id, 12)
  into external_customer_id
  from loyalty.wallets as wallet
  join loyalty.customer_identities as identity
    on identity.organization_id = wallet.organization_id
   and identity.customer_id = wallet.customer_id
   and identity.commerce_connection_id = target_connection.id
   and identity.identity_kind = 'registered'
   and identity.external_customer_id like 'registered:%'
  where wallet.id = target_reservation.wallet_id
    and wallet.organization_id = target_reservation.organization_id
  limit 1;
  if external_customer_id is null or length(external_customer_id) = 0 then
    raise exception using errcode = '22023', message = 'registered WooCommerce identity required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      target_reservation.public_id::text || ':woocommerce-coupon',
      target_reservation.organization_id
    )
  );
  select outbox.command_id, outbox.payload ->> 'code'
  into created_command_id, created_coupon_code
  from loyalty_private.transactional_outbox as outbox
  where outbox.organization_id = target_reservation.organization_id
    and outbox.topic = 'woocommerce.coupon.issue'
    and outbox.payload ->> 'reservationId' = target_reservation.public_id::text;
  if found then
    return query select created_command_id, created_coupon_code, 'duplicate'::text;
    return;
  end if;

  created_coupon_code := 'SF' || pg_catalog.upper(
    pg_catalog.encode(extensions.gen_random_bytes(16), 'hex')
  );
  insert into loyalty_private.transactional_outbox (
    organization_id, connection_id, topic, payload_version, payload
  ) values (
    target_reservation.organization_id,
    target_connection.id,
    'woocommerce.coupon.issue',
    'v1',
    pg_catalog.jsonb_build_object(
      'kind', 'issue_coupon',
      'reservationId', target_reservation.public_id,
      'code', created_coupon_code,
      'externalCustomerId', external_customer_id,
      'expiresAt', target_reservation.expires_at,
      'reward', case target_reward.reward_kind
        when 'fixed_discount' then pg_catalog.jsonb_build_object(
          'kind', 'fixed_discount',
          'amountMinor', target_reward.configuration ->> 'amountMinor',
          'currencyMinorUnitDigits', target_currency_minor_unit_digits
        )
        when 'percentage_discount' then pg_catalog.jsonb_build_object(
          'kind', 'percentage_discount',
          'percentageBasisPoints', (target_reward.configuration ->> 'percentageBasisPoints')::integer,
          'maximumDiscountMinor', target_reward.configuration ->> 'maximumDiscountMinor',
          'currencyMinorUnitDigits', target_currency_minor_unit_digits
        )
        else pg_catalog.jsonb_build_object('kind', 'free_shipping')
      end
    )
  ) returning transactional_outbox.command_id into created_command_id;
  return query select created_command_id, created_coupon_code, 'created'::text;
end;
$$;

create or replace function loyalty_private.finish_woocommerce_command(
  target_connection_public_id uuid,
  target_command_id uuid,
  target_outcome text,
  target_result_reference text default null,
  target_error_code text default null,
  target_retry_delay_seconds integer default 0
)
returns table (command_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_connection_id bigint;
  target_outbox loyalty_private.transactional_outbox%rowtype;
begin
  if target_outcome not in ('delivered', 'retryable', 'dead_letter', 'cancelled') then
    raise exception using errcode = '22023', message = 'invalid command outcome';
  end if;
  if target_retry_delay_seconds < 0 or target_retry_delay_seconds > 86400 then
    raise exception using errcode = '22023', message = 'invalid retry delay';
  end if;
  select connection.id into target_connection_id
  from loyalty.commerce_connections as connection
  where connection.public_id = target_connection_public_id
    and connection.status in ('active', 'rotating');
  if not found then
    raise exception using errcode = '22023', message = 'unknown commerce connection';
  end if;
  select outbox.* into target_outbox
  from loyalty_private.transactional_outbox as outbox
  where outbox.command_id = target_command_id
    and outbox.connection_id = target_connection_id
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'unknown connector command';
  end if;
  if target_outbox.state <> 'processing'
    or target_outbox.lease_owner <> 'woocommerce:' || target_connection_public_id::text
    or target_outbox.lease_expires_at <= clock_timestamp() then
    raise exception using errcode = '55000', message = 'connector command lease is not owned';
  end if;
  if target_outcome = 'delivered'
    and target_outbox.topic = 'woocommerce.coupon.issue' then
    perform * from loyalty_private.transition_reward_reservation(
      (target_outbox.payload ->> 'reservationId')::uuid,
      'issued',
      'woocommerce:command:' || target_command_id::text || ':issued',
      extensions.digest(
        pg_catalog.convert_to(
          target_command_id::text || ':' || coalesce(target_result_reference, ''),
          'UTF8'
        ),
        'sha256'
      ),
      'woocommerce-connector',
      null,
      null,
      target_result_reference
    );
  end if;
  update loyalty_private.transactional_outbox
  set state = target_outcome,
      payload = case when target_result_reference is null then payload
        else payload || pg_catalog.jsonb_build_object(
          'connectorExecutionReference', target_result_reference
        ) end,
      available_at = case when target_outcome = 'retryable'
        then clock_timestamp()
          + pg_catalog.make_interval(secs => target_retry_delay_seconds)
        else available_at end,
      lease_owner = null,
      lease_expires_at = null,
      last_error_code = target_error_code,
      delivered_at = case when target_outcome = 'delivered'
        then clock_timestamp() else delivered_at end
  where id = target_outbox.id;
  return query select target_command_id, target_outcome;
end;
$$;

alter function loyalty_private.claim_woocommerce_effects(text, integer, integer)
  owner to loyalty_owner;
alter function loyalty_private.touch_commerce_connection() owner to loyalty_owner;
alter function loyalty_private.resolve_commerce_customer(bigint, bigint, text, text)
  owner to loyalty_owner;
alter function loyalty_private.finish_commerce_effect(
  uuid, text, text, text, text, text, text, integer
) owner to loyalty_owner;
alter function loyalty_private.claim_woocommerce_commands(uuid, integer, integer)
  owner to loyalty_owner;
alter function loyalty_private.enqueue_woocommerce_coupon_issue(uuid, uuid, smallint)
  owner to loyalty_owner;
alter function loyalty_private.finish_woocommerce_command(
  uuid, uuid, text, text, text, integer
) owner to loyalty_owner;

revoke all on function loyalty_private.claim_woocommerce_effects(text, integer, integer)
  from public, anon, authenticated, loyalty_runtime;
revoke all on function loyalty_private.touch_commerce_connection()
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function loyalty_private.resolve_commerce_customer(bigint, bigint, text, text)
  from public, anon, authenticated, loyalty_runtime;
revoke all on function loyalty_private.finish_commerce_effect(
  uuid, text, text, text, text, text, text, integer
) from public, anon, authenticated, loyalty_runtime;
revoke all on function loyalty_private.claim_woocommerce_commands(uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function loyalty_private.enqueue_woocommerce_coupon_issue(uuid, uuid, smallint)
  from public, anon, authenticated, loyalty_runtime;
revoke all on function loyalty_private.finish_woocommerce_command(
  uuid, uuid, text, text, text, integer
) from public, anon, authenticated;
grant execute on function loyalty_private.claim_woocommerce_effects(text, integer, integer)
  to loyalty_worker;
grant execute on function loyalty_private.resolve_commerce_customer(bigint, bigint, text, text)
  to loyalty_worker;
grant execute on function loyalty_private.finish_commerce_effect(
  uuid, text, text, text, text, text, text, integer
) to loyalty_worker;
grant execute on function loyalty_private.claim_woocommerce_commands(uuid, integer, integer)
  to loyalty_runtime;
grant execute on function loyalty_private.enqueue_woocommerce_coupon_issue(uuid, uuid, smallint)
  to loyalty_worker;
grant execute on function loyalty_private.finish_woocommerce_command(
  uuid, uuid, text, text, text, integer
) to loyalty_runtime;

comment on column loyalty.commerce_connections.programme_id is
  'Explicit programme binding for connector effects; workers never guess across programmes.';
comment on column loyalty_private.canonical_commerce_events.effect_state is
  'Durable lease/retry state for asynchronous business effects after normalization.';
comment on function loyalty_private.resolve_commerce_customer(bigint, bigint, text, text) is
  'Resolves signed channel identity without accepting or comparing email or other PII.';
