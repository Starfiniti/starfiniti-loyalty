-- Phase 5 immutable double-entry points ledger and rebuildable projections.
-- Application roles never receive direct ledger DML. Narrow SECURITY DEFINER
-- commands own lock ordering, idempotency, balance policy, and attribution.

create table loyalty.programmes (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null references loyalty.organizations(id) on delete cascade,
  programme_group_id bigint not null,
  slug text not null,
  name text not null,
  status text not null default 'active'
    check (status in ('draft', 'active', 'suspended', 'retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, programme_group_id, id),
  unique (organization_id, programme_group_id, slug),
  foreign key (organization_id, programme_group_id)
    references loyalty.programme_groups(organization_id, id) on delete cascade,
  check (length(btrim(slug)) between 2 and 80),
  check (slug = lower(slug)),
  check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  check (length(btrim(name)) between 1 and 200),
  check (updated_at >= created_at)
);

create index programmes_group_status_idx
  on loyalty.programmes (organization_id, programme_group_id, status, id);

create table loyalty.programme_versions (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null references loyalty.organizations(id) on delete cascade,
  programme_group_id bigint not null,
  programme_id bigint not null,
  version_number integer not null check (version_number > 0),
  status text not null check (status in ('draft', 'published', 'retired', 'superseded')),
  configuration jsonb not null,
  configuration_sha256 bytea not null check (octet_length(configuration_sha256) = 32),
  created_by_user_id uuid references auth.users(id) on delete restrict,
  approved_by_user_id uuid references auth.users(id) on delete restrict,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, programme_group_id, id),
  unique (organization_id, programme_id, version_number),
  foreign key (organization_id, programme_group_id, programme_id)
    references loyalty.programmes(organization_id, programme_group_id, id) on delete cascade,
  check ((status = 'published') = (published_at is not null))
);

create index programme_versions_programme_status_idx
  on loyalty.programme_versions (organization_id, programme_id, status, version_number desc);

create table loyalty.customers (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null references loyalty.organizations(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'blocked', 'pseudonymized', 'closed')),
  display_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check (display_reference is null or length(display_reference) between 1 and 200),
  check (updated_at >= created_at)
);

create index customers_organization_status_idx
  on loyalty.customers (organization_id, status, id);

create table loyalty.customer_identities (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null references loyalty.organizations(id) on delete cascade,
  customer_id bigint not null,
  commerce_connection_id bigint not null,
  external_customer_id text not null,
  identity_kind text not null check (identity_kind in ('registered', 'guest')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (commerce_connection_id, external_customer_id),
  foreign key (organization_id, customer_id)
    references loyalty.customers(organization_id, id) on delete cascade,
  foreign key (organization_id, commerce_connection_id)
    references loyalty.commerce_connections(organization_id, id) on delete cascade,
  check (length(external_customer_id) between 1 and 255)
);

create index customer_identities_customer_idx
  on loyalty.customer_identities (organization_id, customer_id, id);

create table loyalty.wallets (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null references loyalty.organizations(id) on delete cascade,
  programme_group_id bigint not null,
  customer_id bigint not null,
  status text not null default 'active' check (status in ('active', 'blocked', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, programme_group_id, id),
  unique (organization_id, programme_group_id, customer_id),
  foreign key (organization_id, programme_group_id)
    references loyalty.programme_groups(organization_id, id) on delete cascade,
  foreign key (organization_id, customer_id)
    references loyalty.customers(organization_id, id) on delete restrict,
  check (updated_at >= created_at)
);

create index wallets_customer_idx
  on loyalty.wallets (organization_id, customer_id, programme_group_id);

create table loyalty.ledger_accounts (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null references loyalty.organizations(id) on delete cascade,
  programme_group_id bigint not null,
  wallet_id bigint,
  account_kind text not null
    check (account_kind in (
      'pending', 'available', 'reserved', 'spent', 'expired', 'reversed',
      'issuance', 'adjustment'
    )),
  status text not null default 'active' check (status in ('active', 'closed')),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, programme_group_id, id),
  foreign key (organization_id, programme_group_id)
    references loyalty.programme_groups(organization_id, id) on delete cascade,
  foreign key (organization_id, programme_group_id, wallet_id)
    references loyalty.wallets(organization_id, programme_group_id, id) on delete restrict,
  check (
    (wallet_id is not null and account_kind in ('pending', 'available', 'reserved', 'spent', 'expired', 'reversed'))
    or (wallet_id is null and account_kind in ('issuance', 'adjustment'))
  )
);

create unique index ledger_accounts_wallet_kind_uidx
  on loyalty.ledger_accounts (organization_id, wallet_id, account_kind)
  where wallet_id is not null;
create unique index ledger_accounts_control_kind_uidx
  on loyalty.ledger_accounts (organization_id, programme_group_id, account_kind)
  where wallet_id is null;
create index ledger_accounts_group_idx
  on loyalty.ledger_accounts (organization_id, programme_group_id, id);

create table loyalty.ledger_transactions (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null references loyalty.organizations(id) on delete restrict,
  programme_group_id bigint not null,
  programme_version_id bigint not null,
  transaction_kind text not null
    check (transaction_kind in (
      'award', 'release', 'reserve', 'capture', 'cancel', 'expire',
      'refund_reversal', 'manual_adjustment'
    )),
  actor_type text not null check (actor_type in ('commerce_event', 'worker', 'merchant', 'system')),
  actor_id text not null,
  source_event_id bigint,
  source_reference text,
  related_transaction_id bigint,
  idempotency_key text not null,
  request_sha256 bytea not null check (octet_length(request_sha256) = 32),
  correlation_id uuid not null default gen_random_uuid(),
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  effective_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, programme_group_id, id),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, programme_group_id)
    references loyalty.programme_groups(organization_id, id) on delete restrict,
  foreign key (organization_id, programme_group_id, programme_version_id)
    references loyalty.programme_versions(organization_id, programme_group_id, id) on delete restrict,
  foreign key (organization_id, source_event_id)
    references loyalty_private.canonical_commerce_events(organization_id, id) on delete restrict,
  foreign key (organization_id, related_transaction_id)
    references loyalty.ledger_transactions(organization_id, id) on delete restrict,
  check (length(idempotency_key) between 1 and 255),
  check (length(actor_id) between 1 and 255),
  check (source_reference is null or length(source_reference) between 1 and 500),
  check (reason is null or length(btrim(reason)) between 8 and 1000)
);

create unique index ledger_transactions_source_effect_uidx
  on loyalty.ledger_transactions (
    organization_id, source_event_id, transaction_kind, (coalesce(source_reference, ''))
  ) where source_event_id is not null;
create unique index ledger_transactions_reservation_resolution_uidx
  on loyalty.ledger_transactions (organization_id, related_transaction_id)
  where transaction_kind in ('capture', 'cancel');
create index ledger_transactions_wallet_history_idx
  on loyalty.ledger_transactions (organization_id, programme_group_id, effective_at desc, id desc);
create index ledger_transactions_source_event_idx
  on loyalty.ledger_transactions (organization_id, source_event_id)
  where source_event_id is not null;

create table loyalty.ledger_entries (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  programme_group_id bigint not null,
  transaction_id bigint not null,
  account_id bigint not null,
  origin_entry_id bigint,
  ordinal smallint not null check (ordinal > 0),
  points bigint not null check (points <> 0),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (transaction_id, ordinal),
  foreign key (organization_id, programme_group_id, transaction_id)
    references loyalty.ledger_transactions(organization_id, programme_group_id, id)
    on delete restrict deferrable initially deferred,
  foreign key (organization_id, programme_group_id, account_id)
    references loyalty.ledger_accounts(organization_id, programme_group_id, id) on delete restrict,
  foreign key (organization_id, origin_entry_id)
    references loyalty.ledger_entries(organization_id, id) on delete restrict
);

create index ledger_entries_transaction_idx
  on loyalty.ledger_entries (organization_id, transaction_id, ordinal);
create index ledger_entries_account_history_idx
  on loyalty.ledger_entries (organization_id, account_id, id);
create index ledger_entries_origin_idx
  on loyalty.ledger_entries (organization_id, origin_entry_id, id)
  where origin_entry_id is not null;

create table loyalty.wallet_balances (
  ledger_account_id bigint primary key,
  organization_id bigint not null,
  programme_group_id bigint not null,
  wallet_id bigint not null,
  account_kind text not null
    check (account_kind in ('pending', 'available', 'reserved', 'spent', 'expired', 'reversed')),
  points bigint not null default 0,
  updated_at timestamptz not null default now(),
  unique (organization_id, wallet_id, account_kind),
  foreign key (organization_id, programme_group_id, ledger_account_id)
    references loyalty.ledger_accounts(organization_id, programme_group_id, id) on delete restrict,
  foreign key (organization_id, programme_group_id, wallet_id)
    references loyalty.wallets(organization_id, programme_group_id, id) on delete restrict
);

create index wallet_balances_wallet_idx
  on loyalty.wallet_balances (organization_id, wallet_id, account_kind);

create table loyalty.point_lots (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  programme_group_id bigint not null,
  wallet_id bigint not null,
  programme_version_id bigint not null,
  credit_entry_id bigint not null,
  origin_entry_id bigint not null,
  initial_points bigint not null check (initial_points > 0),
  available_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, credit_entry_id),
  unique (organization_id, origin_entry_id),
  foreign key (organization_id, programme_group_id, wallet_id)
    references loyalty.wallets(organization_id, programme_group_id, id) on delete restrict,
  foreign key (organization_id, programme_group_id, programme_version_id)
    references loyalty.programme_versions(organization_id, programme_group_id, id) on delete restrict,
  foreign key (organization_id, credit_entry_id)
    references loyalty.ledger_entries(organization_id, id) on delete restrict,
  foreign key (organization_id, origin_entry_id)
    references loyalty.ledger_entries(organization_id, id) on delete restrict,
  check (expires_at > available_at)
);

create index point_lots_fifo_idx
  on loyalty.point_lots (organization_id, wallet_id, expires_at, available_at, id);

create table loyalty.point_lot_balances (
  lot_id bigint primary key,
  organization_id bigint not null,
  wallet_id bigint not null,
  remaining_points bigint not null check (remaining_points >= 0),
  updated_at timestamptz not null default now(),
  unique (organization_id, lot_id),
  foreign key (organization_id, lot_id)
    references loyalty.point_lots(organization_id, id) on delete restrict,
  foreign key (organization_id, wallet_id)
    references loyalty.wallets(organization_id, id) on delete restrict
);

create index point_lot_balances_wallet_idx
  on loyalty.point_lot_balances (organization_id, wallet_id, lot_id)
  where remaining_points > 0;

create table loyalty.redemption_allocations (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  transaction_id bigint not null,
  lot_id bigint not null,
  related_allocation_id bigint,
  allocation_kind text not null
    check (allocation_kind in ('reserve', 'cancel', 'expire', 'reversal', 'adjustment')),
  points bigint not null check (points <> 0),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (transaction_id, lot_id, allocation_kind),
  unique (related_allocation_id),
  foreign key (organization_id, transaction_id)
    references loyalty.ledger_transactions(organization_id, id) on delete restrict,
  foreign key (organization_id, lot_id)
    references loyalty.point_lots(organization_id, id) on delete restrict,
  foreign key (organization_id, related_allocation_id)
    references loyalty.redemption_allocations(organization_id, id) on delete restrict,
  check (
    (allocation_kind in ('reserve', 'expire', 'reversal', 'adjustment') and points > 0 and related_allocation_id is null)
    or (allocation_kind = 'cancel' and points < 0 and related_allocation_id is not null)
  )
);

create index redemption_allocations_transaction_idx
  on loyalty.redemption_allocations (organization_id, transaction_id, id);
create index redemption_allocations_lot_idx
  on loyalty.redemption_allocations (organization_id, lot_id, id);

alter table loyalty.programmes owner to loyalty_owner;
alter table loyalty.programme_versions owner to loyalty_owner;
alter table loyalty.customers owner to loyalty_owner;
alter table loyalty.customer_identities owner to loyalty_owner;
alter table loyalty.wallets owner to loyalty_owner;
alter table loyalty.ledger_accounts owner to loyalty_owner;
alter table loyalty.ledger_transactions owner to loyalty_owner;
alter table loyalty.ledger_entries owner to loyalty_owner;
alter table loyalty.wallet_balances owner to loyalty_owner;
alter table loyalty.point_lots owner to loyalty_owner;
alter table loyalty.point_lot_balances owner to loyalty_owner;
alter table loyalty.redemption_allocations owner to loyalty_owner;

create or replace function loyalty_private.reject_immutable_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = '55000', message = 'immutable loyalty history cannot be changed';
end;
$$;

create or replace function loyalty_private.protect_programme_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status <> 'draft' then
    raise exception using errcode = '55000', message = 'published programme version is immutable';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger programme_versions_protect_history
before update or delete on loyalty.programme_versions
for each row execute function loyalty_private.protect_programme_version();

create trigger ledger_transactions_immutable
before update or delete on loyalty.ledger_transactions
for each row execute function loyalty_private.reject_immutable_change();
create trigger ledger_entries_immutable
before update or delete on loyalty.ledger_entries
for each row execute function loyalty_private.reject_immutable_change();
create trigger point_lots_immutable
before update or delete on loyalty.point_lots
for each row execute function loyalty_private.reject_immutable_change();
create trigger redemption_allocations_immutable
before update or delete on loyalty.redemption_allocations
for each row execute function loyalty_private.reject_immutable_change();

create or replace function loyalty_private.apply_ledger_entry_projection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_points bigint;
  target_kind text;
begin
  update loyalty.wallet_balances as balance
  set points = balance.points + new.points,
      updated_at = clock_timestamp()
  where balance.organization_id = new.organization_id
    and balance.ledger_account_id = new.account_id
  returning balance.points, balance.account_kind into updated_points, target_kind;

  if found and target_kind in ('pending', 'reserved') and updated_points < 0 then
    raise exception using errcode = '23514', message = 'protected wallet bucket cannot become negative';
  end if;
  return new;
end;
$$;

create trigger ledger_entries_project_balance
after insert on loyalty.ledger_entries
for each row execute function loyalty_private.apply_ledger_entry_projection();

create or replace function loyalty_private.apply_lot_allocation_projection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_remaining bigint;
  initial_quantity bigint;
begin
  update loyalty.point_lot_balances as balance
  set remaining_points = balance.remaining_points - new.points,
      updated_at = clock_timestamp()
  where balance.organization_id = new.organization_id
    and balance.lot_id = new.lot_id
  returning balance.remaining_points into updated_remaining;

  if not found then
    raise exception using errcode = '23503', message = 'missing point lot projection';
  end if;
  select lot.initial_points into initial_quantity
  from loyalty.point_lots as lot
  where lot.organization_id = new.organization_id and lot.id = new.lot_id;
  if updated_remaining < 0 or updated_remaining > initial_quantity then
    raise exception using errcode = '23514', message = 'point lot allocation exceeds immutable quantity';
  end if;
  return new;
end;
$$;

create trigger redemption_allocations_project_lot
after insert on loyalty.redemption_allocations
for each row execute function loyalty_private.apply_lot_allocation_projection();

create or replace function loyalty_private.validate_ledger_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry_count bigint;
  entry_total numeric;
begin
  select count(*), coalesce(sum(entry.points::numeric), 0)
  into entry_count, entry_total
  from loyalty.ledger_entries as entry
  where entry.organization_id = new.organization_id
    and entry.transaction_id = new.id;

  if entry_count < 2 then
    raise exception using errcode = '23514', message = 'ledger transaction requires at least two entries';
  end if;
  if entry_total <> 0 then
    raise exception using errcode = '23514', message = 'ledger transaction entries must sum to zero';
  end if;
  return new;
end;
$$;

create constraint trigger ledger_transaction_balanced
after insert on loyalty.ledger_transactions
not deferrable
for each row execute function loyalty_private.validate_ledger_transaction();

create or replace function loyalty_private.ensure_wallet_accounts(
  target_organization_id bigint,
  target_programme_group_id bigint,
  target_customer_id bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_wallet_id bigint;
begin
  if not exists (
    select 1
    from loyalty.organizations as organization
    join loyalty.programme_groups as programme_group
      on programme_group.organization_id = organization.id
    join loyalty.customers as customer
      on customer.organization_id = organization.id
    where organization.id = target_organization_id
      and organization.status = 'active'
      and programme_group.id = target_programme_group_id
      and programme_group.status = 'active'
      and customer.id = target_customer_id
      and customer.status = 'active'
  ) then
    raise exception using errcode = '22023', message = 'inactive or cross-tenant wallet scope';
  end if;

  insert into loyalty.wallets (organization_id, programme_group_id, customer_id)
  values (target_organization_id, target_programme_group_id, target_customer_id)
  on conflict (organization_id, programme_group_id, customer_id) do nothing;

  select wallet.id into target_wallet_id
  from loyalty.wallets as wallet
  where wallet.organization_id = target_organization_id
    and wallet.programme_group_id = target_programme_group_id
    and wallet.customer_id = target_customer_id;

  if not exists (
    select 1 from loyalty.wallets as wallet
    where wallet.id = target_wallet_id and wallet.status = 'active'
  ) then
    raise exception using errcode = '55000', message = 'wallet is not active';
  end if;

  insert into loyalty.ledger_accounts (
    organization_id, programme_group_id, wallet_id, account_kind
  )
  select target_organization_id, target_programme_group_id, target_wallet_id, bucket
  from unnest(array['pending', 'available', 'reserved', 'spent', 'expired', 'reversed']::text[]) as bucket
  on conflict (organization_id, wallet_id, account_kind) where wallet_id is not null do nothing;

  insert into loyalty.ledger_accounts (
    organization_id, programme_group_id, wallet_id, account_kind
  ) values
    (target_organization_id, target_programme_group_id, null, 'issuance'),
    (target_organization_id, target_programme_group_id, null, 'adjustment')
  on conflict (organization_id, programme_group_id, account_kind) where wallet_id is null do nothing;

  insert into loyalty.wallet_balances (
    ledger_account_id, organization_id, programme_group_id, wallet_id, account_kind
  )
  select account.id, account.organization_id, account.programme_group_id,
    account.wallet_id, account.account_kind
  from loyalty.ledger_accounts as account
  where account.organization_id = target_organization_id
    and account.programme_group_id = target_programme_group_id
    and account.wallet_id = target_wallet_id
  on conflict (ledger_account_id) do nothing;

  return target_wallet_id;
end;
$$;

create or replace function loyalty_private.post_ledger_transaction(
  target_organization_id bigint,
  target_programme_group_id bigint,
  target_programme_version_id bigint,
  target_transaction_kind text,
  target_actor_type text,
  target_actor_id text,
  target_source_event_id bigint,
  target_source_reference text,
  target_related_transaction_id bigint,
  target_idempotency_key text,
  target_request_sha256 bytea,
  target_reason text,
  target_metadata jsonb,
  target_effective_at timestamptz,
  target_entries jsonb
)
returns table (transaction_id bigint, transaction_public_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_transaction loyalty.ledger_transactions%rowtype;
  new_transaction_id bigint;
  new_transaction_public_id uuid := gen_random_uuid();
  parsed_entry_count integer;
  parsed_entry_total numeric;
begin
  select transaction.* into existing_transaction
  from loyalty.ledger_transactions as transaction
  where transaction.organization_id = target_organization_id
    and transaction.idempotency_key = target_idempotency_key;
  if found then
    if existing_transaction.request_sha256 <> target_request_sha256 then
      raise exception using errcode = '23514', message = 'idempotency key reused with different request hash';
    end if;
    return query select existing_transaction.id, existing_transaction.public_id, 'duplicate'::text;
    return;
  end if;

  if jsonb_typeof(target_entries) <> 'array' then
    raise exception using errcode = '22023', message = 'ledger entries must be a JSON array';
  end if;
  select count(*), coalesce(sum(parsed.points::numeric), 0)
  into parsed_entry_count, parsed_entry_total
  from jsonb_to_recordset(target_entries) as parsed(account_id bigint, points bigint, origin_entry_id bigint);
  if parsed_entry_count < 2 or parsed_entry_total <> 0 then
    raise exception using errcode = '23514', message = 'ledger transaction must contain balanced entries';
  end if;

  begin
    new_transaction_id := nextval('loyalty.ledger_transactions_id_seq'::regclass);

    insert into loyalty.ledger_entries (
      organization_id, programme_group_id, transaction_id, account_id,
      origin_entry_id, ordinal, points
    )
    select target_organization_id, target_programme_group_id, new_transaction_id,
      (element.value ->> 'account_id')::bigint,
      (element.value ->> 'origin_entry_id')::bigint,
      element.ordinal::smallint,
      (element.value ->> 'points')::bigint
    from jsonb_array_elements(target_entries) with ordinality as element(value, ordinal);

    insert into loyalty.ledger_transactions (
      id, public_id, organization_id, programme_group_id, programme_version_id,
      transaction_kind, actor_type, actor_id, source_event_id, source_reference,
      related_transaction_id, idempotency_key, request_sha256, reason, metadata,
      effective_at
    ) overriding system value values (
      new_transaction_id, new_transaction_public_id, target_organization_id,
      target_programme_group_id, target_programme_version_id,
      target_transaction_kind, target_actor_type, target_actor_id,
      target_source_event_id, target_source_reference, target_related_transaction_id,
      target_idempotency_key, target_request_sha256, target_reason,
      coalesce(target_metadata, '{}'::jsonb), target_effective_at
    );
  exception when unique_violation then
    select transaction.* into existing_transaction
    from loyalty.ledger_transactions as transaction
    where transaction.organization_id = target_organization_id
      and transaction.idempotency_key = target_idempotency_key;
    if not found then
      raise;
    end if;
    if existing_transaction.request_sha256 <> target_request_sha256 then
      raise exception using errcode = '23514', message = 'idempotency key reused with different request hash';
    end if;
    return query select existing_transaction.id, existing_transaction.public_id, 'duplicate'::text;
    return;
  end;

  return query select new_transaction_id, new_transaction_public_id, 'created'::text;
end;
$$;

create or replace function loyalty_private.award_points(
  target_organization_id bigint,
  target_programme_group_id bigint,
  target_programme_version_id bigint,
  target_customer_id bigint,
  target_points bigint,
  target_idempotency_key text,
  target_request_sha256 bytea,
  target_source_event_id bigint default null,
  target_source_reference text default null,
  target_effective_at timestamptz default now()
)
returns table (transaction_public_id uuid, wallet_public_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_wallet_id bigint;
  issuance_account_id bigint;
  pending_account_id bigint;
  posted record;
begin
  if target_points <= 0 then
    raise exception using errcode = '22023', message = 'award points must be positive';
  end if;
  target_wallet_id := loyalty_private.ensure_wallet_accounts(
    target_organization_id, target_programme_group_id, target_customer_id
  );
  select account.id into issuance_account_id from loyalty.ledger_accounts as account
  where account.organization_id = target_organization_id
    and account.programme_group_id = target_programme_group_id
    and account.wallet_id is null and account.account_kind = 'issuance';
  select account.id into pending_account_id from loyalty.ledger_accounts as account
  where account.organization_id = target_organization_id
    and account.wallet_id = target_wallet_id and account.account_kind = 'pending';

  select * into posted from loyalty_private.post_ledger_transaction(
    target_organization_id, target_programme_group_id, target_programme_version_id,
    'award', case when target_source_event_id is null then 'worker' else 'commerce_event' end,
    coalesce(target_source_reference, 'loyalty-worker'), target_source_event_id,
    target_source_reference, null, target_idempotency_key, target_request_sha256,
    null, jsonb_build_object('points', target_points), target_effective_at,
    jsonb_build_array(
      jsonb_build_object('account_id', issuance_account_id, 'points', -target_points),
      jsonb_build_object('account_id', pending_account_id, 'points', target_points)
    )
  );
  return query
  select posted.transaction_public_id, wallet.public_id, posted.outcome
  from loyalty.wallets as wallet where wallet.id = target_wallet_id;
end;
$$;

create or replace function loyalty_private.release_points(
  target_organization_id bigint,
  target_programme_group_id bigint,
  target_programme_version_id bigint,
  target_origin_entry_public_id uuid,
  target_expires_at timestamptz,
  target_idempotency_key text,
  target_request_sha256 bytea,
  target_effective_at timestamptz default now()
)
returns table (transaction_public_id uuid, lot_public_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  origin_entry loyalty.ledger_entries%rowtype;
  target_wallet_id bigint;
  pending_account_id bigint;
  available_account_id bigint;
  available_entry_id bigint;
  posted record;
  resulting_lot_public_id uuid;
begin
  select entry.* into origin_entry
  from loyalty.ledger_entries as entry
  join loyalty.ledger_accounts as account on account.id = entry.account_id
  where entry.public_id = target_origin_entry_public_id
    and entry.organization_id = target_organization_id
    and entry.programme_group_id = target_programme_group_id
    and account.account_kind = 'pending'
    and entry.points > 0;
  if not found then
    raise exception using errcode = '22023', message = 'unknown pending award entry';
  end if;
  if target_expires_at <= target_effective_at then
    raise exception using errcode = '22023', message = 'expiry must follow availability';
  end if;

  select account.wallet_id, account.id into target_wallet_id, pending_account_id
  from loyalty.ledger_accounts as account where account.id = origin_entry.account_id;
  select account.id into available_account_id from loyalty.ledger_accounts as account
  where account.organization_id = target_organization_id
    and account.wallet_id = target_wallet_id and account.account_kind = 'available';

  perform 1 from loyalty.wallet_balances as balance
  where balance.organization_id = target_organization_id
    and balance.wallet_id = target_wallet_id
  order by balance.ledger_account_id for update;

  select * into posted from loyalty_private.post_ledger_transaction(
    target_organization_id, target_programme_group_id, target_programme_version_id,
    'release', 'system', 'release-scheduler', null,
    'origin-entry:' || target_origin_entry_public_id::text, null,
    target_idempotency_key, target_request_sha256, null,
    jsonb_build_object('origin_entry_public_id', target_origin_entry_public_id),
    target_effective_at,
    jsonb_build_array(
      jsonb_build_object('account_id', pending_account_id, 'points', -origin_entry.points, 'origin_entry_id', origin_entry.id),
      jsonb_build_object('account_id', available_account_id, 'points', origin_entry.points, 'origin_entry_id', origin_entry.id)
    )
  );

  select entry.id into available_entry_id
  from loyalty.ledger_entries as entry
  where entry.transaction_id = posted.transaction_id and entry.account_id = available_account_id;

  insert into loyalty.point_lots (
    organization_id, programme_group_id, wallet_id, programme_version_id,
    credit_entry_id, origin_entry_id, initial_points, available_at, expires_at
  ) values (
    target_organization_id, target_programme_group_id, target_wallet_id,
    target_programme_version_id, available_entry_id, origin_entry.id,
    origin_entry.points, target_effective_at, target_expires_at
  ) on conflict (organization_id, origin_entry_id) do nothing;

  select lot.public_id into resulting_lot_public_id
  from loyalty.point_lots as lot
  where lot.organization_id = target_organization_id and lot.origin_entry_id = origin_entry.id;

  insert into loyalty.point_lot_balances (lot_id, organization_id, wallet_id, remaining_points)
  select lot.id, lot.organization_id, lot.wallet_id, lot.initial_points
  from loyalty.point_lots as lot
  where lot.organization_id = target_organization_id and lot.origin_entry_id = origin_entry.id
  on conflict (lot_id) do nothing;

  return query select posted.transaction_public_id, resulting_lot_public_id, posted.outcome;
end;
$$;

create or replace function loyalty_private.reserve_points(
  target_organization_id bigint,
  target_programme_group_id bigint,
  target_programme_version_id bigint,
  target_wallet_public_id uuid,
  target_points bigint,
  target_idempotency_key text,
  target_request_sha256 bytea,
  target_effective_at timestamptz default now()
)
returns table (transaction_public_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_wallet_id bigint;
  available_account_id bigint;
  reserved_account_id bigint;
  available_points bigint;
  remaining_to_allocate bigint;
  allocation_points bigint;
  candidate record;
  posted record;
begin
  if target_points <= 0 then
    raise exception using errcode = '22023', message = 'reservation points must be positive';
  end if;
  select wallet.id into target_wallet_id from loyalty.wallets as wallet
  where wallet.public_id = target_wallet_public_id
    and wallet.organization_id = target_organization_id
    and wallet.programme_group_id = target_programme_group_id
    and wallet.status = 'active';
  if not found then
    raise exception using errcode = '22023', message = 'unknown active wallet';
  end if;

  perform 1 from loyalty.wallet_balances as balance
  where balance.organization_id = target_organization_id and balance.wallet_id = target_wallet_id
  order by balance.ledger_account_id for update;
  select balance.ledger_account_id, balance.points
  into available_account_id, available_points
  from loyalty.wallet_balances as balance
  where balance.organization_id = target_organization_id
    and balance.wallet_id = target_wallet_id and balance.account_kind = 'available';
  select balance.ledger_account_id into reserved_account_id
  from loyalty.wallet_balances as balance
  where balance.organization_id = target_organization_id
    and balance.wallet_id = target_wallet_id and balance.account_kind = 'reserved';
  if available_points < target_points then
    raise exception using errcode = '23514', message = 'insufficient available points';
  end if;

  select * into posted from loyalty_private.post_ledger_transaction(
    target_organization_id, target_programme_group_id, target_programme_version_id,
    'reserve', 'worker', 'reward-worker', null, null, null,
    target_idempotency_key, target_request_sha256, null,
    jsonb_build_object('points', target_points), target_effective_at,
    jsonb_build_array(
      jsonb_build_object('account_id', available_account_id, 'points', -target_points),
      jsonb_build_object('account_id', reserved_account_id, 'points', target_points)
    )
  );

  if posted.outcome = 'created' then
    remaining_to_allocate := target_points;
    for candidate in
      select lot.id, balance.remaining_points
      from loyalty.point_lots as lot
      join loyalty.point_lot_balances as balance
        on balance.organization_id = lot.organization_id and balance.lot_id = lot.id
      where lot.organization_id = target_organization_id
        and lot.wallet_id = target_wallet_id
        and lot.expires_at > target_effective_at
        and balance.remaining_points > 0
      order by lot.expires_at, lot.available_at, lot.id
      for update of balance
    loop
      exit when remaining_to_allocate = 0;
      allocation_points := least(candidate.remaining_points, remaining_to_allocate);
      insert into loyalty.redemption_allocations (
        organization_id, transaction_id, lot_id, allocation_kind, points
      ) values (
        target_organization_id, posted.transaction_id, candidate.id, 'reserve', allocation_points
      );
      remaining_to_allocate := remaining_to_allocate - allocation_points;
    end loop;
    if remaining_to_allocate <> 0 then
      raise exception using errcode = '23514', message = 'available balance has no matching unexpired lots';
    end if;
  end if;
  return query select posted.transaction_public_id, posted.outcome;
end;
$$;

create or replace function loyalty_private.capture_reservation(
  target_organization_id bigint,
  target_reservation_public_id uuid,
  target_idempotency_key text,
  target_request_sha256 bytea,
  target_effective_at timestamptz default now()
)
returns table (transaction_public_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation loyalty.ledger_transactions%rowtype;
  reserved_account_id bigint;
  spent_account_id bigint;
  reserved_points bigint;
  target_wallet_id bigint;
  posted record;
begin
  select transaction.* into reservation from loyalty.ledger_transactions as transaction
  where transaction.public_id = target_reservation_public_id
    and transaction.organization_id = target_organization_id
    and transaction.transaction_kind = 'reserve';
  if not found then
    raise exception using errcode = '22023', message = 'unknown reservation transaction';
  end if;
  select entry.account_id, entry.points, account.wallet_id
  into reserved_account_id, reserved_points, target_wallet_id
  from loyalty.ledger_entries as entry
  join loyalty.ledger_accounts as account on account.id = entry.account_id
  where entry.transaction_id = reservation.id and account.account_kind = 'reserved' and entry.points > 0;
  select account.id into spent_account_id from loyalty.ledger_accounts as account
  where account.organization_id = target_organization_id
    and account.wallet_id = target_wallet_id and account.account_kind = 'spent';
  perform 1 from loyalty.wallet_balances as balance
  where balance.organization_id = target_organization_id and balance.wallet_id = target_wallet_id
  order by balance.ledger_account_id for update;

  select * into posted from loyalty_private.post_ledger_transaction(
    target_organization_id, reservation.programme_group_id, reservation.programme_version_id,
    'capture', 'worker', 'reward-worker', null, null, reservation.id,
    target_idempotency_key, target_request_sha256, null,
    jsonb_build_object('reservation_public_id', target_reservation_public_id),
    target_effective_at,
    jsonb_build_array(
      jsonb_build_object('account_id', reserved_account_id, 'points', -reserved_points),
      jsonb_build_object('account_id', spent_account_id, 'points', reserved_points)
    )
  );
  return query select posted.transaction_public_id, posted.outcome;
end;
$$;

create or replace function loyalty_private.cancel_reservation(
  target_organization_id bigint,
  target_reservation_public_id uuid,
  target_idempotency_key text,
  target_request_sha256 bytea,
  target_effective_at timestamptz default now()
)
returns table (transaction_public_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation loyalty.ledger_transactions%rowtype;
  reserved_account_id bigint;
  available_account_id bigint;
  reserved_points bigint;
  target_wallet_id bigint;
  allocation record;
  posted record;
begin
  select transaction.* into reservation from loyalty.ledger_transactions as transaction
  where transaction.public_id = target_reservation_public_id
    and transaction.organization_id = target_organization_id
    and transaction.transaction_kind = 'reserve';
  if not found then
    raise exception using errcode = '22023', message = 'unknown reservation transaction';
  end if;
  select entry.account_id, entry.points, account.wallet_id
  into reserved_account_id, reserved_points, target_wallet_id
  from loyalty.ledger_entries as entry
  join loyalty.ledger_accounts as account on account.id = entry.account_id
  where entry.transaction_id = reservation.id and account.account_kind = 'reserved' and entry.points > 0;
  select account.id into available_account_id from loyalty.ledger_accounts as account
  where account.organization_id = target_organization_id
    and account.wallet_id = target_wallet_id and account.account_kind = 'available';
  perform 1 from loyalty.wallet_balances as balance
  where balance.organization_id = target_organization_id and balance.wallet_id = target_wallet_id
  order by balance.ledger_account_id for update;

  select * into posted from loyalty_private.post_ledger_transaction(
    target_organization_id, reservation.programme_group_id, reservation.programme_version_id,
    'cancel', 'worker', 'reward-worker', null, null, reservation.id,
    target_idempotency_key, target_request_sha256, null,
    jsonb_build_object('reservation_public_id', target_reservation_public_id),
    target_effective_at,
    jsonb_build_array(
      jsonb_build_object('account_id', reserved_account_id, 'points', -reserved_points),
      jsonb_build_object('account_id', available_account_id, 'points', reserved_points)
    )
  );
  if posted.outcome = 'created' then
    for allocation in
      select reserved_allocation.*
      from loyalty.redemption_allocations as reserved_allocation
      join loyalty.point_lot_balances as balance on balance.lot_id = reserved_allocation.lot_id
      where reserved_allocation.organization_id = target_organization_id
        and reserved_allocation.transaction_id = reservation.id
        and reserved_allocation.allocation_kind = 'reserve'
      order by reserved_allocation.lot_id
      for update of balance
    loop
      insert into loyalty.redemption_allocations (
        organization_id, transaction_id, lot_id, related_allocation_id,
        allocation_kind, points
      ) values (
        target_organization_id, posted.transaction_id, allocation.lot_id,
        allocation.id, 'cancel', -allocation.points
      );
    end loop;
  end if;
  return query select posted.transaction_public_id, posted.outcome;
end;
$$;

create or replace function loyalty_private.expire_points(
  target_organization_id bigint,
  target_wallet_public_id uuid,
  target_programme_version_id bigint,
  target_as_of timestamptz,
  target_idempotency_key text,
  target_request_sha256 bytea
)
returns table (transaction_public_id uuid, expired_points bigint, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_wallet loyalty.wallets%rowtype;
  available_account_id bigint;
  expired_account_id bigint;
  total_to_expire bigint := 0;
  candidate record;
  posted record;
begin
  select wallet.* into target_wallet from loyalty.wallets as wallet
  where wallet.public_id = target_wallet_public_id
    and wallet.organization_id = target_organization_id and wallet.status = 'active';
  if not found then
    raise exception using errcode = '22023', message = 'unknown active wallet';
  end if;
  perform 1 from loyalty.wallet_balances as balance
  where balance.organization_id = target_organization_id and balance.wallet_id = target_wallet.id
  order by balance.ledger_account_id for update;
  select account.id into available_account_id from loyalty.ledger_accounts as account
  where account.organization_id = target_organization_id
    and account.wallet_id = target_wallet.id and account.account_kind = 'available';
  select account.id into expired_account_id from loyalty.ledger_accounts as account
  where account.organization_id = target_organization_id
    and account.wallet_id = target_wallet.id and account.account_kind = 'expired';
  select coalesce(sum(balance.remaining_points), 0) into total_to_expire
  from loyalty.point_lots as lot
  join loyalty.point_lot_balances as balance on balance.lot_id = lot.id
  where lot.organization_id = target_organization_id and lot.wallet_id = target_wallet.id
    and lot.expires_at <= target_as_of and balance.remaining_points > 0;
  if total_to_expire <= 0 then
    raise exception using errcode = '22023', message = 'no eligible points to expire';
  end if;

  select * into posted from loyalty_private.post_ledger_transaction(
    target_organization_id, target_wallet.programme_group_id, target_programme_version_id,
    'expire', 'system', 'expiry-scheduler', null, null, null,
    target_idempotency_key, target_request_sha256, null,
    jsonb_build_object('as_of', target_as_of, 'points', total_to_expire), target_as_of,
    jsonb_build_array(
      jsonb_build_object('account_id', available_account_id, 'points', -total_to_expire),
      jsonb_build_object('account_id', expired_account_id, 'points', total_to_expire)
    )
  );
  if posted.outcome = 'created' then
    for candidate in
      select lot.id, balance.remaining_points
      from loyalty.point_lots as lot
      join loyalty.point_lot_balances as balance on balance.lot_id = lot.id
      where lot.organization_id = target_organization_id and lot.wallet_id = target_wallet.id
        and lot.expires_at <= target_as_of and balance.remaining_points > 0
      order by lot.expires_at, lot.available_at, lot.id
      for update of balance
    loop
      insert into loyalty.redemption_allocations (
        organization_id, transaction_id, lot_id, allocation_kind, points
      ) values (
        target_organization_id, posted.transaction_id, candidate.id,
        'expire', candidate.remaining_points
      );
    end loop;
  end if;
  return query select posted.transaction_public_id, total_to_expire, posted.outcome;
end;
$$;

create or replace function loyalty_private.reverse_award_points(
  target_organization_id bigint,
  target_origin_entry_public_id uuid,
  target_points bigint,
  target_idempotency_key text,
  target_request_sha256 bytea,
  target_reason text,
  target_effective_at timestamptz default now()
)
returns table (transaction_public_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  origin_entry loyalty.ledger_entries%rowtype;
  origin_transaction loyalty.ledger_transactions%rowtype;
  target_wallet_id bigint;
  debit_account_id bigint;
  reversed_account_id bigint;
  target_lot_id bigint;
  lot_remaining bigint;
  lot_consumption bigint;
  already_reversed bigint;
  posted record;
begin
  if target_points <= 0 or length(btrim(target_reason)) < 8 then
    raise exception using errcode = '22023', message = 'reversal requires positive points and a reason';
  end if;
  select entry.* into origin_entry
  from loyalty.ledger_entries as entry
  join loyalty.ledger_accounts as account on account.id = entry.account_id
  where entry.public_id = target_origin_entry_public_id
    and entry.organization_id = target_organization_id
    and account.account_kind = 'pending' and entry.points > 0;
  if not found then
    raise exception using errcode = '22023', message = 'unknown original award entry';
  end if;
  select transaction.* into origin_transaction
  from loyalty.ledger_transactions as transaction where transaction.id = origin_entry.transaction_id;
  select account.wallet_id into target_wallet_id from loyalty.ledger_accounts as account
  where account.id = origin_entry.account_id;
  perform 1 from loyalty.wallet_balances as balance
  where balance.organization_id = target_organization_id and balance.wallet_id = target_wallet_id
  order by balance.ledger_account_id for update;

  select coalesce(sum(entry.points), 0)::bigint into already_reversed
  from loyalty.ledger_entries as entry
  join loyalty.ledger_accounts as account on account.id = entry.account_id
  join loyalty.ledger_transactions as transaction on transaction.id = entry.transaction_id
  where entry.organization_id = target_organization_id
    and entry.origin_entry_id = origin_entry.id
    and account.account_kind = 'reversed'
    and transaction.transaction_kind = 'refund_reversal';
  if already_reversed + target_points > origin_entry.points then
    raise exception using errcode = '23514', message = 'cumulative reversal exceeds original award';
  end if;

  select lot.id, balance.remaining_points into target_lot_id, lot_remaining
  from loyalty.point_lots as lot
  join loyalty.point_lot_balances as balance on balance.lot_id = lot.id
  where lot.organization_id = target_organization_id and lot.origin_entry_id = origin_entry.id
  for update of balance;
  if found then
    select account.id into debit_account_id from loyalty.ledger_accounts as account
    where account.organization_id = target_organization_id
      and account.wallet_id = target_wallet_id and account.account_kind = 'available';
  else
    debit_account_id := origin_entry.account_id;
  end if;
  select account.id into reversed_account_id from loyalty.ledger_accounts as account
  where account.organization_id = target_organization_id
    and account.wallet_id = target_wallet_id and account.account_kind = 'reversed';

  select * into posted from loyalty_private.post_ledger_transaction(
    target_organization_id, origin_transaction.programme_group_id,
    origin_transaction.programme_version_id, 'refund_reversal', 'worker',
    'refund-worker', null, 'origin-entry:' || target_origin_entry_public_id::text,
    origin_transaction.id, target_idempotency_key, target_request_sha256,
    target_reason, jsonb_build_object('points', target_points), target_effective_at,
    jsonb_build_array(
      jsonb_build_object('account_id', debit_account_id, 'points', -target_points, 'origin_entry_id', origin_entry.id),
      jsonb_build_object('account_id', reversed_account_id, 'points', target_points, 'origin_entry_id', origin_entry.id)
    )
  );
  if posted.outcome = 'created' and target_lot_id is not null and lot_remaining > 0 then
    lot_consumption := least(target_points, lot_remaining);
    insert into loyalty.redemption_allocations (
      organization_id, transaction_id, lot_id, allocation_kind, points
    ) values (
      target_organization_id, posted.transaction_id, target_lot_id, 'reversal', lot_consumption
    );
  end if;
  return query select posted.transaction_public_id, posted.outcome;
end;
$$;

create or replace function loyalty_private.adjust_points(
  target_organization_id bigint,
  target_wallet_public_id uuid,
  target_programme_version_id bigint,
  target_points bigint,
  target_reason text,
  target_actor_id text,
  target_idempotency_key text,
  target_request_sha256 bytea,
  target_expires_at timestamptz,
  target_effective_at timestamptz default now()
)
returns table (transaction_public_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_wallet loyalty.wallets%rowtype;
  available_account_id bigint;
  adjustment_account_id bigint;
  available_entry_id bigint;
  remaining_to_allocate bigint;
  allocation_points bigint;
  candidate record;
  posted record;
begin
  if target_points = 0 or length(btrim(target_reason)) < 8 then
    raise exception using errcode = '22023', message = 'adjustment requires non-zero points and a reason';
  end if;
  select wallet.* into target_wallet from loyalty.wallets as wallet
  where wallet.public_id = target_wallet_public_id
    and wallet.organization_id = target_organization_id and wallet.status = 'active';
  if not found then
    raise exception using errcode = '22023', message = 'unknown active wallet';
  end if;
  if target_points > 0 and (target_expires_at is null or target_expires_at <= target_effective_at) then
    raise exception using errcode = '22023', message = 'positive adjustment requires a future expiry';
  end if;
  perform 1 from loyalty.wallet_balances as balance
  where balance.organization_id = target_organization_id and balance.wallet_id = target_wallet.id
  order by balance.ledger_account_id for update;
  select account.id into available_account_id from loyalty.ledger_accounts as account
  where account.organization_id = target_organization_id
    and account.wallet_id = target_wallet.id and account.account_kind = 'available';
  select account.id into adjustment_account_id from loyalty.ledger_accounts as account
  where account.organization_id = target_organization_id
    and account.programme_group_id = target_wallet.programme_group_id
    and account.wallet_id is null and account.account_kind = 'adjustment';

  select * into posted from loyalty_private.post_ledger_transaction(
    target_organization_id, target_wallet.programme_group_id, target_programme_version_id,
    'manual_adjustment', 'merchant', target_actor_id, null, null, null,
    target_idempotency_key, target_request_sha256, target_reason,
    jsonb_build_object('points', target_points), target_effective_at,
    jsonb_build_array(
      jsonb_build_object('account_id', adjustment_account_id, 'points', -target_points),
      jsonb_build_object('account_id', available_account_id, 'points', target_points)
    )
  );
  if posted.outcome = 'created' and target_points > 0 then
    select entry.id into available_entry_id
    from loyalty.ledger_entries as entry
    where entry.transaction_id = posted.transaction_id and entry.account_id = available_account_id;
    insert into loyalty.point_lots (
      organization_id, programme_group_id, wallet_id, programme_version_id,
      credit_entry_id, origin_entry_id, initial_points, available_at, expires_at
    ) values (
      target_organization_id, target_wallet.programme_group_id, target_wallet.id,
      target_programme_version_id, available_entry_id, available_entry_id,
      target_points, target_effective_at, target_expires_at
    );
    insert into loyalty.point_lot_balances (lot_id, organization_id, wallet_id, remaining_points)
    select lot.id, lot.organization_id, lot.wallet_id, lot.initial_points
    from loyalty.point_lots as lot
    where lot.organization_id = target_organization_id and lot.credit_entry_id = available_entry_id;
  elsif posted.outcome = 'created' and target_points < 0 then
    remaining_to_allocate := -target_points;
    for candidate in
      select lot.id, balance.remaining_points
      from loyalty.point_lots as lot
      join loyalty.point_lot_balances as balance on balance.lot_id = lot.id
      where lot.organization_id = target_organization_id and lot.wallet_id = target_wallet.id
        and balance.remaining_points > 0
      order by lot.expires_at, lot.available_at, lot.id
      for update of balance
    loop
      exit when remaining_to_allocate = 0;
      allocation_points := least(candidate.remaining_points, remaining_to_allocate);
      insert into loyalty.redemption_allocations (
        organization_id, transaction_id, lot_id, allocation_kind, points
      ) values (
        target_organization_id, posted.transaction_id, candidate.id,
        'adjustment', allocation_points
      );
      remaining_to_allocate := remaining_to_allocate - allocation_points;
    end loop;
  end if;
  return query select posted.transaction_public_id, posted.outcome;
end;
$$;

create or replace function loyalty_private.wallet_projection_differences(
  target_organization_id bigint default null
)
returns table (
  organization_id bigint, wallet_id bigint, account_kind text,
  stored_points bigint, rebuilt_points bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select balance.organization_id, balance.wallet_id, balance.account_kind,
    balance.points as stored_points, coalesce(sum(entry.points), 0)::bigint as rebuilt_points
  from loyalty.wallet_balances as balance
  left join loyalty.ledger_entries as entry
    on entry.organization_id = balance.organization_id
    and entry.account_id = balance.ledger_account_id
  where target_organization_id is null or balance.organization_id = target_organization_id
  group by balance.ledger_account_id, balance.organization_id, balance.wallet_id,
    balance.account_kind, balance.points
  having balance.points <> coalesce(sum(entry.points), 0)::bigint;
$$;

create or replace function loyalty_private.rebuild_wallet_projections(
  target_organization_id bigint,
  target_wallet_id bigint default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  rebuilt_count bigint;
begin
  perform 1 from loyalty.wallet_balances as balance
  where balance.organization_id = target_organization_id
    and (target_wallet_id is null or balance.wallet_id = target_wallet_id)
  order by balance.wallet_id, balance.ledger_account_id for update;

  update loyalty.wallet_balances as balance
  set points = coalesce((
        select sum(entry.points)::bigint from loyalty.ledger_entries as entry
        where entry.organization_id = balance.organization_id
          and entry.account_id = balance.ledger_account_id
      ), 0),
      updated_at = clock_timestamp()
  where balance.organization_id = target_organization_id
    and (target_wallet_id is null or balance.wallet_id = target_wallet_id);
  get diagnostics rebuilt_count = row_count;
  return rebuilt_count;
end;
$$;

alter function loyalty_private.reject_immutable_change() owner to loyalty_owner;
alter function loyalty_private.protect_programme_version() owner to loyalty_owner;
alter function loyalty_private.apply_ledger_entry_projection() owner to loyalty_owner;
alter function loyalty_private.apply_lot_allocation_projection() owner to loyalty_owner;
alter function loyalty_private.validate_ledger_transaction() owner to loyalty_owner;
alter function loyalty_private.ensure_wallet_accounts(bigint, bigint, bigint) owner to loyalty_owner;
alter function loyalty_private.post_ledger_transaction(
  bigint, bigint, bigint, text, text, text, bigint, text, bigint, text,
  bytea, text, jsonb, timestamptz, jsonb
) owner to loyalty_owner;
alter function loyalty_private.award_points(
  bigint, bigint, bigint, bigint, bigint, text, bytea, bigint, text, timestamptz
) owner to loyalty_owner;
alter function loyalty_private.release_points(
  bigint, bigint, bigint, uuid, timestamptz, text, bytea, timestamptz
) owner to loyalty_owner;
alter function loyalty_private.reserve_points(
  bigint, bigint, bigint, uuid, bigint, text, bytea, timestamptz
) owner to loyalty_owner;
alter function loyalty_private.capture_reservation(
  bigint, uuid, text, bytea, timestamptz
) owner to loyalty_owner;
alter function loyalty_private.cancel_reservation(
  bigint, uuid, text, bytea, timestamptz
) owner to loyalty_owner;
alter function loyalty_private.expire_points(
  bigint, uuid, bigint, timestamptz, text, bytea
) owner to loyalty_owner;
alter function loyalty_private.reverse_award_points(
  bigint, uuid, bigint, text, bytea, text, timestamptz
) owner to loyalty_owner;
alter function loyalty_private.adjust_points(
  bigint, uuid, bigint, bigint, text, text, text, bytea, timestamptz, timestamptz
) owner to loyalty_owner;
alter function loyalty_private.wallet_projection_differences(bigint) owner to loyalty_owner;
alter function loyalty_private.rebuild_wallet_projections(bigint, bigint) owner to loyalty_owner;

revoke all on function loyalty_private.ensure_wallet_accounts(bigint, bigint, bigint)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function loyalty_private.post_ledger_transaction(
  bigint, bigint, bigint, text, text, text, bigint, text, bigint, text,
  bytea, text, jsonb, timestamptz, jsonb
) from public, anon, authenticated, loyalty_runtime, loyalty_worker;

revoke all on function loyalty_private.reject_immutable_change(),
  loyalty_private.protect_programme_version(),
  loyalty_private.apply_ledger_entry_projection(),
  loyalty_private.apply_lot_allocation_projection(),
  loyalty_private.validate_ledger_transaction(),
  loyalty_private.award_points(bigint, bigint, bigint, bigint, bigint, text, bytea, bigint, text, timestamptz),
  loyalty_private.release_points(bigint, bigint, bigint, uuid, timestamptz, text, bytea, timestamptz),
  loyalty_private.reserve_points(bigint, bigint, bigint, uuid, bigint, text, bytea, timestamptz),
  loyalty_private.capture_reservation(bigint, uuid, text, bytea, timestamptz),
  loyalty_private.cancel_reservation(bigint, uuid, text, bytea, timestamptz),
  loyalty_private.expire_points(bigint, uuid, bigint, timestamptz, text, bytea),
  loyalty_private.reverse_award_points(bigint, uuid, bigint, text, bytea, text, timestamptz),
  loyalty_private.adjust_points(bigint, uuid, bigint, bigint, text, text, text, bytea, timestamptz, timestamptz),
  loyalty_private.wallet_projection_differences(bigint),
  loyalty_private.rebuild_wallet_projections(bigint, bigint)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty_private.award_points(
  bigint, bigint, bigint, bigint, bigint, text, bytea, bigint, text, timestamptz
) to loyalty_worker;
grant execute on function loyalty_private.release_points(
  bigint, bigint, bigint, uuid, timestamptz, text, bytea, timestamptz
) to loyalty_worker;
grant execute on function loyalty_private.reserve_points(
  bigint, bigint, bigint, uuid, bigint, text, bytea, timestamptz
) to loyalty_worker;
grant execute on function loyalty_private.capture_reservation(
  bigint, uuid, text, bytea, timestamptz
) to loyalty_worker;
grant execute on function loyalty_private.cancel_reservation(
  bigint, uuid, text, bytea, timestamptz
) to loyalty_worker;
grant execute on function loyalty_private.expire_points(
  bigint, uuid, bigint, timestamptz, text, bytea
) to loyalty_worker;
grant execute on function loyalty_private.reverse_award_points(
  bigint, uuid, bigint, text, bytea, text, timestamptz
) to loyalty_worker;
grant execute on function loyalty_private.adjust_points(
  bigint, uuid, bigint, bigint, text, text, text, bytea, timestamptz, timestamptz
) to loyalty_worker;
grant execute on function loyalty_private.wallet_projection_differences(bigint)
  to loyalty_worker;
grant execute on function loyalty_private.rebuild_wallet_projections(bigint, bigint)
  to loyalty_worker;

alter table loyalty.programmes enable row level security;
alter table loyalty.programme_versions enable row level security;
alter table loyalty.customers enable row level security;
alter table loyalty.customer_identities enable row level security;
alter table loyalty.wallets enable row level security;
alter table loyalty.ledger_accounts enable row level security;
alter table loyalty.ledger_transactions enable row level security;
alter table loyalty.ledger_entries enable row level security;
alter table loyalty.wallet_balances enable row level security;
alter table loyalty.point_lots enable row level security;
alter table loyalty.point_lot_balances enable row level security;
alter table loyalty.redemption_allocations enable row level security;

create policy programmes_member_select on loyalty.programmes
  for select to authenticated using ((select loyalty_private.is_organization_member(organization_id)));
create policy programme_versions_member_select on loyalty.programme_versions
  for select to authenticated using ((select loyalty_private.is_organization_member(organization_id)));
create policy customers_member_select on loyalty.customers
  for select to authenticated using ((select loyalty_private.is_organization_member(organization_id)));
create policy customer_identities_member_select on loyalty.customer_identities
  for select to authenticated using ((select loyalty_private.is_organization_member(organization_id)));
create policy wallets_member_select on loyalty.wallets
  for select to authenticated using ((select loyalty_private.is_organization_member(organization_id)));
create policy ledger_accounts_member_select on loyalty.ledger_accounts
  for select to authenticated using ((select loyalty_private.is_organization_member(organization_id)));
create policy ledger_transactions_member_select on loyalty.ledger_transactions
  for select to authenticated using ((select loyalty_private.is_organization_member(organization_id)));
create policy ledger_entries_member_select on loyalty.ledger_entries
  for select to authenticated using ((select loyalty_private.is_organization_member(organization_id)));
create policy wallet_balances_member_select on loyalty.wallet_balances
  for select to authenticated using ((select loyalty_private.is_organization_member(organization_id)));
create policy point_lots_member_select on loyalty.point_lots
  for select to authenticated using ((select loyalty_private.is_organization_member(organization_id)));
create policy point_lot_balances_member_select on loyalty.point_lot_balances
  for select to authenticated using ((select loyalty_private.is_organization_member(organization_id)));
create policy redemption_allocations_member_select on loyalty.redemption_allocations
  for select to authenticated using ((select loyalty_private.is_organization_member(organization_id)));

create policy programmes_worker_select on loyalty.programmes
  for select to loyalty_worker using (true);
create policy programme_versions_worker_select on loyalty.programme_versions
  for select to loyalty_worker using (true);
create policy customers_worker_select on loyalty.customers
  for select to loyalty_worker using (true);
create policy customer_identities_worker_select on loyalty.customer_identities
  for select to loyalty_worker using (true);
create policy wallets_worker_select on loyalty.wallets
  for select to loyalty_worker using (true);
create policy ledger_accounts_worker_select on loyalty.ledger_accounts
  for select to loyalty_worker using (true);
create policy ledger_transactions_worker_select on loyalty.ledger_transactions
  for select to loyalty_worker using (true);
create policy ledger_entries_worker_select on loyalty.ledger_entries
  for select to loyalty_worker using (true);
create policy wallet_balances_worker_select on loyalty.wallet_balances
  for select to loyalty_worker using (true);
create policy point_lots_worker_select on loyalty.point_lots
  for select to loyalty_worker using (true);
create policy point_lot_balances_worker_select on loyalty.point_lot_balances
  for select to loyalty_worker using (true);
create policy redemption_allocations_worker_select on loyalty.redemption_allocations
  for select to loyalty_worker using (true);

revoke all on loyalty.programmes, loyalty.programme_versions, loyalty.customers,
  loyalty.customer_identities, loyalty.wallets, loyalty.ledger_accounts,
  loyalty.ledger_transactions, loyalty.ledger_entries, loyalty.wallet_balances,
  loyalty.point_lots, loyalty.point_lot_balances, loyalty.redemption_allocations
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

grant select on loyalty.programmes, loyalty.programme_versions, loyalty.customers,
  loyalty.customer_identities, loyalty.wallets, loyalty.ledger_accounts,
  loyalty.ledger_transactions, loyalty.ledger_entries, loyalty.wallet_balances,
  loyalty.point_lots, loyalty.point_lot_balances, loyalty.redemption_allocations
  to authenticated, loyalty_worker;

comment on table loyalty.ledger_transactions is
  'Immutable attributable operation header; one tenant-scoped idempotency key has one canonical request hash.';
comment on table loyalty.ledger_entries is
  'Immutable signed points entries; every transaction has at least two entries and sums exactly to zero.';
comment on table loyalty.wallet_balances is
  'Transactional cache rebuilt solely from immutable ledger entries.';
comment on table loyalty.point_lots is
  'Immutable available-credit lots preserving programme version and original award attribution.';
comment on table loyalty.redemption_allocations is
  'Immutable FIFO lot consumption and compensating cancellation allocations.';
