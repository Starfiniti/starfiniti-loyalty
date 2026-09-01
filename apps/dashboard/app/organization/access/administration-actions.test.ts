import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  acceptAgencyInvitation: vi.fn(),
  createAgencyInvitation: vi.fn(),
  createSupportAccessRequest: vi.fn(),
  getOrganizationAdministrationExport: vi.fn(),
  getSupportWorkspace: vi.fn(),
  resolveSupportAccessRequest: vi.fn(),
  revalidatePath: vi.fn(),
  revokeAgencyRelationship: vi.fn(),
  revokeSupportAccessGrant: vi.fn(),
  startOrganizationBreakGlass: vi.fn(),
  updateOrganizationDeletion: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/server/enterprise-administration", async () => {
  const { createHash: hash } = await import("node:crypto");
  return {
    ...mocks,
    hashAgencyInvitationTokenV1: (token: string) =>
      hash("sha256").update(token, "utf8").digest("hex"),
  };
});

import {
  administrationIdle,
  createAgencyInvitationAction,
  createSupportRequestAction,
  exportOrganizationAdministrationAction,
  openSupportWorkspaceAction,
  resolveSupportRequestAction,
  startBreakGlassAction,
  updateOrganizationDeletionAction,
} from "./administration-actions";

const organizationId = "10000000-0000-4000-8000-000000000001";
const clientOrganizationId = "20000000-0000-4000-8000-000000000001";
const operationId = "30000000-0000-4000-8000-000000000001";
const grantId = "40000000-0000-4000-8000-000000000001";
const sessionId = "50000000-0000-4000-8000-000000000001";
const requestId = "60000000-0000-4000-8000-000000000001";
const invitationToken = `stfa_v1_${"A".repeat(43)}`;

describe("enterprise administration server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a new agency token once while sending only its digest to PostgreSQL", async () => {
    mocks.createAgencyInvitation.mockResolvedValue({
      outcome: "created",
      resourceId: requestId,
      revision: 1,
      status: "pending",
    });

    const result = await createAgencyInvitationAction(
      administrationIdle,
      agencyInvitationForm(),
    );

    expect(result).toMatchObject({ kind: "success", token: invitationToken });
    expect(mocks.createAgencyInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        clientOrganizationId: organizationId,
        tokenSha256: createHash("sha256").update(invitationToken).digest("hex"),
        idempotencyKey: `agency:invitation:create:${operationId}`,
      }),
    );
    expect(
      JSON.stringify(mocks.createAgencyInvitation.mock.calls),
    ).not.toContain(invitationToken);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/organization/access");
  });

  it("rejects malformed invitation authority before database access", async () => {
    const form = agencyInvitationForm();
    form.set("invitationToken", "stfa_v1_browser-chosen-authority");

    await expect(
      createAgencyInvitationAction(administrationIdle, form),
    ).resolves.toMatchObject({ kind: "error", token: null });
    expect(mocks.createAgencyInvitation).not.toHaveBeenCalled();
  });

  it("canonicalizes exact support scopes and ignores browser actor claims", async () => {
    mocks.createSupportAccessRequest.mockResolvedValue({
      outcome: "created",
      resourceId: requestId,
      revision: 1,
      status: "pending",
    });
    const form = supportRequestForm();
    form.append("scope", "organization.summary.read");
    form.append("scope", "audit.summary.read");
    form.set("actorUserId", "browser-forged-owner");
    form.set("assuranceLevel", "aal2");

    const result = await createSupportRequestAction(administrationIdle, form);

    expect(result.kind).toBe("success");
    expect(mocks.createSupportAccessRequest).toHaveBeenCalledWith({
      version: "1",
      agencyOrganizationId: organizationId,
      clientOrganizationId,
      scopes: ["audit.summary.read", "organization.summary.read"],
      reason: "Investigate the merchant identity health incident.",
      requestedExpiresAt: expect.any(String),
      idempotencyKey: `support:request:create:${operationId}`,
      correlationId: operationId,
    });
    expect(
      JSON.stringify(mocks.createSupportAccessRequest.mock.calls),
    ).not.toMatch(/actorUserId|assuranceLevel|browser-forged-owner/u);
  });

  it("rejects an unknown support scope before database access", async () => {
    const form = supportRequestForm();
    form.append("scope", "ledger.write");

    await expect(
      createSupportRequestAction(administrationIdle, form),
    ).resolves.toMatchObject({ kind: "error" });
    expect(mocks.createSupportAccessRequest).not.toHaveBeenCalled();
  });

  it("serializes a bounded support approval with its live revision", async () => {
    mocks.resolveSupportAccessRequest.mockResolvedValue({
      outcome: "approved",
      resourceId: grantId,
      revision: 2,
      status: "active",
    });
    const form = baseForm("resolve-support");
    form.set("requestId", requestId);
    form.set("expectedRevision", "2");
    form.set("supportAction", "approve");
    form.set("reason", "Approve the minimum scopes for investigation.");
    form.set("expiresAt", futureIso(30 * 60_000));
    form.append("scope", "members.summary.read");

    await expect(
      resolveSupportRequestAction(administrationIdle, form),
    ).resolves.toMatchObject({ kind: "success" });
    expect(mocks.resolveSupportAccessRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        clientOrganizationId: organizationId,
        requestId,
        expectedRevision: 2,
        action: "approve",
        approvedScopes: ["members.summary.read"],
      }),
    );
  });

  it("records support use only after the operator explicitly opens the workspace", async () => {
    mocks.getSupportWorkspace.mockResolvedValue(supportWorkspace());
    const form = baseForm("open-support");
    form.set("grantId", grantId);

    const result = await openSupportWorkspaceAction(administrationIdle, form);

    expect(result).toMatchObject({
      kind: "success",
      supportWorkspace: expect.objectContaining({
        grant: expect.objectContaining({ id: grantId }),
      }),
    });
    expect(mocks.getSupportWorkspace).toHaveBeenCalledOnce();
    expect(mocks.getSupportWorkspace).toHaveBeenCalledWith(grantId);
  });

  it("does not trust a browser AAL claim when starting break-glass recovery", async () => {
    mocks.startOrganizationBreakGlass.mockRejectedValue({ code: "42501" });
    const form = baseForm("start-break-glass");
    form.set("reason", "Recover organization administration after lockout.");
    form.set("assuranceLevel", "aal2");

    const result = await startBreakGlassAction(administrationIdle, form);

    expect(result).toMatchObject({ kind: "error" });
    expect(result.message).toMatch(/Live membership/u);
    expect(mocks.startOrganizationBreakGlass).toHaveBeenCalledWith(
      expect.not.objectContaining({ assuranceLevel: expect.anything() }),
    );
  });

  it("validates exact ledger balance evidence before returning an export", async () => {
    mocks.getOrganizationAdministrationExport.mockResolvedValue({
      ...administrationExport(),
      ledger: {
        ...administrationExport().ledger,
        netAmount: "1",
        balanced: true,
      },
    });
    const form = baseForm("export-administration");
    form.set("breakGlassSessionId", sessionId);

    const result = await exportOrganizationAdministrationAction(
      administrationIdle,
      form,
    );

    expect(result).toMatchObject({
      kind: "error",
      exportDocument: null,
    });
  });

  it("binds deletion to the active recovery session and lifecycle revision", async () => {
    mocks.updateOrganizationDeletion.mockResolvedValue({
      outcome: "requested",
      resourceId: requestId,
      revision: 4,
      status: "cooling",
    });
    const form = baseForm("deletion-request");
    form.set("breakGlassSessionId", sessionId);
    form.set("expectedRevision", "3");
    form.set("deletionAction", "request");
    form.set(
      "reason",
      "Contract ended after the verified administration export.",
    );

    await expect(
      updateOrganizationDeletionAction(administrationIdle, form),
    ).resolves.toMatchObject({ kind: "success" });
    expect(mocks.updateOrganizationDeletion).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        breakGlassSessionId: sessionId,
        caseId: null,
        expectedRevision: 3,
        action: "request",
      }),
    );
  });
});

function baseForm(confirmation: string): FormData {
  const form = new FormData();
  form.set("organizationId", organizationId);
  form.set("operationId", operationId);
  form.set("confirmation", confirmation);
  return form;
}

function agencyInvitationForm(): FormData {
  const form = baseForm("create-agency-invitation");
  form.set("agencyLabel", "Starfiniti operations");
  form.set("expiresAt", futureIso(86_400_000));
  form.set("invitationToken", invitationToken);
  return form;
}

function supportRequestForm(): FormData {
  const form = baseForm("request-support");
  form.set("clientOrganizationId", clientOrganizationId);
  form.set("expiresAt", futureIso(30 * 60_000));
  form.set("reason", "Investigate the merchant identity health incident.");
  return form;
}

function futureIso(offset: number): string {
  return new Date(Date.now() + offset).toISOString();
}

function supportWorkspace() {
  return {
    schemaVersion: "1",
    grant: {
      id: grantId,
      scopes: ["organization.summary.read"],
      expiresAt: futureIso(30 * 60_000),
    },
    organization: {
      id: clientOrganizationId,
      name: "Pilot merchant",
      status: "active",
      workspaceCount: 1,
      programmeGroupCount: 1,
    },
    members: null,
    identityHealth: null,
    recentAudit: null,
    use: { id: requestId, recordedAt: new Date().toISOString() },
  };
}

function administrationExport() {
  return {
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    organization: {
      id: organizationId,
      name: "Pilot merchant",
      slug: "pilot-merchant",
      status: "active",
      lifecycleRevision: 3,
      offboardedAt: null,
    },
    resources: {
      workspaces: 1,
      programmeGroups: 1,
      programmes: 1,
      customers: 2,
      wallets: 2,
      memberships: 1,
      auditEvents: 9,
    },
    credentials: {
      activeCommerceConnections: 0,
      activeServiceAccounts: 0,
      enabledFederationSources: 0,
      activeScimEndpoints: 0,
      activeSupportGrants: 0,
      activeNotificationEndpoints: 0,
    },
    ledger: { transactions: 4, entries: 8, netAmount: "0", balanced: true },
    immutableEvidenceRetained: true,
  };
}
