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

const modeEffectiveAt = new Date();
const accountEffectiveAt = new Date(modeEffectiveAt.getTime() + 1);
const eventAt = new Date(modeEffectiveAt.getTime() + 1_000);
const signatureAt = new Date();
const periodEnd = new Date(Date.now() + 86_400_000);
const customerId = `cus_WebhookRace${suffix}`;
const subscriptionId = `sub_WebhookRace${suffix}`;

function acceptEvent(sql, eventId, state, digestByte) {
  return sql`
    select receipt_public_id, outcome
    from loyalty_private.accept_managed_billing_webhook_v1(
      ${eventId}, 'customer.subscription.updated', false,
      ${subscriptionId}, ${customerId}, ${subscriptionId}, ${state},
      ${eventAt}, ${periodEnd}, null, ${signatureAt},
      ${Buffer.alloc(32, digestByte)}
    )
  `;
}

try {
  await admin`
    select loyalty_private.set_deployment_mode(
      'managed', 1, 'probe:billing-webhook-concurrency',
      'Enable isolated billing webhook concurrency probe',
      ${modeEffectiveAt}
    )
  `;
  managedModeSet = true;

  const [organization] = await admin`
    insert into loyalty.organizations (slug, name)
    values (${`billing-webhook-race-${suffix}`}, 'Billing Webhook Race Probe')
    returning id, public_id
  `;
  const [account] = await admin`
    select loyalty_private.record_managed_billing_account_v1(
      ${organization.public_id}, ${customerId}, false,
      'probe:billing-webhook-concurrency',
      'Create isolated billing webhook concurrency account',
      ${accountEffectiveAt}, ${randomUUID()}
    ) as public_id
  `;
  await admin`
    insert into loyalty.organization_entitlements (
      organization_id, catalogue_version, capability_key, state, source,
      actor_reference, reason, effective_from
    ) values (
      ${organization.id}, 1, 'managed.billing', 'enabled', 'canary',
      'probe:billing-webhook-concurrency',
      'Enable isolated billing webhook concurrency account',
      ${accountEffectiveAt}
    )
  `;

  const replayEventId = `evt_WebhookReplay${suffix}`;
  const exactReplay = await Promise.allSettled([
    acceptEvent(first, replayEventId, "active", 17),
    acceptEvent(second, replayEventId, "active", 17),
  ]);
  if (
    exactReplay.some((result) => result.status !== "fulfilled") ||
    exactReplay[0].value[0]?.receipt_public_id !==
      exactReplay[1].value[0]?.receipt_public_id
  ) {
    throw new Error(
      `exact billing webhook replay diverged: ${JSON.stringify(exactReplay)}`,
    );
  }

  const conflictEventId = `evt_WebhookConflict${suffix}`;
  const changedReplay = await Promise.allSettled([
    acceptEvent(first, conflictEventId, "active", 34),
    acceptEvent(second, conflictEventId, "past_due", 51),
  ]);
  const changedSuccesses = changedReplay.filter(
    (result) => result.status === "fulfilled",
  );
  const changedFailures = changedReplay.filter(
    (result) =>
      result.status === "rejected" &&
      result.reason?.code === "23505" &&
      result.reason?.message === "managed billing webhook event conflict",
  );
  if (changedSuccesses.length !== 1 || changedFailures.length !== 1) {
    throw new Error(
      `changed billing webhook replay did not fail closed: ${JSON.stringify(changedReplay)}`,
    );
  }

  const [firstClaims, secondClaims] = await Promise.all([
    first`
      select receipt_public_id, lease_token, event_type, attempt_number
      from loyalty_private.claim_managed_billing_webhooks_v1(
        'probe:webhook-race-a', 1, 60
      )
    `,
    second`
      select receipt_public_id, lease_token, event_type, attempt_number
      from loyalty_private.claim_managed_billing_webhooks_v1(
        'probe:webhook-race-b', 1, 60
      )
    `,
  ]);
  const claims = [
    { ...firstClaims[0], worker: "probe:webhook-race-a" },
    { ...secondClaims[0], worker: "probe:webhook-race-b" },
  ];
  if (
    claims.some(
      (claim) =>
        !claim.receipt_public_id ||
        !claim.lease_token ||
        claim.attempt_number !== 1,
    ) ||
    claims[0].receipt_public_id === claims[1].receipt_public_id
  ) {
    throw new Error(
      `billing webhook claims diverged: ${JSON.stringify(claims)}`,
    );
  }

  const processed = await Promise.all(
    claims.map(
      (claim, index) =>
        (index === 0 ? first : second)`
        select outcome, state_revision_public_id
        from loyalty_private.process_managed_billing_webhook_v1(
          ${claim.receipt_public_id}, ${claim.lease_token}, ${claim.worker}
        )
      `,
    ),
  );
  if (
    processed.some(
      (rows) =>
        rows[0]?.outcome !== "state_recorded" ||
        !rows[0]?.state_revision_public_id,
    )
  ) {
    throw new Error(
      `billing webhook processing diverged: ${JSON.stringify(processed)}`,
    );
  }

  const [state] = await admin`
    select
      (select count(*)::integer
       from loyalty_private.managed_billing_webhook_events
       where organization_id = ${organization.id}) as events,
      (select count(*)::integer
       from loyalty_private.managed_billing_webhook_jobs
       where organization_id = ${organization.id}
         and state = 'completed') as jobs,
      (select count(*)::integer
       from loyalty_private.managed_billing_webhook_attempts
       where organization_id = ${organization.id}
         and outcome = 'state_recorded') as attempts,
      (select count(*)::integer
       from loyalty_private.managed_billing_state_revisions
       where organization_id = ${organization.id}) as revisions,
      (select count(*)::integer
       from loyalty.ledger_transactions
       where organization_id = ${organization.id}) as ledger_transactions
  `;
  if (
    !account.public_id ||
    state.events !== 2 ||
    state.jobs !== 2 ||
    state.attempts !== 2 ||
    state.revisions !== 2 ||
    state.ledger_transactions !== 0
  ) {
    throw new Error(
      `billing webhook concurrency did not reconcile: ${JSON.stringify(state)}`,
    );
  }

  console.log(
    "Managed billing webhook concurrency probe passed: exact Stripe event races converged, changed replays failed one caller closed, two workers leased distinct receipts, and no loyalty ledger value changed.",
  );
} finally {
  if (managedModeSet) {
    await admin`
      select loyalty_private.set_deployment_mode(
        'self_hosted', 1, 'probe:billing-webhook-concurrency',
        'Restore self-hosted mode after billing webhook concurrency probe',
        statement_timestamp()
      )
    `.catch(() => undefined);
  }
  await Promise.allSettled([admin.end(), first.end(), second.end()]);
}
