import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  changeState,
  createEndpoint,
  getClaims,
  revalidatePath,
  rotateEndpoint,
} = vi.hoisted(() => ({
  changeState: vi.fn(),
  createEndpoint: vi.fn(),
  getClaims: vi.fn(),
  revalidatePath: vi.fn(),
  rotateEndpoint: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/server/webhook-endpoints", () => ({
  changeNotificationWebhookEndpointState: changeState,
  createNotificationWebhookEndpoint: createEndpoint,
  rotateNotificationWebhookEndpoint: rotateEndpoint,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getClaims } }),
}));

import {
  changeWebhookEndpointStateAction,
  createWebhookEndpointAction,
  rotateWebhookEndpointAction,
} from "./webhook-actions";

const actorId = "96000000-0000-4000-8000-000000000001";
const workspaceId = "96000000-0000-4000-8000-000000000002";
const endpointId = "96000000-0000-4000-8000-000000000003";
const operationId = "96000000-0000-4000-8000-000000000004";
const idle = { kind: "idle", message: "", secret: null } as const;

function createForm(): FormData {
  const form = new FormData();
  form.set("confirmation", "create");
  form.set("operationId", operationId);
  form.set("workspaceId", workspaceId);
  form.set("label", "Lifecycle automation");
  form.set("destinationUrl", "https://hooks.example.test/starfiniti");
  form.set("rateLimitPerMinute", "60");
  form.append("eventTypes", "loyalty.points.earned");
  form.append("eventTypes", "loyalty.connector.health");
  return form;
}

describe("notification webhook endpoint actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getClaims.mockResolvedValue({
      data: { claims: { sub: actorId } },
      error: null,
    });
  });

  it("rejects unreviewed input before reading the session", async () => {
    const form = createForm();
    form.delete("confirmation");
    await expect(
      createWebhookEndpointAction(idle, form),
    ).resolves.toMatchObject({
      kind: "error",
      secret: null,
    });
    expect(getClaims).not.toHaveBeenCalled();
    expect(createEndpoint).not.toHaveBeenCalled();
  });

  it("sorts allowlisted events and returns a new secret exactly once", async () => {
    createEndpoint.mockResolvedValue({
      result: {
        endpointId,
        state: "disabled",
        outcome: "created",
        priorSecretExpiresAt: null,
      },
      issued: {
        secret: "whsec_one_time",
        fingerprintSha256: "a".repeat(64),
        hint: "secret",
      },
    });
    await expect(
      createWebhookEndpointAction(idle, createForm()),
    ).resolves.toMatchObject({
      kind: "success",
      secret: "whsec_one_time",
    });
    expect(createEndpoint).toHaveBeenCalledWith(
      actorId,
      expect.objectContaining({
        eventTypes: ["loyalty.connector.health", "loyalty.points.earned"],
        workspaceId,
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/notifications");

    createEndpoint.mockResolvedValue({
      result: {
        endpointId,
        state: "disabled",
        outcome: "duplicate",
        priorSecretExpiresAt: null,
      },
      issued: null,
    });
    await expect(
      createWebhookEndpointAction(idle, createForm()),
    ).resolves.toMatchObject({ kind: "error", secret: null });
  });

  it("rotates only through a reviewed bounded command", async () => {
    rotateEndpoint.mockResolvedValue({
      result: {
        endpointId,
        state: "disabled",
        outcome: "rotated",
        priorSecretExpiresAt: "2026-08-26T07:00:00Z",
      },
      issued: {
        secret: "whsec_rotated_once",
        fingerprintSha256: "b".repeat(64),
        hint: "rotate",
      },
    });
    const form = new FormData();
    form.set("confirmation", "rotate");
    form.set("operationId", operationId);
    form.set("endpointId", endpointId);
    form.set("overlapSeconds", "3600");
    await expect(
      rotateWebhookEndpointAction(idle, form),
    ).resolves.toMatchObject({
      kind: "success",
      secret: "whsec_rotated_once",
    });
    expect(rotateEndpoint).toHaveBeenCalledWith(
      actorId,
      expect.objectContaining({ endpointId, overlapSeconds: 3600 }),
    );
  });

  it("derives the actor for terminal retirement and never accepts browser authority", async () => {
    changeState.mockResolvedValue({
      endpointId,
      state: "retired",
      outcome: "retired",
      priorSecretExpiresAt: null,
    });
    const form = new FormData();
    form.set("action", "retire");
    form.set("confirmation", "retire");
    form.set("operationId", operationId);
    form.set("endpointId", endpointId);
    form.set("reason", "Integration decommissioned");
    await expect(
      changeWebhookEndpointStateAction(idle, form),
    ).resolves.toMatchObject({ kind: "success", secret: null });
    expect(changeState).toHaveBeenCalledWith(
      actorId,
      expect.objectContaining({
        endpointId,
        action: "retire",
        reason: "Integration decommissioned",
      }),
    );
    expect(changeState.mock.calls[0]?.[1]).not.toHaveProperty("organizationId");
    expect(changeState.mock.calls[0]?.[1]).not.toHaveProperty("actorUserId");
  });
});
