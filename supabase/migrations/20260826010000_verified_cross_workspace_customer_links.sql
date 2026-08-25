-- M11-S02: independently verified store identities can share one canonical
-- customer only inside an exact shared programme group. Source identity is
-- retained immutably; no wallet or ledger value is merged or transferred.

alter table loyalty.customer_user_links
  add column source_customer_id bigint;

update loyalty.customer_user_links
set source_customer_id = customer_id
where source_customer_id is null;

alter table loyalty.customer_user_links
  alter column source_customer_id set not null,
  add constraint customer_user_links_source_customer_fk
    foreign key (organization_id, source_customer_id)
    references loyalty.customers(organization_id, id) on delete restrict;

drop index loyalty.customer_user_links_active_user_uidx;
create unique index customer_user_links_active_user_uidx
  on loyalty.customer_user_links (
    organization_id, auth_user_id, source_connection_id
  ) where revoked_at is null;

drop index loyalty.customer_user_links_active_customer_uidx;
create unique index customer_user_links_active_customer_uidx
  on loyalty.customer_user_links (
    organization_id, source_connection_id, source_customer_id
  ) where revoked_at is null;

create index customer_user_links_active_canonical_idx
  on loyalty.customer_user_links (
    organization_id, customer_id, auth_user_id, linked_at, id
  ) where revoked_at is null;

alter table loyalty.identity_link_decisions
  drop constraint identity_link_decisions_outcome_check;
alter table loyalty.identity_link_decisions
  add constraint identity_link_decisions_outcome_check check (outcome in (
    'linked', 'already_linked', 'rejected_identity',
    'rejected_user_conflict', 'rejected_customer_conflict',
    'rejected_value_conflict', 'rejected_sharing_scope'
  ));

create table loyalty.customer_identity_link_versions (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  link_set_public_id uuid not null,
  organization_id bigint not null,
  programme_group_id bigint not null,
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  canonical_customer_id bigint not null,
  canonical_customer_user_link_id bigint not null,
  revision integer not null check (revision > 0),
  state text not null check (state in ('active', 'unlinked')),
  action text not null check (action in ('verified_claim', 'customer_unlink')),
  source_identity_link_decision_id bigint,
  source_customer_user_link_id bigint not null,
  member_count integer not null check (member_count between 1 and 25),
  idempotency_key text not null check (
    length(idempotency_key) between 1 and 255 and idempotency_key = btrim(idempotency_key)
  ),
  request_sha256 bytea not null check (octet_length(request_sha256) = 32),
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, link_set_public_id, revision),
  unique (organization_id, auth_user_id, idempotency_key),
  foreign key (organization_id, programme_group_id)
    references loyalty.programme_groups(organization_id, id) on delete restrict,
  foreign key (organization_id, canonical_customer_id)
    references loyalty.customers(organization_id, id) on delete restrict,
  foreign key (organization_id, canonical_customer_user_link_id)
    references loyalty.customer_user_links(organization_id, id) on delete restrict,
  foreign key (organization_id, source_identity_link_decision_id)
    references loyalty.identity_link_decisions(organization_id, id) on delete restrict,
  foreign key (organization_id, source_customer_user_link_id)
    references loyalty.customer_user_links(organization_id, id) on delete restrict,
  check ((state = 'active') = (member_count >= 2)),
  check ((action = 'verified_claim') = (source_identity_link_decision_id is not null))
);

create index customer_identity_link_versions_current_idx
  on loyalty.customer_identity_link_versions (
    organization_id, auth_user_id, programme_group_id, revision desc, id desc
  );

create unique index customer_identity_link_versions_subject_idempotency_uidx
  on loyalty.customer_identity_link_versions (auth_user_id, idempotency_key);

create table loyalty.customer_identity_link_version_members (
  id bigint generated always as identity primary key,
  organization_id bigint not null,
  version_id bigint not null,
  ordinal integer not null check (ordinal between 1 and 25),
  customer_user_link_id bigint not null,
  source_identity_id bigint,
  source_customer_id bigint not null,
  connection_id bigint not null,
  workspace_id bigint not null,
  canonical boolean not null,
  linked_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, version_id, ordinal),
  unique (organization_id, version_id, customer_user_link_id),
  unique (organization_id, version_id, connection_id),
  unique (organization_id, version_id, workspace_id),
  foreign key (organization_id, version_id)
    references loyalty.customer_identity_link_versions(organization_id, id) on delete restrict,
  foreign key (organization_id, customer_user_link_id)
    references loyalty.customer_user_links(organization_id, id) on delete restrict,
  foreign key (organization_id, source_identity_id)
    references loyalty.customer_identities(organization_id, id) on delete restrict,
  foreign key (organization_id, source_customer_id)
    references loyalty.customers(organization_id, id) on delete restrict,
  foreign key (organization_id, connection_id)
    references loyalty.commerce_connections(organization_id, id) on delete restrict,
  foreign key (organization_id, workspace_id)
    references loyalty.workspaces(organization_id, id) on delete restrict
);

create index customer_identity_link_version_members_source_idx
  on loyalty.customer_identity_link_version_members (
    organization_id, source_customer_id, version_id desc
  );

create table loyalty_private.customer_link_projection_authorizations (
  transaction_id bigint not null,
  backend_pid integer not null,
  operation text not null check (operation in ('link', 'unlink')),
  customer_user_link_id bigint,
  customer_identity_id bigint,
  from_customer_id bigint not null,
  to_customer_id bigint not null,
  allow_revoke boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  check (customer_user_link_id is not null or customer_identity_id is not null),
  check (from_customer_id <> to_customer_id),
  unique (
    transaction_id, backend_pid, operation, customer_user_link_id,
    customer_identity_id, from_customer_id, to_customer_id
  )
);

alter table loyalty.customer_identity_link_versions owner to loyalty_owner;
alter table loyalty.customer_identity_link_version_members owner to loyalty_owner;
alter table loyalty_private.customer_link_projection_authorizations owner to loyalty_owner;

alter table loyalty.customer_identity_link_versions enable row level security;
alter table loyalty.customer_identity_link_version_members enable row level security;
alter table loyalty_private.customer_link_projection_authorizations enable row level security;

create trigger customer_identity_link_versions_immutable
before update or delete on loyalty.customer_identity_link_versions
for each row execute function loyalty_private.reject_immutable_change();

create trigger customer_identity_link_version_members_immutable
before update or delete on loyalty.customer_identity_link_version_members
for each row execute function loyalty_private.reject_immutable_change();

create or replace function loyalty_private.protect_customer_user_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  projection_authorized boolean := false;
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'customer identity links cannot be deleted';
  end if;
  if new.organization_id <> old.organization_id
    or new.source_customer_id <> old.source_customer_id
    or new.auth_user_id <> old.auth_user_id
    or new.source_connection_id <> old.source_connection_id
    or new.linked_at <> old.linked_at
    or new.public_id <> old.public_id then
    raise exception using errcode = '55000', message = 'customer identity link history is immutable';
  end if;

  if new.customer_id <> old.customer_id then
    select exists (
      select 1
      from loyalty_private.customer_link_projection_authorizations as authorization
      where authorization.transaction_id = pg_catalog.txid_current()
        and authorization.backend_pid = pg_catalog.pg_backend_pid()
        and authorization.customer_user_link_id = old.id
        and authorization.from_customer_id = old.customer_id
        and authorization.to_customer_id = new.customer_id
        and (new.revoked_at is not distinct from old.revoked_at or authorization.allow_revoke)
    ) into projection_authorized;
    if not projection_authorized then
      raise exception using errcode = '55000', message = 'customer identity link projection is protected';
    end if;
  end if;

  if old.revoked_at is not null then
    if new.revoked_at is distinct from old.revoked_at
      or new.customer_id <> old.customer_id then
      raise exception using errcode = '55000', message = 'customer identity link history is immutable';
    end if;
    return new;
  end if;
  if new.customer_id = old.customer_id
    and new.revoked_at is not distinct from old.revoked_at then
    return new;
  end if;
  if new.customer_id = old.customer_id
    and new.revoked_at is not null
    and new.revoked_at >= old.linked_at then
    return new;
  end if;
  if projection_authorized then return new; end if;
  raise exception using errcode = '55000', message = 'customer identity link history is immutable';
end;
$$;

create or replace function loyalty_private.protect_customer_identity_customer_projection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.customer_id <> old.customer_id and not exists (
    select 1
    from loyalty_private.customer_link_projection_authorizations as authorization
    where authorization.transaction_id = pg_catalog.txid_current()
      and authorization.backend_pid = pg_catalog.pg_backend_pid()
      and authorization.customer_identity_id = old.id
      and authorization.from_customer_id = old.customer_id
      and authorization.to_customer_id = new.customer_id
  ) then
    raise exception using errcode = '55000', message = 'customer identity canonical projection is protected';
  end if;
  return new;
end;
$$;

create trigger customer_identities_protect_customer_projection
before update of customer_id on loyalty.customer_identities
for each row execute function loyalty_private.protect_customer_identity_customer_projection();

create or replace function loyalty_private.append_customer_identity_link_version_v1(
  target_organization_id bigint,
  target_programme_group_id bigint,
  target_auth_user_id uuid,
  target_canonical_customer_id bigint,
  target_canonical_link_id bigint,
  target_action text,
  target_source_decision_id bigint,
  target_source_link_id bigint,
  target_source_identity_id bigint,
  target_idempotency_key text,
  target_request_sha256 bytea,
  target_correlation_id uuid
)
returns loyalty.customer_identity_link_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_version loyalty.customer_identity_link_versions%rowtype;
  created_version loyalty.customer_identity_link_versions%rowtype;
  target_link_set_public_id uuid;
  next_revision integer;
  active_member_count integer;
  active_workspace_count integer;
  canonical_link_count integer;
  active_state text;
begin
  if target_action not in ('verified_claim', 'customer_unlink')
    or target_organization_id is null or target_programme_group_id is null
    or target_auth_user_id is null or target_canonical_customer_id is null
    or target_canonical_link_id is null or target_source_link_id is null
    or target_idempotency_key is null
    or length(target_idempotency_key) not between 1 and 255
    or target_idempotency_key <> btrim(target_idempotency_key)
    or octet_length(target_request_sha256) <> 32
    or target_correlation_id is null
    or (target_action = 'verified_claim' and target_source_decision_id is null) then
    raise exception using errcode = '22023', message = 'invalid customer link version input';
  end if;

  select version.* into previous_version
  from loyalty.customer_identity_link_versions as version
  where version.organization_id = target_organization_id
    and version.programme_group_id = target_programme_group_id
    and version.auth_user_id = target_auth_user_id
  order by version.revision desc, version.id desc
  limit 1
  for update;

  if found then
    if previous_version.canonical_customer_id <> target_canonical_customer_id
      or previous_version.canonical_customer_user_link_id <> target_canonical_link_id then
      raise exception using errcode = '55000', message = 'customer link canonical projection drift';
    end if;
    target_link_set_public_id := previous_version.link_set_public_id;
    next_revision := previous_version.revision + 1;
  else
    target_link_set_public_id := gen_random_uuid();
    next_revision := 1;
  end if;

  select count(*)::integer,
    count(distinct connection.workspace_id)::integer,
    count(*) filter (where link.id = target_canonical_link_id)::integer
  into active_member_count, active_workspace_count, canonical_link_count
  from loyalty.customer_user_links as link
  join loyalty.commerce_connections as connection
    on connection.organization_id = link.organization_id
   and connection.id = link.source_connection_id
   and connection.status in ('active', 'rotating')
  join loyalty.programmes as programme
    on programme.organization_id = connection.organization_id
   and programme.id = connection.programme_id
   and programme.programme_group_id = target_programme_group_id
   and programme.status = 'active'
  join loyalty.programme_group_workspaces as group_workspace
    on group_workspace.organization_id = programme.organization_id
   and group_workspace.programme_group_id = programme.programme_group_id
   and group_workspace.workspace_id = connection.workspace_id
  where link.organization_id = target_organization_id
    and link.auth_user_id = target_auth_user_id
    and link.customer_id = target_canonical_customer_id
    and link.revoked_at is null;

  if active_member_count not between 1 and 25
    or active_workspace_count <> active_member_count
    or canonical_link_count <> 1 then
    raise exception using errcode = '55000', message = 'customer link member projection drift';
  end if;
  if target_action = 'verified_claim' and active_member_count < 2 then
    raise exception using errcode = '23514', message = 'shared customer link requires two verified stores';
  end if;
  active_state := case when active_member_count >= 2 then 'active' else 'unlinked' end;

  insert into loyalty.customer_identity_link_versions (
    link_set_public_id, organization_id, programme_group_id, auth_user_id,
    canonical_customer_id, canonical_customer_user_link_id, revision,
    state, action, source_identity_link_decision_id,
    source_customer_user_link_id, member_count, idempotency_key,
    request_sha256, correlation_id
  ) values (
    target_link_set_public_id, target_organization_id, target_programme_group_id,
    target_auth_user_id, target_canonical_customer_id,
    target_canonical_link_id, next_revision, active_state, target_action,
    target_source_decision_id, target_source_link_id, active_member_count,
    target_idempotency_key, target_request_sha256, target_correlation_id
  ) returning * into created_version;

  insert into loyalty.customer_identity_link_version_members (
    organization_id, version_id, ordinal, customer_user_link_id,
    source_identity_id, source_customer_id, connection_id, workspace_id,
    canonical, linked_at
  )
  select target_organization_id, created_version.id,
    row_number() over (order by (link.id = target_canonical_link_id) desc,
      link.linked_at, link.id)::integer,
    link.id,
    case
      when link.id = target_source_link_id and target_source_identity_id is not null
        then target_source_identity_id
      else coalesce(previous_member.source_identity_id, identity.id)
    end,
    link.source_customer_id, connection.id, connection.workspace_id,
    link.id = target_canonical_link_id, link.linked_at
  from loyalty.customer_user_links as link
  join loyalty.commerce_connections as connection
    on connection.organization_id = link.organization_id
   and connection.id = link.source_connection_id
   and connection.status in ('active', 'rotating')
  join loyalty.programmes as programme
    on programme.organization_id = connection.organization_id
   and programme.id = connection.programme_id
   and programme.programme_group_id = target_programme_group_id
   and programme.status = 'active'
  left join loyalty.customer_identity_link_version_members as previous_member
    on previous_member.organization_id = target_organization_id
   and previous_member.version_id = previous_version.id
   and previous_member.customer_user_link_id = link.id
  left join lateral (
    select candidate.id
    from loyalty.customer_identities as candidate
    where candidate.organization_id = link.organization_id
      and candidate.commerce_connection_id = link.source_connection_id
      and candidate.customer_id = link.customer_id
      and candidate.identity_kind = 'registered'
      and candidate.verified_at is not null
    order by candidate.verified_at, candidate.id
    limit 1
  ) as identity on true
  where link.organization_id = target_organization_id
    and link.auth_user_id = target_auth_user_id
    and link.customer_id = target_canonical_customer_id
    and link.revoked_at is null
  order by (link.id = target_canonical_link_id) desc, link.linked_at, link.id;

  if (
    select count(*) from loyalty.customer_identity_link_version_members as member
    where member.organization_id = target_organization_id
      and member.version_id = created_version.id
  ) <> active_member_count then
    raise exception using errcode = '55000', message = 'customer link version membership incomplete';
  end if;

  return created_version;
end;
$$;

create or replace function loyalty_private.claim_woocommerce_customer_identity(
  target_connection_public_id uuid,
  target_external_customer_id text,
  target_auth_user_id uuid,
  target_key_version text,
  target_issued_at timestamptz,
  target_nonce_sha256 bytea,
  target_proof_sha256 bytea
)
returns table (
  link_public_id uuid,
  customer_public_id uuid,
  outcome text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_connection loyalty.commerce_connections%rowtype;
  target_identity loyalty.customer_identities%rowtype;
  target_customer loyalty.customers%rowtype;
  existing_decision loyalty.identity_link_decisions%rowtype;
  created_decision loyalty.identity_link_decisions%rowtype;
  user_connection_link loyalty.customer_user_links%rowtype;
  customer_link loyalty.customer_user_links%rowtype;
  canonical_link loyalty.customer_user_links%rowtype;
  created_link loyalty.customer_user_links%rowtype;
  target_programme_group loyalty.programme_groups%rowtype;
  source_customer_id bigint;
  decision_outcome text;
  external_hash bytea;
  sharing_enabled boolean := false;
  sharing_policy_current boolean := false;
  existing_group_link boolean := false;
  request_hash bytea;
  version_result loyalty.customer_identity_link_versions%rowtype;
begin
  if target_connection_public_id is null or target_auth_user_id is null
    or target_issued_at is null
    or target_external_customer_id !~ '^[1-9][0-9]{0,19}$'
    or target_key_version !~ '^v[1-9][0-9]*$'
    or octet_length(target_nonce_sha256) <> 32
    or octet_length(target_proof_sha256) <> 32 then
    raise exception using errcode = '22023', message = 'invalid customer claim';
  end if;
  if pg_catalog.abs(extract(epoch from (clock_timestamp() - target_issued_at))) > 300 then
    raise exception using errcode = '22023', message = 'expired customer claim';
  end if;

  select connection.* into target_connection
  from loyalty.commerce_connections as connection
  where connection.public_id = target_connection_public_id
  for update;
  if not found
    or target_connection.status not in ('active', 'rotating')
    or target_connection.current_key_version <> target_key_version then
    raise exception using errcode = '22023', message = 'invalid customer claim';
  end if;

  external_hash := extensions.digest(
    pg_catalog.convert_to(target_external_customer_id, 'UTF8'), 'sha256'
  );
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    target_connection.organization_id::text || ':user:' || target_auth_user_id::text, 0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    target_connection.id::text || ':customer:' || target_external_customer_id, 0
  ));

  select decision.* into existing_decision
  from loyalty.identity_link_decisions as decision
  where decision.connection_id = target_connection.id
    and decision.nonce_sha256 = target_nonce_sha256;
  if found then
    if existing_decision.organization_id <> target_connection.organization_id
      or existing_decision.auth_user_id <> target_auth_user_id
      or existing_decision.external_customer_sha256 <> external_hash
      or existing_decision.proof_sha256 <> target_proof_sha256
      or existing_decision.key_version <> target_key_version
      or existing_decision.issued_at <> target_issued_at then
      raise exception using errcode = '23505', message = 'customer claim replay conflict';
    end if;
    select link.* into customer_link
    from loyalty.customer_user_links as link
    where link.organization_id = existing_decision.organization_id
      and link.auth_user_id = existing_decision.auth_user_id
      and link.source_connection_id = existing_decision.connection_id
      and link.source_customer_id = existing_decision.customer_id
    order by link.linked_at desc, link.id desc
    limit 1;
    return query
    select customer_link.public_id, customer.public_id, existing_decision.outcome
    from loyalty.customers as customer
    where customer.organization_id = existing_decision.organization_id
      and customer.id = customer_link.customer_id;
    if not found then
      return query select null::uuid, null::uuid, existing_decision.outcome;
    end if;
    return;
  end if;

  select identity.* into target_identity
  from loyalty.customer_identities as identity
  where identity.organization_id = target_connection.organization_id
    and identity.commerce_connection_id = target_connection.id
    and identity.external_customer_id = 'registered:' || target_external_customer_id
    and identity.identity_kind = 'registered'
    and identity.verified_at is not null
  for update;

  if found then
    select customer.* into target_customer
    from loyalty.customers as customer
    where customer.organization_id = target_identity.organization_id
      and customer.id = target_identity.customer_id
      and customer.status = 'active'
    for update;
  end if;

  if target_customer.id is null then
    decision_outcome := 'rejected_identity';
  else
    select link.* into user_connection_link
    from loyalty.customer_user_links as link
    where link.organization_id = target_connection.organization_id
      and link.auth_user_id = target_auth_user_id
      and link.source_connection_id = target_connection.id
      and link.revoked_at is null
    order by link.id
    limit 1
    for update;

    source_customer_id := target_identity.customer_id;
    if user_connection_link.id is not null
      and user_connection_link.customer_id = target_identity.customer_id then
      source_customer_id := user_connection_link.source_customer_id;
    elsif user_connection_link.id is null then
      select link.* into customer_link
      from loyalty.customer_user_links as link
      where link.organization_id = target_connection.organization_id
        and link.source_connection_id = target_connection.id
        and (
          link.source_customer_id = target_identity.customer_id
          or link.customer_id = target_identity.customer_id
        )
        and link.revoked_at is null
      order by link.id
      limit 1
      for update;
      if found then source_customer_id := customer_link.source_customer_id; end if;
    end if;

    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      target_connection.organization_id::text || ':source-customer:' || source_customer_id::text,
      0
    ));

    select link.* into customer_link
    from loyalty.customer_user_links as link
    where link.organization_id = target_connection.organization_id
      and link.source_connection_id = target_connection.id
      and link.source_customer_id = source_customer_id
      and link.revoked_at is null
    order by link.id
    limit 1
    for update;

    if user_connection_link.id is not null
      and user_connection_link.customer_id <> target_identity.customer_id then
      decision_outcome := 'rejected_user_conflict';
    elsif customer_link.id is not null
      and customer_link.auth_user_id <> target_auth_user_id then
      decision_outcome := 'rejected_customer_conflict';
    elsif user_connection_link.id is not null then
      created_link := user_connection_link;
      decision_outcome := 'already_linked';
    else
      select programme_group.* into target_programme_group
      from loyalty.programmes as programme
      join loyalty.programme_groups as programme_group
        on programme_group.organization_id = programme.organization_id
       and programme_group.id = programme.programme_group_id
       and programme_group.status = 'active'
      join loyalty.programme_group_workspaces as group_workspace
        on group_workspace.organization_id = programme.organization_id
       and group_workspace.programme_group_id = programme.programme_group_id
       and group_workspace.workspace_id = target_connection.workspace_id
      where programme.organization_id = target_connection.organization_id
        and programme.id = target_connection.programme_id
        and programme.status = 'active'
      for update of programme_group;

      if target_programme_group.id is not null
        and target_programme_group.sharing_policy = 'explicit-workspace-allowlist' then
        select exists (
          select 1
          from (
            select candidate.*
            from loyalty.programme_group_sharing_versions as candidate
            where candidate.organization_id = target_connection.organization_id
              and candidate.programme_group_id = target_programme_group.id
            order by candidate.revision desc, candidate.id desc
            limit 1
          ) as version
          where version.sharing_mode = 'explicit-workspace-allowlist'
            and (
              select count(*)
              from loyalty.programme_group_sharing_version_workspaces as member
              where member.organization_id = version.organization_id
                and member.sharing_version_id = version.id
            ) between 2 and 25
            and exists (
              select 1
              from loyalty.programme_group_sharing_version_workspaces as member
              where member.organization_id = version.organization_id
                and member.sharing_version_id = version.id
                and member.workspace_id = target_connection.workspace_id
            )
            and not exists (
              (
                select current_link.workspace_id
                from loyalty.programme_group_workspaces as current_link
                where current_link.organization_id = version.organization_id
                  and current_link.programme_group_id = version.programme_group_id
                except
                select member.workspace_id
                from loyalty.programme_group_sharing_version_workspaces as member
                where member.organization_id = version.organization_id
                  and member.sharing_version_id = version.id
              )
              union all
              (
                select member.workspace_id
                from loyalty.programme_group_sharing_version_workspaces as member
                where member.organization_id = version.organization_id
                  and member.sharing_version_id = version.id
                except
                select current_link.workspace_id
                from loyalty.programme_group_workspaces as current_link
                where current_link.organization_id = version.organization_id
                  and current_link.programme_group_id = version.programme_group_id
              )
            )
        ) into sharing_policy_current;
        if sharing_policy_current then
          select enabled into sharing_enabled
          from loyalty_private.resolve_organization_entitlement(
            target_connection.organization_id, 'ecosystem.api',
            'customer-link:' || target_programme_group.public_id::text,
            clock_timestamp()
          );
        end if;

        select exists (
          select 1
          from loyalty.customer_user_links as link
          join loyalty.commerce_connections as connection
            on connection.organization_id = link.organization_id
           and connection.id = link.source_connection_id
          join loyalty.programmes as programme
            on programme.organization_id = connection.organization_id
           and programme.id = connection.programme_id
           and programme.programme_group_id = target_programme_group.id
          where link.organization_id = target_connection.organization_id
            and link.auth_user_id = target_auth_user_id
            and link.source_connection_id <> target_connection.id
            and link.revoked_at is null
        ) into existing_group_link;
      end if;

      if sharing_enabled then
        perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
          target_connection.organization_id::text || ':customer-link:' ||
            target_programme_group.id::text || ':' || target_auth_user_id::text,
          0
        ));
        select link.* into canonical_link
        from loyalty.customer_user_links as link
        join loyalty.commerce_connections as connection
          on connection.organization_id = link.organization_id
         and connection.id = link.source_connection_id
         and connection.status in ('active', 'rotating')
        join loyalty.programmes as programme
          on programme.organization_id = connection.organization_id
         and programme.id = connection.programme_id
         and programme.programme_group_id = target_programme_group.id
         and programme.status = 'active'
        join loyalty.programme_group_workspaces as group_workspace
          on group_workspace.organization_id = programme.organization_id
         and group_workspace.programme_group_id = programme.programme_group_id
         and group_workspace.workspace_id = connection.workspace_id
        where link.organization_id = target_connection.organization_id
          and link.auth_user_id = target_auth_user_id
          and link.source_connection_id <> target_connection.id
          and link.revoked_at is null
        order by link.linked_at, link.id
        limit 1
        for update of link;
      end if;

      if target_programme_group.id is not null
        and target_programme_group.sharing_policy = 'explicit-workspace-allowlist'
        and existing_group_link and not sharing_enabled then
        decision_outcome := 'rejected_sharing_scope';
      elsif canonical_link.id is not null then
        if exists (
          select 1
          from loyalty.customer_user_links as link
          join loyalty.commerce_connections as connection
            on connection.organization_id = link.organization_id
           and connection.id = link.source_connection_id
          join loyalty.programmes as programme
            on programme.organization_id = connection.organization_id
           and programme.id = connection.programme_id
           and programme.programme_group_id = target_programme_group.id
          where link.organization_id = target_connection.organization_id
            and link.auth_user_id = target_auth_user_id
            and link.revoked_at is null
            and link.customer_id <> canonical_link.customer_id
        ) then
          raise exception using errcode = '55000', message = 'customer link canonical projection drift';
        end if;
        if target_identity.customer_id <> canonical_link.customer_id and exists (
          select 1 from loyalty.wallets as wallet
          where wallet.organization_id = target_connection.organization_id
            and wallet.programme_group_id = target_programme_group.id
            and wallet.customer_id = target_identity.customer_id
        ) then
          decision_outcome := 'rejected_value_conflict';
        else
          insert into loyalty.customer_user_links (
            organization_id, customer_id, source_customer_id,
            auth_user_id, source_connection_id
          ) values (
            target_connection.organization_id, canonical_link.customer_id,
            source_customer_id, target_auth_user_id, target_connection.id
          ) returning * into created_link;
          decision_outcome := 'linked';
        end if;
      else
        insert into loyalty.customer_user_links (
          organization_id, customer_id, source_customer_id,
          auth_user_id, source_connection_id
        ) values (
          target_connection.organization_id, target_identity.customer_id,
          source_customer_id, target_auth_user_id, target_connection.id
        ) returning * into created_link;
        decision_outcome := 'linked';
      end if;
    end if;
  end if;

  insert into loyalty.identity_link_decisions (
    organization_id, connection_id, customer_id, auth_user_id,
    external_customer_sha256, nonce_sha256, proof_sha256,
    key_version, issued_at, outcome
  ) values (
    target_connection.organization_id, target_connection.id,
    source_customer_id, target_auth_user_id, external_hash,
    target_nonce_sha256, target_proof_sha256, target_key_version,
    target_issued_at, decision_outcome
  ) returning * into created_decision;

  if decision_outcome = 'linked'
    and canonical_link.id is not null
    and created_link.id is not null then
    if target_identity.customer_id <> canonical_link.customer_id then
      insert into loyalty_private.customer_link_projection_authorizations (
        transaction_id, backend_pid, operation, customer_identity_id,
        from_customer_id, to_customer_id
      ) values (
        pg_catalog.txid_current(), pg_catalog.pg_backend_pid(), 'link',
        target_identity.id, target_identity.customer_id, canonical_link.customer_id
      );
      update loyalty.customer_identities
      set customer_id = canonical_link.customer_id
      where organization_id = target_connection.organization_id
        and id = target_identity.id
        and customer_id = target_identity.customer_id;
      if not found then
        raise exception using errcode = '55000', message = 'customer identity projection changed concurrently';
      end if;
      delete from loyalty_private.customer_link_projection_authorizations
      where transaction_id = pg_catalog.txid_current()
        and backend_pid = pg_catalog.pg_backend_pid()
        and customer_identity_id = target_identity.id;
    end if;

    request_hash := extensions.digest(
      pg_catalog.convert_to(
        'customer-link.verified-claim|' || target_connection.public_id::text || '|' ||
          created_link.public_id::text || '|' || encode(target_proof_sha256, 'hex'),
        'UTF8'
      ), 'sha256'
    );
    version_result := loyalty_private.append_customer_identity_link_version_v1(
      target_connection.organization_id, target_programme_group.id,
      target_auth_user_id, canonical_link.customer_id, canonical_link.id,
      'verified_claim', created_decision.id, created_link.id,
      target_identity.id, 'customer-link:claim:' || created_decision.public_id::text,
      request_hash, gen_random_uuid()
    );
  end if;

  return query
  select created_link.public_id, customer.public_id, decision_outcome
  from loyalty.customers as customer
  where customer.organization_id = target_connection.organization_id
    and customer.id = created_link.customer_id;
  if not found then
    return query select null::uuid, null::uuid, decision_outcome;
  end if;
end;
$$;

create or replace function loyalty.get_my_cross_workspace_customer_links_v1()
returns table (document jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  request_user_id uuid := loyalty_private.request_user_id();
begin
  if request_user_id is null then
    return;
  end if;

  if exists (
    with latest as (
      select distinct on (version.organization_id, version.programme_group_id)
        version.*
      from loyalty.customer_identity_link_versions as version
      where version.auth_user_id = request_user_id
      order by version.organization_id, version.programme_group_id,
        version.revision desc, version.id desc
      limit 20
    )
    select 1
    from latest
    where latest.member_count <> (
      select count(*)
      from loyalty.customer_identity_link_version_members as member
      join loyalty.customer_user_links as link
        on link.organization_id = member.organization_id
       and link.id = member.customer_user_link_id
       and link.auth_user_id = request_user_id
       and link.customer_id = latest.canonical_customer_id
       and link.revoked_at is null
      join loyalty.customer_identities as identity
        on identity.organization_id = member.organization_id
       and identity.id = member.source_identity_id
       and identity.customer_id = latest.canonical_customer_id
      join loyalty.commerce_connections as connection
        on connection.organization_id = member.organization_id
       and connection.id = member.connection_id
       and connection.workspace_id = member.workspace_id
       and connection.status in ('active', 'rotating')
      join loyalty.programme_group_workspaces as group_workspace
        on group_workspace.organization_id = member.organization_id
       and group_workspace.programme_group_id = latest.programme_group_id
       and group_workspace.workspace_id = member.workspace_id
      where member.organization_id = latest.organization_id
        and member.version_id = latest.id
    )
  ) then
    raise exception using errcode = '55000', message = 'customer link read projection drift';
  end if;

  return query
  with latest as (
    select distinct on (version.organization_id, version.programme_group_id)
      version.*
    from loyalty.customer_identity_link_versions as version
    where version.auth_user_id = request_user_id
    order by version.organization_id, version.programme_group_id,
      version.revision desc, version.id desc
    limit 20
  ), link_documents as (
    select latest.organization_id, latest.programme_group_id,
      jsonb_build_object(
        'version', '1',
        'linkSetId', latest.link_set_public_id,
        'programmeGroupId', programme_group.public_id,
        'programmeGroupName', programme_group.name,
        'revision', latest.revision,
        'state', latest.state,
        'members', (
          select jsonb_agg(jsonb_build_object(
            'accountId', link.public_id,
            'workspaceId', workspace.public_id,
            'workspaceName', workspace.name,
            'storeName', connection.display_name,
            'canonical', member.canonical,
            'canUnlink', latest.state = 'active' and not member.canonical,
            'linkedAt', member.linked_at
          ) order by member.ordinal)
          from loyalty.customer_identity_link_version_members as member
          join loyalty.customer_user_links as link
            on link.organization_id = member.organization_id
           and link.id = member.customer_user_link_id
          join loyalty.commerce_connections as connection
            on connection.organization_id = member.organization_id
           and connection.id = member.connection_id
          join loyalty.workspaces as workspace
            on workspace.organization_id = member.organization_id
           and workspace.id = member.workspace_id
          where member.organization_id = latest.organization_id
            and member.version_id = latest.id
        )
      ) as document
    from latest
    join loyalty.programme_groups as programme_group
      on programme_group.organization_id = latest.organization_id
     and programme_group.id = latest.programme_group_id
     and programme_group.status = 'active'
  )
  select jsonb_build_object(
    'version', '1',
    'links', coalesce(jsonb_agg(link_documents.document order by
      link_documents.organization_id, link_documents.programme_group_id), '[]'::jsonb)
  )
  from link_documents;
end;
$$;

create or replace function loyalty.unlink_my_cross_workspace_customer_account_v1(
  target_account_public_id uuid,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (
  link_set_public_id uuid,
  account_public_id uuid,
  outcome text,
  revision integer,
  state text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_user_id uuid := loyalty_private.request_user_id();
  target_link loyalty.customer_user_links%rowtype;
  target_identity loyalty.customer_identities%rowtype;
  target_programme_group loyalty.programme_groups%rowtype;
  current_version loyalty.customer_identity_link_versions%rowtype;
  current_member loyalty.customer_identity_link_version_members%rowtype;
  existing_version loyalty.customer_identity_link_versions%rowtype;
  created_version loyalty.customer_identity_link_versions%rowtype;
  request_hash bytea;
  unlink_time timestamptz := clock_timestamp();
begin
  if request_user_id is null or target_account_public_id is null
    or target_idempotency_key is null
    or length(target_idempotency_key) not between 1 and 255
    or target_idempotency_key <> btrim(target_idempotency_key)
    or target_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid customer unlink command';
  end if;

  request_hash := extensions.digest(pg_catalog.convert_to(
    'customer-link.unlink|' || target_account_public_id::text, 'UTF8'
  ), 'sha256');

  select version.* into existing_version
  from loyalty.customer_identity_link_versions as version
  where version.auth_user_id = request_user_id
    and version.idempotency_key = target_idempotency_key;
  if found then
    if existing_version.action <> 'customer_unlink'
      or existing_version.request_sha256 <> request_hash then
      raise exception using errcode = '23514', message = 'customer unlink idempotency conflict';
    end if;
    return query
    select existing_version.link_set_public_id, link.public_id,
      'duplicate'::text, existing_version.revision, existing_version.state
    from loyalty.customer_user_links as link
    where link.organization_id = existing_version.organization_id
      and link.id = existing_version.source_customer_user_link_id;
    return;
  end if;

  select link.* into target_link
  from loyalty.customer_user_links as link
  where link.public_id = target_account_public_id
    and link.auth_user_id = request_user_id
    and link.revoked_at is null
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'customer unlink not authorized';
  end if;

  select programme_group.* into target_programme_group
  from loyalty.commerce_connections as connection
  join loyalty.programmes as programme
    on programme.organization_id = connection.organization_id
   and programme.id = connection.programme_id
   and programme.status = 'active'
  join loyalty.programme_groups as programme_group
    on programme_group.organization_id = programme.organization_id
   and programme_group.id = programme.programme_group_id
   and programme_group.status = 'active'
  where connection.organization_id = target_link.organization_id
    and connection.id = target_link.source_connection_id
    and connection.status in ('active', 'rotating')
  for update of programme_group;
  if not found then
    raise exception using errcode = '55000', message = 'customer unlink scope unavailable';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    target_link.organization_id::text || ':customer-link:' ||
      target_programme_group.id::text || ':' || request_user_id::text,
    0
  ));

  select version.* into current_version
  from loyalty.customer_identity_link_versions as version
  where version.organization_id = target_link.organization_id
    and version.programme_group_id = target_programme_group.id
    and version.auth_user_id = request_user_id
  order by version.revision desc, version.id desc
  limit 1
  for update;
  if not found or current_version.state <> 'active' then
    raise exception using errcode = '23514', message = 'customer account is not actively shared';
  end if;
  if current_version.canonical_customer_user_link_id = target_link.id then
    raise exception using errcode = '23514', message = 'canonical customer account cannot be unlinked';
  end if;

  select member.* into current_member
  from loyalty.customer_identity_link_version_members as member
  where member.organization_id = target_link.organization_id
    and member.version_id = current_version.id
    and member.customer_user_link_id = target_link.id;
  if not found or current_member.source_identity_id is null
    or current_member.source_customer_id <> target_link.source_customer_id
    or target_link.customer_id <> current_version.canonical_customer_id then
    raise exception using errcode = '55000', message = 'customer unlink projection drift';
  end if;

  select identity.* into target_identity
  from loyalty.customer_identities as identity
  where identity.organization_id = target_link.organization_id
    and identity.id = current_member.source_identity_id
    and identity.customer_id = current_version.canonical_customer_id
  for update;
  if not found then
    raise exception using errcode = '55000', message = 'customer unlink identity drift';
  end if;

  insert into loyalty_private.customer_link_projection_authorizations (
    transaction_id, backend_pid, operation, customer_identity_id,
    from_customer_id, to_customer_id
  ) values (
    pg_catalog.txid_current(), pg_catalog.pg_backend_pid(), 'unlink',
    target_identity.id, current_version.canonical_customer_id,
    target_link.source_customer_id
  );
  insert into loyalty_private.customer_link_projection_authorizations (
    transaction_id, backend_pid, operation, customer_user_link_id,
    from_customer_id, to_customer_id, allow_revoke
  ) values (
    pg_catalog.txid_current(), pg_catalog.pg_backend_pid(), 'unlink',
    target_link.id, current_version.canonical_customer_id,
    target_link.source_customer_id, true
  );

  update loyalty.customer_identities
  set customer_id = target_link.source_customer_id
  where organization_id = target_link.organization_id
    and id = target_identity.id
    and customer_id = current_version.canonical_customer_id;
  if not found then
    raise exception using errcode = '55000', message = 'customer unlink identity changed concurrently';
  end if;

  update loyalty.customer_user_links
  set customer_id = source_customer_id, revoked_at = unlink_time
  where organization_id = target_link.organization_id
    and id = target_link.id
    and customer_id = current_version.canonical_customer_id
    and revoked_at is null;
  if not found then
    raise exception using errcode = '55000', message = 'customer unlink changed concurrently';
  end if;

  delete from loyalty_private.customer_link_projection_authorizations
  where transaction_id = pg_catalog.txid_current()
    and backend_pid = pg_catalog.pg_backend_pid();

  created_version := loyalty_private.append_customer_identity_link_version_v1(
    target_link.organization_id, target_programme_group.id, request_user_id,
    current_version.canonical_customer_id,
    current_version.canonical_customer_user_link_id,
    'customer_unlink', null, target_link.id, null,
    target_idempotency_key, request_hash, target_correlation_id
  );

  return query select created_version.link_set_public_id,
    target_link.public_id, 'unlinked'::text,
    created_version.revision, created_version.state;
end;
$$;

alter function loyalty_private.protect_customer_user_link() owner to loyalty_owner;
alter function loyalty_private.protect_customer_identity_customer_projection() owner to loyalty_owner;
alter function loyalty_private.append_customer_identity_link_version_v1(
  bigint, bigint, uuid, bigint, bigint, text, bigint, bigint, bigint,
  text, bytea, uuid
) owner to loyalty_owner;
alter function loyalty_private.claim_woocommerce_customer_identity(
  uuid, text, uuid, text, timestamptz, bytea, bytea
) owner to loyalty_owner;
alter function loyalty.get_my_cross_workspace_customer_links_v1() owner to loyalty_owner;
alter function loyalty.unlink_my_cross_workspace_customer_account_v1(
  uuid, text, uuid
) owner to loyalty_owner;

revoke all on loyalty.customer_identity_link_versions,
  loyalty.customer_identity_link_version_members,
  loyalty_private.customer_link_projection_authorizations
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

revoke all on function loyalty_private.protect_customer_user_link(),
  loyalty_private.protect_customer_identity_customer_projection(),
  loyalty_private.append_customer_identity_link_version_v1(
    bigint, bigint, uuid, bigint, bigint, text, bigint, bigint, bigint,
    text, bytea, uuid
  ) from public, anon, authenticated, loyalty_runtime, loyalty_worker;

revoke all on function loyalty_private.claim_woocommerce_customer_identity(
  uuid, text, uuid, text, timestamptz, bytea, bytea
) from public, anon, authenticated, loyalty_worker;
grant execute on function loyalty_private.claim_woocommerce_customer_identity(
  uuid, text, uuid, text, timestamptz, bytea, bytea
) to loyalty_runtime;

revoke all on function loyalty.get_my_cross_workspace_customer_links_v1(),
  loyalty.unlink_my_cross_workspace_customer_account_v1(uuid, text, uuid)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty.get_my_cross_workspace_customer_links_v1(),
  loyalty.unlink_my_cross_workspace_customer_account_v1(uuid, text, uuid)
  to authenticated;

comment on column loyalty.customer_user_links.source_customer_id is
  'Immutable customer resolved from this exact signed store identity before any verified canonical projection.';
comment on table loyalty.customer_identity_link_versions is
  'Immutable exact revisions for customer-approved cross-workspace canonical identity; never email-derived and never value-moving.';
comment on table loyalty.customer_identity_link_version_members is
  'Exact source link, identity, customer, connection, and workspace membership for one immutable customer-link revision.';
comment on table loyalty_private.customer_link_projection_authorizations is
  'Transaction-local private capabilities consumed by triggers before a verified customer/link canonical projection changes.';
comment on function loyalty.get_my_cross_workspace_customer_links_v1() is
  'Returns bounded minimized cross-store link state only for the live Auth-derived customer subject and fails closed on projection drift.';
comment on function loyalty.unlink_my_cross_workspace_customer_account_v1(uuid, text, uuid) is
  'Restores one exact non-canonical source identity and revokes its Auth account through an immutable Auth-derived unlink revision without changing loyalty value.';
