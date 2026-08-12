-- Phase 9 hosted customer-copy localization. Copy is revisioned independently
-- from design tokens and is keyed only by an allowlisted locale in one linked
-- tenant workspace/programme scope.

create table loyalty.experience_translations (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null references loyalty.organizations(id) on delete cascade,
  workspace_id bigint not null,
  programme_group_id bigint not null,
  locale text not null check (locale in ('en', 'sl-SI')),
  revision integer not null default 1 check (revision > 0),
  hero_text text not null,
  points_label text not null,
  balance_label text not null,
  rewards_label text not null,
  redeem_label text not null,
  join_label text not null,
  earn_message text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, workspace_id, programme_group_id, locale),
  foreign key (organization_id, programme_group_id, workspace_id)
    references loyalty.programme_group_workspaces(
      organization_id, programme_group_id, workspace_id
    ) on delete cascade,
  check (length(hero_text) between 1 and 120 and hero_text = btrim(hero_text) and hero_text !~ '[[:cntrl:]]'),
  check (length(points_label) between 1 and 30 and points_label = btrim(points_label) and points_label !~ '[[:cntrl:]]'),
  check (length(balance_label) between 1 and 40 and balance_label = btrim(balance_label) and balance_label !~ '[[:cntrl:]]'),
  check (length(rewards_label) between 1 and 40 and rewards_label = btrim(rewards_label) and rewards_label !~ '[[:cntrl:]]'),
  check (length(redeem_label) between 1 and 30 and redeem_label = btrim(redeem_label) and redeem_label !~ '[[:cntrl:]]'),
  check (length(join_label) between 1 and 30 and join_label = btrim(join_label) and join_label !~ '[[:cntrl:]]'),
  check (length(earn_message) between 1 and 120 and earn_message = btrim(earn_message) and earn_message !~ '[[:cntrl:]]'),
  check (concat_ws('', hero_text, points_label, balance_label, rewards_label, redeem_label, join_label, earn_message) !~ '[<>]'),
  check (updated_at >= created_at)
);

create index experience_translations_tenant_scope_idx
  on loyalty.experience_translations (
    organization_id, workspace_id, programme_group_id, locale
  );

alter table loyalty.experience_translations owner to loyalty_owner;
alter table loyalty.experience_translations enable row level security;

create policy experience_translations_member_select
  on loyalty.experience_translations for select to authenticated
  using ((select loyalty_private.is_organization_member(organization_id)));

revoke all on loyalty.experience_translations
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant select on loyalty.experience_translations to authenticated;

create or replace function loyalty.save_experience_translation_command(
  target_workspace_public_id uuid,
  target_programme_group_public_id uuid,
  target_locale text,
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
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := loyalty_private.request_user_id();
  target_scope record;
  existing_audit loyalty.admin_audit_events%rowtype;
  existing_translation loyalty.experience_translations%rowtype;
  request_hash bytea;
  saved_public_id uuid;
  saved_revision integer;
  saved_outcome text;
begin
  if actor_user_id is null
    or target_workspace_public_id is null
    or target_programme_group_public_id is null
    or target_locale is null
    or target_locale not in ('en', 'sl-SI')
    or target_hero_text is null
    or length(target_hero_text) not between 1 and 120
    or target_hero_text <> btrim(target_hero_text)
    or target_hero_text ~ '[[:cntrl:]]'
    or target_points_label is null
    or length(target_points_label) not between 1 and 30
    or target_points_label <> btrim(target_points_label)
    or target_points_label ~ '[[:cntrl:]]'
    or target_balance_label is null
    or length(target_balance_label) not between 1 and 40
    or target_balance_label <> btrim(target_balance_label)
    or target_balance_label ~ '[[:cntrl:]]'
    or target_rewards_label is null
    or length(target_rewards_label) not between 1 and 40
    or target_rewards_label <> btrim(target_rewards_label)
    or target_rewards_label ~ '[[:cntrl:]]'
    or target_redeem_label is null
    or length(target_redeem_label) not between 1 and 30
    or target_redeem_label <> btrim(target_redeem_label)
    or target_redeem_label ~ '[[:cntrl:]]'
    or target_join_label is null
    or length(target_join_label) not between 1 and 30
    or target_join_label <> btrim(target_join_label)
    or target_join_label ~ '[[:cntrl:]]'
    or target_earn_message is null
    or length(target_earn_message) not between 1 and 120
    or target_earn_message <> btrim(target_earn_message)
    or target_earn_message ~ '[[:cntrl:]]'
    or concat_ws(
      '', target_hero_text, target_points_label, target_balance_label,
      target_rewards_label, target_redeem_label, target_join_label,
      target_earn_message
    ) ~ '[<>]'
    or target_idempotency_key is null
    or length(btrim(target_idempotency_key)) not between 1 and 255
    or target_idempotency_key <> btrim(target_idempotency_key)
    or target_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid experience translation input';
  end if;

  select link.organization_id, link.workspace_id, link.programme_group_id
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
      link.organization_id, array['owner', 'admin']::text[]
    )
  for update of link;
  if not found then
    raise exception using errcode = '42501', message = 'experience translation change not authorized';
  end if;

  request_hash := extensions.digest(
    convert_to(
      jsonb_build_object(
        'workspaceId', target_workspace_public_id,
        'programmeGroupId', target_programme_group_public_id,
        'locale', target_locale,
        'heroText', target_hero_text,
        'pointsLabel', target_points_label,
        'balanceLabel', target_balance_label,
        'rewardsLabel', target_rewards_label,
        'redeemLabel', target_redeem_label,
        'joinLabel', target_join_label,
        'earnMessage', target_earn_message
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
    if existing_audit.action <> 'experience.translation.save'
      or existing_audit.request_sha256 <> request_hash then
      raise exception using errcode = '23514', message = 'experience translation idempotency conflict';
    end if;
    return query select existing_audit.resource_public_id, 'duplicate'::text,
      (existing_audit.metadata ->> 'revision')::integer,
      existing_audit.metadata ->> 'locale';
    return;
  end if;

  select translation.* into existing_translation
  from loyalty.experience_translations as translation
  where translation.organization_id = target_scope.organization_id
    and translation.workspace_id = target_scope.workspace_id
    and translation.programme_group_id = target_scope.programme_group_id
    and translation.locale = target_locale
  for update;

  if found then
    update loyalty.experience_translations
    set hero_text = target_hero_text,
        points_label = target_points_label,
        balance_label = target_balance_label,
        rewards_label = target_rewards_label,
        redeem_label = target_redeem_label,
        join_label = target_join_label,
        earn_message = target_earn_message,
        revision = experience_translations.revision + 1,
        updated_at = now()
    where id = existing_translation.id
    returning public_id, experience_translations.revision
      into saved_public_id, saved_revision;
    saved_outcome := 'updated';
  else
    insert into loyalty.experience_translations (
      organization_id, workspace_id, programme_group_id, locale,
      hero_text, points_label, balance_label, rewards_label,
      redeem_label, join_label, earn_message
    ) values (
      target_scope.organization_id, target_scope.workspace_id,
      target_scope.programme_group_id, target_locale, target_hero_text,
      target_points_label, target_balance_label, target_rewards_label,
      target_redeem_label, target_join_label, target_earn_message
    ) returning public_id, experience_translations.revision
      into saved_public_id, saved_revision;
    saved_outcome := 'created';
  end if;

  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id,
    metadata
  ) values (
    target_scope.organization_id, actor_user_id,
    'experience.translation.save', 'experience_translation',
    saved_public_id, target_idempotency_key, request_hash,
    target_correlation_id,
    jsonb_build_object(
      'workspacePublicId', target_workspace_public_id,
      'programmeGroupPublicId', target_programme_group_public_id,
      'locale', target_locale,
      'revision', saved_revision
    )
  );

  return query select saved_public_id, saved_outcome, saved_revision, target_locale;
end;
$$;

alter function loyalty.save_experience_translation_command(
  uuid, uuid, text, text, text, text, text, text, text, text, text, uuid
) owner to loyalty_owner;
revoke all on function loyalty.save_experience_translation_command(
  uuid, uuid, text, text, text, text, text, text, text, text, text, uuid
) from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty.save_experience_translation_command(
  uuid, uuid, text, text, text, text, text, text, text, text, text, uuid
) to authenticated;

comment on table loyalty.experience_translations is
  'Revisioned allowlisted customer-facing copy per linked tenant experience scope and locale.';
comment on function loyalty.save_experience_translation_command(
  uuid, uuid, text, text, text, text, text, text, text, text, text, uuid
) is 'Creates or revisions one locale copy set and appends minimized immutable audit evidence.';
