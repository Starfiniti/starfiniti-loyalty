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

const modeEffectiveAt = new Date(Date.now() + 60_000);
const effectiveAt = new Date(modeEffectiveAt.getTime() + 1_000);
const restoreEffectiveAt = new Date(modeEffectiveAt.getTime() + 10_000);

function recordPolicy(sql, graceDays, idempotencyKey) {
  return sql`
    select loyalty_private.record_managed_billing_delinquency_policy_v1(
      ${graceDays}, 'probe:commercial-policy',
      'owner:commercial-approver',
      'Exercise concurrent approved delinquency policy recording',
      ${effectiveAt}, null, ${idempotencyKey}
    ) as public_id
  `;
}

function recordContract(sql, organizationId, decision, idempotencyKey) {
  return sql`
    select loyalty_private.record_managed_billing_manual_contract_v1(
      ${organizationId}, ${decision}, 'probe:commercial-contract',
      'owner:commercial-approver',
      'Exercise concurrent approved manual contract recording',
      ${effectiveAt}, null, ${idempotencyKey}
    ) as public_id
  `;
}

function expectExactConvergence(results, label) {
  if (
    results.some((result) => result.status !== "fulfilled") ||
    results[0].value[0]?.public_id !== results[1].value[0]?.public_id
  ) {
    throw new Error(`${label} diverged: ${JSON.stringify(results)}`);
  }
}

function expectOneConflict(results, message, label) {
  const successes = results.filter((result) => result.status === "fulfilled");
  const conflicts = results.filter(
    (result) =>
      result.status === "rejected" &&
      result.reason?.code === "23505" &&
      result.reason?.message === message,
  );
  if (successes.length !== 1 || conflicts.length !== 1) {
    throw new Error(
      `${label} did not fail one caller closed: ${JSON.stringify(results)}`,
    );
  }
}

try {
  await admin`
    select loyalty_private.set_deployment_mode(
      'managed', 1, 'probe:commercial-policy',
      'Enable isolated commercial policy concurrency probe',
      ${modeEffectiveAt}
    )
  `;
  managedModeSet = true;

  const [organization] = await admin`
    insert into loyalty.organizations (slug, name)
    values (${`commercial-policy-race-${suffix}`}, 'Commercial Policy Race')
    returning id, public_id
  `;

  const exactPolicies = await Promise.allSettled([
    recordPolicy(first, 7, randomUUID()),
    recordPolicy(second, 7, randomUUID()),
  ]);
  expectExactConvergence(exactPolicies, "exact delinquency policy retry");

  const changedPolicyAt = new Date(effectiveAt.getTime() + 1_000);
  const changedPolicies = await Promise.allSettled([
    first`
      select loyalty_private.record_managed_billing_delinquency_policy_v1(
        14, 'probe:commercial-policy', 'owner:commercial-approver',
        'Exercise concurrent approved delinquency policy recording',
        ${changedPolicyAt}, null, ${randomUUID()}
      ) as public_id
    `,
    second`
      select loyalty_private.record_managed_billing_delinquency_policy_v1(
        21, 'probe:commercial-policy', 'owner:commercial-approver',
        'Exercise concurrent approved delinquency policy recording',
        ${changedPolicyAt}, null, ${randomUUID()}
      ) as public_id
    `,
  ]);
  expectOneConflict(
    changedPolicies,
    "managed billing delinquency policy effective-time conflict",
    "changed delinquency policy retry",
  );

  const exactContracts = await Promise.allSettled([
    recordContract(first, organization.public_id, "allow_growth", randomUUID()),
    recordContract(
      second,
      organization.public_id,
      "allow_growth",
      randomUUID(),
    ),
  ]);
  expectExactConvergence(exactContracts, "exact manual contract retry");

  const changedContractAt = new Date(effectiveAt.getTime() + 1_000);
  const changedContracts = await Promise.allSettled([
    first`
      select loyalty_private.record_managed_billing_manual_contract_v1(
        ${organization.public_id}, 'allow_growth',
        'probe:commercial-contract', 'owner:commercial-approver',
        'Exercise concurrent approved manual contract recording',
        ${changedContractAt}, null, ${randomUUID()}
      ) as public_id
    `,
    second`
      select loyalty_private.record_managed_billing_manual_contract_v1(
        ${organization.public_id}, 'defer_to_provider',
        'probe:commercial-contract', 'owner:commercial-approver',
        'Exercise concurrent approved manual contract recording',
        ${changedContractAt}, null, ${randomUUID()}
      ) as public_id
    `,
  ]);
  expectOneConflict(
    changedContracts,
    "managed billing manual contract effective-time conflict",
    "changed manual contract retry",
  );

  const [state] = await admin`
    select
      (select count(*)::integer
       from loyalty_private.managed_billing_delinquency_policy_versions
       where actor_reference = 'probe:commercial-policy') as policies,
      (select count(*)::integer
       from loyalty_private.managed_billing_manual_contract_versions
       where organization_id = ${organization.id}) as contracts,
      (select count(*)::integer
       from loyalty.ledger_transactions
       where organization_id = ${organization.id}) as ledger_transactions
  `;

  if (
    state.policies !== 2 ||
    state.contracts !== 2 ||
    state.ledger_transactions !== 0
  ) {
    throw new Error(
      `commercial policy concurrency did not reconcile: ${JSON.stringify(state)}`,
    );
  }

  console.log(
    "Managed billing commercial-policy concurrency probe passed: exact policy and contract retries converged, changed retries failed one caller closed, and no loyalty ledger value changed.",
  );
} finally {
  if (managedModeSet) {
    await admin`
      select loyalty_private.set_deployment_mode(
        'self_hosted', 1, 'probe:commercial-policy',
        'Restore self-hosted mode after commercial policy probe',
        ${restoreEffectiveAt}
      )
    `.catch(() => undefined);
  }
  await Promise.allSettled([admin.end(), first.end(), second.end()]);
}
