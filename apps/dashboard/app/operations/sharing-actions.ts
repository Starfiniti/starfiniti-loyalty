"use server";

import {
  configureProgrammeGroupSharingCommandV1,
  configureProgrammeGroupSharingResultV1,
} from "@starfiniti/contracts";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SharingActionState = Readonly<{
  kind: "idle" | "success" | "error";
  message: string;
}>;

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function configureProgrammeGroupSharing(
  _previousState: SharingActionState,
  formData: FormData,
): Promise<SharingActionState> {
  if (formData.get("confirmation") !== "configure") {
    return { kind: "error", message: "Review and confirm the wallet scope." };
  }
  const operationId = String(formData.get("operationId") ?? "");
  if (!UUID_V4.test(operationId)) {
    return {
      kind: "error",
      message: "The policy operation is invalid. Refresh and retry.",
    };
  }

  const rawExpectedRevision = formData.get("expectedRevision");
  if (
    typeof rawExpectedRevision !== "string" ||
    !/^(0|[1-9][0-9]{0,8})$/u.test(rawExpectedRevision)
  ) {
    return {
      kind: "error",
      message: "The policy revision is invalid. Refresh and retry.",
    };
  }
  const expectedRevision = Number(rawExpectedRevision);
  const command = configureProgrammeGroupSharingCommandV1.safeParse({
    version: "1",
    programmeGroupId: formData.get("programmeGroupId"),
    mode: formData.get("mode"),
    workspaceIds: formData.getAll("workspaceIds"),
    expectedRevision,
    idempotencyKey: `programme-group:sharing:${operationId}`,
    correlationId: crypto.randomUUID(),
  });
  if (!command.success) {
    return {
      kind: "error",
      message:
        "Choose exactly one isolated workspace or at least two explicit shared workspaces.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("configure_programme_group_sharing_v1", {
      target_programme_group_public_id: command.data.programmeGroupId,
      target_sharing_mode: command.data.mode,
      target_workspace_public_ids: command.data.workspaceIds,
      target_expected_revision: command.data.expectedRevision,
      target_idempotency_key: command.data.idempotencyKey,
      target_correlation_id: command.data.correlationId,
    });
  if (error) {
    return {
      kind: "error",
      message:
        error.code === "42501"
          ? "A live owner/admin and the ecosystem capability are required."
          : error.code === "23514"
            ? "The policy changed or a connected workspace is protected. Refresh before retrying."
            : "The exact wallet scope could not be saved safely.",
    };
  }

  const row = (Array.isArray(data) ? data[0] : data) as Record<
    string,
    unknown
  > | null;
  const result = configureProgrammeGroupSharingResultV1.safeParse(
    row
      ? {
          resourceId: row.resource_public_id,
          outcome: row.outcome,
          revision: row.revision,
          mode: row.sharing_mode,
          workspaceIds: row.workspace_public_ids,
        }
      : null,
  );
  if (!result.success) {
    return {
      kind: "error",
      message: "The saved policy response could not be verified.",
    };
  }

  revalidatePath("/operations");
  return {
    kind: "success",
    message:
      result.data.outcome === "duplicate"
        ? `This exact wallet scope is already revision ${result.data.revision}.`
        : `Wallet scope revision ${result.data.revision} saved with immutable audit evidence.`,
  };
}
