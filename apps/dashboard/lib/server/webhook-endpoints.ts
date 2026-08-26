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
import { getDatabase } from "./database";

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

export async function createNotificationWebhookEndpoint(
  actorUserId: string,
  command: CreateNotificationWebhookEndpointCommandV1,
): Promise<
  Readonly<{
    result: NotificationWebhookEndpointMutationResultV1;
    issued: IssuedWebhookSigningSecretV1 | null;
  }>
> {
  const issued = issueWebhookSigningSecretV1();
  const destination = new URL(command.destinationUrl);
  const rows = await getDatabase()<MutationRow[]>`
    select endpoint_public_id, endpoint_state, outcome,
      prior_secret_expires_at
    from loyalty_private.create_notification_webhook_endpoint_v1(
      ${actorUserId}::uuid,
      ${command.workspaceId}::uuid,
      ${command.label},
      ${destination.toString()},
      ${Buffer.from(issued.fingerprintSha256, "hex")},
      ${issued.hint},
      ${command.eventTypes}::text[],
      ${command.rateLimitPerMinute},
      ${command.idempotencyKey},
      ${command.correlationId}::uuid
    )
  `;
  const result = parseMutation(rows[0]);
  return { result, issued: result.outcome === "created" ? issued : null };
}

export async function rotateNotificationWebhookEndpoint(
  actorUserId: string,
  command: RotateNotificationWebhookEndpointCommandV1,
): Promise<
  Readonly<{
    result: NotificationWebhookEndpointMutationResultV1;
    issued: IssuedWebhookSigningSecretV1 | null;
  }>
> {
  const issued = issueWebhookSigningSecretV1();
  const rows = await getDatabase()<MutationRow[]>`
    select endpoint_public_id, endpoint_state, outcome,
      prior_secret_expires_at
    from loyalty_private.rotate_notification_webhook_endpoint_v1(
      ${actorUserId}::uuid,
      ${command.endpointId}::uuid,
      ${Buffer.from(issued.fingerprintSha256, "hex")},
      ${issued.hint},
      ${command.overlapSeconds},
      ${command.idempotencyKey},
      ${command.correlationId}::uuid
    )
  `;
  const result = parseMutation(rows[0]);
  return { result, issued: result.outcome === "rotated" ? issued : null };
}

export async function changeNotificationWebhookEndpointState(
  actorUserId: string,
  command: ChangeNotificationWebhookEndpointStateCommandV1,
): Promise<NotificationWebhookEndpointMutationResultV1> {
  const rows = await getDatabase()<MutationRow[]>`
    select endpoint_public_id, endpoint_state, outcome,
      prior_secret_expires_at
    from loyalty_private.change_notification_webhook_endpoint_state_v1(
      ${actorUserId}::uuid,
      ${command.endpointId}::uuid,
      ${command.action},
      ${command.reason},
      ${command.idempotencyKey},
      ${command.correlationId}::uuid
    )
  `;
  return parseMutation(rows[0]);
}
