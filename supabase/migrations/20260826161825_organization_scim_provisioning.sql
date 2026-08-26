-- M13-S04: tenant-scoped SCIM 2.0 provisioning.
-- Authentik's outbound SCIM externalId is correlated only with its hashed OIDC
-- subject. Email, username, group names, claims, and browser selectors are
-- deliberately excluded from membership authority.

create table loyalty.organization_scim_endpoints (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null
    references loyalty.organizations(id) on delete restrict,
  federation_source_id bigint not null,
  display_name text not null,
  status text not null default 'active'
    check (status in ('active', 'revoked')),
  lifecycle_revision bigint not null default 1 check (lifecycle_revision >= 1),
  credential_revision bigint not null default 1 check (credential_revision >= 1),
  credential_sha256 bytea not null unique
    check (octet_length(credential_sha256) = 32),
  rate_limit_per_minute integer not null default 300
    check (rate_limit_per_minute between 30 and 3000),
  quota_window_at timestamptz not null default date_trunc('minute', now()),
  quota_request_count integer not null default 0 check (quota_request_count >= 0),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  rotated_by_user_id uuid references auth.users(id) on delete restrict,
  revoked_by_user_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rotated_at timestamptz,
  revoked_at timestamptz,
  unique (organization_id, id),
  unique (organization_id, federation_source_id),
  foreign key (organization_id, federation_source_id)
    references loyalty.organization_federation_sources(organization_id, id)
    on delete restrict,
  check (
    display_name = btrim(display_name)
    and length(display_name) between 1 and 120
    and display_name !~ '[[:cntrl:]]'
  ),
  check (updated_at >= created_at),
  check (
    (status = 'active' and revoked_at is null and revoked_by_user_id is null)
    or (status = 'revoked' and revoked_at is not null and revoked_by_user_id is not null)
  ),
  check (
    (rotated_at is null and rotated_by_user_id is null and credential_revision = 1)
    or (rotated_at is not null and rotated_by_user_id is not null and credential_revision > 1)
  )
);

create index organization_scim_endpoint_tenant_idx
  on loyalty.organization_scim_endpoints (organization_id, created_at desc, id desc);

create table loyalty.organization_scim_users (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  endpoint_id bigint not null,
  external_id text not null,
  user_name text not null,
  display_name text,
  name_document jsonb,
  emails_document jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  lifecycle_revision bigint not null default 1 check (lifecycle_revision >= 1),
  representation_sha256 bytea not null check (octet_length(representation_sha256) = 32),
  bound_auth_user_id uuid references auth.users(id) on delete restrict,
  bound_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, id),
  unique (endpoint_id, external_id),
  unique (endpoint_id, user_name),
  foreign key (organization_id, endpoint_id)
    references loyalty.organization_scim_endpoints(organization_id, id)
    on delete restrict,
  check (
    external_id = btrim(external_id)
    and length(external_id) between 1 and 255
    and external_id !~ '[[:cntrl:]]'
  ),
  check (
    user_name = btrim(user_name)
    and length(user_name) between 1 and 320
    and user_name !~ '[[:cntrl:]]'
  ),
  check (
    display_name is null or (
      display_name = btrim(display_name)
      and length(display_name) between 1 and 200
      and display_name !~ '[[:cntrl:]]'
    )
  ),
  check (name_document is null or jsonb_typeof(name_document) = 'object'),
  check (jsonb_typeof(emails_document) = 'array' and jsonb_array_length(emails_document) <= 20),
  check (updated_at >= created_at),
  check ((bound_auth_user_id is null) = (bound_at is null)),
  check (deleted_at is null or (active = false and deleted_at >= created_at))
);

create unique index organization_scim_user_bound_subject_idx
  on loyalty.organization_scim_users (organization_id, bound_auth_user_id)
  where bound_auth_user_id is not null;
create index organization_scim_user_tenant_idx
  on loyalty.organization_scim_users (organization_id, endpoint_id, created_at, id);

create table loyalty.organization_scim_groups (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  endpoint_id bigint not null,
  external_id text not null,
  display_name text not null,
  mapped_role text check (
    mapped_role is null or mapped_role in ('admin', 'marketer', 'operator', 'analyst', 'auditor')
  ),
  mapped_by_user_id uuid references auth.users(id) on delete restrict,
  mapped_at timestamptz,
  lifecycle_revision bigint not null default 1 check (lifecycle_revision >= 1),
  representation_sha256 bytea not null check (octet_length(representation_sha256) = 32),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, id),
  unique (endpoint_id, external_id),
  foreign key (organization_id, endpoint_id)
    references loyalty.organization_scim_endpoints(organization_id, id)
    on delete restrict,
  check (
    external_id = btrim(external_id)
    and length(external_id) between 1 and 255
    and external_id !~ '[[:cntrl:]]'
  ),
  check (
    display_name = btrim(display_name)
    and length(display_name) between 1 and 200
    and display_name !~ '[[:cntrl:]]'
  ),
  check ((mapped_role is null) = (mapped_by_user_id is null)),
  check ((mapped_role is null) = (mapped_at is null)),
  check (updated_at >= created_at),
  check (deleted_at is null or deleted_at >= created_at)
);

create index organization_scim_group_tenant_idx
  on loyalty.organization_scim_groups (organization_id, endpoint_id, created_at, id);

create table loyalty.organization_scim_group_members (
  organization_id bigint not null,
  endpoint_id bigint not null,
  group_id bigint not null,
  user_id bigint not null,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id),
  foreign key (organization_id, endpoint_id)
    references loyalty.organization_scim_endpoints(organization_id, id)
    on delete restrict,
  foreign key (organization_id, group_id)
    references loyalty.organization_scim_groups(organization_id, id)
    on delete restrict,
  foreign key (organization_id, user_id)
    references loyalty.organization_scim_users(organization_id, id)
    on delete restrict
);

create index organization_scim_group_member_user_idx
  on loyalty.organization_scim_group_members (organization_id, endpoint_id, user_id, group_id);

alter table loyalty.organization_memberships
  add column scim_user_id bigint,
  add constraint organization_memberships_scim_user_key unique (scim_user_id),
  add constraint organization_memberships_scim_user_fkey
    foreign key (organization_id, scim_user_id)
    references loyalty.organization_scim_users(organization_id, id)
    on delete restrict;

create table loyalty.organization_scim_credential_revisions (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  endpoint_id bigint not null,
  revision bigint not null check (revision >= 1),
  action text not null check (action in ('create', 'rotate', 'revoke')),
  credential_sha256 bytea not null check (octet_length(credential_sha256) = 32),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  reason text,
  idempotency_key text not null,
  request_sha256 bytea not null check (octet_length(request_sha256) = 32),
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (endpoint_id, revision),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, endpoint_id)
    references loyalty.organization_scim_endpoints(organization_id, id)
    on delete restrict,
  check (reason is null or (reason = btrim(reason) and length(reason) between 8 and 500)),
  check (length(idempotency_key) between 1 and 255)
);

create table loyalty.organization_scim_audit_events (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  endpoint_id bigint not null,
  credential_revision bigint,
  actor_user_id uuid references auth.users(id) on delete restrict,
  action text not null check (action ~ '^scim\.[a-z_]{3,40}(\.[a-z_]{3,40})?$'),
  resource_type text not null check (resource_type in ('endpoint', 'user', 'group', 'membership')),
  resource_public_id uuid not null,
  resource_revision bigint not null check (resource_revision >= 1),
  outcome text not null check (outcome in ('created', 'updated', 'deleted', 'duplicate', 'linked', 'revoked')),
  request_sha256 bytea not null check (octet_length(request_sha256) = 32),
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, endpoint_id)
    references loyalty.organization_scim_endpoints(organization_id, id)
    on delete restrict,
  check ((credential_revision is null) <> (actor_user_id is null))
);

create index organization_scim_audit_tenant_idx
  on loyalty.organization_scim_audit_events (
    organization_id, endpoint_id, created_at desc, id desc
  );

alter table loyalty.organization_scim_endpoints owner to loyalty_owner;
alter table loyalty.organization_scim_users owner to loyalty_owner;
alter table loyalty.organization_scim_groups owner to loyalty_owner;
alter table loyalty.organization_scim_group_members owner to loyalty_owner;
alter table loyalty.organization_scim_credential_revisions owner to loyalty_owner;
alter table loyalty.organization_scim_audit_events owner to loyalty_owner;

alter table loyalty.organization_scim_endpoints enable row level security;
alter table loyalty.organization_scim_users enable row level security;
alter table loyalty.organization_scim_groups enable row level security;
alter table loyalty.organization_scim_group_members enable row level security;
alter table loyalty.organization_scim_credential_revisions enable row level security;
alter table loyalty.organization_scim_audit_events enable row level security;

revoke all on loyalty.organization_scim_endpoints,
  loyalty.organization_scim_users,
  loyalty.organization_scim_groups,
  loyalty.organization_scim_group_members,
  loyalty.organization_scim_credential_revisions,
  loyalty.organization_scim_audit_events
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

create trigger organization_scim_credential_revisions_immutable
before update or delete on loyalty.organization_scim_credential_revisions
for each row execute function loyalty_private.reject_immutable_change();

create trigger organization_scim_audit_events_immutable
before update or delete on loyalty.organization_scim_audit_events
for each row execute function loyalty_private.reject_immutable_change();

create or replace function loyalty_private.organization_scim_user_document_v1(
  target_user_id bigint
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', scim_user.public_id,
    'externalId', scim_user.external_id,
    'userName', scim_user.user_name,
    'displayName', scim_user.display_name,
    'name', scim_user.name_document,
    'emails', scim_user.emails_document,
    'active', scim_user.active,
    'createdAt', scim_user.created_at,
    'updatedAt', scim_user.updated_at,
    'revision', scim_user.lifecycle_revision
  ))
  from loyalty.organization_scim_users as scim_user
  where scim_user.id = target_user_id and scim_user.deleted_at is null;
$$;

create or replace function loyalty_private.organization_scim_group_document_v1(
  target_group_id bigint
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', scim_group.public_id,
    'externalId', scim_group.external_id,
    'displayName', scim_group.display_name,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('value', scim_user.public_id)
        order by scim_user.public_id)
      from loyalty.organization_scim_group_members as group_member
      join loyalty.organization_scim_users as scim_user
        on scim_user.organization_id = group_member.organization_id
       and scim_user.id = group_member.user_id
      where group_member.organization_id = scim_group.organization_id
        and group_member.group_id = scim_group.id
        and scim_user.deleted_at is null
    ), '[]'::jsonb),
    'createdAt', scim_group.created_at,
    'updatedAt', scim_group.updated_at,
    'revision', scim_group.lifecycle_revision
  )
  from loyalty.organization_scim_groups as scim_group
  where scim_group.id = target_group_id and scim_group.deleted_at is null;
$$;

-- This narrow bridge deliberately retains migration-administrator ownership.
-- It exposes only the exact provider subject for the current Auth UUID and is
-- callable only by the NOLOGIN loyalty function owner.
create or replace function loyalty_private.resolve_scim_provider_subject_v1(
  target_auth_user_id uuid,
  target_provider text
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select identity.provider_id
  from auth.identities as identity
  where identity.user_id = target_auth_user_id
    and identity.provider = target_provider
    and identity.provider_id is not null
    and length(identity.provider_id) between 1 and 255
    and identity.provider_id !~ '[[:cntrl:]]'
  order by identity.created_at, identity.id
  limit 1;
$$;

revoke all on function loyalty_private.resolve_scim_provider_subject_v1(uuid, text)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty_private.resolve_scim_provider_subject_v1(uuid, text)
  to loyalty_owner;

create or replace function loyalty_private.reconcile_organization_scim_user_v1(
  target_scim_user_id bigint,
  target_now timestamptz default statement_timestamp()
)
returns table (outcome text, resolved_role text, membership_revision bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  scim_user_row loyalty.organization_scim_users%rowtype;
  endpoint_row loyalty.organization_scim_endpoints%rowtype;
  membership_row loyalty.organization_memberships%rowtype;
  role_values text[];
  next_role text;
begin
  select scim_user.* into scim_user_row
  from loyalty.organization_scim_users as scim_user
  where scim_user.id = target_scim_user_id
  for update;
  if scim_user_row.id is null or scim_user_row.bound_auth_user_id is null then
    return query select 'unbound'::text, null::text, null::bigint;
    return;
  end if;

  select endpoint.* into endpoint_row
  from loyalty.organization_scim_endpoints as endpoint
  where endpoint.id = scim_user_row.endpoint_id
  for update;

  select coalesce(array_agg(distinct scim_group.mapped_role order by scim_group.mapped_role)
    filter (where scim_group.mapped_role is not null), array[]::text[])
  into role_values
  from loyalty.organization_scim_group_members as group_member
  join loyalty.organization_scim_groups as scim_group
    on scim_group.organization_id = group_member.organization_id
   and scim_group.id = group_member.group_id
  where group_member.organization_id = scim_user_row.organization_id
    and group_member.endpoint_id = scim_user_row.endpoint_id
    and group_member.user_id = scim_user_row.id
    and scim_group.deleted_at is null;

  select membership.* into membership_row
  from loyalty.organization_memberships as membership
  where membership.organization_id = scim_user_row.organization_id
    and membership.user_id = scim_user_row.bound_auth_user_id
  for update;

  if membership_row.id is not null
     and membership_row.scim_user_id is distinct from scim_user_row.id then
    return query select 'manual_membership'::text, membership_row.role,
      membership_row.lifecycle_revision;
    return;
  end if;

  if endpoint_row.status <> 'active'
     or scim_user_row.deleted_at is not null
     or not scim_user_row.active
     or cardinality(role_values) <> 1 then
    if membership_row.id is not null and membership_row.revoked_at is null then
      update loyalty.organization_memberships as current_membership
      set revoked_at = target_now,
        lifecycle_revision = current_membership.lifecycle_revision + 1,
        updated_at = target_now
      where current_membership.id = membership_row.id
      returning * into membership_row;
    end if;
    return query select case
        when cardinality(role_values) > 1 then 'role_conflict'
        else 'revoked'
      end,
      null::text,
      membership_row.lifecycle_revision;
    return;
  end if;

  next_role := role_values[1];
  if membership_row.id is null then
    insert into loyalty.organization_memberships (
      organization_id, user_id, role, display_label, scim_user_id
    ) values (
      scim_user_row.organization_id, scim_user_row.bound_auth_user_id,
      next_role, coalesce(scim_user_row.display_name, scim_user_row.user_name),
      scim_user_row.id
    )
    returning * into membership_row;
    return query select 'created'::text, next_role,
      membership_row.lifecycle_revision;
    return;
  end if;

  if membership_row.role is distinct from next_role
     or membership_row.revoked_at is not null
     or membership_row.display_label is distinct from
        coalesce(scim_user_row.display_name, scim_user_row.user_name) then
    update loyalty.organization_memberships as current_membership
    set role = next_role,
      display_label = coalesce(scim_user_row.display_name, scim_user_row.user_name),
      revoked_at = null,
      lifecycle_revision = current_membership.lifecycle_revision + 1,
      updated_at = target_now
    where current_membership.id = membership_row.id
    returning * into membership_row;
    return query select 'updated'::text, next_role,
      membership_row.lifecycle_revision;
    return;
  end if;

  return query select 'unchanged'::text, next_role,
    membership_row.lifecycle_revision;
end;
$$;

create or replace function loyalty.create_organization_scim_endpoint_command_v1(
  target_organization_public_id uuid,
  target_federation_source_public_id uuid,
  target_display_name text,
  target_credential_sha256 bytea,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (
  endpoint_public_id uuid,
  outcome text,
  lifecycle_revision bigint,
  credential_revision bigint
)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  request_actor uuid := loyalty_private.request_user_id();
  organization_row loyalty.organizations%rowtype;
  source_row loyalty.organization_federation_sources%rowtype;
  endpoint_row loyalty.organization_scim_endpoints%rowtype;
  credential_row loyalty.organization_scim_credential_revisions%rowtype;
  request_hash bytea;
begin
  if request_actor is null
     or target_organization_public_id is null
     or target_federation_source_public_id is null
     or target_display_name is null
     or target_display_name <> btrim(target_display_name)
     or length(target_display_name) not between 1 and 120
     or target_display_name ~ '[[:cntrl:]]'
     or target_credential_sha256 is null
     or octet_length(target_credential_sha256) <> 32
     or target_idempotency_key is null
     or length(target_idempotency_key) not between 1 and 255
     or target_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid SCIM endpoint command';
  end if;
  request_hash := extensions.digest(convert_to(concat_ws('|',
    target_organization_public_id::text,
    target_federation_source_public_id::text,
    target_display_name,
    encode(target_credential_sha256, 'hex')
  ), 'utf8'), 'sha256');

  select organization.* into organization_row
  from loyalty.organizations as organization
  where organization.public_id = target_organization_public_id
  for update;
  if organization_row.id is null
     or organization_row.status <> 'active'
     or organization_row.offboarded_at is not null
     or not loyalty_private.has_organization_role(
       organization_row.id, array['owner', 'admin']::text[]
     ) then
    raise exception using errcode = '42501', message = 'SCIM endpoint command not authorized';
  end if;

  select revision.* into credential_row
  from loyalty.organization_scim_credential_revisions as revision
  where revision.organization_id = organization_row.id
    and revision.idempotency_key = target_idempotency_key;
  if credential_row.id is not null then
    if credential_row.action <> 'create'
       or credential_row.request_sha256 <> request_hash then
      raise exception using errcode = '23514', message = 'SCIM endpoint idempotency conflict';
    end if;
    select endpoint.* into endpoint_row
    from loyalty.organization_scim_endpoints as endpoint
    where endpoint.organization_id = organization_row.id
      and endpoint.id = credential_row.endpoint_id;
    return query select endpoint_row.public_id, 'duplicate'::text,
      endpoint_row.lifecycle_revision, endpoint_row.credential_revision;
    return;
  end if;

  select source.* into source_row
  from loyalty.organization_federation_sources as source
  where source.organization_id = organization_row.id
    and source.public_id = target_federation_source_public_id;
  if source_row.id is null
     or source_row.status not in ('validated', 'enabled', 'disabled')
     or source_row.validated_at is null
     or source_row.pending_action is not null then
    raise exception using errcode = '23514', message = 'SCIM federation source unavailable';
  end if;
  if not loyalty_private.organization_federation_entitlement_enabled_v1(
    organization_row.id
  ) then
    raise exception using errcode = '42501', message = 'SCIM entitlement unavailable';
  end if;

  insert into loyalty.organization_scim_endpoints (
    organization_id, federation_source_id, display_name, credential_sha256,
    created_by_user_id
  ) values (
    organization_row.id, source_row.id, target_display_name,
    target_credential_sha256, request_actor
  ) returning * into endpoint_row;

  insert into loyalty.organization_scim_credential_revisions (
    organization_id, endpoint_id, revision, action, credential_sha256,
    actor_user_id, reason, idempotency_key, request_sha256, correlation_id
  ) values (
    organization_row.id, endpoint_row.id, 1, 'create', target_credential_sha256,
    request_actor, null, target_idempotency_key, request_hash,
    target_correlation_id
  );
  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id,
    metadata
  ) values (
    organization_row.id, request_actor, 'scim.endpoint.create',
    'organization_scim_endpoint', endpoint_row.public_id,
    target_idempotency_key, request_hash, target_correlation_id,
    jsonb_build_object(
      'federationSourceId', source_row.public_id,
      'credentialRevision', endpoint_row.credential_revision,
      'status', endpoint_row.status
    )
  );

  return query select endpoint_row.public_id, 'created'::text,
    endpoint_row.lifecycle_revision, endpoint_row.credential_revision;
end;
$$;

create or replace function loyalty.update_organization_scim_endpoint_command_v1(
  target_organization_public_id uuid,
  target_endpoint_public_id uuid,
  target_expected_revision bigint,
  target_action text,
  target_credential_sha256 bytea,
  target_reason text,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (
  endpoint_public_id uuid,
  outcome text,
  lifecycle_revision bigint,
  credential_revision bigint,
  status text
)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  request_actor uuid := loyalty_private.request_user_id();
  changed_at timestamptz := statement_timestamp();
  organization_row loyalty.organizations%rowtype;
  endpoint_row loyalty.organization_scim_endpoints%rowtype;
  credential_row loyalty.organization_scim_credential_revisions%rowtype;
  request_hash bytea;
begin
  if request_actor is null
     or target_organization_public_id is null
     or target_endpoint_public_id is null
     or target_expected_revision is null or target_expected_revision < 1
     or target_action not in ('rotate', 'revoke')
     or (target_action = 'rotate') <> (target_credential_sha256 is not null)
     or (target_credential_sha256 is not null and octet_length(target_credential_sha256) <> 32)
     or target_reason is null or target_reason <> btrim(target_reason)
     or length(target_reason) not between 8 and 500
     or target_idempotency_key is null
     or length(target_idempotency_key) not between 1 and 255
     or target_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid SCIM endpoint lifecycle command';
  end if;
  request_hash := extensions.digest(convert_to(concat_ws('|',
    target_organization_public_id::text, target_endpoint_public_id::text,
    target_expected_revision::text, target_action,
    coalesce(encode(target_credential_sha256, 'hex'), ''), target_reason
  ), 'utf8'), 'sha256');

  select organization.* into organization_row
  from loyalty.organizations as organization
  where organization.public_id = target_organization_public_id
  for update;
  if organization_row.id is null
     or organization_row.status <> 'active'
     or organization_row.offboarded_at is not null
     or not loyalty_private.has_organization_role(
       organization_row.id, array['owner', 'admin']::text[]
     ) then
    raise exception using errcode = '42501', message = 'SCIM endpoint lifecycle not authorized';
  end if;

  select revision.* into credential_row
  from loyalty.organization_scim_credential_revisions as revision
  where revision.organization_id = organization_row.id
    and revision.idempotency_key = target_idempotency_key;
  if credential_row.id is not null then
    if credential_row.action <> target_action
       or credential_row.request_sha256 <> request_hash then
      raise exception using errcode = '23514', message = 'SCIM endpoint idempotency conflict';
    end if;
    select endpoint.* into endpoint_row
    from loyalty.organization_scim_endpoints as endpoint
    where endpoint.organization_id = organization_row.id
      and endpoint.id = credential_row.endpoint_id;
    return query select endpoint_row.public_id, 'duplicate'::text,
      endpoint_row.lifecycle_revision, endpoint_row.credential_revision,
      endpoint_row.status;
    return;
  end if;

  select endpoint.* into endpoint_row
  from loyalty.organization_scim_endpoints as endpoint
  where endpoint.organization_id = organization_row.id
    and endpoint.public_id = target_endpoint_public_id
  for update;
  if endpoint_row.id is null or endpoint_row.status <> 'active' then
    raise exception using errcode = '23514', message = 'SCIM endpoint unavailable';
  end if;
  if endpoint_row.lifecycle_revision <> target_expected_revision then
    raise exception using errcode = '40001', message = 'SCIM endpoint revision conflict';
  end if;
  if target_action = 'rotate'
     and target_credential_sha256 = endpoint_row.credential_sha256 then
    raise exception using errcode = '23514', message = 'SCIM credential must change';
  end if;
  if target_action = 'rotate'
     and not loyalty_private.organization_federation_entitlement_enabled_v1(
       organization_row.id
     ) then
    raise exception using errcode = '42501', message = 'SCIM entitlement unavailable';
  end if;

  if target_action = 'rotate' then
    update loyalty.organization_scim_endpoints as current_endpoint
    set credential_sha256 = target_credential_sha256,
      credential_revision = current_endpoint.credential_revision + 1,
      lifecycle_revision = current_endpoint.lifecycle_revision + 1,
      rotated_by_user_id = request_actor,
      rotated_at = changed_at,
      updated_at = changed_at
    where current_endpoint.id = endpoint_row.id
    returning * into endpoint_row;
  else
    update loyalty.organization_scim_endpoints as current_endpoint
    set status = 'revoked',
      lifecycle_revision = current_endpoint.lifecycle_revision + 1,
      revoked_by_user_id = request_actor, revoked_at = changed_at,
      updated_at = changed_at
    where current_endpoint.id = endpoint_row.id
    returning * into endpoint_row;

    update loyalty.organization_memberships as membership
    set revoked_at = changed_at,
      lifecycle_revision = membership.lifecycle_revision + 1,
      updated_at = changed_at
    where membership.organization_id = organization_row.id
      and membership.scim_user_id in (
        select scim_user.id
        from loyalty.organization_scim_users as scim_user
        where scim_user.endpoint_id = endpoint_row.id
      )
      and membership.revoked_at is null;
  end if;

  insert into loyalty.organization_scim_credential_revisions (
    organization_id, endpoint_id, revision, action, credential_sha256,
    actor_user_id, reason, idempotency_key, request_sha256, correlation_id
  ) values (
    organization_row.id, endpoint_row.id, endpoint_row.lifecycle_revision,
    target_action, endpoint_row.credential_sha256, request_actor, target_reason,
    target_idempotency_key, request_hash, target_correlation_id
  );
  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id,
    metadata
  ) values (
    organization_row.id, request_actor, 'scim.endpoint.' || target_action,
    'organization_scim_endpoint', endpoint_row.public_id,
    target_idempotency_key, request_hash, target_correlation_id,
    jsonb_build_object(
      'credentialRevision', endpoint_row.credential_revision,
      'status', endpoint_row.status, 'reason', target_reason
    )
  );

  return query select endpoint_row.public_id, target_action,
    endpoint_row.lifecycle_revision, endpoint_row.credential_revision,
    endpoint_row.status;
end;
$$;

create or replace function loyalty.map_organization_scim_group_role_command_v1(
  target_organization_public_id uuid,
  target_endpoint_public_id uuid,
  target_group_public_id uuid,
  target_expected_revision bigint,
  target_role text,
  target_reason text,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (group_public_id uuid, outcome text, lifecycle_revision bigint, mapped_role text)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  request_actor uuid := loyalty_private.request_user_id();
  changed_at timestamptz := statement_timestamp();
  organization_row loyalty.organizations%rowtype;
  endpoint_row loyalty.organization_scim_endpoints%rowtype;
  group_row loyalty.organization_scim_groups%rowtype;
  existing_audit loyalty.admin_audit_events%rowtype;
  member_row record;
  request_hash bytea;
begin
  if request_actor is null
     or target_organization_public_id is null
     or target_endpoint_public_id is null
     or target_group_public_id is null
     or target_expected_revision is null or target_expected_revision < 1
     or (target_role is not null and target_role not in (
       'admin', 'marketer', 'operator', 'analyst', 'auditor'
     ))
     or target_reason is null or target_reason <> btrim(target_reason)
     or length(target_reason) not between 8 and 500
     or target_idempotency_key is null
     or length(target_idempotency_key) not between 1 and 255
     or target_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid SCIM group role command';
  end if;
  request_hash := extensions.digest(convert_to(concat_ws('|',
    target_organization_public_id::text, target_endpoint_public_id::text,
    target_group_public_id::text, target_expected_revision::text,
    coalesce(target_role, ''), target_reason
  ), 'utf8'), 'sha256');

  select organization.* into organization_row
  from loyalty.organizations as organization
  where organization.public_id = target_organization_public_id
  for update;
  if organization_row.id is null
     or organization_row.status <> 'active'
     or organization_row.offboarded_at is not null
     or not loyalty_private.has_organization_role(
       organization_row.id, array['owner', 'admin']::text[]
     ) then
    raise exception using errcode = '42501', message = 'SCIM group role not authorized';
  end if;
  select audit.* into existing_audit
  from loyalty.admin_audit_events as audit
  where audit.organization_id = organization_row.id
    and audit.idempotency_key = target_idempotency_key;
  if existing_audit.id is not null then
    if existing_audit.action <> 'scim.group.map_role'
       or existing_audit.request_sha256 <> request_hash
       or existing_audit.resource_public_id <> target_group_public_id then
      raise exception using errcode = '23514', message = 'SCIM group role idempotency conflict';
    end if;
    select scim_group.* into group_row
    from loyalty.organization_scim_groups as scim_group
    where scim_group.organization_id = organization_row.id
      and scim_group.public_id = target_group_public_id;
    return query select group_row.public_id, 'duplicate'::text,
      group_row.lifecycle_revision, group_row.mapped_role;
    return;
  end if;

  select endpoint.* into endpoint_row
  from loyalty.organization_scim_endpoints as endpoint
  where endpoint.organization_id = organization_row.id
    and endpoint.public_id = target_endpoint_public_id
    and endpoint.status = 'active'
  for update;
  select scim_group.* into group_row
  from loyalty.organization_scim_groups as scim_group
  where scim_group.organization_id = organization_row.id
    and scim_group.endpoint_id = endpoint_row.id
    and scim_group.public_id = target_group_public_id
    and scim_group.deleted_at is null
  for update;
  if endpoint_row.id is null or group_row.id is null then
    raise exception using errcode = '42501', message = 'SCIM group role not authorized';
  end if;
  if group_row.lifecycle_revision <> target_expected_revision then
    raise exception using errcode = '40001', message = 'SCIM group revision conflict';
  end if;

  update loyalty.organization_scim_groups as current_group
  set mapped_role = target_role,
    mapped_by_user_id = case when target_role is null then null else request_actor end,
    mapped_at = case when target_role is null then null else changed_at end,
    lifecycle_revision = current_group.lifecycle_revision + 1,
    updated_at = changed_at
  where current_group.id = group_row.id
  returning * into group_row;

  for member_row in
    select group_member.user_id
    from loyalty.organization_scim_group_members as group_member
    where group_member.organization_id = organization_row.id
      and group_member.group_id = group_row.id
    order by group_member.user_id
  loop
    perform * from loyalty_private.reconcile_organization_scim_user_v1(
      member_row.user_id, changed_at
    );
  end loop;

  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id,
    metadata
  ) values (
    organization_row.id, request_actor, 'scim.group.map_role',
    'organization_scim_group', group_row.public_id,
    target_idempotency_key, request_hash, target_correlation_id,
    jsonb_build_object(
      'mappedRole', group_row.mapped_role,
      'groupRevision', group_row.lifecycle_revision,
      'reason', target_reason
    )
  );

  return query select group_row.public_id, 'updated'::text,
    group_row.lifecycle_revision, group_row.mapped_role;
end;
$$;

create or replace function loyalty.claim_organization_scim_membership_v1(
  target_organization_public_id uuid,
  target_correlation_id uuid
)
returns table (outcome text, role text, membership_revision bigint)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  request_actor uuid := loyalty_private.request_user_id();
  linked_at timestamptz := statement_timestamp();
  organization_row loyalty.organizations%rowtype;
  source_row loyalty.organization_federation_sources%rowtype;
  endpoint_row loyalty.organization_scim_endpoints%rowtype;
  scim_user_row loyalty.organization_scim_users%rowtype;
  membership_row loyalty.organization_memberships%rowtype;
  provider_subject text;
  reconciliation record;
  request_hash bytea;
begin
  if request_actor is null or target_organization_public_id is null
     or target_correlation_id is null then
    return query select 'unavailable'::text, null::text, null::bigint;
    return;
  end if;
  select organization.* into organization_row
  from loyalty.organizations as organization
  where organization.public_id = target_organization_public_id
    and organization.status = 'active'
    and organization.offboarded_at is null
  for update;
  if organization_row.id is null then
    return query select 'unavailable'::text, null::text, null::bigint;
    return;
  end if;
  select source.* into source_row
  from loyalty.organization_federation_sources as source
  where source.organization_id = organization_row.id
    and source.status = 'enabled'
    and source.pending_action is null;
  if source_row.id is null then
    return query select 'unavailable'::text, null::text, null::bigint;
    return;
  end if;
  provider_subject := loyalty_private.resolve_scim_provider_subject_v1(
    request_actor, source_row.supabase_provider_identifier
  );
  if provider_subject is null then
    return query select 'unavailable'::text, null::text, null::bigint;
    return;
  end if;
  select membership.* into membership_row
  from loyalty.organization_memberships as membership
  where membership.organization_id = organization_row.id
    and membership.user_id = request_actor
  for update;
  if membership_row.id is not null and membership_row.scim_user_id is null then
    if membership_row.revoked_at is null then
      return query select 'manual_membership'::text, membership_row.role,
        membership_row.lifecycle_revision;
    else
      return query select 'unavailable'::text, null::text,
        membership_row.lifecycle_revision;
    end if;
    return;
  end if;
  select endpoint.* into endpoint_row
  from loyalty.organization_scim_endpoints as endpoint
  where endpoint.organization_id = organization_row.id
    and endpoint.federation_source_id = source_row.id
    and endpoint.status = 'active'
  for update;
  select scim_user.* into scim_user_row
  from loyalty.organization_scim_users as scim_user
  where scim_user.organization_id = organization_row.id
    and scim_user.endpoint_id = endpoint_row.id
    and scim_user.external_id = provider_subject
    and scim_user.active
    and scim_user.deleted_at is null
  for update;
  if endpoint_row.id is null or scim_user_row.id is null then
    return query select 'unavailable'::text, null::text, null::bigint;
    return;
  end if;

  if membership_row.id is not null
     and membership_row.scim_user_id is distinct from scim_user_row.id then
    return query select 'unavailable'::text, null::text,
      membership_row.lifecycle_revision;
    return;
  end if;
  if scim_user_row.bound_auth_user_id is not null
     and scim_user_row.bound_auth_user_id <> request_actor then
    return query select 'unavailable'::text, null::text, null::bigint;
    return;
  end if;

  if scim_user_row.bound_auth_user_id is null then
    update loyalty.organization_scim_users as current_scim_user
    set bound_auth_user_id = request_actor, bound_at = linked_at,
      lifecycle_revision = current_scim_user.lifecycle_revision + 1,
      updated_at = linked_at
    where current_scim_user.id = scim_user_row.id
    returning * into scim_user_row;
  end if;
  select * into reconciliation
  from loyalty_private.reconcile_organization_scim_user_v1(
    scim_user_row.id, linked_at
  );
  if reconciliation.outcome not in ('created', 'updated', 'unchanged') then
    return query select reconciliation.outcome, null::text,
      reconciliation.membership_revision;
    return;
  end if;

  request_hash := extensions.digest(convert_to(concat_ws('|',
    organization_row.public_id::text, scim_user_row.public_id::text,
    request_actor::text, reconciliation.resolved_role
  ), 'utf8'), 'sha256');
  insert into loyalty.organization_scim_audit_events (
    organization_id, endpoint_id, actor_user_id, action, resource_type,
    resource_public_id, resource_revision, outcome, request_sha256,
    correlation_id
  ) values (
    organization_row.id, endpoint_row.id, request_actor,
    'scim.membership.claim', 'membership', scim_user_row.public_id,
    scim_user_row.lifecycle_revision,
    case when reconciliation.outcome = 'created' then 'linked' else 'updated' end,
    request_hash, target_correlation_id
  );
  return query select reconciliation.outcome,
    reconciliation.resolved_role, reconciliation.membership_revision;
end;
$$;

create or replace function loyalty_private.authorize_organization_scim_request_v1(
  target_endpoint_public_id uuid,
  target_credential_sha256 bytea
)
returns table (
  endpoint_id bigint,
  organization_id bigint,
  federation_source_id bigint,
  credential_revision bigint,
  quota_limit integer,
  quota_remaining integer,
  quota_reset_at timestamptz
)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '2s'
as $$
declare
  endpoint_row loyalty.organization_scim_endpoints%rowtype;
  current_window timestamptz := date_trunc('minute', statement_timestamp());
begin
  if target_endpoint_public_id is null or target_credential_sha256 is null
     or octet_length(target_credential_sha256) <> 32 then
    raise exception using errcode = '28000', message = 'invalid SCIM credential';
  end if;
  select endpoint.* into endpoint_row
  from loyalty.organization_scim_endpoints as endpoint
  where endpoint.public_id = target_endpoint_public_id
  for update;
  if endpoint_row.id is null or endpoint_row.status <> 'active'
     or endpoint_row.credential_sha256 <> target_credential_sha256 then
    raise exception using errcode = '28000', message = 'invalid SCIM credential';
  end if;
  if endpoint_row.quota_window_at <> current_window then
    endpoint_row.quota_window_at := current_window;
    endpoint_row.quota_request_count := 0;
  end if;
  if endpoint_row.quota_request_count >= endpoint_row.rate_limit_per_minute then
    raise exception using errcode = 'P0001', message = 'SCIM endpoint rate limit exceeded';
  end if;
  update loyalty.organization_scim_endpoints
  set quota_window_at = endpoint_row.quota_window_at,
    quota_request_count = endpoint_row.quota_request_count + 1
  where id = endpoint_row.id
  returning * into endpoint_row;

  return query select endpoint_row.id, endpoint_row.organization_id,
    endpoint_row.federation_source_id, endpoint_row.credential_revision,
    endpoint_row.rate_limit_per_minute,
    endpoint_row.rate_limit_per_minute - endpoint_row.quota_request_count,
    endpoint_row.quota_window_at + interval '1 minute';
end;
$$;

create or replace function loyalty_private.valid_scim_user_shape_v1(
  document jsonb
)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  candidate_key text;
  name_document jsonb;
  emails_document jsonb;
  email_document jsonb;
  text_value text;
  primary_count integer := 0;
begin
  if jsonb_typeof(document) <> 'object' then return false; end if;
  if exists (
    select 1 from jsonb_object_keys(document) as candidate(key)
    where candidate.key not in (
      'schemas', 'externalId', 'userName', 'displayName', 'name', 'emails', 'active'
    )
  ) then return false; end if;
  if jsonb_typeof(document->'schemas') <> 'array'
     or jsonb_array_length(document->'schemas') not between 1 and 10
     or exists (
       select 1 from jsonb_array_elements(document->'schemas') as schema_value(value)
       where jsonb_typeof(schema_value.value) <> 'string'
     ) then return false; end if;
  if document ? 'active' and jsonb_typeof(document->'active') <> 'boolean' then
    return false;
  end if;

  name_document := document->'name';
  if name_document is not null then
    if jsonb_typeof(name_document) <> 'object' then return false; end if;
    if exists (
      select 1 from jsonb_object_keys(name_document) as candidate(key)
      where candidate.key not in (
        'formatted', 'familyName', 'givenName', 'middleName',
        'honorificPrefix', 'honorificSuffix'
      )
    ) then return false; end if;
    for candidate_key in select jsonb_object_keys(name_document)
    loop
      if jsonb_typeof(name_document->candidate_key) <> 'string' then return false; end if;
      text_value := name_document->>candidate_key;
      if text_value <> btrim(text_value)
         or length(text_value) not between 1 and 200
         or text_value ~ '[[:cntrl:]]' then return false; end if;
    end loop;
  end if;

  emails_document := coalesce(document->'emails', '[]'::jsonb);
  if jsonb_typeof(emails_document) <> 'array'
     or jsonb_array_length(emails_document) > 20 then return false; end if;
  for email_document in select value from jsonb_array_elements(emails_document)
  loop
    if jsonb_typeof(email_document) <> 'object' then return false; end if;
    if exists (
      select 1 from jsonb_object_keys(email_document) as candidate(key)
      where candidate.key not in ('value', 'type', 'primary', 'display')
    ) then return false; end if;
    if jsonb_typeof(email_document->'value') <> 'string' then return false; end if;
    text_value := email_document->>'value';
    if text_value <> btrim(text_value)
       or length(text_value) not between 1 and 320
       or text_value ~ '[[:cntrl:]]' then return false; end if;
    if email_document ? 'type' and (
      jsonb_typeof(email_document->'type') <> 'string'
      or email_document->>'type' not in ('work', 'home', 'other')
    ) then return false; end if;
    if email_document ? 'primary' then
      if jsonb_typeof(email_document->'primary') <> 'boolean' then return false; end if;
      if (email_document->>'primary')::boolean then primary_count := primary_count + 1; end if;
    end if;
    if email_document ? 'display' then
      if jsonb_typeof(email_document->'display') <> 'string' then return false; end if;
      text_value := email_document->>'display';
      if text_value <> btrim(text_value)
         or length(text_value) not between 1 and 200
         or text_value ~ '[[:cntrl:]]' then return false; end if;
    end if;
  end loop;
  return primary_count <= 1;
exception when others then
  return false;
end;
$$;

create or replace function loyalty_private.valid_scim_group_shape_v1(
  document jsonb
)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  member_document jsonb;
begin
  if jsonb_typeof(document) <> 'object' then return false; end if;
  if exists (
    select 1 from jsonb_object_keys(document) as candidate(key)
    where candidate.key not in ('schemas', 'externalId', 'displayName', 'members')
  ) then return false; end if;
  if jsonb_typeof(document->'schemas') <> 'array'
     or jsonb_array_length(document->'schemas') not between 1 and 10
     or exists (
       select 1 from jsonb_array_elements(document->'schemas') as schema_value(value)
       where jsonb_typeof(schema_value.value) <> 'string'
     ) then return false; end if;
  if jsonb_typeof(coalesce(document->'members', '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(document->'members', '[]'::jsonb)) > 2000 then
    return false;
  end if;
  for member_document in
    select value from jsonb_array_elements(coalesce(document->'members', '[]'::jsonb))
  loop
    if jsonb_typeof(member_document) <> 'object'
       or jsonb_typeof(member_document->'value') <> 'string'
       or exists (
         select 1 from jsonb_object_keys(member_document) as candidate(key)
         where candidate.key <> 'value'
       ) then return false; end if;
  end loop;
  return true;
exception when others then
  return false;
end;
$$;

create or replace function loyalty_private.organization_scim_request_v1(
  target_endpoint_public_id uuid,
  target_credential_sha256 bytea,
  target_method text,
  target_resource_type text,
  target_resource_public_id uuid,
  target_filter_attribute text,
  target_filter_value text,
  target_start_index integer,
  target_count integer,
  target_body jsonb,
  target_if_match text,
  target_correlation_id uuid
)
returns table (
  http_status integer,
  response_document jsonb,
  response_etag text,
  quota_limit integer,
  quota_remaining integer,
  quota_reset_at timestamptz
)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '10s'
as $$
declare
  authorization_row record;
  changed_at timestamptz := statement_timestamp();
  request_hash bytea;
  user_row loyalty.organization_scim_users%rowtype;
  existing_user loyalty.organization_scim_users%rowtype;
  group_row loyalty.organization_scim_groups%rowtype;
  existing_group loyalty.organization_scim_groups%rowtype;
  operation jsonb;
  operation_name text;
  operation_path text;
  operation_value jsonb;
  current_document jsonb;
  normalized_body jsonb;
  new_external_id text;
  new_user_name text;
  new_display_name text;
  new_name jsonb;
  new_emails jsonb;
  new_active boolean;
  member_value jsonb;
  member_public_id uuid;
  member_ids uuid[];
  removed_member_ids bigint[];
  affected_user record;
  reconciliation record;
  total_results integer;
  resources jsonb;
  result_status integer;
  result_outcome text;
  expected_etag text;
  path_match text[];
begin
  if target_method not in ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')
     or target_resource_type not in (
       'ServiceProviderConfig', 'ResourceTypes', 'Schemas', 'Users', 'Groups'
     )
     or target_start_index is null or target_start_index < 1
     or target_count is null or target_count not between 0 and 200
     or target_correlation_id is null
     or (target_filter_attribute is not null and target_filter_attribute not in (
       'id', 'externalId', 'userName', 'displayName'
     ))
     or (target_filter_attribute is null) <> (target_filter_value is null)
     or (target_filter_value is not null and length(target_filter_value) not between 1 and 320) then
    raise exception using errcode = '22023', message = 'invalid SCIM request';
  end if;
  select * into authorization_row
  from loyalty_private.authorize_organization_scim_request_v1(
    target_endpoint_public_id, target_credential_sha256
  );
  request_hash := extensions.digest(convert_to(concat_ws('|',
    target_method, target_resource_type,
    coalesce(target_resource_public_id::text, ''),
    coalesce(target_filter_attribute, ''), coalesce(target_filter_value, ''),
    coalesce(target_body::text, '')
  ), 'utf8'), 'sha256');

  if target_resource_type = 'ServiceProviderConfig' then
    if target_method <> 'GET' or target_resource_public_id is not null then
      raise exception using errcode = '22023', message = 'invalid SCIM discovery request';
    end if;
    return query select 200, jsonb_build_object(
      'schemas', jsonb_build_array('urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'),
      'documentationUri', 'https://docs.starfiniti.com/loyalty/scim',
      'patch', jsonb_build_object('supported', true),
      'bulk', jsonb_build_object('supported', false, 'maxOperations', 0, 'maxPayloadSize', 0),
      'filter', jsonb_build_object('supported', true, 'maxResults', 200),
      'changePassword', jsonb_build_object('supported', false),
      'sort', jsonb_build_object('supported', false),
      'etag', jsonb_build_object('supported', true),
      'authenticationSchemes', jsonb_build_array(jsonb_build_object(
        'type', 'oauthbearertoken', 'name', 'Bearer token',
        'description', 'One-time-issued organization-scoped static bearer token',
        'specUri', 'https://www.rfc-editor.org/rfc/rfc6750', 'primary', true
      ))
    ), null::text, authorization_row.quota_limit,
      authorization_row.quota_remaining, authorization_row.quota_reset_at;
    return;
  end if;

  if target_resource_type = 'ResourceTypes' then
    if target_method <> 'GET' then
      raise exception using errcode = '22023', message = 'invalid SCIM discovery request';
    end if;
    if target_resource_public_id is not null then
      raise exception using errcode = '22023', message = 'invalid SCIM resource type selector';
    end if;
    return query select 200, jsonb_build_object(
      'schemas', jsonb_build_array('urn:ietf:params:scim:api:messages:2.0:ListResponse'),
      'totalResults', 2, 'startIndex', 1, 'itemsPerPage', 2,
      'Resources', jsonb_build_array(
        jsonb_build_object(
          'schemas', jsonb_build_array('urn:ietf:params:scim:schemas:core:2.0:ResourceType'),
          'id', 'User', 'name', 'User', 'endpoint', '/Users',
          'schema', 'urn:ietf:params:scim:schemas:core:2.0:User'
        ),
        jsonb_build_object(
          'schemas', jsonb_build_array('urn:ietf:params:scim:schemas:core:2.0:ResourceType'),
          'id', 'Group', 'name', 'Group', 'endpoint', '/Groups',
          'schema', 'urn:ietf:params:scim:schemas:core:2.0:Group'
        )
      )
    ), null::text, authorization_row.quota_limit,
      authorization_row.quota_remaining, authorization_row.quota_reset_at;
    return;
  end if;

  if target_resource_type = 'Schemas' then
    if target_method <> 'GET' or target_resource_public_id is not null then
      raise exception using errcode = '22023', message = 'invalid SCIM schema request';
    end if;
    return query select 200, jsonb_build_object(
      'schemas', jsonb_build_array('urn:ietf:params:scim:api:messages:2.0:ListResponse'),
      'totalResults', 2, 'startIndex', 1, 'itemsPerPage', 2,
      'Resources', jsonb_build_array(
        jsonb_build_object(
          'schemas', jsonb_build_array('urn:ietf:params:scim:schemas:core:2.0:Schema'),
          'id', 'urn:ietf:params:scim:schemas:core:2.0:User',
          'name', 'User', 'description', 'Starfiniti Loyalty provisioned user',
          'attributes', jsonb_build_array(
            jsonb_build_object('name', 'userName', 'type', 'string', 'multiValued', false, 'required', true, 'uniqueness', 'server'),
            jsonb_build_object('name', 'externalId', 'type', 'string', 'multiValued', false, 'required', true, 'uniqueness', 'server'),
            jsonb_build_object('name', 'active', 'type', 'boolean', 'multiValued', false, 'required', true)
          )
        ),
        jsonb_build_object(
          'schemas', jsonb_build_array('urn:ietf:params:scim:schemas:core:2.0:Schema'),
          'id', 'urn:ietf:params:scim:schemas:core:2.0:Group',
          'name', 'Group', 'description', 'Starfiniti Loyalty provisioned group',
          'attributes', jsonb_build_array(
            jsonb_build_object('name', 'displayName', 'type', 'string', 'multiValued', false, 'required', true),
            jsonb_build_object('name', 'externalId', 'type', 'string', 'multiValued', false, 'required', true, 'uniqueness', 'server'),
            jsonb_build_object('name', 'members', 'type', 'complex', 'multiValued', true, 'required', false)
          )
        )
      )
    ), null::text, authorization_row.quota_limit,
      authorization_row.quota_remaining, authorization_row.quota_reset_at;
    return;
  end if;

  if target_method = 'GET' and target_resource_type = 'Users' then
    if target_resource_public_id is not null then
      select scim_user.* into user_row
      from loyalty.organization_scim_users as scim_user
      where scim_user.organization_id = authorization_row.organization_id
        and scim_user.endpoint_id = authorization_row.endpoint_id
        and scim_user.public_id = target_resource_public_id
        and scim_user.deleted_at is null;
      if user_row.id is null then
        return query select 404, null::jsonb, null::text,
          authorization_row.quota_limit, authorization_row.quota_remaining,
          authorization_row.quota_reset_at;
        return;
      end if;
      expected_etag := 'W/"' || user_row.lifecycle_revision::text || '"';
      return query select 200,
        loyalty_private.organization_scim_user_document_v1(user_row.id),
        expected_etag, authorization_row.quota_limit,
        authorization_row.quota_remaining, authorization_row.quota_reset_at;
      return;
    end if;
    select count(*) into total_results
    from loyalty.organization_scim_users as scim_user
    where scim_user.organization_id = authorization_row.organization_id
      and scim_user.endpoint_id = authorization_row.endpoint_id
      and scim_user.deleted_at is null
      and (target_filter_attribute is null
        or (target_filter_attribute = 'id' and scim_user.public_id::text = target_filter_value)
        or (target_filter_attribute = 'externalId' and scim_user.external_id = target_filter_value)
        or (target_filter_attribute = 'userName' and scim_user.user_name = target_filter_value));
    select coalesce(jsonb_agg(
      loyalty_private.organization_scim_user_document_v1(selected.id)
      order by selected.created_at, selected.id
    ), '[]'::jsonb) into resources
    from (
      select scim_user.id, scim_user.created_at
      from loyalty.organization_scim_users as scim_user
      where scim_user.organization_id = authorization_row.organization_id
        and scim_user.endpoint_id = authorization_row.endpoint_id
        and scim_user.deleted_at is null
        and (target_filter_attribute is null
          or (target_filter_attribute = 'id' and scim_user.public_id::text = target_filter_value)
          or (target_filter_attribute = 'externalId' and scim_user.external_id = target_filter_value)
          or (target_filter_attribute = 'userName' and scim_user.user_name = target_filter_value))
      order by scim_user.created_at, scim_user.id
      offset target_start_index - 1 limit target_count
    ) as selected;
    return query select 200, jsonb_build_object(
      'schemas', jsonb_build_array('urn:ietf:params:scim:api:messages:2.0:ListResponse'),
      'totalResults', total_results, 'startIndex', target_start_index,
      'itemsPerPage', jsonb_array_length(resources), 'Resources', resources
    ), null::text, authorization_row.quota_limit,
      authorization_row.quota_remaining, authorization_row.quota_reset_at;
    return;
  end if;

  if target_method = 'GET' and target_resource_type = 'Groups' then
    if target_resource_public_id is not null then
      select scim_group.* into group_row
      from loyalty.organization_scim_groups as scim_group
      where scim_group.organization_id = authorization_row.organization_id
        and scim_group.endpoint_id = authorization_row.endpoint_id
        and scim_group.public_id = target_resource_public_id
        and scim_group.deleted_at is null;
      if group_row.id is null then
        return query select 404, null::jsonb, null::text,
          authorization_row.quota_limit, authorization_row.quota_remaining,
          authorization_row.quota_reset_at;
        return;
      end if;
      expected_etag := 'W/"' || group_row.lifecycle_revision::text || '"';
      return query select 200,
        loyalty_private.organization_scim_group_document_v1(group_row.id),
        expected_etag, authorization_row.quota_limit,
        authorization_row.quota_remaining, authorization_row.quota_reset_at;
      return;
    end if;
    select count(*) into total_results
    from loyalty.organization_scim_groups as scim_group
    where scim_group.organization_id = authorization_row.organization_id
      and scim_group.endpoint_id = authorization_row.endpoint_id
      and scim_group.deleted_at is null
      and (target_filter_attribute is null
        or (target_filter_attribute = 'id' and scim_group.public_id::text = target_filter_value)
        or (target_filter_attribute = 'externalId' and scim_group.external_id = target_filter_value)
        or (target_filter_attribute = 'displayName' and scim_group.display_name = target_filter_value));
    select coalesce(jsonb_agg(
      loyalty_private.organization_scim_group_document_v1(selected.id)
      order by selected.created_at, selected.id
    ), '[]'::jsonb) into resources
    from (
      select scim_group.id, scim_group.created_at
      from loyalty.organization_scim_groups as scim_group
      where scim_group.organization_id = authorization_row.organization_id
        and scim_group.endpoint_id = authorization_row.endpoint_id
        and scim_group.deleted_at is null
        and (target_filter_attribute is null
          or (target_filter_attribute = 'id' and scim_group.public_id::text = target_filter_value)
          or (target_filter_attribute = 'externalId' and scim_group.external_id = target_filter_value)
          or (target_filter_attribute = 'displayName' and scim_group.display_name = target_filter_value))
      order by scim_group.created_at, scim_group.id
      offset target_start_index - 1 limit target_count
    ) as selected;
    return query select 200, jsonb_build_object(
      'schemas', jsonb_build_array('urn:ietf:params:scim:api:messages:2.0:ListResponse'),
      'totalResults', total_results, 'startIndex', target_start_index,
      'itemsPerPage', jsonb_array_length(resources), 'Resources', resources
    ), null::text, authorization_row.quota_limit,
      authorization_row.quota_remaining, authorization_row.quota_reset_at;
    return;
  end if;

  if target_resource_type = 'Users' and target_method in ('POST', 'PUT', 'PATCH') then
    if target_method = 'POST' then
      if target_resource_public_id is not null then
        raise exception using errcode = '22023', message = 'invalid SCIM User create selector';
      end if;
      normalized_body := target_body;
    else
      if target_resource_public_id is null then
        raise exception using errcode = '22023', message = 'missing SCIM User selector';
      end if;
      select scim_user.* into user_row
      from loyalty.organization_scim_users as scim_user
      where scim_user.organization_id = authorization_row.organization_id
        and scim_user.endpoint_id = authorization_row.endpoint_id
        and scim_user.public_id = target_resource_public_id
        and scim_user.deleted_at is null
      for update;
      if user_row.id is null then
        return query select 404, null::jsonb, null::text,
          authorization_row.quota_limit, authorization_row.quota_remaining,
          authorization_row.quota_reset_at;
        return;
      end if;
      expected_etag := 'W/"' || user_row.lifecycle_revision::text || '"';
      if target_if_match is not null and target_if_match <> expected_etag then
        raise exception using errcode = '40001', message = 'SCIM resource revision conflict';
      end if;
      if target_method = 'PUT' then
        normalized_body := target_body;
      else
        if target_body is null
           or jsonb_typeof(target_body) <> 'object'
           or jsonb_typeof(target_body->'Operations') <> 'array'
           or jsonb_array_length(target_body->'Operations') not between 1 and 100 then
          raise exception using errcode = '22023', message = 'invalid SCIM PatchOp';
        end if;
        current_document := jsonb_strip_nulls(jsonb_build_object(
          'schemas', jsonb_build_array('urn:ietf:params:scim:schemas:core:2.0:User'),
          'externalId', user_row.external_id, 'userName', user_row.user_name,
          'displayName', user_row.display_name, 'name', user_row.name_document,
          'emails', user_row.emails_document, 'active', user_row.active
        ));
        for operation in select value from jsonb_array_elements(target_body->'Operations')
        loop
          operation_name := lower(operation->>'op');
          operation_path := nullif(btrim(operation->>'path'), '');
          operation_value := operation->'value';
          if operation_name not in ('add', 'remove', 'replace') then
            raise exception using errcode = '22023', message = 'unsupported SCIM PatchOp';
          end if;
          if operation_path is null then
            if operation_name = 'remove' or jsonb_typeof(operation_value) <> 'object' then
              raise exception using errcode = '22023', message = 'invalid pathless SCIM PatchOp';
            end if;
            current_document := current_document || operation_value;
          elsif lower(operation_path) = 'displayname' then
            if operation_name = 'remove' then
              current_document := current_document - 'displayName';
            else
              current_document := jsonb_set(current_document, '{displayName}', operation_value, true);
            end if;
          elsif lower(operation_path) = 'name' then
            if operation_name = 'remove' then
              current_document := current_document - 'name';
            else
              current_document := jsonb_set(current_document, '{name}', operation_value, true);
            end if;
          elsif lower(operation_path) = 'emails' then
            if operation_name = 'remove' then
              current_document := jsonb_set(current_document, '{emails}', '[]'::jsonb, true);
            else
              current_document := jsonb_set(current_document, '{emails}', operation_value, true);
            end if;
          elsif lower(operation_path) = 'active' then
            if operation_name = 'remove' then
              raise exception using errcode = '22023', message = 'SCIM active cannot be removed';
            end if;
            current_document := jsonb_set(current_document, '{active}', operation_value, true);
          elsif lower(operation_path) = 'username' then
            if operation_name = 'remove' then
              raise exception using errcode = '22023', message = 'SCIM userName cannot be removed';
            end if;
            current_document := jsonb_set(current_document, '{userName}', operation_value, true);
          elsif lower(operation_path) = 'externalid' then
            if operation_name = 'remove' then
              raise exception using errcode = '22023', message = 'SCIM externalId cannot be removed';
            end if;
            current_document := jsonb_set(current_document, '{externalId}', operation_value, true);
          else
            raise exception using errcode = '22023', message = 'unsupported SCIM User patch path';
          end if;
        end loop;
        normalized_body := current_document;
      end if;
    end if;

    if normalized_body is null or jsonb_typeof(normalized_body) <> 'object'
       or jsonb_typeof(normalized_body->'schemas') <> 'array'
       or not (normalized_body->'schemas' @> jsonb_build_array(
         'urn:ietf:params:scim:schemas:core:2.0:User'
       ))
       or not loyalty_private.valid_scim_user_shape_v1(normalized_body) then
      raise exception using errcode = '22023', message = 'invalid SCIM User schema';
    end if;
    new_external_id := normalized_body->>'externalId';
    new_user_name := normalized_body->>'userName';
    new_display_name := normalized_body->>'displayName';
    new_name := normalized_body->'name';
    new_emails := coalesce(normalized_body->'emails', '[]'::jsonb);
    begin
      new_active := coalesce((normalized_body->>'active')::boolean, true);
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'invalid SCIM User active value';
    end;
    if new_external_id is null or new_external_id <> btrim(new_external_id)
       or length(new_external_id) not between 1 and 255
       or new_external_id ~ '[[:cntrl:]]'
       or new_user_name is null or new_user_name <> btrim(new_user_name)
       or length(new_user_name) not between 1 and 320
       or new_user_name ~ '[[:cntrl:]]'
       or (new_display_name is not null and (
         new_display_name <> btrim(new_display_name)
         or length(new_display_name) not between 1 and 200
         or new_display_name ~ '[[:cntrl:]]'
       ))
       or (new_name is not null and jsonb_typeof(new_name) <> 'object')
       or jsonb_typeof(new_emails) <> 'array'
       or jsonb_array_length(new_emails) > 20 then
      raise exception using errcode = '22023', message = 'invalid SCIM User representation';
    end if;
    normalized_body := jsonb_strip_nulls(jsonb_build_object(
      'schemas', jsonb_build_array('urn:ietf:params:scim:schemas:core:2.0:User'),
      'externalId', new_external_id, 'userName', new_user_name,
      'displayName', new_display_name, 'name', new_name,
      'emails', new_emails, 'active', new_active
    ));
    request_hash := extensions.digest(convert_to(normalized_body::text, 'utf8'), 'sha256');

    if target_method = 'POST' then
      select scim_user.* into existing_user
      from loyalty.organization_scim_users as scim_user
      where scim_user.endpoint_id = authorization_row.endpoint_id
        and scim_user.external_id = new_external_id
      for update;
      if existing_user.id is not null then
        if existing_user.deleted_at is null
           and existing_user.representation_sha256 = request_hash then
          insert into loyalty.organization_scim_audit_events (
            organization_id, endpoint_id, credential_revision, action,
            resource_type, resource_public_id, resource_revision, outcome,
            request_sha256, correlation_id
          ) values (
            authorization_row.organization_id, authorization_row.endpoint_id,
            authorization_row.credential_revision, 'scim.user.create', 'user',
            existing_user.public_id, existing_user.lifecycle_revision,
            'duplicate', request_hash, target_correlation_id
          );
          return query select 200,
            loyalty_private.organization_scim_user_document_v1(existing_user.id),
            'W/"' || existing_user.lifecycle_revision::text || '"',
            authorization_row.quota_limit, authorization_row.quota_remaining,
            authorization_row.quota_reset_at;
          return;
        end if;
        if existing_user.deleted_at is null then
          raise exception using errcode = '23505', message = 'SCIM externalId conflict';
        end if;
        update loyalty.organization_scim_users as current_scim_user
        set user_name = new_user_name, display_name = new_display_name,
          name_document = new_name, emails_document = new_emails,
          active = new_active, deleted_at = null,
          representation_sha256 = request_hash,
          lifecycle_revision = current_scim_user.lifecycle_revision + 1,
          updated_at = changed_at
        where current_scim_user.id = existing_user.id
        returning * into user_row;
        perform * from loyalty_private.reconcile_organization_scim_user_v1(
          user_row.id, changed_at
        );
      else
        insert into loyalty.organization_scim_users (
          organization_id, endpoint_id, external_id, user_name, display_name,
          name_document, emails_document, active, representation_sha256
        ) values (
          authorization_row.organization_id, authorization_row.endpoint_id,
          new_external_id, new_user_name, new_display_name, new_name,
          new_emails, new_active, request_hash
        ) returning * into user_row;
      end if;
      result_status := 201;
      result_outcome := 'created';
    else
      if new_external_id <> user_row.external_id then
        raise exception using errcode = '22023', message = 'SCIM externalId is immutable';
      end if;
      if user_row.representation_sha256 = request_hash then
        result_status := 200;
        result_outcome := 'duplicate';
      else
        update loyalty.organization_scim_users as current_scim_user
        set user_name = new_user_name, display_name = new_display_name,
          name_document = new_name, emails_document = new_emails,
          active = new_active, representation_sha256 = request_hash,
          lifecycle_revision = current_scim_user.lifecycle_revision + 1,
          updated_at = changed_at
        where current_scim_user.id = user_row.id
        returning * into user_row;
        perform * from loyalty_private.reconcile_organization_scim_user_v1(
          user_row.id, changed_at
        );
        result_status := 200;
        result_outcome := 'updated';
      end if;
    end if;

    insert into loyalty.organization_scim_audit_events (
      organization_id, endpoint_id, credential_revision, action,
      resource_type, resource_public_id, resource_revision, outcome,
      request_sha256, correlation_id
    ) values (
      authorization_row.organization_id, authorization_row.endpoint_id,
      authorization_row.credential_revision,
      'scim.user.' || case when target_method = 'POST' then 'create' else 'update' end,
      'user', user_row.public_id, user_row.lifecycle_revision, result_outcome,
      request_hash, target_correlation_id
    );
    return query select result_status,
      loyalty_private.organization_scim_user_document_v1(user_row.id),
      'W/"' || user_row.lifecycle_revision::text || '"',
      authorization_row.quota_limit, authorization_row.quota_remaining,
      authorization_row.quota_reset_at;
    return;
  end if;

  if target_resource_type = 'Users' and target_method = 'DELETE' then
    if target_resource_public_id is null then
      raise exception using errcode = '22023', message = 'missing SCIM User selector';
    end if;
    select scim_user.* into user_row
    from loyalty.organization_scim_users as scim_user
    where scim_user.organization_id = authorization_row.organization_id
      and scim_user.endpoint_id = authorization_row.endpoint_id
      and scim_user.public_id = target_resource_public_id
    for update;
    if user_row.id is null then
      return query select 404, null::jsonb, null::text,
        authorization_row.quota_limit, authorization_row.quota_remaining,
        authorization_row.quota_reset_at;
      return;
    end if;
    if user_row.deleted_at is not null then
      return query select 204, null::jsonb, null::text,
        authorization_row.quota_limit, authorization_row.quota_remaining,
        authorization_row.quota_reset_at;
      return;
    end if;
    expected_etag := 'W/"' || user_row.lifecycle_revision::text || '"';
    if target_if_match is not null and target_if_match <> expected_etag then
      raise exception using errcode = '40001', message = 'SCIM resource revision conflict';
    end if;
    delete from loyalty.organization_scim_group_members
    where organization_id = authorization_row.organization_id
      and endpoint_id = authorization_row.endpoint_id and user_id = user_row.id;
    update loyalty.organization_scim_users as current_scim_user
    set active = false, deleted_at = changed_at,
      lifecycle_revision = current_scim_user.lifecycle_revision + 1,
      updated_at = changed_at,
      representation_sha256 = extensions.digest(convert_to(concat_ws('|',
        current_scim_user.external_id, current_scim_user.user_name, 'deleted',
        (current_scim_user.lifecycle_revision + 1)::text
      ), 'utf8'), 'sha256')
    where current_scim_user.id = user_row.id
    returning * into user_row;
    perform * from loyalty_private.reconcile_organization_scim_user_v1(
      user_row.id, changed_at
    );
    insert into loyalty.organization_scim_audit_events (
      organization_id, endpoint_id, credential_revision, action,
      resource_type, resource_public_id, resource_revision, outcome,
      request_sha256, correlation_id
    ) values (
      authorization_row.organization_id, authorization_row.endpoint_id,
      authorization_row.credential_revision, 'scim.user.delete', 'user',
      user_row.public_id, user_row.lifecycle_revision, 'deleted', request_hash,
      target_correlation_id
    );
    return query select 204, null::jsonb, null::text,
      authorization_row.quota_limit, authorization_row.quota_remaining,
      authorization_row.quota_reset_at;
    return;
  end if;

  if target_resource_type = 'Groups' and target_method in ('POST', 'PUT', 'PATCH') then
    if target_method = 'POST' then
      if target_resource_public_id is not null then
        raise exception using errcode = '22023', message = 'invalid SCIM Group create selector';
      end if;
      normalized_body := target_body;
    else
      if target_resource_public_id is null then
        raise exception using errcode = '22023', message = 'missing SCIM Group selector';
      end if;
      select scim_group.* into group_row
      from loyalty.organization_scim_groups as scim_group
      where scim_group.organization_id = authorization_row.organization_id
        and scim_group.endpoint_id = authorization_row.endpoint_id
        and scim_group.public_id = target_resource_public_id
        and scim_group.deleted_at is null
      for update;
      if group_row.id is null then
        return query select 404, null::jsonb, null::text,
          authorization_row.quota_limit, authorization_row.quota_remaining,
          authorization_row.quota_reset_at;
        return;
      end if;
      expected_etag := 'W/"' || group_row.lifecycle_revision::text || '"';
      if target_if_match is not null and target_if_match <> expected_etag then
        raise exception using errcode = '40001', message = 'SCIM resource revision conflict';
      end if;
      if target_method = 'PUT' then
        normalized_body := target_body;
      else
        if target_body is null
           or jsonb_typeof(target_body) <> 'object'
           or jsonb_typeof(target_body->'Operations') <> 'array'
           or jsonb_array_length(target_body->'Operations') not between 1 and 100 then
          raise exception using errcode = '22023', message = 'invalid SCIM PatchOp';
        end if;
        current_document := jsonb_build_object(
          'schemas', jsonb_build_array('urn:ietf:params:scim:schemas:core:2.0:Group'),
          'externalId', group_row.external_id,
          'displayName', group_row.display_name,
          'members', coalesce((
            select jsonb_agg(jsonb_build_object('value', scim_user.public_id)
              order by scim_user.public_id)
            from loyalty.organization_scim_group_members as group_member
            join loyalty.organization_scim_users as scim_user
              on scim_user.organization_id = group_member.organization_id
             and scim_user.id = group_member.user_id
            where group_member.organization_id = authorization_row.organization_id
              and group_member.group_id = group_row.id
              and scim_user.deleted_at is null
          ), '[]'::jsonb)
        );
        for operation in select value from jsonb_array_elements(target_body->'Operations')
        loop
          operation_name := lower(operation->>'op');
          operation_path := nullif(btrim(operation->>'path'), '');
          operation_value := operation->'value';
          if operation_name not in ('add', 'remove', 'replace') then
            raise exception using errcode = '22023', message = 'unsupported SCIM PatchOp';
          end if;
          if operation_path is null then
            if operation_name = 'remove' or jsonb_typeof(operation_value) <> 'object' then
              raise exception using errcode = '22023', message = 'invalid pathless SCIM PatchOp';
            end if;
            current_document := current_document || operation_value;
          elsif lower(operation_path) = 'displayname' then
            if operation_name = 'remove' then
              raise exception using errcode = '22023', message = 'SCIM displayName cannot be removed';
            end if;
            current_document := jsonb_set(current_document, '{displayName}', operation_value, true);
          elsif lower(operation_path) = 'externalid' then
            if operation_name = 'remove' then
              raise exception using errcode = '22023', message = 'SCIM externalId cannot be removed';
            end if;
            current_document := jsonb_set(current_document, '{externalId}', operation_value, true);
          elsif lower(operation_path) = 'members' then
            if operation_name = 'remove' then
              current_document := jsonb_set(current_document, '{members}', '[]'::jsonb, true);
            elsif operation_name = 'add' then
              if jsonb_typeof(operation_value) = 'array' then
                current_document := jsonb_set(current_document, '{members}',
                  coalesce(current_document->'members', '[]'::jsonb) || operation_value, true);
              elsif jsonb_typeof(operation_value) = 'object' then
                current_document := jsonb_set(current_document, '{members}',
                  coalesce(current_document->'members', '[]'::jsonb) || jsonb_build_array(operation_value), true);
              else
                raise exception using errcode = '22023', message = 'invalid SCIM members value';
              end if;
            else
              current_document := jsonb_set(current_document, '{members}', operation_value, true);
            end if;
          elsif lower(operation_path) ~ '^members\[value eq "[0-9a-f-]{36}"\]$'
                and operation_name = 'remove' then
            path_match := regexp_match(operation_path,
              '^members\[value eq "([0-9a-fA-F-]{36})"\]$', 'i');
            if path_match is null then
              raise exception using errcode = '22023', message = 'invalid SCIM member filter';
            end if;
            begin
              member_public_id := path_match[1]::uuid;
            exception when invalid_text_representation then
              raise exception using errcode = '22023', message = 'invalid SCIM member filter';
            end;
            current_document := jsonb_set(current_document, '{members}', coalesce((
              select jsonb_agg(value order by value->>'value')
              from jsonb_array_elements(coalesce(current_document->'members', '[]'::jsonb))
              where value->>'value' <> member_public_id::text
            ), '[]'::jsonb), true);
          else
            raise exception using errcode = '22023', message = 'unsupported SCIM Group patch path';
          end if;
        end loop;
        normalized_body := current_document;
      end if;
    end if;

    if normalized_body is null or jsonb_typeof(normalized_body) <> 'object'
       or jsonb_typeof(normalized_body->'schemas') <> 'array'
       or not (normalized_body->'schemas' @> jsonb_build_array(
         'urn:ietf:params:scim:schemas:core:2.0:Group'
       ))
       or not loyalty_private.valid_scim_group_shape_v1(normalized_body) then
      raise exception using errcode = '22023', message = 'invalid SCIM Group schema';
    end if;
    new_external_id := normalized_body->>'externalId';
    new_display_name := normalized_body->>'displayName';
    if new_external_id is null or new_external_id <> btrim(new_external_id)
       or length(new_external_id) not between 1 and 255
       or new_external_id ~ '[[:cntrl:]]'
       or new_display_name is null or new_display_name <> btrim(new_display_name)
       or length(new_display_name) not between 1 and 200
       or new_display_name ~ '[[:cntrl:]]'
       or jsonb_typeof(coalesce(normalized_body->'members', '[]'::jsonb)) <> 'array'
       or jsonb_array_length(coalesce(normalized_body->'members', '[]'::jsonb)) > 2000 then
      raise exception using errcode = '22023', message = 'invalid SCIM Group representation';
    end if;

    member_ids := array[]::uuid[];
    for member_value in
      select value from jsonb_array_elements(coalesce(normalized_body->'members', '[]'::jsonb))
    loop
      if jsonb_typeof(member_value) <> 'object'
         or member_value->>'value' is null then
        raise exception using errcode = '22023', message = 'invalid SCIM Group member';
      end if;
      begin
        member_public_id := (member_value->>'value')::uuid;
      exception when invalid_text_representation then
        raise exception using errcode = '22023', message = 'invalid SCIM Group member';
      end;
      member_ids := array_append(member_ids, member_public_id);
    end loop;
    if cardinality(member_ids) <> (
      select count(distinct candidate) from unnest(member_ids) as candidate
    ) then
      raise exception using errcode = '22023', message = 'duplicate SCIM Group member';
    end if;
    if cardinality(member_ids) <> (
      select count(*)
      from loyalty.organization_scim_users as scim_user
      where scim_user.organization_id = authorization_row.organization_id
        and scim_user.endpoint_id = authorization_row.endpoint_id
        and scim_user.public_id = any(member_ids)
        and scim_user.deleted_at is null
    ) then
      raise exception using errcode = '22023', message = 'unknown SCIM Group member';
    end if;
    normalized_body := jsonb_build_object(
      'schemas', jsonb_build_array('urn:ietf:params:scim:schemas:core:2.0:Group'),
      'externalId', new_external_id, 'displayName', new_display_name,
      'members', coalesce((
        select jsonb_agg(jsonb_build_object('value', candidate) order by candidate)
        from unnest(member_ids) as candidate
      ), '[]'::jsonb)
    );
    request_hash := extensions.digest(convert_to(normalized_body::text, 'utf8'), 'sha256');

    if target_method = 'POST' then
      select scim_group.* into existing_group
      from loyalty.organization_scim_groups as scim_group
      where scim_group.endpoint_id = authorization_row.endpoint_id
        and scim_group.external_id = new_external_id
      for update;
      if existing_group.id is not null then
        if existing_group.deleted_at is null
           and existing_group.representation_sha256 = request_hash then
          insert into loyalty.organization_scim_audit_events (
            organization_id, endpoint_id, credential_revision, action,
            resource_type, resource_public_id, resource_revision, outcome,
            request_sha256, correlation_id
          ) values (
            authorization_row.organization_id, authorization_row.endpoint_id,
            authorization_row.credential_revision, 'scim.group.create', 'group',
            existing_group.public_id, existing_group.lifecycle_revision,
            'duplicate', request_hash, target_correlation_id
          );
          return query select 200,
            loyalty_private.organization_scim_group_document_v1(existing_group.id),
            'W/"' || existing_group.lifecycle_revision::text || '"',
            authorization_row.quota_limit, authorization_row.quota_remaining,
            authorization_row.quota_reset_at;
          return;
        end if;
        if existing_group.deleted_at is null then
          raise exception using errcode = '23505', message = 'SCIM externalId conflict';
        end if;
        update loyalty.organization_scim_groups as current_group
        set display_name = new_display_name,
          mapped_role = null, mapped_by_user_id = null, mapped_at = null,
          deleted_at = null, representation_sha256 = request_hash,
          lifecycle_revision = current_group.lifecycle_revision + 1,
          updated_at = changed_at
        where current_group.id = existing_group.id
        returning * into group_row;
      else
        insert into loyalty.organization_scim_groups (
          organization_id, endpoint_id, external_id, display_name,
          representation_sha256
        ) values (
          authorization_row.organization_id, authorization_row.endpoint_id,
          new_external_id, new_display_name, request_hash
        ) returning * into group_row;
      end if;
      result_status := 201;
      result_outcome := 'created';
      removed_member_ids := array[]::bigint[];
    else
      if new_external_id <> group_row.external_id then
        raise exception using errcode = '22023', message = 'SCIM externalId is immutable';
      end if;
      select coalesce(array_agg(group_member.user_id), array[]::bigint[])
      into removed_member_ids
      from loyalty.organization_scim_group_members as group_member
      where group_member.organization_id = authorization_row.organization_id
        and group_member.group_id = group_row.id;
      if group_row.representation_sha256 = request_hash then
        result_status := 200;
        result_outcome := 'duplicate';
      else
        update loyalty.organization_scim_groups as current_group
        set display_name = new_display_name,
          representation_sha256 = request_hash,
          lifecycle_revision = current_group.lifecycle_revision + 1,
          updated_at = changed_at
        where current_group.id = group_row.id
        returning * into group_row;
        result_status := 200;
        result_outcome := 'updated';
      end if;
    end if;

    if result_outcome <> 'duplicate' then
      delete from loyalty.organization_scim_group_members
      where organization_id = authorization_row.organization_id
        and endpoint_id = authorization_row.endpoint_id and group_id = group_row.id;
      insert into loyalty.organization_scim_group_members (
        organization_id, endpoint_id, group_id, user_id
      )
      select authorization_row.organization_id, authorization_row.endpoint_id,
        group_row.id, scim_user.id
      from loyalty.organization_scim_users as scim_user
      where scim_user.organization_id = authorization_row.organization_id
        and scim_user.endpoint_id = authorization_row.endpoint_id
        and scim_user.public_id = any(member_ids)
      order by scim_user.id;

      for affected_user in
        select distinct candidate.user_id
        from (
          select unnest(removed_member_ids) as user_id
          union all
          select scim_user.id
          from loyalty.organization_scim_users as scim_user
          where scim_user.organization_id = authorization_row.organization_id
            and scim_user.endpoint_id = authorization_row.endpoint_id
            and scim_user.public_id = any(member_ids)
        ) as candidate
        order by candidate.user_id
      loop
        perform * from loyalty_private.reconcile_organization_scim_user_v1(
          affected_user.user_id, changed_at
        );
      end loop;
    end if;

    insert into loyalty.organization_scim_audit_events (
      organization_id, endpoint_id, credential_revision, action,
      resource_type, resource_public_id, resource_revision, outcome,
      request_sha256, correlation_id
    ) values (
      authorization_row.organization_id, authorization_row.endpoint_id,
      authorization_row.credential_revision,
      'scim.group.' || case when target_method = 'POST' then 'create' else 'update' end,
      'group', group_row.public_id, group_row.lifecycle_revision,
      result_outcome, request_hash, target_correlation_id
    );
    return query select result_status,
      loyalty_private.organization_scim_group_document_v1(group_row.id),
      'W/"' || group_row.lifecycle_revision::text || '"',
      authorization_row.quota_limit, authorization_row.quota_remaining,
      authorization_row.quota_reset_at;
    return;
  end if;

  if target_resource_type = 'Groups' and target_method = 'DELETE' then
    if target_resource_public_id is null then
      raise exception using errcode = '22023', message = 'missing SCIM Group selector';
    end if;
    select scim_group.* into group_row
    from loyalty.organization_scim_groups as scim_group
    where scim_group.organization_id = authorization_row.organization_id
      and scim_group.endpoint_id = authorization_row.endpoint_id
      and scim_group.public_id = target_resource_public_id
    for update;
    if group_row.id is null then
      return query select 404, null::jsonb, null::text,
        authorization_row.quota_limit, authorization_row.quota_remaining,
        authorization_row.quota_reset_at;
      return;
    end if;
    if group_row.deleted_at is not null then
      return query select 204, null::jsonb, null::text,
        authorization_row.quota_limit, authorization_row.quota_remaining,
        authorization_row.quota_reset_at;
      return;
    end if;
    expected_etag := 'W/"' || group_row.lifecycle_revision::text || '"';
    if target_if_match is not null and target_if_match <> expected_etag then
      raise exception using errcode = '40001', message = 'SCIM resource revision conflict';
    end if;
    select coalesce(array_agg(group_member.user_id), array[]::bigint[])
    into removed_member_ids
    from loyalty.organization_scim_group_members as group_member
    where group_member.organization_id = authorization_row.organization_id
      and group_member.group_id = group_row.id;
    delete from loyalty.organization_scim_group_members
    where organization_id = authorization_row.organization_id
      and endpoint_id = authorization_row.endpoint_id and group_id = group_row.id;
    update loyalty.organization_scim_groups as current_group
    set mapped_role = null, mapped_by_user_id = null, mapped_at = null,
      deleted_at = changed_at,
      lifecycle_revision = current_group.lifecycle_revision + 1,
      updated_at = changed_at,
      representation_sha256 = extensions.digest(convert_to(concat_ws('|',
        current_group.external_id, current_group.display_name, 'deleted',
        (current_group.lifecycle_revision + 1)::text
      ), 'utf8'), 'sha256')
    where current_group.id = group_row.id
    returning * into group_row;
    for affected_user in select unnest(removed_member_ids) as user_id
    loop
      perform * from loyalty_private.reconcile_organization_scim_user_v1(
        affected_user.user_id, changed_at
      );
    end loop;
    insert into loyalty.organization_scim_audit_events (
      organization_id, endpoint_id, credential_revision, action,
      resource_type, resource_public_id, resource_revision, outcome,
      request_sha256, correlation_id
    ) values (
      authorization_row.organization_id, authorization_row.endpoint_id,
      authorization_row.credential_revision, 'scim.group.delete', 'group',
      group_row.public_id, group_row.lifecycle_revision, 'deleted', request_hash,
      target_correlation_id
    );
    return query select 204, null::jsonb, null::text,
      authorization_row.quota_limit, authorization_row.quota_remaining,
      authorization_row.quota_reset_at;
    return;
  end if;

  raise exception using errcode = '22023', message = 'unsupported SCIM request';
end;
$$;

create or replace function loyalty.organization_scim_workspace_v1(
  target_organization_public_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  request_actor uuid := loyalty_private.request_user_id();
  organization_row loyalty.organizations%rowtype;
  membership_row loyalty.organization_memberships%rowtype;
  endpoint_documents jsonb;
  group_documents jsonb;
  event_documents jsonb;
begin
  select organization.* into organization_row
  from loyalty.organizations as organization
  where organization.public_id = target_organization_public_id;
  select membership.* into membership_row
  from loyalty.organization_memberships as membership
  where membership.organization_id = organization_row.id
    and membership.user_id = request_actor
    and membership.revoked_at is null;
  if organization_row.id is null or membership_row.id is null
     or membership_row.role not in ('owner', 'admin', 'auditor') then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', endpoint.public_id,
    'federationSourceId', source.public_id,
    'displayName', endpoint.display_name,
    'status', endpoint.status,
    'revision', endpoint.lifecycle_revision,
    'credentialRevision', endpoint.credential_revision,
    'userCount', (
      select count(*) from loyalty.organization_scim_users as scim_user
      where scim_user.endpoint_id = endpoint.id and scim_user.deleted_at is null
    ),
    'activeUserCount', (
      select count(*) from loyalty.organization_scim_users as scim_user
      where scim_user.endpoint_id = endpoint.id and scim_user.deleted_at is null
        and scim_user.active
    ),
    'boundUserCount', (
      select count(*) from loyalty.organization_scim_users as scim_user
      where scim_user.endpoint_id = endpoint.id and scim_user.deleted_at is null
        and scim_user.bound_auth_user_id is not null
    ),
    'groupCount', (
      select count(*) from loyalty.organization_scim_groups as scim_group
      where scim_group.endpoint_id = endpoint.id and scim_group.deleted_at is null
    ),
    'createdAt', endpoint.created_at,
    'updatedAt', endpoint.updated_at,
    'revokedAt', endpoint.revoked_at
  ) order by endpoint.created_at desc, endpoint.id desc), '[]'::jsonb)
  into endpoint_documents
  from loyalty.organization_scim_endpoints as endpoint
  join loyalty.organization_federation_sources as source
    on source.organization_id = endpoint.organization_id
   and source.id = endpoint.federation_source_id
  where endpoint.organization_id = organization_row.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', scim_group.public_id,
    'endpointId', endpoint.public_id,
    'displayName', scim_group.display_name,
    'mappedRole', scim_group.mapped_role,
    'revision', scim_group.lifecycle_revision,
    'memberCount', (
      select count(*) from loyalty.organization_scim_group_members as group_member
      where group_member.organization_id = organization_row.id
        and group_member.group_id = scim_group.id
    ),
    'createdAt', scim_group.created_at,
    'updatedAt', scim_group.updated_at
  ) order by scim_group.created_at desc, scim_group.id desc), '[]'::jsonb)
  into group_documents
  from (
    select candidate.*
    from loyalty.organization_scim_groups as candidate
    where candidate.organization_id = organization_row.id
      and candidate.deleted_at is null
    order by candidate.created_at desc, candidate.id desc
    limit 5000
  ) as scim_group
  join loyalty.organization_scim_endpoints as endpoint
    on endpoint.organization_id = scim_group.organization_id
   and endpoint.id = scim_group.endpoint_id
  where scim_group.organization_id = organization_row.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', audit.public_id,
    'endpointId', endpoint.public_id,
    'action', audit.action,
    'resourceType', audit.resource_type,
    'resourceId', audit.resource_public_id,
    'resourceRevision', audit.resource_revision,
    'outcome', audit.outcome,
    'createdAt', audit.created_at
  ) order by audit.created_at desc, audit.id desc), '[]'::jsonb)
  into event_documents
  from (
    select candidate.*
    from loyalty.organization_scim_audit_events as candidate
    where candidate.organization_id = organization_row.id
    order by candidate.created_at desc, candidate.id desc
    limit 50
  ) as audit
  join loyalty.organization_scim_endpoints as endpoint
    on endpoint.organization_id = audit.organization_id
   and endpoint.id = audit.endpoint_id;

  return jsonb_build_object(
    'schemaVersion', '1',
    'organization', jsonb_build_object(
      'id', organization_row.public_id,
      'name', organization_row.name,
      'slug', organization_row.slug,
      'status', organization_row.status
    ),
    'currentRole', membership_row.role,
    'mayConfigure', organization_row.status = 'active'
      and membership_row.role in ('owner', 'admin'),
    'entitlementEnabled',
      loyalty_private.organization_federation_entitlement_enabled_v1(organization_row.id),
    'endpoints', endpoint_documents,
    'groups', group_documents,
    'events', event_documents
  );
end;
$$;

alter function loyalty_private.organization_scim_user_document_v1(bigint)
  owner to loyalty_owner;
alter function loyalty_private.organization_scim_group_document_v1(bigint)
  owner to loyalty_owner;
alter function loyalty_private.valid_scim_user_shape_v1(jsonb)
  owner to loyalty_owner;
alter function loyalty_private.valid_scim_group_shape_v1(jsonb)
  owner to loyalty_owner;
alter function loyalty_private.reconcile_organization_scim_user_v1(bigint, timestamptz)
  owner to loyalty_owner;
alter function loyalty.create_organization_scim_endpoint_command_v1(
  uuid, uuid, text, bytea, text, uuid
) owner to loyalty_owner;
alter function loyalty.update_organization_scim_endpoint_command_v1(
  uuid, uuid, bigint, text, bytea, text, text, uuid
) owner to loyalty_owner;
alter function loyalty.map_organization_scim_group_role_command_v1(
  uuid, uuid, uuid, bigint, text, text, text, uuid
) owner to loyalty_owner;
alter function loyalty.claim_organization_scim_membership_v1(uuid, uuid)
  owner to loyalty_owner;
alter function loyalty_private.authorize_organization_scim_request_v1(uuid, bytea)
  owner to loyalty_owner;
alter function loyalty_private.organization_scim_request_v1(
  uuid, bytea, text, text, uuid, text, text, integer, integer,
  jsonb, text, uuid
) owner to loyalty_owner;
alter function loyalty.organization_scim_workspace_v1(uuid)
  owner to loyalty_owner;

revoke all on function loyalty_private.organization_scim_user_document_v1(bigint),
  loyalty_private.organization_scim_group_document_v1(bigint),
  loyalty_private.valid_scim_user_shape_v1(jsonb),
  loyalty_private.valid_scim_group_shape_v1(jsonb),
  loyalty_private.reconcile_organization_scim_user_v1(bigint, timestamptz),
  loyalty.create_organization_scim_endpoint_command_v1(
    uuid, uuid, text, bytea, text, uuid
  ),
  loyalty.update_organization_scim_endpoint_command_v1(
    uuid, uuid, bigint, text, bytea, text, text, uuid
  ),
  loyalty.map_organization_scim_group_role_command_v1(
    uuid, uuid, uuid, bigint, text, text, text, uuid
  ),
  loyalty.claim_organization_scim_membership_v1(uuid, uuid),
  loyalty_private.authorize_organization_scim_request_v1(uuid, bytea),
  loyalty_private.organization_scim_request_v1(
    uuid, bytea, text, text, uuid, text, text, integer, integer,
    jsonb, text, uuid
  ),
  loyalty.organization_scim_workspace_v1(uuid)
from public, anon, authenticated, loyalty_runtime, loyalty_worker;

grant execute on function loyalty.create_organization_scim_endpoint_command_v1(
    uuid, uuid, text, bytea, text, uuid
  ),
  loyalty.update_organization_scim_endpoint_command_v1(
    uuid, uuid, bigint, text, bytea, text, text, uuid
  ),
  loyalty.map_organization_scim_group_role_command_v1(
    uuid, uuid, uuid, bigint, text, text, text, uuid
  ),
  loyalty.claim_organization_scim_membership_v1(uuid, uuid),
  loyalty.organization_scim_workspace_v1(uuid)
to authenticated;

grant execute on function loyalty_private.organization_scim_request_v1(
  uuid, bytea, text, text, uuid, text, text, integer, integer,
  jsonb, text, uuid
) to loyalty_runtime;

comment on table loyalty.organization_scim_endpoints is
  'Organization and federation-source-scoped SCIM endpoints with digest-only one-time credentials and bounded quotas.';
comment on table loyalty.organization_scim_users is
  'Private SCIM directory Users; externalId is the only Authentik subject correlation and email or username never grants authority.';
comment on table loyalty.organization_scim_groups is
  'Private SCIM Groups with an explicit owner/admin non-owner role allowlist; display names never imply roles.';
comment on table loyalty.organization_scim_audit_events is
  'Immutable minimized SCIM evidence without bearer tokens, raw bodies, username, email, display name, or provider claims.';
comment on function loyalty_private.resolve_scim_provider_subject_v1(uuid, text) is
  'Migration-admin-owned narrow Auth bridge returning only an exact provider subject for one Auth UUID; callable only by loyalty_owner.';
comment on function loyalty.claim_organization_scim_membership_v1(uuid, uuid) is
  'Derives the live Auth UUID and provider subject then requires a matching active SCIM User and exactly one allowlisted role before membership reconciliation.';
comment on function loyalty_private.organization_scim_request_v1(
  uuid, bytea, text, text, uuid, text, text, integer, integer,
  jsonb, text, uuid
) is
  'Database-authoritative bounded SCIM 2.0 request boundary with digest authentication, quota, filtering, pagination, ETags, idempotent resources, and same-transaction deprovisioning.';

create or replace function loyalty.resolve_organization_federation_login_v2(
  target_organization_slug text
)
returns table (organization_id uuid, provider text)
language sql
stable
security definer
set search_path = ''
set statement_timeout = '2s'
as $$
  select organization.public_id, source.supabase_provider_identifier
  from loyalty.organizations as organization
  join loyalty.organization_federation_sources as source
    on source.organization_id = organization.id
  where target_organization_slug is not null
    and target_organization_slug = lower(btrim(target_organization_slug))
    and length(target_organization_slug) between 2 and 80
    and target_organization_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and organization.slug = target_organization_slug
    and organization.status = 'active'
    and organization.offboarded_at is null
    and source.status = 'enabled'
    and source.pending_action is null
  limit 1;
$$;

alter function loyalty.resolve_organization_federation_login_v2(text)
  owner to loyalty_owner;
revoke all on function loyalty.resolve_organization_federation_login_v2(text)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty.resolve_organization_federation_login_v2(text)
  to anon, authenticated;
comment on function loyalty.resolve_organization_federation_login_v2(text) is
  'Returns an opaque organization ID and custom provider for callback binding; the selector chooses only a login route and never membership or role authority.';
