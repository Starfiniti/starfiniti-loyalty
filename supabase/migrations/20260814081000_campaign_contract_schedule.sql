-- M07 strict campaign contracts and schedule authority. Campaign definitions
-- bind immutable audience snapshots; approval materializes private control
-- assignments before later execution slices may issue value.

create table loyalty.campaigns (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  programme_group_id bigint not null,
  code text not null,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, programme_group_id, id),
  unique (organization_id, programme_group_id, code),
  foreign key (organization_id, programme_group_id)
    references loyalty.programme_groups(organization_id, id) on delete restrict,
  check (code ~ '^[a-z][a-z0-9_-]{0,79}$')
);

create table loyalty.campaign_versions (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  programme_group_id bigint not null,
  campaign_id bigint not null,
  version_number integer not null check (version_number > 0),
  status text not null check (status in (
    'draft', 'scheduled', 'active', 'paused', 'cancelled', 'completed'
  )),
  definition jsonb not null,
  definition_sha256 bytea not null check (octet_length(definition_sha256) = 32),
  audience_snapshot_id bigint not null,
  schedule_timezone text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  global_effect_limit bigint not null check (global_effect_limit > 0),
  per_member_effect_limit integer not null check (
    per_member_effect_limit between 1 and 100
  ),
  maximum_points bigint check (maximum_points > 0),
  maximum_liability_minor bigint check (maximum_liability_minor > 0),
  liability_minor_per_effect bigint check (liability_minor_per_effect > 0),
  liability_currency_code text,
  liability_minor_unit_digits smallint,
  control_basis_points integer not null check (
    control_basis_points between 0 and 9000
  ),
  eligible_member_count bigint not null default 0 check (eligible_member_count >= 0),
  treatment_member_count bigint not null default 0 check (treatment_member_count >= 0),
  control_member_count bigint not null default 0 check (control_member_count >= 0),
  assignment_sha256 bytea check (octet_length(assignment_sha256) = 32),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  approved_by_user_id uuid references auth.users(id) on delete restrict,
  approved_at timestamptz,
  status_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, programme_group_id, id),
  unique (organization_id, campaign_id, version_number),
  foreign key (organization_id, programme_group_id, campaign_id)
    references loyalty.campaigns(organization_id, programme_group_id, id)
    on delete restrict,
  foreign key (organization_id, programme_group_id, audience_snapshot_id)
    references loyalty.audience_snapshots(organization_id, programme_group_id, id)
    on delete restrict,
  check (ends_at > starts_at),
  check (ends_at - starts_at <= interval '366 days'),
  check (
    (maximum_liability_minor is null
      and liability_minor_per_effect is null
      and liability_currency_code is null
      and liability_minor_unit_digits is null)
    or (maximum_liability_minor is not null
      and liability_minor_per_effect is not null
      and liability_minor_per_effect <= maximum_liability_minor
      and liability_currency_code ~ '^[A-Z]{3}$'
      and liability_minor_unit_digits between 0 and 3)
  ),
  check (treatment_member_count + control_member_count = eligible_member_count),
  check (
    (status = 'draft'
      and approved_by_user_id is null
      and approved_at is null
      and assignment_sha256 is null
      and eligible_member_count = 0)
    or (status <> 'draft'
      and approved_by_user_id is not null
      and approved_at is not null
      and assignment_sha256 is not null
      and eligible_member_count > 0)
  )
);

create unique index campaign_versions_one_accepted_uidx
  on loyalty.campaign_versions (organization_id, campaign_id)
  where status in ('scheduled', 'active', 'paused');
create index campaign_versions_schedule_idx
  on loyalty.campaign_versions (starts_at, id)
  where status = 'scheduled';
create index campaign_versions_history_idx
  on loyalty.campaign_versions (
    organization_id, programme_group_id, campaign_id, version_number desc
  );

create table loyalty_private.campaign_controls (
  organization_id bigint not null,
  programme_group_id bigint not null,
  campaign_version_id bigint not null,
  assignment_salt bytea not null check (octet_length(assignment_salt) = 32),
  assignment_sha256 bytea not null check (octet_length(assignment_sha256) = 32),
  created_at timestamptz not null default now(),
  primary key (organization_id, campaign_version_id),
  foreign key (organization_id, programme_group_id, campaign_version_id)
    references loyalty.campaign_versions(organization_id, programme_group_id, id)
    on delete restrict
);

create table loyalty_private.campaign_assignments (
  id bigint generated always as identity primary key,
  organization_id bigint not null,
  programme_group_id bigint not null,
  campaign_version_id bigint not null,
  audience_snapshot_id bigint not null,
  customer_id bigint not null,
  wallet_id bigint not null,
  assignment text not null check (assignment in ('treatment', 'control')),
  assignment_evidence_sha256 bytea not null
    check (octet_length(assignment_evidence_sha256) = 32),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, campaign_version_id, customer_id),
  unique (organization_id, campaign_version_id, wallet_id),
  foreign key (organization_id, programme_group_id, campaign_version_id)
    references loyalty.campaign_versions(organization_id, programme_group_id, id)
    on delete restrict,
  foreign key (organization_id, programme_group_id, audience_snapshot_id)
    references loyalty.audience_snapshots(organization_id, programme_group_id, id)
    on delete restrict,
  foreign key (organization_id, customer_id)
    references loyalty.customers(organization_id, id) on delete restrict,
  foreign key (organization_id, programme_group_id, wallet_id)
    references loyalty.wallets(organization_id, programme_group_id, id)
    on delete restrict
);

create index campaign_assignments_wallet_idx
  on loyalty_private.campaign_assignments (
    organization_id, programme_group_id, wallet_id, campaign_version_id
  );

alter table loyalty.campaigns owner to loyalty_owner;
alter table loyalty.campaign_versions owner to loyalty_owner;
alter table loyalty_private.campaign_controls owner to loyalty_owner;
alter table loyalty_private.campaign_assignments owner to loyalty_owner;

create trigger campaigns_immutable
before update or delete on loyalty.campaigns
for each row execute function loyalty_private.reject_immutable_change();

create trigger campaign_controls_immutable
before update or delete on loyalty_private.campaign_controls
for each row execute function loyalty_private.reject_immutable_change();

create trigger campaign_assignments_immutable
before update or delete on loyalty_private.campaign_assignments
for each row execute function loyalty_private.reject_immutable_change();

create or replace function loyalty_private.campaign_code_array_valid_v1(
  target_value jsonb,
  target_minimum integer,
  target_maximum integer
)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select case
    when pg_catalog.jsonb_typeof(target_value) is distinct from 'array'
      then false
    else pg_catalog.jsonb_array_length(target_value)
        between target_minimum and target_maximum
      and not exists (
        select 1
        from pg_catalog.jsonb_array_elements(target_value) as item(value)
        where pg_catalog.jsonb_typeof(item.value) <> 'string'
          or item.value #>> '{}' !~ '^[a-z][a-z0-9_-]{0,79}$'
      )
      and (
        select pg_catalog.count(*) = pg_catalog.count(distinct item.value #>> '{}')
        from pg_catalog.jsonb_array_elements(target_value) as item(value)
      )
  end;
$$;

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
    or pg_catalog.length(pg_catalog.btrim(target_idempotency_key)) not between 1 and 255
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
      pg_catalog.encode(version.definition_sha256, 'hex'), version.version_number
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
      organization_id, programme_group_id, code, created_by_user_id
    ) values (
      target_programme.organization_id, target_programme.programme_group_id,
      target_definition ->> 'code', actor_user_id
    ) returning * into strict target_campaign;
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

create or replace function loyalty.preview_campaign_version_command(
  target_version_public_id uuid,
  target_expected_definition_sha256 text,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (
  resource_public_id uuid,
  outcome text,
  definition_sha256 text,
  inclusion_members text,
  excluded_members text,
  eligible_members text,
  expected_control_members text,
  expected_treatment_members text,
  maximum_effects text,
  maximum_points text,
  maximum_liability_minor text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := loyalty_private.request_user_id();
  target_version loyalty.campaign_versions%rowtype;
  existing_audit loyalty.admin_audit_events%rowtype;
  entitlement_enabled boolean;
  request_hash bytea;
  preview record;
begin
  if actor_user_id is null
    or target_expected_definition_sha256 is null
    or target_expected_definition_sha256 !~ '^[a-f0-9]{64}$'
    or target_idempotency_key is null
    or pg_catalog.length(pg_catalog.btrim(target_idempotency_key)) not between 1 and 255
    or target_idempotency_key <> pg_catalog.btrim(target_idempotency_key)
    or target_correlation_id is null then
    raise exception using errcode = '22023',
      message = 'invalid campaign preview identity';
  end if;
  select version.* into target_version
  from loyalty.campaign_versions as version
  where version.public_id = target_version_public_id
    and loyalty_private.has_organization_role(
      version.organization_id, array['owner', 'admin', 'operator']::text[]
    );
  if not found then
    raise exception using errcode = '42501',
      message = 'campaign command not authorized';
  end if;
  request_hash := extensions.digest(pg_catalog.convert_to(
    'campaign.version.preview|' || target_version.public_id::text || '|' ||
    target_expected_definition_sha256, 'UTF8'
  ), 'sha256');
  select audit.* into existing_audit
  from loyalty.admin_audit_events as audit
  where audit.organization_id = target_version.organization_id
    and audit.idempotency_key = target_idempotency_key;
  if found then
    if existing_audit.action <> 'campaign.version.preview'
      or existing_audit.request_sha256 <> request_hash then
      raise exception using errcode = '23514',
        message = 'campaign command idempotency conflict';
    end if;
  else
    if target_version.status <> 'draft'
      or pg_catalog.encode(target_version.definition_sha256, 'hex')
        <> target_expected_definition_sha256 then
      raise exception using errcode = '23514',
        message = 'campaign preview precondition failed';
    end if;
    perform loyalty_private.validate_campaign_definition_v1(
      target_version.definition
    );
    select decision.enabled into strict entitlement_enabled
    from loyalty_private.resolve_organization_entitlement(
      target_version.organization_id, 'campaigns',
      'campaign:' || target_version.public_id::text, pg_catalog.now()
    ) as decision;
    if not entitlement_enabled then
      raise exception using errcode = '42501',
        message = 'campaigns are not enabled for this organization';
    end if;
  end if;
  select * into strict preview
  from loyalty_private.calculate_campaign_preview_v1(target_version.id);
  if existing_audit.id is null then
    insert into loyalty.admin_audit_events (
      organization_id, actor_user_id, action, resource_type,
      resource_public_id, idempotency_key, request_sha256, correlation_id,
      metadata
    ) values (
      target_version.organization_id, actor_user_id,
      'campaign.version.preview', 'campaign_version', target_version.public_id,
      target_idempotency_key, request_hash, target_correlation_id,
      pg_catalog.jsonb_build_object(
        'definitionSha256', target_expected_definition_sha256,
        'eligibleMembers', preview.eligible_members,
        'maximumEffects', preview.maximum_effects
      )
    );
  end if;
  return query select target_version.public_id,
    case when existing_audit.id is null then 'created' else 'duplicate' end,
    pg_catalog.encode(target_version.definition_sha256, 'hex'),
    preview.inclusion_members::text, preview.excluded_members::text,
    preview.eligible_members::text, preview.expected_control_members::text,
    preview.expected_treatment_members::text, preview.maximum_effects::text,
    preview.maximum_points::text, preview.maximum_liability_minor::text;
end;
$$;

create or replace function loyalty_private.campaign_uuid_array_valid_v1(
  target_value jsonb,
  target_maximum integer
)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select case
    when pg_catalog.jsonb_typeof(target_value) is distinct from 'array'
      then false
    else pg_catalog.jsonb_array_length(target_value) <= target_maximum
      and not exists (
        select 1
        from pg_catalog.jsonb_array_elements(target_value) as item(value)
        where pg_catalog.jsonb_typeof(item.value) <> 'string'
          or item.value #>> '{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      )
      and (
        select pg_catalog.count(*) = pg_catalog.count(distinct item.value #>> '{}')
        from pg_catalog.jsonb_array_elements(target_value) as item(value)
      )
  end;
$$;

create or replace function loyalty_private.campaign_object_has_exact_keys_v1(
  target_value jsonb,
  target_keys text[]
)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select case
    when pg_catalog.jsonb_typeof(target_value) is distinct from 'object'
      then false
    else target_value ?& target_keys
      and (
        select pg_catalog.count(*) = pg_catalog.cardinality(target_keys)
        from pg_catalog.jsonb_object_keys(target_value)
      )
  end;
$$;

create or replace function loyalty_private.validate_campaign_reward_v1(
  target_reward jsonb
)
returns text
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  reward_kind text;
begin
  if pg_catalog.jsonb_typeof(target_reward) <> 'object'
    or pg_catalog.jsonb_typeof(target_reward -> 'kind') <> 'string' then
    raise exception using errcode = '22023',
      message = 'invalid campaign reward';
  end if;
  reward_kind := target_reward ->> 'kind';
  if reward_kind = 'points' then
    if not loyalty_private.campaign_object_has_exact_keys_v1(
        target_reward, array['kind', 'points']
      )
      or pg_catalog.jsonb_typeof(target_reward -> 'points') <> 'string'
      or target_reward ->> 'points' !~ '^[1-9][0-9]*$'
      or (target_reward ->> 'points')::numeric > 9223372036854775807 then
      raise exception using errcode = '22023',
        message = 'invalid campaign points reward';
    end if;
  elsif reward_kind = 'programme_reward' then
    if not loyalty_private.campaign_object_has_exact_keys_v1(
        target_reward, array['kind', 'rewardId']
      )
      or pg_catalog.jsonb_typeof(target_reward -> 'rewardId') <> 'string'
      or target_reward ->> 'rewardId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode = '22023',
        message = 'invalid campaign programme reward';
    end if;
  else
    raise exception using errcode = '22023',
      message = 'unsupported campaign reward';
  end if;
  return reward_kind;
end;
$$;

create or replace function loyalty_private.enforce_campaign_version_contract()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  stable_campaign loyalty.campaigns%rowtype;
  inclusion_snapshot loyalty.audience_snapshots%rowtype;
  excluded_value text;
  programme_reward_public_id text;
begin
  perform loyalty_private.validate_campaign_definition_v1(new.definition);
  if new.status <> 'draft' then
    raise exception using errcode = '23514',
      message = 'campaign versions must enter through draft state';
  end if;
  if new.definition_sha256 <> extensions.digest(
    pg_catalog.convert_to(new.definition::text, 'UTF8'), 'sha256'
  ) then
    raise exception using errcode = '23514',
      message = 'campaign definition hash mismatch';
  end if;
  select campaign.* into strict stable_campaign
  from loyalty.campaigns as campaign
  where campaign.organization_id = new.organization_id
    and campaign.programme_group_id = new.programme_group_id
    and campaign.id = new.campaign_id;
  if stable_campaign.code <> new.definition ->> 'code' then
    raise exception using errcode = '23514',
      message = 'campaign public identity mismatch';
  end if;
  select snapshot.* into inclusion_snapshot
  from loyalty.audience_snapshots as snapshot
  where snapshot.public_id = (new.definition ->> 'audienceSnapshotId')::uuid
    and snapshot.organization_id = new.organization_id
    and snapshot.programme_group_id = new.programme_group_id
    and snapshot.state = 'complete';
  if not found then
    raise exception using errcode = '23514',
      message = 'campaign inclusion snapshot unavailable';
  end if;
  for excluded_value in
    select value
    from pg_catalog.jsonb_array_elements_text(
      new.definition -> 'exclusionSnapshotIds'
    ) as excluded(value)
  loop
    if not exists (
      select 1
      from loyalty.audience_snapshots as snapshot
      where snapshot.public_id = excluded_value::uuid
        and snapshot.organization_id = new.organization_id
        and snapshot.programme_group_id = new.programme_group_id
        and snapshot.state = 'complete'
    ) then
      raise exception using errcode = '23514',
        message = 'campaign exclusion snapshot unavailable';
    end if;
  end loop;
  programme_reward_public_id := new.definition #>> '{behavior,reward,rewardId}';
  if programme_reward_public_id is not null
    and not exists (
      select 1
      from loyalty.programme_rewards as reward
      where reward.public_id = programme_reward_public_id::uuid
        and reward.organization_id = new.organization_id
        and reward.programme_group_id = new.programme_group_id
    ) then
    raise exception using errcode = '23514',
      message = 'campaign programme reward unavailable';
  end if;

  new.audience_snapshot_id := inclusion_snapshot.id;
  new.schedule_timezone := new.definition #>> '{schedule,timezone}';
  new.starts_at := (new.definition #>> '{schedule,startsAt}')::timestamptz;
  new.ends_at := (new.definition #>> '{schedule,endsAt}')::timestamptz;
  new.global_effect_limit :=
    (new.definition #>> '{capacity,globalEffectLimit}')::bigint;
  new.per_member_effect_limit :=
    (new.definition #>> '{capacity,perMemberEffectLimit}')::integer;
  new.maximum_points :=
    (new.definition #>> '{capacity,maximumPoints}')::bigint;
  new.maximum_liability_minor :=
    (new.definition #>> '{capacity,maximumLiabilityMinor}')::bigint;
  new.liability_minor_per_effect :=
    (new.definition #>> '{capacity,liabilityMinorPerEffect}')::bigint;
  new.liability_currency_code :=
    new.definition #>> '{capacity,liabilityCurrencyCode}';
  new.liability_minor_unit_digits :=
    (new.definition #>> '{capacity,liabilityMinorUnitDigits}')::smallint;
  new.control_basis_points :=
    (new.definition ->> 'controlBasisPoints')::integer;
  return new;
end;
$$;

create trigger campaign_versions_contract
before insert on loyalty.campaign_versions
for each row execute function loyalty_private.enforce_campaign_version_contract();

create or replace function loyalty_private.protect_campaign_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'campaign versions are immutable';
  end if;
  if new.id <> old.id
    or new.public_id <> old.public_id
    or new.organization_id <> old.organization_id
    or new.programme_group_id <> old.programme_group_id
    or new.campaign_id <> old.campaign_id
    or new.version_number <> old.version_number
    or new.definition <> old.definition
    or new.definition_sha256 <> old.definition_sha256
    or new.audience_snapshot_id <> old.audience_snapshot_id
    or new.schedule_timezone <> old.schedule_timezone
    or new.starts_at <> old.starts_at
    or new.ends_at <> old.ends_at
    or new.global_effect_limit <> old.global_effect_limit
    or new.per_member_effect_limit <> old.per_member_effect_limit
    or new.maximum_points is distinct from old.maximum_points
    or new.maximum_liability_minor is distinct from old.maximum_liability_minor
    or new.liability_minor_per_effect is distinct from old.liability_minor_per_effect
    or new.liability_currency_code is distinct from old.liability_currency_code
    or new.liability_minor_unit_digits is distinct from old.liability_minor_unit_digits
    or new.control_basis_points <> old.control_basis_points
    or new.created_by_user_id <> old.created_by_user_id
    or new.created_at <> old.created_at then
    raise exception using errcode = '55000',
      message = 'campaign definition history is immutable';
  end if;
  if old.status = 'draft' and new.status = 'scheduled'
    and old.approved_by_user_id is null
    and new.approved_by_user_id is not null
    and old.approved_at is null and new.approved_at is not null
    and old.assignment_sha256 is null and new.assignment_sha256 is not null
    and new.eligible_member_count > 0
    and new.treatment_member_count + new.control_member_count
      = new.eligible_member_count
    and new.status_changed_at >= old.status_changed_at then
    return new;
  end if;
  if old.status in ('scheduled', 'active') and new.status = 'paused'
    and new.approved_by_user_id = old.approved_by_user_id
    and new.approved_at = old.approved_at
    and new.eligible_member_count = old.eligible_member_count
    and new.treatment_member_count = old.treatment_member_count
    and new.control_member_count = old.control_member_count
    and new.assignment_sha256 = old.assignment_sha256
    and new.status_changed_at >= old.status_changed_at then
    return new;
  end if;
  if old.status in ('scheduled', 'active', 'paused') and new.status = 'cancelled'
    and new.approved_by_user_id = old.approved_by_user_id
    and new.approved_at = old.approved_at
    and new.eligible_member_count = old.eligible_member_count
    and new.treatment_member_count = old.treatment_member_count
    and new.control_member_count = old.control_member_count
    and new.assignment_sha256 = old.assignment_sha256
    and new.status_changed_at >= old.status_changed_at then
    return new;
  end if;
  raise exception using errcode = '55000',
    message = 'invalid campaign version transition';
end;
$$;

create trigger campaign_versions_protect_history
before update or delete on loyalty.campaign_versions
for each row execute function loyalty_private.protect_campaign_version();

create or replace function loyalty_private.calculate_campaign_preview_v1(
  target_campaign_version_id bigint
)
returns table (
  inclusion_members bigint,
  excluded_members bigint,
  eligible_members bigint,
  expected_control_members bigint,
  expected_treatment_members bigint,
  maximum_effects bigint,
  maximum_points bigint,
  maximum_liability_minor bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with target as (
    select version.*
    from loyalty.campaign_versions as version
    where version.id = target_campaign_version_id
  ), inclusion as (
    select member.wallet_id
    from target
    join loyalty_private.audience_snapshot_members as member
      on member.organization_id = target.organization_id
     and member.audience_snapshot_id = target.audience_snapshot_id
  ), excluded as (
    select distinct included.wallet_id
    from target
    join inclusion as included on true
    join loyalty.audience_snapshots as snapshot
      on snapshot.organization_id = target.organization_id
     and snapshot.programme_group_id = target.programme_group_id
     and snapshot.public_id::text in (
       select value
       from pg_catalog.jsonb_array_elements_text(
         target.definition -> 'exclusionSnapshotIds'
       ) as excluded_snapshot(value)
     )
    join loyalty_private.audience_snapshot_members as member
      on member.organization_id = snapshot.organization_id
     and member.audience_snapshot_id = snapshot.id
     and member.wallet_id = included.wallet_id
  ), counts as (
    select
      (select pg_catalog.count(*) from inclusion)::bigint as inclusion_count,
      (select pg_catalog.count(*) from excluded)::bigint as excluded_count
  ), bounded as (
    select target.*, counts.inclusion_count, counts.excluded_count,
      counts.inclusion_count - counts.excluded_count as eligible_count
    from target cross join counts
  )
  select bounded.inclusion_count,
    bounded.excluded_count,
    bounded.eligible_count,
    pg_catalog.floor(
      bounded.eligible_count::numeric * bounded.control_basis_points / 10000
    )::bigint,
    bounded.eligible_count - pg_catalog.floor(
      bounded.eligible_count::numeric * bounded.control_basis_points / 10000
    )::bigint,
    least(
      bounded.global_effect_limit::numeric,
      bounded.eligible_count::numeric * bounded.per_member_effect_limit
    )::bigint,
    bounded.maximum_points,
    bounded.maximum_liability_minor
  from bounded;
$$;

create or replace function loyalty_private.validate_campaign_definition_v1(
  target_definition jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  schedule_value jsonb;
  behavior_value jsonb;
  capacity_value jsonb;
  behavior_kind text;
  reward_kind text;
  reward_value jsonb;
  points_reward numeric;
  issues_points boolean := false;
  starts_at_value timestamptz;
  ends_at_value timestamptz;
  timezone_value text;
  maximum_points_value numeric;
  maximum_liability_value numeric;
  liability_per_effect_value numeric;
begin
  if pg_catalog.jsonb_typeof(target_definition) <> 'object'
    or pg_catalog.pg_column_size(target_definition) > 65536
    or not loyalty_private.campaign_object_has_exact_keys_v1(
      target_definition, array[
        'schemaVersion', 'code', 'name', 'description', 'audienceSnapshotId',
        'exclusionSnapshotIds', 'schedule', 'behavior', 'capacity',
        'controlBasisPoints'
      ]
    )
    or pg_catalog.jsonb_typeof(target_definition -> 'schemaVersion') <> 'string'
    or target_definition ->> 'schemaVersion' <> '1'
    or pg_catalog.jsonb_typeof(target_definition -> 'code') <> 'string'
    or target_definition ->> 'code' !~ '^[a-z][a-z0-9_-]{0,79}$'
    or pg_catalog.jsonb_typeof(target_definition -> 'name') <> 'string'
    or pg_catalog.length(pg_catalog.btrim(target_definition ->> 'name')) not between 1 and 120
    or target_definition ->> 'name' <> pg_catalog.btrim(target_definition ->> 'name')
    or pg_catalog.jsonb_typeof(target_definition -> 'description') <> 'string'
    or pg_catalog.length(pg_catalog.btrim(target_definition ->> 'description')) > 500
    or target_definition ->> 'description' <> pg_catalog.btrim(target_definition ->> 'description')
    or pg_catalog.jsonb_typeof(target_definition -> 'audienceSnapshotId') <> 'string'
    or target_definition ->> 'audienceSnapshotId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or not loyalty_private.campaign_uuid_array_valid_v1(
      target_definition -> 'exclusionSnapshotIds', 10
    )
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements_text(
        target_definition -> 'exclusionSnapshotIds'
      ) as excluded(value)
      where excluded.value = target_definition ->> 'audienceSnapshotId'
    )
    or pg_catalog.jsonb_typeof(target_definition -> 'controlBasisPoints') <> 'number'
    or (target_definition ->> 'controlBasisPoints') !~ '^(0|[1-9][0-9]*)$'
    or (target_definition ->> 'controlBasisPoints')::numeric > 9000 then
    raise exception using errcode = '22023',
      message = 'invalid campaign definition';
  end if;

  schedule_value := target_definition -> 'schedule';
  if pg_catalog.jsonb_typeof(schedule_value) <> 'object'
    or not loyalty_private.campaign_object_has_exact_keys_v1(
      schedule_value,
      array['timezone', 'startsAt', 'startsLocal', 'endsAt', 'endsLocal']
    )
    or pg_catalog.jsonb_typeof(schedule_value -> 'timezone') <> 'string'
    or pg_catalog.length(schedule_value ->> 'timezone') not between 1 and 64
    or pg_catalog.jsonb_typeof(schedule_value -> 'startsAt') <> 'string'
    or pg_catalog.jsonb_typeof(schedule_value -> 'endsAt') <> 'string'
    or pg_catalog.jsonb_typeof(schedule_value -> 'startsLocal') <> 'string'
    or pg_catalog.jsonb_typeof(schedule_value -> 'endsLocal') <> 'string'
    or schedule_value ->> 'startsAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$'
    or schedule_value ->> 'endsAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$'
    or schedule_value ->> 'startsLocal' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$'
    or schedule_value ->> 'endsLocal' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$' then
    raise exception using errcode = '22023',
      message = 'invalid campaign schedule';
  end if;
  timezone_value := schedule_value ->> 'timezone';
  if not exists (
    select 1 from pg_catalog.pg_timezone_names as zone
    where zone.name = timezone_value
  ) then
    raise exception using errcode = '22023',
      message = 'unknown campaign timezone';
  end if;
  begin
    starts_at_value := (schedule_value ->> 'startsAt')::timestamptz;
    ends_at_value := (schedule_value ->> 'endsAt')::timestamptz;
  exception when others then
    raise exception using errcode = '22023',
      message = 'invalid campaign schedule instant';
  end;
  if starts_at_value >= ends_at_value
    or ends_at_value - starts_at_value > interval '366 days'
    or pg_catalog.to_char(
      starts_at_value at time zone timezone_value,
      'YYYY-MM-DD"T"HH24:MI:SS'
    ) <> schedule_value ->> 'startsLocal'
    or pg_catalog.to_char(
      ends_at_value at time zone timezone_value,
      'YYYY-MM-DD"T"HH24:MI:SS'
    ) <> schedule_value ->> 'endsLocal' then
    raise exception using errcode = '22023',
      message = 'campaign timezone evidence mismatch';
  end if;

  behavior_value := target_definition -> 'behavior';
  if pg_catalog.jsonb_typeof(behavior_value) <> 'object'
    or pg_catalog.jsonb_typeof(behavior_value -> 'kind') <> 'string' then
    raise exception using errcode = '22023',
      message = 'invalid campaign behavior';
  end if;
  behavior_kind := behavior_value ->> 'kind';
  if behavior_kind = 'bonus_points' then
    if not loyalty_private.campaign_object_has_exact_keys_v1(
        behavior_value, array['kind', 'earningRuleCodes', 'reward']
      )
      or not loyalty_private.campaign_code_array_valid_v1(
        behavior_value -> 'earningRuleCodes', 1, 50
      ) then
      raise exception using errcode = '22023', message = 'invalid bonus campaign';
    end if;
    reward_value := behavior_value -> 'reward';
    reward_kind := loyalty_private.validate_campaign_reward_v1(reward_value);
    if reward_kind <> 'points' then
      raise exception using errcode = '22023',
        message = 'bonus campaigns must issue points';
    end if;
    points_reward := (reward_value ->> 'points')::numeric;
    issues_points := true;
  elsif behavior_kind = 'purchase_multiplier' then
    if not loyalty_private.campaign_object_has_exact_keys_v1(
        behavior_value,
        array['kind', 'earningRuleCodes', 'multiplierBasisPoints', 'priority']
      )
      or not loyalty_private.campaign_code_array_valid_v1(
        behavior_value -> 'earningRuleCodes', 1, 50
      )
      or pg_catalog.jsonb_typeof(behavior_value -> 'multiplierBasisPoints') <> 'number'
      or behavior_value ->> 'multiplierBasisPoints' !~ '^[1-9][0-9]*$'
      or (behavior_value ->> 'multiplierBasisPoints')::numeric not between 10001 and 100000
      or pg_catalog.jsonb_typeof(behavior_value -> 'priority') <> 'number'
      or behavior_value ->> 'priority' !~ '^(0|[1-9][0-9]*)$'
      or (behavior_value ->> 'priority')::numeric > 10000 then
      raise exception using errcode = '22023',
        message = 'invalid multiplier campaign';
    end if;
    issues_points := true;
  elsif behavior_kind = 'milestone' then
    if not loyalty_private.campaign_object_has_exact_keys_v1(
        behavior_value,
        array['kind', 'metric', 'threshold', 'activityCodes', 'reward']
      )
      or pg_catalog.jsonb_typeof(behavior_value -> 'metric') <> 'string'
      or behavior_value ->> 'metric' not in (
        'eligible_spend', 'earned_points', 'order_count', 'referral_count',
        'verified_action_count'
      )
      or pg_catalog.jsonb_typeof(behavior_value -> 'threshold') <> 'string'
      or behavior_value ->> 'threshold' !~ '^[1-9][0-9]*$'
      or (behavior_value ->> 'threshold')::numeric > 9223372036854775807
      or not loyalty_private.campaign_code_array_valid_v1(
        behavior_value -> 'activityCodes', 0, 50
      )
      or (behavior_value ->> 'metric' <> 'verified_action_count'
        and pg_catalog.jsonb_array_length(behavior_value -> 'activityCodes') > 0) then
      raise exception using errcode = '22023',
        message = 'invalid milestone campaign';
    end if;
    reward_value := behavior_value -> 'reward';
    reward_kind := loyalty_private.validate_campaign_reward_v1(reward_value);
  elsif behavior_kind = 'win_back' then
    if not loyalty_private.campaign_object_has_exact_keys_v1(
        behavior_value,
        array['kind', 'minimumInactiveDays', 'minimumEligibleSpendMinor', 'reward']
      )
      or pg_catalog.jsonb_typeof(behavior_value -> 'minimumInactiveDays') <> 'number'
      or behavior_value ->> 'minimumInactiveDays' !~ '^[1-9][0-9]*$'
      or (behavior_value ->> 'minimumInactiveDays')::numeric > 3650
      or pg_catalog.jsonb_typeof(behavior_value -> 'minimumEligibleSpendMinor') <> 'string'
      or behavior_value ->> 'minimumEligibleSpendMinor' !~ '^(0|[1-9][0-9]*)$'
      or (behavior_value ->> 'minimumEligibleSpendMinor')::numeric > 9223372036854775807 then
      raise exception using errcode = '22023',
        message = 'invalid win-back campaign';
    end if;
    reward_value := behavior_value -> 'reward';
    reward_kind := loyalty_private.validate_campaign_reward_v1(reward_value);
  elsif behavior_kind = 'tier' then
    if not loyalty_private.campaign_object_has_exact_keys_v1(
        behavior_value, array['kind', 'movement', 'tierCodes', 'reward']
      )
      or pg_catalog.jsonb_typeof(behavior_value -> 'movement') <> 'string'
      or behavior_value ->> 'movement' not in ('entry', 'retention', 're_entry')
      or not loyalty_private.campaign_code_array_valid_v1(
        behavior_value -> 'tierCodes', 1, 50
      ) then
      raise exception using errcode = '22023', message = 'invalid tier campaign';
    end if;
    reward_value := behavior_value -> 'reward';
    reward_kind := loyalty_private.validate_campaign_reward_v1(reward_value);
  elsif behavior_kind = 'referral' then
    if not loyalty_private.campaign_object_has_exact_keys_v1(
        behavior_value, array['kind', 'rewardedParty', 'reward']
      )
      or pg_catalog.jsonb_typeof(behavior_value -> 'rewardedParty') <> 'string'
      or behavior_value ->> 'rewardedParty' not in ('advocate', 'friend') then
      raise exception using errcode = '22023',
        message = 'invalid referral campaign';
    end if;
    reward_value := behavior_value -> 'reward';
    reward_kind := loyalty_private.validate_campaign_reward_v1(reward_value);
  elsif behavior_kind = 'limited_quantity' then
    if not loyalty_private.campaign_object_has_exact_keys_v1(
      behavior_value, array['kind', 'reward']
    ) then
      raise exception using errcode = '22023',
        message = 'invalid limited campaign';
    end if;
    reward_value := behavior_value -> 'reward';
    reward_kind := loyalty_private.validate_campaign_reward_v1(reward_value);
    if reward_kind <> 'programme_reward' then
      raise exception using errcode = '22023',
        message = 'limited campaigns must issue a programme reward';
    end if;
  else
    raise exception using errcode = '22023',
      message = 'unsupported campaign behavior';
  end if;
  if reward_kind = 'points' then
    issues_points := true;
    points_reward := (reward_value ->> 'points')::numeric;
  end if;

  capacity_value := target_definition -> 'capacity';
  if pg_catalog.jsonb_typeof(capacity_value) <> 'object'
    or not loyalty_private.campaign_object_has_exact_keys_v1(
      capacity_value, array[
        'globalEffectLimit', 'perMemberEffectLimit', 'maximumPoints',
        'maximumLiabilityMinor', 'liabilityMinorPerEffect',
        'liabilityCurrencyCode', 'liabilityMinorUnitDigits'
      ]
    )
    or pg_catalog.jsonb_typeof(capacity_value -> 'globalEffectLimit') <> 'string'
    or capacity_value ->> 'globalEffectLimit' !~ '^[1-9][0-9]*$'
    or (capacity_value ->> 'globalEffectLimit')::numeric > 9223372036854775807
    or pg_catalog.jsonb_typeof(capacity_value -> 'perMemberEffectLimit') <> 'number'
    or capacity_value ->> 'perMemberEffectLimit' !~ '^[1-9][0-9]*$'
    or (capacity_value ->> 'perMemberEffectLimit')::numeric > 100
    or (capacity_value ->> 'globalEffectLimit')::numeric
      < (capacity_value ->> 'perMemberEffectLimit')::numeric then
    raise exception using errcode = '22023',
      message = 'invalid campaign capacity';
  end if;
  if pg_catalog.jsonb_typeof(capacity_value -> 'maximumPoints') = 'null' then
    maximum_points_value := null;
  elsif pg_catalog.jsonb_typeof(capacity_value -> 'maximumPoints') = 'string'
    and capacity_value ->> 'maximumPoints' ~ '^[1-9][0-9]*$'
    and (capacity_value ->> 'maximumPoints')::numeric <= 9223372036854775807 then
    maximum_points_value := (capacity_value ->> 'maximumPoints')::numeric;
  else
    raise exception using errcode = '22023',
      message = 'invalid campaign points budget';
  end if;
  if pg_catalog.jsonb_typeof(capacity_value -> 'maximumLiabilityMinor') = 'null' then
    maximum_liability_value := null;
    liability_per_effect_value := null;
    if pg_catalog.jsonb_typeof(capacity_value -> 'liabilityMinorPerEffect') <> 'null'
      or pg_catalog.jsonb_typeof(capacity_value -> 'liabilityCurrencyCode') <> 'null'
      or pg_catalog.jsonb_typeof(capacity_value -> 'liabilityMinorUnitDigits') <> 'null' then
      raise exception using errcode = '22023',
        message = 'invalid campaign liability identity';
    end if;
  elsif pg_catalog.jsonb_typeof(capacity_value -> 'maximumLiabilityMinor') = 'string'
    and capacity_value ->> 'maximumLiabilityMinor' ~ '^[1-9][0-9]*$'
    and (capacity_value ->> 'maximumLiabilityMinor')::numeric <= 9223372036854775807
    and pg_catalog.jsonb_typeof(capacity_value -> 'liabilityMinorPerEffect') = 'string'
    and capacity_value ->> 'liabilityMinorPerEffect' ~ '^[1-9][0-9]*$'
    and (capacity_value ->> 'liabilityMinorPerEffect')::numeric
      <= (capacity_value ->> 'maximumLiabilityMinor')::numeric
    and pg_catalog.jsonb_typeof(capacity_value -> 'liabilityCurrencyCode') = 'string'
    and capacity_value ->> 'liabilityCurrencyCode' ~ '^[A-Z]{3}$'
    and pg_catalog.jsonb_typeof(capacity_value -> 'liabilityMinorUnitDigits') = 'number'
    and capacity_value ->> 'liabilityMinorUnitDigits' ~ '^(0|[1-3])$' then
    maximum_liability_value :=
      (capacity_value ->> 'maximumLiabilityMinor')::numeric;
    liability_per_effect_value :=
      (capacity_value ->> 'liabilityMinorPerEffect')::numeric;
  else
    raise exception using errcode = '22023',
      message = 'invalid campaign liability budget';
  end if;
  if issues_points and maximum_points_value is null then
    raise exception using errcode = '22023',
      message = 'point campaigns require a maximum-points budget';
  end if;
  if points_reward is not null and maximum_points_value < points_reward then
    raise exception using errcode = '22023',
      message = 'campaign points budget cannot fund one effect';
  end if;
  if reward_kind = 'programme_reward' and maximum_liability_value is null then
    raise exception using errcode = '22023',
      message = 'programme rewards require a liability ceiling';
  end if;
  if behavior_kind = 'limited_quantity'
    and (capacity_value ->> 'perMemberEffectLimit')::integer <> 1 then
    raise exception using errcode = '22023',
      message = 'limited campaigns allow one effect per member';
  end if;
end;
$$;

create or replace function loyalty.approve_campaign_version_command(
  target_version_public_id uuid,
  target_expected_definition_sha256 text,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (
  resource_public_id uuid,
  outcome text,
  status text,
  starts_at timestamptz,
  ends_at timestamptz,
  eligible_members text,
  treatment_members text,
  control_members text,
  assignment_sha256 text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := loyalty_private.request_user_id();
  target_version loyalty.campaign_versions%rowtype;
  target_campaign loyalty.campaigns%rowtype;
  existing_audit loyalty.admin_audit_events%rowtype;
  entitlement_enabled boolean;
  request_hash bytea;
  preview record;
  approval_time timestamptz;
  control_salt bytea;
  assignment_hash bytea;
  eligible_count bigint;
  treatment_count bigint;
  control_count bigint;
begin
  if actor_user_id is null
    or target_expected_definition_sha256 is null
    or target_expected_definition_sha256 !~ '^[a-f0-9]{64}$'
    or target_idempotency_key is null
    or pg_catalog.length(pg_catalog.btrim(target_idempotency_key)) not between 1 and 255
    or target_idempotency_key <> pg_catalog.btrim(target_idempotency_key)
    or target_correlation_id is null then
    raise exception using errcode = '22023',
      message = 'invalid campaign approval identity';
  end if;
  select campaign.* into target_campaign
  from loyalty.campaigns as campaign
  join loyalty.campaign_versions as version
    on version.organization_id = campaign.organization_id
   and version.campaign_id = campaign.id
  where version.public_id = target_version_public_id
    and loyalty_private.has_organization_role(
      campaign.organization_id, array['owner', 'admin']::text[]
    )
  for update of campaign;
  if not found then
    raise exception using errcode = '42501',
      message = 'campaign command not authorized';
  end if;
  select version.* into strict target_version
  from loyalty.campaign_versions as version
  where version.organization_id = target_campaign.organization_id
    and version.public_id = target_version_public_id;
  request_hash := extensions.digest(pg_catalog.convert_to(
    'campaign.version.approve|' || target_version.public_id::text || '|' ||
    target_expected_definition_sha256, 'UTF8'
  ), 'sha256');
  select audit.* into existing_audit
  from loyalty.admin_audit_events as audit
  where audit.organization_id = target_version.organization_id
    and audit.idempotency_key = target_idempotency_key;
  if found then
    if existing_audit.action <> 'campaign.version.approve'
      or existing_audit.request_sha256 <> request_hash then
      raise exception using errcode = '23514',
        message = 'campaign command idempotency conflict';
    end if;
    return query
    select version.public_id, 'duplicate'::text, 'scheduled'::text,
      version.starts_at, version.ends_at, version.eligible_member_count::text,
      version.treatment_member_count::text, version.control_member_count::text,
      pg_catalog.encode(version.assignment_sha256, 'hex')
    from loyalty.campaign_versions as version
    where version.organization_id = target_version.organization_id
      and version.public_id = existing_audit.resource_public_id;
    return;
  end if;
  if target_version.status <> 'draft'
    or pg_catalog.encode(target_version.definition_sha256, 'hex')
      <> target_expected_definition_sha256 then
    raise exception using errcode = '23514',
      message = 'campaign approval precondition failed';
  end if;
  perform loyalty_private.validate_campaign_definition_v1(
    target_version.definition
  );
  if target_version.definition #>> '{behavior,reward,rewardId}' is not null
    and not exists (
      select 1
      from loyalty.commerce_connections as connection
      where connection.organization_id = target_version.organization_id
        and connection.programme_id = target_campaign.programme_id
        and connection.status in ('active', 'rotating')
    ) then
    raise exception using errcode = '23514',
      message = 'campaign reward requires an active programme connection';
  end if;
  if target_version.starts_at <= pg_catalog.statement_timestamp() then
    raise exception using errcode = '22023',
      message = 'campaign start must remain in the future at approval';
  end if;
  if exists (
    select 1
    from loyalty.campaign_versions as accepted
    where accepted.organization_id = target_version.organization_id
      and accepted.campaign_id = target_version.campaign_id
      and accepted.id <> target_version.id
      and accepted.status in ('scheduled', 'active', 'paused')
  ) then
    raise exception using errcode = '23514',
      message = 'campaign already has accepted work';
  end if;
  select decision.enabled into strict entitlement_enabled
  from loyalty_private.resolve_organization_entitlement(
    target_version.organization_id, 'campaigns',
    'campaign:' || target_campaign.public_id::text, pg_catalog.now()
  ) as decision;
  if not entitlement_enabled then
    raise exception using errcode = '42501',
      message = 'campaigns are not enabled for this organization';
  end if;
  select * into strict preview
  from loyalty_private.calculate_campaign_preview_v1(target_version.id);
  if preview.eligible_members <= 0 or preview.maximum_effects <= 0 then
    raise exception using errcode = '23514',
      message = 'campaign approval requires an eligible bounded audience';
  end if;

  approval_time := pg_catalog.clock_timestamp();
  control_salt := extensions.gen_random_bytes(32);
  with inclusion as (
    select member.customer_id, member.wallet_id
    from loyalty_private.audience_snapshot_members as member
    where member.organization_id = target_version.organization_id
      and member.audience_snapshot_id = target_version.audience_snapshot_id
  ), eligible as (
    select included.customer_id, included.wallet_id
    from inclusion as included
    where not exists (
      select 1
      from loyalty.audience_snapshots as snapshot
      join loyalty_private.audience_snapshot_members as excluded
        on excluded.organization_id = snapshot.organization_id
       and excluded.audience_snapshot_id = snapshot.id
       and excluded.wallet_id = included.wallet_id
      where snapshot.organization_id = target_version.organization_id
        and snapshot.programme_group_id = target_version.programme_group_id
        and snapshot.public_id::text in (
          select value
          from pg_catalog.jsonb_array_elements_text(
            target_version.definition -> 'exclusionSnapshotIds'
          ) as excluded_snapshot(value)
        )
    )
  ), scored as (
    select eligible.*,
      extensions.digest(
        control_salt || pg_catalog.convert_to(eligible.wallet_id::text, 'UTF8'),
        'sha256'
      ) as evidence
    from eligible
  ), ranked as (
    select scored.*,
      pg_catalog.row_number() over (
        order by scored.evidence, scored.wallet_id
      ) as assignment_rank,
      pg_catalog.count(*) over () as assignment_count
    from scored
  )
  insert into loyalty_private.campaign_assignments (
    organization_id, programme_group_id, campaign_version_id,
    audience_snapshot_id, customer_id, wallet_id, assignment,
    assignment_evidence_sha256
  )
  select target_version.organization_id, target_version.programme_group_id,
    target_version.id, target_version.audience_snapshot_id,
    ranked.customer_id, ranked.wallet_id,
    case when ranked.assignment_rank <= pg_catalog.floor(
      ranked.assignment_count::numeric
        * target_version.control_basis_points / 10000
    )::bigint then 'control' else 'treatment' end,
    ranked.evidence
  from ranked;
  select pg_catalog.count(*)::bigint,
    pg_catalog.count(*) filter (where assignment.assignment = 'treatment')::bigint,
    pg_catalog.count(*) filter (where assignment.assignment = 'control')::bigint,
    extensions.digest(pg_catalog.convert_to(
      pg_catalog.string_agg(
        assignment.wallet_id::text || ':' || assignment.assignment,
        '|' order by assignment.wallet_id
      ), 'UTF8'
    ), 'sha256')
  into eligible_count, treatment_count, control_count, assignment_hash
  from loyalty_private.campaign_assignments as assignment
  where assignment.organization_id = target_version.organization_id
    and assignment.campaign_version_id = target_version.id;
  if eligible_count <> preview.eligible_members
    or control_count <> preview.expected_control_members
    or treatment_count <> preview.expected_treatment_members
    or assignment_hash is null then
    raise exception using errcode = '23514',
      message = 'campaign assignment reconciliation failed';
  end if;
  insert into loyalty_private.campaign_controls (
    organization_id, programme_group_id, campaign_version_id,
    assignment_salt, assignment_sha256
  ) values (
    target_version.organization_id, target_version.programme_group_id,
    target_version.id, control_salt, assignment_hash
  );
  update loyalty.campaign_versions as version
  set status = 'scheduled', approved_by_user_id = actor_user_id,
    approved_at = approval_time, status_changed_at = approval_time,
    eligible_member_count = eligible_count,
    treatment_member_count = treatment_count,
    control_member_count = control_count,
    assignment_sha256 = assignment_hash
  where version.organization_id = target_version.organization_id
    and version.id = target_version.id;
  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id,
    metadata
  ) values (
    target_version.organization_id, actor_user_id,
    'campaign.version.approve', 'campaign_version', target_version.public_id,
    target_idempotency_key, request_hash, target_correlation_id,
    pg_catalog.jsonb_build_object(
      'definitionSha256', target_expected_definition_sha256,
      'startsAt', target_version.starts_at,
      'endsAt', target_version.ends_at,
      'eligibleMembers', eligible_count,
      'treatmentMembers', treatment_count,
      'controlMembers', control_count,
      'assignmentSha256', pg_catalog.encode(assignment_hash, 'hex')
    )
  );
  return query select target_version.public_id, 'created'::text,
    'scheduled'::text, target_version.starts_at, target_version.ends_at,
    eligible_count::text, treatment_count::text, control_count::text,
    pg_catalog.encode(assignment_hash, 'hex');
end;
$$;

create or replace function loyalty.pause_campaign_version_command(
  target_version_public_id uuid,
  target_reason text,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (resource_public_id uuid, outcome text, status text, changed_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := loyalty_private.request_user_id();
  target_version loyalty.campaign_versions%rowtype;
  existing_audit loyalty.admin_audit_events%rowtype;
  request_hash bytea;
  change_time timestamptz;
begin
  if actor_user_id is null
    or target_reason is null
    or pg_catalog.length(pg_catalog.btrim(target_reason)) not between 8 and 1000
    or target_reason <> pg_catalog.btrim(target_reason)
    or target_reason ~ '[[:cntrl:]]'
    or target_idempotency_key is null
    or pg_catalog.length(pg_catalog.btrim(target_idempotency_key)) not between 1 and 255
    or target_idempotency_key <> pg_catalog.btrim(target_idempotency_key)
    or target_correlation_id is null then
    raise exception using errcode = '22023',
      message = 'invalid campaign pause identity';
  end if;
  select version.* into target_version
  from loyalty.campaign_versions as version
  where version.public_id = target_version_public_id
    and loyalty_private.has_organization_role(
      version.organization_id, array['owner', 'admin', 'operator']::text[]
    )
  for update;
  if not found then
    raise exception using errcode = '42501',
      message = 'campaign command not authorized';
  end if;
  request_hash := extensions.digest(pg_catalog.convert_to(
    'campaign.version.pause|' || target_version.public_id::text || '|' ||
    target_reason, 'UTF8'
  ), 'sha256');
  select audit.* into existing_audit
  from loyalty.admin_audit_events as audit
  where audit.organization_id = target_version.organization_id
    and audit.idempotency_key = target_idempotency_key;
  if found then
    if existing_audit.action <> 'campaign.version.pause'
      or existing_audit.request_sha256 <> request_hash then
      raise exception using errcode = '23514',
        message = 'campaign command idempotency conflict';
    end if;
    return query select version.public_id, 'duplicate'::text, 'paused'::text,
      (existing_audit.metadata ->> 'changedAt')::timestamptz
    from loyalty.campaign_versions as version
    where version.organization_id = target_version.organization_id
      and version.public_id = existing_audit.resource_public_id;
    return;
  end if;
  if target_version.status not in ('scheduled', 'active') then
    raise exception using errcode = '23514',
      message = 'campaign cannot be paused from its current state';
  end if;
  change_time := pg_catalog.clock_timestamp();
  update loyalty.campaign_versions as version
  set status = 'paused', status_changed_at = change_time
  where version.organization_id = target_version.organization_id
    and version.id = target_version.id;
  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id,
    metadata
  ) values (
    target_version.organization_id, actor_user_id,
    'campaign.version.pause', 'campaign_version', target_version.public_id,
    target_idempotency_key, request_hash, target_correlation_id,
    pg_catalog.jsonb_build_object('reason', target_reason, 'changedAt', change_time)
  );
  return query select target_version.public_id, 'created'::text,
    'paused'::text, change_time;
end;
$$;

create or replace function loyalty.cancel_campaign_version_command(
  target_version_public_id uuid,
  target_reason text,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (resource_public_id uuid, outcome text, status text, changed_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := loyalty_private.request_user_id();
  target_version loyalty.campaign_versions%rowtype;
  existing_audit loyalty.admin_audit_events%rowtype;
  request_hash bytea;
  change_time timestamptz;
begin
  if actor_user_id is null
    or target_reason is null
    or pg_catalog.length(pg_catalog.btrim(target_reason)) not between 8 and 1000
    or target_reason <> pg_catalog.btrim(target_reason)
    or target_reason ~ '[[:cntrl:]]'
    or target_idempotency_key is null
    or pg_catalog.length(pg_catalog.btrim(target_idempotency_key)) not between 1 and 255
    or target_idempotency_key <> pg_catalog.btrim(target_idempotency_key)
    or target_correlation_id is null then
    raise exception using errcode = '22023',
      message = 'invalid campaign cancellation identity';
  end if;
  select version.* into target_version
  from loyalty.campaign_versions as version
  where version.public_id = target_version_public_id
    and loyalty_private.has_organization_role(
      version.organization_id, array['owner', 'admin']::text[]
    )
  for update;
  if not found then
    raise exception using errcode = '42501',
      message = 'campaign command not authorized';
  end if;
  request_hash := extensions.digest(pg_catalog.convert_to(
    'campaign.version.cancel|' || target_version.public_id::text || '|' ||
    target_reason, 'UTF8'
  ), 'sha256');
  select audit.* into existing_audit
  from loyalty.admin_audit_events as audit
  where audit.organization_id = target_version.organization_id
    and audit.idempotency_key = target_idempotency_key;
  if found then
    if existing_audit.action <> 'campaign.version.cancel'
      or existing_audit.request_sha256 <> request_hash then
      raise exception using errcode = '23514',
        message = 'campaign command idempotency conflict';
    end if;
    return query select version.public_id, 'duplicate'::text, 'cancelled'::text,
      (existing_audit.metadata ->> 'changedAt')::timestamptz
    from loyalty.campaign_versions as version
    where version.organization_id = target_version.organization_id
      and version.public_id = existing_audit.resource_public_id;
    return;
  end if;
  if target_version.status not in ('scheduled', 'active', 'paused') then
    raise exception using errcode = '23514',
      message = 'campaign cannot be cancelled from its current state';
  end if;
  change_time := pg_catalog.clock_timestamp();
  update loyalty.campaign_versions as version
  set status = 'cancelled', status_changed_at = change_time
  where version.organization_id = target_version.organization_id
    and version.id = target_version.id;
  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id,
    metadata
  ) values (
    target_version.organization_id, actor_user_id,
    'campaign.version.cancel', 'campaign_version', target_version.public_id,
    target_idempotency_key, request_hash, target_correlation_id,
    pg_catalog.jsonb_build_object('reason', target_reason, 'changedAt', change_time)
  );
  return query select target_version.public_id, 'created'::text,
    'cancelled'::text, change_time;
end;
$$;

alter function loyalty_private.campaign_code_array_valid_v1(jsonb, integer, integer)
  owner to loyalty_owner;
alter function loyalty_private.campaign_uuid_array_valid_v1(jsonb, integer)
  owner to loyalty_owner;
alter function loyalty_private.campaign_object_has_exact_keys_v1(jsonb, text[])
  owner to loyalty_owner;
alter function loyalty_private.validate_campaign_reward_v1(jsonb)
  owner to loyalty_owner;
alter function loyalty_private.validate_campaign_definition_v1(jsonb)
  owner to loyalty_owner;
alter function loyalty_private.enforce_campaign_version_contract()
  owner to loyalty_owner;
alter function loyalty_private.protect_campaign_version()
  owner to loyalty_owner;
alter function loyalty_private.calculate_campaign_preview_v1(bigint)
  owner to loyalty_owner;
alter function loyalty.create_campaign_draft_command(uuid, jsonb, text, uuid)
  owner to loyalty_owner;
alter function loyalty.preview_campaign_version_command(uuid, text, text, uuid)
  owner to loyalty_owner;
alter function loyalty.approve_campaign_version_command(uuid, text, text, uuid)
  owner to loyalty_owner;
alter function loyalty.pause_campaign_version_command(uuid, text, text, uuid)
  owner to loyalty_owner;
alter function loyalty.cancel_campaign_version_command(uuid, text, text, uuid)
  owner to loyalty_owner;

alter table loyalty.campaigns enable row level security;
alter table loyalty.campaign_versions enable row level security;
alter table loyalty_private.campaign_controls enable row level security;
alter table loyalty_private.campaign_assignments enable row level security;

create policy campaigns_member_select on loyalty.campaigns
  for select to authenticated using (
    (select loyalty_private.is_organization_member(organization_id))
  );
create policy campaign_versions_member_select on loyalty.campaign_versions
  for select to authenticated using (
    (select loyalty_private.is_organization_member(organization_id))
  );

revoke all on loyalty.campaigns, loyalty.campaign_versions,
  loyalty_private.campaign_controls, loyalty_private.campaign_assignments
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant select on loyalty.campaigns, loyalty.campaign_versions to authenticated;

revoke all on function
  loyalty_private.campaign_code_array_valid_v1(jsonb, integer, integer),
  loyalty_private.campaign_uuid_array_valid_v1(jsonb, integer),
  loyalty_private.campaign_object_has_exact_keys_v1(jsonb, text[]),
  loyalty_private.validate_campaign_reward_v1(jsonb),
  loyalty_private.validate_campaign_definition_v1(jsonb),
  loyalty_private.enforce_campaign_version_contract(),
  loyalty_private.protect_campaign_version(),
  loyalty_private.calculate_campaign_preview_v1(bigint),
  loyalty.create_campaign_draft_command(uuid, jsonb, text, uuid),
  loyalty.preview_campaign_version_command(uuid, text, text, uuid),
  loyalty.approve_campaign_version_command(uuid, text, text, uuid),
  loyalty.pause_campaign_version_command(uuid, text, text, uuid),
  loyalty.cancel_campaign_version_command(uuid, text, text, uuid)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function
  loyalty.create_campaign_draft_command(uuid, jsonb, text, uuid),
  loyalty.preview_campaign_version_command(uuid, text, text, uuid),
  loyalty.approve_campaign_version_command(uuid, text, text, uuid),
  loyalty.pause_campaign_version_command(uuid, text, text, uuid),
  loyalty.cancel_campaign_version_command(uuid, text, text, uuid)
  to authenticated;

comment on table loyalty.campaigns is
  'Stable tenant-scoped campaign identities; definitions live in immutable versions.';
comment on table loyalty.campaign_versions is
  'Strict campaign definitions with explicit schedule, budgets, aggregate assignment evidence, and lifecycle.';
comment on table loyalty_private.campaign_controls is
  'Private random control-assignment salt and aggregate assignment hash.';
comment on table loyalty_private.campaign_assignments is
  'Private immutable wallet treatment/control assignment bound at campaign approval.';
comment on function loyalty.approve_campaign_version_command(uuid, text, text, uuid) is
  'Approves one future campaign only after immutable audience, budget, and private control assignments reconcile.';
