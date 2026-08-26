-- M13-S03: per-organization Authentik federation desired state.
-- Raw upstream and broker secrets never enter PostgreSQL; only SHA-256
-- fingerprints and minimized validation evidence are retained.

create table loyalty.organization_federation_sources (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null
    references loyalty.organizations(id) on delete restrict,
  display_name text not null,
  protocol text not null check (protocol in ('oidc', 'saml')),
  status text not null default 'draft'
    check (status in (
      'draft', 'validated', 'enabled', 'disabled', 'review_required', 'retired'
    )),
  lifecycle_revision bigint not null default 1
    check (lifecycle_revision >= 1),
  discovery_url text,
  client_id text,
  metadata_url text,
  expected_entity_id text,
  upstream_secret_sha256 bytea,
  broker_secret_sha256 bytea,
  configuration_sha256 bytea not null,
  document_sha256 bytea,
  validated_issuer text,
  authorization_endpoint text,
  token_endpoint text,
  jwks_uri text,
  saml_sso_endpoint text,
  signing_fingerprints jsonb not null default '[]'::jsonb,
  validated_at timestamptz,
  authentik_source_slug text not null unique,
  authentik_source_public_id uuid,
  authentik_provider_id bigint,
  supabase_provider_identifier text not null unique,
  pending_action text check (pending_action in (
    'enable', 'disable', 'rotate_secret', 'retire'
  )),
  pending_actor_user_id uuid references auth.users(id) on delete restrict,
  pending_correlation_id uuid,
  pending_upstream_secret_sha256 bytea,
  external_outcome text not null default 'none'
    check (external_outcome in ('none', 'succeeded', 'failed', 'ambiguous')),
  external_detail_code text,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  updated_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check (
    display_name = btrim(display_name)
    and length(display_name) between 1 and 120
    and display_name !~ '[[:cntrl:]]'
  ),
  check (octet_length(configuration_sha256) = 32),
  check (upstream_secret_sha256 is null or octet_length(upstream_secret_sha256) = 32),
  check (broker_secret_sha256 is null or octet_length(broker_secret_sha256) = 32),
  check (
    pending_upstream_secret_sha256 is null
    or octet_length(pending_upstream_secret_sha256) = 32
  ),
  check (document_sha256 is null or octet_length(document_sha256) = 32),
  check (jsonb_typeof(signing_fingerprints) = 'array'),
  check (authentik_source_slug ~ '^loyalty-[a-z0-9]{20}$'),
  check (supabase_provider_identifier ~ '^custom:loyalty-[a-z0-9]{20}$'),
  check (
    (protocol = 'oidc'
      and discovery_url is not null
      and client_id is not null
      and metadata_url is null
      and expected_entity_id is null
      and upstream_secret_sha256 is not null)
    or
    (protocol = 'saml'
      and discovery_url is null
      and client_id is null
      and metadata_url is not null
      and upstream_secret_sha256 is null)
  ),
  check (
    (pending_action = 'rotate_secret' and pending_upstream_secret_sha256 is not null)
    or (pending_action is distinct from 'rotate_secret'
      and pending_upstream_secret_sha256 is null)
  ),
  check (
    (pending_action is null
      and pending_actor_user_id is null
      and pending_correlation_id is null)
    or
    (pending_action is not null
      and pending_actor_user_id is not null
      and pending_correlation_id is not null)
  ),
  check (
    (validated_at is null
      and document_sha256 is null
      and validated_issuer is null
      and authorization_endpoint is null
      and token_endpoint is null
      and jwks_uri is null
      and saml_sso_endpoint is null
      and signing_fingerprints = '[]'::jsonb)
    or
    (validated_at is not null
      and document_sha256 is not null
      and validated_issuer is not null
      and jsonb_array_length(signing_fingerprints) between 1 and 20
      and (
        (protocol = 'oidc'
          and authorization_endpoint is not null
          and token_endpoint is not null
          and jwks_uri is not null
          and saml_sso_endpoint is null)
        or
        (protocol = 'saml'
          and authorization_endpoint is null
          and token_endpoint is null
          and jwks_uri is null
          and saml_sso_endpoint is not null)
      ))
  ),
  check (
    status not in ('validated', 'enabled')
    or (
      validated_at is not null
      and broker_secret_sha256 is not null
      and authentik_source_public_id is not null
      and authentik_provider_id is not null
    )
  ),
  check (external_detail_code is null or (
    external_detail_code ~ '^[a-z][a-z0-9_.-]{2,79}$'
  )),
  check (updated_at >= created_at)
);

create unique index organization_federation_one_enabled_idx
  on loyalty.organization_federation_sources (organization_id)
  where status = 'enabled';
create index organization_federation_tenant_history_idx
  on loyalty.organization_federation_sources (
    organization_id, created_at desc, id desc
  );

create table loyalty.organization_federation_source_revisions (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  source_id bigint not null,
  revision bigint not null check (revision >= 1),
  action text not null check (
    action ~ '^federation\.[a-z_]{3,40}(\.[a-z_]{3,40})?$'
  ),
  status text not null check (status in (
    'draft', 'validated', 'enabled', 'disabled', 'review_required', 'retired'
  )),
  configuration_sha256 bytea not null check (octet_length(configuration_sha256) = 32),
  document_sha256 bytea check (document_sha256 is null or octet_length(document_sha256) = 32),
  upstream_secret_sha256 bytea check (
    upstream_secret_sha256 is null or octet_length(upstream_secret_sha256) = 32
  ),
  broker_secret_sha256 bytea check (
    broker_secret_sha256 is null or octet_length(broker_secret_sha256) = 32
  ),
  pending_action text,
  external_outcome text not null check (
    external_outcome in ('none', 'succeeded', 'failed', 'ambiguous')
  ),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  idempotency_key text not null,
  request_sha256 bytea not null check (octet_length(request_sha256) = 32),
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (source_id, revision),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, source_id)
    references loyalty.organization_federation_sources(organization_id, id)
    on delete restrict,
  check (length(idempotency_key) between 1 and 255)
);

create index organization_federation_revision_history_idx
  on loyalty.organization_federation_source_revisions (
    organization_id, source_id, revision desc
  );

alter table loyalty.organization_federation_sources owner to loyalty_owner;
alter table loyalty.organization_federation_source_revisions owner to loyalty_owner;

alter table loyalty.organization_federation_sources enable row level security;
alter table loyalty.organization_federation_source_revisions enable row level security;

revoke all on loyalty.organization_federation_sources,
  loyalty.organization_federation_source_revisions
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

create trigger organization_federation_revisions_immutable
before update or delete on loyalty.organization_federation_source_revisions
for each row execute function loyalty_private.reject_immutable_change();

create or replace function loyalty_private.guard_organization_federation_source_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('loyalty.federation_command', true) is distinct from 'on' then
    raise exception using errcode = '55000', message = 'federation source mutations require an exact command';
  end if;
  if tg_op = 'UPDATE' and (
    new.organization_id <> old.organization_id
    or new.public_id <> old.public_id
    or new.protocol <> old.protocol
    or new.discovery_url is distinct from old.discovery_url
    or new.client_id is distinct from old.client_id
    or new.metadata_url is distinct from old.metadata_url
    or new.expected_entity_id is distinct from old.expected_entity_id
    or new.configuration_sha256 <> old.configuration_sha256
    or new.authentik_source_slug <> old.authentik_source_slug
    or new.supabase_provider_identifier <> old.supabase_provider_identifier
    or new.created_by_user_id <> old.created_by_user_id
    or new.created_at <> old.created_at
  ) then
    raise exception using errcode = '55000', message = 'federation source authority is immutable';
  end if;
  return new;
end;
$$;

alter function loyalty_private.guard_organization_federation_source_v1()
  owner to loyalty_owner;
revoke all on function loyalty_private.guard_organization_federation_source_v1()
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

create trigger organization_federation_sources_guarded
before update or delete on loyalty.organization_federation_sources
for each row execute function loyalty_private.guard_organization_federation_source_v1();

create or replace function loyalty_private.federation_actor_can_configure_v1(
  target_actor_user_id uuid,
  target_organization_id bigint,
  require_active_organization boolean default true
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_actor_user_id is not null
    and exists (
      select 1
      from loyalty.organizations as organization
      join loyalty.organization_memberships as membership
        on membership.organization_id = organization.id
      where organization.id = target_organization_id
        and organization.offboarded_at is null
        and (not require_active_organization or organization.status = 'active')
        and membership.user_id = target_actor_user_id
        and membership.role in ('owner', 'admin')
        and membership.revoked_at is null
    );
$$;

alter function loyalty_private.federation_actor_can_configure_v1(uuid, bigint, boolean)
  owner to loyalty_owner;
revoke all on function loyalty_private.federation_actor_can_configure_v1(uuid, bigint, boolean)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

create or replace function loyalty_private.organization_has_local_owner_recovery_v1(
  target_organization_id bigint
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from loyalty.organization_memberships as membership
    join auth.users as auth_user on auth_user.id = membership.user_id
    where membership.organization_id = target_organization_id
      and membership.role = 'owner'
      and membership.revoked_at is null
      and coalesce(auth_user.encrypted_password, '') <> ''
  );
$$;

revoke all on function loyalty_private.organization_has_local_owner_recovery_v1(bigint)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty_private.organization_has_local_owner_recovery_v1(bigint)
  to loyalty_owner;

create or replace function loyalty_private.organization_federation_entitlement_enabled_v1(
  target_organization_id bigint
)
returns boolean
language sql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
  select entitlement.enabled
  from loyalty.organizations as organization
  cross join lateral loyalty_private.resolve_organization_entitlement(
    organization.id,
    'enterprise.identity',
    organization.public_id::text,
    statement_timestamp()
  ) as entitlement
  where organization.id = target_organization_id;
$$;

alter function loyalty_private.organization_federation_entitlement_enabled_v1(bigint)
  owner to loyalty_owner;
revoke all on function loyalty_private.organization_federation_entitlement_enabled_v1(bigint)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty_private.organization_federation_entitlement_enabled_v1(bigint)
  to loyalty_owner;

create or replace function loyalty_private.prepare_organization_federation_source_v1(
  target_actor_user_id uuid,
  target_organization_public_id uuid,
  target_display_name text,
  target_protocol text,
  target_discovery_url text,
  target_client_id text,
  target_metadata_url text,
  target_expected_entity_id text,
  target_upstream_secret_sha256 text,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (
  source_public_id uuid,
  outcome text,
  revision bigint,
  status text,
  authentik_source_slug text,
  supabase_provider_identifier text,
  configuration_sha256 text
)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  organization_row loyalty.organizations%rowtype;
  existing_audit loyalty.admin_audit_events%rowtype;
  existing_source loyalty.organization_federation_sources%rowtype;
  created_source loyalty.organization_federation_sources%rowtype;
  source_uuid uuid := gen_random_uuid();
  opaque_suffix text := substr(replace(source_uuid::text, '-', ''), 1, 20);
  request_hash bytea;
  config_hash bytea;
  upstream_secret_digest bytea;
begin
  if target_actor_user_id is null
     or target_organization_public_id is null
     or target_display_name is null
     or target_display_name <> btrim(target_display_name)
     or length(target_display_name) not between 1 and 120
     or target_display_name ~ '[[:cntrl:]]'
     or target_protocol is null
     or target_protocol not in ('oidc', 'saml')
     or target_idempotency_key is null
     or target_idempotency_key <> btrim(target_idempotency_key)
     or length(target_idempotency_key) not between 1 and 255
     or target_correlation_id is null
     or (
       target_protocol = 'oidc' and (
         target_discovery_url is null
         or target_discovery_url !~ '^https://'
         or length(target_discovery_url) > 2048
         or target_client_id is null
         or target_client_id <> btrim(target_client_id)
         or length(target_client_id) not between 1 and 512
         or target_metadata_url is not null
         or target_expected_entity_id is not null
         or target_upstream_secret_sha256 is null
         or target_upstream_secret_sha256 !~ '^[a-f0-9]{64}$'
       )
     )
     or (
       target_protocol = 'saml' and (
         target_discovery_url is not null
         or target_client_id is not null
         or target_metadata_url is null
         or target_metadata_url !~ '^https://'
         or length(target_metadata_url) > 2048
         or (target_expected_entity_id is not null and (
           target_expected_entity_id <> btrim(target_expected_entity_id)
           or length(target_expected_entity_id) not between 1 and 2048
           or target_expected_entity_id ~ '[[:cntrl:]]'
         ))
         or target_upstream_secret_sha256 is not null
       )
     ) then
    raise exception using errcode = '22023', message = 'invalid federation source command';
  end if;

  select organization.* into organization_row
  from loyalty.organizations as organization
  where organization.public_id = target_organization_public_id
  for update;
  if not found
     or not loyalty_private.federation_actor_can_configure_v1(
       target_actor_user_id, organization_row.id, true
     ) then
    raise exception using errcode = '42501', message = 'federation source command not authorized';
  end if;

  upstream_secret_digest := case when target_upstream_secret_sha256 is null
    then null else decode(target_upstream_secret_sha256, 'hex') end;
  config_hash := extensions.digest(convert_to(jsonb_strip_nulls(jsonb_build_object(
    'protocol', target_protocol,
    'discoveryUrl', target_discovery_url,
    'clientId', target_client_id,
    'metadataUrl', target_metadata_url,
    'expectedEntityId', target_expected_entity_id
  ))::text, 'UTF8'), 'sha256');
  request_hash := extensions.digest(convert_to(jsonb_build_object(
    'organization', target_organization_public_id,
    'displayName', target_display_name,
    'configurationSha256', encode(config_hash, 'hex'),
    'upstreamSecretSha256', target_upstream_secret_sha256
  )::text, 'UTF8'), 'sha256');

  select audit.* into existing_audit
  from loyalty.admin_audit_events as audit
  where audit.organization_id = organization_row.id
    and audit.idempotency_key = target_idempotency_key;
  if found then
    if existing_audit.action <> 'federation.create'
       or existing_audit.actor_user_id <> target_actor_user_id
       or existing_audit.request_sha256 <> request_hash
       or existing_audit.correlation_id <> target_correlation_id then
      raise exception using errcode = '23514', message = 'federation command idempotency conflict';
    end if;
    select source.* into existing_source
    from loyalty.organization_federation_sources as source
    where source.organization_id = organization_row.id
      and source.public_id = existing_audit.resource_public_id;
    return query select existing_source.public_id, 'duplicate'::text,
      existing_source.lifecycle_revision, existing_source.status,
      existing_source.authentik_source_slug,
      existing_source.supabase_provider_identifier,
      encode(existing_source.configuration_sha256, 'hex');
    return;
  end if;

  if not loyalty_private.organization_federation_entitlement_enabled_v1(
    organization_row.id
  ) then
    raise exception using errcode = '42501',
      message = 'enterprise identity entitlement not enabled';
  end if;

  if (
    select count(*) from loyalty.organization_federation_sources as source
    where source.organization_id = organization_row.id
      and source.status <> 'retired'
  ) >= 5 then
    raise exception using errcode = '23514', message = 'federation source limit reached';
  end if;

  perform set_config('loyalty.federation_command', 'on', true);
  insert into loyalty.organization_federation_sources (
    public_id, organization_id, display_name, protocol,
    discovery_url, client_id, metadata_url, expected_entity_id,
    upstream_secret_sha256, configuration_sha256,
    authentik_source_slug, supabase_provider_identifier,
    created_by_user_id, updated_by_user_id
  ) values (
    source_uuid, organization_row.id, target_display_name, target_protocol,
    target_discovery_url, target_client_id, target_metadata_url, target_expected_entity_id,
    upstream_secret_digest, config_hash,
    'loyalty-' || opaque_suffix, 'custom:loyalty-' || opaque_suffix,
    target_actor_user_id, target_actor_user_id
  ) returning * into created_source;

  insert into loyalty.organization_federation_source_revisions (
    organization_id, source_id, revision, action, status,
    configuration_sha256, upstream_secret_sha256, external_outcome,
    actor_user_id, idempotency_key, request_sha256, correlation_id
  ) values (
    organization_row.id, created_source.id, 1, 'federation.create', 'draft',
    config_hash, upstream_secret_digest, 'none', target_actor_user_id,
    target_idempotency_key, request_hash, target_correlation_id
  );

  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id, metadata
  ) values (
    organization_row.id, target_actor_user_id, 'federation.create',
    'organization_federation_source', created_source.public_id,
    target_idempotency_key, request_hash, target_correlation_id,
    jsonb_build_object(
      'protocol', target_protocol,
      'revision', 1,
      'status', 'draft',
      'configurationSha256', encode(config_hash, 'hex')
    )
  );

  return query select created_source.public_id, 'created'::text, 1::bigint,
    'draft'::text, created_source.authentik_source_slug,
    created_source.supabase_provider_identifier, encode(config_hash, 'hex');
end;
$$;

create or replace function loyalty_private.record_organization_federation_validation_v1(
  target_actor_user_id uuid,
  target_source_public_id uuid,
  target_expected_revision bigint,
  target_configuration_sha256 text,
  target_document_sha256 text,
  target_issuer text,
  target_authorization_endpoint text,
  target_token_endpoint text,
  target_jwks_uri text,
  target_saml_sso_endpoint text,
  target_signing_fingerprints text[],
  target_broker_secret_sha256 text,
  target_authentik_source_public_id uuid,
  target_authentik_provider_id bigint,
  target_external_outcome text,
  target_external_detail_code text,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (source_public_id uuid, outcome text, revision bigint, status text)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  source_row loyalty.organization_federation_sources%rowtype;
  existing_audit loyalty.admin_audit_events%rowtype;
  request_hash bytea;
  next_status text;
  next_revision bigint;
  fingerprint_json jsonb;
begin
  if target_actor_user_id is null
     or target_source_public_id is null
     or target_expected_revision is null or target_expected_revision < 1
     or target_configuration_sha256 is null
     or target_configuration_sha256 !~ '^[a-f0-9]{64}$'
     or target_document_sha256 is null
     or target_document_sha256 !~ '^[a-f0-9]{64}$'
     or target_issuer is null
     or target_issuer <> btrim(target_issuer)
     or length(target_issuer) not between 1 and 2048
     or target_issuer ~ '[[:cntrl:]]'
     or target_external_outcome is null
     or target_external_outcome not in ('succeeded', 'failed', 'ambiguous')
     or target_external_detail_code is null
     or target_external_detail_code !~ '^[a-z][a-z0-9_.-]{2,79}$'
     or target_idempotency_key is null
     or target_idempotency_key <> btrim(target_idempotency_key)
     or length(target_idempotency_key) not between 1 and 255
     or target_correlation_id is null
     or coalesce(cardinality(target_signing_fingerprints), 0) not between 1 and 20
     or exists (
       select 1 from unnest(target_signing_fingerprints) as fingerprint
       where fingerprint !~ '^[a-f0-9]{64}$'
     )
     or target_broker_secret_sha256 is null
     or target_broker_secret_sha256 !~ '^[a-f0-9]{64}$'
     or (target_external_outcome = 'succeeded' and (
       target_authentik_source_public_id is null
       or target_authentik_provider_id is null
     )) then
    raise exception using errcode = '22023', message = 'invalid federation validation evidence';
  end if;

  select source.* into source_row
  from loyalty.organization_federation_sources as source
  where source.public_id = target_source_public_id
  for update;
  if not found
     or not loyalty_private.federation_actor_can_configure_v1(
       target_actor_user_id, source_row.organization_id, true
     ) then
    raise exception using errcode = '42501', message = 'federation validation not authorized';
  end if;

  if (source_row.protocol = 'oidc' and (
       target_issuer !~ '^https://'
       or
       target_authorization_endpoint is null
       or target_authorization_endpoint !~ '^https://'
       or target_token_endpoint is null
       or target_token_endpoint !~ '^https://'
       or target_jwks_uri is null
       or target_jwks_uri !~ '^https://'
       or target_saml_sso_endpoint is not null
     ))
     or (source_row.protocol = 'saml' and (
       target_authorization_endpoint is not null
       or target_token_endpoint is not null
       or target_jwks_uri is not null
       or target_saml_sso_endpoint is null
       or target_saml_sso_endpoint !~ '^https://'
     )) then
    raise exception using errcode = '22023', message = 'invalid federation protocol evidence';
  end if;

  fingerprint_json := to_jsonb(target_signing_fingerprints);
  request_hash := extensions.digest(convert_to(jsonb_build_object(
    'source', target_source_public_id,
    'expectedRevision', target_expected_revision,
    'configurationSha256', target_configuration_sha256,
    'documentSha256', target_document_sha256,
    'issuer', target_issuer,
    'authorizationEndpoint', target_authorization_endpoint,
    'tokenEndpoint', target_token_endpoint,
    'jwksUri', target_jwks_uri,
    'samlSsoEndpoint', target_saml_sso_endpoint,
    'signingFingerprints', fingerprint_json,
    'brokerSecretSha256', target_broker_secret_sha256,
    'authentikSourcePublicId', target_authentik_source_public_id,
    'authentikProviderId', target_authentik_provider_id,
    'externalOutcome', target_external_outcome,
    'externalDetailCode', target_external_detail_code
  )::text, 'UTF8'), 'sha256');

  select audit.* into existing_audit
  from loyalty.admin_audit_events as audit
  where audit.organization_id = source_row.organization_id
    and audit.idempotency_key = target_idempotency_key;
  if found then
    if existing_audit.action <> 'federation.validate'
       or existing_audit.resource_public_id <> target_source_public_id
       or existing_audit.actor_user_id <> target_actor_user_id
       or existing_audit.request_sha256 <> request_hash
       or existing_audit.correlation_id <> target_correlation_id then
      raise exception using errcode = '23514', message = 'federation command idempotency conflict';
    end if;
    return query select source_row.public_id, 'duplicate'::text,
      source_row.lifecycle_revision, source_row.status;
    return;
  end if;

  if source_row.lifecycle_revision <> target_expected_revision
     or source_row.status not in ('draft', 'review_required', 'disabled')
     or encode(source_row.configuration_sha256, 'hex') <> target_configuration_sha256 then
    raise exception using errcode = '40001', message = 'federation validation revision conflict';
  end if;

  next_revision := source_row.lifecycle_revision + 1;
  next_status := case when target_external_outcome = 'succeeded'
    then 'validated' else 'review_required' end;
  perform set_config('loyalty.federation_command', 'on', true);
  update loyalty.organization_federation_sources
  set status = next_status,
      lifecycle_revision = next_revision,
      document_sha256 = decode(target_document_sha256, 'hex'),
      validated_issuer = target_issuer,
      authorization_endpoint = target_authorization_endpoint,
      token_endpoint = target_token_endpoint,
      jwks_uri = target_jwks_uri,
      saml_sso_endpoint = target_saml_sso_endpoint,
      signing_fingerprints = fingerprint_json,
      validated_at = clock_timestamp(),
      broker_secret_sha256 = decode(target_broker_secret_sha256, 'hex'),
      authentik_source_public_id = target_authentik_source_public_id,
      authentik_provider_id = target_authentik_provider_id,
      external_outcome = target_external_outcome,
      external_detail_code = target_external_detail_code,
      updated_by_user_id = target_actor_user_id,
      updated_at = clock_timestamp()
  where id = source_row.id;

  insert into loyalty.organization_federation_source_revisions (
    organization_id, source_id, revision, action, status,
    configuration_sha256, document_sha256, upstream_secret_sha256,
    broker_secret_sha256, external_outcome, actor_user_id,
    idempotency_key, request_sha256, correlation_id
  ) values (
    source_row.organization_id, source_row.id, next_revision,
    'federation.validate', next_status, source_row.configuration_sha256,
    decode(target_document_sha256, 'hex'), source_row.upstream_secret_sha256,
    decode(target_broker_secret_sha256, 'hex'), target_external_outcome,
    target_actor_user_id, target_idempotency_key, request_hash,
    target_correlation_id
  );

  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id, metadata
  ) values (
    source_row.organization_id, target_actor_user_id, 'federation.validate',
    'organization_federation_source', source_row.public_id,
    target_idempotency_key, request_hash, target_correlation_id,
    jsonb_build_object(
      'protocol', source_row.protocol,
      'revision', next_revision,
      'status', next_status,
      'configurationSha256', target_configuration_sha256,
      'documentSha256', target_document_sha256,
      'externalOutcome', target_external_outcome,
      'externalDetailCode', target_external_detail_code
    )
  );

  return query select source_row.public_id, 'updated'::text,
    next_revision, next_status;
end;
$$;

create or replace function loyalty_private.begin_organization_federation_action_v1(
  target_actor_user_id uuid,
  target_organization_public_id uuid,
  target_source_public_id uuid,
  target_expected_revision bigint,
  target_action text,
  target_upstream_secret_sha256 text,
  target_reason text,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (source_public_id uuid, outcome text, revision bigint, status text)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  source_row loyalty.organization_federation_sources%rowtype;
  organization_row loyalty.organizations%rowtype;
  existing_audit loyalty.admin_audit_events%rowtype;
  request_hash bytea;
  next_revision bigint;
  next_status text;
  pending_secret bytea;
  require_active boolean;
begin
  if target_actor_user_id is null
     or target_organization_public_id is null
     or target_source_public_id is null
     or target_expected_revision is null or target_expected_revision < 1
     or target_action is null
     or target_action not in ('enable', 'disable', 'rotate_secret', 'retire')
     or target_reason is null
     or target_reason <> btrim(target_reason)
     or length(target_reason) not between 8 and 500
     or target_reason ~ '[[:cntrl:]]'
     or target_idempotency_key is null
     or target_idempotency_key <> btrim(target_idempotency_key)
     or length(target_idempotency_key) not between 1 and 255
     or target_correlation_id is null
     or ((target_action = 'rotate_secret') <> (target_upstream_secret_sha256 is not null))
     or (target_upstream_secret_sha256 is not null
       and target_upstream_secret_sha256 !~ '^[a-f0-9]{64}$') then
    raise exception using errcode = '22023', message = 'invalid federation lifecycle command';
  end if;

  select organization.* into organization_row
  from loyalty.organizations as organization
  where organization.public_id = target_organization_public_id
  for update;
  select source.* into source_row
  from loyalty.organization_federation_sources as source
  where source.public_id = target_source_public_id
    and source.organization_id = organization_row.id
  for update;
  require_active := target_action in ('enable', 'rotate_secret');
  if organization_row.id is null
     or source_row.id is null
     or not loyalty_private.federation_actor_can_configure_v1(
       target_actor_user_id, organization_row.id, require_active
     )
     or (not require_active and not exists (
       select 1 from loyalty.organization_memberships as membership
       where membership.organization_id = organization_row.id
         and membership.user_id = target_actor_user_id
         and membership.role = 'owner'
         and membership.revoked_at is null
     )) then
    raise exception using errcode = '42501', message = 'federation lifecycle command not authorized';
  end if;

  request_hash := extensions.digest(convert_to(jsonb_build_object(
    'organization', target_organization_public_id,
    'source', target_source_public_id,
    'expectedRevision', target_expected_revision,
    'action', target_action,
    'upstreamSecretSha256', target_upstream_secret_sha256,
    'reason', target_reason
  )::text, 'UTF8'), 'sha256');
  select audit.* into existing_audit
  from loyalty.admin_audit_events as audit
  where audit.organization_id = organization_row.id
    and audit.idempotency_key = target_idempotency_key;
  if found then
    if existing_audit.action <> 'federation.' || target_action || '.begin'
       or existing_audit.resource_public_id <> target_source_public_id
       or existing_audit.actor_user_id <> target_actor_user_id
       or existing_audit.request_sha256 <> request_hash
       or existing_audit.correlation_id <> target_correlation_id then
      raise exception using errcode = '23514', message = 'federation command idempotency conflict';
    end if;
    return query select source_row.public_id, 'duplicate'::text,
      source_row.lifecycle_revision, source_row.status;
    return;
  end if;

  if require_active
     and not loyalty_private.organization_federation_entitlement_enabled_v1(
       organization_row.id
     ) then
    raise exception using errcode = '42501',
      message = 'enterprise identity entitlement not enabled';
  end if;
  if target_action = 'enable' and exists (
    select 1
    from loyalty.organization_federation_sources as other_source
    where other_source.organization_id = organization_row.id
      and other_source.id <> source_row.id
      and (
        other_source.status in ('enabled', 'review_required')
        or other_source.pending_action is not null
      )
  ) then
    raise exception using errcode = '23514',
      message = 'another federation source requires disablement or review';
  end if;

  if source_row.lifecycle_revision <> target_expected_revision
     or source_row.pending_action is not null
     or source_row.status = 'retired'
     or (target_action = 'enable' and source_row.status not in ('validated', 'disabled'))
     or (target_action = 'disable' and source_row.status not in (
       'validated', 'enabled', 'review_required'
     ))
     or (target_action = 'rotate_secret' and (
       source_row.protocol <> 'oidc'
       or source_row.status not in ('validated', 'disabled', 'review_required')
     ))
     or (target_action = 'retire' and source_row.status = 'enabled') then
    raise exception using errcode = '40001', message = 'federation lifecycle revision conflict';
  end if;
  if target_action = 'enable'
     and not loyalty_private.organization_has_local_owner_recovery_v1(
       organization_row.id
     ) then
    raise exception using errcode = '23514', message = 'local owner recovery required before federation enablement';
  end if;

  pending_secret := case when target_upstream_secret_sha256 is null
    then null else decode(target_upstream_secret_sha256, 'hex') end;
  next_revision := source_row.lifecycle_revision + 1;
  next_status := case when target_action in ('disable', 'retire', 'rotate_secret')
    then 'disabled' else source_row.status end;
  perform set_config('loyalty.federation_command', 'on', true);
  update loyalty.organization_federation_sources
  set status = next_status,
      lifecycle_revision = next_revision,
      pending_action = target_action,
      pending_actor_user_id = target_actor_user_id,
      pending_correlation_id = target_correlation_id,
      pending_upstream_secret_sha256 = pending_secret,
      external_outcome = 'none',
      external_detail_code = null,
      updated_by_user_id = target_actor_user_id,
      updated_at = clock_timestamp()
  where id = source_row.id;

  insert into loyalty.organization_federation_source_revisions (
    organization_id, source_id, revision, action, status,
    configuration_sha256, document_sha256, upstream_secret_sha256,
    broker_secret_sha256, pending_action, external_outcome, actor_user_id,
    idempotency_key, request_sha256, correlation_id
  ) values (
    organization_row.id, source_row.id, next_revision,
    'federation.' || target_action || '.begin', next_status,
    source_row.configuration_sha256, source_row.document_sha256,
    source_row.upstream_secret_sha256, source_row.broker_secret_sha256,
    target_action, 'none', target_actor_user_id, target_idempotency_key,
    request_hash, target_correlation_id
  );

  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id, metadata
  ) values (
    organization_row.id, target_actor_user_id,
    'federation.' || target_action || '.begin',
    'organization_federation_source', source_row.public_id,
    target_idempotency_key, request_hash, target_correlation_id,
    jsonb_build_object(
      'revision', next_revision,
      'status', next_status,
      'pendingAction', target_action,
      'reason', target_reason
    )
  );

  return query select source_row.public_id, 'updated'::text,
    next_revision, next_status;
end;
$$;

create or replace function loyalty_private.recover_organization_federation_pending_v1(
  target_actor_user_id uuid,
  target_organization_public_id uuid,
  target_source_public_id uuid,
  target_expected_revision bigint,
  target_reason text,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (source_public_id uuid, outcome text, revision bigint, status text)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  organization_row loyalty.organizations%rowtype;
  source_row loyalty.organization_federation_sources%rowtype;
  existing_audit loyalty.admin_audit_events%rowtype;
  request_hash bytea;
  next_revision bigint;
begin
  if target_actor_user_id is null
     or target_organization_public_id is null
     or target_source_public_id is null
     or target_expected_revision is null or target_expected_revision < 1
     or target_reason is null
     or target_reason <> btrim(target_reason)
     or length(target_reason) not between 8 and 500
     or target_reason ~ '[[:cntrl:]]'
     or target_idempotency_key is null
     or target_idempotency_key <> btrim(target_idempotency_key)
     or length(target_idempotency_key) not between 1 and 255
     or target_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid federation recovery command';
  end if;

  select organization.* into organization_row
  from loyalty.organizations as organization
  where organization.public_id = target_organization_public_id
  for update;
  select source.* into source_row
  from loyalty.organization_federation_sources as source
  where source.public_id = target_source_public_id
    and source.organization_id = organization_row.id
  for update;
  if organization_row.id is null
     or source_row.id is null
     or not exists (
       select 1
       from loyalty.organization_memberships as membership
       where membership.organization_id = organization_row.id
         and membership.user_id = target_actor_user_id
         and membership.role = 'owner'
         and membership.revoked_at is null
     ) then
    raise exception using errcode = '42501', message = 'federation recovery not authorized';
  end if;

  request_hash := extensions.digest(convert_to(jsonb_build_object(
    'organization', target_organization_public_id,
    'source', target_source_public_id,
    'expectedRevision', target_expected_revision,
    'reason', target_reason
  )::text, 'UTF8'), 'sha256');
  select audit.* into existing_audit
  from loyalty.admin_audit_events as audit
  where audit.organization_id = organization_row.id
    and audit.idempotency_key = target_idempotency_key;
  if found then
    if existing_audit.action <> 'federation.recover'
       or existing_audit.resource_public_id <> target_source_public_id
       or existing_audit.actor_user_id <> target_actor_user_id
       or existing_audit.request_sha256 <> request_hash
       or existing_audit.correlation_id <> target_correlation_id then
      raise exception using errcode = '23514', message = 'federation command idempotency conflict';
    end if;
    return query select source_row.public_id, 'duplicate'::text,
      source_row.lifecycle_revision, source_row.status;
    return;
  end if;

  if source_row.lifecycle_revision <> target_expected_revision
     or source_row.pending_action is null
     or source_row.updated_at > statement_timestamp() - interval '5 minutes' then
    raise exception using errcode = '40001', message = 'federation recovery window not reached';
  end if;

  next_revision := source_row.lifecycle_revision + 1;
  perform set_config('loyalty.federation_command', 'on', true);
  update loyalty.organization_federation_sources
  set status = 'review_required',
      lifecycle_revision = next_revision,
      pending_action = null,
      pending_actor_user_id = null,
      pending_correlation_id = null,
      pending_upstream_secret_sha256 = null,
      external_outcome = 'ambiguous',
      external_detail_code = 'orchestration_interrupted',
      updated_by_user_id = target_actor_user_id,
      updated_at = clock_timestamp()
  where id = source_row.id;

  insert into loyalty.organization_federation_source_revisions (
    organization_id, source_id, revision, action, status,
    configuration_sha256, document_sha256, upstream_secret_sha256,
    broker_secret_sha256, external_outcome, actor_user_id,
    idempotency_key, request_sha256, correlation_id
  ) values (
    organization_row.id, source_row.id, next_revision,
    'federation.recover', 'review_required',
    source_row.configuration_sha256, source_row.document_sha256,
    source_row.upstream_secret_sha256, source_row.broker_secret_sha256,
    'ambiguous', target_actor_user_id, target_idempotency_key,
    request_hash, target_correlation_id
  );

  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id, metadata
  ) values (
    organization_row.id, target_actor_user_id, 'federation.recover',
    'organization_federation_source', source_row.public_id,
    target_idempotency_key, request_hash, target_correlation_id,
    jsonb_build_object(
      'revision', next_revision,
      'status', 'review_required',
      'interruptedAction', source_row.pending_action,
      'externalOutcome', 'ambiguous',
      'externalDetailCode', 'orchestration_interrupted',
      'reason', target_reason
    )
  );

  return query select source_row.public_id, 'updated'::text,
    next_revision, 'review_required'::text;
end;
$$;

create or replace function loyalty_private.complete_organization_federation_action_v1(
  target_actor_user_id uuid,
  target_source_public_id uuid,
  target_expected_revision bigint,
  target_action text,
  target_external_outcome text,
  target_external_detail_code text,
  target_broker_secret_sha256 text,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (source_public_id uuid, outcome text, revision bigint, status text)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  source_row loyalty.organization_federation_sources%rowtype;
  existing_audit loyalty.admin_audit_events%rowtype;
  request_hash bytea;
  next_revision bigint;
  next_status text;
  next_upstream_secret bytea;
  next_broker_secret bytea;
begin
  if target_actor_user_id is null
     or target_source_public_id is null
     or target_expected_revision is null or target_expected_revision < 1
     or target_action not in ('enable', 'disable', 'rotate_secret', 'retire')
     or target_external_outcome is null
     or target_external_outcome not in ('succeeded', 'failed', 'ambiguous')
     or target_external_detail_code is null
     or target_external_detail_code !~ '^[a-z][a-z0-9_.-]{2,79}$'
     or (target_broker_secret_sha256 is not null
       and target_broker_secret_sha256 !~ '^[a-f0-9]{64}$')
     or target_idempotency_key is null
     or target_idempotency_key <> btrim(target_idempotency_key)
     or length(target_idempotency_key) not between 1 and 255
     or target_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid federation completion';
  end if;

  select source.* into source_row
  from loyalty.organization_federation_sources as source
  where source.public_id = target_source_public_id
  for update;
  if not found
     or not loyalty_private.federation_actor_can_configure_v1(
       target_actor_user_id, source_row.organization_id, false
     ) then
    raise exception using errcode = '42501', message = 'federation completion not authorized';
  end if;

  request_hash := extensions.digest(convert_to(jsonb_build_object(
    'source', target_source_public_id,
    'expectedRevision', target_expected_revision,
    'action', target_action,
    'externalOutcome', target_external_outcome,
    'externalDetailCode', target_external_detail_code,
    'brokerSecretSha256', target_broker_secret_sha256
  )::text, 'UTF8'), 'sha256');
  select audit.* into existing_audit
  from loyalty.admin_audit_events as audit
  where audit.organization_id = source_row.organization_id
    and audit.idempotency_key = target_idempotency_key;
  if found then
    if existing_audit.action <> 'federation.' || target_action || '.complete'
       or existing_audit.resource_public_id <> target_source_public_id
       or existing_audit.actor_user_id <> target_actor_user_id
       or existing_audit.request_sha256 <> request_hash
       or existing_audit.correlation_id <> target_correlation_id then
      raise exception using errcode = '23514', message = 'federation command idempotency conflict';
    end if;
    return query select source_row.public_id, 'duplicate'::text,
      source_row.lifecycle_revision, source_row.status;
    return;
  end if;

  if source_row.lifecycle_revision <> target_expected_revision
     or source_row.pending_action is distinct from target_action then
    raise exception using errcode = '40001', message = 'federation completion revision conflict';
  end if;
  if source_row.pending_actor_user_id is distinct from target_actor_user_id
     or source_row.pending_correlation_id is distinct from target_correlation_id then
    raise exception using errcode = '23514',
      message = 'federation completion does not match pending operation';
  end if;
  if target_action = 'enable' and (
    not exists (
      select 1 from loyalty.organizations as organization
      where organization.id = source_row.organization_id
        and organization.status = 'active'
        and organization.offboarded_at is null
    )
    or not loyalty_private.organization_has_local_owner_recovery_v1(
      source_row.organization_id
    )
  ) then
    raise exception using errcode = '23514', message = 'local owner recovery required before federation enablement';
  end if;

  next_revision := source_row.lifecycle_revision + 1;
  next_status := case
    when target_external_outcome <> 'succeeded' then 'review_required'
    when target_action = 'enable' then 'enabled'
    when target_action = 'retire' then 'retired'
    when target_action in ('disable', 'rotate_secret') then 'disabled'
  end;
  next_upstream_secret := case
    when target_action = 'rotate_secret' and target_external_outcome = 'succeeded'
      then source_row.pending_upstream_secret_sha256
    else source_row.upstream_secret_sha256
  end;
  next_broker_secret := case when target_broker_secret_sha256 is null
    then source_row.broker_secret_sha256
    else decode(target_broker_secret_sha256, 'hex') end;

  perform set_config('loyalty.federation_command', 'on', true);
  update loyalty.organization_federation_sources
  set status = next_status,
      lifecycle_revision = next_revision,
      upstream_secret_sha256 = next_upstream_secret,
      broker_secret_sha256 = next_broker_secret,
      pending_action = null,
      pending_actor_user_id = null,
      pending_correlation_id = null,
      pending_upstream_secret_sha256 = null,
      external_outcome = target_external_outcome,
      external_detail_code = target_external_detail_code,
      updated_by_user_id = target_actor_user_id,
      updated_at = clock_timestamp()
  where id = source_row.id;

  insert into loyalty.organization_federation_source_revisions (
    organization_id, source_id, revision, action, status,
    configuration_sha256, document_sha256, upstream_secret_sha256,
    broker_secret_sha256, external_outcome, actor_user_id,
    idempotency_key, request_sha256, correlation_id
  ) values (
    source_row.organization_id, source_row.id, next_revision,
    'federation.' || target_action || '.complete', next_status,
    source_row.configuration_sha256, source_row.document_sha256,
    next_upstream_secret, next_broker_secret, target_external_outcome,
    target_actor_user_id, target_idempotency_key, request_hash,
    target_correlation_id
  );

  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id, metadata
  ) values (
    source_row.organization_id, target_actor_user_id,
    'federation.' || target_action || '.complete',
    'organization_federation_source', source_row.public_id,
    target_idempotency_key, request_hash, target_correlation_id,
    jsonb_build_object(
      'revision', next_revision,
      'status', next_status,
      'externalOutcome', target_external_outcome,
      'externalDetailCode', target_external_detail_code
    )
  );

  return query select source_row.public_id, 'updated'::text,
    next_revision, next_status;
end;
$$;

create or replace function loyalty_private.organization_federation_orchestration_v1(
  target_actor_user_id uuid,
  target_organization_public_id uuid,
  target_source_public_id uuid
)
returns table (
  source_public_id uuid,
  protocol text,
  status text,
  lifecycle_revision bigint,
  authentik_source_slug text,
  supabase_provider_identifier text,
  pending_action text,
  configuration_sha256 text,
  configuration jsonb,
  validation_evidence jsonb
)
language sql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
  select source.public_id, source.protocol, source.status,
    source.lifecycle_revision, source.authentik_source_slug,
    source.supabase_provider_identifier, source.pending_action,
    encode(source.configuration_sha256, 'hex'),
    case when source.protocol = 'oidc'
      then jsonb_build_object(
        'protocol', 'oidc',
        'discoveryUrl', source.discovery_url,
        'clientId', source.client_id
      )
      else jsonb_build_object(
        'protocol', 'saml',
        'metadataUrl', source.metadata_url,
        'expectedEntityId', source.expected_entity_id
      )
    end,
    case when source.validated_at is null then null else jsonb_build_object(
      'schemaVersion', '1',
      'protocol', source.protocol,
      'configurationSha256', encode(source.configuration_sha256, 'hex'),
      'documentSha256', encode(source.document_sha256, 'hex'),
      'issuer', source.validated_issuer,
      'authorizationEndpoint', source.authorization_endpoint,
      'tokenEndpoint', source.token_endpoint,
      'jwksUri', source.jwks_uri,
      'ssoEndpoint', source.saml_sso_endpoint,
      'signingFingerprints', source.signing_fingerprints,
      'validatedAt', source.validated_at
    ) end
  from loyalty.organizations as organization
  join loyalty.organization_federation_sources as source
    on source.organization_id = organization.id
  where target_actor_user_id is not null
    and organization.public_id = target_organization_public_id
    and source.public_id = target_source_public_id
    and loyalty_private.federation_actor_can_configure_v1(
      target_actor_user_id, organization.id, false
    );
$$;

create or replace function loyalty.organization_federation_workspace_v1(
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
  source_documents jsonb;
begin
  select organization.* into organization_row
  from loyalty.organizations as organization
  where organization.public_id = target_organization_public_id;
  select membership.* into membership_row
  from loyalty.organization_memberships as membership
  where membership.organization_id = organization_row.id
    and membership.user_id = request_actor
    and membership.revoked_at is null;
  if organization_row.id is null or membership_row.id is null then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', source.public_id,
    'displayName', source.display_name,
    'protocol', source.protocol,
    'status', source.status,
    'revision', source.lifecycle_revision,
    'configuration', case when source.protocol = 'oidc'
      then jsonb_build_object(
        'protocol', 'oidc',
        'discoveryUrl', source.discovery_url,
        'clientId', source.client_id
      )
      else jsonb_build_object(
        'protocol', 'saml',
        'metadataUrl', source.metadata_url,
        'expectedEntityId', source.expected_entity_id
      ) end,
    'hasClientSecret', source.upstream_secret_sha256 is not null,
    'validation', case when source.validated_at is null then null else
      jsonb_build_object(
        'schemaVersion', '1',
        'protocol', source.protocol,
        'configurationSha256', encode(source.configuration_sha256, 'hex'),
        'documentSha256', encode(source.document_sha256, 'hex'),
        'issuer', source.validated_issuer,
        'authorizationEndpoint', source.authorization_endpoint,
        'tokenEndpoint', source.token_endpoint,
        'jwksUri', source.jwks_uri,
        'ssoEndpoint', source.saml_sso_endpoint,
        'signingFingerprints', source.signing_fingerprints,
        'validatedAt', source.validated_at
      ) end,
    'pendingAction', source.pending_action,
    'lastOutcome', source.external_outcome,
    'createdAt', source.created_at,
    'updatedAt', source.updated_at
  ) order by source.created_at desc, source.id desc), '[]'::jsonb)
  into source_documents
  from (
    select candidate.*
    from loyalty.organization_federation_sources as candidate
    where candidate.organization_id = organization_row.id
    order by candidate.created_at desc, candidate.id desc
    limit 5
  ) as source;

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
    'localPasswordRecoveryAvailable',
      loyalty_private.organization_has_local_owner_recovery_v1(organization_row.id),
    'sources', source_documents
  );
end;
$$;

create or replace function loyalty.resolve_organization_federation_login_v1(
  target_organization_slug text
)
returns table (provider text)
language sql
stable
security definer
set search_path = ''
set statement_timeout = '2s'
as $$
  select source.supabase_provider_identifier
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

alter function loyalty_private.prepare_organization_federation_source_v1(
  uuid, uuid, text, text, text, text, text, text, text, text, uuid
) owner to loyalty_owner;
alter function loyalty_private.record_organization_federation_validation_v1(
  uuid, uuid, bigint, text, text, text, text, text, text, text,
  text[], text, uuid, bigint, text, text, text, uuid
) owner to loyalty_owner;
alter function loyalty_private.begin_organization_federation_action_v1(
  uuid, uuid, uuid, bigint, text, text, text, text, uuid
) owner to loyalty_owner;
alter function loyalty_private.recover_organization_federation_pending_v1(
  uuid, uuid, uuid, bigint, text, text, uuid
) owner to loyalty_owner;
alter function loyalty_private.complete_organization_federation_action_v1(
  uuid, uuid, bigint, text, text, text, text, text, uuid
) owner to loyalty_owner;
alter function loyalty_private.organization_federation_orchestration_v1(
  uuid, uuid, uuid
) owner to loyalty_owner;
alter function loyalty.organization_federation_workspace_v1(uuid)
  owner to loyalty_owner;
alter function loyalty.resolve_organization_federation_login_v1(text)
  owner to loyalty_owner;

revoke all on function loyalty_private.prepare_organization_federation_source_v1(
  uuid, uuid, text, text, text, text, text, text, text, text, uuid
) from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function loyalty_private.record_organization_federation_validation_v1(
  uuid, uuid, bigint, text, text, text, text, text, text, text,
  text[], text, uuid, bigint, text, text, text, uuid
) from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function loyalty_private.begin_organization_federation_action_v1(
  uuid, uuid, uuid, bigint, text, text, text, text, uuid
) from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function loyalty_private.recover_organization_federation_pending_v1(
  uuid, uuid, uuid, bigint, text, text, uuid
) from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function loyalty_private.complete_organization_federation_action_v1(
  uuid, uuid, bigint, text, text, text, text, text, uuid
) from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function loyalty_private.organization_federation_orchestration_v1(
  uuid, uuid, uuid
) from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function loyalty.organization_federation_workspace_v1(uuid)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function loyalty.resolve_organization_federation_login_v1(text)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

grant execute on function loyalty_private.prepare_organization_federation_source_v1(
  uuid, uuid, text, text, text, text, text, text, text, text, uuid
) to loyalty_runtime;
grant execute on function loyalty_private.record_organization_federation_validation_v1(
  uuid, uuid, bigint, text, text, text, text, text, text, text,
  text[], text, uuid, bigint, text, text, text, uuid
) to loyalty_runtime;
grant execute on function loyalty_private.begin_organization_federation_action_v1(
  uuid, uuid, uuid, bigint, text, text, text, text, uuid
) to loyalty_runtime;
grant execute on function loyalty_private.recover_organization_federation_pending_v1(
  uuid, uuid, uuid, bigint, text, text, uuid
) to loyalty_runtime;
grant execute on function loyalty_private.complete_organization_federation_action_v1(
  uuid, uuid, bigint, text, text, text, text, text, uuid
) to loyalty_runtime;
grant execute on function loyalty_private.organization_federation_orchestration_v1(
  uuid, uuid, uuid
) to loyalty_runtime;
grant execute on function loyalty.organization_federation_workspace_v1(uuid)
  to authenticated;
grant execute on function loyalty.resolve_organization_federation_login_v1(text)
  to anon, authenticated;

comment on function loyalty_private.organization_has_local_owner_recovery_v1(bigint) is
  'Migration-admin-owned narrow Auth bridge proving one active owner has a local password; callers receive only a boolean and runtime roles cannot execute it directly.';
comment on function loyalty_private.organization_federation_entitlement_enabled_v1(bigint) is
  'Database-authoritative enterprise.identity decision for new federation configuration, enablement, rotation, and merchant rollout visibility; existing login and recovery paths do not depend on it.';
comment on function loyalty_private.recover_organization_federation_pending_v1(uuid, uuid, uuid, bigint, text, text, uuid) is
  'Owner-only delayed recovery for an interrupted external federation orchestration; records an immutable ambiguous outcome, clears no confirmed secret, and exposes no login provider.';
comment on function loyalty_private.organization_federation_orchestration_v1(uuid, uuid, uuid) is
  'Trusted runtime projection of opaque external selectors, public source configuration, and exact revalidation evidence after a live owner/admin membership check; returns no secret, identity claim, email, domain, or group.';
