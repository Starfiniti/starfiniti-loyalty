-- Hosted customer identity linking. A logged-in WooCommerce customer receives
-- a short-lived, channel-signed capability; the dashboard verifies the HMAC
-- before this command consumes its hashed proof. Email is never an authority.

create table loyalty.customer_user_links (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null references loyalty.organizations(id) on delete cascade,
  customer_id bigint not null,
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  source_connection_id bigint not null,
  linked_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, customer_id)
    references loyalty.customers(organization_id, id) on delete restrict,
  foreign key (organization_id, source_connection_id)
    references loyalty.commerce_connections(organization_id, id) on delete restrict,
  check (revoked_at is null or revoked_at >= linked_at)
);

create unique index customer_user_links_active_user_uidx
  on loyalty.customer_user_links (organization_id, auth_user_id)
  where revoked_at is null;
create unique index customer_user_links_active_customer_uidx
  on loyalty.customer_user_links (organization_id, customer_id)
  where revoked_at is null;
create index customer_user_links_customer_history_idx
  on loyalty.customer_user_links (organization_id, customer_id, linked_at desc, id desc);

create table loyalty.identity_link_decisions (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null references loyalty.organizations(id) on delete cascade,
  connection_id bigint not null,
  customer_id bigint,
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  external_customer_sha256 bytea not null check (octet_length(external_customer_sha256) = 32),
  nonce_sha256 bytea not null check (octet_length(nonce_sha256) = 32),
  proof_sha256 bytea not null check (octet_length(proof_sha256) = 32),
  key_version text not null check (key_version ~ '^v[1-9][0-9]*$'),
  issued_at timestamptz not null,
  outcome text not null check (outcome in (
    'linked', 'already_linked', 'rejected_identity',
    'rejected_user_conflict', 'rejected_customer_conflict'
  )),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (connection_id, nonce_sha256),
  unique (connection_id, proof_sha256),
  foreign key (organization_id, connection_id)
    references loyalty.commerce_connections(organization_id, id) on delete restrict,
  foreign key (organization_id, customer_id)
    references loyalty.customers(organization_id, id) on delete restrict,
  check (created_at >= issued_at - interval '5 minutes')
);

create index identity_link_decisions_subject_history_idx
  on loyalty.identity_link_decisions (auth_user_id, created_at desc, id desc);
create index identity_link_decisions_customer_history_idx
  on loyalty.identity_link_decisions (organization_id, customer_id, created_at desc, id desc)
  where customer_id is not null;

alter table loyalty.customer_user_links owner to loyalty_owner;
alter table loyalty.identity_link_decisions owner to loyalty_owner;

create or replace function loyalty_private.protect_customer_user_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'customer identity links cannot be deleted';
  end if;
  if new.organization_id <> old.organization_id
    or new.customer_id <> old.customer_id
    or new.auth_user_id <> old.auth_user_id
    or new.source_connection_id <> old.source_connection_id
    or new.linked_at <> old.linked_at
    or new.public_id <> old.public_id
    or old.revoked_at is not null
    or new.revoked_at is null then
    raise exception using errcode = '55000', message = 'customer identity link history is immutable';
  end if;
  return new;
end;
$$;

create trigger customer_user_links_protect_history
before update or delete on loyalty.customer_user_links
for each row execute function loyalty_private.protect_customer_user_link();

create trigger identity_link_decisions_immutable
before update or delete on loyalty.identity_link_decisions
for each row execute function loyalty_private.reject_immutable_change();

create or replace function loyalty_private.claim_woocommerce_customer_identity(
  target_connection_public_id uuid,
  target_external_customer_id text,
  target_auth_user_id uuid,
  target_key_version text,
  target_issued_at timestamptz,
  target_nonce_sha256 bytea,
  target_proof_sha256 bytea
)
returns table (
  link_public_id uuid,
  customer_public_id uuid,
  outcome text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_connection loyalty.commerce_connections%rowtype;
  target_identity loyalty.customer_identities%rowtype;
  target_customer loyalty.customers%rowtype;
  existing_decision loyalty.identity_link_decisions%rowtype;
  user_link loyalty.customer_user_links%rowtype;
  customer_link loyalty.customer_user_links%rowtype;
  created_link loyalty.customer_user_links%rowtype;
  decision_outcome text;
  external_hash bytea;
begin
  if target_connection_public_id is null or target_auth_user_id is null
    or target_issued_at is null
    or target_external_customer_id !~ '^[1-9][0-9]{0,19}$'
    or target_key_version !~ '^v[1-9][0-9]*$'
    or octet_length(target_nonce_sha256) <> 32
    or octet_length(target_proof_sha256) <> 32 then
    raise exception using errcode = '22023', message = 'invalid customer claim';
  end if;
  if pg_catalog.abs(extract(epoch from (clock_timestamp() - target_issued_at))) > 300 then
    raise exception using errcode = '22023', message = 'expired customer claim';
  end if;
  select connection.* into target_connection
  from loyalty.commerce_connections as connection
  where connection.public_id = target_connection_public_id
  for update;
  if not found
    or target_connection.status not in ('active', 'rotating')
    or target_connection.current_key_version <> target_key_version then
    raise exception using errcode = '22023', message = 'invalid customer claim';
  end if;

  external_hash := extensions.digest(
    pg_catalog.convert_to(target_external_customer_id, 'UTF8'),
    'sha256'
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      target_connection.organization_id::text || ':user:' || target_auth_user_id::text,
      0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      target_connection.id::text || ':customer:' || target_external_customer_id,
      0
    )
  );

  select decision.* into existing_decision
  from loyalty.identity_link_decisions as decision
  where decision.connection_id = target_connection.id
    and decision.nonce_sha256 = target_nonce_sha256;
  if found then
    if existing_decision.organization_id <> target_connection.organization_id
      or existing_decision.auth_user_id <> target_auth_user_id
      or existing_decision.external_customer_sha256 <> external_hash
      or existing_decision.proof_sha256 <> target_proof_sha256
      or existing_decision.key_version <> target_key_version
      or existing_decision.issued_at <> target_issued_at then
      raise exception using errcode = '23505', message = 'customer claim replay conflict';
    end if;
    select link.* into user_link
    from loyalty.customer_user_links as link
    where link.organization_id = existing_decision.organization_id
      and link.customer_id = existing_decision.customer_id
      and link.auth_user_id = existing_decision.auth_user_id
      and link.revoked_at is null;
    return query select user_link.public_id, customer.public_id,
      existing_decision.outcome
    from loyalty.customers as customer
    where customer.organization_id = existing_decision.organization_id
      and customer.id = existing_decision.customer_id;
    if not found then
      return query select null::uuid, null::uuid, existing_decision.outcome;
    end if;
    return;
  end if;

  select identity.* into target_identity
  from loyalty.customer_identities as identity
  where identity.organization_id = target_connection.organization_id
    and identity.commerce_connection_id = target_connection.id
    and identity.external_customer_id = 'registered:' || target_external_customer_id
    and identity.identity_kind = 'registered'
    and identity.verified_at is not null;

  if found then
    select customer.* into target_customer
    from loyalty.customers as customer
    where customer.organization_id = target_identity.organization_id
      and customer.id = target_identity.customer_id
      and customer.status = 'active';
  end if;

  if target_customer.id is null then
    decision_outcome := 'rejected_identity';
  else
    select link.* into user_link
    from loyalty.customer_user_links as link
    where link.organization_id = target_connection.organization_id
      and link.auth_user_id = target_auth_user_id
      and link.revoked_at is null;
    select link.* into customer_link
    from loyalty.customer_user_links as link
    where link.organization_id = target_connection.organization_id
      and link.customer_id = target_customer.id
      and link.revoked_at is null;

    if user_link.id is not null and user_link.customer_id <> target_customer.id then
      decision_outcome := 'rejected_user_conflict';
    elsif customer_link.id is not null and customer_link.auth_user_id <> target_auth_user_id then
      decision_outcome := 'rejected_customer_conflict';
    elsif user_link.id is not null or customer_link.id is not null then
      created_link := coalesce(user_link, customer_link);
      decision_outcome := 'already_linked';
    else
      insert into loyalty.customer_user_links (
        organization_id, customer_id, auth_user_id, source_connection_id
      ) values (
        target_connection.organization_id, target_customer.id,
        target_auth_user_id, target_connection.id
      ) returning * into created_link;
      decision_outcome := 'linked';
    end if;
  end if;

  insert into loyalty.identity_link_decisions (
    organization_id, connection_id, customer_id, auth_user_id,
    external_customer_sha256, nonce_sha256, proof_sha256,
    key_version, issued_at, outcome
  ) values (
    target_connection.organization_id, target_connection.id, target_customer.id,
    target_auth_user_id, external_hash, target_nonce_sha256,
    target_proof_sha256, target_key_version, target_issued_at, decision_outcome
  );

  return query select created_link.public_id, target_customer.public_id,
    decision_outcome;
end;
$$;

alter function loyalty_private.protect_customer_user_link() owner to loyalty_owner;
alter function loyalty_private.claim_woocommerce_customer_identity(
  uuid, text, uuid, text, timestamptz, bytea, bytea
) owner to loyalty_owner;

revoke all on function loyalty_private.protect_customer_user_link()
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function loyalty_private.claim_woocommerce_customer_identity(
  uuid, text, uuid, text, timestamptz, bytea, bytea
) from public, anon, authenticated, loyalty_worker;
grant execute on function loyalty_private.claim_woocommerce_customer_identity(
  uuid, text, uuid, text, timestamptz, bytea, bytea
) to loyalty_runtime;

alter table loyalty.customer_user_links enable row level security;
alter table loyalty.identity_link_decisions enable row level security;

revoke all on loyalty.customer_user_links, loyalty.identity_link_decisions
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

comment on table loyalty.customer_user_links is
  'Revocable Auth-to-customer links created only from an exact verified channel identity; email is never linking authority.';
comment on table loyalty.identity_link_decisions is
  'Immutable one-use claim evidence containing only hashed external identity, nonce, and proof material.';
comment on function loyalty_private.claim_woocommerce_customer_identity(
  uuid, text, uuid, text, timestamptz, bytea, bytea
) is 'Consumes one fresh HMAC-verified WooCommerce claim for an already authenticated Auth user without any email merge.';
