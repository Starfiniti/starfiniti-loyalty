-- M09 controlled English presentation V2. Existing V1 rows and functions
-- remain readable. New authority is additive, bounded, Auth-derived for
-- customers, and selector-minimized for anonymous delivery.

alter table loyalty.experience_themes
  add column density text not null default 'comfortable',
  add column hero_asset text not null default 'sparkles',
  add column show_referrals boolean not null default true,
  add column section_order text[] not null default array[
    'overview', 'earning', 'rewards', 'vip', 'referrals', 'history', 'account'
  ]::text[];

alter table loyalty.experience_themes
  add constraint experience_themes_density_v2_check
    check (density in ('comfortable', 'compact')),
  add constraint experience_themes_hero_asset_v2_check
    check (hero_asset in ('none', 'sparkles', 'gift', 'crown')),
  add constraint experience_themes_section_order_v2_check
    check (
      cardinality(section_order) = 7
      and array_position(section_order, null) is null
      and section_order @> array[
        'overview', 'earning', 'rewards', 'vip', 'referrals', 'history', 'account'
      ]::text[]
      and section_order <@ array[
        'overview', 'earning', 'rewards', 'vip', 'referrals', 'history', 'account'
      ]::text[]
    );

create or replace function loyalty.save_experience_theme_v2_command(
  target_workspace_public_id uuid,
  target_programme_group_public_id uuid,
  target_brand_color text,
  target_display_font text,
  target_card_radius_px integer,
  target_hero_text text,
  target_points_label text,
  target_show_tier boolean,
  target_show_rewards boolean,
  target_widget_position text,
  target_density text,
  target_hero_asset text,
  target_show_referrals boolean,
  target_section_order text[],
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
  canonical_sections constant text[] := array[
    'overview', 'earning', 'rewards', 'vip', 'referrals', 'history', 'account'
  ]::text[];
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
    or pg_catalog.length(target_hero_text) not between 1 and 120
    or target_hero_text <> pg_catalog.btrim(target_hero_text)
    or target_hero_text ~ '[[:cntrl:]]'
    or target_hero_text ~ '[<>]'
    or target_points_label is null
    or pg_catalog.length(target_points_label) not between 1 and 30
    or target_points_label <> pg_catalog.btrim(target_points_label)
    or target_points_label ~ '[[:cntrl:]]'
    or target_points_label ~ '[<>]'
    or target_show_tier is null
    or target_show_rewards is null
    or target_widget_position is null
    or target_widget_position not in ('left', 'right')
    or target_density is null
    or target_density not in ('comfortable', 'compact')
    or target_hero_asset is null
    or target_hero_asset not in ('none', 'sparkles', 'gift', 'crown')
    or target_show_referrals is null
    or target_section_order is null
    or pg_catalog.cardinality(target_section_order) <> 7
    or pg_catalog.array_position(target_section_order, null) is not null
    or not target_section_order @> canonical_sections
    or not target_section_order <@ canonical_sections
    or target_idempotency_key is null
    or pg_catalog.length(pg_catalog.btrim(target_idempotency_key)) not between 1 and 255
    or target_idempotency_key <> pg_catalog.btrim(target_idempotency_key)
    or target_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid experience theme V2 input';
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
    raise exception using errcode = '42501', message = 'experience theme V2 change not authorized';
  end if;

  request_hash := extensions.digest(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'workspaceId', target_workspace_public_id,
        'programmeGroupId', target_programme_group_public_id,
        'brandColor', target_brand_color,
        'displayFont', target_display_font,
        'cardRadiusPx', target_card_radius_px,
        'heroText', target_hero_text,
        'pointsLabel', target_points_label,
        'showTier', target_show_tier,
        'showRewards', target_show_rewards,
        'widgetPosition', target_widget_position,
        'density', target_density,
        'heroAsset', target_hero_asset,
        'showReferrals', target_show_referrals,
        'sectionOrder', pg_catalog.to_jsonb(target_section_order)
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
    if existing_audit.action <> 'experience.theme.v2.save'
      or existing_audit.request_sha256 <> request_hash then
      raise exception using errcode = '23514', message = 'experience theme V2 idempotency conflict';
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
        density = target_density,
        hero_asset = target_hero_asset,
        show_referrals = target_show_referrals,
        section_order = target_section_order,
        revision = experience_themes.revision + 1,
        updated_at = pg_catalog.now()
    where id = existing_theme.id
    returning public_id, experience_themes.revision
      into saved_public_id, saved_revision;
    saved_outcome := 'updated';
  else
    insert into loyalty.experience_themes (
      organization_id, workspace_id, programme_group_id, brand_color,
      display_font, card_radius_px, hero_text, points_label, show_tier,
      show_rewards, widget_position, density, hero_asset, show_referrals,
      section_order
    ) values (
      target_scope.organization_id, target_scope.workspace_id,
      target_scope.programme_group_id, target_brand_color,
      target_display_font, target_card_radius_px, target_hero_text,
      target_points_label, target_show_tier, target_show_rewards,
      target_widget_position, target_density, target_hero_asset,
      target_show_referrals, target_section_order
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
    'experience.theme.v2.save', 'experience_theme', saved_public_id,
    target_idempotency_key, request_hash, target_correlation_id,
    pg_catalog.jsonb_build_object(
      'workspacePublicId', target_workspace_public_id,
      'programmeGroupPublicId', target_programme_group_public_id,
      'revision', saved_revision
    )
  );

  return query select saved_public_id, saved_outcome, saved_revision;
end;
$$;

alter function loyalty.save_experience_theme_v2_command(
  uuid, uuid, text, text, integer, text, text, boolean, boolean, text,
  text, text, boolean, text[], text, uuid
) owner to loyalty_owner;
revoke all on function loyalty.save_experience_theme_v2_command(
  uuid, uuid, text, text, integer, text, text, boolean, boolean, text,
  text, text, boolean, text[], text, uuid
) from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty.save_experience_theme_v2_command(
  uuid, uuid, text, text, integer, text, text, boolean, boolean, text,
  text, text, boolean, text[], text, uuid
) to authenticated;

create or replace function loyalty.save_experience_copy_v2_command(
  target_workspace_public_id uuid,
  target_programme_group_public_id uuid,
  target_hero_text text,
  target_points_label text,
  target_balance_label text,
  target_rewards_label text,
  target_redeem_label text,
  target_join_label text,
  target_earn_message text,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (
  resource_public_id uuid,
  outcome text,
  revision integer,
  locale text
)
language sql
volatile
security invoker
set search_path = ''
as $$
  select result.resource_public_id, result.outcome, result.revision, result.locale
  from loyalty.save_experience_translation_command(
    target_workspace_public_id,
    target_programme_group_public_id,
    'en',
    target_hero_text,
    target_points_label,
    target_balance_label,
    target_rewards_label,
    target_redeem_label,
    target_join_label,
    target_earn_message,
    target_idempotency_key,
    target_correlation_id
  ) as result;
$$;

alter function loyalty.save_experience_copy_v2_command(
  uuid, uuid, text, text, text, text, text, text, text, text, uuid
) owner to loyalty_owner;
revoke all on function loyalty.save_experience_copy_v2_command(
  uuid, uuid, text, text, text, text, text, text, text, text, uuid
) from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty.save_experience_copy_v2_command(
  uuid, uuid, text, text, text, text, text, text, text, text, uuid
) to authenticated;

create or replace function loyalty.get_my_loyalty_experiences_v2()
returns table (account_id uuid, experience jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  with legacy as materialized (
    select * from loyalty.get_my_loyalty_experiences_v1()
  )
  select legacy.account_id,
    (legacy.experience - 'version') || pg_catalog.jsonb_build_object(
      'version', '2',
      'presentation', pg_catalog.jsonb_build_object(
        'version', '2',
        'theme', pg_catalog.jsonb_build_object(
          'version', '2',
          'brandColor', coalesce(theme.brand_color, '#7c2d4f'),
          'displayFont', coalesce(theme.display_font, 'editorial-serif'),
          'cardRadiusPx', coalesce(theme.card_radius_px, 14)::integer,
          'heroText', case
            when theme.hero_text is not null and theme.hero_text !~ '[<>]'
              then theme.hero_text
            else 'Beauty that gives back'
          end,
          'pointsLabel', case
            when theme.points_label is not null and theme.points_label !~ '[<>]'
              then theme.points_label
            else 'Points'
          end,
          'showTier', coalesce(theme.show_tier, true),
          'showRewards', coalesce(theme.show_rewards, true),
          'widgetPosition', coalesce(theme.widget_position, 'right'),
          'density', coalesce(theme.density, 'comfortable'),
          'heroAsset', coalesce(theme.hero_asset, 'sparkles'),
          'showReferrals', coalesce(theme.show_referrals, true),
          'sectionOrder', pg_catalog.to_jsonb(coalesce(
            theme.section_order,
            array[
              'overview', 'earning', 'rewards', 'vip', 'referrals',
              'history', 'account'
            ]::text[]
          ))
        ),
        'copy', pg_catalog.jsonb_build_object(
          'version', '2',
          'locale', 'en',
          'heroText', coalesce(
            translation.hero_text,
            case when theme.hero_text is not null and theme.hero_text !~ '[<>]'
              then theme.hero_text else 'Beauty that gives back' end
          ),
          'pointsLabel', coalesce(
            translation.points_label,
            case when theme.points_label is not null and theme.points_label !~ '[<>]'
              then theme.points_label else 'Points' end
          ),
          'balanceLabel', coalesce(translation.balance_label, 'Your balance'),
          'rewardsLabel', coalesce(translation.rewards_label, 'Your rewards'),
          'redeemLabel', coalesce(translation.redeem_label, 'Redeem'),
          'joinLabel', coalesce(translation.join_label, 'Join free'),
          'earnMessage', coalesce(
            translation.earn_message,
            'Earn points on every eligible order.'
          )
        )
      )
    ) as experience
  from legacy
  join loyalty.customer_user_links as customer_link
    on customer_link.public_id = legacy.account_id
   and customer_link.auth_user_id = loyalty_private.request_user_id()
   and customer_link.revoked_at is null
  join loyalty.commerce_connections as connection
    on connection.organization_id = customer_link.organization_id
   and connection.id = customer_link.source_connection_id
  join loyalty.workspaces as workspace
    on workspace.organization_id = connection.organization_id
   and workspace.id = connection.workspace_id
   and workspace.public_id = (legacy.experience ->> 'workspaceId')::uuid
  left join loyalty.programmes as programme
    on programme.organization_id = connection.organization_id
   and programme.id = connection.programme_id
   and programme.public_id = (legacy.experience ->> 'programmeId')::uuid
  left join loyalty.programme_group_workspaces as group_workspace
    on group_workspace.organization_id = programme.organization_id
   and group_workspace.programme_group_id = programme.programme_group_id
   and group_workspace.workspace_id = workspace.id
  left join loyalty.experience_themes as theme
    on theme.organization_id = group_workspace.organization_id
   and theme.workspace_id = group_workspace.workspace_id
   and theme.programme_group_id = group_workspace.programme_group_id
  left join loyalty.experience_translations as translation
    on translation.organization_id = group_workspace.organization_id
   and translation.workspace_id = group_workspace.workspace_id
   and translation.programme_group_id = group_workspace.programme_group_id
   and translation.locale = 'en'
  order by legacy.account_id;
$$;

alter function loyalty.get_my_loyalty_experiences_v2() owner to loyalty_owner;
revoke all on function loyalty.get_my_loyalty_experiences_v2()
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty.get_my_loyalty_experiences_v2()
  to authenticated;

create or replace function loyalty.get_public_loyalty_experience_v2(
  target_workspace_public_id uuid,
  target_programme_public_id uuid
)
returns table (
  workspace_public_id uuid,
  programme_public_id uuid,
  programme_group_public_id uuid,
  programme_name text,
  requested_locale text,
  resolved_locale text,
  presentation jsonb,
  tiers jsonb,
  rewards jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with legacy as materialized (
    select *
    from loyalty.get_public_loyalty_experience(
      target_workspace_public_id,
      target_programme_public_id,
      'en'
    )
  )
  select
    legacy.workspace_public_id,
    legacy.programme_public_id,
    legacy.programme_group_public_id,
    legacy.programme_name,
    'en'::text,
    'en'::text,
    pg_catalog.jsonb_build_object(
      'version', '2',
      'theme', pg_catalog.jsonb_build_object(
        'version', '2',
        'brandColor', legacy.brand_color,
        'displayFont', legacy.display_font,
        'cardRadiusPx', legacy.card_radius_px,
        'heroText', case
          when theme.hero_text is not null and theme.hero_text !~ '[<>]'
            then theme.hero_text
          else 'Beauty that gives back'
        end,
        'pointsLabel', case
          when theme.points_label is not null and theme.points_label !~ '[<>]'
            then theme.points_label
          else 'Points'
        end,
        'showTier', legacy.show_tier,
        'showRewards', legacy.show_rewards,
        'widgetPosition', coalesce(theme.widget_position, 'right'),
        'density', coalesce(theme.density, 'comfortable'),
        'heroAsset', coalesce(theme.hero_asset, 'sparkles'),
        'showReferrals', coalesce(theme.show_referrals, true),
        'sectionOrder', pg_catalog.to_jsonb(coalesce(
          theme.section_order,
          array[
            'overview', 'earning', 'rewards', 'vip', 'referrals',
            'history', 'account'
          ]::text[]
        ))
      ),
      'copy', pg_catalog.jsonb_build_object(
        'version', '2',
        'locale', 'en',
        'heroText', legacy.hero_text,
        'pointsLabel', legacy.points_label,
        'balanceLabel', legacy.balance_label,
        'rewardsLabel', legacy.rewards_label,
        'redeemLabel', legacy.redeem_label,
        'joinLabel', legacy.join_label,
        'earnMessage', legacy.earn_message
      )
    ),
    legacy.tiers,
    legacy.rewards
  from legacy
  join loyalty.workspaces as workspace
    on workspace.public_id = legacy.workspace_public_id
  join loyalty.programme_groups as programme_group
    on programme_group.organization_id = workspace.organization_id
   and programme_group.public_id = legacy.programme_group_public_id
  left join loyalty.experience_themes as theme
    on theme.organization_id = programme_group.organization_id
   and theme.workspace_id = workspace.id
   and theme.programme_group_id = programme_group.id;
$$;

alter function loyalty.get_public_loyalty_experience_v2(uuid, uuid)
  owner to loyalty_owner;
revoke all on function loyalty.get_public_loyalty_experience_v2(uuid, uuid)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty.get_public_loyalty_experience_v2(uuid, uuid)
  to anon, authenticated;

comment on column loyalty.experience_themes.section_order is
  'Exact seven-section English customer composition; core value and account sections cannot be removed.';
comment on function loyalty.save_experience_theme_v2_command(
  uuid, uuid, text, text, integer, text, text, boolean, boolean, text,
  text, text, boolean, text[], text, uuid
) is 'Creates or revisions one authorized controlled V2 presentation and appends immutable audit evidence.';
comment on function loyalty.save_experience_copy_v2_command(
  uuid, uuid, text, text, text, text, text, text, text, text, uuid
) is 'Selector-minimized English-only V2 copy entrypoint over the retained guarded V1 persistence boundary.';
comment on function loyalty.get_my_loyalty_experiences_v2() is
  'Returns strict English V2 presentation nested into each Auth-derived customer experience without accepting selectors.';
comment on function loyalty.get_public_loyalty_experience_v2(uuid, uuid) is
  'Returns one bounded English-only V2 guest projection; no locale, tenant, customer, or executable presentation authority is accepted.';
