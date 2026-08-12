-- Phase 9 WooCommerce customer erasure. The connector sends one minimized
-- deletion subject; the worker pseudonymizes the channel identity, revokes
-- hosted access, retains immutable value history, and suppresses re-import.

create table loyalty_private.customer_privacy_cases (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null references loyalty.organizations(id) on delete cascade,
  connection_id bigint not null,
  customer_id bigint,
  canonical_event_id bigint not null,
  subject_fingerprint bytea not null check (octet_length(subject_fingerprint) = 32),
  outcome text not null check (outcome in ('pseudonymized', 'suppressed_no_identity')),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, canonical_event_id),
  unique (connection_id, subject_fingerprint),
  foreign key (organization_id, connection_id)
    references loyalty.commerce_connections(organization_id, id) on delete restrict,
  foreign key (organization_id, customer_id)
    references loyalty.customers(organization_id, id) on delete restrict,
  foreign key (organization_id, canonical_event_id)
    references loyalty_private.canonical_commerce_events(organization_id, id) on delete restrict,
  check (created_at >= occurred_at - interval '5 minutes')
);

create index customer_privacy_cases_customer_idx
  on loyalty_private.customer_privacy_cases (organization_id, customer_id, created_at desc)
  where customer_id is not null;

create trigger customer_privacy_cases_immutable
before update or delete on loyalty_private.customer_privacy_cases
for each row execute function loyalty_private.reject_immutable_change();

alter table loyalty_private.customer_privacy_cases owner to loyalty_owner;
alter table loyalty_private.customer_privacy_cases enable row level security;

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
        'commerce.order.status_changed', 'commerce.order.refunded',
        'commerce.coupon.captured', 'commerce.customer.deleted'
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
  subject_fingerprint bytea;
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
  subject_fingerprint := extensions.digest(
    target_connection_id::text || ':' || identity_key,
    'sha256'
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      target_connection_id::text || ':' || identity_key,
      target_organization_id
    )
  );

  if exists (
    select 1
    from loyalty_private.customer_privacy_cases as privacy_case
    where privacy_case.connection_id = target_connection_id
      and privacy_case.subject_fingerprint = subject_fingerprint
  ) then
    return query select null::bigint, null::uuid, 'suppressed'::text;
    return;
  end if;

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

create or replace function loyalty_private.apply_woocommerce_customer_erasure(
  target_organization_id bigint,
  target_connection_id bigint,
  target_canonical_event_public_id uuid,
  target_worker_id text,
  target_external_customer_id text
)
returns table (privacy_case_public_id uuid, customer_public_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_event loyalty_private.canonical_commerce_events%rowtype;
  target_identity_id bigint;
  target_customer_id bigint;
  target_customer_public_id uuid;
  target_fingerprint bytea;
  existing_case loyalty_private.customer_privacy_cases%rowtype;
  created_case loyalty_private.customer_privacy_cases%rowtype;
  result_outcome text;
begin
  if target_worker_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or target_external_customer_id !~ '^[1-9][0-9]{0,19}$' then
    raise exception using errcode = '22023', message = 'invalid customer erasure request';
  end if;

  select event.* into target_event
  from loyalty_private.canonical_commerce_events as event
  where event.public_id = target_canonical_event_public_id
    and event.organization_id = target_organization_id
    and event.connection_id = target_connection_id
    and event.event_type = 'commerce.customer.deleted'
    and event.source_object_id = 'customer-erasure'
    and event.effect_state = 'processing'
    and event.effect_lease_owner = target_worker_id
    and event.payload = pg_catalog.jsonb_build_object(
      'kind', 'customer_deleted',
      'externalCustomerId', target_external_customer_id
    )
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'invalid customer erasure event';
  end if;

  if not exists (
    select 1 from loyalty.commerce_connections as connection
    where connection.organization_id = target_organization_id
      and connection.id = target_connection_id
  ) then
    raise exception using errcode = '22023', message = 'invalid customer erasure connection';
  end if;

  target_fingerprint := extensions.digest(
    target_connection_id::text || ':registered:' || target_external_customer_id,
    'sha256'
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      target_connection_id::text || ':registered:' || target_external_customer_id,
      target_organization_id
    )
  );

  select privacy_case.* into existing_case
  from loyalty_private.customer_privacy_cases as privacy_case
  where privacy_case.connection_id = target_connection_id
    and privacy_case.subject_fingerprint = target_fingerprint;

  if found then
    created_case := existing_case;
    target_customer_id := existing_case.customer_id;
    result_outcome := 'duplicate';
  else
    select identity.id, identity.customer_id, customer.public_id
    into target_identity_id, target_customer_id, target_customer_public_id
    from loyalty.customer_identities as identity
    join loyalty.customers as customer
      on customer.organization_id = identity.organization_id
     and customer.id = identity.customer_id
    where identity.organization_id = target_organization_id
      and identity.commerce_connection_id = target_connection_id
      and identity.identity_kind = 'registered'
      and identity.external_customer_id = 'registered:' || target_external_customer_id
    for update of identity, customer;

    result_outcome := case when found then 'pseudonymized' else 'suppressed_no_identity' end;
    insert into loyalty_private.customer_privacy_cases (
      organization_id, connection_id, customer_id, canonical_event_id,
      subject_fingerprint, outcome, occurred_at
    ) values (
      target_organization_id, target_connection_id, target_customer_id,
      target_event.id, target_fingerprint, result_outcome, target_event.occurred_at
    ) returning * into created_case;

    if target_identity_id is not null then
      update loyalty.customer_identities
      set external_customer_id = 'erased:' || created_case.public_id::text
      where id = target_identity_id;

      update loyalty.customer_user_links
      set revoked_at = clock_timestamp()
      where organization_id = target_organization_id
        and customer_id = target_customer_id
        and source_connection_id = target_connection_id
        and revoked_at is null;

      if not exists (
        select 1
        from loyalty.customer_identities as other_identity
        where other_identity.organization_id = target_organization_id
          and other_identity.customer_id = target_customer_id
          and other_identity.id <> target_identity_id
          and other_identity.external_customer_id not like 'erased:%'
      ) then
        update loyalty.customers
        set status = case when status = 'closed' then status else 'pseudonymized' end,
            display_reference = null,
            updated_at = clock_timestamp()
        where organization_id = target_organization_id
          and id = target_customer_id;
      end if;
    end if;
  end if;

  update loyalty_private.canonical_commerce_events
  set source_object_id = 'privacy-case:' || created_case.public_id::text,
      source_revision = null,
      payload = pg_catalog.jsonb_build_object(
        'kind', 'customer_deleted',
        'privacyCaseId', created_case.public_id
      )
  where id = target_event.id;

  update loyalty_private.commerce_delivery_inbox
  set raw_body = pg_catalog.jsonb_build_object(
    'version', '1',
    'eventType', 'commerce.customer.deleted',
    'privacyCaseId', created_case.public_id
  )
  where organization_id = target_organization_id
    and id = target_event.delivery_inbox_id;

  if target_customer_id is not null and target_customer_public_id is null then
    select customer.public_id into target_customer_public_id
    from loyalty.customers as customer
    where customer.organization_id = target_organization_id
      and customer.id = target_customer_id;
  end if;

  return query select created_case.public_id, target_customer_public_id, result_outcome;
end;
$$;

alter function loyalty_private.resolve_commerce_customer(bigint, bigint, text, text)
  owner to loyalty_owner;
alter function loyalty_private.claim_woocommerce_effects(text, integer, integer)
  owner to loyalty_owner;
alter function loyalty_private.apply_woocommerce_customer_erasure(bigint, bigint, uuid, text, text)
  owner to loyalty_owner;

revoke all on loyalty_private.customer_privacy_cases
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function loyalty_private.claim_woocommerce_effects(text, integer, integer)
  from public, anon, authenticated, loyalty_runtime;
revoke all on function loyalty_private.resolve_commerce_customer(bigint, bigint, text, text)
  from public, anon, authenticated, loyalty_runtime;
revoke all on function loyalty_private.apply_woocommerce_customer_erasure(bigint, bigint, uuid, text, text)
  from public, anon, authenticated, loyalty_runtime;

grant execute on function loyalty_private.resolve_commerce_customer(bigint, bigint, text, text)
  to loyalty_worker;
grant execute on function loyalty_private.claim_woocommerce_effects(text, integer, integer)
  to loyalty_worker;
grant execute on function loyalty_private.apply_woocommerce_customer_erasure(bigint, bigint, uuid, text, text)
  to loyalty_worker;

comment on table loyalty_private.customer_privacy_cases is
  'Immutable channel-subject erasure tombstones; identifiers are one-way fingerprints and never browser-readable.';
comment on function loyalty_private.resolve_commerce_customer(bigint, bigint, text, text) is
  'Resolves signed channel identity without email and suppresses identities covered by an erasure tombstone.';
comment on function loyalty_private.apply_woocommerce_customer_erasure(bigint, bigint, uuid, text, text) is
  'Applies one leased WooCommerce customer erasure by revoking access, pseudonymizing identity, scrubbing raw event identifiers, and preserving value history.';
