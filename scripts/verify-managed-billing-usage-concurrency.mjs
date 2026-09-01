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

const modeAt = new Date();
const enabledAt = new Date(modeAt.getTime() + 1);
const correctionAt = new Date(modeAt.getTime() + 1_000);
const exactCorrectionId = randomUUID();
const changedCorrectionId = randomUUID();

function claim(sql, workerId) {
  return sql`
    select dispatch_public_id, lease_token, claim_sequence::text
    from loyalty_private.claim_managed_billing_usage_dispatches_v2(
      ${workerId}, 1, 60, statement_timestamp()
    )
  `;
}

function correct(sql, sourceFactId, operationId, quantity) {
  return sql`
    select loyalty_private.record_managed_billing_usage_correction_v1(
      ${sourceFactId}, ${quantity}, 'probe:billing-usage-concurrency',
      'Append isolated usage correction during concurrency probe',
      ${correctionAt}, ${operationId}
    ) as public_id
  `;
}

try {
  await admin`
    select loyalty_private.set_deployment_mode(
      'managed', 1, 'probe:billing-usage-concurrency',
      'Enable isolated managed billing usage concurrency probe', ${modeAt}
    )
  `;
  managedModeSet = true;
  const [organization] = await admin`
    insert into loyalty.organizations (slug, name)
    values (${`billing-usage-race-${suffix}`}, 'Billing Usage Race Probe')
    returning id, public_id
  `;
  await admin`
    select loyalty_private.set_organization_entitlement(
      ${organization.public_id}, 'managed.billing', 'enabled', null,
      'canary', 'probe:billing-usage-concurrency',
      'Enable isolated managed billing usage tenant', ${enabledAt}, null
    )
  `;
  await admin`
    select loyalty_private.record_managed_billing_provider_configuration_v1(
      false, true, ${enabledAt}, 'probe:billing-usage-concurrency',
      'Enable isolated Stripe test-mode usage provider', ${randomUUID()}
    )
  `;
  await admin`
    select loyalty_private.record_managed_billing_account_v1(
      ${organization.public_id}, ${`cus_BillingUsageRace${suffix}`}, false,
      'probe:billing-usage-concurrency',
      'Bind isolated managed usage concurrency account', ${enabledAt},
      ${randomUUID()}
    )
  `;
  await admin`
    select loyalty_private.record_managed_billing_usage_meter_v1(
      'orders', 1, ${`starfiniti_orders_${suffix}`}, false, true, ${enabledAt},
      'probe:billing-usage-concurrency',
      'Configure isolated managed order usage meter', ${randomUUID()}
    )
  `;
  const [fact] = await admin`
    insert into loyalty_private.managed_billing_usage_facts (
      organization_id, meter_key, source_kind, source_subject_public_id,
      source_evidence_public_id, source_reference_sha256, quantity,
      usage_period_start, usage_period_end, occurred_at, actor_reference,
      reason, fact_sha256
    ) values (
      ${organization.id}, 'orders', 'commerce_order', ${randomUUID()},
      ${randomUUID()}, digest(convert_to(${`usage-source-${suffix}`}, 'UTF8'), 'sha256'),
      1, date_trunc('month', statement_timestamp(), 'UTC'),
      date_trunc('month', statement_timestamp(), 'UTC') + interval '1 month',
      statement_timestamp(), 'probe:billing-usage-concurrency',
      'Insert isolated immutable usage source fact',
      digest(convert_to(${`usage-fact-${suffix}`}, 'UTF8'), 'sha256')
    ) returning public_id
  `;

  const claimResults = await Promise.all([
    claim(first, `billing-usage-a-${suffix}`),
    claim(second, `billing-usage-b-${suffix}`),
  ]);
  const claimed = claimResults.flat();
  if (claimed.length !== 1 || claimed[0]?.claim_sequence !== "1") {
    throw new Error(
      `usage claim race diverged: ${JSON.stringify(claimResults)}`,
    );
  }

  const exactCorrections = await Promise.all([
    correct(first, fact.public_id, exactCorrectionId, 1),
    correct(second, fact.public_id, exactCorrectionId, 1),
  ]);
  if (exactCorrections[0][0]?.public_id !== exactCorrections[1][0]?.public_id) {
    throw new Error(
      `exact usage correction race diverged: ${JSON.stringify(exactCorrections)}`,
    );
  }

  const changedCorrections = await Promise.allSettled([
    correct(first, fact.public_id, changedCorrectionId, -1),
    correct(second, fact.public_id, changedCorrectionId, 1),
  ]);
  const changedSuccesses = changedCorrections.filter(
    (result) => result.status === "fulfilled",
  );
  const changedFailures = changedCorrections.filter(
    (result) =>
      result.status === "rejected" &&
      result.reason?.code === "23505" &&
      result.reason?.message ===
        "managed billing usage correction idempotency conflict",
  );

  const [state] = await admin`
    select
      (select count(*)::integer
       from loyalty_private.managed_billing_usage_facts
       where organization_id = ${organization.id}) as facts,
      (select count(*)::integer
       from loyalty_private.managed_billing_usage_dispatches
       where organization_id = ${organization.id}) as dispatches,
      (select count(distinct provider_identifier)::integer
       from loyalty_private.managed_billing_usage_dispatches
       where organization_id = ${organization.id}) as identifiers,
      (select count(*)::integer from loyalty.ledger_transactions
       where organization_id = ${organization.id}) as ledger_transactions
  `;
  if (
    changedSuccesses.length !== 1 ||
    changedFailures.length !== 1 ||
    state.facts !== 3 ||
    state.dispatches !== 1 ||
    state.identifiers !== 1 ||
    state.ledger_transactions !== 0
  ) {
    throw new Error(
      `managed billing usage concurrency did not reconcile: ${JSON.stringify({ changedCorrections, state })}`,
    );
  }

  console.log(
    "Managed billing usage concurrency probe passed: one fact produced one lease and permanent identifier, exact corrections converged, changed correction reuse failed one caller closed, and no loyalty ledger value changed.",
  );
} finally {
  if (managedModeSet) {
    await admin`
      select loyalty_private.set_deployment_mode(
        'self_hosted', 1, 'probe:billing-usage-concurrency',
        'Restore self-hosted mode after billing usage concurrency probe',
        statement_timestamp()
      )
    `.catch(() => undefined);
  }
  await Promise.allSettled([admin.end(), first.end(), second.end()]);
}
