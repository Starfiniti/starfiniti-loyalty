-- M14-S01 private managed-billing mirror and minimized merchant projection.
-- This migration performs no provider call and leaves the deployment in its
-- existing mode. Self-hosted reads return before touching provider evidence.

create table loyalty_private.managed_billing_account_versions (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null
    references loyalty.organizations(id) on delete restrict,
  provider text not null check (provider = 'stripe'),
  provider_customer_id text not null,
  live_mode boolean not null,
  actor_reference text not null,
  reason text not null,
  effective_from timestamptz not null,
  effective_until timestamptz,
  idempotency_key uuid not null,
  request_fingerprint bytea not null,
  created_at timestamptz not null default now(),
  unique (organization_id, idempotency_key),
  unique (provider, live_mode, provider_customer_id),
  check (provider_customer_id ~ '^cus_[A-Za-z0-9]{8,120}$'),
  check (length(btrim(actor_reference)) between 3 and 200),
  check (length(btrim(reason)) between 8 and 1000),
  check (octet_length(request_fingerprint) = 32),
  check (effective_until is null or effective_until > effective_from)
);

create index managed_billing_account_versions_current_idx
  on loyalty_private.managed_billing_account_versions (
    organization_id, effective_from desc, id desc
  );

create table loyalty_private.managed_billing_state_revisions (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null
    references loyalty.organizations(id) on delete restrict,
  billing_account_version_id bigint not null
    references loyalty_private.managed_billing_account_versions(id)
    on delete restrict,
  provider_subscription_id text not null,
  provider_event_id text not null,
  provider_state text not null check (
    provider_state in (
      'trialing', 'active', 'past_due', 'suspended', 'cancelled'
    )
  ),
  provider_event_created_at timestamptz not null,
  current_period_end timestamptz,
  trial_end timestamptz,
  grace_until timestamptz,
  actor_reference text not null,
  reason text not null,
  idempotency_key uuid not null,
  request_fingerprint bytea not null,
  created_at timestamptz not null default now(),
  unique (organization_id, idempotency_key),
  unique (billing_account_version_id, provider_event_id),
  check (provider_subscription_id ~ '^sub_[A-Za-z0-9]{8,120}$'),
  check (provider_event_id ~ '^evt_[A-Za-z0-9]{8,120}$'),
  check (length(btrim(actor_reference)) between 3 and 200),
  check (length(btrim(reason)) between 8 and 1000),
  check (octet_length(request_fingerprint) = 32),
  check (
    current_period_end is null
    or current_period_end > provider_event_created_at
  ),
  check (
    (provider_state = 'trialing'
      and trial_end is not null
      and trial_end > provider_event_created_at)
    or (provider_state <> 'trialing' and trial_end is null)
  ),
  check (
    grace_until is null
    or (
      provider_state = 'past_due'
      and grace_until > provider_event_created_at
    )
  )
);

create index managed_billing_state_revisions_current_idx
  on loyalty_private.managed_billing_state_revisions (
    organization_id, provider_event_created_at desc, provider_event_id desc
  );

alter table loyalty_private.managed_billing_account_versions
  owner to loyalty_owner;
alter table loyalty_private.managed_billing_state_revisions
  owner to loyalty_owner;

create trigger managed_billing_account_versions_immutable
before update or delete on loyalty_private.managed_billing_account_versions
for each row execute function loyalty_private.reject_immutable_change();

create trigger managed_billing_state_revisions_immutable
before update or delete on loyalty_private.managed_billing_state_revisions
for each row execute function loyalty_private.reject_immutable_change();

create or replace function loyalty_private.record_managed_billing_account_v1(
  target_organization_public_id uuid,
  target_provider_customer_id text,
  target_live_mode boolean,
  target_actor_reference text,
  target_reason text,
  target_effective_from timestamptz,
  target_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id bigint;
  target_deployment_mode text;
  target_fingerprint bytea;
  existing loyalty_private.managed_billing_account_versions%rowtype;
  created_public_id uuid;
begin
  select organization.id into target_organization_id
  from loyalty.organizations as organization
  where organization.public_id = target_organization_public_id;

  select configuration.deployment_mode into target_deployment_mode
  from loyalty_private.deployment_configuration_versions as configuration
  where configuration.effective_from <= target_effective_from
  order by configuration.effective_from desc, configuration.id desc
  limit 1;

  if target_organization_id is null
     or target_deployment_mode is distinct from 'managed'
     or target_provider_customer_id is null
     or target_provider_customer_id !~ '^cus_[A-Za-z0-9]{8,120}$'
     or target_live_mode is null
     or target_actor_reference is null
     or target_reason is null
     or target_effective_from is null
     or length(btrim(target_actor_reference)) not between 3 and 200
     or length(btrim(target_reason)) not between 8 and 1000
     or target_idempotency_key is null then
    raise exception using errcode = '22023', message = 'invalid managed billing account request';
  end if;

  target_fingerprint := extensions.digest(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_array(
        target_organization_public_id,
        target_provider_customer_id,
        target_live_mode,
        btrim(target_actor_reference),
        btrim(target_reason),
        target_effective_from
      )::text,
      'utf8'
    ),
    'sha256'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      target_organization_id::text || ':billing-account:' || target_idempotency_key::text,
      0
    )
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'stripe:' || target_live_mode::text || ':billing-customer:' ||
        target_provider_customer_id,
      0
    )
  );

  select account.* into existing
  from loyalty_private.managed_billing_account_versions as account
  where account.organization_id = target_organization_id
    and account.idempotency_key = target_idempotency_key;

  if existing.id is not null then
    if existing.request_fingerprint = target_fingerprint then
      return existing.public_id;
    end if;
    raise exception using errcode = '23505', message = 'managed billing account idempotency conflict';
  end if;

  select account.* into existing
  from loyalty_private.managed_billing_account_versions as account
  where account.provider = 'stripe'
    and account.live_mode = target_live_mode
    and account.provider_customer_id = target_provider_customer_id;

  if existing.id is not null then
    if existing.request_fingerprint = target_fingerprint then
      return existing.public_id;
    end if;
    raise exception using errcode = '23505', message = 'managed billing provider account conflict';
  end if;

  insert into loyalty_private.managed_billing_account_versions (
    organization_id, provider, provider_customer_id, live_mode,
    actor_reference, reason, effective_from, idempotency_key,
    request_fingerprint
  ) values (
    target_organization_id, 'stripe', target_provider_customer_id,
    target_live_mode, btrim(target_actor_reference), btrim(target_reason),
    target_effective_from, target_idempotency_key, target_fingerprint
  )
  returning public_id into created_public_id;

  return created_public_id;
end;
$$;

create or replace function loyalty_private.record_managed_billing_state_v1(
  target_organization_public_id uuid,
  target_billing_account_public_id uuid,
  target_provider_subscription_id text,
  target_provider_event_id text,
  target_provider_state text,
  target_provider_event_created_at timestamptz,
  target_current_period_end timestamptz,
  target_trial_end timestamptz,
  target_grace_until timestamptz,
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
  target_organization_id bigint;
  target_account_id bigint;
  target_deployment_mode text;
  target_fingerprint bytea;
  existing loyalty_private.managed_billing_state_revisions%rowtype;
  created_public_id uuid;
begin
  select organization.id into target_organization_id
  from loyalty.organizations as organization
  where organization.public_id = target_organization_public_id;

  select account.id into target_account_id
  from loyalty_private.managed_billing_account_versions as account
  where account.public_id = target_billing_account_public_id
    and account.organization_id = target_organization_id
    and account.effective_from <= target_provider_event_created_at
    and (
      account.effective_until is null
      or account.effective_until > target_provider_event_created_at
    );

  select configuration.deployment_mode into target_deployment_mode
  from loyalty_private.deployment_configuration_versions as configuration
  where configuration.effective_from <= target_provider_event_created_at
  order by configuration.effective_from desc, configuration.id desc
  limit 1;

  if target_organization_id is null
     or target_account_id is null
     or target_deployment_mode is distinct from 'managed'
     or target_provider_subscription_id is null
     or target_provider_subscription_id !~ '^sub_[A-Za-z0-9]{8,120}$'
     or target_provider_event_id is null
     or target_provider_event_id !~ '^evt_[A-Za-z0-9]{8,120}$'
     or target_provider_state is null
     or target_provider_state not in (
       'trialing', 'active', 'past_due', 'suspended', 'cancelled'
     )
     or target_provider_event_created_at is null
     or target_actor_reference is null
     or target_reason is null
     or (
       target_current_period_end is not null
       and target_current_period_end <= target_provider_event_created_at
     )
     or (
       target_provider_state = 'trialing'
       and (
         target_trial_end is null
         or target_trial_end <= target_provider_event_created_at
       )
     )
     or (target_provider_state <> 'trialing' and target_trial_end is not null)
     or (
       target_grace_until is not null
       and (
         target_provider_state <> 'past_due'
         or target_grace_until <= target_provider_event_created_at
       )
     )
     or length(btrim(target_actor_reference)) not between 3 and 200
     or length(btrim(target_reason)) not between 8 and 1000
     or target_idempotency_key is null then
    raise exception using errcode = '22023', message = 'invalid managed billing state request';
  end if;

  target_fingerprint := extensions.digest(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_array(
        target_organization_public_id,
        target_billing_account_public_id,
        target_provider_subscription_id,
        target_provider_event_id,
        target_provider_state,
        target_provider_event_created_at,
        target_current_period_end,
        target_trial_end,
        target_grace_until,
        btrim(target_actor_reference),
        btrim(target_reason)
      )::text,
      'utf8'
    ),
    'sha256'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      target_organization_id::text || ':billing-state:' || target_idempotency_key::text,
      0
    )
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      target_account_id::text || ':billing-event:' || target_provider_event_id,
      0
    )
  );

  select revision.* into existing
  from loyalty_private.managed_billing_state_revisions as revision
  where revision.organization_id = target_organization_id
    and revision.idempotency_key = target_idempotency_key;

  if existing.id is not null then
    if existing.request_fingerprint = target_fingerprint then
      return existing.public_id;
    end if;
    raise exception using errcode = '23505', message = 'managed billing state idempotency conflict';
  end if;

  select revision.* into existing
  from loyalty_private.managed_billing_state_revisions as revision
  where revision.billing_account_version_id = target_account_id
    and revision.provider_event_id = target_provider_event_id;

  if existing.id is not null then
    if existing.request_fingerprint = target_fingerprint then
      return existing.public_id;
    end if;
    raise exception using errcode = '23505', message = 'managed billing provider event conflict';
  end if;

  insert into loyalty_private.managed_billing_state_revisions (
    organization_id, billing_account_version_id,
    provider_subscription_id, provider_event_id, provider_state,
    provider_event_created_at, current_period_end, trial_end, grace_until,
    actor_reference, reason, idempotency_key, request_fingerprint
  ) values (
    target_organization_id, target_account_id,
    target_provider_subscription_id, target_provider_event_id,
    target_provider_state, target_provider_event_created_at,
    target_current_period_end, target_trial_end, target_grace_until,
    btrim(target_actor_reference), btrim(target_reason),
    target_idempotency_key, target_fingerprint
  )
  returning public_id into created_public_id;

  return created_public_id;
end;
$$;

create or replace function loyalty.get_my_billing_summary_v1(
  target_organization_public_id uuid,
  target_at timestamptz default now()
)
returns table (billing_summary jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_organization loyalty.organizations%rowtype;
  target_deployment_mode text;
  account loyalty_private.managed_billing_account_versions%rowtype;
  revision loyalty_private.managed_billing_state_revisions%rowtype;
  effective_state text;
  growth_allowed boolean;
begin
  if target_at is null then
    raise exception using errcode = '22023', message = 'billing evaluation time is required';
  end if;

  select organization.* into target_organization
  from loyalty.organizations as organization
  where organization.public_id = target_organization_public_id;

  if target_organization.id is null
     or not loyalty_private.is_organization_member(target_organization.id) then
    return;
  end if;

  select configuration.deployment_mode into strict target_deployment_mode
  from loyalty_private.deployment_configuration_versions as configuration
  where configuration.effective_from <= target_at
  order by configuration.effective_from desc, configuration.id desc
  limit 1;

  if target_deployment_mode = 'self_hosted' then
    billing_summary := pg_catalog.jsonb_build_object(
      'schemaVersion', '1',
      'organizationId', target_organization.public_id,
      'deploymentMode', 'self_hosted',
      'commercialState', 'self_hosted',
      'billingAvailable', false,
      'providerLinked', false,
      'subscriptionPresent', false,
      'growthConfigurationAllowed', true,
      'restriction', 'none',
      'trialEndsAt', null,
      'currentPeriodEndsAt', null,
      'graceEndsAt', null,
      'evaluatedAt', target_at,
      'stateUpdatedAt', null,
      'protectedAccess', pg_catalog.jsonb_build_object(
        'balanceRead', true,
        'refunds', true,
        'reconciliation', true,
        'checkoutIndependence', true,
        'exports', true,
        'promisedRewardRedemption', true
      )
    );
    return next;
    return;
  end if;

  select candidate.* into account
  from loyalty_private.managed_billing_account_versions as candidate
  where candidate.organization_id = target_organization.id
    and candidate.effective_from <= target_at
    and (
      candidate.effective_until is null
      or candidate.effective_until > target_at
    )
  order by candidate.effective_from desc, candidate.id desc
  limit 1;

  if account.id is not null then
    select candidate.* into revision
    from loyalty_private.managed_billing_state_revisions as candidate
    where candidate.organization_id = target_organization.id
      and candidate.billing_account_version_id = account.id
      and candidate.provider_event_created_at <= target_at
    order by candidate.provider_event_created_at desc,
      candidate.provider_event_id desc
    limit 1;
  end if;

  if revision.id is null then
    effective_state := 'unconfigured';
  elsif revision.provider_state = 'past_due'
        and revision.grace_until is not null
        and revision.grace_until > target_at then
    effective_state := 'grace';
  elsif revision.provider_state = 'past_due'
        and revision.grace_until is not null
        and revision.grace_until <= target_at then
    effective_state := 'suspended';
  else
    effective_state := revision.provider_state;
  end if;

  growth_allowed := effective_state in ('trialing', 'active', 'grace');

  billing_summary := pg_catalog.jsonb_build_object(
    'schemaVersion', '1',
    'organizationId', target_organization.public_id,
    'deploymentMode', 'managed',
    'commercialState', effective_state,
    'billingAvailable', true,
    'providerLinked', account.id is not null,
    'subscriptionPresent', revision.id is not null,
    'growthConfigurationAllowed', growth_allowed,
    'restriction', case when growth_allowed then 'none' else 'new_growth_only' end,
    'trialEndsAt', revision.trial_end,
    'currentPeriodEndsAt', revision.current_period_end,
    'graceEndsAt', revision.grace_until,
    'evaluatedAt', target_at,
    'stateUpdatedAt', revision.provider_event_created_at,
    'protectedAccess', pg_catalog.jsonb_build_object(
      'balanceRead', true,
      'refunds', true,
      'reconciliation', true,
      'checkoutIndependence', true,
      'exports', true,
      'promisedRewardRedemption', true
    )
  );
  return next;
end;
$$;

alter function loyalty_private.record_managed_billing_account_v1(
  uuid, text, boolean, text, text, timestamptz, uuid
) owner to loyalty_owner;
alter function loyalty_private.record_managed_billing_state_v1(
  uuid, uuid, text, text, text, timestamptz, timestamptz, timestamptz,
  timestamptz, text, text, uuid
) owner to loyalty_owner;
alter function loyalty.get_my_billing_summary_v1(uuid, timestamptz)
  owner to loyalty_owner;

alter table loyalty_private.managed_billing_account_versions
  enable row level security;
alter table loyalty_private.managed_billing_state_revisions
  enable row level security;

revoke all on loyalty_private.managed_billing_account_versions,
  loyalty_private.managed_billing_state_revisions
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

revoke all on function loyalty_private.record_managed_billing_account_v1(
  uuid, text, boolean, text, text, timestamptz, uuid
), loyalty_private.record_managed_billing_state_v1(
  uuid, uuid, text, text, text, timestamptz, timestamptz, timestamptz,
  timestamptz, text, text, uuid
), loyalty.get_my_billing_summary_v1(uuid, timestamptz)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

grant execute on function loyalty.get_my_billing_summary_v1(uuid, timestamptz)
  to authenticated;

comment on table loyalty_private.managed_billing_account_versions is
  'Private append-only managed Stripe customer references. No card, payment-method, invoice, contact, or webhook body data is stored.';
comment on table loyalty_private.managed_billing_state_revisions is
  'Private append-only normalized subscription evidence ordered by provider event creation time rather than delivery time.';
comment on function loyalty.get_my_billing_summary_v1(uuid, timestamptz) is
  'Returns one minimized live-member billing summary; self-hosted mode returns before provider evidence is read and all protected loyalty paths stay available.';
