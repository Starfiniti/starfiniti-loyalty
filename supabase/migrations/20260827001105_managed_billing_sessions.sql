-- M14-S03 database-reserved Stripe Checkout and Customer Portal sessions.
-- Provider configuration stays private, browser inputs are public selectors,
-- and webhook evidence remains the only subscription-state authority.

create table loyalty_private.managed_billing_provider_configuration_versions (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  provider text not null check (provider = 'stripe'),
  live_mode boolean not null,
  enabled boolean not null,
  effective_from timestamptz not null,
  actor_reference text not null check (length(btrim(actor_reference)) between 3 and 200),
  reason text not null check (length(btrim(reason)) between 8 and 1000),
  idempotency_key uuid not null unique,
  request_fingerprint bytea not null check (octet_length(request_fingerprint) = 32),
  created_at timestamptz not null default now()
);

create index managed_billing_provider_configuration_current_idx
  on loyalty_private.managed_billing_provider_configuration_versions (
    effective_from desc, id desc
  );

create table loyalty_private.managed_billing_plan_versions (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid(),
  version integer not null check (version > 0),
  plan_key text not null check (plan_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  display_name text not null check (length(btrim(display_name)) between 2 and 80),
  description text not null check (length(btrim(description)) between 8 and 240),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  unit_amount_minor bigint not null check (unit_amount_minor between 1 and 1000000000),
  billing_interval text not null check (billing_interval in ('month', 'year')),
  interval_count integer not null check (interval_count between 1 and 12),
  trial_days integer not null default 0 check (trial_days between 0 and 90),
  provider text not null check (provider = 'stripe'),
  provider_price_id text not null check (provider_price_id ~ '^price_[A-Za-z0-9]{8,120}$'),
  live_mode boolean not null,
  enabled boolean not null,
  effective_from timestamptz not null,
  actor_reference text not null check (length(btrim(actor_reference)) between 3 and 200),
  reason text not null check (length(btrim(reason)) between 8 and 1000),
  idempotency_key uuid not null unique,
  request_fingerprint bytea not null check (octet_length(request_fingerprint) = 32),
  created_at timestamptz not null default now(),
  unique (public_id, version),
  unique (plan_key, live_mode, version),
  unique (provider, live_mode, provider_price_id)
);

create index managed_billing_plan_versions_current_idx
  on loyalty_private.managed_billing_plan_versions (
    live_mode, plan_key, effective_from desc, version desc
  );

create table loyalty_private.managed_billing_session_operations (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  organization_id bigint not null references loyalty.organizations(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in ('checkout', 'portal')),
  plan_version_id bigint references loyalty_private.managed_billing_plan_versions(id) on delete restrict,
  billing_account_version_id bigint references loyalty_private.managed_billing_account_versions(id) on delete restrict,
  provider_customer_id text check (provider_customer_id is null or provider_customer_id ~ '^cus_[A-Za-z0-9]{8,120}$'),
  provider_session_id text check (
    provider_session_id is null
    or provider_session_id ~ '^cs_(test|live)_[A-Za-z0-9]{8,180}$'
    or provider_session_id ~ '^bps_[A-Za-z0-9]{8,180}$'
  ),
  live_mode boolean not null,
  state text not null check (state in ('customer_required', 'ready', 'ambiguous', 'rejected', 'held', 'completed')),
  customer_idempotency_key text not null check (length(customer_idempotency_key) between 16 and 200),
  session_idempotency_key text not null check (length(session_idempotency_key) between 16 and 200),
  request_fingerprint bytea not null check (octet_length(request_fingerprint) = 32),
  last_detail_code text check (last_detail_code is null or last_detail_code ~ '^[a-z][a-z0-9_]{2,79}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check ((action = 'checkout' and plan_version_id is not null) or (action = 'portal' and plan_version_id is null)),
  check ((state = 'completed' and provider_session_id is not null and completed_at is not null)
    or (state <> 'completed' and completed_at is null))
);

create index managed_billing_session_operations_tenant_idx
  on loyalty_private.managed_billing_session_operations (
    organization_id, created_at desc, id desc
  );

create unique index managed_billing_session_one_customer_provision_idx
  on loyalty_private.managed_billing_session_operations (organization_id)
  where provider_customer_id is null
    and state in ('customer_required', 'ambiguous');

create unique index managed_billing_account_versions_one_open_idx
  on loyalty_private.managed_billing_account_versions (organization_id)
  where effective_until is null;

create table loyalty_private.managed_billing_session_attempts (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null references loyalty.organizations(id) on delete restrict,
  operation_id bigint not null references loyalty_private.managed_billing_session_operations(id) on delete restrict,
  attempt_id uuid not null,
  stage text not null check (stage in ('customer', 'session')),
  outcome text not null check (outcome in ('succeeded', 'rejected', 'ambiguous', 'held')),
  provider_resource_id text,
  detail_code text not null check (detail_code ~ '^[a-z][a-z0-9_]{2,79}$'),
  request_fingerprint bytea not null check (octet_length(request_fingerprint) = 32),
  created_at timestamptz not null default now(),
  unique (operation_id, attempt_id),
  check (
    provider_resource_id is null
    or provider_resource_id ~ '^cus_[A-Za-z0-9]{8,120}$'
    or provider_resource_id ~ '^cs_(test|live)_[A-Za-z0-9]{8,180}$'
    or provider_resource_id ~ '^bps_[A-Za-z0-9]{8,180}$'
  ),
  check ((outcome = 'succeeded' and provider_resource_id is not null)
    or outcome <> 'succeeded')
);

alter table loyalty_private.managed_billing_provider_configuration_versions owner to loyalty_owner;
alter table loyalty_private.managed_billing_plan_versions owner to loyalty_owner;
alter table loyalty_private.managed_billing_session_operations owner to loyalty_owner;
alter table loyalty_private.managed_billing_session_attempts owner to loyalty_owner;

create trigger managed_billing_provider_configuration_versions_immutable
before update or delete on loyalty_private.managed_billing_provider_configuration_versions
for each row execute function loyalty_private.reject_immutable_change();

create trigger managed_billing_plan_versions_immutable
before update or delete on loyalty_private.managed_billing_plan_versions
for each row execute function loyalty_private.reject_immutable_change();

create or replace function loyalty_private.record_managed_billing_provider_configuration_v1(
  target_live_mode boolean,
  target_enabled boolean,
  target_effective_from timestamptz,
  target_actor_reference text,
  target_reason text,
  target_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_fingerprint bytea;
  existing loyalty_private.managed_billing_provider_configuration_versions%rowtype;
  created_public_id uuid;
begin
  if target_live_mode is null or target_enabled is null or target_effective_from is null
     or target_actor_reference is null or length(btrim(target_actor_reference)) not between 3 and 200
     or target_reason is null or length(btrim(target_reason)) not between 8 and 1000
     or target_idempotency_key is null then
    raise exception using errcode = '22023', message = 'invalid managed billing provider configuration';
  end if;
  target_fingerprint := extensions.digest(pg_catalog.convert_to(pg_catalog.jsonb_build_array(
    target_live_mode, target_enabled, target_effective_from,
    btrim(target_actor_reference), btrim(target_reason)
  )::text, 'utf8'), 'sha256');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'managed-billing-provider:' || target_idempotency_key::text, 0));
  select configuration.* into existing
  from loyalty_private.managed_billing_provider_configuration_versions as configuration
  where configuration.idempotency_key = target_idempotency_key;
  if existing.id is not null then
    if existing.request_fingerprint = target_fingerprint then return existing.public_id; end if;
    raise exception using errcode = '23505', message = 'managed billing provider configuration idempotency conflict';
  end if;
  insert into loyalty_private.managed_billing_provider_configuration_versions (
    provider, live_mode, enabled, effective_from, actor_reference, reason,
    idempotency_key, request_fingerprint
  ) values (
    'stripe', target_live_mode, target_enabled, target_effective_from,
    btrim(target_actor_reference), btrim(target_reason), target_idempotency_key,
    target_fingerprint
  ) returning public_id into created_public_id;
  return created_public_id;
end;
$$;

create trigger managed_billing_session_attempts_immutable
before update or delete on loyalty_private.managed_billing_session_attempts
for each row execute function loyalty_private.reject_immutable_change();

create or replace function loyalty_private.record_managed_billing_plan_v1(
  target_public_id uuid,
  target_version integer,
  target_plan_key text,
  target_display_name text,
  target_description text,
  target_currency text,
  target_unit_amount_minor bigint,
  target_billing_interval text,
  target_interval_count integer,
  target_trial_days integer,
  target_provider_price_id text,
  target_live_mode boolean,
  target_enabled boolean,
  target_effective_from timestamptz,
  target_actor_reference text,
  target_reason text,
  target_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_fingerprint bytea;
  existing loyalty_private.managed_billing_plan_versions%rowtype;
  previous_version integer;
begin
  if target_public_id is null or target_version is null or target_version <= 0
     or target_plan_key is null or target_plan_key !~ '^[a-z][a-z0-9_]{1,63}$'
     or target_display_name is null or length(btrim(target_display_name)) not between 2 and 80
     or target_description is null or length(btrim(target_description)) not between 8 and 240
     or target_currency is null or target_currency !~ '^[A-Z]{3}$'
     or target_unit_amount_minor is null or target_unit_amount_minor not between 1 and 1000000000
     or target_billing_interval not in ('month', 'year')
     or target_interval_count is null or target_interval_count not between 1 and 12
     or target_trial_days is null or target_trial_days not between 0 and 90
     or target_provider_price_id is null or target_provider_price_id !~ '^price_[A-Za-z0-9]{8,120}$'
     or target_live_mode is null or target_enabled is null or target_effective_from is null
     or target_actor_reference is null or length(btrim(target_actor_reference)) not between 3 and 200
     or target_reason is null or length(btrim(target_reason)) not between 8 and 1000
     or target_idempotency_key is null then
    raise exception using errcode = '22023', message = 'invalid managed billing plan request';
  end if;

  target_fingerprint := extensions.digest(pg_catalog.convert_to(pg_catalog.jsonb_build_array(
    target_public_id, target_version, target_plan_key, btrim(target_display_name),
    btrim(target_description), target_currency, target_unit_amount_minor,
    target_billing_interval, target_interval_count, target_trial_days,
    target_provider_price_id, target_live_mode, target_enabled,
    target_effective_from, btrim(target_actor_reference), btrim(target_reason)
  )::text, 'utf8'), 'sha256');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'managed-billing-plan:' || target_idempotency_key::text, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'managed-billing-plan-public:' || target_public_id::text, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'managed-billing-plan-key:' || target_live_mode::text || ':' || target_plan_key, 0));
  select plan.* into existing from loyalty_private.managed_billing_plan_versions as plan
  where plan.idempotency_key = target_idempotency_key;
  if existing.id is not null then
    if existing.request_fingerprint = target_fingerprint then return existing.public_id; end if;
    raise exception using errcode = '23505', message = 'managed billing plan idempotency conflict';
  end if;
  if exists (
    select 1 from loyalty_private.managed_billing_plan_versions as plan
    where plan.public_id = target_public_id
      and (plan.plan_key <> target_plan_key or plan.live_mode <> target_live_mode)
  ) or exists (
    select 1 from loyalty_private.managed_billing_plan_versions as plan
    where plan.plan_key = target_plan_key and plan.live_mode = target_live_mode
      and plan.public_id <> target_public_id
  ) then
    raise exception using errcode = '23505', message = 'managed billing plan identity conflict';
  end if;
  select max(plan.version) into previous_version
  from loyalty_private.managed_billing_plan_versions as plan
  where plan.public_id = target_public_id;
  if target_version <> coalesce(previous_version + 1, 1) then
    raise exception using errcode = '22023', message = 'managed billing plan version sequence invalid';
  end if;

  insert into loyalty_private.managed_billing_plan_versions (
    public_id, version, plan_key, display_name, description, currency,
    unit_amount_minor, billing_interval, interval_count, trial_days,
    provider, provider_price_id, live_mode, enabled, effective_from,
    actor_reference, reason, idempotency_key, request_fingerprint
  ) values (
    target_public_id, target_version, target_plan_key, btrim(target_display_name),
    btrim(target_description), target_currency, target_unit_amount_minor,
    target_billing_interval, target_interval_count, target_trial_days,
    'stripe', target_provider_price_id, target_live_mode, target_enabled,
    target_effective_from, btrim(target_actor_reference), btrim(target_reason),
    target_idempotency_key, target_fingerprint
  );
  return target_public_id;
end;
$$;

create or replace function loyalty_private.list_managed_billing_plans_v1(
  target_actor_user_id uuid,
  target_organization_public_id uuid,
  checked_at timestamptz default now()
)
returns table (
  plan_public_id uuid, plan_key text, display_name text, description text,
  currency text, unit_amount_minor bigint, billing_interval text,
  interval_count integer, trial_days integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_mode text;
  target_organization_id bigint;
  target_provider loyalty_private.managed_billing_provider_configuration_versions%rowtype;
  entitlement record;
begin
  select configuration.deployment_mode into strict target_mode
  from loyalty_private.deployment_configuration_versions as configuration
  where configuration.effective_from <= checked_at
  order by configuration.effective_from desc, configuration.id desc limit 1;
  if target_mode <> 'managed' then return; end if;

  select organization.id into target_organization_id
  from loyalty.organizations as organization
  join loyalty.organization_memberships as membership
    on membership.organization_id = organization.id
  where organization.public_id = target_organization_public_id
    and organization.status = 'active' and organization.offboarded_at is null
    and membership.user_id = target_actor_user_id
    and membership.role = 'owner' and membership.revoked_at is null;
  if target_organization_id is null then return; end if;

  select decision.* into entitlement
  from loyalty_private.resolve_organization_entitlement(
    target_organization_id, 'managed.billing', target_actor_user_id::text, checked_at
  ) as decision;
  if entitlement.deployment_mode <> 'managed' or not entitlement.enabled then return; end if;

  select configuration.* into target_provider
  from loyalty_private.managed_billing_provider_configuration_versions as configuration
  where configuration.effective_from <= checked_at
  order by configuration.effective_from desc, configuration.id desc limit 1;
  if target_provider.id is null or not target_provider.enabled then return; end if;

  return query
  select current_plan.public_id, current_plan.plan_key,
    current_plan.display_name, current_plan.description,
    current_plan.currency, current_plan.unit_amount_minor,
    current_plan.billing_interval, current_plan.interval_count,
    current_plan.trial_days
  from (
    select distinct on (plan.public_id) plan.*
    from loyalty_private.managed_billing_plan_versions as plan
    where plan.live_mode = target_provider.live_mode and plan.effective_from <= checked_at
    order by plan.public_id, plan.effective_from desc, plan.version desc
  ) as current_plan
  where current_plan.enabled
  order by current_plan.unit_amount_minor, current_plan.plan_key;
end;
$$;

create or replace function loyalty_private.reserve_managed_billing_session_v1(
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
  target_organization_id bigint;
  target_mode text;
  target_plan loyalty_private.managed_billing_plan_versions%rowtype;
  target_account loyalty_private.managed_billing_account_versions%rowtype;
  target_provider loyalty_private.managed_billing_provider_configuration_versions%rowtype;
  existing loyalty_private.managed_billing_session_operations%rowtype;
  target_fingerprint bytea;
  entitlement record;
begin
  select configuration.deployment_mode into strict target_mode
  from loyalty_private.deployment_configuration_versions as configuration
  where configuration.effective_from <= checked_at
  order by configuration.effective_from desc, configuration.id desc limit 1;
  deployment_mode := target_mode;
  if target_mode <> 'managed' then
    operation_id := target_operation_id; operation_state := 'self_hosted';
    provider_customer_id := null; provider_price_id := null; live_mode := null;
    customer_idempotency_key := null; session_idempotency_key := null;
    return next; return;
  end if;

  if target_actor_user_id is null or target_organization_public_id is null
     or target_action not in ('checkout', 'portal') or target_operation_id is null
     or (target_action = 'checkout' and target_plan_public_id is null)
     or (target_action = 'portal' and target_plan_public_id is not null) then
    raise exception using errcode = '22023', message = 'invalid managed billing session request';
  end if;

  select organization.id into target_organization_id
  from loyalty.organizations as organization
  join loyalty.organization_memberships as membership on membership.organization_id = organization.id
  where organization.public_id = target_organization_public_id
    and organization.status = 'active' and organization.offboarded_at is null
    and membership.user_id = target_actor_user_id
    and membership.role = 'owner' and membership.revoked_at is null;
  if target_organization_id is null then
    raise exception using errcode = '42501', message = 'managed billing owner authority required';
  end if;

  select decision.* into entitlement from loyalty_private.resolve_organization_entitlement(
    target_organization_id, 'managed.billing', target_operation_id::text, checked_at
  ) as decision;
  if entitlement.deployment_mode <> 'managed' or not entitlement.enabled then
    raise exception using errcode = '42501', message = 'managed billing session unavailable';
  end if;

  select configuration.* into target_provider
  from loyalty_private.managed_billing_provider_configuration_versions as configuration
  where configuration.effective_from <= checked_at
  order by configuration.effective_from desc, configuration.id desc limit 1;
  if target_provider.id is null or not target_provider.enabled then
    raise exception using errcode = '42501', message = 'managed billing provider unavailable';
  end if;

  target_fingerprint := extensions.digest(pg_catalog.convert_to(pg_catalog.jsonb_build_array(
    target_actor_user_id, target_organization_public_id, target_action,
    target_plan_public_id
  )::text, 'utf8'), 'sha256');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'managed-billing-session:' || target_operation_id::text, 0));

  select operation.* into existing
  from loyalty_private.managed_billing_session_operations as operation
  where operation.public_id = target_operation_id;
  if existing.id is not null then
    if existing.organization_id <> target_organization_id
       or existing.request_fingerprint <> target_fingerprint then
      raise exception using errcode = '23505', message = 'managed billing session idempotency conflict';
    end if;
    if existing.live_mode <> target_provider.live_mode then
      raise exception using errcode = '42501', message = 'managed billing provider unavailable';
    end if;
    select plan.* into target_plan
    from loyalty_private.managed_billing_plan_versions as plan
    where plan.id = existing.plan_version_id;
  else
    select account.* into target_account
    from loyalty_private.managed_billing_account_versions as account
    where account.organization_id = target_organization_id
      and account.effective_from <= checked_at
      and (account.effective_until is null or account.effective_until > checked_at)
    order by account.effective_from desc, account.id desc limit 1;

    if target_account.id is null then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
        'managed-billing-customer:' || target_organization_id::text, 0));
      select account.* into target_account
      from loyalty_private.managed_billing_account_versions as account
      where account.organization_id = target_organization_id
        and account.effective_from <= checked_at
        and (account.effective_until is null or account.effective_until > checked_at)
      order by account.effective_from desc, account.id desc limit 1;
      if target_account.id is null and exists (
        select 1 from loyalty_private.managed_billing_session_operations as pending
        where pending.organization_id = target_organization_id
          and pending.provider_customer_id is null
          and pending.state in ('customer_required', 'ambiguous')
      ) then
        raise exception using errcode = '55000',
          message = 'managed billing customer provisioning in progress';
      end if;
    end if;

    if target_action = 'checkout' then
      select candidate.* into target_plan from (
        select distinct on (plan.public_id) plan.*
        from loyalty_private.managed_billing_plan_versions as plan
        where plan.public_id = target_plan_public_id and plan.effective_from <= checked_at
        order by plan.public_id, plan.effective_from desc, plan.version desc
      ) as candidate
      where candidate.enabled and candidate.live_mode = target_provider.live_mode;
      if target_plan.id is null then
        raise exception using errcode = '22023', message = 'managed billing plan unavailable';
      end if;
    elsif target_account.id is null or target_account.live_mode <> target_provider.live_mode then
      raise exception using errcode = '22023', message = 'managed billing account unavailable';
    end if;

    insert into loyalty_private.managed_billing_session_operations (
      public_id, organization_id, actor_user_id, action, plan_version_id,
      billing_account_version_id, provider_customer_id, live_mode, state,
      customer_idempotency_key, session_idempotency_key, request_fingerprint
    ) values (
      target_operation_id, target_organization_id, target_actor_user_id,
      target_action, target_plan.id, target_account.id,
      target_account.provider_customer_id,
      target_provider.live_mode,
      case when target_account.id is null then 'customer_required' else 'ready' end,
      'm14:customer:' || target_operation_id::text,
      'm14:' || target_action || ':' || target_operation_id::text,
      target_fingerprint
    ) returning * into existing;
  end if;

  operation_id := existing.public_id; operation_state := existing.state;
  provider_customer_id := existing.provider_customer_id;
  provider_price_id := case when existing.action = 'checkout' then target_plan.provider_price_id else null end;
  live_mode := existing.live_mode;
  customer_idempotency_key := existing.customer_idempotency_key;
  session_idempotency_key := existing.session_idempotency_key;
  return next;
end;
$$;

create or replace function loyalty_private.authorize_managed_billing_session_attempt_v1(
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
  provider_configuration loyalty_private.managed_billing_provider_configuration_versions%rowtype;
  entitlement record;
begin
  select candidate.* into operation
  from loyalty_private.managed_billing_session_operations as candidate
  join loyalty.organizations as organization on organization.id = candidate.organization_id
  join loyalty.organization_memberships as membership on membership.organization_id = candidate.organization_id
  where candidate.public_id = target_operation_id
    and candidate.actor_user_id = target_actor_user_id
    and organization.status = 'active' and organization.offboarded_at is null
    and membership.user_id = target_actor_user_id and membership.role = 'owner'
    and membership.revoked_at is null
  for update of candidate;
  if operation.id is null or target_stage not in ('customer', 'session') then
    raise exception using errcode = '42501', message = 'managed billing operation unavailable';
  end if;
  select decision.* into entitlement from loyalty_private.resolve_organization_entitlement(
    operation.organization_id, 'managed.billing', operation.public_id::text, checked_at
  ) as decision;
  if entitlement.deployment_mode <> 'managed' or not entitlement.enabled then
    update loyalty_private.managed_billing_session_operations
    set state = 'held', last_detail_code = 'billing_session_disabled', updated_at = checked_at
    where id = operation.id;
    return;
  end if;
  select configuration.* into provider_configuration
  from loyalty_private.managed_billing_provider_configuration_versions as configuration
  where configuration.effective_from <= checked_at
  order by configuration.effective_from desc, configuration.id desc limit 1;
  if provider_configuration.id is null or not provider_configuration.enabled
     or provider_configuration.live_mode <> operation.live_mode then
    update loyalty_private.managed_billing_session_operations
    set state = 'held', last_detail_code = 'billing_provider_disabled', updated_at = checked_at
    where id = operation.id;
    return;
  end if;
  if (target_stage = 'customer' and (operation.state not in ('customer_required', 'ambiguous') or operation.provider_customer_id is not null))
     or (target_stage = 'session' and (operation.state not in ('ready', 'ambiguous') or operation.provider_customer_id is null)) then
    raise exception using errcode = '55000', message = 'managed billing operation stage unavailable';
  end if;
  action := operation.action;
  provider_customer_id := operation.provider_customer_id;
  select plan.provider_price_id into provider_price_id
  from loyalty_private.managed_billing_plan_versions as plan where plan.id = operation.plan_version_id;
  live_mode := operation.live_mode;
  provider_idempotency_key := case when target_stage = 'customer'
    then operation.customer_idempotency_key else operation.session_idempotency_key end;
  return next;
end;
$$;

create or replace function loyalty_private.record_managed_billing_session_attempt_v1(
  target_actor_user_id uuid,
  target_operation_id uuid,
  target_attempt_id uuid,
  target_stage text,
  target_outcome text,
  target_provider_resource_id text,
  target_detail_code text,
  checked_at timestamptz default now()
)
returns table (operation_state text, billing_account_public_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  operation loyalty_private.managed_billing_session_operations%rowtype;
  existing loyalty_private.managed_billing_session_attempts%rowtype;
  target_fingerprint bytea;
  organization_public_id uuid;
  account_public_id uuid;
  entitlement record;
  provider_succeeded boolean;
  actor_authorized boolean;
  provider_configuration loyalty_private.managed_billing_provider_configuration_versions%rowtype;
begin
  if target_attempt_id is null or target_stage not in ('customer', 'session')
     or target_outcome not in ('succeeded', 'rejected', 'ambiguous')
     or target_detail_code is null or target_detail_code !~ '^[a-z][a-z0-9_]{2,79}$'
     or (target_outcome = 'succeeded' and target_provider_resource_id is null) then
    raise exception using errcode = '22023', message = 'invalid managed billing attempt result';
  end if;
  select candidate.* into operation
  from loyalty_private.managed_billing_session_operations as candidate
  where candidate.public_id = target_operation_id
    and candidate.actor_user_id = target_actor_user_id
  for update of candidate;
  if operation.id is null then
    raise exception using errcode = '42501', message = 'managed billing operation unavailable';
  end if;
  if (target_stage = 'customer' and target_outcome = 'succeeded'
      and target_provider_resource_id !~ '^cus_[A-Za-z0-9]{8,120}$')
     or (target_stage = 'session' and target_outcome = 'succeeded' and (
       (operation.action = 'checkout' and target_provider_resource_id !~ '^cs_(test|live)_[A-Za-z0-9]{8,180}$')
       or (operation.action = 'portal' and target_provider_resource_id !~ '^bps_[A-Za-z0-9]{8,180}$')
     )) then
    raise exception using errcode = '22023', message = 'invalid managed billing provider resource';
  end if;
  if target_outcome <> 'succeeded' and target_provider_resource_id is not null then
    raise exception using errcode = '22023', message = 'invalid managed billing provider resource';
  end if;

  target_fingerprint := extensions.digest(pg_catalog.convert_to(pg_catalog.jsonb_build_array(
    target_actor_user_id, target_operation_id, target_stage, target_outcome,
    target_provider_resource_id, target_detail_code
  )::text, 'utf8'), 'sha256');
  select attempt.* into existing from loyalty_private.managed_billing_session_attempts as attempt
  where attempt.operation_id = operation.id and attempt.attempt_id = target_attempt_id;
  if existing.id is not null then
    if existing.request_fingerprint <> target_fingerprint then
      raise exception using errcode = '23505', message = 'managed billing attempt idempotency conflict';
    end if;
    operation_state := operation.state;
    select account.public_id into billing_account_public_id
    from loyalty_private.managed_billing_account_versions as account
    where account.id = operation.billing_account_version_id;
    return next; return;
  end if;

  if (target_stage = 'customer' and (
        operation.state not in ('customer_required', 'ambiguous')
        or operation.provider_customer_id is not null
      ))
     or (target_stage = 'session' and (
       operation.state not in ('ready', 'ambiguous')
       or operation.provider_customer_id is null
     )) then
    raise exception using errcode = '55000', message = 'managed billing operation stage unavailable';
  end if;

  select decision.* into entitlement from loyalty_private.resolve_organization_entitlement(
    operation.organization_id, 'managed.billing', operation.public_id::text, checked_at
  ) as decision;
  provider_succeeded := target_outcome = 'succeeded';
  select exists (
    select 1 from loyalty.organizations as organization
    join loyalty.organization_memberships as membership
      on membership.organization_id = organization.id
    where organization.id = operation.organization_id
      and organization.status = 'active' and organization.offboarded_at is null
      and membership.user_id = target_actor_user_id
      and membership.role = 'owner' and membership.revoked_at is null
  ) into actor_authorized;
  select configuration.* into provider_configuration
  from loyalty_private.managed_billing_provider_configuration_versions as configuration
  where configuration.effective_from <= checked_at
  order by configuration.effective_from desc, configuration.id desc limit 1;
  if not actor_authorized then
    target_outcome := 'held'; target_detail_code := 'billing_actor_revoked';
  elsif entitlement.deployment_mode <> 'managed' or not entitlement.enabled then
    target_outcome := 'held'; target_detail_code := 'billing_session_disabled';
  elsif provider_configuration.id is null or not provider_configuration.enabled
     or provider_configuration.live_mode <> operation.live_mode then
    target_outcome := 'held'; target_detail_code := 'billing_provider_disabled';
  end if;

  insert into loyalty_private.managed_billing_session_attempts (
    organization_id, operation_id, attempt_id, stage, outcome,
    provider_resource_id, detail_code, request_fingerprint
  ) values (
    operation.organization_id, operation.id, target_attempt_id, target_stage,
    target_outcome, target_provider_resource_id, target_detail_code,
    target_fingerprint
  );

  if target_outcome = 'held' and not provider_succeeded then
    update loyalty_private.managed_billing_session_operations
    set state = 'held', last_detail_code = target_detail_code, updated_at = checked_at
    where id = operation.id;
  elsif target_outcome = 'ambiguous' then
    update loyalty_private.managed_billing_session_operations
    set state = 'ambiguous', last_detail_code = target_detail_code, updated_at = checked_at
    where id = operation.id;
  elsif target_outcome = 'rejected' then
    update loyalty_private.managed_billing_session_operations
    set state = 'rejected', last_detail_code = target_detail_code, updated_at = checked_at
    where id = operation.id;
  elsif target_stage = 'customer' and provider_succeeded then
    select organization.public_id into strict organization_public_id
    from loyalty.organizations as organization where organization.id = operation.organization_id;
    select loyalty_private.record_managed_billing_account_v1(
      organization_public_id, target_provider_resource_id, operation.live_mode,
      'user:' || target_actor_user_id::text,
      'Bind customer created for managed billing session', checked_at,
      operation.public_id
    ) into strict account_public_id;
    update loyalty_private.managed_billing_session_operations as target
    set billing_account_version_id = account.id,
      provider_customer_id = target_provider_resource_id,
      state = case when target_outcome = 'held' then 'held' else 'ready' end,
      last_detail_code = case when target_outcome = 'held'
        then target_detail_code else null end,
      updated_at = checked_at
    from loyalty_private.managed_billing_account_versions as account
    where target.id = operation.id and account.public_id = account_public_id;
  elsif provider_succeeded then
    update loyalty_private.managed_billing_session_operations
    set provider_session_id = target_provider_resource_id,
      state = case when target_outcome = 'held' then 'held' else 'completed' end,
      last_detail_code = case when target_outcome = 'held'
        then target_detail_code else null end,
      updated_at = checked_at,
      completed_at = case when target_outcome = 'held' then null else checked_at end
    where id = operation.id;
  end if;

  select target.state into strict operation_state
  from loyalty_private.managed_billing_session_operations as target where target.id = operation.id;
  select account.public_id into billing_account_public_id
  from loyalty_private.managed_billing_account_versions as account
  join loyalty_private.managed_billing_session_operations as target
    on target.billing_account_version_id = account.id where target.id = operation.id;
  return next;
end;
$$;

alter function loyalty_private.record_managed_billing_provider_configuration_v1(
  boolean, boolean, timestamptz, text, text, uuid
) owner to loyalty_owner;
alter function loyalty_private.record_managed_billing_plan_v1(
  uuid, integer, text, text, text, text, bigint, text, integer, integer,
  text, boolean, boolean, timestamptz, text, text, uuid
) owner to loyalty_owner;
alter function loyalty_private.list_managed_billing_plans_v1(uuid, uuid, timestamptz) owner to loyalty_owner;
alter function loyalty_private.reserve_managed_billing_session_v1(uuid, uuid, text, uuid, uuid, timestamptz) owner to loyalty_owner;
alter function loyalty_private.authorize_managed_billing_session_attempt_v1(uuid, uuid, text, timestamptz) owner to loyalty_owner;
alter function loyalty_private.record_managed_billing_session_attempt_v1(uuid, uuid, uuid, text, text, text, text, timestamptz) owner to loyalty_owner;

alter table loyalty_private.managed_billing_provider_configuration_versions enable row level security;
alter table loyalty_private.managed_billing_plan_versions enable row level security;
alter table loyalty_private.managed_billing_session_operations enable row level security;
alter table loyalty_private.managed_billing_session_attempts enable row level security;

revoke all on loyalty_private.managed_billing_provider_configuration_versions,
  loyalty_private.managed_billing_plan_versions,
  loyalty_private.managed_billing_session_operations,
  loyalty_private.managed_billing_session_attempts
from public, anon, authenticated, loyalty_runtime, loyalty_worker;

revoke all on function loyalty_private.record_managed_billing_provider_configuration_v1(
  boolean, boolean, timestamptz, text, text, uuid
), loyalty_private.record_managed_billing_plan_v1(
  uuid, integer, text, text, text, text, bigint, text, integer, integer,
  text, boolean, boolean, timestamptz, text, text, uuid
), loyalty_private.list_managed_billing_plans_v1(uuid, uuid, timestamptz),
  loyalty_private.reserve_managed_billing_session_v1(uuid, uuid, text, uuid, uuid, timestamptz),
  loyalty_private.authorize_managed_billing_session_attempt_v1(uuid, uuid, text, timestamptz),
  loyalty_private.record_managed_billing_session_attempt_v1(uuid, uuid, uuid, text, text, text, text, timestamptz)
from public, anon, authenticated, loyalty_runtime, loyalty_worker;

grant execute on function
  loyalty_private.list_managed_billing_plans_v1(uuid, uuid, timestamptz),
  loyalty_private.reserve_managed_billing_session_v1(uuid, uuid, text, uuid, uuid, timestamptz),
  loyalty_private.authorize_managed_billing_session_attempt_v1(uuid, uuid, text, timestamptz),
  loyalty_private.record_managed_billing_session_attempt_v1(uuid, uuid, uuid, text, text, text, text, timestamptz)
to loyalty_runtime;

comment on table loyalty_private.managed_billing_provider_configuration_versions is
  'Append-only operator-controlled Stripe mode gate; no API key or provider secret is stored.';
comment on table loyalty_private.managed_billing_plan_versions is
  'Append-only externally configured Stripe Price catalogue; provider identifiers are never browser-visible and no production price is seeded in source.';
comment on table loyalty_private.managed_billing_session_operations is
  'Private owner-scoped orchestration fence for Stripe Checkout and Portal; it is not subscription or entitlement authority.';
comment on table loyalty_private.managed_billing_session_attempts is
  'Immutable minimized provider-attempt evidence without redirect URLs, customer contact, payment data, bodies, or secrets.';
comment on function loyalty_private.reserve_managed_billing_session_v1(uuid, uuid, text, uuid, uuid, timestamptz) is
  'Reserves one owner-scoped operation before provider access; self-hosted returns before tenant, plan, account, or provider evidence is read.';
comment on function loyalty_private.authorize_managed_billing_session_attempt_v1(uuid, uuid, text, timestamptz) is
  'Rechecks live owner membership and managed entitlement immediately before a fixed-origin provider request.';
comment on function loyalty_private.record_managed_billing_session_attempt_v1(uuid, uuid, uuid, text, text, text, text, timestamptz) is
  'Appends a minimized idempotent provider outcome; return-page navigation never grants subscription state or loyalty authority.';
