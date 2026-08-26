import { describe, expect, it } from "vitest";
import {
  acceptAgencyInvitationCommandV1,
  agencyPortfolioWorkspaceV1,
  createAgencyInvitationCommandV1,
  createSupportAccessRequestCommandV1,
  organizationAdministrationExportV1,
  organizationDeletionCommandV1,
  organizationRecoveryWorkspaceV1,
  resolveSupportAccessRequestCommandV1,
  supportWorkspaceV1,
} from "./enterprise-administration";

const organizationId = "bf2247d8-893e-49ae-8363-8423928e9cc1";
const agencyId = "bf2247d8-893e-49ae-8363-8423928e9cc2";
const correlationId = "bf2247d8-893e-49ae-8363-8423928e9cc3";
const scopes = ["audit.summary.read", "organization.summary.read"] as const;

describe("enterprise administration contracts", () => {
  it("binds a one-use agency invitation to a digest and exact client", () => {
    expect(
      createAgencyInvitationCommandV1.safeParse({
        version: "1",
        clientOrganizationId: organizationId,
        agencyLabel: "Starfiniti operations",
        expiresAt: "2026-08-27T20:00:00.000Z",
        tokenSha256: "a".repeat(64),
        idempotencyKey: "agency:invite:case-1",
        correlationId,
      }).success,
    ).toBe(true);
    expect(
      acceptAgencyInvitationCommandV1.safeParse({
        version: "1",
        agencyOrganizationId: agencyId,
        tokenSha256: "a".repeat(64),
        idempotencyKey: "agency:accept:case-1",
        correlationId,
        clientOrganizationId: organizationId,
      }).success,
    ).toBe(false);
  });

  it("keeps portfolio projections identity and tenant-data free", () => {
    const document = {
      schemaVersion: "1",
      organization: { id: agencyId, name: "Starfiniti" },
      mayInviteAgency: false,
      mayAcceptAgency: true,
      mayRequestSupport: true,
      invitations: [],
      relationships: [
        {
          id: correlationId,
          perspective: "agency",
          counterpart: { id: organizationId, name: "Pilot merchant" },
          status: "active",
          revision: 1,
          acceptedAt: "2026-08-26T19:00:00.000Z",
          revokedAt: null,
        },
      ],
    } as const;
    expect(agencyPortfolioWorkspaceV1.safeParse(document).success).toBe(true);
    expect(
      agencyPortfolioWorkspaceV1.safeParse({
        ...document,
        relationships: [
          { ...document.relationships[0], customers: [{ email: "x@y.test" }] },
        ],
      }).success,
    ).toBe(false);
  });

  it("requires canonical exact read-only support scopes", () => {
    const request = {
      version: "1",
      agencyOrganizationId: agencyId,
      clientOrganizationId: organizationId,
      scopes,
      reason: "Investigate SSO provisioning health.",
      requestedExpiresAt: "2026-08-26T22:00:00.000Z",
      idempotencyKey: "support:request:case-1",
      correlationId,
    } as const;
    expect(createSupportAccessRequestCommandV1.safeParse(request).success).toBe(
      true,
    );
    expect(
      createSupportAccessRequestCommandV1.safeParse({
        ...request,
        scopes: ["organization.summary.read", "audit.summary.read"],
      }).success,
    ).toBe(false);
    expect(
      createSupportAccessRequestCommandV1.safeParse({
        ...request,
        scopes: ["ledger.write"],
      }).success,
    ).toBe(false);
  });

  it("makes support approval payloads unambiguous", () => {
    const approval = {
      version: "1",
      clientOrganizationId: organizationId,
      requestId: agencyId,
      expectedRevision: 1,
      action: "approve",
      approvedScopes: scopes,
      expiresAt: "2026-08-26T22:00:00.000Z",
      reason: "Approved for a bounded SSO investigation.",
      idempotencyKey: "support:approve:case-1",
      correlationId,
    } as const;
    expect(
      resolveSupportAccessRequestCommandV1.safeParse(approval).success,
    ).toBe(true);
    expect(
      resolveSupportAccessRequestCommandV1.safeParse({
        ...approval,
        action: "reject",
      }).success,
    ).toBe(false);
  });

  it("rejects support documents containing identity or customer data", () => {
    const document = {
      schemaVersion: "1",
      grant: {
        id: agencyId,
        scopes,
        expiresAt: "2026-08-26T22:00:00.000Z",
      },
      organization: {
        id: organizationId,
        name: "Pilot merchant",
        status: "active",
        workspaceCount: 1,
        programmeGroupCount: 1,
      },
      members: null,
      identityHealth: null,
      recentAudit: [],
      use: {
        id: correlationId,
        recordedAt: "2026-08-26T20:00:00.000Z",
      },
    } as const;
    expect(supportWorkspaceV1.safeParse(document).success).toBe(true);
    expect(
      supportWorkspaceV1.safeParse({
        ...document,
        customers: [{ email: "customer@example.test" }],
      }).success,
    ).toBe(false);
  });

  it("binds deletion cases to cooling-state revisions", () => {
    const request = {
      version: "1",
      organizationId,
      breakGlassSessionId: agencyId,
      caseId: null,
      expectedRevision: 3,
      action: "request",
      reason: "Contract ended and export was verified.",
      idempotencyKey: "organization:delete:request:case-1",
      correlationId,
    } as const;
    expect(organizationDeletionCommandV1.safeParse(request).success).toBe(true);
    expect(
      organizationDeletionCommandV1.safeParse({
        ...request,
        action: "complete",
      }).success,
    ).toBe(false);
  });

  it("requires exact zero-sum ledger evidence in an administration export", () => {
    const document = {
      schemaVersion: "1",
      generatedAt: "2026-08-26T20:00:00.000Z",
      organization: {
        id: organizationId,
        name: "Pilot merchant",
        slug: "pilot-merchant",
        status: "closed",
        lifecycleRevision: 3,
        offboardedAt: "2026-08-26T19:00:00.000Z",
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
    } as const;
    expect(organizationAdministrationExportV1.safeParse(document).success).toBe(
      true,
    );
    expect(
      organizationAdministrationExportV1.safeParse({
        ...document,
        ledger: { ...document.ledger, netAmount: "1" },
      }).success,
    ).toBe(false);
  });

  it("takes deletion cooling readiness only from the server projection", () => {
    const workspace = {
      schemaVersion: "1",
      organization: {
        id: organizationId,
        name: "Pilot merchant",
        status: "closed",
        lifecycleRevision: 3,
        offboardedAt: "2026-08-26T20:00:00.000Z",
        deletionCompletedAt: null,
      },
      assuranceLevel: "aal2",
      hasLiveAuthSession: true,
      mayStartBreakGlass: true,
      sessions: [],
      deletionCase: {
        id: agencyId,
        status: "cooling",
        revision: 1,
        completionAvailable: false,
        dueAt: "2026-09-02T20:00:00.000Z",
        createdAt: "2026-08-26T20:00:00.000Z",
        cancelledAt: null,
        completedAt: null,
      },
    } as const;
    expect(organizationRecoveryWorkspaceV1.safeParse(workspace).success).toBe(
      true,
    );
    const { completionAvailable: _omitted, ...untrustedCase } =
      workspace.deletionCase;
    expect(
      organizationRecoveryWorkspaceV1.safeParse({
        ...workspace,
        deletionCase: untrustedCase,
      }).success,
    ).toBe(false);
  });
});
