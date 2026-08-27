"use server";

import {
  merchantResolveReferralReviewCommandV1,
  merchantResolveReferralReviewResultV1,
  merchantRetryReferralRewardCommandV1,
  merchantRetryReferralRewardResultV1,
} from "@starfiniti/contracts";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ReferralReviewActionState = Readonly<{
  kind: "idle" | "success" | "error";
  message: string;
}>;

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function failure(message: string): ReferralReviewActionState {
  return { kind: "error", message };
}

function databaseFailure(error: { code?: string } | null) {
  if (error?.code === "42501") {
    return failure(
      "Your live organization role cannot perform this referral action.",
    );
  }
  if (error?.code === "23514" || error?.code === "55000") {
    return failure(
      "This case changed or reached its recovery limit. Refresh before taking another action.",
    );
  }
  if (error?.code === "22023") {
    return failure("Add a clear review reason of at least eight characters.");
  }
  return failure(
    "The referral command could not be completed safely. No value change was assumed.",
  );
}

function firstRow(data: unknown): Record<string, unknown> | null {
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === "object"
    ? (row as Record<string, unknown>)
    : null;
}

export async function resolveReferralReview(
  _previousState: ReferralReviewActionState,
  formData: FormData,
): Promise<ReferralReviewActionState> {
  const operationId = String(formData.get("operationId") ?? "");
  if (!UUID_V4.test(operationId)) {
    return failure("The operation identity is invalid. Refresh and try again.");
  }
  const resolution = formData.get("resolution");
  const command = merchantResolveReferralReviewCommandV1.safeParse({
    version: "1",
    attributionId: formData.get("attributionId"),
    resolution,
    reason: formData.get("reason"),
    idempotencyKey: `referral:review:${operationId}`,
    correlationId: crypto.randomUUID(),
  });
  if (!command.success) {
    return failure("Add a clear review reason of at least eight characters.");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("resolve_referral_review_command", {
      target_attribution_public_id: command.data.attributionId,
      target_resolution: command.data.resolution,
      target_reason: command.data.reason,
      target_idempotency_key: command.data.idempotencyKey,
      target_correlation_id: command.data.correlationId,
    });
  if (error) return databaseFailure(error);
  const row = firstRow(data);
  const result = merchantResolveReferralReviewResultV1.safeParse(
    row
      ? {
          attributionId: row.attribution_id,
          state: row.state,
          outcome: row.outcome,
        }
      : null,
  );
  if (!result.success) return databaseFailure(null);
  revalidatePath("/referrals");
  return {
    kind: "success",
    message:
      result.data.outcome === "duplicate"
        ? "This exact review decision was already recorded."
        : result.data.state === "rejected"
          ? "Referral rejected. No referral value was issued."
          : "Referral approved. Qualification and cooling continue through the normal protected lifecycle.",
  };
}

export async function retryReferralReward(
  _previousState: ReferralReviewActionState,
  formData: FormData,
): Promise<ReferralReviewActionState> {
  const operationId = String(formData.get("operationId") ?? "");
  if (!UUID_V4.test(operationId)) {
    return failure("The operation identity is invalid. Refresh and try again.");
  }
  const command = merchantRetryReferralRewardCommandV1.safeParse({
    version: "1",
    jobId: formData.get("jobId"),
    reason: formData.get("reason"),
    idempotencyKey: `referral:reward:retry:${operationId}`,
    correlationId: crypto.randomUUID(),
  });
  if (!command.success) {
    return failure("Add a clear recovery reason of at least eight characters.");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("retry_referral_reward_job_command", {
      target_job_public_id: command.data.jobId,
      target_reason: command.data.reason,
      target_idempotency_key: command.data.idempotencyKey,
      target_correlation_id: command.data.correlationId,
    });
  if (error) return databaseFailure(error);
  const row = firstRow(data);
  const result = merchantRetryReferralRewardResultV1.safeParse(
    row
      ? {
          jobId: row.job_id,
          state: row.state,
          reviewCycle: row.review_cycle,
          outcome: row.outcome,
        }
      : null,
  );
  if (!result.success) return databaseFailure(null);
  revalidatePath("/referrals");
  return {
    kind: "success",
    message:
      result.data.outcome === "duplicate"
        ? "This exact recovery was already recorded."
        : `Reward processing requeued in reviewed cycle ${result.data.reviewCycle}.`,
  };
}
