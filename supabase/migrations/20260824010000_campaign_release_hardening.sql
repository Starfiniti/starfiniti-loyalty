-- M07 release hardening: purchase-campaign awards must follow the same
-- cumulative refund policy as their programme award without rewriting gross
-- capacity or immutable effect history.

create table loyalty_private.campaign_purchase_refund_compensations (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  programme_group_id bigint not null,
  campaign_effect_id bigint not null,
  original_evaluation_id bigint not null,
  refund_evaluation_id bigint not null,
  canonical_refund_event_id bigint not null,
  cumulative_refunded_eligible_spend_minor bigint not null
    check (cumulative_refunded_eligible_spend_minor >= 0),
  target_reversed_points bigint not null check (target_reversed_points >= 0),
  reversal_points bigint not null check (reversal_points >= 0),
  reversal_transaction_id bigint,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, campaign_effect_id, refund_evaluation_id),
  foreign key (organization_id, campaign_effect_id)
    references loyalty_private.campaign_effects(organization_id, id)
    on delete restrict,
  foreign key (organization_id, original_evaluation_id)
    references loyalty_private.programme_evaluations(organization_id, id)
    on delete restrict,
  foreign key (organization_id, refund_evaluation_id)
    references loyalty_private.programme_evaluations(organization_id, id)
    on delete restrict,
  foreign key (organization_id, canonical_refund_event_id)
    references loyalty_private.canonical_commerce_events(organization_id, id)
    on delete restrict,
  foreign key (organization_id, reversal_transaction_id)
    references loyalty.ledger_transactions(organization_id, id)
    on delete restrict,
  check (
    (reversal_points = 0 and reversal_transaction_id is null)
    or (reversal_points > 0 and reversal_transaction_id is not null)
  )
);

alter table loyalty_private.campaign_purchase_refund_compensations
  owner to loyalty_owner;

create index campaign_purchase_refund_compensations_effect_idx
  on loyalty_private.campaign_purchase_refund_compensations (
    organization_id, campaign_effect_id, id
  );

create trigger campaign_purchase_refund_compensations_immutable
before update or delete
on loyalty_private.campaign_purchase_refund_compensations
for each row execute function loyalty_private.reject_immutable_change();

alter table loyalty_private.campaign_purchase_refund_compensations
  enable row level security;

revoke all on loyalty_private.campaign_purchase_refund_compensations
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

create or replace function
  loyalty_private.calculate_campaign_refund_target_v1(
    original_points bigint,
    original_eligible_spend_minor bigint,
    cumulative_refunded_eligible_spend_minor bigint
  )
returns bigint
language plpgsql
immutable
set search_path = ''
as $$
begin
  if original_points < 0
    or original_eligible_spend_minor < 0
    or cumulative_refunded_eligible_spend_minor < 0
    or cumulative_refunded_eligible_spend_minor
      > original_eligible_spend_minor then
    raise exception using errcode = '23514',
      message = 'campaign refund cumulative spend is outside its original award';
  end if;
  if cumulative_refunded_eligible_spend_minor
      = original_eligible_spend_minor then
    return original_points;
  end if;
  if original_eligible_spend_minor = 0 then
    return 0;
  end if;
  return pg_catalog.trunc(
    original_points::numeric
      * cumulative_refunded_eligible_spend_minor::numeric
      / original_eligible_spend_minor::numeric
  )::bigint;
end;
$$;

alter function loyalty_private.calculate_campaign_refund_target_v1(
  bigint, bigint, bigint
) owner to loyalty_owner;

revoke all on function
  loyalty_private.calculate_campaign_refund_target_v1(bigint, bigint, bigint)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

create or replace function loyalty_private.record_purchase_campaign_refund_v1(
  target_organization_id bigint,
  target_original_evaluation_public_id uuid,
  target_refund_evaluation_public_id uuid
)
returns table (
  customer_id bigint,
  affected_effects bigint,
  reversed_points bigint,
  outcome text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  original_evaluation loyalty_private.programme_evaluations%rowtype;
  refund_evaluation loyalty_private.programme_evaluations%rowtype;
  original_fact loyalty_private.tier_qualification_facts%rowtype;
  target_batch loyalty_private.campaign_execution_batches%rowtype;
  target_wallet_id bigint;
  target_effect record;
  existing_compensation
    loyalty_private.campaign_purchase_refund_compensations%rowtype;
  tier_result record;
  origin_entry_public_id uuid;
  posted record;
  reversal_transaction_id bigint;
  original_eligible bigint;
  current_refunded bigint;
  prior_reversed bigint;
  target_reversed bigint;
  delta_reversed bigint;
  request_sha256 bytea;
  created_effects bigint := 0;
  duplicate_effects bigint := 0;
  total_reversed bigint := 0;
begin
  select evaluation.* into strict original_evaluation
  from loyalty_private.programme_evaluations as evaluation
  where evaluation.organization_id = target_organization_id
    and evaluation.public_id = target_original_evaluation_public_id
    and evaluation.evaluation_kind = 'live_award';

  select evaluation.* into strict refund_evaluation
  from loyalty_private.programme_evaluations as evaluation
  where evaluation.organization_id = target_organization_id
    and evaluation.public_id = target_refund_evaluation_public_id
    and evaluation.evaluation_kind = 'live_refund';

  if original_evaluation.programme_group_id
      <> refund_evaluation.programme_group_id
    or original_evaluation.programme_version_id
      <> refund_evaluation.programme_version_id
    or refund_evaluation.result ->> 'orderEventId'
      <> original_evaluation.result ->> 'eventId' then
    raise exception using errcode = '22023',
      message = 'campaign refund does not match its original award';
  end if;

  select fact.* into strict original_fact
  from loyalty_private.tier_qualification_facts as fact
  where fact.organization_id = target_organization_id
    and fact.evaluation_id = original_evaluation.id
    and fact.fact_kind = 'purchase';

  select wallet.id into strict target_wallet_id
  from loyalty.wallets as wallet
  where wallet.organization_id = target_organization_id
    and wallet.programme_group_id = original_fact.programme_group_id
    and wallet.customer_id = original_fact.customer_id
    and wallet.status = 'active'
  order by wallet.id
  limit 1;

  perform 1
  from loyalty.wallet_balances as balance
  where balance.organization_id = target_organization_id
    and balance.wallet_id = target_wallet_id
  order by balance.ledger_account_id
  for update;

  select * into strict tier_result
  from loyalty_private.record_tier_refund_fact_v2(
    target_organization_id,
    target_original_evaluation_public_id,
    target_refund_evaluation_public_id
  );

  original_eligible := original_fact.eligible_spend_minor_delta;
  current_refunded := (
    refund_evaluation.result ->> 'cumulativeRefundedEligibleSpendMinor'
  )::bigint;
  if original_eligible < 0
    or current_refunded < 0
    or current_refunded > original_eligible then
    raise exception using errcode = '23514',
      message = 'campaign refund cumulative spend is outside its original award';
  end if;

  select batch.* into target_batch
  from loyalty_private.campaign_execution_batches as batch
  where batch.organization_id = target_organization_id
    and batch.programme_evaluation_id = original_evaluation.id
  order by batch.id
  limit 1;

  if not found then
    return query select original_fact.customer_id, 0::bigint, 0::bigint,
      case when tier_result.outcome = 'duplicate'
        then 'duplicate'::text else 'no_campaign_effects'::text end;
    return;
  end if;

  for target_effect in
    select effect.*
    from loyalty_private.campaign_effects as effect
    where effect.organization_id = target_organization_id
      and effect.execution_batch_id = target_batch.id
      and effect.decision_outcome = 'awarded'
    order by effect.id
    for update
  loop
    select compensation.* into existing_compensation
    from loyalty_private.campaign_purchase_refund_compensations
      as compensation
    where compensation.organization_id = target_organization_id
      and compensation.campaign_effect_id = target_effect.id
      and compensation.refund_evaluation_id = refund_evaluation.id;

    if found then
      duplicate_effects := duplicate_effects + 1;
      continue;
    end if;

    select coalesce(pg_catalog.sum(compensation.reversal_points), 0)::bigint
      into prior_reversed
    from loyalty_private.campaign_purchase_refund_compensations
      as compensation
    where compensation.organization_id = target_organization_id
      and compensation.campaign_effect_id = target_effect.id;

    target_reversed :=
      loyalty_private.calculate_campaign_refund_target_v1(
        target_effect.points, original_eligible, current_refunded
      );

    if target_reversed < prior_reversed
      or target_reversed > target_effect.points then
      raise exception using errcode = '23514',
        message = 'campaign refund cumulative points moved backwards';
    end if;
    delta_reversed := target_reversed - prior_reversed;
    reversal_transaction_id := null;

    if delta_reversed > 0 then
      select entry.public_id into strict origin_entry_public_id
      from loyalty.ledger_entries as entry
      where entry.organization_id = target_organization_id
        and entry.id = target_effect.award_origin_entry_id;

      request_sha256 := extensions.digest(
        pg_catalog.convert_to(pg_catalog.jsonb_build_object(
          'schemaVersion', '1',
          'campaignEffectId', target_effect.public_id,
          'originalEvaluationId', original_evaluation.public_id,
          'refundEvaluationId', refund_evaluation.public_id,
          'cumulativeRefundedEligibleSpendMinor', current_refunded::text,
          'targetReversedPoints', target_reversed::text,
          'reversalPoints', delta_reversed::text
        )::text, 'UTF8'),
        'sha256'
      );

      select * into strict posted
      from loyalty_private.reverse_award_points(
        target_organization_id,
        origin_entry_public_id,
        delta_reversed,
        'campaign:refund:' || pg_catalog.encode(extensions.digest(
          pg_catalog.convert_to(
            target_effect.public_id::text || '|' ||
              refund_evaluation.public_id::text,
            'UTF8'
          ),
          'sha256'
        ), 'hex'),
        request_sha256,
        'Cumulative WooCommerce campaign refund reversal',
        (
          select event.occurred_at
          from loyalty_private.canonical_commerce_events as event
          where event.organization_id = target_organization_id
            and event.id = refund_evaluation.canonical_event_id
        )
      );

      select transaction.id into strict reversal_transaction_id
      from loyalty.ledger_transactions as transaction
      where transaction.organization_id = target_organization_id
        and transaction.public_id = posted.transaction_public_id;
    end if;

    insert into loyalty_private.campaign_purchase_refund_compensations (
      organization_id, programme_group_id, campaign_effect_id,
      original_evaluation_id, refund_evaluation_id,
      canonical_refund_event_id,
      cumulative_refunded_eligible_spend_minor,
      target_reversed_points, reversal_points, reversal_transaction_id
    ) values (
      target_organization_id, original_fact.programme_group_id,
      target_effect.id, original_evaluation.id, refund_evaluation.id,
      refund_evaluation.canonical_event_id, current_refunded,
      target_reversed, delta_reversed, reversal_transaction_id
    );
    created_effects := created_effects + 1;
    total_reversed := total_reversed + delta_reversed;
  end loop;

  if created_effects > 0 and duplicate_effects > 0 then
    raise exception using errcode = '23514',
      message = 'partial campaign refund evidence is inconsistent';
  end if;

  return query select original_fact.customer_id,
    created_effects + duplicate_effects, total_reversed,
    case
      when created_effects > 0 then 'created'::text
      when duplicate_effects > 0 then 'duplicate'::text
      else 'no_campaign_effects'::text
    end;
end;
$$;

alter function loyalty_private.record_purchase_campaign_refund_v1(
  bigint, uuid, uuid
) owner to loyalty_owner;

revoke all on function loyalty_private.record_purchase_campaign_refund_v1(
  bigint, uuid, uuid
) from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty_private.record_purchase_campaign_refund_v1(
  bigint, uuid, uuid
) to loyalty_worker;

comment on table
  loyalty_private.campaign_purchase_refund_compensations is
  'Append-only cumulative refund evidence for purchase-campaign ledger origins; gross capacity and immutable campaign effects remain unchanged.';

comment on function loyalty_private.record_purchase_campaign_refund_v1(
  bigint, uuid, uuid
) is
  'Serializes a V2 refund, records its tier fact, and proportionally compensates every purchase-campaign award origin exactly once without entitlement checks.';

-- A monetary campaign ceiling is meaningful only when PostgreSQL can derive
-- the exact face value from the immutable reward. Other coupon kinds remain
-- valid programme rewards but cannot claim a hard monetary campaign bound.

create or replace function loyalty_private.validate_campaign_native_liability_v1(
  target_organization_id bigint,
  target_programme_group_id bigint,
  target_campaign_id bigint,
  target_definition jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_programme_id bigint;
  reward_public_id_text text;
  target_reward_kind text;
  target_reward_configuration jsonb;
  target_programme_configuration jsonb;
  face_value_minor bigint;
  declared_per_effect bigint;
  declared_maximum bigint;
  declared_currency text;
  declared_digits smallint;
begin
  reward_public_id_text :=
    target_definition #>> '{behavior,reward,rewardId}';
  if reward_public_id_text is null then
    return;
  end if;

  select campaign.programme_id into strict target_programme_id
  from loyalty.campaigns as campaign
  where campaign.organization_id = target_organization_id
    and campaign.programme_group_id = target_programme_group_id
    and campaign.id = target_campaign_id;

  select reward.reward_kind, reward.configuration, version.configuration
    into target_reward_kind, target_reward_configuration,
      target_programme_configuration
  from loyalty.programme_rewards as reward
  join loyalty.programme_versions as version
    on version.organization_id = reward.organization_id
   and version.id = reward.programme_version_id
  where reward.organization_id = target_organization_id
    and reward.programme_group_id = target_programme_group_id
    and reward.public_id = reward_public_id_text::uuid
    and version.programme_id = target_programme_id
    and version.status = 'published';
  if not found then
    raise exception using errcode = '23514',
      message = 'campaign reward must belong to the exact published programme';
  end if;

  if target_reward_kind <> 'fixed_discount'
    or target_reward_configuration ->> 'version' <> '2'
    or target_reward_configuration ->> 'fulfilmentMode'
      <> 'woocommerce_coupon'
    or coalesce(target_reward_configuration ->> 'amountMinor', '')
      !~ '^[1-9][0-9]*$'
    or (target_reward_configuration ->> 'amountMinor')::numeric
      > 9223372036854775807
    or coalesce(
      target_reward_configuration ->> 'currencyMinorUnitDigits', ''
    ) !~ '^[0-6]$' then
    raise exception using errcode = '23514',
      message = 'campaign liability requires a published fixed-discount reward';
  end if;

  face_value_minor :=
    (target_reward_configuration ->> 'amountMinor')::bigint;
  declared_per_effect :=
    (target_definition #>> '{capacity,liabilityMinorPerEffect}')::bigint;
  declared_maximum :=
    (target_definition #>> '{capacity,maximumLiabilityMinor}')::bigint;
  declared_currency :=
    target_definition #>> '{capacity,liabilityCurrencyCode}';
  declared_digits :=
    (target_definition #>> '{capacity,liabilityMinorUnitDigits}')::smallint;

  if declared_per_effect <> face_value_minor
    or declared_maximum < face_value_minor
    or declared_currency
      <> (target_programme_configuration ->> 'currencyCode')
    or declared_digits
      <> (target_programme_configuration
        ->> 'currencyMinorUnitDigits')::smallint
    or declared_digits
      <> (target_reward_configuration
        ->> 'currencyMinorUnitDigits')::smallint then
    raise exception using errcode = '23514',
      message = 'campaign liability must match fixed-discount face value';
  end if;
end;
$$;

alter function loyalty_private.validate_campaign_native_liability_v1(
  bigint, bigint, bigint, jsonb
) owner to loyalty_owner;

revoke all on function
  loyalty_private.validate_campaign_native_liability_v1(
    bigint, bigint, bigint, jsonb
  ) from public, anon, authenticated, loyalty_runtime, loyalty_worker;

create or replace function loyalty_private.enforce_campaign_native_liability_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  must_validate boolean := tg_op = 'INSERT';
begin
  if tg_op = 'UPDATE' then
    must_validate := old.status = 'draft' and new.status = 'scheduled';
  end if;
  if must_validate then
    perform loyalty_private.validate_campaign_native_liability_v1(
      new.organization_id,
      new.programme_group_id,
      new.campaign_id,
      new.definition
    );
  end if;
  return new;
end;
$$;

alter function loyalty_private.enforce_campaign_native_liability_v1()
  owner to loyalty_owner;

revoke all on function
  loyalty_private.enforce_campaign_native_liability_v1()
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

create trigger campaign_versions_native_liability
before insert or update of status on loyalty.campaign_versions
for each row execute function
  loyalty_private.enforce_campaign_native_liability_v1();

-- Snapshot evaluation must use one PostgreSQL statement snapshot. Mark the
-- read-only nested functions STABLE, then open one bounded cursor whose time
-- anchor, candidate set, wallet balances, facts, tiers, and decisions share
-- the same MVCC view.

alter function loyalty_private.calculate_audience_metric_v1(
  bigint, bigint, bigint, bigint, text, jsonb, text[], timestamptz
) stable;

alter function loyalty_private.evaluate_audience_member_v1(
  jsonb, bigint, bigint, bigint, bigint, timestamptz
) stable;

create or replace function loyalty_private.assert_audience_candidate_limit_v1(
  target_candidate_count bigint
)
returns bigint
language plpgsql
immutable
set search_path = ''
as $$
begin
  if target_candidate_count > 100000 then
    raise exception using errcode = '54000',
      message = 'audience snapshot exceeds the synchronous candidate limit';
  end if;
  return target_candidate_count;
end;
$$;

alter function loyalty_private.assert_audience_candidate_limit_v1(bigint)
  owner to loyalty_owner;

revoke all on function
  loyalty_private.assert_audience_candidate_limit_v1(bigint)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

create or replace function loyalty_private.build_audience_snapshot_v1(
  target_version_public_id uuid,
  target_actor_user_id uuid
)
returns table (
  snapshot_public_id uuid,
  snapshot_at timestamptz,
  candidate_count bigint,
  member_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_version loyalty.audience_versions%rowtype;
  target_snapshot loyalty.audience_snapshots%rowtype;
  candidate record;
  processed_count bigint := 0;
  included_count bigint := 0;
  bounded_count bigint := 0;
begin
  select version.* into strict target_version
  from loyalty.audience_versions as version
  where version.public_id = target_version_public_id
    and version.status = 'published';

  for candidate in
    with snapshot_anchor as materialized (
      select pg_catalog.clock_timestamp() as snapshot_at
    ),
    bounded_candidates as materialized (
      select customer.id as customer_id, wallet.id as wallet_id
      from loyalty.wallets as wallet
      join loyalty.customers as customer
        on customer.organization_id = wallet.organization_id
       and customer.id = wallet.customer_id
      cross join snapshot_anchor as anchor
      where wallet.organization_id = target_version.organization_id
        and wallet.programme_group_id = target_version.programme_group_id
        and wallet.status = 'active'
        and customer.status = 'active'
        and wallet.created_at <= anchor.snapshot_at
        and customer.created_at <= anchor.snapshot_at
      order by wallet.id
      limit 100001
    ),
    candidate_guard as materialized (
      select loyalty_private.assert_audience_candidate_limit_v1(
        pg_catalog.count(*)::bigint
      ) as candidate_count
      from bounded_candidates
    ),
    decisions as materialized (
      select bounded.customer_id, bounded.wallet_id,
        evaluated.included, evaluated.evaluation
      from bounded_candidates as bounded
      cross join snapshot_anchor as anchor
      cross join lateral loyalty_private.evaluate_audience_member_v1(
        target_version.definition,
        target_version.organization_id,
        target_version.programme_group_id,
        bounded.customer_id,
        bounded.wallet_id,
        anchor.snapshot_at
      ) as evaluated
    )
    select anchor.snapshot_at, guard.candidate_count,
      decision.customer_id, decision.wallet_id,
      decision.included, decision.evaluation
    from snapshot_anchor as anchor
    cross join candidate_guard as guard
    left join decisions as decision on true
    order by decision.wallet_id nulls first
  loop
    if target_snapshot.id is null then
      bounded_count := candidate.candidate_count;
      insert into loyalty.audience_snapshots (
        organization_id, programme_group_id, audience_version_id, state,
        snapshot_at, definition_sha256, created_by_user_id
      ) values (
        target_version.organization_id, target_version.programme_group_id,
        target_version.id, 'building', candidate.snapshot_at,
        target_version.definition_sha256, target_actor_user_id
      ) returning * into strict target_snapshot;
    end if;

    if candidate.customer_id is not null then
      processed_count := processed_count + 1;
      if candidate.included then
        insert into loyalty_private.audience_snapshot_members (
          organization_id, programme_group_id, audience_snapshot_id,
          customer_id, wallet_id, evaluation
        ) values (
          target_version.organization_id, target_version.programme_group_id,
          target_snapshot.id, candidate.customer_id, candidate.wallet_id,
          candidate.evaluation
        );
        included_count := included_count + 1;
      end if;
    end if;
  end loop;

  if target_snapshot.id is null or processed_count <> bounded_count then
    raise exception using errcode = '23514',
      message = 'audience snapshot candidate evaluation did not reconcile';
  end if;

  update loyalty.audience_snapshots as snapshot
  set state = 'complete', member_count = included_count,
    completed_at = pg_catalog.clock_timestamp()
  where snapshot.organization_id = target_snapshot.organization_id
    and snapshot.id = target_snapshot.id
  returning * into strict target_snapshot;

  return query select target_snapshot.public_id, target_snapshot.snapshot_at,
    bounded_count, target_snapshot.member_count;
end;
$$;

alter function loyalty_private.build_audience_snapshot_v1(uuid, uuid)
  owner to loyalty_owner;

revoke all on function loyalty_private.build_audience_snapshot_v1(uuid, uuid)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

create or replace function loyalty.create_audience_snapshot_command(
  target_version_public_id uuid,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (
  resource_public_id uuid,
  outcome text,
  snapshot_at timestamptz,
  member_count text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := loyalty_private.request_user_id();
  target_version loyalty.audience_versions%rowtype;
  target_audience loyalty.audiences%rowtype;
  target_snapshot loyalty.audience_snapshots%rowtype;
  existing_audit loyalty.admin_audit_events%rowtype;
  entitlement_enabled boolean;
  request_hash bytea;
  snapshot_build record;
begin
  if actor_user_id is null
    or target_idempotency_key is null
    or length(btrim(target_idempotency_key)) not between 1 and 255
    or target_idempotency_key <> btrim(target_idempotency_key)
    or target_correlation_id is null then
    raise exception using errcode = '22023',
      message = 'invalid audience snapshot identity';
  end if;

  select audience.* into target_audience
  from loyalty.audiences as audience
  join loyalty.audience_versions as version
    on version.organization_id = audience.organization_id
   and version.audience_id = audience.id
  where version.public_id = target_version_public_id
    and loyalty_private.has_organization_role(
      audience.organization_id, array['owner', 'admin', 'operator']::text[]
    )
  for update of audience;
  if not found then
    raise exception using errcode = '42501',
      message = 'audience command not authorized';
  end if;

  select version.* into strict target_version
  from loyalty.audience_versions as version
  where version.organization_id = target_audience.organization_id
    and version.public_id = target_version_public_id;
  request_hash := extensions.digest(pg_catalog.convert_to(
    'audience.snapshot.create|' || target_version.public_id::text,
    'UTF8'
  ), 'sha256');

  select audit.* into existing_audit
  from loyalty.admin_audit_events as audit
  where audit.organization_id = target_version.organization_id
    and audit.idempotency_key = target_idempotency_key;
  if found then
    if existing_audit.action <> 'audience.snapshot.create'
      or existing_audit.request_sha256 <> request_hash then
      raise exception using errcode = '23514',
        message = 'audience command idempotency conflict';
    end if;
    return query
    select snapshot.public_id, 'duplicate'::text, snapshot.snapshot_at,
      snapshot.member_count::text
    from loyalty.audience_snapshots as snapshot
    where snapshot.organization_id = target_version.organization_id
      and snapshot.public_id = existing_audit.resource_public_id;
    return;
  end if;

  if target_version.status <> 'published' then
    raise exception using errcode = '23514',
      message = 'only the published audience can be snapshotted';
  end if;
  select decision.enabled into strict entitlement_enabled
  from loyalty_private.resolve_organization_entitlement(
    target_version.organization_id, 'campaigns',
    'audience:' || target_audience.public_id::text, pg_catalog.now()
  ) as decision;
  if not entitlement_enabled then
    raise exception using errcode = '42501',
      message = 'campaigns are not enabled for this organization';
  end if;

  select * into strict snapshot_build
  from loyalty_private.build_audience_snapshot_v1(
    target_version.public_id, actor_user_id
  );
  select snapshot.* into strict target_snapshot
  from loyalty.audience_snapshots as snapshot
  where snapshot.organization_id = target_version.organization_id
    and snapshot.public_id = snapshot_build.snapshot_public_id;

  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id,
    metadata
  ) values (
    target_snapshot.organization_id, actor_user_id,
    'audience.snapshot.create', 'audience_snapshot', target_snapshot.public_id,
    target_idempotency_key, request_hash, target_correlation_id,
    pg_catalog.jsonb_build_object(
      'audiencePublicId', target_audience.public_id,
      'audienceVersionPublicId', target_version.public_id,
      'definitionSha256', pg_catalog.encode(
        target_version.definition_sha256, 'hex'
      ),
      'candidateCount', snapshot_build.candidate_count::text,
      'memberCount', snapshot_build.member_count::text,
      'snapshotAt', snapshot_build.snapshot_at
    )
  );

  return query select target_snapshot.public_id, 'created'::text,
    target_snapshot.snapshot_at, target_snapshot.member_count::text;
end;
$$;

alter function loyalty.create_audience_snapshot_command(uuid, text, uuid)
  owner to loyalty_owner;

revoke all on function
  loyalty.create_audience_snapshot_command(uuid, text, uuid)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function
  loyalty.create_audience_snapshot_command(uuid, text, uuid)
  to authenticated;

-- M07 minimized merchant campaign results. Browser sessions receive only
-- exact tenant-scoped aggregates; private assignments, source references,
-- salts, errors, and customer identities remain inaccessible.

create or replace function loyalty.get_campaign_results_v1(
  target_programme_public_id uuid,
  target_limit integer default 100
)
returns table (campaign_result jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_programme loyalty.programmes%rowtype;
  generated_at timestamptz := pg_catalog.statement_timestamp();
begin
  if loyalty_private.request_user_id() is null
    or target_programme_public_id is null
    or target_limit is null
    or target_limit not between 1 and 100 then
    raise exception using errcode = '22023',
      message = 'invalid campaign results request';
  end if;

  select programme.* into target_programme
  from loyalty.programmes as programme
  where programme.public_id = target_programme_public_id
    and loyalty_private.has_organization_role(
      programme.organization_id,
      array['owner', 'admin', 'operator', 'analyst', 'auditor']::text[]
    );
  if not found then
    raise exception using errcode = '42501',
      message = 'campaign results not authorized';
  end if;

  return query
  select pg_catalog.jsonb_build_object(
    'schemaVersion', '1',
    'programmeId', target_programme.public_id,
    'campaignId', campaign.public_id,
    'campaignVersionId', version.public_id,
    'campaignCode', campaign.code,
    'campaignName', version.definition ->> 'name',
    'versionNumber', version.version_number,
    'status', version.status,
    'startsAt', version.starts_at,
    'endsAt', version.ends_at,
    'generatedAt', generated_at,
    'assignments', pg_catalog.jsonb_build_object(
      'eligible', version.eligible_member_count::text,
      'treatment', version.treatment_member_count::text,
      'control', version.control_member_count::text
    ),
    'capacity', pg_catalog.jsonb_build_object(
      'globalEffectLimit', version.global_effect_limit::text,
      'maximumPoints', version.maximum_points::text,
      'maximumLiabilityMinor', version.maximum_liability_minor::text,
      'reservedEffects', coalesce(counter.reserved_effects, 0)::text,
      'committedEffects', coalesce(counter.committed_effects, 0)::text,
      'reservedPoints', coalesce(counter.reserved_points, 0)::text,
      'committedPoints', coalesce(counter.committed_points, 0)::text,
      'reservedLiabilityMinor',
        coalesce(counter.reserved_liability_minor, 0)::text,
      'committedLiabilityMinor',
        coalesce(counter.committed_liability_minor, 0)::text
    ),
    'purchaseOutcomes', pg_catalog.jsonb_build_object(
      'awarded', coalesce(purchase.awarded, 0)::text,
      'control', coalesce(purchase.control_count, 0)::text,
      'capacityExhausted',
        coalesce(purchase.capacity_exhausted, 0)::text,
      'suppressed', coalesce(purchase.suppressed, 0)::text,
      'reversedAwards',
        coalesce(purchase.reversed_awards, 0)::text
    ),
    'triggerJobs', pg_catalog.jsonb_build_object(
      'pending', coalesce(jobs.pending, 0)::text,
      'processing', coalesce(jobs.processing, 0)::text,
      'retryable', coalesce(jobs.retryable, 0)::text,
      'completed', coalesce(jobs.completed, 0)::text,
      'cancelled', coalesce(jobs.cancelled, 0)::text,
      'manualReview', coalesce(jobs.manual_review, 0)::text
    ),
    'triggerOutcomes', pg_catalog.jsonb_build_object(
      'pointsAwarded', coalesce(executions.points_awarded, 0)::text,
      'rewardReserved', coalesce(executions.reward_reserved, 0)::text,
      'control', coalesce(executions.control_count, 0)::text,
      'capacityExhausted',
        coalesce(executions.capacity_exhausted, 0)::text,
      'pointsReversed', coalesce(executions.points_reversed, 0)::text,
      'rewardCancellationRequested',
        coalesce(executions.reward_cancellation_requested, 0)::text,
      'rewardAlreadyResolved',
        coalesce(executions.reward_already_resolved, 0)::text,
      'rewardNonreversible',
        coalesce(executions.reward_nonreversible, 0)::text,
      'noValueToReverse',
        coalesce(executions.no_value_to_reverse, 0)::text
    ),
    'measurement', pg_catalog.jsonb_build_object(
      'classification', 'influenced',
      'incrementalityState', 'not_measured',
      'explanation',
        'These are directly attributed campaign outcomes, not experimentally measured incremental lift.'
    )
  )
  from loyalty.campaigns as campaign
  join loyalty.campaign_versions as version
    on version.organization_id = campaign.organization_id
   and version.campaign_id = campaign.id
  left join loyalty_private.campaign_capacity_counters as counter
    on counter.organization_id = version.organization_id
   and counter.campaign_version_id = version.id
  left join lateral (
    select
      pg_catalog.count(*) filter (
        where effect.decision_outcome = 'awarded'
      )::bigint as awarded,
      pg_catalog.count(*) filter (
        where effect.decision_outcome = 'control'
      )::bigint as control_count,
      pg_catalog.count(*) filter (
        where effect.decision_outcome = 'capacity_exhausted'
      )::bigint as capacity_exhausted,
      pg_catalog.count(*) filter (
        where effect.decision_outcome = 'suppressed'
      )::bigint as suppressed,
      pg_catalog.count(*) filter (
        where effect.decision_outcome = 'awarded'
          and effect.points = coalesce((
            select pg_catalog.sum(compensation.reversal_points)::bigint
            from loyalty_private.campaign_purchase_refund_compensations
              as compensation
            where compensation.organization_id = effect.organization_id
              and compensation.campaign_effect_id = effect.id
          ), 0)
      )::bigint as reversed_awards
    from loyalty_private.campaign_effects as effect
    where effect.organization_id = version.organization_id
      and effect.campaign_version_id = version.id
  ) as purchase on true
  left join lateral (
    select
      pg_catalog.count(*) filter (where job.state = 'pending')::bigint as pending,
      pg_catalog.count(*) filter (where job.state = 'processing')::bigint
        as processing,
      pg_catalog.count(*) filter (where job.state = 'retryable')::bigint
        as retryable,
      pg_catalog.count(*) filter (where job.state = 'completed')::bigint
        as completed,
      pg_catalog.count(*) filter (where job.state = 'cancelled')::bigint
        as cancelled,
      pg_catalog.count(*) filter (where job.state = 'manual_review')::bigint
        as manual_review
    from loyalty_private.campaign_trigger_jobs as job
    where job.organization_id = version.organization_id
      and job.campaign_version_id = version.id
  ) as jobs on true
  left join lateral (
    select
      pg_catalog.count(*) filter (
        where execution.outcome = 'points_awarded'
      )::bigint as points_awarded,
      pg_catalog.count(*) filter (
        where execution.outcome = 'reward_reserved'
      )::bigint as reward_reserved,
      pg_catalog.count(*) filter (
        where execution.outcome = 'control'
      )::bigint as control_count,
      pg_catalog.count(*) filter (
        where execution.outcome = 'capacity_exhausted'
      )::bigint as capacity_exhausted,
      pg_catalog.count(*) filter (
        where execution.outcome = 'points_reversed'
      )::bigint as points_reversed,
      pg_catalog.count(*) filter (
        where execution.outcome = 'reward_cancellation_requested'
      )::bigint as reward_cancellation_requested,
      pg_catalog.count(*) filter (
        where execution.outcome = 'reward_already_resolved'
      )::bigint as reward_already_resolved,
      pg_catalog.count(*) filter (
        where execution.outcome = 'reward_nonreversible'
      )::bigint as reward_nonreversible,
      pg_catalog.count(*) filter (
        where execution.outcome = 'no_value_to_reverse'
      )::bigint as no_value_to_reverse
    from loyalty_private.campaign_trigger_executions as execution
    where execution.organization_id = version.organization_id
      and execution.campaign_version_id = version.id
  ) as executions on true
  where campaign.organization_id = target_programme.organization_id
    and campaign.programme_group_id = target_programme.programme_group_id
    and campaign.programme_id = target_programme.id
  order by version.starts_at desc, version.id desc
  limit target_limit;
end;
$$;

alter function loyalty.get_campaign_results_v1(uuid, integer)
  owner to loyalty_owner;

revoke all on function loyalty.get_campaign_results_v1(uuid, integer)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty.get_campaign_results_v1(uuid, integer)
  to authenticated;

comment on function loyalty.get_campaign_results_v1(uuid, integer) is
  'Returns bounded exact campaign aggregates for an Auth-derived live organization member without exposing private assignments, identities, source references, errors, salts, or causal-incrementality claims.';

-- Accepted campaign versions need a real database-timed lifecycle. Without
-- these transitions a scheduled version remains scheduled forever, never
-- becomes visibly active/completed, and permanently blocks its successor.

create table loyalty_private.campaign_lifecycle_events (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  programme_group_id bigint not null,
  campaign_version_id bigint not null,
  from_status text not null check (
    from_status in ('scheduled', 'active', 'paused')
  ),
  to_status text not null check (to_status in ('active', 'completed')),
  transitioned_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, campaign_version_id, to_status),
  foreign key (organization_id, programme_group_id, campaign_version_id)
    references loyalty.campaign_versions(
      organization_id, programme_group_id, id
    ) on delete restrict,
  check (
    (from_status = 'scheduled' and to_status in ('active', 'completed'))
    or (from_status in ('active', 'paused') and to_status = 'completed')
  )
);

create index campaign_versions_completion_due_idx
  on loyalty.campaign_versions (ends_at, id)
  where status in ('scheduled', 'active', 'paused');

alter table loyalty_private.campaign_lifecycle_events owner to loyalty_owner;

create trigger campaign_lifecycle_events_immutable
before update or delete on loyalty_private.campaign_lifecycle_events
for each row execute function loyalty_private.reject_immutable_change();

alter table loyalty_private.campaign_lifecycle_events enable row level security;

revoke all on loyalty_private.campaign_lifecycle_events
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

create or replace function loyalty_private.protect_campaign_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000',
      message = 'campaign versions are immutable';
  end if;
  if new.id <> old.id
    or new.public_id <> old.public_id
    or new.organization_id <> old.organization_id
    or new.programme_group_id <> old.programme_group_id
    or new.campaign_id <> old.campaign_id
    or new.version_number <> old.version_number
    or new.definition <> old.definition
    or new.definition_sha256 <> old.definition_sha256
    or new.audience_snapshot_id <> old.audience_snapshot_id
    or new.schedule_timezone <> old.schedule_timezone
    or new.starts_at <> old.starts_at
    or new.ends_at <> old.ends_at
    or new.global_effect_limit <> old.global_effect_limit
    or new.per_member_effect_limit <> old.per_member_effect_limit
    or new.maximum_points is distinct from old.maximum_points
    or new.maximum_liability_minor is distinct from old.maximum_liability_minor
    or new.liability_minor_per_effect
      is distinct from old.liability_minor_per_effect
    or new.liability_currency_code
      is distinct from old.liability_currency_code
    or new.liability_minor_unit_digits
      is distinct from old.liability_minor_unit_digits
    or new.control_basis_points <> old.control_basis_points
    or new.created_by_user_id <> old.created_by_user_id
    or new.created_at <> old.created_at then
    raise exception using errcode = '55000',
      message = 'campaign definition history is immutable';
  end if;
  if old.status = 'draft' and new.status = 'scheduled'
    and old.approved_by_user_id is null
    and new.approved_by_user_id is not null
    and old.approved_at is null and new.approved_at is not null
    and old.assignment_sha256 is null and new.assignment_sha256 is not null
    and new.eligible_member_count > 0
    and new.treatment_member_count + new.control_member_count
      = new.eligible_member_count
    and new.status_changed_at >= old.status_changed_at then
    return new;
  end if;
  if old.status in ('scheduled', 'active') and new.status = 'paused'
    and new.approved_by_user_id = old.approved_by_user_id
    and new.approved_at = old.approved_at
    and new.eligible_member_count = old.eligible_member_count
    and new.treatment_member_count = old.treatment_member_count
    and new.control_member_count = old.control_member_count
    and new.assignment_sha256 = old.assignment_sha256
    and new.status_changed_at >= old.status_changed_at then
    return new;
  end if;
  if old.status in ('scheduled', 'active', 'paused')
    and new.status = 'cancelled'
    and new.approved_by_user_id = old.approved_by_user_id
    and new.approved_at = old.approved_at
    and new.eligible_member_count = old.eligible_member_count
    and new.treatment_member_count = old.treatment_member_count
    and new.control_member_count = old.control_member_count
    and new.assignment_sha256 = old.assignment_sha256
    and new.status_changed_at >= old.status_changed_at then
    return new;
  end if;
  if old.status = 'scheduled' and new.status = 'active'
    and new.approved_by_user_id = old.approved_by_user_id
    and new.approved_at = old.approved_at
    and new.eligible_member_count = old.eligible_member_count
    and new.treatment_member_count = old.treatment_member_count
    and new.control_member_count = old.control_member_count
    and new.assignment_sha256 = old.assignment_sha256
    and new.status_changed_at >= old.starts_at
    and new.status_changed_at < old.ends_at then
    return new;
  end if;
  if old.status in ('scheduled', 'active', 'paused')
    and new.status = 'completed'
    and new.approved_by_user_id = old.approved_by_user_id
    and new.approved_at = old.approved_at
    and new.eligible_member_count = old.eligible_member_count
    and new.treatment_member_count = old.treatment_member_count
    and new.control_member_count = old.control_member_count
    and new.assignment_sha256 = old.assignment_sha256
    and new.status_changed_at >= old.ends_at then
    return new;
  end if;
  raise exception using errcode = '55000',
    message = 'invalid campaign version transition';
end;
$$;

alter function loyalty_private.protect_campaign_version()
  owner to loyalty_owner;

revoke all on function loyalty_private.protect_campaign_version()
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

create or replace function loyalty_private.advance_campaign_lifecycle_at_v1(
  target_now timestamptz,
  target_limit integer
)
returns table (
  campaign_version_id uuid,
  from_status text,
  to_status text,
  transitioned_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate loyalty.campaign_versions%rowtype;
  next_status text;
begin
  if target_now is null or target_limit not between 1 and 100 then
    raise exception using errcode = '22023',
      message = 'invalid campaign lifecycle request';
  end if;
  for candidate in
    select version.*
    from loyalty.campaign_versions as version
    where (
      version.status = 'scheduled'
      and version.starts_at <= target_now
    ) or (
      version.status in ('active', 'paused')
      and version.ends_at <= target_now
    )
    order by
      case when version.ends_at <= target_now
        then version.ends_at else version.starts_at end,
      version.id
    limit target_limit
    for update skip locked
  loop
    next_status := case when candidate.ends_at <= target_now
      then 'completed' else 'active' end;
    update loyalty.campaign_versions as version
    set status = next_status, status_changed_at = target_now
    where version.organization_id = candidate.organization_id
      and version.id = candidate.id;
    insert into loyalty_private.campaign_lifecycle_events (
      organization_id, programme_group_id, campaign_version_id,
      from_status, to_status, transitioned_at
    ) values (
      candidate.organization_id, candidate.programme_group_id, candidate.id,
      candidate.status, next_status, target_now
    );
    campaign_version_id := candidate.public_id;
    from_status := candidate.status;
    to_status := next_status;
    transitioned_at := target_now;
    return next;
  end loop;
end;
$$;

alter function loyalty_private.advance_campaign_lifecycle_at_v1(
  timestamptz, integer
) owner to loyalty_owner;

revoke all on function loyalty_private.advance_campaign_lifecycle_at_v1(
  timestamptz, integer
) from public, anon, authenticated, loyalty_runtime, loyalty_worker;

create or replace function loyalty_private.advance_campaign_lifecycle_v1(
  target_limit integer
)
returns table (
  campaign_version_id uuid,
  from_status text,
  to_status text,
  transitioned_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select *
  from loyalty_private.advance_campaign_lifecycle_at_v1(
    pg_catalog.clock_timestamp(), target_limit
  )
$$;

alter function loyalty_private.advance_campaign_lifecycle_v1(integer)
  owner to loyalty_owner;

revoke all on function loyalty_private.advance_campaign_lifecycle_v1(integer)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty_private.advance_campaign_lifecycle_v1(integer)
  to loyalty_worker;

comment on table loyalty_private.campaign_lifecycle_events is
  'Append-only evidence for database-timed scheduled, active, paused, and completed campaign transitions.';

comment on function loyalty_private.advance_campaign_lifecycle_v1(integer) is
  'Advances a bounded SKIP LOCKED campaign lifecycle batch using database time; accepted value, reversals, and history remain available after completion.';
