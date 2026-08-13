"use server";

import {
  merchantCreateProgrammeCommandV1,
  merchantCreateProgrammeDraftCommandV1,
  merchantProgrammeCreateResultV1,
  merchantProgrammeDraftResultV1,
  merchantProgrammePublishResultV1,
  merchantPublishProgrammeVersionCommandV1,
  merchantScheduleProgrammeVersionCommandV1,
} from "@starfiniti/contracts";
import { revalidatePath } from "next/cache";
import { parseMerchantLocalDateTime } from "@/lib/merchant-date-time";
import {
  merchantText,
  resolveMerchantLocale,
  type MerchantLocale,
} from "@/lib/merchant-locale";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  programmeDraftResultText,
  programmeScheduleResultText,
} from "./programme-action-copy";

export type ProgrammeActionState = Readonly<{
  kind: "idle" | "success" | "error";
  message: string;
}>;

function actionError(
  error: { code?: string } | null,
  locale: MerchantLocale,
): ProgrammeActionState {
  if (error?.code === "42501") {
    return {
      kind: "error",
      message: merchantText(
        locale,
        "Your current organization role cannot perform this action.",
      ),
    };
  }
  if (error?.code === "23514" || error?.code === "23505") {
    return {
      kind: "error",
      message: merchantText(
        locale,
        "This request conflicts with an existing programme operation. Refresh and review the current state.",
      ),
    };
  }
  if (error?.code === "22023") {
    return {
      kind: "error",
      message: merchantText(
        locale,
        "The programme input failed server validation.",
      ),
    };
  }
  return {
    kind: "error",
    message: merchantText(
      locale,
      "The command could not be completed safely. No change was assumed.",
    ),
  };
}

export async function createInitialProgramme(
  _previousState: ProgrammeActionState,
  formData: FormData,
): Promise<ProgrammeActionState> {
  const locale = resolveMerchantLocale(formData.get("lang"));
  const operationId = String(formData.get("operationId") ?? "");
  const command = merchantCreateProgrammeCommandV1.safeParse({
    version: "1",
    programmeGroupId: formData.get("programmeGroupId"),
    slug: formData.get("slug"),
    name: formData.get("name"),
    idempotencyKey: `programme:create:${operationId}`,
    correlationId: crypto.randomUUID(),
  });
  if (!command.success) {
    return {
      kind: "error",
      message: merchantText(
        locale,
        "Use a name up to 200 characters and a lowercase hyphenated slug.",
      ),
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("create_programme_command", {
      target_programme_group_public_id: command.data.programmeGroupId,
      target_slug: command.data.slug,
      target_name: command.data.name,
      target_idempotency_key: command.data.idempotencyKey,
      target_correlation_id: command.data.correlationId,
    });
  if (error) return actionError(error, locale);

  const row = firstResult(data);
  const result = merchantProgrammeCreateResultV1.safeParse(
    row
      ? {
          resourceId: row.resource_public_id,
          outcome: row.outcome,
        }
      : null,
  );
  if (!result.success) return actionError(null, locale);

  revalidatePath("/");
  revalidatePath("/programme");
  return {
    kind: "success",
    message: merchantText(
      locale,
      result.data.outcome === "duplicate"
        ? "This programme was already created."
        : "Programme created. Continue by saving and publishing its first draft.",
    ),
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
  const locale = resolveMerchantLocale(formData.get("lang"));
  let configuration: unknown;
  try {
    configuration = JSON.parse(String(formData.get("configuration") ?? ""));
  } catch {
    return {
      kind: "error",
      message: merchantText(locale, "The draft configuration is not valid."),
    };
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
      message: merchantText(
        locale,
        "Fix the highlighted programme validation issues before saving.",
      ),
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
  if (error) return actionError(error, locale);

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
  if (!result.success) return actionError(null, locale);

  revalidatePath("/programme");
  return {
    kind: "success",
    message: programmeDraftResultText(
      locale,
      result.data.versionNumber,
      result.data.outcome === "duplicate",
    ),
  };
}

export async function publishProgrammeVersion(
  _previousState: ProgrammeActionState,
  formData: FormData,
): Promise<ProgrammeActionState> {
  const locale = resolveMerchantLocale(formData.get("lang"));
  if (formData.get("confirmation") !== "publish") {
    return {
      kind: "error",
      message: merchantText(
        locale,
        "Confirm that you reviewed the exact draft before publishing.",
      ),
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
  if (!command.success) return actionError(null, locale);

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
  if (error) return actionError(error, locale);

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
  if (!result.success) return actionError(null, locale);

  revalidatePath("/");
  revalidatePath("/programme");
  return {
    kind: "success",
    message: merchantText(
      locale,
      result.data.outcome === "duplicate"
        ? "This exact publication was already completed."
        : "The reviewed programme version is now published.",
    ),
  };
}

export async function scheduleProgrammeVersion(
  _previousState: ProgrammeActionState,
  formData: FormData,
): Promise<ProgrammeActionState> {
  const locale = resolveMerchantLocale(formData.get("lang"));
  const scheduledInput = String(formData.get("scheduledFor") ?? "");
  const scheduledDate = parseMerchantLocalDateTime(scheduledInput);
  if (!scheduledDate) {
    return {
      kind: "error",
      message: merchantText(locale, "Choose a valid future publication time."),
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
  if (!command.success) return actionError(null, locale);

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
  if (error) return actionError(error, locale);

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
  if (!result.success) return actionError(null, locale);

  revalidatePath("/programme");
  return {
    kind: "success",
    message: programmeScheduleResultText(
      locale,
      result.data.effectiveAt,
      result.data.outcome === "duplicate",
    ),
  };
}
