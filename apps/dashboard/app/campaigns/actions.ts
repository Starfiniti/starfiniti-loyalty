"use server";

import {
  merchantApproveCampaignVersionCommandV1,
  merchantAudienceDraftResultV1,
  merchantAudiencePublishResultV1,
  merchantAudienceSnapshotResultV1,
  merchantCampaignApprovalResultV1,
  merchantCampaignDraftResultV1,
  merchantCampaignPreviewResultV1,
  merchantCampaignStateChangeResultV1,
  merchantCancelCampaignVersionCommandV1,
  merchantCreateAudienceDraftCommandV1,
  merchantCreateAudienceSnapshotCommandV1,
  merchantCreateCampaignDraftCommandV1,
  merchantPauseCampaignVersionCommandV1,
  merchantPreviewCampaignVersionCommandV1,
  merchantPublishAudienceVersionCommandV1,
  type CampaignPreviewV1,
} from "@starfiniti/contracts";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CampaignActionState = Readonly<{
  kind: "idle" | "success" | "error";
  message: string;
  preview?: CampaignPreviewV1;
}>;

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const idleError = (message: string): CampaignActionState => ({
  kind: "error",
  message,
});

function firstRow(data: unknown): Record<string, unknown> | null {
  const value = Array.isArray(data) ? data[0] : data;
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function parsePayload(formData: FormData): unknown | null {
  const raw = String(formData.get("definition") ?? "");
  if (raw.length === 0 || raw.length > 65_536) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function operationId(formData: FormData): string | null {
  const value = String(formData.get("operationId") ?? "");
  return UUID_V4.test(value) ? value : null;
}

function databaseFailure(error: { code?: string } | null): CampaignActionState {
  if (error?.code === "42501") {
    return idleError(
      "Your live organization role or rollout entitlement does not allow this action.",
    );
  }
  if (error?.code === "23514" || error?.code === "23505") {
    return idleError(
      "The reviewed version changed or conflicts with accepted work. Refresh before continuing.",
    );
  }
  if (error?.code === "22023") {
    return idleError(
      "The submitted definition, schedule, budget, or reason failed protected validation.",
    );
  }
  return idleError(
    "The campaign command could not be completed safely. No change was assumed.",
  );
}

function refreshCampaigns() {
  revalidatePath("/campaigns");
}

export async function createAudienceDraft(
  _previous: CampaignActionState,
  formData: FormData,
): Promise<CampaignActionState> {
  const operation = operationId(formData);
  const definition = parsePayload(formData);
  if (!operation || !definition) {
    return idleError("Review the audience definition before saving.");
  }
  const command = merchantCreateAudienceDraftCommandV1.safeParse({
    schemaVersion: "1",
    programmeId: formData.get("programmeId"),
    definition,
    idempotencyKey: `audience:draft:${operation}`,
    correlationId: crypto.randomUUID(),
  });
  if (!command.success) {
    return idleError(
      "Use an allowlisted metric or tier condition and complete every bound.",
    );
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("create_audience_draft_command", {
      target_programme_public_id: command.data.programmeId,
      target_definition: command.data.definition,
      target_idempotency_key: command.data.idempotencyKey,
      target_correlation_id: command.data.correlationId,
    });
  if (error) return databaseFailure(error);
  const row = firstRow(data);
  const result = merchantAudienceDraftResultV1.safeParse(
    row
      ? {
          resourceId: row.resource_public_id,
          outcome: row.outcome,
          definitionSha256: row.definition_sha256,
          versionNumber: row.version_number,
        }
      : null,
  );
  if (!result.success) return databaseFailure(null);
  refreshCampaigns();
  return {
    kind: "success",
    message:
      result.data.outcome === "duplicate"
        ? `Audience version ${result.data.versionNumber} was already saved.`
        : `Audience version ${result.data.versionNumber} saved as an immutable draft.`,
  };
}

export async function publishAudienceVersion(
  _previous: CampaignActionState,
  formData: FormData,
): Promise<CampaignActionState> {
  const operation = operationId(formData);
  if (!operation || formData.get("confirmation") !== "publish") {
    return idleError(
      "Confirm the exact audience definition before publishing.",
    );
  }
  const command = merchantPublishAudienceVersionCommandV1.safeParse({
    schemaVersion: "1",
    audienceVersionId: formData.get("audienceVersionId"),
    expectedDefinitionSha256: formData.get("definitionSha256"),
    idempotencyKey: `audience:publish:${operation}`,
    correlationId: crypto.randomUUID(),
  });
  if (!command.success) return databaseFailure(null);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("publish_audience_version_command", {
      target_version_public_id: command.data.audienceVersionId,
      target_expected_definition_sha256: command.data.expectedDefinitionSha256,
      target_idempotency_key: command.data.idempotencyKey,
      target_correlation_id: command.data.correlationId,
    });
  if (error) return databaseFailure(error);
  const row = firstRow(data);
  const result = merchantAudiencePublishResultV1.safeParse(
    row
      ? {
          resourceId: row.resource_public_id,
          outcome: row.outcome,
          publishedAt: row.published_at,
        }
      : null,
  );
  if (!result.success) return databaseFailure(null);
  refreshCampaigns();
  return {
    kind: "success",
    message:
      result.data.outcome === "duplicate"
        ? "This exact audience version was already published."
        : "Audience published. Create a frozen snapshot before campaign approval.",
  };
}

export async function createAudienceSnapshot(
  _previous: CampaignActionState,
  formData: FormData,
): Promise<CampaignActionState> {
  const operation = operationId(formData);
  if (!operation) return databaseFailure(null);
  const command = merchantCreateAudienceSnapshotCommandV1.safeParse({
    schemaVersion: "1",
    audienceVersionId: formData.get("audienceVersionId"),
    idempotencyKey: `audience:snapshot:${operation}`,
    correlationId: crypto.randomUUID(),
  });
  if (!command.success) return databaseFailure(null);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("create_audience_snapshot_command", {
      target_version_public_id: command.data.audienceVersionId,
      target_idempotency_key: command.data.idempotencyKey,
      target_correlation_id: command.data.correlationId,
    });
  if (error) return databaseFailure(error);
  const row = firstRow(data);
  const result = merchantAudienceSnapshotResultV1.safeParse(
    row
      ? {
          resourceId: row.resource_public_id,
          outcome: row.outcome,
          snapshotAt: row.snapshot_at,
          memberCount: row.member_count,
        }
      : null,
  );
  if (!result.success) return databaseFailure(null);
  refreshCampaigns();
  return {
    kind: "success",
    message: `${result.data.memberCount} member${result.data.memberCount === "1" ? "" : "s"} frozen into the immutable audience snapshot.`,
  };
}

export async function createCampaignDraft(
  _previous: CampaignActionState,
  formData: FormData,
): Promise<CampaignActionState> {
  const operation = operationId(formData);
  const definition = parsePayload(formData);
  if (!operation || !definition) {
    return idleError("Review the campaign definition before saving.");
  }
  const command = merchantCreateCampaignDraftCommandV1.safeParse({
    schemaVersion: "1",
    programmeId: formData.get("programmeId"),
    definition,
    idempotencyKey: `campaign:draft:${operation}`,
    correlationId: crypto.randomUUID(),
  });
  if (!command.success) {
    return idleError(
      "Complete the audience, schedule, behavior, member caps, and liability budget before saving.",
    );
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("create_campaign_draft_command", {
      target_programme_public_id: command.data.programmeId,
      target_definition: command.data.definition,
      target_idempotency_key: command.data.idempotencyKey,
      target_correlation_id: command.data.correlationId,
    });
  if (error) return databaseFailure(error);
  const row = firstRow(data);
  const result = merchantCampaignDraftResultV1.safeParse(
    row
      ? {
          resourceId: row.resource_public_id,
          outcome: row.outcome,
          definitionSha256: row.definition_sha256,
          versionNumber: row.version_number,
        }
      : null,
  );
  if (!result.success) return databaseFailure(null);
  refreshCampaigns();
  return {
    kind: "success",
    message:
      result.data.outcome === "duplicate"
        ? `Campaign version ${result.data.versionNumber} was already saved.`
        : `Campaign version ${result.data.versionNumber} saved. Preview its exact frozen audience before approval.`,
  };
}

export async function previewCampaignVersion(
  _previous: CampaignActionState,
  formData: FormData,
): Promise<CampaignActionState> {
  const operation = operationId(formData);
  if (!operation) return databaseFailure(null);
  const command = merchantPreviewCampaignVersionCommandV1.safeParse({
    schemaVersion: "1",
    campaignVersionId: formData.get("campaignVersionId"),
    expectedDefinitionSha256: formData.get("definitionSha256"),
    idempotencyKey: `campaign:preview:${operation}`,
    correlationId: crypto.randomUUID(),
  });
  if (!command.success) return databaseFailure(null);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("preview_campaign_version_command", {
      target_version_public_id: command.data.campaignVersionId,
      target_expected_definition_sha256: command.data.expectedDefinitionSha256,
      target_idempotency_key: command.data.idempotencyKey,
      target_correlation_id: command.data.correlationId,
    });
  if (error) return databaseFailure(error);
  const row = firstRow(data);
  const result = merchantCampaignPreviewResultV1.safeParse(
    row
      ? {
          schemaVersion: "1",
          outcome: row.outcome,
          campaignVersionId: row.resource_public_id,
          definitionSha256: row.definition_sha256,
          inclusionMembers: row.inclusion_members,
          excludedMembers: row.excluded_members,
          eligibleMembers: row.eligible_members,
          expectedControlMembers: row.expected_control_members,
          expectedTreatmentMembers: row.expected_treatment_members,
          maximumEffects: row.maximum_effects,
          maximumPoints: row.maximum_points,
          maximumLiabilityMinor: row.maximum_liability_minor,
        }
      : null,
  );
  if (!result.success) return databaseFailure(null);
  const { outcome, ...preview } = result.data;
  void outcome;
  return {
    kind: "success",
    message: `${preview.eligibleMembers} eligible members; ${preview.expectedTreatmentMembers} treatment and ${preview.expectedControlMembers} control.`,
    preview,
  };
}

export async function approveCampaignVersion(
  _previous: CampaignActionState,
  formData: FormData,
): Promise<CampaignActionState> {
  const operation = operationId(formData);
  if (!operation || formData.get("confirmation") !== "approve") {
    return idleError("Confirm the exact preview and budgets before approval.");
  }
  const command = merchantApproveCampaignVersionCommandV1.safeParse({
    schemaVersion: "1",
    campaignVersionId: formData.get("campaignVersionId"),
    expectedDefinitionSha256: formData.get("definitionSha256"),
    idempotencyKey: `campaign:approve:${operation}`,
    correlationId: crypto.randomUUID(),
  });
  if (!command.success) return databaseFailure(null);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("approve_campaign_version_command", {
      target_version_public_id: command.data.campaignVersionId,
      target_expected_definition_sha256: command.data.expectedDefinitionSha256,
      target_idempotency_key: command.data.idempotencyKey,
      target_correlation_id: command.data.correlationId,
    });
  if (error) return databaseFailure(error);
  const row = firstRow(data);
  const result = merchantCampaignApprovalResultV1.safeParse(
    row
      ? {
          resourceId: row.resource_public_id,
          outcome: row.outcome,
          status: row.status,
          startsAt: row.starts_at,
          endsAt: row.ends_at,
          eligibleMembers: row.eligible_members,
          treatmentMembers: row.treatment_members,
          controlMembers: row.control_members,
          assignmentSha256: row.assignment_sha256,
        }
      : null,
  );
  if (!result.success) return databaseFailure(null);
  refreshCampaigns();
  return {
    kind: "success",
    message: `Campaign approved and scheduled with ${result.data.treatmentMembers} treatment and ${result.data.controlMembers} control members.`,
  };
}

async function changeCampaignState(
  formData: FormData,
  action: "pause" | "cancel",
): Promise<CampaignActionState> {
  const operation = operationId(formData);
  if (!operation) return databaseFailure(null);
  const schema =
    action === "pause"
      ? merchantPauseCampaignVersionCommandV1
      : merchantCancelCampaignVersionCommandV1;
  const command = schema.safeParse({
    schemaVersion: "1",
    campaignVersionId: formData.get("campaignVersionId"),
    reason: formData.get("reason"),
    idempotencyKey: `campaign:${action}:${operation}`,
    correlationId: crypto.randomUUID(),
  });
  if (!command.success) {
    return idleError(
      "Add a clear single-line reason of at least eight characters.",
    );
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc(`${action}_campaign_version_command`, {
      target_version_public_id: command.data.campaignVersionId,
      target_reason: command.data.reason,
      target_idempotency_key: command.data.idempotencyKey,
      target_correlation_id: command.data.correlationId,
    });
  if (error) return databaseFailure(error);
  const row = firstRow(data);
  const result = merchantCampaignStateChangeResultV1.safeParse(
    row
      ? {
          resourceId: row.resource_public_id,
          outcome: row.outcome,
          status: row.status,
          changedAt: row.changed_at,
        }
      : null,
  );
  if (!result.success || result.data.status !== `${action}d`) {
    return databaseFailure(null);
  }
  refreshCampaigns();
  return {
    kind: "success",
    message:
      action === "pause"
        ? "Campaign paused. Accepted value and history remain visible."
        : "Campaign cancelled. Historical outcomes remain visible and value reverses only through protected flows.",
  };
}

export async function pauseCampaignVersion(
  _previous: CampaignActionState,
  formData: FormData,
) {
  return changeCampaignState(formData, "pause");
}

export async function cancelCampaignVersion(
  _previous: CampaignActionState,
  formData: FormData,
) {
  return changeCampaignState(formData, "cancel");
}
