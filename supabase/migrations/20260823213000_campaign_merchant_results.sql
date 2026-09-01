-- M07 minimized merchant campaign results. Browser sessions receive only
-- exact tenant-scoped aggregates; private assignments, source references,
-- salts, errors, and customer identities remain inaccessible.

create index campaign_trigger_executions_version_idx
  on loyalty_private.campaign_trigger_executions (
    organization_id, campaign_version_id, id
  );

create or replace function loyalty.get_campaign_results_v1(
  target_programme_public_id uuid,
  target_limit integer default 100
)
returns table (campaign_result jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_programme loyalty.programmes%rowtype;
  generated_at timestamptz := pg_catalog.statement_timestamp();
begin
  if loyalty_private.request_user_id() is null
    or target_programme_public_id is null
    or target_limit is null
    or target_limit not between 1 and 100 then
    raise exception using errcode = '22023',
      message = 'invalid campaign results request';
  end if;

  select programme.* into target_programme
  from loyalty.programmes as programme
  where programme.public_id = target_programme_public_id
    and loyalty_private.has_organization_role(
      programme.organization_id,
      array['owner', 'admin', 'operator', 'analyst', 'auditor']::text[]
    );
  if not found then
    raise exception using errcode = '42501',
      message = 'campaign results not authorized';
  end if;

  return query
  select pg_catalog.jsonb_build_object(
    'schemaVersion', '1',
    'programmeId', target_programme.public_id,
    'campaignId', campaign.public_id,
    'campaignVersionId', version.public_id,
    'campaignCode', campaign.code,
    'campaignName', version.definition ->> 'name',
    'versionNumber', version.version_number,
    'status', version.status,
    'startsAt', version.starts_at,
    'endsAt', version.ends_at,
    'generatedAt', generated_at,
    'assignments', pg_catalog.jsonb_build_object(
      'eligible', version.eligible_member_count::text,
      'treatment', version.treatment_member_count::text,
      'control', version.control_member_count::text
    ),
    'capacity', pg_catalog.jsonb_build_object(
      'globalEffectLimit', version.global_effect_limit::text,
      'maximumPoints', version.maximum_points::text,
      'maximumLiabilityMinor', version.maximum_liability_minor::text,
      'reservedEffects', coalesce(counter.reserved_effects, 0)::text,
      'committedEffects', coalesce(counter.committed_effects, 0)::text,
      'reservedPoints', coalesce(counter.reserved_points, 0)::text,
      'committedPoints', coalesce(counter.committed_points, 0)::text,
      'reservedLiabilityMinor',
        coalesce(counter.reserved_liability_minor, 0)::text,
      'committedLiabilityMinor',
        coalesce(counter.committed_liability_minor, 0)::text
    ),
    'purchaseOutcomes', pg_catalog.jsonb_build_object(
      'awarded', coalesce(purchase.awarded, 0)::text,
      'control', coalesce(purchase.control_count, 0)::text,
      'capacityExhausted',
        coalesce(purchase.capacity_exhausted, 0)::text,
      'suppressed', coalesce(purchase.suppressed, 0)::text,
      'reversedAwards',
        coalesce(purchase.reversed_awards, 0)::text
    ),
    'triggerJobs', pg_catalog.jsonb_build_object(
      'pending', coalesce(jobs.pending, 0)::text,
      'processing', coalesce(jobs.processing, 0)::text,
      'retryable', coalesce(jobs.retryable, 0)::text,
      'completed', coalesce(jobs.completed, 0)::text,
      'cancelled', coalesce(jobs.cancelled, 0)::text,
      'manualReview', coalesce(jobs.manual_review, 0)::text
    ),
    'triggerOutcomes', pg_catalog.jsonb_build_object(
      'pointsAwarded', coalesce(executions.points_awarded, 0)::text,
      'rewardReserved', coalesce(executions.reward_reserved, 0)::text,
      'control', coalesce(executions.control_count, 0)::text,
      'capacityExhausted',
        coalesce(executions.capacity_exhausted, 0)::text,
      'pointsReversed', coalesce(executions.points_reversed, 0)::text,
      'rewardCancellationRequested',
        coalesce(executions.reward_cancellation_requested, 0)::text,
      'rewardAlreadyResolved',
        coalesce(executions.reward_already_resolved, 0)::text,
      'rewardNonreversible',
        coalesce(executions.reward_nonreversible, 0)::text,
      'noValueToReverse',
        coalesce(executions.no_value_to_reverse, 0)::text
    ),
    'measurement', pg_catalog.jsonb_build_object(
      'classification', 'influenced',
      'incrementalityState', 'not_measured',
      'explanation',
        'These are directly attributed campaign outcomes, not experimentally measured incremental lift.'
    )
  )
  from loyalty.campaigns as campaign
  join loyalty.campaign_versions as version
    on version.organization_id = campaign.organization_id
   and version.campaign_id = campaign.id
  left join loyalty_private.campaign_capacity_counters as counter
    on counter.organization_id = version.organization_id
   and counter.campaign_version_id = version.id
  left join lateral (
    select
      pg_catalog.count(*) filter (
        where effect.decision_outcome = 'awarded'
      )::bigint as awarded,
      pg_catalog.count(*) filter (
        where effect.decision_outcome = 'control'
      )::bigint as control_count,
      pg_catalog.count(*) filter (
        where effect.decision_outcome = 'capacity_exhausted'
      )::bigint as capacity_exhausted,
      pg_catalog.count(*) filter (
        where effect.decision_outcome = 'suppressed'
      )::bigint as suppressed,
      pg_catalog.count(*) filter (
        where effect.decision_outcome = 'awarded'
          and effect.state = 'reversed'
      )::bigint as reversed_awards
    from loyalty_private.campaign_effects as effect
    where effect.organization_id = version.organization_id
      and effect.campaign_version_id = version.id
  ) as purchase on true
  left join lateral (
    select
      pg_catalog.count(*) filter (where job.state = 'pending')::bigint as pending,
      pg_catalog.count(*) filter (where job.state = 'processing')::bigint
        as processing,
      pg_catalog.count(*) filter (where job.state = 'retryable')::bigint
        as retryable,
      pg_catalog.count(*) filter (where job.state = 'completed')::bigint
        as completed,
      pg_catalog.count(*) filter (where job.state = 'cancelled')::bigint
        as cancelled,
      pg_catalog.count(*) filter (where job.state = 'manual_review')::bigint
        as manual_review
    from loyalty_private.campaign_trigger_jobs as job
    where job.organization_id = version.organization_id
      and job.campaign_version_id = version.id
  ) as jobs on true
  left join lateral (
    select
      pg_catalog.count(*) filter (
        where execution.outcome = 'points_awarded'
      )::bigint as points_awarded,
      pg_catalog.count(*) filter (
        where execution.outcome = 'reward_reserved'
      )::bigint as reward_reserved,
      pg_catalog.count(*) filter (
        where execution.outcome = 'control'
      )::bigint as control_count,
      pg_catalog.count(*) filter (
        where execution.outcome = 'capacity_exhausted'
      )::bigint as capacity_exhausted,
      pg_catalog.count(*) filter (
        where execution.outcome = 'points_reversed'
      )::bigint as points_reversed,
      pg_catalog.count(*) filter (
        where execution.outcome = 'reward_cancellation_requested'
      )::bigint as reward_cancellation_requested,
      pg_catalog.count(*) filter (
        where execution.outcome = 'reward_already_resolved'
      )::bigint as reward_already_resolved,
      pg_catalog.count(*) filter (
        where execution.outcome = 'reward_nonreversible'
      )::bigint as reward_nonreversible,
      pg_catalog.count(*) filter (
        where execution.outcome = 'no_value_to_reverse'
      )::bigint as no_value_to_reverse
    from loyalty_private.campaign_trigger_executions as execution
    where execution.organization_id = version.organization_id
      and execution.campaign_version_id = version.id
  ) as executions on true
  where campaign.organization_id = target_programme.organization_id
    and campaign.programme_group_id = target_programme.programme_group_id
    and campaign.programme_id = target_programme.id
  order by version.starts_at desc, version.id desc
  limit target_limit;
end;
$$;

alter function loyalty.get_campaign_results_v1(uuid, integer)
  owner to loyalty_owner;

revoke all on function loyalty.get_campaign_results_v1(uuid, integer)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty.get_campaign_results_v1(uuid, integer)
  to authenticated;

comment on function loyalty.get_campaign_results_v1(uuid, integer) is
  'Returns bounded exact campaign aggregates for an Auth-derived live organization member without exposing private assignments, identities, source references, errors, salts, or causal-incrementality claims.';
