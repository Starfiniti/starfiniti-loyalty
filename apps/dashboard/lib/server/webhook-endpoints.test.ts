import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    schema: () => ({ rpc }),
  }),
}));

import {
  changeNotificationWebhookEndpointState,
  createNotificationWebhookEndpoint,
  rotateNotificationWebhookEndpoint,
} from "./webhook-endpoints";

const workspaceId = "96000000-0000-4000-8000-000000000002";
const endpointId = "96000000-0000-4000-8000-000000000003";
const correlationId = "96000000-0000-4000-8000-000000000004";

describe("Auth-derived webhook endpoint mutations", () => {
  beforeEach(() => rpc.mockReset());

  it("sends a one-way fingerprint through the authenticated command wrapper", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          endpoint_public_id: endpointId,
          endpoint_state: "disabled",
          outcome: "created",
          prior_secret_expires_at: null,
        },
      ],
      error: null,
    });
    const created = await createNotificationWebhookEndpoint({
      version: "1",
      workspaceId,
      label: "Lifecycle automation",
      destinationUrl: "https://hooks.example.test/starfiniti",
      eventTypes: ["loyalty.connector.health", "loyalty.points.earned"],
      rateLimitPerMinute: 60,
      idempotencyKey: "notification:webhook:create:one",
      correlationId,
    });
    expect(created.issued?.secret).toMatch(/^whsec_/u);
    expect(rpc).toHaveBeenCalledWith(
      "create_notification_webhook_endpoint_command_v1",
      expect.objectContaining({
        target_workspace_public_id: workspaceId,
        target_current_secret_sha256_hex:
          expect.stringMatching(/^[0-9a-f]{64}$/u),
        target_current_secret_hint:
          expect.stringMatching(/^[A-Za-z0-9_-]{6}$/u),
      }),
    );
    const parameters = rpc.mock.calls[0]?.[1];
    expect(parameters).not.toHaveProperty("target_actor_user_id");
    expect(parameters).not.toHaveProperty("target_organization_id");
    expect(parameters).not.toHaveProperty("target_tenant_id");
  });

  it("uses only public endpoint selectors for rotation and terminal state", async () => {
    rpc
      .mockResolvedValueOnce({
        data: [
          {
            endpoint_public_id: endpointId,
            endpoint_state: "disabled",
            outcome: "rotated",
            prior_secret_expires_at: "2026-08-26T07:00:00Z",
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            endpoint_public_id: endpointId,
            endpoint_state: "retired",
            outcome: "retired",
            prior_secret_expires_at: null,
          },
        ],
        error: null,
      });
    await rotateNotificationWebhookEndpoint({
      version: "1",
      endpointId,
      overlapSeconds: 3600,
      idempotencyKey: "notification:webhook:rotate:one",
      correlationId,
    });
    await changeNotificationWebhookEndpointState({
      version: "1",
      endpointId,
      action: "retire",
      reason: "Integration decommissioned",
      idempotencyKey: "notification:webhook:retire:one",
      correlationId,
    });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "rotate_notification_webhook_endpoint_command_v1",
      "change_notification_webhook_endpoint_state_command_v1",
    ]);
    for (const [, parameters] of rpc.mock.calls) {
      expect(parameters).not.toHaveProperty("target_actor_user_id");
      expect(parameters).not.toHaveProperty("target_organization_id");
    }
  });
});
