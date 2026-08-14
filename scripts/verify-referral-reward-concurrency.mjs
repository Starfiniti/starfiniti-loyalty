import { randomUUID } from "node:crypto";

import postgres from "postgres";

const connectionString =
  process.env.SUPABASE_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const admin = postgres(connectionString, { max: 1, onnotice: () => {} });
const first = postgres(connectionString, { max: 1, onnotice: () => {} });
const second = postgres(connectionString, { max: 1, onnotice: () => {} });
const hash = (value) => Buffer.from(value.repeat(64).slice(0, 64), "hex");

try {
  const fixture = await admin.begin(async (sql) => {
    const [organization] = await sql`
      insert into loyalty.organizations (slug, name)
      values (${`referral-reward-${suffix}`}, 'Referral Reward Race Probe')
      returning id
    `;
    const [workspace] = await sql`
      insert into loyalty.workspaces (organization_id, slug, name)
      values (${organization.id}, 'store', 'Referral Race Store')
      returning id
    `;
    const [group] = await sql`
      insert into loyalty.programme_groups (organization_id, slug, name)
      values (${organization.id}, 'referrals', 'Referral Race Group')
      returning id
    `;
    const [programme] = await sql`
      insert into loyalty.programmes (
        organization_id, programme_group_id, slug, name, status
      ) values (
        ${organization.id}, ${group.id}, 'referrals',
        'Referral Race Programme', 'active'
      ) returning id
    `;
    const [version] = await sql`
      insert into loyalty.programme_versions (
        organization_id, programme_group_id, programme_id, version_number,
        status, configuration, configuration_sha256, published_at
      ) values (
        ${organization.id}, ${group.id}, ${programme.id}, 1, 'published',
        ${{ probe: true }}, ${hash("a")}, now() - interval '20 days'
      ) returning id
    `;
    await sql`
      insert into loyalty.programme_point_expiry_policies (
        organization_id, programme_group_id, programme_version_id,
        method, expire_after_days, notification_lead_days
      ) values (
        ${organization.id}, ${group.id}, ${version.id},
        'earned_date', 365, array[]::smallint[]
      )
    `;
    await sql`
      insert into loyalty.programme_referral_policies (
        organization_id, programme_group_id, programme_version_id,
        attribution_window_days, qualification_status, cooling_days,
        minimum_eligible_spend_minor, require_new_customer,
        monthly_advocate_referral_limit, advocate_reward_points,
        friend_reward_points, manual_review_enabled, risk_window_hours,
        source_network_referral_limit, device_referral_limit
      ) values (
        ${organization.id}, ${group.id}, ${version.id},
        30, 'completed', 14, 2500, true, 10, 500, 250,
        true, 24, 2, 2
      )
    `;
    const [connection] = await sql`
      insert into loyalty.commerce_connections (
        organization_id, workspace_id, external_store_id, display_name,
        current_key_version, signing_material_ref, programme_id
      ) values (
        ${organization.id}, ${workspace.id},
        ${`https://referral-${suffix}.example.test`},
        'Referral Race WooCommerce', 'v1',
        ${`vault://referral-race/${suffix}`}, ${programme.id}
      ) returning id
    `;
    const customers = await sql`
      insert into loyalty.customers (organization_id, display_reference)
      values
        (${organization.id}, ${`advocate-${suffix}`}),
        (${organization.id}, ${`friend-${suffix}`})
      returning id, display_reference
    `;
    const advocateCustomer = customers.find((customer) =>
      customer.display_reference.startsWith("advocate-"),
    );
    const friendCustomer = customers.find((customer) =>
      customer.display_reference.startsWith("friend-"),
    );
    if (!advocateCustomer || !friendCustomer) {
      throw new Error("referral concurrency customers unavailable");
    }
    const [advocate] = await sql`
      insert into loyalty.referral_advocates (
        organization_id, programme_group_id, customer_id, source_connection_id
      ) values (
        ${organization.id}, ${group.id}, ${advocateCustomer.id}, ${connection.id}
      ) returning id
    `;
    const [delivery] = await sql`
      insert into loyalty_private.commerce_delivery_inbox (
        organization_id, connection_id, source_delivery_id, envelope_version,
        source_event_id, event_type, source_object_id, occurred_at,
        delivered_at, key_version, nonce, body_sha256, raw_body, state
      ) values (
        ${organization.id}, ${connection.id}, ${`delivery-${suffix}`}, '1',
        ${`event-${suffix}`}, 'commerce.order.status_changed',
        ${`order-${suffix}`}, now() - interval '15 days',
        now() - interval '15 days', 'v1', ${`nonce-${suffix}`},
        ${"a".repeat(64)}, ${{ version: "1", probe: true }}, 'applied'
      ) returning id
    `;
    const [event] = await sql`
      insert into loyalty_private.canonical_commerce_events (
        organization_id, connection_id, delivery_inbox_id, source_event_id,
        normalization_version, event_type, source_object_id, occurred_at,
        payload
      ) values (
        ${organization.id}, ${connection.id}, ${delivery.id},
        ${`event-${suffix}`}, 'v1', 'commerce.order.status_changed',
        ${`order-${suffix}`}, now() - interval '15 days',
        ${{ kind: "order_status_changed", probe: true }}
      ) returning id, public_id, occurred_at
    `;
    const [evaluation] = await sql`
      insert into loyalty_private.programme_evaluations (
        organization_id, programme_group_id, programme_version_id,
        canonical_event_id, evaluation_kind, subject_reference,
        idempotency_key, input_sha256, result_sha256, result, explanation,
        evaluated_at
      ) values (
        ${organization.id}, ${group.id}, ${version.id}, ${event.id},
        'referral_qualification', ${`referral-race:${suffix}`},
        ${`referral-race:${suffix}:qualification`}, ${hash("b")}, ${hash("c")},
        ${{ version: "2", awardedPoints: "0", eligibleSpendMinor: "5000" }},
        ${{ probe: true }}, now() - interval '14 days'
      ) returning id
    `;
    const [attribution] = await sql`
      insert into loyalty.referral_attributions (
        organization_id, programme_group_id, programme_version_id,
        advocate_id, friend_customer_id, source_connection_id,
        source_event_id, source_order_id, captured_at,
        attribution_expires_at, risk_codes
      ) values (
        ${organization.id}, ${group.id}, ${version.id}, ${advocate.id},
        ${friendCustomer.id}, ${connection.id}, ${event.id},
        ${`order-${suffix}`}, now() - interval '15 days',
        now() + interval '15 days', array[]::text[]
      ) returning id, public_id
    `;
    await sql`
      insert into loyalty.referral_attribution_transitions (
        organization_id, attribution_id, from_state, to_state, reason_code,
        actor_kind, idempotency_key
      ) values (
        ${organization.id}, ${attribution.id}, null, 'captured',
        'first_eligible_attribution', 'system', ${`event:${event.public_id}`}
      )
    `;
    await sql`
      insert into loyalty_private.referral_qualification_facts (
        organization_id, attribution_id, canonical_event_id, evaluation_id,
        order_status, eligible_spend_minor, is_new_customer, decision,
        qualified_at, cooling_ends_at
      ) values (
        ${organization.id}, ${attribution.id}, ${event.id}, ${evaluation.id},
        'completed', 5000, true, 'eligible', ${event.occurred_at},
        now() - interval '1 minute'
      )
    `;
    await sql`
      insert into loyalty.referral_attribution_transitions (
        organization_id, attribution_id, from_state, to_state, reason_code,
        actor_kind, idempotency_key
      ) values (
        ${organization.id}, ${attribution.id}, 'captured', 'cooling',
        'qualification_passed', 'system', ${`qualification:${event.public_id}`}
      )
    `;
    return {
      organizationId: organization.id,
      attributionPublicId: attribution.public_id,
    };
  });

  let releaseFirst;
  let markFirstClaimed;
  const firstClaimed = new Promise((resolve) => {
    markFirstClaimed = resolve;
  });
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const firstWork = first.begin(async (sql) => {
    const jobs = await sql`
      select * from loyalty_private.claim_due_referral_reward_jobs_v1(
        ${`worker-first-${suffix}`}, 25, 60
      )
    `;
    if (jobs.length !== 1) {
      throw new Error(`first worker claimed ${jobs.length} referral jobs`);
    }
    markFirstClaimed();
    await firstGate;
    const issues = await sql`
      select * from loyalty_private.issue_referral_reward_job_v1(
        ${jobs[0].job_id}, ${`worker-first-${suffix}`}
      )
    `;
    return { job: jobs[0], issue: issues[0] };
  });

  await firstClaimed;
  const competingJobs = await second`
    select * from loyalty_private.claim_due_referral_reward_jobs_v1(
      ${`worker-second-${suffix}`}, 25, 60
    )
  `;
  if (competingJobs.length !== 0) {
    throw new Error("competing worker claimed an already locked referral job");
  }
  releaseFirst();
  const firstResult = await firstWork;
  if (
    firstResult.job.attribution_id !== fixture.attributionPublicId ||
    firstResult.issue?.outcome !== "created" ||
    firstResult.issue?.state !== "qualified"
  ) {
    throw new Error("first worker did not atomically qualify referral value");
  }

  const [state] = await admin`
    select
      (select count(*)::integer
       from loyalty_private.referral_reward_issuances
       where organization_id = ${fixture.organizationId}) as issuances,
      (select count(*)::integer
       from loyalty.ledger_transactions
       where organization_id = ${fixture.organizationId}) as ledger_transactions,
      (select count(*)::integer
       from loyalty_private.tier_qualification_facts
       where organization_id = ${fixture.organizationId}
         and fact_kind in ('referral', 'points_adjustment')) as tier_facts,
      job.state as job_state,
      transition.to_state as referral_state
    from loyalty_private.referral_reward_jobs as job
    join lateral (
      select history.to_state
      from loyalty.referral_attribution_transitions as history
      where history.organization_id = job.organization_id
        and history.attribution_id = job.attribution_id
      order by history.id desc limit 1
    ) as transition on true
    where job.organization_id = ${fixture.organizationId}
  `;
  if (
    state.issuances !== 1 ||
    state.ledger_transactions !== 4 ||
    state.tier_facts !== 2 ||
    state.job_state !== "completed" ||
    state.referral_state !== "qualified"
  ) {
    throw new Error(
      `referral reward race did not reconcile: ${JSON.stringify(state)}`,
    );
  }

  console.log(
    "Referral reward concurrency probe passed: one of two workers claimed the due job, both wallet awards/releases committed atomically, and job, tier, ledger, and referral state reconcile.",
  );
} finally {
  await Promise.allSettled([admin.end(), first.end(), second.end()]);
}
