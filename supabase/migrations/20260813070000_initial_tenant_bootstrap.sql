-- Deployment-only first-tenant bootstrap. This boundary is intentionally
-- absent from the browser Data API: an administrator connects directly to
-- PostgreSQL, assumes loyalty_owner for one transaction, and supplies an
-- already-created Supabase Auth user UUID.

create or replace function loyalty_private.bootstrap_initial_tenant(
  target_auth_user_id uuid,
  target_organization_slug text,
  target_organization_name text,
  target_workspace_slug text,
  target_workspace_name text,
  target_programme_group_slug text,
  target_programme_group_name text,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (
  organization_public_id uuid,
  workspace_public_id uuid,
  programme_group_public_id uuid,
  membership_public_id uuid,
  outcome text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_hash bytea;
  existing_audit loyalty.admin_audit_events%rowtype;
  organization_row loyalty.organizations%rowtype;
  workspace_row loyalty.workspaces%rowtype;
  programme_group_row loyalty.programme_groups%rowtype;
  membership_row loyalty.organization_memberships%rowtype;
begin
  if target_auth_user_id is null or target_correlation_id is null then
    raise exception 'bootstrap identity and correlation are required'
      using errcode = '22023';
  end if;
  if target_organization_slug is null
     or target_organization_slug <> lower(btrim(target_organization_slug))
     or target_organization_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or length(target_organization_slug) not between 2 and 80
     or target_workspace_slug is null
     or target_workspace_slug <> lower(btrim(target_workspace_slug))
     or target_workspace_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or length(target_workspace_slug) not between 2 and 80
     or target_programme_group_slug is null
     or target_programme_group_slug <> lower(btrim(target_programme_group_slug))
     or target_programme_group_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or length(target_programme_group_slug) not between 2 and 80 then
    raise exception 'bootstrap slugs must be canonical'
      using errcode = '22023';
  end if;
  if target_organization_name is null
     or target_organization_name <> btrim(target_organization_name)
     or length(target_organization_name) not between 1 and 200
     or target_workspace_name is null
     or target_workspace_name <> btrim(target_workspace_name)
     or length(target_workspace_name) not between 1 and 200
     or target_programme_group_name is null
     or target_programme_group_name <> btrim(target_programme_group_name)
     or length(target_programme_group_name) not between 1 and 200 then
    raise exception 'bootstrap names must be canonical'
      using errcode = '22023';
  end if;
  if target_idempotency_key is null
     or target_idempotency_key <> btrim(target_idempotency_key)
     or length(target_idempotency_key) not between 1 and 255 then
    raise exception 'bootstrap idempotency key is invalid'
      using errcode = '22023';
  end if;
  request_hash := extensions.digest(
    convert_to(
      jsonb_build_object(
        'auth_user_id', target_auth_user_id,
        'organization_slug', target_organization_slug,
        'organization_name', target_organization_name,
        'workspace_slug', target_workspace_slug,
        'workspace_name', target_workspace_name,
        'programme_group_slug', target_programme_group_slug,
        'programme_group_name', target_programme_group_name
      )::text,
      'UTF8'
    ),
    'sha256'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'starfiniti:tenant-bootstrap:' || target_organization_slug,
      0
    )
  );

  select organization.* into organization_row
  from loyalty.organizations as organization
  where organization.slug = target_organization_slug;

  if organization_row.id is not null then
    select audit.* into existing_audit
    from loyalty.admin_audit_events as audit
    where audit.organization_id = organization_row.id
      and audit.idempotency_key = target_idempotency_key;

    if existing_audit.id is null then
      raise exception 'bootstrap organization slug already exists'
        using errcode = '23505';
    end if;
    if existing_audit.action <> 'tenant.bootstrap'
       or existing_audit.request_sha256 <> request_hash
       or existing_audit.actor_user_id <> target_auth_user_id then
      raise exception 'bootstrap idempotency conflict'
        using errcode = '23514';
    end if;

    select workspace.* into workspace_row
    from loyalty.workspaces as workspace
    where workspace.organization_id = organization_row.id
      and workspace.slug = target_workspace_slug
      and workspace.status = 'active';
    select programme_group.* into programme_group_row
    from loyalty.programme_groups as programme_group
    where programme_group.organization_id = organization_row.id
      and programme_group.slug = target_programme_group_slug
      and programme_group.status = 'active';
    select membership.* into membership_row
    from loyalty.organization_memberships as membership
    where membership.organization_id = organization_row.id
      and membership.user_id = target_auth_user_id
      and membership.role = 'owner'
      and membership.revoked_at is null;

    if organization_row.status <> 'active'
       or workspace_row.id is null
       or programme_group_row.id is null
       or membership_row.id is null
       or not exists (
         select 1
         from loyalty.programme_group_workspaces as link
         where link.organization_id = organization_row.id
           and link.workspace_id = workspace_row.id
           and link.programme_group_id = programme_group_row.id
       ) then
      raise exception 'bootstrap retry state mismatch'
        using errcode = '55000';
    end if;

    return query select
      organization_row.public_id,
      workspace_row.public_id,
      programme_group_row.public_id,
      membership_row.public_id,
      'retry'::text;
    return;
  end if;

  insert into loyalty.organizations (slug, name)
  values (target_organization_slug, target_organization_name)
  returning * into organization_row;

  insert into loyalty.workspaces (organization_id, slug, name)
  values (
    organization_row.id,
    target_workspace_slug,
    target_workspace_name
  )
  returning * into workspace_row;

  insert into loyalty.programme_groups (organization_id, slug, name)
  values (
    organization_row.id,
    target_programme_group_slug,
    target_programme_group_name
  )
  returning * into programme_group_row;

  insert into loyalty.programme_group_workspaces (
    organization_id,
    programme_group_id,
    workspace_id
  )
  values (
    organization_row.id,
    programme_group_row.id,
    workspace_row.id
  );

  insert into loyalty.organization_memberships (
    organization_id,
    user_id,
    role
  )
  values (
    organization_row.id,
    target_auth_user_id,
    'owner'
  )
  returning * into membership_row;

  insert into loyalty.admin_audit_events (
    organization_id,
    actor_user_id,
    action,
    resource_type,
    resource_public_id,
    idempotency_key,
    request_sha256,
    correlation_id,
    metadata
  ) values (
    organization_row.id,
    target_auth_user_id,
    'tenant.bootstrap',
    'organization',
    organization_row.public_id,
    target_idempotency_key,
    request_hash,
    target_correlation_id,
    jsonb_build_object(
      'authority', 'deployment_owner',
      'workspace_public_id', workspace_row.public_id,
      'programme_group_public_id', programme_group_row.public_id,
      'membership_public_id', membership_row.public_id
    )
  );

  return query select
    organization_row.public_id,
    workspace_row.public_id,
    programme_group_row.public_id,
    membership_row.public_id,
    'created'::text;
exception
  when foreign_key_violation then
    raise exception 'bootstrap Auth user does not exist'
      using errcode = '22023';
end;
$$;

alter function loyalty_private.bootstrap_initial_tenant(
  uuid, text, text, text, text, text, text, text, uuid
) owner to loyalty_owner;

revoke all on function loyalty_private.bootstrap_initial_tenant(
  uuid, text, text, text, text, text, text, text, uuid
) from public, anon, authenticated, loyalty_runtime, loyalty_worker;

comment on function loyalty_private.bootstrap_initial_tenant(
  uuid, text, text, text, text, text, text, text, uuid
) is
  'Deployment-only atomic and audited creation of the first tenant, owner membership, workspace, and programme group.';
