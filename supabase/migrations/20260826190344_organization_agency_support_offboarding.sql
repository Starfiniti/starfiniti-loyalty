-- M13-S05: bilateral agency portfolios, explicit support grants, AAL2
-- break-glass recovery, and terminal organization offboarding/deletion.

grant select (id, user_id) on auth.sessions to loyalty_owner;

create or replace function loyalty_private.request_session_id_v1()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claim.session_id', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'session_id'
    ),
    ''
  )::uuid;
$$;

create or replace function loyalty_private.request_aal_v1()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.aal', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'aal',
    'aal1'
  );
$$;

create or replace function loyalty_private.request_has_live_auth_session_v1()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select loyalty_private.request_user_id() is not null
    and loyalty_private.request_session_id_v1() is not null
    and exists (
      select 1
      from auth.sessions as session
      where session.id = loyalty_private.request_session_id_v1()
        and session.user_id = loyalty_private.request_user_id()
    );
$$;

alter function loyalty_private.request_session_id_v1() owner to loyalty_owner;
alter function loyalty_private.request_aal_v1() owner to loyalty_owner;
alter function loyalty_private.request_has_live_auth_session_v1() owner to loyalty_owner;
revoke all on function loyalty_private.request_session_id_v1()
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function loyalty_private.request_aal_v1()
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function loyalty_private.request_has_live_auth_session_v1()
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

create table loyalty.organization_agency_invitations (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  client_organization_id bigint not null
    references loyalty.organizations(id) on delete restrict,
  token_sha256 bytea not null unique check (octet_length(token_sha256) = 32),
  agency_label text not null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked')),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  accepted_by_user_id uuid references auth.users(id) on delete restrict,
  accepted_relationship_id bigint,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_organization_id, id),
  check (
    agency_label = btrim(agency_label)
    and length(agency_label) between 1 and 120
    and agency_label !~ '[[:cntrl:]]'
  ),
  check (expires_at > created_at and expires_at <= created_at + interval '30 days'),
  check (updated_at >= created_at),
  check (
    (status = 'pending' and accepted_by_user_id is null
      and accepted_relationship_id is null and accepted_at is null
      and revoked_at is null)
    or (status = 'accepted' and accepted_by_user_id is not null
      and accepted_relationship_id is not null and accepted_at is not null
      and revoked_at is null)
    or (status = 'revoked' and accepted_by_user_id is null
      and accepted_relationship_id is null and accepted_at is null
      and revoked_at is not null)
  )
);

create table loyalty.organization_agency_relationships (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  client_organization_id bigint not null
    references loyalty.organizations(id) on delete restrict,
  agency_organization_id bigint not null
    references loyalty.organizations(id) on delete restrict,
  invitation_id bigint not null unique,
  client_approved_by_user_id uuid not null
    references auth.users(id) on delete restrict,
  agency_approved_by_user_id uuid not null
    references auth.users(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'revoked')),
  lifecycle_revision bigint not null default 1 check (lifecycle_revision >= 1),
  accepted_at timestamptz not null default now(),
  revoked_by_user_id uuid references auth.users(id) on delete restrict,
  revoked_by_organization_id bigint references loyalty.organizations(id) on delete restrict,
  revocation_reason text,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_organization_id, id),
  unique (agency_organization_id, id),
  foreign key (client_organization_id, invitation_id)
    references loyalty.organization_agency_invitations(client_organization_id, id)
    on delete restrict,
  check (client_organization_id <> agency_organization_id),
  check (updated_at >= created_at and accepted_at >= created_at),
  check (
    (status = 'active' and revoked_by_user_id is null
      and revoked_by_organization_id is null and revocation_reason is null
      and revoked_at is null)
    or (status = 'revoked' and revoked_by_user_id is not null
      and revoked_by_organization_id in (client_organization_id, agency_organization_id)
      and revocation_reason is not null and revoked_at is not null)
  ),
  check (
    revocation_reason is null or (
      revocation_reason = btrim(revocation_reason)
      and length(revocation_reason) between 8 and 500
      and revocation_reason !~ '[[:cntrl:]]'
    )
  )
);

alter table loyalty.organization_agency_invitations
  add constraint organization_agency_invitation_relationship_fkey
  foreign key (client_organization_id, accepted_relationship_id)
  references loyalty.organization_agency_relationships(client_organization_id, id)
  deferrable initially deferred;

create unique index organization_agency_relationship_active_pair_uidx
  on loyalty.organization_agency_relationships (
    client_organization_id, agency_organization_id
  ) where status = 'active';
create index organization_agency_relationship_agency_idx
  on loyalty.organization_agency_relationships (
    agency_organization_id, status, accepted_at desc, id desc
  );
create index organization_agency_invitation_client_idx
  on loyalty.organization_agency_invitations (
    client_organization_id, status, created_at desc, id desc
  );

create table loyalty.organization_agency_events (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null references loyalty.organizations(id) on delete restrict,
  client_organization_id bigint not null references loyalty.organizations(id) on delete restrict,
  agency_organization_id bigint references loyalty.organizations(id) on delete restrict,
  invitation_id bigint references loyalty.organization_agency_invitations(id) on delete restrict,
  relationship_id bigint references loyalty.organization_agency_relationships(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in (
    'agency.invitation.create', 'agency.relationship.accept',
    'agency.relationship.revoke'
  )),
  outcome text not null check (outcome in ('created', 'accepted', 'revoked')),
  idempotency_key text not null,
  request_sha256 bytea not null check (octet_length(request_sha256) = 32),
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, idempotency_key),
  check (length(idempotency_key) between 1 and 255),
  check (organization_id in (client_organization_id, agency_organization_id))
);

create index organization_agency_events_history_idx
  on loyalty.organization_agency_events (organization_id, created_at desc, id desc);

alter table loyalty.organization_agency_invitations owner to loyalty_owner;
alter table loyalty.organization_agency_relationships owner to loyalty_owner;
alter table loyalty.organization_agency_events owner to loyalty_owner;
alter table loyalty.organization_agency_invitations enable row level security;
alter table loyalty.organization_agency_relationships enable row level security;
alter table loyalty.organization_agency_events enable row level security;
revoke all on loyalty.organization_agency_invitations,
  loyalty.organization_agency_relationships,
  loyalty.organization_agency_events
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

create trigger organization_agency_events_immutable
before update or delete on loyalty.organization_agency_events
for each row execute function loyalty_private.reject_immutable_change();

create or replace function loyalty_private.guard_organization_agency_invitation_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('loyalty.agency_command', true) is distinct from 'on' then
    raise exception using errcode = '55000',
      message = 'agency invitation mutations require an exact command';
  end if;
  if tg_op = 'DELETE'
     or new.client_organization_id <> old.client_organization_id
     or new.public_id <> old.public_id
     or new.token_sha256 <> old.token_sha256
     or new.agency_label <> old.agency_label
     or new.created_by_user_id <> old.created_by_user_id
     or new.expires_at <> old.expires_at
     or new.created_at <> old.created_at then
    raise exception using errcode = '55000',
      message = 'agency invitation authority is immutable';
  end if;
  return new;
end;
$$;

create or replace function loyalty_private.guard_organization_agency_relationship_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('loyalty.agency_command', true) is distinct from 'on' then
    raise exception using errcode = '55000',
      message = 'agency relationship mutations require an exact command';
  end if;
  if tg_op = 'DELETE'
     or new.client_organization_id <> old.client_organization_id
     or new.agency_organization_id <> old.agency_organization_id
     or new.public_id <> old.public_id
     or new.invitation_id <> old.invitation_id
     or new.client_approved_by_user_id <> old.client_approved_by_user_id
     or new.agency_approved_by_user_id <> old.agency_approved_by_user_id
     or new.accepted_at <> old.accepted_at
     or new.created_at <> old.created_at
     or new.lifecycle_revision <> old.lifecycle_revision + 1
     or old.status = 'revoked' then
    raise exception using errcode = '55000',
      message = 'agency relationship authority is immutable';
  end if;
  return new;
end;
$$;

alter function loyalty_private.guard_organization_agency_invitation_v1()
  owner to loyalty_owner;
alter function loyalty_private.guard_organization_agency_relationship_v1()
  owner to loyalty_owner;
revoke all on function loyalty_private.guard_organization_agency_invitation_v1()
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function loyalty_private.guard_organization_agency_relationship_v1()
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

create trigger organization_agency_invitations_guarded
before update or delete on loyalty.organization_agency_invitations
for each row execute function loyalty_private.guard_organization_agency_invitation_v1();
create trigger organization_agency_relationships_guarded
before update or delete on loyalty.organization_agency_relationships
for each row execute function loyalty_private.guard_organization_agency_relationship_v1();

create or replace function loyalty.create_organization_agency_invitation_command_v1(
  target_client_organization_public_id uuid,
  target_agency_label text,
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
  request_actor uuid := loyalty_private.request_user_id();
  organization_row loyalty.organizations%rowtype;
  invitation_row loyalty.organization_agency_invitations%rowtype;
  event_row loyalty.organization_agency_events%rowtype;
  request_hash bytea;
begin
  if request_actor is null
     or target_client_organization_public_id is null
     or target_agency_label is null
     or target_agency_label <> btrim(target_agency_label)
     or length(target_agency_label) not between 1 and 120
     or target_agency_label ~ '[[:cntrl:]]'
     or target_expires_at is null
     or target_expires_at <= statement_timestamp() + interval '15 minutes'
     or target_expires_at > statement_timestamp() + interval '30 days'
     or target_token_sha256 is null
     or target_token_sha256 !~ '^[a-f0-9]{64}$'
     or target_idempotency_key is null
     or target_idempotency_key <> btrim(target_idempotency_key)
     or length(target_idempotency_key) not between 1 and 255
     or target_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid agency invitation command';
  end if;

  select organization.* into organization_row
  from loyalty.organizations as organization
  where organization.public_id = target_client_organization_public_id
  for update;
  if organization_row.id is null
     or organization_row.status <> 'active'
     or organization_row.offboarded_at is not null
     or not loyalty_private.has_enterprise_permission_v1(
       organization_row.id, 'agency.manage'
     ) then
    raise exception using errcode = '42501', message = 'agency invitation not authorized';
  end if;

  request_hash := extensions.digest(convert_to(jsonb_build_object(
    'clientOrganizationId', target_client_organization_public_id,
    'agencyLabel', target_agency_label,
    'expiresAt', target_expires_at,
    'tokenSha256', target_token_sha256
  )::text, 'UTF8'), 'sha256');

  select event.* into event_row
  from loyalty.organization_agency_events as event
  where event.organization_id = organization_row.id
    and event.idempotency_key = target_idempotency_key;
  if event_row.id is not null then
    if event_row.action <> 'agency.invitation.create'
       or event_row.request_sha256 <> request_hash
       or event_row.actor_user_id <> request_actor
       or event_row.correlation_id <> target_correlation_id then
      raise exception using errcode = '23514', message = 'agency invitation idempotency conflict';
    end if;
    select invitation.* into invitation_row
    from loyalty.organization_agency_invitations as invitation
    where invitation.id = event_row.invitation_id;
    return query select invitation_row.public_id, 'duplicate'::text,
      1::bigint, case
        when invitation_row.status = 'pending' and invitation_row.expires_at <= statement_timestamp()
          then 'expired' else invitation_row.status end;
    return;
  end if;

  insert into loyalty.organization_agency_invitations (
    client_organization_id, token_sha256, agency_label,
    created_by_user_id, expires_at
  ) values (
    organization_row.id, decode(target_token_sha256, 'hex'), target_agency_label,
    request_actor, target_expires_at
  ) returning * into invitation_row;

  insert into loyalty.organization_agency_events (
    organization_id, client_organization_id, invitation_id, actor_user_id,
    action, outcome, idempotency_key, request_sha256, correlation_id
  ) values (
    organization_row.id, organization_row.id, invitation_row.id, request_actor,
    'agency.invitation.create', 'created', target_idempotency_key,
    request_hash, target_correlation_id
  );

  return query select invitation_row.public_id, 'created'::text,
    1::bigint, 'pending'::text;
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'agency invitation conflicts with existing state';
end;
$$;

create or replace function loyalty.accept_organization_agency_invitation_command_v1(
  target_agency_organization_public_id uuid,
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
  request_actor uuid := loyalty_private.request_user_id();
  agency_row loyalty.organizations%rowtype;
  client_row loyalty.organizations%rowtype;
  invitation_row loyalty.organization_agency_invitations%rowtype;
  relationship_row loyalty.organization_agency_relationships%rowtype;
  event_row loyalty.organization_agency_events%rowtype;
  request_hash bytea;
  accepted_time timestamptz := statement_timestamp();
begin
  if request_actor is null
     or target_agency_organization_public_id is null
     or target_token_sha256 is null
     or target_token_sha256 !~ '^[a-f0-9]{64}$'
     or target_idempotency_key is null
     or target_idempotency_key <> btrim(target_idempotency_key)
     or length(target_idempotency_key) not between 1 and 255
     or target_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid agency acceptance command';
  end if;

  select organization.* into agency_row
  from loyalty.organizations as organization
  where organization.public_id = target_agency_organization_public_id;
  if agency_row.id is null then
    raise exception using errcode = '42501', message = 'agency acceptance not authorized';
  end if;

  request_hash := extensions.digest(convert_to(jsonb_build_object(
    'agencyOrganizationId', target_agency_organization_public_id,
    'tokenSha256', target_token_sha256
  )::text, 'UTF8'), 'sha256');
  select invitation.* into invitation_row
  from loyalty.organization_agency_invitations as invitation
  where invitation.token_sha256 = decode(target_token_sha256, 'hex')
  for update;
  if invitation_row.id is null then
    raise exception using errcode = '42501', message = 'agency acceptance not authorized';
  end if;
  select organization.* into client_row
  from loyalty.organizations as organization
  where organization.id = invitation_row.client_organization_id;

  perform organization.id
  from loyalty.organizations as organization
  where organization.id in (agency_row.id, client_row.id)
  order by organization.id
  for update;

  select organization.* into agency_row
  from loyalty.organizations as organization where organization.id = agency_row.id;
  select organization.* into client_row
  from loyalty.organizations as organization where organization.id = client_row.id;
  -- The invitation and both organizations serialize acceptance. Re-read the
  -- idempotency event only after those locks so an exact concurrent retry sees
  -- the committed first effect and returns the same relationship.
  select event.* into event_row
  from loyalty.organization_agency_events as event
  where event.organization_id = agency_row.id
    and event.idempotency_key = target_idempotency_key;
  if event_row.id is not null then
    if event_row.action <> 'agency.relationship.accept'
       or event_row.request_sha256 <> request_hash
       or event_row.actor_user_id <> request_actor
       or event_row.correlation_id <> target_correlation_id then
      raise exception using errcode = '23514', message = 'agency acceptance idempotency conflict';
    end if;
    select relationship.* into relationship_row
    from loyalty.organization_agency_relationships as relationship
    where relationship.id = event_row.relationship_id;
    return query select relationship_row.public_id, 'duplicate'::text,
      relationship_row.lifecycle_revision, relationship_row.status;
    return;
  end if;

  if agency_row.id = client_row.id
     or agency_row.status <> 'active' or agency_row.offboarded_at is not null
     or client_row.status <> 'active' or client_row.offboarded_at is not null
     or invitation_row.status <> 'pending'
     or invitation_row.expires_at <= accepted_time
     or not exists (
       select 1 from loyalty.organization_memberships as membership
       where membership.organization_id = client_row.id
         and membership.user_id = invitation_row.created_by_user_id
         and membership.role = 'owner'
         and membership.revoked_at is null
     )
     or not exists (
       select 1 from loyalty.organization_memberships as membership
       where membership.organization_id = agency_row.id
         and membership.user_id = request_actor
         and membership.role = 'owner'
         and membership.revoked_at is null
     ) then
    raise exception using errcode = '42501', message = 'agency acceptance not authorized';
  end if;

  perform set_config('loyalty.agency_command', 'on', true);
  insert into loyalty.organization_agency_relationships (
    client_organization_id, agency_organization_id, invitation_id,
    client_approved_by_user_id, agency_approved_by_user_id,
    accepted_at, created_at, updated_at
  ) values (
    client_row.id, agency_row.id, invitation_row.id,
    invitation_row.created_by_user_id, request_actor,
    accepted_time, accepted_time, accepted_time
  ) returning * into relationship_row;

  update loyalty.organization_agency_invitations
  set status = 'accepted', accepted_by_user_id = request_actor,
    accepted_relationship_id = relationship_row.id,
    accepted_at = accepted_time, updated_at = accepted_time
  where id = invitation_row.id;

  insert into loyalty.organization_agency_events (
    organization_id, client_organization_id, agency_organization_id,
    invitation_id, relationship_id, actor_user_id, action, outcome,
    idempotency_key, request_sha256, correlation_id, created_at
  ) values
  (
    agency_row.id, client_row.id, agency_row.id, invitation_row.id,
    relationship_row.id, request_actor, 'agency.relationship.accept',
    'accepted', target_idempotency_key, request_hash,
    target_correlation_id, accepted_time
  ),
  (
    client_row.id, client_row.id, agency_row.id, invitation_row.id,
    relationship_row.id, request_actor, 'agency.relationship.accept',
    'accepted', 'counterpart:' || target_correlation_id::text,
    request_hash, target_correlation_id, accepted_time
  );

  return query select relationship_row.public_id, 'created'::text,
    relationship_row.lifecycle_revision, relationship_row.status;
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'agency relationship conflicts with existing state';
end;
$$;

create or replace function loyalty.revoke_organization_agency_relationship_command_v1(
  target_organization_public_id uuid,
  target_relationship_public_id uuid,
  target_expected_revision bigint,
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
  request_actor uuid := loyalty_private.request_user_id();
  actor_organization loyalty.organizations%rowtype;
  relationship_row loyalty.organization_agency_relationships%rowtype;
  event_row loyalty.organization_agency_events%rowtype;
  request_hash bytea;
  revoked_time timestamptz := statement_timestamp();
begin
  if request_actor is null
     or target_organization_public_id is null
     or target_relationship_public_id is null
     or target_expected_revision is null or target_expected_revision < 1
     or target_reason is null or target_reason <> btrim(target_reason)
     or length(target_reason) not between 8 and 500
     or target_reason ~ '[[:cntrl:]]'
     or target_idempotency_key is null
     or target_idempotency_key <> btrim(target_idempotency_key)
     or length(target_idempotency_key) not between 1 and 255
     or target_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid agency revocation command';
  end if;

  select organization.* into actor_organization
  from loyalty.organizations as organization
  where organization.public_id = target_organization_public_id;
  if actor_organization.id is null then
    raise exception using errcode = '42501', message = 'agency revocation not authorized';
  end if;
  request_hash := extensions.digest(convert_to(jsonb_build_object(
    'organizationId', target_organization_public_id,
    'relationshipId', target_relationship_public_id,
    'expectedRevision', target_expected_revision,
    'reason', target_reason
  )::text, 'UTF8'), 'sha256');

  select event.* into event_row
  from loyalty.organization_agency_events as event
  where event.organization_id = actor_organization.id
    and event.idempotency_key = target_idempotency_key;
  if event_row.id is not null then
    if event_row.action <> 'agency.relationship.revoke'
       or event_row.request_sha256 <> request_hash
       or event_row.actor_user_id <> request_actor
       or event_row.correlation_id <> target_correlation_id then
      raise exception using errcode = '23514', message = 'agency revocation idempotency conflict';
    end if;
    select relationship.* into relationship_row
    from loyalty.organization_agency_relationships as relationship
    where relationship.id = event_row.relationship_id;
    return query select relationship_row.public_id, 'duplicate'::text,
      relationship_row.lifecycle_revision, relationship_row.status;
    return;
  end if;

  select relationship.* into relationship_row
  from loyalty.organization_agency_relationships as relationship
  where relationship.public_id = target_relationship_public_id;
  if relationship_row.id is null
     or actor_organization.id not in (
       relationship_row.client_organization_id,
       relationship_row.agency_organization_id
     ) then
    raise exception using errcode = '42501', message = 'agency revocation not authorized';
  end if;

  perform organization.id
  from loyalty.organizations as organization
  where organization.id in (
    relationship_row.client_organization_id,
    relationship_row.agency_organization_id
  )
  order by organization.id
  for update;
  select relationship.* into relationship_row
  from loyalty.organization_agency_relationships as relationship
  where relationship.id = relationship_row.id
  for update;

  if not exists (
       select 1 from loyalty.organization_memberships as membership
       where membership.organization_id = actor_organization.id
         and membership.user_id = request_actor
         and membership.role = 'owner'
         and membership.revoked_at is null
     ) then
    raise exception using errcode = '42501', message = 'agency revocation not authorized';
  end if;
  if relationship_row.status <> 'active'
     or relationship_row.lifecycle_revision <> target_expected_revision then
    raise exception using errcode = '40001', message = 'agency relationship revision conflict';
  end if;

  perform set_config('loyalty.agency_command', 'on', true);
  update loyalty.organization_agency_relationships as relationship
  set status = 'revoked',
    lifecycle_revision = relationship.lifecycle_revision + 1,
    revoked_by_user_id = request_actor,
    revoked_by_organization_id = actor_organization.id,
    revocation_reason = target_reason,
    revoked_at = revoked_time,
    updated_at = revoked_time
  where relationship.id = relationship_row.id
  returning * into relationship_row;

  insert into loyalty.organization_agency_events (
    organization_id, client_organization_id, agency_organization_id,
    invitation_id, relationship_id, actor_user_id, action, outcome,
    idempotency_key, request_sha256, correlation_id, created_at
  ) values
  (
    actor_organization.id, relationship_row.client_organization_id,
    relationship_row.agency_organization_id, relationship_row.invitation_id,
    relationship_row.id, request_actor, 'agency.relationship.revoke',
    'revoked', target_idempotency_key, request_hash,
    target_correlation_id, revoked_time
  ),
  (
    case when actor_organization.id = relationship_row.client_organization_id
      then relationship_row.agency_organization_id
      else relationship_row.client_organization_id end,
    relationship_row.client_organization_id,
    relationship_row.agency_organization_id, relationship_row.invitation_id,
    relationship_row.id, request_actor, 'agency.relationship.revoke',
    'revoked', 'counterpart:' || target_correlation_id::text,
    request_hash, target_correlation_id, revoked_time
  );

  return query select relationship_row.public_id, 'revoked'::text,
    relationship_row.lifecycle_revision, relationship_row.status;
end;
$$;

create or replace function loyalty.get_organization_agency_portfolio_v1(
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
  request_actor uuid := loyalty_private.request_user_id();
  selected record;
begin
  if target_organization_public_id is null then
    raise exception using errcode = '22023', message = 'invalid agency portfolio request';
  end if;
  select organization.id as organization_id,
    organization.public_id as organization_public_id,
    organization.name as organization_name,
    organization.status as organization_status,
    organization.offboarded_at,
    membership.role
  into selected
  from loyalty.organizations as organization
  join loyalty.organization_memberships as membership
    on membership.organization_id = organization.id
   and membership.user_id = request_actor
   and membership.revoked_at is null
  where organization.public_id = target_organization_public_id;
  if not found then return; end if;

  return query
  select jsonb_build_object(
    'schemaVersion', '1',
    'organization', jsonb_build_object(
      'id', selected.organization_public_id,
      'name', selected.organization_name
    ),
    'mayInviteAgency', selected.organization_status = 'active'
      and selected.offboarded_at is null and selected.role = 'owner',
    'mayAcceptAgency', selected.organization_status = 'active'
      and selected.offboarded_at is null and selected.role = 'owner',
    'mayRequestSupport', selected.organization_status = 'active'
      and selected.offboarded_at is null
      and selected.role in ('owner', 'admin', 'operator'),
    'invitations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', invitation.public_id,
        'agencyLabel', invitation.agency_label,
        'status', case
          when invitation.status = 'pending'
            and invitation.expires_at <= statement_timestamp() then 'expired'
          else invitation.status end,
        'expiresAt', invitation.expires_at,
        'createdAt', invitation.created_at
      ) order by invitation.created_at desc, invitation.id desc)
      from (
        select candidate.*
        from loyalty.organization_agency_invitations as candidate
        where candidate.client_organization_id = selected.organization_id
        order by candidate.created_at desc, candidate.id desc
        limit 100
      ) as invitation
    ), '[]'::jsonb),
    'relationships', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', relationship.public_id,
        'perspective', case
          when relationship.client_organization_id = selected.organization_id
            then 'client' else 'agency' end,
        'counterpart', jsonb_build_object(
          'id', counterpart.public_id,
          'name', counterpart.name
        ),
        'status', relationship.status,
        'revision', relationship.lifecycle_revision,
        'acceptedAt', relationship.accepted_at,
        'revokedAt', relationship.revoked_at
      ) order by relationship.accepted_at desc, relationship.id desc)
      from loyalty.organization_agency_relationships as relationship
      join loyalty.organizations as counterpart
        on counterpart.id = case
          when relationship.client_organization_id = selected.organization_id
            then relationship.agency_organization_id
          else relationship.client_organization_id end
      where relationship.client_organization_id = selected.organization_id
         or relationship.agency_organization_id = selected.organization_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function loyalty_private.valid_support_scopes_v1(
  target_scopes text[]
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select target_scopes is not null
    and cardinality(target_scopes) between 1 and 4
    and target_scopes <@ array[
      'organization.summary.read',
      'members.summary.read',
      'identity.health.read',
      'audit.summary.read'
    ]::text[]
    and target_scopes = (
      select array_agg(distinct scope order by scope)
      from unnest(target_scopes) as scope
    );
$$;

alter function loyalty_private.valid_support_scopes_v1(text[]) owner to loyalty_owner;
revoke all on function loyalty_private.valid_support_scopes_v1(text[])
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

create table loyalty.organization_support_access_requests (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  client_organization_id bigint not null
    references loyalty.organizations(id) on delete restrict,
  agency_organization_id bigint not null
    references loyalty.organizations(id) on delete restrict,
  relationship_id bigint not null,
  support_user_id uuid not null references auth.users(id) on delete restrict,
  requested_scopes text[] not null
    check (loyalty_private.valid_support_scopes_v1(requested_scopes)),
  approved_scopes text[]
    check (approved_scopes is null or loyalty_private.valid_support_scopes_v1(approved_scopes)),
  reason text not null,
  decision_reason text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'revoked')),
  lifecycle_revision bigint not null default 1 check (lifecycle_revision >= 1),
  requested_expires_at timestamptz not null,
  resolved_by_user_id uuid references auth.users(id) on delete restrict,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_organization_id, id),
  unique (agency_organization_id, id),
  foreign key (client_organization_id, relationship_id)
    references loyalty.organization_agency_relationships(client_organization_id, id)
    on delete restrict,
  check (client_organization_id <> agency_organization_id),
  check (
    reason = btrim(reason) and length(reason) between 8 and 500
    and reason !~ '[[:cntrl:]]'
  ),
  check (
    decision_reason is null or (
      decision_reason = btrim(decision_reason)
      and length(decision_reason) between 8 and 500
      and decision_reason !~ '[[:cntrl:]]'
    )
  ),
  check (requested_expires_at > created_at
    and requested_expires_at <= created_at + interval '4 hours'),
  check (updated_at >= created_at),
  check (
    (status = 'pending' and approved_scopes is null
      and decision_reason is null and resolved_by_user_id is null
      and resolved_at is null)
    or (status = 'approved' and approved_scopes is not null
      and decision_reason is not null and resolved_by_user_id is not null
      and resolved_at is not null)
    or (status = 'rejected' and approved_scopes is null
      and decision_reason is not null and resolved_by_user_id is not null
      and resolved_at is not null)
    or (status = 'revoked' and decision_reason is not null
      and resolved_by_user_id is not null and resolved_at is not null)
  )
);

create index organization_support_requests_client_idx
  on loyalty.organization_support_access_requests (
    client_organization_id, status, created_at desc, id desc
  );
create index organization_support_requests_agency_idx
  on loyalty.organization_support_access_requests (
    agency_organization_id, support_user_id, status, created_at desc, id desc
  );

create table loyalty.organization_support_events (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null references loyalty.organizations(id) on delete restrict,
  client_organization_id bigint not null references loyalty.organizations(id) on delete restrict,
  agency_organization_id bigint not null references loyalty.organizations(id) on delete restrict,
  request_id bigint not null references loyalty.organization_support_access_requests(id) on delete restrict,
  grant_id bigint,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in (
    'support.request.create', 'support.request.approve',
    'support.request.reject', 'support.request.revoke',
    'support.grant.revoke'
  )),
  outcome text not null check (outcome in ('created', 'approved', 'rejected', 'revoked')),
  idempotency_key text not null,
  request_sha256 bytea not null check (octet_length(request_sha256) = 32),
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, idempotency_key),
  check (organization_id in (client_organization_id, agency_organization_id)),
  check (length(idempotency_key) between 1 and 255)
);

alter table loyalty.support_access_grants
  drop constraint support_access_grants_support_user_id_fkey,
  add constraint support_access_grants_support_user_id_fkey
    foreign key (support_user_id) references auth.users(id) on delete restrict,
  add column grant_version text not null default 'legacy'
    check (grant_version in ('legacy', '1')),
  add column relationship_id bigint,
  add column request_id bigint,
  add column lifecycle_revision bigint not null default 1
    check (lifecycle_revision >= 1),
  add column revoked_by_user_id uuid references auth.users(id) on delete restrict,
  add column revocation_reason text,
  add column updated_at timestamptz not null default now(),
  add constraint support_access_grants_organization_id_id_key
    unique (organization_id, id),
  add constraint support_access_grants_request_unique unique (request_id),
  add constraint support_access_grants_relationship_fkey
    foreign key (organization_id, relationship_id)
    references loyalty.organization_agency_relationships(client_organization_id, id)
    on delete restrict,
  add constraint support_access_grants_request_fkey
    foreign key (organization_id, request_id)
    references loyalty.organization_support_access_requests(client_organization_id, id)
    on delete restrict,
  add constraint support_access_grants_v1_shape_check check (
    (grant_version = 'legacy' and relationship_id is null and request_id is null)
    or (grant_version = '1' and relationship_id is not null and request_id is not null
      and loyalty_private.valid_support_scopes_v1(scopes))
  ),
  add constraint support_access_grants_revocation_actor_check check (
    (revoked_at is null and revoked_by_user_id is null and revocation_reason is null)
    or (revoked_at is not null and revoked_by_user_id is not null
      and revocation_reason is not null)
  ),
  add constraint support_access_grants_revocation_reason_check check (
    revocation_reason is null or (
      revocation_reason = btrim(revocation_reason)
      and length(revocation_reason) between 8 and 500
      and revocation_reason !~ '[[:cntrl:]]'
    )
  ),
  add constraint support_access_grants_updated_at_check check (updated_at >= created_at);

alter table loyalty.organization_support_events
  add constraint organization_support_events_grant_fkey
  foreign key (client_organization_id, grant_id)
  references loyalty.support_access_grants(organization_id, id)
  on delete restrict;

create table loyalty.support_access_use_events (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  client_organization_id bigint not null references loyalty.organizations(id) on delete restrict,
  agency_organization_id bigint not null references loyalty.organizations(id) on delete restrict,
  grant_id bigint not null,
  support_user_id uuid not null references auth.users(id) on delete restrict,
  auth_session_id uuid not null,
  scopes text[] not null check (loyalty_private.valid_support_scopes_v1(scopes)),
  surface text not null check (surface in ('support_workspace', 'organization_export')),
  created_at timestamptz not null default now(),
  unique (client_organization_id, id),
  foreign key (client_organization_id, grant_id)
    references loyalty.support_access_grants(organization_id, id)
    on delete restrict
);

create index support_access_use_events_client_idx
  on loyalty.support_access_use_events (
    client_organization_id, created_at desc, id desc
  );
create index support_access_use_events_grant_idx
  on loyalty.support_access_use_events (grant_id, created_at desc, id desc);

drop policy if exists support_access_grants_subject_or_admin_select
  on loyalty.support_access_grants;
revoke select on loyalty.support_access_grants from authenticated;

alter table loyalty.organization_support_access_requests owner to loyalty_owner;
alter table loyalty.organization_support_events owner to loyalty_owner;
alter table loyalty.support_access_use_events owner to loyalty_owner;
alter table loyalty.organization_support_access_requests enable row level security;
alter table loyalty.organization_support_events enable row level security;
alter table loyalty.support_access_use_events enable row level security;
revoke all on loyalty.organization_support_access_requests,
  loyalty.organization_support_events,
  loyalty.support_access_use_events,
  loyalty.support_access_grants
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

create trigger organization_support_events_immutable
before update or delete on loyalty.organization_support_events
for each row execute function loyalty_private.reject_immutable_change();
create trigger support_access_use_events_immutable
before update or delete on loyalty.support_access_use_events
for each row execute function loyalty_private.reject_immutable_change();

create or replace function loyalty_private.guard_support_access_request_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('loyalty.support_command', true) is distinct from 'on' then
    raise exception using errcode = '55000',
      message = 'support request mutations require an exact command';
  end if;
  if tg_op = 'DELETE'
     or new.client_organization_id <> old.client_organization_id
     or new.agency_organization_id <> old.agency_organization_id
     or new.public_id <> old.public_id
     or new.relationship_id <> old.relationship_id
     or new.support_user_id <> old.support_user_id
     or new.requested_scopes <> old.requested_scopes
     or new.reason <> old.reason
     or new.requested_expires_at <> old.requested_expires_at
     or new.created_at <> old.created_at
     or new.lifecycle_revision <> old.lifecycle_revision + 1
     or old.status in ('rejected', 'revoked') then
    raise exception using errcode = '55000',
      message = 'support request authority is immutable';
  end if;
  return new;
end;
$$;

create or replace function loyalty_private.guard_support_access_grant_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('loyalty.support_command', true) is distinct from 'on' then
    raise exception using errcode = '55000',
      message = 'support grant mutations require an exact command';
  end if;
  if tg_op = 'DELETE'
     or new.organization_id <> old.organization_id
     or new.public_id <> old.public_id
     or new.support_user_id <> old.support_user_id
     or new.approved_by_user_id <> old.approved_by_user_id
     or new.reason <> old.reason
     or new.scopes <> old.scopes
     or new.starts_at <> old.starts_at
     or new.expires_at <> old.expires_at
     or new.created_at <> old.created_at
     or new.grant_version <> old.grant_version
     or new.relationship_id is distinct from old.relationship_id
     or new.request_id is distinct from old.request_id
     or new.lifecycle_revision <> old.lifecycle_revision + 1
     or old.revoked_at is not null then
    raise exception using errcode = '55000',
      message = 'support grant authority is immutable';
  end if;
  return new;
end;
$$;

alter function loyalty_private.guard_support_access_request_v1() owner to loyalty_owner;
alter function loyalty_private.guard_support_access_grant_v1() owner to loyalty_owner;
revoke all on function loyalty_private.guard_support_access_request_v1()
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function loyalty_private.guard_support_access_grant_v1()
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

create trigger organization_support_access_requests_guarded
before update or delete on loyalty.organization_support_access_requests
for each row execute function loyalty_private.guard_support_access_request_v1();
create trigger support_access_grants_guarded
before update or delete on loyalty.support_access_grants
for each row execute function loyalty_private.guard_support_access_grant_v1();

create or replace function loyalty.create_support_access_request_command_v1(
  target_agency_organization_public_id uuid,
  target_client_organization_public_id uuid,
  target_scopes text[],
  target_reason text,
  target_requested_expires_at timestamptz,
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
  request_actor uuid := loyalty_private.request_user_id();
  agency_row loyalty.organizations%rowtype;
  client_row loyalty.organizations%rowtype;
  relationship_row loyalty.organization_agency_relationships%rowtype;
  membership_row loyalty.organization_memberships%rowtype;
  support_request loyalty.organization_support_access_requests%rowtype;
  event_row loyalty.organization_support_events%rowtype;
  request_hash bytea;
  requested_time timestamptz := statement_timestamp();
begin
  if request_actor is null
     or target_agency_organization_public_id is null
     or target_client_organization_public_id is null
     or target_agency_organization_public_id = target_client_organization_public_id
     or not loyalty_private.valid_support_scopes_v1(target_scopes)
     or target_reason is null or target_reason <> btrim(target_reason)
     or length(target_reason) not between 8 and 500
     or target_reason ~ '[[:cntrl:]]'
     or target_requested_expires_at is null
     or target_requested_expires_at <= requested_time + interval '5 minutes'
     or target_requested_expires_at > requested_time + interval '4 hours'
     or target_idempotency_key is null
     or target_idempotency_key <> btrim(target_idempotency_key)
     or length(target_idempotency_key) not between 1 and 255
     or target_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid support access request';
  end if;

  select organization.* into agency_row
  from loyalty.organizations as organization
  where organization.public_id = target_agency_organization_public_id;
  select organization.* into client_row
  from loyalty.organizations as organization
  where organization.public_id = target_client_organization_public_id;
  if agency_row.id is null or client_row.id is null then
    raise exception using errcode = '42501', message = 'support access request not authorized';
  end if;
  perform organization.id
  from loyalty.organizations as organization
  where organization.id in (agency_row.id, client_row.id)
  order by organization.id for update;
  select organization.* into agency_row
  from loyalty.organizations as organization where organization.id = agency_row.id;
  select organization.* into client_row
  from loyalty.organizations as organization where organization.id = client_row.id;

  select membership.* into membership_row
  from loyalty.organization_memberships as membership
  where membership.organization_id = agency_row.id
    and membership.user_id = request_actor
    and membership.role in ('owner', 'admin', 'operator')
    and membership.revoked_at is null;
  if agency_row.status <> 'active' or agency_row.offboarded_at is not null
     or client_row.status <> 'active' or client_row.offboarded_at is not null
     or membership_row.id is null
     or exists (
       select 1 from loyalty.organization_memberships as client_membership
       where client_membership.organization_id = client_row.id
         and client_membership.user_id = request_actor
         and client_membership.revoked_at is null
     ) then
    raise exception using errcode = '42501', message = 'support access request not authorized';
  end if;

  select relationship.* into relationship_row
  from loyalty.organization_agency_relationships as relationship
  where relationship.client_organization_id = client_row.id
    and relationship.agency_organization_id = agency_row.id
    and relationship.status = 'active'
  for update;
  if relationship_row.id is null then
    raise exception using errcode = '42501', message = 'support access request not authorized';
  end if;

  request_hash := extensions.digest(convert_to(jsonb_build_object(
    'agencyOrganizationId', target_agency_organization_public_id,
    'clientOrganizationId', target_client_organization_public_id,
    'scopes', target_scopes,
    'reason', target_reason,
    'requestedExpiresAt', target_requested_expires_at
  )::text, 'UTF8'), 'sha256');
  select event.* into event_row
  from loyalty.organization_support_events as event
  where event.organization_id = agency_row.id
    and event.idempotency_key = target_idempotency_key;
  if event_row.id is not null then
    if event_row.action <> 'support.request.create'
       or event_row.request_sha256 <> request_hash
       or event_row.actor_user_id <> request_actor
       or event_row.correlation_id <> target_correlation_id then
      raise exception using errcode = '23514', message = 'support request idempotency conflict';
    end if;
    select request.* into support_request
    from loyalty.organization_support_access_requests as request
    where request.id = event_row.request_id;
    return query select support_request.public_id, 'duplicate'::text,
      support_request.lifecycle_revision, case
        when support_request.status = 'pending'
          and support_request.requested_expires_at <= statement_timestamp()
          then 'expired' else support_request.status end;
    return;
  end if;

  insert into loyalty.organization_support_access_requests (
    client_organization_id, agency_organization_id, relationship_id,
    support_user_id, requested_scopes, reason, requested_expires_at,
    created_at, updated_at
  ) values (
    client_row.id, agency_row.id, relationship_row.id,
    request_actor, target_scopes, target_reason, target_requested_expires_at,
    requested_time, requested_time
  ) returning * into support_request;

  insert into loyalty.organization_support_events (
    organization_id, client_organization_id, agency_organization_id,
    request_id, actor_user_id, action, outcome, idempotency_key,
    request_sha256, correlation_id, created_at
  ) values (
    agency_row.id, client_row.id, agency_row.id,
    support_request.id, request_actor, 'support.request.create', 'created',
    target_idempotency_key, request_hash, target_correlation_id, requested_time
  );

  return query select support_request.public_id, 'created'::text,
    support_request.lifecycle_revision, support_request.status;
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'support request conflicts with existing state';
end;
$$;

create or replace function loyalty.resolve_support_access_request_command_v1(
  target_client_organization_public_id uuid,
  target_request_public_id uuid,
  target_expected_revision bigint,
  target_action text,
  target_approved_scopes text[],
  target_expires_at timestamptz,
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
  request_actor uuid := loyalty_private.request_user_id();
  client_row loyalty.organizations%rowtype;
  agency_row loyalty.organizations%rowtype;
  relationship_row loyalty.organization_agency_relationships%rowtype;
  support_request loyalty.organization_support_access_requests%rowtype;
  grant_row loyalty.support_access_grants%rowtype;
  event_row loyalty.organization_support_events%rowtype;
  request_hash bytea;
  decision_time timestamptz := statement_timestamp();
begin
  if request_actor is null
     or target_client_organization_public_id is null
     or target_request_public_id is null
     or target_expected_revision is null or target_expected_revision < 1
     or target_action not in ('approve', 'reject')
     or ((target_action = 'approve') <> (
       target_approved_scopes is not null and target_expires_at is not null
     ))
     or (target_approved_scopes is not null
       and not loyalty_private.valid_support_scopes_v1(target_approved_scopes))
     or target_reason is null or target_reason <> btrim(target_reason)
     or length(target_reason) not between 8 and 500
     or target_reason ~ '[[:cntrl:]]'
     or target_idempotency_key is null
     or target_idempotency_key <> btrim(target_idempotency_key)
     or length(target_idempotency_key) not between 1 and 255
     or target_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid support request decision';
  end if;

  select organization.* into client_row
  from loyalty.organizations as organization
  where organization.public_id = target_client_organization_public_id;
  select request.* into support_request
  from loyalty.organization_support_access_requests as request
  where request.public_id = target_request_public_id
    and request.client_organization_id = client_row.id;
  if client_row.id is null or support_request.id is null then
    raise exception using errcode = '42501', message = 'support request decision not authorized';
  end if;
  select organization.* into agency_row
  from loyalty.organizations as organization
  where organization.id = support_request.agency_organization_id;
  perform organization.id
  from loyalty.organizations as organization
  where organization.id in (client_row.id, agency_row.id)
  order by organization.id for update;
  select organization.* into client_row
  from loyalty.organizations as organization where organization.id = client_row.id;
  select organization.* into agency_row
  from loyalty.organizations as organization where organization.id = agency_row.id;
  select request.* into support_request
  from loyalty.organization_support_access_requests as request
  where request.id = support_request.id for update;
  select relationship.* into relationship_row
  from loyalty.organization_agency_relationships as relationship
  where relationship.id = support_request.relationship_id for update;

  if client_row.status <> 'active' or client_row.offboarded_at is not null
     or agency_row.status <> 'active' or agency_row.offboarded_at is not null
     or relationship_row.status <> 'active'
     or support_request.support_user_id = request_actor
     or not loyalty_private.has_enterprise_permission_v1(
       client_row.id, 'support.approve'
     ) then
    raise exception using errcode = '42501', message = 'support request decision not authorized';
  end if;

  request_hash := extensions.digest(convert_to(jsonb_build_object(
    'clientOrganizationId', target_client_organization_public_id,
    'requestId', target_request_public_id,
    'expectedRevision', target_expected_revision,
    'action', target_action,
    'approvedScopes', target_approved_scopes,
    'expiresAt', target_expires_at,
    'reason', target_reason
  )::text, 'UTF8'), 'sha256');
  select event.* into event_row
  from loyalty.organization_support_events as event
  where event.organization_id = client_row.id
    and event.idempotency_key = target_idempotency_key;
  if event_row.id is not null then
    if event_row.action <> 'support.request.' || target_action
       or event_row.request_sha256 <> request_hash
       or event_row.actor_user_id <> request_actor
       or event_row.correlation_id <> target_correlation_id then
      raise exception using errcode = '23514', message = 'support decision idempotency conflict';
    end if;
    if event_row.grant_id is not null then
      select access_grant.* into grant_row
      from loyalty.support_access_grants as access_grant
      where access_grant.id = event_row.grant_id;
      return query select grant_row.public_id, 'duplicate'::text,
        grant_row.lifecycle_revision, case when grant_row.revoked_at is null
          then 'active' else 'revoked' end;
    else
      return query select support_request.public_id, 'duplicate'::text,
        support_request.lifecycle_revision, support_request.status;
    end if;
    return;
  end if;

  if support_request.status <> 'pending'
     or support_request.lifecycle_revision <> target_expected_revision
     or support_request.requested_expires_at <= decision_time then
    raise exception using errcode = '40001', message = 'support request revision conflict';
  end if;
  if target_action = 'approve' and (
       not (target_approved_scopes <@ support_request.requested_scopes)
       or target_expires_at <= decision_time + interval '5 minutes'
       or target_expires_at > decision_time + interval '4 hours'
       or target_expires_at > support_request.requested_expires_at
       or exists (
         select 1 from loyalty.organization_memberships as membership
         where membership.organization_id = client_row.id
           and membership.user_id = support_request.support_user_id
           and membership.revoked_at is null
       )
       or not exists (
         select 1 from loyalty.organization_memberships as membership
         where membership.organization_id = agency_row.id
           and membership.user_id = support_request.support_user_id
           and membership.role in ('owner', 'admin', 'operator')
           and membership.revoked_at is null
       )
     ) then
    raise exception using errcode = '23514', message = 'support approval exceeds requested authority';
  end if;

  perform set_config('loyalty.support_command', 'on', true);
  if target_action = 'approve' then
    insert into loyalty.support_access_grants (
      organization_id, support_user_id, approved_by_user_id,
      reason, scopes, starts_at, expires_at, created_at,
      grant_version, relationship_id, request_id, updated_at
    ) values (
      client_row.id, support_request.support_user_id, request_actor,
      support_request.reason, target_approved_scopes, decision_time,
      target_expires_at, decision_time, '1', relationship_row.id,
      support_request.id, decision_time
    ) returning * into grant_row;
  end if;
  update loyalty.organization_support_access_requests as request
  set status = case when target_action = 'approve' then 'approved' else 'rejected' end,
    approved_scopes = target_approved_scopes,
    decision_reason = target_reason,
    resolved_by_user_id = request_actor,
    resolved_at = decision_time,
    lifecycle_revision = request.lifecycle_revision + 1,
    updated_at = decision_time
  where request.id = support_request.id
  returning * into support_request;

  insert into loyalty.organization_support_events (
    organization_id, client_organization_id, agency_organization_id,
    request_id, grant_id, actor_user_id, action, outcome,
    idempotency_key, request_sha256, correlation_id, created_at
  ) values (
    client_row.id, client_row.id, agency_row.id, support_request.id,
    grant_row.id, request_actor, 'support.request.' || target_action,
    case when target_action = 'approve' then 'approved' else 'rejected' end,
    target_idempotency_key, request_hash, target_correlation_id, decision_time
  );

  if target_action = 'approve' then
    return query select grant_row.public_id, 'created'::text,
      grant_row.lifecycle_revision, 'active'::text;
  else
    return query select support_request.public_id, 'updated'::text,
      support_request.lifecycle_revision, support_request.status;
  end if;
end;
$$;

create or replace function loyalty.revoke_support_access_grant_command_v1(
  target_client_organization_public_id uuid,
  target_grant_public_id uuid,
  target_expected_revision bigint,
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
  request_actor uuid := loyalty_private.request_user_id();
  client_row loyalty.organizations%rowtype;
  grant_row loyalty.support_access_grants%rowtype;
  support_request loyalty.organization_support_access_requests%rowtype;
  event_row loyalty.organization_support_events%rowtype;
  request_hash bytea;
  revoked_time timestamptz := statement_timestamp();
begin
  if request_actor is null or target_client_organization_public_id is null
     or target_grant_public_id is null
     or target_expected_revision is null or target_expected_revision < 1
     or target_reason is null or target_reason <> btrim(target_reason)
     or length(target_reason) not between 8 and 500
     or target_reason ~ '[[:cntrl:]]'
     or target_idempotency_key is null
     or target_idempotency_key <> btrim(target_idempotency_key)
     or length(target_idempotency_key) not between 1 and 255
     or target_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid support grant revocation';
  end if;
  select organization.* into client_row
  from loyalty.organizations as organization
  where organization.public_id = target_client_organization_public_id
  for update;
  if client_row.id is null
     or not loyalty_private.has_enterprise_permission_v1(
       client_row.id, 'support.approve'
     ) then
    raise exception using errcode = '42501', message = 'support grant revocation not authorized';
  end if;
  select access_grant.* into grant_row
  from loyalty.support_access_grants as access_grant
  where access_grant.organization_id = client_row.id
    and access_grant.public_id = target_grant_public_id
    and access_grant.grant_version = '1'
  for update;
  if grant_row.id is null then
    raise exception using errcode = '42501', message = 'support grant revocation not authorized';
  end if;
  select request.* into support_request
  from loyalty.organization_support_access_requests as request
  where request.id = grant_row.request_id for update;

  request_hash := extensions.digest(convert_to(jsonb_build_object(
    'clientOrganizationId', target_client_organization_public_id,
    'grantId', target_grant_public_id,
    'expectedRevision', target_expected_revision,
    'reason', target_reason
  )::text, 'UTF8'), 'sha256');
  select event.* into event_row
  from loyalty.organization_support_events as event
  where event.organization_id = client_row.id
    and event.idempotency_key = target_idempotency_key;
  if event_row.id is not null then
    if event_row.action <> 'support.grant.revoke'
       or event_row.request_sha256 <> request_hash
       or event_row.actor_user_id <> request_actor
       or event_row.correlation_id <> target_correlation_id then
      raise exception using errcode = '23514', message = 'support revocation idempotency conflict';
    end if;
    return query select grant_row.public_id, 'duplicate'::text,
      grant_row.lifecycle_revision, 'revoked'::text;
    return;
  end if;
  if grant_row.revoked_at is not null
     or grant_row.lifecycle_revision <> target_expected_revision then
    raise exception using errcode = '40001', message = 'support grant revision conflict';
  end if;

  perform set_config('loyalty.support_command', 'on', true);
  update loyalty.support_access_grants as access_grant
  set revoked_at = revoked_time, revoked_by_user_id = request_actor,
    revocation_reason = target_reason,
    lifecycle_revision = access_grant.lifecycle_revision + 1,
    updated_at = revoked_time
  where access_grant.id = grant_row.id returning * into grant_row;
  update loyalty.organization_support_access_requests as request
  set status = 'revoked', decision_reason = target_reason,
    resolved_by_user_id = request_actor, resolved_at = revoked_time,
    lifecycle_revision = request.lifecycle_revision + 1,
    updated_at = revoked_time
  where request.id = support_request.id
  returning * into support_request;

  insert into loyalty.organization_support_events (
    organization_id, client_organization_id, agency_organization_id,
    request_id, grant_id, actor_user_id, action, outcome,
    idempotency_key, request_sha256, correlation_id, created_at
  ) values (
    client_row.id, client_row.id, support_request.agency_organization_id,
    support_request.id, grant_row.id, request_actor,
    'support.grant.revoke', 'revoked', target_idempotency_key,
    request_hash, target_correlation_id, revoked_time
  );

  return query select grant_row.public_id, 'revoked'::text,
    grant_row.lifecycle_revision, 'revoked'::text;
end;
$$;

create or replace function loyalty_private.revoke_relationship_support_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row record;
  revoked_time timestamptz := coalesce(new.revoked_at, statement_timestamp());
  reason_text text := coalesce(new.revocation_reason, 'Agency relationship revoked.');
begin
  if old.status <> 'active' or new.status <> 'revoked' then return new; end if;
  perform set_config('loyalty.support_command', 'on', true);
  for request_row in
    select request.id, request.public_id, request.status,
      request.lifecycle_revision, access_grant.id as grant_id
    from loyalty.organization_support_access_requests as request
    left join loyalty.support_access_grants as access_grant
      on access_grant.request_id = request.id
     and access_grant.grant_version = '1'
    where request.relationship_id = new.id
      and request.status in ('pending', 'approved')
    order by request.id
    for update of request
  loop
    if request_row.grant_id is not null then
      update loyalty.support_access_grants as access_grant
      set revoked_at = revoked_time,
        revoked_by_user_id = new.revoked_by_user_id,
        revocation_reason = reason_text,
        lifecycle_revision = access_grant.lifecycle_revision + 1,
        updated_at = revoked_time
      where access_grant.id = request_row.grant_id
        and access_grant.revoked_at is null;
    end if;
    update loyalty.organization_support_access_requests as request
    set status = 'revoked', decision_reason = reason_text,
      resolved_by_user_id = new.revoked_by_user_id,
      resolved_at = revoked_time,
      lifecycle_revision = request.lifecycle_revision + 1,
      updated_at = revoked_time
    where request.id = request_row.id;
    insert into loyalty.organization_support_events (
      organization_id, client_organization_id, agency_organization_id,
      request_id, grant_id, actor_user_id, action, outcome,
      idempotency_key, request_sha256, correlation_id, created_at
    ) values (
      new.client_organization_id, new.client_organization_id,
      new.agency_organization_id, request_row.id, request_row.grant_id,
      new.revoked_by_user_id, case when request_row.grant_id is null
        then 'support.request.revoke' else 'support.grant.revoke' end,
      'revoked',
      'relationship-revoked:' || new.public_id::text || ':' || request_row.public_id::text,
      extensions.digest(convert_to(
        new.public_id::text || ':' || request_row.public_id::text || ':' || reason_text,
        'UTF8'
      ), 'sha256'),
      gen_random_uuid(), revoked_time
    );
  end loop;
  return new;
end;
$$;

alter function loyalty_private.revoke_relationship_support_v1() owner to loyalty_owner;
revoke all on function loyalty_private.revoke_relationship_support_v1()
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
create trigger organization_agency_relationship_support_revoke
after update on loyalty.organization_agency_relationships
for each row execute function loyalty_private.revoke_relationship_support_v1();

create or replace function loyalty.get_support_administration_workspace_v1(
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
  request_actor uuid := loyalty_private.request_user_id();
  selected record;
begin
  if target_organization_public_id is null then
    raise exception using errcode = '22023', message = 'invalid support administration request';
  end if;
  select organization.id as organization_id,
    organization.public_id as organization_public_id,
    organization.name as organization_name,
    organization.status as organization_status,
    organization.offboarded_at,
    membership.role
  into selected
  from loyalty.organizations as organization
  join loyalty.organization_memberships as membership
    on membership.organization_id = organization.id
   and membership.user_id = request_actor
   and membership.revoked_at is null
  where organization.public_id = target_organization_public_id;
  if not found then return; end if;

  return query
  select jsonb_build_object(
    'schemaVersion', '1',
    'organization', jsonb_build_object(
      'id', selected.organization_public_id,
      'name', selected.organization_name
    ),
    'mayApprove', selected.organization_status = 'active'
      and selected.offboarded_at is null and selected.role = 'owner',
    'mayReview', selected.role in ('owner', 'admin', 'auditor'),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', request.public_id,
        'perspective', case when request.client_organization_id = selected.organization_id
          then 'client' else 'agency' end,
        'counterpartName', counterpart.name,
        'requesterLabel', requester.display_label,
        'scopes', request.requested_scopes,
        'reason', request.reason,
        'status', case
          when request.status = 'pending'
            and request.requested_expires_at <= statement_timestamp() then 'expired'
          when request.status = 'approved' and access_grant.revoked_at is not null then 'revoked'
          when request.status = 'approved' and access_grant.expires_at <= statement_timestamp() then 'expired'
          else request.status end,
        'revision', request.lifecycle_revision,
        'requestedExpiresAt', request.requested_expires_at,
        'createdAt', request.created_at,
        'resolvedAt', request.resolved_at
      ) order by request.created_at desc, request.id desc)
      from (
        select candidate.*
        from loyalty.organization_support_access_requests as candidate
        where (
          candidate.client_organization_id = selected.organization_id
          and selected.role in ('owner', 'admin', 'auditor')
        ) or (
          candidate.agency_organization_id = selected.organization_id
          and selected.role in ('owner', 'admin', 'operator')
        )
        order by candidate.created_at desc, candidate.id desc
        limit 200
      ) as request
      join loyalty.organizations as counterpart
        on counterpart.id = case
          when request.client_organization_id = selected.organization_id
            then request.agency_organization_id
          else request.client_organization_id end
      left join loyalty.organization_memberships as requester
        on requester.organization_id = request.agency_organization_id
       and requester.user_id = request.support_user_id
      left join loyalty.support_access_grants as access_grant
        on access_grant.request_id = request.id
       and access_grant.grant_version = '1'
    ), '[]'::jsonb),
    'grants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', access_grant.public_id,
        'perspective', case
          when access_grant.organization_id = selected.organization_id
            then 'client' else 'agency' end,
        'counterpartName', case
          when access_grant.organization_id = selected.organization_id
            then agency.name else client.name end,
        'supportLabel', requester.display_label,
        'scopes', access_grant.scopes,
        'reason', access_grant.reason,
        'status', case
          when access_grant.revoked_at is not null then 'revoked'
          when access_grant.expires_at <= statement_timestamp() then 'expired'
          when access_grant.starts_at > statement_timestamp() then 'scheduled'
          else 'active' end,
        'revision', access_grant.lifecycle_revision,
        'startsAt', access_grant.starts_at,
        'expiresAt', access_grant.expires_at,
        'revokedAt', access_grant.revoked_at,
        'useCount', (select count(*) from loyalty.support_access_use_events as use
          where use.grant_id = access_grant.id),
        'lastUsedAt', (select max(use.created_at) from loyalty.support_access_use_events as use
          where use.grant_id = access_grant.id)
      ) order by access_grant.created_at desc, access_grant.id desc)
      from (
        select candidate.*
        from loyalty.support_access_grants as candidate
        join loyalty.organization_support_access_requests as request
          on request.id = candidate.request_id
        where candidate.grant_version = '1' and (
          (candidate.organization_id = selected.organization_id
            and selected.role in ('owner', 'admin', 'auditor'))
          or (request.agency_organization_id = selected.organization_id
            and selected.role in ('owner', 'admin', 'operator'))
        )
        order by candidate.created_at desc, candidate.id desc
        limit 200
      ) as access_grant
      join loyalty.organization_support_access_requests as request
        on request.id = access_grant.request_id
      join loyalty.organizations as agency
        on agency.id = request.agency_organization_id
      join loyalty.organizations as client
        on client.id = request.client_organization_id
      left join loyalty.organization_memberships as requester
        on requester.organization_id = request.agency_organization_id
       and requester.user_id = access_grant.support_user_id
    ), '[]'::jsonb),
    'recentUses', case
      when selected.role in ('owner', 'admin', 'auditor') then coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', use.public_id,
          'grantId', access_grant.public_id,
          'scopes', use.scopes,
          'surface', use.surface,
          'createdAt', use.created_at
        ) order by use.created_at desc, use.id desc)
        from (
          select candidate.*
          from loyalty.support_access_use_events as candidate
          where candidate.client_organization_id = selected.organization_id
          order by candidate.created_at desc, candidate.id desc
          limit 100
        ) as use
        join loyalty.support_access_grants as access_grant
          on access_grant.id = use.grant_id
      ), '[]'::jsonb)
      else '[]'::jsonb end
  );
end;
$$;

create or replace function loyalty.get_support_workspace_v1(
  target_grant_public_id uuid
)
returns table (workspace jsonb)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  request_actor uuid := loyalty_private.request_user_id();
  request_session uuid := loyalty_private.request_session_id_v1();
  grant_row loyalty.support_access_grants%rowtype;
  support_request loyalty.organization_support_access_requests%rowtype;
  relationship_row loyalty.organization_agency_relationships%rowtype;
  client_row loyalty.organizations%rowtype;
  use_row loyalty.support_access_use_events%rowtype;
  access_time timestamptz := statement_timestamp();
begin
  if target_grant_public_id is null or request_actor is null
     or request_session is null
     or not loyalty_private.request_has_live_auth_session_v1() then
    return;
  end if;
  select access_grant.* into grant_row
  from loyalty.support_access_grants as access_grant
  where access_grant.public_id = target_grant_public_id
    and access_grant.grant_version = '1'
  for update;
  if grant_row.id is null then return; end if;
  select request.* into support_request
  from loyalty.organization_support_access_requests as request
  where request.id = grant_row.request_id;
  select relationship.* into relationship_row
  from loyalty.organization_agency_relationships as relationship
  where relationship.id = grant_row.relationship_id;
  select organization.* into client_row
  from loyalty.organizations as organization
  where organization.id = grant_row.organization_id;

  if grant_row.support_user_id <> request_actor
     or grant_row.revoked_at is not null
     or grant_row.starts_at > access_time or grant_row.expires_at <= access_time
     or support_request.status <> 'approved'
     or relationship_row.status <> 'active'
     or client_row.status <> 'active' or client_row.offboarded_at is not null
     or not exists (
       select 1 from loyalty.organization_memberships as membership
       join loyalty.organizations as agency
         on agency.id = membership.organization_id
        and agency.status = 'active' and agency.offboarded_at is null
       where membership.organization_id = support_request.agency_organization_id
         and membership.user_id = request_actor
         and membership.role in ('owner', 'admin', 'operator')
         and membership.revoked_at is null
     )
     or exists (
       select 1 from loyalty.organization_memberships as membership
       where membership.organization_id = grant_row.organization_id
         and membership.user_id = request_actor
         and membership.revoked_at is null
     ) then
    return;
  end if;

  insert into loyalty.support_access_use_events (
    client_organization_id, agency_organization_id, grant_id,
    support_user_id, auth_session_id, scopes, surface, created_at
  ) values (
    grant_row.organization_id, support_request.agency_organization_id,
    grant_row.id, request_actor, request_session, grant_row.scopes,
    'support_workspace', access_time
  ) returning * into use_row;

  return query
  select jsonb_build_object(
    'schemaVersion', '1',
    'grant', jsonb_build_object(
      'id', grant_row.public_id,
      'scopes', grant_row.scopes,
      'expiresAt', grant_row.expires_at
    ),
    'organization', jsonb_build_object(
      'id', client_row.public_id,
      'name', client_row.name,
      'status', client_row.status,
      'workspaceCount', case when 'organization.summary.read' = any(grant_row.scopes)
        then (select count(*) from loyalty.workspaces as item
          where item.organization_id = client_row.id) else null end,
      'programmeGroupCount', case when 'organization.summary.read' = any(grant_row.scopes)
        then (select count(*) from loyalty.programme_groups as item
          where item.organization_id = client_row.id) else null end
    ),
    'members', case when 'members.summary.read' = any(grant_row.scopes)
      then jsonb_build_object(
        'activeCount', (select count(*) from loyalty.organization_memberships as item
          where item.organization_id = client_row.id and item.revoked_at is null),
        'ownerCount', (select count(*) from loyalty.organization_memberships as item
          where item.organization_id = client_row.id and item.role = 'owner'
            and item.revoked_at is null)
      ) else null end,
    'identityHealth', case when 'identity.health.read' = any(grant_row.scopes)
      then jsonb_build_object(
        'enabledFederationSources', (
          select count(*) from loyalty.organization_federation_sources as source
          where source.organization_id = client_row.id and source.status = 'enabled'
        ),
        'activeScimEndpoints', (
          select count(*) from loyalty.organization_scim_endpoints as endpoint
          where endpoint.organization_id = client_row.id and endpoint.status = 'active'
        ),
        'activeMemberships', (
          select count(*) from loyalty.organization_memberships as item
          where item.organization_id = client_row.id and item.revoked_at is null
        )
      ) else null end,
    'recentAudit', case when 'audit.summary.read' = any(grant_row.scopes)
      then coalesce((
        select jsonb_agg(jsonb_build_object(
          'action', event.action,
          'resourceType', event.resource_type,
          'createdAt', event.created_at
        ) order by event.created_at desc, event.id desc)
        from (
          select audit.action, audit.resource_type, audit.created_at, audit.id
          from loyalty.admin_audit_events as audit
          where audit.organization_id = client_row.id
          order by audit.created_at desc, audit.id desc limit 25
        ) as event
      ), '[]'::jsonb) else null end,
    'use', jsonb_build_object(
      'id', use_row.public_id,
      'recordedAt', use_row.created_at
    )
  );
end;
$$;

alter table loyalty.organizations
  add column pseudonymized_at timestamptz,
  add column deletion_completed_at timestamptz,
  add constraint organizations_deletion_state_check check (
    (deletion_completed_at is null and pseudonymized_at is null)
    or (deletion_completed_at is not null and pseudonymized_at is not null
      and deletion_completed_at = pseudonymized_at
      and offboarded_at is not null and status = 'closed')
  );

create table loyalty.organization_break_glass_sessions (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null references loyalty.organizations(id) on delete restrict,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  auth_session_id uuid not null,
  reason text not null,
  lifecycle_revision bigint not null default 1 check (lifecycle_revision >= 1),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check (
    reason = btrim(reason) and length(reason) between 8 and 500
    and reason !~ '[[:cntrl:]]'
  ),
  check (expires_at > created_at and expires_at <= created_at + interval '30 minutes'),
  check (revoked_at is null or revoked_at >= created_at),
  check (updated_at >= created_at)
);

create index organization_break_glass_subject_idx
  on loyalty.organization_break_glass_sessions (
    organization_id, owner_user_id, expires_at desc, id desc
  ) where revoked_at is null;

create table loyalty.organization_break_glass_use_events (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null references loyalty.organizations(id) on delete restrict,
  break_glass_session_id bigint not null,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  auth_session_id uuid not null,
  surface text not null check (surface in ('organization_export', 'deletion_command')),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, break_glass_session_id)
    references loyalty.organization_break_glass_sessions(organization_id, id)
    on delete restrict
);

create index organization_break_glass_use_history_idx
  on loyalty.organization_break_glass_use_events (
    organization_id, created_at desc, id desc
  );

create table loyalty.organization_deletion_cases (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null references loyalty.organizations(id) on delete restrict,
  status text not null default 'cooling'
    check (status in ('cooling', 'cancelled', 'completed')),
  lifecycle_revision bigint not null default 1 check (lifecycle_revision >= 1),
  reason text not null,
  requested_by_user_id uuid not null references auth.users(id) on delete restrict,
  resolved_by_user_id uuid references auth.users(id) on delete restrict,
  due_at timestamptz not null,
  cancelled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check (
    reason = btrim(reason) and length(reason) between 8 and 500
    and reason !~ '[[:cntrl:]]'
  ),
  check (due_at = created_at + interval '7 days'),
  check (updated_at >= created_at),
  check (
    (status = 'cooling' and resolved_by_user_id is null
      and cancelled_at is null and completed_at is null)
    or (status = 'cancelled' and resolved_by_user_id is not null
      and cancelled_at is not null and completed_at is null)
    or (status = 'completed' and resolved_by_user_id is not null
      and cancelled_at is null and completed_at is not null)
  )
);

create unique index organization_deletion_one_cooling_uidx
  on loyalty.organization_deletion_cases (organization_id)
  where status = 'cooling';
create index organization_deletion_history_idx
  on loyalty.organization_deletion_cases (organization_id, created_at desc, id desc);

create table loyalty.organization_deletion_events (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null references loyalty.organizations(id) on delete restrict,
  deletion_case_id bigint not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in (
    'organization.deletion.request', 'organization.deletion.cancel',
    'organization.deletion.complete'
  )),
  outcome text not null check (outcome in ('cooling', 'cancelled', 'completed')),
  idempotency_key text not null,
  request_sha256 bytea not null check (octet_length(request_sha256) = 32),
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, deletion_case_id)
    references loyalty.organization_deletion_cases(organization_id, id)
    on delete restrict,
  check (length(idempotency_key) between 1 and 255)
);

alter table loyalty.organization_break_glass_sessions owner to loyalty_owner;
alter table loyalty.organization_break_glass_use_events owner to loyalty_owner;
alter table loyalty.organization_deletion_cases owner to loyalty_owner;
alter table loyalty.organization_deletion_events owner to loyalty_owner;
alter table loyalty.organization_break_glass_sessions enable row level security;
alter table loyalty.organization_break_glass_use_events enable row level security;
alter table loyalty.organization_deletion_cases enable row level security;
alter table loyalty.organization_deletion_events enable row level security;
revoke all on loyalty.organization_break_glass_sessions,
  loyalty.organization_break_glass_use_events,
  loyalty.organization_deletion_cases,
  loyalty.organization_deletion_events
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

create trigger organization_break_glass_use_events_immutable
before update or delete on loyalty.organization_break_glass_use_events
for each row execute function loyalty_private.reject_immutable_change();
create trigger organization_deletion_events_immutable
before update or delete on loyalty.organization_deletion_events
for each row execute function loyalty_private.reject_immutable_change();

create or replace function loyalty_private.guard_organization_break_glass_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('loyalty.break_glass_command', true) is distinct from 'on' then
    raise exception using errcode = '55000',
      message = 'break-glass session mutations require an exact command';
  end if;
  if tg_op = 'DELETE'
     or new.organization_id <> old.organization_id
     or new.public_id <> old.public_id
     or new.owner_user_id <> old.owner_user_id
     or new.auth_session_id <> old.auth_session_id
     or new.reason <> old.reason
     or new.expires_at <> old.expires_at
     or new.created_at <> old.created_at
     or new.lifecycle_revision <> old.lifecycle_revision + 1
     or old.revoked_at is not null then
    raise exception using errcode = '55000',
      message = 'break-glass session authority is immutable';
  end if;
  return new;
end;
$$;

create or replace function loyalty_private.guard_organization_deletion_case_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('loyalty.deletion_command', true) is distinct from 'on' then
    raise exception using errcode = '55000',
      message = 'organization deletion mutations require an exact command';
  end if;
  if tg_op = 'DELETE'
     or new.organization_id <> old.organization_id
     or new.public_id <> old.public_id
     or new.reason <> old.reason
     or new.requested_by_user_id <> old.requested_by_user_id
     or new.due_at <> old.due_at
     or new.created_at <> old.created_at
     or new.lifecycle_revision <> old.lifecycle_revision + 1
     or old.status <> 'cooling' then
    raise exception using errcode = '55000',
      message = 'organization deletion evidence is immutable';
  end if;
  return new;
end;
$$;

alter function loyalty_private.guard_organization_break_glass_v1() owner to loyalty_owner;
alter function loyalty_private.guard_organization_deletion_case_v1() owner to loyalty_owner;
revoke all on function loyalty_private.guard_organization_break_glass_v1()
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function loyalty_private.guard_organization_deletion_case_v1()
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
create trigger organization_break_glass_sessions_guarded
before update or delete on loyalty.organization_break_glass_sessions
for each row execute function loyalty_private.guard_organization_break_glass_v1();
create trigger organization_deletion_cases_guarded
before update or delete on loyalty.organization_deletion_cases
for each row execute function loyalty_private.guard_organization_deletion_case_v1();

create or replace function loyalty.start_organization_break_glass_command_v1(
  target_organization_public_id uuid,
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
  request_actor uuid := loyalty_private.request_user_id();
  request_session uuid := loyalty_private.request_session_id_v1();
  organization_row loyalty.organizations%rowtype;
  recovery_row loyalty.organization_break_glass_sessions%rowtype;
  existing_audit loyalty.admin_audit_events%rowtype;
  request_hash bytea;
  started_at timestamptz := statement_timestamp();
begin
  if request_actor is null or request_session is null
     or target_organization_public_id is null
     or target_reason is null or target_reason <> btrim(target_reason)
     or length(target_reason) not between 8 and 500
     or target_reason ~ '[[:cntrl:]]'
     or target_idempotency_key is null
     or target_idempotency_key <> btrim(target_idempotency_key)
     or length(target_idempotency_key) not between 1 and 255
     or target_correlation_id is null
     or loyalty_private.request_aal_v1() <> 'aal2'
     or not loyalty_private.request_has_live_auth_session_v1() then
    raise exception using errcode = '42501', message = 'break-glass access not authorized';
  end if;
  select organization.* into organization_row
  from loyalty.organizations as organization
  where organization.public_id = target_organization_public_id
  for update;
  if organization_row.id is null or organization_row.deletion_completed_at is not null
     or not exists (
       select 1 from loyalty.organization_memberships as membership
       where membership.organization_id = organization_row.id
         and membership.user_id = request_actor
         and membership.role = 'owner' and membership.revoked_at is null
     ) then
    raise exception using errcode = '42501', message = 'break-glass access not authorized';
  end if;

  request_hash := extensions.digest(convert_to(jsonb_build_object(
    'organizationId', target_organization_public_id,
    'sessionId', request_session,
    'reason', target_reason
  )::text, 'UTF8'), 'sha256');
  select audit.* into existing_audit
  from loyalty.admin_audit_events as audit
  where audit.organization_id = organization_row.id
    and audit.idempotency_key = target_idempotency_key;
  if existing_audit.id is not null then
    if existing_audit.action <> 'organization.break_glass.start'
       or existing_audit.request_sha256 <> request_hash
       or existing_audit.actor_user_id <> request_actor
       or existing_audit.correlation_id <> target_correlation_id then
      raise exception using errcode = '23514', message = 'break-glass idempotency conflict';
    end if;
    select session.* into recovery_row
    from loyalty.organization_break_glass_sessions as session
    where session.public_id = existing_audit.resource_public_id;
    return query select recovery_row.public_id, 'duplicate'::text,
      recovery_row.lifecycle_revision, case
        when recovery_row.revoked_at is not null then 'revoked'
        when recovery_row.expires_at <= statement_timestamp() then 'expired'
        else 'active' end;
    return;
  end if;

  insert into loyalty.organization_break_glass_sessions (
    organization_id, owner_user_id, auth_session_id, reason,
    expires_at, created_at, updated_at
  ) values (
    organization_row.id, request_actor, request_session, target_reason,
    started_at + interval '30 minutes', started_at, started_at
  ) returning * into recovery_row;
  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256,
    correlation_id, metadata, created_at
  ) values (
    organization_row.id, request_actor, 'organization.break_glass.start',
    'organization_break_glass_session', recovery_row.public_id,
    target_idempotency_key, request_hash, target_correlation_id,
    jsonb_build_object('reason', target_reason, 'expiresAt', recovery_row.expires_at),
    started_at
  );
  return query select recovery_row.public_id, 'created'::text,
    recovery_row.lifecycle_revision, 'active'::text;
end;
$$;

create or replace function loyalty_private.authorize_organization_break_glass_v1(
  target_organization_id bigint,
  target_session_public_id uuid,
  target_surface text
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  request_actor uuid := loyalty_private.request_user_id();
  request_session uuid := loyalty_private.request_session_id_v1();
  recovery_row loyalty.organization_break_glass_sessions%rowtype;
begin
  if target_organization_id is null or target_session_public_id is null
     or target_surface not in ('organization_export', 'deletion_command')
     or request_actor is null or request_session is null
     or loyalty_private.request_aal_v1() <> 'aal2'
     or not loyalty_private.request_has_live_auth_session_v1() then
    raise exception using errcode = '42501', message = 'break-glass use not authorized';
  end if;
  select session.* into recovery_row
  from loyalty.organization_break_glass_sessions as session
  where session.organization_id = target_organization_id
    and session.public_id = target_session_public_id
  for update;
  if recovery_row.id is null
     or recovery_row.owner_user_id <> request_actor
     or recovery_row.auth_session_id <> request_session
     or recovery_row.revoked_at is not null
     or recovery_row.expires_at <= statement_timestamp()
     or not exists (
       select 1 from loyalty.organization_memberships as membership
       where membership.organization_id = target_organization_id
         and membership.user_id = request_actor
         and membership.role = 'owner' and membership.revoked_at is null
     ) then
    raise exception using errcode = '42501', message = 'break-glass use not authorized';
  end if;
  insert into loyalty.organization_break_glass_use_events (
    organization_id, break_glass_session_id, owner_user_id,
    auth_session_id, surface
  ) values (
    target_organization_id, recovery_row.id, request_actor,
    request_session, target_surface
  );
  return recovery_row.id;
end;
$$;

alter function loyalty_private.authorize_organization_break_glass_v1(bigint, uuid, text)
  owner to loyalty_owner;
revoke all on function loyalty_private.authorize_organization_break_glass_v1(bigint, uuid, text)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

create or replace function loyalty_private.organization_administration_export_v1(
  target_organization_id bigint,
  target_generated_at timestamptz
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'schemaVersion', '1',
    'generatedAt', target_generated_at,
    'organization', jsonb_build_object(
      'id', organization.public_id,
      'name', organization.name,
      'slug', organization.slug,
      'status', organization.status,
      'lifecycleRevision', organization.lifecycle_revision,
      'offboardedAt', organization.offboarded_at
    ),
    'resources', jsonb_build_object(
      'workspaces', (select count(*) from loyalty.workspaces as item
        where item.organization_id = organization.id),
      'programmeGroups', (select count(*) from loyalty.programme_groups as item
        where item.organization_id = organization.id),
      'programmes', (select count(*) from loyalty.programmes as item
        where item.organization_id = organization.id),
      'customers', (select count(*) from loyalty.customers as item
        where item.organization_id = organization.id),
      'wallets', (select count(*) from loyalty.wallets as item
        where item.organization_id = organization.id),
      'memberships', (select count(*) from loyalty.organization_memberships as item
        where item.organization_id = organization.id),
      'auditEvents', (select count(*) from loyalty.admin_audit_events as item
        where item.organization_id = organization.id)
    ),
    'credentials', jsonb_build_object(
      'activeCommerceConnections', (
        select count(*) from loyalty.commerce_connections as item
        where item.organization_id = organization.id and item.status = 'active'
      ),
      'activeServiceAccounts', (
        select count(distinct credential.service_account_id)
        from loyalty_private.service_account_credentials as credential
        where credential.organization_id = organization.id
          and (
            credential.status = 'active'
            or (credential.status = 'retiring'
              and credential.valid_until > target_generated_at)
          )
      ),
      'enabledFederationSources', (
        select count(*) from loyalty.organization_federation_sources as item
        where item.organization_id = organization.id and item.status = 'enabled'
      ),
      'activeScimEndpoints', (
        select count(*) from loyalty.organization_scim_endpoints as item
        where item.organization_id = organization.id and item.status = 'active'
      ),
      'activeSupportGrants', (
        select count(*) from loyalty.support_access_grants as item
        where item.organization_id = organization.id
          and item.grant_version = '1' and item.revoked_at is null
          and item.starts_at <= target_generated_at
          and item.expires_at > target_generated_at
      ),
      'activeNotificationEndpoints', (
        (select count(*) from loyalty_private.notification_klaviyo_connections as item
          where item.organization_id = organization.id and item.state = 'active')
        +
        (select count(*) from loyalty_private.notification_webhook_endpoints as item
          where item.organization_id = organization.id and item.state = 'active')
      )
    ),
    'ledger', jsonb_build_object(
      'transactions', (select count(*) from loyalty.ledger_transactions as item
        where item.organization_id = organization.id),
      'entries', (select count(*) from loyalty.ledger_entries as item
        where item.organization_id = organization.id),
      'netAmount', (select coalesce(sum(item.points), 0)::text
        from loyalty.ledger_entries as item
        where item.organization_id = organization.id),
      'balanced', (select coalesce(sum(item.points), 0) = 0
        from loyalty.ledger_entries as item
        where item.organization_id = organization.id)
    ),
    'immutableEvidenceRetained', true
  )
  from loyalty.organizations as organization
  where organization.id = target_organization_id;
$$;

alter function loyalty_private.organization_administration_export_v1(bigint, timestamptz)
  owner to loyalty_owner;
revoke all on function loyalty_private.organization_administration_export_v1(bigint, timestamptz)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

create or replace function loyalty.get_organization_recovery_workspace_v1(
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
  request_actor uuid := loyalty_private.request_user_id();
  selected record;
begin
  if target_organization_public_id is null then
    raise exception using errcode = '22023', message = 'invalid recovery workspace request';
  end if;
  select organization.id as organization_id,
    organization.public_id as organization_public_id,
    organization.name as organization_name,
    organization.status,
    organization.lifecycle_revision,
    organization.offboarded_at,
    organization.deletion_completed_at,
    membership.role
  into selected
  from loyalty.organizations as organization
  join loyalty.organization_memberships as membership
    on membership.organization_id = organization.id
   and membership.user_id = request_actor
   and membership.revoked_at is null
  where organization.public_id = target_organization_public_id
    and membership.role in ('owner', 'admin', 'auditor');
  if not found then return; end if;

  return query
  select jsonb_build_object(
    'schemaVersion', '1',
    'organization', jsonb_build_object(
      'id', selected.organization_public_id,
      'name', selected.organization_name,
      'status', selected.status,
      'lifecycleRevision', selected.lifecycle_revision,
      'offboardedAt', selected.offboarded_at,
      'deletionCompletedAt', selected.deletion_completed_at
    ),
    'assuranceLevel', case when loyalty_private.request_aal_v1() = 'aal2'
      then 'aal2' else 'aal1' end,
    'hasLiveAuthSession', loyalty_private.request_has_live_auth_session_v1(),
    'mayStartBreakGlass', selected.role = 'owner'
      and selected.deletion_completed_at is null
      and loyalty_private.request_aal_v1() = 'aal2'
      and loyalty_private.request_has_live_auth_session_v1(),
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', session.public_id,
        'reason', session.reason,
        'status', case
          when session.revoked_at is not null then 'revoked'
          when session.expires_at <= statement_timestamp() then 'expired'
          else 'active' end,
        'createdAt', session.created_at,
        'expiresAt', session.expires_at,
        'revokedAt', session.revoked_at,
        'useCount', (select count(*)
          from loyalty.organization_break_glass_use_events as use
          where use.break_glass_session_id = session.id),
        'lastUsedAt', (select max(use.created_at)
          from loyalty.organization_break_glass_use_events as use
          where use.break_glass_session_id = session.id)
      ) order by session.created_at desc, session.id desc)
      from (
        select candidate.*
        from loyalty.organization_break_glass_sessions as candidate
        where candidate.organization_id = selected.organization_id
        order by candidate.created_at desc, candidate.id desc
        limit 50
      ) as session
    ), '[]'::jsonb),
    'deletionCase', (
      select jsonb_build_object(
        'id', deletion.public_id,
        'status', deletion.status,
        'revision', deletion.lifecycle_revision,
        'completionAvailable', deletion.status = 'cooling'
          and deletion.due_at <= statement_timestamp(),
        'dueAt', deletion.due_at,
        'createdAt', deletion.created_at,
        'cancelledAt', deletion.cancelled_at,
        'completedAt', deletion.completed_at
      )
      from loyalty.organization_deletion_cases as deletion
      where deletion.organization_id = selected.organization_id
      order by deletion.created_at desc, deletion.id desc
      limit 1
    )
  );
end;
$$;

create or replace function loyalty.get_organization_administration_export_v1(
  target_organization_public_id uuid,
  target_break_glass_session_public_id uuid
)
returns table (document jsonb)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  organization_row loyalty.organizations%rowtype;
  generated_at timestamptz := statement_timestamp();
begin
  if target_organization_public_id is null
     or target_break_glass_session_public_id is null then
    raise exception using errcode = '22023', message = 'invalid organization export request';
  end if;
  select organization.* into organization_row
  from loyalty.organizations as organization
  where organization.public_id = target_organization_public_id;
  if organization_row.id is null or organization_row.deletion_completed_at is not null then
    raise exception using errcode = '42501', message = 'organization export not authorized';
  end if;
  perform loyalty_private.authorize_organization_break_glass_v1(
    organization_row.id, target_break_glass_session_public_id,
    'organization_export'
  );
  return query select loyalty_private.organization_administration_export_v1(
    organization_row.id, generated_at
  );
end;
$$;

create table loyalty_private.organization_offboarding_receipts (
  organization_id bigint primary key references loyalty.organizations(id) on delete restrict,
  organization_public_id uuid not null unique,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  revoked_counts jsonb not null check (jsonb_typeof(revoked_counts) = 'object'),
  created_at timestamptz not null default now()
);

alter table loyalty_private.organization_offboarding_receipts owner to loyalty_owner;
alter table loyalty_private.organization_offboarding_receipts enable row level security;
revoke all on loyalty_private.organization_offboarding_receipts
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
create trigger organization_offboarding_receipts_immutable
before update or delete on loyalty_private.organization_offboarding_receipts
for each row execute function loyalty_private.reject_immutable_change();

create or replace function loyalty_private.offboard_organization_credentials_v1(
  target_organization_id bigint,
  target_actor_user_id uuid,
  target_changed_at timestamptz,
  target_reason text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  organization_row loyalty.organizations%rowtype;
  scim_endpoint loyalty.organization_scim_endpoints%rowtype;
  counts jsonb := '{}'::jsonb;
  changed_count integer;
  request_hash bytea;
begin
  select organization.* into organization_row
  from loyalty.organizations as organization
  where organization.id = target_organization_id;
  if organization_row.id is null or target_actor_user_id is null
     or target_changed_at is null or target_reason is null then
    raise exception using errcode = '22023', message = 'invalid organization offboarding cleanup';
  end if;

  perform set_config('loyalty.agency_command', 'on', true);
  perform set_config('loyalty.support_command', 'on', true);
  perform set_config('loyalty.break_glass_command', 'on', true);
  perform set_config('loyalty.federation_command', 'on', true);

  update loyalty.organization_agency_relationships as relationship
  set status = 'revoked',
    lifecycle_revision = relationship.lifecycle_revision + 1,
    revoked_by_user_id = target_actor_user_id,
    revoked_by_organization_id = target_organization_id,
    revocation_reason = target_reason,
    revoked_at = target_changed_at,
    updated_at = target_changed_at
  where relationship.status = 'active'
    and target_organization_id in (
      relationship.client_organization_id,
      relationship.agency_organization_id
    );
  get diagnostics changed_count = row_count;
  counts := counts || jsonb_build_object('agencyRelationships', changed_count);

  update loyalty.organization_agency_invitations as invitation
  set status = 'revoked', revoked_at = target_changed_at,
    updated_at = target_changed_at
  where invitation.client_organization_id = target_organization_id
    and invitation.status = 'pending';
  get diagnostics changed_count = row_count;
  counts := counts || jsonb_build_object('agencyInvitations', changed_count);

  update loyalty.support_access_grants as access_grant
  set revoked_at = target_changed_at,
    revoked_by_user_id = target_actor_user_id,
    revocation_reason = target_reason,
    lifecycle_revision = access_grant.lifecycle_revision + 1,
    updated_at = target_changed_at
  where access_grant.organization_id = target_organization_id
    and access_grant.revoked_at is null;
  get diagnostics changed_count = row_count;
  counts := counts || jsonb_build_object('supportGrants', changed_count);

  update loyalty.organization_support_access_requests as request
  set status = 'revoked', decision_reason = target_reason,
    resolved_by_user_id = target_actor_user_id,
    resolved_at = target_changed_at,
    lifecycle_revision = request.lifecycle_revision + 1,
    updated_at = target_changed_at
  where request.status in ('pending', 'approved')
    and target_organization_id in (
      request.client_organization_id, request.agency_organization_id
    );
  get diagnostics changed_count = row_count;
  counts := counts || jsonb_build_object('supportRequests', changed_count);

  update loyalty.organization_break_glass_sessions as recovery
  set revoked_at = target_changed_at,
    lifecycle_revision = recovery.lifecycle_revision + 1,
    updated_at = target_changed_at
  where recovery.organization_id = target_organization_id
    and recovery.revoked_at is null;
  get diagnostics changed_count = row_count;
  counts := counts || jsonb_build_object('breakGlassSessions', changed_count);

  update loyalty_private.service_account_credentials as credential
  set status = 'revoked',
    valid_until = case when credential.valid_until is null
      then target_changed_at else least(credential.valid_until, target_changed_at) end,
    revoked_at = target_changed_at
  where credential.organization_id = target_organization_id
    and credential.status <> 'revoked';
  get diagnostics changed_count = row_count;
  counts := counts || jsonb_build_object('serviceCredentials', changed_count);

  update loyalty.commerce_connections as connection
  set status = 'disabled', updated_at = target_changed_at
  where connection.organization_id = target_organization_id
    and connection.status <> 'disabled';
  get diagnostics changed_count = row_count;
  counts := counts || jsonb_build_object('commerceConnections', changed_count);

  update loyalty.organization_federation_sources as source
  set status = case when source.status = 'retired' then 'retired' else 'disabled' end,
    pending_action = null, pending_actor_user_id = null,
    pending_correlation_id = null, pending_upstream_secret_sha256 = null,
    external_outcome = case when source.status in ('enabled', 'review_required')
      or source.pending_action is not null then 'ambiguous' else source.external_outcome end,
    external_detail_code = case when source.status in ('enabled', 'review_required')
      or source.pending_action is not null then 'offboarded_external_disable_required'
      else source.external_detail_code end,
    lifecycle_revision = source.lifecycle_revision + 1,
    updated_by_user_id = target_actor_user_id,
    updated_at = target_changed_at
  where source.organization_id = target_organization_id
    and source.status <> 'retired';
  get diagnostics changed_count = row_count;
  counts := counts || jsonb_build_object('federationSources', changed_count);

  for scim_endpoint in
    select endpoint.*
    from loyalty.organization_scim_endpoints as endpoint
    where endpoint.organization_id = target_organization_id
      and endpoint.status = 'active'
    order by endpoint.id
    for update
  loop
    update loyalty.organization_scim_endpoints as endpoint
    set status = 'revoked',
      lifecycle_revision = endpoint.lifecycle_revision + 1,
      revoked_by_user_id = target_actor_user_id,
      revoked_at = target_changed_at,
      updated_at = target_changed_at
    where endpoint.id = scim_endpoint.id
    returning * into scim_endpoint;
    request_hash := extensions.digest(convert_to(
      scim_endpoint.public_id::text || ':organization-offboard', 'UTF8'
    ), 'sha256');
    insert into loyalty.organization_scim_credential_revisions (
      organization_id, endpoint_id, revision, action, credential_sha256,
      actor_user_id, reason, idempotency_key, request_sha256,
      correlation_id, created_at
    ) values (
      target_organization_id, scim_endpoint.id,
      scim_endpoint.lifecycle_revision, 'revoke',
      scim_endpoint.credential_sha256, target_actor_user_id, target_reason,
      'offboard:scim:' || scim_endpoint.public_id::text,
      request_hash, gen_random_uuid(), target_changed_at
    );
  end loop;
  get diagnostics changed_count = row_count;
  select count(*)::integer into changed_count
  from loyalty.organization_scim_endpoints as endpoint
  where endpoint.organization_id = target_organization_id
    and endpoint.status = 'revoked' and endpoint.revoked_at = target_changed_at;
  counts := counts || jsonb_build_object('scimEndpoints', changed_count);

  update loyalty.organization_scim_users as scim_user
  set active = false,
    lifecycle_revision = scim_user.lifecycle_revision + 1,
    updated_at = target_changed_at,
    deleted_at = coalesce(scim_user.deleted_at, target_changed_at)
  where scim_user.organization_id = target_organization_id
    and (scim_user.active or scim_user.deleted_at is null);

  update loyalty_private.notification_klaviyo_connections as connection
  set state = 'disabled', updated_at = target_changed_at
  where connection.organization_id = target_organization_id
    and connection.state = 'active';
  get diagnostics changed_count = row_count;
  counts := counts || jsonb_build_object('klaviyoConnections', changed_count);

  update loyalty_private.notification_webhook_endpoints as endpoint
  set state = 'retired', retired_at = target_changed_at,
    previous_secret_sha256 = null, previous_secret_expires_at = null,
    previous_secret_hint = null,
    updated_by_user_id = target_actor_user_id,
    last_change_reason = 'Organization offboarded',
    updated_at = target_changed_at
  where endpoint.organization_id = target_organization_id
    and endpoint.state <> 'retired';
  get diagnostics changed_count = row_count;
  counts := counts || jsonb_build_object('webhookEndpoints', changed_count);

  update loyalty.analytics_report_schedules as schedule
  set state = 'paused', next_run_at = null, updated_at = target_changed_at
  where schedule.organization_id = target_organization_id
    and schedule.state = 'active';
  get diagnostics changed_count = row_count;
  counts := counts || jsonb_build_object('reportSchedules', changed_count);

  update loyalty.analytics_export_requests as export
  set state = 'failed', failure_code = 'organization_offboarded',
    next_attempt_at = null, lease_owner = null, lease_expires_at = null,
    updated_at = target_changed_at
  where export.organization_id = target_organization_id
    and export.state in ('pending', 'processing', 'retry');
  update loyalty.analytics_export_requests as export
  set state = 'expired', updated_at = target_changed_at
  where export.organization_id = target_organization_id
    and export.state = 'ready';
  update loyalty_private.analytics_export_authorizations as export_authorization
  set used_at = coalesce(export_authorization.used_at, target_changed_at)
  where export_authorization.request_id in (
    select export.id from loyalty.analytics_export_requests as export
    where export.organization_id = target_organization_id
  ) and export_authorization.used_at is null;
  delete from loyalty_private.analytics_export_payloads as payload
  using loyalty.analytics_export_requests as export
  where payload.request_id = export.id
    and export.organization_id = target_organization_id;

  insert into loyalty_private.organization_offboarding_receipts (
    organization_id, organization_public_id, actor_user_id,
    revoked_counts, created_at
  ) values (
    target_organization_id, organization_row.public_id,
    target_actor_user_id, counts, target_changed_at
  ) on conflict (organization_id) do nothing;

  request_hash := extensions.digest(convert_to(
    organization_row.public_id::text || ':credential-offboard', 'UTF8'
  ), 'sha256');
  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256,
    correlation_id, metadata, created_at
  ) values (
    target_organization_id, target_actor_user_id,
    'organization.offboard.credentials', 'organization',
    organization_row.public_id,
    'system:offboard:credentials:' || organization_row.public_id::text,
    request_hash, gen_random_uuid(), counts, target_changed_at
  ) on conflict (organization_id, idempotency_key) do nothing;
end;
$$;

alter function loyalty_private.offboard_organization_credentials_v1(bigint, uuid, timestamptz, text)
  owner to loyalty_owner;
revoke all on function loyalty_private.offboard_organization_credentials_v1(bigint, uuid, timestamptz, text)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

create or replace function loyalty_private.on_organization_offboard_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.offboarded_at is null and new.offboarded_at is not null then
    perform loyalty_private.offboard_organization_credentials_v1(
      new.id, loyalty_private.request_user_id(), new.offboarded_at,
      'Organization offboarded by owner.'
    );
  end if;
  return new;
end;
$$;

alter function loyalty_private.on_organization_offboard_v1() owner to loyalty_owner;
revoke all on function loyalty_private.on_organization_offboard_v1()
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
create trigger organizations_terminal_offboard_cleanup
after update of offboarded_at on loyalty.organizations
for each row execute function loyalty_private.on_organization_offboard_v1();

-- Terminal deletion may replace only mutable display labels. Capability,
-- subject, role, tenant, and lifecycle evidence remains immutable.
create or replace function loyalty_private.guard_organization_invitation_change_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('loyalty.identity_command', true) is distinct from 'on' then
    raise exception using errcode = '55000',
      message = 'organization invitation mutations require a lifecycle command';
  end if;
  if tg_op = 'UPDATE'
     and current_setting('loyalty.deletion_command', true) = 'on'
     and new.display_label = 'Deleted invitation'
     and new.status <> 'pending'
     and new.organization_id = old.organization_id
     and new.public_id = old.public_id
     and new.token_sha256 = old.token_sha256
     and new.role = old.role
     and new.created_by_user_id = old.created_by_user_id
     and new.expires_at = old.expires_at
     and new.created_at = old.created_at then
    return new;
  end if;
  if tg_op = 'DELETE'
     or new.organization_id <> old.organization_id
     or new.token_sha256 <> old.token_sha256
     or new.display_label <> old.display_label
     or new.role <> old.role
     or new.created_by_user_id <> old.created_by_user_id
     or new.expires_at <> old.expires_at
     or new.created_at <> old.created_at then
    raise exception using errcode = '55000',
      message = 'organization invitation authority is immutable';
  end if;
  return new;
end;
$$;

create or replace function loyalty_private.guard_organization_agency_invitation_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('loyalty.agency_command', true) is distinct from 'on' then
    raise exception using errcode = '55000',
      message = 'agency invitation mutations require an exact command';
  end if;
  if tg_op = 'UPDATE'
     and current_setting('loyalty.deletion_command', true) = 'on'
     and new.agency_label = 'Deleted agency'
     and new.status <> 'pending'
     and new.client_organization_id = old.client_organization_id
     and new.public_id = old.public_id
     and new.token_sha256 = old.token_sha256
     and new.created_by_user_id = old.created_by_user_id
     and new.expires_at = old.expires_at
     and new.created_at = old.created_at then
    return new;
  end if;
  if tg_op = 'DELETE'
     or new.client_organization_id <> old.client_organization_id
     or new.public_id <> old.public_id
     or new.token_sha256 <> old.token_sha256
     or new.agency_label <> old.agency_label
     or new.created_by_user_id <> old.created_by_user_id
     or new.expires_at <> old.expires_at
     or new.created_at <> old.created_at then
    raise exception using errcode = '55000',
      message = 'agency invitation authority is immutable';
  end if;
  return new;
end;
$$;

create or replace function loyalty.organization_deletion_command_v1(
  target_organization_public_id uuid,
  target_break_glass_session_public_id uuid,
  target_case_public_id uuid,
  target_expected_revision bigint,
  target_action text,
  target_reason text,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (resource_public_id uuid, outcome text, revision bigint, status text)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '10s'
as $$
declare
  request_actor uuid := loyalty_private.request_user_id();
  organization_row loyalty.organizations%rowtype;
  deletion_row loyalty.organization_deletion_cases%rowtype;
  event_row loyalty.organization_deletion_events%rowtype;
  request_hash bytea;
  changed_at timestamptz := statement_timestamp();
begin
  if request_actor is null
     or target_organization_public_id is null
     or target_break_glass_session_public_id is null
     or target_expected_revision is null or target_expected_revision < 1
     or target_action not in ('request', 'cancel', 'complete')
     or ((target_action = 'request') <> (target_case_public_id is null))
     or target_reason is null or target_reason <> btrim(target_reason)
     or length(target_reason) not between 8 and 500
     or target_reason ~ '[[:cntrl:]]'
     or target_idempotency_key is null
     or target_idempotency_key <> btrim(target_idempotency_key)
     or length(target_idempotency_key) not between 1 and 255
     or target_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid organization deletion command';
  end if;
  select organization.* into organization_row
  from loyalty.organizations as organization
  where organization.public_id = target_organization_public_id;
  if organization_row.id is null then
    raise exception using errcode = '42501', message = 'organization deletion not authorized';
  end if;
  request_hash := extensions.digest(convert_to(jsonb_build_object(
    'organizationId', target_organization_public_id,
    'breakGlassSessionId', target_break_glass_session_public_id,
    'caseId', target_case_public_id,
    'expectedRevision', target_expected_revision,
    'action', target_action,
    'reason', target_reason
  )::text, 'UTF8'), 'sha256');
  select organization.* into organization_row
  from loyalty.organizations as organization
  where organization.id = organization_row.id for update;
  if organization_row.status <> 'closed'
     or organization_row.offboarded_at is null
     or organization_row.deletion_completed_at is not null then
    raise exception using errcode = '42501', message = 'organization deletion not authorized';
  end if;
  perform loyalty_private.authorize_organization_break_glass_v1(
    organization_row.id, target_break_glass_session_public_id,
    'deletion_command'
  );

  -- Serialize exact retries behind the organization lock and recheck the
  -- recovery capability before revealing a prior deletion result.
  select event.* into event_row
  from loyalty.organization_deletion_events as event
  where event.organization_id = organization_row.id
    and event.idempotency_key = target_idempotency_key;
  if event_row.id is not null then
    if event_row.action <> 'organization.deletion.' || target_action
       or event_row.request_sha256 <> request_hash
       or event_row.actor_user_id <> request_actor
       or event_row.correlation_id <> target_correlation_id then
      raise exception using errcode = '23514', message = 'organization deletion idempotency conflict';
    end if;
    select deletion.* into deletion_row
    from loyalty.organization_deletion_cases as deletion
    where deletion.id = event_row.deletion_case_id;
    return query select deletion_row.public_id, 'duplicate'::text,
      deletion_row.lifecycle_revision, deletion_row.status;
    return;
  end if;

  if target_action = 'request' then
    if organization_row.lifecycle_revision <> target_expected_revision then
      raise exception using errcode = '40001', message = 'organization deletion revision conflict';
    end if;
    perform set_config('loyalty.deletion_command', 'on', true);
    insert into loyalty.organization_deletion_cases (
      organization_id, reason, requested_by_user_id,
      due_at, created_at, updated_at
    ) values (
      organization_row.id, target_reason, request_actor,
      changed_at + interval '7 days', changed_at, changed_at
    ) returning * into deletion_row;
  else
    select deletion.* into deletion_row
    from loyalty.organization_deletion_cases as deletion
    where deletion.organization_id = organization_row.id
      and deletion.public_id = target_case_public_id
    for update;
    if deletion_row.id is null or deletion_row.status <> 'cooling'
       or deletion_row.lifecycle_revision <> target_expected_revision then
      raise exception using errcode = '40001', message = 'organization deletion revision conflict';
    end if;
    if target_action = 'complete' and changed_at < deletion_row.due_at then
      raise exception using errcode = '55000', message = 'organization deletion cooling period active';
    end if;
    perform set_config('loyalty.deletion_command', 'on', true);
    update loyalty.organization_deletion_cases as deletion
    set status = case when target_action = 'cancel' then 'cancelled' else 'completed' end,
      lifecycle_revision = deletion.lifecycle_revision + 1,
      resolved_by_user_id = request_actor,
      cancelled_at = case when target_action = 'cancel' then changed_at else null end,
      completed_at = case when target_action = 'complete' then changed_at else null end,
      updated_at = changed_at
    where deletion.id = deletion_row.id
    returning * into deletion_row;
  end if;

  insert into loyalty.organization_deletion_events (
    organization_id, deletion_case_id, actor_user_id, action, outcome,
    idempotency_key, request_sha256, correlation_id, created_at
  ) values (
    organization_row.id, deletion_row.id, request_actor,
    'organization.deletion.' || target_action, deletion_row.status,
    target_idempotency_key, request_hash, target_correlation_id, changed_at
  );

  if target_action = 'complete' then
    perform loyalty_private.offboard_organization_credentials_v1(
      organization_row.id, request_actor, changed_at, target_reason
    );
    perform set_config('loyalty.identity_command', 'on', true);
    perform set_config('loyalty.agency_command', 'on', true);
    perform set_config('loyalty.federation_command', 'on', true);
    perform set_config('loyalty.deletion_command', 'on', true);

    update loyalty.organization_invitations as invitation
    set display_label = 'Deleted invitation', updated_at = changed_at
    where invitation.organization_id = organization_row.id
      and invitation.status <> 'pending';
    update loyalty.organization_agency_invitations as invitation
    set agency_label = 'Deleted agency', updated_at = changed_at
    where invitation.client_organization_id = organization_row.id
      and invitation.status <> 'pending';
    update loyalty.organization_memberships as membership
    set display_label = null,
      revoked_at = coalesce(membership.revoked_at, changed_at),
      lifecycle_revision = membership.lifecycle_revision + 1,
      updated_at = changed_at
    where membership.organization_id = organization_row.id;
    update loyalty.organization_federation_sources as source
    set display_name = 'Deleted identity source',
      lifecycle_revision = source.lifecycle_revision + 1,
      updated_by_user_id = request_actor,
      updated_at = changed_at
    where source.organization_id = organization_row.id
      and source.status <> 'retired';
    update loyalty.organization_scim_users as scim_user
    set user_name = 'deleted-' || replace(scim_user.public_id::text, '-', '') || '@invalid',
      display_name = null, name_document = null, emails_document = '[]'::jsonb,
      active = false,
      lifecycle_revision = scim_user.lifecycle_revision + 1,
      representation_sha256 = extensions.digest(convert_to(
        'deleted:' || scim_user.public_id::text, 'UTF8'
      ), 'sha256'),
      updated_at = changed_at,
      deleted_at = coalesce(scim_user.deleted_at, changed_at)
    where scim_user.organization_id = organization_row.id;
    update loyalty.organization_scim_groups as scim_group
    set display_name = 'Deleted group ' || left(scim_group.public_id::text, 8),
      mapped_role = null, mapped_by_user_id = null, mapped_at = null,
      lifecycle_revision = scim_group.lifecycle_revision + 1,
      representation_sha256 = extensions.digest(convert_to(
        'deleted:' || scim_group.public_id::text, 'UTF8'
      ), 'sha256'),
      updated_at = changed_at,
      deleted_at = coalesce(scim_group.deleted_at, changed_at)
    where scim_group.organization_id = organization_row.id;
    update loyalty.organizations
    set slug = 'deleted-' || replace(organization_row.public_id::text, '-', ''),
      name = 'Deleted organization ' || left(organization_row.public_id::text, 8),
      pseudonymized_at = changed_at,
      deletion_completed_at = changed_at,
      lifecycle_revision = lifecycle_revision + 1,
      updated_at = changed_at
    where id = organization_row.id;
  end if;

  return query select deletion_row.public_id,
    case when target_action = 'request' then 'created' else 'updated' end,
    deletion_row.lifecycle_revision, deletion_row.status;
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'organization deletion conflicts with existing state';
end;
$$;

alter function loyalty.create_organization_agency_invitation_command_v1(
  uuid, text, timestamptz, text, text, uuid
) owner to loyalty_owner;
alter function loyalty.accept_organization_agency_invitation_command_v1(
  uuid, text, text, uuid
) owner to loyalty_owner;
alter function loyalty.revoke_organization_agency_relationship_command_v1(
  uuid, uuid, bigint, text, text, uuid
) owner to loyalty_owner;
alter function loyalty.get_organization_agency_portfolio_v1(uuid)
  owner to loyalty_owner;
alter function loyalty.create_support_access_request_command_v1(
  uuid, uuid, text[], text, timestamptz, text, uuid
) owner to loyalty_owner;
alter function loyalty.resolve_support_access_request_command_v1(
  uuid, uuid, bigint, text, text[], timestamptz, text, text, uuid
) owner to loyalty_owner;
alter function loyalty.revoke_support_access_grant_command_v1(
  uuid, uuid, bigint, text, text, uuid
) owner to loyalty_owner;
alter function loyalty.get_support_administration_workspace_v1(uuid)
  owner to loyalty_owner;
alter function loyalty.get_support_workspace_v1(uuid)
  owner to loyalty_owner;
alter function loyalty.start_organization_break_glass_command_v1(
  uuid, text, text, uuid
) owner to loyalty_owner;
alter function loyalty.get_organization_recovery_workspace_v1(uuid)
  owner to loyalty_owner;
alter function loyalty.get_organization_administration_export_v1(uuid, uuid)
  owner to loyalty_owner;
alter function loyalty.organization_deletion_command_v1(
  uuid, uuid, uuid, bigint, text, text, text, uuid
) owner to loyalty_owner;

revoke all on function loyalty.create_organization_agency_invitation_command_v1(
  uuid, text, timestamptz, text, text, uuid
) from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function loyalty.accept_organization_agency_invitation_command_v1(
  uuid, text, text, uuid
) from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function loyalty.revoke_organization_agency_relationship_command_v1(
  uuid, uuid, bigint, text, text, uuid
) from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function loyalty.get_organization_agency_portfolio_v1(uuid)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function loyalty.create_support_access_request_command_v1(
  uuid, uuid, text[], text, timestamptz, text, uuid
) from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function loyalty.resolve_support_access_request_command_v1(
  uuid, uuid, bigint, text, text[], timestamptz, text, text, uuid
) from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function loyalty.revoke_support_access_grant_command_v1(
  uuid, uuid, bigint, text, text, uuid
) from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function loyalty.get_support_administration_workspace_v1(uuid)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function loyalty.get_support_workspace_v1(uuid)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function loyalty.start_organization_break_glass_command_v1(
  uuid, text, text, uuid
) from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function loyalty.get_organization_recovery_workspace_v1(uuid)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function loyalty.get_organization_administration_export_v1(uuid, uuid)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function loyalty.organization_deletion_command_v1(
  uuid, uuid, uuid, bigint, text, text, text, uuid
) from public, anon, authenticated, loyalty_runtime, loyalty_worker;

grant execute on function loyalty.create_organization_agency_invitation_command_v1(
  uuid, text, timestamptz, text, text, uuid
) to authenticated;
grant execute on function loyalty.accept_organization_agency_invitation_command_v1(
  uuid, text, text, uuid
) to authenticated;
grant execute on function loyalty.revoke_organization_agency_relationship_command_v1(
  uuid, uuid, bigint, text, text, uuid
) to authenticated;
grant execute on function loyalty.get_organization_agency_portfolio_v1(uuid)
  to authenticated;
grant execute on function loyalty.create_support_access_request_command_v1(
  uuid, uuid, text[], text, timestamptz, text, uuid
) to authenticated;
grant execute on function loyalty.resolve_support_access_request_command_v1(
  uuid, uuid, bigint, text, text[], timestamptz, text, text, uuid
) to authenticated;
grant execute on function loyalty.revoke_support_access_grant_command_v1(
  uuid, uuid, bigint, text, text, uuid
) to authenticated;
grant execute on function loyalty.get_support_administration_workspace_v1(uuid)
  to authenticated;
grant execute on function loyalty.get_support_workspace_v1(uuid)
  to authenticated;
grant execute on function loyalty.start_organization_break_glass_command_v1(
  uuid, text, text, uuid
) to authenticated;
grant execute on function loyalty.get_organization_recovery_workspace_v1(uuid)
  to authenticated;
grant execute on function loyalty.get_organization_administration_export_v1(uuid, uuid)
  to authenticated;
grant execute on function loyalty.organization_deletion_command_v1(
  uuid, uuid, uuid, bigint, text, text, text, uuid
) to authenticated;

comment on table loyalty.organization_agency_relationships is
  'Bilateral portfolio relationship only; never membership, RLS, customer, wallet, or programme authority.';
comment on table loyalty.organization_support_access_requests is
  'Tenant-owner decision boundary for exact read-only V1 support scopes.';
comment on table loyalty.support_access_use_events is
  'Immutable tenant-visible evidence for every successful support projection.';
comment on table loyalty.organization_break_glass_sessions is
  'AAL2 and live-Auth-session-bound owner recovery capability lasting at most thirty minutes.';
comment on table loyalty.organization_deletion_cases is
  'Cooling-period tombstone workflow; completion pseudonymizes mutable identity and preserves immutable value.';
comment on function loyalty.get_support_workspace_v1(uuid) is
  'Returns one minimized scoped support projection only after live grant, relationship, agency membership, and Auth-session checks, while recording use atomically.';
comment on function loyalty.organization_deletion_command_v1(
  uuid, uuid, uuid, bigint, text, text, text, uuid
) is 'AAL2 break-glass deletion workflow with seven-day cooling, comprehensive credential revocation, and non-destructive value retention.';
