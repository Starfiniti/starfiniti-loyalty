-- Phase 9 initial programme onboarding. Existing tenant owners and admins can
-- create the first programme inside an active programme group without gaining
-- direct table DML or supplying actor/organization authority.

create or replace function loyalty.create_programme_command(
  target_programme_group_public_id uuid,
  target_slug text,
  target_name text,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (resource_public_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := loyalty_private.request_user_id();
  target_group loyalty.programme_groups%rowtype;
  existing_audit loyalty.admin_audit_events%rowtype;
  request_hash bytea;
  created_public_id uuid;
begin
  if actor_user_id is null then
    raise exception using errcode = '42501', message = 'programme creation not authorized';
  end if;
  if target_programme_group_public_id is null
    or target_slug is null
    or length(target_slug) not between 2 and 80
    or target_slug <> lower(target_slug)
    or target_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or target_name is null
    or length(target_name) not between 1 and 200
    or target_name <> btrim(target_name)
    or target_name ~ '[[:cntrl:]]'
    or target_idempotency_key is null
    or length(btrim(target_idempotency_key)) not between 1 and 255
    or target_idempotency_key <> btrim(target_idempotency_key)
    or target_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid programme creation input';
  end if;

  select programme_group.* into target_group
  from loyalty.programme_groups as programme_group
  where programme_group.public_id = target_programme_group_public_id
    and programme_group.status = 'active'
    and loyalty_private.has_organization_role(
      programme_group.organization_id,
      array['owner', 'admin']::text[]
    )
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'programme creation not authorized';
  end if;

  request_hash := extensions.digest(
    convert_to(
      'programme.create|' || target_group.public_id::text || '|' ||
      target_slug || '|' || target_name,
      'UTF8'
    ),
    'sha256'
  );

  select audit.* into existing_audit
  from loyalty.admin_audit_events as audit
  where audit.organization_id = target_group.organization_id
    and audit.idempotency_key = target_idempotency_key;
  if found then
    if existing_audit.action <> 'programme.create'
      or existing_audit.request_sha256 <> request_hash then
      raise exception using errcode = '23514', message = 'programme creation idempotency conflict';
    end if;
    return query
    select programme.public_id, 'duplicate'::text
    from loyalty.programmes as programme
    where programme.organization_id = target_group.organization_id
      and programme.public_id = existing_audit.resource_public_id;
    return;
  end if;

  if exists (
    select 1
    from loyalty.programmes as programme
    where programme.organization_id = target_group.organization_id
      and programme.programme_group_id = target_group.id
      and programme.slug = target_slug
  ) then
    raise exception using errcode = '23514', message = 'programme slug already exists';
  end if;

  insert into loyalty.programmes (
    organization_id, programme_group_id, slug, name, status
  ) values (
    target_group.organization_id, target_group.id, target_slug, target_name, 'active'
  )
  returning public_id into created_public_id;

  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id,
    metadata
  ) values (
    target_group.organization_id, actor_user_id,
    'programme.create', 'programme', created_public_id,
    target_idempotency_key, request_hash, target_correlation_id,
    jsonb_build_object(
      'programmeGroupPublicId', target_group.public_id,
      'slug', target_slug,
      'name', target_name
    )
  );

  return query select created_public_id, 'created'::text;
end;
$$;

alter function loyalty.create_programme_command(uuid, text, text, text, uuid)
  owner to loyalty_owner;
revoke all on function loyalty.create_programme_command(uuid, text, text, text, uuid)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty.create_programme_command(uuid, text, text, text, uuid)
  to authenticated;

comment on function loyalty.create_programme_command(uuid, text, text, text, uuid) is
  'Creates an active programme in an authorized active group and records immutable tenant-scoped audit evidence.';
