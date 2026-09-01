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
      values (${`reward-capacity-${suffix}`}, 'Reward Capacity Probe')
      returning id
    `;
    const [group] = await sql`
      insert into loyalty.programme_groups (organization_id, slug, name)
      values (${organization.id}, 'probe', 'Reward Capacity Group')
      returning id
    `;
    const [programme] = await sql`
      insert into loyalty.programmes (
        organization_id, programme_group_id, slug, name, status
      ) values (
        ${organization.id}, ${group.id}, 'probe', 'Reward Capacity Programme',
        'active'
      ) returning id
    `;
    const [version] = await sql`
      insert into loyalty.programme_versions (
        organization_id, programme_group_id, programme_id, version_number,
        status, configuration, configuration_sha256, published_at
      ) values (
        ${organization.id}, ${group.id}, ${programme.id}, 1, 'published',
        ${{ version: "1", tiers: [], rewards: [] }}, ${hash("a")}, now()
      ) returning id
    `;
    const customers = await sql`
      insert into loyalty.customers (organization_id, display_reference)
      values
        (${organization.id}, ${`capacity-first-${suffix}`}),
        (${organization.id}, ${`capacity-second-${suffix}`})
      returning id
    `;
    const wallets = [];
    for (const customer of customers) {
      const [wallet] = await sql`
        insert into loyalty.wallets (
          organization_id, programme_group_id, customer_id
        ) values (${organization.id}, ${group.id}, ${customer.id})
        returning id
      `;
      wallets.push(wallet);
    }
    const [reward] = await sql`
      insert into loyalty.programme_rewards (
        organization_id, programme_group_id, programme_version_id,
        code, name, reward_kind, cost_points, configuration
      ) values (
        ${organization.id}, ${group.id}, ${version.id},
        'limited', 'Limited reward', 'fixed_discount', 50,
        ${{
          version: "2",
          fulfilmentMode: "woocommerce_coupon",
          validityDays: 30,
          amountMinor: "500",
          currencyMinorUnitDigits: 2,
          availability: {
            startsAt: null,
            endsAt: null,
            tierCodes: [],
            segmentCodes: [],
            perCustomerLimit: null,
            globalQuantity: "1",
            pointsBudget: "50",
          },
          restrictions: {
            minimumSpendMinor: null,
            productIds: [],
            excludedProductIds: [],
            categoryIds: [],
            excludedCategoryIds: [],
            excludeSaleItems: false,
            stacking: "exclusive",
          },
        }}
      ) returning id
    `;
    return {
      organizationId: organization.id,
      groupId: group.id,
      versionId: version.id,
      rewardId: reward.id,
      firstWalletId: wallets[0].id,
      secondWalletId: wallets[1].id,
    };
  });

  let allowFirstCommit;
  let markFirstAllocated;
  const firstAllocated = new Promise((resolve) => {
    markFirstAllocated = resolve;
  });
  const commitGate = new Promise((resolve) => {
    allowFirstCommit = resolve;
  });
  const firstKey = `reward-capacity:first:${suffix}`;

  const firstAllocation = first.begin(async (sql) => {
    const rows = await sql`
      select * from loyalty_private.create_reward_reservation(
        ${fixture.organizationId}, ${fixture.groupId}, ${fixture.versionId},
        ${fixture.firstWalletId}, ${fixture.rewardId}, 50,
        now() + interval '30 days', ${firstKey}, ${hash("1")}
      )
    `;
    markFirstAllocated();
    await commitGate;
    return rows;
  });

  await firstAllocated;
  const competingAllocation = second`
    select * from loyalty_private.create_reward_reservation(
      ${fixture.organizationId}, ${fixture.groupId}, ${fixture.versionId},
      ${fixture.secondWalletId}, ${fixture.rewardId}, 50,
      now() + interval '30 days',
      ${`reward-capacity:second:${suffix}`}, ${hash("2")}
    )
  `;
  setTimeout(allowFirstCommit, 100);

  const [firstResult, competingResult] = await Promise.allSettled([
    firstAllocation,
    competingAllocation,
  ]);
  if (
    firstResult.status !== "fulfilled" ||
    firstResult.value[0]?.outcome !== "created"
  ) {
    throw new Error(`first capacity allocation failed: ${firstResult.reason}`);
  }
  if (
    competingResult.status !== "rejected" ||
    competingResult.reason?.code !== "23514" ||
    competingResult.reason?.message !== "reward global quantity exhausted"
  ) {
    throw new Error("competing reward allocation was not rejected atomically");
  }

  const [retry] = await admin`
    select * from loyalty_private.create_reward_reservation(
      ${fixture.organizationId}, ${fixture.groupId}, ${fixture.versionId},
      ${fixture.firstWalletId}, ${fixture.rewardId}, 50,
      now() + interval '30 days', ${firstKey}, ${hash("1")}
    )
  `;
  if (retry.outcome !== "duplicate") {
    throw new Error("exact reward-capacity retry was not idempotent");
  }

  const [state] = await admin`
    select
      (select count(*)::integer
       from loyalty.reward_reservations
       where organization_id = ${fixture.organizationId}) as reservations,
      (select count(*)::integer
       from loyalty_private.reward_capacity_allocations
       where organization_id = ${fixture.organizationId}) as allocations,
      counter.allocated_quantity::integer as allocated_quantity,
      counter.allocated_points::integer as allocated_points
    from loyalty_private.reward_capacity_counters as counter
    where counter.organization_id = ${fixture.organizationId}
      and counter.reward_id = ${fixture.rewardId}
  `;
  if (
    state.reservations !== 1 ||
    state.allocations !== 1 ||
    state.allocated_quantity !== 1 ||
    state.allocated_points !== 50
  ) {
    throw new Error(
      `capacity race did not reconcile: ${JSON.stringify(state)}`,
    );
  }

  console.log(
    "Reward capacity concurrency probe passed: one of two competing allocations committed, the other failed at the serialized global limit, an exact retry was idempotent, and counters reconcile.",
  );
} finally {
  await Promise.allSettled([admin.end(), first.end(), second.end()]);
}
