-- M05 versioned advanced tier policy publication and immutable materialization.

alter function loyalty_private.validate_programme_definition_v2(jsonb)
  rename to validate_programme_definition_v2_core;

create table loyalty.programme_tier_policies (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  programme_group_id bigint not null,
  programme_version_id bigint not null,
  qualification_period_kind text not null check (
    qualification_period_kind in ('lifetime', 'rolling_days', 'calendar_year')
  ),
  rolling_days integer check (rolling_days between 1 and 3650),
  calendar_timezone text,
  downgrade_grace_days integer not null check (downgrade_grace_days between 0 and 365),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, programme_version_id),
  foreign key (organization_id, programme_group_id, programme_version_id)
    references loyalty.programme_versions(organization_id, programme_group_id, id) on delete restrict,
  check (
    (qualification_period_kind = 'lifetime'
      and rolling_days is null and calendar_timezone is null)
    or (qualification_period_kind = 'rolling_days'
      and rolling_days is not null and calendar_timezone is null)
    or (qualification_period_kind = 'calendar_year'
      and rolling_days is null and calendar_timezone is not null)
  )
);

create table loyalty.programme_tier_policy_levels (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  programme_group_id bigint not null,
  programme_version_id bigint not null,
  tier_code text not null,
  ordinal smallint not null check (ordinal between 1 and 15),
  entry_operator text check (entry_operator in ('all', 'any')),
  retention_operator text check (retention_operator in ('all', 'any')),
  reentry_operator text check (reentry_operator in ('all', 'any')),
  earning_multiplier_basis_points integer not null check (
    earning_multiplier_basis_points between 10000 and 100000
  ),
  reward_codes text[] not null default '{}'::text[],
  early_access boolean not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, programme_version_id, tier_code),
  unique (organization_id, programme_version_id, ordinal),
  foreign key (organization_id, programme_version_id)
    references loyalty.programme_tier_policies(organization_id, programme_version_id) on delete restrict,
  foreign key (organization_id, programme_version_id, tier_code)
    references loyalty.programme_tiers(organization_id, programme_version_id, code) on delete restrict,
  check (
    (ordinal = 1 and entry_operator is null
      and retention_operator is null and reentry_operator is null)
    or (ordinal > 1 and entry_operator is not null
      and retention_operator is not null and reentry_operator is not null)
  )
);

create table loyalty.programme_tier_thresholds (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  programme_group_id bigint not null,
  programme_version_id bigint not null,
  tier_code text not null,
  threshold_kind text not null check (threshold_kind in ('entry', 'retention', 'reentry')),
  ordinal smallint not null check (ordinal between 1 and 20),
  metric text not null check (metric in (
    'eligible_spend', 'earned_points', 'order_count', 'referral_count',
    'verified_action_count'
  )),
  minimum_value bigint not null check (minimum_value > 0),
  activity_codes text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (
    organization_id, programme_version_id, tier_code, threshold_kind, ordinal
  ),
  foreign key (organization_id, programme_version_id, tier_code)
    references loyalty.programme_tier_policy_levels(
      organization_id, programme_version_id, tier_code
    ) on delete restrict,
  check (metric = 'verified_action_count' or cardinality(activity_codes) = 0)
);

create index programme_tier_policy_levels_version_idx
  on loyalty.programme_tier_policy_levels (
    organization_id, programme_version_id, ordinal
  );
create index programme_tier_thresholds_evaluation_idx
  on loyalty.programme_tier_thresholds (
    organization_id, programme_version_id, tier_code, threshold_kind, ordinal
  );

alter table loyalty.programme_tier_policies owner to loyalty_owner;
alter table loyalty.programme_tier_policy_levels owner to loyalty_owner;
alter table loyalty.programme_tier_thresholds owner to loyalty_owner;

create trigger programme_tier_policies_immutable
before update or delete on loyalty.programme_tier_policies
for each row execute function loyalty_private.reject_immutable_change();
create trigger programme_tier_policy_levels_immutable
before update or delete on loyalty.programme_tier_policy_levels
for each row execute function loyalty_private.reject_immutable_change();
create trigger programme_tier_thresholds_immutable
before update or delete on loyalty.programme_tier_thresholds
for each row execute function loyalty_private.reject_immutable_change();

create or replace function loyalty_private.validate_tier_policy_v2(
  target_configuration jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_policy jsonb := target_configuration -> 'tierPolicy';
  target_period jsonb;
  level_value jsonb;
  benefits_value jsonb;
  expression_value jsonb;
  threshold_value jsonb;
  qualification_kind text;
  level_index integer := 0;
  level_codes text[] := array[]::text[];
  tier_codes text[];
  reward_codes text[];
  seen_thresholds text[];
  threshold_identity text;
begin
  if jsonb_typeof(target_policy) <> 'object'
    or not (target_policy ?& array[
      'version', 'qualificationPeriod', 'downgradeGraceDays', 'levels'
    ])
    or target_policy - array[
      'version', 'qualificationPeriod', 'downgradeGraceDays', 'levels'
    ] <> '{}'::jsonb
    or target_policy ->> 'version' <> '2'
    or coalesce(target_policy ->> 'downgradeGraceDays', '') !~ '^(0|[1-9][0-9]{0,2})$'
    or (target_policy ->> 'downgradeGraceDays')::integer > 365
    or jsonb_typeof(target_policy -> 'levels') <> 'array'
    or jsonb_array_length(target_policy -> 'levels') not between 1 and 15 then
    raise exception using errcode = '22023', message = 'invalid TierPolicyV2 object';
  end if;

  target_period := target_policy -> 'qualificationPeriod';
  if jsonb_typeof(target_period) <> 'object'
    or coalesce(target_period ->> 'kind', '') not in (
      'lifetime', 'rolling_days', 'calendar_year'
    ) then
    raise exception using errcode = '22023', message = 'invalid tier qualification period';
  end if;
  if target_period ->> 'kind' = 'lifetime' then
    if target_period <> '{"kind":"lifetime"}'::jsonb then
      raise exception using errcode = '22023', message = 'invalid lifetime tier period';
    end if;
  elsif target_period ->> 'kind' = 'rolling_days' then
    if target_period - array['kind', 'days'] <> '{}'::jsonb
      or not (target_period ?& array['kind', 'days'])
      or coalesce(target_period ->> 'days', '') !~ '^[1-9][0-9]{0,3}$'
      or (target_period ->> 'days')::integer > 3650 then
      raise exception using errcode = '22023', message = 'invalid rolling tier period';
    end if;
  else
    if target_period - array['kind', 'timeZone'] <> '{}'::jsonb
      or not (target_period ?& array['kind', 'timeZone'])
      or length(coalesce(target_period ->> 'timeZone', '')) not between 1 and 100
      or coalesce(target_period ->> 'timeZone', '') !~ '^[A-Za-z_+-]+(/[A-Za-z0-9_+-]+)+$'
      or not exists (
        select 1 from pg_catalog.pg_timezone_names as zone
        where zone.name = target_period ->> 'timeZone'
      ) then
      raise exception using errcode = '22023', message = 'invalid calendar tier timezone';
    end if;
  end if;

  select array_agg(tier.value ->> 'code' order by tier.ordinality)
  into tier_codes
  from jsonb_array_elements(target_configuration -> 'tiers')
    with ordinality as tier(value, ordinality);
  select coalesce(array_agg(reward.value ->> 'code'), array[]::text[])
  into reward_codes
  from jsonb_array_elements(target_configuration -> 'rewards') as reward(value);

  for level_value in
    select value from jsonb_array_elements(target_policy -> 'levels')
  loop
    level_index := level_index + 1;
    if jsonb_typeof(level_value) <> 'object'
      or not (level_value ?& array[
        'tierCode', 'entry', 'retention', 'reentry', 'benefits'
      ])
      or level_value - array[
        'tierCode', 'entry', 'retention', 'reentry', 'benefits'
      ] <> '{}'::jsonb
      or coalesce(level_value ->> 'tierCode', '') !~ '^[a-z][a-z0-9_-]{0,79}$'
      or (level_value ->> 'tierCode') = any(level_codes) then
      raise exception using errcode = '22023', message = 'invalid TierPolicyV2 level';
    end if;
    level_codes := array_append(level_codes, level_value ->> 'tierCode');
    benefits_value := level_value -> 'benefits';
    if jsonb_typeof(benefits_value) <> 'object'
      or not (benefits_value ?& array[
        'earningMultiplierBasisPoints', 'rewardCodes', 'earlyAccess'
      ])
      or benefits_value - array[
        'earningMultiplierBasisPoints', 'rewardCodes', 'earlyAccess'
      ] <> '{}'::jsonb
      or coalesce(benefits_value ->> 'earningMultiplierBasisPoints', '') !~ '^[1-9][0-9]{4,5}$'
      or (benefits_value ->> 'earningMultiplierBasisPoints')::integer not between 10000 and 100000
      or jsonb_typeof(benefits_value -> 'earlyAccess') <> 'boolean'
      or jsonb_typeof(benefits_value -> 'rewardCodes') <> 'array'
      or jsonb_array_length(benefits_value -> 'rewardCodes') > 100
      or exists (
        select 1 from jsonb_array_elements(benefits_value -> 'rewardCodes') as item(value)
        where jsonb_typeof(item.value) <> 'string'
          or (item.value #>> '{}') !~ '^[a-z][a-z0-9_-]{0,79}$'
      )
      or (
        select count(*) <> count(distinct value)
        from jsonb_array_elements_text(benefits_value -> 'rewardCodes')
      )
      or exists (
        select 1
        from jsonb_array_elements_text(benefits_value -> 'rewardCodes') as benefit(code)
        where not (benefit.code = any(reward_codes))
      ) then
      raise exception using errcode = '22023', message = 'invalid TierPolicyV2 benefits';
    end if;

    foreach qualification_kind in array array['entry', 'retention', 'reentry']
    loop
      expression_value := level_value -> qualification_kind;
      if level_index = 1 then
        if expression_value <> 'null'::jsonb then
          raise exception using errcode = '22023', message = 'base tier cannot require thresholds';
        end if;
        continue;
      end if;
      if jsonb_typeof(expression_value) <> 'object'
        or not (expression_value ?& array['operator', 'thresholds'])
        or expression_value - array['operator', 'thresholds'] <> '{}'::jsonb
        or coalesce(expression_value ->> 'operator', '') not in ('all', 'any')
        or jsonb_typeof(expression_value -> 'thresholds') <> 'array'
        or jsonb_array_length(expression_value -> 'thresholds') not between 1 and 20 then
        raise exception using errcode = '22023', message = 'invalid tier threshold expression';
      end if;
      seen_thresholds := array[]::text[];
      for threshold_value in
        select value from jsonb_array_elements(expression_value -> 'thresholds')
      loop
        if jsonb_typeof(threshold_value) <> 'object'
          or not (threshold_value ?& array['metric', 'minimum', 'activityCodes'])
          or threshold_value - array['metric', 'minimum', 'activityCodes'] <> '{}'::jsonb
          or coalesce(threshold_value ->> 'metric', '') not in (
            'eligible_spend', 'earned_points', 'order_count', 'referral_count',
            'verified_action_count'
          )
          or coalesce(threshold_value ->> 'minimum', '') !~ '^[1-9][0-9]{0,18}$'
          or (
            length(threshold_value ->> 'minimum') = 19
            and threshold_value ->> 'minimum' > '9223372036854775807'
          )
          or jsonb_typeof(threshold_value -> 'activityCodes') <> 'array'
          or jsonb_array_length(threshold_value -> 'activityCodes') > 100
          or exists (
            select 1 from jsonb_array_elements(threshold_value -> 'activityCodes') as item(value)
            where jsonb_typeof(item.value) <> 'string'
              or (item.value #>> '{}') !~ '^[a-z][a-z0-9_-]{0,79}$'
          )
          or (
            select count(*) <> count(distinct value)
            from jsonb_array_elements_text(threshold_value -> 'activityCodes')
          )
          or (
            threshold_value ->> 'metric' <> 'verified_action_count'
            and jsonb_array_length(threshold_value -> 'activityCodes') > 0
          ) then
          raise exception using errcode = '22023', message = 'invalid tier qualification threshold';
        end if;
        select (threshold_value ->> 'metric') || ':' || coalesce(
          string_agg(activity.code, ',' order by activity.code), ''
        ) into threshold_identity
        from jsonb_array_elements_text(threshold_value -> 'activityCodes') as activity(code);
        if threshold_identity = any(seen_thresholds) then
          raise exception using errcode = '23514', message = 'duplicate tier qualification threshold';
        end if;
        seen_thresholds := array_append(seen_thresholds, threshold_identity);
      end loop;
    end loop;
  end loop;
  if level_codes <> tier_codes then
    raise exception using errcode = '23514',
      message = 'TierPolicyV2 levels must match ordered programme tiers';
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
  perform loyalty_private.validate_programme_definition_v2_core(
    target_configuration - 'tierPolicy'
  );
  if target_configuration ? 'tierPolicy' then
    perform loyalty_private.validate_tier_policy_v2(target_configuration);
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

create or replace function loyalty_private.materialize_advanced_tier_policy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_policy jsonb := new.configuration -> 'tierPolicy';
begin
  if old.status <> 'draft'
    or new.status not in ('published', 'scheduled')
    or target_policy is null then
    return new;
  end if;
  perform loyalty_private.validate_tier_policy_v2(new.configuration);
  insert into loyalty.programme_tier_policies (
    organization_id, programme_group_id, programme_version_id,
    qualification_period_kind, rolling_days, calendar_timezone,
    downgrade_grace_days
  ) values (
    new.organization_id, new.programme_group_id, new.id,
    target_policy -> 'qualificationPeriod' ->> 'kind',
    case when target_policy -> 'qualificationPeriod' ->> 'kind' = 'rolling_days'
      then (target_policy -> 'qualificationPeriod' ->> 'days')::integer end,
    case when target_policy -> 'qualificationPeriod' ->> 'kind' = 'calendar_year'
      then target_policy -> 'qualificationPeriod' ->> 'timeZone' end,
    (target_policy ->> 'downgradeGraceDays')::integer
  );

  insert into loyalty.programme_tier_policy_levels (
    organization_id, programme_group_id, programme_version_id, tier_code,
    ordinal, entry_operator, retention_operator, reentry_operator,
    earning_multiplier_basis_points, reward_codes, early_access
  )
  select new.organization_id, new.programme_group_id, new.id,
    level.value ->> 'tierCode', level.ordinality::smallint,
    level.value -> 'entry' ->> 'operator',
    level.value -> 'retention' ->> 'operator',
    level.value -> 'reentry' ->> 'operator',
    (level.value -> 'benefits' ->> 'earningMultiplierBasisPoints')::integer,
    array(
      select jsonb_array_elements_text(level.value -> 'benefits' -> 'rewardCodes')
    ),
    (level.value -> 'benefits' ->> 'earlyAccess')::boolean
  from jsonb_array_elements(target_policy -> 'levels')
    with ordinality as level(value, ordinality);

  insert into loyalty.programme_tier_thresholds (
    organization_id, programme_group_id, programme_version_id, tier_code,
    threshold_kind, ordinal, metric, minimum_value, activity_codes
  )
  select new.organization_id, new.programme_group_id, new.id,
    level.value ->> 'tierCode', expression.kind,
    threshold.ordinality::smallint, threshold.value ->> 'metric',
    (threshold.value ->> 'minimum')::bigint,
    array(select jsonb_array_elements_text(threshold.value -> 'activityCodes'))
  from jsonb_array_elements(target_policy -> 'levels') as level(value)
  cross join lateral (
    values
      ('entry'::text, level.value -> 'entry'),
      ('retention'::text, level.value -> 'retention'),
      ('reentry'::text, level.value -> 'reentry')
  ) as expression(kind, value)
  cross join lateral jsonb_array_elements(expression.value -> 'thresholds')
    with ordinality as threshold(value, ordinality)
  where expression.value <> 'null'::jsonb;
  return new;
end;
$$;

create trigger programme_versions_advanced_tier_contract
before insert or update of status on loyalty.programme_versions
for each row execute function loyalty_private.enforce_advanced_tier_contract();
create trigger programme_versions_materialize_advanced_tier_policy
after update of status on loyalty.programme_versions
for each row execute function loyalty_private.materialize_advanced_tier_policy();

alter function loyalty_private.validate_programme_definition_v2_core(jsonb)
  owner to loyalty_owner;
alter function loyalty_private.validate_tier_policy_v2(jsonb) owner to loyalty_owner;
alter function loyalty_private.validate_programme_definition_v2(jsonb) owner to loyalty_owner;
alter function loyalty_private.enforce_advanced_tier_contract() owner to loyalty_owner;
alter function loyalty_private.materialize_advanced_tier_policy() owner to loyalty_owner;

alter table loyalty.programme_tier_policies enable row level security;
alter table loyalty.programme_tier_policy_levels enable row level security;
alter table loyalty.programme_tier_thresholds enable row level security;
create policy programme_tier_policies_member_select
  on loyalty.programme_tier_policies for select to authenticated
  using ((select loyalty_private.is_organization_member(organization_id)));
create policy programme_tier_policy_levels_member_select
  on loyalty.programme_tier_policy_levels for select to authenticated
  using ((select loyalty_private.is_organization_member(organization_id)));
create policy programme_tier_thresholds_member_select
  on loyalty.programme_tier_thresholds for select to authenticated
  using ((select loyalty_private.is_organization_member(organization_id)));
create policy programme_tier_policies_worker_select
  on loyalty.programme_tier_policies for select to loyalty_worker using (true);
create policy programme_tier_policy_levels_worker_select
  on loyalty.programme_tier_policy_levels for select to loyalty_worker using (true);
create policy programme_tier_thresholds_worker_select
  on loyalty.programme_tier_thresholds for select to loyalty_worker using (true);

revoke all on loyalty.programme_tier_policies,
  loyalty.programme_tier_policy_levels, loyalty.programme_tier_thresholds
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant select on loyalty.programme_tier_policies,
  loyalty.programme_tier_policy_levels, loyalty.programme_tier_thresholds
  to authenticated, loyalty_worker;

revoke all on function
  loyalty_private.validate_programme_definition_v2_core(jsonb),
  loyalty_private.validate_tier_policy_v2(jsonb),
  loyalty_private.validate_programme_definition_v2(jsonb),
  loyalty_private.enforce_advanced_tier_contract(),
  loyalty_private.materialize_advanced_tier_policy()
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

comment on table loyalty.programme_tier_policies is
  'Immutable advanced qualification window and grace policy materialized from an approved ProgrammeDefinitionV2.';
comment on table loyalty.programme_tier_policy_levels is
  'Immutable ordered tier lifecycle operators and benefit references for an advanced policy.';
comment on table loyalty.programme_tier_thresholds is
  'Immutable exact entry retention and re-entry thresholds evaluated from authoritative member facts.';
comment on function loyalty_private.validate_tier_policy_v2(jsonb) is
  'Independent fail-closed PostgreSQL validation for the strict TierPolicyV2 contract.';
