-- M09 follow-up: an additive guest-safe public VIP catalogue that preserves
-- the V1/V2 projections while representing advanced qualification truth.

create or replace function loyalty.get_public_loyalty_experience_v3(
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
  vip_catalogue jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with public_document as materialized (
    select *
    from loyalty.get_public_loyalty_experience_v2(
      target_workspace_public_id,
      target_programme_public_id
    )
  ), exact_scope as materialized (
    select
      document.*,
      workspace.organization_id,
      programme_group.id as programme_group_id,
      programme.id as programme_id,
      version.id as programme_version_id
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
  ), safe_tiers as materialized (
    select
      tier.code,
      tier.name,
      tier.ordinal,
      tier.minimum_eligible_spend_minor,
      tier.points_per_major_unit,
      policy.id as policy_id,
      policy.qualification_period_kind,
      policy.rolling_days,
      policy.calendar_timezone,
      policy.downgrade_grace_days,
      level.id as level_id,
      level.entry_operator,
      level.early_access,
      level.reward_codes,
      scope.organization_id,
      scope.programme_version_id
    from exact_scope as scope
    join loyalty.programme_tiers as tier
      on tier.organization_id = scope.organization_id
     and tier.programme_version_id = scope.programme_version_id
    left join loyalty.programme_tier_policies as policy
      on policy.organization_id = scope.organization_id
     and policy.programme_version_id = scope.programme_version_id
    left join loyalty.programme_tier_policy_levels as level
      on level.organization_id = scope.organization_id
     and level.programme_version_id = scope.programme_version_id
     and level.tier_code = tier.code
    where tier.name !~ '[[:cntrl:]<>]'
    order by tier.ordinal
    limit 15
  )
  select
    scope.workspace_public_id,
    scope.programme_public_id,
    scope.programme_group_public_id,
    scope.programme_name,
    scope.requested_locale,
    scope.resolved_locale,
    scope.presentation,
    coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'code', tier.code,
          'name', tier.name,
          'minimumEligibleSpendMinor', tier.minimum_eligible_spend_minor::text,
          'pointsPerMajorUnit', tier.points_per_major_unit::text
        ) order by tier.ordinal
      )
      from safe_tiers as tier
    ), '[]'::jsonb),
    scope.rewards,
    pg_catalog.jsonb_build_object(
      'version', '1',
      'qualificationPeriod', case
        when policy.qualification_period_kind = 'rolling_days' then
          pg_catalog.jsonb_build_object(
            'kind', 'rolling_days',
            'days', policy.rolling_days
          )
        when policy.qualification_period_kind = 'calendar_year' then
          pg_catalog.jsonb_build_object(
            'kind', 'calendar_year',
            'timeZone', policy.calendar_timezone
          )
        else pg_catalog.jsonb_build_object('kind', 'lifetime')
      end,
      'downgradeGraceDays', case
        when policy.policy_id is null then 0
        else policy.downgrade_grace_days
      end,
      'levels', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'code', tier.code,
            'name', tier.name,
            'entry', case
              when tier.ordinal = 1 then null
              when tier.policy_id is null then
                pg_catalog.jsonb_build_object(
                  'operator', 'all',
                  'thresholds', pg_catalog.jsonb_build_array(
                    pg_catalog.jsonb_build_object(
                      'metric', 'eligible_spend',
                      'minimum', tier.minimum_eligible_spend_minor::text
                    )
                  )
                )
              when tier.level_id is null then null
              else pg_catalog.jsonb_build_object(
                'operator', tier.entry_operator,
                'thresholds', coalesce((
                  select pg_catalog.jsonb_agg(
                    pg_catalog.jsonb_build_object(
                      'metric', threshold.metric,
                      'minimum', threshold.minimum_value::text
                    ) order by threshold.ordinal
                  )
                  from loyalty.programme_tier_thresholds as threshold
                  where threshold.organization_id = tier.organization_id
                    and threshold.programme_version_id = tier.programme_version_id
                    and threshold.tier_code = tier.code
                    and threshold.threshold_kind = 'entry'
                ), '[]'::jsonb)
              )
            end,
            'pointsPerMajorUnit', tier.points_per_major_unit::text,
            'earlyAccess', case
              when tier.policy_id is null then false
              else tier.early_access
            end,
            'exclusiveRewardAccess', case
              when tier.policy_id is null then false
              when tier.reward_codes is null then null
              else pg_catalog.cardinality(tier.reward_codes) > 0
            end
          ) order by tier.ordinal
        )
        from safe_tiers as tier
      ), '[]'::jsonb)
    )
  from exact_scope as scope
  left join lateral (
    select tier.*
    from safe_tiers as tier
    order by tier.ordinal
    limit 1
  ) as policy on true;
$$;

alter function loyalty.get_public_loyalty_experience_v3(uuid, uuid)
  owner to loyalty_owner;
revoke all on function loyalty.get_public_loyalty_experience_v3(uuid, uuid)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty.get_public_loyalty_experience_v3(uuid, uuid)
  to anon, authenticated;

comment on function loyalty.get_public_loyalty_experience_v3(uuid, uuid) is
  'Returns one bounded English guest catalogue with exact published advanced VIP entry criteria and public benefit flags; accepts no tenant, customer, identity, or value authority.';
