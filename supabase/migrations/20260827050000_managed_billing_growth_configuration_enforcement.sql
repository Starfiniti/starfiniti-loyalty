-- M14-S05B database-authoritative growth/configuration enforcement.
-- Merchant authoring is denied only at reviewed mutation roots. Operational,
-- recovery, value, export, customer-access, and checkout paths are not guarded.

create table loyalty_private.managed_growth_configuration_boundaries (
  boundary_key text primary key,
  relation_schema text not null,
  relation_name text not null,
  capability_key text not null,
  guarded_operations text[] not null,
  state_column text,
  safe_insert_states text[] not null default array[]::text[],
  safe_update_states text[] not null default array[]::text[],
  command_names text[] not null,
  created_at timestamptz not null default now(),
  check (boundary_key ~ '^[a-z][a-z0-9_.-]{2,119}$'),
  check (relation_schema in ('loyalty', 'loyalty_private')),
  check (relation_name ~ '^[a-z][a-z0-9_]{2,119}$'),
  check (capability_key ~ '^[a-z][a-z0-9_.-]{2,119}$'),
  check (
    cardinality(guarded_operations) between 1 and 3
    and guarded_operations <@ array['INSERT', 'UPDATE', 'DELETE']::text[]
    and array_position(guarded_operations, null) is null
  ),
  check (
    (state_column is null
      and cardinality(safe_insert_states) = 0
      and cardinality(safe_update_states) = 0)
    or (state_column ~ '^[a-z][a-z0-9_]{1,62}$')
  ),
  check (cardinality(command_names) between 1 and 20),
  check (array_position(command_names, null) is null),
  unique (relation_schema, relation_name)
);

alter table loyalty_private.managed_growth_configuration_boundaries
  owner to loyalty_owner;
alter table loyalty_private.managed_growth_configuration_boundaries
  enable row level security;

create trigger managed_growth_configuration_boundaries_immutable
before update or delete
on loyalty_private.managed_growth_configuration_boundaries
for each row execute function loyalty_private.reject_immutable_change();

insert into loyalty_private.managed_growth_configuration_boundaries (
  boundary_key, relation_schema, relation_name, capability_key,
  guarded_operations, state_column, safe_insert_states,
  safe_update_states, command_names
) values
  ('programme.root', 'loyalty', 'programmes', 'programme.v2',
    array['INSERT'], null, array[]::text[], array[]::text[],
    array['create_programme_command']),
  ('programme.version', 'loyalty', 'programme_versions', 'programme.v2',
    array['INSERT','UPDATE'], 'status', array[]::text[], array[]::text[],
    array['create_programme_draft_command','publish_programme_version_command',
      'schedule_programme_version_command']),
  ('experience.theme', 'loyalty', 'experience_themes',
    'storefront.experience', array['INSERT','UPDATE'], null,
    array[]::text[], array[]::text[],
    array['save_experience_theme_command','save_experience_theme_v2_command']),
  ('experience.copy', 'loyalty', 'experience_translations',
    'storefront.experience', array['INSERT','UPDATE'], null,
    array[]::text[], array[]::text[],
    array['save_experience_translation_command','save_experience_copy_v2_command']),
  ('vip.manual_override', 'loyalty', 'tier_manual_overrides',
    'vip.advanced', array['INSERT'], null,
    array[]::text[], array[]::text[],
    array['set_customer_tier_override_command']),
  ('campaign.audience', 'loyalty', 'audiences', 'campaigns',
    array['INSERT'], null, array[]::text[], array[]::text[],
    array['create_audience_draft_command']),
  ('campaign.audience_version', 'loyalty', 'audience_versions', 'campaigns',
    array['INSERT','UPDATE'], 'status', array[]::text[], array[]::text[],
    array['create_audience_draft_command','publish_audience_version_command']),
  ('campaign.audience_snapshot', 'loyalty', 'audience_snapshots', 'campaigns',
    array['INSERT','UPDATE'], 'state', array[]::text[], array[]::text[],
    array['create_audience_snapshot_command']),
  ('campaign.root', 'loyalty', 'campaigns', 'campaigns',
    array['INSERT'], null, array[]::text[], array[]::text[],
    array['create_campaign_draft_command']),
  ('campaign.version', 'loyalty', 'campaign_versions', 'campaigns',
    array['INSERT','UPDATE'], 'status', array[]::text[],
    array['cancelled','paused'],
    array['create_campaign_draft_command','approve_campaign_version_command',
      'pause_campaign_version_command','cancel_campaign_version_command']),
  ('notification.template_version', 'loyalty_private',
    'notification_email_template_versions', 'notifications',
    array['INSERT'], null, array[]::text[], array[]::text[],
    array['publish_notification_email_template_command']),
  ('notification.template_binding', 'loyalty_private',
    'notification_email_template_bindings', 'notifications',
    array['INSERT','UPDATE'], null, array[]::text[], array[]::text[],
    array['publish_notification_email_template_command']),
  ('notification.test_delivery', 'loyalty_private',
    'notification_smtp_test_deliveries', 'notifications',
    array['INSERT'], null, array[]::text[], array[]::text[],
    array['send_notification_test_command']),
  ('notification.webhook_endpoint', 'loyalty_private',
    'notification_webhook_endpoints', 'notifications',
    array['INSERT','UPDATE'], 'state', array[]::text[],
    array['disabled','retired'],
    array['create_notification_webhook_endpoint_command_v1',
      'rotate_notification_webhook_endpoint_command_v1',
      'change_notification_webhook_endpoint_state_command_v1']),
  ('analytics.report_schedule', 'loyalty', 'analytics_report_schedules',
    'analytics', array['INSERT','UPDATE'], 'state', array[]::text[],
    array['paused'],
    array['create_analytics_report_schedule_command',
      'set_analytics_report_schedule_state_command']),
  ('ecosystem.sharing_policy', 'loyalty',
    'programme_group_sharing_versions', 'ecosystem.api', array['INSERT'],
    'sharing_mode', array['isolated'], array[]::text[],
    array['configure_programme_group_sharing_v1']),
  ('ecosystem.currency_policy', 'loyalty_private',
    'currency_conversion_policy_versions', 'ecosystem.api', array['INSERT'],
    'state', array['disabled'], array[]::text[],
    array['configure_programme_currency_policy_v1']),
  ('ecosystem.service_account', 'loyalty', 'service_accounts',
    'ecosystem.api', array['INSERT'], null, array[]::text[], array[]::text[],
    array['create_service_account_v1']),
  ('ecosystem.service_credential', 'loyalty_private',
    'service_account_credentials', 'ecosystem.api', array['INSERT','UPDATE'],
    'status', array[]::text[], array['revoked'],
    array['issue_service_account_credential_v1',
      'revoke_service_account_credential_v1']),
  ('identity.federation_revision', 'loyalty',
    'organization_federation_source_revisions', 'enterprise.identity',
    array['INSERT'], 'action',
    array['federation.disable.begin','federation.disable.complete',
      'federation.enable.complete','federation.recover',
      'federation.retire.begin','federation.retire.complete',
      'federation.rotate_secret.complete','federation.validate'],
    array[]::text[],
    array['prepare_organization_federation_source_v1',
      'record_organization_federation_validation_v1',
      'begin_organization_federation_action_v1',
      'recover_organization_federation_pending_v1',
      'complete_organization_federation_action_v1']),
  ('identity.scim_endpoint_create', 'loyalty',
    'organization_scim_endpoints', 'enterprise.identity', array['INSERT'],
    'status', array[]::text[], array[]::text[],
    array['create_organization_scim_endpoint_command_v1']),
  ('migration.dry_run', 'loyalty', 'migration_dry_runs', 'migration',
    array['INSERT'], null, array[]::text[], array[]::text[],
    array['record_migration_dry_run_v1']),
  ('migration.import_batch', 'loyalty', 'migration_import_batches',
    'migration', array['INSERT'], null, array[]::text[], array[]::text[],
    array['apply_migration_opening_balance_v1']);

create or replace function loyalty_private.evaluate_managed_growth_boundary_v1(
  target_organization_id bigint,
  target_boundary_key text,
  target_operation text,
  target_old_state text,
  target_new_state text,
  target_at timestamptz default now()
)
returns table (
  allowed boolean,
  recovery_action boolean,
  capability_key text,
  commercial_state text,
  reason_code text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  boundary loyalty_private.managed_growth_configuration_boundaries%rowtype;
  authorization_row record;
begin
  select candidate.* into boundary
  from loyalty_private.managed_growth_configuration_boundaries as candidate
  where candidate.boundary_key = target_boundary_key;

  if boundary.boundary_key is null
     or target_organization_id is null
     or not exists (
       select 1 from loyalty.organizations as organization
       where organization.id = target_organization_id
     )
     or target_operation is null
     or not (target_operation = any(boundary.guarded_operations))
     or target_at is null then
    raise exception using errcode = '22023',
      message = 'invalid managed growth boundary evaluation';
  end if;

  capability_key := boundary.capability_key;
  recovery_action := (
    target_operation = 'INSERT'
    and target_new_state = any(boundary.safe_insert_states)
  ) or (
    target_operation = 'UPDATE'
    and target_new_state = any(boundary.safe_update_states)
  );

  if recovery_action then
    allowed := true;
    commercial_state := null;
    reason_code := 'safe_recovery_action';
    return next;
    return;
  end if;

  select * into strict authorization_row
  from loyalty_private.authorize_managed_growth_configuration_v1(
    target_organization_id,
    'managed.billing',
    'managed-growth-boundary:' || boundary.boundary_key || ':' ||
      target_organization_id::text,
    target_at
  );

  -- Existing domain commands and contract triggers remain authoritative for
  -- product capabilities, including tables shared by V1 and V2 definitions.
  -- This boundary adds only the separately canaried commercial decision.
  if authorization_row.deployment_mode = 'self_hosted' then
    allowed := true;
    commercial_state := authorization_row.commercial_state;
    reason_code := 'allowed';
    return next;
    return;
  end if;
  if not authorization_row.entitlement_enabled then
    allowed := true;
    commercial_state := authorization_row.commercial_state;
    reason_code := 'commercial_enforcement_disabled';
    return next;
    return;
  end if;

  allowed := authorization_row.allowed;
  commercial_state := authorization_row.commercial_state;
  reason_code := authorization_row.reason_code;
  return next;
end;
$$;

create or replace function loyalty_private.enforce_managed_growth_boundary_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  boundary loyalty_private.managed_growth_configuration_boundaries%rowtype;
  row_document jsonb;
  old_document jsonb;
  target_organization_id bigint;
  target_old_state text;
  target_new_state text;
  request_actor_user_id uuid;
  request_role text;
  decision record;
begin
  if tg_nargs <> 1 then
    raise exception using errcode = '55000',
      message = 'managed growth boundary trigger is misconfigured';
  end if;

  select candidate.* into boundary
  from loyalty_private.managed_growth_configuration_boundaries as candidate
  where candidate.boundary_key = tg_argv[0];
  if boundary.boundary_key is null
     or boundary.relation_schema <> tg_table_schema
     or boundary.relation_name <> tg_table_name
     or not (tg_op = any(boundary.guarded_operations)) then
    raise exception using errcode = '55000',
      message = 'managed growth boundary trigger is misconfigured';
  end if;

  request_role := nullif(pg_catalog.current_setting('role', true), '');
  if request_role is null or request_role = 'none' then
    request_role := session_user;
  end if;

  -- Trusted migrations and dedicated workers bypass regardless of stale
  -- request GUCs on a reused privileged session. Their database role, never
  -- JWT metadata, is the authority for this narrow bypass.
  if request_role in ('postgres', 'loyalty_owner', 'loyalty_worker') then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  request_actor_user_id := loyalty_private.request_user_id();

  -- The server runtime still passes through policy because it executes some
  -- private merchant commands that derive and validate an explicit actor.
  -- Unknown and browser roles without a subject fail closed.
  if request_actor_user_id is null
     and request_role is distinct from 'loyalty_runtime' then
    raise exception using errcode = '42501',
      message = 'managed growth configuration actor is required';
  end if;

  row_document := case when tg_op = 'DELETE'
    then pg_catalog.to_jsonb(old) else pg_catalog.to_jsonb(new) end;
  old_document := case when tg_op = 'INSERT'
    then '{}'::jsonb else pg_catalog.to_jsonb(old) end;
  target_organization_id := nullif(row_document ->> 'organization_id', '')::bigint;
  if target_organization_id is null then
    raise exception using errcode = '42501',
      message = 'managed growth configuration organization is required';
  end if;

  if boundary.state_column is not null then
    target_old_state := old_document ->> boundary.state_column;
    target_new_state := row_document ->> boundary.state_column;
  end if;

  select * into strict decision
  from loyalty_private.evaluate_managed_growth_boundary_v1(
    target_organization_id, boundary.boundary_key, tg_op,
    target_old_state, target_new_state, pg_catalog.statement_timestamp()
  );
  if not decision.allowed then
    raise exception using errcode = '42501',
      message = 'managed growth configuration restricted';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

alter function loyalty_private.evaluate_managed_growth_boundary_v1(
  bigint, text, text, text, text, timestamptz
) owner to loyalty_owner;
alter function loyalty_private.enforce_managed_growth_boundary_v1()
  owner to loyalty_owner;

revoke all on table
  loyalty_private.managed_growth_configuration_boundaries
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function loyalty_private.evaluate_managed_growth_boundary_v1(
  bigint, text, text, text, text, timestamptz
), loyalty_private.enforce_managed_growth_boundary_v1()
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

create trigger zz_managed_growth_programmes
before insert on loyalty.programmes
for each row execute function loyalty_private.enforce_managed_growth_boundary_v1(
  'programme.root'
);
create trigger zz_managed_growth_programme_versions
before insert or update on loyalty.programme_versions
for each row execute function loyalty_private.enforce_managed_growth_boundary_v1(
  'programme.version'
);
create trigger zz_managed_growth_experience_themes
before insert or update on loyalty.experience_themes
for each row execute function loyalty_private.enforce_managed_growth_boundary_v1(
  'experience.theme'
);
create trigger zz_managed_growth_experience_translations
before insert or update on loyalty.experience_translations
for each row execute function loyalty_private.enforce_managed_growth_boundary_v1(
  'experience.copy'
);
create trigger zz_managed_growth_tier_manual_overrides
before insert on loyalty.tier_manual_overrides
for each row execute function loyalty_private.enforce_managed_growth_boundary_v1(
  'vip.manual_override'
);
create trigger zz_managed_growth_audiences
before insert on loyalty.audiences
for each row execute function loyalty_private.enforce_managed_growth_boundary_v1(
  'campaign.audience'
);
create trigger zz_managed_growth_audience_versions
before insert or update on loyalty.audience_versions
for each row execute function loyalty_private.enforce_managed_growth_boundary_v1(
  'campaign.audience_version'
);
create trigger zz_managed_growth_audience_snapshots
before insert or update on loyalty.audience_snapshots
for each row execute function loyalty_private.enforce_managed_growth_boundary_v1(
  'campaign.audience_snapshot'
);
create trigger zz_managed_growth_campaigns
before insert on loyalty.campaigns
for each row execute function loyalty_private.enforce_managed_growth_boundary_v1(
  'campaign.root'
);
create trigger zz_managed_growth_campaign_versions
before insert or update on loyalty.campaign_versions
for each row execute function loyalty_private.enforce_managed_growth_boundary_v1(
  'campaign.version'
);
create trigger zz_managed_growth_notification_template_versions
before insert on loyalty_private.notification_email_template_versions
for each row execute function loyalty_private.enforce_managed_growth_boundary_v1(
  'notification.template_version'
);
create trigger zz_managed_growth_notification_template_bindings
before insert or update on loyalty_private.notification_email_template_bindings
for each row execute function loyalty_private.enforce_managed_growth_boundary_v1(
  'notification.template_binding'
);
create trigger zz_managed_growth_notification_test_deliveries
before insert on loyalty_private.notification_smtp_test_deliveries
for each row execute function loyalty_private.enforce_managed_growth_boundary_v1(
  'notification.test_delivery'
);
create trigger zz_managed_growth_notification_webhook_endpoints
before insert or update on loyalty_private.notification_webhook_endpoints
for each row execute function loyalty_private.enforce_managed_growth_boundary_v1(
  'notification.webhook_endpoint'
);
create trigger zz_managed_growth_analytics_report_schedules
before insert or update on loyalty.analytics_report_schedules
for each row execute function loyalty_private.enforce_managed_growth_boundary_v1(
  'analytics.report_schedule'
);
create trigger zz_managed_growth_programme_group_sharing_versions
before insert on loyalty.programme_group_sharing_versions
for each row execute function loyalty_private.enforce_managed_growth_boundary_v1(
  'ecosystem.sharing_policy'
);
create trigger zz_managed_growth_currency_conversion_policy_versions
before insert on loyalty_private.currency_conversion_policy_versions
for each row execute function loyalty_private.enforce_managed_growth_boundary_v1(
  'ecosystem.currency_policy'
);
create trigger zz_managed_growth_service_accounts
before insert on loyalty.service_accounts
for each row execute function loyalty_private.enforce_managed_growth_boundary_v1(
  'ecosystem.service_account'
);
create trigger zz_managed_growth_service_account_credentials
before insert or update on loyalty_private.service_account_credentials
for each row execute function loyalty_private.enforce_managed_growth_boundary_v1(
  'ecosystem.service_credential'
);
create trigger zz_managed_growth_organization_federation_source_revisions
before insert on loyalty.organization_federation_source_revisions
for each row execute function loyalty_private.enforce_managed_growth_boundary_v1(
  'identity.federation_revision'
);
create trigger zz_managed_growth_organization_scim_endpoints
before insert on loyalty.organization_scim_endpoints
for each row execute function loyalty_private.enforce_managed_growth_boundary_v1(
  'identity.scim_endpoint_create'
);
create trigger zz_managed_growth_migration_dry_runs
before insert on loyalty.migration_dry_runs
for each row execute function loyalty_private.enforce_managed_growth_boundary_v1(
  'migration.dry_run'
);
create trigger zz_managed_growth_migration_import_batches
before insert on loyalty.migration_import_batches
for each row execute function loyalty_private.enforce_managed_growth_boundary_v1(
  'migration.import_batch'
);

comment on table loyalty_private.managed_growth_configuration_boundaries is
  'Private immutable inventory of merchant authoring mutation roots. Operational, value, export, access, recovery, and checkout relations are intentionally excluded.';
comment on function loyalty_private.evaluate_managed_growth_boundary_v1(
  bigint, text, text, text, text, timestamptz
) is
  'Deterministically combines a reviewed authoring boundary with the managed.billing canary and commercial evidence; established domain commands retain product-entitlement authority and safe risk-reducing transitions remain available.';
comment on function loyalty_private.enforce_managed_growth_boundary_v1() is
  'Fail-closed trigger guard for authenticated merchant authoring roots. Trusted database owner and worker roles bypass request metadata only because guarded relations exclude operational and protected value paths.';
