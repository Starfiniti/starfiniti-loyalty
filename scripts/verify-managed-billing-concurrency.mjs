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

const eventAt = new Date(Date.now() + 1_000);
const conflictEventAt = new Date(Date.now() + 2_000);
const currentPeriodEnd = new Date(Date.now() + 86_400_000);

function recordState(
  sql,
  organizationId,
  accountId,
  eventId,
  state,
  eventTime,
  idempotencyKey,
) {
  return sql`
    select loyalty_private.record_managed_billing_state_v1(
      ${organizationId}, ${accountId}, ${`sub_BillingRace${suffix}`},
      ${eventId}, ${state}, ${eventTime}, ${currentPeriodEnd}, null, null,
      'worker:billing-concurrency',
      'Exercise the managed billing concurrency fence',
      ${idempotencyKey}
    ) as public_id
  `;
}

try {
  await admin`
    select loyalty_private.set_deployment_mode(
      'managed', 1, 'probe:billing-concurrency',
      'Enable isolated managed billing concurrency probe',
      statement_timestamp() - interval '1 second'
    )
  `;
  managedModeSet = true;

  const [organization] = await admin`
    insert into loyalty.organizations (slug, name)
    values (${`billing-race-${suffix}`}, 'Billing Concurrency Probe')
    returning id, public_id
  `;
  const [account] = await admin`
    select loyalty_private.record_managed_billing_account_v1(
      ${organization.public_id}, ${`cus_BillingRace${suffix}`}, false,
      'probe:billing-concurrency',
      'Create isolated managed billing concurrency account',
      statement_timestamp(), ${randomUUID()}
    ) as public_id
  `;

  const replayEventId = `evt_BillingReplay${suffix}`;
  const exactReplay = await Promise.allSettled([
    recordState(
      first,
      organization.public_id,
      account.public_id,
      replayEventId,
      "active",
      eventAt,
      randomUUID(),
    ),
    recordState(
      second,
      organization.public_id,
      account.public_id,
      replayEventId,
      "active",
      eventAt,
      randomUUID(),
    ),
  ]);
  if (
    exactReplay.some((result) => result.status !== "fulfilled") ||
    exactReplay[0].value[0]?.public_id !== exactReplay[1].value[0]?.public_id
  ) {
    throw new Error(
      `exact provider replay diverged: ${JSON.stringify(exactReplay)}`,
    );
  }

  const conflictEventId = `evt_BillingConflict${suffix}`;
  const changedReplay = await Promise.allSettled([
    recordState(
      first,
      organization.public_id,
      account.public_id,
      conflictEventId,
      "active",
      conflictEventAt,
      randomUUID(),
    ),
    recordState(
      second,
      organization.public_id,
      account.public_id,
      conflictEventId,
      "suspended",
      conflictEventAt,
      randomUUID(),
    ),
  ]);
  const changedSuccesses = changedReplay.filter(
    (result) => result.status === "fulfilled",
  );
  const changedFailures = changedReplay.filter(
    (result) =>
      result.status === "rejected" &&
      result.reason?.code === "23505" &&
      result.reason?.message === "managed billing provider event conflict",
  );

  const [state] = await admin`
    select
      (select count(*)::integer
       from loyalty_private.managed_billing_state_revisions
       where organization_id = ${organization.id}) as revisions,
      (select count(*)::integer
       from loyalty_private.managed_billing_state_revisions
       where organization_id = ${organization.id}
         and provider_event_id = ${replayEventId}) as replay_revisions,
      (select count(*)::integer
       from loyalty_private.managed_billing_state_revisions
       where organization_id = ${organization.id}
         and provider_event_id = ${conflictEventId}) as conflict_revisions,
      (select count(*)::integer
       from loyalty.ledger_transactions
       where organization_id = ${organization.id}) as ledger_transactions
  `;

  if (
    changedSuccesses.length !== 1 ||
    changedFailures.length !== 1 ||
    state.revisions !== 2 ||
    state.replay_revisions !== 1 ||
    state.conflict_revisions !== 1 ||
    state.ledger_transactions !== 0
  ) {
    throw new Error(
      `managed billing concurrency did not reconcile: ${JSON.stringify({ changedReplay, state })}`,
    );
  }

  console.log(
    "Managed billing concurrency probe passed: exact provider-event races returned one revision, changed races failed one caller closed, and no loyalty ledger value changed.",
  );
} finally {
  if (managedModeSet) {
    await admin`
      select loyalty_private.set_deployment_mode(
        'self_hosted', 1, 'probe:billing-concurrency',
        'Restore self-hosted mode after billing concurrency probe',
        statement_timestamp()
      )
    `.catch(() => undefined);
  }
  await Promise.allSettled([admin.end(), first.end(), second.end()]);
}
