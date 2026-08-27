import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ schema: () => ({ rpc }) }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { publishNotificationTemplate, sendNotificationTest } from "./actions";

const idle = { kind: "idle" as const, message: "" };
const operationId = "e1000000-0000-4000-8000-000000000201";
const workspaceId = "e1000000-0000-4000-8000-000000000110";

function form(fields: Record<string, string>) {
  const value = new FormData();
  value.set("operationId", operationId);
  Object.entries(fields).forEach(([key, item]) => value.set(key, item));
  return value;
}

describe("notification server actions", () => {
  beforeEach(() => rpc.mockReset());

  it("publishes allowlisted safe text without browser tenant authority", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          template_id: "e1000000-0000-4000-8000-000000000210",
          template_version: 2,
          outcome: "created",
        },
      ],
      error: null,
    });
    const result = await publishNotificationTemplate(
      idle,
      form({
        workspaceId,
        eventType: "loyalty.points.released",
        subjectTemplate: "{{points}} points are ready",
        textTemplate: "Balance: {{availableBalance}} points.",
      }),
    );
    expect(result).toMatchObject({ kind: "success" });
    expect(rpc).toHaveBeenCalledWith(
      "publish_notification_email_template_command",
      expect.not.objectContaining({
        target_organization_id: expect.anything(),
        target_actor_user_id: expect.anything(),
        target_template_version: expect.anything(),
      }),
    );
  });

  it("rejects markup, URLs, and unknown tokens before PostgreSQL", async () => {
    for (const textTemplate of [
      "<strong>{{points}}</strong>",
      "Visit https://example.test",
      "Hello {{customerEmail}}",
    ]) {
      const result = await publishNotificationTemplate(
        idle,
        form({
          workspaceId,
          eventType: "loyalty.points.released",
          subjectTemplate: "Points update",
          textTemplate,
        }),
      );
      expect(result.kind).toBe("error");
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("queues a test without accepting a recipient or sample values", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          test_delivery_id: "e1000000-0000-4000-8000-000000000220",
          state: "pending",
          outcome: "created",
        },
      ],
      error: null,
    });
    const value = form({
      workspaceId,
      eventType: "loyalty.points.released",
      recipientEmail: "attacker@example.test",
      points: "999999999",
    });
    const result = await sendNotificationTest(idle, value);
    expect(result).toMatchObject({ kind: "success" });
    expect(rpc).toHaveBeenCalledWith(
      "send_notification_test_command",
      expect.not.objectContaining({
        target_recipient_email: expect.anything(),
        target_points: expect.anything(),
        target_organization_id: expect.anything(),
      }),
    );
  });

  it("does not present malformed database results as successful sends", async () => {
    rpc.mockResolvedValue({ data: [{ state: "pending" }], error: null });
    const result = await sendNotificationTest(
      idle,
      form({
        workspaceId,
        eventType: "loyalty.points.released",
      }),
    );
    expect(result.kind).toBe("error");
  });
});
