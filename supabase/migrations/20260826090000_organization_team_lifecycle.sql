-- M13-S02: organization, invitation, and membership lifecycle.
-- Invitations are bearer capabilities: only a SHA-256 digest is retained and
-- the accepting Auth subject is derived from the live database request.

alter table loyalty.organizations
  add column lifecycle_revision bigint not null default 1,
  add column closed_at timestamptz,
  add column offboarded_at timestamptz,
  add constraint organizations_lifecycle_revision_check
    check (lifecycle_revision >= 1),
  add constraint organizations_offboarded_state_check
    check (
      offboarded_at is null
      or (status = 'closed' and closed_at is not null and offboarded_at >= closed_at)
    );

alter table loyalty.organization_memberships
  add column display_label text,
  add column lifecycle_revision bigint not null default 1,
  add column updated_at timestamptz not null default now(),
  add constraint organization_memberships_display_label_check
    check (
      display_label is null
      or (
        display_label = btrim(display_label)
        and length(display_label) between 1 and 120
        and display_label !~ '[[:cntrl:]]'
      )
    ),
  add constraint organization_memberships_lifecycle_revision_check
    check (lifecycle_revision >= 1),
  add constraint organization_memberships_updated_at_check
    check (updated_at >= created_at),
  add constraint organization_memberships_organization_id_id_key
    unique (organization_id, id);

create table loyalty.organization_invitations (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null
    references loyalty.organizations(id) on delete restrict,
  token_sha256 bytea not null unique check (octet_length(token_sha256) = 32),
  display_label text not null,
  role text not null
    check (role in ('owner', 'admin', 'marketer', 'operator', 'analyst', 'auditor')),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked')),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  accepted_by_user_id uuid references auth.users(id) on delete restrict,
  accepted_membership_id bigint,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, accepted_membership_id)
    references loyalty.organization_memberships(organization_id, id)
    on delete restrict,
  check (
    display_label = btrim(display_label)
    and length(display_label) between 1 and 120
    and display_label !~ '[[:cntrl:]]'
  ),
  check (expires_at > created_at),
  check (updated_at >= created_at),
  check (
    (status = 'pending' and accepted_at is null and accepted_by_user_id is null
      and accepted_membership_id is null and revoked_at is null)
    or (status = 'accepted' and accepted_at is not null and accepted_by_user_id is not null
      and accepted_membership_id is not null and revoked_at is null)
    or (status = 'revoked' and revoked_at is not null and accepted_at is null
      and accepted_by_user_id is null and accepted_membership_id is null)
  )
);

create index organization_invitations_tenant_history_idx
  on loyalty.organization_invitations (organization_id, created_at desc, id desc);

create table loyalty_private.organization_creation_receipts (
  id bigint generated always as identity primary key,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  idempotency_key text not null,
  request_sha256 bytea not null check (octet_length(request_sha256) = 32),
  organization_id bigint not null
    references loyalty.organizations(id) on delete restrict,
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  unique (actor_user_id, idempotency_key),
  unique (organization_id),
  check (length(idempotency_key) between 1 and 255)
);

alter table loyalty.organization_invitations owner to loyalty_owner;
alter table loyalty_private.organization_creation_receipts owner to loyalty_owner;

create trigger organization_creation_receipts_immutable
before update or delete on loyalty_private.organization_creation_receipts
for each row execute function loyalty_private.reject_immutable_change();

create or replace function loyalty_private.guard_organization_invitation_change_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('loyalty.identity_command', true) is distinct from 'on' then
    raise exception using errcode = '55000', message = 'organization invitation mutations require a lifecycle command';
  end if;
  if new.organization_id <> old.organization_id
     or new.token_sha256 <> old.token_sha256
     or new.display_label <> old.display_label
     or new.role <> old.role
     or new.created_by_user_id <> old.created_by_user_id
     or new.expires_at <> old.expires_at
     or new.created_at <> old.created_at then
    raise exception using errcode = '55000', message = 'organization invitation authority is immutable';
  end if;
  return new;
end;
$$;

alter function loyalty_private.guard_organization_invitation_change_v1()
  owner to loyalty_owner;
revoke all on function loyalty_private.guard_organization_invitation_change_v1()
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

create trigger organization_invitations_guarded_update
before update or delete on loyalty.organization_invitations
for each row execute function loyalty_private.guard_organization_invitation_change_v1();

alter table loyalty.organization_invitations enable row level security;
alter table loyalty_private.organization_creation_receipts enable row level security;

revoke all on loyalty.organization_invitations,
  loyalty_private.organization_creation_receipts
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

-- M13 makes organization suspension an effective boundary for every existing
-- merchant command that uses the shared live-role helper. Basic tenant reads
-- continue through is_organization_member; recovery lifecycle and export paths
-- recheck the owner directly below so a suspended tenant cannot strand them.
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
  select (
      select coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
      )::uuid
    ) is not null
    and coalesce(cardinality(allowed_roles), 0) > 0
    and exists (
      select 1
      from loyalty.organizations as organization
      join loyalty.organization_memberships as membership
        on membership.organization_id = organization.id
      where organization.id = target_organization_id
        and organization.status = 'active'
        and membership.user_id = (
          select coalesce(
            nullif(current_setting('request.jwt.claim.sub', true), ''),
            nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
          )::uuid
        )
        and membership.role = any(allowed_roles)
        and membership.revoked_at is null
    );
$$;

alter function loyalty_private.has_organization_role(bigint, text[])
  owner to loyalty_owner;
revoke all on function loyalty_private.has_organization_role(bigint, text[])
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty_private.has_organization_role(bigint, text[])
  to authenticated;

create or replace function loyalty.create_organization_command_v1(
  target_slug text,
  target_name text,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (resource_public_id uuid, outcome text, revision bigint, status text)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  request_actor_user_id uuid := loyalty_private.request_user_id();
  request_hash bytea;
  existing_receipt loyalty_private.organization_creation_receipts%rowtype;
  created_organization loyalty.organizations%rowtype;
  created_membership loyalty.organization_memberships%rowtype;
begin
  if request_actor_user_id is null or target_correlation_id is null then
    raise exception using errcode = '42501', message = 'organization command not authorized';
  end if;
  if target_slug is null
     or target_slug <> lower(btrim(target_slug))
     or target_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or length(target_slug) not between 2 and 80
     or target_name is null
     or target_name <> btrim(target_name)
     or length(target_name) not between 1 and 200
     or target_idempotency_key is null
     or target_idempotency_key <> btrim(target_idempotency_key)
     or length(target_idempotency_key) not between 1 and 255 then
    raise exception using errcode = '22023', message = 'invalid organization command';
  end if;

  request_hash := extensions.digest(convert_to(jsonb_build_object(
    'actor', request_actor_user_id,
    'slug', target_slug,
    'name', target_name
  )::text, 'UTF8'), 'sha256');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'starfiniti:organization:create:' || request_actor_user_id::text || ':' || target_idempotency_key,
    0
  ));

  select receipt.* into existing_receipt
  from loyalty_private.organization_creation_receipts as receipt
  where receipt.actor_user_id = request_actor_user_id
    and receipt.idempotency_key = target_idempotency_key;
  if found then
    if existing_receipt.request_sha256 <> request_hash
       or existing_receipt.correlation_id <> target_correlation_id then
      raise exception using errcode = '23514', message = 'organization command idempotency conflict';
    end if;
    return query
    select organization.public_id, 'duplicate'::text,
      organization.lifecycle_revision, organization.status
    from loyalty.organizations as organization
    where organization.id = existing_receipt.organization_id;
    return;
  end if;

  insert into loyalty.organizations (slug, name)
  values (target_slug, target_name)
  returning * into created_organization;

  insert into loyalty.organization_memberships (
    organization_id, user_id, role, display_label
  ) values (
    created_organization.id, request_actor_user_id, 'owner', 'Initial owner'
  ) returning * into created_membership;

  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id, metadata
  ) values (
    created_organization.id, request_actor_user_id, 'organization.create', 'organization',
    created_organization.public_id, target_idempotency_key, request_hash,
    target_correlation_id, jsonb_build_object(
      'lifecycleRevision', created_organization.lifecycle_revision,
      'membershipPublicId', created_membership.public_id,
      'membershipRole', 'owner'
    )
  );

  insert into loyalty_private.organization_creation_receipts (
    actor_user_id, idempotency_key, request_sha256, organization_id, correlation_id
  ) values (
    request_actor_user_id, target_idempotency_key, request_hash,
    created_organization.id, target_correlation_id
  );

  return query select created_organization.public_id, 'created'::text,
    created_organization.lifecycle_revision, created_organization.status;
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'organization command conflicts with existing state';
end;
$$;

create or replace function loyalty.update_organization_lifecycle_command_v1(
  target_organization_public_id uuid,
  target_expected_revision bigint,
  target_action text,
  target_name text,
  target_reason text,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (resource_public_id uuid, outcome text, revision bigint, status text)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  request_actor_user_id uuid := loyalty_private.request_user_id();
  organization_row loyalty.organizations%rowtype;
  existing_audit loyalty.admin_audit_events%rowtype;
  request_hash bytea;
  new_name text;
  new_status text;
  new_closed_at timestamptz;
  new_offboarded_at timestamptz;
  transition_time timestamptz := clock_timestamp();
begin
  if request_actor_user_id is null or target_organization_public_id is null
     or target_expected_revision is null or target_expected_revision < 1
     or target_action not in ('rename', 'suspend', 'restore', 'close', 'offboard')
     or target_reason is null or target_reason <> btrim(target_reason)
     or length(target_reason) not between 8 and 500
     or target_reason ~ '[[:cntrl:]]'
     or target_idempotency_key is null
     or target_idempotency_key <> btrim(target_idempotency_key)
     or length(target_idempotency_key) not between 1 and 255
     or target_correlation_id is null
     or ((target_action = 'rename') <> (target_name is not null))
     or (target_name is not null and (
       target_name <> btrim(target_name) or length(target_name) not between 1 and 200
     )) then
    raise exception using errcode = '22023', message = 'invalid organization lifecycle command';
  end if;

  select organization.* into organization_row
  from loyalty.organizations as organization
  where organization.public_id = target_organization_public_id
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'organization lifecycle command not authorized';
  end if;
  if not exists (
    select 1 from loyalty.organization_memberships as membership
    where membership.organization_id = organization_row.id
      and membership.user_id = request_actor_user_id
      and membership.role = 'owner'
      and membership.revoked_at is null
  ) then
    raise exception using errcode = '42501', message = 'organization lifecycle command not authorized';
  end if;

  request_hash := extensions.digest(convert_to(jsonb_build_object(
    'organization', target_organization_public_id,
    'expectedRevision', target_expected_revision,
    'action', target_action,
    'name', target_name,
    'reason', target_reason
  )::text, 'UTF8'), 'sha256');

  select audit.* into existing_audit
  from loyalty.admin_audit_events as audit
  where audit.organization_id = organization_row.id
    and audit.idempotency_key = target_idempotency_key;
  if found then
    if existing_audit.action <> 'organization.' || target_action
       or existing_audit.request_sha256 <> request_hash
       or existing_audit.actor_user_id <> request_actor_user_id
       or existing_audit.correlation_id <> target_correlation_id then
      raise exception using errcode = '23514', message = 'organization lifecycle idempotency conflict';
    end if;
    return query select organization_row.public_id, 'duplicate'::text,
      (existing_audit.metadata ->> 'lifecycleRevision')::bigint,
      existing_audit.metadata ->> 'status';
    return;
  end if;

  if organization_row.lifecycle_revision <> target_expected_revision then
    raise exception using errcode = '40001', message = 'stale organization lifecycle revision';
  end if;

  new_name := organization_row.name;
  new_status := organization_row.status;
  new_closed_at := organization_row.closed_at;
  new_offboarded_at := organization_row.offboarded_at;
  if target_action = 'rename' then
    if organization_row.status not in ('active', 'suspended')
       or target_name = organization_row.name then
      raise exception using errcode = '23514', message = 'invalid organization lifecycle transition';
    end if;
    new_name := target_name;
  elsif target_action = 'suspend' then
    if organization_row.status <> 'active' then
      raise exception using errcode = '23514', message = 'invalid organization lifecycle transition';
    end if;
    new_status := 'suspended';
  elsif target_action = 'restore' then
    if organization_row.status <> 'suspended' or organization_row.offboarded_at is not null then
      raise exception using errcode = '23514', message = 'invalid organization lifecycle transition';
    end if;
    new_status := 'active';
  elsif target_action = 'close' then
    if organization_row.status not in ('active', 'suspended') then
      raise exception using errcode = '23514', message = 'invalid organization lifecycle transition';
    end if;
    new_status := 'closed';
    new_closed_at := transition_time;
  else
    if organization_row.status <> 'closed' or organization_row.offboarded_at is not null then
      raise exception using errcode = '23514', message = 'invalid organization lifecycle transition';
    end if;
    new_offboarded_at := transition_time;
    update loyalty.organization_memberships as membership
    set revoked_at = transition_time,
      lifecycle_revision = membership.lifecycle_revision + 1,
      updated_at = transition_time
    where membership.organization_id = organization_row.id
      and membership.user_id <> request_actor_user_id
      and membership.revoked_at is null;
    perform set_config('loyalty.identity_command', 'on', true);
    update loyalty.organization_invitations as invitation
    set status = 'revoked', revoked_at = transition_time, updated_at = transition_time
    where invitation.organization_id = organization_row.id
      and invitation.status = 'pending';
  end if;

  update loyalty.organizations
  set name = new_name,
    status = new_status,
    closed_at = new_closed_at,
    offboarded_at = new_offboarded_at,
    lifecycle_revision = lifecycle_revision + 1,
    updated_at = transition_time
  where id = organization_row.id
  returning * into organization_row;

  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id, metadata
  ) values (
    organization_row.id, request_actor_user_id, 'organization.' || target_action,
    'organization', organization_row.public_id, target_idempotency_key,
    request_hash, target_correlation_id, jsonb_build_object(
      'lifecycleRevision', organization_row.lifecycle_revision,
      'name', organization_row.name,
      'status', organization_row.status,
      'reason', target_reason,
      'closedAt', organization_row.closed_at,
      'offboardedAt', organization_row.offboarded_at
    )
  );

  return query select organization_row.public_id, 'updated'::text,
    organization_row.lifecycle_revision, organization_row.status;
end;
$$;

create or replace function loyalty.create_organization_invitation_command_v1(
  target_organization_public_id uuid,
  target_display_label text,
  target_role text,
  target_expires_at timestamptz,
  target_token_sha256 text,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (resource_public_id uuid, outcome text, revision bigint, status text)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  request_actor_user_id uuid := loyalty_private.request_user_id();
  organization_row loyalty.organizations%rowtype;
  actor_role text;
  invitation_row loyalty.organization_invitations%rowtype;
  existing_audit loyalty.admin_audit_events%rowtype;
  request_hash bytea;
  token_digest bytea;
  creation_time timestamptz := clock_timestamp();
begin
  if request_actor_user_id is null or target_organization_public_id is null
     or target_display_label is null or target_display_label <> btrim(target_display_label)
     or length(target_display_label) not between 1 and 120
     or target_display_label ~ '[[:cntrl:]]'
     or target_role not in ('owner', 'admin', 'marketer', 'operator', 'analyst', 'auditor')
     or target_expires_at is null
     or target_token_sha256 is null or target_token_sha256 !~ '^[a-f0-9]{64}$'
     or target_idempotency_key is null or target_idempotency_key <> btrim(target_idempotency_key)
     or length(target_idempotency_key) not between 1 and 255
     or target_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid organization invitation command';
  end if;
  token_digest := decode(target_token_sha256, 'hex');

  select organization.* into organization_row
  from loyalty.organizations as organization
  where organization.public_id = target_organization_public_id
    and organization.status = 'active'
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'organization invitation command not authorized';
  end if;
  select membership.role into actor_role
  from loyalty.organization_memberships as membership
  where membership.organization_id = organization_row.id
    and membership.user_id = request_actor_user_id
    and membership.revoked_at is null
    and membership.role in ('owner', 'admin');
  if not found or (target_role = 'owner' and actor_role <> 'owner') then
    raise exception using errcode = '42501', message = 'organization invitation command not authorized';
  end if;

  request_hash := extensions.digest(convert_to(jsonb_build_object(
    'organization', target_organization_public_id,
    'displayLabel', target_display_label,
    'role', target_role,
    'expiresAt', extract(epoch from target_expires_at),
    'tokenSha256', target_token_sha256
  )::text, 'UTF8'), 'sha256');
  select audit.* into existing_audit
  from loyalty.admin_audit_events as audit
  where audit.organization_id = organization_row.id
    and audit.idempotency_key = target_idempotency_key;
  if found then
    if existing_audit.action <> 'invitation.create'
       or existing_audit.request_sha256 <> request_hash
       or existing_audit.actor_user_id <> request_actor_user_id
       or existing_audit.correlation_id <> target_correlation_id then
      raise exception using errcode = '23514', message = 'organization invitation idempotency conflict';
    end if;
    return query select existing_audit.resource_public_id, 'duplicate'::text,
      1::bigint, coalesce(existing_audit.metadata ->> 'status', 'pending');
    return;
  end if;

  if target_expires_at < creation_time + interval '1 hour'
     or target_expires_at > creation_time + interval '30 days' then
    raise exception using errcode = '22023', message = 'invalid organization invitation command';
  end if;

  insert into loyalty.organization_invitations (
    organization_id, token_sha256, display_label, role,
    created_by_user_id, expires_at
  ) values (
    organization_row.id, token_digest, target_display_label, target_role,
    request_actor_user_id, target_expires_at
  ) returning * into invitation_row;

  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id, metadata
  ) values (
    organization_row.id, request_actor_user_id, 'invitation.create', 'organization_invitation',
    invitation_row.public_id, target_idempotency_key, request_hash,
    target_correlation_id, jsonb_build_object(
      'displayLabel', invitation_row.display_label,
      'role', invitation_row.role,
      'status', invitation_row.status,
      'expiresAt', invitation_row.expires_at
    )
  );
  return query select invitation_row.public_id, 'created'::text, 1::bigint,
    invitation_row.status;
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'organization invitation conflicts with existing state';
end;
$$;

create or replace function loyalty.accept_organization_invitation_command_v1(
  target_token_sha256 text,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (resource_public_id uuid, outcome text, revision bigint, status text)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  request_actor_user_id uuid := loyalty_private.request_user_id();
  invitation_row loyalty.organization_invitations%rowtype;
  organization_row loyalty.organizations%rowtype;
  membership_row loyalty.organization_memberships%rowtype;
  existing_audit loyalty.admin_audit_events%rowtype;
  request_hash bytea;
  acceptance_time timestamptz;
  accepted_outcome text;
  candidate_invitation_id bigint;
  candidate_organization_id bigint;
begin
  if request_actor_user_id is null or target_token_sha256 is null
     or target_token_sha256 !~ '^[a-f0-9]{64}$'
     or target_idempotency_key is null or target_idempotency_key <> btrim(target_idempotency_key)
     or length(target_idempotency_key) not between 1 and 255
     or target_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid organization invitation acceptance';
  end if;

  -- Resolve the opaque capability without locking, then take the stable tenant
  -- lock before the invitation lock. Every lifecycle command uses this order,
  -- so acceptance cannot deadlock with closure or offboarding.
  select invitation.id, invitation.organization_id
  into candidate_invitation_id, candidate_organization_id
  from loyalty.organization_invitations as invitation
  where invitation.token_sha256 = decode(target_token_sha256, 'hex');
  if not found then
    raise exception using errcode = '42501', message = 'organization invitation unavailable';
  end if;
  select organization.* into organization_row
  from loyalty.organizations as organization
  where organization.id = candidate_organization_id
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'organization invitation unavailable';
  end if;
  select invitation.* into invitation_row
  from loyalty.organization_invitations as invitation
  where invitation.id = candidate_invitation_id
    and invitation.organization_id = organization_row.id
    and invitation.token_sha256 = decode(target_token_sha256, 'hex')
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'organization invitation unavailable';
  end if;
  acceptance_time := clock_timestamp();

  request_hash := extensions.digest(convert_to(jsonb_build_object(
    'invitation', invitation_row.public_id,
    'actor', request_actor_user_id,
    'tokenSha256', target_token_sha256
  )::text, 'UTF8'), 'sha256');
  select audit.* into existing_audit
  from loyalty.admin_audit_events as audit
  where audit.organization_id = organization_row.id
    and audit.idempotency_key = target_idempotency_key;
  if found then
    if existing_audit.action <> 'invitation.accept'
       or existing_audit.request_sha256 <> request_hash
       or existing_audit.actor_user_id <> request_actor_user_id
       or existing_audit.correlation_id <> target_correlation_id then
      raise exception using errcode = '23514', message = 'organization invitation idempotency conflict';
    end if;
    if organization_row.status <> 'active' or not exists (
      select 1 from loyalty.organization_memberships as membership
      where membership.organization_id = organization_row.id
        and membership.public_id = (existing_audit.metadata ->> 'membershipPublicId')::uuid
        and membership.user_id = request_actor_user_id
        and membership.revoked_at is null
    ) then
      raise exception using errcode = '42501', message = 'organization invitation unavailable';
    end if;
    return query select organization_row.public_id, 'duplicate'::text,
      (existing_audit.metadata ->> 'membershipRevision')::bigint, 'accepted'::text;
    return;
  end if;
  if organization_row.status <> 'active' then
    raise exception using errcode = '42501', message = 'organization invitation unavailable';
  end if;
  if invitation_row.status = 'accepted' then
    if invitation_row.accepted_by_user_id = request_actor_user_id then
      select membership.* into membership_row
      from loyalty.organization_memberships as membership
      where membership.id = invitation_row.accepted_membership_id;
      if membership_row.revoked_at is not null then
        raise exception using errcode = '42501', message = 'organization invitation unavailable';
      end if;
      return query select organization_row.public_id, 'duplicate'::text,
        membership_row.lifecycle_revision, 'accepted'::text;
      return;
    end if;
    raise exception using errcode = '42501', message = 'organization invitation unavailable';
  end if;
  if invitation_row.status <> 'pending'
     or invitation_row.expires_at <= acceptance_time then
    raise exception using errcode = '42501', message = 'organization invitation unavailable';
  end if;

  select membership.* into membership_row
  from loyalty.organization_memberships as membership
  where membership.organization_id = organization_row.id
    and membership.user_id = request_actor_user_id
  for update;
  if found and membership_row.revoked_at is null then
    raise exception using errcode = '23514', message = 'organization invitation target already has access';
  elsif found then
    update loyalty.organization_memberships
    set role = invitation_row.role,
      display_label = invitation_row.display_label,
      revoked_at = null,
      lifecycle_revision = lifecycle_revision + 1,
      updated_at = acceptance_time
    where id = membership_row.id
    returning * into membership_row;
    accepted_outcome := 'updated';
  else
    insert into loyalty.organization_memberships (
      organization_id, user_id, role, display_label
    ) values (
      organization_row.id, request_actor_user_id, invitation_row.role,
      invitation_row.display_label
    ) returning * into membership_row;
    accepted_outcome := 'created';
  end if;

  perform set_config('loyalty.identity_command', 'on', true);
  update loyalty.organization_invitations
  set status = 'accepted', accepted_by_user_id = request_actor_user_id,
    accepted_membership_id = membership_row.id,
    accepted_at = acceptance_time, updated_at = acceptance_time
  where id = invitation_row.id
  returning * into invitation_row;

  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id, metadata
  ) values (
    organization_row.id, request_actor_user_id, 'invitation.accept', 'organization_invitation',
    invitation_row.public_id, target_idempotency_key, request_hash,
    target_correlation_id, jsonb_build_object(
      'membershipPublicId', membership_row.public_id,
      'membershipRevision', membership_row.lifecycle_revision,
      'role', membership_row.role,
      'status', invitation_row.status
    )
  );
  return query select organization_row.public_id, accepted_outcome,
    membership_row.lifecycle_revision, invitation_row.status;
end;
$$;

create or replace function loyalty.revoke_organization_invitation_command_v1(
  target_organization_public_id uuid,
  target_invitation_public_id uuid,
  target_reason text,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (resource_public_id uuid, outcome text, revision bigint, status text)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  request_actor_user_id uuid := loyalty_private.request_user_id();
  organization_row loyalty.organizations%rowtype;
  invitation_row loyalty.organization_invitations%rowtype;
  existing_audit loyalty.admin_audit_events%rowtype;
  request_hash bytea;
  revocation_time timestamptz := clock_timestamp();
begin
  if request_actor_user_id is null or target_organization_public_id is null
     or target_invitation_public_id is null
     or target_reason is null or target_reason <> btrim(target_reason)
     or length(target_reason) not between 8 and 500 or target_reason ~ '[[:cntrl:]]'
     or target_idempotency_key is null or target_idempotency_key <> btrim(target_idempotency_key)
     or length(target_idempotency_key) not between 1 and 255
     or target_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid invitation revocation command';
  end if;
  select organization.* into organization_row
  from loyalty.organizations as organization
  where organization.public_id = target_organization_public_id
    and organization.status = 'active'
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'invitation revocation not authorized';
  end if;
  if not exists (
    select 1 from loyalty.organization_memberships as membership
    where membership.organization_id = organization_row.id
      and membership.user_id = request_actor_user_id
      and membership.revoked_at is null
      and membership.role in ('owner', 'admin')
  ) then
    raise exception using errcode = '42501', message = 'invitation revocation not authorized';
  end if;
  select invitation.* into invitation_row
  from loyalty.organization_invitations as invitation
  where invitation.organization_id = organization_row.id
    and invitation.public_id = target_invitation_public_id
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'invitation revocation not authorized';
  end if;
  request_hash := extensions.digest(convert_to(jsonb_build_object(
    'organization', target_organization_public_id,
    'invitation', target_invitation_public_id,
    'reason', target_reason
  )::text, 'UTF8'), 'sha256');
  select audit.* into existing_audit
  from loyalty.admin_audit_events as audit
  where audit.organization_id = organization_row.id
    and audit.idempotency_key = target_idempotency_key;
  if found then
    if existing_audit.action <> 'invitation.revoke'
       or existing_audit.request_sha256 <> request_hash
       or existing_audit.actor_user_id <> request_actor_user_id
       or existing_audit.correlation_id <> target_correlation_id then
      raise exception using errcode = '23514', message = 'invitation revocation idempotency conflict';
    end if;
    return query select invitation_row.public_id, 'duplicate'::text, 1::bigint, 'revoked'::text;
    return;
  end if;
  if invitation_row.status <> 'pending' then
    raise exception using errcode = '23514', message = 'invitation is not pending';
  end if;
  perform set_config('loyalty.identity_command', 'on', true);
  update loyalty.organization_invitations
  set status = 'revoked', revoked_at = revocation_time, updated_at = revocation_time
  where id = invitation_row.id
  returning * into invitation_row;
  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id, metadata
  ) values (
    organization_row.id, request_actor_user_id, 'invitation.revoke', 'organization_invitation',
    invitation_row.public_id, target_idempotency_key, request_hash,
    target_correlation_id, jsonb_build_object(
      'role', invitation_row.role, 'status', invitation_row.status, 'reason', target_reason
    )
  );
  return query select invitation_row.public_id, 'revoked'::text, 1::bigint,
    invitation_row.status;
end;
$$;

create or replace function loyalty.update_organization_member_command_v1(
  target_organization_public_id uuid,
  target_membership_public_id uuid,
  target_expected_revision bigint,
  target_action text,
  target_role text,
  target_reason text,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (resource_public_id uuid, outcome text, revision bigint, status text)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  request_actor_user_id uuid := loyalty_private.request_user_id();
  organization_row loyalty.organizations%rowtype;
  actor_role text;
  membership_row loyalty.organization_memberships%rowtype;
  existing_audit loyalty.admin_audit_events%rowtype;
  request_hash bytea;
  previous_role text;
  revoked_invitation_count integer := 0;
  mutation_time timestamptz := clock_timestamp();
begin
  if request_actor_user_id is null or target_organization_public_id is null
     or target_membership_public_id is null
     or target_expected_revision is null or target_expected_revision < 1
     or target_action not in ('change_role', 'revoke')
     or ((target_action = 'change_role') <> (target_role is not null))
     or (target_role is not null and target_role not in ('owner', 'admin', 'marketer', 'operator', 'analyst', 'auditor'))
     or target_reason is null or target_reason <> btrim(target_reason)
     or length(target_reason) not between 8 and 500 or target_reason ~ '[[:cntrl:]]'
     or target_idempotency_key is null or target_idempotency_key <> btrim(target_idempotency_key)
     or length(target_idempotency_key) not between 1 and 255
     or target_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid organization member command';
  end if;
  select organization.* into organization_row
  from loyalty.organizations as organization
  where organization.public_id = target_organization_public_id
    and organization.status = 'active'
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'organization member command not authorized';
  end if;
  select actor_membership.role into actor_role
  from loyalty.organization_memberships as actor_membership
  where actor_membership.organization_id = organization_row.id
    and actor_membership.user_id = request_actor_user_id
    and actor_membership.revoked_at is null
    and actor_membership.role in ('owner', 'admin');
  if not found then
    raise exception using errcode = '42501', message = 'organization member command not authorized';
  end if;
  select membership.* into membership_row
  from loyalty.organization_memberships as membership
  where membership.organization_id = organization_row.id
    and membership.public_id = target_membership_public_id
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'organization member command not authorized';
  end if;
  request_hash := extensions.digest(convert_to(jsonb_build_object(
    'organization', target_organization_public_id,
    'membership', target_membership_public_id,
    'expectedRevision', target_expected_revision,
    'action', target_action,
    'role', target_role,
    'reason', target_reason
  )::text, 'UTF8'), 'sha256');
  select audit.* into existing_audit
  from loyalty.admin_audit_events as audit
  where audit.organization_id = organization_row.id
    and audit.idempotency_key = target_idempotency_key;
  if found then
    if existing_audit.action <> 'membership.' || target_action
       or existing_audit.request_sha256 <> request_hash
       or existing_audit.actor_user_id <> request_actor_user_id
       or existing_audit.correlation_id <> target_correlation_id then
      raise exception using errcode = '23514', message = 'organization member idempotency conflict';
    end if;
    return query select membership_row.public_id, 'duplicate'::text,
      (existing_audit.metadata ->> 'membershipRevision')::bigint,
      existing_audit.metadata ->> 'status';
    return;
  end if;
  if membership_row.revoked_at is not null then
    raise exception using errcode = '23514', message = 'organization membership is revoked';
  end if;
  if membership_row.lifecycle_revision <> target_expected_revision then
    raise exception using errcode = '40001', message = 'stale organization membership revision';
  end if;
  if actor_role = 'admin' and (membership_row.role = 'owner' or target_role = 'owner') then
    raise exception using errcode = '42501', message = 'owner membership requires owner authority';
  end if;
  if target_action = 'change_role' and target_role = membership_row.role then
    raise exception using errcode = '23514', message = 'organization member role is unchanged';
  end if;
  if membership_row.role = 'owner' and (target_action = 'revoke' or target_role <> 'owner')
     and not exists (
       select 1 from loyalty.organization_memberships as owner_membership
       where owner_membership.organization_id = organization_row.id
         and owner_membership.role = 'owner'
         and owner_membership.revoked_at is null
         and owner_membership.id <> membership_row.id
     ) then
    raise exception using errcode = '23514', message = 'organization must retain an active owner';
  end if;
  previous_role := membership_row.role;
  if target_action = 'change_role' then
    update loyalty.organization_memberships
    set role = target_role,
      lifecycle_revision = lifecycle_revision + 1,
      updated_at = mutation_time
    where id = membership_row.id
    returning * into membership_row;
  else
    update loyalty.organization_memberships
    set revoked_at = mutation_time,
      lifecycle_revision = lifecycle_revision + 1,
      updated_at = mutation_time
    where id = membership_row.id
    returning * into membership_row;
  end if;
  if previous_role in ('owner', 'admin') then
    perform set_config('loyalty.identity_command', 'on', true);
    update loyalty.organization_invitations as invitation
    set status = 'revoked', revoked_at = mutation_time, updated_at = mutation_time
    where invitation.organization_id = organization_row.id
      and invitation.created_by_user_id = membership_row.user_id
      and invitation.status = 'pending';
    get diagnostics revoked_invitation_count = row_count;
  end if;
  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id, metadata
  ) values (
    organization_row.id, request_actor_user_id, 'membership.' || target_action,
    'organization_membership', membership_row.public_id, target_idempotency_key,
    request_hash, target_correlation_id, jsonb_build_object(
      'previousRole', previous_role,
      'role', membership_row.role,
      'membershipRevision', membership_row.lifecycle_revision,
      'status', case when membership_row.revoked_at is null then 'active' else 'revoked' end,
      'revokedPendingInvitations', revoked_invitation_count,
      'reason', target_reason
    )
  );
  return query select membership_row.public_id,
    case when target_action = 'revoke' then 'revoked' else 'updated' end,
    membership_row.lifecycle_revision,
    case when membership_row.revoked_at is null then 'active' else 'revoked' end;
end;
$$;

create or replace function loyalty.get_organization_team_workspace_v1(
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
  request_actor_user_id uuid := loyalty_private.request_user_id();
  selected record;
begin
  if target_organization_public_id is null then
    raise exception using errcode = '22023', message = 'invalid organization team request';
  end if;
  if request_actor_user_id is null then return; end if;
  select organization.id as organization_id,
    organization.public_id as organization_public_id,
    organization.name as organization_name,
    organization.slug as organization_slug,
    organization.status as organization_status,
    organization.lifecycle_revision,
    organization.created_at,
    organization.updated_at,
    organization.closed_at,
    organization.offboarded_at,
    membership.role
  into selected
  from loyalty.organizations as organization
  join loyalty.organization_memberships as membership
    on membership.organization_id = organization.id
   and membership.user_id = request_actor_user_id
   and membership.revoked_at is null
  where organization.public_id = target_organization_public_id
    and (
      membership.role = 'owner'
      or (organization.status = 'active' and membership.role in ('admin', 'auditor'))
    );
  if not found then return; end if;

  return query
  with members as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', membership.public_id,
      'displayLabel', membership.display_label,
      'role', membership.role,
      'status', case when membership.revoked_at is null then 'active' else 'revoked' end,
      'isCurrent', membership.user_id = request_actor_user_id,
      'revision', membership.lifecycle_revision,
      'createdAt', membership.created_at,
      'revokedAt', membership.revoked_at
    ) order by (membership.revoked_at is null) desc,
        (membership.revoked_at is null and membership.role = 'owner') desc,
        (membership.user_id = request_actor_user_id) desc,
        membership.created_at, membership.id), '[]'::jsonb) as value
    from (
      select membership.* from loyalty.organization_memberships as membership
      where membership.organization_id = selected.organization_id
      order by (membership.revoked_at is null) desc,
        (membership.revoked_at is null and membership.role = 'owner') desc,
        (membership.user_id = request_actor_user_id) desc,
        membership.created_at, membership.id
      limit 500
    ) as membership
  ), invitations as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', invitation.public_id,
      'displayLabel', invitation.display_label,
      'role', invitation.role,
      'status', case
        when invitation.status = 'pending' and invitation.expires_at <= statement_timestamp() then 'expired'
        else invitation.status
      end,
      'expiresAt', invitation.expires_at,
      'createdAt', invitation.created_at,
      'acceptedAt', invitation.accepted_at,
      'revokedAt', invitation.revoked_at
    ) order by invitation.created_at desc, invitation.id desc), '[]'::jsonb) as value
    from (
      select invitation.* from loyalty.organization_invitations as invitation
      where invitation.organization_id = selected.organization_id
      order by invitation.created_at desc, invitation.id desc
      limit 200
    ) as invitation
  ), events as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', audit.public_id,
      'action', audit.action,
      'resourceId', audit.resource_public_id,
      'createdAt', audit.created_at
    ) order by audit.created_at desc, audit.id desc), '[]'::jsonb) as value
    from (
      select audit.* from loyalty.admin_audit_events as audit
      where audit.organization_id = selected.organization_id
        and audit.action in (
          'organization.create', 'organization.rename', 'organization.suspend',
          'organization.restore', 'organization.close', 'organization.offboard',
          'invitation.create', 'invitation.accept', 'invitation.revoke',
          'membership.change_role', 'membership.revoke'
        )
      order by audit.created_at desc, audit.id desc
      limit 50
    ) as audit
  )
  select jsonb_build_object(
    'schemaVersion', '1',
    'organization', jsonb_build_object(
      'id', selected.organization_public_id,
      'name', selected.organization_name,
      'slug', selected.organization_slug,
      'status', selected.organization_status,
      'lifecycleRevision', selected.lifecycle_revision,
      'createdAt', selected.created_at,
      'updatedAt', selected.updated_at,
      'closedAt', selected.closed_at,
      'offboardedAt', selected.offboarded_at
    ),
    'currentRole', selected.role,
    'mayManageLifecycle', selected.role = 'owner' and selected.offboarded_at is null,
    'mayManageMembers', selected.organization_status = 'active' and selected.role in ('owner', 'admin'),
    'mayExport', selected.role in ('owner', 'admin', 'auditor'),
    'members', members.value,
    'invitations', invitations.value,
    'recentEvents', events.value
  ) from members, invitations, events;
end;
$$;

alter function loyalty.create_organization_command_v1(text, text, text, uuid)
  owner to loyalty_owner;
alter function loyalty.update_organization_lifecycle_command_v1(uuid, bigint, text, text, text, text, uuid)
  owner to loyalty_owner;
alter function loyalty.create_organization_invitation_command_v1(uuid, text, text, timestamptz, text, text, uuid)
  owner to loyalty_owner;
alter function loyalty.accept_organization_invitation_command_v1(text, text, uuid)
  owner to loyalty_owner;
alter function loyalty.revoke_organization_invitation_command_v1(uuid, uuid, text, text, uuid)
  owner to loyalty_owner;
alter function loyalty.update_organization_member_command_v1(uuid, uuid, bigint, text, text, text, text, uuid)
  owner to loyalty_owner;
alter function loyalty.get_organization_team_workspace_v1(uuid)
  owner to loyalty_owner;

revoke all on function loyalty.create_organization_command_v1(text, text, text, uuid),
  loyalty.update_organization_lifecycle_command_v1(uuid, bigint, text, text, text, text, uuid),
  loyalty.create_organization_invitation_command_v1(uuid, text, text, timestamptz, text, text, uuid),
  loyalty.accept_organization_invitation_command_v1(text, text, uuid),
  loyalty.revoke_organization_invitation_command_v1(uuid, uuid, text, text, uuid),
  loyalty.update_organization_member_command_v1(uuid, uuid, bigint, text, text, text, text, uuid),
  loyalty.get_organization_team_workspace_v1(uuid)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty.create_organization_command_v1(text, text, text, uuid),
  loyalty.update_organization_lifecycle_command_v1(uuid, bigint, text, text, text, text, uuid),
  loyalty.create_organization_invitation_command_v1(uuid, text, text, timestamptz, text, text, uuid),
  loyalty.accept_organization_invitation_command_v1(text, text, uuid),
  loyalty.revoke_organization_invitation_command_v1(uuid, uuid, text, text, uuid),
  loyalty.update_organization_member_command_v1(uuid, uuid, bigint, text, text, text, text, uuid),
  loyalty.get_organization_team_workspace_v1(uuid)
  to authenticated;

comment on table loyalty.organization_invitations is
  'One-use organization membership capabilities; only the SHA-256 token digest is retained.';
comment on table loyalty_private.organization_creation_receipts is
  'Global actor-scoped idempotency receipts for self-service organization creation.';
comment on function loyalty.get_organization_team_workspace_v1(uuid) is
  'Returns a bounded tenant team/lifecycle view with opaque membership IDs and no Auth UUID, email, provider claim, token, or digest.';
