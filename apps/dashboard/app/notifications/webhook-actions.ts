"use server";

import {
  changeNotificationWebhookEndpointStateCommandV1,
  createNotificationWebhookEndpointCommandV1,
  notificationEventTypeV1,
  rotateNotificationWebhookEndpointCommandV1,
} from "@starfiniti/contracts";
import { revalidatePath } from "next/cache";
import {
  changeNotificationWebhookEndpointState,
  createNotificationWebhookEndpoint,
  rotateNotificationWebhookEndpoint,
} from "@/lib/server/webhook-endpoints";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type WebhookActionState = Readonly<{
  kind: "idle" | "success" | "error";
  message: string;
  secret: string | null;
}>;

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

async function verifiedActor(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const claims = await supabase.auth.getClaims();
  const actor = claims.data?.claims?.sub;
  return claims.error || typeof actor !== "string" ? null : actor;
}

function operationId(formData: FormData): string | null {
  const value = String(formData.get("operationId") ?? "");
  return UUID_V4.test(value) ? value : null;
}

function integer(formData: FormData, name: string): number | null {
  const value = formData.get(name);
  if (typeof value !== "string" || !/^\d{1,6}$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

const errorState = (message: string): WebhookActionState => ({
  kind: "error",
  message,
  secret: null,
});

export async function createWebhookEndpointAction(
  _previous: WebhookActionState,
  formData: FormData,
): Promise<WebhookActionState> {
  const operation = operationId(formData);
  if (formData.get("confirmation") !== "create" || operation === null) {
    return errorState("Review and confirm this endpoint before creating it.");
  }
  const eventTypes = formData
    .getAll("eventTypes")
    .filter((value): value is string => typeof value === "string")
    .filter((value) => notificationEventTypeV1.safeParse(value).success)
    .sort();
  const parsed = createNotificationWebhookEndpointCommandV1.safeParse({
    version: "1",
    workspaceId: formData.get("workspaceId"),
    label: formData.get("label"),
    destinationUrl: formData.get("destinationUrl"),
    eventTypes,
    rateLimitPerMinute: integer(formData, "rateLimitPerMinute"),
    idempotencyKey: `notification:webhook:create:${operation}`,
    correlationId: crypto.randomUUID(),
  });
  if (!parsed.success) {
    return errorState(
      "Enter a public HTTPS destination, choose events, and use a 1–600 rate limit.",
    );
  }
  if (!(await verifiedActor()))
    return errorState("Your verified session expired.");
  try {
    const created = await createNotificationWebhookEndpoint(parsed.data);
    revalidatePath("/notifications");
    return created.issued
      ? {
          kind: "success",
          message:
            "Endpoint created disabled. Copy the signing secret now, then complete the reviewed worker deployment.",
          secret: created.issued.secret,
        }
      : errorState(
          "This command already completed, so its secret cannot be shown again. Create another endpoint if the original response was lost.",
        );
  } catch (error) {
    return errorState(
      databaseMessage(error) ?? "The endpoint could not be created safely.",
    );
  }
}

export async function rotateWebhookEndpointAction(
  _previous: WebhookActionState,
  formData: FormData,
): Promise<WebhookActionState> {
  const operation = operationId(formData);
  if (formData.get("confirmation") !== "rotate" || operation === null) {
    return errorState("Review and confirm this signing-secret rotation.");
  }
  const parsed = rotateNotificationWebhookEndpointCommandV1.safeParse({
    version: "1",
    endpointId: formData.get("endpointId"),
    overlapSeconds: integer(formData, "overlapSeconds"),
    idempotencyKey: `notification:webhook:rotate:${operation}`,
    correlationId: crypto.randomUUID(),
  });
  if (!parsed.success)
    return errorState("Choose a valid 0–86400 second overlap.");
  if (!(await verifiedActor()))
    return errorState("Your verified session expired.");
  try {
    const rotated = await rotateNotificationWebhookEndpoint(parsed.data);
    revalidatePath("/notifications");
    return rotated.issued
      ? {
          kind: "success",
          message:
            "Secret rotated while disabled. Copy it now and mount the reviewed current/prior secret pair before activation.",
          secret: rotated.issued.secret,
        }
      : errorState(
          "This rotation already completed, so its secret cannot be shown again. Start another rotation if the original response was lost.",
        );
  } catch (error) {
    return errorState(
      databaseMessage(error) ?? "The endpoint could not be rotated safely.",
    );
  }
}

export async function changeWebhookEndpointStateAction(
  _previous: WebhookActionState,
  formData: FormData,
): Promise<WebhookActionState> {
  const operation = operationId(formData);
  const action = formData.get("action");
  if (
    formData.get("confirmation") !== action ||
    operation === null ||
    (action !== "disable" && action !== "retire")
  ) {
    return errorState("Review and confirm this endpoint lifecycle change.");
  }
  const parsed = changeNotificationWebhookEndpointStateCommandV1.safeParse({
    version: "1",
    endpointId: formData.get("endpointId"),
    action,
    reason: formData.get("reason"),
    idempotencyKey: `notification:webhook:${action}:${operation}`,
    correlationId: crypto.randomUUID(),
  });
  if (!parsed.success)
    return errorState("Enter a single-line lifecycle reason.");
  if (!(await verifiedActor()))
    return errorState("Your verified session expired.");
  try {
    const changed = await changeNotificationWebhookEndpointState(parsed.data);
    revalidatePath("/notifications");
    return {
      kind: "success",
      message:
        changed.state === "retired"
          ? "Endpoint retired. Its live destination and signing fingerprints were removed; delivery evidence remains."
          : "Endpoint disabled before the next delivery authorization.",
      secret: null,
    };
  } catch (error) {
    return errorState(
      databaseMessage(error) ??
        "The lifecycle change could not be applied safely.",
    );
  }
}

function databaseMessage(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("message" in error)) return null;
  const message = typeof error.message === "string" ? error.message : "";
  if (message === "disable the webhook endpoint before rotating it") {
    return "Disable the endpoint before rotating its signing secret.";
  }
  if (message === "disable the webhook endpoint before retiring it") {
    return "Disable the endpoint before retiring it.";
  }
  if (message === "notifications are not enabled for this organization") {
    return "Notification rollout is disabled. Existing delivery evidence and safe endpoint shutdown remain available.";
  }
  return null;
}
