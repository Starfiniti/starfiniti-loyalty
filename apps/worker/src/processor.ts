import { createHash } from "node:crypto";
import {
  programmeDefinitionV2,
  tierMetricSnapshotV2,
  tierQualificationEvaluationV2,
  merchantActivityPayloadV1,
  campaignPurchaseCandidateV1,
  campaignTriggerExecutionV1,
  campaignTriggerJobV1,
  wooCommerceCouponCapturedPayloadV1,
  wooCommerceCustomerCreatedPayloadV1,
  wooCommerceCustomerDeletedPayloadV1,
  wooCommerceOrderRefundedPayloadV1,
  wooCommerceOrderStatusChangedPayloadV1,
  wooCommerceVerifiedProductReviewPayloadV1,
  type WooCommerceOrderFactV1,
  type ProgrammeDefinitionV2,
  type CampaignPurchaseCandidateV1,
  type CampaignTriggerExecutionV1,
} from "@starfiniti/contracts";
import {
  calculateRefundReversal,
  evaluateOrderAward,
  evaluateEarningV2,
  evaluatePurchaseCampaignsV1,
  evaluateTierQualificationSnapshotV2,
  minorUnit,
  points,
  programmeVersionId,
  rosyRewardsV1,
  tierCode,
  type OrderAwardEvaluation,
  type EarningEvaluationV2,
  type ActivityEarningFactV2,
  type PurchaseEarningFactV2,
  type ProgrammeVersion,
} from "@starfiniti/domain";
import type { Sql, TransactionSql } from "postgres";

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
  | {
      readonly kind: "award";
      readonly order: WooCommerceOrderFactV1;
      readonly awardEligible: boolean;
    }
  | {
      readonly kind: "refund";
      readonly refundId: string;
      readonly order: WooCommerceOrderFactV1;
    }
  | {
      readonly kind: "coupon_capture";
      readonly reservationId: string;
      readonly orderId: string;
    }
  | { readonly kind: "customer_delete"; readonly externalCustomerId: string }
  | {
      readonly kind: "activity";
      readonly source: "account_created" | "verified_product_review";
      readonly customerSelector: Readonly<{
        kind: "commerce";
        externalCustomerId: string;
      }>;
      readonly channel: "woocommerce";
      readonly activityReference: string;
      readonly activityCode: string;
      readonly productId: string | null;
      readonly categoryIds: readonly string[];
    }
  | {
      readonly kind: "activity";
      readonly source:
        | "account_created"
        | "birthday"
        | "verified_product_review"
        | "referral"
        | "custom_activity";
      readonly customerSelector: Readonly<{
        kind: "public";
        customerId: string;
      }>;
      readonly channel: "merchant-api";
      readonly activityReference: string;
      readonly activityCode: string;
      readonly productId: string | null;
      readonly categoryIds: readonly string[];
    }
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
  configuration: unknown;
};
type TierMembershipRow = { tier_code: string };
type EvaluationRow = { evaluation_public_id: string };
type AwardRow = { transaction_public_id: string };
type MemberRuleUsageRow = { rule_code: string; consumed_points: string };
type V2AwardRow = {
  evaluation_public_id: string;
  transaction_public_id: string | null;
  outcome: string;
};
type CampaignPurchaseContextRow = {
  campaign_version_public_id: string;
  campaign_code: string;
  assignment: "treatment" | "control";
  behavior: CampaignPurchaseCandidateV1["behavior"];
  remaining_global_effects: string;
  remaining_member_effects: string;
  remaining_points: string;
};
type CampaignPurchaseCommitRow = V2AwardRow & {
  campaign_batch_public_id: string;
  campaign_points: string;
};
type ReferralQualificationContextRow = {
  attribution_id: string | null;
  programme_version_id: string | null;
  current_state: string | null;
  qualification_status: string | null;
  outcome: string;
};
type ReferralQualificationRow = {
  attribution_id: string | null;
  evaluation_id: string | null;
  state: string;
  outcome: string;
  cooling_ends_at: string | Date | null;
};
type ReferralRefundRow = {
  attribution_id: string | null;
  state: string;
  outcome: string;
};
type TierQualificationContextRow = {
  metrics: unknown;
  current_tier_code: string | null;
  previously_held_tier_codes: string[];
  below_threshold_since: string | Date | null;
};
type CampaignRefundRow = {
  customer_id: string;
  affected_effects: string;
  reversed_points: string;
  outcome: string;
};
type OriginalAwardRow = {
  evaluation_public_id: string;
  programme_group_id: string;
  programme_version_id: string;
  result: Record<string, unknown>;
  origin_entry_public_id: string | null;
  already_reversed_points: string;
};

type LegacyProgrammeContext = Readonly<{
  definitionVersion: "1";
  programmeGroupId: string;
  programmeVersionId: string;
  tierCode: string;
  programme: ProgrammeVersion;
}>;

type V2ProgrammeContext = Readonly<{
  definitionVersion: "2";
  programmeGroupId: string;
  programmeVersionId: string;
  tierCode: string;
  programme: ProgrammeDefinitionV2;
}>;

type ProgrammeContext = LegacyProgrammeContext | V2ProgrammeContext;

export function parseWooCommerceEffect(event: ClaimedEffect): ParsedEffect {
  if (event.event_type === "commerce.order.status_changed") {
    const parsed = wooCommerceOrderStatusChangedPayloadV1.safeParse(
      event.payload,
    );
    if (!parsed.success) {
      return { kind: "quarantine", reason: "invalid_order_status_payload" };
    }
    if (
      parsed.data.order.status !== "completed" &&
      !(parsed.data.order.status === "processing" && parsed.data.order.referral)
    ) {
      return { kind: "skip", reason: "order_status_not_eligible" };
    }
    return {
      kind: "award",
      order: parsed.data.order,
      awardEligible: parsed.data.order.status === "completed",
    };
  }
  if (event.event_type === "commerce.order.refunded") {
    const parsed = wooCommerceOrderRefundedPayloadV1.safeParse(event.payload);
    return parsed.success
      ? {
          kind: "refund",
          refundId: parsed.data.refundId,
          order: parsed.data.order,
        }
      : { kind: "quarantine", reason: "invalid_order_refund_payload" };
  }
  if (event.event_type === "commerce.coupon.captured") {
    const parsed = wooCommerceCouponCapturedPayloadV1.safeParse(event.payload);
    return parsed.success
      ? {
          kind: "coupon_capture",
          reservationId: parsed.data.reservationId,
          orderId: parsed.data.orderId,
        }
      : { kind: "quarantine", reason: "invalid_coupon_capture_payload" };
  }
  if (event.event_type === "commerce.customer.deleted") {
    const parsed = wooCommerceCustomerDeletedPayloadV1.safeParse(event.payload);
    return parsed.success
      ? {
          kind: "customer_delete",
          externalCustomerId: parsed.data.externalCustomerId,
        }
      : { kind: "quarantine", reason: "invalid_customer_deleted_payload" };
  }
  if (event.event_type === "commerce.customer.created") {
    const parsed = wooCommerceCustomerCreatedPayloadV1.safeParse(event.payload);
    return parsed.success
      ? {
          kind: "activity",
          source: "account_created",
          customerSelector: {
            kind: "commerce",
            externalCustomerId: parsed.data.externalCustomerId,
          },
          channel: "woocommerce",
          activityReference: `woocommerce:customer:${parsed.data.externalCustomerId}`,
          activityCode: "account_created",
          productId: null,
          categoryIds: [],
        }
      : { kind: "quarantine", reason: "invalid_customer_created_payload" };
  }
  if (event.event_type === "commerce.review.verified") {
    const parsed = wooCommerceVerifiedProductReviewPayloadV1.safeParse(
      event.payload,
    );
    return parsed.success
      ? {
          kind: "activity",
          source: "verified_product_review",
          customerSelector: {
            kind: "commerce",
            externalCustomerId: parsed.data.externalCustomerId,
          },
          channel: "woocommerce",
          activityReference: `woocommerce:review:${parsed.data.reviewId}`,
          activityCode: "verified_product_review",
          productId: parsed.data.productId,
          categoryIds: parsed.data.categoryIds,
        }
      : {
          kind: "quarantine",
          reason: "invalid_verified_review_payload",
        };
  }
  if (event.event_type === "commerce.activity.recorded") {
    const parsed = merchantActivityPayloadV1.safeParse(event.payload);
    return parsed.success
      ? {
          kind: "activity",
          source: parsed.data.source,
          customerSelector: {
            kind: "public",
            customerId: parsed.data.customerId,
          },
          channel: "merchant-api",
          activityReference: `merchant-activity:${event.source_event_id}`,
          activityCode: parsed.data.activityCode,
          productId: parsed.data.productId,
          categoryIds: parsed.data.categoryIds,
        }
      : {
          kind: "quarantine",
          reason: "invalid_merchant_activity_payload",
        };
  }
  return { kind: "quarantine", reason: "unsupported_event_type" };
}

export function evidenceSha256(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export function calculateCumulativeRefundPlan(input: {
  originalEligibleSpend: number;
  originalAwardedPoints: number;
  currentEligibleSpend: number;
  alreadyReversedPoints: number;
}): { cumulativeRefundedEligibleSpend: number; reversalPoints: number } {
  if (input.currentEligibleSpend > input.originalEligibleSpend) {
    throw new PermanentEffectError("cumulative_refund_moved_backwards");
  }
  const cumulativeRefundedEligibleSpend =
    input.originalEligibleSpend - input.currentEligibleSpend;
  const reversalPoints =
    input.originalEligibleSpend === 0
      ? points(0)
      : calculateRefundReversal({
          originalEligibleSpendMinor: minorUnit(input.originalEligibleSpend),
          originalAwardedPoints: points(input.originalAwardedPoints),
          cumulativeRefundedEligibleSpendMinor: minorUnit(
            cumulativeRefundedEligibleSpend,
          ),
          alreadyReversedPoints: points(input.alreadyReversedPoints),
        });
  return { cumulativeRefundedEligibleSpend, reversalPoints };
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
  try {
    if (effect.kind === "coupon_capture") {
      await processCouponCapture(sql, workerId, event, effect);
      return;
    }
    if (effect.kind === "customer_delete") {
      await processCustomerDeletion(sql, workerId, event, effect);
      return;
    }
    if (effect.kind === "refund") {
      await sql.begin((transaction) =>
        processRefund(transaction, workerId, event, effect),
      );
      return;
    }
    if (event.programme_id === null) {
      throw new RetryableEffectError("programme_not_configured");
    }
    let identities: IdentityRow[];
    if (effect.kind === "activity") {
      if (effect.customerSelector.kind === "public") {
        identities = await sql<IdentityRow[]>`
          select id::text as customer_id
          from loyalty.customers
          where organization_id = ${event.organization_id}::bigint
            and public_id = ${effect.customerSelector.customerId}::uuid
          limit 1
        `;
      } else {
        identities = await sql<IdentityRow[]>`
          select customer_id::text
          from loyalty_private.resolve_commerce_customer(
            ${event.organization_id}::bigint,
            ${event.connection_id}::bigint,
            'registered',
            ${effect.customerSelector.externalCustomerId}
          )
        `;
      }
    } else {
      const identity = identityFromOrder(effect.order);
      identities = await sql<IdentityRow[]>`
        select customer_id::text
        from loyalty_private.resolve_commerce_customer(
          ${event.organization_id}::bigint,
          ${event.connection_id}::bigint,
          ${identity.kind},
          ${identity.externalId}
        )
      `;
    }
    const customerId = identities[0]?.customer_id;
    if (!customerId) throw new Error("customer_resolution_failed");

    const context = await loadProgrammeContext(
      sql,
      event.organization_id,
      event.programme_id,
      customerId,
    );
    if (effect.kind === "award" && context.definitionVersion === "2") {
      if (!effect.awardEligible) {
        await sql.begin(async (transaction) => {
          if (!effect.order.referral) {
            await finishEffect(
              transaction,
              workerId,
              event,
              "skipped",
              "referral.evidence_unavailable",
            );
            return;
          }
          const referrals = await transaction<
            { attribution_id: string | null; state: string; outcome: string }[]
          >`
            select attribution_id::text, state, outcome
            from loyalty_private.record_referral_attribution_v1(
              ${event.canonical_event_public_id}::uuid
            )
          `;
          const referral = referrals[0];
          if (!referral) throw new Error("referral_attribution_record_failed");
          const qualification = await recordReferralQualificationV1(
            transaction,
            event,
            customerId,
            effect.order,
          );
          if (qualification.evaluation_id && referral.attribution_id) {
            await transaction`
              select * from loyalty_private.finish_commerce_effect(
                ${event.canonical_event_public_id}::uuid,
                ${workerId},
                'applied',
                'loyalty.referral.qualification',
                ${`referral-qualification:${referral.attribution_id}`},
                ${`evaluation:${qualification.evaluation_id}`},
                null,
                0
              )
            `;
            return;
          }
          if (referral.outcome === "created" && referral.attribution_id) {
            await transaction`
              select * from loyalty_private.finish_commerce_effect(
                ${event.canonical_event_public_id}::uuid,
                ${workerId},
                'applied',
                'loyalty.referral.attribution',
                ${`referral-attribution:${referral.attribution_id}`},
                ${`referral-attribution:${referral.attribution_id}`},
                null,
                0
              )
            `;
            return;
          }
          await finishEffect(
            transaction,
            workerId,
            event,
            "skipped",
            `referral.${referral.outcome}`,
          );
        });
        return;
      }
      if (effect.order.referral) {
        const referrals = await sql<
          { attribution_id: string | null; state: string; outcome: string }[]
        >`
          select attribution_id::text, state, outcome
          from loyalty_private.record_referral_attribution_v1(
            ${event.canonical_event_public_id}::uuid
          )
        `;
        if (!referrals[0])
          throw new Error("referral_attribution_record_failed");
      }
      if (effect.order.referral || context.programme.referralPolicy) {
        await recordReferralQualificationV1(
          sql,
          event,
          customerId,
          effect.order,
        );
      }
    }
    if (effect.kind === "activity") {
      if (context.definitionVersion !== "2") {
        await finishEffect(
          sql,
          workerId,
          event,
          "skipped",
          "programme_v2_not_published",
        );
        return;
      }
      await commitActivityV2(sql, workerId, event, customerId, context, effect);
      return;
    }
    if (!effect.awardEligible) {
      await finishEffect(
        sql,
        workerId,
        event,
        "skipped",
        "referral.programme_v2_not_published",
      );
      return;
    }
    if (context.definitionVersion === "2") {
      if (
        effect.order.currency !== context.programme.currencyCode ||
        effect.order.currencyMinorUnitDigits !==
          context.programme.currencyMinorUnitDigits
      ) {
        throw new PermanentEffectError("programme_currency_mismatch");
      }
      await commitAwardV2(
        sql,
        workerId,
        event,
        customerId,
        context,
        effect.order,
      );
      return;
    }
    if (effect.order.currency !== context.programme.currencyCode) {
      throw new PermanentEffectError("programme_currency_mismatch");
    }
    const orderFact = toOrderAwardFact(
      effect.order,
      event.occurred_at,
      context.tierCode,
      false,
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
      error instanceof PermanentEffectError ||
      databaseCode(error) === "23514" ||
      databaseCode(error) === "22023";
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

async function processCustomerDeletion(
  sql: Sql,
  workerId: string,
  event: ClaimedEffect,
  effect: Extract<ParsedEffect, { kind: "customer_delete" }>,
): Promise<void> {
  await sql.begin(async (transaction) => {
    const cases = await transaction<
      { privacy_case_public_id: string; outcome: string }[]
    >`
      select privacy_case_public_id::text, outcome
      from loyalty_private.apply_woocommerce_customer_erasure(
        ${event.organization_id}::bigint,
        ${event.connection_id}::bigint,
        ${event.canonical_event_public_id}::uuid,
        ${workerId},
        ${effect.externalCustomerId}
      )
    `;
    const privacyCase = cases[0];
    if (!privacyCase) throw new Error("customer_erasure_record_failed");
    await transaction`
      select * from loyalty_private.finish_commerce_effect(
        ${event.canonical_event_public_id}::uuid,
        ${workerId},
        'applied',
        'privacy.customer.erasure',
        ${`privacy-case:${privacyCase.privacy_case_public_id}`},
        ${`privacy-case:${privacyCase.privacy_case_public_id}`},
        null,
        0
      )
    `;
  });
}

async function processCouponCapture(
  sql: Sql,
  workerId: string,
  event: ClaimedEffect,
  effect: Extract<ParsedEffect, { kind: "coupon_capture" }>,
): Promise<void> {
  const operation = `connection:${event.connection_id}:reservation:${effect.reservationId}:order:${effect.orderId}`;
  await sql.begin(async (transaction) => {
    const captures = await transaction<
      { transaction_public_id: string; outcome: string }[]
    >`
      select transaction_public_id::text, outcome
      from loyalty_private.capture_woocommerce_coupon_use(
        ${event.organization_id}::bigint,
        ${event.connection_id}::bigint,
        ${effect.reservationId}::uuid,
        ${effect.orderId},
        ${event.occurred_at}::timestamptz
      )
    `;
    const capture = captures[0];
    if (!capture) throw new Error("coupon_capture_record_failed");
    await transaction`
      select * from loyalty_private.finish_commerce_effect(
        ${event.canonical_event_public_id}::uuid,
        ${workerId},
        'applied',
        'loyalty.coupon.capture',
        ${operation},
        ${`ledger-transaction:${capture.transaction_public_id}`},
        null,
        0
      )
    `;
  });
}

export async function enqueueExpiredWooCommerceCouponCancellations(
  sql: Sql,
): Promise<number> {
  const rows = await sql<{ enqueued_count: string }[]>`
    select loyalty_private.enqueue_expired_woocommerce_coupon_cancellations(
      clock_timestamp(), 100
    )::text as enqueued_count
  `;
  return Number(rows[0]?.enqueued_count ?? "0");
}

export async function expireDueTierOverrides(sql: Sql): Promise<number> {
  const rows = await sql<{ expired_count: number | string }[]>`
    select expired_count
    from loyalty_private.expire_due_tier_overrides_v1(clock_timestamp(), 50)
  `;
  const rawCount = rows[0]?.expired_count ?? 0;
  const expiredCount = Number(rawCount);
  if (
    !Number.isSafeInteger(expiredCount) ||
    expiredCount < 0 ||
    expiredCount > 50
  ) {
    throw new Error("invalid_tier_override_expiry_count");
  }
  return expiredCount;
}

export type PointExpiryLifecycleResult = Readonly<{
  expiryBatches: number;
  expiredLots: number;
  expiredPoints: string;
  notificationsEnqueued: number;
}>;

export async function runPointExpiryLifecycle(
  sql: Sql,
): Promise<PointExpiryLifecycleResult> {
  const rows = await sql<
    {
      expiry_batches: number | string;
      expired_lots: number | string;
      expired_points: string;
      notifications_enqueued: number | string;
    }[]
  >`
    select expiry_batches, expired_lots, expired_points::text,
      notifications_enqueued
    from loyalty_private.run_point_expiry_lifecycle_v2(
      clock_timestamp(), 100
    )
  `;
  const row = rows[0];
  if (!row) throw new Error("point_expiry_lifecycle_result_unavailable");
  const expiryBatches = Number(row.expiry_batches);
  const expiredLots = Number(row.expired_lots);
  const notificationsEnqueued = Number(row.notifications_enqueued);
  if (
    !Number.isSafeInteger(expiryBatches) ||
    expiryBatches < 0 ||
    expiryBatches > 100 ||
    !Number.isSafeInteger(expiredLots) ||
    expiredLots < 0 ||
    !Number.isSafeInteger(notificationsEnqueued) ||
    notificationsEnqueued < 0 ||
    notificationsEnqueued > 100 ||
    !/^(?:0|[1-9][0-9]*)$/u.test(row.expired_points)
  ) {
    throw new Error("invalid_point_expiry_lifecycle_result");
  }
  return {
    expiryBatches,
    expiredLots,
    expiredPoints: row.expired_points,
    notificationsEnqueued,
  };
}

type ClaimedReferralRewardJob = Readonly<{
  job_id: string;
  attribution_id: string;
  attempt_count: number | string;
}>;

type ReferralRewardIssueRow = Readonly<{
  attribution_id: string;
  issuance_id: string | null;
  state: string;
  outcome: string;
}>;

export type ReferralRewardLifecycleResult = Readonly<{
  claimed: number;
  completed: number;
  cancelled: number;
  retryable: number;
  manualReview: number;
}>;

export async function runReferralRewardLifecycle(
  sql: Sql,
  workerId: string,
): Promise<ReferralRewardLifecycleResult> {
  const jobs = await sql<ClaimedReferralRewardJob[]>`
    select job_id::text, attribution_id::text, attempt_count
    from loyalty_private.claim_due_referral_reward_jobs_v1(
      ${workerId}, 25, 60
    )
  `;
  if (jobs.length > 25) {
    throw new Error("invalid_referral_reward_claim_result");
  }
  let completed = 0;
  let cancelled = 0;
  let retryable = 0;
  let manualReview = 0;
  for (const job of jobs) {
    const attemptCount = Number(job.attempt_count);
    if (
      !isUuid(job.job_id) ||
      !isUuid(job.attribution_id) ||
      !Number.isSafeInteger(attemptCount) ||
      attemptCount < 1 ||
      attemptCount > 10
    ) {
      throw new Error("invalid_referral_reward_claim_result");
    }
    try {
      const issues = await sql<ReferralRewardIssueRow[]>`
        select attribution_id::text, issuance_id::text, state, outcome
        from loyalty_private.issue_referral_reward_job_v1(
          ${job.job_id}::uuid, ${workerId}
        )
      `;
      const issue = issues[0];
      if (
        !issue ||
        issue.attribution_id !== job.attribution_id ||
        !["created", "duplicate", "state_final"].includes(issue.outcome) ||
        ((issue.outcome === "created" || issue.outcome === "duplicate") &&
          !isUuid(issue.issuance_id))
      ) {
        throw new Error("invalid_referral_reward_issue_result");
      }
      if (issue.outcome === "state_final") cancelled += 1;
      else completed += 1;
    } catch {
      const finishes = await sql<{ state: string; outcome: string }[]>`
        select state, outcome
        from loyalty_private.finish_referral_reward_job_v1(
          ${job.job_id}::uuid,
          ${workerId},
          'referral_reward_issue_failed',
          ${retryDelay(attemptCount)}
        )
      `;
      const finish = finishes[0];
      if (!finish || !["retryable", "manual_review"].includes(finish.state)) {
        throw new Error("invalid_referral_reward_finish_result");
      }
      if (finish.state === "manual_review") manualReview += 1;
      else retryable += 1;
    }
  }
  return {
    claimed: jobs.length,
    completed,
    cancelled,
    retryable,
    manualReview,
  };
}

type ClaimedCampaignTriggerJob = Readonly<{
  job_id: string;
  campaign_version_id: string;
  trigger_kind: string;
  action: string;
  source_reference: string;
  occurred_at: string | Date;
  attempt_count: number | string;
}>;

type CampaignLifecycleTransitionRow = Readonly<{
  campaign_version_id: string;
  from_status: string;
  to_status: string;
  transitioned_at: string | Date;
}>;

export type CampaignLifecycleAdvanceResult = Readonly<{
  activated: number;
  completed: number;
}>;

export async function advanceCampaignLifecycle(
  sql: Sql,
): Promise<CampaignLifecycleAdvanceResult> {
  const rows = await sql<CampaignLifecycleTransitionRow[]>`
    select campaign_version_id::text, from_status, to_status, transitioned_at
    from loyalty_private.advance_campaign_lifecycle_v1(100)
  `;
  if (rows.length > 100) {
    throw new Error("invalid_campaign_lifecycle_result");
  }
  let activated = 0;
  let completed = 0;
  for (const row of rows) {
    const transitionedAt =
      row.transitioned_at instanceof Date
        ? row.transitioned_at
        : new Date(row.transitioned_at);
    const validTransition =
      (row.from_status === "scheduled" && row.to_status === "active") ||
      (["scheduled", "active", "paused"].includes(row.from_status) &&
        row.to_status === "completed");
    if (
      !isUuid(row.campaign_version_id) ||
      !validTransition ||
      Number.isNaN(transitionedAt.valueOf())
    ) {
      throw new Error("invalid_campaign_lifecycle_result");
    }
    if (row.to_status === "active") activated += 1;
    else completed += 1;
  }
  return { activated, completed };
}

type CampaignTriggerExecutionRow = Readonly<{
  job_id: string;
  campaign_version_id: string;
  action: string;
  outcome: string;
  allocation_id: string | null;
  transaction_id: string | null;
  reward_reservation_id: string | null;
}>;

export type CampaignTriggerLifecycleResult = Readonly<{
  enqueued: number;
  claimed: number;
  completed: number;
  reversed: number;
  controls: number;
  capacityExhausted: number;
  retryable: number;
  manualReview: number;
}>;

export async function runCampaignTriggerLifecycle(
  sql: Sql,
  workerId: string,
): Promise<CampaignTriggerLifecycleResult> {
  const enqueuedRows = await sql<{ enqueued: number | string }[]>`
    select loyalty_private.enqueue_due_limited_campaigns_v1(
      clock_timestamp(), 100
    ) as enqueued
  `;
  const enqueued = Number(enqueuedRows[0]?.enqueued);
  if (!Number.isSafeInteger(enqueued) || enqueued < 0 || enqueued > 100) {
    throw new Error("invalid_limited_campaign_enqueue_result");
  }
  const rows = await sql<ClaimedCampaignTriggerJob[]>`
    select job_id::text, campaign_version_id::text, trigger_kind, action,
      source_reference, occurred_at, attempt_count
    from loyalty_private.claim_due_campaign_trigger_jobs_v1(
      ${workerId}, 25, 60
    )
  `;
  if (rows.length > 25) {
    throw new Error("invalid_campaign_trigger_claim_result");
  }
  const jobs = rows.map((row) =>
    campaignTriggerJobV1.parse({
      schemaVersion: "1",
      jobId: row.job_id,
      campaignVersionId: row.campaign_version_id,
      triggerKind: row.trigger_kind,
      action: row.action,
      sourceReference: row.source_reference,
      occurredAt:
        row.occurred_at instanceof Date
          ? row.occurred_at.toISOString()
          : row.occurred_at,
      attemptCount: Number(row.attempt_count),
    }),
  );
  let completed = 0;
  let reversed = 0;
  let controls = 0;
  let capacityExhausted = 0;
  let retryable = 0;
  let manualReview = 0;
  for (const job of jobs) {
    try {
      const executions = await sql<CampaignTriggerExecutionRow[]>`
        select job_id::text, campaign_version_id::text, action, outcome,
          allocation_id::text, transaction_id::text,
          reward_reservation_id::text
        from loyalty_private.execute_campaign_trigger_job_v1(
          ${job.jobId}::uuid, ${workerId}
        )
      `;
      const row = executions[0];
      if (!row) throw new Error("campaign_trigger_execution_unavailable");
      const execution: CampaignTriggerExecutionV1 =
        campaignTriggerExecutionV1.parse({
          schemaVersion: "1",
          jobId: row.job_id,
          campaignVersionId: row.campaign_version_id,
          action: row.action,
          outcome: row.outcome,
          allocationId: row.allocation_id,
          transactionId: row.transaction_id,
          rewardReservationId: row.reward_reservation_id,
        });
      if (
        execution.jobId !== job.jobId ||
        execution.campaignVersionId !== job.campaignVersionId ||
        execution.action !== job.action
      ) {
        throw new Error("campaign_trigger_execution_identity_mismatch");
      }
      completed += 1;
      if (
        execution.outcome === "points_reversed" ||
        (execution.outcome.startsWith("reward_") &&
          execution.outcome !== "reward_reserved")
      ) {
        reversed += 1;
      }
      if (execution.outcome === "control") controls += 1;
      if (execution.outcome === "capacity_exhausted") {
        capacityExhausted += 1;
      }
    } catch (error) {
      const errorCode = databaseCode(error);
      const deterministicFailure = [
        "22003",
        "22023",
        "23514",
        "P0002",
        "P0003",
      ].includes(errorCode ?? "");
      const finishes = await sql<{ state: string; outcome: string }[]>`
        select state, outcome
        from loyalty_private.finish_campaign_trigger_job_v1(
          ${job.jobId}::uuid,
          ${workerId},
          ${
            deterministicFailure
              ? errorCode === "22023" || errorCode === "22003"
                ? "campaign_trigger_input_invalid"
                : "campaign_trigger_contract_failed"
              : "campaign_trigger_execution_failed"
          },
          ${retryDelay(job.attemptCount)}
        )
      `;
      const finish = finishes[0];
      if (!finish || !["retryable", "manual_review"].includes(finish.state)) {
        throw new Error("invalid_campaign_trigger_finish_result");
      }
      if (finish.state === "manual_review") manualReview += 1;
      else retryable += 1;
    }
  }
  return {
    enqueued,
    claimed: jobs.length,
    completed,
    reversed,
    controls,
    capacityExhausted,
    retryable,
    manualReview,
  };
}

async function processRefund(
  sql: Sql | TransactionSql,
  workerId: string,
  event: ClaimedEffect,
  effect: Extract<ParsedEffect, { kind: "refund" }>,
): Promise<void> {
  const operation = `connection:${event.connection_id}:order:${effect.order.orderId}`;
  const awardEvaluationKey = `woo:evaluation:award:${operation}`;
  const awardLedgerKey = `woo:ledger:award:${operation}`;
  const referralRefunds = await sql<ReferralRefundRow[]>`
    select attribution_id::text, state, outcome
    from loyalty_private.reject_referral_for_refund_v1(
      ${event.canonical_event_public_id}::uuid
    )
  `;
  const referralRefund = referralRefunds[0];
  if (!referralRefund) {
    throw new Error("referral_refund_result_unavailable");
  }
  const originals = await sql<OriginalAwardRow[]>`
    select evaluation.public_id::text as evaluation_public_id,
      evaluation.programme_group_id::text,
      evaluation.programme_version_id::text,
      evaluation.result,
      origin_entry.public_id::text as origin_entry_public_id,
      coalesce((
        select sum(reversal_entry.points)::bigint
        from loyalty.ledger_entries as reversal_entry
        join loyalty.ledger_accounts as reversal_account
          on reversal_account.id = reversal_entry.account_id
        join loyalty.ledger_transactions as reversal_transaction
          on reversal_transaction.id = reversal_entry.transaction_id
        where reversal_entry.organization_id = evaluation.organization_id
          and reversal_entry.origin_entry_id = origin_entry.id
          and reversal_account.account_kind = 'reversed'
          and reversal_transaction.transaction_kind = 'refund_reversal'
      ), 0)::text as already_reversed_points
    from loyalty_private.programme_evaluations as evaluation
    left join loyalty.ledger_transactions as award_transaction
      on award_transaction.organization_id = evaluation.organization_id
     and award_transaction.idempotency_key = ${awardLedgerKey}
     and award_transaction.transaction_kind = 'award'
    left join loyalty.ledger_entries as origin_entry
      on origin_entry.organization_id = award_transaction.organization_id
     and origin_entry.transaction_id = award_transaction.id
     and origin_entry.points > 0
    left join loyalty.ledger_accounts as origin_account
      on origin_account.id = origin_entry.account_id
     and origin_account.account_kind = 'pending'
    where evaluation.organization_id = ${event.organization_id}::bigint
      and evaluation.idempotency_key = ${awardEvaluationKey}
      and (origin_entry.id is null or origin_account.id is not null)
    limit 1
  `;
  const original = originals[0];
  if (!original) {
    if (
      referralRefund.attribution_id &&
      referralRefund.outcome !== "compensation_required"
    ) {
      await sql`
        select * from loyalty_private.finish_commerce_effect(
          ${event.canonical_event_public_id}::uuid,
          ${workerId},
          'applied',
          ${
            referralRefund.outcome === "reversed"
              ? "loyalty.referral.refund_compensation"
              : "loyalty.referral.refund_rejection"
          },
          ${`referral-refund:${referralRefund.attribution_id}`},
          ${`referral-attribution:${referralRefund.attribution_id}`},
          null,
          0
        )
      `;
      return;
    }
    throw new RetryableEffectError("original_award_not_found");
  }
  if (original.result.version === "2") {
    await processRefundV2(sql, workerId, event, effect, original);
    return;
  }
  const originalEligibleSpend = evidenceInteger(
    original.result,
    "eligibleSpendMinor",
  );
  const originalAwardedPoints = evidenceInteger(
    original.result,
    "awardedPoints",
  );
  const originalTierCode = evidenceString(original.result, "tierCodeSnapshot");
  const originalOccurredAt = evidenceString(original.result, "pendingAt");
  if (originalAwardedPoints > 0 && original.origin_entry_public_id === null) {
    throw new RetryableEffectError("original_award_entry_not_found");
  }
  const context = await loadProgrammeVersion(
    sql,
    event.organization_id,
    original.programme_version_id,
  );
  if (
    context.definitionVersion !== "1" ||
    effect.order.currency !== context.programme.currencyCode
  ) {
    throw new PermanentEffectError("programme_currency_mismatch");
  }
  const orderFact = toOrderAwardFact(
    effect.order,
    originalOccurredAt,
    originalTierCode,
    true,
  );
  const currentEvaluation = evaluateOrderAward(
    context.programme,
    [],
    orderFact,
  );
  const alreadyReversedPoints = toSafeInteger(original.already_reversed_points);
  const { cumulativeRefundedEligibleSpend, reversalPoints } =
    calculateCumulativeRefundPlan({
      originalEligibleSpend,
      originalAwardedPoints,
      currentEligibleSpend: currentEvaluation.eligibleSpendMinor,
      alreadyReversedPoints,
    });
  await commitRefund(sql, workerId, event, effect.refundId, {
    programmeGroupId: original.programme_group_id,
    programmeVersionId: original.programme_version_id,
    originEntryPublicId: original.origin_entry_public_id,
    orderFact,
    currentEvaluation,
    originalEligibleSpend,
    originalAwardedPoints,
    cumulativeRefundedEligibleSpend,
    alreadyReversedPoints,
    reversalPoints,
  });
}

async function processRefundV2(
  sql: Sql | TransactionSql,
  workerId: string,
  event: ClaimedEffect,
  effect: Extract<ParsedEffect, { kind: "refund" }>,
  original: OriginalAwardRow,
): Promise<void> {
  const originalEligibleSpend = evidenceBigintString(
    original.result,
    "eligibleSpendMinor",
  );
  const originalAwardedPoints = evidenceBigintString(
    original.result,
    "awardedPoints",
  );
  const originalTierCode = evidenceString(original.result, "tierCodeSnapshot");
  const originalEventId = evidenceString(original.result, "eventId");
  const originalOccurredAt = evidenceString(original.result, "pendingAt");
  if (
    BigInt(originalAwardedPoints) > 0n &&
    original.origin_entry_public_id === null
  ) {
    throw new RetryableEffectError("original_award_entry_not_found");
  }
  const context = await loadProgrammeVersion(
    sql,
    event.organization_id,
    original.programme_version_id,
  );
  if (
    context.definitionVersion !== "2" ||
    effect.order.currency !== context.programme.currencyCode ||
    effect.order.currencyMinorUnitDigits !==
      context.programme.currencyMinorUnitDigits
  ) {
    throw new PermanentEffectError("programme_currency_mismatch");
  }
  const orderFact = {
    ...toPurchaseEarningFactV2(effect.order, event, originalTierCode, {}, true),
    eventId: originalEventId,
    occurredAt: new Date(originalOccurredAt).toISOString(),
  } satisfies PurchaseEarningFactV2;
  const currentEvaluation = evaluateEarningV2(context.programme, orderFact);
  const plan = calculateCumulativeRefundPlanV2({
    originalEligibleSpend,
    originalAwardedPoints,
    currentEligibleSpend: currentEvaluation.eligibleSpendMinor,
    alreadyReversedPoints: original.already_reversed_points,
  });
  await commitRefundV2(sql, workerId, event, effect.refundId, {
    originalEvaluationPublicId: original.evaluation_public_id,
    programmeGroupId: original.programme_group_id,
    programmeVersionId: original.programme_version_id,
    originEntryPublicId: original.origin_entry_public_id,
    orderFact,
    currentEvaluation,
    originalEligibleSpend,
    originalAwardedPoints,
    alreadyReversedPoints: original.already_reversed_points,
    ...plan,
  });
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
  sql: Sql | TransactionSql,
  organizationId: string,
  programmeId: string,
  customerId: string,
): Promise<ProgrammeContext> {
  const rows = await sql<ProgrammeRow[]>`
    select programme.programme_group_id::text,
      version.id::text as programme_version_id,
      version.public_id::text as programme_version_public_id,
      version.version_number,
      tier.code as tier_code,
      tier.name as tier_name,
      tier.minimum_eligible_spend_minor::text,
      tier.points_per_major_unit::text,
      tier.ordinal,
      version.configuration
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
  const memberTierCode = memberships[0]?.tier_code ?? first.tier_code;
  if (
    first.configuration &&
    typeof first.configuration === "object" &&
    "version" in first.configuration &&
    first.configuration.version === "2"
  ) {
    const programme = programmeDefinitionV2.parse(first.configuration);
    return {
      definitionVersion: "2",
      programmeGroupId: first.programme_group_id,
      programmeVersionId: first.programme_version_id,
      tierCode: memberTierCode,
      programme,
    };
  }
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
    definitionVersion: "1",
    programmeGroupId: first.programme_group_id,
    programmeVersionId: first.programme_version_id,
    tierCode: memberTierCode,
    programme,
  };
}

async function loadProgrammeVersion(
  sql: Sql | TransactionSql,
  organizationId: string,
  programmeVersionIdValue: string,
): Promise<LegacyProgrammeContext | V2ProgrammeContext> {
  const rows = await sql<ProgrammeRow[]>`
    select programme.programme_group_id::text,
      version.id::text as programme_version_id,
      version.public_id::text as programme_version_public_id,
      version.version_number,
      tier.code as tier_code,
      tier.name as tier_name,
      tier.minimum_eligible_spend_minor::text,
      tier.points_per_major_unit::text,
      tier.ordinal,
      version.configuration
    from loyalty.programme_versions as version
    join loyalty.programmes as programme
      on programme.organization_id = version.organization_id
     and programme.id = version.programme_id
    join loyalty.programme_tiers as tier
      on tier.organization_id = version.organization_id
     and tier.programme_version_id = version.id
    where version.organization_id = ${organizationId}::bigint
      and version.id = ${programmeVersionIdValue}::bigint
      and version.status in ('published', 'superseded', 'retired')
    order by tier.ordinal
  `;
  const first = rows[0];
  if (!first) throw new RetryableEffectError("original_programme_unavailable");
  if (
    first.configuration &&
    typeof first.configuration === "object" &&
    "version" in first.configuration &&
    first.configuration.version === "2"
  ) {
    const programme = programmeDefinitionV2.parse(first.configuration);
    return {
      definitionVersion: "2",
      programmeGroupId: first.programme_group_id,
      programmeVersionId: first.programme_version_id,
      tierCode: programme.tiers[0]!.code,
      programme,
    };
  }
  const programme = {
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
    definitionVersion: "1",
    programmeGroupId: first.programme_group_id,
    programmeVersionId: first.programme_version_id,
    tierCode: first.tier_code,
    programme,
  };
}

export function toOrderAwardFact(
  order: WooCommerceOrderFactV1,
  occurredAt: string,
  tierSnapshot: string,
  includeRefunds: boolean,
) {
  const toMinor = (value: string) =>
    minorUnit(
      toSafeInteger(
        wooAmountToMinorString(value, order.currencyMinorUnitDigits),
      ),
    );
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
          refundedMinor: includeRefunds
            ? toMinor(line.refundedTotal)
            : minorUnit(0),
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

function wooAmountToMinorString(value: string, digits: number): string {
  const [major, fraction = ""] = value.split(".");
  if (
    major === undefined ||
    !/^(?:0|[1-9][0-9]*)$/u.test(major) ||
    !/^[0-9]*$/u.test(fraction) ||
    fraction.length > digits
  ) {
    throw new PermanentEffectError("invalid_woocommerce_amount");
  }
  return (
    BigInt(major) * 10n ** BigInt(digits) +
    BigInt(fraction.padEnd(digits, "0") || "0")
  ).toString();
}

export function toPurchaseEarningFactV2(
  order: WooCommerceOrderFactV1,
  event: Pick<
    ClaimedEffect,
    "connection_id" | "source_event_id" | "occurred_at"
  >,
  tierSnapshot: string,
  memberRuleUsage: Readonly<Record<string, string>>,
  includeRefunds: boolean,
): PurchaseEarningFactV2 {
  const toMinor = (value: string) =>
    wooAmountToMinorString(value, order.currencyMinorUnitDigits);
  return {
    source: "purchase",
    eventId: `woocommerce:${event.connection_id}:${event.source_event_id}`,
    occurredAt: new Date(event.occurred_at).toISOString(),
    channel: "woocommerce",
    segmentCodes: [],
    tierCode: tierSnapshot,
    memberRuleUsage,
    currencyCode: order.currency,
    market: order.market,
    lines: order.lines.map((line) => {
      const grossMinor = toMinor(line.subtotal);
      const paidMinor = toMinor(line.total);
      const discountMinor = BigInt(grossMinor) - BigInt(paidMinor);
      if (discountMinor < 0n) {
        throw new PermanentEffectError("invalid_woocommerce_line_discount");
      }
      return {
        lineId: `product:${line.lineId}`,
        productId: line.productId,
        categoryIds: line.categoryIds,
        grossMinor,
        discountMinor: discountMinor.toString(),
        refundedMinor: includeRefunds ? toMinor(line.refundedTotal) : "0",
        paymentKind: order.paymentKind,
      };
    }),
    shippingMinor: toMinor(order.shippingTotal),
    shippingRefundedMinor: includeRefunds
      ? toMinor(order.shippingRefundedTotal)
      : "0",
    taxMinor: toMinor(order.taxTotal),
    taxRefundedMinor: includeRefunds ? toMinor(order.taxRefundedTotal) : "0",
    feeMinor: toMinor(order.feeTotal),
    feeRefundedMinor: includeRefunds ? toMinor(order.feeRefundedTotal) : "0",
  };
}

export function calculateCumulativeRefundPlanV2(
  input: Readonly<{
    originalEligibleSpend: string;
    originalAwardedPoints: string;
    currentEligibleSpend: string;
    alreadyReversedPoints: string;
  }>,
): { cumulativeRefundedEligibleSpend: string; reversalPoints: string } {
  const originalEligibleSpend = parseUnsignedBigint(
    input.originalEligibleSpend,
    "original eligible spend",
  );
  const originalAwardedPoints = parseUnsignedBigint(
    input.originalAwardedPoints,
    "original awarded points",
  );
  const currentEligibleSpend = parseUnsignedBigint(
    input.currentEligibleSpend,
    "current eligible spend",
  );
  const alreadyReversedPoints = parseUnsignedBigint(
    input.alreadyReversedPoints,
    "already reversed points",
  );
  if (currentEligibleSpend > originalEligibleSpend) {
    throw new PermanentEffectError("cumulative_refund_moved_backwards");
  }
  if (alreadyReversedPoints > originalAwardedPoints) {
    throw new PermanentEffectError("invalid_original_award_evidence");
  }
  const cumulativeRefundedEligibleSpend =
    originalEligibleSpend - currentEligibleSpend;
  const targetCumulative =
    cumulativeRefundedEligibleSpend === originalEligibleSpend
      ? originalAwardedPoints
      : originalEligibleSpend === 0n
        ? 0n
        : (originalAwardedPoints * cumulativeRefundedEligibleSpend) /
          originalEligibleSpend;
  if (targetCumulative < alreadyReversedPoints) {
    throw new PermanentEffectError("cumulative_refund_moved_backwards");
  }
  return {
    cumulativeRefundedEligibleSpend: cumulativeRefundedEligibleSpend.toString(),
    reversalPoints: (targetCumulative - alreadyReversedPoints).toString(),
  };
}

function tierPurchaseMultiplier(context: V2ProgrammeContext): number {
  if (!context.programme.tierPolicy) return 10_000;
  const level = context.programme.tierPolicy.levels.find(
    (candidate) => candidate.tierCode === context.tierCode,
  );
  if (!level) throw new Error("tier_benefit_level_unavailable");
  return level.benefits.earningMultiplierBasisPoints;
}

async function recordReferralQualificationV1(
  sql: Sql | TransactionSql,
  event: ClaimedEffect,
  customerId: string,
  order: WooCommerceOrderFactV1,
): Promise<ReferralQualificationRow> {
  const contexts = await sql<ReferralQualificationContextRow[]>`
    select attribution_id::text, programme_version_id::text,
      current_state, qualification_status, outcome
    from loyalty_private.get_referral_qualification_context_v1(
      ${event.canonical_event_public_id}::uuid
    )
  `;
  const qualificationContext = contexts[0];
  if (!qualificationContext) {
    throw new Error("referral_qualification_context_unavailable");
  }
  if (qualificationContext.outcome !== "ready") {
    return {
      attribution_id: qualificationContext.attribution_id,
      evaluation_id: null,
      state: qualificationContext.current_state ?? "ignored",
      outcome: qualificationContext.outcome,
      cooling_ends_at: null,
    };
  }
  if (!qualificationContext.programme_version_id) {
    throw new Error("referral_qualification_programme_unavailable");
  }
  const historicalContext = await loadProgrammeVersion(
    sql,
    event.organization_id,
    qualificationContext.programme_version_id,
  );
  if (
    historicalContext.definitionVersion !== "2" ||
    !historicalContext.programme.referralPolicy
  ) {
    throw new PermanentEffectError("referral_qualification_policy_mismatch");
  }
  if (
    order.currency !== historicalContext.programme.currencyCode ||
    order.currencyMinorUnitDigits !==
      historicalContext.programme.currencyMinorUnitDigits
  ) {
    throw new PermanentEffectError("referral_qualification_currency_mismatch");
  }

  const operation = `connection:${event.connection_id}:event:${event.canonical_event_public_id}`;
  const evaluationKey = `woo:evaluation:referral-qualification:${operation}`;
  const usageRows = await sql<MemberRuleUsageRow[]>`
    select rule_code, consumed_points::text
    from loyalty_private.get_member_earning_rule_usage(
      ${event.organization_id}::bigint,
      ${historicalContext.programmeGroupId}::bigint,
      ${historicalContext.programmeVersionId}::bigint,
      ${customerId}::bigint,
      ${event.occurred_at}::timestamptz,
      ${evaluationKey}
    )
  `;
  const orderFact = toPurchaseEarningFactV2(
    order,
    event,
    historicalContext.tierCode,
    Object.fromEntries(
      usageRows.map((row) => [row.rule_code, row.consumed_points]),
    ),
    false,
  );
  const evaluation = evaluateEarningV2(historicalContext.programme, orderFact);
  const inputHash = evidenceSha256({
    version: "2",
    programmeVersionId: historicalContext.programmeVersionId,
    referralOrder: orderFact,
  });
  const resultHash = evidenceSha256(evaluation);
  const evaluatedAt = new Date().toISOString();
  const rows = await sql<ReferralQualificationRow[]>`
    select attribution_id::text, evaluation_id::text, state, outcome,
      cooling_ends_at
    from loyalty_private.record_referral_qualification_v1(
      ${event.canonical_event_public_id}::uuid,
      ${Buffer.from(inputHash, "hex")},
      ${Buffer.from(resultHash, "hex")},
      ${JSON.stringify(evaluation)}::jsonb,
      ${JSON.stringify({ lines: evaluation.lines })}::jsonb,
      ${evaluatedAt}::timestamptz
    )
  `;
  const qualification = rows[0];
  if (!qualification) {
    throw new Error("referral_qualification_record_failed");
  }
  return qualification;
}

async function commitAwardV2(
  sql: Sql,
  workerId: string,
  event: ClaimedEffect,
  customerId: string,
  context: V2ProgrammeContext,
  order: WooCommerceOrderFactV1,
): Promise<void> {
  const operation = `connection:${event.connection_id}:order:${order.orderId}`;
  const evaluationKey = `woo:evaluation:award:${operation}`;
  const awardKey = `woo:ledger:award:${operation}`;
  const evaluatedAt = new Date().toISOString();
  await sql.begin(async (transaction) => {
    const usageRows = await transaction<MemberRuleUsageRow[]>`
      select rule_code, consumed_points::text
      from loyalty_private.get_member_earning_rule_usage(
        ${event.organization_id}::bigint,
        ${context.programmeGroupId}::bigint,
        ${context.programmeVersionId}::bigint,
        ${customerId}::bigint,
        ${event.occurred_at}::timestamptz,
        ${evaluationKey}
      )
    `;
    const memberRuleUsage = Object.fromEntries(
      usageRows.map((row) => [row.rule_code, row.consumed_points]),
    );
    const orderFact = toPurchaseEarningFactV2(
      order,
      event,
      context.tierCode,
      memberRuleUsage,
      false,
    );
    const campaignRows = await transaction<CampaignPurchaseContextRow[]>`
      select campaign_version_public_id::text, campaign_code, assignment,
        behavior, remaining_global_effects, remaining_member_effects,
        remaining_points
      from loyalty_private.get_purchase_campaign_context_v1(
        ${event.organization_id}::bigint,
        ${context.programmeGroupId}::bigint,
        ${context.programmeVersionId}::bigint,
        ${customerId}::bigint,
        ${event.occurred_at}::timestamptz,
        ${operation}
      )
    `;
    const campaignContext = campaignRows.map((row) =>
      campaignPurchaseCandidateV1.parse({
        schemaVersion: "1",
        campaignVersionId: row.campaign_version_public_id,
        campaignCode: row.campaign_code,
        assignment: row.assignment,
        behavior: row.behavior,
        remainingGlobalEffects: row.remaining_global_effects,
        remainingMemberEffects: row.remaining_member_effects,
        remainingPoints: row.remaining_points,
      }),
    );
    const campaignResult =
      campaignContext.length === 0
        ? null
        : evaluatePurchaseCampaignsV1(
            context.programme,
            orderFact,
            campaignContext,
          );
    const baselineEvaluation =
      campaignResult?.baselineProgrammeEvaluation ??
      evaluateEarningV2(context.programme, orderFact);
    const evaluation =
      campaignResult?.programmeEvaluation ?? baselineEvaluation;
    const inputHash = evidenceSha256({
      version: "2",
      programmeVersionId: context.programmeVersionId,
      order: orderFact,
    });
    const resultHash = evidenceSha256(evaluation);
    const explanation = {
      lines: evaluation.lines,
      tierMultiplierBasisPoints: tierPurchaseMultiplier(context),
    };
    let awards: (V2AwardRow | CampaignPurchaseCommitRow)[];
    if (campaignResult === null) {
      awards = await transaction<V2AwardRow[]>`
        select evaluation_public_id::text,
          transaction_public_id::text,
          outcome
        from loyalty_private.commit_programme_v2_award(
          ${event.organization_id}::bigint,
          ${context.programmeGroupId}::bigint,
          ${context.programmeVersionId}::bigint,
          ${event.canonical_event_id}::bigint,
          ${customerId}::bigint,
          ${`woocommerce:order:${order.orderId}`},
          ${evaluationKey},
          ${awardKey},
          ${Buffer.from(inputHash, "hex")},
          ${Buffer.from(resultHash, "hex")},
          ${JSON.stringify(evaluation)}::jsonb,
          ${JSON.stringify(explanation)}::jsonb,
          ${event.occurred_at}::timestamptz,
          ${evaluatedAt}::timestamptz
        )
      `;
    } else {
      const campaignInputHash = evidenceSha256({
        version: "1",
        operation,
        programmeVersionId: context.programmeVersionId,
        order: orderFact,
        candidates: campaignContext,
      });
      const campaignResultHash = evidenceSha256({
        baselineProgrammeEvaluation: campaignResult.baselineProgrammeEvaluation,
        programmeEvaluation: campaignResult.programmeEvaluation,
        campaignEvaluation: campaignResult.campaignEvaluation,
      });
      awards = await transaction<CampaignPurchaseCommitRow[]>`
        select evaluation_public_id::text,
          transaction_public_id::text,
          campaign_batch_public_id::text,
          campaign_points,
          outcome
        from loyalty_private.commit_purchase_campaign_execution_v1(
          ${event.organization_id}::bigint,
          ${context.programmeGroupId}::bigint,
          ${context.programmeVersionId}::bigint,
          ${event.canonical_event_id}::bigint,
          ${customerId}::bigint,
          ${`woocommerce:order:${order.orderId}`},
          ${evaluationKey},
          ${awardKey},
          ${Buffer.from(inputHash, "hex")},
          ${Buffer.from(resultHash, "hex")},
          ${JSON.stringify(evaluation)}::jsonb,
          ${JSON.stringify(explanation)}::jsonb,
          ${operation},
          ${Buffer.from(campaignInputHash, "hex")},
          ${Buffer.from(campaignResultHash, "hex")},
          ${JSON.stringify(campaignContext)}::jsonb,
          ${JSON.stringify(campaignResult.baselineProgrammeEvaluation)}::jsonb,
          ${JSON.stringify(campaignResult.campaignEvaluation)}::jsonb,
          ${event.occurred_at}::timestamptz,
          ${evaluatedAt}::timestamptz
        )
      `;
    }
    const award = awards[0];
    if (!award) throw new Error("v2_award_record_failed");
    await applyAdvancedTierQualificationV2(
      transaction,
      event,
      customerId,
      context,
      evaluatedAt,
    );
    const resultReference = award.transaction_public_id
      ? `ledger-transaction:${award.transaction_public_id}`
      : "campaign_batch_public_id" in award
        ? `campaign-execution:${award.campaign_batch_public_id}`
        : `evaluation:${award.evaluation_public_id}`;
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

async function commitActivityV2(
  sql: Sql,
  workerId: string,
  event: ClaimedEffect,
  customerId: string,
  context: V2ProgrammeContext,
  activity: Extract<ParsedEffect, { kind: "activity" }>,
): Promise<void> {
  const operation = `connection:${event.connection_id}:activity:${event.canonical_event_public_id}`;
  const evaluationKey = `woo:evaluation:activity:${operation}`;
  const awardKey = `woo:ledger:activity:${operation}`;
  const evaluatedAt = new Date().toISOString();
  await sql.begin(async (transaction) => {
    const usageRows = await transaction<MemberRuleUsageRow[]>`
      select rule_code, consumed_points::text
      from loyalty_private.get_member_earning_rule_usage(
        ${event.organization_id}::bigint,
        ${context.programmeGroupId}::bigint,
        ${context.programmeVersionId}::bigint,
        ${customerId}::bigint,
        ${event.occurred_at}::timestamptz,
        ${evaluationKey}
      )
    `;
    const fact: ActivityEarningFactV2 = {
      source: activity.source,
      eventId: `${activity.channel}:${event.connection_id}:${event.source_event_id}`,
      occurredAt: new Date(event.occurred_at).toISOString(),
      channel: activity.channel,
      segmentCodes: [],
      tierCode: context.tierCode,
      memberRuleUsage: Object.fromEntries(
        usageRows.map((row) => [row.rule_code, row.consumed_points]),
      ),
      verified: true,
      activityReference: activity.activityReference,
      activityCode: activity.activityCode,
      productId: activity.productId,
      categoryIds: activity.categoryIds,
    };
    const evaluation = evaluateEarningV2(context.programme, fact);
    const inputHash = evidenceSha256({
      version: "2",
      programmeVersionId: context.programmeVersionId,
      activity: fact,
    });
    const resultHash = evidenceSha256(evaluation);
    const awards = await transaction<V2AwardRow[]>`
      select evaluation_public_id::text,
        transaction_public_id::text,
        outcome
      from loyalty_private.commit_programme_v2_award(
        ${event.organization_id}::bigint,
        ${context.programmeGroupId}::bigint,
        ${context.programmeVersionId}::bigint,
        ${event.canonical_event_id}::bigint,
        ${customerId}::bigint,
        ${activity.activityReference},
        ${evaluationKey},
        ${awardKey},
        ${Buffer.from(inputHash, "hex")},
        ${Buffer.from(resultHash, "hex")},
        ${JSON.stringify(evaluation)}::jsonb,
        ${JSON.stringify({
          activity: activity.activityCode,
          tierMultiplierBasisPoints: 10_000,
        })}::jsonb,
        ${event.occurred_at}::timestamptz,
        ${evaluatedAt}::timestamptz
      )
    `;
    const award = awards[0];
    if (!award) throw new Error("v2_activity_award_record_failed");
    await applyAdvancedTierQualificationV2(
      transaction,
      event,
      customerId,
      context,
      evaluatedAt,
    );
    const resultReference = award.transaction_public_id
      ? `ledger-transaction:${award.transaction_public_id}`
      : `evaluation:${award.evaluation_public_id}`;
    await transaction`
      select * from loyalty_private.finish_commerce_effect(
        ${event.canonical_event_public_id}::uuid,
        ${workerId},
        'applied',
        'loyalty.activity.award',
        ${operation},
        ${resultReference},
        null,
        0
      )
    `;
  });
}

async function commitAward(
  sql: Sql,
  workerId: string,
  event: ClaimedEffect,
  customerId: string,
  context: LegacyProgrammeContext,
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

async function commitRefund(
  sql: Sql | TransactionSql,
  workerId: string,
  event: ClaimedEffect,
  refundId: string,
  context: Readonly<{
    programmeGroupId: string;
    programmeVersionId: string;
    originEntryPublicId: string | null;
    orderFact: ReturnType<typeof toOrderAwardFact>;
    currentEvaluation: OrderAwardEvaluation;
    originalEligibleSpend: number;
    originalAwardedPoints: number;
    cumulativeRefundedEligibleSpend: number;
    alreadyReversedPoints: number;
    reversalPoints: number;
  }>,
): Promise<void> {
  const operation = `connection:${event.connection_id}:order:${context.orderFact.orderId}:refund:${refundId}`;
  const evaluationKey = `woo:evaluation:refund:${operation}`;
  const reversalKey = `woo:ledger:refund:${operation}`;
  const result = {
    programmeVersionId: context.currentEvaluation.programmeVersionId,
    orderId: context.orderFact.orderId,
    refundId,
    originalEligibleSpendMinor: context.originalEligibleSpend,
    originalAwardedPoints: context.originalAwardedPoints,
    cumulativeRefundedEligibleSpendMinor:
      context.cumulativeRefundedEligibleSpend,
    alreadyReversedPoints: context.alreadyReversedPoints,
    reversalPoints: context.reversalPoints,
  };
  const inputHash = evidenceSha256({
    version: "1",
    order: context.orderFact,
    refundId,
  });
  const resultHash = evidenceSha256(result);
  const evaluations = await sql<EvaluationRow[]>`
      select evaluation_public_id::text
      from loyalty_private.record_programme_evaluation(
        ${event.organization_id}::bigint,
        ${context.programmeGroupId}::bigint,
        ${context.programmeVersionId}::bigint,
        ${event.canonical_event_id}::bigint,
        'live_refund',
        ${`woocommerce:order:${context.orderFact.orderId}:refund:${refundId}`},
        ${evaluationKey},
        ${Buffer.from(inputHash, "hex")},
        ${Buffer.from(resultHash, "hex")},
        ${JSON.stringify(result)}::jsonb,
        ${JSON.stringify({ lines: context.currentEvaluation.explanation })}::jsonb,
        ${new Date().toISOString()}::timestamptz
      )
  `;
  const evaluationId = evaluations[0]?.evaluation_public_id;
  if (!evaluationId) throw new Error("refund_evaluation_record_failed");
  let resultReference = `evaluation:${evaluationId}`;
  if (context.reversalPoints > 0) {
    if (context.originEntryPublicId === null) {
      throw new RetryableEffectError("original_award_entry_not_found");
    }
    const reversals = await sql<AwardRow[]>`
        select transaction_public_id::text
        from loyalty_private.reverse_award_points(
          ${event.organization_id}::bigint,
          ${context.originEntryPublicId}::uuid,
          ${context.reversalPoints}::bigint,
          ${reversalKey},
          ${Buffer.from(resultHash, "hex")},
          'Cumulative WooCommerce order refund reversal',
          ${event.occurred_at}::timestamptz
        )
    `;
    const transactionId = reversals[0]?.transaction_public_id;
    if (!transactionId) throw new Error("refund_reversal_record_failed");
    resultReference = `ledger-transaction:${transactionId}`;
  }
  await sql`
      select * from loyalty_private.finish_commerce_effect(
        ${event.canonical_event_public_id}::uuid,
        ${workerId},
        'applied',
        'loyalty.order.refund_reversal',
        ${operation},
        ${resultReference},
        null,
        0
      )
  `;
}

async function commitRefundV2(
  sql: Sql | TransactionSql,
  workerId: string,
  event: ClaimedEffect,
  refundId: string,
  context: Readonly<{
    originalEvaluationPublicId: string;
    programmeGroupId: string;
    programmeVersionId: string;
    originEntryPublicId: string | null;
    orderFact: PurchaseEarningFactV2;
    currentEvaluation: EarningEvaluationV2;
    originalEligibleSpend: string;
    originalAwardedPoints: string;
    cumulativeRefundedEligibleSpend: string;
    alreadyReversedPoints: string;
    reversalPoints: string;
  }>,
): Promise<void> {
  const orderId = context.orderFact.eventId;
  const operation = `connection:${event.connection_id}:order:${event.source_object_id}:refund:${refundId}`;
  const evaluationKey = `woo:evaluation:refund:${operation}`;
  const reversalKey = `woo:ledger:refund:${operation}`;
  const result = {
    version: "2",
    programmeVersionId: context.programmeVersionId,
    orderEventId: orderId,
    refundId,
    originalEligibleSpendMinor: context.originalEligibleSpend,
    originalAwardedPoints: context.originalAwardedPoints,
    cumulativeRefundedEligibleSpendMinor:
      context.cumulativeRefundedEligibleSpend,
    alreadyReversedPoints: context.alreadyReversedPoints,
    reversalPoints: context.reversalPoints,
  };
  const inputHash = evidenceSha256({
    version: "2",
    order: context.orderFact,
    refundId,
  });
  const resultHash = evidenceSha256(result);
  const evaluatedAt = new Date().toISOString();
  const evaluations = await sql<EvaluationRow[]>`
      select evaluation_public_id::text
      from loyalty_private.record_programme_evaluation(
        ${event.organization_id}::bigint,
        ${context.programmeGroupId}::bigint,
        ${context.programmeVersionId}::bigint,
        ${event.canonical_event_id}::bigint,
        'live_refund',
        ${`woocommerce:order:${event.source_object_id}:refund:${refundId}`},
        ${evaluationKey},
        ${Buffer.from(inputHash, "hex")},
        ${Buffer.from(resultHash, "hex")},
        ${JSON.stringify(result)}::jsonb,
        ${JSON.stringify({ lines: context.currentEvaluation.lines })}::jsonb,
        ${evaluatedAt}::timestamptz
      )
  `;
  const evaluationId = evaluations[0]?.evaluation_public_id;
  if (!evaluationId) throw new Error("refund_evaluation_record_failed");
  let resultReference = `evaluation:${evaluationId}`;
  if (BigInt(context.reversalPoints) > 0n) {
    if (context.originEntryPublicId === null) {
      throw new RetryableEffectError("original_award_entry_not_found");
    }
    const reversals = await sql<AwardRow[]>`
        select transaction_public_id::text
        from loyalty_private.reverse_award_points(
          ${event.organization_id}::bigint,
          ${context.originEntryPublicId}::uuid,
          ${context.reversalPoints}::bigint,
          ${reversalKey},
          ${Buffer.from(resultHash, "hex")},
          'Cumulative WooCommerce order refund reversal',
          ${event.occurred_at}::timestamptz
        )
    `;
    const transactionId = reversals[0]?.transaction_public_id;
    if (!transactionId) throw new Error("refund_reversal_record_failed");
    resultReference = `ledger-transaction:${transactionId}`;
  }
  const campaignRefunds = await sql<CampaignRefundRow[]>`
      select customer_id::text, affected_effects::text,
        reversed_points::text, outcome
      from loyalty_private.record_purchase_campaign_refund_v1(
        ${event.organization_id}::bigint,
        ${context.originalEvaluationPublicId}::uuid,
        ${evaluationId}::uuid
      )
  `;
  const campaignRefund = campaignRefunds[0];
  const customerId = campaignRefund?.customer_id;
  if (!customerId) throw new Error("campaign_refund_record_failed");
  if (BigInt(campaignRefund.reversed_points) > 0n) {
    resultReference = `campaign-refund:${evaluationId}`;
  }
  if (event.programme_id !== null) {
    const currentProgramme = await loadProgrammeContext(
      sql,
      event.organization_id,
      event.programme_id,
      customerId,
    );
    if (currentProgramme.definitionVersion === "2") {
      await applyAdvancedTierQualificationV2(
        sql,
        event,
        customerId,
        currentProgramme,
        evaluatedAt,
      );
    }
  }
  await sql`
      select * from loyalty_private.finish_commerce_effect(
        ${event.canonical_event_public_id}::uuid,
        ${workerId},
        'applied',
        'loyalty.order.refund_reversal',
        ${operation},
        ${resultReference},
        null,
        0
      )
  `;
}

async function applyAdvancedTierQualificationV2(
  sql: Sql | TransactionSql,
  event: ClaimedEffect,
  customerId: string,
  context: V2ProgrammeContext,
  evaluatedAt: string,
): Promise<void> {
  const policy = context.programme.tierPolicy;
  if (!policy) return;
  const rows = await sql<TierQualificationContextRow[]>`
    select metrics, current_tier_code, previously_held_tier_codes,
      below_threshold_since
    from loyalty_private.get_tier_qualification_context_v2(
      ${event.organization_id}::bigint,
      ${context.programmeGroupId}::bigint,
      ${context.programmeVersionId}::bigint,
      ${customerId}::bigint,
      ${evaluatedAt}::timestamptz
    )
  `;
  const row = rows[0];
  if (!row) throw new Error("tier_qualification_context_unavailable");
  const evaluation = tierQualificationEvaluationV2.parse(
    evaluateTierQualificationSnapshotV2({
      policy,
      metrics: tierMetricSnapshotV2.parse(row.metrics),
      evaluatedAt,
      currentTierCode: row.current_tier_code,
      previouslyHeldTierCodes: row.previously_held_tier_codes,
      belowThresholdSince:
        row.below_threshold_since === null
          ? null
          : new Date(row.below_threshold_since).toISOString(),
    }),
  );
  const decisions = await sql<{ tier_decision_public_id: string }[]>`
    select tier_decision_public_id::text
    from loyalty_private.record_tier_qualification_decision_v2(
      ${event.organization_id}::bigint,
      ${context.programmeGroupId}::bigint,
      ${context.programmeVersionId}::bigint,
      ${event.canonical_event_id}::bigint,
      ${customerId}::bigint,
      ${evaluatedAt}::timestamptz,
      ${JSON.stringify(evaluation)}::jsonb
    )
  `;
  if (!decisions[0]?.tier_decision_public_id) {
    throw new Error("tier_qualification_decision_unavailable");
  }
}

async function finishEffect(
  sql: Sql | TransactionSql,
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

function parseUnsignedBigint(value: string, name: string): bigint {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) {
    throw new PermanentEffectError(`invalid_${name.replaceAll(" ", "_")}`);
  }
  const parsed = BigInt(value);
  if (parsed > 9_223_372_036_854_775_807n) {
    throw new PermanentEffectError("numeric_value_out_of_range");
  }
  return parsed;
}

function evidenceInteger(
  evidence: Record<string, unknown>,
  field: string,
): number {
  const value = evidence[field];
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new PermanentEffectError("invalid_original_award_evidence");
  }
  return value as number;
}

function evidenceBigintString(
  evidence: Record<string, unknown>,
  field: string,
): string {
  const value = evidence[field];
  if (typeof value !== "string") {
    throw new PermanentEffectError("invalid_original_award_evidence");
  }
  parseUnsignedBigint(value, field);
  return value;
}

function evidenceString(
  evidence: Record<string, unknown>,
  field: string,
): string {
  const value = evidence[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new PermanentEffectError("invalid_original_award_evidence");
  }
  return value;
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    )
  );
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
class RetryableEffectError extends Error {}
