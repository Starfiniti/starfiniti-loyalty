import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ schema: () => ({ rpc }) }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  approveCampaignVersion,
  createAudienceDraft,
  createCampaignDraft,
  pauseCampaignVersion,
  previewCampaignVersion,
} from "./actions";

const idle = { kind: "idle" as const, message: "" };
const operationId = "87000000-0000-4000-8000-000000000001";
const programmeId = "87000000-0000-4000-8000-000000000002";
const versionId = "87000000-0000-4000-8000-000000000003";

function audienceDefinition() {
  return {
    schemaVersion: "1",
    code: "high_value",
    name: "High value",
    description: "",
    match: "all",
    conditions: [
      {
        kind: "metric",
        metric: "available_points",
        operator: "at_least",
        minimum: "100",
        maximum: null,
        window: null,
        activityCodes: [],
      },
    ],
  };
}

function campaignDefinition() {
  return {
    schemaVersion: "1",
    code: "autumn_bonus",
    name: "Autumn bonus",
    description: "",
    audienceSnapshotId: "87000000-0000-4000-8000-000000000004",
    exclusionSnapshotIds: [],
    schedule: {
      timezone: "Europe/Ljubljana",
      startsAt: "2026-08-25T08:00:00.000Z",
      startsLocal: "2026-08-25T10:00:00",
      endsAt: "2026-09-25T08:00:00.000Z",
      endsLocal: "2026-09-25T10:00:00",
    },
    behavior: {
      kind: "bonus_points",
      earningRuleCodes: ["purchase-base"],
      reward: { kind: "points", points: "10" },
    },
    capacity: {
      globalEffectLimit: "1000",
      perMemberEffectLimit: 1,
      maximumPoints: "10000",
      maximumLiabilityMinor: null,
      liabilityMinorPerEffect: null,
      liabilityCurrencyCode: null,
      liabilityMinorUnitDigits: null,
    },
    controlBasisPoints: 1000,
  };
}

function form(fields: Record<string, string>) {
  const value = new FormData();
  value.set("operationId", operationId);
  Object.entries(fields).forEach(([key, item]) => value.set(key, item));
  return value;
}

describe("campaign server actions", () => {
  beforeEach(() => rpc.mockReset());

  it("creates an allowlisted audience through the tenant-derived command", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          resource_public_id: versionId,
          outcome: "created",
          definition_sha256: "a".repeat(64),
          version_number: 1,
        },
      ],
      error: null,
    });
    const result = await createAudienceDraft(
      idle,
      form({
        programmeId,
        definition: JSON.stringify(audienceDefinition()),
      }),
    );
    expect(result.kind).toBe("success");
    expect(rpc).toHaveBeenCalledWith(
      "create_audience_draft_command",
      expect.not.objectContaining({
        target_organization_id: expect.anything(),
      }),
    );
  });

  it("rejects arbitrary audience input before PostgreSQL", async () => {
    const result = await createAudienceDraft(
      idle,
      form({
        programmeId,
        definition: JSON.stringify({
          ...audienceDefinition(),
          sql: "select true",
        }),
      }),
    );
    expect(result.kind).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("saves a complete bounded campaign without browser value authority", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          resource_public_id: versionId,
          outcome: "created",
          definition_sha256: "b".repeat(64),
          version_number: 2,
        },
      ],
      error: null,
    });
    const result = await createCampaignDraft(
      idle,
      form({
        programmeId,
        definition: JSON.stringify(campaignDefinition()),
      }),
    );
    expect(result.kind).toBe("success");
    expect(rpc).toHaveBeenCalledWith(
      "create_campaign_draft_command",
      expect.not.objectContaining({
        target_organization_id: expect.anything(),
        target_customer_id: expect.anything(),
      }),
    );
  });

  it("returns an exact preview that reconciles treatment and control", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          resource_public_id: versionId,
          outcome: "created",
          definition_sha256: "c".repeat(64),
          inclusion_members: "100",
          excluded_members: "10",
          eligible_members: "90",
          expected_control_members: "9",
          expected_treatment_members: "81",
          maximum_effects: "90",
          maximum_points: "10000",
          maximum_liability_minor: null,
        },
      ],
      error: null,
    });
    const result = await previewCampaignVersion(
      idle,
      form({ campaignVersionId: versionId, definitionSha256: "c".repeat(64) }),
    );
    expect(result.preview?.eligibleMembers).toBe("90");
    expect(result.preview?.expectedTreatmentMembers).toBe("81");
  });

  it("requires a bounded operational reason before pause", async () => {
    const result = await pauseCampaignVersion(
      idle,
      form({ campaignVersionId: versionId, reason: "short" }),
    );
    expect(result.kind).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation before scheduling approved value", async () => {
    const result = await approveCampaignVersion(
      idle,
      form({ campaignVersionId: versionId, definitionSha256: "c".repeat(64) }),
    );
    expect(result.kind).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
  });
});
