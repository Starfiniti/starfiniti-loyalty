-- M14-S02 verified Stripe intake. Exact raw bytes exist only in bounded server
-- memory for signature verification; PostgreSQL stores a strict minimized
-- event projection, immutable digest evidence, and an independently leased job.

alter table loyalty_private.managed_billing_account_versions
  add constraint managed_billing_account_versions_organization_id_id_key
  unique (organization_id, id);

create table loyalty_private.managed_billing_webhook_events (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null
    references loyalty.organizations(id) on delete restrict,
  billing_account_version_id bigint not null,
  provider text not null default 'stripe' check (provider = 'stripe'),
  live_mode boolean not null,
  provider_event_id text not null,
  event_type text not null,
  provider_object_id text not null,
  provider_customer_id text not null,
  provider_subscription_id text,
  provider_subscription_status text,
  provider_event_created_at timestamptz not null,
  signature_created_at timestamptz not null,
  received_at timestamptz not null,
  current_period_end timestamptz,
  trial_end timestamptz,
  body_sha256 bytea not null,
  request_fingerprint bytea not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (provider, live_mode, provider_event_id),
  foreign key (organization_id, billing_account_version_id)
    references loyalty_private.managed_billing_account_versions(
      organization_id, id
    ) on delete restrict,
  check (provider_event_id ~ '^evt_[A-Za-z0-9]{8,120}$'),
  check (event_type in (
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'customer.subscription.paused',
    'customer.subscription.resumed',
    'invoice.paid',
    'invoice.payment_failed',
    'invoice.payment_action_required'
  )),
  check (
    provider_object_id ~ '^sub_[A-Za-z0-9]{8,120}$'
    or provider_object_id ~ '^in_[A-Za-z0-9]{8,120}$'
  ),
  check (provider_customer_id ~ '^cus_[A-Za-z0-9]{8,120}$'),
  check (
    provider_subscription_id is null
    or provider_subscription_id ~ '^sub_[A-Za-z0-9]{8,120}$'
  ),
  check (
    provider_subscription_status is null
    or provider_subscription_status in (
      'incomplete', 'incomplete_expired', 'trialing', 'active',
      'past_due', 'canceled', 'unpaid', 'paused'
    )
  ),
  check (provider_event_created_at <= received_at + interval '5 minutes'),
  check (signature_created_at between
    received_at - interval '5 minutes' and received_at + interval '5 minutes'),
  check (
    current_period_end is null
    or current_period_end > provider_event_created_at
  ),
  check (
    (provider_subscription_status = 'trialing'
      and trial_end is not null
      and trial_end > provider_event_created_at)
    or (provider_subscription_status is distinct from 'trialing'
      and trial_end is null)
  ),
  check (octet_length(body_sha256) = 32),
  check (octet_length(request_fingerprint) = 32)
);

create index managed_billing_webhook_events_tenant_time_idx
  on loyalty_private.managed_billing_webhook_events (
    organization_id, provider_event_created_at desc, provider_event_id desc
  );

create table loyalty_private.managed_billing_webhook_jobs (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  webhook_event_id bigint not null unique,
  state text not null default 'pending' check (state in (
    'pending', 'processing', 'retryable', 'held', 'completed', 'dead_letter'
  )),
  attempt_count integer not null default 0 check (attempt_count between 0 and 10),
  next_attempt_at timestamptz,
  locked_by text,
  lock_token uuid,
  locked_at timestamptz,
  lease_expires_at timestamptz,
  completed_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, webhook_event_id)
    references loyalty_private.managed_billing_webhook_events(
      organization_id, id
    ) on delete restrict,
  check (
    (state = 'processing' and locked_by is not null
      and lock_token is not null and locked_at is not null
      and lease_expires_at is not null)
    or (state <> 'processing' and locked_by is null
      and lock_token is null and locked_at is null
      and lease_expires_at is null)
  ),
  check ((state = 'completed') = (completed_at is not null)),
  check (last_error_code is null or last_error_code ~ '^[a-z][a-z0-9_]{0,79}$'),
  check (updated_at >= created_at)
);

create index managed_billing_webhook_jobs_claim_idx
  on loyalty_private.managed_billing_webhook_jobs (
    state, next_attempt_at, created_at, id
  ) where state in ('pending', 'processing', 'retryable', 'held');

create table loyalty_private.managed_billing_webhook_attempts (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  webhook_job_id bigint not null,
  attempt_number integer not null check (attempt_number between 1 and 10),
  worker_reference text not null,
  outcome text not null check (outcome in (
    'state_recorded', 'invoice_observed', 'held', 'lease_expired',
    'dead_letter'
  )),
  state_revision_public_id uuid,
  error_code text,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (webhook_job_id, attempt_number),
  foreign key (organization_id, webhook_job_id)
    references loyalty_private.managed_billing_webhook_jobs(
      organization_id, id
    ) on delete restrict,
  check (length(btrim(worker_reference)) between 3 and 120),
  check (error_code is null or error_code ~ '^[a-z][a-z0-9_]{0,79}$'),
  check (
    (outcome = 'state_recorded') = (state_revision_public_id is not null)
  ),
  check (completed_at >= started_at)
);

create index managed_billing_webhook_attempts_history_idx
  on loyalty_private.managed_billing_webhook_attempts (
    organization_id, webhook_job_id, completed_at desc, id desc
  );

alter table loyalty_private.managed_billing_webhook_events owner to loyalty_owner;
alter table loyalty_private.managed_billing_webhook_jobs owner to loyalty_owner;
alter table loyalty_private.managed_billing_webhook_attempts owner to loyalty_owner;

create trigger managed_billing_webhook_events_immutable
before update or delete on loyalty_private.managed_billing_webhook_events
for each row execute function loyalty_private.reject_immutable_change();

create trigger managed_billing_webhook_attempts_immutable
before update or delete on loyalty_private.managed_billing_webhook_attempts
for each row execute function loyalty_private.reject_immutable_change();

alter table loyalty_private.managed_billing_webhook_events enable row level security;
alter table loyalty_private.managed_billing_webhook_jobs enable row level security;
alter table loyalty_private.managed_billing_webhook_attempts enable row level security;

create or replace function loyalty_private.get_managed_billing_webhook_gate_v1(
  target_at timestamptz default statement_timestamp()
)
returns table (deployment_mode text, enabled boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  config loyalty_private.deployment_configuration_versions%rowtype;
begin
  if target_at is null then
    raise exception using errcode = '22023',
      message = 'billing webhook gate time is required';
  end if;

  select configuration.* into strict config
  from loyalty_private.deployment_configuration_versions as configuration
  where configuration.effective_from <= target_at
  order by configuration.effective_from desc, configuration.id desc
  limit 1;

  deployment_mode := config.deployment_mode;
  enabled := false;
  if config.deployment_mode = 'self_hosted' then
    return next;
    return;
  end if;

  select exists (
    select 1
    from loyalty_private.managed_billing_account_versions as account
    cross join lateral loyalty_private.resolve_organization_entitlement(
      account.organization_id,
      'managed.billing',
      account.public_id::text,
      target_at
    ) as entitlement
    where account.effective_from <= target_at
      and (account.effective_until is null or account.effective_until > target_at)
      and entitlement.deployment_mode = 'managed'
      and entitlement.enabled
  ) into enabled;
  return next;
end;
$$;

create or replace function loyalty_private.accept_managed_billing_webhook_v1(
  target_provider_event_id text,
  target_event_type text,
  target_live_mode boolean,
  target_provider_object_id text,
  target_provider_customer_id text,
  target_provider_subscription_id text,
  target_provider_subscription_status text,
  target_provider_event_created_at timestamptz,
  target_current_period_end timestamptz,
  target_trial_end timestamptz,
  target_signature_created_at timestamptz,
  target_body_sha256 bytea
)
returns table (receipt_public_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  checked_at timestamptz := pg_catalog.statement_timestamp();
  account loyalty_private.managed_billing_account_versions%rowtype;
  target_deployment_mode text;
  entitlement record;
  existing loyalty_private.managed_billing_webhook_events%rowtype;
  target_fingerprint bytea;
  is_subscription_event boolean;
  created_id bigint;
begin
  is_subscription_event := target_event_type in (
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'customer.subscription.paused',
    'customer.subscription.resumed'
  );

  if target_provider_event_id is null
     or target_provider_event_id !~ '^evt_[A-Za-z0-9]{8,120}$'
     or target_event_type is null
     or target_event_type not in (
       'customer.subscription.created',
       'customer.subscription.updated',
       'customer.subscription.deleted',
       'customer.subscription.paused',
       'customer.subscription.resumed',
       'invoice.paid',
       'invoice.payment_failed',
       'invoice.payment_action_required'
     )
     or target_live_mode is null
     or target_provider_customer_id is null
     or target_provider_customer_id !~ '^cus_[A-Za-z0-9]{8,120}$'
     or target_provider_event_created_at is null
     or target_provider_event_created_at > checked_at + interval '5 minutes'
     or target_signature_created_at is null
     or target_signature_created_at not between
       checked_at - interval '5 minutes' and checked_at + interval '5 minutes'
     or target_body_sha256 is null
     or octet_length(target_body_sha256) <> 32
     or (
       target_provider_subscription_id is not null
       and target_provider_subscription_id !~ '^sub_[A-Za-z0-9]{8,120}$'
     )
     or (
       target_current_period_end is not null
       and target_current_period_end <= target_provider_event_created_at
     ) then
    raise exception using errcode = '22023',
      message = 'invalid managed billing webhook request';
  end if;

  if is_subscription_event then
    if target_provider_object_id is null
       or target_provider_object_id !~ '^sub_[A-Za-z0-9]{8,120}$'
       or target_provider_subscription_id is distinct from target_provider_object_id
       or target_provider_subscription_status is null
       or target_provider_subscription_status not in (
         'incomplete', 'incomplete_expired', 'trialing', 'active',
         'past_due', 'canceled', 'unpaid', 'paused'
       )
       or (
         target_provider_subscription_status = 'trialing'
         and (
           target_trial_end is null
           or target_trial_end <= target_provider_event_created_at
         )
       )
       or (
         target_provider_subscription_status <> 'trialing'
         and target_trial_end is not null
       ) then
      raise exception using errcode = '22023',
        message = 'invalid managed billing subscription event';
    end if;
  elsif target_provider_object_id is null
        or target_provider_object_id !~ '^in_[A-Za-z0-9]{8,120}$'
        or target_provider_subscription_status is not null
        or target_current_period_end is not null
        or target_trial_end is not null then
    raise exception using errcode = '22023',
      message = 'invalid managed billing invoice event';
  end if;

  select configuration.deployment_mode into target_deployment_mode
  from loyalty_private.deployment_configuration_versions as configuration
  where configuration.effective_from <= checked_at
  order by configuration.effective_from desc, configuration.id desc
  limit 1;
  if target_deployment_mode is distinct from 'managed' then
    raise exception using errcode = '42501',
      message = 'managed billing webhook unavailable';
  end if;

  select candidate.* into account
  from loyalty_private.managed_billing_account_versions as candidate
  where candidate.provider = 'stripe'
    and candidate.live_mode = target_live_mode
    and candidate.provider_customer_id = target_provider_customer_id
    and candidate.effective_from <= checked_at
    and (candidate.effective_until is null or candidate.effective_until > checked_at)
  order by candidate.effective_from desc, candidate.id desc
  limit 1;
  if account.id is null then
    raise exception using errcode = '22023',
      message = 'managed billing webhook account unavailable';
  end if;

  select resolved.* into entitlement
  from loyalty_private.resolve_organization_entitlement(
    account.organization_id, 'managed.billing', account.public_id::text,
    checked_at
  ) as resolved;
  if entitlement.deployment_mode is distinct from 'managed'
     or entitlement.enabled is distinct from true then
    raise exception using errcode = '42501',
      message = 'managed billing webhook unavailable';
  end if;

  target_fingerprint := extensions.digest(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_array(
        account.organization_id,
        account.public_id,
        target_provider_event_id,
        target_event_type,
        target_live_mode,
        target_provider_object_id,
        target_provider_customer_id,
        target_provider_subscription_id,
        target_provider_subscription_status,
        target_provider_event_created_at,
        target_current_period_end,
        target_trial_end,
        pg_catalog.encode(target_body_sha256, 'hex')
      )::text,
      'utf8'
    ),
    'sha256'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'stripe:' || target_live_mode::text || ':billing-webhook:' ||
        target_provider_event_id,
      0
    )
  );

  select event.* into existing
  from loyalty_private.managed_billing_webhook_events as event
  where event.provider = 'stripe'
    and event.live_mode = target_live_mode
    and event.provider_event_id = target_provider_event_id;
  if existing.id is not null then
    if existing.request_fingerprint = target_fingerprint then
      receipt_public_id := existing.public_id;
      outcome := 'duplicate';
      return next;
      return;
    end if;
    raise exception using errcode = '23505',
      message = 'managed billing webhook event conflict';
  end if;

  insert into loyalty_private.managed_billing_webhook_events (
    organization_id, billing_account_version_id, live_mode,
    provider_event_id, event_type, provider_object_id,
    provider_customer_id, provider_subscription_id,
    provider_subscription_status, provider_event_created_at,
    signature_created_at, received_at, current_period_end, trial_end,
    body_sha256, request_fingerprint
  ) values (
    account.organization_id, account.id, target_live_mode,
    target_provider_event_id, target_event_type, target_provider_object_id,
    target_provider_customer_id, target_provider_subscription_id,
    target_provider_subscription_status, target_provider_event_created_at,
    target_signature_created_at, checked_at, target_current_period_end,
    target_trial_end, target_body_sha256, target_fingerprint
  ) returning id, public_id into created_id, receipt_public_id;

  insert into loyalty_private.managed_billing_webhook_jobs (
    organization_id, webhook_event_id, next_attempt_at
  ) values (account.organization_id, created_id, checked_at);
  outcome := 'accepted';
  return next;
end;
$$;

create or replace function loyalty_private.claim_managed_billing_webhooks_v1(
  target_worker_reference text,
  target_batch_size integer default 10,
  target_lease_seconds integer default 60
)
returns table (
  receipt_public_id uuid,
  lease_token uuid,
  event_type text,
  attempt_number integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  checked_at timestamptz := pg_catalog.statement_timestamp();
  config loyalty_private.deployment_configuration_versions%rowtype;
  expired record;
  candidate record;
  target_claim_token uuid;
begin
  if target_worker_reference is null
     or length(btrim(target_worker_reference)) not between 3 and 120
     or target_batch_size not between 1 and 25
     or target_lease_seconds not between 15 and 300 then
    raise exception using errcode = '22023',
      message = 'invalid billing webhook claim request';
  end if;

  select configuration.* into strict config
  from loyalty_private.deployment_configuration_versions as configuration
  where configuration.effective_from <= checked_at
  order by configuration.effective_from desc, configuration.id desc
  limit 1;
  if config.deployment_mode <> 'managed' then
    return;
  end if;

  for expired in
    select job.*
    from loyalty_private.managed_billing_webhook_jobs as job
    where job.state = 'processing' and job.lease_expires_at <= checked_at
    order by job.lease_expires_at, job.id
    for update skip locked
    limit target_batch_size
  loop
    insert into loyalty_private.managed_billing_webhook_attempts (
      organization_id, webhook_job_id, attempt_number, worker_reference,
      outcome, error_code, started_at, completed_at
    ) values (
      expired.organization_id, expired.id, expired.attempt_count,
      expired.locked_by,
      case when expired.attempt_count >= 10
        then 'dead_letter' else 'lease_expired' end,
      'billing_webhook_lease_expired', expired.locked_at, checked_at
    ) on conflict (webhook_job_id, attempt_number) do nothing;

    update loyalty_private.managed_billing_webhook_jobs
    set state = case when expired.attempt_count >= 10
          then 'dead_letter' else 'retryable' end,
      next_attempt_at = case when expired.attempt_count >= 10
          then null else checked_at end,
      locked_by = null, lock_token = null, locked_at = null,
      lease_expires_at = null,
      last_error_code = 'billing_webhook_lease_expired',
      updated_at = checked_at
    where id = expired.id;
  end loop;

  for candidate in
    select job.id as job_id, event.public_id as event_public_id,
      event.event_type, job.attempt_count
    from loyalty_private.managed_billing_webhook_jobs as job
    join loyalty_private.managed_billing_webhook_events as event
      on event.id = job.webhook_event_id
      and event.organization_id = job.organization_id
    join loyalty_private.managed_billing_account_versions as account
      on account.id = event.billing_account_version_id
      and account.organization_id = event.organization_id
    cross join lateral loyalty_private.resolve_organization_entitlement(
      event.organization_id,
      'managed.billing',
      account.public_id::text,
      checked_at
    ) as entitlement
    where job.state in ('pending', 'retryable', 'held')
      and coalesce(job.next_attempt_at, checked_at) <= checked_at
      and job.attempt_count < 10
      and entitlement.deployment_mode = 'managed'
      and entitlement.enabled
    order by job.created_at, job.id
    for update of job skip locked
    limit target_batch_size
  loop
    receipt_public_id := candidate.event_public_id;
    target_claim_token := gen_random_uuid();
    lease_token := target_claim_token;
    event_type := candidate.event_type;
    attempt_number := candidate.attempt_count + 1;

    update loyalty_private.managed_billing_webhook_jobs
    set state = 'processing', attempt_count = attempt_number,
      next_attempt_at = null, locked_by = btrim(target_worker_reference),
      lock_token = target_claim_token,
      locked_at = checked_at,
      lease_expires_at = checked_at + pg_catalog.make_interval(
        secs => target_lease_seconds
      ),
      last_error_code = null, updated_at = checked_at
    where id = candidate.job_id;
    return next;
  end loop;
end;
$$;

create or replace function loyalty_private.process_managed_billing_webhook_v1(
  target_receipt_public_id uuid,
  target_lease_token uuid,
  target_worker_reference text
)
returns table (outcome text, state_revision_public_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  checked_at timestamptz := pg_catalog.statement_timestamp();
  event loyalty_private.managed_billing_webhook_events%rowtype;
  job loyalty_private.managed_billing_webhook_jobs%rowtype;
  account loyalty_private.managed_billing_account_versions%rowtype;
  organization_public_id uuid;
  entitlement record;
  mapped_state text;
begin
  if target_receipt_public_id is null
     or target_lease_token is null
     or target_worker_reference is null
     or length(btrim(target_worker_reference)) not between 3 and 120 then
    raise exception using errcode = '22023',
      message = 'invalid billing webhook process request';
  end if;

  select source.* into event
  from loyalty_private.managed_billing_webhook_events as source
  where source.public_id = target_receipt_public_id;
  if event.id is null then
    raise exception using errcode = '22023',
      message = 'billing webhook receipt unavailable';
  end if;

  select queue.* into job
  from loyalty_private.managed_billing_webhook_jobs as queue
  where queue.organization_id = event.organization_id
    and queue.webhook_event_id = event.id
  for update;
  if job.state <> 'processing'
     or job.lock_token is distinct from target_lease_token
     or job.locked_by is distinct from btrim(target_worker_reference)
     or job.lease_expires_at <= checked_at then
    raise exception using errcode = '42501',
      message = 'billing webhook lease not owned';
  end if;

  select candidate.* into strict account
  from loyalty_private.managed_billing_account_versions as candidate
  where candidate.id = event.billing_account_version_id
    and candidate.organization_id = event.organization_id;

  select resolved.* into entitlement
  from loyalty_private.resolve_organization_entitlement(
    event.organization_id, 'managed.billing', account.public_id::text,
    checked_at
  ) as resolved;
  if entitlement.deployment_mode is distinct from 'managed'
     or entitlement.enabled is distinct from true then
    insert into loyalty_private.managed_billing_webhook_attempts (
      organization_id, webhook_job_id, attempt_number, worker_reference,
      outcome, error_code, started_at, completed_at
    ) values (
      event.organization_id, job.id, job.attempt_count,
      btrim(target_worker_reference), 'held', 'billing_webhook_disabled',
      job.locked_at, checked_at
    );
    update loyalty_private.managed_billing_webhook_jobs
    set state = 'held', next_attempt_at = checked_at + interval '5 minutes',
      locked_by = null, lock_token = null, locked_at = null,
      lease_expires_at = null, last_error_code = 'billing_webhook_disabled',
      updated_at = checked_at
    where id = job.id;
    outcome := 'held';
    state_revision_public_id := null;
    return next;
    return;
  end if;

  select organization.public_id into strict organization_public_id
  from loyalty.organizations as organization
  where organization.id = event.organization_id;

  if event.event_type like 'customer.subscription.%' then
    mapped_state := case event.provider_subscription_status
      when 'trialing' then 'trialing'
      when 'active' then 'active'
      when 'past_due' then 'past_due'
      when 'incomplete_expired' then 'cancelled'
      when 'canceled' then 'cancelled'
      else 'suspended'
    end;
    select loyalty_private.record_managed_billing_state_v1(
      organization_public_id,
      account.public_id,
      event.provider_subscription_id,
      event.provider_event_id,
      mapped_state,
      event.provider_event_created_at,
      event.current_period_end,
      case when mapped_state = 'trialing' then event.trial_end else null end,
      null,
      'worker:billing-webhook',
      'Normalize verified Stripe subscription event',
      event.public_id
    ) into strict state_revision_public_id;
    outcome := 'state_recorded';
  else
    outcome := 'invoice_observed';
    state_revision_public_id := null;
  end if;

  insert into loyalty_private.managed_billing_webhook_attempts (
    organization_id, webhook_job_id, attempt_number, worker_reference,
    outcome, state_revision_public_id, started_at, completed_at
  ) values (
    event.organization_id, job.id, job.attempt_count,
    btrim(target_worker_reference), outcome, state_revision_public_id,
    job.locked_at, checked_at
  );
  update loyalty_private.managed_billing_webhook_jobs
  set state = 'completed', completed_at = checked_at,
    locked_by = null, lock_token = null, locked_at = null,
    lease_expires_at = null, last_error_code = null, updated_at = checked_at
  where id = job.id;
  return next;
end;
$$;

alter function loyalty_private.get_managed_billing_webhook_gate_v1(timestamptz)
  owner to loyalty_owner;
alter function loyalty_private.accept_managed_billing_webhook_v1(
  text, text, boolean, text, text, text, text, timestamptz,
  timestamptz, timestamptz, timestamptz, bytea
) owner to loyalty_owner;
alter function loyalty_private.claim_managed_billing_webhooks_v1(
  text, integer, integer
) owner to loyalty_owner;
alter function loyalty_private.process_managed_billing_webhook_v1(
  uuid, uuid, text
) owner to loyalty_owner;

revoke all on loyalty_private.managed_billing_webhook_events,
  loyalty_private.managed_billing_webhook_jobs,
  loyalty_private.managed_billing_webhook_attempts
from public, anon, authenticated, loyalty_runtime, loyalty_worker;

revoke all on function
  loyalty_private.get_managed_billing_webhook_gate_v1(timestamptz),
  loyalty_private.accept_managed_billing_webhook_v1(
    text, text, boolean, text, text, text, text, timestamptz,
    timestamptz, timestamptz, timestamptz, bytea
  ),
  loyalty_private.claim_managed_billing_webhooks_v1(text, integer, integer),
  loyalty_private.process_managed_billing_webhook_v1(uuid, uuid, text)
from public, anon, authenticated, loyalty_runtime, loyalty_worker;

grant execute on function
  loyalty_private.get_managed_billing_webhook_gate_v1(timestamptz),
  loyalty_private.accept_managed_billing_webhook_v1(
    text, text, boolean, text, text, text, text, timestamptz,
    timestamptz, timestamptz, timestamptz, bytea
  ) to loyalty_runtime;

grant execute on function
  loyalty_private.claim_managed_billing_webhooks_v1(text, integer, integer),
  loyalty_private.process_managed_billing_webhook_v1(uuid, uuid, text)
to loyalty_worker;

comment on table loyalty_private.managed_billing_webhook_events is
  'Immutable minimized verified Stripe event evidence; raw bodies, signatures, contact, payment, invoice body, metadata, and secrets are never stored.';
comment on table loyalty_private.managed_billing_webhook_jobs is
  'Private mutable lease projection for provider-independent asynchronous billing normalization.';
comment on table loyalty_private.managed_billing_webhook_attempts is
  'Append-only bounded billing normalization outcomes with no raw provider payload or loyalty value.';
comment on function loyalty_private.get_managed_billing_webhook_gate_v1(timestamptz) is
  'Returns before provider-account inspection in self-hosted mode and exposes only mode plus whether any managed billing account is canary-enabled.';
comment on function loyalty_private.accept_managed_billing_webhook_v1(
  text, text, boolean, text, text, text, text, timestamptz,
  timestamptz, timestamptz, timestamptz, bytea
) is
  'Accepts one already signature-verified minimized Stripe event under database-derived account and entitlement authority; exact event retries return one receipt.';
comment on function loyalty_private.process_managed_billing_webhook_v1(
  uuid, uuid, text
) is
  'Rechecks managed entitlement and atomically normalizes a leased subscription event into immutable billing state; invoice observations never grant authority.';
