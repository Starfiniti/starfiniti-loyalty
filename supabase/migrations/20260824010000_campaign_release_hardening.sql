-- M07 release hardening: purchase-campaign awards must follow the same
-- cumulative refund policy as their programme award without rewriting gross
-- capacity or immutable effect history.

create table loyalty_private.campaign_purchase_refund_compensations (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  programme_group_id bigint not null,
  campaign_effect_id bigint not null,
  original_evaluation_id bigint not null,
  refund_evaluation_id bigint not null,
  canonical_refund_event_id bigint not null,
  cumulative_refunded_eligible_spend_minor bigint not null
    check (cumulative_refunded_eligible_spend_minor >= 0),
  target_reversed_points bigint not null check (target_reversed_points >= 0),
  reversal_points bigint not null check (reversal_points >= 0),
  reversal_transaction_id bigint,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, campaign_effect_id, refund_evaluation_id),
  foreign key (organization_id, campaign_effect_id)
    references loyalty_private.campaign_effects(organization_id, id)
    on delete restrict,
  foreign key (organization_id, original_evaluation_id)
    references loyalty_private.programme_evaluations(organization_id, id)
    on delete restrict,
  foreign key (organization_id, refund_evaluation_id)
    references loyalty_private.programme_evaluations(organization_id, id)
    on delete restrict,
  foreign key (organization_id, canonical_refund_event_id)
    references loyalty_private.canonical_commerce_events(organization_id, id)
    on delete restrict,
  foreign key (organization_id, reversal_transaction_id)
    references loyalty.ledger_transactions(organization_id, id)
    on delete restrict,
  check (
    (reversal_points = 0 and reversal_transaction_id is null)
    or (reversal_points > 0 and reversal_transaction_id is not null)
  )
);

alter table loyalty_private.campaign_purchase_refund_compensations
  owner to loyalty_owner;

create index campaign_purchase_refund_compensations_effect_idx
  on loyalty_private.campaign_purchase_refund_compensations (
    organization_id, campaign_effect_id, id
  );

create trigger campaign_purchase_refund_compensations_immutable
before update or delete
on loyalty_private.campaign_purchase_refund_compensations
for each row execute function loyalty_private.reject_immutable_change();

alter table loyalty_private.campaign_purchase_refund_compensations
  enable row level security;

revoke all on loyalty_private.campaign_purchase_refund_compensations
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

create or replace function loyalty_private.record_purchase_campaign_refund_v1(
  target_organization_id bigint,
  target_original_evaluation_public_id uuid,
  target_refund_evaluation_public_id uuid
)
returns table (
  customer_id bigint,
  affected_effects bigint,
  reversed_points bigint,
  outcome text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  original_evaluation loyalty_private.programme_evaluations%rowtype;
  refund_evaluation loyalty_private.programme_evaluations%rowtype;
  original_fact loyalty_private.tier_qualification_facts%rowtype;
  target_batch loyalty_private.campaign_execution_batches%rowtype;
  target_wallet_id bigint;
  target_effect record;
  existing_compensation
    loyalty_private.campaign_purchase_refund_compensations%rowtype;
  tier_result record;
  origin_entry_public_id uuid;
  posted record;
  reversal_transaction_id bigint;
  original_eligible bigint;
  current_refunded bigint;
  prior_reversed bigint;
  target_reversed bigint;
  delta_reversed bigint;
  request_sha256 bytea;
  created_effects bigint := 0;
  duplicate_effects bigint := 0;
  total_reversed bigint := 0;
begin
  select evaluation.* into strict original_evaluation
  from loyalty_private.programme_evaluations as evaluation
  where evaluation.organization_id = target_organization_id
    and evaluation.public_id = target_original_evaluation_public_id
    and evaluation.evaluation_kind = 'live_award';

  select evaluation.* into strict refund_evaluation
  from loyalty_private.programme_evaluations as evaluation
  where evaluation.organization_id = target_organization_id
    and evaluation.public_id = target_refund_evaluation_public_id
    and evaluation.evaluation_kind = 'live_refund';

  if original_evaluation.programme_group_id
      <> refund_evaluation.programme_group_id
    or original_evaluation.programme_version_id
      <> refund_evaluation.programme_version_id
    or refund_evaluation.result ->> 'orderEventId'
      <> original_evaluation.result ->> 'eventId' then
    raise exception using errcode = '22023',
      message = 'campaign refund does not match its original award';
  end if;

  select fact.* into strict original_fact
  from loyalty_private.tier_qualification_facts as fact
  where fact.organization_id = target_organization_id
    and fact.evaluation_id = original_evaluation.id
    and fact.fact_kind = 'purchase';

  select wallet.id into strict target_wallet_id
  from loyalty.wallets as wallet
  where wallet.organization_id = target_organization_id
    and wallet.programme_group_id = original_fact.programme_group_id
    and wallet.customer_id = original_fact.customer_id
    and wallet.status = 'active'
  order by wallet.id
  limit 1;

  perform 1
  from loyalty.wallet_balances as balance
  where balance.organization_id = target_organization_id
    and balance.wallet_id = target_wallet_id
  order by balance.ledger_account_id
  for update;

  select * into strict tier_result
  from loyalty_private.record_tier_refund_fact_v2(
    target_organization_id,
    target_original_evaluation_public_id,
    target_refund_evaluation_public_id
  );

  original_eligible := original_fact.eligible_spend_minor_delta;
  current_refunded := (
    refund_evaluation.result ->> 'cumulativeRefundedEligibleSpendMinor'
  )::bigint;
  if original_eligible < 0
    or current_refunded < 0
    or current_refunded > original_eligible then
    raise exception using errcode = '23514',
      message = 'campaign refund cumulative spend is outside its original award';
  end if;

  select batch.* into target_batch
  from loyalty_private.campaign_execution_batches as batch
  where batch.organization_id = target_organization_id
    and batch.programme_evaluation_id = original_evaluation.id
  order by batch.id
  limit 1;

  if not found then
    return query select original_fact.customer_id, 0::bigint, 0::bigint,
      case when tier_result.outcome = 'duplicate'
        then 'duplicate'::text else 'no_campaign_effects'::text end;
    return;
  end if;

  for target_effect in
    select effect.*
    from loyalty_private.campaign_effects as effect
    where effect.organization_id = target_organization_id
      and effect.execution_batch_id = target_batch.id
      and effect.decision_outcome = 'awarded'
    order by effect.id
    for update
  loop
    select compensation.* into existing_compensation
    from loyalty_private.campaign_purchase_refund_compensations
      as compensation
    where compensation.organization_id = target_organization_id
      and compensation.campaign_effect_id = target_effect.id
      and compensation.refund_evaluation_id = refund_evaluation.id;

    if found then
      duplicate_effects := duplicate_effects + 1;
      continue;
    end if;

    select coalesce(pg_catalog.sum(compensation.reversal_points), 0)::bigint
      into prior_reversed
    from loyalty_private.campaign_purchase_refund_compensations
      as compensation
    where compensation.organization_id = target_organization_id
      and compensation.campaign_effect_id = target_effect.id;

    target_reversed := case
      when current_refunded = original_eligible then target_effect.points
      when original_eligible = 0 then 0
      else pg_catalog.trunc(
        target_effect.points::numeric * current_refunded::numeric
          / original_eligible::numeric
      )::bigint
    end;

    if target_reversed < prior_reversed
      or target_reversed > target_effect.points then
      raise exception using errcode = '23514',
        message = 'campaign refund cumulative points moved backwards';
    end if;
    delta_reversed := target_reversed - prior_reversed;
    reversal_transaction_id := null;

    if delta_reversed > 0 then
      select entry.public_id into strict origin_entry_public_id
      from loyalty.ledger_entries as entry
      where entry.organization_id = target_organization_id
        and entry.id = target_effect.award_origin_entry_id;

      request_sha256 := extensions.digest(
        pg_catalog.convert_to(pg_catalog.jsonb_build_object(
          'schemaVersion', '1',
          'campaignEffectId', target_effect.public_id,
          'originalEvaluationId', original_evaluation.public_id,
          'refundEvaluationId', refund_evaluation.public_id,
          'cumulativeRefundedEligibleSpendMinor', current_refunded::text,
          'targetReversedPoints', target_reversed::text,
          'reversalPoints', delta_reversed::text
        )::text, 'UTF8'),
        'sha256'
      );

      select * into strict posted
      from loyalty_private.reverse_award_points(
        target_organization_id,
        origin_entry_public_id,
        delta_reversed,
        'campaign:refund:' || pg_catalog.encode(extensions.digest(
          pg_catalog.convert_to(
            target_effect.public_id::text || '|' ||
              refund_evaluation.public_id::text,
            'UTF8'
          ),
          'sha256'
        ), 'hex'),
        request_sha256,
        'Cumulative WooCommerce campaign refund reversal',
        (
          select event.occurred_at
          from loyalty_private.canonical_commerce_events as event
          where event.organization_id = target_organization_id
            and event.id = refund_evaluation.canonical_event_id
        )
      );

      select transaction.id into strict reversal_transaction_id
      from loyalty.ledger_transactions as transaction
      where transaction.organization_id = target_organization_id
        and transaction.public_id = posted.transaction_public_id;
    end if;

    insert into loyalty_private.campaign_purchase_refund_compensations (
      organization_id, programme_group_id, campaign_effect_id,
      original_evaluation_id, refund_evaluation_id,
      canonical_refund_event_id,
      cumulative_refunded_eligible_spend_minor,
      target_reversed_points, reversal_points, reversal_transaction_id
    ) values (
      target_organization_id, original_fact.programme_group_id,
      target_effect.id, original_evaluation.id, refund_evaluation.id,
      refund_evaluation.canonical_event_id, current_refunded,
      target_reversed, delta_reversed, reversal_transaction_id
    );
    created_effects := created_effects + 1;
    total_reversed := total_reversed + delta_reversed;
  end loop;

  if created_effects > 0 and duplicate_effects > 0 then
    raise exception using errcode = '23514',
      message = 'partial campaign refund evidence is inconsistent';
  end if;

  return query select original_fact.customer_id,
    created_effects + duplicate_effects, total_reversed,
    case
      when created_effects > 0 then 'created'::text
      when duplicate_effects > 0 then 'duplicate'::text
      else 'no_campaign_effects'::text
    end;
end;
$$;

alter function loyalty_private.record_purchase_campaign_refund_v1(
  bigint, uuid, uuid
) owner to loyalty_owner;

revoke all on function loyalty_private.record_purchase_campaign_refund_v1(
  bigint, uuid, uuid
) from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty_private.record_purchase_campaign_refund_v1(
  bigint, uuid, uuid
) to loyalty_worker;

comment on table
  loyalty_private.campaign_purchase_refund_compensations is
  'Append-only cumulative refund evidence for purchase-campaign ledger origins; gross capacity and immutable campaign effects remain unchanged.';

comment on function loyalty_private.record_purchase_campaign_refund_v1(
  bigint, uuid, uuid
) is
  'Serializes a V2 refund, records its tier fact, and proportionally compensates every purchase-campaign award origin exactly once without entitlement checks.';

-- M07 minimized merchant campaign results. Browser sessions receive only
-- exact tenant-scoped aggregates; private assignments, source references,
-- salts, errors, and customer identities remain inaccessible.

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
          and effect.points = coalesce((
            select pg_catalog.sum(compensation.reversal_points)::bigint
            from loyalty_private.campaign_purchase_refund_compensations
              as compensation
            where compensation.organization_id = effect.organization_id
              and compensation.campaign_effect_id = effect.id
          ), 0)
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

