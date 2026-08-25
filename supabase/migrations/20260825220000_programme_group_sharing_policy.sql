-- M11-S01: explicit, versioned multi-workspace programme-group policy. The
-- existing programme group remains the wallet boundary; this change makes its
-- workspace topology reviewable, tenant-authorized, idempotent, and immutable.

create table loyalty.programme_group_sharing_versions (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  programme_group_id bigint not null,
  revision integer not null check (revision > 0),
  sharing_mode text not null
    check (sharing_mode in ('isolated', 'explicit-workspace-allowlist')),
  source_kind text not null check (source_kind in ('migration', 'merchant_command')),
  created_by_user_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, programme_group_id, revision),
  foreign key (organization_id, programme_group_id)
    references loyalty.programme_groups(organization_id, id) on delete restrict,
  check (
    (source_kind = 'migration' and created_by_user_id is null)
    or (source_kind = 'merchant_command' and created_by_user_id is not null)
  )
);

create index programme_group_sharing_versions_current_idx
  on loyalty.programme_group_sharing_versions (
    organization_id, programme_group_id, revision desc, id desc
  );

create table loyalty.programme_group_sharing_version_workspaces (
  id bigint generated always as identity primary key,
  organization_id bigint not null,
  sharing_version_id bigint not null,
  workspace_id bigint not null,
  ordinal smallint not null check (ordinal between 1 and 25),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, sharing_version_id, workspace_id),
  unique (organization_id, sharing_version_id, ordinal),
  foreign key (organization_id, sharing_version_id)
    references loyalty.programme_group_sharing_versions(organization_id, id)
    on delete restrict,
  foreign key (organization_id, workspace_id)
    references loyalty.workspaces(organization_id, id) on delete restrict
);

create index programme_group_sharing_version_workspaces_lookup_idx
  on loyalty.programme_group_sharing_version_workspaces (
    organization_id, workspace_id, sharing_version_id
  );

alter table loyalty.programme_group_sharing_versions owner to loyalty_owner;
alter table loyalty.programme_group_sharing_version_workspaces owner to loyalty_owner;

create trigger programme_group_sharing_versions_immutable
before update or delete on loyalty.programme_group_sharing_versions
for each row execute function loyalty_private.reject_immutable_change();

create trigger programme_group_sharing_version_workspaces_immutable
before update or delete on loyalty.programme_group_sharing_version_workspaces
for each row execute function loyalty_private.reject_immutable_change();

do $$
begin
  if exists (
    select 1
    from loyalty.programme_group_workspaces as link
    group by link.organization_id, link.programme_group_id
    having count(*) > 25
  ) then
    raise exception using
      errcode = '54000',
      message = 'existing programme group exceeds the 25-workspace sharing limit';
  end if;

  if exists (
    select 1
    from loyalty.programme_groups as group_record
    join loyalty.programme_group_workspaces as link
      on link.organization_id = group_record.organization_id
     and link.programme_group_id = group_record.id
    where group_record.sharing_policy = 'isolated'
    group by group_record.organization_id, group_record.id
    having count(*) <> 1
  ) then
    raise exception using
      errcode = '23514',
      message = 'existing isolated programme group must link exactly one workspace';
  end if;

  if exists (
    select 1
    from loyalty.programme_groups as group_record
    join loyalty.programme_group_workspaces as link
      on link.organization_id = group_record.organization_id
     and link.programme_group_id = group_record.id
    where group_record.sharing_policy = 'explicit-workspace-allowlist'
    group by group_record.organization_id, group_record.id
    having count(*) < 2
  ) then
    raise exception using
      errcode = '23514',
      message = 'existing shared programme group must link at least two workspaces';
  end if;
end;
$$;

-- Existing topology becomes immutable revision 1 without inventing an actor.
-- Groups without a workspace remain unconfigured and are not exposed as valid
-- policy documents until an owner/admin explicitly configures them.
insert into loyalty.programme_group_sharing_versions (
  organization_id, programme_group_id, revision, sharing_mode,
  source_kind, created_by_user_id, created_at
)
select group_record.organization_id, group_record.id, 1,
  group_record.sharing_policy, 'migration', null, group_record.created_at
from loyalty.programme_groups as group_record
where exists (
  select 1
  from loyalty.programme_group_workspaces as link
  where link.organization_id = group_record.organization_id
    and link.programme_group_id = group_record.id
);

insert into loyalty.programme_group_sharing_version_workspaces (
  organization_id, sharing_version_id, workspace_id, ordinal, created_at
)
select version.organization_id, version.id, link.workspace_id,
  row_number() over (
    partition by version.id order by workspace.public_id
  )::smallint,
  version.created_at
from loyalty.programme_group_sharing_versions as version
join loyalty.programme_group_workspaces as link
  on link.organization_id = version.organization_id
 and link.programme_group_id = version.programme_group_id
join loyalty.workspaces as workspace
  on workspace.organization_id = link.organization_id
 and workspace.id = link.workspace_id
where version.revision = 1 and version.source_kind = 'migration';

alter table loyalty.programme_group_sharing_versions enable row level security;
alter table loyalty.programme_group_sharing_version_workspaces enable row level security;

create policy programme_group_sharing_versions_member_select
  on loyalty.programme_group_sharing_versions
  for select to authenticated
  using ((select loyalty_private.is_organization_member(organization_id)));

create policy programme_group_sharing_version_workspaces_member_select
  on loyalty.programme_group_sharing_version_workspaces
  for select to authenticated
  using ((select loyalty_private.is_organization_member(organization_id)));

revoke all on loyalty.programme_group_sharing_versions
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on loyalty.programme_group_sharing_version_workspaces
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

create or replace function loyalty.get_programme_group_sharing_policy_v1(
  target_programme_group_public_id uuid
)
returns table (policy jsonb)
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  actor_user_id uuid := loyalty_private.request_user_id();
  target_group loyalty.programme_groups%rowtype;
  target_organization_public_id uuid;
  current_version loyalty.programme_group_sharing_versions%rowtype;
  configuration_enabled boolean;
  linked_count integer;
  active_workspace_count integer;
begin
  if actor_user_id is null or target_programme_group_public_id is null then
    return;
  end if;

  select group_record.* into target_group
  from loyalty.programme_groups as group_record
  join loyalty.organizations as organization
    on organization.id = group_record.organization_id
   and organization.status = 'active'
  where group_record.public_id = target_programme_group_public_id
    and group_record.status = 'active'
    and loyalty_private.is_organization_member(group_record.organization_id);
  if not found then
    return;
  end if;

  select organization.public_id into strict target_organization_public_id
  from loyalty.organizations as organization
  where organization.id = target_group.organization_id;

  select version.* into current_version
  from loyalty.programme_group_sharing_versions as version
  where version.organization_id = target_group.organization_id
    and version.programme_group_id = target_group.id
  order by version.revision desc, version.id desc
  limit 1;
  if not found then
    return;
  end if;

  select count(*)::integer into linked_count
  from loyalty.programme_group_workspaces as link
  where link.organization_id = target_group.organization_id
    and link.programme_group_id = target_group.id;

  select count(*)::integer into active_workspace_count
  from loyalty.workspaces as workspace
  where workspace.organization_id = target_group.organization_id
    and workspace.status = 'active';

  if target_group.sharing_policy <> current_version.sharing_mode
    or linked_count = 0
    or active_workspace_count = 0
    or active_workspace_count > 100
    or (current_version.sharing_mode = 'isolated' and linked_count <> 1)
    or (current_version.sharing_mode = 'explicit-workspace-allowlist'
      and linked_count < 2)
    or exists (
      select 1
      from loyalty.programme_group_workspaces as link
      join loyalty.workspaces as workspace
        on workspace.organization_id = link.organization_id
       and workspace.id = link.workspace_id
      where link.organization_id = target_group.organization_id
        and link.programme_group_id = target_group.id
        and workspace.status <> 'active'
    )
    or exists (
      (
        select link.workspace_id
        from loyalty.programme_group_workspaces as link
        where link.organization_id = target_group.organization_id
          and link.programme_group_id = target_group.id
      )
      except
      (
        select version_workspace.workspace_id
        from loyalty.programme_group_sharing_version_workspaces as version_workspace
        where version_workspace.organization_id = target_group.organization_id
          and version_workspace.sharing_version_id = current_version.id
      )
    )
    or exists (
      (
        select version_workspace.workspace_id
        from loyalty.programme_group_sharing_version_workspaces as version_workspace
        where version_workspace.organization_id = target_group.organization_id
          and version_workspace.sharing_version_id = current_version.id
      )
      except
      (
        select link.workspace_id
        from loyalty.programme_group_workspaces as link
        where link.organization_id = target_group.organization_id
          and link.programme_group_id = target_group.id
      )
    ) then
    raise exception using
      errcode = '55000',
      message = 'programme group sharing projection drift';
  end if;

  select entitlement.enabled into configuration_enabled
  from loyalty_private.resolve_organization_entitlement(
    target_group.organization_id,
    'ecosystem.api',
    target_organization_public_id::text,
    now()
  ) as entitlement;

  return query
  select jsonb_build_object(
    'version', '1',
    'programmeGroupId', target_group.public_id,
    'programmeGroupName', target_group.name,
    'mode', current_version.sharing_mode,
    'revision', current_version.revision,
    'configurationEnabled', coalesce(configuration_enabled, false),
    'workspaces', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', workspace.public_id,
          'name', workspace.name,
          'slug', workspace.slug,
          'linked', link.id is not null,
          'removalProtected', exists (
            select 1
            from loyalty.commerce_connections as connection
            join loyalty.programmes as programme
              on programme.organization_id = connection.organization_id
             and programme.id = connection.programme_id
             and programme.programme_group_id = target_group.id
            where connection.organization_id = target_group.organization_id
              and connection.workspace_id = workspace.id
          )
        ) order by workspace.name, workspace.id
      ), '[]'::jsonb
    )
  )
  from loyalty.workspaces as workspace
  left join loyalty.programme_group_workspaces as link
    on link.organization_id = workspace.organization_id
   and link.workspace_id = workspace.id
   and link.programme_group_id = target_group.id
  where workspace.organization_id = target_group.organization_id
    and workspace.status = 'active';
end;
$$;

create or replace function loyalty.configure_programme_group_sharing_v1(
  target_programme_group_public_id uuid,
  target_sharing_mode text,
  target_workspace_public_ids uuid[],
  target_expected_revision integer,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (
  resource_public_id uuid,
  outcome text,
  revision integer,
  sharing_mode text,
  workspace_public_ids uuid[]
)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  actor_user_id uuid := loyalty_private.request_user_id();
  target_group loyalty.programme_groups%rowtype;
  target_organization_public_id uuid;
  current_version loyalty.programme_group_sharing_versions%rowtype;
  existing_audit loyalty.admin_audit_events%rowtype;
  canonical_workspace_public_ids uuid[];
  selected_workspace_ids bigint[];
  request_hash bytea;
  created_version loyalty.programme_group_sharing_versions%rowtype;
  next_revision integer;
  configuration_enabled boolean;
  command_time timestamptz := clock_timestamp();
begin
  if actor_user_id is null
    or target_programme_group_public_id is null
    or target_sharing_mode not in ('isolated', 'explicit-workspace-allowlist')
    or target_workspace_public_ids is null
    or cardinality(target_workspace_public_ids) not between 1 and 25
    or array_position(target_workspace_public_ids, null) is not null
    or target_expected_revision is null or target_expected_revision < 0
    or target_idempotency_key is null
    or length(btrim(target_idempotency_key)) not between 1 and 255
    or target_idempotency_key <> btrim(target_idempotency_key)
    or target_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid sharing command input';
  end if;

  select array_agg(candidate.workspace_public_id order by candidate.workspace_public_id)
  into canonical_workspace_public_ids
  from (
    select distinct unnest(target_workspace_public_ids) as workspace_public_id
  ) as candidate;
  if cardinality(canonical_workspace_public_ids) <> cardinality(target_workspace_public_ids)
    or (target_sharing_mode = 'isolated'
      and cardinality(canonical_workspace_public_ids) <> 1)
    or (target_sharing_mode = 'explicit-workspace-allowlist'
      and cardinality(canonical_workspace_public_ids) < 2) then
    raise exception using errcode = '22023', message = 'invalid sharing workspace allowlist';
  end if;

  select group_record.* into target_group
  from loyalty.programme_groups as group_record
  join loyalty.organizations as organization
    on organization.id = group_record.organization_id
   and organization.status = 'active'
  where group_record.public_id = target_programme_group_public_id
    and group_record.status = 'active'
    and loyalty_private.has_organization_role(
      group_record.organization_id,
      array['owner', 'admin']::text[]
    )
  for update of group_record;
  if not found then
    raise exception using errcode = '42501', message = 'sharing command not authorized';
  end if;

  select organization.public_id into strict target_organization_public_id
  from loyalty.organizations as organization
  where organization.id = target_group.organization_id;

  select entitlement.enabled into configuration_enabled
  from loyalty_private.resolve_organization_entitlement(
    target_group.organization_id,
    'ecosystem.api',
    target_organization_public_id::text,
    now()
  ) as entitlement;
  if not coalesce(configuration_enabled, false) then
    raise exception using errcode = '42501', message = 'ecosystem capability disabled';
  end if;

  request_hash := extensions.digest(
    convert_to(
      'programme-group.sharing.configure|' || target_group.public_id::text || '|' ||
      target_sharing_mode || '|' || target_expected_revision::text || '|' ||
      array_to_string(canonical_workspace_public_ids, ','),
      'UTF8'
    ),
    'sha256'
  );

  select audit.* into existing_audit
  from loyalty.admin_audit_events as audit
  where audit.organization_id = target_group.organization_id
    and audit.idempotency_key = target_idempotency_key;
  if found then
    if existing_audit.action <> 'programme_group.sharing.configure'
      or existing_audit.request_sha256 <> request_hash then
      raise exception using errcode = '23514', message = 'sharing command idempotency conflict';
    end if;
    return query
    select version.public_id, 'duplicate'::text, version.revision,
      version.sharing_mode,
      array_agg(workspace.public_id order by workspace.public_id)
    from loyalty.programme_group_sharing_versions as version
    join loyalty.programme_group_sharing_version_workspaces as version_workspace
      on version_workspace.organization_id = version.organization_id
     and version_workspace.sharing_version_id = version.id
    join loyalty.workspaces as workspace
      on workspace.organization_id = version_workspace.organization_id
     and workspace.id = version_workspace.workspace_id
    where version.organization_id = target_group.organization_id
      and version.public_id = existing_audit.resource_public_id
    group by version.public_id, version.revision, version.sharing_mode;
    return;
  end if;

  select version.* into current_version
  from loyalty.programme_group_sharing_versions as version
  where version.organization_id = target_group.organization_id
    and version.programme_group_id = target_group.id
  order by version.revision desc, version.id desc
  limit 1;
  next_revision := coalesce(current_version.revision, 0) + 1;
  if coalesce(current_version.revision, 0) <> target_expected_revision then
    raise exception using errcode = '23514', message = 'sharing policy revision conflict';
  end if;

  select array_agg(candidate.id order by candidate.public_id)
  into selected_workspace_ids
  from (
    select workspace.id, workspace.public_id
    from loyalty.workspaces as workspace
    where workspace.organization_id = target_group.organization_id
      and workspace.public_id = any(canonical_workspace_public_ids)
      and workspace.status = 'active'
    order by workspace.id
    for update
  ) as candidate;
  if coalesce(cardinality(selected_workspace_ids), 0)
    <> cardinality(canonical_workspace_public_ids) then
    raise exception using errcode = '42501', message = 'sharing workspace not authorized';
  end if;

  if exists (
    select 1
    from loyalty.programme_group_workspaces as link
    join loyalty.workspaces as workspace
      on workspace.organization_id = link.organization_id
     and workspace.id = link.workspace_id
    where link.organization_id = target_group.organization_id
      and link.programme_group_id = target_group.id
      and not (workspace.public_id = any(canonical_workspace_public_ids))
      and exists (
        select 1
        from loyalty.commerce_connections as connection
        join loyalty.programmes as programme
          on programme.organization_id = connection.organization_id
         and programme.id = connection.programme_id
         and programme.programme_group_id = target_group.id
        where connection.organization_id = target_group.organization_id
          and connection.workspace_id = workspace.id
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'linked connector workspace cannot be removed from sharing policy';
  end if;

  delete from loyalty.programme_group_workspaces as link
  using loyalty.workspaces as workspace
  where link.organization_id = target_group.organization_id
    and link.programme_group_id = target_group.id
    and workspace.organization_id = link.organization_id
    and workspace.id = link.workspace_id
    and not (workspace.public_id = any(canonical_workspace_public_ids));

  insert into loyalty.programme_group_workspaces (
    organization_id, programme_group_id, workspace_id, created_at
  )
  select target_group.organization_id, target_group.id, workspace_id, command_time
  from unnest(selected_workspace_ids) as selected(workspace_id)
  on conflict (organization_id, programme_group_id, workspace_id) do nothing;

  update loyalty.programme_groups as group_record
  set sharing_policy = target_sharing_mode, updated_at = command_time
  where group_record.organization_id = target_group.organization_id
    and group_record.id = target_group.id;

  insert into loyalty.programme_group_sharing_versions (
    organization_id, programme_group_id, revision, sharing_mode,
    source_kind, created_by_user_id, created_at
  ) values (
    target_group.organization_id, target_group.id, next_revision,
    target_sharing_mode, 'merchant_command', actor_user_id, command_time
  ) returning * into strict created_version;

  insert into loyalty.programme_group_sharing_version_workspaces (
    organization_id, sharing_version_id, workspace_id, ordinal, created_at
  )
  select target_group.organization_id, created_version.id, workspace.id,
    selected.ordinality::smallint, command_time
  from unnest(canonical_workspace_public_ids)
    with ordinality as selected(workspace_public_id, ordinality)
  join loyalty.workspaces as workspace
    on workspace.organization_id = target_group.organization_id
   and workspace.public_id = selected.workspace_public_id;

  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id,
    metadata, created_at
  ) values (
    target_group.organization_id, actor_user_id,
    'programme_group.sharing.configure', 'programme_group_sharing_version',
    created_version.public_id, target_idempotency_key, request_hash,
    target_correlation_id,
    jsonb_build_object(
      'programmeGroupPublicId', target_group.public_id,
      'revision', next_revision,
      'sharingMode', target_sharing_mode,
      'workspacePublicIds', to_jsonb(canonical_workspace_public_ids)
    ),
    command_time
  );

  return query select created_version.public_id, 'created'::text,
    created_version.revision, created_version.sharing_mode,
    canonical_workspace_public_ids;
end;
$$;

alter function loyalty.get_programme_group_sharing_policy_v1(uuid)
  owner to loyalty_owner;
alter function loyalty.configure_programme_group_sharing_v1(
  uuid, text, uuid[], integer, text, uuid
) owner to loyalty_owner;

revoke all on function loyalty.get_programme_group_sharing_policy_v1(uuid)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function loyalty.configure_programme_group_sharing_v1(
  uuid, text, uuid[], integer, text, uuid
) from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty.get_programme_group_sharing_policy_v1(uuid)
  to authenticated;
grant execute on function loyalty.configure_programme_group_sharing_v1(
  uuid, text, uuid[], integer, text, uuid
) to authenticated;

comment on table loyalty.programme_group_sharing_versions is
  'Immutable reviewed revisions of the explicit programme-group wallet-sharing topology.';
comment on function loyalty.get_programme_group_sharing_policy_v1(uuid) is
  'Returns one minimized, reconciled, tenant-authorized programme-group workspace policy.';
comment on function loyalty.configure_programme_group_sharing_v1(
  uuid, text, uuid[], integer, text, uuid
) is
  'Owner/admin command for exact isolated or explicit-workspace-allowlist topology; derives tenant and actor from live Auth.';
