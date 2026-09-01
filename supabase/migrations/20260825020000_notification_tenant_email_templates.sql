-- M08-S05 immutable organization-owned English SMTP template versions.
-- Existing system versions and accepted deliveries retain their exact row.

create or replace function loyalty_private.notification_email_template_tokens_v1(
  target_event_type text
)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case target_event_type
    when 'loyalty.points.earned'
      then array['points', 'pendingUntil']::text[]
    when 'loyalty.points.released'
      then array['points', 'availableBalance']::text[]
    when 'loyalty.points.expiring'
      then array['points', 'expiresAt', 'daysRemaining']::text[]
    when 'loyalty.reward.changed'
      then array['rewardReservationId', 'rewardCode', 'state']::text[]
    when 'loyalty.tier.changed'
      then array['fromTierCode', 'toTierCode', 'effectiveAt']::text[]
    when 'loyalty.referral.changed'
      then array['referralId', 'party', 'state']::text[]
    else null::text[]
  end;
$$;

create or replace function loyalty_private.notification_email_plain_html_v1(
  target_text_template text
)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select '<p>' || pg_catalog.replace(
    pg_catalog.replace(
      pg_catalog.replace(
        pg_catalog.replace(target_text_template, '&', '&amp;'),
        '<', '&lt;'
      ),
      '>', '&gt;'
    ),
    pg_catalog.chr(10), '<br>'
  ) || '</p>';
$$;

create or replace function loyalty_private.notification_email_template_content_valid_v1(
  target_event_type text,
  target_subject_template text,
  target_text_template text
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  allowed_tokens text[] :=
    loyalty_private.notification_email_template_tokens_v1(target_event_type);
  remaining_content text;
  allowed_token text;
begin
  if allowed_tokens is null
    or target_subject_template is null
    or pg_catalog.length(target_subject_template) not between 1 and 200
    or target_subject_template ~ '[[:cntrl:]]'
    or target_text_template is null
    or pg_catalog.length(target_text_template) not between 1 and 4000
    or pg_catalog.translate(
      target_text_template,
      pg_catalog.chr(9) || pg_catalog.chr(10) || pg_catalog.chr(13), ''
    ) ~ '[[:cntrl:]]'
    or target_text_template ~ '[<>]'
    or target_text_template ~* '([a-z][a-z0-9+.-]*://|(^|[^a-z0-9])www[.])' then
    return false;
  end if;
  remaining_content := target_subject_template || pg_catalog.chr(10) ||
    target_text_template;
  foreach allowed_token in array allowed_tokens loop
    remaining_content := pg_catalog.replace(
      remaining_content, '{{' || allowed_token || '}}', ''
    );
  end loop;
  return pg_catalog.strpos(remaining_content, '{{') = 0
    and pg_catalog.strpos(remaining_content, '}}') = 0;
end;
$$;

alter table loyalty_private.notification_email_template_versions
  add column organization_id bigint
    references loyalty.organizations(id) on delete restrict,
  add column created_by_user_id uuid
    references auth.users(id) on delete restrict;

do $$
declare
  target_constraint_name text;
  dropped_constraint_count integer := 0;
begin
  for target_constraint_name in
    select constraint_row.conname
    from pg_catalog.pg_constraint as constraint_row
    where constraint_row.conrelid =
      'loyalty_private.notification_email_template_versions'::regclass
      and constraint_row.contype = 'u'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) in (
        'UNIQUE (template_code, template_version)',
        'UNIQUE (event_type, template_version)'
      )
  loop
    execute pg_catalog.format(
      'alter table loyalty_private.notification_email_template_versions drop constraint %I',
      target_constraint_name
    );
    dropped_constraint_count := dropped_constraint_count + 1;
  end loop;
  if dropped_constraint_count <> 2 then
    raise exception using errcode = '55000',
      message = 'notification template uniqueness baseline not found';
  end if;
end;
$$;

alter table loyalty_private.notification_email_template_versions
  add constraint notification_email_template_versions_authority_check check (
    (organization_id is null and created_by_user_id is null)
    or (organization_id is not null and created_by_user_id is not null)
  ),
  add constraint notification_email_template_versions_tenant_content_check check (
    organization_id is null or (
      loyalty_private.notification_email_template_content_valid_v1(
        event_type, subject_template, text_template
      )
      and html_template =
        loyalty_private.notification_email_plain_html_v1(text_template)
    )
  ),
  add unique (organization_id, id);

create unique index notification_email_system_template_code_version_uidx
  on loyalty_private.notification_email_template_versions(
    template_code, template_version
  ) where organization_id is null;
create unique index notification_email_system_event_version_uidx
  on loyalty_private.notification_email_template_versions(
    event_type, template_version
  ) where organization_id is null;
create unique index notification_email_organization_event_version_uidx
  on loyalty_private.notification_email_template_versions(
    organization_id, event_type, template_version
  ) where organization_id is not null;

create table loyalty_private.notification_email_template_bindings (
  organization_id bigint not null
    references loyalty.organizations(id) on delete restrict,
  event_type text not null,
  template_id bigint not null,
  bound_by_user_id uuid not null references auth.users(id) on delete restrict,
  bound_at timestamptz not null default now(),
  primary key (organization_id, event_type),
  foreign key (organization_id, template_id)
    references loyalty_private.notification_email_template_versions(
      organization_id, id
    ) on delete restrict,
  check (event_type in (
    'loyalty.points.earned', 'loyalty.points.released',
    'loyalty.points.expiring', 'loyalty.reward.changed',
    'loyalty.tier.changed', 'loyalty.referral.changed'
  ))
);

create or replace function loyalty_private.enqueue_self_hosted_smtp_notification_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_deployment_mode text;
  target_enabled boolean;
  target_template_id bigint;
  eligibility_checked_at timestamptz := pg_catalog.statement_timestamp();
begin
  if new.purpose <> 'loyalty_transactional' then
    return new;
  end if;
  select entitlement.deployment_mode, entitlement.enabled
    into target_deployment_mode, target_enabled
  from loyalty_private.resolve_organization_entitlement(
    new.organization_id, 'notifications', new.public_id::text,
    eligibility_checked_at
  ) as entitlement;
  if target_deployment_mode <> 'self_hosted' or not target_enabled then
    return new;
  end if;
  select binding.template_id into target_template_id
  from loyalty_private.notification_email_template_bindings as binding
  where binding.organization_id = new.organization_id
    and binding.event_type = new.event_type;
  if target_template_id is null then
    select template.id into strict target_template_id
    from loyalty_private.notification_email_template_versions as template
    where template.organization_id is null
      and template.event_type = new.event_type
      and template.template_version = 1;
  end if;
  insert into loyalty_private.notification_smtp_deliveries (
    organization_id, notification_event_id, template_id, next_attempt_at
  ) values (
    new.organization_id, new.id, target_template_id, new.created_at
  ) on conflict (notification_event_id, provider, channel) do nothing;
  return new;
end;
$$;

create or replace function loyalty.publish_notification_email_template_command(
  target_workspace_public_id uuid,
  target_event_type text,
  target_subject_template text,
  target_text_template text,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (
  template_id uuid,
  template_version integer,
  outcome text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := loyalty_private.request_user_id();
  target_workspace loyalty.workspaces%rowtype;
  system_template loyalty_private.notification_email_template_versions%rowtype;
  created_template loyalty_private.notification_email_template_versions%rowtype;
  existing_audit loyalty.admin_audit_events%rowtype;
  entitlement_enabled boolean;
  request_hash bytea;
  next_template_version integer;
begin
  if actor_user_id is null or target_workspace_public_id is null
    or not loyalty_private.notification_email_template_content_valid_v1(
      target_event_type, target_subject_template, target_text_template
    )
    or target_idempotency_key is null
    or pg_catalog.length(target_idempotency_key) not between 1 and 200
    or target_idempotency_key !~ '^[A-Za-z0-9:_-]+$'
    or target_correlation_id is null then
    raise exception using errcode = '22023',
      message = 'invalid notification template command';
  end if;
  select workspace.* into target_workspace
  from loyalty.workspaces as workspace
  where workspace.public_id = target_workspace_public_id
    and workspace.status = 'active'
    and loyalty_private.has_organization_role(
      workspace.organization_id, array['owner', 'admin']::text[]
    );
  if not found then
    raise exception using errcode = '42501',
      message = 'notification template command not authorized';
  end if;
  request_hash := extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object(
      'version', '1',
      'workspaceId', target_workspace_public_id,
      'eventType', target_event_type,
      'subjectTemplate', target_subject_template,
      'textTemplate', target_text_template
    )::text, 'UTF8'
  ), 'sha256');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'notification-template-command|' ||
      target_workspace.organization_id::text || '|' || target_idempotency_key,
    0
  ));
  select audit.* into existing_audit
  from loyalty.admin_audit_events as audit
  where audit.organization_id = target_workspace.organization_id
    and audit.idempotency_key = target_idempotency_key;
  if found then
    if existing_audit.action <> 'notification.template.publish'
      or existing_audit.request_sha256 <> request_hash then
      raise exception using errcode = '23514',
        message = 'notification template command idempotency conflict';
    end if;
    return query
    select version.public_id, version.template_version, 'duplicate'::text
    from loyalty_private.notification_email_template_versions as version
    where version.organization_id = target_workspace.organization_id
      and version.public_id = existing_audit.resource_public_id;
    return;
  end if;
  select entitlement.enabled into strict entitlement_enabled
  from loyalty_private.resolve_organization_entitlement(
    target_workspace.organization_id, 'notifications',
    'workspace:' || target_workspace.public_id::text,
    pg_catalog.statement_timestamp()
  ) as entitlement;
  if not entitlement_enabled then
    raise exception using errcode = '42501',
      message = 'notifications are not enabled for this organization';
  end if;
  select version.* into strict system_template
  from loyalty_private.notification_email_template_versions as version
  where version.organization_id is null
    and version.event_type = target_event_type
    and version.template_version = 1;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'notification-template-version|' ||
      target_workspace.organization_id::text || '|' || target_event_type, 0
  ));
  select coalesce(pg_catalog.max(version.template_version), 0) + 1
    into next_template_version
  from loyalty_private.notification_email_template_versions as version
  where version.organization_id = target_workspace.organization_id
    and version.event_type = target_event_type;
  insert into loyalty_private.notification_email_template_versions (
    organization_id, created_by_user_id, template_code, template_version,
    event_type, subject_template, text_template, html_template
  ) values (
    target_workspace.organization_id, actor_user_id,
    system_template.template_code, next_template_version, target_event_type,
    target_subject_template, target_text_template,
    loyalty_private.notification_email_plain_html_v1(target_text_template)
  ) returning * into strict created_template;
  insert into loyalty_private.notification_email_template_bindings (
    organization_id, event_type, template_id, bound_by_user_id
  ) values (
    target_workspace.organization_id, target_event_type,
    created_template.id, actor_user_id
  ) on conflict (organization_id, event_type) do update
  set template_id = excluded.template_id,
    bound_by_user_id = excluded.bound_by_user_id,
    bound_at = pg_catalog.statement_timestamp();
  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id,
    metadata
  ) values (
    target_workspace.organization_id, actor_user_id,
    'notification.template.publish', 'notification_email_template',
    created_template.public_id, target_idempotency_key, request_hash,
    target_correlation_id, pg_catalog.jsonb_build_object(
      'eventType', target_event_type,
      'templateVersion', next_template_version,
      'templateSha256', pg_catalog.encode(
        created_template.template_sha256, 'hex'
      )
    )
  );
  return query select created_template.public_id,
    created_template.template_version, 'created'::text;
end;
$$;

alter table loyalty_private.notification_email_template_bindings
  owner to loyalty_owner;
alter function loyalty_private.notification_email_template_tokens_v1(text)
  owner to loyalty_owner;
alter function loyalty_private.notification_email_plain_html_v1(text)
  owner to loyalty_owner;
alter function loyalty_private.notification_email_template_content_valid_v1(
  text, text, text
) owner to loyalty_owner;
alter function loyalty.publish_notification_email_template_command(
  uuid, text, text, text, text, uuid
) owner to loyalty_owner;

alter table loyalty_private.notification_email_template_bindings
  enable row level security;

revoke all on loyalty_private.notification_email_template_bindings
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function
  loyalty_private.notification_email_template_tokens_v1(text),
  loyalty_private.notification_email_plain_html_v1(text),
  loyalty_private.notification_email_template_content_valid_v1(text, text, text),
  loyalty.publish_notification_email_template_command(
    uuid, text, text, text, text, uuid
  )
from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty.publish_notification_email_template_command(
  uuid, text, text, text, text, uuid
) to authenticated;

comment on table loyalty_private.notification_email_template_bindings is
  'Private current projection; immutable accepted deliveries retain their exact system or organization template row.';
comment on function loyalty.publish_notification_email_template_command(
  uuid, text, text, text, text, uuid
) is
  'Publishes and activates one immutable English tenant template using Auth-derived tenant and actor authority.';
