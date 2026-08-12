"use server";

import {
  merchantCreateProgrammeDraftCommandV1,
  merchantProgrammeDraftResultV1,
  merchantProgrammePublishResultV1,
  merchantPublishProgrammeVersionCommandV1,
  merchantScheduleProgrammeVersionCommandV1,
} from "@starfiniti/contracts";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ProgrammeActionState = Readonly<{
  kind: "idle" | "success" | "error";
  message: string;
}>;

function actionError(error: { code?: string } | null): ProgrammeActionState {
  if (error?.code === "42501") {
    return {
      kind: "error",
      message: "Your current organization role cannot perform this action.",
    };
  }
  if (error?.code === "23514" || error?.code === "22023") {
    return {
      kind: "error",
      message:
        "The programme changed or failed validation. Refresh and review the draft before trying again.",
    };
  }
  return {
    kind: "error",
    message:
      "The command could not be completed safely. No change was assumed.",
  };
}

function firstResult(data: unknown): Record<string, unknown> | null {
  const value = Array.isArray(data) ? data[0] : data;
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

export async function saveProgrammeDraft(
  _previousState: ProgrammeActionState,
  formData: FormData,
): Promise<ProgrammeActionState> {
  let configuration: unknown;
  try {
    configuration = JSON.parse(String(formData.get("configuration") ?? ""));
  } catch {
    return { kind: "error", message: "The draft configuration is not valid." };
  }

  const operationId = String(formData.get("operationId") ?? "");
  const command = merchantCreateProgrammeDraftCommandV1.safeParse({
    version: "1",
    programmeId: formData.get("programmeId"),
    configuration,
    idempotencyKey: `programme:draft:${operationId}`,
    correlationId: crypto.randomUUID(),
  });
  if (!command.success) {
    return {
      kind: "error",
      message: "Fix the highlighted programme validation issues before saving.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("create_programme_draft_command", {
      target_programme_public_id: command.data.programmeId,
      target_configuration: command.data.configuration,
      target_idempotency_key: command.data.idempotencyKey,
      target_correlation_id: command.data.correlationId,
    });
  if (error) return actionError(error);

  const row = firstResult(data);
  const result = merchantProgrammeDraftResultV1.safeParse(
    row
      ? {
          resourceId: row.resource_public_id,
          outcome: row.outcome,
          configurationSha256: row.configuration_sha256,
          versionNumber: row.version_number,
        }
      : null,
  );
  if (!result.success) return actionError(null);

  revalidatePath("/programme");
  return {
    kind: "success",
    message:
      result.data.outcome === "duplicate"
        ? `Draft v${result.data.versionNumber} was already saved.`
        : `Draft v${result.data.versionNumber} saved with an immutable configuration fingerprint.`,
  };
}

export async function publishProgrammeVersion(
  _previousState: ProgrammeActionState,
  formData: FormData,
): Promise<ProgrammeActionState> {
  if (formData.get("confirmation") !== "publish") {
    return {
      kind: "error",
      message: "Confirm that you reviewed the exact draft before publishing.",
    };
  }

  const operationId = String(formData.get("operationId") ?? "");
  const command = merchantPublishProgrammeVersionCommandV1.safeParse({
    version: "1",
    programmeVersionId: formData.get("programmeVersionId"),
    expectedConfigurationSha256: formData.get("configurationSha256"),
    idempotencyKey: `programme:publish:${operationId}`,
    correlationId: crypto.randomUUID(),
  });
  if (!command.success) return actionError(null);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("publish_programme_version_command", {
      target_version_public_id: command.data.programmeVersionId,
      target_expected_configuration_sha256:
        command.data.expectedConfigurationSha256,
      target_idempotency_key: command.data.idempotencyKey,
      target_correlation_id: command.data.correlationId,
    });
  if (error) return actionError(error);

  const row = firstResult(data);
  const result = merchantProgrammePublishResultV1.safeParse(
    row
      ? {
          resourceId: row.resource_public_id,
          outcome: row.outcome,
          effectiveAt: row.published_at,
        }
      : null,
  );
  if (!result.success) return actionError(null);

  revalidatePath("/");
  revalidatePath("/programme");
  return {
    kind: "success",
    message:
      result.data.outcome === "duplicate"
        ? "This exact publication was already completed."
        : "The reviewed programme version is now published.",
  };
}

export async function scheduleProgrammeVersion(
  _previousState: ProgrammeActionState,
  formData: FormData,
): Promise<ProgrammeActionState> {
  const scheduledInput = String(formData.get("scheduledFor") ?? "");
  const scheduledDate = new Date(scheduledInput);
  if (!scheduledInput || Number.isNaN(scheduledDate.valueOf())) {
    return {
      kind: "error",
      message: "Choose a valid future publication time.",
    };
  }

  const operationId = String(formData.get("operationId") ?? "");
  const command = merchantScheduleProgrammeVersionCommandV1.safeParse({
    version: "1",
    programmeVersionId: formData.get("programmeVersionId"),
    expectedConfigurationSha256: formData.get("configurationSha256"),
    scheduledFor: scheduledDate.toISOString(),
    idempotencyKey: `programme:schedule:${operationId}`,
    correlationId: crypto.randomUUID(),
  });
  if (!command.success) return actionError(null);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("schedule_programme_version_command", {
      target_version_public_id: command.data.programmeVersionId,
      target_expected_configuration_sha256:
        command.data.expectedConfigurationSha256,
      target_scheduled_for: command.data.scheduledFor,
      target_idempotency_key: command.data.idempotencyKey,
      target_correlation_id: command.data.correlationId,
    });
  if (error) return actionError(error);

  const row = firstResult(data);
  const result = merchantProgrammePublishResultV1.safeParse(
    row
      ? {
          resourceId: row.resource_public_id,
          outcome: row.outcome,
          effectiveAt: row.scheduled_for,
        }
      : null,
  );
  if (!result.success) return actionError(null);

  revalidatePath("/programme");
  return {
    kind: "success",
    message:
      result.data.outcome === "duplicate"
        ? "This exact schedule was already recorded."
        : `Publication scheduled for ${new Date(result.data.effectiveAt).toLocaleString("en-GB")}.`,
  };
}
