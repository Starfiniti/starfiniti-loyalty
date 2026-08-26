begin;

create extension if not exists pgtap with schema extensions;

select plan(62);

select has_table('loyalty', 'organization_invitations', 'organization invitations exist');
select has_table('loyalty_private', 'organization_creation_receipts', 'creation receipts exist');
select has_column('loyalty', 'organizations', 'lifecycle_revision', 'organizations carry optimistic lifecycle revisions');
select has_column('loyalty', 'organization_memberships', 'display_label', 'memberships carry a non-authoritative display label');
select ok(
  (select relrowsecurity from pg_class where oid = 'loyalty.organization_invitations'::regclass)
  and (select relrowsecurity from pg_class where oid = 'loyalty_private.organization_creation_receipts'::regclass),
  'new lifecycle tables enable RLS'
);
select ok(
  not has_table_privilege('authenticated', 'loyalty.organization_invitations', 'SELECT')
  and not has_table_privilege('authenticated', 'loyalty.organization_invitations', 'INSERT')
  and not has_table_privilege('loyalty_runtime', 'loyalty.organization_invitations', 'SELECT')
  and not has_table_privilege('loyalty_worker', 'loyalty.organization_invitations', 'SELECT'),
  'application roles have no direct invitation-table access'
);
select results_eq(
  $$
    select count(*)::bigint from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'loyalty'
      and routine.proname in (
        'create_organization_command_v1',
        'update_organization_lifecycle_command_v1',
        'create_organization_invitation_command_v1',
        'accept_organization_invitation_command_v1',
        'revoke_organization_invitation_command_v1',
        'update_organization_member_command_v1',
        'get_organization_team_workspace_v1'
      )
  $$,
  array[7::bigint],
  'seven exact public lifecycle boundaries exist'
);
select ok(
  has_function_privilege('authenticated', 'loyalty.create_organization_command_v1(text,text,text,uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'loyalty.get_organization_team_workspace_v1(uuid)', 'EXECUTE'),
  'authenticated sessions may enter the lifecycle boundaries'
);
select ok(
  not has_function_privilege('anon', 'loyalty.create_organization_command_v1(text,text,text,uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'loyalty.get_organization_team_workspace_v1(uuid)', 'EXECUTE'),
  'anonymous sessions cannot enter lifecycle boundaries'
);
select results_eq(
  $$
    select count(*)::bigint from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'loyalty'
      and routine.proname in (
        'create_organization_command_v1',
        'update_organization_lifecycle_command_v1',
        'create_organization_invitation_command_v1',
        'accept_organization_invitation_command_v1',
        'revoke_organization_invitation_command_v1',
        'update_organization_member_command_v1',
        'get_organization_team_workspace_v1'
      )
      and routine.prosecdef
      and exists (select 1 from unnest(routine.proconfig) as setting where setting = 'search_path=""')
      and exists (select 1 from unnest(routine.proconfig) as setting where setting = 'statement_timeout=5s')
  $$,
  array[7::bigint],
  'all lifecycle boundaries fix search path and statement timeout'
);
select results_eq(
  $$
    select count(*)::bigint from information_schema.parameters
    where specific_schema = 'loyalty'
      and specific_name like any(array[
        'create_organization_command_v1_%',
        'update_organization_lifecycle_command_v1_%',
        'create_organization_invitation_command_v1_%',
        'accept_organization_invitation_command_v1_%',
        'revoke_organization_invitation_command_v1_%',
        'update_organization_member_command_v1_%',
        'get_organization_team_workspace_v1_%'
      ])
      and parameter_name in ('actor_user_id', 'user_id', 'email', 'domain', 'group', 'claims')
  $$,
  array[0::bigint],
  'public boundaries accept no actor email domain group or claim authority'
);
select results_eq(
  $$
    select count(*)::bigint from information_schema.columns
    where table_schema = 'loyalty' and table_name = 'organization_invitations'
      and column_name in ('token', 'secret', 'email', 'domain', 'provider_subject')
  $$,
  array[0::bigint],
  'invitation storage has no raw token email domain or provider subject column'
);

insert into auth.users (id, email)
values
  ('9a000000-0000-4000-8000-000000000001', 'lifecycle-owner@example.test'),
  ('9a000000-0000-4000-8000-000000000002', 'lifecycle-admin@example.test'),
  ('9a000000-0000-4000-8000-000000000003', 'lifecycle-invitee@example.test'),
  ('9a000000-0000-4000-8000-000000000004', 'lifecycle-auditor@example.test'),
  ('9a000000-0000-4000-8000-000000000005', 'lifecycle-other@example.test'),
  ('9a000000-0000-4000-8000-000000000006', 'lifecycle-creator@example.test');

insert into loyalty.organizations (public_id, slug, name)
values
  ('9a000000-0000-4000-8000-000000000100', 'lifecycle-main', 'Lifecycle Main'),
  ('9a000000-0000-4000-8000-000000000200', 'lifecycle-other', 'Lifecycle Other');
insert into loyalty.organization_memberships (
  public_id, organization_id, user_id, role, display_label
)
select member.public_id, organization.id, member.user_id, member.role, member.display_label
from loyalty.organizations as organization
cross join (values
  ('9a000000-0000-4000-8000-000000000101'::uuid, '9a000000-0000-4000-8000-000000000001'::uuid, 'owner'::text, 'Primary owner'::text),
  ('9a000000-0000-4000-8000-000000000102'::uuid, '9a000000-0000-4000-8000-000000000002'::uuid, 'admin'::text, 'Operations admin'::text),
  ('9a000000-0000-4000-8000-000000000104'::uuid, '9a000000-0000-4000-8000-000000000004'::uuid, 'auditor'::text, 'Security auditor'::text)
) as member(public_id, user_id, role, display_label)
where organization.slug = 'lifecycle-main';
insert into loyalty.organization_memberships (organization_id, user_id, role, display_label)
select id, '9a000000-0000-4000-8000-000000000005', 'owner', 'Other owner'
from loyalty.organizations where slug = 'lifecycle-other';

set local role authenticated;
set local request.jwt.claim.sub = '9a000000-0000-4000-8000-000000000006';

select results_eq(
  $$
    select outcome from loyalty.create_organization_command_v1(
      'creator-company', 'Creator Company', 'organization:create:creator',
      '9a000000-0000-4000-8000-000000000601'
    )
  $$,
  array['created'::text],
  'an authenticated subject creates an organization and becomes its owner'
);
select results_eq(
  $$
    select outcome from loyalty.create_organization_command_v1(
      'creator-company', 'Creator Company', 'organization:create:creator',
      '9a000000-0000-4000-8000-000000000601'
    )
  $$,
  array['duplicate'::text],
  'organization creation retries return the same effect'
);
select throws_ok(
  $$
    select * from loyalty.create_organization_command_v1(
      'creator-company-changed', 'Changed Company', 'organization:create:creator',
      '9a000000-0000-4000-8000-000000000601'
    )
  $$,
  '23514', 'organization command idempotency conflict',
  'changed organization creation reuse fails closed'
);
reset role;
select results_eq(
  $$
    select membership.role from loyalty.organization_memberships as membership
    join loyalty.organizations as organization on organization.id = membership.organization_id
    where organization.slug = 'creator-company'
      and membership.user_id = '9a000000-0000-4000-8000-000000000006'
      and membership.revoked_at is null
  $$,
  array['owner'::text],
  'creation atomically establishes one live owner membership'
);
select results_eq(
  $$
    select count(*)::bigint from loyalty.admin_audit_events as audit
    join loyalty.organizations as organization on organization.id = audit.organization_id
    where organization.slug = 'creator-company' and audit.action = 'organization.create'
  $$,
  array[1::bigint],
  'organization creation appends one immutable audit event'
);

set local role authenticated;
set local request.jwt.claim.sub = '9a000000-0000-4000-8000-000000000002';
select results_eq(
  $$
    select outcome from loyalty.create_organization_invitation_command_v1(
      '9a000000-0000-4000-8000-000000000100', 'Campaign specialist', 'marketer',
      statement_timestamp() + interval '2 days', repeat('a', 64),
      'invitation:create:marketer', '9a000000-0000-4000-8000-000000000602'
    )
  $$,
  array['created'::text],
  'an admin creates a bounded non-owner invitation'
);
reset role;
select results_eq(
  $$
    select octet_length(token_sha256)::bigint from loyalty.organization_invitations
    where display_label = 'Campaign specialist'
  $$,
  array[32::bigint],
  'only the exact 32-byte invitation digest is retained'
);
select is_empty(
  $$
    select invitation.public_id from loyalty.organization_invitations as invitation
    where invitation.token_sha256 = convert_to(repeat('a', 64), 'UTF8')
  $$,
  'the raw invitation material is not stored'
);
set local role authenticated;
set local request.jwt.claim.sub = '9a000000-0000-4000-8000-000000000002';
select throws_ok(
  $$
    select * from loyalty.create_organization_invitation_command_v1(
      '9a000000-0000-4000-8000-000000000100', 'Unapproved owner', 'owner',
      statement_timestamp() + interval '2 days', repeat('b', 64),
      'invitation:create:owner-admin', '9a000000-0000-4000-8000-000000000603'
    )
  $$,
  '42501', 'organization invitation command not authorized',
  'an admin cannot invite an owner'
);

set local request.jwt.claim.sub = '9a000000-0000-4000-8000-000000000003';
select results_eq(
  $$
    select outcome from loyalty.accept_organization_invitation_command_v1(
      repeat('a', 64), 'invitation:accept:marketer',
      '9a000000-0000-4000-8000-000000000604'
    )
  $$,
  array['created'::text],
  'the signed-in subject consumes the one-use capability'
);
reset role;
select results_eq(
  $$
    select role from loyalty.organization_memberships
    where user_id = '9a000000-0000-4000-8000-000000000003'
      and organization_id = (select id from loyalty.organizations where slug = 'lifecycle-main')
      and revoked_at is null
  $$,
  array['marketer'::text],
  'invitation acceptance applies the invitation role exactly'
);
set local role authenticated;
set local request.jwt.claim.sub = '9a000000-0000-4000-8000-000000000003';
select results_eq(
  $$
    select outcome from loyalty.accept_organization_invitation_command_v1(
      repeat('a', 64), 'invitation:accept:marketer',
      '9a000000-0000-4000-8000-000000000604'
    )
  $$,
  array['duplicate'::text],
  'the exact acceptance retry creates no second membership'
);
set local request.jwt.claim.sub = '9a000000-0000-4000-8000-000000000005';
select throws_ok(
  $$
    select * from loyalty.accept_organization_invitation_command_v1(
      repeat('a', 64), 'invitation:accept:stolen',
      '9a000000-0000-4000-8000-000000000605'
    )
  $$,
  '42501', 'organization invitation unavailable',
  'a consumed invitation cannot grant another subject'
);
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '9a000000-0000-4000-8000-000000000001';
select results_eq(
  $$
    select outcome from loyalty.create_organization_invitation_command_v1(
      '9a000000-0000-4000-8000-000000000100', 'Temporary operator', 'operator',
      statement_timestamp() + interval '2 days', repeat('c', 64),
      'invitation:create:revoke', '9a000000-0000-4000-8000-000000000606'
    )
  $$,
  array['created'::text],
  'an owner creates a second pending invitation'
);
select results_eq(
  $$
    select outcome from loyalty.revoke_organization_invitation_command_v1(
      '9a000000-0000-4000-8000-000000000100',
      (
        select (entry.value ->> 'id')::uuid
        from loyalty.get_organization_team_workspace_v1(
          '9a000000-0000-4000-8000-000000000100'
        ) as team,
        lateral jsonb_array_elements(team.workspace -> 'invitations') as entry(value)
        where entry.value ->> 'displayLabel' = 'Temporary operator'
      ),
      'The role is no longer required.', 'invitation:revoke:operator',
      '9a000000-0000-4000-8000-000000000607'
    )
  $$,
  array['revoked'::text],
  'a pending invitation can be revoked immediately'
);
select results_eq(
  $$
    select outcome from loyalty.revoke_organization_invitation_command_v1(
      '9a000000-0000-4000-8000-000000000100',
      (
        select (entry.value ->> 'id')::uuid
        from loyalty.get_organization_team_workspace_v1(
          '9a000000-0000-4000-8000-000000000100'
        ) as team,
        lateral jsonb_array_elements(team.workspace -> 'invitations') as entry(value)
        where entry.value ->> 'displayLabel' = 'Temporary operator'
      ),
      'The role is no longer required.', 'invitation:revoke:operator',
      '9a000000-0000-4000-8000-000000000607'
    )
  $$,
  array['duplicate'::text],
  'invitation revocation retries once'
);
set local request.jwt.claim.sub = '9a000000-0000-4000-8000-000000000005';
select throws_ok(
  $$ select * from loyalty.accept_organization_invitation_command_v1(
    repeat('c', 64), 'invitation:accept:revoked', '9a000000-0000-4000-8000-000000000608'
  ) $$,
  '42501', 'organization invitation unavailable',
  'a revoked capability grants no membership'
);
reset role;

insert into loyalty.organization_invitations (
  organization_id, token_sha256, display_label, role, created_by_user_id,
  expires_at, created_at, updated_at
)
select id, decode(repeat('d', 64), 'hex'), 'Expired analyst', 'analyst',
  '9a000000-0000-4000-8000-000000000001', statement_timestamp() - interval '1 hour',
  statement_timestamp() - interval '2 hours', statement_timestamp() - interval '2 hours'
from loyalty.organizations where slug = 'lifecycle-main';
set local role authenticated;
set local request.jwt.claim.sub = '9a000000-0000-4000-8000-000000000005';
select throws_ok(
  $$ select * from loyalty.accept_organization_invitation_command_v1(
    repeat('d', 64), 'invitation:accept:expired', '9a000000-0000-4000-8000-000000000609'
  ) $$,
  '42501', 'organization invitation unavailable',
  'an expired capability grants no membership'
);

set local request.jwt.claim.sub = '9a000000-0000-4000-8000-000000000002';
select results_eq(
  $$
    select outcome from loyalty.update_organization_member_command_v1(
      '9a000000-0000-4000-8000-000000000100',
      (select public_id from loyalty.organization_memberships where user_id = '9a000000-0000-4000-8000-000000000003'),
      1, 'change_role', 'analyst', 'Approved analytical responsibility.',
      'membership:role:analyst', '9a000000-0000-4000-8000-000000000610'
    )
  $$,
  array['updated'::text],
  'an admin changes a non-owner role'
);
reset role;
select results_eq(
  $$ select role from loyalty.organization_memberships where user_id = '9a000000-0000-4000-8000-000000000003' $$,
  array['analyst'::text],
  'the role projection matches the audited mutation'
);
set local role authenticated;
set local request.jwt.claim.sub = '9a000000-0000-4000-8000-000000000002';
select throws_ok(
  $$
    select * from loyalty.update_organization_member_command_v1(
      '9a000000-0000-4000-8000-000000000100',
      (select public_id from loyalty.organization_memberships where user_id = '9a000000-0000-4000-8000-000000000003'),
      1, 'change_role', 'operator', 'Changed request must not replay.',
      'membership:role:analyst', '9a000000-0000-4000-8000-000000000610'
    )
  $$,
  '23514', 'organization member idempotency conflict',
  'changed member-command reuse fails closed'
);
select throws_ok(
  $$
    select * from loyalty.update_organization_member_command_v1(
      '9a000000-0000-4000-8000-000000000100',
      (select public_id from loyalty.organization_memberships where user_id = '9a000000-0000-4000-8000-000000000003'),
      2, 'change_role', 'owner', 'Unapproved owner promotion attempt.',
      'membership:role:owner-admin', '9a000000-0000-4000-8000-000000000611'
    )
  $$,
  '42501', 'owner membership requires owner authority',
  'an admin cannot promote an owner'
);
set local request.jwt.claim.sub = '9a000000-0000-4000-8000-000000000001';
select results_eq(
  $$
    select outcome from loyalty.update_organization_member_command_v1(
      '9a000000-0000-4000-8000-000000000100',
      (select public_id from loyalty.organization_memberships where user_id = '9a000000-0000-4000-8000-000000000003'),
      2, 'change_role', 'owner', 'Approved second recovery owner.',
      'membership:role:owner', '9a000000-0000-4000-8000-000000000612'
    )
  $$,
  array['updated'::text],
  'an owner may establish a second owner'
);
reset role;
select results_eq(
  $$
    select count(*)::bigint from loyalty.organization_memberships
    where organization_id = (select id from loyalty.organizations where slug = 'lifecycle-main')
      and role = 'owner' and revoked_at is null
  $$,
  array[2::bigint],
  'the organization now has two active owners'
);
set local role authenticated;
set local request.jwt.claim.sub = '9a000000-0000-4000-8000-000000000001';
select results_eq(
  $$
    select outcome from loyalty.update_organization_member_command_v1(
      '9a000000-0000-4000-8000-000000000100',
      (select public_id from loyalty.organization_memberships where user_id = '9a000000-0000-4000-8000-000000000003'),
      3, 'change_role', 'admin', 'Recovery-owner exercise completed.',
      'membership:role:admin', '9a000000-0000-4000-8000-000000000613'
    )
  $$,
  array['updated'::text],
  'one of two owners can be demoted safely'
);
reset role;
select results_eq(
  $$
    select count(*)::bigint from loyalty.organization_memberships
    where organization_id = (select id from loyalty.organizations where slug = 'lifecycle-main')
      and role = 'owner' and revoked_at is null
  $$,
  array[1::bigint],
  'owner quorum returns to one'
);
set local role authenticated;
set local request.jwt.claim.sub = '9a000000-0000-4000-8000-000000000001';
select throws_ok(
  $$
    select * from loyalty.update_organization_member_command_v1(
      '9a000000-0000-4000-8000-000000000100',
      '9a000000-0000-4000-8000-000000000101', 1, 'revoke', null,
      'The final owner cannot be removed.', 'membership:revoke:last-owner',
      '9a000000-0000-4000-8000-000000000614'
    )
  $$,
  '23514', 'organization must retain an active owner',
  'the final owner cannot be revoked'
);
select throws_ok(
  $$
    select * from loyalty.update_organization_member_command_v1(
      '9a000000-0000-4000-8000-000000000100',
      (select public_id from loyalty.organization_memberships where user_id = '9a000000-0000-4000-8000-000000000003'),
      3, 'revoke', null, 'Stale revision must not revoke access.',
      'membership:revoke:stale', '9a000000-0000-4000-8000-000000000615'
    )
  $$,
  '40001', 'stale organization membership revision',
  'a stale member revision fails closed'
);
select results_eq(
  $$
    select outcome from loyalty.update_organization_member_command_v1(
      '9a000000-0000-4000-8000-000000000100',
      (select public_id from loyalty.organization_memberships where user_id = '9a000000-0000-4000-8000-000000000003'),
      4, 'revoke', null, 'Remove completed temporary access.',
      'membership:revoke:invitee', '9a000000-0000-4000-8000-000000000616'
    )
  $$,
  array['revoked'::text],
  'a member is revoked through one audited command'
);
set local request.jwt.claim.sub = '9a000000-0000-4000-8000-000000000003';
select is_empty(
  $$ select * from loyalty.get_organization_team_workspace_v1('9a000000-0000-4000-8000-000000000100') $$,
  'revocation fails on the next request even with a live token'
);
set local request.jwt.claim.sub = '9a000000-0000-4000-8000-000000000005';
select is_empty(
  $$ select * from loyalty.get_organization_team_workspace_v1('9a000000-0000-4000-8000-000000000100') $$,
  'a cross-tenant selector returns no team data'
);
set local request.jwt.claims = '{"sub":"9a000000-0000-4000-8000-000000000005","email":"owner@lifecycle-main.test","role":"owner","groups":["tenant-admin"]}';
select is_empty(
  $$ select * from loyalty.get_organization_team_workspace_v1('9a000000-0000-4000-8000-000000000100') $$,
  'forged email role and group claims grant no team access'
);
reset request.jwt.claims;

set local request.jwt.claim.sub = '9a000000-0000-4000-8000-000000000001';
select results_eq(
  $$
    select status || ':' || revision::text from loyalty.update_organization_lifecycle_command_v1(
      '9a000000-0000-4000-8000-000000000100', 1, 'rename', 'Lifecycle Renamed',
      'Approved legal organization rename.', 'organization:rename:main',
      '9a000000-0000-4000-8000-000000000617'
    )
  $$,
  array['active:2'::text],
  'rename advances the exact lifecycle revision'
);
select throws_ok(
  $$
    select * from loyalty.update_organization_lifecycle_command_v1(
      '9a000000-0000-4000-8000-000000000100', 1, 'suspend', null,
      'Stale state must not suspend.', 'organization:suspend:stale',
      '9a000000-0000-4000-8000-000000000618'
    )
  $$,
  '40001', 'stale organization lifecycle revision',
  'stale organization revisions fail closed'
);
select results_eq(
  $$
    select status from loyalty.update_organization_lifecycle_command_v1(
      '9a000000-0000-4000-8000-000000000100', 2, 'suspend', null,
      'Investigating organization access.', 'organization:suspend:main',
      '9a000000-0000-4000-8000-000000000619'
    )
  $$,
  array['suspended'::text],
  'an owner suspends the organization explicitly'
);
reset role;
select ok(
  not loyalty_private.has_enterprise_permission_v1(
    (select id from loyalty.organizations where slug = 'lifecycle-main'),
    'members.manage'
  ),
  'suspension disables new enterprise commands'
);
set local role authenticated;
set local request.jwt.claim.sub = '9a000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select workspace #>> '{organization,status}' from loyalty.get_organization_team_workspace_v1('9a000000-0000-4000-8000-000000000100') $$,
  array['suspended'::text],
  'the owner retains a transparent suspended recovery view'
);
set local request.jwt.claim.sub = '9a000000-0000-4000-8000-000000000002';
select is_empty(
  $$ select * from loyalty.get_organization_team_workspace_v1('9a000000-0000-4000-8000-000000000100') $$,
  'a suspended admin has no effective team view'
);
set local request.jwt.claim.sub = '9a000000-0000-4000-8000-000000000001';
select results_eq(
  $$
    select status from loyalty.update_organization_lifecycle_command_v1(
      '9a000000-0000-4000-8000-000000000100', 3, 'restore', null,
      'Investigation completed successfully.', 'organization:restore:main',
      '9a000000-0000-4000-8000-000000000620'
    )
  $$,
  array['active'::text],
  'the owner restores a suspended organization'
);
select results_eq(
  $$
    select outcome from loyalty.create_organization_invitation_command_v1(
      '9a000000-0000-4000-8000-000000000100', 'Pending offboard invite', 'operator',
      statement_timestamp() + interval '2 days', repeat('e', 64),
      'invitation:create:offboard', '9a000000-0000-4000-8000-000000000621'
    )
  $$,
  array['created'::text],
  'a pending invitation exists for offboarding verification'
);
select results_eq(
  $$
    select status from loyalty.update_organization_lifecycle_command_v1(
      '9a000000-0000-4000-8000-000000000100', 4, 'close', null,
      'Approved organization closure.', 'organization:close:main',
      '9a000000-0000-4000-8000-000000000622'
    )
  $$,
  array['closed'::text],
  'closure is an explicit audited terminal status transition'
);
select results_eq(
  $$
    select status || ':' || revision::text from loyalty.update_organization_lifecycle_command_v1(
      '9a000000-0000-4000-8000-000000000100', 5, 'offboard', null,
      'Approved final tenant offboarding.', 'organization:offboard:main',
      '9a000000-0000-4000-8000-000000000623'
    )
  $$,
  array['closed:6'::text],
  'offboarding advances the final closed lifecycle revision'
);
reset role;
select results_eq(
  $$
    select count(*)::bigint from loyalty.organization_memberships
    where organization_id = (select id from loyalty.organizations where slug = 'lifecycle-main')
      and role <> 'owner' and revoked_at is null
  $$,
  array[0::bigint],
  'offboarding revokes every non-owner membership'
);
select results_eq(
  $$
    select count(*)::bigint from loyalty.organization_invitations
    where organization_id = (select id from loyalty.organizations where slug = 'lifecycle-main')
      and status = 'pending'
  $$,
  array[0::bigint],
  'offboarding revokes every pending invitation'
);
set local role authenticated;
set local request.jwt.claim.sub = '9a000000-0000-4000-8000-000000000001';
select throws_ok(
  $$
    select * from loyalty.update_organization_lifecycle_command_v1(
      '9a000000-0000-4000-8000-000000000100', 6, 'restore', null,
      'Closed tenants cannot be restored.', 'organization:restore:closed',
      '9a000000-0000-4000-8000-000000000624'
    )
  $$,
  '23514', 'invalid organization lifecycle transition',
  'closed and offboarded organizations cannot be restored'
);
select is_empty(
  $$
    select workspace from loyalty.get_organization_team_workspace_v1('9a000000-0000-4000-8000-000000000100')
    where workspace::text ~* '"(email|domain|group|claim|token|secret|userid|user_id|sha256)"[[:space:]]*:'
  $$,
  'team projection exposes no Auth identity claim token or digest key'
);
select results_eq(
  $$
    select count(*)::bigint
    from loyalty.get_organization_team_workspace_v1('9a000000-0000-4000-8000-000000000100'),
      lateral jsonb_array_elements(workspace->'members') as member
    where member->>'role' = 'owner' and member->>'status' = 'active'
  $$,
  array[1::bigint],
  'the final team projection preserves one recovery owner'
);
select results_eq(
  $$
    select count(*)::bigint from loyalty.admin_audit_events
    where organization_id = (select id from loyalty.organizations where slug = 'lifecycle-main')
      and action in (
        'organization.rename', 'organization.suspend', 'organization.restore',
        'organization.close', 'organization.offboard', 'invitation.create',
        'invitation.accept', 'invitation.revoke', 'membership.change_role',
        'membership.revoke'
      )
  $$,
  array[14::bigint],
  'successful lifecycle effects remain attributable in immutable audit history'
);
reset role;
set local loyalty.identity_command = 'off';
select throws_ok(
  $$
    update loyalty.organization_invitations set display_label = 'Tampered label'
    where token_sha256 = decode(repeat('a', 64), 'hex')
  $$,
  '55000', 'organization invitation mutations require a lifecycle command',
  'direct invitation mutation cannot bypass the lifecycle boundary'
);
select results_eq(
  $$
    select count(*)::bigint from loyalty.ledger_transactions
    where organization_id = (select id from loyalty.organizations where slug = 'lifecycle-main')
  $$,
  array[0::bigint],
  'identity lifecycle creates no loyalty value effect'
);

select * from finish();
rollback;
