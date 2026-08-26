import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  acceptOrganizationInvitation,
  cookieSet,
  createOrganization,
  createOrganizationInvitation,
  revalidatePath,
  revokeOrganizationInvitation,
  updateOrganizationLifecycle,
  updateOrganizationMember,
} = vi.hoisted(() => ({
  acceptOrganizationInvitation: vi.fn(),
  cookieSet: vi.fn(),
  createOrganization: vi.fn(),
  createOrganizationInvitation: vi.fn(),
  revalidatePath: vi.fn(),
  revokeOrganizationInvitation: vi.fn(),
  updateOrganizationLifecycle: vi.fn(),
  updateOrganizationMember: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: cookieSet }),
}));
vi.mock("@/lib/server/enterprise-identity", async () => {
  const crypto = await import("node:crypto");
  return {
    acceptOrganizationInvitation,
    createOrganization,
    createOrganizationInvitation,
    hashOrganizationInvitationTokenV1: (token: string) =>
      crypto.createHash("sha256").update(token).digest("hex"),
    revokeOrganizationInvitation,
    updateOrganizationLifecycle,
    updateOrganizationMember,
  };
});

import {
  acceptOrganizationInvitationAction,
  createOrganizationAction,
  createOrganizationInvitationAction,
  updateOrganizationLifecycleAction,
  updateOrganizationMemberAction,
} from "./actions";

const organizationId = "9b000000-0000-4000-8000-000000000001";
const membershipId = "9b000000-0000-4000-8000-000000000002";
const operationId = "9b000000-0000-4000-8000-000000000003";
const token = `stfi_v1_${"A".repeat(43)}`;
const idle = { kind: "idle", message: "" } as const;
const invitationIdle = {
  ...idle,
  token: null,
  completedOperationId: null,
} as const;

function baseForm(confirmation: string): FormData {
  const form = new FormData();
  form.set("operationId", operationId);
  form.set("confirmation", confirmation);
  return form;
}

describe("organization lifecycle actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unreviewed organization creation before database access", async () => {
    const form = baseForm("wrong");
    form.set("name", "Northstar");
    form.set("slug", "northstar");
    await expect(createOrganizationAction(idle, form)).resolves.toMatchObject({
      kind: "error",
    });
    expect(createOrganization).not.toHaveBeenCalled();
  });

  it("creates an owner tenant with only canonical public fields", async () => {
    createOrganization.mockResolvedValue({
      resourceId: organizationId,
      outcome: "created",
      revision: 1,
      status: "active",
    });
    const form = baseForm("create");
    form.set("name", "Northstar Commerce");
    form.set("slug", "northstar-commerce");
    await expect(createOrganizationAction(idle, form)).resolves.toMatchObject({
      kind: "success",
    });
    expect(createOrganization).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "northstar-commerce",
        name: "Northstar Commerce",
        idempotencyKey: `organization:create:${operationId}`,
        correlationId: operationId,
      }),
    );
    const command = createOrganization.mock.calls[0]?.[0];
    expect(command).not.toHaveProperty("actorUserId");
    expect(command).not.toHaveProperty("email");
    expect(cookieSet).toHaveBeenCalledWith(
      "starfiniti_organization",
      organizationId,
      expect.any(Object),
    );
  });

  it("stores only the invitation digest and returns a new token once", async () => {
    createOrganizationInvitation.mockResolvedValue({
      resourceId: "9b000000-0000-4000-8000-000000000004",
      outcome: "created",
      revision: 1,
      status: "pending",
    });
    const form = baseForm("invite");
    form.set("organizationId", organizationId);
    form.set("displayLabel", "Jane — Marketing");
    form.set("role", "marketer");
    form.set("expiresAt", new Date(Date.now() + 7 * 86_400_000).toISOString());
    form.set("invitationToken", token);
    await expect(
      createOrganizationInvitationAction(invitationIdle, form),
    ).resolves.toMatchObject({
      kind: "success",
      token,
      completedOperationId: operationId,
    });
    const command = createOrganizationInvitation.mock.calls[0]?.[0];
    expect(command.tokenSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(command.expiresAt).toBe(form.get("expiresAt"));
    expect(command.correlationId).toBe(operationId);
    expect(command).not.toHaveProperty("token");
    expect(command).not.toHaveProperty("email");
  });

  it("never claims a duplicate invitation token can be shown again", async () => {
    createOrganizationInvitation.mockResolvedValue({
      resourceId: "9b000000-0000-4000-8000-000000000004",
      outcome: "duplicate",
      revision: 1,
      status: "pending",
    });
    const form = baseForm("invite");
    form.set("organizationId", organizationId);
    form.set("displayLabel", "Jane — Marketing");
    form.set("role", "marketer");
    form.set("expiresAt", new Date(Date.now() + 7 * 86_400_000).toISOString());
    form.set("invitationToken", token);
    await expect(
      createOrganizationInvitationAction(invitationIdle, form),
    ).resolves.toMatchObject({
      kind: "success",
      token: null,
      completedOperationId: operationId,
    });
  });

  it("accepts an invitation and selects the database-returned organization", async () => {
    acceptOrganizationInvitation.mockResolvedValue({
      resourceId: organizationId,
      outcome: "created",
      revision: 1,
      status: "accepted",
    });
    const form = baseForm("accept");
    form.set("invitationToken", token);
    await expect(
      acceptOrganizationInvitationAction(idle, form),
    ).resolves.toMatchObject({ kind: "success" });
    expect(acceptOrganizationInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      }),
    );
    expect(cookieSet).toHaveBeenCalledWith(
      "starfiniti_organization",
      organizationId,
      expect.any(Object),
    );
  });

  it("requires explicit review for member and tenant state changes", async () => {
    updateOrganizationMember.mockResolvedValue({
      resourceId: membershipId,
      outcome: "updated",
      revision: 2,
      status: "active",
    });
    const member = baseForm("member");
    member.set("organizationId", organizationId);
    member.set("membershipId", membershipId);
    member.set("expectedRevision", "1");
    member.set("memberAction", "change_role");
    member.set("role", "analyst");
    member.set("reason", "Approved reporting responsibility.");
    await expect(
      updateOrganizationMemberAction(idle, member),
    ).resolves.toMatchObject({ kind: "success" });
    expect(updateOrganizationMember).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "change_role",
        role: "analyst",
        expectedRevision: 1,
        idempotencyKey: `organization:membership:change_role:1:${operationId}`,
        correlationId: operationId,
      }),
    );

    updateOrganizationLifecycle.mockResolvedValue({
      resourceId: organizationId,
      outcome: "updated",
      revision: 2,
      status: "suspended",
    });
    const lifecycle = baseForm("lifecycle");
    lifecycle.set("organizationId", organizationId);
    lifecycle.set("expectedRevision", "1");
    lifecycle.set("lifecycleAction", "suspend");
    lifecycle.set("reason", "Investigating unexpected tenant access.");
    await expect(
      updateOrganizationLifecycleAction(idle, lifecycle),
    ).resolves.toMatchObject({ kind: "success" });
    expect(updateOrganizationLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "suspend",
        name: null,
        idempotencyKey: `organization:lifecycle:suspend:1:${operationId}`,
        correlationId: operationId,
      }),
    );
  });
});
