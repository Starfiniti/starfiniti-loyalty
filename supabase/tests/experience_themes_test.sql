begin;

create extension if not exists pgtap with schema extensions;

select plan(76);

select has_table('loyalty', 'experience_themes', 'experience theme table exists');
select has_function(
  'loyalty_private',
  'enforce_storefront_experience_entitlement_v1',
  array[]::text[],
  'storefront authoring entitlement trigger function exists'
);
select results_eq(
  $$
    select routine.prosecdef
      and exists (
        select 1 from unnest(routine.proconfig) as setting
        where setting = 'search_path=""'
      )
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'loyalty_private'
      and routine.proname = 'enforce_storefront_experience_entitlement_v1'
  $$,
  array[true],
  'storefront authoring guard is security definer with an empty search path'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'loyalty_private.enforce_storefront_experience_entitlement_v1()',
    'EXECUTE'
  ),
  'browser sessions cannot call the private storefront guard directly'
);
select has_trigger(
  'loyalty', 'experience_themes',
  'zy_storefront_entitlement_experience_themes',
  'theme persistence resolves the storefront entitlement'
);
select has_trigger(
  'loyalty', 'experience_translations',
  'zy_storefront_entitlement_experience_translations',
  'copy persistence resolves the storefront entitlement'
);
select has_column('loyalty', 'experience_themes', 'density', 'V2 density column exists');
select has_column('loyalty', 'experience_themes', 'hero_asset', 'V2 controlled hero asset column exists');
select has_column('loyalty', 'experience_themes', 'show_referrals', 'V2 referral visibility column exists');
select has_column('loyalty', 'experience_themes', 'section_order', 'V2 section composition column exists');
select has_function(
  'loyalty',
  'save_experience_theme_v2_command',
  array[
    'uuid', 'uuid', 'text', 'text', 'integer', 'text', 'text', 'boolean',
    'boolean', 'text', 'text', 'text', 'boolean', 'text[]', 'text', 'uuid'
  ],
  'guarded V2 theme command exists'
);
select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.save_experience_theme_v2_command(uuid,uuid,text,text,integer,text,text,boolean,boolean,text,text,text,boolean,text[],text,uuid)',
    'EXECUTE'
  ),
  'authenticated users can enter the guarded V2 command'
);
select ok(
  not has_function_privilege(
    'anon',
    'loyalty.save_experience_theme_v2_command(uuid,uuid,text,text,integer,text,text,boolean,boolean,text,text,text,boolean,text[],text,uuid)',
    'EXECUTE'
  ),
  'anonymous users cannot enter the V2 command'
);
select results_eq(
  $$
    select routine.prosecdef
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'loyalty'
      and routine.proname = 'save_experience_theme_v2_command'
      and exists (
        select 1 from unnest(routine.proconfig) as setting
        where setting = 'search_path=""'
      )
  $$,
  array[true],
  'V2 command is security definer with an empty search path'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_constraint as constraint_row
    where constraint_row.conname = 'experience_themes_section_order_v2_check'
      and pg_get_constraintdef(constraint_row.oid) ~ 'cardinality'
      and pg_get_constraintdef(constraint_row.oid) ~ 'array_position'
  $$,
  array[1::bigint],
  'PostgreSQL independently constrains exact non-null section membership'
);
select has_function(
  'loyalty',
  'save_experience_theme_command',
  array['uuid', 'uuid', 'text', 'text', 'integer', 'text', 'text', 'boolean', 'boolean', 'text', 'text', 'uuid'],
  'guarded theme command exists'
);
select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.save_experience_theme_command(uuid,uuid,text,text,integer,text,text,boolean,boolean,text,text,uuid)',
    'EXECUTE'
  ),
  'authenticated users can enter the guarded command'
);
select ok(
  not has_function_privilege(
    'anon',
    'loyalty.save_experience_theme_command(uuid,uuid,text,text,integer,text,text,boolean,boolean,text,text,uuid)',
    'EXECUTE'
  ),
  'anonymous users cannot enter the theme command'
);
select results_eq(
  $$
    select routine.prosecdef
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'loyalty'
      and routine.proname = 'save_experience_theme_command'
  $$,
  array[true],
  'theme command is a security definer boundary'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'loyalty'
      and routine.proname = 'save_experience_theme_command'
      and exists (
        select 1 from unnest(routine.proconfig) as setting
        where setting like 'search_path=%'
      )
  $$,
  array[1::bigint],
  'theme command fixes an empty search path'
);
select ok(
  has_table_privilege('authenticated', 'loyalty.experience_themes', 'SELECT'),
  'authenticated members can read themes through RLS'
);
select ok(
  not has_table_privilege('authenticated', 'loyalty.experience_themes', 'INSERT'),
  'browser clients cannot insert theme rows directly'
);
select ok(
  not has_table_privilege('authenticated', 'loyalty.experience_themes', 'UPDATE'),
  'browser clients cannot update theme rows directly'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'loyalty_private.contrast_against_white(text)',
    'EXECUTE'
  ),
  'browser clients cannot call the private contrast helper'
);

insert into auth.users (id, email)
values
  ('75000000-0000-4000-8000-000000000001', 'theme-owner@example.test'),
  ('75000000-0000-4000-8000-000000000002', 'theme-admin@example.test'),
  ('75000000-0000-4000-8000-000000000003', 'theme-operator@example.test'),
  ('75000000-0000-4000-8000-000000000004', 'theme-analyst@example.test'),
  ('75000000-0000-4000-8000-000000000005', 'theme-auditor@example.test'),
  ('75000000-0000-4000-8000-000000000006', 'theme-revoked@example.test'),
  ('76000000-0000-4000-8000-000000000001', 'other-theme-owner@example.test');

insert into loyalty.organizations (public_id, slug, name)
values
  ('75000000-0000-4000-8000-000000000100', 'theme-one', 'Theme One'),
  ('76000000-0000-4000-8000-000000000100', 'theme-two', 'Theme Two');

insert into loyalty.organization_memberships (organization_id, user_id, role, revoked_at)
values
  ((select id from loyalty.organizations where slug = 'theme-one'), '75000000-0000-4000-8000-000000000001', 'owner', null),
  ((select id from loyalty.organizations where slug = 'theme-one'), '75000000-0000-4000-8000-000000000002', 'admin', null),
  ((select id from loyalty.organizations where slug = 'theme-one'), '75000000-0000-4000-8000-000000000003', 'operator', null),
  ((select id from loyalty.organizations where slug = 'theme-one'), '75000000-0000-4000-8000-000000000004', 'analyst', null),
  ((select id from loyalty.organizations where slug = 'theme-one'), '75000000-0000-4000-8000-000000000005', 'auditor', null),
  ((select id from loyalty.organizations where slug = 'theme-one'), '75000000-0000-4000-8000-000000000006', 'admin', now()),
  ((select id from loyalty.organizations where slug = 'theme-two'), '76000000-0000-4000-8000-000000000001', 'owner', null);

insert into loyalty.workspaces (public_id, organization_id, slug, name)
select
  case organization.slug
    when 'theme-one' then '75000000-0000-4000-8000-000000000110'::uuid
    else '76000000-0000-4000-8000-000000000110'::uuid
  end,
  organization.id,
  'store',
  organization.name || ' Store'
from loyalty.organizations as organization
where organization.slug in ('theme-one', 'theme-two');

insert into loyalty.programme_groups (public_id, organization_id, slug, name)
select
  case organization.slug
    when 'theme-one' then '75000000-0000-4000-8000-000000000120'::uuid
    else '76000000-0000-4000-8000-000000000120'::uuid
  end,
  organization.id,
  'rewards',
  organization.name || ' Rewards'
from loyalty.organizations as organization
where organization.slug in ('theme-one', 'theme-two');

insert into loyalty.programme_group_workspaces (
  organization_id, programme_group_id, workspace_id
)
select organization.id, programme_group.id, workspace.id
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
join loyalty.workspaces as workspace
  on workspace.organization_id = organization.id
where organization.slug in ('theme-one', 'theme-two');

set local role authenticated;
set local request.jwt.claim.sub = '75000000-0000-4000-8000-000000000001';

select results_eq(
  $$ select outcome from loyalty.save_experience_theme_command(
    '75000000-0000-4000-8000-000000000110',
    '75000000-0000-4000-8000-000000000120',
    '#7c2d4f', 'editorial-serif', 14, 'Beauty that gives back', 'Petals',
    true, true, 'right', 'theme:save:one',
    '75000000-0000-4000-8000-000000000201'
  ) $$,
  array['created'::text],
  'owner creates the workspace theme'
);
select results_eq(
  $$
    select workspace.public_id::text || '|' || programme_group.public_id::text
    from loyalty.experience_themes as theme
    join loyalty.workspaces as workspace on workspace.id = theme.workspace_id
    join loyalty.programme_groups as programme_group on programme_group.id = theme.programme_group_id
  $$,
  array['75000000-0000-4000-8000-000000000110|75000000-0000-4000-8000-000000000120'::text],
  'theme scope comes from the authorized linked workspace and programme group'
);
select results_eq(
  $$ select revision from loyalty.experience_themes $$,
  array[1],
  'first theme revision is one'
);
select results_eq(
  $$ select brand_color from loyalty.experience_themes $$,
  array['#7c2d4f'::text],
  'accessible brand color is retained exactly'
);
select results_eq(
  $$ select display_font || '|' || card_radius_px::text || '|' || widget_position from loyalty.experience_themes $$,
  array['editorial-serif|14|right'::text],
  'only the controlled font radius and position tokens are stored'
);
select results_eq(
  $$ select actor_user_id from loyalty.admin_audit_events where idempotency_key = 'theme:save:one' $$,
  array['75000000-0000-4000-8000-000000000001'::uuid],
  'audit actor comes from the verified request identity'
);
select results_eq(
  $$ select action || '|' || resource_type from loyalty.admin_audit_events where idempotency_key = 'theme:save:one' $$,
  array['experience.theme.save|experience_theme'::text],
  'theme audit uses a canonical action and resource type'
);
select results_eq(
  $$
    select (metadata ->> 'workspacePublicId') || '|' ||
      (metadata ->> 'programmeGroupPublicId') || '|' ||
      (metadata ->> 'revision')
    from loyalty.admin_audit_events where idempotency_key = 'theme:save:one'
  $$,
  array['75000000-0000-4000-8000-000000000110|75000000-0000-4000-8000-000000000120|1'::text],
  'audit retains public scope and revision without executable theme content'
);
select results_eq(
  $$ select octet_length(request_sha256) from loyalty.admin_audit_events where idempotency_key = 'theme:save:one' $$,
  array[32],
  'theme audit retains a SHA-256 request fingerprint'
);
select results_eq(
  $$ select outcome from loyalty.save_experience_theme_command(
    '75000000-0000-4000-8000-000000000110',
    '75000000-0000-4000-8000-000000000120',
    '#7c2d4f', 'editorial-serif', 14, 'Beauty that gives back', 'Petals',
    true, true, 'right', 'theme:save:one',
    '75000000-0000-4000-8000-000000000299'
  ) $$,
  array['duplicate'::text],
  'exact retry returns duplicate'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.experience_themes $$,
  array[1::bigint],
  'exact retry creates no second theme'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.admin_audit_events where idempotency_key = 'theme:save:one' $$,
  array[1::bigint],
  'exact retry creates no second audit event'
);
select throws_ok(
  $$ select * from loyalty.save_experience_theme_command(
    '75000000-0000-4000-8000-000000000110',
    '75000000-0000-4000-8000-000000000120',
    '#1f3a5f', 'system-sans', 8, 'Changed', 'Points',
    false, true, 'left', 'theme:save:one',
    '75000000-0000-4000-8000-000000000202'
  ) $$,
  '23514', 'experience theme idempotency conflict',
  'an idempotency key cannot be reused for different tokens'
);

set local request.jwt.claim.sub = '75000000-0000-4000-8000-000000000002';
select results_eq(
  $$ select outcome from loyalty.save_experience_theme_command(
    '75000000-0000-4000-8000-000000000110',
    '75000000-0000-4000-8000-000000000120',
    '#1f3a5f', 'system-sans', 8, 'Rewards made simple', 'Points',
    false, true, 'left', 'theme:save:two',
    '75000000-0000-4000-8000-000000000203'
  ) $$,
  array['updated'::text],
  'admin can revision the theme'
);
select results_eq(
  $$ select revision from loyalty.experience_themes $$,
  array[2],
  'authorized update increments the revision'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.experience_themes $$,
  array[1::bigint],
  'revision updates the same scoped resource'
);
select results_eq(
  $$ select brand_color || '|' || display_font || '|' || hero_text from loyalty.experience_themes $$,
  array['#1f3a5f|system-sans|Rewards made simple'::text],
  'authorized update replaces the complete bounded token set'
);
select results_eq(
  $$ select actor_user_id from loyalty.admin_audit_events where idempotency_key = 'theme:save:two' $$,
  array['75000000-0000-4000-8000-000000000002'::uuid],
  'update audit records the live admin identity'
);

set local request.jwt.claim.sub = '75000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select * from loyalty.save_experience_theme_command(
    '75000000-0000-4000-8000-000000000110', '75000000-0000-4000-8000-000000000120',
    '#fce7f3', 'system-sans', 14, 'Readable', 'Points', true, true, 'right',
    'theme:invalid:contrast', '75000000-0000-4000-8000-000000000204'
  ) $$,
  '22023', 'invalid experience theme input',
  'light brand colors that fail white-text contrast are rejected'
);
select throws_ok(
  $$ select * from loyalty.save_experience_theme_command(
    '75000000-0000-4000-8000-000000000110', '75000000-0000-4000-8000-000000000120',
    '#7C2D4F', 'system-sans', 14, 'Readable', 'Points', true, true, 'right',
    'theme:invalid:canonical', '75000000-0000-4000-8000-000000000205'
  ) $$,
  '22023', 'invalid experience theme input',
  'noncanonical uppercase color tokens are rejected'
);
select throws_ok(
  $$ select * from loyalty.save_experience_theme_command(
    '75000000-0000-4000-8000-000000000110', '75000000-0000-4000-8000-000000000120',
    '#7c2d4f', 'url(https://tracking.invalid/font.woff2)', 14, 'Readable', 'Points', true, true, 'right',
    'theme:invalid:font', '75000000-0000-4000-8000-000000000206'
  ) $$,
  '22023', 'invalid experience theme input',
  'remote font input is rejected'
);
select throws_ok(
  $$ select * from loyalty.save_experience_theme_command(
    '75000000-0000-4000-8000-000000000110', '75000000-0000-4000-8000-000000000120',
    '#7c2d4f', null::text, 14, 'Readable', 'Points', true, true, 'right',
    'theme:invalid:null', '75000000-0000-4000-8000-000000000212'
  ) $$,
  '22023', 'invalid experience theme input',
  'null controlled tokens fail with the canonical validation error'
);
select throws_ok(
  $$ select * from loyalty.save_experience_theme_command(
    '75000000-0000-4000-8000-000000000110', '75000000-0000-4000-8000-000000000120',
    '#7c2d4f', 'system-sans', 14, E'Bad\ncopy', 'Points', true, true, 'right',
    'theme:invalid:copy', '75000000-0000-4000-8000-000000000207'
  ) $$,
  '22023', 'invalid experience theme input',
  'control characters are rejected from customer copy'
);

set local request.jwt.claim.sub = '75000000-0000-4000-8000-000000000003';
select throws_ok(
  $$ select * from loyalty.save_experience_theme_command(
    '75000000-0000-4000-8000-000000000110', '75000000-0000-4000-8000-000000000120',
    '#7c2d4f', 'system-sans', 14, 'Operator', 'Points', true, true, 'right',
    'theme:operator', '75000000-0000-4000-8000-000000000208'
  ) $$,
  '42501', 'experience theme change not authorized',
  'operator cannot change customer-facing theme tokens'
);
set local request.jwt.claim.sub = '75000000-0000-4000-8000-000000000004';
select throws_ok(
  $$ select * from loyalty.save_experience_theme_command(
    '75000000-0000-4000-8000-000000000110', '75000000-0000-4000-8000-000000000120',
    '#7c2d4f', 'system-sans', 14, 'Analyst', 'Points', true, true, 'right',
    'theme:analyst', '75000000-0000-4000-8000-000000000209'
  ) $$,
  '42501', 'experience theme change not authorized',
  'analyst cannot change theme tokens'
);
set local request.jwt.claim.sub = '75000000-0000-4000-8000-000000000005';
select results_eq(
  $$ select count(*)::bigint from loyalty.experience_themes $$,
  array[1::bigint],
  'auditor can inspect the tenant theme'
);
select throws_ok(
  $$ select * from loyalty.save_experience_theme_command(
    '75000000-0000-4000-8000-000000000110', '75000000-0000-4000-8000-000000000120',
    '#7c2d4f', 'system-sans', 14, 'Auditor', 'Points', true, true, 'right',
    'theme:auditor', '75000000-0000-4000-8000-000000000210'
  ) $$,
  '42501', 'experience theme change not authorized',
  'auditor cannot change theme tokens'
);
set local request.jwt.claim.sub = '75000000-0000-4000-8000-000000000006';
select throws_ok(
  $$ select * from loyalty.save_experience_theme_command(
    '75000000-0000-4000-8000-000000000110', '75000000-0000-4000-8000-000000000120',
    '#7c2d4f', 'system-sans', 14, 'Revoked', 'Points', true, true, 'right',
    'theme:revoked', '75000000-0000-4000-8000-000000000211'
  ) $$,
  '42501', 'experience theme change not authorized',
  'revoked admin fails closed with a live token'
);
set local request.jwt.claim.sub = '76000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select * from loyalty.save_experience_theme_command(
    '75000000-0000-4000-8000-000000000110', '75000000-0000-4000-8000-000000000120',
    '#7c2d4f', 'system-sans', 14, 'Cross tenant', 'Points', true, true, 'right',
    'theme:cross-tenant', '76000000-0000-4000-8000-000000000201'
  ) $$,
  '42501', 'experience theme change not authorized',
  'another tenant owner cannot target this theme scope'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.experience_themes $$,
  array[0::bigint],
  'another tenant cannot read the theme row'
);

set local request.jwt.claim.sub = '75000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select outcome from loyalty.save_experience_theme_v2_command(
    '75000000-0000-4000-8000-000000000110',
    '75000000-0000-4000-8000-000000000120',
    '#4f46e5', 'modern-serif', 22, 'A clearer loyalty home', 'Stars',
    true, true, 'right', 'compact', 'crown', false,
    array['overview','rewards','earning','vip','history','referrals','account'],
    'theme:v2:save:one', '75000000-0000-4000-8000-000000000220'
  ) $$,
  array['updated'::text],
  'owner revisions the controlled V2 presentation'
);
select results_eq(
  $$ select density, hero_asset, show_referrals from loyalty.experience_themes $$,
  $$ values ('compact'::text, 'crown'::text, false) $$,
  'V2 stores only the controlled density asset and visibility tokens'
);
select results_eq(
  $$ select section_order from loyalty.experience_themes $$,
  $$ values (array['overview','rewards','earning','vip','history','referrals','account']::text[]) $$,
  'V2 preserves the exact approved semantic section order'
);
select results_eq(
  $$ select action from loyalty.admin_audit_events where idempotency_key = 'theme:v2:save:one' $$,
  array['experience.theme.v2.save'::text],
  'V2 writes distinct immutable audit evidence'
);
select results_eq(
  $$ select outcome from loyalty.save_experience_theme_v2_command(
    '75000000-0000-4000-8000-000000000110',
    '75000000-0000-4000-8000-000000000120',
    '#4f46e5', 'modern-serif', 22, 'A clearer loyalty home', 'Stars',
    true, true, 'right', 'compact', 'crown', false,
    array['overview','rewards','earning','vip','history','referrals','account'],
    'theme:v2:save:one', '75000000-0000-4000-8000-000000000221'
  ) $$,
  array['duplicate'::text],
  'an exact V2 retry creates one effect'
);
select throws_ok(
  $$ select * from loyalty.save_experience_theme_v2_command(
    '75000000-0000-4000-8000-000000000110',
    '75000000-0000-4000-8000-000000000120',
    '#4f46e5', 'modern-serif', 22, 'A clearer loyalty home', 'Stars',
    true, true, 'right', 'comfortable', 'crown', false,
    array['overview','rewards','earning','vip','history','referrals','account'],
    'theme:v2:save:one', '75000000-0000-4000-8000-000000000222'
  ) $$,
  '23514', 'experience theme V2 idempotency conflict',
  'V2 idempotency covers every presentation token'
);
select throws_ok(
  $$ select * from loyalty.save_experience_theme_v2_command(
    '75000000-0000-4000-8000-000000000110',
    '75000000-0000-4000-8000-000000000120',
    '#4f46e5', 'modern-serif', 22, 'A clearer loyalty home', 'Stars',
    true, true, 'right', 'compact', 'crown', false,
    array['overview','rewards','earning','vip','history','history','account'],
    'theme:v2:invalid:order', '75000000-0000-4000-8000-000000000223'
  ) $$,
  '22023', 'invalid experience theme V2 input',
  'duplicate or missing sections fail before persistence'
);
select throws_ok(
  $$ select * from loyalty.save_experience_theme_v2_command(
    '75000000-0000-4000-8000-000000000110',
    '75000000-0000-4000-8000-000000000120',
    '#4f46e5', 'modern-serif', 22, '<script>not copy</script>', 'Stars',
    true, true, 'right', 'compact', 'crown', false,
    array['overview','earning','rewards','vip','referrals','history','account'],
    'theme:v2:invalid:markup', '75000000-0000-4000-8000-000000000225'
  ) $$,
  '22023', 'invalid experience theme V2 input',
  'V2 presentation text rejects markup-shaped input before persistence'
);
set local request.jwt.claim.sub = '75000000-0000-4000-8000-000000000003';
select throws_ok(
  $$ select * from loyalty.save_experience_theme_v2_command(
    '75000000-0000-4000-8000-000000000110',
    '75000000-0000-4000-8000-000000000120',
    '#4f46e5', 'modern-serif', 22, 'Operator', 'Stars', true, true, 'right',
    'compact', 'crown', false,
    array['overview','earning','rewards','vip','referrals','history','account'],
    'theme:v2:operator', '75000000-0000-4000-8000-000000000224'
  ) $$,
  '42501', 'experience theme V2 change not authorized',
  'operator cannot change V2 presentation authority'
);
set local request.jwt.claim.sub = '76000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select * from loyalty.save_experience_theme_v2_command(
    '75000000-0000-4000-8000-000000000110',
    '75000000-0000-4000-8000-000000000120',
    '#4f46e5', 'modern-serif', 22, 'Cross tenant', 'Stars', true, true, 'right',
    'compact', 'crown', false,
    array['overview','earning','rewards','vip','referrals','history','account'],
    'theme:v2:cross', '76000000-0000-4000-8000-000000000224'
  ) $$,
  '42501', 'experience theme V2 change not authorized',
  'another tenant owner cannot target V2 presentation authority'
);
set local request.jwt.claim.sub = '75000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select outcome from loyalty.save_experience_theme_command(
    '75000000-0000-4000-8000-000000000110',
    '75000000-0000-4000-8000-000000000120',
    '#1f3a5f', 'system-sans', 14, 'Legacy update remains safe', 'Points',
    true, true, 'left', 'theme:legacy:after:v2',
    '75000000-0000-4000-8000-000000000225'
  ) $$,
  array['updated'::text],
  'legacy clients remain writable after the additive V2 rollout'
);
select results_eq(
  $$ select density, hero_asset, show_referrals, section_order
     from loyalty.experience_themes $$,
  $$ values (
    'compact'::text, 'crown'::text, false,
    array['overview','rewards','earning','vip','history','referrals','account']::text[]
  ) $$,
  'a legacy update cannot erase controlled V2 presentation state'
);

reset role;
select loyalty_private.set_deployment_mode(
  'managed', 1, 'test:storefront-entitlement',
  'Exercise managed storefront authoring denial', now()
);

set local role authenticated;
set local request.jwt.claim.sub = '75000000-0000-4000-8000-000000000001';
select results_eq(
  $$
    select enabled
    from loyalty.get_my_entitlements_v1(
      '75000000-0000-4000-8000-000000000100'
    )
    where capability_key = 'storefront.experience'
  $$,
  array[false],
  'managed storefront experience defaults disabled'
);
select throws_ok(
  $$ select * from loyalty.save_experience_theme_command(
    '75000000-0000-4000-8000-000000000110',
    '75000000-0000-4000-8000-000000000120',
    '#1f3a5f', 'system-sans', 14, 'Disabled legacy edit', 'Points',
    true, true, 'left', 'theme:disabled:legacy',
    '75000000-0000-4000-8000-000000000230'
  ) $$,
  '42501', 'storefront experience capability disabled',
  'disabled capability rejects legacy theme authoring'
);
select throws_ok(
  $$ select * from loyalty.save_experience_theme_v2_command(
    '75000000-0000-4000-8000-000000000110',
    '75000000-0000-4000-8000-000000000120',
    '#1f3a5f', 'system-sans', 14, 'Disabled V2 edit', 'Points',
    true, true, 'left', 'comfortable', 'sparkles', true,
    array['overview','earning','rewards','vip','referrals','history','account'],
    'theme:disabled:v2', '75000000-0000-4000-8000-000000000231'
  ) $$,
  '42501', 'storefront experience capability disabled',
  'disabled capability rejects V2 theme authoring'
);
select throws_ok(
  $$ select * from loyalty.save_experience_copy_v2_command(
    '75000000-0000-4000-8000-000000000110',
    '75000000-0000-4000-8000-000000000120',
    'Disabled copy', 'Points', 'Your balance', 'Your rewards',
    'Redeem', 'Join free', 'Earn points on eligible orders.',
    'copy:disabled:v2', '75000000-0000-4000-8000-000000000232'
  ) $$,
  '42501', 'storefront experience capability disabled',
  'disabled capability rejects English copy authoring'
);
select results_eq(
  $$ select revision from loyalty.experience_themes $$,
  array[3],
  'denied authoring leaves the existing theme revision unchanged'
);

reset role;
select loyalty_private.set_organization_entitlement(
  '75000000-0000-4000-8000-000000000100',
  'storefront.experience', 'enabled', null, 'canary',
  'test:storefront-entitlement',
  'Enable the reviewed storefront authoring canary', now(), null
);
set local role authenticated;
set local request.jwt.claim.sub = '75000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select outcome from loyalty.save_experience_theme_v2_command(
    '75000000-0000-4000-8000-000000000110',
    '75000000-0000-4000-8000-000000000120',
    '#1f3a5f', 'system-sans', 14, 'Enabled V2 edit', 'Points',
    true, true, 'left', 'comfortable', 'sparkles', true,
    array['overview','earning','rewards','vip','referrals','history','account'],
    'theme:enabled:v2', '75000000-0000-4000-8000-000000000233'
  ) $$,
  array['updated'::text],
  'explicit tenant canary enables V2 theme authoring'
);
select results_eq(
  $$ select outcome from loyalty.save_experience_copy_v2_command(
    '75000000-0000-4000-8000-000000000110',
    '75000000-0000-4000-8000-000000000120',
    'Enabled copy', 'Points', 'Your balance', 'Your rewards',
    'Redeem', 'Join free', 'Earn points on eligible orders.',
    'copy:enabled:v2', '75000000-0000-4000-8000-000000000234'
  ) $$,
  array['created'::text],
  'explicit tenant canary enables English copy authoring'
);

reset role;
select loyalty_private.set_organization_entitlement(
  '75000000-0000-4000-8000-000000000100',
  'storefront.experience', 'disabled', null, 'manual_override',
  'test:storefront-entitlement',
  'Disable new storefront authoring without hiding history', now(), null
);
set local role authenticated;
set local request.jwt.claim.sub = '75000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select * from loyalty.save_experience_copy_v2_command(
    '75000000-0000-4000-8000-000000000110',
    '75000000-0000-4000-8000-000000000120',
    'Denied again', 'Points', 'Your balance', 'Your rewards',
    'Redeem', 'Join free', 'Earn points on eligible orders.',
    'copy:disabled:again', '75000000-0000-4000-8000-000000000235'
  ) $$,
  '42501', 'storefront experience capability disabled',
  'a later disable decision stops new copy authoring'
);
select results_eq(
  $$
    select theme.revision::text || '|' || translation.revision::text
    from loyalty.experience_themes as theme
    join loyalty.experience_translations as translation
      on translation.organization_id = theme.organization_id
     and translation.workspace_id = theme.workspace_id
     and translation.programme_group_id = theme.programme_group_id
     and translation.locale = 'en'
  $$,
  array['4|1'::text],
  'disabled capability preserves readable theme and copy history'
);

reset role;
select throws_ok(
  $$ update loyalty.admin_audit_events set metadata = '{"tampered":true}'::jsonb $$,
  '55000', 'immutable loyalty history cannot be changed',
  'theme audit evidence cannot be rewritten'
);

select * from finish();
rollback;
