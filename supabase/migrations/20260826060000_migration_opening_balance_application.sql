-- M12-S02 receipt-bound opening balances. Exact canonical documents and
-- resolutions are re-presented transiently and matched to the value-free
-- receipt before PostgreSQL derives tenant, customer, wallet, and ledger
-- authority. Persisted evidence contains opaque source references, never raw
-- source identities or exports.

alter table loyalty.ledger_transactions
  drop constraint ledger_transactions_transaction_kind_check;
alter table loyalty.ledger_transactions
  add constraint ledger_transactions_transaction_kind_check check (
    transaction_kind in (
      'award', 'release', 'reserve', 'capture', 'cancel', 'expire',
      'refund_reversal', 'manual_adjustment', 'opening_balance'
    )
  );

create table loyalty.migration_import_batches (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null
    references loyalty.organizations(id) on delete restrict,
  dry_run_id bigint not null,
  programme_group_id bigint not null,
  programme_version_id bigint not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  source_system text not null,
  source_export_sha256 bytea not null check (octet_length(source_export_sha256) = 32),
  canonical_document_sha256 bytea not null check (octet_length(canonical_document_sha256) = 32),
  resolution_sha256 bytea not null check (octet_length(resolution_sha256) = 32),
  engine_sha256 bytea not null check (octet_length(engine_sha256) = 32),
  approval_sha256 bytea not null check (octet_length(approval_sha256) = 32),
  customer_count integer not null check (customer_count between 1 and 500),
  created_customer_count integer not null check (created_customer_count between 0 and 500),
  available_points bigint not null check (available_points >= 0),
  pending_points bigint not null check (pending_points >= 0),
  request_sha256 bytea not null check (octet_length(request_sha256) = 32),
  idempotency_key text not null,
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, dry_run_id),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, dry_run_id)
    references loyalty.migration_dry_runs(organization_id, id) on delete restrict,
  foreign key (organization_id, programme_group_id)
    references loyalty.programme_groups(organization_id, id) on delete restrict,
  foreign key (organization_id, programme_version_id)
    references loyalty.programme_versions(organization_id, id) on delete restrict,
  check (created_customer_count <= customer_count),
  check (
    length(idempotency_key) between 1 and 160
    and idempotency_key = btrim(idempotency_key)
    and idempotency_key !~ '[[:cntrl:]]'
  )
);

create table loyalty.migration_import_items (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  batch_id bigint not null,
  source_system text not null,
  source_export_sha256 bytea not null check (octet_length(source_export_sha256) = 32),
  source_row_ref text not null,
  identity_sha256 bytea not null check (octet_length(identity_sha256) = 32),
  resolution_basis text not null check (
    resolution_basis in (
      'verified_woocommerce_id', 'explicit_customer', 'explicit_create'
    )
  ),
  customer_id bigint not null,
  wallet_id bigint not null,
  created_customer boolean not null,
  available_points bigint not null check (available_points >= 0),
  pending_points bigint not null check (pending_points >= 0),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, batch_id, source_row_ref),
  unique (
    organization_id, source_system, source_export_sha256, source_row_ref
  ),
  unique (organization_id, batch_id, customer_id),
  foreign key (organization_id, batch_id)
    references loyalty.migration_import_batches(organization_id, id) on delete restrict,
  foreign key (organization_id, customer_id)
    references loyalty.customers(organization_id, id) on delete restrict,
  foreign key (organization_id, wallet_id)
    references loyalty.wallets(organization_id, id) on delete restrict,
  check (
    length(source_row_ref) between 1 and 160
    and source_row_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
  )
);

create table loyalty.migration_import_lots (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  item_id bigint not null,
  source_lot_ref text not null,
  bucket text not null check (bucket in ('available', 'pending')),
  points bigint not null check (points > 0),
  available_at timestamptz not null,
  expires_at timestamptz,
  opening_transaction_id bigint not null,
  opening_credit_entry_id bigint not null,
  point_lot_id bigint,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, item_id, source_lot_ref),
  unique (organization_id, opening_transaction_id),
  unique (organization_id, opening_credit_entry_id),
  foreign key (organization_id, item_id)
    references loyalty.migration_import_items(organization_id, id) on delete restrict,
  foreign key (organization_id, opening_transaction_id)
    references loyalty.ledger_transactions(organization_id, id) on delete restrict,
  foreign key (organization_id, opening_credit_entry_id)
    references loyalty.ledger_entries(organization_id, id) on delete restrict,
  foreign key (organization_id, point_lot_id)
    references loyalty.point_lots(organization_id, id) on delete restrict,
  check (
    length(source_lot_ref) between 1 and 160
    and source_lot_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
  ),
  check (expires_at is null or expires_at > available_at),
  check ((bucket = 'available') = (point_lot_id is not null))
);

create table loyalty.migration_pending_lot_releases (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  import_lot_id bigint not null,
  release_transaction_id bigint not null,
  point_lot_id bigint not null,
  released_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, import_lot_id),
  unique (organization_id, release_transaction_id),
  foreign key (organization_id, import_lot_id)
    references loyalty.migration_import_lots(organization_id, id) on delete restrict,
  foreign key (organization_id, release_transaction_id)
    references loyalty.ledger_transactions(organization_id, id) on delete restrict,
  foreign key (organization_id, point_lot_id)
    references loyalty.point_lots(organization_id, id) on delete restrict
);

create table loyalty.migration_correction_batches (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null
    references loyalty.organizations(id) on delete restrict,
  original_batch_id bigint not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  reason text not null,
  corrected_points bigint not null check (corrected_points >= 0),
  request_sha256 bytea not null check (octet_length(request_sha256) = 32),
  idempotency_key text not null,
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, original_batch_id),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, original_batch_id)
    references loyalty.migration_import_batches(organization_id, id) on delete restrict,
  check (
    length(reason) between 8 and 500
    and reason = btrim(reason)
    and reason !~ '[[:cntrl:]]'
  ),
  check (
    length(idempotency_key) between 1 and 160
    and idempotency_key = btrim(idempotency_key)
    and idempotency_key !~ '[[:cntrl:]]'
  )
);

create table loyalty.migration_correction_items (
  id bigint generated always as identity primary key,
  organization_id bigint not null,
  correction_batch_id bigint not null,
  original_item_id bigint not null,
  pending_transaction_id bigint,
  available_transaction_id bigint,
  corrected_pending_points bigint not null check (corrected_pending_points >= 0),
  corrected_available_points bigint not null check (corrected_available_points >= 0),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, correction_batch_id, original_item_id),
  foreign key (organization_id, correction_batch_id)
    references loyalty.migration_correction_batches(organization_id, id) on delete restrict,
  foreign key (organization_id, original_item_id)
    references loyalty.migration_import_items(organization_id, id) on delete restrict,
  foreign key (organization_id, pending_transaction_id)
    references loyalty.ledger_transactions(organization_id, id) on delete restrict,
  foreign key (organization_id, available_transaction_id)
    references loyalty.ledger_transactions(organization_id, id) on delete restrict,
  check (corrected_pending_points + corrected_available_points > 0),
  check ((corrected_pending_points > 0) = (pending_transaction_id is not null)),
  check ((corrected_available_points > 0) = (available_transaction_id is not null))
);

create index migration_import_batches_history_idx
  on loyalty.migration_import_batches (organization_id, created_at desc, id desc);
create index migration_import_items_batch_idx
  on loyalty.migration_import_items (organization_id, batch_id, id);
create index migration_import_lots_item_idx
  on loyalty.migration_import_lots (organization_id, item_id, id);
create index migration_import_pending_due_idx
  on loyalty.migration_import_lots (available_at, id)
  where bucket = 'pending';
create index migration_correction_batches_history_idx
  on loyalty.migration_correction_batches (organization_id, created_at desc, id desc);

alter table loyalty.migration_import_batches owner to loyalty_owner;
alter table loyalty.migration_import_items owner to loyalty_owner;
alter table loyalty.migration_import_lots owner to loyalty_owner;
alter table loyalty.migration_pending_lot_releases owner to loyalty_owner;
alter table loyalty.migration_correction_batches owner to loyalty_owner;
alter table loyalty.migration_correction_items owner to loyalty_owner;

alter table loyalty.migration_import_batches enable row level security;
alter table loyalty.migration_import_items enable row level security;
alter table loyalty.migration_import_lots enable row level security;
alter table loyalty.migration_pending_lot_releases enable row level security;
alter table loyalty.migration_correction_batches enable row level security;
alter table loyalty.migration_correction_items enable row level security;

create policy migration_import_batches_privileged_select
  on loyalty.migration_import_batches for select to authenticated
  using ((select loyalty_private.has_organization_role(
    organization_id, array['owner', 'admin', 'auditor']::text[]
  )));
create policy migration_import_items_privileged_select
  on loyalty.migration_import_items for select to authenticated
  using ((select loyalty_private.has_organization_role(
    organization_id, array['owner', 'admin', 'auditor']::text[]
  )));
create policy migration_import_lots_privileged_select
  on loyalty.migration_import_lots for select to authenticated
  using ((select loyalty_private.has_organization_role(
    organization_id, array['owner', 'admin', 'auditor']::text[]
  )));
create policy migration_pending_lot_releases_privileged_select
  on loyalty.migration_pending_lot_releases for select to authenticated
  using ((select loyalty_private.has_organization_role(
    organization_id, array['owner', 'admin', 'auditor']::text[]
  )));
create policy migration_correction_batches_privileged_select
  on loyalty.migration_correction_batches for select to authenticated
  using ((select loyalty_private.has_organization_role(
    organization_id, array['owner', 'admin', 'auditor']::text[]
  )));
create policy migration_correction_items_privileged_select
  on loyalty.migration_correction_items for select to authenticated
  using ((select loyalty_private.has_organization_role(
    organization_id, array['owner', 'admin', 'auditor']::text[]
  )));

revoke all on loyalty.migration_import_batches,
  loyalty.migration_import_items, loyalty.migration_import_lots,
  loyalty.migration_pending_lot_releases,
  loyalty.migration_correction_batches, loyalty.migration_correction_items
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant select on loyalty.migration_import_batches,
  loyalty.migration_import_items, loyalty.migration_import_lots,
  loyalty.migration_pending_lot_releases,
  loyalty.migration_correction_batches, loyalty.migration_correction_items
  to authenticated;

create trigger migration_import_batches_immutable
before update or delete on loyalty.migration_import_batches
for each row execute function loyalty_private.reject_immutable_change();
create trigger migration_import_items_immutable
before update or delete on loyalty.migration_import_items
for each row execute function loyalty_private.reject_immutable_change();
create trigger migration_import_lots_immutable
before update or delete on loyalty.migration_import_lots
for each row execute function loyalty_private.reject_immutable_change();
create trigger migration_pending_lot_releases_immutable
before update or delete on loyalty.migration_pending_lot_releases
for each row execute function loyalty_private.reject_immutable_change();
create trigger migration_correction_batches_immutable
before update or delete on loyalty.migration_correction_batches
for each row execute function loyalty_private.reject_immutable_change();
create trigger migration_correction_items_immutable
before update or delete on loyalty.migration_correction_items
for each row execute function loyalty_private.reject_immutable_change();

create or replace function loyalty.apply_migration_opening_balance_v1(
  target_dry_run_public_id uuid,
  target_approval_sha256 text,
  target_canonical_document_json text,
  target_resolutions_json text,
  target_commerce_connection_public_id uuid,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (
  batch_public_id uuid,
  outcome text,
  customer_count integer,
  created_customer_count integer,
  available_points text,
  pending_points text
)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '15s'
as $$
declare
  actor_user_id uuid := loyalty_private.request_user_id();
  target_receipt loyalty.migration_dry_runs%rowtype;
  target_group loyalty.programme_groups%rowtype;
  target_version loyalty.programme_versions%rowtype;
  target_connection loyalty.commerce_connections%rowtype;
  existing_batch loyalty.migration_import_batches%rowtype;
  document jsonb;
  resolutions jsonb;
  document_rows jsonb;
  document_source jsonb;
  expiry_policy jsonb;
  request_hash bytea;
  created_batch_id bigint;
  created_batch_public_id uuid;
  command_time timestamptz := clock_timestamp();
  calculated_rows integer;
  calculated_matched integer;
  calculated_created integer;
  calculated_available numeric;
  calculated_pending numeric;
  resolution record;
  row_value jsonb;
  identity_value jsonb;
  balance_value jsonb;
  target_customer loyalty.customers%rowtype;
  target_wallet_id bigint;
  created_item_id bigint;
  lot_value jsonb;
  effective_lots jsonb;
  source_lot_ref text;
  lot_bucket text;
  lot_points bigint;
  lot_available_at timestamptz;
  lot_expires_at timestamptz;
  issuance_account_id bigint;
  credit_account_id bigint;
  posted record;
  opening_transaction_id bigint;
  opening_credit_entry_id bigint;
  created_point_lot_id bigint;
  identity_canonical text;
  identity_hash bytea;
  item_index integer := 0;
  lot_index integer;
begin
  if actor_user_id is null
    or target_dry_run_public_id is null
    or target_approval_sha256 is null
    or target_approval_sha256 !~ '^[0-9a-f]{64}$'
    or target_canonical_document_json is null
    or octet_length(target_canonical_document_json) not between 2 and 2097152
    or target_resolutions_json is null
    or octet_length(target_resolutions_json) not between 2 and 524288
    or target_idempotency_key is null
    or target_idempotency_key <> btrim(target_idempotency_key)
    or length(target_idempotency_key) not between 1 and 160
    or target_idempotency_key ~ '[[:cntrl:]]'
    or target_correlation_id is null then
    raise exception using errcode = '22023',
      message = 'invalid migration application command';
  end if;

  begin
    document := target_canonical_document_json::jsonb;
    resolutions := target_resolutions_json::jsonb;
  exception when others then
    raise exception using errcode = '22023',
      message = 'invalid migration application command';
  end;
  if jsonb_typeof(document) <> 'object'
    or jsonb_typeof(resolutions) <> 'array' then
    raise exception using errcode = '22023',
      message = 'invalid migration application command';
  end if;

  select dry_run.* into target_receipt
  from loyalty.migration_dry_runs as dry_run
  where dry_run.public_id = target_dry_run_public_id
    and dry_run.status = 'valid'
    and dry_run.created_at >= command_time - interval '24 hours'
    and loyalty_private.has_organization_role(
      dry_run.organization_id, array['owner', 'admin']::text[]
    )
  for update;
  if not found then
    raise exception using errcode = '42501',
      message = 'migration application not authorized';
  end if;

  if target_receipt.approval_sha256 <> decode(target_approval_sha256, 'hex')
    or target_receipt.canonical_document_sha256 <>
      extensions.digest(convert_to(target_canonical_document_json, 'UTF8'), 'sha256')
    or target_receipt.resolution_sha256 <>
      extensions.digest(convert_to(target_resolutions_json, 'UTF8'), 'sha256') then
    raise exception using errcode = '23514',
      message = 'migration application approval is stale';
  end if;

  select programme_group.* into target_group
  from loyalty.programme_groups as programme_group
  where programme_group.id = target_receipt.programme_group_id
    and programme_group.organization_id = target_receipt.organization_id
    and programme_group.status = 'active';
  select version.* into target_version
  from loyalty.programme_versions as version
  where version.id = target_receipt.programme_version_id
    and version.organization_id = target_receipt.organization_id
    and version.programme_group_id = target_receipt.programme_group_id
    and version.status = 'published';
  if target_group.id is null or target_version.id is null then
    raise exception using errcode = '23514',
      message = 'migration application programme changed';
  end if;

  if target_commerce_connection_public_id is not null then
    select connection.* into target_connection
    from loyalty.commerce_connections as connection
    where connection.public_id = target_commerce_connection_public_id
      and connection.organization_id = target_receipt.organization_id
      and connection.platform = 'woocommerce'
      and connection.status = 'active';
    if not found then
      raise exception using errcode = '22023',
        message = 'migration application store is unavailable';
    end if;
  end if;

  document_rows := document -> 'rows';
  document_source := document -> 'source';
  expiry_policy := document -> 'expiryPolicy';
  if document ->> 'schemaVersion' <> '1'
    or document ->> 'programmeGroupId' <> target_group.public_id::text
    or document ->> 'programmeVersionId' <> target_version.public_id::text
    or jsonb_typeof(document_rows) <> 'array'
    or jsonb_array_length(document_rows) not between 1 and 500
    or jsonb_typeof(document_source) <> 'object'
    or document_source ->> 'system' <> target_receipt.source_system
    or document_source ->> 'exportSha256' <>
      encode(target_receipt.source_export_sha256, 'hex')
    or coalesce(document_source ->> 'exportedAt', '') !~
      '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}'
    or jsonb_typeof(expiry_policy) <> 'object'
    or expiry_policy ->> 'mode' not in ('preserve_exact', 'apply_default') then
    raise exception using errcode = '22023',
      message = 'invalid migration application document';
  end if;

  if expiry_policy ->> 'mode' = 'apply_default'
    and (
      coalesce(expiry_policy ->> 'expiresAt', '') !~
        '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}'
      or (expiry_policy ->> 'expiresAt')::timestamptz <= command_time
    ) then
    raise exception using errcode = '23514',
      message = 'migration application expiry is stale';
  end if;

  select count(*)::integer,
    count(*) filter (where value ->> 'outcome' = 'matched_existing')::integer,
    count(*) filter (where value ->> 'outcome' = 'create_new')::integer
  into calculated_rows, calculated_matched, calculated_created
  from jsonb_array_elements(resolutions);
  if calculated_rows <> jsonb_array_length(document_rows)
    or calculated_rows <> target_receipt.row_count
    or calculated_matched <> target_receipt.matched_count
    or calculated_created <> target_receipt.create_count
    or exists (
      select 1 from jsonb_array_elements(resolutions) as candidate(value)
      where candidate.value ->> 'outcome' not in ('matched_existing', 'create_new')
        or candidate.value ->> 'basis' not in (
          'verified_woocommerce_id', 'explicit_customer', 'explicit_create'
        )
        or coalesce(candidate.value ->> 'sourceRowId', '') !~
          '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
        or coalesce(candidate.value ->> 'identitySha256', '') !~ '^[0-9a-f]{64}$'
    )
    or (
      select count(*) <> count(distinct candidate.value ->> 'sourceRowId')
      from jsonb_array_elements(resolutions) as candidate(value)
    ) then
    raise exception using errcode = '22023',
      message = 'invalid migration application resolutions';
  end if;

  select coalesce(sum((row.value -> 'balance' ->> 'availablePoints')::numeric), 0),
    coalesce(sum((row.value -> 'balance' ->> 'pendingPoints')::numeric), 0)
  into calculated_available, calculated_pending
  from jsonb_array_elements(document_rows) as row(value)
  where coalesce(row.value -> 'balance' ->> 'availablePoints', '') ~
      '^(0|[1-9][0-9]{0,18})$'
    and coalesce(row.value -> 'balance' ->> 'pendingPoints', '') ~
      '^(0|[1-9][0-9]{0,18})$';
  if calculated_available <> target_receipt.available_points::numeric
    or calculated_pending <> target_receipt.pending_points::numeric
    or (
      select count(*) <> count(distinct row.value ->> 'sourceRowId')
      from jsonb_array_elements(document_rows) as row(value)
    )
    or exists (
      select 1 from jsonb_array_elements(document_rows) as row(value)
      where coalesce(row.value ->> 'sourceRowId', '') !~
          '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
        or jsonb_typeof(row.value -> 'identity') <> 'object'
        or row.value -> 'identity' ->> 'kind' not in (
          'woocommerce_customer_id', 'customer_public_id',
          'source_customer_id', 'email'
        )
        or coalesce(row.value -> 'identity' ->> 'value', '') = ''
        or jsonb_typeof(row.value -> 'balance') <> 'object'
        or coalesce(row.value -> 'balance' ->> 'availablePoints', '') !~
          '^(0|[1-9][0-9]{0,18})$'
        or coalesce(row.value -> 'balance' ->> 'pendingPoints', '') !~
          '^(0|[1-9][0-9]{0,18})$'
        or (row.value -> 'balance' ->> 'availablePoints')::numeric >
          9223372036854775807::numeric
        or (row.value -> 'balance' ->> 'pendingPoints')::numeric >
          9223372036854775807::numeric
        or jsonb_typeof(row.value -> 'balance' -> 'lots') <> 'array'
        or jsonb_array_length(row.value -> 'balance' -> 'lots') > 50
    ) then
    raise exception using errcode = '22023',
      message = 'invalid migration application rows';
  end if;

  request_hash := extensions.digest(
    convert_to(
      concat_ws('|', target_dry_run_public_id::text, target_approval_sha256,
        encode(target_receipt.canonical_document_sha256, 'hex'),
        encode(target_receipt.resolution_sha256, 'hex'),
        coalesce(target_commerce_connection_public_id::text, 'none')),
      'UTF8'
    ),
    'sha256'
  );
  perform pg_advisory_xact_lock(
    hashtextextended('migration-application:' || target_receipt.organization_id::text || ':' || target_idempotency_key, 0)
  );
  select batch.* into existing_batch
  from loyalty.migration_import_batches as batch
  where batch.organization_id = target_receipt.organization_id
    and batch.idempotency_key = target_idempotency_key;
  if found then
    if existing_batch.request_sha256 <> request_hash then
      raise exception using errcode = '23514',
        message = 'migration application idempotency conflict';
    end if;
    return query select existing_batch.public_id, 'duplicate'::text,
      existing_batch.customer_count, existing_batch.created_customer_count,
      existing_batch.available_points::text, existing_batch.pending_points::text;
    return;
  end if;
  if exists (
    select 1 from loyalty.migration_import_batches as batch
    where batch.organization_id = target_receipt.organization_id
      and batch.dry_run_id = target_receipt.id
  ) then
    raise exception using errcode = '23505',
      message = 'migration receipt already applied';
  end if;

  insert into loyalty.migration_import_batches (
    organization_id, dry_run_id, programme_group_id, programme_version_id,
    actor_user_id, source_system, source_export_sha256,
    canonical_document_sha256, resolution_sha256, engine_sha256,
    approval_sha256, customer_count, created_customer_count,
    available_points, pending_points, request_sha256, idempotency_key,
    correlation_id
  ) values (
    target_receipt.organization_id, target_receipt.id,
    target_receipt.programme_group_id, target_receipt.programme_version_id,
    actor_user_id, target_receipt.source_system,
    target_receipt.source_export_sha256,
    target_receipt.canonical_document_sha256, target_receipt.resolution_sha256,
    target_receipt.engine_sha256, target_receipt.approval_sha256,
    target_receipt.row_count, target_receipt.create_count,
    target_receipt.available_points, target_receipt.pending_points,
    request_hash, target_idempotency_key, target_correlation_id
  ) returning id, public_id into created_batch_id, created_batch_public_id;

  for resolution in
    select value
    from jsonb_array_elements(resolutions) as resolved(value)
    order by value ->> 'sourceRowId'
  loop
    item_index := item_index + 1;
    select candidate.value into strict row_value
    from jsonb_array_elements(document_rows) as candidate(value)
    where candidate.value ->> 'sourceRowId' = resolution.value ->> 'sourceRowId';
    identity_value := row_value -> 'identity';
    balance_value := row_value -> 'balance';

    identity_canonical := '{"identity":{"kind":' ||
      to_jsonb(identity_value ->> 'kind')::text || ',"value":' ||
      to_jsonb(identity_value ->> 'value')::text || '},"schemaVersion":"1"}';
    identity_hash := extensions.digest(convert_to(identity_canonical, 'UTF8'), 'sha256');
    if identity_hash <> decode(resolution.value ->> 'identitySha256', 'hex') then
      raise exception using errcode = '23514',
        message = 'migration identity fingerprint mismatch';
    end if;

    if resolution.value ->> 'outcome' = 'matched_existing' then
      if coalesce(resolution.value ->> 'targetCustomerId', '') !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        raise exception using errcode = '22023',
          message = 'invalid migration customer resolution';
      end if;
      select customer.* into target_customer
      from loyalty.customers as customer
      where customer.public_id = (resolution.value ->> 'targetCustomerId')::uuid
        and customer.organization_id = target_receipt.organization_id
        and customer.status = 'active';
      if not found then
        raise exception using errcode = '22023',
          message = 'migration customer resolution changed';
      end if;
      if resolution.value ->> 'basis' = 'verified_woocommerce_id' then
        if target_connection.id is null
          or identity_value ->> 'kind' <> 'woocommerce_customer_id'
          or not exists (
            select 1 from loyalty.customer_identities as identity
            where identity.organization_id = target_receipt.organization_id
              and identity.customer_id = target_customer.id
              and identity.commerce_connection_id = target_connection.id
              and identity.external_customer_id = identity_value ->> 'value'
              and identity.identity_kind = 'registered'
              and identity.verified_at is not null
          ) then
          raise exception using errcode = '23514',
            message = 'verified WooCommerce identity changed';
        end if;
      elsif resolution.value ->> 'basis' <> 'explicit_customer' then
        raise exception using errcode = '22023',
          message = 'invalid migration customer resolution';
      end if;
    else
      if resolution.value ->> 'basis' <> 'explicit_create'
        or resolution.value -> 'targetCustomerId' <> 'null'::jsonb then
        raise exception using errcode = '22023',
          message = 'invalid migration customer creation';
      end if;
      insert into loyalty.customers (organization_id, display_reference)
      values (
        target_receipt.organization_id,
        'Imported ' || substr(encode(extensions.digest(
          convert_to(row_value ->> 'sourceRowId', 'UTF8'), 'sha256'
        ), 'hex'), 1, 12)
      ) returning * into target_customer;
      if identity_value ->> 'kind' = 'woocommerce_customer_id' then
        if target_connection.id is null then
          raise exception using errcode = '22023',
            message = 'migration customer creation requires a store';
        end if;
        insert into loyalty.customer_identities (
          organization_id, customer_id, commerce_connection_id,
          external_customer_id, identity_kind, verified_at
        ) values (
          target_receipt.organization_id, target_customer.id,
          target_connection.id, identity_value ->> 'value',
          'registered', command_time
        );
      end if;
    end if;

    target_wallet_id := loyalty_private.ensure_wallet_accounts(
      target_receipt.organization_id, target_receipt.programme_group_id,
      target_customer.id
    );
    insert into loyalty.migration_import_items (
      organization_id, batch_id, source_system, source_export_sha256,
      source_row_ref, identity_sha256, resolution_basis, customer_id,
      wallet_id, created_customer, available_points, pending_points
    ) values (
      target_receipt.organization_id, created_batch_id,
      target_receipt.source_system, target_receipt.source_export_sha256,
      row_value ->> 'sourceRowId', identity_hash,
      resolution.value ->> 'basis', target_customer.id, target_wallet_id,
      resolution.value ->> 'outcome' = 'create_new',
      (balance_value ->> 'availablePoints')::bigint,
      (balance_value ->> 'pendingPoints')::bigint
    ) returning id into created_item_id;

    if expiry_policy ->> 'mode' = 'apply_default' then
      if jsonb_array_length(balance_value -> 'lots') <> 0
        or (balance_value ->> 'pendingPoints')::bigint <> 0 then
        raise exception using errcode = '22023',
          message = 'invalid default-expiry migration row';
      end if;
      effective_lots := case
        when (balance_value ->> 'availablePoints')::bigint = 0 then '[]'::jsonb
        else jsonb_build_array(jsonb_build_object(
          'sourceLotId', 'default', 'bucket', 'available',
          'points', balance_value ->> 'availablePoints',
          'availableAt', document_source ->> 'exportedAt',
          'expiresAt', expiry_policy ->> 'expiresAt'
        ))
      end;
    else
      effective_lots := balance_value -> 'lots';
      if (
        select coalesce(sum((lot.value ->> 'points')::numeric)
          filter (where lot.value ->> 'bucket' = 'available'), 0) <>
            (balance_value ->> 'availablePoints')::numeric
          or coalesce(sum((lot.value ->> 'points')::numeric)
          filter (where lot.value ->> 'bucket' = 'pending'), 0) <>
            (balance_value ->> 'pendingPoints')::numeric
        from jsonb_array_elements(effective_lots) as lot(value)
      ) then
        raise exception using errcode = '23514',
          message = 'migration lot totals do not reconcile';
      end if;
    end if;

    lot_index := 0;
    for lot_value in
      select value from jsonb_array_elements(effective_lots) as source_lot(value)
      order by value ->> 'sourceLotId'
    loop
      lot_index := lot_index + 1;
      source_lot_ref := lot_value ->> 'sourceLotId';
      lot_bucket := lot_value ->> 'bucket';
      if source_lot_ref !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
        or lot_bucket not in ('available', 'pending')
        or coalesce(lot_value ->> 'points', '') !~ '^[1-9][0-9]{0,18}$'
        or (lot_value ->> 'points')::numeric > 9223372036854775807::numeric
        or coalesce(lot_value ->> 'availableAt', '') !~
          '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}' then
        raise exception using errcode = '22023',
          message = 'invalid migration lot';
      end if;
      lot_points := (lot_value ->> 'points')::bigint;
      lot_available_at := (lot_value ->> 'availableAt')::timestamptz;
      lot_expires_at := case when lot_value -> 'expiresAt' = 'null'::jsonb
        then null else (lot_value ->> 'expiresAt')::timestamptz end;
      if (lot_expires_at is not null and lot_expires_at <= command_time)
        or (lot_expires_at is not null and lot_expires_at <= lot_available_at)
        or (lot_bucket = 'available' and lot_available_at >
          (document_source ->> 'exportedAt')::timestamptz)
        or (lot_bucket = 'pending' and lot_available_at <=
          (document_source ->> 'exportedAt')::timestamptz) then
        raise exception using errcode = '23514',
          message = 'migration lot timing is stale';
      end if;

      select account.id into issuance_account_id
      from loyalty.ledger_accounts as account
      where account.organization_id = target_receipt.organization_id
        and account.programme_group_id = target_receipt.programme_group_id
        and account.wallet_id is null and account.account_kind = 'issuance';
      select account.id into credit_account_id
      from loyalty.ledger_accounts as account
      where account.organization_id = target_receipt.organization_id
        and account.wallet_id = target_wallet_id
        and account.account_kind = lot_bucket;
      select * into posted from loyalty_private.post_ledger_transaction(
        target_receipt.organization_id, target_receipt.programme_group_id,
        target_receipt.programme_version_id, 'opening_balance', 'merchant',
        actor_user_id::text, null,
        'migration:' || created_batch_public_id::text || ':' ||
          (row_value ->> 'sourceRowId') || ':' || source_lot_ref,
        null, target_idempotency_key || ':row:' || item_index::text ||
          ':lot:' || lot_index::text,
        extensions.digest(convert_to(
          concat_ws('|', target_approval_sha256, row_value ->> 'sourceRowId',
            source_lot_ref, lot_bucket, lot_points::text,
            lot_available_at::text, coalesce(lot_expires_at::text, 'infinity')),
          'UTF8'
        ), 'sha256'),
        'Approved migration opening balance',
        jsonb_build_object(
          'migrationBatchId', created_batch_public_id,
          'sourceRowRef', row_value ->> 'sourceRowId',
          'sourceLotRef', source_lot_ref, 'bucket', lot_bucket,
          'points', lot_points::text
        ), command_time,
        jsonb_build_array(
          jsonb_build_object('account_id', issuance_account_id, 'points', -lot_points),
          jsonb_build_object('account_id', credit_account_id, 'points', lot_points)
        )
      );
      select transaction.id into opening_transaction_id
      from loyalty.ledger_transactions as transaction
      where transaction.organization_id = target_receipt.organization_id
        and transaction.public_id = posted.transaction_public_id;
      select entry.id into opening_credit_entry_id
      from loyalty.ledger_entries as entry
      where entry.organization_id = target_receipt.organization_id
        and entry.transaction_id = opening_transaction_id
        and entry.account_id = credit_account_id;

      created_point_lot_id := null;
      if lot_bucket = 'available' then
        insert into loyalty.point_lots (
          organization_id, programme_group_id, wallet_id,
          programme_version_id, credit_entry_id, origin_entry_id,
          initial_points, available_at, expires_at
        ) values (
          target_receipt.organization_id, target_receipt.programme_group_id,
          target_wallet_id, target_receipt.programme_version_id,
          opening_credit_entry_id, opening_credit_entry_id, lot_points,
          lot_available_at, coalesce(lot_expires_at, 'infinity'::timestamptz)
        ) returning id into created_point_lot_id;
        insert into loyalty.point_lot_balances (
          lot_id, organization_id, wallet_id, remaining_points
        ) values (
          created_point_lot_id, target_receipt.organization_id,
          target_wallet_id, lot_points
        );
      end if;
      insert into loyalty.migration_import_lots (
        organization_id, item_id, source_lot_ref, bucket, points,
        available_at, expires_at, opening_transaction_id,
        opening_credit_entry_id, point_lot_id
      ) values (
        target_receipt.organization_id, created_item_id, source_lot_ref,
        lot_bucket, lot_points, lot_available_at, lot_expires_at,
        opening_transaction_id, opening_credit_entry_id, created_point_lot_id
      );
    end loop;
  end loop;

  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id,
    metadata
  ) values (
    target_receipt.organization_id, actor_user_id,
    'migration.opening_balance.apply', 'migration_import_batch',
    created_batch_public_id, target_idempotency_key, request_hash,
    target_correlation_id,
    jsonb_build_object(
      'dryRunId', target_dry_run_public_id,
      'approvalSha256', target_approval_sha256,
      'customerCount', target_receipt.row_count,
      'createdCustomerCount', target_receipt.create_count,
      'availablePoints', target_receipt.available_points::text,
      'pendingPoints', target_receipt.pending_points::text
    )
  );

  return query select created_batch_public_id, 'created'::text,
    target_receipt.row_count, target_receipt.create_count,
    target_receipt.available_points::text, target_receipt.pending_points::text;
end;
$$;

create or replace function loyalty_private.release_due_migration_lots_v1(
  target_as_of timestamptz default clock_timestamp(),
  target_limit integer default 100
)
returns table (released_lots integer, released_points bigint)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '10s'
as $$
declare
  candidate record;
  released record;
  release_transaction_id bigint;
  released_point_lot_id bigint;
  lot_count integer := 0;
  point_count bigint := 0;
  request_hash bytea;
begin
  if target_as_of is null or target_limit not between 1 and 500 then
    raise exception using errcode = '22023',
      message = 'invalid migration pending-lot sweep';
  end if;
  for candidate in
    select import_lot.*, item.wallet_id, batch.programme_group_id,
      batch.programme_version_id
    from loyalty.migration_import_lots as import_lot
    join loyalty.migration_import_items as item
      on item.organization_id = import_lot.organization_id
     and item.id = import_lot.item_id
    join loyalty.migration_import_batches as batch
      on batch.organization_id = item.organization_id
     and batch.id = item.batch_id
    left join loyalty.migration_pending_lot_releases as prior
      on prior.organization_id = import_lot.organization_id
     and prior.import_lot_id = import_lot.id
    where import_lot.bucket = 'pending'
      and import_lot.available_at <= target_as_of
      and prior.id is null
    order by import_lot.available_at, import_lot.id
    limit target_limit
    for update of import_lot skip locked
  loop
    request_hash := extensions.digest(convert_to(
      'migration-pending-release|' || candidate.public_id::text,
      'UTF8'
    ), 'sha256');
    select * into released from loyalty_private.release_points(
      candidate.organization_id, candidate.programme_group_id,
      candidate.programme_version_id,
      (
        select entry.public_id from loyalty.ledger_entries as entry
        where entry.organization_id = candidate.organization_id
          and entry.id = candidate.opening_credit_entry_id
      ),
      coalesce(candidate.expires_at, 'infinity'::timestamptz),
      'migration:pending-release:' || candidate.public_id::text,
      request_hash, candidate.available_at
    );
    select transaction.id into release_transaction_id
    from loyalty.ledger_transactions as transaction
    where transaction.organization_id = candidate.organization_id
      and transaction.public_id = released.transaction_public_id;
    select lot.id into released_point_lot_id
    from loyalty.point_lots as lot
    where lot.organization_id = candidate.organization_id
      and lot.public_id = released.lot_public_id;
    insert into loyalty.migration_pending_lot_releases (
      organization_id, import_lot_id, release_transaction_id,
      point_lot_id, released_at
    ) values (
      candidate.organization_id, candidate.id, release_transaction_id,
      released_point_lot_id, candidate.available_at
    ) on conflict (organization_id, import_lot_id) do nothing;
    if found then
      lot_count := lot_count + 1;
      point_count := point_count + candidate.points;
    end if;
  end loop;
  return query select lot_count, point_count;
end;
$$;

create or replace function loyalty.compensate_migration_batch_v1(
  target_batch_public_id uuid,
  target_reason text,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (
  correction_batch_public_id uuid,
  original_batch_public_id uuid,
  outcome text,
  corrected_points text
)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '15s'
as $$
declare
  actor_user_id uuid := loyalty_private.request_user_id();
  original_batch loyalty.migration_import_batches%rowtype;
  existing_correction loyalty.migration_correction_batches%rowtype;
  request_hash bytea;
  created_correction_id bigint;
  created_correction_public_id uuid;
  corrected_total numeric;
  item record;
  unreleased_pending bigint;
  available_correction bigint;
  pending_account_id bigint;
  adjustment_account_id bigint;
  pending_posted record;
  available_posted record;
  pending_transaction_id bigint;
  available_transaction_id bigint;
  item_index integer := 0;
begin
  if actor_user_id is null or target_batch_public_id is null
    or target_reason is null or target_reason <> btrim(target_reason)
    or length(target_reason) not between 8 and 500
    or target_reason ~ '[[:cntrl:]]'
    or target_idempotency_key is null
    or target_idempotency_key <> btrim(target_idempotency_key)
    or length(target_idempotency_key) not between 1 and 160
    or target_idempotency_key ~ '[[:cntrl:]]'
    or target_correlation_id is null then
    raise exception using errcode = '22023',
      message = 'invalid migration correction command';
  end if;
  select batch.* into original_batch
  from loyalty.migration_import_batches as batch
  where batch.public_id = target_batch_public_id
    and loyalty_private.has_organization_role(
      batch.organization_id, array['owner', 'admin']::text[]
    )
  for update;
  if not found then
    raise exception using errcode = '42501',
      message = 'migration correction not authorized';
  end if;
  request_hash := extensions.digest(convert_to(
    concat_ws('|', target_batch_public_id::text, target_reason), 'UTF8'
  ), 'sha256');
  perform pg_advisory_xact_lock(hashtextextended(
    'migration-correction:' || original_batch.organization_id::text || ':' ||
      target_idempotency_key, 0
  ));
  select correction.* into existing_correction
  from loyalty.migration_correction_batches as correction
  where correction.organization_id = original_batch.organization_id
    and correction.idempotency_key = target_idempotency_key;
  if found then
    if existing_correction.request_sha256 <> request_hash then
      raise exception using errcode = '23514',
        message = 'migration correction idempotency conflict';
    end if;
    return query select existing_correction.public_id,
      original_batch.public_id, 'duplicate'::text,
      existing_correction.corrected_points::text;
    return;
  end if;
  if exists (
    select 1 from loyalty.migration_correction_batches as correction
    where correction.organization_id = original_batch.organization_id
      and correction.original_batch_id = original_batch.id
  ) then
    raise exception using errcode = '23505',
      message = 'migration batch already corrected';
  end if;
  corrected_total := original_batch.available_points::numeric +
    original_batch.pending_points::numeric;
  if corrected_total > 9223372036854775807::numeric then
    raise exception using errcode = '22003',
      message = 'migration correction exceeds bounded points';
  end if;
  insert into loyalty.migration_correction_batches (
    organization_id, original_batch_id, actor_user_id, reason,
    corrected_points, request_sha256, idempotency_key, correlation_id
  ) values (
    original_batch.organization_id, original_batch.id, actor_user_id,
    target_reason, corrected_total::bigint, request_hash,
    target_idempotency_key, target_correlation_id
  ) returning id, public_id into created_correction_id,
    created_correction_public_id;

  perform balance.ledger_account_id
  from loyalty.migration_import_items as import_item
  join loyalty.wallet_balances as balance
    on balance.organization_id = import_item.organization_id
   and balance.wallet_id = import_item.wallet_id
  where import_item.organization_id = original_batch.organization_id
    and import_item.batch_id = original_batch.id
  order by import_item.wallet_id, balance.ledger_account_id
  for update of balance;

  for item in
    select import_item.*, wallet.public_id as wallet_public_id
    from loyalty.migration_import_items as import_item
    join loyalty.wallets as wallet
      on wallet.organization_id = import_item.organization_id
     and wallet.id = import_item.wallet_id
    where import_item.organization_id = original_batch.organization_id
      and import_item.batch_id = original_batch.id
    order by import_item.wallet_id
  loop
    item_index := item_index + 1;
    select coalesce(sum(import_lot.points), 0)::bigint
    into unreleased_pending
    from loyalty.migration_import_lots as import_lot
    left join loyalty.migration_pending_lot_releases as release
      on release.organization_id = import_lot.organization_id
     and release.import_lot_id = import_lot.id
    where import_lot.organization_id = item.organization_id
      and import_lot.item_id = item.id
      and import_lot.bucket = 'pending'
      and release.id is null;
    available_correction := item.available_points + item.pending_points -
      unreleased_pending;
    pending_transaction_id := null;
    available_transaction_id := null;
    if unreleased_pending > 0 then
      select account.id into pending_account_id
      from loyalty.ledger_accounts as account
      where account.organization_id = item.organization_id
        and account.wallet_id = item.wallet_id
        and account.account_kind = 'pending';
      select account.id into adjustment_account_id
      from loyalty.ledger_accounts as account
      where account.organization_id = item.organization_id
        and account.programme_group_id = original_batch.programme_group_id
        and account.wallet_id is null and account.account_kind = 'adjustment';
      select * into pending_posted from loyalty_private.post_ledger_transaction(
        item.organization_id, original_batch.programme_group_id,
        original_batch.programme_version_id, 'manual_adjustment', 'merchant',
        actor_user_id::text, null,
        'migration-correction:' || created_correction_public_id::text || ':' ||
          item.source_row_ref || ':pending', null,
        target_idempotency_key || ':row:' || item_index::text || ':pending',
        extensions.digest(convert_to(
          item.public_id::text || '|pending|' || unreleased_pending::text,
          'UTF8'
        ), 'sha256'), target_reason,
        jsonb_build_object(
          'migrationCorrectionBatchId', created_correction_public_id,
          'originalMigrationBatchId', original_batch.public_id,
          'sourceRowRef', item.source_row_ref,
          'bucket', 'pending', 'points', unreleased_pending::text
        ), clock_timestamp(),
        jsonb_build_array(
          jsonb_build_object('account_id', pending_account_id,
            'points', -unreleased_pending),
          jsonb_build_object('account_id', adjustment_account_id,
            'points', unreleased_pending)
        )
      );
      select transaction.id into pending_transaction_id
      from loyalty.ledger_transactions as transaction
      where transaction.organization_id = item.organization_id
        and transaction.public_id = pending_posted.transaction_public_id;
    end if;
    if available_correction > 0 then
      select * into available_posted from loyalty_private.adjust_points(
        item.organization_id, item.wallet_public_id,
        original_batch.programme_version_id, -available_correction,
        target_reason, actor_user_id::text,
        target_idempotency_key || ':row:' || item_index::text || ':available',
        extensions.digest(convert_to(
          item.public_id::text || '|available|' || available_correction::text,
          'UTF8'
        ), 'sha256'), null, clock_timestamp()
      );
      select transaction.id into available_transaction_id
      from loyalty.ledger_transactions as transaction
      where transaction.organization_id = item.organization_id
        and transaction.public_id = available_posted.transaction_public_id;
    end if;
    if unreleased_pending + available_correction > 0 then
      insert into loyalty.migration_correction_items (
        organization_id, correction_batch_id, original_item_id,
        pending_transaction_id, available_transaction_id,
        corrected_pending_points, corrected_available_points
      ) values (
        item.organization_id, created_correction_id, item.id,
        pending_transaction_id, available_transaction_id,
        unreleased_pending, available_correction
      );
    end if;
  end loop;

  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id,
    metadata
  ) values (
    original_batch.organization_id, actor_user_id,
    'migration.batch.compensate', 'migration_correction_batch',
    created_correction_public_id, target_idempotency_key, request_hash,
    target_correlation_id,
    jsonb_build_object(
      'originalBatchId', original_batch.public_id,
      'correctedPoints', corrected_total::text,
      'reason', target_reason
    )
  );
  return query select created_correction_public_id, original_batch.public_id,
    'created'::text, corrected_total::text;
end;
$$;

alter function loyalty.apply_migration_opening_balance_v1(
  uuid, text, text, text, uuid, text, uuid
) owner to loyalty_owner;
alter function loyalty_private.release_due_migration_lots_v1(
  timestamptz, integer
) owner to loyalty_owner;
alter function loyalty.compensate_migration_batch_v1(
  uuid, text, text, uuid
) owner to loyalty_owner;

revoke all on function loyalty.apply_migration_opening_balance_v1(
  uuid, text, text, text, uuid, text, uuid
) from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function loyalty_private.release_due_migration_lots_v1(
  timestamptz, integer
) from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function loyalty.compensate_migration_batch_v1(
  uuid, text, text, uuid
) from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty.apply_migration_opening_balance_v1(
  uuid, text, text, text, uuid, text, uuid
) to authenticated;
grant execute on function loyalty.compensate_migration_batch_v1(
  uuid, text, text, uuid
) to authenticated;
grant execute on function loyalty_private.release_due_migration_lots_v1(
  timestamptz, integer
) to loyalty_worker;

comment on table loyalty.migration_import_batches is
  'Immutable receipt-bound migration application with exact aggregate and actor evidence.';
comment on table loyalty.migration_import_items is
  'One opaque source-row fence and derived customer/wallet effect per migration application.';
comment on table loyalty.migration_import_lots is
  'Exact source lot to immutable opening transaction evidence; pending rows release separately.';
comment on table loyalty.migration_correction_batches is
  'Append-only approved compensating batch linked to one original migration application.';
comment on function loyalty.apply_migration_opening_balance_v1(
  uuid, text, text, text, uuid, text, uuid
) is 'Revalidates exact receipt-bound canonical rows and posts traceable opening balances once.';
comment on function loyalty_private.release_due_migration_lots_v1(
  timestamptz, integer
) is 'Releases exact imported pending lots at their original availability time in bounded order.';
comment on function loyalty.compensate_migration_batch_v1(
  uuid, text, text, uuid
) is 'Appends one audited correction batch without rewriting import or ledger history.';
