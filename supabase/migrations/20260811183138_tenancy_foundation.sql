-- Phase 3 tenancy and authorization foundation.
-- Runtime roles are NOLOGIN group roles; deployment grants them only to
-- separately credentialed login roles.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'loyalty_owner') then
    create role loyalty_owner
      nologin noinherit nosuperuser nocreatedb nocreaterole
      noreplication nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'loyalty_runtime') then
    create role loyalty_runtime
      nologin noinherit nosuperuser nocreatedb nocreaterole
      noreplication nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'loyalty_worker') then
    create role loyalty_worker
      nologin noinherit nosuperuser nocreatedb nocreaterole
      noreplication nobypassrls;
  end if;
end
$$;

-- Supabase migrations run as a dedicated administration role. PostgreSQL
-- requires that role to be a member of the target owner before ownership can
-- be transferred. Runtime roles are never granted this membership.
grant loyalty_owner to current_user;

grant usage, create on schema loyalty, loyalty_private to loyalty_owner;

create table loyalty.organizations (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  slug text not null unique,
  name text not null,
  status text not null default 'active'
    check (status in ('active', 'suspended', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(btrim(slug)) between 2 and 80),
  check (slug = lower(slug)),
  check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  check (length(btrim(name)) between 1 and 200),
  check (updated_at >= created_at)
);

create table loyalty.organization_memberships (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null
    references loyalty.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null
    check (role in ('owner', 'admin', 'operator', 'analyst', 'auditor')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (organization_id, user_id),
  check (revoked_at is null or revoked_at >= created_at)
);

create index organization_memberships_user_active_idx
  on loyalty.organization_memberships (user_id, organization_id)
  where revoked_at is null;
create index organization_memberships_organization_role_active_idx
  on loyalty.organization_memberships (organization_id, role, user_id)
  where revoked_at is null;

create table loyalty.workspaces (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null
    references loyalty.organizations(id) on delete cascade,
  slug text not null,
  name text not null,
  status text not null default 'active'
    check (status in ('active', 'suspended', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, slug),
  check (length(btrim(slug)) between 2 and 80),
  check (slug = lower(slug)),
  check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  check (length(btrim(name)) between 1 and 200),
  check (updated_at >= created_at)
);

create index workspaces_organization_status_idx
  on loyalty.workspaces (organization_id, status, id);

create table loyalty.programme_groups (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null
    references loyalty.organizations(id) on delete cascade,
  slug text not null,
  name text not null,
  sharing_policy text not null default 'isolated'
    check (sharing_policy in ('isolated', 'explicit-workspace-allowlist')),
  status text not null default 'active'
    check (status in ('active', 'suspended', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, slug),
  check (length(btrim(slug)) between 2 and 80),
  check (slug = lower(slug)),
  check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  check (length(btrim(name)) between 1 and 200),
  check (updated_at >= created_at)
);

create index programme_groups_organization_status_idx
  on loyalty.programme_groups (organization_id, status, id);

create table loyalty.programme_group_workspaces (
  id bigint generated always as identity primary key,
  organization_id bigint not null
    references loyalty.organizations(id) on delete cascade,
  programme_group_id bigint not null,
  workspace_id bigint not null,
  created_at timestamptz not null default now(),
  unique (organization_id, programme_group_id, workspace_id),
  foreign key (organization_id, programme_group_id)
    references loyalty.programme_groups(organization_id, id) on delete cascade,
  foreign key (organization_id, workspace_id)
    references loyalty.workspaces(organization_id, id) on delete cascade
);

create index programme_group_workspaces_workspace_idx
  on loyalty.programme_group_workspaces (organization_id, workspace_id, programme_group_id);

create table loyalty.support_access_grants (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null
    references loyalty.organizations(id) on delete cascade,
  support_user_id uuid not null references auth.users(id) on delete cascade,
  approved_by_user_id uuid not null references auth.users(id) on delete restrict,
  reason text not null,
  scopes text[] not null,
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (length(btrim(reason)) between 8 and 1000),
  check (cardinality(scopes) between 1 and 20),
  check (expires_at > starts_at),
  check (revoked_at is null or revoked_at >= starts_at)
);

create index support_access_grants_support_active_idx
  on loyalty.support_access_grants (support_user_id, expires_at, organization_id)
  where revoked_at is null;
create index support_access_grants_organization_idx
  on loyalty.support_access_grants (organization_id, created_at desc);

alter table loyalty.organizations owner to loyalty_owner;
alter table loyalty.organization_memberships owner to loyalty_owner;
alter table loyalty.workspaces owner to loyalty_owner;
alter table loyalty.programme_groups owner to loyalty_owner;
alter table loyalty.programme_group_workspaces owner to loyalty_owner;
alter table loyalty.support_access_grants owner to loyalty_owner;

create or replace function loyalty_private.is_organization_member(
  target_organization_id bigint
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from loyalty.organization_memberships as membership
      where membership.organization_id = target_organization_id
        and membership.user_id = (select auth.uid())
        and membership.revoked_at is null
    );
$$;

create or replace function loyalty_private.has_organization_role(
  target_organization_id bigint,
  allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and coalesce(cardinality(allowed_roles), 0) > 0
    and exists (
      select 1
      from loyalty.organization_memberships as membership
      where membership.organization_id = target_organization_id
        and membership.user_id = (select auth.uid())
        and membership.role = any(allowed_roles)
        and membership.revoked_at is null
    );
$$;

create or replace function loyalty_private.can_access_workspace(
  target_workspace_id bigint
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from loyalty.workspaces as workspace
    join loyalty.organization_memberships as membership
      on membership.organization_id = workspace.organization_id
    where workspace.id = target_workspace_id
      and membership.user_id = (select auth.uid())
      and membership.revoked_at is null
  );
$$;

alter function loyalty_private.is_organization_member(bigint)
  owner to loyalty_owner;
alter function loyalty_private.has_organization_role(bigint, text[])
  owner to loyalty_owner;
alter function loyalty_private.can_access_workspace(bigint)
  owner to loyalty_owner;

revoke all on function loyalty_private.is_organization_member(bigint)
  from public, anon, authenticated;
revoke all on function loyalty_private.has_organization_role(bigint, text[])
  from public, anon, authenticated;
revoke all on function loyalty_private.can_access_workspace(bigint)
  from public, anon, authenticated;
grant execute on function loyalty_private.is_organization_member(bigint)
  to authenticated;
grant execute on function loyalty_private.has_organization_role(bigint, text[])
  to authenticated;
grant execute on function loyalty_private.can_access_workspace(bigint)
  to authenticated;

alter table loyalty.organizations enable row level security;
alter table loyalty.organization_memberships enable row level security;
alter table loyalty.workspaces enable row level security;
alter table loyalty.programme_groups enable row level security;
alter table loyalty.programme_group_workspaces enable row level security;
alter table loyalty.support_access_grants enable row level security;

create policy organizations_member_select
  on loyalty.organizations
  for select
  to authenticated
  using ((select loyalty_private.is_organization_member(id)));

create policy organization_memberships_self_or_admin_select
  on loyalty.organization_memberships
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or (select loyalty_private.has_organization_role(
      organization_id,
      array['owner', 'admin']::text[]
    ))
  );

create policy workspaces_member_select
  on loyalty.workspaces
  for select
  to authenticated
  using ((select loyalty_private.is_organization_member(organization_id)));

create policy programme_groups_member_select
  on loyalty.programme_groups
  for select
  to authenticated
  using ((select loyalty_private.is_organization_member(organization_id)));

create policy programme_group_workspaces_member_select
  on loyalty.programme_group_workspaces
  for select
  to authenticated
  using ((select loyalty_private.is_organization_member(organization_id)));

create policy support_access_grants_subject_or_admin_select
  on loyalty.support_access_grants
  for select
  to authenticated
  using (
    support_user_id = (select auth.uid())
    or (select loyalty_private.has_organization_role(
      organization_id,
      array['owner', 'admin']::text[]
    ))
  );

revoke all on schema loyalty from public, anon, authenticated;
revoke all on schema loyalty_private from public, anon, authenticated;
revoke all on all tables in schema loyalty from public, anon, authenticated;
revoke all on all sequences in schema loyalty from public, anon, authenticated;

grant usage on schema loyalty to authenticated;
grant select on loyalty.organizations to authenticated;
grant select on loyalty.organization_memberships to authenticated;
grant select on loyalty.workspaces to authenticated;
grant select on loyalty.programme_groups to authenticated;
grant select on loyalty.programme_group_workspaces to authenticated;
grant select on loyalty.support_access_grants to authenticated;

alter default privileges in schema loyalty
  revoke all on tables from public, anon, authenticated;
alter default privileges in schema loyalty
  revoke all on sequences from public, anon, authenticated;
alter default privileges in schema loyalty
  revoke execute on functions from public, anon, authenticated;
alter default privileges in schema loyalty_private
  revoke all on tables from public, anon, authenticated;
alter default privileges in schema loyalty_private
  revoke all on sequences from public, anon, authenticated;
alter default privileges in schema loyalty_private
  revoke execute on functions from public, anon, authenticated;

comment on table loyalty.organizations is
  'Security and billing tenant; never derive this scope from client input alone.';
comment on table loyalty.organization_memberships is
  'Live tenant authorization source; user-editable JWT metadata is not authority.';
comment on table loyalty.workspaces is
  'Operational store or approved store-group scope within one organization.';
comment on table loyalty.programme_groups is
  'Explicit loyalty currency and wallet-sharing boundary.';
comment on table loyalty.support_access_grants is
  'Scoped and expiring support authority; each use must later create an audit event.';
