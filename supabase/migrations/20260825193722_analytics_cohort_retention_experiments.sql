-- M10-S03: mature cohort retention and evidence-gated campaign experiments.
-- Cohort rates use complete elapsed observation windows. Campaign estimates
-- use immutable assignments and expose no customer, wallet, order, or private
-- assignment identifiers.

create index wallets_analytics_created_idx
  on loyalty.wallets (
    organization_id, programme_group_id, created_at, id
  );

create index point_lots_analytics_release_idx
  on loyalty.point_lots (
    organization_id, programme_group_id, wallet_id, available_at, created_at, id
  );

create or replace function loyalty.get_analytics_cohort_retention_v1(
  target_organization_public_id uuid,
  target_workspace_public_id uuid,
  target_programme_group_public_id uuid,
  target_days integer,
  target_time_zone text default 'UTC',
  target_as_of timestamptz default now()
)
returns table (report jsonb)
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
  cohort_from_local date;
  cohort_to_local date;
  cohort_from_instant timestamptz;
  cohort_to_instant timestamptz;
begin
  if target_organization_public_id is null
    or target_workspace_public_id is null
    or target_programme_group_public_id is null
    or target_days is null
    or target_days not in (7, 30, 90)
    or target_time_zone is null
    or pg_catalog.length(target_time_zone) not between 1 and 64
    or target_as_of is null
    or not pg_catalog.isfinite(target_as_of)
    or not exists (
      select 1
      from pg_catalog.pg_timezone_names as zone
      where zone.name = target_time_zone
    ) then
    raise exception using
      errcode = '22023',
      message = 'invalid analytics cohort retention request';
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
  cohort_to_local :=
    (target_as_of at time zone target_time_zone)::date - 60;
  cohort_from_local := cohort_to_local - target_days;
  cohort_from_instant :=
    cohort_from_local::timestamp at time zone target_time_zone;
  cohort_to_instant :=
    cohort_to_local::timestamp at time zone target_time_zone;

  return query
  with date_spine as materialized (
    select (cohort_from_local + day_offset)::date as local_date
    from pg_catalog.generate_series(0, target_days - 1)
      as generated(day_offset)
  ), scoped_wallets as materialized (
    select wallet.id, wallet.created_at,
      (wallet.created_at at time zone target_time_zone)::date as joined_date
    from loyalty.wallets as wallet
    where wallet.organization_id = selected_organization_id
      and wallet.programme_group_id = selected_programme_group_id
      and wallet.created_at < target_as_of
  ), release_lots as materialized (
    select lot.id, lot.wallet_id, lot.available_at
    from loyalty.point_lots as lot
    join loyalty.ledger_entries as credit_entry
      on credit_entry.organization_id = lot.organization_id
     and credit_entry.id = lot.credit_entry_id
    join loyalty.ledger_transactions as transaction
      on transaction.organization_id = credit_entry.organization_id
     and transaction.id = credit_entry.transaction_id
     and transaction.transaction_kind = 'release'
    where lot.organization_id = selected_organization_id
      and lot.programme_group_id = selected_programme_group_id
      and lot.created_at < target_as_of
      and transaction.created_at < target_as_of
      and lot.available_at <= target_as_of
  ), membership_rows as materialized (
    select spine.local_date,
      count(wallet.id)::numeric as eligible_members,
      count(wallet.id) filter (
        where exists (
          select 1
          from release_lots as release
          where release.wallet_id = wallet.id
            and release.available_at >= wallet.created_at
            and release.available_at <= wallet.created_at + interval '30 days'
        )
      )::numeric as outcome_members
    from date_spine as spine
    left join scoped_wallets as wallet
      on wallet.joined_date = spine.local_date
     and wallet.created_at >= cohort_from_instant
     and wallet.created_at < cohort_to_instant
    group by spine.local_date
    order by spine.local_date
  ), first_releases as materialized (
    select release.wallet_id, min(release.available_at) as first_release_at
    from release_lots as release
    group by release.wallet_id
  ), retention_rows as materialized (
    select spine.local_date,
      count(first_release.wallet_id)::numeric as eligible_members,
      count(first_release.wallet_id) filter (
        where exists (
          select 1
          from release_lots as later_release
          where later_release.wallet_id = first_release.wallet_id
            and later_release.available_at
              > first_release.first_release_at + interval '30 days'
            and later_release.available_at
              <= first_release.first_release_at + interval '60 days'
        )
      )::numeric as outcome_members
    from date_spine as spine
    left join first_releases as first_release
      on (first_release.first_release_at at time zone target_time_zone)::date
        = spine.local_date
     and first_release.first_release_at >= cohort_from_instant
     and first_release.first_release_at < cohort_to_instant
    group by spine.local_date
    order by spine.local_date
  ), membership_totals as (
    select coalesce(sum(row.eligible_members), 0::numeric) as eligible_members,
      coalesce(sum(row.outcome_members), 0::numeric) as outcome_members
    from membership_rows as row
  ), retention_totals as (
    select coalesce(sum(row.eligible_members), 0::numeric) as eligible_members,
      coalesce(sum(row.outcome_members), 0::numeric) as outcome_members
    from retention_rows as row
  ), campaign_candidates as materialized (
    select campaign.id as campaign_id,
      campaign.public_id as campaign_public_id,
      campaign.code,
      version.id as campaign_version_id,
      version.public_id as campaign_version_public_id,
      version.version_number,
      version.definition,
      version.starts_at,
      version.ends_at,
      version.eligible_member_count,
      version.treatment_member_count,
      version.control_member_count
    from loyalty.campaign_versions as version
    join loyalty.campaigns as campaign
      on campaign.organization_id = version.organization_id
     and campaign.id = version.campaign_id
    where version.organization_id = selected_organization_id
      and version.programme_group_id = selected_programme_group_id
      and version.approved_at is not null
      and version.approved_at < target_as_of
      and version.starts_at < target_as_of
      and version.ends_at > selected_period_from
      and exists (
        select 1
        from loyalty_private.campaign_assignments as assignment
        where assignment.organization_id = version.organization_id
          and assignment.campaign_version_id = version.id
          and assignment.created_at < target_as_of
      )
    order by version.ends_at desc, version.id desc
    limit 100
  ), assignment_stats as materialized (
    select candidate.campaign_version_id,
      count(assignment.id)::numeric as eligible_members,
      count(assignment.id) filter (
        where assignment.assignment = 'treatment'
      )::numeric as treatment_members,
      count(assignment.id) filter (
        where assignment.assignment = 'control'
      )::numeric as control_members
    from campaign_candidates as candidate
    join loyalty_private.campaign_assignments as assignment
      on assignment.organization_id = selected_organization_id
     and assignment.campaign_version_id = candidate.campaign_version_id
     and assignment.created_at < target_as_of
    group by candidate.campaign_version_id
  ), effect_evidence as materialized (
    select candidate.campaign_version_id,
      effect.id as effect_id,
      assignment.assignment as authoritative_assignment,
      effect.assignment as effect_assignment,
      batch.occurred_at,
      batch.evaluated_at,
      effect.created_at as effect_created_at,
      case
        when coalesce(batch.baseline_result ->> 'eligibleSpendMinor', '')
          ~ '^(0|[1-9][0-9]{0,30})$'
        then (batch.baseline_result ->> 'eligibleSpendMinor')::numeric
        else 0::numeric
      end as eligible_spend,
      coalesce(refund.cumulative_refunded, 0::numeric) as refunded_spend,
      case
        when coalesce(programme_version.configuration ->> 'currencyCode', '')
          ~ '^[A-Z]{3}$'
        then programme_version.configuration ->> 'currencyCode'
      end as currency_code,
      case programme_version.configuration ->> 'minorUnitsPerMajor'
        when '1' then 0
        when '10' then 1
        when '100' then 2
        when '1000' then 3
        when '10000' then 4
        when '100000' then 5
        when '1000000' then 6
      end as minor_unit_digits,
      (
        assignment.id is null
        or assignment.assignment is distinct from effect.assignment
        or batch.occurred_at < candidate.starts_at
        or batch.occurred_at >= candidate.ends_at
        or batch.evaluated_at >= target_as_of
        or effect.created_at >= target_as_of
        or coalesce(batch.baseline_result ->> 'eligibleSpendMinor', '')
          !~ '^(0|[1-9][0-9]{0,30})$'
        or coalesce(refund.cumulative_refunded, 0::numeric) > case
          when coalesce(batch.baseline_result ->> 'eligibleSpendMinor', '')
            ~ '^(0|[1-9][0-9]{0,30})$'
          then (batch.baseline_result ->> 'eligibleSpendMinor')::numeric
          else 0::numeric
        end
        or coalesce(programme_version.configuration ->> 'currencyCode', '')
          !~ '^[A-Z]{3}$'
        or programme_version.configuration ->> 'minorUnitsPerMajor'
          not in ('1', '10', '100', '1000', '10000', '100000', '1000000')
      ) as invalid_evidence
    from campaign_candidates as candidate
    join loyalty_private.campaign_effects as effect
      on effect.organization_id = selected_organization_id
     and effect.campaign_version_id = candidate.campaign_version_id
    join loyalty_private.campaign_execution_batches as batch
      on batch.organization_id = effect.organization_id
     and batch.id = effect.execution_batch_id
    join loyalty.programme_versions as programme_version
      on programme_version.organization_id = batch.organization_id
     and programme_version.id = batch.programme_version_id
    left join loyalty_private.campaign_assignments as assignment
      on assignment.organization_id = effect.organization_id
     and assignment.campaign_version_id = effect.campaign_version_id
     and assignment.wallet_id = effect.wallet_id
     and assignment.created_at < target_as_of
    left join lateral (
      select max(
        compensation.cumulative_refunded_eligible_spend_minor
      )::numeric as cumulative_refunded
      from loyalty_private.campaign_purchase_refund_compensations
        as compensation
      where compensation.organization_id = effect.organization_id
        and compensation.campaign_effect_id = effect.id
        and compensation.created_at < target_as_of
    ) as refund on true
  ), effect_stats as materialized (
    select candidate.campaign_version_id,
      count(evidence.effect_id)::numeric as effect_count,
      coalesce(bool_or(evidence.invalid_evidence), false) as invalid_evidence,
      count(distinct (
        evidence.currency_code,
        evidence.minor_unit_digits
      )) filter (
        where evidence.currency_code is not null
          and evidence.minor_unit_digits is not null
      )::integer as currency_candidate_count,
      min(evidence.currency_code) as currency_code,
      min(evidence.minor_unit_digits) as minor_unit_digits,
      coalesce(sum(
        evidence.eligible_spend - evidence.refunded_spend
      ) filter (
        where evidence.authoritative_assignment = 'treatment'
      ), 0::numeric) as treatment_spend,
      coalesce(sum(
        evidence.eligible_spend - evidence.refunded_spend
      ) filter (
        where evidence.authoritative_assignment = 'control'
      ), 0::numeric) as control_spend
    from campaign_candidates as candidate
    left join effect_evidence as evidence
      on evidence.campaign_version_id = candidate.campaign_version_id
    group by candidate.campaign_version_id
  ), experiment_rows as materialized (
    select candidate.*,
      assignment.eligible_members as actual_eligible_members,
      assignment.treatment_members as actual_treatment_members,
      assignment.control_members as actual_control_members,
      evidence.effect_count,
      evidence.invalid_evidence,
      evidence.currency_candidate_count,
      evidence.currency_code,
      evidence.minor_unit_digits,
      evidence.treatment_spend,
      evidence.control_spend,
      case
        when candidate.ends_at > target_as_of
          then 'incomplete_window'
        when candidate.definition #>> '{behavior,kind}'
          not in ('bonus_points', 'purchase_multiplier')
          then 'unsupported_outcome'
        when assignment.eligible_members
            <> candidate.eligible_member_count::numeric
          or assignment.treatment_members
            <> candidate.treatment_member_count::numeric
          or assignment.control_members
            <> candidate.control_member_count::numeric
          or assignment.eligible_members
            <> assignment.treatment_members + assignment.control_members
          then 'assignment_reconciliation_failed'
        when assignment.treatment_members < 30
          or assignment.control_members < 30
          then 'insufficient_sample'
        when evidence.effect_count = 0 or evidence.invalid_evidence
          then 'purchase_evidence_unavailable'
        when evidence.currency_candidate_count <> 1
          then 'currency_unavailable'
        else 'evidence_complete'
      end as evidence_reason
    from campaign_candidates as candidate
    join assignment_stats as assignment
      on assignment.campaign_version_id = candidate.campaign_version_id
    join effect_stats as evidence
      on evidence.campaign_version_id = candidate.campaign_version_id
  ), campaign_json as materialized (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'campaignPublicId', experiment.campaign_public_id,
          'campaignVersionPublicId', experiment.campaign_version_public_id,
          'code', experiment.code,
          'versionNumber', experiment.version_number,
          'startsAt', experiment.starts_at,
          'endsAt', experiment.ends_at,
          'treatmentMembers', experiment.actual_treatment_members::text,
          'controlMembers', experiment.actual_control_members::text,
          'incrementality', case
            when experiment.evidence_reason = 'evidence_complete' then
              jsonb_build_object(
                'status', 'available',
                'reason', 'evidence_complete',
                'estimator', 'difference_in_means_itt_v1',
                'minimumMembersPerArm', 30,
                'currencyCode', experiment.currency_code,
                'minorUnitDigits', experiment.minor_unit_digits,
                'treatmentEligibleSpendMinor',
                  experiment.treatment_spend::text,
                'controlEligibleSpendMinor',
                  experiment.control_spend::text,
                'exactNumerator', (
                  experiment.treatment_spend
                    * experiment.actual_control_members
                  - experiment.control_spend
                    * experiment.actual_treatment_members
                )::text,
                'exactDenominator',
                  experiment.actual_control_members::text,
                'estimatedIncrementalEligibleSpendMinor',
                  pg_catalog.round((
                    experiment.treatment_spend
                      * experiment.actual_control_members
                    - experiment.control_spend
                      * experiment.actual_treatment_members
                  ) / experiment.actual_control_members)::text,
                'pointEstimateOnly', true
              )
            else jsonb_build_object(
              'status', 'unavailable',
              'reason', experiment.evidence_reason,
              'estimator', 'difference_in_means_itt_v1',
              'minimumMembersPerArm', 30,
              'currencyCode', null,
              'minorUnitDigits', null,
              'treatmentEligibleSpendMinor', null,
              'controlEligibleSpendMinor', null,
              'exactNumerator', null,
              'exactDenominator', null,
              'estimatedIncrementalEligibleSpendMinor', null,
              'pointEstimateOnly', true
            )
          end
        ) order by experiment.ends_at desc, experiment.campaign_version_id desc
      ),
      '[]'::jsonb
    ) as campaigns,
    count(*)::numeric as eligible_campaigns,
    count(*) filter (
      where experiment.evidence_reason = 'evidence_complete'
    )::numeric as available_campaigns,
    count(*) filter (
      where experiment.evidence_reason <> 'evidence_complete'
    )::numeric as unavailable_campaigns
    from experiment_rows as experiment
  )
  select jsonb_build_object(
    'reportVersion', '1',
    'dictionaryVersion', '4',
    'asOf', target_as_of,
    'reportPeriod', jsonb_build_object(
      'from', selected_period_from,
      'to', target_as_of,
      'rangeDays', target_days,
      'timeZone', 'UTC'
    ),
    'cohortPeriod', jsonb_build_object(
      'from', cohort_from_instant,
      'to', cohort_to_instant,
      'fromLocalDate', cohort_from_local,
      'toLocalDateExclusive', cohort_to_local,
      'rangeDays', target_days,
      'timeZone', target_time_zone,
      'maturityLagDays', 60,
      'grain', 'day'
    ),
    'membershipActivation', jsonb_build_object(
      'observationWindowDays', 30,
      'joinedMembers', membership.eligible_members::text,
      'activatedMembers', membership.outcome_members::text,
      'activationRateBasisPoints', case
        when membership.eligible_members = 0 then '0'
        else pg_catalog.trunc(
          membership.outcome_members * 10000 / membership.eligible_members
        )::text
      end,
      'cohorts', (
        select jsonb_agg(
          jsonb_build_object(
            'localDate', row.local_date,
            'eligibleMembers', row.eligible_members::text,
            'outcomeMembers', row.outcome_members::text,
            'rateBasisPoints', case
              when row.eligible_members = 0 then '0'
              else pg_catalog.trunc(
                row.outcome_members * 10000 / row.eligible_members
              )::text
            end
          ) order by row.local_date
        )
        from membership_rows as row
      )
    ),
    'earningRetention', jsonb_build_object(
      'qualification', 'first_released_earning',
      'observationWindow', jsonb_build_object(
        'startsAfterDays', 30,
        'endsAtDays', 60
      ),
      'qualifiedMembers', retention.eligible_members::text,
      'retainedMembers', retention.outcome_members::text,
      'retentionRateBasisPoints', case
        when retention.eligible_members = 0 then '0'
        else pg_catalog.trunc(
          retention.outcome_members * 10000 / retention.eligible_members
        )::text
      end,
      'cohorts', (
        select jsonb_agg(
          jsonb_build_object(
            'localDate', row.local_date,
            'eligibleMembers', row.eligible_members::text,
            'outcomeMembers', row.outcome_members::text,
            'rateBasisPoints', case
              when row.eligible_members = 0 then '0'
              else pg_catalog.trunc(
                row.outcome_members * 10000 / row.eligible_members
              )::text
            end
          ) order by row.local_date
        )
        from retention_rows as row
      )
    ),
    'campaignExperiments', jsonb_build_object(
      'estimator', 'difference_in_means_itt_v1',
      'population', 'all_immutable_assignments',
      'outcome', 'refund_compensated_eligible_spend_minor',
      'minimumMembersPerArm', 30,
      'eligibleCampaigns', campaigns.eligible_campaigns::text,
      'availableCampaigns', campaigns.available_campaigns::text,
      'unavailableCampaigns', campaigns.unavailable_campaigns::text,
      'campaigns', campaigns.campaigns
    )
  ) as report
  from membership_totals as membership
  cross join retention_totals as retention
  cross join campaign_json as campaigns;
end;
$$;

alter function loyalty.get_analytics_cohort_retention_v1(
  uuid, uuid, uuid, integer, text, timestamptz
) owner to loyalty_owner;

revoke all on function loyalty.get_analytics_cohort_retention_v1(
  uuid, uuid, uuid, integer, text, timestamptz
) from public, anon, authenticated, loyalty_runtime, loyalty_worker;

grant execute on function loyalty.get_analytics_cohort_retention_v1(
  uuid, uuid, uuid, integer, text, timestamptz
) to authenticated;

comment on function loyalty.get_analytics_cohort_retention_v1(
  uuid, uuid, uuid, integer, text, timestamptz
) is 'Returns mature daily activation/earning retention cohorts and evidence-gated ITT campaign eligible-spend estimates without private identities.';
