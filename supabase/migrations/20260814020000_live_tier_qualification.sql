-- M05 immutable qualification facts and independently verified live tier decisions.

create table loyalty_private.tier_qualification_facts (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  programme_group_id bigint not null,
  source_programme_version_id bigint not null,
  customer_id bigint not null,
  canonical_event_id bigint not null,
  evaluation_id bigint not null,
  origin_fact_id bigint,
  fact_kind text not null check (fact_kind in (
    'purchase', 'refund', 'points_adjustment', 'referral', 'verified_action'
  )),
  source_reference text not null,
  eligible_spend_minor_delta bigint not null,
  earned_points_delta bigint not null,
  order_count_delta smallint not null,
  referral_count_delta smallint not null,
  verified_action_count_delta smallint not null,
  activity_code text,
  effective_at timestamptz not null,
  recorded_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, evaluation_id),
  unique (organization_id, source_reference),
  foreign key (organization_id, programme_group_id, source_programme_version_id)
    references loyalty.programme_versions(organization_id, programme_group_id, id) on delete restrict,
  foreign key (organization_id, customer_id)
    references loyalty.customers(organization_id, id) on delete restrict,
  foreign key (organization_id, canonical_event_id)
    references loyalty_private.canonical_commerce_events(organization_id, id) on delete restrict,
  foreign key (organization_id, evaluation_id)
    references loyalty_private.programme_evaluations(organization_id, id) on delete restrict,
  foreign key (organization_id, origin_fact_id)
    references loyalty_private.tier_qualification_facts(organization_id, id) on delete restrict,
  check (length(source_reference) between 1 and 500),
  check (recorded_at >= effective_at),
  check (activity_code is null or activity_code ~ '^[a-z][a-z0-9_-]{0,79}$'),
  check (
    (fact_kind = 'purchase'
      and eligible_spend_minor_delta >= 0 and earned_points_delta >= 0
      and order_count_delta = 1 and referral_count_delta = 0
      and verified_action_count_delta = 0 and activity_code is null
      and origin_fact_id is null)
    or (fact_kind = 'refund'
      and eligible_spend_minor_delta <= 0 and earned_points_delta <= 0
      and order_count_delta in (-1, 0) and referral_count_delta = 0
      and verified_action_count_delta = 0 and activity_code is null
      and origin_fact_id is not null)
    or (fact_kind = 'referral'
      and eligible_spend_minor_delta = 0 and earned_points_delta >= 0
      and order_count_delta = 0 and referral_count_delta = 1
      and verified_action_count_delta = 0 and activity_code is null
      and origin_fact_id is null)
    or (fact_kind = 'verified_action'
      and eligible_spend_minor_delta = 0 and earned_points_delta >= 0
      and order_count_delta = 0 and referral_count_delta = 0
      and verified_action_count_delta = 1 and activity_code is not null
      and origin_fact_id is null)
    or (fact_kind = 'points_adjustment'
      and eligible_spend_minor_delta = 0 and order_count_delta = 0
      and referral_count_delta = 0 and verified_action_count_delta = 0
      and activity_code is null and origin_fact_id is null)
  )
);

create index tier_qualification_facts_snapshot_idx
  on loyalty_private.tier_qualification_facts (
    organization_id, programme_group_id, customer_id, effective_at, recorded_at, id
  );
create index tier_qualification_facts_origin_idx
  on loyalty_private.tier_qualification_facts (organization_id, origin_fact_id, id)
  where origin_fact_id is not null;

alter table loyalty_private.tier_qualification_facts owner to loyalty_owner;
create trigger tier_qualification_facts_immutable
before update or delete on loyalty_private.tier_qualification_facts
for each row execute function loyalty_private.reject_immutable_change();

alter table loyalty.tier_decisions
  drop constraint if exists tier_decisions_transition_check;
alter table loyalty.tier_decisions
  add constraint tier_decisions_transition_check check (
    transition in ('entry', 'none', 'upgrade', 'reentry', 'grace', 'downgrade', 'manual')
  );

alter function loyalty_private.commit_programme_v2_award(
  bigint, bigint, bigint, bigint, bigint, text, text, text, bytea, bytea,
  jsonb, jsonb, timestamptz, timestamptz
) rename to commit_programme_v2_award_core;

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
  committed record;
  target_evaluation loyalty_private.programme_evaluations%rowtype;
  target_source text := target_result ->> 'source';
  target_fact_kind text;
  target_activity_code text;
begin
  select * into strict committed
  from loyalty_private.commit_programme_v2_award_core(
    target_organization_id, target_programme_group_id,
    target_programme_version_id, target_canonical_event_id,
    target_customer_id, target_subject_reference,
    target_evaluation_idempotency_key, target_award_idempotency_key,
    target_input_sha256, target_result_sha256, target_result,
    target_explanation, target_occurred_at, target_evaluated_at
  );
  select evaluation.* into strict target_evaluation
  from loyalty_private.programme_evaluations as evaluation
  where evaluation.organization_id = target_organization_id
    and evaluation.public_id = committed.evaluation_public_id;

  if target_source = 'purchase' then
    target_fact_kind := 'purchase';
    target_activity_code := null;
  elsif target_source = 'referral' then
    target_fact_kind := 'referral';
    target_activity_code := null;
  else
    target_fact_kind := 'verified_action';
    target_activity_code := target_explanation ->> 'activity';
    if coalesce(target_activity_code, '') !~ '^[a-z][a-z0-9_-]{0,79}$' then
      raise exception using errcode = '22023',
        message = 'verified tier activity requires a bounded activity code';
    end if;
  end if;

  insert into loyalty_private.tier_qualification_facts (
    organization_id, programme_group_id, source_programme_version_id,
    customer_id, canonical_event_id, evaluation_id, fact_kind,
    source_reference, eligible_spend_minor_delta, earned_points_delta,
    order_count_delta, referral_count_delta,
    verified_action_count_delta, activity_code, effective_at, recorded_at
  ) values (
    target_organization_id, target_programme_group_id,
    target_programme_version_id, target_customer_id,
    target_canonical_event_id, target_evaluation.id, target_fact_kind,
    'evaluation:' || target_evaluation.public_id::text,
    case when target_fact_kind = 'purchase'
      then (target_result ->> 'eligibleSpendMinor')::bigint else 0 end,
    (target_result ->> 'awardedPoints')::bigint,
    case when target_fact_kind = 'purchase' then 1 else 0 end,
    case when target_fact_kind = 'referral' then 1 else 0 end,
    case when target_fact_kind = 'verified_action' then 1 else 0 end,
    target_activity_code, target_occurred_at, target_evaluated_at
  ) on conflict (organization_id, evaluation_id) do nothing;

  evaluation_public_id := committed.evaluation_public_id;
  transaction_public_id := committed.transaction_public_id;
  outcome := committed.outcome;
  return next;
end;
$$;

create or replace function loyalty_private.record_tier_refund_fact_v2(
  target_organization_id bigint,
  target_original_evaluation_public_id uuid,
  target_refund_evaluation_public_id uuid
)
returns table (fact_public_id uuid, customer_id bigint, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  original_evaluation loyalty_private.programme_evaluations%rowtype;
  refund_evaluation loyalty_private.programme_evaluations%rowtype;
  original_fact loyalty_private.tier_qualification_facts%rowtype;
  existing_fact loyalty_private.tier_qualification_facts%rowtype;
  prior_refunded bigint;
  prior_reversed_points bigint;
  current_refunded bigint;
  current_reversal_points bigint;
  original_eligible bigint;
  original_awarded_points bigint;
  created_fact_public_id uuid;
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
  if original_evaluation.programme_group_id <> refund_evaluation.programme_group_id
    or original_evaluation.programme_version_id <> refund_evaluation.programme_version_id
    or refund_evaluation.result ->> 'orderEventId'
      <> original_evaluation.result ->> 'eventId' then
    raise exception using errcode = '22023',
      message = 'refund tier fact does not match its original award';
  end if;
  select fact.* into strict original_fact
  from loyalty_private.tier_qualification_facts as fact
  where fact.organization_id = target_organization_id
    and fact.evaluation_id = original_evaluation.id
    and fact.fact_kind = 'purchase';
  select fact.* into existing_fact
  from loyalty_private.tier_qualification_facts as fact
  where fact.organization_id = target_organization_id
    and fact.evaluation_id = refund_evaluation.id;
  if found then
    return query select existing_fact.public_id, existing_fact.customer_id,
      'duplicate'::text;
    return;
  end if;

  select coalesce(-sum(fact.eligible_spend_minor_delta), 0)::bigint
    , coalesce(-sum(fact.earned_points_delta), 0)::bigint
  into prior_refunded, prior_reversed_points
  from loyalty_private.tier_qualification_facts as fact
  where fact.organization_id = target_organization_id
    and fact.origin_fact_id = original_fact.id;
  current_refunded := (
    refund_evaluation.result ->> 'cumulativeRefundedEligibleSpendMinor'
  )::bigint;
  original_eligible := (
    refund_evaluation.result ->> 'originalEligibleSpendMinor'
  )::bigint;
  current_reversal_points := (
    refund_evaluation.result ->> 'reversalPoints'
  )::bigint;
  original_awarded_points := original_fact.earned_points_delta;
  if original_eligible <> original_fact.eligible_spend_minor_delta
    or current_refunded < prior_refunded
    or current_refunded > original_eligible
    or current_reversal_points < 0
    or prior_reversed_points + current_reversal_points > original_awarded_points then
    raise exception using errcode = '23514',
      message = 'refund tier fact cumulative spend moved outside its original award';
  end if;

  insert into loyalty_private.tier_qualification_facts (
    organization_id, programme_group_id, source_programme_version_id,
    customer_id, canonical_event_id, evaluation_id, origin_fact_id,
    fact_kind, source_reference, eligible_spend_minor_delta,
    earned_points_delta, order_count_delta, referral_count_delta,
    verified_action_count_delta, activity_code, effective_at, recorded_at
  ) values (
    target_organization_id, original_fact.programme_group_id,
    original_fact.source_programme_version_id, original_fact.customer_id,
    refund_evaluation.canonical_event_id, refund_evaluation.id,
    original_fact.id, 'refund',
    'evaluation:' || refund_evaluation.public_id::text,
    -(current_refunded - prior_refunded),
    -current_reversal_points,
    case when current_refunded = original_eligible
      and prior_refunded < original_eligible then -1 else 0 end,
    0, 0, null, original_fact.effective_at,
    refund_evaluation.evaluated_at
  ) returning public_id into created_fact_public_id;
  return query select created_fact_public_id, original_fact.customer_id,
    'created'::text;
end;
$$;

create or replace function loyalty_private.calculate_tier_metric_snapshot_v2(
  target_organization_id bigint,
  target_programme_group_id bigint,
  target_programme_version_id bigint,
  target_customer_id bigint,
  target_evaluated_at timestamptz
)
returns table (
  window_kind text,
  window_starts_at timestamptz,
  window_ends_at timestamptz,
  metrics jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_policy loyalty.programme_tier_policies%rowtype;
  local_year integer;
  action_counts jsonb;
  spend_total bigint;
  points_total bigint;
  order_total bigint;
  referral_total bigint;
  action_total bigint;
begin
  select policy.* into strict target_policy
  from loyalty.programme_tier_policies as policy
  join loyalty.programme_versions as version
    on version.organization_id = policy.organization_id
   and version.id = policy.programme_version_id
  where policy.organization_id = target_organization_id
    and policy.programme_group_id = target_programme_group_id
    and policy.programme_version_id = target_programme_version_id
    and version.status = 'published';
  window_kind := target_policy.qualification_period_kind;
  if window_kind = 'rolling_days' then
    window_starts_at := target_evaluated_at - pg_catalog.make_interval(
      days => target_policy.rolling_days
    );
    window_ends_at := target_evaluated_at;
  elsif window_kind = 'calendar_year' then
    local_year := extract(
      year from target_evaluated_at at time zone target_policy.calendar_timezone
    )::integer;
    window_starts_at := pg_catalog.make_timestamptz(
      local_year, 1, 1, 0, 0, 0, target_policy.calendar_timezone
    );
    window_ends_at := pg_catalog.make_timestamptz(
      local_year + 1, 1, 1, 0, 0, 0, target_policy.calendar_timezone
    );
  else
    window_starts_at := null;
    window_ends_at := null;
  end if;

  select coalesce(sum(fact.eligible_spend_minor_delta), 0)::bigint,
    coalesce(sum(fact.earned_points_delta), 0)::bigint,
    coalesce(sum(fact.order_count_delta), 0)::bigint,
    coalesce(sum(fact.referral_count_delta), 0)::bigint,
    coalesce(sum(fact.verified_action_count_delta), 0)::bigint
  into spend_total, points_total, order_total, referral_total, action_total
  from loyalty_private.tier_qualification_facts as fact
  where fact.organization_id = target_organization_id
    and fact.programme_group_id = target_programme_group_id
    and fact.customer_id = target_customer_id
    and fact.effective_at <= target_evaluated_at
    and fact.recorded_at <= target_evaluated_at
    and (window_starts_at is null or fact.effective_at >= window_starts_at);
  if spend_total < 0 or points_total < 0 or order_total < 0
    or referral_total < 0 or action_total < 0 then
    raise exception using errcode = '23514',
      message = 'tier qualification facts produce a negative metric';
  end if;
  select coalesce(jsonb_object_agg(grouped.activity_code, grouped.total::text), '{}'::jsonb)
  into action_counts
  from (
    select fact.activity_code,
      sum(fact.verified_action_count_delta)::bigint as total
    from loyalty_private.tier_qualification_facts as fact
    where fact.organization_id = target_organization_id
      and fact.programme_group_id = target_programme_group_id
      and fact.customer_id = target_customer_id
      and fact.activity_code is not null
      and fact.effective_at <= target_evaluated_at
      and fact.recorded_at <= target_evaluated_at
      and (window_starts_at is null or fact.effective_at >= window_starts_at)
    group by fact.activity_code
    having sum(fact.verified_action_count_delta) <> 0
    order by fact.activity_code
  ) as grouped;
  if exists (
    select 1 from jsonb_each_text(action_counts) as action(code, total)
    where action.total::bigint < 0
  ) then
    raise exception using errcode = '23514',
      message = 'tier qualification facts produce a negative action metric';
  end if;
  metrics := jsonb_build_object(
    'eligibleSpendMinor', spend_total::text,
    'earnedPoints', points_total::text,
    'orderCount', order_total::text,
    'referralCount', referral_total::text,
    'verifiedActionCount', action_total::text,
    'verifiedActionCounts', action_counts
  );
  return next;
end;
$$;

create or replace function loyalty_private.get_tier_qualification_context_v2(
  target_organization_id bigint,
  target_programme_group_id bigint,
  target_programme_version_id bigint,
  target_customer_id bigint,
  target_evaluated_at timestamptz
)
returns table (
  metrics jsonb,
  current_tier_code text,
  previously_held_tier_codes text[],
  below_threshold_since timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapshot record;
  target_wallet_id bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'tier:' || target_programme_group_id::text || ':' || target_customer_id::text,
      target_organization_id
    )
  );
  if not exists (
    select 1 from loyalty.customers as customer
    where customer.organization_id = target_organization_id
      and customer.id = target_customer_id and customer.status = 'active'
  ) then
    raise exception using errcode = '22023', message = 'unknown active tier customer';
  end if;
  select * into strict snapshot
  from loyalty_private.calculate_tier_metric_snapshot_v2(
    target_organization_id, target_programme_group_id,
    target_programme_version_id, target_customer_id, target_evaluated_at
  );
  select wallet.id into target_wallet_id
  from loyalty.wallets as wallet
  where wallet.organization_id = target_organization_id
    and wallet.programme_group_id = target_programme_group_id
    and wallet.customer_id = target_customer_id
    and wallet.status = 'active';
  metrics := snapshot.metrics;
  if target_wallet_id is null then
    current_tier_code := null;
    previously_held_tier_codes := array[]::text[];
    below_threshold_since := null;
    return next;
    return;
  end if;
  select membership.tier_code into current_tier_code
  from loyalty.tier_memberships as membership
  where membership.organization_id = target_organization_id
    and membership.wallet_id = target_wallet_id
    and membership.effective_until is null;
  select coalesce(array_agg(history.tier_code order by history.tier_code), array[]::text[])
  into previously_held_tier_codes
  from (
    select distinct membership.tier_code
    from loyalty.tier_memberships as membership
    where membership.organization_id = target_organization_id
      and membership.wallet_id = target_wallet_id
  ) as history;
  select decision.below_threshold_since into below_threshold_since
  from loyalty.tier_decisions as decision
  where decision.organization_id = target_organization_id
    and decision.wallet_id = target_wallet_id
  order by decision.effective_at desc, decision.id desc
  limit 1;
  return next;
end;
$$;

create or replace function loyalty_private.tier_threshold_actual_v2(
  target_metrics jsonb,
  target_metric text,
  target_activity_codes text[]
)
returns bigint
language sql
immutable
security definer
set search_path = ''
as $$
  select case target_metric
    when 'eligible_spend' then (target_metrics ->> 'eligibleSpendMinor')::bigint
    when 'earned_points' then (target_metrics ->> 'earnedPoints')::bigint
    when 'order_count' then (target_metrics ->> 'orderCount')::bigint
    when 'referral_count' then (target_metrics ->> 'referralCount')::bigint
    when 'verified_action_count' then case
      when cardinality(target_activity_codes) = 0
        then (target_metrics ->> 'verifiedActionCount')::bigint
      else coalesce((
        select sum(coalesce(
          (target_metrics -> 'verifiedActionCounts' ->> activity.code)::bigint, 0
        ))::bigint
        from unnest(target_activity_codes) as activity(code)
      ), 0)
    end
    else null
  end;
$$;

create or replace function loyalty_private.record_tier_qualification_decision_v2(
  target_organization_id bigint,
  target_programme_group_id bigint,
  target_programme_version_id bigint,
  target_canonical_event_id bigint,
  target_customer_id bigint,
  target_evaluated_at timestamptz,
  target_result jsonb
)
returns table (tier_decision_public_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  context record;
  snapshot record;
  target_policy loyalty.programme_tier_policies%rowtype;
  current_level loyalty.programme_tier_policy_levels%rowtype;
  level_record loyalty.programme_tier_policy_levels%rowtype;
  target_event_public_id uuid;
  target_wallet_id bigint;
  target_threshold_kind text;
  expression_operator text;
  threshold_total integer;
  threshold_matched integer;
  level_matches boolean;
  qualified_tier_code text;
  qualified_ordinal integer := 1;
  qualified_threshold_kind text := 'base';
  effective_tier_code text;
  expected_transition text;
  expected_below_since timestamptz;
  expected_grace_until timestamptz;
  request_hash bytea;
  result_row record;
begin
  if jsonb_typeof(target_result) <> 'object'
    or target_result ->> 'version' <> '2'
    or not (target_result ?& array[
      'version', 'evaluatedAt', 'window', 'metrics', 'currentTierCode',
      'qualifiedTierCode', 'effectiveTierCode', 'transition',
      'belowThresholdSince', 'graceUntil', 'levels', 'nextMilestone'
    ])
    or target_result - array[
      'version', 'evaluatedAt', 'window', 'metrics', 'currentTierCode',
      'qualifiedTierCode', 'effectiveTierCode', 'transition',
      'belowThresholdSince', 'graceUntil', 'levels', 'nextMilestone'
    ] <> '{}'::jsonb
    or (target_result ->> 'evaluatedAt')::timestamptz <> target_evaluated_at then
    raise exception using errcode = '22023', message = 'invalid live tier evaluation result';
  end if;
  select event.public_id into strict target_event_public_id
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
    and version.programme_group_id = target_programme_group_id
    and version.status = 'published';
  select policy.* into strict target_policy
  from loyalty.programme_tier_policies as policy
  where policy.organization_id = target_organization_id
    and policy.programme_group_id = target_programme_group_id
    and policy.programme_version_id = target_programme_version_id;
  select * into strict context
  from loyalty_private.get_tier_qualification_context_v2(
    target_organization_id, target_programme_group_id,
    target_programme_version_id, target_customer_id, target_evaluated_at
  );
  select * into strict snapshot
  from loyalty_private.calculate_tier_metric_snapshot_v2(
    target_organization_id, target_programme_group_id,
    target_programme_version_id, target_customer_id, target_evaluated_at
  );
  if target_result -> 'metrics' <> context.metrics
    or target_result -> 'currentTierCode'
      <> coalesce(to_jsonb(context.current_tier_code), 'null'::jsonb)
    or target_result -> 'window' ->> 'kind' <> snapshot.window_kind
    or (snapshot.window_starts_at is null)
      <> (target_result -> 'window' -> 'startsAt' = 'null'::jsonb)
    or (snapshot.window_ends_at is null)
      <> (target_result -> 'window' -> 'endsAt' = 'null'::jsonb)
    or (snapshot.window_starts_at is not null and
      (target_result -> 'window' ->> 'startsAt')::timestamptz
        <> snapshot.window_starts_at)
    or (snapshot.window_ends_at is not null and
      (target_result -> 'window' ->> 'endsAt')::timestamptz
        <> snapshot.window_ends_at) then
    raise exception using errcode = '23514',
      message = 'live tier evaluation does not match authoritative metrics';
  end if;

  qualified_tier_code := (
    select level.tier_code from loyalty.programme_tier_policy_levels as level
    where level.organization_id = target_organization_id
      and level.programme_version_id = target_programme_version_id
      and level.ordinal = 1
  );
  if context.current_tier_code is not null then
    select level.* into current_level
    from loyalty.programme_tier_policy_levels as level
    where level.organization_id = target_organization_id
      and level.programme_version_id = target_programme_version_id
      and level.tier_code = context.current_tier_code;
    if not found then
      raise exception using errcode = '23514',
        message = 'current tier has no explicit advanced-policy migration';
    end if;
  end if;

  for level_record in
    select level.* from loyalty.programme_tier_policy_levels as level
    where level.organization_id = target_organization_id
      and level.programme_version_id = target_programme_version_id
    order by level.ordinal
  loop
    if level_record.ordinal = 1 then
      continue;
    end if;
    if context.current_tier_code = level_record.tier_code then
      target_threshold_kind := 'retention';
      expression_operator := level_record.retention_operator;
    elsif level_record.tier_code = any(context.previously_held_tier_codes) then
      target_threshold_kind := 'reentry';
      expression_operator := level_record.reentry_operator;
    else
      target_threshold_kind := 'entry';
      expression_operator := level_record.entry_operator;
    end if;
    select count(*)::integer,
      count(*) filter (
        where loyalty_private.tier_threshold_actual_v2(
          context.metrics, threshold.metric, threshold.activity_codes
        ) >= threshold.minimum_value
      )::integer
    into threshold_total, threshold_matched
    from loyalty.programme_tier_thresholds as threshold
    where threshold.organization_id = target_organization_id
      and threshold.programme_version_id = target_programme_version_id
      and threshold.tier_code = level_record.tier_code
      and threshold.threshold_kind = target_threshold_kind;
    level_matches := case expression_operator
      when 'all' then threshold_total > 0 and threshold_matched = threshold_total
      when 'any' then threshold_matched > 0
      else false
    end;
    if level_matches then
      qualified_tier_code := level_record.tier_code;
      qualified_ordinal := level_record.ordinal;
      qualified_threshold_kind := target_threshold_kind;
    end if;
  end loop;

  if context.current_tier_code is null then
    effective_tier_code := qualified_tier_code;
    expected_transition := 'entry';
  elsif qualified_ordinal > current_level.ordinal then
    effective_tier_code := qualified_tier_code;
    expected_transition := case when qualified_threshold_kind = 'reentry'
      then 'reentry' else 'upgrade' end;
  elsif qualified_ordinal = current_level.ordinal then
    effective_tier_code := qualified_tier_code;
    expected_transition := 'none';
  elsif target_policy.downgrade_grace_days = 0 then
    effective_tier_code := qualified_tier_code;
    expected_transition := 'downgrade';
  else
    expected_below_since := coalesce(
      context.below_threshold_since, target_evaluated_at
    );
    expected_grace_until := expected_below_since + pg_catalog.make_interval(
      days => target_policy.downgrade_grace_days
    );
    if target_evaluated_at < expected_grace_until then
      effective_tier_code := context.current_tier_code;
      expected_transition := 'grace';
    else
      effective_tier_code := qualified_tier_code;
      expected_transition := 'downgrade';
    end if;
  end if;

  if target_result ->> 'qualifiedTierCode' <> qualified_tier_code
    or target_result ->> 'effectiveTierCode' <> effective_tier_code
    or target_result ->> 'transition' <> expected_transition
    or (expected_below_since is null)
      <> (target_result -> 'belowThresholdSince' = 'null'::jsonb)
    or (expected_grace_until is null)
      <> (target_result -> 'graceUntil' = 'null'::jsonb)
    or (expected_below_since is not null and
      (target_result ->> 'belowThresholdSince')::timestamptz
        <> expected_below_since)
    or (expected_grace_until is not null and
      (target_result ->> 'graceUntil')::timestamptz
        <> expected_grace_until) then
    raise exception using errcode = '23514',
      message = 'live tier evaluation does not match authoritative transition';
  end if;

  target_wallet_id := loyalty_private.ensure_wallet_accounts(
    target_organization_id, target_programme_group_id, target_customer_id
  );
  request_hash := extensions.digest(
    pg_catalog.convert_to(target_result::text, 'utf8'), 'sha256'
  );
  select * into strict result_row
  from loyalty_private.record_tier_decision(
    target_organization_id, target_programme_group_id,
    target_programme_version_id, target_wallet_id, effective_tier_code,
    qualified_tier_code, expected_transition,
    (context.metrics ->> 'eligibleSpendMinor')::bigint,
    expected_below_since, expected_grace_until, target_evaluated_at,
    'tier:v2:event:' || target_event_public_id::text ||
      ':version:' || target_programme_version_id::text,
    request_hash, target_result
  );
  return query select result_row.tier_decision_public_id, result_row.outcome;
end;
$$;

alter function loyalty_private.commit_programme_v2_award_core(
  bigint, bigint, bigint, bigint, bigint, text, text, text, bytea, bytea,
  jsonb, jsonb, timestamptz, timestamptz
) owner to loyalty_owner;
alter function loyalty_private.commit_programme_v2_award(
  bigint, bigint, bigint, bigint, bigint, text, text, text, bytea, bytea,
  jsonb, jsonb, timestamptz, timestamptz
) owner to loyalty_owner;
alter function loyalty_private.record_tier_refund_fact_v2(bigint, uuid, uuid)
  owner to loyalty_owner;
alter function loyalty_private.calculate_tier_metric_snapshot_v2(
  bigint, bigint, bigint, bigint, timestamptz
) owner to loyalty_owner;
alter function loyalty_private.get_tier_qualification_context_v2(
  bigint, bigint, bigint, bigint, timestamptz
) owner to loyalty_owner;
alter function loyalty_private.tier_threshold_actual_v2(jsonb, text, text[])
  owner to loyalty_owner;
alter function loyalty_private.record_tier_qualification_decision_v2(
  bigint, bigint, bigint, bigint, bigint, timestamptz, jsonb
) owner to loyalty_owner;

alter table loyalty_private.tier_qualification_facts enable row level security;
create policy tier_qualification_facts_worker_select
  on loyalty_private.tier_qualification_facts
  for select to loyalty_worker using (true);

revoke all on loyalty_private.tier_qualification_facts
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

revoke all on function loyalty_private.commit_programme_v2_award_core(
    bigint, bigint, bigint, bigint, bigint, text, text, text, bytea, bytea,
    jsonb, jsonb, timestamptz, timestamptz
  ),
  loyalty_private.commit_programme_v2_award(
    bigint, bigint, bigint, bigint, bigint, text, text, text, bytea, bytea,
    jsonb, jsonb, timestamptz, timestamptz
  ),
  loyalty_private.record_tier_refund_fact_v2(bigint, uuid, uuid),
  loyalty_private.calculate_tier_metric_snapshot_v2(
    bigint, bigint, bigint, bigint, timestamptz
  ),
  loyalty_private.get_tier_qualification_context_v2(
    bigint, bigint, bigint, bigint, timestamptz
  ),
  loyalty_private.tier_threshold_actual_v2(jsonb, text, text[]),
  loyalty_private.record_tier_qualification_decision_v2(
    bigint, bigint, bigint, bigint, bigint, timestamptz, jsonb
  ) from public, anon, authenticated, loyalty_runtime, loyalty_worker;

grant execute on function loyalty_private.commit_programme_v2_award(
    bigint, bigint, bigint, bigint, bigint, text, text, text, bytea, bytea,
    jsonb, jsonb, timestamptz, timestamptz
  ),
  loyalty_private.record_tier_refund_fact_v2(bigint, uuid, uuid),
  loyalty_private.get_tier_qualification_context_v2(
    bigint, bigint, bigint, bigint, timestamptz
  ),
  loyalty_private.record_tier_qualification_decision_v2(
    bigint, bigint, bigint, bigint, bigint, timestamptz, jsonb
  ) to loyalty_worker;

comment on table loyalty_private.tier_qualification_facts is
  'Immutable event-time member metrics; refunds compensate the original purchase instant instead of rewriting it.';
comment on function loyalty_private.get_tier_qualification_context_v2(
  bigint, bigint, bigint, bigint, timestamptz
) is 'Returns one serialized authoritative metric snapshot and current/history state for the shared pure evaluator.';
comment on function loyalty_private.record_tier_qualification_decision_v2(
  bigint, bigint, bigint, bigint, bigint, timestamptz, jsonb
) is 'Independently rechecks metrics thresholds transition and grace before appending tier decision and membership history.';
