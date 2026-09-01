import { beforeEach, describe, expect, it, vi } from "vitest";

const { revalidatePath, rpc } = vi.hoisted(() => ({
  rpc: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    schema: () => ({ rpc }),
  }),
}));

import { saveExperienceCopy, saveExperienceTheme } from "./actions";

const workspaceId = "92000000-0000-4000-8000-000000000001";
const programmeGroupId = "92000000-0000-4000-8000-000000000002";
const resourceId = "92000000-0000-4000-8000-000000000003";
const operationId = "92000000-0000-4000-8000-000000000004";
const idle = { kind: "idle", message: "" } as const;

function commonForm(): FormData {
  const form = new FormData();
  form.set("lang", "sl-SI");
  form.set("operationId", operationId);
  form.set("workspaceId", workspaceId);
  form.set("programmeGroupId", programmeGroupId);
  return form;
}

function themeForm(): FormData {
  const form = commonForm();
  form.set("brandColor", "#7C2D4F");
  form.set("displayFont", "editorial-serif");
  form.set("cardRadiusPx", "14");
  form.set("heroText", "Beauty that gives back");
  form.set("pointsLabel", "Points");
  form.set("showTier", "on");
  form.set("showRewards", "on");
  form.set("widgetPosition", "right");
  form.set("density", "compact");
  form.set("heroAsset", "crown");
  form.set("showReferrals", "on");
  [
    "account",
    "history",
    "referrals",
    "vip",
    "rewards",
    "earning",
    "overview",
  ].forEach((section) => form.append("sectionOrder", section));
  return form;
}

function copyForm(): FormData {
  const form = commonForm();
  form.set("heroText", "Members get more");
  form.set("pointsLabel", "Stars");
  form.set("balanceLabel", "Your balance");
  form.set("rewardsLabel", "Member rewards");
  form.set("redeemLabel", "Use points");
  form.set("joinLabel", "Join free");
  form.set("earnMessage", "Earn stars on eligible purchases.");
  return form;
}

describe("controlled experience commands", () => {
  beforeEach(() => {
    rpc.mockReset();
    revalidatePath.mockReset();
  });

  it("saves the exact V2 order and controlled tokens", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          resource_public_id: resourceId,
          outcome: "updated",
          revision: 5,
        },
      ],
      error: null,
    });
    await expect(saveExperienceTheme(idle, themeForm())).resolves.toEqual({
      kind: "success",
      message: "Presentation revision 5 saved with an immutable audit record.",
    });
    expect(rpc).toHaveBeenCalledWith(
      "save_experience_theme_v2_command",
      expect.objectContaining({
        target_brand_color: "#7c2d4f",
        target_density: "compact",
        target_hero_asset: "crown",
        target_show_referrals: true,
        target_section_order: [
          "account",
          "history",
          "referrals",
          "vip",
          "rewards",
          "earning",
          "overview",
        ],
        target_idempotency_key: `experience:theme:${operationId}`,
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/experience");
  });

  it("rejects an incomplete section composition before database access", async () => {
    const form = themeForm();
    form.delete("sectionOrder");
    form.append("sectionOrder", "overview");
    await expect(saveExperienceTheme(idle, form)).resolves.toMatchObject({
      kind: "error",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("explains a database-authoritative storefront rollout denial", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: "42501",
        message: "storefront experience capability disabled",
      },
    });
    await expect(saveExperienceTheme(idle, themeForm())).resolves.toEqual({
      kind: "error",
      message:
        "Customer experience authoring is disabled for this organization.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("saves English copy even if a stale language selector is forged", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          resource_public_id: resourceId,
          outcome: "created",
          revision: 1,
          locale: "en",
        },
      ],
      error: null,
    });
    await expect(saveExperienceCopy(idle, copyForm())).resolves.toEqual({
      kind: "success",
      message: "English copy revision 1 saved with immutable audit evidence.",
    });
    expect(rpc).toHaveBeenCalledWith(
      "save_experience_copy_v2_command",
      expect.objectContaining({
        target_points_label: "Stars",
        target_idempotency_key: `experience:copy:${operationId}`,
      }),
    );
  });

  it("fails closed when the database response changes shape", async () => {
    rpc.mockResolvedValue({ data: [{ revision: 9 }], error: null });
    await expect(saveExperienceCopy(idle, copyForm())).resolves.toEqual({
      kind: "error",
      message: "The English copy response could not be verified.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
