-- M10-S02B: minimized reward, tier, referral, and campaign outcome truth.
-- Occurrence time selects the cohort; immutable evidence must be known before
-- report as-of. Mutable read models are never used to rewrite historical flow.

create index reward_reservations_analytics_period_idx
  on loyalty.reward_reservations (
    organization_id, programme_group_id, created_at, id
  ) include (cost_points);

create index reward_reservation_transitions_analytics_time_idx
  on loyalty.reward_reservation_transitions (
    organization_id, reservation_id, created_at, id
  ) include (to_state);

create index tier_decisions_analytics_period_idx
  on loyalty.tier_decisions (
    organization_id, programme_group_id, effective_at, created_at, id
  ) include (wallet_id, transition);

create index referral_attributions_analytics_period_idx
  on loyalty.referral_attributions (
    organization_id, programme_group_id, captured_at, created_at, id
  );

create index referral_transitions_analytics_time_idx
  on loyalty.referral_attribution_transitions (
    organization_id, attribution_id, created_at, id
  ) include (to_state);

create index campaign_execution_batches_analytics_period_idx
  on loyalty_private.campaign_execution_batches (
    organization_id, programme_group_id, occurred_at, evaluated_at, id
  ) include (programme_version_id, wallet_id);

create or replace function loyalty.get_analytics_programme_outcomes_v1(
  target_organization_public_id uuid,
  target_workspace_public_id uuid,
  target_programme_group_public_id uuid,
  target_days integer,
  target_as_of timestamptz default now()
)
returns table (
  report_version text,
  dictionary_version text,
  report_as_of timestamptz,
  period_from timestamptz,
  period_to timestamptz,
  range_days integer,
  reward_requests text,
  reward_captures text,
  reward_captured_points text,
  reward_unresolved_at_as_of text,
  reward_maturity_window_hours integer,
  reward_mature_cohort_from timestamptz,
  reward_mature_cohort_to timestamptz,
  reward_mature_requests text,
  reward_mature_captures text,
  reward_mature_unresolved text,
  reward_mature_capture_rate_basis_points text,
  tier_decisions text,
  tier_moved_members text,
  tier_entry text,
  tier_reentry text,
  tier_upgrade text,
  tier_grace text,
  tier_downgrade text,
  tier_manual text,
  tier_none text,
  referral_active_advocates text,
  referral_attributions text,
  referral_pending text,
  referral_qualified text,
  referral_rejected text,
  referral_reversed text,
  referral_qualification_rate_basis_points text,
  referral_issuances text,
  referral_compensations text,
  referral_advocate_points_issued text,
  referral_friend_points_issued text,
  referral_advocate_points_reversed text,
  referral_friend_points_reversed text,
  referral_advocate_points_net text,
  referral_friend_points_net text,
  campaign_currency_status text,
  campaign_currency_code text,
  campaign_currency_minor_unit_digits integer,
  campaign_currency_reason text,
  campaign_treatment_outcomes text,
  campaign_control_outcomes text,
  campaign_capacity_exhausted text,
  campaign_suppressed text,
  campaign_influenced_orders text,
  campaign_influenced_members text,
  campaign_influenced_eligible_spend_minor text,
  campaign_points_awarded_gross text,
  campaign_points_reversed text,
  campaign_points_net text,
  campaign_rewards_reserved text,
  campaign_manual_review_jobs text,
  campaign_incrementality_status text,
  campaign_incrementality_reason text,
  campaign_incremental_revenue_minor text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  selected_organization_id bigint;
  selected_programme_group_id bigint;
  analytics_enabled boolean;
  selected_period_from timestamptz;
  reward_maturity_window constant interval := interval '24 hours';
begin
  if target_organization_public_id is null
    or target_workspace_public_id is null
    or target_programme_group_public_id is null
    or target_days is null
    or target_days not in (7, 30, 90)
    or target_as_of is null
    or not pg_catalog.isfinite(target_as_of) then
    raise exception using
      errcode = '22023',
      message = 'invalid analytics programme outcome request';
  end if;

  select organization.id, programme_group.id
  into selected_organization_id, selected_programme_group_id
  from loyalty.organizations as organization
  join loyalty.workspaces as workspace
    on workspace.organization_id = organization.id
   and workspace.public_id = target_workspace_public_id
   and workspace.status = 'active'
  join loyalty.programme_groups as programme_group
    on programme_group.organization_id = organization.id
   and programme_group.public_id = target_programme_group_public_id
   and programme_group.status = 'active'
  join loyalty.programme_group_workspaces as group_workspace
    on group_workspace.organization_id = organization.id
   and group_workspace.programme_group_id = programme_group.id
   and group_workspace.workspace_id = workspace.id
  where organization.public_id = target_organization_public_id
    and organization.status = 'active'
    and loyalty_private.is_organization_member(organization.id);

  if not found then
    return;
  end if;

  select entitlement.enabled
  into analytics_enabled
  from loyalty_private.resolve_organization_entitlement(
    selected_organization_id,
    'analytics',
    target_organization_public_id::text,
    now()
  ) as entitlement;

  if not coalesce(analytics_enabled, false) then
    raise exception using
      errcode = '42501',
      message = 'analytics capability disabled';
  end if;

  selected_period_from := target_as_of - target_days * interval '1 day';

  if exists (
    select 1
    from loyalty_private.campaign_execution_batches as batch
    join loyalty_private.campaign_effects as effect
      on effect.organization_id = batch.organization_id
     and effect.execution_batch_id = batch.id
     and effect.decision_outcome = 'awarded'
    join loyalty.programme_versions as version
      on version.organization_id = batch.organization_id
     and version.id = batch.programme_version_id
    where batch.organization_id = selected_organization_id
      and batch.programme_group_id = selected_programme_group_id
      and batch.occurred_at >= selected_period_from
      and batch.occurred_at < target_as_of
      and batch.evaluated_at < target_as_of
      and effect.created_at < target_as_of
      and (
        coalesce(batch.baseline_result ->> 'eligibleSpendMinor', '')
          !~ '^(0|[1-9][0-9]{0,30})$'
        or coalesce(version.configuration ->> 'currencyCode', '')
          !~ '^[A-Z]{3}$'
        or (
          version.configuration ->> 'version' = '2'
          and coalesce(
            version.configuration ->> 'currencyMinorUnitDigits', ''
          ) !~ '^[0-6]$'
        )
        or (
          coalesce(version.configuration ->> 'version', '1') = '1'
          and coalesce(version.configuration ->> 'minorUnitsPerMajor', '')
            !~ '^(1|10|100|1000|10000|100000|1000000)$'
        )
      )
  ) then
    raise exception using
      errcode = '55000',
      message = 'analytics campaign purchase evidence invalid';
  end if;

  return query
  with scoped_versions as materialized (
    select version.id,
      case
        when version.configuration ->> 'currencyCode' ~ '^[A-Z]{3}$'
          then version.configuration ->> 'currencyCode'
        else null
      end as currency_code,
      case
        when version.configuration ->> 'version' = '2'
          and version.configuration ->> 'currencyMinorUnitDigits' ~ '^[0-6]$'
          then (version.configuration ->> 'currencyMinorUnitDigits')::integer
        when coalesce(version.configuration ->> 'version', '1') = '1'
          then case version.configuration ->> 'minorUnitsPerMajor'
            when '1' then 0 when '10' then 1 when '100' then 2
            when '1000' then 3 when '10000' then 4
            when '100000' then 5 when '1000000' then 6 else null
          end
        else null
      end as minor_unit_digits,
      version.status, version.published_at
    from loyalty.programme_versions as version
    where version.organization_id = selected_organization_id
      and version.programme_group_id = selected_programme_group_id
  ), scoped_reward_requests as materialized (
    select reservation.id, reservation.cost_points, reservation.created_at
    from loyalty.reward_reservations as reservation
    where reservation.organization_id = selected_organization_id
      and reservation.programme_group_id = selected_programme_group_id
      and reservation.created_at < target_as_of
  ), reward_latest as materialized (
    select request.id, request.cost_points, request.created_at,
      coalesce(latest.to_state, 'requested') as latest_state
    from scoped_reward_requests as request
    left join lateral (
      select transition.to_state
      from loyalty.reward_reservation_transitions as transition
      where transition.organization_id = selected_organization_id
        and transition.reservation_id = request.id
        and transition.created_at < target_as_of
      order by transition.created_at desc, transition.id desc
      limit 1
    ) as latest on true
  ), reward_period as (
    select count(*)::numeric as request_count
    from scoped_reward_requests as request
    where request.created_at >= selected_period_from
  ), reward_capture_period as (
    select count(*)::numeric as capture_count,
      coalesce(sum(request.cost_points), 0::numeric) as captured_points
    from loyalty.reward_reservation_transitions as transition
    join scoped_reward_requests as request
      on request.id = transition.reservation_id
    where transition.organization_id = selected_organization_id
      and transition.to_state = 'captured'
      and transition.created_at >= selected_period_from
      and transition.created_at < target_as_of
  ), reward_unresolved as (
    select count(*) filter (
      where reward.latest_state in ('requested', 'reserved', 'issued')
    )::numeric as unresolved_count
    from reward_latest as reward
  ), mature_reward_rows as materialized (
    select request.id,
      exists (
        select 1
        from loyalty.reward_reservation_transitions as transition
        where transition.organization_id = selected_organization_id
          and transition.reservation_id = request.id
          and transition.to_state = 'captured'
          and transition.created_at <=
            request.created_at + reward_maturity_window
          and transition.created_at < target_as_of
      ) as captured_in_window,
      coalesce(deadline_state.to_state, 'requested') as state_at_deadline
    from scoped_reward_requests as request
    left join lateral (
      select transition.to_state
      from loyalty.reward_reservation_transitions as transition
      where transition.organization_id = selected_organization_id
        and transition.reservation_id = request.id
        and transition.created_at <=
          request.created_at + reward_maturity_window
        and transition.created_at < target_as_of
      order by transition.created_at desc, transition.id desc
      limit 1
    ) as deadline_state on true
    where request.created_at >=
        selected_period_from - reward_maturity_window
      and request.created_at < target_as_of - reward_maturity_window
  ), mature_reward_totals as (
    select count(*)::numeric as request_count,
      count(*) filter (where row.captured_in_window)::numeric as capture_count,
      count(*) filter (
        where row.state_at_deadline in ('requested', 'reserved', 'issued')
      )::numeric as unresolved_count
    from mature_reward_rows as row
  ), period_tier_decisions as materialized (
    select decision.wallet_id, decision.transition
    from loyalty.tier_decisions as decision
    where decision.organization_id = selected_organization_id
      and decision.programme_group_id = selected_programme_group_id
      and decision.effective_at >= selected_period_from
      and decision.effective_at < target_as_of
      and decision.created_at < target_as_of
  ), tier_totals as (
    select count(*)::numeric as decision_count,
      count(distinct decision.wallet_id) filter (
        where decision.transition <> 'none'
      )::numeric as moved_members,
      count(*) filter (where decision.transition = 'entry')::numeric
        as entry_count,
      count(*) filter (where decision.transition = 'reentry')::numeric
        as reentry_count,
      count(*) filter (where decision.transition = 'upgrade')::numeric
        as upgrade_count,
      count(*) filter (where decision.transition = 'grace')::numeric
        as grace_count,
      count(*) filter (where decision.transition = 'downgrade')::numeric
        as downgrade_count,
      count(*) filter (where decision.transition = 'manual')::numeric
        as manual_count,
      count(*) filter (where decision.transition = 'none')::numeric
        as none_count
    from period_tier_decisions as decision
  ), scoped_referrals as materialized (
    select attribution.id
    from loyalty.referral_attributions as attribution
    where attribution.organization_id = selected_organization_id
      and attribution.programme_group_id = selected_programme_group_id
      and attribution.captured_at >= selected_period_from
      and attribution.captured_at < target_as_of
      and attribution.created_at < target_as_of
  ), referral_states as materialized (
    select referral.id, latest.to_state as latest_state
    from scoped_referrals as referral
    join lateral (
      select transition.to_state
      from loyalty.referral_attribution_transitions as transition
      where transition.organization_id = selected_organization_id
        and transition.attribution_id = referral.id
        and transition.created_at < target_as_of
      order by transition.created_at desc, transition.id desc
      limit 1
    ) as latest on true
  ), referral_value as materialized (
    select referral.id,
      issuance.id as issuance_id,
      issuance.advocate_points,
      issuance.friend_points,
      compensation.id as compensation_id
    from scoped_referrals as referral
    left join loyalty_private.referral_reward_issuances as issuance
      on issuance.organization_id = selected_organization_id
     and issuance.attribution_id = referral.id
     and issuance.created_at < target_as_of
    left join loyalty_private.referral_reward_compensations as compensation
      on compensation.organization_id = selected_organization_id
     and compensation.attribution_id = referral.id
     and compensation.created_at < target_as_of
  ), referral_totals as (
    select count(*)::numeric as attribution_count,
      count(*) filter (
        where state.latest_state in ('captured', 'pending_review', 'cooling')
      )::numeric as pending_count,
      count(*) filter (where state.latest_state = 'qualified')::numeric
        as qualified_count,
      count(*) filter (
        where state.latest_state in ('blocked', 'rejected')
      )::numeric as rejected_count,
      count(*) filter (where state.latest_state = 'reversed')::numeric
        as reversed_count
    from referral_states as state
  ), referral_value_totals as (
    select count(value.issuance_id)::numeric as issuance_count,
      count(value.compensation_id)::numeric as compensation_count,
      coalesce(sum(value.advocate_points), 0::numeric)
        as advocate_points_issued,
      coalesce(sum(value.friend_points), 0::numeric) as friend_points_issued,
      coalesce(sum(value.advocate_points) filter (
        where value.compensation_id is not null
      ), 0::numeric) as advocate_points_reversed,
      coalesce(sum(value.friend_points) filter (
        where value.compensation_id is not null
      ), 0::numeric) as friend_points_reversed
    from referral_value as value
  ), active_advocates as (
    select count(*)::numeric as advocate_count
    from loyalty.referral_advocates as advocate
    where advocate.organization_id = selected_organization_id
      and advocate.programme_group_id = selected_programme_group_id
      and advocate.created_at < target_as_of
      and (
        advocate.disabled_at is null
        or advocate.disabled_at >= target_as_of
      )
  ), purchase_effect_rows as materialized (
    select effect.id, effect.wallet_id, effect.decision_outcome, effect.points,
      batch.id as batch_id, batch.programme_version_id,
      batch.baseline_result, batch.occurred_at
    from loyalty_private.campaign_effects as effect
    join loyalty_private.campaign_execution_batches as batch
      on batch.organization_id = effect.organization_id
     and batch.id = effect.execution_batch_id
    where effect.organization_id = selected_organization_id
      and effect.programme_group_id = selected_programme_group_id
      and batch.occurred_at >= selected_period_from
      and batch.occurred_at < target_as_of
      and batch.evaluated_at < target_as_of
      and effect.created_at < target_as_of
  ), purchase_campaign_totals as (
    select count(*) filter (
        where effect.decision_outcome = 'awarded'
      )::numeric as treatment_count,
      count(*) filter (
        where effect.decision_outcome = 'control'
      )::numeric as control_count,
      count(*) filter (
        where effect.decision_outcome = 'capacity_exhausted'
      )::numeric as capacity_count,
      count(*) filter (
        where effect.decision_outcome = 'suppressed'
      )::numeric as suppressed_count,
      coalesce(sum(effect.points) filter (
        where effect.decision_outcome = 'awarded'
      ), 0::numeric) as points_awarded
    from purchase_effect_rows as effect
  ), influenced_purchase_batches as materialized (
    select batch.id as batch_id, batch.wallet_id, batch.programme_version_id,
      (batch.baseline_result ->> 'eligibleSpendMinor')::numeric
        as eligible_spend,
      coalesce((
        select max(compensation.cumulative_refunded_eligible_spend_minor)
        from loyalty_private.campaign_purchase_refund_compensations
          as compensation
        join loyalty_private.campaign_effects as compensated_effect
          on compensated_effect.organization_id = compensation.organization_id
         and compensated_effect.id = compensation.campaign_effect_id
        where compensation.organization_id = batch.organization_id
          and compensated_effect.execution_batch_id = batch.id
          and compensation.created_at < target_as_of
      ), 0)::numeric as refunded_spend
    from loyalty_private.campaign_execution_batches as batch
    where batch.organization_id = selected_organization_id
      and batch.programme_group_id = selected_programme_group_id
      and batch.occurred_at >= selected_period_from
      and batch.occurred_at < target_as_of
      and batch.evaluated_at < target_as_of
      and exists (
        select 1
        from loyalty_private.campaign_effects as effect
        where effect.organization_id = batch.organization_id
          and effect.execution_batch_id = batch.id
          and effect.decision_outcome = 'awarded'
          and effect.created_at < target_as_of
      )
  ), trigger_issue_rows as materialized (
    select execution.id, execution.job_id, execution.outcome,
      execution.allocation_id, job.wallet_id
    from loyalty_private.campaign_trigger_executions as execution
    join loyalty_private.campaign_trigger_jobs as job
      on job.organization_id = execution.organization_id
     and job.id = execution.job_id
    where execution.organization_id = selected_organization_id
      and execution.programme_group_id = selected_programme_group_id
      and execution.origin_execution_id is null
      and execution.occurred_at >= selected_period_from
      and execution.occurred_at < target_as_of
      and execution.executed_at < target_as_of
  ), trigger_issue_totals as (
    select count(*) filter (
        where issue.outcome in ('points_awarded', 'reward_reserved')
      )::numeric as treatment_count,
      count(*) filter (where issue.outcome = 'control')::numeric
        as control_count,
      count(*) filter (
        where issue.outcome = 'capacity_exhausted'
      )::numeric as capacity_count,
      count(*) filter (where issue.outcome = 'reward_reserved')::numeric
        as reward_count,
      coalesce(sum(allocation.points) filter (
        where issue.outcome = 'points_awarded'
      ), 0::numeric) as points_awarded
    from trigger_issue_rows as issue
    left join loyalty_private.campaign_capacity_allocations as allocation
      on allocation.organization_id = selected_organization_id
     and allocation.id = issue.allocation_id
  ), purchase_campaign_reversals as (
    select coalesce(sum(compensation.reversal_points), 0::numeric)
      as reversal_points
    from loyalty_private.campaign_purchase_refund_compensations
      as compensation
    join purchase_effect_rows as effect
      on effect.id = compensation.campaign_effect_id
    where compensation.organization_id = selected_organization_id
      and compensation.created_at < target_as_of
  ), trigger_reversal_rows as materialized (
    select origin.job_id, origin.allocation_id
    from loyalty_private.campaign_trigger_executions as reversal
    join loyalty_private.campaign_trigger_executions as origin
      on origin.organization_id = reversal.organization_id
     and origin.id = reversal.origin_execution_id
    where reversal.organization_id = selected_organization_id
      and reversal.programme_group_id = selected_programme_group_id
      and reversal.outcome = 'points_reversed'
      and reversal.executed_at < target_as_of
      and origin.occurred_at >= selected_period_from
      and origin.occurred_at < target_as_of
  ), trigger_reversal_totals as (
    select coalesce(sum(allocation.points), 0::numeric) as reversal_points
    from trigger_reversal_rows as reversal
    join loyalty_private.campaign_capacity_allocations as allocation
      on allocation.organization_id = selected_organization_id
     and allocation.id = reversal.allocation_id
  ), campaign_manual_review as (
    select count(*)::numeric as job_count
    from loyalty_private.campaign_trigger_jobs as job
    join lateral (
      select attempt.outcome
      from loyalty_private.campaign_trigger_job_attempts as attempt
      where attempt.organization_id = job.organization_id
        and attempt.job_id = job.id
        and attempt.created_at < target_as_of
      order by attempt.created_at desc, attempt.id desc
      limit 1
    ) as latest on latest.outcome = 'manual_review'
    where job.organization_id = selected_organization_id
      and job.programme_group_id = selected_programme_group_id
      and job.created_at < target_as_of
  ), influenced_members as (
    select count(distinct member.wallet_id)::numeric as member_count
    from (
      select effect.wallet_id
      from purchase_effect_rows as effect
      where effect.decision_outcome = 'awarded'
      union
      select issue.wallet_id
      from trigger_issue_rows as issue
      where issue.outcome in ('points_awarded', 'reward_reserved')
    ) as member
  ), influenced_purchase_totals as (
    select count(*)::numeric as order_count,
      coalesce(sum(batch.eligible_spend - batch.refunded_spend), 0::numeric)
        as net_spend
    from influenced_purchase_batches as batch
  ), campaign_currency_candidates as (
    select distinct version.currency_code, version.minor_unit_digits
    from influenced_purchase_batches as batch
    join scoped_versions as version on version.id = batch.programme_version_id
  ), campaign_currency_history as (
    select count(*)::integer as candidate_count,
      min(candidate.currency_code) as code,
      min(candidate.minor_unit_digits) as digits,
      bool_or(
        candidate.currency_code is null
        or candidate.minor_unit_digits is null
      ) as has_invalid
    from campaign_currency_candidates as candidate
  ), published_currency as (
    select version.currency_code as code, version.minor_unit_digits as digits
    from scoped_versions as version
    where version.status = 'published'
    order by version.published_at desc nulls last, version.id desc
    limit 1
  ), campaign_currency_resolution as (
    select case
        when history.has_invalid then 'unavailable'
        when history.candidate_count = 1 then 'available'
        when history.candidate_count > 1 then 'unavailable'
        when published.code is not null and published.digits is not null
          then 'available'
        else 'unavailable'
      end as status,
      case
        when history.candidate_count = 1 and not history.has_invalid
          then history.code
        when history.candidate_count = 0 then published.code
        else null
      end as code,
      case
        when history.candidate_count = 1 and not history.has_invalid
          then history.digits
        when history.candidate_count = 0 then published.digits
        else null
      end as digits,
      case
        when history.candidate_count > 1 then 'mixed_currency_scope'
        when history.has_invalid
          or (history.candidate_count = 0 and (
            published.code is null or published.digits is null
          )) then 'programme_currency_unavailable'
        else null
      end as reason
    from campaign_currency_history as history
    left join published_currency as published on true
  )
  select '1'::text, '3'::text, target_as_of,
    selected_period_from, target_as_of, target_days,
    reward_period.request_count::text,
    reward_capture.capture_count::text,
    reward_capture.captured_points::text,
    reward_open.unresolved_count::text,
    24,
    selected_period_from - reward_maturity_window,
    target_as_of - reward_maturity_window,
    mature_reward.request_count::text,
    mature_reward.capture_count::text,
    mature_reward.unresolved_count::text,
    case when mature_reward.request_count = 0 then '0'
      else pg_catalog.trunc(
        mature_reward.capture_count * 10000 / mature_reward.request_count
      )::text end,
    tier.decision_count::text,
    tier.moved_members::text,
    tier.entry_count::text,
    tier.reentry_count::text,
    tier.upgrade_count::text,
    tier.grace_count::text,
    tier.downgrade_count::text,
    tier.manual_count::text,
    tier.none_count::text,
    advocates.advocate_count::text,
    referral.attribution_count::text,
    referral.pending_count::text,
    referral.qualified_count::text,
    referral.rejected_count::text,
    referral.reversed_count::text,
    case when referral.attribution_count = 0 then '0'
      else pg_catalog.trunc(
        referral.qualified_count * 10000 / referral.attribution_count
      )::text end,
    referral_value.issuance_count::text,
    referral_value.compensation_count::text,
    referral_value.advocate_points_issued::text,
    referral_value.friend_points_issued::text,
    referral_value.advocate_points_reversed::text,
    referral_value.friend_points_reversed::text,
    (
      referral_value.advocate_points_issued
      - referral_value.advocate_points_reversed
    )::text,
    (
      referral_value.friend_points_issued
      - referral_value.friend_points_reversed
    )::text,
    currency.status, currency.code, currency.digits, currency.reason,
    (
      purchase.treatment_count + trigger_issue.treatment_count
    )::text,
    (purchase.control_count + trigger_issue.control_count)::text,
    (purchase.capacity_count + trigger_issue.capacity_count)::text,
    purchase.suppressed_count::text,
    influenced.order_count::text,
    members.member_count::text,
    case when currency.status = 'available'
      then influenced.net_spend::text end,
    (purchase.points_awarded + trigger_issue.points_awarded)::text,
    (
      purchase_reversal.reversal_points + trigger_reversal.reversal_points
    )::text,
    (
      purchase.points_awarded + trigger_issue.points_awarded
      - purchase_reversal.reversal_points - trigger_reversal.reversal_points
    )::text,
    trigger_issue.reward_count::text,
    manual_review.job_count::text,
    'unavailable'::text,
    'estimator_not_configured'::text,
    null::text
  from reward_period
  cross join reward_capture_period as reward_capture
  cross join reward_unresolved as reward_open
  cross join mature_reward_totals as mature_reward
  cross join tier_totals as tier
  cross join active_advocates as advocates
  cross join referral_totals as referral
  cross join referral_value_totals as referral_value
  cross join purchase_campaign_totals as purchase
  cross join trigger_issue_totals as trigger_issue
  cross join purchase_campaign_reversals as purchase_reversal
  cross join trigger_reversal_totals as trigger_reversal
  cross join campaign_manual_review as manual_review
  cross join influenced_members as members
  cross join influenced_purchase_totals as influenced
  cross join campaign_currency_resolution as currency;
end;
$$;

alter function loyalty.get_analytics_programme_outcomes_v1(
  uuid, uuid, uuid, integer, timestamptz
) owner to loyalty_owner;

revoke all on function loyalty.get_analytics_programme_outcomes_v1(
  uuid, uuid, uuid, integer, timestamptz
) from public, anon, authenticated, loyalty_runtime, loyalty_worker;

grant execute on function loyalty.get_analytics_programme_outcomes_v1(
  uuid, uuid, uuid, integer, timestamptz
) to authenticated;

comment on function loyalty.get_analytics_programme_outcomes_v1(
  uuid, uuid, uuid, integer, timestamptz
) is 'Returns minimized as-of reward, tier, referral, and campaign outcomes from immutable transition and effect evidence.';
