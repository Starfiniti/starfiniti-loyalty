-- M14 post-review hardening for usage source truth and provider attempt
-- accounting. Policy/configuration holds never consume the ten-send budget.

do $$
begin
  if exists (
    select 1
    from loyalty_private.managed_billing_usage_facts as fact
    where fact.source_kind = 'klaviyo_message'
  ) then
    raise exception using errcode = '55000',
      message = 'klaviyo event acceptance usage facts require compensation';
  end if;
  if exists (
    select 1
    from loyalty_private.managed_billing_usage_facts as fact
    join loyalty_private.canonical_commerce_events as event
      on event.organization_id = fact.organization_id
     and event.public_id = fact.source_evidence_public_id
    where fact.source_kind = 'commerce_order'
      and (
        fact.occurred_at is distinct from event.occurred_at
        or fact.usage_period_start is distinct from
          pg_catalog.date_trunc('month', event.occurred_at, 'UTC')
      )
  ) then
    raise exception using errcode = '55000',
      message = 'order ingestion-time usage facts require compensation';
  end if;
end;
$$;

alter table loyalty_private.managed_billing_usage_dispatches
  add column claim_sequence_count bigint not null default 0
    check (claim_sequence_count >= 0),
  add column provider_attempt_count integer not null default 0
    check (provider_attempt_count between 0 and 10);

update loyalty_private.managed_billing_usage_dispatches as dispatch
set claim_sequence_count = dispatch.attempt_count,
  provider_attempt_count = existing.provider_attempt_count,
  -- A V1 claim can already be processing while this additive migration runs.
  -- Preserve its only durable claim identity until V2 recovery classifies the
  -- expired lease; terminal/claimable rows can adopt the send-only counter.
  attempt_count = case when dispatch.state = 'processing'
    then dispatch.attempt_count
    else existing.provider_attempt_count
  end
from (
  select target.id,
    pg_catalog.count(attempt.id) filter (
      where attempt.response_class <> 'policy'
        and attempt.error_code is distinct from
          'billing_usage_lease_expired_before_authorization'
    )::integer as provider_attempt_count
  from loyalty_private.managed_billing_usage_dispatches as target
  left join loyalty_private.managed_billing_usage_dispatch_attempts as attempt
    on attempt.organization_id = target.organization_id
   and attempt.dispatch_id = target.id
  group by target.id
) as existing
where existing.id = dispatch.id;

alter table loyalty_private.managed_billing_usage_dispatch_attempts
  drop constraint managed_billing_usage_dispatch_attempts_attempt_number_check,
  alter column attempt_number type bigint,
  add constraint managed_billing_usage_dispatch_attempts_attempt_number_check
    check (attempt_number > 0),
  add column provider_attempt_number integer check (
    provider_attempt_number between 1 and 10
  );

create unique index managed_billing_usage_provider_attempt_identity
  on loyalty_private.managed_billing_usage_dispatch_attempts (
    dispatch_id, provider_attempt_number
  ) where provider_attempt_number is not null;

create table loyalty_private.managed_billing_usage_policy_holds (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  dispatch_id bigint not null,
  claim_sequence bigint not null check (claim_sequence > 0),
  worker_reference text not null check (
    pg_catalog.length(worker_reference) between 3 and 120
  ),
  error_code text not null check (
    error_code ~ '^[a-z][a-z0-9_]{2,79}$'
  ),
  started_at timestamptz not null,
  completed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (dispatch_id, claim_sequence),
  foreign key (organization_id, dispatch_id)
    references loyalty_private.managed_billing_usage_dispatches(
      organization_id, id
    ) on delete restrict,
  check (completed_at >= started_at)
);

alter table loyalty_private.managed_billing_usage_policy_holds
  owner to loyalty_owner;
alter table loyalty_private.managed_billing_usage_policy_holds
  enable row level security;
alter table loyalty_private.managed_billing_usage_policy_holds
  force row level security;

create policy managed_billing_usage_policy_holds_owner
on loyalty_private.managed_billing_usage_policy_holds
for all to loyalty_owner
using (true)
with check (true);

create trigger managed_billing_usage_policy_holds_immutable
before update or delete on loyalty_private.managed_billing_usage_policy_holds
for each row execute function loyalty_private.reject_immutable_change();

create or replace function loyalty_private.begin_managed_billing_usage_provider_attempt_v1(
  target_dispatch_public_id uuid,
  target_lease_token uuid,
  target_worker_id text,
  target_at timestamptz default now()
)
returns table (attempt_number integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  dispatch loyalty_private.managed_billing_usage_dispatches%rowtype;
begin
  if target_dispatch_public_id is null or target_lease_token is null
    or target_worker_id is null
    or pg_catalog.length(pg_catalog.btrim(target_worker_id)) not between 3 and 120
    or target_at is null then
    raise exception using errcode = '22023',
      message = 'invalid managed billing provider attempt';
  end if;

  select candidate.* into dispatch
  from loyalty_private.managed_billing_usage_dispatches as candidate
  where candidate.public_id = target_dispatch_public_id
    and candidate.state = 'processing'
    and candidate.lease_token = target_lease_token
    and candidate.locked_by = pg_catalog.btrim(target_worker_id)
  for update;
  if dispatch.id is null or dispatch.lease_expires_at <= target_at
     or dispatch.authorized_at is not null then
    raise exception using errcode = '42501',
      message = 'managed billing provider attempt unavailable';
  end if;

  if dispatch.provider_attempt_count >= 10 then
    update loyalty_private.managed_billing_usage_dispatches
    set state = 'held', next_attempt_at = null,
      last_detail_code = 'billing_usage_attempt_limit_exhausted',
      locked_by = null, lease_token = null, locked_at = null,
      lease_expires_at = null, authorized_at = null, updated_at = target_at
    where id = dispatch.id;
    return;
  end if;

  update loyalty_private.managed_billing_usage_dispatches
  set provider_attempt_count = provider_attempt_count + 1,
    attempt_count = provider_attempt_count + 1,
    authorized_at = target_at, updated_at = target_at
  where id = dispatch.id
  returning provider_attempt_count into attempt_number;
  return next;
end;
$$;

create or replace function loyalty_private.hold_managed_billing_usage_dispatch_v1(
  target_dispatch_public_id uuid,
  target_lease_token uuid,
  target_worker_id text,
  target_error_code text,
  target_at timestamptz default now()
)
returns table (state text, next_attempt_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  dispatch loyalty_private.managed_billing_usage_dispatches%rowtype;
  retry_at timestamptz := target_at + interval '5 minutes';
begin
  if target_error_code <> 'stripe_usage_provider_config_unavailable'
     or target_at is null then
    raise exception using errcode = '22023',
      message = 'invalid managed billing usage hold';
  end if;

  select candidate.* into dispatch
  from loyalty_private.managed_billing_usage_dispatches as candidate
  where candidate.public_id = target_dispatch_public_id
    and candidate.state = 'processing'
    and candidate.lease_token = target_lease_token
    and candidate.locked_by = pg_catalog.btrim(target_worker_id)
    and candidate.authorized_at is null
  for update;
  if dispatch.id is null or dispatch.lease_expires_at <= target_at then
    raise exception using errcode = '42501',
      message = 'managed billing usage hold unavailable';
  end if;

  insert into loyalty_private.managed_billing_usage_policy_holds (
    organization_id, dispatch_id, claim_sequence, worker_reference,
    error_code, started_at, completed_at
  ) values (
    dispatch.organization_id, dispatch.id, dispatch.claim_sequence_count,
    pg_catalog.btrim(target_worker_id), target_error_code,
    dispatch.locked_at, target_at
  ) on conflict (dispatch_id, claim_sequence) do nothing;

  update loyalty_private.managed_billing_usage_dispatches
  set state = 'held', next_attempt_at = retry_at,
    last_detail_code = target_error_code, locked_by = null,
    lease_token = null, locked_at = null, lease_expires_at = null,
    authorized_at = null, updated_at = target_at
  where id = dispatch.id;

  state := 'held';
  next_attempt_at := retry_at;
  return next;
end;
$$;

create or replace function loyalty_private.finish_managed_billing_usage_dispatch_v2(
  target_dispatch_public_id uuid,
  target_lease_token uuid,
  target_worker_id text,
  target_outcome text,
  target_response_class text,
  target_response_code integer default null,
  target_error_code text default null,
  target_at timestamptz default now()
)
returns table (state text, next_attempt_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  dispatch loyalty_private.managed_billing_usage_dispatches%rowtype;
  final_state text;
  retry_at timestamptz;
  final_detail text;
begin
  if target_dispatch_public_id is null or target_lease_token is null
    or target_worker_id is null
    or pg_catalog.length(pg_catalog.btrim(target_worker_id)) not between 3 and 120
    or target_outcome is null or target_outcome not in (
      'accepted', 'retryable', 'ambiguous', 'rejected', 'held'
    )
    or target_response_class is null or target_response_class not in (
      'success', 'duplicate', 'temporary_failure', 'permanent_failure',
      'ambiguous', 'policy'
    )
    or (target_response_code is not null
      and target_response_code not between 200 and 599)
    or (target_error_code is not null
      and target_error_code !~ '^[a-z][a-z0-9_]{2,79}$')
    or target_at is null then
    raise exception using errcode = '22023',
      message = 'invalid managed billing usage result';
  end if;

  if (target_outcome = 'accepted' and (
      target_response_class not in ('success', 'duplicate')
      or target_error_code is not null
      or (target_response_class = 'success'
        and target_response_code not between 200 and 299)
    ))
    or (target_outcome = 'retryable' and (
      target_response_class <> 'temporary_failure'
      or not (
        target_response_code in (409, 429)
        or target_response_code between 500 and 599
        or (target_response_code is null and target_error_code in (
          'stripe_usage_connection_unavailable',
          'stripe_usage_dns_unavailable',
          'stripe_usage_provider_unavailable'
        ))
      )
    ))
    or (target_outcome = 'ambiguous' and (
      target_response_class <> 'ambiguous' or target_response_code is not null
      or target_error_code not in (
        'stripe_usage_timeout', 'stripe_usage_response_interrupted'
      )
    ))
    or (target_outcome = 'rejected' and (
      target_response_class <> 'permanent_failure'
      or target_response_code not between 400 and 499
      or target_response_code in (409, 429)
      or target_error_code is null
    ))
    or (target_outcome = 'held' and (
      target_response_class <> 'policy' or target_response_code is not null
      or target_error_code is null
    )) then
    raise exception using errcode = '22023',
      message = 'invalid managed billing usage result classification';
  end if;

  select candidate.* into dispatch
  from loyalty_private.managed_billing_usage_dispatches as candidate
  where candidate.public_id = target_dispatch_public_id
    and candidate.state = 'processing'
    and candidate.lease_token = target_lease_token
    and candidate.locked_by = pg_catalog.btrim(target_worker_id)
    and candidate.authorized_at is not null
  for update;
  if dispatch.id is null or dispatch.provider_attempt_count < 1 then
    raise exception using errcode = '42501',
      message = 'managed billing usage result not owned';
  end if;

  insert into loyalty_private.managed_billing_usage_dispatch_attempts (
    organization_id, dispatch_id, attempt_number,
    provider_attempt_number, worker_reference, outcome, response_class,
    response_code, error_code, started_at, completed_at
  ) values (
    dispatch.organization_id, dispatch.id, dispatch.claim_sequence_count,
    dispatch.provider_attempt_count, pg_catalog.btrim(target_worker_id),
    target_outcome, target_response_class, target_response_code,
    target_error_code, dispatch.authorized_at, target_at
  );

  if target_outcome = 'accepted' then
    final_state := 'accepted';
  elsif target_outcome = 'retryable'
    and dispatch.provider_attempt_count < 10 then
    final_state := 'retryable';
    retry_at := target_at + pg_catalog.make_interval(secs => least(
      3600,
      30 * pg_catalog.power(
        2, dispatch.provider_attempt_count - 1
      )::integer
    ));
  elsif target_outcome = 'retryable' then
    final_state := 'held';
    final_detail := 'billing_usage_attempt_limit_exhausted';
  elsif target_outcome = 'held' then
    final_state := 'held';
    retry_at := target_at + interval '5 minutes';
  else
    final_state := target_outcome;
  end if;

  update loyalty_private.managed_billing_usage_dispatches
  set state = final_state, next_attempt_at = retry_at,
    accepted_at = case when final_state = 'accepted' then target_at else null end,
    last_detail_code = coalesce(final_detail, target_error_code),
    locked_by = null, lease_token = null, locked_at = null,
    lease_expires_at = null, authorized_at = null, updated_at = target_at
  where id = dispatch.id;

  return query select final_state, retry_at;
end;
$$;

create or replace function loyalty_private.claim_managed_billing_usage_dispatches_v2(
  target_worker_id text,
  target_batch_size integer default 25,
  target_lease_seconds integer default 60,
  target_at timestamptz default now()
)
returns table (
  dispatch_public_id uuid,
  lease_token uuid,
  claim_sequence bigint
)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '10s'
as $$
begin
  -- V1 workers remain a supported rolling-upgrade boundary. They incremented
  -- attempt_count when claiming and wrote provider outcomes without the V2
  -- provider_attempt_number. Reconstruct those completed sends before the V2
  -- claimer delegates to V1 so a rolling upgrade cannot reset the ten-send
  -- ceiling or reuse a claim identity.
  with evidence as (
    select dispatch.id as dispatch_id,
      pg_catalog.max(attempt.attempt_number) as last_claim_sequence,
      pg_catalog.count(*) filter (
        where attempt.provider_attempt_number is not null
          or (
            attempt.provider_attempt_number is null
            and attempt.response_class <> 'policy'
            and attempt.error_code is distinct from
              'billing_usage_lease_expired_before_authorization'
          )
      )::integer as provider_attempt_count
    from loyalty_private.managed_billing_usage_dispatches as dispatch
    join loyalty_private.managed_billing_usage_dispatch_attempts as attempt
      on attempt.dispatch_id = dispatch.id
    where dispatch.state in ('pending', 'retryable', 'held', 'processing')
    group by dispatch.id
  )
  update loyalty_private.managed_billing_usage_dispatches as dispatch
  set claim_sequence_count = greatest(
        dispatch.claim_sequence_count, evidence.last_claim_sequence
      ),
    provider_attempt_count = greatest(
      dispatch.provider_attempt_count, evidence.provider_attempt_count
    ),
    -- A processing V1 claim has no attempt row yet. Its legacy counter is the
    -- only durable identity for that in-flight claim and must survive evidence
    -- normalization until the expired-lease branches below classify it.
    attempt_count = case when dispatch.state = 'processing'
      then dispatch.attempt_count
      else greatest(
        dispatch.provider_attempt_count, evidence.provider_attempt_count
      )
    end
  from evidence
  where dispatch.id = evidence.dispatch_id
    and (
      dispatch.claim_sequence_count < evidence.last_claim_sequence
      or dispatch.provider_attempt_count < evidence.provider_attempt_count
      or (
        dispatch.state <> 'processing'
        and dispatch.attempt_count <> greatest(
          dispatch.provider_attempt_count, evidence.provider_attempt_count
        )
      )
    );

  -- A V1 worker can die after database authorization but before recording its
  -- result. In that state its current claim is represented only by the legacy
  -- attempt_count. Promote that claim to both V2 counters before appending the
  -- ambiguous provider-attempt evidence below.
  with expired as (
    select dispatch.id,
      greatest(
        dispatch.claim_sequence_count, dispatch.attempt_count::bigint
      ) as recovered_claim_sequence,
      dispatch.provider_attempt_count + case
        when dispatch.attempt_count > dispatch.provider_attempt_count then 1
        else 0
      end as recovered_provider_attempt_count
    from loyalty_private.managed_billing_usage_dispatches as dispatch
    where dispatch.state = 'processing'
      and dispatch.lease_expires_at <= target_at
      and dispatch.authorized_at is not null
    for update
  )
  update loyalty_private.managed_billing_usage_dispatches as dispatch
  set claim_sequence_count = expired.recovered_claim_sequence,
    provider_attempt_count = expired.recovered_provider_attempt_count,
    attempt_count = expired.recovered_provider_attempt_count
  from expired
  where dispatch.id = expired.id;

  insert into loyalty_private.managed_billing_usage_dispatch_attempts (
    organization_id, dispatch_id, attempt_number,
    provider_attempt_number, worker_reference, outcome, response_class,
    error_code, started_at, completed_at
  )
  select dispatch.organization_id, dispatch.id,
    dispatch.claim_sequence_count, dispatch.provider_attempt_count,
    dispatch.locked_by, 'ambiguous', 'ambiguous',
    'billing_usage_lease_expired_after_authorization',
    dispatch.authorized_at, target_at
  from loyalty_private.managed_billing_usage_dispatches as dispatch
  where dispatch.state = 'processing'
    and dispatch.lease_expires_at <= target_at
    and dispatch.authorized_at is not null
  on conflict on constraint managed_billing_usage_dispatch_attempt_identity
    do nothing;

  update loyalty_private.managed_billing_usage_dispatches as dispatch
  set state = 'ambiguous', next_attempt_at = null,
    last_detail_code = 'billing_usage_lease_expired_after_authorization',
    locked_by = null, lease_token = null, locked_at = null,
    lease_expires_at = null, authorized_at = null, updated_at = target_at
  where dispatch.state = 'processing'
    and dispatch.lease_expires_at <= target_at
    and dispatch.authorized_at is not null;

  -- A dead worker before provider authorization is a policy/lease hold, not a
  -- provider attempt. Resolve those leases before the compatible V1 claimer
  -- handles authorized (therefore potentially sent) leases.
  update loyalty_private.managed_billing_usage_dispatches as dispatch
  set claim_sequence_count = greatest(
        dispatch.claim_sequence_count, dispatch.attempt_count::bigint
      ),
    -- Reset V1's compatibility counter only after its current claim sequence
    -- has been preserved. Local holds do not consume the provider-send budget.
    attempt_count = dispatch.provider_attempt_count
  where dispatch.state = 'processing'
    and dispatch.lease_expires_at <= target_at
    and dispatch.authorized_at is null;

  insert into loyalty_private.managed_billing_usage_policy_holds (
    organization_id, dispatch_id, claim_sequence, worker_reference,
    error_code, started_at, completed_at
  )
  select dispatch.organization_id, dispatch.id,
    dispatch.claim_sequence_count, dispatch.locked_by,
    'billing_usage_lease_expired_before_provider_attempt',
    dispatch.locked_at, target_at
  from loyalty_private.managed_billing_usage_dispatches as dispatch
  where dispatch.state = 'processing'
    and dispatch.lease_expires_at <= target_at
    and dispatch.authorized_at is null
  on conflict (dispatch_id, claim_sequence) do nothing;

  update loyalty_private.managed_billing_usage_dispatches as dispatch
  set state = 'retryable', next_attempt_at = target_at + interval '30 seconds',
    last_detail_code = 'billing_usage_lease_expired_before_provider_attempt',
    locked_by = null, lease_token = null, locked_at = null,
    lease_expires_at = null, authorized_at = null, updated_at = target_at
  where dispatch.state = 'processing'
    and dispatch.lease_expires_at <= target_at
    and dispatch.authorized_at is null;

  return query
  with claimed as materialized (
    select source.dispatch_public_id, source.lease_token
    from loyalty_private.claim_managed_billing_usage_dispatches_v1(
      target_worker_id, target_batch_size, target_lease_seconds, target_at
    ) as source
  ),
  normalized as (
    update loyalty_private.managed_billing_usage_dispatches as dispatch
    set claim_sequence_count = dispatch.claim_sequence_count + 1,
      -- V1 increments this compatibility column while claiming. Restore the
      -- database-authoritative provider-send count before releasing the row.
      attempt_count = dispatch.provider_attempt_count,
      updated_at = target_at
    from claimed
    where dispatch.public_id = claimed.dispatch_public_id
      and dispatch.lease_token = claimed.lease_token
    returning dispatch.public_id, dispatch.lease_token,
      dispatch.claim_sequence_count
  )
  select normalized.public_id, normalized.lease_token,
    normalized.claim_sequence_count
  from normalized;
end;
$$;

create or replace function loyalty_private.authorize_managed_billing_usage_dispatch_v2(
  target_dispatch_public_id uuid,
  target_lease_token uuid,
  target_worker_id text,
  target_at timestamptz default now()
)
returns table (
  provider_event_name text,
  provider_customer_id text,
  provider_identifier text,
  quantity text,
  occurred_at timestamptz,
  live_mode boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  dispatch loyalty_private.managed_billing_usage_dispatches%rowtype;
  fact loyalty_private.managed_billing_usage_facts%rowtype;
  bound_meter loyalty_private.managed_billing_usage_meter_versions%rowtype;
  current_meter loyalty_private.managed_billing_usage_meter_versions%rowtype;
  bound_account loyalty_private.managed_billing_account_versions%rowtype;
  current_account loyalty_private.managed_billing_account_versions%rowtype;
  original_dispatch loyalty_private.managed_billing_usage_dispatches%rowtype;
  provider_configuration
    loyalty_private.managed_billing_provider_configuration_versions%rowtype;
  target_deployment_mode text;
  target_hold_code text;
  entitlement record;
begin
  if target_dispatch_public_id is null or target_lease_token is null
    or target_worker_id is null
    or pg_catalog.length(pg_catalog.btrim(target_worker_id)) not between 3 and 120
    or target_at is null then
    raise exception using errcode = '22023',
      message = 'invalid managed billing usage authorization';
  end if;

  select candidate.* into dispatch
  from loyalty_private.managed_billing_usage_dispatches as candidate
  where candidate.public_id = target_dispatch_public_id
    and candidate.state = 'processing'
    and candidate.lease_token = target_lease_token
    and candidate.locked_by = pg_catalog.btrim(target_worker_id)
  for update;
  if dispatch.id is null or dispatch.lease_expires_at <= target_at
     or dispatch.authorized_at is not null then
    raise exception using errcode = '42501',
      message = 'managed billing usage dispatch unavailable';
  end if;

  select candidate.* into strict fact
  from loyalty_private.managed_billing_usage_facts as candidate
  where candidate.organization_id = dispatch.organization_id
    and candidate.id = dispatch.usage_fact_id;
  select candidate.* into strict bound_meter
  from loyalty_private.managed_billing_usage_meter_versions as candidate
  where candidate.id = dispatch.meter_version_id;
  select candidate.* into strict bound_account
  from loyalty_private.managed_billing_account_versions as candidate
  where candidate.organization_id = dispatch.organization_id
    and candidate.id = dispatch.billing_account_version_id;
  if fact.correction_of_fact_id is not null then
    select candidate.* into original_dispatch
    from loyalty_private.managed_billing_usage_dispatches as candidate
    where candidate.organization_id = dispatch.organization_id
      and candidate.usage_fact_id = fact.correction_of_fact_id
      and candidate.state = 'accepted';
  end if;

  select configuration.deployment_mode into strict target_deployment_mode
  from loyalty_private.deployment_configuration_versions as configuration
  where configuration.effective_from <= target_at
  order by configuration.effective_from desc, configuration.id desc
  limit 1;
  select * into strict entitlement
  from loyalty_private.resolve_organization_entitlement(
    dispatch.organization_id, 'managed.billing', dispatch.public_id::text,
    target_at
  );
  select candidate.* into provider_configuration
  from loyalty_private.managed_billing_provider_configuration_versions
    as candidate
  where candidate.effective_from <= target_at
  order by candidate.effective_from desc, candidate.id desc
  limit 1;
  select candidate.* into current_account
  from loyalty_private.managed_billing_account_versions as candidate
  where candidate.organization_id = dispatch.organization_id
    and candidate.effective_from <= target_at
    and (candidate.effective_until is null
      or candidate.effective_until > target_at)
  order by candidate.effective_from desc, candidate.id desc
  limit 1;
  select candidate.* into current_meter
  from loyalty_private.managed_billing_usage_meter_versions as candidate
  where candidate.meter_key = fact.meter_key
    and candidate.live_mode = bound_account.live_mode
    and candidate.effective_from <= target_at
  order by candidate.effective_from desc, candidate.version desc,
    candidate.id desc
  limit 1;

  if target_deployment_mode <> 'managed'
    or entitlement.deployment_mode <> 'managed' then
    target_hold_code := 'billing_usage_self_hosted';
  elsif not entitlement.enabled then
    target_hold_code := 'billing_usage_entitlement_disabled';
  elsif provider_configuration.id is null
    or not provider_configuration.enabled
    or provider_configuration.live_mode <> bound_account.live_mode then
    target_hold_code := 'billing_usage_provider_disabled';
  elsif fact.correction_of_fact_id is not null and (
      original_dispatch.id is null
      or original_dispatch.billing_account_version_id <> bound_account.id
      or original_dispatch.meter_version_id <> bound_meter.id
    ) then
    target_hold_code := 'billing_usage_correction_source_unaccepted';
  elsif fact.correction_of_fact_id is null
    and current_account.id is distinct from bound_account.id then
    target_hold_code := 'billing_usage_account_changed';
  elsif fact.correction_of_fact_id is null and (
      current_meter.id is distinct from bound_meter.id
      or not bound_meter.enabled
    ) then
    target_hold_code := 'billing_usage_meter_changed';
  elsif fact.occurred_at < target_at - interval '34 days'
    or fact.occurred_at > target_at + interval '5 minutes' then
    target_hold_code := 'billing_usage_outside_provider_window';
  end if;

  if target_hold_code is not null then
    insert into loyalty_private.managed_billing_usage_policy_holds (
      organization_id, dispatch_id, claim_sequence, worker_reference,
      error_code, started_at, completed_at
    ) values (
      dispatch.organization_id, dispatch.id, dispatch.claim_sequence_count,
      pg_catalog.btrim(target_worker_id), target_hold_code,
      dispatch.locked_at, target_at
    ) on conflict (dispatch_id, claim_sequence) do nothing;
    update loyalty_private.managed_billing_usage_dispatches
    set state = 'held', next_attempt_at = target_at + interval '5 minutes',
      last_detail_code = target_hold_code, locked_by = null,
      lease_token = null, locked_at = null, lease_expires_at = null,
      authorized_at = null, updated_at = target_at
    where id = dispatch.id;
    return;
  end if;

  return query select bound_meter.provider_event_name,
    bound_account.provider_customer_id, dispatch.provider_identifier,
    fact.quantity::text, fact.occurred_at, bound_account.live_mode;
end;
$$;

create or replace function loyalty_private.capture_managed_billing_usage_facts_v2(
  target_limit integer default 500,
  target_observed_at timestamptz default now()
)
returns table (meter_key text, captured_count bigint)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '10s'
as $$
declare
  target_deployment_mode text;
begin
  if target_limit is null or target_limit not between 1 and 2000
    or target_observed_at is null then
    raise exception using errcode = '22023',
      message = 'invalid managed billing usage capture request';
  end if;

  select configuration.deployment_mode into strict target_deployment_mode
  from loyalty_private.deployment_configuration_versions as configuration
  where configuration.effective_from <= target_observed_at
  order by configuration.effective_from desc, configuration.id desc
  limit 1;
  if target_deployment_mode <> 'managed' then
    return;
  end if;

  return query
  with order_sources as (
    select distinct on (
      event.organization_id, event.connection_id, event.source_object_id
    )
      event.organization_id,
      'orders'::text as meter_key,
      'commerce_order'::text as source_kind,
      event.public_id as source_subject_public_id,
      event.public_id as source_evidence_public_id,
      extensions.digest(pg_catalog.convert_to(
        'm14:v1:order:' || event.organization_id::text || ':' ||
          event.connection_id::text || ':' || event.source_object_id,
        'UTF8'
      ), 'sha256') as source_reference_sha256,
      event.occurred_at
    from loyalty_private.canonical_commerce_events as event
    where event.event_type in (
      'commerce.order.status_changed', 'commerce.order.refunded'
    )
      and event.occurred_at <= target_observed_at
    order by event.organization_id, event.connection_id,
      event.source_object_id, event.occurred_at, event.id
  ),
  active_member_sources as (
    select distinct on (
      transaction.organization_id, wallet.customer_id,
      pg_catalog.date_trunc('month', transaction.created_at, 'UTC')
    )
      transaction.organization_id,
      'active_members'::text as meter_key,
      'active_member_month'::text as source_kind,
      customer.public_id as source_subject_public_id,
      transaction.public_id as source_evidence_public_id,
      extensions.digest(pg_catalog.convert_to(
        'm14:v1:active-member:' || transaction.organization_id::text || ':' ||
          customer.public_id::text || ':' ||
          pg_catalog.date_trunc('month', transaction.created_at, 'UTC')::text,
        'UTF8'
      ), 'sha256') as source_reference_sha256,
      transaction.created_at as occurred_at
    from loyalty.ledger_transactions as transaction
    join loyalty.ledger_entries as entry
      on entry.organization_id = transaction.organization_id
     and entry.transaction_id = transaction.id
    join loyalty.ledger_accounts as account
      on account.organization_id = entry.organization_id
     and account.id = entry.account_id
     and account.wallet_id is not null
    join loyalty.wallets as wallet
      on wallet.organization_id = account.organization_id
     and wallet.id = account.wallet_id
    join loyalty.customers as customer
      on customer.organization_id = wallet.organization_id
     and customer.id = wallet.customer_id
    where transaction.created_at <= target_observed_at
    order by transaction.organization_id, wallet.customer_id,
      pg_catalog.date_trunc('month', transaction.created_at, 'UTC'),
      transaction.created_at, transaction.id
  ),
  message_sources as (
    select delivery.organization_id,
      'messages'::text as meter_key,
      'smtp_message'::text as source_kind,
      event.public_id as source_subject_public_id,
      delivery.public_id as source_evidence_public_id,
      extensions.digest(pg_catalog.convert_to(
        'm14:v1:smtp-message:' || delivery.public_id::text,
        'UTF8'
      ), 'sha256') as source_reference_sha256,
      delivery.delivered_at as occurred_at
    from loyalty_private.notification_smtp_deliveries as delivery
    join loyalty_private.notification_events as event
      on event.organization_id = delivery.organization_id
     and event.id = delivery.notification_event_id
    where delivery.state = 'delivered'
      and delivery.delivered_at <= target_observed_at
  ),
  api_sources as (
    select receipt.organization_id,
      'api_requests'::text as meter_key,
      'service_customer_command'::text as source_kind,
      customer.public_id as source_subject_public_id,
      receipt.public_id as source_evidence_public_id,
      extensions.digest(pg_catalog.convert_to(
        'm14:v1:service-customer:' || receipt.public_id::text,
        'UTF8'
      ), 'sha256') as source_reference_sha256,
      receipt.created_at as occurred_at
    from loyalty_private.service_customer_command_receipts as receipt
    join loyalty.customers as customer
      on customer.organization_id = receipt.organization_id
     and customer.id = receipt.customer_id
    where receipt.created_at <= target_observed_at
    union all
    select event.organization_id,
      'api_requests'::text,
      'service_activity_command'::text,
      event.public_id,
      event.public_id,
      extensions.digest(pg_catalog.convert_to(
        'm14:v1:service-activity:' || event.public_id::text,
        'UTF8'
      ), 'sha256'),
      event.created_at
    from loyalty_private.canonical_commerce_events as event
    where event.event_type = 'commerce.activity.recorded'
      and event.source_event_id like 'service-api:%'
      and event.created_at <= target_observed_at
  ),
  all_sources as (
    select * from order_sources
    union all select * from active_member_sources
    union all select * from message_sources
    union all select * from api_sources
  ),
  missing_sources as (
    select source.*
    from all_sources as source
    cross join lateral loyalty_private.resolve_organization_entitlement(
      source.organization_id,
      'managed.billing',
      source.source_subject_public_id::text,
      source.occurred_at
    ) as entitlement
    where entitlement.deployment_mode = 'managed'
      and entitlement.enabled
      and not exists (
        select 1
        from loyalty_private.managed_billing_usage_facts as fact
        where fact.organization_id = source.organization_id
          and fact.meter_key = source.meter_key
          and fact.source_kind = source.source_kind
          and fact.source_reference_sha256 = source.source_reference_sha256
      )
    order by source.occurred_at, source.organization_id,
      source.meter_key, source.source_reference_sha256
    limit target_limit
  ),
  inserted as (
    insert into loyalty_private.managed_billing_usage_facts (
      organization_id, meter_key, source_kind, source_subject_public_id,
      source_evidence_public_id, source_reference_sha256, quantity,
      usage_period_start, usage_period_end, occurred_at,
      actor_reference, reason, fact_sha256, created_at
    )
    select source.organization_id, source.meter_key, source.source_kind,
      source.source_subject_public_id, source.source_evidence_public_id,
      source.source_reference_sha256, 1,
      pg_catalog.date_trunc('month', source.occurred_at, 'UTC'),
      pg_catalog.date_trunc('month', source.occurred_at, 'UTC')
        + interval '1 month',
      source.occurred_at, 'worker:billing-usage-capture',
      'Captured from one reviewed immutable product source fact',
      extensions.digest(pg_catalog.convert_to(
        pg_catalog.jsonb_build_array(
          '2', source.organization_id, source.meter_key, source.source_kind,
          pg_catalog.encode(source.source_reference_sha256, 'hex'), 1,
          pg_catalog.date_trunc('month', source.occurred_at, 'UTC'),
          source.occurred_at
        )::text,
        'UTF8'
      ), 'sha256'),
      target_observed_at
    from missing_sources as source
    on conflict do nothing
    returning managed_billing_usage_facts.meter_key
  )
  select inserted.meter_key, pg_catalog.count(*)::bigint
  from inserted
  group by inserted.meter_key
  order by inserted.meter_key;
end;
$$;

create or replace function loyalty.get_my_managed_billing_usage_summary_v2(
  target_organization_public_id uuid,
  target_period_start timestamptz,
  target_at timestamptz default now()
)
returns table (usage_summary jsonb)
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  base_summary jsonb;
  target_organization_id bigint;
  corrected_meters jsonb;
begin
  select source.usage_summary into base_summary
  from loyalty.get_my_managed_billing_usage_summary_v1(
    target_organization_public_id, target_period_start, target_at
  ) as source;
  if base_summary is null then
    return;
  end if;

  select organization.id into strict target_organization_id
  from loyalty.organizations as organization
  where organization.public_id = target_organization_public_id;

  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_set(
      pg_catalog.jsonb_set(
        meter.value,
        '{pendingCount}',
        pg_catalog.to_jsonb(coalesce(counts.pending_count, 0)::text)
      ),
      '{attentionCount}',
      pg_catalog.to_jsonb(coalesce(counts.attention_count, 0)::text)
    ) order by meter.ordinality
  ) into strict corrected_meters
  from pg_catalog.jsonb_array_elements(base_summary -> 'meters')
    with ordinality as meter(value, ordinality)
  left join lateral (
    select
      pg_catalog.count(*) filter (
        where dispatch.id is null
          or dispatch.state in ('pending', 'processing', 'retryable')
          or (
            dispatch.state = 'held'
            and dispatch.last_detail_code
              <> 'billing_usage_attempt_limit_exhausted'
          )
      )::bigint as pending_count,
      pg_catalog.count(*) filter (
        where dispatch.state in ('ambiguous', 'rejected')
          or (
            dispatch.state = 'held'
            and dispatch.last_detail_code
              = 'billing_usage_attempt_limit_exhausted'
          )
      )::bigint as attention_count
    from loyalty_private.managed_billing_usage_facts as fact
    left join loyalty_private.managed_billing_usage_dispatches as dispatch
      on dispatch.organization_id = fact.organization_id
     and dispatch.usage_fact_id = fact.id
    where fact.organization_id = target_organization_id
      and fact.meter_key = meter.value ->> 'meterKey'
      and fact.usage_period_start = target_period_start
  ) as counts on true;

  usage_summary := pg_catalog.jsonb_set(
    base_summary, '{meters}', corrected_meters
  );
  return next;
end;
$$;

alter function loyalty_private.capture_managed_billing_usage_facts_v2(
  integer, timestamptz
) owner to loyalty_owner;
alter function loyalty_private.claim_managed_billing_usage_dispatches_v2(
  text, integer, integer, timestamptz
) owner to loyalty_owner;
alter function loyalty_private.authorize_managed_billing_usage_dispatch_v2(
  uuid, uuid, text, timestamptz
) owner to loyalty_owner;
alter function loyalty_private.begin_managed_billing_usage_provider_attempt_v1(
  uuid, uuid, text, timestamptz
) owner to loyalty_owner;
alter function loyalty_private.hold_managed_billing_usage_dispatch_v1(
  uuid, uuid, text, text, timestamptz
) owner to loyalty_owner;
alter function loyalty_private.finish_managed_billing_usage_dispatch_v2(
  uuid, uuid, text, text, text, integer, text, timestamptz
) owner to loyalty_owner;
alter function loyalty.get_my_managed_billing_usage_summary_v2(
  uuid, timestamptz, timestamptz
) owner to loyalty_owner;

revoke all on loyalty_private.managed_billing_usage_policy_holds
from public, anon, authenticated, loyalty_runtime, loyalty_worker;

revoke all on function
  loyalty_private.capture_managed_billing_usage_facts_v2(
    integer, timestamptz
  ),
  loyalty_private.claim_managed_billing_usage_dispatches_v2(
    text, integer, integer, timestamptz
  ),
  loyalty_private.authorize_managed_billing_usage_dispatch_v2(
    uuid, uuid, text, timestamptz
  ),
  loyalty_private.begin_managed_billing_usage_provider_attempt_v1(
    uuid, uuid, text, timestamptz
  ),
  loyalty_private.hold_managed_billing_usage_dispatch_v1(
    uuid, uuid, text, text, timestamptz
  ),
  loyalty_private.finish_managed_billing_usage_dispatch_v2(
    uuid, uuid, text, text, text, integer, text, timestamptz
  ),
  loyalty.get_my_managed_billing_usage_summary_v2(
    uuid, timestamptz, timestamptz
  )
from public, anon, authenticated, loyalty_runtime, loyalty_worker;

grant execute on function
  loyalty_private.capture_managed_billing_usage_facts_v2(
    integer, timestamptz
  ),
  loyalty_private.claim_managed_billing_usage_dispatches_v2(
    text, integer, integer, timestamptz
  ),
  loyalty_private.authorize_managed_billing_usage_dispatch_v2(
    uuid, uuid, text, timestamptz
  ),
  loyalty_private.begin_managed_billing_usage_provider_attempt_v1(
    uuid, uuid, text, timestamptz
  ),
  loyalty_private.hold_managed_billing_usage_dispatch_v1(
    uuid, uuid, text, text, timestamptz
  ),
  loyalty_private.finish_managed_billing_usage_dispatch_v2(
    uuid, uuid, text, text, text, integer, text, timestamptz
  )
to loyalty_worker;

grant execute on function loyalty.get_my_managed_billing_usage_summary_v2(
  uuid, timestamptz, timestamptz
) to authenticated;

comment on function loyalty_private.capture_managed_billing_usage_facts_v2(
  integer, timestamptz
) is
  'Captures order usage from occurrence time and counts only immutable SMTP delivery evidence as delivered messages; Klaviyo event acceptance is excluded.';
comment on function loyalty_private.begin_managed_billing_usage_provider_attempt_v1(
  uuid, uuid, text, timestamptz
) is
  'Consumes one of ten provider-send attempts only immediately before the isolated worker may send the provider request.';
comment on table loyalty_private.managed_billing_usage_policy_holds is
  'Immutable policy and local-configuration hold evidence separated from the provider-send attempt budget.';
