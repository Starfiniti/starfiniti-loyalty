begin;

create extension if not exists pgtap with schema extensions;

select plan(33);

select has_table('loyalty', 'experience_translations', 'experience translation table exists');
select has_function(
  'loyalty',
  'save_experience_translation_command',
  array['uuid', 'uuid', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'uuid'],
  'guarded translation command exists'
);
select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.save_experience_translation_command(uuid,uuid,text,text,text,text,text,text,text,text,text,uuid)',
    'EXECUTE'
  ),
  'authenticated users can enter the guarded translation command'
);
select ok(
  not has_function_privilege(
    'anon',
    'loyalty.save_experience_translation_command(uuid,uuid,text,text,text,text,text,text,text,text,text,uuid)',
    'EXECUTE'
  ),
  'anonymous users cannot enter the translation command'
);
select results_eq(
  $$ select routine.prosecdef
     from pg_proc as routine
     join pg_namespace as namespace on namespace.oid = routine.pronamespace
     where namespace.nspname = 'loyalty'
       and routine.proname = 'save_experience_translation_command'
       and exists (
         select 1 from unnest(routine.proconfig) as setting
         where setting = 'search_path=""'
       ) $$,
  array[true],
  'translation command is security definer with an empty search path'
);
select ok(
  has_table_privilege('authenticated', 'loyalty.experience_translations', 'SELECT'),
  'authenticated members can read translations through RLS'
);
select ok(
  not has_table_privilege('authenticated', 'loyalty.experience_translations', 'INSERT'),
  'browser clients cannot insert translations directly'
);
select ok(
  not has_table_privilege('authenticated', 'loyalty.experience_translations', 'UPDATE'),
  'browser clients cannot update translations directly'
);

insert into auth.users (id, email)
values
  ('79000000-0000-4000-8000-000000000001', 'translation-owner@example.test'),
  ('79000000-0000-4000-8000-000000000002', 'translation-admin@example.test'),
  ('79000000-0000-4000-8000-000000000003', 'translation-operator@example.test'),
  ('79000000-0000-4000-8000-000000000004', 'translation-auditor@example.test'),
  ('79000000-0000-4000-8000-000000000005', 'translation-revoked@example.test'),
  ('7a000000-0000-4000-8000-000000000001', 'translation-other@example.test');

insert into loyalty.organizations (public_id, slug, name)
values
  ('79000000-0000-4000-8000-000000000100', 'translation-one', 'Translation One'),
  ('7a000000-0000-4000-8000-000000000100', 'translation-two', 'Translation Two');
insert into loyalty.organization_memberships (organization_id, user_id, role, revoked_at)
values
  ((select id from loyalty.organizations where slug = 'translation-one'), '79000000-0000-4000-8000-000000000001', 'owner', null),
  ((select id from loyalty.organizations where slug = 'translation-one'), '79000000-0000-4000-8000-000000000002', 'admin', null),
  ((select id from loyalty.organizations where slug = 'translation-one'), '79000000-0000-4000-8000-000000000003', 'operator', null),
  ((select id from loyalty.organizations where slug = 'translation-one'), '79000000-0000-4000-8000-000000000004', 'auditor', null),
  ((select id from loyalty.organizations where slug = 'translation-one'), '79000000-0000-4000-8000-000000000005', 'admin', now()),
  ((select id from loyalty.organizations where slug = 'translation-two'), '7a000000-0000-4000-8000-000000000001', 'owner', null);
insert into loyalty.workspaces (public_id, organization_id, slug, name)
select
  case organization.slug
    when 'translation-one' then '79000000-0000-4000-8000-000000000110'::uuid
    else '7a000000-0000-4000-8000-000000000110'::uuid
  end,
  organization.id, 'store', organization.name || ' Store'
from loyalty.organizations as organization
where organization.slug in ('translation-one', 'translation-two');
insert into loyalty.programme_groups (public_id, organization_id, slug, name)
select
  case organization.slug
    when 'translation-one' then '79000000-0000-4000-8000-000000000120'::uuid
    else '7a000000-0000-4000-8000-000000000120'::uuid
  end,
  organization.id, 'rewards', organization.name || ' Rewards'
from loyalty.organizations as organization
where organization.slug in ('translation-one', 'translation-two');
insert into loyalty.programme_group_workspaces (
  organization_id, programme_group_id, workspace_id
)
select organization.id, programme_group.id, workspace.id
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
join loyalty.workspaces as workspace
  on workspace.organization_id = organization.id
where organization.slug in ('translation-one', 'translation-two');

set local role authenticated;
set local request.jwt.claim.sub = '79000000-0000-4000-8000-000000000001';

select results_eq(
  $$ select outcome from loyalty.save_experience_translation_command(
    '79000000-0000-4000-8000-000000000110',
    '79000000-0000-4000-8000-000000000120',
    'en', 'Beauty that gives back', 'Points', 'Your balance',
    'Your rewards', 'Redeem', 'Join free',
    'Earn points on every eligible order.',
    'experience:translation:en:create',
    '79000000-0000-4000-8000-000000000201'
  ) $$,
  array['created'::text],
  'owner creates English customer copy'
);
select results_eq(
  $$ select hero_text, points_label, balance_label, rewards_label,
       redeem_label, join_label, earn_message
     from loyalty.experience_translations where locale = 'en' $$,
  $$ values (
    'Beauty that gives back'::text, 'Points'::text, 'Your balance'::text,
    'Your rewards'::text, 'Redeem'::text, 'Join free'::text,
    'Earn points on every eligible order.'::text
  ) $$,
  'translation row retains exact bounded customer copy'
);
select results_eq(
  $$ select revision from loyalty.experience_translations where locale = 'en' $$,
  array[1],
  'first locale save starts at revision one'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.admin_audit_events
     where action = 'experience.translation.save' $$,
  array[1::bigint],
  'translation save appends one administration audit event'
);
select results_eq(
  $$ select metadata ? 'heroText' or metadata ? 'earnMessage'
     from loyalty.admin_audit_events
     where action = 'experience.translation.save' $$,
  array[false],
  'audit metadata omits translated customer copy'
);
select results_eq(
  $$ select outcome from loyalty.save_experience_translation_command(
    '79000000-0000-4000-8000-000000000110',
    '79000000-0000-4000-8000-000000000120',
    'en', 'Beauty that gives back', 'Points', 'Your balance',
    'Your rewards', 'Redeem', 'Join free',
    'Earn points on every eligible order.',
    'experience:translation:en:create',
    '79000000-0000-4000-8000-000000000202'
  ) $$,
  array['duplicate'::text],
  'exact retry returns the existing locale revision'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.admin_audit_events
     where action = 'experience.translation.save' $$,
  array[1::bigint],
  'exact retry creates no second audit event'
);
select throws_ok(
  $$ select * from loyalty.save_experience_translation_command(
    '79000000-0000-4000-8000-000000000110',
    '79000000-0000-4000-8000-000000000120',
    'en', 'Changed under same key', 'Points', 'Your balance',
    'Your rewards', 'Redeem', 'Join free',
    'Earn points on every eligible order.',
    'experience:translation:en:create',
    '79000000-0000-4000-8000-000000000203'
  ) $$,
  '23514', 'experience translation idempotency conflict',
  'changed copy conflicts under one idempotency key'
);

set local request.jwt.claim.sub = '79000000-0000-4000-8000-000000000002';
select results_eq(
  $$ select outcome from loyalty.save_experience_translation_command(
    '79000000-0000-4000-8000-000000000110',
    '79000000-0000-4000-8000-000000000120',
    'en', 'Loyalty that gives back', 'Points', 'Your balance',
    'Your rewards', 'Redeem', 'Join free',
    'Earn points on every eligible order.',
    'experience:translation:en:update',
    '79000000-0000-4000-8000-000000000204'
  ) $$,
  array['updated'::text],
  'admin can revision existing English copy'
);
select results_eq(
  $$ select revision from loyalty.experience_translations where locale = 'en' $$,
  array[2],
  'translation revision increments monotonically'
);
select results_eq(
  $$ select locale from loyalty.save_experience_translation_command(
    '79000000-0000-4000-8000-000000000110',
    '79000000-0000-4000-8000-000000000120',
    'sl-SI', 'Lepota, ki vrača', 'Točke', 'Vaše stanje',
    'Vaše nagrade', 'Unovči', 'Pridruži se brezplačno',
    'Zbirajte točke pri vsakem upravičenem naročilu.',
    'experience:translation:sl:create',
    '79000000-0000-4000-8000-000000000205'
  ) $$,
  array['sl-SI'::text],
  'admin creates the allowlisted Slovenian locale'
);
select results_eq(
  $$ select locale from loyalty.experience_translations order by locale $$,
  $$ values ('en'::text), ('sl-SI'::text) $$,
  'one scope can retain both supported locales'
);

set local request.jwt.claim.sub = '79000000-0000-4000-8000-000000000003';
select throws_ok(
  $$ select * from loyalty.save_experience_translation_command(
    '79000000-0000-4000-8000-000000000110',
    '79000000-0000-4000-8000-000000000120',
    'en', 'Operator copy attempt', 'Points', 'Your balance',
    'Your rewards', 'Redeem', 'Join free', 'Earn points.',
    'experience:translation:operator', '79000000-0000-4000-8000-000000000206'
  ) $$,
  '42501', 'experience translation change not authorized',
  'operator cannot alter customer copy'
);
set local request.jwt.claim.sub = '79000000-0000-4000-8000-000000000004';
select throws_ok(
  $$ select * from loyalty.save_experience_translation_command(
    '79000000-0000-4000-8000-000000000110',
    '79000000-0000-4000-8000-000000000120',
    'en', 'Auditor copy attempt', 'Points', 'Your balance',
    'Your rewards', 'Redeem', 'Join free', 'Earn points.',
    'experience:translation:auditor', '79000000-0000-4000-8000-000000000207'
  ) $$,
  '42501', 'experience translation change not authorized',
  'auditor remains read-only'
);
set local request.jwt.claim.sub = '79000000-0000-4000-8000-000000000005';
select throws_ok(
  $$ select * from loyalty.save_experience_translation_command(
    '79000000-0000-4000-8000-000000000110',
    '79000000-0000-4000-8000-000000000120',
    'en', 'Revoked copy attempt', 'Points', 'Your balance',
    'Your rewards', 'Redeem', 'Join free', 'Earn points.',
    'experience:translation:revoked', '79000000-0000-4000-8000-000000000208'
  ) $$,
  '42501', 'experience translation change not authorized',
  'revoked admin fails closed'
);
set local request.jwt.claim.sub = '7a000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select * from loyalty.save_experience_translation_command(
    '79000000-0000-4000-8000-000000000110',
    '79000000-0000-4000-8000-000000000120',
    'en', 'Other tenant attempt', 'Points', 'Your balance',
    'Your rewards', 'Redeem', 'Join free', 'Earn points.',
    'experience:translation:other', '79000000-0000-4000-8000-000000000209'
  ) $$,
  '42501', 'experience translation change not authorized',
  'another tenant owner cannot target this copy scope'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.experience_translations $$,
  array[0::bigint],
  'translation rows are tenant isolated by RLS'
);

set local request.jwt.claim.sub = '79000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select count(*)::bigint from loyalty.experience_translations $$,
  array[2::bigint],
  'tenant owner reads both locale rows'
);
select throws_ok(
  $$ select * from loyalty.save_experience_translation_command(
    '79000000-0000-4000-8000-000000000110',
    '79000000-0000-4000-8000-000000000120',
    'fr', 'French copy', 'Points', 'Balance', 'Rewards', 'Redeem',
    'Join', 'Earn points.', 'experience:translation:fr',
    '79000000-0000-4000-8000-000000000210'
  ) $$,
  '22023', 'invalid experience translation input',
  'unsupported locale fails closed'
);
select throws_ok(
  $$ select * from loyalty.save_experience_translation_command(
    '79000000-0000-4000-8000-000000000110',
    '79000000-0000-4000-8000-000000000120',
    'en', E'Unsafe\ncopy', 'Points', 'Balance', 'Rewards', 'Redeem',
    'Join', 'Earn points.', 'experience:translation:control',
    '79000000-0000-4000-8000-000000000211'
  ) $$,
  '22023', 'invalid experience translation input',
  'control characters fail closed'
);
select throws_ok(
  $$ select * from loyalty.save_experience_translation_command(
    '79000000-0000-4000-8000-000000000110',
    '79000000-0000-4000-8000-000000000120',
    'en', 'Safe headline', 'Points', 'Balance', 'Rewards', 'Redeem',
    'Join', '<script>unsafe</script>', 'experience:translation:markup',
    '79000000-0000-4000-8000-000000000213'
  ) $$,
  '22023', 'invalid experience translation input',
  'markup-shaped customer copy fails closed'
);
select throws_ok(
  $$ select * from loyalty.save_experience_translation_command(
    '7a000000-0000-4000-8000-000000000110',
    '79000000-0000-4000-8000-000000000120',
    'en', 'Mixed scope', 'Points', 'Balance', 'Rewards', 'Redeem',
    'Join', 'Earn points.', 'experience:translation:mixed',
    '79000000-0000-4000-8000-000000000212'
  ) $$,
  '42501', 'experience translation change not authorized',
  'mixed workspace and programme scope fails closed'
);

reset role;
select throws_ok(
  $$ update loyalty.admin_audit_events set metadata = '{"tampered":true}'::jsonb
     where action = 'experience.translation.save' $$,
  '55000', 'immutable loyalty history cannot be changed',
  'translation audit evidence cannot be rewritten'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.experience_translations $$,
  array[2::bigint],
  'failed commands leave exactly the two approved locale rows'
);
select results_eq(
  $$ select actor_user_id from loyalty.admin_audit_events
     where idempotency_key = 'experience:translation:sl:create' $$,
  array['79000000-0000-4000-8000-000000000002'::uuid],
  'translation audit actor is derived from Auth claims'
);

select * from finish();
rollback;
