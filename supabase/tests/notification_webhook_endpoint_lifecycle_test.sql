begin;

create extension if not exists pgtap with schema extensions;

select plan(55);

grant loyalty_runtime, loyalty_worker to current_user;
grant usage on schema extensions to loyalty_runtime, loyalty_worker;
grant execute on all functions in schema extensions to loyalty_runtime, loyalty_worker;

select has_table(
  'loyalty_private', 'notification_webhook_endpoint_revisions',
  'endpoint revisions retain private lifecycle evidence'
);
select results_eq(
  $$ select relrowsecurity from pg_class where oid = 'loyalty_private.notification_webhook_endpoint_revisions'::regclass $$,
  array[true], 'endpoint revisions have RLS enabled'
);
select has_trigger(
  'loyalty_private', 'notification_webhook_endpoint_revisions',
  'notification_webhook_endpoint_revisions_immutable',
  'endpoint revisions cannot be rewritten'
);
select has_trigger(
  'loyalty_private', 'notification_webhook_endpoints',
  'notification_webhook_endpoints_no_delete',
  'endpoint identity cannot be deleted'
);
select ok(
  has_function_privilege('loyalty_runtime', 'loyalty_private.create_notification_webhook_endpoint_v1(uuid,uuid,text,text,bytea,text,text[],integer,text,uuid)', 'EXECUTE'),
  'runtime can enter guarded endpoint creation'
);
select ok(
  has_function_privilege('loyalty_runtime', 'loyalty_private.rotate_notification_webhook_endpoint_v1(uuid,uuid,bytea,text,integer,text,uuid)', 'EXECUTE'),
  'runtime can enter guarded endpoint rotation'
);
select ok(
  has_function_privilege('loyalty_runtime', 'loyalty_private.change_notification_webhook_endpoint_state_v1(uuid,uuid,text,text,text,uuid)', 'EXECUTE'),
  'runtime can immediately disable or retire an endpoint'
);
select ok(
  has_function_privilege('authenticated', 'loyalty.get_notification_webhook_endpoints_v1(uuid)', 'EXECUTE'),
  'authenticated merchant readers can enter the minimized projection'
);
select ok(
  not has_function_privilege('anon', 'loyalty.get_notification_webhook_endpoints_v1(uuid)', 'EXECUTE'),
  'anonymous callers cannot read endpoint health'
);
select ok(
  not has_function_privilege('authenticated', 'loyalty_private.create_notification_webhook_endpoint_v1(uuid,uuid,text,text,bytea,text,text[],integer,text,uuid)', 'EXECUTE'),
  'browser sessions cannot submit a fingerprint directly'
);
select ok(
  not has_table_privilege('loyalty_runtime', 'loyalty_private.notification_webhook_endpoint_revisions', 'SELECT'),
  'runtime has no endpoint revision table read'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname in ('loyalty', 'loyalty_private')
      and routine.proname in (
        'record_notification_webhook_endpoint_revision_v1',
        'create_notification_webhook_endpoint_v1',
        'rotate_notification_webhook_endpoint_v1',
        'change_notification_webhook_endpoint_state_v1',
        'get_notification_webhook_endpoints_v1'
      ) and routine.prosecdef
  $$,
  array[5::bigint], 'all endpoint lifecycle boundaries are security definer'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname in ('loyalty', 'loyalty_private')
      and routine.proname in (
        'record_notification_webhook_endpoint_revision_v1',
        'create_notification_webhook_endpoint_v1',
        'rotate_notification_webhook_endpoint_v1',
        'change_notification_webhook_endpoint_state_v1',
        'get_notification_webhook_endpoints_v1'
      ) and exists (
        select 1 from unnest(routine.proconfig) as setting
        where setting = 'search_path=""'
      )
  $$,
  array[5::bigint], 'all endpoint lifecycle boundaries pin an empty search path'
);
select is_empty(
  $$
    select parameter_name from information_schema.parameters
    where specific_schema = 'loyalty_private'
      and specific_name like 'create_notification_webhook_endpoint_v1_%'
      and parameter_name in ('organization_id', 'endpoint_id', 'state')
  $$,
  'creation accepts no caller organization endpoint or state authority'
);
select hasnt_column(
  'loyalty_private', 'notification_webhook_endpoint_revisions',
  'current_secret_sha256',
  'revision history excludes secret fingerprints'
);

insert into auth.users(id, email) values
  ('d1000000-0000-4000-8000-000000000001', 'webhook-owner@example.test'),
  ('d1000000-0000-4000-8000-000000000002', 'webhook-admin@example.test'),
  ('d1000000-0000-4000-8000-000000000003', 'webhook-operator@example.test'),
  ('d2000000-0000-4000-8000-000000000001', 'webhook-other@example.test');

insert into loyalty.organizations(public_id, slug, name) values
  ('d1000000-0000-4000-8000-000000000100', 'lifecycle-one', 'Lifecycle One'),
  ('d2000000-0000-4000-8000-000000000100', 'lifecycle-two', 'Lifecycle Two');

insert into loyalty.organization_memberships(organization_id, user_id, role)
values
  ((select id from loyalty.organizations where slug = 'lifecycle-one'), 'd1000000-0000-4000-8000-000000000001', 'owner'),
  ((select id from loyalty.organizations where slug = 'lifecycle-one'), 'd1000000-0000-4000-8000-000000000002', 'admin'),
  ((select id from loyalty.organizations where slug = 'lifecycle-one'), 'd1000000-0000-4000-8000-000000000003', 'operator'),
  ((select id from loyalty.organizations where slug = 'lifecycle-two'), 'd2000000-0000-4000-8000-000000000001', 'owner');

insert into loyalty.workspaces(public_id, organization_id, slug, name)
select case organization.slug
    when 'lifecycle-one' then 'd1000000-0000-4000-8000-000000000200'::uuid
    else 'd2000000-0000-4000-8000-000000000200'::uuid end,
  organization.id, 'store', organization.name || ' Store'
from loyalty.organizations as organization
where organization.slug in ('lifecycle-one', 'lifecycle-two');

select loyalty_private.set_deployment_mode(
  'self_hosted', 1, 'operator:webhook-lifecycle-test',
  'Exercise endpoint lifecycle', pg_catalog.clock_timestamp()
);
select loyalty_private.set_organization_entitlement(
  organization.public_id, 'notifications', 'enabled', null, 'local_control',
  'operator:webhook-lifecycle-test', 'Enable webhook lifecycle tests',
  pg_catalog.clock_timestamp(), null
)
from loyalty.organizations as organization
where organization.slug in ('lifecycle-one', 'lifecycle-two');

create function pg_temp.lifecycle_endpoint()
returns uuid language sql stable security definer set search_path = '' as $$
  select endpoint.public_id
  from loyalty_private.notification_webhook_endpoints as endpoint
  join loyalty.organizations as organization
    on organization.id = endpoint.organization_id
  where organization.slug = 'lifecycle-one'
  order by endpoint.id desc limit 1;
$$;

set local role loyalty_runtime;
select results_eq(
  $$ select outcome || ':' || endpoint_state
     from loyalty_private.create_notification_webhook_endpoint_v1(
       'd1000000-0000-4000-8000-000000000001',
       'd1000000-0000-4000-8000-000000000200',
       'Lifecycle automation', 'https://hooks.example.test/starfiniti',
       decode(repeat('11',32),'hex'), 'oldkey',
       array['loyalty.connector.health','loyalty.points.earned'], 60,
       'webhook:create:one', 'd1000000-0000-4000-8000-000000000700'
     ) $$,
  array['created:disabled'::text],
  'owner creates one disabled endpoint from non-secret evidence'
);
select results_eq(
  $$ select outcome from loyalty_private.create_notification_webhook_endpoint_v1(
       'd1000000-0000-4000-8000-000000000001',
       'd1000000-0000-4000-8000-000000000200',
       'Lifecycle automation', 'https://hooks.example.test/starfiniti',
       decode(repeat('22',32),'hex'), 'unused',
       array['loyalty.connector.health','loyalty.points.earned'], 60,
       'webhook:create:one', 'd1000000-0000-4000-8000-000000000701'
     ) $$,
  array['duplicate'::text], 'exact creation retry creates no second endpoint'
);
select throws_ok(
  $$ select * from loyalty_private.create_notification_webhook_endpoint_v1(
       'd1000000-0000-4000-8000-000000000001',
       'd1000000-0000-4000-8000-000000000200',
       'Changed endpoint', 'https://hooks.example.test/changed',
       decode(repeat('22',32),'hex'), 'change',
       array['loyalty.connector.health'], 60,
       'webhook:create:one', 'd1000000-0000-4000-8000-000000000702'
     ) $$,
  '23514', 'notification webhook command idempotency conflict',
  'changed creation retry fails closed'
);
select throws_ok(
  $$ select * from loyalty_private.create_notification_webhook_endpoint_v1(
       'd1000000-0000-4000-8000-000000000003',
       'd1000000-0000-4000-8000-000000000200',
       'Operator endpoint', 'https://hooks.example.test/operator',
       decode(repeat('33',32),'hex'), 'operat',
       array['loyalty.connector.health'], 60,
       'webhook:create:operator', 'd1000000-0000-4000-8000-000000000703'
     ) $$,
  '42501', 'notification webhook endpoint command not authorized',
  'operator cannot create a signing endpoint'
);
select throws_ok(
  $$ select * from loyalty_private.rotate_notification_webhook_endpoint_v1(
       'd2000000-0000-4000-8000-000000000001', pg_temp.lifecycle_endpoint(),
       decode(repeat('22',32),'hex'), 'newkey', 3600,
       'webhook:rotate:cross', 'd1000000-0000-4000-8000-000000000704'
     ) $$,
  '42501', 'notification webhook rotation not authorized',
  'another tenant owner cannot rotate the endpoint'
);
reset role;

select results_eq(
  $$ select count(*)::bigint from loyalty_private.notification_webhook_endpoints
     where organization_id = (select id from loyalty.organizations where slug = 'lifecycle-one') $$,
  array[1::bigint], 'creation retry retains one endpoint row'
);
select results_eq(
  $$ select encode(current_secret_sha256,'hex') || ':' || current_secret_hint
     from loyalty_private.notification_webhook_endpoints
     where public_id = pg_temp.lifecycle_endpoint() $$,
  array[(repeat('11',32) || ':oldkey')::text],
  'PostgreSQL retains only the expected fingerprint and bounded hint'
);
select results_eq(
  $$ select count(*)::bigint from loyalty_private.notification_webhook_endpoint_revisions
     where endpoint_id = (select id from loyalty_private.notification_webhook_endpoints where public_id = pg_temp.lifecycle_endpoint()) $$,
  array[1::bigint], 'creation appends one endpoint revision'
);
select is_empty(
  $$ select metadata from loyalty.admin_audit_events
     where action = 'notification.webhook.create'
       and metadata::text like '%https://hooks.example.test%' $$,
  'audit metadata retains a destination digest rather than the live URL'
);

set local role loyalty_runtime;
select results_eq(
  $$ select outcome from loyalty_private.rotate_notification_webhook_endpoint_v1(
       'd1000000-0000-4000-8000-000000000001', pg_temp.lifecycle_endpoint(),
       decode(repeat('22',32),'hex'), 'newkey', 3600,
       'webhook:rotate:one', 'd1000000-0000-4000-8000-000000000710'
     ) $$,
  array['rotated'::text], 'disabled endpoint rotates to one new fingerprint'
);
select ok(
  (select previous_secret_expires_at > pg_catalog.clock_timestamp()
   from loyalty_private.notification_webhook_endpoints
   where public_id = pg_temp.lifecycle_endpoint()),
  'prior signing key overlap has a future bounded expiry'
);
select results_eq(
  $$ select encode(current_secret_sha256,'hex') || ':' ||
       encode(previous_secret_sha256,'hex')
     from loyalty_private.notification_webhook_endpoints
     where public_id = pg_temp.lifecycle_endpoint() $$,
  array[(repeat('22',32) || ':' || repeat('11',32))::text],
  'rotation retains current and bounded prior fingerprints in exact order'
);
select results_eq(
  $$ select string_agg(action, ',' order by revision_number)
     from loyalty_private.notification_webhook_endpoint_revisions
     where endpoint_id = (select id from loyalty_private.notification_webhook_endpoints where public_id = pg_temp.lifecycle_endpoint()) $$,
  array['created,rotated'::text], 'rotation appends immutable lifecycle evidence'
);
select results_eq(
  $$ select outcome from loyalty_private.rotate_notification_webhook_endpoint_v1(
       'd1000000-0000-4000-8000-000000000001', pg_temp.lifecycle_endpoint(),
       decode(repeat('33',32),'hex'), 'unused', 3600,
       'webhook:rotate:one', 'd1000000-0000-4000-8000-000000000711'
     ) $$,
  array['duplicate'::text], 'exact rotation retry creates no additional key state'
);
select throws_ok(
  $$ select * from loyalty_private.rotate_notification_webhook_endpoint_v1(
       'd1000000-0000-4000-8000-000000000001', pg_temp.lifecycle_endpoint(),
       decode(repeat('33',32),'hex'), 'change', 7200,
       'webhook:rotate:one', 'd1000000-0000-4000-8000-000000000712'
     ) $$,
  '23514', 'notification webhook rotation idempotency conflict',
  'changed rotation retry fails closed'
);
reset role;

update loyalty_private.notification_webhook_endpoints
set state = 'active', last_change_reason = 'reviewed worker mounted',
  updated_by_user_id = null
where public_id = pg_temp.lifecycle_endpoint();
select is(
  (select state from loyalty_private.notification_webhook_endpoints
   where public_id = pg_temp.lifecycle_endpoint()),
  'active', 'reviewed operator activation remains an explicit deployment step'
);

set local role loyalty_runtime;
select results_eq(
  $$ select outcome || ':' || endpoint_state
     from loyalty_private.change_notification_webhook_endpoint_state_v1(
       'd1000000-0000-4000-8000-000000000001', pg_temp.lifecycle_endpoint(),
       'disable', 'Receiver maintenance', 'webhook:disable:one',
       'd1000000-0000-4000-8000-000000000720'
     ) $$,
  array['disabled:disabled'::text], 'owner disables an active endpoint immediately'
);
reset role;

set local role loyalty_worker;
select throws_ok(
  $$ select * from loyalty_private.claim_notification_webhook_deliveries_v1(
       pg_temp.lifecycle_endpoint(), repeat('22',32), repeat('11',32),
       'disabled-worker', 1, 60
     ) $$,
  '42501', 'webhook endpoint not authorized',
  'disabled endpoint rejects the next worker authorization boundary'
);
reset role;

set local role loyalty_runtime;
select results_eq(
  $$ select outcome from loyalty_private.change_notification_webhook_endpoint_state_v1(
       'd1000000-0000-4000-8000-000000000001', pg_temp.lifecycle_endpoint(),
       'disable', 'Receiver maintenance', 'webhook:disable:one',
       'd1000000-0000-4000-8000-000000000721'
     ) $$,
  array['duplicate'::text], 'exact disable retry returns its prior result'
);
select results_eq(
  $$ select outcome || ':' || endpoint_state
     from loyalty_private.change_notification_webhook_endpoint_state_v1(
       'd1000000-0000-4000-8000-000000000001', pg_temp.lifecycle_endpoint(),
       'retire', 'Integration decommissioned', 'webhook:retire:one',
       'd1000000-0000-4000-8000-000000000722'
     ) $$,
  array['retired:retired'::text], 'disabled endpoint retires terminally'
);
reset role;

select results_eq(
  $$ select destination_url from loyalty_private.notification_webhook_endpoints
     where public_id = pg_temp.lifecycle_endpoint() $$,
  array[('https://retired.invalid/webhook/' || pg_temp.lifecycle_endpoint()::text)::text],
  'retirement removes the live destination from operational storage'
);
select results_eq(
  $$ select (previous_secret_sha256 is null and previous_secret_expires_at is null
       and current_secret_hint is null and previous_secret_hint is null)::text
     from loyalty_private.notification_webhook_endpoints
     where public_id = pg_temp.lifecycle_endpoint() $$,
  array['true'::text], 'retirement removes reusable signing-key bindings and hints'
);
select results_eq(
  $$ select action from loyalty_private.notification_webhook_endpoint_revisions
     where endpoint_id = (select id from loyalty_private.notification_webhook_endpoints where public_id = pg_temp.lifecycle_endpoint())
     order by revision_number desc limit 1 $$,
  array['retired'::text], 'retirement appends terminal revision evidence'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.admin_audit_events
     where organization_id = (select id from loyalty.organizations where slug = 'lifecycle-one')
       and action in ('notification.webhook.create','notification.webhook.rotate','notification.webhook.disable','notification.webhook.retire') $$,
  array[4::bigint], 'every owner lifecycle command has immutable audit evidence'
);
select results_eq(
  $$ select count(*)::bigint from loyalty_private.notification_webhook_endpoint_revisions
     where endpoint_id = (select id from loyalty_private.notification_webhook_endpoints where public_id = pg_temp.lifecycle_endpoint()) $$,
  array[5::bigint], 'create rotate activation disable and retirement revisions remain reconstructable'
);
select throws_ok(
  $$ delete from loyalty_private.notification_webhook_endpoints
     where public_id = pg_temp.lifecycle_endpoint() $$,
  '55000', 'immutable loyalty history cannot be changed',
  'endpoint identity and delivery foreign-key evidence cannot be deleted'
);
select throws_ok(
  $$ update loyalty_private.notification_webhook_endpoint_revisions
     set reason = 'rewritten'
     where endpoint_id = (select id from loyalty_private.notification_webhook_endpoints where public_id = pg_temp.lifecycle_endpoint()) $$,
  '55000', 'immutable loyalty history cannot be changed',
  'endpoint revision evidence cannot be rewritten'
);
select throws_ok(
  $$ update loyalty_private.notification_webhook_endpoints set label = 'Resurrected'
     where public_id = pg_temp.lifecycle_endpoint() $$,
  '23514', 'retired webhook endpoint is immutable',
  'retired endpoint cannot be resurrected or edited'
);

set local role authenticated;
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select (document ->> 'canManage') || ':' ||
       jsonb_array_length(document -> 'endpoints')::text
     from loyalty.get_notification_webhook_endpoints_v1(
       'd1000000-0000-4000-8000-000000000200'
     ) $$,
  array['true:1'::text], 'owner receives one manageable endpoint health row'
);
select results_eq(
  $$ select document #>> '{endpoints,0,state}' from loyalty.get_notification_webhook_endpoints_v1(
       'd1000000-0000-4000-8000-000000000200'
     ) $$,
  array['retired'::text], 'owner health projection exposes terminal lifecycle state'
);
select results_eq(
  $$ select document #>> '{endpoints,0,destinationUrl}' from loyalty.get_notification_webhook_endpoints_v1(
       'd1000000-0000-4000-8000-000000000200'
     ) $$,
  array[null::text], 'retired health projection exposes no destination'
);
select results_eq(
  $$ select document #>> '{endpoints,0,counts,completed}' from loyalty.get_notification_webhook_endpoints_v1(
       'd1000000-0000-4000-8000-000000000200'
     ) $$,
  array['0'::text], 'endpoint health counts reconcile to zero canonical deliveries'
);
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000003';
select results_eq(
  $$ select document ->> 'canManage' from loyalty.get_notification_webhook_endpoints_v1(
       'd1000000-0000-4000-8000-000000000200'
     ) $$,
  array['false'::text], 'operator receives read-only endpoint health'
);
set local request.jwt.claim.sub = 'd2000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select * from loyalty.get_notification_webhook_endpoints_v1(
       'd1000000-0000-4000-8000-000000000200'
     ) $$,
  '42501', 'notification webhook endpoint read not authorized',
  'another tenant cannot read endpoint health'
);
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000001';
select is_empty(
  $$ select document
     from loyalty.get_notification_webhook_endpoints_v1(
       'd1000000-0000-4000-8000-000000000200'
     ) as projection
     where document::text ~ '(secretSha|fingerprint|worker|responseBody|hooks\.example)'
  $$,
  'endpoint projection excludes fingerprints workers response bodies and retired live URLs'
);
reset role;
select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_transactions $$,
  array[0::bigint], 'endpoint lifecycle never mutates loyalty value'
);
select results_eq(
  $$ select count(*)::bigint from loyalty_private.notification_webhook_deliveries $$,
  array[0::bigint], 'management commands create no synthetic delivery work'
);
select results_eq(
  $$ select count(*)::bigint from loyalty_private.notification_webhook_attempts $$,
  array[0::bigint], 'management commands create no synthetic attempt evidence'
);
select results_eq(
  $$ select retired_at is not null from loyalty_private.notification_webhook_endpoints
     where public_id = pg_temp.lifecycle_endpoint() $$,
  array[true], 'retirement retains an exact terminal timestamp'
);
select results_eq(
  $$ select count(*)::bigint from loyalty_private.notification_webhook_endpoint_revisions
     where endpoint_id = (select id from loyalty_private.notification_webhook_endpoints where public_id = pg_temp.lifecycle_endpoint())
       and destination_sha256 is not null $$,
  array[5::bigint], 'every lifecycle revision retains only a destination digest'
);

select * from finish();
rollback;
