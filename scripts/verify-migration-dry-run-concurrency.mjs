import { randomUUID } from "node:crypto";

import postgres from "postgres";

const connectionString =
  process.env.SUPABASE_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const userId = randomUUID();
const admin = postgres(connectionString, { max: 1, onnotice: () => {} });
const first = postgres(connectionString, { max: 1, onnotice: () => {} });
const second = postgres(connectionString, { max: 1, onnotice: () => {} });

async function assumeOwner(sql) {
  await sql`set local role authenticated`;
  await sql`select set_config('request.jwt.claim.sub', ${userId}, true)`;
}

try {
  const fixture = await admin.begin(async (sql) => {
    await sql`
      insert into auth.users (id, email)
      values (${userId}, ${`migration-race-${suffix}@example.test`})
    `;
    const [organization] = await sql`
      insert into loyalty.organizations (slug, name)
      values (${`migration-race-${suffix}`}, 'Migration Race Probe')
      returning id
    `;
    await sql`
      insert into loyalty.organization_memberships (
        organization_id, user_id, role
      ) values (${organization.id}, ${userId}, 'owner')
    `;
    const [group] = await sql`
      insert into loyalty.programme_groups (
        organization_id, slug, name, status
      ) values (${organization.id}, 'rewards', 'Migration Rewards', 'active')
      returning id, public_id
    `;
    const [programme] = await sql`
      insert into loyalty.programmes (
        organization_id, programme_group_id, slug, name, status
      ) values (
        ${organization.id}, ${group.id}, 'rewards',
        'Migration Rewards', 'active'
      ) returning id
    `;
    const [version] = await sql`
      insert into loyalty.programme_versions (
        organization_id, programme_group_id, programme_id,
        version_number, status, configuration, configuration_sha256,
        approved_by_user_id, published_at
      ) values (
        ${organization.id}, ${group.id}, ${programme.id}, 1, 'published',
        '{"version":"1","tiers":[],"rewards":[]}'::jsonb,
        extensions.digest(convert_to('{}', 'UTF8'), 'sha256'),
        ${userId}, now() - interval '1 day'
      ) returning public_id
    `;
    return { organization, group, version };
  });

  const recordDryRun = (sql, idempotencyKey) => sql`
    select * from loyalty.record_migration_dry_run_v1(
      ${fixture.group.public_id}, ${fixture.version.public_id},
      'valid', 'generic_csv', ${"a".repeat(64)}, ${"b".repeat(64)},
      ${"c".repeat(64)}, ${"d".repeat(64)},
      2, 2, 0, 0, 350, 0, '{}'::jsonb,
      ${idempotencyKey}, ${randomUUID()}
    )
  `;

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
    const rows = await recordDryRun(sql, `migration-race-a:${suffix}`);
    markFirstComplete();
    await commitGate;
    return rows;
  });
  await firstComplete;
  const secondCommand = second.begin(async (sql) => {
    await assumeOwner(sql);
    return recordDryRun(sql, `migration-race-b:${suffix}`);
  });
  setTimeout(releaseFirst, 100);

  const [firstRows, secondRows] = await Promise.all([
    firstCommand,
    secondCommand,
  ]);
  const outcomes = [firstRows[0]?.outcome, secondRows[0]?.outcome].sort();
  if (
    JSON.stringify(outcomes) !== JSON.stringify(["created", "duplicate"]) ||
    firstRows[0]?.dry_run_public_id !== secondRows[0]?.dry_run_public_id ||
    firstRows[0]?.approval_sha256 !== secondRows[0]?.approval_sha256
  ) {
    throw new Error(
      `migration content race did not converge: ${JSON.stringify({ firstRows, secondRows })}`,
    );
  }

  const [state] = await admin`
    select
      (select count(*)::integer
       from loyalty.migration_dry_runs
       where organization_id = ${fixture.organization.id}) as receipts,
      (select count(*)::integer
       from loyalty.admin_audit_events
       where organization_id = ${fixture.organization.id}
         and action = 'migration.dry_run.record') as audits,
      (select count(*)::integer
       from loyalty.admin_audit_events
       where organization_id = ${fixture.organization.id}
         and action = 'migration.dry_run.record'
         and actor_user_id = ${userId}) as attributed_audits,
      (select count(*)::integer
       from loyalty.ledger_transactions
       where organization_id = ${fixture.organization.id}) as ledger_transactions,
      (select count(*)::integer
       from loyalty.wallets
       where organization_id = ${fixture.organization.id}) as wallets
  `;
  if (
    state.receipts !== 1 ||
    state.audits !== 2 ||
    state.attributed_audits !== 2 ||
    state.ledger_transactions !== 0 ||
    state.wallets !== 0
  ) {
    throw new Error(
      `migration content race evidence did not reconcile: ${JSON.stringify(state)}`,
    );
  }

  console.log(
    "Migration dry-run concurrency probe passed: concurrent equal content under different idempotency keys returned one created and one duplicate receipt, both audits remained attributable, and wallet/ledger effects stayed zero.",
  );
} finally {
  await Promise.allSettled([admin.end(), first.end(), second.end()]);
}
