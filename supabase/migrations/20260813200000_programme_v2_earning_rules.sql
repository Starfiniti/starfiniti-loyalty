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

create table loyalty_private.member_earning_rule_effects (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  programme_group_id bigint not null,
  programme_version_id bigint not null,
  customer_id bigint not null,
  evaluation_id bigint not null,
  rule_id bigint not null,
  rule_code text not null,
  awarded_points bigint not null check (awarded_points > 0),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, evaluation_id, rule_id),
  foreign key (organization_id, programme_group_id, programme_version_id)
    references loyalty.programme_versions(organization_id, programme_group_id, id) on delete restrict,
  foreign key (organization_id, customer_id)
    references loyalty.customers(organization_id, id) on delete restrict,
  foreign key (organization_id, evaluation_id)
    references loyalty_private.programme_evaluations(organization_id, id) on delete restrict,
  foreign key (organization_id, rule_id)
    references loyalty.programme_earning_rules(organization_id, id) on delete restrict,
  check (rule_code ~ '^[a-z][a-z0-9_-]{0,79}$')
);

create index member_earning_rule_effects_usage_idx
  on loyalty_private.member_earning_rule_effects (
    organization_id, programme_group_id, customer_id, rule_code, occurred_at, id
  );

alter table loyalty_private.member_earning_rule_effects owner to loyalty_owner;

create trigger member_earning_rule_effects_immutable
before update or delete on loyalty_private.member_earning_rule_effects
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
        'activityCodes', 'segmentCodes', 'tierCodes', 'startsAt', 'endsAt'
      ])
      or condition_value - array[
        'productIds', 'categoryIds', 'currencyCodes', 'markets', 'channels',
        'activityCodes', 'segmentCodes', 'tierCodes', 'startsAt', 'endsAt'
      ] <> '{}'::jsonb
      or exists (
        select 1
        from unnest(array[
          'productIds', 'categoryIds', 'currencyCodes', 'markets', 'channels',
          'activityCodes', 'segmentCodes', 'tierCodes'
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
        (condition_value -> 'activityCodes') ||
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
        and not (
          (cap_value ->> 'perEventPoints') ~ '^[1-9][0-9]{0,18}$'
          and (
            length(cap_value ->> 'perEventPoints') < 19
            or cap_value ->> 'perEventPoints' <= '9223372036854775807'
          )
        ))
      or (cap_value -> 'perMemberPoints' <> 'null'::jsonb
        and not (
          (cap_value ->> 'perMemberPoints') ~ '^[1-9][0-9]{0,18}$'
          and (
            length(cap_value ->> 'perMemberPoints') < 19
            or cap_value ->> 'perMemberPoints' <= '9223372036854775807'
          )
        )) then
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
        or not (
          coalesce(effect_value ->> 'pointsPerMajorUnit', '') ~ '^[1-9][0-9]{0,18}$'
          and (
            length(effect_value ->> 'pointsPerMajorUnit') < 19
            or effect_value ->> 'pointsPerMajorUnit' <= '9223372036854775807'
          )
        )
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
        or not (
          coalesce(effect_value ->> 'points', '') ~ '^[1-9][0-9]{0,18}$'
          and (
            length(effect_value ->> 'points') < 19
            or effect_value ->> 'points' <= '9223372036854775807'
          )
        )
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
      or (rule_value ->> 'source' <> 'verified_product_review' and (
        jsonb_array_length(condition_value -> 'productIds') > 0
        or jsonb_array_length(condition_value -> 'categoryIds') > 0
      ))
      or jsonb_array_length(condition_value -> 'currencyCodes') > 0
      or jsonb_array_length(condition_value -> 'markets') > 0 then
      raise exception using errcode = '22023', message = 'non-purchase earning rules cannot use commerce conditions';
    end if;
    if rule_value ->> 'source' <> 'custom_activity'
      and jsonb_array_length(condition_value -> 'activityCodes') > 0 then
      raise exception using errcode = '22023', message = 'only custom activity rules may select activity codes';
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

create or replace function loyalty_private.member_earning_period_matches(
  target_cap jsonb,
  existing_occurred_at timestamptz,
  target_occurred_at timestamptz
)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select case target_cap ->> 'memberPeriod'
    when 'lifetime' then true
    when 'calendar_day' then
      date_trunc('day', existing_occurred_at at time zone 'UTC') =
      date_trunc('day', target_occurred_at at time zone 'UTC')
    when 'calendar_month' then
      date_trunc('month', existing_occurred_at at time zone 'UTC') =
      date_trunc('month', target_occurred_at at time zone 'UTC')
    when 'calendar_year' then
      date_trunc('year', existing_occurred_at at time zone 'UTC') =
      date_trunc('year', target_occurred_at at time zone 'UTC')
    when 'rolling' then
      existing_occurred_at > target_occurred_at - pg_catalog.make_interval(
        days => (target_cap ->> 'rollingDays')::integer
      )
      and existing_occurred_at < target_occurred_at + pg_catalog.make_interval(
        days => (target_cap ->> 'rollingDays')::integer
      )
    else false
  end;
$$;

create or replace function loyalty_private.get_member_earning_rule_usage(
  target_organization_id bigint,
  target_programme_group_id bigint,
  target_programme_version_id bigint,
  target_customer_id bigint,
  target_occurred_at timestamptz,
  target_evaluation_idempotency_key text
)
returns table (rule_code text, consumed_points bigint)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from loyalty.programme_versions as version
    where version.organization_id = target_organization_id
      and version.programme_group_id = target_programme_group_id
      and version.id = target_programme_version_id
      and version.status = 'published'
      and version.configuration ->> 'version' = '2'
  ) or not exists (
    select 1 from loyalty.customers as customer
    where customer.organization_id = target_organization_id
      and customer.id = target_customer_id
  ) then
    raise exception using errcode = '22023', message = 'unknown V2 member earning context';
  end if;
  if length(target_evaluation_idempotency_key) not between 1 and 255 then
    raise exception using errcode = '22023', message = 'invalid V2 evaluation idempotency key';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'earning-cap|' || target_organization_id::text || '|' ||
      target_programme_group_id::text || '|' || target_customer_id::text,
      0
    )
  );
  return query
  select rule.code,
    coalesce(sum(effect.awarded_points) filter (
      where loyalty_private.member_earning_period_matches(
        rule.cap, effect.occurred_at, target_occurred_at
      )
    ), 0)::bigint
  from loyalty.programme_earning_rules as rule
  left join loyalty_private.member_earning_rule_effects as effect
    on effect.organization_id = rule.organization_id
   and effect.programme_group_id = rule.programme_group_id
   and effect.customer_id = target_customer_id
   and effect.rule_code = rule.code
   and not exists (
     select 1
     from loyalty_private.programme_evaluations as evaluation
     where evaluation.organization_id = effect.organization_id
       and evaluation.id = effect.evaluation_id
       and evaluation.idempotency_key = target_evaluation_idempotency_key
   )
  where rule.organization_id = target_organization_id
    and rule.programme_group_id = target_programme_group_id
    and rule.programme_version_id = target_programme_version_id
    and rule.enabled
    and rule.cap -> 'perMemberPoints' <> 'null'::jsonb
  group by rule.id, rule.code
  order by rule.code;
end;
$$;

create or replace function loyalty_private.commit_programme_v2_award(
  target_organization_id bigint,
  target_programme_group_id bigint,
  target_programme_version_id bigint,
  target_canonical_event_id bigint,
  target_customer_id bigint,
  target_subject_reference text,
  target_evaluation_idempotency_key text,
  target_award_idempotency_key text,
  target_input_sha256 bytea,
  target_result_sha256 bytea,
  target_result jsonb,
  target_explanation jsonb,
  target_occurred_at timestamptz,
  target_evaluated_at timestamptz default now()
)
returns table (
  evaluation_public_id uuid,
  transaction_public_id uuid,
  outcome text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_evaluation loyalty_private.programme_evaluations%rowtype;
  target_evaluation loyalty_private.programme_evaluations%rowtype;
  contribution jsonb;
  target_rule loyalty.programme_earning_rules%rowtype;
  contribution_points bigint;
  contribution_numerator numeric;
  contribution_denominator numeric;
  common_denominator numeric;
  total_numerator numeric := 0;
  allocated_points bigint := 0;
  target_points bigint;
  consumed_points bigint;
  seen_rule_codes text[] := array[]::text[];
  recorded record;
  posted record;
begin
  if not exists (
    select 1 from loyalty.programme_versions as version
    where version.organization_id = target_organization_id
      and version.programme_group_id = target_programme_group_id
      and version.id = target_programme_version_id
      and version.status = 'published'
      and version.configuration ->> 'version' = '2'
  ) or not exists (
    select 1 from loyalty.customers as customer
    where customer.organization_id = target_organization_id
      and customer.id = target_customer_id
  ) or not exists (
    select 1
    from loyalty_private.canonical_commerce_events as event
    join loyalty.commerce_connections as connection
      on connection.organization_id = event.organization_id
     and connection.id = event.connection_id
    join loyalty.programme_versions as version
      on version.organization_id = event.organization_id
     and version.id = target_programme_version_id
     and version.programme_id = connection.programme_id
    where event.organization_id = target_organization_id
      and event.id = target_canonical_event_id
  ) then
    raise exception using errcode = '22023', message = 'unknown V2 award context';
  end if;
  if length(target_subject_reference) not between 1 and 500
    or length(target_evaluation_idempotency_key) not between 1 and 255
    or length(target_award_idempotency_key) not between 1 and 255
    or octet_length(target_input_sha256) <> 32
    or octet_length(target_result_sha256) <> 32
    or jsonb_typeof(target_result) <> 'object'
    or target_result ->> 'version' <> '2'
    or not (target_result ?& array[
      'version', 'eventId', 'source', 'eligibleSpendMinor', 'awardedPoints',
      'tierCodeSnapshot', 'pendingAt', 'availableAt', 'expiresAt',
      'selectedMultiplierRuleCode', 'contributions', 'lines'
    ])
    or target_result - array[
      'version', 'eventId', 'source', 'eligibleSpendMinor', 'awardedPoints',
      'tierCodeSnapshot', 'pendingAt', 'availableAt', 'expiresAt',
      'selectedMultiplierRuleCode', 'contributions', 'lines'
    ] <> '{}'::jsonb
    or length(coalesce(target_result ->> 'eventId', '')) not between 1 and 500
    or coalesce(target_result ->> 'source', '') not in (
      'purchase', 'account_created', 'birthday', 'verified_product_review',
      'referral', 'custom_activity'
    )
    or coalesce(target_result ->> 'eligibleSpendMinor', '') !~ '^(0|[1-9][0-9]{0,18})$'
    or coalesce(target_result ->> 'tierCodeSnapshot', '') !~ '^[a-z][a-z0-9_-]{0,79}$'
    or jsonb_typeof(target_result -> 'lines') <> 'array'
    or jsonb_array_length(target_result -> 'lines') > 1000
    or not (
      coalesce(target_result ->> 'awardedPoints', '') ~ '^(0|[1-9][0-9]{0,18})$'
      and (
        length(target_result ->> 'awardedPoints') < 19
        or target_result ->> 'awardedPoints' <= '9223372036854775807'
      )
    )
    or jsonb_typeof(target_result -> 'contributions') <> 'array'
    or jsonb_array_length(target_result -> 'contributions') > 200
    or jsonb_typeof(target_explanation) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid V2 award evidence';
  end if;
  target_points := (target_result ->> 'awardedPoints')::bigint;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'earning-cap|' || target_organization_id::text || '|' ||
      target_programme_group_id::text || '|' || target_customer_id::text,
      0
    )
  );

  select evaluation.* into existing_evaluation
  from loyalty_private.programme_evaluations as evaluation
  where evaluation.organization_id = target_organization_id
    and evaluation.idempotency_key = target_evaluation_idempotency_key;
  if found then
    if existing_evaluation.input_sha256 <> target_input_sha256
      or existing_evaluation.result_sha256 <> target_result_sha256 then
      raise exception using errcode = '23514', message = 'evaluation idempotency hash conflict';
    end if;
    select transaction.public_id into transaction_public_id
    from loyalty.ledger_transactions as transaction
    where transaction.organization_id = target_organization_id
      and transaction.idempotency_key = target_award_idempotency_key;
    evaluation_public_id := existing_evaluation.public_id;
    outcome := 'duplicate';
    return next;
    return;
  end if;

  for contribution in
    select value from jsonb_array_elements(target_result -> 'contributions')
  loop
    if jsonb_typeof(contribution) <> 'object'
      or not (contribution ?& array[
        'ruleCode', 'effectKind', 'uncappedPoints', 'awardedPoints',
        'uncappedNumerator', 'awardedNumerator', 'denominator', 'capApplied'
      ])
      or contribution - array[
        'ruleCode', 'effectKind', 'uncappedPoints', 'awardedPoints',
        'uncappedNumerator', 'awardedNumerator', 'denominator', 'capApplied'
      ] <> '{}'::jsonb
      or coalesce(contribution ->> 'ruleCode', '') !~ '^[a-z][a-z0-9_-]{0,79}$'
      or not (
        coalesce(contribution ->> 'awardedPoints', '') ~ '^(0|[1-9][0-9]{0,18})$'
        and (
          length(contribution ->> 'awardedPoints') < 19
          or contribution ->> 'awardedPoints' <= '9223372036854775807'
        )
      )
      or coalesce(contribution ->> 'uncappedNumerator', '') !~ '^(0|[1-9][0-9]{0,99})$'
      or coalesce(contribution ->> 'awardedNumerator', '') !~ '^(0|[1-9][0-9]{0,99})$'
      or coalesce(contribution ->> 'denominator', '') !~ '^[1-9][0-9]{0,18}$' then
      raise exception using errcode = '22023', message = 'invalid V2 award contribution';
    end if;
    if contribution ->> 'ruleCode' = any(seen_rule_codes) then
      raise exception using errcode = '23514', message = 'duplicate V2 award contribution';
    end if;
    seen_rule_codes := array_append(seen_rule_codes, contribution ->> 'ruleCode');
    select rule.* into target_rule
    from loyalty.programme_earning_rules as rule
    where rule.organization_id = target_organization_id
      and rule.programme_version_id = target_programme_version_id
      and rule.code = contribution ->> 'ruleCode'
      and rule.enabled;
    if not found or target_rule.effect_kind <> contribution ->> 'effectKind'
      or target_rule.source <> target_result ->> 'source' then
      raise exception using errcode = '23514', message = 'V2 award contribution does not match published rule';
    end if;
    contribution_points := (contribution ->> 'awardedPoints')::bigint;
    contribution_numerator := (contribution ->> 'awardedNumerator')::numeric;
    contribution_denominator := (contribution ->> 'denominator')::numeric;
    if contribution_numerator > (contribution ->> 'uncappedNumerator')::numeric then
      raise exception using errcode = '23514', message = 'V2 award exceeds uncapped contribution';
    end if;
    if common_denominator is null then
      common_denominator := contribution_denominator;
    elsif common_denominator <> contribution_denominator then
      raise exception using errcode = '23514', message = 'V2 contribution denominators differ';
    end if;
    total_numerator := total_numerator + contribution_numerator;
    allocated_points := allocated_points + contribution_points;
    if target_rule.cap -> 'perEventPoints' <> 'null'::jsonb
      and contribution_points > (target_rule.cap ->> 'perEventPoints')::bigint then
      raise exception using errcode = '23514', message = 'V2 per-event cap exceeded';
    end if;
    if target_rule.cap -> 'perMemberPoints' <> 'null'::jsonb then
      select coalesce(sum(effect.awarded_points), 0)::bigint into consumed_points
      from loyalty_private.member_earning_rule_effects as effect
      where effect.organization_id = target_organization_id
        and effect.programme_group_id = target_programme_group_id
        and effect.customer_id = target_customer_id
        and effect.rule_code = target_rule.code
        and loyalty_private.member_earning_period_matches(
          target_rule.cap, effect.occurred_at, target_occurred_at
        );
      if consumed_points + contribution_points >
        (target_rule.cap ->> 'perMemberPoints')::bigint then
        raise exception using errcode = '23514', message = 'V2 per-member cap exceeded';
      end if;
    end if;
  end loop;
  if allocated_points <> target_points
    or (common_denominator is null and target_points <> 0)
    or (common_denominator is not null
      and floor(total_numerator / common_denominator) <> target_points::numeric) then
    raise exception using errcode = '23514', message = 'V2 award total does not match contributions';
  end if;

  select * into recorded
  from loyalty_private.record_programme_evaluation(
    target_organization_id, target_programme_group_id, target_programme_version_id,
    target_canonical_event_id, 'live_award', target_subject_reference,
    target_evaluation_idempotency_key, target_input_sha256, target_result_sha256,
    target_result, target_explanation, target_evaluated_at
  );
  select evaluation.* into strict target_evaluation
  from loyalty_private.programme_evaluations as evaluation
  where evaluation.organization_id = target_organization_id
    and evaluation.public_id = recorded.evaluation_public_id;

  for contribution in
    select value from jsonb_array_elements(target_result -> 'contributions')
  loop
    contribution_points := (contribution ->> 'awardedPoints')::bigint;
    if contribution_points = 0 then
      continue;
    end if;
    select rule.* into strict target_rule
    from loyalty.programme_earning_rules as rule
    where rule.organization_id = target_organization_id
      and rule.programme_version_id = target_programme_version_id
      and rule.code = contribution ->> 'ruleCode';
    insert into loyalty_private.member_earning_rule_effects (
      organization_id, programme_group_id, programme_version_id, customer_id,
      evaluation_id, rule_id, rule_code, awarded_points, occurred_at
    ) values (
      target_organization_id, target_programme_group_id, target_programme_version_id,
      target_customer_id, target_evaluation.id, target_rule.id, target_rule.code,
      contribution_points, target_occurred_at
    );
  end loop;

  transaction_public_id := null;
  if target_points > 0 then
    select * into posted from loyalty_private.award_points(
      target_organization_id, target_programme_group_id, target_programme_version_id,
      target_customer_id, target_points, target_award_idempotency_key,
      target_result_sha256, target_canonical_event_id, target_subject_reference,
      target_occurred_at
    );
    transaction_public_id := posted.transaction_public_id;
  end if;
  evaluation_public_id := target_evaluation.public_id;
  outcome := 'created';
  return next;
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

create or replace function loyalty_private.claim_woocommerce_effects(
  target_worker_id text,
  target_batch_size integer default 25,
  target_lease_seconds integer default 60
)
returns table (
  canonical_event_id bigint,
  canonical_event_public_id uuid,
  organization_id bigint,
  connection_id bigint,
  programme_id bigint,
  event_type text,
  source_event_id text,
  source_object_id text,
  occurred_at timestamptz,
  payload jsonb,
  attempt_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if length(btrim(target_worker_id)) not between 1 and 200 then
    raise exception using errcode = '22023', message = 'invalid worker id';
  end if;
  if target_batch_size not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid batch size';
  end if;
  if target_lease_seconds not between 10 and 3600 then
    raise exception using errcode = '22023', message = 'invalid lease duration';
  end if;

  return query
  with candidates as (
    select event.id
    from loyalty_private.canonical_commerce_events as event
    where event.event_type in (
        'commerce.order.status_changed', 'commerce.order.refunded',
        'commerce.coupon.captured', 'commerce.customer.deleted',
        'commerce.customer.created', 'commerce.review.verified',
        'commerce.activity.recorded'
      )
      and (
        (event.effect_state in ('pending', 'retryable')
          and event.effect_available_at <= clock_timestamp())
        or (event.effect_state = 'processing'
          and event.effect_lease_expires_at <= clock_timestamp())
      )
    order by event.effect_available_at, event.id
    for update skip locked
    limit target_batch_size
  ), claimed as (
    update loyalty_private.canonical_commerce_events as event
    set effect_state = 'processing',
        effect_attempt_count = event.effect_attempt_count + 1,
        effect_lease_owner = target_worker_id,
        effect_lease_expires_at = clock_timestamp()
          + pg_catalog.make_interval(secs => target_lease_seconds),
        effect_last_error_code = null
    from candidates
    where event.id = candidates.id
    returning event.*
  )
  select claimed.id, claimed.public_id, claimed.organization_id,
    claimed.connection_id, connection.programme_id, claimed.event_type,
    claimed.source_event_id, claimed.source_object_id, claimed.occurred_at,
    claimed.payload, claimed.effect_attempt_count
  from claimed
  join loyalty.commerce_connections as connection
    on connection.organization_id = claimed.organization_id
   and connection.id = claimed.connection_id
  order by claimed.id;
end;
$$;

alter function loyalty_private.validate_programme_definition_v2(jsonb) owner to loyalty_owner;
alter function loyalty_private.enforce_programme_v2_entitlement() owner to loyalty_owner;
alter function loyalty_private.member_earning_period_matches(jsonb, timestamptz, timestamptz) owner to loyalty_owner;
alter function loyalty_private.get_member_earning_rule_usage(bigint, bigint, bigint, bigint, timestamptz, text) owner to loyalty_owner;
alter function loyalty_private.commit_programme_v2_award(
  bigint, bigint, bigint, bigint, bigint, text, text, text, bytea, bytea,
  jsonb, jsonb, timestamptz, timestamptz
) owner to loyalty_owner;
alter function loyalty_private.materialize_programme_definition(bigint) owner to loyalty_owner;
alter function loyalty_private.claim_woocommerce_effects(text, integer, integer)
  owner to loyalty_owner;

alter table loyalty.programme_earning_rules enable row level security;
alter table loyalty_private.member_earning_rule_effects enable row level security;
create policy programme_earning_rules_member_select on loyalty.programme_earning_rules
  for select to authenticated
  using ((select loyalty_private.is_organization_member(organization_id)));
create policy programme_earning_rules_worker_select on loyalty.programme_earning_rules
  for select to loyalty_worker using (true);
create policy member_earning_rule_effects_worker_select
  on loyalty_private.member_earning_rule_effects
  for select to loyalty_worker using (true);

revoke all on loyalty.programme_earning_rules
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant select on loyalty.programme_earning_rules to authenticated, loyalty_worker;
revoke all on loyalty_private.member_earning_rule_effects
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant select on loyalty_private.member_earning_rule_effects to loyalty_worker;

revoke all on function loyalty_private.validate_programme_definition_v2(jsonb),
  loyalty_private.enforce_programme_v2_entitlement(),
  loyalty_private.member_earning_period_matches(jsonb, timestamptz, timestamptz),
  loyalty_private.get_member_earning_rule_usage(bigint, bigint, bigint, bigint, timestamptz, text),
  loyalty_private.commit_programme_v2_award(
    bigint, bigint, bigint, bigint, bigint, text, text, text, bytea, bytea,
    jsonb, jsonb, timestamptz, timestamptz
  ),
  loyalty_private.materialize_programme_definition(bigint)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function
  loyalty_private.get_member_earning_rule_usage(bigint, bigint, bigint, bigint, timestamptz, text),
  loyalty_private.commit_programme_v2_award(
    bigint, bigint, bigint, bigint, bigint, text, text, text, bytea, bytea,
    jsonb, jsonb, timestamptz, timestamptz
  ) to loyalty_worker;

comment on table loyalty.programme_earning_rules is
  'Immutable normalized ProgrammeDefinitionV2 earning rules materialized only by approved publication or scheduling.';
comment on function loyalty_private.validate_programme_definition_v2(jsonb) is
  'Fail-closed database validation for the normalized V2 contract before value-affecting publication.';
comment on table loyalty_private.member_earning_rule_effects is
  'Immutable integer attribution of accepted V2 points to member/rule identity for serialized cap accounting.';
comment on function loyalty_private.get_member_earning_rule_usage(bigint, bigint, bigint, bigint, timestamptz, text) is
  'Acquires the transaction-scoped member cap lock and returns authoritative usage for the published V2 rules.';
comment on function loyalty_private.commit_programme_v2_award(
  bigint, bigint, bigint, bigint, bigint, text, text, text, bytea, bytea,
  jsonb, jsonb, timestamptz, timestamptz
) is 'Rechecks V2 contribution totals and caps, then atomically appends evaluation, usage, and ledger evidence.';

alter table loyalty.commerce_connections
  drop constraint commerce_connections_platform_check;
alter table loyalty.commerce_connections
  add constraint commerce_connections_platform_check
  check (platform in ('woocommerce', 'merchant_activity'));

-- These roles already have explicit per-object grants and RLS policies in the
-- released migrations. Schema USAGE is required before PostgreSQL can honor
-- those narrower grants; it does not grant table access by itself.
grant usage on schema loyalty to loyalty_runtime, loyalty_worker;

create or replace function loyalty_private.provision_merchant_activity_source(
  target_actor_user_id uuid,
  target_workspace_public_id uuid,
  target_programme_public_id uuid,
  target_display_name text,
  target_signing_material_ref text,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (
  source_public_id uuid,
  key_version text,
  signing_material_ref text,
  outcome text
)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  target_workspace loyalty.workspaces%rowtype;
  target_programme loyalty.programmes%rowtype;
  existing_audit loyalty.admin_audit_events%rowtype;
  request_hash bytea;
  created_source loyalty.commerce_connections%rowtype;
  created_source_public_id uuid := extensions.gen_random_uuid();
begin
  if target_actor_user_id is null
    or target_workspace_public_id is null
    or target_programme_public_id is null
    or target_display_name is null
    or pg_catalog.length(target_display_name) not between 1 and 200
    or target_display_name <> pg_catalog.btrim(target_display_name)
    or target_display_name ~ '[[:cntrl:]]'
    or target_signing_material_ref is null
    or target_signing_material_ref !~ '^pool:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:v1$'
    or target_idempotency_key is null
    or pg_catalog.length(target_idempotency_key) not between 1 and 255
    or target_idempotency_key <> pg_catalog.btrim(target_idempotency_key)
    or target_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid activity source provisioning input';
  end if;

  select workspace.* into target_workspace
  from loyalty.workspaces as workspace
  join loyalty.organizations as organization
    on organization.id = workspace.organization_id
   and organization.status = 'active'
  where workspace.public_id = target_workspace_public_id
    and workspace.status = 'active'
    and exists (
      select 1
      from loyalty.organization_memberships as membership
      where membership.organization_id = workspace.organization_id
        and membership.user_id = target_actor_user_id
        and membership.role in ('owner', 'admin')
        and membership.revoked_at is null
    )
  for update of workspace;
  if not found then
    raise exception using errcode = '42501', message = 'activity source provisioning not authorized';
  end if;

  select programme.* into target_programme
  from loyalty.programmes as programme
  join loyalty.programme_group_workspaces as group_workspace
    on group_workspace.organization_id = programme.organization_id
   and group_workspace.programme_group_id = programme.programme_group_id
   and group_workspace.workspace_id = target_workspace.id
  where programme.public_id = target_programme_public_id
    and programme.organization_id = target_workspace.organization_id
    and programme.status = 'active'
    and exists (
      select 1
      from loyalty.programme_versions as version
      where version.organization_id = programme.organization_id
        and version.programme_id = programme.id
        and version.status = 'published'
        and version.configuration ->> 'version' = '2'
    )
  for update of programme;
  if not found then
    raise exception using errcode = '42501', message = 'activity source provisioning not authorized';
  end if;

  request_hash := extensions.digest(
    pg_catalog.convert_to(
      'source.merchant_activity.provision|' || target_workspace.public_id::text || '|' ||
      target_programme.public_id::text || '|' || target_display_name,
      'utf8'
    ),
    'sha256'
  );
  select audit.* into existing_audit
  from loyalty.admin_audit_events as audit
  where audit.organization_id = target_workspace.organization_id
    and audit.idempotency_key = target_idempotency_key;
  if found then
    if existing_audit.action <> 'source.merchant_activity.provision'
      or existing_audit.request_sha256 <> request_hash then
      raise exception using errcode = '23514', message = 'activity source idempotency conflict';
    end if;
    return query
    select source.public_id, source.current_key_version,
      source.signing_material_ref, 'duplicate'::text
    from loyalty.commerce_connections as source
    where source.organization_id = target_workspace.organization_id
      and source.public_id = existing_audit.resource_public_id
      and source.platform = 'merchant_activity';
    if not found then
      raise exception using errcode = '55000', message = 'activity source audit is inconsistent';
    end if;
    return;
  end if;

  if exists (
    select 1 from loyalty.commerce_connections as connection
    where connection.signing_material_ref = target_signing_material_ref
  ) then
    raise exception using errcode = '23514', message = 'connector signing material unavailable';
  end if;
  if exists (
    select 1 from loyalty.commerce_connections as source
    where source.organization_id = target_workspace.organization_id
      and source.workspace_id = target_workspace.id
      and source.platform = 'merchant_activity'
  ) then
    raise exception using errcode = '23514', message = 'merchant activity source already exists';
  end if;

  insert into loyalty.commerce_connections (
    public_id, organization_id, workspace_id, platform, external_store_id,
    display_name, status, current_key_version, signing_material_ref, programme_id
  ) values (
    created_source_public_id, target_workspace.organization_id,
    target_workspace.id, 'merchant_activity',
    'activity-source:' || created_source_public_id::text,
    target_display_name, 'active', 'v1', target_signing_material_ref,
    target_programme.id
  ) returning * into created_source;

  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id,
    metadata
  ) values (
    target_workspace.organization_id, target_actor_user_id,
    'source.merchant_activity.provision', 'merchant_activity_source',
    created_source.public_id, target_idempotency_key, request_hash,
    target_correlation_id,
    pg_catalog.jsonb_build_object(
      'workspacePublicId', target_workspace.public_id,
      'programmePublicId', target_programme.public_id,
      'platform', 'merchant_activity',
      'displayName', target_display_name,
      'keyVersion', created_source.current_key_version
    )
  );

  return query select created_source.public_id,
    created_source.current_key_version, created_source.signing_material_ref,
    'created'::text;
end;
$$;

alter function loyalty_private.provision_merchant_activity_source(
  uuid, uuid, uuid, text, text, text, uuid
) owner to loyalty_owner;
revoke all on function loyalty_private.provision_merchant_activity_source(
  uuid, uuid, uuid, text, text, text, uuid
) from public, anon, authenticated, loyalty_worker;
grant execute on function loyalty_private.provision_merchant_activity_source(
  uuid, uuid, uuid, text, text, text, uuid
) to loyalty_runtime;

comment on function loyalty_private.provision_merchant_activity_source(
  uuid, uuid, uuid, text, text, text, uuid
) is 'Consumes one deployment-managed signing reference to create a programme-bound, audited Merchant Activity API source for a live owner/admin.';
