import { createHash } from "node:crypto";
import {
  wooCommerceOrderRefundedPayloadV1,
  wooCommerceOrderStatusChangedPayloadV1,
  type WooCommerceOrderFactV1,
} from "@starfiniti/contracts";
import {
  evaluateOrderAward,
  minorUnit,
  points,
  programmeVersionId,
  rosyRewardsV1,
  tierCode,
  type OrderAwardEvaluation,
  type ProgrammeVersion,
} from "@starfiniti/domain";
import type { Sql } from "postgres";

export type ClaimedEffect = Readonly<{
  canonical_event_id: string;
  canonical_event_public_id: string;
  organization_id: string;
  connection_id: string;
  programme_id: string | null;
  event_type: string;
  source_event_id: string;
  source_object_id: string;
  occurred_at: string;
  payload: unknown;
  attempt_count: number;
}>;

type ParsedEffect =
  | { readonly kind: "award"; readonly order: WooCommerceOrderFactV1 }
  | { readonly kind: "refund"; readonly order: WooCommerceOrderFactV1 }
  | { readonly kind: "skip"; readonly reason: string }
  | { readonly kind: "quarantine"; readonly reason: string };

type IdentityRow = { customer_id: string };
type ProgrammeRow = {
  programme_group_id: string;
  programme_version_id: string;
  programme_version_public_id: string;
  version_number: number;
  tier_code: string;
  tier_name: string;
  minimum_eligible_spend_minor: string;
  points_per_major_unit: string;
  ordinal: number;
};
type TierMembershipRow = { tier_code: string };
type EvaluationRow = { evaluation_public_id: string };
type AwardRow = { transaction_public_id: string };

export function parseWooCommerceEffect(event: ClaimedEffect): ParsedEffect {
  if (event.event_type === "commerce.order.status_changed") {
    const parsed = wooCommerceOrderStatusChangedPayloadV1.safeParse(
      event.payload,
    );
    if (!parsed.success) {
      return { kind: "quarantine", reason: "invalid_order_status_payload" };
    }
    if (parsed.data.order.status !== "completed") {
      return { kind: "skip", reason: "order_status_not_eligible" };
    }
    return { kind: "award", order: parsed.data.order };
  }
  if (event.event_type === "commerce.order.refunded") {
    const parsed = wooCommerceOrderRefundedPayloadV1.safeParse(event.payload);
    return parsed.success
      ? { kind: "refund", order: parsed.data.order }
      : { kind: "quarantine", reason: "invalid_order_refund_payload" };
  }
  return { kind: "quarantine", reason: "unsupported_event_type" };
}

export function evidenceSha256(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export async function claimWooCommerceEffects(
  sql: Sql,
  workerId: string,
  batchSize = 25,
): Promise<ClaimedEffect[]> {
  return sql<ClaimedEffect[]>`
    select * from loyalty_private.claim_woocommerce_effects(
      ${workerId}, ${batchSize}, 60
    )
  `;
}

export async function processWooCommerceEffect(
  sql: Sql,
  workerId: string,
  event: ClaimedEffect,
): Promise<void> {
  const effect = parseWooCommerceEffect(event);
  if (effect.kind === "skip" || effect.kind === "quarantine") {
    await finishEffect(
      sql,
      workerId,
      event,
      effect.kind === "skip" ? "skipped" : "quarantined",
      effect.reason,
    );
    return;
  }
  if (effect.kind === "refund") {
    await finishEffect(
      sql,
      workerId,
      event,
      "retryable",
      "refund_effect_not_ready",
      retryDelay(event.attempt_count),
    );
    return;
  }
  if (event.programme_id === null) {
    await finishEffect(
      sql,
      workerId,
      event,
      "retryable",
      "programme_not_configured",
      retryDelay(event.attempt_count),
    );
    return;
  }

  try {
    const identity = identityFromOrder(effect.order);
    const identities = await sql<IdentityRow[]>`
      select customer_id::text
      from loyalty_private.resolve_commerce_customer(
        ${event.organization_id}::bigint,
        ${event.connection_id}::bigint,
        ${identity.kind},
        ${identity.externalId}
      )
    `;
    const customerId = identities[0]?.customer_id;
    if (!customerId) throw new Error("customer_resolution_failed");

    const context = await loadProgrammeContext(
      sql,
      event.organization_id,
      event.programme_id,
      customerId,
    );
    if (effect.order.currency !== rosyRewardsV1.currencyCode) {
      throw new PermanentEffectError("programme_currency_mismatch");
    }
    const orderFact = toOrderAwardFact(
      effect.order,
      event.occurred_at,
      context.tierCode,
    );
    const evaluation = evaluateOrderAward(context.programme, [], orderFact);
    await commitAward(
      sql,
      workerId,
      event,
      customerId,
      context,
      orderFact,
      evaluation,
    );
  } catch (error) {
    const permanent =
      error instanceof PermanentEffectError || databaseCode(error) === "23514";
    await finishEffect(
      sql,
      workerId,
      event,
      permanent
        ? "quarantined"
        : event.attempt_count >= 10
          ? "dead_letter"
          : "retryable",
      safeErrorCode(error),
      permanent ? 0 : retryDelay(event.attempt_count),
    );
  }
}

function identityFromOrder(order: WooCommerceOrderFactV1): {
  kind: "registered" | "guest";
  externalId: string;
} {
  return order.customer.kind === "registered"
    ? { kind: "registered", externalId: order.customer.externalCustomerId }
    : { kind: "guest", externalId: order.customer.guestOrderId };
}

async function loadProgrammeContext(
  sql: Sql,
  organizationId: string,
  programmeId: string,
  customerId: string,
): Promise<{
  programmeGroupId: string;
  programmeVersionId: string;
  tierCode: string;
  programme: ProgrammeVersion;
}> {
  const rows = await sql<ProgrammeRow[]>`
    select programme.programme_group_id::text,
      version.id::text as programme_version_id,
      version.public_id::text as programme_version_public_id,
      version.version_number,
      tier.code as tier_code,
      tier.name as tier_name,
      tier.minimum_eligible_spend_minor::text,
      tier.points_per_major_unit::text,
      tier.ordinal
    from loyalty.programmes as programme
    join loyalty.programme_versions as version
      on version.organization_id = programme.organization_id
     and version.programme_id = programme.id
     and version.status = 'published'
    join loyalty.programme_tiers as tier
      on tier.organization_id = version.organization_id
     and tier.programme_version_id = version.id
    where programme.organization_id = ${organizationId}::bigint
      and programme.id = ${programmeId}::bigint
      and programme.status = 'active'
    order by tier.ordinal
  `;
  const first = rows[0];
  if (!first) throw new Error("published_programme_unavailable");
  const memberships = await sql<TierMembershipRow[]>`
    select membership.tier_code
    from loyalty.wallets as wallet
    join loyalty.tier_memberships as membership
      on membership.organization_id = wallet.organization_id
     and membership.wallet_id = wallet.id
     and membership.effective_until is null
    where wallet.organization_id = ${organizationId}::bigint
      and wallet.programme_group_id = ${first.programme_group_id}::bigint
      and wallet.customer_id = ${customerId}::bigint
      and wallet.status = 'active'
    limit 1
  `;
  const programme: ProgrammeVersion = {
    ...rosyRewardsV1,
    id: programmeVersionId(first.programme_version_public_id),
    version: first.version_number,
    tiers: rows.map((row) => ({
      code: tierCode(row.tier_code),
      name: row.tier_name,
      minimumEligibleSpendMinor: minorUnit(
        toSafeInteger(row.minimum_eligible_spend_minor),
      ),
      pointsPerMajorUnit: points(toSafeInteger(row.points_per_major_unit)),
    })),
  };
  return {
    programmeGroupId: first.programme_group_id,
    programmeVersionId: first.programme_version_id,
    tierCode: memberships[0]?.tier_code ?? first.tier_code,
    programme,
  };
}

function toOrderAwardFact(
  order: WooCommerceOrderFactV1,
  occurredAt: string,
  tierSnapshot: string,
) {
  const toMinor = (value: string) => {
    const [major, fraction = ""] = value.split(".");
    const scaled =
      BigInt(major!) * 10n ** BigInt(order.currencyMinorUnitDigits) +
      BigInt(fraction.padEnd(order.currencyMinorUnitDigits, "0") || "0");
    return minorUnit(toSafeInteger(scaled.toString()));
  };
  return {
    orderId: order.orderId,
    currencyCode: order.currency,
    market: order.market,
    channel: "woocommerce",
    customerSegments: [],
    occurredAt: new Date(occurredAt).toISOString(),
    tierCodeSnapshot: tierCode(tierSnapshot),
    lines: [
      ...order.lines.map((line) => {
        const grossMinor = toMinor(line.subtotal);
        const paidMinor = toMinor(line.total);
        return {
          lineId: `product:${line.lineId}`,
          lineKind: "product" as const,
          productId: line.productId,
          categoryIds: line.categoryIds,
          collectionIds: line.collectionIds,
          grossMinor,
          discountMinor: minorUnit(grossMinor - paidMinor),
          refundedMinor: toMinor(line.refundedTotal),
          paymentKind: order.paymentKind,
        };
      }),
      ...(
        [
          ["shipping", order.shippingTotal],
          ["tax", order.taxTotal],
          ["fee", order.feeTotal],
        ] as const
      ).map(([kind, amount]) => ({
        lineId: `component:${kind}`,
        lineKind: kind,
        productId: `component:${kind}`,
        categoryIds: [],
        collectionIds: [],
        grossMinor: toMinor(amount),
        discountMinor: minorUnit(0),
        refundedMinor: minorUnit(0),
        paymentKind: order.paymentKind,
      })),
    ],
  };
}

async function commitAward(
  sql: Sql,
  workerId: string,
  event: ClaimedEffect,
  customerId: string,
  context: Awaited<ReturnType<typeof loadProgrammeContext>>,
  orderFact: ReturnType<typeof toOrderAwardFact>,
  evaluation: OrderAwardEvaluation,
): Promise<void> {
  const operation = `connection:${event.connection_id}:order:${orderFact.orderId}`;
  const evaluationKey = `woo:evaluation:award:${operation}`;
  const awardKey = `woo:ledger:award:${operation}`;
  const inputHash = evidenceSha256({
    version: "1",
    programmeVersionId: context.programme.id,
    order: orderFact,
  });
  const resultHash = evidenceSha256(evaluation);
  await sql.begin(async (transaction) => {
    const evaluations = await transaction<EvaluationRow[]>`
      select evaluation_public_id::text
      from loyalty_private.record_programme_evaluation(
        ${event.organization_id}::bigint,
        ${context.programmeGroupId}::bigint,
        ${context.programmeVersionId}::bigint,
        ${event.canonical_event_id}::bigint,
        'live_award',
        ${`woocommerce:order:${orderFact.orderId}`},
        ${evaluationKey},
        ${Buffer.from(inputHash, "hex")},
        ${Buffer.from(resultHash, "hex")},
        ${JSON.stringify(evaluation)}::jsonb,
        ${JSON.stringify({ lines: evaluation.explanation })}::jsonb,
        ${new Date().toISOString()}::timestamptz
      )
    `;
    const evaluationId = evaluations[0]?.evaluation_public_id;
    if (!evaluationId) throw new Error("evaluation_record_failed");
    let resultReference = `evaluation:${evaluationId}`;
    if (evaluation.awardedPoints > 0) {
      const awards = await transaction<AwardRow[]>`
        select transaction_public_id::text
        from loyalty_private.award_points(
          ${event.organization_id}::bigint,
          ${context.programmeGroupId}::bigint,
          ${context.programmeVersionId}::bigint,
          ${customerId}::bigint,
          ${evaluation.awardedPoints}::bigint,
          ${awardKey},
          ${Buffer.from(resultHash, "hex")},
          ${event.canonical_event_id}::bigint,
          ${`woocommerce:order:${orderFact.orderId}`},
          ${event.occurred_at}::timestamptz
        )
      `;
      const transactionId = awards[0]?.transaction_public_id;
      if (!transactionId) throw new Error("award_record_failed");
      resultReference = `ledger-transaction:${transactionId}`;
    }
    await transaction`
      select * from loyalty_private.finish_commerce_effect(
        ${event.canonical_event_public_id}::uuid,
        ${workerId},
        'applied',
        'loyalty.order.award',
        ${operation},
        ${resultReference},
        null,
        0
      )
    `;
  });
}

async function finishEffect(
  sql: Sql,
  workerId: string,
  event: ClaimedEffect,
  outcome: "skipped" | "retryable" | "quarantined" | "dead_letter",
  errorCode: string,
  retryDelaySeconds = 0,
): Promise<void> {
  await sql`
    select * from loyalty_private.finish_commerce_effect(
      ${event.canonical_event_public_id}::uuid,
      ${workerId},
      ${outcome},
      null,
      null,
      null,
      ${errorCode},
      ${retryDelaySeconds}
    )
  `;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(",")}}`;
}

function toSafeInteger(value: string): number {
  const parsed = BigInt(value);
  if (parsed < 0n || parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new PermanentEffectError("numeric_value_out_of_range");
  }
  return Number(parsed);
}

function retryDelay(attempt: number): number {
  return Math.min(3600, 2 ** Math.min(Math.max(attempt, 1), 11));
}

function databaseCode(error: unknown): string | undefined {
  return error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : undefined;
}

function safeErrorCode(error: unknown): string {
  if (error instanceof PermanentEffectError) return error.message;
  return (
    databaseCode(error) ??
    (error instanceof Error && /^[a-z0-9_]{1,100}$/u.test(error.message)
      ? error.message
      : "effect_processing_failed")
  );
}

class PermanentEffectError extends Error {}
