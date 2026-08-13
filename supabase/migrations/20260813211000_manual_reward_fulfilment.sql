-- M04 audited manual reward fulfilment. Manual benefits never guess delivery:
-- confirmed fulfilment captures points, definitive rejection compensates them,
-- and every uncertain case remains reserved in an operator-visible queue.

create table loyalty_private.reward_fulfilment_cases (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  reservation_id bigint not null,
  reward_id bigint not null,
  wallet_id bigint not null,
  state text not null default 'pending' check (
    state in ('pending', 'in_progress', 'fulfilled', 'rejected')
  ),
  instructions_snapshot text not null,
  due_at timestamptz not null,
  result_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, reservation_id),
  foreign key (organization_id, reservation_id)
    references loyalty.reward_reservations(organization_id, id) on delete restrict,
  foreign key (organization_id, reward_id)
    references loyalty.programme_rewards(organization_id, id) on delete restrict,
  foreign key (organization_id, wallet_id)
    references loyalty.wallets(organization_id, id) on delete restrict,
  check (length(btrim(instructions_snapshot)) between 1 and 2000),
  check (due_at > created_at),
  check (result_reference is null or length(btrim(result_reference)) between 1 and 500),
  check ((state = 'fulfilled') = (result_reference is not null)),
  check (updated_at >= created_at)
);

create index reward_fulfilment_cases_queue_idx
  on loyalty_private.reward_fulfilment_cases (
    organization_id, state, due_at, id
  );

create table loyalty_private.reward_fulfilment_case_transitions (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  case_id bigint not null,
  from_state text not null check (
    from_state in ('none', 'pending', 'in_progress')
  ),
  to_state text not null check (
    to_state in ('pending', 'in_progress', 'fulfilled', 'rejected')
  ),
  action text not null check (
    action in ('created', 'started', 'fulfilled', 'rejected')
  ),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  idempotency_key text not null,
  request_sha256 bytea not null check (octet_length(request_sha256) = 32),
  reason text,
  result_reference text,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, case_id)
    references loyalty_private.reward_fulfilment_cases(organization_id, id) on delete restrict,
  check (from_state <> to_state),
  check (length(idempotency_key) between 1 and 255),
  check (reason is null or length(btrim(reason)) between 8 and 1000),
  check (result_reference is null or length(btrim(result_reference)) between 1 and 500)
);

create index reward_fulfilment_transitions_history_idx
  on loyalty_private.reward_fulfilment_case_transitions (
    organization_id, case_id, id
  );

alter table loyalty_private.reward_fulfilment_cases owner to loyalty_owner;
alter table loyalty_private.reward_fulfilment_case_transitions owner to loyalty_owner;

create or replace function loyalty_private.protect_reward_fulfilment_case()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
    or new.organization_id <> old.organization_id
    or new.reservation_id <> old.reservation_id
    or new.reward_id <> old.reward_id
    or new.wallet_id <> old.wallet_id
    or new.instructions_snapshot <> old.instructions_snapshot
    or new.due_at <> old.due_at
    or new.created_at <> old.created_at
    or not (
      (old.state = 'pending' and new.state = 'in_progress')
      or (old.state = 'in_progress' and new.state in ('fulfilled', 'rejected'))
    )
    or (new.state = 'fulfilled' and new.result_reference is null)
    or (new.state <> 'fulfilled' and new.result_reference is not null) then
    raise exception using errcode = '55000',
      message = 'manual fulfilment case history is immutable';
  end if;
  return new;
end;
$$;

-- Preserve the proven native implementation as a non-browser delegate, then
-- recreate the compatible public command with a manual-reward branch.
alter function loyalty.redeem_my_reward(uuid, text, uuid)
  rename to redeem_my_native_reward;
alter function loyalty.redeem_my_native_reward(uuid, text, uuid)
  set schema loyalty_private;
revoke all on function loyalty_private.redeem_my_native_reward(uuid, text, uuid)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

create or replace function loyalty.redeem_my_reward(
  target_account_public_id uuid,
  target_reward_code text,
  target_request_id uuid
)
returns table (
  reservation_id uuid,
  state text,
  outcome text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := loyalty_private.request_user_id();
  customer_scope record;
  target_reward loyalty.programme_rewards%rowtype;
  existing_reservation loyalty.reward_reservations%rowtype;
  request_hash bytea;
  operation_key text;
  reservation_result record;
  ledger_result record;
  transition_result record;
  fulfilment_result record;
  fulfilment_sla_days integer;
begin
  if actor_user_id is null then
    raise exception using errcode = '42501',
      message = 'reward redemption not authorized';
  end if;
  if target_account_public_id is null
    or target_request_id is null
    or target_reward_code is null
    or target_reward_code !~ '^[a-z][a-z0-9_-]{0,79}$' then
    raise exception using errcode = '22023',
      message = 'invalid reward redemption request';
  end if;

  select link.organization_id, link.customer_id,
    programme_group.id as programme_group_id,
    version.id as programme_version_id,
    wallet.id as wallet_id, wallet.public_id as wallet_public_id
  into customer_scope
  from loyalty.customer_user_links as link
  join loyalty.customers as customer
    on customer.organization_id = link.organization_id
   and customer.id = link.customer_id
   and customer.status = 'active'
  join loyalty.organizations as organization
    on organization.id = link.organization_id
   and organization.status = 'active'
  join loyalty.commerce_connections as connection
    on connection.organization_id = link.organization_id
   and connection.id = link.source_connection_id
   and connection.status in ('active', 'rotating')
  join loyalty.workspaces as workspace
    on workspace.organization_id = connection.organization_id
   and workspace.id = connection.workspace_id
   and workspace.status = 'active'
  join loyalty.programmes as programme
    on programme.organization_id = connection.organization_id
   and programme.id = connection.programme_id
   and programme.status = 'active'
  join loyalty.programme_groups as programme_group
    on programme_group.organization_id = programme.organization_id
   and programme_group.id = programme.programme_group_id
   and programme_group.status = 'active'
  join loyalty.programme_group_workspaces as group_workspace
    on group_workspace.organization_id = programme_group.organization_id
   and group_workspace.programme_group_id = programme_group.id
   and group_workspace.workspace_id = workspace.id
  join loyalty.programme_versions as version
    on version.organization_id = programme.organization_id
   and version.programme_id = programme.id
   and version.status = 'published'
  join loyalty.wallets as wallet
    on wallet.organization_id = link.organization_id
   and wallet.programme_group_id = programme_group.id
   and wallet.customer_id = customer.id
   and wallet.status = 'active'
  where link.public_id = target_account_public_id
    and link.auth_user_id = actor_user_id
    and link.revoked_at is null;

  if not found then
    return query select * from loyalty_private.redeem_my_native_reward(
      target_account_public_id, target_reward_code, target_request_id
    );
    return;
  end if;

  select reward.* into target_reward
  from loyalty.programme_rewards as reward
  where reward.organization_id = customer_scope.organization_id
    and reward.programme_version_id = customer_scope.programme_version_id
    and reward.programme_group_id = customer_scope.programme_group_id
    and reward.code = target_reward_code
    and reward.reward_kind in ('exclusive_access', 'custom')
    and reward.configuration ->> 'version' = '2'
    and reward.configuration ->> 'fulfilmentMode' = 'manual';
  if not found then
    return query select * from loyalty_private.redeem_my_native_reward(
      target_account_public_id, target_reward_code, target_request_id
    );
    return;
  end if;

  request_hash := extensions.digest(
    pg_catalog.convert_to(
      'customer.reward.redeem.v1|' || actor_user_id::text || '|' ||
      target_account_public_id::text || '|' || target_reward_code,
      'UTF8'
    ),
    'sha256'
  );
  operation_key := 'customer-reward:' || target_request_id::text;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(operation_key, customer_scope.organization_id)
  );
  select reservation.* into existing_reservation
  from loyalty.reward_reservations as reservation
  join loyalty.programme_rewards as reward
    on reward.organization_id = reservation.organization_id
   and reward.id = reservation.reward_id
  where reservation.organization_id = customer_scope.organization_id
    and reservation.idempotency_key = operation_key;
  if found then
    if existing_reservation.wallet_id <> customer_scope.wallet_id
      or existing_reservation.request_sha256 <> request_hash
      or not exists (
        select 1 from loyalty.programme_rewards as reward
        where reward.organization_id = existing_reservation.organization_id
          and reward.id = existing_reservation.reward_id
          and reward.code = target_reward_code
      ) then
      raise exception using errcode = '23514',
        message = 'reward redemption request conflict';
    end if;
    return query select existing_reservation.public_id,
      existing_reservation.state, 'duplicate'::text;
    return;
  end if;

  if coalesce(target_reward.configuration ->> 'fulfilmentSlaDays', '')
      !~ '^[1-9][0-9]?$'
    or (target_reward.configuration ->> 'fulfilmentSlaDays')::integer > 90 then
    raise exception using errcode = '22023',
      message = 'invalid manual fulfilment configuration';
  end if;
  fulfilment_sla_days :=
    (target_reward.configuration ->> 'fulfilmentSlaDays')::integer;

  select * into reservation_result
  from loyalty_private.create_reward_reservation(
    customer_scope.organization_id,
    customer_scope.programme_group_id,
    customer_scope.programme_version_id,
    customer_scope.wallet_id,
    target_reward.id,
    target_reward.cost_points,
    pg_catalog.transaction_timestamp()
      + pg_catalog.make_interval(days => fulfilment_sla_days),
    operation_key,
    request_hash
  );
  select * into ledger_result
  from loyalty_private.reserve_points(
    customer_scope.organization_id,
    customer_scope.programme_group_id,
    customer_scope.programme_version_id,
    customer_scope.wallet_public_id,
    target_reward.cost_points,
    operation_key || ':ledger',
    request_hash,
    pg_catalog.transaction_timestamp()
  );
  select * into transition_result
  from loyalty_private.transition_reward_reservation(
    reservation_result.reservation_public_id,
    'reserved',
    operation_key || ':reserved',
    request_hash,
    'customer:' || actor_user_id::text,
    null,
    ledger_result.transaction_public_id,
    null
  );
  select * into fulfilment_result
  from loyalty_private.enqueue_manual_reward_fulfilment(
    reservation_result.reservation_public_id,
    actor_user_id
  );

  return query select reservation_result.reservation_public_id,
    transition_result.state,
    case
      when reservation_result.outcome = 'created'
        or ledger_result.outcome = 'created'
        or transition_result.outcome = 'created'
        or fulfilment_result.outcome = 'created'
      then 'created'::text
      else 'duplicate'::text
    end;
end;
$$;

create or replace function loyalty.start_reward_fulfilment_command(
  target_case_public_id uuid,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (case_id uuid, state text, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := loyalty_private.request_user_id();
  target_case loyalty_private.reward_fulfilment_cases%rowtype;
  existing_audit loyalty.admin_audit_events%rowtype;
  request_hash bytea;
  transition_key text;
begin
  if actor_user_id is null
    or target_case_public_id is null
    or target_idempotency_key is null
    or length(btrim(target_idempotency_key)) not between 1 and 255
    or target_idempotency_key <> btrim(target_idempotency_key)
    or target_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid fulfilment command';
  end if;
  select fulfilment_case.* into target_case
  from loyalty_private.reward_fulfilment_cases as fulfilment_case
  where fulfilment_case.public_id = target_case_public_id
    and loyalty_private.has_organization_role(
      fulfilment_case.organization_id,
      array['owner', 'admin', 'operator']::text[]
    )
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'fulfilment command not authorized';
  end if;
  request_hash := extensions.digest(
    pg_catalog.convert_to(
      'reward.fulfilment.start|' || target_case.public_id::text,
      'UTF8'
    ),
    'sha256'
  );
  select audit.* into existing_audit
  from loyalty.admin_audit_events as audit
  where audit.organization_id = target_case.organization_id
    and audit.idempotency_key = target_idempotency_key;
  if found then
    if existing_audit.action <> 'reward.fulfilment.start'
      or existing_audit.resource_public_id <> target_case.public_id
      or existing_audit.request_sha256 <> request_hash then
      raise exception using errcode = '23514',
        message = 'fulfilment command idempotency conflict';
    end if;
    return query select target_case.public_id, target_case.state, 'duplicate'::text;
    return;
  end if;
  if target_case.state <> 'pending' then
    raise exception using errcode = '23514', message = 'fulfilment case is not pending';
  end if;
  transition_key := 'manual-case:' || target_correlation_id::text || ':started';
  insert into loyalty_private.reward_fulfilment_case_transitions (
    organization_id, case_id, from_state, to_state, action, actor_user_id,
    idempotency_key, request_sha256
  ) values (
    target_case.organization_id, target_case.id, 'pending', 'in_progress',
    'started', actor_user_id, transition_key, request_hash
  );
  update loyalty_private.reward_fulfilment_cases
  set state = 'in_progress', updated_at = clock_timestamp()
  where id = target_case.id;
  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id,
    metadata
  ) values (
    target_case.organization_id, actor_user_id,
    'reward.fulfilment.start', 'reward_fulfilment_case', target_case.public_id,
    target_idempotency_key, request_hash, target_correlation_id,
    pg_catalog.jsonb_build_object('state', 'in_progress')
  );
  return query select target_case.public_id, 'in_progress'::text, 'created'::text;
end;
$$;

create or replace function loyalty.resolve_reward_fulfilment_command(
  target_case_public_id uuid,
  target_resolution text,
  target_result_reference text,
  target_reason text,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (case_id uuid, state text, reservation_state text, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := loyalty_private.request_user_id();
  target_case loyalty_private.reward_fulfilment_cases%rowtype;
  target_reservation loyalty.reward_reservations%rowtype;
  existing_audit loyalty.admin_audit_events%rowtype;
  reservation_ledger_public_id uuid;
  request_hash bytea;
  operation_prefix text;
  ledger_result record;
  transition_result record;
  resolved_reservation_state text;
begin
  if actor_user_id is null
    or target_case_public_id is null
    or target_resolution not in ('fulfilled', 'rejected')
    or target_idempotency_key is null
    or length(btrim(target_idempotency_key)) not between 1 and 255
    or target_idempotency_key <> btrim(target_idempotency_key)
    or target_correlation_id is null
    or (
      target_resolution = 'fulfilled'
      and (
        target_result_reference is null
        or length(btrim(target_result_reference)) not between 1 and 500
        or target_result_reference <> btrim(target_result_reference)
      )
    )
    or (target_resolution = 'rejected' and target_result_reference is not null)
    or (
      target_reason is not null
      and (
        length(btrim(target_reason)) not between 8 and 1000
        or target_reason <> btrim(target_reason)
      )
    )
    or (target_resolution = 'rejected' and target_reason is null) then
    raise exception using errcode = '22023', message = 'invalid fulfilment resolution';
  end if;
  select fulfilment_case.* into target_case
  from loyalty_private.reward_fulfilment_cases as fulfilment_case
  where fulfilment_case.public_id = target_case_public_id
    and loyalty_private.has_organization_role(
      fulfilment_case.organization_id,
      array['owner', 'admin', 'operator']::text[]
    )
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'fulfilment command not authorized';
  end if;
  request_hash := extensions.digest(
    pg_catalog.convert_to(
      'reward.fulfilment.resolve|' || target_case.public_id::text || '|' ||
      target_resolution || '|' || coalesce(target_result_reference, '') || '|' ||
      coalesce(target_reason, ''),
      'UTF8'
    ),
    'sha256'
  );
  select audit.* into existing_audit
  from loyalty.admin_audit_events as audit
  where audit.organization_id = target_case.organization_id
    and audit.idempotency_key = target_idempotency_key;
  if found then
    if existing_audit.action <> 'reward.fulfilment.' || target_resolution
      or existing_audit.resource_public_id <> target_case.public_id
      or existing_audit.request_sha256 <> request_hash then
      raise exception using errcode = '23514',
        message = 'fulfilment command idempotency conflict';
    end if;
    select reservation.state into resolved_reservation_state
    from loyalty.reward_reservations as reservation
    where reservation.organization_id = target_case.organization_id
      and reservation.id = target_case.reservation_id;
    return query select target_case.public_id, target_case.state,
      resolved_reservation_state, 'duplicate'::text;
    return;
  end if;
  if target_case.state <> 'in_progress' then
    raise exception using errcode = '23514',
      message = 'fulfilment case is not in progress';
  end if;
  select reservation.* into strict target_reservation
  from loyalty.reward_reservations as reservation
  where reservation.organization_id = target_case.organization_id
    and reservation.id = target_case.reservation_id
  for update;
  if target_reservation.state <> 'reserved'
    or target_reservation.ledger_reservation_transaction_id is null then
    raise exception using errcode = '23514',
      message = 'manual reward reservation is not unresolved';
  end if;
  select transaction.public_id into strict reservation_ledger_public_id
  from loyalty.ledger_transactions as transaction
  where transaction.organization_id = target_reservation.organization_id
    and transaction.id = target_reservation.ledger_reservation_transaction_id
    and transaction.transaction_kind = 'reserve';
  operation_prefix := 'manual-case:' || target_correlation_id::text;

  if target_resolution = 'fulfilled' then
    select * into transition_result
    from loyalty_private.transition_reward_reservation(
      target_reservation.public_id,
      'issued',
      operation_prefix || ':issued',
      request_hash,
      'merchant:' || actor_user_id::text,
      target_reason,
      null,
      target_result_reference
    );
    select * into ledger_result
    from loyalty_private.capture_reservation(
      target_reservation.organization_id,
      reservation_ledger_public_id,
      operation_prefix || ':ledger-capture',
      request_hash,
      pg_catalog.transaction_timestamp()
    );
    select * into transition_result
    from loyalty_private.transition_reward_reservation(
      target_reservation.public_id,
      'captured',
      operation_prefix || ':captured',
      request_hash,
      'merchant:' || actor_user_id::text,
      target_reason,
      ledger_result.transaction_public_id,
      target_result_reference
    );
    resolved_reservation_state := 'captured';
  else
    select * into transition_result
    from loyalty_private.transition_reward_reservation(
      target_reservation.public_id,
      'failed',
      operation_prefix || ':failed',
      request_hash,
      'merchant:' || actor_user_id::text,
      target_reason,
      null,
      null
    );
    select * into ledger_result
    from loyalty_private.cancel_reservation(
      target_reservation.organization_id,
      reservation_ledger_public_id,
      operation_prefix || ':ledger-cancel',
      request_hash,
      pg_catalog.transaction_timestamp()
    );
    select * into transition_result
    from loyalty_private.transition_reward_reservation(
      target_reservation.public_id,
      'released',
      operation_prefix || ':released',
      request_hash,
      'merchant:' || actor_user_id::text,
      target_reason,
      ledger_result.transaction_public_id,
      null
    );
    resolved_reservation_state := 'released';
  end if;

  insert into loyalty_private.reward_fulfilment_case_transitions (
    organization_id, case_id, from_state, to_state, action, actor_user_id,
    idempotency_key, request_sha256, reason, result_reference
  ) values (
    target_case.organization_id, target_case.id, 'in_progress',
    target_resolution, target_resolution, actor_user_id,
    operation_prefix || ':resolved', request_hash, target_reason,
    target_result_reference
  );
  update loyalty_private.reward_fulfilment_cases
  set state = target_resolution,
      result_reference = target_result_reference,
      updated_at = clock_timestamp()
  where id = target_case.id;
  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id,
    metadata
  ) values (
    target_case.organization_id, actor_user_id,
    'reward.fulfilment.' || target_resolution,
    'reward_fulfilment_case', target_case.public_id,
    target_idempotency_key, request_hash, target_correlation_id,
    pg_catalog.jsonb_build_object(
      'state', target_resolution,
      'reservationState', resolved_reservation_state
    )
  );
  return query select target_case.public_id, target_resolution,
    resolved_reservation_state, 'created'::text;
end;
$$;

alter function loyalty_private.protect_reward_fulfilment_case()
  owner to loyalty_owner;

create trigger reward_fulfilment_cases_protect_history
before update or delete on loyalty_private.reward_fulfilment_cases
for each row execute function loyalty_private.protect_reward_fulfilment_case();

create trigger reward_fulfilment_case_transitions_immutable
before update or delete on loyalty_private.reward_fulfilment_case_transitions
for each row execute function loyalty_private.reject_immutable_change();

create or replace function loyalty_private.enqueue_manual_reward_fulfilment(
  target_reservation_public_id uuid,
  target_actor_user_id uuid
)
returns table (case_public_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_reservation loyalty.reward_reservations%rowtype;
  target_reward loyalty.programme_rewards%rowtype;
  existing_case loyalty_private.reward_fulfilment_cases%rowtype;
  created_case loyalty_private.reward_fulfilment_cases%rowtype;
  sla_days integer;
  transition_key text;
begin
  if target_actor_user_id is null then
    raise exception using errcode = '22023', message = 'manual fulfilment actor is required';
  end if;
  select reservation.* into target_reservation
  from loyalty.reward_reservations as reservation
  where reservation.public_id = target_reservation_public_id
  for update;
  if not found or target_reservation.state <> 'reserved' then
    raise exception using errcode = '22023', message = 'unknown reserved manual reward';
  end if;
  select reward.* into strict target_reward
  from loyalty.programme_rewards as reward
  where reward.organization_id = target_reservation.organization_id
    and reward.id = target_reservation.reward_id;
  if target_reward.reward_kind not in ('exclusive_access', 'custom')
    or target_reward.configuration ->> 'version' <> '2'
    or target_reward.configuration ->> 'fulfilmentMode' <> 'manual' then
    raise exception using errcode = '22023', message = 'reward is not manually fulfilled';
  end if;
  select fulfilment_case.* into existing_case
  from loyalty_private.reward_fulfilment_cases as fulfilment_case
  where fulfilment_case.organization_id = target_reservation.organization_id
    and fulfilment_case.reservation_id = target_reservation.id;
  if found then
    return query select existing_case.public_id, 'duplicate'::text;
    return;
  end if;
  sla_days := (target_reward.configuration ->> 'fulfilmentSlaDays')::integer;
  insert into loyalty_private.reward_fulfilment_cases (
    organization_id, reservation_id, reward_id, wallet_id,
    instructions_snapshot, due_at
  ) values (
    target_reservation.organization_id, target_reservation.id,
    target_reward.id, target_reservation.wallet_id,
    target_reward.configuration ->> 'fulfilmentInstructions',
    pg_catalog.transaction_timestamp() + pg_catalog.make_interval(days => sla_days)
  ) returning * into created_case;
  transition_key := 'manual-case:' || created_case.public_id::text || ':created';
  insert into loyalty_private.reward_fulfilment_case_transitions (
    organization_id, case_id, from_state, to_state, action, actor_user_id,
    idempotency_key, request_sha256
  ) values (
    created_case.organization_id, created_case.id, 'none', 'pending', 'created',
    target_actor_user_id, transition_key, target_reservation.request_sha256
  );
  return query select created_case.public_id, 'created'::text;
end;
$$;

create or replace function loyalty.list_reward_fulfilment_cases(
  target_programme_public_id uuid,
  target_state text default null,
  target_limit integer default 50
)
returns table (
  case_id uuid,
  reservation_id uuid,
  customer_id uuid,
  customer_reference text,
  reward_code text,
  reward_name text,
  cost_points text,
  state text,
  instructions text,
  due_at timestamptz,
  result_reference text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_programme loyalty.programmes%rowtype;
begin
  if target_programme_public_id is null
    or target_limit not between 1 and 100
    or target_state is not null
      and target_state not in ('pending', 'in_progress', 'fulfilled', 'rejected') then
    raise exception using errcode = '22023', message = 'invalid fulfilment queue filter';
  end if;
  select programme.* into target_programme
  from loyalty.programmes as programme
  where programme.public_id = target_programme_public_id
    and loyalty_private.has_organization_role(
      programme.organization_id,
      array['owner', 'admin', 'operator', 'analyst', 'auditor']::text[]
    );
  if not found then
    raise exception using errcode = '42501', message = 'fulfilment queue not authorized';
  end if;
  return query
  select fulfilment_case.public_id, reservation.public_id, customer.public_id,
    coalesce(nullif(btrim(customer.display_reference), ''),
      'Customer ' || left(customer.public_id::text, 8)),
    reward.code, reward.name, reservation.cost_points::text,
    fulfilment_case.state, fulfilment_case.instructions_snapshot,
    fulfilment_case.due_at, fulfilment_case.result_reference,
    fulfilment_case.created_at, fulfilment_case.updated_at
  from loyalty_private.reward_fulfilment_cases as fulfilment_case
  join loyalty.reward_reservations as reservation
    on reservation.organization_id = fulfilment_case.organization_id
   and reservation.id = fulfilment_case.reservation_id
  join loyalty.programme_rewards as reward
    on reward.organization_id = fulfilment_case.organization_id
   and reward.id = fulfilment_case.reward_id
  join loyalty.wallets as wallet
    on wallet.organization_id = fulfilment_case.organization_id
   and wallet.id = fulfilment_case.wallet_id
  join loyalty.customers as customer
    on customer.organization_id = wallet.organization_id
   and customer.id = wallet.customer_id
  where fulfilment_case.organization_id = target_programme.organization_id
    and reservation.programme_group_id = target_programme.programme_group_id
    and (target_state is null or fulfilment_case.state = target_state)
  order by
    case when fulfilment_case.state in ('pending', 'in_progress') then 0 else 1 end,
    fulfilment_case.due_at, fulfilment_case.id
  limit target_limit;
end;
$$;

create or replace function loyalty.get_reward_fulfilment_summary(
  target_programme_public_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_programme loyalty.programmes%rowtype;
  result jsonb;
begin
  select programme.* into target_programme
  from loyalty.programmes as programme
  where programme.public_id = target_programme_public_id
    and loyalty_private.has_organization_role(
      programme.organization_id,
      array['owner', 'admin', 'operator', 'analyst', 'auditor']::text[]
    );
  if not found then
    raise exception using errcode = '42501', message = 'fulfilment summary not authorized';
  end if;
  select pg_catalog.jsonb_build_object(
    'pending', count(*) filter (where fulfilment_case.state = 'pending'),
    'inProgress', count(*) filter (where fulfilment_case.state = 'in_progress'),
    'overdue', count(*) filter (
      where fulfilment_case.state in ('pending', 'in_progress')
        and fulfilment_case.due_at < pg_catalog.transaction_timestamp()
    ),
    'fulfilled30d', count(*) filter (
      where fulfilment_case.state = 'fulfilled'
        and fulfilment_case.updated_at >= pg_catalog.transaction_timestamp() - interval '30 days'
    ),
    'rejected30d', count(*) filter (
      where fulfilment_case.state = 'rejected'
        and fulfilment_case.updated_at >= pg_catalog.transaction_timestamp() - interval '30 days'
    )
  ) into result
  from loyalty_private.reward_fulfilment_cases as fulfilment_case
  join loyalty.reward_reservations as reservation
    on reservation.organization_id = fulfilment_case.organization_id
   and reservation.id = fulfilment_case.reservation_id
  where fulfilment_case.organization_id = target_programme.organization_id
    and reservation.programme_group_id = target_programme.programme_group_id;
  return result;
end;
$$;

alter function loyalty_private.redeem_my_native_reward(uuid, text, uuid)
  owner to loyalty_owner;
alter function loyalty.redeem_my_reward(uuid, text, uuid)
  owner to loyalty_owner;
alter function loyalty_private.enqueue_manual_reward_fulfilment(uuid, uuid)
  owner to loyalty_owner;
alter function loyalty.start_reward_fulfilment_command(uuid, text, uuid)
  owner to loyalty_owner;
alter function loyalty.resolve_reward_fulfilment_command(
  uuid, text, text, text, text, uuid
) owner to loyalty_owner;
alter function loyalty.list_reward_fulfilment_cases(uuid, text, integer)
  owner to loyalty_owner;
alter function loyalty.get_reward_fulfilment_summary(uuid)
  owner to loyalty_owner;

alter table loyalty_private.reward_fulfilment_cases enable row level security;
alter table loyalty_private.reward_fulfilment_case_transitions
  enable row level security;

revoke all on loyalty_private.reward_fulfilment_cases,
  loyalty_private.reward_fulfilment_case_transitions
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

revoke all on function
  loyalty_private.redeem_my_native_reward(uuid, text, uuid),
  loyalty.redeem_my_reward(uuid, text, uuid),
  loyalty_private.enqueue_manual_reward_fulfilment(uuid, uuid),
  loyalty.start_reward_fulfilment_command(uuid, text, uuid),
  loyalty.resolve_reward_fulfilment_command(uuid, text, text, text, text, uuid),
  loyalty.list_reward_fulfilment_cases(uuid, text, integer),
  loyalty.get_reward_fulfilment_summary(uuid)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

grant execute on function
  loyalty.redeem_my_reward(uuid, text, uuid),
  loyalty.start_reward_fulfilment_command(uuid, text, uuid),
  loyalty.resolve_reward_fulfilment_command(uuid, text, text, text, text, uuid),
  loyalty.list_reward_fulfilment_cases(uuid, text, integer),
  loyalty.get_reward_fulfilment_summary(uuid)
  to authenticated;

comment on table loyalty_private.reward_fulfilment_cases is
  'Tenant-scoped manual benefit queue; uncertain delivery remains pending or in progress with points reserved.';
comment on table loyalty_private.reward_fulfilment_case_transitions is
  'Immutable actor and decision history for manual benefit fulfilment.';
comment on function loyalty.redeem_my_reward(uuid, text, uuid) is
  'Auth-derived reward redemption that reserves points before either a native command or audited manual case.';
comment on function loyalty.start_reward_fulfilment_command(uuid, text, uuid) is
  'Starts one pending manual benefit case for a live owner, admin, or operator with audit evidence.';
comment on function loyalty.resolve_reward_fulfilment_command(uuid, text, text, text, text, uuid) is
  'Captures points only for confirmed fulfilment or compensates only a definitive rejection, exactly once.';
