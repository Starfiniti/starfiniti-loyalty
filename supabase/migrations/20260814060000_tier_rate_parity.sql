-- M05 fail-closed parity between displayed tier rates and executable benefits.

alter function loyalty_private.validate_programme_definition_v2(jsonb)
  rename to validate_programme_definition_v2_pre_tier_rate_parity;

create or replace function loyalty_private.validate_tier_rate_parity_v2(
  target_configuration jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  enabled_base_count integer;
  base_rate numeric;
begin
  if coalesce(target_configuration ->> 'version', '') <> '2'
    or not (target_configuration ? 'tierPolicy') then
    return;
  end if;

  select count(*), min((rule.value -> 'effect' ->> 'pointsPerMajorUnit')::numeric)
    into enabled_base_count, base_rate
  from jsonb_array_elements(target_configuration -> 'earningRules') as rule(value)
  where (rule.value ->> 'enabled')::boolean
    and rule.value ->> 'source' = 'purchase'
    and rule.value -> 'effect' ->> 'kind' = 'base_rate';

  if enabled_base_count <> 1 or base_rate is null then
    raise exception using errcode = '22023',
      message = 'advanced tier rate parity requires one enabled purchase base rate';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(target_configuration -> 'tierPolicy' -> 'levels')
      with ordinality as level(value, ordinal)
    join lateral (
      select tier.value
      from jsonb_array_elements(target_configuration -> 'tiers') as tier(value)
      where tier.value ->> 'code' = level.value ->> 'tierCode'
      limit 1
    ) as tier on true
    where (tier.value ->> 'pointsPerMajorUnit')::numeric * 10000
      <> base_rate * (
        level.value -> 'benefits' ->> 'earningMultiplierBasisPoints'
      )::numeric
  ) then
    raise exception using errcode = '23514',
      message = 'tier earning multiplier must exactly match displayed tier rate';
  end if;
end;
$$;

create or replace function loyalty_private.validate_programme_definition_v2(
  target_configuration jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform loyalty_private.validate_programme_definition_v2_pre_tier_rate_parity(
    target_configuration
  );
  if target_configuration ? 'tierPolicy' then
    perform loyalty_private.validate_tier_rate_parity_v2(target_configuration);
  end if;
end;
$$;

create or replace function loyalty_private.enforce_advanced_tier_contract()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  entitlement_enabled boolean;
begin
  if coalesce(new.configuration ->> 'version', '') <> '2'
    or not (new.configuration ? 'tierPolicy') then
    return new;
  end if;
  perform loyalty_private.validate_tier_policy_v2(new.configuration);
  perform loyalty_private.validate_tier_rate_parity_v2(new.configuration);
  select decision.enabled into strict entitlement_enabled
  from loyalty_private.resolve_organization_entitlement(
    new.organization_id,
    'vip.advanced',
    'programme:' || new.programme_id::text,
    now()
  ) as decision;
  if not entitlement_enabled then
    raise exception using errcode = '42501',
      message = 'advanced VIP is not enabled for this organization';
  end if;
  return new;
end;
$$;

alter function loyalty_private.validate_tier_rate_parity_v2(jsonb)
  owner to loyalty_owner;
alter function loyalty_private.validate_programme_definition_v2_pre_tier_rate_parity(jsonb)
  owner to loyalty_owner;
alter function loyalty_private.validate_programme_definition_v2(jsonb)
  owner to loyalty_owner;
alter function loyalty_private.enforce_advanced_tier_contract()
  owner to loyalty_owner;

revoke all on function
  loyalty_private.validate_tier_rate_parity_v2(jsonb),
  loyalty_private.validate_programme_definition_v2_pre_tier_rate_parity(jsonb),
  loyalty_private.validate_programme_definition_v2(jsonb),
  loyalty_private.enforce_advanced_tier_contract()
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

comment on function loyalty_private.validate_tier_rate_parity_v2(jsonb) is
  'Rejects advanced tiers whose displayed points rate differs from the exact executable base-rate multiplier.';
