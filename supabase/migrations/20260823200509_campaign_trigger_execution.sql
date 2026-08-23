-- M07 canonical non-purchase campaign triggers. Canonical facts enqueue
-- private bounded work; one database transaction reserves capacity, appends
-- value or a funded native reservation, and records immutable evidence.

drop trigger campaigns_immutable on loyalty.campaigns;

alter table loyalty.campaigns add column programme_id bigint;

update loyalty.campaigns as campaign
set programme_id = coalesce(
  (
    select pg_catalog.min(version.programme_id)
    from loyalty.campaign_versions as campaign_version
    join loyalty.programme_rewards as reward
      on reward.organization_id = campaign_version.organization_id
     and reward.public_id = (
       campaign_version.definition #>> '{behavior,reward,rewardId}'
     )::uuid
    join loyalty.programme_versions as version
      on version.organization_id = reward.organization_id
     and version.id = reward.programme_version_id
    where campaign_version.organization_id = campaign.organization_id
      and campaign_version.campaign_id = campaign.id
    having pg_catalog.count(distinct version.programme_id) = 1
  ),
  (
    select pg_catalog.min(programme.id)
    from loyalty.programmes as programme
    where programme.organization_id = campaign.organization_id
      and programme.programme_group_id = campaign.programme_group_id
    having pg_catalog.count(*) = 1
  )
);

do $$
begin
  if exists (select 1 from loyalty.campaigns where programme_id is null) then
    raise exception using errcode = '23514',
      message = 'existing campaign programme binding is ambiguous';
  end if;
end;
$$;

alter table loyalty.campaigns
  alter column programme_id set not null,
  add foreign key (organization_id, programme_group_id, programme_id)
    references loyalty.programmes(organization_id, programme_group_id, id)
    on delete restrict;

create trigger campaigns_immutable
before update or delete on loyalty.campaigns
for each row execute function loyalty_private.reject_immutable_change();

alter table loyalty.reward_reservations
  add column funding_kind text not null default 'wallet_points'
    check (funding_kind in ('wallet_points', 'campaign')),
  add column campaign_allocation_id bigint,
  add foreign key (organization_id, campaign_allocation_id)
    references loyalty_private.campaign_capacity_allocations(organization_id, id)
    on delete restrict,
  add check (
    (funding_kind = 'wallet_points' and campaign_allocation_id is null)
    or (funding_kind = 'campaign' and campaign_allocation_id is not null)
  );

create unique index reward_reservations_campaign_allocation_uidx
  on loyalty.reward_reservations (organization_id, campaign_allocation_id)
  where campaign_allocation_id is not null;

create table loyalty_private.campaign_trigger_jobs (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  programme_group_id bigint not null,
  programme_version_id bigint not null,
  campaign_version_id bigint not null,
  customer_id bigint not null,
  wallet_id bigint not null,
  assignment text not null check (assignment in ('treatment', 'control')),
  trigger_kind text not null check (trigger_kind in (
    'milestone', 'win_back', 'tier', 'referral', 'limited_quantity'
  )),
  action text not null check (action in ('issue', 'reverse')),
  source_reference text not null,
  qualification_fact_id bigint,
  tier_decision_id bigint,
  referral_issuance_id bigint,
  referral_compensation_id bigint,
  campaign_assignment_id bigint,
  canonical_event_id bigint,
  origin_job_id bigint,
  canonical_evidence jsonb not null,
  canonical_evidence_sha256 bytea not null
    check (pg_catalog.octet_length(canonical_evidence_sha256) = 32),
  occurred_at timestamptz not null,
  state text not null default 'pending' check (state in (
    'pending', 'processing', 'retryable', 'completed', 'cancelled',
    'manual_review'
  )),
  attempt_count smallint not null default 0
    check (attempt_count between 0 and 10),
  next_attempt_at timestamptz not null default now(),
  lease_owner text,
  lease_expires_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, campaign_version_id, action, source_reference),
  foreign key (organization_id, programme_group_id, programme_version_id)
    references loyalty.programme_versions(organization_id, programme_group_id, id)
    on delete restrict,
  foreign key (organization_id, programme_group_id, campaign_version_id)
    references loyalty.campaign_versions(organization_id, programme_group_id, id)
    on delete restrict,
  foreign key (organization_id, customer_id)
    references loyalty.customers(organization_id, id) on delete restrict,
  foreign key (organization_id, programme_group_id, wallet_id)
    references loyalty.wallets(organization_id, programme_group_id, id)
    on delete restrict,
  foreign key (organization_id, qualification_fact_id)
    references loyalty_private.tier_qualification_facts(organization_id, id)
    on delete restrict,
  foreign key (organization_id, tier_decision_id)
    references loyalty.tier_decisions(organization_id, id) on delete restrict,
  foreign key (organization_id, referral_issuance_id)
    references loyalty_private.referral_reward_issuances(organization_id, id)
    on delete restrict,
  foreign key (organization_id, referral_compensation_id)
    references loyalty_private.referral_reward_compensations(organization_id, id)
    on delete restrict,
  foreign key (organization_id, campaign_assignment_id)
    references loyalty_private.campaign_assignments(organization_id, id)
    on delete restrict,
  foreign key (organization_id, origin_job_id)
    references loyalty_private.campaign_trigger_jobs(organization_id, id)
    on delete restrict,
  foreign key (organization_id, canonical_event_id)
    references loyalty_private.canonical_commerce_events(organization_id, id)
    on delete restrict,
  check (pg_catalog.length(source_reference) between 1 and 500),
  check (pg_catalog.jsonb_typeof(canonical_evidence) = 'object'),
  check (pg_catalog.length(coalesce(lease_owner, '')) <= 200),
  check (last_error_code is null
    or last_error_code ~ '^[a-z][a-z0-9_.-]{0,99}$'),
  check ((state = 'processing') =
    (lease_owner is not null and lease_expires_at is not null)),
  check (updated_at >= created_at),
  check (
    (campaign_assignment_id is not null and (
    (trigger_kind in ('milestone', 'win_back')
      and qualification_fact_id is not null
      and tier_decision_id is null and referral_issuance_id is null
      and referral_compensation_id is null)
    or (trigger_kind = 'tier' and tier_decision_id is not null
      and qualification_fact_id is null and referral_issuance_id is null
      and referral_compensation_id is null)
    or (trigger_kind = 'referral'
      and qualification_fact_id is null and tier_decision_id is null
      and ((action = 'issue' and referral_issuance_id is not null
          and referral_compensation_id is null)
        or (action = 'reverse' and referral_issuance_id is null
          and referral_compensation_id is not null)))
    or (trigger_kind = 'limited_quantity' and action = 'issue'
      and campaign_assignment_id is not null
      and qualification_fact_id is null and tier_decision_id is null
      and referral_issuance_id is null and referral_compensation_id is null)
  ))),
  check ((action = 'issue' and origin_job_id is null)
    or (action = 'reverse' and origin_job_id is not null))
);

create index campaign_trigger_jobs_claim_idx
  on loyalty_private.campaign_trigger_jobs (next_attempt_at, id)
  where state in ('pending', 'retryable');
create index campaign_trigger_jobs_lease_idx
  on loyalty_private.campaign_trigger_jobs (lease_expires_at, id)
  where state = 'processing';
create index campaign_trigger_jobs_member_idx
  on loyalty_private.campaign_trigger_jobs (
    organization_id, campaign_version_id, wallet_id, trigger_kind, id
  );
create unique index campaign_trigger_jobs_one_reversal_uidx
  on loyalty_private.campaign_trigger_jobs (organization_id, origin_job_id)
  where action = 'reverse';

create table loyalty_private.campaign_trigger_job_attempts (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  job_id bigint not null,
  attempt_number smallint not null check (attempt_number between 1 and 10),
  outcome text not null check (outcome in (
    'completed', 'retryable', 'manual_review', 'lease_expired'
  )),
  error_code text,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  constraint campaign_trigger_job_attempt_once
    unique (organization_id, job_id, attempt_number),
  foreign key (organization_id, job_id)
    references loyalty_private.campaign_trigger_jobs(organization_id, id)
    on delete restrict,
  check (error_code is null
    or error_code ~ '^[a-z][a-z0-9_.-]{0,99}$')
);

create table loyalty_private.campaign_trigger_executions (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  programme_group_id bigint not null,
  campaign_version_id bigint not null,
  job_id bigint not null,
  origin_execution_id bigint,
  outcome text not null check (outcome in (
    'points_awarded', 'reward_reserved', 'control', 'capacity_exhausted',
    'points_reversed', 'reward_cancellation_requested',
    'reward_already_resolved', 'reward_nonreversible',
    'no_value_to_reverse'
  )),
  allocation_id bigint,
  award_transaction_id bigint,
  release_transaction_id bigint,
  award_origin_entry_id bigint,
  reversal_transaction_id bigint,
  reward_reservation_id bigint,
  canonical_evidence jsonb not null,
  occurred_at timestamptz not null,
  executed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, job_id),
  foreign key (organization_id, programme_group_id, campaign_version_id)
    references loyalty.campaign_versions(organization_id, programme_group_id, id)
    on delete restrict,
  foreign key (organization_id, job_id)
    references loyalty_private.campaign_trigger_jobs(organization_id, id)
    on delete restrict,
  foreign key (organization_id, origin_execution_id)
    references loyalty_private.campaign_trigger_executions(organization_id, id)
    on delete restrict,
  foreign key (organization_id, allocation_id)
    references loyalty_private.campaign_capacity_allocations(organization_id, id)
    on delete restrict,
  foreign key (organization_id, award_transaction_id)
    references loyalty.ledger_transactions(organization_id, id)
    on delete restrict,
  foreign key (organization_id, release_transaction_id)
    references loyalty.ledger_transactions(organization_id, id)
    on delete restrict,
  foreign key (organization_id, award_origin_entry_id)
    references loyalty.ledger_entries(organization_id, id) on delete restrict,
  foreign key (organization_id, reversal_transaction_id)
    references loyalty.ledger_transactions(organization_id, id)
    on delete restrict,
  foreign key (organization_id, reward_reservation_id)
    references loyalty.reward_reservations(organization_id, id)
    on delete restrict,
  check (pg_catalog.jsonb_typeof(canonical_evidence) = 'object'),
  check (
    (outcome = 'points_awarded' and allocation_id is not null
      and award_transaction_id is not null and release_transaction_id is not null
      and award_origin_entry_id is not null and reversal_transaction_id is null
      and reward_reservation_id is null and origin_execution_id is null)
    or (outcome = 'reward_reserved' and allocation_id is not null
      and reward_reservation_id is not null and award_transaction_id is null
      and release_transaction_id is null and award_origin_entry_id is null
      and reversal_transaction_id is null and origin_execution_id is null)
    or (outcome in ('control', 'capacity_exhausted')
      and allocation_id is null and award_transaction_id is null
      and release_transaction_id is null and award_origin_entry_id is null
      and reversal_transaction_id is null and reward_reservation_id is null
      and origin_execution_id is null)
    or (outcome = 'points_reversed' and origin_execution_id is not null
      and reversal_transaction_id is not null and allocation_id is null
      and award_transaction_id is null and release_transaction_id is null
      and award_origin_entry_id is null and reward_reservation_id is null)
    or (outcome in (
        'reward_cancellation_requested', 'reward_already_resolved',
        'reward_nonreversible'
      ) and origin_execution_id is not null and reward_reservation_id is not null
      and allocation_id is null and award_transaction_id is null
      and release_transaction_id is null and award_origin_entry_id is null
      and reversal_transaction_id is null)
    or (outcome = 'no_value_to_reverse' and origin_execution_id is not null
      and allocation_id is null and award_transaction_id is null
      and release_transaction_id is null and award_origin_entry_id is null
      and reversal_transaction_id is null and reward_reservation_id is null)
  )
);

alter table loyalty_private.campaign_trigger_jobs owner to loyalty_owner;
alter table loyalty_private.campaign_trigger_job_attempts owner to loyalty_owner;
alter table loyalty_private.campaign_trigger_executions owner to loyalty_owner;

create trigger campaign_trigger_job_attempts_immutable
before update or delete on loyalty_private.campaign_trigger_job_attempts
for each row execute function loyalty_private.reject_immutable_change();

create trigger campaign_trigger_executions_immutable
before update or delete on loyalty_private.campaign_trigger_executions
for each row execute function loyalty_private.reject_immutable_change();

create or replace function loyalty_private.enforce_campaign_execution_binding_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  stable_campaign loyalty.campaigns%rowtype;
  target_reward loyalty.programme_rewards%rowtype;
  target_reward_version loyalty.programme_versions%rowtype;
  reward_public_id text;
begin
  select campaign.* into strict stable_campaign
  from loyalty.campaigns as campaign
  where campaign.organization_id = new.organization_id
    and campaign.programme_group_id = new.programme_group_id
    and campaign.id = new.campaign_id;
  reward_public_id := new.definition #>> '{behavior,reward,rewardId}';
  if reward_public_id is not null then
    select reward.* into target_reward
    from loyalty.programme_rewards as reward
    where reward.organization_id = new.organization_id
      and reward.programme_group_id = new.programme_group_id
      and reward.public_id = reward_public_id::uuid;
    if not found then
      raise exception using errcode = '23514',
        message = 'campaign programme reward unavailable';
    end if;
    select version.* into strict target_reward_version
    from loyalty.programme_versions as version
    where version.organization_id = target_reward.organization_id
      and version.id = target_reward.programme_version_id;
    if target_reward_version.programme_id <> stable_campaign.programme_id
      or coalesce(target_reward.configuration ->> 'version', '') <> '2'
      or target_reward.configuration ->> 'fulfilmentMode'
        <> 'woocommerce_coupon'
      or target_reward.reward_kind not in (
        'fixed_discount', 'percentage_discount', 'free_shipping', 'free_product'
      )
      or (target_reward.configuration #>> '{availability,startsAt}') is not null
        and (target_reward.configuration #>> '{availability,startsAt}')::timestamptz
          > (new.definition #>> '{schedule,startsAt}')::timestamptz
      or (target_reward.configuration #>> '{availability,endsAt}') is not null
        and (target_reward.configuration #>> '{availability,endsAt}')::timestamptz
          < (new.definition #>> '{schedule,endsAt}')::timestamptz then
      raise exception using errcode = '23514',
        message = 'campaign reward is not a native reward for its programme';
    end if;
  end if;
  return new;
end;
$$;

create trigger campaign_versions_execution_binding
before insert on loyalty.campaign_versions
for each row execute function
  loyalty_private.enforce_campaign_execution_binding_v1();

create or replace function loyalty.create_campaign_draft_command(
  target_programme_public_id uuid,
  target_definition jsonb,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (
  resource_public_id uuid,
  outcome text,
  definition_sha256 text,
  version_number integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := loyalty_private.request_user_id();
  target_programme loyalty.programmes%rowtype;
  target_campaign loyalty.campaigns%rowtype;
  existing_audit loyalty.admin_audit_events%rowtype;
  entitlement_enabled boolean;
  request_hash bytea;
  definition_hash bytea;
  created_public_id uuid;
  created_version_number integer;
begin
  if actor_user_id is null then
    raise exception using errcode = '42501',
      message = 'campaign command not authorized';
  end if;
  perform loyalty_private.validate_campaign_definition_v1(target_definition);
  if target_idempotency_key is null
    or pg_catalog.length(pg_catalog.btrim(target_idempotency_key))
      not between 1 and 255
    or target_idempotency_key <> pg_catalog.btrim(target_idempotency_key)
    or target_correlation_id is null then
    raise exception using errcode = '22023',
      message = 'invalid campaign command identity';
  end if;
  select programme.* into target_programme
  from loyalty.programmes as programme
  where programme.public_id = target_programme_public_id
    and programme.status in ('draft', 'active')
    and loyalty_private.has_organization_role(
      programme.organization_id, array['owner', 'admin']::text[]
    )
  for update;
  if not found then
    raise exception using errcode = '42501',
      message = 'campaign command not authorized';
  end if;
  definition_hash := extensions.digest(
    pg_catalog.convert_to(target_definition::text, 'UTF8'), 'sha256'
  );
  request_hash := extensions.digest(pg_catalog.convert_to(
    'campaign.draft.create|' || target_programme.public_id::text || '|' ||
    pg_catalog.encode(definition_hash, 'hex'), 'UTF8'
  ), 'sha256');
  select audit.* into existing_audit
  from loyalty.admin_audit_events as audit
  where audit.organization_id = target_programme.organization_id
    and audit.idempotency_key = target_idempotency_key;
  if found then
    if existing_audit.action <> 'campaign.draft.create'
      or existing_audit.request_sha256 <> request_hash then
      raise exception using errcode = '23514',
        message = 'campaign command idempotency conflict';
    end if;
    return query
    select version.public_id, 'duplicate'::text,
      pg_catalog.encode(version.definition_sha256, 'hex'),
      version.version_number
    from loyalty.campaign_versions as version
    where version.organization_id = target_programme.organization_id
      and version.public_id = existing_audit.resource_public_id;
    return;
  end if;
  select decision.enabled into strict entitlement_enabled
  from loyalty_private.resolve_organization_entitlement(
    target_programme.organization_id, 'campaigns',
    'programme:' || target_programme.public_id::text, pg_catalog.now()
  ) as decision;
  if not entitlement_enabled then
    raise exception using errcode = '42501',
      message = 'campaigns are not enabled for this organization';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'campaign|' || target_programme.organization_id::text || '|' ||
    target_programme.programme_group_id::text || '|' ||
    (target_definition ->> 'code'), 0
  ));
  select campaign.* into target_campaign
  from loyalty.campaigns as campaign
  where campaign.organization_id = target_programme.organization_id
    and campaign.programme_group_id = target_programme.programme_group_id
    and campaign.code = target_definition ->> 'code';
  if not found then
    insert into loyalty.campaigns (
      organization_id, programme_group_id, programme_id, code,
      created_by_user_id
    ) values (
      target_programme.organization_id, target_programme.programme_group_id,
      target_programme.id, target_definition ->> 'code', actor_user_id
    ) returning * into strict target_campaign;
  elsif target_campaign.programme_id <> target_programme.id then
    raise exception using errcode = '23514',
      message = 'campaign code belongs to another programme';
  end if;
  select coalesce(pg_catalog.max(version.version_number), 0) + 1
  into created_version_number
  from loyalty.campaign_versions as version
  where version.organization_id = target_campaign.organization_id
    and version.campaign_id = target_campaign.id;
  insert into loyalty.campaign_versions (
    organization_id, programme_group_id, campaign_id, version_number,
    status, definition, definition_sha256, created_by_user_id
  ) values (
    target_campaign.organization_id, target_campaign.programme_group_id,
    target_campaign.id, created_version_number, 'draft', target_definition,
    definition_hash, actor_user_id
  ) returning public_id into created_public_id;
  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id,
    metadata
  ) values (
    target_campaign.organization_id, actor_user_id,
    'campaign.draft.create', 'campaign_version', created_public_id,
    target_idempotency_key, request_hash, target_correlation_id,
    pg_catalog.jsonb_build_object(
      'programmePublicId', target_programme.public_id,
      'campaignCode', target_campaign.code,
      'versionNumber', created_version_number,
      'definitionSha256', pg_catalog.encode(definition_hash, 'hex')
    )
  );
  return query select created_public_id, 'created'::text,
    pg_catalog.encode(definition_hash, 'hex'), created_version_number;
end;
$$;

create or replace function loyalty_private.protect_campaign_trigger_job_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000',
      message = 'campaign trigger jobs cannot be deleted';
  end if;
  if new.id <> old.id or new.public_id <> old.public_id
    or new.organization_id <> old.organization_id
    or new.programme_group_id <> old.programme_group_id
    or new.programme_version_id <> old.programme_version_id
    or new.campaign_version_id <> old.campaign_version_id
    or new.customer_id <> old.customer_id or new.wallet_id <> old.wallet_id
    or new.assignment <> old.assignment or new.trigger_kind <> old.trigger_kind
    or new.action <> old.action or new.source_reference <> old.source_reference
    or new.qualification_fact_id is distinct from old.qualification_fact_id
    or new.tier_decision_id is distinct from old.tier_decision_id
    or new.referral_issuance_id is distinct from old.referral_issuance_id
    or new.referral_compensation_id
      is distinct from old.referral_compensation_id
    or new.campaign_assignment_id is distinct from old.campaign_assignment_id
    or new.canonical_event_id is distinct from old.canonical_event_id
    or new.origin_job_id is distinct from old.origin_job_id
    or new.canonical_evidence <> old.canonical_evidence
    or new.canonical_evidence_sha256 <> old.canonical_evidence_sha256
    or new.occurred_at <> old.occurred_at or new.created_at <> old.created_at then
    raise exception using errcode = '55000',
      message = 'campaign trigger job identity is immutable';
  end if;
  if old.state in ('pending', 'retryable') and new.state = 'processing'
    and old.attempt_count < 10
    and new.attempt_count = old.attempt_count + 1
    and new.lease_owner is not null and new.lease_expires_at is not null
    and new.last_error_code is null then
    return new;
  end if;
  if old.state = 'processing'
    and new.state in ('retryable', 'manual_review', 'completed', 'cancelled')
    and new.attempt_count = old.attempt_count
    and new.lease_owner is null and new.lease_expires_at is null then
    return new;
  end if;
  if old.state in ('pending', 'retryable') and new.state = 'cancelled'
    and new.attempt_count = old.attempt_count
    and new.lease_owner is null and new.lease_expires_at is null then
    return new;
  end if;
  raise exception using errcode = '55000',
    message = 'invalid campaign trigger job transition';
end;
$$;

create trigger campaign_trigger_jobs_protect
before update or delete on loyalty_private.campaign_trigger_jobs
for each row execute function loyalty_private.protect_campaign_trigger_job_v1();

create or replace function loyalty_private.settle_campaign_funded_release_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_cancel loyalty.ledger_transactions%rowtype;
  target_available_account_id bigint;
  target_adjustment_account_id bigint;
  request_hash bytea;
begin
  if old.state = new.state or new.state <> 'released'
    or new.funding_kind <> 'campaign' then
    return new;
  end if;
  select transaction.* into strict target_cancel
  from loyalty.ledger_transactions as transaction
  where transaction.organization_id = new.organization_id
    and transaction.related_transaction_id = new.ledger_reservation_transaction_id
    and transaction.transaction_kind = 'cancel';
  select account.id into strict target_available_account_id
  from loyalty.ledger_accounts as account
  where account.organization_id = new.organization_id
    and account.programme_group_id = new.programme_group_id
    and account.wallet_id = new.wallet_id
    and account.account_kind = 'available';
  select account.id into strict target_adjustment_account_id
  from loyalty.ledger_accounts as account
  where account.organization_id = new.organization_id
    and account.programme_group_id = new.programme_group_id
    and account.wallet_id is null
    and account.account_kind = 'adjustment';
  request_hash := extensions.digest(pg_catalog.convert_to(
    new.public_id::text || ':campaign-funded-release', 'utf8'
  ), 'sha256');
  perform * from loyalty_private.post_ledger_transaction(
    new.organization_id, new.programme_group_id, new.programme_version_id,
    'manual_adjustment', 'system', 'campaign-reward-release', null,
    'campaign-reservation:' || new.public_id::text,
    target_cancel.id,
    'campaign-reservation:' || new.public_id::text || ':funding-release',
    request_hash, 'Return cancelled campaign reward funding',
    pg_catalog.jsonb_build_object(
      'fundingKind', 'campaign',
      'rewardReservationId', new.public_id,
      'campaignAllocationId', new.campaign_allocation_id,
      'points', new.cost_points
    ), pg_catalog.clock_timestamp(),
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'account_id', target_available_account_id, 'points', -new.cost_points
      ),
      pg_catalog.jsonb_build_object(
        'account_id', target_adjustment_account_id, 'points', new.cost_points
      )
    )
  );
  return new;
end;
$$;

create trigger reward_reservations_settle_campaign_funding
after update of state on loyalty.reward_reservations
for each row execute function
  loyalty_private.settle_campaign_funded_release_v1();

create or replace function loyalty_private.enqueue_campaign_trigger_job_v1(
  target_campaign_version_id bigint,
  target_programme_version_id bigint,
  target_customer_id bigint,
  target_trigger_kind text,
  target_action text,
  target_source_reference text,
  target_qualification_fact_id bigint,
  target_tier_decision_id bigint,
  target_referral_issuance_id bigint,
  target_referral_compensation_id bigint,
  target_campaign_assignment_id bigint,
  target_canonical_event_id bigint,
  target_origin_job_id bigint,
  target_canonical_evidence jsonb,
  target_occurred_at timestamptz
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_version loyalty.campaign_versions%rowtype;
  target_stable loyalty.campaigns%rowtype;
  target_programme_version loyalty.programme_versions%rowtype;
  target_assignment loyalty_private.campaign_assignments%rowtype;
  created_job_id bigint;
begin
  if target_trigger_kind not in (
      'milestone', 'win_back', 'tier', 'referral', 'limited_quantity'
    ) or target_action not in ('issue', 'reverse')
    or coalesce(pg_catalog.length(target_source_reference), 0)
      not between 1 and 500
    or target_source_reference <> pg_catalog.btrim(target_source_reference)
    or pg_catalog.jsonb_typeof(target_canonical_evidence) <> 'object'
    or target_occurred_at is null then
    raise exception using errcode = '22023',
      message = 'invalid canonical campaign trigger';
  end if;
  select version.* into strict target_version
  from loyalty.campaign_versions as version
  where version.id = target_campaign_version_id;
  select campaign.* into strict target_stable
  from loyalty.campaigns as campaign
  where campaign.organization_id = target_version.organization_id
    and campaign.id = target_version.campaign_id;
  select version.* into strict target_programme_version
  from loyalty.programme_versions as version
  where version.organization_id = target_version.organization_id
    and version.programme_group_id = target_version.programme_group_id
    and version.id = target_programme_version_id
    and version.programme_id = target_stable.programme_id;
  if target_campaign_assignment_id is null then
    select assignment.* into strict target_assignment
    from loyalty_private.campaign_assignments as assignment
    where assignment.organization_id = target_version.organization_id
      and assignment.campaign_version_id = target_version.id
      and assignment.customer_id = target_customer_id;
  else
    select assignment.* into strict target_assignment
    from loyalty_private.campaign_assignments as assignment
    where assignment.organization_id = target_version.organization_id
      and assignment.campaign_version_id = target_version.id
      and assignment.customer_id = target_customer_id
      and assignment.id = target_campaign_assignment_id;
  end if;
  insert into loyalty_private.campaign_trigger_jobs (
    organization_id, programme_group_id, programme_version_id,
    campaign_version_id, customer_id, wallet_id, assignment, trigger_kind,
    action, source_reference, qualification_fact_id, tier_decision_id,
    referral_issuance_id, referral_compensation_id, campaign_assignment_id,
    canonical_event_id, origin_job_id, canonical_evidence,
    canonical_evidence_sha256, occurred_at, next_attempt_at
  ) values (
    target_version.organization_id, target_version.programme_group_id,
    target_programme_version.id, target_version.id, target_customer_id,
    target_assignment.wallet_id, target_assignment.assignment,
    target_trigger_kind, target_action, target_source_reference,
    target_qualification_fact_id, target_tier_decision_id,
    target_referral_issuance_id, target_referral_compensation_id,
    coalesce(target_campaign_assignment_id, target_assignment.id),
    target_canonical_event_id, target_origin_job_id,
    target_canonical_evidence,
    extensions.digest(pg_catalog.convert_to(
      target_canonical_evidence::text, 'utf8'
    ), 'sha256'), target_occurred_at, pg_catalog.clock_timestamp()
  ) on conflict (
    organization_id, campaign_version_id, action, source_reference
  ) do nothing
  returning id into created_job_id;
  if created_job_id is null then
    select job.id into strict created_job_id
    from loyalty_private.campaign_trigger_jobs as job
    where job.organization_id = target_version.organization_id
      and job.campaign_version_id = target_version.id
      and job.action = target_action
      and job.source_reference = target_source_reference;
  end if;
  return created_job_id;
end;
$$;

create or replace function loyalty_private.enqueue_campaign_fact_triggers_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate record;
  metric_delta bigint;
  prior_metric numeric;
  next_metric numeric;
  threshold_value bigint;
  prior_purchase loyalty_private.tier_qualification_facts%rowtype;
  inactive_days bigint;
  original_job loyalty_private.campaign_trigger_jobs%rowtype;
  original_eligible bigint;
  remaining_eligible numeric;
  remaining_orders numeric;
  evidence jsonb;
begin
  for candidate in
    select version.*, campaign.programme_id,
      assignment.id as assignment_id,
      version.definition -> 'behavior' as behavior
    from loyalty.campaign_versions as version
    join loyalty.campaigns as campaign
      on campaign.organization_id = version.organization_id
     and campaign.id = version.campaign_id
    join loyalty.programme_versions as source_version
      on source_version.organization_id = new.organization_id
     and source_version.id = new.source_programme_version_id
     and source_version.programme_id = campaign.programme_id
    join loyalty_private.campaign_assignments as assignment
      on assignment.organization_id = version.organization_id
     and assignment.campaign_version_id = version.id
     and assignment.customer_id = new.customer_id
    where version.organization_id = new.organization_id
      and version.programme_group_id = new.programme_group_id
      and version.status <> 'draft'
      and version.definition #>> '{behavior,kind}' = 'milestone'
  loop
    metric_delta := case candidate.behavior ->> 'metric'
      when 'eligible_spend' then new.eligible_spend_minor_delta
      when 'earned_points' then new.earned_points_delta
      when 'order_count' then new.order_count_delta
      when 'referral_count' then new.referral_count_delta
      else case when
        pg_catalog.jsonb_array_length(
          candidate.behavior -> 'activityCodes'
        ) = 0 or new.activity_code in (
          select code.value
          from pg_catalog.jsonb_array_elements_text(
            candidate.behavior -> 'activityCodes'
          ) as code(value)
        )
        then new.verified_action_count_delta else 0 end
    end;
    if metric_delta = 0 then
      continue;
    end if;
    select coalesce(pg_catalog.sum(case candidate.behavior ->> 'metric'
      when 'eligible_spend' then fact.eligible_spend_minor_delta
      when 'earned_points' then fact.earned_points_delta
      when 'order_count' then fact.order_count_delta
      when 'referral_count' then fact.referral_count_delta
      else case when
        pg_catalog.jsonb_array_length(
          candidate.behavior -> 'activityCodes'
        ) = 0 or fact.activity_code in (
          select code.value
          from pg_catalog.jsonb_array_elements_text(
            candidate.behavior -> 'activityCodes'
          ) as code(value)
        )
        then fact.verified_action_count_delta else 0 end
    end), 0) into prior_metric
    from loyalty_private.tier_qualification_facts as fact
    where fact.organization_id = new.organization_id
      and fact.programme_group_id = new.programme_group_id
      and fact.customer_id = new.customer_id and fact.id < new.id;
    next_metric := prior_metric + metric_delta;
    threshold_value := (candidate.behavior ->> 'threshold')::bigint;
    evidence := pg_catalog.jsonb_build_object(
      'schemaVersion', '1', 'sourceFactId', new.public_id,
      'metric', candidate.behavior ->> 'metric',
      'activityCodes', candidate.behavior -> 'activityCodes',
      'before', prior_metric::text, 'delta', metric_delta::text,
      'after', next_metric::text, 'threshold', threshold_value::text
    );
    if metric_delta > 0 and prior_metric < threshold_value
      and next_metric >= threshold_value
      and loyalty_private.campaign_open_at_v1(candidate.id, new.effective_at)
    then
      perform loyalty_private.enqueue_campaign_trigger_job_v1(
        candidate.id, new.source_programme_version_id, new.customer_id,
        'milestone', 'issue',
        'milestone-fact:' || new.public_id::text || ':metric:' ||
          (candidate.behavior ->> 'metric'),
        new.id, null, null, null, candidate.assignment_id,
        new.canonical_event_id, null, evidence, new.effective_at
      );
    elsif metric_delta < 0 and prior_metric >= threshold_value
      and next_metric < threshold_value then
      select job.* into original_job
      from loyalty_private.campaign_trigger_jobs as job
      where job.organization_id = new.organization_id
        and job.campaign_version_id = candidate.id
        and job.customer_id = new.customer_id
        and job.trigger_kind = 'milestone' and job.action = 'issue'
        and job.state not in ('cancelled', 'manual_review')
        and not exists (
          select 1 from loyalty_private.campaign_trigger_jobs as reversal
          where reversal.organization_id = job.organization_id
            and reversal.origin_job_id = job.id
        )
      order by job.id desc limit 1;
      if found then
        if original_job.state in ('pending', 'retryable') then
          update loyalty_private.campaign_trigger_jobs
          set state = 'cancelled', last_error_code = 'canonical_fact_reversed',
            updated_at = pg_catalog.clock_timestamp()
          where id = original_job.id;
        else
          perform loyalty_private.enqueue_campaign_trigger_job_v1(
            candidate.id, original_job.programme_version_id,
            new.customer_id, 'milestone', 'reverse',
            'milestone-reversal:' || new.public_id::text || ':origin:' ||
              original_job.public_id::text,
            new.id, null, null, null, candidate.assignment_id,
            new.canonical_event_id, original_job.id,
            evidence || pg_catalog.jsonb_build_object(
              'originJobId', original_job.public_id
            ), new.effective_at
          );
        end if;
      end if;
    end if;
  end loop;

  if new.fact_kind = 'purchase' then
    select purchase.* into prior_purchase
    from loyalty_private.tier_qualification_facts as purchase
    where purchase.organization_id = new.organization_id
      and purchase.programme_group_id = new.programme_group_id
      and purchase.customer_id = new.customer_id
      and purchase.fact_kind = 'purchase' and purchase.id < new.id
      and purchase.order_count_delta + coalesce((
        select pg_catalog.sum(refund.order_count_delta)
        from loyalty_private.tier_qualification_facts as refund
        where refund.organization_id = purchase.organization_id
          and refund.origin_fact_id = purchase.id and refund.id < new.id
      ), 0) > 0
    order by purchase.effective_at desc, purchase.id desc limit 1;
    if found then
      inactive_days := pg_catalog.floor(pg_catalog.date_part(
        'epoch', new.effective_at - prior_purchase.effective_at
      ) / 86400)::bigint;
      for candidate in
        select version.*, assignment.id as assignment_id,
          version.definition -> 'behavior' as behavior
        from loyalty.campaign_versions as version
        join loyalty.campaigns as campaign
          on campaign.organization_id = version.organization_id
         and campaign.id = version.campaign_id
        join loyalty.programme_versions as source_version
          on source_version.organization_id = new.organization_id
         and source_version.id = new.source_programme_version_id
         and source_version.programme_id = campaign.programme_id
        join loyalty_private.campaign_assignments as assignment
          on assignment.organization_id = version.organization_id
         and assignment.campaign_version_id = version.id
         and assignment.customer_id = new.customer_id
        where version.organization_id = new.organization_id
          and version.programme_group_id = new.programme_group_id
          and version.status <> 'draft'
          and version.definition #>> '{behavior,kind}' = 'win_back'
      loop
        if inactive_days >= (candidate.behavior ->> 'minimumInactiveDays')::bigint
          and new.eligible_spend_minor_delta >=
            (candidate.behavior ->> 'minimumEligibleSpendMinor')::bigint
          and loyalty_private.campaign_open_at_v1(
            candidate.id, new.effective_at
          ) then
          evidence := pg_catalog.jsonb_build_object(
            'schemaVersion', '1', 'sourceFactId', new.public_id,
            'previousPurchaseFactId', prior_purchase.public_id,
            'inactiveDays', inactive_days::text,
            'minimumInactiveDays',
              candidate.behavior ->> 'minimumInactiveDays',
            'eligibleSpendMinor', new.eligible_spend_minor_delta::text,
            'minimumEligibleSpendMinor',
              candidate.behavior ->> 'minimumEligibleSpendMinor'
          );
          perform loyalty_private.enqueue_campaign_trigger_job_v1(
            candidate.id, new.source_programme_version_id, new.customer_id,
            'win_back', 'issue', 'win-back-fact:' || new.public_id::text,
            new.id, null, null, null, candidate.assignment_id,
            new.canonical_event_id, null, evidence, new.effective_at
          );
        end if;
      end loop;
    end if;
  elsif new.fact_kind = 'refund' and new.origin_fact_id is not null then
    select fact.eligible_spend_minor_delta into strict original_eligible
    from loyalty_private.tier_qualification_facts as fact
    where fact.organization_id = new.organization_id
      and fact.id = new.origin_fact_id and fact.fact_kind = 'purchase';
    remaining_eligible := original_eligible + coalesce((
      select pg_catalog.sum(refund.eligible_spend_minor_delta)
      from loyalty_private.tier_qualification_facts as refund
      where refund.organization_id = new.organization_id
        and refund.origin_fact_id = new.origin_fact_id and refund.id <= new.id
    ), 0);
    remaining_orders := 1 + coalesce((
      select pg_catalog.sum(refund.order_count_delta)
      from loyalty_private.tier_qualification_facts as refund
      where refund.organization_id = new.organization_id
        and refund.origin_fact_id = new.origin_fact_id and refund.id <= new.id
    ), 0);
    for original_job in
      select job.*
      from loyalty_private.campaign_trigger_jobs as job
      join loyalty.campaign_versions as version
        on version.organization_id = job.organization_id
       and version.id = job.campaign_version_id
      where job.organization_id = new.organization_id
        and job.qualification_fact_id = new.origin_fact_id
        and job.trigger_kind = 'win_back' and job.action = 'issue'
        and job.state not in ('cancelled', 'manual_review')
        and (
          remaining_orders <= 0 or remaining_eligible <
            (version.definition #>>
              '{behavior,minimumEligibleSpendMinor}')::bigint
        )
        and not exists (
          select 1 from loyalty_private.campaign_trigger_jobs as reversal
          where reversal.organization_id = job.organization_id
            and reversal.origin_job_id = job.id
        )
    loop
      if original_job.state in ('pending', 'retryable') then
        update loyalty_private.campaign_trigger_jobs
        set state = 'cancelled', last_error_code = 'canonical_fact_reversed',
          updated_at = pg_catalog.clock_timestamp()
        where id = original_job.id;
      else
        evidence := pg_catalog.jsonb_build_object(
          'schemaVersion', '1', 'sourceFactId', new.public_id,
          'originJobId', original_job.public_id,
          'remainingEligibleSpendMinor', remaining_eligible::text,
          'remainingOrderCount', remaining_orders::text
        );
        perform loyalty_private.enqueue_campaign_trigger_job_v1(
          original_job.campaign_version_id,
          original_job.programme_version_id, new.customer_id,
          'win_back', 'reverse',
          'win-back-reversal:' || new.public_id::text || ':origin:' ||
            original_job.public_id::text,
          new.id, null, null, null, original_job.campaign_assignment_id,
          new.canonical_event_id, original_job.id, evidence, new.effective_at
        );
      end if;
    end loop;
  end if;
  return new;
end;
$$;

create trigger tier_qualification_facts_enqueue_campaigns
after insert on loyalty_private.tier_qualification_facts
for each row execute function
  loyalty_private.enqueue_campaign_fact_triggers_v1();

create or replace function loyalty_private.enqueue_campaign_tier_triggers_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate record;
  target_event loyalty_private.canonical_commerce_events%rowtype;
  event_public_id text;
  movement_value text;
  original_job loyalty_private.campaign_trigger_jobs%rowtype;
  evidence jsonb;
begin
  event_public_id := pg_catalog.substring(
    new.idempotency_key,
      'tier:v2:event:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):version:'
  );
  if event_public_id is not null then
    select event.* into target_event
    from loyalty_private.canonical_commerce_events as event
    where event.organization_id = new.organization_id
      and event.public_id = event_public_id::uuid;
  end if;
  movement_value := case new.transition
    when 'entry' then 'entry'
    when 'reentry' then 're_entry'
    when 'none' then 'retention'
    else null
  end;
  if movement_value is not null then
    for candidate in
      select version.*, assignment.id as assignment_id
      from loyalty.campaign_versions as version
      join loyalty.campaigns as campaign
        on campaign.organization_id = version.organization_id
       and campaign.id = version.campaign_id
      join loyalty.programme_versions as source_version
        on source_version.organization_id = new.organization_id
       and source_version.id = new.programme_version_id
       and source_version.programme_id = campaign.programme_id
      join loyalty.wallets as wallet
        on wallet.organization_id = new.organization_id
       and wallet.id = new.wallet_id
      join loyalty_private.campaign_assignments as assignment
        on assignment.organization_id = version.organization_id
       and assignment.campaign_version_id = version.id
       and assignment.customer_id = wallet.customer_id
      where version.organization_id = new.organization_id
        and version.programme_group_id = new.programme_group_id
        and version.status <> 'draft'
        and version.definition #>> '{behavior,kind}' = 'tier'
        and version.definition #>> '{behavior,movement}' = movement_value
        and new.tier_code in (
          select code.value
          from pg_catalog.jsonb_array_elements_text(
            version.definition #> '{behavior,tierCodes}'
          ) as code(value)
        )
        and loyalty_private.campaign_open_at_v1(version.id, new.effective_at)
    loop
      evidence := pg_catalog.jsonb_build_object(
        'schemaVersion', '1', 'tierDecisionId', new.public_id,
        'tierCode', new.tier_code, 'qualifiedTierCode', new.qualified_tier_code,
        'movement', movement_value, 'transition', new.transition,
        'decisionExplanationSha256', pg_catalog.encode(
          extensions.digest(pg_catalog.convert_to(
            new.explanation::text, 'utf8'
          ), 'sha256'), 'hex'
        )
      );
      perform loyalty_private.enqueue_campaign_trigger_job_v1(
        candidate.id, new.programme_version_id,
        (select wallet.customer_id from loyalty.wallets as wallet
          where wallet.organization_id = new.organization_id
            and wallet.id = new.wallet_id),
        'tier', 'issue', 'tier-decision:' || new.public_id::text,
        null, new.id, null, null, candidate.assignment_id,
        target_event.id, null, evidence, new.effective_at
      );
    end loop;
  end if;

  if target_event.id is not null
    and target_event.event_type = 'commerce.order.refunded'
    and new.transition in ('grace', 'downgrade') then
    for original_job in
      select job.*
      from loyalty_private.campaign_trigger_jobs as job
      where job.organization_id = new.organization_id
        and job.programme_group_id = new.programme_group_id
        and job.wallet_id = new.wallet_id
        and job.trigger_kind = 'tier' and job.action = 'issue'
        and job.canonical_evidence ->> 'tierCode' <> new.tier_code
        and job.state not in ('cancelled', 'manual_review')
        and not exists (
          select 1 from loyalty_private.campaign_trigger_jobs as reversal
          where reversal.organization_id = job.organization_id
            and reversal.origin_job_id = job.id
        )
      order by job.id desc
    loop
      if original_job.state in ('pending', 'retryable') then
        update loyalty_private.campaign_trigger_jobs
        set state = 'cancelled', last_error_code = 'tier_refund_reversed',
          updated_at = pg_catalog.clock_timestamp()
        where id = original_job.id;
      else
        evidence := pg_catalog.jsonb_build_object(
          'schemaVersion', '1', 'tierDecisionId', new.public_id,
          'originJobId', original_job.public_id,
          'fromTierCode',
            original_job.canonical_evidence ->> 'tierCode',
          'effectiveTierCode', new.tier_code,
          'transition', new.transition,
          'refundEventId', target_event.public_id
        );
        perform loyalty_private.enqueue_campaign_trigger_job_v1(
          original_job.campaign_version_id,
          original_job.programme_version_id,
          (select wallet.customer_id from loyalty.wallets as wallet
            where wallet.organization_id = new.organization_id
              and wallet.id = new.wallet_id),
          'tier', 'reverse',
          'tier-refund:' || new.public_id::text || ':origin:' ||
            original_job.public_id::text,
          null, new.id, null, null, original_job.campaign_assignment_id,
          target_event.id, original_job.id, evidence, new.effective_at
        );
      end if;
    end loop;
  end if;
  return new;
end;
$$;

create trigger tier_decisions_enqueue_campaigns
after insert on loyalty.tier_decisions
for each row execute function
  loyalty_private.enqueue_campaign_tier_triggers_v1();

create or replace function loyalty_private.enqueue_campaign_referral_issue_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_attribution loyalty.referral_attributions%rowtype;
  target_fact loyalty_private.referral_qualification_facts%rowtype;
  candidate record;
  target_customer_id bigint;
  rewarded_party text;
  evidence jsonb;
begin
  select attribution.* into strict target_attribution
  from loyalty.referral_attributions as attribution
  where attribution.organization_id = new.organization_id
    and attribution.id = new.attribution_id;
  select fact.* into strict target_fact
  from loyalty_private.referral_qualification_facts as fact
  where fact.organization_id = new.organization_id
    and fact.id = new.qualification_fact_id;
  for candidate in
    select version.*, assignment.id as assignment_id,
      version.definition #>> '{behavior,rewardedParty}' as rewarded_party
    from loyalty.campaign_versions as version
    join loyalty.campaigns as campaign
      on campaign.organization_id = version.organization_id
     and campaign.id = version.campaign_id
    join loyalty.programme_versions as source_version
      on source_version.organization_id = new.organization_id
     and source_version.id = target_attribution.programme_version_id
     and source_version.programme_id = campaign.programme_id
    join loyalty_private.campaign_assignments as assignment
      on assignment.organization_id = version.organization_id
     and assignment.campaign_version_id = version.id
     and assignment.customer_id = case
       when version.definition #>> '{behavior,rewardedParty}' = 'advocate'
         then new.advocate_customer_id else new.friend_customer_id end
    where version.organization_id = new.organization_id
      and version.programme_group_id = target_attribution.programme_group_id
      and version.status <> 'draft'
      and version.definition #>> '{behavior,kind}' = 'referral'
      and loyalty_private.campaign_open_at_v1(version.id, new.available_at)
  loop
    rewarded_party := candidate.rewarded_party;
    target_customer_id := case rewarded_party
      when 'advocate' then new.advocate_customer_id
      else new.friend_customer_id end;
    evidence := pg_catalog.jsonb_build_object(
      'schemaVersion', '1', 'referralIssuanceId', new.public_id,
      'attributionId', target_attribution.public_id,
      'qualificationFactId', target_fact.public_id,
      'rewardedParty', rewarded_party,
      'availableAt', new.available_at
    );
    perform loyalty_private.enqueue_campaign_trigger_job_v1(
      candidate.id, target_attribution.programme_version_id,
      target_customer_id, 'referral', 'issue',
      'referral-issuance:' || new.public_id::text || ':party:' ||
        rewarded_party,
      null, null, new.id, null, candidate.assignment_id,
      target_fact.canonical_event_id, null, evidence, new.available_at
    );
  end loop;
  return new;
end;
$$;

create trigger referral_reward_issuances_enqueue_campaigns
after insert on loyalty_private.referral_reward_issuances
for each row execute function
  loyalty_private.enqueue_campaign_referral_issue_v1();

create or replace function loyalty_private.enqueue_campaign_referral_reversal_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_issuance loyalty_private.referral_reward_issuances%rowtype;
  target_event loyalty_private.canonical_commerce_events%rowtype;
  original_job loyalty_private.campaign_trigger_jobs%rowtype;
  evidence jsonb;
begin
  select issuance.* into strict target_issuance
  from loyalty_private.referral_reward_issuances as issuance
  where issuance.organization_id = new.organization_id
    and issuance.id = new.issuance_id;
  select event.* into strict target_event
  from loyalty_private.canonical_commerce_events as event
  where event.organization_id = new.organization_id
    and event.id = new.refund_event_id;
  for original_job in
    select job.*
    from loyalty_private.campaign_trigger_jobs as job
    where job.organization_id = new.organization_id
      and job.referral_issuance_id = target_issuance.id
      and job.trigger_kind = 'referral' and job.action = 'issue'
      and job.state not in ('cancelled', 'manual_review')
      and not exists (
        select 1 from loyalty_private.campaign_trigger_jobs as reversal
        where reversal.organization_id = job.organization_id
          and reversal.origin_job_id = job.id
      )
  loop
    if original_job.state in ('pending', 'retryable') then
      update loyalty_private.campaign_trigger_jobs
      set state = 'cancelled', last_error_code = 'referral_refund_reversed',
        updated_at = pg_catalog.clock_timestamp()
      where id = original_job.id;
    else
      evidence := pg_catalog.jsonb_build_object(
        'schemaVersion', '1', 'referralCompensationId', new.public_id,
        'referralIssuanceId', target_issuance.public_id,
        'originJobId', original_job.public_id,
        'rewardedParty',
          original_job.canonical_evidence ->> 'rewardedParty',
        'refundEventId', target_event.public_id
      );
      perform loyalty_private.enqueue_campaign_trigger_job_v1(
        original_job.campaign_version_id,
        original_job.programme_version_id, original_job.customer_id,
        'referral', 'reverse',
        'referral-compensation:' || new.public_id::text || ':origin:' ||
          original_job.public_id::text,
        null, null, null, new.id, original_job.campaign_assignment_id,
        new.refund_event_id, original_job.id, evidence,
        target_event.occurred_at
      );
    end if;
  end loop;
  return new;
end;
$$;

create trigger referral_reward_compensations_enqueue_campaigns
after insert on loyalty_private.referral_reward_compensations
for each row execute function
  loyalty_private.enqueue_campaign_referral_reversal_v1();

create or replace function loyalty_private.enqueue_due_limited_campaigns_v1(
  target_as_of timestamptz default now(),
  target_limit integer default 100
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate record;
  enqueued_count bigint := 0;
  evidence jsonb;
begin
  if target_as_of is null or target_limit not between 1 and 1000 then
    raise exception using errcode = '22023',
      message = 'invalid limited campaign sweep';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'campaign-limited-scheduler', 0
  ));
  for candidate in
    select version.id as campaign_version_id,
      version.public_id as campaign_version_public_id,
      version.definition_sha256, assignment.id as assignment_id,
      assignment.customer_id, assignment.assignment,
      assignment.assignment_evidence_sha256,
      reward_version.id as programme_version_id,
      reward.public_id as reward_public_id
    from loyalty.campaign_versions as version
    join loyalty.campaigns as campaign
      on campaign.organization_id = version.organization_id
     and campaign.id = version.campaign_id
    join loyalty_private.campaign_assignments as assignment
      on assignment.organization_id = version.organization_id
     and assignment.campaign_version_id = version.id
    join loyalty.programme_rewards as reward
      on reward.organization_id = version.organization_id
     and reward.public_id = (
       version.definition #>> '{behavior,reward,rewardId}'
     )::uuid
    join loyalty.programme_versions as reward_version
      on reward_version.organization_id = reward.organization_id
     and reward_version.id = reward.programme_version_id
     and reward_version.programme_id = campaign.programme_id
    where version.definition #>> '{behavior,kind}' = 'limited_quantity'
      and loyalty_private.campaign_open_at_v1(version.id, target_as_of)
      and not exists (
        select 1 from loyalty_private.campaign_trigger_jobs as job
        where job.organization_id = version.organization_id
          and job.campaign_version_id = version.id
          and job.action = 'issue'
          and job.campaign_assignment_id = assignment.id
      )
    order by version.starts_at, version.id, assignment.id
    limit target_limit
  loop
    evidence := pg_catalog.jsonb_build_object(
      'schemaVersion', '1',
      'campaignVersionId', candidate.campaign_version_public_id,
      'campaignDefinitionSha256',
        pg_catalog.encode(candidate.definition_sha256, 'hex'),
      'assignmentEvidenceSha256',
        pg_catalog.encode(candidate.assignment_evidence_sha256, 'hex'),
      'assignment', candidate.assignment,
      'rewardId', candidate.reward_public_id,
      'scheduledAt', target_as_of
    );
    perform loyalty_private.enqueue_campaign_trigger_job_v1(
      candidate.campaign_version_id, candidate.programme_version_id,
      candidate.customer_id, 'limited_quantity', 'issue',
      'limited-assignment:' || candidate.assignment_id::text,
      null, null, null, null, candidate.assignment_id, null, null,
      evidence, target_as_of
    );
    enqueued_count := enqueued_count + 1;
  end loop;
  return enqueued_count;
end;
$$;

create or replace function loyalty_private.cancel_unleased_limited_campaigns_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.resource_type = 'campaign_version'
    and new.action in ('campaign.version.pause', 'campaign.version.cancel') then
    update loyalty_private.campaign_trigger_jobs as job
    set state = 'cancelled', last_error_code = case new.action
        when 'campaign.version.pause' then 'campaign_paused'
        else 'campaign_cancelled' end,
      updated_at = pg_catalog.clock_timestamp()
    where job.organization_id = new.organization_id
      and job.campaign_version_id = (
        select version.id from loyalty.campaign_versions as version
        where version.organization_id = new.organization_id
          and version.public_id = new.resource_public_id
      )
      and job.trigger_kind = 'limited_quantity'
      and job.state in ('pending', 'retryable');
  end if;
  return new;
end;
$$;

create trigger admin_audit_cancel_unleased_limited_campaigns
after insert on loyalty.admin_audit_events
for each row execute function
  loyalty_private.cancel_unleased_limited_campaigns_v1();

create or replace function loyalty_private.claim_due_campaign_trigger_jobs_v1(
  target_worker_id text,
  target_limit integer default 25,
  target_lease_seconds integer default 60
)
returns table (
  job_id uuid,
  campaign_version_id uuid,
  trigger_kind text,
  action text,
  source_reference text,
  occurred_at timestamptz,
  attempt_count smallint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(pg_catalog.length(target_worker_id), 0) not between 1 and 200
    or target_limit not between 1 and 50
    or target_lease_seconds not between 15 and 300 then
    raise exception using errcode = '22023',
      message = 'invalid campaign trigger job claim';
  end if;
  insert into loyalty_private.campaign_trigger_job_attempts (
    organization_id, job_id, attempt_number, outcome, error_code
  )
  select job.organization_id, job.id, job.attempt_count, 'lease_expired',
    'lease_expired'
  from loyalty_private.campaign_trigger_jobs as job
  where job.state = 'processing'
    and job.lease_expires_at <= pg_catalog.clock_timestamp()
  on conflict do nothing;
  update loyalty_private.campaign_trigger_jobs as job
  set state = case when job.attempt_count >= 10
      then 'manual_review' else 'retryable' end,
    next_attempt_at = pg_catalog.clock_timestamp(), lease_owner = null,
    lease_expires_at = null, last_error_code = 'lease_expired',
    updated_at = pg_catalog.clock_timestamp()
  where job.state = 'processing'
    and job.lease_expires_at <= pg_catalog.clock_timestamp();

  return query
  with candidates as (
    select job.id
    from loyalty_private.campaign_trigger_jobs as job
    where job.state in ('pending', 'retryable')
      and job.attempt_count < 10
      and job.next_attempt_at <= pg_catalog.clock_timestamp()
    order by job.next_attempt_at, job.id
    for update of job skip locked
    limit target_limit
  ), claimed as (
    update loyalty_private.campaign_trigger_jobs as job
    set state = 'processing', attempt_count = job.attempt_count + 1,
      lease_owner = target_worker_id,
      lease_expires_at = pg_catalog.clock_timestamp()
        + pg_catalog.make_interval(secs => target_lease_seconds),
      last_error_code = null, updated_at = pg_catalog.clock_timestamp()
    from candidates
    where job.id = candidates.id
    returning job.*
  )
  select claimed.public_id, version.public_id, claimed.trigger_kind,
    claimed.action, claimed.source_reference, claimed.occurred_at,
    claimed.attempt_count
  from claimed
  join loyalty.campaign_versions as version
    on version.organization_id = claimed.organization_id
   and version.id = claimed.campaign_version_id
  order by claimed.next_attempt_at, claimed.id;
end;
$$;

create or replace function loyalty_private.finish_campaign_trigger_job_v1(
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
  target_job loyalty_private.campaign_trigger_jobs%rowtype;
  next_state text;
begin
  if coalesce(pg_catalog.length(target_worker_id), 0) not between 1 and 200
    or coalesce(target_error_code, '') !~ '^[a-z][a-z0-9_.-]{0,99}$'
    or target_retry_delay_seconds not between 1 and 3600 then
    raise exception using errcode = '22023',
      message = 'invalid campaign trigger job result';
  end if;
  select job.* into strict target_job
  from loyalty_private.campaign_trigger_jobs as job
  where job.public_id = target_job_public_id for update;
  if target_job.state <> 'processing'
    or target_job.lease_owner <> target_worker_id then
    return query select target_job.state, 'state_final'::text;
    return;
  end if;
  next_state := case when target_job.attempt_count >= 10
    then 'manual_review' else 'retryable' end;
  insert into loyalty_private.campaign_trigger_job_attempts (
    organization_id, job_id, attempt_number, outcome, error_code
  ) values (
    target_job.organization_id, target_job.id, target_job.attempt_count,
    next_state, target_error_code
  ) on conflict on constraint campaign_trigger_job_attempt_once do nothing;
  update loyalty_private.campaign_trigger_jobs
  set state = next_state,
    next_attempt_at = pg_catalog.clock_timestamp()
      + pg_catalog.make_interval(secs => target_retry_delay_seconds),
    lease_owner = null, lease_expires_at = null,
    last_error_code = target_error_code,
    updated_at = pg_catalog.clock_timestamp()
  where id = target_job.id;
  return query select next_state, next_state;
end;
$$;

create or replace function loyalty_private.create_campaign_reward_reservation_v1(
  target_job_id bigint,
  target_allocation_id bigint,
  target_worker_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_job loyalty_private.campaign_trigger_jobs%rowtype;
  target_allocation loyalty_private.campaign_capacity_allocations%rowtype;
  target_campaign loyalty.campaign_versions%rowtype;
  stable_campaign loyalty.campaigns%rowtype;
  target_reward loyalty.programme_rewards%rowtype;
  target_reward_version loyalty.programme_versions%rowtype;
  target_wallet loyalty.wallets%rowtype;
  target_connection_public_id uuid;
  target_connection_count bigint;
  target_adjustment_account_id bigint;
  target_reserved_account_id bigint;
  target_reserve_transaction_public_id uuid;
  target_reserve_transaction loyalty.ledger_transactions%rowtype;
  existing_reservation loyalty.reward_reservations%rowtype;
  created_reservation loyalty.reward_reservations%rowtype;
  request_hash bytea;
  transition_hash bytea;
  expires_at timestamptz;
begin
  select job.* into strict target_job
  from loyalty_private.campaign_trigger_jobs as job
  where job.id = target_job_id;
  select allocation.* into strict target_allocation
  from loyalty_private.campaign_capacity_allocations as allocation
  where allocation.organization_id = target_job.organization_id
    and allocation.id = target_allocation_id
    and allocation.state = 'reserved' for update;
  select reservation.* into existing_reservation
  from loyalty.reward_reservations as reservation
  where reservation.organization_id = target_job.organization_id
    and reservation.campaign_allocation_id = target_allocation.id;
  if found then
    return existing_reservation.public_id;
  end if;
  select version.* into strict target_campaign
  from loyalty.campaign_versions as version
  where version.organization_id = target_job.organization_id
    and version.id = target_job.campaign_version_id;
  select campaign.* into strict stable_campaign
  from loyalty.campaigns as campaign
  where campaign.organization_id = target_job.organization_id
    and campaign.id = target_campaign.campaign_id;
  select reward.* into strict target_reward
  from loyalty.programme_rewards as reward
  where reward.organization_id = target_job.organization_id
    and reward.public_id = (
      target_campaign.definition #>> '{behavior,reward,rewardId}'
    )::uuid
    and reward.configuration ->> 'version' = '2'
    and reward.configuration ->> 'fulfilmentMode' = 'woocommerce_coupon'
    and reward.reward_kind in (
      'fixed_discount', 'percentage_discount', 'free_shipping', 'free_product'
    );
  select version.* into strict target_reward_version
  from loyalty.programme_versions as version
  where version.organization_id = target_reward.organization_id
    and version.id = target_reward.programme_version_id
    and version.programme_id = stable_campaign.programme_id;
  select wallet.* into strict target_wallet
  from loyalty.wallets as wallet
  where wallet.organization_id = target_job.organization_id
    and wallet.id = target_job.wallet_id and wallet.status = 'active';
  perform loyalty_private.ensure_wallet_accounts(
    target_job.organization_id, target_job.programme_group_id,
    target_job.customer_id
  );
  select account.id into strict target_adjustment_account_id
  from loyalty.ledger_accounts as account
  where account.organization_id = target_job.organization_id
    and account.programme_group_id = target_job.programme_group_id
    and account.wallet_id is null and account.account_kind = 'adjustment';
  select account.id into strict target_reserved_account_id
  from loyalty.ledger_accounts as account
  where account.organization_id = target_job.organization_id
    and account.wallet_id = target_job.wallet_id
    and account.account_kind = 'reserved';
  request_hash := extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object(
      'operation', 'campaign_reward_reserve',
      'jobId', target_job.public_id,
      'allocationId', target_allocation.public_id,
      'rewardId', target_reward.public_id,
      'costPoints', target_reward.cost_points
    )::text, 'utf8'
  ), 'sha256');
  select posted.transaction_public_id into strict
    target_reserve_transaction_public_id
  from loyalty_private.post_ledger_transaction(
    target_job.organization_id, target_job.programme_group_id,
    target_reward.programme_version_id, 'reserve', 'worker',
    target_worker_id, target_job.canonical_event_id,
    'campaign:' || target_campaign.public_id::text || ':job:' ||
      target_job.public_id::text,
    null, 'campaign-trigger:' || target_job.public_id::text ||
      ':reward-funding', request_hash, null,
    pg_catalog.jsonb_build_object(
      'fundingKind', 'campaign', 'campaignVersionId', target_campaign.public_id,
      'campaignAllocationId', target_allocation.public_id,
      'rewardId', target_reward.public_id, 'points', target_reward.cost_points
    ), target_job.occurred_at,
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'account_id', target_adjustment_account_id,
        'points', -target_reward.cost_points
      ),
      pg_catalog.jsonb_build_object(
        'account_id', target_reserved_account_id,
        'points', target_reward.cost_points
      )
    )
  ) as posted;
  select transaction.* into strict target_reserve_transaction
  from loyalty.ledger_transactions as transaction
  where transaction.organization_id = target_job.organization_id
    and transaction.public_id = target_reserve_transaction_public_id;
  expires_at := pg_catalog.clock_timestamp() + pg_catalog.make_interval(
    days => (target_reward.configuration ->> 'validityDays')::integer
  );
  insert into loyalty.reward_reservations (
    organization_id, programme_group_id, programme_version_id, wallet_id,
    reward_id, cost_points, state, idempotency_key, request_sha256,
    funding_kind, campaign_allocation_id, expires_at
  ) values (
    target_job.organization_id, target_job.programme_group_id,
    target_reward.programme_version_id, target_job.wallet_id,
    target_reward.id, target_reward.cost_points, 'requested',
    'campaign-trigger:' || target_job.public_id::text || ':reward-reservation',
    request_hash, 'campaign', target_allocation.id, expires_at
  ) returning * into created_reservation;
  transition_hash := extensions.digest(pg_catalog.convert_to(
    created_reservation.public_id::text || ':campaign-funded-reserved',
    'utf8'
  ), 'sha256');
  perform * from loyalty_private.transition_reward_reservation(
    created_reservation.public_id, 'reserved',
    'campaign-trigger:' || target_job.public_id::text || ':reward-reserved',
    transition_hash, target_worker_id, null,
    target_reserve_transaction_public_id,
    'campaign:' || target_campaign.public_id::text
  );
  select (pg_catalog.array_agg(
      connection.public_id order by connection.id
    ))[1], pg_catalog.count(*)
  into target_connection_public_id, target_connection_count
  from loyalty.commerce_connections as connection
  where connection.organization_id = target_job.organization_id
    and connection.programme_id = stable_campaign.programme_id
    and connection.status in ('active', 'rotating')
    and exists (
      select 1 from loyalty.customer_identities as identity
      where identity.organization_id = connection.organization_id
        and identity.commerce_connection_id = connection.id
        and identity.customer_id = target_job.customer_id
        and identity.identity_kind = 'registered'
        and identity.external_customer_id like 'registered:%'
    );
  if target_connection_count <> 1 then
    raise exception using errcode = '55000',
      message = 'campaign reward requires one registered programme connection';
  end if;
  perform * from loyalty_private.enqueue_woocommerce_coupon_issue_v2(
    created_reservation.public_id, target_connection_public_id,
    (target_reward_version.configuration ->> 'currencyMinorUnitDigits')::smallint
  );
  return created_reservation.public_id;
end;
$$;

create or replace function loyalty_private.request_campaign_reward_reversal_v1(
  target_reservation_id bigint,
  target_job_public_id uuid,
  target_worker_id text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_reservation loyalty.reward_reservations%rowtype;
  issue_command loyalty_private.transactional_outbox%rowtype;
  target_reserve_public_id uuid;
  target_cancel_public_id uuid;
  request_hash bytea;
begin
  select reservation.* into strict target_reservation
  from loyalty.reward_reservations as reservation
  where reservation.id = target_reservation_id
    and reservation.funding_kind = 'campaign' for update;
  if target_reservation.state = 'captured' then
    return 'reward_nonreversible';
  end if;
  if target_reservation.state in (
    'cancelled', 'expired', 'failed', 'released'
  ) then
    return 'reward_already_resolved';
  end if;
  select outbox.* into issue_command
  from loyalty_private.transactional_outbox as outbox
  where outbox.organization_id = target_reservation.organization_id
    and outbox.topic = 'woocommerce.coupon.issue'
    and outbox.payload ->> 'reservationId'
      = target_reservation.public_id::text
  for update;
  if not found then
    return 'reward_nonreversible';
  end if;
  request_hash := extensions.digest(pg_catalog.convert_to(
    target_job_public_id::text || ':campaign-reward-reversal', 'utf8'
  ), 'sha256');
  if target_reservation.state = 'reserved'
    and issue_command.state = 'pending' and issue_command.attempt_count = 0 then
    update loyalty_private.transactional_outbox
    set state = 'cancelled', last_error_code = 'campaign_source_reversed',
      delivered_at = pg_catalog.clock_timestamp()
    where id = issue_command.id;
    perform * from loyalty_private.transition_reward_reservation(
      target_reservation.public_id, 'failed',
      'campaign-trigger:' || target_job_public_id::text ||
        ':reward-issue-cancelled',
      request_hash, target_worker_id,
      'Campaign source reversed before native delivery', null, null
    );
    select transaction.public_id into strict target_reserve_public_id
    from loyalty.ledger_transactions as transaction
    where transaction.organization_id = target_reservation.organization_id
      and transaction.id = target_reservation.ledger_reservation_transaction_id
      and transaction.transaction_kind = 'reserve';
    select cancelled.transaction_public_id into strict target_cancel_public_id
    from loyalty_private.cancel_reservation(
      target_reservation.organization_id, target_reserve_public_id,
      'campaign-trigger:' || target_job_public_id::text ||
        ':reward-funding-cancel',
      request_hash, pg_catalog.clock_timestamp()
    ) as cancelled;
    perform * from loyalty_private.transition_reward_reservation(
      target_reservation.public_id, 'released',
      'campaign-trigger:' || target_job_public_id::text ||
        ':reward-funding-released',
      request_hash, target_worker_id,
      'Campaign source reversed before native delivery',
      target_cancel_public_id, null
    );
    return 'reward_already_resolved';
  end if;
  if target_reservation.state = 'issued' then
    insert into loyalty_private.transactional_outbox (
      organization_id, connection_id, topic, payload_version, payload,
      available_at
    ) values (
      issue_command.organization_id, issue_command.connection_id,
      'woocommerce.coupon.cancel', 'v1',
      pg_catalog.jsonb_build_object(
        'kind', 'cancel_coupon',
        'reservationId', target_reservation.public_id,
        'code', issue_command.payload ->> 'code'
      ), pg_catalog.clock_timestamp()
    ) on conflict do nothing;
    return 'reward_cancellation_requested';
  end if;
  return 'reward_nonreversible';
end;
$$;

create or replace function loyalty_private.execute_campaign_trigger_job_v1(
  target_job_public_id uuid,
  target_worker_id text
)
returns table (
  job_id uuid,
  campaign_version_id uuid,
  action text,
  outcome text,
  allocation_id uuid,
  transaction_id uuid,
  reward_reservation_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_job loyalty_private.campaign_trigger_jobs%rowtype;
  target_campaign loyalty.campaign_versions%rowtype;
  existing_execution loyalty_private.campaign_trigger_executions%rowtype;
  origin_execution loyalty_private.campaign_trigger_executions%rowtype;
  allocation_result record;
  target_allocation loyalty_private.campaign_capacity_allocations%rowtype;
  target_policy loyalty.programme_point_expiry_policies%rowtype;
  award_result record;
  release_result record;
  reversal_result record;
  target_award loyalty.ledger_transactions%rowtype;
  target_release loyalty.ledger_transactions%rowtype;
  target_reversal loyalty.ledger_transactions%rowtype;
  target_origin_entry loyalty.ledger_entries%rowtype;
  target_reservation loyalty.reward_reservations%rowtype;
  target_reward_reservation_public_id uuid;
  target_outcome text;
  request_hash bytea;
  release_hash bytea;
  target_executed_at timestamptz := pg_catalog.clock_timestamp();
begin
  if coalesce(pg_catalog.length(target_worker_id), 0) not between 1 and 200 then
    raise exception using errcode = '22023',
      message = 'invalid campaign trigger worker';
  end if;
  select job.* into strict target_job
  from loyalty_private.campaign_trigger_jobs as job
  where job.public_id = target_job_public_id;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'campaign-trigger-job|' || target_job.organization_id::text || '|' ||
      target_job.id::text, 0
  ));
  select job.* into strict target_job
  from loyalty_private.campaign_trigger_jobs as job
  where job.organization_id = target_job.organization_id
    and job.id = target_job.id for update;
  select execution.* into existing_execution
  from loyalty_private.campaign_trigger_executions as execution
  where execution.organization_id = target_job.organization_id
    and execution.job_id = target_job.id;
  select version.* into strict target_campaign
  from loyalty.campaign_versions as version
  where version.organization_id = target_job.organization_id
    and version.id = target_job.campaign_version_id;
  if existing_execution.id is not null then
    return query select target_job.public_id, target_campaign.public_id,
      target_job.action, 'duplicate'::text,
      (select allocation.public_id
       from loyalty_private.campaign_capacity_allocations as allocation
       where allocation.organization_id = existing_execution.organization_id
         and allocation.id = existing_execution.allocation_id),
      (select transaction.public_id
       from loyalty.ledger_transactions as transaction
       where transaction.organization_id = existing_execution.organization_id
         and transaction.id = coalesce(
           existing_execution.reversal_transaction_id,
           existing_execution.award_transaction_id
         )),
      (select reservation.public_id
       from loyalty.reward_reservations as reservation
       where reservation.organization_id = existing_execution.organization_id
         and reservation.id = existing_execution.reward_reservation_id);
    return;
  end if;
  if target_job.state <> 'processing'
    or target_job.lease_owner <> target_worker_id
    or target_job.lease_expires_at <= target_executed_at then
    raise exception using errcode = '55000',
      message = 'campaign trigger lease is not owned';
  end if;
  if target_job.canonical_evidence_sha256 <> extensions.digest(
    pg_catalog.convert_to(target_job.canonical_evidence::text, 'utf8'),
    'sha256'
  ) then
    raise exception using errcode = '23514',
      message = 'campaign trigger evidence hash mismatch';
  end if;

  if target_job.action = 'issue' then
    if not loyalty_private.campaign_open_at_v1(
      target_job.campaign_version_id, target_job.occurred_at
    ) then
      raise exception using errcode = '23514',
        message = 'campaign trigger was not open at its canonical instant';
    end if;
    if target_job.assignment = 'control' then
      insert into loyalty_private.campaign_trigger_executions (
        organization_id, programme_group_id, campaign_version_id, job_id,
        outcome, canonical_evidence, occurred_at, executed_at
      ) values (
        target_job.organization_id, target_job.programme_group_id,
        target_job.campaign_version_id, target_job.id, 'control',
        target_job.canonical_evidence, target_job.occurred_at,
        target_executed_at
      ) returning * into existing_execution;
      target_outcome := 'control';
    else
      request_hash := extensions.digest(pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'jobId', target_job.public_id,
          'campaignDefinitionSha256',
            pg_catalog.encode(target_campaign.definition_sha256, 'hex'),
          'canonicalEvidenceSha256',
            pg_catalog.encode(target_job.canonical_evidence_sha256, 'hex')
        )::text, 'utf8'
      ), 'sha256');
      select * into strict allocation_result
      from loyalty_private.reserve_campaign_capacity_v1(
        target_job.organization_id, target_job.programme_group_id,
        target_campaign.public_id, target_job.customer_id,
        target_job.source_reference,
        'campaign-trigger:' || target_job.public_id::text || ':capacity',
        request_hash, target_job.occurred_at
      );
      if allocation_result.outcome = 'capacity_exhausted' then
        insert into loyalty_private.campaign_trigger_executions (
          organization_id, programme_group_id, campaign_version_id, job_id,
          outcome, canonical_evidence, occurred_at, executed_at
        ) values (
          target_job.organization_id, target_job.programme_group_id,
          target_job.campaign_version_id, target_job.id,
          'capacity_exhausted', target_job.canonical_evidence,
          target_job.occurred_at, target_executed_at
        ) returning * into existing_execution;
        target_outcome := 'capacity_exhausted';
      else
        select allocation.* into strict target_allocation
        from loyalty_private.campaign_capacity_allocations as allocation
        where allocation.organization_id = target_job.organization_id
          and allocation.public_id = allocation_result.allocation_public_id
          and allocation.state = 'reserved';
        if target_allocation.points > 0 then
          select policy.* into strict target_policy
          from loyalty.programme_point_expiry_policies as policy
          where policy.organization_id = target_job.organization_id
            and policy.programme_group_id = target_job.programme_group_id
            and policy.programme_version_id = target_job.programme_version_id;
          select * into strict award_result
          from loyalty_private.award_points(
            target_job.organization_id, target_job.programme_group_id,
            target_job.programme_version_id, target_job.customer_id,
            target_allocation.points,
            'campaign-trigger:' || target_job.public_id::text || ':award',
            request_hash, target_job.canonical_event_id,
            'campaign:' || target_campaign.public_id::text || ':trigger:' ||
              target_job.public_id::text,
            target_job.occurred_at
          );
          select transaction.* into strict target_award
          from loyalty.ledger_transactions as transaction
          where transaction.organization_id = target_job.organization_id
            and transaction.public_id = award_result.transaction_public_id;
          select entry.* into strict target_origin_entry
          from loyalty.ledger_entries as entry
          join loyalty.ledger_accounts as account
            on account.id = entry.account_id
          where entry.organization_id = target_job.organization_id
            and entry.transaction_id = target_award.id
            and account.account_kind = 'pending' and entry.points > 0;
          release_hash := extensions.digest(pg_catalog.convert_to(
            pg_catalog.jsonb_build_object(
              'jobId', target_job.public_id,
              'originEntryId', target_origin_entry.public_id,
              'expiresAt', target_executed_at + pg_catalog.make_interval(
                days => target_policy.expire_after_days
              )
            )::text, 'utf8'
          ), 'sha256');
          select * into strict release_result
          from loyalty_private.release_points(
            target_job.organization_id, target_job.programme_group_id,
            target_job.programme_version_id, target_origin_entry.public_id,
            target_executed_at + pg_catalog.make_interval(
              days => target_policy.expire_after_days
            ),
            'campaign-trigger:' || target_job.public_id::text || ':release',
            release_hash, target_executed_at
          );
          select transaction.* into strict target_release
          from loyalty.ledger_transactions as transaction
          where transaction.organization_id = target_job.organization_id
            and transaction.public_id = release_result.transaction_public_id;
          perform * from loyalty_private.finish_campaign_capacity_v1(
            target_allocation.public_id, 'committed',
            'campaign-trigger:' || target_job.public_id::text ||
              ':award:' || target_award.public_id::text
          );
          insert into loyalty_private.campaign_trigger_executions (
            organization_id, programme_group_id, campaign_version_id, job_id,
            outcome, allocation_id, award_transaction_id,
            release_transaction_id, award_origin_entry_id,
            canonical_evidence, occurred_at, executed_at
          ) values (
            target_job.organization_id, target_job.programme_group_id,
            target_job.campaign_version_id, target_job.id, 'points_awarded',
            target_allocation.id, target_award.id, target_release.id,
            target_origin_entry.id, target_job.canonical_evidence,
            target_job.occurred_at, target_executed_at
          ) returning * into existing_execution;
          target_outcome := 'points_awarded';
        else
          target_reward_reservation_public_id :=
            loyalty_private.create_campaign_reward_reservation_v1(
              target_job.id, target_allocation.id, target_worker_id
            );
          select reservation.* into strict target_reservation
          from loyalty.reward_reservations as reservation
          where reservation.organization_id = target_job.organization_id
            and reservation.public_id = target_reward_reservation_public_id;
          perform * from loyalty_private.finish_campaign_capacity_v1(
            target_allocation.public_id, 'committed',
            'campaign-trigger:' || target_job.public_id::text ||
              ':reservation:' || target_reservation.public_id::text
          );
          insert into loyalty_private.campaign_trigger_executions (
            organization_id, programme_group_id, campaign_version_id, job_id,
            outcome, allocation_id, reward_reservation_id,
            canonical_evidence, occurred_at, executed_at
          ) values (
            target_job.organization_id, target_job.programme_group_id,
            target_job.campaign_version_id, target_job.id, 'reward_reserved',
            target_allocation.id, target_reservation.id,
            target_job.canonical_evidence, target_job.occurred_at,
            target_executed_at
          ) returning * into existing_execution;
          target_outcome := 'reward_reserved';
        end if;
      end if;
    end if;
  else
    select execution.* into origin_execution
    from loyalty_private.campaign_trigger_executions as execution
    where execution.organization_id = target_job.organization_id
      and execution.job_id = target_job.origin_job_id;
    if not found then
      raise exception using errcode = '55000',
        message = 'campaign origin execution is not complete';
    end if;
    if origin_execution.outcome = 'points_awarded' then
      select entry.* into strict target_origin_entry
      from loyalty.ledger_entries as entry
      where entry.organization_id = target_job.organization_id
        and entry.id = origin_execution.award_origin_entry_id;
      request_hash := extensions.digest(pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'jobId', target_job.public_id,
          'originExecutionId', origin_execution.public_id,
          'originEntryId', target_origin_entry.public_id,
          'points', target_origin_entry.points
        )::text, 'utf8'
      ), 'sha256');
      select * into strict reversal_result
      from loyalty_private.reverse_award_points(
        target_job.organization_id, target_origin_entry.public_id,
        target_origin_entry.points,
        'campaign-trigger:' || target_job.public_id::text || ':reversal',
        request_hash, 'Canonical campaign source was reversed',
        target_job.occurred_at
      );
      select transaction.* into strict target_reversal
      from loyalty.ledger_transactions as transaction
      where transaction.organization_id = target_job.organization_id
        and transaction.public_id = reversal_result.transaction_public_id;
      insert into loyalty_private.campaign_trigger_executions (
        organization_id, programme_group_id, campaign_version_id, job_id,
        origin_execution_id, outcome, reversal_transaction_id,
        canonical_evidence, occurred_at, executed_at
      ) values (
        target_job.organization_id, target_job.programme_group_id,
        target_job.campaign_version_id, target_job.id, origin_execution.id,
        'points_reversed', target_reversal.id,
        target_job.canonical_evidence, target_job.occurred_at,
        target_executed_at
      ) returning * into existing_execution;
      target_outcome := 'points_reversed';
    elsif origin_execution.outcome = 'reward_reserved' then
      target_outcome := loyalty_private.request_campaign_reward_reversal_v1(
        origin_execution.reward_reservation_id, target_job.public_id,
        target_worker_id
      );
      insert into loyalty_private.campaign_trigger_executions (
        organization_id, programme_group_id, campaign_version_id, job_id,
        origin_execution_id, outcome, reward_reservation_id,
        canonical_evidence, occurred_at, executed_at
      ) values (
        target_job.organization_id, target_job.programme_group_id,
        target_job.campaign_version_id, target_job.id, origin_execution.id,
        target_outcome, origin_execution.reward_reservation_id,
        target_job.canonical_evidence, target_job.occurred_at,
        target_executed_at
      ) returning * into existing_execution;
    else
      target_outcome := 'no_value_to_reverse';
      insert into loyalty_private.campaign_trigger_executions (
        organization_id, programme_group_id, campaign_version_id, job_id,
        origin_execution_id, outcome, canonical_evidence, occurred_at,
        executed_at
      ) values (
        target_job.organization_id, target_job.programme_group_id,
        target_job.campaign_version_id, target_job.id, origin_execution.id,
        target_outcome, target_job.canonical_evidence,
        target_job.occurred_at, target_executed_at
      ) returning * into existing_execution;
    end if;
  end if;

  insert into loyalty_private.campaign_trigger_job_attempts (
    organization_id, job_id, attempt_number, outcome
  ) values (
    target_job.organization_id, target_job.id, target_job.attempt_count,
    'completed'
  ) on conflict on constraint campaign_trigger_job_attempt_once do nothing;
  update loyalty_private.campaign_trigger_jobs
  set state = 'completed', lease_owner = null, lease_expires_at = null,
    last_error_code = null, updated_at = target_executed_at
  where id = target_job.id;
  return query select target_job.public_id, target_campaign.public_id,
    target_job.action, target_outcome,
    (select allocation.public_id
     from loyalty_private.campaign_capacity_allocations as allocation
     where allocation.organization_id = existing_execution.organization_id
       and allocation.id = existing_execution.allocation_id),
    (select transaction.public_id
     from loyalty.ledger_transactions as transaction
     where transaction.organization_id = existing_execution.organization_id
       and transaction.id = coalesce(
         existing_execution.reversal_transaction_id,
         existing_execution.award_transaction_id
       )),
    (select reservation.public_id
     from loyalty.reward_reservations as reservation
     where reservation.organization_id = existing_execution.organization_id
       and reservation.id = existing_execution.reward_reservation_id);
end;
$$;

alter function loyalty_private.enforce_campaign_execution_binding_v1()
  owner to loyalty_owner;
alter function loyalty.create_campaign_draft_command(uuid, jsonb, text, uuid)
  owner to loyalty_owner;
alter function loyalty_private.protect_campaign_trigger_job_v1()
  owner to loyalty_owner;
alter function loyalty_private.settle_campaign_funded_release_v1()
  owner to loyalty_owner;
alter function loyalty_private.enqueue_campaign_trigger_job_v1(
  bigint, bigint, bigint, text, text, text, bigint, bigint, bigint, bigint,
  bigint, bigint, bigint, jsonb, timestamptz
) owner to loyalty_owner;
alter function loyalty_private.enqueue_campaign_fact_triggers_v1()
  owner to loyalty_owner;
alter function loyalty_private.enqueue_campaign_tier_triggers_v1()
  owner to loyalty_owner;
alter function loyalty_private.enqueue_campaign_referral_issue_v1()
  owner to loyalty_owner;
alter function loyalty_private.enqueue_campaign_referral_reversal_v1()
  owner to loyalty_owner;
alter function loyalty_private.enqueue_due_limited_campaigns_v1(
  timestamptz, integer
) owner to loyalty_owner;
alter function loyalty_private.cancel_unleased_limited_campaigns_v1()
  owner to loyalty_owner;
alter function loyalty_private.claim_due_campaign_trigger_jobs_v1(
  text, integer, integer
) owner to loyalty_owner;
alter function loyalty_private.finish_campaign_trigger_job_v1(
  uuid, text, text, integer
) owner to loyalty_owner;
alter function loyalty_private.create_campaign_reward_reservation_v1(
  bigint, bigint, text
) owner to loyalty_owner;
alter function loyalty_private.request_campaign_reward_reversal_v1(
  bigint, uuid, text
) owner to loyalty_owner;
alter function loyalty_private.execute_campaign_trigger_job_v1(uuid, text)
  owner to loyalty_owner;

alter table loyalty_private.campaign_trigger_jobs enable row level security;
alter table loyalty_private.campaign_trigger_job_attempts
  enable row level security;
alter table loyalty_private.campaign_trigger_executions
  enable row level security;

revoke all on loyalty_private.campaign_trigger_jobs,
  loyalty_private.campaign_trigger_job_attempts,
  loyalty_private.campaign_trigger_executions
from public, anon, authenticated, loyalty_runtime, loyalty_worker;

revoke all on function
  loyalty_private.enforce_campaign_execution_binding_v1(),
  loyalty_private.protect_campaign_trigger_job_v1(),
  loyalty_private.settle_campaign_funded_release_v1(),
  loyalty_private.enqueue_campaign_trigger_job_v1(
    bigint, bigint, bigint, text, text, text, bigint, bigint, bigint, bigint,
    bigint, bigint, bigint, jsonb, timestamptz
  ),
  loyalty_private.enqueue_campaign_fact_triggers_v1(),
  loyalty_private.enqueue_campaign_tier_triggers_v1(),
  loyalty_private.enqueue_campaign_referral_issue_v1(),
  loyalty_private.enqueue_campaign_referral_reversal_v1(),
  loyalty_private.enqueue_due_limited_campaigns_v1(timestamptz, integer),
  loyalty_private.cancel_unleased_limited_campaigns_v1(),
  loyalty_private.claim_due_campaign_trigger_jobs_v1(text, integer, integer),
  loyalty_private.finish_campaign_trigger_job_v1(uuid, text, text, integer),
  loyalty_private.create_campaign_reward_reservation_v1(bigint, bigint, text),
  loyalty_private.request_campaign_reward_reversal_v1(bigint, uuid, text),
  loyalty_private.execute_campaign_trigger_job_v1(uuid, text)
from public, anon, authenticated, loyalty_runtime, loyalty_worker;

grant execute on function
  loyalty_private.enqueue_due_limited_campaigns_v1(timestamptz, integer),
  loyalty_private.claim_due_campaign_trigger_jobs_v1(text, integer, integer),
  loyalty_private.finish_campaign_trigger_job_v1(uuid, text, text, integer),
  loyalty_private.execute_campaign_trigger_job_v1(uuid, text)
to loyalty_worker;

comment on column loyalty.campaigns.programme_id is
  'Exact programme authority selected by the authenticated campaign draft command.';
comment on column loyalty.reward_reservations.funding_kind is
  'Wallet-point redemption or campaign-funded native benefit; campaign funding never debits member available points.';
comment on table loyalty_private.campaign_trigger_jobs is
  'Canonical milestone, win-back, tier, referral, and limited campaign work with bounded leases and exact source identity.';
comment on table loyalty_private.campaign_trigger_job_attempts is
  'Immutable bounded attempt and lease-expiry evidence for campaign trigger processing.';
comment on table loyalty_private.campaign_trigger_executions is
  'Immutable source-to-capacity-to-ledger-or-native-reservation campaign evidence, including compensations and controls.';
comment on function loyalty_private.enqueue_due_limited_campaigns_v1(
  timestamptz, integer
) is
  'Materializes a bounded deterministic batch of schedule-open limited reward jobs from immutable assignments.';
comment on function loyalty_private.execute_campaign_trigger_job_v1(uuid, text)
  is
  'Atomically verifies one owned canonical trigger lease, reserves campaign capacity, commits value or control evidence, and settles the job.';
