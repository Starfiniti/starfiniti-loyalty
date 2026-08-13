-- Phase 9 bounded bulk customer adjustments. A dry run fingerprints the exact
-- customer/balance set. Execution requires that fingerprint, locks every wallet
-- in deterministic order, posts one immutable ledger transaction per customer,
-- and records one attributable batch plus immutable administration audit.

create table loyalty.bulk_adjustment_batches (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null references loyalty.organizations(id) on delete restrict,
  programme_group_id bigint not null,
  programme_version_id bigint not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  customer_count integer not null check (customer_count between 2 and 50),
  points_per_customer bigint not null check (points_per_customer <> 0),
  total_points numeric(30, 0) not null,
  reason text not null,
  expires_at timestamptz,
  preview_sha256 bytea not null check (octet_length(preview_sha256) = 32),
  request_sha256 bytea not null check (octet_length(request_sha256) = 32),
  idempotency_key text not null,
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, programme_group_id)
    references loyalty.programme_groups(organization_id, id) on delete restrict,
  foreign key (organization_id, programme_version_id)
    references loyalty.programme_versions(organization_id, id) on delete restrict,
  check (length(reason) between 8 and 500 and reason = btrim(reason) and reason !~ '[[:cntrl:]]'),
  check (length(idempotency_key) between 1 and 200 and idempotency_key = btrim(idempotency_key)),
  check (total_points = points_per_customer::numeric * customer_count),
  check ((points_per_customer > 0 and expires_at is not null) or (points_per_customer < 0 and expires_at is null))
);

create table loyalty.bulk_adjustment_items (
  id bigint generated always as identity primary key,
  organization_id bigint not null,
  batch_id bigint not null,
  customer_id bigint not null,
  wallet_id bigint not null,
  transaction_id bigint not null,
  available_points_before bigint not null,
  available_points_after bigint not null,
  created_at timestamptz not null default now(),
  unique (organization_id, batch_id, customer_id),
  unique (organization_id, transaction_id),
  foreign key (organization_id, batch_id)
    references loyalty.bulk_adjustment_batches(organization_id, id) on delete restrict,
  foreign key (organization_id, customer_id)
    references loyalty.customers(organization_id, id) on delete restrict,
  foreign key (organization_id, wallet_id)
    references loyalty.wallets(organization_id, id) on delete restrict,
  foreign key (organization_id, transaction_id)
    references loyalty.ledger_transactions(organization_id, id) on delete restrict
);

create index bulk_adjustment_batches_tenant_history_idx
  on loyalty.bulk_adjustment_batches (organization_id, created_at desc, id desc);
create index bulk_adjustment_items_batch_idx
  on loyalty.bulk_adjustment_items (organization_id, batch_id, id);

alter table loyalty.bulk_adjustment_batches owner to loyalty_owner;
alter table loyalty.bulk_adjustment_items owner to loyalty_owner;
alter table loyalty.bulk_adjustment_batches enable row level security;
alter table loyalty.bulk_adjustment_items enable row level security;

create policy bulk_adjustment_batches_privileged_select
  on loyalty.bulk_adjustment_batches for select to authenticated
  using ((select loyalty_private.has_organization_role(
    organization_id, array['owner', 'admin', 'auditor']::text[]
  )));
create policy bulk_adjustment_items_privileged_select
  on loyalty.bulk_adjustment_items for select to authenticated
  using ((select loyalty_private.has_organization_role(
    organization_id, array['owner', 'admin', 'auditor']::text[]
  )));

revoke all on loyalty.bulk_adjustment_batches, loyalty.bulk_adjustment_items
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant select on loyalty.bulk_adjustment_batches, loyalty.bulk_adjustment_items
  to authenticated;

create trigger bulk_adjustment_batches_immutable
before update or delete on loyalty.bulk_adjustment_batches
for each row execute function loyalty_private.reject_immutable_change();
create trigger bulk_adjustment_items_immutable
before update or delete on loyalty.bulk_adjustment_items
for each row execute function loyalty_private.reject_immutable_change();

create or replace function loyalty_private.bulk_adjustment_preview_data(
  target_customer_public_ids uuid[],
  target_programme_group_public_id uuid,
  target_programme_version_public_id uuid,
  target_points_per_customer bigint,
  target_reason text,
  target_expires_at timestamptz
)
returns table (
  organization_id bigint,
  programme_group_id bigint,
  programme_version_id bigint,
  preview_sha256 bytea,
  customer_count integer,
  total_points numeric,
  items jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_group loyalty.programme_groups%rowtype;
  target_version loyalty.programme_versions%rowtype;
  canonical_items jsonb;
  selected_count integer;
  duplicate_count integer;
begin
  if target_customer_public_ids is null
    or cardinality(target_customer_public_ids) not between 2 and 50
    or target_programme_group_public_id is null
    or target_programme_version_public_id is null
    or target_points_per_customer is null
    or target_points_per_customer = 0
    or target_reason is null
    or target_reason <> btrim(target_reason)
    or length(target_reason) not between 8 and 500
    or target_reason ~ '[[:cntrl:]]'
    or (target_points_per_customer > 0 and (target_expires_at is null or target_expires_at <= now()))
    or (target_points_per_customer < 0 and target_expires_at is not null) then
    raise exception using errcode = '22023', message = 'invalid bulk adjustment preview';
  end if;

  select count(*) - count(distinct customer_public_id)
  into duplicate_count
  from unnest(target_customer_public_ids) as ids(customer_public_id);
  if duplicate_count <> 0 then
    raise exception using errcode = '22023', message = 'invalid bulk adjustment preview';
  end if;

  select programme_group.* into target_group
  from loyalty.programme_groups as programme_group
  where programme_group.public_id = target_programme_group_public_id
    and programme_group.status = 'active'
    and loyalty_private.has_organization_role(
      programme_group.organization_id, array['owner', 'admin']::text[]
    );
  if not found then
    raise exception using errcode = '42501', message = 'bulk adjustment not authorized';
  end if;

  select version.* into target_version
  from loyalty.programme_versions as version
  where version.public_id = target_programme_version_public_id
    and version.organization_id = target_group.organization_id
    and version.programme_group_id = target_group.id
    and version.status = 'published';
  if not found then
    raise exception using errcode = '22023', message = 'bulk adjustment requires the current published programme version';
  end if;

  select count(*)::integer,
    jsonb_agg(
      jsonb_build_object(
        'customerId', customer.public_id,
        'displayReference', coalesce(nullif(btrim(customer.display_reference), ''), 'Customer ' || left(customer.public_id::text, 8)),
        'availablePoints', balance.points::text,
        'projectedAvailablePoints', (balance.points::numeric + target_points_per_customer)::text
      ) order by customer.public_id
    )
  into selected_count, canonical_items
  from loyalty.customers as customer
  join loyalty.wallets as wallet
    on wallet.organization_id = customer.organization_id
   and wallet.customer_id = customer.id
   and wallet.programme_group_id = target_group.id
   and wallet.status = 'active'
  join loyalty.wallet_balances as balance
    on balance.organization_id = wallet.organization_id
   and balance.wallet_id = wallet.id
   and balance.account_kind = 'available'
  where customer.organization_id = target_group.organization_id
    and customer.status = 'active'
    and customer.public_id = any(target_customer_public_ids)
    and balance.points::numeric + target_points_per_customer between -9223372036854775808::numeric and 9223372036854775807::numeric;
  if selected_count <> cardinality(target_customer_public_ids) then
    raise exception using errcode = '22023', message = 'bulk adjustment customer set changed';
  end if;

  return query select
    target_group.organization_id,
    target_group.id,
    target_version.id,
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'version', '1',
          'programmeGroupId', target_group.public_id,
          'programmeVersionId', target_version.public_id,
          'pointsPerCustomer', target_points_per_customer::text,
          'reason', target_reason,
          'expiresAt', target_expires_at,
          'items', canonical_items
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    selected_count,
    target_points_per_customer::numeric * selected_count,
    canonical_items;
end;
$$;

alter function loyalty_private.bulk_adjustment_preview_data(uuid[], uuid, uuid, bigint, text, timestamptz)
  owner to loyalty_owner;
revoke all on function loyalty_private.bulk_adjustment_preview_data(uuid[], uuid, uuid, bigint, text, timestamptz)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

create or replace function loyalty.preview_bulk_customer_adjustment(
  target_customer_public_ids uuid[],
  target_programme_group_public_id uuid,
  target_programme_version_public_id uuid,
  target_points_per_customer bigint,
  target_reason text,
  target_expires_at timestamptz
)
returns table (
  preview_sha256 text,
  customer_count integer,
  points_per_customer text,
  total_points text,
  items jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select encode(preview.preview_sha256, 'hex'), preview.customer_count,
    target_points_per_customer::text, preview.total_points::text, preview.items
  from loyalty_private.bulk_adjustment_preview_data(
    target_customer_public_ids, target_programme_group_public_id,
    target_programme_version_public_id, target_points_per_customer,
    target_reason, target_expires_at
  ) as preview;
$$;

create or replace function loyalty.execute_bulk_customer_adjustment(
  target_customer_public_ids uuid[],
  target_programme_group_public_id uuid,
  target_programme_version_public_id uuid,
  target_points_per_customer bigint,
  target_reason text,
  target_expires_at timestamptz,
  target_expected_preview_sha256 text,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (
  batch_public_id uuid,
  outcome text,
  customer_count integer,
  total_points text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := loyalty_private.request_user_id();
  authorized_group loyalty.programme_groups%rowtype;
  preview record;
  existing_batch loyalty.bulk_adjustment_batches%rowtype;
  request_hash bytea;
  created_batch_id bigint;
  created_batch_public_id uuid;
  item record;
  posted record;
  transaction_id bigint;
  available_after bigint;
  item_index integer := 0;
begin
  if actor_user_id is null
    or target_customer_public_ids is null
    or cardinality(target_customer_public_ids) not between 2 and 50
    or target_programme_group_public_id is null
    or target_programme_version_public_id is null
    or target_points_per_customer is null
    or target_points_per_customer = 0
    or target_reason is null
    or target_reason <> btrim(target_reason)
    or length(target_reason) not between 8 and 500
    or target_reason ~ '[[:cntrl:]]'
    or (target_points_per_customer > 0 and target_expires_at is null)
    or (target_points_per_customer < 0 and target_expires_at is not null)
    or target_expected_preview_sha256 is null
    or target_expected_preview_sha256 !~ '^[0-9a-f]{64}$'
    or target_idempotency_key is null
    or target_idempotency_key <> btrim(target_idempotency_key)
    or length(target_idempotency_key) not between 1 and 200
    or target_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid bulk adjustment command';
  end if;

  if (
    select count(*) <> count(distinct ids.customer_public_id)
    from unnest(target_customer_public_ids) as ids(customer_public_id)
  ) then
    raise exception using errcode = '22023', message = 'invalid bulk adjustment command';
  end if;

  select programme_group.* into authorized_group
  from loyalty.programme_groups as programme_group
  where programme_group.public_id = target_programme_group_public_id
    and loyalty_private.has_organization_role(
      programme_group.organization_id, array['owner', 'admin']::text[]
    );
  if not found then
    raise exception using errcode = '42501', message = 'bulk adjustment not authorized';
  end if;

  request_hash := extensions.digest(
    convert_to(
      jsonb_build_object(
        'customerIds', (
          select jsonb_agg(ids.value order by ids.value)
          from unnest(target_customer_public_ids) as ids(value)
        ),
        'programmeGroupId', target_programme_group_public_id,
        'programmeVersionId', target_programme_version_public_id,
        'pointsPerCustomer', target_points_per_customer::text,
        'reason', target_reason,
        'expiresAt', target_expires_at,
        'expectedPreviewSha256', target_expected_preview_sha256
      )::text,
      'UTF8'
    ),
    'sha256'
  );

  select batch.* into existing_batch
  from loyalty.bulk_adjustment_batches as batch
  where batch.organization_id = authorized_group.organization_id
    and batch.idempotency_key = target_idempotency_key;
  if found then
    if existing_batch.request_sha256 <> request_hash then
      raise exception using errcode = '23514', message = 'bulk adjustment idempotency conflict';
    end if;
    return query select existing_batch.public_id, 'duplicate'::text,
      existing_batch.customer_count, existing_batch.total_points::text;
    return;
  end if;

  perform balance.ledger_account_id
  from loyalty.customers as customer
  join loyalty.wallets as wallet
    on wallet.organization_id = customer.organization_id
   and wallet.customer_id = customer.id
   and wallet.programme_group_id = authorized_group.id
   and wallet.status = 'active'
  join loyalty.wallet_balances as balance
    on balance.organization_id = wallet.organization_id
   and balance.wallet_id = wallet.id
  where customer.organization_id = authorized_group.organization_id
    and customer.status = 'active'
    and customer.public_id = any(target_customer_public_ids)
  order by wallet.id, balance.ledger_account_id
  for update of balance;

  select * into preview
  from loyalty_private.bulk_adjustment_preview_data(
    target_customer_public_ids, target_programme_group_public_id,
    target_programme_version_public_id, target_points_per_customer,
    target_reason, target_expires_at
  );
  if encode(preview.preview_sha256, 'hex') <> target_expected_preview_sha256 then
    raise exception using errcode = '23514', message = 'bulk adjustment preview is stale';
  end if;

  insert into loyalty.bulk_adjustment_batches (
    organization_id, programme_group_id, programme_version_id, actor_user_id,
    customer_count, points_per_customer, total_points, reason, expires_at,
    preview_sha256, request_sha256, idempotency_key, correlation_id
  ) values (
    preview.organization_id, preview.programme_group_id,
    preview.programme_version_id, actor_user_id, preview.customer_count,
    target_points_per_customer, preview.total_points, target_reason,
    target_expires_at, preview.preview_sha256, request_hash,
    target_idempotency_key, target_correlation_id
  ) returning id, public_id into created_batch_id, created_batch_public_id;

  for item in
    select customer.id as customer_id, wallet.id as wallet_id,
      wallet.public_id as wallet_public_id, balance.points as available_before
    from loyalty.customers as customer
    join loyalty.wallets as wallet
      on wallet.organization_id = customer.organization_id
     and wallet.customer_id = customer.id
     and wallet.programme_group_id = preview.programme_group_id
    join loyalty.wallet_balances as balance
      on balance.organization_id = wallet.organization_id
     and balance.wallet_id = wallet.id
     and balance.account_kind = 'available'
    where customer.organization_id = preview.organization_id
      and customer.public_id = any(target_customer_public_ids)
    order by wallet.id
  loop
    item_index := item_index + 1;
    select adjustment.transaction_public_id, adjustment.outcome into posted
    from loyalty_private.adjust_points(
      preview.organization_id, item.wallet_public_id,
      preview.programme_version_id, target_points_per_customer,
      target_reason, actor_user_id::text,
      target_idempotency_key || ':' || lpad(item_index::text, 2, '0'),
      extensions.digest(
        convert_to(target_idempotency_key || '|' || item.wallet_public_id::text, 'UTF8'),
        'sha256'
      ),
      target_expires_at, clock_timestamp()
    ) as adjustment;
    select transaction.id into transaction_id
    from loyalty.ledger_transactions as transaction
    where transaction.organization_id = preview.organization_id
      and transaction.public_id = posted.transaction_public_id;
    select balance.points into available_after
    from loyalty.wallet_balances as balance
    where balance.organization_id = preview.organization_id
      and balance.wallet_id = item.wallet_id
      and balance.account_kind = 'available';
    insert into loyalty.bulk_adjustment_items (
      organization_id, batch_id, customer_id, wallet_id, transaction_id,
      available_points_before, available_points_after
    ) values (
      preview.organization_id, created_batch_id, item.customer_id,
      item.wallet_id, transaction_id, item.available_before, available_after
    );
  end loop;

  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id,
    metadata
  ) values (
    preview.organization_id, actor_user_id, 'customer.points.bulk_adjust',
    'bulk_adjustment_batch', created_batch_public_id,
    target_idempotency_key, request_hash, target_correlation_id,
    jsonb_build_object(
      'programmeGroupPublicId', target_programme_group_public_id,
      'programmeVersionPublicId', target_programme_version_public_id,
      'customerCount', preview.customer_count,
      'pointsPerCustomer', target_points_per_customer::text,
      'totalPoints', preview.total_points::text,
      'reason', target_reason,
      'expiresAt', target_expires_at,
      'previewSha256', target_expected_preview_sha256
    )
  );

  return query select created_batch_public_id, 'created'::text,
    preview.customer_count, preview.total_points::text;
end;
$$;

alter function loyalty.preview_bulk_customer_adjustment(uuid[], uuid, uuid, bigint, text, timestamptz)
  owner to loyalty_owner;
alter function loyalty.execute_bulk_customer_adjustment(uuid[], uuid, uuid, bigint, text, timestamptz, text, text, uuid)
  owner to loyalty_owner;
revoke all on function loyalty.preview_bulk_customer_adjustment(uuid[], uuid, uuid, bigint, text, timestamptz),
  loyalty.execute_bulk_customer_adjustment(uuid[], uuid, uuid, bigint, text, timestamptz, text, text, uuid)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty.preview_bulk_customer_adjustment(uuid[], uuid, uuid, bigint, text, timestamptz),
  loyalty.execute_bulk_customer_adjustment(uuid[], uuid, uuid, bigint, text, timestamptz, text, text, uuid)
  to authenticated;

comment on table loyalty.bulk_adjustment_batches is
  'Immutable approved bulk point-adjustment batch with exact preview and request fingerprints.';
comment on table loyalty.bulk_adjustment_items is
  'Immutable customer/wallet/ledger effects belonging to one bulk adjustment batch.';
