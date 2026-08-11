-- Phase 4 reliable commerce-event foundation. Signature verification happens
-- over raw bytes in the ingestion service before this acceptance command runs.

create table loyalty.commerce_connections (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null references loyalty.organizations(id) on delete cascade,
  workspace_id bigint not null,
  platform text not null default 'woocommerce' check (platform = 'woocommerce'),
  external_store_id text not null,
  display_name text not null,
  status text not null default 'active' check (status in ('active', 'disabled', 'rotating')),
  current_key_version text not null,
  signing_material_ref text not null,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, workspace_id, platform),
  unique (platform, external_store_id),
  foreign key (organization_id, workspace_id)
    references loyalty.workspaces(organization_id, id) on delete cascade,
  check (length(btrim(external_store_id)) between 1 and 255),
  check (length(btrim(display_name)) between 1 and 200),
  check (current_key_version ~ '^v[1-9][0-9]*$'),
  check (length(btrim(signing_material_ref)) between 1 and 500),
  check (updated_at >= created_at)
);

create index commerce_connections_organization_status_idx
  on loyalty.commerce_connections (organization_id, status, id);
create index commerce_connections_workspace_idx
  on loyalty.commerce_connections (organization_id, workspace_id, id);

create table loyalty_private.commerce_delivery_inbox (
  id bigint generated always as identity primary key,
  receipt_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null references loyalty.organizations(id) on delete cascade,
  connection_id bigint not null,
  source_delivery_id text not null,
  envelope_version text not null check (envelope_version = '1'),
  source_event_id text not null,
  event_type text not null,
  source_object_id text not null,
  source_revision text,
  occurred_at timestamptz not null,
  delivered_at timestamptz not null,
  key_version text not null,
  nonce text not null,
  body_sha256 text not null check (body_sha256 ~ '^[a-f0-9]{64}$'),
  raw_body jsonb not null,
  state text not null default 'accepted'
    check (state in ('accepted', 'processing', 'applied', 'retryable', 'quarantined', 'dead_letter')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  lease_owner text,
  lease_expires_at timestamptz,
  last_error_code text,
  accepted_at timestamptz not null default now(),
  last_received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (organization_id, id),
  unique (connection_id, source_delivery_id),
  unique (connection_id, key_version, nonce),
  foreign key (organization_id, connection_id)
    references loyalty.commerce_connections(organization_id, id) on delete cascade,
  check (length(source_delivery_id) between 1 and 255),
  check (length(source_event_id) between 1 and 255),
  check (event_type ~ '^commerce\.[a-z_]+\.[a-z_]+$'),
  check (length(source_object_id) between 1 and 255),
  check (key_version ~ '^v[1-9][0-9]*$'),
  check (length(nonce) between 1 and 255),
  check ((lease_owner is null) = (lease_expires_at is null)),
  check (last_received_at >= accepted_at)
);

create index commerce_delivery_inbox_claim_idx
  on loyalty_private.commerce_delivery_inbox (available_at, id)
  where state in ('accepted', 'retryable');
create index commerce_delivery_inbox_lease_idx
  on loyalty_private.commerce_delivery_inbox (lease_expires_at, id)
  where state = 'processing';
create index commerce_delivery_inbox_tenant_state_idx
  on loyalty_private.commerce_delivery_inbox (organization_id, state, id);
create index commerce_delivery_inbox_source_event_idx
  on loyalty_private.commerce_delivery_inbox (connection_id, source_event_id, id);

create table loyalty_private.canonical_commerce_events (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null references loyalty.organizations(id) on delete cascade,
  connection_id bigint not null,
  delivery_inbox_id bigint not null,
  source_event_id text not null,
  normalization_version text not null,
  event_type text not null,
  source_object_id text not null,
  source_revision text,
  occurred_at timestamptz not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (connection_id, source_event_id, normalization_version),
  foreign key (organization_id, connection_id)
    references loyalty.commerce_connections(organization_id, id) on delete cascade,
  foreign key (organization_id, delivery_inbox_id)
    references loyalty_private.commerce_delivery_inbox(organization_id, id) on delete restrict,
  check (normalization_version ~ '^v[1-9][0-9]*$'),
  check (event_type ~ '^commerce\.[a-z_]+\.[a-z_]+$')
);

create index canonical_commerce_events_aggregate_idx
  on loyalty_private.canonical_commerce_events (
    organization_id,
    connection_id,
    event_type,
    source_object_id,
    occurred_at desc,
    id desc
  );
create index canonical_commerce_events_delivery_idx
  on loyalty_private.canonical_commerce_events (organization_id, delivery_inbox_id);

create table loyalty_private.commerce_business_effects (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null references loyalty.organizations(id) on delete cascade,
  event_id bigint not null,
  effect_kind text not null,
  effect_key text not null,
  result_reference text,
  created_at timestamptz not null default now(),
  unique (organization_id, event_id, effect_kind, effect_key),
  foreign key (organization_id, event_id)
    references loyalty_private.canonical_commerce_events(organization_id, id) on delete restrict,
  check (effect_kind ~ '^[a-z][a-z0-9_.-]{0,99}$'),
  check (length(effect_key) between 1 and 255)
);

create index commerce_business_effects_event_idx
  on loyalty_private.commerce_business_effects (organization_id, event_id);

create table loyalty_private.transactional_outbox (
  id bigint generated always as identity primary key,
  command_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null references loyalty.organizations(id) on delete cascade,
  connection_id bigint,
  topic text not null,
  payload_version text not null,
  payload jsonb not null,
  state text not null default 'pending'
    check (state in ('pending', 'processing', 'delivered', 'retryable', 'dead_letter', 'cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  lease_owner text,
  lease_expires_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, connection_id)
    references loyalty.commerce_connections(organization_id, id) on delete cascade,
  check (topic ~ '^[a-z][a-z0-9_.-]{0,199}$'),
  check (payload_version ~ '^v[1-9][0-9]*$'),
  check ((lease_owner is null) = (lease_expires_at is null))
);

create index transactional_outbox_claim_idx
  on loyalty_private.transactional_outbox (available_at, id)
  where state in ('pending', 'retryable');
create index transactional_outbox_tenant_state_idx
  on loyalty_private.transactional_outbox (organization_id, state, id);
create index transactional_outbox_connection_idx
  on loyalty_private.transactional_outbox (organization_id, connection_id, id)
  where connection_id is not null;

alter table loyalty.commerce_connections owner to loyalty_owner;
alter table loyalty_private.commerce_delivery_inbox owner to loyalty_owner;
alter table loyalty_private.canonical_commerce_events owner to loyalty_owner;
alter table loyalty_private.commerce_business_effects owner to loyalty_owner;
alter table loyalty_private.transactional_outbox owner to loyalty_owner;

create or replace function loyalty_private.accept_commerce_delivery(
  target_organization_id bigint,
  target_connection_id bigint,
  target_source_delivery_id text,
  target_envelope_version text,
  target_source_event_id text,
  target_event_type text,
  target_source_object_id text,
  target_source_revision text,
  target_occurred_at timestamptz,
  target_delivered_at timestamptz,
  target_key_version text,
  target_nonce text,
  target_body_sha256 text,
  target_raw_body jsonb
)
returns table (receipt_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  accepted_receipt_id uuid;
  existing_body_sha256 text;
begin
  if not exists (
    select 1
    from loyalty.commerce_connections as connection
    where connection.id = target_connection_id
      and connection.organization_id = target_organization_id
      and connection.status in ('active', 'rotating')
      and connection.current_key_version = target_key_version
  ) then
    raise exception using errcode = '22023', message = 'inactive or unknown commerce connection';
  end if;

  insert into loyalty_private.commerce_delivery_inbox (
    organization_id,
    connection_id,
    source_delivery_id,
    envelope_version,
    source_event_id,
    event_type,
    source_object_id,
    source_revision,
    occurred_at,
    delivered_at,
    key_version,
    nonce,
    body_sha256,
    raw_body
  ) values (
    target_organization_id,
    target_connection_id,
    target_source_delivery_id,
    target_envelope_version,
    target_source_event_id,
    target_event_type,
    target_source_object_id,
    target_source_revision,
    target_occurred_at,
    target_delivered_at,
    target_key_version,
    target_nonce,
    target_body_sha256,
    target_raw_body
  )
  on conflict (connection_id, source_delivery_id) do update
    set last_received_at = clock_timestamp()
    where commerce_delivery_inbox.body_sha256 = excluded.body_sha256
  returning commerce_delivery_inbox.receipt_id into accepted_receipt_id;

  if accepted_receipt_id is null then
    raise exception using errcode = '23514', message = 'delivery id reused with different body hash';
  end if;

  select inbox.body_sha256
  into existing_body_sha256
  from loyalty_private.commerce_delivery_inbox as inbox
  where inbox.receipt_id = accepted_receipt_id;

  return query
  select accepted_receipt_id,
    case when existing_body_sha256 = target_body_sha256
      and exists (
        select 1 from loyalty_private.commerce_delivery_inbox as inbox
        where inbox.receipt_id = accepted_receipt_id
          and inbox.accepted_at < inbox.last_received_at
      )
    then 'duplicate' else 'accepted' end;
end;
$$;

alter function loyalty_private.accept_commerce_delivery(
  bigint, bigint, text, text, text, text, text, text, timestamptz,
  timestamptz, text, text, text, jsonb
) owner to loyalty_owner;

revoke all on function loyalty_private.accept_commerce_delivery(
  bigint, bigint, text, text, text, text, text, text, timestamptz,
  timestamptz, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function loyalty_private.accept_commerce_delivery(
  bigint, bigint, text, text, text, text, text, text, timestamptz,
  timestamptz, text, text, text, jsonb
) to loyalty_runtime;

alter table loyalty.commerce_connections enable row level security;
alter table loyalty_private.commerce_delivery_inbox enable row level security;
alter table loyalty_private.canonical_commerce_events enable row level security;
alter table loyalty_private.commerce_business_effects enable row level security;
alter table loyalty_private.transactional_outbox enable row level security;

create policy commerce_connections_member_select
  on loyalty.commerce_connections for select to authenticated
  using ((select loyalty_private.is_organization_member(organization_id)));
create policy commerce_connections_worker_all
  on loyalty.commerce_connections for all to loyalty_worker using (true) with check (true);
create policy commerce_delivery_inbox_worker_all
  on loyalty_private.commerce_delivery_inbox for all to loyalty_worker using (true) with check (true);
create policy canonical_commerce_events_worker_all
  on loyalty_private.canonical_commerce_events for all to loyalty_worker using (true) with check (true);
create policy commerce_business_effects_worker_all
  on loyalty_private.commerce_business_effects for all to loyalty_worker using (true) with check (true);
create policy transactional_outbox_worker_all
  on loyalty_private.transactional_outbox for all to loyalty_worker using (true) with check (true);

revoke all on loyalty.commerce_connections from public, anon, authenticated;
grant select on loyalty.commerce_connections to authenticated;

revoke all on all tables in schema loyalty_private from public, anon, authenticated, loyalty_runtime;
revoke all on all sequences in schema loyalty_private from public, anon, authenticated, loyalty_runtime;
grant usage on schema loyalty_private to loyalty_runtime, loyalty_worker;
grant select, insert, update on loyalty.commerce_connections to loyalty_worker;
grant select, insert, update on loyalty_private.commerce_delivery_inbox to loyalty_worker;
grant select, insert on loyalty_private.canonical_commerce_events to loyalty_worker;
grant select, insert on loyalty_private.commerce_business_effects to loyalty_worker;
grant select, insert, update on loyalty_private.transactional_outbox to loyalty_worker;
grant usage, select on all sequences in schema loyalty, loyalty_private to loyalty_worker;

comment on table loyalty_private.commerce_delivery_inbox is
  'Restricted post-signature delivery evidence; duplicate IDs have one receipt and body hash.';
comment on table loyalty_private.canonical_commerce_events is
  'Minimal versioned commerce facts; uniqueness prevents duplicate canonical events.';
comment on table loyalty_private.commerce_business_effects is
  'Independent idempotency fence for each canonical event business effect.';
comment on table loyalty_private.transactional_outbox is
  'Commands persisted in the same transaction as the state that requires delivery.';
