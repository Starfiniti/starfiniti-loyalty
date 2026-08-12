-- Phase 6 programme publication, evaluation evidence, tiers, and reward state.

alter table loyalty.programme_versions
  drop constraint if exists programme_versions_status_check;
alter table loyalty.programme_versions
  drop constraint if exists programme_versions_check;
alter table loyalty.programme_versions
  add column scheduled_for timestamptz,
  add column retired_at timestamptz,
  add column supersedes_version_id bigint,
  add foreign key (organization_id, supersedes_version_id)
    references loyalty.programme_versions(organization_id, id) on delete restrict,
  add constraint programme_versions_status_check
    check (status in ('draft', 'scheduled', 'published', 'retired', 'superseded')),
  add constraint programme_versions_lifecycle_check check (
    (status = 'draft' and scheduled_for is null and published_at is null and retired_at is null)
    or (status = 'scheduled' and scheduled_for is not null and published_at is null and retired_at is null)
    or (status = 'published' and published_at is not null and retired_at is null)
    or (status in ('retired', 'superseded') and published_at is not null and retired_at is not null)
  );

create unique index programme_versions_one_published_uidx
  on loyalty.programme_versions (organization_id, programme_id)
  where status = 'published';
create unique index programme_versions_schedule_uidx
  on loyalty.programme_versions (organization_id, programme_id, scheduled_for)
  where status = 'scheduled';
create index programme_versions_due_schedule_idx
  on loyalty.programme_versions (scheduled_for, id)
  where status = 'scheduled';

create table loyalty.programme_tiers (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  programme_group_id bigint not null,
  programme_version_id bigint not null,
  code text not null,
  name text not null,
  ordinal smallint not null check (ordinal > 0),
  minimum_eligible_spend_minor bigint not null check (minimum_eligible_spend_minor >= 0),
  points_per_major_unit bigint not null check (points_per_major_unit > 0),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, programme_version_id, code),
  unique (organization_id, programme_version_id, ordinal),
  foreign key (organization_id, programme_group_id, programme_version_id)
    references loyalty.programme_versions(organization_id, programme_group_id, id) on delete restrict,
  check (code ~ '^[a-z][a-z0-9_-]{0,79}$'),
  check (length(btrim(name)) between 1 and 200)
);

create index programme_tiers_threshold_idx
  on loyalty.programme_tiers (
    organization_id, programme_version_id, minimum_eligible_spend_minor desc
  );

create table loyalty.programme_rewards (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  programme_group_id bigint not null,
  programme_version_id bigint not null,
  code text not null,
  name text not null,
  reward_kind text not null check (reward_kind in (
    'fixed_discount', 'percentage_discount', 'free_product', 'free_shipping',
    'store_credit', 'exclusive_access', 'custom'
  )),
  cost_points bigint not null check (cost_points > 0),
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, programme_version_id, code),
  foreign key (organization_id, programme_group_id, programme_version_id)
    references loyalty.programme_versions(organization_id, programme_group_id, id) on delete restrict,
  check (code ~ '^[a-z][a-z0-9_-]{0,79}$'),
  check (length(btrim(name)) between 1 and 200)
);

create index programme_rewards_version_idx
  on loyalty.programme_rewards (organization_id, programme_version_id, id);

create table loyalty.tier_decisions (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  programme_group_id bigint not null,
  programme_version_id bigint not null,
  wallet_id bigint not null,
  tier_code text not null,
  qualified_tier_code text not null,
  transition text not null check (transition in ('none', 'upgrade', 'grace', 'downgrade', 'manual')),
  rolling_eligible_spend_minor bigint not null check (rolling_eligible_spend_minor >= 0),
  below_threshold_since timestamptz,
  grace_until timestamptz,
  effective_at timestamptz not null,
  idempotency_key text not null,
  request_sha256 bytea not null check (octet_length(request_sha256) = 32),
  explanation jsonb not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, programme_group_id, programme_version_id)
    references loyalty.programme_versions(organization_id, programme_group_id, id) on delete restrict,
  foreign key (organization_id, programme_group_id, wallet_id)
    references loyalty.wallets(organization_id, programme_group_id, id) on delete restrict,
  foreign key (organization_id, programme_version_id, tier_code)
    references loyalty.programme_tiers(organization_id, programme_version_id, code) on delete restrict,
  foreign key (organization_id, programme_version_id, qualified_tier_code)
    references loyalty.programme_tiers(organization_id, programme_version_id, code) on delete restrict,
  check (length(idempotency_key) between 1 and 255),
  check ((below_threshold_since is null) = (grace_until is null)),
  check (grace_until is null or grace_until > below_threshold_since)
);

create index tier_decisions_wallet_history_idx
  on loyalty.tier_decisions (organization_id, wallet_id, effective_at desc, id desc);

create table loyalty.tier_memberships (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  programme_group_id bigint not null,
  programme_version_id bigint not null,
  wallet_id bigint not null,
  tier_code text not null,
  decision_id bigint not null,
  effective_from timestamptz not null,
  effective_until timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, programme_group_id, programme_version_id)
    references loyalty.programme_versions(organization_id, programme_group_id, id) on delete restrict,
  foreign key (organization_id, programme_group_id, wallet_id)
    references loyalty.wallets(organization_id, programme_group_id, id) on delete restrict,
  foreign key (organization_id, programme_version_id, tier_code)
    references loyalty.programme_tiers(organization_id, programme_version_id, code) on delete restrict,
  foreign key (organization_id, decision_id)
    references loyalty.tier_decisions(organization_id, id) on delete restrict,
  check (effective_until is null or effective_until > effective_from)
);

create unique index tier_memberships_one_current_uidx
  on loyalty.tier_memberships (organization_id, wallet_id)
  where effective_until is null;
create index tier_memberships_wallet_history_idx
  on loyalty.tier_memberships (organization_id, wallet_id, effective_from desc, id desc);

create table loyalty.reward_reservations (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  programme_group_id bigint not null,
  programme_version_id bigint not null,
  wallet_id bigint not null,
  reward_id bigint not null,
  cost_points bigint not null check (cost_points > 0),
  state text not null default 'requested' check (state in (
    'requested', 'reserved', 'issued', 'captured', 'cancelled',
    'expired', 'failed', 'released'
  )),
  idempotency_key text not null,
  request_sha256 bytea not null check (octet_length(request_sha256) = 32),
  ledger_reservation_transaction_id bigint,
  connector_execution_reference text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, programme_group_id, programme_version_id)
    references loyalty.programme_versions(organization_id, programme_group_id, id) on delete restrict,
  foreign key (organization_id, programme_group_id, wallet_id)
    references loyalty.wallets(organization_id, programme_group_id, id) on delete restrict,
  foreign key (organization_id, reward_id)
    references loyalty.programme_rewards(organization_id, id) on delete restrict,
  foreign key (organization_id, ledger_reservation_transaction_id)
    references loyalty.ledger_transactions(organization_id, id) on delete restrict,
  check (length(idempotency_key) between 1 and 255),
  check (connector_execution_reference is null or length(connector_execution_reference) between 1 and 500),
  check (expires_at > created_at),
  check (updated_at >= created_at)
);

create index reward_reservations_wallet_state_idx
  on loyalty.reward_reservations (organization_id, wallet_id, state, expires_at, id);
create index reward_reservations_due_idx
  on loyalty.reward_reservations (expires_at, id)
  where state in ('requested', 'reserved', 'issued');

create table loyalty.reward_reservation_transitions (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  reservation_id bigint not null,
  from_state text not null,
  to_state text not null,
  idempotency_key text not null,
  request_sha256 bytea not null check (octet_length(request_sha256) = 32),
  actor_id text not null,
  reason text,
  ledger_transaction_id bigint,
  connector_execution_reference text,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, idempotency_key),
  unique (organization_id, ledger_transaction_id),
  foreign key (organization_id, reservation_id)
    references loyalty.reward_reservations(organization_id, id) on delete restrict,
  foreign key (organization_id, ledger_transaction_id)
    references loyalty.ledger_transactions(organization_id, id) on delete restrict,
  check (from_state <> to_state),
  check (length(idempotency_key) between 1 and 255),
  check (length(actor_id) between 1 and 255),
  check (reason is null or length(btrim(reason)) between 8 and 1000),
  check (connector_execution_reference is null or length(connector_execution_reference) between 1 and 500)
);

create index reward_reservation_transitions_history_idx
  on loyalty.reward_reservation_transitions (organization_id, reservation_id, id);

create table loyalty_private.programme_evaluations (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null references loyalty.organizations(id) on delete restrict,
  programme_group_id bigint not null,
  programme_version_id bigint not null,
  canonical_event_id bigint,
  evaluation_kind text not null check (evaluation_kind in ('live_award', 'simulation', 'tier_review')),
  subject_reference text not null,
  idempotency_key text not null,
  input_sha256 bytea not null check (octet_length(input_sha256) = 32),
  result_sha256 bytea not null check (octet_length(result_sha256) = 32),
  result jsonb not null,
  explanation jsonb not null,
  evaluated_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, programme_group_id, programme_version_id)
    references loyalty.programme_versions(organization_id, programme_group_id, id) on delete restrict,
  foreign key (organization_id, canonical_event_id)
    references loyalty_private.canonical_commerce_events(organization_id, id) on delete restrict,
  check (length(subject_reference) between 1 and 500),
  check (length(idempotency_key) between 1 and 255)
);

create index programme_evaluations_subject_idx
  on loyalty_private.programme_evaluations (
    organization_id, programme_version_id, subject_reference, evaluated_at desc, id desc
  );

create table loyalty_private.point_expiry_notifications (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  wallet_id bigint not null,
  lot_id bigint not null,
  notify_before_days smallint not null check (notify_before_days > 0),
  points_snapshot bigint not null check (points_snapshot > 0),
  expires_at timestamptz not null,
  outbox_id bigint,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, lot_id, notify_before_days),
  foreign key (organization_id, wallet_id)
    references loyalty.wallets(organization_id, id) on delete restrict,
  foreign key (organization_id, lot_id)
    references loyalty.point_lots(organization_id, id) on delete restrict,
  foreign key (organization_id, outbox_id)
    references loyalty_private.transactional_outbox(organization_id, id) on delete restrict
);

create index point_expiry_notifications_wallet_idx
  on loyalty_private.point_expiry_notifications (organization_id, wallet_id, expires_at, id);

alter table loyalty.programme_tiers owner to loyalty_owner;
alter table loyalty.programme_rewards owner to loyalty_owner;
alter table loyalty.tier_decisions owner to loyalty_owner;
alter table loyalty.tier_memberships owner to loyalty_owner;
alter table loyalty.reward_reservations owner to loyalty_owner;
alter table loyalty.reward_reservation_transitions owner to loyalty_owner;
alter table loyalty_private.programme_evaluations owner to loyalty_owner;
alter table loyalty_private.point_expiry_notifications owner to loyalty_owner;

create trigger programme_tiers_immutable
before update or delete on loyalty.programme_tiers
for each row execute function loyalty_private.reject_immutable_change();
create trigger programme_rewards_immutable
before update or delete on loyalty.programme_rewards
for each row execute function loyalty_private.reject_immutable_change();
create trigger tier_decisions_immutable
before update or delete on loyalty.tier_decisions
for each row execute function loyalty_private.reject_immutable_change();
create trigger reward_reservation_transitions_immutable
before update or delete on loyalty.reward_reservation_transitions
for each row execute function loyalty_private.reject_immutable_change();
create trigger programme_evaluations_immutable
before update or delete on loyalty_private.programme_evaluations
for each row execute function loyalty_private.reject_immutable_change();

create or replace function loyalty_private.protect_tier_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
    or old.effective_until is not null
    or new.organization_id <> old.organization_id
    or new.programme_group_id <> old.programme_group_id
    or new.programme_version_id <> old.programme_version_id
    or new.wallet_id <> old.wallet_id
    or new.tier_code <> old.tier_code
    or new.decision_id <> old.decision_id
    or new.effective_from <> old.effective_from
    or new.created_at <> old.created_at
    or new.effective_until is null then
    raise exception using errcode = '55000', message = 'tier membership history is immutable';
  end if;
  return new;
end;
$$;
alter function loyalty_private.protect_tier_membership() owner to loyalty_owner;

create trigger tier_memberships_protect_history
before update or delete on loyalty.tier_memberships
for each row execute function loyalty_private.protect_tier_membership();

create or replace function loyalty_private.protect_reward_reservation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
    or new.organization_id <> old.organization_id
    or new.programme_group_id <> old.programme_group_id
    or new.programme_version_id <> old.programme_version_id
    or new.wallet_id <> old.wallet_id
    or new.reward_id <> old.reward_id
    or new.cost_points <> old.cost_points
    or new.idempotency_key <> old.idempotency_key
    or new.request_sha256 <> old.request_sha256
    or new.expires_at <> old.expires_at
    or new.created_at <> old.created_at then
    raise exception using errcode = '55000', message = 'reward reservation identity and value are immutable';
  end if;
  return new;
end;
$$;
alter function loyalty_private.protect_reward_reservation() owner to loyalty_owner;

create trigger reward_reservations_protect_identity
before update or delete on loyalty.reward_reservations
for each row execute function loyalty_private.protect_reward_reservation();

create or replace function loyalty_private.protect_programme_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception using errcode = '55000', message = 'published programme version is immutable';
    end if;
    return old;
  end if;

  if new.organization_id <> old.organization_id
    or new.programme_group_id <> old.programme_group_id
    or new.programme_id <> old.programme_id
    or new.version_number <> old.version_number then
    raise exception using errcode = '55000', message = 'programme version identity is immutable';
  end if;
  if old.status = 'draft' then
    return new;
  end if;
  if old.status = 'scheduled' and new.status = 'published'
    and new.published_at is not null
    and new.configuration is not distinct from old.configuration
    and new.configuration_sha256 is not distinct from old.configuration_sha256
    and new.created_by_user_id is not distinct from old.created_by_user_id
    and new.approved_by_user_id is not distinct from old.approved_by_user_id
    and new.scheduled_for is not distinct from old.scheduled_for then
    return new;
  end if;
  if new.configuration is distinct from old.configuration
    or new.configuration_sha256 is distinct from old.configuration_sha256
    or new.created_by_user_id is distinct from old.created_by_user_id
    or new.approved_by_user_id is distinct from old.approved_by_user_id
    or new.supersedes_version_id is distinct from old.supersedes_version_id
    or new.scheduled_for is distinct from old.scheduled_for then
    raise exception using errcode = '55000', message = 'published programme version is immutable';
  end if;
  if old.status = 'published' and new.status in ('retired', 'superseded') and new.retired_at is not null then
    return new;
  end if;
  raise exception using errcode = '55000', message = 'published programme version is immutable';
end;
$$;
alter function loyalty_private.protect_programme_version() owner to loyalty_owner;

create or replace function loyalty_private.materialize_programme_definition(
  target_version_id bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_version loyalty.programme_versions%rowtype;
begin
  select version.* into target_version
  from loyalty.programme_versions as version
  where version.id = target_version_id and version.status = 'draft'
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'unknown draft programme version';
  end if;
  if jsonb_typeof(target_version.configuration -> 'tiers') <> 'array'
    or jsonb_array_length(target_version.configuration -> 'tiers') = 0 then
    raise exception using errcode = '22023', message = 'programme requires a tier array';
  end if;

  insert into loyalty.programme_tiers (
    organization_id, programme_group_id, programme_version_id, code, name,
    ordinal, minimum_eligible_spend_minor, points_per_major_unit
  )
  select target_version.organization_id, target_version.programme_group_id,
    target_version.id, tier.value ->> 'code', tier.value ->> 'name',
    tier.ordinal::smallint,
    (tier.value ->> 'minimumEligibleSpendMinor')::bigint,
    (tier.value ->> 'pointsPerMajorUnit')::bigint
  from jsonb_array_elements(target_version.configuration -> 'tiers')
    with ordinality as tier(value, ordinal);

  if exists (
    select 1 from (
      select definition.ordinal, definition.minimum_eligible_spend_minor,
        lag(definition.minimum_eligible_spend_minor) over (order by definition.ordinal) as previous_minimum
      from loyalty.programme_tiers as definition
      where definition.programme_version_id = target_version.id
    ) as ordered
    where (ordered.ordinal = 1 and ordered.minimum_eligible_spend_minor <> 0)
      or (ordered.ordinal > 1 and ordered.minimum_eligible_spend_minor <= ordered.previous_minimum)
  ) then
    raise exception using errcode = '23514', message = 'programme tier thresholds must start at zero and increase';
  end if;

  if target_version.configuration ? 'rewards' then
    if jsonb_typeof(target_version.configuration -> 'rewards') <> 'array' then
      raise exception using errcode = '22023', message = 'programme rewards must be an array';
    end if;
    insert into loyalty.programme_rewards (
      organization_id, programme_group_id, programme_version_id, code, name,
      reward_kind, cost_points, configuration
    )
    select target_version.organization_id, target_version.programme_group_id,
      target_version.id, reward.value ->> 'code', reward.value ->> 'name',
      reward.value ->> 'kind', (reward.value ->> 'costPoints')::bigint,
      coalesce(reward.value -> 'configuration', '{}'::jsonb)
    from jsonb_array_elements(target_version.configuration -> 'rewards') as reward(value);
  end if;
end;
$$;

create or replace function loyalty_private.create_programme_draft(
  target_organization_id bigint,
  target_programme_id bigint,
  target_configuration jsonb,
  target_configuration_sha256 bytea,
  target_created_by_user_id uuid
)
returns table (programme_version_public_id uuid, version_number integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_programme loyalty.programmes%rowtype;
  next_version_number integer;
begin
  select programme.* into target_programme
  from loyalty.programmes as programme
  where programme.id = target_programme_id
    and programme.organization_id = target_organization_id
    and programme.status in ('draft', 'active')
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'unknown active programme';
  end if;
  if octet_length(target_configuration_sha256) <> 32 then
    raise exception using errcode = '22023', message = 'configuration hash must be SHA-256';
  end if;
  select coalesce(max(version.version_number), 0) + 1 into next_version_number
  from loyalty.programme_versions as version
  where version.organization_id = target_organization_id
    and version.programme_id = target_programme_id;

  return query
  insert into loyalty.programme_versions (
    organization_id, programme_group_id, programme_id, version_number, status,
    configuration, configuration_sha256, created_by_user_id
  ) values (
    target_organization_id, target_programme.programme_group_id,
    target_programme_id, next_version_number, 'draft', target_configuration,
    target_configuration_sha256, target_created_by_user_id
  ) returning public_id, loyalty.programme_versions.version_number;
end;
$$;

create or replace function loyalty_private.publish_programme_version(
  target_version_public_id uuid,
  target_expected_sha256 bytea,
  target_approved_by_user_id uuid,
  target_published_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_version loyalty.programme_versions%rowtype;
  previous_version_id bigint;
begin
  select version.* into target_version
  from loyalty.programme_versions as version
  where version.public_id = target_version_public_id and version.status = 'draft'
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'unknown draft programme version';
  end if;
  if target_version.configuration_sha256 <> target_expected_sha256 then
    raise exception using errcode = '23514', message = 'programme configuration hash conflict';
  end if;
  perform loyalty_private.materialize_programme_definition(target_version.id);

  select version.id into previous_version_id
  from loyalty.programme_versions as version
  where version.organization_id = target_version.organization_id
    and version.programme_id = target_version.programme_id
    and version.status = 'published'
  for update;
  if previous_version_id is not null then
    update loyalty.programme_versions
    set status = 'superseded', retired_at = target_published_at
    where id = previous_version_id;
  end if;
  update loyalty.programme_versions
  set status = 'published', approved_by_user_id = target_approved_by_user_id,
      published_at = target_published_at, supersedes_version_id = previous_version_id
  where id = target_version.id;
  return target_version.public_id;
end;
$$;

create or replace function loyalty_private.schedule_programme_version(
  target_version_public_id uuid,
  target_expected_sha256 bytea,
  target_approved_by_user_id uuid,
  target_scheduled_for timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_version loyalty.programme_versions%rowtype;
begin
  select version.* into target_version
  from loyalty.programme_versions as version
  where version.public_id = target_version_public_id and version.status = 'draft'
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'unknown draft programme version';
  end if;
  if target_version.configuration_sha256 <> target_expected_sha256 then
    raise exception using errcode = '23514', message = 'programme configuration hash conflict';
  end if;
  if target_scheduled_for <= now() then
    raise exception using errcode = '22023', message = 'programme schedule must be in the future';
  end if;
  perform loyalty_private.materialize_programme_definition(target_version.id);
  update loyalty.programme_versions
  set status = 'scheduled', approved_by_user_id = target_approved_by_user_id,
      scheduled_for = target_scheduled_for
  where id = target_version.id;
  return target_version.public_id;
end;
$$;

create or replace function loyalty_private.activate_scheduled_programme_versions(
  target_as_of timestamptz default now()
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  scheduled_version record;
  previous_version_id bigint;
  activated_count bigint := 0;
begin
  for scheduled_version in
    select version.* from loyalty.programme_versions as version
    where version.status = 'scheduled' and version.scheduled_for <= target_as_of
    order by version.scheduled_for, version.id
    for update skip locked
  loop
    select version.id into previous_version_id
    from loyalty.programme_versions as version
    where version.organization_id = scheduled_version.organization_id
      and version.programme_id = scheduled_version.programme_id
      and version.status = 'published'
    for update;
    if previous_version_id is not null then
      update loyalty.programme_versions
      set status = 'superseded', retired_at = scheduled_version.scheduled_for
      where id = previous_version_id;
    end if;
    update loyalty.programme_versions
    set status = 'published', published_at = scheduled_version.scheduled_for,
        supersedes_version_id = previous_version_id
    where id = scheduled_version.id;
    activated_count := activated_count + 1;
  end loop;
  return activated_count;
end;
$$;

create or replace function loyalty_private.record_programme_evaluation(
  target_organization_id bigint,
  target_programme_group_id bigint,
  target_programme_version_id bigint,
  target_canonical_event_id bigint,
  target_evaluation_kind text,
  target_subject_reference text,
  target_idempotency_key text,
  target_input_sha256 bytea,
  target_result_sha256 bytea,
  target_result jsonb,
  target_explanation jsonb,
  target_evaluated_at timestamptz
)
returns table (evaluation_public_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing loyalty_private.programme_evaluations%rowtype;
  created_public_id uuid;
begin
  select evaluation.* into existing
  from loyalty_private.programme_evaluations as evaluation
  where evaluation.organization_id = target_organization_id
    and evaluation.idempotency_key = target_idempotency_key;
  if found then
    if existing.input_sha256 <> target_input_sha256
      or existing.result_sha256 <> target_result_sha256 then
      raise exception using errcode = '23514', message = 'evaluation idempotency hash conflict';
    end if;
    return query select existing.public_id, 'duplicate'::text;
    return;
  end if;
  insert into loyalty_private.programme_evaluations (
    organization_id, programme_group_id, programme_version_id,
    canonical_event_id, evaluation_kind, subject_reference, idempotency_key,
    input_sha256, result_sha256, result, explanation, evaluated_at
  ) values (
    target_organization_id, target_programme_group_id, target_programme_version_id,
    target_canonical_event_id, target_evaluation_kind, target_subject_reference,
    target_idempotency_key, target_input_sha256, target_result_sha256,
    target_result, target_explanation, target_evaluated_at
  ) returning public_id into created_public_id;
  return query select created_public_id, 'created'::text;
end;
$$;

create or replace function loyalty_private.record_tier_decision(
  target_organization_id bigint,
  target_programme_group_id bigint,
  target_programme_version_id bigint,
  target_wallet_id bigint,
  target_tier_code text,
  target_qualified_tier_code text,
  target_transition text,
  target_rolling_eligible_spend_minor bigint,
  target_below_threshold_since timestamptz,
  target_grace_until timestamptz,
  target_effective_at timestamptz,
  target_idempotency_key text,
  target_request_sha256 bytea,
  target_explanation jsonb
)
returns table (tier_decision_public_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing loyalty.tier_decisions%rowtype;
  current_membership loyalty.tier_memberships%rowtype;
  created_decision_id bigint;
  created_public_id uuid;
begin
  select decision.* into existing from loyalty.tier_decisions as decision
  where decision.organization_id = target_organization_id
    and decision.idempotency_key = target_idempotency_key;
  if found then
    if existing.request_sha256 <> target_request_sha256 then
      raise exception using errcode = '23514', message = 'tier decision idempotency hash conflict';
    end if;
    return query select existing.public_id, 'duplicate'::text;
    return;
  end if;
  select membership.* into current_membership
  from loyalty.tier_memberships as membership
  where membership.organization_id = target_organization_id
    and membership.wallet_id = target_wallet_id
    and membership.effective_until is null
  for update;
  if found and target_effective_at <= current_membership.effective_from then
    raise exception using errcode = '23514', message = 'tier decision must follow current membership start';
  end if;
  insert into loyalty.tier_decisions (
    organization_id, programme_group_id, programme_version_id, wallet_id,
    tier_code, qualified_tier_code, transition, rolling_eligible_spend_minor,
    below_threshold_since, grace_until, effective_at, idempotency_key,
    request_sha256, explanation
  ) values (
    target_organization_id, target_programme_group_id, target_programme_version_id,
    target_wallet_id, target_tier_code, target_qualified_tier_code,
    target_transition, target_rolling_eligible_spend_minor,
    target_below_threshold_since, target_grace_until, target_effective_at,
    target_idempotency_key, target_request_sha256, target_explanation
  ) returning id, public_id into created_decision_id, created_public_id;
  if current_membership.id is null then
    insert into loyalty.tier_memberships (
      organization_id, programme_group_id, programme_version_id, wallet_id,
      tier_code, decision_id, effective_from
    ) values (
      target_organization_id, target_programme_group_id,
      target_programme_version_id, target_wallet_id, target_tier_code,
      created_decision_id, target_effective_at
    );
  elsif current_membership.tier_code <> target_tier_code
    or current_membership.programme_version_id <> target_programme_version_id then
    update loyalty.tier_memberships
    set effective_until = target_effective_at
    where id = current_membership.id;
    insert into loyalty.tier_memberships (
      organization_id, programme_group_id, programme_version_id, wallet_id,
      tier_code, decision_id, effective_from
    ) values (
      target_organization_id, target_programme_group_id,
      target_programme_version_id, target_wallet_id, target_tier_code,
      created_decision_id, target_effective_at
    );
  end if;
  return query select created_public_id, 'created'::text;
end;
$$;

create or replace function loyalty_private.create_reward_reservation(
  target_organization_id bigint,
  target_programme_group_id bigint,
  target_programme_version_id bigint,
  target_wallet_id bigint,
  target_reward_id bigint,
  target_cost_points bigint,
  target_expires_at timestamptz,
  target_idempotency_key text,
  target_request_sha256 bytea
)
returns table (reservation_public_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing loyalty.reward_reservations%rowtype;
  created_public_id uuid;
begin
  select reservation.* into existing from loyalty.reward_reservations as reservation
  where reservation.organization_id = target_organization_id
    and reservation.idempotency_key = target_idempotency_key;
  if found then
    if existing.request_sha256 <> target_request_sha256 then
      raise exception using errcode = '23514', message = 'reward reservation idempotency hash conflict';
    end if;
    return query select existing.public_id, 'duplicate'::text;
    return;
  end if;
  if not exists (
    select 1 from loyalty.programme_rewards as reward
    where reward.id = target_reward_id
      and reward.organization_id = target_organization_id
      and reward.programme_version_id = target_programme_version_id
      and reward.cost_points = target_cost_points
  ) then
    raise exception using errcode = '22023', message = 'reward definition or cost mismatch';
  end if;
  insert into loyalty.reward_reservations (
    organization_id, programme_group_id, programme_version_id, wallet_id,
    reward_id, cost_points, expires_at, idempotency_key, request_sha256
  ) values (
    target_organization_id, target_programme_group_id, target_programme_version_id,
    target_wallet_id, target_reward_id, target_cost_points, target_expires_at,
    target_idempotency_key, target_request_sha256
  ) returning public_id into created_public_id;
  return query select created_public_id, 'created'::text;
end;
$$;

create or replace function loyalty_private.transition_reward_reservation(
  target_reservation_public_id uuid,
  target_to_state text,
  target_idempotency_key text,
  target_request_sha256 bytea,
  target_actor_id text,
  target_reason text default null,
  target_ledger_transaction_public_id uuid default null,
  target_connector_execution_reference text default null
)
returns table (reservation_public_id uuid, state text, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_reservation loyalty.reward_reservations%rowtype;
  existing_transition loyalty.reward_reservation_transitions%rowtype;
  ledger_transaction_id bigint;
  ledger_transaction_kind text;
begin
  select reservation.* into target_reservation
  from loyalty.reward_reservations as reservation
  where reservation.public_id = target_reservation_public_id
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'unknown reward reservation';
  end if;
  select transition.* into existing_transition
  from loyalty.reward_reservation_transitions as transition
  where transition.organization_id = target_reservation.organization_id
    and transition.idempotency_key = target_idempotency_key;
  if found then
    if existing_transition.reservation_id <> target_reservation.id
      or existing_transition.request_sha256 <> target_request_sha256 then
      raise exception using errcode = '23514', message = 'reservation transition idempotency hash conflict';
    end if;
    return query select target_reservation.public_id, existing_transition.to_state, 'duplicate'::text;
    return;
  end if;
  if not (
    (target_reservation.state = 'requested' and target_to_state in ('reserved', 'cancelled', 'expired', 'failed'))
    or (target_reservation.state = 'reserved' and target_to_state in ('issued', 'cancelled', 'expired', 'failed'))
    or (target_reservation.state = 'issued' and target_to_state in ('captured', 'failed'))
    or (target_reservation.state in ('cancelled', 'expired', 'failed') and target_to_state = 'released')
  ) then
    raise exception using errcode = '23514', message = 'invalid reward reservation transition';
  end if;
  if target_to_state in ('reserved', 'captured', 'released') then
    select transaction.id, transaction.transaction_kind
    into ledger_transaction_id, ledger_transaction_kind
    from loyalty.ledger_transactions as transaction
    where transaction.public_id = target_ledger_transaction_public_id
      and transaction.organization_id = target_reservation.organization_id;
    if not found then
      raise exception using errcode = '22023', message = 'ledger transaction required for value transition';
    end if;
    if (target_to_state = 'reserved' and ledger_transaction_kind <> 'reserve')
      or (target_to_state = 'captured' and ledger_transaction_kind <> 'capture')
      or (target_to_state = 'released' and ledger_transaction_kind <> 'cancel') then
      raise exception using errcode = '23514', message = 'ledger transaction kind does not match reward transition';
    end if;
    if not exists (
      select 1
      from loyalty.ledger_entries as entry
      join loyalty.ledger_accounts as account on account.id = entry.account_id
      where entry.transaction_id = ledger_transaction_id
        and account.wallet_id = target_reservation.wallet_id
        and entry.points = target_reservation.cost_points
        and account.account_kind = case target_to_state
          when 'reserved' then 'reserved'
          when 'captured' then 'spent'
          when 'released' then 'available'
        end
    ) then
      raise exception using errcode = '23514', message = 'ledger transaction does not match reward reservation value';
    end if;
    if target_to_state in ('captured', 'released') and not exists (
      select 1 from loyalty.ledger_transactions as transaction
      where transaction.id = ledger_transaction_id
        and transaction.related_transaction_id = target_reservation.ledger_reservation_transaction_id
    ) then
      raise exception using errcode = '23514', message = 'ledger resolution does not match reward reservation';
    end if;
  end if;
  insert into loyalty.reward_reservation_transitions (
    organization_id, reservation_id, from_state, to_state, idempotency_key,
    request_sha256, actor_id, reason, ledger_transaction_id,
    connector_execution_reference
  ) values (
    target_reservation.organization_id, target_reservation.id,
    target_reservation.state, target_to_state, target_idempotency_key,
    target_request_sha256, target_actor_id, target_reason,
    ledger_transaction_id, target_connector_execution_reference
  );
  update loyalty.reward_reservations
  set state = target_to_state,
      ledger_reservation_transaction_id = coalesce(ledger_transaction_id, ledger_reservation_transaction_id),
      connector_execution_reference = coalesce(
        target_connector_execution_reference, connector_execution_reference
      ),
      updated_at = clock_timestamp()
  where id = target_reservation.id;
  return query select target_reservation.public_id, target_to_state, 'created'::text;
end;
$$;

create or replace function loyalty_private.enqueue_point_expiry_notifications(
  target_as_of timestamptz default now(),
  target_notify_before_days smallint default 30
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate record;
  notification_id bigint;
  created_outbox_id bigint;
  enqueued_count bigint := 0;
begin
  if target_notify_before_days <= 0 then
    raise exception using errcode = '22023', message = 'notification lead time must be positive';
  end if;
  for candidate in
    select lot.organization_id, lot.id as lot_id, lot.public_id as lot_public_id,
      lot.wallet_id, wallet.public_id as wallet_public_id,
      balance.remaining_points, lot.expires_at
    from loyalty.point_lots as lot
    join loyalty.point_lot_balances as balance
      on balance.organization_id = lot.organization_id and balance.lot_id = lot.id
    join loyalty.wallets as wallet
      on wallet.organization_id = lot.organization_id and wallet.id = lot.wallet_id
    where balance.remaining_points > 0
      and lot.expires_at > target_as_of
      and lot.expires_at <= target_as_of + make_interval(days => target_notify_before_days)
    order by lot.expires_at, lot.id
  loop
    notification_id := null;
    insert into loyalty_private.point_expiry_notifications (
      organization_id, wallet_id, lot_id, notify_before_days,
      points_snapshot, expires_at
    ) values (
      candidate.organization_id, candidate.wallet_id, candidate.lot_id,
      target_notify_before_days, candidate.remaining_points, candidate.expires_at
    ) on conflict (organization_id, lot_id, notify_before_days) do nothing
    returning id into notification_id;
    if notification_id is not null then
      insert into loyalty_private.transactional_outbox (
        organization_id, topic, payload_version, payload, available_at
      ) values (
        candidate.organization_id, 'loyalty.points.expiring', 'v1',
        jsonb_build_object(
          'walletId', candidate.wallet_public_id,
          'lotId', candidate.lot_public_id,
          'points', candidate.remaining_points,
          'expiresAt', candidate.expires_at,
          'notifyBeforeDays', target_notify_before_days
        ), target_as_of
      ) returning id into created_outbox_id;
      update loyalty_private.point_expiry_notifications
      set outbox_id = created_outbox_id
      where id = notification_id;
      enqueued_count := enqueued_count + 1;
    end if;
  end loop;
  return enqueued_count;
end;
$$;

alter function loyalty_private.materialize_programme_definition(bigint) owner to loyalty_owner;
alter function loyalty_private.create_programme_draft(bigint, bigint, jsonb, bytea, uuid) owner to loyalty_owner;
alter function loyalty_private.publish_programme_version(uuid, bytea, uuid, timestamptz) owner to loyalty_owner;
alter function loyalty_private.schedule_programme_version(uuid, bytea, uuid, timestamptz) owner to loyalty_owner;
alter function loyalty_private.activate_scheduled_programme_versions(timestamptz) owner to loyalty_owner;
alter function loyalty_private.record_programme_evaluation(
  bigint, bigint, bigint, bigint, text, text, text, bytea, bytea,
  jsonb, jsonb, timestamptz
) owner to loyalty_owner;
alter function loyalty_private.record_tier_decision(
  bigint, bigint, bigint, bigint, text, text, text, bigint, timestamptz,
  timestamptz, timestamptz, text, bytea, jsonb
) owner to loyalty_owner;
alter function loyalty_private.create_reward_reservation(
  bigint, bigint, bigint, bigint, bigint, bigint, timestamptz, text, bytea
) owner to loyalty_owner;
alter function loyalty_private.transition_reward_reservation(
  uuid, text, text, bytea, text, text, uuid, text
) owner to loyalty_owner;
alter function loyalty_private.enqueue_point_expiry_notifications(
  timestamptz, smallint
) owner to loyalty_owner;

revoke all on function loyalty_private.materialize_programme_definition(bigint),
  loyalty_private.create_programme_draft(bigint, bigint, jsonb, bytea, uuid),
  loyalty_private.publish_programme_version(uuid, bytea, uuid, timestamptz),
  loyalty_private.schedule_programme_version(uuid, bytea, uuid, timestamptz),
  loyalty_private.activate_scheduled_programme_versions(timestamptz),
  loyalty_private.record_programme_evaluation(bigint, bigint, bigint, bigint, text, text, text, bytea, bytea, jsonb, jsonb, timestamptz),
  loyalty_private.record_tier_decision(bigint, bigint, bigint, bigint, text, text, text, bigint, timestamptz, timestamptz, timestamptz, text, bytea, jsonb),
  loyalty_private.create_reward_reservation(bigint, bigint, bigint, bigint, bigint, bigint, timestamptz, text, bytea),
  loyalty_private.transition_reward_reservation(uuid, text, text, bytea, text, text, uuid, text),
  loyalty_private.enqueue_point_expiry_notifications(timestamptz, smallint)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

grant execute on function loyalty_private.create_programme_draft(bigint, bigint, jsonb, bytea, uuid),
  loyalty_private.publish_programme_version(uuid, bytea, uuid, timestamptz),
  loyalty_private.schedule_programme_version(uuid, bytea, uuid, timestamptz),
  loyalty_private.record_programme_evaluation(bigint, bigint, bigint, bigint, text, text, text, bytea, bytea, jsonb, jsonb, timestamptz),
  loyalty_private.record_tier_decision(bigint, bigint, bigint, bigint, text, text, text, bigint, timestamptz, timestamptz, timestamptz, text, bytea, jsonb),
  loyalty_private.create_reward_reservation(bigint, bigint, bigint, bigint, bigint, bigint, timestamptz, text, bytea),
  loyalty_private.transition_reward_reservation(uuid, text, text, bytea, text, text, uuid, text)
  to loyalty_worker;
grant execute on function loyalty_private.activate_scheduled_programme_versions(timestamptz)
  to loyalty_worker;
grant execute on function loyalty_private.enqueue_point_expiry_notifications(timestamptz, smallint)
  to loyalty_worker;

alter table loyalty.programme_tiers enable row level security;
alter table loyalty.programme_rewards enable row level security;
alter table loyalty.tier_decisions enable row level security;
alter table loyalty.tier_memberships enable row level security;
alter table loyalty.reward_reservations enable row level security;
alter table loyalty.reward_reservation_transitions enable row level security;
alter table loyalty_private.programme_evaluations enable row level security;
alter table loyalty_private.point_expiry_notifications enable row level security;

create policy programme_tiers_member_select on loyalty.programme_tiers
  for select to authenticated using ((select loyalty_private.is_organization_member(organization_id)));
create policy programme_rewards_member_select on loyalty.programme_rewards
  for select to authenticated using ((select loyalty_private.is_organization_member(organization_id)));
create policy tier_decisions_member_select on loyalty.tier_decisions
  for select to authenticated using ((select loyalty_private.is_organization_member(organization_id)));
create policy tier_memberships_member_select on loyalty.tier_memberships
  for select to authenticated using ((select loyalty_private.is_organization_member(organization_id)));
create policy reward_reservations_member_select on loyalty.reward_reservations
  for select to authenticated using ((select loyalty_private.is_organization_member(organization_id)));
create policy reward_reservation_transitions_member_select on loyalty.reward_reservation_transitions
  for select to authenticated using ((select loyalty_private.is_organization_member(organization_id)));

create policy programme_tiers_worker_select on loyalty.programme_tiers
  for select to loyalty_worker using (true);
create policy programme_rewards_worker_select on loyalty.programme_rewards
  for select to loyalty_worker using (true);
create policy tier_decisions_worker_select on loyalty.tier_decisions
  for select to loyalty_worker using (true);
create policy tier_memberships_worker_select on loyalty.tier_memberships
  for select to loyalty_worker using (true);
create policy reward_reservations_worker_select on loyalty.reward_reservations
  for select to loyalty_worker using (true);
create policy reward_reservation_transitions_worker_select on loyalty.reward_reservation_transitions
  for select to loyalty_worker using (true);
create policy programme_evaluations_worker_select on loyalty_private.programme_evaluations
  for select to loyalty_worker using (true);
create policy point_expiry_notifications_worker_select
  on loyalty_private.point_expiry_notifications
  for select to loyalty_worker using (true);

revoke all on loyalty.programme_tiers, loyalty.programme_rewards,
  loyalty.tier_decisions, loyalty.tier_memberships, loyalty.reward_reservations,
  loyalty.reward_reservation_transitions
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant select on loyalty.programme_tiers, loyalty.programme_rewards,
  loyalty.tier_decisions, loyalty.tier_memberships, loyalty.reward_reservations,
  loyalty.reward_reservation_transitions
  to authenticated, loyalty_worker;
revoke all on loyalty_private.programme_evaluations
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant select on loyalty_private.programme_evaluations to loyalty_worker;
revoke all on loyalty_private.point_expiry_notifications
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant select on loyalty_private.point_expiry_notifications to loyalty_worker;

comment on table loyalty.programme_tiers is
  'Immutable materialized tier definitions from an approved programme version.';
comment on table loyalty.programme_rewards is
  'Immutable connector-neutral reward definitions from an approved programme version.';
comment on table loyalty_private.programme_evaluations is
  'Immutable live/simulation result and explanation evidence keyed by canonical input hashes.';
comment on table loyalty.reward_reservations is
  'Reward delivery state; every value-bearing transition references an immutable ledger transaction.';
comment on table loyalty.tier_memberships is
  'Effective tier intervals; changes atomically close the current interval and preserve prior programme attribution.';
comment on table loyalty_private.point_expiry_notifications is
  'Idempotency fences linking expiring point lots to transactional notification commands.';
