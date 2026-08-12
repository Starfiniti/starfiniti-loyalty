-- Phase 7 durable WooCommerce business-effect processing. Signed ingestion is
-- intentionally fast; a separately credentialed worker owns leases and value
-- effects. Customer links use channel IDs only and never infer identity by email.

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

alter function loyalty_private.claim_woocommerce_effects(text, integer, integer)
  owner to loyalty_owner;
alter function loyalty_private.resolve_commerce_customer(bigint, bigint, text, text)
  owner to loyalty_owner;
alter function loyalty_private.finish_commerce_effect(
  uuid, text, text, text, text, text, text, integer
) owner to loyalty_owner;

revoke all on function loyalty_private.claim_woocommerce_effects(text, integer, integer)
  from public, anon, authenticated, loyalty_runtime;
revoke all on function loyalty_private.resolve_commerce_customer(bigint, bigint, text, text)
  from public, anon, authenticated, loyalty_runtime;
revoke all on function loyalty_private.finish_commerce_effect(
  uuid, text, text, text, text, text, text, integer
) from public, anon, authenticated, loyalty_runtime;
grant execute on function loyalty_private.claim_woocommerce_effects(text, integer, integer)
  to loyalty_worker;
grant execute on function loyalty_private.resolve_commerce_customer(bigint, bigint, text, text)
  to loyalty_worker;
grant execute on function loyalty_private.finish_commerce_effect(
  uuid, text, text, text, text, text, text, integer
) to loyalty_worker;

comment on column loyalty.commerce_connections.programme_id is
  'Explicit programme binding for connector effects; workers never guess across programmes.';
comment on column loyalty_private.canonical_commerce_events.effect_state is
  'Durable lease/retry state for asynchronous business effects after normalization.';
comment on function loyalty_private.resolve_commerce_customer(bigint, bigint, text, text) is
  'Resolves signed channel identity without accepting or comparing email or other PII.';
