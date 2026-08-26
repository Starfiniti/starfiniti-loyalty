import { createHash, randomUUID } from "node:crypto";

import postgres from "postgres";

const connectionString =
  process.env.SUPABASE_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const admin = postgres(connectionString, { max: 1, onnotice: () => {} });
const first = postgres(connectionString, { max: 1, onnotice: () => {} });
const second = postgres(connectionString, { max: 1, onnotice: () => {} });
const digest = (value) => createHash("sha256").update(value).digest();

async function assumeWorker(sql) {
  await sql`set local role loyalty_worker`;
}

try {
  const fixture = await admin.begin(async (sql) => {
    const actorId = randomUUID();
    await sql`
      insert into auth.users (id, email)
      values (${actorId}, ${`currency-race-${suffix}@example.test`})
    `;
    const [organization] = await sql`
      insert into loyalty.organizations (slug, name)
      values (${`currency-race-${suffix}`}, 'Currency Evidence Race')
      returning id
    `;
    const [workspace] = await sql`
      insert into loyalty.workspaces (organization_id, slug, name)
      values (${organization.id}, 'primary', 'Primary store')
      returning id
    `;
    const [group] = await sql`
      insert into loyalty.programme_groups (organization_id, slug, name)
      values (${organization.id}, 'rewards', 'Currency Race Rewards')
      returning id
    `;
    const [programme] = await sql`
      insert into loyalty.programmes (
        organization_id, programme_group_id, slug, name, status
      ) values (
        ${organization.id}, ${group.id}, 'rewards',
        'Currency Race Programme', 'active'
      ) returning id
    `;
    const programmeDefinition = {
      version: "2",
      currencyCode: "EUR",
      currencyMinorUnitDigits: 2,
      pendingDays: 0,
      pointsExpireAfterDays: 365,
      tiers: [
        {
          code: "rose",
          name: "Rose",
          minimumEligibleSpendMinor: "0",
          pointsPerMajorUnit: "1",
        },
      ],
      rewards: [],
      earningRules: [
        {
          code: "purchase",
          name: "Purchase",
          source: "purchase",
          enabled: true,
          priority: 0,
          stackable: false,
          effect: { kind: "base_rate", pointsPerMajorUnit: "1" },
          conditions: {
            productIds: [],
            categoryIds: [],
            currencyCodes: [],
            markets: [],
            channels: [],
            activityCodes: [],
            segmentCodes: [],
            tierCodes: [],
            startsAt: null,
            endsAt: null,
          },
          purchaseExclusions: {
            productIds: [],
            categoryIds: [],
            shipping: true,
            tax: true,
            fees: true,
            giftCardPayments: true,
            storeCreditPayments: true,
            discounts: true,
          },
          cap: {
            perEventPoints: null,
            perMemberPoints: null,
            memberPeriod: null,
            rollingDays: null,
          },
        },
      ],
    };
    const [draft] = await sql`
      with configuration as (
        select ${programmeDefinition}::jsonb as value
      )
      select created.programme_version_public_id as public_id,
        extensions.digest(
          convert_to(configuration.value::text, 'UTF8'), 'sha256'
        ) as configuration_sha256
      from configuration
      cross join lateral loyalty_private.create_programme_draft(
        ${organization.id}, ${programme.id}, configuration.value,
        extensions.digest(
          convert_to(configuration.value::text, 'UTF8'), 'sha256'
        ), ${actorId}
      ) as created
    `;
    await sql`
      select loyalty_private.publish_programme_version(
        ${draft.public_id}, ${draft.configuration_sha256}, ${actorId},
        statement_timestamp()
      )
    `;
    const [version] = await sql`
      select id, public_id, programme_group_id
      from loyalty.programme_versions
      where public_id = ${draft.public_id}
    `;
    const [connection] = await sql`
      insert into loyalty.commerce_connections (
        organization_id, workspace_id, external_store_id, display_name,
        current_key_version, signing_material_ref, programme_id
      ) values (
        ${organization.id}, ${workspace.id},
        ${`https://currency-${suffix}.example.test`},
        'Currency Race WooCommerce', 'v1',
        ${`vault://currency-race/${suffix}`}, ${programme.id}
      ) returning id
    `;
    const [delivery] = await sql`
      insert into loyalty_private.commerce_delivery_inbox (
        organization_id, connection_id, source_delivery_id, envelope_version,
        source_event_id, event_type, source_object_id, occurred_at,
        delivered_at, key_version, nonce, body_sha256, raw_body, state
      ) values (
        ${organization.id}, ${connection.id}, ${`delivery-${suffix}`}, '1',
        ${`event-${suffix}`}, 'commerce.order.status_changed',
        ${`order-${suffix}`}, clock_timestamp(), clock_timestamp(), 'v1',
        ${`nonce-${suffix}`}, ${"a".repeat(64)},
        ${{ version: "1", probe: true }}, 'applied'
      ) returning id
    `;
    const [event] = await sql`
      insert into loyalty_private.canonical_commerce_events (
        organization_id, connection_id, delivery_inbox_id, source_event_id,
        normalization_version, event_type, source_object_id, occurred_at,
        payload
      ) values (
        ${organization.id}, ${connection.id}, ${delivery.id},
        ${`event-${suffix}`}, 'v1', 'commerce.order.status_changed',
        ${`order-${suffix}`}, clock_timestamp(),
        ${{
          kind: "order_status_changed",
          order: { currency: "USD", currencyMinorUnitDigits: 2 },
        }}
      ) returning id, public_id, occurred_at
    `;
    const [policy] = await sql`
      with command_time as (select ${event.occurred_at}::timestamptz as value)
      insert into loyalty_private.currency_conversion_policy_versions (
        organization_id, programme_group_id, programme_version_id, revision,
        state, provider_key, source_currency_code, source_minor_unit_digits,
        base_currency_code, base_minor_unit_digits, max_rate_age_seconds,
        rounding_mode, effective_from, created_by_user_id, correlation_id,
        created_at
      )
      select ${organization.id}, ${version.programme_group_id}, ${version.id},
        1, 'enabled', 'race-feed', 'USD', 2, 'EUR', 2, 86400,
        'half_away_from_zero', command_time.value, ${actorId}, ${randomUUID()},
        command_time.value
      from command_time
      returning id, public_id
    `;
    const [snapshot] = await sql`
      with observation as (select clock_timestamp() - interval '1 hour' as value)
      insert into loyalty_private.currency_rate_snapshots (
        organization_id, provider_key, provider_rate_reference,
        source_currency_code, source_minor_unit_digits, base_currency_code,
        base_minor_unit_digits, rate_numerator, rate_denominator, observed_at,
        valid_from, valid_until, payload_sha256, recorded_at
      )
      select ${organization.id}, 'race-feed', ${`usd-eur-${suffix}`},
        'USD', 2, 'EUR', 2, 85, 100, observation.value,
        observation.value, observation.value + interval '1 day',
        ${digest(`rate:${suffix}`)}, clock_timestamp()
      from observation
      returning id, public_id
    `;
    return { organization, version, event, policy, snapshot };
  });

  const amounts = [
    {
      amountKey: "order:gross",
      sourceAmountMinor: "1000",
      baseAmountMinor: "850",
      exactNumerator: "8500000",
      exactDenominator: "10000",
      roundingDeltaNumerator: "0",
    },
  ];
  const sourceHash = digest(`source:${suffix}`);
  const baseHash = digest(`base:${suffix}`);
  const record = (sql) => sql`
    select * from loyalty_private.record_currency_conversion_evidence_v1(
      ${fixture.organization.id}, ${fixture.event.public_id},
      ${fixture.version.id}, ${fixture.policy.public_id},
      ${fixture.snapshot.public_id}, null::uuid, ${amounts}::jsonb,
      ${sourceHash}, ${baseHash}
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
    await assumeWorker(sql);
    const rows = await record(sql);
    markFirstComplete();
    await commitGate;
    return rows;
  });
  await firstComplete;
  const secondCommand = second.begin(async (sql) => {
    await assumeWorker(sql);
    return record(sql);
  });
  setTimeout(releaseFirst, 100);
  const [firstRows, secondRows] = await Promise.all([
    firstCommand,
    secondCommand,
  ]);
  const outcomes = [firstRows[0]?.outcome, secondRows[0]?.outcome].sort();
  if (
    JSON.stringify(outcomes) !== JSON.stringify(["created", "duplicate"]) ||
    firstRows[0]?.conversion_evidence_public_id !==
      secondRows[0]?.conversion_evidence_public_id
  ) {
    throw new Error(
      `currency evidence retry did not serialize exactly once: ${JSON.stringify({ firstRows, secondRows })}`,
    );
  }

  let conflictFailedClosed = false;
  try {
    await admin.begin(async (sql) => {
      await assumeWorker(sql);
      return sql`
        select * from loyalty_private.record_currency_conversion_evidence_v1(
          ${fixture.organization.id}, ${fixture.event.public_id},
          ${fixture.version.id}, ${fixture.policy.public_id},
          ${fixture.snapshot.public_id}, null::uuid, ${amounts}::jsonb,
          ${digest(`different-source:${suffix}`)}, ${baseHash}
        )
      `;
    });
  } catch (error) {
    conflictFailedClosed =
      error?.code === "23514" &&
      String(error?.message).includes("currency conversion event conflict");
  }
  let amountConflictFailedClosed = false;
  try {
    await admin.begin(async (sql) => {
      await assumeWorker(sql);
      return sql`
        select * from loyalty_private.record_currency_conversion_evidence_v1(
          ${fixture.organization.id}, ${fixture.event.public_id},
          ${fixture.version.id}, ${fixture.policy.public_id},
          ${fixture.snapshot.public_id}, null::uuid, ${[
            {
              amountKey: "order:gross",
              sourceAmountMinor: "2000",
              baseAmountMinor: "1700",
              exactNumerator: "17000000",
              exactDenominator: "10000",
              roundingDeltaNumerator: "0",
            },
          ]}::jsonb,
          ${sourceHash}, ${baseHash}
        )
      `;
    });
  } catch (error) {
    amountConflictFailedClosed =
      error?.code === "23514" &&
      String(error?.message).includes("currency conversion event conflict");
  }
  const [state] = await admin`
    select
      (select count(*)::integer
       from loyalty_private.currency_conversion_evidence
       where organization_id = ${fixture.organization.id}) as evidence,
      (select count(*)::integer
       from loyalty_private.currency_conversion_amounts
       where organization_id = ${fixture.organization.id}) as amounts,
      (select count(*)::integer
       from loyalty.ledger_transactions
       where organization_id = ${fixture.organization.id}) as ledger_transactions
  `;
  if (
    !conflictFailedClosed ||
    !amountConflictFailedClosed ||
    state.evidence !== 1 ||
    state.amounts !== 1 ||
    state.ledger_transactions !== 0
  ) {
    throw new Error(
      `currency evidence race did not reconcile: ${JSON.stringify({ conflictFailedClosed, amountConflictFailedClosed, state })}`,
    );
  }

  console.log(
    "Currency conversion concurrency probe passed: two exact evidence writers serialized on one canonical event, returned one created plus one duplicate identity, conflicting projection and atomic batches failed closed, and evidence, atomic amounts, and zero ledger effects reconcile.",
  );
} finally {
  await Promise.allSettled([admin.end(), first.end(), second.end()]);
}
