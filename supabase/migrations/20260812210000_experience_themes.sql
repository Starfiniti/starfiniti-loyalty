-- Phase 9 customer-experience theme foundation. Merchants can persist a
-- bounded design-token set; arbitrary CSS, remote font URLs, and tenant IDs
-- supplied by the browser never cross this command boundary.

create or replace function loyalty_private.contrast_against_white(target_color text)
returns double precision
language plpgsql
immutable
set search_path = ''
as $$
declare
  red_channel double precision;
  green_channel double precision;
  blue_channel double precision;
  red_linear double precision;
  green_linear double precision;
  blue_linear double precision;
  luminance double precision;
begin
  if target_color is null or target_color !~ '^#[0-9a-f]{6}$' then
    return 0;
  end if;
  red_channel := get_byte(decode(substr(target_color, 2, 2), 'hex'), 0) / 255.0;
  green_channel := get_byte(decode(substr(target_color, 4, 2), 'hex'), 0) / 255.0;
  blue_channel := get_byte(decode(substr(target_color, 6, 2), 'hex'), 0) / 255.0;
  red_linear := case when red_channel <= 0.04045 then red_channel / 12.92 else power((red_channel + 0.055) / 1.055, 2.4) end;
  green_linear := case when green_channel <= 0.04045 then green_channel / 12.92 else power((green_channel + 0.055) / 1.055, 2.4) end;
  blue_linear := case when blue_channel <= 0.04045 then blue_channel / 12.92 else power((blue_channel + 0.055) / 1.055, 2.4) end;
  luminance := 0.2126 * red_linear + 0.7152 * green_linear + 0.0722 * blue_linear;
  return 1.05 / (luminance + 0.05);
end;
$$;

alter function loyalty_private.contrast_against_white(text) owner to loyalty_owner;
revoke all on function loyalty_private.contrast_against_white(text)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

create table loyalty.experience_themes (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null references loyalty.organizations(id) on delete cascade,
  workspace_id bigint not null,
  programme_group_id bigint not null,
  revision integer not null default 1 check (revision > 0),
  brand_color text not null default '#7c2d4f',
  display_font text not null default 'editorial-serif'
    check (display_font in ('system-sans', 'editorial-serif', 'modern-serif')),
  card_radius_px smallint not null default 14 check (card_radius_px in (8, 14, 22)),
  hero_text text not null default 'Beauty that gives back',
  points_label text not null default 'Points',
  show_tier boolean not null default true,
  show_rewards boolean not null default true,
  widget_position text not null default 'right' check (widget_position in ('left', 'right')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, workspace_id, programme_group_id),
  foreign key (organization_id, programme_group_id, workspace_id)
    references loyalty.programme_group_workspaces(
      organization_id, programme_group_id, workspace_id
    ) on delete cascade,
  check (brand_color ~ '^#[0-9a-f]{6}$'),
  check (loyalty_private.contrast_against_white(brand_color) >= 4.5),
  check (length(hero_text) between 1 and 120 and hero_text = btrim(hero_text) and hero_text !~ '[[:cntrl:]]'),
  check (length(points_label) between 1 and 30 and points_label = btrim(points_label) and points_label !~ '[[:cntrl:]]'),
  check (updated_at >= created_at)
);

create index experience_themes_tenant_scope_idx
  on loyalty.experience_themes (organization_id, workspace_id, programme_group_id);

alter table loyalty.experience_themes owner to loyalty_owner;
alter table loyalty.experience_themes enable row level security;

create policy experience_themes_member_select
  on loyalty.experience_themes
  for select to authenticated
  using ((select loyalty_private.is_organization_member(organization_id)));

revoke all on loyalty.experience_themes
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant select on loyalty.experience_themes to authenticated;

create or replace function loyalty.save_experience_theme_command(
  target_workspace_public_id uuid,
  target_programme_group_public_id uuid,
  target_brand_color text,
  target_display_font text,
  target_card_radius_px smallint,
  target_hero_text text,
  target_points_label text,
  target_show_tier boolean,
  target_show_rewards boolean,
  target_widget_position text,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (resource_public_id uuid, outcome text, revision integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := loyalty_private.request_user_id();
  target_scope record;
  existing_audit loyalty.admin_audit_events%rowtype;
  existing_theme loyalty.experience_themes%rowtype;
  request_hash bytea;
  saved_public_id uuid;
  saved_revision integer;
  saved_outcome text;
begin
  if actor_user_id is null
    or target_workspace_public_id is null
    or target_programme_group_public_id is null
    or target_brand_color is null
    or target_brand_color !~ '^#[0-9a-f]{6}$'
    or loyalty_private.contrast_against_white(target_brand_color) < 4.5
    or target_display_font is null
    or target_display_font not in ('system-sans', 'editorial-serif', 'modern-serif')
    or target_card_radius_px is null
    or target_card_radius_px not in (8, 14, 22)
    or target_hero_text is null
    or length(target_hero_text) not between 1 and 120
    or target_hero_text <> btrim(target_hero_text)
    or target_hero_text ~ '[[:cntrl:]]'
    or target_points_label is null
    or length(target_points_label) not between 1 and 30
    or target_points_label <> btrim(target_points_label)
    or target_points_label ~ '[[:cntrl:]]'
    or target_show_tier is null
    or target_show_rewards is null
    or target_widget_position is null
    or target_widget_position not in ('left', 'right')
    or target_idempotency_key is null
    or length(btrim(target_idempotency_key)) not between 1 and 255
    or target_idempotency_key <> btrim(target_idempotency_key)
    or target_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid experience theme input';
  end if;

  select
    link.organization_id,
    link.workspace_id,
    link.programme_group_id
  into target_scope
  from loyalty.programme_group_workspaces as link
  join loyalty.workspaces as workspace
    on workspace.organization_id = link.organization_id
   and workspace.id = link.workspace_id
  join loyalty.programme_groups as programme_group
    on programme_group.organization_id = link.organization_id
   and programme_group.id = link.programme_group_id
  where workspace.public_id = target_workspace_public_id
    and workspace.status = 'active'
    and programme_group.public_id = target_programme_group_public_id
    and programme_group.status = 'active'
    and loyalty_private.has_organization_role(
      link.organization_id,
      array['owner', 'admin']::text[]
    )
  for update of link;
  if not found then
    raise exception using errcode = '42501', message = 'experience theme change not authorized';
  end if;

  request_hash := extensions.digest(
    convert_to(
      jsonb_build_object(
        'workspaceId', target_workspace_public_id,
        'programmeGroupId', target_programme_group_public_id,
        'brandColor', target_brand_color,
        'displayFont', target_display_font,
        'cardRadiusPx', target_card_radius_px,
        'heroText', target_hero_text,
        'pointsLabel', target_points_label,
        'showTier', target_show_tier,
        'showRewards', target_show_rewards,
        'widgetPosition', target_widget_position
      )::text,
      'UTF8'
    ),
    'sha256'
  );

  select audit.* into existing_audit
  from loyalty.admin_audit_events as audit
  where audit.organization_id = target_scope.organization_id
    and audit.idempotency_key = target_idempotency_key;
  if found then
    if existing_audit.action <> 'experience.theme.save'
      or existing_audit.request_sha256 <> request_hash then
      raise exception using errcode = '23514', message = 'experience theme idempotency conflict';
    end if;
    return query select
      existing_audit.resource_public_id,
      'duplicate'::text,
      (existing_audit.metadata ->> 'revision')::integer;
    return;
  end if;

  select theme.* into existing_theme
  from loyalty.experience_themes as theme
  where theme.organization_id = target_scope.organization_id
    and theme.workspace_id = target_scope.workspace_id
    and theme.programme_group_id = target_scope.programme_group_id
  for update;

  if found then
    update loyalty.experience_themes
    set brand_color = target_brand_color,
        display_font = target_display_font,
        card_radius_px = target_card_radius_px,
        hero_text = target_hero_text,
        points_label = target_points_label,
        show_tier = target_show_tier,
        show_rewards = target_show_rewards,
        widget_position = target_widget_position,
        revision = experience_themes.revision + 1,
        updated_at = now()
    where id = existing_theme.id
    returning public_id, experience_themes.revision
      into saved_public_id, saved_revision;
    saved_outcome := 'updated';
  else
    insert into loyalty.experience_themes (
      organization_id, workspace_id, programme_group_id, brand_color,
      display_font, card_radius_px, hero_text, points_label, show_tier,
      show_rewards, widget_position
    ) values (
      target_scope.organization_id, target_scope.workspace_id,
      target_scope.programme_group_id, target_brand_color,
      target_display_font, target_card_radius_px, target_hero_text,
      target_points_label, target_show_tier, target_show_rewards,
      target_widget_position
    ) returning public_id, experience_themes.revision
      into saved_public_id, saved_revision;
    saved_outcome := 'created';
  end if;

  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id,
    metadata
  ) values (
    target_scope.organization_id, actor_user_id,
    'experience.theme.save', 'experience_theme', saved_public_id,
    target_idempotency_key, request_hash, target_correlation_id,
    jsonb_build_object(
      'workspacePublicId', target_workspace_public_id,
      'programmeGroupPublicId', target_programme_group_public_id,
      'revision', saved_revision
    )
  );

  return query select saved_public_id, saved_outcome, saved_revision;
end;
$$;

alter function loyalty.save_experience_theme_command(
  uuid, uuid, text, text, smallint, text, text, boolean, boolean, text, text, uuid
) owner to loyalty_owner;
revoke all on function loyalty.save_experience_theme_command(
  uuid, uuid, text, text, smallint, text, text, boolean, boolean, text, text, uuid
) from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty.save_experience_theme_command(
  uuid, uuid, text, text, smallint, text, text, boolean, boolean, text, text, uuid
) to authenticated;

comment on table loyalty.experience_themes is
  'Tenant-scoped, revisioned customer-experience design tokens; no executable CSS or remote assets.';
comment on function loyalty.save_experience_theme_command(
  uuid, uuid, text, text, smallint, text, text, boolean, boolean, text, text, uuid
) is 'Creates or revisions one authorized workspace/programme-group theme and appends immutable audit evidence.';
