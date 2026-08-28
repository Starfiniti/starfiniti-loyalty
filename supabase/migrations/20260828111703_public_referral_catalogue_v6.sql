-- M06/M09 follow-up: publish only immutable programme-level referral terms.
-- Customer links, progress, identity, risk, and value authority stay on the
-- existing Auth-derived no-selector boundary. V1-V5 remain available for
-- rolling compatibility.

create or replace function loyalty.get_public_loyalty_experience_v6(
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
  vip_catalogue jsonb,
  earning_methods jsonb,
  reward_catalogue jsonb,
  referral_catalogue jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with public_document as materialized (
    select *
    from loyalty.get_public_loyalty_experience_v5(
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
      case when version.configuration ->> 'currencyCode' ~ '^[A-Z]{3}$'
        then version.configuration ->> 'currencyCode' else null end
        as currency_code,
      case when loyalty_private.try_parse_public_integer(
        version.configuration ->> 'currencyMinorUnitDigits'
      ) between 0 and 6 then loyalty_private.try_parse_public_integer(
        version.configuration ->> 'currencyMinorUnitDigits'
      ) else null end as currency_minor_unit_digits
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
     and version.programme_group_id = programme.programme_group_id
     and version.programme_id = programme.id
     and version.status = 'published'
    order by version.version_number desc, version.id desc
    limit 1
  ), referral_scope as materialized (
    select
      scope.*,
      policy.id as referral_policy_id,
      policy.attribution_window_days,
      policy.cooling_days,
      policy.minimum_eligible_spend_minor,
      policy.require_new_customer,
      policy.monthly_advocate_referral_limit,
      policy.advocate_reward_points,
      policy.friend_reward_points,
      entitlement.enabled as referral_enabled
    from exact_scope as scope
    left join loyalty.programme_referral_policies as policy
      on policy.organization_id = scope.organization_id
     and policy.programme_group_id = scope.programme_group_id
     and policy.programme_version_id = scope.programme_version_id
    cross join lateral loyalty_private.resolve_organization_entitlement(
      scope.organization_id,
      'referrals',
      'programme:' || scope.programme_id::text,
      pg_catalog.statement_timestamp()
    ) as entitlement
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
    scope.vip_catalogue,
    scope.earning_methods,
    scope.reward_catalogue,
    case
      when scope.referral_policy_id is null then pg_catalog.jsonb_build_object(
        'version', '1',
        'state', 'unavailable'
      )
      when not scope.referral_enabled then pg_catalog.jsonb_build_object(
        'version', '1',
        'state', 'paused'
      )
      else pg_catalog.jsonb_build_object(
        'version', '1',
        'state', 'available',
        'advocateRewardPoints', scope.advocate_reward_points::text,
        'friendRewardPoints', scope.friend_reward_points::text,
        'minimumEligibleSpendMinor',
          scope.minimum_eligible_spend_minor::text,
        'currency', pg_catalog.jsonb_build_object(
          'code', scope.currency_code,
          'minorUnitDigits', scope.currency_minor_unit_digits
        ),
        'attributionWindowDays', scope.attribution_window_days,
        'coolingDays', scope.cooling_days,
        'qualification', 'first_eligible_purchase',
        'newCustomersOnly', scope.require_new_customer,
        'monthlyLimitApplies',
          scope.monthly_advocate_referral_limit is not null
      )
    end as referral_catalogue
  from referral_scope as scope
  where scope.referral_policy_id is null
     or not scope.referral_enabled
     or (
       scope.currency_code is not null
       and scope.currency_minor_unit_digits is not null
       and scope.require_new_customer
       and scope.monthly_advocate_referral_limit is not null
     );
$$;

alter function loyalty.get_public_loyalty_experience_v6(uuid, uuid)
  owner to loyalty_owner;
revoke all on function loyalty.get_public_loyalty_experience_v6(uuid, uuid)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty.get_public_loyalty_experience_v6(uuid, uuid)
  to anon, authenticated;

comment on function loyalty.get_public_loyalty_experience_v6(uuid, uuid) is
  'Returns one bounded English guest referral catalogue derived from the immutable published policy and server rollout state; excludes customer links, identities, orders, history, risk evidence, internal selectors, exact caps, and value authority.';
