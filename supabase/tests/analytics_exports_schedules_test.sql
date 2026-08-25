begin;

create extension if not exists pgtap with schema extensions;

select plan(60);

select has_table('loyalty', 'analytics_report_schedules', 'report schedules exist');
select has_table('loyalty', 'analytics_export_requests', 'export jobs exist');
select has_table('loyalty_private', 'analytics_export_payloads', 'payloads stay private');
select has_table('loyalty_private', 'analytics_export_authorizations', 'download capabilities stay private');
select has_table('loyalty_private', 'analytics_export_events', 'immutable export evidence exists');
select has_function('loyalty', 'create_analytics_export_command',
  array['uuid','uuid','uuid','text','integer','text','uuid','uuid'],
  'manual export command exists');
select has_function('loyalty', 'create_analytics_report_schedule_command',
  array['uuid','uuid','uuid','text','integer','text','text','integer','integer','integer','uuid','uuid'],
  'schedule command exists');
select has_function('loyalty', 'set_analytics_report_schedule_state_command',
  array['uuid','text','uuid','uuid'], 'schedule suppression command exists');
select has_function('loyalty', 'get_analytics_export_workspace_v1',
  array['uuid','uuid','uuid','integer'], 'minimized export workspace exists');
select has_function('loyalty_private', 'materialize_due_analytics_exports_v1',
  array['timestamp with time zone','integer'], 'worker schedule materializer exists');
select has_function('loyalty_private', 'claim_analytics_export_jobs_v1',
  array['text','integer','integer'], 'bounded worker claim exists');
select has_function('loyalty_private', 'generate_analytics_export_job_v1',
  array['uuid','text'], 'leased aggregate generator exists');
select has_function('loyalty_private', 'fail_analytics_export_job_v1',
  array['uuid','text','text'], 'bounded retry result exists');
select has_function('loyalty_private', 'expire_analytics_exports_v1',
  array['timestamp with time zone','integer'], 'payload expiry sweep exists');
select has_function('loyalty_private', 'issue_analytics_export_authorization_v1',
  array['uuid','uuid','uuid'], 'runtime capability issuer exists');
select has_function('loyalty_private', 'consume_analytics_export_v1',
  array['uuid','text','uuid','uuid'], 'runtime one-use consumption exists');
select has_function('loyalty_private', 'record_analytics_export_download_v1',
  array['uuid','uuid','uuid','text','bigint'], 'delivered digest recorder exists');
select ok(has_function_privilege('authenticated',
  'loyalty.create_analytics_export_command(uuid,uuid,uuid,text,integer,text,uuid,uuid)',
  'EXECUTE'), 'authenticated actors can enter the guarded export command');
select ok(not has_function_privilege('anon',
  'loyalty.create_analytics_export_command(uuid,uuid,uuid,text,integer,text,uuid,uuid)',
  'EXECUTE'), 'anonymous callers cannot create exports');
select ok(has_function_privilege('loyalty_worker',
  'loyalty_private.claim_analytics_export_jobs_v1(text,integer,integer)',
  'EXECUTE'), 'reporting worker can claim only through its narrow function');
select ok(has_function_privilege('loyalty_worker',
  'loyalty_private.generate_analytics_export_job_v1(uuid,text)',
  'EXECUTE'), 'reporting worker can generate only a leased export');
select ok(not has_function_privilege('authenticated',
  'loyalty_private.claim_analytics_export_jobs_v1(text,integer,integer)',
  'EXECUTE'), 'browser sessions cannot claim report work');
select ok(has_function_privilege('loyalty_runtime',
  'loyalty_private.issue_analytics_export_authorization_v1(uuid,uuid,uuid)',
  'EXECUTE'), 'trusted dashboard runtime can issue a download capability');
select ok(not has_function_privilege('loyalty_worker',
  'loyalty_private.issue_analytics_export_authorization_v1(uuid,uuid,uuid)',
  'EXECUTE'), 'reporting worker cannot mint browser download capabilities');
select results_eq(
  $$ select relation.relrowsecurity from pg_class as relation
     join pg_namespace as namespace on namespace.oid = relation.relnamespace
     where (namespace.nspname, relation.relname) in (
       ('loyalty','analytics_report_schedules'),
       ('loyalty','analytics_export_requests'),
       ('loyalty_private','analytics_export_payloads'),
       ('loyalty_private','analytics_export_authorizations'),
       ('loyalty_private','analytics_export_events')
     ) order by namespace.nspname, relation.relname $$,
  array[true,true,true,true,true], 'every schedule export payload capability and event table has RLS');
select ok(not has_table_privilege('authenticated',
  'loyalty_private.analytics_export_payloads', 'SELECT'),
  'browser sessions cannot select private report payloads');
select ok(not has_table_privilege('loyalty_worker',
  'loyalty_private.analytics_export_payloads', 'SELECT'),
  'reporting workers cannot select payload tables outside functions');
select results_eq(
  $$ select count(*)::bigint from pg_proc as routine
     join pg_namespace as namespace on namespace.oid = routine.pronamespace
     where namespace.nspname in ('loyalty','loyalty_private')
       and routine.proname in (
         'create_analytics_export_command',
         'create_analytics_report_schedule_command',
         'set_analytics_report_schedule_state_command',
         'get_analytics_export_workspace_v1',
         'materialize_due_analytics_exports_v1',
         'claim_analytics_export_jobs_v1',
         'generate_analytics_export_job_v1',
         'issue_analytics_export_authorization_v1',
         'consume_analytics_export_v1'
       ) and routine.prosecdef and exists (
         select 1 from unnest(routine.proconfig) as setting where setting = 'search_path=""'
       ) $$,
  array[9::bigint], 'all exposed and privileged report functions use empty-search-path security definer code');
select results_eq(
  $$ select extract(epoch from (
       loyalty_private.next_analytics_schedule_at_v1(
         'daily','Europe/Ljubljana',8,null,null,'2026-03-28T07:00:00Z'
       ) - '2026-03-28T07:00:00Z'::timestamptz
     ))::integer $$,
  array[82800], 'local daily scheduling preserves 08:00 through spring DST with a 23-hour instant gap');

insert into auth.users (id, email)
values
  ('6e000000-0000-4000-8000-000000000001', 'export-owner@example.test'),
  ('6e000000-0000-4000-8000-000000000002', 'export-analyst@example.test'),
  ('6e000000-0000-4000-8000-000000000003', 'export-auditor@example.test'),
  ('6e000000-0000-4000-8000-000000000004', 'export-operator@example.test'),
  ('6e000000-0000-4000-8000-000000000005', 'export-revoked@example.test'),
  ('6f000000-0000-4000-8000-000000000001', 'export-other@example.test');

insert into loyalty.organizations (public_id, slug, name)
values
  ('6e000000-0000-4000-8000-000000000100', 'scheduled-export-one', 'Scheduled Export One'),
  ('6f000000-0000-4000-8000-000000000100', 'scheduled-export-two', 'Scheduled Export Two');

insert into loyalty.organization_memberships (organization_id, user_id, role, revoked_at)
select organization.id, member.user_id, member.role, member.revoked_at
from loyalty.organizations as organization
cross join (values
  ('6e000000-0000-4000-8000-000000000001'::uuid,'owner'::text,null::timestamptz),
  ('6e000000-0000-4000-8000-000000000002'::uuid,'analyst'::text,null::timestamptz),
  ('6e000000-0000-4000-8000-000000000003'::uuid,'auditor'::text,null::timestamptz),
  ('6e000000-0000-4000-8000-000000000004'::uuid,'operator'::text,null::timestamptz),
  ('6e000000-0000-4000-8000-000000000005'::uuid,'admin'::text,now())
) as member(user_id,role,revoked_at)
where organization.slug = 'scheduled-export-one';
insert into loyalty.organization_memberships (organization_id, user_id, role)
select organization.id, '6f000000-0000-4000-8000-000000000001', 'owner'
from loyalty.organizations as organization where organization.slug = 'scheduled-export-two';

insert into loyalty.workspaces (public_id, organization_id, slug, name)
select case organization.slug when 'scheduled-export-one'
    then '6e000000-0000-4000-8000-000000000101'::uuid
    else '6f000000-0000-4000-8000-000000000101'::uuid end,
  organization.id, 'shop', organization.name || ' Shop'
from loyalty.organizations as organization
where organization.slug in ('scheduled-export-one','scheduled-export-two');
insert into loyalty.programme_groups (public_id, organization_id, slug, name)
select case organization.slug when 'scheduled-export-one'
    then '6e000000-0000-4000-8000-000000000110'::uuid
    else '6f000000-0000-4000-8000-000000000110'::uuid end,
  organization.id, 'rewards', organization.name || ' Rewards'
from loyalty.organizations as organization
where organization.slug in ('scheduled-export-one','scheduled-export-two');
insert into loyalty.programme_group_workspaces (organization_id, programme_group_id, workspace_id)
select organization.id, programme_group.id, workspace.id
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group on programme_group.organization_id = organization.id
join loyalty.workspaces as workspace on workspace.organization_id = organization.id
where organization.slug in ('scheduled-export-one','scheduled-export-two');

create temporary table analytics_ledger_before as
select count(*)::bigint as count from loyalty.ledger_transactions;

set local role authenticated;
set local request.jwt.claim.sub = '6e000000-0000-4000-8000-000000000001';
create temporary table owner_export as
select * from loyalty.create_analytics_export_command(
  '6e000000-0000-4000-8000-000000000100',
  '6e000000-0000-4000-8000-000000000101',
  '6e000000-0000-4000-8000-000000000110',
  'json_v1',30,'Europe/Ljubljana',
  '6e000000-0000-4000-8000-000000000201',
  '6e000000-0000-4000-8000-000000000202'
);
select results_eq($$ select outcome || ':' || state from owner_export $$,
  array['created:pending'::text], 'owner creates one bounded pending export');
select results_eq(
  $$ select outcome from loyalty.create_analytics_export_command(
    '6e000000-0000-4000-8000-000000000100',
    '6e000000-0000-4000-8000-000000000101',
    '6e000000-0000-4000-8000-000000000110',
    'json_v1',30,'Europe/Ljubljana',
    '6e000000-0000-4000-8000-000000000201',
    '6e000000-0000-4000-8000-000000000299') $$,
  array['duplicate'::text], 'manual export replay produces one request');
select throws_ok(
  $$ select * from loyalty.create_analytics_export_command(
    '6e000000-0000-4000-8000-000000000100',
    '6e000000-0000-4000-8000-000000000101',
    '6e000000-0000-4000-8000-000000000110',
    'json_v1',90,'UTC',
    '6e000000-0000-4000-8000-000000000201',
    '6e000000-0000-4000-8000-000000000298') $$,
  '23514','analytics export idempotency conflict',
  'one idempotency key cannot change the report request');

set local request.jwt.claim.sub = '6e000000-0000-4000-8000-000000000004';
select throws_ok(
  $$ select * from loyalty.create_analytics_export_command(
    '6e000000-0000-4000-8000-000000000100',
    '6e000000-0000-4000-8000-000000000101',
    '6e000000-0000-4000-8000-000000000110',
    'json_v1',30,'UTC',
    '6e000000-0000-4000-8000-000000000203',
    '6e000000-0000-4000-8000-000000000204') $$,
  '42501','analytics export not authorized',
  'operator cannot create a portable analytics export');

set local request.jwt.claim.sub = '6e000000-0000-4000-8000-000000000002';
create temporary table analyst_export as
select * from loyalty.create_analytics_export_command(
  '6e000000-0000-4000-8000-000000000100',
  '6e000000-0000-4000-8000-000000000101',
  '6e000000-0000-4000-8000-000000000110',
  'json_v1',7,'UTC',
  '6e000000-0000-4000-8000-000000000205',
  '6e000000-0000-4000-8000-000000000206'
);
select results_eq($$ select outcome from analyst_export $$,
  array['created'::text], 'analyst may create a privacy-minimized manual export');
select throws_ok(
  $$ select * from loyalty.create_analytics_report_schedule_command(
    '6e000000-0000-4000-8000-000000000100',
    '6e000000-0000-4000-8000-000000000101',
    '6e000000-0000-4000-8000-000000000110',
    'json_v1',30,'UTC','daily',8,null,null,
    '6e000000-0000-4000-8000-000000000207',
    '6e000000-0000-4000-8000-000000000208') $$,
  '42501','analytics schedule not authorized',
  'analyst cannot create recurring report authority');

set local request.jwt.claim.sub = '6e000000-0000-4000-8000-000000000001';
create temporary table owner_schedule as
select * from loyalty.create_analytics_report_schedule_command(
  '6e000000-0000-4000-8000-000000000100',
  '6e000000-0000-4000-8000-000000000101',
  '6e000000-0000-4000-8000-000000000110',
  'json_v1',30,'Europe/Ljubljana','weekly',8,1,null,
  '6e000000-0000-4000-8000-000000000209',
  '6e000000-0000-4000-8000-000000000210'
);
select results_eq(
  $$ select outcome || ':' || state || ':' || (next_run_at > statement_timestamp())::text
     from owner_schedule $$,
  array['created:active:true'::text], 'owner creates a future IANA-local recurring schedule');
select results_eq(
  $$ select (workspace #>> '{canCreateExport}') || ':' ||
       (workspace #>> '{canManageSchedules}') || ':' ||
       jsonb_array_length(workspace -> 'exports') || ':' ||
       jsonb_array_length(workspace -> 'schedules')
     from loyalty.get_analytics_export_workspace_v1(
       '6e000000-0000-4000-8000-000000000100',
       '6e000000-0000-4000-8000-000000000101',
       '6e000000-0000-4000-8000-000000000110',20) $$,
  array['true:true:2:1'::text], 'owner sees bounded tenant export and schedule operations');

set local request.jwt.claim.sub = '6e000000-0000-4000-8000-000000000004';
select results_eq(
  $$ select (workspace #>> '{canCreateExport}') || ':' ||
       (workspace #>> '{canManageSchedules}') || ':' ||
       jsonb_array_length(workspace -> 'exports')
     from loyalty.get_analytics_export_workspace_v1(
       '6e000000-0000-4000-8000-000000000100',
       '6e000000-0000-4000-8000-000000000101',
       '6e000000-0000-4000-8000-000000000110',20) $$,
  array['false:false:0'::text], 'operator receives no export authority or history');
set local request.jwt.claim.sub = '6e000000-0000-4000-8000-000000000001';
select is_empty(
  $$ select * from loyalty.get_analytics_export_workspace_v1(
    '6f000000-0000-4000-8000-000000000100',
    '6f000000-0000-4000-8000-000000000101',
    '6f000000-0000-4000-8000-000000000110',20) $$,
  'one tenant cannot read another tenant export workspace');
reset role;

update loyalty.analytics_report_schedules
set next_run_at = statement_timestamp() - interval '1 second',
  updated_at = statement_timestamp()
where public_id = (select resource_public_id from owner_schedule);
select results_eq(
  $$ select materialized || ':' || auto_paused
     from loyalty_private.materialize_due_analytics_exports_v1(statement_timestamp(),20) $$,
  array['1:0'::text], 'one due schedule instant materializes one export job');
select results_eq(
  $$ select (last_run_at < next_run_at)::text || ':' || state
     from loyalty.analytics_report_schedules
     where public_id = (select resource_public_id from owner_schedule) $$,
  array['true:active'::text], 'materialization advances the schedule exactly once');

create temporary table claimed_exports as
select * from loyalty_private.claim_analytics_export_jobs_v1('reporting-test-worker',5,300);
select results_eq($$ select count(*)::bigint from claimed_exports $$,
  array[3::bigint], 'manual and scheduled jobs are claimed in one bounded batch');
select results_eq(
  $$ select state from loyalty_private.generate_analytics_export_job_v1(
    (select resource_public_id from owner_export),'reporting-test-worker') $$,
  array['ready'::text], 'leased worker generates one four-report aggregate source');
select results_eq(
  $$ select source_payload ->> 'schemaVersion' || ':' ||
       jsonb_object_length(source_payload #> '{reports}')
     from loyalty_private.analytics_export_payloads as payload
     join loyalty.analytics_export_requests as request on request.id = payload.request_id
     where request.public_id = (select resource_public_id from owner_export) $$,
  array['starfiniti.analytics-export-source.v1:4'::text],
  'private source payload contains exactly four versioned report surfaces');
select is_empty(
  $$ select 1 from loyalty_private.analytics_export_payloads
     where source_payload::text ~ '"(customer|wallet|order|assignment|payment|device|network|fraud)(Id|_id)"[[:space:]]*:' $$,
  'aggregate export source exposes no prohibited row identity key');
select results_eq(
  $$ select (source_sha256 is not null)::text || ':' || (payload_bytes > 1)::text
     from loyalty.analytics_export_requests
     where public_id = (select resource_public_id from owner_export) and state = 'ready' $$,
  array['true:true'::text], 'ready request retains digest and bounded byte evidence');

create temporary table export_authorization as
select * from loyalty_private.issue_analytics_export_authorization_v1(
  (select resource_public_id from owner_export),
  '6e000000-0000-4000-8000-000000000001',
  '6e000000-0000-4000-8000-000000000301'
);
select results_eq($$ select (expires_at > statement_timestamp())::text from export_authorization $$,
  array['true'::text], 'five-minute capability is issued without storing its raw value');
select throws_ok(
  $$ select * from loyalty_private.consume_analytics_export_v1(
    (select resource_public_id from owner_export),
    (select authorization_token from export_authorization),
    '6e000000-0000-4000-8000-000000000001',
    '6e000000-0000-4000-8000-000000000302') $$,
  '42501','analytics export capability invalid',
  'capability cannot move to another Supabase session');
create temporary table consumed_export as
select * from loyalty_private.consume_analytics_export_v1(
  (select resource_public_id from owner_export),
  (select authorization_token from export_authorization),
  '6e000000-0000-4000-8000-000000000001',
  '6e000000-0000-4000-8000-000000000301'
);
select results_eq($$ select source_payload ->> 'schemaVersion' from consumed_export $$,
  array['starfiniti.analytics-export-source.v1'::text],
  'authorized runtime receives the strict source once');
select is_empty(
  $$ select key from consumed_export,
       lateral jsonb_object_keys(source_payload) as key
     where key not in (
       'schemaVersion','exportId','generatedAt','requestedAsOf',
       'rangeDays','requestedTimeZone','reports'
     ) $$,
  'source envelope contains no undeclared top-level field');
select lives_ok(
  $$ select loyalty_private.record_analytics_export_download_v1(
    (select resource_public_id from owner_export),
    '6e000000-0000-4000-8000-000000000001',
    '6e000000-0000-4000-8000-000000000301',
    repeat('c',64),1000) $$,
  'trusted runtime records the delivered digest after contract validation');
select results_eq(
  $$ select request.state || ':' || (payload.request_id is null)::text
     from loyalty.analytics_export_requests as request
     left join loyalty_private.analytics_export_payloads as payload on payload.request_id = request.id
     where request.public_id = (select resource_public_id from owner_export) $$,
  array['consumed:true'::text], 'one-use completion destroys private payload content');
select throws_ok(
  $$ select * from loyalty_private.consume_analytics_export_v1(
    (select resource_public_id from owner_export),
    (select authorization_token from export_authorization),
    '6e000000-0000-4000-8000-000000000001',
    '6e000000-0000-4000-8000-000000000301') $$,
  '42501','analytics export capability invalid', 'download capability replay fails closed');

set local role authenticated;
set local request.jwt.claim.sub = '6e000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select state || ':' || (next_run_at is null)::text
     from loyalty.set_analytics_report_schedule_state_command(
       (select resource_public_id from owner_schedule),'paused',
       '6e000000-0000-4000-8000-000000000303',
       '6e000000-0000-4000-8000-000000000304') $$,
  array['paused:true'::text], 'pause suppresses every future schedule materialization');
select results_eq(
  $$ select state || ':' || (next_run_at > statement_timestamp())::text
     from loyalty.set_analytics_report_schedule_state_command(
       (select resource_public_id from owner_schedule),'active',
       '6e000000-0000-4000-8000-000000000305',
       '6e000000-0000-4000-8000-000000000306') $$,
  array['active:true'::text], 'resume derives a new future local-calendar instant');
reset role;

select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_transactions $$,
  $$ select count from analytics_ledger_before $$,
  'request schedule generation and download create zero ledger transaction');
select is_empty(
  $$ select 1 from loyalty_private.analytics_export_events
     where metadata::text ~ '(source_payload|reports|authorization_token|session_id)' $$,
  'immutable export audit metadata contains no payload capability or session');

select results_eq(
  $$ select state from loyalty_private.generate_analytics_export_job_v1(
    (select resource_public_id from analyst_export),'reporting-test-worker') $$,
  array['ready'::text], 'a second leased export is independently generated');
select results_eq(
  $$ select (expired >= 1)::text from loyalty_private.expire_analytics_exports_v1(
    statement_timestamp() + interval '25 hours',100) $$,
  array['true'::text], 'expiry sweep removes unconsumed 24-hour report payloads');
select is_empty(
  $$ select 1 from loyalty_private.analytics_export_payloads as payload
     join loyalty.analytics_export_requests as request on request.id = payload.request_id
     where request.public_id = (select resource_public_id from analyst_export) $$,
  'expired export retains evidence but no private payload');

select * from finish();
rollback;
