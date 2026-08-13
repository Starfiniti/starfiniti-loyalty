-- Phase 9 hosted guest loyalty delivery. Anonymous callers receive only a
-- bounded projection from one active linked workspace and published programme.
-- No tenant identity, customer state, raw configuration, audit, or commerce
-- evidence crosses this boundary.

create or replace function loyalty.get_public_loyalty_experience(
  target_workspace_public_id uuid,
  target_programme_public_id uuid,
  target_locale text
)
returns table (
  workspace_public_id uuid,
  programme_public_id uuid,
  programme_group_public_id uuid,
  programme_name text,
  requested_locale text,
  resolved_locale text,
  brand_color text,
  display_font text,
  card_radius_px integer,
  show_tier boolean,
  show_rewards boolean,
  hero_text text,
  points_label text,
  balance_label text,
  rewards_label text,
  redeem_label text,
  join_label text,
  earn_message text,
  tiers jsonb,
  rewards jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    workspace.public_id,
    programme.public_id,
    programme_group.public_id,
    programme.name,
    target_locale,
    target_locale,
    coalesce(theme.brand_color, '#7c2d4f'),
    coalesce(theme.display_font, 'editorial-serif'),
    coalesce(theme.card_radius_px, 14)::integer,
    coalesce(theme.show_tier, true),
    coalesce(theme.show_rewards, true),
    coalesce(
      translation.hero_text,
      case when target_locale = 'sl-SI' then 'Lepota, ki vrača'
        when theme.hero_text !~ '[<>]' then theme.hero_text
        else 'Beauty that gives back' end
    ),
    coalesce(
      translation.points_label,
      case when target_locale = 'sl-SI' then 'Točke'
        when theme.points_label !~ '[<>]' then theme.points_label
        else 'Points' end
    ),
    coalesce(translation.balance_label,
      case when target_locale = 'sl-SI' then 'Vaše stanje' else 'Your balance' end),
    coalesce(translation.rewards_label,
      case when target_locale = 'sl-SI' then 'Vaše nagrade' else 'Your rewards' end),
    coalesce(translation.redeem_label,
      case when target_locale = 'sl-SI' then 'Unovči' else 'Redeem' end),
    coalesce(translation.join_label,
      case when target_locale = 'sl-SI' then 'Pridruži se brezplačno' else 'Join free' end),
    coalesce(translation.earn_message,
      case when target_locale = 'sl-SI'
        then 'Zbirajte točke pri vsakem upravičenem naročilu.'
        else 'Earn points on every eligible order.' end),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'code', tier.code,
          'name', tier.name,
          'minimumEligibleSpendMinor', tier.minimum_eligible_spend_minor::text,
          'pointsPerMajorUnit', tier.points_per_major_unit::text
        ) order by tier.ordinal
      )
      from (
        select materialized.*
        from loyalty.programme_tiers as materialized
        where materialized.organization_id = programme.organization_id
          and materialized.programme_version_id = version.id
          and materialized.name !~ '[[:cntrl:]<>]'
        order by materialized.ordinal
        limit 12
      ) as tier
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'code', reward.code,
          'name', reward.name,
          'kind', reward.reward_kind,
          'costPoints', reward.cost_points::text
        ) order by reward.id
      )
      from (
        select materialized.*
        from loyalty.programme_rewards as materialized
        where materialized.organization_id = programme.organization_id
          and materialized.programme_version_id = version.id
          and materialized.name !~ '[[:cntrl:]<>]'
        order by materialized.id
        limit 20
      ) as reward
    ), '[]'::jsonb)
  from loyalty.workspaces as workspace
  join loyalty.organizations as organization
    on organization.id = workspace.organization_id
   and organization.status = 'active'
  join loyalty.programme_group_workspaces as link
    on link.organization_id = workspace.organization_id
   and link.workspace_id = workspace.id
  join loyalty.programme_groups as programme_group
    on programme_group.organization_id = link.organization_id
   and programme_group.id = link.programme_group_id
   and programme_group.status = 'active'
  join loyalty.programmes as programme
    on programme.organization_id = link.organization_id
   and programme.programme_group_id = link.programme_group_id
   and programme.status = 'active'
   and programme.public_id = target_programme_public_id
  join loyalty.programme_versions as version
    on version.organization_id = programme.organization_id
   and version.programme_id = programme.id
   and version.status = 'published'
  left join loyalty.experience_themes as theme
    on theme.organization_id = link.organization_id
   and theme.workspace_id = link.workspace_id
   and theme.programme_group_id = link.programme_group_id
  left join loyalty.experience_translations as translation
    on translation.organization_id = link.organization_id
   and translation.workspace_id = link.workspace_id
   and translation.programme_group_id = link.programme_group_id
   and translation.locale = target_locale
  where workspace.public_id = target_workspace_public_id
    and workspace.status = 'active'
    and target_locale in ('en', 'sl-SI')
    and programme.name !~ '[[:cntrl:]<>]'
  limit 1;
$$;

alter function loyalty.get_public_loyalty_experience(uuid, uuid, text)
  owner to loyalty_owner;
grant usage on schema loyalty to anon;
revoke all on function loyalty.get_public_loyalty_experience(uuid, uuid, text)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty.get_public_loyalty_experience(uuid, uuid, text)
  to anon, authenticated;

comment on function loyalty.get_public_loyalty_experience(uuid, uuid, text) is
  'Returns a bounded guest-safe projection for one active published hosted loyalty experience.';
