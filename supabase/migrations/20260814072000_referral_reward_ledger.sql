-- M06 leased, two-sided referral reward issuance and atomic compensation.

alter table loyalty_private.programme_evaluations
  drop constraint programme_evaluations_evaluation_kind_check,
  add constraint programme_evaluations_evaluation_kind_check
    check (evaluation_kind in (
      'live_award', 'live_refund', 'referral_qualification',
      'referral_reward', 'referral_reward_reversal',
      'simulation', 'tier_review'
    ));

alter table loyalty_private.tier_qualification_facts
  drop constraint tier_qualification_facts_fact_kind_check,
  drop constraint tier_qualification_facts_check1,
  add constraint tier_qualification_facts_fact_kind_check
    check (fact_kind in (
      'purchase', 'refund', 'points_adjustment', 'referral',
      'referral_reversal', 'verified_action'
    )),
  add constraint tier_qualification_facts_shape_check check (
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
    or (fact_kind = 'referral_reversal'
      and eligible_spend_minor_delta = 0 and earned_points_delta <= 0
      and order_count_delta = 0 and referral_count_delta in (-1, 0)
      and verified_action_count_delta = 0 and activity_code is null
      and origin_fact_id is not null)
    or (fact_kind = 'verified_action'
      and eligible_spend_minor_delta = 0 and earned_points_delta >= 0
      and order_count_delta = 0 and referral_count_delta = 0
      and verified_action_count_delta = 1 and activity_code is not null
      and origin_fact_id is null)
    or (fact_kind = 'points_adjustment'
      and eligible_spend_minor_delta = 0 and order_count_delta = 0
      and referral_count_delta = 0 and verified_action_count_delta = 0
      and activity_code is null and origin_fact_id is null)
  );

create table loyalty_private.referral_reward_jobs (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  attribution_id bigint not null,
  state text not null default 'pending' check (state in (
    'pending', 'processing', 'retryable', 'completed', 'cancelled', 'manual_review'
  )),
  attempt_count smallint not null default 0 check (attempt_count between 0 and 10),
  next_attempt_at timestamptz not null,
  lease_owner text,
  lease_expires_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, attribution_id),
  foreign key (organization_id, attribution_id)
    references loyalty.referral_attributions(organization_id, id) on delete restrict,
  check (updated_at >= created_at),
  check (length(coalesce(lease_owner, '')) <= 200),
  check (last_error_code is null or last_error_code ~ '^[a-z][a-z0-9_.-]{0,99}$'),
  check ((state = 'processing') = (lease_owner is not null and lease_expires_at is not null))
);

create index referral_reward_jobs_claim_idx
  on loyalty_private.referral_reward_jobs (next_attempt_at, id)
  where state in ('pending', 'retryable');
create index referral_reward_jobs_lease_idx
  on loyalty_private.referral_reward_jobs (lease_expires_at, id)
  where state = 'processing';

create table loyalty_private.referral_reward_job_attempts (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  job_id bigint not null,
  attempt_number smallint not null check (attempt_number between 1 and 10),
  outcome text not null check (outcome in (
    'completed', 'retryable', 'manual_review', 'cancelled', 'lease_expired'
  )),
  error_code text,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, job_id, attempt_number),
  foreign key (organization_id, job_id)
    references loyalty_private.referral_reward_jobs(organization_id, id) on delete restrict,
  check (error_code is null or error_code ~ '^[a-z][a-z0-9_.-]{0,99}$')
);

create table loyalty_private.referral_reward_issuances (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  attribution_id bigint not null,
  qualification_fact_id bigint not null,
  advocate_customer_id bigint not null,
  friend_customer_id bigint not null,
  advocate_evaluation_id bigint not null,
  friend_evaluation_id bigint not null,
  advocate_origin_entry_id bigint not null,
  friend_origin_entry_id bigint not null,
  advocate_award_transaction_id bigint not null,
  advocate_release_transaction_id bigint not null,
  friend_award_transaction_id bigint not null,
  friend_release_transaction_id bigint not null,
  advocate_points bigint not null check (advocate_points > 0),
  friend_points bigint not null check (friend_points > 0),
  available_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, attribution_id),
  foreign key (organization_id, attribution_id)
    references loyalty.referral_attributions(organization_id, id) on delete restrict,
  foreign key (organization_id, qualification_fact_id)
    references loyalty_private.referral_qualification_facts(organization_id, id) on delete restrict,
  foreign key (organization_id, advocate_customer_id)
    references loyalty.customers(organization_id, id) on delete restrict,
  foreign key (organization_id, friend_customer_id)
    references loyalty.customers(organization_id, id) on delete restrict,
  foreign key (organization_id, advocate_evaluation_id)
    references loyalty_private.programme_evaluations(organization_id, id) on delete restrict,
  foreign key (organization_id, friend_evaluation_id)
    references loyalty_private.programme_evaluations(organization_id, id) on delete restrict,
  foreign key (organization_id, advocate_origin_entry_id)
    references loyalty.ledger_entries(organization_id, id) on delete restrict,
  foreign key (organization_id, friend_origin_entry_id)
    references loyalty.ledger_entries(organization_id, id) on delete restrict,
  foreign key (organization_id, advocate_award_transaction_id)
    references loyalty.ledger_transactions(organization_id, id) on delete restrict,
  foreign key (organization_id, advocate_release_transaction_id)
    references loyalty.ledger_transactions(organization_id, id) on delete restrict,
  foreign key (organization_id, friend_award_transaction_id)
    references loyalty.ledger_transactions(organization_id, id) on delete restrict,
  foreign key (organization_id, friend_release_transaction_id)
    references loyalty.ledger_transactions(organization_id, id) on delete restrict,
  check (advocate_customer_id <> friend_customer_id),
  check (expires_at > available_at)
);

create table loyalty_private.referral_reward_compensations (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  attribution_id bigint not null,
  issuance_id bigint not null,
  refund_event_id bigint not null,
  advocate_reversal_evaluation_id bigint not null,
  friend_reversal_evaluation_id bigint not null,
  advocate_reversal_transaction_id bigint not null,
  friend_reversal_transaction_id bigint not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, attribution_id),
  foreign key (organization_id, attribution_id)
    references loyalty.referral_attributions(organization_id, id) on delete restrict,
  foreign key (organization_id, issuance_id)
    references loyalty_private.referral_reward_issuances(organization_id, id) on delete restrict,
  foreign key (organization_id, refund_event_id)
    references loyalty_private.canonical_commerce_events(organization_id, id) on delete restrict,
  foreign key (organization_id, advocate_reversal_evaluation_id)
    references loyalty_private.programme_evaluations(organization_id, id) on delete restrict,
  foreign key (organization_id, friend_reversal_evaluation_id)
    references loyalty_private.programme_evaluations(organization_id, id) on delete restrict,
  foreign key (organization_id, advocate_reversal_transaction_id)
    references loyalty.ledger_transactions(organization_id, id) on delete restrict,
  foreign key (organization_id, friend_reversal_transaction_id)
    references loyalty.ledger_transactions(organization_id, id) on delete restrict
);

create trigger referral_reward_job_attempts_immutable
before update or delete on loyalty_private.referral_reward_job_attempts
for each row execute function loyalty_private.reject_immutable_change();
create trigger referral_reward_issuances_immutable
before update or delete on loyalty_private.referral_reward_issuances
for each row execute function loyalty_private.reject_immutable_change();
create trigger referral_reward_compensations_immutable
before update or delete on loyalty_private.referral_reward_compensations
for each row execute function loyalty_private.reject_immutable_change();

create or replace function loyalty_private.enqueue_referral_reward_job_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_cooling_ends_at timestamptz;
begin
  if new.to_state <> 'cooling' then
    return new;
  end if;
  select fact.cooling_ends_at into strict target_cooling_ends_at
  from loyalty_private.referral_qualification_facts as fact
  where fact.organization_id = new.organization_id
    and fact.attribution_id = new.attribution_id
    and fact.decision = 'eligible';
  insert into loyalty_private.referral_reward_jobs (
    organization_id, attribution_id, next_attempt_at
  ) values (
    new.organization_id, new.attribution_id, target_cooling_ends_at
  ) on conflict (organization_id, attribution_id) do nothing;
  return new;
end;
$$;

create trigger referral_transition_enqueue_reward_job
after insert on loyalty.referral_attribution_transitions
for each row execute function loyalty_private.enqueue_referral_reward_job_v1();

insert into loyalty_private.referral_reward_jobs (
  organization_id, attribution_id, next_attempt_at
)
select fact.organization_id, fact.attribution_id, fact.cooling_ends_at
from loyalty_private.referral_qualification_facts as fact
where fact.decision = 'eligible'
  and exists (
    select 1 from loyalty.referral_attribution_transitions as transition
    where transition.organization_id = fact.organization_id
      and transition.attribution_id = fact.attribution_id
      and transition.to_state = 'cooling'
      and not exists (
        select 1 from loyalty.referral_attribution_transitions as later
        where later.organization_id = transition.organization_id
          and later.attribution_id = transition.attribution_id
          and later.id > transition.id
      )
  )
on conflict (organization_id, attribution_id) do nothing;

create or replace function loyalty_private.claim_due_referral_reward_jobs_v1(
  target_worker_id text,
  target_limit integer default 25,
  target_lease_seconds integer default 60
)
returns table (job_id uuid, attribution_id uuid, attempt_count smallint)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(length(target_worker_id), 0) not between 1 and 200
    or target_limit not between 1 and 50
    or target_lease_seconds not between 15 and 300 then
    raise exception using errcode = '22023',
      message = 'invalid referral reward job claim';
  end if;

  insert into loyalty_private.referral_reward_job_attempts (
    organization_id, job_id, attempt_number, outcome, error_code
  )
  select job.organization_id, job.id, job.attempt_count, 'lease_expired',
    'lease_expired'
  from loyalty_private.referral_reward_jobs as job
  where job.state = 'processing' and job.lease_expires_at <= clock_timestamp()
  on conflict do nothing;

  update loyalty_private.referral_reward_jobs as job
  set state = case when job.attempt_count >= 10
      then 'manual_review' else 'retryable' end,
    next_attempt_at = clock_timestamp(), lease_owner = null,
    lease_expires_at = null, last_error_code = 'lease_expired',
    updated_at = clock_timestamp()
  where job.state = 'processing' and job.lease_expires_at <= clock_timestamp();

  return query
  with candidates as (
    select job.id
    from loyalty_private.referral_reward_jobs as job
    where job.state in ('pending', 'retryable')
      and job.attempt_count < 10
      and job.next_attempt_at <= clock_timestamp()
    order by job.next_attempt_at, job.id
    for update of job skip locked
    limit target_limit
  ), claimed as (
    update loyalty_private.referral_reward_jobs as job
    set state = 'processing', attempt_count = job.attempt_count + 1,
      lease_owner = target_worker_id,
      lease_expires_at = clock_timestamp()
        + pg_catalog.make_interval(secs => target_lease_seconds),
      last_error_code = null, updated_at = clock_timestamp()
    from candidates
    where job.id = candidates.id
    returning job.public_id, job.attribution_id, job.attempt_count
  )
  select claimed.public_id, attribution.public_id, claimed.attempt_count
  from claimed
  join loyalty.referral_attributions as attribution
    on attribution.id = claimed.attribution_id
  order by claimed.attempt_count, claimed.public_id;
end;
$$;

create or replace function loyalty_private.finish_referral_reward_job_v1(
  target_job_public_id uuid,
  target_worker_id text,
  target_error_code text,
  target_retry_delay_seconds integer default 60
)
returns table (state text, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_job loyalty_private.referral_reward_jobs%rowtype;
  next_state text;
begin
  if coalesce(length(target_worker_id), 0) not between 1 and 200
    or coalesce(target_error_code, '') !~ '^[a-z][a-z0-9_.-]{0,99}$'
    or target_retry_delay_seconds not between 1 and 3600 then
    raise exception using errcode = '22023',
      message = 'invalid referral reward job result';
  end if;
  select job.* into strict target_job
  from loyalty_private.referral_reward_jobs as job
  where job.public_id = target_job_public_id for update;
  if target_job.state <> 'processing' or target_job.lease_owner <> target_worker_id then
    return query select target_job.state, 'state_final'::text;
    return;
  end if;
  next_state := case when target_job.attempt_count >= 10
    then 'manual_review' else 'retryable' end;
  insert into loyalty_private.referral_reward_job_attempts (
    organization_id, job_id, attempt_number, outcome, error_code
  ) values (
    target_job.organization_id, target_job.id, target_job.attempt_count,
    next_state, target_error_code
  ) on conflict (organization_id, job_id, attempt_number) do nothing;
  update loyalty_private.referral_reward_jobs
  set state = next_state,
    next_attempt_at = clock_timestamp()
      + pg_catalog.make_interval(secs => target_retry_delay_seconds),
    lease_owner = null, lease_expires_at = null,
    last_error_code = target_error_code, updated_at = clock_timestamp()
  where id = target_job.id;
  return query select next_state, next_state;
end;
$$;

create or replace function loyalty_private.issue_referral_reward_job_v1(
  target_job_public_id uuid,
  target_worker_id text
)
returns table (
  attribution_id uuid,
  issuance_id uuid,
  state text,
  outcome text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_job loyalty_private.referral_reward_jobs%rowtype;
  target_attribution loyalty.referral_attributions%rowtype;
  target_policy loyalty.programme_referral_policies%rowtype;
  target_fact loyalty_private.referral_qualification_facts%rowtype;
  target_event loyalty_private.canonical_commerce_events%rowtype;
  target_advocate loyalty.referral_advocates%rowtype;
  target_expiry_policy loyalty.programme_point_expiry_policies%rowtype;
  target_current_state text;
  target_available_at timestamptz;
  target_expires_at timestamptz;
  target_evaluated_at timestamptz := clock_timestamp();
  target_input jsonb;
  target_result jsonb;
  target_explanation jsonb;
  target_input_hash bytea;
  target_result_hash bytea;
  target_award_hash bytea;
  target_release_hash bytea;
  advocate_evaluation_public_id uuid;
  friend_evaluation_public_id uuid;
  advocate_evaluation loyalty_private.programme_evaluations%rowtype;
  friend_evaluation loyalty_private.programme_evaluations%rowtype;
  advocate_award_public_id uuid;
  friend_award_public_id uuid;
  advocate_release_public_id uuid;
  friend_release_public_id uuid;
  advocate_award loyalty.ledger_transactions%rowtype;
  friend_award loyalty.ledger_transactions%rowtype;
  advocate_release loyalty.ledger_transactions%rowtype;
  friend_release loyalty.ledger_transactions%rowtype;
  advocate_origin loyalty.ledger_entries%rowtype;
  friend_origin loyalty.ledger_entries%rowtype;
  created_issuance_id bigint;
  created_issuance_public_id uuid;
begin
  if coalesce(length(target_worker_id), 0) not between 1 and 200 then
    raise exception using errcode = '22023',
      message = 'invalid referral reward worker';
  end if;

  select job.* into strict target_job
  from loyalty_private.referral_reward_jobs as job
  where job.public_id = target_job_public_id;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'referral-qualification:' || target_job.attribution_id::text,
    target_job.organization_id
  ));
  select job.* into strict target_job
  from loyalty_private.referral_reward_jobs as job
  where job.public_id = target_job_public_id for update;
  select attribution.* into strict target_attribution
  from loyalty.referral_attributions as attribution
  where attribution.organization_id = target_job.organization_id
    and attribution.id = target_job.attribution_id;

  if target_job.state = 'completed' then
    select issuance.public_id into strict created_issuance_public_id
    from loyalty_private.referral_reward_issuances as issuance
    where issuance.organization_id = target_job.organization_id
      and issuance.attribution_id = target_job.attribution_id;
    return query select target_attribution.public_id,
      created_issuance_public_id, 'qualified'::text, 'duplicate'::text;
    return;
  end if;
  if target_job.state <> 'processing'
    or target_job.lease_owner <> target_worker_id
    or target_job.lease_expires_at <= clock_timestamp() then
    raise exception using errcode = '42501',
      message = 'referral reward job lease is inactive';
  end if;

  select transition.to_state into strict target_current_state
  from loyalty.referral_attribution_transitions as transition
  where transition.organization_id = target_attribution.organization_id
    and transition.attribution_id = target_attribution.id
  order by transition.id desc limit 1;
  if target_current_state <> 'cooling' then
    insert into loyalty_private.referral_reward_job_attempts (
      organization_id, job_id, attempt_number, outcome, error_code
    ) values (
      target_job.organization_id, target_job.id, target_job.attempt_count,
      'cancelled', 'attribution_state_final'
    ) on conflict (organization_id, job_id, attempt_number) do nothing;
    update loyalty_private.referral_reward_jobs
    set state = 'cancelled', lease_owner = null, lease_expires_at = null,
      last_error_code = 'attribution_state_final', updated_at = clock_timestamp()
    where id = target_job.id;
    return query select target_attribution.public_id, null::uuid,
      target_current_state, 'state_final'::text;
    return;
  end if;

  select fact.* into strict target_fact
  from loyalty_private.referral_qualification_facts as fact
  where fact.organization_id = target_attribution.organization_id
    and fact.attribution_id = target_attribution.id
    and fact.decision = 'eligible';
  if target_fact.cooling_ends_at > clock_timestamp() then
    raise exception using errcode = '55000',
      message = 'referral cooling period is not complete';
  end if;
  select policy.* into strict target_policy
  from loyalty.programme_referral_policies as policy
  where policy.organization_id = target_attribution.organization_id
    and policy.programme_group_id = target_attribution.programme_group_id
    and policy.programme_version_id = target_attribution.programme_version_id;
  select event.* into strict target_event
  from loyalty_private.canonical_commerce_events as event
  where event.organization_id = target_fact.organization_id
    and event.id = target_fact.canonical_event_id;
  select advocate.* into strict target_advocate
  from loyalty.referral_advocates as advocate
  where advocate.organization_id = target_attribution.organization_id
    and advocate.id = target_attribution.advocate_id;
  select policy.* into strict target_expiry_policy
  from loyalty.programme_point_expiry_policies as policy
  where policy.organization_id = target_attribution.organization_id
    and policy.programme_group_id = target_attribution.programme_group_id
    and policy.programme_version_id = target_attribution.programme_version_id;

  target_available_at := target_fact.cooling_ends_at;
  target_expires_at := target_available_at + pg_catalog.make_interval(
    days => target_expiry_policy.expire_after_days
  );
  target_input := jsonb_build_object(
    'version', '1', 'attributionId', target_attribution.public_id,
    'qualificationFactId', target_fact.public_id,
    'programmeVersionId', target_attribution.programme_version_id
  );
  target_explanation := jsonb_build_object(
    'rule', 'referral_qualification',
    'qualifiedAt', target_fact.qualified_at,
    'coolingEndedAt', target_available_at,
    'expiresAt', target_expires_at
  );
  target_input_hash := extensions.digest(
    pg_catalog.convert_to(target_input::text, 'utf8'), 'sha256'
  );

  target_result := jsonb_build_object(
    'version', '1', 'source', 'referral', 'side', 'advocate',
    'awardedPoints', target_policy.advocate_reward_points,
    'attributionId', target_attribution.public_id,
    'eventId', target_event.public_id
  );
  target_result_hash := extensions.digest(
    pg_catalog.convert_to(target_result::text, 'utf8'), 'sha256'
  );
  select evaluation.evaluation_public_id into strict advocate_evaluation_public_id
  from loyalty_private.record_programme_evaluation(
    target_attribution.organization_id, target_attribution.programme_group_id,
    target_attribution.programme_version_id, target_event.id,
    'referral_reward',
    'referral:' || target_attribution.public_id::text || ':advocate',
    'referral-reward:' || target_attribution.public_id::text || ':advocate:evaluation',
    target_input_hash, target_result_hash, target_result,
    target_explanation || jsonb_build_object('side', 'advocate'),
    target_evaluated_at
  ) as evaluation;
  select evaluation.* into strict advocate_evaluation
  from loyalty_private.programme_evaluations as evaluation
  where evaluation.organization_id = target_attribution.organization_id
    and evaluation.public_id = advocate_evaluation_public_id;
  target_award_hash := extensions.digest(pg_catalog.convert_to(
    jsonb_build_object(
      'operation', 'referral_award', 'side', 'advocate',
      'attributionId', target_attribution.public_id,
      'points', target_policy.advocate_reward_points
    )::text, 'utf8'
  ), 'sha256');
  select award.transaction_public_id into strict advocate_award_public_id
  from loyalty_private.award_points(
    target_attribution.organization_id, target_attribution.programme_group_id,
    target_attribution.programme_version_id, target_advocate.customer_id,
    target_policy.advocate_reward_points,
    'referral-reward:' || target_attribution.public_id::text || ':advocate:award',
    target_award_hash, target_event.id,
    'referral:' || target_attribution.public_id::text || ':advocate',
    target_available_at
  ) as award;
  select transaction.* into strict advocate_award
  from loyalty.ledger_transactions as transaction
  where transaction.organization_id = target_attribution.organization_id
    and transaction.public_id = advocate_award_public_id;
  select entry.* into strict advocate_origin
  from loyalty.ledger_entries as entry
  join loyalty.ledger_accounts as account on account.id = entry.account_id
  where entry.organization_id = target_attribution.organization_id
    and entry.transaction_id = advocate_award.id
    and account.account_kind = 'pending' and entry.points > 0;
  target_release_hash := extensions.digest(pg_catalog.convert_to(
    jsonb_build_object(
      'operation', 'referral_release', 'side', 'advocate',
      'attributionId', target_attribution.public_id,
      'originEntryId', advocate_origin.public_id,
      'expiresAt', target_expires_at
    )::text, 'utf8'
  ), 'sha256');
  select release.transaction_public_id into strict advocate_release_public_id
  from loyalty_private.release_points(
    target_attribution.organization_id, target_attribution.programme_group_id,
    target_attribution.programme_version_id, advocate_origin.public_id,
    target_expires_at,
    'referral-reward:' || target_attribution.public_id::text || ':advocate:release',
    target_release_hash, target_available_at
  ) as release;
  select transaction.* into strict advocate_release
  from loyalty.ledger_transactions as transaction
  where transaction.organization_id = target_attribution.organization_id
    and transaction.public_id = advocate_release_public_id;

  target_result := jsonb_build_object(
    'version', '1', 'source', 'referral', 'side', 'friend',
    'awardedPoints', target_policy.friend_reward_points,
    'attributionId', target_attribution.public_id,
    'eventId', target_event.public_id
  );
  target_result_hash := extensions.digest(
    pg_catalog.convert_to(target_result::text, 'utf8'), 'sha256'
  );
  select evaluation.evaluation_public_id into strict friend_evaluation_public_id
  from loyalty_private.record_programme_evaluation(
    target_attribution.organization_id, target_attribution.programme_group_id,
    target_attribution.programme_version_id, target_event.id,
    'referral_reward',
    'referral:' || target_attribution.public_id::text || ':friend',
    'referral-reward:' || target_attribution.public_id::text || ':friend:evaluation',
    target_input_hash, target_result_hash, target_result,
    target_explanation || jsonb_build_object('side', 'friend'),
    target_evaluated_at
  ) as evaluation;
  select evaluation.* into strict friend_evaluation
  from loyalty_private.programme_evaluations as evaluation
  where evaluation.organization_id = target_attribution.organization_id
    and evaluation.public_id = friend_evaluation_public_id;
  target_award_hash := extensions.digest(pg_catalog.convert_to(
    jsonb_build_object(
      'operation', 'referral_award', 'side', 'friend',
      'attributionId', target_attribution.public_id,
      'points', target_policy.friend_reward_points
    )::text, 'utf8'
  ), 'sha256');
  select award.transaction_public_id into strict friend_award_public_id
  from loyalty_private.award_points(
    target_attribution.organization_id, target_attribution.programme_group_id,
    target_attribution.programme_version_id, target_attribution.friend_customer_id,
    target_policy.friend_reward_points,
    'referral-reward:' || target_attribution.public_id::text || ':friend:award',
    target_award_hash, target_event.id,
    'referral:' || target_attribution.public_id::text || ':friend',
    target_available_at
  ) as award;
  select transaction.* into strict friend_award
  from loyalty.ledger_transactions as transaction
  where transaction.organization_id = target_attribution.organization_id
    and transaction.public_id = friend_award_public_id;
  select entry.* into strict friend_origin
  from loyalty.ledger_entries as entry
  join loyalty.ledger_accounts as account on account.id = entry.account_id
  where entry.organization_id = target_attribution.organization_id
    and entry.transaction_id = friend_award.id
    and account.account_kind = 'pending' and entry.points > 0;
  target_release_hash := extensions.digest(pg_catalog.convert_to(
    jsonb_build_object(
      'operation', 'referral_release', 'side', 'friend',
      'attributionId', target_attribution.public_id,
      'originEntryId', friend_origin.public_id,
      'expiresAt', target_expires_at
    )::text, 'utf8'
  ), 'sha256');
  select release.transaction_public_id into strict friend_release_public_id
  from loyalty_private.release_points(
    target_attribution.organization_id, target_attribution.programme_group_id,
    target_attribution.programme_version_id, friend_origin.public_id,
    target_expires_at,
    'referral-reward:' || target_attribution.public_id::text || ':friend:release',
    target_release_hash, target_available_at
  ) as release;
  select transaction.* into strict friend_release
  from loyalty.ledger_transactions as transaction
  where transaction.organization_id = target_attribution.organization_id
    and transaction.public_id = friend_release_public_id;

  insert into loyalty_private.tier_qualification_facts (
    organization_id, programme_group_id, source_programme_version_id,
    customer_id, canonical_event_id, evaluation_id, fact_kind,
    source_reference, eligible_spend_minor_delta, earned_points_delta,
    order_count_delta, referral_count_delta, verified_action_count_delta,
    activity_code, effective_at, recorded_at
  ) values (
    target_attribution.organization_id, target_attribution.programme_group_id,
    target_attribution.programme_version_id, target_advocate.customer_id,
    target_event.id, advocate_evaluation.id, 'referral',
    'evaluation:' || advocate_evaluation.public_id::text,
    0, target_policy.advocate_reward_points, 0, 1, 0, null,
    target_available_at, greatest(target_evaluated_at, target_available_at)
  ), (
    target_attribution.organization_id, target_attribution.programme_group_id,
    target_attribution.programme_version_id, target_attribution.friend_customer_id,
    target_event.id, friend_evaluation.id, 'points_adjustment',
    'evaluation:' || friend_evaluation.public_id::text,
    0, target_policy.friend_reward_points, 0, 0, 0, null,
    target_available_at, greatest(target_evaluated_at, target_available_at)
  ) on conflict (organization_id, evaluation_id) do nothing;

  insert into loyalty_private.referral_reward_issuances (
    organization_id, attribution_id, qualification_fact_id,
    advocate_customer_id, friend_customer_id,
    advocate_evaluation_id, friend_evaluation_id,
    advocate_origin_entry_id, friend_origin_entry_id,
    advocate_award_transaction_id, advocate_release_transaction_id,
    friend_award_transaction_id, friend_release_transaction_id,
    advocate_points, friend_points, available_at, expires_at
  ) values (
    target_attribution.organization_id, target_attribution.id, target_fact.id,
    target_advocate.customer_id, target_attribution.friend_customer_id,
    advocate_evaluation.id, friend_evaluation.id,
    advocate_origin.id, friend_origin.id,
    advocate_award.id, advocate_release.id,
    friend_award.id, friend_release.id,
    target_policy.advocate_reward_points, target_policy.friend_reward_points,
    target_available_at, target_expires_at
  ) returning id, public_id into created_issuance_id, created_issuance_public_id;

  insert into loyalty.referral_attribution_transitions (
    organization_id, attribution_id, from_state, to_state, reason_code,
    actor_kind, actor_user_id, idempotency_key
  ) values (
    target_attribution.organization_id, target_attribution.id,
    'cooling', 'qualified', 'cooling_completed', 'system', null,
    'reward:' || target_attribution.public_id::text
  );
  insert into loyalty_private.referral_reward_job_attempts (
    organization_id, job_id, attempt_number, outcome, error_code
  ) values (
    target_job.organization_id, target_job.id, target_job.attempt_count,
    'completed', null
  );
  update loyalty_private.referral_reward_jobs
  set state = 'completed', lease_owner = null, lease_expires_at = null,
    last_error_code = null, updated_at = clock_timestamp()
  where id = target_job.id;

  return query select target_attribution.public_id,
    created_issuance_public_id, 'qualified'::text, 'created'::text;
end;
$$;

create or replace function loyalty_private.reject_referral_for_refund_v1(
  target_event_public_id uuid
)
returns table (attribution_id uuid, state text, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_event loyalty_private.canonical_commerce_events%rowtype;
  target_attribution loyalty.referral_attributions%rowtype;
  target_issuance loyalty_private.referral_reward_issuances%rowtype;
  target_state text;
  target_evaluated_at timestamptz := clock_timestamp();
  target_input jsonb;
  target_result jsonb;
  target_explanation jsonb;
  target_input_hash bytea;
  target_result_hash bytea;
  target_request_hash bytea;
  advocate_reversal_evaluation_public_id uuid;
  friend_reversal_evaluation_public_id uuid;
  advocate_reversal_evaluation loyalty_private.programme_evaluations%rowtype;
  friend_reversal_evaluation loyalty_private.programme_evaluations%rowtype;
  advocate_reversal_transaction_public_id uuid;
  friend_reversal_transaction_public_id uuid;
  advocate_reversal_transaction loyalty.ledger_transactions%rowtype;
  friend_reversal_transaction loyalty.ledger_transactions%rowtype;
  advocate_original_fact loyalty_private.tier_qualification_facts%rowtype;
  friend_original_fact loyalty_private.tier_qualification_facts%rowtype;
begin
  select event.* into strict target_event
  from loyalty_private.canonical_commerce_events as event
  where event.public_id = target_event_public_id
    and event.event_type = 'commerce.order.refunded';
  select attribution.* into target_attribution
  from loyalty.referral_attributions as attribution
  where attribution.organization_id = target_event.organization_id
    and attribution.source_connection_id = target_event.connection_id
    and attribution.source_order_id = target_event.source_object_id;
  if not found then
    return query select null::uuid, 'ignored'::text, 'no_attribution'::text;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'referral-qualification:' || target_attribution.id::text,
    target_attribution.organization_id
  ));
  select transition.to_state into strict target_state
  from loyalty.referral_attribution_transitions as transition
  where transition.organization_id = target_attribution.organization_id
    and transition.attribution_id = target_attribution.id
  order by transition.id desc limit 1;

  if target_state = 'qualified' then
    select issuance.* into strict target_issuance
    from loyalty_private.referral_reward_issuances as issuance
    where issuance.organization_id = target_attribution.organization_id
      and issuance.attribution_id = target_attribution.id;
    if exists (
      select 1 from loyalty_private.referral_reward_compensations as compensation
      where compensation.organization_id = target_attribution.organization_id
        and compensation.attribution_id = target_attribution.id
    ) then
      raise exception using errcode = '23514',
        message = 'referral compensation exists before reversal transition';
    end if;

    target_input := jsonb_build_object(
      'version', '1', 'attributionId', target_attribution.public_id,
      'issuanceId', target_issuance.public_id,
      'refundEventId', target_event.public_id
    );
    target_input_hash := extensions.digest(
      pg_catalog.convert_to(target_input::text, 'utf8'), 'sha256'
    );
    target_explanation := jsonb_build_object(
      'rule', 'referral_source_order_refund',
      'attributionId', target_attribution.public_id,
      'issuanceId', target_issuance.public_id
    );

    target_result := jsonb_build_object(
      'version', '1', 'source', 'referral_refund', 'side', 'advocate',
      'reversedPoints', target_issuance.advocate_points,
      'attributionId', target_attribution.public_id,
      'eventId', target_event.public_id
    );
    target_result_hash := extensions.digest(
      pg_catalog.convert_to(target_result::text, 'utf8'), 'sha256'
    );
    select evaluation.evaluation_public_id
      into strict advocate_reversal_evaluation_public_id
    from loyalty_private.record_programme_evaluation(
      target_attribution.organization_id, target_attribution.programme_group_id,
      target_attribution.programme_version_id, target_event.id,
      'referral_reward_reversal',
      'referral:' || target_attribution.public_id::text || ':advocate:refund',
      'referral-refund:' || target_attribution.public_id::text || ':advocate:evaluation',
      target_input_hash, target_result_hash, target_result,
      target_explanation || jsonb_build_object('side', 'advocate'),
      target_evaluated_at
    ) as evaluation;
    select evaluation.* into strict advocate_reversal_evaluation
    from loyalty_private.programme_evaluations as evaluation
    where evaluation.organization_id = target_attribution.organization_id
      and evaluation.public_id = advocate_reversal_evaluation_public_id;
    target_request_hash := extensions.digest(pg_catalog.convert_to(
      jsonb_build_object(
        'operation', 'referral_refund', 'side', 'advocate',
        'attributionId', target_attribution.public_id,
        'originEntryId', target_issuance.advocate_origin_entry_id,
        'points', target_issuance.advocate_points
      )::text, 'utf8'
    ), 'sha256');
    select reversal.transaction_public_id
      into strict advocate_reversal_transaction_public_id
    from loyalty_private.reverse_award_points(
      target_attribution.organization_id,
      (select entry.public_id from loyalty.ledger_entries as entry
        where entry.organization_id = target_attribution.organization_id
          and entry.id = target_issuance.advocate_origin_entry_id),
      target_issuance.advocate_points,
      'referral-refund:' || target_attribution.public_id::text || ':advocate:ledger',
      target_request_hash, 'Referral source order refunded',
      target_event.occurred_at
    ) as reversal;
    select transaction.* into strict advocate_reversal_transaction
    from loyalty.ledger_transactions as transaction
    where transaction.organization_id = target_attribution.organization_id
      and transaction.public_id = advocate_reversal_transaction_public_id;

    target_result := jsonb_build_object(
      'version', '1', 'source', 'referral_refund', 'side', 'friend',
      'reversedPoints', target_issuance.friend_points,
      'attributionId', target_attribution.public_id,
      'eventId', target_event.public_id
    );
    target_result_hash := extensions.digest(
      pg_catalog.convert_to(target_result::text, 'utf8'), 'sha256'
    );
    select evaluation.evaluation_public_id
      into strict friend_reversal_evaluation_public_id
    from loyalty_private.record_programme_evaluation(
      target_attribution.organization_id, target_attribution.programme_group_id,
      target_attribution.programme_version_id, target_event.id,
      'referral_reward_reversal',
      'referral:' || target_attribution.public_id::text || ':friend:refund',
      'referral-refund:' || target_attribution.public_id::text || ':friend:evaluation',
      target_input_hash, target_result_hash, target_result,
      target_explanation || jsonb_build_object('side', 'friend'),
      target_evaluated_at
    ) as evaluation;
    select evaluation.* into strict friend_reversal_evaluation
    from loyalty_private.programme_evaluations as evaluation
    where evaluation.organization_id = target_attribution.organization_id
      and evaluation.public_id = friend_reversal_evaluation_public_id;
    target_request_hash := extensions.digest(pg_catalog.convert_to(
      jsonb_build_object(
        'operation', 'referral_refund', 'side', 'friend',
        'attributionId', target_attribution.public_id,
        'originEntryId', target_issuance.friend_origin_entry_id,
        'points', target_issuance.friend_points
      )::text, 'utf8'
    ), 'sha256');
    select reversal.transaction_public_id
      into strict friend_reversal_transaction_public_id
    from loyalty_private.reverse_award_points(
      target_attribution.organization_id,
      (select entry.public_id from loyalty.ledger_entries as entry
        where entry.organization_id = target_attribution.organization_id
          and entry.id = target_issuance.friend_origin_entry_id),
      target_issuance.friend_points,
      'referral-refund:' || target_attribution.public_id::text || ':friend:ledger',
      target_request_hash, 'Referral source order refunded',
      target_event.occurred_at
    ) as reversal;
    select transaction.* into strict friend_reversal_transaction
    from loyalty.ledger_transactions as transaction
    where transaction.organization_id = target_attribution.organization_id
      and transaction.public_id = friend_reversal_transaction_public_id;

    select fact.* into strict advocate_original_fact
    from loyalty_private.tier_qualification_facts as fact
    where fact.organization_id = target_attribution.organization_id
      and fact.evaluation_id = target_issuance.advocate_evaluation_id;
    select fact.* into strict friend_original_fact
    from loyalty_private.tier_qualification_facts as fact
    where fact.organization_id = target_attribution.organization_id
      and fact.evaluation_id = target_issuance.friend_evaluation_id;
    insert into loyalty_private.tier_qualification_facts (
      organization_id, programme_group_id, source_programme_version_id,
      customer_id, canonical_event_id, evaluation_id, origin_fact_id,
      fact_kind, source_reference, eligible_spend_minor_delta,
      earned_points_delta, order_count_delta, referral_count_delta,
      verified_action_count_delta, activity_code, effective_at, recorded_at
    ) values (
      target_attribution.organization_id, target_attribution.programme_group_id,
      target_attribution.programme_version_id, target_issuance.advocate_customer_id,
      target_event.id, advocate_reversal_evaluation.id,
      advocate_original_fact.id, 'referral_reversal',
      'evaluation:' || advocate_reversal_evaluation.public_id::text,
      0, -target_issuance.advocate_points, 0, -1, 0, null,
      target_event.occurred_at,
      greatest(target_evaluated_at, target_event.occurred_at)
    ), (
      target_attribution.organization_id, target_attribution.programme_group_id,
      target_attribution.programme_version_id, target_issuance.friend_customer_id,
      target_event.id, friend_reversal_evaluation.id,
      friend_original_fact.id, 'referral_reversal',
      'evaluation:' || friend_reversal_evaluation.public_id::text,
      0, -target_issuance.friend_points, 0, 0, 0, null,
      target_event.occurred_at,
      greatest(target_evaluated_at, target_event.occurred_at)
    );

    insert into loyalty_private.referral_reward_compensations (
      organization_id, attribution_id, issuance_id, refund_event_id,
      advocate_reversal_evaluation_id, friend_reversal_evaluation_id,
      advocate_reversal_transaction_id, friend_reversal_transaction_id
    ) values (
      target_attribution.organization_id, target_attribution.id,
      target_issuance.id, target_event.id,
      advocate_reversal_evaluation.id, friend_reversal_evaluation.id,
      advocate_reversal_transaction.id, friend_reversal_transaction.id
    );
    insert into loyalty.referral_attribution_transitions (
      organization_id, attribution_id, from_state, to_state, reason_code,
      actor_kind, actor_user_id, idempotency_key
    ) values (
      target_attribution.organization_id, target_attribution.id,
      'qualified', 'reversed', 'source_order_refunded', 'system', null,
      'refund:' || target_event.public_id::text
    );
    return query select target_attribution.public_id,
      'reversed'::text, 'reversed'::text;
    return;
  end if;

  if target_state not in ('captured', 'pending_review', 'cooling') then
    return query select target_attribution.public_id, target_state,
      'state_final'::text;
    return;
  end if;
  insert into loyalty_private.referral_reward_job_attempts (
    organization_id, job_id, attempt_number, outcome, error_code
  )
  select job.organization_id, job.id, job.attempt_count,
    'cancelled', 'source_order_refunded'
  from loyalty_private.referral_reward_jobs as job
  where job.organization_id = target_attribution.organization_id
    and job.attribution_id = target_attribution.id
    and job.state = 'processing'
  on conflict (organization_id, job_id, attempt_number) do nothing;
  update loyalty_private.referral_reward_jobs as job
  set state = 'cancelled', lease_owner = null, lease_expires_at = null,
    last_error_code = 'source_order_refunded', updated_at = clock_timestamp()
  where job.organization_id = target_attribution.organization_id
    and job.attribution_id = target_attribution.id
    and job.state in ('pending', 'processing', 'retryable', 'manual_review');
  insert into loyalty.referral_attribution_transitions (
    organization_id, attribution_id, from_state, to_state, reason_code,
    actor_kind, actor_user_id, idempotency_key
  ) values (
    target_attribution.organization_id, target_attribution.id,
    target_state, 'rejected', 'source_order_refunded', 'system', null,
    'refund:' || target_event.public_id::text
  );
  return query select target_attribution.public_id, 'rejected'::text,
    'rejected'::text;
end;
$$;

alter table loyalty_private.referral_reward_jobs owner to loyalty_owner;
alter table loyalty_private.referral_reward_job_attempts owner to loyalty_owner;
alter table loyalty_private.referral_reward_issuances owner to loyalty_owner;
alter table loyalty_private.referral_reward_compensations owner to loyalty_owner;
alter function loyalty_private.enqueue_referral_reward_job_v1()
  owner to loyalty_owner;
alter function loyalty_private.claim_due_referral_reward_jobs_v1(text, integer, integer)
  owner to loyalty_owner;
alter function loyalty_private.finish_referral_reward_job_v1(uuid, text, text, integer)
  owner to loyalty_owner;
alter function loyalty_private.issue_referral_reward_job_v1(uuid, text)
  owner to loyalty_owner;
alter function loyalty_private.reject_referral_for_refund_v1(uuid)
  owner to loyalty_owner;

alter table loyalty_private.referral_reward_jobs enable row level security;
alter table loyalty_private.referral_reward_job_attempts enable row level security;
alter table loyalty_private.referral_reward_issuances enable row level security;
alter table loyalty_private.referral_reward_compensations enable row level security;
revoke all on loyalty_private.referral_reward_jobs,
  loyalty_private.referral_reward_job_attempts,
  loyalty_private.referral_reward_issuances,
  loyalty_private.referral_reward_compensations
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function
  loyalty_private.enqueue_referral_reward_job_v1(),
  loyalty_private.claim_due_referral_reward_jobs_v1(text, integer, integer),
  loyalty_private.finish_referral_reward_job_v1(uuid, text, text, integer),
  loyalty_private.issue_referral_reward_job_v1(uuid, text),
  loyalty_private.reject_referral_for_refund_v1(uuid)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function
  loyalty_private.claim_due_referral_reward_jobs_v1(text, integer, integer),
  loyalty_private.finish_referral_reward_job_v1(uuid, text, text, integer),
  loyalty_private.issue_referral_reward_job_v1(uuid, text),
  loyalty_private.reject_referral_for_refund_v1(uuid)
  to loyalty_worker;

comment on table loyalty_private.referral_reward_jobs is
  'Private bounded-attempt referral reward leases; accepted work remains recoverable independently of rollout entitlements.';
comment on table loyalty_private.referral_reward_issuances is
  'Immutable evidence tying one qualified referral to both award/release ledger pairs and their tier facts.';
comment on table loyalty_private.referral_reward_compensations is
  'Immutable exactly-once evidence that a refund reversed both sides of an issued referral reward.';
comment on function loyalty_private.issue_referral_reward_job_v1(uuid, text) is
  'Atomically issues and releases both referral rewards, records tier facts, qualifies the attribution, and completes its active lease.';
comment on function loyalty_private.reject_referral_for_refund_v1(uuid) is
  'Atomically rejects an unissued referral or compensates both issued sides before moving a qualified referral to reversed.';
