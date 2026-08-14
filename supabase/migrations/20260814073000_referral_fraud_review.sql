-- M06 authorized referral fraud review and bounded recovery of internal work.

alter table loyalty_private.referral_reward_jobs
  drop constraint referral_reward_jobs_attempt_count_check,
  add constraint referral_reward_jobs_attempt_count_check
    check (attempt_count between 0 and 50),
  add column review_cycle smallint not null default 0
    check (review_cycle between 0 and 4),
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references auth.users(id) on delete restrict,
  add constraint referral_reward_jobs_review_check check (
    (review_cycle = 0 and reviewed_at is null and reviewed_by is null)
    or (review_cycle > 0 and reviewed_at is not null and reviewed_by is not null)
  );

alter table loyalty_private.referral_reward_job_attempts
  drop constraint referral_reward_job_attempts_attempt_number_check,
  add constraint referral_reward_job_attempts_attempt_number_check
    check (attempt_number between 1 and 50);

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
    and fact.decision in ('eligible', 'review_held');
  insert into loyalty_private.referral_reward_jobs (
    organization_id, attribution_id, next_attempt_at
  ) values (
    new.organization_id, new.attribution_id, target_cooling_ends_at
  ) on conflict (organization_id, attribution_id) do nothing;
  return new;
end;
$$;

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
  set state = case when job.attempt_count >= (job.review_cycle + 1) * 10
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
      and job.attempt_count < (job.review_cycle + 1) * 10
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
  next_state := case
    when target_job.attempt_count >= (target_job.review_cycle + 1) * 10
      then 'manual_review'
    else 'retryable'
  end;
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

create or replace function loyalty.resolve_referral_review_command(
  target_attribution_public_id uuid,
  target_resolution text,
  target_reason text,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (attribution_id uuid, state text, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := loyalty_private.request_user_id();
  target_attribution loyalty.referral_attributions%rowtype;
  target_fact loyalty_private.referral_qualification_facts%rowtype;
  existing_audit loyalty.admin_audit_events%rowtype;
  target_current_state text;
  target_state text;
  request_hash bytea;
begin
  if actor_user_id is null
    or target_attribution_public_id is null
    or target_resolution not in ('approved', 'rejected')
    or target_reason is null
    or length(btrim(target_reason)) not between 8 and 1000
    or target_reason <> btrim(target_reason)
    or target_idempotency_key is null
    or length(btrim(target_idempotency_key)) not between 1 and 255
    or target_idempotency_key <> btrim(target_idempotency_key)
    or target_correlation_id is null then
    raise exception using errcode = '22023',
      message = 'invalid referral review command';
  end if;
  select attribution.* into target_attribution
  from loyalty.referral_attributions as attribution
  where attribution.public_id = target_attribution_public_id
    and loyalty_private.has_organization_role(
      attribution.organization_id,
      array['owner', 'admin', 'operator']::text[]
    );
  if not found then
    raise exception using errcode = '42501',
      message = 'referral review command not authorized';
  end if;
  request_hash := extensions.digest(pg_catalog.convert_to(
    'referral.review.resolve|' || target_attribution.public_id::text || '|' ||
    target_resolution || '|' || target_reason,
    'UTF8'
  ), 'sha256');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'referral-qualification:' || target_attribution.id::text,
    target_attribution.organization_id
  ));
  select transition.to_state into strict target_current_state
  from loyalty.referral_attribution_transitions as transition
  where transition.organization_id = target_attribution.organization_id
    and transition.attribution_id = target_attribution.id
  order by transition.id desc limit 1;

  select audit.* into existing_audit
  from loyalty.admin_audit_events as audit
  where audit.organization_id = target_attribution.organization_id
    and audit.idempotency_key = target_idempotency_key;
  if found then
    if existing_audit.action <> 'referral.review.' || target_resolution
      or existing_audit.resource_public_id <> target_attribution.public_id
      or existing_audit.request_sha256 <> request_hash then
      raise exception using errcode = '23514',
        message = 'referral review idempotency conflict';
    end if;
    return query select target_attribution.public_id,
      target_current_state, 'duplicate'::text;
    return;
  end if;
  if target_current_state <> 'pending_review' then
    raise exception using errcode = '23514',
      message = 'referral attribution is not pending review';
  end if;

  select fact.* into target_fact
  from loyalty_private.referral_qualification_facts as fact
  where fact.organization_id = target_attribution.organization_id
    and fact.attribution_id = target_attribution.id;
  if target_resolution = 'approved' then
    if found and target_fact.decision <> 'review_held' then
      raise exception using errcode = '23514',
        message = 'referral review evidence is inconsistent';
    end if;
    target_state := case when target_fact.id is null
      then 'captured' else 'cooling' end;
  else
    target_state := 'rejected';
  end if;

  insert into loyalty.referral_attribution_transitions (
    organization_id, attribution_id, from_state, to_state, reason_code,
    actor_kind, actor_user_id, idempotency_key
  ) values (
    target_attribution.organization_id, target_attribution.id,
    'pending_review', target_state,
    'merchant_review_' || target_resolution,
    'merchant', actor_user_id,
    'merchant-review:' || target_correlation_id::text
  );
  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id,
    metadata
  ) values (
    target_attribution.organization_id, actor_user_id,
    'referral.review.' || target_resolution,
    'referral_attribution', target_attribution.public_id,
    target_idempotency_key, request_hash, target_correlation_id,
    pg_catalog.jsonb_build_object(
      'state', target_state,
      'qualificationEvidence', target_fact.id is not null,
      'reason', target_reason
    )
  );
  return query select target_attribution.public_id,
    target_state, 'created'::text;
end;
$$;

create or replace function loyalty.retry_referral_reward_job_command(
  target_job_public_id uuid,
  target_reason text,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (job_id uuid, state text, review_cycle smallint, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := loyalty_private.request_user_id();
  target_job loyalty_private.referral_reward_jobs%rowtype;
  target_attribution loyalty.referral_attributions%rowtype;
  existing_audit loyalty.admin_audit_events%rowtype;
  request_hash bytea;
  next_review_cycle smallint;
begin
  if actor_user_id is null
    or target_job_public_id is null
    or target_reason is null
    or length(btrim(target_reason)) not between 8 and 1000
    or target_reason <> btrim(target_reason)
    or target_idempotency_key is null
    or length(btrim(target_idempotency_key)) not between 1 and 255
    or target_idempotency_key <> btrim(target_idempotency_key)
    or target_correlation_id is null then
    raise exception using errcode = '22023',
      message = 'invalid referral reward retry command';
  end if;
  select job.* into target_job
  from loyalty_private.referral_reward_jobs as job
  join loyalty.referral_attributions as attribution
    on attribution.organization_id = job.organization_id
   and attribution.id = job.attribution_id
  where job.public_id = target_job_public_id
    and loyalty_private.has_organization_role(
      job.organization_id,
      array['owner', 'admin', 'operator']::text[]
    )
  for update of job;
  if not found then
    raise exception using errcode = '42501',
      message = 'referral reward retry not authorized';
  end if;
  select attribution.* into strict target_attribution
  from loyalty.referral_attributions as attribution
  where attribution.organization_id = target_job.organization_id
    and attribution.id = target_job.attribution_id;
  request_hash := extensions.digest(pg_catalog.convert_to(
    'referral.reward.retry|' || target_job.public_id::text || '|' || target_reason,
    'UTF8'
  ), 'sha256');
  select audit.* into existing_audit
  from loyalty.admin_audit_events as audit
  where audit.organization_id = target_job.organization_id
    and audit.idempotency_key = target_idempotency_key;
  if found then
    if existing_audit.action <> 'referral.reward.retry'
      or existing_audit.resource_public_id <> target_job.public_id
      or existing_audit.request_sha256 <> request_hash then
      raise exception using errcode = '23514',
        message = 'referral reward retry idempotency conflict';
    end if;
    return query select target_job.public_id,
      target_job.state, target_job.review_cycle, 'duplicate'::text;
    return;
  end if;
  if target_job.state <> 'manual_review'
    or target_job.attempt_count <> (target_job.review_cycle + 1) * 10 then
    raise exception using errcode = '23514',
      message = 'referral reward job is not retryable from review';
  end if;
  if target_job.review_cycle >= 4 then
    raise exception using errcode = '23514',
      message = 'referral reward review retry limit reached';
  end if;
  next_review_cycle := target_job.review_cycle + 1;
  update loyalty_private.referral_reward_jobs
  set state = 'retryable', review_cycle = next_review_cycle,
    next_attempt_at = clock_timestamp(), lease_owner = null,
    lease_expires_at = null, last_error_code = null,
    reviewed_at = clock_timestamp(), reviewed_by = actor_user_id,
    updated_at = clock_timestamp()
  where id = target_job.id;
  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id,
    metadata
  ) values (
    target_job.organization_id, actor_user_id,
    'referral.reward.retry', 'referral_reward_job', target_job.public_id,
    target_idempotency_key, request_hash, target_correlation_id,
    pg_catalog.jsonb_build_object(
      'state', 'retryable',
      'reviewCycle', next_review_cycle,
      'attributionId', target_attribution.public_id,
      'reason', target_reason
    )
  );
  return query select target_job.public_id,
    'retryable'::text, next_review_cycle, 'created'::text;
end;
$$;

create or replace function loyalty.list_referral_review_cases(
  target_programme_public_id uuid,
  target_kind text default null,
  target_limit integer default 50
)
returns table (
  review_kind text,
  review_id uuid,
  attribution_id uuid,
  advocate_reference text,
  friend_reference text,
  source_order_reference text,
  state text,
  risk_codes text[],
  qualification_decision text,
  cooling_ends_at timestamptz,
  attempt_count smallint,
  review_cycle smallint,
  error_code text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_programme loyalty.programmes%rowtype;
begin
  if target_programme_public_id is null
    or target_kind is not null and target_kind not in ('risk', 'reward')
    or target_limit not between 1 and 100 then
    raise exception using errcode = '22023',
      message = 'invalid referral review filter';
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
      message = 'referral review queue not authorized';
  end if;

  return query
  with latest_transition as (
    select distinct on (transition.organization_id, transition.attribution_id)
      transition.organization_id, transition.attribution_id,
      transition.to_state
    from loyalty.referral_attribution_transitions as transition
    where transition.organization_id = target_programme.organization_id
    order by transition.organization_id, transition.attribution_id,
      transition.id desc
  ), review_rows as (
    select 'risk'::text as review_kind,
      attribution.public_id as review_id,
      attribution.public_id as attribution_id,
      coalesce(nullif(btrim(advocate_customer.display_reference), ''),
        'Customer ' || left(advocate_customer.public_id::text, 8)) as advocate_reference,
      coalesce(nullif(btrim(friend_customer.display_reference), ''),
        'Customer ' || left(friend_customer.public_id::text, 8)) as friend_reference,
      attribution.source_order_id as source_order_reference,
      transition.to_state as state,
      attribution.risk_codes,
      qualification.decision as qualification_decision,
      qualification.cooling_ends_at,
      null::smallint as attempt_count,
      null::smallint as review_cycle,
      null::text as error_code,
      attribution.created_at
    from loyalty.referral_attributions as attribution
    join latest_transition as transition
      on transition.organization_id = attribution.organization_id
     and transition.attribution_id = attribution.id
    join loyalty.referral_advocates as advocate
      on advocate.organization_id = attribution.organization_id
     and advocate.id = attribution.advocate_id
    join loyalty.customers as advocate_customer
      on advocate_customer.organization_id = advocate.organization_id
     and advocate_customer.id = advocate.customer_id
    join loyalty.customers as friend_customer
      on friend_customer.organization_id = attribution.organization_id
     and friend_customer.id = attribution.friend_customer_id
    left join loyalty_private.referral_qualification_facts as qualification
      on qualification.organization_id = attribution.organization_id
     and qualification.attribution_id = attribution.id
    where attribution.organization_id = target_programme.organization_id
      and attribution.programme_group_id = target_programme.programme_group_id
      and transition.to_state = 'pending_review'
      and (target_kind is null or target_kind = 'risk')

    union all

    select 'reward'::text, job.public_id, attribution.public_id,
      coalesce(nullif(btrim(advocate_customer.display_reference), ''),
        'Customer ' || left(advocate_customer.public_id::text, 8)),
      coalesce(nullif(btrim(friend_customer.display_reference), ''),
        'Customer ' || left(friend_customer.public_id::text, 8)),
      attribution.source_order_id, job.state, attribution.risk_codes,
      qualification.decision, qualification.cooling_ends_at,
      job.attempt_count, job.review_cycle, job.last_error_code, job.created_at
    from loyalty_private.referral_reward_jobs as job
    join loyalty.referral_attributions as attribution
      on attribution.organization_id = job.organization_id
     and attribution.id = job.attribution_id
    join loyalty.referral_advocates as advocate
      on advocate.organization_id = attribution.organization_id
     and advocate.id = attribution.advocate_id
    join loyalty.customers as advocate_customer
      on advocate_customer.organization_id = advocate.organization_id
     and advocate_customer.id = advocate.customer_id
    join loyalty.customers as friend_customer
      on friend_customer.organization_id = attribution.organization_id
     and friend_customer.id = attribution.friend_customer_id
    join loyalty_private.referral_qualification_facts as qualification
      on qualification.organization_id = attribution.organization_id
     and qualification.attribution_id = attribution.id
    where job.organization_id = target_programme.organization_id
      and attribution.programme_group_id = target_programme.programme_group_id
      and job.state = 'manual_review'
      and (target_kind is null or target_kind = 'reward')
  )
  select row.review_kind, row.review_id, row.attribution_id,
    row.advocate_reference, row.friend_reference,
    row.source_order_reference, row.state, row.risk_codes,
    row.qualification_decision, row.cooling_ends_at,
    row.attempt_count, row.review_cycle, row.error_code, row.created_at
  from review_rows as row
  order by row.created_at, row.review_kind, row.review_id
  limit target_limit;
end;
$$;

alter function loyalty_private.enqueue_referral_reward_job_v1()
  owner to loyalty_owner;
alter function loyalty_private.claim_due_referral_reward_jobs_v1(text, integer, integer)
  owner to loyalty_owner;
alter function loyalty_private.finish_referral_reward_job_v1(uuid, text, text, integer)
  owner to loyalty_owner;
alter function loyalty.resolve_referral_review_command(uuid, text, text, text, uuid)
  owner to loyalty_owner;
alter function loyalty.retry_referral_reward_job_command(uuid, text, text, uuid)
  owner to loyalty_owner;
alter function loyalty.list_referral_review_cases(uuid, text, integer)
  owner to loyalty_owner;

revoke all on function
  loyalty.resolve_referral_review_command(uuid, text, text, text, uuid),
  loyalty.retry_referral_reward_job_command(uuid, text, text, uuid),
  loyalty.list_referral_review_cases(uuid, text, integer)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

grant execute on function
  loyalty.resolve_referral_review_command(uuid, text, text, text, uuid),
  loyalty.retry_referral_reward_job_command(uuid, text, text, uuid),
  loyalty.list_referral_review_cases(uuid, text, integer)
  to authenticated;

comment on function loyalty.resolve_referral_review_command(uuid, text, text, text, uuid) is
  'Owner/admin/operator approval or rejection of one value-neutral referral hold with Auth-derived scope and immutable audit evidence.';
comment on function loyalty.retry_referral_reward_job_command(uuid, text, text, uuid) is
  'Owner/admin/operator recovery of one exhausted atomic referral job for another bounded ten-attempt cycle.';
comment on function loyalty.list_referral_review_cases(uuid, text, integer) is
  'Tenant-derived referral risk and exhausted-job queue exposing allowlisted risk codes but never fingerprint evidence.';
