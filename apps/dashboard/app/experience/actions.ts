"use server";

import {
  merchantExperienceThemeResultV1,
  merchantExperienceTranslationResultV1,
  merchantSaveExperienceCopyCommandV2,
  merchantSaveExperienceThemeCommandV2,
} from "@starfiniti/contracts";
import { revalidatePath } from "next/cache";
import { merchantText } from "@/lib/merchant-locale";
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
  const locale = "en" as const;
  const message = (source: string) => merchantText(locale, source);
  const operationId = String(formData.get("operationId") ?? "");
  const command = merchantSaveExperienceThemeCommandV2.safeParse({
    version: "2",
    workspaceId: formData.get("workspaceId"),
    programmeGroupId: formData.get("programmeGroupId"),
    theme: {
      version: "2",
      brandColor: String(formData.get("brandColor") ?? "").toLowerCase(),
      displayFont: formData.get("displayFont"),
      cardRadiusPx: Number(formData.get("cardRadiusPx")),
      heroText: formData.get("heroText"),
      pointsLabel: formData.get("pointsLabel"),
      showTier: formData.get("showTier") === "on",
      showRewards: formData.get("showRewards") === "on",
      widgetPosition: formData.get("widgetPosition"),
      density: formData.get("density"),
      heroAsset: formData.get("heroAsset"),
      showReferrals: formData.get("showReferrals") === "on",
      sectionOrder: formData.getAll("sectionOrder").map(String),
    },
    idempotencyKey: `experience:theme:${operationId}`,
    correlationId: crypto.randomUUID(),
  });
  if (!command.success) {
    return {
      kind: "error",
      message: message(
        "Use an accessible dark brand color and keep all customer copy within the displayed limits.",
      ),
    };
  }

  const { theme } = command.data;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("save_experience_theme_v2_command", {
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
      target_density: theme.density,
      target_hero_asset: theme.heroAsset,
      target_show_referrals: theme.showReferrals,
      target_section_order: theme.sectionOrder,
      target_idempotency_key: command.data.idempotencyKey,
      target_correlation_id: command.data.correlationId,
    });
  if (
    error?.code === "42501" &&
    error.message === "storefront experience capability disabled"
  ) {
    return {
      kind: "error",
      message:
        "Customer experience authoring is disabled for this organization.",
    };
  }
  if (error?.code === "42501") {
    return {
      kind: "error",
      message: message(
        "Your current organization role cannot change this theme.",
      ),
    };
  }
  if (error?.code === "23514") {
    return {
      kind: "error",
      message: message(
        "This save conflicts with a completed request. Refresh and retry.",
      ),
    };
  }
  if (error) {
    return {
      kind: "error",
      message: message(
        "The theme could not be saved safely. No change was assumed.",
      ),
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
      message: message("The presentation response could not be verified."),
    };
  }

  revalidatePath("/experience");
  return {
    kind: "success",
    message:
      result.data.outcome === "duplicate"
        ? `Presentation revision ${result.data.revision} was already saved.`
        : `Presentation revision ${result.data.revision} saved with an immutable audit record.`,
  };
}

export async function saveExperienceCopy(
  _previousState: ExperienceActionState,
  formData: FormData,
): Promise<ExperienceActionState> {
  const locale = "en" as const;
  const message = (source: string) => merchantText(locale, source);
  const operationId = String(formData.get("operationId") ?? "");
  const command = merchantSaveExperienceCopyCommandV2.safeParse({
    version: "2",
    workspaceId: formData.get("workspaceId"),
    programmeGroupId: formData.get("programmeGroupId"),
    copy: {
      version: "2",
      locale: "en",
      heroText: formData.get("heroText"),
      pointsLabel: formData.get("pointsLabel"),
      balanceLabel: formData.get("balanceLabel"),
      rewardsLabel: formData.get("rewardsLabel"),
      redeemLabel: formData.get("redeemLabel"),
      joinLabel: formData.get("joinLabel"),
      earnMessage: formData.get("earnMessage"),
    },
    idempotencyKey: `experience:copy:${operationId}`,
    correlationId: crypto.randomUUID(),
  });
  if (!command.success) {
    return {
      kind: "error",
      message: message(
        "Keep each English customer-facing label single-line and within its displayed limit.",
      ),
    };
  }

  const { copy } = command.data;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("save_experience_copy_v2_command", {
      target_workspace_public_id: command.data.workspaceId,
      target_programme_group_public_id: command.data.programmeGroupId,
      target_hero_text: copy.heroText,
      target_points_label: copy.pointsLabel,
      target_balance_label: copy.balanceLabel,
      target_rewards_label: copy.rewardsLabel,
      target_redeem_label: copy.redeemLabel,
      target_join_label: copy.joinLabel,
      target_earn_message: copy.earnMessage,
      target_idempotency_key: command.data.idempotencyKey,
      target_correlation_id: command.data.correlationId,
    });
  if (
    error?.code === "42501" &&
    error.message === "storefront experience capability disabled"
  ) {
    return {
      kind: "error",
      message:
        "Customer experience authoring is disabled for this organization.",
    };
  }
  if (error?.code === "42501") {
    return {
      kind: "error",
      message: message(
        "Your current organization role cannot change customer copy.",
      ),
    };
  }
  if (error?.code === "23514") {
    return {
      kind: "error",
      message: message(
        "This copy save conflicts with a completed request. Refresh and retry.",
      ),
    };
  }
  if (error) {
    return {
      kind: "error",
      message: message(
        "The customer copy could not be saved safely. No change was assumed.",
      ),
    };
  }

  const row = firstResult(data);
  const result = merchantExperienceTranslationResultV1.safeParse(
    row
      ? {
          resourceId: row.resource_public_id,
          outcome: row.outcome,
          revision: row.revision,
          locale: row.locale,
        }
      : null,
  );
  if (!result.success || result.data.locale !== "en") {
    return {
      kind: "error",
      message: message("The English copy response could not be verified."),
    };
  }

  revalidatePath("/experience");
  return {
    kind: "success",
    message:
      result.data.outcome === "duplicate"
        ? `English copy revision ${result.data.revision} was already saved.`
        : `English copy revision ${result.data.revision} saved with immutable audit evidence.`,
  };
}
