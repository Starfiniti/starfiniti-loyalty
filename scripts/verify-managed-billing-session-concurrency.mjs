import { randomUUID } from "node:crypto";

import postgres from "postgres";

const connectionString =
  process.env.SUPABASE_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const admin = postgres(connectionString, { max: 1, onnotice: () => {} });
const first = postgres(connectionString, { max: 1, onnotice: () => {} });
const second = postgres(connectionString, { max: 1, onnotice: () => {} });
let managedModeSet = false;

const actorId = randomUUID();
const operationId = randomUUID();
const attemptId = randomUUID();
const sessionAttemptId = randomUUID();
const modeAt = new Date();
const enabledAt = new Date(modeAt.getTime() + 1);

function reserve(
  sql,
  organizationId,
  planId,
  targetOperationId,
  checkedAt = new Date(),
) {
  return sql`
    select deployment_mode, operation_id, operation_state,
      provider_customer_id, provider_price_id, live_mode,
      customer_idempotency_key, session_idempotency_key
    from loyalty_private.reserve_managed_billing_session_v2(
      ${actorId}, ${organizationId}, 'checkout', ${planId},
      ${targetOperationId}, ${checkedAt}
    )
  `;
}

function recordSession(sql, targetOperationId) {
  return sql`
    select operation_state
    from loyalty_private.record_managed_billing_session_attempt_v1(
      ${actorId}, ${targetOperationId}, ${sessionAttemptId}, 'session',
      'succeeded', ${`cs_test_BillingSessionRace${suffix}`},
      'session_created', statement_timestamp()
    )
  `;
}

function recordCustomer(sql, targetOperationId) {
  return sql`
    select operation_state, billing_account_public_id
    from loyalty_private.record_managed_billing_session_attempt_v1(
      ${actorId}, ${targetOperationId}, ${attemptId}, 'customer',
      'succeeded', ${`cus_BillingSessionRace${suffix}`},
      'customer_created', statement_timestamp()
    )
  `;
}

try {
  await admin`
    select loyalty_private.set_deployment_mode(
      'managed', 1, 'probe:billing-session-concurrency',
      'Enable isolated managed billing session concurrency probe', ${modeAt}
    )
  `;
  managedModeSet = true;

  await admin`
    insert into auth.users (id, email)
    values (${actorId}, ${`billing-session-${suffix}@example.test`})
  `;
  const [organization] = await admin`
    insert into loyalty.organizations (slug, name)
    values (${`billing-session-race-${suffix}`}, 'Billing Session Race Probe')
    returning id, public_id
  `;
  await admin`
    insert into loyalty.organization_memberships (organization_id, user_id, role)
    values (${organization.id}, ${actorId}, 'owner')
  `;
  await admin`
    select loyalty_private.set_organization_entitlement(
      ${organization.public_id}, 'managed.billing', 'enabled', null,
      'canary', 'probe:billing-session-concurrency',
      'Enable isolated managed billing session concurrency tenant',
      ${enabledAt}, null
    )
  `;
  await admin`
    select loyalty_private.record_managed_billing_provider_configuration_v1(
      false, true, ${enabledAt}, 'probe:billing-session-concurrency',
      'Enable isolated Stripe test-mode session provider', ${randomUUID()}
    )
  `;
  const firstPlanId = randomUUID();
  const secondPlanId = randomUUID();
  await admin`
    select loyalty_private.record_managed_billing_plan_v1(
      ${firstPlanId}, 1, ${`race_a_${suffix}`}, 'Race A',
      'First isolated concurrency plan', 'EUR', 4900, 'month', 1, 0,
      ${`price_BillingSessionRaceA${suffix}`}, false, true, ${enabledAt},
      'probe:billing-session-concurrency',
      'Configure first isolated concurrency plan', ${randomUUID()}
    )
  `;
  await admin`
    select loyalty_private.record_managed_billing_plan_v1(
      ${secondPlanId}, 1, ${`race_b_${suffix}`}, 'Race B',
      'Second isolated concurrency plan', 'EUR', 7900, 'month', 1, 0,
      ${`price_BillingSessionRaceB${suffix}`}, false, true, ${enabledAt},
      'probe:billing-session-concurrency',
      'Configure second isolated concurrency plan', ${randomUUID()}
    )
  `;

  const exactReservations = await Promise.allSettled([
    reserve(first, organization.public_id, firstPlanId, operationId),
    reserve(second, organization.public_id, firstPlanId, operationId),
  ]);
  if (
    exactReservations.some((result) => result.status !== "fulfilled") ||
    exactReservations[0].value[0]?.operation_id !==
      exactReservations[1].value[0]?.operation_id ||
    exactReservations[0].value[0]?.operation_state !== "customer_required" ||
    exactReservations[1].value[0]?.operation_state !== "customer_required"
  ) {
    throw new Error(
      `exact session reservation race diverged: ${JSON.stringify(exactReservations)}`,
    );
  }

  const exactCustomerResults = await Promise.allSettled([
    recordCustomer(first, operationId),
    recordCustomer(second, operationId),
  ]);
  if (
    exactCustomerResults.some((result) => result.status !== "fulfilled") ||
    exactCustomerResults.some(
      (result) => result.value[0]?.operation_state !== "ready",
    )
  ) {
    throw new Error(
      `exact customer result race diverged: ${JSON.stringify(exactCustomerResults)}`,
    );
  }

  const exactSessionResults = await Promise.allSettled([
    recordSession(first, operationId),
    recordSession(second, operationId),
  ]);
  if (
    exactSessionResults.some((result) => result.status !== "fulfilled") ||
    exactSessionResults.some(
      (result) => result.value[0]?.operation_state !== "completed",
    )
  ) {
    throw new Error(
      `exact session result race diverged: ${JSON.stringify(exactSessionResults)}`,
    );
  }

  const firstCompetingOperationId = randomUUID();
  const secondCompetingOperationId = randomUUID();
  const afterReplayWindow = new Date(Date.now() + 25 * 60 * 60 * 1000);
  const changedReservations = await Promise.allSettled([
    reserve(
      first,
      organization.public_id,
      firstPlanId,
      firstCompetingOperationId,
      afterReplayWindow,
    ),
    reserve(
      second,
      organization.public_id,
      secondPlanId,
      secondCompetingOperationId,
      afterReplayWindow,
    ),
  ]);
  const changedSuccesses = changedReservations.filter(
    (result) => result.status === "fulfilled",
  );
  const changedFailures = changedReservations.filter(
    (result) =>
      result.status === "rejected" &&
      result.reason?.code === "55000" &&
      result.reason?.message === "managed billing checkout already in progress",
  );

  const [state] = await admin`
    select
      (select count(*)::integer
       from loyalty_private.managed_billing_session_operations
       where organization_id = ${organization.id}) as operations,
      (select count(*)::integer
       from loyalty_private.managed_billing_session_attempts
       where organization_id = ${organization.id}) as attempts,
      (select count(*)::integer
       from loyalty_private.managed_billing_account_versions
       where organization_id = ${organization.id}) as accounts,
      (select count(*)::integer from loyalty.ledger_transactions
       where organization_id = ${organization.id}) as ledger_transactions
  `;
  if (
    changedSuccesses.length !== 1 ||
    changedFailures.length !== 1 ||
    state.operations !== 2 ||
    state.attempts !== 2 ||
    state.accounts !== 1 ||
    state.ledger_transactions !== 0
  ) {
    throw new Error(
      `managed billing session concurrency did not reconcile: ${JSON.stringify({ changedReservations, state })}`,
    );
  }

  console.log(
    "Managed billing session concurrency probe passed: exact reservations, customer bindings, and session results converged; two distinct post-replay-window checkouts produced one winner and one fail-closed conflict; and no loyalty ledger value changed.",
  );
} finally {
  if (managedModeSet) {
    await admin`
      select loyalty_private.set_deployment_mode(
        'self_hosted', 1, 'probe:billing-session-concurrency',
        'Restore self-hosted mode after billing session concurrency probe',
        statement_timestamp()
      )
    `.catch(() => undefined);
  }
  await Promise.allSettled([admin.end(), first.end(), second.end()]);
}
