-- M14 post-review hardening for managed billing session orchestration.
-- Browser redirects remain non-authoritative. Exact provider retries are
-- bounded below Stripe's documented idempotency-retention floor, and an
-- expired ambiguous operation requires explicit deployment-operator evidence.

alter table loyalty_private.managed_billing_session_operations
  drop constraint managed_billing_session_operations_state_check;

alter table loyalty_private.managed_billing_session_operations
  add constraint managed_billing_session_operations_state_check check (
    state in (
      'customer_required', 'ready', 'ambiguous', 'reconciliation_required',
      'rejected', 'held', 'completed'
    )
  ),
  add column customer_replay_deadline_at timestamptz,
  add column session_replay_deadline_at timestamptz;

-- Existing ambiguous rows have no trustworthy first-attempt timestamp. Do not
-- manufacture new provider authority for them during upgrade.
update loyalty_private.managed_billing_session_operations
set state = 'reconciliation_required',
  last_detail_code = 'provider_reconciliation_required',
  updated_at = pg_catalog.statement_timestamp()
where state = 'ambiguous';

create table loyalty_private.managed_billing_session_reconciliations (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null
    references loyalty.organizations(id) on delete restrict,
  operation_id bigint not null
    references loyalty_private.managed_billing_session_operations(id)
    on delete restrict,
  stage text not null check (stage in ('customer', 'session')),
  resolution text not null check (
    resolution in ('provider_resource_found', 'provider_resource_absent')
  ),
  provider_resource_id text,
  actor_reference text not null
    check (length(btrim(actor_reference)) between 3 and 200),
  reason text not null check (length(btrim(reason)) between 8 and 1000),
  idempotency_key uuid not null,
  request_fingerprint bytea not null
    check (octet_length(request_fingerprint) = 32),
  created_at timestamptz not null default now(),
  unique (operation_id, idempotency_key),
  check (
    (resolution = 'provider_resource_found' and provider_resource_id is not null)
    or (resolution = 'provider_resource_absent' and provider_resource_id is null)
  )
);

alter table loyalty_private.managed_billing_session_reconciliations
  owner to loyalty_owner;

alter table loyalty_private.managed_billing_session_reconciliations
  enable row level security;
alter table loyalty_private.managed_billing_session_reconciliations
  force row level security;

create policy managed_billing_session_reconciliations_owner
on loyalty_private.managed_billing_session_reconciliations
for all to loyalty_owner
using (true)
with check (true);

create trigger managed_billing_session_reconciliations_immutable
before update or delete on loyalty_private.managed_billing_session_reconciliations
for each row execute function loyalty_private.reject_immutable_change();

create or replace function loyalty_private.reject_second_live_billing_subscription_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'managed-billing-checkout:' || new.organization_id::text, 0
  ));
  if new.provider_state <> 'cancelled' and exists (
    select 1
    from (
      select distinct on (revision.provider_subscription_id)
        revision.provider_subscription_id,
        revision.provider_state
      from loyalty_private.managed_billing_state_revisions as revision
      where revision.organization_id = new.organization_id
      order by revision.provider_subscription_id,
        revision.provider_event_created_at desc,
        revision.provider_event_id desc
    ) as current_subscription
    where current_subscription.provider_subscription_id
        <> new.provider_subscription_id
      and current_subscription.provider_state <> 'cancelled'
  ) then
    raise exception using errcode = '55000',
      message = 'managed billing subscription identity conflict';
  end if;
  return new;
end;
$$;

do $$
begin
  if exists (
    select 1
    from (
      select revision.organization_id,
        revision.billing_account_version_id,
        revision.provider_subscription_id,
        revision.provider_state,
        row_number() over (
          partition by revision.organization_id,
            revision.billing_account_version_id,
            revision.provider_subscription_id
          order by revision.provider_event_created_at desc,
            revision.provider_event_id desc
        ) as position
      from loyalty_private.managed_billing_state_revisions as revision
    ) as current_subscription
    where current_subscription.position = 1
      and current_subscription.provider_state <> 'cancelled'
    group by current_subscription.organization_id
    having count(*) > 1
  ) then
    raise exception using errcode = '55000',
      message = 'existing managed billing subscription identity conflict';
  end if;
end;
$$;

create trigger managed_billing_state_one_live_subscription
before insert on loyalty_private.managed_billing_state_revisions
for each row execute function
  loyalty_private.reject_second_live_billing_subscription_v1();

create or replace function loyalty_private.reserve_managed_billing_session_v2(
  target_actor_user_id uuid,
  target_organization_public_id uuid,
  target_action text,
  target_plan_public_id uuid,
  target_operation_id uuid,
  checked_at timestamptz default now()
)
returns table (
  deployment_mode text, operation_id uuid, operation_state text,
  provider_customer_id text, provider_price_id text, live_mode boolean,
  customer_idempotency_key text, session_idempotency_key text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_mode text;
  target_organization_id bigint;
begin
  select configuration.deployment_mode into strict target_mode
  from loyalty_private.deployment_configuration_versions as configuration
  where configuration.effective_from <= checked_at
  order by configuration.effective_from desc, configuration.id desc
  limit 1;

  -- Preserve the self-hosted early-return boundary: no account, subscription,
  -- plan, or provider table is inspected before the V1 local-mode result.
  if target_mode <> 'managed' then
    return query select *
    from loyalty_private.reserve_managed_billing_session_v1(
      target_actor_user_id, target_organization_public_id, target_action,
      target_plan_public_id, target_operation_id, checked_at
    );
    return;
  end if;

  select organization.id into target_organization_id
  from loyalty.organizations as organization
  where organization.public_id = target_organization_public_id;
  if target_organization_id is null then
    raise exception using errcode = '42501',
      message = 'managed billing operation unavailable';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'managed-billing-checkout:' || target_organization_id::text, 0
  ));

  if target_action = 'checkout'
     and not exists (
       select 1
       from loyalty_private.managed_billing_session_operations as operation
       where operation.public_id = target_operation_id
     ) then
    if exists (
      select 1
      from (
        select distinct on (revision.provider_subscription_id)
          revision.provider_state
        from loyalty_private.managed_billing_state_revisions as revision
        where revision.organization_id = target_organization_id
          and revision.provider_event_created_at <= checked_at
        order by revision.provider_subscription_id,
          revision.provider_event_created_at desc,
          revision.provider_event_id desc
      ) as current_subscription
      where current_subscription.provider_state <> 'cancelled'
    ) then
      raise exception using errcode = '55000',
        message = 'managed billing subscription already present';
    end if;

    if exists (
      select 1
      from loyalty_private.managed_billing_session_operations as pending
      where pending.organization_id = target_organization_id
        and pending.action = 'checkout'
        and (
          pending.state in (
            'customer_required', 'ready', 'ambiguous',
            'reconciliation_required'
          )
          or (
            pending.state = 'completed'
            and pending.completed_at > checked_at - interval '24 hours'
          )
        )
    ) then
      raise exception using errcode = '55000',
        message = 'managed billing checkout already in progress';
    end if;
  end if;

  return query select *
  from loyalty_private.reserve_managed_billing_session_v1(
    target_actor_user_id, target_organization_public_id, target_action,
    target_plan_public_id, target_operation_id, checked_at
  );
end;
$$;

create or replace function loyalty_private.authorize_managed_billing_session_attempt_v2(
  target_actor_user_id uuid,
  target_operation_id uuid,
  target_stage text,
  checked_at timestamptz default now()
)
returns table (
  action text, provider_customer_id text, provider_price_id text,
  live_mode boolean, provider_idempotency_key text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  operation loyalty_private.managed_billing_session_operations%rowtype;
  replay_deadline timestamptz;
begin
  if target_stage not in ('customer', 'session') then
    raise exception using errcode = '22023',
      message = 'invalid managed billing operation stage';
  end if;

  select candidate.* into operation
  from loyalty_private.managed_billing_session_operations as candidate
  where candidate.public_id = target_operation_id
    and candidate.actor_user_id = target_actor_user_id
  for update;
  if operation.id is null then
    raise exception using errcode = '42501',
      message = 'managed billing operation unavailable';
  end if;

  if operation.action = 'checkout' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'managed-billing-checkout:' || operation.organization_id::text, 0
    ));
    if exists (
      select 1
      from (
        select distinct on (revision.provider_subscription_id)
          revision.provider_state
        from loyalty_private.managed_billing_state_revisions as revision
        where revision.organization_id = operation.organization_id
          and revision.provider_event_created_at <= checked_at
        order by revision.provider_subscription_id,
          revision.provider_event_created_at desc,
          revision.provider_event_id desc
      ) as current_subscription
      where current_subscription.provider_state <> 'cancelled'
    ) then
      update loyalty_private.managed_billing_session_operations
      set state = case when operation.state = 'ambiguous'
          then 'reconciliation_required' else 'rejected' end,
        last_detail_code = 'managed_billing_subscription_already_present',
        updated_at = checked_at
      where id = operation.id;
      return;
    end if;
  end if;

  replay_deadline := case target_stage
    when 'customer' then operation.customer_replay_deadline_at
    else operation.session_replay_deadline_at
  end;

  if operation.state = 'reconciliation_required'
     or (
       operation.state = 'ambiguous'
       and (replay_deadline is null or replay_deadline <= checked_at)
     ) then
    update loyalty_private.managed_billing_session_operations
    set state = 'reconciliation_required',
      last_detail_code = 'provider_reconciliation_required',
      updated_at = checked_at
    where id = operation.id;
    return;
  end if;

  if replay_deadline is null then
    if target_stage = 'customer' then
      update loyalty_private.managed_billing_session_operations
      set customer_replay_deadline_at = checked_at + interval '23 hours',
        updated_at = checked_at
      where id = operation.id;
    else
      update loyalty_private.managed_billing_session_operations
      set session_replay_deadline_at = checked_at + interval '23 hours',
        updated_at = checked_at
      where id = operation.id;
    end if;
  end if;

  return query select *
  from loyalty_private.authorize_managed_billing_session_attempt_v1(
    target_actor_user_id, target_operation_id, target_stage, checked_at
  );
end;
$$;

create or replace function loyalty_private.reconcile_managed_billing_session_v1(
  target_operation_id uuid,
  target_stage text,
  target_resolution text,
  target_provider_resource_id text,
  target_actor_reference text,
  target_reason text,
  target_idempotency_key uuid,
  checked_at timestamptz default now()
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  operation loyalty_private.managed_billing_session_operations%rowtype;
  existing loyalty_private.managed_billing_session_reconciliations%rowtype;
  target_fingerprint bytea;
  organization_public_id uuid;
  account_public_id uuid;
  result_state text;
begin
  if target_operation_id is null
     or target_stage not in ('customer', 'session')
     or target_resolution not in (
       'provider_resource_found', 'provider_resource_absent'
     )
     or target_actor_reference is null
     or length(btrim(target_actor_reference)) not between 3 and 200
     or target_reason is null
     or length(btrim(target_reason)) not between 8 and 1000
     or target_idempotency_key is null
     or (
       target_resolution = 'provider_resource_found'
       and target_provider_resource_id is null
     )
     or (
       target_resolution = 'provider_resource_absent'
       and target_provider_resource_id is not null
     ) then
    raise exception using errcode = '22023',
      message = 'invalid managed billing reconciliation';
  end if;

  select candidate.* into operation
  from loyalty_private.managed_billing_session_operations as candidate
  where candidate.public_id = target_operation_id
  for update;
  if operation.id is null then
    raise exception using errcode = '22023',
      message = 'managed billing operation unavailable';
  end if;

  if (target_stage = 'customer' and operation.provider_customer_id is not null)
     or (target_stage = 'session' and operation.provider_customer_id is null) then
    raise exception using errcode = '22023',
      message = 'invalid managed billing reconciliation stage';
  end if;

  if target_resolution = 'provider_resource_found' and (
    (target_stage = 'customer' and (
      operation.provider_customer_id is not null
      or target_provider_resource_id !~ '^cus_[A-Za-z0-9]{8,120}$'
    ))
    or (target_stage = 'session' and (
      operation.provider_customer_id is null
      or (
        operation.action = 'checkout'
        and target_provider_resource_id
          !~ '^cs_(test|live)_[A-Za-z0-9]{8,180}$'
      )
      or (
        operation.action = 'portal'
        and target_provider_resource_id !~ '^bps_[A-Za-z0-9]{8,180}$'
      )
    ))
  ) then
    raise exception using errcode = '22023',
      message = 'invalid managed billing reconciliation resource';
  end if;

  target_fingerprint := extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_array(
      target_operation_id, target_stage, target_resolution,
      target_provider_resource_id, btrim(target_actor_reference),
      btrim(target_reason)
    )::text, 'utf8'
  ), 'sha256');

  select reconciliation.* into existing
  from loyalty_private.managed_billing_session_reconciliations as reconciliation
  where reconciliation.operation_id = operation.id
    and reconciliation.idempotency_key = target_idempotency_key;
  if existing.id is not null then
    if existing.request_fingerprint <> target_fingerprint then
      raise exception using errcode = '23505',
        message = 'managed billing reconciliation idempotency conflict';
    end if;
    return operation.state;
  end if;

  if operation.state <> 'reconciliation_required' then
    raise exception using errcode = '55000',
      message = 'managed billing reconciliation not required';
  end if;

  if target_resolution = 'provider_resource_absent' then
    update loyalty_private.managed_billing_session_operations
    set state = 'rejected', last_detail_code = 'provider_absence_confirmed',
      updated_at = checked_at
    where id = operation.id;
  elsif target_stage = 'customer' then
    select organization.public_id into strict organization_public_id
    from loyalty.organizations as organization
    where organization.id = operation.organization_id;
    select loyalty_private.record_managed_billing_account_v1(
      organization_public_id, target_provider_resource_id,
      operation.live_mode, btrim(target_actor_reference), btrim(target_reason),
      checked_at, target_idempotency_key
    ) into strict account_public_id;
    update loyalty_private.managed_billing_session_operations as target
    set billing_account_version_id = account.id,
      provider_customer_id = target_provider_resource_id,
      state = 'ready', last_detail_code = null, updated_at = checked_at
    from loyalty_private.managed_billing_account_versions as account
    where target.id = operation.id and account.public_id = account_public_id;
  else
    update loyalty_private.managed_billing_session_operations
    set provider_session_id = target_provider_resource_id,
      state = 'completed', last_detail_code = null, updated_at = checked_at,
      completed_at = checked_at
    where id = operation.id;
  end if;

  insert into loyalty_private.managed_billing_session_reconciliations (
    organization_id, operation_id, stage, resolution, provider_resource_id,
    actor_reference, reason, idempotency_key, request_fingerprint, created_at
  ) values (
    operation.organization_id, operation.id, target_stage, target_resolution,
    target_provider_resource_id, btrim(target_actor_reference),
    btrim(target_reason), target_idempotency_key, target_fingerprint,
    checked_at
  );

  select target.state into strict result_state
  from loyalty_private.managed_billing_session_operations as target
  where target.id = operation.id;
  return result_state;
end;
$$;

alter function loyalty_private.reject_second_live_billing_subscription_v1()
  owner to loyalty_owner;
alter function loyalty_private.reserve_managed_billing_session_v2(
  uuid, uuid, text, uuid, uuid, timestamptz
) owner to loyalty_owner;
alter function loyalty_private.authorize_managed_billing_session_attempt_v2(
  uuid, uuid, text, timestamptz
) owner to loyalty_owner;
alter function loyalty_private.reconcile_managed_billing_session_v1(
  uuid, text, text, text, text, text, uuid, timestamptz
) owner to loyalty_owner;

revoke all on loyalty_private.managed_billing_session_reconciliations
from public, anon, authenticated, loyalty_runtime, loyalty_worker;

revoke all on function
  loyalty_private.reject_second_live_billing_subscription_v1(),
  loyalty_private.reserve_managed_billing_session_v2(
    uuid, uuid, text, uuid, uuid, timestamptz
  ),
  loyalty_private.authorize_managed_billing_session_attempt_v2(
    uuid, uuid, text, timestamptz
  ),
  loyalty_private.reconcile_managed_billing_session_v1(
    uuid, text, text, text, text, text, uuid, timestamptz
  )
from public, anon, authenticated, loyalty_runtime, loyalty_worker;

grant execute on function
  loyalty_private.reserve_managed_billing_session_v2(
    uuid, uuid, text, uuid, uuid, timestamptz
  ),
  loyalty_private.authorize_managed_billing_session_attempt_v2(
    uuid, uuid, text, timestamptz
  )
to loyalty_runtime;

comment on table loyalty_private.managed_billing_session_reconciliations is
  'Immutable deployment-operator evidence for an expired ambiguous provider operation; it contains no payment data or reusable credential.';
comment on function loyalty_private.reserve_managed_billing_session_v2(
  uuid, uuid, text, uuid, uuid, timestamptz
) is
  'Serializes checkout per organization and rejects a new subscription checkout while a live subscription or unresolved checkout exists.';
comment on function loyalty_private.authorize_managed_billing_session_attempt_v2(
  uuid, uuid, text, timestamptz
) is
  'Issues exact provider retry authority for at most 23 hours, then requires explicit offline reconciliation.';
comment on function loyalty_private.reconcile_managed_billing_session_v1(
  uuid, text, text, text, text, text, uuid, timestamptz
) is
  'Deployment-owner-only reconciliation for an expired ambiguous provider operation; intentionally not granted to application or worker roles.';
