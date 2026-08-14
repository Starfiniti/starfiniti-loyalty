-- M06 opaque advocate links, versioned referral policy, and first attribution.

alter function loyalty_private.validate_programme_definition_v2(jsonb)
  rename to validate_programme_definition_v2_pre_referrals;

create or replace function loyalty_private.validate_referral_policy_v1(
  target_configuration jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_policy jsonb := target_configuration -> 'referralPolicy';
  target_reward jsonb;
  target_risk jsonb;
begin
  if coalesce(target_configuration ->> 'version', '') <> '2'
    or target_policy is null then
    return;
  end if;
  if jsonb_typeof(target_policy) <> 'object'
    or not (target_policy ?& array[
      'version', 'attributionWindowDays', 'qualificationStatus', 'coolingDays',
      'minimumEligibleSpendMinor', 'requireNewCustomer',
      'monthlyAdvocateReferralLimit', 'advocateReward', 'friendReward', 'risk'
    ])
    or target_policy - array[
      'version', 'attributionWindowDays', 'qualificationStatus', 'coolingDays',
      'minimumEligibleSpendMinor', 'requireNewCustomer',
      'monthlyAdvocateReferralLimit', 'advocateReward', 'friendReward', 'risk'
    ] <> '{}'::jsonb
    or target_policy ->> 'version' <> '1'
    or jsonb_typeof(target_policy -> 'attributionWindowDays') <> 'number'
    or (target_policy ->> 'attributionWindowDays') !~ '^[0-9]{1,3}$'
    or (target_policy ->> 'attributionWindowDays')::integer not between 1 and 90
    or target_policy ->> 'qualificationStatus' not in ('processing', 'completed')
    or jsonb_typeof(target_policy -> 'coolingDays') <> 'number'
    or (target_policy ->> 'coolingDays') !~ '^[0-9]{1,2}$'
    or (target_policy ->> 'coolingDays')::integer not between 0 and 90
    or jsonb_typeof(target_policy -> 'minimumEligibleSpendMinor') <> 'string'
    or (target_policy ->> 'minimumEligibleSpendMinor') !~ '^(0|[1-9][0-9]{0,18})$'
    or (target_policy ->> 'minimumEligibleSpendMinor')::numeric
      > 9223372036854775807
    or target_policy -> 'requireNewCustomer' <> 'true'::jsonb
    or jsonb_typeof(target_policy -> 'monthlyAdvocateReferralLimit') <> 'number'
    or (target_policy ->> 'monthlyAdvocateReferralLimit') !~ '^[0-9]{1,4}$'
    or (target_policy ->> 'monthlyAdvocateReferralLimit')::integer
      not between 1 and 1000 then
    raise exception using errcode = '22023', message = 'invalid ReferralPolicyV1';
  end if;

  foreach target_reward in array array[
    target_policy -> 'advocateReward', target_policy -> 'friendReward'
  ] loop
    if jsonb_typeof(target_reward) <> 'object'
      or not (target_reward ?& array['kind', 'points'])
      or target_reward - array['kind', 'points'] <> '{}'::jsonb
      or target_reward ->> 'kind' <> 'points'
      or jsonb_typeof(target_reward -> 'points') <> 'string'
      or (target_reward ->> 'points') !~ '^[1-9][0-9]{0,18}$'
      or (target_reward ->> 'points')::numeric > 9223372036854775807 then
      raise exception using errcode = '22023', message = 'invalid ReferralPolicyV1 reward';
    end if;
  end loop;

  target_risk := target_policy -> 'risk';
  if jsonb_typeof(target_risk) <> 'object'
    or not (target_risk ?& array[
      'manualReviewEnabled', 'rollingWindowHours',
      'sourceNetworkReferralLimit', 'deviceReferralLimit'
    ])
    or target_risk - array[
      'manualReviewEnabled', 'rollingWindowHours',
      'sourceNetworkReferralLimit', 'deviceReferralLimit'
    ] <> '{}'::jsonb
    or jsonb_typeof(target_risk -> 'manualReviewEnabled') <> 'boolean'
    or jsonb_typeof(target_risk -> 'rollingWindowHours') <> 'number'
    or (target_risk ->> 'rollingWindowHours') !~ '^[0-9]{1,3}$'
    or (target_risk ->> 'rollingWindowHours')::integer not between 1 and 720
    or jsonb_typeof(target_risk -> 'sourceNetworkReferralLimit') <> 'number'
    or (target_risk ->> 'sourceNetworkReferralLimit') !~ '^[0-9]{1,3}$'
    or (target_risk ->> 'sourceNetworkReferralLimit')::integer not between 2 and 100
    or jsonb_typeof(target_risk -> 'deviceReferralLimit') <> 'number'
    or (target_risk ->> 'deviceReferralLimit') !~ '^[0-9]{1,3}$'
    or (target_risk ->> 'deviceReferralLimit')::integer not between 2 and 100 then
    raise exception using errcode = '22023', message = 'invalid ReferralPolicyV1 risk policy';
  end if;
end;
$$;

create or replace function loyalty_private.validate_programme_definition_v2(
  target_configuration jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform loyalty_private.validate_programme_definition_v2_pre_referrals(
    target_configuration - 'referralPolicy'
  );
  perform loyalty_private.validate_referral_policy_v1(target_configuration);
end;
$$;

create table loyalty.programme_referral_policies (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  programme_group_id bigint not null,
  programme_version_id bigint not null,
  attribution_window_days smallint not null check (attribution_window_days between 1 and 90),
  qualification_status text not null check (qualification_status in ('processing', 'completed')),
  cooling_days smallint not null check (cooling_days between 0 and 90),
  minimum_eligible_spend_minor bigint not null check (minimum_eligible_spend_minor >= 0),
  require_new_customer boolean not null check (require_new_customer),
  monthly_advocate_referral_limit smallint not null
    check (monthly_advocate_referral_limit between 1 and 1000),
  advocate_reward_points bigint not null check (advocate_reward_points > 0),
  friend_reward_points bigint not null check (friend_reward_points > 0),
  manual_review_enabled boolean not null,
  risk_window_hours smallint not null check (risk_window_hours between 1 and 720),
  source_network_referral_limit smallint not null
    check (source_network_referral_limit between 2 and 100),
  device_referral_limit smallint not null check (device_referral_limit between 2 and 100),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, programme_group_id, programme_version_id),
  foreign key (organization_id, programme_group_id, programme_version_id)
    references loyalty.programme_versions(
      organization_id, programme_group_id, id
    ) on delete restrict
);

create table loyalty.referral_advocates (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  programme_group_id bigint not null,
  customer_id bigint not null,
  source_connection_id bigint not null,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  disabled_at timestamptz,
  unique (organization_id, id),
  unique (organization_id, programme_group_id, customer_id),
  foreign key (organization_id, programme_group_id)
    references loyalty.programme_groups(organization_id, id) on delete restrict,
  foreign key (organization_id, customer_id)
    references loyalty.customers(organization_id, id) on delete restrict,
  foreign key (organization_id, source_connection_id)
    references loyalty.commerce_connections(organization_id, id) on delete restrict,
  check ((status = 'disabled') = (disabled_at is not null))
);

create table loyalty_private.referral_link_requests (
  id bigint generated always as identity primary key,
  organization_id bigint not null,
  request_id uuid not null,
  account_link_id bigint not null,
  advocate_id bigint not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  request_sha256 bytea not null check (octet_length(request_sha256) = 32),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, request_id),
  foreign key (organization_id, account_link_id)
    references loyalty.customer_user_links(organization_id, id) on delete restrict,
  foreign key (organization_id, advocate_id)
    references loyalty.referral_advocates(organization_id, id) on delete restrict
);

create table loyalty.referral_attributions (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  programme_group_id bigint not null,
  programme_version_id bigint not null,
  advocate_id bigint not null,
  friend_customer_id bigint not null,
  source_connection_id bigint not null,
  source_event_id bigint not null,
  source_order_id text not null,
  captured_at timestamptz not null,
  attribution_expires_at timestamptz not null,
  risk_codes text[] not null default array[]::text[],
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, programme_group_id, friend_customer_id),
  unique (organization_id, source_event_id),
  foreign key (organization_id, programme_group_id, programme_version_id)
    references loyalty.programme_referral_policies(
      organization_id, programme_group_id, programme_version_id
    ) on delete restrict,
  foreign key (organization_id, advocate_id)
    references loyalty.referral_advocates(organization_id, id) on delete restrict,
  foreign key (organization_id, friend_customer_id)
    references loyalty.customers(organization_id, id) on delete restrict,
  foreign key (organization_id, source_connection_id)
    references loyalty.commerce_connections(organization_id, id) on delete restrict,
  foreign key (organization_id, source_event_id)
    references loyalty_private.canonical_commerce_events(organization_id, id) on delete restrict,
  check (length(source_order_id) between 1 and 255),
  check (attribution_expires_at >= captured_at),
  check (cardinality(risk_codes) <= 6),
  check (risk_codes <@ array[
    'self_referral', 'advocate_monthly_limit', 'source_network_velocity',
    'device_velocity', 'reused_payment_evidence', 'reused_shipping_evidence'
  ]::text[])
);

create table loyalty.referral_attribution_transitions (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  attribution_id bigint not null,
  from_state text,
  to_state text not null check (to_state in (
    'captured', 'pending_review', 'blocked', 'cooling', 'qualified',
    'rejected', 'reversed'
  )),
  reason_code text not null,
  actor_kind text not null check (actor_kind in ('system', 'merchant')),
  actor_user_id uuid references auth.users(id) on delete restrict,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, attribution_id, idempotency_key),
  foreign key (organization_id, attribution_id)
    references loyalty.referral_attributions(organization_id, id) on delete restrict,
  check (length(reason_code) between 1 and 100),
  check (length(idempotency_key) between 1 and 255),
  check ((actor_kind = 'merchant') = (actor_user_id is not null))
);

create table loyalty_private.referral_risk_evidence (
  id bigint generated always as identity primary key,
  organization_id bigint not null,
  attribution_id bigint not null,
  source_network_fingerprint bytea,
  device_fingerprint bytea,
  payment_fingerprint bytea,
  shipping_fingerprint bytea,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, attribution_id),
  foreign key (organization_id, attribution_id)
    references loyalty.referral_attributions(organization_id, id) on delete cascade,
  check (source_network_fingerprint is null or octet_length(source_network_fingerprint) = 32),
  check (device_fingerprint is null or octet_length(device_fingerprint) = 32),
  check (payment_fingerprint is null or octet_length(payment_fingerprint) = 32),
  check (shipping_fingerprint is null or octet_length(shipping_fingerprint) = 32),
  check (expires_at > created_at)
);

create index referral_attributions_advocate_created_idx
  on loyalty.referral_attributions (organization_id, advocate_id, created_at desc, id desc);
create index referral_attributions_friend_idx
  on loyalty.referral_attributions (organization_id, friend_customer_id, id);
create index referral_risk_network_idx
  on loyalty_private.referral_risk_evidence (
    organization_id, source_network_fingerprint, created_at desc
  ) where source_network_fingerprint is not null;
create index referral_risk_device_idx
  on loyalty_private.referral_risk_evidence (
    organization_id, device_fingerprint, created_at desc
  ) where device_fingerprint is not null;
create index referral_risk_expiry_idx
  on loyalty_private.referral_risk_evidence (expires_at, id);

create trigger programme_referral_policies_immutable
before update or delete on loyalty.programme_referral_policies
for each row execute function loyalty_private.reject_immutable_change();
create trigger referral_link_requests_immutable
before update or delete on loyalty_private.referral_link_requests
for each row execute function loyalty_private.reject_immutable_change();
create trigger referral_attributions_immutable
before update or delete on loyalty.referral_attributions
for each row execute function loyalty_private.reject_immutable_change();
create trigger referral_attribution_transitions_immutable
before update or delete on loyalty.referral_attribution_transitions
for each row execute function loyalty_private.reject_immutable_change();

create or replace function loyalty_private.enforce_referral_policy_contract()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  entitlement_enabled boolean;
begin
  if coalesce(new.configuration ->> 'version', '') <> '2'
    or not (new.configuration ? 'referralPolicy') then
    return new;
  end if;
  perform loyalty_private.validate_referral_policy_v1(new.configuration);
  select decision.enabled into strict entitlement_enabled
  from loyalty_private.resolve_organization_entitlement(
    new.organization_id,
    'referrals',
    'programme:' || new.programme_id::text,
    now()
  ) as decision;
  if not entitlement_enabled then
    raise exception using errcode = '42501',
      message = 'referrals are not enabled for this organization';
  end if;
  return new;
end;
$$;

create or replace function loyalty_private.materialize_referral_policy_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_policy jsonb := new.configuration -> 'referralPolicy';
begin
  if new.status not in ('published', 'scheduled')
    or old.status = new.status
    or target_policy is null then
    return new;
  end if;
  perform loyalty_private.validate_referral_policy_v1(new.configuration);
  insert into loyalty.programme_referral_policies (
    organization_id, programme_group_id, programme_version_id,
    attribution_window_days, qualification_status, cooling_days,
    minimum_eligible_spend_minor, require_new_customer,
    monthly_advocate_referral_limit, advocate_reward_points,
    friend_reward_points, manual_review_enabled, risk_window_hours,
    source_network_referral_limit, device_referral_limit
  ) values (
    new.organization_id, new.programme_group_id, new.id,
    (target_policy ->> 'attributionWindowDays')::smallint,
    target_policy ->> 'qualificationStatus',
    (target_policy ->> 'coolingDays')::smallint,
    (target_policy ->> 'minimumEligibleSpendMinor')::bigint,
    true,
    (target_policy ->> 'monthlyAdvocateReferralLimit')::smallint,
    (target_policy -> 'advocateReward' ->> 'points')::bigint,
    (target_policy -> 'friendReward' ->> 'points')::bigint,
    (target_policy -> 'risk' ->> 'manualReviewEnabled')::boolean,
    (target_policy -> 'risk' ->> 'rollingWindowHours')::smallint,
    (target_policy -> 'risk' ->> 'sourceNetworkReferralLimit')::smallint,
    (target_policy -> 'risk' ->> 'deviceReferralLimit')::smallint
  );
  return new;
end;
$$;

create trigger programme_versions_referral_policy_contract
before insert or update of status on loyalty.programme_versions
for each row execute function loyalty_private.enforce_referral_policy_contract();
create trigger programme_versions_materialize_referral_policy
after update of status on loyalty.programme_versions
for each row execute function loyalty_private.materialize_referral_policy_v1();

create or replace function loyalty.create_my_referral_link(
  target_account_public_id uuid,
  target_request_id uuid
)
returns table (
  advocate_code uuid,
  share_url text,
  outcome text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := loyalty_private.request_user_id();
  customer_scope record;
  request_hash bytea;
  existing_request loyalty_private.referral_link_requests%rowtype;
  existing_advocate loyalty.referral_advocates%rowtype;
  created_advocate boolean := false;
  entitlement_enabled boolean;
begin
  if actor_user_id is null or target_account_public_id is null
    or target_request_id is null then
    raise exception using errcode = '42501', message = 'referral link not authorized';
  end if;

  select link.organization_id, link.id as account_link_id, link.customer_id,
    connection.id as connection_id, connection.external_store_id,
    programme.id as programme_id, programme_group.id as programme_group_id,
    policy.programme_version_id
  into customer_scope
  from loyalty.customer_user_links as link
  join loyalty.customers as customer
    on customer.organization_id = link.organization_id
   and customer.id = link.customer_id and customer.status = 'active'
  join loyalty.commerce_connections as connection
    on connection.organization_id = link.organization_id
   and connection.id = link.source_connection_id
   and connection.status in ('active', 'rotating')
  join loyalty.programmes as programme
    on programme.organization_id = connection.organization_id
   and programme.id = connection.programme_id and programme.status = 'active'
  join loyalty.programme_groups as programme_group
    on programme_group.organization_id = programme.organization_id
   and programme_group.id = programme.programme_group_id
   and programme_group.status = 'active'
  join loyalty.programme_versions as version
    on version.organization_id = programme.organization_id
   and version.programme_id = programme.id and version.status = 'published'
  join loyalty.programme_referral_policies as policy
    on policy.organization_id = version.organization_id
   and policy.programme_group_id = version.programme_group_id
   and policy.programme_version_id = version.id
  where link.public_id = target_account_public_id
    and link.auth_user_id = actor_user_id and link.revoked_at is null;
  if not found then
    raise exception using errcode = '42501', message = 'referral link not authorized';
  end if;

  select decision.enabled into strict entitlement_enabled
  from loyalty_private.resolve_organization_entitlement(
    customer_scope.organization_id, 'referrals',
    'programme:' || customer_scope.programme_id::text, now()
  ) as decision;
  if not entitlement_enabled then
    raise exception using errcode = '42501', message = 'referrals are not enabled';
  end if;

  request_hash := extensions.digest(pg_catalog.convert_to(
    'customer.referral-link.create.v1|' || actor_user_id::text || '|' ||
    target_account_public_id::text, 'UTF8'
  ), 'sha256');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'referral-link:' || customer_scope.programme_group_id::text || ':' ||
    customer_scope.customer_id::text, customer_scope.organization_id
  ));

  select request.* into existing_request
  from loyalty_private.referral_link_requests as request
  where request.organization_id = customer_scope.organization_id
    and request.request_id = target_request_id;
  if found then
    if existing_request.account_link_id <> customer_scope.account_link_id
      or existing_request.actor_user_id <> actor_user_id
      or existing_request.request_sha256 <> request_hash then
      raise exception using errcode = '23514', message = 'referral link request conflict';
    end if;
    select advocate.* into strict existing_advocate
    from loyalty.referral_advocates as advocate
    where advocate.organization_id = existing_request.organization_id
      and advocate.id = existing_request.advocate_id;
    return query select existing_advocate.public_id,
      customer_scope.external_store_id || '/?stf_ref=' || existing_advocate.public_id::text,
      'duplicate'::text;
    return;
  end if;

  select advocate.* into existing_advocate
  from loyalty.referral_advocates as advocate
  where advocate.organization_id = customer_scope.organization_id
    and advocate.programme_group_id = customer_scope.programme_group_id
    and advocate.customer_id = customer_scope.customer_id;
  if not found then
    insert into loyalty.referral_advocates (
      organization_id, programme_group_id, customer_id, source_connection_id
    ) values (
      customer_scope.organization_id, customer_scope.programme_group_id,
      customer_scope.customer_id, customer_scope.connection_id
    ) returning * into existing_advocate;
    created_advocate := true;
  elsif existing_advocate.status <> 'active' then
    raise exception using errcode = '42501', message = 'referral advocate is disabled';
  end if;

  insert into loyalty_private.referral_link_requests (
    organization_id, request_id, account_link_id, advocate_id,
    actor_user_id, request_sha256
  ) values (
    customer_scope.organization_id, target_request_id,
    customer_scope.account_link_id, existing_advocate.id,
    actor_user_id, request_hash
  );
  return query select existing_advocate.public_id,
    customer_scope.external_store_id || '/?stf_ref=' || existing_advocate.public_id::text,
    case when created_advocate then 'created' else 'duplicate' end;
end;
$$;

create or replace function loyalty_private.record_referral_attribution_v1(
  target_event_public_id uuid
)
returns table (
  attribution_id uuid,
  state text,
  outcome text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_event loyalty_private.canonical_commerce_events%rowtype;
  target_connection loyalty.commerce_connections%rowtype;
  target_programme loyalty.programmes%rowtype;
  target_policy loyalty.programme_referral_policies%rowtype;
  referral jsonb;
  order_fact jsonb;
  target_advocate loyalty.referral_advocates%rowtype;
  target_friend_customer_id bigint;
  existing_attribution loyalty.referral_attributions%rowtype;
  created_attribution loyalty.referral_attributions%rowtype;
  captured_at timestamptz;
  source_network bytea;
  device bytea;
  payment bytea;
  shipping bytea;
  risk_codes text[] := array[]::text[];
  initial_state text := 'captured';
  network_count integer := 0;
  device_count integer := 0;
  advocate_monthly_count integer := 0;
  entitlement_enabled boolean;
begin
  select event.* into strict target_event
  from loyalty_private.canonical_commerce_events as event
  where event.public_id = target_event_public_id
    and event.event_type = 'commerce.order.status_changed';
  order_fact := target_event.payload -> 'order';
  referral := order_fact -> 'referral';
  if referral is null then
    return query select null::uuid, 'ignored'::text, 'no_referral'::text;
    return;
  end if;
  if jsonb_typeof(referral) <> 'object'
    or not (referral ?& array[
      'version', 'advocateCode', 'capturedAt', 'sourceNetworkFingerprint',
      'deviceFingerprint', 'paymentFingerprint', 'shippingFingerprint'
    ])
    or referral - array[
      'version', 'advocateCode', 'capturedAt', 'sourceNetworkFingerprint',
      'deviceFingerprint', 'paymentFingerprint', 'shippingFingerprint'
    ] <> '{}'::jsonb
    or referral ->> 'version' <> '1'
    or (referral ->> 'advocateCode') !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or jsonb_typeof(referral -> 'capturedAt') <> 'string' then
    raise exception using errcode = '22023', message = 'invalid referral attribution evidence';
  end if;
  begin
    captured_at := (referral ->> 'capturedAt')::timestamptz;
  exception when others then
    raise exception using errcode = '22023', message = 'invalid referral attribution timestamp';
  end;

  select connection.* into strict target_connection
  from loyalty.commerce_connections as connection
  where connection.organization_id = target_event.organization_id
    and connection.id = target_event.connection_id
    and connection.status in ('active', 'rotating');
  select programme.* into strict target_programme
  from loyalty.programmes as programme
  where programme.organization_id = target_connection.organization_id
    and programme.id = target_connection.programme_id
    and programme.status = 'active';
  select policy.* into target_policy
  from loyalty.programme_versions as version
  join loyalty.programme_referral_policies as policy
    on policy.organization_id = version.organization_id
   and policy.programme_group_id = version.programme_group_id
   and policy.programme_version_id = version.id
  where version.organization_id = target_programme.organization_id
    and version.programme_id = target_programme.id
    and version.status = 'published';
  if not found then
    return query select null::uuid, 'ignored'::text, 'policy_unavailable'::text;
    return;
  end if;
  select decision.enabled into strict entitlement_enabled
  from loyalty_private.resolve_organization_entitlement(
    target_event.organization_id, 'referrals',
    'programme:' || target_programme.id::text, target_event.occurred_at
  ) as decision;
  if not entitlement_enabled then
    return query select null::uuid, 'ignored'::text, 'feature_disabled'::text;
    return;
  end if;
  if target_event.occurred_at < captured_at
    or target_event.occurred_at
      > captured_at + make_interval(days => target_policy.attribution_window_days) then
    return query select null::uuid, 'ignored'::text, 'outside_window'::text;
    return;
  end if;

  select advocate.* into target_advocate
  from loyalty.referral_advocates as advocate
  where advocate.public_id = (referral ->> 'advocateCode')::uuid
    and advocate.organization_id = target_event.organization_id
    and advocate.programme_group_id = target_policy.programme_group_id
    and advocate.status = 'active';
  if not found then
    return query select null::uuid, 'ignored'::text, 'unknown_advocate'::text;
    return;
  end if;

  if order_fact -> 'customer' ->> 'kind' = 'registered' then
    select identity.customer_id into strict target_friend_customer_id
    from loyalty.customer_identities as identity
    where identity.organization_id = target_event.organization_id
      and identity.commerce_connection_id = target_event.connection_id
      and identity.identity_kind = 'registered'
      and identity.external_customer_id =
        order_fact -> 'customer' ->> 'externalCustomerId';
  elsif order_fact -> 'customer' ->> 'kind' = 'guest' then
    select identity.customer_id into strict target_friend_customer_id
    from loyalty.customer_identities as identity
    where identity.organization_id = target_event.organization_id
      and identity.commerce_connection_id = target_event.connection_id
      and identity.identity_kind = 'guest'
      and identity.external_customer_id = order_fact -> 'customer' ->> 'guestOrderId';
  else
    raise exception using errcode = '22023', message = 'invalid referral customer selector';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'referral-attribution:' || target_policy.programme_group_id::text || ':' ||
    target_friend_customer_id::text, target_event.organization_id
  ));
  select attribution.* into existing_attribution
  from loyalty.referral_attributions as attribution
  where attribution.organization_id = target_event.organization_id
    and attribution.programme_group_id = target_policy.programme_group_id
    and attribution.friend_customer_id = target_friend_customer_id;
  if found then
    return query select existing_attribution.public_id, 'existing'::text,
      case when existing_attribution.advocate_id = target_advocate.id
        then 'duplicate' else 'existing_attribution' end;
    return;
  end if;

  if referral ->> 'sourceNetworkFingerprint' is not null then
    if (referral ->> 'sourceNetworkFingerprint') !~ '^[a-f0-9]{64}$' then
      raise exception using errcode = '22023', message = 'invalid referral risk fingerprint';
    end if;
    source_network := decode(referral ->> 'sourceNetworkFingerprint', 'hex');
  end if;
  if referral ->> 'deviceFingerprint' is not null then
    if (referral ->> 'deviceFingerprint') !~ '^[a-f0-9]{64}$' then
      raise exception using errcode = '22023', message = 'invalid referral risk fingerprint';
    end if;
    device := decode(referral ->> 'deviceFingerprint', 'hex');
  end if;
  if referral ->> 'paymentFingerprint' is not null then
    if (referral ->> 'paymentFingerprint') !~ '^[a-f0-9]{64}$' then
      raise exception using errcode = '22023', message = 'invalid referral risk fingerprint';
    end if;
    payment := decode(referral ->> 'paymentFingerprint', 'hex');
  end if;
  if referral ->> 'shippingFingerprint' is not null then
    if (referral ->> 'shippingFingerprint') !~ '^[a-f0-9]{64}$' then
      raise exception using errcode = '22023', message = 'invalid referral risk fingerprint';
    end if;
    shipping := decode(referral ->> 'shippingFingerprint', 'hex');
  end if;

  if target_advocate.customer_id = target_friend_customer_id then
    risk_codes := array_append(risk_codes, 'self_referral');
    initial_state := 'blocked';
  else
    select count(*) into advocate_monthly_count
    from loyalty.referral_attributions as attribution
    where attribution.organization_id = target_event.organization_id
      and attribution.advocate_id = target_advocate.id
      and attribution.created_at >= (
        date_trunc('month', target_event.occurred_at at time zone 'UTC')
        at time zone 'UTC'
      );
    if advocate_monthly_count >= target_policy.monthly_advocate_referral_limit then
      risk_codes := array_append(risk_codes, 'advocate_monthly_limit');
    end if;
    if source_network is not null then
      select count(*) into network_count
      from loyalty_private.referral_risk_evidence as evidence
      where evidence.organization_id = target_event.organization_id
        and evidence.source_network_fingerprint = source_network
        and evidence.created_at >= target_event.occurred_at
          - make_interval(hours => target_policy.risk_window_hours);
      if network_count >= target_policy.source_network_referral_limit then
        risk_codes := array_append(risk_codes, 'source_network_velocity');
      end if;
    end if;
    if device is not null then
      select count(*) into device_count
      from loyalty_private.referral_risk_evidence as evidence
      where evidence.organization_id = target_event.organization_id
        and evidence.device_fingerprint = device
        and evidence.created_at >= target_event.occurred_at
          - make_interval(hours => target_policy.risk_window_hours);
      if device_count >= target_policy.device_referral_limit then
        risk_codes := array_append(risk_codes, 'device_velocity');
      end if;
    end if;
    if payment is not null and exists (
      select 1 from loyalty_private.referral_risk_evidence as evidence
      where evidence.organization_id = target_event.organization_id
        and evidence.payment_fingerprint = payment
        and evidence.created_at >= target_event.occurred_at
          - make_interval(hours => target_policy.risk_window_hours)
    ) then
      risk_codes := array_append(risk_codes, 'reused_payment_evidence');
    end if;
    if shipping is not null and exists (
      select 1 from loyalty_private.referral_risk_evidence as evidence
      where evidence.organization_id = target_event.organization_id
        and evidence.shipping_fingerprint = shipping
        and evidence.created_at >= target_event.occurred_at
          - make_interval(hours => target_policy.risk_window_hours)
    ) then
      risk_codes := array_append(risk_codes, 'reused_shipping_evidence');
    end if;
    if cardinality(risk_codes) > 0 and target_policy.manual_review_enabled then
      initial_state := 'pending_review';
    end if;
  end if;

  insert into loyalty.referral_attributions (
    organization_id, programme_group_id, programme_version_id,
    advocate_id, friend_customer_id, source_connection_id, source_event_id,
    source_order_id, captured_at, attribution_expires_at, risk_codes
  ) values (
    target_event.organization_id, target_policy.programme_group_id,
    target_policy.programme_version_id, target_advocate.id,
    target_friend_customer_id,
    target_event.connection_id, target_event.id, target_event.source_object_id,
    captured_at,
    captured_at + make_interval(days => target_policy.attribution_window_days),
    risk_codes
  ) returning * into created_attribution;
  insert into loyalty.referral_attribution_transitions (
    organization_id, attribution_id, from_state, to_state, reason_code,
    actor_kind, actor_user_id, idempotency_key
  ) values (
    target_event.organization_id, created_attribution.id, null, initial_state,
    case when initial_state = 'captured' then 'first_eligible_attribution'
      when initial_state = 'blocked' then 'self_referral'
      else 'risk_review_required' end,
    'system', null, 'event:' || target_event.public_id::text
  );
  if target_event.occurred_at
      + make_interval(hours => target_policy.risk_window_hours) > now() then
    insert into loyalty_private.referral_risk_evidence (
      organization_id, attribution_id, source_network_fingerprint,
      device_fingerprint, payment_fingerprint, shipping_fingerprint, expires_at
    ) values (
      target_event.organization_id, created_attribution.id, source_network,
      device, payment, shipping,
      target_event.occurred_at + make_interval(hours => target_policy.risk_window_hours)
    );
  end if;
  return query select created_attribution.public_id, initial_state, 'created'::text;
end;
$$;

create or replace function loyalty_private.purge_expired_referral_risk_evidence(
  target_limit integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  if target_limit is null or target_limit not between 1 and 500 then
    raise exception using errcode = '22023', message = 'invalid referral risk purge limit';
  end if;
  with expired as (
    select evidence.id
    from loyalty_private.referral_risk_evidence as evidence
    where evidence.expires_at <= now()
    order by evidence.expires_at, evidence.id
    for update skip locked
    limit target_limit
  )
  delete from loyalty_private.referral_risk_evidence as evidence
  using expired where evidence.id = expired.id;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

alter table loyalty.programme_referral_policies owner to loyalty_owner;
alter table loyalty.referral_advocates owner to loyalty_owner;
alter table loyalty_private.referral_link_requests owner to loyalty_owner;
alter table loyalty.referral_attributions owner to loyalty_owner;
alter table loyalty.referral_attribution_transitions owner to loyalty_owner;
alter table loyalty_private.referral_risk_evidence owner to loyalty_owner;

alter function loyalty_private.validate_programme_definition_v2_pre_referrals(jsonb)
  owner to loyalty_owner;
alter function loyalty_private.validate_referral_policy_v1(jsonb)
  owner to loyalty_owner;
alter function loyalty_private.validate_programme_definition_v2(jsonb)
  owner to loyalty_owner;
alter function loyalty_private.enforce_referral_policy_contract()
  owner to loyalty_owner;
alter function loyalty_private.materialize_referral_policy_v1()
  owner to loyalty_owner;
alter function loyalty.create_my_referral_link(uuid, uuid)
  owner to loyalty_owner;
alter function loyalty_private.record_referral_attribution_v1(uuid)
  owner to loyalty_owner;
alter function loyalty_private.purge_expired_referral_risk_evidence(integer)
  owner to loyalty_owner;

alter table loyalty.programme_referral_policies enable row level security;
alter table loyalty.referral_advocates enable row level security;
alter table loyalty.referral_attributions enable row level security;
alter table loyalty.referral_attribution_transitions enable row level security;
create policy programme_referral_policies_member_select
  on loyalty.programme_referral_policies for select to authenticated
  using ((select loyalty_private.is_organization_member(organization_id)));

revoke all on loyalty.programme_referral_policies,
  loyalty.referral_advocates, loyalty.referral_attributions,
  loyalty.referral_attribution_transitions from public, anon,
  authenticated, loyalty_runtime, loyalty_worker;
grant select on loyalty.programme_referral_policies to authenticated, loyalty_worker;

revoke all on function
  loyalty_private.validate_programme_definition_v2_pre_referrals(jsonb),
  loyalty_private.validate_referral_policy_v1(jsonb),
  loyalty_private.validate_programme_definition_v2(jsonb),
  loyalty_private.enforce_referral_policy_contract(),
  loyalty_private.materialize_referral_policy_v1(),
  loyalty.create_my_referral_link(uuid, uuid),
  loyalty_private.record_referral_attribution_v1(uuid),
  loyalty_private.purge_expired_referral_risk_evidence(integer)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty.create_my_referral_link(uuid, uuid)
  to authenticated;
grant execute on function loyalty_private.record_referral_attribution_v1(uuid),
  loyalty_private.purge_expired_referral_risk_evidence(integer)
  to loyalty_worker;

comment on table loyalty.programme_referral_policies is
  'Immutable per-version first-purchase attribution, cooling, reward, and minimized risk policy.';
comment on table loyalty.referral_advocates is
  'One opaque non-identity-bearing referral code per customer and programme group.';
comment on table loyalty.referral_attributions is
  'Immutable first-attribution facts; later qualification, review, and reversal append transitions.';
comment on table loyalty_private.referral_risk_evidence is
  'Short-lived connection-keyed fingerprints used only for referral abuse review and bounded deletion.';
comment on function loyalty.create_my_referral_link(uuid, uuid) is
  'Creates or returns one opaque referral link using only the active Auth-derived customer account.';
comment on function loyalty_private.record_referral_attribution_v1(uuid) is
  'Derives a first referral attribution from one signed canonical WooCommerce order event without accepting tenant, customer, or advocate authority from the worker.';
