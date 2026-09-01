import { createHash, randomUUID } from "node:crypto";

import postgres from "postgres";

const connectionString =
  process.env.SUPABASE_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const userId = randomUUID();
const admin = postgres(connectionString, { max: 1, onnotice: () => {} });
const first = postgres(connectionString, { max: 1, onnotice: () => {} });
const second = postgres(connectionString, { max: 1, onnotice: () => {} });

const sha256 = (value) =>
  createHash("sha256").update(value, "utf8").digest("hex");

async function assumeOwner(sql) {
  await sql`set local role authenticated`;
  await sql`select set_config('request.jwt.claim.sub', ${userId}, true)`;
}

try {
  const identitySha = sha256(
    '{"identity":{"kind":"email","value":"race@example.test"},"schemaVersion":"1"}',
  );
  const sourceExportSha = "a".repeat(64);
  const fixture = await admin.begin(async (sql) => {
    await sql`
      insert into auth.users (id, email)
      values (${userId}, ${`migration-application-${suffix}@example.test`})
    `;
    const [organization] = await sql`
      insert into loyalty.organizations (slug, name)
      values (${`migration-application-${suffix}`}, 'Migration Application Probe')
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
    const document = `{"expiryPolicy":{"expiresAt":"2027-08-26T08:00:00Z","mode":"apply_default"},"programmeGroupId":"${group.public_id}","programmeVersionId":"${version.public_id}","rows":[{"balance":{"availablePoints":"125","lots":[],"pendingPoints":"0"},"identity":{"kind":"email","value":"race@example.test"},"referral":null,"sourceHistory":[],"sourceRowId":"row-race","tier":null}],"schemaVersion":"1","source":{"exportId":"export-race","exportSha256":"${sourceExportSha}","exportedAt":"2026-08-26T06:00:00Z","system":"generic_csv"}}`;
    const resolutions = `[{"basis":"explicit_create","identitySha256":"${identitySha}","outcome":"create_new","sourceRowId":"row-race","targetCustomerId":null}]`;
    return { organization, group, version, document, resolutions };
  });

  const receipts = await admin.begin(async (sql) => {
    await assumeOwner(sql);
    const createReceipt = async (engineSha, key) => {
      const [receipt] = await sql`
        select * from loyalty.record_migration_dry_run_v1(
          ${fixture.group.public_id}, ${fixture.version.public_id},
          'valid', 'generic_csv', ${sourceExportSha},
          ${sha256(fixture.document)}, ${sha256(fixture.resolutions)},
          ${engineSha}, 1, 0, 1, 0, 125, 0, '{}'::jsonb,
          ${key}, ${randomUUID()}
        )
      `;
      return receipt;
    };
    return [
      await createReceipt(
        "d".repeat(64),
        `migration-apply-race-receipt-a:${suffix}`,
      ),
      await createReceipt(
        "e".repeat(64),
        `migration-apply-race-receipt-b:${suffix}`,
      ),
    ];
  });

  const applyReceipt = (sql, receipt, key) => sql`
    select * from loyalty.apply_migration_opening_balance_v1(
      ${receipt.dry_run_public_id}, ${receipt.approval_sha256},
      ${fixture.document}, ${fixture.resolutions}, null,
      ${key}, ${randomUUID()}
    )
  `;

  let releaseFirst;
  let markFirstApplied;
  let rejectFirstApplied;
  const firstApplied = new Promise((resolve, reject) => {
    markFirstApplied = resolve;
    rejectFirstApplied = reject;
  });
  const commitGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const firstKey = `migration-apply-race-a:${suffix}`;
  const firstCommand = first
    .begin(async (sql) => {
      await assumeOwner(sql);
      const rows = await applyReceipt(sql, receipts[0], firstKey);
      markFirstApplied();
      await commitGate;
      return rows;
    })
    .catch((error) => {
      rejectFirstApplied(error);
      throw error;
    });
  await firstApplied;
  const secondCommand = second.begin(async (sql) => {
    await assumeOwner(sql);
    return applyReceipt(sql, receipts[1], `migration-apply-race-b:${suffix}`);
  });
  setTimeout(releaseFirst, 100);

  const [firstResult, secondResult] = await Promise.allSettled([
    firstCommand,
    secondCommand,
  ]);
  if (
    firstResult.status !== "fulfilled" ||
    firstResult.value[0]?.outcome !== "created" ||
    secondResult.status !== "rejected" ||
    secondResult.reason?.code !== "23505" ||
    secondResult.reason?.message !== "migration source row already applied"
  ) {
    const secondError =
      secondResult.status === "rejected"
        ? {
            code: secondResult.reason?.code,
            message: secondResult.reason?.message,
          }
        : undefined;
    throw new Error(
      `migration source-row race was not deterministic: ${JSON.stringify({ firstResult, secondResult, secondError })}`,
    );
  }

  const retry = await first.begin(async (sql) => {
    await assumeOwner(sql);
    return applyReceipt(sql, receipts[0], firstKey);
  });
  if (
    retry[0]?.outcome !== "duplicate" ||
    retry[0]?.batch_public_id !== firstResult.value[0]?.batch_public_id
  ) {
    throw new Error(
      `migration application retry diverged: ${JSON.stringify(retry)}`,
    );
  }

  const [state] = await admin`
    select
      (select count(*)::integer from loyalty.migration_import_batches
       where organization_id = ${fixture.organization.id}) as batches,
      (select count(*)::integer from loyalty.migration_import_items
       where organization_id = ${fixture.organization.id}) as items,
      (select count(*)::integer from loyalty.customers
       where organization_id = ${fixture.organization.id}) as customers,
      (select count(*)::integer from loyalty.wallets
       where organization_id = ${fixture.organization.id}) as wallets,
      (select count(*)::integer from loyalty.ledger_transactions
       where organization_id = ${fixture.organization.id}
         and transaction_kind = 'opening_balance') as opening_transactions,
      (select count(*)::integer from loyalty.point_lots
       where organization_id = ${fixture.organization.id}) as point_lots,
      (select coalesce(sum(points), 0)::text from loyalty.wallet_balances
       where organization_id = ${fixture.organization.id}
         and account_kind = 'available') as available_points
  `;
  if (
    state.batches !== 1 ||
    state.items !== 1 ||
    state.customers !== 1 ||
    state.wallets !== 1 ||
    state.opening_transactions !== 1 ||
    state.point_lots !== 1 ||
    state.available_points !== "125"
  ) {
    throw new Error(
      `migration application race did not reconcile: ${JSON.stringify(state)}`,
    );
  }

  console.log(
    "Migration application concurrency probe passed: two receipts racing the same source row produced one atomic opening balance, the loser failed with a minimized duplicate-source fence, and the winning receipt retried as the same batch.",
  );
} finally {
  await Promise.allSettled([admin.end(), first.end(), second.end()]);
}
