"use server";

import {
  createServiceAccountCommandV1,
  issueServiceCredentialCommandV1,
  revokeServiceCredentialCommandV1,
} from "@starfiniti/contracts";
import { revalidatePath } from "next/cache";
import {
  createServiceAccount,
  issueServiceAccountCredential,
  revokeServiceAccountCredential,
} from "@/lib/server/service-accounts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ServiceAccountActionState = Readonly<{
  kind: "idle" | "success" | "error";
  message: string;
  completedOperationId: string | null;
}>;

export type ServiceCredentialActionState = ServiceAccountActionState &
  Readonly<{ token: string | null }>;

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

async function verifiedActor(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const claims = await supabase.auth.getClaims();
  const actorUserId = claims.data?.claims?.sub;
  return claims.error || typeof actorUserId !== "string" ? null : actorUserId;
}

function operationId(formData: FormData): string | null {
  const value = String(formData.get("operationId") ?? "");
  return UUID_V4.test(value) ? value : null;
}

function integer(formData: FormData, name: string): number | null {
  const value = formData.get(name);
  if (typeof value !== "string" || !/^\d{1,5}$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export async function createServiceAccountAction(
  _previous: ServiceAccountActionState,
  formData: FormData,
): Promise<ServiceAccountActionState> {
  const operation = operationId(formData);
  if (formData.get("confirmation") !== "create" || operation === null) {
    return {
      kind: "error",
      message: "Review and confirm the service account.",
      completedOperationId: null,
    };
  }
  const command = createServiceAccountCommandV1.safeParse({
    version: "1",
    workspaceId: formData.get("workspaceId"),
    programmeId: formData.get("programmeId"),
    displayName: formData.get("displayName"),
    scopes: formData.getAll("scopes"),
    requestsPerMinute: integer(formData, "requestsPerMinute"),
    idempotencyKey: `service-account:create:${operation}`,
    correlationId: crypto.randomUUID(),
  });
  if (!command.success) {
    return {
      kind: "error",
      message:
        "Choose at least one scope, a 10–6000 request quota, and a single-line name.",
      completedOperationId: null,
    };
  }
  const actor = await verifiedActor();
  if (!actor)
    return {
      kind: "error",
      message: "Your verified session expired.",
      completedOperationId: null,
    };
  try {
    const result = await createServiceAccount(actor, command.data);
    revalidatePath("/operations");
    return {
      kind: "success",
      message:
        result.outcome === "duplicate"
          ? "This exact service account already exists."
          : "Service account created. Issue its first credential below.",
      completedOperationId: operation,
    };
  } catch (error) {
    return {
      kind: "error",
      message:
        databaseCode(error) === "42501"
          ? "A live owner/admin, linked V2 programme, and ecosystem capability are required."
          : "The service account could not be created safely.",
      completedOperationId: null,
    };
  }
}

export async function issueServiceCredentialAction(
  _previous: ServiceCredentialActionState,
  formData: FormData,
): Promise<ServiceCredentialActionState> {
  const operation = operationId(formData);
  if (formData.get("confirmation") !== "issue" || operation === null) {
    return {
      kind: "error",
      message: "Review and confirm the rotation.",
      token: null,
      completedOperationId: null,
    };
  }
  const command = issueServiceCredentialCommandV1.safeParse({
    version: "1",
    serviceAccountId: formData.get("serviceAccountId"),
    overlapSeconds: integer(formData, "overlapSeconds"),
    idempotencyKey: `service-account:credential:issue:${operation}`,
    correlationId: crypto.randomUUID(),
  });
  if (!command.success) {
    return {
      kind: "error",
      message: "Choose a valid 0–86400 second overlap.",
      token: null,
      completedOperationId: null,
    };
  }
  const actor = await verifiedActor();
  if (!actor)
    return {
      kind: "error",
      message: "Your verified session expired.",
      token: null,
      completedOperationId: null,
    };
  try {
    const issued = await issueServiceAccountCredential(actor, command.data);
    revalidatePath("/operations");
    return issued.token
      ? {
          kind: "success",
          message:
            "Credential issued. Copy it now; Starfiniti cannot reveal it again.",
          token: issued.token,
          completedOperationId: operation,
        }
      : {
          kind: "error",
          message:
            "This issuance was already completed, so its secret cannot be shown again. Start a new rotation if the original response was lost.",
          token: null,
          completedOperationId: operation,
        };
  } catch (error) {
    return {
      kind: "error",
      message:
        databaseCode(error) === "42501"
          ? "A live owner/admin and ecosystem capability are required."
          : "The credential could not be issued safely.",
      token: null,
      completedOperationId: null,
    };
  }
}

export async function revokeServiceCredentialAction(
  _previous: ServiceAccountActionState,
  formData: FormData,
): Promise<ServiceAccountActionState> {
  const operation = operationId(formData);
  if (formData.get("confirmation") !== "revoke" || operation === null) {
    return {
      kind: "error",
      message: "Review and confirm immediate revocation.",
      completedOperationId: null,
    };
  }
  const command = revokeServiceCredentialCommandV1.safeParse({
    version: "1",
    serviceAccountId: formData.get("serviceAccountId"),
    credentialId: formData.get("credentialId"),
    reason: formData.get("reason"),
    idempotencyKey: `service-account:credential:revoke:${operation}`,
    correlationId: crypto.randomUUID(),
  });
  if (!command.success) {
    return {
      kind: "error",
      message: "Enter a single-line revocation reason.",
      completedOperationId: null,
    };
  }
  const actor = await verifiedActor();
  if (!actor)
    return {
      kind: "error",
      message: "Your verified session expired.",
      completedOperationId: null,
    };
  try {
    await revokeServiceAccountCredential(actor, command.data);
    revalidatePath("/operations");
    return {
      kind: "success",
      message: "Credential revoked immediately.",
      completedOperationId: operation,
    };
  } catch {
    return {
      kind: "error",
      message: "The credential could not be revoked safely.",
      completedOperationId: null,
    };
  }
}

function databaseCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error))
    return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}
