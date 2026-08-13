-- M03 immutable ProgrammeDefinitionV2 earning rules and publication guard.

create table loyalty.programme_earning_rules (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  programme_group_id bigint not null,
  programme_version_id bigint not null,
  code text not null,
  name text not null,
  ordinal smallint not null check (ordinal > 0),
  source text not null check (source in (
    'purchase', 'account_created', 'birthday', 'verified_product_review',
    'referral', 'custom_activity'
  )),
  enabled boolean not null,
  priority integer not null check (priority between -10000 and 10000),
  stackable boolean not null,
  effect_kind text not null check (effect_kind in ('base_rate', 'multiplier', 'fixed_bonus')),
  effect jsonb not null check (jsonb_typeof(effect) = 'object'),
  conditions jsonb not null check (jsonb_typeof(conditions) = 'object'),
  purchase_exclusions jsonb check (
    purchase_exclusions is null or jsonb_typeof(purchase_exclusions) = 'object'
  ),
  cap jsonb not null check (jsonb_typeof(cap) = 'object'),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, programme_version_id, code),
  unique (organization_id, programme_version_id, ordinal),
  foreign key (organization_id, programme_group_id, programme_version_id)
    references loyalty.programme_versions(organization_id, programme_group_id, id) on delete restrict,
  check (code ~ '^[a-z][a-z0-9_-]{0,79}$'),
  check (length(btrim(name)) between 1 and 200),
  check ((source = 'purchase') = (purchase_exclusions is not null)),
  check (effect_kind not in ('base_rate', 'multiplier') or source = 'purchase'),
  check ((effect_kind = 'fixed_bonus') = stackable)
);

create index programme_earning_rules_evaluation_idx
  on loyalty.programme_earning_rules (
    organization_id, programme_version_id, source, enabled, priority desc, code
  );

alter table loyalty.programme_earning_rules owner to loyalty_owner;

create trigger programme_earning_rules_immutable
before update or delete on loyalty.programme_earning_rules
for each row execute function loyalty_private.reject_immutable_change();

create or replace function loyalty_private.validate_programme_definition_v2(
  target_configuration jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rule_value jsonb;
  condition_value jsonb;
  exclusion_value jsonb;
  cap_value jsonb;
  effect_value jsonb;
  rule_index integer := 0;
  enabled_base_count integer := 0;
  seen_codes text[] := array[]::text[];
  starts_at timestamptz;
  ends_at timestamptz;
  member_period text;
begin
  if target_configuration is null
    or jsonb_typeof(target_configuration) <> 'object'
    or target_configuration ->> 'version' <> '2'
    or not (target_configuration ?& array[
      'version', 'currencyCode', 'currencyMinorUnitDigits', 'pendingDays',
      'pointsExpireAfterDays', 'tiers', 'rewards', 'earningRules'
    ])
    or target_configuration - array[
      'version', 'currencyCode', 'currencyMinorUnitDigits', 'pendingDays',
      'pointsExpireAfterDays', 'tiers', 'rewards', 'earningRules'
    ] <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'invalid ProgrammeDefinitionV2 object';
  end if;
  if coalesce(target_configuration ->> 'currencyCode', '') !~ '^[A-Z]{3}$'
    or coalesce(target_configuration ->> 'currencyMinorUnitDigits', '') !~ '^[0-6]$'
    or coalesce(target_configuration ->> 'pendingDays', '') !~ '^(0|[1-9][0-9]{0,2})$'
    or (target_configuration ->> 'pendingDays')::integer > 365
    or coalesce(target_configuration ->> 'pointsExpireAfterDays', '') !~ '^[1-9][0-9]{0,3}$'
    or (target_configuration ->> 'pointsExpireAfterDays')::integer > 3650 then
    raise exception using errcode = '22023', message = 'invalid ProgrammeDefinitionV2 lifecycle or currency';
  end if;
  if jsonb_typeof(target_configuration -> 'earningRules') <> 'array'
    or jsonb_array_length(target_configuration -> 'earningRules') not between 1 and 200 then
    raise exception using errcode = '22023', message = 'ProgrammeDefinitionV2 requires 1 to 200 earning rules';
  end if;

  for rule_value in
    select value from jsonb_array_elements(target_configuration -> 'earningRules')
  loop
    rule_index := rule_index + 1;
    if jsonb_typeof(rule_value) <> 'object'
      or not (rule_value ?& array[
        'code', 'name', 'source', 'enabled', 'priority', 'stackable', 'effect',
        'conditions', 'purchaseExclusions', 'cap'
      ])
      or rule_value - array[
        'code', 'name', 'source', 'enabled', 'priority', 'stackable', 'effect',
        'conditions', 'purchaseExclusions', 'cap'
      ] <> '{}'::jsonb
      or coalesce(rule_value ->> 'code', '') !~ '^[a-z][a-z0-9_-]{0,79}$'
      or length(btrim(coalesce(rule_value ->> 'name', ''))) not between 1 and 200
      or coalesce(rule_value ->> 'source', '') not in (
        'purchase', 'account_created', 'birthday', 'verified_product_review',
        'referral', 'custom_activity'
      )
      or jsonb_typeof(rule_value -> 'enabled') <> 'boolean'
      or jsonb_typeof(rule_value -> 'stackable') <> 'boolean'
      or coalesce(rule_value ->> 'priority', '') !~ '^-?[0-9]+$'
      or (rule_value ->> 'priority')::integer not between -10000 and 10000 then
      raise exception using errcode = '22023', message = 'invalid ProgrammeDefinitionV2 earning rule identity';
    end if;
    if (rule_value ->> 'code') = any(seen_codes) then
      raise exception using errcode = '23514', message = 'duplicate ProgrammeDefinitionV2 earning rule code';
    end if;
    seen_codes := array_append(seen_codes, rule_value ->> 'code');

    condition_value := rule_value -> 'conditions';
    if jsonb_typeof(condition_value) <> 'object'
      or not (condition_value ?& array[
        'productIds', 'categoryIds', 'currencyCodes', 'markets', 'channels',
        'segmentCodes', 'tierCodes', 'startsAt', 'endsAt'
      ])
      or condition_value - array[
        'productIds', 'categoryIds', 'currencyCodes', 'markets', 'channels',
        'segmentCodes', 'tierCodes', 'startsAt', 'endsAt'
      ] <> '{}'::jsonb
      or exists (
        select 1
        from unnest(array[
          'productIds', 'categoryIds', 'currencyCodes', 'markets', 'channels',
          'segmentCodes', 'tierCodes'
        ]) as field(name)
        where jsonb_typeof(condition_value -> field.name) <> 'array'
          or jsonb_array_length(condition_value -> field.name) > 100
          or exists (
            select 1 from jsonb_array_elements(condition_value -> field.name) as item(value)
            where jsonb_typeof(item.value) <> 'string'
              or length(btrim(item.value #>> '{}')) not between 1 and 255
          )
      )
      or jsonb_typeof(condition_value -> 'startsAt') not in ('string', 'null')
      or jsonb_typeof(condition_value -> 'endsAt') not in ('string', 'null') then
      raise exception using errcode = '22023', message = 'invalid ProgrammeDefinitionV2 rule conditions';
    end if;
    if exists (
      select 1 from jsonb_array_elements_text(condition_value -> 'currencyCodes') as item(value)
      where item.value !~ '^[A-Z]{3}$'
    ) or exists (
      select 1 from jsonb_array_elements_text(condition_value -> 'markets') as item(value)
      where item.value !~ '^[A-Z]{2}$'
    ) or exists (
      select 1
      from jsonb_array_elements_text(
        (condition_value -> 'segmentCodes') || (condition_value -> 'tierCodes')
      ) as item(value)
      where item.value !~ '^[a-z][a-z0-9_-]{0,79}$'
    ) then
      raise exception using errcode = '22023', message = 'invalid ProgrammeDefinitionV2 condition selector';
    end if;
    starts_at := case when condition_value -> 'startsAt' = 'null'::jsonb
      then null else (condition_value ->> 'startsAt')::timestamptz end;
    ends_at := case when condition_value -> 'endsAt' = 'null'::jsonb
      then null else (condition_value ->> 'endsAt')::timestamptz end;
    if starts_at is not null and ends_at is not null and starts_at >= ends_at then
      raise exception using errcode = '22023', message = 'ProgrammeDefinitionV2 rule end must follow start';
    end if;

    cap_value := rule_value -> 'cap';
    if jsonb_typeof(cap_value) <> 'object'
      or not (cap_value ?& array[
        'perEventPoints', 'perMemberPoints', 'memberPeriod', 'rollingDays'
      ])
      or cap_value - array[
        'perEventPoints', 'perMemberPoints', 'memberPeriod', 'rollingDays'
      ] <> '{}'::jsonb
      or jsonb_typeof(cap_value -> 'perEventPoints') not in ('string', 'null')
      or jsonb_typeof(cap_value -> 'perMemberPoints') not in ('string', 'null')
      or jsonb_typeof(cap_value -> 'memberPeriod') not in ('string', 'null')
      or jsonb_typeof(cap_value -> 'rollingDays') not in ('number', 'null')
      or (cap_value -> 'perEventPoints' <> 'null'::jsonb
        and (cap_value ->> 'perEventPoints') !~ '^[1-9][0-9]*$')
      or (cap_value -> 'perMemberPoints' <> 'null'::jsonb
        and (cap_value ->> 'perMemberPoints') !~ '^[1-9][0-9]*$') then
      raise exception using errcode = '22023', message = 'invalid ProgrammeDefinitionV2 rule cap';
    end if;
    member_period := case when cap_value -> 'memberPeriod' = 'null'::jsonb
      then null else cap_value ->> 'memberPeriod' end;
    if (cap_value -> 'perMemberPoints' = 'null'::jsonb) <> (member_period is null)
      or (member_period is not null and member_period not in (
        'lifetime', 'calendar_day', 'calendar_month', 'calendar_year', 'rolling'
      ))
      or ((member_period = 'rolling') <> (cap_value -> 'rollingDays' <> 'null'::jsonb))
      or (cap_value -> 'rollingDays' <> 'null'::jsonb and (
        (cap_value ->> 'rollingDays') !~ '^[1-9][0-9]*$'
        or (cap_value ->> 'rollingDays')::integer > 3650
      )) then
      raise exception using errcode = '22023', message = 'invalid ProgrammeDefinitionV2 member cap period';
    end if;

    effect_value := rule_value -> 'effect';
    if jsonb_typeof(effect_value) <> 'object'
      or not (effect_value ? 'kind')
      or coalesce(effect_value ->> 'kind', '') not in ('base_rate', 'multiplier', 'fixed_bonus') then
      raise exception using errcode = '22023', message = 'invalid ProgrammeDefinitionV2 rule effect';
    end if;
    if effect_value ->> 'kind' = 'base_rate' then
      if not (effect_value ?& array['kind', 'pointsPerMajorUnit'])
        or effect_value - array['kind', 'pointsPerMajorUnit'] <> '{}'::jsonb
        or coalesce(effect_value ->> 'pointsPerMajorUnit', '') !~ '^[1-9][0-9]*$'
        or rule_value ->> 'source' <> 'purchase'
        or (rule_value ->> 'stackable')::boolean then
        raise exception using errcode = '22023', message = 'invalid ProgrammeDefinitionV2 base rate';
      end if;
      if (rule_value ->> 'enabled')::boolean then
        enabled_base_count := enabled_base_count + 1;
      end if;
    elsif effect_value ->> 'kind' = 'multiplier' then
      if not (effect_value ?& array['kind', 'multiplierBasisPoints'])
        or effect_value - array['kind', 'multiplierBasisPoints'] <> '{}'::jsonb
        or coalesce(effect_value ->> 'multiplierBasisPoints', '') !~ '^[0-9]+$'
        or (effect_value ->> 'multiplierBasisPoints')::integer not between 10001 and 100000
        or rule_value ->> 'source' <> 'purchase'
        or (rule_value ->> 'stackable')::boolean then
        raise exception using errcode = '22023', message = 'invalid ProgrammeDefinitionV2 multiplier';
      end if;
    else
      if not (effect_value ?& array['kind', 'points'])
        or effect_value - array['kind', 'points'] <> '{}'::jsonb
        or coalesce(effect_value ->> 'points', '') !~ '^[1-9][0-9]*$'
        or not (rule_value ->> 'stackable')::boolean then
        raise exception using errcode = '22023', message = 'invalid ProgrammeDefinitionV2 fixed bonus';
      end if;
    end if;

    exclusion_value := rule_value -> 'purchaseExclusions';
    if rule_value ->> 'source' = 'purchase' then
      if jsonb_typeof(exclusion_value) <> 'object'
        or not (exclusion_value ?& array[
          'productIds', 'categoryIds', 'shipping', 'tax', 'fees',
          'giftCardPayments', 'storeCreditPayments', 'discounts'
        ])
        or exclusion_value - array[
          'productIds', 'categoryIds', 'shipping', 'tax', 'fees',
          'giftCardPayments', 'storeCreditPayments', 'discounts'
        ] <> '{}'::jsonb
        or jsonb_typeof(exclusion_value -> 'productIds') <> 'array'
        or jsonb_typeof(exclusion_value -> 'categoryIds') <> 'array'
        or jsonb_array_length(exclusion_value -> 'productIds') > 100
        or jsonb_array_length(exclusion_value -> 'categoryIds') > 100
        or exists (
          select 1 from jsonb_array_elements(
            (exclusion_value -> 'productIds') || (exclusion_value -> 'categoryIds')
          ) as item(value)
          where jsonb_typeof(item.value) <> 'string'
            or length(btrim(item.value #>> '{}')) not between 1 and 255
        )
        or exists (
          select 1
          from unnest(array[
            'shipping', 'tax', 'fees', 'giftCardPayments',
            'storeCreditPayments', 'discounts'
          ]) as field(name)
          where jsonb_typeof(exclusion_value -> field.name) <> 'boolean'
        )
        or not (exclusion_value ->> 'storeCreditPayments')::boolean then
        raise exception using errcode = '22023', message = 'invalid ProgrammeDefinitionV2 purchase exclusions';
      end if;
    elsif exclusion_value <> 'null'::jsonb
      or jsonb_array_length(condition_value -> 'productIds') > 0
      or jsonb_array_length(condition_value -> 'categoryIds') > 0
      or jsonb_array_length(condition_value -> 'currencyCodes') > 0
      or jsonb_array_length(condition_value -> 'markets') > 0 then
      raise exception using errcode = '22023', message = 'non-purchase earning rules cannot use commerce conditions';
    end if;
  end loop;

  if enabled_base_count <> 1 then
    raise exception using errcode = '23514', message = 'ProgrammeDefinitionV2 requires exactly one enabled base rate';
  end if;
end;
$$;

create or replace function loyalty_private.enforce_programme_v2_entitlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  entitlement_enabled boolean;
  definition_version text := coalesce(new.configuration ->> 'version', '1');
begin
  if definition_version not in ('1', '2') then
    raise exception using errcode = '22023', message = 'unsupported programme definition version';
  end if;
  if definition_version = '2' then
    select decision.enabled into strict entitlement_enabled
    from loyalty_private.resolve_organization_entitlement(
      new.organization_id,
      'programme.v2',
      'programme:' || new.programme_id::text,
      now()
    ) as decision;
    if not entitlement_enabled then
      raise exception using errcode = '42501', message = 'ProgrammeDefinitionV2 is not enabled for this organization';
    end if;
    perform loyalty_private.validate_programme_definition_v2(new.configuration);
  end if;
  return new;
end;
$$;

create trigger programme_versions_v2_entitlement
before insert on loyalty.programme_versions
for each row execute function loyalty_private.enforce_programme_v2_entitlement();

create or replace function loyalty_private.materialize_programme_definition(
  target_version_id bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_version loyalty.programme_versions%rowtype;
begin
  select version.* into target_version
  from loyalty.programme_versions as version
  where version.id = target_version_id and version.status = 'draft'
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'unknown draft programme version';
  end if;
  if jsonb_typeof(target_version.configuration -> 'tiers') <> 'array'
    or jsonb_array_length(target_version.configuration -> 'tiers') = 0 then
    raise exception using errcode = '22023', message = 'programme requires a tier array';
  end if;
  if target_version.configuration ->> 'version' = '2' then
    perform loyalty_private.validate_programme_definition_v2(target_version.configuration);
  end if;

  insert into loyalty.programme_tiers (
    organization_id, programme_group_id, programme_version_id, code, name,
    ordinal, minimum_eligible_spend_minor, points_per_major_unit
  )
  select target_version.organization_id, target_version.programme_group_id,
    target_version.id, tier.value ->> 'code', tier.value ->> 'name',
    tier.ordinal::smallint,
    (tier.value ->> 'minimumEligibleSpendMinor')::bigint,
    (tier.value ->> 'pointsPerMajorUnit')::bigint
  from jsonb_array_elements(target_version.configuration -> 'tiers')
    with ordinality as tier(value, ordinal);

  if exists (
    select 1 from (
      select definition.ordinal, definition.minimum_eligible_spend_minor,
        lag(definition.minimum_eligible_spend_minor) over (order by definition.ordinal) as previous_minimum
      from loyalty.programme_tiers as definition
      where definition.programme_version_id = target_version.id
    ) as ordered
    where (ordered.ordinal = 1 and ordered.minimum_eligible_spend_minor <> 0)
      or (ordered.ordinal > 1 and ordered.minimum_eligible_spend_minor <= ordered.previous_minimum)
  ) then
    raise exception using errcode = '23514', message = 'programme tier thresholds must start at zero and increase';
  end if;

  if target_version.configuration ? 'rewards' then
    if jsonb_typeof(target_version.configuration -> 'rewards') <> 'array' then
      raise exception using errcode = '22023', message = 'programme rewards must be an array';
    end if;
    insert into loyalty.programme_rewards (
      organization_id, programme_group_id, programme_version_id, code, name,
      reward_kind, cost_points, configuration
    )
    select target_version.organization_id, target_version.programme_group_id,
      target_version.id, reward.value ->> 'code', reward.value ->> 'name',
      reward.value ->> 'kind', (reward.value ->> 'costPoints')::bigint,
      coalesce(reward.value -> 'configuration', '{}'::jsonb)
    from jsonb_array_elements(target_version.configuration -> 'rewards') as reward(value);
  end if;

  if target_version.configuration ->> 'version' = '2' then
    insert into loyalty.programme_earning_rules (
      organization_id, programme_group_id, programme_version_id, code, name,
      ordinal, source, enabled, priority, stackable, effect_kind, effect,
      conditions, purchase_exclusions, cap
    )
    select target_version.organization_id, target_version.programme_group_id,
      target_version.id, rule.value ->> 'code', rule.value ->> 'name',
      rule.ordinal::smallint, rule.value ->> 'source',
      (rule.value ->> 'enabled')::boolean, (rule.value ->> 'priority')::integer,
      (rule.value ->> 'stackable')::boolean, rule.value -> 'effect' ->> 'kind',
      rule.value -> 'effect', rule.value -> 'conditions',
      case when rule.value -> 'purchaseExclusions' = 'null'::jsonb
        then null else rule.value -> 'purchaseExclusions' end,
      rule.value -> 'cap'
    from jsonb_array_elements(target_version.configuration -> 'earningRules')
      with ordinality as rule(value, ordinal);
  end if;
end;
$$;

alter function loyalty_private.validate_programme_definition_v2(jsonb) owner to loyalty_owner;
alter function loyalty_private.enforce_programme_v2_entitlement() owner to loyalty_owner;
alter function loyalty_private.materialize_programme_definition(bigint) owner to loyalty_owner;

alter table loyalty.programme_earning_rules enable row level security;
create policy programme_earning_rules_member_select on loyalty.programme_earning_rules
  for select to authenticated
  using ((select loyalty_private.is_organization_member(organization_id)));
create policy programme_earning_rules_worker_select on loyalty.programme_earning_rules
  for select to loyalty_worker using (true);

revoke all on loyalty.programme_earning_rules
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant select on loyalty.programme_earning_rules to authenticated, loyalty_worker;

revoke all on function loyalty_private.validate_programme_definition_v2(jsonb),
  loyalty_private.enforce_programme_v2_entitlement(),
  loyalty_private.materialize_programme_definition(bigint)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

comment on table loyalty.programme_earning_rules is
  'Immutable normalized ProgrammeDefinitionV2 earning rules materialized only by approved publication or scheduling.';
comment on function loyalty_private.validate_programme_definition_v2(jsonb) is
  'Fail-closed database validation for the normalized V2 contract before value-affecting publication.';
