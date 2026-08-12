"use server";

import {
  merchantRequestConnectorReconciliationCommandV1,
  merchantRequestConnectorReconciliationResultV1,
  merchantRetryConnectorEffectCommandV1,
  merchantRetryConnectorEffectResultV1,
} from "@starfiniti/contracts";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ConnectorActionState = Readonly<{
  kind: "idle" | "success" | "error";
  message: string;
}>;

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function requestConnectorReconciliation(
  _previousState: ConnectorActionState,
  formData: FormData,
): Promise<ConnectorActionState> {
  if (formData.get("confirmation") !== "reconcile") {
    return {
      kind: "error",
      message: "Review and confirm the source-order reconciliation.",
    };
  }
  const operationId = String(formData.get("operationId") ?? "");
  if (!UUID_V4.test(operationId)) {
    return {
      kind: "error",
      message: "The reconciliation identity is invalid. Refresh and try again.",
    };
  }
  const command = merchantRequestConnectorReconciliationCommandV1.safeParse({
    version: "1",
    connectionId: formData.get("connectionId"),
    orderId: formData.get("orderId"),
    reason: formData.get("reason"),
    idempotencyKey: `connector:order:reconcile:${operationId}`,
    correlationId: crypto.randomUUID(),
  });
  if (!command.success) {
    return {
      kind: "error",
      message:
        "Enter a positive WooCommerce order ID and a single-line review reason of at least 8 characters.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("request_connector_reconciliation_command", {
      target_connection_public_id: command.data.connectionId,
      target_order_id: command.data.orderId,
      target_reason: command.data.reason,
      target_idempotency_key: command.data.idempotencyKey,
      target_correlation_id: command.data.correlationId,
    });
  if (error) {
    return {
      kind: "error",
      message:
        error.code === "42501"
          ? "Your role cannot reconcile this live connector."
          : "The connector or request changed. No reconciliation was assumed.",
    };
  }
  const row = (Array.isArray(data) ? data[0] : data) as Record<
    string,
    unknown
  > | null;
  const result = merchantRequestConnectorReconciliationResultV1.safeParse(
    row
      ? {
          resourceId: row.resource_public_id,
          outcome: row.outcome,
          state: row.command_state,
        }
      : null,
  );
  if (!result.success) {
    return {
      kind: "error",
      message: "The durable reconciliation result could not be verified.",
    };
  }
  revalidatePath("/operations");
  return {
    kind: "success",
    message:
      result.data.outcome === "duplicate"
        ? `This exact reconciliation already exists (${result.data.state.replaceAll("_", " ")}).`
        : "Reconciliation queued. The signed plugin command will re-emit the source order facts.",
  };
}

export async function retryConnectorEffect(
  _previousState: ConnectorActionState,
  formData: FormData,
): Promise<ConnectorActionState> {
  if (formData.get("confirmation") !== "retry") {
    return { kind: "error", message: "Confirm the reviewed effect replay." };
  }
  const operationId = String(formData.get("operationId") ?? "");
  if (!UUID_V4.test(operationId)) {
    return {
      kind: "error",
      message: "The replay identity is invalid. Refresh and try again.",
    };
  }
  const command = merchantRetryConnectorEffectCommandV1.safeParse({
    version: "1",
    eventId: formData.get("eventId"),
    reason: formData.get("reason"),
    idempotencyKey: `connector:effect:retry:${operationId}`,
    correlationId: crypto.randomUUID(),
  });
  if (!command.success) {
    return {
      kind: "error",
      message: "Provide a single-line review reason of at least 8 characters.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("retry_connector_effect_command", {
      target_event_public_id: command.data.eventId,
      target_reason: command.data.reason,
      target_idempotency_key: command.data.idempotencyKey,
      target_correlation_id: command.data.correlationId,
    });
  if (error) {
    return {
      kind: "error",
      message:
        error.code === "42501"
          ? "Your current organization role cannot replay connector effects."
          : "The effect state changed or the replay could not be authorized safely.",
    };
  }
  const row = (Array.isArray(data) ? data[0] : data) as Record<
    string,
    unknown
  > | null;
  const result = merchantRetryConnectorEffectResultV1.safeParse(
    row
      ? {
          resourceId: row.resource_public_id,
          outcome: row.outcome,
          effectState: row.effect_state,
        }
      : null,
  );
  if (!result.success) {
    return {
      kind: "error",
      message: "The replay result could not be verified.",
    };
  }
  revalidatePath("/operations");
  return {
    kind: "success",
    message:
      result.data.outcome === "duplicate"
        ? "This exact replay was already requested."
        : "The effect was returned to the idempotent worker queue.",
  };
}
