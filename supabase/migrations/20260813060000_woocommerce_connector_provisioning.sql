-- Phase 9 guided WooCommerce provisioning. The browser never supplies or
-- receives a signing-material reference; a trusted runtime consumes one key
-- from the deployment's read-only pool and returns the key only in its
-- one-time connection package.

create unique index commerce_connections_signing_material_ref_uidx
  on loyalty.commerce_connections (signing_material_ref);

revoke select on loyalty.commerce_connections from authenticated;
grant select (
  id, public_id, organization_id, workspace_id, platform, external_store_id,
  display_name, status, current_key_version, last_seen_at, created_at,
  updated_at, programme_id
) on loyalty.commerce_connections to authenticated;

create or replace function loyalty_private.provision_woocommerce_connection(
  target_actor_user_id uuid,
  target_workspace_public_id uuid,
  target_programme_public_id uuid,
  target_external_store_id text,
  target_display_name text,
  target_signing_material_ref text,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (
  connection_public_id uuid,
  key_version text,
  signing_material_ref text,
  outcome text
)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  target_workspace loyalty.workspaces%rowtype;
  target_programme loyalty.programmes%rowtype;
  existing_audit loyalty.admin_audit_events%rowtype;
  request_hash bytea;
  created_connection loyalty.commerce_connections%rowtype;
begin
  if target_actor_user_id is null
    or target_workspace_public_id is null
    or target_programme_public_id is null
    or target_external_store_id is null
    or pg_catalog.length(target_external_store_id) not between 12 and 255
    or target_external_store_id <> pg_catalog.lower(target_external_store_id)
    or target_external_store_id <> pg_catalog.btrim(target_external_store_id)
    or target_external_store_id !~ '^https://[a-z0-9][a-z0-9.-]*[a-z0-9](:[1-9][0-9]{0,4})?$'
    or target_display_name is null
    or pg_catalog.length(target_display_name) not between 1 and 200
    or target_display_name <> pg_catalog.btrim(target_display_name)
    or target_display_name ~ '[[:cntrl:]]'
    or target_signing_material_ref is null
    or target_signing_material_ref !~ '^pool:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:v1$'
    or target_idempotency_key is null
    or pg_catalog.length(target_idempotency_key) not between 1 and 255
    or target_idempotency_key <> pg_catalog.btrim(target_idempotency_key)
    or target_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid connector provisioning input';
  end if;

  select workspace.* into target_workspace
  from loyalty.workspaces as workspace
  join loyalty.organizations as organization
    on organization.id = workspace.organization_id
   and organization.status = 'active'
  where workspace.public_id = target_workspace_public_id
    and workspace.status = 'active'
    and exists (
      select 1
      from loyalty.organization_memberships as membership
      where membership.organization_id = workspace.organization_id
        and membership.user_id = target_actor_user_id
        and membership.role in ('owner', 'admin')
        and membership.revoked_at is null
    )
  for update of workspace;
  if not found then
    raise exception using errcode = '42501', message = 'connector provisioning not authorized';
  end if;

  select programme.* into target_programme
  from loyalty.programmes as programme
  join loyalty.programme_group_workspaces as group_workspace
    on group_workspace.organization_id = programme.organization_id
   and group_workspace.programme_group_id = programme.programme_group_id
   and group_workspace.workspace_id = target_workspace.id
  where programme.public_id = target_programme_public_id
    and programme.organization_id = target_workspace.organization_id
    and programme.status = 'active'
    and exists (
      select 1
      from loyalty.programme_versions as version
      where version.organization_id = programme.organization_id
        and version.programme_id = programme.id
        and version.status = 'published'
    )
  for update of programme;
  if not found then
    raise exception using errcode = '42501', message = 'connector provisioning not authorized';
  end if;

  request_hash := extensions.digest(
    pg_catalog.convert_to(
      'connector.woocommerce.provision|' || target_workspace.public_id::text || '|' ||
      target_programme.public_id::text || '|' || target_external_store_id || '|' ||
      target_display_name,
      'utf8'
    ),
    'sha256'
  );

  select audit.* into existing_audit
  from loyalty.admin_audit_events as audit
  where audit.organization_id = target_workspace.organization_id
    and audit.idempotency_key = target_idempotency_key;
  if found then
    if existing_audit.action <> 'connector.woocommerce.provision'
      or existing_audit.request_sha256 <> request_hash then
      raise exception using errcode = '23514', message = 'connector provisioning idempotency conflict';
    end if;

    return query
    select connection.public_id, connection.current_key_version,
      connection.signing_material_ref, 'duplicate'::text
    from loyalty.commerce_connections as connection
    where connection.organization_id = target_workspace.organization_id
      and connection.public_id = existing_audit.resource_public_id;
    if not found then
      raise exception using errcode = '55000', message = 'connector provisioning audit is inconsistent';
    end if;
    return;
  end if;

  if exists (
    select 1
    from loyalty.commerce_connections as connection
    where connection.signing_material_ref = target_signing_material_ref
  ) then
    raise exception using errcode = '23514', message = 'connector signing material unavailable';
  end if;

  if exists (
    select 1
    from loyalty.commerce_connections as connection
    where connection.organization_id = target_workspace.organization_id
      and (
        connection.workspace_id = target_workspace.id
        or (
          connection.platform = 'woocommerce'
          and connection.external_store_id = target_external_store_id
        )
      )
  ) then
    raise exception using errcode = '23514', message = 'WooCommerce connection already exists';
  end if;

  insert into loyalty.commerce_connections (
    organization_id, workspace_id, platform, external_store_id, display_name,
    status, current_key_version, signing_material_ref, programme_id
  ) values (
    target_workspace.organization_id, target_workspace.id, 'woocommerce',
    target_external_store_id, target_display_name, 'active', 'v1',
    target_signing_material_ref, target_programme.id
  )
  returning * into created_connection;

  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id,
    metadata
  ) values (
    target_workspace.organization_id, target_actor_user_id,
    'connector.woocommerce.provision', 'commerce_connection',
    created_connection.public_id, target_idempotency_key, request_hash,
    target_correlation_id,
    pg_catalog.jsonb_build_object(
      'workspacePublicId', target_workspace.public_id,
      'programmePublicId', target_programme.public_id,
      'platform', 'woocommerce',
      'externalStoreId', target_external_store_id,
      'displayName', target_display_name,
      'keyVersion', created_connection.current_key_version
    )
  );

  return query select created_connection.public_id,
    created_connection.current_key_version,
    created_connection.signing_material_ref,
    'created'::text;
end;
$$;

alter function loyalty_private.provision_woocommerce_connection(
  uuid, uuid, uuid, text, text, text, text, uuid
) owner to loyalty_owner;
revoke all on function loyalty_private.provision_woocommerce_connection(
  uuid, uuid, uuid, text, text, text, text, uuid
) from public, anon, authenticated, loyalty_worker;
grant execute on function loyalty_private.provision_woocommerce_connection(
  uuid, uuid, uuid, text, text, text, text, uuid
) to loyalty_runtime;

comment on function loyalty_private.provision_woocommerce_connection(
  uuid, uuid, uuid, text, text, text, text, uuid
) is 'Consumes one externally managed signing-material reference to create an audited active WooCommerce connection for a live tenant owner/admin and published programme.';
