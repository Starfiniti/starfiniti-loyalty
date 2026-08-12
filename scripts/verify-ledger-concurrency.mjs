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
      values (${`concurrency-${suffix}`}, 'Ledger Concurrency Probe')
      returning id
    `;
    const [group] = await sql`
      insert into loyalty.programme_groups (organization_id, slug, name)
      values (${organization.id}, 'probe', 'Probe Programme Group')
      returning id
    `;
    const [programme] = await sql`
      insert into loyalty.programmes (organization_id, programme_group_id, slug, name)
      values (${organization.id}, ${group.id}, 'probe', 'Probe Programme')
      returning id
    `;
    const [version] = await sql`
      insert into loyalty.programme_versions (
        organization_id, programme_group_id, programme_id, version_number,
        status, configuration, configuration_sha256, published_at
      ) values (
        ${organization.id}, ${group.id}, ${programme.id}, 1, 'published',
        ${{ probe: true }}, ${hash("a")}, now()
      ) returning id
    `;
    const [customer] = await sql`
      insert into loyalty.customers (organization_id, display_reference)
      values (${organization.id}, ${`probe-${suffix}`})
      returning id
    `;
    const [award] = await sql`
      select * from loyalty_private.award_points(
        ${organization.id}, ${group.id}, ${version.id}, ${customer.id}, 100,
        ${`concurrency-award:${suffix}`}, ${hash("1")}, null, null, now()
      )
    `;
    const [origin] = await sql`
      select entry.public_id
      from loyalty.ledger_entries as entry
      join loyalty.ledger_transactions as transaction on transaction.id = entry.transaction_id
      join loyalty.ledger_accounts as account on account.id = entry.account_id
      where transaction.public_id = ${award.transaction_public_id}
        and account.account_kind = 'pending'
        and entry.points > 0
    `;
    await sql`
      select * from loyalty_private.release_points(
        ${organization.id}, ${group.id}, ${version.id}, ${origin.public_id},
        now() + interval '1 year', ${`concurrency-release:${suffix}`},
        ${hash("2")}, now()
      )
    `;
    return {
      organizationId: organization.id,
      programmeGroupId: group.id,
      programmeVersionId: version.id,
      walletPublicId: award.wallet_public_id,
    };
  });

  let allowFirstCommit;
  let markFirstPosted;
  const firstPosted = new Promise((resolve) => {
    markFirstPosted = resolve;
  });
  const commitGate = new Promise((resolve) => {
    allowFirstCommit = resolve;
  });

  const firstReservation = first.begin(async (sql) => {
    const rows = await sql`
      select * from loyalty_private.reserve_points(
        ${fixture.organizationId}, ${fixture.programmeGroupId},
        ${fixture.programmeVersionId}, ${fixture.walletPublicId}, 80,
        ${`concurrency-reserve:first:${suffix}`}, ${hash("3")}, now()
      )
    `;
    markFirstPosted();
    await commitGate;
    return rows;
  });

  await firstPosted;
  const competingReservation = second`
    select * from loyalty_private.reserve_points(
      ${fixture.organizationId}, ${fixture.programmeGroupId},
      ${fixture.programmeVersionId}, ${fixture.walletPublicId}, 80,
      ${`concurrency-reserve:second:${suffix}`}, ${hash("4")}, now()
    )
  `;
  setTimeout(allowFirstCommit, 100);

  const [firstResult, competingResult] = await Promise.allSettled([
    firstReservation,
    competingReservation,
  ]);
  if (firstResult.status !== "fulfilled") {
    throw new Error(`first reservation failed: ${firstResult.reason}`);
  }
  if (
    competingResult.status !== "rejected" ||
    competingResult.reason?.code !== "23514" ||
    competingResult.reason?.message !== "insufficient available points"
  ) {
    throw new Error(
      "competing reservation was not rejected by the balance fence",
    );
  }

  const [state] = await admin`
    select
      max(points) filter (where account_kind = 'available')::integer as available,
      max(points) filter (where account_kind = 'reserved')::integer as reserved
    from loyalty.wallet_balances
    where organization_id = ${fixture.organizationId}
  `;
  if (state.available !== 20 || state.reserved !== 80) {
    throw new Error(
      `unexpected concurrent balance: available=${state.available}, reserved=${state.reserved}`,
    );
  }

  let allowEvaluationCommit;
  let markEvaluationInserted;
  const evaluationInserted = new Promise((resolve) => {
    markEvaluationInserted = resolve;
  });
  const evaluationCommitGate = new Promise((resolve) => {
    allowEvaluationCommit = resolve;
  });
  const evaluationKey = `concurrency-evaluation:${suffix}`;
  const firstEvaluation = first.begin(async (sql) => {
    const rows = await sql`
      select * from loyalty_private.record_programme_evaluation(
        ${fixture.organizationId}, ${fixture.programmeGroupId},
        ${fixture.programmeVersionId}, null, 'simulation', 'probe:order',
        ${evaluationKey}, ${hash("5")}, ${hash("6")},
        ${{ awardedPoints: 10 }}, ${{ ruleIds: ["base"] }}, now()
      )
    `;
    markEvaluationInserted();
    await evaluationCommitGate;
    return rows;
  });
  await evaluationInserted;
  const duplicateEvaluation = second`
    select * from loyalty_private.record_programme_evaluation(
      ${fixture.organizationId}, ${fixture.programmeGroupId},
      ${fixture.programmeVersionId}, null, 'simulation', 'probe:order',
      ${evaluationKey}, ${hash("5")}, ${hash("6")},
      ${{ awardedPoints: 10 }}, ${{ ruleIds: ["base"] }}, now()
    )
  `;
  setTimeout(allowEvaluationCommit, 100);
  const [createdEvaluation, retriedEvaluation] = await Promise.all([
    firstEvaluation,
    duplicateEvaluation,
  ]);
  if (
    createdEvaluation[0]?.outcome !== "created" ||
    retriedEvaluation[0]?.outcome !== "duplicate" ||
    createdEvaluation[0]?.evaluation_public_id !==
      retriedEvaluation[0]?.evaluation_public_id
  ) {
    throw new Error("concurrent evaluation retry did not return one identity");
  }

  let sequenceSeed = 0x5f3759df;
  for (let round = 1; round <= 20; round += 1) {
    sequenceSeed = (Math.imul(sequenceSeed, 1664525) + 1013904223) >>> 0;
    const points = (sequenceSeed % 25) + 1;
    const adjustmentKey = `property-adjust:${suffix}:${round}`;
    const adjustmentHash = hash(((round % 14) + 1).toString(16));
    const [adjustment] = await admin`
      select * from loyalty_private.adjust_points(
        ${fixture.organizationId}, ${fixture.walletPublicId},
        ${fixture.programmeVersionId}, ${points},
        'Deterministic invariant probe credit', 'system:property-probe',
        ${adjustmentKey}, ${adjustmentHash}, now() + interval '2 years', now()
      )
    `;
    if (adjustment.outcome !== "created") {
      throw new Error(`property adjustment ${round} was not created`);
    }

    if (round % 5 === 0) {
      const [duplicate] = await admin`
        select * from loyalty_private.adjust_points(
          ${fixture.organizationId}, ${fixture.walletPublicId},
          ${fixture.programmeVersionId}, ${points},
          'Deterministic invariant probe credit', 'system:property-probe',
          ${adjustmentKey}, ${adjustmentHash}, now() + interval '2 years', now()
        )
      `;
      if (duplicate.outcome !== "duplicate") {
        throw new Error(
          `property adjustment retry ${round} was not idempotent`,
        );
      }
    }

    const [reservation] = await admin`
      select * from loyalty_private.reserve_points(
        ${fixture.organizationId}, ${fixture.programmeGroupId},
        ${fixture.programmeVersionId}, ${fixture.walletPublicId}, ${points},
        ${`property-reserve:${suffix}:${round}`},
        ${hash((((round + 3) % 14) + 1).toString(16))}, now()
      )
    `;
    if (round % 2 === 0) {
      await admin`
        select * from loyalty_private.cancel_reservation(
          ${fixture.organizationId}, ${reservation.transaction_public_id},
          ${`property-cancel:${suffix}:${round}`},
          ${hash((((round + 6) % 14) + 1).toString(16))}, now()
        )
      `;
    } else {
      await admin`
        select * from loyalty_private.capture_reservation(
          ${fixture.organizationId}, ${reservation.transaction_public_id},
          ${`property-capture:${suffix}:${round}`},
          ${hash((((round + 9) % 14) + 1).toString(16))}, now()
        )
      `;
    }
  }

  const [integrity] = await admin`
    select
      count(*) filter (where entry_count < 2 or entry_total <> 0)::integer as unbalanced,
      (select count(*)::integer from loyalty_private.wallet_projection_differences(${fixture.organizationId})) as projection_differences,
      (select count(*)::integer from loyalty_private.point_lot_projection_differences(${fixture.organizationId})) as lot_projection_differences
    from (
      select transaction.id, count(entry.id) as entry_count,
        coalesce(sum(entry.points::numeric), 0) as entry_total
      from loyalty.ledger_transactions as transaction
      join loyalty.ledger_entries as entry on entry.transaction_id = transaction.id
      where transaction.organization_id = ${fixture.organizationId}
      group by transaction.id
    ) as totals
  `;
  if (
    integrity.unbalanced !== 0 ||
    integrity.projection_differences !== 0 ||
    integrity.lot_projection_differences !== 0
  ) {
    throw new Error(
      `post-race integrity failed: unbalanced=${integrity.unbalanced}, projection_differences=${integrity.projection_differences}, lot_projection_differences=${integrity.lot_projection_differences}`,
    );
  }

  console.log(
    "Ledger/programme concurrency and property probe passed: one competing reservation failed safely, a concurrent evaluation retry returned one identity, 20 deterministic operation sequences stayed balanced, retries were idempotent, and projections remain exact.",
  );
} finally {
  await Promise.allSettled([admin.end(), first.end(), second.end()]);
}
