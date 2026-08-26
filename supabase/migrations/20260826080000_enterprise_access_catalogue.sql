-- M13-S01: versioned enterprise access profiles and minimized live review.
-- Authentication claims identify a subject only. PostgreSQL membership or a
-- later scoped support grant remains the sole tenant authority.

alter table loyalty.organization_memberships
  drop constraint organization_memberships_role_check;
alter table loyalty.organization_memberships
  add constraint organization_memberships_role_check
  check (role in ('owner', 'admin', 'marketer', 'operator', 'analyst', 'auditor'));

create table loyalty.enterprise_access_profiles (
  catalog_version text not null,
  role text not null,
  label text not null,
  description text not null,
  assignment_kind text not null,
  sort_order smallint not null,
  created_at timestamptz not null default now(),
  primary key (catalog_version, role),
  unique (catalog_version, sort_order),
  check (catalog_version ~ '^[1-9][0-9]{0,5}$'),
  check (role in ('owner', 'admin', 'marketer', 'operator', 'support', 'analyst', 'auditor')),
  check (length(btrim(label)) between 1 and 40),
  check (length(btrim(description)) between 1 and 240),
  check (assignment_kind in ('membership', 'support_grant')),
  check ((role = 'support') = (assignment_kind = 'support_grant')),
  check (sort_order between 1 and 7)
);

create table loyalty.enterprise_access_profile_permissions (
  catalog_version text not null,
  role text not null,
  permission text not null,
  sort_order smallint not null,
  created_at timestamptz not null default now(),
  primary key (catalog_version, role, permission),
  unique (catalog_version, role, sort_order),
  foreign key (catalog_version, role)
    references loyalty.enterprise_access_profiles(catalog_version, role)
    on delete restrict,
  check (permission in (
    'organization.view',
    'organization.lifecycle.manage',
    'members.view',
    'members.manage',
    'identity.configure',
    'support.approve',
    'agency.manage',
    'audit.view'
  )),
  check (sort_order between 1 and 8)
);

alter table loyalty.enterprise_access_profiles owner to loyalty_owner;
alter table loyalty.enterprise_access_profile_permissions owner to loyalty_owner;

insert into loyalty.enterprise_access_profiles (
  catalog_version, role, label, description, assignment_kind, sort_order
) values
  ('1', 'owner', 'Owner', 'Controls tenant identity, recovery, support approval, and agency authority.', 'membership', 1),
  ('1', 'admin', 'Admin', 'Administers tenant members and enterprise identity without owner-only recovery powers.', 'membership', 2),
  ('1', 'marketer', 'Marketer', 'Operates loyalty marketing configuration outside the M13 administration boundary.', 'membership', 3),
  ('1', 'operator', 'Operator', 'Operates connectors and fulfilment outside the M13 administration boundary.', 'membership', 4),
  ('1', 'support', 'Support', 'Uses a separately approved, scoped, expiring, and tenant-visible support grant.', 'support_grant', 5),
  ('1', 'analyst', 'Analyst', 'Reads tenant reporting outside the M13 administration boundary.', 'membership', 6),
  ('1', 'auditor', 'Auditor', 'Reviews membership and immutable administration evidence without mutation authority.', 'membership', 7);

insert into loyalty.enterprise_access_profile_permissions (
  catalog_version, role, permission, sort_order
) values
  ('1', 'owner', 'organization.view', 1),
  ('1', 'owner', 'organization.lifecycle.manage', 2),
  ('1', 'owner', 'members.view', 3),
  ('1', 'owner', 'members.manage', 4),
  ('1', 'owner', 'identity.configure', 5),
  ('1', 'owner', 'support.approve', 6),
  ('1', 'owner', 'agency.manage', 7),
  ('1', 'owner', 'audit.view', 8),
  ('1', 'admin', 'organization.view', 1),
  ('1', 'admin', 'members.view', 2),
  ('1', 'admin', 'members.manage', 3),
  ('1', 'admin', 'identity.configure', 4),
  ('1', 'admin', 'audit.view', 5),
  ('1', 'marketer', 'organization.view', 1),
  ('1', 'operator', 'organization.view', 1),
  ('1', 'support', 'organization.view', 1),
  ('1', 'analyst', 'organization.view', 1),
  ('1', 'auditor', 'organization.view', 1),
  ('1', 'auditor', 'members.view', 2),
  ('1', 'auditor', 'audit.view', 3);

create trigger enterprise_access_profiles_immutable
before update or delete on loyalty.enterprise_access_profiles
for each row execute function loyalty_private.reject_immutable_change();

create trigger enterprise_access_profile_permissions_immutable
before update or delete on loyalty.enterprise_access_profile_permissions
for each row execute function loyalty_private.reject_immutable_change();

alter table loyalty.enterprise_access_profiles enable row level security;
alter table loyalty.enterprise_access_profile_permissions enable row level security;

revoke all on loyalty.enterprise_access_profiles,
  loyalty.enterprise_access_profile_permissions
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

create or replace function loyalty_private.has_enterprise_permission_v1(
  target_organization_id bigint,
  target_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
  select exists (
    select 1
    from loyalty.organization_memberships as membership
    join loyalty.organizations as organization
      on organization.id = membership.organization_id
     and organization.status = 'active'
    join loyalty.enterprise_access_profile_permissions as profile_permission
      on profile_permission.catalog_version = '1'
     and profile_permission.role = membership.role
     and profile_permission.permission = target_permission
    where membership.organization_id = target_organization_id
      and membership.user_id = loyalty_private.request_user_id()
      and membership.revoked_at is null
  );
$$;

alter function loyalty_private.has_enterprise_permission_v1(bigint, text)
  owner to loyalty_owner;
revoke all on function loyalty_private.has_enterprise_permission_v1(bigint, text)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

create or replace function loyalty.get_organization_access_workspace_v1(
  target_organization_public_id uuid
)
returns table (workspace jsonb)
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  actor_user_id uuid := loyalty_private.request_user_id();
  selected record;
begin
  if target_organization_public_id is null then
    raise exception using errcode = '22023', message = 'invalid organization access request';
  end if;
  if actor_user_id is null then
    return;
  end if;

  select organization.id as organization_id,
    organization.public_id as organization_public_id,
    organization.name as organization_name,
    organization.slug as organization_slug,
    organization.status as organization_status,
    membership.role
  into selected
  from loyalty.organizations as organization
  join loyalty.organization_memberships as membership
    on membership.organization_id = organization.id
   and membership.user_id = actor_user_id
   and membership.revoked_at is null
  where organization.public_id = target_organization_public_id;
  if not found
     or selected.role = 'support' then
    return;
  end if;

  return query
  with profiles as (
    select jsonb_agg(
      jsonb_build_object(
        'role', profile.role,
        'label', profile.label,
        'description', profile.description,
        'assignmentKind', profile.assignment_kind,
        'permissions', coalesce((
          select jsonb_agg(permission.permission order by permission.sort_order)
          from loyalty.enterprise_access_profile_permissions as permission
          where permission.catalog_version = profile.catalog_version
            and permission.role = profile.role
        ), '[]'::jsonb)
      ) order by profile.sort_order
    ) as value
    from loyalty.enterprise_access_profiles as profile
    where profile.catalog_version = '1'
  ), current_permissions as (
    select coalesce(
      jsonb_agg(permission.permission order by permission.sort_order),
      '[]'::jsonb
    ) as value
    from loyalty.enterprise_access_profile_permissions as permission
    where permission.catalog_version = '1'
      and permission.role = selected.role
  ), membership_counts as (
    select jsonb_agg(
      jsonb_build_object(
        'role', profile.role,
        'count', coalesce(role_count.value, 0)
      ) order by profile.sort_order
    ) as value
    from loyalty.enterprise_access_profiles as profile
    left join lateral (
      select count(*)::integer as value
      from loyalty.organization_memberships as membership
      where membership.organization_id = selected.organization_id
        and membership.role = profile.role
        and membership.revoked_at is null
    ) as role_count on true
    where profile.catalog_version = '1'
      and profile.assignment_kind = 'membership'
  )
  select jsonb_build_object(
    'schemaVersion', '1',
    'organization', jsonb_build_object(
      'id', selected.organization_public_id,
      'name', selected.organization_name,
      'slug', selected.organization_slug,
      'status', selected.organization_status
    ),
    'currentAccess', jsonb_build_object(
      'role', selected.role,
      'assignmentKind', 'membership',
      'effective', selected.organization_status = 'active',
      'permissions', current_permissions.value
    ),
    'catalogue', jsonb_build_object(
      'schemaVersion', '1',
      'profiles', profiles.value
    ),
    'activeMembershipCounts', membership_counts.value
  )
  from profiles, current_permissions, membership_counts;
end;
$$;

alter function loyalty.get_organization_access_workspace_v1(uuid)
  owner to loyalty_owner;
revoke all on function loyalty.get_organization_access_workspace_v1(uuid)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty.get_organization_access_workspace_v1(uuid)
  to authenticated;

comment on table loyalty.enterprise_access_profiles is
  'Immutable V1 enterprise role definitions; support is structurally grant-only.';
comment on table loyalty.enterprise_access_profile_permissions is
  'Immutable M13 administration permissions, not an implicit expansion of legacy product commands.';
comment on function loyalty_private.has_enterprise_permission_v1(bigint, text) is
  'Checks one M13 permission against the request subject live membership and active organization; upstream claims are not authority.';
comment on function loyalty.get_organization_access_workspace_v1(uuid) is
  'Returns a minimized seven-profile access review for one live tenant member without identity or claim data.';
