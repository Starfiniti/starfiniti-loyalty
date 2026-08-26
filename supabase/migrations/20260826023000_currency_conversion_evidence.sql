-- M11-S03: immutable occurrence-time provider rates and independently
-- recomputed atomic currency-conversion evidence.

create table loyalty_private.currency_conversion_policy_versions (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  programme_group_id bigint not null,
  programme_version_id bigint not null,
  revision integer not null check (revision > 0),
  state text not null check (state in ('enabled', 'disabled')),
  provider_key text not null,
  source_currency_code text not null,
  source_minor_unit_digits smallint not null,
  base_currency_code text not null,
  base_minor_unit_digits smallint not null,
  max_rate_age_seconds integer not null,
  rounding_mode text not null check (rounding_mode = 'half_away_from_zero'),
  effective_from timestamptz not null,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, programme_version_id, source_currency_code, revision),
  foreign key (organization_id, programme_group_id, programme_version_id)
    references loyalty.programme_versions(organization_id, programme_group_id, id)
    on delete restrict,
  check (provider_key ~ '^[a-z][a-z0-9_.-]{0,79}$'),
  check (source_currency_code ~ '^[A-Z]{3}$'),
  check (base_currency_code ~ '^[A-Z]{3}$'),
  check (source_currency_code <> base_currency_code),
  check (source_minor_unit_digits between 0 and 6),
  check (base_minor_unit_digits between 0 and 6),
  check (max_rate_age_seconds between 60 and 604800),
  check (effective_from >= created_at)
);

create index currency_conversion_policy_resolution_idx
  on loyalty_private.currency_conversion_policy_versions (
    organization_id, programme_version_id, source_currency_code,
    effective_from desc, revision desc, id desc
  );

create table loyalty_private.currency_rate_snapshots (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null references loyalty.organizations(id) on delete restrict,
  provider_key text not null,
  provider_rate_reference text not null,
  source_currency_code text not null,
  source_minor_unit_digits smallint not null,
  base_currency_code text not null,
  base_minor_unit_digits smallint not null,
  rate_numerator numeric(100, 0) not null,
  rate_denominator numeric(100, 0) not null,
  observed_at timestamptz not null,
  valid_from timestamptz not null,
  valid_until timestamptz not null,
  payload_sha256 bytea not null check (octet_length(payload_sha256) = 32),
  recorded_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, provider_key, provider_rate_reference),
  check (provider_key ~ '^[a-z][a-z0-9_.-]{0,79}$'),
  check (length(provider_rate_reference) between 1 and 255),
  check (provider_rate_reference = btrim(provider_rate_reference)),
  check (source_currency_code ~ '^[A-Z]{3}$'),
  check (base_currency_code ~ '^[A-Z]{3}$'),
  check (source_currency_code <> base_currency_code),
  check (source_minor_unit_digits between 0 and 6),
  check (base_minor_unit_digits between 0 and 6),
  check (rate_numerator > 0 and rate_denominator > 0),
  check (observed_at <= valid_from),
  check (valid_from < valid_until),
  check (valid_until <= valid_from + interval '7 days'),
  check (recorded_at >= observed_at)
);

create index currency_rate_snapshot_resolution_idx
  on loyalty_private.currency_rate_snapshots (
    organization_id, provider_key, source_currency_code, base_currency_code,
    valid_from, valid_until, observed_at, id
  );

create table loyalty_private.currency_conversion_evidence (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  programme_group_id bigint not null,
  programme_version_id bigint not null,
  canonical_event_id bigint not null,
  policy_version_id bigint not null,
  rate_snapshot_id bigint not null,
  origin_conversion_evidence_id bigint,
  source_currency_code text not null,
  source_minor_unit_digits smallint not null,
  base_currency_code text not null,
  base_minor_unit_digits smallint not null,
  provider_key text not null,
  provider_rate_reference text not null,
  rate_numerator numeric(100, 0) not null,
  rate_denominator numeric(100, 0) not null,
  rate_observed_at timestamptz not null,
  rounding_mode text not null check (rounding_mode = 'half_away_from_zero'),
  amounts_sha256 bytea not null check (octet_length(amounts_sha256) = 32),
  source_projection_sha256 bytea not null check (octet_length(source_projection_sha256) = 32),
  base_projection_sha256 bytea not null check (octet_length(base_projection_sha256) = 32),
  recorded_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, canonical_event_id),
  foreign key (organization_id, programme_group_id, programme_version_id)
    references loyalty.programme_versions(organization_id, programme_group_id, id)
    on delete restrict,
  foreign key (organization_id, canonical_event_id)
    references loyalty_private.canonical_commerce_events(organization_id, id)
    on delete restrict,
  foreign key (organization_id, policy_version_id)
    references loyalty_private.currency_conversion_policy_versions(organization_id, id)
    on delete restrict,
  foreign key (organization_id, rate_snapshot_id)
    references loyalty_private.currency_rate_snapshots(organization_id, id)
    on delete restrict,
  foreign key (organization_id, origin_conversion_evidence_id)
    references loyalty_private.currency_conversion_evidence(organization_id, id)
    on delete restrict,
  check (source_currency_code ~ '^[A-Z]{3}$'),
  check (base_currency_code ~ '^[A-Z]{3}$'),
  check (source_currency_code <> base_currency_code),
  check (source_minor_unit_digits between 0 and 6),
  check (base_minor_unit_digits between 0 and 6),
  check (provider_key ~ '^[a-z][a-z0-9_.-]{0,79}$'),
  check (length(provider_rate_reference) between 1 and 255),
  check (rate_numerator > 0 and rate_denominator > 0),
  check (origin_conversion_evidence_id is null or origin_conversion_evidence_id <> id)
);

create index currency_conversion_evidence_period_idx
  on loyalty_private.currency_conversion_evidence (
    organization_id, programme_group_id, rate_observed_at, id
  );

create table loyalty_private.currency_conversion_amounts (
  id bigint generated always as identity primary key,
  organization_id bigint not null,
  conversion_evidence_id bigint not null,
  amount_key text not null,
  source_amount_minor bigint not null check (source_amount_minor >= 0),
  base_amount_minor bigint not null check (base_amount_minor >= 0),
  exact_numerator numeric(120, 0) not null check (exact_numerator >= 0),
  exact_denominator numeric(120, 0) not null check (exact_denominator > 0),
  rounding_delta_numerator numeric(120, 0) not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, conversion_evidence_id, amount_key),
  foreign key (organization_id, conversion_evidence_id)
    references loyalty_private.currency_conversion_evidence(organization_id, id)
    on delete restrict,
  check (amount_key ~ '^[a-z][a-z0-9:._-]{0,254}$')
);

create index currency_conversion_amounts_evidence_idx
  on loyalty_private.currency_conversion_amounts (
    organization_id, conversion_evidence_id, id
  );

alter table loyalty_private.currency_conversion_policy_versions owner to loyalty_owner;
alter table loyalty_private.currency_rate_snapshots owner to loyalty_owner;
alter table loyalty_private.currency_conversion_evidence owner to loyalty_owner;
alter table loyalty_private.currency_conversion_amounts owner to loyalty_owner;

create trigger currency_conversion_policy_versions_immutable
before update or delete on loyalty_private.currency_conversion_policy_versions
for each row execute function loyalty_private.reject_immutable_change();
create trigger currency_rate_snapshots_immutable
before update or delete on loyalty_private.currency_rate_snapshots
for each row execute function loyalty_private.reject_immutable_change();
create trigger currency_conversion_evidence_immutable
before update or delete on loyalty_private.currency_conversion_evidence
for each row execute function loyalty_private.reject_immutable_change();
create trigger currency_conversion_amounts_immutable
before update or delete on loyalty_private.currency_conversion_amounts
for each row execute function loyalty_private.reject_immutable_change();

create or replace function loyalty.configure_programme_currency_policy_v1(
  target_programme_version_public_id uuid,
  target_source_currency_code text,
  target_source_minor_unit_digits integer,
  target_provider_key text,
  target_max_rate_age_seconds integer,
  target_state text,
  target_expected_revision integer,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (
  policy_version_public_id uuid,
  outcome text,
  revision integer,
  state text
)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  actor_user_id uuid := loyalty_private.request_user_id();
  target_version loyalty.programme_versions%rowtype;
  target_organization_public_id uuid;
  target_base_currency_code text;
  target_base_minor_unit_digits integer;
  configuration_enabled boolean;
  current_policy loyalty_private.currency_conversion_policy_versions%rowtype;
  created_policy loyalty_private.currency_conversion_policy_versions%rowtype;
  existing_audit loyalty.admin_audit_events%rowtype;
  request_hash bytea;
  command_time timestamptz := clock_timestamp();
begin
  if actor_user_id is null
    or target_programme_version_public_id is null
    or coalesce(target_source_currency_code, '') !~ '^[A-Z]{3}$'
    or target_source_minor_unit_digits not between 0 and 6
    or coalesce(target_provider_key, '') !~ '^[a-z][a-z0-9_.-]{0,79}$'
    or target_max_rate_age_seconds not between 60 and 604800
    or target_state not in ('enabled', 'disabled')
    or target_expected_revision is null or target_expected_revision < 0
    or target_idempotency_key is null
    or target_idempotency_key <> btrim(target_idempotency_key)
    or length(target_idempotency_key) not between 1 and 255
    or target_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid currency policy command input';
  end if;

  select version.* into target_version
  from loyalty.programme_versions as version
  join loyalty.programmes as programme
    on programme.organization_id = version.organization_id
   and programme.id = version.programme_id
   and programme.status = 'active'
  where version.public_id = target_programme_version_public_id
    and version.status = 'published'
    and version.configuration ->> 'version' = '2'
    and loyalty_private.has_organization_role(
      version.organization_id, array['owner', 'admin']::text[]
    )
  for update of version;
  if not found then
    raise exception using errcode = '42501', message = 'currency policy command not authorized';
  end if;

  target_base_currency_code := target_version.configuration ->> 'currencyCode';
  target_base_minor_unit_digits := (
    target_version.configuration ->> 'currencyMinorUnitDigits'
  )::integer;
  if target_source_currency_code = target_base_currency_code then
    raise exception using errcode = '22023', message = 'currency policy source must differ from programme base';
  end if;

  select organization.public_id into strict target_organization_public_id
  from loyalty.organizations as organization
  where organization.id = target_version.organization_id
    and organization.status = 'active';
  select entitlement.enabled into configuration_enabled
  from loyalty_private.resolve_organization_entitlement(
    target_version.organization_id, 'ecosystem.api',
    target_organization_public_id::text, command_time
  ) as entitlement;
  if not coalesce(configuration_enabled, false) then
    raise exception using errcode = '42501', message = 'ecosystem capability disabled';
  end if;

  request_hash := extensions.digest(
    convert_to(
      'currency-policy.configure|' || target_version.public_id::text || '|' ||
      target_source_currency_code || '|' || target_source_minor_unit_digits::text || '|' ||
      target_provider_key || '|' || target_max_rate_age_seconds::text || '|' ||
      target_state || '|' || target_expected_revision::text,
      'UTF8'
    ), 'sha256'
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'currency-policy-idempotency|' || target_version.organization_id::text ||
      '|' || target_idempotency_key,
      0
    )
  );
  select audit.* into existing_audit
  from loyalty.admin_audit_events as audit
  where audit.organization_id = target_version.organization_id
    and audit.idempotency_key = target_idempotency_key;
  if found then
    if existing_audit.action <> 'programme.currency_policy.configure'
      or existing_audit.request_sha256 <> request_hash then
      raise exception using errcode = '23514', message = 'currency policy idempotency conflict';
    end if;
    return query
    select policy.public_id, 'duplicate'::text, policy.revision, policy.state
    from loyalty_private.currency_conversion_policy_versions as policy
    where policy.organization_id = target_version.organization_id
      and policy.public_id = existing_audit.resource_public_id;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'currency-policy|' || target_version.organization_id::text || '|' ||
      target_version.id::text || '|' || target_source_currency_code,
      0
    )
  );
  select policy.* into current_policy
  from loyalty_private.currency_conversion_policy_versions as policy
  where policy.organization_id = target_version.organization_id
    and policy.programme_version_id = target_version.id
    and policy.source_currency_code = target_source_currency_code
  order by policy.revision desc, policy.id desc
  limit 1;
  if coalesce(current_policy.revision, 0) <> target_expected_revision then
    raise exception using errcode = '23514', message = 'currency policy revision conflict';
  end if;

  insert into loyalty_private.currency_conversion_policy_versions (
    organization_id, programme_group_id, programme_version_id, revision,
    state, provider_key, source_currency_code, source_minor_unit_digits,
    base_currency_code, base_minor_unit_digits, max_rate_age_seconds,
    rounding_mode, effective_from, created_by_user_id, correlation_id,
    created_at
  ) values (
    target_version.organization_id, target_version.programme_group_id,
    target_version.id, target_expected_revision + 1, target_state,
    target_provider_key, target_source_currency_code,
    target_source_minor_unit_digits, target_base_currency_code,
    target_base_minor_unit_digits, target_max_rate_age_seconds,
    'half_away_from_zero', command_time, actor_user_id,
    target_correlation_id, command_time
  ) returning * into strict created_policy;

  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id,
    metadata, created_at
  ) values (
    target_version.organization_id, actor_user_id,
    'programme.currency_policy.configure', 'currency_conversion_policy',
    created_policy.public_id, target_idempotency_key, request_hash,
    target_correlation_id,
    jsonb_build_object(
      'programmeVersionId', target_version.public_id,
      'revision', created_policy.revision,
      'state', created_policy.state,
      'providerKey', created_policy.provider_key,
      'sourceCurrencyCode', created_policy.source_currency_code,
      'baseCurrencyCode', created_policy.base_currency_code
    ), command_time
  );
  return query select created_policy.public_id, 'created'::text,
    created_policy.revision, created_policy.state;
end;
$$;

create or replace function loyalty.get_programme_currency_policies_v1(
  target_programme_version_public_id uuid
)
returns table (policy jsonb)
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  target_version loyalty.programme_versions%rowtype;
begin
  select version.* into target_version
  from loyalty.programme_versions as version
  where version.public_id = target_programme_version_public_id
    and loyalty_private.has_organization_role(
      version.organization_id,
      array['owner', 'admin', 'marketer', 'operator', 'support', 'analyst', 'auditor']::text[]
    );
  if not found then
    raise exception using errcode = '42501', message = 'currency policy read not authorized';
  end if;
  return query
  select jsonb_build_object(
    'version', '1',
    'policyVersionId', current_policy.public_id,
    'revision', current_policy.revision,
    'programmeVersionId', target_version.public_id,
    'state', current_policy.state,
    'providerKey', current_policy.provider_key,
    'sourceCurrencyCode', current_policy.source_currency_code,
    'sourceMinorUnitDigits', current_policy.source_minor_unit_digits,
    'baseCurrencyCode', current_policy.base_currency_code,
    'baseMinorUnitDigits', current_policy.base_minor_unit_digits,
    'maxRateAgeSeconds', current_policy.max_rate_age_seconds,
    'roundingMode', current_policy.rounding_mode,
    'effectiveFrom', current_policy.effective_from
  )
  from loyalty_private.currency_conversion_policy_versions as current_policy
  where current_policy.organization_id = target_version.organization_id
    and current_policy.programme_version_id = target_version.id
    and not exists (
      select 1
      from loyalty_private.currency_conversion_policy_versions as later
      where later.organization_id = current_policy.organization_id
        and later.programme_version_id = current_policy.programme_version_id
        and later.source_currency_code = current_policy.source_currency_code
        and later.revision > current_policy.revision
    )
  order by current_policy.source_currency_code;
end;
$$;

create or replace function loyalty_private.record_currency_rate_snapshot_v1(
  target_organization_id bigint,
  target_provider_key text,
  target_provider_rate_reference text,
  target_source_currency_code text,
  target_source_minor_unit_digits integer,
  target_base_currency_code text,
  target_base_minor_unit_digits integer,
  target_rate_numerator numeric,
  target_rate_denominator numeric,
  target_observed_at timestamptz,
  target_valid_from timestamptz,
  target_valid_until timestamptz,
  target_payload_sha256 bytea
)
returns table (rate_snapshot_public_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  existing_snapshot loyalty_private.currency_rate_snapshots%rowtype;
  created_snapshot loyalty_private.currency_rate_snapshots%rowtype;
begin
  if not exists (
      select 1 from loyalty.organizations as organization
      where organization.id = target_organization_id
        and organization.status = 'active'
    )
    or coalesce(target_provider_key, '') !~ '^[a-z][a-z0-9_.-]{0,79}$'
    or target_provider_rate_reference is null
    or target_provider_rate_reference <> btrim(target_provider_rate_reference)
    or length(target_provider_rate_reference) not between 1 and 255
    or coalesce(target_source_currency_code, '') !~ '^[A-Z]{3}$'
    or coalesce(target_base_currency_code, '') !~ '^[A-Z]{3}$'
    or target_source_currency_code = target_base_currency_code
    or target_source_minor_unit_digits not between 0 and 6
    or target_base_minor_unit_digits not between 0 and 6
    or target_rate_numerator is null or target_rate_numerator <= 0
    or target_rate_numerator <> trunc(target_rate_numerator)
    or target_rate_denominator is null or target_rate_denominator <= 0
    or target_rate_denominator <> trunc(target_rate_denominator)
    or target_observed_at is null or target_valid_from is null
    or target_valid_until is null
    or target_observed_at > target_valid_from
    or target_valid_from >= target_valid_until
    or target_valid_until > target_valid_from + interval '7 days'
    or target_payload_sha256 is null
    or octet_length(target_payload_sha256) <> 32 then
    raise exception using errcode = '22023', message = 'invalid currency rate snapshot';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'currency-rate|' || target_organization_id::text || '|' ||
      target_provider_key || '|' || target_provider_rate_reference,
      0
    )
  );

  select snapshot.* into existing_snapshot
  from loyalty_private.currency_rate_snapshots as snapshot
  where snapshot.organization_id = target_organization_id
    and snapshot.provider_key = target_provider_key
    and snapshot.provider_rate_reference = target_provider_rate_reference;
  if found then
    if existing_snapshot.source_currency_code <> target_source_currency_code
      or existing_snapshot.source_minor_unit_digits <> target_source_minor_unit_digits
      or existing_snapshot.base_currency_code <> target_base_currency_code
      or existing_snapshot.base_minor_unit_digits <> target_base_minor_unit_digits
      or existing_snapshot.rate_numerator <> target_rate_numerator
      or existing_snapshot.rate_denominator <> target_rate_denominator
      or existing_snapshot.observed_at <> target_observed_at
      or existing_snapshot.valid_from <> target_valid_from
      or existing_snapshot.valid_until <> target_valid_until
      or existing_snapshot.payload_sha256 <> target_payload_sha256 then
      raise exception using errcode = '23514', message = 'currency rate reference conflict';
    end if;
    return query select existing_snapshot.public_id, 'duplicate'::text;
    return;
  end if;

  insert into loyalty_private.currency_rate_snapshots (
    organization_id, provider_key, provider_rate_reference,
    source_currency_code, source_minor_unit_digits, base_currency_code,
    base_minor_unit_digits, rate_numerator, rate_denominator, observed_at,
    valid_from, valid_until, payload_sha256
  ) values (
    target_organization_id, target_provider_key,
    target_provider_rate_reference, target_source_currency_code,
    target_source_minor_unit_digits, target_base_currency_code,
    target_base_minor_unit_digits, target_rate_numerator,
    target_rate_denominator, target_observed_at, target_valid_from,
    target_valid_until, target_payload_sha256
  ) returning * into strict created_snapshot;
  return query select created_snapshot.public_id, 'created'::text;
end;
$$;

create or replace function loyalty_private.resolve_currency_conversion_context_v1(
  target_organization_id bigint,
  target_programme_version_id bigint,
  target_source_currency_code text,
  target_source_minor_unit_digits integer,
  target_occurred_at timestamptz,
  target_origin_evidence_public_id uuid default null
)
returns table (conversion_context jsonb)
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  target_version loyalty.programme_versions%rowtype;
  selected_policy loyalty_private.currency_conversion_policy_versions%rowtype;
  selected_snapshot loyalty_private.currency_rate_snapshots%rowtype;
  selected_evidence loyalty_private.currency_conversion_evidence%rowtype;
  matching_snapshots integer;
begin
  if coalesce(target_source_currency_code, '') !~ '^[A-Z]{3}$'
    or target_source_minor_unit_digits not between 0 and 6
    or target_occurred_at is null then
    raise exception using errcode = '22023', message = 'invalid currency resolution input';
  end if;
  select version.* into target_version
  from loyalty.programme_versions as version
  where version.organization_id = target_organization_id
    and version.id = target_programme_version_id
    and version.status = 'published'
    and version.configuration ->> 'version' = '2';
  if not found then
    raise exception using errcode = '22023', message = 'currency programme version unavailable';
  end if;

  if target_origin_evidence_public_id is not null then
    select evidence.* into selected_evidence
    from loyalty_private.currency_conversion_evidence as evidence
    where evidence.organization_id = target_organization_id
      and evidence.programme_version_id = target_programme_version_id
      and evidence.public_id = target_origin_evidence_public_id
      and evidence.source_currency_code = target_source_currency_code
      and evidence.source_minor_unit_digits = target_source_minor_unit_digits;
    if not found then
      raise exception using errcode = '23514', message = 'original conversion evidence mismatch';
    end if;
    select policy.* into strict selected_policy
    from loyalty_private.currency_conversion_policy_versions as policy
    where policy.organization_id = selected_evidence.organization_id
      and policy.id = selected_evidence.policy_version_id;
    select snapshot.* into strict selected_snapshot
    from loyalty_private.currency_rate_snapshots as snapshot
    where snapshot.organization_id = selected_evidence.organization_id
      and snapshot.id = selected_evidence.rate_snapshot_id;
  else
    select policy.* into selected_policy
    from loyalty_private.currency_conversion_policy_versions as policy
    where policy.organization_id = target_organization_id
      and policy.programme_version_id = target_programme_version_id
      and policy.source_currency_code = target_source_currency_code
      and policy.source_minor_unit_digits = target_source_minor_unit_digits
      and policy.effective_from <= target_occurred_at
    order by policy.effective_from desc, policy.revision desc, policy.id desc
    limit 1;
    if not found or selected_policy.state <> 'enabled' then
      return;
    end if;
    select count(*)::integer into strict matching_snapshots
    from loyalty_private.currency_rate_snapshots as snapshot
    where snapshot.organization_id = target_organization_id
      and snapshot.provider_key = selected_policy.provider_key
      and snapshot.source_currency_code = selected_policy.source_currency_code
      and snapshot.source_minor_unit_digits = selected_policy.source_minor_unit_digits
      and snapshot.base_currency_code = selected_policy.base_currency_code
      and snapshot.base_minor_unit_digits = selected_policy.base_minor_unit_digits
      and snapshot.observed_at <= target_occurred_at
      and snapshot.valid_from <= target_occurred_at
      and snapshot.valid_until > target_occurred_at
      and target_occurred_at - snapshot.observed_at
        <= make_interval(secs => selected_policy.max_rate_age_seconds);
    if matching_snapshots = 0 then
      return;
    end if;
    if matching_snapshots <> 1 then
      raise exception using errcode = '55000', message = 'ambiguous currency rate snapshots';
    end if;
    select snapshot.* into strict selected_snapshot
    from loyalty_private.currency_rate_snapshots as snapshot
    where snapshot.organization_id = target_organization_id
      and snapshot.provider_key = selected_policy.provider_key
      and snapshot.source_currency_code = selected_policy.source_currency_code
      and snapshot.source_minor_unit_digits = selected_policy.source_minor_unit_digits
      and snapshot.base_currency_code = selected_policy.base_currency_code
      and snapshot.base_minor_unit_digits = selected_policy.base_minor_unit_digits
      and snapshot.observed_at <= target_occurred_at
      and snapshot.valid_from <= target_occurred_at
      and snapshot.valid_until > target_occurred_at
      and target_occurred_at - snapshot.observed_at
        <= make_interval(secs => selected_policy.max_rate_age_seconds);
  end if;

  if selected_policy.base_currency_code <> target_version.configuration ->> 'currencyCode'
    or selected_policy.base_minor_unit_digits <>
      (target_version.configuration ->> 'currencyMinorUnitDigits')::integer
    or selected_policy.provider_key <> selected_snapshot.provider_key
    or selected_policy.source_currency_code <> selected_snapshot.source_currency_code
    or selected_policy.source_minor_unit_digits <> selected_snapshot.source_minor_unit_digits
    or selected_policy.base_currency_code <> selected_snapshot.base_currency_code
    or selected_policy.base_minor_unit_digits <> selected_snapshot.base_minor_unit_digits then
    raise exception using errcode = '23514', message = 'currency policy snapshot mismatch';
  end if;

  return query select jsonb_build_object(
    'version', '1',
    'policy', jsonb_build_object(
      'version', '1',
      'policyVersionId', selected_policy.public_id,
      'revision', selected_policy.revision,
      'programmeVersionId', target_version.public_id,
      'state', selected_policy.state,
      'providerKey', selected_policy.provider_key,
      'sourceCurrencyCode', selected_policy.source_currency_code,
      'sourceMinorUnitDigits', selected_policy.source_minor_unit_digits,
      'baseCurrencyCode', selected_policy.base_currency_code,
      'baseMinorUnitDigits', selected_policy.base_minor_unit_digits,
      'maxRateAgeSeconds', selected_policy.max_rate_age_seconds,
      'roundingMode', selected_policy.rounding_mode,
      'effectiveFrom', selected_policy.effective_from
    ),
    'snapshot', jsonb_build_object(
      'version', '1',
      'rateSnapshotId', selected_snapshot.public_id,
      'providerKey', selected_snapshot.provider_key,
      'providerRateReference', selected_snapshot.provider_rate_reference,
      'sourceCurrencyCode', selected_snapshot.source_currency_code,
      'sourceMinorUnitDigits', selected_snapshot.source_minor_unit_digits,
      'baseCurrencyCode', selected_snapshot.base_currency_code,
      'baseMinorUnitDigits', selected_snapshot.base_minor_unit_digits,
      'rateNumerator', selected_snapshot.rate_numerator::text,
      'rateDenominator', selected_snapshot.rate_denominator::text,
      'observedAt', selected_snapshot.observed_at,
      'validFrom', selected_snapshot.valid_from,
      'validUntil', selected_snapshot.valid_until,
      'payloadSha256', encode(selected_snapshot.payload_sha256, 'hex')
    )
  );
end;
$$;

create or replace function loyalty_private.record_currency_conversion_evidence_v1(
  target_organization_id bigint,
  target_canonical_event_public_id uuid,
  target_programme_version_id bigint,
  target_policy_version_public_id uuid,
  target_rate_snapshot_public_id uuid,
  target_origin_evidence_public_id uuid,
  target_amounts jsonb,
  target_source_projection_sha256 bytea,
  target_base_projection_sha256 bytea
)
returns table (
  conversion_evidence_public_id uuid,
  outcome text
)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  target_event loyalty_private.canonical_commerce_events%rowtype;
  target_version loyalty.programme_versions%rowtype;
  target_policy loyalty_private.currency_conversion_policy_versions%rowtype;
  target_snapshot loyalty_private.currency_rate_snapshots%rowtype;
  target_origin_evidence loyalty_private.currency_conversion_evidence%rowtype;
  existing_evidence loyalty_private.currency_conversion_evidence%rowtype;
  created_evidence loyalty_private.currency_conversion_evidence%rowtype;
  amount_value jsonb;
  amount_keys text[] := array[]::text[];
  target_amount_key text;
  target_source_amount bigint;
  target_base_amount bigint;
  expected_numerator numeric;
  expected_denominator numeric;
  expected_base_amount numeric;
  expected_rounding_delta numeric;
  target_amounts_sha256 bytea;
  selected_policy_id bigint;
  matching_snapshots integer;
begin
  if target_canonical_event_public_id is null
    or target_policy_version_public_id is null
    or target_rate_snapshot_public_id is null
    or jsonb_typeof(target_amounts) <> 'array'
    or jsonb_array_length(target_amounts) not between 1 and 500
    or target_source_projection_sha256 is null
    or octet_length(target_source_projection_sha256) <> 32
    or target_base_projection_sha256 is null
    or octet_length(target_base_projection_sha256) <> 32 then
    raise exception using errcode = '22023', message = 'invalid currency conversion evidence input';
  end if;
  select event.* into target_event
  from loyalty_private.canonical_commerce_events as event
  where event.organization_id = target_organization_id
    and event.public_id = target_canonical_event_public_id
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'currency conversion event unavailable';
  end if;
  select version.* into target_version
  from loyalty.programme_versions as version
  join loyalty.commerce_connections as connection
    on connection.organization_id = version.organization_id
   and connection.programme_id = version.programme_id
   and connection.id = target_event.connection_id
  where version.organization_id = target_organization_id
    and version.id = target_programme_version_id
    and version.status = 'published'
    and version.configuration ->> 'version' = '2';
  if not found then
    raise exception using errcode = '23514', message = 'currency conversion programme mismatch';
  end if;
  if target_origin_evidence_public_id is null then
    if target_event.event_type <> 'commerce.order.status_changed' then
      raise exception using errcode = '23514', message = 'foreign refund requires original conversion evidence';
    end if;
  else
    select origin.* into target_origin_evidence
    from loyalty_private.currency_conversion_evidence as origin
    join loyalty_private.canonical_commerce_events as origin_event
      on origin_event.organization_id = origin.organization_id
     and origin_event.id = origin.canonical_event_id
    where origin.organization_id = target_organization_id
      and origin.public_id = target_origin_evidence_public_id
      and origin.programme_version_id = target_version.id
      and origin_event.connection_id = target_event.connection_id
      and origin_event.source_object_id = target_event.source_object_id
      and origin_event.event_type = 'commerce.order.status_changed'
      and target_event.event_type = 'commerce.order.refunded';
    if not found then
      raise exception using errcode = '23514', message = 'original conversion evidence mismatch';
    end if;
  end if;
  select policy.* into target_policy
  from loyalty_private.currency_conversion_policy_versions as policy
  where policy.organization_id = target_organization_id
    and policy.public_id = target_policy_version_public_id
    and policy.programme_version_id = target_version.id
    and policy.programme_group_id = target_version.programme_group_id;
  if not found then
    raise exception using errcode = '23514', message = 'currency conversion policy mismatch';
  end if;
  select snapshot.* into target_snapshot
  from loyalty_private.currency_rate_snapshots as snapshot
  where snapshot.organization_id = target_organization_id
    and snapshot.public_id = target_rate_snapshot_public_id;
  if not found
    or target_policy.provider_key <> target_snapshot.provider_key
    or target_policy.source_currency_code <> target_snapshot.source_currency_code
    or target_policy.source_minor_unit_digits <> target_snapshot.source_minor_unit_digits
    or target_policy.base_currency_code <> target_snapshot.base_currency_code
    or target_policy.base_minor_unit_digits <> target_snapshot.base_minor_unit_digits
    or target_policy.base_currency_code <> target_version.configuration ->> 'currencyCode'
    or target_policy.base_minor_unit_digits <>
      (target_version.configuration ->> 'currencyMinorUnitDigits')::integer then
    raise exception using errcode = '23514', message = 'currency conversion snapshot mismatch';
  end if;
  if target_origin_evidence_public_id is not null
    and (
      target_origin_evidence.policy_version_id <> target_policy.id
      or target_origin_evidence.rate_snapshot_id <> target_snapshot.id
    ) then
    raise exception using errcode = '23514', message = 'original conversion evidence mismatch';
  end if;

  if target_origin_evidence_public_id is null then
    select policy.id into selected_policy_id
    from loyalty_private.currency_conversion_policy_versions as policy
    where policy.organization_id = target_organization_id
      and policy.programme_version_id = target_version.id
      and policy.source_currency_code = target_policy.source_currency_code
      and policy.source_minor_unit_digits = target_policy.source_minor_unit_digits
      and policy.effective_from <= target_event.occurred_at
    order by policy.effective_from desc, policy.revision desc, policy.id desc
    limit 1;
    if selected_policy_id is null
      or target_policy.id <> selected_policy_id
      or target_policy.state <> 'enabled' then
      raise exception using errcode = '23514', message = 'currency conversion policy not effective at occurrence';
    end if;
    if target_snapshot.observed_at > target_event.occurred_at
      or target_snapshot.valid_from > target_event.occurred_at
      or target_snapshot.valid_until <= target_event.occurred_at
      or target_event.occurred_at - target_snapshot.observed_at
        > make_interval(secs => target_policy.max_rate_age_seconds) then
      raise exception using errcode = '23514', message = 'currency conversion snapshot not valid at occurrence';
    end if;
    select count(*)::integer into strict matching_snapshots
    from loyalty_private.currency_rate_snapshots as snapshot
    where snapshot.organization_id = target_organization_id
      and snapshot.provider_key = target_policy.provider_key
      and snapshot.source_currency_code = target_policy.source_currency_code
      and snapshot.source_minor_unit_digits = target_policy.source_minor_unit_digits
      and snapshot.base_currency_code = target_policy.base_currency_code
      and snapshot.base_minor_unit_digits = target_policy.base_minor_unit_digits
      and snapshot.observed_at <= target_event.occurred_at
      and snapshot.valid_from <= target_event.occurred_at
      and snapshot.valid_until > target_event.occurred_at
      and target_event.occurred_at - snapshot.observed_at
        <= make_interval(secs => target_policy.max_rate_age_seconds);
    if matching_snapshots <> 1 then
      raise exception using errcode = '55000', message = 'ambiguous currency rate snapshots';
    end if;
  end if;

  target_amounts_sha256 := extensions.digest(
    pg_catalog.convert_to(target_amounts::text, 'UTF8'), 'sha256'
  );

  select evidence.* into existing_evidence
  from loyalty_private.currency_conversion_evidence as evidence
  where evidence.organization_id = target_organization_id
    and evidence.canonical_event_id = target_event.id;
  if found then
    if existing_evidence.programme_version_id <> target_version.id
      or existing_evidence.policy_version_id <> target_policy.id
      or existing_evidence.rate_snapshot_id <> target_snapshot.id
      or existing_evidence.origin_conversion_evidence_id is distinct from
        target_origin_evidence.id
      or existing_evidence.amounts_sha256 <> target_amounts_sha256
      or existing_evidence.source_projection_sha256 <> target_source_projection_sha256
      or existing_evidence.base_projection_sha256 <> target_base_projection_sha256 then
      raise exception using errcode = '23514', message = 'currency conversion event conflict';
    end if;
    return query select existing_evidence.public_id, 'duplicate'::text;
    return;
  end if;

  for amount_value in select value from jsonb_array_elements(target_amounts)
  loop
    if jsonb_typeof(amount_value) <> 'object'
      or not (amount_value ?& array[
        'amountKey', 'sourceAmountMinor', 'baseAmountMinor',
        'exactNumerator', 'exactDenominator', 'roundingDeltaNumerator'
      ])
      or amount_value - array[
        'amountKey', 'sourceAmountMinor', 'baseAmountMinor',
        'exactNumerator', 'exactDenominator', 'roundingDeltaNumerator'
      ] <> '{}'::jsonb
      or coalesce(amount_value ->> 'amountKey', '') !~ '^[a-z][a-z0-9:._-]{0,254}$'
      or coalesce(amount_value ->> 'sourceAmountMinor', '')
        !~ '^(0|[1-9][0-9]{0,18})$'
      or coalesce(amount_value ->> 'baseAmountMinor', '')
        !~ '^(0|[1-9][0-9]{0,18})$'
      or coalesce(amount_value ->> 'exactNumerator', '')
        !~ '^(0|[1-9][0-9]{0,119})$'
      or coalesce(amount_value ->> 'exactDenominator', '')
        !~ '^[1-9][0-9]{0,119}$'
      or coalesce(amount_value ->> 'roundingDeltaNumerator', '')
        !~ '^-?(0|[1-9][0-9]{0,119})$' then
      raise exception using errcode = '22023', message = 'invalid atomic currency conversion';
    end if;
    target_amount_key := amount_value ->> 'amountKey';
    if target_amount_key = any(amount_keys) then
      raise exception using errcode = '23514', message = 'duplicate currency conversion amount key';
    end if;
    amount_keys := array_append(amount_keys, target_amount_key);
    target_source_amount := (amount_value ->> 'sourceAmountMinor')::bigint;
    target_base_amount := (amount_value ->> 'baseAmountMinor')::bigint;
    expected_numerator := target_source_amount::numeric
      * target_snapshot.rate_numerator
      * power(10::numeric, target_snapshot.base_minor_unit_digits);
    expected_denominator := target_snapshot.rate_denominator
      * power(10::numeric, target_snapshot.source_minor_unit_digits);
    expected_base_amount := floor(
      (expected_numerator * 2 + expected_denominator)
      / (expected_denominator * 2)
    );
    expected_rounding_delta := expected_base_amount * expected_denominator
      - expected_numerator;
    if (amount_value ->> 'exactNumerator')::numeric <> expected_numerator
      or (amount_value ->> 'exactDenominator')::numeric <> expected_denominator
      or target_base_amount::numeric <> expected_base_amount
      or (amount_value ->> 'roundingDeltaNumerator')::numeric
        <> expected_rounding_delta then
      raise exception using errcode = '23514', message = 'currency conversion arithmetic mismatch';
    end if;
  end loop;

  insert into loyalty_private.currency_conversion_evidence (
    organization_id, programme_group_id, programme_version_id,
    canonical_event_id, policy_version_id, rate_snapshot_id,
    origin_conversion_evidence_id,
    source_currency_code, source_minor_unit_digits, base_currency_code,
    base_minor_unit_digits, provider_key, provider_rate_reference,
    rate_numerator, rate_denominator, rate_observed_at, rounding_mode,
    amounts_sha256, source_projection_sha256, base_projection_sha256
  ) values (
    target_organization_id, target_version.programme_group_id,
    target_version.id, target_event.id, target_policy.id, target_snapshot.id,
    target_origin_evidence.id,
    target_policy.source_currency_code, target_policy.source_minor_unit_digits,
    target_policy.base_currency_code, target_policy.base_minor_unit_digits,
    target_policy.provider_key, target_snapshot.provider_rate_reference,
    target_snapshot.rate_numerator, target_snapshot.rate_denominator,
    target_snapshot.observed_at, target_policy.rounding_mode,
    target_amounts_sha256, target_source_projection_sha256,
    target_base_projection_sha256
  ) returning * into strict created_evidence;

  insert into loyalty_private.currency_conversion_amounts (
    organization_id, conversion_evidence_id, amount_key,
    source_amount_minor, base_amount_minor, exact_numerator,
    exact_denominator, rounding_delta_numerator
  )
  select target_organization_id, created_evidence.id,
    amount.value ->> 'amountKey',
    (amount.value ->> 'sourceAmountMinor')::bigint,
    (amount.value ->> 'baseAmountMinor')::bigint,
    (amount.value ->> 'exactNumerator')::numeric,
    (amount.value ->> 'exactDenominator')::numeric,
    (amount.value ->> 'roundingDeltaNumerator')::numeric
  from jsonb_array_elements(target_amounts) as amount(value);

  return query select created_evidence.public_id, 'created'::text;
end;
$$;

alter function loyalty_private.commit_programme_v2_award(
  bigint, bigint, bigint, bigint, bigint, text, text, text, bytea, bytea,
  jsonb, jsonb, timestamptz, timestamptz
) rename to commit_programme_v2_award_currency_core;

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
  source_currency_code text;
  source_minor_unit_digits integer;
  base_currency_code text;
  base_minor_unit_digits integer;
  evidence_selector text;
  committed record;
begin
  select event.payload -> 'order' ->> 'currency',
    (event.payload -> 'order' ->> 'currencyMinorUnitDigits')::integer,
    version.configuration ->> 'currencyCode',
    (version.configuration ->> 'currencyMinorUnitDigits')::integer
  into strict source_currency_code, source_minor_unit_digits,
    base_currency_code, base_minor_unit_digits
  from loyalty_private.canonical_commerce_events as event
  join loyalty.programme_versions as version
    on version.organization_id = event.organization_id
   and version.id = target_programme_version_id
  where event.organization_id = target_organization_id
    and event.id = target_canonical_event_id;

  evidence_selector := target_explanation
    -> 'currencyConversion' ->> 'evidenceId';
  if source_currency_code <> base_currency_code
    or source_minor_unit_digits <> base_minor_unit_digits then
    if coalesce(evidence_selector, '') !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or not exists (
        select 1
        from loyalty_private.currency_conversion_evidence as evidence
        where evidence.organization_id = target_organization_id
          and evidence.programme_group_id = target_programme_group_id
          and evidence.programme_version_id = target_programme_version_id
          and evidence.canonical_event_id = target_canonical_event_id
          and evidence.public_id = evidence_selector::uuid
          and evidence.source_currency_code = source_currency_code
          and evidence.source_minor_unit_digits = source_minor_unit_digits
          and evidence.base_currency_code = base_currency_code
          and evidence.base_minor_unit_digits = base_minor_unit_digits
          and evidence.origin_conversion_evidence_id is null
      ) then
      raise exception using errcode = '23514', message = 'foreign award lacks exact conversion evidence';
    end if;
  elsif evidence_selector is not null then
    raise exception using errcode = '23514', message = 'same-currency award cannot attach conversion evidence';
  end if;

  select * into strict committed
  from loyalty_private.commit_programme_v2_award_currency_core(
    target_organization_id, target_programme_group_id,
    target_programme_version_id, target_canonical_event_id,
    target_customer_id, target_subject_reference,
    target_evaluation_idempotency_key, target_award_idempotency_key,
    target_input_sha256, target_result_sha256, target_result,
    target_explanation, target_occurred_at, target_evaluated_at
  );
  evaluation_public_id := committed.evaluation_public_id;
  transaction_public_id := committed.transaction_public_id;
  outcome := committed.outcome;
  return next;
end;
$$;

alter function loyalty.configure_programme_currency_policy_v1(
  uuid, text, integer, text, integer, text, integer, text, uuid
) owner to loyalty_owner;
alter function loyalty.get_programme_currency_policies_v1(uuid)
  owner to loyalty_owner;
alter function loyalty_private.record_currency_rate_snapshot_v1(
  bigint, text, text, text, integer, text, integer, numeric, numeric,
  timestamptz, timestamptz, timestamptz, bytea
) owner to loyalty_owner;
alter function loyalty_private.resolve_currency_conversion_context_v1(
  bigint, bigint, text, integer, timestamptz, uuid
) owner to loyalty_owner;
alter function loyalty_private.record_currency_conversion_evidence_v1(
  bigint, uuid, bigint, uuid, uuid, uuid, jsonb, bytea, bytea
) owner to loyalty_owner;
alter function loyalty_private.commit_programme_v2_award_currency_core(
  bigint, bigint, bigint, bigint, bigint, text, text, text, bytea, bytea,
  jsonb, jsonb, timestamptz, timestamptz
) owner to loyalty_owner;
alter function loyalty_private.commit_programme_v2_award(
  bigint, bigint, bigint, bigint, bigint, text, text, text, bytea, bytea,
  jsonb, jsonb, timestamptz, timestamptz
) owner to loyalty_owner;

alter table loyalty_private.currency_conversion_policy_versions enable row level security;
alter table loyalty_private.currency_rate_snapshots enable row level security;
alter table loyalty_private.currency_conversion_evidence enable row level security;
alter table loyalty_private.currency_conversion_amounts enable row level security;

revoke all on table
  loyalty_private.currency_conversion_policy_versions,
  loyalty_private.currency_rate_snapshots,
  loyalty_private.currency_conversion_evidence,
  loyalty_private.currency_conversion_amounts
from public, anon, authenticated, loyalty_runtime, loyalty_worker;

revoke all on function
  loyalty.configure_programme_currency_policy_v1(
    uuid, text, integer, text, integer, text, integer, text, uuid
  ),
  loyalty.get_programme_currency_policies_v1(uuid),
  loyalty_private.record_currency_rate_snapshot_v1(
    bigint, text, text, text, integer, text, integer, numeric, numeric,
    timestamptz, timestamptz, timestamptz, bytea
  ),
  loyalty_private.resolve_currency_conversion_context_v1(
    bigint, bigint, text, integer, timestamptz, uuid
  ),
  loyalty_private.record_currency_conversion_evidence_v1(
    bigint, uuid, bigint, uuid, uuid, uuid, jsonb, bytea, bytea
  ),
  loyalty_private.commit_programme_v2_award_currency_core(
    bigint, bigint, bigint, bigint, bigint, text, text, text, bytea, bytea,
    jsonb, jsonb, timestamptz, timestamptz
  ),
  loyalty_private.commit_programme_v2_award(
    bigint, bigint, bigint, bigint, bigint, text, text, text, bytea, bytea,
    jsonb, jsonb, timestamptz, timestamptz
  )
from public, anon, authenticated, loyalty_runtime, loyalty_worker;

grant execute on function loyalty.configure_programme_currency_policy_v1(
  uuid, text, integer, text, integer, text, integer, text, uuid
) to authenticated;
grant execute on function loyalty.get_programme_currency_policies_v1(uuid)
  to authenticated;
grant execute on function loyalty_private.record_currency_rate_snapshot_v1(
  bigint, text, text, text, integer, text, integer, numeric, numeric,
  timestamptz, timestamptz, timestamptz, bytea
) to loyalty_worker;
grant execute on function loyalty_private.resolve_currency_conversion_context_v1(
  bigint, bigint, text, integer, timestamptz, uuid
) to loyalty_worker;
grant execute on function loyalty_private.record_currency_conversion_evidence_v1(
  bigint, uuid, bigint, uuid, uuid, uuid, jsonb, bytea, bytea
) to loyalty_worker;
grant execute on function loyalty_private.commit_programme_v2_award(
  bigint, bigint, bigint, bigint, bigint, text, text, text, bytea, bytea,
  jsonb, jsonb, timestamptz, timestamptz
) to loyalty_worker;

comment on table loyalty_private.currency_conversion_policy_versions is
  'Immutable programme-version/source-currency policy revisions; browser roles have no table access.';
comment on table loyalty_private.currency_rate_snapshots is
  'Immutable provider-neutral exact rational rates selected by commerce occurrence time.';
comment on table loyalty_private.currency_conversion_evidence is
  'One immutable provider/policy conversion batch per canonical commerce event.';
comment on table loyalty_private.currency_conversion_amounts is
  'Atomic source/base amounts independently recomputed by PostgreSQL before value processing.';
comment on function loyalty_private.resolve_currency_conversion_context_v1(
  bigint, bigint, text, integer, timestamptz, uuid
) is
  'Resolves exactly one occurrence-time provider snapshot, or the original award snapshot for refunds; missing evidence returns no row and overlap fails closed.';
comment on function loyalty_private.record_currency_conversion_evidence_v1(
  bigint, uuid, bigint, uuid, uuid, uuid, jsonb, bytea, bytea
) is
  'Records one idempotent conversion batch only after exact per-amount PostgreSQL recomputation and matching-order refund-origin validation.';
