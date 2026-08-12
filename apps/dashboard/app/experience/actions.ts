"use server";

import {
  merchantExperienceThemeResultV1,
  merchantSaveExperienceThemeCommandV1,
} from "@starfiniti/contracts";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ExperienceActionState = Readonly<{
  kind: "idle" | "success" | "error";
  message: string;
}>;

function firstResult(data: unknown): Record<string, unknown> | null {
  const value = Array.isArray(data) ? data[0] : data;
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

export async function saveExperienceTheme(
  _previousState: ExperienceActionState,
  formData: FormData,
): Promise<ExperienceActionState> {
  const operationId = String(formData.get("operationId") ?? "");
  const command = merchantSaveExperienceThemeCommandV1.safeParse({
    version: "1",
    workspaceId: formData.get("workspaceId"),
    programmeGroupId: formData.get("programmeGroupId"),
    theme: {
      version: "1",
      brandColor: String(formData.get("brandColor") ?? "").toLowerCase(),
      displayFont: formData.get("displayFont"),
      cardRadiusPx: Number(formData.get("cardRadiusPx")),
      heroText: formData.get("heroText"),
      pointsLabel: formData.get("pointsLabel"),
      showTier: formData.get("showTier") === "on",
      showRewards: formData.get("showRewards") === "on",
      widgetPosition: formData.get("widgetPosition"),
    },
    idempotencyKey: `experience:theme:${operationId}`,
    correlationId: crypto.randomUUID(),
  });
  if (!command.success) {
    return {
      kind: "error",
      message:
        "Use an accessible dark brand color and keep all customer copy within the displayed limits.",
    };
  }

  const { theme } = command.data;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("save_experience_theme_command", {
      target_workspace_public_id: command.data.workspaceId,
      target_programme_group_public_id: command.data.programmeGroupId,
      target_brand_color: theme.brandColor,
      target_display_font: theme.displayFont,
      target_card_radius_px: theme.cardRadiusPx,
      target_hero_text: theme.heroText,
      target_points_label: theme.pointsLabel,
      target_show_tier: theme.showTier,
      target_show_rewards: theme.showRewards,
      target_widget_position: theme.widgetPosition,
      target_idempotency_key: command.data.idempotencyKey,
      target_correlation_id: command.data.correlationId,
    });
  if (error?.code === "42501") {
    return {
      kind: "error",
      message: "Your current organization role cannot change this theme.",
    };
  }
  if (error?.code === "23514") {
    return {
      kind: "error",
      message:
        "This save conflicts with a completed request. Refresh and retry.",
    };
  }
  if (error) {
    return {
      kind: "error",
      message: "The theme could not be saved safely. No change was assumed.",
    };
  }

  const row = firstResult(data);
  const result = merchantExperienceThemeResultV1.safeParse(
    row
      ? {
          resourceId: row.resource_public_id,
          outcome: row.outcome,
          revision: row.revision,
        }
      : null,
  );
  if (!result.success) {
    return {
      kind: "error",
      message: "The theme response could not be verified.",
    };
  }

  revalidatePath("/experience");
  return {
    kind: "success",
    message:
      result.data.outcome === "duplicate"
        ? `Theme revision ${result.data.revision} was already saved.`
        : `Theme revision ${result.data.revision} saved with an immutable audit record.`,
  };
}
