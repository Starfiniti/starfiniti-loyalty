import "server-only";

import {
  issueWebhookSigningSecretV1,
  type IssuedWebhookSigningSecretV1,
} from "@starfiniti/contracts/webhook-secrets";
import {
  notificationWebhookEndpointMutationResultV1,
  notificationWebhookEndpointsDocumentV1,
  type ChangeNotificationWebhookEndpointStateCommandV1,
  type CreateNotificationWebhookEndpointCommandV1,
  type NotificationWebhookEndpointMutationResultV1,
  type NotificationWebhookEndpointsDocumentV1,
  type RotateNotificationWebhookEndpointCommandV1,
} from "@starfiniti/contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type MutationRow = Readonly<{
  endpoint_public_id: string;
  endpoint_state: string;
  outcome: string;
  prior_secret_expires_at: string | Date | null;
}>;

function parseMutation(row: MutationRow | undefined) {
  return notificationWebhookEndpointMutationResultV1.parse(
    row
      ? {
          endpointId: row.endpoint_public_id,
          state: row.endpoint_state,
          outcome: row.outcome,
          priorSecretExpiresAt:
            row.prior_secret_expires_at instanceof Date
              ? row.prior_secret_expires_at.toISOString()
              : row.prior_secret_expires_at,
        }
      : null,
  );
}

export async function getNotificationWebhookEndpoints(
  workspaceId: string,
): Promise<NotificationWebhookEndpointsDocumentV1> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("get_notification_webhook_endpoints_v1", {
      target_workspace_public_id: workspaceId,
    });
  if (error) throw new Error("notification_webhook_endpoints_unavailable");
  const row = (Array.isArray(data) ? data[0] : data) as
    { document?: unknown } | undefined;
  return notificationWebhookEndpointsDocumentV1.parse(row?.document);
}

async function mutateEndpoint(
  functionName:
    | "create_notification_webhook_endpoint_command_v1"
    | "rotate_notification_webhook_endpoint_command_v1"
    | "change_notification_webhook_endpoint_state_command_v1",
  parameters: Record<string, unknown>,
): Promise<NotificationWebhookEndpointMutationResultV1> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc(functionName, parameters);
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as MutationRow | undefined;
  return parseMutation(row);
}

export async function createNotificationWebhookEndpoint(
  command: CreateNotificationWebhookEndpointCommandV1,
): Promise<
  Readonly<{
    result: NotificationWebhookEndpointMutationResultV1;
    issued: IssuedWebhookSigningSecretV1 | null;
  }>
> {
  const issued = issueWebhookSigningSecretV1();
  const destination = new URL(command.destinationUrl);
  const result = await mutateEndpoint(
    "create_notification_webhook_endpoint_command_v1",
    {
      target_workspace_public_id: command.workspaceId,
      target_label: command.label,
      target_destination_url: destination.toString(),
      target_current_secret_sha256_hex: issued.fingerprintSha256,
      target_current_secret_hint: issued.hint,
      target_event_types: command.eventTypes,
      target_rate_limit_per_minute: command.rateLimitPerMinute,
      target_idempotency_key: command.idempotencyKey,
      target_correlation_id: command.correlationId,
    },
  );
  return { result, issued: result.outcome === "created" ? issued : null };
}

export async function rotateNotificationWebhookEndpoint(
  command: RotateNotificationWebhookEndpointCommandV1,
): Promise<
  Readonly<{
    result: NotificationWebhookEndpointMutationResultV1;
    issued: IssuedWebhookSigningSecretV1 | null;
  }>
> {
  const issued = issueWebhookSigningSecretV1();
  const result = await mutateEndpoint(
    "rotate_notification_webhook_endpoint_command_v1",
    {
      target_endpoint_public_id: command.endpointId,
      target_current_secret_sha256_hex: issued.fingerprintSha256,
      target_current_secret_hint: issued.hint,
      target_overlap_seconds: command.overlapSeconds,
      target_idempotency_key: command.idempotencyKey,
      target_correlation_id: command.correlationId,
    },
  );
  return { result, issued: result.outcome === "rotated" ? issued : null };
}

export async function changeNotificationWebhookEndpointState(
  command: ChangeNotificationWebhookEndpointStateCommandV1,
): Promise<NotificationWebhookEndpointMutationResultV1> {
  return mutateEndpoint(
    "change_notification_webhook_endpoint_state_command_v1",
    {
      target_endpoint_public_id: command.endpointId,
      target_action: command.action,
      target_reason: command.reason,
      target_idempotency_key: command.idempotencyKey,
      target_correlation_id: command.correlationId,
    },
  );
}
