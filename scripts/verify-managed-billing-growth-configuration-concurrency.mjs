import { randomUUID } from "node:crypto";

import postgres from "postgres";

const connectionString =
  process.env.SUPABASE_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const userId = randomUUID();
const idempotencyKey = `growth-programme:${suffix}`;
const correlationId = randomUUID();
const modeAt = new Date();
const currentPeriodEnd = new Date(modeAt.getTime() + 86_400_000);
const activeAt = new Date(modeAt.getTime() + 1);
const suspendedAt = new Date(modeAt.getTime() + 2);
const recoveredAt = new Date(modeAt.getTime() + 3);
const admin = postgres(connectionString, { max: 1, onnotice: () => {} });
const first = postgres(connectionString, { max: 1, onnotice: () => {} });
const second = postgres(connectionString, { max: 1, onnotice: () => {} });
let managedModeSet = false;

async function assumeOwner(sql) {
  await sql`set local role authenticated`;
  await sql`select set_config('request.jwt.claim.sub', ${userId}, true)`;
  await sql`select set_config('request.jwt.claim.role', 'authenticated', true)`;
}

function createProgramme(sql, groupId, slug, name, key, correlation) {
  return sql`
    select * from loyalty.create_programme_command(
      ${groupId}, ${slug}, ${name}, ${key}, ${correlation}
    )
  `;
}

try {
  await admin`
    select loyalty_private.set_deployment_mode(
      'managed', 1, 'probe:growth-configuration',
      'Enable isolated managed growth concurrency probe', ${modeAt}
    )
  `;
  managedModeSet = true;

  const fixture = await admin.begin(async (sql) => {
    await sql`
      insert into auth.users (id, email)
      values (${userId}, ${`growth-${suffix}@example.test`})
    `;
    const [organization] = await sql`
      insert into loyalty.organizations (slug, name)
      values (${`growth-race-${suffix}`}, 'Growth Configuration Race Probe')
      returning id, public_id
    `;
    await sql`
      insert into loyalty.organization_memberships (
        organization_id, user_id, role
      ) values (${organization.id}, ${userId}, 'owner')
    `;
    const [group] = await sql`
      insert into loyalty.programme_groups (organization_id, slug, name)
      values (${organization.id}, 'growth-race', 'Growth Race Group')
      returning public_id
    `;
    const [entitlement] = await sql`
      select loyalty_private.set_organization_entitlement(
        ${organization.public_id}, 'programme.v2', 'enabled', null,
        'manual_override', 'probe:growth-configuration',
        'Enable programme authoring for the concurrency probe',
        ${modeAt}, null
      ) as public_id
    `;
    await sql`
      select loyalty_private.set_organization_entitlement(
        ${organization.public_id}, 'managed.billing', 'enabled', null,
        'canary', 'probe:growth-configuration',
        'Enable commercial enforcement for the concurrency probe',
        ${modeAt}, null
      )
    `;
    const [account] = await sql`
      select loyalty_private.record_managed_billing_account_v1(
        ${organization.public_id}, ${`cus_GrowthRace${suffix}`}, false,
        'probe:growth-configuration',
        'Create isolated growth concurrency billing account', ${modeAt},
        ${randomUUID()}
      ) as public_id
    `;
    await sql`
      select loyalty_private.record_managed_billing_state_v1(
        ${organization.public_id}, ${account.public_id},
        ${`sub_GrowthRace${suffix}`}, ${`evt_GrowthActive${suffix}`},
        'active', ${activeAt}, ${currentPeriodEnd}, null, null,
        'worker:growth-configuration',
        'Open managed growth for the concurrency probe', ${randomUUID()}
      )
    `;
    return {
      organizationId: organization.id,
      organizationPublicId: organization.public_id,
      programmeGroupPublicId: group.public_id,
      billingAccountPublicId: account.public_id,
      entitlementPublicId: entitlement.public_id,
    };
  });

  let releaseFirst;
  let markFirstComplete;
  const firstComplete = new Promise((resolve) => {
    markFirstComplete = resolve;
  });
  const commitGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });

  const firstCommand = first.begin(async (sql) => {
    await assumeOwner(sql);
    const rows = await createProgramme(
      sql,
      fixture.programmeGroupPublicId,
      `race-${suffix}`,
      "Growth Race Programme",
      idempotencyKey,
      correlationId,
    );
    markFirstComplete();
    await commitGate;
    return rows;
  });

  await firstComplete;
  const competingCommand = second.begin(async (sql) => {
    await assumeOwner(sql);
    return createProgramme(
      sql,
      fixture.programmeGroupPublicId,
      `race-${suffix}`,
      "Growth Race Programme",
      idempotencyKey,
      correlationId,
    );
  });
  setTimeout(releaseFirst, 100);

  const [firstRows, secondRows] = await Promise.all([
    firstCommand,
    competingCommand,
  ]);
  if (
    firstRows[0]?.outcome !== "created" ||
    secondRows[0]?.outcome !== "duplicate" ||
    firstRows[0]?.resource_public_id !== secondRows[0]?.resource_public_id
  ) {
    throw new Error(
      `managed growth authoring race was not idempotent: ${JSON.stringify({ firstRows, secondRows })}`,
    );
  }

  await admin`
    select loyalty_private.record_managed_billing_state_v1(
      ${fixture.organizationPublicId}, ${fixture.billingAccountPublicId},
      ${`sub_GrowthRace${suffix}`}, ${`evt_GrowthSuspend${suffix}`},
      'suspended', ${suspendedAt}, null, null, null,
      'worker:growth-configuration',
      'Restrict managed growth after the concurrency probe', ${randomUUID()}
    )
  `;

  const exactRestrictedRetry = await first.begin(async (sql) => {
    await assumeOwner(sql);
    return createProgramme(
      sql,
      fixture.programmeGroupPublicId,
      `race-${suffix}`,
      "Growth Race Programme",
      idempotencyKey,
      correlationId,
    );
  });
  if (
    exactRestrictedRetry[0]?.outcome !== "duplicate" ||
    exactRestrictedRetry[0]?.resource_public_id !==
      firstRows[0]?.resource_public_id
  ) {
    throw new Error(
      `restricted exact retry lost historical evidence: ${JSON.stringify(exactRestrictedRetry)}`,
    );
  }

  const changedRestrictedRetry = await second
    .begin(async (sql) => {
      await assumeOwner(sql);
      return createProgramme(
        sql,
        fixture.programmeGroupPublicId,
        `blocked-${suffix}`,
        "Blocked Growth Programme",
        `growth-programme:blocked:${suffix}`,
        randomUUID(),
      );
    })
    .then(
      (rows) => ({ status: "fulfilled", rows }),
      (error) => ({ status: "rejected", error }),
    );
  if (
    changedRestrictedRetry.status !== "rejected" ||
    changedRestrictedRetry.error?.code !== "42501" ||
    changedRestrictedRetry.error?.message !==
      "managed growth configuration restricted"
  ) {
    throw new Error(
      `restricted changed retry did not fail closed: ${JSON.stringify(changedRestrictedRetry)}`,
    );
  }

  await admin`
    select loyalty_private.record_managed_billing_state_v1(
      ${fixture.organizationPublicId}, ${fixture.billingAccountPublicId},
      ${`sub_GrowthRace${suffix}`}, ${`evt_GrowthRecover${suffix}`},
      'active', ${recoveredAt}, ${currentPeriodEnd}, null, null,
      'worker:growth-configuration',
      'Reopen managed growth after suspended-state verification',
      ${randomUUID()}
    )
  `;
  const recoveredRows = await first.begin(async (sql) => {
    await assumeOwner(sql);
    return createProgramme(
      sql,
      fixture.programmeGroupPublicId,
      `recovered-${suffix}`,
      "Recovered Growth Programme",
      `growth-programme:recovered:${suffix}`,
      randomUUID(),
    );
  });

  const [state] = await admin`
    select
      (select count(*)::integer from loyalty.programmes
       where organization_id = ${fixture.organizationId}) as programmes,
      (select count(*)::integer from loyalty.admin_audit_events
       where organization_id = ${fixture.organizationId}
         and action = 'programme.create') as programme_audits,
      (select count(*)::integer
       from loyalty_private.managed_billing_state_revisions
       where organization_id = ${fixture.organizationId}) as billing_revisions,
      (select count(*)::integer from loyalty.ledger_transactions
       where organization_id = ${fixture.organizationId}) as ledger_transactions
  `;

  if (
    recoveredRows[0]?.outcome !== "created" ||
    state.programmes !== 2 ||
    state.programme_audits !== 2 ||
    state.billing_revisions !== 3 ||
    state.ledger_transactions !== 0
  ) {
    throw new Error(
      `managed growth concurrency did not reconcile: ${JSON.stringify({ recoveredRows, state })}`,
    );
  }

  console.log(
    "Managed growth configuration concurrency probe passed: concurrent exact authoring created one effect, restricted historical retry remained readable, changed growth failed closed, active recovery reopened configuration, and no loyalty ledger value changed.",
  );
} finally {
  if (managedModeSet) {
    await admin`
      select loyalty_private.set_deployment_mode(
        'self_hosted', 1, 'probe:growth-configuration',
        'Restore self-hosted mode after growth concurrency probe',
        statement_timestamp()
      )
    `.catch(() => undefined);
  }
  await Promise.allSettled([admin.end(), first.end(), second.end()]);
}
