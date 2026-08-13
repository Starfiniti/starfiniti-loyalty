-- M02 deployment modes, database-authoritative entitlements, and rollout controls.
-- Commercial state can restrict new capability use, but protected loyalty-value
-- paths are structurally non-disableable and never consult an external provider.

create table loyalty.entitlement_catalogue (
  catalogue_version integer not null,
  capability_key text not null,
  display_name text not null,
  protected_value_path boolean not null default false,
  self_hosted_default_enabled boolean not null,
  managed_default_enabled boolean not null,
  default_limit_value bigint,
  effective_from timestamptz not null,
  effective_until timestamptz,
  created_at timestamptz not null default now(),
  primary key (catalogue_version, capability_key),
  check (catalogue_version > 0),
  check (capability_key ~ '^[a-z][a-z0-9_.]{2,79}$'),
  check (length(btrim(display_name)) between 1 and 120),
  check (default_limit_value is null or default_limit_value >= 0),
  check (effective_until is null or effective_until > effective_from),
  check (
    not protected_value_path
    or (self_hosted_default_enabled and managed_default_enabled)
  )
);

create table loyalty.organization_entitlements (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null
    references loyalty.organizations(id) on delete restrict,
  catalogue_version integer not null,
  capability_key text not null,
  state text not null check (state in ('enabled', 'disabled', 'inherit')),
  limit_value bigint,
  source text not null check (
    source in (
      'local_control', 'managed_contract', 'billing',
      'manual_override', 'canary'
    )
  ),
  actor_reference text not null,
  reason text not null,
  effective_from timestamptz not null,
  effective_until timestamptz,
  created_at timestamptz not null default now(),
  foreign key (catalogue_version, capability_key)
    references loyalty.entitlement_catalogue(catalogue_version, capability_key)
    on delete restrict,
  check (limit_value is null or limit_value >= 0),
  check (length(btrim(actor_reference)) between 3 and 200),
  check (length(btrim(reason)) between 8 and 1000),
  check (effective_until is null or effective_until > effective_from)
);

create index organization_entitlements_effective_idx
  on loyalty.organization_entitlements (
    organization_id, catalogue_version, capability_key,
    effective_from desc, id desc
  );

create table loyalty_private.deployment_configuration_versions (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  deployment_mode text not null
    check (deployment_mode in ('self_hosted', 'managed')),
  catalogue_version integer not null check (catalogue_version > 0),
  actor_reference text not null,
  reason text not null,
  effective_from timestamptz not null,
  created_at timestamptz not null default now(),
  check (length(btrim(actor_reference)) between 3 and 200),
  check (length(btrim(reason)) between 8 and 1000)
);

create table loyalty_private.capability_rollout_versions (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  catalogue_version integer not null,
  capability_key text not null,
  basis_points integer not null check (basis_points between 0 and 10000),
  rollout_seed uuid not null,
  actor_reference text not null,
  reason text not null,
  effective_from timestamptz not null,
  effective_until timestamptz,
  created_at timestamptz not null default now(),
  foreign key (catalogue_version, capability_key)
    references loyalty.entitlement_catalogue(catalogue_version, capability_key)
    on delete restrict,
  check (length(btrim(actor_reference)) between 3 and 200),
  check (length(btrim(reason)) between 8 and 1000),
  check (effective_until is null or effective_until > effective_from)
);

create index capability_rollout_versions_effective_idx
  on loyalty_private.capability_rollout_versions (
    catalogue_version, capability_key, effective_from desc, id desc
  );

create table loyalty_private.entitlement_provider_price_versions (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  catalogue_version integer not null,
  capability_key text not null,
  provider text not null check (provider in ('stripe')),
  provider_price_id text not null,
  actor_reference text not null,
  reason text not null,
  effective_from timestamptz not null,
  effective_until timestamptz,
  created_at timestamptz not null default now(),
  foreign key (catalogue_version, capability_key)
    references loyalty.entitlement_catalogue(catalogue_version, capability_key)
    on delete restrict,
  check (length(btrim(provider_price_id)) between 3 and 255),
  check (length(btrim(actor_reference)) between 3 and 200),
  check (length(btrim(reason)) between 8 and 1000),
  check (effective_until is null or effective_until > effective_from)
);

alter table loyalty.entitlement_catalogue owner to loyalty_owner;
alter table loyalty.organization_entitlements owner to loyalty_owner;
alter table loyalty_private.deployment_configuration_versions owner to loyalty_owner;
alter table loyalty_private.capability_rollout_versions owner to loyalty_owner;
alter table loyalty_private.entitlement_provider_price_versions owner to loyalty_owner;

create trigger entitlement_catalogue_immutable
before update or delete on loyalty.entitlement_catalogue
for each row execute function loyalty_private.reject_immutable_change();
create trigger organization_entitlements_immutable
before update or delete on loyalty.organization_entitlements
for each row execute function loyalty_private.reject_immutable_change();
create trigger deployment_configuration_versions_immutable
before update or delete on loyalty_private.deployment_configuration_versions
for each row execute function loyalty_private.reject_immutable_change();
create trigger capability_rollout_versions_immutable
before update or delete on loyalty_private.capability_rollout_versions
for each row execute function loyalty_private.reject_immutable_change();
create trigger entitlement_provider_price_versions_immutable
before update or delete on loyalty_private.entitlement_provider_price_versions
for each row execute function loyalty_private.reject_immutable_change();

insert into loyalty.entitlement_catalogue (
  catalogue_version, capability_key, display_name, protected_value_path,
  self_hosted_default_enabled, managed_default_enabled, effective_from
)
values
  (1, 'core.balance_read', 'Balance access', true, true, true, '2026-08-13 00:00:00+00'),
  (1, 'core.refund', 'Refund processing', true, true, true, '2026-08-13 00:00:00+00'),
  (1, 'core.reconciliation', 'Value reconciliation', true, true, true, '2026-08-13 00:00:00+00'),
  (1, 'core.checkout_independence', 'Checkout independence', true, true, true, '2026-08-13 00:00:00+00'),
  (1, 'core.export', 'Customer and value export', true, true, true, '2026-08-13 00:00:00+00'),
  (1, 'core.promised_reward_redemption', 'Promised reward redemption', true, true, true, '2026-08-13 00:00:00+00'),
  (1, 'programme.v2', 'Competitive earning rules', false, true, false, '2026-08-13 00:00:00+00'),
  (1, 'rewards.expanded', 'Expanded rewards', false, true, false, '2026-08-13 00:00:00+00'),
  (1, 'vip.advanced', 'Advanced VIP', false, true, false, '2026-08-13 00:00:00+00'),
  (1, 'referrals', 'Referrals', false, true, false, '2026-08-13 00:00:00+00'),
  (1, 'campaigns', 'Campaigns', false, true, false, '2026-08-13 00:00:00+00'),
  (1, 'notifications', 'Notifications', false, true, false, '2026-08-13 00:00:00+00'),
  (1, 'storefront.experience', 'Storefront experience', false, true, false, '2026-08-13 00:00:00+00'),
  (1, 'analytics', 'Analytics', false, true, false, '2026-08-13 00:00:00+00'),
  (1, 'ecosystem.api', 'API and webhooks', false, true, false, '2026-08-13 00:00:00+00'),
  (1, 'migration', 'Migration framework', false, true, false, '2026-08-13 00:00:00+00'),
  (1, 'enterprise.identity', 'Enterprise identity', false, true, false, '2026-08-13 00:00:00+00'),
  (1, 'managed.billing', 'Managed billing', false, false, false, '2026-08-13 00:00:00+00');

insert into loyalty_private.deployment_configuration_versions (
  deployment_mode, catalogue_version, actor_reference, reason, effective_from
)
values (
  'self_hosted', 1, 'migration:M02',
  'Safe local default with no external licence or billing dependency',
  '2026-08-13 00:00:00+00'
);

create or replace function loyalty_private.entitlement_rollout_bucket(
  rollout_seed uuid,
  stable_subject text
)
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$
  with hash as (
    select extensions.digest(
      pg_catalog.convert_to(rollout_seed::text || ':' || stable_subject, 'utf8'),
      'sha256'
    ) as value
  )
  select (
    (
      pg_catalog.get_byte(value, 0)::bigint * 16777216
      + pg_catalog.get_byte(value, 1)::bigint * 65536
      + pg_catalog.get_byte(value, 2)::bigint * 256
      + pg_catalog.get_byte(value, 3)::bigint
    ) % 10000
  )::integer
  from hash;
$$;

create or replace function loyalty_private.resolve_organization_entitlement(
  target_organization_id bigint,
  target_capability_key text,
  stable_subject text,
  target_at timestamptz default now()
)
returns table (
  deployment_mode text,
  catalogue_version integer,
  capability_key text,
  enabled boolean,
  protected_value_path boolean,
  limit_value bigint,
  rollout_basis_points integer,
  source text,
  effective_from timestamptz,
  effective_until timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  config loyalty_private.deployment_configuration_versions%rowtype;
  catalogue loyalty.entitlement_catalogue%rowtype;
  assignment loyalty.organization_entitlements%rowtype;
  rollout loyalty_private.capability_rollout_versions%rowtype;
  default_enabled boolean;
  bucket integer;
begin
  if stable_subject is null or length(stable_subject) not between 1 and 255 then
    raise exception using errcode = '22023', message = 'invalid entitlement subject';
  end if;
  if not exists (
    select 1 from loyalty.organizations as organization
    where organization.id = target_organization_id
  ) then
    raise exception using errcode = '22023', message = 'unknown organization';
  end if;

  select configuration.* into strict config
  from loyalty_private.deployment_configuration_versions as configuration
  where configuration.effective_from <= target_at
  order by configuration.effective_from desc, configuration.id desc
  limit 1;

  select item.* into strict catalogue
  from loyalty.entitlement_catalogue as item
  where item.catalogue_version = config.catalogue_version
    and item.capability_key = target_capability_key
    and item.effective_from <= target_at
    and (item.effective_until is null or item.effective_until > target_at);

  select entry.* into assignment
  from loyalty.organization_entitlements as entry
  where entry.organization_id = target_organization_id
    and entry.catalogue_version = config.catalogue_version
    and entry.capability_key = target_capability_key
    and entry.effective_from <= target_at
    and (entry.effective_until is null or entry.effective_until > target_at)
  order by entry.effective_from desc, entry.id desc
  limit 1;

  select candidate.* into rollout
  from loyalty_private.capability_rollout_versions as candidate
  where candidate.catalogue_version = config.catalogue_version
    and candidate.capability_key = target_capability_key
    and candidate.effective_from <= target_at
    and (candidate.effective_until is null or candidate.effective_until > target_at)
  order by candidate.effective_from desc, candidate.id desc
  limit 1;

  default_enabled := case config.deployment_mode
    when 'self_hosted' then catalogue.self_hosted_default_enabled
    else catalogue.managed_default_enabled
  end;

  deployment_mode := config.deployment_mode;
  catalogue_version := config.catalogue_version;
  capability_key := catalogue.capability_key;
  protected_value_path := catalogue.protected_value_path;
  limit_value := coalesce(assignment.limit_value, catalogue.default_limit_value);

  if catalogue.protected_value_path then
    enabled := true;
    rollout_basis_points := 10000;
    source := 'protected_value_path';
    effective_from := catalogue.effective_from;
    effective_until := catalogue.effective_until;
  elsif assignment.id is not null and assignment.state <> 'inherit' then
    enabled := assignment.state = 'enabled';
    rollout_basis_points := case when enabled then 10000 else 0 end;
    source := 'tenant_override';
    effective_from := assignment.effective_from;
    effective_until := assignment.effective_until;
  elsif default_enabled then
    enabled := true;
    rollout_basis_points := 10000;
    source := 'deployment_default';
    effective_from := catalogue.effective_from;
    effective_until := catalogue.effective_until;
  elsif rollout.id is not null then
    bucket := loyalty_private.entitlement_rollout_bucket(
      rollout.rollout_seed,
      stable_subject
    );
    enabled := bucket < rollout.basis_points;
    rollout_basis_points := rollout.basis_points;
    source := 'percentage_rollout';
    effective_from := rollout.effective_from;
    effective_until := rollout.effective_until;
  else
    enabled := false;
    rollout_basis_points := 0;
    source := 'deployment_default';
    effective_from := catalogue.effective_from;
    effective_until := catalogue.effective_until;
  end if;
  return next;
end;
$$;

create or replace function loyalty.get_my_entitlements_v1(
  target_organization_public_id uuid,
  target_at timestamptz default now()
)
returns table (
  schema_version text,
  organization_public_id uuid,
  deployment_mode text,
  catalogue_version integer,
  capability_key text,
  enabled boolean,
  protected_value_path boolean,
  limit_value text,
  rollout_basis_points integer,
  source text,
  effective_from timestamptz,
  effective_until timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_organization loyalty.organizations%rowtype;
  config loyalty_private.deployment_configuration_versions%rowtype;
begin
  select organization.* into target_organization
  from loyalty.organizations as organization
  where organization.public_id = target_organization_public_id;
  if target_organization.id is null
     or not loyalty_private.is_organization_member(target_organization.id) then
    return;
  end if;
  select configuration.* into strict config
  from loyalty_private.deployment_configuration_versions as configuration
  where configuration.effective_from <= target_at
  order by configuration.effective_from desc, configuration.id desc
  limit 1;
  return query
  select
    '1'::text,
    target_organization.public_id,
    resolved.deployment_mode,
    resolved.catalogue_version,
    resolved.capability_key,
    resolved.enabled,
    resolved.protected_value_path,
    resolved.limit_value::text,
    resolved.rollout_basis_points,
    resolved.source,
    resolved.effective_from,
    resolved.effective_until
  from loyalty.entitlement_catalogue as item
  cross join lateral loyalty_private.resolve_organization_entitlement(
    target_organization.id,
    item.capability_key,
    target_organization.public_id::text,
    target_at
  ) as resolved
  where item.catalogue_version = config.catalogue_version
    and item.effective_from <= target_at
    and (item.effective_until is null or item.effective_until > target_at)
  order by item.capability_key;
end;
$$;

create or replace function loyalty_private.set_deployment_mode(
  target_mode text,
  target_catalogue_version integer,
  target_actor_reference text,
  target_reason text,
  target_effective_from timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare created_public_id uuid;
begin
  if target_mode not in ('self_hosted', 'managed')
     or not exists (
       select 1 from loyalty.entitlement_catalogue as item
       where item.catalogue_version = target_catalogue_version
     ) then
    raise exception using errcode = '22023', message = 'invalid deployment configuration';
  end if;
  insert into loyalty_private.deployment_configuration_versions (
    deployment_mode, catalogue_version, actor_reference, reason, effective_from
  ) values (
    target_mode, target_catalogue_version,
    btrim(target_actor_reference), btrim(target_reason), target_effective_from
  ) returning public_id into created_public_id;
  return created_public_id;
end;
$$;

create or replace function loyalty_private.set_organization_entitlement(
  target_organization_public_id uuid,
  target_capability_key text,
  target_state text,
  target_limit_value bigint,
  target_source text,
  target_actor_reference text,
  target_reason text,
  target_effective_from timestamptz default now(),
  target_effective_until timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id bigint;
  config loyalty_private.deployment_configuration_versions%rowtype;
  target_protected boolean;
  created_public_id uuid;
begin
  select organization.id into target_organization_id
  from loyalty.organizations as organization
  where organization.public_id = target_organization_public_id;
  select configuration.* into strict config
  from loyalty_private.deployment_configuration_versions as configuration
  where configuration.effective_from <= target_effective_from
  order by configuration.effective_from desc, configuration.id desc
  limit 1;
  select item.protected_value_path into target_protected
  from loyalty.entitlement_catalogue as item
  where item.catalogue_version = config.catalogue_version
    and item.capability_key = target_capability_key;
  if target_organization_id is null or target_protected is null then
    raise exception using errcode = '22023', message = 'unknown entitlement scope';
  end if;
  if target_protected and target_state = 'disabled' then
    raise exception using errcode = '22023', message = 'protected value path cannot be disabled';
  end if;
  insert into loyalty.organization_entitlements (
    organization_id, catalogue_version, capability_key, state, limit_value,
    source, actor_reference, reason, effective_from, effective_until
  ) values (
    target_organization_id, config.catalogue_version, target_capability_key,
    target_state, target_limit_value, target_source,
    btrim(target_actor_reference), btrim(target_reason),
    target_effective_from, target_effective_until
  ) returning public_id into created_public_id;
  return created_public_id;
end;
$$;

create or replace function loyalty_private.set_capability_rollout(
  target_capability_key text,
  target_basis_points integer,
  target_rollout_seed uuid,
  target_actor_reference text,
  target_reason text,
  target_effective_from timestamptz default now(),
  target_effective_until timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  config loyalty_private.deployment_configuration_versions%rowtype;
  target_protected boolean;
  created_public_id uuid;
begin
  select configuration.* into strict config
  from loyalty_private.deployment_configuration_versions as configuration
  where configuration.effective_from <= target_effective_from
  order by configuration.effective_from desc, configuration.id desc
  limit 1;
  select item.protected_value_path into target_protected
  from loyalty.entitlement_catalogue as item
  where item.catalogue_version = config.catalogue_version
    and item.capability_key = target_capability_key;
  if target_protected is null or target_basis_points not between 0 and 10000 then
    raise exception using errcode = '22023', message = 'invalid capability rollout';
  end if;
  if target_protected and target_basis_points < 10000 then
    raise exception using errcode = '22023', message = 'protected value path cannot be rolled back';
  end if;
  insert into loyalty_private.capability_rollout_versions (
    catalogue_version, capability_key, basis_points, rollout_seed,
    actor_reference, reason, effective_from, effective_until
  ) values (
    config.catalogue_version, target_capability_key, target_basis_points,
    target_rollout_seed, btrim(target_actor_reference), btrim(target_reason),
    target_effective_from, target_effective_until
  ) returning public_id into created_public_id;
  return created_public_id;
end;
$$;

create or replace function loyalty_private.set_entitlement_provider_price(
  target_capability_key text,
  target_provider text,
  target_provider_price_id text,
  target_actor_reference text,
  target_reason text,
  target_effective_from timestamptz default now(),
  target_effective_until timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  config loyalty_private.deployment_configuration_versions%rowtype;
  created_public_id uuid;
begin
  select configuration.* into strict config
  from loyalty_private.deployment_configuration_versions as configuration
  where configuration.effective_from <= target_effective_from
  order by configuration.effective_from desc, configuration.id desc
  limit 1;
  insert into loyalty_private.entitlement_provider_price_versions (
    catalogue_version, capability_key, provider, provider_price_id,
    actor_reference, reason, effective_from, effective_until
  ) values (
    config.catalogue_version, target_capability_key, target_provider,
    btrim(target_provider_price_id), btrim(target_actor_reference),
    btrim(target_reason), target_effective_from, target_effective_until
  ) returning public_id into created_public_id;
  return created_public_id;
end;
$$;

alter function loyalty_private.entitlement_rollout_bucket(uuid, text) owner to loyalty_owner;
alter function loyalty_private.resolve_organization_entitlement(bigint, text, text, timestamptz) owner to loyalty_owner;
alter function loyalty.get_my_entitlements_v1(uuid, timestamptz) owner to loyalty_owner;
alter function loyalty_private.set_deployment_mode(text, integer, text, text, timestamptz) owner to loyalty_owner;
alter function loyalty_private.set_organization_entitlement(uuid, text, text, bigint, text, text, text, timestamptz, timestamptz) owner to loyalty_owner;
alter function loyalty_private.set_capability_rollout(text, integer, uuid, text, text, timestamptz, timestamptz) owner to loyalty_owner;
alter function loyalty_private.set_entitlement_provider_price(text, text, text, text, text, timestamptz, timestamptz) owner to loyalty_owner;

alter table loyalty.entitlement_catalogue enable row level security;
alter table loyalty.organization_entitlements enable row level security;
alter table loyalty_private.deployment_configuration_versions enable row level security;
alter table loyalty_private.capability_rollout_versions enable row level security;
alter table loyalty_private.entitlement_provider_price_versions enable row level security;

create policy entitlement_catalogue_authenticated_select
  on loyalty.entitlement_catalogue for select to authenticated using (true);
create policy organization_entitlements_member_select
  on loyalty.organization_entitlements for select to authenticated
  using ((select loyalty_private.is_organization_member(organization_id)));

revoke all on loyalty.entitlement_catalogue, loyalty.organization_entitlements
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on loyalty_private.deployment_configuration_versions,
  loyalty_private.capability_rollout_versions,
  loyalty_private.entitlement_provider_price_versions
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant select on loyalty.entitlement_catalogue, loyalty.organization_entitlements
  to authenticated;

revoke all on function loyalty.get_my_entitlements_v1(uuid, timestamptz),
  loyalty_private.entitlement_rollout_bucket(uuid, text),
  loyalty_private.resolve_organization_entitlement(bigint, text, text, timestamptz),
  loyalty_private.set_deployment_mode(text, integer, text, text, timestamptz),
  loyalty_private.set_organization_entitlement(uuid, text, text, bigint, text, text, text, timestamptz, timestamptz),
  loyalty_private.set_capability_rollout(text, integer, uuid, text, text, timestamptz, timestamptz),
  loyalty_private.set_entitlement_provider_price(text, text, text, text, text, timestamptz, timestamptz)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty.get_my_entitlements_v1(uuid, timestamptz)
  to authenticated;
grant execute on function loyalty_private.resolve_organization_entitlement(bigint, text, text, timestamptz)
  to loyalty_runtime, loyalty_worker;

comment on table loyalty.entitlement_catalogue is
  'Versioned capability definitions; provider price IDs are deliberately private and externally configured.';
comment on table loyalty.organization_entitlements is
  'Append-only tenant entitlement evidence; direct browser writes are prohibited.';
comment on function loyalty.get_my_entitlements_v1(uuid, timestamptz) is
  'Returns a minimized effective entitlement snapshot for a live organization member; Auth claims are not entitlement authority.';
comment on function loyalty_private.resolve_organization_entitlement(bigint, text, text, timestamptz) is
  'Database-authoritative feature decision with protected value paths, local self-hosted defaults, tenant overrides, and deterministic rollout.';
