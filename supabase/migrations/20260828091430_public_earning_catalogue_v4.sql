-- M03/M09 follow-up: guest-safe earning discovery derived from the immutable
-- published rule version. V1-V3 remain available for rolling compatibility.

create or replace function loyalty_private.try_parse_public_timestamptz(
  target_value text
)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
begin
  if target_value is null
    or pg_catalog.length(target_value) not between 1 and 64
    or target_value !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$' then
    return null;
  end if;
  return target_value::timestamptz;
exception when others then
  return null;
end;
$$;

alter function loyalty_private.try_parse_public_timestamptz(text)
  owner to loyalty_owner;
revoke all on function loyalty_private.try_parse_public_timestamptz(text)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

create or replace function loyalty_private.try_parse_public_integer(
  target_value text
)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
begin
  if target_value is null
    or target_value !~ '^[0-9]{1,6}$' then
    return null;
  end if;
  return target_value::integer;
exception when others then
  return null;
end;
$$;

alter function loyalty_private.try_parse_public_integer(text)
  owner to loyalty_owner;
revoke all on function loyalty_private.try_parse_public_integer(text)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

create or replace function loyalty.get_public_loyalty_experience_v4(
  target_workspace_public_id uuid,
  target_programme_public_id uuid
)
returns table (
  workspace_public_id uuid,
  programme_public_id uuid,
  programme_group_public_id uuid,
  programme_name text,
  requested_locale text,
  resolved_locale text,
  presentation jsonb,
  tiers jsonb,
  rewards jsonb,
  vip_catalogue jsonb,
  earning_methods jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with public_document as materialized (
    select *
    from loyalty.get_public_loyalty_experience_v3(
      target_workspace_public_id,
      target_programme_public_id
    )
  ), exact_scope as materialized (
    select
      document.*,
      workspace.organization_id,
      programme_group.id as programme_group_id,
      programme.id as programme_id,
      version.id as programme_version_id,
      version.configuration ->> 'version' as configuration_version
    from public_document as document
    join loyalty.workspaces as workspace
      on workspace.public_id = document.workspace_public_id
     and workspace.status = 'active'
    join loyalty.programme_groups as programme_group
      on programme_group.organization_id = workspace.organization_id
     and programme_group.public_id = document.programme_group_public_id
     and programme_group.status = 'active'
    join loyalty.programme_group_workspaces as group_workspace
      on group_workspace.organization_id = workspace.organization_id
     and group_workspace.workspace_id = workspace.id
     and group_workspace.programme_group_id = programme_group.id
    join loyalty.programmes as programme
      on programme.organization_id = programme_group.organization_id
     and programme.programme_group_id = programme_group.id
     and programme.public_id = document.programme_public_id
     and programme.status = 'active'
    join loyalty.programme_versions as version
      on version.organization_id = programme.organization_id
     and version.programme_id = programme.id
     and version.status = 'published'
    limit 1
  ), rule_candidates as materialized (
    select
      rule.ordinal,
      rule.source,
      rule.purchase_exclusions,
      rule.conditions,
      rule.cap,
      case
        when rule.effect_kind = 'base_rate'
          and rule.source = 'purchase'
          and pg_catalog.jsonb_typeof(rule.effect) = 'object'
          and rule.effect ?& array['kind', 'pointsPerMajorUnit']
          and rule.effect - array['kind', 'pointsPerMajorUnit'] = '{}'::jsonb
          and rule.effect ->> 'kind' = 'base_rate'
          and coalesce(rule.effect ->> 'pointsPerMajorUnit', '')
            ~ '^[1-9][0-9]{0,18}$'
          and (
            pg_catalog.length(rule.effect ->> 'pointsPerMajorUnit') < 19
            or rule.effect ->> 'pointsPerMajorUnit' <= '9223372036854775807'
          ) then pg_catalog.jsonb_build_object(
            'kind', 'base_rate',
            'pointsPerMajorUnit', rule.effect ->> 'pointsPerMajorUnit'
          )
        when rule.effect_kind = 'multiplier'
          and rule.source = 'purchase'
          and pg_catalog.jsonb_typeof(rule.effect) = 'object'
          and rule.effect ?& array['kind', 'multiplierBasisPoints']
          and rule.effect - array['kind', 'multiplierBasisPoints'] = '{}'::jsonb
          and rule.effect ->> 'kind' = 'multiplier'
          and pg_catalog.jsonb_typeof(rule.effect -> 'multiplierBasisPoints') = 'number'
          and loyalty_private.try_parse_public_integer(
            rule.effect ->> 'multiplierBasisPoints'
          )
            between 10001 and 100000 then pg_catalog.jsonb_build_object(
              'kind', 'multiplier',
              'multiplierBasisPoints',
                loyalty_private.try_parse_public_integer(
                  rule.effect ->> 'multiplierBasisPoints'
                )
            )
        when rule.effect_kind = 'fixed_bonus'
          and pg_catalog.jsonb_typeof(rule.effect) = 'object'
          and rule.effect ?& array['kind', 'points']
          and rule.effect - array['kind', 'points'] = '{}'::jsonb
          and rule.effect ->> 'kind' = 'fixed_bonus'
          and coalesce(rule.effect ->> 'points', '') ~ '^[1-9][0-9]{0,18}$'
          and (
            pg_catalog.length(rule.effect ->> 'points') < 19
            or rule.effect ->> 'points' <= '9223372036854775807'
          ) then pg_catalog.jsonb_build_object(
            'kind', 'fixed_bonus',
            'points', rule.effect ->> 'points'
          )
        else null
      end as public_effect,
      case
        when pg_catalog.jsonb_typeof(rule.conditions) = 'object'
          and rule.conditions ?& array['startsAt', 'endsAt']
          and pg_catalog.jsonb_typeof(rule.conditions -> 'startsAt') in ('string', 'null')
          and pg_catalog.jsonb_typeof(rule.conditions -> 'endsAt') in ('string', 'null')
          and (
            rule.conditions -> 'startsAt' = 'null'::jsonb
            or loyalty_private.try_parse_public_timestamptz(
              rule.conditions ->> 'startsAt'
            ) is not null
          )
          and (
            rule.conditions -> 'endsAt' = 'null'::jsonb
            or loyalty_private.try_parse_public_timestamptz(
              rule.conditions ->> 'endsAt'
            ) is not null
          ) then true
        else false
      end as safe_schedule,
      case when rule.conditions -> 'startsAt' = 'null'::jsonb then null
        else loyalty_private.try_parse_public_timestamptz(
          rule.conditions ->> 'startsAt'
        ) end as starts_at,
      case when rule.conditions -> 'endsAt' = 'null'::jsonb then null
        else loyalty_private.try_parse_public_timestamptz(
          rule.conditions ->> 'endsAt'
        ) end as ends_at
    from exact_scope as scope
    join loyalty.programme_earning_rules as rule
      on rule.organization_id = scope.organization_id
     and rule.programme_version_id = scope.programme_version_id
    where rule.enabled
      and rule.source in (
        'purchase', 'account_created', 'birthday',
        'verified_product_review', 'referral'
      )
    order by rule.ordinal
  ), safe_rules as materialized (
    select candidate.*
    from rule_candidates as candidate
    where candidate.public_effect is not null
      and candidate.safe_schedule
      and (candidate.ends_at is null
        or candidate.ends_at > pg_catalog.statement_timestamp())
      and (candidate.starts_at is null or candidate.ends_at is null
        or candidate.starts_at < candidate.ends_at)
    order by candidate.ordinal
    limit 12
  ), public_methods as (
    select
      rule.ordinal::integer as ordinal,
      pg_catalog.jsonb_build_object(
        'code', rule.source || '-' || rule.ordinal::text,
        'name', case
          when rule.source = 'purchase'
            and rule.public_effect ->> 'kind' = 'base_rate'
            then 'Eligible purchases'
          when rule.source = 'purchase'
            and rule.public_effect ->> 'kind' = 'multiplier'
            then 'Purchase multiplier'
          when rule.source = 'purchase' then 'Purchase bonus'
          when rule.source = 'account_created' then 'Create your account'
          when rule.source = 'birthday' then 'Birthday bonus'
          when rule.source = 'verified_product_review'
            then 'Verified product review'
          else 'Refer a friend'
        end,
        'source', rule.source,
        'effect', rule.public_effect,
        'hasRestrictions',
          rule.purchase_exclusions is not null
          or rule.conditions <> pg_catalog.jsonb_build_object(
            'productIds', '[]'::jsonb,
            'categoryIds', '[]'::jsonb,
            'currencyCodes', '[]'::jsonb,
            'markets', '[]'::jsonb,
            'channels', '[]'::jsonb,
            'activityCodes', '[]'::jsonb,
            'segmentCodes', '[]'::jsonb,
            'tierCodes', '[]'::jsonb,
            'startsAt', null,
            'endsAt', null
          )
          or rule.cap <> pg_catalog.jsonb_build_object(
            'perEventPoints', null,
            'perMemberPoints', null,
            'memberPeriod', null,
            'rollingDays', null
          ),
        'startsAt', rule.starts_at,
        'endsAt', rule.ends_at,
        'availableNow',
          (rule.starts_at is null
            or rule.starts_at <= pg_catalog.statement_timestamp())
          and (rule.ends_at is null
            or rule.ends_at > pg_catalog.statement_timestamp())
      ) as method
    from safe_rules as rule
    union all
    select
      32767,
      pg_catalog.jsonb_build_object(
        'code', 'eligible-purchases',
        'name', 'Eligible purchases',
        'source', 'purchase',
        'effect', pg_catalog.jsonb_build_object(
          'kind', 'base_rate',
          'pointsPerMajorUnit', scope.tiers -> 0 ->> 'pointsPerMajorUnit'
        ),
        'hasRestrictions', true,
        'startsAt', null,
        'endsAt', null,
        'availableNow', true
      )
    from exact_scope as scope
    where scope.configuration_version is distinct from '2'
      and pg_catalog.jsonb_array_length(scope.tiers) > 0
      and not exists (select 1 from safe_rules)
  )
  select
    scope.workspace_public_id,
    scope.programme_public_id,
    scope.programme_group_public_id,
    scope.programme_name,
    scope.requested_locale,
    scope.resolved_locale,
    scope.presentation,
    scope.tiers,
    scope.rewards,
    scope.vip_catalogue,
    coalesce((
      select pg_catalog.jsonb_agg(method.method order by method.ordinal)
      from public_methods as method
    ), '[]'::jsonb)
  from exact_scope as scope;
$$;

alter function loyalty.get_public_loyalty_experience_v4(uuid, uuid)
  owner to loyalty_owner;
revoke all on function loyalty.get_public_loyalty_experience_v4(uuid, uuid)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty.get_public_loyalty_experience_v4(uuid, uuid)
  to anon, authenticated;

comment on function loyalty_private.try_parse_public_timestamptz(text) is
  'Fail-closed bounded ISO timestamp parser used only while minimizing public projections.';
comment on function loyalty_private.try_parse_public_integer(text) is
  'Fail-closed bounded integer parser used only while minimizing public projections.';
comment on function loyalty.get_public_loyalty_experience_v4(uuid, uuid) is
  'Returns one bounded English guest catalogue with public standard earning methods; excludes raw selectors, caps, custom activities, customer state, and tenant authority.';
