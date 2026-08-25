"use server";

import {
  merchantPublishNotificationTemplateCommandV1,
  merchantPublishNotificationTemplateResultV1,
  merchantSendNotificationTestCommandV1,
  merchantSendNotificationTestResultV1,
} from "@starfiniti/contracts";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type NotificationActionState = Readonly<{
  kind: "idle" | "success" | "error";
  message: string;
}>;

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function failure(message: string): NotificationActionState {
  return { kind: "error", message };
}

function databaseFailure(error: { code?: string } | null) {
  if (error?.code === "42501") {
    return failure(
      "Your live organization role or notification rollout cannot perform this action.",
    );
  }
  if (error?.code === "23514") {
    return failure(
      "This operation identity was already used for different content. Refresh and try again.",
    );
  }
  if (error?.code === "22023") {
    return failure(
      "Use only the listed tokens and safe text without markup, URLs, or control characters.",
    );
  }
  return failure(
    "The notification action could not be completed safely. No send was assumed.",
  );
}

function firstRow(data: unknown): Record<string, unknown> | null {
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === "object"
    ? (row as Record<string, unknown>)
    : null;
}

export async function publishNotificationTemplate(
  _previousState: NotificationActionState,
  formData: FormData,
): Promise<NotificationActionState> {
  const operationId = String(formData.get("operationId") ?? "");
  if (!UUID_V4.test(operationId)) {
    return failure("The operation identity is invalid. Refresh and try again.");
  }
  const command = merchantPublishNotificationTemplateCommandV1.safeParse({
    version: "1",
    workspaceId: formData.get("workspaceId"),
    eventType: formData.get("eventType"),
    subjectTemplate: formData.get("subjectTemplate"),
    textTemplate: formData.get("textTemplate"),
    idempotencyKey: `notification:template:${operationId}`,
    correlationId: crypto.randomUUID(),
  });
  if (!command.success) {
    return failure(
      "Use only the listed tokens and safe text without markup, URLs, or control characters.",
    );
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("publish_notification_email_template_command", {
      target_workspace_public_id: command.data.workspaceId,
      target_event_type: command.data.eventType,
      target_subject_template: command.data.subjectTemplate,
      target_text_template: command.data.textTemplate,
      target_idempotency_key: command.data.idempotencyKey,
      target_correlation_id: command.data.correlationId,
    });
  if (error) return databaseFailure(error);
  const row = firstRow(data);
  const result = merchantPublishNotificationTemplateResultV1.safeParse(
    row
      ? {
          templateId: row.template_id,
          templateVersion: row.template_version,
          outcome: row.outcome,
        }
      : null,
  );
  if (!result.success) return databaseFailure(null);
  revalidatePath("/notifications");
  return {
    kind: "success",
    message:
      result.data.outcome === "duplicate"
        ? `Version ${result.data.templateVersion} was already published.`
        : `Version ${result.data.templateVersion} is active for future accepted messages.`,
  };
}

export async function sendNotificationTest(
  _previousState: NotificationActionState,
  formData: FormData,
): Promise<NotificationActionState> {
  const operationId = String(formData.get("operationId") ?? "");
  if (!UUID_V4.test(operationId)) {
    return failure("The operation identity is invalid. Refresh and try again.");
  }
  const command = merchantSendNotificationTestCommandV1.safeParse({
    version: "1",
    workspaceId: formData.get("workspaceId"),
    eventType: formData.get("eventType"),
    idempotencyKey: `notification:test:${operationId}`,
    correlationId: crypto.randomUUID(),
  });
  if (!command.success) {
    return failure("Select a valid active email template and try again.");
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("send_notification_test_command", {
      target_workspace_public_id: command.data.workspaceId,
      target_event_type: command.data.eventType,
      target_idempotency_key: command.data.idempotencyKey,
      target_correlation_id: command.data.correlationId,
    });
  if (error) return databaseFailure(error);
  const row = firstRow(data);
  const result = merchantSendNotificationTestResultV1.safeParse(
    row
      ? {
          testDeliveryId: row.test_delivery_id,
          state: row.state,
          outcome: row.outcome,
        }
      : null,
  );
  if (!result.success) return databaseFailure(null);
  revalidatePath("/notifications");
  return {
    kind: "success",
    message:
      result.data.outcome === "duplicate"
        ? "This exact test was already queued."
        : "Test queued for your verified sign-in email.",
  };
}
