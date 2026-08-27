-- M14-S05A deterministic local delinquency and manual-contract policy.
-- Commercial restriction applies only through the separate growth decision;
-- it never changes loyalty-value, checkout, or general entitlement behavior.

create table loyalty_private.managed_billing_delinquency_policy_versions (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  past_due_grace_days smallint not null
    check (past_due_grace_days between 0 and 60),
  actor_reference text not null,
  approver_reference text not null,
  reason text not null,
  effective_from timestamptz not null,
  effective_until timestamptz,
  idempotency_key uuid not null unique,
  request_fingerprint bytea not null,
  created_at timestamptz not null default now(),
  check (
    actor_reference ~ '^[a-z][a-z0-9_-]{2,39}:[A-Za-z0-9._-]{3,160}$'
  ),
  check (
    approver_reference ~ '^[a-z][a-z0-9_-]{2,39}:[A-Za-z0-9._-]{3,160}$'
  ),
  check (actor_reference <> approver_reference),
  check (length(btrim(reason)) between 8 and 1000),
  check (octet_length(request_fingerprint) = 32),
  check (effective_until is null or effective_until > effective_from),
  unique (effective_from)
);

create index managed_billing_delinquency_policy_effective_idx
  on loyalty_private.managed_billing_delinquency_policy_versions (
    effective_from desc, id desc
  );

create table loyalty_private.managed_billing_manual_contract_versions (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null
    references loyalty.organizations(id) on delete restrict,
  decision text not null check (
    decision in ('allow_growth', 'defer_to_provider')
  ),
  actor_reference text not null,
  approver_reference text not null,
  reason text not null,
  effective_from timestamptz not null,
  effective_until timestamptz,
  idempotency_key uuid not null,
  request_fingerprint bytea not null,
  created_at timestamptz not null default now(),
  unique (organization_id, idempotency_key),
  unique (organization_id, effective_from),
  check (
    actor_reference ~ '^[a-z][a-z0-9_-]{2,39}:[A-Za-z0-9._-]{3,160}$'
  ),
  check (
    approver_reference ~ '^[a-z][a-z0-9_-]{2,39}:[A-Za-z0-9._-]{3,160}$'
  ),
  check (actor_reference <> approver_reference),
  check (length(btrim(reason)) between 8 and 1000),
  check (octet_length(request_fingerprint) = 32),
  check (effective_until is null or effective_until > effective_from),
  check (decision <> 'defer_to_provider' or effective_until is null)
);

create index managed_billing_manual_contract_effective_idx
  on loyalty_private.managed_billing_manual_contract_versions (
    organization_id, effective_from desc, id desc
  );

alter table loyalty_private.managed_billing_delinquency_policy_versions
  owner to loyalty_owner;
alter table loyalty_private.managed_billing_manual_contract_versions
  owner to loyalty_owner;

create trigger managed_billing_delinquency_policy_versions_immutable
before update or delete
on loyalty_private.managed_billing_delinquency_policy_versions
for each row execute function loyalty_private.reject_immutable_change();

create trigger managed_billing_manual_contract_versions_immutable
before update or delete
on loyalty_private.managed_billing_manual_contract_versions
for each row execute function loyalty_private.reject_immutable_change();

create or replace function loyalty_private.record_managed_billing_delinquency_policy_v1(
  target_past_due_grace_days integer,
  target_actor_reference text,
  target_approver_reference text,
  target_reason text,
  target_effective_from timestamptz,
  target_effective_until timestamptz,
  target_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_fingerprint bytea;
  existing loyalty_private.managed_billing_delinquency_policy_versions%rowtype;
  created_public_id uuid;
begin
  if target_past_due_grace_days is null
     or target_past_due_grace_days not between 0 and 60
     or target_actor_reference is null
     or target_approver_reference is null
     or target_actor_reference !~ '^[a-z][a-z0-9_-]{2,39}:[A-Za-z0-9._-]{3,160}$'
     or target_approver_reference !~ '^[a-z][a-z0-9_-]{2,39}:[A-Za-z0-9._-]{3,160}$'
     or target_actor_reference = target_approver_reference
     or target_reason is null
     or length(btrim(target_reason)) not between 8 and 1000
     or target_effective_from is null
     or (
       target_effective_until is not null
       and target_effective_until <= target_effective_from
     )
     or target_idempotency_key is null then
    raise exception using errcode = '22023', message = 'invalid managed billing delinquency policy request';
  end if;

  target_fingerprint := extensions.digest(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_array(
        target_past_due_grace_days,
        target_actor_reference,
        target_approver_reference,
        btrim(target_reason),
        target_effective_from,
        target_effective_until
      )::text,
      'utf8'
    ),
    'sha256'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'managed-billing-delinquency-policy:' || target_idempotency_key::text,
      0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('managed-billing-delinquency-policy', 0)
  );

  select policy.* into existing
  from loyalty_private.managed_billing_delinquency_policy_versions as policy
  where policy.idempotency_key = target_idempotency_key;

  if existing.id is not null then
    if existing.request_fingerprint = target_fingerprint then
      return existing.public_id;
    end if;
    raise exception using errcode = '23505', message = 'managed billing delinquency policy idempotency conflict';
  end if;

  select policy.* into existing
  from loyalty_private.managed_billing_delinquency_policy_versions as policy
  where policy.effective_from = target_effective_from;

  if existing.id is not null then
    if existing.request_fingerprint = target_fingerprint then
      return existing.public_id;
    end if;
    raise exception using errcode = '23505', message = 'managed billing delinquency policy effective-time conflict';
  end if;

  insert into loyalty_private.managed_billing_delinquency_policy_versions (
    past_due_grace_days, actor_reference, approver_reference, reason,
    effective_from, effective_until, idempotency_key, request_fingerprint
  ) values (
    target_past_due_grace_days, target_actor_reference,
    target_approver_reference, btrim(target_reason), target_effective_from,
    target_effective_until, target_idempotency_key, target_fingerprint
  )
  returning public_id into created_public_id;

  return created_public_id;
end;
$$;

create or replace function loyalty_private.record_managed_billing_manual_contract_v1(
  target_organization_public_id uuid,
  target_decision text,
  target_actor_reference text,
  target_approver_reference text,
  target_reason text,
  target_effective_from timestamptz,
  target_effective_until timestamptz,
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
  existing loyalty_private.managed_billing_manual_contract_versions%rowtype;
  created_public_id uuid;
begin
  select organization.id into target_organization_id
  from loyalty.organizations as organization
  where organization.public_id = target_organization_public_id;

  if target_effective_from is not null then
    select configuration.deployment_mode into target_deployment_mode
    from loyalty_private.deployment_configuration_versions as configuration
    where configuration.effective_from <= target_effective_from
    order by configuration.effective_from desc, configuration.id desc
    limit 1;
  end if;

  if target_organization_id is null
     or target_deployment_mode is distinct from 'managed'
     or target_decision is null
     or target_decision not in ('allow_growth', 'defer_to_provider')
     or target_actor_reference is null
     or target_approver_reference is null
     or target_actor_reference !~ '^[a-z][a-z0-9_-]{2,39}:[A-Za-z0-9._-]{3,160}$'
     or target_approver_reference !~ '^[a-z][a-z0-9_-]{2,39}:[A-Za-z0-9._-]{3,160}$'
     or target_actor_reference = target_approver_reference
     or target_reason is null
     or length(btrim(target_reason)) not between 8 and 1000
     or target_effective_from is null
     or (
       target_effective_until is not null
       and target_effective_until <= target_effective_from
     )
     or (
       target_decision = 'defer_to_provider'
       and target_effective_until is not null
     )
     or target_idempotency_key is null then
    raise exception using errcode = '22023', message = 'invalid managed billing manual contract request';
  end if;

  target_fingerprint := extensions.digest(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_array(
        target_organization_public_id,
        target_decision,
        target_actor_reference,
        target_approver_reference,
        btrim(target_reason),
        target_effective_from,
        target_effective_until
      )::text,
      'utf8'
    ),
    'sha256'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      target_organization_id::text || ':managed-billing-contract:' ||
        target_idempotency_key::text,
      0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      target_organization_id::text || ':managed-billing-contract',
      0
    )
  );

  select contract.* into existing
  from loyalty_private.managed_billing_manual_contract_versions as contract
  where contract.organization_id = target_organization_id
    and contract.idempotency_key = target_idempotency_key;

  if existing.id is not null then
    if existing.request_fingerprint = target_fingerprint then
      return existing.public_id;
    end if;
    raise exception using errcode = '23505', message = 'managed billing manual contract idempotency conflict';
  end if;

  select contract.* into existing
  from loyalty_private.managed_billing_manual_contract_versions as contract
  where contract.organization_id = target_organization_id
    and contract.effective_from = target_effective_from;

  if existing.id is not null then
    if existing.request_fingerprint = target_fingerprint then
      return existing.public_id;
    end if;
    raise exception using errcode = '23505', message = 'managed billing manual contract effective-time conflict';
  end if;

  insert into loyalty_private.managed_billing_manual_contract_versions (
    organization_id, decision, actor_reference, approver_reference, reason,
    effective_from, effective_until, idempotency_key, request_fingerprint
  ) values (
    target_organization_id, target_decision, target_actor_reference,
    target_approver_reference, btrim(target_reason), target_effective_from,
    target_effective_until, target_idempotency_key, target_fingerprint
  )
  returning public_id into created_public_id;

  return created_public_id;
end;
$$;

create or replace function loyalty_private.resolve_managed_billing_commercial_policy_v1(
  target_organization_id bigint,
  target_at timestamptz default now()
)
returns table (
  deployment_mode text,
  commercial_state text,
  billing_available boolean,
  provider_linked boolean,
  subscription_present boolean,
  growth_configuration_allowed boolean,
  restriction text,
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz,
  grace_ends_at timestamptz,
  state_updated_at timestamptz,
  state_source text,
  restriction_reason text,
  contract_ends_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_deployment_mode text;
  account loyalty_private.managed_billing_account_versions%rowtype;
  revision loyalty_private.managed_billing_state_revisions%rowtype;
  manual_contract loyalty_private.managed_billing_manual_contract_versions%rowtype;
  delinquency_policy loyalty_private.managed_billing_delinquency_policy_versions%rowtype;
  effective_state text;
  effective_source text;
  effective_reason text;
  effective_grace_until timestamptz;
  effective_state_updated_at timestamptz;
  effective_contract_ends_at timestamptz;
  growth_allowed boolean;
begin
  if target_at is null then
    raise exception using errcode = '22023', message = 'billing evaluation time is required';
  end if;
  if not exists (
    select 1 from loyalty.organizations as organization
    where organization.id = target_organization_id
  ) then
    raise exception using errcode = '22023', message = 'unknown organization';
  end if;

  select configuration.deployment_mode into strict target_deployment_mode
  from loyalty_private.deployment_configuration_versions as configuration
  where configuration.effective_from <= target_at
  order by configuration.effective_from desc, configuration.id desc
  limit 1;

  if target_deployment_mode = 'self_hosted' then
    return query select
      'self_hosted'::text, 'self_hosted'::text, false,
      false, false, true, 'none'::text,
      null::timestamptz, null::timestamptz, null::timestamptz,
      null::timestamptz, 'self_hosted'::text, 'none'::text,
      null::timestamptz;
    return;
  end if;

  select candidate.* into account
  from loyalty_private.managed_billing_account_versions as candidate
  where candidate.organization_id = target_organization_id
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
    where candidate.organization_id = target_organization_id
      and candidate.billing_account_version_id = account.id
      and candidate.provider_event_created_at <= target_at
    order by candidate.provider_event_created_at desc,
      candidate.provider_event_id desc
    limit 1;
  end if;

  -- Select the latest decision version, then evaluate its interval. This
  -- prevents an older indefinite contract from resurfacing after a newer
  -- bounded contract expires.
  select candidate.* into manual_contract
  from loyalty_private.managed_billing_manual_contract_versions as candidate
  where candidate.organization_id = target_organization_id
    and candidate.effective_from <= target_at
  order by candidate.effective_from desc, candidate.id desc
  limit 1;

  if manual_contract.id is not null
     and manual_contract.decision = 'allow_growth'
     and (
       manual_contract.effective_until is null
       or manual_contract.effective_until > target_at
     ) then
    effective_state := 'contract_managed';
    effective_source := 'manual_contract';
    effective_reason := 'none';
    effective_state_updated_at := manual_contract.effective_from;
    effective_contract_ends_at := manual_contract.effective_until;
  elsif revision.id is null then
    effective_state := 'unconfigured';
    effective_source := 'unconfigured';
    effective_reason := 'billing_unconfigured';
  elsif revision.provider_state = 'past_due' then
    effective_grace_until := revision.grace_until;
    if effective_grace_until is null then
      -- As with contracts, an expired newer policy means no policy rather
      -- than silently resurrecting an older version.
      select candidate.* into delinquency_policy
      from loyalty_private.managed_billing_delinquency_policy_versions as candidate
      where candidate.effective_from <= revision.provider_event_created_at
        and candidate.created_at <= revision.provider_event_created_at
      order by candidate.effective_from desc, candidate.id desc
      limit 1;

      if delinquency_policy.id is not null
         and (
           delinquency_policy.effective_until is null
           or delinquency_policy.effective_until > revision.provider_event_created_at
         ) then
        effective_grace_until := revision.provider_event_created_at
          + pg_catalog.make_interval(days => delinquency_policy.past_due_grace_days);
      end if;
    end if;

    effective_source := 'provider';
    effective_state_updated_at := revision.provider_event_created_at;
    if effective_grace_until is null then
      effective_state := 'past_due';
      effective_reason := 'payment_past_due';
    elsif effective_grace_until > target_at then
      effective_state := 'grace';
      effective_reason := 'payment_past_due';
    else
      effective_state := 'suspended';
      effective_reason := 'grace_expired';
    end if;
  else
    effective_state := revision.provider_state;
    effective_source := 'provider';
    effective_state_updated_at := revision.provider_event_created_at;
    effective_reason := case revision.provider_state
      when 'suspended' then 'provider_suspended'
      when 'cancelled' then 'provider_cancelled'
      else 'none'
    end;
  end if;

  growth_allowed := effective_state in (
    'trialing', 'active', 'grace', 'contract_managed'
  );

  return query select
    'managed'::text,
    effective_state,
    true,
    account.id is not null,
    revision.id is not null,
    growth_allowed,
    case when growth_allowed then 'none' else 'new_growth_only' end,
    case when effective_source = 'provider' then revision.trial_end else null end,
    case when effective_source = 'provider' then revision.current_period_end else null end,
    effective_grace_until,
    effective_state_updated_at,
    effective_source,
    effective_reason,
    effective_contract_ends_at;
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
  resolved record;
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

  select * into strict resolved
  from loyalty_private.resolve_managed_billing_commercial_policy_v1(
    target_organization.id,
    target_at
  );

  billing_summary := pg_catalog.jsonb_build_object(
    'schemaVersion', '1',
    'organizationId', target_organization.public_id,
    'deploymentMode', resolved.deployment_mode,
    'commercialState', resolved.commercial_state,
    'billingAvailable', resolved.billing_available,
    'providerLinked', resolved.provider_linked,
    'subscriptionPresent', resolved.subscription_present,
    'growthConfigurationAllowed', resolved.growth_configuration_allowed,
    'restriction', resolved.restriction,
    'trialEndsAt', resolved.trial_ends_at,
    'currentPeriodEndsAt', resolved.current_period_ends_at,
    'graceEndsAt', resolved.grace_ends_at,
    'evaluatedAt', target_at,
    'stateUpdatedAt', resolved.state_updated_at,
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

create or replace function loyalty.get_my_billing_summary_v2(
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
  resolved record;
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

  select * into strict resolved
  from loyalty_private.resolve_managed_billing_commercial_policy_v1(
    target_organization.id,
    target_at
  );

  billing_summary := pg_catalog.jsonb_build_object(
    'schemaVersion', '2',
    'organizationId', target_organization.public_id,
    'deploymentMode', resolved.deployment_mode,
    'commercialState', resolved.commercial_state,
    'billingAvailable', resolved.billing_available,
    'providerLinked', resolved.provider_linked,
    'subscriptionPresent', resolved.subscription_present,
    'growthConfigurationAllowed', resolved.growth_configuration_allowed,
    'restriction', resolved.restriction,
    'trialEndsAt', resolved.trial_ends_at,
    'currentPeriodEndsAt', resolved.current_period_ends_at,
    'graceEndsAt', resolved.grace_ends_at,
    'evaluatedAt', target_at,
    'stateUpdatedAt', resolved.state_updated_at,
    'protectedAccess', pg_catalog.jsonb_build_object(
      'balanceRead', true,
      'refunds', true,
      'reconciliation', true,
      'checkoutIndependence', true,
      'exports', true,
      'promisedRewardRedemption', true
    ),
    'stateSource', resolved.state_source,
    'restrictionReason', resolved.restriction_reason,
    'contractEndsAt', resolved.contract_ends_at
  );
  return next;
end;
$$;

create or replace function loyalty_private.authorize_managed_growth_configuration_v1(
  target_organization_id bigint,
  target_capability_key text,
  stable_subject text,
  target_at timestamptz default now()
)
returns table (
  allowed boolean,
  entitlement_enabled boolean,
  protected_value_path boolean,
  deployment_mode text,
  commercial_state text,
  reason_code text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  entitlement record;
  commercial record;
begin
  select * into strict entitlement
  from loyalty_private.resolve_organization_entitlement(
    target_organization_id,
    target_capability_key,
    stable_subject,
    target_at
  );
  select * into strict commercial
  from loyalty_private.resolve_managed_billing_commercial_policy_v1(
    target_organization_id,
    target_at
  );

  entitlement_enabled := entitlement.enabled;
  protected_value_path := entitlement.protected_value_path;
  deployment_mode := commercial.deployment_mode;
  commercial_state := commercial.commercial_state;
  allowed := entitlement.enabled and (
    entitlement.protected_value_path
    or commercial.growth_configuration_allowed
  );
  reason_code := case
    when not entitlement.enabled then 'entitlement_disabled'
    when entitlement.protected_value_path then 'protected_value_path'
    when not commercial.growth_configuration_allowed then 'commercial_restricted'
    else 'allowed'
  end;
  return next;
end;
$$;

alter function loyalty_private.record_managed_billing_delinquency_policy_v1(
  integer, text, text, text, timestamptz, timestamptz, uuid
) owner to loyalty_owner;
alter function loyalty_private.record_managed_billing_manual_contract_v1(
  uuid, text, text, text, text, timestamptz, timestamptz, uuid
) owner to loyalty_owner;
alter function loyalty_private.resolve_managed_billing_commercial_policy_v1(
  bigint, timestamptz
) owner to loyalty_owner;
alter function loyalty_private.authorize_managed_growth_configuration_v1(
  bigint, text, text, timestamptz
) owner to loyalty_owner;
alter function loyalty.get_my_billing_summary_v2(uuid, timestamptz)
  owner to loyalty_owner;

alter table loyalty_private.managed_billing_delinquency_policy_versions
  enable row level security;
alter table loyalty_private.managed_billing_manual_contract_versions
  enable row level security;

revoke all on loyalty_private.managed_billing_delinquency_policy_versions,
  loyalty_private.managed_billing_manual_contract_versions
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

revoke all on function loyalty_private.record_managed_billing_delinquency_policy_v1(
  integer, text, text, text, timestamptz, timestamptz, uuid
), loyalty_private.record_managed_billing_manual_contract_v1(
  uuid, text, text, text, text, timestamptz, timestamptz, uuid
), loyalty_private.resolve_managed_billing_commercial_policy_v1(
  bigint, timestamptz
), loyalty_private.authorize_managed_growth_configuration_v1(
  bigint, text, text, timestamptz
), loyalty.get_my_billing_summary_v2(uuid, timestamptz)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

grant execute on function loyalty.get_my_billing_summary_v2(uuid, timestamptz)
  to authenticated;

comment on table loyalty_private.managed_billing_delinquency_policy_versions is
  'Private append-only approved delinquency policy. No production policy is seeded; past-due grace binds to provider occurrence time.';
comment on table loyalty_private.managed_billing_manual_contract_versions is
  'Private append-only organization contract decisions with separate actor and approver references and no payment or contact data.';
comment on function loyalty_private.resolve_managed_billing_commercial_policy_v1(bigint, timestamptz) is
  'Deterministically resolves self-hosted, manual-contract, and provider evidence without granting tenant authority or changing loyalty value.';
comment on function loyalty_private.authorize_managed_growth_configuration_v1(bigint, text, text, timestamptz) is
  'Combines ordinary entitlement and managed commercial state only for reviewed new-growth/configuration command boundaries; protected value paths remain allowed.';
comment on function loyalty.get_my_billing_summary_v2(uuid, timestamptz) is
  'Returns one minimized live-member commercial summary with source, reason, and contract term; private provider and approval evidence is excluded.';
