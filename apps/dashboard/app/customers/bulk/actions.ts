"use server";

import {
  merchantBulkAdjustmentPreviewCommandV1,
  merchantBulkAdjustmentPreviewResultV1,
  merchantBulkAdjustmentResultV1,
  merchantExecuteBulkAdjustmentCommandV1,
  type MerchantBulkAdjustmentPreviewCommandV1,
  type MerchantBulkAdjustmentPreviewResultV1,
} from "@starfiniti/contracts";
import { revalidatePath } from "next/cache";
import { parseMerchantLocalDateTime } from "@/lib/merchant-date-time";
import { merchantText, resolveMerchantLocale } from "@/lib/merchant-locale";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ApprovedPreview = Readonly<{
  command: MerchantBulkAdjustmentPreviewCommandV1;
  result: MerchantBulkAdjustmentPreviewResultV1;
}>;

export type BulkPreviewActionState =
  | Readonly<{ kind: "idle"; message: string; preview?: never }>
  | Readonly<{ kind: "error"; message: string; preview?: never }>
  | Readonly<{
      kind: "success";
      message: string;
      preview: ApprovedPreview;
    }>;

export type BulkExecuteActionState = Readonly<{
  kind: "idle" | "success" | "error";
  message: string;
}>;

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function expiryFromForm(formData: FormData, points: string): string | null {
  if (!/^[1-9][0-9]*$/u.test(points)) return null;
  const input = String(formData.get("expiresAt") ?? "");
  const date = input ? parseMerchantLocalDateTime(input) : null;
  return date ? date.toISOString() : null;
}

export async function previewBulkCustomerAdjustment(
  _previousState: BulkPreviewActionState,
  formData: FormData,
): Promise<BulkPreviewActionState> {
  const locale = resolveMerchantLocale(formData.get("lang"));
  const message = (source: string) => merchantText(locale, source);
  const pointsPerCustomer = String(formData.get("pointsPerCustomer") ?? "");
  const command = merchantBulkAdjustmentPreviewCommandV1.safeParse({
    version: "1",
    customerIds: formData.getAll("customerId").map(String),
    programmeGroupId: formData.get("programmeGroupId"),
    programmeVersionId: formData.get("programmeVersionId"),
    pointsPerCustomer,
    reason: formData.get("reason"),
    expiresAt: expiryFromForm(formData, pointsPerCustomer),
  });
  if (!command.success) {
    return {
      kind: "error",
      message: message(
        "Select 2 to 50 unique customers, enter non-zero whole points and a single-line reason, and set an expiry for credits.",
      ),
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("preview_bulk_customer_adjustment", {
      target_customer_public_ids: command.data.customerIds,
      target_programme_group_public_id: command.data.programmeGroupId,
      target_programme_version_public_id: command.data.programmeVersionId,
      target_points_per_customer: command.data.pointsPerCustomer,
      target_reason: command.data.reason,
      target_expires_at: command.data.expiresAt,
    });
  if (error) {
    return {
      kind: "error",
      message: message(
        error.code === "42501"
          ? "Your current organization role cannot preview customer value changes."
          : "The customer set, wallet balances, or published programme changed. No adjustment was assumed.",
      ),
    };
  }
  const row = (Array.isArray(data) ? data[0] : data) as Record<
    string,
    unknown
  > | null;
  const result = merchantBulkAdjustmentPreviewResultV1.safeParse(
    row
      ? {
          previewSha256: row.preview_sha256,
          customerCount: row.customer_count,
          pointsPerCustomer: row.points_per_customer,
          totalPoints: row.total_points,
          items: row.items,
        }
      : null,
  );
  if (!result.success) {
    return {
      kind: "error",
      message: message("The authoritative bulk preview could not be verified."),
    };
  }
  const requested = [...command.data.customerIds].sort();
  const returned = result.data.items.map(({ customerId }) => customerId).sort();
  if (
    requested.length !== returned.length ||
    requested.some((customerId, index) => customerId !== returned[index])
  ) {
    return {
      kind: "error",
      message: message(
        "The authoritative preview did not match the selected customers.",
      ),
    };
  }
  return {
    kind: "success",
    message: message("Dry run complete. No balances changed."),
    preview: { command: command.data, result: result.data },
  };
}

export async function executeBulkCustomerAdjustment(
  _previousState: BulkExecuteActionState,
  formData: FormData,
): Promise<BulkExecuteActionState> {
  const locale = resolveMerchantLocale(formData.get("lang"));
  const message = (source: string) => merchantText(locale, source);
  if (formData.get("confirmation") !== "approved") {
    return {
      kind: "error",
      message: message("Review and approve the exact dry run."),
    };
  }
  const operationId = String(formData.get("operationId") ?? "");
  if (!UUID_V4.test(operationId)) {
    return {
      kind: "error",
      message: message("The batch identity is invalid. Start a new dry run."),
    };
  }
  const pointsPerCustomer = String(formData.get("pointsPerCustomer") ?? "");
  const expiresAtValue = String(formData.get("expiresAt") ?? "");
  const command = merchantExecuteBulkAdjustmentCommandV1.safeParse({
    version: "1",
    customerIds: formData.getAll("customerId").map(String),
    programmeGroupId: formData.get("programmeGroupId"),
    programmeVersionId: formData.get("programmeVersionId"),
    pointsPerCustomer,
    reason: formData.get("reason"),
    expiresAt: expiresAtValue || null,
    expectedPreviewSha256: formData.get("expectedPreviewSha256"),
    idempotencyKey: `customer:points:bulk:${operationId}`,
    correlationId: crypto.randomUUID(),
  });
  if (!command.success) {
    return {
      kind: "error",
      message: message("The approved dry run is invalid. Start a new preview."),
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("execute_bulk_customer_adjustment", {
      target_customer_public_ids: command.data.customerIds,
      target_programme_group_public_id: command.data.programmeGroupId,
      target_programme_version_public_id: command.data.programmeVersionId,
      target_points_per_customer: command.data.pointsPerCustomer,
      target_reason: command.data.reason,
      target_expires_at: command.data.expiresAt,
      target_expected_preview_sha256: command.data.expectedPreviewSha256,
      target_idempotency_key: command.data.idempotencyKey,
      target_correlation_id: command.data.correlationId,
    });
  if (error) {
    return {
      kind: "error",
      message: message(
        error.code === "42501"
          ? "Your current organization role cannot change customer value."
          : error.code === "23514"
            ? "The dry run is stale or conflicts with this batch identity. No partial batch was recorded."
            : "The batch could not be verified. No completed batch was assumed.",
      ),
    };
  }
  const row = (Array.isArray(data) ? data[0] : data) as Record<
    string,
    unknown
  > | null;
  const result = merchantBulkAdjustmentResultV1.safeParse(
    row
      ? {
          batchId: row.batch_public_id,
          outcome: row.outcome,
          customerCount: row.customer_count,
          totalPoints: row.total_points,
        }
      : null,
  );
  if (
    !result.success ||
    result.data.customerCount !== command.data.customerIds.length ||
    result.data.totalPoints !==
      (
        BigInt(command.data.pointsPerCustomer) *
        BigInt(command.data.customerIds.length)
      ).toString()
  ) {
    return {
      kind: "error",
      message: message("The immutable batch result could not be verified."),
    };
  }
  revalidatePath("/customers");
  revalidatePath("/customers/bulk");
  for (const customerId of command.data.customerIds) {
    revalidatePath(`/customers/${customerId}`);
  }
  return {
    kind: "success",
    message:
      locale === "sl-SI"
        ? result.data.outcome === "duplicate"
          ? `Ta točna serija že obstaja za ${result.data.customerCount} strank.`
          : `Serija je zabeležena za ${result.data.customerCount} strank (skupaj ${result.data.totalPoints} točk).`
        : result.data.outcome === "duplicate"
          ? `This exact batch already exists for ${result.data.customerCount} customers.`
          : `Batch recorded for ${result.data.customerCount} customers (${result.data.totalPoints} total points).`,
  };
}
