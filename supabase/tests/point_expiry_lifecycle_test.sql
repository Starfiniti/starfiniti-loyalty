begin;

create extension if not exists pgtap with schema extensions;

select plan(48);

select has_table(
  'loyalty', 'programme_point_expiry_policies',
  'versioned point expiry policies exist'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'loyalty.programme_point_expiry_policies'::regclass),
  'point expiry policies have RLS enabled'
);
select has_index(
  'loyalty', 'programme_point_expiry_policies',
  'programme_point_expiry_policies_group_idx',
  'expiry policy lookup uses an organization and programme index'
);
select has_index(
  'loyalty', 'point_lots', 'point_lots_expiry_scheduler_idx',
  'bounded expiry scheduling is ordered by due time and tenant identity'
);
select has_trigger(
  'loyalty', 'programme_versions',
  'programme_versions_materialize_point_expiry_policy',
  'publication materializes the exact versioned expiry policy'
);
select has_trigger(
  'loyalty', 'programme_point_expiry_policies',
  'programme_point_expiry_policies_immutable',
  'materialized expiry policies are immutable'
);
select ok(
  has_table_privilege(
    'authenticated', 'loyalty.programme_point_expiry_policies', 'SELECT'
  ),
  'authenticated members can read tenant-filtered expiry policy'
);
select ok(
  not has_table_privilege(
    'authenticated', 'loyalty.programme_point_expiry_policies', 'INSERT'
  ),
  'browser sessions cannot materialize expiry policy'
);
select ok(
  has_function_privilege(
    'loyalty_worker',
    'loyalty_private.run_point_expiry_lifecycle_v2(timestamp with time zone,integer)',
    'EXECUTE'
  ),
  'worker can execute only the bounded expiry lifecycle'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'loyalty_private.run_point_expiry_lifecycle_v2(timestamp with time zone,integer)',
    'EXECUTE'
  ),
  'browser sessions cannot run the expiry lifecycle'
);
select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.get_programme_expiry_liability_v2(uuid,timestamp with time zone)',
    'EXECUTE'
  ),
  'authenticated sessions can request the minimized expiry liability aggregate'
);

insert into auth.users (id, email)
values
  ('87000000-0000-4000-8000-000000000001', 'expiry-owner-one@example.test'),
  ('88000000-0000-4000-8000-000000000001', 'expiry-owner-two@example.test');
insert into loyalty.organizations (public_id, slug, name)
values
  ('87000000-0000-4000-8000-000000000100', 'expiry-one', 'Expiry One'),
  ('88000000-0000-4000-8000-000000000100', 'expiry-two', 'Expiry Two');
insert into loyalty.organization_memberships (organization_id, user_id, role)
values
  ((select id from loyalty.organizations where slug = 'expiry-one'),
    '87000000-0000-4000-8000-000000000001', 'owner'),
  ((select id from loyalty.organizations where slug = 'expiry-two'),
    '88000000-0000-4000-8000-000000000001', 'owner');
insert into loyalty.programme_groups (organization_id, slug, name)
select id, 'rewards', name || ' Rewards'
from loyalty.organizations where slug in ('expiry-one', 'expiry-two');
insert into loyalty.programmes (
  public_id, organization_id, programme_group_id, slug, name
)
select
  case organization.slug
    when 'expiry-one' then '87000000-0000-4000-8000-000000000101'::uuid
    else '88000000-0000-4000-8000-000000000101'::uuid
  end,
  organization.id, programme_group.id, 'rewards', organization.name || ' Rewards'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
where organization.slug in ('expiry-one', 'expiry-two');

create function pg_temp.valid_expiry_v2()
returns jsonb
language sql
immutable
as $$
  select '{
    "version":"2","currencyCode":"EUR","currencyMinorUnitDigits":2,
    "pendingDays":0,"pointsExpireAfterDays":365,
    "pointsExpiryPolicy":{"version":"2","method":"earned_date","expireAfterDays":365,"notificationLeadDays":[30,14,7]},
    "tiers":[{"code":"rose","name":"Rose","minimumEligibleSpendMinor":"0","pointsPerMajorUnit":"5"}],
    "rewards":[],
    "earningRules":[{
      "code":"purchase-base","name":"Base purchase points","source":"purchase",
      "enabled":true,"priority":0,"stackable":false,
      "effect":{"kind":"base_rate","pointsPerMajorUnit":"5"},
      "conditions":{"productIds":[],"categoryIds":[],"currencyCodes":[],"markets":[],"channels":[],"activityCodes":[],"segmentCodes":[],"tierCodes":[],"startsAt":null,"endsAt":null},
      "purchaseExclusions":{"productIds":[],"categoryIds":[],"shipping":true,"tax":true,"fees":true,"giftCardPayments":true,"storeCreditPayments":true,"discounts":true},
      "cap":{"perEventPoints":null,"perMemberPoints":null,"memberPeriod":null,"rollingDays":null}
    }]
  }'::jsonb;
$$;

set local role authenticated;
set local request.jwt.claim.sub = '87000000-0000-4000-8000-000000000001';

select throws_ok(
  $$ select * from loyalty.create_programme_draft_command(
    '87000000-0000-4000-8000-000000000101',
    jsonb_set(pg_temp.valid_expiry_v2(), '{pointsExpiryPolicy,expireAfterDays}', '364'),
    'expiry:invalid:mismatch', '87000000-0000-4000-8000-000000000201'
  ) $$,
  '22023', 'invalid PointExpiryPolicyV2',
  'direct draft RPC cannot split legacy and versioned expiry duration'
);
select throws_ok(
  $$ select * from loyalty.create_programme_draft_command(
    '87000000-0000-4000-8000-000000000101',
    jsonb_set(pg_temp.valid_expiry_v2(), '{pointsExpiryPolicy,notificationLeadDays}', '[30,30]'::jsonb),
    'expiry:invalid:duplicate', '87000000-0000-4000-8000-000000000202'
  ) $$,
  '23514', 'duplicate point expiry notification lead day',
  'direct draft RPC rejects duplicate reminder fences'
);
select throws_ok(
  $$ select * from loyalty.create_programme_draft_command(
    '87000000-0000-4000-8000-000000000101',
    jsonb_set(pg_temp.valid_expiry_v2(), '{pointsExpiryPolicy,notificationLeadDays}', '[7,14]'::jsonb),
    'expiry:invalid:order', '87000000-0000-4000-8000-000000000203'
  ) $$,
  '23514', 'point expiry notification lead days must descend',
  'direct draft RPC rejects ambiguous reminder ordering'
);
select throws_ok(
  $$ select * from loyalty.create_programme_draft_command(
    '87000000-0000-4000-8000-000000000101',
    jsonb_set(pg_temp.valid_expiry_v2(), '{pointsExpiryPolicy,notificationLeadDays}', '[365]'::jsonb),
    'expiry:invalid:late', '87000000-0000-4000-8000-000000000204'
  ) $$,
  '22023', 'invalid point expiry notification lead day',
  'a reminder cannot be scheduled at or after lot expiry'
);
reset role;

insert into loyalty.programme_versions (
  organization_id, programme_group_id, programme_id, version_number, status,
  configuration, configuration_sha256, published_at, retired_at
)
select programme.organization_id, programme.programme_group_id, programme.id,
  1, 'superseded',
  '{"version":"1","tiers":[{"code":"rose","name":"Rose","minimumEligibleSpendMinor":"0","pointsPerMajorUnit":"5"}],"rewards":[]}'::jsonb,
  decode(repeat('1a', 32), 'hex'), '2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z'
from loyalty.programmes as programme
join loyalty.organizations as organization on organization.id = programme.organization_id
where organization.slug = 'expiry-one';
insert into loyalty.programme_versions (
  organization_id, programme_group_id, programme_id, version_number, status,
  configuration, configuration_sha256, published_at
)
select programme.organization_id, programme.programme_group_id, programme.id,
  2, 'published', pg_temp.valid_expiry_v2(),
  decode(repeat('2a', 32), 'hex'), '2026-02-01T00:00:00Z'
from loyalty.programmes as programme
join loyalty.organizations as organization on organization.id = programme.organization_id
where organization.slug = 'expiry-one';

select results_eq(
  $$ select method, expire_after_days, notification_lead_days
     from loyalty.programme_point_expiry_policies $$,
  $$ values ('earned_date'::text, 365::smallint, array[30,14,7]::smallint[]) $$,
  'published V2 policy materializes with exact reminder order'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.programme_point_expiry_policies $$,
  array[1::bigint],
  'legacy V1 versions remain compatible without invented policy history'
);

insert into loyalty.customers (organization_id, display_reference)
select id, 'Expiry test member' from loyalty.organizations where slug = 'expiry-one';
create temporary table expiry_origins (
  operation text primary key,
  origin_entry_public_id uuid not null,
  wallet_public_id uuid not null
);
create temporary table expiry_awards (
  operation text primary key,
  transaction_public_id uuid not null,
  wallet_public_id uuid not null
);

-- Reserve one due lot before creating the other lots so FIFO binds the
-- reservation to this exact original V2 lot.
insert into expiry_awards
select 'v2-reserved', result.transaction_public_id, result.wallet_public_id
from loyalty_private.award_points(
    (select id from loyalty.organizations where slug = 'expiry-one'),
    (select programme_group_id from loyalty.programmes where public_id =
      '87000000-0000-4000-8000-000000000101'),
    (select id from loyalty.programme_versions where version_number = 2 and
      organization_id = (select id from loyalty.organizations where slug = 'expiry-one')),
    (select id from loyalty.customers where display_reference = 'Expiry test member'),
    400, 'expiry:award:reserved', decode(repeat('9a', 32), 'hex'),
    null, 'v2-reserved', '2026-01-15T00:00:00Z'
  ) as result;
insert into expiry_origins
select 'v2-reserved', entry.public_id, awarded.wallet_public_id
from expiry_awards as awarded
join loyalty.ledger_transactions as transaction
  on transaction.public_id = awarded.transaction_public_id
join loyalty.ledger_entries as entry on entry.transaction_id = transaction.id
join loyalty.ledger_accounts as account on account.id = entry.account_id
where awarded.operation = 'v2-reserved'
  and account.account_kind = 'pending' and entry.points > 0;
select * from loyalty_private.release_points(
  (select id from loyalty.organizations where slug = 'expiry-one'),
  (select programme_group_id from loyalty.programmes where public_id =
    '87000000-0000-4000-8000-000000000101'),
  (select id from loyalty.programme_versions where version_number = 2 and
    organization_id = (select id from loyalty.organizations where slug = 'expiry-one')),
  (select origin_entry_public_id from expiry_origins where operation = 'v2-reserved'),
  '2026-08-31T00:00:00Z', 'expiry:release:reserved',
  decode(repeat('aa', 32), 'hex'), '2026-01-15T00:00:00Z'
);
create temporary table expiry_reservation as
select transaction_public_id
from loyalty_private.reserve_points(
  (select id from loyalty.organizations where slug = 'expiry-one'),
  (select programme_group_id from loyalty.programmes where public_id =
    '87000000-0000-4000-8000-000000000101'),
  (select id from loyalty.programme_versions where version_number = 2 and
    organization_id = (select id from loyalty.organizations where slug = 'expiry-one')),
  (select wallet_public_id from expiry_origins where operation = 'v2-reserved'),
  400, 'expiry:reserve:past-due', decode(repeat('ba', 32), 'hex'),
  '2026-08-01T00:00:00Z'
);

insert into expiry_awards
select 'legacy-due', result.transaction_public_id, result.wallet_public_id
from loyalty_private.award_points(
    (select id from loyalty.organizations where slug = 'expiry-one'),
    (select programme_group_id from loyalty.programmes where public_id =
      '87000000-0000-4000-8000-000000000101'),
    (select id from loyalty.programme_versions where version_number = 1 and
      organization_id = (select id from loyalty.organizations where slug = 'expiry-one')),
    (select id from loyalty.customers where display_reference = 'Expiry test member'),
    100, 'expiry:award:legacy', decode(repeat('3a', 32), 'hex'),
    null, 'legacy-due', '2026-01-01T00:00:00Z'
  ) as result;
insert into expiry_origins
select 'legacy-due', entry.public_id, awarded.wallet_public_id
from expiry_awards as awarded
join loyalty.ledger_transactions as transaction
  on transaction.public_id = awarded.transaction_public_id
join loyalty.ledger_entries as entry on entry.transaction_id = transaction.id
join loyalty.ledger_accounts as account on account.id = entry.account_id
where awarded.operation = 'legacy-due'
  and account.account_kind = 'pending' and entry.points > 0;
select * from loyalty_private.release_points(
  (select id from loyalty.organizations where slug = 'expiry-one'),
  (select programme_group_id from loyalty.programmes where public_id =
    '87000000-0000-4000-8000-000000000101'),
  (select id from loyalty.programme_versions where version_number = 1 and
    organization_id = (select id from loyalty.organizations where slug = 'expiry-one')),
  (select origin_entry_public_id from expiry_origins where operation = 'legacy-due'),
  '2026-08-31T00:00:00Z', 'expiry:release:legacy',
  decode(repeat('4a', 32), 'hex'), '2026-01-01T00:00:00Z'
);

insert into expiry_awards
select 'v2-due', result.transaction_public_id, result.wallet_public_id
from loyalty_private.award_points(
    (select id from loyalty.organizations where slug = 'expiry-one'),
    (select programme_group_id from loyalty.programmes where public_id =
      '87000000-0000-4000-8000-000000000101'),
    (select id from loyalty.programme_versions where version_number = 2 and
      organization_id = (select id from loyalty.organizations where slug = 'expiry-one')),
    (select id from loyalty.customers where display_reference = 'Expiry test member'),
    200, 'expiry:award:v2-due', decode(repeat('5a', 32), 'hex'),
    null, 'v2-due', '2026-02-01T00:00:00Z'
  ) as result;
insert into expiry_origins
select 'v2-due', entry.public_id, awarded.wallet_public_id
from expiry_awards as awarded
join loyalty.ledger_transactions as transaction
  on transaction.public_id = awarded.transaction_public_id
join loyalty.ledger_entries as entry on entry.transaction_id = transaction.id
join loyalty.ledger_accounts as account on account.id = entry.account_id
where awarded.operation = 'v2-due'
  and account.account_kind = 'pending' and entry.points > 0;
select * from loyalty_private.release_points(
  (select id from loyalty.organizations where slug = 'expiry-one'),
  (select programme_group_id from loyalty.programmes where public_id =
    '87000000-0000-4000-8000-000000000101'),
  (select id from loyalty.programme_versions where version_number = 2 and
    organization_id = (select id from loyalty.organizations where slug = 'expiry-one')),
  (select origin_entry_public_id from expiry_origins where operation = 'v2-due'),
  '2026-08-31T00:00:00Z', 'expiry:release:v2-due',
  decode(repeat('6a', 32), 'hex'), '2026-02-01T00:00:00Z'
);

insert into expiry_awards
select 'v2-future', result.transaction_public_id, result.wallet_public_id
from loyalty_private.award_points(
    (select id from loyalty.organizations where slug = 'expiry-one'),
    (select programme_group_id from loyalty.programmes where public_id =
      '87000000-0000-4000-8000-000000000101'),
    (select id from loyalty.programme_versions where version_number = 2 and
      organization_id = (select id from loyalty.organizations where slug = 'expiry-one')),
    (select id from loyalty.customers where display_reference = 'Expiry test member'),
    300, 'expiry:award:v2-future', decode(repeat('7a', 32), 'hex'),
    null, 'v2-future', '2026-03-01T00:00:00Z'
  ) as result;
insert into expiry_origins
select 'v2-future', entry.public_id, awarded.wallet_public_id
from expiry_awards as awarded
join loyalty.ledger_transactions as transaction
  on transaction.public_id = awarded.transaction_public_id
join loyalty.ledger_entries as entry on entry.transaction_id = transaction.id
join loyalty.ledger_accounts as account on account.id = entry.account_id
where awarded.operation = 'v2-future'
  and account.account_kind = 'pending' and entry.points > 0;
select * from loyalty_private.release_points(
  (select id from loyalty.organizations where slug = 'expiry-one'),
  (select programme_group_id from loyalty.programmes where public_id =
    '87000000-0000-4000-8000-000000000101'),
  (select id from loyalty.programme_versions where version_number = 2 and
    organization_id = (select id from loyalty.organizations where slug = 'expiry-one')),
  (select origin_entry_public_id from expiry_origins where operation = 'v2-future'),
  '2026-09-30T00:00:00Z', 'expiry:release:v2-future',
  decode(repeat('8a', 32), 'hex'), '2026-03-01T00:00:00Z'
);

grant loyalty_worker to current_user;
grant usage on schema extensions to loyalty_worker;
grant execute on all functions in schema extensions to loyalty_worker;
set local role loyalty_worker;
select results_eq(
  $$ select * from loyalty_private.run_point_expiry_lifecycle_v2(
    '2026-09-01T00:00:00Z', 100
  ) $$,
  $$ values (2, 2::bigint, 300::bigint, 1) $$,
  'one sweep expires legacy and V2 lots in separate version-attributed batches and schedules the 30-day reminder'
);
reset role;
select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_transactions
     where transaction_kind = 'expire' $$,
  array[2::bigint],
  'mixed-version wallet expiry creates one immutable transaction per version'
);
select results_eq(
  $$ select version.version_number, count(*)::bigint
     from loyalty.ledger_transactions as transaction
     join loyalty.programme_versions as version on version.id = transaction.programme_version_id
     where transaction.transaction_kind = 'expire'
     group by version.version_number order by version.version_number $$,
  $$ values (1, 1::bigint), (2, 1::bigint) $$,
  'each expiry transaction retains its original programme version'
);
select results_eq(
  $$ select balance.remaining_points
     from loyalty.point_lot_balances as balance
     join loyalty.point_lots as lot on lot.id = balance.lot_id
     where lot.expires_at = '2026-08-31T00:00:00Z'
     order by lot.programme_version_id $$,
  $$ values (0::bigint), (0::bigint) $$,
  'both due lots are fully consumed exactly once'
);
select results_eq(
  $$ select balance.remaining_points
     from loyalty.point_lot_balances as balance
     join loyalty.point_lots as lot on lot.id = balance.lot_id
     where lot.expires_at = '2026-09-30T00:00:00Z' $$,
  array[300::bigint],
  'future points remain spendable'
);
select results_eq(
  $$ select count(*)::bigint from loyalty_private.point_expiry_notifications $$,
  array[1::bigint],
  'the first eligible reminder has one durable deduplication fence'
);
select results_eq(
  $$ select payload_version, payload ->> 'expiryMethod'
     from loyalty_private.transactional_outbox
     where topic = 'loyalty.points.expiring' $$,
  $$ values ('v2'::text, 'earned_date'::text) $$,
  'notification outbox declares the versioned earned-date contract'
);

set local role loyalty_worker;
select results_eq(
  $$ select * from loyalty_private.run_point_expiry_lifecycle_v2(
    '2026-09-01T00:00:00Z', 100
  ) $$,
  $$ values (0, 0::bigint, 0::bigint, 0) $$,
  'replaying the exact lifecycle creates no value or notification duplicate'
);
reset role;
select results_eq(
  $$ select count(*)::bigint from loyalty_private.point_expiry_notifications $$,
  array[1::bigint],
  'replay retains one reminder fence'
);
set local role authenticated;
set local request.jwt.claim.sub = '87000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select outstanding_points, overdue_points, reserved_past_expiry_points,
      expiring_30_days, affected_members
     from loyalty.get_programme_expiry_liability_v2(
       '87000000-0000-4000-8000-000000000101', '2026-09-01T00:00:00Z'
     ) $$,
  $$ values ('700'::text, '0'::text, '400'::text, '300'::text, '1'::text) $$,
  'liability keeps an unresolved reward reservation tied to its past-due original lot'
);
reset role;
select results_eq(
  $$ select outcome from loyalty_private.cancel_reservation(
    (select id from loyalty.organizations where slug = 'expiry-one'),
    (select transaction_public_id from expiry_reservation),
    'expiry:cancel:past-due', decode(repeat('ca', 32), 'hex'),
    '2026-09-02T00:00:00Z'
  ) $$,
  array['created'::text],
  'definitive cancellation restores the original lot without resetting expiry'
);
select results_eq(
  $$ select balance.remaining_points
     from loyalty.point_lot_balances as balance
     join loyalty.point_lots as lot on lot.id = balance.lot_id
     join loyalty.ledger_entries as entry on entry.id = lot.origin_entry_id
     where entry.public_id = (
       select origin_entry_public_id from expiry_origins
       where operation = 'v2-reserved'
     ) $$,
  array[400::bigint],
  'released reservation returns points to the exact original past-due lot'
);
set local role loyalty_worker;
select results_eq(
  $$ select * from loyalty_private.run_point_expiry_lifecycle_v2(
    '2026-09-02T00:00:00Z', 100
  ) $$,
  $$ values (1, 1::bigint, 400::bigint, 0) $$,
  'the next sweep immediately expires restored past-due points with original version attribution'
);
reset role;
select results_eq(
  $$ select balance.remaining_points
     from loyalty.point_lot_balances as balance
     join loyalty.point_lots as lot on lot.id = balance.lot_id
     join loyalty.ledger_entries as entry on entry.id = lot.origin_entry_id
     where entry.public_id = (
       select origin_entry_public_id from expiry_origins
       where operation = 'v2-reserved'
     ) $$,
  array[0::bigint],
  'restored past-due lot is consumed exactly once'
);

set local role loyalty_worker;
select results_eq(
  $$ select notifications_enqueued from loyalty_private.run_point_expiry_lifecycle_v2(
    '2026-09-17T00:00:00Z', 100
  ) $$,
  array[1],
  'the 14-day reminder becomes eligible once'
);
select results_eq(
  $$ select notifications_enqueued from loyalty_private.run_point_expiry_lifecycle_v2(
    '2026-09-17T00:00:00Z', 100
  ) $$,
  array[0],
  'the 14-day reminder is idempotent on retry'
);
select results_eq(
  $$ select notifications_enqueued from loyalty_private.run_point_expiry_lifecycle_v2(
    '2026-09-24T00:00:00Z', 100
  ) $$,
  array[1],
  'the 7-day reminder becomes eligible once'
);
reset role;
select results_eq(
  $$ select count(*)::bigint from loyalty_private.transactional_outbox
     where topic = 'loyalty.points.expiring' $$,
  array[3::bigint],
  'each configured reminder creates one transactional outbox event'
);
select results_eq(
  $$ select notify_before_days from loyalty_private.point_expiry_notifications
     order by notify_before_days desc $$,
  $$ values (30::smallint), (14::smallint), (7::smallint) $$,
  'notification history preserves the configured 30, 14, and 7 day schedule'
);

set local role authenticated;
set local request.jwt.claim.sub = '87000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select outstanding_points, overdue_points, reserved_past_expiry_points, expiring_30_days,
      expiring_90_days, affected_members
     from loyalty.get_programme_expiry_liability_v2(
       '87000000-0000-4000-8000-000000000101', '2026-09-01T00:00:00Z'
     ) $$,
  $$ values ('300'::text, '0'::text, '0'::text, '300'::text, '300'::text, '1'::text) $$,
  'merchant liability preview reconciles to immutable remaining lots'
);
select results_eq(
  $$ select next_expiry_at
     from loyalty.get_programme_expiry_liability_v2(
       '87000000-0000-4000-8000-000000000101', '2026-09-01T00:00:00Z'
     ) $$,
  $$ values ('2026-09-30T00:00:00Z'::timestamptz) $$,
  'merchant preview reports the exact next immutable lot deadline'
);
select results_eq(
  $$ select routine.proargnames[3:9]
     from pg_proc as routine
     where routine.oid =
       'loyalty.get_programme_expiry_liability_v2(uuid,timestamp with time zone)'::regprocedure $$,
  $$ values (array[
    'outstanding_points', 'overdue_points', 'reserved_past_expiry_points', 'expiring_30_days',
    'expiring_90_days', 'affected_members', 'next_expiry_at'
  ]::text[]) $$,
  'liability read model exposes aggregates and no customer identity'
);
set local request.jwt.claim.sub = '88000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select * from loyalty.get_programme_expiry_liability_v2(
    '87000000-0000-4000-8000-000000000101', '2026-09-01T00:00:00Z'
  ) $$,
  '42501', 'programme access denied',
  'another tenant cannot read expiry liability'
);
reset role;

set local role loyalty_worker;
select throws_ok(
  $$ select * from loyalty_private.run_point_expiry_lifecycle_v2(now(), 501) $$,
  '22023', 'invalid point expiry lifecycle sweep',
  'worker cannot request an unbounded expiry sweep'
);
select throws_ok(
  $$ select * from loyalty_private.run_point_expiry_lifecycle_v2(now(), null) $$,
  '22023', 'invalid point expiry lifecycle sweep',
  'null cannot bypass the lifecycle limit'
);
reset role;
select ok(
  not has_function_privilege(
    'loyalty_worker',
    'loyalty_private.expire_points(bigint,uuid,bigint,timestamp with time zone,text,bytea)',
    'EXECUTE'
  ),
  'worker cannot bypass version grouping through the low-level expiry command'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'loyalty_private.validate_point_expiry_policy_v2(jsonb)', 'EXECUTE'
  ),
  'browser sessions cannot invoke the private expiry validator'
);
select throws_ok(
  $$ update loyalty.programme_point_expiry_policies
     set expire_after_days = 300 $$,
  '55000', 'immutable loyalty history cannot be changed',
  'published expiry policy rejects corrective rewrites'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.redemption_allocations
     where allocation_kind = 'expire' $$,
  array[3::bigint],
  'one immutable expiry allocation exists per consumed lot'
);
select is_empty(
  $$ select * from loyalty_private.wallet_projection_differences() $$,
  'expiry leaves wallet projections exactly rebuildable'
);
select is_empty(
  $$ select * from loyalty_private.point_lot_projection_differences() $$,
  'expiry leaves point-lot projections exactly rebuildable'
);

select * from finish();
rollback;
