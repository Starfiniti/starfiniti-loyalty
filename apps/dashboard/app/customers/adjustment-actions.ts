"use server";

import {
  merchantAdjustCustomerPointsCommandV1,
  merchantAdjustCustomerPointsResultV1,
} from "@starfiniti/contracts";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CustomerAdjustmentActionState = Readonly<{
  kind: "idle" | "success" | "error";
  message: string;
}>;

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function adjustCustomerPoints(
  _previousState: CustomerAdjustmentActionState,
  formData: FormData,
): Promise<CustomerAdjustmentActionState> {
  if (formData.get("confirmation") !== "adjust") {
    return { kind: "error", message: "Review and confirm the adjustment." };
  }
  const operationId = String(formData.get("operationId") ?? "");
  if (!UUID_V4.test(operationId)) {
    return {
      kind: "error",
      message: "The adjustment identity is invalid. Refresh and try again.",
    };
  }
  const points = String(formData.get("points") ?? "");
  const positive = /^[1-9][0-9]*$/u.test(points);
  const expiresInput = String(formData.get("expiresAt") ?? "");
  const expiresDate = expiresInput ? new Date(expiresInput) : null;
  const expiresAt =
    positive && expiresDate && !Number.isNaN(expiresDate.valueOf())
      ? expiresDate.toISOString()
      : null;
  const internalNote = String(formData.get("internalNote") ?? "").trim();
  const customerId = String(formData.get("customerId") ?? "");
  const command = merchantAdjustCustomerPointsCommandV1.safeParse({
    version: "1",
    customerId,
    programmeGroupId: formData.get("programmeGroupId"),
    programmeVersionId: formData.get("programmeVersionId"),
    points,
    reason: formData.get("reason"),
    internalNote: internalNote || null,
    expiresAt,
    idempotencyKey: `customer:points:adjust:${operationId}`,
    correlationId: crypto.randomUUID(),
  });
  if (!command.success) {
    return {
      kind: "error",
      message:
        "Enter non-zero whole points, a single-line reason, and an expiry for added points.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("adjust_customer_points_command", {
      target_customer_public_id: command.data.customerId,
      target_programme_group_public_id: command.data.programmeGroupId,
      target_programme_version_public_id: command.data.programmeVersionId,
      target_points: command.data.points,
      target_reason: command.data.reason,
      target_internal_note: command.data.internalNote,
      target_expires_at: command.data.expiresAt,
      target_idempotency_key: command.data.idempotencyKey,
      target_correlation_id: command.data.correlationId,
    });
  if (error) {
    return {
      kind: "error",
      message:
        error.code === "42501"
          ? "Your current organization role cannot adjust customer value."
          : "The wallet, programme version, or request changed. No adjustment was assumed.",
    };
  }
  const row = (Array.isArray(data) ? data[0] : data) as Record<
    string,
    unknown
  > | null;
  const result = merchantAdjustCustomerPointsResultV1.safeParse(
    row
      ? {
          transactionId: row.transaction_public_id,
          outcome: row.outcome,
          availablePoints: row.available_points,
        }
      : null,
  );
  if (!result.success) {
    return {
      kind: "error",
      message: "The immutable ledger result could not be verified.",
    };
  }
  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId}`);
  return {
    kind: "success",
    message:
      result.data.outcome === "duplicate"
        ? `This exact adjustment already exists. Available balance: ${result.data.availablePoints} points.`
        : `Adjustment recorded. Available balance: ${result.data.availablePoints} points.`,
  };
}
