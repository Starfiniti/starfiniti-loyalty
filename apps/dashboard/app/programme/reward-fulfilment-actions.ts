"use server";

import {
  merchantResolveRewardFulfilmentCommandV1,
  merchantStartRewardFulfilmentCommandV1,
  rewardFulfilmentCommandResultV1,
} from "@starfiniti/contracts";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type RewardFulfilmentActionState = Readonly<{
  kind: "idle" | "success" | "error";
  message: string;
}>;

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function failure(message: string): RewardFulfilmentActionState {
  return { kind: "error", message };
}

function databaseFailure(error: { code?: string } | null) {
  if (error?.code === "42501") {
    return failure(
      "Your live organization role cannot perform this fulfilment action.",
    );
  }
  if (error?.code === "23514" || error?.code === "55000") {
    return failure(
      "The case changed or its loyalty value was already resolved. Refresh before taking another action.",
    );
  }
  if (error?.code === "22023") {
    return failure("Review the fulfilment evidence and required reason.");
  }
  return failure(
    "The fulfilment command could not be completed safely. No value change was assumed.",
  );
}

function firstRow(data: unknown): Record<string, unknown> | null {
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === "object"
    ? (row as Record<string, unknown>)
    : null;
}

export async function startRewardFulfilment(
  _previousState: RewardFulfilmentActionState,
  formData: FormData,
): Promise<RewardFulfilmentActionState> {
  const operationId = String(formData.get("operationId") ?? "");
  if (!UUID_V4.test(operationId)) {
    return failure("The operation identity is invalid. Refresh and try again.");
  }
  const command = merchantStartRewardFulfilmentCommandV1.safeParse({
    version: "1",
    caseId: formData.get("caseId"),
    idempotencyKey: `reward:fulfilment:start:${operationId}`,
    correlationId: crypto.randomUUID(),
  });
  if (!command.success) return failure("The fulfilment case is invalid.");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("start_reward_fulfilment_command", {
      target_case_public_id: command.data.caseId,
      target_idempotency_key: command.data.idempotencyKey,
      target_correlation_id: command.data.correlationId,
    });
  if (error) return databaseFailure(error);
  const row = firstRow(data);
  const result = rewardFulfilmentCommandResultV1.safeParse(
    row
      ? {
          caseId: row.case_id,
          state: row.state,
          outcome: row.outcome,
        }
      : null,
  );
  if (!result.success) return databaseFailure(null);
  revalidatePath("/programme/rewards");
  return {
    kind: "success",
    message:
      result.data.outcome === "duplicate"
        ? "This case was already started."
        : "Case started. Points and capacity remain reserved until you record a definitive outcome.",
  };
}

export async function resolveRewardFulfilment(
  _previousState: RewardFulfilmentActionState,
  formData: FormData,
): Promise<RewardFulfilmentActionState> {
  const operationId = String(formData.get("operationId") ?? "");
  if (!UUID_V4.test(operationId)) {
    return failure("The operation identity is invalid. Refresh and try again.");
  }
  const resolution = formData.get("resolution");
  const command = merchantResolveRewardFulfilmentCommandV1.safeParse({
    version: "1",
    caseId: formData.get("caseId"),
    resolution,
    resultReference:
      resolution === "fulfilled"
        ? String(formData.get("resultReference") ?? "")
        : null,
    reason:
      String(formData.get("reason") ?? "").trim() === ""
        ? null
        : formData.get("reason"),
    idempotencyKey: `reward:fulfilment:${resolution}:${operationId}`,
    correlationId: crypto.randomUUID(),
  });
  if (!command.success) {
    return failure(
      resolution === "fulfilled"
        ? "Add a single-line delivery reference before confirming fulfilment."
        : "Add a clear rejection reason of at least eight characters.",
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("resolve_reward_fulfilment_command", {
      target_case_public_id: command.data.caseId,
      target_resolution: command.data.resolution,
      target_result_reference: command.data.resultReference,
      target_reason: command.data.reason,
      target_idempotency_key: command.data.idempotencyKey,
      target_correlation_id: command.data.correlationId,
    });
  if (error) return databaseFailure(error);
  const row = firstRow(data);
  const result = rewardFulfilmentCommandResultV1.safeParse(
    row
      ? {
          caseId: row.case_id,
          state: row.state,
          reservationState: row.reservation_state,
          outcome: row.outcome,
        }
      : null,
  );
  if (!result.success) return databaseFailure(null);
  revalidatePath("/programme/rewards");
  return {
    kind: "success",
    message:
      result.data.outcome === "duplicate"
        ? "This exact resolution was already recorded."
        : result.data.state === "fulfilled"
          ? "Fulfilment confirmed. Reserved points were captured exactly once."
          : "Rejection recorded. Reserved points were returned exactly once.",
  };
}
