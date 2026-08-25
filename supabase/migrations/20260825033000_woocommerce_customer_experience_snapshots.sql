-- M09 demand-driven WooCommerce customer experience snapshots. A signed
-- connector poll supplies only bounded channel-local customer selectors. The
-- database derives connection, tenant, customer, programme, wallet, and value.

create table loyalty_private.woocommerce_customer_snapshot_deliveries (
  id bigint generated always as identity primary key,
  organization_id bigint not null references loyalty.organizations(id) on delete cascade,
  connection_id bigint not null,
  customer_id bigint not null,
  external_customer_id text not null,
  current_revision bigint not null default 0 check (current_revision >= 0),
  current_command_id uuid,
  content_sha256 bytea check (
    content_sha256 is null or octet_length(content_sha256) = 32
  ),
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  constraint woo_snapshot_delivery_connection_customer_uid
    unique (connection_id, external_customer_id),
  foreign key (organization_id, connection_id)
    references loyalty.commerce_connections(organization_id, id) on delete cascade,
  foreign key (organization_id, customer_id)
    references loyalty.customers(organization_id, id) on delete cascade,
  foreign key (current_command_id)
    references loyalty_private.transactional_outbox(command_id) on delete set null,
  check (external_customer_id ~ '^[1-9][0-9]{0,19}$'),
  check (current_revision <> 0 or current_command_id is null),
  check ((current_revision = 0) = (content_sha256 is null)),
  check ((current_revision = 0) = (generated_at is null)),
  check (updated_at >= created_at)
);

create index woocommerce_customer_snapshot_customer_idx
  on loyalty_private.woocommerce_customer_snapshot_deliveries (
    organization_id, customer_id, id
  );

alter table loyalty_private.woocommerce_customer_snapshot_deliveries
  owner to loyalty_owner;
revoke all on loyalty_private.woocommerce_customer_snapshot_deliveries
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

create or replace function loyalty_private.build_woocommerce_customer_snapshot_v1(
  target_connection_id bigint,
  target_external_customer_id text,
  target_revision bigint,
  target_as_of timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_connection loyalty.commerce_connections%rowtype;
  target_customer loyalty.customers%rowtype;
  target_programme loyalty.programmes%rowtype;
  target_version_id bigint;
  target_wallet loyalty.wallets%rowtype;
  target_account_status text;
  pending_points bigint := 0;
  available_points bigint := 0;
  reserved_points bigint := 0;
  target_tier_name text;
  next_expiry_points bigint;
  next_expiry_at timestamptz;
  earning_methods jsonb := '[]'::jsonb;
  rewards jsonb := '[]'::jsonb;
  enhancements_enabled boolean := false;
begin
  if target_connection_id is null
    or target_external_customer_id !~ '^[1-9][0-9]{0,19}$'
    or target_revision is null or target_revision <= 0
    or target_as_of is null then
    raise exception using errcode = '22023',
      message = 'invalid WooCommerce customer snapshot request';
  end if;

  select connection.* into target_connection
  from loyalty.commerce_connections as connection
  where connection.id = target_connection_id
    and connection.platform = 'woocommerce'
    and connection.status in ('active', 'rotating');
  if not found then return null; end if;

  select customer.* into target_customer
  from loyalty.customer_identities as identity
  join loyalty.customers as customer
    on customer.organization_id = identity.organization_id
   and customer.id = identity.customer_id
   and customer.status = 'active'
  where identity.organization_id = target_connection.organization_id
    and identity.commerce_connection_id = target_connection.id
    and identity.identity_kind = 'registered'
    and identity.external_customer_id =
      'registered:' || target_external_customer_id;
  if not found then return null; end if;

  select programme.* into target_programme
  from loyalty.programmes as programme
  join loyalty.programme_groups as programme_group
    on programme_group.organization_id = programme.organization_id
   and programme_group.id = programme.programme_group_id
   and programme_group.status = 'active'
  join loyalty.programme_group_workspaces as group_workspace
    on group_workspace.organization_id = programme_group.organization_id
   and group_workspace.programme_group_id = programme_group.id
   and group_workspace.workspace_id = target_connection.workspace_id
  where programme.organization_id = target_connection.organization_id
    and programme.id = target_connection.programme_id
    and programme.status = 'active';

  if target_programme.id is not null then
    select version.id into target_version_id
    from loyalty.programme_versions as version
    where version.organization_id = target_programme.organization_id
      and version.programme_id = target_programme.id
      and version.status = 'published'
    order by version.version_number desc, version.id desc
    limit 1;

    select wallet.* into target_wallet
    from loyalty.wallets as wallet
    where wallet.organization_id = target_programme.organization_id
      and wallet.programme_group_id = target_programme.programme_group_id
      and wallet.customer_id = target_customer.id;
  end if;

  target_account_status := case
    when target_programme.id is null or target_version_id is null
      then 'programme_unavailable'
    when target_wallet.id is null then 'ready_without_activity'
    when target_wallet.status = 'blocked' then 'wallet_blocked'
    when target_wallet.status = 'closed' then 'wallet_closed'
    else 'ready'
  end;

  if target_wallet.id is not null then
    select
      coalesce(sum(balance.points) filter (
        where balance.account_kind = 'pending'
      ), 0),
      coalesce(sum(balance.points) filter (
        where balance.account_kind = 'available'
      ), 0),
      coalesce(sum(balance.points) filter (
        where balance.account_kind = 'reserved'
      ), 0)
    into pending_points, available_points, reserved_points
    from loyalty.wallet_balances as balance
    where balance.organization_id = target_wallet.organization_id
      and balance.wallet_id = target_wallet.id;

    select tier.name into target_tier_name
    from loyalty.tier_memberships as membership
    join loyalty.programme_tiers as tier
      on tier.organization_id = membership.organization_id
     and tier.programme_version_id = membership.programme_version_id
     and tier.code = membership.tier_code
    where membership.organization_id = target_wallet.organization_id
      and membership.wallet_id = target_wallet.id
      and membership.effective_from <= target_as_of
      and (membership.effective_until is null
        or membership.effective_until > target_as_of)
      and tier.name !~ '[<>[:cntrl:]]'
    order by membership.effective_from desc, membership.id desc
    limit 1;

    select lot_balance.remaining_points, lot.expires_at
    into next_expiry_points, next_expiry_at
    from loyalty.point_lot_balances as lot_balance
    join loyalty.point_lots as lot
      on lot.organization_id = lot_balance.organization_id
     and lot.id = lot_balance.lot_id
    where lot_balance.organization_id = target_wallet.organization_id
      and lot_balance.wallet_id = target_wallet.id
      and lot_balance.remaining_points > 0
      and lot.available_at <= target_as_of
      and lot.expires_at > target_as_of
    order by lot.expires_at, lot.available_at, lot.id
    limit 1;
  end if;

  if target_version_id is not null then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'name', method.name,
        'availableNow',
          (method.conditions ->> 'startsAt' is null
            or (method.conditions ->> 'startsAt')::timestamptz <= target_as_of)
          and (method.conditions ->> 'endsAt' is null
            or (method.conditions ->> 'endsAt')::timestamptz > target_as_of)
      ) order by method.ordinal, method.code
    ), '[]'::jsonb) into earning_methods
    from (
      select rule.name, rule.conditions, rule.ordinal, rule.code
      from loyalty.programme_earning_rules as rule
      where rule.organization_id = target_programme.organization_id
        and rule.programme_version_id = target_version_id
        and rule.enabled
        and rule.name !~ '[<>[:cntrl:]]'
        and (rule.conditions ->> 'endsAt' is null
          or (rule.conditions ->> 'endsAt')::timestamptz > target_as_of)
      order by rule.ordinal, rule.code
      limit 8
    ) as method;

    select coalesce(jsonb_agg(
      jsonb_build_object(
        'name', reward.name,
        'kind', reward.reward_kind,
        'costPoints', reward.cost_points::text,
        'affordable', reward.cost_points <= available_points
      ) order by reward.cost_points, reward.code
    ), '[]'::jsonb) into rewards
    from (
      select definition.name, definition.reward_kind,
        definition.cost_points, definition.code
      from loyalty.programme_rewards as definition
      where definition.organization_id = target_programme.organization_id
        and definition.programme_version_id = target_version_id
        and definition.reward_kind in (
          'fixed_discount', 'percentage_discount', 'free_product',
          'free_shipping', 'exclusive_access', 'custom'
        )
        and definition.name !~ '[<>[:cntrl:]]'
      order by definition.cost_points, definition.code
      limit 10
    ) as reward;

    select entitlement.enabled into enhancements_enabled
    from loyalty_private.resolve_organization_entitlement(
      target_connection.organization_id,
      'storefront.experience',
      'woocommerce-customer:' || target_connection.public_id::text || ':' ||
        target_external_customer_id,
      target_as_of
    ) as entitlement;
  end if;

  return jsonb_build_object(
    'version', '1',
    'revision', target_revision::text,
    'externalCustomerId', target_external_customer_id,
    'generatedAt', target_as_of,
    'refreshAfter', target_as_of + interval '15 minutes',
    'staleAfter', target_as_of + interval '24 hours',
    'accountStatus', target_account_status,
    'enhancementsEnabled', coalesce(enhancements_enabled, false),
    'programmeName', case
      when target_programme.id is null
        or target_programme.name ~ '[<>[:cntrl:]]' then null
      else target_programme.name
    end,
    'balances', jsonb_build_object(
      'pending', pending_points::text,
      'available', available_points::text,
      'reserved', reserved_points::text
    ),
    'currentTier', case when target_tier_name is null then null
      else jsonb_build_object('name', target_tier_name) end,
    'nextExpiry', case when next_expiry_points is null
      or next_expiry_at is null then null else jsonb_build_object(
        'points', next_expiry_points::text,
        'expiresAt', next_expiry_at
      ) end,
    'earningMethods', earning_methods,
    'rewards', rewards
  );
end;
$$;

create or replace function loyalty_private.queue_woocommerce_customer_snapshots_v1(
  target_connection_public_id uuid,
  target_external_customer_ids text[]
)
returns table (
  command_id uuid,
  external_customer_id text,
  revision text,
  outcome text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_connection loyalty.commerce_connections%rowtype;
  requested_external_customer_id text;
  target_customer_id bigint;
  delivery loyalty_private.woocommerce_customer_snapshot_deliveries%rowtype;
  existing_state text;
  next_revision bigint;
  snapshot jsonb;
  created_command_id uuid;
  projection_clock timestamptz;
begin
  if target_connection_public_id is null
    or target_external_customer_ids is null
    or coalesce(array_length(target_external_customer_ids, 1), 0) > 25
    or exists (
      select 1 from unnest(coalesce(target_external_customer_ids, array[]::text[]))
        as requested(value)
      where requested.value !~ '^[1-9][0-9]{0,19}$'
    )
    or cardinality(target_external_customer_ids) <> (
      select count(distinct requested.value)
      from unnest(coalesce(target_external_customer_ids, array[]::text[]))
        as requested(value)
    ) then
    raise exception using errcode = '22023',
      message = 'invalid WooCommerce snapshot selector batch';
  end if;

  select connection.* into target_connection
  from loyalty.commerce_connections as connection
  where connection.public_id = target_connection_public_id
    and connection.platform = 'woocommerce'
    and connection.status in ('active', 'rotating');
  if not found then
    raise exception using errcode = '22023',
      message = 'unknown WooCommerce connection';
  end if;

  foreach requested_external_customer_id in array target_external_customer_ids loop
    select identity.customer_id into target_customer_id
    from loyalty.customer_identities as identity
    join loyalty.customers as customer
      on customer.organization_id = identity.organization_id
     and customer.id = identity.customer_id
     and customer.status = 'active'
    where identity.organization_id = target_connection.organization_id
      and identity.commerce_connection_id = target_connection.id
      and identity.identity_kind = 'registered'
      and identity.external_customer_id =
        'registered:' || requested_external_customer_id;
    if not found then continue; end if;

    insert into loyalty_private.woocommerce_customer_snapshot_deliveries (
      organization_id, connection_id, customer_id, external_customer_id
    ) values (
      target_connection.organization_id, target_connection.id,
      target_customer_id, requested_external_customer_id
    ) on conflict on constraint woo_snapshot_delivery_connection_customer_uid
      do nothing;

    select state.* into delivery
    from loyalty_private.woocommerce_customer_snapshot_deliveries as state
    where state.connection_id = target_connection.id
      and state.external_customer_id = requested_external_customer_id
    for update;

    existing_state := null;
    if delivery.current_command_id is not null then
      select outbox.state into existing_state
      from loyalty_private.transactional_outbox as outbox
      where outbox.command_id = delivery.current_command_id;
    end if;
    if existing_state in (
      'pending', 'processing', 'retryable', 'manual_review', 'dead_letter'
    ) then
      return query select delivery.current_command_id,
        requested_external_customer_id, delivery.current_revision::text,
        'duplicate'::text;
      continue;
    end if;

    next_revision := delivery.current_revision + 1;
    projection_clock := transaction_timestamp();
    snapshot := loyalty_private.build_woocommerce_customer_snapshot_v1(
      target_connection.id, requested_external_customer_id,
      next_revision, projection_clock
    );
    if snapshot is null then continue; end if;
    if pg_column_size(snapshot) > 32768 then
      raise exception using errcode = '54000',
        message = 'WooCommerce customer snapshot exceeds 32 KiB';
    end if;

    insert into loyalty_private.transactional_outbox (
      organization_id, connection_id, topic, payload_version, payload
    ) values (
      target_connection.organization_id, target_connection.id,
      'woocommerce.customer_experience.put', 'v1',
      jsonb_build_object(
        'kind', 'put_customer_experience_snapshot',
        'snapshot', snapshot
      )
    ) returning transactional_outbox.command_id into created_command_id;

    update loyalty_private.woocommerce_customer_snapshot_deliveries as state
    set current_revision = next_revision,
        current_command_id = created_command_id,
        content_sha256 = extensions.digest(snapshot::text, 'sha256'),
        generated_at = projection_clock,
        updated_at = clock_timestamp()
    where state.id = delivery.id;

    return query select created_command_id, requested_external_customer_id,
      next_revision::text, 'created'::text;
  end loop;
end;
$$;

create or replace function loyalty_private.claim_woocommerce_commands(
  target_connection_public_id uuid,
  target_batch_size integer,
  target_lease_seconds integer,
  target_capabilities text[]
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
  if coalesce(array_length(target_capabilities, 1), 0) > 16
    or exists (
      select 1 from unnest(target_capabilities) as capability(value)
      where capability.value not in (
        'coupon.issue.v2', 'customer_experience.snapshot.v1'
      )
    ) then
    raise exception using errcode = '22023', message = 'unsupported connector capability';
  end if;
  select connection.id into target_connection_id
  from loyalty.commerce_connections as connection
  where connection.public_id = target_connection_public_id
    and connection.platform = 'woocommerce'
    and connection.status in ('active', 'rotating');
  if not found then
    raise exception using errcode = '22023', message = 'unknown commerce connection';
  end if;

  update loyalty_private.transactional_outbox as exhausted
  set state = 'manual_review', lease_owner = null, lease_expires_at = null,
      last_error_code = coalesce(
        exhausted.last_error_code, 'command_attempts_exhausted'
      )
  where exhausted.connection_id = target_connection_id
    and exhausted.topic in (
      'woocommerce.coupon.issue', 'woocommerce.coupon.cancel',
      'woocommerce.order.reconcile',
      'woocommerce.customer_experience.put'
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
      and (
        (
          outbox.topic in (
            'woocommerce.coupon.issue', 'woocommerce.coupon.cancel',
            'woocommerce.order.reconcile'
          )
          and outbox.payload_version = 'v1'
        )
        or (
          outbox.topic = 'woocommerce.coupon.issue'
          and outbox.payload_version = 'v2'
          and 'coupon.issue.v2' = any(target_capabilities)
        )
        or (
          outbox.topic = 'woocommerce.customer_experience.put'
          and outbox.payload_version = 'v1'
          and 'customer_experience.snapshot.v1' = any(target_capabilities)
        )
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
          + make_interval(secs => target_lease_seconds),
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

alter function loyalty_private.build_woocommerce_customer_snapshot_v1(
  bigint, text, bigint, timestamptz
) owner to loyalty_owner;
alter function loyalty_private.queue_woocommerce_customer_snapshots_v1(
  uuid, text[]
) owner to loyalty_owner;
alter function loyalty_private.claim_woocommerce_commands(
  uuid, integer, integer, text[]
) owner to loyalty_owner;

revoke all on function loyalty_private.build_woocommerce_customer_snapshot_v1(
  bigint, text, bigint, timestamptz
) from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function loyalty_private.queue_woocommerce_customer_snapshots_v1(
  uuid, text[]
) from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function loyalty_private.claim_woocommerce_commands(
  uuid, integer, integer, text[]
) from public, anon, authenticated, loyalty_runtime, loyalty_worker;

grant execute on function loyalty_private.queue_woocommerce_customer_snapshots_v1(
  uuid, text[]
) to loyalty_runtime;
grant execute on function loyalty_private.claim_woocommerce_commands(
  uuid, integer, integer, text[]
) to loyalty_runtime;

comment on table loyalty_private.woocommerce_customer_snapshot_deliveries is
  'Private monotonic per-connection/customer snapshot delivery state; display-only payloads never authorize value or native benefits.';
comment on function loyalty_private.queue_woocommerce_customer_snapshots_v1(
  uuid, text[]
) is
  'Derives bounded PII-free snapshots from a signed connection and numeric channel selectors, then queues one monotonic idempotent connector command per active registered customer.';
