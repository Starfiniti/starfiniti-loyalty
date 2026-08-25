import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ schema: () => ({ rpc }) }),
}));

import { getNotificationWorkspace } from "./notifications";

const workspaceId = "e1000000-0000-4000-8000-000000000110";
const eventTypes = [
  "loyalty.points.earned",
  "loyalty.points.released",
  "loyalty.points.expiring",
  "loyalty.reward.changed",
  "loyalty.tier.changed",
  "loyalty.referral.changed",
] as const;
const allowedTokens = {
  "loyalty.points.earned": ["points", "pendingUntil"],
  "loyalty.points.released": ["points", "availableBalance"],
  "loyalty.points.expiring": ["points", "expiresAt", "daysRemaining"],
  "loyalty.reward.changed": ["rewardReservationId", "rewardCode", "state"],
  "loyalty.tier.changed": ["fromTierCode", "toTierCode", "effectiveAt"],
  "loyalty.referral.changed": ["referralId", "party", "state"],
} as const;

function fixture() {
  return {
    schemaVersion: "1",
    generatedAt: "2026-08-25T10:00:00Z",
    deploymentMode: "self_hosted",
    entitlementEnabled: true,
    templates: eventTypes.map((eventType, index) => ({
      schemaVersion: "1",
      templateId: `e1000000-0000-4000-8000-0000000002${String(index).padStart(2, "0")}`,
      templateCode: `template_${index}`,
      eventType,
      locale: "en",
      source: index === 1 ? "organization" : "system",
      templateVersion: index === 1 ? 2 : 1,
      templateSha256: "a".repeat(64),
      subjectTemplate: "A safe subject",
      textTemplate: "A safe body",
      htmlTemplate: "<p>A safe body</p>",
      allowedTokens: [...allowedTokens[eventType]],
      publishedAt: "2026-08-25T09:00:00Z",
    })),
    consent: {
      activeCustomers: "10",
      loyaltyTransactional: {
        subscribed: "9",
        unsubscribed: "1",
        suppressed: "0",
      },
      loyaltyMarketing: {
        subscribed: "4",
        unsubscribed: "5",
        suppressed: "1",
      },
    },
    providers: ["smtp", "klaviyo", "webhook"].map((provider) => ({
      provider,
      enabled: provider === "smtp",
      pending: "0",
      processing: "0",
      retryable: "0",
      held: "0",
      completed: "1",
      suppressed: "0",
      contactUnavailable: "0",
      deadLetter: "0",
      manualReview: "0",
      oldestOutstandingAt: null,
    })),
    issues: [],
  };
}

describe("notification merchant workspace read", () => {
  beforeEach(() => rpc.mockReset());

  it("parses one exact minimized workspace", async () => {
    rpc.mockResolvedValue({
      data: [{ notification_workspace: fixture() }],
      error: null,
    });
    const result = await getNotificationWorkspace(workspaceId);
    expect(result.templates).toHaveLength(6);
    expect(result.templates[1]?.source).toBe("organization");
    expect(rpc).toHaveBeenCalledWith("get_notification_workspace_v1", {
      target_workspace_public_id: workspaceId,
      target_issue_limit: 50,
    });
  });

  it("fails closed on missing, multiple, or malformed containers", async () => {
    for (const data of [
      null,
      [],
      [
        { notification_workspace: fixture() },
        { notification_workspace: fixture() },
      ],
      [{ notification_workspace: { ...fixture(), providers: [] } }],
    ]) {
      rpc.mockResolvedValueOnce({ data, error: null });
      await expect(getNotificationWorkspace(workspaceId)).rejects.toThrow(
        "notification_workspace_unavailable",
      );
    }
  });

  it("rejects diagnostic expansion beyond the public contract", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          notification_workspace: {
            ...fixture(),
            recipientEmail: "private@example.test",
          },
        },
      ],
      error: null,
    });
    await expect(getNotificationWorkspace(workspaceId)).rejects.toThrow(
      "notification_workspace_unavailable",
    );
  });
});
