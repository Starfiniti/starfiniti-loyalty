import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createServiceAccount,
  getClaims,
  issueServiceAccountCredential,
  revalidatePath,
  revokeServiceAccountCredential,
} = vi.hoisted(() => ({
  createServiceAccount: vi.fn(),
  getClaims: vi.fn(),
  issueServiceAccountCredential: vi.fn(),
  revalidatePath: vi.fn(),
  revokeServiceAccountCredential: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/server/service-accounts", () => ({
  createServiceAccount,
  issueServiceAccountCredential,
  revokeServiceAccountCredential,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getClaims },
  }),
}));

import {
  createServiceAccountAction,
  issueServiceCredentialAction,
  revokeServiceCredentialAction,
} from "./service-account-actions";

const actorId = "99000000-0000-4000-8000-000000000001";
const workspaceId = "99000000-0000-4000-8000-000000000002";
const programmeId = "99000000-0000-4000-8000-000000000003";
const serviceAccountId = "99000000-0000-4000-8000-000000000004";
const credentialId = "99000000-0000-4000-8000-000000000005";
const operationId = "99000000-0000-4000-8000-000000000006";
const idle = {
  kind: "idle",
  message: "",
  completedOperationId: null,
} as const;
const credentialIdle = { ...idle, token: null } as const;

function createForm(): FormData {
  const form = new FormData();
  form.set("confirmation", "create");
  form.set("operationId", operationId);
  form.set("workspaceId", workspaceId);
  form.set("programmeId", programmeId);
  form.set("displayName", "Warehouse integration");
  form.append("scopes", "customers:write");
  form.append("scopes", "activities:write");
  form.set("requestsPerMinute", "120");
  return form;
}

function issueForm(): FormData {
  const form = new FormData();
  form.set("confirmation", "issue");
  form.set("operationId", operationId);
  form.set("serviceAccountId", serviceAccountId);
  form.set("overlapSeconds", "3600");
  return form;
}

function revokeForm(): FormData {
  const form = new FormData();
  form.set("confirmation", "revoke");
  form.set("operationId", operationId);
  form.set("serviceAccountId", serviceAccountId);
  form.set("credentialId", credentialId);
  form.set("reason", "Scheduled integration retirement");
  return form;
}

describe("service account management actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getClaims.mockResolvedValue({
      data: { claims: { sub: actorId } },
      error: null,
    });
  });

  it("rejects unreviewed and malformed commands before session or database access", async () => {
    const unreviewed = createForm();
    unreviewed.delete("confirmation");
    await expect(createServiceAccountAction(idle, unreviewed)).resolves.toEqual(
      {
        kind: "error",
        message: "Review and confirm the service account.",
        completedOperationId: null,
      },
    );

    const invalidQuota = createForm();
    invalidQuota.set("requestsPerMinute", "6001");
    await expect(
      createServiceAccountAction(idle, invalidQuota),
    ).resolves.toMatchObject({ kind: "error" });

    expect(getClaims).not.toHaveBeenCalled();
    expect(createServiceAccount).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("derives the actor from verified claims and sends only public selectors", async () => {
    createServiceAccount.mockResolvedValue({
      resourceId: serviceAccountId,
      outcome: "created",
    });

    await expect(
      createServiceAccountAction(idle, createForm()),
    ).resolves.toEqual({
      kind: "success",
      message: "Service account created. Issue its first credential below.",
      completedOperationId: operationId,
    });

    expect(createServiceAccount).toHaveBeenCalledWith(
      actorId,
      expect.objectContaining({
        workspaceId,
        programmeId,
        displayName: "Warehouse integration",
        scopes: ["customers:write", "activities:write"],
        requestsPerMinute: 120,
        idempotencyKey: `service-account:create:${operationId}`,
      }),
    );
    const command = createServiceAccount.mock.calls[0]?.[1];
    expect(command).not.toHaveProperty("organizationId");
    expect(command).not.toHaveProperty("actorUserId");
    expect(command).not.toHaveProperty("connectionId");
    expect(revalidatePath).toHaveBeenCalledWith("/operations");
  });

  it("never claims that a duplicate credential secret can be shown again", async () => {
    issueServiceAccountCredential.mockResolvedValue({
      result: {
        resourceId: credentialId,
        secretHint: "abc123",
        outcome: "duplicate",
        priorValidUntil: null,
      },
      token: null,
    });

    await expect(
      issueServiceCredentialAction(credentialIdle, issueForm()),
    ).resolves.toEqual({
      kind: "error",
      message:
        "This issuance was already completed, so its secret cannot be shown again. Start a new rotation if the original response was lost.",
      token: null,
      completedOperationId: operationId,
    });
    expect(issueServiceAccountCredential).toHaveBeenCalledWith(
      actorId,
      expect.objectContaining({
        serviceAccountId,
        overlapSeconds: 3600,
        idempotencyKey: `service-account:credential:issue:${operationId}`,
      }),
    );
  });

  it("returns a newly issued token exactly through the one-time action result", async () => {
    const token = "sflt_v1_99000000000040008000000000000005_one_time_secret";
    issueServiceAccountCredential.mockResolvedValue({
      result: {
        resourceId: credentialId,
        secretHint: "secret",
        outcome: "created",
        priorValidUntil: null,
      },
      token,
    });

    await expect(
      issueServiceCredentialAction(credentialIdle, issueForm()),
    ).resolves.toEqual({
      kind: "success",
      message:
        "Credential issued. Copy it now; Starfiniti cannot reveal it again.",
      token,
      completedOperationId: operationId,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/operations");
  });

  it("revokes with a bounded reason and fails closed when claims expire", async () => {
    revokeServiceAccountCredential.mockResolvedValue({
      resourceId: credentialId,
      outcome: "revoked",
      status: "revoked",
    });
    await expect(
      revokeServiceCredentialAction(idle, revokeForm()),
    ).resolves.toEqual({
      kind: "success",
      message: "Credential revoked immediately.",
      completedOperationId: operationId,
    });
    expect(revokeServiceAccountCredential).toHaveBeenCalledWith(
      actorId,
      expect.objectContaining({
        serviceAccountId,
        credentialId,
        reason: "Scheduled integration retirement",
      }),
    );

    vi.clearAllMocks();
    getClaims.mockResolvedValue({ data: null, error: { code: "expired" } });
    await expect(
      revokeServiceCredentialAction(idle, revokeForm()),
    ).resolves.toEqual({
      kind: "error",
      message: "Your verified session expired.",
      completedOperationId: null,
    });
    expect(revokeServiceAccountCredential).not.toHaveBeenCalled();
  });
});
