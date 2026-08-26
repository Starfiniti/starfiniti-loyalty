begin;

create extension if not exists pgtap with schema extensions;

select plan(58);

select results_eq(
  $$ select relrowsecurity from pg_class where oid = 'loyalty_private.currency_conversion_policy_versions'::regclass $$,
  array[true], 'currency policy revisions have RLS enabled'
);
select results_eq(
  $$ select relrowsecurity from pg_class where oid = 'loyalty_private.currency_rate_snapshots'::regclass $$,
  array[true], 'currency rate snapshots have RLS enabled'
);
select results_eq(
  $$ select relrowsecurity from pg_class where oid = 'loyalty_private.currency_conversion_evidence'::regclass $$,
  array[true], 'currency conversion batches have RLS enabled'
);
select results_eq(
  $$ select relrowsecurity from pg_class where oid = 'loyalty_private.currency_conversion_amounts'::regclass $$,
  array[true], 'atomic conversion amounts have RLS enabled'
);
select ok(
  has_function_privilege('authenticated', 'loyalty.configure_programme_currency_policy_v1(uuid,text,integer,text,integer,text,integer,text,uuid)', 'EXECUTE'),
  'authenticated callers can enter the guarded policy command'
);
select ok(
  has_function_privilege('authenticated', 'loyalty.get_programme_currency_policies_v1(uuid)', 'EXECUTE'),
  'authenticated members can enter the minimized policy read'
);
select ok(
  not has_function_privilege('anon', 'loyalty.configure_programme_currency_policy_v1(uuid,text,integer,text,integer,text,integer,text,uuid)', 'EXECUTE'),
  'anonymous callers cannot configure currency policy'
);
select ok(
  not has_function_privilege('anon', 'loyalty.get_programme_currency_policies_v1(uuid)', 'EXECUTE'),
  'anonymous callers cannot read currency policy'
);
select ok(
  has_function_privilege('loyalty_worker', 'loyalty_private.record_currency_rate_snapshot_v1(bigint,text,text,text,integer,text,integer,numeric,numeric,timestamptz,timestamptz,timestamptz,bytea)', 'EXECUTE'),
  'only the worker boundary can ingest provider snapshots'
);
select ok(
  has_function_privilege('loyalty_worker', 'loyalty_private.resolve_currency_conversion_context_v1(bigint,bigint,text,integer,timestamptz,uuid)', 'EXECUTE'),
  'the worker can resolve an occurrence-time conversion context'
);
select ok(
  has_function_privilege('loyalty_worker', 'loyalty_private.record_currency_conversion_evidence_v1(bigint,uuid,bigint,uuid,uuid,uuid,jsonb,bytea,bytea)', 'EXECUTE'),
  'the worker can submit independently checked conversion evidence'
);
select ok(
  not has_function_privilege('loyalty_runtime', 'loyalty_private.record_currency_rate_snapshot_v1(bigint,text,text,text,integer,text,integer,numeric,numeric,timestamptz,timestamptz,timestamptz,bytea)', 'EXECUTE'),
  'ingestion runtime cannot become exchange-rate authority'
);
select ok(
  not has_function_privilege('authenticated', 'loyalty_private.record_currency_rate_snapshot_v1(bigint,text,text,text,integer,text,integer,numeric,numeric,timestamptz,timestamptz,timestamptz,bytea)', 'EXECUTE'),
  'browser roles cannot become exchange-rate authority'
);
select ok(
  not has_table_privilege('authenticated', 'loyalty_private.currency_conversion_evidence', 'SELECT'),
  'browser roles cannot inspect private conversion rows directly'
);
select ok(
  not has_table_privilege('loyalty_worker', 'loyalty_private.currency_rate_snapshots', 'INSERT'),
  'worker ingestion is restricted to the validating function'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname in ('loyalty', 'loyalty_private')
      and routine.proname in (
        'configure_programme_currency_policy_v1',
        'get_programme_currency_policies_v1',
        'record_currency_rate_snapshot_v1',
        'resolve_currency_conversion_context_v1',
        'record_currency_conversion_evidence_v1'
      ) and routine.prosecdef
  $$,
  array[5::bigint], 'all currency boundaries are security-definer functions'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname in ('loyalty', 'loyalty_private')
      and routine.proname in (
        'configure_programme_currency_policy_v1',
        'get_programme_currency_policies_v1',
        'record_currency_rate_snapshot_v1',
        'resolve_currency_conversion_context_v1',
        'record_currency_conversion_evidence_v1'
      ) and exists (
        select 1 from unnest(routine.proconfig) as setting
        where setting = 'search_path=""'
      )
  $$,
  array[5::bigint], 'all currency boundaries use an empty search path'
);
select is_empty(
  $$
    select parameter_name from information_schema.parameters
    where specific_schema = 'loyalty'
      and specific_name like 'configure_programme_currency_policy_v1_%'
      and parameter_name in ('organization_id', 'actor_user_id', 'programme_id', 'programme_group_id')
  $$,
  'the browser command accepts no internal tenant actor or programme authority'
);

insert into auth.users (id, email)
values
  ('95000000-0000-4000-8000-000000000001', 'currency-owner@example.test'),
  ('95000000-0000-4000-8000-000000000002', 'currency-operator@example.test'),
  ('95000000-0000-4000-8000-000000000003', 'currency-revoked@example.test'),
  ('96000000-0000-4000-8000-000000000001', 'currency-other@example.test');

insert into loyalty.organizations (public_id, slug, name)
values
  ('95000000-0000-4000-8000-000000000100', 'currency-one', 'Currency One'),
  ('96000000-0000-4000-8000-000000000100', 'currency-two', 'Currency Two');

insert into loyalty.organization_memberships (organization_id, user_id, role, revoked_at)
values
  ((select id from loyalty.organizations where slug = 'currency-one'), '95000000-0000-4000-8000-000000000001', 'owner', null),
  ((select id from loyalty.organizations where slug = 'currency-one'), '95000000-0000-4000-8000-000000000002', 'operator', null),
  ((select id from loyalty.organizations where slug = 'currency-one'), '95000000-0000-4000-8000-000000000003', 'owner', now()),
  ((select id from loyalty.organizations where slug = 'currency-two'), '96000000-0000-4000-8000-000000000001', 'owner', null);

insert into loyalty.workspaces (public_id, organization_id, slug, name)
select case organization.slug
    when 'currency-one' then '95000000-0000-4000-8000-000000000200'::uuid
    else '96000000-0000-4000-8000-000000000200'::uuid end,
  organization.id, 'store', organization.name || ' Store'
from loyalty.organizations as organization
where organization.slug in ('currency-one', 'currency-two');

insert into loyalty.programme_groups (public_id, organization_id, slug, name)
select case organization.slug
    when 'currency-one' then '95000000-0000-4000-8000-000000000300'::uuid
    else '96000000-0000-4000-8000-000000000300'::uuid end,
  organization.id, 'rewards', organization.name || ' Rewards'
from loyalty.organizations as organization
where organization.slug in ('currency-one', 'currency-two');

insert into loyalty.programmes (
  public_id, organization_id, programme_group_id, slug, name
)
select case organization.slug
    when 'currency-one' then '95000000-0000-4000-8000-000000000400'::uuid
    else '96000000-0000-4000-8000-000000000400'::uuid end,
  organization.id, programme_group.id, 'rewards', organization.name || ' Rewards'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
where organization.slug in ('currency-one', 'currency-two');

create function pg_temp.currency_v2_definition()
returns jsonb language sql immutable as $$
  select '{
    "version":"2","currencyCode":"EUR","currencyMinorUnitDigits":2,
    "pendingDays":30,"pointsExpireAfterDays":365,
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

insert into loyalty.programme_versions (
  public_id, organization_id, programme_group_id, programme_id,
  version_number, status, configuration, configuration_sha256,
  created_by_user_id, approved_by_user_id, published_at
)
select case organization.slug
    when 'currency-one' then '95000000-0000-4000-8000-000000000500'::uuid
    else '96000000-0000-4000-8000-000000000500'::uuid end,
  organization.id, programme.programme_group_id, programme.id, 1,
  'published', pg_temp.currency_v2_definition(),
  extensions.digest(convert_to(pg_temp.currency_v2_definition()::text, 'UTF8'), 'sha256'),
  membership.user_id, membership.user_id, now()
from loyalty.organizations as organization
join loyalty.programmes as programme on programme.organization_id = organization.id
join loyalty.organization_memberships as membership
  on membership.organization_id = organization.id and membership.role = 'owner'
  and membership.revoked_at is null
where organization.slug in ('currency-one', 'currency-two');

insert into loyalty.commerce_connections (
  public_id, organization_id, workspace_id, programme_id,
  external_store_id, display_name, current_key_version, signing_material_ref
)
select case organization.slug
    when 'currency-one' then '95000000-0000-4000-8000-000000000600'::uuid
    else '96000000-0000-4000-8000-000000000600'::uuid end,
  organization.id, workspace.id, programme.id, organization.slug || '-store',
  organization.name || ' Store', 'v1', 'vault://' || organization.slug
from loyalty.organizations as organization
join loyalty.workspaces as workspace on workspace.organization_id = organization.id
join loyalty.programmes as programme on programme.organization_id = organization.id
where organization.slug in ('currency-one', 'currency-two');

set local role authenticated;
set local request.jwt.claim.sub = '95000000-0000-4000-8000-000000000001';

create temporary table currency_policy_result as
select * from loyalty.configure_programme_currency_policy_v1(
  '95000000-0000-4000-8000-000000000500', 'USD', 2,
  'verified-test-feed', 86400, 'enabled', 0,
  'currency:policy:usd:1', '95000000-0000-4000-8000-000000000700'
);
select results_eq(
  $$ select outcome || ':' || revision::text || ':' || state from currency_policy_result $$,
  array['created:1:enabled'::text], 'owner creates one enabled immutable currency policy'
);
select results_eq(
  $$ select (policy ->> 'sourceCurrencyCode') || ':' || (policy ->> 'baseCurrencyCode') || ':' || (policy ->> 'roundingMode') from loyalty.get_programme_currency_policies_v1('95000000-0000-4000-8000-000000000500') $$,
  array['USD:EUR:half_away_from_zero'::text], 'minimized read exposes exact source base and rounding policy'
);
select results_eq(
  $$ select outcome from loyalty.configure_programme_currency_policy_v1('95000000-0000-4000-8000-000000000500', 'USD', 2, 'verified-test-feed', 86400, 'enabled', 0, 'currency:policy:usd:1', '95000000-0000-4000-8000-000000000700') $$,
  array['duplicate'::text], 'exact policy command retry returns its original revision'
);
select throws_ok(
  $$ select * from loyalty.configure_programme_currency_policy_v1('95000000-0000-4000-8000-000000000500', 'USD', 2, 'other-feed', 86400, 'enabled', 0, 'currency:policy:usd:1', '95000000-0000-4000-8000-000000000700') $$,
  '23514', 'currency policy idempotency conflict', 'changed policy retry fails closed'
);
reset role;
select results_eq(
  $$ select count(*)::bigint from loyalty_private.currency_conversion_policy_versions where organization_id = (select id from loyalty.organizations where slug = 'currency-one') $$,
  array[1::bigint], 'policy retry creates one immutable revision'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.admin_audit_events where action = 'programme.currency_policy.configure' $$,
  array[1::bigint], 'policy command appends one audit event'
);
set local role authenticated;
set local request.jwt.claim.sub = '95000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select * from loyalty.configure_programme_currency_policy_v1('95000000-0000-4000-8000-000000000500', 'EUR', 2, 'verified-test-feed', 86400, 'enabled', 0, 'currency:policy:eur:1', '95000000-0000-4000-8000-000000000701') $$,
  '22023', 'currency policy source must differ from programme base', 'same-currency policy is rejected'
);

set local request.jwt.claim.sub = '95000000-0000-4000-8000-000000000002';
select throws_ok(
  $$ select * from loyalty.configure_programme_currency_policy_v1('95000000-0000-4000-8000-000000000500', 'GBP', 2, 'verified-test-feed', 86400, 'enabled', 0, 'currency:policy:gbp:1', '95000000-0000-4000-8000-000000000702') $$,
  '42501', 'currency policy command not authorized', 'operator cannot configure exchange-rate authority'
);
set local request.jwt.claim.sub = '95000000-0000-4000-8000-000000000003';
select throws_ok(
  $$ select * from loyalty.configure_programme_currency_policy_v1('95000000-0000-4000-8000-000000000500', 'GBP', 2, 'verified-test-feed', 86400, 'enabled', 0, 'currency:policy:gbp:1', '95000000-0000-4000-8000-000000000703') $$,
  '42501', 'currency policy command not authorized', 'revoked owner cannot configure currency policy'
);
set local request.jwt.claim.sub = '96000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select * from loyalty.get_programme_currency_policies_v1('95000000-0000-4000-8000-000000000500') $$,
  '42501', 'currency policy read not authorized', 'another tenant cannot read currency policy'
);

reset role;

grant select on currency_policy_result to loyalty_worker;

insert into loyalty_private.commerce_delivery_inbox (
  receipt_id, organization_id, connection_id, source_delivery_id,
  envelope_version, source_event_id, event_type, source_object_id,
  source_revision, occurred_at, delivered_at, key_version, nonce,
  body_sha256, raw_body, state
)
select '95000000-0000-4000-8000-000000000800', organization.id,
  connection.id, 'currency-delivery-1', '1', 'currency-event-1',
  'commerce.order.status_changed', 'order-1', '1', clock_timestamp(), clock_timestamp(), 'v1',
  'currency-nonce-1', repeat('a', 64),
  '{"version":"1","payload":{"kind":"order_status_changed","previousStatus":"processing","order":{"currency":"USD","currencyMinorUnitDigits":2}}}'::jsonb,
  'applied'
from loyalty.organizations as organization
join loyalty.commerce_connections as connection on connection.organization_id = organization.id
where organization.slug = 'currency-one';

insert into loyalty_private.canonical_commerce_events (
  public_id, organization_id, connection_id, delivery_inbox_id,
  source_event_id, normalization_version, event_type, source_object_id,
  source_revision, occurred_at, payload
)
select '95000000-0000-4000-8000-000000000810', inbox.organization_id,
  inbox.connection_id, inbox.id, inbox.source_event_id, 'v1', inbox.event_type,
  inbox.source_object_id, inbox.source_revision, inbox.occurred_at,
  inbox.raw_body -> 'payload'
from loyalty_private.commerce_delivery_inbox as inbox
where inbox.receipt_id = '95000000-0000-4000-8000-000000000800';

grant loyalty_worker to current_user;
set local role loyalty_worker;

select is_empty(
  $$ select * from loyalty_private.resolve_currency_conversion_context_v1((select id from loyalty.organizations where slug = 'currency-one'), (select id from loyalty.programme_versions where public_id = '95000000-0000-4000-8000-000000000500'), 'USD', 2, (select occurred_at from loyalty_private.canonical_commerce_events where public_id = '95000000-0000-4000-8000-000000000810'), null) $$,
  'policy without a provider snapshot remains unavailable'
);
create temporary table rate_result as
select * from loyalty_private.record_currency_rate_snapshot_v1(
  (select id from loyalty.organizations where slug = 'currency-one'),
  'verified-test-feed', 'usd-eur-2026-08-26-1', 'USD', 2, 'EUR', 2,
  85, 100, now() - interval '1 hour', now() - interval '1 hour',
  now() + interval '23 hours', decode(repeat('b', 64), 'hex')
);
select results_eq(
  $$ select outcome from rate_result $$,
  array['created'::text], 'worker records one exact provider snapshot'
);
select results_eq(
  $$ select outcome from loyalty_private.record_currency_rate_snapshot_v1((select id from loyalty.organizations where slug = 'currency-one'), 'verified-test-feed', 'usd-eur-2026-08-26-1', 'USD', 2, 'EUR', 2, 85, 100, now() - interval '1 hour', now() - interval '1 hour', now() + interval '23 hours', decode(repeat('b', 64), 'hex')) $$,
  array['duplicate'::text], 'exact provider retry returns one snapshot'
);
select throws_ok(
  $$ select * from loyalty_private.record_currency_rate_snapshot_v1((select id from loyalty.organizations where slug = 'currency-one'), 'verified-test-feed', 'usd-eur-2026-08-26-1', 'USD', 2, 'EUR', 2, 86, 100, now() - interval '1 hour', now() - interval '1 hour', now() + interval '23 hours', decode(repeat('b', 64), 'hex')) $$,
  '23514', 'currency rate reference conflict', 'changed provider-reference retry fails closed'
);
create temporary table resolved_context as
select * from loyalty_private.resolve_currency_conversion_context_v1(
  (select id from loyalty.organizations where slug = 'currency-one'),
  (select id from loyalty.programme_versions where public_id = '95000000-0000-4000-8000-000000000500'),
  'USD', 2, (select occurred_at from loyalty_private.canonical_commerce_events where public_id = '95000000-0000-4000-8000-000000000810'), null
);
select results_eq(
  $$ select (conversion_context -> 'snapshot' ->> 'providerKey') || ':' || (conversion_context -> 'snapshot' ->> 'rateNumerator') || '/' || (conversion_context -> 'snapshot' ->> 'rateDenominator') from resolved_context $$,
  array['verified-test-feed:85/100'::text], 'resolution returns one exact provider rational'
);
select results_eq(
  $$ select (conversion_context -> 'policy' ->> 'baseCurrencyCode') || ':' || (conversion_context -> 'policy' ->> 'roundingMode') from resolved_context $$,
  array['EUR:half_away_from_zero'::text], 'resolution binds base scope and rounding policy'
);
select is_empty(
  $$ select * from loyalty_private.resolve_currency_conversion_context_v1((select id from loyalty.organizations where slug = 'currency-one'), (select id from loyalty.programme_versions where public_id = '95000000-0000-4000-8000-000000000500'), 'USD', 3, (select occurred_at from loyalty_private.canonical_commerce_events where public_id = '95000000-0000-4000-8000-000000000810'), null) $$,
  'precision mismatch cannot resolve a snapshot'
);
select is_empty(
  $$ select * from loyalty_private.resolve_currency_conversion_context_v1((select id from loyalty.organizations where slug = 'currency-one'), (select id from loyalty.programme_versions where public_id = '95000000-0000-4000-8000-000000000500'), 'USD', 2, now() + interval '2 days', null) $$,
  'expired or stale snapshots remain unavailable'
);

create temporary table conversion_result as
select * from loyalty_private.record_currency_conversion_evidence_v1(
  (select id from loyalty.organizations where slug = 'currency-one'),
  '95000000-0000-4000-8000-000000000810',
  (select id from loyalty.programme_versions where public_id = '95000000-0000-4000-8000-000000000500'),
  (select policy_version_public_id from currency_policy_result),
  (select rate_snapshot_public_id from rate_result),
  null,
  '[{"amountKey":"line:0:gross","sourceAmountMinor":"12345","baseAmountMinor":"10493","exactNumerator":"104932500","exactDenominator":"10000","roundingDeltaNumerator":"-2500"}]'::jsonb,
  decode(repeat('c', 64), 'hex'), decode(repeat('d', 64), 'hex')
);
select results_eq(
  $$ select outcome from conversion_result $$,
  array['created'::text], 'worker records one PostgreSQL-verified conversion batch'
);
select results_eq(
  $$ select count(*)::bigint from loyalty_private.currency_conversion_amounts $$,
  array[1::bigint], 'one normalized atomic amount backs the conversion batch'
);
select results_eq(
  $$ select source_amount_minor::text || ':' || base_amount_minor::text || ':' || rounding_delta_numerator::text from loyalty_private.currency_conversion_amounts $$,
  array['12345:10493:-2500'::text], 'atomic evidence retains exact source base and rounding delta'
);
select results_eq(
  $$ select outcome from loyalty_private.record_currency_conversion_evidence_v1((select id from loyalty.organizations where slug = 'currency-one'), '95000000-0000-4000-8000-000000000810', (select id from loyalty.programme_versions where public_id = '95000000-0000-4000-8000-000000000500'), (select policy_version_public_id from currency_policy_result), (select rate_snapshot_public_id from rate_result), null, '[{"amountKey":"line:0:gross","sourceAmountMinor":"12345","baseAmountMinor":"10493","exactNumerator":"104932500","exactDenominator":"10000","roundingDeltaNumerator":"-2500"}]'::jsonb, decode(repeat('c', 64), 'hex'), decode(repeat('d', 64), 'hex')) $$,
  array['duplicate'::text], 'exact conversion retry returns its original batch'
);
select throws_ok(
  $$ select * from loyalty_private.record_currency_conversion_evidence_v1((select id from loyalty.organizations where slug = 'currency-one'), '95000000-0000-4000-8000-000000000810', (select id from loyalty.programme_versions where public_id = '95000000-0000-4000-8000-000000000500'), (select policy_version_public_id from currency_policy_result), (select rate_snapshot_public_id from rate_result), null, '[{"amountKey":"line:0:gross","sourceAmountMinor":"12345","baseAmountMinor":"10493","exactNumerator":"104932500","exactDenominator":"10000","roundingDeltaNumerator":"-2500"}]'::jsonb, decode(repeat('e', 64), 'hex'), decode(repeat('d', 64), 'hex')) $$,
  '23514', 'currency conversion event conflict', 'changed projection hash cannot reuse an event'
);
select throws_ok(
  $$ select * from loyalty_private.record_currency_conversion_evidence_v1((select id from loyalty.organizations where slug = 'currency-one'), '95000000-0000-4000-8000-000000000810', (select id from loyalty.programme_versions where public_id = '95000000-0000-4000-8000-000000000500'), (select policy_version_public_id from currency_policy_result), (select rate_snapshot_public_id from rate_result), null, '[{"amountKey":"line:0:gross","sourceAmountMinor":"100","baseAmountMinor":"85","exactNumerator":"850000","exactDenominator":"10000","roundingDeltaNumerator":"0"}]'::jsonb, decode(repeat('c', 64), 'hex'), decode(repeat('d', 64), 'hex')) $$,
  '23514', 'currency conversion event conflict', 'changed atomic amount batch cannot reuse projection hashes'
);
select results_eq(
  $$ select (conversion_context -> 'snapshot' ->> 'rateNumerator') || ':' || (conversion_context -> 'policy' ->> 'revision') from loyalty_private.resolve_currency_conversion_context_v1((select id from loyalty.organizations where slug = 'currency-one'), (select id from loyalty.programme_versions where public_id = '95000000-0000-4000-8000-000000000500'), 'USD', 2, now() + interval '30 days', (select conversion_evidence_public_id from conversion_result)) $$,
  array['85:1'::text], 'refund resolution reuses original evidence after current validity expires'
);

reset role;

insert into loyalty_private.commerce_delivery_inbox (
  receipt_id, organization_id, connection_id, source_delivery_id,
  envelope_version, source_event_id, event_type, source_object_id,
  source_revision, occurred_at, delivered_at, key_version, nonce,
  body_sha256, raw_body, state
)
select '95000000-0000-4000-8000-000000000802', organization.id,
  connection.id, 'currency-delivery-refund', '1', 'currency-event-refund',
  'commerce.order.refunded', 'order-1', '2', clock_timestamp(), clock_timestamp(), 'v1',
  'currency-nonce-refund', repeat('3', 64),
  '{"version":"1","payload":{"kind":"order_refunded","refundId":"refund-1","refundAmount":"1.00","order":{"currency":"USD","currencyMinorUnitDigits":2}}}'::jsonb,
  'applied'
from loyalty.organizations as organization
join loyalty.commerce_connections as connection on connection.organization_id = organization.id
where organization.slug = 'currency-one';
insert into loyalty_private.canonical_commerce_events (
  public_id, organization_id, connection_id, delivery_inbox_id,
  source_event_id, normalization_version, event_type, source_object_id,
  source_revision, occurred_at, payload
)
select '95000000-0000-4000-8000-000000000812', inbox.organization_id,
  inbox.connection_id, inbox.id, inbox.source_event_id, 'v1', inbox.event_type,
  inbox.source_object_id, inbox.source_revision, inbox.occurred_at,
  inbox.raw_body -> 'payload'
from loyalty_private.commerce_delivery_inbox as inbox
where inbox.receipt_id = '95000000-0000-4000-8000-000000000802';

set local role loyalty_worker;
select throws_ok(
  $$ select * from loyalty_private.record_currency_conversion_evidence_v1((select id from loyalty.organizations where slug = 'currency-one'), '95000000-0000-4000-8000-000000000812', (select id from loyalty.programme_versions where public_id = '95000000-0000-4000-8000-000000000500'), (select policy_version_public_id from currency_policy_result), (select rate_snapshot_public_id from rate_result), null, '[{"amountKey":"order:refunded","sourceAmountMinor":"100","baseAmountMinor":"85","exactNumerator":"850000","exactDenominator":"10000","roundingDeltaNumerator":"0"}]'::jsonb, decode(repeat('4', 64), 'hex'), decode(repeat('5', 64), 'hex')) $$,
  '23514', 'foreign refund requires original conversion evidence', 'foreign refund cannot record a current-rate batch without its original award evidence'
);
create temporary table refund_conversion_result as
select * from loyalty_private.record_currency_conversion_evidence_v1(
  (select id from loyalty.organizations where slug = 'currency-one'),
  '95000000-0000-4000-8000-000000000812',
  (select id from loyalty.programme_versions where public_id = '95000000-0000-4000-8000-000000000500'),
  (select policy_version_public_id from currency_policy_result),
  (select rate_snapshot_public_id from rate_result),
  (select conversion_evidence_public_id from conversion_result),
  '[{"amountKey":"order:refunded","sourceAmountMinor":"100","baseAmountMinor":"85","exactNumerator":"850000","exactDenominator":"10000","roundingDeltaNumerator":"0"}]'::jsonb,
  decode(repeat('4', 64), 'hex'), decode(repeat('5', 64), 'hex')
);
select results_eq(
  $$ select outcome from refund_conversion_result $$,
  array['created'::text], 'foreign refund records a new batch only with matching original evidence'
);
select results_eq(
  $$ select current_event.source_object_id || ':' || origin_event.source_object_id from loyalty_private.currency_conversion_evidence as current_evidence join loyalty_private.canonical_commerce_events as current_event on current_event.organization_id = current_evidence.organization_id and current_event.id = current_evidence.canonical_event_id join loyalty_private.currency_conversion_evidence as origin_evidence on origin_evidence.organization_id = current_evidence.organization_id and origin_evidence.id = current_evidence.origin_conversion_evidence_id join loyalty_private.canonical_commerce_events as origin_event on origin_event.organization_id = origin_evidence.organization_id and origin_event.id = origin_evidence.canonical_event_id where current_evidence.public_id = (select conversion_evidence_public_id from refund_conversion_result) $$,
  array['order-1:order-1'::text], 'refund evidence retains a database-enforced same-order origin link'
);
reset role;

insert into loyalty_private.commerce_delivery_inbox (
  receipt_id, organization_id, connection_id, source_delivery_id,
  envelope_version, source_event_id, event_type, source_object_id,
  source_revision, occurred_at, delivered_at, key_version, nonce,
  body_sha256, raw_body, state
)
select '95000000-0000-4000-8000-000000000801', organization.id,
  connection.id, 'currency-delivery-2', '1', 'currency-event-2',
  'commerce.order.status_changed', 'order-2', '1', clock_timestamp(), clock_timestamp(), 'v1',
  'currency-nonce-2', repeat('e', 64),
  '{"version":"1","payload":{"kind":"order_status_changed","previousStatus":"processing","order":{"currency":"USD","currencyMinorUnitDigits":2}}}'::jsonb,
  'applied'
from loyalty.organizations as organization
join loyalty.commerce_connections as connection on connection.organization_id = organization.id
where organization.slug = 'currency-one';
insert into loyalty_private.canonical_commerce_events (
  public_id, organization_id, connection_id, delivery_inbox_id,
  source_event_id, normalization_version, event_type, source_object_id,
  source_revision, occurred_at, payload
)
select '95000000-0000-4000-8000-000000000811', inbox.organization_id,
  inbox.connection_id, inbox.id, inbox.source_event_id, 'v1', inbox.event_type,
  inbox.source_object_id, inbox.source_revision, inbox.occurred_at,
  inbox.raw_body -> 'payload'
from loyalty_private.commerce_delivery_inbox as inbox
where inbox.receipt_id = '95000000-0000-4000-8000-000000000801';

set local role loyalty_worker;
select throws_ok(
  $$ select * from loyalty_private.record_currency_conversion_evidence_v1((select id from loyalty.organizations where slug = 'currency-one'), '95000000-0000-4000-8000-000000000811', (select id from loyalty.programme_versions where public_id = '95000000-0000-4000-8000-000000000500'), (select policy_version_public_id from currency_policy_result), (select rate_snapshot_public_id from rate_result), null, '[{"amountKey":"line:0:gross","sourceAmountMinor":"12345","baseAmountMinor":"10492","exactNumerator":"104932500","exactDenominator":"10000","roundingDeltaNumerator":"-12500"}]'::jsonb, decode(repeat('f', 64), 'hex'), decode(repeat('1', 64), 'hex')) $$,
  '23514', 'currency conversion arithmetic mismatch', 'worker arithmetic is independently rejected when one base minor differs'
);
reset role;
select results_eq(
  $$ select count(*)::bigint from loyalty_private.currency_conversion_evidence where canonical_event_id = (select id from loyalty_private.canonical_commerce_events where public_id = '95000000-0000-4000-8000-000000000811') $$,
  array[0::bigint], 'failed arithmetic leaves no conversion batch'
);
set local role loyalty_worker;
create temporary table stale_rate_result as
select * from loyalty_private.record_currency_rate_snapshot_v1(
  (select id from loyalty.organizations where slug = 'currency-one'),
  'verified-test-feed', 'usd-eur-expired', 'USD', 2, 'EUR', 2,
  85, 100, now() - interval '3 hours', now() - interval '3 hours',
  now() - interval '2 hours', decode(repeat('7', 64), 'hex')
);
select results_eq(
  $$ select outcome from stale_rate_result $$,
  array['created'::text], 'historical provider evidence is retained after its validity window'
);
select throws_ok(
  $$ select * from loyalty_private.record_currency_conversion_evidence_v1((select id from loyalty.organizations where slug = 'currency-one'), '95000000-0000-4000-8000-000000000811', (select id from loyalty.programme_versions where public_id = '95000000-0000-4000-8000-000000000500'), (select policy_version_public_id from currency_policy_result), (select rate_snapshot_public_id from stale_rate_result), null, '[{"amountKey":"line:0:gross","sourceAmountMinor":"100","baseAmountMinor":"85","exactNumerator":"850000","exactDenominator":"10000","roundingDeltaNumerator":"0"}]'::jsonb, decode(repeat('8', 64), 'hex'), decode(repeat('9', 64), 'hex')) $$,
  '23514', 'currency conversion snapshot not valid at occurrence', 'recording cannot bypass occurrence-time snapshot validity'
);
reset role;
select throws_ok(
  $$ update loyalty_private.currency_conversion_policy_versions set state = 'disabled' $$,
  '55000', 'immutable loyalty history cannot be changed', 'policy revisions cannot be rewritten'
);
select throws_ok(
  $$ delete from loyalty_private.currency_rate_snapshots $$,
  '55000', 'immutable loyalty history cannot be changed', 'provider snapshots cannot be deleted'
);
select throws_ok(
  $$ update loyalty_private.currency_conversion_evidence set provider_key = 'changed' $$,
  '55000', 'immutable loyalty history cannot be changed', 'conversion batches cannot be rewritten'
);
select throws_ok(
  $$ delete from loyalty_private.currency_conversion_amounts $$,
  '55000', 'immutable loyalty history cannot be changed', 'atomic amounts cannot be deleted'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_transactions $$,
  array[0::bigint], 'policy rate and conversion evidence create zero ledger effects'
);

set local role loyalty_worker;
select lives_ok(
  $$ select * from loyalty_private.record_currency_rate_snapshot_v1((select id from loyalty.organizations where slug = 'currency-one'), 'verified-test-feed', 'usd-eur-overlap', 'USD', 2, 'EUR', 2, 851, 1000, now() - interval '30 minutes', now() - interval '30 minutes', now() + interval '30 minutes', decode(repeat('2', 64), 'hex')) $$,
  'a second independently valid provider snapshot is retained rather than overwritten'
);
select throws_ok(
  $$ select * from loyalty_private.resolve_currency_conversion_context_v1((select id from loyalty.organizations where slug = 'currency-one'), (select id from loyalty.programme_versions where public_id = '95000000-0000-4000-8000-000000000500'), 'USD', 2, (select occurred_at from loyalty_private.canonical_commerce_events where public_id = '95000000-0000-4000-8000-000000000810'), null) $$,
  '55000', 'ambiguous currency rate snapshots', 'overlapping occurrence-time snapshots fail closed'
);
select throws_ok(
  $$ select * from loyalty_private.record_currency_conversion_evidence_v1((select id from loyalty.organizations where slug = 'currency-one'), '95000000-0000-4000-8000-000000000811', (select id from loyalty.programme_versions where public_id = '95000000-0000-4000-8000-000000000500'), (select policy_version_public_id from currency_policy_result), (select rate_snapshot_public_id from rate_result), null, '[{"amountKey":"line:0:gross","sourceAmountMinor":"100","baseAmountMinor":"85","exactNumerator":"850000","exactDenominator":"10000","roundingDeltaNumerator":"0"}]'::jsonb, decode(repeat('a', 64), 'hex'), decode(repeat('b', 64), 'hex')) $$,
  '55000', 'ambiguous currency rate snapshots', 'recording cannot bypass ambiguous occurrence-time evidence'
);
reset role;

select * from finish();
rollback;
