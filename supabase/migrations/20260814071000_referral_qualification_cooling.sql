-- M06 deterministic referral qualification and return-cooling state.

alter table loyalty_private.programme_evaluations
  drop constraint programme_evaluations_evaluation_kind_check,
  add constraint programme_evaluations_evaluation_kind_check
    check (evaluation_kind in (
      'live_award', 'live_refund', 'referral_qualification',
      'simulation', 'tier_review'
    ));

create unique index referral_attributions_source_order_idx
  on loyalty.referral_attributions (
    organization_id, source_connection_id, source_order_id
  );

create table loyalty_private.referral_qualification_facts (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  attribution_id bigint not null,
  canonical_event_id bigint not null,
  evaluation_id bigint not null,
  order_status text not null check (order_status in ('processing', 'completed')),
  eligible_spend_minor bigint not null check (eligible_spend_minor >= 0),
  is_new_customer boolean not null,
  decision text not null check (decision in (
    'eligible', 'ineligible_minimum_spend',
    'ineligible_existing_customer', 'review_held'
  )),
  qualified_at timestamptz not null,
  cooling_ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, attribution_id),
  unique (organization_id, canonical_event_id),
  unique (organization_id, evaluation_id),
  foreign key (organization_id, attribution_id)
    references loyalty.referral_attributions(organization_id, id) on delete restrict,
  foreign key (organization_id, canonical_event_id)
    references loyalty_private.canonical_commerce_events(organization_id, id) on delete restrict,
  foreign key (organization_id, evaluation_id)
    references loyalty_private.programme_evaluations(organization_id, id) on delete restrict,
  check (cooling_ends_at >= qualified_at)
);

create index referral_qualification_cooling_idx
  on loyalty_private.referral_qualification_facts (
    cooling_ends_at, organization_id, attribution_id
  ) where decision = 'eligible';

create trigger referral_qualification_facts_immutable
before update or delete on loyalty_private.referral_qualification_facts
for each row execute function loyalty_private.reject_immutable_change();

create or replace function loyalty_private.get_referral_qualification_context_v1(
  target_event_public_id uuid
)
returns table (
  attribution_id uuid,
  programme_version_id bigint,
  current_state text,
  qualification_status text,
  outcome text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_event loyalty_private.canonical_commerce_events%rowtype;
  target_attribution loyalty.referral_attributions%rowtype;
  target_policy loyalty.programme_referral_policies%rowtype;
  target_state text;
  target_identity_key text;
begin
  select event.* into strict target_event
  from loyalty_private.canonical_commerce_events as event
  where event.public_id = target_event_public_id
    and event.event_type = 'commerce.order.status_changed';

  target_identity_key := case
    when target_event.payload -> 'order' -> 'customer' ->> 'kind' = 'registered'
      then 'registered:' || coalesce(
        target_event.payload -> 'order' -> 'customer' ->> 'externalCustomerId', ''
      )
    when target_event.payload -> 'order' -> 'customer' ->> 'kind' = 'guest'
      then 'guest-order:' || coalesce(
        target_event.payload -> 'order' -> 'customer' ->> 'guestOrderId', ''
      )
    else null
  end;
  if target_identity_key is null then
    raise exception using errcode = '22023',
      message = 'invalid referral qualification customer selector';
  end if;

  select attribution.* into target_attribution
  from loyalty.referral_attributions as attribution
  join loyalty.customer_identities as identity
    on identity.organization_id = attribution.organization_id
   and identity.customer_id = attribution.friend_customer_id
   and identity.commerce_connection_id = target_event.connection_id
   and identity.external_customer_id = target_identity_key
  where attribution.organization_id = target_event.organization_id
    and attribution.source_connection_id = target_event.connection_id
    and attribution.source_order_id = target_event.source_object_id;
  if not found then
    return query select null::uuid, null::bigint, null::text, null::text,
      'no_attribution'::text;
    return;
  end if;

  select policy.* into strict target_policy
  from loyalty.programme_referral_policies as policy
  where policy.organization_id = target_attribution.organization_id
    and policy.programme_group_id = target_attribution.programme_group_id
    and policy.programme_version_id = target_attribution.programme_version_id;
  select transition.to_state into strict target_state
  from loyalty.referral_attribution_transitions as transition
  where transition.organization_id = target_attribution.organization_id
    and transition.attribution_id = target_attribution.id
  order by transition.id desc
  limit 1;

  if target_event.payload -> 'order' ->> 'status'
      <> target_policy.qualification_status then
    return query select target_attribution.public_id,
      target_attribution.programme_version_id, target_state,
      target_policy.qualification_status, 'status_pending'::text;
    return;
  end if;
  if target_state not in ('captured', 'pending_review') then
    return query select target_attribution.public_id,
      target_attribution.programme_version_id, target_state,
      target_policy.qualification_status, 'state_final'::text;
    return;
  end if;
  return query select target_attribution.public_id,
    target_attribution.programme_version_id, target_state,
    target_policy.qualification_status, 'ready'::text;
end;
$$;

create or replace function loyalty_private.record_referral_qualification_v1(
  target_event_public_id uuid,
  target_input_sha256 bytea,
  target_result_sha256 bytea,
  target_result jsonb,
  target_explanation jsonb,
  target_evaluated_at timestamptz
)
returns table (
  attribution_id uuid,
  evaluation_id uuid,
  state text,
  outcome text,
  cooling_ends_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_context record;
  target_event loyalty_private.canonical_commerce_events%rowtype;
  target_attribution loyalty.referral_attributions%rowtype;
  target_policy loyalty.programme_referral_policies%rowtype;
  target_evaluation_public_id uuid;
  target_evaluation loyalty_private.programme_evaluations%rowtype;
  existing_fact loyalty_private.referral_qualification_facts%rowtype;
  target_eligible_spend bigint;
  target_is_new boolean;
  target_decision text;
  target_state text;
  target_current_state text;
  target_cooling_ends_at timestamptz;
  target_evaluation_key text;
  target_subject_reference text;
begin
  select * into strict target_context
  from loyalty_private.get_referral_qualification_context_v1(
    target_event_public_id
  );
  if target_context.outcome <> 'ready' then
    return query select target_context.attribution_id,
      null::uuid, target_context.current_state,
      target_context.outcome, null::timestamptz;
    return;
  end if;

  select event.* into strict target_event
  from loyalty_private.canonical_commerce_events as event
  where event.public_id = target_event_public_id;
  select attribution.* into strict target_attribution
  from loyalty.referral_attributions as attribution
  where attribution.public_id = target_context.attribution_id
    and attribution.organization_id = target_event.organization_id;
  select policy.* into strict target_policy
  from loyalty.programme_referral_policies as policy
  where policy.organization_id = target_attribution.organization_id
    and policy.programme_group_id = target_attribution.programme_group_id
    and policy.programme_version_id = target_attribution.programme_version_id;

  if octet_length(target_input_sha256) <> 32
    or octet_length(target_result_sha256) <> 32
    or jsonb_typeof(target_result) <> 'object'
    or not (target_result ?& array[
      'version', 'eventId', 'source', 'eligibleSpendMinor', 'awardedPoints',
      'tierCodeSnapshot', 'pendingAt', 'availableAt', 'expiresAt',
      'selectedMultiplierRuleCode', 'contributions', 'lines'
    ])
    or target_result - array[
      'version', 'eventId', 'source', 'eligibleSpendMinor', 'awardedPoints',
      'tierCodeSnapshot', 'pendingAt', 'availableAt', 'expiresAt',
      'selectedMultiplierRuleCode', 'contributions', 'lines'
    ] <> '{}'::jsonb
    or target_result ->> 'version' <> '2'
    or target_result ->> 'source' <> 'purchase'
    or target_result ->> 'eventId' <> (
      'woocommerce:' || target_event.connection_id::text || ':' ||
      target_event.source_event_id
    )
    or coalesce(target_result ->> 'eligibleSpendMinor', '')
      !~ '^(0|[1-9][0-9]{0,18})$'
    or (
      length(target_result ->> 'eligibleSpendMinor') = 19
      and target_result ->> 'eligibleSpendMinor' > '9223372036854775807'
    )
    or coalesce(target_result ->> 'awardedPoints', '')
      !~ '^(0|[1-9][0-9]{0,18})$'
    or (
      length(target_result ->> 'awardedPoints') = 19
      and target_result ->> 'awardedPoints' > '9223372036854775807'
    )
    or jsonb_typeof(target_result -> 'contributions') <> 'array'
    or jsonb_typeof(target_result -> 'lines') <> 'array'
    or jsonb_typeof(target_explanation) <> 'object'
    or target_evaluated_at is null then
    raise exception using errcode = '22023',
      message = 'invalid referral qualification evidence';
  end if;
  if jsonb_array_length(target_result -> 'contributions') > 200
    or jsonb_array_length(target_result -> 'lines') > 1000 then
    raise exception using errcode = '22023',
      message = 'invalid referral qualification evidence';
  end if;
  begin
    if (target_result ->> 'pendingAt')::timestamptz <> target_event.occurred_at then
      raise exception using errcode = '22023',
        message = 'referral qualification event time mismatch';
    end if;
  exception when invalid_datetime_format then
    raise exception using errcode = '22023',
      message = 'invalid referral qualification timestamp';
  end;
  target_eligible_spend := (target_result ->> 'eligibleSpendMinor')::bigint;
  target_evaluation_key := 'woo:evaluation:referral-qualification:connection:' ||
    target_event.connection_id::text || ':event:' || target_event.public_id::text;
  target_subject_reference := 'woocommerce:referral-order:' ||
    target_event.source_object_id;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'referral-qualification:' || target_attribution.id::text,
    target_attribution.organization_id
  ));
  select transition.to_state into strict target_current_state
  from loyalty.referral_attribution_transitions as transition
  where transition.organization_id = target_attribution.organization_id
    and transition.attribution_id = target_attribution.id
  order by transition.id desc limit 1;
  if target_current_state not in ('captured', 'pending_review') then
    return query select target_attribution.public_id, null::uuid,
      target_current_state, 'state_final'::text, null::timestamptz;
    return;
  end if;
  select fact.* into existing_fact
  from loyalty_private.referral_qualification_facts as fact
  where fact.organization_id = target_attribution.organization_id
    and fact.attribution_id = target_attribution.id;
  if found then
    select evaluation.* into strict target_evaluation
    from loyalty_private.programme_evaluations as evaluation
    where evaluation.organization_id = existing_fact.organization_id
      and evaluation.id = existing_fact.evaluation_id;
    if target_evaluation.input_sha256 <> target_input_sha256
      or target_evaluation.result_sha256 <> target_result_sha256 then
      raise exception using errcode = '23514',
        message = 'referral qualification idempotency hash conflict';
    end if;
    return query select target_attribution.public_id,
      target_evaluation.public_id, target_current_state, 'duplicate'::text,
      existing_fact.cooling_ends_at;
    return;
  end if;

  select recorded.evaluation_public_id into strict target_evaluation_public_id
  from loyalty_private.record_programme_evaluation(
    target_attribution.organization_id,
    target_attribution.programme_group_id,
    target_attribution.programme_version_id,
    target_event.id,
    'referral_qualification',
    target_subject_reference,
    target_evaluation_key,
    target_input_sha256,
    target_result_sha256,
    target_result,
    target_explanation,
    target_evaluated_at
  ) as recorded;
  select evaluation.* into strict target_evaluation
  from loyalty_private.programme_evaluations as evaluation
  where evaluation.organization_id = target_attribution.organization_id
    and evaluation.public_id = target_evaluation_public_id;

  target_is_new := not exists (
    select 1
    from loyalty_private.canonical_commerce_events as prior_event
    join loyalty.customer_identities as prior_identity
      on prior_identity.organization_id = prior_event.organization_id
     and prior_identity.commerce_connection_id = prior_event.connection_id
     and prior_identity.external_customer_id = case
       when prior_event.payload -> 'order' -> 'customer' ->> 'kind' = 'registered'
         then 'registered:' || coalesce(
           prior_event.payload -> 'order' -> 'customer' ->> 'externalCustomerId', ''
         )
       when prior_event.payload -> 'order' -> 'customer' ->> 'kind' = 'guest'
         then 'guest-order:' || coalesce(
           prior_event.payload -> 'order' -> 'customer' ->> 'guestOrderId', ''
         )
       else ''
     end
    where prior_event.organization_id = target_event.organization_id
      and prior_event.connection_id = target_event.connection_id
      and prior_event.event_type = 'commerce.order.status_changed'
      and prior_event.source_object_id <> target_event.source_object_id
      and prior_event.payload -> 'order' ->> 'status' in ('processing', 'completed')
      and prior_identity.customer_id = target_attribution.friend_customer_id
      and (prior_event.occurred_at, prior_event.id)
        < (target_event.occurred_at, target_event.id)
  );
  target_cooling_ends_at := target_event.occurred_at
    + make_interval(days => target_policy.cooling_days);
  target_decision := case
    when not target_is_new then 'ineligible_existing_customer'
    when target_eligible_spend < target_policy.minimum_eligible_spend_minor
      then 'ineligible_minimum_spend'
    when target_current_state = 'pending_review' then 'review_held'
    else 'eligible'
  end;

  insert into loyalty_private.referral_qualification_facts (
    organization_id, attribution_id, canonical_event_id, evaluation_id,
    order_status, eligible_spend_minor, is_new_customer, decision,
    qualified_at, cooling_ends_at
  ) values (
    target_attribution.organization_id, target_attribution.id, target_event.id,
    target_evaluation.id, target_event.payload -> 'order' ->> 'status',
    target_eligible_spend, target_is_new, target_decision,
    target_event.occurred_at, target_cooling_ends_at
  );

  if target_decision in (
    'ineligible_existing_customer', 'ineligible_minimum_spend'
  ) then
    target_state := 'rejected';
    insert into loyalty.referral_attribution_transitions (
      organization_id, attribution_id, from_state, to_state, reason_code,
      actor_kind, actor_user_id, idempotency_key
    ) values (
      target_attribution.organization_id, target_attribution.id,
      target_current_state, target_state, target_decision,
      'system', null, 'qualification:' || target_event.public_id::text
    );
  elsif target_decision = 'eligible' then
    target_state := 'cooling';
    insert into loyalty.referral_attribution_transitions (
      organization_id, attribution_id, from_state, to_state, reason_code,
      actor_kind, actor_user_id, idempotency_key
    ) values (
      target_attribution.organization_id, target_attribution.id,
      target_current_state, target_state, 'qualification_passed',
      'system', null, 'qualification:' || target_event.public_id::text
    );
  else
    target_state := target_current_state;
  end if;

  return query select target_attribution.public_id,
    target_evaluation.public_id, target_state, target_decision,
    target_cooling_ends_at;
end;
$$;

create or replace function loyalty_private.reject_referral_for_refund_v1(
  target_event_public_id uuid
)
returns table (attribution_id uuid, state text, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_event loyalty_private.canonical_commerce_events%rowtype;
  target_attribution loyalty.referral_attributions%rowtype;
  target_state text;
begin
  select event.* into strict target_event
  from loyalty_private.canonical_commerce_events as event
  where event.public_id = target_event_public_id
    and event.event_type = 'commerce.order.refunded';
  select attribution.* into target_attribution
  from loyalty.referral_attributions as attribution
  where attribution.organization_id = target_event.organization_id
    and attribution.source_connection_id = target_event.connection_id
    and attribution.source_order_id = target_event.source_object_id;
  if not found then
    return query select null::uuid, 'ignored'::text, 'no_attribution'::text;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'referral-qualification:' || target_attribution.id::text,
    target_attribution.organization_id
  ));
  select transition.to_state into strict target_state
  from loyalty.referral_attribution_transitions as transition
  where transition.organization_id = target_attribution.organization_id
    and transition.attribution_id = target_attribution.id
  order by transition.id desc limit 1;
  if target_state = 'qualified' then
    return query select target_attribution.public_id, target_state,
      'compensation_required'::text;
    return;
  end if;
  if target_state not in ('captured', 'pending_review', 'cooling') then
    return query select target_attribution.public_id, target_state,
      'state_final'::text;
    return;
  end if;
  insert into loyalty.referral_attribution_transitions (
    organization_id, attribution_id, from_state, to_state, reason_code,
    actor_kind, actor_user_id, idempotency_key
  ) values (
    target_attribution.organization_id, target_attribution.id,
    target_state, 'rejected', 'source_order_refunded', 'system', null,
    'refund:' || target_event.public_id::text
  );
  return query select target_attribution.public_id, 'rejected'::text,
    'rejected'::text;
end;
$$;

alter table loyalty_private.referral_qualification_facts owner to loyalty_owner;
alter function loyalty_private.get_referral_qualification_context_v1(uuid)
  owner to loyalty_owner;
alter function loyalty_private.record_referral_qualification_v1(
  uuid, bytea, bytea, jsonb, jsonb, timestamptz
) owner to loyalty_owner;
alter function loyalty_private.reject_referral_for_refund_v1(uuid)
  owner to loyalty_owner;

alter table loyalty_private.referral_qualification_facts enable row level security;
revoke all on loyalty_private.referral_qualification_facts
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function
  loyalty_private.get_referral_qualification_context_v1(uuid),
  loyalty_private.record_referral_qualification_v1(
    uuid, bytea, bytea, jsonb, jsonb, timestamptz
  ),
  loyalty_private.reject_referral_for_refund_v1(uuid)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function
  loyalty_private.get_referral_qualification_context_v1(uuid),
  loyalty_private.record_referral_qualification_v1(
    uuid, bytea, bytea, jsonb, jsonb, timestamptz
  ),
  loyalty_private.reject_referral_for_refund_v1(uuid)
  to loyalty_worker;

comment on table loyalty_private.referral_qualification_facts is
  'Immutable status, spend, new-customer, and cooling evidence for one attributed order.';
comment on function loyalty_private.record_referral_qualification_v1(
  uuid, bytea, bytea, jsonb, jsonb, timestamptz
) is
  'Records one worker-evaluated qualification against the attribution original programme version and appends cooling or rejection without issuing value.';
comment on function loyalty_private.reject_referral_for_refund_v1(uuid) is
  'Rejects a value-neutral captured, review-held, or cooling referral when its source order is refunded; issued value is left for atomic compensation.';
